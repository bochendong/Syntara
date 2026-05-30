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
        speech:
          '先看标题。这本笔记的起点不是积分符号，而是一个朴素的问题：曲线下面的面积，能不能先用矩形一点点逼近。',
      },
      {
        label: '固定速度矩形',
        role: 'visual',
        marker: 'lime',
        content: '速度-时间图，水平线 v=50，宽度 4，写“距离=速度×时间=50×4”。',
        speech:
          '看左侧矩形。速度固定时，距离就是速度乘以时间，在图像上就是一个矩形面积。这是面积直觉的第一块砖。',
      },
      {
        label: '速度变化疑问',
        role: 'setup',
        marker: 'blue',
        content: '画一条变化的速度曲线，写“速度一直变化时怎么办？”和“切成小时间段”。',
        speech:
          '再看右上。速度如果一直变化，就没有一个固定高度可以直接乘。这时我们只能先把时间切成小段，每段临时当作近似矩形。',
      },
      {
        label: '粗近似到细近似',
        role: 'visual',
        marker: 'cyan',
        content: '粗矩形和细矩形对比，写“时间间隔越小，近似越细”。',
        speech:
          '看这里的粗细对比。切得越细，矩形顶部和曲线之间的缝隙通常越小，近似就更可信。',
      },
      {
        label: '学习路线',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部路线：“矩形面积 → 黎曼和 → 极限 → 定积分 → 微积分基本定理”。',
        speech:
          '最后看底部路线。我们会先会写矩形和，再把矩形和推到极限，最后用微积分基本定理把面积变成可计算的端点差。',
      },
    ],
  },
  {
    title: '黎曼和的基本结构',
    sceneTitle: '黎曼和的基本结构',
    layout:
      '大图在左侧展示曲线和矩形；右上写分割，右中写采样点；底部收束到一个总和。',
    components: [
      {
        label: '标题承接',
        role: 'opening',
        marker: 'red',
        content: '标题“黎曼和的基本结构”；短句“先定宽度，再定高度”。',
        speech:
          '这一页把矩形近似写成数学对象。先看标题：每个小矩形都要先定宽度，再定高度。',
      },
      {
        label: '面积累积图',
        role: 'visual',
        marker: 'lime',
        content: '曲线 y=f(x)，区间 [a,b]，多个矩形，写“面积≈小矩形面积的总和”。',
        speech:
          '看左侧大图。一个矩形只能近似一小段面积，把所有小矩形面积加起来，就得到整段曲线下面积的近似。',
      },
      {
        label: '分割决定宽度',
        role: 'formula',
        marker: 'blue',
        content: '数轴分割，写“P={x0,x1,...,xn}”和“Δx_i=x_i-x_{i-1}”。',
        speech:
          '右上角是分割。分割 P 记录所有切点，相邻两个切点的距离，就是第 i 个小矩形的宽度。',
      },
      {
        label: '采样点决定高度',
        role: 'formula',
        marker: 'cyan',
        content: '小区间放大图，点 c_i，写“c_i∈[x_{i-1},x_i]”和“A_i=f(c_i)Δx_i”。',
        speech:
          '中间这块说明高度从哪里来。在小区间里选一个采样点，用函数值当高度，所以单块面积就是高度乘宽度。',
      },
      {
        label: '黎曼和公式',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部大公式“S(P,c)=Σ f(c_i)Δx_i”；旁边写“宽度×高度，再求和”。',
        speech:
          '最后看底部公式。这个式子没有神秘的地方，就是把每一块的高度乘宽度，再对所有小区间求和。',
      },
    ],
  },
  {
    title: '左端点和右端点近似',
    sceneTitle: '左端点和右端点近似',
    layout:
      '左侧用同一条曲线画左端点矩形，右侧画右端点矩形，中间用箭头说明“取点变了，高度变了”。',
    components: [
      {
        label: '标题与核心问题',
        role: 'opening',
        marker: 'red',
        content: '标题“左端点和右端点近似”；写“同一分割，不同取点”。',
        speech:
          '这一页比较两种最常见的取点。分割可以完全一样，但取左端点还是右端点，会改变每个矩形的高度。',
      },
      {
        label: '左端点矩形',
        role: 'visual',
        marker: 'lime',
        content: '左侧曲线下左端点矩形，写“左端点高度”和“L_n”。',
        speech:
          '先看左侧。左端点和用每个小区间左边的函数值当高度，所以矩形顶部从左端点出发。',
      },
      {
        label: '右端点矩形',
        role: 'visual',
        marker: 'blue',
        content: '右侧曲线下右端点矩形，写“右端点高度”和“R_n”。',
        speech:
          '再看右侧。右端点和用每个小区间右边的函数值当高度，图像上矩形顶部会对齐右端点。',
      },
      {
        label: '公式对照',
        role: 'formula',
        marker: 'cyan',
        content: '写“L_n=Σ f(x_{i-1})Δx_i”和“R_n=Σ f(x_i)Δx_i”。',
        speech:
          '看公式对照。左端点和右端点的区别，只在函数值取在小区间的左边还是右边。',
      },
      {
        label: '过渡问题',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部问题“什么时候会高估？什么时候会低估？”',
        speech:
          '底部的问题留给下一页：取点不同会让近似偏大还是偏小，关键要看函数的单调性。',
      },
    ],
  },
  {
    title: '高估和低估：先看单调性',
    sceneTitle: '高估和低估',
    layout:
      '左半页讲递增，右半页讲递减；底部给出两步判断法。不是表格，像两组对照笔记。',
    components: [
      {
        label: '判断目标',
        role: 'opening',
        marker: 'red',
        content: '标题“高估和低估”；写“先看单调性，再看取点”。',
        speech:
          '这一页建立判断方法。不要先背结论，先看函数是递增还是递减，再看用的是左端点还是右端点。',
      },
      {
        label: '递增函数规则',
        role: 'visual',
        marker: 'lime',
        content: '递增曲线，左端点矩形偏低，右端点矩形偏高，写“递增：左低右高”。',
        speech:
          '看递增函数。左端点在每段的较低一侧，所以左端点和偏低；右端点在较高一侧，所以右端点和偏高。',
      },
      {
        label: '递减函数规则',
        role: 'visual',
        marker: 'blue',
        content: '递减曲线，左端点矩形偏高，右端点矩形偏低，写“递减：左高右低”。',
        speech:
          '看递减函数时方向反过来。左端点在较高一侧，所以左端点和偏高；右端点在较低一侧，所以偏低。',
      },
      {
        label: '两步判断法',
        role: 'strategy',
        marker: 'cyan',
        content: '写“两步：判断递增/递减；判断左端点/右端点”。',
        speech:
          '中间这句是解题步骤。第一步判断单调性，第二步判断取的是哪一端，答案就不会乱。',
      },
      {
        label: '练习钩子',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部问题“同一个函数，换取点会不会改变误差方向？”',
        speech:
          '最后看底部问题。误差方向不是由函数名决定，而是由单调性和取点方式共同决定。',
      },
    ],
  },
  {
    title: '定积分定义：把近似推到极限',
    sceneTitle: '定积分定义',
    layout:
      '左侧大图显示粗到细的矩形，右上写网格大小，右下写定义式，底部是定义问题。',
    components: [
      {
        label: '定义入口',
        role: 'opening',
        marker: 'red',
        content: '标题“定积分定义”；写“近似值稳定下来，就是面积”。',
        speech:
          '这一页进入定积分定义。我们关心的不是某一次近似，而是当矩形越来越窄时，近似值会不会稳定到同一个数。',
      },
      {
        label: '粗到细图像',
        role: 'visual',
        marker: 'lime',
        content: '曲线下粗矩形到细矩形的渐变，写“矩形越窄，缝隙越小”。',
        speech:
          '看左侧图像。粗矩形的误差明显，细矩形更贴近曲线；这就是把近似推向极限的视觉理由。',
      },
      {
        label: '网格大小',
        role: 'formula',
        marker: 'blue',
        content: '写“||P||=max Δx_i”和“||P||→0”。',
        speech:
          '右上角的网格大小，用最宽的小区间来衡量。它趋近于零，意思是所有小区间都被压得足够窄。',
      },
      {
        label: '定积分公式',
        role: 'formula',
        marker: 'cyan',
        content: '写“∫_a^b f(x)dx = lim_{||P||→0} Σ f(c_i)Δx_i”。',
        speech:
          '右下角就是定义。定积分等于所有这些矩形和在网格无限变细时的极限。',
      },
      {
        label: '定义判断',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“同一个极限值，不依赖采样点选择”。',
        speech:
          '底部这句是重点。真正可积时，采样点怎么选最终都会逼近同一个面积值，这才让定义有意义。',
      },
    ],
  },
  {
    title: '定积分的基础性质',
    sceneTitle: '定积分性质',
    layout:
      '分成三组自然笔记：左边零区间和常数倍，中间和差，右边拆区间和变量名；底部给整理原则。',
    components: [
      {
        label: '性质入口',
        role: 'opening',
        marker: 'red',
        content: '标题“定积分的基础性质”；写“先整理，再计算”。',
        speech:
          '这一页整理定积分的基础性质。它们的作用不是增加记忆负担，而是让复杂积分先被整理成容易计算的形状。',
      },
      {
        label: '零区间和常数倍',
        role: 'formula',
        marker: 'lime',
        content: '写“∫_a^a f(x)dx=0”和“∫_a^b c f(x)dx=c∫_a^b f(x)dx”。',
        speech:
          '先看左侧。上下限相同，区间没有宽度，所以面积为零；常数倍可以提出积分号。',
      },
      {
        label: '和差性质',
        role: 'formula',
        marker: 'blue',
        content: '写“∫(f+g)=∫f+∫g”和“∫(f-g)=∫f-∫g”。',
        speech:
          '中间是线性性质。函数相加或相减时，积分可以对应拆开，这常用于把题目拆成熟悉的小块。',
      },
      {
        label: '拆区间与变量名',
        role: 'formula',
        marker: 'cyan',
        content: '画 [a,c] 和 [c,b] 两段，写“∫_a^b=∫_a^c+∫_c^b”；写“变量名不重要”。',
        speech:
          '右侧是区间拆分。中间点 c 可以把总面积切成两段相加；被积变量只是占位符，叫 x 还是 t 不改变面积。',
      },
      {
        label: '使用原则',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“先看上下限，再看能否拆、提、合并”。',
        speech:
          '最后看使用原则。遇到定积分，先检查上下限，再看能不能拆区间、提出常数、或者把和差分开。',
      },
    ],
  },
  {
    title: '微积分基本定理二：面积变端点差',
    sceneTitle: '微积分基本定理二',
    layout:
      '左侧展示面积，右侧展示原函数高度差，中间用桥接箭头；底部放计算模板。',
    components: [
      {
        label: '定理入口',
        role: 'opening',
        marker: 'red',
        content: '标题“微积分基本定理二”；写“面积可以用原函数端点差计算”。',
        speech:
          '这一页是计算定积分的核心。我们不再只靠矩形近似，而是用原函数在两个端点的差来计算面积。',
      },
      {
        label: '面积视角',
        role: 'visual',
        marker: 'lime',
        content: '曲线下从 a 到 b 的阴影面积，写“∫_a^b f(x)dx”。',
        speech:
          '先看左侧。定积分仍然代表从 a 到 b 的累积面积，这是我们前面一直在逼近的对象。',
      },
      {
        label: '原函数视角',
        role: 'visual',
        marker: 'blue',
        content: '画 F(x) 的两个端点高度，写“F(b)-F(a)”。',
        speech:
          '再看右侧。如果 F 是 f 的原函数，那么面积可以转化成原函数从 a 到 b 的增长量。',
      },
      {
        label: '定理公式',
        role: 'formula',
        marker: 'cyan',
        content: '写“若 F′(x)=f(x)，则 ∫_a^b f(x)dx=F(b)-F(a)”。',
        speech:
          '中间公式把两种视角接起来。只要找到一个原函数，就可以把定积分变成端点代入。',
      },
      {
        label: '计算模板',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“三步：找原函数；代上限；减下限”。',
        speech:
          '底部是计算模板。找原函数，代入上限，再减去代入下限，这是定积分计算最常用的三步。',
      },
    ],
  },
  {
    title: '定积分计算例题',
    sceneTitle: '定积分计算例题',
    layout:
      '左侧是题目，右侧分三步演算，底部放检查点。版面像老师现场解题，不要表格。',
    components: [
      {
        label: '题目入口',
        role: 'opening',
        marker: 'red',
        content: '标题“定积分计算例题”；写“用端点差，不用再画很多矩形”。',
        speech:
          '这一页用一个具体例子练习基本定理二。现在的重点是计算，而不是再画很多矩形。',
      },
      {
        label: '例题条件',
        role: 'example',
        marker: 'lime',
        content: '写例题“计算 ∫_0^2 (x^2+1) dx”。',
        speech:
          '先看题目。被积函数是一个简单多项式，上下限从零到二，适合直接找原函数。',
      },
      {
        label: '找原函数',
        role: 'formula',
        marker: 'blue',
        content: '写“F(x)=x^3/3+x”。',
        speech:
          '第一步找原函数。x 的平方对应三分之一倍 x 的三次方，常数一对应 x。',
      },
      {
        label: '端点代入',
        role: 'formula',
        marker: 'cyan',
        content: '写“F(2)-F(0)=(8/3+2)-0=14/3”。',
        speech:
          '第二步代端点。上限二代进去，再减去下限零代进去，得到三分之十四。',
      },
      {
        label: '检查点',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“定积分结果是数；不要忘记上下限”。',
        speech:
          '最后看检查点。定积分算完应该是一个数，不再含 x；如果答案还含变量，通常说明没有完成端点代入。',
      },
    ],
  },
  {
    title: '从黎曼和反推定积分',
    sceneTitle: '黎曼和反推定积分',
    layout:
      '上方写求和式，中间用颜色不纯的注释箭头拆出 Δx、x_i、f(x_i)，底部写对应积分。',
    components: [
      {
        label: '反推入口',
        role: 'opening',
        marker: 'red',
        content: '标题“从黎曼和反推定积分”；写“先找 Δx，再找 x_i”。',
        speech:
          '这一页反过来做题。看到极限求和式，不要急着算，先找出小区间宽度，再识别采样点。',
      },
      {
        label: '求和式样本',
        role: 'example',
        marker: 'lime',
        content: '写“lim_{n→∞} Σ_{i=1}^n (5/n)(7-(5i/n)^2)”。',
        speech:
          '先看样本求和式。前面的五除以 n 通常就是小区间宽度，后面的五 i 除以 n 通常是右端点。',
      },
      {
        label: '识别区间',
        role: 'formula',
        marker: 'blue',
        content: '写“Δx=(b-a)/n=5/n，所以 a=0，b=5”。',
        speech:
          '这里识别区间。宽度等于 b 减 a 再除以 n，如果宽度是五除以 n，常见区间就是从零到五。',
      },
      {
        label: '识别函数',
        role: 'formula',
        marker: 'cyan',
        content: '写“x_i=5i/n，f(x)=7-x^2”。',
        speech:
          '接着识别函数。把五 i 除以 n 看成 x_i，剩下的表达式就是函数在 x_i 处的值。',
      },
      {
        label: '写成积分',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“对应：∫_0^5 (7-x^2) dx”。',
        speech:
          '最后写成积分。从求和式到定积分，就是把宽度、区间和函数逐一还原出来。',
      },
    ],
  },
  {
    title: '四项黎曼和近似',
    sceneTitle: '四项黎曼和近似',
    layout:
      '左侧区间切分，中间左端点清单，右侧右端点清单，底部判断高估低估。',
    components: [
      {
        label: '例题入口',
        role: 'opening',
        marker: 'red',
        content: '标题“四项黎曼和近似”；写“先切区间，再列取点”。',
        speech:
          '这一页练习有限项近似。题目只要四项，所以我们不求极限，重点是把区间切对、取点列对。',
      },
      {
        label: '区间切分',
        role: 'visual',
        marker: 'lime',
        content: '例题“∫_30^38 √x dx，四项近似”；数轴从 30 到 38，写“Δx=2”。',
        speech:
          '先看区间切分。从三十到三十八，总长度八，分成四段，所以每段宽度是二。',
      },
      {
        label: '左端点近似',
        role: 'formula',
        marker: 'blue',
        content: '写“L_4=2(√30+√32+√34+√36)”。',
        speech:
          '左端点近似取每段左边的点，所以四个高度来自三十、三十二、三十四、三十六。',
      },
      {
        label: '右端点近似',
        role: 'formula',
        marker: 'cyan',
        content: '写“R_4=2(√32+√34+√36+√38)”。',
        speech:
          '右端点近似取每段右边的点，所以四个高度向右移动一格，最后包括三十八。',
      },
      {
        label: '估计判断',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“√x 递增：L_4 低估，R_4 高估”。',
        speech:
          '最后判断误差方向。根号 x 在这个区间递增，所以左端点和低估，右端点和高估。',
      },
    ],
  },
  {
    title: '导数下方面积与原函数增长量',
    sceneTitle: '导数面积与增长量',
    layout:
      '左侧画导数图像下面积，右侧画原函数从低到高的变化，底部写增长量公式。',
    components: [
      {
        label: '概念入口',
        role: 'opening',
        marker: 'red',
        content: '标题“导数下方面积与原函数增长量”；写“面积也可以表示变化量”。',
        speech:
          '这一页把面积和变化量连起来。导数下方的面积，不只是一个图形面积，它表示原函数累计改变了多少。',
      },
      {
        label: '导数面积',
        role: 'visual',
        marker: 'lime',
        content: '画 f′(t) 图像在 [0,10] 和 [0,20] 下的面积，写“面积累积”。',
        speech:
          '看左侧导数图。区间越长，累积的导数面积越多，对应原函数走过的净变化也越多。',
      },
      {
        label: '原函数变化',
        role: 'visual',
        marker: 'blue',
        content: '画 f(x) 的高度变化，写“f(20)-f(0)”和“f(10)-f(0)”。',
        speech:
          '右侧换成原函数视角。同样的信息可以说成从零到十增长了多少，从零到二十增长了多少。',
      },
      {
        label: '增长量公式',
        role: 'formula',
        marker: 'cyan',
        content: '写“∫_a^b f′(t)dt=f(b)-f(a)”。',
        speech:
          '中间公式就是总结。导数的定积分等于原函数在终点和起点之间的差。',
      },
      {
        label: '极值问题钩子',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部问题“原函数什么时候最大？什么时候最小？”',
        speech:
          '底部的问题为后面的应用做准备。要判断原函数最大最小，就要看导数累计让函数上升还是下降。',
      },
    ],
  },
  {
    title: '微积分基本定理一',
    sceneTitle: '微积分基本定理一',
    layout:
      '左侧是变上限面积函数，右侧是小增量 h 的薄条，底部用直觉说明导数回到 f(x)。',
    components: [
      {
        label: '定理入口',
        role: 'opening',
        marker: 'red',
        content: '标题“微积分基本定理一”；写“变上限面积的变化率”。',
        speech:
          '这一页讲基本定理一。我们把上限 x 当成会动的量，面积也就变成一个关于 x 的函数。',
      },
      {
        label: '面积函数',
        role: 'visual',
        marker: 'lime',
        content: '画“F(x)=∫_a^x f(t)dt”的阴影面积，从 a 到 x。',
        speech:
          '先看左侧。F 表示从 a 累积到 x 的面积；x 往右移动，面积就跟着增加或减少。',
      },
      {
        label: '小增量薄条',
        role: 'visual',
        marker: 'blue',
        content: '画从 x 到 x+h 的窄条，写“新增面积≈f(x)·h”。',
        speech:
          '再看这个窄条。当 h 很小时，新增面积近似等于当前高度乘以小宽度。',
      },
      {
        label: '导数结论',
        role: 'formula',
        marker: 'cyan',
        content: '写“若 F(x)=∫_a^x f(t)dt，则 F′(x)=f(x)”。',
        speech:
          '把新增面积除以 h，就是平均变化率；当 h 趋近于零时，这个变化率回到当前高度，也就是 f 在 x 处的值。',
      },
      {
        label: '判断方法',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“看到变上限积分，先问上限是不是 x”。',
        speech:
          '底部是判断方法。看到变上限积分，先看上限是不是 x；如果是，就可以直接把被积函数带到上限。',
      },
    ],
  },
  {
    title: '变上下限积分求导',
    sceneTitle: '变上下限积分求导',
    layout:
      '中间写总公式，左侧解释上限贡献，右侧解释下限贡献，底部给符号方向提醒。',
    components: [
      {
        label: '链式法则入口',
        role: 'opening',
        marker: 'red',
        content: '标题“变上下限积分求导”；写“端点会动，就乘端点导数”。',
        speech:
          '这一页处理更一般的情况。上下限不一定只是 x，端点自己也可能是 x 的函数，所以要用链式法则。',
      },
      {
        label: '上限贡献',
        role: 'formula',
        marker: 'lime',
        content: '画上限 v(x) 向右动，写“上限贡献：f(v(x))v′(x)”。',
        speech:
          '先看上限。上限往右动会增加面积，所以贡献是被积函数在上限处的值，再乘以上限自己的导数。',
      },
      {
        label: '下限贡献',
        role: 'formula',
        marker: 'blue',
        content: '画下限 u(x) 向右动，写“下限贡献：-f(u(x))u′(x)”。',
        speech:
          '再看下限。下限往右动会删掉左边的一段面积，所以它带负号。',
      },
      {
        label: '总公式',
        role: 'formula',
        marker: 'cyan',
        content: '写“F(x)=∫_{u(x)}^{v(x)} f(t)dt”和“F′(x)=f(v(x))v′(x)-f(u(x))u′(x)”。',
        speech:
          '中间总公式把两部分合在一起。上限贡献减去下限贡献，这是最容易套用的版本。',
      },
      {
        label: '符号提醒',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“上限加，下限减；端点是复合函数要乘导数”。',
        speech:
          '最后记住一句话：上限加，下限减；端点不是单纯 x 的时候，还要乘端点的导数。',
      },
    ],
  },
  {
    title: '综合例题：链式法则与乘积法则',
    sceneTitle: '综合例题',
    layout:
      '左侧写题目结构，中间拆成外部乘积和内部积分，右侧完成求导，底部写检查清单。',
    components: [
      {
        label: '题目入口',
        role: 'opening',
        marker: 'red',
        content: '标题“综合例题”；写“先拆结构，再求导”。',
        speech:
          '这一页把前面规则混在一起。综合题不要直接冲公式，先拆结构，看外面有没有乘积，里面上下限怎么变。',
      },
      {
        label: '题目结构',
        role: 'example',
        marker: 'lime',
        content: '写“G(x)=x·∫_{x^2}^{0} cos(-t^2)dt”。',
        speech:
          '先看题目结构。外面有一个 x 乘以内层积分，所以外层要用乘积法则。',
      },
      {
        label: '外层乘积法则',
        role: 'strategy',
        marker: 'blue',
        content: '写“G′=1·积分 + x·积分的导数”。',
        speech:
          '先拆外层。第一个因子求导得到一，第二项保留 x，再去求内层积分的导数。',
      },
      {
        label: '内层变限求导',
        role: 'formula',
        marker: 'cyan',
        content: '写“下限 x^2 带负号，再乘 2x”。',
        speech:
          '内层积分的上限是常数，贡献为零；下限是 x 的平方，所以带负号，还要乘二 x。',
      },
      {
        label: '检查清单',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“外层法则；端点符号；端点导数；代回被积函数”。',
        speech:
          '最后用底部清单检查：外层法则有没有用，端点正负号有没有对，端点导数有没有乘，被积函数有没有代入正确端点。',
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
        speech:
          '这一页是公式速查。它的目的不是死背一长串，而是训练你先认出题目属于哪一种形状。',
      },
      {
        label: '幂函数和指数',
        role: 'formula',
        marker: 'lime',
        content: '写“∫x^n dx=x^{n+1}/(n+1)+C”和“∫e^x dx=e^x+C”。',
        speech:
          '左侧是幂函数和指数函数。幂函数积分时指数加一再除以新指数，指数函数 e 的 x 次方保持不变。',
      },
      {
        label: '三角函数',
        role: 'formula',
        marker: 'blue',
        content: '写“∫sin x dx=-cos x+C”，“∫cos x dx=sin x+C”，“∫sec^2 x dx=tan x+C”。',
        speech:
          '中间是三角函数。注意正负号，尤其正弦积分会得到负余弦。',
      },
      {
        label: '反三角常见型',
        role: 'formula',
        marker: 'cyan',
        content: '写“∫1/(1+x^2)dx=arctan x+C”和“∫1/√(1-x^2)dx=arcsin x+C”。',
        speech:
          '右侧是反三角常见型。看到一加 x 的平方在分母，优先想到反正切；看到一减 x 的平方开根号，优先想到反正弦。',
      },
      {
        label: '使用提醒',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“不定积分要加 C；定积分要代上下限”。',
        speech:
          '底部提醒很重要。不定积分要加常数；定积分则要用上下限代入，最后得到一个数。',
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
        speech:
          '这一页不急着算答案，而是练习选方法。会选方法，后面的计算才不会乱。',
      },
      {
        label: '定积分计算题',
        role: 'example',
        marker: 'lime',
        content: '写小题“∫_1^2 (x+1)(x+2)dx”；旁注“先展开”。',
        speech:
          '看左侧小题。多项式乘法可以先展开，再逐项积分，最后代上下限。',
      },
      {
        label: '公式识别题',
        role: 'example',
        marker: 'blue',
        content: '写小题“∫ 5/√(1-x^2) dx”；旁注“反正弦型”。',
        speech:
          '看上方小题。分母是根号一减 x 的平方，这是反正弦的常见形状。',
      },
      {
        label: '变上限题',
        role: 'example',
        marker: 'cyan',
        content: '写小题“H(x)=∫_0^{x^2} √(1+t^2)dt”；旁注“FTC I + 链式法则”。',
        speech:
          '看右侧小题。上限是 x 的平方，所以用基本定理一之后，还要乘上限的导数。',
      },
      {
        label: '做题顺序',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“看上下限；看是否变限；认公式；再计算”。',
        speech:
          '底部是通用顺序。先看有没有上下限，再看上下限是否含 x，然后认公式，最后再进入计算。',
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
        speech:
          '最后一页把整本笔记收束起来。定积分不是一个孤立公式，它有三种互相连接的身份。',
      },
      {
        label: '身份一：矩形和极限',
        role: 'formula',
        marker: 'lime',
        content: '写“黎曼和的极限”和“Σ f(c_i)Δx_i”。',
        speech:
          '第一种身份是黎曼和的极限。它回答定义问题：面积是怎样从很多矩形逼近出来的。',
      },
      {
        label: '身份二：曲线下面积',
        role: 'visual',
        marker: 'blue',
        content: '画曲线下阴影，写“从 a 到 b 的累积面积”。',
        speech:
          '第二种身份是曲线下面积。它给定积分一个直观图像，让你知道结果代表什么。',
      },
      {
        label: '身份三：原函数增长量',
        role: 'formula',
        marker: 'cyan',
        content: '写“F(b)-F(a)”和“原函数增长量”。',
        speech:
          '第三种身份是原函数增长量。它给我们计算方法，把面积变成端点差。',
      },
      {
        label: '最终检查清单',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部 checklist：“看区间；看取点；看极限；看能否用基本定理”。',
        speech:
          '底部清单就是之后做题的路线：看区间，看取点，看极限，最后判断能不能用微积分基本定理计算。',
      },
    ],
  },
];

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
    writeJson(path.join(planDir, `page-${label}.prompt-plan.json`), buildPromptPlan(page, pageNumber, prompt));
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
    for (let y = Math.max(0, y1 - samplePad); y <= Math.min(raw.height - 1, y2 + samplePad); y += 1) {
      for (let x = Math.max(0, x1 - samplePad); x <= Math.min(raw.width - 1, x2 + samplePad); x += 1) {
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
  await sharp(out, { raw: { width: raw.width, height: raw.height, channels: 3 } }).png().toFile(outPath);
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
  await sharp(markerInput).resize(SOURCE_WIDTH, SOURCE_HEIGHT, { fit: 'fill' }).png().toFile(markerPublic);
  const raw = await decodeRaw(markerPublic);
  const findings = [];
  const recoveredComponents = [];
  const allMarkerComponents = [];
  for (const component of promptPlan.componentPlans) {
    const marker = markerFor(component.markerColorName);
    const components = componentsForColor(raw, marker);
    allMarkerComponents.push(...components);
    const hits = selectCornerHits(components);
    const sourceBbox = hits.length === 4 ? bboxFromComponents(hits.map((hit) => hit.component)) : undefined;
    if (components.length !== 4) {
      findings.push(`${component.label}: expected 4 ${marker.name} markers, recovered ${components.length}`);
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
    actions.push({
      id: `${actionBase}-speech`,
      type: 'speech',
      title: component.label,
      text: component.speech,
    });
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
    const promptPlan = readJson(path.join(QUEUE_DIR, 'v2-prompt-plans', `page-${label}.prompt-plan.json`));
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
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
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
      const promptPlan = readJson(path.join(QUEUE_DIR, 'v2-prompt-plans', `page-${label}.prompt-plan.json`));
      const focusRegions = focusRegionsFromPlan(promptPlan);
      if (promptPlan.recoveryResult?.status !== 'passed') {
        throw new Error(`Page ${pageNumber} recovery is not passed`);
      }
      if (focusRegions.length !== page.components.length) {
        throw new Error(`Page ${pageNumber} focus count mismatch: ${focusRegions.length}/${page.components.length}`);
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
