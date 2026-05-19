export type HtmlCanvasMode = 'slide' | 'tall' | 'long';

export type HtmlSlideContentBudgetContract = {
  visibleCharsMin?: number;
  visibleCharsMax?: number;
  mainRegions?: number;
  blockCount?: number;
  mustDeleteIfCrowded?: string[];
};

export type HtmlSlideContinuityContract = {
  actId?: string;
  rhetoricalRole?: string;
  fromPrevious?: string;
  pageMove?: string;
  toNext?: string;
  callbackToSpine?: string;
};

export type HtmlSlideOutlineContract = {
  id?: string;
  order?: number;
  title?: string;
  learnerQuestion?: string;
  teachingObjective?: string;
  keyPoints?: string[];
  sourceAnchors?: string[];
  sourceImageIds?: string[];
  sourceUseRationale?: string;
  continuity?: HtmlSlideContinuityContract;
  visualPlan?: string;
  mandatoryVisibleContent?: string[];
  optionalContent?: string[];
};

export type HtmlSlidePlanContract = {
  id?: string;
  order?: number;
  title?: string;
  pageKind?: string;
  canvasMode?: string;
  canvasHeight?: number;
  courseRoute?: string;
  csRoute?: string;
  mathRoute?: string;
  density?: string;
  objective?: string;
  learnerQuestion?: string;
  keyPoints?: string[];
  sourceCoverage?: string[];
  sourceAnchors?: string[];
  sourceImageIds?: string[];
  sourceUseRationale?: string;
  visualPlan?: string;
  continuity?: HtmlSlideContinuityContract;
  mandatoryVisibleContent?: string[];
  optionalContent?: string[];
  sourceUsage?: string;
  contentBudget?: HtmlSlideContentBudgetContract;
  htmlPrompt?: string;
  coverBackgroundUrl?: string;
};

export type HtmlCoursePlanContract = {
  targetLearner?: string;
  courseGoal?: string;
  narrativeArc?: string[];
  coreQuestions?: string[];
  sourceDigest?: string[];
  pacingStrategy?: string;
};

export type HtmlCourseSpineActContract = {
  id?: string;
  act?: string;
  title?: string;
  purpose?: string;
  pages?: number[];
  keyQuestion?: string;
  visualMotif?: string;
};

export type HtmlCourseSpineContract = {
  logline?: string;
  openingHook?: string;
  centralQuestion?: string;
  acts?: HtmlCourseSpineActContract[];
  recurringExample?: string;
  visualMotif?: string;
  closingCallback?: string;
};

export type HtmlLessonPlanContract = {
  lessonTitle?: string;
  pageCount?: number;
  coursePlan?: HtmlCoursePlanContract;
  courseSpine?: HtmlCourseSpineContract;
  slideOutlines?: HtmlSlideOutlineContract[];
  planningNotes?: string[];
  slides?: HtmlSlidePlanContract[];
};

export type HtmlSlideContractOptions = {
  language?: 'zh-CN' | 'en-US';
  includeCoverVisualContract?: boolean;
  heading?: string;
};

function lines(items: Array<string | undefined | null>): string {
  return items.filter((item): item is string => Boolean(item?.trim())).join('\n');
}

function densityLabel(level: string | undefined): string {
  if (level === 'light') return '轻量';
  if (level === 'dense') return '信息密集';
  return '标准';
}

function coverBackgroundInstruction(slide: HtmlSlidePlanContract): string {
  if (slide.coverBackgroundUrl) {
    return `use this exact local image: ${slide.coverBackgroundUrl}.`;
  }

  return [
    'choose one real local /slide-backgrounds/ image that matches the topic and courseRoute.',
    'Do not always default to product-launch-dark-photo.png or academic-blueprint-photo.png.',
    'Good options include /slide-backgrounds/academic-blueprint-photo.png, /slide-backgrounds/lecture-hall-photo.png, /slide-backgrounds/science-lab-photo.png, /slide-backgrounds/dark-tech-neural.png, /slide-backgrounds/sci-fi-data-cockpit.png, /slide-backgrounds/cinematic-stage-photo.png, /slide-backgrounds/historical-manuscript.png, /slide-backgrounds/city-strategy-photo.png, and /slide-backgrounds/workspace-desk-photo.png.',
  ].join(' ');
}

