import type {
  HtmlCodeRoute,
  HtmlCourseRoute,
  HtmlCsRoute,
  HtmlMathRoute,
  RequestBody,
} from './types';

export function promptNeedsMath(prompt: string): boolean {
  return /mathml|math notation|equation|formula|derivation|calculus|matrix|probability|bayes|latex|公式|数学|方程|推导|矩阵|概率|微积分|线性代数/i.test(
    prompt,
  );
}

function inferCourseRouteFromPrompt(prompt: string): HtmlCourseRoute {
  if (
    promptNeedsMath(prompt) ||
    /证明|定理|命题|导数|积分|极限|函数|几何|代数|统计|概率/i.test(prompt)
  ) {
    return 'math';
  }
  if (
    /code|python|javascript|typescript|java|class|object|oop|heap|stack|memory|trace|algorithm|array|list|dict|tree|graph|代码|编程|程序|算法|函数调用|调用栈|内存|堆|栈|对象|属性|字段|链表|指针/i.test(
      prompt,
    )
  ) {
    return 'computer-science';
  }
  if (/physics|chemistry|biology|实验|物理|化学|生物|细胞|力学|电路|生态|科学/i.test(prompt)) {
    return 'science';
  }
  if (
    /business|finance|economics|market|revenue|cost|profit|roi|商业|财务|经济|市场|营收|成本|利润|盈亏|定价/i.test(
      prompt,
    )
  ) {
    return 'business';
  }
  if (
    /history|literature|philosophy|textual|source|argument|历史|文学|哲学|文本|史料|论证|修辞/i.test(
      prompt,
    )
  ) {
    return 'humanities';
  }
  if (
    /policy|society|sociology|psychology|geography|case study|政策|社会|心理|地理|案例/i.test(
      prompt,
    )
  ) {
    return 'social-science';
  }
  return 'general';
}

export function normalizeCourseRoute(value: unknown, prompt: string): HtmlCourseRoute {
  if (value === 'math') return 'math';
  if (value === 'computer-science' || value === 'computer_science' || value === 'cs') {
    return 'computer-science';
  }
  if (value === 'science') return 'science';
  if (value === 'business') return 'business';
  if (value === 'humanities') return 'humanities';
  if (value === 'social-science' || value === 'social_science') return 'social-science';
  if (value === 'general') return 'general';
  return inferCourseRouteFromPrompt(prompt);
}

