import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { FormData as UndiciFormData } from 'undici';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { resolveOpenAIResponsesModelFromHeaders } from '@/lib/server/resolve-model';
import { parsePDF } from '@/lib/pdf/pdf-providers';
import type { PDFProviderId } from '@/lib/pdf/types';
import { parsePptxBuffer } from '@/lib/ppt/pptx-parser';
import { resolvePDFApiKey, resolvePDFBaseUrl } from '@/lib/server/provider-config';
import { getSystemLLMRuntimeConfig } from '@/lib/server/system-llm-config';
import { proxyFetch, proxyRequest } from '@/lib/server/proxy-fetch';
import { createLogger } from '@/lib/logger';
import {
  ingestCourseSourceUpload,
  prepareSourceCoverPrompt,
  prepareSourceMarkdownNotebook,
  type SourceUploadKind,
} from '@/features/memory/server/source-upload-ingestion';

const MAX_SOURCE_FILE_BYTES = 50 * 1024 * 1024;
const OPENAI_FILE_UPLOAD_MIN_TIMEOUT_MS = 90_000;
const OPENAI_FILE_UPLOAD_MAX_TIMEOUT_MS = 300_000;
const OPENAI_MULTIPART_UPLOAD_THRESHOLD_BYTES = 8 * 1024 * 1024;
const OPENAI_UPLOAD_PART_BYTES = 4 * 1024 * 1024;
const OPENAI_UPLOAD_STEP_TIMEOUT_MS = 120_000;
const OPENAI_FILE_INPUT_READY_TIMEOUT_MS = 15_000;
const OPENAI_FILE_INPUT_MIN_AGE_MS = 4_000;
const log = createLogger('CourseSourceIngest');

const sourceUploadSchema = z.object({
  sourceTitle: z.string().trim().min(1).max(240),
  sourceKind: z
    .enum(['pdf', 'markdown', 'plain_text', 'pptx', 'problem_bank', 'other'])
    .default('plain_text'),
  sourceFileMime: z.string().trim().max(160).optional(),
  targetNotebookId: z.string().trim().min(1).optional(),
  language: z.enum(['zh-CN', 'en-US']).default('zh-CN'),
  usageProfile: z.enum(['research', 'university_course', 'daily_use']).optional(),
  coverTitle: z.string().trim().max(120).optional(),
  coverCourseLabel: z.string().trim().max(80).optional(),
  coverFocus: z.string().trim().max(1200).optional(),
  outputMode: z.enum(['ingest', 'cover_prompt', 'notebook_content']).default('ingest'),
  text: z.string().trim().min(1).max(220000),
});

export type NormalizedSourceUploadPayload = {
  sourceTitle: string;
  sourceKind: SourceUploadKind;
  sourceFileMime?: string;
  targetNotebookId?: string;
  language: 'zh-CN' | 'en-US';
  usageProfile?: 'research' | 'university_course' | 'daily_use';
  coverTitle?: string;
  coverCourseLabel?: string;
  coverFocus?: string;
  outputMode: 'ingest' | 'cover_prompt' | 'notebook_content';
  text: string;
  rawFileHash?: string | null;
  openaiFileId?: string | null;
  parser?: string | null;
  pageCount?: number | null;
  slideCount?: number | null;
};

function stringFormValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function sha256Buffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function openAIFileUploadTimeoutMs(fileBytes: number): number {
  // Large multipart bodies can be buffered by a local HTTP proxy. Budget for a
  // conservative 64 KiB/s upstream rate while still keeping a hard ceiling.
  return Math.min(
    OPENAI_FILE_UPLOAD_MAX_TIMEOUT_MS,
    Math.max(
      OPENAI_FILE_UPLOAD_MIN_TIMEOUT_MS,
      30_000 + Math.ceil(fileBytes / (64 * 1024)) * 1_000,
    ),
  );
}

function isSourceKind(value: string | undefined): value is SourceUploadKind {
  return (
    value === 'pdf' ||
    value === 'markdown' ||
    value === 'plain_text' ||
    value === 'pptx' ||
    value === 'problem_bank' ||
    value === 'other'
  );
}

