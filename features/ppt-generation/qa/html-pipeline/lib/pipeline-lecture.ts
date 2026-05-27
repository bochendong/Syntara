import type { TeachingComponentKind, TeachingRole } from '@/lib/generation/teaching-plan/types';
import type { SceneOutline } from '@/lib/types/generation';
import type { PPTElement } from '@/lib/types/slides';

import { getSlideCanvasHeight } from './pipeline-format';
import { compactText } from './pipeline-html';
import { backendFetchWithTimeout, getPipelineHeaders } from './pipeline-network';
import type {
  LectureActionPlanItem,
  HtmlPageResult,
  LecturePageResult,
  LectureTarget,
  LessonPlan,
  LessonSlidePlan,
  SceneActionsApiResponse,
  SceneActionApiAction,
  SlideTeachingOutline,
} from './pipeline-types';
import { LECTURE_ACTION_REQUEST_TIMEOUT_MS } from './pipeline-types';

export function uniqueLectureTargets(targets: Array<LectureTarget | undefined>): LectureTarget[] {
  const seen = new Set<string>();
  return targets.filter((target): target is LectureTarget => {
    if (!target || seen.has(target.id)) return false;
    seen.add(target.id);
    return true;
  });
}

export function cleanLectureSpeechText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/([。！？；])+/g, '$1')
    .replace(/\s+([，。！？；：,.!?;:])/g, '$1')
    .trim();
}

export function sentence(value: string | undefined | null): string {
  const text = cleanLectureSpeechText(value || '').replace(/[。！？；,.!?;:]+$/g, '');
  return text ? `${text}。` : '';
}

export function firstMeaningful(items: Array<string | undefined | null>): string {
  return items.map((item) => cleanLectureSpeechText(item || '')).find(Boolean) || '';
}

export function targetCue(target: LectureTarget | undefined, maxLength = 96): string {
  if (!target) return '当前聚焦区域';
  return compactText(target.text || target.label || target.selector || target.id, maxLength);
}

export function findSlideOutline(
  plan: LessonPlan,
  slide: LessonSlidePlan,
): SlideTeachingOutline | undefined {
  return plan.slideOutlines?.find(
    (outline) => outline.id === slide.id || outline.order === slide.order,
  );
}

export function inferLectureLens(slide: LessonSlidePlan, outline?: SlideTeachingOutline) {
  const haystack = [
    slide.courseRoute,
    slide.csRoute,
    slide.mathRoute,
    slide.pageKind,
    slide.title,
    slide.objective,
    slide.learnerQuestion,
    outline?.teachingObjective,
    ...(outline?.keyPoints || []),
  ]
    .filter(Boolean)
    .join(' ');

  if (
    /computer|code|program|algorithm|oop|object|class|trace|stack|heap|queue|tree|linked/i.test(
      haystack,
    )
  ) {
    return 'code';
  }
  if (
    /math|proof|derive|formula|matrix|calculus|algebra|theorem|证明|推导|公式|矩阵/.test(haystack)
  ) {
    return 'math';
  }
  if (/case|evidence|history|social|policy|analysis|材料|证据|案例|评价/.test(haystack)) {
    return 'evidence';
  }
  return 'general';
}

