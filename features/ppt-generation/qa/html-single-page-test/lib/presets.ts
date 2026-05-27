import {
  DEFAULT_LONG_PAGE_HEIGHT,
  DEFAULT_SLIDE_HEIGHT,
  type DensityLevel,
  type DensityProfile,
  type HtmlCanvasMode,
  type HtmlSinglePagePreset,
} from './types';

export const DENSITY_PROFILES = {
  light: {
    level: 'light',
    label: '轻量导入',
    textChars: { min: 80, max: 220 },
    textBlocks: { min: 6, max: 18 },
    contentCoverage: { min: 0.32, max: 0.8 },
    smallTextThresholdPx: 24,
    maxSmallTextRatio: 0.12,
    guidance: '标题醒目，正文只保留必要入口，不能空成海报，也不能塞满说明。',
  },
  medium: {
    level: 'medium',
    label: '中等信息',
    textChars: { min: 120, max: 300 },
    textBlocks: { min: 8, max: 26 },
    contentCoverage: { min: 0.4, max: 0.82 },
    smallTextThresholdPx: 22,
    maxSmallTextRatio: 0.2,
    guidance: '适合总结、流程、例题；信息可扫读，每块只讲一个点。',
  },
  dense: {
    level: 'dense',
    label: '信息密集',
    textChars: { min: 150, max: 380 },
    textBlocks: { min: 12, max: 40 },
    contentCoverage: { min: 0.44, max: 0.84 },
    smallTextThresholdPx: 20,
    maxSmallTextRatio: 0.35,
    guidance: '适合表格、代码、公式页；允许更密，但必须靠结构承载，不能靠缩小字号硬塞。',
  },
  long: {
    level: 'long',
    label: '长页面讲解',
    textChars: { min: 480, max: 1200 },
    textBlocks: { min: 24, max: 90 },
    contentCoverage: { min: 0.42, max: 0.9 },
    smallTextThresholdPx: 20,
    maxSmallTextRatio: 0.36,
    guidance: '适合代码题、证明题、长推导；用纵向 section 承载完整过程，但宽度仍是 1600px。',
  },
} satisfies Record<DensityLevel, DensityProfile>;

