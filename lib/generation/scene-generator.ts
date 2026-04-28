/**
 * Stage 2: Scene content and action generation.
 *
 * Generates full scenes (slide/quiz/interactive/pbl with actions)
 * from scene outlines.
 */

import { nanoid } from 'nanoid';
import { MAX_VISION_IMAGES } from '@/lib/constants/generation';
import type {
  SceneOutline,
  GeneratedSlideContent,
  GeneratedSlidePageContent,
  GeneratedQuizContent,
  GeneratedInteractiveContent,
  GeneratedPBLContent,
  PdfImage,
  ImageMapping,
} from '@/lib/types/generation';
import type { LanguageModel } from 'ai';
import type { StageStore } from '@/lib/api/stage-api';
import { createStageAPI } from '@/lib/api/stage-api';
import {
  buildNotebookContentDocumentFromInsert,
  prepareNotebookSemanticLayout,
  parseNotebookContentDocument,
  compileSyntaraMarkupToNotebookDocument,
  extractSyntaraMarkup,
  measureNotebookSemanticLayout,
  paginateNotebookSemanticLayout,
  renderNotebookSemanticPages,
  validateNotebookContentDocumentArchetype,
  type NotebookContentDocument,
  type NotebookContentVisualSlot,
} from '@/lib/notebook-content';
import { renderSemanticSlideContent } from '@/lib/notebook-content/semantic-slide-render';
import { buildPrompt, PROMPT_IDS } from './prompts';
import { parseJsonResponse } from './json-repair';
import {
  formatCoursePersonalizationForPrompt,
  formatSceneArchetypeContext,
  formatTeacherPersonaForPrompt,
  formatSceneContentProfileContext,
  formatSlideRewriteContext,
  formatWorkedExampleForPrompt,
  formatImageDescription,
  formatImagePlaceholder,
} from './prompt-formatters';
import {
  buildContinuationSceneOutline,
  flattenGeneratedSlideContentPages,
  spliceGeneratedOutlines,
} from './continuation-pages';
import type { PPTElement, SlideBackground } from '@/lib/types/slides';
import { normalizeSlideTextLayout, validateSlideTextLayout } from '@/lib/slide-text-layout';
import type {
  AgentInfo,
  CoursePersonalizationContext,
  GeneratedSlideData,
  AICallFn,
  GenerationResult,
  GenerationCallbacks,
} from './pipeline-types';
import { createLogger } from '@/lib/logger';
import { hasUnexpectedCjkForLanguage } from './language-guard';
import { generateQuizContent } from './quiz-content';
import { generateInteractiveContent, generatePBLSceneContent } from './interactive-pbl-content';
export { buildFallbackSceneActions, generateSceneActions } from './scene-actions';
import { generateSceneActions } from './scene-actions';
export { createSceneWithActions } from './scene-factory';
import { createSceneWithActions } from './scene-factory';
import {
  fixElementDefaults,
  processLatexElements,
  resolveImageIds,
} from './slide-element-normalizer';
export { buildFallbackSlideContentFromOutline } from './slide-fallback-content';
import { buildFallbackSlideContentFromOutline } from './slide-fallback-content';
import {
  buildWorkedExampleSlideContent,
  shouldUseLocalWorkedExampleTemplate,
} from './slide-worked-example-template';
import {
  appendRewriteReason,
  buildLayoutRetryReason,
  buildSemanticBudgetRetryReason,
  buildSemanticStructureRetryReason,
} from './slide-retry-reasons';
import {
  buildTemplateDrivenSemanticDocument,
  normalizeColumnLayoutBlocks,
  normalizeGridPlacementHints,
} from './semantic-slide-templates';
const log = createLogger('Generation');
const SLIDE_LAYOUT_VIEWPORT = { width: 1000, height: 562.5 } as const;
const MAX_SLIDE_LAYOUT_RETRIES = 2;
const MAX_SEMANTIC_SLIDE_RETRIES = 2;

export function materializeSemanticGeneratedSlidePageContent(
  content: GeneratedSlidePageContent,
  fallbackTitle: string,
): GeneratedSlidePageContent {
  if (!content.contentDocument) return content;

  const rendered = renderSemanticSlideContent({
    document: content.contentDocument,
    fallbackTitle,
  });

  return {
    ...content,
    elements: rendered.canvas.elements,
    background: rendered.canvas.background,
    theme: rendered.canvas.theme,
  };
}

export interface SceneContentDiagnostics {
  pipeline: 'semantic' | 'legacy' | 'interactive' | 'quiz' | 'pbl' | 'unknown';
  failureStage?: string;
  failureReasons: string[];
  semanticRetryCount: number;
  layoutRetryCount: number;
}

function recordFailure(
  diagnostics: SceneContentDiagnostics | undefined,
  stage: string,
  reason: string,
): void {
  if (!diagnostics) return;
  diagnostics.failureStage = stage;
  diagnostics.failureReasons.push(reason);
}

export function buildValidatedFallbackSlideContent(
  outline: SceneOutline,
): GeneratedSlideContent | null {
  const fallback = buildSemanticFallbackSlideContent(outline);
  const resolvedFallback = fallback ?? buildFallbackSlideContentFromOutline(outline);
  const normalizedElements = normalizeSlideTextLayout(
    resolvedFallback.elements,
    SLIDE_LAYOUT_VIEWPORT,
  );
  const layoutValidation = validateSlideTextLayout(normalizedElements, SLIDE_LAYOUT_VIEWPORT);
  if (!layoutValidation.isValid) {
    log.warn(
      `Fallback slide content layout invalid for: ${outline.title}`,
      layoutValidation.issues.map((issue) => issue.message),
    );
  }

  return {
    ...resolvedFallback,
    elements: normalizedElements,
  };
}

