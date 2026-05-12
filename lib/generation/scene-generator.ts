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
  buildTemplateDrivenSemanticDocument,
  normalizeColumnLayoutBlocks,
  normalizeGridPlacementHints,
} from './semantic-slide-templates';
import { buildTitleCoverSlideContent, isTitleCoverOutline } from './title-cover';
import { normalizeSlideGenerationRoute, type SlideGenerationRoute } from './slide-generation-route';
import { coerceRuntimeSceneOutline } from './scene-outline-runtime';
import { enrichOutlineWithDeckMemory, formatDeckMemoryForPrompt } from './deck-memory';
import {
  isComputerScienceOutline,
  isComputerScienceSemanticDocument,
  normalizeComputerScienceSceneOutline,
  normalizeComputerScienceSemanticDocument,
} from './cs-semantic-normalizer';
import {
  formatSemanticValidationRepairReason,
  formatTeachingPagePlanForPrompt,
  normalizeSemanticDocumentForTeachingPlan,
  validateSemanticAgainstPagePlan,
} from './teaching-plan';
import {
  formatTeachingSkillsForPrompt,
  getTeachingSkillById,
  selectTeachingSkills,
  validateSemanticWithTeachingSkills,
  type CourseProfile,
  type SelectedTeachingSkills,
  type SourceFact,
  type TeachingSkill,
  type TeachingSkillSelectionReason,
} from './teaching-skills';
const log = createLogger('Generation');
const SLIDE_LAYOUT_VIEWPORT = { width: 1000, height: 562.5 } as const;
const MAX_SLIDE_LAYOUT_RETRIES = 2;
const MAX_SEMANTIC_SLIDE_RETRIES = 3;

function isImageFirstHeroLayoutTemplate(template: string | undefined): boolean {
  return (
    template === 'image_title_overlay' ||
    template === 'cinematic_title_frame' ||
    template === 'tech_hero_title'
  );
}

export function normalizeImageFirstHeroOutlineForSceneContent(outline: SceneOutline): SceneOutline {
  const template = outline.layoutIntent?.layoutTemplate || outline.teachingPagePlan?.layoutTemplate;
  if (!isImageFirstHeroLayoutTemplate(template)) return outline;

  const teachingPagePlan = outline.teachingPagePlan
    ? {
        ...outline.teachingPagePlan,
        requiredComponentKinds: [],
        selectedSkillIds: [],
        skillReasons: [],
      }
    : undefined;

  return {
    ...outline,
    requiredComponentKinds: [],
    selectedSkillIds: [],
    skillReasons: [],
    teachingPagePlan,
  };
}

function shouldSuppressContinuationPages(outline: SceneOutline): boolean {
  return outline.type === 'slide' && outline.archetype === 'summary' && !outline.continuation;
}

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
  slideGenerationRoute?: SlideGenerationRoute;
  selectedSkillIds?: string[];
  skillSelectionReasons?: string[];
  failureStage?: string;
  failureReasons: string[];
  semanticFailureReasons?: string[];
  skillValidationFailures?: string[];
  semanticRetryCount: number;
  layoutRetryCount: number;
  contentFallbackUsed?: boolean;
  fallbackKind?: string;
}

function recordFailure(
  diagnostics: SceneContentDiagnostics | undefined,
  stage: string,
  reason: string,
): void {
  if (!diagnostics) return;
  diagnostics.failureStage = stage;
  diagnostics.failureReasons.push(reason);
  if (stage.includes('semantic') || stage.includes('teaching')) {
    diagnostics.semanticFailureReasons = diagnostics.semanticFailureReasons || [];
    diagnostics.semanticFailureReasons.push(`${stage}: ${reason}`);
  }
}

function recordContentFallback(
  diagnostics: SceneContentDiagnostics | undefined,
  fallbackKind: string,
): void {
  if (!diagnostics) return;
  diagnostics.contentFallbackUsed = true;
  diagnostics.fallbackKind = fallbackKind;
}

function parseSkillSelectionReasons(reasons: string[] | undefined): TeachingSkillSelectionReason[] {
  return (reasons || []).map((reason) => {
    const [skillId, ...rest] = reason.split(':');
    return {
      skillId: skillId.trim(),
      reason: rest.join(':').trim() || reason,
    };
  });
}

function courseContextToSkillProfile(
  courseContext: CoursePersonalizationContext | undefined,
  language: 'zh-CN' | 'en-US',
): CourseProfile {
  const tags = (courseContext?.tags || []).filter(Boolean);
  return {
    courseCode: courseContext?.courseCode,
    courseName: courseContext?.name,
    university: courseContext?.university,
    purpose: courseContext?.purpose,
    tags,
    language: courseContext?.language || language,
    level:
      courseContext?.courseCode && /\b(?:CSC|CS)\s*1\d{2}/i.test(courseContext.courseCode)
        ? 'first-year / early university'
        : courseContext?.courseCode && /\b(?:CSC|CS)\s*2\d{2}/i.test(courseContext.courseCode)
          ? 'early-second-year'
          : undefined,
  };
}

function sourceFactsFromOutline(outline: SceneOutline): SourceFact[] {
  const anchor = outline.teachingPagePlan?.concreteAnchor || outline.description || outline.title;
  return anchor?.trim()
    ? [
        {
          id: 'page_anchor',
          kind: 'problem',
          label: outline.language === 'en-US' ? 'page anchor' : '页面具体入口',
          text: anchor.trim(),
        },
      ]
    : [];
}

function buildTeachingSkillSelectionForOutline(args: {
  outline: SceneOutline;
  courseContext?: CoursePersonalizationContext;
}): SelectedTeachingSkills | null {
  const language = args.outline.language || 'zh-CN';
  const courseProfile = courseContextToSkillProfile(args.courseContext, language);
  const sourceFacts = sourceFactsFromOutline(args.outline);
  const skillIds =
    args.outline.selectedSkillIds || args.outline.teachingPagePlan?.selectedSkillIds || [];
  const skills = skillIds
    .map((skillId) => getTeachingSkillById(skillId))
    .filter((skill): skill is TeachingSkill => Boolean(skill));
  if (skills.length > 0) {
    const reasons = parseSkillSelectionReasons(
      args.outline.skillReasons || args.outline.teachingPagePlan?.skillReasons,
    );
    return {
      skills,
      skillIds: skills.map((skill) => skill.id),
      reasons: reasons.length
        ? reasons
        : skills.map((skill) => ({
            skillId: skill.id,
            reason: 'selected upstream by TeachingPlan',
          })),
      courseProfile,
      sourceFacts,
    };
  }

  const disciplineHint =
    args.outline.contentProfile === 'math' || args.outline.layoutIntent?.disciplineStyle === 'math'
      ? 'mathematics'
      : args.outline.contentProfile === 'code' ||
          args.outline.layoutIntent?.disciplineStyle === 'code'
        ? 'computer_science'
        : undefined;

  if (!disciplineHint && !args.outline.teachingPagePlan) return null;

  return selectTeachingSkills({
    language,
    requirement: args.outline.title,
    sourceText: [
      args.outline.title,
      args.outline.description,
      ...(args.outline.keyPoints || []),
      args.outline.teachingPagePlan?.concreteAnchor,
      args.outline.teachingRole,
      args.outline.layoutIntent?.layoutTemplate,
      args.outline.layoutIntent?.teachingFlow,
    ]
      .filter(Boolean)
      .join('\n'),
    disciplineHint,
    courseProfile,
    sourceFacts,
  });
}