export const PAGE_PRESETS: HtmlSinglePagePreset[] = [
  {
    id: 'cover-course',
    kind: 'cover',
    courseRoute: 'math',
    mathRoute: 'standard',
    label: '封面页',
    version: 1,
    description: '测试 notebook / 整节课封面页：只建立主题、定位和学习期待，不提前展开正文。',
    requiredSignal: '大标题 + 一句定位 + 2-3 个短标签 + 主视觉',
    densityProfile: {
      ...DENSITY_PROFILES.light,
      label: '封面轻量',
      textChars: { min: 60, max: 180 },
      textBlocks: { min: 5, max: 16 },
      contentCoverage: { min: 0.3, max: 0.72 },
      guidance: '封面要有主题门面和视觉重心，但不能变成正文介绍页或营销长 hero。',
    },
    requiredAnchors: ['函数与证明习惯', '从定义到可检查推理', '数学'],
    forbiddenAnchors: ['链式法则', '二分查找', '盈亏平衡', '题库', 'Memory Trace'],
    prompt: `生成一张 16:9 HTML/CSS PPT 风格的「封面页」。

课程路线：数学
数学版式：standard（标准封面页，不强行塞公式或证明）

主题：函数与证明习惯
受众：刚进入离散数学 / 高等数学证明训练的学生
目的：作为整本 notebook 的第一页，只建立主题、定位和学习期待
内容：
- 主标题：函数与证明习惯
- 副标题：从定义到可检查推理
- 课程标签：数学 · 证明入门 · 结构化思考
- 3 个短入口词：定义、反例、证明路线
- 一句很短的开场定位：先看清对象，再判断条件，最后写出结论
- 系统会提供一张 AI 配图；把它作为封面主视觉的一部分，但不要铺满整页
- 不要提前讲导数、链式法则、题目解答、完整目录或证明步骤
- 总可见文字控制在 70-150 个中文字符之间
- 主要可读文字字号不要低于 24px，主标题要有封面级视觉权重

风格：中文课程 notebook 封面，白底或浅色底，蓝绿强调，简洁、有主题感，可编辑 HTML/CSS。`,
  },
  {
    id: 'intro-course',
    kind: 'intro',
    courseRoute: 'math',
    mathRoute: 'standard',
    label: '介绍页',
    version: 6,
    description: '测试开场介绍页：不是 landing hero，而是一张能直接放进课件的导入页。',
    requiredSignal: '清晰标题 + 一句定位 + 3-4 个入口块',
    densityProfile: DENSITY_PROFILES.light,
    requiredAnchors: ['导数', '瞬时速度', '平均速度', '切线斜率'],
    forbiddenAnchors: ['AI Tutor', 'Evaluation Lab', 'rubric', '题库'],
    prompt: `生成一张 16:9 HTML/CSS PPT 风格的「介绍页」。

课程路线：数学
数学版式：standard（标准介绍页，不强行塞公式或证明）

主题：用瞬时速度引出导数
受众：刚开始学习微积分的高中或大一学生
目的：作为一节导入课，让学生先理解「为什么需要导数」
内容：
- 标题：为什么要学习导数？
- 一句短定位：导数帮助我们描述「正在变化的那一刻」
- 三个入口模块：平均速度、瞬时速度、切线斜率
- 每个入口模块只能包含：模块标题 + 1 句不超过 18 个中文字的解释
- 加一个很短的「今天会解决」横条：生活情境、核心问题、关键概念各 1 个短标签
- 底部只放一句引导问题：如果时间间隔越来越小，平均速度会靠近什么？
- 系统会提供一张 AI 配图；把它作为右侧或中部主视觉，文字模块围绕图片组织
- 不要给三个入口模块再添加底部说明、项目符号、长解释、第二层小标题、CSS 小图标或 CSS 手绘大图
- 总可见文字控制在 130-200 个中文字符之间，文本节点控制在 9-18 个
- 除少量装饰标签外，主要可读中文文字字号不要低于 24px

风格：中文课堂课件页，白底，蓝色和绿色点缀，真实文字，可编辑 HTML/CSS，使用提供的 AI 配图，不要再用 CSS 自己画复杂插图。`,
  },
  {
    id: 'summary-outcomes',
    kind: 'summary',
    courseRoute: 'general',
    label: '总结页',
    version: 6,
    description: '测试总结页：几条 takeaway 和一个收束判断，不能变成长段落。',
    requiredSignal: '3-4 条 takeaway + 收束结论',
    densityProfile: DENSITY_PROFILES.medium,
    requiredAnchors: ['本周质量总结', '81%', '68%', '数学讲解', '代码追踪', '表格'],
    forbiddenAnchors: ['AI Tutor', 'Evaluation Lab', '链式法则', '二分查找', '盈亏平衡'],
    prompt: `生成一张 16:9 HTML/CSS PPT 风格的「总结页」。

课程路线：通用

主题：rubric 约束生成一周后，质量有哪些提升
受众：产品团队和学习运营团队
内容：
- 标题：本周质量总结
- 页面只能包含：标题区、一个小型核心指标、3 条 takeaway、一个收束判断条
- 结论 1：数学讲解更短，也更容易检查
- 结论 2：代码追踪页更能保留变量状态变化
- 结论 3：表格密集页面仍然需要限制行数
- 核心指标：首次可用率 81%，上周为 68%
- 收束判断：继续按页面类型约束生成，而不是依赖装饰性 layout template
- 不要添加额外的“对产品和学习运营的含义”、下一步建议、三角度分析、右侧说明面板或第 4 条 takeaway
- 每条 takeaway 只允许：短标题 + 一句不超过 22 个中文字的解释
- 总可见文字控制在 160-260 个中文字符之间，文本块控制在 10-22 个
- 除少量 eyebrow/编号标签外，所有可读文字字号不要低于 22px，takeaway 正文建议不低于 24px
- takeaway 必须是短卡片或紧凑横条，高度建议 120-170px；如果只有两行文字，不要拉伸成大空白卡片

风格：面向团队复盘的课堂总结页，短卡片，一个突出指标，不要长段落，不要 dashboard 化。`,
  },
  {
    id: 'process-pipeline',
    kind: 'process',
    courseRoute: 'general',
    label: '流程页',
    version: 6,
    description: '测试流程页：需要 4-5 步清晰路径，能看出方向和每步产物。',
    requiredSignal: '4-5 步流程 + 输出/检查点',
    densityProfile: {
      ...DENSITY_PROFILES.medium,
      label: '流程信息',
      textChars: { min: 120, max: 320 },
      textBlocks: { min: 8, max: 32 },
      guidance: '适合流程页；每步允许标题、动作和输出，但不能膨胀成讲义。',
    },
    requiredAnchors: ['PDF', '题库', '逐题', '选择题', '保存前'],
    forbiddenAnchors: ['链式法则', '二分查找', '盈亏平衡', 'AI Tutor'],
    prompt: `生成一张 16:9 HTML/CSS PPT 风格的「流程页」。

课程路线：通用

主题：从上传 PDF 到可用题库
受众：工程团队和教研 QA
内容：
- 标题：PDF 到题库的生成流程
- 页面只能包含：标题区、5 个流程步骤、一个风险提示条
- 第 1 步：模型直接读取原始 PDF
- 第 2 步：逐题抽取，并保留表格、公式和题干结构
- 第 3 步：分类题型：选择题、简答题、证明题、代码题
- 第 4 步：只有选择题缺答案时，才让模型补答案
- 第 5 步：保存前检查「学生能不能做这道题」
- 加一个风险提示：表格和图示必须显式保留
- 主流程区必须紧跟标题区，不能在标题和流程之间留大片空白
- 5 个步骤必须形成一个清楚的横向或弯折流程轨道，占据页面中部主要视觉区域
- 如果横向排列 5 个步骤，slide-content 内宽约 1472px，5 张卡片 + 4 个连接器总宽必须小于等于 1440px
- 横向流程建议每张步骤卡 220-235px、连接器 28-40px；不要写 260px 70px 260px 这种总宽超过内宽的固定列
- 每个流程步骤只允许：步骤编号 + 短标题 + 动作短句 + 输出/检查点短句
- 步骤标题字号不低于 30px，步骤正文不低于 24px；只有编号、标签、eyebrow 可以更小
- 不要把流程页做成表格页、dashboard 或多区域说明页
- 总可见文字控制在 190-300 个中文字符之间，步骤卡片不要拉伸成大空白卡
- 不要使用负 margin、负 top/left/right/bottom 或 transform translate 来居中箭头/装饰

风格：横向流程，步骤标签紧凑，每一步有输出或检查点，产品界面感但不要花哨。`,
  },
  {
    id: 'table-eval',
    kind: 'table',
    courseRoute: 'general',
    label: '表格页',
    version: 4,
    description: '测试表格页：必须生成真实 table，行列紧凑且可读。',
    requiredSignal: '真实 HTML table + 3-6 行',
    densityProfile: DENSITY_PROFILES.dense,
    requiredAnchors: ['页面类型', '必须结构', '主要失败', 'QA 信号', '介绍页', '代码页'],
    forbiddenAnchors: ['AI Tutor', 'Evaluation Lab', '链式法则', '盈亏平衡'],
    prompt: `生成一张 16:9 HTML/CSS PPT 风格的「表格页」。

课程路线：通用

主题：页面类型稳定性矩阵
受众：生成质量 QA 团队
内容：
- 标题：哪些页面类型已经稳定？
- 页面只能包含：标题区、一个真实 HTML table、一句短阅读规则
- 必须包含一个可编辑的真实 HTML table，不要用 div 假表格
- 表头列：页面类型、必须结构、主要失败、QA 信号
- 表格行：
  - 介绍页 | 标题 + 3 个入口 | 变成营销 hero | 没有巨大首屏
  - 总结页 | 3-4 条结论 | 变成长段落 | 文本块长度受控
  - 流程页 | 4-5 个步骤 | 只剩表格 | 方向和产物清晰
  - 数学页 | MathML 公式 | 公式变纯文本 | math 元素数量达标
  - 代码页 | 代码 + trace | 只有代码堆叠 | 状态步骤存在
- 表格下方加一句短阅读规则。
- 表格只能包含表头 + 5 行正文，不能额外加指标卡、图例、说明面板或第二张表
- 单元格文字要短，行高紧凑，表格整体必须完整落在 1600×900 内

风格：干净的 QA 矩阵，高可读性，行高紧凑，正文最多 5 行。`,
  },
  {
    id: 'math-chain-rule',
    kind: 'math',
    courseRoute: 'math',
    mathRoute: 'derivation',
    label: '数学页',
    version: 4,
    description: '测试数学页：直接生成 HTML + MathML，公式不能靠纯文本糊过去。',
    requiredSignal: '3-7 个 MathML + 无 mspace + 一屏可读',
    densityProfile: DENSITY_PROFILES.dense,
    requiredAnchors: ['链式法则', '复合函数', '内层导数', 'sin'],
    forbiddenAnchors: ['AI Tutor', 'Evaluation Lab', '题库', '盈亏平衡'],
    prompt: `生成一张 16:9 HTML/CSS PPT 风格的「数学页」。

课程路线：数学
数学版式：Derivation Ladder / 推导阶梯

主题：链式法则：从复合函数到导数
受众：大一微积分学生
内容：
- 标题：一眼看懂链式法则
- 页面只能包含：标题区、核心公式区、三行推导、一个例题、一个提醒
- 起点公式：y = f(g(x))
- 用原生 MathML 展示核心公式：dy/dx = f'(g(x)) · g'(x)
- 恰好包含三行紧凑推导：
  1. 先识别外层函数 f
  2. 再识别内层函数 g
  3. 最后乘以内层导数 g'(x)
- 加一个例题：y = sin(x^2)，导数 y' = 2x cos(x^2)
- 加一个提醒：不要漏掉内层导数
- 最多 7 个 MathML 公式块，不要使用 <mspace>
- 所有主要公式必须是真实 MathML，不要用纯文本或 TeX 字符串假装公式
- 公式卡片最多 3 个，三行推导必须紧凑，不能让公式区撑出画布

风格：清爽课堂页，白底，蓝色强调，公式卡片，用原生 MathML，不要图片。`,
  },
  {
    id: 'code-trace',
    kind: 'code',
    codeRoute: 'execution-trace',
    courseRoute: 'computer-science',
    csRoute: 'execution-trace',
    label: '代码页',
    version: 4,
    description: '测试代码页：代码块和状态追踪要同时存在，不能只有一坨代码。',
    requiredSignal: 'pre/code + 3-5 个状态追踪步骤',
    densityProfile: DENSITY_PROFILES.dense,
    requiredAnchors: ['binary_search', 'target', 'lo', 'hi', 'mid', 'return 3'],
    forbiddenAnchors: ['AI Tutor', 'Evaluation Lab', '链式法则', '盈亏平衡'],
    prompt: `生成一张 16:9 HTML/CSS PPT 风格的「代码追踪页」。

课程路线：计算机科学
CS 版式：Execution Trace / 代码执行追踪

主题：追踪二分查找的状态变化
受众：CS1 入门学生
内容：
- 标题：二分查找追踪：target = 7
- 页面只能包含：标题区、左侧代码块、右侧 3 步 trace、最终返回结果
- 包含下面这段可编辑 Python 代码块：
def binary_search(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        if nums[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1
- 输入：nums = [1, 3, 5, 7, 9]，target = 7
- 用 trace 表格或状态卡片展示 3 步：lo、hi、mid、nums[mid]、decision
- 高亮最终返回下标 3
- 代码必须完整但不要重复解释；trace 只展示 3 步，不要扩写成教程或算法讲义
- 代码字体建议 20-24px，不能横向溢出；状态区文字不低于 22px

风格：左侧代码、右侧状态追踪；等宽字体清晰可读，不要横向溢出。`,
  },
  {
    id: 'memory-trace',
    kind: 'code',
    codeRoute: 'memory-trace',
    courseRoute: 'computer-science',
    csRoute: 'memory-diagram',
    label: '内存追踪页',
    version: 1,
    description: '测试 Memory Trace：代码、调用栈、堆对象和引用关系必须同时出现。',
    requiredSignal: 'Memory Trace + 调用栈 + 堆对象 + 引用关系',
    densityProfile: DENSITY_PROFILES.dense,
    requiredAnchors: ['内存追踪', '调用栈', '堆', 'a', 'b', 'append', '同一个列表'],
    forbiddenAnchors: ['链式法则', '盈亏平衡', 'AI Tutor', 'Evaluation Lab'],
    prompt: `生成一张 16:9 HTML/CSS PPT 风格的「内存追踪页」。

课程路线：计算机科学
CS 版式：Memory Diagram / Stack + Heap + References

主题：变量名如何指向同一个列表对象
受众：CS1 / Python 入门学生
内容：
- 标题：内存追踪：a 和 b 指向同一个列表
- 页面只能包含：标题区、一个 compact 代码块、一个 Memory Trace 主区、一句检查结论
- 代码块必须展示：
a = [1, 2]
b = a
b.append(3)
- Memory Trace 主区必须包含：
  - 当前动作：执行 b.append(3)
  - 调用栈：变量 a -> list#1，变量 b -> list#1
  - 堆：对象 list#1，元素为 [1, 2, 3]
  - 引用关系：a 和 b 都指向同一个列表对象
- 用 3 个 step tab 表示状态：创建列表、绑定 b、执行 append；但只展开 append 后的最终关键状态
- 检查结论：修改 b 会影响 a，因为两个名字引用同一个列表
- 不要生成普通 bullet 总结页，不要只放代码，不要把 memory trace 做成纯表格
- 用 DOM 和 CSS 画 stack/heap/object/reference，不要 SVG、canvas 或图片
- 总可见文字控制在 170-300 个中文字符之间，代码字号 20-22px，正文不低于 22px

风格：复用课堂 Memory Trace 视觉语法，白底蓝紫点缀，stack 和 heap 分区清楚，可编辑 HTML/CSS。`,
  },
  {
    id: 'long-code-question',
    kind: 'code',
    canvasMode: 'long',
    canvasHeight: 2200,
    codeRoute: 'execution-trace',
    courseRoute: 'computer-science',
    csRoute: 'execution-trace',
    label: '长代码题页',
    version: 1,
    description: '测试长页面代码讲解：题目、代码、trace、错误点和最终答案都能完整展示。',
    requiredSignal: '1600 同宽长页 + 代码题完整讲解',
    densityProfile: DENSITY_PROFILES.long,
    requiredAnchors: ['压缩连续重复字符', 'compress_runs', '指针', 'count', '返回值'],
    forbiddenAnchors: ['链式法则', '盈亏平衡', 'AI Tutor', 'Evaluation Lab'],
    prompt: `生成一张 HTML/CSS 长页面教学版式，不是 16:9 单屏 PPT。

课程路线：计算机科学
CS 版式：Execution Trace / 代码执行追踪

画布要求：
- 宽度固定 1600px，目标高度约 2200px
- 仍然使用 exactly one .slide 和 one .slide-content
- 允许纵向长页面阅读，但不能横向滚动
- 不要用内部滚动框隐藏代码或解释；所有内容都应该在长页面中自然展开

主题：一道字符串压缩代码题的完整讲解
受众：CS1 / Python 入门学生
内容必须分成 6 个纵向 section：
1. 题目区：给定字符串，连续相同字符压缩成「字符 + 次数」，例如 aaabbc → a3b2c1
2. 函数目标：实现 compress_runs(text)，返回压缩后的字符串；空字符串返回空字符串
3. 关键代码：展示完整 Python 代码，最多 22 行，必须包含 i 指针、count 计数、parts 列表和 while 循环
4. 状态追踪：用表格追踪输入 "aaabbc" 的 5-7 个关键状态，列包含 i、当前字符、count、输出片段
5. 常见错误：列出 3 个错误点：忘记处理最后一段、count 重置位置错、空字符串边界
6. 最终答案 / 检查：返回值 "a3b2c1"，并解释为什么最后一段 c1 会被加入

版式要求：
- 顶部是标题 + 一句定位，不要做巨大 hero
- 每个 section 都要有清楚标题和编号
- 代码块可编辑，使用 <pre><code>，不要横向溢出
- 表格必须是真实 HTML table
- 正文字号建议 22-28px，代码字号 20-22px
- 页面整体像一张可导入 PPT 的长讲解页，不是博客文章
- 不要生成图片，不要 SVG，不要 canvas，不要外部资源

风格：白底、蓝绿强调、课堂讲义式长页面，结构清楚，适合代码题详细讲解。`,
  },
  {
    id: 'long-math-proof',
    kind: 'math',
    canvasMode: 'long',
    canvasHeight: 2400,
    courseRoute: 'math',
    mathRoute: 'proof',
    label: '长证明页',
    version: 1,
    description: '测试长页面数学证明：定义、目标、证明步骤、检查点和总结都完整展示。',
    requiredSignal: '1600 同宽长页 + MathML 证明步骤',
    densityProfile: DENSITY_PROFILES.long,
    requiredAnchors: ['单调递增', '导数非负', '中值定理', '证明目标', '检查点'],
    forbiddenAnchors: ['二分查找', '盈亏平衡', 'AI Tutor', 'Evaluation Lab'],
    prompt: `生成一张 HTML/CSS 长页面数学证明版式，不是 16:9 单屏 PPT。

课程路线：数学
数学版式：Proof Walkthrough / 证明讲解

画布要求：
- 宽度固定 1600px，目标高度约 2400px
- 仍然使用 exactly one .slide 和 one .slide-content
- 允许纵向长页面阅读，但不能横向滚动
- 不要把证明步骤塞进内部滚动框；所有公式和文字必须自然展开

主题：用中值定理证明导数非负推出函数单调递增
受众：大一微积分学生
内容必须分成 6 个纵向 section：
1. 命题区：若 f 在 [a,b] 连续、在 (a,b) 可导，且对所有 x 属于 (a,b)，f'(x) >= 0，则 f 在 [a,b] 单调递增
2. 证明目标：任取 x1 < x2，证明 f(x1) <= f(x2)
3. 使用中值定理：存在 c 属于 (x1,x2)，使得 f(x2)-f(x1) = f'(c)(x2-x1)
4. 符号判断：f'(c) >= 0 且 x2-x1 > 0，因此 f(x2)-f(x1) >= 0
5. 结论：f(x2) >= f(x1)，所以 f 单调递增
6. 检查点：连续性、可导性、任取两点、差值符号，这四个条件分别在哪里用到

数学要求：
- 核心公式必须用原生 MathML，不要用纯文本 TeX
- 至少 5 个 <math> 块，最多 10 个
- 每个公式卡要有短标题和一句解释
- 不要使用 <mspace>

版式要求：
- 顶部是标题 + 证明路线图
- 中间用清楚编号 section 展开证明
- 底部用检查点卡片收束
- 正文字号 22-28px，公式字号 22-26px
- 不要生成图片，不要 SVG，不要 canvas，不要外部资源

风格：白底、蓝绿强调、数学课堂长证明页，重点是可读、可检查、可导入。`,
  },
  {
    id: 'worked-example',
    kind: 'example',
    courseRoute: 'business',
    label: '例题页',
    version: 4,
    description: '测试例题页：题目、已知、步骤和答案必须完整可做。',
    requiredSignal: '题目 + 已知 + 3-4 步 + 答案/检查',
    densityProfile: DENSITY_PROFILES.medium,
    requiredAnchors: ['盈亏平衡', '1200', '42', '18', '50'],
    forbiddenAnchors: ['AI Tutor', 'Evaluation Lab', '链式法则', '二分查找'],
    prompt: `生成一张 16:9 HTML/CSS PPT 风格的「例题页」。

课程路线：商科经济

主题：盈亏平衡分析例题
受众：商科入门学生
内容：
- 标题：例题：盈亏平衡销量
- 页面只能包含：题目区、已知条件区、3 个求解步骤、最终答案/检查
- 题目：一个手作工作坊固定成本为 1200 元，每件套装的可变成本为 18 元，售价为 42 元。至少卖出多少件才能盈亏平衡？
- 已知条件：固定成本 = 1200，售价 = 42，可变成本 = 18
- 公式：盈亏平衡销量 = 固定成本 / (售价 - 可变成本)
- 展示 3 个求解步骤：
  1. 单件贡献毛利 = 42 - 18 = 24
  2. 盈亏平衡销量 = 1200 / 24 = 50
  3. 检查：50 件刚好覆盖固定成本
- 最终答案：50 件套装
- 不要额外添加第二道题、背景故事、营销说明、多个公式区或无关图表
- 题目必须完整可做；已知条件、步骤、答案要彼此对应，不能只给方法总结
- 总可见文字控制在 170-300 个中文字符之间，所有关键数字必须可见

风格：课堂例题页，有清晰的已知条件区、分步求解区和高亮最终答案。`,
  },
];

export const DEFAULT_PRESET = PAGE_PRESETS[0];

export function getPresetCanvasMode(preset: HtmlSinglePagePreset): HtmlCanvasMode {
  return preset.canvasMode === 'long' ? 'long' : 'slide';
}

export function getPresetCanvasHeight(preset: HtmlSinglePagePreset): number {
  return getPresetCanvasMode(preset) === 'long'
    ? preset.canvasHeight || DEFAULT_LONG_PAGE_HEIGHT
    : DEFAULT_SLIDE_HEIGHT;
}

export function shouldUseGeneratedIllustration(preset: HtmlSinglePagePreset): boolean {
  return preset.kind === 'cover' || preset.kind === 'intro';
}
