/**
 * Scene Content Generation API
 *
 * Generates scene content (slides/quiz/interactive/pbl) from an outline.
 * This is the first half of the two-step scene generation pipeline.
 * Does NOT generate actions — use /api/generate/scene-actions for that.
 */

import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import {
  applyOutlineFallbacks,
  generateSceneContent,
  buildVisionUserContent,
  normalizeImageFirstHeroOutlineForSceneContent,
  normalizeComputerScienceSceneOutline,
  flattenGeneratedSlideContentPages,
  normalizeNotebookSlideGenerationRoute,
  normalizeSlideGenerationRoute,
  type AgentInfo,
  type CoursePersonalizationContext,
  type SceneOutline,
  type PdfImage,
  type ImageMapping,
} from '@/features/ppt-generation/domain/scene-content';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromHeadersForNotebookStage } from '@/lib/server/resolve-model';
import { runWithRequestContext } from '@/lib/server/request-context';
import {
  OPENAI_RETAIL_MARKUP_MULTIPLIER,
  estimateOpenAITextUsageBaseCostUsd,
  estimateOpenAITextUsageRetailCostCredits,
  estimateOpenAITextUsageRetailCostUsd,
} from '@/lib/utils/openai-pricing';
import { creditsFromTokenUsage, usdFromCredits } from '@/lib/utils/credits';

const log = createLogger('Scene Content API');

export const maxDuration = 300;

const NO_CHARGE_TEST_STAGE_IDS = new Set([
  'single-page-generation-quality',
  'testfile-page-generation',
]);

type TokenUsage = {
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
  totalTokens?: number | null;
};

