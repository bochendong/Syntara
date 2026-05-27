#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { generatedNotebookDir, generatedNotebookPublicPath } from '../shared/paths.mjs';

const NOTEBOOK_ID = 'nb-mat136-riemann-integral-week1-20260518135718';
const COURSE_ID = 'cmpanemia001v8ouzmhttvkrn';
const OUTPUT_DIR = generatedNotebookDir(NOTEBOOK_ID);
const PUBLIC_DIR = generatedNotebookPublicPath(NOTEBOOK_ID);
const NOW = new Date();
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;
const SOURCE_WIDTH = 1600;
const SOURCE_HEIGHT = 900;
const HOTSPOT_PATH = 'M 0 0 L 200 0 L 200 200 L 0 200 Z';

const IMAGEGEN_DIR =
  '/Users/dongpochen/.codex/generated_images/019e3bde-a8aa-75c0-a656-942c58162092';

const imageFiles = [
  'ig_07e2c92eb5206121016a0b5502a308819083e8615c182a3703.png',
  'ig_07e2c92eb5206121016a0b4ea575ec8190a4e4d68b6e55926e.png',
  'ig_07e2c92eb5206121016a0b4f116e108190bba6d790881891f4.png',
  'ig_07e2c92eb5206121016a0b4f6c87588190bc0106ad659e880b.png',
  'ig_07e2c92eb5206121016a0b4fad50d88190a9567a3ec6dc0580.png',
  'ig_07e2c92eb5206121016a0b4fe915ec8190a0074016c8b13d53.png',
  'ig_07e2c92eb5206121016a0b55722da48190a18c1f0fe4edb600.png',
  'ig_07e2c92eb5206121016a0b55e261f48190a8c29cd8ffde1b2d.png',
  'ig_07e2c92eb5206121016a0b5031c0e08190a1bbb815fcabf11d.png',
  'ig_07e2c92eb5206121016a0b5084cf448190816b58ed3b0d19fd.png',
  'ig_07e2c92eb5206121016a0b50d01304819086eaa59fa3c45827.png',
  'ig_07e2c92eb5206121016a0b511908e4819082fb3d0f72e59d04.png',
  'ig_07e2c92eb5206121016a0b51ebf1e88190be46976a9f3ba029.png',
];