export function normalizeCsRoute(
  value: unknown,
  codeRoute: HtmlCodeRoute | undefined,
  prompt: string,
): HtmlCsRoute {
  const allowed = new Set<HtmlCsRoute>([
    'standard',
    'execution-trace',
    'memory-diagram',
    'call-stack',
    'pointer-diagram',
    'tree-diagram',
    'graph-trace',
    'linear-structure',
    'dictionary-diagram',
    'invariant-check',
    'composite-operation',
  ]);
  if (typeof value === 'string' && allowed.has(value as HtmlCsRoute)) {
    return value as HtmlCsRoute;
  }
  if (codeRoute === 'memory-trace') return 'memory-diagram';
  if (codeRoute === 'execution-trace') return 'execution-trace';

  const text = prompt.toLowerCase();
  const hasPointer =
    /linked\s*list|doubly|pointer|node|prev|next|front|链表|节点|指针|前驱|后继/.test(text);
  const hasInvariant = /invariant|合法|不变量|结构承诺|size|ordering|connectivity/.test(text);
  if (hasPointer && hasInvariant) return 'composite-operation';
  if (/graph|bfs|dfs|frontier|visited|neighbor|queue.*visited|图搜索|广度|深度|邻居/.test(text)) {
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

export function normalizeMathRoute(
  value: unknown,
  prompt: string,
  pageKind: string | undefined,
): HtmlMathRoute {
  const allowed = new Set<HtmlMathRoute>([
    'standard',
    'definition-theorem',
    'formula-focus',
    'derivation',
    'proof',
    'worked-example',
    'concept-map',
    'comparison-table',
  ]);
  if (typeof value === 'string' && allowed.has(value as HtmlMathRoute)) {
    return value as HtmlMathRoute;
  }

  const text = prompt.toLowerCase();
  if (/proof|prove|证明|证毕|命题.*证明|证明目标/.test(text)) return 'proof';
  if (/derivation|derive|step|推导|化简|求导过程|递推|等价变形/.test(text)) {
    return 'derivation';
  }
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

export function pageKindContract(
  pageKind: string | undefined,
  canvasMode: 'slide' | 'tall' | 'long' = 'slide',
): string {
  const isLongCanvas = canvasMode === 'long';
  switch (pageKind) {
    case 'cover':
      return [
        '- 页面类型：封面页。',
        '- 封面页是整节课 / 整本 notebook 的第一页，只负责建立主题识别，不展开正文教学。',
        '- 主标题是唯一必须文字；除主标题外，最多保留 1 行极短副标题/元信息，拥挤时全部删掉。',
        '- 禁止显示“notebook 封面”“封面页”“cover”“主视觉”“背景”“background”等占位或说明文字。',
        '- 封面页必须是 full-bleed 主视觉：优先且必须使用本地 /slide-backgrounds/ 背景图片铺满整张 1600×900 画布，主标题直接叠在主视觉上。',
        '- 不要只用纯色、纯渐变或空的 CSS 装饰冒充封面主视觉；科技/电影/学术封面必须能看到内置图片纹理。',
        '- 不要把标题放进居中的大卡片、半透明面板、glass panel、title card、内容盒子或正文卡片里。',
        '- 封面页的重点是选对背景/主视觉：可以使用 CSS 渐变/数据网络/电影感光影/学术几何，也可以使用本地内置背景图片。',
        '- 如果 prompt 包含 tech_hero_title，优先使用 /slide-backgrounds/dark-tech-neural.png 或 /slide-backgrounds/product-launch-dark-photo.png。',
        '- 如果 prompt 包含 cinematic_title_frame，优先使用 /slide-backgrounds/cinematic-stage-photo.png。',
        '- 如果 prompt 包含 academic_hero_cover，优先使用 /slide-backgrounds/academic-blueprint-photo.png。',
        '- 如果 prompt 包含 image_title_overlay，优先使用 /slide-backgrounds/lecture-hall-photo.png。',
        '- 封面页可以有更强视觉重心，但仍然必须是可编辑 HTML/CSS PPT，不是网页 landing page，也不是整页不可编辑海报截图。',
        '- 不要加入推导、证明、代码、题目答案、流程步骤、完整目录、长段落或大表格。',
        '- 如果提供了 AI 插图素材，封面主视觉应只使用该插图；文字仍然必须是可编辑 DOM 文本。',
        '- 封面页文字应克制：标题大，其他字很少；总可见文字建议 20-120 个中文/等价字符，文本块最多 2 个。',
        '- 封面应在第一屏完整可见，并隐约暗示下一页会进入的课程主题；不要只剩空背景和一个小标题。',
      ].join('\n');
    case 'intro':
      return [
        '- 页面类型：介绍页。',
        '- 生成简洁开场页：清晰标题、一句短定位、3-4 个具体入口/价值模块。',
        '- 介绍页只负责引发兴趣和建立入口，不要提前展开完整讲解。',
        '- 每个入口模块最多保留标题和一个极短解释句；不要添加模块底部说明、项目符号、第二层小标题或逐卡 CSS 插图。',
        '- 如果入口模块文字很短，必须使用紧凑横向短卡、短条或标签组；不要生成 200px 以上高度的大空白卡片来填版面。',
        '- 整体视觉尺度要像 PPT 封面/导入页，不像网页 hero：H1 建议 56-72px，模块标题 26-32px，正文 24-28px，卡片 padding 24-36px。',
        '- 如果版式整体偏满，可以在 .slide-content 内包一层 .fit-layer，用 width/height:calc(100% / .92) 配合 transform:scale(.92); transform-origin:top left，让内部先获得更大布局空间再缩回可视区域；不要缩放 .slide，也不要用超大容器再裁切。',
        '- 如果提供了 AI 插图素材，主视觉必须只使用该插图；入口模块不要再手绘小图、速度表、曲线或复杂图标。',
        '- 底部引导问题应是单条横向问题条，不能挤压或覆盖入口模块。',
        '- 不要做成营销落地页或巨大 hero，必须像可直接放进课程/产品介绍的 PPT 页面。',
        '- 不要添加公式、证明、代码、题目解答或与导入主题无关的 QA 面板。',
      ].join('\n');
    case 'summary':
      return [
        '- 页面类型：总结页。',
        '- 生成克制的总结板，只允许这些区域：标题区、一个可选紧凑核心指标、清单/takeaway、一个收束判断条。',
        '- 如果 prompt 或标题指定了明确数量，例如“5 个问题”“4 条结论”，必须逐字满足该数量；没有明确数量时默认 3 条 takeaway。',
        '- 每条 takeaway/问题只能包含短标题和一句短解释，保证可读和完整显示。',
        '- 不要添加“含义/影响/建议/下一步/三角度分析/运营解读”等额外面板，也不要把受众转写成额外内容区。',
        '- 不要嵌套多层卡片、图标列表或右侧 dashboard；总结页应该像复盘结论页，不是仪表盘。',
        '- 避免长段落，总可见文字应明显少于 dense 页面，优先删掉解释性副文本。',
        '- takeaway 卡片必须是短卡片或紧凑横条，高度建议 120-170px；不要生成 200px 以上的大空卡。',
        '- 如果每条 takeaway 只有两行文字，就把卡片高度压缩，不要拉伸填满整页。',
        '- 不要靠小字号制造精致感；除极少数装饰标签外，所有可读文字应不低于 22px，takeaway 正文建议 24px 以上。',
        '- 除非用户明确要求数学总结，否则不要使用 MathML、公式卡或题目解答。',
      ].join('\n');
    case 'process':
      return [
        '- 页面类型：流程页。',
        '- 页面只能包含：标题区、4-5 个流程步骤、一个可选风险/检查提示条。',
        '- 展示 4-5 步流程：方向明确，步骤标签短，每步有一个输出或检查点。',
        '- 主流程区必须紧跟标题区，不能在标题和流程之间留大片空白。',
        '- 每步只允许短标题 + 动作短句 + 一个输出/检查点短句；不要把步骤扩写成段落说明。',
        '- 步骤标题字号不低于 30px，步骤正文不低于 24px；只有编号、eyebrow 和状态标签可以更小。',
        '- 流程轨道必须占据页面中部主要视觉区域，不能只是几张小卡片漂在空白背景上。',
        '- 如果横向排列 5 个步骤，.slide-content 内宽约 1472px，5 张卡片 + 4 个连接器总宽必须小于等于 1440px。',
        '- 横向流程建议每张步骤卡 220-235px、连接器 28-40px；不要写 260px 70px 260px 这种总宽超过内宽的固定列。',
        '- 流程关系要一眼可见，不要只用表格作为唯一结构。',
        '- 流程步骤卡片或节点必须高度紧凑，不要生成大空卡；如果只有两行文字就压缩高度。',
        '- 不要使用负 margin、负 top/left/right/bottom 或 transform translate 来居中箭头/装饰。',
        '- 严禁加入 prompt 没要求的公式、MathML、例题、证明、代码、不可做题目或额外 QA 面板。',
        '- 页面只能围绕这一个流程展开：步骤、输入/输出、检查点、风险提示。不要生成第二个主题区。',
      ].join('\n');
    case 'table':
      return [
        '- 页面类型：表格页。',
        '- 页面只能包含：标题区、一个真实 HTML <table>、一句短阅读规则或结论。',
        '- 必须包含一个紧凑、可编辑的 HTML <table>，3-5 列，3-6 行正文。',
        '- 不要用 div/card/grid 伪造表格；必须使用 table、thead、tbody、tr、th、td。',
        '- 只允许一张表，不要额外添加指标卡、图例、流程卡、第二张表或右侧解释面板。',
        '- 每个单元格都要短，数字对齐清楚，并加一句简洁阅读规则或结论。',
        '- 表格必须完整落在 1600×900 内；如果内容多，缩短单元格文字，而不是缩小到难读字号。',
        '- 除非用户明确要求公式表，否则不要使用 MathML 或另起公式/证明区域。',
      ].join('\n');
    case 'math':
      if (isLongCanvas) {
        return [
          '- 页面类型：长数学证明 / 长推导页。',
          '- 页面应使用 4-7 个纵向 section 展开：命题/定义、证明目标、关键定理、符号判断、结论、检查点。',
          '- 核心公式必须使用真实原生 MathML，通常 5-10 个 <math> 块；不要用纯文本、TeX 字符串、图片、SVG 或 canvas 代替。',
          '- 每个公式卡要有短标题和一句解释，公式字号建议 22-26px；长公式拆成两行短公式，不要横向撑破。',
          '- 证明步骤必须按逻辑顺序自然展开，不能放进内部滚动框，也不能用裁切隐藏底部内容。',
          '- 不要使用 <mspace>，不要用大空白撑版。',
        ].join('\n');
      }
      return [
        '- 页面类型：数学页。',
        '- 页面只能包含：标题区、核心公式/定义区、紧凑推导或对比区、一个例题/提醒区。',
        '- 核心公式必须使用真实原生 MathML，总共 3-7 个 <math> 块。',
        '- 主要公式不能用纯文本、TeX 字符串、图片、SVG 或 canvas 代替。',
        '- 文字说明放在公式块外；可以用公式卡、紧凑推导或紧凑表格，但不能溢出。',
        '- 公式卡片最多 3 个；推导行最多 4 行；长公式必须拆成短行，不能横向撑破。',
        '- 如果 prompt 要求“定义卡/术语卡/小例子/结论”等多个块，必须全部可见；使用紧凑 2×2 grid 或上下两行 flow，不要让底部例子覆盖上方定义卡。',
        '- MathML 符号必须精确：复合函数用 <mo>∘</mo> 或可见字符 ∘，笛卡尔积用 <mo>×</mo> 或可见字符 ×，逆像用 <msup> 或清晰的 f^{-1}。',
        '- 每个公式容器必须给足 line-height 和 padding；不要让 <math> 或其子元素被自己的卡片高度裁掉。',
        '- 不要使用 <mspace>，不要用大空白撑版。',
      ].join('\n');
    case 'code':
      if (isLongCanvas) {
        return [
          '- 页面类型：长代码题 / 长代码讲解页。',
          '- 页面应使用 5-7 个纵向 section 展开：题目、函数目标、关键代码、状态追踪、常见错误、最终答案/检查。',
          '- 必须包含一个可编辑的 <pre><code> 关键代码块，长页最多 24 行；代码必须完整可读，不能横向溢出。',
          '- 状态追踪应使用真实 HTML table 或清晰步骤卡，保留关键变量变化；不要把 trace 塞进内部滚动框。',
          '- 长代码页可以比单屏代码页更完整，但仍要分段讲解；不要生成博客长文、完整教程或第二个教学主题。',
          '- 不要加入无关数学公式、MathML、无关例题或源页没有的复杂 class。',
        ].join('\n');
      }
      return [
        '- 页面类型：代码 / 代码追踪页。',
        '- 页面只能包含：标题区、一个关键代码块、一个解释/trace/state 区；最多再加一句短结论。',
        '- 必须包含一个可编辑的 <pre><code> 关键代码块，代码最多 12 行，且只展示源页最关键片段。',
        '- trace/state 区是可选的；如果使用，最多 3 步，每步一行状态，不要生成长步骤列表。',
        '- 代码必须可读且不能造成页面横向溢出；删掉无关行，不要靠无限缩小字号解决。',
        '- 如果代码块超过 12 行，优先省略非关键行并用一行注释说明，不要让 pre 变成超高容器。',
        '- 代码和 trace 必须对应同一个输入；不要补写源页没有的完整 class、完整运行结果或完整教程。',
        '- 不要加入数学公式、MathML、无关例题或第二个教学主题。',
      ].join('\n');
    case 'example':
      return [
        '- 页面类型：例子 / 反例 / 例题页。',
        '- 先判断源页是不是明确的题目：只有源页真的要求求解/证明/计算时，才使用“题目-已知-步骤-答案”结构。',
        '- 如果源页只是一个例子或反例，页面只能包含：一个具体例子、2-3 个观察点、一句结论/风险；不要改造成练习题。',
        '- 如果确实是题目，最多 3 个求解步骤；已知条件、步骤、答案必须互相对应，关键数字必须完整可见。',
        '- 如果 prompt 要求给出“短理由”“检查点”“结论”，这些内容必须在对应卡片里完整显示；不要只放结果而留下大空卡。',
        '- 结果卡如果内容很少，应压缩高度或加入 prompt 指定的理由/观察点；不要生成占半页的大空白卡。',
        '- 不要额外添加第二道题、背景故事、营销说明、多个公式区、长步骤表或无关图表。',
        '- 只生成 prompt 指定的例子/题目，不要额外添加无关公式、证明或第二个教学主题。',
      ].join('\n');
    default:
      return '';
  }
}

export function codeRouteContract(
  codeRoute: RequestBody['codeRoute'],
  canvasMode: 'slide' | 'tall' | 'long',
): string {
  if (codeRoute === 'memory-trace') {
    return [
      '- 代码线路：Memory Trace / 内存追踪。',
      '- 这类页面不要只生成普通代码块或普通 trace 表；必须复用“代码 + 当前动作 + 调用栈 + 堆对象 + 引用关系”的视觉语法。',
      '- 必须有一个清晰的 memory trace 区：左侧/上方显示当前执行代码或关键代码片段，右侧/下方显示 stack/call stack 与 heap。',
      '- 调用栈区域必须展示变量名和值/引用，例如 a -> list#1、self -> obj#1；堆区域必须展示对象卡片和字段/元素。',
      '- 如果主题是 OOP，heap object 必须展示属性/字段；如果主题是 list/dict/aliasing，heap object 必须展示元素或键值。',
      '- 用 CSS/DOM 画引用关系即可：可用箭头符号、连接线、ref pill、色块高亮；不要使用 SVG/canvas，不要用图片截图。',
      '- 页面应有 3-4 个 step tab 或 current action 标签；如果不是长页，只展开当前关键步骤，不要把全部步骤纵向摊开。',
      canvasMode === 'long'
        ? '- 长页可以纵向展开 4-6 个 memory snapshot section，但每个 snapshot 都必须包含 stack 与 heap，不要退化成段落解释。'
        : canvasMode === 'tall'
          ? '- 中高页可以纵向展开 2-3 个 memory snapshot section，但每个 snapshot 都必须包含 stack 与 heap，不要退化成段落解释。'
          : '- 16:9 页面推荐布局：标题区 + compact code strip + memory snapshot 主区 + 一句检查结论。',
      '- 可见文字必须是简体中文；保留必要的变量名、类名、方法名和 Python 关键字。',
    ].join('\n');
  }

  if (codeRoute === 'execution-trace') {
    return [
      '- 代码线路：Execution Trace / 执行状态追踪。',
      '- 页面必须同时有关键代码和状态变化，不要只生成孤立代码块。',
      '- trace 区优先使用真实 HTML table 或 3-5 个状态行，列出当前行、读取的值、变量变化、下一步决定。',
      '- 代码和 trace 必须对应同一个输入；不要补写无关完整教程。',
    ].join('\n');
  }

  return '';
}

export function csRouteContract(
  csRoute: HtmlCsRoute,
  canvasMode: 'slide' | 'tall' | 'long',
): string {
  const longPageNote =
    canvasMode === 'long'
      ? '- 长页可以纵向展示多个状态快照，但每个 section 都必须是同一种 CS 语义，不要混成讲义长文。'
      : canvasMode === 'tall'
        ? '- 中高页可以展示 2-4 个关键状态或结构块，但仍要保持同一种 CS 语义和正常文档流。'
        : '- 16:9 页面只展开一个关键状态或 3-5 个短步骤；不要把完整教程塞进一页。';

  switch (csRoute) {
    case 'execution-trace':
      return [
        '- CS 版式：Execution Trace / 代码执行追踪。',
        '- 必须同时出现关键代码和状态变化；状态区要列当前行、读到的值、变量变化、下一步决定。',
        '- 适合循环、条件分支、算法执行；不要画 heap/object 关系来分散注意力。',
        longPageNote,
      ].join('\n');
    case 'memory-diagram':
      return [
        '- CS 版式：Memory Diagram / Stack + Heap + References。',
        '- 必须区分 stack/call stack 里的名字和 heap 里的对象；对象要有 id，例如 list#1、obj#1。',
        '- OOP 页面要显示 self 当前引用、属性字段和写入后的字段值；aliasing 页面要显示多个名字指向同一个对象。',
        '- 用 DOM 卡片、ref pill、箭头符号或连接线表达引用；不要退化成普通 bullet 或纯表格。',
        longPageNote,
      ].join('\n');
    case 'call-stack':
      return [
        '- CS 版式：Call Stack / 递归调用栈。',
        '- 必须展示多个 frame，标出当前运行 frame、等待中的 frame、参数、局部变量和返回值流向。',
        '- 适合递归、函数调用、base case；不要只写“函数调用自己”的概念总结。',
        longPageNote,
      ].join('\n');
    case 'pointer-diagram':
      return [
        '- CS 版式：Pointer Diagram / 链表指针图。',
        '- 必须展示节点卡片和指针字段，例如 item、next、prev；显示 front/curr/prev/new_node 等名字指向哪里。',
        '- 如果是链表操作，必须展示改指针前后的关键关系；不要只用代码块或列表总结。',
        longPageNote,
      ].join('\n');
    case 'tree-diagram':
      return [
        '- CS 版式：Tree / BST Diagram。',
        '- 必须展示树节点、父子关系、当前节点和选择路径；BST 要显式标出左小右大或搜索方向判断。',
        '- 普通树和 BST 不能混讲：普通树强调 traversal rule，BST 强调 order invariant。',
        longPageNote,
      ].join('\n');
    case 'graph-trace':
      return [
        '- CS 版式：Graph Trace / frontier + visited。',
        '- 必须展示 graph 节点/边、frontier、visited、当前处理节点和下一步选择规则。',
        '- BFS 用 queue 语义，DFS 用 stack/call stack 语义；不要只给最终访问顺序。',
        longPageNote,
      ].join('\n');
    case 'linear-structure':
      return [
        '- CS 版式：Linear Structure / Stack or Queue。',
        '- 必须展示 active end：stack 的 top，queue 的 front/back。',
        '- 操作必须对应 push/pop 或 enqueue/dequeue，并展示操作后的结构快照。',
        longPageNote,
      ].join('\n');
    case 'dictionary-diagram':
      return [
        '- CS 版式：Dictionary Diagram / key-value 映射。',
        '- 必须展示 key 到 value 的映射、lookup/update/insert 动作和变化后的 entry。',
        '- 如果有代码，代码只保留触发 mutation 的关键行；核心视觉是映射变化，不是普通 trace 表。',
        longPageNote,
      ].join('\n');
    case 'invariant-check':
      return [
        '- CS 版式：Invariant Check / 结构合法性检查。',
        '- 必须列出结构承诺、当前操作后状态、逐条检查结果和最终是否合法。',
        '- 适合 size、ordering、connectivity、front/back、parent-child 等规则；不要只写泛泛“注意事项”。',
        longPageNote,
      ].join('\n');
    case 'composite-operation':
      return [
        '- CS 版式：Composite Operation / 综合操作页。',
        '- 只允许组合最多三块：关键代码、结构快照、invariant 检查。',
        '- 适合链表删除/插入、树旋转、dictionary 统计等操作；每块必须对应同一个操作瞬间。',
        '- 如果内容太多，优先删解释文字，保留代码行、结构状态和检查结果。',
        longPageNote,
      ].join('\n');
    case 'standard':
    default:
      return [
        '- CS 版式：Standard / 标准课程页。',
        '- 使用标准 intro/concept/summary/process/table/example 页面结构；不要强行生成 trace 或 diagram。',
        '- 即使是标准页，也要从具体输入、对象、错误场景或写代码前问题切入，避免纯术语堆叠。',
      ].join('\n');
  }
}

export function mathRouteContract(
  mathRoute: HtmlMathRoute,
  canvasMode: 'slide' | 'tall' | 'long',
): string {
  const longPageNote =
    canvasMode === 'long'
      ? '- 长页可以纵向展开完整证明/推导，但要分成清楚 section，不要变成普通网页文章。'
      : canvasMode === 'tall'
        ? '- 中高页可以展开一个稍长的定义/推导/例题动作，但要保留课件块状结构和正常文档流。'
        : '- 16:9 页面只保留一个数学动作；公式、条件和结论都必须在一屏内完整可见。';

  switch (mathRoute) {
    case 'definition-theorem':
      return [
        '- 数学版式：Definition / Theorem Board。',
        '- QA 必须能识别：页面可见文字里要出现“定义/定理/对象/符号”“条件/假设”“结论/读法/例子/检查”这些结构信号。',
        '- 必须区分定义/定理文本、条件、结论、一个短例子或检查问题。',
        '- 至少包含 1 个真实 MathML 公式或符号块；不要只用普通文字伪装数学。',
        '- 适合引入新对象、新判定、新命题；不要把它做成泛泛卡片列表。',
        '- 定义页必须保留源材料的标准对象和符号：对象是什么、条件是什么、结论/读法是什么、如何用一个小例子检查。',
        '- 不要自行改名核心符号，也不要引入源材料没有的新记号来显得更数学。',
        longPageNote,
      ].join('\n');
    case 'formula-focus':
      return [
        '- 数学版式：Formula Focus / 核心公式页。',
        '- QA 必须能识别：页面有一个主 MathML 公式，并有“符号/含义/条件/使用”解释区。',
        '- 必须突出一个主公式，配 2-3 个符号解释和一个使用条件；主公式必须使用 MathML。',
        '- 不要堆很多同级公式；如果公式多，选最核心的一条，其余做短注释。',
        longPageNote,
      ].join('\n');
    case 'derivation':
      return [
        '- 数学版式：Derivation Ladder / 推导阶梯。',
        '- QA 必须能识别：至少 3 行 MathML 推导、2 个以上步骤信号，以及“因为/由/代入/得到/所以/化简”等每步理由。',
        '- 必须用 3-5 行推导展示从起点到结论的变形；每行只做一个数学动作。',
        '- 每一步要有短理由，例如“代入定义”“两边同除”“使用链式法则”。',
        longPageNote,
      ].join('\n');
    case 'proof':
      return [
        '- 数学版式：Proof Walkthrough / 证明讲解。',
        '- QA 必须能识别：页面有“证明目标/要证”“假设/条件”“构造/关键判断”“结论/证毕”等结构信号。',
        '- 必须展示证明目标、假设/条件、关键定理或构造、符号判断、结论。',
        '- 不要把证明压成一句结论；也不要把所有细节塞成小字长文。',
        longPageNote,
      ].join('\n');
    case 'worked-example':
      return [
        '- 数学版式：Worked Example / 例题拆解。',
        '- QA 必须能识别：页面有“题干/问题/已知”、至少 2 个求解步骤，以及“答案/结果/检查”。',
        '- 必须包含题干、已知条件、最多 3-4 个求解步骤、答案/检查。',
        '- 至少包含 2 个真实 MathML 公式或符号块；数字、条件、步骤和答案必须互相对应。',
        '- 数字、条件、公式和最终答案必须互相对应；不能只给方法总结。',
        '- 例题必须可逐项检查：给出输入对象、适用规则、关键判断、最终结论和一个短检查。',
        '- 如果为了容量替换源例子，必须选小而等价的例子，并明确保留同一个数学概念和验证动作。',
        longPageNote,
      ].join('\n');
    case 'concept-map':
      return [
        '- 数学版式：Concept Map / 概念关系图。',
        '- QA 必须能识别：页面有数学概念节点和关系边，例如“定义/条件/结论/例子”与“推出/对应/包含/关系”。',
        '- 必须展示概念节点和关系边，例如定义 -> 条件 -> 结论 -> 例子。',
        '- 使用 DOM 卡片/连线/箭头即可；不要用 SVG/canvas，也不要让关系图越界。',
        longPageNote,
      ].join('\n');
    case 'comparison-table':
      return [
        '- 数学版式：Comparison / Case Table。',
        '- QA 必须能识别：必须使用真实 HTML table，并出现“条件/适用/场景/结论/反例/比较”等对比维度。',
        '- 必须使用真实 HTML table 或紧凑对比矩阵，比较条件、适用场景、结论。',
        '- 适合判别法、分情况、定义对比；不要额外加入大公式区挤压表格。',
        longPageNote,
      ].join('\n');
    case 'standard':
    default:
      return [
        '- 数学版式：Standard / 标准数学课程页。',
        '- 使用标准介绍、总结、流程、表格或例题结构；只有需要公式/证明/推导时才启用专属数学版式。',
      ].join('\n');
  }
}

export function courseRouteContract(
  courseRoute: HtmlCourseRoute,
  {
    pageKind,
    codeRoute,
    csRoute,
    mathRoute,
    canvasMode,
  }: {
    pageKind?: string;
    codeRoute?: HtmlCodeRoute;
    csRoute: HtmlCsRoute;
    mathRoute: HtmlMathRoute;
    canvasMode: 'slide' | 'tall' | 'long';
  },
): string {
  const canvasNote =
    canvasMode === 'long'
      ? '- 这是长页面：可以纵向展开完整过程，但每个 section 仍要像课件板块，不要变成网页文章。'
      : canvasMode === 'tall'
        ? '- 这是中高课件页：可以比 16:9 多放 1-2 个正常文档流内容区，但仍要像课件板块，不要变成网页文章。'
        : '- 这是 16:9 单页：必须只选一个教学动作，删掉旁枝，不要把完整讲义压进一页。';

  if (courseRoute === 'math') {
    return [
      '- 课程路线：数学 / 定量推导。',
      '- 页面应像数学课堂课件：定义、命题、符号、推导、例题、检查点要按逻辑组织。',
      mathRoute === 'standard'
        ? '- 当前是数学标准页：可以使用介绍、总结、流程、表格或概念页结构，不要强行塞公式。'
        : `- 当前启用数学专属版式：${mathRoute}。必须按该数学动作组织页面。`,
      '- 不要把数学内容做成通用 dashboard、营销 hero 或只有卡片标签的概览页。',
      '- 核心公式、证明目标、关键等式必须明确可见；重要公式优先使用 MathML。',
      '- 先从 prompt/source anchors 中识别本页的标准数学对象、符号、表示法和验证动作，再选择结构；不要把数学内容做成抽象 AI 插图、装饰波纹图或图片占位。',
      '- 数学记号必须跟随 prompt/source anchors。不要自行发明新符号、改名核心对象，或把一个对象误写成另一个带下标/上标的对象。',
      '- 示例必须数学上可验证：给出输入对象、适用规则、候选项/步骤、以及为什么成立或不成立。不要用随意图标、空泛标签或只给答案。',
      '- 可以为了容量换成更短的等价例子，但不能改变概念、条件、结论或证明动作。',
      pageKind === 'example' ? '- 数学例题必须可做：题干、已知、步骤、答案/检查要互相对应。' : '',
      canvasNote,
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (courseRoute === 'computer-science') {
    return [
      '- 课程路线：计算机科学 / 编程。',
      '- 页面应围绕代码对象、执行状态、数据结构、内存关系或输入输出，而不是通用概念卡片。',
      '- 保留必要英文代码标识：变量名、类名、函数名、关键字、文件名不要翻译；周围解释必须是简体中文。',
      csRoute === 'standard'
        ? '- 当前是 CS 标准页：可以使用介绍、概念、总结、表格、流程或例题结构，不要强行生成 trace/diagram。'
        : `- 当前启用 CS 专属版式：${csRoute}。必须按该语义组织页面。`,
      '- 如果是代码页，优先使用“代码 + 状态/内存/对象关系”的结构；不要生成纯文字总结或泛泛流程图。',
      codeRoute === 'memory-trace'
        ? '- 本页是 memory trace：必须展示 stack/heap/reference/object field 这些可编辑 DOM 结构。'
        : '',
      codeRoute === 'execution-trace'
        ? '- 本页是 execution trace：必须展示关键代码与变量状态变化，状态行不能和代码脱节。'
        : '',
      '- OOP/属性/引用适合 memory-diagram；linked list 适合 pointer-diagram；tree/BST 适合 tree-diagram；BFS/DFS 适合 graph-trace；stack/queue 适合 linear-structure；dictionary 适合 dictionary-diagram。',
      '- 不要补写无关完整程序、完整教程或源页没有的大段代码。',
      canvasNote,
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (courseRoute === 'science') {
    return [
      '- 课程路线：自然科学。',
      '- 页面应围绕现象、变量、机制、实验/证据、结论检查来组织。',
      '- 适合使用可编辑 DOM 图示、变量表、实验条件表或因果链；不要做成商业指标页。',
      '- 如果有公式或单位，必须完整显示条件、单位和结论，不要只放漂亮标签。',
      canvasNote,
    ].join('\n');
  }

  if (courseRoute === 'business') {
    return [
      '- 课程路线：商业 / 经济 / 管理。',
      '- 页面应围绕决策背景、关键数字、计算关系、对比矩阵或行动判断组织。',
      '- 数字、单位、前提和结论必须可见；不要伪造数学证明或代码 trace。',
      '- 例题可以使用更短的等价案例，但成本、收入、利润、阈值等关键量必须对应。',
      canvasNote,
    ].join('\n');
  }

  if (courseRoute === 'humanities') {
    return [
      '- 课程路线：人文 / 文本分析。',
      '- 页面应围绕文本片段、语境、主张、证据、解释和反思问题组织。',
      '- 引文要短，不能让一页变成长文章；不要套用 dashboard 或指标卡语言。',
      canvasNote,
    ].join('\n');
  }

  if (courseRoute === 'social-science') {
    return [
      '- 课程路线：社会科学。',
      '- 页面应围绕案例、主体、因素、证据、趋势或政策取舍组织。',
      '- 可以用对比表、因果图、案例卡，但必须保留变量/证据/结论关系。',
      '- 不要把社会科学内容做成泛泛鸡汤总结或纯商业 dashboard。',
      canvasNote,
    ].join('\n');
  }

  return [
    '- 课程路线：通用课程。',
    '- 根据内容选择最自然的教学结构；不要默认生成通用卡片堆叠。',
    canvasNote,
  ].join('\n');
}
