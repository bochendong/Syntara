#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';

const SCRIPT_NAME = 'create-mat136-first-notebook-v2.mjs';
const NOTEBOOK_ID = 'queue-mat136-01-definite-integral';
const COURSE_ID = 'cmpanemia001v8ouzmhttvkrn';
const QUEUE_DIR = path.join('tmp', 'notebook-imagegen-queue', 'MAT136', NOTEBOOK_ID);
const PUBLIC_DIR = path.join('public', 'generated-notebooks', NOTEBOOK_ID);
const PUBLIC_PATH = `/generated-notebooks/${NOTEBOOK_ID}`;
const SOURCE_WIDTH = 1600;
const SOURCE_HEIGHT = 900;
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;
const HOTSPOT_PATH = 'M 0 0 L 200 0 L 200 200 L 0 200 Z';
const GENERATED_IMAGE_ROOT =
  '/Users/dongpochen/.codex/generated_images/019e768b-9ea6-7031-a350-1a380fe54bd7';

const MARKERS = [
  { name: 'red', hex: '#ff0000', cn: '红色', match: (r, g, b) => r > 180 && g < 85 && b < 85 },
  { name: 'lime', hex: '#00ff00', cn: '绿色', match: (r, g, b) => g > 170 && r < 90 && b < 95 },
  { name: 'blue', hex: '#0048ff', cn: '蓝色', match: (r, g, b) => b > 145 && r < 90 && g < 140 },
  { name: 'cyan', hex: '#00ffff', cn: '青色', match: (r, g, b) => g > 165 && b > 165 && r < 95 },
  { name: 'magenta', hex: '#ff00ff', cn: '品红', match: (r, g, b) => r > 170 && b > 130 && g < 95 },
  { name: 'yellow', hex: '#ffff00', cn: '黄色', match: (r, g, b) => r > 170 && g > 170 && b < 110 },
];

