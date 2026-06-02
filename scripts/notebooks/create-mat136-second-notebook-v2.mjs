#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';

const SCRIPT_NAME = 'create-mat136-second-notebook-v2.mjs';
const NOTEBOOK_ID = 'queue-mat136-02-substitution';
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
    title: '换元法：把复杂部分叫作 u',
    sceneTitle: '换元法入口',
    layout:
      '自然课堂笔记布局：上方是标题和核心问题，左侧画复合函数结构，中右解释 du，底部给出本节路线。',
    components: [
      {
        label: '本节问题',
        role: 'opening',
        marker: 'red',
        content: '标题“换元法：把复杂部分叫作 u”；写“复杂积分能不能变简单？”',
      },
      {
        label: '复合函数结构',
        role: 'visual',
        marker: 'lime',
        content: '画外层 f(□) 包住内层 g(x)，写“f(g(x))”。',
      },
      {
        label: '内层导数线索',
        role: 'formula',
        marker: 'blue',
        content: '写“u=g(x)”和“du=g′(x)dx”；旁边画箭头指向原积分中的因子。',
      },
      {
        label: '变量世界切换',
        role: 'strategy',
        marker: 'cyan',
        content: '写“x 世界 → u 世界”；提醒“换完后不要剩 x”。',
      },
      {
        label: '学习路线',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部路线：“选 u → 算 du → 全部改写 → 积分 → 换回”。',
      },
    ],
  },
  {
    title: '核心公式：反向链式法则',
    sceneTitle: '反向链式法则',
    layout: '左侧从链式法则出发，右侧写换元积分公式；底部用一条短流程把 dx 变成 du。',
    components: [
      {
        label: '公式入口',
        role: 'opening',
        marker: 'red',
        content: '标题“反向链式法则”；写“换元法来自链式法则倒过来”。',
      },
      {
        label: '链式法则',
        role: 'formula',
        marker: 'lime',
        content: '写“若 H(x)=F(g(x))，则 H′(x)=f(g(x))g′(x)”。',
      },
      {
        label: '换元公式',
        role: 'formula',
        marker: 'blue',
        content: '写“∫ f(g(x))g′(x)dx = ∫ f(u)du = F(u)+C”。',
      },
      {
        label: 'du 的含义',
        role: 'formula',
        marker: 'cyan',
        content: '写“du=g′(x)dx”；强调“导数因子和 dx 一起换”。',
      },
      {
        label: '判断句',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“看见内层 + 内层导数，就想到换元”。',
      },
    ],
  },
  {
    title: '怎样选择 u',
    sceneTitle: '选择 u 的信号',
    layout:
      '不是表格，像三块散开的课堂笔记：复杂括号、根号/指数/三角、导数匹配；底部放一个失败检查。',
    components: [
      {
        label: '选择目标',
        role: 'opening',
        marker: 'red',
        content: '标题“怎样选择 u”；写“让积分整体变简单”。',
      },
      {
        label: '复杂内层',
        role: 'strategy',
        marker: 'lime',
        content: '写“括号、根号、指数、三角里面的表达式，常常是 u”。',
      },
      {
        label: '导数匹配',
        role: 'formula',
        marker: 'blue',
        content: '写“选 u 后检查 du 是否在旁边”；举“u=3x^2+4, du=6x dx”。',
      },
      {
        label: '差常数可以补',
        role: 'formula',
        marker: 'cyan',
        content: '写“若 du=2z dz，而原式只有 z dz，则 z dz=du/2”。',
      },
      {
        label: '失败检查',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“换完还剩 x？说明还没换干净”。',
      },
    ],
  },
  {
    title: '括号整体换元',
    sceneTitle: '括号整体换元',
    layout: '中间放完整计算链，左侧圈出内层，右侧写换回答案；底部强调幂函数积分。',
    components: [
      {
        label: '题目识别',
        role: 'opening',
        marker: 'red',
        content: '写“计算 ∫ 6x(3x^2+4)^4 dx”；圈出“3x^2+4”。',
      },
      {
        label: '选择 u',
        role: 'formula',
        marker: 'lime',
        content: '写“令 u=3x^2+4”；“du=6x dx”。',
      },
      {
        label: '完全改写',
        role: 'formula',
        marker: 'blue',
        content: '写“∫ 6x(3x^2+4)^4 dx = ∫ u^4 du”。',
      },
      {
        label: '积分并换回',
        role: 'formula',
        marker: 'cyan',
        content: '写“∫u^4du=u^5/5+C=(3x^2+4)^5/5+C”。',
      },
      {
        label: '方法记忆',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“复杂括号 + 外面导数 = 直接换元”。',
      },
    ],
  },
  {
    title: '差一个常数也能换',
    sceneTitle: '差常数处理',
    layout: '左侧题目和 u，右侧处理常数因子，底部用醒目但非纯色的提醒。',
    components: [
      {
        label: '题目结构',
        role: 'opening',
        marker: 'red',
        content: '写“计算 ∫ z√(z^2-5) dz”；圈出根号内“z^2-5”。',
      },
      {
        label: '设定 u',
        role: 'formula',
        marker: 'lime',
        content: '写“u=z^2-5”；“du=2z dz”。',
      },
      {
        label: '补出常数',
        role: 'formula',
        marker: 'blue',
        content: '写“z dz = du/2”；“∫ z√(z^2-5)dz = 1/2∫u^{1/2}du”。',
      },
      {
        label: '计算答案',
        role: 'formula',
        marker: 'cyan',
        content: '写“1/2·(2/3)u^{3/2}=1/3(z^2-5)^{3/2}+C”。',
      },
      {
        label: '常数提醒',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“差常数可以补；差变量不可以硬补”。',
      },
    ],
  },
  {
    title: '负号来自 du',
    sceneTitle: '三角换元中的负号',
    layout: '左侧写三角题，右上写 u=cos t，右中追踪负号，底部放符号检查。',
    components: [
      {
        label: '三角题入口',
        role: 'opening',
        marker: 'red',
        content: '写“计算 ∫ sin t / cos^3 t dt”；圈出“cos t”。',
      },
      {
        label: '选择 u',
        role: 'formula',
        marker: 'lime',
        content: '写“令 u=cos t”；“du=-sin t dt”。',
      },
      {
        label: '替换分子',
        role: 'formula',
        marker: 'blue',
        content: '写“sin t dt = -du”；“cos^3 t = u^3”。',
      },
      {
        label: '积分链条',
        role: 'formula',
        marker: 'cyan',
        content: '写“∫ sin t/cos^3t dt = -∫u^{-3}du = 1/(2u^2)+C”。',
      },
      {
        label: '符号检查',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“du 里有负号，答案里必须承接”。',
      },
    ],
  },
  {
    title: '换完还剩变量怎么办',
    sceneTitle: '剩余变量处理',
    layout: '上方写题目，左侧显示错误停在半路，右侧显示 x=u+1 的完整改写，底部一句规则。',
    components: [
      {
        label: '题目入口',
        role: 'opening',
        marker: 'red',
        content: '写“计算 ∫ x/√(x-1) dx”；圈出“x-1”。',
      },
      {
        label: '初步换元',
        role: 'formula',
        marker: 'lime',
        content: '写“u=x-1”；“du=dx”；“√(x-1)=√u”。',
      },
      {
        label: '剩下的 x',
        role: 'mistake',
        marker: 'blue',
        content: '写“还剩 x/√u”；旁边写“不能停在这里”。',
      },
      {
        label: '把 x 也改写',
        role: 'formula',
        marker: 'cyan',
        content: '写“x=u+1”；“∫(u+1)/√u du = ∫(u^{1/2}+u^{-1/2})du”。',
      },
      {
        label: '核心规则',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“换元后不能同时出现 x 和 u”。',
      },
    ],
  },
  {
    title: '定积分换元：上下限也要换',
    sceneTitle: '上下限一起换',
    layout: '左边错误做法，右边正确做法，中间用变量世界箭头连接；底部规则用一句话收束。',
    components: [
      {
        label: '定积分入口',
        role: 'opening',
        marker: 'red',
        content: '写“计算 ∫_0^6 2x dx”；旁边写“令 u=2x”。',
      },
      {
        label: '错误混用',
        role: 'mistake',
        marker: 'lime',
        content: '写“1/2∫_0^6 u du = 9”；旁边标“上下限没换”。',
      },
      {
        label: '换上下限',
        role: 'formula',
        marker: 'blue',
        content: '写“x=0→u=0”；“x=6→u=12”。',
      },
      {
        label: '正确计算',
        role: 'formula',
        marker: 'cyan',
        content: '写“1/2∫_0^{12}u du = 36”；和原式“∫_0^6 2x dx=36”对齐。',
      },
      {
        label: '定积分规则',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“换变量，就换边界；换回 x，则保留原边界”。',
      },
    ],
  },
  {
    title: '指数定积分换元',
    sceneTitle: '指数定积分',
    layout: '上方写题目，左下写 u 和上下限，右侧写积分结果，底部检查答案量级。',
    components: [
      {
        label: '题目结构',
        role: 'opening',
        marker: 'red',
        content: '写“计算 ∫_0^2 e^{x^2}·2x dx”；圈出“x^2”。',
      },
      {
        label: '设定 u 和 du',
        role: 'formula',
        marker: 'lime',
        content: '写“u=x^2”；“du=2x dx”。',
      },
      {
        label: '更换上下限',
        role: 'formula',
        marker: 'blue',
        content: '写“x=0→u=0”；“x=2→u=4”。',
      },
      {
        label: '完成计算',
        role: 'formula',
        marker: 'cyan',
        content: '写“∫_0^4 e^u du = e^4-1”。',
      },
      {
        label: '检查点',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“定积分换元后，答案中不需要再换回 x”。',
      },
    ],
  },
  {
    title: '指数里有系数的换元',
    sceneTitle: '系数与上下限',
    layout: '左侧题目，中央处理 du 的系数，右侧换上下限和结果，底部提醒常数因子。',
    components: [
      {
        label: '题目入口',
        role: 'opening',
        marker: 'red',
        content: '写“计算 ∫_0^1 x e^{4x^2+3} dx”；圈出“4x^2+3”。',
      },
      {
        label: 'du 与常数',
        role: 'formula',
        marker: 'lime',
        content: '写“u=4x^2+3”；“du=8x dx”；“x dx=du/8”。',
      },
      {
        label: '上下限变换',
        role: 'formula',
        marker: 'blue',
        content: '写“x=0→u=3”；“x=1→u=7”。',
      },
      {
        label: '积分结果',
        role: 'formula',
        marker: 'cyan',
        content: '写“∫_0^1 x e^{4x^2+3}dx = 1/8∫_3^7 e^u du = (e^7-e^3)/8”。',
      },
      {
        label: '常数因子提醒',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“du 的系数越早处理，后面越不乱”。',
      },
    ],
  },
  {
    title: '三角平方：先变形再换元',
    sceneTitle: '三角平方积分',
    layout: '左侧写 cos^2 恒等式，右侧处理 cos(2θ) 的换元，底部给最终值。',
    components: [
      {
        label: '题目入口',
        role: 'opening',
        marker: 'red',
        content: '写“计算 ∫_0^{π/2} cos^2θ dθ”；旁边写“先降幂”。',
      },
      {
        label: '降幂公式',
        role: 'formula',
        marker: 'lime',
        content: '写“cos^2θ=(1+cos2θ)/2”。',
      },
      {
        label: '常数部分',
        role: 'formula',
        marker: 'blue',
        content: '写“1/2∫_0^{π/2}1 dθ = π/4”。',
      },
      {
        label: '震荡部分',
        role: 'formula',
        marker: 'cyan',
        content: '写“1/2∫_0^{π/2}cos2θ dθ”；令“u=2θ”，结果为 0。',
      },
      {
        label: '最终结果',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“∫_0^{π/2}cos^2θ dθ = π/4”。',
      },
    ],
  },
  {
    title: '函数缩放中的换元',
    sceneTitle: '函数缩放换元',
    layout: '左侧画 f(x) 的面积，右侧画 f(2x) 被压缩，中间写 u=2x；底部给结论。',
    components: [
      {
        label: '已知面积',
        role: 'opening',
        marker: 'red',
        content: '写“若 ∫_0^6 f(x)dx=8，求 ∫_0^3 f(2x)dx”。',
      },
      {
        label: '图像压缩直觉',
        role: 'visual',
        marker: 'lime',
        content: '画 f(x) 与 f(2x) 的横向压缩示意，写“横向压缩一半”。',
      },
      {
        label: '换元关系',
        role: 'formula',
        marker: 'blue',
        content: '写“u=2x”；“du=2dx”；“dx=du/2”。',
      },
      {
        label: '上下限对应',
        role: 'formula',
        marker: 'cyan',
        content: '写“x=0→u=0”；“x=3→u=6”；“∫_0^3 f(2x)dx=1/2∫_0^6 f(u)du”。',
      },
      {
        label: '结论',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“答案 = 1/2·8 = 4”。',
      },
    ],
  },
  {
    title: 'sin 与 cos 的对称积分',
    sceneTitle: '对称换元',
    layout: '上方写等式目标，中间画四分之一圆或区间反射，右侧写 u=π/2-x，底部收束。',
    components: [
      {
        label: '目标等式',
        role: 'opening',
        marker: 'red',
        content: '写“证明 ∫_0^{π/2} f(cos x)dx = ∫_0^{π/2} f(sin x)dx”。',
      },
      {
        label: '区间反射',
        role: 'visual',
        marker: 'lime',
        content: '画区间 [0,π/2] 反射示意，写“x ↔ π/2-x”。',
      },
      {
        label: '代换选择',
        role: 'formula',
        marker: 'blue',
        content: '写“u=π/2-x”；“dx=-du”。',
      },
      {
        label: '函数转换',
        role: 'formula',
        marker: 'cyan',
        content: '写“cos x = sin(π/2-x)=sin u”；并把上下限反转回来。',
      },
      {
        label: '对称结论',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“同一段区间上，cos 的扫描和 sin 的扫描等价”。',
      },
    ],
  },
  {
    title: '幂次混合：剩余变量也能改写',
    sceneTitle: '混合幂次练习',
    layout: '左侧题目，中间把 x^3 拆成 x^2·x，右侧用 u-1 改写，底部做方法归纳。',
    components: [
      {
        label: '题目入口',
        role: 'opening',
        marker: 'red',
        content: '写“计算 ∫ x^3√(x^2+1) dx”；圈出“x^2+1”。',
      },
      {
        label: '拆开因子',
        role: 'strategy',
        marker: 'lime',
        content: '写“x^3 dx = x^2·x dx”；准备让“x dx”进入 du。',
      },
      {
        label: '设定 u',
        role: 'formula',
        marker: 'blue',
        content: '写“u=x^2+1”；“du=2x dx”；“x dx=du/2”。',
      },
      {
        label: '改写剩余 x^2',
        role: 'formula',
        marker: 'cyan',
        content: '写“x^2=u-1”；“1/2∫(u-1)u^{1/2}du”。',
      },
      {
        label: '方法归纳',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“拆因子 → 配 du → 剩余变量用 u 改写”。',
      },
    ],
  },
  {
    title: '做题流程：先判断再计算',
    sceneTitle: '换元流程',
    layout: '中心放流程图，四周放典型判断：内层、导数、上下限、换回；底部放错误排查。',
    components: [
      {
        label: '流程入口',
        role: 'opening',
        marker: 'red',
        content: '标题“换元流程”；中心写“不是每题都先算，先判断结构”。',
      },
      {
        label: '第一步识别内层',
        role: 'strategy',
        marker: 'lime',
        content: '写“找复杂内层：括号、根号、指数、三角里面”。',
      },
      {
        label: '第二步检查 du',
        role: 'formula',
        marker: 'blue',
        content: '写“算 du；检查是否只差常数”。',
      },
      {
        label: '第三步处理边界',
        role: 'formula',
        marker: 'cyan',
        content: '写“不定积分：最后换回；定积分：上下限一起换”。',
      },
      {
        label: '错误排查',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部 checklist：“还剩 x？漏常数？上下限混用？负号丢了？”',
      },
    ],
  },
  {
    title: '综合练习：选择合适的 u',
    sceneTitle: '综合练习',
    layout: '三道小题错落摆放，不做成僵硬表格；中间写选择理由，底部写练习顺序。',
    components: [
      {
        label: '练习入口',
        role: 'opening',
        marker: 'red',
        content: '标题“综合练习”；写“每题先说为什么选 u”。',
      },
      {
        label: '练习一',
        role: 'formula',
        marker: 'lime',
        content: '写“∫ 3x^2(x^3-3)^5 dx”；提示“u=x^3-3”。',
      },
      {
        label: '练习二',
        role: 'formula',
        marker: 'blue',
        content: '写“∫ sec^2x · e^{tan x} dx”；提示“u=tan x”。',
      },
      {
        label: '练习三',
        role: 'formula',
        marker: 'cyan',
        content: '写“∫_1^3 x/(x^2+1) dx”；提示“u=x^2+1，换上下限”。',
      },
      {
        label: '练习顺序',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“先选 u；再写 du；最后才算积分”。',
      },
    ],
  },
  {
    title: '总结：换元法的三句话',
    sceneTitle: '总结',
    layout: '中心写“换元法”，周围三句话：结构、计算、边界；底部 checklist。',
    components: [
      {
        label: '总结入口',
        role: 'opening',
        marker: 'red',
        content: '标题“换元法的三句话”；中心写“换元法”。',
      },
      {
        label: '结构一句话',
        role: 'strategy',
        marker: 'lime',
        content: '写“看见复合函数，就找内层和内层导数”。',
      },
      {
        label: '计算一句话',
        role: 'formula',
        marker: 'blue',
        content: '写“u=g(x)，du=g′(x)dx，换到只剩 u 和 du”。',
      },
      {
        label: '边界一句话',
        role: 'formula',
        marker: 'cyan',
        content: '写“定积分换元时，上下限也要进入 u 世界”。',
      },
      {
        label: '最终清单',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部 checklist：“选得合理；换得干净；常数符号；边界一致”。',
      },
    ],
  },
];

