/**
 * Stage 1: Generate scene outlines from user requirements.
 * Also contains outline fallback logic.
 */

import { nanoid } from 'nanoid';
import { MAX_PDF_CONTENT_CHARS, MAX_VISION_IMAGES } from '@/lib/constants/generation';
import type {
  UserRequirements,
  SceneOutline,
  PdfImage,
  ImageMapping,
} from '@/lib/types/generation';
import { buildPrompt, PROMPT_IDS } from './prompts';
import { normalizeSceneOutlineContentProfile } from './content-profile';
import { formatImageDescription, formatImagePlaceholder } from './prompt-formatters';
import { parseJsonResponse } from './json-repair';
import { uniquifyMediaElementIds } from './scene-builder';
import type { AICallFn, GenerationResult, GenerationCallbacks } from './pipeline-types';
import { createLogger } from '@/lib/logger';
const log = createLogger('Generation');

function pickAlternateLayoutFamily(
  family: NonNullable<SceneOutline['layoutIntent']>['layoutFamily'],
  index: number,
): NonNullable<SceneOutline['layoutIntent']>['layoutFamily'] {
  if (family === 'concept_cards') return index % 2 === 0 ? 'comparison' : 'timeline';
  if (family === 'comparison') return 'concept_cards';
  if (family === 'timeline') return 'concept_cards';
  if (family === 'visual_split') return 'concept_cards';
  if (family === 'formula_focus') return 'derivation';
  if (family === 'derivation') return 'formula_focus';
  return 'concept_cards';
}

function normalizeSlideLayoutRhythm(outlines: SceneOutline[]): SceneOutline[] {
  const result: SceneOutline[] = [];
  for (const outline of outlines) {
    if (outline.type !== 'slide' || !outline.layoutIntent) {
      result.push(outline);
      continue;
    }

    const previousSlides = result.filter((item) => item.type === 'slide');
    const prevOne = previousSlides[previousSlides.length - 1]?.layoutIntent?.layoutFamily;
    const prevTwo = previousSlides[previousSlides.length - 2]?.layoutIntent?.layoutFamily;
    const current = outline.layoutIntent.layoutFamily;
    const shouldBreakRun = prevOne === current && prevTwo === current;
    result.push(
      shouldBreakRun
        ? {
            ...outline,
            layoutIntent: {
              ...outline.layoutIntent,
              layoutFamily: pickAlternateLayoutFamily(current, result.length),
            },
          }
        : outline,
    );
  }
  return result;
}

/**
 * Generate scene outlines from user requirements
 * Now uses simplified UserRequirements with just requirement text and language
 */