const PAGES = [
  {
    title: '介绍页：从矩形到面积',
    sceneTitle: '从矩形到面积',
    layout:
      '自然课堂笔记布局：上方标题，中左是速度乘时间的矩形直觉，中右是变化速度的疑问，底部给出本页笔记路线。',
    components: [
      {
        label: '本页笔记入口',
        role: 'opening',
        marker: 'red',
        content: '标题“从矩形到面积”；承接句“面积先从一个个矩形开始”。',
      },
      {
        label: '固定速度矩形',
        role: 'visual',
        marker: 'lime',
        content: '速度-时间图，水平线 v=50，宽度 4，写“距离=速度×时间=50×4”。',
      },
      {
        label: '速度变化疑问',
        role: 'setup',
        marker: 'blue',
        content: '画一条变化的速度曲线，写“速度一直变化时怎么办？”和“切成小时间段”。',
      },
      {
        label: '粗近似到细近似',
        role: 'visual',
        marker: 'cyan',
        content: '粗矩形和细矩形对比，写“时间间隔越小，近似越细”。',
      },
      {
        label: '学习路线',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部路线：“矩形面积 → 黎曼和 → 极限 → 定积分 → 微积分基本定理”。',
      },
    ],
  },
  {
    title: '黎曼和的基本结构',
    sceneTitle: '黎曼和的基本结构',
    layout: '大图在左侧展示曲线和矩形；右上写分割，右中写采样点；底部收束到一个总和。',
    components: [
      {
        label: '标题承接',
        role: 'opening',
        marker: 'red',
        content: '标题“黎曼和的基本结构”；短句“先定宽度，再定高度”。',
      },
      {
        label: '面积累积图',
        role: 'visual',
        marker: 'lime',
        content: '曲线 y=f(x)，区间 [a,b]，多个矩形，写“面积≈小矩形面积的总和”。',
      },
      {
        label: '分割决定宽度',
        role: 'formula',
        marker: 'blue',
        content: '数轴分割，写“P={x0,x1,...,xn}”和“Δx_i=x_i-x_{i-1}”。',
      },
      {
        label: '采样点决定高度',
        role: 'formula',
        marker: 'cyan',
        content: '小区间放大图，点 c_i，写“c_i∈[x_{i-1},x_i]”和“A_i=f(c_i)Δx_i”。',
      },
      {
        label: '黎曼和公式',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部大公式“S(P,c)=Σ f(c_i)Δx_i”；旁边写“宽度×高度，再求和”。',
      },
    ],
  },
  {
    title: '左端点和右端点近似',
    sceneTitle: '左端点和右端点近似',
    layout: '左侧用同一条曲线画左端点矩形，右侧画右端点矩形，中间用箭头说明“取点变了，高度变了”。',
    components: [
      {
        label: '标题与核心问题',
        role: 'opening',
        marker: 'red',
        content: '标题“左端点和右端点近似”；写“同一分割，不同取点”。',
      },
      {
        label: '左端点矩形',
        role: 'visual',
        marker: 'lime',
        content: '左侧曲线下左端点矩形，写“左端点高度”和“L_n”。',
      },
      {
        label: '右端点矩形',
        role: 'visual',
        marker: 'blue',
        content: '右侧曲线下右端点矩形，写“右端点高度”和“R_n”。',
      },
      {
        label: '公式对照',
        role: 'formula',
        marker: 'cyan',
        content: '写“L_n=Σ f(x_{i-1})Δx_i”和“R_n=Σ f(x_i)Δx_i”。',
      },
      {
        label: '过渡问题',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部问题“什么时候会高估？什么时候会低估？”',
      },
    ],
  },
  {
    title: '高估和低估：先看单调性',
    sceneTitle: '高估和低估',
    layout: '左半页讲递增，右半页讲递减；底部给出两步判断法。不是表格，像两组对照笔记。',
    components: [
      {
        label: '判断目标',
        role: 'opening',
        marker: 'red',
        content: '标题“高估和低估”；写“先看单调性，再看取点”。',
      },
      {
        label: '递增函数规则',
        role: 'visual',
        marker: 'lime',
        content: '递增曲线，左端点矩形偏低，右端点矩形偏高，写“递增：左低右高”。',
      },
      {
        label: '递减函数规则',
        role: 'visual',
        marker: 'blue',
        content: '递减曲线，左端点矩形偏高，右端点矩形偏低，写“递减：左高右低”。',
      },
      {
        label: '两步判断法',
        role: 'strategy',
        marker: 'cyan',
        content: '写“两步：判断递增/递减；判断左端点/右端点”。',
      },
      {
        label: '练习钩子',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部问题“同一个函数，换取点会不会改变误差方向？”',
      },
    ],
  },
  {
    title: '定积分定义：把近似推到极限',
    sceneTitle: '定积分定义',
    layout: '左侧大图显示粗到细的矩形，右上写网格大小，右下写定义式，底部是定义问题。',
    components: [
      {
        label: '定义入口',
        role: 'opening',
        marker: 'red',
        content: '标题“定积分定义”；写“近似值稳定下来，就是面积”。',
      },
      {
        label: '粗到细图像',
        role: 'visual',
        marker: 'lime',
        content: '曲线下粗矩形到细矩形的渐变，写“矩形越窄，缝隙越小”。',
      },
      {
        label: '网格大小',
        role: 'formula',
        marker: 'blue',
        content: '写“||P||=max Δx_i”和“||P||→0”。',
      },
      {
        label: '定积分公式',
        role: 'formula',
        marker: 'cyan',
        content: '写“∫_a^b f(x)dx = lim_{||P||→0} Σ f(c_i)Δx_i”。',
      },
      {
        label: '定义判断',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“同一个极限值，不依赖采样点选择”。',
      },
    ],
  },
  {
    title: '定积分的基础性质',
    sceneTitle: '定积分性质',
    layout: '分成三组自然笔记：左边零区间和常数倍，中间和差，右边拆区间和变量名；底部给整理原则。',
    components: [
      {
        label: '性质入口',
        role: 'opening',
        marker: 'red',
        content: '标题“定积分的基础性质”；写“先整理，再计算”。',
      },
      {
        label: '零区间和常数倍',
        role: 'formula',
        marker: 'lime',
        content: '写“∫_a^a f(x)dx=0”和“∫_a^b c f(x)dx=c∫_a^b f(x)dx”。',
      },
      {
        label: '和差性质',
        role: 'formula',
        marker: 'blue',
        content: '写“∫(f+g)=∫f+∫g”和“∫(f-g)=∫f-∫g”。',
      },
      {
        label: '拆区间与变量名',
        role: 'formula',
        marker: 'cyan',
        content: '画 [a,c] 和 [c,b] 两段，写“∫_a^b=∫_a^c+∫_c^b”；写“变量名不重要”。',
      },
      {
        label: '使用原则',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“先看上下限，再看能否拆、提、合并”。',
      },
    ],
  },
  {
    title: '微积分基本定理二：面积变端点差',
    sceneTitle: '微积分基本定理二',
    layout: '左侧展示面积，右侧展示原函数高度差，中间用桥接箭头；底部放计算模板。',
    components: [
      {
        label: '定理入口',
        role: 'opening',
        marker: 'red',
        content: '标题“微积分基本定理二”；写“面积可以用原函数端点差计算”。',
      },
      {
        label: '面积视角',
        role: 'visual',
        marker: 'lime',
        content: '曲线下从 a 到 b 的阴影面积，写“∫_a^b f(x)dx”。',
      },
      {
        label: '原函数视角',
        role: 'visual',
        marker: 'blue',
        content: '画 F(x) 的两个端点高度，写“F(b)-F(a)”。',
      },
      {
        label: '定理公式',
        role: 'formula',
        marker: 'cyan',
        content: '写“若 F′(x)=f(x)，则 ∫_a^b f(x)dx=F(b)-F(a)”。',
      },
      {
        label: '计算模板',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“三步：找原函数；代上限；减下限”。',
      },
    ],
  },
  {
    title: '定积分计算例题',
    sceneTitle: '定积分计算例题',
    layout: '左侧是题目，右侧分三步演算，底部放检查点。版面像老师现场解题，不要表格。',
    components: [
      {
        label: '题目入口',
        role: 'opening',
        marker: 'red',
        content: '标题“定积分计算例题”；写“用端点差，不用再画很多矩形”。',
      },
      {
        label: '例题条件',
        role: 'example',
        marker: 'lime',
        content: '写例题“计算 ∫_0^2 (x^2+1) dx”。',
      },
      {
        label: '找原函数',
        role: 'formula',
        marker: 'blue',
        content: '写“F(x)=x^3/3+x”。',
      },
      {
        label: '端点代入',
        role: 'formula',
        marker: 'cyan',
        content: '写“F(2)-F(0)=(8/3+2)-0=14/3”。',
      },
      {
        label: '检查点',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“定积分结果是数；不要忘记上下限”。',
      },
    ],
  },
  {
    title: '从黎曼和反推定积分',
    sceneTitle: '黎曼和反推定积分',
    layout: '上方写求和式，中间用颜色不纯的注释箭头拆出 Δx、x_i、f(x_i)，底部写对应积分。',
    components: [
      {
        label: '反推入口',
        role: 'opening',
        marker: 'red',
        content: '标题“从黎曼和反推定积分”；写“先找 Δx，再找 x_i”。',
      },
      {
        label: '求和式样本',
        role: 'example',
        marker: 'lime',
        content: '写“lim_{n→∞} Σ_{i=1}^n (5/n)(7-(5i/n)^2)”。',
      },
      {
        label: '识别区间',
        role: 'formula',
        marker: 'blue',
        content: '写“Δx=(b-a)/n=5/n，所以 a=0，b=5”。',
      },
      {
        label: '识别函数',
        role: 'formula',
        marker: 'cyan',
        content: '写“x_i=5i/n，f(x)=7-x^2”。',
      },
      {
        label: '写成积分',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“对应：∫_0^5 (7-x^2) dx”。',
      },
    ],
  },
  {
    title: '四项黎曼和近似',
    sceneTitle: '四项黎曼和近似',
    layout: '左侧区间切分，中间左端点清单，右侧右端点清单，底部判断高估低估。',
    components: [
      {
        label: '例题入口',
        role: 'opening',
        marker: 'red',
        content: '标题“四项黎曼和近似”；写“先切区间，再列取点”。',
      },
      {
        label: '区间切分',
        role: 'visual',
        marker: 'lime',
        content: '例题“∫_30^38 √x dx，四项近似”；数轴从 30 到 38，写“Δx=2”。',
      },
      {
        label: '左端点近似',
        role: 'formula',
        marker: 'blue',
        content: '写“L_4=2(√30+√32+√34+√36)”。',
      },
      {
        label: '右端点近似',
        role: 'formula',
        marker: 'cyan',
        content: '写“R_4=2(√32+√34+√36+√38)”。',
      },
      {
        label: '估计判断',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“√x 递增：L_4 低估，R_4 高估”。',
      },
    ],
  },
  {
    title: '导数下方面积与原函数增长量',
    sceneTitle: '导数面积与增长量',
    layout: '左侧画导数图像下面积，右侧画原函数从低到高的变化，底部写增长量公式。',
    components: [
      {
        label: '概念入口',
        role: 'opening',
        marker: 'red',
        content: '标题“导数下方面积与原函数增长量”；写“面积也可以表示变化量”。',
      },
      {
        label: '导数面积',
        role: 'visual',
        marker: 'lime',
        content: '画 f′(t) 图像在 [0,10] 和 [0,20] 下的面积，写“面积累积”。',
      },
      {
        label: '原函数变化',
        role: 'visual',
        marker: 'blue',
        content: '画 f(x) 的高度变化，写“f(20)-f(0)”和“f(10)-f(0)”。',
      },
      {
        label: '增长量公式',
        role: 'formula',
        marker: 'cyan',
        content: '写“∫_a^b f′(t)dt=f(b)-f(a)”。',
      },
      {
        label: '极值问题钩子',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部问题“原函数什么时候最大？什么时候最小？”',
      },
    ],
  },
  {
    title: '微积分基本定理一',
    sceneTitle: '微积分基本定理一',
    layout: '左侧是变上限面积函数，右侧是小增量 h 的薄条，底部用直觉说明导数回到 f(x)。',
    components: [
      {
        label: '定理入口',
        role: 'opening',
        marker: 'red',
        content: '标题“微积分基本定理一”；写“变上限面积的变化率”。',
      },
      {
        label: '面积函数',
        role: 'visual',
        marker: 'lime',
        content: '画“F(x)=∫_a^x f(t)dt”的阴影面积，从 a 到 x。',
      },
      {
        label: '小增量薄条',
        role: 'visual',
        marker: 'blue',
        content: '画从 x 到 x+h 的窄条，写“新增面积≈f(x)·h”。',
      },
      {
        label: '导数结论',
        role: 'formula',
        marker: 'cyan',
        content: '写“若 F(x)=∫_a^x f(t)dt，则 F′(x)=f(x)”。',
      },
      {
        label: '判断方法',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“看到变上限积分，先问上限是不是 x”。',
      },
    ],
  },
  {
    title: '变上下限积分求导',
    sceneTitle: '变上下限积分求导',
    layout: '中间写总公式，左侧解释上限贡献，右侧解释下限贡献，底部给符号方向提醒。',
    components: [
      {
        label: '链式法则入口',
        role: 'opening',
        marker: 'red',
        content: '标题“变上下限积分求导”；写“端点会动，就乘端点导数”。',
      },
      {
        label: '上限贡献',
        role: 'formula',
        marker: 'lime',
        content: '画上限 v(x) 向右动，写“上限贡献：f(v(x))v′(x)”。',
      },
      {
        label: '下限贡献',
        role: 'formula',
        marker: 'blue',
        content: '画下限 u(x) 向右动，写“下限贡献：-f(u(x))u′(x)”。',
      },
      {
        label: '总公式',
        role: 'formula',
        marker: 'cyan',
        content: '写“F(x)=∫_{u(x)}^{v(x)} f(t)dt”和“F′(x)=f(v(x))v′(x)-f(u(x))u′(x)”。',
      },
      {
        label: '符号提醒',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“上限加，下限减；端点是复合函数要乘导数”。',
      },
    ],
  },
  {
    title: '综合例题：链式法则与乘积法则',
    sceneTitle: '综合例题',
    layout: '左侧写题目结构，中间拆成外部乘积和内部积分，右侧完成求导，底部写检查清单。',
    components: [
      {
        label: '题目入口',
        role: 'opening',
        marker: 'red',
        content: '标题“综合例题”；写“先拆结构，再求导”。',
      },
      {
        label: '题目结构',
        role: 'example',
        marker: 'lime',
        content: '写“G(x)=x·∫_{x^2}^{0} cos(-t^2)dt”。',
      },
      {
        label: '外层乘积法则',
        role: 'strategy',
        marker: 'blue',
        content: '写“G′=1·积分 + x·积分的导数”。',
      },
      {
        label: '内层变限求导',
        role: 'formula',
        marker: 'cyan',
        content: '写“下限 x^2 带负号，再乘 2x”。',
      },
      {
        label: '检查清单',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“外层法则；端点符号；端点导数；代回被积函数”。',
      },
    ],
  },
  {
    title: '常见积分公式速查',
    sceneTitle: '常见积分公式',
    layout:
      '像一页公式速查笔记：左边幂函数和指数，中间三角函数，右边反三角常见型，底部提醒加常数和定积分区别。',
    components: [
      {
        label: '公式页入口',
        role: 'opening',
        marker: 'red',
        content: '标题“常见积分公式速查”；写“先认形，再套公式”。',
      },
      {
        label: '幂函数和指数',
        role: 'formula',
        marker: 'lime',
        content: '写“∫x^n dx=x^{n+1}/(n+1)+C”和“∫e^x dx=e^x+C”。',
      },
      {
        label: '三角函数',
        role: 'formula',
        marker: 'blue',
        content: '写“∫sin x dx=-cos x+C”，“∫cos x dx=sin x+C”，“∫sec^2 x dx=tan x+C”。',
      },
      {
        label: '反三角常见型',
        role: 'formula',
        marker: 'cyan',
        content: '写“∫1/(1+x^2)dx=arctan x+C”和“∫1/√(1-x^2)dx=arcsin x+C”。',
      },
      {
        label: '使用提醒',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“不定积分要加 C；定积分要代上下限”。',
      },
    ],
  },
  {
    title: '综合练习：选择方法',
    sceneTitle: '综合练习',
    layout:
      '四个小题围绕中间的“选方法”决策图，底部是做题顺序。注意不是四栏，而是练习散点加中心判断。',
    components: [
      {
        label: '练习入口',
        role: 'opening',
        marker: 'red',
        content: '标题“综合练习：选择方法”；写“先判断题型”。',
      },
      {
        label: '定积分计算题',
        role: 'example',
        marker: 'lime',
        content: '写小题“∫_1^2 (x+1)(x+2)dx”；旁注“先展开”。',
      },
      {
        label: '公式识别题',
        role: 'example',
        marker: 'blue',
        content: '写小题“∫ 5/√(1-x^2) dx”；旁注“反正弦型”。',
      },
      {
        label: '变上限题',
        role: 'example',
        marker: 'cyan',
        content: '写小题“H(x)=∫_0^{x^2} √(1+t^2)dt”；旁注“FTC I + 链式法则”。',
      },
      {
        label: '做题顺序',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“看上下限；看是否变限；认公式；再计算”。',
      },
    ],
  },
  {
    title: '总结：定积分的三种身份',
    sceneTitle: '总结',
    layout:
      '中心写定积分，周围三条身份像概念地图：矩形和极限、曲线下面积、原函数增长量；底部 checklist。',
    components: [
      {
        label: '总结入口',
        role: 'opening',
        marker: 'red',
        content: '标题“定积分的三种身份”；中心写“定积分”。',
      },
      {
        label: '身份一：矩形和极限',
        role: 'formula',
        marker: 'lime',
        content: '写“黎曼和的极限”和“Σ f(c_i)Δx_i”。',
      },
      {
        label: '身份二：曲线下面积',
        role: 'visual',
        marker: 'blue',
        content: '画曲线下阴影，写“从 a 到 b 的累积面积”。',
      },
      {
        label: '身份三：原函数增长量',
        role: 'formula',
        marker: 'cyan',
        content: '写“F(b)-F(a)”和“原函数增长量”。',
      },
      {
        label: '最终检查清单',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部 checklist：“看区间；看取点；看极限；看能否用基本定理”。',
      },
    ],
  },
];

function extraNarration(afterTitle, marker, title, speech) {
  return { afterTitle, marker, title, speech };
}