function narrationStep(marker, title, speech) {
  return { marker, title, speech };
}

function extraNarration(afterTitle, marker, title, speech) {
  return { afterTitle, marker, title, speech };
}

const PAGE_NARRATIONS = new Map([
  [
    1,
    [
      narrationStep(
        'red',
        '换元法要解决什么',
        '这一讲先抓住一个问题：有些积分不是函数本身难，而是里面套着一层复杂表达式。换元法的目的，就是先把这块反复出现的复杂部分叫作 u。',
      ),
      narrationStep(
        'lime',
        '先看复合结构',
        '左边的图像是在提醒我们，很多题其实是外层函数包着内层表达式。直接对 x 积分时，两层结构混在一起，所以看起来很乱。',
      ),
      narrationStep(
        'blue',
        '导数因子是信号',
        '如果把内层设成 u，那么 du 会带出内层的导数和 dx。原积分里一旦也出现这个导数因子，说明这道题很适合换元。',
      ),
      narrationStep(
        'cyan',
        '变量世界要统一',
        '换元真正发生时，我们是在从 x 的世界切到 u 的世界。切过去以后，积分里最好只剩 u 和 du；如果还剩 x，就说明还没有换干净。',
      ),
      narrationStep(
        'yellow',
        '本讲路线',
        '所以这一讲的路线很固定：先选 u，再算 du，然后把整个积分改写到 u 里面，算完以后根据题型决定要不要换回原变量。',
      ),
    ],
  ],
  [
    2,
    [
      narrationStep(
        'red',
        '来源不是新公式',
        '这一页把换元法的来源说清楚。它不是凭空多出来的技巧，而是链式法则反过来用。',
      ),
      narrationStep(
        'lime',
        '正向链式法则',
        '先从左边读正向过程：如果一个函数外面是 F，里面是 g(x)，求导时会得到外层导数，再乘上内层导数。',
      ),
      narrationStep(
        'blue',
        '反向看就是换元',
        '现在把这个过程倒过来看。如果积分里已经出现了外层作用在内层上，旁边又乘着内层导数，我们就可以把内层叫作 u。',
      ),
      narrationStep(
        'cyan',
        'du 不是装饰',
        'du 不是随便写在后面的符号，它代表内层导数和 dx 这一整包东西。换元时经常就是把这一整包一起替换掉。',
      ),
      narrationStep(
        'yellow',
        '第一判断',
        '因此看到题目时，第一反应不是马上积分，而是先问：有没有一个明显的内层？它的导数有没有在旁边出现？',
      ),
      narrationStep(
        'yellow',
        '公式怎么读',
        '如果这两个条件都在，换元后的积分会短很多；如果导数因子不在，选这个 u 可能就不是最好的路线。',
      ),
    ],
  ],
  [
    3,
    [
      narrationStep(
        'red',
        '选 u 的目标',
        '这一页讲怎样选 u。选 u 不是圈出最复杂的东西就结束，而是要让整个积分真的变简单。',
      ),
      narrationStep(
        'lime',
        '复杂内层是候选',
        '括号、根号、指数、三角函数里面的表达式，经常是候选的内层。它们不一定总是答案，但值得第一眼检查。',
      ),
      narrationStep(
        'blue',
        '必须检查导数',
        '选完候选以后，立刻算它的导数。原积分里如果正好有对应因子，或者差一个常数，这个 u 才真正有用。',
      ),
      narrationStep(
        'cyan',
        '差常数可以处理',
        '只差一个常数时，不要放弃。常数可以提到积分号外面，换元仍然成立；但如果差的是变量结构，就不能硬补。',
      ),
      narrationStep(
        'yellow',
        '失败信号',
        '换完之后还剩原来的变量，是最直接的失败信号。看到 x 和 u 混在同一个积分里，就要回头继续改写，或者重新选 u。',
      ),
      narrationStep(
        'yellow',
        '一句话策略',
        '所以选 u 的策略可以压成一句话：找内层，验导数，能换干净才继续。',
      ),
    ],
  ],
  [
    4,
    [
      narrationStep(
        'red',
        '先识别题型',
        '这页是一道最标准的括号整体换元。括号里面复杂，括号外面又正好像它的导数，这就是非常好的信号。',
      ),
      narrationStep(
        'lime',
        '设 u 并算 du',
        '令 u 等于括号里的三 x 平方加四。求微分后，du 正好等于外面的六 x dx，于是外面的因子可以整包替换。',
      ),
      narrationStep(
        'blue',
        '完全改写',
        '关键不是只把括号改成 u，而是把六 x dx 也改成 du。这样原来的积分才真正变成只含 u 的幂函数积分。',
      ),
      narrationStep(
        'cyan',
        '积分后换回',
        '在 u 世界里算完以后，因为这是不定积分，要把 u 换回原来的三 x 平方加四，并且补上常数 C。',
      ),
      narrationStep(
        'yellow',
        '本页模式',
        '这一页留下的模式很常用：复杂括号加外部导数，通常就是直接令括号为 u。',
      ),
    ],
  ],
  [
    5,
    [
      narrationStep(
        'red',
        '只差常数的题',
        '这一页处理一个很常见的情况：内层很明显，外面也有导数影子，只是差了一个常数倍。',
      ),
      narrationStep(
        'lime',
        '设 u 后比较',
        '令 u 等于根号里面的 z 平方减五。du 等于二 z dz，而原式里只有 z dz，所以差的不是变量结构，只是一个二。',
      ),
      narrationStep(
        'blue',
        '常数放到外面',
        '这时把 z dz 写成二分之一 du。这个二分之一要一直跟着，不能在换元过程中悄悄消失。',
      ),
      narrationStep(
        'cyan',
        '回到幂函数积分',
        '改写干净以后，根号就是 u 的二分之一次方，题目又变成普通幂函数积分。',
      ),
      narrationStep(
        'yellow',
        '常数和变量要分清',
        '所以判断标准是：差常数可以补，差变量不能硬补。换元法允许调整比例，不允许假装缺掉的变量已经存在。',
      ),
    ],
  ],
  [
    6,
    [
      narrationStep(
        'red',
        '负号从哪里来',
        '这道三角题的重点不是三角函数本身，而是负号。很多错误都发生在 du 里的负号被漏掉。',
      ),
      narrationStep(
        'lime',
        '选 cos t 为 u',
        '分母里反复出现 cos t，所以令 u 等于 cos t 很自然。可是 cos t 的导数是负的 sin t，这个负号必须带下来。',
      ),
      narrationStep(
        'blue',
        '替换分子整包',
        '因为 du 等于负的 sin t dt，所以 sin t dt 要替换成负 du。这里不是可有可无的符号调整，而是等式本身决定的。',
      ),
      narrationStep(
        'cyan',
        '在 u 世界计算',
        '换完以后，分母变成 u 的三次方，整个积分就变成带负号的幂函数积分。接下来按幂函数规则算就行。',
      ),
      narrationStep(
        'yellow',
        '符号检查',
        '最后检查答案时，先回看 du 那一步。只要内层导数带负号，后面的每一步都必须承接这个负号。',
      ),
      narrationStep(
        'yellow',
        '不要凭感觉消负',
        '换元题里的负号不是感觉问题，而是微分关系问题。写清 du，符号自然就不会乱。',
      ),
    ],
  ],
  [
    7,
    [
      narrationStep(
        'red',
        '混用变量的问题',
        '这一页故意展示一个常见卡点：选 u 很自然，但换完以后原变量还没有完全消失。',
      ),
      narrationStep(
        'lime',
        '先换根号内层',
        '根号里面是 x 减一，所以令 u 等于 x 减一。这样 dx 可以变成 du，根号也可以变成根号 u。',
      ),
      narrationStep(
        'blue',
        '发现剩余的 x',
        '但是分子还有一个 x。如果这时写成 x 除以根号 u，就说明同一个积分里混用了两个变量世界。',
      ),
      narrationStep(
        'cyan',
        '把剩余变量也改掉',
        '既然 u 等于 x 减一，就能反过来得到 x 等于 u 加一。把分子也换掉后，积分才真的只剩 u。',
      ),
      narrationStep(
        'yellow',
        '核心规则',
        '换元以后不要同时出现 x 和 u。只要还混着变量，就先别积分，继续把变量改写干净。',
      ),
      narrationStep(
        'yellow',
        '更一般的提醒',
        '这也是为什么选 u 时要想清楚：它不仅要处理最复杂部分，还要能帮助你处理剩下的变量。',
      ),
    ],
  ],
  [
    8,
    [
      narrationStep(
        'red',
        '定积分的额外要求',
        '从这一页开始进入定积分换元。和不定积分相比，最大的变化是上下限也属于变量世界，不能随便沿用。',
      ),
      narrationStep(
        'lime',
        '错误做法在哪里',
        '左侧的错误做法是：被积函数已经换成 u 了，却还把 x 的上下限零到六拿来用。这就是上下限和变量不匹配。',
      ),
      narrationStep(
        'blue',
        '先换边界',
        '正确做法是把原来的 x 边界代进 u 的表达式。x 等于零时得到新的下限，x 等于六时得到新的上限。',
      ),
      narrationStep(
        'cyan',
        '在同一个变量里算',
        '换好上下限以后，整个积分都在 u 世界里：被积函数是 u，微分是 du，上下限也是 u 的数值。',
      ),
      narrationStep(
        'yellow',
        '两条路线选一条',
        '定积分可以有两条路线：要么换上下限，在 u 世界算到底；要么最后换回 x，再用原上下限。不能两条路线混着用。',
      ),
      narrationStep('yellow', '本页口诀', '所以定积分换元时记住一句话：变量换了，边界也要跟着换。'),
    ],
  ],
  [
    9,
    [
      narrationStep(
        'red',
        '指数里的内层',
        '这道题是指数函数配内层导数。指数里的 x 平方是明显内层，外面的二 x dx 正好给出它的微分。',
      ),
      narrationStep(
        'lime',
        '改写成 e 的 u 次方',
        '令 u 等于 x 平方后，du 等于二 x dx。这样原积分能完整变成 e 的 u 次方对 u 积分。',
      ),
      narrationStep(
        'blue',
        '立刻换上下限',
        '因为这是定积分，换完变量就顺手换上下限。x 从零到二，对应 u 从零到四。',
      ),
      narrationStep(
        'cyan',
        '算完就是数',
        '现在只需要积分 e 的 u 次方，再代入新的上下限，结果是 e 的四次方减一。',
      ),
      narrationStep(
        'yellow',
        '不需要换回',
        '如果上下限已经换成 u 的上下限，算完就已经是数，不需要再把 u 换回 x。',
      ),
    ],
  ],
  [
    10,
    [
      narrationStep(
        'red',
        '系数不完全匹配',
        '这题和上一题相似，但外面的因子不完全等于内层导数，所以常数比例要先处理清楚。',
      ),
      narrationStep(
        'lime',
        '算出 du',
        '令 u 等于四 x 平方加三，那么 du 等于八 x dx。原式里只有 x dx，所以要换成八分之一 du。',
      ),
      narrationStep(
        'blue',
        '边界也跟着变',
        'x 从零到一时，u 从三变到七。到这里，变量、微分、上下限都已经进入 u 世界。',
      ),
      narrationStep(
        'cyan',
        '保留常数因子',
        '接下来积分 e 的 u 次方，但外面的八分之一不能丢。它是由 du 的系数差带出来的。',
      ),
      narrationStep(
        'yellow',
        '本页防错点',
        '这类题最容易少一个常数倍。每次设完 u，都先把 du 和原式里的因子逐项对齐。',
      ),
    ],
  ],
  [
    11,
    [
      narrationStep(
        'red',
        '不是所有题先换元',
        '这一页提醒我们，有些积分不能一上来就换元。这里的 cos 平方更需要先做三角恒等变形。',
      ),
      narrationStep(
        'lime',
        '先降幂',
        '用降幂公式把 cos 平方写成二分之一乘一加 cos 二 θ。这样题目被拆成常数部分和震荡部分。',
      ),
      narrationStep(
        'blue',
        '常数部分直接算',
        '常数部分没有复杂结构，直接用区间长度计算就可以，得到圆周率的四分之一。',
      ),
      narrationStep(
        'cyan',
        '震荡部分会抵消',
        '剩下的 cos 二 θ 可以换元，也可以直接积分。由于端点代入后正弦值相同，这一部分贡献为零。',
      ),
      narrationStep(
        'yellow',
        '方法选择',
        '所以最终答案是圆周率的四分之一。本页的重点是：换元之前，先看有没有更基础的代数或三角变形。',
      ),
    ],
  ],
  [
    12,
    [
      narrationStep(
        'red',
        '没有公式也能换元',
        '这一页处理抽象函数。题目没有给 f 的具体公式，只给了已知面积，所以我们要靠换元理解区间和尺度。',
      ),
      narrationStep(
        'lime',
        '横向压缩直觉',
        'f(2x) 的意思是横向压缩一半。x 从零走到三时，内层二 x 实际上从零扫到六。',
      ),
      narrationStep(
        'blue',
        '微分带来比例',
        '令 u 等于二 x 后，dx 等于二分之一 du。这个二分之一说明压缩后的面积也会按比例缩小。',
      ),
      narrationStep(
        'cyan',
        '正好用已知面积',
        '上下限换成 u 后，区间正好是零到六，也就是题目已经告诉我们的那块面积。',
      ),
      narrationStep(
        'yellow',
        '结论怎么来',
        '因此原积分等于二分之一乘已知面积八，答案是四。换元在这里不是算公式，而是把未知函数的面积搬到已知区间。',
      ),
    ],
  ],
  [
    13,
    [
      narrationStep(
        'red',
        '用换元证明等式',
        '这一页不是为了算出某个数，而是用换元证明两个积分相等。这说明换元也能用来比较结构。',
      ),
      narrationStep(
        'lime',
        '区间反射',
        '在零到圆周率二分之一的区间里，把 x 换成圆周率二分之一减 x，会把靠左的位置和靠右的位置对调。',
      ),
      narrationStep(
        'blue',
        '代换带来负号',
        '令 u 等于圆周率二分之一减 x 时，dx 会变成负 du。与此同时，上下限也会反过来。',
      ),
      narrationStep(
        'cyan',
        'sin 和 cos 互换',
        '关键是 cos x 会变成 sin u。虽然微分带出负号，但上下限反向又把这个负号抵消掉。',
      ),
      narrationStep(
        'yellow',
        '得到对称结论',
        '所以两个积分相等。这里的重点不是 f 的具体样子，而是区间对称和三角函数互换共同起作用。',
      ),
      narrationStep(
        'yellow',
        '证明题读法',
        '遇到这种题，要先想能不能通过换元把一个积分的形状变成另一个，而不是急着找 f 的原函数。',
      ),
    ],
  ],
  [
    14,
    [
      narrationStep(
        'red',
        '剩余变量可改写',
        '这道练习看上去外面有 x 的三次方，但内层 x 平方加一非常明显。关键是把外面的幂次拆开。',
      ),
      narrationStep(
        'lime',
        '先拆出 x dx',
        '把 x 的三次方写成 x 平方乘 x。这样其中的 x dx 可以和 du 对上，剩下的 x 平方再单独处理。',
      ),
      narrationStep(
        'blue',
        '设 u 后对齐',
        '令 u 等于 x 平方加一，du 等于二 x dx，所以 x dx 变成二分之一 du。',
      ),
      narrationStep(
        'cyan',
        '剩下的 x 平方也要换',
        '剩下的 x 平方不能留在积分里。由 u 等于 x 平方加一可知，x 平方等于 u 减一。',
      ),
      narrationStep(
        'yellow',
        '通用动作',
        '这页的通用动作是：先拆因子配出 du，再用 u 的关系处理剩余变量。换干净以后才开始积分。',
      ),
      narrationStep(
        'yellow',
        '别被高次幂吓住',
        '外面的高次幂不一定代表不能换元；很多时候只是需要先拆成“配 du 的部分”和“可改写的部分”。',
      ),
    ],
  ],
  [
    15,
    [
      narrationStep(
        'red',
        '流程比答案重要',
        '这一页把前面的例题整理成流程。换元法做得稳，靠的是先判断结构，而不是一看到题就开始算。',
      ),
      narrationStep(
        'lime',
        '第一步找内层',
        '先找复杂内层：括号、根号、指数或三角函数里面的表达式，都是常见候选。',
      ),
      narrationStep(
        'blue',
        '第二步验 du',
        '然后算 du，看原积分里有没有对应因子。只差常数可以补，缺变量结构就要谨慎。',
      ),
      narrationStep(
        'cyan',
        '第三步看题型',
        '接着分清不定积分和定积分。不定积分通常算完要换回，定积分如果换了上下限，最后可以直接得到数值。',
      ),
      narrationStep(
        'yellow',
        '排错清单',
        '底部清单用来收尾：变量有没有混用，常数有没有丢，负号有没有承接，上下限有没有和当前变量一致。',
      ),
    ],
  ],
  [
    16,
    [
      narrationStep(
        'red',
        '先说为什么选 u',
        '综合练习的重点不是先算答案，而是每一题先说清楚为什么这样选 u。',
      ),
      narrationStep(
        'lime',
        '练习一的结构',
        '第一题是标准括号型。内层是 x 三次方减三，外面的三 x 平方正好对应内层导数。',
      ),
      narrationStep(
        'blue',
        '练习二的结构',
        '第二题利用三角导数。指数里的 tan x 是内层，而 sec 平方 x 正好是 tan x 的导数。',
      ),
      narrationStep(
        'cyan',
        '练习三的边界',
        '第三题是定积分。选 u 等于 x 平方加一以后，还要把 x 的上下限一和三换成 u 的上下限二和十。',
      ),
      narrationStep(
        'yellow',
        '练习顺序',
        '做这类综合页时，顺序固定下来：先选 u，再写 du，确认变量和上下限都换干净，最后才进入计算。',
      ),
    ],
  ],
  [
    17,
    [
      narrationStep(
        'red',
        '三句话收束',
        '最后一页把换元法收束成三句话。只要这三句话清楚，大多数换元题就不会乱。',
      ),
      narrationStep(
        'lime',
        '结构判断',
        '第一句话是结构判断：看到复合函数，就找内层和内层导数。它决定这题是不是适合换元。',
      ),
      narrationStep(
        'blue',
        '计算动作',
        '第二句话是计算动作：写出 u 和 du，然后把积分改到只剩 u 和 du。',
      ),
      narrationStep(
        'cyan',
        '边界一致',
        '第三句话是定积分边界：如果变量换成 u，上下限也要进入 u 世界，不能继续用 x 的边界。',
      ),
      narrationStep(
        'yellow',
        '最终检查',
        '最后用清单检查答案：u 选得是否合理，变量是否换干净，常数和符号有没有丢，上下限是否一致。',
      ),
      narrationStep(
        'yellow',
        '最后一句',
        '换元法真正要训练的，是看见结构、切换变量、保持一致。做到这三点，计算就只是后面的收尾。',
      ),
    ],
  ],
]);

