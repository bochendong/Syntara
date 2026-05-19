import type {
  DensityLevel,
  HtmlCanvasMode,
  HtmlCourseRoute,
  HtmlCsRoute,
  HtmlMathRoute,
  HtmlPageKind,
  LessonSlidePlan,
  PageCountTier,
  PageCountTierInput,
} from './types';
import {
  COURSE_ROUTE_SET,
  CS_ROUTE_SET,
  DENSITY_SET,
  MATH_ROUTE_SET,
  PAGE_KIND_SET,
  SOURCE_USAGE_SET,
} from './types';

export function tierBounds(tier: PageCountTier): { min: number; max: number; label: string } {
  switch (tier) {
    case 'under5':
      return { min: 4, max: 5, label: '5 页以下' };
    case 'under10':
      return { min: 7, max: 10, label: '10 页以下' };
    case 'under20':
      return { min: 14, max: 20, label: '20 页以下' };
    case 'over20':
      return { min: 21, max: 24, label: '20 页以上（测试上限 24 页）' };
    default:
      return { min: 4, max: 5, label: '5 页以下' };
  }
}

export function normalizeTier(value: PageCountTierInput | undefined): PageCountTier {
  if (value === 'under-5') return 'under5';
  if (value === 'under-10') return 'under10';
  if (value === 'under-20') return 'under20';
  if (value === 'over-20') return 'over20';
  if (value === 'under5' || value === 'under10' || value === 'under20' || value === 'over20') {
    return value;
  }
  return 'under5';
}

export function normalizePageKind(value: unknown, fallback: HtmlPageKind): HtmlPageKind {
  if (typeof value === 'string' && PAGE_KIND_SET.has(value as HtmlPageKind)) {
    return value as HtmlPageKind;
  }
  return fallback;
}

export function structuralPageKind(
  index: number,
  total: number,
  proposed: HtmlPageKind,
): HtmlPageKind {
  if (index === 0) return 'cover';
  if (total >= 4 && index === 1) return 'intro';
  if (total >= 4 && index === total - 1) return 'summary';
  return proposed;
}

export function coverVisualStyleForRoute(route: HtmlCourseRoute | undefined): string {
  if (route === 'computer-science') {
    return [
      '内置封面视觉语言：tech_hero_title。',
      '从本地内置背景中按主题挑一张，不要固定总用同一张：/slide-backgrounds/dark-tech-neural.png、/slide-backgrounds/sci-fi-data-cockpit.png、/slide-backgrounds/product-launch-dark-photo.png、/slide-backgrounds/workspace-desk-photo.png。背景/主视觉必须全幅铺满画布，标题直接叠在视觉上。',
      '科技封面必须能看到内置图片纹理，不能只用纯色、纯渐变或空 CSS 装饰冒充主视觉。',
      '这是 full-bleed 封面背景/主视觉，不是正文卡片、标题卡、半透明面板或居中盒子；不要显示“notebook 封面”“封面页”“主视觉”“背景”等占位说明，也不要用空白白底封面。',
    ].join(' ');
  }
  if (route === 'humanities' || route === 'social-science') {
    return [
      '内置封面视觉语言：cinematic_title_frame。',
      '从本地内置背景中按主题挑一张，不要固定总用同一张：/slide-backgrounds/cinematic-stage-photo.png、/slide-backgrounds/historical-manuscript.png、/slide-backgrounds/magazine-courtyard-photo.png。背景/主视觉必须全幅铺满画布，标题直接叠在视觉上并有海报级视觉权重。',
      '电影封面必须能看到内置图片纹理，不能只用纯色、纯渐变或空 CSS 装饰冒充主视觉。',
      '这是 full-bleed 封面背景/主视觉，不是正文卡片、标题卡、半透明面板或居中盒子；不要显示“notebook 封面”“封面页”“主视觉”“背景”等占位说明，也不要用空白白底封面。',
    ].join(' ');
  }
  if (route === 'math' || route === 'science') {
    return [
      '内置封面视觉语言：academic_hero_cover。',
      '从本地内置背景中按主题挑一张，不要固定总用同一张：/slide-backgrounds/academic-blueprint-photo.png、/slide-backgrounds/deep-space-astronomy.png、/slide-backgrounds/lecture-hall-photo.png、/slide-backgrounds/science-lab-photo.png。背景/主视觉必须全幅铺满画布，标题直接叠在主视觉上。',
      '学术封面必须能看到内置图片纹理，不能只用纯色、纯渐变或空 CSS 装饰冒充主视觉。',
      '这是 full-bleed 封面背景/主视觉，不是正文卡片、标题卡、半透明面板或居中盒子；不要显示“notebook 封面”“封面页”“主视觉”“背景”等占位说明，也不要用空白白底封面。',
    ].join(' ');
  }
  return [
    '内置封面视觉语言：image_title_overlay。',
    '从本地内置背景中按主题挑一张，不要固定总用同一张：/slide-backgrounds/lecture-hall-photo.png、/slide-backgrounds/workspace-desk-photo.png、/slide-backgrounds/academy-watercolor.png、/slide-backgrounds/forest-path-photo.png。背景/主视觉必须全幅铺满画布，标题直接叠在背景上。',
    '封面必须能看到内置图片纹理，不能只用纯色、纯渐变或空 CSS 装饰冒充主视觉。',
    '这是 full-bleed 封面背景/主视觉，不是正文卡片、标题卡、半透明面板或居中盒子；不要显示“notebook 封面”“封面页”“主视觉”“背景”等占位说明，也不要用空白白底封面。',
  ].join(' ');
}