function buildSemanticFallbackSlideContent(outline: SceneOutline): GeneratedSlideContent | null {
  const language = outline.language || 'zh-CN';
  const fallbackDocumentBase = buildNotebookContentDocumentFromInsert({
    title: outline.title || (language === 'zh-CN' ? '未命名页面' : 'Untitled Slide'),
    description: outline.description || outline.title || '',
    keyPoints: outline.keyPoints || [],
    language,
  });
  const fallbackDocument: NotebookContentDocument = {
    ...fallbackDocumentBase,
    profile: outline.contentProfile || fallbackDocumentBase.profile,
    archetype: outline.archetype || fallbackDocumentBase.archetype,
    title: outline.title || fallbackDocumentBase.title,
    layoutFamily: outline.layoutIntent?.layoutFamily,
    layoutTemplate: outline.layoutIntent?.layoutTemplate,
    disciplineStyle: outline.layoutIntent?.disciplineStyle || fallbackDocumentBase.disciplineStyle,
    teachingFlow: outline.layoutIntent?.teachingFlow || fallbackDocumentBase.teachingFlow,
    density: outline.layoutIntent?.density || fallbackDocumentBase.density,
    visualRole: outline.layoutIntent?.visualRole || fallbackDocumentBase.visualRole,
    overflowPolicy: outline.layoutIntent?.overflowPolicy || fallbackDocumentBase.overflowPolicy,
    preserveFullProblemStatement:
      outline.layoutIntent?.preserveFullProblemStatement ||
      fallbackDocumentBase.preserveFullProblemStatement,
  };

  const preparedLayout = prepareNotebookSemanticLayout({
    document: fallbackDocument,
    fallbackTitle: outline.title,
    rootOutlineId: outline.continuation?.rootOutlineId || outline.id,
    viewport: SLIDE_LAYOUT_VIEWPORT,
  });
  if (preparedLayout.pagination.pages.length === 0) return null;

  const renderedPages = preparedLayout.pages.map((page) => ({
    elements: page.slide.elements,
    background: page.slide.background,
    theme: page.slide.theme,
    contentDocument: page.document,
    layoutValidation: page.layoutValidation,
  }));

  const invalidPage = renderedPages.find((page) => !page.layoutValidation.isValid);
  if (invalidPage) return null;

  const [primaryPage, ...continuationPages] = renderedPages;
  return {
    elements: primaryPage.elements,
    background: primaryPage.background,
    theme: primaryPage.theme,
    remark: outline.description,
    contentDocument: primaryPage.contentDocument,
    continuationPages: continuationPages.map((page, index) => ({
      outline: buildContinuationSceneOutline(outline, index + 2, renderedPages.length),
      content: {
        elements: page.elements,
        background: page.background,
        theme: page.theme,
        remark: outline.description,
        contentDocument: page.contentDocument,
      },
    })),
  };
}

// ==================== Stage 2: Full Scenes (Two-Step) ====================

/**
 * Stage 3: Generate full scenes.
 *
 * Slide scenes may expand into multiple continuation pages. Those continuation pages
 * are materialized immediately and participate in later ordering / narration context.
 */
export async function generateFullScenes(
  sceneOutlines: SceneOutline[],
  store: StageStore,
  aiCall: AICallFn,
  callbacks?: GenerationCallbacks,
): Promise<GenerationResult<string[]>> {
  const api = createStageAPI(store);
  let outlines = [...sceneOutlines].sort((a, b) => a.order - b.order);
  let completedCount = 0;
  const sceneIds: string[] = [];

  callbacks?.onProgress?.({
    currentStage: 3,
    overallProgress: 66,
    stageProgress: 0,
    statusMessage: `正在生成 ${outlines.length} 个场景...`,
    scenesGenerated: 0,
    totalScenes: outlines.length,
  });

  for (let index = 0; index < outlines.length; index += 1) {
    const outline = outlines[index];

    try {
      log.info(`Step 3.1: Generating content for: ${outline.title}`);
      const content = await generateSceneContent(outline, aiCall);
      if (!content) {
        throw new Error(`Failed to generate content for: ${outline.title}`);
      }

      if (outline.type === 'slide' && 'elements' in content) {
        const flattened = flattenGeneratedSlideContentPages({
          content,
          effectiveOutline: outline,
        });
        let effectiveOutlines = flattened.effectiveOutlines;
        if (effectiveOutlines.length > 1) {
          const spliced = spliceGeneratedOutlines(outlines, outline.id, effectiveOutlines);
          outlines = spliced.outlines;
          effectiveOutlines = spliced.effectiveOutlines;
        }

        for (let pageIndex = 0; pageIndex < flattened.contents.length; pageIndex += 1) {
          const pageOutline = effectiveOutlines[pageIndex] || outline;
          const pageContent = materializeSemanticGeneratedSlidePageContent(
            flattened.contents[pageIndex],
            pageOutline.title,
          );
          log.info(`Step 3.2: Generating actions for: ${pageOutline.title}`);
          const actions = await generateSceneActions(pageOutline, { ...pageContent }, aiCall);
          const sceneId = createSceneWithActions(pageOutline, { ...pageContent }, actions, api);
          if (sceneId) {
            sceneIds.push(sceneId);
          }
          completedCount += 1;
        }
      } else {
        const effectiveContent =
          outline.type === 'slide' && 'elements' in content
            ? materializeSemanticGeneratedSlidePageContent(content, outline.title)
            : content;
        log.info(`Step 3.2: Generating actions for: ${outline.title}`);
        const actions = await generateSceneActions(outline, effectiveContent, aiCall);
        const sceneId = createSceneWithActions(outline, effectiveContent, actions, api);
        if (sceneId) {
          sceneIds.push(sceneId);
        }
        completedCount += 1;
      }
    } catch (error) {
      completedCount += 1;
      callbacks?.onError?.(`Failed to generate scene ${outline.title}: ${error}`);
    }

    callbacks?.onProgress?.({
      currentStage: 3,
      overallProgress: 66 + Math.floor((completedCount / Math.max(outlines.length, 1)) * 34),
      stageProgress: Math.floor((completedCount / Math.max(outlines.length, 1)) * 100),
      statusMessage: `已完成 ${completedCount}/${outlines.length} 个场景`,
      scenesGenerated: sceneIds.length,
      totalScenes: outlines.length,
    });
  }

  return { success: true, data: sceneIds };
}