const PAGE_NARRATIONS = new Map([
  [
    1,
    [
      {
        marker: 'red',
        title: '引入面积问题',
        speech:
          '先从这个标题进入。今天我们先不急着写定积分符号，而是先问一个更朴素的问题：如果图像下面那块面积不好直接算，能不能先用熟悉的矩形去靠近它。',
      },
      {
        marker: 'lime',
        title: '固定速度的矩形',
        speech:
          '左边这幅图给我们一个最简单的起点：速度固定在 50，时间走了 4 秒，距离就是 50 乘 4。在速度-时间图上，这个乘法不是抽象公式，它就是下面这个矩形的面积。',
      },
      {
        marker: 'blue',
        title: '变化速度的困难',
        speech:
          '问题出现在右边：真实速度往往不是一条水平线，而是在变。既然整段时间没有一个统一的高度，我们就把时间先切开，每一小段里临时选一个代表速度当高度。',
      },
      {
        marker: 'cyan',
        title: '把近似做细',
        speech:
          '下面这组粗细对比是在说明同一件事：切得越细，每小段里的速度变化越小，用一个矩形代表那一小段就越合理。注意这里还不是精确计算，而是在把近似做得越来越可靠。',
      },
      {
        marker: 'yellow',
        title: '本讲路线',
        speech:
          '底部只是把接下来的路标出来。先学会写许多小矩形的和，再看这些和在分割越来越细时会不会稳定；稳定下来的那个数，才会被我们正式叫作定积分，之后再用微积分基本定理去计算它。',
      },
    ],
  ],
  [
    2,
    [
      {
        marker: 'red',
        title: '把直觉写成对象',
        speech:
          '这一页开始把刚才的图像直觉写成一个可以计算的对象。我们不是凭感觉说“很多矩形”，而是要说清楚每个矩形的宽度从哪里来，高度从哪里来。',
      },
      {
        marker: 'lime',
        title: '面积来自累加',
        speech:
          '左边的大图先保留直观：一块矩形只能照顾曲线下面的一小段，整段面积就要靠这些小块一点点加起来。',
      },
      {
        marker: 'blue',
        title: '分割给出宽度',
        speech:
          '宽度由分割决定。把区间从 a 切到 b，每两个相邻切点之间就是一个小区间，它的长度就是对应矩形的底边。',
      },
      {
        marker: 'cyan',
        title: '采样给出高度',
        speech:
          '高度要另外决定。在每个小区间里选一个代表点，用这个点的函数值当高度，于是单块面积就是函数值乘以这段宽度。',
      },
      {
        marker: 'yellow',
        title: '黎曼和的含义',
        speech:
          '底部这个求和式只是把刚才的动作压缩成符号：每一块都是高度乘宽度，然后从第一块一直加到最后一块。',
      },
      {
        marker: 'yellow',
        title: '读公式的方法',
        speech:
          '所以读这个公式时不要先害怕求和号，先在心里读成一句话：选点定高度，分割定宽度，小矩形面积全部相加。',
      },
    ],
  ],
  [
    3,
    [
      {
        marker: 'red',
        title: '同一分割不同高度',
        speech:
          '这一页只改一件事：区间怎么切可以一样，但矩形高度取左端点还是右端点，会让近似值发生变化。',
      },
      {
        marker: 'lime',
        title: '左端点的读法',
        speech:
          '左边用每段最左侧的函数值当高度。你可以把每个矩形想成从小区间左端竖起来，所以它记作左端点和。',
      },
      {
        marker: 'blue',
        title: '右端点的读法',
        speech: '右边换成每段最右侧的函数值当高度。分割没有变，变的是每个小矩形选高度的位置。',
      },
      {
        marker: 'cyan',
        title: '公式只差取点',
        speech:
          '公式里的区别也只在这里：左端点用前一个切点，右端点用后一个切点。宽度还是同一批小区间宽度。',
      },
      {
        marker: 'yellow',
        title: '过渡到误差方向',
        speech:
          '接下来真正要判断的是，换了取点以后近似会偏大还是偏小。这个问题不能只看公式，要回到函数图像的单调性。',
      },
    ],
  ],
  [
    4,
    [
      {
        marker: 'red',
        title: '先别背结论',
        speech:
          '这一页的目标不是背四种情况，而是建立一个判断动作：先看函数往上走还是往下走，再看矩形高度取哪一端。',
      },
      {
        marker: 'lime',
        title: '递增时的误差',
        speech:
          '如果函数递增，左端点在每段较低的一边，所以矩形压在曲线下面；右端点在较高的一边，所以矩形会盖过曲线。',
      },
      {
        marker: 'blue',
        title: '递减时的误差',
        speech:
          '如果函数递减，方向正好反过来。左端点变成较高的一边，右端点变成较低的一边，误差方向也跟着反过来。',
      },
      {
        marker: 'cyan',
        title: '两步判断',
        speech:
          '做题时就按两步走：第一步判断递增还是递减，第二步判断取左端点还是右端点。这样不用临时猜高估还是低估。',
      },
      {
        marker: 'yellow',
        title: '练习时看变化',
        speech:
          '底部的问题提醒你，误差方向不是由左端点三个字单独决定的，而是由函数的变化方向和取点方式一起决定。',
      },
    ],
  ],
  [
    5,
    [
      {
        marker: 'red',
        title: '从近似走向定义',
        speech:
          '这一页正式进入定积分定义。前面每一次矩形和都只是近似，定义要问的是：当矩形越来越窄时，这些近似值会不会稳定下来。',
      },
      {
        marker: 'lime',
        title: '细分割的意义',
        speech:
          '左边的图像告诉我们为什么要变细。粗分割留下明显缝隙，细分割让矩形更贴近曲线，但这还只是视觉上的理由。',
      },
      {
        marker: 'blue',
        title: '网格大小不是格子数',
        speech:
          '右上角的网格大小不是问有多少个小区间，而是看最宽的那一段有多宽。让它趋近于零，意思是所有小区间都被压得足够细。',
      },
      {
        marker: 'cyan',
        title: '定义里的极限',
        speech:
          '定义公式把这件事说严谨：对越来越细的分割去看矩形和，如果它们逼近同一个数，我们就把这个数记成定积分。',
      },
      {
        marker: 'yellow',
        title: '为什么要管采样点',
        speech:
          '最关键的是，真正可积时，不同采样点最终也会被逼到同一个结果。否则面积值会依赖你的取点习惯，定义就站不稳。',
      },
      {
        marker: 'yellow',
        title: '本页带走一句话',
        speech:
          '所以本页要带走的不是符号外形，而是一句话：定积分是矩形和在分割无限变细时稳定下来的数。',
      },
    ],
  ],
  [
    6,
    [
      {
        marker: 'red',
        title: '性质是整理工具',
        speech:
          '这一页讲性质。它们不是新的面积定义，而是帮我们把复杂积分整理成更容易看、更容易算的形式。',
      },
      {
        marker: 'lime',
        title: '先看最基本的量感',
        speech:
          '区间长度为零时，没有宽度就没有累积面积；常数倍可以提出来，是因为每个小矩形的高度都被同样放大。',
      },
      {
        marker: 'blue',
        title: '函数可以拆开',
        speech: '中间的线性性质很常用。一个和差形式的函数，可以拆成几个更熟悉的积分分别处理。',
      },
      {
        marker: 'cyan',
        title: '区间也可以拆开',
        speech:
          '右边的性质是在切区间。先从 a 到 c，再从 c 到 b，两段累积加起来就是整段累积；至于变量叫 x 还是 t，只是记号名字。',
      },
      {
        marker: 'yellow',
        title: '使用顺序',
        speech:
          '实际做题时，先检查上下限和区间，再看能不能提出常数、拆和差、或者切区间。性质的作用是先整理，再计算。',
      },
    ],
  ],
  [
    7,
    [
      {
        marker: 'red',
        title: '从定义到计算',
        speech:
          '这一页是整本笔记的转折点。前面我们用矩形和定义面积，现在要得到一个更快的计算办法。',
      },
      {
        marker: 'lime',
        title: '面积对象没有变',
        speech:
          '左边提醒我们，定积分仍然是从 a 到 b 的累积面积。计算方法变了，但我们要算的对象没有变。',
      },
      {
        marker: 'blue',
        title: '原函数提供增长量',
        speech:
          '右边换成原函数视角。如果 F 的导数是 f，那么 f 的累积效果，正好对应 F 从起点到终点的增长量。',
      },
      {
        marker: 'cyan',
        title: '端点差公式',
        speech:
          '中间的公式就是把面积和增长量接起来。只要找到原函数，就不用真的把无数小矩形加起来，可以直接代端点。',
      },
      {
        marker: 'yellow',
        title: '计算模板',
        speech:
          '底部三步很重要：先找原函数，再代上限，最后减去代下限。算定积分时，答案应该是一个数。',
      },
    ],
  ],
  [
    8,
    [
      {
        marker: 'red',
        title: '例题目标',
        speech:
          '这一页用一个具体例题把基本定理二跑一遍。现在的任务不是解释面积从哪里来，而是练习怎样把定积分算成一个数。',
      },
      {
        marker: 'lime',
        title: '先读题目结构',
        speech:
          '题目里的被积函数是多项式，上下限也是固定数字，所以最直接的路线就是找原函数，然后代端点。',
      },
      {
        marker: 'blue',
        title: '找原函数',
        speech: '找原函数时逐项处理：x 的平方积分变成三分之一倍 x 的三次方，常数一积分变成 x。',
      },
      {
        marker: 'cyan',
        title: '代入端点',
        speech:
          '接下来把上限二代进去，再减去下限零代进去。这个减法顺序不能反，因为它对应的是从下限累积到上限。',
      },
      {
        marker: 'cyan',
        title: '读出结果',
        speech: '算出来的三分之十四就是这段累积的净结果。到这里，积分号和变量 x 都应该消失了。',
      },
      {
        marker: 'yellow',
        title: '检查答案形状',
        speech:
          '所以检查定积分答案时，先看它是不是一个数；如果最后还带着 x，通常说明只找了原函数，还没有完成端点代入。',
      },
    ],
  ],
  [
    9,
    [
      {
        marker: 'red',
        title: '反向识别',
        speech:
          '这一页反过来训练。看到极限求和式，不要急着展开求和，先把它还原成“宽度、采样点、函数、区间”这四件事。',
      },
      {
        marker: 'lime',
        title: '先找宽度',
        speech:
          '样本式里乘在外面的五除以 n，通常就是小区间宽度。宽度一旦看出来，区间长度也就有了线索。',
      },
      {
        marker: 'blue',
        title: '还原区间',
        speech:
          '如果总长度是五，又从零开始，最自然的区间就是从零到五。这里不是靠背答案，而是用宽度等于总长度除以 n 来反推。',
      },
      {
        marker: 'cyan',
        title: '识别函数值',
        speech:
          '接着把五 i 除以 n 看成右端点 x_i。剩下套在这个采样点外面的表达式，就是函数在采样点处的值。',
      },
      {
        marker: 'yellow',
        title: '写回定积分',
        speech:
          '最后把这三样放回定积分：区间给上下限，表达式给被积函数，求和极限就变成对应的定积分。',
      },
    ],
  ],
  [
    10,
    [
      {
        marker: 'red',
        title: '有限项近似',
        speech:
          '这一页不是要求极限，而是只用四个矩形做近似。题目规模很小，所以关键是切分准确，取点准确。',
      },
      {
        marker: 'lime',
        title: '切出宽度',
        speech:
          '区间从三十到三十八，总长度是八，分成四段后每段宽度就是二。宽度先定好，后面的高度才有位置可取。',
      },
      {
        marker: 'blue',
        title: '左端点列表',
        speech: '左端点近似取每段左边的数，所以四个高度来自三十、三十二、三十四、三十六。',
      },
      {
        marker: 'cyan',
        title: '右端点列表',
        speech: '右端点近似把每个取点向右移一格，所以会用到三十二、三十四、三十六、三十八。',
      },
      {
        marker: 'yellow',
        title: '判断估计方向',
        speech:
          '因为根号 x 在这个区间递增，左端点高度偏低，右端点高度偏高。于是左端点和低估，右端点和高估。',
      },
    ],
  ],
  [
    11,
    [
      {
        marker: 'red',
        title: '面积等于累计变化',
        speech:
          '这一页把定积分从面积语言翻译成变化量语言。导数下面的面积，表示原函数在这段时间里累计改变了多少。',
      },
      {
        marker: 'lime',
        title: '导数图的读法',
        speech: '左侧如果画的是导数，阴影面积就不是单纯几何装饰，而是在累加每一小段的变化率贡献。',
      },
      {
        marker: 'blue',
        title: '原函数视角',
        speech:
          '右侧换回原函数本身。同一段累积可以说成导数面积，也可以说成原函数从起点到终点的净增长。',
      },
      {
        marker: 'cyan',
        title: '公式连接两种语言',
        speech: '中间公式就是这两种语言的翻译：导数的定积分，等于原函数终点值减起点值。',
      },
      {
        marker: 'yellow',
        title: '为应用做准备',
        speech:
          '所以后面遇到最大最小或累计变化问题时，不只看某一点的导数，还要看一段区间里导数累计让函数上升了多少、下降了多少。',
      },
    ],
  ],
  [
    12,
    [
      {
        marker: 'red',
        title: '让上限动起来',
        speech:
          '这一页讲微积分基本定理一。前面上下限都是固定数，现在把上限换成 x，于是面积本身变成一个会随着 x 改变的函数。',
      },
      {
        marker: 'lime',
        title: '面积函数',
        speech:
          '左边的 F(x) 表示从固定起点 a 一直累积到当前位置 x。x 往右走一点，累积面积也跟着多出一小条。',
      },
      {
        marker: 'blue',
        title: '小薄条近似',
        speech: '这个新增小薄条很关键。当宽度 h 很小时，它的面积近似等于当前高度 f(x) 乘以宽度 h。',
      },
      {
        marker: 'cyan',
        title: '变化率回到高度',
        speech:
          '如果把新增面积除以 h，就是面积函数的平均变化率。让 h 趋近于零，这个变化率就回到当前图像高度 f(x)。',
      },
      {
        marker: 'yellow',
        title: '直接套用',
        speech: '所以看到从常数到 x 的变上限积分，求导时可以直接把被积函数带到上限 x。',
      },
      {
        marker: 'yellow',
        title: '别忘了适用条件',
        speech: '但这个直接结果依赖上限就是 x。如果上限不是单纯的 x，下一页还要把链式法则乘进去。',
      },
    ],
  ],
  [
    13,
    [
      {
        marker: 'red',
        title: '端点也会动',
        speech:
          '这一页处理更一般的变限积分。上下限不一定只是 x，它们自己也可能是 x 的函数，所以端点移动速度也要算进去。',
      },
      {
        marker: 'lime',
        title: '上限贡献',
        speech:
          '上限往右移动，会给面积函数增加右边的一小条。新增速度等于被积函数在上限处的值，再乘以上限自己的导数。',
      },
      {
        marker: 'blue',
        title: '下限贡献',
        speech: '下限往右移动时情况相反，它会删掉左边的一小条面积，所以这一项前面要带负号。',
      },
      {
        marker: 'cyan',
        title: '合并成总公式',
        speech:
          '把两端合起来，就是上限贡献减去下限贡献。每一端都要先把端点代进被积函数，再乘端点导数。',
      },
      {
        marker: 'yellow',
        title: '口头记忆',
        speech: '可以这样记：上限加，下限减；端点如果不是单纯 x，还要乘端点导数。',
      },
      {
        marker: 'yellow',
        title: '防止漏项',
        speech:
          '最常见的错误不是公式完全不会，而是代了端点却忘了乘端点导数，或者下限那一项忘了负号。',
      },
    ],
  ],
  [
    14,
    [
      {
        marker: 'red',
        title: '先拆外层结构',
        speech:
          '这一页是综合例题。综合题不要一上来套变限公式，先看外层结构：这里有一个 x 乘以内层积分。',
      },
      {
        marker: 'lime',
        title: '题目有两层',
        speech: '外面是乘积，里面是变上下限积分。也就是说，这题同时需要乘积法则和变限积分求导。',
      },
      {
        marker: 'blue',
        title: '乘积法则先展开',
        speech: '先对外层用乘积法则：一个项来自 x 的导数，另一个项保留 x，再乘以内层积分的导数。',
      },
      {
        marker: 'cyan',
        title: '再处理内层端点',
        speech:
          '内层上限是常数，所以没有上限贡献；下限是 x 的平方，会带一个负号，还要乘下限导数二 x。',
      },
      {
        marker: 'cyan',
        title: '把符号顺序说清',
        speech:
          '这里最容易错的地方是符号。下限贡献本来就要减，再乘上端点导数；先把结构写清楚，再代入化简。',
      },
      {
        marker: 'yellow',
        title: '最后用清单检查',
        speech:
          '底部清单就是防错顺序：外层法则有没有用，端点正负号有没有对，端点导数有没有乘，被积函数有没有代入正确端点。',
      },
    ],
  ],
  [
    15,
    [
      {
        marker: 'red',
        title: '公式表的用法',
        speech:
          '这一页是公式速查，但不要把它当成单纯背诵表。更重要的是看到题目时，能认出它属于哪一种形状。',
      },
      {
        marker: 'lime',
        title: '幂函数和指数',
        speech: '幂函数积分时指数加一，再除以新的指数；e 的 x 次方比较特殊，积分后形状还是它自己。',
      },
      {
        marker: 'blue',
        title: '三角函数符号',
        speech:
          '三角函数最容易错正负号。尤其正弦积分得到负余弦，余弦积分得到正弦，写完要快速检查一次。',
      },
      {
        marker: 'cyan',
        title: '反三角形状',
        speech:
          '右侧这些是形状识别：分母出现一加 x 的平方，常常想到反正切；出现一减 x 的平方再开根号，常常想到反正弦。',
      },
      {
        marker: 'yellow',
        title: '定积分和不定积分分开',
        speech:
          '最后要分清：不定积分要加常数；定积分要代上下限，最后得到一个数。公式只是入口，题型决定后续动作。',
      },
    ],
  ],
  [
    16,
    [
      {
        marker: 'red',
        title: '先选方法',
        speech:
          '这一页的重点不是马上算完，而是先判断每道题应该用哪条路线。方法选对了，计算才会稳。',
      },
      {
        marker: 'lime',
        title: '固定上下限计算',
        speech:
          '左侧这类固定上下限的多项式题，可以先展开或整理被积函数，再逐项积分，最后代上下限。',
      },
      {
        marker: 'blue',
        title: '公式识别',
        speech:
          '上方这题要先认形状。分母里有根号一减 x 的平方，很像反正弦公式，不要把它硬当成幂函数处理。',
      },
      {
        marker: 'cyan',
        title: '变上限求导',
        speech:
          '右侧如果上限是 x 的平方，就不能只把被积函数代入 x；要先代入 x 的平方，再乘上限导数二 x。',
      },
      {
        marker: 'yellow',
        title: '统一做题顺序',
        speech:
          '底部顺序可以作为自查：先看有没有上下限，再看上下限是否含 x，然后认公式或性质，最后才进入计算。',
      },
    ],
  ],
  [
    17,
    [
      {
        marker: 'red',
        title: '三种身份收束',
        speech: '最后一页把整本笔记收束起来。定积分不是一个孤立符号，而是三个视角指向同一个对象。',
      },
      {
        marker: 'lime',
        title: '定义身份',
        speech:
          '第一种身份是黎曼和的极限。它回答的是定义问题：面积怎样从许多小矩形的近似里稳定出来。',
      },
      {
        marker: 'blue',
        title: '图像身份',
        speech: '第二种身份是曲线下面积。它让定积分有直观含义：从 a 到 b，到底累积了多少。',
      },
      {
        marker: 'cyan',
        title: '计算身份',
        speech: '第三种身份是原函数增长量。它给出计算方法，把无数小矩形的累积变成两个端点值的差。',
      },
      {
        marker: 'yellow',
        title: '以后做题的路线',
        speech:
          '以后遇到题目，可以按底部清单走：先看区间和取点，再看有没有极限，最后判断能不能用微积分基本定理计算。',
      },
      {
        marker: 'yellow',
        title: '最后一句',
        speech:
          '如果你能在这三种身份之间来回切换，定积分就不再只是公式，而是一套从近似、到意义、到计算的完整语言。',
      },
    ],
  ],
]);

