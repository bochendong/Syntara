import { nanoid } from 'nanoid';
import type {
  GeneratedInteractiveContent,
  GeneratedPBLContent,
  GeneratedQuizContent,
  GeneratedSlideContent,
  SceneOutline,
} from '@/lib/types/generation';
import type { Action } from '@/lib/types/action';
import type { PPTElement } from '@/lib/types/slides';
import type { QuizQuestion } from '@/lib/types/stage';
import type { NotebookContentDocument } from '@/lib/notebook-content';
import type {
  ImageNotebookPagePromptPlan,
  ImageNotebookPromptComponentPlan,
} from '@/lib/generation/image-notebook-quality';
import {
  buildSemanticSpotlightSections,
  flattenSemanticSpotlightTargets,
  semanticSpotlightTargetIds,
} from '@/lib/notebook-content/semantic-spotlight';
import { createLogger } from '@/lib/logger';
import { verbalizeSpeechActions } from '@/lib/audio/spoken-text';
import type {
  AgentInfo,
  AICallFn,
  CoursePersonalizationContext,
  SceneGenerationContext,
} from './pipeline-types';
import {
  parseActionsFromStructuredOutput,
  parseLectureSegmentsFromStructuredOutput,
  type LectureSegment,
} from './action-parser';
import { buildPrompt, PROMPT_IDS } from './prompts';
import {
  buildCourseContext,
  formatAgentsForPrompt,
  formatCoursePersonalizationForPrompt,
  formatWorkedExampleForPrompt,
} from './prompt-formatters';
import { hasUnexpectedCjkForLanguage } from './language-guard';
import { buildTitleCoverOpeningActions, isTitleCoverOutline } from './title-cover';
import { buildCsNarrationActions } from './cs-narration-planner';
import type { TeachingPagePlan } from './teaching-plan';

const log = createLogger('Generation');

type ImageNotebookFocusTargetMetadata = {
  id: string;
  label: string;
  anchors: string[];
};