/**
 * Step 3.1: Generate content based on outline
 */
export async function generateSceneContent(
  outline: SceneOutline,
  aiCall: AICallFn,
  assignedImages?: PdfImage[],
  imageMapping?: ImageMapping,
  languageModel?: LanguageModel,
  visionEnabled?: boolean,
  generatedMediaMapping?: ImageMapping,
  agents?: AgentInfo[],
  courseContext?: CoursePersonalizationContext,
  rewriteReason?: string,
  diagnostics?: SceneContentDiagnostics,
): Promise<
  | GeneratedSlideContent
  | GeneratedQuizContent
  | GeneratedInteractiveContent
  | GeneratedPBLContent
  | null
> {
  // If outline is interactive but missing interactiveConfig, fall back to slide
  if (outline.type === 'interactive' && !outline.interactiveConfig) {
    log.warn(
      `Interactive outline "${outline.title}" missing interactiveConfig, falling back to slide`,
    );
    const fallbackOutline = { ...outline, type: 'slide' as const };
    if (diagnostics) diagnostics.pipeline = 'semantic';
    recordFailure(
      diagnostics,
      'interactive_outline_invalid',
      'interactive config missing, downgraded to slide',
    );
    return generateSlideContent(
      fallbackOutline,
      aiCall,
      assignedImages,
      imageMapping,
      visionEnabled,
      generatedMediaMapping,
      agents,
      courseContext,
      undefined,
      0,
      false,
      diagnostics,
    );
  }

  switch (outline.type) {
    case 'slide':
      return generateSlideContent(
        outline,
        aiCall,
        assignedImages,
        imageMapping,
        visionEnabled,
        generatedMediaMapping,
        agents,
        courseContext,
        rewriteReason,
        0,
        false,
        diagnostics,
      );
    case 'quiz':
      if (diagnostics) diagnostics.pipeline = 'quiz';
      return generateQuizContent(outline, aiCall, courseContext);
    case 'interactive':
      if (diagnostics) diagnostics.pipeline = 'interactive';
      return generateInteractiveContent(outline, aiCall, outline.language, courseContext);
    case 'pbl':
      if (diagnostics) diagnostics.pipeline = 'pbl';
      return generatePBLSceneContent(outline, languageModel);
    default:
      recordFailure(diagnostics, 'unknown_scene_type', `unsupported scene type: ${outline.type}`);
      return null;
  }
}

function shouldUseSemanticSlideGeneration(
  outline: SceneOutline,
  assignedImages?: PdfImage[],
): boolean {
  if (assignedImages && assignedImages.length > 0) return false;
  if (outline.mediaGenerations && outline.mediaGenerations.length > 0) return false;
  return true;
}

function formatLayoutIntentForPrompt(outline: SceneOutline, language: 'zh-CN' | 'en-US'): string {
  const intent = outline.layoutIntent;
  if (!intent) return '';
  if (language === 'zh-CN') {
    return [
      '版式意图（硬约束）：',
      `- layoutFamily: ${intent.layoutFamily}`,
      `- layoutTemplate: ${intent.layoutTemplate || 'auto'}`,
      `- disciplineStyle: ${intent.disciplineStyle || 'general'}`,
      `- teachingFlow: ${intent.teachingFlow || 'standalone'}`,
      `- density: ${intent.density || 'standard'}`,
      `- visualRole: ${intent.visualRole || 'none'}`,
      `- overflowPolicy: ${intent.overflowPolicy || 'compress_first'}`,
      `- preserveFullProblemStatement: ${intent.preserveFullProblemStatement ? 'true' : 'false'}`,
      '- 只输出结构化内容和这些版式意图；不要输出坐标。renderer 会决定布局。',
      '- 如果 preserveFullProblemStatement=true，题干完整性优先于压缩。',
    ].join('\n');
  }
  return [
    'Layout intent (hard constraint):',
    `- layoutFamily: ${intent.layoutFamily}`,
    `- layoutTemplate: ${intent.layoutTemplate || 'auto'}`,
    `- disciplineStyle: ${intent.disciplineStyle || 'general'}`,
    `- teachingFlow: ${intent.teachingFlow || 'standalone'}`,
    `- density: ${intent.density || 'standard'}`,
    `- visualRole: ${intent.visualRole || 'none'}`,
    `- overflowPolicy: ${intent.overflowPolicy || 'compress_first'}`,
    `- preserveFullProblemStatement: ${intent.preserveFullProblemStatement ? 'true' : 'false'}`,
    '- Output structured content and these layout fields only; do not output coordinates.',
    '- If preserveFullProblemStatement=true, preserve the readable problem statement before compressing.',
  ].join('\n');
}

