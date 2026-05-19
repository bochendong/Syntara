import {
  buildHtmlSlideDensityContract,
  buildHtmlSlidePromptFromPlan,
  buildHtmlSlideStructuredContext,
} from '@/features/ppt-generation/html-slide-contracts';
import { pageKindLabel } from './format';
import {
  courseRoutePromptLabel,
  csRoutePromptLabel,
  inferHtmlCourseRouteFromText,
  inferHtmlCsRouteFromText,
  inferHtmlMathRouteFromText,
  inferHtmlPageKind,
  mathRoutePromptLabel,
} from './routes';
import {
  HTML_LESSON_MODEL,
  RESULT_RENDER_VERSION,
  type HtmlSlideResult,
  type LessonPlan,
  type LessonSlidePlan,
  type PageCountTier,
  type SourcePackageImage,
  type TestfileFixture,
} from './types';

export function buildPlanKey(fixtureId: string, tier: PageCountTier): string {
  return `${RESULT_RENDER_VERSION}:${HTML_LESSON_MODEL}:${fixtureId}:${tier}`;
}

export function buildPlanSignature(result: {
  fixtureId: string;
  pageCountTier: PageCountTier;
  plan: LessonPlan;
}): string {
  return [
    RESULT_RENDER_VERSION,
    HTML_LESSON_MODEL,
    result.fixtureId,
    result.pageCountTier,
    result.plan.lessonTitle,
    result.plan.pageCount,
    result.plan.coursePlan?.courseGoal || '',
    (result.plan.coursePlan?.narrativeArc || []).join('|'),
    (result.plan.coursePlan?.coreQuestions || []).join('|'),
    ...(result.plan.slideOutlines || []).map((outline) =>
      [
        outline.id,
        outline.title,
        outline.learnerQuestion,
        outline.teachingObjective,
        outline.visualPlan,
        (outline.sourceAnchors || []).join('|'),
        (outline.mandatoryVisibleContent || []).join('|'),
      ].join('/'),
    ),
    ...result.plan.slides.map((slide) =>
      [
        slide.id,
        slide.order,
        slide.title,
        slide.pageKind,
        slide.courseRoute || '',
        slide.csRoute || '',
        slide.mathRoute || '',
        slide.density,
        slide.learnerQuestion || '',
        (slide.keyPoints || []).join('|'),
        (slide.mandatoryVisibleContent || []).join('|'),
        slide.sourceUseRationale || '',
        slide.visualPlan || '',
        slide.htmlPrompt,
      ].join('/'),
    ),
  ].join('::');
}

export function buildSlideKey(planSignature: string, slideId: string): string {
  return `${planSignature}:${slideId}`;
}

export function sourcePagesFromFixture(fixture: TestfileFixture) {
  if (fixture.sourcePackage?.sourcePages?.length) {
    return fixture.sourcePackage.sourcePages;
  }
  return fixture.outlines.map((outline, index) => ({
    sourceIndex: index + 1,
    title: outline.title,
    summary: outline.description,
    keyPoints: outline.keyPoints || [],
    concreteAnchor: outline.teachingPagePlan?.concreteAnchor || outline.description,
    suggestedPageKind: pageKindLabel(inferHtmlPageKind(outline, index)),
  }));
}

export function sourceImageKb(image: SourcePackageImage): number {
  if (typeof image.byteLength === 'number') return Math.round(image.byteLength / 1024);
  const base64 = image.src.match(/^data:[^;]+;base64,(.+)$/)?.[1];
  if (base64) return Math.round(Math.ceil((base64.length * 3) / 4) / 1024);
  return Math.round(image.src.length / 1024);
}

export function sourceImageLabel(image: SourcePackageImage): string {
  const size =
    image.width && image.height ? ` · ${Math.round(image.width)}×${Math.round(image.height)}` : '';
  return `${image.id} · 第 ${image.pageNumber} 页${size} · ${sourceImageKb(image)} KB`;
}

export function getAssignedSourceImages(
  fixture: TestfileFixture | null | undefined,
  slide: LessonSlidePlan,
): SourcePackageImage[] {
  const ids = slide.sourceImageIds || [];
  if (!ids.length || !fixture?.sourcePackage?.sourceImages?.length) return [];
  const idSet = new Set(ids);
  return fixture.sourcePackage.sourceImages.filter((image) => idSet.has(image.id)).slice(0, 4);
}

export function shouldUseGeneratedIllustration(slide: LessonSlidePlan): boolean {
  if (slide.sourceImageIds?.length) return false;
  if (slide.courseRoute === 'math' || slide.mathRoute) return false;
  if (slide.pageKind === 'cover' || slide.pageKind === 'intro') return true;
  if (slide.pageKind === 'code' || slide.pageKind === 'table' || slide.density === 'dense') {
    return false;
  }
  const text = [slide.title, slide.objective, slide.htmlPrompt].join('\n');
  if (/不要图片|不需要图片|不用图片|不要插图|纯文本|no image/i.test(text)) return false;
  return /插图|图示|示意|视觉|直观|生活情境|场景|概念图|导入|开场|motivation|visual/i.test(text);
}