export async function generateSceneActions(
  outline: SceneOutline,
  content:
    | GeneratedSlideContent
    | GeneratedQuizContent
    | GeneratedInteractiveContent
    | GeneratedPBLContent,
  aiCall: AICallFn,
  ctx?: SceneGenerationContext,
  agents?: AgentInfo[],
  userProfile?: string,
  coursePersonalization?: CoursePersonalizationContext,
): Promise<Action[]> {
  const agentsText = formatAgentsForPrompt(agents);
  const lang = outline.language || 'zh-CN';
  const personalizationText = formatCoursePersonalizationForPrompt(coursePersonalization, lang);
  const mergedCourseContext = [buildCourseContext(ctx), personalizationText]
    .filter(Boolean)
    .join('\n\n');
  const finalizeActions = (
    actions: Action[],
    elements: PPTElement[] = [],
    semanticDocument?: NotebookContentDocument,
  ) => verbalizeSpeechActions(processActions(actions, elements, agents, semanticDocument), lang);
  const finalizeSlideActions = (
    actions: Action[],
    elements: PPTElement[] = [],
    semanticDocument?: NotebookContentDocument,
    options: { ensureOpeningFocus?: boolean } = {},
  ) =>
    verbalizeSpeechActions(
      options.ensureOpeningFocus === false
        ? processActions(actions, elements, agents, semanticDocument)
        : ensureOpeningSpotlight(
            processActions(actions, elements, agents, semanticDocument),
            elements,
            lang,
            semanticDocument,
          ),
      lang,
    );

  if (outline.type === 'slide' && 'elements' in content) {
    if (isTitleCoverOutline(outline)) {
      return verbalizeSpeechActions(
        buildTitleCoverOpeningActions({
          title: outline.title,
          description: outline.description,
          keyPoints: outline.keyPoints,
          language: lang,
          elements: content.elements,
        }),
        lang,
      );
    }

    const elementsText = formatElementsForPrompt(content.elements, content.contentDocument);
    const teachingContext = formatActionTeachingContext(
      outline.teachingPagePlan,
      content.contentDocument,
      lang,
    );
    const workedExampleContext = formatWorkedExampleForPrompt(outline.workedExampleConfig, lang);

    const prompts = buildPrompt(PROMPT_IDS.SLIDE_ACTIONS, {
      language: lang,
      title: outline.title,
      keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
      description: outline.description,
      elements: elementsText,
      courseContext: mergedCourseContext,
      agents: agentsText,
      userProfile: userProfile || '',
      workedExampleContext,
      teachingContext,
    });

    if (!prompts) {
      const semanticFallback = buildSemanticNarrationFallback(
        outline,
        content.elements,
        content.contentDocument,
        lang,
      );
      if (semanticFallback.length > 0) {
        return finalizeSlideActions(semanticFallback, content.elements, content.contentDocument);
      }
      return verbalizeSpeechActions(
        generateDefaultSlideActions(outline, content.elements, content.contentDocument),
        lang,
      );
    }

    const response = await aiCall(prompts.system, prompts.user);
    const lectureSegments = parseLectureSegmentsFromStructuredOutput(response);
    const actions =
      lectureSegments.length > 0
        ? compileLectureSegmentsToActions(lectureSegments, {
            validFocusTargetIds: focusTargetIdsForSlide(content.elements, content.contentDocument),
            language: lang,
            imageNotebookFocusTargets: buildImageNotebookFocusTargetMetadata(
              content.imageNotebookPromptPlan,
            ),
          })
        : parseActionsFromStructuredOutput(response, outline.type);

    if (actions.length > 0) {
      if (hasUnexpectedCjkForLanguage(actions, lang)) {
        log.warn(`Slide actions language mismatch for: ${outline.title}`);
        const semanticFallback = buildSemanticNarrationFallback(
          outline,
          content.elements,
          content.contentDocument,
          lang,
        );
        if (semanticFallback.length > 0) {
          return finalizeSlideActions(semanticFallback, content.elements, content.contentDocument);
        }
        return verbalizeSpeechActions(
          generateDefaultSlideActions(outline, content.elements, content.contentDocument),
          lang,
        );
      }
      return finalizeSlideActions(actions, content.elements, content.contentDocument, {
        ensureOpeningFocus: false,
      });
    }

    const semanticFallback = buildSemanticNarrationFallback(
      outline,
      content.elements,
      content.contentDocument,
      lang,
    );
    if (semanticFallback.length > 0) {
      return finalizeSlideActions(semanticFallback, content.elements, content.contentDocument);
    }

    return verbalizeSpeechActions(
      generateDefaultSlideActions(outline, content.elements, content.contentDocument),
      lang,
    );
  }

  if (outline.type === 'quiz' && 'questions' in content) {
    const questionsText = formatQuestionsForPrompt(content.questions);

    const prompts = buildPrompt(PROMPT_IDS.QUIZ_ACTIONS, {
      language: lang,
      title: outline.title,
      keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
      description: outline.description,
      questions: questionsText,
      courseContext: mergedCourseContext,
      agents: agentsText,
    });

    if (!prompts) {
      return verbalizeSpeechActions(generateDefaultQuizActions(outline), lang);
    }

    const response = await aiCall(prompts.system, prompts.user);
    const actions = parseActionsFromStructuredOutput(response, outline.type);

    if (actions.length > 0) {
      if (hasUnexpectedCjkForLanguage(actions, lang)) {
        log.warn(`Quiz actions language mismatch for: ${outline.title}`);
        return verbalizeSpeechActions(generateDefaultQuizActions(outline), lang);
      }
      return finalizeActions(actions);
    }

    return verbalizeSpeechActions(generateDefaultQuizActions(outline), lang);
  }

  if (outline.type === 'interactive' && 'html' in content) {
    const config = outline.interactiveConfig;
    const prompts = buildPrompt(PROMPT_IDS.INTERACTIVE_ACTIONS, {
      language: lang,
      title: outline.title,
      keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
      description: outline.description,
      conceptName: config?.conceptName || outline.title,
      designIdea: config?.designIdea || '',
      courseContext: mergedCourseContext,
      agents: agentsText,
    });

    if (!prompts) {
      return verbalizeSpeechActions(generateDefaultInteractiveActions(outline), lang);
    }

    const response = await aiCall(prompts.system, prompts.user);
    const actions = parseActionsFromStructuredOutput(response, outline.type);

    if (actions.length > 0) {
      if (hasUnexpectedCjkForLanguage(actions, lang)) {
        log.warn(`Interactive actions language mismatch for: ${outline.title}`);
        return verbalizeSpeechActions(generateDefaultInteractiveActions(outline), lang);
      }
      return finalizeActions(actions);
    }

    return verbalizeSpeechActions(generateDefaultInteractiveActions(outline), lang);
  }

  if (outline.type === 'pbl' && 'projectConfig' in content) {
    const pblConfig = outline.pblConfig;
    const prompts = buildPrompt(PROMPT_IDS.PBL_ACTIONS, {
      language: lang,
      title: outline.title,
      keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
      description: outline.description,
      projectTopic: pblConfig?.projectTopic || outline.title,
      projectDescription: pblConfig?.projectDescription || outline.description,
      courseContext: mergedCourseContext,
      agents: agentsText,
    });

    if (!prompts) {
      return verbalizeSpeechActions(generateDefaultPBLActions(outline), lang);
    }

    const response = await aiCall(prompts.system, prompts.user);
    const actions = parseActionsFromStructuredOutput(response, outline.type);

    if (actions.length > 0) {
      return finalizeActions(actions);
    }

    return verbalizeSpeechActions(generateDefaultPBLActions(outline), lang);
  }

  return [];
}