export function getHtmlSlideCanvasMode(
  slide: Pick<HtmlSlidePlanContract, 'canvasMode'> | null | undefined,
): HtmlCanvasMode {
  if (slide?.canvasMode === 'long') return 'long';
  if (slide?.canvasMode === 'tall') return 'tall';
  return 'slide';
}

export function getHtmlSlideCanvasHeight(
  slide: Pick<HtmlSlidePlanContract, 'canvasMode' | 'canvasHeight'> | null | undefined,
): number {
  const mode = getHtmlSlideCanvasMode(slide);
  if (mode === 'slide') return 900;
  if (mode === 'tall') {
    const height = typeof slide?.canvasHeight === 'number' ? slide.canvasHeight : 1200;
    return Math.min(1600, Math.max(1050, Math.round(height)));
  }
  const height = typeof slide?.canvasHeight === 'number' ? slide.canvasHeight : 2200;
  return Math.min(3200, Math.max(1600, Math.round(height)));
}

export function buildHtmlSlideDensityContract(
  slide: HtmlSlidePlanContract,
  options: HtmlSlideContractOptions = {},
): string {
  const canvasMode = getHtmlSlideCanvasMode(slide);
  const canvasHeight = getHtmlSlideCanvasHeight(slide);
  const budget = slide.contentBudget;
  const title = slide.title || 'Untitled';

  if (options.includeCoverVisualContract && slide.pageKind === 'cover') {
    const textBudget = Math.max(80, title.length + 40);
    return lines([
      'Density: cover-title-only',
      'Page kind: cover',
      `Canvas: ${canvasMode} ${canvasHeight}px`,
      `Mandatory visible content: exact title "${title}"`,
      `Visible text budget: max ${textBudget} chars and max 2 text blocks.`,
      'Optional content: at most one very short meta/subtitle line; omit it if it weakens the cover.',
      `Required background image: ${coverBackgroundInstruction(slide)}`,
      'Pure CSS color or gradient backgrounds fail this test; the image texture must be visible.',
      'Forbidden visible text: notebook 封面, 封面页, cover, main visual, background, 主视觉, 背景, placeholder.',
      'Composition: full-bleed background/hero visual fills the canvas; title directly overlays the visual.',
      'Do not place the title inside a card, title panel, glass panel, content box, or centered rectangle.',
    ]);
  }

  const required = slide.mandatoryVisibleContent?.length
    ? slide.mandatoryVisibleContent.map((item, index) => `${index + 1}. ${item}`).join('\n')
    : '';

  return lines([
    `画布模式：${
      canvasMode === 'long'
        ? `长页面，宽 1600px，高约 ${canvasHeight}px`
        : canvasMode === 'tall'
          ? `中高课件页，宽 1600px，高约 ${canvasHeight}px`
          : '标准 16:9，1600×900'
    }`,
    `密度档：${densityLabel(slide.density)}`,
    `主标题必须逐字显示：${title}`,
    budget?.visibleCharsMin != null && budget?.visibleCharsMax != null
      ? `可见中文/等价字符：${budget.visibleCharsMin}-${budget.visibleCharsMax}`
      : '',
    budget?.mainRegions != null ? `主要内容区：最多 ${budget.mainRegions} 个` : '',
    budget?.blockCount != null ? `内容块：最多 ${budget.blockCount} 个` : '',
    required ? ['必需可见内容：', required].join('\n') : '',
    '这是规划后的单页 prompt；不要额外扩写，不要补第二主题。',
    'prompt 里明确要求的标题、数量、公式、步骤、短理由、结论和检查点都是必需保留内容。',
    '如果标题或 prompt 写了 5 个/4 步/3 条等数量，实际可见条目数量必须一致。',
    canvasMode === 'slide'
      ? '主内容必须用正常 flex/grid flow，不能让底部条、例子卡或结论卡覆盖上方卡片。'
      : '这是规划好的增高画布：用纵向 section 自然展开，不能把结论、结果、检查点或例子卡覆盖到前面的内容上。',
    '承载正文/公式/表格/步骤的卡片不能通过固定高度和 overflow:hidden 裁切内容。',
    budget?.mustDeleteIfCrowded?.length
      ? `如果拥挤，优先删除：${budget.mustDeleteIfCrowded.join('、')}`
      : '如果拥挤，优先删除次要说明、装饰标签、额外结论。',
  ]);
}