const PAGE_NARRATION_DETAILS = new Map([
  [
    1,
    [
      extraNarration(
        '固定速度的矩形',
        'lime',
        '为什么面积表示距离',
        '这里可以多停一下：横轴是时间，纵轴是速度，高度乘宽度就是速度乘时间，所以单位也会变成距离。这个单位检查能帮助你相信图像面积不是硬套出来的。',
      ),
      extraNarration(
        '变化速度的困难',
        'blue',
        '代表速度只是近似',
        '在变化速度里，每一小段其实也不是完全水平的。我们选一个代表速度，是先允许一点误差，再想办法让每段短到误差越来越小。',
      ),
      extraNarration(
        '把近似做细',
        'cyan',
        '细分割的直观意义',
        '切得更细时，不是矩形数量变多这么简单，而是每个矩形只负责很短的一段曲线。曲线在短段里更像水平线，矩形近似才会更可信。',
      ),
    ],
  ],
  [
    2,
    [
      extraNarration(
        '分割给出宽度',
        'blue',
        '每段宽度可以不同',
        '这里的宽度不一定都相等。一般定义允许每个小区间宽度不同，所以记号用 Δx_i，强调这是第 i 段自己的宽度。',
      ),
      extraNarration(
        '采样给出高度',
        'cyan',
        '代表点不一定在端点',
        '代表点可以取左端、右端，也可以取中点或小区间里的其他点。它只负责决定对应矩形的高度。',
      ),
      extraNarration(
        '黎曼和的含义',
        'yellow',
        '求和号逐块读取',
        '读求和式时可以一项一项翻译：第 i 块的面积是 f(c_i) 乘 Δx_i，求和号只是说把所有这些小面积加起来。',
      ),
    ],
  ],
  [
    3,
    [
      extraNarration(
        '左端点的读法',
        'lime',
        '左端点不是永远偏小',
        '左端点和只是说明高度在哪里取，不自动说明结果偏大还是偏小。偏大偏小还要结合函数在每段里是上升还是下降。',
      ),
      extraNarration(
        '右端点的读法',
        'blue',
        '同一分割方便比较',
        '左右端点和最好放在同一分割下比较。这样宽度完全一样，差别就只来自高度取在左边还是右边。',
      ),
      extraNarration(
        '公式只差取点',
        'cyan',
        '公式背后仍是矩形',
        '公式里的下标变化看起来抽象，但图上仍然是在移动每个矩形的高度位置。把符号和图像连起来，才不容易混。',
      ),
    ],
  ],
  [
    4,
    [
      extraNarration(
        '递增时的误差',
        'lime',
        '每个小区间都同向',
        '递增函数里，每一小段左端高度都比右侧曲线低一些，所以每块都偏低；右端点则每块都偏高。',
      ),
      extraNarration(
        '递减时的误差',
        'blue',
        '方向反转的原因',
        '递减时，左端点反而在高的一边，右端点在低的一边。不是规则变了，而是函数走势换了方向。',
      ),
      extraNarration(
        '两步判断',
        'cyan',
        '先画箭头再判断',
        '做题时可以先在曲线上画一个上升或下降箭头，再标出取左还是取右。这个小动作比直接背结论稳定很多。',
      ),
    ],
  ],
  [
    5,
    [
      extraNarration(
        '细分割的意义',
        'lime',
        '细不是平均细',
        '定义里要求最宽的小区间也趋近于零，意思是不能只把大多数地方切细，却留下某一段特别宽。',
      ),
      extraNarration(
        '定义里的极限',
        'cyan',
        '稳定值才是积分',
        '极限存在时，矩形和不再依赖某一次粗略画法，而是向同一个稳定数靠近。定积分定义抓住的就是这个稳定数。',
      ),
      extraNarration(
        '为什么要管采样点',
        'yellow',
        '取点自由不是随便',
        '定义允许不同采样点，是因为分割足够细以后，合理函数的这些选择会被挤到同一个结果。这个结果才配叫面积。',
      ),
    ],
  ],
  [
    6,
    [
      extraNarration(
        '先看最基本的量感',
        'lime',
        '零长度区间的直觉',
        '上下限相同时，横向没有宽度，小矩形再高也没有面积。这条性质常用来快速处理边界相同的积分。',
      ),
      extraNarration(
        '函数可以拆开',
        'blue',
        '线性来自逐块相加',
        '线性性质可以从矩形和想象出来：每一块高度相加，最后整段面积也相加；常数倍则是所有高度一起缩放。',
      ),
      extraNarration(
        '区间也可以拆开',
        'cyan',
        '切区间要保持方向',
        '切区间时要注意方向。如果上下限反过来，积分会变号；所以拆分前先看 a、c、b 的顺序。',
      ),
    ],
  ],
  [
    7,
    [
      extraNarration(
        '原函数提供增长量',
        'blue',
        '为什么是增长量',
        '如果 f 是 F 的变化率，那么 f 在一段上的累积效果，就是 F 在这段上总共变了多少。这就是端点差出现的原因。',
      ),
      extraNarration(
        '端点差公式',
        'cyan',
        '常数项会自动抵消',
        '原函数可以差一个常数，但代上限再减下限时，那个常数会抵消。所以定积分只关心增长量，不关心原函数整体上移了多少。',
      ),
      extraNarration(
        '计算模板',
        'yellow',
        '结果应该没有 x',
        '算完定积分以后，x 已经被上下限吃掉了。答案如果还带着 x，通常说明你只写了不定积分，还没完成代端点。',
      ),
    ],
  ],
  [
    8,
    [
      extraNarration(
        '先读题目结构',
        'lime',
        '先定方法再动笔',
        '看到固定上下限和可直接积分的函数，优先想到微积分基本定理二。这个判断能避免重新回到矩形和定义。',
      ),
      extraNarration(
        '找原函数',
        'blue',
        '逐项积分要带系数',
        '找原函数时每一项都要处理自己的系数和指数，尤其是幂函数积分后的分母，不能只改指数不改系数。',
      ),
      extraNarration(
        '代入端点',
        'cyan',
        '括号先完整代入',
        '代上限和下限时，最好先写成 F(上限)-F(下限)。不要一边代一边心算，否则负号和括号最容易出错。',
      ),
    ],
  ],
  [
    9,
    [
      extraNarration(
        '先找宽度',
        'lime',
        'Δx 暗示区间长度',
        '从极限和式反推定积分时，先看 Δx 的形式。它通常告诉我们区间长度除以 n，从而反推出积分区间。',
      ),
      extraNarration(
        '识别函数值',
        'cyan',
        '把样本点塞回函数',
        '接着把 c_i 的表达式看成自变量位置，把和式里剩下的部分读成 f(c_i)。这一步是在从求和语言翻译回函数语言。',
      ),
      extraNarration(
        '写回定积分',
        'yellow',
        '别漏积分变量',
        '最后写定积分时要同时写上下限、函数和 dx。少了 dx，就没有说清楚这是对哪个变量的累积。',
      ),
    ],
  ],
  [
    10,
    [
      extraNarration(
        '切出宽度',
        'lime',
        '先算 Δx',
        '有限项近似的第一步总是算每一段宽度。宽度错了，后面左端点和右端点列表都会跟着错。',
      ),
      extraNarration(
        '左端点列表',
        'blue',
        '列表比心算稳',
        '把左端点逐个列出来，是为了防止少一项或多一项。四个小区间就应该有四个取样点。',
      ),
      extraNarration(
        '判断估计方向',
        'yellow',
        '近似值也要解释',
        '算出数值以后还要解释它是高估还是低估。近似题不只是算和式，也要能读图像走势。',
      ),
    ],
  ],
  [
    11,
    [
      extraNarration(
        '导数图的读法',
        'lime',
        '面积带符号',
        '导数图在横轴上方时贡献正增长，在横轴下方时贡献负增长。所以这里的面积更准确地说是带符号的累积。',
      ),
      extraNarration(
        '原函数视角',
        'blue',
        '增长量不等于终值',
        '积分给的是原函数从起点到终点的变化量，不一定是终点的函数值。要知道终值，还需要起始值。',
      ),
      extraNarration(
        '公式连接两种语言',
        'cyan',
        '图像和代数互相翻译',
        '这条公式让我们在两种语言之间切换：看图时读累积变化，计算时用端点差。',
      ),
    ],
  ],
  [
    12,
    [
      extraNarration(
        '面积函数',
        'lime',
        '上限移动才会变',
        '下限固定时，面积函数的变化来自右端点往外移动。右端点多走一点，就多扫出一条很薄的面积。',
      ),
      extraNarration(
        '小薄条近似',
        'blue',
        '薄条高度来自当前点',
        '这一小条的宽度是 Δx，高度近似是 f(x)。所以面积增加量除以 Δx 后，会回到当前点的函数高度。',
      ),
      extraNarration(
        '直接套用',
        'yellow',
        '先识别上限是不是 x',
        '直接套公式前先看上限是不是单纯的 x。如果上限是更复杂的函数，下一页就要再乘上链式法则的因子。',
      ),
    ],
  ],
  [
    13,
    [
      extraNarration(
        '上限贡献',
        'lime',
        '上限用正号',
        '上限往右移动会增加积分区间，所以它的贡献带正号。再乘上上限函数自己的导数。',
      ),
      extraNarration(
        '下限贡献',
        'blue',
        '下限用负号',
        '下限往右移动会缩短积分区间，所以它的贡献带负号。这个负号是变上下限题最容易漏掉的地方。',
      ),
      extraNarration(
        '合并成总公式',
        'cyan',
        '先分别算再合并',
        '遇到上下限都动的题，先把上限项和下限项分别写出来，再合并。不要一开始就心算成一个式子。',
      ),
    ],
  ],
  [
    14,
    [
      extraNarration(
        '题目有两层',
        'lime',
        '先看外层运算',
        '综合题常常把积分函数放进乘积、商或复合函数里。先处理外层求导规则，再处理积分端点。',
      ),
      extraNarration(
        '乘积法则先展开',
        'blue',
        '不要把积分当常数',
        '如果一个因子本身是变上限积分，它也会随 x 改变。乘积法则里这一项必须求导，不能当成常数带过。',
      ),
      extraNarration(
        '再处理内层端点',
        'cyan',
        '端点求导再乘回来',
        '处理积分因子的导数时，先把端点代入被积函数，再乘端点导数。这就是微积分基本定理一和链式法则叠在一起。',
      ),
    ],
  ],
  [
    15,
    [
      extraNarration(
        '幂函数和指数',
        'lime',
        '公式要看适用条件',
        '幂函数公式里最容易忘的是 n 不能等于负一。遇到一除以 x，要切换到对数，而不是套普通幂函数公式。',
      ),
      extraNarration(
        '三角函数符号',
        'blue',
        '负号来自导数表',
        '三角函数的积分符号可以用导数反查。比如 cos 的导数带负号，所以 sec 和 csc 以外的基础三角积分也要反复检查符号。',
      ),
      extraNarration(
        '定积分和不定积分分开',
        'yellow',
        '常数 C 的位置',
        '不定积分需要加 C，因为答案是一族原函数。定积分已经代入上下限，结果是具体数，不再加 C。',
      ),
    ],
  ],
  [
    16,
    [
      extraNarration(
        '固定上下限计算',
        'lime',
        '先判断是否直接可积',
        '第一类题先看能不能直接找原函数。能直接用基本定理二，就不要把问题复杂化。',
      ),
      extraNarration(
        '变上限求导',
        'cyan',
        '先套端点再链式',
        '变上限题的顺序是先把端点代进被积函数，再乘端点导数。这个顺序能防止把链式法则漏掉。',
      ),
      extraNarration(
        '统一做题顺序',
        'yellow',
        '每题都先分类',
        '综合练习最重要的是分类：是近似、定义、计算，还是变上限求导。分类清楚，方法就跟着清楚。',
      ),
    ],
  ],
  [
    17,
    [
      extraNarration(
        '定义身份',
        'lime',
        '定义回答它是什么',
        '矩形和极限告诉我们定积分是什么：它是越来越细的近似和稳定下来的数。这是概念层面的身份。',
      ),
      extraNarration(
        '图像身份',
        'blue',
        '图像回答它表示什么',
        '曲线下面积告诉我们定积分可以表示什么。尤其当函数为负时，要记得它表示带符号面积。',
      ),
      extraNarration(
        '计算身份',
        'cyan',
        '基本定理回答怎么快算',
        '原函数增长量告诉我们怎么计算。定义给意义，图像给直觉，基本定理给效率，这三件事要同时留住。',
      ),
    ],
  ],
]);

