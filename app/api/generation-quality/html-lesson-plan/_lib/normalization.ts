import type {
  CoursePlan,
  CourseSpine,
  CourseSpineAct,
  DensityLevel,
  HtmlCanvasMode,
  HtmlCourseRoute,
  HtmlCsRoute,
  HtmlMathRoute,
  HtmlPageKind,
  LessonPlan,
  LessonSlidePlan,
  PageCountTier,
  SlideContinuity,
  SlideTeachingOutline,
} from './types';
import { compactText, extractJsonObject, toStringArray } from './source-utils';
import { toSafeInt } from './cost';
import {
  inferCanvasModeFromSlide,
  inferCourseRouteFromText,
  inferCsRouteFromText,
  normalizeCanvasHeight,
  normalizeCourseRoute,
  normalizeCsRoute,
  normalizeDensity,
  normalizeMathRoute,
  normalizePageKind,
  normalizeSourceUsage,
  sanitizeHtmlPromptForCourseRoute,
  structuralPageKind,
  structuralPromptGuidance,
  tierBounds,
} from './routes';

export function normalizeCoursePlan(value: unknown, fallbackTitle: string): CoursePlan {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    targetLearner: compactText(String(record.targetLearner || '面向当前 notebook 的学习者'), 120),
    courseGoal: compactText(String(record.courseGoal || `理解 ${fallbackTitle} 的核心主线`), 180),
    narrativeArc: toStringArray(record.narrativeArc, 1),
    prerequisiteAssumptions: toStringArray(record.prerequisiteAssumptions, 3),
    coreQuestions: toStringArray(record.coreQuestions, 3),
    sourceDigest: toStringArray(record.sourceDigest, 3),
    pacingStrategy: compactText(
      String(record.pacingStrategy || '先建立问题，再讲核心概念，最后用证据/例子收束。'),
      160,
    ),
  };
}

export const SPINE_ACT_SET = new Set<CourseSpineAct['act']>([
  'setup',
  'development',
  'turn',
  'synthesis',
]);
export const RHETORICAL_ROLE_SET = new Set<SlideContinuity['rhetoricalRole']>([
  'opening',
  'setup',
  'build',
  'turn',
  'example',
  'synthesis',
  'callback',
]);

export function defaultSpinePages(
  totalPages: number,
  slot: 'setup' | 'development' | 'turn' | 'synthesis',
) {
  const boundedTotal = Math.max(1, totalPages);
  if (slot === 'setup')
    return [1, Math.min(2, boundedTotal)].filter(
      (value, index, all) => all.indexOf(value) === index,
    );
  if (slot === 'synthesis') return [boundedTotal];
  if (slot === 'turn') {
    const midpoint = Math.max(2, Math.ceil(boundedTotal * 0.66));
    return boundedTotal >= 5 ? [midpoint] : [];
  }
  const start = boundedTotal >= 4 ? 3 : 2;
  const end =
    boundedTotal >= 5 ? Math.max(start, Math.ceil(boundedTotal * 0.66) - 1) : boundedTotal - 1;
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
}

export function normalizeCourseSpine(
  value: unknown,
  fallbackTitle: string,
  coursePlan: CoursePlan,
  totalPages: number,
): CourseSpine {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const rawActs = Array.isArray(record.acts) ? record.acts : [];
  const fallbackQuestion = coursePlan.coreQuestions[0] || `为什么要学习「${fallbackTitle}」？`;
  const acts = rawActs
    .slice(0, 5)
    .map((actValue, index): CourseSpineAct | null => {
      if (!actValue || typeof actValue !== 'object') return null;
      const actRecord = actValue as Record<string, unknown>;
      const actType = SPINE_ACT_SET.has(actRecord.act as CourseSpineAct['act'])
        ? (actRecord.act as CourseSpineAct['act'])
        : index === 0
          ? 'setup'
          : index === rawActs.length - 1
            ? 'synthesis'
            : 'development';
      const pages = Array.isArray(actRecord.pages)
        ? actRecord.pages
            .map((page) => toSafeInt(typeof page === 'number' ? page : Number(page)))
            .filter(
              (page, pageIndex, all) =>
                page >= 1 && page <= totalPages && all.indexOf(page) === pageIndex,
            )
        : defaultSpinePages(totalPages, actType);
      return {
        id: compactText(String(actRecord.id || `act-${index + 1}`), 60) || `act-${index + 1}`,
        act: actType,
        title: compactText(String(actRecord.title || `第 ${index + 1} 幕`), 120),
        purpose: compactText(
          String(actRecord.purpose || coursePlan.narrativeArc[index] || ''),
          220,
        ),
        pages,
        keyQuestion: compactText(
          String(actRecord.keyQuestion || coursePlan.coreQuestions[index] || fallbackQuestion),
          220,
        ),
        visualMotif: compactText(
          String(actRecord.visualMotif || record.visualMotif || fallbackTitle),
          160,
        ),
      };
    })
    .filter((act): act is CourseSpineAct => Boolean(act));

  const fallbackActs: CourseSpineAct[] = [
    {
      id: 'act-setup',
      act: 'setup',
      title: '总：建立问题',
      purpose: coursePlan.narrativeArc[0] || `用「${fallbackTitle}」建立学习入口。`,
      pages: defaultSpinePages(totalPages, 'setup'),
      keyQuestion: fallbackQuestion,
      visualMotif: compactText(String(record.visualMotif || fallbackTitle), 160),
    },
    {
      id: 'act-development',
      act: 'development',
      title: '分：展开证据',
      purpose: coursePlan.narrativeArc[1] || '拆开核心概念、证据、例子和判断方法。',
      pages: defaultSpinePages(totalPages, 'development'),
      keyQuestion: coursePlan.coreQuestions[1] || fallbackQuestion,
      visualMotif: compactText(String(record.visualMotif || fallbackTitle), 160),
    },
    {
      id: 'act-synthesis',
      act: 'synthesis',
      title: '总：回收判断',
      purpose: coursePlan.narrativeArc[2] || '把前面的分点收束成可迁移的判断框架。',
      pages: defaultSpinePages(totalPages, 'synthesis'),
      keyQuestion: coursePlan.coreQuestions[2] || fallbackQuestion,
      visualMotif: compactText(String(record.visualMotif || fallbackTitle), 160),
    },
  ];

  return {
    logline: compactText(String(record.logline || coursePlan.courseGoal || fallbackTitle), 240),
    openingHook: compactText(String(record.openingHook || fallbackQuestion), 220),
    centralQuestion: compactText(String(record.centralQuestion || fallbackQuestion), 220),
    acts: acts.length >= 2 ? acts : fallbackActs,
    recurringExample: compactText(
      String(record.recurringExample || coursePlan.sourceDigest[0] || fallbackTitle),
      220,
    ),
    visualMotif: compactText(String(record.visualMotif || fallbackTitle), 160),
    closingCallback: compactText(
      String(record.closingCallback || coursePlan.coreQuestions[0] || coursePlan.courseGoal),
      240,
    ),
  };
}