function buildSemanticMediaPromptContext(args: {
  outline: SceneOutline;
  language: 'zh-CN' | 'en-US';
  assignedImages?: PdfImage[];
  imageMapping?: ImageMapping;
  visionEnabled?: boolean;
}): { text: string; visionImages?: Array<{ id: string; src: string }> } {
  let text = args.language === 'zh-CN' ? '无可用图片' : 'No images available';
  let visionImages: Array<{ id: string; src: string }> | undefined;

  if (args.assignedImages && args.assignedImages.length > 0) {
    if (args.visionEnabled && args.imageMapping) {
      const withSrc = args.assignedImages.filter((img) => args.imageMapping?.[img.id]);
      const visionSlice = withSrc.slice(0, MAX_VISION_IMAGES);
      const textOnlySlice = withSrc.slice(MAX_VISION_IMAGES);
      const noSrcImages = args.assignedImages.filter((img) => !args.imageMapping?.[img.id]);
      text = [
        ...visionSlice.map((img) => formatImagePlaceholder(img, args.language)),
        ...[...textOnlySlice, ...noSrcImages].map((img) =>
          formatImageDescription(img, args.language),
        ),
      ].join('\n');
      visionImages = visionSlice.map((img) => ({
        id: img.id,
        src: args.imageMapping![img.id],
        width: img.width,
        height: img.height,
      }));
    } else {
      text = args.assignedImages
        .map((img) => formatImageDescription(img, args.language))
        .join('\n');
    }
  }

  const generatedImages = (args.outline.mediaGenerations || [])
    .filter((media) => media.type === 'image')
    .map((media) => `- ${media.elementId}: "${media.prompt}"`);
  if (generatedImages.length > 0) {
    const generatedText =
      args.language === 'zh-CN'
        ? `AI 生成图片占位符（可作为 visualSlot.source 或 visual block source）：\n${generatedImages.join('\n')}`
        : `AI-generated image placeholders (may be used as visualSlot.source or visual block source):\n${generatedImages.join('\n')}`;
    text =
      text.includes('无可用') || text.includes('No images')
        ? generatedText
        : `${text}\n\n${generatedText}`;
  }

  return { text, visionImages };
}

function resolveSemanticMediaSource(
  source: string,
  imageMapping?: ImageMapping,
  generatedMediaMapping?: ImageMapping,
): string {
  return generatedMediaMapping?.[source] || imageMapping?.[source] || source;
}

function buildVisualSlotFromOutline(args: {
  outline: SceneOutline;
  assignedImages?: PdfImage[];
  imageMapping?: ImageMapping;
  generatedMediaMapping?: ImageMapping;
}): NotebookContentVisualSlot | undefined {
  const sourceImage = args.assignedImages?.[0];
  if (sourceImage) {
    return {
      source: resolveSemanticMediaSource(
        sourceImage.id,
        args.imageMapping,
        args.generatedMediaMapping,
      ),
      alt: sourceImage.description || sourceImage.id,
      caption: sourceImage.description,
      role: 'source_image',
      fit: 'contain',
      emphasis: 'supporting',
    };
  }

  const generatedImage = args.outline.mediaGenerations?.find((media) => media.type === 'image');
  if (!generatedImage) return undefined;
  return {
    source: resolveSemanticMediaSource(
      generatedImage.elementId,
      args.imageMapping,
      args.generatedMediaMapping,
    ),
    alt: generatedImage.prompt,
    caption: generatedImage.prompt,
    role: 'generated_image',
    fit: 'cover',
    emphasis: 'supporting',
  };
}

function applyOutlineIntentToSemanticDocument(args: {
  document: NotebookContentDocument;
  outline: SceneOutline;
  assignedImages?: PdfImage[];
  imageMapping?: ImageMapping;
  generatedMediaMapping?: ImageMapping;
}): NotebookContentDocument {
  const intent = args.outline.layoutIntent;
  const visualSlot =
    args.document.visualSlot ||
    buildVisualSlotFromOutline({
      outline: args.outline,
      assignedImages: args.assignedImages,
      imageMapping: args.imageMapping,
      generatedMediaMapping: args.generatedMediaMapping,
    });
  const resolvedVisualSlot = visualSlot
    ? {
        ...visualSlot,
        source: resolveSemanticMediaSource(
          visualSlot.source,
          args.imageMapping,
          args.generatedMediaMapping,
        ),
      }
    : undefined;

  return {
    ...args.document,
    layoutFamily: args.document.layoutFamily || intent?.layoutFamily,
    layoutTemplate: args.document.layoutTemplate || intent?.layoutTemplate,
    disciplineStyle:
      args.document.disciplineStyle && args.document.disciplineStyle !== 'general'
        ? args.document.disciplineStyle
        : intent?.disciplineStyle || 'general',
    teachingFlow:
      args.document.teachingFlow && args.document.teachingFlow !== 'standalone'
        ? args.document.teachingFlow
        : intent?.teachingFlow || 'standalone',
    density: args.document.density || intent?.density || 'standard',
    visualRole:
      args.document.visualRole ||
      intent?.visualRole ||
      (resolvedVisualSlot ? resolvedVisualSlot.role : 'none'),
    overflowPolicy: args.document.overflowPolicy || intent?.overflowPolicy || 'compress_first',
    preserveFullProblemStatement:
      args.document.preserveFullProblemStatement || Boolean(intent?.preserveFullProblemStatement),
    visualSlot: resolvedVisualSlot,
    blocks: args.document.blocks.map((block) =>
      block.type === 'visual'
        ? {
            ...block,
            source: resolveSemanticMediaSource(
              block.source,
              args.imageMapping,
              args.generatedMediaMapping,
            ),
          }
        : block,
    ),
    slots: args.document.slots?.map((slot) => ({
      ...slot,
      blocks: slot.blocks.map((block) =>
        block.type === 'visual'
          ? {
              ...block,
              source: resolveSemanticMediaSource(
                block.source,
                args.imageMapping,
                args.generatedMediaMapping,
              ),
            }
          : block,
      ),
    })),
  };
}