function expandNarration(pageNumber, narration) {
  const details = PAGE_NARRATION_DETAILS.get(pageNumber);
  if (!Array.isArray(details) || !details.length) return narration;

  const detailsByTitle = new Map();
  for (const detail of details) {
    const group = detailsByTitle.get(detail.afterTitle) ?? [];
    group.push({
      marker: detail.marker,
      title: detail.title,
      speech: detail.speech,
    });
    detailsByTitle.set(detail.afterTitle, group);
  }

  const expanded = [];
  for (const step of narration) {
    expanded.push(step);
    const extraSteps = detailsByTitle.get(step.title);
    if (extraSteps) expanded.push(...extraSteps);
  }
  return expanded;
}

function pageLabel(pageNumber) {
  return String(pageNumber).padStart(3, '0');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function markerFor(name) {
  const marker = MARKERS.find((item) => item.name === name);
  if (!marker) throw new Error(`Unknown marker: ${name}`);
  return marker;
}

function markerCoords(markerName) {
  const coords = {
    red: [
      [370, 25],
      [1230, 25],
      [370, 145],
      [1230, 145],
    ],
    lime: [
      [55, 185],
      [745, 185],
      [55, 660],
      [745, 660],
    ],
    blue: [
      [875, 170],
      [1530, 170],
      [875, 365],
      [1530, 365],
    ],
    cyan: [
      [820, 385],
      [1210, 385],
      [820, 670],
      [1210, 670],
    ],
    magenta: [
      [1240, 390],
      [1580, 390],
      [1240, 680],
      [1580, 680],
    ],
    yellow: [
      [330, 710],
      [1290, 710],
      [330, 860],
      [1290, 860],
    ],
  };
  return coords[markerName] || coords.yellow;
}

function compilePrompt(page, pageNumber) {
  const markerLines = page.components
    .map((component) => {
      const marker = markerFor(component.marker);
      const coords = markerCoords(component.marker)
        .map(([x, y]) => `(${x},${y})`)
        .join(', ');
      return [
        `${component.label}`,
        `Marker color: pure ${marker.hex} (${marker.cn}).`,
        `Approx marker corners: ${coords}.`,
        `Content: ${component.content}`,
        `Draw exactly four isolated ${marker.hex} corner squares around this whole semantic component.`,
      ].join('\n');
    })
    .join('\n\n');

  const validation = page.components
    .map((component) => {
      const marker = markerFor(component.marker);
      return `4 ${marker.name} ${marker.hex}`;
    })
    .join(', ');

  return `Use case: scientific-educational
Asset type: 16:9 hand-drawn Chinese calculus notebook slide with recoverable component corner markers

Generate page ${pageNumber} of a Chinese calculus notebook as a marker source image. The image itself must contain the colored corner markers; later software will recover the regions and remove the markers.

Hard visible-text rules:
- All visible prose, headings, labels, and question text must be Simplified Chinese.
- Do not write any course code, course name, teacher name, date, page number, or week label.
- Do not write MAT136, Calculus II, Week, 第1周, 页码, Page, or any English prose.
- Do not write component numbers or circled numbers before headings.
- Standard math notation is allowed: f(x), P, c_i, x_i, Δx_i, Σ, ∫, lim, max, L_n, R_n.

Slide title: “${page.title}”

Style:
- White graph-paper notebook background with faint light-gray grid.
- Common classroom hand-drawn marker style, neat and legible.
- Black marker text and formulas; deep teal graphs; pale teal fills; muted brown arrows.
- Normal content must not use pure red, pure lime, pure blue, pure cyan, pure magenta, or pure yellow.
- No photorealism, no UI chrome, no watermark.
- Do not draw component boxes, borders, frames, brackets, panels, or guide lines.

Flexible layout:
- Do not use a rigid equal-column layout.
- Use varied component sizes and staggered placement.
- Separate semantic components by whitespace only.
- Keep each component compact and self-contained; do not split one component into far-apart islands.
- Layout guidance: ${page.layout}

Marker rules, highest priority:
- Exactly ${page.components.length * 4} solid colored square markers total.
- For each semantic component, draw exactly four isolated colored square markers: top-left, top-right, bottom-left, bottom-right.
- Marker squares are about 18 px, solid filled, no outline, no shadow.
- Put markers just outside the semantic component boundary, not touching text, formulas, graph lines, arrows, or fills.
- Do not connect markers. Do not draw colored rectangles, colored outlines, or colored brackets.
- The only pure-color marks in the image are these marker squares.

Semantic components:

${markerLines}

Validation target:
The output is valid only if it contains exactly ${page.components.length * 4} isolated colored square markers: ${validation}. No course code, no page number, no week label, no component numbering.`;
}

function buildPromptPlan(page, pageNumber, compiledImagePrompt) {
  const promptHash = crypto.createHash('sha256').update(compiledImagePrompt).digest('hex');
  const markerCountsByColor = {};
  const componentPlans = page.components.map((component, index) => {
    const marker = markerFor(component.marker);
    markerCountsByColor[marker.hex] = 4;
    return {
      id: `${NOTEBOOK_ID}-p${pageLabel(pageNumber)}-${marker.name}`,
      label: component.label,
      role: component.role,
      order: index + 1,
      markerColorName: marker.name,
      markerColorHex: marker.hex,
      visibleText: [component.content],
      formulas: [],
      diagramPrompt: component.content,
      participatesInMask: true,
    };
  });
  return {
    schemaVersion: 1,
    canvas: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT, aspectRatio: '16:9' },
    componentPlans,
    markerProtocol: {
      type: 'corner-square-markers',
      markerSizePx: 18,
      markerCountPerComponent: 4,
      colorPool: MARKERS.map(({ name, hex }) => ({ name, hex })),
      ordinaryContentForbiddenColors: MARKERS.map((marker) => marker.hex),
    },
    compiledImagePrompt,
    promptHash,
    validationTarget: {
      maskableComponentCount: componentPlans.length,
      totalMarkerCount: componentPlans.length * 4,
      markerCountsByColor,
    },
    recoveryResult: { status: 'pending' },
  };
}

