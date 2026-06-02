#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';

const SCRIPT_NAME = 'create-mat136-sixth-notebook-v2.mjs';
const NOTEBOOK_ID = 'queue-mat136-06-differential-equations';
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
  process.env.GENERATED_IMAGE_ROOT ||
  path.join(process.env.HOME || '/Users/dongpochen', '.codex', 'generated_images');

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
    title: '微分方程：从变化率找函数',
    sceneTitle: '微分方程入口',
    layout:
      '自然课堂笔记布局：上方标题，左侧从变化率出发，中间画未知函数曲线，右侧列本册路线，底部放核心问题。',
    components: [
      {
        label: '本册问题',
        role: 'opening',
        marker: 'red',
        content: '标题“微分方程：从变化率找函数”；写“已知变化率，怎样找原函数？”',
        speech:
          '这一页进入微分方程。普通积分是已知导数去找函数；微分方程也是这个思想，但导数可能同时依赖 x、y 或其他变量。',
      },
      {
        label: '变化率信息',
        role: 'concept',
        marker: 'lime',
        content: '写“dy/dx 告诉曲线在每一点怎么走”。',
        speech:
          '左侧先抓住概念：dy 除以 dx 不是一个孤立公式，它告诉曲线在当前位置的斜率，也就是下一步该往哪里走。',
      },
      {
        label: '未知函数',
        role: 'visual',
        marker: 'blue',
        content: '画一条手绘曲线，旁边写“y(x) 是我们要找的函数”。',
        speech: '中间的曲线代表未知函数 y(x)。微分方程给的是它的变化规则，而不是直接给出曲线本身。',
      },
      {
        label: '学习路线',
        role: 'roadmap',
        marker: 'cyan',
        content: '写“分离变量 → 初值 → 积分形式 → 斜率场 → 欧拉方法”。',
        speech:
          '本册路线从最基础的积分解法开始，再看初值如何确定常数，接着看积分形式的解、斜率场和欧拉方法。',
      },
      {
        label: '引导问题',
        role: 'hook',
        marker: 'yellow',
        content: '底部问题：“一条曲线只靠斜率信息，能不能被确定下来？”',
        speech: '底部问题是本册主线：只知道斜率信息通常还不够，还需要初值告诉我们从哪里出发。',
      },
    ],
  },
  {
    title: '最简单例子：dy/dx=2x',
    sceneTitle: '反导数解微分方程',
    layout: '左侧写方程，中间把 dy 和 dx 分开，右侧两边积分，底部代入初值。',
    components: [
      {
        label: '方程入口',
        role: 'opening',
        marker: 'red',
        content: '写“dy/dx=2x，且 y(3)=5”。',
        speech: '先看最简单的微分方程。右边只依赖 x，所以本质上就是做一次反导数。',
      },
      {
        label: '分离微分',
        role: 'formula',
        marker: 'lime',
        content: '写“dy=2x dx”。',
        speech: '把 dy 和 dx 形式上分开，得到 dy 等于二 x dx。这样就可以对两边积分。',
      },
      {
        label: '两边积分',
        role: 'formula',
        marker: 'blue',
        content: '写“∫dy=∫2x dx”。',
        speech: '两边积分以后，左边给出 y，右边给出 x 平方再加常数。',
      },
      {
        label: '通解',
        role: 'formula',
        marker: 'cyan',
        content: '写“y=x²+C”。',
        speech: '这一步得到通解。C 表示有一整族曲线都满足同一个导数方程。',
      },
      {
        label: '代入初值',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“5=3²+C，所以 C=-4，y=x²-4”。',
        speech: '最后用 y(3)=5 固定 C。得到 C 等于负四，所以具体解是 y 等于 x 平方减四。',
      },
    ],
  },
  {
    title: '初值的作用：选出一条曲线',
    sceneTitle: '初值确定常数',
    layout: '左侧画一族平移曲线，中间标初值点，右侧写通解到特解，底部总结初值。',
    components: [
      {
        label: '一族解',
        role: 'visual',
        marker: 'red',
        content: '画几条形状相同、上下平移的曲线，写“y=x²+C”。',
        speech: '同一个微分方程通常对应一族解。这里不同的 C 让抛物线整体上下移动。',
      },
      {
        label: '初值点',
        role: 'visual',
        marker: 'lime',
        content: '在图上标一点“(3,5)”并让其中一条曲线穿过它。',
        speech: '初值点像是把曲线钉在平面上的一个位置。只有穿过这个点的那条曲线才是目标解。',
      },
      {
        label: '代入过程',
        role: 'formula',
        marker: 'blue',
        content: '写“y(3)=5 ⇒ 5=9+C”。',
        speech: '把 x 等于三、y 等于五代入通解，就可以解出常数 C。',
      },
      {
        label: '特解',
        role: 'formula',
        marker: 'cyan',
        content: '写“C=-4，特解 y=x²-4”。',
        speech: '确定 C 以后，通解变成特解。这个特解同时满足微分方程和初值条件。',
      },
      {
        label: '核心句',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“微分方程给方向；初值给起点”。',
        speech: '底部这句话很重要：微分方程给方向，初值给起点。两者合在一起才确定具体曲线。',
      },
    ],
  },
  {
    title: '变量不同：dV/dP 也能积分',
    sceneTitle: '压力体积例子',
    layout: '左侧写物理变量关系，中间分离变量，右侧积分得到对数，底部判断函数类型。',
    components: [
      {
        label: '变量关系',
        role: 'opening',
        marker: 'red',
        content: '写“dV/dP=-K/P，其中 K>0”。',
        speech:
          '这个例子变量不是 x 和 y，而是体积 V 和压力 P。方法不变：导数告诉我们 V 随 P 怎么变。',
      },
      {
        label: '分离形式',
        role: 'formula',
        marker: 'lime',
        content: '写“dV=-(K/P)dP”。',
        speech: '把 dP 移到右边，得到 dV 等于负 K 除以 P 乘 dP。',
      },
      {
        label: '积分结果',
        role: 'formula',
        marker: 'blue',
        content: '写“∫dV=∫-(K/P)dP”。',
        speech: '两边积分时，右侧出现一除以 P 的积分。它对应自然对数。',
      },
      {
        label: '函数类型',
        role: 'formula',
        marker: 'cyan',
        content: '写“V=-K ln|P|+C”。',
        speech: '所以 V(P) 是对数型函数，而不是多项式或指数函数。',
      },
      {
        label: '识别提醒',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“看到 1/P，想到 ln|P|”。',
        speech: '底部提醒：在微分方程里看到一除以变量，积分后通常会出现 ln 的绝对值。',
      },
    ],
  },
  {
    title: '积分形式的解：用上限写函数',
    sceneTitle: '积分形式解',
    layout: '左侧写导数方程，中央写从初值出发的积分形式，右侧解释常数，底部给通用模板。',
    components: [
      {
        label: '导数方程',
        role: 'opening',
        marker: 'red',
        content: '写“dy/dx=g(x)，且 y(a)=y₀”。',
        speech: '有时题目不要求把积分算出来，只要把解写成积分形式。先从导数等于 g(x) 的形式开始。',
      },
      {
        label: '积分形式',
        role: 'formula',
        marker: 'lime',
        content: '写“y(x)=y₀+∫_a^x g(t)dt”。',
        speech:
          '从 a 走到 x，函数值的变化量就是导数 g(t) 的累积，所以 y(x) 等于初始值加上这段积分。',
      },
      {
        label: '变量 t',
        role: 'concept',
        marker: 'blue',
        content: '写“t 是积分变量，x 是上限”。',
        speech: '这里用 t 做积分变量，是为了把它和上限 x 区分开。上限 x 决定最后函数在哪里取值。',
      },
      {
        label: '初值检查',
        role: 'formula',
        marker: 'cyan',
        content: '写“令 x=a，积分为 0，所以 y(a)=y₀”。',
        speech: '检查初值时，把 x 设成 a，积分上下限相同，所以积分是零，正好回到 y 零。',
      },
      {
        label: '模板记忆',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“当前值=初始值+变化率的累积”。',
        speech: '底部这句话是积分形式的直觉：当前值等于初始值，加上从起点到当前点的变化率累积。',
      },
    ],
  },
  {
    title: '检查积分形式：基本定理加链式法则',
    sceneTitle: '积分形式检查',
    layout: '左侧写候选函数，中间对上限求导，右侧比较目标导数，底部强调上限函数。',
    components: [
      {
        label: '候选函数',
        role: 'opening',
        marker: 'red',
        content: '写“y(x)=C+∫_{a}^{h(x)} q(t)dt”。',
        speech: '选择题里常见的解会写成带变量上限的积分。我们要检查它的导数是否等于题目给的右边。',
      },
      {
        label: '基本定理',
        role: 'formula',
        marker: 'lime',
        content: '写“d/dx ∫_a^x q(t)dt=q(x)”。',
        speech: '如果上限就是 x，基本定理直接告诉我们导数是 q(x)。',
      },
      {
        label: '链式法则',
        role: 'formula',
        marker: 'blue',
        content: '写“d/dx ∫_a^{h(x)} q(t)dt=q(h(x))h′(x)”。',
        speech: '如果上限是 h(x)，还要乘上 h 的导数。这一步就是链式法则。',
      },
      {
        label: '匹配目标',
        role: 'strategy',
        marker: 'cyan',
        content: '写“算出导数，再和 dy/dx 比较”。',
        speech: '判断候选解时，不要凭外形猜。对每个选项求导，再和微分方程右边逐项比较。',
      },
      {
        label: '常见错误',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“别忘了乘上限的导数”。',
        speech: '最常见错误是只把上限代进 integrand，却忘记乘上限函数的导数。',
      },
    ],
  },
  {
    title: '斜率场：每一点都有一个小斜率',
    sceneTitle: '斜率场概念',
    layout: '左侧坐标平面和短线段，中间写 dy/dx=f(x,y)，右侧解释解曲线，底部给读图问题。',
    components: [
      {
        label: '斜率场图像',
        role: 'visual',
        marker: 'red',
        content: '画坐标平面上许多短斜线，写“每点一条小斜线”。',
        speech: '斜率场把微分方程可视化：平面上每一点都画一小段线，表示解曲线经过这里时的方向。',
      },
      {
        label: '方程规则',
        role: 'formula',
        marker: 'lime',
        content: '写“dy/dx=f(x,y)”。',
        speech: '方程右边 f(x,y) 是斜率规则。给定一个点的 x 和 y，就能算出那里应该画什么斜率。',
      },
      {
        label: '解曲线',
        role: 'visual',
        marker: 'blue',
        content: '画一条顺着短斜线穿过的曲线，标“解曲线”。',
        speech: '解曲线必须顺着这些小斜线走。它不是随便画的，而是在每一点都贴合当地的方向。',
      },
      {
        label: '初值作用',
        role: 'concept',
        marker: 'cyan',
        content: '标一个起点“(a,y₀)”并画通过它的曲线。',
        speech: '给了初值以后，解曲线就从那个点出发，沿着斜率场的方向前进。',
      },
      {
        label: '读图问题',
        role: 'hook',
        marker: 'yellow',
        content: '底部写“从斜率场能看出增减、平衡和凹凸吗？”',
        speech: '底部问题提示后面要读的信息：斜率场能帮助我们判断解的增减、平衡位置和大致凹凸。',
      },
    ],
  },
  {
    title: '只依赖 x：斜率按竖条变化',
    sceneTitle: '只看x的斜率场',
    layout: '左侧写 dy/dx=x(x-1)，中间画按 x 变的竖条斜率，右侧标零斜率线，底部总结。',
    components: [
      {
        label: '方程形式',
        role: 'opening',
        marker: 'red',
        content: '写“dy/dx=x(x-1)”。',
        speech: '当右边只依赖 x 时，同一条竖线上的所有点斜率相同，因为 y 值不会影响斜率。',
      },
      {
        label: '竖条模式',
        role: 'visual',
        marker: 'lime',
        content: '画几列短线，列内斜率相同，列间变化。',
        speech: '图上会出现竖条模式：同一列里短线方向一致，不同 x 的列才改变方向。',
      },
      {
        label: '零斜率',
        role: 'formula',
        marker: 'blue',
        content: '写“x=0 或 x=1 时，dy/dx=0”。',
        speech: '令 x(x-1) 等于零，可以找到零斜率的位置：x 等于零或一。',
      },
      {
        label: '符号区间',
        role: 'strategy',
        marker: 'cyan',
        content: '写“x<0 正；0<x<1 负；x>1 正”。',
        speech: '通过符号分析可以判断短线是上升还是下降。小于零时正，零到一之间负，大于一时正。',
      },
      {
        label: '读图结论',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“只看 x 的方程，斜率场像竖向条纹”。',
        speech: '这页的结论：只依赖 x 的微分方程，斜率场通常表现为竖向条纹。',
      },
    ],
  },
  {
    title: '只依赖 y：平衡解会出现',
    sceneTitle: '只看y的斜率场',
    layout: '左侧写 dy/dx=(2-y)(y+1)，中间画水平条纹，右侧标平衡解，底部解释稳定方向。',
    components: [
      {
        label: '方程形式',
        role: 'opening',
        marker: 'red',
        content: '写“dy/dx=(2-y)(y+1)”。',
        speech: '当右边只依赖 y 时，同一条水平线上的所有点斜率相同，因为 x 不影响斜率。',
      },
      {
        label: '水平条纹',
        role: 'visual',
        marker: 'lime',
        content: '画几行短线，同行斜率相同，行间变化。',
        speech: '斜率场会像水平条纹：同一高度的短线方向一致，不同 y 高度才改变。',
      },
      {
        label: '平衡解',
        role: 'formula',
        marker: 'blue',
        content: '写“y=2，y=-1 时 dy/dx=0”。',
        speech: '令右边等于零，得到 y 等于二和 y 等于负一。这两条水平线是平衡解。',
      },
      {
        label: '方向判断',
        role: 'strategy',
        marker: 'cyan',
        content: '在 y=-1 与 y=2 周围画上下箭头。',
        speech: '平衡线两侧的箭头告诉我们解是往上走还是往下走，也能看出平衡是否稳定。',
      },
      {
        label: '核心句',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“只看 y 的方程，先找平衡解”。',
        speech: '只依赖 y 的方程，先找平衡解通常最有用，因为它们决定很多解曲线的长期走向。',
      },
    ],
  },
  {
    title: '同时依赖 x 和 y：找零斜率曲线',
    sceneTitle: '零斜率曲线',
    layout: '左侧写 dy/dx=x²-y²，中间画 y=x 和 y=-x，右侧比较区域符号，底部给匹配斜率场策略。',
    components: [
      {
        label: '方程形式',
        role: 'opening',
        marker: 'red',
        content: '写“dy/dx=x²-y²”。',
        speech: '当右边同时依赖 x 和 y，斜率场会更复杂。第一步可以找零斜率曲线。',
      },
      {
        label: '零斜率曲线',
        role: 'formula',
        marker: 'lime',
        content: '写“x²-y²=0 ⇒ y=x 或 y=-x”。',
        speech: '令 x 平方减 y 平方等于零，可以得到两条斜线：y 等于 x 和 y 等于负 x。',
      },
      {
        label: '图上标线',
        role: 'visual',
        marker: 'blue',
        content: '在坐标平面上画两条对角线，并在上面画水平短线。',
        speech: '在这两条对角线上，斜率为零，所以斜率场里的短线应该是水平的。',
      },
      {
        label: '区域符号',
        role: 'strategy',
        marker: 'cyan',
        content: '写“比较 |x| 与 |y|：若 |x|>|y|，斜率正”。',
        speech: '其他区域可以比较 x 的绝对值和 y 的绝对值。x 更大时斜率为正，y 更大时斜率为负。',
      },
      {
        label: '匹配策略',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“先找零斜率，再看正负区域”。',
        speech: '匹配斜率场时，先找零斜率曲线，再判断正负区域，这比逐点代数值更快。',
      },
    ],
  },
  {
    title: '匹配斜率场：看形状，不靠猜',
    sceneTitle: '斜率场匹配',
    layout: '左侧列三个候选规则，中间画三个小斜率场特征，右侧用特征连线匹配，底部总结流程。',
    components: [
      {
        label: '候选规则',
        role: 'opening',
        marker: 'red',
        content: '写“A: 只看x；B: 只看y；C: 同时看x,y”。',
        speech: '选择题里经常要把方程和斜率场配对。先不要猜答案，先看每个方程依赖什么。',
      },
      {
        label: '竖向条纹',
        role: 'visual',
        marker: 'lime',
        content: '画“只看 x”的竖向条纹小图。',
        speech: '如果斜率只看 x，同一竖列的短线方向应该一致。这是竖向条纹特征。',
      },
      {
        label: '水平条纹',
        role: 'visual',
        marker: 'blue',
        content: '画“只看 y”的水平条纹小图。',
        speech: '如果斜率只看 y，同一水平行的短线方向应该一致。这是水平条纹特征。',
      },
      {
        label: '对角特征',
        role: 'visual',
        marker: 'cyan',
        content: '画“x²-y²”的对角零斜率线。',
        speech: '如果方程同时看 x 和 y，常常出现对角线、圆形或其他曲线特征，要从零斜率曲线入手。',
      },
      {
        label: '匹配流程',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“依赖谁 → 找零斜率 → 看正负 → 再匹配”。',
        speech:
          '底部流程就是匹配斜率场的顺序：先看依赖谁，再找零斜率，再判断正负区域，最后才选图。',
      },
    ],
  },
  {
    title: '解曲线：沿着斜率场前进',
    sceneTitle: '解曲线读图',
    layout: '左侧斜率场，中间标初值点，右侧画近似解曲线，底部说明不能穿越方向。',
    components: [
      {
        label: '方向背景',
        role: 'visual',
        marker: 'red',
        content: '画一片短斜线组成的斜率场。',
        speech: '斜率场提供方向背景。每个短线只是局部提示，但合起来能看出解曲线的大致走势。',
      },
      {
        label: '初值点',
        role: 'visual',
        marker: 'lime',
        content: '标出一个实心点“(a,y₀)”。',
        speech: '初值点决定从哪里开始走。不同初值通常会走出不同的解曲线。',
      },
      {
        label: '顺斜率画线',
        role: 'visual',
        marker: 'blue',
        content: '画一条顺着短线方向弯曲的解曲线。',
        speech: '画解曲线时，每经过一个区域，都要让曲线切线方向贴近当地短线。',
      },
      {
        label: '增减判断',
        role: 'concept',
        marker: 'cyan',
        content: '写“短线向上 ⇒ y 增；短线向下 ⇒ y 减”。',
        speech: '短线向上代表导数为正，函数值增加；短线向下代表导数为负，函数值减少。',
      },
      {
        label: '读图提醒',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“解曲线不是穿点连线，而是贴着方向走”。',
        speech: '底部提醒：解曲线不是简单连点，而是一路贴着斜率场给出的方向前进。',
      },
    ],
  },
  {
    title: '欧拉方法：用切线走小步',
    sceneTitle: '欧拉方法入口',
    layout: '左侧公式，中间画从一点沿切线走一步，右侧表格记录步骤，底部强调步长。',
    components: [
      {
        label: '方法公式',
        role: 'formula',
        marker: 'red',
        content: '写“y_{n+1}=y_n+f(x_n,y_n)Δx”。',
        speech: '欧拉方法用当前位置的斜率预测下一点。公式就是当前 y，加上斜率乘步长。',
      },
      {
        label: '一步示意',
        role: 'visual',
        marker: 'lime',
        content: '画从 (x_n,y_n) 沿切线走到下一点。',
        speech: '图上这一小步就是用切线近似真实曲线。步长越小，局部近似通常越好。',
      },
      {
        label: '斜率来源',
        role: 'formula',
        marker: 'blue',
        content: '写“斜率=f(x_n,y_n)”。',
        speech: '斜率不是随便取的，而是把当前点代入微分方程右边 f(x,y)。',
      },
      {
        label: '表格记录',
        role: 'strategy',
        marker: 'cyan',
        content: '画小表格“n，x_n，y_n，斜率，下一步”。',
        speech: '实际计算时用表格最稳：每一行记录当前点、当前斜率和下一步的 y 值。',
      },
      {
        label: '步长提醒',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“Δx 越小，通常越贴近真实曲线”。',
        speech: '底部提醒：欧拉方法是近似方法，步长越小，通常越贴近真实解，但计算步数也会更多。',
      },
    ],
  },
  {
    title: '欧拉误差：看凹凸判断高低',
    sceneTitle: '欧拉误差判断',
    layout: '左侧画凹向上曲线和切线，右侧画凹向下曲线和切线，中间写高估低估，底部给判断句。',
    components: [
      {
        label: '凹向上',
        role: 'visual',
        marker: 'red',
        content: '画凹向上曲线，切线在曲线下方，写“低估”。',
        speech: '如果真实解凹向上，切线通常落在曲线下方，所以用切线走出来的欧拉近似会偏低。',
      },
      {
        label: '凹向下',
        role: 'visual',
        marker: 'lime',
        content: '画凹向下曲线，切线在曲线上方，写“高估”。',
        speech: '如果真实解凹向下，切线通常落在曲线上方，所以欧拉近似会偏高。',
      },
      {
        label: '判断依据',
        role: 'concept',
        marker: 'blue',
        content: '写“看解曲线的凹凸，不只看斜率正负”。',
        speech: '高估低估主要看凹凸，而不是只看函数在增加还是减少。增减和误差方向不是同一件事。',
      },
      {
        label: '题目语言',
        role: 'strategy',
        marker: 'cyan',
        content: '写“若斜率场显示凹向上 ⇒ 近似常偏低”。',
        speech: '选择题常让你看斜率场判断。若解曲线看起来凹向上，欧拉方法通常给低估。',
      },
      {
        label: '核心句',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“切线在下低估；切线在上高估”。',
        speech: '底部一句话总结：切线在真实曲线下方就是低估，切线在上方就是高估。',
      },
    ],
  },
  {
    title: '鱼群模型：平衡点和方向',
    sceneTitle: '鱼群模型',
    layout: '左侧写人口模型，中间在数轴上标平衡点，右侧箭头判断趋势，底部连接欧拉误差。',
    components: [
      {
        label: '模型入口',
        role: 'opening',
        marker: 'red',
        content: '写“dN/dt=N(N/6-1)(1-N/20)，N(0)=7”。',
        speech: '这页来自鱼群数量模型。右边是 N 的函数，所以我们先看平衡点和方向。',
      },
      {
        label: '平衡点',
        role: 'formula',
        marker: 'lime',
        content: '写“N=0，N=6，N=20 时 dN/dt=0”。',
        speech: '令右边等于零，得到三个平衡点：零、六、二十。它们把数轴分成几个区间。',
      },
      {
        label: '初始位置',
        role: 'visual',
        marker: 'blue',
        content: '在数轴上标“N=7”，位于 6 与 20 之间。',
        speech:
          '初始数量七在六和二十之间。只需要判断这个区间里 dN/dt 的符号，就知道数量先往哪里走。',
      },
      {
        label: '趋势箭头',
        role: 'strategy',
        marker: 'cyan',
        content: '画方向箭头，标“向 20 靠近”。',
        speech: '在六到二十之间，增长率为正，所以解会往上走，逐渐靠近二十这个平衡点。',
      },
      {
        label: '误差连接',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“若曲线凹向上，欧拉近似偏低”。',
        speech: '如果斜率场显示这段解曲线凹向上，那么欧拉方法用切线走小步时会偏低。',
      },
    ],
  },
  {
    title: '积分定义解：选择题怎么验算',
    sceneTitle: '积分定义解选择',
    layout: '上方写目标导数，左侧候选形式，中央求导检查，右侧排除常见错误，底部给选择流程。',
    components: [
      {
        label: '目标导数',
        role: 'opening',
        marker: 'red',
        content: '写“目标：dy/dx=-3x²e^{-x³}”。',
        speech: '选择题的目标很明确：找一个函数，它的导数正好是负三 x 平方乘 e 的负 x 三次方。',
      },
      {
        label: '候选形式',
        role: 'formula',
        marker: 'lime',
        content: '写“y=C+∫_a^{h(x)} e^{-t}dt”。',
        speech: '很多选项会长成常数加积分。关键在于上限 h(x) 和 integrand 是否匹配目标导数。',
      },
      {
        label: '求导检查',
        role: 'formula',
        marker: 'blue',
        content: '写“y′=e^{-h(x)}h′(x)”。',
        speech: '对候选形式求导，得到 e 的负 h(x) 次方，再乘 h 的导数。',
      },
      {
        label: '匹配上限',
        role: 'strategy',
        marker: 'cyan',
        content: '写“若 h(x)=x³，则 h′(x)=3x²；若 h(x)=-x³，则 h′(x)=-3x²”。',
        speech:
          '目标里有负三 x 平方，所以常常要检查上限是不是负 x 三次方，或者 integrand 是否已经带了负号。',
      },
      {
        label: '选择流程',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“先求导，再比较；不要只看积分长得像”。',
        speech: '底部流程是选择题核心：先求导，再和目标比较。不能只因为式子看起来相似就选。',
      },
    ],
  },
  {
    title: '常见错误：变量、常数、方向',
    sceneTitle: '常见错误检查',
    layout: '三块错误分散排列：变量错误、初值错误、斜率场错误；右下欧拉错误；底部清单。',
    components: [
      {
        label: '变量错误',
        role: 'mistake',
        marker: 'red',
        content: '写“积分变量 t 和上限 x 不要混用”。',
        speech: '第一个错误是变量混乱。积分变量通常用 t，上限用 x，二者不要在同一个位置乱替换。',
      },
      {
        label: '常数错误',
        role: 'mistake',
        marker: 'lime',
        content: '写“通解有 C；有初值就要解 C”。',
        speech: '第二个错误是忘记常数。没有初值时保留 C，有初值时必须代入并解出 C。',
      },
      {
        label: '斜率场错误',
        role: 'mistake',
        marker: 'blue',
        content: '写“只看 x 是竖条；只看 y 是水平条”。',
        speech: '第三个错误是斜率场匹配靠猜。先看右边依赖 x、y 还是两者都依赖。',
      },
      {
        label: '欧拉错误',
        role: 'mistake',
        marker: 'cyan',
        content: '写“欧拉高低估看凹凸，不只看增减”。',
        speech: '第四个错误是把增减和高低估混在一起。欧拉误差方向主要看解曲线相对切线的凹凸。',
      },
      {
        label: '最终清单',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“分离变量；代初值；求导检查；读斜率场；看凹凸”。',
        speech:
          '最后清单帮助做题：分离变量，代初值，求导检查积分形式，读斜率场，再用凹凸判断欧拉误差。',
      },
    ],
  },
  {
    title: '总结：微分方程怎么读',
    sceneTitle: '总结',
    layout: '中心写“变化率规则”，四周连到解法、初值、斜率场、数值近似，底部收束。',
    components: [
      {
        label: '核心思想',
        role: 'summary',
        marker: 'red',
        content: '中心写“微分方程=变化率规则”。',
        speech: '最后一页总结本册。微分方程的核心不是复杂符号，而是一条变化率规则。',
      },
      {
        label: '解析解',
        role: 'formula',
        marker: 'lime',
        content: '写“能积分时：分离变量 → 两边积分 → 代初值”。',
        speech: '如果方程能直接积分，就按解析路线：分离变量，两边积分，再用初值确定常数。',
      },
      {
        label: '积分形式',
        role: 'formula',
        marker: 'blue',
        content: '写“y(x)=y₀+∫_a^x 变化率 dt”。',
        speech: '如果不想或不能算出初等表达式，也可以用积分形式表示解。',
      },
      {
        label: '斜率场与近似',
        role: 'strategy',
        marker: 'cyan',
        content: '写“斜率场看方向；欧拉方法走小步”。',
        speech: '没有显式公式时，斜率场让我们读方向，欧拉方法让我们用小步近似解。',
      },
      {
        label: '最后一句',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“先理解方向，再选择积分、图像或近似工具”。',
        speech: '最后一句是解题顺序：先理解变化方向，再决定用积分、图像，还是数值近似工具。',
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

Generate page ${pageNumber} of a Chinese calculus differential-equations notebook as a marker source image. The image itself must contain the colored corner markers; later software will recover the regions and remove the markers.

Hard visible-text rules:
- All visible prose, headings, labels, and question text must be Simplified Chinese.
- Do not write any course code, course name, teacher name, date, page number, or week label.
- Do not write MAT136, Calculus II, Week, 第1周, 页码, Page, or any English prose.
- Do not write component numbers or circled numbers before headings.
- Standard math notation is allowed: x, y, t, P, V, N, K, C, dy/dx, dV/dP, dN/dt, f(x,y), g(x), h(x), Δx, y_n, x_n, ln, e^x, ∫.

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
    title: '微分方程：从变化率到斜率场',
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

function listGeneratedPngs(dir, depth = 0) {
  if (!fs.existsSync(dir) || depth > 4) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listGeneratedPngs(fullPath, depth + 1));
    if (entry.isFile() && entry.name.endsWith('.png')) files.push(fullPath);
  }
  return files;
}

function latestGeneratedImage() {
  const files = listGeneratedPngs(GENERATED_IMAGE_ROOT).sort(
    (a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs,
  );
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
  if (role === 'strategy' || role === 'roadmap' || role === 'step') return `${component.label}动作`;
  if (role === 'example' || role === 'examples' || role === 'derivation')
    return `${component.label}计算`;
  if (role === 'takeaway' || role === 'hook' || role === 'mistake') return `${component.label}检查`;
  return `${component.label}连接`;
}

function detailSpeechForComponent(_page, component, index) {
  const content = speechContent(component.content);
  const role = component.role || '';

  if (index === 0) {
    return `这页把微分方程读成一句话：已知变化率，反过来找函数。先分清未知函数、变量和初值。`;
  }

  if (role === 'visual') {
    return `${content}。读斜率场时，每个小线段表示该点的 dy/dx；解曲线要顺着这些小斜率走。`;
  }

  if (role === 'formula') {
    return `${content}。读公式时先确认谁是自变量、谁是未知函数，再决定是直接积分还是检查上限函数。`;
  }

  if (role === 'strategy' || role === 'roadmap' || role === 'step') {
    return `${content}。微分方程题通常按这个顺序走：分离变量或积分，代初值，最后回到原变量解释。`;
  }

  if (role === 'takeaway' || role === 'hook' || role === 'mistake') {
    return `${content}。检查答案时看三件事：导数是否回到原方程，初值是否满足，变量有没有混用。`;
  }

  return `${content}。这里先把变化率信息翻译成函数信息，必要时再用斜率场或欧拉方法读近似行为。`;
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
          name: '微分方程：从变化率到斜率场',
          description: '第六本中文手绘图片笔记本：微分方程、初值、积分形式解、斜率场与欧拉方法。',
          tags: ['MAT136', '微分方程', '斜率场', '欧拉方法', '中文笔记', '四角marker'],
          avatarUrl: '/avatars/notebook-agents/avatar8.avif',
          language: 'zh-CN',
          style: 'imagegen-marker-recovered-v2',
          updatedAt: now,
        },
        create: {
          id: NOTEBOOK_ID,
          ownerId: course.ownerId,
          courseId: course.id,
          name: '微分方程：从变化率到斜率场',
          description: '第六本中文手绘图片笔记本：微分方程、初值、积分形式解、斜率场与欧拉方法。',
          tags: ['MAT136', '微分方程', '斜率场', '欧拉方法', '中文笔记', '四角marker'],
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
