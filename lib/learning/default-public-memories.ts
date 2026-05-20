type DefaultPublicMemoryItem = {
  id: string;
  scope: 'public';
  kind: 'manual';
  status: 'active';
  source: 'manual';
  stageId: string;
  title: string;
  text: string;
  sourceReferences: [];
  confidence: number;
  createdAt: number;
  updatedAt: number;
};

type DefaultPublicMemoryDefinition = {
  title: string;
  text: string;
};

const MAT136_PUBLIC_MEMORY_UPDATED_AT = Date.parse('2026-05-20T00:00:00.000Z');

const mat136PublicMemories: Record<string, DefaultPublicMemoryDefinition> = {
  'nb-mat136-riemann-sums-week1-20260518162551': {
    title: '涉及知识点与讲解重点',
    text: [
      '## 涉及知识点',
      '- 用矩形面积近似变化量，把速度-时间图像下的面积理解为累积量。',
      '- 区间分割、子区间宽度、左端点和右端点采样。',
      '- 左黎曼和、右黎曼和与求和式的结构：高度、宽度、求和范围。',
      '- 函数单调性如何决定左端点或右端点估计是高估还是低估。',
      '- n 变大通常让分割更细，但单个近似值不一定单调变大。',
      '',
      '## 讲解重点',
      '- 先从恒定速度的矩形面积进入，再过渡到变化速度时的分段近似。',
      '- 反复拆解 Riemann sum 公式中每个符号对应的图像含义。',
      '- 用单调性判断高估和低估，避免只靠图形直觉猜答案。',
      '- 强调黎曼和是定积分之前的近似语言，为后续极限定义做铺垫。',
    ].join('\n'),
  },
  'nb-mat136-riemann-integral-week1-20260518135718': {
    title: '涉及知识点与讲解重点',
    text: [
      '## 涉及知识点',
      '- 黎曼积分从矩形近似面积出发，把分割、采样点和面积求和统一起来。',
      '- 分割 P、采样点 c_i、子区间宽度 Δx_i 与求和表达式 Σ f(c_i)Δx_i。',
      '- 左端点、右端点、中点等常见采样规则。',
      '- 单调函数下左/右黎曼和的高估和低估关系。',
      '- mesh 趋近 0 时，黎曼和极限若不依赖采样点，就定义为黎曼积分。',
      '',
      '## 讲解重点',
      '- 按“分割区间、选采样点、加矩形面积、取极限”的流程讲清黎曼积分。',
      '- 区分某一次黎曼和近似值与真正的定积分极限。',
      '- 强调采样点可以变，但可积函数在分割变细时会收敛到同一个面积。',
      '- 用图像和表格例题训练学生把文字条件翻译成求和式。',
    ].join('\n'),
  },
  'nb-mat136-definite-integral-week1-20260518150500': {
    title: '涉及知识点与讲解重点',
    text: [
      '## 涉及知识点',
      '- 定积分作为黎曼和极限，也可以表示有向面积和净变化。',
      '- 有向面积的正负号、积分上下限方向和区间可加性。',
      '- 定积分基本性质：线性、常数倍、区间拆分和比较直觉。',
      '- 微积分基本定理第二部分：用反导函数计算定积分。',
      '- 黎曼和与定积分符号之间的互相转换。',
      '- 微积分基本定理第一部分、面积函数、变上限积分和链式法则。',
      '',
      '## 讲解重点',
      '- 把定积分同时讲成三种面孔：面积、极限、反导计算工具。',
      '- 先建立符号和几何意义，再进入 FTC 的计算捷径。',
      '- 重点训练从 Riemann sum 极限识别积分区间、被积函数和 dx。',
      '- 对变上限积分强调“先求导外层面积函数，再乘以上限导数”。',
    ].join('\n'),
  },
  'nb-mat136-substitution-week2-20260518183518': {
    title: '涉及知识点与讲解重点',
    text: [
      '## 涉及知识点',
      '- 换元法是反向链式法则，用 u 把复合函数积分化简。',
      '- 选择 u、计算 du，并处理差一个常数或负号的情况。',
      '- 换元后不能留下原变量 x，需要把所有部分都改写成 u。',
      '- 定积分换元时，上下限也要随变量一起改变。',
      '- 函数缩放型换元和没有现成公式时的结构识别。',
      '',
      '## 讲解重点',
      '- 每道题都按四个问题讲：u 选什么、du 是什么、是否还有 x、上下限怎么办。',
      '- 用例题集中处理常数倍、负号和残留变量这些最常见错误。',
      '- 对不定积分强调最后换回 x；对定积分强调换上下限后可以不换回。',
      '- 让学生先找“里面的函数”和“外面的导数影子”，再动手计算。',
    ].join('\n'),
  },
  'nb-mat136-inverse-substitution-week2-20260519011900': {
    title: '涉及知识点与讲解重点',
    text: [
      '## 涉及知识点',
      '- 逆换元法处理含根号二次式的积分，尤其是三角代换。',
      '- 三类形状：√(a^2 - x^2)、√(a^2 + x^2)、√(x^2 - a^2)。',
      '- 对应代换：x = a sin θ、x = a tan θ、x = a sec θ。',
      '- 通过三角恒等式消掉根号，并用直角三角形或恒等式换回 x。',
      '- 配方、定积分上下限替换和定义域限制。',
      '',
      '## 讲解重点',
      '- 先判断根号形状，再选三角代换，不从公式表硬背开始。',
      '- 解释为什么 √(a^2 - x^2) 对应 sin，√(a^2 + x^2) 对应 tan。',
      '- 对每个例题都保留“换元、化简、积分、换回”的完整链条。',
      '- 特别提醒定积分可以换 θ 上下限，但要检查区间和符号。',
    ].join('\n'),
  },
  'nb-mat136-inverse-substitution-week2-v2-20260519174000': {
    title: '涉及知识点与讲解重点',
    text: [
      '## 涉及知识点',
      '- 普通 u-substitution 在根号二次式中为什么会卡住。',
      '- 三角代换把根号形状转成三角恒等式可以处理的结构。',
      '- 三类根号形状和代换规则：a^2 - x^2、a^2 + x^2、x^2 - a^2。',
      '- 配方后识别形状、换上下限、回代和定义域检查。',
      '- sin、tan、sec 代换背后的几何直觉。',
      '',
      '## 讲解重点',
      '- 先讲“为什么需要逆换元”，再给代换表，避免学生机械套公式。',
      '- 把根号形状和单位圆/直角三角形图像绑定起来。',
      '- 对每类代换都强调它消掉根号的那一步恒等式。',
      '- 用多个例题展示从诊断形状到完成积分的稳定流程。',
    ].join('\n'),
  },
  'nb-mat136-integration-by-parts-week2-20260519142600': {
    title: '涉及知识点与讲解重点',
    text: [
      '## 涉及知识点',
      '- 分部积分来自乘积法则的反向使用。',
      '- 公式：∫ u dv = uv - ∫ v du。',
      '- 什么时候不用普通换元，而需要把乘积拆成 u 和 dv。',
      '- u 的选择要让求导后更简单，dv 的选择要能积分。',
      '- 基础例题 ∫ x cos x dx 的完整角色分配和计算。',
      '',
      '## 讲解重点',
      '- 先说明分部积分解决的是“两个因子相乘”的积分困境。',
      '- 把 u、dv、du、v 四个角色写清楚，防止公式代入混乱。',
      '- 用一个例题讲透选择 u 和 dv 的原因，而不只是套公式。',
      '- 强调剩下的 integral v du 应该比原题更容易。',
    ].join('\n'),
  },
  'nb-mat136-integration-by-parts-week2-v2-20260519151624': {
    title: '涉及知识点与讲解重点',
    text: [
      '## 涉及知识点',
      '- 分部积分作为乘积法则的积分版：∫ u dv = uv - ∫ v du。',
      '- 选择 u 和 dv 的原则：u 求导变简单，dv 可以直接积分。',
      '- 典型题型：x cos x、ln x、需要多次分部的积分。',
      '- 公式推导、角色表、剩余积分的难度判断。',
      '- 一次分部不够时，重复使用分部积分并整理结果。',
      '',
      '## 讲解重点',
      '- 用“为什么换元不够”引出分部积分，再从乘积法则推导公式。',
      '- 每题先做角色选择，不急着计算，训练学生解释为什么这样选。',
      '- 对 ln x 强调把它看成 ln x · 1，并令 dv = dx。',
      '- 对重复分部题强调过程管理：每一步都要让剩余积分更可控。',
    ].join('\n'),
  },
};

export function getDefaultNotebookPublicMemories(stageId: string): DefaultPublicMemoryItem[] {
  const definition = mat136PublicMemories[stageId];
  if (!definition) return [];

  return [
    {
      id: `default-public-memory:${stageId}:knowledge-focus`,
      scope: 'public',
      kind: 'manual',
      status: 'active',
      source: 'manual',
      stageId,
      title: definition.title,
      text: definition.text,
      sourceReferences: [],
      confidence: 1,
      createdAt: MAT136_PUBLIC_MEMORY_UPDATED_AT,
      updatedAt: MAT136_PUBLIC_MEMORY_UPDATED_AT,
    },
  ];
}