export function findHtmlSlideOutline(
  slide: HtmlSlidePlanContract,
  plan: HtmlLessonPlanContract,
): HtmlSlideOutlineContract | null {
  return (
    plan.slideOutlines?.find(
      (item) =>
        (slide.id && item.id === slide.id) || (slide.order != null && item.order === slide.order),
    ) || null
  );
}

function buildCourseSpineContract(plan: HtmlLessonPlanContract): string {
  const spine = plan.courseSpine;
  if (!spine) return '';
  return lines([
    '--- Movie-script course spine ---',
    spine.logline ? `Logline: ${spine.logline}` : '',
    spine.openingHook ? `Opening hook: ${spine.openingHook}` : '',
    spine.centralQuestion ? `Central question: ${spine.centralQuestion}` : '',
    spine.recurringExample ? `Recurring example: ${spine.recurringExample}` : '',
    spine.visualMotif ? `Visual motif: ${spine.visualMotif}` : '',
    spine.closingCallback ? `Closing callback: ${spine.closingCallback}` : '',
    spine.acts?.length
      ? `Acts:\n${spine.acts
          .map(
            (act) =>
              `${act.id || '-'} / ${act.act || '-'} / pages ${act.pages?.join(', ') || '-'}: ${act.title || '-'} - ${act.purpose || '-'}`,
          )
          .join('\n')}`
      : '',
  ]);
}

function buildContinuityContract(
  slide: HtmlSlidePlanContract,
  outline: HtmlSlideOutlineContract | null,
): string {
  const continuity = slide.continuity || outline?.continuity;
  if (!continuity) return '';
  return lines([
    '--- Page continuity beat ---',
    continuity.actId ? `Act id: ${continuity.actId}` : '',
    continuity.rhetoricalRole ? `Rhetorical role: ${continuity.rhetoricalRole}` : '',
    continuity.fromPrevious ? `From previous: ${continuity.fromPrevious}` : '',
    continuity.pageMove ? `Page move: ${continuity.pageMove}` : '',
    continuity.toNext ? `To next: ${continuity.toNext}` : '',
    continuity.callbackToSpine ? `Callback to spine: ${continuity.callbackToSpine}` : '',
  ]);
}

function buildCoverContract(
  slide: HtmlSlidePlanContract,
  options: HtmlSlideContractOptions,
): string {
  if (!options.includeCoverVisualContract || slide.pageKind !== 'cover') return '';
  return lines([
    '--- Cover visual override ---',
    `Render only the exact cover title "${slide.title || 'Untitled'}" plus at most one very short optional meta line.`,
    'Do not render placeholder labels such as notebook 封面, 封面页, cover, main visual, background, 主视觉, 背景.',
    `Background image: ${coverBackgroundInstruction(slide)}`,
    'The final HTML must contain a real <img> or CSS background-image URL from /slide-backgrounds/; pure gradient backgrounds fail.',
    'Use a full-bleed background/hero visual across the entire canvas; put the title directly on top of it with overlay/shadow for contrast.',
    'Do not wrap the title in a centered card, title panel, glass panel, content box, or large rounded rectangle.',
  ]);
}

