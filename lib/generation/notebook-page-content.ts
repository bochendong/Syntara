import { nanoid } from 'nanoid';
import { isCountedTeachingOutline } from '@/lib/create/outline-preferences';
import {
  IMAGE_NOTEBOOK_CANVAS_HEIGHT,
  IMAGE_NOTEBOOK_CANVAS_WIDTH,
  formatImageNotebookDensityPolicyForPrompt,
  formatImageNotebookBriefForPrompt,
  resolveImageNotebookDensityPolicyForPageCount,
  type ImageNotebookFocusRegion,
  type ImageNotebookQaResult,
} from '@/lib/generation/image-notebook-quality';
import { buildImageNotebookPromptPlan } from '@/lib/generation/image-notebook-prompt-plan';
import { isTitleCoverOutline } from '@/lib/generation/title-cover';
import type {
  SceneActionContinuityContext,
  SceneActionCourseSpineContext,
  SceneActionFocusPlanItem,
  SceneActionNarrationPolicy,
} from '@/lib/generation/pipeline-types';
import type { ImageGenerationResult } from '@/lib/media/types';
import type { ImageMapping, PdfImage, SceneOutline } from '@/lib/types/generation';
import type { PPTElement, SlideBackground, SlideTheme } from '@/lib/types/slides';
import type { Stage } from '@/lib/types/stage';

export const NOTEBOOK_IMAGE2_PROVIDER_ID = 'openai-image';
export const NOTEBOOK_IMAGE2_MODEL_ID = 'gpt-image-2';

const IMAGE_FIRST_NOTEBOOK_STYLE_SPEC = [
  'Visual style baseline:',
  '- Follow the selected drawing / illustration style first. The style may be notebook handwriting, cartoon illustration, minimalist line art, watercolor, or another user-specified art direction.',
  '- Make this look like a finished educational illustration or illustrated notebook page for students, not a teacher handout, lesson plan, or frontend template.',
  '- Use a full-bleed 16:9 canvas whose background, paper texture, board surface, or illustration treatment touches all four image edges.',
  '- Do not draw a centered paper/card/slide inside a larger canvas. No pillarboxing, letterboxing, white side bars, or outer frame.',
  '- Keep normal classroom padding for content, but never leave blank vertical columns on the left or right edges.',
  '- Use visual treatment consistent with the chosen art direction for titles, diagrams, highlights, characters, objects, and annotations.',
  '- The page should feel like one clear learning idea captured as a single bitmap image.',
  '- Keep a consistent course notebook feel: friendly, careful, readable, sparse, and projector-safe.',
  '- Use student-facing phrasing such as "我们先看", "你会先判断什么", "下一步怎么来"; avoid teacher-planning phrasing.',
  '- Never write visible meta labels like "让学生看到", "教学目标", "本页主线", "可迁移动作", "Teacher move", "Page role", or "QA checklist".',
  '- Avoid flat vector UI cards, generic corporate slide templates, stock-photo layouts, glossy gradients, browser chrome, app UI, and placeholder blocks.',
  '- Do not make an HTML/CSS-looking dashboard; do not put UI panels inside other panels.',
  '- Keep all formulas, code, and labels large enough to read at thumbnail size. Prefer 2-3 clear teaching regions over dense handout notes.',
].join('\n');

const GENERATED_FOCUS_PATH = 'M 0 0 L 200 0 L 200 200 L 0 200 Z';

export type SourceImageAsset = {
  id: string;
  src?: string;
  pageNumber?: number;
  description?: string;
  width?: number;
  height?: number;
};

export type NotebookPageActionContextSeed = {
  courseSpine?: SceneActionCourseSpineContext;
  continuity?: SceneActionContinuityContext;
  focusPlan?: SceneActionFocusPlanItem[];
  narrationPolicy?: SceneActionNarrationPolicy;
};

