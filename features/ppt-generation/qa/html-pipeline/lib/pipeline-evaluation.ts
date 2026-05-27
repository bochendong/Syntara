import { visibleTextFromHtml } from './pipeline-html';
import {
  getSinglePageTrialSlide,
  type ExpectedCourseRoute,
  type HtmlCourseRoute,
  type HtmlPageError,
  type HtmlPageResult,
  type LecturePageResult,
  type LessonPlan,
  type LessonSlidePlan,
  type PageCountTier,
  type PipelineCheck,
  type TestfileFixture,
} from './pipeline-types';
import {
  buildDensityContract,
  buildStructuredSlideContext,
  hasExternalCoverAsset,
  hasForbiddenCoverVisibleText,
  normalizeSearchText,
  sourcePagesFromFixture,
  sourceTextFromFixture,
} from './pipeline-html-generation';

export function expectedSourcePagesForTier(tier: PageCountTier): number {
  if (tier === 'under5') return 4;
  if (tier === 'under10') return 8;
  if (tier === 'under20') return 16;
  return 24;
}

export function isSpecificAnchor(value: string): boolean {
  const text = value.trim();
  if (text.length < 8) return false;
  if (/^(源页|第\s*\d+\s*页|page\s*\d+)[:：\s-]*$/i.test(text)) return false;
  return /[:：；,，。()\[\]{}]|[∈⊆×≤≥→↔=]|\d|定义|公式|例|图|表|代码|片段|命题|证明|推导|Figure|class|def|self/i.test(
    text,
  );
}

export function makeCheck(
  id: string,
  title: string,
  passed: boolean,
  detail: string,
  warn = false,
): PipelineCheck {
  return { id, title, status: passed ? 'pass' : warn ? 'warn' : 'fail', detail };
}

export const COURSE_ROUTE_LABELS: Record<HtmlCourseRoute, string> = {
  general: '通用',
  math: '数学',
  'computer-science': '计算机科学',
  science: '自然科学',
  business: '商业/经济/管理',
  humanities: '人文',
  'social-science': '社会科学',
};

export function courseRouteLabel(route: string | undefined): string {
  if (!route) return '未标注';
  return COURSE_ROUTE_LABELS[route as HtmlCourseRoute] || route;
}

export function inferExpectedCourseRouteFromFixture(
  fixture: TestfileFixture | null | undefined,
): ExpectedCourseRoute {
  if (!fixture) {
    return { route: 'general', label: COURSE_ROUTE_LABELS.general, evidence: '未选择 source。' };
  }
  const subjectText = [fixture.subject, fixture.sourcePackage?.subject].filter(Boolean).join(' ');
  const identityText = [subjectText, fixture.title, fixture.fileName, fixture.description]
    .filter(Boolean)
    .join('\n');
  const sourceSnippet = [
    ...sourcePagesFromFixture(fixture)
      .slice(0, 8)
      .flatMap((page) => [page.title, page.summary, page.keyPoints.join(' ')]),
    sourceTextFromFixture(fixture).slice(0, 3000),
  ].join('\n');
  const text = `${identityText}\n${sourceSnippet}`;
  const subjectFirst = subjectText || identityText;

  if (/数学|math|algebra|calculus|probability|statistics|geometry/i.test(subjectFirst)) {
    return { route: 'math', label: COURSE_ROUTE_LABELS.math, evidence: subjectFirst };
  }
  if (/计算机|computer|cs|program|code|oop|data|algorithm/i.test(subjectFirst)) {
    return {
      route: 'computer-science',
      label: COURSE_ROUTE_LABELS['computer-science'],
      evidence: subjectFirst,
    };
  }
  if (/社会|sociology|psychology|politic|policy|education/i.test(subjectFirst)) {
    return {
      route: 'social-science',
      label: COURSE_ROUTE_LABELS['social-science'],
      evidence: subjectFirst,
    };
  }
  if (/business|finance|econom|marketing|management|商业|经济|金融|管理/i.test(text)) {
    return { route: 'business', label: COURSE_ROUTE_LABELS.business, evidence: identityText };
  }
  if (/biology|chemistry|physics|science|实验|物理|化学|生物/i.test(text)) {
    return { route: 'science', label: COURSE_ROUTE_LABELS.science, evidence: identityText };
  }
  if (/history|literature|philosophy|humanities|历史|文学|哲学|人文/i.test(text)) {
    return { route: 'humanities', label: COURSE_ROUTE_LABELS.humanities, evidence: identityText };
  }
  if (
    /proof|theorem|derivative|integral|equation|homomorphism|kernel|group|集合|函数|证明|定理|公式|群/i.test(
      text,
    )
  ) {
    return { route: 'math', label: COURSE_ROUTE_LABELS.math, evidence: identityText };
  }
  if (
    /class|object|inheritance|interface|memory|stack|heap|recursion|python|java|self|继承|对象|内存|递归|代码|类/i.test(
      text,
    )
  ) {
    return {
      route: 'computer-science',
      label: COURSE_ROUTE_LABELS['computer-science'],
      evidence: identityText,
    };
  }
  return { route: 'general', label: COURSE_ROUTE_LABELS.general, evidence: identityText };
}

