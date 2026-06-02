#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';

const SCRIPT_NAME = 'create-mat136-fourth-notebook-v2.mjs';
const NOTEBOOK_ID = 'queue-mat136-04-area-volume';
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
    title: '面积与体积：把几何切成小片',
    sceneTitle: '面积体积入口',
    layout:
      '自然课堂笔记布局：上方标题，左侧从曲线间面积出发，右侧过渡到体积切片，底部给学习路线。',
    components: [
      {
        label: '本节问题',
        role: 'opening',
        marker: 'red',
        content: '标题“面积与体积：把几何切成小片”；写“定积分怎样计算几何量？”',
        speech:
          '这一页进入定积分的几何应用。面积和体积看起来是新题型，但核心仍然是把整体切成很多小片，再把小片累加。',
      },
      {
        label: '面积小片',
        role: 'visual',
        marker: 'lime',
        content: '画两条曲线之间的竖直小条，写“小面积≈高度差·dx”。',
        speech:
          '左侧先看面积。两条曲线之间的一条竖直小片，宽度是 dx，高度是上函数减下函数，所以小面积是高度差乘 dx。',
      },
      {
        label: '体积小片',
        role: 'visual',
        marker: 'blue',
        content: '画立体被切成薄片，写“小体积≈截面积·厚度”。',
        speech:
          '右上转到体积。体积小片不是高度乘宽度，而是截面积乘厚度。只要能写出每片的截面积，就能积分。',
      },
      {
        label: '统一公式',
        role: 'formula',
        marker: 'cyan',
        content: '写“面积：∫ 高度差 dx”；“体积：∫ A(x) dx”。',
        speech: '中间这两条公式把本节课统一起来。面积积分累加高度差，体积积分累加截面积。',
      },
      {
        label: '学习路线',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部路线：“画区域 → 选切片 → 写小量 → 找上下限 → 积分”。',
        speech:
          '底部是整本笔记路线。先画区域，再选切片方向，写出小片的量，找到边界，最后用定积分累加。',
      },
    ],
  },
  {
    title: '曲线间面积：上减下',
    sceneTitle: '曲线间面积方法',
    layout: '左侧画区域，中央放竖直小条，右侧写公式和步骤，底部提醒交点决定上下限。',
    components: [
      {
        label: '方法入口',
        role: 'opening',
        marker: 'red',
        content: '标题“曲线间面积：上减下”；写“先找围住的区域”。',
        speech:
          '曲线间面积的第一步不是积分，而是找区域。先知道哪一块被围住，才能知道从哪里积分到哪里。',
      },
      {
        label: '竖直小条',
        role: 'visual',
        marker: 'lime',
        content: '画竖直小条从 y=下(x) 到 y=上(x)，宽度 dx。',
        speech: '看竖直小条。它的高度是上边界的 y 值减下边界的 y 值，宽度是 dx。',
      },
      {
        label: '面积公式',
        role: 'formula',
        marker: 'blue',
        content: '写“A=∫_a^b [上(x)-下(x)] dx”。',
        speech:
          '于是总面积就是从 a 到 b 积分上边界减下边界。这个公式本质上就是所有小条面积的累加。',
      },
      {
        label: '交点边界',
        role: 'strategy',
        marker: 'cyan',
        content: '写“交点给 a,b；若上下关系变了，要分段”。',
        speech: '交点通常给出积分边界。如果两条曲线在区间内部交叉，上下关系会改变，就必须分段。',
      },
      {
        label: '检查句',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“面积必须非负；算出负数先查上下顺序”。',
        speech: '底部是检查句：面积不能是负数。如果出现负数，通常说明上函数和下函数顺序写反了。',
      },
    ],
  },
  {
    title: '例题：y=x² 与 y=√x',
    sceneTitle: '平方与根号面积',
    layout: '上方写两条曲线，左侧找交点，中间判断上下，右侧建立积分，底部给结果。',
    components: [
      {
        label: '题目入口',
        role: 'opening',
        marker: 'red',
        content: '写“求 y=x² 与 y=√x 围成的面积”；画两条曲线。',
        speech: '这道例题是最标准的曲线间面积。我们先画 y 等于 x 平方和 y 等于根号 x。',
      },
      {
        label: '找交点',
        role: 'formula',
        marker: 'lime',
        content: '写“x²=√x ⇒ x=0,1”。',
        speech: '第一步找交点。令 x 平方等于根号 x，可以得到 x 等于零和一，所以区域从零到一闭合。',
      },
      {
        label: '判断上下',
        role: 'visual',
        marker: 'blue',
        content: '在 [0,1] 上标注“√x 在上，x² 在下”。',
        speech: '在零到一之间，根号 x 在上，x 平方在下。比如 x 等于四分之一时，根号值明显更大。',
      },
      {
        label: '建立积分',
        role: 'formula',
        marker: 'cyan',
        content: '写“A=∫_0^1(√x-x²)dx”。',
        speech: '所以每条竖直小片的高度是根号 x 减 x 平方，总面积就是这个高度从零到一积分。',
      },
      {
        label: '计算结果',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“A=∫_0^1(x^{1/2}-x²)dx = 1/3”。',
        speech:
          '最后把根号写成 x 的二分之一次方分别积分，结果是三分之一。重点是交点、上下关系和上减下。',
      },
    ],
  },
  {
    title: '绝对值曲线：先拆再分段',
    sceneTitle: '绝对值面积分段',
    layout: '左侧画 |2x| 的折线，中间找与 x+2 的交点，右侧标出分段区间，底部给分段原则。',
    components: [
      {
        label: '题目结构',
        role: 'opening',
        marker: 'red',
        content: '写“f(x)=|2x|，g(x)=x+2”；画折线和直线。',
        speech:
          '这题出现绝对值，第一件事是把图像和分段结构看清楚。绝对值函数在零点左右表达式不同。',
      },
      {
        label: '拆绝对值',
        role: 'formula',
        marker: 'lime',
        content: '写“|2x|=-2x (x<0)，|2x|=2x (x≥0)”。',
        speech: '先拆绝对值。左侧是负二 x，右侧是二 x。这个折点会影响交点和上下关系。',
      },
      {
        label: '找交点',
        role: 'formula',
        marker: 'blue',
        content: '写“-2x=x+2 ⇒ x=-2/3”；“2x=x+2 ⇒ x=2”。',
        speech: '分别和直线 x 加二求交点，左边交点是负三分之二，右边交点是二。',
      },
      {
        label: '分段积分',
        role: 'formula',
        marker: 'cyan',
        content: '写“A=∫_{-2/3}^0(上-下)dx + ∫_0^2(上-下)dx”。',
        speech: '因为绝对值在零点切换表达式，面积要拆成两段。每一段内部再判断谁在上，谁在下。',
      },
      {
        label: '分段原则',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“折点、交点、上下变化点，都可能成为分段点”。',
        speech: '底部原则很重要：折点、交点、上下关系变化的位置，都可能是分段点。',
      },
    ],
  },
  {
    title: '三角曲线面积：交点处分段',
    sceneTitle: '三角曲线面积',
    layout: '左侧画 sin2x 与 cos2x，中央找交点，右侧写两段积分，底部提醒上下关系变化。',
    components: [
      {
        label: '题目入口',
        role: 'opening',
        marker: 'red',
        content: '写“f(x)=sin2x，g(x)=cos2x，区间 [0,π/2]”。',
        speech: '这道题的两条曲线会在区间内部相交，所以不能一口气写一个固定的上减下。',
      },
      {
        label: '找交点',
        role: 'formula',
        marker: 'lime',
        content: '写“sin2x=cos2x ⇒ x=π/8”。',
        speech: '令 sin 二 x 等于 cos 二 x，得到交点 x 等于 π/8。这个点把区间分成两段。',
      },
      {
        label: '判断上下',
        role: 'visual',
        marker: 'blue',
        content: '图上标注“[0,π/8]：cos2x 在上；[π/8,π/2]：sin2x 在上”。',
        speech:
          '在左段，cos 二 x 在上；过了交点以后，sin 二 x 在上。上下关系发生变化，所以必须分段。',
      },
      {
        label: '两段积分',
        role: 'formula',
        marker: 'cyan',
        content: '写“A=∫_0^{π/8}(cos2x-sin2x)dx + ∫_{π/8}^{π/2}(sin2x-cos2x)dx”。',
        speech: '右侧两段积分就是把每段的上函数减下函数分别写出来，再相加。',
      },
      {
        label: '图像提醒',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“三角面积题先画图，不要只看公式”。',
        speech: '三角函数题很容易上下关系变换，所以先画图或至少找交点，是防止写反的最好办法。',
      },
    ],
  },
  {
    title: '水平切片：什么时候用 y 来切',
    sceneTitle: '水平切片入口',
    layout: '左侧竖直切片与水平切片对比，右侧写宽度函数，底部给选择标准。',
    components: [
      {
        label: '切片入口',
        role: 'opening',
        marker: 'red',
        content: '标题“水平切片”；写“有时横着切更自然”。',
        speech: '这一页开始水平切片。有些区域用竖直小条会很麻烦，但用水平小条可以直接写出长度。',
      },
      {
        label: '水平小片',
        role: 'visual',
        marker: 'lime',
        content: '画水平细条，长度 w(y)，厚度 dy，写“小面积≈w(y)dy”。',
        speech: '水平切片的小面积等于这一层的长度 w(y) 乘以厚度 dy。变量从 x 换成 y。',
      },
      {
        label: '宽度函数',
        role: 'formula',
        marker: 'blue',
        content: '写“w(y)=右边界-左边界”。',
        speech: '宽度函数通常是右边界减左边界。只要把边界都写成 x 关于 y 的函数，就能建立积分。',
      },
      {
        label: '面积公式',
        role: 'formula',
        marker: 'cyan',
        content: '写“A=∫_{y=c}^{d} w(y)dy”。',
        speech: '总面积就是把每一层的水平宽度从下到上积分。上下限现在是 y 的范围。',
      },
      {
        label: '选择标准',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“哪种切片让小片长度更好写，就选哪种”。',
        speech: '底部是选择标准：不是固定用 dx 或 dy，而是哪种切片让小片长度更好写，就选哪种。',
      },
    ],
  },
  {
    title: '等腰三角形：用水平切片算面积',
    sceneTitle: '三角形水平切片',
    layout: '左侧画等腰三角形，中间用相似三角形找 w(h)，右侧积分，底部结果对照。',
    components: [
      {
        label: '题目入口',
        role: 'opening',
        marker: 'red',
        content: '写“用水平切片计算等腰三角形面积”；画高 H、底 B。',
        speech: '这页用水平切片算三角形面积。我们不用底乘高除以二，而是把它切成很多水平小条。',
      },
      {
        label: '宽度变化',
        role: 'visual',
        marker: 'lime',
        content: '画高度 h 处的水平片，标宽度 w(h)。',
        speech: '在高度 h 处，水平片的长度不是常数。越靠近顶点越短，越靠近底部越长。',
      },
      {
        label: '相似比例',
        role: 'formula',
        marker: 'blue',
        content: '写“w(h)=B(1-h/H)”或等价比例。',
        speech: '宽度函数来自相似三角形。如果从底部量高度 h，宽度可以写成 B 乘一减 h 除以 H。',
      },
      {
        label: '面积积分',
        role: 'formula',
        marker: 'cyan',
        content: '写“A=∫_0^H B(1-h/H)dh”。',
        speech: '小面积是 w(h) dh，所以总面积就是从零到 H 积分 B 乘一减 h 除以 H。',
      },
      {
        label: '结果对照',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“积分结果 = BH/2”。',
        speech: '积分结果回到熟悉的三角形公式 B H 除以二。这样我们看到公式其实来自切片累加。',
      },
    ],
  },
  {
    title: '半圆面积：宽度来自圆方程',
    sceneTitle: '半圆水平切片',
    layout: '左侧半圆和水平弦，中间由圆方程求左右边界，右侧积分，底部几何结果。',
    components: [
      {
        label: '半圆入口',
        role: 'opening',
        marker: 'red',
        content: '写“用水平切片计算半圆面积”；画半径 R 的半圆。',
        speech: '半圆也可以用水平切片。关键是找每一层水平弦的长度。',
      },
      {
        label: '圆方程',
        role: 'formula',
        marker: 'lime',
        content: '写“x²+h²=R²”。',
        speech: '设高度变量为 h，圆方程是 x 平方加 h 平方等于 R 平方。',
      },
      {
        label: '宽度函数',
        role: 'formula',
        marker: 'blue',
        content: '写“x=±√(R²-h²)”；“w(h)=2√(R²-h²)”。',
        speech: '左右边界分别是正负根号 R 平方减 h 平方，所以水平弦长是两倍这个根号。',
      },
      {
        label: '面积积分',
        role: 'formula',
        marker: 'cyan',
        content: '写“A=∫_0^R 2√(R²-h²)dh”。',
        speech: '如果取上半圆，从 h 等于零到 R，面积积分就是两倍根号 R 平方减 h 平方。',
      },
      {
        label: '几何对照',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“结果应等于 πR²/2”。',
        speech: '计算结果应该等于半个圆面积，也就是 π R 平方除以二。这个对照可以帮助检查。',
      },
    ],
  },
  {
    title: '体积切片：先写截面积',
    sceneTitle: '体积切片方法',
    layout: '左侧画立体切片，中间写 A(x)，右侧区分圆盘与非圆截面，底部总公式。',
    components: [
      {
        label: '体积入口',
        role: 'opening',
        marker: 'red',
        content: '标题“体积切片”；写“先问每一片长什么样”。',
        speech: '现在从面积进入体积。体积题的第一步是问：每一片的截面是什么形状。',
      },
      {
        label: '薄片体积',
        role: 'visual',
        marker: 'lime',
        content: '画厚度 dx 的薄片，写“ΔV≈A(x)Δx”。',
        speech: '一个很薄的切片，体积近似等于截面积 A(x) 乘以厚度 Δx。',
      },
      {
        label: '体积公式',
        role: 'formula',
        marker: 'blue',
        content: '写“V=∫_a^b A(x)dx”或“V=∫ A(y)dy”。',
        speech: '把所有薄片累加并取极限，就得到体积公式：积分截面积乘厚度。',
      },
      {
        label: '截面类型',
        role: 'strategy',
        marker: 'cyan',
        content: '写“圆盘：A=πr²；正方形：A=s²；半圆：A=πr²/2”。',
        speech: '不同题目的差别在截面积公式。圆盘用 π r 平方，正方形用边长平方，半圆用半个圆面积。',
      },
      {
        label: '方法提醒',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“体积题不是背形状，而是写 A(变量)”。',
        speech: '底部提醒：体积题不是背很多形状，而是把每一片的截面积写成变量的函数。',
      },
    ],
  },
  {
    title: '圆锥体积：半径随高度变',
    sceneTitle: '圆锥体积',
    layout: '左侧圆锥切成圆盘，中间用相似三角形找 r(h)，右侧积分，底部结果。',
    components: [
      {
        label: '圆锥入口',
        role: 'opening',
        marker: 'red',
        content: '写“用水平切片计算圆锥体积”；画高 H、底半径 R。',
        speech: '圆锥横切后，每一片是圆盘，但圆盘半径会随着高度变化。',
      },
      {
        label: '半径函数',
        role: 'visual',
        marker: 'lime',
        content: '画高度 h 处圆盘，标“r(h)”。',
        speech: '在高度 h 处，截面圆的半径是 r(h)。靠近顶点半径小，靠近底部半径大。',
      },
      {
        label: '相似比例',
        role: 'formula',
        marker: 'blue',
        content: '写“r(h)=R(1-h/H)”或等价比例。',
        speech: '半径函数来自相似三角形。如果从底部量 h，可以写成 R 乘一减 h 除以 H。',
      },
      {
        label: '体积积分',
        role: 'formula',
        marker: 'cyan',
        content: '写“V=∫_0^H π[r(h)]²dh”。',
        speech: '每片截面积是 π r(h) 平方，因此体积就是从零到 H 积分这个截面积。',
      },
      {
        label: '结果对照',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“积分结果 = πR²H/3”。',
        speech: '积分结果是 π R 平方 H 除以三，也就是熟悉的圆锥体积公式。',
      },
    ],
  },
  {
    title: '球体体积：截面半径来自圆方程',
    sceneTitle: '球体体积',
    layout: '左侧球体切片，中间画半径关系，右侧写 A(h)，底部积分结果。',
    components: [
      {
        label: '球体入口',
        role: 'opening',
        marker: 'red',
        content: '写“用切片计算球体体积”；画半径 R 的球。',
        speech: '球体横切后，每一片也是圆盘。不同高度处，圆盘半径由圆方程决定。',
      },
      {
        label: '截面半径',
        role: 'visual',
        marker: 'lime',
        content: '画截面半径 r 与高度 h，写“r²+h²=R²”。',
        speech: '如果中心到切片的高度是 h，截面半径 r 满足 r 平方加 h 平方等于 R 平方。',
      },
      {
        label: '截面积',
        role: 'formula',
        marker: 'blue',
        content: '写“A(h)=πr²=π(R²-h²)”。',
        speech: '因此每片截面积是 π r 平方，也就是 π 乘 R 平方减 h 平方。',
      },
      {
        label: '体积积分',
        role: 'formula',
        marker: 'cyan',
        content: '写“V=∫_{-R}^{R}π(R²-h²)dh”。',
        speech: '从球的底部到顶部，高度 h 从负 R 到 R，积分所有圆盘面积。',
      },
      {
        label: '结果对照',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“结果 = 4πR³/3”。',
        speech: '积分结果得到四分之三 π R 三次方，这就是球体体积公式。',
      },
    ],
  },
  {
    title: '金字塔体积：正方形截面',
    sceneTitle: '金字塔体积',
    layout: '左侧金字塔，中央正方形截面边长 s(h)，右侧积分，底部代入数字。',
    components: [
      {
        label: '题目入口',
        role: 'opening',
        marker: 'red',
        content: '写“金字塔高 481，底边 756”；画正方形底座。',
        speech: '金字塔不是旋转体，横切片不是圆盘，而是正方形。所以第一步要找正方形边长。',
      },
      {
        label: '截面形状',
        role: 'visual',
        marker: 'lime',
        content: '画高度 h 处正方形截面，边长 s(h)。',
        speech: '在高度 h 处的水平截面仍然是正方形，边长记作 s(h)。',
      },
      {
        label: '相似比例',
        role: 'formula',
        marker: 'blue',
        content: '写“s(h)=756(1-h/481)”。',
        speech:
          '边长随高度线性缩小，来自相似三角形。从底部量高度 h，边长可以写成七百五十六乘一减 h 除以四百八十一。',
      },
      {
        label: '体积积分',
        role: 'formula',
        marker: 'cyan',
        content: '写“V=∫_0^{481}[s(h)]²dh”。',
        speech: '正方形截面积是边长平方，所以体积就是积分 s(h) 的平方。',
      },
      {
        label: '公式对照',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“应等于 底面积×高/3”。',
        speech: '计算结果应该等于底面积乘高除以三。这个对照能检查积分是否合理。',
      },
    ],
  },
  {
    title: '绕 x 轴旋转：圆盘法',
    sceneTitle: '圆盘法旋转体',
    layout: '左侧区域 y=e^x 与 x 轴，中央旋转成圆盘，右侧写体积积分，底部结果。',
    components: [
      {
        label: '题目入口',
        role: 'opening',
        marker: 'red',
        content: '写“y=e^x，0≤x≤1，绕 x 轴旋转”。',
        speech: '这道旋转体题的区域在 x 轴上方，绕 x 轴旋转后，每个竖直小条会形成圆盘。',
      },
      {
        label: '半径函数',
        role: 'visual',
        marker: 'lime',
        content: '画半径 r=e^x 的圆盘截面。',
        speech: '圆盘半径就是曲线到 x 轴的距离，也就是 e 的 x 次方。',
      },
      {
        label: '截面积',
        role: 'formula',
        marker: 'blue',
        content: '写“A(x)=π(e^x)²=πe^{2x}”。',
        speech: '每个截面的面积是 π r 平方，所以 A(x) 等于 π 乘 e 的二 x 次方。',
      },
      {
        label: '体积积分',
        role: 'formula',
        marker: 'cyan',
        content: '写“V=π∫_0^1 e^{2x}dx”。',
        speech: '体积就是把圆盘面积从 x 等于零到一累加，也就是 π 积分 e 的二 x 次方。',
      },
      {
        label: '计算结果',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“V=π(e²-1)/2”。',
        speech: '积分 e 的二 x 次方会带出二分之一，所以结果是 π 乘 e 平方减一再除以二。',
      },
    ],
  },
  {
    title: '变半径圆截面：桌腿体积',
    sceneTitle: '变半径体积',
    layout: '左侧画桌腿纵向形状，中间给半径函数 r(y)，右侧写 A(y)，底部说明按高度积分。',
    components: [
      {
        label: '题目入口',
        role: 'opening',
        marker: 'red',
        content: '写“桌腿每一层是圆形截面”；画随高度变化的半径。',
        speech: '这类题给的是每个高度的圆形截面半径。形状可能不规则，但切片方法完全一样。',
      },
      {
        label: '半径函数',
        role: 'formula',
        marker: 'lime',
        content: '写“半径 r(y) 随高度 y 变化”。',
        speech: '半径是 y 的函数，记作 r(y)。题目可能给出具体公式，比如常数加一个三角函数。',
      },
      {
        label: '截面积',
        role: 'formula',
        marker: 'blue',
        content: '写“A(y)=π[r(y)]²”。',
        speech: '每一层是圆形截面，所以截面积就是 π 乘半径函数的平方。',
      },
      {
        label: '体积积分',
        role: 'formula',
        marker: 'cyan',
        content: '写“V=∫_{y=c}^{d}π[r(y)]²dy”。',
        speech: '沿高度方向把这些圆截面累加，就得到桌腿体积。上下限来自桌腿的高度范围。',
      },
      {
        label: '方法提醒',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“半径先平方，再积分；不要先积分半径”。',
        speech: '底部提醒很重要：体积累加的是截面积，所以先把半径平方，再积分。不能直接积分半径。',
      },
    ],
  },
  {
    title: '选择切片方向：dx 还是 dy',
    sceneTitle: '切片方向选择',
    layout: '左侧 dx 切片，右侧 dy 切片，中间比较边界表达式，底部决策清单。',
    components: [
      {
        label: '选择入口',
        role: 'opening',
        marker: 'red',
        content: '标题“选择切片方向”；写“先看哪种边界更简单”。',
        speech: '最后做题时，最常见的问题是该用 dx 还是 dy。答案取决于哪种切片让小片更容易描述。',
      },
      {
        label: '竖直切片',
        role: 'visual',
        marker: 'lime',
        content: '画竖直小条，写“高度=上-下，厚度 dx”。',
        speech: '竖直切片适合上下边界容易写成 y 关于 x 的函数的区域。',
      },
      {
        label: '水平切片',
        role: 'visual',
        marker: 'blue',
        content: '画水平小条，写“宽度=右-左，厚度 dy”。',
        speech: '水平切片适合左右边界更容易写成 x 关于 y 的函数的区域。',
      },
      {
        label: '体积选择',
        role: 'formula',
        marker: 'cyan',
        content: '写“旋转体看半径；非圆截面看截面形状”。',
        speech: '体积题还要看截面形状。旋转体先找半径，非圆截面先找边长或其它几何量。',
      },
      {
        label: '决策清单',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部 checklist：“画图；定方向；写小片；再积分”。',
        speech: '底部清单就是通用解题顺序：先画图，定切片方向，写出小片的量，再积分。',
      },
    ],
  },
  {
    title: '常见错误：面积和体积不要混用',
    sceneTitle: '常见错误检查',
    layout: '左侧列面积错误，中间列体积错误，右侧列上下限错误，底部做最终检查。',
    components: [
      {
        label: '错误入口',
        role: 'opening',
        marker: 'red',
        content: '标题“常见错误检查”；写“先确认你在算面积还是体积”。',
        speech:
          '这一页专门做排错。很多题算错，不是积分不会算，而是一开始把面积和体积的小片写混了。',
      },
      {
        label: '面积错误',
        role: 'mistake',
        marker: 'lime',
        content: '写“面积小片是长度×厚度，不要多乘 π”。',
        speech: '面积题的小片通常是高度差乘 dx，或者宽度乘 dy。它不是圆盘，不应该无缘无故多乘 π。',
      },
      {
        label: '体积错误',
        role: 'mistake',
        marker: 'blue',
        content: '写“体积小片是截面积×厚度，半径要先平方”。',
        speech: '体积题的小片是截面积乘厚度。如果是圆盘，必须先写 π r 平方，不能直接积分半径。',
      },
      {
        label: '上下限错误',
        role: 'mistake',
        marker: 'cyan',
        content: '写“用 x 切就用 x 上下限；用 y/h 切就用 y/h 上下限”。',
        speech: '上下限要跟切片变量一致。用 x 切就用 x 的范围，用 y 或 h 切就用对应高度的范围。',
      },
      {
        label: '最终检查',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部 checklist：“变量一致；小片单位对；结果为正；量纲合理”。',
        speech:
          '最后检查四件事：变量是否一致，小片单位是否对，面积或体积是否为正，最后量纲是否合理。',
      },
    ],
  },
  {
    title: '总结：面积与体积的统一语言',
    sceneTitle: '总结',
    layout: '中心写“切片累加”，周围三块：面积、体积、选择方向；底部最终清单。',
    components: [
      {
        label: '总结入口',
        role: 'opening',
        marker: 'red',
        content: '标题“面积与体积的统一语言”；中心写“切片累加”。',
        speech: '最后一页把整本笔记收束起来。面积和体积的统一语言，就是切片累加。',
      },
      {
        label: '面积语言',
        role: 'formula',
        marker: 'lime',
        content: '写“面积：∫ 高度差 dx 或 ∫ 宽度 dy”。',
        speech: '面积题看小片长度。竖直切片用高度差 dx，水平切片用宽度 dy。',
      },
      {
        label: '体积语言',
        role: 'formula',
        marker: 'blue',
        content: '写“体积：∫ 截面积 · 厚度”。',
        speech: '体积题看截面积。先写 A(x) 或 A(y)，再沿对应方向积分。',
      },
      {
        label: '选择方向',
        role: 'strategy',
        marker: 'cyan',
        content: '写“哪个方向让边界/截面积更简单，就选哪个”。',
        speech: '切片方向不是固定的。哪个方向让边界或截面积更容易写，就选哪个。',
      },
      {
        label: '最终清单',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部 checklist：“图像清楚；小片清楚；上下限清楚；单位清楚”。',
        speech:
          '最后用四项检查：图像是否清楚，小片是否清楚，上下限是否清楚，最后面积或体积单位是否合理。',
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

Generate page ${pageNumber} of a Chinese calculus area-and-volume notebook as a marker source image. The image itself must contain the colored corner markers; later software will recover the regions and remove the markers.

Hard visible-text rules:
- All visible prose, headings, labels, and question text must be Simplified Chinese.
- Do not write any course code, course name, teacher name, date, page number, or week label.
- Do not write MAT136, Calculus II, Week, 第1周, 页码, Page, or any English prose.
- Do not write component numbers or circled numbers before headings.
- Standard math notation is allowed: x, y, h, R, H, B, r(x), r(y), A(x), A(y), dx, dy, dh, π, e^x, sin, cos, ∫.

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
    title: '面积与体积：从曲线间面积到切片法',
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

function narrationStep(marker, title, speech) {
  return { marker, title, speech };
}

function compactContent(content) {
  return String(content || '')
    .replace(/\s+/g, ' ')
    .replace(/[。；;]\s*$/, '');
}

function speechContent(content) {
  return compactContent(content)
    .replace(/(?:底部写|左侧写|右侧写|顶部写|旁边写|标题|写|列|标)[“"]([^”"]+)[”"]/g, '$1')
    .replace(/画断点/g, '标出断点')
    .replace(/画/g, '')
    .replace(/；/g, '，')
    .replace(/\s*，\s*/g, '，')
    .replace(/，{2,}/g, '，')
    .replace(/^[，：:\s]+|[，。；;\s]+$/g, '');
}

function detailTitleForComponent(component, index) {
  const role = component.role || '';
  if (index === 0) return '本页路线';
  if (role === 'visual') return `${component.label}怎么读`;
  if (role === 'formula' || role === 'definition' || role === 'rule')
    return `${component.label}怎么用`;
  if (role === 'strategy' || role === 'roadmap' || role === 'step') return `${component.label}顺序`;
  if (role === 'example' || role === 'examples' || role === 'derivation')
    return `${component.label}计算`;
  if (role === 'takeaway' || role === 'hook' || role === 'mistake') return `${component.label}检查`;
  return `${component.label}推进`;
}

function detailSpeechForComponent(_page, component, index) {
  const content = speechContent(component.content);
  const role = component.role || '';

  if (index === 0) {
    return `这页要把几何问题翻译成积分。先确定变量和切片方向，再把每一小片的面积或体积写成可以积分的函数。`;
  }

  if (role === 'visual') {
    return `${content}。读这种图时，重点是把高度、宽度、半径或截面积说成变量的函数，不能只停在图形直觉上。`;
  }

  if (role === 'formula') {
    return `${content}。读公式时先看积分变量，再看被积函数代表高度差、横向宽度，还是某个截面积。`;
  }

  if (role === 'strategy' || role === 'roadmap' || role === 'step') {
    return `${content}。面积和体积题按这个顺序最稳：先找边界，再定切片方向，最后写出小片的量。`;
  }

  if (role === 'takeaway' || role === 'hook' || role === 'mistake') {
    return `${content}。检查时顺手看单位：面积应该来自长度乘长度，体积应该来自截面积乘厚度。`;
  }

  return `${content}。这里要把图形里的长度关系整理成函数关系，后面才能真正进入积分计算。`;
}

function narrationForPage(page) {
  const steps = [];
  for (const [index, component] of page.components.entries()) {
    steps.push(narrationStep(component.marker, component.label, component.speech));
    if (index < 4) {
      steps.push(
        narrationStep(
          component.marker,
          detailTitleForComponent(component, index),
          detailSpeechForComponent(page, component, index),
        ),
      );
    }
  }
  return steps;
}

function actionsForPage(page, pageNumber, focusRegions) {
  const focusByMarker = new Map();
  for (const region of focusRegions) {
    const markerName = region.id.split('-').at(-1);
    focusByMarker.set(markerName, region);
  }
  const actions = [];
  const narration =
    Array.isArray(page.narration) && page.narration.length
      ? page.narration
      : narrationForPage(page);

  for (const [index, step] of narration.entries()) {
    const region = step.marker ? focusByMarker.get(step.marker) : null;
    if (!region) continue;
    const sequence = String(index + 1).padStart(2, '0');
    const actionBase = `${NOTEBOOK_ID}-p${pageLabel(pageNumber)}-n${sequence}-${step.marker}`;
    const title = step.title || region.label || page.sceneTitle;
    actions.push({
      id: `${actionBase}-spotlight`,
      type: 'spotlight',
      elementId: region.id,
      title,
      description: `聚焦“${region.label}”区域。`,
      dimOpacity: 0.68,
    });
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
          name: '面积与体积：从曲线间面积到切片法',
          description: '第四本中文手绘图片笔记本：曲线间面积、水平切片、体积切片与旋转体。',
          tags: ['MAT136', '面积', '体积', '切片法', '中文笔记', '四角marker'],
          avatarUrl: '/avatars/notebook-agents/avatar8.avif',
          language: 'zh-CN',
          style: 'imagegen-marker-recovered-v2',
          updatedAt: now,
        },
        create: {
          id: NOTEBOOK_ID,
          ownerId: course.ownerId,
          courseId: course.id,
          name: '面积与体积：从曲线间面积到切片法',
          description: '第四本中文手绘图片笔记本：曲线间面积、水平切片、体积切片与旋转体。',
          tags: ['MAT136', '面积', '体积', '切片法', '中文笔记', '四角marker'],
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