export function normalizeSlideContinuity(
  value: unknown,
  index: number,
  totalPages: number,
  title: string,
  courseSpine?: CourseSpine,
): SlideContinuity {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const order = index + 1;
  const matchedAct =
    courseSpine?.acts.find((act) => act.pages.includes(order)) ||
    courseSpine?.acts[Math.min(courseSpine.acts.length - 1, Math.max(0, index === 0 ? 0 : 1))];
  const defaultRole: SlideContinuity['rhetoricalRole'] =
    index === 0
      ? 'opening'
      : index === 1
        ? 'setup'
        : order === totalPages
          ? 'callback'
          : order === totalPages - 1
            ? 'synthesis'
            : /例|case|example|demo|样例/i.test(title)
              ? 'example'
              : order >= Math.ceil(totalPages * 0.6)
                ? 'turn'
                : 'build';
  const rhetoricalRole = RHETORICAL_ROLE_SET.has(
    record.rhetoricalRole as SlideContinuity['rhetoricalRole'],
  )
    ? (record.rhetoricalRole as SlideContinuity['rhetoricalRole'])
    : defaultRole;
  const centralQuestion = courseSpine?.centralQuestion || courseSpine?.logline || title;
  return {
    actId: compactText(String(record.actId || matchedAct?.id || 'act-development'), 80),
    rhetoricalRole,
    fromPrevious: compactText(
      String(
        record.fromPrevious ||
          (index === 0
            ? `以「${title}」建立整课入口。`
            : `承接上一页结论，继续回答中心问题：${centralQuestion}`),
      ),
      240,
    ),
    pageMove: compactText(
      String(record.pageMove || `这一页推进「${title}」这个分镜，只完成一个教学动作。`),
      240,
    ),
    toNext: compactText(
      String(
        record.toNext ||
          (order === totalPages
            ? `回扣开场问题：${courseSpine?.openingHook || centralQuestion}`
            : '把本页结论变成下一页要验证或展开的问题。'),
      ),
      240,
    ),
    callbackToSpine: compactText(
      String(record.callbackToSpine || courseSpine?.closingCallback || centralQuestion),
      240,
    ),
  };
}

export function normalizeSlideTeachingOutline(
  value: unknown,
  index: number,
  fallbackTitle: string,
  totalPages = index + 1,
  courseSpine?: CourseSpine,
): SlideTeachingOutline {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const title = compactText(String(record.title || fallbackTitle || `第 ${index + 1} 页`), 120);
  return {
    id: compactText(String(record.id || `slide-${index + 1}`), 80) || `slide-${index + 1}`,
    order: index + 1,
    title,
    canvasMode:
      record.canvasMode === 'long' || record.canvasMode === 'tall' || record.canvasMode === 'slide'
        ? (record.canvasMode as HtmlCanvasMode)
        : undefined,
    canvasHeight:
      typeof record.canvasHeight === 'number'
        ? record.canvasHeight
        : typeof record.canvasHeight === 'string'
          ? Number.parseInt(record.canvasHeight, 10)
          : undefined,
    learnerQuestion: compactText(String(record.learnerQuestion || `这一页要解决：${title}`), 220),
    teachingObjective: compactText(
      String(record.teachingObjective || record.objective || title),
      260,
    ),
    keyPoints: toStringArray(record.keyPoints, 6),
    sourceAnchors: toStringArray(record.sourceAnchors, 8),
    sourceImageIds: toStringArray(record.sourceImageIds, 4).filter((id) =>
      /^[A-Za-z0-9_.:-]+$/.test(id),
    ),
    sourceUseRationale: compactText(
      String(
        record.sourceUseRationale ||
          '保留源材料的核心学习目标，并按页面容量决定直接使用、改写或换例。',
      ),
      260,
    ),
    continuity: normalizeSlideContinuity(record.continuity, index, totalPages, title, courseSpine),
    visualPlan: compactText(
      String(record.visualPlan || '用可编辑 DOM 结构呈现本页关键判断。'),
      260,
    ),
    mandatoryVisibleContent: toStringArray(record.mandatoryVisibleContent, 10),
    optionalContent: toStringArray(record.optionalContent, 8),
  };
}