function inferSourceKind(file: File): SourceUploadKind {
  const lowerName = file.name.toLowerCase();
  const mime = (file.type || '').toLowerCase();
  if (mime === 'application/pdf' || lowerName.endsWith('.pdf')) return 'pdf';
  if (
    mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    lowerName.endsWith('.pptx')
  ) {
    return 'pptx';
  }
  if (mime.includes('markdown') || lowerName.endsWith('.md') || lowerName.endsWith('.markdown')) {
    return 'markdown';
  }
  if (lowerName.includes('problem') || lowerName.includes('question') || lowerName.includes('题')) {
    return 'problem_bank';
  }
  if (mime.startsWith('text/') || /\.(txt|csv|json)$/i.test(file.name)) return 'plain_text';
  return 'other';
}

async function openAIRequestJson(args: {
  url: string;
  apiKey: string;
  method: 'POST';
  body?: string | Buffer;
  contentType?: string;
  contentLength?: number;
}): Promise<Record<string, unknown>> {
  const response = await proxyRequest(args.url, {
    method: args.method,
    headers: {
      authorization: `Bearer ${args.apiKey}`,
      ...(args.contentType ? { 'content-type': args.contentType } : {}),
      ...(typeof args.contentLength === 'number'
        ? { 'content-length': String(args.contentLength) }
        : {}),
    },
    body: args.body,
    headersTimeout: OPENAI_UPLOAD_STEP_TIMEOUT_MS,
    bodyTimeout: OPENAI_UPLOAD_STEP_TIMEOUT_MS,
    signal: AbortSignal.timeout(OPENAI_UPLOAD_STEP_TIMEOUT_MS),
  });
  const responseText = await response.body.text();
  const data = (() => {
    try {
      return JSON.parse(responseText) as Record<string, unknown>;
    } catch {
      return {};
    }
  })();
  if (response.statusCode < 200 || response.statusCode >= 300) {
    const error = asRecord(data.error);
    const message = typeof error?.message === 'string' ? error.message : responseText.slice(0, 240);
    throw new Error(`OpenAI upload request failed (${response.statusCode}): ${message}`);
  }
  return data;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function openAIUploadPartBody(
  chunk: Buffer,
  partIndex: number,
): { body: Buffer; contentType: string } {
  const boundary = `----OpenMAICPart${randomBytes(12).toString('hex')}`;
  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="data"; filename="part-${String(partIndex).padStart(3, '0')}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
  );
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    body: Buffer.concat([prefix, chunk, suffix]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function uploadOpenAIUserFileInParts(args: {
  baseUrl: string;
  apiKey: string;
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}): Promise<string> {
  const created = await openAIRequestJson({
    url: `${args.baseUrl}/uploads`,
    apiKey: args.apiKey,
    method: 'POST',
    body: JSON.stringify({
      purpose: 'user_data',
      filename: args.fileName,
      bytes: args.buffer.byteLength,
      mime_type: args.mimeType || 'application/octet-stream',
    }),
    contentType: 'application/json',
  });
  const uploadId = typeof created.id === 'string' ? created.id : '';
  if (!uploadId) throw new Error('OpenAI Uploads API did not return an upload id.');

  try {
    const partIds: string[] = [];
    for (
      let offset = 0, partIndex = 0;
      offset < args.buffer.byteLength;
      offset += OPENAI_UPLOAD_PART_BYTES, partIndex += 1
    ) {
      const chunk = args.buffer.subarray(
        offset,
        Math.min(offset + OPENAI_UPLOAD_PART_BYTES, args.buffer.byteLength),
      );
      const multipart = openAIUploadPartBody(chunk, partIndex);
      const part = await openAIRequestJson({
        url: `${args.baseUrl}/uploads/${encodeURIComponent(uploadId)}/parts`,
        apiKey: args.apiKey,
        method: 'POST',
        body: multipart.body,
        contentType: multipart.contentType,
        contentLength: multipart.body.byteLength,
      });
      const partId = typeof part.id === 'string' ? part.id : '';
      if (!partId) throw new Error(`OpenAI Uploads API did not return part ${partIndex + 1}.`);
      partIds.push(partId);
      log.info('OpenAI upload part finished.', {
        uploadId,
        part: partIndex + 1,
        partBytes: chunk.byteLength,
      });
    }

    const completed = await openAIRequestJson({
      url: `${args.baseUrl}/uploads/${encodeURIComponent(uploadId)}/complete`,
      apiKey: args.apiKey,
      method: 'POST',
      body: JSON.stringify({ part_ids: partIds }),
      contentType: 'application/json',
    });
    const file = asRecord(completed.file);
    const fileId = typeof file?.id === 'string' ? file.id : '';
    if (!fileId) throw new Error('OpenAI Uploads API completed without returning a file id.');
    return fileId;
  } catch (error) {
    await openAIRequestJson({
      url: `${args.baseUrl}/uploads/${encodeURIComponent(uploadId)}/cancel`,
      apiKey: args.apiKey,
      method: 'POST',
    }).catch(() => {});
    throw error;
  }
}

async function tryUploadOpenAIUserFile(args: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}): Promise<string | null> {
  const startedAt = Date.now();
  const config = await getSystemLLMRuntimeConfig();
  if (!config.apiKey) {
    log.warn('Skipping OpenAI file upload because the system API key is missing.');
    return null;
  }
  const baseUrl = config.baseUrl?.replace(/\/+$/, '') || 'https://api.openai.com/v1';
  if (!/api\.openai\.com\/v1$/.test(baseUrl)) {
    log.warn('Skipping OpenAI file upload for a non-OpenAI base URL.', { baseUrl });
    return null;
  }

  try {
    const timeoutMs = openAIFileUploadTimeoutMs(args.buffer.byteLength);
    const useMultipartUpload = args.buffer.byteLength > OPENAI_MULTIPART_UPLOAD_THRESHOLD_BYTES;
    log.info(
      useMultipartUpload
        ? 'Uploading source file through OpenAI Uploads API.'
        : 'Uploading source file to OpenAI Files API.',
      {
        fileName: args.fileName,
        fileBytes: args.buffer.byteLength,
        timeoutMs,
      },
    );
    const fileId = useMultipartUpload
      ? await uploadOpenAIUserFileInParts({
          baseUrl,
          apiKey: config.apiKey,
          ...args,
        })
      : await (async () => {
          // proxyFetch uses the workspace undici package so the multipart body must
          // use that package's FormData implementation too. Node's global FormData
          // is from a different undici realm and otherwise gets serialized as
          // text/plain, which OpenAI rejects with HTTP 415.
          const formData = new UndiciFormData();
          formData.append('purpose', 'user_data');
          formData.append(
            'file',
            new Blob([new Uint8Array(args.buffer)], {
              type: args.mimeType || 'application/octet-stream',
            }),
            args.fileName,
          );
          const response = await proxyFetch(`${baseUrl}/files`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${config.apiKey}` },
            body: formData as unknown as BodyInit,
            signal: AbortSignal.timeout(timeoutMs),
          });
          const data = (await response.json().catch(() => ({}))) as { id?: unknown };
          if (!response.ok || typeof data.id !== 'string') {
            throw new Error(`OpenAI Files API upload failed (${response.status}).`);
          }
          return data.id;
        })();
    log.info('OpenAI file upload finished.', {
      strategy: useMultipartUpload ? 'uploads_api' : 'files_api',
      hasFileId: Boolean(fileId),
      durationMs: Date.now() - startedAt,
    });
    if (args.mimeType === 'application/pdf' || /\.pdf$/i.test(args.fileName)) {
      await waitForOpenAIFileInputReady({
        fileId,
        apiKey: config.apiKey,
        baseUrl,
      });
    }
    return fileId;
  } catch (error) {
    log.warn(
      'OpenAI Files API upload failed; AI file-input test modes will return this failure without fallback.',
      {
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      },
    );
    return null;
  }
}

async function waitForOpenAIFileInputReady(args: {
  fileId: string;
  apiKey: string;
  baseUrl: string;
}): Promise<void> {
  const startedAt = Date.now();
  let lastStatus = 'unknown';
  while (Date.now() - startedAt < OPENAI_FILE_INPUT_READY_TIMEOUT_MS) {
    const response = await proxyFetch(`${args.baseUrl}/files/${encodeURIComponent(args.fileId)}`, {
      headers: { Authorization: `Bearer ${args.apiKey}` },
      signal: AbortSignal.timeout(OPENAI_UPLOAD_STEP_TIMEOUT_MS),
    });
    const file = (await response.json().catch(() => ({}))) as {
      id?: unknown;
      status?: unknown;
      created_at?: unknown;
      status_details?: unknown;
    };
    if (!response.ok || file.id !== args.fileId) {
      throw new Error(
        `OpenAI Files API could not retrieve the uploaded file (${response.status}).`,
      );
    }
    lastStatus = typeof file.status === 'string' ? file.status : 'processed';
    if (lastStatus === 'error') {
      throw new Error(
        `OpenAI Files API rejected the uploaded file: ${typeof file.status_details === 'string' ? file.status_details : 'unknown error'}`,
      );
    }
    const createdAtMs =
      typeof file.created_at === 'number' && Number.isFinite(file.created_at)
        ? file.created_at * 1_000
        : startedAt;
    const oldEnoughForResponses = Date.now() - createdAtMs >= OPENAI_FILE_INPUT_MIN_AGE_MS;
    if (lastStatus === 'processed' && oldEnoughForResponses) {
      log.info('OpenAI file input is ready for the Responses API.', {
        fileId: args.fileId,
        status: lastStatus,
        ageMs: Date.now() - createdAtMs,
      });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(
    `OpenAI file did not become ready for Responses within ${OPENAI_FILE_INPUT_READY_TIMEOUT_MS}ms (last status: ${lastStatus}).`,
  );
}

async function extractSourceTextFromFile(args: {
  file: File;
  sourceKind: SourceUploadKind;
  buffer: Buffer;
  formData: FormData;
  allowClientProviderConfig?: boolean;
}): Promise<{
  text: string;
  parser: string;
  pageCount: number | null;
  slideCount: number | null;
}> {
  if (args.sourceKind === 'pdf') {
    const allowClientProviderConfig = args.allowClientProviderConfig !== false;
    const providerId = (
      allowClientProviderConfig
        ? stringFormValue(args.formData, 'pdfProviderId') ||
          stringFormValue(args.formData, 'providerId') ||
          'unpdf'
        : 'unpdf'
    ) as PDFProviderId;
    const clientApiKey = allowClientProviderConfig
      ? stringFormValue(args.formData, 'pdfApiKey') || stringFormValue(args.formData, 'apiKey')
      : undefined;
    const clientBaseUrl = allowClientProviderConfig
      ? stringFormValue(args.formData, 'pdfBaseUrl') || stringFormValue(args.formData, 'baseUrl')
      : undefined;
    const parsed = await parsePDF(
      {
        providerId,
        apiKey: clientBaseUrl ? clientApiKey || '' : resolvePDFApiKey(providerId, clientApiKey),
        baseUrl: clientBaseUrl ? clientBaseUrl : resolvePDFBaseUrl(providerId, clientBaseUrl),
      },
      args.buffer,
    );
    return {
      text: parsed.text || '',
      parser: String(parsed.metadata?.parser || providerId),
      pageCount: typeof parsed.metadata?.pageCount === 'number' ? parsed.metadata.pageCount : null,
      slideCount: null,
    };
  }

  if (args.sourceKind === 'pptx') {
    const parsed = await parsePptxBuffer({
      buffer: args.buffer,
      fileName: args.file.name,
      fileSize: args.file.size,
    });
    return {
      text: parsed.text || '',
      parser: 'pptxtojson',
      pageCount: null,
      slideCount: parsed.metadata.slideCount,
    };
  }

  return {
    text: args.buffer.toString('utf8'),
    parser: 'text',
    pageCount: null,
    slideCount: null,
  };
}

async function parseMultipartSourceUpload(
  request: NextRequest,
  options: {
    outputMode?: NormalizedSourceUploadPayload['outputMode'];
    allowClientProviderConfig?: boolean;
  } = {},
): Promise<NormalizedSourceUploadPayload | NextResponse> {
  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No source file provided' }, { status: 400 });
  }
  if (file.size <= 0) {
    return NextResponse.json({ error: 'Uploaded source file is empty' }, { status: 400 });
  }
  if (file.size > MAX_SOURCE_FILE_BYTES) {
    return NextResponse.json({ error: 'Uploaded source file is too large' }, { status: 413 });
  }

  const explicitKind = stringFormValue(formData, 'sourceKind');
  const sourceKind = isSourceKind(explicitKind) ? explicitKind : inferSourceKind(file);
  const sourceTitle = stringFormValue(formData, 'sourceTitle') || file.name;
  const languageValue = stringFormValue(formData, 'language');
  const language = languageValue === 'en-US' ? 'en-US' : 'zh-CN';
  const targetNotebookId = stringFormValue(formData, 'targetNotebookId');
  const usageProfileValue = stringFormValue(formData, 'usageProfile');
  const usageProfile =
    usageProfileValue === 'research' ||
    usageProfileValue === 'university_course' ||
    usageProfileValue === 'daily_use'
      ? usageProfileValue
      : undefined;
  const coverTitle = stringFormValue(formData, 'coverTitle');
  const coverCourseLabel = stringFormValue(formData, 'coverCourseLabel');
  const coverFocus = stringFormValue(formData, 'coverFocus');
  const outputModeValue = stringFormValue(formData, 'outputMode');
  const outputMode =
    options.outputMode ||
    (outputModeValue === 'cover_prompt' || outputModeValue === 'notebook_content'
      ? outputModeValue
      : 'ingest');
  const buffer = Buffer.from(await file.arrayBuffer());
  const rawFileHash = sha256Buffer(buffer);
  log.info('Received source upload.', {
    fileName: file.name,
    fileBytes: file.size,
    sourceKind,
  });
  const openaiFileId = await tryUploadOpenAIUserFile({
    buffer,
    fileName: file.name || sourceTitle,
    mimeType: file.type || 'application/octet-stream',
  });
  if (
    sourceKind === 'pdf' &&
    (outputMode === 'cover_prompt' || outputMode === 'notebook_content')
  ) {
    if (!openaiFileId) {
      return NextResponse.json(
        {
          error: 'OpenAI Files API upload failed. PDF AI tests do not fall back to OCR text.',
        },
        { status: 502 },
      );
    }
    return {
      sourceTitle,
      sourceKind,
      sourceFileMime: file.type || 'application/pdf',
      targetNotebookId,
      language,
      usageProfile,
      coverTitle,
      coverCourseLabel,
      coverFocus,
      outputMode,
      text: `Original PDF is attached through OpenAI Files API: ${sourceTitle}`,
      rawFileHash,
      openaiFileId,
      parser: 'openai-file-input',
      pageCount: null,
      slideCount: null,
    };
  }
  const extractionStartedAt = Date.now();
  log.info('Extracting source text.', { fileName: file.name, sourceKind });
  const extracted = await extractSourceTextFromFile({
    file,
    sourceKind,
    buffer,
    formData,
    allowClientProviderConfig: options.allowClientProviderConfig,
  });
  log.info('Source text extraction finished.', {
    fileName: file.name,
    sourceKind,
    textChars: extracted.text.length,
    durationMs: Date.now() - extractionStartedAt,
  });
  const text = extracted.text.trim();
  if (!text) {
    return NextResponse.json(
      { error: 'Uploaded source file was parsed, but no usable text was extracted' },
      { status: 400 },
    );
  }

  return {
    sourceTitle,
    sourceKind,
    sourceFileMime: file.type || undefined,
    targetNotebookId,
    language,
    usageProfile,
    coverTitle,
    coverCourseLabel,
    coverFocus,
    outputMode,
    text,
    rawFileHash,
    openaiFileId,
    parser: extracted.parser,
    pageCount: extracted.pageCount,
    slideCount: extracted.slideCount,
  };
}

export async function parseSourceUploadPayload(
  request: NextRequest,
  options: {
    outputMode?: NormalizedSourceUploadPayload['outputMode'];
    allowClientProviderConfig?: boolean;
  } = {},
): Promise<NormalizedSourceUploadPayload | NextResponse> {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    return parseMultipartSourceUpload(request, options);
  }

  const payload = sourceUploadSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: payload.error.flatten() },
      { status: 400 },
    );
  }
  return {
    sourceTitle: payload.data.sourceTitle,
    sourceKind: payload.data.sourceKind as SourceUploadKind,
    sourceFileMime: payload.data.sourceFileMime,
    targetNotebookId: payload.data.targetNotebookId,
    language: payload.data.language,
    usageProfile: payload.data.usageProfile,
    coverTitle: payload.data.coverTitle,
    coverCourseLabel: payload.data.coverCourseLabel,
    coverFocus: payload.data.coverFocus,
    outputMode: options.outputMode || payload.data.outputMode,
    text: payload.data.text,
    parser: 'legacy-json-text',
  };
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { id } = await context.params;

    const payload = await parseSourceUploadPayload(request);
    if (payload instanceof NextResponse) return payload;

    const resolved = await resolveOpenAIResponsesModelFromHeaders(request, {
      allowOpenAIModelOverride: true,
    }).catch(() => null);
    if (payload.outputMode === 'cover_prompt') {
      const preview = await prepareSourceCoverPrompt({
        sourceTitle: payload.sourceTitle,
        sourceKind: payload.sourceKind,
        sourceFileMime: payload.sourceFileMime,
        text: payload.text,
        rawFileHash: payload.rawFileHash,
        openaiFileId: payload.openaiFileId,
        parser: payload.parser,
        pageCount: payload.pageCount,
        slideCount: payload.slideCount,
        language: payload.language,
        usageProfile: payload.usageProfile,
        coverTitle: payload.coverTitle,
        coverCourseLabel: payload.coverCourseLabel,
        coverFocus: payload.coverFocus,
        model: resolved?.model,
        modelProviderId: resolved?.providerId,
      });
      return NextResponse.json({ storage: 'none', preview });
    }
    if (payload.outputMode === 'notebook_content') {
      const preview = await prepareSourceMarkdownNotebook({
        sourceTitle: payload.sourceTitle,
        sourceKind: payload.sourceKind,
        sourceFileMime: payload.sourceFileMime,
        text: payload.text,
        rawFileHash: payload.rawFileHash,
        openaiFileId: payload.openaiFileId,
        parser: payload.parser,
        pageCount: payload.pageCount,
        slideCount: payload.slideCount,
        language: payload.language,
        usageProfile: payload.usageProfile,
        model: resolved?.model,
        modelProviderId: resolved?.providerId,
      });
      return NextResponse.json({ storage: 'none', preview });
    }
    const ingestionStartedAt = Date.now();
    log.info('Starting production source ingestion.', {
      courseId: id,
      sourceTitle: payload.sourceTitle,
      sourceKind: payload.sourceKind,
      hasOpenAIFileId: Boolean(payload.openaiFileId),
    });
    const result = await ingestCourseSourceUpload({
      prisma,
      userId: auth.userId,
      courseId: id,
      sourceTitle: payload.sourceTitle,
      sourceKind: payload.sourceKind,
      sourceFileMime: payload.sourceFileMime,
      targetNotebookId: payload.targetNotebookId,
      language: payload.language,
      usageProfile: payload.usageProfile,
      text: payload.text,
      rawFileHash: payload.rawFileHash,
      openaiFileId: payload.openaiFileId,
      parser: payload.parser,
      pageCount: payload.pageCount,
      slideCount: payload.slideCount,
      model: resolved?.model,
      modelProviderId: resolved?.providerId,
    }).catch((error) => {
      const message = error instanceof Error ? error.message : 'Source ingest failed';
      if (message === 'Course not found') {
        return NextResponse.json({ error: message }, { status: 404 });
      }
      if (message === 'Uploaded source text is empty') {
        return NextResponse.json({ error: message }, { status: 400 });
      }
      throw error;
    });

    if (result instanceof NextResponse) return result;

    log.info('Production source ingestion finished.', {
      courseId: id,
      sourceTitle: payload.sourceTitle,
      aiSynthesisInput: result.source.aiSynthesisInput,
      coverStatus: result.notebookCover?.status ?? null,
      durationMs: Date.now() - ingestionStartedAt,
    });

    return NextResponse.json({
      storage: 'database',
      ingest: result,
    });
  });
}