function preparePrompts() {
  const promptDir = path.join(QUEUE_DIR, 'v2-prompts');
  const planDir = path.join(QUEUE_DIR, 'v2-prompt-plans');
  ensureDir(promptDir);
  ensureDir(planDir);
  for (const [index, page] of PAGES.entries()) {
    const pageNumber = index + 1;
    const label = pageLabel(pageNumber);
    const prompt = compilePrompt(page, pageNumber);
    fs.writeFileSync(path.join(promptDir, `page-${label}.prompt.md`), prompt);
    writeJson(
      path.join(planDir, `page-${label}.prompt-plan.json`),
      buildPromptPlan(page, pageNumber, prompt),
    );
  }
  writeJson(path.join(QUEUE_DIR, 'v2-outline.json'), {
    notebookId: NOTEBOOK_ID,
    title: '定积分：从矩形到基本定理',
    pageCount: PAGES.length,
    rules: {
      imageLanguage: 'Simplified Chinese only; formulas may use standard math notation',
      forbiddenImageLabels: ['course code', 'page number', 'week label'],
      workflow: 'marker source image -> marker recovery -> clean student image',
    },
    pages: PAGES.map((page, index) => ({
      pageNumber: index + 1,
      title: page.title,
      sceneTitle: page.sceneTitle,
      components: page.components.map(({ label, role, marker }) => ({ label, role, marker })),
    })),
  });
  console.log(`[prepare] wrote ${PAGES.length} prompts to ${promptDir}`);
}

function latestGeneratedImage() {
  const files = fs
    .readdirSync(GENERATED_IMAGE_ROOT)
    .filter((file) => file.endsWith('.png'))
    .map((file) => path.join(GENERATED_IMAGE_ROOT, file))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (!files.length) throw new Error(`No generated images found in ${GENERATED_IMAGE_ROOT}`);
  return files[0];
}

function adoptLatest(pageNumber) {
  const src = latestGeneratedImage();
  const label = pageLabel(pageNumber);
  const out = path.join(QUEUE_DIR, 'v2-marker-generated', `page-${label}.png`);
  ensureDir(path.dirname(out));
  fs.copyFileSync(src, out);
  console.log(`[adopt] page-${label} <- ${src}`);
}

async function decodeRaw(filePath) {
  const { data, info } = await sharp(filePath)
    .resize(SOURCE_WIDTH, SOURCE_HEIGHT, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function componentsForColor(raw, marker) {
  const mask = new Uint8Array(raw.width * raw.height);
  for (let i = 0, p = 0; i < raw.data.length; i += 3, p += 1) {
    if (marker.match(raw.data[i] || 0, raw.data[i + 1] || 0, raw.data[i + 2] || 0)) mask[p] = 1;
  }
  const seen = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  const components = [];
  for (let y = 0; y < raw.height; y += 1) {
    for (let x = 0; x < raw.width; x += 1) {
      const start = y * raw.width + x;
      if (!mask[start] || seen[start]) continue;
      let head = 0;
      let tail = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let area = 0;
      queue[tail++] = start;
      seen[start] = 1;
      while (head < tail) {
        const cur = queue[head++] || 0;
        const cx = cur % raw.width;
        const cy = Math.floor(cur / raw.width);
        area += 1;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || nx >= raw.width || ny < 0 || ny >= raw.height) continue;
            const ni = ny * raw.width + nx;
            if (!mask[ni] || seen[ni]) continue;
            seen[ni] = 1;
            queue[tail++] = ni;
          }
        }
      }
      const width = maxX - minX + 1;
      const height = maxY - minY + 1;
      const aspect = width / Math.max(1, height);
      const fillRatio = area / Math.max(1, width * height);
      if (
        area >= 18 &&
        width >= 4 &&
        height >= 4 &&
        width <= 90 &&
        height <= 90 &&
        aspect >= 0.25 &&
        aspect <= 3.5 &&
        fillRatio >= 0.12
      ) {
        components.push({ minX, minY, maxX, maxY, width, height, area });
      }
    }
  }
  return components;
}

