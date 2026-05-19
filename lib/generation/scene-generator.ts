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
  normalizeSyntaraMarkupLayout,
  SEMANTIC_WEB_LONG_PAGE_MODE,
  isClassicLectureLayoutTemplate,
  measureNotebookSemanticLayout,
  paginateNotebookSemanticLayout,
  renderNotebookSemanticPages,
  validateNotebookContentDocumentArchetype,
  type NotebookContentBlock,
  type NotebookContentDocument,
  type NotebookContentVisualSlot,
} from '@/lib/notebook-content';
import { buildPrompt, PROMPT_IDS } from './prompts';
import { parseJsonResponse } from './json-repair';
import {
  formatCoursePersonalizationForPrompt,
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
import {
  getSlideBackgroundStyleOption,
  resolveBuiltInHeroBackgroundSource,
} from '@/lib/constants/slide-backgrounds';
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
  normalizeColumnLayoutBlocks,
  normalizeGridPlacementHints,
} from './semantic-slide-templates';
import { buildTitleCoverSlideContent, isTitleCoverOutline } from './title-cover';
import { normalizeSlideGenerationRoute, type SlideGenerationRoute } from './slide-generation-route';
import { coerceRuntimeSceneOutline } from './scene-outline-runtime';
import {
  isComputerScienceSemanticDocument,
  normalizeComputerScienceSceneOutline,
  normalizeComputerScienceSemanticDocument,
} from './cs-semantic-normalizer';
import {
  formatSemanticValidationRepairReason,
  normalizeSemanticDocumentForTeachingPlan,
  validateSemanticAgainstPagePlan,
} from './teaching-plan';
import { validateSemanticWithTeachingSkills } from './teaching-skills';
export { buildSemanticSlideContentPromptBundle } from './scene-generator.semantic-prompt';
export type { SemanticSlideContentPromptBundle } from './scene-generator.semantic-prompt';
export {
  materializeSemanticGeneratedSlidePageContent,
  normalizeImageFirstHeroOutlineForSceneContent,
} from './scene-generator.shared';
export type { SceneContentDiagnostics } from './scene-generator.shared';
import { buildSemanticSlideContentPromptBundle } from './scene-generator.semantic-prompt';
import {
  materializeSemanticGeneratedSlidePageContent,
  normalizeImageFirstHeroOutlineForSceneContent,
  recordContentFallback,
  recordFailure,
  recordTeachingSkillValidationFailures,
  shouldSuppressContinuationPages,
  type SceneContentDiagnostics,
} from './scene-generator.shared';
const log = createLogger('Generation');
const SLIDE_LAYOUT_VIEWPORT = { width: 1000, height: 562.5 } as const;
const MAX_SLIDE_LAYOUT_RETRIES = 2;
const MAX_SEMANTIC_SLIDE_RETRIES = 3;

