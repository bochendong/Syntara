import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { parsePDF } from '@/lib/pdf/pdf-providers';
import type { PDFProviderId } from '@/lib/pdf/types';
import { parsePptxBuffer } from '@/lib/ppt/pptx-parser';
import {
  resolveApiKey,
  resolveBaseUrl,
  resolvePDFApiKey,
  resolvePDFBaseUrl,
} from '@/lib/server/provider-config';
import {
  ingestCourseSourceUpload,
  type SourceUploadKind,
} from '@/features/memory/server/source-upload-ingestion';

const MAX_SOURCE_FILE_BYTES = 50 * 1024 * 1024;

const sourceUploadSchema = z.object({
  sourceTitle: z.string().trim().min(1).max(240),
  sourceKind: z
    .enum(['pdf', 'markdown', 'plain_text', 'pptx', 'problem_bank', 'other'])
    .default('plain_text'),
  sourceFileMime: z.string().trim().max(160).optional(),
  targetNotebookId: z.string().trim().min(1).optional(),
  language: z.enum(['zh-CN', 'en-US']).default('zh-CN'),
  usageProfile: z.enum(['research', 'university_course', 'daily_use']).optional(),
  text: z.string().trim().min(1).max(220000),
});

type NormalizedSourceUploadPayload = {
  sourceTitle: string;
  sourceKind: SourceUploadKind;
  sourceFileMime?: string;
  targetNotebookId?: string;
  language: 'zh-CN' | 'en-US';
  usageProfile?: 'research' | 'university_course' | 'daily_use';
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

async function tryUploadOpenAIUserFile(args: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}): Promise<string | null> {
  const apiKey = resolveApiKey('openai');
  if (!apiKey) return null;
  const configuredBaseUrl = resolveBaseUrl('openai');
  const baseUrl = configuredBaseUrl?.replace(/\/+$/, '') || 'https://api.openai.com/v1';
  if (!/api\.openai\.com\/v1$/.test(baseUrl)) return null;

  try {
    const formData = new FormData();
    formData.append('purpose', 'user_data');
    formData.append(
      'file',
      new Blob([new Uint8Array(args.buffer)], {
        type: args.mimeType || 'application/octet-stream',
      }),
      args.fileName,
    );
    const response = await fetch(`${baseUrl}/files`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });
    const data = (await response.json().catch(() => ({}))) as { id?: unknown };
    return response.ok && typeof data.id === 'string' ? data.id : null;
  } catch {
    return null;
  }
}

async function extractSourceTextFromFile(args: {
  file: File;
  sourceKind: SourceUploadKind;
  buffer: Buffer;
  formData: FormData;
}): Promise<{
  text: string;
  parser: string;
  pageCount: number | null;
  slideCount: number | null;
}> {
  if (args.sourceKind === 'pdf') {
    const providerId = (stringFormValue(args.formData, 'pdfProviderId') ||
      stringFormValue(args.formData, 'providerId') ||
      'unpdf') as PDFProviderId;
    const clientApiKey =
      stringFormValue(args.formData, 'pdfApiKey') || stringFormValue(args.formData, 'apiKey');
    const clientBaseUrl =
      stringFormValue(args.formData, 'pdfBaseUrl') || stringFormValue(args.formData, 'baseUrl');
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
  const buffer = Buffer.from(await file.arrayBuffer());
  const rawFileHash = sha256Buffer(buffer);
  const openaiFileId = await tryUploadOpenAIUserFile({
    buffer,
    fileName: file.name || sourceTitle,
    mimeType: file.type || 'application/octet-stream',
  });
  const extracted = await extractSourceTextFromFile({ file, sourceKind, buffer, formData });
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
    text,
    rawFileHash,
    openaiFileId,
    parser: extracted.parser,
    pageCount: extracted.pageCount,
    slideCount: extracted.slideCount,
  };
}

async function parseSourceUploadPayload(
  request: NextRequest,
): Promise<NormalizedSourceUploadPayload | NextResponse> {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    return parseMultipartSourceUpload(request);
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

    const resolved = await resolveModelFromHeaders(request, {
      allowOpenAIModelOverride: true,
    }).catch(() => null);
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

    return NextResponse.json({
      storage: 'database',
      ingest: result,
    });
  });
}
