import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { runWithRequestContext } from '@/lib/server/request-context';

const log = createLogger('Notebook Metadata API');

export const maxDuration = 120;

type RequestBody = {
  requirements?: {
    requirement?: string;
    language?: 'zh-CN' | 'en-US';
    webSearch?: boolean;
  };
  pdfText?: string;
  courseContext?: {
    name?: string;
    description?: string;
    tags?: string[];
    purpose?: 'research' | 'university' | 'daily';
    university?: string;
    courseCode?: string;
    language?: 'zh-CN' | 'en-US';
  };
};

type ParsedMeta = {
  name?: string;
  tags?: string[];
  includes?: string[];
  excludes?: string[];
};

function stripCodeFences(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return cleaned.trim();
}

function toSafeList(arr: unknown, maxCount: number): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter(Boolean)
    .slice(0, maxCount);
}

function sanitizeTags(arr: unknown): string[] {
  const list = toSafeList(arr, 8).map((tag) => tag.replace(/^#/, '').slice(0, 24));
  return Array.from(new Set(list));
}

function formatDescription(language: 'zh-CN' | 'en-US', includes: string[], excludes: string[]): string {
  if (language === 'en-US') {
    const inc = includes.length ? includes.join(' / ') : 'Core topic overview';
    const exc = excludes.length
      ? excludes.join(' / ')
      : 'No external deep dives beyond stated requirements';
    return `Includes: ${inc}. Not included: ${exc}.`;
  }
  const inc = includes.length ? includes.join('、') : '核心主题概览';
  const exc = excludes.length ? excludes.join('、') : '不扩展到需求之外的外部深挖内容';
  return `包含：${inc}。不包含：${exc}。`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RequestBody;
    const requirement = body.requirements?.requirement?.trim();
    const language = body.requirements?.language || 'zh-CN';
    const webSearch = Boolean(body.requirements?.webSearch);
    const pdfText = (body.pdfText || '').trim();
    const courseContext = body.courseContext;

    if (!requirement) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'requirements.requirement is required');
    }

    const { model, modelString } = await resolveModelFromHeaders(req, {
      allowOpenAIModelOverride: true,
    });
    const pdfHint = pdfText ? pdfText.slice(0, 4000) : '';

    const systemPrompt =
      'You are an expert curriculum planner. Return ONLY strict JSON. No markdown.';
    const userPrompt = `Generate notebook metadata for a learning notebook.

User requirement:
${requirement}

Language: ${language}
Web search enabled: ${webSearch ? 'yes' : 'no'}
${pdfHint ? `PDF context snippet:\n${pdfHint}\n` : ''}
${courseContext ? `Course context:
- name: ${courseContext.name || ''}
- description: ${courseContext.description || ''}
- tags: ${(courseContext.tags || []).join(', ')}
- purpose: ${courseContext.purpose || ''}
- university: ${courseContext.university || ''}
- courseCode: ${courseContext.courseCode || ''}
- language: ${courseContext.language || ''}
` : ''}

Return JSON with exactly this shape:
{
  "name": "string, concise notebook title",
  "tags": ["string", "string"],
  "includes": ["what is covered", "what is covered"],
  "excludes": ["what is explicitly out of scope", "what is explicitly out of scope"]
}

Rules:
- name: <= 28 chars in Chinese or <= 60 chars in English, specific and useful
- tags: 3-6 concise tags, no hashtags
- Prefer reusing/aligning with course tags when they are relevant
- includes: 2-4 clear items
- excludes: 2-4 clear items
- Must align with requirement; do not invent unrelated scope`;

    log.info(`Generating notebook metadata [model=${modelString}]`);
    const result = await runWithRequestContext(
      req,
      '/api/generate/notebook-metadata',
      () =>
        callLLM(
          {
            model,
            system: systemPrompt,
            prompt: userPrompt,
          },
          'notebook-metadata',
        ),
      {
        courseName: courseContext?.name?.trim() || undefined,
        operationCode: 'notebook_metadata_generation',
        chargeReason: '生成笔记本标题与简介',
      },
    );

    let parsed: ParsedMeta;
    try {
      parsed = JSON.parse(stripCodeFences(result.text));
    } catch {
      return apiError('PARSE_FAILED', 500, 'Failed to parse notebook metadata response');
    }

    const nameRaw = (parsed.name || '').trim();
    const name =
      nameRaw.slice(0, language === 'zh-CN' ? 28 : 60) ||
      (language === 'zh-CN' ? '未命名笔记本' : 'Untitled Notebook');
    const tags = sanitizeTags(parsed.tags);
    const includes = toSafeList(parsed.includes, 4);
    const excludes = toSafeList(parsed.excludes, 4);
    const description = formatDescription(language, includes, excludes);

    return apiSuccess({
      name,
      description,
      tags,
      includes,
      excludes,
    });
  } catch (error) {
    log.error('Notebook metadata generation error:', error);
    return apiError('INTERNAL_ERROR', 500, error instanceof Error ? error.message : String(error));
  }
}