const slides = [
  {
    title: 'MAT 136 · 黎曼积分',
    steps: [
      {
        id: 'cover-title',
        label: '课程主题',
        rect: [90, 50, 760, 170],
        speech:
          '这本 notebook 讲 MAT 136 的黎曼积分。今天的目标不是先背定积分符号，而是先理解面积数从哪里来。',
      },
      {
        id: 'rectangle-refinement',
        label: '矩形逐步变细',
        rect: [45, 285, 1165, 320],
        speech:
          '看下面这组三幅图：从粗分割到细分割，矩形越来越贴近曲线。这个过程就是我们今天的主线。',
      },
      {
        id: 'limit-area',
        label: '极限面积 A',
        rect: [1215, 330, 265, 220],
        speech: '右侧的 A 代表最终稳定下来的面积数。后面我们会把它和黎曼可积联系起来。',
      },
      {
        id: 'lesson-flow',
        label: '学习路线',
        rect: [70, 675, 1265, 120],
        speech: '整节课的路线是：Riemann sums 到 integrability，再到下一节的 definite integral。',
      },
    ],
  },
  {
    title: '黎曼积分：从矩形到极限',
    steps: [
      {
        id: 'visual-question',
        label: '问题入口',
        rect: [50, 150, 370, 430],
        speech:
          '这节课的核心问题很朴素：曲线下面积不是一个标准矩形，那我们能不能用很多矩形把它逼出来？',
      },
      {
        id: 'learning-flow',
        label: '四步路线',
        rect: [430, 145, 710, 435],
        speech:
          '路线分四步：先理解面积作为累积量，再分割区间，选择采样点，最后观察矩形和在网格变细时是否稳定。',
      },
      {
        id: 'sum-formula-preview',
        label: '公式预告',
        rect: [1175, 150, 360, 430],
        speech: '这里的求和符号先当作预告。今天所有公式都围绕一个动作：把每个小矩形的面积加起来。',
      },
      {
        id: 'lesson-question',
        label: '本节课问题',
        rect: [340, 720, 930, 95],
        speech:
          '所以本节课只回答一个问题：矩形和怎样逼近曲线下面积。定积分符号和计算规则，留到下一节。',
      },
    ],
  },
  {
    title: '面积为什么是累积量？',
    steps: [
      {
        id: 'constant-height',
        label: '恒定高度',
        rect: [50, 125, 725, 540],
        speech: '先看恒定速度。速度不变时，距离等于速度乘时间；在图上，这个乘法就是一个矩形面积。',
      },
      {
        id: 'changing-height',
        label: '变化高度',
        rect: [825, 125, 725, 540],
        speech:
          '如果速度或者函数值不断变化，就把时间切成小段。每一小段里先用一个矩形近似这一段的累积量。',
      },
      {
        id: 'core-idea',
        label: '核心想法',
        rect: [270, 705, 1060, 105],
        speech: '这一步没有新魔法，只有拆分：把复杂面积拆成许多简单矩形，再把它们加起来。',
      },
    ],
  },
  {
    title: '第一步：分割区间 P',
    steps: [
      {
        id: 'partition-line',
        label: '分割区间',
        rect: [75, 145, 1450, 315],
        speech:
          '分割区间就是在左端点到右端点之间插入一串点：第一个点是左端点，最后一个点是右端点，中间按顺序排开。',
      },
      {
        id: 'partition-notation',
        label: '分割表示',
        rect: [55, 520, 620, 220],
        speech: '这串点合起来叫一个分割。任意一个小区间的宽度，就是它的右边界减去左边界。',
      },
      {
        id: 'equal-width',
        label: '等分宽度',
        rect: [870, 520, 620, 220],
        speech:
          '如果是等分，那么每段宽度都一样，是整个区间长度除以段数。非等分时，每一小段可以有自己的宽度。',
      },
      {
        id: 'fine-partition',
        label: '变细预告',
        rect: [355, 765, 895, 82],
        speech: '分割越细，矩形越能贴近曲线。这个直觉会在后面变成 mesh 趋近零。',
      },
    ],
  },
  {
    title: '第二步：选择采样点 c_i',
    steps: [
      {
        id: 'left-sample',
        label: '左端点采样',
        rect: [45, 145, 470, 465],
        speech: '每个小区间里要选一个采样点。左端点规则就是取这一段最左边的点。',
      },
      {
        id: 'right-sample',
        label: '右端点采样',
        rect: [565, 145, 470, 465],
        speech: '右端点规则取这一段最右边的点。它和左端点只差采样位置，但矩形高度可能不同。',
      },
      {
        id: 'midpoint-sample',
        label: '中点采样',
        rect: [1085, 145, 470, 465],
        speech:
          '中点规则取小区间中间的位置。以后做数值近似时，中点法常常比单纯左端点或右端点更稳。',
      },
      {
        id: 'height-rule',
        label: '高度规则',
        rect: [320, 660, 960, 105],
        speech: '无论怎么选，矩形高度都是函数在采样点处的值，所以矩形面积就是高度乘宽度。',
      },
    ],
  },
  {
    title: '第三步：把矩形面积加起来',
    steps: [
      {
        id: 'rectangle-geometry',
        label: '第 i 个矩形',
        rect: [70, 160, 800, 510],
        speech:
          '在图上，任意一个矩形的宽度是这一小段的长度，高度是函数在采样点处的值。这一块面积就是高度乘宽度。',
      },
      {
        id: 'single-area',
        label: '单个矩形面积',
        rect: [1025, 165, 430, 190],
        speech: '先写单个矩形面积：这一块面积等于高度乘宽度。',
      },
      {
        id: 'riemann-sum',
        label: '黎曼和公式',
        rect: [925, 395, 575, 250],
        speech: '然后把所有小矩形从第一段加到最后一段，就得到一个黎曼和。',
      },
      {
        id: 'definition-label',
        label: '名称',
        rect: [430, 735, 700, 85],
        speech: '先记住名字：Riemann sum 是一个近似面积的数，不是最终答案本身。',
      },
    ],
  },
  {
    title: '例题 1：左黎曼和估计 √x',
    steps: [
      {
        id: 'problem-setup',
        label: '题目设定',
        rect: [55, 105, 1485, 90],
        speech: '第一个计算例题：在三十二到四十上分成四段，用左端点估计根号 x 下方的面积。',
      },
      {
        id: 'graph-partition',
        label: '图像和分割',
        rect: [65, 235, 730, 460],
        speech: '区间长度是八，分成四段，所以每段宽度是二。图上四个矩形都用每段左边的高度。',
      },
      {
        id: 'left-endpoints',
        label: '左端点',
        rect: [830, 220, 655, 155],
        speech: '左端点依次是三十二、三十四、三十六、三十八。最后一个四十不是左端点采样值。',
      },
      {
        id: 'left-sum-formula',
        label: '左黎曼和公式',
        rect: [830, 375, 665, 210],
        speech: '把左端点的函数值代入：四段左黎曼和等于二乘以这四个左端点处函数值的总和。',
      },
      {
        id: 'numeric-answer',
        label: '数值答案',
        rect: [895, 585, 555, 145],
        speech: '计算后约等于四十七点三零四。这是左黎曼和给出的面积近似，不是精确面积。',
      },
      {
        id: 'left-rule-reminder',
        label: '左端点提醒',
        rect: [400, 735, 860, 105],
        speech: '关键提醒：左端点就是每段左边的高度。以后看到 left sum，先找每个小区间的左边界。',
      },
    ],
  },
  {
    title: '例题 2：只有表格，也能算右黎曼和',
    steps: [
      {
        id: 'table-only-setup',
        label: '只有表格',
        rect: [55, 105, 1485, 100],
        speech:
          '第二个例题没有函数表达式，只有表格。黎曼和不要求一定知道公式，只要知道采样点处的函数值。',
      },
      {
        id: 'data-table',
        label: '数据表',
        rect: [60, 235, 360, 260],
        speech: '表格给出 x 等于零、二、四、六、八时的函数值。我们要用这些离散数据估计面积。',
      },
      {
        id: 'right-rectangles',
        label: '右端点矩形',
        rect: [500, 225, 610, 410],
        speech:
          '分割是零到八，每段宽度二。右端点分别是二、四、六、八，所以矩形高度来自这些右边的表格值。',
      },
      {
        id: 'right-sum-formula',
        label: '右黎曼和公式',
        rect: [1150, 285, 380, 220],
        speech: '右黎曼和是二乘以四个右端点处函数值的总和，也就是二乘以五加四加七加六。',
      },
      {
        id: 'table-answer',
        label: '最终答案',
        rect: [1165, 515, 335, 125],
        speech: '所以四段右黎曼和等于四十四。这个例子说明，表格函数也可以直接做黎曼和。',
      },
      {
        id: 'right-rule-reminder',
        label: '右端点提醒',
        rect: [470, 690, 900, 115],
        speech: '关键提醒：右端点就是每段右边的表格值。先选点，再查表，再乘宽度。',
      },
    ],
  },
  {
    title: '三种常见采样规则',
    steps: [
      {
        id: 'left-rule',
        label: 'Left sum',
        rect: [45, 155, 480, 505],
        speech: '左端点和用每段左端点当采样点。对递增函数，它通常会偏低。',
      },
      {
        id: 'right-rule',
        label: 'Right sum',
        rect: [560, 155, 480, 505],
        speech: '右端点和用每段右端点当采样点。对递增函数，它通常会偏高。',
      },
      {
        id: 'midpoint-rule',
        label: 'Midpoint sum',
        rect: [1075, 155, 480, 505],
        speech: '中点和用中点高度。它不一定总是高估或低估，但常常更平衡。',
      },
      {
        id: 'same-partition',
        label: '同一分割不同采样',
        rect: [290, 710, 1010, 92],
        speech: '注意，这三者可以用同一个分割 P，只是采样点不同，所以得到的近似数也不同。',
      },
    ],
  },
  {
    title: '高估 / 低估：先看单调性',
    steps: [
      {
        id: 'increasing-left-low',
        label: '递增左端点低估',
        rect: [50, 145, 705, 250],
        speech: '先看递增函数。每段左端点在这一段的较低位置，所以左端点矩形落在曲线下方，是低估。',
      },
      {
        id: 'increasing-right-high',
        label: '递增右端点高估',
        rect: [845, 145, 705, 250],
        speech: '同样是递增函数，右端点在每段较高位置，所以右端点矩形盖过曲线，是高估。',
      },
      {
        id: 'decreasing-cases',
        label: '递减时反过来',
        rect: [50, 435, 1500, 260],
        speech: '递减函数时判断反过来：左端点在高处，右端点在低处。所以左端点高估，右端点低估。',
      },
      {
        id: 'inequality-summary',
        label: '不等式总结',
        rect: [75, 715, 1450, 108],
        speech:
          '总结成不等式：递增时，左端点和不超过真实面积，真实面积不超过右端点和；递减时顺序相反。',
      },
    ],
  },
  {
    title: '让分割变细：mesh 趋近 0',
    steps: [
      {
        id: 'coarse-partition',
        label: '粗分割',
        rect: [55, 165, 620, 395],
        speech: '粗分割时，小矩形很宽，矩形顶部和曲线之间的误差明显。近似会比较粗糙。',
      },
      {
        id: 'fine-partition',
        label: '细分割',
        rect: [900, 165, 635, 395],
        speech: '把分割变细以后，矩形变窄，顶部更贴近曲线。这个过程叫 refinement。',
      },
      {
        id: 'mesh-definition',
        label: 'mesh 定义',
        rect: [65, 595, 1380, 115],
        speech: '网格粗细，英文叫 mesh，等于所有小区间宽度里的最大值。它控制最粗的那一段有多粗。',
      },
      {
        id: 'mesh-hook',
        label: '趋稳问题',
        rect: [225, 735, 1110, 95],
        speech:
          '如果 mesh 趋近零时，所有合法采样的矩形和都趋向同一个数，我们就快要得到黎曼积分了。',
      },
    ],
  },
  {
    title: '什么时候叫“可黎曼积分”？',
    steps: [
      {
        id: 'any-sampling',
        label: '任意采样',
        rect: [50, 145, 390, 430],
        speech: '这里最关键的是任意采样点。只要采样点落在它自己的小区间里，都算合法选择。',
      },
      {
        id: 'converging-sums',
        label: '不同和趋向 A',
        rect: [455, 135, 690, 450],
        speech:
          '左端点、右端点、甚至随机采样，随着 mesh 变小，如果都趋向同一个 A，就说明面积数稳定了。',
      },
      {
        id: 'same-limit',
        label: '同一个极限',
        rect: [1190, 145, 345, 430],
        speech: '这个 A 不能依赖你怎么分割，也不能依赖你怎么选采样点。它必须是同一个极限。',
      },
      {
        id: 'integrable-definition',
        label: '可黎曼积分定义',
        rect: [235, 625, 1125, 125],
        speech: '因此，若这个极限 A 与分割和采样无关，我们就说 f 可黎曼积分。',
      },
    ],
  },
  {
    title: '本节课总结：黎曼积分的流程',
    steps: [
      {
        id: 'five-step-flow',
        label: '五步流程',
        rect: [50, 115, 980, 300],
        speech: '把今天的流程压缩成五步：分割区间，选采样点，做矩形，求和，再让网格粗细趋近零。',
      },
      {
        id: 'sum-formula',
        label: '核心公式',
        rect: [955, 115, 560, 230],
        speech:
          '核心公式仍然是在说：把每段的高度乘宽度，再把所有小段加起来。所有图像直觉最后都落到这条式子上。',
      },
      {
        id: 'limit-conclusion',
        label: '可积结论',
        rect: [80, 430, 1010, 250],
        speech: '如果所有这些矩形和都趋向同一个 A，那么函数就是可黎曼积分的，A 就是稳定的面积数。',
      },
      {
        id: 'next-class-hook',
        label: '下节课钩子',
        rect: [235, 735, 1100, 92],
        speech: '下一节，我们会把 A 记成定积分，并开始学习怎样不靠画无穷多个矩形来计算它。',
      },
    ],
  },
];

