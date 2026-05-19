import type { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import {
  buildHtmlSlideDensityContract,
  buildHtmlSlidePromptFromPlan,
  getHtmlSlideCanvasMode,
} from '@/features/ppt-generation/html-slide-contracts';
import { getCoverQualityRisks } from '@/features/ppt-generation/html-slide-quality';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { runWithRequestContext } from '@/lib/server/request-context';
import { buildVisionUserContent } from '@/lib/generation/prompt-formatters';
import { buildBuiltInCoverHtml } from './built-in-cover';
import { extractHtml, sanitizeHtml, countMathBlocks } from './html-document';
import {
  analyzeSourceImageUsage,
  normalizeImageAsset,
  normalizeSourceImages,
  resolveSourceImagePlaceholders,
  sourceImagesPromptBlock,
} from './image-assets';
import {
  getLikelyCanvasOverflowRisks,
  getLikelyViewportOverflowRisks,
  getMathRouteStructureRisks,
} from './quality-risks';
import {
  codeRouteContract,
  courseRouteContract,
  csRouteContract,
  mathRouteContract,
  normalizeCourseRoute,
  normalizeCsRoute,
  normalizeMathRoute,
  pageKindContract,
  promptNeedsMath,
} from './route-contracts';
import type { HtmlRetryReason, RequestBody } from './types';
import {
  combineTokenUsage,
  estimateGenerationCost,
  shouldSkipCreditChargeForTestRequest,
} from './usage-cost';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RequestBody;
    const slidePlan = body.slidePlan;
    const lessonPlan = body.lessonPlan;
    const plannedPrompt =
      slidePlan && lessonPlan ? buildHtmlSlidePromptFromPlan(slidePlan, lessonPlan) : '';
    const prompt = (body.prompt?.trim() || plannedPrompt.trim()).trim();
    const qualityFeedback = body.qualityFeedback?.trim().slice(0, 2000);
    if (!prompt) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing prompt');
    }
    if (prompt.length > 8000) {
      return apiError('INVALID_REQUEST', 413, 'Prompt is too long for HTML PPT generation');
    }
    const pageKind = body.pageKind?.trim() || slidePlan?.pageKind?.trim();
    const codeRoute = body.codeRoute;
    const courseRoute = normalizeCourseRoute(
      body.courseRoute || (slidePlan?.courseRoute as RequestBody['courseRoute']),
      prompt,
    );
    const csRoute = normalizeCsRoute(
      body.csRoute || (slidePlan?.csRoute as RequestBody['csRoute']),
      codeRoute,
      prompt,
    );
    const mathRoute = normalizeMathRoute(
      body.mathRoute || (slidePlan?.mathRoute as RequestBody['mathRoute']),
      prompt,
      pageKind,
    );
    const generatedDensityContract = slidePlan
      ? buildHtmlSlideDensityContract(slidePlan, { includeCoverVisualContract: true })
      : '';
    const densityContract = (body.densityContract?.trim() || generatedDensityContract)
      .trim()
      .slice(0, 2000);
    const plannedCanvasMode = getHtmlSlideCanvasMode(slidePlan);
    const requestedCanvasMode = body.canvasMode || plannedCanvasMode;
    const canvasMode =
      requestedCanvasMode === 'long' || requestedCanvasMode === 'tall'
        ? requestedCanvasMode
        : 'slide';
    const requestedCanvasHeight = body.canvasHeight ?? slidePlan?.canvasHeight;
    const canvasHeight =
      canvasMode === 'long'
        ? Math.min(3200, Math.max(1600, Math.round(requestedCanvasHeight || 2200)))
        : canvasMode === 'tall'
          ? Math.min(1600, Math.max(1050, Math.round(requestedCanvasHeight || 1200)))
          : 900;
    const isLongCanvas = canvasMode === 'long';
    const isTallCanvas = canvasMode === 'tall';
    const isExpandedCanvas = canvasMode !== 'slide';
    const imageAsset = normalizeImageAsset(body.imageAsset);
    const sourceImages = normalizeSourceImages(body.assignedSourceImages, body.sourceImageMapping);
    const retryReason = body.retryReason?.trim().slice(0, 1400);
    const requiresMath =
      pageKind === 'math' || courseRoute === 'math' || (!pageKind && promptNeedsMath(prompt));
    const skipCreditCharge = shouldSkipCreditChargeForTestRequest(req);
    const builtInCoverHtml = buildBuiltInCoverHtml({
      pageKind,
      prompt,
      densityContract,
      courseRoute,
    });
    if (builtInCoverHtml) {
      return apiSuccess({
        html: builtInCoverHtml,
        model: 'built-in-cover-template',
        usage: null,
        costEstimate: null,
        generationAttempts: 0,
        retryReasons: [
          {
            code: 'built-in-cover-template',
            title: '使用内置封面模板',
            details: ['封面页复用 generation-quality 的科技/电影/学术封面结构和本地背景图。'],
          },
        ],
        sourceImageUsage: { assignedIds: [], usedIds: [], missingIds: [], inventedIds: [] },
        skippedCreditCharge: skipCreditCharge,
      });
    }

    const { model, modelInfo, modelString } = await resolveModelFromHeaders(req, {
      allowOpenAIModelOverride: true,
    });

    const system = [
      'You are an expert presentation designer and front-end engineer.',
      isLongCanvas
        ? `Generate one self-contained HTML document that renders exactly one long-form teaching page with width 1600px and target height ${canvasHeight}px.`
        : canvasMode === 'tall'
          ? `Generate one self-contained HTML document that renders exactly one taller teaching slide with width 1600px and target height ${canvasHeight}px.`
          : 'Generate one self-contained HTML document that renders exactly one 16:9 presentation slide.',
      'Unless the user explicitly asks for another language, all visible slide content must be written in Simplified Chinese.',
      'If source labels or code keywords are in English, keep only those necessary terms; surrounding explanation, headings, table headers, and callouts should be Simplified Chinese.',
      isLongCanvas
        ? 'The page must feel like an editable long PowerPoint handout/teaching board built from semantic HTML/CSS, not a web article or poster image.'
        : canvasMode === 'tall'
          ? 'The page must feel like an editable taller PowerPoint teaching slide, not a web article, poster, or long handout.'
          : 'The slide must feel like an editable PowerPoint page built from semantic HTML/CSS, not a poster image.',
      pageKind === 'cover'
        ? 'Use plain HTML and CSS only. Do not use JavaScript, external fonts, canvas, or SVG screenshots. Cover pages must use one local /slide-backgrounds/ image path as the full-bleed background; pure CSS gradients/shapes alone are not enough. Never use external http(s) assets.'
        : 'Use plain HTML and CSS only. Do not use JavaScript, external fonts, canvas, or SVG screenshots. Do not use external assets except explicitly supplied source images and the single provided AI image asset when one is supplied.',
      'Use real DOM text for all labels. Use div/section/table/list elements and CSS shapes for cards, charts, icons, diagrams, and callouts. If source images are supplied, use them as original evidence/figures/tables. If an AI image asset is supplied, use it as a content illustration instead of drawing a complex CSS illustration.',
      'When an image asset is supplied, use exactly one <img> element with src set exactly to the provided src value. Do not invent, rewrite, fetch, or add any other image URL.',
      'When source images are supplied, use <img> elements with src set exactly to the source image IDs from the prompt, such as img_1. The server will resolve those IDs to the real uploaded-file images after generation.',
      'When source images are supplied as vision input, inspect the actual image content before deciding the figure title, caption, and surrounding explanation.',
      'Do not call a photograph, sample frame, or ordinary screenshot an architecture diagram, table, chart, pipeline, or flowchart unless it visibly is one.',
      'Do not duplicate the same source image within one slide. If a slide has two concepts but one source image, show the image once and compare the concepts with editable DOM text/cards.',
      'A supplied image asset is an illustration inside the slide, not a full-slide 16:9 background and not a screenshot of the finished slide.',
      'Use only the user-provided topic and content. Do not invent unrelated equations, formulas, example problems, proof snippets, source notation, QA panels, or "impossible question" text.',
      'Before designing, choose exactly one primary teaching action for the slide: concept explanation, comparison, code observation, counterexample, process, formula derivation, or worked problem. Do not combine multiple slide genres.',
      'Respect the course route contract in the user prompt. Subject-specific pages must use the right teaching grammar instead of falling back to generic card grids.',
      isLongCanvas
        ? 'Use a vertical teaching-page structure with 4-7 ordered sections. Each section should be compact, titled, and directly tied to the explanation.'
        : canvasMode === 'tall'
          ? 'Use a taller teaching-slide structure with 3-5 ordered sections. Each section should be compact and directly tied to one teaching move.'
          : 'Use at most three main content regions per slide, not counting the title area. A bottom conclusion/check strip counts as one region.',
      'The prompt is the content contract. If it specifies an exact title, exact item count, exact formulas, exact steps, short reasons, conclusion, or checkpoint, those items are mandatory and must remain visible.',
      'Never reduce a requested count to match a page-kind default. For example, if the prompt asks for 5 questions, render 5 questions even if a summary page usually uses 3 takeaways.',
      'The visible H1/title must match the prompt title exactly when one is provided. Do not rewrite it into a nicer or shorter synonym.',
      'Main content panels must not overlap. Use normal grid/flex document flow for title, main regions, and bottom strips. Do not place a bottom/example/conclusion panel over an upper card to save space.',
      'For 16:9 slides, bottom strips, summary bars, checkpoints, and conclusion panels must occupy a reserved normal-flow grid or flex row. Never position them absolute/fixed/sticky over the main content.',
      'If a bottom strip is requested, use a structure like grid-template-rows:auto minmax(0,1fr) auto or a flex column; the main content region above it must reserve enough height and must not extend underneath.',
      'Only the outer .slide-content wrapper may be positioned with inset. Inside it, all semantic content regions, cards, figures, example panels, visual slots, formula blocks, and bottom strips must remain normal-flow grid/flex children.',
      'Do not use position:absolute, position:fixed, position:sticky, z-index stacking, or negative transforms to place semantic content panels. Use those only for tiny decorative marks that do not contain text or images.',
      'If an illustration or source image is supplied, put its <figure> in a real grid/flex cell with aspect-ratio and max-height. It must not float above or under text cards.',
      'Do a bounding-box check before output: no covered content, no footer overlay, no card hidden behind another card, and no semantic content outside the slide.',
      'If content feels too dense, delete lower-priority material instead of shrinking, clipping, scrolling, or adding another panel. Deletion priority: neighbor context, decorative labels, secondary explanation, extra trace steps, extra conclusion/callout.',
      'Do not delete mandatory material. If mandatory content is too dense, compact its wording and simplify the layout while preserving all requested items.',
      'Do not transform ordinary examples into full exercise pages unless the user/source explicitly asks a question to solve. Do not add "known conditions", "solution steps", or "final answer" just to fill space.',
      'Only use MathML on math-heavy slides or when the user explicitly requests formulas/equations. For intro, summary, process, table, code, and ordinary worked-example pages, avoid <math> unless the prompt specifically asks for mathematical notation.',
      'For math-heavy slides, use native MathML elements such as <math>, <mfrac>, <msup>, <msub>, <msqrt>, <mo>, <mi>, <mn>, and <mtable> for important equations when possible. Use simple HTML <sup>/<sub> only for lightweight inline notation.',
      'If the user asks for equations, derivations, matrices, probability formulas, or math notation, the slide must contain real <math> blocks for the main formulas rather than plain text approximations.',
      'Do not use TeX delimiters as the visible formula renderer unless explicitly showing source notation. Do not use MathJax, KaTeX, scripts, external CSS, images, SVG, or canvas for formulas.',
      'Place equations inside bounded .formula, .math-card, or .equation-row containers with max-width, overflow:hidden, readable font sizes, and enough line height. If the math is dense, summarize steps instead of overflowing.',
      'For math-heavy slides, use max 7 <math> blocks, max 3 formula cards, max 4 derivation/table rows, and MathML font sizes between 20px and 26px. Prefer one-line equations. Never hide extra equations by clipping them.',
      'Do not use <mspace> to force large formula gaps. Break long formulas into two short stacked rows instead of one wide equation. Each <math> block must fit its card without horizontal clipping.',
      isExpandedCanvas
        ? `The renderer iframe width is exactly 1600px. Create one fixed-width ${isTallCanvas ? 'taller teaching slide' : 'long page'} stage: width 1600px, min-height ${canvasHeight}px, target total height close to ${canvasHeight}px.`
        : 'The renderer iframe viewport is exactly 1600px by 900px. Create one fixed 1600px by 900px slide stage that fills that viewport.',
      isExpandedCanvas
        ? `Set html and body to width: 1600px; min-height: ${canvasHeight}px; margin: 0; overflow-x: hidden; overflow-y: auto. The page may be vertically long but must not be horizontally scrollable.`
        : 'Set html and body to width: 1600px, height: 900px, margin: 0, overflow: hidden. The visible slide must not be taller, wider, scrollable, or portrait.',
      isExpandedCanvas
        ? `Follow the same semantic wrapper contract: exactly one <section class="slide"> containing one <div class="slide-content">. The .slide must be width:1600px; min-height:${canvasHeight}px; overflow:visible; position:relative; box-sizing:border-box.`
        : 'Follow the frontend-slides viewport contract: exactly one <section class="slide"> containing one <div class="slide-content">. The .slide must be width:1600px; height:900px; overflow:hidden; position:relative; box-sizing:border-box.',
      isExpandedCanvas
        ? 'The .slide-content must use the same width and safe side padding as normal slides, but may flow vertically. Use padding 64-80px and display:flex/grid with normal document flow; avoid absolute positioning for main sections.'
        : 'The .slide-content must live fully inside the slide, use a safe margin/padding of 56-72px, and must also use overflow:hidden; box-sizing:border-box.',
      'Use presentation-scale typography and spacing, not oversized web-app component sizing. As a default, h1 should be about 52-72px, section/card titles 26-36px, body text 22-30px, and card padding 22-36px.',
      isExpandedCanvas
        ? 'Do not use fit-layer scaling for expanded-height pages. They solve density by vertical flow and sectioning, not by shrinking the whole layout.'
        : 'If the composition feels visually too large or crowded, add an inner .fit-layer inside .slide-content with width/height set to calc(100% / scale), e.g. width:calc(100% / .92); height:calc(100% / .92); transform:scale(.92); transform-origin:top left. This gives the layout more internal space before scaling it back into the viewport. Do not transform .slide or rely on clipping.',
      isExpandedCanvas
        ? `Hard canvas rule: every visible DOM element will be checked with getBoundingClientRect(). Every rect must satisfy left>=0, top>=0, right<=1600, and bottom<=${canvasHeight + 80}. This includes decorative accents, backgrounds, cards, grids, tables, code blocks, formulas, and all child elements.`
        : 'Hard viewport rule: every visible DOM element will be checked with getBoundingClientRect(). Every rect must satisfy left>=0, top>=0, right<=1600, and bottom<=900. This includes decorative accents, backgrounds, cards, grids, tables, and all child elements.',
      'Do not create off-canvas decorative blobs/circles, negative-position accents, oversized background divs, or elements that are clipped by overflow:hidden. These still fail because their DOM bounding boxes are outside the viewport.',
      'Do not use negative top/left/right/bottom/inset, negative margin, or negative translate values for alignment. Center arrows, labels, and decoration with flex/grid/absolute bounds that stay fully inside the slide.',
      isExpandedCanvas
        ? `For decorative color, prefer CSS background gradients on .slide/.slide-content. If you create decorative DOM elements, keep them fully inside x=0..1600 and y=0..${canvasHeight + 80} with non-negative top/left and bounded width/height.`
        : 'For decorative color, prefer CSS background gradients on .slide/.slide-content. If you create decorative DOM elements, keep them fully inside 0..1600 x 0..900 with non-negative top/left and bounded width/height.',
      isExpandedCanvas
        ? `No content may extend beyond x=0..1600. Vertically, content should end near y=${canvasHeight} and must not exceed y=${canvasHeight + 80}. Do not clip text/code/math; use long-page vertical sections.`
        : 'No content may extend beyond x=0..1600 or y=0..900. Do not rely on scroll or clipping. If content is dense, reduce density, simplify copy, tighten the table, or split into fewer regions within this single slide.',
      isExpandedCanvas
        ? `Expanded page height is intentional. Do not use 100vh. Use min-height:${canvasHeight}px on .slide, and let .slide-content flow vertically with section gaps of 24-36px.`
        : 'Do not set large min-height values on the main content area. Avoid height:100vh and min-height:100vh. With 56-72px slide padding and a header, the body grid/content area should be at most 640px tall, and its bottom edge must stay at y<=884.',
      'Text/content cards may use overflow:hidden only for purely decorative overflow. Cards that contain requested text, formulas, tables, or steps must not clip their own content.',
      isExpandedCanvas
        ? '.slide-content should be a normal-flow vertical stack: max-width inside the 1600px page, gap:28px, and overflow:visible. Use sticky/fixed nothing. Use section cards, code/proof blocks, checkpoints, and summary strips.'
        : 'Recommended layout: .slide-content { position:absolute; inset:64px; display:grid; grid-template-rows:auto minmax(0,1fr); gap:24px; } and the main content region must use min-height:0; overflow:hidden.',
      'Use the density contract from the user prompt as a hard design constraint. Control density by editing copy length, number of blocks, table rows, formula count, and layout coverage; do not solve density by shrinking text until it becomes hard to read.',
      'The slide should be an edited teaching page, not a compressed transcript. Keep the strongest one idea and cut the rest.',
      'Large cards and panels are not allowed to be mostly empty. If a card/panel occupies more than about 8% of the slide, it must contain enough real structure to visually fill it, such as a short list, mini diagram, timeline, table rows, trace states, or compact examples. Otherwise reduce its height.',
      'Default density guardrail when no stricter contract is provided: max 1 title, max 4 metric cards, max 1 chart, max 1 compact table with 4 rows, max 6 short bullets/callouts total.',
      'All long text must wrap inside bounded containers. Avoid single-line labels wider than their container. Use min-width:0 on grid/flex children and overflow-wrap:break-word for text blocks.',
      'Include all styles in a single <style> tag.',
      'Use CSS classes with meaningful names, restrained visual hierarchy, and stable layout dimensions.',
      'Output only the complete HTML document. No Markdown fences and no explanation.',
    ].join('\n');

    const userPrompt = [
      prompt,
      courseRouteContract(courseRoute, { pageKind, codeRoute, csRoute, mathRoute, canvasMode }),
      courseRoute === 'computer-science' ? csRouteContract(csRoute, canvasMode) : '',
      courseRoute === 'math' ? mathRouteContract(mathRoute, canvasMode) : '',
      pageKindContract(pageKind, canvasMode),
      pageKind === 'code' ? codeRouteContract(codeRoute, canvasMode) : '',
      '',
      '质量要求：',
      isExpandedCanvas
        ? `- 输出必须是一张精致的${isTallCanvas ? '中高课件页' : '长页面教学版式'}，宽 1600px，目标高度约 ${canvasHeight}px，可纵向阅读。`
        : '- 输出必须是一张精致的商务/教育 PPT 页面。',
      '- 可见文字默认使用简体中文。',
      '- 包含清晰标题、结构化内容区域、视觉层级；如果适合题材，可以包含图表、表格或流程图。',
      '- 只使用 prompt 给出的主题和内容，不要自行加入无关公式、题目、证明、代码、QA 面板或第二个主题区。',
      '- 必须保留 prompt 中明确要求的标题、数量、公式、步骤、短理由、结论和检查点。',
      '- 如果 prompt 标出“必需保留清单”，清单里的内容必须逐项出现在可见页面里。',
      isLongCanvas
        ? '- 先选一个纵向主结构，分成 4-7 个清晰 section；长页面允许更多内容，但不能变成普通网页长文。'
        : isTallCanvas
          ? '- 先选一个中高课件结构，分成 3-5 个清晰内容区；比 16:9 更高，但仍是一页课件，不是网页长文。'
          : '- 先选一个主结构，再删减内容；一页最多 3 个主要内容区。',
      isExpandedCanvas
        ? '- 如果放不下，压缩次要解释或减少分支；不要横向溢出、裁切、覆盖，也不要把代码/公式放进内部滚动框。'
        : '- 如果放不下，删掉次要区块，不要裁切、滚动、覆盖、压缩成长讲义。',
      '- 没有明确题目的源页，不要改写成“题目/已知/求解步骤/最终答案”。',
      '- 保持投影片尺度下可读。',
      '- 避免泛化营销 hero 布局；这是一张课件/汇报 slide，不是 landing page。',
      '- HTML 应该容易通过修改文字和 CSS 数值继续编辑。',
      densityContract
        ? ['', '页面密度契约：', densityContract, '- 必须同时避免太空和太挤。'].join('\n')
        : '',
      sourceImagesPromptBlock(sourceImages),
      retryReason
        ? ['', '上游重试原因：', retryReason, '- 本次必须针对这个原因修复，不要只泛泛重写。'].join(
            '\n',
          )
        : '',
      qualityFeedback
        ? [
            '',
            '上一次本地质检失败，必须针对以下问题修复：',
            qualityFeedback,
            isExpandedCanvas
              ? `- 尤其注意：不要使用负横向坐标、负 margin、超宽装饰 div、出界背景块，所有 DOM 元素必须在宽 1600px、高约 ${canvasHeight}px 的增高画布内。`
              : '- 尤其注意：不要使用负坐标、负 margin、超大装饰 div、出界背景块，所有 DOM 元素边界都必须完全在 1600×900 内。',
            '- 如果失败原因提到 overlap/重叠/覆盖，必须改为正常 grid/flex 文档流：header、main、footer 各占自己的行，图片和底部卡片不能 absolute 叠在主内容上。',
          ].join('\n')
        : '',
      imageAsset
        ? [
            '',
            '可用 AI 插图素材：',
            `- src：${imageAsset.src}`,
            `- alt：${imageAsset.alt}`,
            `- 素材比例：${imageAsset.aspectRatio}`,
            imageAsset.description ? `- 素材内容：${imageAsset.description}` : '',
            '使用要求：',
            '- 这张图是插图素材，不是整页背景图，也不是 16:9 成品 slide。',
            '- 必须使用 exactly one <img>，src 必须逐字等于上面的 src。',
            '- 先在版式中预留一个明确的插图区，例如 <figure class="visual-slot">，再把这张图片作为该区域内的唯一 <img> 插进去。',
            isExpandedCanvas
              ? '- 插图区应该是增高画布中的一个 section 局部素材，宽高稳定；图片用 object-fit: cover 或 contain，不能溢出容器。'
              : '- 插图区应该是页面的一部分，宽高稳定，建议占画布 20%-34% 面积；图片用 object-fit: cover 或 contain，不能溢出容器。',
            isExpandedCanvas
              ? '- 插图区不能铺满整个增高画布，也不能让文字浮在图片上导致不可编辑或不可读。'
              : '- 插图区不能铺满整个 1600×900 画布，也不能让文字浮在图片上导致不可编辑或不可读。',
            '- 图片以外的标题、标签、模块、问题条都必须是可编辑 DOM 文本。',
            '- 不要再用 CSS 手绘复杂主图，也不要给每个模块手绘小图标；只保留必要的小色块、边框和排版。',
            '- 除了极少数装饰标签外，可读中文文字字号应尽量 >= 24px。',
          ]
            .filter(Boolean)
            .join('\n')
        : '',
    ].join('\n');

    const generateHtml = (nextPrompt: string) =>
      runWithRequestContext(
        req,
        '/api/generate/html-ppt-slide',
        () =>
          callLLM(
            sourceImages.length
              ? {
                  model,
                  system,
                  messages: [
                    {
                      role: 'user' as const,
                      content: buildVisionUserContent(nextPrompt, sourceImages, 'zh-CN'),
                    },
                  ],
                  maxOutputTokens: Math.min(modelInfo?.outputWindow || 32000, 32000),
                }
              : {
                  model,
                  system,
                  prompt: nextPrompt,
                  maxOutputTokens: Math.min(modelInfo?.outputWindow || 32000, 32000),
                },
            'html-ppt-slide-test',
            {
              retries: 1,
              validate: (text) => /<html\b[\s\S]*<\/html>/i.test(text),
            },
          ),
        {
          operationCode: 'html_ppt_slide_test',
          chargeReason: 'HTML PPT 页面测试',
          serviceLabel: 'HTML PPT generation',
          skipCreditCharge,
        },
      );

    const result = await generateHtml(userPrompt);
    let html = sanitizeHtml(extractHtml(result.text));
    const usages = [result.usage];
    const retryReasons: HtmlRetryReason[] = [];

    const coverQualityRisks = pageKind === 'cover' ? getCoverQualityRisks(html) : [];
    if (coverQualityRisks.length > 0) {
      retryReasons.push({
        code: 'cover-visual-contract',
        title: '封面主视觉结构不符合测试页质量线',
        details: coverQualityRisks,
      });
      const retryPrompt = [
        userPrompt,
        '',
        '封面强制修正：',
        '- 这是一张封面页，必须复用 generation-quality 封面质量线。',
        ...coverQualityRisks.map((risk) => `- ${risk}`),
        '- 必须使用一个本地 /slide-backgrounds/ 图片作为全画布主视觉或 CSS background-image。',
        '- 标题直接叠在主视觉上；不要把标题包进 card/panel/glass/content box。',
        '- 不要渲染 cover/background/placeholder/封面页/主视觉/背景 等占位词。',
        '- 不要引用外部 http(s) 素材。',
      ].join('\n');
      const retryResult = await generateHtml(retryPrompt);
      html = sanitizeHtml(extractHtml(retryResult.text));
      usages.push(retryResult.usage);
    }

    const overflowRisks = isExpandedCanvas
      ? getLikelyCanvasOverflowRisks(html, canvasHeight)
      : getLikelyViewportOverflowRisks(html);
    if (overflowRisks.length > 0) {
      retryReasons.push({
        code: isExpandedCanvas ? 'canvas-overflow-risk' : 'viewport-overflow-risk',
        title: isExpandedCanvas ? 'CSS 存在明显增高画布越界风险' : 'CSS 存在明显 16:9 越界风险',
        details: overflowRisks,
      });
      const retryPrompt = [
        userPrompt,
        '',
        '强制修正：',
        isExpandedCanvas
          ? '- 初稿 CSS 存在明显增高画布越界风险，不能返回。'
          : '- 初稿 CSS 存在明显 viewport 越界风险，不能返回。',
        ...overflowRisks.map((risk) => `- ${risk}`),
        isExpandedCanvas
          ? `- 重写布局：所有 DOM 元素 getBoundingClientRect() 必须位于 x=0..1600，y=0..${canvasHeight + 80} 内。`
          : '- 重写布局：所有 DOM 元素 getBoundingClientRect() 必须完全位于 0..1600 x 0..900 内。',
        '- 重写布局时，所有正文卡片、例子卡、图片 figure、结论条和底部 strip 必须使用正常 grid/flex 文档流，禁止 absolute/fixed/sticky/z-index 叠放。',
        '- 装饰效果改用 .slide 的 background/radial-gradient，或使用完全在画布内部的小元素。',
        isExpandedCanvas
          ? '- 主内容必须纵向自然流动；减少横向列数，缩短文字，避免超宽代码/表格，而不是裁切。'
          : '- 主内容区底部必须小于等于 884px；减少卡片高度、缩短文案或减少行数，而不是裁切。',
      ].join('\n');
      const retryResult = await generateHtml(retryPrompt);
      html = sanitizeHtml(extractHtml(retryResult.text));
      usages.push(retryResult.usage);
    }

    const mathRouteRisks =
      courseRoute === 'math' ? getMathRouteStructureRisks(html, mathRoute) : [];
    if (mathRouteRisks.length > 0) {
      retryReasons.push({
        code: 'math-route-contract',
        title: '数学专属版式结构不足',
        details: mathRouteRisks,
      });
      const retryPrompt = [
        userPrompt,
        '',
        '数学结构强制修正：',
        `- 本页 courseRoute=math，mathRoute=${mathRoute}，初稿没有通过数学结构 QA，不能返回。`,
        ...mathRouteRisks.map((risk) => `- ${risk}`),
        '- 必须按当前数学版式重写页面，而不是通用卡片页加少量公式。',
        '- 必须保留 prompt/source anchors 中的数学对象、符号、条件、步骤和结论；不要发明随意图标或抽象插图。',
        mathRouteContract(mathRoute, canvasMode),
        isLongCanvas
          ? '- 长页已经允许纵向展开，请用 section 自然排列完整数学结构，禁止覆盖和裁切。'
          : '- 如果 16:9 放不下，删掉可删内容，保留数学结构；禁止覆盖和裁切。',
      ].join('\n');
      const retryResult = await generateHtml(retryPrompt);
      html = sanitizeHtml(extractHtml(retryResult.text));
      usages.push(retryResult.usage);
    }

    const imageTagCount = (html.match(/<img\b/gi) || []).length;
    const aiImageTokenCount = imageAsset ? html.split(imageAsset.src).length - 1 : 0;
    if (
      imageAsset &&
      (aiImageTokenCount !== 1 ||
        !html.includes(imageAsset.src) ||
        (sourceImages.length === 0 && imageTagCount !== 1))
    ) {
      const details = [
        `检测到 <img> 数量：${imageTagCount}，目标是 exactly one。`,
        html.includes(imageAsset.src)
          ? '图片 token 已出现，但图片数量不符合要求。'
          : '没有逐字使用提供的图片 token，插图无法被后续占位图/真实图片替换。',
      ];
      retryReasons.push({
        code: 'image-asset-contract',
        title: '没有正确使用提供的 AI 插图素材',
        details,
      });
      const retryPrompt = [
        userPrompt,
        '',
        '强制修正：',
        '- 前一次生成没有正确使用提供的 AI 插图素材。',
        `- 最终 HTML 必须包含 exactly one <img>，并且 src 必须逐字等于：${imageAsset.src}`,
        '- 这张图是页面内插图，不是整页背景；不要再用 CSS 手绘复杂主图替代它。',
        '- 除了这张提供的插图，不要添加任何其他图片、外链素材、SVG 或 canvas。',
      ].join('\n');
      const retryResult = await generateHtml(retryPrompt);
      html = sanitizeHtml(extractHtml(retryResult.text));
      usages.push(retryResult.usage);
    }

    let sourceImageUsage = analyzeSourceImageUsage(html, sourceImages);
    if (
      sourceImages.length > 0 &&
      (sourceImageUsage.missingIds.length > 0 || sourceImageUsage.inventedIds.length > 0)
    ) {
      const details = [
        sourceImageUsage.missingIds.length
          ? `缺少原文图片 ID：${sourceImageUsage.missingIds.join(', ')}`
          : '',
        sourceImageUsage.inventedIds.length
          ? `引用了未分配图片 ID：${sourceImageUsage.inventedIds.join(', ')}`
          : '',
      ].filter(Boolean);
      retryReasons.push({
        code: 'source-image-contract',
        title: '没有正确使用分配的原文图片',
        details,
      });
      const retryPrompt = [
        userPrompt,
        '',
        '强制修正：',
        '- 前一次生成没有正确使用原文图片素材，不能返回。',
        ...details.map((detail) => `- ${detail}`),
        `- 最终 HTML 必须使用这些原文图片 ID：${sourceImages.map((image) => image.id).join(', ')}`,
        '- 图片 src 必须逐字等于这些 ID，例如 <img src="img_1" alt="原文图片：第 2 页图表" />。',
        '- 不要发明其他 img_N，不要把图片 ID 改写为外链、base64、SVG、canvas 或 CSS 背景。',
        '- 图片必须作为源材料证据/图表使用，并配一个可编辑 DOM 短说明。',
      ].join('\n');
      const retryResult = await generateHtml(retryPrompt);
      html = sanitizeHtml(extractHtml(retryResult.text));
      usages.push(retryResult.usage);
      sourceImageUsage = analyzeSourceImageUsage(html, sourceImages);
    }

    if (requiresMath && countMathBlocks(html) === 0) {
      retryReasons.push({
        code: 'missing-mathml',
        title: '数学页缺少真实 MathML',
        details: ['检测到 <math> 数量为 0，但本页需要用真实 MathML 承载核心公式。'],
      });
      const retryPrompt = [
        userPrompt,
        '',
        '强制修正：',
        '- 这是数学页，前一次生成失败是因为没有包含真实 MathML。',
        '- 最终 HTML 必须为核心公式包含至少 3 个真实 <math> 块。',
        '- 不要只用纯文本、Unicode 符号、<span>、<sup> 或 <sub> 表示主要公式。',
        isExpandedCanvas
          ? `- 页面必须足够清晰，所有公式块都要在 1600px 宽、约 ${canvasHeight}px 高的增高画布中自然可见。`
          : '- 页面必须足够紧凑，所有公式块都要在 1600x900 内可见。',
      ].join('\n');
      const retryResult = await generateHtml(retryPrompt);
      html = sanitizeHtml(extractHtml(retryResult.text));
      usages.push(retryResult.usage);
    }

    sourceImageUsage = analyzeSourceImageUsage(html, sourceImages);
    html = resolveSourceImagePlaceholders(html, sourceImages);

    if (!/<html\b/i.test(html) || !/<\/html>$/i.test(html)) {
      return apiError('GENERATION_FAILED', 500, 'Model did not return a valid HTML document');
    }

    const usage = combineTokenUsage(usages);
    return apiSuccess({
      html,
      model: modelString,
      usage,
      costEstimate: estimateGenerationCost(modelString, usage),
      generationAttempts: usages.length,
      retryReasons,
      sourceImageUsage,
      skippedCreditCharge: skipCreditCharge,
    });
  } catch (error) {
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : 'Failed to generate HTML PPT slide',
    );
  }
}
