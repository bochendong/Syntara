import type { SceneOutline } from '@/lib/types/generation';

import {
  HTML_LESSON_MODEL,
  RESULT_RENDER_VERSION,
  type HtmlCodeRoute,
  type HtmlCourseRoute,
  type HtmlCsRoute,
  type HtmlMathRoute,
  type HtmlPageKind,
  type InferredHtmlPageKind,
  type LessonPlan,
  type LessonSlidePlan,
  type PageCountTier,
  type TestfileFixture,
} from './types';
import { densityLabel, pageKindLabel } from './format';

export function inferHtmlPageKind(outline: SceneOutline, pageIndex: number): InferredHtmlPageKind {
  const template = outline.layoutIntent?.layoutTemplate || '';
  const role = outline.teachingRole || '';
  const discipline = outline.layoutIntent?.disciplineStyle || '';
  const profile = outline.contentProfile || '';
  const anchor = outline.teachingPagePlan?.concreteAnchor || '';
  const hasConcreteCode =
    /```|<pre|<code/i.test(anchor) ||
    /^\s*(class|def|import|from|for|while|if|elif|else|return)\b/m.test(anchor) ||
    /^\s*[A-Za-z_]\w*\s*=\s*.+$/m.test(anchor);
  const text = [
    outline.title,
    outline.description,
    outline.archetype,
    template,
    role,
    discipline,
    profile,
    anchor,
    ...(outline.keyPoints || []),
  ]
    .join('\n')
    .toLowerCase();

  if (pageIndex === 0 || /cover|title|封面/.test(text)) {
    return 'cover';
  }
  if (outline.archetype === 'intro' || /hero|divider|导入|介绍/.test(text)) {
    return 'intro';
  }
  if (/pipeline_table|comparison_matrix|table|matrix|compare|comparison|表格|对比/.test(text)) {
    return 'table';
  }
  if (
    outline.workedExampleConfig?.kind === 'code' ||
    (/code|trace|代码|追踪/.test(text) && hasConcreteCode) ||
    hasConcreteCode
  ) {
    return 'code';
  }
  if (
    discipline === 'math' ||
    profile === 'math' ||
    /formula|derivation|proof|math|equation|函数|公式|证明|推导|定理|导数|矩阵/.test(text)
  ) {
    return 'math';
  }
  if (/process|timeline|steps|pipeline|flow|road|流程|步骤|路径/.test(text)) {
    return 'process';
  }
  if (outline.archetype === 'example' || outline.workedExampleConfig) return 'example';
  if (outline.archetype === 'summary' || /summary|recap|takeaway|总结|回顾/.test(text)) {
    return 'summary';
  }
  return 'auto';
}

export function inferHtmlCodeRouteFromText(value: string): HtmlCodeRoute | undefined {
  const text = value.toLowerCase();
  if (
    /memory|heap|stack|alias|reference|object|self|attribute|class|node|linked list|内存|堆|栈|调用栈|引用|指向|对象|属性|字段|链表|节点|指针/.test(
      text,
    )
  ) {
    return 'memory-trace';
  }
  if (/trace|state|loop|line|execute|代码|追踪|状态|循环|变量|执行/.test(text)) {
    return 'execution-trace';
  }
  return undefined;
}

export function inferHtmlCourseRouteFromText(
  value: string,
  pageKind?: HtmlPageKind | InferredHtmlPageKind,
): HtmlCourseRoute {
  const text = value.toLowerCase();
  if (
    pageKind === 'math' ||
    /math|formula|derivation|proof|equation|calculus|matrix|probability|函数|公式|证明|推导|定理|导数|积分|矩阵|概率/.test(
      text,
    )
  ) {
    return 'math';
  }
  if (
    pageKind === 'code' ||
    /code|program|python|javascript|typescript|java|class|object|oop|heap|stack|memory|trace|algorithm|array|list|dict|tree|graph|代码|编程|程序|算法|调用栈|内存|堆|栈|对象|属性|字段|链表|指针/.test(
      text,
    )
  ) {
    return 'computer-science';
  }
  if (
    /science|physics|chemistry|biology|experiment|lab|物理|化学|生物|实验|科学|细胞|力学|电路/.test(
      text,
    )
  ) {
    return 'science';
  }
  if (
    /business|finance|economics|market|revenue|cost|profit|pricing|商业|财务|经济|市场|营收|成本|利润|盈亏|定价/.test(
      text,
    )
  ) {
    return 'business';
  }
  if (
    /history|literature|philosophy|source|argument|text|历史|文学|哲学|文本|史料|论证|修辞/.test(
      text,
    )
  ) {
    return 'humanities';
  }
  if (
    /policy|society|sociology|psychology|geography|case study|政策|社会|心理|地理|案例/.test(text)
  ) {
    return 'social-science';
  }
  return 'general';
}

export function inferHtmlCsRouteFromText(value: string): HtmlCsRoute {
  const text = value.toLowerCase();
  const hasPointer =
    /linked\s*list|doubly|pointer|node|prev|next|front|链表|节点|指针|前驱|后继/.test(text);
  const hasInvariant = /invariant|合法|不变量|结构承诺|size|ordering|connectivity/.test(text);
  if (hasPointer && hasInvariant) return 'composite-operation';
  if (/graph|bfs|dfs|frontier|visited|neighbor|图搜索|广度|深度|邻居/.test(text)) {
    return 'graph-trace';
  }
  if (
    /bst|binary search tree|tree|root|parent|child|subtree|树|二叉搜索树|父节点|子节点/.test(text)
  ) {
    return 'tree-diagram';
  }
  if (hasPointer) return 'pointer-diagram';
  if (
    /dictionary|dict|hash|key|value|lookup|mutation|counts|字典|哈希|键|值|映射|查找/.test(text)
  ) {
    return 'dictionary-diagram';
  }
  if (/stack|queue|push|pop|enqueue|dequeue|lifo|fifo|栈|队列/.test(text)) {
    return 'linear-structure';
  }
  if (hasInvariant) return 'invariant-check';
  if (/recursion|recursive|call stack|frame|base case|递归|调用栈|栈帧|返回值/.test(text)) {
    return 'call-stack';
  }
  if (
    /memory|heap|alias|reference|object|self|attribute|class|field|内存|堆|引用|指向|对象|属性|字段/.test(
      text,
    )
  ) {
    return 'memory-diagram';
  }
  if (/trace|state|loop|line|execute|variable|代码|追踪|状态|循环|变量|执行/.test(text)) {
    return 'execution-trace';
  }
  return 'standard';
}

export function inferHtmlMathRouteFromText(
  value: string,
  pageKind?: HtmlPageKind | InferredHtmlPageKind,
): HtmlMathRoute {
  const text = value.toLowerCase();
  if (/proof|prove|证明|证毕|证明目标/.test(text)) return 'proof';
  if (/derivation|derive|推导|化简|求导过程|递推|等价变形/.test(text)) return 'derivation';
  if (
    pageKind === 'example' ||
    /worked example|example|solve|problem|例题|求解|计算|答案/.test(text)
  ) {
    return 'worked-example';
  }
  if (/definition|theorem|lemma|proposition|corollary|定义|定理|引理|命题|推论/.test(text)) {
    return 'definition-theorem';
  }
  if (/formula|equation|identity|公式|方程|恒等式|核心公式/.test(text)) return 'formula-focus';
  if (/concept map|relationship|关系|图谱|概念图|包含关系|映射关系/.test(text))
    return 'concept-map';
  if (/compare|table|condition|case|判别|分类|条件|表格|对比/.test(text)) {
    return 'comparison-table';
  }
  return pageKind === 'math' ? 'formula-focus' : 'standard';
}

export function courseRoutePromptLabel(route: HtmlCourseRoute): string {
  const labels: Record<HtmlCourseRoute, string> = {
    general: '通用',
    math: '数学',
    'computer-science': '计算机科学',
    science: '自然科学',
    business: '商科经济',
    humanities: '人文',
    'social-science': '社科',
  };
  return labels[route];
}

export function csRoutePromptLabel(route: HtmlCsRoute): string {
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
  return labels[route];
}

export function mathRoutePromptLabel(route: HtmlMathRoute): string {
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
  return labels[route];
}

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
    ...result.plan.slides.map((slide) =>
      [slide.id, slide.order, slide.title, slide.pageKind, slide.density, slide.htmlPrompt].join(
        '/',
      ),
    ),
  ].join('::');
}

export function buildSlideKey(planSignature: string, slideId: string): string {
  return `${planSignature}:${slideId}`;
}

export function analyzeHtml(html: string) {
  return {
    htmlLength: html.length,
    textNodeCount: html
      .replace(/<style\b[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '\n')
      .split('\n')
      .map((part) => part.trim())
      .filter(Boolean).length,
    elementCount: html.match(/<[a-z][\w:-]*(?:\s|>)/gi)?.length || 0,
    mathElementCount: html.match(/<math(?:\s|>)/gi)?.length || 0,
  };
}

export function sourcePagesFromFixture(fixture: TestfileFixture) {
  return fixture.outlines.map((outline, index) => ({
    sourceIndex: index + 1,
    title: outline.title,
    summary: outline.description,
    keyPoints: outline.keyPoints || [],
    concreteAnchor: outline.teachingPagePlan?.concreteAnchor || outline.description,
    suggestedPageKind: pageKindLabel(inferHtmlPageKind(outline, index)),
  }));
}

export function shouldUseGeneratedIllustration(slide: LessonSlidePlan): boolean {
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
  return [
    `密度档：${densityLabel(slide.density)}`,
    `主标题必须逐字显示：${slide.title}`,
    `可见中文/等价字符：${slide.contentBudget.visibleCharsMin}-${slide.contentBudget.visibleCharsMax}`,
    `主要内容区：最多 ${slide.contentBudget.mainRegions} 个`,
    `内容块：最多 ${slide.contentBudget.blockCount} 个`,
    '这是整节课规划后的单页 prompt；不要额外扩写，不要补第二主题。',
    'prompt 里明确要求的标题、数量、公式、步骤、短理由、结论和检查点都是必需保留内容。',
    '如果标题或 prompt 写了 5 个/4 步/3 条等数量，实际可见条目数量必须一致。',
    '主内容必须用正常 flex/grid flow，不能让底部条、例子卡或结论卡覆盖上方卡片。',
    '承载正文/公式/表格/步骤的卡片不能通过固定高度和 overflow:hidden 裁切内容。',
    slide.contentBudget.mustDeleteIfCrowded.length
      ? `如果拥挤，优先删除：${slide.contentBudget.mustDeleteIfCrowded.join('、')}`
      : '如果拥挤，优先删除次要说明、装饰标签、额外结论。',
  ].join('\n');
}
