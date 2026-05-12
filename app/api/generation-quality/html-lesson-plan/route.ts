import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { runWithRequestContext } from '@/lib/server/request-context';
import {
  OPENAI_RETAIL_MARKUP_MULTIPLIER,
  estimateOpenAITextUsageBaseCostUsd,
  estimateOpenAITextUsageRetailCostCredits,
  estimateOpenAITextUsageRetailCostUsd,
} from '@/lib/utils/openai-pricing';
import { creditsFromTokenUsage, usdFromCredits } from '@/lib/utils/credits';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type PageCountTier = 'under5' | 'under10' | 'under20' | 'over20';
type HtmlPageKind = 'intro' | 'summary' | 'process' | 'table' | 'math' | 'code' | 'example';
type DensityLevel = 'light' | 'standard' | 'dense';

type SourcePageInput = {
  sourceIndex?: number;
  title?: string;
  summary?: string;
  keyPoints?: string[];
  concreteAnchor?: string;
  suggestedPageKind?: string;
};

type RequestBody = {
  fixtureId?: string;
  fileName?: string;
  fileType?: string;
  title?: string;
  description?: string;
  sourceTextLength?: number;
  pageCountTier?: PageCountTier;
  sourcePages?: SourcePageInput[];
};

type TokenUsage = {
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
  totalTokens?: number | null;
};

type HtmlCostEstimate = {
  baseUsd: number | null;
  retailUsd: number;
  computeCredits: number;
  markupMultiplier: number | null;
  source: 'openai_pricing' | 'token_fallback';
};

type LessonSlidePlan = {
  id: string;
  order: number;
  title: string;
  pageKind: HtmlPageKind;
  density: DensityLevel;
  objective: string;
  sourceCoverage: string[];
  sourceUsage: 'direct' | 'adapted' | 'new-example' | 'synthesis';
  contentBudget: {
    visibleCharsMin: number;
    visibleCharsMax: number;
    mainRegions: number;
    blockCount: number;
    mustDeleteIfCrowded: string[];
  };
  htmlPrompt: string;
};

type LessonPlan = {
  lessonTitle: string;
  pageCountTier: PageCountTier;
  pageCount: number;
  planningNotes: string[];
  slides: LessonSlidePlan[];
};

const PAGE_KIND_SET = new Set<HtmlPageKind>([
  'intro',
  'summary',
  'process',
  'table',
  'math',
  'code',
  'example',
]);
const DENSITY_SET = new Set<DensityLevel>(['light', 'standard', 'dense']);
const SOURCE_USAGE_SET = new Set<LessonSlidePlan['sourceUsage']>([
  'direct',
  'adapted',
  'new-example',
  'synthesis',
]);

function shouldSkipCreditChargeForTestRequest(req: NextRequest): boolean {
  const testRequested = req.headers.get('x-generation-test-no-charge') === 'true';
  if (!testRequested) return false;
  return (
    process.env.NODE_ENV !== 'production' ||
    process.env.SYNTARA_ALLOW_NO_CHARGE_TEST_GENERATION === 'true'
  );
}

function toSafeInt(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.max(0, Math.round(value));
}

function estimateGenerationCost(modelString: string, usage: TokenUsage | undefined) {
  const inputTokens = toSafeInt(usage?.inputTokens);
  const outputTokens = toSafeInt(usage?.outputTokens);
  const cachedInputTokens = toSafeInt(usage?.cachedInputTokens);
  const totalTokens = toSafeInt(usage?.totalTokens ?? inputTokens + outputTokens);
  if (totalTokens <= 0 && inputTokens <= 0 && outputTokens <= 0) return null;

  const providerId = modelString.includes(':') ? modelString.split(':')[0] : undefined;
  const pricingArgs = {
    providerId,
    modelString,
    inputTokens,
    outputTokens,
    cachedInputTokens,
  };
  const baseUsd = estimateOpenAITextUsageBaseCostUsd(pricingArgs);
  const retailUsd = estimateOpenAITextUsageRetailCostUsd(pricingArgs);
  const computeCredits = estimateOpenAITextUsageRetailCostCredits(pricingArgs);
  if (baseUsd != null && retailUsd != null && computeCredits != null) {
    return {
      baseUsd,
      retailUsd,
      computeCredits,
      markupMultiplier: OPENAI_RETAIL_MARKUP_MULTIPLIER,
      source: 'openai_pricing' as const,
    };
  }

  const fallbackCredits = creditsFromTokenUsage(totalTokens);
  return {
    baseUsd: null,
    retailUsd: usdFromCredits(fallbackCredits),
    computeCredits: fallbackCredits,
    markupMultiplier: null,
    source: 'token_fallback' as const,
  };
}

