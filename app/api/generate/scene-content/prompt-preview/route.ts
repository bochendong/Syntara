import { NextRequest } from 'next/server';
import {
  applyOutlineFallbacks,
  normalizeImageFirstHeroOutlineForSceneContent,
} from '@/lib/generation/generation-pipeline';
import { buildSemanticSlideContentPromptBundle } from '@/lib/generation/scene-generator';
import { normalizeComputerScienceSceneOutline } from '@/lib/generation/cs-semantic-normalizer';
import {
  normalizeNotebookSlideGenerationRoute,
  normalizeSlideGenerationRoute,
} from '@/lib/generation/slide-generation-route';
import type { AgentInfo, CoursePersonalizationContext } from '@/lib/generation/generation-pipeline';
import type { PdfImage, ImageMapping, SceneOutline } from '@/lib/types/generation';
import { apiError, apiSuccess } from '@/lib/server/api-response';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      outline: rawOutline,
      allOutlines,
      pdfImages,
      imageMapping,
      stageInfo,
      agents,
      slideGenerationRoute: rawSlideGenerationRoute,
    } = body as {
      outline: SceneOutline;
      allOutlines: SceneOutline[];
      pdfImages?: PdfImage[];
      imageMapping?: ImageMapping;
      stageInfo?: {
        name: string;
        description?: string;
        language?: string;
        style?: string;
      };
      agents?: AgentInfo[];
      courseContext?: CoursePersonalizationContext;
      rewriteReason?: string;
      slideGenerationRoute?: unknown;
    };

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

    const allowLegacyCanvas = req.headers.get('x-allow-legacy-canvas') === 'true';
    const slideGenerationRoute = allowLegacyCanvas
      ? normalizeSlideGenerationRoute(rawSlideGenerationRoute)
      : normalizeNotebookSlideGenerationRoute(rawSlideGenerationRoute);

    const outline = normalizeComputerScienceSceneOutline({
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
    const effectiveOutline = normalizeImageFirstHeroOutlineForSceneContent(
      normalizeComputerScienceSceneOutline(applyOutlineFallbacks(outline, true)),
    );
    if (effectiveOutline.type !== 'slide') {
      return apiError(
        'INVALID_REQUEST',
        400,
        `Prompt preview currently supports slide outlines only, received: ${effectiveOutline.type}`,
      );
    }

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

    const promptBundle = buildSemanticSlideContentPromptBundle({
      outline: effectiveOutline,
      allOutlines: normalizedAllOutlines,
      assignedImages,
      imageMapping,
      visionEnabled: false,
      agents,
      courseContext: body.courseContext,
      rewriteReason: body.rewriteReason,
    });

    if (!promptBundle) {
      return apiError('GENERATION_FAILED', 500, 'Failed to build scene-content prompt');
    }

    return apiSuccess({
      promptId: promptBundle.promptId,
      slideGenerationRoute,
      templateDriven: Boolean(promptBundle.templateDrivenDocument),
      effectiveOutline: promptBundle.outline,
      systemPrompt: promptBundle.systemPrompt || null,
      userPrompt: promptBundle.userPrompt || null,
      promptVariables: promptBundle.promptVariables,
      mediaContextText: promptBundle.mediaContextText,
      visionImageCount: promptBundle.visionImages?.length || 0,
    });
  } catch (error) {
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to preview scene-content prompt',
      error instanceof Error ? error.message : String(error),
    );
  }
}
