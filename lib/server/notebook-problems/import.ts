import { randomUUID } from 'node:crypto';
import type { LanguageModel } from 'ai';
import { ZodError } from 'zod';
import { callLLM } from '@/lib/ai/llm';
import {
  notebookProblemImportDraftSchema,
  type NotebookProblemImportDraft,
  type NotebookProblemSource,
} from '@/lib/problem-bank';
import { estimateOpenAITextUsageRetailCostCredits } from '@/lib/utils/openai-pricing';

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function normalizeTitle(text: string): string {
  const singleLine = text.replace(/\s+/g, ' ').trim();
  return singleLine.slice(0, 80) || 'Untitled problem';
}

function inferDifficulty(text: string): 'easy' | 'medium' | 'hard' {
  if (/证明|prove|严格|递归|复杂度|hard|困难/i.test(text)) return 'hard';
  if (/计算|derive|multiple|fill in|填空|code|python/i.test(text)) return 'medium';
  return 'easy';
}

function inferType(block: string): NotebookProblemImportDraft['type'] {
  if (/```|python|def\s+\w+\s*\(|class\s+\w+\s*\(|public test|secret test|leetcode/i.test(block)) {
    return 'code';
  }
  if (/____|填空|blank/i.test(block)) return 'fill_blank';
  if (/证明|prove/i.test(block)) return 'proof';
  if (/计算|calculate|求值|求解|evaluate/i.test(block)) return 'calculation';
  if (/(?:^|\n)\s*[A-D][\.\):：]/m.test(block)) return 'choice';
  return 'short_answer';
}

function parseChoiceOptions(block: string) {
  const optionMatches = [...block.matchAll(/(?:^|\n)\s*([A-H])[\.\):：]\s*(.+)/g)];
  return optionMatches.map((match) => ({
    id: match[1],
    label: match[2].trim(),
  }));
}

function extractChoiceAnswer(block: string): string[] {
  const explicit = block.match(/(?:答案|Answer)\s*[:：]\s*([A-H](?:\s*[,，/]\s*[A-H])*)/i);
  if (!explicit) return [];
  return explicit[1]
    .split(/[,，/]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractCodeSignature(block: string): string | undefined {
  const match = block.match(/def\s+\w+\s*\([^\)]*\)/);
  return match?.[0]?.trim();
}

function extractPublicTests(block: string) {
  const tests = [
    ...block.matchAll(/(?:public test|测试用例|sample)\s*[:：]?\s*(.+?)\s*=>\s*(.+)/gi),
  ];
  return tests.map((match, index) => ({
    id: `public_${index + 1}`,
    description: `Public test ${index + 1}`,
    expression: match[1].trim(),
    expected: match[2].trim(),
  }));
}

function extractSecretTests(block: string) {
  const tests = [...block.matchAll(/(?:secret test|隐藏测试)\s*[:：]?\s*(.+?)\s*=>\s*(.+)/gi)];
  return tests.map((match, index) => ({
    id: `secret_${index + 1}`,
    description: `Secret test ${index + 1}`,
    expression: match[1].trim(),
    expected: match[2].trim(),
  }));
}

function buildHeuristicDraft(
  block: string,
  source: NotebookProblemSource,
): NotebookProblemImportDraft | null {
  const cleaned = block.trim();
  if (!cleaned) return null;

  const type = inferType(cleaned);
  const title = normalizeTitle(cleaned.split('\n')[0] || cleaned);
  const common = {
    draftId: randomUUID(),
    title,
    status: 'draft' as const,
    source,
    points: 1,
    tags: [],
    difficulty: inferDifficulty(cleaned),
    sourceMeta: {
      importMode: 'heuristic',
      rawBlock: cleaned,
    },
    validationErrors: [] as string[],
  };

  if (type === 'choice') {
    const options = parseChoiceOptions(cleaned);
    const correctOptionIds = extractChoiceAnswer(cleaned);
    return notebookProblemImportDraftSchema.parse({
      ...common,
      type,
      publicContent: {
        type,
        stem: cleaned.replace(/(?:^|\n)\s*[A-H][\.\):：].+/g, '').trim(),
        selectionMode: correctOptionIds.length > 1 ? 'multiple' : 'single',
        options,
      },
      grading: {
        type,
        correctOptionIds,
      },
      validationErrors: [
        ...(options.length < 2 ? ['未识别到足够的选项'] : []),
        ...(correctOptionIds.length === 0 ? ['未识别到正确答案'] : []),
      ],
    });
  }

  if (type === 'proof') {
    return notebookProblemImportDraftSchema.parse({
      ...common,
      type,
      publicContent: {
        type,
        stem: cleaned,
      },
      grading: {
        type,
      },
    });
  }

  if (type === 'calculation') {
    return notebookProblemImportDraftSchema.parse({
      ...common,
      type,
      publicContent: {
        type,
        stem: cleaned,
      },
      grading: {
        type,
        acceptedForms: [],
      },
      validationErrors: ['需补充 accepted answer 或 tolerance'],
    });
  }

  if (type === 'fill_blank') {
    const blanks = [...cleaned.matchAll(/_{3,}/g)].map((_, index) => ({
      id: `blank_${index + 1}`,
      placeholder: `Blank ${index + 1}`,
    }));
    return notebookProblemImportDraftSchema.parse({
      ...common,
      type,
      publicContent: {
        type,
        stemTemplate: cleaned,
        blanks,
      },
      grading: {
        type,
        blanks: blanks.map((blank) => ({
          id: blank.id,
          acceptedAnswers: [],
          caseSensitive: false,
        })),
      },
      validationErrors: ['需补充每个空的 accepted answers'],
    });
  }

  if (type === 'code') {
    const publicTests = extractPublicTests(cleaned);
    const secretTests = extractSecretTests(cleaned);
    return notebookProblemImportDraftSchema.parse({
      ...common,
      type,
      publicContent: {
        type,
        stem: cleaned,
        language: 'python',
        starterCode: undefined,
        functionSignature: extractCodeSignature(cleaned),
        constraints: [],
        publicTests,
        sampleIO: [],
        secretConfigPresent: secretTests.length > 0,
      },
      grading: {
        type,
        publishRequirementsMet:
          Boolean(extractCodeSignature(cleaned)) &&
          publicTests.length > 0 &&
          secretTests.length > 0,
      },
      secretJudge:
        secretTests.length > 0
          ? {
              language: 'python',
              secretTests,
              timeoutMs: 5000,
            }
          : undefined,
      validationErrors: [
        ...(extractCodeSignature(cleaned) ? [] : ['缺少 function signature']),
        ...(publicTests.length > 0 ? [] : ['缺少 public tests']),
        ...(secretTests.length > 0 ? [] : ['缺少 secret tests']),
      ],
    });
  }

  return notebookProblemImportDraftSchema.parse({
    ...common,
    type: 'short_answer',
    publicContent: {
      type: 'short_answer',
      stem: cleaned,
    },
    grading: {
      type: 'short_answer',
    },
  });
}

function heuristicExtractProblemDrafts(
  text: string,
  source: NotebookProblemSource,
): NotebookProblemImportDraft[] {
  const blocks = text
    .split(
      /\n(?=(?:\d+[\.\)]\s+|Q\d+[:.]|Question\s+\d+|题目\s*\d+|题\s*\d+[：:]|选择题|证明题|代码题|填空题|简答题|计算题))/,
    )
    .map((block) => block.trim())
    .filter(Boolean);
  const candidates = blocks.length > 0 ? blocks : [text.trim()];
  return candidates
    .map((block) => buildHeuristicDraft(block, source))
    .filter(Boolean) as NotebookProblemImportDraft[];
}

function normalizeRubricValue(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .map((item, index) => `${index + 1}. ${item}`)
    .join('\n');
}

function normalizeRawCandidate(
  raw: unknown,
  source: NotebookProblemSource,
): Record<string, unknown> {
  const base =
    typeof raw === 'object' && raw
      ? ({ ...raw } as Record<string, unknown>)
      : ({ title: String(raw ?? '') } as Record<string, unknown>);
  const type = typeof base.type === 'string' ? base.type : 'short_answer';

  const publicContent =
    typeof base.publicContent === 'object' && base.publicContent
      ? ({ ...(base.publicContent as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  publicContent.type = type;

  const grading =
    typeof base.grading === 'object' && base.grading
      ? ({ ...(base.grading as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  grading.type = type;

  if (
    publicContent.stem == null &&
    typeof base.stem === 'string' &&
    (type === 'short_answer' ||
      type === 'choice' ||
      type === 'proof' ||
      type === 'calculation' ||
      type === 'code')
  ) {
    publicContent.stem = base.stem;
  }

  if (
    publicContent.stemTemplate == null &&
    typeof base.stemTemplate === 'string' &&
    type === 'fill_blank'
  ) {
    publicContent.stemTemplate = base.stemTemplate;
  }

  if (Array.isArray(grading.rubric)) {
    grading.rubric = normalizeRubricValue(grading.rubric);
  }

  if (type === 'short_answer' || type === 'calculation') {
    if (
      grading.referenceAnswer == null &&
      typeof (grading as { sampleAnswer?: unknown }).sampleAnswer === 'string'
    ) {
      grading.referenceAnswer = (grading as { sampleAnswer: string }).sampleAnswer;
    }
  }

  if (type === 'proof') {
    if (
      grading.referenceProof == null &&
      typeof (grading as { sampleAnswer?: unknown }).sampleAnswer === 'string'
    ) {
      grading.referenceProof = (grading as { sampleAnswer: string }).sampleAnswer;
    }
  }

  if (type === 'short_answer' || type === 'proof') {
    if (
      publicContent.explanation == null &&
      typeof grading.analysis === 'string' &&
      grading.analysis.trim()
    ) {
      publicContent.explanation = grading.analysis;
    }
  }

  return {
    source,
    draftId: randomUUID(),
    status: 'draft',
    points: 1,
    tags: [],
    difficulty: 'medium',
    sourceMeta: {},
    validationErrors: [],
    ...base,
    publicContent,
    grading,
  };
}

function formatImportValidationIssues(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'draft';
    if (issue.message === 'Invalid input') {
      return `字段 ${path} 结构不符合当前题型 schema`;
    }
    return `字段 ${path}: ${issue.message}`;
  });
}

function normalizeCandidateDraft(
  raw: unknown,
  source: NotebookProblemSource,
): NotebookProblemImportDraft {
  const parsed = notebookProblemImportDraftSchema.safeParse(normalizeRawCandidate(raw, source));
  if (parsed.success) return parsed.data;

  const fallbackText =
    typeof raw === 'string'
      ? raw
      : typeof raw === 'object' && raw && 'title' in raw
        ? String((raw as { title?: unknown }).title || '')
        : JSON.stringify(raw);

  return notebookProblemImportDraftSchema.parse({
    draftId: randomUUID(),
    title: normalizeTitle(fallbackText || 'Imported problem'),
    type: 'short_answer',
    status: 'draft',
    source,
    points: 1,
    tags: [],
    difficulty: inferDifficulty(fallbackText),
    publicContent: {
      type: 'short_answer',
      stem: fallbackText || 'Imported problem',
    },
    grading: {
      type: 'short_answer',
    },
    sourceMeta: {
      importMode: 'fallback',
      raw,
    },
    validationErrors: formatImportValidationIssues(parsed.error),
  });
}

async function llmExtractProblemDrafts(args: {
  text: string;
  source: NotebookProblemSource;
  model: LanguageModel;
  language: 'zh-CN' | 'en-US';
}): Promise<{
  drafts: NotebookProblemImportDraft[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    estimatedCostCredits: number | null;
  } | null;
}> {
  const system =
    args.language === 'zh-CN'
      ? `你是大学课程题库抽取助手。请把输入材料拆成一组题目草稿，并返回严格 JSON 数组，不要返回 markdown。
每个数组元素都必须尽量贴近以下结构：
{
  "title": string,
  "type": "short_answer" | "choice" | "proof" | "calculation" | "code" | "fill_blank",
  "points": number,
  "difficulty": "easy" | "medium" | "hard",
  "tags": string[],
  "publicContent": {...},
  "grading": {...},
  "secretJudge": {...optional...},
  "validationErrors": string[]
}
要求：
- 尽量把题目拆细，一题一个对象
- choice 题必须拆出 options 与 correctOptionIds
- code 题默认 language=python
- 如果 code 题缺少 function signature / public tests / secret tests，也要保留，但写入 validationErrors
- 不要臆造过多答案；拿不准就留空并写 validationErrors`
      : `You are a university problem-bank extraction assistant. Convert the source material into an array of problem drafts and return strict JSON only.
Each item should follow this shape as closely as possible:
{
  "title": string,
  "type": "short_answer" | "choice" | "proof" | "calculation" | "code" | "fill_blank",
  "points": number,
  "difficulty": "easy" | "medium" | "hard",
  "tags": string[],
  "publicContent": {...},
  "grading": {...},
  "secretJudge": {...optional...},
  "validationErrors": string[]
}
Requirements:
- split into one object per problem when possible
- choice problems must include options and correctOptionIds
- code problems default to python
- if code problems miss function signature / public tests / secret tests, keep them as drafts and add validationErrors
- avoid inventing answers; leave fields empty and record validationErrors instead`;

  const prompt = `${args.language === 'zh-CN' ? '来源类型' : 'Source'}: ${args.source}

${args.language === 'zh-CN' ? '原始材料' : 'Raw material'}:
${args.text}`.slice(0, 24000);

  const result = await callLLM(
    {
      model: args.model,
      system,
      prompt,
    },
    'problem-bank-import-preview',
  );
  const raw = stripCodeFences(result.text);
  const parsed = JSON.parse(raw) as unknown[];
  if (!Array.isArray(parsed)) {
    throw new Error('LLM import output is not an array');
  }
  const inputTokens = result.usage.inputTokens ?? 0;
  const outputTokens = result.usage.outputTokens ?? 0;
  const cachedInputTokens = result.usage.cachedInputTokens ?? 0;
  return {
    drafts: parsed.map((item) => normalizeCandidateDraft(item, args.source)),
    usage:
      inputTokens > 0 || outputTokens > 0
        ? {
            inputTokens,
            outputTokens,
            cachedInputTokens,
            estimatedCostCredits: estimateOpenAITextUsageRetailCostCredits({
              modelString:
                typeof args.model === 'object' && 'modelId' in args.model
                  ? String((args.model as { modelId?: unknown }).modelId ?? '')
                  : undefined,
              inputTokens,
              outputTokens,
              cachedInputTokens,
            }),
          }
        : null,
  };
}

export async function extractProblemDraftsFromText(args: {
  text: string;
  source: NotebookProblemSource;
  language: 'zh-CN' | 'en-US';
  model?: LanguageModel;
}): Promise<{
  drafts: NotebookProblemImportDraft[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    estimatedCostCredits: number | null;
  } | null;
}> {
  const trimmed = args.text.trim();
  if (!trimmed) return { drafts: [], usage: null };

  if (args.model) {
    try {
      const llmResult = await llmExtractProblemDrafts({
        text: trimmed,
        source: args.source,
        model: args.model,
        language: args.language,
      });
      if (llmResult.drafts.length > 0) {
        return llmResult;
      }
    } catch {
      // fall back to heuristic extraction below
    }
  }

  return {
    drafts: heuristicExtractProblemDrafts(trimmed, args.source),
    usage: null,
  };
}
