import type {
  HtmlCourseRoute,
  LessonPlan,
  LessonSlidePlan,
  PlanningQualityIssue,
  PlanningQualityReport,
  RequestBody,
  SourceImageInput,
} from './types';
import { compactText } from './source-utils';
import { tierBounds } from './routes';

export function isGenericPlanningText(value: string | null | undefined): boolean {
  const text = compactText(value || '', 220).toLowerCase();
  if (!text) return true;
  if (text.length < 10) return true;
  return (
    /源材料|核心主线|当前 notebook|当前课程|本节课|相关内容|主要内容|知识点|学习者|教学目标/.test(
      text,
    ) &&
    !/[a-z_]{3,}|\d|[∈⊆×≤≥→↔=]|函数|关系|矩阵|马尔可夫|class|object|tweet|stack|heap|figure|算法|证明|推导|定理|定义|属性|状态|概率/.test(
      text,
    )
  );
}

export function isSpecificSourceAnchor(anchor: string): boolean {
  const text = compactText(anchor, 180);
  if (!text || text.length < 8) return false;
  if (/^(源页|第\s*\d+\s*页|page\s*\d+|source\s*\d+)[:：\s-]*$/i.test(text)) return false;
  if (/^(源材料|源文本|课程主线|notebook\s*source)$/i.test(text)) return false;
  return /[:：；,，。()\[\]{}]|[∈⊆×≤≥→↔=]|[A-Za-z_]{3,}|\d|定义|公式|例|图|表|代码|片段|命题|证明|推导|矩阵|关系|属性|状态|Figure/i.test(
    text,
  );
}