function recordTeachingSkillValidationFailures(
  diagnostics: SceneContentDiagnostics | undefined,
  reasons: string[],
): void {
  if (!diagnostics || reasons.length === 0) return;
  diagnostics.skillValidationFailures = diagnostics.skillValidationFailures || [];
  diagnostics.skillValidationFailures.push(...reasons);
}

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
  outline = normalizeImageFirstHeroOutlineForSceneContent(
    normalizeComputerScienceSceneOutline(coerceRuntimeSceneOutline(outline)),
  );
  const normalizedSlideGenerationRoute = normalizeSlideGenerationRoute(slideGenerationRoute);
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

function formatLayoutIntentForPrompt(outline: SceneOutline, language: 'zh-CN' | 'en-US'): string {
  const intent = outline.layoutIntent;
  if (!intent) return '';
  const templateContract = intent.layoutTemplate
    ? formatClassicTemplateContractForPrompt(intent.layoutTemplate, language)
    : '';
  const mathComparisonContract =
    intent.layoutTemplate === 'comparison_matrix' &&
    (outline.contentProfile === 'math' || intent.disciplineStyle === 'math')
      ? language === 'zh-CN'
        ? [
            '数学 comparison_matrix 额外硬约束：',
            '- 必须用 table 生成 4 列：`要判断的句子|定义展开|要找什么|证明动作`。',
            '- 不要使用通用方案表列头，例如“方案/速度/一致性/适用场景”，也不要改成“定义/含义/应用场景”。',
            '- 每行要把一个数学对象或语句转成可证明条件；至少一行必须包含 PagePlan 的具体入口公式或等价完整定义。',
            '- 不要生成输入没有给出的恒等式、定理或额外结论。',
            '- 推荐骨架（替换内容，不要照抄占位词）：',
            '  \\begin{slide}[title={...},template=comparison_matrix,density=standard,profile=math,language=zh-CN]',
            '    \\table[headers={要判断的句子|定义展开|要找什么|证明动作}]{数学语句 A|定义展开 A|需要找到的对象|对应证明动作 \\\\ 数学语句 B|定义展开 B|需要检查的条件|对应证明动作 \\\\ 关键区别|定义边界|要避免的误解|对应检查动作}',
            '    \\summary{阅读规则}{一句话说明学生如何按表格使用这些定义。}',
            '  \\end{slide}',
          ].join('\n')
        : [
            'Extra hard constraint for math comparison_matrix:',
            '- The table must use exactly 4 columns: `Statement|Definition expanded|What to find|Proof action`.',
            '- Do not use generic option-table headers such as "Option/Speed/Consistency/Use case", and do not switch to static columns such as "Definition/Meaning/Application".',
            '- Each row must turn one mathematical object or statement into a provable condition; at least one row must include the PagePlan concrete anchor formula or an equivalent complete definition.',
            '- Do not invent identities, theorems, or extra conclusions that the input did not provide.',
            '- Suggested skeleton (replace content; do not copy placeholders):',
            '  \\begin{slide}[title={...},template=comparison_matrix,density=standard,profile=math,language=en-US]',
            '    \\table[headers={Statement|Definition expanded|What to find|Proof action}]{Statement A|Definition expansion A|Object to find|Proof action \\\\ Statement B|Definition expansion B|Condition to check|Proof action \\\\ Key distinction|Boundary from the definition|Misconception to avoid|Check to apply}',
            '    \\summary{Reading rule}{One sentence explaining how students should use these definitions.}',
            '  \\end{slide}',
          ].join('\n')
      : '';
  if (language === 'zh-CN') {
    return [
      '版式意图（硬约束）：',
      `- layoutFamily: ${intent.layoutFamily}`,
      `- layoutTemplate: ${intent.layoutTemplate || 'auto'}`,
      `- disciplineStyle: ${intent.disciplineStyle || 'general'}`,
      `- teachingFlow: ${intent.teachingFlow || 'standalone'}`,
      `- density: ${intent.density || 'standard'}`,
      `- deckStyle: ${intent.deckStyle || 'classic_business'}`,
      `- visualRole: ${intent.visualRole || 'none'}`,
      `- backgroundStyleId: ${intent.backgroundStyleId || 'auto'}`,
      `- overflowPolicy: ${intent.overflowPolicy || 'compress_first'}`,
      `- preserveFullProblemStatement: ${intent.preserveFullProblemStatement ? 'true' : 'false'}`,
      '- 默认生成一张固定 16:9 的可编辑 PPT 页面：一个主结构、短文本、无隐藏溢出；表格/流程/卡片/公式都要在 renderer 画布内可读。',
      '- 封面页是例外：只输出主视觉、标题和一句短副标题/元信息，不承载正文教学结构。',
      '- code_split 是例外：优先保留关键代码和 trace/state 结构；必要时可以按 overflowPolicy 分页，但不能退成普通 bullet_list。',
      '- 只输出结构化内容和这些版式意图；不要输出坐标。renderer 会决定布局。',
      '- 如果 preserveFullProblemStatement=true，题干完整性优先于压缩。',
      templateContract,
      mathComparisonContract,
    ].join('\n');
  }
  return [
    'Layout intent (hard constraint):',
    `- layoutFamily: ${intent.layoutFamily}`,
    `- layoutTemplate: ${intent.layoutTemplate || 'auto'}`,
    `- disciplineStyle: ${intent.disciplineStyle || 'general'}`,
    `- teachingFlow: ${intent.teachingFlow || 'standalone'}`,
    `- density: ${intent.density || 'standard'}`,
    `- deckStyle: ${intent.deckStyle || 'classic_business'}`,
    `- visualRole: ${intent.visualRole || 'none'}`,
    `- backgroundStyleId: ${intent.backgroundStyleId || 'auto'}`,
    `- overflowPolicy: ${intent.overflowPolicy || 'compress_first'}`,
    `- preserveFullProblemStatement: ${intent.preserveFullProblemStatement ? 'true' : 'false'}`,
    '- Default target is one fixed 16:9 editable PPT slide: one primary structure, compact text, no hidden overflow; tables, processes, cards, and formulas must remain readable inside the renderer canvas.',
    '- Cover pages are the exception: output only the main visual, title, and one short subtitle/meta line, not body teaching structures.',
    '- code_split is the exception: preserve the key code and trace/state structure first; paginate according to overflowPolicy if needed, but do not degrade into an ordinary bullet_list.',
    '- Output structured content and these layout fields only; do not output coordinates.',
    '- If preserveFullProblemStatement=true, preserve the readable problem statement before compressing.',
    templateContract,
    mathComparisonContract,
  ].join('\n');
}