const parentRegionStepsByTitle = {
  'MAT 136 · 黎曼积分': [
    {
      id: 'cover-title',
      label: '封面标题区',
      rect: [50, 45, 880, 180],
      speech:
        '这本 notebook 讲 MAT 136 的黎曼积分。今天先不急着背定积分符号，而是先理解面积数怎样从矩形近似里长出来。',
    },
    {
      id: 'refinement-visual',
      label: '矩形细化主图',
      rect: [45, 265, 1210, 350],
      speech:
        '封面中间这组图就是主线：从粗分割到细分割，矩形越来越贴近曲线，最后逼近一个稳定的面积数。',
    },
    {
      id: 'lesson-flow',
      label: '学习路线',
      rect: [60, 675, 1280, 125],
      speech: '整节课的路线是：先讲黎曼和，再讲可积性，最后把下一节的定积分接上。',
    },
  ],
  '黎曼积分：从矩形到极限': [
    {
      id: 'storyboard-flow',
      label: '四步概览区',
      rect: [45, 145, 1510, 520],
      speech:
        '先把这一页当成今天的地图。我们从左到右看：第一，曲线下面积可以理解成一种累积量；第二，把区间切成很多小区间；第三，在每个小区间里选一个采样点来决定矩形高度；第四，让分割越来越细，观察这些矩形和会不会稳定到同一个数。今天先抓住这条路线，不急着背定积分符号。',
    },
    {
      id: 'lesson-question',
      label: '本节课问题',
      rect: [330, 715, 940, 105],
      speech:
        '所以本节课真正的问题只有一个：矩形和到底怎样逼近曲线下面积？如果你能讲清楚“切区间、选高度、加矩形、取极限”这四件事，黎曼积分的定义就已经在你手里了。正式的定积分记号和计算方法，我们放到下一节接上。',
    },
  ],
  '面积为什么是累积量？': [
    {
      id: 'constant-panel',
      label: '恒定高度面板',
      rect: [45, 130, 735, 535],
      speech:
        '左边先看最简单的情况：高度不变。比如速度一直固定，经过一段时间，距离就是速度乘以时间长度。画在图像上，这正好是一个矩形面积。也就是说，“函数值乘以横向宽度”天然就对应一小段累积量。',
    },
    {
      id: 'changing-panel',
      label: '变化高度面板',
      rect: [815, 130, 735, 535],
      speech:
        '右边换成高度会变化的情况。整段曲线没法直接看成一个矩形，于是我们把区间切小；在每一小段里，先假装高度差不多固定，用一个矩形去近似这一段的累积量。小段越短，这个假装就越合理。',
    },
    {
      id: 'core-summary',
      label: '核心想法总结',
      rect: [270, 700, 1060, 110],
      speech:
        '核心想法就是这句：把复杂面积拆成许多简单矩形。每个矩形只负责一小段，最后再把它们加起来。黎曼和的所有符号，都是在把这个朴素想法写得更精确。',
    },
  ],
  '第一步：分割区间 P': [
    {
      id: 'partition-graph',
      label: '分割图像区',
      rect: [55, 140, 1490, 315],
      speech:
        '第一步叫分割区间。我们只是在横轴上，从左端点到右端点插入一串点：第一个点就是左端点，最后一个点就是右端点，中间按顺序排开。注意，这一步还没有决定矩形高度，也没有代入函数值；它只是在决定每个小矩形的底边在哪里。',
    },
    {
      id: 'notation-cards',
      label: '分割记号卡片',
      rect: [50, 500, 1450, 245],
      speech:
        '下方两张卡片是记号。整串分割点叫一个分割；任意一小段的宽度，就是右边界减去左边界。如果题目说等分，那每段宽度都一样，是整个区间长度除以段数；如果没有说等分，每段宽度可以不一样。',
    },
    {
      id: 'partition-summary',
      label: '分割总结条',
      rect: [330, 760, 920, 85],
      speech:
        '先留下一个直觉：分割越细，矩形越能贴近曲线。后面我们会把“越细”说得很严格，不只是切得更多，而是最宽的那一小段也必须变小。',
    },
  ],
  '第二步：选择采样点 c_i': [
    {
      id: 'sampling-panels',
      label: '三种采样面板',
      rect: [40, 145, 1520, 470],
      speech:
        '第二步是在每个小区间里选一个采样点。左端点、右端点和中点只是三种最常见的选择。它们的共同点是：采样点必须落在自己的小区间里；它们的区别是：用小区间里的哪个位置来决定这一段矩形的高度。',
    },
    {
      id: 'area-rule',
      label: '矩形面积规则',
      rect: [300, 655, 1000, 180],
      speech:
        '一旦采样点选好了，矩形高度就是函数在这个点上的值，宽度就是这一小段的长度，所以这一块面积就是高度乘宽度。这里要分清楚：采样点是横轴上的位置，函数值才是矩形的高度。',
    },
  ],
  '第三步：把矩形面积加起来': [
    {
      id: 'graph-area',
      label: '图像与矩形区',
      rect: [60, 150, 830, 540],
      speech:
        '第三步把几何图像变成一个数。左边这张图重点看某一个矩形：底边横跨它自己的小区间，所以宽度就是这一小段的长度；上边的高度由采样点决定，所以高度就是函数在采样点上的值。',
    },
    {
      id: 'derivation-panel',
      label: '公式推导区',
      rect: [925, 155, 575, 500],
      speech:
        '右侧就是把这件事写成公式。先写单个矩形：面积等于这一段的高度乘以这一段的宽度。然后从第一段加到最后一段，就得到一个黎曼和。这个和会依赖两件事：你怎么分割区间，以及每段怎么选采样点。',
    },
    {
      id: 'riemann-sum-name',
      label: '名称总结条',
      rect: [420, 730, 730, 90],
      speech:
        '这个求和就叫黎曼和。现在先把它理解成“用有限个矩形得到的面积近似”。它还不是最终的精确面积，精确面积要等我们让分割越来越细。',
    },
  ],
  '例题 1：左黎曼和估计 √x': [
    {
      id: 'problem-strip',
      label: '题目条件区',
      rect: [45, 95, 1510, 110],
      speech:
        '现在做第一个计算例题：在区间三十二到四十上，把平方根函数下方的面积用左黎曼和估计，分成四段。读题时先抓三个信息：函数是平方根函数，区间是三十二到四十，规则是左端点。',
    },
    {
      id: 'graph-panel',
      label: '图像与四段分割',
      rect: [65, 225, 735, 470],
      speech:
        '左边图像展示四段等分。总长度是四十减三十二，也就是八；分成四段，所以每段宽度是二。因为用左端点，每个矩形都取自己那一段最左边的函数值作为高度。',
    },
    {
      id: 'calculation-panel',
      label: '计算步骤区',
      rect: [820, 220, 700, 510],
      speech:
        '右边是完整计算。四个左端点是三十二、三十四、三十六、三十八；注意四十是最后边界，不进入左端点列表。所以四段左黎曼和，就是二乘以这四个左端点处函数值的总和，近似值是四十七点三零四。',
    },
    {
      id: 'left-reminder',
      label: '左端点提醒',
      rect: [380, 735, 860, 110],
      speech:
        '做左黎曼和时，检查答案最简单的方法就是问：我是不是每一段都用了左边的高度？如果函数递增，左端点矩形会偏低，所以这个近似也会低于真实面积。',
    },
  ],
  '例题 2：只有表格，也能算右黎曼和': [
    {
      id: 'problem-strip',
      label: '表格题目区',
      rect: [45, 100, 1510, 105],
      speech:
        '第二个例题故意不给函数表达式，只给表格。这个例子很重要：黎曼和不要求你一定知道公式，只要你能在采样点查到函数值，就可以估计面积。',
    },
    {
      id: 'table-panel',
      label: '数据表格区',
      rect: [55, 235, 380, 260],
      speech:
        '先读表格。横坐标的位置是零、二、四、六、八，对应的函数值分别是三、五、四、七、六。区间从零到八，分成四段，所以每段宽度仍然是二。',
    },
    {
      id: 'graph-panel',
      label: '右端点矩形区',
      rect: [490, 220, 620, 430],
      speech:
        '中间图像说明右端点规则。四个小区间是零到二、二到四、四到六、六到八；它们的右端点分别是二、四、六、八。所以矩形高度要查这些右端点对应的表格值。',
    },
    {
      id: 'calculation-panel',
      label: '右黎曼和计算区',
      rect: [1140, 255, 390, 390],
      speech:
        '右边把查表结果代入：四段右黎曼和等于二乘以五加四加七加六，最后得到四十四。这个答案不是由公式曲线算出来的，而是由表格数据和右端点规则算出来的。',
    },
  ],
  三种常见采样规则: [
    {
      id: 'three-rule-panels',
      label: '三种采样规则面板',
      rect: [40, 150, 1520, 510],
      speech:
        '这一页把三种常见规则放在一起比较：左端点和用左端点，右端点和用右端点，中点和用中点。三张图的分割可以完全一样，真正改变的是每段的采样点，因此每个矩形的高度会不同。',
    },
    {
      id: 'comparison-summary',
      label: '比较总结条',
      rect: [280, 705, 1030, 100],
      speech:
        '这就是为什么同一个函数、同样的分段数量，也可能得到左端点和、右端点和、中点和这三个不同近似值。后面判断高估还是低估，看的不是求和符号本身，而是采样点在每一段里取到了偏高还是偏低的位置。',
    },
  ],
  '高估 / 低估：先看单调性': [
    {
      id: 'increasing-row',
      label: '递增函数一整行',
      rect: [45, 140, 1510, 260],
      speech:
        '上面一整行看递增函数。每个小区间里，左端点的函数值比较低，所以左端点矩形通常落在曲线下方，是低估；右端点的函数值比较高，所以右端点矩形盖过曲线，是高估。',
    },
    {
      id: 'decreasing-row',
      label: '递减函数一整行',
      rect: [45, 425, 1510, 270],
      speech:
        '下面一整行看递减函数，逻辑正好反过来。左端点现在在每段较高的位置，所以左端点矩形偏高；右端点在较低的位置，所以右端点矩形偏低。',
    },
    {
      id: 'inequality-summary',
      label: '不等式总结区',
      rect: [70, 710, 1460, 115],
      speech:
        '底部的不等式只是把这个视觉判断压缩成符号。递增时，左端点和不超过真实面积，真实面积不超过右端点和；递减时，右端点和不超过真实面积，真实面积不超过左端点和。做题时先看单调性，再选不等式方向。',
    },
  ],
  '让分割变细：mesh 趋近 0': [
    {
      id: 'comparison-panels',
      label: '粗分割与细分割对比',
      rect: [50, 150, 1500, 425],
      speech:
        '这一整块比较粗分割和细分割。左边矩形很宽，顶部和曲线之间留下明显空隙；右边矩形更窄，每一块只负责很小一段，误差看起来就小很多。这个动作叫 refinement，也就是把分割变细。',
    },
    {
      id: 'mesh-definition',
      label: 'mesh 定义区',
      rect: [50, 590, 1400, 130],
      speech:
        '严格说“分割变细”时，我们不只看切了多少段，而是看网格粗细，英文叫 mesh。它定义为所有小段宽度里面最大的那个。它问的是：这组分割里最粗的那一段到底有多粗？',
    },
    {
      id: 'mesh-hook',
      label: '趋稳问题区',
      rect: [220, 735, 1120, 100],
      speech:
        '关键问题来了：当网格粗细趋近零，如果无论怎么合法选采样点，矩形和都趋向同一个数，那么这个数就非常有资格被叫作真正的面积。',
    },
  ],
  '什么时候叫“可黎曼积分”？': [
    {
      id: 'convergence-diagram',
      label: '不同采样和收敛图',
      rect: [45, 140, 1120, 450],
      speech:
        '这一页给出可黎曼积分的核心判断。左端点、右端点、甚至每段随机选点，都会得到不同的黎曼和；但是如果分割足够细，这些不同做法全都被迫靠近同一个数，那面积就稳定了。',
    },
    {
      id: 'limit-box',
      label: '同一个极限 A',
      rect: [1190, 135, 350, 440],
      speech:
        '右边这个大写 A 是重点。它不能是“左端点得到一个数，右端点得到另一个数”；它必须与分割方式无关，也与采样点选择无关。只要网格粗细趋近零，所有合法路径都要走向同一个面积数。',
    },
    {
      id: 'definition-box',
      label: '可黎曼积分定义框',
      rect: [230, 620, 1135, 135],
      speech:
        '这就是定义：如果这个稳定的极限存在，并且不依赖分割和采样，我们就说这个函数在这个区间上可黎曼积分。下一节课，我们会给这个稳定面积数一个更熟悉的名字：定积分。',
    },
  ],
  '本节课总结：黎曼积分的流程': [
    {
      id: 'top-flow',
      label: '流程总览区',
      rect: [45, 105, 1500, 330],
      speech:
        '最后把今天的流程完整收起来。第一步分割区间；第二步在每个小区间里选采样点；第三步用函数在采样点处的值做矩形高度；第四步把每段的高度乘宽度再加起来；第五步让网格粗细趋近零。',
    },
    {
      id: 'integrability-conclusion',
      label: '可积结论区',
      rect: [70, 420, 1060, 265],
      speech:
        '这一块是本节课的结论。黎曼和是有限个矩形给出的近似；黎曼可积说的是，当分割无限变细时，这些近似是否稳定到同一个面积数。稳定，才说明这个面积数定义得好。',
    },
    {
      id: 'next-hook',
      label: '下一节钩子',
      rect: [230, 735, 1120, 95],
      speech:
        '下一节的钩子是：既然这个稳定值就是面积数，我们能不能不用每次画无穷多个矩形，而是直接计算它？这就会带出定积分记号，以及后面最核心的计算规则。',
    },
  ],
};