function extractNotebookContentDocumentFromResponse(
  response: string,
  defaults: Partial<Pick<NotebookContentDocument, 'language' | 'title'>> = {},
): NotebookContentDocument | null {
  const markup = extractSyntaraMarkup(response);
  if (markup) {
    const document = compileSyntaraMarkupToNotebookDocument(markup, defaults);
    if (document) return document;
  }

  const parsed = parseJsonResponse<unknown>(response);
  if (!parsed || typeof parsed !== 'object') return null;

  const direct = parseNotebookContentDocument(parsed);
  if (direct) return direct;

  const wrapped = parseNotebookContentDocument(
    (parsed as { contentDocument?: unknown }).contentDocument,
  );
  return wrapped;
}

async function generateSemanticSlideContent(
  outline: SceneOutline,
  aiCall: AICallFn,
  assignedImages?: PdfImage[],
  imageMapping?: ImageMapping,
  visionEnabled?: boolean,
  generatedMediaMapping?: ImageMapping,
  agents?: AgentInfo[],
  courseContext?: CoursePersonalizationContext,
  rewriteReason?: string,
  semanticRetryCount = 0,
  budgetRewriteAttempted = false,
  diagnostics?: SceneContentDiagnostics,
): Promise<GeneratedSlideContent | null> {
  const lang = outline.language || 'zh-CN';
  const templateDrivenDocument = buildTemplateDrivenSemanticDocument(outline, lang);
  if (templateDrivenDocument) {
    log.info(
      `[SemanticTemplate] Using ${outline.archetype || 'concept'} template chain for: ${outline.title}`,
    );
  }
  const teacherContext = formatTeacherPersonaForPrompt(agents, lang);
  const coursePersonalization = formatCoursePersonalizationForPrompt(courseContext, lang);
  const contentProfileContext = formatSceneContentProfileContext(outline, lang);
  const archetypeContext = formatSceneArchetypeContext(outline, lang);
  const workedExampleContext = formatWorkedExampleForPrompt(outline.workedExampleConfig, lang);
  const layoutIntentContext = formatLayoutIntentForPrompt(outline, lang);
  const mediaContext = buildSemanticMediaPromptContext({
    outline,
    language: lang,
    assignedImages,
    imageMapping,
    visionEnabled,
  });
  const rewriteContext = formatSlideRewriteContext(rewriteReason, lang);
  let normalizedDocument: NotebookContentDocument | null = templateDrivenDocument;
  if (!normalizedDocument) {
    const prompts = buildPrompt(PROMPT_IDS.SLIDE_SEMANTIC_CONTENT, {
      language: lang,
      title: outline.title,
      description: outline.description,
      keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
      contentProfileContext,
      archetypeContext,
      layoutIntentContext,
      assignedImages: mediaContext.text,
      teacherContext,
      coursePersonalization,
      workedExampleContext,
      rewriteContext,
    });
    if (!prompts) return null;
    const response = await aiCall(prompts.system, prompts.user, mediaContext.visionImages);
    const contentDocumentRaw = extractNotebookContentDocumentFromResponse(response, {
      language: lang,
      title: outline.title,
    });
    normalizedDocument = contentDocumentRaw
      ? {
          ...contentDocumentRaw,
          language: lang,
          profile:
            contentDocumentRaw.profile === 'general' && outline.contentProfile
              ? outline.contentProfile
              : contentDocumentRaw.profile,
          archetype: outline.archetype || contentDocumentRaw.archetype || 'concept',
        }
      : null;
  }
  if (!normalizedDocument) {
    log.warn(`Semantic slide content parse failed for: ${outline.title}`);
    if (diagnostics) {
      diagnostics.semanticRetryCount = Math.max(
        diagnostics.semanticRetryCount,
        semanticRetryCount + 1,
      );
    }
    recordFailure(diagnostics, 'semantic_parse', 'semantic document parse failed');
    if (semanticRetryCount < MAX_SEMANTIC_SLIDE_RETRIES) {
      return generateSemanticSlideContent(
        outline,
        aiCall,
        assignedImages,
        imageMapping,
        visionEnabled,
        generatedMediaMapping,
        agents,
        courseContext,
        appendRewriteReason(rewriteReason, buildSemanticStructureRetryReason(lang)),
        semanticRetryCount + 1,
        budgetRewriteAttempted,
        diagnostics,
      );
    }
    return null;
  }
  normalizedDocument = applyOutlineIntentToSemanticDocument({
    document: normalizedDocument,
    outline,
    assignedImages,
    imageMapping,
    generatedMediaMapping,
  });
  if (normalizedDocument.version !== 2) {
    normalizedDocument = normalizeColumnLayoutBlocks(normalizedDocument);
    normalizedDocument = normalizeGridPlacementHints(normalizedDocument);
  }
  if (hasUnexpectedCjkForLanguage(normalizedDocument, lang)) {
    log.warn(`Semantic slide content language mismatch for: ${outline.title}`);
    recordFailure(diagnostics, 'semantic_language', 'language mismatch in semantic document');
    return null;
  }

  const archetypeValidation = validateNotebookContentDocumentArchetype(normalizedDocument);
  if (!archetypeValidation.isValid) {
    log.warn(
      `Semantic slide content archetype mismatch for: ${outline.title}`,
      archetypeValidation.reasons,
    );
    if (diagnostics) {
      diagnostics.semanticRetryCount = Math.max(
        diagnostics.semanticRetryCount,
        semanticRetryCount + 1,
      );
    }
    recordFailure(
      diagnostics,
      'semantic_archetype',
      `archetype mismatch: ${archetypeValidation.reasons.join(', ')}`,
    );
    if (semanticRetryCount < MAX_SEMANTIC_SLIDE_RETRIES) {
      return generateSemanticSlideContent(
        outline,
        aiCall,
        assignedImages,
        imageMapping,
        visionEnabled,
        generatedMediaMapping,
        agents,
        courseContext,
        appendRewriteReason(rewriteReason, archetypeValidation.reasons.join('\n')),
        semanticRetryCount + 1,
        budgetRewriteAttempted,
        diagnostics,
      );
    }
    log.error(`Semantic slide content rejected after archetype retries: ${outline.title}`);
    return null;
  }

  const contentBudget = measureNotebookSemanticLayout(normalizedDocument);
  if (!contentBudget.fits && !budgetRewriteAttempted) {
    log.info(`[Budget] budget_rewrite_once for: ${outline.title}`);
    if (diagnostics) {
      diagnostics.semanticRetryCount = Math.max(
        diagnostics.semanticRetryCount,
        semanticRetryCount + 1,
      );
    }
    return generateSemanticSlideContent(
      outline,
      aiCall,
      assignedImages,
      imageMapping,
      visionEnabled,
      generatedMediaMapping,
      agents,
      courseContext,
      appendRewriteReason(
        rewriteReason,
        buildSemanticBudgetRetryReason(lang, contentBudget.reasons),
      ),
      semanticRetryCount + 1,
      true,
      diagnostics,
    );
  }
  log.info(
    `[Budget] ${contentBudget.fits ? 'budget_check_pass' : 'budget_fallback_paginate'} for: ${outline.title}`,
  );
  const paginationResult = paginateNotebookSemanticLayout({
    document: normalizedDocument,
    rootOutlineId: outline.continuation?.rootOutlineId || outline.id,
  });
  const paginationReasons = [
    ...contentBudget.reasons,
    ...paginationResult.reasons,
    ...paginationResult.unpageableBlockTypes.map((type) => `unpageable_block:${type}`),
  ];
  if (paginationResult.wasSplit) {
    log.info(`[Budget] budget_fallback_paginate for: ${outline.title}`);
  }

  if (paginationResult.unpageableBlockTypes.length > 0 || paginationResult.pages.length === 0) {
    log.warn(`Semantic slide content pagination failed for: ${outline.title}`, paginationReasons);
    if (diagnostics) {
      diagnostics.semanticRetryCount = Math.max(
        diagnostics.semanticRetryCount,
        semanticRetryCount + 1,
      );
    }
    recordFailure(
      diagnostics,
      'semantic_pagination',
      `pagination failed: ${paginationReasons.join(', ') || 'unknown'}`,
    );
    if (semanticRetryCount < MAX_SEMANTIC_SLIDE_RETRIES) {
      return generateSemanticSlideContent(
        outline,
        aiCall,
        assignedImages,
        imageMapping,
        visionEnabled,
        generatedMediaMapping,
        agents,
        courseContext,
        appendRewriteReason(rewriteReason, buildSemanticBudgetRetryReason(lang, paginationReasons)),
        semanticRetryCount + 1,
        true,
        diagnostics,
      );
    }
    log.error(`Semantic slide content rejected after pagination retries: ${outline.title}`);
    return null;
  }

  const renderedPages = renderNotebookSemanticPages({
    pageDocuments: paginationResult.pages,
    fallbackTitle: outline.title,
    viewport: SLIDE_LAYOUT_VIEWPORT,
  }).map((page) => ({
    elements: page.slide.elements,
    background: page.slide.background,
    theme: page.slide.theme,
    contentDocument: page.document,
    layoutValidation: page.layoutValidation,
  }));

  const invalidPage = renderedPages.find((page) => !page.layoutValidation.isValid);
  if (invalidPage) {
    log.warn(
      `Semantic slide content layout invalid but allowed: ${outline.title}`,
      invalidPage.layoutValidation.issues.map((issue) => issue.message),
    );
    recordFailure(
      diagnostics,
      'semantic_layout_warning',
      invalidPage.layoutValidation.issues.map((issue) => issue.code).join(', '),
    );
  }

  const [primaryPage, ...continuationPages] = renderedPages;
  return {
    elements: primaryPage.elements,
    background: primaryPage.background,
    theme: primaryPage.theme,
    remark: outline.description,
    contentDocument: primaryPage.contentDocument,
    continuationPages: continuationPages.map((page, index) => ({
      outline: buildContinuationSceneOutline(outline, index + 2, renderedPages.length),
      content: {
        elements: page.elements,
        background: page.background,
        theme: page.theme,
        remark: outline.description,
        contentDocument: page.contentDocument,
      },
    })),
  };
}