export function hasLongCanvasSignal(slide: LessonSlidePlan): boolean {
  const text = [
    slide.title,
    slide.objective,
    slide.learnerQuestion,
    slide.visualPlan,
    slide.htmlPrompt,
    ...slide.keyPoints,
    ...slide.mandatoryVisibleContent,
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  return (
    slide.density === 'dense' ||
    (slide.courseRoute === 'math' &&
      (slide.mathRoute === 'proof' ||
        slide.mathRoute === 'derivation' ||
        slide.mathRoute === 'worked-example')) ||
    (slide.courseRoute === 'computer-science' &&
      slide.csRoute !== undefined &&
      slide.csRoute !== 'standard') ||
    /长页面|长页|完整例题|证明|推导|逐步|walkthrough|trace|memory|stack|heap|call stack|代码讲解|递归|状态追踪/.test(
      text,
    )
  );
}

export function planningIssue(
  code: string,
  title: string,
  severity: PlanningQualityIssue['severity'],
  details: string[],
): PlanningQualityIssue | null {
  const compactDetails = details.map((detail) => compactText(detail, 220)).filter(Boolean);
  if (compactDetails.length === 0) return null;
  return {
    code,
    title,
    severity,
    details: compactDetails.slice(0, 8),
  };
}

export function evaluatePlanningQuality(args: {
  plan: LessonPlan;
  bounds: ReturnType<typeof tierBounds>;
  routeHint: HtmlCourseRoute;
  sourceImages: SourceImageInput[];
  imageUsePolicy: RequestBody['imageUsePolicy'];
}): PlanningQualityReport {
  const { plan, bounds, routeHint, sourceImages } = args;
  const issues: PlanningQualityIssue[] = [];
  const sourceImageIds = new Set(
    sourceImages.map((image) => image.id).filter((id): id is string => Boolean(id)),
  );
  const nonCoverSlides = plan.slides.filter((slide) => slide.pageKind !== 'cover');

  const coursePlan = plan.coursePlan;
  const genericCourseDetails: string[] = [];
  if (!coursePlan || isGenericPlanningText(coursePlan.courseGoal)) {
    genericCourseDetails.push('coursePlan.courseGoal 太泛，不能看出这本 notebook 的具体知识主线。');
  }
  if (!coursePlan?.coreQuestions?.length || coursePlan.coreQuestions.length < 2) {
    genericCourseDetails.push('coursePlan.coreQuestions 少于 2 个，缺少学生视角问题。');
  }
  const courseIssue = planningIssue(
    'generic-course-plan',
    '课程规划层过泛',
    'error',
    genericCourseDetails,
  );
  if (courseIssue) issues.push(courseIssue);

  const courseSpine = plan.courseSpine;
  const spineDetails: string[] = [];
  if (!courseSpine?.logline || isGenericPlanningText(courseSpine.logline)) {
    spineDetails.push('courseSpine.logline 缺少像电影一句话剧情那样的整课主线。');
  }
  if (!courseSpine?.openingHook || !courseSpine.centralQuestion) {
    spineDetails.push('courseSpine 缺少 openingHook 或 centralQuestion，开场总问题不清楚。');
  }
  if (!courseSpine?.acts?.length || courseSpine.acts.length < 3) {
    spineDetails.push('courseSpine.acts 少于 3 幕，缺少总-分-总结构。');
  }
  if (!courseSpine?.closingCallback) {
    spineDetails.push('courseSpine.closingCallback 为空，最后一页不知道回扣什么。');
  }
  const weakContinuityDetails = plan.slides
    .filter(
      (slide) =>
        !slide.continuity?.fromPrevious ||
        !slide.continuity.pageMove ||
        !slide.continuity.toNext ||
        !slide.continuity.callbackToSpine,
    )
    .slice(0, 6)
    .map((slide) => `第 ${slide.order} 页「${slide.title}」缺少完整 continuity 分镜承接。`);
  spineDetails.push(...weakContinuityDetails);
  const spineIssue = planningIssue(
    'weak-course-spine',
    '整课主线与分镜承接不足',
    'error',
    spineDetails,
  );
  if (spineIssue) issues.push(spineIssue);

  const anchorDetails = nonCoverSlides
    .filter((slide) => !slide.sourceAnchors.some(isSpecificSourceAnchor))
    .slice(0, 6)
    .map((slide) => `第 ${slide.order} 页「${slide.title}」缺少具体 source anchor。`);
  const anchorIssue = planningIssue(
    'weak-source-anchors',
    '页面缺少具体源材料锚点',
    'error',
    anchorDetails,
  );
  if (anchorIssue) issues.push(anchorIssue);

  const inventedImageDetails = plan.slides
    .flatMap((slide) =>
      slide.sourceImageIds
        .filter((id) => !sourceImageIds.has(id))
        .map((id) => `第 ${slide.order} 页「${slide.title}」引用不存在的原文图片 ${id}。`),
    )
    .slice(0, 8);
  const imageIssue = planningIssue(
    'invalid-source-images',
    '规划引用了不存在的原文图片',
    'error',
    inventedImageDetails,
  );
  if (imageIssue) issues.push(imageIssue);

  const routeMismatchDetails: string[] = [];
  if (routeHint !== 'general' && nonCoverSlides.length) {
    const mismatched = nonCoverSlides.filter((slide) => slide.courseRoute !== routeHint);
    if (mismatched.length > Math.max(1, Math.floor(nonCoverSlides.length * 0.35))) {
      routeMismatchDetails.push(
        `初步识别课程路线为 ${routeHint}，但 ${mismatched.length}/${nonCoverSlides.length} 个正文页不是这个路线。`,
      );
    }
  }
  if (routeHint === 'math') {
    const weakMathSlides = nonCoverSlides.filter(
      (slide) =>
        slide.courseRoute === 'math' &&
        (slide.pageKind === 'math' || slide.pageKind === 'example') &&
        (!slide.mathRoute || slide.mathRoute === 'standard') &&
        /证明|推导|公式|例题|定义|定理|矩阵|关系|概率|向量/.test(
          [slide.title, slide.objective, slide.htmlPrompt].join('\n'),
        ),
    );
    if (weakMathSlides.length) {
      routeMismatchDetails.push(
        ...weakMathSlides
          .slice(0, 4)
          .map(
            (slide) =>
              `第 ${slide.order} 页「${slide.title}」像数学页，但 mathRoute 仍是 standard。`,
          ),
      );
    }
  }
  if (routeHint === 'computer-science') {
    const hasSpecialCs = nonCoverSlides.some(
      (slide) => slide.courseRoute === 'computer-science' && slide.csRoute !== 'standard',
    );
    const hasCsSignal =
      /class|object|stack|heap|trace|pointer|tree|graph|递归|引用|属性|对象|内存|执行|代码|变量/i.test(
        nonCoverSlides
          .map((slide) => [slide.title, slide.objective, slide.htmlPrompt].join('\n'))
          .join('\n'),
      );
    if (hasCsSignal && !hasSpecialCs) {
      routeMismatchDetails.push('CS 源材料有代码/对象/状态信号，但没有任何 CS 专属语义页。');
    }
  }
  const routeIssue = planningIssue(
    'route-mismatch',
    '课程路线或专属版式不匹配',
    'error',
    routeMismatchDetails,
  );
  if (routeIssue) issues.push(routeIssue);

  const canvasDetails: string[] = [];
  for (const slide of nonCoverSlides) {
    if (slide.canvasMode === 'slide') {
      const tooDenseForSlide =
        slide.contentBudget.mainRegions > 3 ||
        slide.contentBudget.blockCount > 8 ||
        slide.contentBudget.visibleCharsMax > 420 ||
        (slide.density === 'dense' && hasLongCanvasSignal(slide));
      if (tooDenseForSlide) {
        canvasDetails.push(
          `第 ${slide.order} 页「${slide.title}」按 16:9 规划但容量偏高，应拆页、降密度或设为 tall/long。`,
        );
      }
    }
    if (slide.canvasMode === 'tall') {
      const tooDenseForTall =
        slide.contentBudget.mainRegions > 5 ||
        slide.contentBudget.blockCount > 12 ||
        slide.contentBudget.visibleCharsMax > 900 ||
        (slide.density === 'dense' && hasLongCanvasSignal(slide));
      if (tooDenseForTall) {
        canvasDetails.push(
          `第 ${slide.order} 页「${slide.title}」按 tall 规划但仍然偏重，应拆页或设为 long。`,
        );
      }
    }
    if (slide.canvasMode === 'long' && !hasLongCanvasSignal(slide)) {
      canvasDetails.push(
        `第 ${slide.order} 页「${slide.title}」被设为 long，但看不出证明/推导/trace/代码 walkthrough 等长页理由；可能更适合 tall。`,
      );
    }
  }
  const canvasIssue = planningIssue(
    'canvas-density-mismatch',
    '画布模式与内容密度不匹配',
    'error',
    canvasDetails.slice(0, 6),
  );
  if (canvasIssue) issues.push(canvasIssue);

  const countDetails: string[] = [];
  if (plan.pageCount < bounds.min || plan.pageCount > bounds.max) {
    countDetails.push(`规划页数 ${plan.pageCount} 不在当前档位 ${bounds.min}-${bounds.max} 内。`);
  }
  if (plan.slides[0]?.pageKind !== 'cover') {
    countDetails.push('第 1 页不是 cover。');
  }
  if (plan.pageCount >= 4 && plan.slides[1]?.pageKind !== 'intro') {
    countDetails.push('第 2 页不是 intro；整本 notebook 需要封面后的介绍/导入页。');
  }
  if (plan.pageCount >= 4 && plan.slides[plan.slides.length - 1]?.pageKind !== 'summary') {
    countDetails.push('最后 1 页不是 summary；整本 notebook 需要总结/回收页。');
  }
  if (plan.slideOutlines.length !== plan.slides.length) {
    countDetails.push(
      `slideOutlines 数量 ${plan.slideOutlines.length} 与 slides 数量 ${plan.slides.length} 不一致。`,
    );
  }
  const countIssue = planningIssue('shape-mismatch', '规划结构不完整', 'error', countDetails);
  if (countIssue) issues.push(countIssue);

  const cover = plan.slides[0];
  const coverDetails: string[] = [];
  if (
    cover &&
    !/tech_hero_title|cinematic_title_frame|academic_hero_cover|image_title_overlay|\/slide-backgrounds\/|封面背景|主视觉/i.test(
      cover.htmlPrompt,
    )
  ) {
    coverDetails.push('封面 htmlPrompt 没有明确内置封面背景/主视觉语言。');
  }
  if (cover && !/主标题|大标题|唯一必须|只保留|只包含|文字克制|不展开正文/.test(cover.htmlPrompt)) {
    coverDetails.push('封面 htmlPrompt 没有明确“主标题为唯一必须文字 / 少文字 / 不展开正文”。');
  }
  if (
    cover &&
    !/full-bleed|全幅|铺满画布|直接叠|标题直接|不要.*(?:标题卡|面板|card|panel)|禁止.*(?:标题卡|面板|card|panel)/i.test(
      cover.htmlPrompt,
    )
  ) {
    coverDetails.push('封面 htmlPrompt 没有明确“全幅主视觉 + 标题直接叠加 + 不使用标题卡/面板”。');
  }
  if (cover?.sourceImageIds.length) {
    coverDetails.push('封面不应该占用 sourceImageIds；封面背景应使用内置背景或 CSS 主视觉。');
  }
  const coverIssue = planningIssue(
    'cover-visual-contract',
    '封面视觉契约不完整',
    'error',
    coverDetails,
  );
  if (coverIssue) issues.push(coverIssue);

  const imageUseDetails: string[] = [];
  if (args.imageUsePolicy === 'prefer-source-images' && sourceImageIds.size > 0) {
    const usedImageCount = new Set(plan.slides.flatMap((slide) => slide.sourceImageIds)).size;
    const hasImageFriendlyPage = plan.slides.some((slide) =>
      /图|figure|表|chart|结果|架构|流程|对比|读图|截图|论文/i.test(
        [slide.title, slide.objective, slide.visualPlan, slide.htmlPrompt].join('\n'),
      ),
    );
    if (usedImageCount === 0 && hasImageFriendlyPage) {
      imageUseDetails.push(
        '有原文图片且页面目标包含读图/图表信号，但规划完全没有分配 sourceImageIds。',
      );
    }
  }
  const imageUseIssue = planningIssue(
    'source-image-underuse',
    '原文图片使用不足',
    'warning',
    imageUseDetails,
  );
  if (imageUseIssue) issues.push(imageUseIssue);

  const blockingIssueCount = issues.filter((issue) => issue.severity === 'error').length;
  const warningIssueCount = issues.filter((issue) => issue.severity === 'warning').length;
  return {
    passed: blockingIssueCount === 0,
    blockingIssueCount,
    warningIssueCount,
    issues,
    summary:
      blockingIssueCount === 0
        ? warningIssueCount
          ? `规划可用，但有 ${warningIssueCount} 个质量提醒。`
          : '规划通过质量检查。'
        : `规划未通过：${blockingIssueCount} 个阻塞问题，${warningIssueCount} 个提醒。`,
  };
}

export function planningQualityScore(report: PlanningQualityReport): number {
  return report.blockingIssueCount * 10 + report.warningIssueCount;
}

export function buildPlanningQualityRetryPrompt(args: {
  originalPrompt: string;
  previousPlan: LessonPlan;
  quality: PlanningQualityReport;
  bounds: ReturnType<typeof tierBounds>;
}): string {
  const issueLines = args.quality.issues.flatMap((issue) => [
    `- [${issue.severity}] ${issue.title} (${issue.code})`,
    ...issue.details.map((detail) => `  - ${detail}`),
  ]);
  return [
    args.originalPrompt,
    '',
    '=== 规划 QA 重试任务 ===',
    '你上一次返回的 JSON 已经能解析，但没有通过整本 notebook 规划质量检查。',
    '这次不要只换标题或美化措辞，必须修复下面的具体问题，然后重新返回完整 JSON。',
    `页数仍必须在 ${args.bounds.min}-${args.bounds.max} 页之间。`,
    '',
    '失败项：',
    issueLines.join('\n'),
    '',
    '修复要求：',
    '- coursePlan 只做轻量导演阐述：courseGoal 1 句、coreQuestions 2-3 个；不要写 narrativeArc，叙事推进只写在 courseSpine.acts。',
    '- courseSpine 必须像电影脚本的 logline + acts：写清 openingHook、centralQuestion、3-5 幕 acts、recurringExample、visualMotif、closingCallback，形成总-分-总。',
    '- 每个 slideOutline 和 slide 都必须有 continuity：actId、rhetoricalRole、fromPrevious、pageMove、toNext、callbackToSpine；每页只推进一个分镜动作。',
    '- slideOutlines 必须和 slides 一一对应，每页都有 learnerQuestion、teachingObjective、具体 sourceAnchors、sourceUseRationale、visualPlan、mandatoryVisibleContent。',
    '- sourceAnchors 不能只写“第几页/源材料/主线”，必须写具体定义、公式、图、表、代码片段、例子或原文判断。',
    '- 结构必须固定为：第 1 页 cover，第 2 页 intro，最后 1 页 summary；中间页面才承载正文教学序列。',
    '- cover 的 htmlPrompt 必须要求内置封面背景/主视觉语言，例如 tech_hero_title / cinematic_title_frame / academic_hero_cover / image_title_overlay；主标题是唯一必须文字，最多 1 行极短副标题/元信息可选，背景必须 full-bleed 铺满画布，标题直接叠在背景上，不能做白底空封面、标题卡、半透明面板或占位说明封面。',
    '- intro 必须说明为什么学、学习路径和入口问题；summary 必须收束 takeaway、回看路径和下一步问题。',
    '- courseRoute / csRoute / mathRoute 必须和源材料匹配；数学页用数学结构，CS 页用合适的标准页或专属语义页。',
    '- canvasMode 必须由内容密度决定：普通页保持 slide；略微放不下但仍是单个教学动作的页设为 tall；完整证明、长推导、完整例题、代码 trace、memory/call stack 等纵向过程页才设为 long。',
    '- 如果引用 sourceImageIds，只能引用原文图片清单中真实存在的 ID。',
    '- htmlPrompt 必须只是 slideOutline 的渲染翻译，不能新增第二主题。',
    '',
    '上一版规划 JSON（用于定位问题，不要照抄错误）：',
    JSON.stringify(args.previousPlan, null, 2).slice(0, 18000),
    '',
    '现在返回修复后的完整 JSON。只返回 JSON，不要 markdown。',
  ].join('\n');
}