export function structuralPromptGuidance(args: {
  pageKind: HtmlPageKind;
  courseRoute?: HtmlCourseRoute;
  order: number;
  pageCount: number;
}): string[] {
  if (args.pageKind === 'cover') {
    return [
      '结构角色：封面页。只建立 notebook/课程主题识别，不展开正文讲解。',
      coverVisualStyleForRoute(args.courseRoute),
      '可见内容：主标题是唯一必须文字；最多 1 行极短副标题/元信息可选，拥挤时全部删除。不要放目录、入口问题、定义、代码、公式推导、例题答案或总结列表，也不要显示“notebook 封面”“封面页”“cover”“主视觉”“背景”等占位词。',
    ];
  }
  if (args.pageKind === 'intro') {
    return [
      '结构角色：介绍/导入页。作为封面后的第 2 页，回答“为什么要学、这节课怎么进入、先看哪几个入口”。',
      '可见内容应包含：一句学习定位、3-4 个入口块/问题、极短路线图；不要提前讲完整定义、完整例题、代码 trace 或证明过程。',
    ];
  }
  if (args.pageKind === 'summary') {
    return [
      `结构角色：总结页。作为第 ${args.pageCount} 页收束整本 notebook，不引入新主题。`,
      '可见内容应包含：3-5 条 takeaway、一个回看路线/检查清单、一个下一步问题；不要生成新的例题、长证明或新代码讲解。',
    ];
  }
  return [];
}