function tierBounds(tier: PageCountTier): { min: number; max: number; label: string } {
  switch (tier) {
    case 'under5':
      return { min: 4, max: 5, label: '5 页以下' };
    case 'under10':
      return { min: 7, max: 10, label: '10 页以下' };
    case 'under20':
      return { min: 14, max: 20, label: '20 页以下' };
    case 'over20':
      return { min: 21, max: 24, label: '20 页以上（测试上限 24 页）' };
    default:
      return { min: 4, max: 5, label: '5 页以下' };
  }
}

function compactText(input: string | undefined, maxLength: number): string {
  const normalized = (input || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trim()}...`;
}

function compactSourcePages(sourcePages: SourcePageInput[]): SourcePageInput[] {
  return sourcePages.slice(0, 28).map((page, index) => ({
    sourceIndex: typeof page.sourceIndex === 'number' ? page.sourceIndex : index + 1,
    title: compactText(page.title, 120),
    summary: compactText(page.summary, 420),
    keyPoints: Array.isArray(page.keyPoints)
      ? page.keyPoints.slice(0, 5).map((point) => compactText(point, 220))
      : [],
    concreteAnchor: compactText(page.concreteAnchor, 700),
    suggestedPageKind: compactText(page.suggestedPageKind, 40),
  }));
}

function extractJsonObject(text: string): string {
  const withoutFence = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start < 0 || end <= start) return withoutFence;
  return withoutFence.slice(start, end + 1);
}

function toStringArray(value: unknown, max = 8): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.replace(/\s+/g, ' ').trim() : ''))
    .filter(Boolean)
    .slice(0, max);
}

function normalizePageKind(value: unknown, fallback: HtmlPageKind): HtmlPageKind {
  if (typeof value === 'string' && PAGE_KIND_SET.has(value as HtmlPageKind)) {
    return value as HtmlPageKind;
  }
  return fallback;
}

function normalizeDensity(value: unknown): DensityLevel {
  if (typeof value === 'string' && DENSITY_SET.has(value as DensityLevel)) {
    return value as DensityLevel;
  }
  return 'standard';
}

function normalizeSourceUsage(value: unknown): LessonSlidePlan['sourceUsage'] {
  if (typeof value === 'string' && SOURCE_USAGE_SET.has(value as LessonSlidePlan['sourceUsage'])) {
    return value as LessonSlidePlan['sourceUsage'];
  }
  return 'synthesis';
}

function normalizePlan(raw: unknown, tier: PageCountTier): LessonPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const rawSlides = Array.isArray(record.slides) ? record.slides : [];
  const bounds = tierBounds(tier);
  const slides = rawSlides
    .slice(0, bounds.max)
    .map((slide, index): LessonSlidePlan | null => {
      if (!slide || typeof slide !== 'object') return null;
      const item = slide as Record<string, unknown>;
      const rawBudget =
        item.contentBudget && typeof item.contentBudget === 'object'
          ? (item.contentBudget as Record<string, unknown>)
          : {};
      const title = compactText(String(item.title || `第 ${index + 1} 页`), 120);
      const htmlPrompt = typeof item.htmlPrompt === 'string' ? item.htmlPrompt.trim() : '';
      if (!htmlPrompt || htmlPrompt.length < 120) return null;
      const pageKind = normalizePageKind(item.pageKind, index === 0 ? 'intro' : 'summary');
      const density = normalizeDensity(item.density);
      const minChars = toSafeInt(rawBudget.visibleCharsMin as number | undefined);
      const maxChars = toSafeInt(rawBudget.visibleCharsMax as number | undefined);
      return {
        id: compactText(String(item.id || `slide-${index + 1}`), 80) || `slide-${index + 1}`,
        order: index + 1,
        title,
        pageKind,
        density,
        objective: compactText(String(item.objective || title), 260),
        sourceCoverage: toStringArray(item.sourceCoverage, 6),
        sourceUsage: normalizeSourceUsage(item.sourceUsage),
        contentBudget: {
          visibleCharsMin: minChars > 0 ? minChars : density === 'light' ? 70 : 110,
          visibleCharsMax: maxChars > 0 ? maxChars : density === 'dense' ? 360 : 280,
          mainRegions: Math.min(3, Math.max(1, toSafeInt(rawBudget.mainRegions as number) || 2)),
          blockCount: Math.min(8, Math.max(2, toSafeInt(rawBudget.blockCount as number) || 4)),
          mustDeleteIfCrowded: toStringArray(rawBudget.mustDeleteIfCrowded, 6),
        },
        htmlPrompt: htmlPrompt.slice(0, 5000),
      };
    })
    .filter((slide): slide is LessonSlidePlan => Boolean(slide));

  if (slides.length < bounds.min || slides.length > bounds.max) return null;

  return {
    lessonTitle: compactText(String(record.lessonTitle || 'HTML 整节课测试'), 120),
    pageCountTier: tier,
    pageCount: slides.length,
    planningNotes: toStringArray(record.planningNotes, 8),
    slides,
  };
}

function parsePlan(text: string, tier: PageCountTier): LessonPlan | null {
  try {
    return normalizePlan(JSON.parse(extractJsonObject(text)), tier);
  } catch {
    return null;
  }
}

function sourcePagesForPrompt(sourcePages: SourcePageInput[]): string {
  return compactSourcePages(sourcePages)
    .map((page) =>
      [
        `源页 ${page.sourceIndex}: ${page.title}`,
        page.summary ? `摘要：${page.summary}` : '',
        page.keyPoints?.length ? `关键点：${page.keyPoints.join('；')}` : '',
        page.concreteAnchor ? `可用素材：${page.concreteAnchor}` : '',
        page.suggestedPageKind ? `已有页型信号：${page.suggestedPageKind}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n');
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RequestBody;
    const tier = body.pageCountTier || 'under5';
    const bounds = tierBounds(tier);
    const sourcePages = Array.isArray(body.sourcePages) ? body.sourcePages : [];
    if (!body.fileName || sourcePages.length === 0) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing fileName or sourcePages');
    }

    const { model, modelInfo, modelString } = await resolveModelFromHeaders(req, {
      allowOpenAIModelOverride: true,
    });
    const skipCreditCharge = shouldSkipCreditChargeForTestRequest(req);

    const system = [
      'You are a senior curriculum planner and presentation prompt engineer.',
      'Your job is to plan an entire lesson deck from uploaded-file source material, then write the exact prompt for each slide that will be sent to a separate HTML/CSS slide generator.',
      'All visible slide content must be Simplified Chinese, except code identifiers, API names, variables, filenames, and unavoidable source terms.',
      'You must control slide capacity upstream. Do not ask a later HTML generator to fit too much content into one page.',
      'A slide prompt should describe one focused teaching move, a small amount of content, and an explicit content budget.',
      'You may adapt or replace a source example with a shorter equivalent example when that better fits the slide, but keep the same learning objective and mark sourceUsage as adapted or new-example.',
      'Do not plan lecture notes, narration, animation, or teacher actions. Only plan static editable HTML PPT slides.',
      'Return JSON only. No markdown fences, no explanation.',
    ].join('\n');

    const prompt = [
      '为下面这个 testfile 源文件规划一整节课的 HTML PPT slides。',
      '',
      `文件：${body.fileName}（${body.fileType || 'unknown'}）`,
      `文件主题：${body.title || body.fileName}`,
      `文件说明：${body.description || '-'}`,
      `源材料长度：${body.sourceTextLength || 0}`,
      `用户选择页数档位：${bounds.label}`,
      `你需要自己决定精确页数，但 slides.length 必须在 ${bounds.min}-${bounds.max} 之间。`,
      '',
      '核心目标：',
      '- 先做整节课内容分配，再给每一页写可直接发送给 HTML 生成接口的 prompt。',
      '- 每页最多 3 个主要内容区；标题区不算，底部一句结论/检查点算 1 个内容区。',
      '- 不要把一整页源文件塞进一页 PPT；如果密度过高，拆到下一页或删掉次要内容。',
      '- 页面类型要服务教学节奏：intro / summary / process / table / math / code / example。',
      '- CS/OOP 内容尤其要克制：除非必须，不要生成长代码页；用短例子、对比、状态观察代替完整教程。',
      '- 数学内容可以用外部更短例子替换源文件长例子，但不能改变要讲的定义、判定或证明动作。',
      '- 计划必须让每页视觉上可做：不要出现一页同时要代码、表格、trace、完整例题答案、前后文总结。',
      '',
      '每个 htmlPrompt 必须包含：',
      '- 明确说明“生成一张 1600×900、16:9、自包含 HTML/CSS PPT 页面”。',
      '- 第几页/总页数、页面类型、密度档、这一页唯一主教学动作。',
      '- 可见内容必须简体中文；可以保留必要英文代码标识。',
      '- 精确列出本页要出现的标题、卡片/表格/公式/代码/结论内容。',
      '- 给出容量预算：可见中文/等价字符范围、最多几个内容区、最多几个块。',
      '- 明确禁止：滚动、裁切、DOM 越界、负坐标、长讲义、无关公式、无关例题。',
      '',
      'JSON schema：',
      JSON.stringify(
        {
          lessonTitle: 'string',
          pageCountTier: tier,
          pageCount: 'number',
          planningNotes: ['string'],
          slides: [
            {
              id: 'slide-1',
              order: 1,
              title: 'string',
              pageKind: 'intro | summary | process | table | math | code | example',
              density: 'light | standard | dense',
              objective: 'string',
              sourceCoverage: ['源页编号或主题'],
              sourceUsage: 'direct | adapted | new-example | synthesis',
              contentBudget: {
                visibleCharsMin: 80,
                visibleCharsMax: 260,
                mainRegions: 2,
                blockCount: 4,
                mustDeleteIfCrowded: ['string'],
              },
              htmlPrompt: '完整、可直接发送给 HTML 生成接口的中文 prompt',
            },
          ],
        },
        null,
        2,
      ),
      '',
      '源页材料：',
      sourcePagesForPrompt(sourcePages),
    ].join('\n');

    const result = await runWithRequestContext(
      req,
      '/api/generation-quality/html-lesson-plan',
      () =>
        callLLM(
          {
            model,
            system,
            prompt,
            maxOutputTokens: Math.min(modelInfo?.outputWindow || 32000, 32000),
          },
          'html-lesson-plan-test',
          {
            retries: 1,
            validate: (text) => Boolean(parsePlan(text, tier)),
          },
        ),
      {
        operationCode: 'html_lesson_plan_test',
        chargeReason: 'HTML 整节课规划测试',
        serviceLabel: 'HTML lesson plan generation',
        skipCreditCharge,
      },
    );

    const plan = parsePlan(result.text, tier);
    if (!plan) {
      return apiError(
        'PARSE_FAILED',
        502,
        'Failed to parse lesson plan JSON',
        result.text.slice(0, 2000),
      );
    }

    const usage = result.usage as TokenUsage | undefined;
    return apiSuccess({
      plan,
      model: modelString,
      usage,
      costEstimate: estimateGenerationCost(modelString, usage) as HtmlCostEstimate | null,
      skippedCreditCharge: skipCreditCharge,
    });
  } catch (error) {
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to generate HTML lesson plan',
      error instanceof Error ? error.message : String(error),
    );
  }
}