export function buildFallbackSceneActions(
  outline: SceneOutline,
  content:
    | GeneratedSlideContent
    | GeneratedQuizContent
    | GeneratedInteractiveContent
    | GeneratedPBLContent,
  agents?: AgentInfo[],
): Action[] {
  const lang = outline.language || 'zh-CN';
  if (outline.type === 'slide' && 'elements' in content) {
    const csNarrationActions = buildCsNarrationActions({
      document: content.contentDocument,
      title: outline.title,
      language: lang,
    });
    if (csNarrationActions.length > 0) {
      return verbalizeSpeechActions(
        ensureOpeningSpotlight(
          processActions(csNarrationActions, content.elements, agents, content.contentDocument),
          content.elements,
          lang,
          content.contentDocument,
        ),
        lang,
      );
    }

    const teachingPlanActions = buildTeachingPagePlanActions(
      outline.teachingPagePlan,
      content.elements,
      content.contentDocument,
      lang,
    );
    if (teachingPlanActions.length > 0) {
      return verbalizeSpeechActions(
        ensureOpeningSpotlight(
          processActions(teachingPlanActions, content.elements, agents, content.contentDocument),
          content.elements,
          lang,
          content.contentDocument,
        ),
        lang,
      );
    }

    return verbalizeSpeechActions(
      generateDefaultSlideActions(outline, content.elements, content.contentDocument),
      lang,
    );
  }

  if (outline.type === 'quiz' && 'questions' in content) {
    return verbalizeSpeechActions(generateDefaultQuizActions(outline), lang);
  }

  if (outline.type === 'interactive' && 'html' in content) {
    return verbalizeSpeechActions(generateDefaultInteractiveActions(outline), lang);
  }

  if (outline.type === 'pbl' && 'projectConfig' in content) {
    return verbalizeSpeechActions(generateDefaultPBLActions(outline), lang);
  }

  return verbalizeSpeechActions(processActions([], [], agents), lang);
}

function generateDefaultPBLActions(outline: SceneOutline): Action[] {
  const lang = outline.language || 'zh-CN';
  return [
    {
      id: `action_${nanoid(8)}`,
      type: 'speech',
      title: lang === 'zh-CN' ? 'PBL 项目介绍' : 'PBL project introduction',
      text:
        lang === 'zh-CN'
          ? '现在让我们开始一个项目式学习活动。请选择你的角色，查看任务看板，开始协作完成项目。'
          : 'Let us begin a project-based learning activity. Choose your role, review the task board, and start collaborating on the project.',
    },
  ];
}

function buildSemanticNarrationFallback(
  outline: SceneOutline,
  elements: PPTElement[],
  semanticDocument: NotebookContentDocument | undefined,
  language: 'zh-CN' | 'en-US' | string,
): Action[] {
  const csNarrationActions = buildCsNarrationActions({
    document: semanticDocument,
    title: outline.title,
    language,
  });
  if (csNarrationActions.length > 0) return csNarrationActions;

  return buildTeachingPagePlanActions(
    outline.teachingPagePlan,
    elements,
    semanticDocument,
    language,
  );
}

