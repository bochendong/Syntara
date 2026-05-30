#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';

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

const MARKER_COLORS = [
  { name: 'red', hex: '#ff0000' },
  { name: 'lime', hex: '#00ff00' },
  { name: 'blue', hex: '#0048ff' },
  { name: 'cyan', hex: '#00ffff' },
  { name: 'magenta', hex: '#ff00ff' },
  { name: 'yellow', hex: '#ffff00' },
];

const LAYOUTS = {
  four: [
    { key: 'title', left: 48, top: 78, width: 904, height: 68, slot: 'top-full' },
    { key: 'left', left: 55, top: 172, width: 410, height: 218, slot: 'middle-left' },
    { key: 'right', left: 535, top: 172, width: 410, height: 218, slot: 'middle-right' },
    { key: 'bottom', left: 70, top: 430, width: 860, height: 88, slot: 'bottom-full' },
  ],
  five: [
    { key: 'title', left: 48, top: 76, width: 904, height: 58, slot: 'top-full' },
    { key: 'leftTop', left: 52, top: 158, width: 420, height: 142, slot: 'middle-left' },
    { key: 'rightTop', left: 528, top: 158, width: 420, height: 142, slot: 'middle-right' },
    { key: 'leftBottom', left: 52, top: 332, width: 420, height: 176, slot: 'bottom-left' },
    { key: 'rightBottom', left: 528, top: 332, width: 420, height: 176, slot: 'bottom-right' },
  ],
};

function c(label, lines, options = {}) {
  return {
    label,
    lines,
    formulas: options.formulas || [],
    visual: options.visual || 'none',
    role: options.role || 'setup',
    speech: options.speech || lines.join('。'),
  };
}