export function synthesizeHtmlPromptFromStructuredSlide(args: {
  lessonTitle: string;
  pageCount: number;
  slide: Partial<LessonSlidePlan> & {
    title?: string;
    pageKind?: HtmlPageKind;
    objective?: string;
    learnerQuestion?: string;
    keyPoints?: string[];
    sourceAnchors?: string[];
    sourceImageIds?: string[];
    sourceUseRationale?: string;
    visualPlan?: string;
    mandatoryVisibleContent?: string[];
    optionalContent?: string[];
    density?: DensityLevel;
    courseRoute?: HtmlCourseRoute;
    csRoute?: HtmlCsRoute;
    mathRoute?: HtmlMathRoute;
    canvasMode?: HtmlCanvasMode;
    canvasHeight?: number;
    contentBudget?: LessonSlidePlan['contentBudget'];
  };
  order: number;
}): string {
  const slide = args.slide;
  const title = compactText(String(slide.title || `第 ${args.order} 页`), 120);
  const pageKind = slide.pageKind || (args.order === 1 ? 'cover' : 'summary');
  const isCover = pageKind === 'cover';
  const canvasMode =
    slide.canvasMode === 'long' || slide.canvasMode === 'tall' ? slide.canvasMode : 'slide';
  const canvasHeight = normalizeCanvasHeight(
    slide.canvasHeight,
    canvasMode,
    slide.density || 'standard',
  );
  const keyPoints = isCover ? title : slide.keyPoints?.length ? slide.keyPoints.join('；') : title;
  const mandatory = isCover
    ? `主标题「${title}」；内置封面背景/主视觉`
    : slide.mandatoryVisibleContent?.length
      ? slide.mandatoryVisibleContent.join('；')
      : keyPoints;
  const optional = isCover
    ? '最多 1 行 18 字以内副标题/元信息；可以全部省略'
    : slide.optionalContent?.length
      ? slide.optionalContent.join('；')
      : '邻近上下文、装饰标签、额外解释';
  const sourceAnchors = isCover
    ? `整本 notebook 主题：${title}`
    : slide.sourceAnchors?.length
      ? slide.sourceAnchors.join('；')
      : '源材料主线';
  const sourceImages = isCover
    ? '无，封面使用内置背景'
    : slide.sourceImageIds?.length
      ? slide.sourceImageIds.join(', ')
      : '无';
  const sourceUseRationale = isCover
    ? '封面只使用整本 notebook 标题和课程主题，不展开具体 source page。'
    : slide.sourceUseRationale || '保留源材料核心目标，并按页面容量做取舍。';
  const budget = slide.contentBudget;
  const structuralGuidance = structuralPromptGuidance({
    pageKind,
    courseRoute: slide.courseRoute,
    order: args.order,
    pageCount: args.pageCount,
  });
  const continuity = slide.continuity;
  const canvasLead =
    canvasMode === 'long'
      ? `生成一张宽 1600px、目标高度约 ${canvasHeight}px 的自包含 HTML/CSS 长页面教学版式，不是 16:9 单屏 PPT。`
      : canvasMode === 'tall'
        ? `生成一张宽 1600px、高约 ${canvasHeight}px 的自包含 HTML/CSS 中高课件页，比 16:9 更高但不是网页文章。`
        : `生成一张 1600×900、16:9、自包含 HTML/CSS PPT 页面。`;
  const canvasLabel =
    canvasMode === 'long'
      ? `长页面，canvasHeight=${canvasHeight}`
      : canvasMode === 'tall'
        ? `中高页面，canvasHeight=${canvasHeight}`
        : '标准 16:9，canvasHeight=900';
  return [
    canvasLead,
    `Notebook：${args.lessonTitle}`,
    `第 ${args.order} 页 / 共 ${args.pageCount} 页。`,
    `页面标题：${title}`,
    `页面类型：${pageKind}`,
    ...structuralGuidance,
    continuity ? `整课分镜角色：${continuity.rhetoricalRole}，所属幕：${continuity.actId}` : '',
    continuity ? `承接上一页：${continuity.fromPrevious}` : '',
    continuity ? `本页推进：${continuity.pageMove}` : '',
    continuity ? `引向下一页：${continuity.toNext}` : '',
    continuity ? `回扣整课主线：${continuity.callbackToSpine}` : '',
    `画布模式：${canvasLabel}`,
    slide.courseRoute ? `课程路线：${slide.courseRoute}` : '',
    slide.csRoute ? `CS 版式：${slide.csRoute}` : '',
    slide.mathRoute ? `数学版式：${slide.mathRoute}` : '',
    isCover
      ? '封面目标：让学生一眼识别 notebook 主题；不要开始讲正文。'
      : `本页唯一学习问题：${slide.learnerQuestion || `为什么要理解「${title}」？`}`,
    `教学目标：${slide.objective || title}`,
    `关键点：${keyPoints}`,
    `视觉计划：${
      slide.visualPlan ||
      (isCover
        ? '全幅内置封面背景；标题直接叠在背景上，不使用卡片/面板。'
        : '用可编辑 DOM 结构呈现，不做长讲义。')
    }`,
    `必需保留清单：${mandatory}`,
    `可删内容清单：${optional}`,
    `源材料锚点：${sourceAnchors}`,
    `sourceImageIds：${sourceImages}`,
    `源材料取舍理由：${sourceUseRationale}`,
    budget
      ? `容量预算：可见中文/等价字符 ${budget.visibleCharsMin}-${budget.visibleCharsMax}，最多 ${budget.mainRegions} 个主要内容区，最多 ${budget.blockCount} 个内容块。`
      : '',
    canvasMode !== 'slide'
      ? '布局要求：用纵向 section 自然展开；不要把底部条、例子卡或结论卡叠在前面内容上；允许纵向阅读但禁止横向滚动。'
      : '布局要求：主内容必须用正常 flex/grid flow；不要让底部条、例子卡或结论卡覆盖上方内容。',
    canvasMode !== 'slide'
      ? '明确禁止：横向滚动、内容重叠、裁切、DOM 横向越界、负坐标、网页文章化、无关公式、无关例题、用 fixed height 裁掉正文。'
      : '明确禁止：滚动、裁切、DOM 越界、负坐标、长讲义、无关公式、无关例题、用 fixed height 裁掉正文。',
  ]
    .filter(Boolean)
    .join('\n');
}