export function inferCourseRouteFromText(value: string, pageKind?: HtmlPageKind): HtmlCourseRoute {
  const text = value.toLowerCase();
  const leadingText = text.slice(0, 900);
  if (
    pageKind === 'math' ||
    /math|formula|derivation|proof|equation|calculus|matrix|probability|函数|公式|证明|推导|定理|导数|积分|矩阵|概率|群论|马尔可夫/.test(
      text,
    )
  ) {
    return 'math';
  }
  const hasLeadingSocialScienceIdentity =
    /sociology|criminology|victimology|victimi[sz]ation|victim|offender|crime|routine activit|lifestyle|社会学|受害|被害|犯罪|罪犯|日常活动|生活方式|社会/.test(
      leadingText,
    );
  const hasLeadingComputerScienceIdentity =
    pageKind === 'code' ||
    /computer|cs|code|program|python|javascript|typescript|java|oop|inheritance|algorithm|linked\s*list|计算机|代码|编程|程序|算法|继承|链表/.test(
      leadingText,
    );
  if (hasLeadingSocialScienceIdentity && !hasLeadingComputerScienceIdentity) {
    return 'social-science';
  }
  const hasStrongSocialScienceSignal =
    /sociology|criminology|victimology|victimi[sz]ation|victim|offender|crime|routine activit|lifestyle|deviance|policy|society|psychology|geography|社会学|受害|被害|犯罪|罪犯|日常活动|生活方式|政策|社会|心理|地理/.test(
      text,
    );
  const hasStrongComputerScienceSignal =
    pageKind === 'code' ||
    /computer|cs|code|program|python|javascript|typescript|java|oop|inheritance|heap|stack|memory|trace|algorithm|array|dict|tree|graph|linked\s*list|计算机|代码|编程|程序|算法|继承|调用栈|内存|堆|栈|指针|字典|哈希/.test(
      text,
    ) ||
    /\bclass\s+[A-Z_a-z]|\bobject[-\s]oriented\b|对象|属性|字段|链表/.test(text);
  if (hasStrongSocialScienceSignal && !hasStrongComputerScienceSignal) {
    return 'social-science';
  }
  if (
    hasStrongComputerScienceSignal ||
    (/\b(?:class|object)\b/.test(text) &&
      !/\b(?:social|middle|working|upper|victim|offender)\s+class\b/.test(text))
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
  if (/history|literature|philosophy|历史|文学|哲学|文本|史料|论证|修辞/.test(text)) {
    return 'humanities';
  }
  if (/policy|society|sociology|psychology|geography|政策|社会|心理|地理|案例/.test(text)) {
    return 'social-science';
  }
  return 'general';
}

export function normalizeCourseRoute(value: unknown, fallback: HtmlCourseRoute): HtmlCourseRoute {
  if (typeof value === 'string' && COURSE_ROUTE_SET.has(value as HtmlCourseRoute)) {
    return value as HtmlCourseRoute;
  }
  return fallback;
}

export function inferCsRouteFromText(value: string): HtmlCsRoute {
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
  if (/dictionary|dict|hash|key|value|lookup|mutation|字典|哈希|键|值|映射|查找/.test(text)) {
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
    /memory|heap|alias|reference|object|self|attribute|class|field|inheritance|内存|堆|引用|指向|对象|属性|字段|继承/.test(
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

export function normalizeCsRoute(value: unknown, fallbackText: string): HtmlCsRoute {
  if (typeof value === 'string' && CS_ROUTE_SET.has(value as HtmlCsRoute)) {
    return value as HtmlCsRoute;
  }
  return inferCsRouteFromText(fallbackText);
}

export function inferMathRouteFromText(value: string, pageKind?: HtmlPageKind): HtmlMathRoute {
  const text = value.toLowerCase();
  if (/proof|prove|证明|证毕|证明目标/.test(text)) return 'proof';
  if (/derivation|derive|推导|化简|求导过程|递推|等价变形/.test(text)) return 'derivation';
  if (
    pageKind === 'example' ||
    /worked example|example|solve|problem|例题|求解|计算|答案/.test(text)
  ) {
    return 'worked-example';
  }
  if (/definition|theorem|lemma|proposition|定义|定理|引理|命题/.test(text)) {
    return 'definition-theorem';
  }
  if (/formula|equation|identity|公式|方程|恒等式|核心公式/.test(text)) return 'formula-focus';
  if (/concept map|relationship|关系|图谱|概念图/.test(text)) return 'concept-map';
  if (/compare|table|condition|case|判别|分类|条件|表格|对比/.test(text)) {
    return 'comparison-table';
  }
  return pageKind === 'math' ? 'formula-focus' : 'standard';
}

export function normalizeMathRoute(
  value: unknown,
  fallbackText: string,
  pageKind?: HtmlPageKind,
): HtmlMathRoute {
  if (typeof value === 'string' && MATH_ROUTE_SET.has(value as HtmlMathRoute)) {
    return value as HtmlMathRoute;
  }
  return inferMathRouteFromText(fallbackText, pageKind);
}

export function normalizeDensity(value: unknown): DensityLevel {
  if (typeof value === 'string' && DENSITY_SET.has(value as DensityLevel)) {
    return value as DensityLevel;
  }
  return 'standard';
}

export function normalizeCanvasHeight(
  value: unknown,
  canvasMode: HtmlCanvasMode,
  density: DensityLevel,
): number {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : 0;
  if (canvasMode === 'slide') return 900;
  if (canvasMode === 'tall') {
    const fallback = density === 'dense' ? 1400 : 1200;
    const height = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    return Math.min(1600, Math.max(1050, Math.round(height)));
  }
  const fallback = density === 'dense' ? 2400 : density === 'standard' ? 2200 : 1800;
  const height = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return Math.min(3200, Math.max(1600, Math.round(height)));
}

export function inferCanvasModeFromSlide(args: {
  value: unknown;
  pageKind: HtmlPageKind;
  courseRoute: HtmlCourseRoute;
  csRoute?: HtmlCsRoute;
  mathRoute?: HtmlMathRoute;
  density: DensityLevel;
  text: string;
}): HtmlCanvasMode {
  if (args.value === 'long') return 'long';
  if (args.value === 'tall') return 'tall';
  if (args.value === 'slide') return 'slide';
  if (args.pageKind === 'cover' || args.pageKind === 'intro') {
    return 'slide';
  }
  const text = args.text.toLowerCase();
  const hasLongSignal =
    /长页|长页面|完整证明|长证明|完整推导|长推导|逐步推导|多步推导|完整代码|代码题|逐行追踪|memory trace|execution trace|call stack|heap|stack|pointer|recursion|proof walkthrough|derivation ladder/i.test(
      args.text,
    );
  if (
    args.courseRoute === 'math' &&
    (args.mathRoute === 'proof' || args.mathRoute === 'derivation') &&
    (args.density === 'dense' || hasLongSignal)
  ) {
    return 'long';
  }
  if (
    args.courseRoute === 'math' &&
    (args.mathRoute === 'proof' ||
      args.mathRoute === 'derivation' ||
      args.mathRoute === 'worked-example' ||
      args.mathRoute === 'formula-focus' ||
      args.mathRoute === 'comparison-table')
  ) {
    return 'tall';
  }
  if (
    args.courseRoute === 'computer-science' &&
    args.csRoute &&
    args.csRoute !== 'standard' &&
    (args.density === 'dense' || hasLongSignal || /trace|diagram|stack|heap/.test(text))
  ) {
    return 'long';
  }
  if (args.courseRoute === 'computer-science' && args.csRoute && args.csRoute !== 'standard') {
    return 'tall';
  }
  if (
    args.density === 'dense' ||
    ((args.pageKind === 'process' || args.pageKind === 'table' || args.pageKind === 'example') &&
      /步骤|例题|拆解|推导|读图|图表|矩阵|代码|过程|对比|检查/.test(args.text))
  ) {
    return 'tall';
  }
  return 'slide';
}

export function normalizeSourceUsage(value: unknown): LessonSlidePlan['sourceUsage'] {
  if (typeof value === 'string' && SOURCE_USAGE_SET.has(value as LessonSlidePlan['sourceUsage'])) {
    return value as LessonSlidePlan['sourceUsage'];
  }
  return 'synthesis';
}

export function sanitizeHtmlPromptForCourseRoute(
  prompt: string,
  courseRoute: HtmlCourseRoute,
  csRoute?: HtmlCsRoute,
  mathRoute?: HtmlMathRoute,
): string {
  let next = prompt
    .replace(
      /课程路线[:：]\s*(?:general|math|computer-science|science|business|humanities|social-science|通用|数学|计算机科学|自然科学|商科经济|人文|社科|社会科学)/gi,
      `课程路线：${courseRoute}`,
    )
    .replace(
      /Course route[:：]\s*(?:general|math|computer-science|science|business|humanities|social-science)/gi,
      `Course route: ${courseRoute}`,
    );

  if (courseRoute === 'computer-science') {
    next = next.replace(/CS\s*版式[:：][^\n。]*/gi, `CS 版式：${csRoute || 'standard'}`);
  } else {
    next = next
      .split('\n')
      .filter(
        (line) =>
          !/CS\s*版式|Execution Trace|Memory Diagram|Call Stack|Pointer Diagram|Tree\s*\/\s*BST|Graph Trace|frontier\s*\+\s*visited|Linear Structure|Dictionary Diagram|Invariant Check|Composite Operation/i.test(
            line,
          ),
      )
      .join('\n');
  }

  if (courseRoute === 'math') {
    next = next.replace(/数学版式[:：][^\n。]*/gi, `数学版式：${mathRoute || 'standard'}`);
  } else {
    next = next
      .split('\n')
      .filter(
        (line) =>
          !/数学版式|Definition\s*\/\s*Theorem|Formula Focus|Derivation Ladder|Proof Walkthrough|Worked Example|Concept Map|Comparison\s*\/\s*Case Table/i.test(
            line,
          ),
      )
      .join('\n');
  }

  return next.replace(/\n{3,}/g, '\n\n').trim();
}