export async function generateSceneOutlinesFromRequirements(
  requirements: UserRequirements,
  pdfText: string | undefined,
  pdfImages: PdfImage[] | undefined,
  aiCall: AICallFn,
  callbacks?: GenerationCallbacks,
  options?: {
    visionEnabled?: boolean;
    imageMapping?: ImageMapping;
    imageGenerationEnabled?: boolean;
    videoGenerationEnabled?: boolean;
    researchContext?: string;
    teacherContext?: string;
  },
): Promise<GenerationResult<SceneOutline[]>> {
  // Build available images description for the prompt
  let availableImagesText =
    requirements.language === 'zh-CN' ? '无可用图片' : 'No images available';
  let visionImages: Array<{ id: string; src: string }> | undefined;

  if (pdfImages && pdfImages.length > 0) {
    if (options?.visionEnabled && options?.imageMapping) {
      // Vision mode: split into vision images (first N) and text-only (rest)
      const allWithSrc = pdfImages.filter((img) => options.imageMapping![img.id]);
      const visionSlice = allWithSrc.slice(0, MAX_VISION_IMAGES);
      const textOnlySlice = allWithSrc.slice(MAX_VISION_IMAGES);
      const noSrcImages = pdfImages.filter((img) => !options.imageMapping![img.id]);

      const visionDescriptions = visionSlice.map((img) =>
        formatImagePlaceholder(img, requirements.language),
      );
      const textDescriptions = [...textOnlySlice, ...noSrcImages].map((img) =>
        formatImageDescription(img, requirements.language),
      );
      availableImagesText = [...visionDescriptions, ...textDescriptions].join('\n');

      visionImages = visionSlice.map((img) => ({
        id: img.id,
        src: options.imageMapping![img.id],
        width: img.width,
        height: img.height,
      }));
    } else {
      // Text-only mode: full descriptions
      availableImagesText = pdfImages
        .map((img) => formatImageDescription(img, requirements.language))
        .join('\n');
    }
  }

  // Build user profile string for prompt injection
  const userProfileText =
    requirements.userNickname || requirements.userBio
      ? `## Student Profile\n\nStudent: ${requirements.userNickname || 'Unknown'}${requirements.userBio ? ` — ${requirements.userBio}` : ''}\n\nConsider this student's background when designing the course. Adapt difficulty, examples, and teaching approach accordingly.\n\n---`
      : '';

  // Build media generation policy based on enabled flags
  const imageEnabled = options?.imageGenerationEnabled ?? false;
  const videoEnabled = options?.videoGenerationEnabled ?? false;
  let mediaGenerationPolicy = '';
  if (!imageEnabled && !videoEnabled) {
    mediaGenerationPolicy =
      '**IMPORTANT: Do NOT include any mediaGenerations in the outlines. Both image and video generation are disabled.**';
  } else if (!imageEnabled) {
    mediaGenerationPolicy =
      '**IMPORTANT: Do NOT include any image mediaGenerations (type: "image") in the outlines. Image generation is disabled. Video generation is allowed.**';
  } else if (!videoEnabled) {
    mediaGenerationPolicy =
      '**IMPORTANT: Do NOT include any video mediaGenerations (type: "video") in the outlines. Video generation is disabled. Image generation is allowed.**';
  }

  // Use simplified prompt variables
  const prompts = buildPrompt(PROMPT_IDS.REQUIREMENTS_TO_OUTLINES, {
    // New simplified variables
    requirement: requirements.requirement,
    language: requirements.language,
    pdfContent: pdfText
      ? pdfText.substring(0, MAX_PDF_CONTENT_CHARS)
      : requirements.language === 'zh-CN'
        ? '无'
        : 'None',
    availableImages: availableImagesText,
    userProfile: userProfileText,
    mediaGenerationPolicy,
    researchContext:
      options?.researchContext || (requirements.language === 'zh-CN' ? '无' : 'None'),
    // Server-side generation populates this via options; client-side populates via formatTeacherPersonaForPrompt
    teacherContext: options?.teacherContext || '',
    purposePolicy: '',
    courseContext: requirements.language === 'zh-CN' ? '无' : 'N/A',
    orchestratorPreferences: '',
  });

  if (!prompts) {
    return { success: false, error: 'Prompt template not found' };
  }

  try {
    callbacks?.onProgress?.({
      currentStage: 1,
      overallProgress: 20,
      stageProgress: 50,
      statusMessage: '正在分析需求，生成场景大纲...',
      scenesGenerated: 0,
      totalScenes: 0,
    });

    const response = await aiCall(prompts.system, prompts.user, visionImages);
    const outlines = parseJsonResponse<SceneOutline[]>(response);

    if (!outlines || !Array.isArray(outlines)) {
      return {
        success: false,
        error: 'Failed to parse scene outlines response',
      };
    }
    // Ensure IDs, order, and language
    const enriched = outlines.map((outline, index) => ({
      ...normalizeSceneOutlineContentProfile(outline),
      id: outline.id || nanoid(),
      order: index + 1,
      language: requirements.language,
    }));

    // Replace sequential gen_img_N/gen_vid_N with globally unique IDs
    const result = uniquifyMediaElementIds(normalizeSlideLayoutRhythm(enriched));

    callbacks?.onProgress?.({
      currentStage: 1,
      overallProgress: 50,
      stageProgress: 100,
      statusMessage: `已生成 ${result.length} 个场景大纲`,
      scenesGenerated: 0,
      totalScenes: result.length,
    });

    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Apply type fallbacks for outlines that can't be generated as their declared type.
 * - interactive without interactiveConfig → slide
 * - pbl without pblConfig or languageModel → slide
 */
export function applyOutlineFallbacks(
  outline: SceneOutline,
  hasLanguageModel: boolean,
): SceneOutline {
  if (outline.type === 'interactive' && !outline.interactiveConfig) {
    log.warn(
      `Interactive outline "${outline.title}" missing interactiveConfig, falling back to slide`,
    );
    return normalizeSceneOutlineContentProfile({ ...outline, type: 'slide' });
  }
  if (outline.type === 'pbl' && (!outline.pblConfig || !hasLanguageModel)) {
    log.warn(
      `PBL outline "${outline.title}" missing pblConfig or languageModel, falling back to slide`,
    );
    return normalizeSceneOutlineContentProfile({ ...outline, type: 'slide' });
  }
  return normalizeSceneOutlineContentProfile(outline);
}