export function csRouteLabel(route: HtmlCsRoute | undefined): string {
  const labels: Record<HtmlCsRoute, string> = {
    standard: 'standard（标准 CS 课程页）',
    'execution-trace': 'Execution Trace / 代码执行追踪',
    'memory-diagram': 'Memory Diagram / Stack + Heap + References',
    'call-stack': 'Call Stack / 递归调用栈',
    'pointer-diagram': 'Pointer Diagram / 链表指针图',
    'tree-diagram': 'Tree / BST Diagram',
    'graph-trace': 'Graph Trace / frontier + visited',
    'linear-structure': 'Linear Structure / Stack or Queue',
    'dictionary-diagram': 'Dictionary Diagram / key-value 映射',
    'invariant-check': 'Invariant Check / 结构合法性检查',
    'composite-operation': 'Composite Operation / 综合操作页',
  };
  return labels[route || 'standard'];
}

export function mathRouteLabel(route: HtmlMathRoute | undefined): string {
  const labels: Record<HtmlMathRoute, string> = {
    standard: 'standard（标准数学课程页）',
    'definition-theorem': 'Definition / Theorem Board',
    'formula-focus': 'Formula Focus / 核心公式页',
    derivation: 'Derivation Ladder / 推导阶梯',
    proof: 'Proof Walkthrough / 证明讲解',
    'worked-example': 'Worked Example / 例题拆解',
    'concept-map': 'Concept Map / 概念关系图',
    'comparison-table': 'Comparison / Case Table',
  };
  return labels[route || 'standard'];
}