/**
 * Generate slide content
 */
async function generateSlideContent(
  outline: SceneOutline,
  aiCall: AICallFn,
  assignedImages?: PdfImage[],
  imageMapping?: ImageMapping,
  visionEnabled?: boolean,
  generatedMediaMapping?: ImageMapping,
  agents?: AgentInfo[],
  courseContext?: CoursePersonalizationContext,
  rewriteReason?: string,
  layoutRetryCount = 0,
  skipSemanticPipeline = false,
  diagnostics?: SceneContentDiagnostics,
): Promise<GeneratedSlideContent | null> {
  const lang = outline.language || 'zh-CN';
  const useLegacyElementPipeline = false;

  if (!useLegacyElementPipeline) {
    if (diagnostics) diagnostics.pipeline = 'semantic';
    const semanticContent = await generateSemanticSlideContent(
      outline,
      aiCall,
      assignedImages,
      imageMapping,
      visionEnabled,
      generatedMediaMapping,
      agents,
      courseContext,
      rewriteReason,
      0,
      false,
      diagnostics,
    );
    if (semanticContent) {
      log.info(`Using semantic slide content pipeline for: ${outline.title}`);
      return semanticContent;
    }
    log.error(`Semantic slide content failed, using local fallback: ${outline.title}`);
    recordFailure(diagnostics, 'slide_semantic_failed', 'semantic pipeline returned null');
    return buildValidatedFallbackSlideContent(outline);
  }

  if (outline.workedExampleConfig && shouldUseLocalWorkedExampleTemplate(outline)) {
    const localTemplate = buildWorkedExampleSlideContent(outline, {
      assignedImages,
      imageMapping,
      generatedMediaMapping,
    });
    if (localTemplate) {
      const normalizedElements = normalizeSlideTextLayout(
        localTemplate.elements,
        SLIDE_LAYOUT_VIEWPORT,
      );
      const layoutValidation = validateSlideTextLayout(normalizedElements, SLIDE_LAYOUT_VIEWPORT);

      if (!layoutValidation.isValid) {
        log.warn(
          `Local worked-example template layout invalid, falling back to AI generation: ${outline.title}`,
          layoutValidation.issues.map((issue) => issue.message),
        );
      } else {
        log.info(`Using local worked-example template for: ${outline.title}`);
        return {
          ...localTemplate,
          elements: normalizedElements,
        };
      }
    }
  }

  if (!skipSemanticPipeline && shouldUseSemanticSlideGeneration(outline, assignedImages)) {
    if (diagnostics) diagnostics.pipeline = 'semantic';
    const semanticContent = await generateSemanticSlideContent(
      outline,
      aiCall,
      assignedImages,
      imageMapping,
      visionEnabled,
      generatedMediaMapping,
      agents,
      courseContext,
      rewriteReason,
      0,
      false,
      diagnostics,
    );
    if (semanticContent) {
      log.info(`Using semantic slide content pipeline for: ${outline.title}`);
      return semanticContent;
    }
    log.warn(
      `Semantic slide content generation failed, falling back to legacy element prompt: ${outline.title}`,
    );
    recordFailure(diagnostics, 'slide_semantic_failed', 'semantic pipeline returned null');
  }

  if (outline.workedExampleConfig) {
    log.info(
      `Falling back to AI worked-example rendering for notation-rich scene: ${outline.title}`,
    );
  }

  // Build assigned images description for the prompt
  let assignedImagesText =
    lang === 'zh-CN'
      ? '无可用图片，禁止插入任何 image 元素'
      : 'No images are available. Do not create any image element.';
  let visionImages: Array<{ id: string; src: string }> | undefined;

  if (assignedImages && assignedImages.length > 0) {
    if (visionEnabled && imageMapping) {
      // Vision mode: split into vision images and text-only
      const withSrc = assignedImages.filter((img) => imageMapping[img.id]);
      const visionSlice = withSrc.slice(0, MAX_VISION_IMAGES);
      const textOnlySlice = withSrc.slice(MAX_VISION_IMAGES);
      const noSrcImages = assignedImages.filter((img) => !imageMapping[img.id]);

      const visionDescriptions = visionSlice.map((img) => formatImagePlaceholder(img, lang));
      const textDescriptions = [...textOnlySlice, ...noSrcImages].map((img) =>
        formatImageDescription(img, lang),
      );
      assignedImagesText = [...visionDescriptions, ...textDescriptions].join('\n');

      visionImages = visionSlice.map((img) => ({
        id: img.id,
        src: imageMapping[img.id],
        width: img.width,
        height: img.height,
      }));
    } else {
      assignedImagesText = assignedImages
        .map((img) => formatImageDescription(img, lang))
        .join('\n');
    }
  }

  // Add generated media placeholders info (images + videos)
  if (outline.mediaGenerations && outline.mediaGenerations.length > 0) {
    const genImgDescs = outline.mediaGenerations
      .filter((mg) => mg.type === 'image')
      .map((mg) => `- ${mg.elementId}: "${mg.prompt}" (aspect ratio: ${mg.aspectRatio || '16:9'})`)
      .join('\n');
    const genVidDescs = outline.mediaGenerations
      .filter((mg) => mg.type === 'video')
      .map((mg) => `- ${mg.elementId}: "${mg.prompt}" (aspect ratio: ${mg.aspectRatio || '16:9'})`)
      .join('\n');

    const mediaParts: string[] = [];
    if (genImgDescs) {
      mediaParts.push(`AI-Generated Images (use these IDs as image element src):\n${genImgDescs}`);
    }
    if (genVidDescs) {
      mediaParts.push(`AI-Generated Videos (use these IDs as video element src):\n${genVidDescs}`);
    }

    if (mediaParts.length > 0) {
      const mediaText = mediaParts.join('\n\n');
      if (assignedImagesText.includes('禁止插入') || assignedImagesText.includes('No images')) {
        assignedImagesText = mediaText;
      } else {
        assignedImagesText += `\n\n${mediaText}`;
      }
    }
  }

  // Canvas dimensions (matching viewportSize and viewportRatio)
  const canvasWidth = 1000;
  const canvasHeight = 562.5;

  const teacherContext = formatTeacherPersonaForPrompt(agents, lang);
  const coursePersonalization = formatCoursePersonalizationForPrompt(courseContext, lang);
  const contentProfileContext = formatSceneContentProfileContext(outline, lang);
  const workedExampleContext = formatWorkedExampleForPrompt(outline.workedExampleConfig, lang);
  const rewriteContext = formatSlideRewriteContext(rewriteReason, lang);

  const prompts = buildPrompt(PROMPT_IDS.SLIDE_CONTENT, {
    language: lang,
    title: outline.title,
    description: outline.description,
    keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
    elements:
      lang === 'zh-CN' ? '（根据要点自动生成）' : '(Generate automatically from the key points)',
    assignedImages: assignedImagesText,
    canvas_width: canvasWidth,
    canvas_height: canvasHeight,
    contentProfileContext,
    teacherContext,
    coursePersonalization,
    workedExampleContext,
    rewriteContext,
  });

  if (!prompts) {
    return null;
  }

  log.debug(`Generating slide content for: ${outline.title}`);
  if (assignedImages && assignedImages.length > 0) {
    log.debug(`Assigned images: ${assignedImages.map((img) => img.id).join(', ')}`);
  }
  if (visionImages && visionImages.length > 0) {
    log.debug(`Vision images: ${visionImages.map((img) => img.id).join(', ')}`);
  }

  const response = await aiCall(prompts.system, prompts.user, visionImages);
  const generatedData = parseJsonResponse<GeneratedSlideData>(response);

  if (!generatedData || !generatedData.elements || !Array.isArray(generatedData.elements)) {
    log.error(`Failed to parse AI response for: ${outline.title}`);
    if (diagnostics) diagnostics.pipeline = 'legacy';
    recordFailure(diagnostics, 'legacy_parse', 'legacy element JSON parse failed');
    return null;
  }
  if (hasUnexpectedCjkForLanguage(generatedData, lang)) {
    log.warn(`Slide content language mismatch for: ${outline.title}`);
    if (diagnostics) diagnostics.pipeline = 'legacy';
    recordFailure(diagnostics, 'legacy_language', 'legacy generated language mismatch');
    return null;
  }

  log.debug(`Got ${generatedData.elements.length} elements for: ${outline.title}`);

  // Debug: Log image elements before resolution
  const imageElements = generatedData.elements.filter((el) => el.type === 'image');
  if (imageElements.length > 0) {
    log.debug(
      `Image elements before resolution:`,
      imageElements.map((el) => ({
        type: el.type,
        src:
          (el as Record<string, unknown>).src &&
          String((el as Record<string, unknown>).src).substring(0, 50),
      })),
    );
    log.debug(`imageMapping keys:`, imageMapping ? Object.keys(imageMapping).length : '0 keys');
  }

  // Fix elements with missing required fields + aspect ratio correction (while src is still img_id)
  const fixedElements = fixElementDefaults(generatedData.elements, assignedImages);
  log.debug(`After element fixing: ${fixedElements.length} elements`);

  // Process LaTeX elements: render latex string → HTML via KaTeX
  const latexProcessedElements = processLatexElements(fixedElements);
  log.debug(`After LaTeX processing: ${latexProcessedElements.length} elements`);

  // Resolve image_id references to actual URLs
  const resolvedElements = resolveImageIds(
    latexProcessedElements,
    imageMapping,
    generatedMediaMapping,
  );
  log.debug(`After image resolution: ${resolvedElements.length} elements`);

  // Process elements, assign unique IDs
  const processedElements: PPTElement[] = resolvedElements.map((el) => ({
    ...el,
    id: `${el.type}_${nanoid(8)}`,
    rotate: 0,
  })) as PPTElement[];
  const normalizedElements = normalizeSlideTextLayout(processedElements, SLIDE_LAYOUT_VIEWPORT);
  const layoutValidation = validateSlideTextLayout(normalizedElements, SLIDE_LAYOUT_VIEWPORT);
  if (!layoutValidation.isValid) {
    log.warn(
      `Generated slide layout invalid for: ${outline.title}`,
      layoutValidation.issues.map((issue) => issue.message),
    );

    if (diagnostics) {
      diagnostics.layoutRetryCount = Math.max(diagnostics.layoutRetryCount, layoutRetryCount + 1);
    }
    if (diagnostics) diagnostics.pipeline = 'legacy';
    recordFailure(
      diagnostics,
      'legacy_layout',
      layoutValidation.issues.map((issue) => issue.code).join(', '),
    );
    if (layoutRetryCount < MAX_SLIDE_LAYOUT_RETRIES) {
      return generateSlideContent(
        outline,
        aiCall,
        assignedImages,
        imageMapping,
        visionEnabled,
        generatedMediaMapping,
        agents,
        courseContext,
        appendRewriteReason(rewriteReason, buildLayoutRetryReason(layoutValidation, lang)),
        layoutRetryCount + 1,
        true,
        diagnostics,
      );
    }

    log.error(`Slide layout validation failed after retry for: ${outline.title}`);
    log.error(`Legacy slide content failed with fallback disabled: ${outline.title}`);
    return null;
  }

  // Process background
  let background: SlideBackground | undefined;
  if (generatedData.background) {
    if (generatedData.background.type === 'solid' && generatedData.background.color) {
      background = { type: 'solid', color: generatedData.background.color };
    } else if (generatedData.background.type === 'gradient' && generatedData.background.gradient) {
      background = {
        type: 'gradient',
        gradient: generatedData.background.gradient,
      };
    }
  }

  return {
    elements: normalizedElements,
    background,
    remark: generatedData.remark || outline.description,
  };
}