const PAGE_SPECS = [
  {
    title: '定积分：从面积近似到计算',
    sceneTitle: '定积分路线',
    layout: 'four',
    components: [
      c('本讲目标', ['MAT136 微积分 II', '第 1 讲：定积分', '主题：面积怎样变成一个数'], {
        role: 'opening',
        speech:
          '这一页先给整讲定位。定积分不是先背公式，而是先理解面积近似，接着把近似写成黎曼和，再通过极限得到精确面积。',
      }),
      c('面积近似', ['曲线下方面积 S', '用许多小矩形相加', '矩形面积 = 宽 × 高'], {
        visual: 'area',
        role: 'visual',
        speech:
          '左边看图。曲线下方面积不好直接算，所以先切成许多窄矩形，每个矩形都有宽和高，把它们的面积加起来。',
      }),
      c('计算桥梁', ['若 F′(x)=f(x)', '∫_a^b f(x) dx = F(b)-F(a)', '面积问题变成端点差'], {
        visual: 'formulaBridge',
        role: 'formula',
        speech:
          '右边是最后会用到的计算桥梁。当我们知道一个原函数 F，定积分可以变成 F 在右端点和左端点的差。',
      }),
      c('本讲路线', ['面积近似 → 黎曼和', '黎曼和 → 极限', '极限 → 定积分', '定积分 → FTC 计算'], {
        visual: 'route',
        role: 'takeaway',
        speech:
          '底部是学习路线。之后每页都只推进其中一步：先近似，再写和式，再取极限，最后用微积分基本定理计算。',
      }),
    ],
  },
  {
    title: '固定速度：矩形面积就是距离',
    sceneTitle: '固定速度面积',
    layout: 'four',
    components: [
      c(
        '从熟悉例子开始',
        ['速度固定时，距离很好算', '速度 v = 50 miles/hour', '时间 t = 4 hours'],
        {
          role: 'opening',
          speech: '先用固定速度例子建立面积直觉。速度不变时，距离就是速度乘时间。',
        },
      ),
      c('速度-时间图', ['横轴：时间', '纵轴：速度', '图像下方是一个矩形'], {
        visual: 'constantRate',
        role: 'visual',
        speech: '在速度时间图上，固定速度是一条水平线。水平线下面的区域就是一个矩形。',
      }),
      c('直接计算', ['距离 = 速度 × 时间', '50 × 4 = 200', '所以距离 = 200 miles'], {
        visual: 'calculation',
        role: 'example',
        speech: '计算时只做一件事：矩形面积等于高乘宽，所以五十乘四等于二百英里。',
      }),
      c('积分直觉', ['图像下方面积', '就是总累积量', '固定速度时刚好是一个矩形'], {
        role: 'takeaway',
        speech: '这一页的结论是，图像下方面积可以表示累积量。固定速度只是最简单的面积模型。',
      }),
    ],
  },
  {
    title: '变速运动：用小矩形近似',
    sceneTitle: '变速面积近似',
    layout: 'five',
    components: [
      c('问题变化', ['速度 v(t) 不再固定', '曲线下面积不能只用一个矩形'], {
        role: 'opening',
        speech: '现在速度随时间变化，图像不再是水平线。一个矩形已经不能描述整个面积。',
      }),
      c('粗分割', ['区间 [0,4]', 'Δt = 1', '4 个矩形'], {
        visual: 'coarseBars',
        role: 'visual',
        speech: '先粗略切成四段，每段宽度是一。矩形不太贴合曲线，所以误差比较明显。',
      }),
      c('细分割', ['区间 [0,4]', 'Δt = 0.5', '8 个矩形'], {
        visual: 'fineBars',
        role: 'visual',
        speech: '再把区间切得更细，宽度变成零点五。矩形更窄，整体轮廓更贴近曲线。',
      }),
      c('计算形式', ['近似距离 ≈ Σ v(t_i) Δt', '每段贡献 = 高 × 宽'], {
        role: 'formula',
        speech:
          '无论粗分还是细分，计算形式都是把每个小矩形的面积加起来，也就是速度值乘以小时间间隔。',
      }),
      c('关键判断', ['Δt 越小', '近似通常越好', '下一步：怎样系统写出和式？'], {
        role: 'takeaway',
        speech: '关键不是追求某一个矩形，而是让宽度越来越小。下一步我们要把这个过程写成标准符号。',
      }),
    ],
  },
  {
    title: '分割区间：P 与 Δx',
    sceneTitle: '分割与记号',
    layout: 'five',
    components: [
      c('分割 P', ['把 [a,b] 切成 n 段', 'P = {x₀,x₁,…,xₙ}', 'a=x₀ < x₁ < … < xₙ=b'], {
        role: 'formula',
        speech: '分割 P 就是把区间从 a 到 b 切成很多小段。端点依次记作 x 零到 x n。',
      }),
      c('小区间宽度', ['第 i 段：[xᵢ₋₁,xᵢ]', 'Δxᵢ = xᵢ - xᵢ₋₁'], {
        visual: 'partition',
        role: 'formula',
        speech: '第 i 个小区间从 x i 减一到 x i，宽度就是右端点减左端点。',
      }),
      c('等宽分割', ['若每段一样宽', 'Δx = (b-a)/n', '例：[0,2], n=4, Δx=1/2'], {
        visual: 'numberLine',
        role: 'example',
        speech: '等宽分割最常见。比如从零到二切成四段，每段宽度就是二除以四，等于二分之一。',
      }),
      c('最大宽度', ['||P|| = max Δxᵢ', '让 ||P|| → 0', '表示所有小段都变窄'], {
        role: 'formula',
        speech: '如果不是等宽，就看最大的小区间宽度。让最大宽度趋近零，才表示所有小段都越来越细。',
      }),
      c('下一步', ['选每段的高度', '高度来自 f(cᵢ)', 'cᵢ 在第 i 段内'], {
        role: 'takeaway',
        speech: '宽度确定后，还要决定每个矩形的高度。高度来自某个采样点 c i 处的函数值。',
      }),
    ],
  },
  {
    title: '黎曼和：把矩形面积写成公式',
    sceneTitle: '黎曼和定义',
    layout: 'five',
    components: [
      c('采样点 cᵢ', ['在 [xᵢ₋₁,xᵢ] 内选 cᵢ', '矩形高度 = f(cᵢ)', '矩形宽度 = Δxᵢ'], {
        visual: 'samplePoint',
        role: 'setup',
        speech: '每一段里选一个采样点 c i，用 f(c i) 作为这个矩形的高度。',
      }),
      c('单个矩形', ['第 i 个矩形面积', 'Aᵢ = f(cᵢ) Δxᵢ'], {
        visual: 'singleRect',
        role: 'formula',
        speech: '单个矩形面积就是高度乘宽度，所以第 i 个面积写作 f(c i) 乘 Δx i。',
      }),
      c('全部相加', ['S(P,c)=Σᵢ₌₁ⁿ f(cᵢ)Δxᵢ', '这就是黎曼和'], {
        visual: 'sigma',
        role: 'formula',
        speech: '把所有矩形面积加起来，就得到黎曼和。这个符号 S(P,c) 记录了分割和采样点的选择。',
      }),
      c('数值例子', ['f(x)=x², [0,2], n=4', 'Δx=1/2', '右端点：0.5,1,1.5,2'], {
        role: 'example',
        speech:
          '为了马上进入计算，先固定一个例子。函数是 x 平方，区间零到二，切成四段，右端点依次是零点五、一、一点五、二。',
      }),
      c('准备计算', ['下一页计算 R₄', 'R₄ = Σ f(xᵢ)Δx', '先列值，再相加'], {
        role: 'takeaway',
        speech: '下一页我们不只写符号，而是把每个函数值列出来，真正算出一个右端点和。',
      }),
    ],
  },
  {
    title: '例题：计算右端点和 R₄',
    sceneTitle: '右端点和计算',
    layout: 'five',
    components: [
      c('题目', ['f(x)=x²', '区间 [0,2]', 'n=4，右端点和 R₄'], {
        role: 'opening',
        speech: '这一页完整计算一个右端点黎曼和。题目给出函数 x 平方、区间零到二、四个小矩形。',
      }),
      c('分割', ['Δx=(2-0)/4=1/2', 'x₁=0.5, x₂=1', 'x₃=1.5, x₄=2'], {
        visual: 'numberLine',
        role: 'example',
        speech:
          '第一步先求宽度。区间长度是二，分成四段，所以每段宽度是二分之一。右端点列成零点五、一、一点五、二。',
      }),
      c('函数值', ['f(0.5)=0.25', 'f(1)=1', 'f(1.5)=2.25', 'f(2)=4'], {
        visual: 'valueTable',
        role: 'example',
        speech:
          '第二步计算每个右端点处的函数值。因为 f 是 x 平方，所以分别得到零点二五、一、二点二五、四。',
      }),
      c('代入求和', ['R₄=(0.25+1+2.25+4)(1/2)', '=7.5×1/2', '=3.75'], {
        visual: 'calculation',
        role: 'formula',
        speech: '第三步把四个高度相加，再乘宽度二分之一，结果是三点七五。',
      }),
      c('对照真值', ['真实面积：∫₀² x² dx = 8/3', 'R₄=3.75 > 8/3', '右端点高估'], {
        role: 'takeaway',
        speech:
          '真实面积是八分之三吗？注意是八除以三，约二点六七。R 四比它大，因为 x 平方在这个区间递增，右端点会高估。',
      }),
    ],
  },
  {
    title: '左端点和 L₄：同题再算一次',
    sceneTitle: '左端点和计算',
    layout: 'five',
    components: [
      c('同一题', ['f(x)=x²', '区间 [0,2]', 'n=4，左端点和 L₄'], {
        role: 'opening',
        speech: '同一题换成左端点。分割不变，宽度仍然是二分之一，变化只在高度选择。',
      }),
      c('左端点', ['0, 0.5, 1, 1.5', '仍然 Δx=1/2'], {
        visual: 'numberLine',
        role: 'example',
        speech: '左端点依次是零、零点五、一、一点五。',
      }),
      c('函数值', ['f(0)=0', 'f(0.5)=0.25', 'f(1)=1', 'f(1.5)=2.25'], {
        visual: 'valueTable',
        role: 'example',
        speech: '把这些点代入 x 平方，得到零、零点二五、一、二点二五。',
      }),
      c('代入求和', ['L₄=(0+0.25+1+2.25)(1/2)', '=3.5×1/2', '=1.75'], {
        visual: 'calculation',
        role: 'formula',
        speech: '相加再乘二分之一，左端点和等于一点七五。',
      }),
      c('比较', ['L₄=1.75 < 8/3 < 3.75=R₄', '递增函数：左低右高'], {
        role: 'takeaway',
        speech: '把两个近似和真值放在一起，就能看出递增函数的规律：左端点低估，右端点高估。',
      }),
    ],
  },
  {
    title: '高估与低估：先看单调性',
    sceneTitle: '高估低估规则',
    layout: 'five',
    components: [
      c('递增函数', ['图像往上走', '左端点高度偏低', '右端点高度偏高'], {
        visual: 'increasing',
        role: 'visual',
        speech: '递增函数里，每个小区间左端点比右端点低，所以左端点矩形偏低，右端点矩形偏高。',
      }),
      c('递减函数', ['图像往下走', '左端点高度偏高', '右端点高度偏低'], {
        visual: 'decreasing',
        role: 'visual',
        speech: '递减函数正好反过来。左端点高度偏高，右端点高度偏低。',
      }),
      c('规则表', ['递增：Lₙ 低估，Rₙ 高估', '递减：Lₙ 高估，Rₙ 低估'], {
        visual: 'ruleTable',
        role: 'formula',
        speech: '把规律整理成表：递增时左低右高，递减时左高右低。',
      }),
      c('判断步骤', ['1. 先看函数递增/递减', '2. 再看左端点/右端点', '3. 最后判断高估/低估'], {
        role: 'takeaway',
        speech: '做题时不要先猜答案。按三步走：看单调性，看端点选择，再判断估计方向。',
      }),
      c('小练习', ['f(x)=√x 在 [1,4] 递增', '右端点和是高估还是低估？', '答案：高估'], {
        role: 'example',
        speech: '小练习：根号 x 在一到四递增，右端点和会高估。',
      }),
    ],
  },
  {
    title: '例题：速度函数的右端点和',
    sceneTitle: '速度函数例题',
    layout: 'five',
    components: [
      c('题目', ['v(t)=6√t', '估计 t=2 到 t=4 的距离', '用 4 个右端点矩形'], {
        role: 'opening',
        speech: '现在换成速度函数。目标是估计从 t 等于二到 t 等于四的距离，用四个右端点矩形。',
      }),
      c('宽度', ['Δt=(4-2)/4=1/2', '右端点：2.5, 3, 3.5, 4'], {
        visual: 'numberLine',
        role: 'example',
        speech: '区间长度是二，分四段，所以每段宽度二分之一。右端点是二点五、三、三点五、四。',
      }),
      c('写成和式', ['R₄ = (1/2)[6√2.5 + 6√3', '+ 6√3.5 + 6√4]'], {
        role: 'formula',
        speech: '先写成准确和式。每一项都是速度值乘以宽度二分之一。',
      }),
      c('近似计算', ['√2.5≈1.581, √3≈1.732', '√3.5≈1.871, √4=2', 'R₄≈(1/2)·43.10=21.55'], {
        visual: 'calculation',
        role: 'example',
        speech: '再做数值近似，四个速度值相加约为四十三点一，乘二分之一得到二十一点五五。',
      }),
      c('方向判断', ['v(t)=6√t 递增', '右端点和偏高', '估计距离略大'], {
        role: 'takeaway',
        speech: '因为根号函数递增，右端点和会偏高，所以二十一点五五是一个略大的估计。',
      }),
    ],
  },
  {
    title: '反例：Rₙ 不一定随 n 增加',
    sceneTitle: '右端点和反例',
    layout: 'five',
    components: [
      c('命题', ['“递增函数一定有 Rₙ ≤ Rₙ₊₁”', '这个命题是假的'], {
        role: 'opening',
        speech: '很多人会误以为分得越细，右端点和就一定越来越大。这个命题其实是假的。',
      }),
      c('选反例', ['f(x)=x', '区间 [0,1]', '递增且面积真实值 = 1/2'], {
        visual: 'linearArea',
        role: 'example',
        speech: '我们用最简单的递增函数 f(x)=x，在零到一区间上做反例。',
      }),
      c('算 R₃', ['Δx=1/3', '右端点：1/3,2/3,1', 'R₃=(1/3)(1/3+2/3+1)=2/3'], {
        visual: 'calculation',
        role: 'formula',
        speech: '三段时宽度三分之一，右端点相加是二，所以 R 三等于三分之二。',
      }),
      c('算 R₄', ['Δx=1/4', '右端点：1/4,1/2,3/4,1', 'R₄=(1/4)(2.5)=5/8'], {
        visual: 'calculation',
        role: 'formula',
        speech: '四段时宽度四分之一，右端点相加二点五，所以 R 四等于八分之五。',
      }),
      c('结论', ['R₃=2/3≈0.667', 'R₄=5/8=0.625', 'R₃ > R₄，所以命题为假'], {
        role: 'takeaway',
        speech: '比较得到 R 三大于 R 四。分得更细会更接近真实值，但不保证每一步单调增加。',
      }),
    ],
  },
  {
    title: '定积分：黎曼和的极限',
    sceneTitle: '定积分定义',
    layout: 'five',
    components: [
      c('定义思想', ['分割越来越细', '矩形和越来越稳定', '稳定值叫定积分'], {
        role: 'opening',
        speech: '定积分的核心是极限。矩形越来越窄时，黎曼和如果趋于同一个值，这个值就是定积分。',
      }),
      c('定义公式', ['∫_a^b f(x) dx', '= lim_{||P||→0} Σ f(cᵢ)Δxᵢ'], {
        visual: 'sigma',
        role: 'formula',
        speech: '正式公式里，分割最大宽度趋近零，所有矩形面积的和趋向定积分。',
      }),
      c('等宽版本', ['若 Δx=(b-a)/n', '∫_a^b f(x) dx = lim_{n→∞} Σᵢ₌₁ⁿ f(xᵢ*)Δx'], {
        role: 'formula',
        speech: '等宽时可以把极限写成 n 趋向无穷。这个形式常用于计算极限和。',
      }),
      c('快速例子', ['∫₀¹ x dx = lim Σ (i/n)(1/n)', '= lim [1/n² · n(n+1)/2]', '= 1/2'], {
        visual: 'calculation',
        role: 'example',
        speech: '看一个快速例子。用右端点 i 除以 n，高乘宽得到 i 除以 n 平方，求和后极限是一半。',
      }),
      c('概念收束', ['定积分 = 面积的精确值', '也可以表示累积量', '下一步：性质和计算'], {
        role: 'takeaway',
        speech: '所以定积分既是面积的精确值，也可以表示累积量。下一步是学习它的性质和计算方法。',
      }),
    ],
  },
  {
    title: '积分性质：先整理再计算',
    sceneTitle: '积分性质',
    layout: 'five',
    components: [
      c('相同上下限', ['∫_a^a f(x) dx = 0', '宽度为 0，面积为 0'], {
        role: 'formula',
        speech: '第一个性质是相同上下限。区间没有宽度，所以积分等于零。',
      }),
      c('常数倍', ['∫_a^b c f(x) dx', '= c ∫_a^b f(x) dx', '常数可以提出去'], {
        role: 'formula',
        speech: '常数倍可以提出积分号外，因为每个矩形高度都同时乘了同一个常数。',
      }),
      c('加减法', ['∫(f+g)=∫f+∫g', '∫(f-g)=∫f-∫g'], {
        role: 'formula',
        speech: '加法和减法可以拆开。面积或累积量可以逐项处理。',
      }),
      c('拆区间', ['∫_a^b f = ∫_a^c f + ∫_c^b f', '先从 a 到 c，再从 c 到 b'], {
        visual: 'splitInterval',
        role: 'formula',
        speech: '拆区间很常用。从 a 到 b 的累积量，可以拆成 a 到 c 加 c 到 b。',
      }),
      c('例子', ['∫₀² (3x²+2x) dx', '=3∫₀²x²dx+2∫₀²xdx', '先拆，再算'], {
        role: 'example',
        speech: '例子里先把三 x 平方加二 x 拆成两项，再分别计算。不要一上来硬算。',
      }),
    ],
  },
  {
    title: '有向面积：在 x 轴下方要减',
    sceneTitle: '有向面积',
    layout: 'five',
    components: [
      c('面积符号', ['曲线在 x 轴上方：正', '曲线在 x 轴下方：负', '定积分算有向面积'], {
        role: 'opening',
        speech: '定积分不是普通几何面积，而是有向面积。上方为正，下方为负。',
      }),
      c('图像例子', ['f(x)=x', '区间 [-1,1]', '左右两个三角形面积相同'], {
        visual: 'signedArea',
        role: 'visual',
        speech: '以 f(x)=x 为例，负半轴下方和正半轴上方各有一个三角形，大小相同方向相反。',
      }),
      c('计算', ['∫_{-1}^1 x dx', '= [x²/2]_{-1}^{1}', '= 1/2 - 1/2 = 0'], {
        visual: 'calculation',
        role: 'example',
        speech: '用原函数计算，右端点是一半，左端点也是一半，相减得到零。',
      }),
      c('几何解释', ['上方面积 = 1/2', '下方面积 = -1/2', '总有向面积 = 0'], {
        role: 'takeaway',
        speech: '几何上看，就是上方正面积和下方负面积抵消。',
      }),
      c('提醒', ['若问“总路程/总面积”', '要算 |f(x)| 的面积', '不要直接抵消'], {
        role: 'warning',
        speech: '如果题目问总路程或总面积，就不能让正负抵消，需要看绝对值对应的面积。',
      }),
    ],
  },
  {
    title: '微积分基本定理 II：用原函数计算',
    sceneTitle: 'FTC 计算',
    layout: 'five',
    components: [
      c('定理', ['若 F′(x)=f(x)', '则 ∫_a^b f(x) dx = F(b)-F(a)'], {
        role: 'formula',
        speech: '微积分基本定理第二部分告诉我们，只要找到原函数，就可以用端点差计算定积分。',
      }),
      c('例题 1', ['计算 ∫₀² 3x² dx', '原函数 F(x)=x³'], {
        role: 'example',
        speech: '第一题，三 x 平方的原函数是 x 三次方。',
      }),
      c('代入端点', ['∫₀² 3x² dx', '= [x³]₀²', '= 2³ - 0³ = 8'], {
        visual: 'calculation',
        role: 'formula',
        speech: '代入右端点二和左端点零，得到八减零，结果是八。',
      }),
      c('例题 2', ['计算 ∫₁⁴ √x dx', '原函数 F(x)= (2/3)x^{3/2}'], {
        role: 'example',
        speech: '第二题是根号 x。把它看成 x 的二分之一次方，原函数是三分之二 x 的三分之三次方。',
      }),
      c('代入端点', ['[(2/3)x^{3/2}]₁⁴', '= (2/3)(8) - (2/3)(1)', '= 14/3'], {
        visual: 'calculation',
        role: 'takeaway',
        speech: '四的三分之二次，或者说四的三分之三次方，是八；一对应一。相减后得到十四除以三。',
      }),
    ],
  },
  {
    title: '综合例题：先拆再用 FTC',
    sceneTitle: '综合计算',
    layout: 'five',
    components: [
      c('题目', ['计算 ∫₀² (3x² + 2x - 1) dx'], {
        role: 'opening',
        speech: '这一页做一个综合计算。被积函数是三 x 平方加二 x 减一。',
      }),
      c('拆开', ['∫₀²3x²dx + ∫₀²2xdx - ∫₀²1dx'], {
        role: 'formula',
        speech: '第一步用线性性质拆开，三项分别计算。',
      }),
      c('找原函数', ['3x² → x³', '2x → x²', '1 → x', '合并：F(x)=x³+x²-x'], {
        visual: 'calculation',
        role: 'example',
        speech: '也可以直接找整体原函数：三 x 平方对应 x 三次方，二 x 对应 x 平方，负一对应负 x。',
      }),
      c('端点差', ['F(2)=8+4-2=10', 'F(0)=0', '积分值 = 10'], {
        role: 'formula',
        speech: '代入右端点二，得到八加四减二等于十；左端点为零，所以积分值是十。',
      }),
      c('检查', ['结果为正', '图像大部分在 x 轴上方', '数量级合理'], {
        role: 'takeaway',
        speech: '最后做一个合理性检查。结果为正，和图像大部分在 x 轴上方是一致的。',
      }),
    ],
  },
  {
    title: '从面积到函数：积分函数 A(x)',
    sceneTitle: '积分函数',
    layout: 'five',
    components: [
      c('定义', ['A(x)=∫_a^x f(t) dt', '上限 x 在移动', 'A(x) 是累积面积函数'], {
        role: 'formula',
        speech: '把上限 b 改成变量 x，就得到积分函数 A(x)。它表示从 a 累积到 x 的面积。',
      }),
      c('FTC I', ['若 f 连续', 'A′(x)=f(x)', '面积函数的导数回到原函数'], {
        role: 'formula',
        speech: '微积分基本定理第一部分说，面积函数的导数就是原来的 f。',
      }),
      c('例子', ['A(x)=∫₀ˣ 3t² dt', '= x³', '所以 A′(x)=3x²'], {
        visual: 'calculation',
        role: 'example',
        speech: '例子里从零到 x 积分三 t 平方，得到 x 三次方。再求导，回到三 x 平方。',
      }),
      c('变量提醒', ['∫₀ˣ 3t² dt 中 t 是哑变量', '不能写成 ∫₀ˣ 3x² dx'], {
        role: 'warning',
        speech: '注意积分里的 t 是哑变量。上限已经叫 x 时，里面最好用 t，避免把变量混在一起。',
      }),
      c('连接', ['黎曼和给定义', 'FTC 给计算', '两者讲的是同一个面积'], {
        role: 'takeaway',
        speech: '黎曼和给出定义，基本定理给出计算方法。两者其实都在描述同一个面积累积过程。',
      }),
    ],
  },
  {
    title: '本讲收束：计算流程与练习',
    sceneTitle: '总结与练习',
    layout: 'five',
    components: [
      c('流程图', ['1. 识别区间 [a,b]', '2. 判断是近似还是精确', '3. 近似用黎曼和，精确用 FTC'], {
        visual: 'route',
        role: 'takeaway',
        speech:
          '最后把流程收束。先识别区间，再判断题目要近似还是精确。近似题用黎曼和，精确题用基本定理。',
      }),
      c('近似题模板', ['Δx=(b-a)/n', '列端点或采样点', '求 Σ f(cᵢ)Δx'], {
        role: 'formula',
        speech: '近似题的模板是：先算 Δx，再列采样点，最后把函数值乘宽度求和。',
      }),
      c('精确题模板', ['找 F′=f', '算 F(b)-F(a)', '必要时先拆开'], {
        role: 'formula',
        speech: '精确题的模板是找原函数，然后算端点差。复杂表达式先用性质拆开。',
      }),
      c('练习', ['计算 ∫₁³ (2x+1) dx', 'F(x)=x²+x', 'F(3)-F(1)=(9+3)-(1+1)=10'], {
        visual: 'calculation',
        role: 'example',
        speech: '最后做一个练习。二 x 加一的原函数是 x 平方加 x。代入三和一，相减得到十。',
      }),
      c('带走三句话', ['面积是累积量', '黎曼和是近似语言', 'FTC 是计算捷径'], {
        role: 'closing',
        speech: '这一讲带走三句话：面积是累积量，黎曼和是近似语言，微积分基本定理是计算捷径。',
      }),
    ],
  },
];