export function enforceHtmlPromptContract(
  slide: LessonSlidePlan,
  pageCount: number,
): LessonSlidePlan {
  const deletePriority = slide.contentBudget.mustDeleteIfCrowded.length
    ? slide.contentBudget.mustDeleteIfCrowded.join('；')
    : '邻近上下文、装饰标签、次级解释、额外例子';
  const isCover = slide.pageKind === 'cover';
  const isLongCanvas = slide.canvasMode === 'long';
  const isExpandedCanvas = slide.canvasMode !== 'slide';
  const structuralGuidance = structuralPromptGuidance({
    pageKind: slide.pageKind,
    courseRoute: slide.courseRoute,
    order: slide.order,
    pageCount,
  });
  const continuity = slide.continuity;
  const guardrail = [
    '',
    '硬性生成契约（必须逐条遵守）：',
    isLongCanvas
      ? `- 本页已规划为长页面：宽 1600px，目标高度约 ${slide.canvasHeight}px；不要把它压回 16:9，也不要用覆盖/叠放假装放下内容。`
      : slide.canvasMode === 'tall'
        ? `- 本页已规划为中高课件页：宽 1600px，高约 ${slide.canvasHeight}px；不要压回 16:9，也不要继续塞成网页文章。`
        : '- 本页已规划为标准 16:9 页面：1600×900；不要自行改成长页面或纵向滚动页。',
    `- 页面 H1/主标题必须逐字显示为「${slide.title}」；如果上文另有标题或同义标题，以本条为准。`,
    isCover
      ? `- 封面页可以不显示页码；如果显示，必须对应第 ${slide.order} 页 / 共 ${pageCount} 页。`
      : `- 页码必须对应第 ${slide.order} 页 / 共 ${pageCount} 页。`,
    isCover
      ? '- 封面页只强制主标题和 full-bleed 封面背景/主视觉；副标题、来源和短标签都可选，拥挤时优先删除。'
      : '- 必须完整呈现本 prompt 明确列出的每个块、编号条目、公式、步骤、短理由、结论和检查点；不能为了版式省略必需内容。',
    !isCover && slide.learnerQuestion ? `- 本页必须回答的学习问题：${slide.learnerQuestion}` : '',
    continuity
      ? `- 本页分镜承接必须清楚：承接「${continuity.fromPrevious}」；推进「${continuity.pageMove}」；最后把学生带向「${continuity.toNext}」。`
      : '',
    continuity ? `- 本页所有可见内容必须回扣整课主线：${continuity.callbackToSpine}` : '',
    !isCover && slide.keyPoints.length ? `- 本页关键点只能围绕：${slide.keyPoints.join('；')}` : '',
    slide.visualPlan ? `- 本页视觉计划：${slide.visualPlan}` : '',
    ...structuralGuidance.map((line) => `- ${line}`),
    !isCover && slide.mandatoryVisibleContent.length
      ? `- 必需保留清单：${slide.mandatoryVisibleContent.join('；')}`
      : '',
    !isCover && slide.optionalContent.length
      ? `- 可删/可弱化内容：${slide.optionalContent.join('；')}`
      : '',
    isCover
      ? '- 封面可见文字建议不超过 120 个中文/等价字符，且最多 2 个文本块；主标题要最大，其他文字小而少。'
      : '- 如果标题或内容要求出现确定数量（例如 5 个问题、4 步流程、3 条 takeaway、两句理由），实际可见内容数量必须完全一致。',
    isCover
      ? '- 封面标题必须直接叠在全幅背景/主视觉上；不要把标题放进大卡片、半透明面板、glass panel、title card、content panel 或居中盒子。'
      : '',
    isCover
      ? '- 封面禁止显示“notebook 封面”“封面页”“cover”“main visual”“background”“主视觉”“背景”等占位/说明文字。'
      : '',
    isCover
      ? `- 如果拥挤，只能优先删这些次要内容：${deletePriority}；不能删主标题，也不能退化成白底空页。`
      : `- 如果拥挤，只能优先删这些次要内容：${deletePriority}；不能删标题、核心公式、步骤、理由、结论或检查点。`,
    isExpandedCanvas
      ? '- 主内容区必须用纵向 section + 正常 flex/grid 文档流展开；结论、检查点、例题结果必须是后续 section，不能浮在中间内容上。'
      : '- 主内容区必须用正常 flex/grid 文档流排版；不要让底部条、例子卡、结论卡覆盖上方卡片。',
    '- 承载正文、公式、表格或步骤的卡片不能用过小 fixed height/max-height 加 overflow:hidden 裁掉内容；必须让内部文字完整可见。',
    '- 数学符号必须精确：复合函数用 ∘，笛卡尔积用 ×，逆像用 f^{-1} 或等价 MathML；不要把 ∘ 写成 ·，不要把 × 写成 x。',
    `- 本页课程路线必须按「${slide.courseRoute}」处理，不要改成普通通用总结页。`,
    slide.courseRoute === 'computer-science'
      ? `- 本页 CS 版式必须按「${csRouteLabel(slide.csRoute)}」处理；如果不是 standard，页面必须出现对应的语义结构，而不是普通 bullet/cards。`
      : '',
    slide.courseRoute === 'math'
      ? `- 本页数学版式必须按「${mathRouteLabel(slide.mathRoute)}」处理；如果不是 standard，页面必须出现对应的数学结构，而不是泛泛定义页。`
      : '',
    !isCover && slide.sourceAnchors.length
      ? `- 本页源材料锚点必须可见地转化为页面内容：${slide.sourceAnchors.join('；')}`
      : isCover
        ? '- 封面可以只使用整本 notebook 标题/课程主题作为来源，不需要展示具体 source anchor。'
        : '- 本页必须至少有一个清晰的源材料锚点，不要生成脱离源文件的泛泛总结。',
    !isCover && slide.sourceUseRationale
      ? `- 本页源材料取舍理由必须被遵守：${slide.sourceUseRationale}`
      : isCover
        ? ''
        : '- 本页必须说明为什么直接使用、改写、换例或综合源材料。',
    slide.sourceImageIds.length
      ? [
          `- 本页必须使用这些原文图片 ID：${slide.sourceImageIds.join(', ')}；HTML 中先写 <img src="${slide.sourceImageIds[0]}"> 这样的图片 ID 占位，不要改写为外链或虚构 ID。`,
          '- 原文图片标题/说明必须描述图片真实内容和教学作用；不要把视觉样例、照片或截图误称为架构图、表格、流程图或结果图。',
          '- 同一页不要重复渲染同一个 source image；如果需要对比多个概念，使用 DOM 文本、表格或卡片完成对比。',
        ].join('\n')
      : '- 如果没有分配原文图片，不要虚构 img_1/source image，也不要假装看到了原文图表。',
    isExpandedCanvas
      ? `- 所有 DOM 元素都必须在宽 1600px、目标高约 ${slide.canvasHeight}px 的页面画布内；允许纵向阅读，但禁止横向滚动、覆盖、裁切、负坐标或超大容器。`
      : '- 所有 DOM 元素都必须在 1600×900 内；不要靠滚动、裁切、负坐标或超大容器解决容量问题。',
    slide.pageKind === 'cover'
      ? '- 封面必须有封面级背景/主视觉；优先使用 /slide-backgrounds/ 下的本地内置背景，或使用 CSS gradient、可编辑 DOM 装饰、数据网络/电影感框景/学术几何路径等内置封面视觉语言；不要调用外部图片 URL。'
      : '',
    slide.pageKind === 'intro'
      ? '- 这是介绍/导入页：必须帮助学生理解学习入口和路径，不要替代第一张正文讲解页。'
      : '',
    slide.pageKind === 'summary'
      ? '- 这是总结页：必须收束已经讲过的内容，不要新增未讲过的新知识点。'
      : '',
  ].join('\n');
  const htmlPrompt = `${slide.htmlPrompt}\n${guardrail}`.slice(0, 7600);
  return { ...slide, htmlPrompt };
}

export function forceComputerScienceRouteMix(
  slides: LessonSlidePlan[],
  contextText: string,
): LessonSlidePlan[] {
  if (slides.length <= 1) return slides;
  if (slides.some((slide) => slide.csRoute && slide.csRoute !== 'standard')) return slides;

  const forcedRoute = inferCsRouteFromText(contextText);
  const route = forcedRoute === 'standard' ? 'memory-diagram' : forcedRoute;
  const targetIndex = slides.findIndex(
    (slide, index) => index > 0 && !['cover', 'intro', 'summary'].includes(slide.pageKind),
  );
  if (targetIndex < 0) return slides;

  return slides.map((slide, index) => {
    if (index !== targetIndex) return slide;
    const forcedPrompt = [
      slide.htmlPrompt,
      '',
      'CS 专属版式要求（来自规划一致性检查，必须遵守）：',
      `- 本页必须使用 CS 版式：${csRouteLabel(route)}。`,
      '- 不能做普通 bullet 总结页；必须出现该版式对应的可编辑 DOM 结构。',
      route === 'memory-diagram'
        ? '- 至少展示 stack/name 区、heap/object 区、reference/attribute 关系区。'
        : '',
      route === 'pointer-diagram'
        ? '- 至少展示节点卡片、next/prev 指针字段、操作前后的关键指向。'
        : '',
      route === 'execution-trace' ? '- 至少展示关键代码、当前行、变量状态、下一步判断。' : '',
    ]
      .filter(Boolean)
      .join('\n');
    return {
      ...slide,
      pageKind: slide.pageKind === 'summary' ? 'code' : slide.pageKind,
      courseRoute: 'computer-science',
      csRoute: route,
      htmlPrompt: forcedPrompt,
    };
  });
}