export function buildHtmlSlideStructuredContext(
  slide: HtmlSlidePlanContract,
  plan: HtmlLessonPlanContract,
  options: HtmlSlideContractOptions = {},
): string {
  const coursePlan = plan.coursePlan;
  const outline = findHtmlSlideOutline(slide, plan);
  const canvasMode = getHtmlSlideCanvasMode(slide);
  const canvasHeight = getHtmlSlideCanvasHeight(slide);
  const heading = options.heading || '结构化单页教学 outline（优先级高于自由 prompt）：';
  const keyPoints = outline?.keyPoints?.length ? outline.keyPoints : slide.keyPoints || [];
  const mandatory = slide.mandatoryVisibleContent?.length
    ? slide.mandatoryVisibleContent
    : outline?.mandatoryVisibleContent || [];
  const sourceAnchors = outline?.sourceAnchors?.length
    ? outline.sourceAnchors
    : slide.sourceAnchors || [];

  return lines([
    heading,
    plan.lessonTitle ? `课程标题：${plan.lessonTitle}` : '',
    `整本课程目标：${coursePlan?.courseGoal || plan.lessonTitle || slide.objective || slide.title || ''}`,
    coursePlan?.narrativeArc?.length ? `整本叙事弧线：${coursePlan.narrativeArc.join(' -> ')}` : '',
    coursePlan?.coreQuestions?.length ? `整本核心问题：${coursePlan.coreQuestions.join('；')}` : '',
    buildCourseSpineContract(plan),
    outline?.title ? `规划层本页标题：${outline.title}` : '',
    slide.order != null && plan.pageCount != null
      ? `Slide ${slide.order}/${plan.pageCount}: ${slide.title || ''}`
      : '',
    `本页学习问题：${outline?.learnerQuestion || slide.learnerQuestion || slide.objective || ''}`,
    `本页教学目标：${outline?.teachingObjective || slide.objective || ''}`,
    keyPoints.length ? `本页关键点：${keyPoints.join('；')}` : '',
    outline?.visualPlan || slide.visualPlan
      ? `本页视觉计划：${outline?.visualPlan || slide.visualPlan}`
      : '',
    mandatory.length ? `本页必需可见内容：${mandatory.join('；')}` : '',
    outline?.optionalContent?.length
      ? `规划层可压缩/可删除内容：${outline.optionalContent.join('；')}`
      : '',
    slide.optionalContent?.length ? `可压缩/可删除内容：${slide.optionalContent.join('；')}` : '',
    sourceAnchors.length ? `源材料锚点：${sourceAnchors.join('；')}` : '',
    outline?.sourceUseRationale || slide.sourceUseRationale
      ? `源材料取舍理由：${outline?.sourceUseRationale || slide.sourceUseRationale}`
      : '',
    slide.sourceCoverage?.length ? `Source coverage:\n${slide.sourceCoverage.join('\n')}` : '',
    slide.courseRoute ? `Course route: ${slide.courseRoute}` : '',
    slide.csRoute ? `CS route: ${slide.csRoute}` : '',
    slide.mathRoute ? `Math route: ${slide.mathRoute}` : '',
    slide.density ? `Density: ${slide.density}` : '',
    buildContinuityContract(slide, outline),
    buildCoverContract(slide, options),
    `画布模式：${
      canvasMode === 'long'
        ? `长页面，宽 1600px，高约 ${canvasHeight}px；允许纵向展开，禁止横向滚动和内容重叠。`
        : canvasMode === 'tall'
          ? `中高课件页，宽 1600px，高约 ${canvasHeight}px；允许比 16:9 更高的正常文档流，禁止横向滚动和内容重叠。`
          : '标准 16:9，1600×900；禁止纵向滚动和内容重叠。'
    }`,
    slide.sourceImageIds?.length
      ? `必须使用的原文图片 ID：${slide.sourceImageIds.join(', ')}`
      : '本页没有分配原文图片，不要虚构 source image。',
    '生成要求：页面只回答本页学习问题；不要加入下一页/上一页的讲稿内容，不要新增第二主题。',
  ]);
}

export function buildHtmlSlidePromptFromPlan(
  slide: HtmlSlidePlanContract,
  plan: HtmlLessonPlanContract,
  options: HtmlSlideContractOptions & { routeInstruction?: string } = {},
): string {
  return lines([
    slide.htmlPrompt || '',
    buildHtmlSlideStructuredContext(slide, plan, options),
    options.routeInstruction || '',
  ]);
}