function buildTeachingPagePlanActions(
  pagePlan: TeachingPagePlan | undefined,
  elements: PPTElement[],
  semanticDocument: NotebookContentDocument | undefined,
  language: 'zh-CN' | 'en-US' | string,
  options: { preludeOnly?: boolean } = {},
): Action[] {
  if (!pagePlan) return [];
  const lang = language === 'en-US' ? 'en-US' : 'zh-CN';
  const targetId =
    pickSemanticSpotlightTarget(semanticDocument) || pickSpotlightTarget(elements)?.id;
  const nextId = () => `action_${nanoid(8)}`;
  const actions: Action[] = [];

  if (targetId) {
    actions.push({
      id: nextId(),
      type: 'spotlight',
      title: lang === 'zh-CN' ? '聚焦课堂入口' : 'Focus the teaching entry',
      elementId: targetId,
      dimOpacity: 0.5,
    });
  }

  const opening =
    lang === 'zh-CN'
      ? `${pagePlan.openingMove} 这一步先别急着记结论，先问：${pagePlan.studentThinkingMove}`
      : `${pagePlan.openingMove} Do not rush to the conclusion; first ask: ${pagePlan.studentThinkingMove}`;

  actions.push({
    id: nextId(),
    type: 'speech',
    title: lang === 'zh-CN' ? '课堂导入' : 'Teaching opening',
    text: opening,
    speed: 1,
  });

  if (options.preludeOnly) return actions;

  actions.push({
    id: nextId(),
    type: 'speech',
    title: lang === 'zh-CN' ? '迁移检查' : 'Transfer check',
    text:
      lang === 'zh-CN'
        ? `把这一页带走的方法是：${pagePlan.transferRule}`
        : `The method to carry forward is: ${pagePlan.transferRule}`,
    speed: 1,
  });

  return actions;
}

function formatActionTeachingContext(
  pagePlan: TeachingPagePlan | undefined,
  semanticDocument: NotebookContentDocument | undefined,
  language: 'zh-CN' | 'en-US' | string,
): string {
  const lang = language === 'en-US' ? 'en-US' : 'zh-CN';
  const sections: string[] = [];

  if (pagePlan) {
    sections.push(
      lang === 'zh-CN'
        ? [
            '## PagePlan（讲稿的主要输入）',
            `- 页面角色：${pagePlan.role}`,
            `- 具体入口：${pagePlan.concreteAnchor}`,
            `- 学生思考动作：${pagePlan.studentThinkingMove}`,
            `- 迁移规则：${pagePlan.transferRule}`,
            `- 建议组件：${pagePlan.requiredComponentKinds.join(', ') || '无'}`,
          ].join('\n')
        : [
            '## PagePlan (primary input for narration)',
            `- Page role: ${pagePlan.role}`,
            `- Concrete anchor: ${pagePlan.concreteAnchor}`,
            `- Student thinking move: ${pagePlan.studentThinkingMove}`,
            `- Transfer rule: ${pagePlan.transferRule}`,
            `- Suggested components: ${pagePlan.requiredComponentKinds.join(', ') || 'none'}`,
          ].join('\n'),
    );
  }

  if (semanticDocument) {
    const sectionsForDocument = buildSemanticSpotlightSections(semanticDocument);
    const targets = flattenSemanticSpotlightTargets(sectionsForDocument);
    const targetLines = targets.slice(0, 12).map((target) => {
      const title = target.title ? ` title="${target.title}"` : '';
      const text = target.text.replace(/\s+/g, ' ').slice(0, 420);
      return `- id="${target.id}" type="${target.block.type}"${title}: ${text}${
        target.text.length > 420 ? '...' : ''
      }`;
    });
    sections.push(
      [
        lang === 'zh-CN'
          ? '## 当前页面语义内容（讲稿事实来源）'
          : '## Current semantic slide content',
        `- title: ${semanticDocument.title || ''}`,
        `- profile: ${semanticDocument.profile || 'general'}`,
        `- archetype: ${semanticDocument.archetype || 'concept'}`,
        ...targetLines,
      ].join('\n'),
    );
  }

  return sections.join('\n\n');
}

function focusTargetIdsForSlide(
  elements: PPTElement[],
  semanticDocument?: NotebookContentDocument,
): Set<string> {
  const ids = new Set(elements.map((element) => element.id).filter(Boolean));
  if (semanticDocument) {
    for (const id of semanticSpotlightTargetIds(semanticDocument)) ids.add(id);
  }
  return ids;
}

function normalizeFocusText(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/[“”"'`·,，.。:：;；!?！？()[\]{}<>《》、/\\|_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const IMAGE_NOTEBOOK_FOCUS_STOP_ANCHORS = new Set([
  'in',
  's',
  'py',
  'startswith',
  'endswith',
  'start',
  'end',
  'true',
  'false',
  '开头',
  '出现',
  '结尾',
  '判断',
  '方法',
  '对应',
  '题目',
  '任务',
  '区域',
  '内容',
  '本页',
]);