export function buildLectureOpeningSpeech(args: {
  plan: LessonPlan;
  slide: LessonSlidePlan;
  outline?: SlideTeachingOutline;
  firstTarget?: LectureTarget;
}): string {
  const { plan, slide, outline, firstTarget } = args;
  const lens = inferLectureLens(slide, outline);
  const learnerQuestion = firstMeaningful([
    slide.learnerQuestion,
    outline?.learnerQuestion,
    slide.objective,
    outline?.teachingObjective,
    slide.title,
  ]);
  const spineQuestion =
    plan.courseSpine?.centralQuestion ||
    plan.courseSpine?.openingHook ||
    plan.coursePlan?.coreQuestions?.[0] ||
    plan.coursePlan?.courseGoal ||
    learnerQuestion;
  const pageContinuity = slide.continuity || outline?.continuity;
  const previousSlide = plan.slides.find((candidate) => candidate.order === slide.order - 1);
  const continuity =
    pageContinuity?.fromPrevious ||
    (previousSlide && previousSlide.pageKind !== 'cover'
      ? `承接上一页的“${previousSlide.title}”`
      : '');
  const continuityLead = continuity ? `${continuity}，` : '';
  const pageMove = pageContinuity?.pageMove
    ? `这一页的分镜动作是：${pageContinuity.pageMove} `
    : '';

  if (slide.pageKind === 'cover') {
    return cleanLectureSpeechText(
      `这节课先从标题进入：${slide.title}。它的整课主线是：${plan.courseSpine?.logline || plan.coursePlan?.courseGoal || learnerQuestion}。接下来不要急着看细节，先带着一个主问题听：${spineQuestion}。`,
    );
  }

  if (lens === 'code') {
    return cleanLectureSpeechText(
      `${continuityLead}${pageMove}这一页先盯住一个问题：${learnerQuestion} 不要只看代码长什么样，先说清当前对象或状态、正在发生的操作，以及操作后还必须成立的规则。`,
    );
  }
  if (lens === 'math') {
    return cleanLectureSpeechText(
      `${continuityLead}${pageMove}这一页先把“要证明或要求什么”和“已经给了什么”分开：${learnerQuestion} 你要听的是每一步为什么合法，而不是把公式顺着念一遍。`,
    );
  }
  if (lens === 'evidence') {
    return cleanLectureSpeechText(
      `${continuityLead}${pageMove}这一页的入口是：${learnerQuestion} 先把屏幕内容当成一条证据链看，区分结论、证据和限制条件。`,
    );
  }
  return cleanLectureSpeechText(
    `${continuityLead}${pageMove}这一页的入口是：${learnerQuestion} 先看 ${targetCue(firstTarget, 72)}，再判断它到底在支持本页的哪个理解动作。`,
  );
}

export function buildFocusedLectureSpeech(args: {
  slide: LessonSlidePlan;
  outline?: SlideTeachingOutline;
  target: LectureTarget;
  index: number;
}): string {
  const { slide, outline, target, index } = args;
  const lens = inferLectureLens(slide, outline);
  const cue = targetCue(target);
  const keyPoint = outline?.keyPoints?.[index] || slide.mandatoryVisibleContent?.[index] || '';
  const sourceAnchor = slide.sourceAnchors?.[index] || outline?.sourceAnchors?.[index] || '';
  const evidenceTail = sourceAnchor ? `如果回到原材料，它对应的是：${sourceAnchor}。` : '';
  const continuityTail =
    index === 0 && (slide.continuity?.callbackToSpine || outline?.continuity?.callbackToSpine)
      ? `它要回扣的整课主线是：${slide.continuity?.callbackToSpine || outline?.continuity?.callbackToSpine}。`
      : '';

  if (lens === 'code') {
    return cleanLectureSpeechText(
      [
        `看这个区域：${cue}。`,
        index === 0
          ? '它负责回答“当前状态是什么”。讲解时先命名对象、变量或结构，再说下一步会改变哪里。'
          : '这里是第二个检查点。把它和前面的状态连起来，学生应该能说出操作前后哪条规则没有被破坏。',
        keyPoint ? `本页要落实的点是：${keyPoint}。` : '',
        evidenceTail,
        continuityTail,
      ].join(''),
    );
  }

  if (lens === 'math') {
    return cleanLectureSpeechText(
      [
        `看这个区域：${cue}。`,
        index === 0
          ? '这一块承担的是把条件变成可操作的表达式。讲的时候要问：这一步用了哪个定义、前提或等价关系。'
          : '这里不要跳过理由。学生容易只抄结果，所以要明确说明为什么可以从上一行走到这一行。',
        keyPoint ? `对应的关键点是：${keyPoint}。` : '',
        evidenceTail,
        continuityTail,
      ].join(''),
    );
  }

  if (lens === 'evidence') {
    return cleanLectureSpeechText(
      [
        `看这个证据位置：${cue}。`,
        index === 0
          ? '先判断它是在提出主张、给出材料，还是限定解释范围。'
          : '再把它和前一个证据比较，看看它是补充、转折，还是加强同一个判断。',
        keyPoint ? `本页对应的判断是：${keyPoint}。` : '',
        evidenceTail,
        continuityTail,
      ].join(''),
    );
  }

  return cleanLectureSpeechText(
    [
      `看这个位置：${cue}。`,
      index === 0
        ? '它承担的是本页的核心说明，不是让学生背句子，而是让学生看到判断依据。'
        : '这里负责把前面的说明推进一步，检查学生能不能用自己的话复述关系。',
      keyPoint ? `这一步对应：${keyPoint}。` : sentence(slide.objective),
      evidenceTail,
      continuityTail,
    ].join(''),
  );
}