const ACTIVE_PAGE_SPECS = PAGE_SPECS.filter(
  (page) => page.sceneTitle !== '有向面积' && page.sceneTitle !== '积分函数',
);

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function pageLabel(pageNumber) {
  return String(pageNumber).padStart(3, '0');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function escapeXml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function componentPlansForPage(pageSpec, pageNumber) {
  const rects = LAYOUTS[pageSpec.layout];
  if (!rects || rects.length !== pageSpec.components.length) {
    throw new Error(`Layout mismatch on page ${pageNumber}: ${pageSpec.title}`);
  }
  return pageSpec.components.map((component, index) => {
    const color = MARKER_COLORS[index];
    const rect = rects[index];
    return {
      id: `${NOTEBOOK_ID}-p${pageLabel(pageNumber)}-component-${index + 1}`,
      label: component.label,
      role: component.role,
      order: index + 1,
      layoutSlot: rect.slot,
      markerColorName: color.name,
      markerColorHex: color.hex,
      visibleText: component.lines,
      formulas: component.formulas,
      diagramPrompt: `中文数学笔记区域：${component.label}`,
      participatesInMask: true,
      plannedRect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
      visual: component.visual,
      speech: component.speech,
    };
  });
}

function markerPointsForRect(rect) {
  const inset = 10;
  return [
    { corner: 'top-left', x: rect.left - inset, y: rect.top - inset },
    { corner: 'top-right', x: rect.left + rect.width + inset, y: rect.top - inset },
    { corner: 'bottom-left', x: rect.left - inset, y: rect.top + rect.height + inset },
    {
      corner: 'bottom-right',
      x: rect.left + rect.width + inset,
      y: rect.top + rect.height + inset,
    },
  ].map((point) => ({
    ...point,
    x: round1(clamp(point.x, 8, CANVAS_WIDTH - 8)),
    y: round1(clamp(point.y, 8, CANVAS_HEIGHT - 8)),
  }));
}

function compiledPromptForPage(pageSpec, pageNumber, componentPlans) {
  const componentText = componentPlans
    .map(
      (component) =>
        `${component.order}. ${component.label} (${component.markerColorName} ${component.markerColorHex}): ${component.visibleText.join('；')}`,
    )
    .join('\n');
  return [
    'Use case: scientific-educational',
    'Asset type: deterministic 16:9 Chinese hand-drawn math notebook slide with recoverable markers',
    `Page ${pageNumber}: ${pageSpec.title}`,
    '',
    'Student-visible rule: all prose is Simplified Chinese; formulas remain standard math notation.',
    'Math-course rule: include concrete calculations, not only conceptual labels.',
    'Marker rule: each component has exactly four isolated pure-color square corner markers in the marker source image; the student image removes them.',
    '',
    componentText,
  ].join('\n');
}

function buildPromptPlan(pageSpec, pageNumber, componentPlans) {
  const compiledImagePrompt = compiledPromptForPage(pageSpec, pageNumber, componentPlans);
  const promptHash = crypto.createHash('sha256').update(compiledImagePrompt).digest('hex');
  const components = componentPlans.map((component) => {
    const rect = component.plannedRect;
    const points = markerPointsForRect(rect);
    return {
      componentId: component.id,
      markerColorHex: component.markerColorHex,
      bbox: [
        round1(rect.left),
        round1(rect.top),
        round1(rect.left + rect.width),
        round1(rect.top + rect.height),
      ],
      markerPoints: points,
      markerCount: 4,
    };
  });
  return {
    schemaVersion: 1,
    canvas: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT, aspectRatio: '16:9' },
    componentPlans: componentPlans.map(
      ({ plannedRect, visual, speech, ...component }) => component,
    ),
    markerProtocol: {
      type: 'corner-square-markers',
      markerSizePx: 16,
      markerCountPerComponent: 4,
      blankBackgroundPaddingPx: 30,
      maxMaskableComponents: 6,
      colorPool: MARKER_COLORS,
      ordinaryContentForbiddenColors: MARKER_COLORS.map((color) => color.hex),
    },
    compiledImagePrompt,
    promptHash,
    validationTarget: {
      maskableComponentCount: componentPlans.length,
      totalMarkerCount: componentPlans.length * 4,
      markerCountsByColor: Object.fromEntries(componentPlans.map((c) => [c.markerColorHex, 4])),
      forbiddenVisibleMarks: [
        'colored connecting lines',
        'colored component borders',
        'extra pure-color squares outside marker corners',
      ],
    },
    recoveryResult: {
      status: 'deterministic',
      recoveredAt: Date.now(),
      originalMarkerImageUrl: `${PUBLIC_PATH}/marker-slide-${pageLabel(pageNumber)}.png`,
      originalMarkerImageDimensions: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT },
      findings: [],
      components,
    },
  };
}