function collectFocusAnchors(text: string): string[] {
  const normalized = normalizeFocusText(text);
  if (!normalized) return [];
  const anchors = new Set<string>();
  if (normalized.length >= 3 && normalized.length <= 42) anchors.add(normalized);

  for (const token of normalized.match(/[a-z][a-z0-9_]{2,}/g) || []) {
    if (!IMAGE_NOTEBOOK_FOCUS_STOP_ANCHORS.has(token)) anchors.add(token);
  }
  for (const token of normalized.match(/[\u4e00-\u9fff]{2,}/g) || []) {
    if (!IMAGE_NOTEBOOK_FOCUS_STOP_ANCHORS.has(token)) anchors.add(token);
    for (let size = 2; size <= Math.min(4, token.length); size += 1) {
      for (let i = 0; i <= token.length - size; i += 1) {
        const piece = token.slice(i, i + size);
        if (!IMAGE_NOTEBOOK_FOCUS_STOP_ANCHORS.has(piece)) anchors.add(piece);
      }
    }
  }
  return [...anchors];
}

function componentFocusAnchors(component: ImageNotebookPromptComponentPlan): string[] {
  const raw = [
    component.label,
    component.role,
    component.layoutSlot,
    ...(component.visibleText || []),
    ...(component.formulas || []),
    component.diagramPrompt || '',
  ];
  const anchors = new Set<string>();
  raw.forEach((item) => collectFocusAnchors(item).forEach((anchor) => anchors.add(anchor)));
  return [...anchors].slice(0, 80);
}

function buildImageNotebookFocusTargetMetadata(
  promptPlan?: ImageNotebookPagePromptPlan,
): Map<string, ImageNotebookFocusTargetMetadata> | undefined {
  if (!promptPlan?.componentPlans?.length) return undefined;
  const recoveredIds = new Set(
    (promptPlan.recoveryResult?.components || [])
      .filter((component) => component.bbox)
      .map((component) => component.componentId),
  );
  const focusTargets = new Map<string, ImageNotebookFocusTargetMetadata>();
  for (const component of promptPlan.componentPlans) {
    if (!component.participatesInMask) continue;
    if (recoveredIds.size > 0 && !recoveredIds.has(component.id)) continue;
    focusTargets.set(component.id, {
      id: component.id,
      label: component.label,
      anchors: componentFocusAnchors(component),
    });
  }
  return focusTargets.size ? focusTargets : undefined;
}

function segmentMatchesImageNotebookTarget(
  segmentText: string,
  target: ImageNotebookFocusTargetMetadata,
): boolean {
  const segment = normalizeFocusText(segmentText);
  if (!segment) return false;

  const label = normalizeFocusText(target.label);
  if (label && (segment.includes(label) || label.includes(segment))) return true;

  let hits = 0;
  for (const anchor of target.anchors) {
    if (!anchor || IMAGE_NOTEBOOK_FOCUS_STOP_ANCHORS.has(anchor)) continue;
    if (segment.includes(anchor)) hits += anchor.length >= 4 ? 2 : 1;
    if (hits >= 3) return true;
  }
  return false;
}

function compileLectureSegmentsToActions(
  segments: LectureSegment[],
  options: {
    validFocusTargetIds: Set<string>;
    language: string;
    imageNotebookFocusTargets?: Map<string, ImageNotebookFocusTargetMetadata>;
  },
): Action[] {
  const actions: Action[] = [];
  const lang = options.language === 'en-US' ? 'en-US' : 'zh-CN';

  for (const segment of segments) {
    const targetMetadata = segment.focusTargetId
      ? options.imageNotebookFocusTargets?.get(segment.focusTargetId)
      : undefined;
    const focusMatchesImageNotebookTarget =
      !options.imageNotebookFocusTargets ||
      Boolean(targetMetadata && segmentMatchesImageNotebookTarget(segment.text, targetMetadata));

    if (
      segment.focusTargetId &&
      options.validFocusTargetIds.has(segment.focusTargetId) &&
      focusMatchesImageNotebookTarget
    ) {
      actions.push({
        id: `action_${nanoid(8)}`,
        type: 'spotlight',
        title: lang === 'zh-CN' ? '聚焦当前讲解区域' : 'Focus current explanation area',
        elementId: segment.focusTargetId,
        dimOpacity: 0.55,
      });
    }
    actions.push({
      id: segment.id || `action_${nanoid(8)}`,
      type: 'speech',
      title: segment.title,
      text: segment.text,
      speed: 1,
    });
  }

  return actions;
}