function componentCenter(component) {
  return {
    x: component.minX + component.width / 2,
    y: component.minY + component.height / 2,
  };
}

function cornerScore(corner, nx, ny) {
  if (corner === 'top-left') return nx + ny;
  if (corner === 'top-right') return 1 - nx + ny;
  if (corner === 'bottom-left') return nx + (1 - ny);
  return 1 - nx + (1 - ny);
}

function selectCornerHits(components) {
  if (components.length < 4) return [];
  const centers = components.map(componentCenter);
  const left = Math.min(...centers.map((center) => center.x));
  const top = Math.min(...centers.map((center) => center.y));
  const right = Math.max(...centers.map((center) => center.x));
  const bottom = Math.max(...centers.map((center) => center.y));
  const width = right - left;
  const height = bottom - top;
  if (width < 32 || height < 32) return [];
  const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
  const candidatesByCorner = corners.map((corner) =>
    components
      .map((component) => {
        const center = componentCenter(component);
        return {
          corner,
          component,
          score: cornerScore(corner, (center.x - left) / width, (center.y - top) / height),
        };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, Math.min(8, components.length)),
  );
  let best = [];
  let bestScore = Infinity;
  const used = new Set();
  const current = [];
  const search = (index, score) => {
    if (score >= bestScore) return;
    if (index >= corners.length) {
      best = current.slice();
      bestScore = score;
      return;
    }
    for (const candidate of candidatesByCorner[index] || []) {
      if (used.has(candidate.component)) continue;
      used.add(candidate.component);
      current.push({ corner: candidate.corner, component: candidate.component });
      search(index + 1, score + candidate.score);
      current.pop();
      used.delete(candidate.component);
    }
  };
  search(0, 0);
  return best.length === 4 ? best : [];
}

function bboxFromComponents(components) {
  return [
    Math.min(...components.map((component) => component.minX)),
    Math.min(...components.map((component) => component.minY)),
    Math.max(...components.map((component) => component.maxX)),
    Math.max(...components.map((component) => component.maxY)),
  ];
}

function toCanvasBbox(sourceBbox, raw) {
  return [
    round1((sourceBbox[0] / raw.width) * CANVAS_WIDTH),
    round1((sourceBbox[1] / raw.height) * CANVAS_HEIGHT),
    round1((sourceBbox[2] / raw.width) * CANVAS_WIDTH),
    round1((sourceBbox[3] / raw.height) * CANVAS_HEIGHT),
  ];
}

function median(values, fallback = 248) {
  if (!values.length) return fallback;
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] ?? fallback;
}

function isMarkerPixel(r, g, b) {
  return MARKERS.some((marker) => marker.match(r, g, b));
}

async function writeCleanImage(raw, markerComponents, outPath) {
  const out = Buffer.from(raw.data);
  for (const component of markerComponents) {
    const pad = 7;
    const x1 = Math.max(0, Math.floor(component.minX - pad));
    const y1 = Math.max(0, Math.floor(component.minY - pad));
    const x2 = Math.min(raw.width - 1, Math.ceil(component.maxX + pad));
    const y2 = Math.min(raw.height - 1, Math.ceil(component.maxY + pad));
    const samplePad = 22;
    const rs = [];
    const gs = [];
    const bs = [];
    for (
      let y = Math.max(0, y1 - samplePad);
      y <= Math.min(raw.height - 1, y2 + samplePad);
      y += 1
    ) {
      for (
        let x = Math.max(0, x1 - samplePad);
        x <= Math.min(raw.width - 1, x2 + samplePad);
        x += 1
      ) {
        if (x >= x1 && x <= x2 && y >= y1 && y <= y2) continue;
        const i = (y * raw.width + x) * 3;
        const r = raw.data[i] || 0;
        const g = raw.data[i + 1] || 0;
        const b = raw.data[i + 2] || 0;
        if (isMarkerPixel(r, g, b)) continue;
        rs.push(r);
        gs.push(g);
        bs.push(b);
      }
    }
    const r = median(rs);
    const g = median(gs);
    const b = median(bs);
    for (let y = y1; y <= y2; y += 1) {
      for (let x = x1; x <= x2; x += 1) {
        const i = (y * raw.width + x) * 3;
        out[i] = r;
        out[i + 1] = g;
        out[i + 2] = b;
      }
    }
  }
  ensureDir(path.dirname(outPath));
  await sharp(out, { raw: { width: raw.width, height: raw.height, channels: 3 } })
    .png()
    .toFile(outPath);
}

async function recoverPage(pageNumber) {
  const label = pageLabel(pageNumber);
  const markerInput = path.join(QUEUE_DIR, 'v2-marker-generated', `page-${label}.png`);
  const promptPlanPath = path.join(QUEUE_DIR, 'v2-prompt-plans', `page-${label}.prompt-plan.json`);
  if (!fs.existsSync(markerInput)) throw new Error(`Missing marker image: ${markerInput}`);
  if (!fs.existsSync(promptPlanPath)) throw new Error(`Missing prompt plan: ${promptPlanPath}`);
  const promptPlan = readJson(promptPlanPath);
  ensureDir(PUBLIC_DIR);
  const markerPublic = path.join(PUBLIC_DIR, `v2-marker-slide-${label}.png`);
  const cleanPublic = path.join(PUBLIC_DIR, `v2-slide-${label}.png`);
  await sharp(markerInput)
    .resize(SOURCE_WIDTH, SOURCE_HEIGHT, { fit: 'fill' })
    .png()
    .toFile(markerPublic);
  const raw = await decodeRaw(markerPublic);
  const findings = [];
  const recoveredComponents = [];
  const allMarkerComponents = [];
  for (const component of promptPlan.componentPlans) {
    const marker = markerFor(component.markerColorName);
    const components = componentsForColor(raw, marker);
    allMarkerComponents.push(...components);
    const hits = selectCornerHits(components);
    const sourceBbox =
      hits.length === 4 ? bboxFromComponents(hits.map((hit) => hit.component)) : undefined;
    if (components.length !== 4) {
      findings.push(
        `${component.label}: expected 4 ${marker.name} markers, recovered ${components.length}`,
      );
    }
    if (!sourceBbox) {
      findings.push(`${component.label}: could not recover a four-corner bbox`);
    }
    recoveredComponents.push({
      componentId: component.id,
      markerColorHex: marker.hex,
      bbox: sourceBbox ? toCanvasBbox(sourceBbox, raw) : undefined,
      markerPoints: hits.map((hit) => {
        const center = componentCenter(hit.component);
        return {
          corner: hit.corner,
          x: round1((center.x / raw.width) * CANVAS_WIDTH),
          y: round1((center.y / raw.height) * CANVAS_HEIGHT),
        };
      }),
      markerCount: components.length,
    });
  }
  await writeCleanImage(raw, allMarkerComponents, cleanPublic);
  const recoveryResult = {
    status: findings.length ? 'failed' : 'passed',
    recoveredAt: Date.now(),
    originalMarkerImageUrl: `${PUBLIC_PATH}/v2-marker-slide-${label}.png`,
    cleanImageUrl: `${PUBLIC_PATH}/v2-slide-${label}.png`,
    originalMarkerImageDimensions: { width: raw.width, height: raw.height },
    findings,
    components: recoveredComponents,
  };
  const nextPlan = { ...promptPlan, recoveryResult };
  writeJson(promptPlanPath, nextPlan);
  return { pageNumber, recoveryResult };
}

async function recoverPages(pageNumbers) {
  const summary = [];
  for (const pageNumber of pageNumbers) {
    const result = await recoverPage(pageNumber);
    summary.push({
      pageNumber,
      status: result.recoveryResult.status,
      findings: result.recoveryResult.findings,
    });
    console.log(`[recover] page-${pageLabel(pageNumber)} ${result.recoveryResult.status}`);
  }
  writeJson(path.join(QUEUE_DIR, 'v2-marker-recovery-summary.json'), summary);
}

function focusRegionsFromPlan(promptPlan) {
  const recoveredById = new Map(
    (promptPlan.recoveryResult?.components || [])
      .filter((component) => component.bbox && (component.markerPoints?.length || 0) === 4)
      .map((component) => [component.componentId, component]),
  );
  return promptPlan.componentPlans
    .flatMap((component, index) => {
      const recovered = recoveredById.get(component.id);
      if (!recovered?.bbox) return [];
      const [left, top, right, bottom] = recovered.bbox;
      return {
        id: component.id,
        label: component.label,
        role: component.role,
        left,
        top,
        width: round1(Math.max(20, right - left)),
        height: round1(Math.max(20, bottom - top)),
        order: index + 1,
      };
    })
    .sort((a, b) => a.order - b.order);
}

function imageElement(pageNumber) {
  const label = pageLabel(pageNumber);
  return {
    id: `${NOTEBOOK_ID}-v2-image-${label}`,
    type: 'image',
    left: 0,
    top: 0,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    rotate: 0,
    fixedRatio: false,
    src: `${PUBLIC_PATH}/v2-slide-${label}.png`,
    imageType: 'pageFigure',
    radius: 0,
  };
}

function hotspotElement(region) {
  return {
    id: region.id,
    name: `semantic-hit-map: ${region.label}`,
    type: 'shape',
    left: region.left,
    top: region.top,
    width: region.width,
    height: region.height,
    rotate: 0,
    lock: true,
    viewBox: [200, 200],
    path: HOTSPOT_PATH,
    fixedRatio: false,
    fill: '#ffffff',
    outline: { color: '#ffffff', width: 0, style: 'solid' },
    opacity: 0,
  };
}