function svgTextLines(lines, x, y, options = {}) {
  const size = options.size || 17;
  const lineHeight = options.lineHeight || size * 1.42;
  const weight = options.weight || 500;
  const color = options.color || '#172033';
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${color}" font-family="PingFang SC, Hiragino Sans GB, Noto Sans CJK SC, Arial Unicode MS, sans-serif">${lines
    .map(
      (line, index) =>
        `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join('')}</text>`;
}

function graphAxes(x, y, width, height) {
  return `
    <line x1="${x}" y1="${y + height}" x2="${x + width}" y2="${y + height}" stroke="#172033" stroke-width="1.5"/>
    <line x1="${x}" y1="${y + height}" x2="${x}" y2="${y}" stroke="#172033" stroke-width="1.5"/>
    <path d="M ${x + width - 8} ${y + height - 5} L ${x + width} ${y + height} L ${x + width - 8} ${y + height + 5}" fill="none" stroke="#172033" stroke-width="1.5"/>
    <path d="M ${x - 5} ${y + 8} L ${x} ${y} L ${x + 5} ${y + 8}" fill="none" stroke="#172033" stroke-width="1.5"/>
  `;
}

function curvePath(x, y, width, height, kind = 'hump') {
  if (kind === 'increasing') {
    return `M ${x} ${y + height * 0.75} C ${x + width * 0.3} ${y + height * 0.65}, ${x + width * 0.55} ${y + height * 0.35}, ${x + width} ${y + height * 0.18}`;
  }
  if (kind === 'decreasing') {
    return `M ${x} ${y + height * 0.2} C ${x + width * 0.32} ${y + height * 0.3}, ${x + width * 0.6} ${y + height * 0.58}, ${x + width} ${y + height * 0.78}`;
  }
  if (kind === 'linear') {
    return `M ${x} ${y + height} L ${x + width} ${y}`;
  }
  return `M ${x} ${y + height * 0.62} C ${x + width * 0.28} ${y + height * 0.16}, ${x + width * 0.48} ${y + height * 0.14}, ${x + width * 0.68} ${y + height * 0.45} S ${x + width * 0.86} ${y + height * 0.7}, ${x + width} ${y + height * 0.38}`;
}

function barGraph(x, y, width, height, count, kind = 'hump') {
  const barWidth = width / count;
  let bars = '';
  for (let i = 0; i < count; i += 1) {
    const t = count <= 1 ? 0 : i / (count - 1);
    const base =
      kind === 'increasing'
        ? 0.25 + 0.55 * t
        : kind === 'decreasing'
          ? 0.8 - 0.55 * t
          : 0.45 + 0.28 * Math.sin(Math.PI * t);
    const h = height * base;
    bars += `<rect x="${x + i * barWidth}" y="${y + height - h}" width="${barWidth - 2}" height="${h}" fill="#d9eee8" stroke="#0f766e" stroke-width="1"/>`;
  }
  return bars;
}

function visualSvg(kind, rect) {
  const x = rect.left + rect.width * 0.08;
  const y = rect.top + rect.height * 0.38;
  const w = rect.width * 0.78;
  const h = rect.height * 0.42;
  if (kind === 'area') {
    return `${graphAxes(x, y, w, h)}${barGraph(x + 30, y + 16, w - 60, h - 22, 7)}<path d="${curvePath(x + 30, y + 14, w - 60, h - 30)}" fill="none" stroke="#0f766e" stroke-width="3"/><text x="${x + w - 54}" y="${y + 22}" font-size="15" fill="#0f766e">y=f(x)</text>`;
  }
  if (kind === 'formulaBridge') {
    return `<rect x="${x}" y="${y + 10}" width="145" height="56" rx="8" fill="#ffffff" stroke="#0f766e" stroke-width="2"/><text x="${x + 22}" y="${y + 47}" font-size="24" fill="#172033">∫ f dx</text><path d="M ${x + 170} ${y + 38} L ${x + 250} ${y + 38}" stroke="#a16207" stroke-width="3"/><path d="M ${x + 242} ${y + 30} L ${x + 255} ${y + 38} L ${x + 242} ${y + 46}" fill="none" stroke="#a16207" stroke-width="3"/><rect x="${x + 275}" y="${y + 10}" width="150" height="56" rx="8" fill="#ffffff" stroke="#0f766e" stroke-width="2"/><text x="${x + 292}" y="${y + 47}" font-size="24" fill="#172033">F(b)-F(a)</text>`;
  }
  if (kind === 'route') {
    const labels = ['近似', '求和', '极限', '计算'];
    return labels
      .map((label, index) => {
        const bx = x + index * (w / 4);
        const arrow =
          index < labels.length - 1
            ? `<path d="M ${bx + 88} ${y + 40} L ${bx + 130} ${y + 40}" stroke="#a16207" stroke-width="2.4"/><path d="M ${bx + 122} ${y + 33} L ${bx + 132} ${y + 40} L ${bx + 122} ${y + 47}" fill="none" stroke="#a16207" stroke-width="2.4"/>`
            : '';
        return `<rect x="${bx}" y="${y + 16}" width="82" height="48" rx="10" fill="#eef8f5" stroke="#0f766e" stroke-width="1.5"/><text x="${bx + 20}" y="${y + 47}" font-size="18" fill="#172033">${label}</text>${arrow}`;
      })
      .join('');
  }
  if (kind === 'constantRate') {
    return `${graphAxes(x, y, w, h)}<rect x="${x + 42}" y="${y + h * 0.25}" width="${w - 82}" height="${h * 0.75}" fill="#d9eee8" stroke="#0f766e" stroke-width="2"/><line x1="${x + 42}" y1="${y + h * 0.25}" x2="${x + w - 40}" y2="${y + h * 0.25}" stroke="#0f766e" stroke-width="3"/><text x="${x + 54}" y="${y + h * 0.5}" font-size="18" fill="#172033">v=50</text><text x="${x + w - 80}" y="${y + h + 24}" font-size="14" fill="#172033">t=4</text>`;
  }
  if (kind === 'calculation') {
    const noteX = rect.left + rect.width - 188;
    const noteY = rect.top + rect.height - 45;
    return `<rect x="${noteX}" y="${noteY}" width="160" height="30" rx="8" fill="#fffaf1" stroke="#d6b889" stroke-width="1.2"/><text x="${noteX + 18}" y="${noteY + 20}" font-size="14" fill="#7c4a03">代入 → 化简</text>`;
  }
  if (kind === 'coarseBars')
    return `${graphAxes(x, y, w, h)}${barGraph(x + 28, y + 18, w - 56, h - 24, 4)}<path d="${curvePath(x + 28, y + 18, w - 56, h - 26)}" fill="none" stroke="#0f766e" stroke-width="3"/>`;
  if (kind === 'fineBars')
    return `${graphAxes(x, y, w, h)}${barGraph(x + 28, y + 18, w - 56, h - 24, 9)}<path d="${curvePath(x + 28, y + 18, w - 56, h - 26)}" fill="none" stroke="#0f766e" stroke-width="3"/>`;
  if (kind === 'partition' || kind === 'numberLine') {
    const baseY = y + h * 0.58;
    let ticks = '';
    for (let i = 0; i <= 4; i += 1) {
      const tx = x + 45 + i * ((w - 90) / 4);
      ticks += `<line x1="${tx}" y1="${baseY - 18}" x2="${tx}" y2="${baseY + 18}" stroke="#172033" stroke-width="1.5"/><text x="${tx - 10}" y="${baseY + 38}" font-size="14" fill="#172033">x${i}</text>`;
    }
    return `<line x1="${x + 35}" y1="${baseY}" x2="${x + w - 35}" y2="${baseY}" stroke="#172033" stroke-width="2"/>${ticks}<path d="M ${x + w - 44} ${baseY - 6} L ${x + w - 34} ${baseY} L ${x + w - 44} ${baseY + 6}" fill="none" stroke="#172033" stroke-width="2"/>`;
  }
  if (kind === 'samplePoint' || kind === 'singleRect') {
    return `${graphAxes(x, y, w, h)}<rect x="${x + w * 0.38}" y="${y + h * 0.35}" width="${w * 0.18}" height="${h * 0.65}" fill="#d9eee8" stroke="#0f766e" stroke-width="2"/><circle cx="${x + w * 0.47}" cy="${y + h * 0.35}" r="4" fill="#0f766e"/><text x="${x + w * 0.5}" y="${y + h * 0.28}" font-size="16" fill="#172033">cᵢ</text>`;
  }
  if (kind === 'sigma') {
    return `<text x="${x + 38}" y="${y + 66}" font-size="58" fill="#0f766e">Σ</text><text x="${x + 105}" y="${y + 48}" font-size="22" fill="#172033">f(cᵢ) Δxᵢ</text><text x="${x + 105}" y="${y + 84}" font-size="18" fill="#172033">把每个矩形面积相加</text>`;
  }
  if (kind === 'valueTable' || kind === 'ruleTable') {
    const rows =
      kind === 'ruleTable'
        ? ['递增：左低右高', '递减：左高右低']
        : ['点 xᵢ', '函数值 f(xᵢ)', '面积 f(xᵢ)Δx'];
    return rows
      .map(
        (row, index) =>
          `<rect x="${x + 20}" y="${y + 10 + index * 36}" width="${w - 40}" height="30" rx="6" fill="${index % 2 ? '#ffffff' : '#eef8f5'}" stroke="#9db7b0" stroke-width="1"/><text x="${x + 36}" y="${y + 31 + index * 36}" font-size="16" fill="#172033">${row}</text>`,
      )
      .join('');
  }
  if (kind === 'increasing')
    return `${graphAxes(x, y, w, h)}${barGraph(x + 26, y + 16, w - 52, h - 24, 5, 'increasing')}<path d="${curvePath(x + 26, y + 16, w - 52, h - 26, 'increasing')}" fill="none" stroke="#0f766e" stroke-width="3"/>`;
  if (kind === 'decreasing')
    return `${graphAxes(x, y, w, h)}${barGraph(x + 26, y + 16, w - 52, h - 24, 5, 'decreasing')}<path d="${curvePath(x + 26, y + 16, w - 52, h - 26, 'decreasing')}" fill="none" stroke="#0f766e" stroke-width="3"/>`;
  if (kind === 'linearArea')
    return `${graphAxes(x, y, w, h)}<polygon points="${x + 35},${y + h} ${x + w - 35},${y + 20} ${x + w - 35},${y + h}" fill="#d9eee8" stroke="#0f766e" stroke-width="1.5"/><path d="${curvePath(x + 35, y + 20, w - 70, h - 22, 'linear')}" stroke="#0f766e" stroke-width="3"/>`;
  if (kind === 'splitInterval') {
    const baseY = y + h * 0.58;
    return `<line x1="${x + 45}" y1="${baseY}" x2="${x + w - 45}" y2="${baseY}" stroke="#172033" stroke-width="2"/><line x1="${x + w * 0.5}" y1="${baseY - 22}" x2="${x + w * 0.5}" y2="${baseY + 22}" stroke="#a16207" stroke-width="2"/><text x="${x + 42}" y="${baseY + 35}" font-size="16">a</text><text x="${x + w * 0.5 - 5}" y="${baseY + 35}" font-size="16">c</text><text x="${x + w - 50}" y="${baseY + 35}" font-size="16">b</text>`;
  }
  if (kind === 'signedArea') {
    const midY = y + h * 0.55;
    return `${graphAxes(x, y, w, h)}<polygon points="${x + 45},${midY} ${x + w * 0.5},${midY} ${x + w * 0.5},${y + h}" fill="#f0eadf" stroke="#a16207" stroke-width="1.4"/><polygon points="${x + w * 0.5},${midY} ${x + w - 45},${y + 20} ${x + w - 45},${midY}" fill="#d9eee8" stroke="#0f766e" stroke-width="1.4"/><line x1="${x + 45}" y1="${y + h}" x2="${x + w - 45}" y2="${y + 20}" stroke="#0f766e" stroke-width="3"/>`;
  }
  return '';
}

function markerSvg(component) {
  const size = 10;
  return markerPointsForRect(component.plannedRect)
    .map(
      (point) =>
        `<rect x="${point.x - size / 2}" y="${point.y - size / 2}" width="${size}" height="${size}" fill="${component.markerColorHex}"/>`,
    )
    .join('');
}

function componentSvg(component, withMarkers) {
  const rect = component.plannedRect;
  const titleBg = component.order === 1 ? '#eef8f5' : '#f7f7f2';
  const title = `<rect x="${rect.left}" y="${rect.top}" width="${rect.width}" height="${rect.height}" rx="10" fill="#fffefb" stroke="#8bb6ac" stroke-width="1.5"/>
    <rect x="${rect.left + 12}" y="${rect.top + 10}" width="${Math.min(rect.width - 24, 260)}" height="28" rx="14" fill="${titleBg}" opacity="0.9"/>
    ${svgTextLines([`${component.order}. ${component.label}`], rect.left + 24, rect.top + 30, { size: 17, weight: 700, color: '#172033' })}`;
  const isShortHeader = rect.height < 72;
  const maxLines = isShortHeader ? 1 : rect.height < 100 ? 3 : 5;
  const lineSvg = svgTextLines(
    component.visibleText.slice(0, maxLines),
    rect.left + 26,
    isShortHeader ? rect.top + 53 : rect.top + 62,
    {
      size: isShortHeader ? 14 : rect.height < 120 ? 15 : 16,
      lineHeight: isShortHeader ? 17 : rect.height < 120 ? 20 : 22,
    },
  );
  const visual = visualSvg(component.visual, rect);
  return `<g>${title}${lineSvg}${visual}${withMarkers ? markerSvg(component) : ''}</g>`;
}

function backgroundSvg(pageSpec, pageNumber) {
  let grid = '';
  for (let x = 0; x <= CANVAS_WIDTH; x += 20) {
    grid += `<line x1="${x}" y1="0" x2="${x}" y2="${CANVAS_HEIGHT}" stroke="#e8ecef" stroke-width="0.6"/>`;
  }
  for (let y = 0; y <= CANVAS_HEIGHT; y += 20) {
    grid += `<line x1="0" y1="${y}" x2="${CANVAS_WIDTH}" y2="${y}" stroke="#e8ecef" stroke-width="0.6"/>`;
  }
  return `
    <rect width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" fill="#fffefa"/>
    ${grid}
    <text x="34" y="28" font-size="15" fill="#334155" font-family="PingFang SC, Hiragino Sans GB, sans-serif">MAT136 · 微积分 II · 第 ${pageNumber} 页</text>
    <text x="820" y="28" font-size="15" fill="#334155" font-family="PingFang SC, Hiragino Sans GB, sans-serif">定积分</text>
    <path d="M 320 58 C 425 46, 575 46, 680 58" stroke="#9ccfc5" stroke-width="6" fill="none" stroke-linecap="round" opacity="0.65"/>
    <text x="500" y="56" text-anchor="middle" font-size="28" font-weight="800" fill="#111827" font-family="PingFang SC, Hiragino Sans GB, Noto Sans CJK SC, Arial Unicode MS, sans-serif">${escapeXml(pageSpec.title)}</text>
  `;
}

function renderPageSvg(pageSpec, pageNumber, componentPlans, withMarkers) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${SOURCE_WIDTH}" height="${SOURCE_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  ${backgroundSvg(pageSpec, pageNumber)}
  ${componentPlans.map((component) => componentSvg(component, withMarkers)).join('\n')}
  <path d="M 32 ${CANVAS_HEIGHT - 28} C 150 ${CANVAS_HEIGHT - 18}, 300 ${CANVAS_HEIGHT - 34}, 470 ${CANVAS_HEIGHT - 24} S 790 ${CANVAS_HEIGHT - 18}, 965 ${CANVAS_HEIGHT - 28}" fill="none" stroke="#d6b889" stroke-width="1.2" stroke-dasharray="8 8" opacity="0.7"/>
</svg>`;
}

async function renderPng(svg, outPath) {
  ensureDir(path.dirname(outPath));
  await sharp(Buffer.from(svg)).png().toFile(outPath);
}

function imageElement(pageNumber) {
  const label = pageLabel(pageNumber);
  return {
    id: `${NOTEBOOK_ID}-image-${label}`,
    name: 'full_page_bitmap:image-notebook-clean',
    type: 'image',
    left: 0,
    top: 0,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    rotate: 0,
    fixedRatio: false,
    src: `${PUBLIC_PATH}/slide-${label}.png`,
    imageType: 'pageFigure',
    radius: 0,
  };
}

function hotspotElement(component) {
  const rect = component.plannedRect;
  return {
    id: component.id,
    name: `lecture-focus-generated: ${component.label}`,
    type: 'shape',
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
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

function canvasFor(pageNumber, componentPlans) {
  return {
    id: `${NOTEBOOK_ID}-canvas-${pageLabel(pageNumber)}`,
    viewportSize: CANVAS_WIDTH,
    viewportRatio: 16 / 9,
    theme: {
      backgroundColor: '#ffffff',
      themeColors: ['#0f766e', '#a16207', '#334155', '#8bb6ac'],
      fontColor: '#172033',
      fontName: 'PingFang SC',
      outline: { color: '#0f766e', width: 2, style: 'solid' },
      shadow: { h: 0, v: 0, blur: 10, color: '#000000' },
    },
    elements: [
      imageElement(pageNumber),
      ...componentPlans.map((component) => hotspotElement(component)),
    ],
    background: { type: 'solid', color: '#ffffff' },
    type: 'content',
  };
}

function actionsForPage(pageNumber, componentPlans) {
  return componentPlans.flatMap((component, index) => [
    {
      id: `${NOTEBOOK_ID}-p${pageLabel(pageNumber)}-spotlight-${String(index + 1).padStart(2, '0')}`,
      type: 'spotlight',
      elementId: component.id,
      title: component.label,
      description: `聚焦：${component.label}`,
      dimOpacity: 0.68,
    },
    {
      id: `${NOTEBOOK_ID}-p${pageLabel(pageNumber)}-speech-${String(index + 1).padStart(2, '0')}`,
      type: 'speech',
      title: component.label,
      text: component.speech,
    },
  ]);
}

function contentForPage(pageNumber, promptPlan, componentPlans) {
  const regions = componentPlans.map((component) => {
    const rect = component.plannedRect;
    return {
      id: component.id,
      semanticId: component.id,
      label: component.label,
      canvasRect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
    };
  });
  return {
    type: 'slide',
    canvas: canvasFor(pageNumber, componentPlans),
    webRenderMode: 'slide',
    semanticHitMap: {
      version: 1,
      source: 'deterministic-chinese-math-notebook-markers',
      sourceSize: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT },
      canvasSize: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
      regions,
    },
    imageNotebookPromptPlan: promptPlan,
  };
}

async function renderAllPages() {
  fs.rmSync(PUBLIC_DIR, { recursive: true, force: true });
  fs.rmSync(path.join(QUEUE_DIR, 'marker-generated'), { recursive: true, force: true });
  fs.rmSync(path.join(QUEUE_DIR, 'prompt-plans'), { recursive: true, force: true });
  fs.rmSync(path.join(QUEUE_DIR, 'marker-prompts'), { recursive: true, force: true });
  ensureDir(PUBLIC_DIR);
  ensureDir(path.join(QUEUE_DIR, 'marker-generated'));
  ensureDir(path.join(QUEUE_DIR, 'prompt-plans'));
  ensureDir(path.join(QUEUE_DIR, 'marker-prompts'));

  const summaries = [];
  for (const [index, pageSpec] of ACTIVE_PAGE_SPECS.entries()) {
    const pageNumber = index + 1;
    const label = pageLabel(pageNumber);
    const componentPlans = componentPlansForPage(pageSpec, pageNumber);
    const promptPlan = buildPromptPlan(pageSpec, pageNumber, componentPlans);
    const markerSvg = renderPageSvg(pageSpec, pageNumber, componentPlans, true);
    const cleanSvg = renderPageSvg(pageSpec, pageNumber, componentPlans, false);
    await renderPng(markerSvg, path.join(QUEUE_DIR, 'marker-generated', `page-${label}.png`));
    await renderPng(markerSvg, path.join(PUBLIC_DIR, `marker-slide-${label}.png`));
    await renderPng(cleanSvg, path.join(PUBLIC_DIR, `slide-${label}.png`));
    writeJson(path.join(QUEUE_DIR, 'prompt-plans', `page-${label}.prompt-plan.json`), promptPlan);
    fs.writeFileSync(
      path.join(QUEUE_DIR, 'marker-prompts', `page-${label}.prompt.md`),
      `${promptPlan.compiledImagePrompt}\n`,
    );
    summaries.push({ pageNumber, recovered: componentPlans.length, findings: [] });
  }
  writeJson(path.join(QUEUE_DIR, 'marker-recovery-summary.json'), summaries);
  await renderContactSheets();
  console.log(`[render] wrote ${ACTIVE_PAGE_SPECS.length} deterministic Chinese math pages`);
}

async function renderContactSheet(kind) {
  const columns = 3;
  const thumbWidth = 480;
  const thumbHeight = 270;
  const labelHeight = 30;
  const composites = [];
  for (let pageNumber = 1; pageNumber <= ACTIVE_PAGE_SPECS.length; pageNumber += 1) {
    const label = pageLabel(pageNumber);
    const file =
      kind === 'marker'
        ? path.join(PUBLIC_DIR, `marker-slide-${label}.png`)
        : path.join(PUBLIC_DIR, `slide-${label}.png`);
    const labelSvg = `<svg width="${thumbWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="${thumbWidth}" height="${labelHeight}" fill="${kind === 'marker' ? '#3b0764' : '#0f172a'}"/><text x="12" y="21" fill="#ffffff" font-size="15" font-family="Arial">Page ${pageNumber}</text></svg>`;
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
  const out = kind === 'marker' ? 'marker-contact-sheet.png' : 'contact-sheet.png';
  await sharp({
    create: {
      width: columns * thumbWidth,
      height: Math.ceil(ACTIVE_PAGE_SPECS.length / columns) * (thumbHeight + labelHeight),
      channels: 4,
      background: '#e5e7eb',
    },
  })
    .composite(composites)
    .png()
    .toFile(path.join(PUBLIC_DIR, out));
}

async function renderContactSheets() {
  await renderContactSheet('clean');
  await renderContactSheet('marker');
}

async function seedDb() {
  loadEnvLocal();
  const prisma = new PrismaClient();
  try {
    const course = await prisma.course.findUnique({ where: { id: COURSE_ID } });
    if (!course) throw new Error(`Course not found: ${COURSE_ID}`);
    const now = new Date();
    await prisma.notebook.upsert({
      where: { id: NOTEBOOK_ID },
      update: {
        ownerId: course.ownerId,
        courseId: course.id,
        name: 'MAT136 定积分：计算版',
        description:
          'MAT136 定积分中文计算版图片笔记本，15 页，包含黎曼和、定积分性质与 FTC 计算，并保留四角测试原图。',
        tags: ['MAT136', '微积分II', '定积分', '中文笔记', '计算版', '四角marker'],
        avatarUrl: '/avatars/notebook-agents/avatar8.avif',
        language: 'zh-CN',
        style: 'deterministic-cn-math-marker-slide',
        updatedAt: now,
      },
      create: {
        id: NOTEBOOK_ID,
        ownerId: course.ownerId,
        courseId: course.id,
        name: 'MAT136 定积分：计算版',
        description:
          'MAT136 定积分中文计算版图片笔记本，15 页，包含黎曼和、定积分性质与 FTC 计算，并保留四角测试原图。',
        tags: ['MAT136', '微积分II', '定积分', '中文笔记', '计算版', '四角marker'],
        avatarUrl: '/avatars/notebook-agents/avatar8.avif',
        language: 'zh-CN',
        style: 'deterministic-cn-math-marker-slide',
        createdAt: now,
        updatedAt: now,
      },
    });

    const scenes = ACTIVE_PAGE_SPECS.map((pageSpec, index) => {
      const pageNumber = index + 1;
      const label = pageLabel(pageNumber);
      const componentPlans = componentPlansForPage(pageSpec, pageNumber);
      const promptPlan = JSON.parse(
        fs.readFileSync(path.join(QUEUE_DIR, 'prompt-plans', `page-${label}.prompt-plan.json`)),
      );
      return {
        id: `${NOTEBOOK_ID}-p${label}`,
        notebookId: NOTEBOOK_ID,
        title: pageSpec.sceneTitle,
        type: 'slide',
        order: index,
        content: contentForPage(pageNumber, promptPlan, componentPlans),
        actions: actionsForPage(pageNumber, componentPlans),
        whiteboard: null,
        createdAt: now,
        updatedAt: now,
      };
    });

    await prisma.$transaction([
      prisma.scene.deleteMany({ where: { notebookId: NOTEBOOK_ID } }),
      prisma.scene.createMany({ data: scenes }),
    ]);
    console.log(`[db] seeded ${NOTEBOOK_ID} scenes=${scenes.length} course=${COURSE_ID}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function verifyDb() {
  loadEnvLocal();
  const prisma = new PrismaClient();
  try {
    const notebook = await prisma.notebook.findUnique({
      where: { id: NOTEBOOK_ID },
      include: {
        scenes: {
          orderBy: { order: 'asc' },
          select: { title: true, actions: true, content: true },
        },
      },
    });
    console.log(
      JSON.stringify(
        {
          id: notebook?.id,
          name: notebook?.name,
          language: notebook?.language,
          courseId: notebook?.courseId,
          sceneCount: notebook?.scenes.length,
          titles: notebook?.scenes.map((scene) => scene.title),
          focusRegionsPerScene: notebook?.scenes.map(
            (scene) => scene.content?.semanticHitMap?.regions?.length || 0,
          ),
          spotlightActionsPerScene: notebook?.scenes.map((scene) =>
            Array.isArray(scene.actions)
              ? scene.actions.filter((action) => action.type === 'spotlight').length
              : 0,
          ),
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  if (hasFlag('--help')) {
    console.log(
      [
        'Usage: node scripts/notebooks/create-mat136-definite-integral-cn-compute-notebook.mjs [--render] [--seed-db] [--verify]',
        '',
        'Renders deterministic Chinese math notebook images with marker originals and seeds them into MAT136.',
      ].join('\n'),
    );
    return;
  }
  if (hasFlag('--render')) await renderAllPages();
  if (hasFlag('--seed-db')) await seedDb();
  if (hasFlag('--verify')) await verifyDb();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
