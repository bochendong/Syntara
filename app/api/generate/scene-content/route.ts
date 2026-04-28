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
} from '@/lib/generation/generation-pipeline';
import { flattenGeneratedSlideContentPages } from '@/lib/generation/continuation-pages';
import type { AgentInfo } from '@/lib/generation/generation-pipeline';
import type { CoursePersonalizationContext } from '@/lib/generation/generation-pipeline';
import type { SceneOutline, PdfImage, ImageMapping } from '@/lib/types/generation';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromHeadersForNotebookStage } from '@/lib/server/resolve-model';
import { runWithRequestContext } from '@/lib/server/request-context';
import { normalizeSlideGenerationRoute } from '@/lib/generation/slide-generation-route';

const log = createLogger('Scene Content API');

export const maxDuration = 300;

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
    const slideGenerationRoute = normalizeSlideGenerationRoute(rawSlideGenerationRoute);

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
    const outline: SceneOutline = {
      ...rawOutline,
      language: rawOutline.language || (stageInfo?.language as 'zh-CN' | 'en-US') || 'zh-CN',
    };
    const usageContext = {
      notebookId: stageId.trim(),
      notebookName: stageInfo?.name?.trim() || undefined,
      courseName: body.courseContext?.name?.trim() || undefined,
      sceneTitle: outline.title.trim() || undefined,
      sceneOrder: outline.order,
      sceneType: outline.type,
      operationCode: 'scene_content_generation',
      chargeReason: '生成页面内容',
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
      return result.text;
    };

    // ── Apply fallbacks ──
    const effectiveOutline = applyOutlineFallbacks(outline, !!languageModel);

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
      );
    } catch (error) {
      generationError = error;
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
      return apiSuccess({
        content,
        effectiveOutline,
        contents: flattened.contents,
        effectiveOutlines: flattened.effectiveOutlines,
        generationDiagnostics,
      });
    }

    return apiSuccess({ content, effectiveOutline, generationDiagnostics });
  } catch (error) {
    log.error('Scene content generation error:', error);
    return apiError('INTERNAL_ERROR', 500, error instanceof Error ? error.message : String(error));
  }
}