function formatElementsForPrompt(
  elements: PPTElement[],
  semanticDocument?: NotebookContentDocument,
): string {
  if (semanticDocument) {
    const sections = buildSemanticSpotlightSections(semanticDocument);
    const blockTargets = flattenSemanticSpotlightTargets(sections);
    const targets = [
      `- id: "header", type: "semantic-header", Content summary: "${(
        semanticDocument.title || ''
      ).slice(0, 80)}"`,
      ...blockTargets.map((target) => {
        const summary = target.text.slice(0, 120);
        const titleHint = target.title ? `title: "${target.title}", ` : '';
        return `- id: "${target.id}", type: "semantic-block", section: "${target.sectionId}", ${titleHint}Content summary: "${summary}${target.text.length > 120 ? '...' : ''}"`;
      }),
    ];
    return targets.join('\n');
  }

  return elements
    .map((el) => {
      let summary = '';
      const nameHint = el.name ? `name: "${el.name}", ` : '';
      if (el.type === 'text' && 'content' in el) {
        const textContent = ((el.content as string) || '').replace(/<[^>]*>/g, '').substring(0, 50);
        summary = `Content summary: "${textContent}${textContent.length >= 50 ? '...' : ''}"`;
      } else if (el.type === 'chart' && 'chartType' in el) {
        summary = `Chart type: ${el.chartType}`;
      } else if (el.type === 'image') {
        summary = 'Image element';
      } else if (el.type === 'shape' && 'shapeName' in el) {
        summary = `Shape: ${el.shapeName || 'unknown'}`;
      } else if (el.type === 'latex' && 'latex' in el) {
        summary = `Formula: ${((el.latex as string) || '').substring(0, 30)}`;
      } else {
        summary = `${el.type} element`;
      }
      return `- id: "${el.id}", type: "${el.type}", ${nameHint}${summary}`;
    })
    .join('\n');
}

function formatQuestionsForPrompt(questions: QuizQuestion[]): string {
  return questions
    .map((q, i) => {
      const optionsText = q.options ? `Options: ${q.options.join(', ')}` : '';
      return `Q${i + 1} (${q.type}): ${q.question}\n${optionsText}`;
    })
    .join('\n\n');
}

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isGeneratedLectureFocusElement(element: PPTElement): boolean {
  return /lecture-focus-generated|semantic-hit-map/i.test(`${element.id} ${element.name || ''}`);
}

function isSpotlightableElement(element: PPTElement): boolean {
  if (element.type === 'line' || element.type === 'audio') return false;
  if (isGeneratedLectureFocusElement(element)) return true;
  if (element.type === 'text') return stripHtml(element.content).length > 0;
  if (element.type === 'shape') return stripHtml(element.text?.content || '').length > 0;
  return true;
}

function pickSpotlightTarget(elements: PPTElement[]): PPTElement | undefined {
  const candidates = elements
    .filter(isSpotlightableElement)
    .sort((a, b) => a.top - b.top || a.left - b.left);
  if (candidates.length === 0) return undefined;

  return (
    candidates.find(isGeneratedLectureFocusElement) ||
    candidates.find(
      (element) => !(element.type === 'text' && element.textType === 'title') && element.top >= 90,
    ) ||
    candidates.find((element) => !(element.type === 'text' && element.textType === 'title')) ||
    candidates[0]
  );
}

function pickSemanticSpotlightTarget(document?: NotebookContentDocument): string | undefined {
  if (!document) return undefined;
  const sections = buildSemanticSpotlightSections(document);
  return flattenSemanticSpotlightTargets(sections)[0]?.id || sections[0]?.id || 'header';
}

function ensureOpeningSpotlight(
  actions: Action[],
  elements: PPTElement[],
  language: string,
  semanticDocument?: NotebookContentDocument,
): Action[] {
  const semanticTargetId = pickSemanticSpotlightTarget(semanticDocument);
  const target = semanticTargetId ? null : pickSpotlightTarget(elements);
  const targetId = semanticTargetId || target?.id;
  if (!targetId) return actions;

  const firstSpeechIndex = actions.findIndex((action) => action.type === 'speech');
  const searchUntil = firstSpeechIndex >= 0 ? firstSpeechIndex : actions.length;
  const hasOpeningSpotlight = actions
    .slice(0, searchUntil)
    .some((action) => action.type === 'spotlight');

  if (hasOpeningSpotlight) return actions;

  const spotlightAction: Action = {
    id: `action_${nanoid(8)}`,
    type: 'spotlight',
    title: language === 'zh-CN' ? '聚焦当前讲解区域' : 'Focus current explanation area',
    elementId: targetId,
    dimOpacity: 0.55,
  };

  if (firstSpeechIndex < 0) return [spotlightAction, ...actions];
  const nextActions = [...actions];
  nextActions.splice(firstSpeechIndex, 0, spotlightAction);
  return nextActions;
}