function actionsForPage(page, pageNumber, focusRegions) {
  const focusByMarker = new Map();
  for (const region of focusRegions) {
    const markerName = region.id.split('-').at(-1);
    focusByMarker.set(markerName, region);
  }
  const actions = [];

  const baseNarration =
    Array.isArray(page.narration) && page.narration.length
      ? page.narration
      : PAGE_NARRATIONS.get(pageNumber);
  const narration = Array.isArray(baseNarration)
    ? expandNarration(pageNumber, baseNarration)
    : baseNarration;

  if (Array.isArray(narration) && narration.length) {
    for (const [index, step] of narration.entries()) {
      const sequence = String(index + 1).padStart(2, '0');
      const region = step.marker ? focusByMarker.get(step.marker) : null;
      const title = step.title || region?.label || page.sceneTitle;
      const actionBase = `${NOTEBOOK_ID}-p${pageLabel(pageNumber)}-n${sequence}${
        step.marker ? `-${step.marker}` : ''
      }`;

      if (region && step.spotlight !== false) {
        actions.push({
          id: `${actionBase}-spotlight`,
          type: 'spotlight',
          elementId: region.id,
          title,
          description: `聚焦“${region.label}”区域。`,
          dimOpacity: 0.68,
        });
      }
      if (typeof step.speech === 'string' && step.speech.trim()) {
        actions.push({
          id: `${actionBase}-speech`,
          type: 'speech',
          title,
          text: step.speech,
        });
      }
    }
    return actions;
  }

  for (const component of page.components) {
    const region = focusByMarker.get(component.marker);
    if (!region) continue;
    const actionBase = `${NOTEBOOK_ID}-p${pageLabel(pageNumber)}-${component.marker}`;
    actions.push({
      id: `${actionBase}-spotlight`,
      type: 'spotlight',
      elementId: region.id,
      title: component.label,
      description: `聚焦“${component.label}”区域。`,
      dimOpacity: 0.68,
    });
    if (typeof component.speech === 'string' && component.speech.trim()) {
      actions.push({
        id: `${actionBase}-speech`,
        type: 'speech',
        title: component.label,
        text: component.speech,
      });
    }
  }
  return actions;
}

function canvasFor(pageNumber, focusRegions) {
  return {
    id: `${NOTEBOOK_ID}-v2-canvas-${pageLabel(pageNumber)}`,
    viewportSize: CANVAS_WIDTH,
    viewportRatio: 16 / 9,
    theme: {
      backgroundColor: '#ffffff',
      themeColors: ['#0f766e', '#334155', '#a16207', '#0f172a'],
      fontColor: '#0f172a',
      fontName: 'Inter',
      outline: { color: '#0f766e', width: 2, style: 'solid' },
      shadow: { h: 0, v: 0, blur: 10, color: '#000000' },
    },
    elements: [imageElement(pageNumber), ...focusRegions.map(hotspotElement)],
    background: { type: 'solid', color: '#ffffff' },
    type: 'content',
  };
}

function writeNarrationFiles() {
  const narrationDir = path.join(QUEUE_DIR, 'v2-narration');
  ensureDir(narrationDir);
  for (const [index, page] of PAGES.entries()) {
    const pageNumber = index + 1;
    const label = pageLabel(pageNumber);
    const promptPlan = readJson(
      path.join(QUEUE_DIR, 'v2-prompt-plans', `page-${label}.prompt-plan.json`),
    );
    const focusRegions = focusRegionsFromPlan(promptPlan);
    const actions = actionsForPage(page, pageNumber, focusRegions);
    writeJson(path.join(narrationDir, `page-${label}.actions.json`), {
      schemaVersion: 1,
      notebookId: NOTEBOOK_ID,
      pageNumber,
      sceneTitle: page.sceneTitle,
      imagePath: `${PUBLIC_PATH}/v2-slide-${label}.png`,
      markerSourceImagePath: `${PUBLIC_PATH}/v2-marker-slide-${label}.png`,
      focusRegions,
      actions,
      qa: {
        language: 'zh-CN',
        noCourseCodePageNumberOrWeekInPrompt: true,
        spotlightTargetsExist: actions
          .filter((action) => action.type === 'spotlight')
          .every((action) => focusRegions.some((region) => region.id === action.elementId)),
        speechCount: actions.filter((action) => action.type === 'speech').length,
        focusCount: focusRegions.length,
      },
    });
  }
  console.log(`[narration] wrote ${PAGES.length} files`);
}

async function renderContactSheet() {
  const columns = 3;
  const thumbWidth = 480;
  const thumbHeight = 270;
  const labelHeight = 30;
  const composites = [];
  for (let pageNumber = 1; pageNumber <= PAGES.length; pageNumber += 1) {
    const label = pageLabel(pageNumber);
    const file = path.join(PUBLIC_DIR, `v2-slide-${label}.png`);
    const labelSvg = `<svg width="${thumbWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="${thumbWidth}" height="${labelHeight}" fill="#0f172a"/><text x="12" y="21" fill="#ffffff" font-size="15" font-family="Arial">${pageNumber}. ${PAGES[pageNumber - 1].sceneTitle}</text></svg>`;
    const thumb = await sharp(file)
      .resize(thumbWidth, thumbHeight)
      .extend({ bottom: labelHeight, background: '#ffffff' })
      .composite([{ input: Buffer.from(labelSvg), top: thumbHeight, left: 0 }])
      .png()
      .toBuffer();
    composites.push({
      input: thumb,
      left: ((pageNumber - 1) % columns) * thumbWidth,
      top: Math.floor((pageNumber - 1) / columns) * (thumbHeight + labelHeight),
    });
  }
  await sharp({
    create: {
      width: columns * thumbWidth,
      height: Math.ceil(PAGES.length / columns) * (thumbHeight + labelHeight),
      channels: 4,
      background: '#e5e7eb',
    },
  })
    .composite(composites)
    .png()
    .toFile(path.join(PUBLIC_DIR, 'v2-contact-sheet.png'));
  console.log(`[contact-sheet] ${path.join(PUBLIC_DIR, 'v2-contact-sheet.png')}`);
}

function loadEnvLocal() {
  if (!fs.existsSync('.env.local')) return;
  for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]])
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

async function seedDb() {
  loadEnvLocal();
  const prisma = new PrismaClient();
  try {
    const course = await prisma.course.findUnique({ where: { id: COURSE_ID } });
    if (!course) throw new Error(`Course not found: ${COURSE_ID}`);
    const now = new Date();
    const scenes = [];
    for (const [index, page] of PAGES.entries()) {
      const pageNumber = index + 1;
      const label = pageLabel(pageNumber);
      const promptPlan = readJson(
        path.join(QUEUE_DIR, 'v2-prompt-plans', `page-${label}.prompt-plan.json`),
      );
      const focusRegions = focusRegionsFromPlan(promptPlan);
      if (promptPlan.recoveryResult?.status !== 'passed') {
        throw new Error(`Page ${pageNumber} recovery is not passed`);
      }
      if (focusRegions.length !== page.components.length) {
        throw new Error(
          `Page ${pageNumber} focus count mismatch: ${focusRegions.length}/${page.components.length}`,
        );
      }
      scenes.push({
        id: `${NOTEBOOK_ID}-v2-p${label}`,
        notebookId: NOTEBOOK_ID,
        title: page.sceneTitle,
        type: 'slide',
        order: index,
        content: {
          type: 'slide',
          canvas: canvasFor(pageNumber, focusRegions),
          webRenderMode: 'slide',
          semanticHitMap: {
            version: 1,
            source: 'imagegen-corner-marker-recovery-v2',
            sourceSize: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT },
            canvasSize: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
            regions: focusRegions.map((region) => ({
              id: region.id,
              semanticId: region.id,
              label: region.label,
              canvasRect: {
                left: region.left,
                top: region.top,
                width: region.width,
                height: region.height,
              },
            })),
          },
          imageNotebookPromptPlan: promptPlan,
        },
        actions: actionsForPage(page, pageNumber, focusRegions),
        whiteboard: null,
        createdAt: now,
        updatedAt: now,
      });
    }
    await prisma.$transaction([
      prisma.scene.deleteMany({ where: { notebookId: NOTEBOOK_ID } }),
      prisma.notebook.upsert({
        where: { id: NOTEBOOK_ID },
        update: {
          ownerId: course.ownerId,
          courseId: course.id,
          name: '定积分：从矩形到基本定理',
          description: '第一本中文手绘图片笔记本：从矩形近似、黎曼和、定积分定义到微积分基本定理。',
          tags: ['MAT136', '定积分', '黎曼和', '微积分基本定理', '中文笔记', '四角marker'],
          avatarUrl: '/avatars/notebook-agents/avatar8.avif',
          language: 'zh-CN',
          style: 'imagegen-marker-recovered-v2',
          updatedAt: now,
        },
        create: {
          id: NOTEBOOK_ID,
          ownerId: course.ownerId,
          courseId: course.id,
          name: '定积分：从矩形到基本定理',
          description: '第一本中文手绘图片笔记本：从矩形近似、黎曼和、定积分定义到微积分基本定理。',
          tags: ['MAT136', '定积分', '黎曼和', '微积分基本定理', '中文笔记', '四角marker'],
          avatarUrl: '/avatars/notebook-agents/avatar8.avif',
          language: 'zh-CN',
          style: 'imagegen-marker-recovered-v2',
          createdAt: now,
          updatedAt: now,
        },
      }),
      prisma.scene.createMany({ data: scenes }),
    ]);
    console.log(`[db] replaced ${NOTEBOOK_ID}; scenes=${scenes.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

function pageNumbersFromArgs() {
  const pageIndex = process.argv.indexOf('--page');
  if (pageIndex >= 0) return [Number(process.argv[pageIndex + 1])];
  return PAGES.map((_, index) => index + 1);
}

function usage() {
  console.log(`Usage:
  node scripts/notebooks/${SCRIPT_NAME} --prepare-prompts
  node scripts/notebooks/${SCRIPT_NAME} --adopt-latest --page <n>
  node scripts/notebooks/${SCRIPT_NAME} --recover [--page <n>]
  node scripts/notebooks/${SCRIPT_NAME} --write-narration
  node scripts/notebooks/${SCRIPT_NAME} --contact-sheet
  node scripts/notebooks/${SCRIPT_NAME} --seed-db`);
}

async function main() {
  if (process.argv.includes('--prepare-prompts')) return preparePrompts();
  if (process.argv.includes('--adopt-latest')) return adoptLatest(pageNumbersFromArgs()[0]);
  if (process.argv.includes('--recover')) return recoverPages(pageNumbersFromArgs());
  if (process.argv.includes('--write-narration')) return writeNarrationFiles();
  if (process.argv.includes('--contact-sheet')) return renderContactSheet();
  if (process.argv.includes('--seed-db')) return seedDb();
  usage();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