function formatClassicTemplateContractForPrompt(
  template: string,
  language: 'zh-CN' | 'en-US',
): string {
  if (language === 'zh-CN') {
    if (template === 'image_title_overlay') {
      return [
        '- image_title_overlay 的 renderer 输入结构：一张 visual + 1 个短副标题/说明；只有输入中真的有课程名、来源、日期或场景标签时，才加 1 个短标签。',
        '- 这是图片优先的封面/章节页：图片铺满 16:9，renderer 会加深色遮罩，并把标题压在左侧。',
        '- visual 只负责指定背景来源，不承载正文；不要把“封面主视觉/图片/背景图/路线图/阶段”这类占位说明写成 text 或 callout。',
        '- 不要输出 cards、table、process、长讲稿；本页只建立情绪、主题和入口。',
        '- 推荐骨架：',
        '  \\begin{slide}[title={...},template=image_title_overlay,density=light,profile=general,language=zh-CN]',
        '    \\visual[source=built_in_hero_background,role=source_image,fit=cover]',
        '    \\text{一句短副标题，说明这页要把学生带入什么主题。}',
        '    % 可选：只有真实章节/时间/来源标签时才加 \\callout{真实标签}{很短的信息}',
        '  \\end{slide}',
      ].join('\n');
    }
    if (template === 'cinematic_title_frame') {
      return [
        '- cinematic_title_frame 的 renderer 输入结构：一张 visual + 1 个短副标题/说明；只有输入中真的有来源、日期或上下文时才加短元信息。',
        '- 这是电影感标题页：图片铺满 16:9，标题居中，renderer 会加深色遮罩和装饰角标。',
        '- visual 只负责指定背景来源，不承载正文；不要把“电影感主视觉/封面图片/背景图”等占位说明写成 text 或 callout。',
        '- 适合影片/MV/文学艺术/暗色主题的章节封面；不要输出正文卡片、表格或流程。',
        '- 推荐骨架：',
        '  \\begin{slide}[title={...},template=cinematic_title_frame,density=light,profile=general,language=zh-CN]',
        '    \\visual[source=built_in_hero_background,role=source_image,fit=cover]',
        '    \\text{一句短副标题，点出本页的解析角度。}',
        '    % 可选：只有真实来源/日期/章节信息时才加 \\callout{真实标签}{很短的信息}',
        '  \\end{slide}',
      ].join('\n');
    }
    if (template === 'tech_hero_title') {
      return [
        '- tech_hero_title 的 renderer 输入结构：一张 visual + 1 个短副标题/说明；只有输入明确提供 edition/date 时才加版本/日期信息。',
        '- 这是科技/SaaS/产品发布感标题页：图片铺满 16:9，标题居中，renderer 会做暗色叠加和橙色小信息。',
        '- visual 只负责指定背景来源，不承载正文；不要把“科技感主视觉/封面图片/背景图”等占位说明写成 text 或 callout。',
        '- 不要输出 cards、table、process 或长段落；用标题和一句副标题完成开场。',
        '- 推荐骨架：',
        '  \\begin{slide}[title={...},template=tech_hero_title,density=light,profile=general,language=zh-CN]',
        '    \\visual[source=built_in_hero_background,role=source_image,fit=cover]',
        '    \\text{一句短副标题，说明产品/主题/价值判断。}',
        '    % 可选：只有真实 edition/date 时才加 \\callout{真实版本或日期}{很短的信息}',
        '  \\end{slide}',
      ].join('\n');
    }
    if (template === 'pipeline_table') {
      return [
        '- pipeline_table 的 renderer 输入结构：一个短引入 + 2-4 步 process + 3-6 行 table；默认写 3 步 process 和 3 行 table。',
        '- 这类页面要同时给出“判断/流程”和“对照/证据表”，否则不是完整 pipeline_table 页面。',
        '- 表格行必须复用 PagePlan / source facts 里的具体样本、代码 literal、数据点或对象名；不要只写“对象 A / 问题 B”这类泛称。',
        '- table 必须使用 `\\table[headers={...}]{...}` 语义命令输出，不要写成普通正文。',
        '- 推荐骨架（替换占位内容，不要照抄占位词）：',
        '  \\begin{slide}[title={...},template=pipeline_table,density=standard,profile=general,language=zh-CN]',
        '    \\text{用一句话说明本页要判断的对象、旧表示或流程。}',
        '    \\begin{process}[title={判断路径},orientation=horizontal]',
        '      \\step{先看对象}{这个对象需要一起维护哪些状态或阶段}',
        '      \\step{再看旧表示}{旧表示会接受哪些不该接受的状态}',
        '      \\step{最后定边界}{新表示要把哪些规则集中起来}',
        '    \\end{process}',
        '    \\table[headers={对象/表示|会被接受的问题|暴露的边界}]{对象 A|具体错误状态|为什么守不住规则 \\\\ 对象 B|具体错误状态|为什么守不住规则 \\\\ 新表示|集中什么规则|学生应带走的结论}',
        '  \\end{slide}',
      ].join('\n');
    }
    if (template === 'comparison_matrix') {
      return [
        '- comparison_matrix 的 renderer 输入结构：一个对照矩阵 table 为主体，可选 1 个短 takeaway/callout。',
        '- 适合方案比较、维度比较、优缺点、证据矩阵；不要把表格改写成 bullet_list 或多张普通卡片。',
        '- 表格必须有 3-5 个清晰列头，3-6 行；每一行都使用输入中的具体方案、指标、样本或数据点。',
        '- table 必须使用 `\\table[headers={...}]{...}` 语义命令输出，并且每一行单元格数量必须等于 headers 数量。',
        '- 推荐骨架（替换占位内容，不要照抄占位词）：',
        '  \\begin{slide}[title={...},template=comparison_matrix,density=standard,profile=general,language=zh-CN]',
        '    \\table[headers={方案|速度|一致性|适用场景}]{具体方案 A|具体判断|具体判断|具体场景 \\\\ 具体方案 B|具体判断|具体判断|具体场景 \\\\ 具体方案 C|具体判断|具体判断|具体场景}',
        '    \\summary{选择规则}{一句话说明学生应如何根据表格做判断。}',
        '  \\end{slide}',
      ].join('\n');
    }
    if (template === 'process_steps') {
      return [
        '- process_steps 的 renderer 输入结构：一个短上下文 + 3-5 步 process_flow + 可选 1 个短总结。',
        '- 适合流程图、阶段路径、决策链或工作流；不要用表格或四张卡代替流程主体。',
        '- 每个 step 标题用动作短语，正文说明进入下一步的条件或产出；步骤之间必须按时间、依赖或判断顺序排列。',
        '- process 必须使用 `\\begin{process} ... \\step{...}{...} ... \\end{process}` 语义结构输出。',
        '- 推荐骨架（替换占位内容，不要照抄占位词）：',
        '  \\begin{slide}[title={...},template=process_steps,density=standard,profile=general,language=zh-CN]',
        '    \\text{一句话说明这条流程解决什么具体问题。}',
        '    \\begin{process}[title={流程图},orientation=horizontal]',
        '      \\step{第一步动作}{具体输入、动作或进入条件。}',
        '      \\step{第二步动作}{具体输入、动作或进入条件。}',
        '      \\step{第三步动作}{具体输入、动作或进入条件。}',
        '      % 如输入明确有第四/第五步，可继续加 step；不要超过 5 步',
        '    \\end{process}',
        '    \\summary{下一步}{一句话说明走完流程后如何行动。}',
        '  \\end{slide}',
      ].join('\n');
    }
    if (template === 'visual_three_steps') {
      return [
        '- visual_three_steps 的 renderer 输入结构：短解释 + visual + 正好 3 个 step/card。',
        '- 短解释或第一张卡必须直接使用 PagePlan 的具体入口；每张卡正文只写 1-2 个短句，不要把任何结构命令写进卡片正文。',
        '- 推荐骨架：',
        '  \\begin{slide}[title={...},template=visual_three_steps,density=standard,profile=general,language=zh-CN]',
        '    \\text{一句话说明为什么要按这三步看。}',
        '    \\visual[source=gen_img_1]{说明这个图和三步判断的关系}',
        '    \\begin{cards}[columns=3]',
        '      \\card{第一步}{一个具体判断句，带必要代码 literal。}',
        '      \\card{第二步}{一个具体判断句，带必要代码 literal。}',
        '      \\card{第三步}{一个具体判断句，带必要代码 literal。}',
        '    \\end{cards}',
        '  \\end{slide}',
      ].join('\n');
    }
    if (template === 'two_by_one_summary') {
      return [
        '- two_by_one_summary 的 renderer 输入结构：上方两组简洁要点 + 底部 summary/callout。',
        '- 输出 3 个顶层文本块：左栏 point group、右栏 point group、底部总结；不要只写一个 bullet_list。',
        '- 推荐骨架：',
        '  \\begin{slide}[title={...},template=two_by_one_summary,density=standard,profile=general,language=zh-CN]',
        '    \\callout{第一组要点}{2-3 个短句，说明一侧结论或问题。}',
        '    \\callout{第二组要点}{2-3 个短句，说明另一侧结论或职责。}',
        '    \\summary{可迁移结论}{一句话收束学生下次可以照做的判断顺序。}',
        '  \\end{slide}',
      ].join('\n');
    }
    if (template === 'definition_board') {
      return [
        '- definition_board 的 renderer 输入结构：1 个短 definition/callout + 2 个短判断/例子卡 + 可选 1 句 takeaway。',
        '- 这类页面用于“先把定义边界讲清楚”，不是逐步推导页；不要输出 derivation_steps、长 proof、长 bullet_list。',
        '- definition/callout 必须包含本页具体入口里的一个符号、公式或例子；卡片只写短判断，不写完整讲稿。',
        '- 如果 PagePlan 具体入口是 `{(2, ♡), ...}` 这样的样本，必须把它原样放进 callout 或其中一张卡；不能替换成“某个关系/一个样本”。',
        '- 严禁使用 bullet_list，也不要在正文里写 `•`、编号列表或多行清单；每个文本块只写 1 个完整短句。',
        '- 推荐骨架：',
        '  \\begin{slide}[title={...},template=definition_board,density=standard,profile=math,language=zh-CN]',
        '    \\callout{定义边界}{一句话给出定义，并包含一个来自输入的具体符号或例子。}',
        '    \\begin{cards}[columns=2]',
        '      \\card{要检查什么}{一句话说明定义要求。}',
        '      \\card{哪里会出错}{一句话说明常见误读或反例。}',
        '    \\end{cards}',
        '    \\summary{带走的判断}{一句话说明学生下一页要如何使用这个定义。}',
        '  \\end{slide}',
      ].join('\n');
    }
    if (template === 'formula_focus') {
      return [
        '- formula_focus 的 renderer 输入结构：1 个主 `\\formula{...}` + 2-3 个短解释块。',
        '- 主公式必须直接使用 PagePlan 的具体入口或等价完整公式；不要用泛泛的 `f:A\\to B` 替代本页真正要讲的公式。',
        '- `\\formula{...}` 里面只能放纯 LaTeX 数学表达式，不要写“已知/目标/因此/where/given”这类自然语言；这些说明放进 callout 或 summary。',
        '- 解释块用中文短句说明符号含义、判定条件和常见误读；不要写长 bullet_list。',
        '- 推荐骨架：',
        '  \\begin{slide}[title={...},template=formula_focus,density=standard,profile=math,language=zh-CN]',
        '    \\formula{\\frac{dy}{dx}=f^{\\prime}(g(x))\\cdot g^{\\prime}(x)}',
        '    \\callout{怎么读}{一句话解释公式左边和右边分别是什么。}',
        '    \\callout{判定条件}{一句话说明学生要检查哪个条件。}',
        '    \\summary{别误读}{一句话点出最容易混淆的边界。}',
        '  \\end{slide}',
      ].join('\n');
    }
    if (template === 'derivation_ladder') {
      return [
        '- derivation_ladder 的 renderer 输入结构：1 个“已知/目标”短 setup + 1 个 derivation + 1 个“下一步检查”短结论。',
        '- 数学证明/例题页必须有 3-5 个连续 proof step；每个 step 只写一个公式或判断，并写清这一步凭什么合法。',
        '- 不要只给两个大卡片或结论卡；不要把定义、例题和总结压成空泛短句。',
        '- 推荐骨架（替换内容，不要照抄占位词）：',
        '  \\begin{slide}[title={...},template=derivation_ladder,density=standard,profile=math,language=zh-CN]',
        '    \\callout{已知 / 目标}{已知写对象范围；目标写要证明或要判定的语句。}',
        '    \\begin{derivation}[title={证明链}]',
        '      \\step{认定义入口}{写出来自输入的定义或目标公式}',
        '      \\step{改写成可检查条件}{把“属于/相等/存在”改写成一个可证明条件}',
        '      \\step{推出目标或下一步}{写出因此要检查的下一件事}',
        '    \\end{derivation}',
        '    \\summary{下一步检查}{一句话说明学生接下来应该验证哪个条件，避免哪个误读。}',
        '  \\end{slide}',
      ].join('\n');
    }
    if (template === 'three_cards') {
      return [
        '- three_cards 的 renderer 输入结构：正好 3 个并列概念/判断卡片；每张卡只讲一个概念，标题短，正文短。',
        '- 使用 cards 环境输出 3 张卡，不要用普通 paragraph/bullet/process 代替。',
        '- 推荐骨架：',
        '  \\begin{slide}[title={...},template=three_cards,density=standard,profile=general,language=zh-CN]',
        '    \\begin{cards}[columns=3]',
        '      \\card{概念一}{一句定义 + 一个来自输入的具体例子。}',
        '      \\card{概念二}{一句定义 + 一个来自输入的具体例子。}',
        '      \\card{概念三}{一句定义 + 一个来自输入的具体例子。}',
        '    \\end{cards}',
        '  \\end{slide}',
      ].join('\n');
    }
    if (template === 'text_image_split') {
      return [
        '- text_image_split 的 renderer 输入结构：左侧一块短文本，右侧一张 visual。',
        '- 文本只承载本页主判断，并且必须直接使用 PagePlan 的具体入口；图片承载示意图、截图、流程图或对象图。',
        '- 推荐骨架：',
        '  \\begin{slide}[title={...},template=text_image_split,density=standard,profile=general,language=zh-CN]',
        '    \\callout{核心判断}{2-3 个短句，说明学生看图前要抓住什么。}',
        '    \\visual[source=gen_img_1]{说明图片如何支撑这个判断}',
        '  \\end{slide}',
      ].join('\n');
    }
    if (template === 'four_columns') {
      return [
        '- four_columns 的 renderer 输入结构：正好 4 个并列短卡片，适合四类/四步/四个误区。',
        '- 推荐骨架：',
        '  \\begin{slide}[title={...},template=four_columns,density=standard,profile=general,language=zh-CN]',
        '    \\begin{cards}[columns=4]',
        '      \\card{第一类}{一句话说明，带本页具体例子。}',
        '      \\card{第二类}{一句话说明，带本页具体例子。}',
        '      \\card{第三类}{一句话说明，带本页具体例子。}',
        '      \\card{第四类}{一句话说明，带本页具体例子。}',
        '    \\end{cards}',
        '  \\end{slide}',
      ].join('\n');
    }
    if (template === 'grid_2x2') {
      return [
        '- grid_2x2 的 renderer 输入结构：正好 4 张卡，columns=2，适合四象限、2x2 对比或四个概念分组。',
        '- 推荐骨架：',
        '  \\begin{slide}[title={...},template=grid_2x2,density=standard,profile=general,language=zh-CN]',
        '    \\begin{cards}[columns=2]',
        '      \\card{左上}{一个具体点。}',
        '      \\card{右上}{一个具体点。}',
        '      \\card{左下}{一个具体点。}',
        '      \\card{右下}{一个具体点。}',
        '    \\end{cards}',
        '  \\end{slide}',
      ].join('\n');
    }
    if (template === 'two_text_image') {
      return [
        '- two_text_image 的 renderer 输入结构：左侧两块短文本，右侧一张 visual。',
        '- 第一块文本必须直接使用 PagePlan 的具体入口；两块文本分别承担“先看什么 / 再看什么”或“问题 / 规则”的关系。',
        '- 推荐骨架：',
        '  \\begin{slide}[title={...},template=two_text_image,density=standard,profile=general,language=zh-CN]',
        '    \\callout{先看什么}{1-2 个短句，说明第一块判断。}',
        '    \\callout{再看什么}{1-2 个短句，说明第二块判断。}',
        '    \\visual[source=gen_img_1]{说明图片如何连接两块文本}',
        '  \\end{slide}',
      ].join('\n');
    }
    if (template === 'code_split') {
      return [
        '- code_split 的 renderer 输入结构：一个完整 trace/code_walkthrough block；必须同时有代码和执行/状态变化，不要把代码改写成 bullet_list。',
        '- 如果 PagePlan 要求 trace，就优先使用 trace 环境，并在每个 step 里写当前行读了什么、改了什么、状态变成什么。',
        '- 推荐骨架：',
        '  \\begin{slide}[title={...},template=code_split,density=standard,profile=code,language=zh-CN]',
        '    \\begin{trace}[title={执行追踪},lang=python,activeLines={2|3|4}]',
        '      \\code[lang=python]{把输入中的关键代码原样放在这里}',
        '      \\step[line=2,state={self=新 Tweet 对象}]{创建对象入口，并把新对象交给 `self`。}',
        '      \\step[line=3,state={self.userid=who}]{读取参数并写入实例属性。}',
        '      \\step[line=6,state={self.likes=0}]{初始化对象自己的默认状态。}',
        '    \\end{trace}',
        '  \\end{slide}',
      ].join('\n');
    }
  }

  if (template === 'image_title_overlay') {
    return [
      '- image_title_overlay renderer input: one visual + one short subtitle/description; add a short label only when the input includes a real course/source/date/context label.',
      '- This is an image-first cover/section page: the image fills 16:9, and the renderer places a dark overlay with left-aligned title text.',
      '- The visual command only specifies the background source; do not repeat placeholder words like cover image, main image, background image, roadmap, stage, or QA placeholder in text/callout blocks.',
      '- Do not output cards, tables, processes, or narration; the page establishes mood, topic, and entry point.',
      '- Recommended skeleton:',
      '  \\begin{slide}[title={...},template=image_title_overlay,density=light,profile=general,language=en-US]',
      '    \\visual[source=built_in_hero_background,role=source_image,fit=cover]',
      '    \\text{One short subtitle stating the topic or promise.}',
      '    % Optional only for a real chapter/time/source label: \\callout{Real label}{Very short info}',
      '  \\end{slide}',
    ].join('\n');
  }
  if (template === 'cinematic_title_frame') {
    return [
      '- cinematic_title_frame renderer input: one visual + one short subtitle/description; add a short meta line only when the input includes a real source/date/context.',
      '- This is a cinematic title page: the image fills 16:9, with centered title text, dark overlay, and decorative corner brackets.',
      '- The visual command only specifies the background source; do not repeat placeholder words like cinematic cover image, background image, roadmap, stage, or QA placeholder in text/callout blocks.',
      '- Use for film/MV/literature/art/dark editorial section covers; do not output body cards, tables, or workflows.',
      '- Recommended skeleton:',
      '  \\begin{slide}[title={...},template=cinematic_title_frame,density=light,profile=general,language=en-US]',
      '    \\visual[source=built_in_hero_background,role=source_image,fit=cover]',
      '    \\text{One short subtitle naming the analysis angle.}',
      '    % Optional only for a real source/date/section label: \\callout{Real label}{Very short info}',
      '  \\end{slide}',
    ].join('\n');
  }
  if (template === 'tech_hero_title') {
    return [
      '- tech_hero_title renderer input: one visual + one short subtitle/description; add edition/date meta only when the input explicitly includes it.',
      '- This is a tech/SaaS/product-launch title page: the image fills 16:9, title is centered, and the renderer adds a dark overlay plus small accent meta.',
      '- The visual command only specifies the background source; do not repeat placeholder words like tech cover image, background image, roadmap, stage, or QA placeholder in text/callout blocks.',
      '- Do not output cards, tables, processes, or long prose; title and one subtitle should carry the opening.',
      '- Recommended skeleton:',
      '  \\begin{slide}[title={...},template=tech_hero_title,density=light,profile=general,language=en-US]',
      '    \\visual[source=built_in_hero_background,role=source_image,fit=cover]',
      '    \\text{One short subtitle stating the product, topic, or value judgment.}',
      '    % Optional only for a real edition/date: \\callout{Real edition or date}{Very short info}',
      '  \\end{slide}',
    ].join('\n');
  }
  if (template === 'pipeline_table') {
    return [
      '- pipeline_table renderer input: one short lead + a 2-4 step process + a 3-6 row table; default to 3 process steps and 3 table rows.',
      '- The page needs both a judgment/process path and a comparison/evidence table to be a complete pipeline_table page.',
      '- Table rows must reuse concrete examples, code literals, data points, or object names from the PagePlan / source facts; do not use generic placeholders only.',
      '- The table must use the `\\table[headers={...}]{...}` semantic command; do not write it as prose.',
      '- Recommended skeleton (replace placeholders; do not copy placeholder words):',
      '  \\begin{slide}[title={...},template=pipeline_table,density=standard,profile=general,language=en-US]',
      '    \\text{One sentence stating the object, old representation, or workflow being judged.}',
      '    \\begin{process}[title={Judgment path},orientation=horizontal]',
      '      \\step{Read the object}{Which state or stages must stay together}',
      '      \\step{Test the old form}{Which invalid states the old form still accepts}',
      '      \\step{Set the boundary}{Which rules the new representation centralizes}',
      '    \\end{process}',
      '    \\table[headers={Object / form|Accepted problem|Boundary exposed}]{Object A|Concrete invalid state|Why the rule is not protected \\\\ Object B|Concrete invalid state|Why the rule is not protected \\\\ New form|Centralized rule|Student takeaway}',
      '  \\end{slide}',
    ].join('\n');
  }
  if (template === 'comparison_matrix') {
    return [
      '- comparison_matrix renderer input: a comparison table/matrix as the main block, with an optional short takeaway/callout.',
      '- Use it for comparing options, dimensions, tradeoffs, evidence, or pros/cons; do not rewrite the matrix as a bullet list or generic cards.',
      '- The table needs 3-5 clear headers and 3-6 rows; each row must use concrete options, metrics, samples, or data points from the input.',
      '- The table must use the `\\table[headers={...}]{...}` semantic command, and every row must match the number of headers.',
      '- Recommended skeleton (replace placeholders; do not copy placeholder words):',
      '  \\begin{slide}[title={...},template=comparison_matrix,density=standard,profile=general,language=en-US]',
      '    \\table[headers={Option|Speed|Consistency|Best use}]{Concrete option A|Concrete judgment|Concrete judgment|Concrete context \\\\ Concrete option B|Concrete judgment|Concrete judgment|Concrete context \\\\ Concrete option C|Concrete judgment|Concrete judgment|Concrete context}',
      '    \\summary{Decision rule}{One sentence explaining how students should decide from the matrix.}',
      '  \\end{slide}',
    ].join('\n');
  }
  if (template === 'process_steps') {
    return [
      '- process_steps renderer input: one short context lead + a 3-5 step process_flow + an optional short summary.',
      '- Use it for flowcharts, stage paths, decision chains, or workflows; do not replace the process with a table or four generic cards.',
      '- Each step title should be an action phrase, and each body should state the input, action, output, or condition for entering the next step.',
      '- The process must use `\\begin{process} ... \\step{...}{...} ... \\end{process}` as a semantic structure.',
      '- Recommended skeleton (replace placeholders; do not copy placeholder words):',
      '  \\begin{slide}[title={...},template=process_steps,density=standard,profile=general,language=en-US]',
      '    \\text{One sentence naming the concrete problem this flow solves.}',
      '    \\begin{process}[title={Flow},orientation=horizontal]',
      '      \\step{First action}{Concrete input, action, output, or entry condition.}',
      '      \\step{Second action}{Concrete input, action, output, or entry condition.}',
      '      \\step{Third action}{Concrete input, action, output, or entry condition.}',
      '      % Add a fourth/fifth step only when the input clearly requires it; do not exceed 5 steps',
      '    \\end{process}',
      '    \\summary{Next move}{One sentence explaining what to do after the flow.}',
      '  \\end{slide}',
    ].join('\n');
  }
  if (template === 'visual_three_steps') {
    return [
      '- visual_three_steps renderer input: short explanation + visual + exactly 3 steps/cards.',
      '- The short explanation or first card must directly use the PagePlan concrete anchor; each card body is only 1-2 short sentences and must not contain structural commands.',
      '- Recommended skeleton:',
      '  \\begin{slide}[title={...},template=visual_three_steps,density=standard,profile=general,language=en-US]',
      '    \\text{One sentence explaining why these three steps matter.}',
      '    \\visual[source=gen_img_1]{How the visual supports the three-step decision}',
      '    \\begin{cards}[columns=3]',
      '      \\card{Step one}{One concrete judgment sentence with needed code literals.}',
      '      \\card{Step two}{One concrete judgment sentence with needed code literals.}',
      '      \\card{Step three}{One concrete judgment sentence with needed code literals.}',
      '    \\end{cards}',
      '  \\end{slide}',
    ].join('\n');
  }
  if (template === 'two_by_one_summary') {
    return [
      '- two_by_one_summary renderer input: two concise point groups plus one bottom summary/callout.',
      '- Output 3 top-level text blocks: left point group, right point group, bottom takeaway; do not output only one bullet list.',
      '- Recommended skeleton:',
      '  \\begin{slide}[title={...},template=two_by_one_summary,density=standard,profile=general,language=en-US]',
      '    \\callout{First point group}{2-3 short sentences about one side of the conclusion.}',
      '    \\callout{Second point group}{2-3 short sentences about the other side.}',
      '    \\summary{Transfer rule}{One sentence students can reuse next time.}',
      '  \\end{slide}',
    ].join('\n');
  }
  if (template === 'definition_board') {
    return [
      '- definition_board renderer input: 1 short definition/callout + 2 compact judgment/example cards + optional 1-sentence takeaway.',
      '- This page clarifies the boundary of a definition; it is not a step-by-step derivation page. Do not output derivation_steps, long proofs, or long bullet lists.',
      '- The definition/callout must include one concrete symbol, formula, or example from the PagePlan; cards should be short judgments, not narration.',
      '- If the PagePlan concrete anchor is a sample like `{(2, ♡), ...}`, copy it exactly into the callout or one card; do not replace it with "a relation" or "an example".',
      '- Do not use bullet_list and do not place bullets, numbered lists, or multi-line lists inside visible text; each text block should be one complete short sentence.',
      '- Recommended skeleton:',
      '  \\begin{slide}[title={...},template=definition_board,density=standard,profile=math,language=en-US]',
      '    \\callout{Definition boundary}{One sentence defining the object, including one concrete symbol or example from the input.}',
      '    \\begin{cards}[columns=2]',
      '      \\card{What must hold}{One sentence stating the definition requirement.}',
      '      \\card{What can fail}{One sentence naming the common misread or counterexample.}',
      '    \\end{cards}',
      '    \\summary{Use next}{One sentence saying how students should use this definition on the next page.}',
      '  \\end{slide}',
    ].join('\n');
  }
  if (template === 'formula_focus') {
    return [
      '- formula_focus renderer input: one primary `\\formula{...}` plus 2-3 compact explanation blocks.',
      '- The primary formula must directly use the PagePlan concrete anchor or an equivalent complete formula; do not replace the real formula with a generic `f:A\\to B` label.',
      '- `\\formula{...}` must contain only pure LaTeX math, not prose such as "given", "where", "therefore", or "target"; put those explanations in callout or summary blocks.',
      '- Explanation blocks should be short student-facing sentences about symbol meaning, the condition to check, and the common misread; do not output a long bullet_list.',
      '- Recommended skeleton:',
      '  \\begin{slide}[title={...},template=formula_focus,density=standard,profile=math,language=en-US]',
      '    \\formula{\\frac{dy}{dx}=f^{\\prime}(g(x))\\cdot g^{\\prime}(x)}',
      '    \\callout{How to read it}{One sentence explaining the two sides of the formula.}',
      '    \\callout{Condition to check}{One sentence naming the condition students must verify.}',
      '    \\summary{Do not misread}{One sentence naming the most common boundary error.}',
      '  \\end{slide}',
    ].join('\n');
  }
  if (template === 'derivation_ladder') {
    return [
      '- derivation_ladder renderer input: 1 short given/goal setup + 1 derivation block + 1 short next-check conclusion.',
      '- Math proof/worked-example pages need 3-5 connected proof steps; each step contains one formula or judgment and names why the move is legal.',
      '- Do not output only two broad cards or conclusion cards; do not compress the definition, example, and summary into vague short notes.',
      '- Recommended skeleton (replace the content; do not copy placeholders):',
      '  \\begin{slide}[title={...},template=derivation_ladder,density=standard,profile=math,language=en-US]',
      '    \\callout{Given / Goal}{State the object range as the given, then state the exact statement to prove or test.}',
      '    \\begin{derivation}[title={Proof chain}]',
      '      \\step{Enter the definition}{Write the definition or target formula from the input}',
      '      \\step{Rewrite as a checkable condition}{Turn membership/equality/existence into one provable condition}',
      '      \\step{Return to the goal}{State what this proves or what must be checked next}',
      '    \\end{derivation}',
      '    \\summary{Next check}{One sentence naming the next condition students should verify and the misread to avoid.}',
      '  \\end{slide}',
    ].join('\n');
  }
  if (template === 'three_cards') {
    return [
      '- three_cards renderer input: exactly 3 parallel concept/judgment cards; each card needs a short title and compact body.',
      '- Use the cards environment for 3 cards; do not replace it with paragraphs, bullets, or a process.',
      '- Recommended skeleton:',
      '  \\begin{slide}[title={...},template=three_cards,density=standard,profile=general,language=en-US]',
      '    \\begin{cards}[columns=3]',
      '      \\card{Concept one}{One definition sentence plus one concrete example from the input.}',
      '      \\card{Concept two}{One definition sentence plus one concrete example from the input.}',
      '      \\card{Concept three}{One definition sentence plus one concrete example from the input.}',
      '    \\end{cards}',
      '  \\end{slide}',
    ].join('\n');
  }
  if (template === 'text_image_split') {
    return [
      '- text_image_split renderer input: one compact text block on the left plus one visual on the right.',
      '- The text carries the main judgment and must directly use the PagePlan concrete anchor; the visual carries the diagram, screenshot, workflow, or object model.',
      '- Recommended skeleton:',
      '  \\begin{slide}[title={...},template=text_image_split,density=standard,profile=general,language=en-US]',
      '    \\callout{Core judgment}{2-3 short sentences telling students what to notice before reading the visual.}',
      '    \\visual[source=gen_img_1]{How the visual supports this judgment}',
      '  \\end{slide}',
    ].join('\n');
  }
  if (template === 'four_columns') {
    return [
      '- four_columns renderer input: exactly 4 parallel compact cards for four categories, steps, principles, or pitfalls.',
      '- Recommended skeleton:',
      '  \\begin{slide}[title={...},template=four_columns,density=standard,profile=general,language=en-US]',
      '    \\begin{cards}[columns=4]',
      '      \\card{First}{One sentence with a concrete example from the input.}',
      '      \\card{Second}{One sentence with a concrete example from the input.}',
      '      \\card{Third}{One sentence with a concrete example from the input.}',
      '      \\card{Fourth}{One sentence with a concrete example from the input.}',
      '    \\end{cards}',
      '  \\end{slide}',
    ].join('\n');
  }
  if (template === 'grid_2x2') {
    return [
      '- grid_2x2 renderer input: exactly 4 cards with columns=2 for a quadrant, 2x2 comparison, or four grouped concepts.',
      '- Recommended skeleton:',
      '  \\begin{slide}[title={...},template=grid_2x2,density=standard,profile=general,language=en-US]',
      '    \\begin{cards}[columns=2]',
      '      \\card{Top left}{One concrete point.}',
      '      \\card{Top right}{One concrete point.}',
      '      \\card{Bottom left}{One concrete point.}',
      '      \\card{Bottom right}{One concrete point.}',
      '    \\end{cards}',
      '  \\end{slide}',
    ].join('\n');
  }
  if (template === 'two_text_image') {
    return [
      '- two_text_image renderer input: two compact text blocks on the left plus one visual on the right.',
      '- The first text block must directly use the PagePlan concrete anchor; the two blocks should form a clear pair such as "first look / then look" or "problem / rule".',
      '- Recommended skeleton:',
      '  \\begin{slide}[title={...},template=two_text_image,density=standard,profile=general,language=en-US]',
      '    \\callout{First look}{1-2 short sentences for the first judgment.}',
      '    \\callout{Then look}{1-2 short sentences for the second judgment.}',
      '    \\visual[source=gen_img_1]{How the visual connects the two text blocks}',
      '  \\end{slide}',
    ].join('\n');
  }
  if (template === 'code_split') {
    return [
      '- code_split renderer input: one complete trace/code_walkthrough block; it must include both code and execution/state changes, not prose bullets.',
      '- If the PagePlan requires trace, prefer a trace environment and explain what the current line reads, what changes, and what the state becomes.',
      '- Recommended skeleton:',
      '  \\begin{slide}[title={...},template=code_split,density=standard,profile=code,language=en-US]',
      '    \\begin{trace}[title={Execution trace},lang=python,activeLines={2|3|4}]',
      '      \\code[lang=python]{paste the key code from the input here}',
      '      \\step[line=2,state={self=new Tweet object}]{Create the object entrance and bind the new object to `self`.}',
      '      \\step[line=3,state={self.userid=who}]{Read the parameter and write the instance attribute.}',
      '      \\step[line=6,state={self.likes=0}]{Initialize the object-owned default state.}',
      '    \\end{trace}',
      '  \\end{slide}',
    ].join('\n');
  }
  return '';
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

export interface SemanticSlideContentPromptBundle {
  promptId: typeof PROMPT_IDS.SLIDE_SEMANTIC_CONTENT;
  outline: SceneOutline;
  language: 'zh-CN' | 'en-US';
  systemPrompt?: string;
  userPrompt?: string;
  promptVariables?: Record<string, string>;
  mediaContextText: string;
  visionImages?: Array<{ id: string; src: string }>;
  skillSelection: SelectedTeachingSkills | null;
  templateDrivenDocument: NotebookContentDocument | null;
}

export function buildSemanticSlideContentPromptBundle(args: {
  outline: SceneOutline;
  allOutlines?: SceneOutline[];
  assignedImages?: PdfImage[];
  imageMapping?: ImageMapping;
  visionEnabled?: boolean;
  agents?: AgentInfo[];
  courseContext?: CoursePersonalizationContext;
  rewriteReason?: string;
  diagnostics?: SceneContentDiagnostics;
}): SemanticSlideContentPromptBundle | null {
  let outline = normalizeImageFirstHeroOutlineForSceneContent(
    normalizeComputerScienceSceneOutline(coerceRuntimeSceneOutline(args.outline)),
  );
  outline = normalizeImageFirstHeroOutlineForSceneContent(
    normalizeComputerScienceSceneOutline(enrichOutlineWithDeckMemory(outline, args.allOutlines)),
  );
  const lang = outline.language || 'zh-CN';
  const templateDrivenDocument =
    outline.contentProfile === 'math' &&
    outline.layoutIntent?.layoutTemplate === 'comparison_matrix'
      ? null
      : buildTemplateDrivenSemanticDocument(outline, lang);
  const teacherContext = formatTeacherPersonaForPrompt(args.agents, lang);
  const coursePersonalization = formatCoursePersonalizationForPrompt(args.courseContext, lang);
  const contentProfileContext = formatSceneContentProfileContext(outline, lang);
  const archetypeContext = formatSceneArchetypeContext(outline, lang);
  const workedExampleContext = formatWorkedExampleForPrompt(outline.workedExampleConfig, lang);
  const layoutIntentContext = formatLayoutIntentForPrompt(outline, lang);
  const deckContext = formatDeckMemoryForPrompt({
    outline,
    allOutlines: args.allOutlines,
    language: lang,
  });
  const skillSelection = buildTeachingSkillSelectionForOutline({
    outline,
    courseContext: args.courseContext,
  });
  if (args.diagnostics && skillSelection) {
    args.diagnostics.selectedSkillIds =
      args.diagnostics.selectedSkillIds || skillSelection.skillIds;
    args.diagnostics.skillSelectionReasons =
      args.diagnostics.skillSelectionReasons ||
      skillSelection.reasons.map((reason) => `${reason.skillId}: ${reason.reason}`);
  }
  const teachingPagePlanGuidance = formatTeachingPagePlanForPrompt(outline.teachingPagePlan, lang);
  const teachingSkillGuidance = skillSelection
    ? formatTeachingSkillsForPrompt({
        selection: skillSelection,
        stage: 'semantic',
        language: lang,
        pagePlan: outline.teachingPagePlan,
      })
    : '';
  const mediaContext = buildSemanticMediaPromptContext({
    outline,
    language: lang,
    assignedImages: args.assignedImages,
    imageMapping: args.imageMapping,
    visionEnabled: args.visionEnabled,
  });
  const rewriteContext = formatSlideRewriteContext(args.rewriteReason, lang);
  const promptVariables = {
    language: lang,
    title: outline.title,
    description: outline.description,
    keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
    contentProfileContext,
    archetypeContext,
    layoutIntentContext,
    deckContext,
    assignedImages: mediaContext.text,
    teacherContext,
    coursePersonalization,
    workedExampleContext,
    rewriteContext,
    purposeGuidance: '',
    disciplineGuidance: [teachingPagePlanGuidance, teachingSkillGuidance]
      .filter(Boolean)
      .join('\n\n'),
  };

  if (templateDrivenDocument) {
    return {
      promptId: PROMPT_IDS.SLIDE_SEMANTIC_CONTENT,
      outline,
      language: lang,
      promptVariables,
      mediaContextText: mediaContext.text,
      visionImages: mediaContext.visionImages,
      skillSelection,
      templateDrivenDocument,
    };
  }

  const prompts = buildPrompt(PROMPT_IDS.SLIDE_SEMANTIC_CONTENT, promptVariables);
  if (!prompts) return null;

  return {
    promptId: PROMPT_IDS.SLIDE_SEMANTIC_CONTENT,
    outline,
    language: lang,
    systemPrompt: prompts.system,
    userPrompt: prompts.user,
    promptVariables,
    mediaContextText: mediaContext.text,
    visionImages: mediaContext.visionImages,
    skillSelection,
    templateDrivenDocument: null,
  };
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
  outline = normalizeComputerScienceSceneOutline(coerceRuntimeSceneOutline(outline));
  const lang = outline.language || 'zh-CN';
  const normalizedSlideGenerationRoute = normalizeSlideGenerationRoute(slideGenerationRoute);
  const hasTeachingPlanContract = Boolean(
    outline.teachingPlanId || outline.teachingPagePlan || outline.selectedSkillIds?.length,
  );
  const useLegacyElementPipeline =
    normalizedSlideGenerationRoute === 'openmaic-legacy' &&
    !hasTeachingPlanContract &&
    !isComputerScienceOutline(outline);
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