export function buildLectureTransferSpeech(args: {
  slide: LessonSlidePlan;
  outline?: SlideTeachingOutline;
}): string {
  const { slide, outline } = args;
  const lens = inferLectureLens(slide, outline);
  const learnerQuestion = firstMeaningful([
    slide.learnerQuestion,
    outline?.learnerQuestion,
    slide.title,
  ]);
  const callback = slide.continuity?.callbackToSpine || outline?.continuity?.callbackToSpine;
  const toNext = slide.continuity?.toNext || outline?.continuity?.toNext;
  const continuityClose = [
    callback ? `这一页回扣的整课主线是：${callback}。` : '',
    toNext ? `下一步要带着这个问题走：${toNext}` : '',
  ]
    .filter(Boolean)
    .join('');

  if (lens === 'code') {
    return cleanLectureSpeechText(
      `收束时回到这个问题：${learnerQuestion} 带走的方法是：先说状态，再说操作，最后检查规则或不变量是否还成立。${continuityClose}`,
    );
  }
  if (lens === 'math') {
    return cleanLectureSpeechText(
      `收束时回到这个问题：${learnerQuestion} 带走的方法是：先分清目标和条件，再给每一步找依据；没有依据的变形不要接受。${continuityClose}`,
    );
  }
  if (lens === 'evidence') {
    return cleanLectureSpeechText(
      `收束时回到这个问题：${learnerQuestion} 带走的方法是：把结论、证据和限制条件分开，先问“这个材料到底支持了什么”。${continuityClose}`,
    );
  }
  return cleanLectureSpeechText(
    `收束时回到这个问题：${learnerQuestion} 带走的方法是：先问这页要解决什么，再找屏幕上的哪个证据支持它。${continuityClose}`,
  );
}

export function buildLecturePageResult(args: {
  plan: LessonPlan;
  slide: LessonSlidePlan;
  page: HtmlPageResult;
  targets: LectureTarget[];
}): LecturePageResult {
  const { plan, slide, page, targets } = args;
  const outline = findSlideOutline(plan, slide);
  const warnings: string[] = [];
  const titleTarget = targets.find((target) => target.kind === 'title');
  const contentTargets = targets.filter((target) => target.kind !== 'title');
  const firstSpecial = contentTargets.find((target) =>
    ['code', 'table', 'visual'].includes(target.kind),
  );
  const focusTargets =
    slide.pageKind === 'cover'
      ? uniqueLectureTargets([titleTarget || targets[0]])
      : uniqueLectureTargets([
          contentTargets[0] || titleTarget || targets[0],
          firstSpecial,
          contentTargets.find((target) => target.id !== (firstSpecial || contentTargets[0])?.id),
        ]).slice(0, 3);

  if (!targets.length) {
    warnings.push('没有从 HTML DOM 中解析到可定位讲解目标。');
  }
  if (slide.pageKind !== 'cover' && focusTargets.length < 2) {
    warnings.push('正文页讲解目标少于 2 个，可能只能做单点聚焦。');
  }

  const actions: LectureActionPlanItem[] = [];
  const pushSpeech = (title: string, text: string) => {
    actions.push({
      id: `lecture-${slide.id}-${actions.length + 1}`,
      type: 'speech',
      title,
      text: compactText(text, 520),
    });
  };
  const pushFocus = (type: 'spotlight' | 'laser', target: LectureTarget, title: string) => {
    actions.push({
      id: `lecture-${slide.id}-${actions.length + 1}`,
      type,
      title,
      targetId: target.id,
      dimOpacity: type === 'spotlight' ? 0.62 : undefined,
      color: type === 'laser' ? '#2563eb' : undefined,
    });
  };

  if (focusTargets[0]) pushFocus('spotlight', focusTargets[0], '聚焦课堂入口');
  pushSpeech(
    slide.pageKind === 'cover' ? '标题页开场' : '课堂导入',
    buildLectureOpeningSpeech({ plan, slide, outline, firstTarget: focusTargets[0] }),
  );

  if (slide.pageKind !== 'cover') {
    focusTargets.forEach((target, index) => {
      if (index > 0) {
        pushFocus(
          index === 1 ? 'laser' : 'spotlight',
          target,
          index === 1 ? '指向关键证据' : '聚焦下一处讲解',
        );
      }
      pushSpeech(
        index === 0 ? '解释当前结构' : index === 1 ? '连接证据与规则' : '推进长页第二屏',
        buildFocusedLectureSpeech({ slide, outline, target, index }),
      );
    });
    pushSpeech('迁移检查', buildLectureTransferSpeech({ slide, outline }));
  }

  const scriptText = actions
    .filter((action) => action.type === 'speech' && action.text)
    .map((action) => action.text)
    .join('\n\n');

  return {
    slideId: slide.id,
    slideTitle: slide.title,
    order: slide.order,
    pageKind: slide.pageKind,
    canvasWidth: 1600,
    canvasHeight: page.canvasHeight || getSlideCanvasHeight(slide),
    targets,
    actions,
    scriptText,
    warnings,
    createdAt: Date.now(),
  };
}