export function routeCoverageSummary(slides: LessonSlidePlan[]): string {
  const counts = new Map<string, number>();
  for (const slide of slides) {
    const route = slide.courseRoute || 'missing';
    counts.set(route, (counts.get(route) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([route, count]) => `${courseRouteLabel(route)} ${count}`)
    .join('，');
}

export function hasCsSpecializationSignal(fixture: TestfileFixture | null | undefined): boolean {
  const text = [
    fixture?.title,
    fixture?.description,
    fixture?.fileName,
    sourceTextFromFixture(fixture || null).slice(0, 5000),
  ]
    .filter(Boolean)
    .join('\n');
  return /class|object|inheritance|interface|memory|stack|heap|recursion|pointer|linked|tree|graph|queue|dictionary|self|__init__|继承|对象|内存|递归|指针|链表|树|图|队列|字典|代码|类/i.test(
    text,
  );
}

export function hasMathSpecializationSignal(fixture: TestfileFixture | null | undefined): boolean {
  const text = [
    fixture?.title,
    fixture?.description,
    fixture?.fileName,
    sourceTextFromFixture(fixture || null).slice(0, 5000),
  ]
    .filter(Boolean)
    .join('\n');
  return /proof|prove|theorem|lemma|derivation|formula|equation|homomorphism|kernel|integral|derivative|证明|定理|引理|推导|公式|方程|函数|群|集合/i.test(
    text,
  );
}

export function evaluateRouteContracts(
  plan: LessonPlan | null | undefined,
  fixture: TestfileFixture | null | undefined,
): PipelineCheck[] {
  if (!plan?.slides?.length) {
    return [makeCheck('route-contract-present', '课程路线契约可检测', false, '还没有 slides。')];
  }
  const expected = inferExpectedCourseRouteFromFixture(fixture);
  const slides = plan.slides;
  const teachingSlides = slides.filter((slide) => slide.pageKind !== 'cover');
  const missingCourseRoute = teachingSlides.filter((slide) => !slide.courseRoute).length;
  const mismatchedExpectedRoute =
    expected.route === 'general'
      ? 0
      : teachingSlides.filter((slide) => slide.courseRoute !== expected.route).length;
  const missingPromptRoute = teachingSlides.filter(
    (slide) => !/(课程路线|courseRoute)\s*[:：]/i.test(slide.htmlPrompt || ''),
  ).length;
  const csSlides = teachingSlides.filter((slide) => slide.courseRoute === 'computer-science');
  const mathSlides = teachingSlides.filter((slide) => slide.courseRoute === 'math');
  const missingCsRoute = csSlides.filter((slide) => !slide.csRoute).length;
  const missingMathRoute = mathSlides.filter((slide) => !slide.mathRoute).length;
  const missingCsPromptRoute = csSlides.filter(
    (slide) => !/(CS\s*版式|csRoute)\s*[:：]/i.test(slide.htmlPrompt || ''),
  ).length;
  const missingMathPromptRoute = mathSlides.filter(
    (slide) => !/(数学版式|mathRoute)\s*[:：]/i.test(slide.htmlPrompt || ''),
  ).length;
  const specializedCsSlides = csSlides.filter(
    (slide) => slide.csRoute && slide.csRoute !== 'standard',
  );
  const specializedMathSlides = mathSlides.filter(
    (slide) => slide.mathRoute && slide.mathRoute !== 'standard',
  );
  const shouldHaveCsSpecialization =
    expected.route === 'computer-science' && hasCsSpecializationSignal(fixture);
  const shouldHaveMathSpecialization =
    expected.route === 'math' && hasMathSpecializationSignal(fixture);

  return [
    makeCheck(
      'route-source-hint',
      '从 source 推断课程路线',
      true,
      `预期路线：${expected.label}；证据：${expected.evidence || 'source 内容'}。`,
      true,
    ),
    makeCheck(
      'route-fields-present',
      'slides 写入 courseRoute',
      missingCourseRoute === 0,
      missingCourseRoute
        ? `${missingCourseRoute} 个非封面页缺少 courseRoute。`
        : `路线分布：${routeCoverageSummary(slides)}。`,
    ),
    makeCheck(
      'route-matches-source',
      'courseRoute 匹配 source 科目',
      mismatchedExpectedRoute === 0,
      expected.route === 'general'
        ? `source 未强判科目路线，当前分布：${routeCoverageSummary(slides)}。`
        : mismatchedExpectedRoute
          ? `${mismatchedExpectedRoute} 个非封面页没有使用 ${expected.label} route。`
          : `非封面页均沿用 ${expected.label} route。`,
      expected.route === 'general',
    ),
    makeCheck(
      'route-prompts-carry-course-route',
      'htmlPrompt 写明课程路线',
      missingPromptRoute === 0,
      missingPromptRoute
        ? `${missingPromptRoute} 个非封面页 htmlPrompt 没有写“课程路线”。`
        : '非封面页 prompt 均携带课程路线。',
    ),
    makeCheck(
      'route-cs-subroutes',
      'CS 页写入 csRoute',
      missingCsRoute === 0,
      missingCsRoute ? `${missingCsRoute} 个 CS 页缺少 csRoute。` : `CS 页 ${csSlides.length} 个。`,
      csSlides.length === 0,
    ),
    makeCheck(
      'route-cs-specialized',
      'CS 强信号触发专属版式',
      !shouldHaveCsSpecialization || specializedCsSlides.length > 0,
      shouldHaveCsSpecialization
        ? specializedCsSlides.length
          ? `检测到 ${specializedCsSlides.length} 个 CS 专属版式页：${specializedCsSlides
              .map((slide) => `${slide.order}:${slide.csRoute}`)
              .join('，')}。`
          : 'source 有 OOP/代码/状态变化信号，但没有任何非 standard csRoute。'
        : '当前 source 不强制要求 CS 专属版式。',
      !shouldHaveCsSpecialization,
    ),
    makeCheck(
      'route-cs-prompts-carry-subroute',
      'CS prompt 写明 CS 版式',
      missingCsPromptRoute === 0,
      missingCsPromptRoute
        ? `${missingCsPromptRoute} 个 CS 页 prompt 没有写“CS 版式”。`
        : 'CS 页 prompt 均携带 CS 版式。',
      csSlides.length === 0,
    ),
    makeCheck(
      'route-math-subroutes',
      '数学页写入 mathRoute',
      missingMathRoute === 0,
      missingMathRoute
        ? `${missingMathRoute} 个数学页缺少 mathRoute。`
        : `数学页 ${mathSlides.length} 个。`,
      mathSlides.length === 0,
    ),
    makeCheck(
      'route-math-specialized',
      '数学强信号触发专属版式',
      !shouldHaveMathSpecialization || specializedMathSlides.length > 0,
      shouldHaveMathSpecialization
        ? specializedMathSlides.length
          ? `检测到 ${specializedMathSlides.length} 个数学专属版式页：${specializedMathSlides
              .map((slide) => `${slide.order}:${slide.mathRoute}`)
              .join('，')}。`
          : 'source 有证明/定理/公式/推导信号，但没有任何非 standard mathRoute。'
        : '当前 source 不强制要求数学专属版式。',
      !shouldHaveMathSpecialization,
    ),
    makeCheck(
      'route-math-prompts-carry-subroute',
      '数学 prompt 写明数学版式',
      missingMathPromptRoute === 0,
      missingMathPromptRoute
        ? `${missingMathPromptRoute} 个数学页 prompt 没有写“数学版式”。`
        : '数学页 prompt 均携带数学版式。',
      mathSlides.length === 0,
    ),
  ];
}

export function evaluateSourcePackage(
  fixture: TestfileFixture | null,
  tier: PageCountTier,
): PipelineCheck[] {
  if (!fixture) {
    return [makeCheck('source-loaded', '源材料已选择', false, '还没有选择 source fixture。')];
  }
  const pages = sourcePagesFromFixture(fixture);
  const sourceText = sourceTextFromFixture(fixture);
  const sourceTextLength = sourceText.length || fixture.sourceTextLength;
  const imageCount = fixture.sourcePackage?.sourceImages?.length || 0;
  const imageStats = fixture.sourcePackage?.imageStats;
  const rawImageCount = imageStats?.rawCount ?? imageCount;
  const filteredImageCount = imageStats
    ? imageStats.filteredSmallCount +
      imageStats.filteredLargeCount +
      imageStats.filteredLimitCount +
      (imageStats.dedupedCount || 0)
    : 0;
  const sourcePackagePageCount = fixture.sourcePackage?.pageCount || pages.length;
  const expectedPages = Math.min(sourcePackagePageCount, expectedSourcePagesForTier(tier));
  const weakSummaryCount = pages.filter((page) => page.summary.trim().length < 40).length;
  const warningCount = fixture.sourcePackage?.warnings?.length || 0;
  const mappedImageCount = Object.keys(fixture.sourcePackage?.imageMapping || {}).length;
  const sourceFiles = fixture.sourceFiles || [];
  return [
    makeCheck(
      'source-package',
      'sourcePackage 已构建',
      Boolean(fixture.sourcePackage),
      fixture.sourcePackage
        ? `parser=${fixture.sourcePackage.parser || 'fixture-builder'}，pageCount=${sourcePackagePageCount}。`
        : '当前只从 SceneOutline fallback，缺少完整 sourcePackage。',
    ),
    makeCheck(
      'source-pages',
      'sourcePages 数量足够',
      pages.length >= expectedPages,
      `当前读取 sourcePages=${pages.length}，原始段/页=${sourcePackagePageCount}，当前页数档位至少需要 ${expectedPages} 段。`,
    ),
    makeCheck(
      'source-page-coverage',
      'sourcePages 覆盖完整 source',
      pages.length >= sourcePackagePageCount,
      pages.length >= sourcePackagePageCount
        ? `sourcePages 已覆盖全部 ${sourcePackagePageCount} 段。`
        : `sourcePages 只覆盖 ${pages.length}/${sourcePackagePageCount} 段，source 不完整时不能进入 coursePlan。`,
    ),
    makeCheck(
      'source-text',
      '完整 sourceText 可用',
      sourceTextLength >= Math.max(800, fixture.sourceTextLength * 0.8),
      `sourceText=${sourceTextLength || 0} 字符，fixture.sourceTextLength=${fixture.sourceTextLength || 0}。`,
      sourceTextLength > 0,
    ),
    makeCheck(
      'source-page-summaries',
      '每个 sourcePage 有摘要',
      pages.length > 0 && weakSummaryCount === 0,
      weakSummaryCount
        ? `${weakSummaryCount} 个 sourcePage 摘要过短。`
        : `已检查 ${pages.length} 个 sourcePage 摘要。`,
    ),
    makeCheck(
      'notebook-source-files',
      'notebook 源文件已盘点',
      fixture.fileType !== 'notebook' ||
        (sourceFiles.length > 0 && sourceFiles.length >= (fixture.fileCount || 1)),
      fixture.fileType === 'notebook'
        ? `sourceFiles=${sourceFiles.length}，fileCount=${fixture.fileCount || 0}。`
        : '非 notebook fixture 不需要 sourceFiles。',
    ),
    makeCheck(
      'source-images',
      '图片素材已盘点',
      imageCount === 0 || mappedImageCount >= imageCount,
      fixture.fileType === 'notebook'
        ? `notebook sourceImages=${imageCount}/${rawImageCount} 可用，imageMapping=${mappedImageCount}，已过滤 ${filteredImageCount} 张。`
        : `sourceImages=${imageCount}/${rawImageCount} 可用，imageMapping=${mappedImageCount}，已过滤 ${filteredImageCount} 张。`,
      true,
    ),
    makeCheck(
      'source-warnings',
      '解析警告可见',
      warningCount === 0,
      warningCount ? `${warningCount} 条解析/截断 warning 已暴露。` : '没有解析 warning。',
      true,
    ),
  ];
}

export function evaluateCoursePlan(plan: LessonPlan | null | undefined): PipelineCheck[] {
  const coursePlan = plan?.coursePlan;
  if (!coursePlan) {
    return [
      makeCheck('course-plan-present', 'coursePlan 已生成', false, '规划响应缺少 coursePlan。'),
    ];
  }
  const spine = plan?.courseSpine;
  const spineActCount = Array.isArray(spine?.acts) ? spine.acts.length : 0;
  return [
    makeCheck(
      'course-goal',
      '课程目标具体',
      coursePlan.courseGoal.trim().length >= 24,
      `courseGoal：${coursePlan.courseGoal || '空'}`,
    ),
    makeCheck(
      'core-questions',
      '核心问题足够',
      coursePlan.coreQuestions.length >= 2 && coursePlan.coreQuestions.length <= 3,
      `coreQuestions 数量：${coursePlan.coreQuestions.length}，目标是 2-3 个。`,
    ),
    makeCheck(
      'course-plan-compact',
      'coursePlan 保持轻量',
      coursePlan.sourceDigest.length <= 3 &&
        coursePlan.prerequisiteAssumptions.length <= 3 &&
        coursePlan.narrativeArc.length <= 1 &&
        coursePlan.pacingStrategy.trim().length <= 180,
      `narrativeArc ${coursePlan.narrativeArc.length} 条，sourceDigest ${coursePlan.sourceDigest.length} 条，prerequisite ${coursePlan.prerequisiteAssumptions.length} 条，pacing ${coursePlan.pacingStrategy.length} 字；叙事推进应放在 courseSpine.acts，详细源材料取舍应下沉到 slideOutlines。`,
    ),
    makeCheck(
      'course-spine',
      '电影脚本主线已生成',
      Boolean(spine?.logline && spine.openingHook && spine.centralQuestion && spineActCount >= 3),
      spine
        ? `logline=${spine.logline || '空'}；acts=${spineActCount}；closingCallback=${spine.closingCallback || '空'}。`
        : '规划响应缺少 courseSpine。',
    ),
    makeCheck(
      'course-spine-callback',
      '总分总回扣明确',
      Boolean(spine?.openingHook && spine.closingCallback),
      spine
        ? `openingHook：${spine.openingHook || '空'}；closingCallback：${spine.closingCallback || '空'}。`
        : '缺少 courseSpine。',
    ),
  ];
}

export function evaluateSlideOutlines(plan: LessonPlan | null | undefined): PipelineCheck[] {
  const outlines = plan?.slideOutlines || [];
  const slides = plan?.slides || [];
  if (!plan) {
    return [makeCheck('slide-outlines-present', 'slideOutlines 已生成', false, '还没有 plan。')];
  }
  const nonCover = outlines.filter((outline) => outline.order !== 1);
  const missingQuestions = nonCover.filter((outline) => !outline.learnerQuestion?.trim()).length;
  const weakAnchors = nonCover.filter(
    (outline) => !(outline.sourceAnchors || []).some(isSpecificAnchor),
  ).length;
  const missingVisualPlan = outlines.filter((outline) => !outline.visualPlan?.trim()).length;
  const missingContinuity = outlines.filter(
    (outline) =>
      !outline.continuity?.fromPrevious ||
      !outline.continuity.pageMove ||
      !outline.continuity.toNext ||
      !outline.continuity.callbackToSpine,
  ).length;
  const hasIntro = slides.length >= 4 && slides[1]?.pageKind === 'intro';
  const hasSummary = slides.length >= 4 && slides[slides.length - 1]?.pageKind === 'summary';
  const hasCover = slides[0]?.pageKind === 'cover';
  return [
    makeCheck(
      'outline-count-match',
      'outline 与 slides 一一对应',
      outlines.length > 0 && outlines.length === slides.length,
      `slideOutlines=${outlines.length}，slides=${slides.length}。`,
    ),
    makeCheck(
      'learner-questions',
      '每页有学生问题',
      missingQuestions === 0,
      missingQuestions
        ? `${missingQuestions} 个正文页缺少 learnerQuestion。`
        : '正文页均有 learnerQuestion。',
    ),
    makeCheck(
      'cover-structure',
      '第 1 页是封面页',
      hasCover,
      `第 1 页 pageKind=${slides[0]?.pageKind || '缺'}。`,
    ),
    makeCheck(
      'intro-structure',
      '第 2 页是介绍页',
      hasIntro,
      `第 2 页 pageKind=${slides[1]?.pageKind || '缺'}。`,
    ),
    makeCheck(
      'summary-structure',
      '最后 1 页是总结页',
      hasSummary,
      `最后 1 页 pageKind=${slides[slides.length - 1]?.pageKind || '缺'}。`,
    ),
    makeCheck(
      'source-anchors',
      '每页绑定具体 sourceAnchors',
      weakAnchors === 0,
      weakAnchors
        ? `${weakAnchors} 个正文页缺少具体 source anchor。`
        : '正文页均有具体 source anchor。',
    ),
    makeCheck(
      'visual-plan',
      '每页有 visualPlan',
      missingVisualPlan === 0,
      missingVisualPlan ? `${missingVisualPlan} 页缺少 visualPlan。` : '每页均有 visualPlan。',
    ),
    makeCheck(
      'page-continuity',
      '每页有分镜承接',
      missingContinuity === 0,
      missingContinuity
        ? `${missingContinuity} 页缺少 continuity 分镜承接。`
        : '每页均有 fromPrevious / pageMove / toNext / callbackToSpine。',
    ),
  ];
}

export function evaluateHtmlPrompts(plan: LessonPlan | null | undefined): PipelineCheck[] {
  const slides = plan?.slides || [];
  if (!slides.length) {
    return [makeCheck('html-prompts-present', 'htmlPrompt 已生成', false, 'plan.slides 为空。')];
  }
  const shortPrompts = slides.filter((slide) => slide.htmlPrompt.trim().length < 220).length;
  const missingCanvas = slides.filter(
    (slide) => !/(1600|画布|canvasMode|16:9|长页面|中高课件页)/i.test(slide.htmlPrompt),
  ).length;
  const teachingSlides = slides.filter((slide) => slide.pageKind !== 'cover');
  const missingMandatory = teachingSlides.filter(
    (slide) => !(slide.mandatoryVisibleContent?.length || /必需|必须|保留/.test(slide.htmlPrompt)),
  ).length;
  const weakSourceUse = teachingSlides.filter(
    (slide) => !(slide.sourceUseRationale?.trim() || /源材料取舍|source/i.test(slide.htmlPrompt)),
  ).length;
  const weakContinuity = teachingSlides.filter(
    (slide) => !/(分镜|承接|回扣|courseSpine|continuity|整课主线)/i.test(slide.htmlPrompt),
  ).length;
  return [
    makeCheck(
      'prompt-count',
      '每页有 htmlPrompt',
      slides.every((slide) => Boolean(slide.htmlPrompt?.trim())),
      `slides 数量：${slides.length}。`,
    ),
    makeCheck(
      'prompt-length',
      'prompt 足够可执行',
      shortPrompts === 0,
      shortPrompts ? `${shortPrompts} 页 htmlPrompt 过短。` : '所有 htmlPrompt 都有足够约束。',
    ),
    makeCheck(
      'canvas-contract',
      '包含画布契约',
      missingCanvas === 0,
      missingCanvas
        ? `${missingCanvas} 页缺少 1600/画布/canvasMode 约束。`
        : '每页都包含画布约束。',
    ),
    makeCheck(
      'mandatory-content',
      '包含必需内容清单',
      missingMandatory === 0,
      missingMandatory ? `${missingMandatory} 页缺少必需内容约束。` : '每页都有必需内容约束。',
    ),
    makeCheck(
      'source-rationale',
      '保留源材料取舍理由',
      weakSourceUse === 0,
      weakSourceUse
        ? `${weakSourceUse} 个非封面页缺少源材料取舍说明。`
        : '非封面页都携带源材料取舍理由。',
    ),
    makeCheck(
      'continuity-prompt',
      '保留分镜承接约束',
      weakContinuity === 0,
      weakContinuity
        ? `${weakContinuity} 个非封面页缺少分镜承接/回扣约束。`
        : '非封面页都携带分镜承接和整课回扣约束。',
    ),
  ];
}

export function evaluateCoverPage(
  plan: LessonPlan | null | undefined,
  result: HtmlPageResult | null,
  error: HtmlPageError | null,
): PipelineCheck[] {
  const slides = plan?.slides || [];
  const plannedTrialSlide = getSinglePageTrialSlide(plan);
  const resultSlide = result ? slides.find((slide) => slide.id === result.slideId) : null;
  const trialSlide = resultSlide || plannedTrialSlide;
  if (!trialSlide) {
    return [
      makeCheck(
        'single-slide-present',
        '存在可试跑的正文页规划',
        false,
        'plan.slides 为空，无法选择非封面页。',
      ),
    ];
  }
  const trialPrompt = [
    trialSlide.htmlPrompt || '',
    plan ? buildStructuredSlideContext(trialSlide, plan) : '',
    buildDensityContract(trialSlide),
  ]
    .filter(Boolean)
    .join('\n');
  const visibleText = result ? visibleTextFromHtml(result.html) : '';
  const titleVisible =
    Boolean(result) &&
    normalizeSearchText(visibleText).includes(normalizeSearchText(trialSlide.title));
  const mandatoryContent = (trialSlide.mandatoryVisibleContent || []).filter(Boolean).slice(0, 4);
  const normalizedVisibleText = normalizeSearchText(visibleText);
  const visibleMandatoryCount = mandatoryContent.filter((item) => {
    const normalizedItem = normalizeSearchText(item);
    if (!normalizedItem) return false;
    if (
      normalizedVisibleText.includes(normalizedItem.slice(0, Math.min(40, normalizedItem.length)))
    ) {
      return true;
    }
    const fragments = normalizedItem
      .split(/[，。；：、,.!?！？;:\s]+/)
      .map((fragment) => fragment.trim())
      .filter((fragment) => fragment.length >= 3);
    if (!fragments.length) return false;
    const hitCount = fragments.filter((fragment) =>
      normalizedVisibleText.includes(fragment.slice(0, Math.min(18, fragment.length))),
    ).length;
    return hitCount >= Math.min(2, fragments.length);
  }).length;
  const requiredMandatoryCount = Math.min(2, mandatoryContent.length);
  const hasMandatoryContent =
    mandatoryContent.length === 0 || visibleMandatoryCount >= requiredMandatoryCount;
  const promptHasConcreteContent =
    /mandatoryVisibleContent|sourceAnchors|learnerQuestion|visualPlan|必须可见|源材料|证据|代码|图|表|流程|内存|接口|继承/i.test(
      trialPrompt,
    );
  const textBudget = trialSlide.canvasMode === 'long' ? 2200 : 1400;
  const textIsReasonable =
    Boolean(result) && visibleText.length >= 40 && visibleText.length <= textBudget;
  const hasExternalAsset = Boolean(result) && hasExternalCoverAsset(result?.html ?? '');
  const hasForbiddenCoverText = Boolean(result) && hasForbiddenCoverVisibleText(visibleText);
  return [
    makeCheck(
      'single-non-cover-selected',
      '选择非封面正文页',
      trialSlide.pageKind !== 'cover',
      `当前试跑第 ${trialSlide.order} 页，pageKind=${trialSlide.pageKind || '缺'}，title=${trialSlide.title || '缺'}。`,
    ),
    makeCheck(
      'single-html-generated',
      '单页 HTML 已生成',
      Boolean(result) && !error,
      error ? error.message : result ? '单页 HTML 已生成。' : '还没有生成单页 HTML。',
    ),
    makeCheck(
      'single-html-target',
      '生成结果对应当前正文页',
      Boolean(result) && result?.slideId === trialSlide.id && trialSlide.pageKind !== 'cover',
      result
        ? `生成结果 slideId=${result.slideId}，当前试跑 slideId=${trialSlide.id}。`
        : '还没有生成单页 HTML。',
      !result,
    ),
    makeCheck(
      'single-prompt-concrete',
      '正文页 prompt 带具体教学内容',
      promptHasConcreteContent,
      promptHasConcreteContent
        ? 'prompt 包含 sourceAnchors / learnerQuestion / visualPlan / mandatoryVisibleContent 等正文页约束。'
        : 'prompt 缺少具体教学内容约束。',
    ),
    makeCheck(
      'single-title-visible',
      '正文页标题可见',
      titleVisible,
      titleVisible
        ? `生成结果包含第 ${trialSlide.order} 页标题。`
        : `生成结果中没有检测到第 ${trialSlide.order} 页标题。`,
      !result,
    ),
    makeCheck(
      'single-mandatory-visible',
      '正文页关键内容可见',
      hasMandatoryContent,
      mandatoryContent.length
        ? `检测到 ${visibleMandatoryCount}/${mandatoryContent.length} 条 mandatoryVisibleContent。`
        : '当前页没有 mandatoryVisibleContent，跳过精确文本匹配。',
      !result,
    ),
    makeCheck(
      'single-text-budget',
      '正文页文字量合理',
      textIsReasonable,
      result
        ? `可见文本约 ${visibleText.length} 字；预算上限 ${textBudget} 字。`
        : '还没有单页 HTML 可检测。',
      !result,
    ),
    makeCheck(
      'single-no-placeholder-text',
      '不显示占位词',
      !hasForbiddenCoverText,
      hasForbiddenCoverText
        ? '可见文字里出现了 notebook 封面 / 封面页 / cover / 主视觉 / 背景等占位说明。'
        : '没有检测到占位说明文字。',
      !result,
    ),
    makeCheck(
      'single-no-external-asset',
      '不依赖外链背景',
      !hasExternalAsset,
      hasExternalAsset ? '单页 HTML 使用了外链资源。' : '没有检测到 http(s) 外链背景/图片。',
      !result,
    ),
  ];
}

export function evaluateHtmlPages(
  plan: LessonPlan | null | undefined,
  pages: Record<string, HtmlPageResult>,
  errors: Record<string, HtmlPageError>,
): PipelineCheck[] {
  const slides = plan?.slides || [];
  if (!slides.length) {
    return [makeCheck('html-pages-plan', '有可生成的 slides', false, 'plan.slides 为空。')];
  }
  const generatedCount = slides.filter((slide) => pages[slide.id]).length;
  const errorCount = slides.filter((slide) => errors[slide.id]).length;
  const shortHtmlCount = slides.filter((slide) => {
    const page = pages[slide.id];
    return page && page.htmlLength < 900;
  }).length;
  const lowElementCount = slides.filter((slide) => {
    const page = pages[slide.id];
    return page && page.elementCount < 12;
  }).length;
  return [
    makeCheck(
      'html-page-count',
      '整本 HTML 已生成',
      generatedCount === slides.length,
      `已生成 ${generatedCount}/${slides.length} 页 HTML。`,
    ),
    makeCheck(
      'html-page-errors',
      '没有页面生成错误',
      errorCount === 0,
      errorCount ? `${errorCount} 页生成失败。` : '没有页面生成错误。',
    ),
    makeCheck(
      'html-page-length',
      'HTML 内容非空且足够',
      generatedCount > 0 && shortHtmlCount === 0,
      shortHtmlCount ? `${shortHtmlCount} 页 HTML 过短。` : '已生成页面 HTML 长度正常。',
      generatedCount > 0,
    ),
    makeCheck(
      'html-page-structure',
      'DOM 结构有基本复杂度',
      generatedCount > 0 && lowElementCount === 0,
      lowElementCount ? `${lowElementCount} 页 DOM 元素过少。` : '已生成页面 DOM 结构正常。',
      generatedCount > 0,
    ),
  ];
}

export function evaluateLectureActions(
  plan: LessonPlan | null | undefined,
  pages: Record<string, HtmlPageResult>,
  results: Record<string, LecturePageResult>,
): PipelineCheck[] {
  const slides = plan?.slides || [];
  if (!slides.length) {
    return [
      makeCheck('lecture-plan-present', '有可生成讲解的 slides', false, 'plan.slides 为空。'),
    ];
  }
  const generatedSlides = slides.filter((slide) => pages[slide.id]);
  const resultCount = generatedSlides.filter((slide) => results[slide.id]).length;
  const missingCount = generatedSlides.length - resultCount;
  const pagesWithoutTargets = generatedSlides.filter(
    (slide) => (results[slide.id]?.targets.length || 0) === 0,
  ).length;
  const pagesWithoutSpeech = generatedSlides.filter(
    (slide) => !(results[slide.id]?.actions || []).some((action) => action.type === 'speech'),
  ).length;
  const teachingPagesWithoutFocus = generatedSlides.filter((slide) => {
    const result = results[slide.id];
    if (!result || slide.pageKind === 'cover') return false;
    return !result.actions.some(
      (action) => (action.type === 'spotlight' || action.type === 'laser') && action.targetId,
    );
  }).length;
  const weakScripts = generatedSlides.filter((slide) => {
    const result = results[slide.id];
    return result && result.pageKind !== 'cover' && result.scriptText.trim().length < 90;
  }).length;
  const totalActions = Object.values(results).reduce(
    (sum, result) => sum + result.actions.length,
    0,
  );
  return [
    makeCheck(
      'lecture-html-source-ready',
      '基于真实 HTML 页生成讲解',
      generatedSlides.length > 0,
      `可用 HTML 页 ${generatedSlides.length}/${slides.length}。`,
    ),
    makeCheck(
      'lecture-actions-complete',
      '每个已生成 HTML 页都有讲解稿',
      generatedSlides.length > 0 && missingCount === 0,
      missingCount
        ? `${missingCount} 个 HTML 页还没有讲解稿与动作。`
        : `已生成 ${resultCount} 页讲解稿，共 ${totalActions} 个 action。`,
    ),
    makeCheck(
      'lecture-targets-present',
      '每页有可定位讲解目标',
      resultCount > 0 && pagesWithoutTargets === 0,
      pagesWithoutTargets
        ? `${pagesWithoutTargets} 页没有从 DOM 中解析到 target。`
        : '每页都解析出了可 spotlight/laser 的 DOM target。',
    ),
    makeCheck(
      'lecture-speech-present',
      '每页有讲解稿 speech',
      resultCount > 0 && pagesWithoutSpeech === 0,
      pagesWithoutSpeech
        ? `${pagesWithoutSpeech} 页缺少 speech action。`
        : '每页都有 speech action。',
    ),
    makeCheck(
      'lecture-focus-present',
      '正文页有聚焦动作',
      resultCount > 0 && teachingPagesWithoutFocus === 0,
      teachingPagesWithoutFocus
        ? `${teachingPagesWithoutFocus} 个正文页没有 spotlight/laser。`
        : '正文页均有 spotlight 或 laser 聚焦动作。',
    ),
    makeCheck(
      'lecture-script-substantial',
      '讲解稿不是空话',
      resultCount > 0 && weakScripts === 0,
      weakScripts ? `${weakScripts} 页讲解稿过短。` : '正文页讲解稿长度满足最低检查。',
    ),
  ];
}

export function evaluateLecturePositioning(
  plan: LessonPlan | null | undefined,
  results: Record<string, LecturePageResult>,
): PipelineCheck[] {
  const slides = plan?.slides || [];
  const teachingSlides = slides.filter((slide) => slide.pageKind !== 'cover');
  if (!teachingSlides.length) {
    return [
      makeCheck(
        'lecture-position-plan-present',
        '有可定位的正文页',
        false,
        slides.length ? '没有非封面正文页可做遮罩定位。' : 'plan.slides 为空。',
      ),
    ];
  }
  const teachingSlideIds = new Set(teachingSlides.map((slide) => slide.id));
  const resultValues = Object.values(results).filter(
    (result) => result.pageKind !== 'cover' && teachingSlideIds.has(result.slideId),
  );
  const focusActions = resultValues.flatMap((result) =>
    result.actions
      .filter(
        (action) => action.targetId && (action.type === 'spotlight' || action.type === 'laser'),
      )
      .map((action) => ({ result, action })),
  );
  const unresolvedFocusActions = focusActions.filter(
    ({ result, action }) => !result.targets.some((target) => target.id === action.targetId),
  ).length;
  const invalidRects = resultValues.flatMap((result) =>
    result.targets.filter((target) => {
      const rect = target.rect;
      return (
        rect.width <= 0 ||
        rect.height <= 0 ||
        rect.x < 0 ||
        rect.y < 0 ||
        rect.x + rect.width > result.canvasWidth + 1 ||
        rect.y + rect.height > result.canvasHeight + 1
      );
    }),
  ).length;
  const tooSmallTargets = resultValues.flatMap((result) =>
    result.targets.filter((target) => target.rect.width < 50 || target.rect.height < 18),
  ).length;
  const warningCount = resultValues.reduce((sum, result) => sum + result.warnings.length, 0);
  return [
    makeCheck(
      'lecture-position-results-present',
      '正文页遮罩定位输入存在',
      resultValues.length > 0,
      `已有 ${resultValues.length}/${teachingSlides.length} 个正文页讲解定位结果，封面不参与遮罩验收。`,
    ),
    makeCheck(
      'lecture-focus-targets-resolve',
      'focus action 都能解析 target',
      focusActions.length > 0 && unresolvedFocusActions === 0,
      unresolvedFocusActions
        ? `${unresolvedFocusActions} 个 spotlight/laser targetId 找不到对应 target。`
        : `已检查 ${focusActions.length} 个 spotlight/laser target。`,
    ),
    makeCheck(
      'lecture-target-rects-valid',
      'target rect 在画布内',
      resultValues.length > 0 && invalidRects === 0,
      invalidRects
        ? `${invalidRects} 个 target rect 越界或尺寸无效。`
        : '所有 target rect 都在 HTML 画布范围内。',
    ),
    makeCheck(
      'lecture-target-size',
      'target 尺寸可被遮罩看见',
      resultValues.length > 0 && tooSmallTargets === 0,
      tooSmallTargets
        ? `${tooSmallTargets} 个 target 尺寸过小，遮罩可能看不清。`
        : '所有 target 都达到最低可视尺寸。',
      tooSmallTargets > 0,
    ),
    makeCheck(
      'lecture-position-warnings-visible',
      '定位 warning 可见',
      warningCount === 0,
      warningCount ? `${warningCount} 条讲解定位 warning 已暴露。` : '没有讲解定位 warning。',
      true,
    ),
  ];
}