const imageAwareNarrationStepsByTitle = {
  'MAT 136 · 黎曼积分': [
    {
      id: 'cover-title',
      label: '封面标题区',
      rect: [145, 70, 1210, 190],
      speech:
        '这节是 MAT 一三六的黎曼积分。今天先不急着背定积分符号，我们先回答一个更直观的问题：曲线下面的面积，能不能从一堆矩形里面长出来。',
    },
    {
      id: 'coarse-rectangles',
      label: '粗分割图',
      rect: [35, 360, 445, 310],
      speech:
        '先看左边的粗分割。矩形很少，每个矩形都很宽，所以它只是一个粗略的面积近似。这里的重点不是算得多准，而是先看到“用矩形替代曲线下面积”这个动作。',
    },
    {
      id: 'finer-rectangles',
      label: '较细分割图',
      rect: [500, 360, 445, 310],
      speech:
        '中间这幅图把区间切得更细。矩形数量变多以后，矩形顶边开始更贴近曲线，误差看起来就小了一些。',
    },
    {
      id: 'finest-rectangles',
      label: '更细分割图',
      rect: [980, 360, 430, 310],
      speech:
        '右边继续细分，矩形已经像是在追着曲线走。这个从粗到细的过程，就是今天整节课的视觉主线。',
    },
    {
      id: 'stable-area',
      label: '稳定面积数',
      rect: [1400, 395, 145, 180],
      speech:
        '最右边的大写 A，代表最后稳定下来的面积数。我们后面会问：什么时候不管怎么切、怎么取高度，结果都会靠近同一个面积数。',
    },
    {
      id: 'lesson-flow',
      label: '课程路线条',
      rect: [55, 725, 1485, 125],
      speech:
        '底部这条路线告诉我们顺序：先讲黎曼和，再讲可积性，最后在下一节把这个面积数命名为定积分。下一页先把这条路线拆成四个具体动作。',
    },
  ],
  '黎曼积分：从矩形到极限': [
    {
      id: 'page-bridge',
      label: '本页承接',
      rect: [35, 35, 930, 120],
      speech:
        '承接封面，这一页是整节课的地图。我们不从符号开始，而是从图上的四张卡片开始：面积、分割、采样、极限。',
    },
    {
      id: 'area-as-accumulation',
      label: '面积是累积量',
      rect: [40, 190, 335, 520],
      speech:
        '第一张卡片说，曲线下面积可以看成很多小面积的累积。只要能把每一小块面积近似出来，再把它们加起来，就有了总面积的近似。',
    },
    {
      id: 'partition-card',
      label: '分割区间卡片',
      rect: [420, 190, 360, 520],
      speech:
        '第二张卡片是分割区间。也就是在左端点和右端点之间放一串分割点，把原来的大区间切成很多小区间。',
    },
    {
      id: 'sample-card',
      label: '采样点卡片',
      rect: [820, 190, 350, 520],
      speech:
        '第三张卡片是采样点。每个小区间都要选一个点，用这个点上的函数值来决定那一段矩形的高度。',
    },
    {
      id: 'limit-card',
      label: '网格变细卡片',
      rect: [1200, 190, 360, 520],
      speech:
        '第四张卡片是网格变细。矩形和不是一次就结束，而是要观察：当分割越来越细，这些近似会不会稳定下来。',
    },
    {
      id: 'lesson-question',
      label: '底部问题',
      rect: [195, 735, 1225, 115],
      speech:
        '所以今天只回答底部这句话：矩形和怎样逼近曲线下面积。下一页先解释为什么“面积”本来就适合用累加的方式理解。',
    },
  ],
  '面积为什么是累积量？': [
    {
      id: 'page-bridge',
      label: '承接问题',
      rect: [35, 35, 900, 115],
      speech:
        '上一页说面积可以看成累积量，这一页就专门解释这句话。先从最熟悉的一种面积开始：一个矩形。',
    },
    {
      id: 'constant-panel-graph',
      label: '恒定高度图像',
      rect: [45, 155, 700, 350],
      speech:
        '左边是高度不变的情况。比如速度一直固定，图像就是一条水平线；从左到右这一段的累积量，正好是一块矩形面积。',
    },
    {
      id: 'constant-formula',
      label: '速度乘时间',
      rect: [170, 515, 410, 125],
      speech:
        '中间这行式子想表达的是：距离等于速度乘时间。放到图像里，就是高度乘宽度，所以面积和累积量天然连在一起。',
    },
    {
      id: 'changing-panel-graph',
      label: '变化高度图像',
      rect: [790, 155, 760, 350],
      speech:
        '右边换成高度会变化的情况。整段曲线不再是一块矩形，所以我们先把横轴切小，在每一小段里用一个小矩形临时代替那段曲线下方的面积。',
    },
    {
      id: 'local-approximation',
      label: '局部近似文字',
      rect: [890, 515, 520, 140],
      speech:
        '这里的关键词是局部近似。小段越短，函数在这一小段里的变化越有限，用一个矩形近似就越合理。',
    },
    {
      id: 'core-summary',
      label: '底部核心想法',
      rect: [160, 755, 1260, 115],
      speech:
        '底部这句话就是本页结论：把复杂面积拆成许多简单矩形。下一页我们要正式做第一件事，把区间切开。',
    },
  ],
  '第一步：分割区间 P': [
    {
      id: 'page-bridge',
      label: '承接拆分',
      rect: [45, 35, 900, 120],
      speech:
        '上一页说要把复杂面积拆成小矩形。要拆矩形，第一步不是选高度，而是先决定每个矩形的底边在哪里。',
    },
    {
      id: 'partition-line',
      label: '上方分割线',
      rect: [55, 145, 1470, 330],
      speech:
        '看上方这条横轴：从左端点到右端点，中间插入一串黑点。每两个相邻黑点之间，就是一个小区间，也就是未来一个矩形的底边。',
    },
    {
      id: 'highlighted-subinterval',
      label: '橙色小区间',
      rect: [770, 150, 210, 230],
      speech:
        '橙色标出来的是其中一个小区间。它的宽度就是这一段的右边界减去左边界；等会儿矩形的面积，就会用这个宽度去乘高度。',
    },
    {
      id: 'partition-notation',
      label: '左侧分割表示',
      rect: [55, 500, 760, 240],
      speech:
        '左下角这张卡片把整串点记成一个分割。你可以把它理解成一份切割方案：哪里切一刀，哪里再切一刀，都写在这串点里面。',
    },
    {
      id: 'equal-width-card',
      label: '右侧等分备注',
      rect: [860, 500, 680, 240],
      speech:
        '右下角提醒等分的特殊情况。如果题目说等分，那每段宽度都一样，是整个区间长度除以段数；如果没说等分，每段宽度可以不同。',
    },
    {
      id: 'partition-summary',
      label: '底部直觉',
      rect: [205, 760, 1210, 95],
      speech:
        '本页先留下一个直觉：分割越细，矩形越能贴近曲线。下一页我们在每个小区间里选一个点，用它决定矩形的高度。',
    },
  ],
  '第二步：选择采样点 c_i': [
    {
      id: 'page-bridge',
      label: '承接宽度',
      rect: [45, 35, 900, 120],
      speech: '上一页已经把底边切好了，也就是宽度有了。现在还差矩形的另一个部分：高度。',
    },
    {
      id: 'left-sample-panel',
      label: '左端点面板',
      rect: [50, 180, 480, 455],
      speech:
        '左边是左端点规则。采样点选在这一小段的左边界，所以矩形高度就是曲线在左边界处的高度。',
    },
    {
      id: 'right-sample-panel',
      label: '右端点面板',
      rect: [570, 180, 480, 455],
      speech:
        '中间是右端点规则。采样点选在这一小段的右边界。和左端点相比，底边一样，但高度可能变了。',
    },
    {
      id: 'midpoint-sample-panel',
      label: '中点面板',
      rect: [1080, 180, 470, 455],
      speech: '右边是中点规则。采样点放在小区间正中间，用中间位置的函数值作为矩形高度。',
    },
    {
      id: 'area-rule',
      label: '面积公式框',
      rect: [335, 665, 930, 95],
      speech:
        '中间这条公式其实只是在说一句话：矩形面积等于高度乘宽度。采样点决定高度，分割决定宽度。',
    },
    {
      id: 'next-step-hook',
      label: '底部总结',
      rect: [270, 780, 980, 90],
      speech: '所以第二步的核心是：采样点决定矩形的高度。下一页就把每个小矩形的面积加起来。',
    },
  ],
  '第三步：把矩形面积加起来': [
    {
      id: 'page-bridge',
      label: '承接高度宽度',
      rect: [45, 35, 900, 120],
      speech:
        '上一页我们已经有了宽度，也有了高度。第三步就是把这些局部的小面积，真的变成一个总和。',
    },
    {
      id: 'all-rectangles',
      label: '左侧矩形总图',
      rect: [55, 165, 870, 515],
      speech:
        '左边这张图里，每个小区间都有一个矩形。整块曲线下面积的近似，就是把这些矩形一块一块加起来。',
    },
    {
      id: 'orange-rectangle',
      label: '橙色矩形',
      rect: [470, 260, 185, 385],
      speech:
        '橙色这一块代表任意一个小矩形。它的高度来自采样点上的函数值，宽度来自这个小区间本身。',
    },
    {
      id: 'single-area-card',
      label: '单个矩形公式',
      rect: [1035, 180, 470, 205],
      speech:
        '右上角先写单个矩形的面积。读成口语就是：这一块面积，等于这一段的高度乘以这一段的宽度。',
    },
    {
      id: 'sum-card',
      label: '所有矩形相加',
      rect: [1015, 450, 560, 265],
      speech: '右下角再把所有矩形相加。求和符号不用怕，它只是把第一段、第二段，一直加到最后一段。',
    },
    {
      id: 'riemann-sum-name',
      label: '底部名称',
      rect: [340, 785, 860, 80],
      speech: '这个总和就叫黎曼和。下一页我们用一个具体数字例题，看看左端点规则到底怎么计算。',
    },
  ],
  '例题 1：左黎曼和估计 √x': [
    {
      id: 'problem-strip',
      label: '题目条件区',
      rect: [45, 95, 1510, 110],
      speech:
        '刚才的公式还是抽象的，现在进入第一个计算例题。题目给了三个关键信息：区间从三十二到四十，分成四段，规则是左端点。函数是平方根函数，所以图像是缓慢上升的。',
    },
    {
      id: 'graph-panel',
      label: '图像与四段分割',
      rect: [65, 225, 735, 470],
      speech: '左边图像展示四段等分。总长度是四十减三十二，也就是八；分成四段，所以每段宽度是二。',
    },
    {
      id: 'left-endpoint-dots',
      label: '左端点橙点',
      rect: [165, 355, 475, 150],
      speech:
        '注意图上的橙色点：三十二、三十四、三十六、三十八是四个左端点。四十只是最后边界，不作为左端点高度。',
    },
    {
      id: 'calculation-panel',
      label: '计算步骤区',
      rect: [820, 220, 700, 510],
      speech:
        '右边的步骤按顺序来：先算每段宽度是二，再列出四个左端点，然后把这些点处的函数值全部加起来，最后再乘以宽度二。',
    },
    {
      id: 'numeric-result',
      label: '数值结果',
      rect: [930, 650, 520, 85],
      speech:
        '最后得到的近似值是四十七点三零四。它是面积近似，不是精确面积，因为我们只用了四个矩形。',
    },
    {
      id: 'left-reminder',
      label: '底部提醒',
      rect: [215, 770, 1170, 95],
      speech:
        '底部提醒很重要：左端点就是每段左边的高度。下一页我们换一个情况，没有公式，只有表格，也照样可以做黎曼和。',
    },
  ],
  '例题 2：只有表格，也能算右黎曼和': [
    {
      id: 'problem-strip',
      label: '表格题目区',
      rect: [45, 100, 1510, 105],
      speech:
        '上一页有函数图像和公式，这一页故意少给一点信息：没有函数表达式，只有一张表。题目要求在零到八这个区间上，用右端点估计面积。',
    },
    {
      id: 'table-panel',
      label: '数据表格区',
      rect: [55, 235, 380, 260],
      speech: '先读表格。横坐标的位置是零、二、四、六、八，对应的函数值分别是三、五、四、七、六。',
    },
    {
      id: 'graph-panel',
      label: '右端点矩形区',
      rect: [490, 220, 620, 430],
      speech:
        '中间图像说明右端点规则。四个小区间分别是零到二、二到四、四到六、六到八；每段都取右边的表格值当高度。',
    },
    {
      id: 'right-endpoint-list',
      label: '右端点列表',
      rect: [1040, 260, 420, 145],
      speech: '右上角把两个关键信息单独列出来：每段宽度是二，右端点是二、四、六、八。',
    },
    {
      id: 'calculation-panel',
      label: '右黎曼和计算区',
      rect: [1025, 430, 545, 180],
      speech:
        '把右端点对应的表格值拿出来，就是五、四、七、六。把它们加起来，再乘以宽度二，所以四段右黎曼和等于四十四。',
    },
    {
      id: 'right-reminder',
      label: '底部提醒',
      rect: [200, 750, 1160, 110],
      speech:
        '底部这句话总结本题：右端点就是每段右边的表格值。接下来我们把左端点、右端点和中点三种规则放在一起比较。',
    },
  ],
  三种常见采样规则: [
    {
      id: 'page-bridge',
      label: '承接两道例题',
      rect: [35, 40, 900, 115],
      speech:
        '前两页分别做了左端点和右端点。现在把三种常见采样规则放到同一页，看看它们到底差在哪里。',
    },
    {
      id: 'left-rule-panel',
      label: '左端点和面板',
      rect: [30, 185, 500, 530],
      speech: '左边是左端点和。每个小矩形都用左边界的高度，所以这些采样点都贴在每段的左侧。',
    },
    {
      id: 'right-rule-panel',
      label: '右端点和面板',
      rect: [540, 185, 500, 530],
      speech: '中间是右端点和。分割可以和左边完全一样，但高度改成每段右边界的函数值。',
    },
    {
      id: 'midpoint-rule-panel',
      label: '中点和面板',
      rect: [1060, 185, 500, 530],
      speech: '右边是中点和。每个采样点放在小区间中间，所以高度来自中点位置。',
    },
    {
      id: 'comparison-summary',
      label: '底部比较',
      rect: [220, 760, 1160, 95],
      speech:
        '底部这句话是本页重点：同一个分割，不同采样点，会得到不同近似。下一页我们就问，哪些近似偏高，哪些偏低。',
    },
  ],
  '高估 / 低估：先看单调性': [
    {
      id: 'page-bridge',
      label: '承接三规则',
      rect: [45, 35, 900, 120],
      speech:
        '上一页说明采样点不同，近似值会不同。现在进一步判断：这些近似是在真实面积上面，还是下面。',
    },
    {
      id: 'increasing-left',
      label: '递增左端点低估',
      rect: [60, 160, 720, 295],
      speech:
        '先看左上角：函数递增时，左端点在每段的低处。矩形顶边大多压在曲线下面，所以左端点和是低估。',
    },
    {
      id: 'increasing-right',
      label: '递增右端点高估',
      rect: [815, 160, 720, 295],
      speech:
        '右上角还是递增函数，但采样点换成右端点。右端点在每段的高处，所以矩形盖过曲线，变成高估。',
    },
    {
      id: 'decreasing-left',
      label: '递减左端点高估',
      rect: [60, 475, 720, 260],
      speech: '左下角换成递减函数。现在左端点反而是每段较高的位置，所以左端点矩形会偏高。',
    },
    {
      id: 'decreasing-right',
      label: '递减右端点低估',
      rect: [815, 475, 720, 260],
      speech: '右下角递减加右端点。右端点在每段较低的位置，所以矩形落在曲线下面，是低估。',
    },
    {
      id: 'inequality-summary',
      label: '底部不等式',
      rect: [85, 760, 1430, 105],
      speech:
        '底部把四张图压缩成两条结论：递增时，左端点和不超过真实面积，真实面积不超过右端点和；递减时顺序相反。下一页我们让分割变细，看看这些误差会怎样变化。',
    },
  ],
  '让分割变细：mesh 趋近 0': [
    {
      id: 'page-bridge',
      label: '承接误差',
      rect: [45, 35, 900, 120],
      speech: '上一页的高估和低估都来自矩形跟曲线之间的缝隙。现在我们做一个自然动作：把分割变细。',
    },
    {
      id: 'coarse-partition',
      label: '粗分割面板',
      rect: [40, 165, 705, 430],
      speech: '左边是粗分割。矩形很宽，最大区间宽度也很大，所以曲线和矩形之间的误差比较明显。',
    },
    {
      id: 'refine-arrow',
      label: 'refine 箭头',
      rect: [735, 310, 140, 100],
      speech:
        '中间这个箭头叫 refine，也就是把原来的切法继续细化。直观上，就是让每个矩形只负责更短的一段。',
    },
    {
      id: 'fine-partition',
      label: '细分割面板',
      rect: [870, 165, 690, 430],
      speech: '右边是细分割。矩形变窄以后，矩形顶边更贴近曲线，最大区间宽度也变小了。',
    },
    {
      id: 'mesh-definition',
      label: 'mesh 定义框',
      rect: [65, 630, 1475, 110],
      speech:
        '中间的定义框说明：网格粗细就是所有小区间宽度里面最大的那个。它关注的不是平均宽度，而是最粗的那一段。',
    },
    {
      id: 'mesh-hook',
      label: '底部问题',
      rect: [110, 795, 1390, 90],
      speech:
        '底部问题把下一页打开：如果所有合法采样在分割变细时都趋向同一个数，会发生什么？这就是可黎曼积分的核心。',
    },
  ],
  '什么时候叫“可黎曼积分”？': [
    {
      id: 'page-bridge',
      label: '承接 mesh',
      rect: [45, 35, 900, 120],
      speech: '上一页问：分割越来越细时，所有合法采样会不会走向同一个数？这一页就给出答案。',
    },
    {
      id: 'any-sample-point',
      label: '任意采样点',
      rect: [35, 175, 270, 330],
      speech:
        '左边先强调“任意采样点”。只要采样点落在自己的小区间里，它就是合法的，不一定非得是左端点或右端点。',
    },
    {
      id: 'left-right-random-sums',
      label: '三种和收敛',
      rect: [315, 160, 850, 355],
      speech:
        '中间三张小图分别表示左端点和、右端点和，以及任意采样点得到的和。它们起点不同，但随着网格变细，都被拉向同一个大写 A。',
    },
    {
      id: 'same-limit-box',
      label: '右侧同一个极限',
      rect: [1240, 185, 310, 330],
      speech:
        '右侧这个框强调“同一个极限”。不能左端点收敛到一个数，右端点收敛到另一个数；必须不依赖分割，也不依赖采样。',
    },
    {
      id: 'definition-box',
      label: '可积定义框',
      rect: [240, 640, 1110, 130],
      speech:
        '底部定义框就是结论：如果这个稳定的面积数存在，并且和分割、采样无关，我们就说这个函数可黎曼积分。',
    },
    {
      id: 'next-hook',
      label: '下一节命名',
      rect: [285, 805, 1025, 85],
      speech:
        '最下面这句话打开下一节：这个大写 A，之后会被命名为面积数，也就是定积分要表达的对象。',
    },
  ],
  '本节课总结：黎曼积分的流程': [
    {
      id: 'page-bridge',
      label: '承接定义',
      rect: [45, 35, 1060, 120],
      speech: '上一页给出了可黎曼积分的判断。最后这一页把整条流程收回来，确认每一步分别在做什么。',
    },
    {
      id: 'five-step-flow',
      label: '顶部五步流程',
      rect: [30, 155, 1510, 245],
      speech:
        '上面五张小卡片就是今天的主线：先分割区间，再选采样点，再做矩形，再把矩形面积相加，最后让网格粗细趋近零。',
    },
    {
      id: 'integrability-statement',
      label: '左侧可积结论',
      rect: [30, 500, 735, 145],
      speech:
        '左下角的星号框是本节课的完整结论：如果所有这些和，在网格粗细趋近零时趋向同一个大写 A，就说函数在这个区间上可黎曼积分。',
    },
    {
      id: 'formula-review',
      label: '黎曼和公式回顾',
      rect: [215, 675, 610, 95],
      speech:
        '中间的公式回顾不用逐字读。它的意思还是那句老话：每段高度乘宽度，再把所有小段加起来。',
    },
    {
      id: 'refinement-visual',
      label: '右侧细化图',
      rect: [930, 430, 610, 260],
      speech:
        '右侧这组三幅小图再一次展示从粗分割到更细分割。随着矩形越来越窄，黎曼和越来越接近稳定的面积数。',
    },
    {
      id: 'next-hook',
      label: '底部下节课',
      rect: [190, 805, 1220, 80],
      speech:
        '最后的下节课钩子是：把这个稳定的面积数记成定积分，并学习计算规则。也就是说，今天解决定义从哪里来；下一节解决怎么快速算。',
    },
  ],
};