function shouldSkipCreditChargeForTestRequest(req: NextRequest, stageId: string): boolean {
  const testRequested =
    req.headers.get('x-generation-test-no-charge') === 'true' ||
    NO_CHARGE_TEST_STAGE_IDS.has(stageId.trim());
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

function combineTokenUsage(usages: Array<TokenUsage | undefined>): TokenUsage | undefined {
  const combined = usages.reduce<TokenUsage>(
    (acc, usage) => ({
      inputTokens: toSafeInt(acc.inputTokens) + toSafeInt(usage?.inputTokens),
      outputTokens: toSafeInt(acc.outputTokens) + toSafeInt(usage?.outputTokens),
      cachedInputTokens: toSafeInt(acc.cachedInputTokens) + toSafeInt(usage?.cachedInputTokens),
      totalTokens: toSafeInt(acc.totalTokens) + toSafeInt(usage?.totalTokens),
    }),
    { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, totalTokens: 0 },
  );
  const inferredTotal = toSafeInt(combined.inputTokens) + toSafeInt(combined.outputTokens);
  const totalTokens = toSafeInt(combined.totalTokens || inferredTotal);
  if (totalTokens <= 0) return undefined;
  return { ...combined, totalTokens };
}

function estimateSceneGenerationCost(modelString: string, usage: TokenUsage | undefined) {
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      outline: rawOutline,
      allOutlines,
      pdfImages,
      imageMapping,
      stageInfo,
      stageId,
      agents,
      slideGenerationRoute: rawSlideGenerationRoute,
    } = body as {
      outline: SceneOutline;
      allOutlines: SceneOutline[];
      pdfImages?: PdfImage[];
      imageMapping?: ImageMapping;
      stageInfo: {
        name: string;
        description?: string;
        language?: string;
        style?: string;
      };
      stageId: string;
      agents?: AgentInfo[];
      courseContext?: CoursePersonalizationContext;
      rewriteReason?: string;
      slideGenerationRoute?: unknown;
    };
    const allowLegacyCanvas = req.headers.get('x-allow-legacy-canvas') === 'true';
    const slideGenerationRoute = allowLegacyCanvas
      ? normalizeSlideGenerationRoute(rawSlideGenerationRoute)
      : normalizeNotebookSlideGenerationRoute(rawSlideGenerationRoute);

    // Validate required fields
    if (!rawOutline) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'outline is required');
    }
    if (!allOutlines || allOutlines.length === 0) {
      return apiError(
        'MISSING_REQUIRED_FIELD',
        400,
        'allOutlines is required and must not be empty',
      );
    }
    if (!stageId) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'stageId is required');
    }

    // Ensure outline has language from stageInfo (fallback for older outlines)
    const outline: SceneOutline = normalizeComputerScienceSceneOutline({
      ...rawOutline,
      language: rawOutline.language || (stageInfo?.language as 'zh-CN' | 'en-US') || 'zh-CN',
    });
    const normalizedAllOutlines = allOutlines.map((candidate) =>
      normalizeImageFirstHeroOutlineForSceneContent(
        normalizeComputerScienceSceneOutline({
          ...candidate,
          language: candidate.language || outline.language || 'zh-CN',
        }),
      ),
    );
    const skipCreditCharge = shouldSkipCreditChargeForTestRequest(req, stageId);
    const usageContext = {
      notebookId: stageId.trim(),
      notebookName: stageInfo?.name?.trim() || undefined,
      courseName: body.courseContext?.name?.trim() || undefined,
      sceneTitle: outline.title.trim() || undefined,
      sceneOrder: outline.order,
      sceneType: outline.type,
      operationCode: skipCreditCharge ? 'generation_quality_test' : 'scene_content_generation',
      chargeReason: skipCreditCharge ? '生成测试页面（免积分）' : '生成页面内容',
      skipCreditCharge,
    } as const;

    // ── Model resolution from request headers ──
    const {
      model: languageModel,
      modelInfo,
      modelString,
    } = await resolveModelFromHeadersForNotebookStage(req, 'content', {
      allowOpenAIModelOverride: true,
    });

    // Detect vision capability
    const hasVision = !!modelInfo?.capabilities?.vision;
    const llmUsages: TokenUsage[] = [];

    // Vision-aware AI call function
    const aiCall = async (
      systemPrompt: string,
      userPrompt: string,
      images?: Array<{ id: string; src: string }>,
    ): Promise<string> => {
      if (images?.length && hasVision) {
        const result = await runWithRequestContext(
          req,
          '/api/generate/scene-content',
          () =>
            callLLM(
              {
                model: languageModel,
                system: systemPrompt,
                messages: [
                  {
                    role: 'user' as const,
                    content: buildVisionUserContent(
                      userPrompt,
                      images,
                      outline.language || 'zh-CN',
                    ),
                  },
                ],
                maxOutputTokens: modelInfo?.outputWindow,
              },
              'scene-content',
            ),
          usageContext,
        );
        llmUsages.push(result.usage);
        return result.text;
      }
      const result = await runWithRequestContext(
        req,
        '/api/generate/scene-content',
        () =>
          callLLM(
            {
              model: languageModel,
              system: systemPrompt,
              prompt: userPrompt,
              maxOutputTokens: modelInfo?.outputWindow,
            },
            'scene-content',
          ),
        usageContext,
      );
      llmUsages.push(result.usage);
      return result.text;
    };

    // ── Apply fallbacks ──
    const effectiveOutline = normalizeImageFirstHeroOutlineForSceneContent(
      normalizeComputerScienceSceneOutline(applyOutlineFallbacks(outline, !!languageModel)),
    );

    // ── Filter images assigned to this outline ──
    let assignedImages: PdfImage[] | undefined;
    if (
      pdfImages &&
      pdfImages.length > 0 &&
      effectiveOutline.suggestedImageIds &&
      effectiveOutline.suggestedImageIds.length > 0
    ) {
      const suggestedIds = new Set(effectiveOutline.suggestedImageIds);
      assignedImages = pdfImages.filter((img) => suggestedIds.has(img.id));
    }

    // ── Media generation is handled client-side in parallel (media-orchestrator.ts) ──
    // The content generator receives placeholder IDs (gen_img_1, gen_vid_1) as-is.
    // resolveImageIds() in generation-pipeline.ts will keep these placeholders in elements.
    const generatedMediaMapping: ImageMapping = {};

    // ── Generate content ──
    log.info(
      `Generating content: "${effectiveOutline.title}" (${effectiveOutline.type}) [model=${modelString}] [route=${slideGenerationRoute}]`,
    );

    let content = null;
    let generationError: unknown = null;
    const generationDiagnostics = {
      pipeline: 'unknown' as 'semantic' | 'legacy' | 'interactive' | 'quiz' | 'pbl' | 'unknown',
      slideGenerationRoute,
      failureStage: undefined as string | undefined,
      failureReasons: [] as string[],
      semanticRetryCount: 0,
      layoutRetryCount: 0,
      contentFallbackUsed: false,
      fallbackKind: undefined as string | undefined,
      generatedAt: Date.now(),
    };
    try {
      content = await generateSceneContent(
        effectiveOutline,
        aiCall,
        assignedImages,
        imageMapping,
        effectiveOutline.type === 'pbl' ? languageModel : undefined,
        hasVision,
        generatedMediaMapping,
        agents,
        body.courseContext,
        body.rewriteReason,
        generationDiagnostics,
        slideGenerationRoute,
        normalizedAllOutlines,
      );
    } catch (error) {
      generationError = error;
      generationDiagnostics.failureStage =
        generationDiagnostics.failureStage ?? 'scene_content_exception';
      generationDiagnostics.failureReasons.push(
        error instanceof Error ? error.message : String(error),
      );
      log.error(`Scene content generation threw for: "${effectiveOutline.title}"`, error);
    }

    if (!content) {
      log.error(`Failed to generate content for: "${effectiveOutline.title}"`);

      return apiError(
        'GENERATION_FAILED',
        500,
        `Failed to generate content: ${effectiveOutline.title}`,
        JSON.stringify({
          error:
            generationError instanceof Error
              ? generationError.message
              : generationError
                ? String(generationError)
                : 'semantic-generation-returned-null',
          diagnostics: generationDiagnostics,
        }),
      );
    }

    log.info(`Content generated successfully: "${effectiveOutline.title}"`);

    if (effectiveOutline.type === 'slide' && 'elements' in content) {
      const flattened = flattenGeneratedSlideContentPages({
        content,
        effectiveOutline,
      });
      const usage = combineTokenUsage(llmUsages);
      return apiSuccess({
        content,
        effectiveOutline,
        contents: flattened.contents,
        effectiveOutlines: flattened.effectiveOutlines,
        generationDiagnostics,
        model: modelString,
        usage,
        costEstimate: estimateSceneGenerationCost(modelString, usage),
        skippedCreditCharge: skipCreditCharge,
      });
    }

    const usage = combineTokenUsage(llmUsages);
    return apiSuccess({
      content,
      effectiveOutline,
      generationDiagnostics,
      model: modelString,
      usage,
      costEstimate: estimateSceneGenerationCost(modelString, usage),
      skippedCreditCharge: skipCreditCharge,
    });
  } catch (error) {
    log.error('Scene content generation error:', error);
    return apiError('INTERNAL_ERROR', 500, error instanceof Error ? error.message : String(error));
  }
}