export function normalizePlan(
  raw: unknown,
  tier: PageCountTier,
  context?: { routeHint?: HtmlCourseRoute; contextText?: string },
): LessonPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const rawSlides = Array.isArray(record.slides) ? record.slides : [];
  const rawSlideOutlines = Array.isArray(record.slideOutlines) ? record.slideOutlines : [];
  const bounds = tierBounds(tier);
  const contextRoute = context?.routeHint || 'general';
  const contextText = context?.contextText || '';
  const lessonTitle = compactText(String(record.lessonTitle || 'HTML 整节课测试'), 120);
  const boundedRawSlides = rawSlides.slice(0, bounds.max);
  const requestedPageCount =
    typeof record.pageCount === 'number'
      ? record.pageCount
      : typeof record.pageCount === 'string'
        ? Number.parseInt(record.pageCount, 10)
        : 0;
  const plannedPageCount =
    boundedRawSlides.length ||
    Math.min(bounds.max, Math.max(bounds.min, toSafeInt(requestedPageCount) || bounds.min));
  const coursePlan = normalizeCoursePlan(record.coursePlan, lessonTitle || 'HTML 课程');
  const courseSpine = normalizeCourseSpine(
    record.courseSpine,
    lessonTitle || 'HTML 课程',
    coursePlan,
    plannedPageCount,
  );
  const slideOutlines = rawSlideOutlines
    .slice(0, bounds.max)
    .map((outline, index) =>
      normalizeSlideTeachingOutline(
        outline,
        index,
        `第 ${index + 1} 页`,
        plannedPageCount,
        courseSpine,
      ),
    );
  const slides = boundedRawSlides
    .map((slide, index): LessonSlidePlan | null => {
      if (!slide || typeof slide !== 'object') return null;
      const item = slide as Record<string, unknown>;
      const outline = normalizeSlideTeachingOutline(
        rawSlideOutlines[index],
        index,
        String(item.title || `第 ${index + 1} 页`),
        plannedPageCount,
        courseSpine,
      );
      const rawBudget =
        item.contentBudget && typeof item.contentBudget === 'object'
          ? (item.contentBudget as Record<string, unknown>)
          : {};
      const title = compactText(String(item.title || `第 ${index + 1} 页`), 120);
      const pageKind = normalizePageKind(item.pageKind, index === 0 ? 'cover' : 'summary');
      const normalizedPageKind = structuralPageKind(index, boundedRawSlides.length, pageKind);
      const continuity = normalizeSlideContinuity(
        item.continuity || outline.continuity,
        index,
        plannedPageCount,
        title,
        courseSpine,
      );
      const routeText = [
        title,
        item.objective,
        item.htmlPrompt,
        item.learnerQuestion,
        item.keyPoints,
        item.sourceCoverage,
        item.sourceAnchors,
        item.sourceUseRationale,
        item.mandatoryVisibleContent,
        outline.learnerQuestion,
        outline.keyPoints,
        outline.sourceUseRationale,
        contextText,
      ]
        .flat()
        .filter(Boolean)
        .join('\n');
      const inferredRoute = inferCourseRouteFromText(routeText, normalizedPageKind);
      const rawCourseRoute = normalizeCourseRoute(
        item.courseRoute,
        inferredRoute === 'general' ? contextRoute : inferredRoute,
      );
      const courseRoute =
        contextRoute !== 'general' &&
        rawCourseRoute !== contextRoute &&
        inferredRoute === contextRoute
          ? contextRoute
          : rawCourseRoute;
      const csRoute =
        courseRoute === 'computer-science'
          ? normalizedPageKind === 'cover'
            ? 'standard'
            : normalizeCsRoute(item.csRoute, routeText)
          : undefined;
      const mathRoute =
        courseRoute === 'math'
          ? normalizedPageKind === 'cover'
            ? 'standard'
            : normalizeMathRoute(item.mathRoute, routeText, normalizedPageKind)
          : undefined;
      const density = normalizeDensity(item.density);
      const canvasMode = inferCanvasModeFromSlide({
        value: item.canvasMode || outline.canvasMode,
        pageKind: normalizedPageKind,
        courseRoute,
        csRoute,
        mathRoute,
        density,
        text: routeText,
      });
      const canvasHeight = normalizeCanvasHeight(
        item.canvasHeight || outline.canvasHeight,
        canvasMode,
        density,
      );
      const isCoverPage = normalizedPageKind === 'cover';
      const minChars = toSafeInt(rawBudget.visibleCharsMin as number | undefined);
      const maxChars = toSafeInt(rawBudget.visibleCharsMax as number | undefined);
      const defaultMinChars = isCoverPage
        ? 20
        : canvasMode === 'long'
          ? density === 'light'
            ? 360
            : 480
          : canvasMode === 'tall'
            ? density === 'light'
              ? 180
              : 260
            : density === 'light'
              ? 70
              : 110;
      const defaultMaxChars = isCoverPage
        ? 120
        : canvasMode === 'long'
          ? density === 'dense'
            ? 1300
            : 1000
          : canvasMode === 'tall'
            ? density === 'dense'
              ? 760
              : 620
            : density === 'dense'
              ? 360
              : 280;
      const contentBudget = {
        visibleCharsMin: minChars > 0 ? minChars : defaultMinChars,
        visibleCharsMax: isCoverPage
          ? Math.min(maxChars > 0 ? maxChars : defaultMaxChars, defaultMaxChars)
          : maxChars > 0
            ? maxChars
            : defaultMaxChars,
        mainRegions: isCoverPage
          ? 1
          : canvasMode === 'long'
            ? Math.min(7, Math.max(3, toSafeInt(rawBudget.mainRegions as number) || 5))
            : canvasMode === 'tall'
              ? Math.min(5, Math.max(2, toSafeInt(rawBudget.mainRegions as number) || 3))
              : Math.min(3, Math.max(1, toSafeInt(rawBudget.mainRegions as number) || 2)),
        blockCount: isCoverPage
          ? 2
          : canvasMode === 'long'
            ? Math.min(16, Math.max(6, toSafeInt(rawBudget.blockCount as number) || 10))
            : canvasMode === 'tall'
              ? Math.min(12, Math.max(4, toSafeInt(rawBudget.blockCount as number) || 7))
              : Math.min(8, Math.max(2, toSafeInt(rawBudget.blockCount as number) || 4)),
        mustDeleteIfCrowded: isCoverPage
          ? ['副标题', '来源信息', '短标签']
          : toStringArray(rawBudget.mustDeleteIfCrowded, 6),
      };
      const learnerQuestion = compactText(
        String(
          item.learnerQuestion ||
            outline.learnerQuestion ||
            (isCoverPage ? `这本 notebook 的主题是什么？` : `这一页要解决：${title}`),
        ),
        220,
      );
      const keyPoints = toStringArray(item.keyPoints, 6);
      const mergedKeyPoints = isCoverPage
        ? [title]
        : keyPoints.length
          ? keyPoints
          : outline.keyPoints;
      const sourceAnchors = toStringArray(item.sourceAnchors, 8);
      const mergedSourceAnchors = isCoverPage
        ? [`整本 notebook 主题：${title}`]
        : sourceAnchors.length
          ? sourceAnchors
          : outline.sourceAnchors;
      const sourceImageIds = isCoverPage
        ? []
        : toStringArray(item.sourceImageIds, 4)
            .concat(outline.sourceImageIds)
            .filter(
              (id, idIndex, all) => /^[A-Za-z0-9_.:-]+$/.test(id) && all.indexOf(id) === idIndex,
            )
            .slice(0, 4);
      const sourceUseRationale = compactText(
        String(
          item.sourceUseRationale ||
            outline.sourceUseRationale ||
            (isCoverPage
              ? '封面只使用整本 notebook 标题和课程主题，不展开具体 source page。'
              : '保留源材料的核心学习目标，并按页面容量决定直接使用、改写或换例。'),
        ),
        260,
      );
      const visualPlan = compactText(
        String(
          item.visualPlan ||
            outline.visualPlan ||
            (isCoverPage
              ? '全幅内置封面背景；主标题直接叠在背景上，不使用标题卡、半透明面板或居中盒子。'
              : '用可编辑 DOM 结构呈现本页关键判断。'),
        ),
        260,
      );
      const mandatoryVisibleContent = toStringArray(item.mandatoryVisibleContent, 10);
      const mergedMandatoryVisibleContent = isCoverPage
        ? [`主标题「${title}」`, 'full-bleed 内置封面背景/主视觉']
        : mandatoryVisibleContent.length
          ? mandatoryVisibleContent
          : outline.mandatoryVisibleContent.length
            ? outline.mandatoryVisibleContent
            : mergedKeyPoints;
      const optionalContent = toStringArray(item.optionalContent, 8);
      const mergedOptionalContent = isCoverPage
        ? ['最多 1 行 18 字以内副标题/元信息', '可全部省略']
        : optionalContent.length
          ? optionalContent
          : outline.optionalContent;
      let htmlPrompt = typeof item.htmlPrompt === 'string' ? item.htmlPrompt.trim() : '';
      if (!htmlPrompt || htmlPrompt.length < 120) {
        htmlPrompt = synthesizeHtmlPromptFromStructuredSlide({
          lessonTitle: compactText(String(record.lessonTitle || 'HTML 整节课测试'), 120),
          pageCount: plannedPageCount,
          order: index + 1,
          slide: {
            title,
            pageKind: normalizedPageKind,
            objective: compactText(
              String(item.objective || outline.teachingObjective || title),
              260,
            ),
            learnerQuestion,
            keyPoints: mergedKeyPoints,
            sourceAnchors: mergedSourceAnchors,
            sourceImageIds,
            sourceUseRationale,
            visualPlan,
            mandatoryVisibleContent: mergedMandatoryVisibleContent,
            optionalContent: mergedOptionalContent,
            density,
            courseRoute,
            csRoute,
            mathRoute,
            canvasMode,
            canvasHeight,
            continuity,
            contentBudget,
          },
        });
      }
      htmlPrompt = sanitizeHtmlPromptForCourseRoute(htmlPrompt, courseRoute, csRoute, mathRoute);
      if (!htmlPrompt || htmlPrompt.length < 120) return null;
      return {
        id: compactText(String(item.id || `slide-${index + 1}`), 80) || `slide-${index + 1}`,
        order: index + 1,
        title,
        pageKind: normalizedPageKind,
        canvasMode,
        canvasHeight,
        courseRoute,
        csRoute,
        mathRoute,
        density,
        densityTarget: density,
        objective: compactText(String(item.objective || title), 260),
        learnerQuestion,
        keyPoints: mergedKeyPoints,
        sourceCoverage: toStringArray(item.sourceCoverage, 6),
        sourceAnchors: mergedSourceAnchors,
        sourceImageIds,
        sourceUseRationale,
        visualPlan,
        continuity,
        mandatoryVisibleContent: mergedMandatoryVisibleContent,
        optionalContent: mergedOptionalContent,
        sourceUsage: normalizeSourceUsage(item.sourceUsage),
        contentBudget,
        htmlPrompt: htmlPrompt.slice(0, 5000),
      };
    })
    .filter((slide): slide is LessonSlidePlan => Boolean(slide));

  if (slides.length < bounds.min || slides.length > bounds.max) return null;
  const routedSlides =
    contextRoute === 'computer-science'
      ? forceComputerScienceRouteMix(
          slides.map((slide) => ({
            ...slide,
            courseRoute: slide.courseRoute === 'general' ? 'computer-science' : slide.courseRoute,
            csRoute:
              slide.courseRoute === 'computer-science' || slide.courseRoute === 'general'
                ? slide.csRoute ||
                  normalizeCsRoute(undefined, [slide.htmlPrompt, contextText].join('\n'))
                : slide.csRoute,
          })),
          contextText,
        )
      : slides;
  const slidesWithPromptContract = routedSlides.map((slide) =>
    enforceHtmlPromptContract(slide, slides.length),
  );

  return {
    lessonTitle,
    pageCountTier: tier,
    pageCount: slidesWithPromptContract.length,
    coursePlan: {
      ...coursePlan,
      coreQuestions: coursePlan.coreQuestions.length
        ? coursePlan.coreQuestions
        : slidesWithPromptContract.map((slide) => slide.learnerQuestion).slice(0, 3),
    },
    courseSpine,
    slideOutlines: slidesWithPromptContract.map((slide, index) => {
      const outline = slideOutlines[index];
      return {
        id: slide.id,
        order: slide.order,
        title: slide.title,
        canvasMode: slide.canvasMode,
        canvasHeight: slide.canvasHeight,
        learnerQuestion: slide.learnerQuestion || outline?.learnerQuestion || '',
        teachingObjective: slide.objective || outline?.teachingObjective || '',
        keyPoints: slide.keyPoints?.length ? slide.keyPoints : outline?.keyPoints || [],
        sourceAnchors: slide.sourceAnchors?.length
          ? slide.sourceAnchors
          : outline?.sourceAnchors || [],
        sourceImageIds: slide.sourceImageIds?.length
          ? slide.sourceImageIds
          : outline?.sourceImageIds || [],
        sourceUseRationale: slide.sourceUseRationale || outline?.sourceUseRationale || '',
        continuity:
          slide.continuity ||
          outline?.continuity ||
          normalizeSlideContinuity(
            undefined,
            index,
            slidesWithPromptContract.length,
            slide.title,
            courseSpine,
          ),
        visualPlan: slide.visualPlan || outline?.visualPlan || '',
        mandatoryVisibleContent: slide.mandatoryVisibleContent?.length
          ? slide.mandatoryVisibleContent
          : outline?.mandatoryVisibleContent || [],
        optionalContent: slide.optionalContent?.length
          ? slide.optionalContent
          : outline?.optionalContent || [],
      };
    }),
    planningNotes: toStringArray(record.planningNotes, 8),
    slides: slidesWithPromptContract,
  };
}