for (const slide of slides) {
  const override =
    imageAwareNarrationStepsByTitle[slide.title] ?? parentRegionStepsByTitle[slide.title];
  if (!override) {
    throw new Error(`Missing parent-region hit map override for slide: ${slide.title}`);
  }
  slide.steps = override;
}

function assertTtsFriendlySpeech() {
  const unsafePatterns = [
    { name: 'raw math control characters', pattern: /[\\^_{}]/u },
    { name: 'function-call notation', pattern: /\b[A-Za-z]\s*\([^)]*\)/u },
    { name: 'symbolic delta-width notation', pattern: /\b(?:delta|Delta)\s*x\b/u },
  ];
  const problems = [];

  for (const slide of slides) {
    for (const step of slide.steps) {
      for (const { name, pattern } of unsafePatterns) {
        if (pattern.test(step.speech)) {
          problems.push(`${slide.title} / ${step.label}: ${name} -> ${step.speech}`);
        }
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Found speech text that is not TTS-friendly. Put formulas on the slide, and explain them in spoken Chinese:\n${problems.join(
        '\n',
      )}`,
    );
  }
}

assertTtsFriendlySpeech();

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

function imageElement(order) {
  const fileName = `slide-${String(order + 1).padStart(2, '0')}.png`;
  return {
    id: `${NOTEBOOK_ID}-image-${String(order + 1).padStart(2, '0')}`,
    type: 'image',
    left: 0,
    top: 0,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    rotate: 0,
    fixedRatio: false,
    src: `${PUBLIC_DIR}/${fileName}`,
    imageType: 'pageFigure',
    radius: 0,
  };
}

function toCanvasRect([x, y, width, height]) {
  return {
    left: (x / SOURCE_WIDTH) * CANVAS_WIDTH,
    top: (y / SOURCE_HEIGHT) * CANVAS_HEIGHT,
    width: (width / SOURCE_WIDTH) * CANVAS_WIDTH,
    height: (height / SOURCE_HEIGHT) * CANVAS_HEIGHT,
  };
}

function hotspotElement(order, step) {
  const page = String(order + 1).padStart(2, '0');
  const rect = toCanvasRect(step.rect);
  return {
    id: `${NOTEBOOK_ID}-s${page}-${step.id}`,
    name: `semantic-hit-map: ${step.label}`,
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

function semanticHitMapFor(order) {
  return {
    version: 1,
    sourceSize: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT },
    canvasSize: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    regions: slides[order].steps.map((step) => ({
      id: `${NOTEBOOK_ID}-s${String(order + 1).padStart(2, '0')}-${step.id}`,
      semanticId: step.id,
      label: step.label,
      sourceRect: step.rect,
      canvasRect: toCanvasRect(step.rect),
    })),
  };
}

function actionsFor(order) {
  const page = String(order + 1).padStart(2, '0');
  return slides[order].steps.flatMap((step, index) => [
    {
      id: `${NOTEBOOK_ID}-spotlight-s${page}-${String(index + 1).padStart(2, '0')}`,
      type: 'spotlight',
      elementId: `${NOTEBOOK_ID}-s${page}-${step.id}`,
      title: step.label,
      description: `聚焦父区域：${step.label}`,
      dimOpacity: 0.76,
    },
    {
      id: `${NOTEBOOK_ID}-speech-s${page}-${String(index + 1).padStart(2, '0')}`,
      type: 'speech',
      title: `讲解：${step.label}`,
      text: step.speech,
    },
  ]);
}

function canvasFor(order) {
  return {
    id: `${NOTEBOOK_ID}-canvas-${String(order + 1).padStart(2, '0')}`,
    viewportSize: CANVAS_WIDTH,
    viewportRatio: 16 / 9,
    theme: {
      backgroundColor: '#ffffff',
      themeColors: ['#0f766e', '#2563eb', '#f97316', '#0f172a'],
      fontColor: '#0f172a',
      fontName: 'Inter',
      outline: { color: '#0f766e', width: 2, style: 'solid' },
      shadow: { h: 0, v: 0, blur: 10, color: '#000000' },
    },
    elements: [
      imageElement(order),
      ...slides[order].steps.map((step) => hotspotElement(order, step)),
    ],
    background: { type: 'solid', color: '#ffffff' },
    type: 'content',
  };
}

async function renderAssets() {
  if (imageFiles.length !== slides.length) {
    throw new Error(
      `Image/slide count mismatch: ${imageFiles.length} images for ${slides.length} slides`,
    );
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const fileName of fs.readdirSync(OUTPUT_DIR)) {
    if (/^slide-\d+\.png$/.test(fileName) || fileName === 'contact-sheet.png') {
      fs.unlinkSync(path.join(OUTPUT_DIR, fileName));
    }
  }

  for (const [index, fileName] of imageFiles.entries()) {
    const source = path.join(IMAGEGEN_DIR, fileName);
    if (!fs.existsSync(source)) throw new Error(`Missing generated image: ${source}`);
    await sharp(source)
      .resize(SOURCE_WIDTH, SOURCE_HEIGHT, { fit: 'cover', position: 'center' })
      .png()
      .toFile(path.join(OUTPUT_DIR, `slide-${String(index + 1).padStart(2, '0')}.png`));
  }

  const hitMap = {
    notebookId: NOTEBOOK_ID,
    source: 'imagegen-storyboard-first',
    slides: slides.map((slide, index) => ({
      order: index,
      title: slide.title,
      image: `${PUBLIC_DIR}/slide-${String(index + 1).padStart(2, '0')}.png`,
      hitMap: semanticHitMapFor(index),
    })),
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'semantic-hit-map.json'), JSON.stringify(hitMap, null, 2));

  const composites = [];
  for (const [index] of imageFiles.entries()) {
    const file = path.join(OUTPUT_DIR, `slide-${String(index + 1).padStart(2, '0')}.png`);
    const labelSvg = `<svg width="400" height="42" xmlns="http://www.w3.org/2000/svg"><rect width="400" height="42" fill="#0f172a"/><text x="16" y="28" fill="#ffffff" font-size="19" font-family="Arial">${index + 1}. ${slides[index].title}</text></svg>`;
    const thumb = await sharp(file)
      .resize(400, 225)
      .extend({ top: 0, bottom: 42, left: 0, right: 0, background: '#ffffff' })
      .composite([{ input: Buffer.from(labelSvg), top: 225, left: 0 }])
      .png()
      .toBuffer();
    composites.push({
      input: thumb,
      left: (index % 2) * 400,
      top: Math.floor(index / 2) * 267,
    });
  }

  const contactSheetRows = Math.ceil(imageFiles.length / 2);

  await sharp({
    create: {
      width: 800,
      height: contactSheetRows * 267,
      channels: 4,
      background: '#e5e7eb',
    },
  })
    .composite(composites)
    .png()
    .toFile(path.join(OUTPUT_DIR, 'contact-sheet.png'));
}

async function seedNotebook() {
  loadEnvLocal();
  const prisma = new PrismaClient();
  try {
    const course = await prisma.course.findUnique({ where: { id: COURSE_ID } });
    if (!course) throw new Error(`Course not found: ${COURSE_ID}`);

    await prisma.notebook.upsert({
      where: { id: NOTEBOOK_ID },
      update: {
        ownerId: course.ownerId,
        courseId: course.id,
        name: 'Week 1：黎曼积分 · 从矩形到极限',
        description:
          'MAT 136 Week 1 Riemann integration notebook generated as full-slide images with storyboard-first semantic hit maps. Covers partitions, sample points, Riemann sums, monotonic estimates, mesh refinement, and Riemann integrability; computation rules are left as the next lesson hook.',
        tags: ['MAT136', 'Riemann Integral', '黎曼积分', 'Riemann Sum', 'semantic-hit-map'],
        avatarUrl: '/avatars/notebook-agents/avatar8.avif',
        language: 'zh-CN',
        style: 'direct-imagegen-slide-semantic-hit-map',
        updatedAt: NOW,
      },
      create: {
        id: NOTEBOOK_ID,
        ownerId: course.ownerId,
        courseId: course.id,
        name: 'Week 1：黎曼积分 · 从矩形到极限',
        description:
          'MAT 136 Week 1 Riemann integration notebook generated as full-slide images with storyboard-first semantic hit maps. Covers partitions, sample points, Riemann sums, monotonic estimates, mesh refinement, and Riemann integrability; computation rules are left as the next lesson hook.',
        tags: ['MAT136', 'Riemann Integral', '黎曼积分', 'Riemann Sum', 'semantic-hit-map'],
        avatarUrl: '/avatars/notebook-agents/avatar8.avif',
        language: 'zh-CN',
        style: 'direct-imagegen-slide-semantic-hit-map',
        createdAt: NOW,
        updatedAt: NOW,
      },
    });

    await prisma.$transaction([
      prisma.scene.deleteMany({ where: { notebookId: NOTEBOOK_ID } }),
      prisma.scene.createMany({
        data: slides.map((slide, index) => {
          const content = {
            type: 'slide',
            canvas: canvasFor(index),
            webRenderMode: 'slide',
            semanticHitMap: semanticHitMapFor(index),
          };
          return {
            id: `${NOTEBOOK_ID}-p${String(index + 1).padStart(2, '0')}`,
            notebookId: NOTEBOOK_ID,
            title: slide.title,
            type: 'slide',
            order: index,
            content,
            actions: actionsFor(index),
            whiteboard: null,
            createdAt: NOW,
            updatedAt: NOW,
          };
        }),
      }),
      prisma.course.update({
        where: { id: course.id },
        data: { updatedAt: NOW },
      }),
    ]);

    return { course };
  } finally {
    await prisma.$disconnect();
  }
}

await renderAssets();
const { course } = await seedNotebook();

console.log(
  JSON.stringify(
    {
      notebookId: NOTEBOOK_ID,
      courseId: course.id,
      courseName: course.name,
      slides: slides.length,
      outputDir: OUTPUT_DIR,
      url: `http://localhost:3000/classroom/${NOTEBOOK_ID}`,
    },
    null,
    2,
  ),
);