const PAGE_NARRATION_DETAILS = new Map([
  [
    1,
    [
      extraNarration(
        '先看复合结构',
        'lime',
        '复杂部分要反复出现',
        '选 u 时不只是看哪一块最长，还要看这块复杂表达式是不是在题目里反复发挥作用。只有它能统一题目结构，换元才有价值。',
      ),
      extraNarration(
        '导数因子是信号',
        'blue',
        '差常数不用怕',
        '导数因子不一定一模一样。有时只差一个常数倍，这种差别可以放到积分号外面处理，不会破坏换元。',
      ),
      extraNarration(
        '变量世界要统一',
        'cyan',
        '混合变量是警报',
        '换元之后如果同时看见 x 和 u，就先停下来。这个积分还没有被翻译完整，继续算通常会把变量关系弄乱。',
      ),
    ],
  ],
  [
    2,
    [
      extraNarration(
        '正向链式法则',
        'lime',
        '先从求导记忆入手',
        '链式法则里最熟的是求导：外层导数保留内层，再乘内层导数。换元法正是把这个乘积结构反过来认出来。',
      ),
      extraNarration(
        'du 不是装饰',
        'cyan',
        'du 表示整包替换',
        '写 du 的意义，是把内层导数和 dx 打包成一个新微分。换元时替换的是这一整包，不是只把 dx 改个名字。',
      ),
      extraNarration(
        '公式怎么读',
        'yellow',
        '不满足就换思路',
        '如果内层导数完全不在题目里，也不能硬说这是换元题。这个判断能帮你及时换方法，而不是把题目越换越乱。',
      ),
    ],
  ],
  [
    3,
    [
      extraNarration(
        '复杂内层是候选',
        'lime',
        '候选不等于答案',
        '括号和根号里的表达式常常是候选，但选完以后一定要验导数。没有验导数的 u，只是猜测，还不是方法。',
      ),
      extraNarration(
        '差常数可以处理',
        'cyan',
        '比例调整要写清',
        '差常数时，要明确写出 dx 这一包等于多少 du，或者原来的因子等于多少 du。这样常数才不会在中途丢失。',
      ),
      extraNarration(
        '失败信号',
        'yellow',
        '剩余变量要回收',
        '如果换完还剩原变量，有时可以通过原来的 u 等式把它改写掉；如果改不掉，就说明这个 u 可能不是合适选择。',
      ),
    ],
  ],
  [
    4,
    [
      extraNarration(
        '设 u 并算 du',
        'lime',
        '微分关系要完整',
        '这里 du 正好等于六 x dx，所以外面的六 x dx 可以一整块换成 du。完整写这一步，是为了防止只换括号。',
      ),
      extraNarration(
        '完全改写',
        'blue',
        'u 世界很干净',
        '改写后只剩 u 的幂和 du，这就是换元成功的样子。变量干净以后，题目退回到最基础的幂函数积分。',
      ),
      extraNarration(
        '积分后换回',
        'cyan',
        '不定积分必须回代',
        '因为原题是不定积分，最后答案要回到 x。u 只是临时变量，不能留作最终答案。',
      ),
    ],
  ],
  [
    5,
    [
      extraNarration(
        '设 u 后比较',
        'lime',
        '先比较微分包',
        '令 u 以后，马上把 du 和原题里的因子摆在一起比较。这样你能看清差的是常数，还是差了变量。',
      ),
      extraNarration(
        '常数放到外面',
        'blue',
        '常数要跟完整题走',
        '二分之一一旦提出去，就要一直保留到最后。换元计算里很多小错，都是常数在中间某一步消失。',
      ),
      extraNarration(
        '回到幂函数积分',
        'cyan',
        '根号改成分数指数',
        '根号 u 可以写成 u 的二分之一次方。换成幂函数以后，积分规则就很直接。',
      ),
    ],
  ],
  [
    6,
    [
      extraNarration(
        '选 cos t 为 u',
        'lime',
        '为什么不选分子',
        '分母里 cos t 的幂次更复杂，选它做 u 可以把分母整体变简单；分子里的 sin t 则刚好负责提供 du。',
      ),
      extraNarration(
        '替换分子整包',
        'blue',
        '负号跟着整包走',
        'sin t dt 不是 du，而是负 du。只要这一步写准确，后面结果的符号基本就不会乱。',
      ),
      extraNarration(
        '在 u 世界计算',
        'cyan',
        '负指数也按幂函数',
        'u 的三次方在分母，可以改写成 u 的负三次方。这样仍然是幂函数积分，只是指数为负。',
      ),
    ],
  ],
  [
    7,
    [
      extraNarration(
        '先换根号内层',
        'lime',
        '根号先变简单',
        '令 u 等于 x 减一以后，根号立刻变成根号 u，这是第一层简化。但它还没有处理分子里的 x。',
      ),
      extraNarration(
        '把剩余变量也改掉',
        'cyan',
        '反解不是多余步骤',
        '从 u 等于 x 减一反推出 x 等于 u 加一，这一步是为了把残留的 x 回收进 u 世界。',
      ),
      extraNarration(
        '更一般的提醒',
        'yellow',
        '选 u 要看全局',
        '选 u 时要同时想：它能不能处理复杂部分，也能不能处理旁边剩下的变量。只看最显眼的一块常常不够。',
      ),
    ],
  ],
  [
    8,
    [
      extraNarration(
        '错误做法在哪里',
        'lime',
        '变量和边界必须同名',
        '如果积分已经变成 u 的积分，边界也必须是 u 的边界。用 u 的函数配 x 的上下限，就像两套坐标混在一起。',
      ),
      extraNarration(
        '先换边界',
        'blue',
        '边界来自同一个 u',
        '换边界时只做一件事：把原来的 x 上下限代进 u 等于什么的关系。不要凭感觉改数字。',
      ),
      extraNarration(
        '两条路线选一条',
        'yellow',
        '不要两条路线混用',
        '定积分可以换边界后直接算，也可以算完再回代原上下限。两条路线都对，但同一题里不要混着用。',
      ),
    ],
  ],
  [
    9,
    [
      extraNarration(
        '指数里的内层',
        'lime',
        '指数函数最怕内层漏掉',
        'e 的外层积分很简单，真正要处理的是指数里面的内层表达式。把内层设成 u，指数结构就干净了。',
      ),
      extraNarration(
        '立刻换上下限',
        'cyan',
        '定积分省去回代',
        '上下限换成 u 以后，最后会直接得到一个数，所以不用再把 u 换回 x。这是定积分换元的一个好处。',
      ),
      extraNarration(
        '算完就是数',
        'yellow',
        '检查结果形态',
        '定积分的结果应该是数字或常数表达式，不应该还含有原来的变量。这个形态检查很快能发现漏步。',
      ),
    ],
  ],
  [
    10,
    [
      extraNarration(
        '算出 du',
        'lime',
        '先别急着改边界',
        '边界要换，但在那之前先把 du 算准确。du 里的系数决定了外面需要留下什么常数。',
      ),
      extraNarration(
        '保留常数因子',
        'cyan',
        '常数不进上下限',
        '常数因子来自微分关系，它留在积分号外面；上下限只负责把 x 的边界换成 u 的边界。',
      ),
      extraNarration(
        '本页防错点',
        'yellow',
        '边界和常数分开检查',
        '这类题最适合最后做两项检查：上下限有没有换对，常数倍有没有跟下来。',
      ),
    ],
  ],
  [
    11,
    [
      extraNarration(
        '先降幂',
        'lime',
        '方法选择在换元之前',
        '这页提醒我们，看到三角平方不一定马上换元。先用恒等式降幂，题目可能直接变成基本积分。',
      ),
      extraNarration(
        '震荡部分会抵消',
        'cyan',
        '对称区间要读图',
        '在完整周期或对称区间上，正负波动可能互相抵消。这个判断来自图像和三角函数性质，不只是代数计算。',
      ),
      extraNarration(
        '方法选择',
        'yellow',
        '先简化再换元',
        '换元法很重要，但不是每题的第一步。能用恒等式先整理的题，通常整理后更清楚。',
      ),
    ],
  ],
  [
    12,
    [
      extraNarration(
        '横向压缩直觉',
        'lime',
        '变量缩放改变宽度',
        'f(kx) 把图像横向压缩或拉伸，所以面积会按相反比例变化。换元正是在代数上表达这个宽度变化。',
      ),
      extraNarration(
        '微分带来比例',
        'cyan',
        '比例来自 dx',
        '令 u 等于 kx 时，dx 会变成 du 除以 k。面积的比例因子不是凭空出现的，而是从微分里出来的。',
      ),
      extraNarration(
        '结论怎么来',
        'yellow',
        '已知面积可以复用',
        '一旦换元把积分区间和函数形式变成熟悉的样子，就可以复用已知面积，而不用重新计算函数本身。',
      ),
    ],
  ],
  [
    13,
    [
      extraNarration(
        '区间反射',
        'lime',
        '反射会交换端点',
        '用区间反射换元时，上下限通常会对调。这个对调带来的负号，要和 du 里的负号一起处理。',
      ),
      extraNarration(
        'sin 和 cos 互换',
        'cyan',
        '互换来自互余角',
        '当变量被换成互余的角，sin 和 cos 会互相转换。这不是巧合，而是三角函数的互余关系。',
      ),
      extraNarration(
        '证明题读法',
        'yellow',
        '证明不是为了算数',
        '这类题的目标不是求出具体积分值，而是证明两个积分相等。换元的作用是把一个积分变形成另一个。',
      ),
    ],
  ],
  [
    14,
    [
      extraNarration(
        '先拆出 x dx',
        'lime',
        '先找微分包',
        '高次幂题里，先找能组成 du 的那一包。这里 x dx 是关键，它让 x 平方加一能够成为 u。',
      ),
      extraNarration(
        '剩下的 x 平方也要换',
        'cyan',
        '用 u 关系回收剩余幂',
        '如果还剩 x 平方，就用 u 等于 x 平方加一反解成 x 平方等于 u 减一。这样高次幂也能回到 u 世界。',
      ),
      extraNarration(
        '通用动作',
        'yellow',
        '先配微分再处理剩余',
        '通用顺序是先凑出 du，再把剩余变量用 u 改写。顺序清楚，高次幂就不会显得吓人。',
      ),
    ],
  ],
  [
    15,
    [
      extraNarration(
        '第一步找内层',
        'lime',
        '内层要能简化全题',
        '找内层不是为了给题目换个名字，而是为了让被积函数整体变短、变量变统一。',
      ),
      extraNarration(
        '第二步验 du',
        'blue',
        '验 du 决定能不能继续',
        'du 检查是换元的关口。能对上，后面就顺；对不上，就要调整 u 或换方法。',
      ),
      extraNarration(
        '排错清单',
        'yellow',
        '四个错点逐个扫',
        '最后检查变量是否混用、常数是否丢失、负号是否正确、定积分边界是否已经同步。',
      ),
    ],
  ],
  [
    16,
    [
      extraNarration(
        '练习一的结构',
        'lime',
        '先说内层和导数',
        '每道练习都先口头说出内层是什么、导数在哪里。这个习惯比直接写答案更能训练判断力。',
      ),
      extraNarration(
        '练习三的边界',
        'cyan',
        '定积分多一项检查',
        '只要题目有上下限，就多做边界检查。换成新变量后，旧边界不要继续留在题目里。',
      ),
      extraNarration(
        '练习顺序',
        'yellow',
        '练习重在流程稳定',
        '综合练习不是比谁算得快，而是让每题都走同一套稳定流程：选 u、算 du、换干净、再积分。',
      ),
    ],
  ],
  [
    17,
    [
      extraNarration(
        '结构判断',
        'lime',
        '先看题目像不像链式法则',
        '换元法的入口是结构判断：外层套内层，旁边有内层导数。这个结构越清楚，换元越自然。',
      ),
      extraNarration(
        '计算动作',
        'blue',
        '计算动作是翻译',
        '设 u、算 du、改写积分，本质上是在把 x 语言翻译成 u 语言。翻译完整以后，计算才真正开始。',
      ),
      extraNarration(
        '边界一致',
        'cyan',
        '定积分要统一世界',
        '定积分里变量、微分和上下限必须在同一个世界。只要三者不统一，就先别代数计算。',
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

Generate page ${pageNumber} of a Chinese calculus substitution-method notebook as a marker source image. The image itself must contain the colored corner markers; later software will recover the regions and remove the markers.

Hard visible-text rules:
- All visible prose, headings, labels, and question text must be Simplified Chinese.
- Do not write any course code, course name, teacher name, date, page number, or week label.
- Do not write MAT136, Calculus II, Week, 第1周, 页码, Page, or any English prose.
- Do not write component numbers or circled numbers before headings.
- Standard math notation is allowed: f(x), g(x), u, du, dx, e^u, sin, cos, tan, sec, θ, π, √, F(x), Σ, ∫, lim.

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
    title: '换元法：从反向链式法则到定积分换元',
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
          name: '换元法：从反向链式法则到定积分换元',
          description: '第二本中文手绘图片笔记本：换元法、反向链式法则、不定积分与定积分换元。',
          tags: ['MAT136', '换元法', '反向链式法则', '定积分换元', '中文笔记', '四角marker'],
          avatarUrl: '/avatars/notebook-agents/avatar8.avif',
          language: 'zh-CN',
          style: 'imagegen-marker-recovered-v2',
          updatedAt: now,
        },
        create: {
          id: NOTEBOOK_ID,
          ownerId: course.ownerId,
          courseId: course.id,
          name: '换元法：从反向链式法则到定积分换元',
          description: '第二本中文手绘图片笔记本：换元法、反向链式法则、不定积分与定积分换元。',
          tags: ['MAT136', '换元法', '反向链式法则', '定积分换元', '中文笔记', '四角marker'],
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