export function buildSlideIllustrationPrompt(slide: LessonSlidePlan, lessonTitle: string): string {
  const common = [
    'Create one standalone inset illustration asset for a Chinese educational PowerPoint slide.',
    'The image is not a presentation page, not a slide background, not a UI screenshot, and not an infographic.',
    'Style: clean premium educational illustration, white and light blue background, blue and emerald accents, calm classroom visual language.',
    'Composition: one coherent object/scene only, centered, with generous clean negative space.',
    'Hard constraints: no readable text, no letters, no words, no numbers, no formulas, no labels, no axis labels, no watermark, no logo.',
  ];

  if (slide.pageKind === 'cover') {
    return [
      ...common,
      `Lesson: ${lessonTitle}.`,
      `Cover title: ${slide.title}.`,
      `Teaching objective: ${slide.objective}.`,
      'Create a compact notebook cover illustration that can sit inside a reserved 4:3 figure area.',
      'Do not draw a full 16:9 page. Do not include cards, panels, title text, captions, bullet lists, code, or math notation.',
      `Context only, do not render as text: ${slide.htmlPrompt.slice(0, 480)}`,
    ].join('\n');
  }

  if (slide.pageKind === 'intro') {
    return [
      ...common,
      `Lesson: ${lessonTitle}.`,
      `Slide title: ${slide.title}.`,
      `Teaching objective: ${slide.objective}.`,
      'Create a small conceptual teaching illustration that can sit inside a reserved 4:3 figure area on the slide.',
      'Do not draw a full 16:9 page. Do not include cards, panels, title text, captions, or bullet lists.',
      `Context only, do not render as text: ${slide.htmlPrompt.slice(0, 480)}`,
    ].join('\n');
  }

  return [
    ...common,
    `Lesson: ${lessonTitle}.`,
    `Slide title: ${slide.title}.`,
    `Page type: ${pageKindLabel(slide.pageKind)}.`,
    `Teaching objective: ${slide.objective}.`,
    'Create a compact concept illustration that supports the slide without replacing editable HTML text.',
    'Do not include any source text, code, math notation, table, or final answer in the image.',
    `Context only, do not render as text: ${slide.htmlPrompt.slice(0, 480)}`,
  ].join('\n');
}

export function buildDensityContract(slide: LessonSlidePlan): string {
  return buildHtmlSlideDensityContract(slide);
}

export function buildStructuredSlideContext(slide: LessonSlidePlan, plan: LessonPlan): string {
  return buildHtmlSlideStructuredContext(slide, plan);
}

export function buildActualHtmlPromptPreview(slide: LessonSlidePlan, plan: LessonPlan): string {
  const routeText = [
    plan.lessonTitle,
    slide.title,
    slide.objective,
    slide.htmlPrompt,
    ...slide.sourceCoverage,
    ...(slide.sourceAnchors || []),
    ...(slide.sourceImageIds || []),
    slide.sourceUseRationale || '',
  ].join('\n');
  const courseRoute = slide.courseRoute || inferHtmlCourseRouteFromText(routeText, slide.pageKind);
  const csRoute =
    courseRoute === 'computer-science'
      ? slide.csRoute || inferHtmlCsRouteFromText(routeText)
      : undefined;
  const mathRoute =
    courseRoute === 'math'
      ? slide.mathRoute || inferHtmlMathRouteFromText(routeText, slide.pageKind)
      : undefined;
  const routeInstruction = [
    `课程路线：${courseRoutePromptLabel(courseRoute)}`,
    csRoute ? `CS 版式：${csRoutePromptLabel(csRoute)}` : '',
    mathRoute ? `数学版式：${mathRoutePromptLabel(mathRoute)}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return buildHtmlSlidePromptFromPlan(slide, plan, { routeInstruction });
}

export function buildActualHtmlRequestPreview(args: {
  slide: LessonSlidePlan;
  plan: LessonPlan;
  htmlResult?: HtmlSlideResult | null;
  assignedSourceImages: SourcePackageImage[];
}): string {
  const prompt = args.htmlResult?.prompt || buildActualHtmlPromptPreview(args.slide, args.plan);
  const sourceImageSummary = args.assignedSourceImages.length
    ? args.assignedSourceImages.map((image) => sourceImageLabel(image)).join('\n')
    : '无';
  return [
    'prompt 字段：',
    prompt,
    '',
    'densityContract 字段：',
    buildDensityContract(args.slide),
    '',
    'assignedSourceImages：',
    sourceImageSummary,
  ].join('\n');
}