export function teachingRoleForLecture(
  slide: LessonSlidePlan,
  outline?: SlideTeachingOutline,
): TeachingRole {
  const lens = inferLectureLens(slide, outline);
  if (slide.pageKind === 'cover') return 'concrete_hook';
  if (lens === 'code') {
    if (/invariant|rule|structure|linked|tree|queue|stack/i.test(slide.csRoute || slide.title)) {
      return 'structure_invariant';
    }
    return 'state_trace';
  }
  if (lens === 'math') return 'worked_example';
  if (lens === 'evidence') return 'evidence_frame';
  return 'concept_model';
}

export function teachingComponentKindsForLecture(
  slide: LessonSlidePlan,
  outline: SlideTeachingOutline | undefined,
  targets: LectureTarget[],
): TeachingComponentKind[] {
  const kinds = new Set<TeachingComponentKind>();
  const lens = inferLectureLens(slide, outline);
  if (lens === 'code') {
    if (/stack/i.test(slide.csRoute || slide.title)) kinds.add('stack');
    if (/queue/i.test(slide.csRoute || slide.title)) kinds.add('queue');
    if (/tree/i.test(slide.csRoute || slide.title)) kinds.add('tree');
    if (/linked/i.test(slide.csRoute || slide.title)) kinds.add('linkedlist');
    if (/memory|heap|object/i.test(slide.csRoute || slide.title)) kinds.add('memory');
    kinds.add('trace');
    kinds.add('invariant');
  } else if (lens === 'math') {
    kinds.add('derivation');
    kinds.add('proof');
  } else if (lens === 'evidence') {
    kinds.add('case');
    kinds.add('quote');
  }

  for (const target of targets) {
    if (target.kind === 'table') kinds.add('table');
    if (target.kind === 'code') kinds.add('trace');
    if (target.kind === 'visual') kinds.add(lens === 'evidence' ? 'chart' : 'example');
  }

  return Array.from(kinds).slice(0, 5);
}

export function transferRuleForLecture(
  slide: LessonSlidePlan,
  outline?: SlideTeachingOutline,
): string {
  const lens = inferLectureLens(slide, outline);
  if (lens === 'code') return '先说状态，再说操作，最后检查规则或不变量是否还成立。';
  if (lens === 'math') return '先分清目标和条件，再给每一步找依据；没有依据的变形不要接受。';
  if (lens === 'evidence') return '把结论、证据和限制条件分开，先问“这个材料到底支持了什么”。';
  return '先问这页要解决什么，再找屏幕上的哪个证据支持它。';
}