export function parsePlan(
  text: string,
  tier: PageCountTier,
  context?: { routeHint?: HtmlCourseRoute; contextText?: string },
): LessonPlan | null {
  try {
    return normalizePlan(JSON.parse(extractJsonObject(text)), tier, context);
  } catch {
    return null;
  }
}

export function parseCourseSpinePlan(
  text: string,
  tier: PageCountTier,
  fallbackTitle: string,
): LessonPlan | null {
  try {
    const record = JSON.parse(extractJsonObject(text)) as Record<string, unknown>;
    const bounds = tierBounds(tier);
    const lessonTitle = compactText(
      String(record.lessonTitle || fallbackTitle || 'HTML 课程'),
      120,
    );
    const requestedPageCount =
      typeof record.pageCount === 'number'
        ? record.pageCount
        : typeof record.pageCount === 'string'
          ? Number.parseInt(record.pageCount, 10)
          : bounds.min;
    const pageCount = Math.min(
      bounds.max,
      Math.max(bounds.min, toSafeInt(requestedPageCount) || bounds.min),
    );
    const coursePlan = normalizeCoursePlan(record.coursePlan, lessonTitle);
    const courseSpine = normalizeCourseSpine(
      record.courseSpine,
      lessonTitle,
      coursePlan,
      pageCount,
    );
    if (!coursePlan.courseGoal || !coursePlan.coreQuestions.length || !courseSpine.logline) {
      return null;
    }
    return {
      lessonTitle,
      pageCountTier: tier,
      pageCount,
      coursePlan,
      courseSpine,
      slideOutlines: [],
      planningNotes: toStringArray(record.planningNotes, 4),
      slides: [],
    };
  } catch {
    return null;
  }
}

export function describePlanParseFailure(text: string, tier: PageCountTier): string {
  const bounds = tierBounds(tier);
  try {
    const parsed = JSON.parse(extractJsonObject(text)) as Record<string, unknown>;
    const slides = Array.isArray(parsed.slides) ? parsed.slides : [];
    if (!slides.length) {
      return `规划输出没有 slides 数组；当前档位要求 ${bounds.min}-${bounds.max} 页。`;
    }
    if (slides.length < bounds.min) {
      return `规划页数不足：当前档位要求 ${bounds.min}-${bounds.max} 页，但模型只返回 ${slides.length} 页。`;
    }
    if (slides.length > bounds.max) {
      return `规划页数过多：当前档位要求 ${bounds.min}-${bounds.max} 页，但模型返回 ${slides.length} 页。`;
    }
    return `规划 JSON 结构不完整或页面字段不合格；当前档位要求 ${bounds.min}-${bounds.max} 页，每页必须包含 title/pageKind/canvasMode/canvasHeight/sourceAnchors/sourceUseRationale/htmlPrompt 等字段。`;
  } catch (error) {
    return `规划输出不是可解析 JSON：${error instanceof Error ? error.message : String(error)}`;
  }
}