function processActions(
  actions: Action[],
  elements: PPTElement[],
  agents?: AgentInfo[],
  semanticDocument?: NotebookContentDocument,
): Action[] {
  const targetIds = focusTargetIdsForSlide(elements, semanticDocument);
  const agentIds = new Set(agents?.map((a) => a.id) || []);
  const studentAgents = agents?.filter((a) => a.role === 'student') || [];
  const nonTeacherAgents = agents?.filter((a) => a.role !== 'teacher') || [];

  return actions.flatMap((action) => {
    const processedAction: Action = {
      ...action,
      id: action.id || `action_${nanoid(8)}`,
    };

    if (processedAction.type === 'spotlight') {
      const spotlightAction = processedAction;
      if (!spotlightAction.elementId || !targetIds.has(spotlightAction.elementId)) {
        log.warn(
          `Invalid spotlight elementId, dropping focus action: ${spotlightAction.elementId}`,
        );
        return [];
      }
    }

    if (processedAction.type === 'laser') {
      const laserAction = processedAction;
      if (!laserAction.elementId || !targetIds.has(laserAction.elementId)) {
        log.warn(`Invalid laser elementId, dropping focus action: ${laserAction.elementId}`);
        return [];
      }
    }

    if (processedAction.type === 'discussion' && agents && agents.length > 0) {
      if (processedAction.agentId && agentIds.has(processedAction.agentId)) {
        // Keep valid assigned agent.
      } else {
        const pool = studentAgents.length > 0 ? studentAgents : nonTeacherAgents;
        if (pool.length > 0) {
          const picked = pool[Math.floor(Math.random() * pool.length)];
          log.warn(
            `Discussion agentId "${processedAction.agentId || '(none)'}" invalid, assigned: ${picked.id} (${picked.name})`,
          );
          processedAction.agentId = picked.id;
        }
      }
    }

    return [processedAction];
  });
}