export function buildSceneOutlineForLecture(
  plan: LessonPlan,
  slide: LessonSlidePlan,
  targets: LectureTarget[],
): SceneOutline {
  const outline = findSlideOutline(plan, slide);
  const continuity = slide.continuity || outline?.continuity;
  const description = firstMeaningful([
    continuity?.pageMove,
    slide.objective,
    outline?.teachingObjective,
    slide.learnerQuestion,
    outline?.learnerQuestion,
    slide.htmlPrompt,
  ]);
  const keyPoints = outline?.keyPoints?.length
    ? outline.keyPoints
    : [
        continuity?.fromPrevious || '',
        continuity?.pageMove || '',
        ...(slide.mandatoryVisibleContent || []),
        ...(slide.sourceCoverage || []),
        continuity?.callbackToSpine || '',
        slide.sourceUseRationale || '',
      ].filter(Boolean);
  const learnerQuestion = firstMeaningful([
    slide.learnerQuestion,
    outline?.learnerQuestion,
    plan.coursePlan?.coreQuestions?.[0],
    slide.title,
  ]);
  const spineQuestion =
    plan.courseSpine?.centralQuestion ||
    plan.courseSpine?.openingHook ||
    plan.coursePlan?.coreQuestions?.[0] ||
    learnerQuestion;

  return {
    id: slide.id,
    type: 'slide',
    title: slide.title,
    description: [
      description,
      continuity?.callbackToSpine ? `整课回扣：${continuity.callbackToSpine}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    keyPoints: keyPoints.length ? keyPoints.slice(0, 5) : [description || slide.title],
    teachingObjective: description,
    teachingPagePlan: {
      id: `html-page-plan-${slide.id}`,
      order: slide.order,
      title: slide.title,
      role: teachingRoleForLecture(slide, outline),
      openingMove:
        continuity?.fromPrevious ||
        (slide.pageKind === 'cover'
          ? `用标题建立本节课的入口：${slide.title}`
          : `先进入这一页的学生问题：${learnerQuestion}`),
      concreteAnchor: [targetCue(targets[0], 120), continuity?.pageMove].filter(Boolean).join('；'),
      studentThinkingMove: continuity?.pageMove || learnerQuestion,
      transferRule: continuity?.callbackToSpine || transferRuleForLecture(slide, outline),
      requiredComponentKinds: teachingComponentKindsForLecture(slide, outline, targets),
      forbiddenPatterns: [
        '不要复述标题',
        '不要把页面内容逐条朗读',
        '不要编造页面上没有出现的事实',
        `不要脱离整课中心问题：${spineQuestion}`,
      ],
    },
    order: slide.order,
    language: 'zh-CN',
  };
}

export function lectureTargetToPptElement(target: LectureTarget): PPTElement {
  return {
    id: target.id,
    type: 'text',
    left: target.rect.x,
    top: target.rect.y,
    width: target.rect.width,
    height: target.rect.height,
    rotate: 0,
    name: `${target.kind}:${target.label}`,
    content: target.text || target.label,
    defaultFontName: 'Inter',
    defaultColor: '#111827',
    lineHeight: 1.35,
    paragraphSpace: 4,
    textType: target.kind === 'title' ? 'title' : 'content',
  };
}

export function convertSceneActionsToLectureActions(
  sceneActions: SceneActionApiAction[],
  slide: LessonSlidePlan,
  targets: LectureTarget[],
): { actions: LectureActionPlanItem[]; warnings: string[] } {
  const targetIds = new Set(targets.map((target) => target.id));
  const warnings: string[] = [];
  const actions: LectureActionPlanItem[] = [];

  for (const action of sceneActions) {
    if (action.type === 'speech') {
      const text = cleanLectureSpeechText(action.text || '');
      if (!text) continue;
      actions.push({
        id: action.id || `lecture-${slide.id}-${actions.length + 1}`,
        type: 'speech',
        title: action.title || '讲解',
        text: compactText(text, 700),
      });
      continue;
    }

    if (action.type === 'spotlight' || action.type === 'laser') {
      if (!action.elementId || !targetIds.has(action.elementId)) {
        warnings.push(
          `OpenMAIC action target 无法映射到 HTML DOM target：${action.elementId || '(empty)'}`,
        );
        continue;
      }
      actions.push({
        id: action.id || `lecture-${slide.id}-${actions.length + 1}`,
        type: action.type,
        title: action.title || (action.type === 'spotlight' ? '聚焦讲解区域' : '指向关键位置'),
        targetId: action.elementId,
        dimOpacity: action.type === 'spotlight' ? (action.dimOpacity ?? 0.55) : undefined,
        color: action.type === 'laser' ? action.color || '#2563eb' : undefined,
      });
    }
  }

  return { actions, warnings };
}

export async function requestOpenMaicLecturePageResult(args: {
  plan: LessonPlan;
  slide: LessonSlidePlan;
  page: HtmlPageResult;
  targets: LectureTarget[];
  allOutlines: SceneOutline[];
  previousSpeeches: string[];
}): Promise<{ result: LecturePageResult; previousSpeeches: string[] } | null> {
  if (!args.targets.length) return null;

  const outline = buildSceneOutlineForLecture(args.plan, args.slide, args.targets);
  const continuity =
    args.slide.continuity ||
    args.plan.slideOutlines?.find(
      (item) => item.id === args.slide.id || item.order === args.slide.order,
    )?.continuity;
  const spine = args.plan.courseSpine;
  const response = await backendFetchWithTimeout(
    '/api/generate/scene-actions',
    {
      method: 'POST',
      headers: getPipelineHeaders(),
      body: JSON.stringify({
        outline,
        allOutlines: args.allOutlines.length ? args.allOutlines : [outline],
        content: {
          elements: args.targets.map(lectureTargetToPptElement),
          remark: `HTML pipeline lecture action test for ${args.slide.title}`,
        },
        stageId: `html-pipeline-${args.plan.lessonTitle || 'notebook'}`,
        notebookName: args.plan.lessonTitle,
        previousSpeeches: args.previousSpeeches,
        userProfile: [
          '管线验收模式：讲解稿要像 OpenMAIC 正式课堂播放稿，每段只推进一个教学动作。',
          spine?.logline ? `整课电影主线：${spine.logline}` : '',
          spine?.centralQuestion ? `整课中心问题：${spine.centralQuestion}` : '',
          spine?.closingCallback ? `最终回扣：${spine.closingCallback}` : '',
          continuity?.fromPrevious ? `本页承接：${continuity.fromPrevious}` : '',
          continuity?.pageMove ? `本页分镜动作：${continuity.pageMove}` : '',
          continuity?.toNext ? `本页转场：${continuity.toNext}` : '',
          continuity?.callbackToSpine ? `本页回扣：${continuity.callbackToSpine}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        courseContext: {
          name: args.plan.lessonTitle,
          audience: args.plan.coursePlan?.targetLearner,
          goals: args.plan.coursePlan?.courseGoal,
        },
      }),
    },
    LECTURE_ACTION_REQUEST_TIMEOUT_MS,
  );
  const data = (await response.json().catch(() => ({}))) as SceneActionsApiResponse;
  if (!response.ok || data.success === false || !data.scene?.actions?.length) return null;

  const converted = convertSceneActionsToLectureActions(
    data.scene.actions,
    args.slide,
    args.targets,
  );
  const speechCount = converted.actions.filter((action) => action.type === 'speech').length;
  if (!speechCount) return null;

  const scriptText = converted.actions
    .filter((action) => action.type === 'speech' && action.text)
    .map((action) => action.text)
    .join('\n\n');

  return {
    result: {
      slideId: args.slide.id,
      slideTitle: args.slide.title,
      order: args.slide.order,
      pageKind: args.slide.pageKind,
      canvasWidth: 1600,
      canvasHeight: args.page.canvasHeight || getSlideCanvasHeight(args.slide),
      targets: args.targets,
      actions: converted.actions,
      scriptText,
      warnings: [
        ...converted.warnings,
        ...(data.fallbackUsed ? ['OpenMAIC scene-actions 使用了服务端 fallback。'] : []),
      ],
      createdAt: Date.now(),
    },
    previousSpeeches: data.previousSpeeches?.length
      ? data.previousSpeeches
      : scriptText.split('\n\n').filter(Boolean),
  };
}