export function buildValidatedFallbackSlideContent(
  outline: SceneOutline,
): GeneratedSlideContent | null {
  const resolvedFallback = buildSemanticFallbackSlideContent(outline);
  if (!resolvedFallback) {
    log.error(`Semantic fallback slide content unavailable for: ${outline.title}`);
    return null;
  }
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
  const hasCodeModelBlock = fallbackDocumentBase.blocks.some((block) =>
    [
      'code_block',
      'code_walkthrough',
      'code_trace',
      'state_table',
      'call_stack',
      'memory_diagram',
      'pointer_diagram',
      'tree_diagram',
      'graph_trace',
      'invariant_panel',
      'dictionary_diagram',
      'linear_structure',
    ].includes(block.type),
  );
  const canUseCodeWalkthroughLayout =
    outline.layoutIntent?.layoutFamily !== 'code_walkthrough' || hasCodeModelBlock;
  const fallbackDocument: NotebookContentDocument = {
    ...fallbackDocumentBase,
    profile: outline.contentProfile || fallbackDocumentBase.profile,
    archetype: outline.archetype || fallbackDocumentBase.archetype,
    title: outline.title || fallbackDocumentBase.title,
    layoutFamily: canUseCodeWalkthroughLayout
      ? outline.layoutIntent?.layoutFamily
      : fallbackDocumentBase.layoutFamily,
    layoutTemplate: canUseCodeWalkthroughLayout
      ? outline.layoutIntent?.layoutTemplate
      : fallbackDocumentBase.layoutTemplate,
    disciplineStyle: outline.layoutIntent?.disciplineStyle || fallbackDocumentBase.disciplineStyle,
    teachingFlow: canUseCodeWalkthroughLayout
      ? outline.layoutIntent?.teachingFlow || fallbackDocumentBase.teachingFlow
      : fallbackDocumentBase.teachingFlow,
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
  if (invalidPage) {
    log.warn(
      `Semantic fallback layout invalid but kept for: ${outline.title}`,
      invalidPage.layoutValidation.issues.map((issue) => issue.message),
    );
  }

  const [primaryPage, ...continuationPages] = renderedPages;
  const effectiveContinuationPages = shouldSuppressContinuationPages(outline)
    ? []
    : continuationPages;
  if (continuationPages.length > 0 && effectiveContinuationPages.length === 0) {
    log.info(`[Budget] suppress_summary_continuations for: ${outline.title}`);
  }
  return {
    elements: primaryPage.elements,
    background: primaryPage.background,
    theme: primaryPage.theme,
    remark: outline.description,
    contentDocument: primaryPage.contentDocument,
    continuationPages: effectiveContinuationPages.map((page, index) => ({
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
    const outline = normalizeComputerScienceSceneOutline(
      coerceRuntimeSceneOutline(outlines[index]),
    );
    outlines[index] = outline;

    try {
      log.info(`Step 3.1: Generating content for: ${outline.title}`);
      const generationDiagnostics: SceneContentDiagnostics = {
        pipeline: 'unknown',
        selectedSkillIds: outline.selectedSkillIds || outline.teachingPagePlan?.selectedSkillIds,
        skillSelectionReasons: outline.skillReasons || outline.teachingPagePlan?.skillReasons,
        failureReasons: [],
        semanticFailureReasons: [],
        skillValidationFailures: [],
        semanticRetryCount: 0,
        layoutRetryCount: 0,
        contentFallbackUsed: false,
      };
      const content = await generateSceneContent(
        outline,
        aiCall,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        generationDiagnostics,
        undefined,
        outlines,
      );
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
          const sceneId = createSceneWithActions(pageOutline, { ...pageContent }, actions, api, {
            ...generationDiagnostics,
            outlineId: pageOutline.id,
            outlineTitle: pageOutline.title,
          });
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
        const sceneId = createSceneWithActions(outline, effectiveContent, actions, api, {
          ...generationDiagnostics,
          outlineId: outline.id,
          outlineTitle: outline.title,
        });
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
  slideGenerationRoute?: SlideGenerationRoute,
  allOutlines?: SceneOutline[],
): Promise<
  | GeneratedSlideContent
  | GeneratedQuizContent
  | GeneratedInteractiveContent
  | GeneratedPBLContent
  | null
> {
  const normalizedSlideGenerationRoute = normalizeSlideGenerationRoute(slideGenerationRoute);
  const coercedOutline = coerceRuntimeSceneOutline(outline);
  outline =
    normalizedSlideGenerationRoute === 'openmaic-legacy'
      ? coercedOutline
      : normalizeImageFirstHeroOutlineForSceneContent(
          normalizeComputerScienceSceneOutline(coercedOutline),
        );
  if (diagnostics) {
    diagnostics.slideGenerationRoute = normalizedSlideGenerationRoute;
    diagnostics.selectedSkillIds =
      diagnostics.selectedSkillIds ||
      outline.selectedSkillIds ||
      outline.teachingPagePlan?.selectedSkillIds;
    diagnostics.skillSelectionReasons =
      diagnostics.skillSelectionReasons ||
      outline.skillReasons ||
      outline.teachingPagePlan?.skillReasons;
  }

  if (isTitleCoverOutline(outline)) {
    if (diagnostics) diagnostics.pipeline = 'semantic';
    return buildTitleCoverSlideContent(outline);
  }

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
      normalizedSlideGenerationRoute,
      allOutlines,
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
        normalizedSlideGenerationRoute,
        allOutlines,
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
  if (isClassicLectureLayoutTemplate(outline.layoutIntent?.layoutTemplate)) return true;
  if (assignedImages && assignedImages.length > 0) return false;
  if (outline.mediaGenerations && outline.mediaGenerations.length > 0) return false;
  return true;
}

function resolveSemanticMediaSource(
  source: string,
  imageMapping?: ImageMapping,
  generatedMediaMapping?: ImageMapping,
): string {
  return generatedMediaMapping?.[source] || imageMapping?.[source] || source;
}

function isImageFirstHeroTemplate(template: string | undefined): boolean {
  return (
    template === 'image_title_overlay' ||
    template === 'cinematic_title_frame' ||
    template === 'tech_hero_title'
  );
}

function isSemanticHeroPlaceholderSource(source: string | undefined): boolean {
  return Boolean(
    source &&
    (/^gen_img_[\w-]+$/i.test(source) ||
      source === 'built_in_hero_background' ||
      /\/slide-backgrounds\//.test(source)),
  );
}

function resolveHeroVisualSlot(args: {
  visualSlot: NotebookContentVisualSlot | undefined;
  outline: SceneOutline;
  document: NotebookContentDocument;
}): NotebookContentVisualSlot | undefined {
  const template = args.document.layoutTemplate || args.outline.layoutIntent?.layoutTemplate;
  if (!isImageFirstHeroTemplate(template)) return args.visualSlot;

  if (args.visualSlot?.source && !isSemanticHeroPlaceholderSource(args.visualSlot.source)) {
    return args.visualSlot;
  }

  const source = args.outline.layoutIntent?.backgroundStyleId
    ? getSlideBackgroundStyleOption(args.outline.layoutIntent.backgroundStyleId).src
    : resolveBuiltInHeroBackgroundSource({
        layoutTemplate: template,
        deckStyle: args.outline.layoutIntent?.deckStyle || args.document.deckStyle,
        disciplineStyle:
          args.outline.layoutIntent?.disciplineStyle || args.document.disciplineStyle,
        title: args.document.title || args.outline.title,
        description: args.outline.description,
      });

  return {
    ...args.visualSlot,
    source,
    alt: args.visualSlot?.alt || args.outline.title,
    caption: args.visualSlot?.caption,
    role: args.visualSlot?.role || 'source_image',
    fit: 'cover',
    emphasis: args.visualSlot?.emphasis || 'primary',
  };
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
    caption: undefined,
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
  const intentTemplate = intent?.layoutTemplate;
  const shouldHonorClassicTemplate =
    isClassicLectureLayoutTemplate(intentTemplate) &&
    args.document.layoutTemplate !== intentTemplate;
  const layoutTemplate = shouldHonorClassicTemplate
    ? intentTemplate
    : args.document.layoutTemplate || intentTemplate;
  const layoutFamily = shouldHonorClassicTemplate
    ? intent?.layoutFamily || args.document.layoutFamily
    : args.document.layoutFamily || intent?.layoutFamily;
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
  const finalVisualSlot = resolveHeroVisualSlot({
    visualSlot: resolvedVisualSlot,
    outline: args.outline,
    document: args.document,
  });

  return {
    ...args.document,
    layoutFamily,
    layoutTemplate,
    disciplineStyle:
      args.document.disciplineStyle && args.document.disciplineStyle !== 'general'
        ? args.document.disciplineStyle
        : intent?.disciplineStyle || 'general',
    teachingFlow:
      args.document.teachingFlow && args.document.teachingFlow !== 'standalone'
        ? args.document.teachingFlow
        : intent?.teachingFlow || 'standalone',
    density: args.document.density || intent?.density || 'standard',
    deckStyle: intent?.deckStyle || args.document.deckStyle,
    visualRole:
      args.document.visualRole ||
      intent?.visualRole ||
      (resolvedVisualSlot ? resolvedVisualSlot.role : 'none'),
    overflowPolicy: args.document.overflowPolicy || intent?.overflowPolicy || 'compress_first',
    preserveFullProblemStatement:
      args.document.preserveFullProblemStatement || Boolean(intent?.preserveFullProblemStatement),
    visualSlot: finalVisualSlot,
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

function isClassicTemplateValidationReason(reason: string): boolean {
  return reason.startsWith('template ');
}

function buildClassicTemplateValidationRepairReason(args: {
  outline: SceneOutline;
  reasons: string[];
  language: 'zh-CN' | 'en-US';
}): string {
  const template = args.outline.layoutIntent?.layoutTemplate || 'classic template';
  const reasonLines = args.reasons.map((reason) => `- ${reason}`).join('\n');

  if (args.language === 'zh-CN') {
    const imageHeroTask =
      template === 'image_title_overlay' ||
      template === 'cinematic_title_frame' ||
      template === 'tech_hero_title'
        ? [
            `本页选择了 ${template}。请重写为 image-first 封面页结构：`,
            '- 一个 `\\visual[source=built_in_hero_background,role=source_image,fit=cover]` 主视觉。',
            '- 一个短 `\\text{...}` 副标题或主题说明。',
            '- 可选一个很短的 `\\callout{标签}{...}` 作为章节、版本、日期或场景信息。',
            '- 不要把 visual 的占位标签写成正文；学生可见文本里不能出现“封面主视觉、封面图片、背景图、路线图、阶段、QA placeholder”等占位语。',
            '- 不要输出 cards、table、process、code 或长讲稿；封面页只负责建立主题和气氛。',
          ].join('\n')
        : '';
    const templateTask =
      imageHeroTask ||
      (template === 'pipeline_table'
        ? [
            '本页选择了 pipeline_table。请重写为 renderer 需要的完整输入结构：',
            '- 一个学生可读的短引入，说明本页要判断什么。',
            '- 一个 3 步左右的 process，给出判断路径或流程。',
            '- 一个 3 行左右的 table，用具体事实做对照或证据，不要只给流程卡片。',
            '- 使用 `\\table[headers={表示|错误状态|暴露的问题}]{...}` 这样的 Syntara table 命令；每行用 `\\\\` 分隔。',
            '- 表格 cell 写短语，不写完整讲稿；Python list/dict、字段名和属性名用反引号，不用数学 `$...$`。',
          ].join('\n')
        : template === 'visual_three_steps'
          ? [
              '本页选择了 visual_three_steps。请重写为：短解释 + visual + 正好 3 个 step/card。',
            ].join('\n')
          : template === 'two_by_one_summary'
            ? [
                '本页选择了 two_by_one_summary。请重写为 3 个顶层文本块：左栏 point group、右栏 point group、底部 summary/callout。',
                '- 可以使用两个 `\\callout{...}{...}` 加一个 `\\summary{...}{...}`。',
                '- 不要只输出一个 bullet_list，也不要把两栏内容塞进同一个长段落。',
              ].join('\n')
            : template === 'definition_board'
              ? [
                  '本页选择了 definition_board。请重写为短定义页，而不是推导页：',
                  '- 一个 `\\callout{定义边界}{...}`，正文只写 1-2 句，并包含本页具体符号、公式或例子。',
                  '- 如果本页具体入口是 `{(2, ♡), ...}` 这样的符号样本，必须原样放进 callout 或其中一张卡；不能替换成“某个关系/一个样本”。',
                  '- 一个 `\\begin{cards}[columns=2]`，里面正好 2 张短卡：一张讲定义要求，一张讲会误读/会失败的边界；每张卡正文控制在 100 个汉字内。',
                  '- 可选一个很短的 `\\summary{...}{...}` 作为下一页使用规则。',
                  '- 不要用 bullet_list；不要在任何正文里写 `•`、编号列表、未写完的长句或省略号。',
                  '- 不要输出 derivation_steps、长 proof、长 bullet_list 或整段讲稿。',
                ].join('\n')
              : template === 'formula_focus'
                ? [
                    '本页选择了 formula_focus。请重写为真正的公式讲解页：',
                    '- 主 `\\formula{...}` 必须使用 PagePlan 的具体入口或等价完整公式，不能只写泛泛的 `f:A\\to B`。',
                    '- 后面只放 2-3 个短 `\\callout` / `\\summary`，分别解释公式读法、需要检查的条件和常见误读。',
                    '- 不要输出长 bullet_list，不要把公式拆成普通正文。',
                  ].join('\n')
                : template === 'derivation_ladder'
                  ? [
                      '本页选择了 derivation_ladder。请重写为真正的数学证明走读：',
                      '- 先用一个短 `\\callout{已知 / 目标}{...}` 写清对象范围和要证明/判定的语句。',
                      '- 必须使用一个 `\\begin{derivation}`，包含 3-5 个连续 `\\step{理由}{公式或判断}`；每步只做一个合法动作。',
                      '- step 的理由要像课堂板书：认定义、改写属于关系、使用已知条件、回到目标、检查误读。',
                      '- 最后用一个短 `\\summary{下一步检查}{...}` 说明接下来验证哪个条件；不要只给两个大卡片或空结论。',
                    ].join('\n')
                  : template === 'three_cards'
                    ? [
                        '本页选择了 three_cards。请重写为 `\\begin{cards}[columns=3]` 和正好 3 个 `\\card{标题}{正文}`。',
                        '- 每张卡只讲一个概念或判断维度，并使用本页具体例子。',
                        '- 不要用 process、paragraph 或 bullet_list 代替卡片结构。',
                      ].join('\n')
                    : template === 'code_split'
                      ? [
                          '本页选择了 code_split。请重写为 trace 或 code_walkthrough：必须同时包含代码和执行/状态变化。',
                          '- 如果 PagePlan 要求 trace，使用 `\\begin{trace}[lang=python]`，内部放 `\\code[lang=python]{...}` 和多个 `\\step[line=...,state={...}]{...}`。',
                          '- 不要把代码拆成普通段落或 bullet_list。',
                        ].join('\n')
                      : template === 'text_image_split'
                        ? [
                            '本页选择了 text_image_split。请重写为一块短文本 + 一个 visual。',
                            '- 使用一个 `\\callout{...}{...}` 或 `\\text{...}` 说明左侧主判断。',
                            '- 使用 `\\visual[source=gen_img_1]{...}` 引用右侧图片。',
                          ].join('\n')
                        : template === 'four_columns'
                          ? [
                              '本页选择了 four_columns。请重写为 `\\begin{cards}[columns=4]` 和正好 4 个短 `\\card{标题}{正文}`。',
                              '- 每张卡只写一个并列类别、阶段、原则或误区。',
                            ].join('\n')
                          : template === 'grid_2x2'
                            ? [
                                '本页选择了 grid_2x2。请重写为 `\\begin{cards}[columns=2]` 和正好 4 个 `\\card{标题}{正文}`。',
                                '- 四张卡组成 2x2 分组、四象限或两组对比。',
                              ].join('\n')
                            : template === 'two_text_image'
                              ? [
                                  '本页选择了 two_text_image。请重写为左侧两块短文本 + 一个 visual。',
                                  '- 使用两个 `\\callout{...}{...}` 或两张 cards 表达两块文本。',
                                  '- 使用 `\\visual[source=gen_img_1]{...}` 引用右侧图片。',
                                ].join('\n')
                              : `本页选择了 ${template}，请补齐对应模板所需的语义结构。`);
    return [
      'Classic lecture layout contract 校验失败。',
      templateTask,
      '失败原因：',
      reasonLines,
      '只输出修复后的 Syntara Markup；内容仍要使用本页 outline 里的具体事实。',
    ].join('\n');
  }

  const imageHeroTask =
    template === 'image_title_overlay' ||
    template === 'cinematic_title_frame' ||
    template === 'tech_hero_title'
      ? [
          `This page selected ${template}. Rewrite it as an image-first cover structure:`,
          '- one `\\visual[source=built_in_hero_background,role=source_image,fit=cover]` main visual,',
          '- one short `\\text{...}` subtitle or topic promise,',
          '- optionally one very short `\\callout{Label}{...}` for chapter, edition, date, or scene context.',
          '- Do not turn visual placeholder labels into visible copy; visible text must not include cover image, main image, background image, roadmap, stage, or QA placeholder.',
          '- Do not output cards, tables, processes, code, or narration; a cover page establishes topic and mood.',
        ].join('\n')
      : '';
  const templateTask =
    imageHeroTask ||
    (template === 'pipeline_table'
      ? [
          'This page selected pipeline_table. Rewrite it as the complete renderer input structure:',
          '- one short student-facing lead that states what is being judged,',
          '- one roughly 3-step process for the judgment path or workflow,',
          '- one roughly 3-row table using concrete facts as comparison/evidence; do not output only flow cards.',
          '- Use a Syntara table command such as `\\table[headers={Representation|Invalid state|Exposed problem}]{...}`; separate rows with `\\\\`.',
          '- Keep table cells as short phrases, not narration; wrap Python list/dict literals, fields, and attributes in backticks, not `$...$` math.',
        ].join('\n')
      : template === 'visual_three_steps'
        ? 'This page selected visual_three_steps. Rewrite it as: short explanation + visual + exactly 3 steps/cards.'
        : template === 'two_by_one_summary'
          ? 'This page selected two_by_one_summary. Rewrite it as 3 top-level text blocks: left point group, right point group, and bottom summary/callout. Two callouts plus one summary is a good structure; do not output only one bullet list.'
          : template === 'definition_board'
            ? [
                'This page selected definition_board. Rewrite it as a compact definition page, not a derivation page:',
                '- one `\\callout{Definition boundary}{...}` with only 1-2 sentences and one concrete symbol, formula, or example from this page,',
                '- if the concrete anchor is a symbolic sample like `{(2, ♡), ...}`, copy it exactly into the callout or one card; do not replace it with "a relation" or "an example".',
                '- one `\\begin{cards}[columns=2]` with exactly 2 compact cards: one definition requirement and one common misread/failure boundary; keep each card body under 100 characters.',
                '- optionally one very short `\\summary{...}{...}` for how the next page should use the definition,',
                '- do not use bullet_list; do not put bullets, numbered lists, unfinished long sentences, or ellipses in visible text.',
                '- do not output derivation_steps, long proofs, long bullet lists, or narration.',
              ].join('\n')
            : template === 'formula_focus'
              ? [
                  'This page selected formula_focus. Rewrite it as a real formula explanation page:',
                  '- The primary `\\formula{...}` must use the PagePlan concrete anchor or an equivalent complete formula; do not output only a generic `f:A\\to B` label.',
                  '- Then use only 2-3 compact `\\callout` / `\\summary` blocks for how to read the formula, what condition to check, and the common misread.',
                  '- Do not output long bullet_list content, and do not flatten the formula into prose.',
                ].join('\n')
              : template === 'derivation_ladder'
                ? [
                    'This page selected derivation_ladder. Rewrite it as a real math proof walkthrough:',
                    '- Start with one short `\\callout{Given / Goal}{...}` naming the object range and exact statement to prove/test.',
                    '- Use one `\\begin{derivation}` with 3-5 connected `\\step{reason}{formula or judgment}` entries; each step performs one legal move.',
                    '- Step reasons should read like board work: enter the definition, rewrite membership/equality, use the given condition, return to the goal, or check a misread.',
                    '- End with one short `\\summary{Next check}{...}` naming the next condition to verify; do not output only two broad cards or an empty conclusion.',
                  ].join('\n')
                : template === 'three_cards'
                  ? 'This page selected three_cards. Rewrite it as a cards environment with exactly 3 card commands. Each card should carry one concept/judgment dimension and one concrete example from the input; do not replace it with a process, paragraph, or bullet list.'
                  : template === 'code_split'
                    ? 'This page selected code_split. Rewrite it as a trace or code_walkthrough that contains both code and execution/state changes. If trace is required, use a trace environment with a code block and step commands with line/state attributes; do not output prose bullets.'
                    : template === 'text_image_split'
                      ? 'This page selected text_image_split. Rewrite it as one compact callout/text block plus one visual reference.'
                      : template === 'four_columns'
                        ? 'This page selected four_columns. Rewrite it as a cards environment with columns=4 and exactly 4 compact card commands.'
                        : template === 'grid_2x2'
                          ? 'This page selected grid_2x2. Rewrite it as a cards environment with columns=2 and exactly 4 card commands.'
                          : template === 'two_text_image'
                            ? 'This page selected two_text_image. Rewrite it as two compact callout/text groups plus one visual reference.'
                            : `This page selected ${template}; complete the semantic structure required by that template.`);

  return [
    'Classic lecture layout contract validation failed.',
    templateTask,
    'Failure reasons:',
    reasonLines,
    'Output only the repaired Syntara Markup and keep using the concrete facts from the outline.',
  ].join('\n');
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
  allOutlines?: SceneOutline[],
): Promise<GeneratedSlideContent | null> {
  const promptBundle = buildSemanticSlideContentPromptBundle({
    outline,
    allOutlines,
    assignedImages,
    imageMapping,
    visionEnabled,
    agents,
    courseContext,
    rewriteReason,
    diagnostics,
  });
  if (!promptBundle) {
    recordFailure(diagnostics, 'semantic_prompt_missing', 'semantic content prompt unavailable');
    return null;
  }
  outline = promptBundle.outline;
  const lang = promptBundle.language;
  const skillSelection = promptBundle.skillSelection;
  const templateDrivenDocument = promptBundle.templateDrivenDocument;
  if (templateDrivenDocument) {
    log.info(
      `[SemanticTemplate] Using ${outline.archetype || 'concept'} template chain for: ${outline.title}`,
    );
  }
  let normalizedDocument: NotebookContentDocument | null = templateDrivenDocument;
  let sourceSyntaraMarkup: string | undefined;
  if (!normalizedDocument) {
    if (!promptBundle.systemPrompt || !promptBundle.userPrompt) {
      recordFailure(diagnostics, 'semantic_prompt_missing', 'semantic content prompt unavailable');
      return null;
    }
    const response = await aiCall(
      promptBundle.systemPrompt,
      promptBundle.userPrompt,
      promptBundle.visionImages,
    );
    const extractedMarkup = extractSyntaraMarkup(response);
    sourceSyntaraMarkup = extractedMarkup
      ? normalizeSyntaraMarkupLayout(extractedMarkup)
      : undefined;
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
        allOutlines,
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
  normalizedDocument = normalizeSemanticDocumentForTeachingPlan(normalizedDocument);
  normalizedDocument = normalizeComputerScienceSemanticDocument(normalizedDocument, outline);
  const teachingPlanValidation = validateSemanticAgainstPagePlan(
    normalizedDocument,
    outline.teachingPagePlan,
  );
  if (!teachingPlanValidation.isValid) {
    const classicTemplateReasons = teachingPlanValidation.reasons.filter(
      isClassicTemplateValidationReason,
    );
    const hasClassicTemplateContractFailure = classicTemplateReasons.length > 0;
    log.warn(
      `Semantic slide content rejected by TeachingPlan validator for: ${outline.title}`,
      teachingPlanValidation.reasons,
    );
    if (diagnostics) {
      diagnostics.semanticRetryCount = Math.max(
        diagnostics.semanticRetryCount,
        semanticRetryCount + 1,
      );
    }
    recordFailure(
      diagnostics,
      'teaching_plan_validation',
      teachingPlanValidation.reasons.join(', '),
    );
    if (semanticRetryCount < MAX_SEMANTIC_SLIDE_RETRIES) {
      const repairReason = hasClassicTemplateContractFailure
        ? buildClassicTemplateValidationRepairReason({
            outline,
            reasons: classicTemplateReasons,
            language: lang,
          })
        : formatSemanticValidationRepairReason(
            outline.teachingPagePlan,
            teachingPlanValidation.reasons,
            lang,
          );
      return generateSemanticSlideContent(
        outline,
        aiCall,
        assignedImages,
        imageMapping,
        visionEnabled,
        generatedMediaMapping,
        agents,
        courseContext,
        appendRewriteReason(rewriteReason, repairReason),
        semanticRetryCount + 1,
        budgetRewriteAttempted,
        diagnostics,
        allOutlines,
      );
    }
    log.error(
      `Semantic slide content rejected after TeachingPlan validation retries: ${outline.title}`,
      teachingPlanValidation.reasons,
    );
    return null;
  }
  const teachingSkillValidationReasons = skillSelection
    ? validateSemanticWithTeachingSkills({
        document: normalizedDocument,
        pagePlan: outline.teachingPagePlan,
        selection: skillSelection,
      })
    : [];
  if (teachingSkillValidationReasons.length > 0) {
    log.warn(
      `Semantic slide content rejected by TeachingSkill validator for: ${outline.title}`,
      teachingSkillValidationReasons,
    );
    if (diagnostics) {
      diagnostics.semanticRetryCount = Math.max(
        diagnostics.semanticRetryCount,
        semanticRetryCount + 1,
      );
    }
    recordTeachingSkillValidationFailures(diagnostics, teachingSkillValidationReasons);
    recordFailure(
      diagnostics,
      'teaching_skill_validation',
      teachingSkillValidationReasons.join(', '),
    );
    if (!templateDrivenDocument && semanticRetryCount < MAX_SEMANTIC_SLIDE_RETRIES) {
      const repairReason =
        lang === 'zh-CN'
          ? [
              'TeachingSkill validator 拒绝了上一版。请重写 semantic document：',
              ...teachingSkillValidationReasons.map((reason) => `- ${reason}`),
              '保持当前组件需求，但把内容改成课堂可见的具体讲解，不能输出教案摘要或占位符。',
            ].join('\n')
          : [
              'The TeachingSkill validator rejected the previous version. Rewrite the semantic document:',
              ...teachingSkillValidationReasons.map((reason) => `- ${reason}`),
              'Keep the component requirements, but make the page classroom-facing and concrete.',
            ].join('\n');
      return generateSemanticSlideContent(
        outline,
        aiCall,
        assignedImages,
        imageMapping,
        visionEnabled,
        generatedMediaMapping,
        agents,
        courseContext,
        appendRewriteReason(rewriteReason, repairReason),
        semanticRetryCount + 1,
        budgetRewriteAttempted,
        diagnostics,
        allOutlines,
      );
    }
  }
  const shouldDropSourceSyntaraMarkup = isComputerScienceSemanticDocument(
    normalizedDocument,
    outline,
  );
  const contentSyntaraMarkup = shouldDropSourceSyntaraMarkup ? undefined : sourceSyntaraMarkup;
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
        allOutlines,
      );
    }
    log.error(`Semantic slide content rejected after archetype retries: ${outline.title}`);
    return null;
  }

  const isClassicTemplate = isClassicLectureLayoutTemplate(normalizedDocument.layoutTemplate);
  const contentBudget = measureNotebookSemanticLayout(normalizedDocument);
  if (
    !isClassicTemplate &&
    !SEMANTIC_WEB_LONG_PAGE_MODE &&
    !contentBudget.fits &&
    !budgetRewriteAttempted
  ) {
    log.info(`[Budget] budget_rewrite_once for: ${outline.title}`);
    if (diagnostics) {
      diagnostics.semanticRetryCount = Math.max(
        diagnostics.semanticRetryCount,
        semanticRetryCount + 1,
      );
    }
    recordFailure(
      diagnostics,
      'semantic_budget_retry',
      `budget exceeded: ${contentBudget.reasons.join(', ') || 'unknown'}`,
    );
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
      allOutlines,
    );
  }
  if (SEMANTIC_WEB_LONG_PAGE_MODE && !contentBudget.fits) {
    log.info(`[Budget] long_page_budget_bypass for: ${outline.title}`);
  }
  log.info(
    `[Budget] ${contentBudget.fits ? 'budget_check_pass' : SEMANTIC_WEB_LONG_PAGE_MODE ? 'budget_long_page' : 'budget_fallback_paginate'} for: ${outline.title}`,
  );
  const paginationResult = isClassicTemplate
    ? {
        pages: [normalizedDocument],
        wasSplit: false,
        reasons: [] as string[],
        unpageableBlockTypes: [] as NotebookContentBlock['type'][],
      }
    : paginateNotebookSemanticLayout({
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

  if (
    paginationResult.wasSplit &&
    isClassicLectureLayoutTemplate(normalizedDocument.layoutTemplate)
  ) {
    const reason = `classic template ${normalizedDocument.layoutTemplate} cannot be split into continuation pages`;
    log.warn(`Semantic slide content rejected by classic pagination contract: ${outline.title}`, [
      reason,
      ...paginationReasons,
    ]);
    if (diagnostics) {
      diagnostics.semanticRetryCount = Math.max(
        diagnostics.semanticRetryCount,
        semanticRetryCount + 1,
      );
    }
    recordFailure(
      diagnostics,
      'semantic_classic_pagination',
      [reason, ...paginationReasons].join(', '),
    );
    if (semanticRetryCount < MAX_SEMANTIC_SLIDE_RETRIES) {
      const compactReason =
        lang === 'zh-CN'
          ? [
              `Classic 模板 ${normalizedDocument.layoutTemplate} 必须是一屏 16:9 页面，不能拆 continuation。`,
              '请重写并压缩同一页：保留模板必需结构，但缩短每个 step、表格单元格和引入文案。',
              `分页原因：${paginationReasons.join('；') || '内容超过一屏预算'}`,
            ].join('\n')
          : [
              `Classic template ${normalizedDocument.layoutTemplate} must remain a single 16:9 slide and cannot split into continuation pages.`,
              'Rewrite and compress the same page: keep the required template structure, but shorten each step, table cell, and lead sentence.',
              `Pagination reasons: ${paginationReasons.join('; ') || 'content exceeded the single-slide budget'}`,
            ].join('\n');
      return generateSemanticSlideContent(
        outline,
        aiCall,
        assignedImages,
        imageMapping,
        visionEnabled,
        generatedMediaMapping,
        agents,
        courseContext,
        appendRewriteReason(rewriteReason, compactReason),
        semanticRetryCount + 1,
        true,
        diagnostics,
        allOutlines,
      );
    }
    log.error(`Semantic slide content rejected after classic pagination retries: ${outline.title}`);
    return null;
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
        allOutlines,
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
    const issueSummary = invalidPage.layoutValidation.issues.map((issue) => issue.message);
    log.warn(`Semantic slide content layout invalid but allowed: ${outline.title}`, issueSummary);
    recordFailure(
      diagnostics,
      'semantic_layout_warning',
      invalidPage.layoutValidation.issues.map((issue) => issue.message || issue.code).join(' | '),
    );
    if (isClassicLectureLayoutTemplate(normalizedDocument.layoutTemplate)) {
      if (semanticRetryCount < MAX_SEMANTIC_SLIDE_RETRIES) {
        const repairReason =
          lang === 'zh-CN'
            ? [
                `Classic 模板 ${normalizedDocument.layoutTemplate} 渲染后几何校验失败，不能作为半成品通过。`,
                `问题：${issueSummary.join('；') || '内容越界或重叠'}`,
                '请重写为更短的一屏 PPT：保留模板必需结构，减少表格单元格字数和 process detail。',
              ].join('\n')
            : [
                `Classic template ${normalizedDocument.layoutTemplate} failed rendered layout validation and cannot pass as a partial slide.`,
                `Issues: ${issueSummary.join('; ') || 'overflow or overlap'}`,
                'Rewrite as a shorter one-screen PPT: keep the required template structure while reducing table-cell copy and process details.',
              ].join('\n');
        return generateSemanticSlideContent(
          outline,
          aiCall,
          assignedImages,
          imageMapping,
          visionEnabled,
          generatedMediaMapping,
          agents,
          courseContext,
          appendRewriteReason(rewriteReason, repairReason),
          semanticRetryCount + 1,
          true,
          diagnostics,
          allOutlines,
        );
      }
      log.error(`Semantic slide content rejected after classic layout retries: ${outline.title}`);
      return null;
    }
  }

  const [primaryPage, ...continuationPages] = renderedPages;
  const effectiveContinuationPages = shouldSuppressContinuationPages(outline)
    ? []
    : continuationPages;
  if (continuationPages.length > 0 && effectiveContinuationPages.length === 0) {
    log.info(`[Budget] suppress_summary_continuations for: ${outline.title}`);
  }
  return {
    elements: primaryPage.elements,
    background: primaryPage.background,
    theme: primaryPage.theme,
    remark: outline.description,
    syntaraMarkup: contentSyntaraMarkup,
    contentDocument: primaryPage.contentDocument,
    continuationPages: effectiveContinuationPages.map((page, index) => ({
      outline: buildContinuationSceneOutline(outline, index + 2, renderedPages.length),
      content: {
        elements: page.elements,
        background: page.background,
        theme: page.theme,
        remark: outline.description,
        syntaraMarkup: contentSyntaraMarkup,
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
  slideGenerationRoute?: SlideGenerationRoute,
  allOutlines?: SceneOutline[],
): Promise<GeneratedSlideContent | null> {
  const normalizedSlideGenerationRoute = normalizeSlideGenerationRoute(slideGenerationRoute);
  outline =
    normalizedSlideGenerationRoute === 'openmaic-legacy'
      ? coerceRuntimeSceneOutline(outline)
      : normalizeComputerScienceSceneOutline(coerceRuntimeSceneOutline(outline));
  const lang = outline.language || 'zh-CN';
  const hasTeachingPlanContract = Boolean(
    outline.teachingPlanId || outline.teachingPagePlan || outline.selectedSkillIds?.length,
  );
  const useLegacyElementPipeline =
    normalizedSlideGenerationRoute === 'openmaic-legacy' && !hasTeachingPlanContract;
  if (diagnostics) diagnostics.slideGenerationRoute = normalizedSlideGenerationRoute;

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
      allOutlines,
    );
    if (semanticContent) {
      log.info(`Using semantic slide content pipeline for: ${outline.title}`);
      return semanticContent;
    }
    recordFailure(diagnostics, 'slide_semantic_failed', 'semantic pipeline returned null');
    if (isClassicLectureLayoutTemplate(outline.layoutIntent?.layoutTemplate)) {
      log.error(
        `Semantic slide content failed for classic template; refusing local fallback: ${outline.title}`,
      );
      return null;
    }
    log.error(`Semantic slide content failed, using local fallback: ${outline.title}`);
    recordContentFallback(diagnostics, 'semantic-local');
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

  if (
    !useLegacyElementPipeline &&
    !skipSemanticPipeline &&
    shouldUseSemanticSlideGeneration(outline, assignedImages)
  ) {
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
      allOutlines,
    );
    if (semanticContent) {
      log.info(`Using semantic slide content pipeline for: ${outline.title}`);
      return semanticContent;
    }
    log.warn(
      `Semantic slide content generation failed, falling back to legacy element prompt: ${outline.title}`,
    );
    recordFailure(diagnostics, 'slide_semantic_failed', 'semantic pipeline returned null');
    recordContentFallback(diagnostics, 'legacy');
  }

  if (outline.workedExampleConfig) {
    log.info(
      `Falling back to AI worked-example rendering for notation-rich scene: ${outline.title}`,
    );
  }
  if (diagnostics) diagnostics.pipeline = 'legacy';
  log.info(`Using OpenMAIC legacy element pipeline for: ${outline.title}`);

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
        normalizedSlideGenerationRoute,
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