function generateDefaultSlideActions(
  outline: SceneOutline,
  elements: PPTElement[],
  semanticDocument?: NotebookContentDocument,
): Action[] {
  const semanticTargetId = pickSemanticSpotlightTarget(semanticDocument);

  if (outline.workedExampleConfig) {
    const cfg = outline.workedExampleConfig;
    const lang = outline.language || 'zh-CN';
    const role = cfg.role;
    const spotlightTargetId =
      semanticTargetId ||
      (
        elements.find((el) => el.name === 'problem_statement_text') ||
        elements.find((el) => el.name === 'walkthrough_steps_text') ||
        elements.find((el) => el.name === 'final_answer_text') ||
        elements.find((el) => el.name?.includes('solution_plan_text')) ||
        pickSpotlightTarget(elements)
      )?.id;

    const speechByRole =
      lang === 'zh-CN'
        ? {
            problem_statement: `先把题目读清楚。${cfg.problemStatement || outline.description || '这一页先明确题目本身。'}${cfg.asks?.length ? `本题真正要完成的是：${cfg.asks.join('；')}。` : ''}${cfg.constraints?.length ? `同时别忽略这些条件：${cfg.constraints.slice(0, 2).join('；')}。` : ''}`,
            givens_and_goal: `这一步先拆已知和目标。${cfg.givens?.length ? `已知信息包括：${cfg.givens.join('；')}。` : ''}${cfg.asks?.length ? `我们要解决的是：${cfg.asks.join('；')}。` : ''}`,
            constraints: `先把限制条件看清楚。${cfg.constraints?.length ? `关键约束有：${cfg.constraints.join('；')}。` : ''}这些条件会直接决定后面能不能用对方法。`,
            solution_plan: `先不要急着展开细节，我们先看解题路线。${cfg.solutionPlan?.length ? cfg.solutionPlan.join('；') + '。' : outline.description || '这一页先建立整体思路。'}`,
            walkthrough: `现在进入正式推演。${cfg.walkthroughSteps?.length ? cfg.walkthroughSteps.join('；') + '。' : outline.keyPoints.join('；') + '。'}每一步都要对应题目条件，不能跳步。`,
            pitfalls: `这里最容易出错。${cfg.commonPitfalls?.length ? `常见误区包括：${cfg.commonPitfalls.join('；')}。` : ''}讲题时要特别提醒学生这些地方为什么会错。`,
            summary: `最后做一个收束。${cfg.finalAnswer ? `结论可以概括为：${cfg.finalAnswer}。` : ''}${cfg.commonPitfalls?.length ? `同时记住这些易错点：${cfg.commonPitfalls.slice(0, 2).join('；')}。` : ''}`,
          }
        : {
            problem_statement: `Let us first make the problem itself clear. ${cfg.problemStatement || outline.description || 'This page is about understanding the question before solving it.'}${cfg.asks?.length ? ` The core task is: ${cfg.asks.join('; ')}.` : ''}${cfg.constraints?.length ? ` Keep these constraints in mind: ${cfg.constraints.slice(0, 2).join('; ')}.` : ''}`,
            givens_and_goal: `This step separates the givens from the goal. ${cfg.givens?.length ? `We know: ${cfg.givens.join('; ')}.` : ''}${cfg.asks?.length ? `We need to determine: ${cfg.asks.join('; ')}.` : ''}`,
            constraints: `Before solving, make the constraints explicit. ${cfg.constraints?.length ? `Key conditions are: ${cfg.constraints.join('; ')}.` : ''} These conditions shape the method we can use.`,
            solution_plan: `Before diving into details, let us map out the strategy. ${cfg.solutionPlan?.length ? cfg.solutionPlan.join('; ') + '.' : outline.description || 'This page sets up the overall approach.'}`,
            walkthrough: `Now we move through the solution step by step. ${cfg.walkthroughSteps?.length ? cfg.walkthroughSteps.join('; ') + '.' : outline.keyPoints.join('; ') + '.'} Each step should be justified by the problem conditions.`,
            pitfalls: `This is where students commonly go wrong. ${cfg.commonPitfalls?.length ? `Typical pitfalls include: ${cfg.commonPitfalls.join('; ')}.` : ''} It is worth pausing to explain why these mistakes happen.`,
            summary: `Let us close the example cleanly. ${cfg.finalAnswer ? `The conclusion is: ${cfg.finalAnswer}.` : ''}${cfg.commonPitfalls?.length ? ` Also remember these pitfalls: ${cfg.commonPitfalls.slice(0, 2).join('; ')}.` : ''}`,
          };

    const actions: Action[] = [];
    if (spotlightTargetId) {
      actions.push({
        id: `action_${nanoid(8)}`,
        type: 'spotlight',
        title: lang === 'zh-CN' ? '聚焦讲题核心区域' : 'Focus worked-example area',
        elementId: spotlightTargetId,
      });
    }
    actions.push({
      id: `action_${nanoid(8)}`,
      type: 'speech',
      title: lang === 'zh-CN' ? '例题讲解' : 'Worked example explanation',
      text: speechByRole[role],
    });
    return actions;
  }

  const actions: Action[] = [];
  const lang = outline.language || 'zh-CN';

  const spotlightTargetId = semanticTargetId || pickSpotlightTarget(elements)?.id;
  if (spotlightTargetId) {
    actions.push({
      id: `action_${nanoid(8)}`,
      type: 'spotlight',
      title: lang === 'zh-CN' ? '聚焦重点' : 'Focus key point',
      elementId: spotlightTargetId,
      dimOpacity: 0.55,
    });
  }

  const speechText = outline.keyPoints?.length
    ? lang === 'zh-CN'
      ? outline.keyPoints.join('。') + '。'
      : `${outline.keyPoints.join('. ')}.`
    : outline.description || outline.title;
  actions.push({
    id: `action_${nanoid(8)}`,
    type: 'speech',
    title: lang === 'zh-CN' ? '场景讲解' : 'Scene explanation',
    text: speechText,
  });

  return actions;
}

function generateDefaultQuizActions(outline: SceneOutline): Action[] {
  const lang = outline.language || 'zh-CN';
  return [
    {
      id: `action_${nanoid(8)}`,
      type: 'speech',
      title: lang === 'zh-CN' ? '测验引导' : 'Quiz introduction',
      text:
        lang === 'zh-CN'
          ? '现在让我们来做一个小测验，检验一下学习成果。'
          : 'Let us do a short quiz to check what we have learned.',
    },
  ];
}

function generateDefaultInteractiveActions(outline: SceneOutline): Action[] {
  const lang = outline.language || 'zh-CN';
  return [
    {
      id: `action_${nanoid(8)}`,
      type: 'speech',
      title: lang === 'zh-CN' ? '交互引导' : 'Interactive introduction',
      text:
        lang === 'zh-CN'
          ? '现在让我们通过交互式可视化来探索这个概念。请尝试操作页面中的元素，观察变化。'
          : 'Let us explore this concept through an interactive visualization. Try manipulating the on-screen elements and observe what changes.',
    },
  ];
}