export function sourceImagesFromMedia(args: {
  pdfImages?: PdfImage[];
  imageMapping?: ImageMapping;
}): SourceImageAsset[] {
  return (args.pdfImages || [])
    .map((image) => ({
      id: image.id,
      src: image.src || args.imageMapping?.[image.id],
      pageNumber: image.pageNumber,
      description: image.description,
      width: image.width,
      height: image.height,
    }))
    .filter((image) => Boolean(image.id && image.src));
}

export function imageResultToUrl(result: ImageGenerationResult | undefined): string {
  if (!result) return '';
  if (result.base64) {
    return result.base64.startsWith('data:')
      ? result.base64
      : `data:image/png;base64,${result.base64}`;
  }
  return result.url || '';
}

export function qaFindingsText(qa: ImageNotebookQaResult): string {
  const findings = [...qa.findings, ...qa.mathFindings, ...qa.visualFindings];
  return findings
    .map((finding) => `${finding.severity}/${finding.category}: ${finding.message}`)
    .join('\n');
}

function compactLine(value: string | undefined, maxLength = 240): string {
  const text = (value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function outlineHaystack(outline: SceneOutline, stage?: Stage): string {
  return [
    stage?.name,
    stage?.description,
    outline.title,
    outline.description,
    outline.teachingObjective,
    outline.studentThinkingMove,
    outline.teachingPagePlan?.role,
    outline.teachingPagePlan?.layoutFamily,
    outline.teachingPagePlan?.layoutTemplate,
    outline.workedExampleConfig?.kind,
    outline.workedExampleConfig?.codeSnippet,
    ...(outline.keyPoints || []),
  ]
    .filter(Boolean)
    .join(' ');
}

function isCodeLikeOutline(outline: SceneOutline, stage?: Stage): boolean {
  return /computer|program|code|racket|scheme|function|algorithm|recursion|tree|stack|queue|HTDF|HTDD|代码|函数|程序|递归|算法|数据结构/i.test(
    outlineHaystack(outline, stage),
  );
}

function isMathLikeOutline(outline: SceneOutline, stage?: Stage): boolean {
  return /math|calculus|integral|derivative|proof|formula|theorem|matrix|algebra|set|logic|函数|积分|导数|证明|公式|定理|集合|逻辑|矩阵/i.test(
    outlineHaystack(outline, stage),
  );
}

function generatedFocusShape(args: {
  id: string;
  label: string;
  left: number;
  top: number;
  width: number;
  height: number;
}): PPTElement {
  return {
    id: args.id,
    name: `lecture-focus-generated: ${args.label}`,
    type: 'shape',
    left: args.left,
    top: args.top,
    width: args.width,
    height: args.height,
    rotate: 0,
    lock: true,
    viewBox: [200, 200],
    path: GENERATED_FOCUS_PATH,
    fixedRatio: false,
    fill: '#ffffff',
    opacity: 0,
    outline: { color: '#ffffff', width: 0, style: 'solid' },
  };
}

function focusRegionToShape(region: ImageNotebookFocusRegion): PPTElement {
  return generatedFocusShape({
    id: region.id,
    label: region.label,
    left: region.left,
    top: region.top,
    width: region.width,
    height: region.height,
  });
}

function generatedImageFocusElements(outline: SceneOutline, stage?: Stage): PPTElement[] {
  if (outline.imageNotebookBrief?.focusRegions?.length) {
    return outline.imageNotebookBrief.focusRegions
      .slice()
      .sort((a, b) => a.order - b.order)
      .slice(0, 6)
      .map(focusRegionToShape);
  }

  const page = String(outline.order || 1).padStart(2, '0');
  const prefix = `${outline.id || 'scene'}-s${page}-lecture-focus-generated`;
  const title = generatedFocusShape({
    id: `${prefix}-title`,
    label: '页面标题与入口问题',
    left: 40,
    top: 24,
    width: 920,
    height: 72,
  });
  const takeaway = generatedFocusShape({
    id: `${prefix}-takeaway`,
    label: '本页收束与转场',
    left: 60,
    top: 488,
    width: 880,
    height: 52,
  });

  if (isCodeLikeOutline(outline, stage)) {
    return [
      title,
      generatedFocusShape({
        id: `${prefix}-code-entry`,
        label: '代码入口、签名或数据定义',
        left: 500,
        top: 118,
        width: 430,
        height: 96,
      }),
      generatedFocusShape({
        id: `${prefix}-code-body`,
        label: '分支、条件或模板结构',
        left: 500,
        top: 225,
        width: 430,
        height: 126,
      }),
      generatedFocusShape({
        id: `${prefix}-code-return`,
        label: '递归调用、helper 调用或返回值',
        left: 500,
        top: 365,
        width: 430,
        height: 92,
      }),
      generatedFocusShape({
        id: `${prefix}-concept-board`,
        label: '左侧概念、例子或执行状态',
        left: 60,
        top: 128,
        width: 400,
        height: 320,
      }),
      takeaway,
    ];
  }

  if (isMathLikeOutline(outline, stage)) {
    return [
      title,
      generatedFocusShape({
        id: `${prefix}-problem-or-definition`,
        label: '定义、题目或已知条件',
        left: 60,
        top: 118,
        width: 880,
        height: 112,
      }),
      generatedFocusShape({
        id: `${prefix}-formula-main`,
        label: '主公式、图像或关键表达式',
        left: 80,
        top: 245,
        width: 840,
        height: 128,
      }),
      generatedFocusShape({
        id: `${prefix}-method-check`,
        label: '推导步骤、判断方法或易错检查',
        left: 80,
        top: 388,
        width: 840,
        height: 76,
      }),
      takeaway,
    ];
  }

  return [
    title,
    generatedFocusShape({
      id: `${prefix}-main-anchor`,
      label: '主概念或核心问题',
      left: 60,
      top: 122,
      width: 880,
      height: 132,
    }),
    generatedFocusShape({
      id: `${prefix}-supporting-evidence`,
      label: '例子、图示或证据区',
      left: 70,
      top: 275,
      width: 860,
      height: 172,
    }),
    takeaway,
  ];
}

function stripElementText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function elementsFromGeneratedContent(content: unknown): PPTElement[] {
  const record =
    content && typeof content === 'object' && !Array.isArray(content)
      ? (content as { elements?: unknown })
      : {};
  if (!Array.isArray(record.elements)) return [];
  return record.elements.filter((item): item is PPTElement =>
    Boolean(item && typeof item === 'object' && !Array.isArray(item) && 'id' in item),
  );
}

function focusLabelForElement(element: PPTElement): string {
  const record = element as PPTElement & { label?: unknown; text?: { content?: unknown } };
  const name = typeof element.name === 'string' ? element.name : '';
  const label = typeof record.label === 'string' ? record.label : '';
  const text =
    element.type === 'text'
      ? stripElementText(element.content)
      : stripElementText(record.text?.content);
  return compactLine(
    label ||
      name.replace(/^lecture-focus-generated:\s*/, '').replace(/^semantic-hit-map:\s*/, '') ||
      text ||
      element.id,
    96,
  );
}

function focusRoleForElement(element: PPTElement, label: string): string {
  const haystack = `${element.id} ${element.name || ''} ${label}`;
  if (/title|标题|入口/.test(haystack)) return 'opening';
  if (/code-entry|signature|purpose|data definition|签名|数据定义|入口/.test(haystack)) {
    return 'code-entry';
  }
  if (/code-body|branch|case|condition|template|分支|条件|模板/.test(haystack)) {
    return 'code-structure';
  }
  if (/recursive|return|helper|递归|返回/.test(haystack)) return 'code-result';
  if (/formula|equation|表达式|公式/.test(haystack)) return 'formula';
  if (/problem|definition|given|题目|定义|已知/.test(haystack)) return 'setup';
  if (/method|check|takeaway|summary|转场|收束|检查|方法/.test(haystack)) return 'takeaway';
  if (/visual|diagram|example|图|例子|证据/.test(haystack)) return 'example-or-visual';
  return element.type;
}

function isPreferredFocusElement(element: PPTElement): boolean {
  const name = element.name || '';
  if (/lecture-focus-generated|semantic-hit-map/i.test(`${element.id} ${name}`)) return true;
  if (element.type === 'latex' || element.type === 'table') return true;
  if (element.type === 'text') {
    const text = stripElementText(element.content);
    return text.length >= 8 && text.length <= 320;
  }
  return false;
}

function buildFocusPlanFromContent(content: unknown): SceneActionFocusPlanItem[] {
  const elements = elementsFromGeneratedContent(content);
  const preferred = elements.filter(isPreferredFocusElement);
  const targets = (
    preferred.length ? preferred : elements.filter((element) => element.type !== 'image')
  ).slice(0, 10);
  return targets.map((element, index) => {
    const label = focusLabelForElement(element);
    return {
      targetId: element.id,
      label,
      role: focusRoleForElement(element, label),
      order: index + 1,
    };
  });
}

function buildNarrationPolicy(outline: SceneOutline, stage?: Stage): SceneActionNarrationPolicy {
  const isCover = isTitleCoverOutline(outline);
  const isImageNotebookTeachingPage = Boolean(outline.imageNotebookBrief && !isCover);
  const minSpeechSegments = isCover
    ? 3
    : isImageNotebookTeachingPage ||
        isCodeLikeOutline(outline, stage) ||
        isMathLikeOutline(outline, stage)
      ? 8
      : 6;
  return {
    minSpeechSegments,
    preferredSpeechSegments: isCover
      ? '封面只建立主题、主问题和进入下一页的期待。'
      : isImageNotebookTeachingPage
        ? '整页图片课件要像老师带着看板书：先聚焦区域，再讲观察、原因、停顿、迁移和下一页过渡；正文页通常 8-16 段。'
        : isCodeLikeOutline(outline, stage)
          ? '代码页要按设计动作慢讲，通常 8-12 段；每段只讲一个签名、例子、模板、分支、递归或返回值判断。'
          : isMathLikeOutline(outline, stage)
            ? '数学页要按题目/定义、关键表达式、每一步依据、最后检查慢讲，通常 8-12 段。'
            : '正文页通常 6-9 段；每段只推进一个观察、例子、比较或收束动作。',
    maxConsecutiveSpeechWithoutFocus: 3,
    requireFocusBeforeSpeech: true,
    requireSpeechAfterFocus: true,
    directAddress: true,
  };
}

function defaultCourseSpine(args: {
  stage: Stage;
  allOutlines: SceneOutline[];
}): SceneActionCourseSpineContext {
  const teachingOutlines = args.allOutlines.filter(isCountedTeachingOutline);
  return {
    logline: args.stage.description || args.stage.name,
    centralQuestion: args.stage.name,
    acts: [
      {
        id: 'act-main',
        act: 'development',
        title: args.stage.name,
        purpose: '按 notebook 页面顺序推进核心理解。',
        pages: teachingOutlines.map((outline) => outline.order || 0),
        keyQuestion: teachingOutlines[0]?.teachingObjective || teachingOutlines[0]?.title,
      },
    ],
    closingCallback: '回到本 notebook 的核心目标并收束为可执行检查点。',
  };
}

function continuityForActionContext(args: {
  outline: SceneOutline;
  allOutlines: SceneOutline[];
}): SceneActionContinuityContext {
  const previous = args.allOutlines.find((outline) => outline.order === args.outline.order - 1);
  const next = args.allOutlines.find((outline) => outline.order === args.outline.order + 1);
  return {
    rhetoricalRole:
      args.outline.teachingRole ||
      args.outline.teachingPagePlan?.role ||
      args.outline.archetype ||
      args.outline.type,
    fromPrevious:
      args.outline.continuity?.previousHandoff ||
      (previous ? `承接上一页「${previous.title}」。` : undefined),
    pageMove:
      args.outline.continuity?.currentJob ||
      args.outline.teachingObjective ||
      args.outline.description,
    toNext:
      args.outline.continuity?.nextHandoff || (next ? `交给下一页「${next.title}」。` : undefined),
    callbackToSpine: args.outline.imageNotebookCourseSpine?.centralQuestion,
  };
}

export function buildNotebookPageActionContextSeed(args: {
  outline: SceneOutline;
  allOutlines: SceneOutline[];
  stage: Stage;
  content?: unknown;
}): NotebookPageActionContextSeed {
  const imageBrief = args.outline.imageNotebookBrief;
  const imageCourseSpine = args.outline.imageNotebookCourseSpine;
  return {
    courseSpine: imageCourseSpine || defaultCourseSpine(args),
    continuity: imageBrief
      ? {
          fromPrevious: imageBrief.pageMove.fromPrevious,
          pageMove: imageBrief.pageMove.currentJob,
          toNext: imageBrief.pageMove.toNext,
          callbackToSpine: imageBrief.pageMove.callbackToSpine || imageCourseSpine?.centralQuestion,
        }
      : continuityForActionContext(args),
    focusPlan: args.content
      ? buildFocusPlanFromContent(args.content)
      : imageBrief?.focusRegions.map((region) => ({
          targetId: region.id,
          label: region.label,
          role: region.role,
          order: region.order,
        })),
    narrationPolicy: buildNarrationPolicy(args.outline, args.stage),
  };
}

function formatImageSourceHints(images: SourceImageAsset[]): string {
  if (images.length === 0) return 'No source images are available for this page.';
  return images
    .slice(0, 4)
    .map((image, index) =>
      [
        `${index + 1}. id=${image.id}`,
        image.pageNumber ? `source page=${image.pageNumber}` : '',
        image.description ? `description=${compactLine(image.description, 160)}` : '',
        image.width && image.height ? `size=${image.width}x${image.height}` : '',
      ]
        .filter(Boolean)
        .join(', '),
    )
    .join('\n');
}

function formatWorkedExampleForImagePrompt(outline: SceneOutline): string {
  const cfg = outline.workedExampleConfig;
  if (!cfg) return '';
  return [
    `Worked example role: ${cfg.role}`,
    cfg.problemStatement ? `Problem: ${compactLine(cfg.problemStatement, 360)}` : '',
    cfg.givens?.length ? `Givens: ${cfg.givens.join('; ')}` : '',
    cfg.asks?.length ? `Goal: ${cfg.asks.join('; ')}` : '',
    cfg.solutionPlan?.length ? `Solution plan: ${cfg.solutionPlan.join('; ')}` : '',
    cfg.walkthroughSteps?.length ? `Walkthrough: ${cfg.walkthroughSteps.join('; ')}` : '',
    cfg.commonPitfalls?.length ? `Pitfalls: ${cfg.commonPitfalls.join('; ')}` : '',
    cfg.finalAnswer ? `Final answer: ${cfg.finalAnswer}` : '',
    cfg.codeSnippet ? `Code snippet: ${compactLine(cfg.codeSnippet, 420)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildNotebookImagePrompt(args: {
  outline: SceneOutline;
  allOutlines: SceneOutline[];
  stage: Stage;
  assignedSourceImages: SourceImageAsset[];
}): string {
  if (args.outline.imageNotebookPromptPlan?.compiledImagePrompt) {
    return args.outline.imageNotebookPromptPlan.compiledImagePrompt;
  }
  if (args.outline.imageNotebookBrief) {
    const promptPlanLanguage =
      args.outline.language || (args.stage.language === 'en-US' ? 'en-US' : 'zh-CN');
    return buildImageNotebookPromptPlan({
      outline: args.outline,
      allOutlines: args.allOutlines,
      notebookTitle: args.stage.name,
      notebookGoal: args.stage.description,
      language: promptPlanLanguage,
      stylePrompt: args.stage.style || args.stage.description,
      styleBrief: args.stage.imageNotebookStyle,
      sourceImageHints: formatImageSourceHints(args.assignedSourceImages),
    }).compiledImagePrompt;
  }

  const { outline, allOutlines, stage } = args;
  const language = outline.language || stage.language || 'zh-CN';
  const pageIndex = Math.max(
    1,
    allOutlines.findIndex((item) => item.id === outline.id) + 1 || outline.order || 1,
  );
  const totalPages = Math.max(allOutlines.length, pageIndex);
  const densityPolicy = resolveImageNotebookDensityPolicyForPageCount(totalPages);
  const surroundingTitles = allOutlines
    .slice(Math.max(0, pageIndex - 3), Math.min(allOutlines.length, pageIndex + 2))
    .map((item) => `${item.order}. ${item.title}`)
    .join('\n');
  const workedExample = formatWorkedExampleForImagePrompt(outline);
  const imageBrief = outline.imageNotebookBrief;
  const quiz = outline.quizConfig
    ? [
        `Quiz page: ${outline.quizConfig.questionCount} question(s)`,
        `Difficulty: ${outline.quizConfig.difficulty}`,
        `Question types: ${outline.quizConfig.questionTypes.join(', ')}`,
      ].join('\n')
    : '';
  const authoritativeDrawingPrompt = compactLine(outline.imageNotebookPrompt, 5000);

  return [
    'Create one polished 16:9 classroom PPT slide as a single bitmap image.',
    'The image is one live teaching moment in the notebook, not a decorative illustration and not a teacher handout.',
    'The slide must contain only student-facing board content directly in the image.',
    'Use the selected or authoritative drawing style as the primary visual direction while keeping the page readable, sparse, and projector-safe.',
    '',
    IMAGE_FIRST_NOTEBOOK_STYLE_SPEC,
    '',
    `Notebook: ${stage.name}`,
    stage.description ? `Notebook goal: ${compactLine(stage.description, 320)}` : '',
    `Page ${pageIndex} of ${totalPages}`,
    `Language for visible text: ${language}`,
    `Page density policy:\n${formatImageNotebookDensityPolicyForPrompt(densityPolicy)}`,
    `Page title: ${outline.title}`,
    `Page purpose: ${compactLine(outline.description, 420)}`,
    outline.teachingObjective
      ? `Teaching objective: ${compactLine(outline.teachingObjective, 360)}`
      : '',
    outline.studentThinkingMove
      ? `Student thinking move: ${compactLine(outline.studentThinkingMove, 260)}`
      : '',
    authoritativeDrawingPrompt
      ? `\nAuthoritative drawing prompt for this page:\n${authoritativeDrawingPrompt}\n`
      : '',
    authoritativeDrawingPrompt
      ? 'The authoritative drawing prompt is the primary source of truth. Preserve its exact visible definition text, code, original problem statement, formulas, theorem statements, examples, labels, and required student-facing wording.'
      : '',
    'Planning-context labels above are NOT visible slide headings. Do not copy labels like Page purpose, Teaching objective, Student thinking move, Required visible content, or Student-facing live page brief onto the image.',
    imageBrief
      ? `\nStudent-facing live page brief:\n${formatImageNotebookBriefForPrompt(imageBrief)}`
      : '',
    '',
    'Required visible content:',
    ...(outline.keyPoints || []).slice(0, 5).map((point, index) => `${index + 1}. ${point}`),
    workedExample ? `\n${workedExample}` : '',
    quiz ? `\n${quiz}` : '',
    '',
    'Nearby notebook sequence:',
    surroundingTitles || outline.title,
    '',
    'Available source-image hints:',
    formatImageSourceHints(args.assignedSourceImages),
    '',
    'Design requirements:',
    '- The image must be a single full-canvas 16:9 slide. The notebook/grid-paper background must reach the exact left, right, top, and bottom image edges.',
    '- Do not render a smaller white sheet, poster, card, or slide centered inside the image; no internal white side margins or black/white bars.',
    '- Use a strong handwritten-style title, one live question/setup area, and one visual/diagram/problem/worked-example area. A small bottom "next thought" strip is allowed.',
    '- Follow the page density policy. A short overview notebook should not look like a compressed handout.',
    '- The board should feel like the teacher is saying "look here first, now try this next", not like a complete after-class summary sheet.',
    '- Avoid overview grids, checklist-heavy layouts, and many boxed mini-sections. Do not draw more than 3 main parent regions unless the page is explicitly a summary.',
    '- Visible headings should be student-facing: "我们已知什么？", "先判断什么？", "下一步怎么来？", "试一试".',
    '- Do not write teacher-planning labels or sentences on the slide: "让学生看到", "让学生理解", "教学目标", "本页主线", "可迁移动作", "讲解重点", "Page role", "Teacher move", "QA checklist".',
    '- This must look like a generated classroom board image, not SVG, not HTML, not a screenshot, and not a programmatic layout exported to PNG.',
    '- Text must be large, readable, and sparse enough for a projected slide; do not create paragraphs of tiny text.',
    '- Prefer board-like diagrams, arrows, tables, code traces, formulas, or worked-example structure when they fit the topic.',
    '- For math pages, show the problem, the next student decision, the main formula/derivation, and a quick check as separate hand-drawn regions.',
    '- For hook/overview pages, do not solve everything. Show a concrete question, why the old method is not enough, and the next question students should ask.',
    '- For CS pages, show the data/idea, code or trace, and result/state as separate hand-drawn regions.',
    '- Preserve mathematical notation, code identifiers, and domain vocabulary accurately.',
    '- For proof/math pages, never invent or alter formulas; copy every required formula and proof step exactly from the teacher page brief.',
    '- Do not include browser chrome, UI mockup frames, watermarks, stock-photo clutter, plain corporate cards, or placeholder text.',
    '- Do not mention that this was generated by AI.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildFullPageImageSlideContent(args: {
  imageUrl: string;
  prompt: string;
  outline: SceneOutline;
  stage: Stage;
}): {
  elements: PPTElement[];
  imageNotebookPromptPlan?: SceneOutline['imageNotebookPromptPlan'];
  background: SlideBackground;
  theme: SlideTheme;
  remark: string;
} {
  const imageElementId = `full_page_bitmap_${nanoid(8)}`;
  const focusElements = generatedImageFocusElements(args.outline, args.stage);
  return {
    elements: [
      {
        id: imageElementId,
        type: 'image',
        name: 'full_page_bitmap',
        left: 0,
        top: 0,
        width: IMAGE_NOTEBOOK_CANVAS_WIDTH,
        height: IMAGE_NOTEBOOK_CANVAS_HEIGHT,
        rotate: 0,
        fixedRatio: false,
        src: args.imageUrl,
        imageType: 'background',
        lock: true,
      },
      ...focusElements,
    ],
    imageNotebookPromptPlan: args.outline.imageNotebookPromptPlan,
    background: { type: 'solid', color: '#0f172a', respectProfileStyle: false },
    theme: {
      backgroundColor: '#0f172a',
      themeColors: ['#0f172a', '#2563eb', '#14b8a6', '#f59e0b', '#f8fafc'],
      fontColor: '#f8fafc',
      fontName: 'Microsoft YaHei',
    },
    remark: args.prompt,
  };
}
