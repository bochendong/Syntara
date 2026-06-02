#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';

const SCRIPT_NAME = 'create-mat136-third-notebook-v2.mjs';
const NOTEBOOK_ID = 'queue-mat136-03-inverse-substitution';
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
    title: '逆换元法：让根号变简单',
    sceneTitle: '逆换元法入口',
    layout:
      '自然课堂笔记布局：上方标题和核心问题，左侧对比普通换元，右侧画根号形状，底部给本节路线。',
    components: [
      {
        label: '本节问题',
        role: 'opening',
        marker: 'red',
        content: '标题“逆换元法：让根号变简单”；写“普通换元卡住时怎么办？”',
      },
      {
        label: '普通换元会卡住',
        role: 'setup',
        marker: 'lime',
        content: '画“u=根号里面”后外面没有合适 du 的示意，写“导数不配套”。',
      },
      {
        label: '根号形状',
        role: 'visual',
        marker: 'blue',
        content: '写“√(a^2-x^2)、√(a^2+x^2)、√(x^2-a^2)”三种形状。',
      },
      {
        label: '三角恒等式救场',
        role: 'strategy',
        marker: 'cyan',
        content: '写“1-sin^2θ=cos^2θ；1+tan^2θ=sec^2θ；sec^2θ-1=tan^2θ”。',
      },
      {
        label: '学习路线',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部路线：“认形状 → 选代换 → 改 dx → 积分 → 用三角形换回”。',
      },
    ],
  },
  {
    title: '三角工具箱：平方恒等式',
    sceneTitle: '三角恒等式工具箱',
    layout:
      '三条恒等式像工具卡片一样错落摆放，每条都配一个根号形状；底部提示不是背公式而是配形状。',
    components: [
      {
        label: '工具箱入口',
        role: 'opening',
        marker: 'red',
        content: '标题“三角工具箱”；写“目标：把根号里的平方变成完全平方”。',
      },
      {
        label: 'sin 与 cos',
        role: 'formula',
        marker: 'lime',
        content: '写“sin^2θ+cos^2θ=1”；推出“1-sin^2θ=cos^2θ”。',
      },
      {
        label: 'tan 与 sec',
        role: 'formula',
        marker: 'blue',
        content: '写“1+tan^2θ=sec^2θ”；旁边放“a^2+x^2”。',
      },
      {
        label: 'sec 与 tan',
        role: 'formula',
        marker: 'cyan',
        content: '写“sec^2θ-1=tan^2θ”；旁边放“x^2-a^2”。',
      },
      {
        label: '配形状提醒',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“先配根号形状，再选三角代换”。',
      },
    ],
  },
  {
    title: '三种根号对应三种代换',
    sceneTitle: '代换字典',
    layout: '中心写三种根号形状，周围用箭头连到 x=a sinθ、x=a tanθ、x=a secθ；底部写选择理由。',
    components: [
      {
        label: '字典入口',
        role: 'opening',
        marker: 'red',
        content: '标题“三种根号对应三种代换”；写“根号形状决定代换”。',
      },
      {
        label: '平方差一',
        role: 'formula',
        marker: 'lime',
        content: '写“√(a^2-x^2) → x=a sinθ”；旁边写“a^2(1-sin^2θ)”。',
      },
      {
        label: '平方和',
        role: 'formula',
        marker: 'blue',
        content: '写“√(a^2+x^2) → x=a tanθ”；旁边写“a^2(1+tan^2θ)”。',
      },
      {
        label: '平方差二',
        role: 'formula',
        marker: 'cyan',
        content: '写“√(x^2-a^2) → x=a secθ”；旁边写“a^2(sec^2θ-1)”。',
      },
      {
        label: '选择理由',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“选代换的目的：让根号变成 a·三角函数”。',
      },
    ],
  },
  {
    title: '代换后 dx 也要改',
    sceneTitle: 'dx 的改写',
    layout: '左侧写三种 x 的代换，右侧对应 dx，底部提醒不要只换根号。',
    components: [
      {
        label: 'dx 入口',
        role: 'opening',
        marker: 'red',
        content: '标题“代换后 dx 也要改”；写“x 变成 θ，dx 也要变成 dθ”。',
      },
      {
        label: 'sin 代换',
        role: 'formula',
        marker: 'lime',
        content: '写“x=a sinθ”；“dx=a cosθ dθ”。',
      },
      {
        label: 'tan 代换',
        role: 'formula',
        marker: 'blue',
        content: '写“x=a tanθ”；“dx=a sec^2θ dθ”。',
      },
      {
        label: 'sec 代换',
        role: 'formula',
        marker: 'cyan',
        content: '写“x=a secθ”；“dx=a secθ tanθ dθ”。',
      },
      {
        label: '完整替换提醒',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“根号、x、dx 都要进入 θ 世界”。',
      },
    ],
  },
  {
    title: '用三角形把 θ 换回 x',
    sceneTitle: '三角形换回',
    layout: '左侧画直角三角形，右侧写 sin/cos/tan/sec 对应边，底部强调最终答案通常要回到 x。',
    components: [
      {
        label: '换回入口',
        role: 'opening',
        marker: 'red',
        content: '标题“用三角形把 θ 换回 x”；写“答案不能停在 θ”。',
      },
      {
        label: 'sin 三角形',
        role: 'visual',
        marker: 'lime',
        content: '画三角形：sinθ=x/a；边标“对边 x，斜边 a，邻边 √(a^2-x^2)”。',
      },
      {
        label: 'tan 三角形',
        role: 'visual',
        marker: 'blue',
        content: '画三角形：tanθ=x/a；边标“对边 x，邻边 a，斜边 √(a^2+x^2)”。',
      },
      {
        label: 'sec 三角形',
        role: 'visual',
        marker: 'cyan',
        content: '画三角形：secθ=x/a；边标“斜边 x，邻边 a，对边 √(x^2-a^2)”。',
      },
      {
        label: '换回检查',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“最终答案：θ 用反三角或三角形换回 x”。',
      },
    ],
  },
  {
    title: '基础例题：√(a²-x²)',
    sceneTitle: '半圆面积型例题',
    layout: '上方写题目，左侧代换，右侧根号化简，底部进入 cos² 积分。',
    components: [
      {
        label: '题目入口',
        role: 'opening',
        marker: 'red',
        content: '写“计算 ∫√(a^2-x^2) dx”；旁边画半圆面积阴影。',
      },
      {
        label: '选择代换',
        role: 'formula',
        marker: 'lime',
        content: '写“x=a sinθ”；“dx=a cosθ dθ”。',
      },
      {
        label: '根号化简',
        role: 'formula',
        marker: 'blue',
        content: '写“√(a^2-a^2sin^2θ)=a cosθ”。',
      },
      {
        label: '积分变形',
        role: 'formula',
        marker: 'cyan',
        content: '写“∫√(a^2-x^2)dx = a^2∫cos^2θ dθ”。',
      },
      {
        label: '下一步提示',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“接下来用半角公式处理 cos²θ”。',
      },
    ],
  },
  {
    title: 'cos² 的半角积分',
    sceneTitle: '半角公式收尾',
    layout: '左侧写半角公式，中间积分，右侧换回 θ 与 x，底部给结果结构。',
    components: [
      {
        label: '半角入口',
        role: 'opening',
        marker: 'red',
        content: '标题“cos² 的半角积分”；写“从 a²∫cos²θ dθ 接着算”。',
      },
      {
        label: '半角公式',
        role: 'formula',
        marker: 'lime',
        content: '写“cos²θ=(1+cos2θ)/2”。',
      },
      {
        label: '积分结果',
        role: 'formula',
        marker: 'blue',
        content: '写“∫cos²θdθ = θ/2 + sin2θ/4 + C”。',
      },
      {
        label: '换回 x',
        role: 'formula',
        marker: 'cyan',
        content: '写“θ=arcsin(x/a)”；“sinθ=x/a，cosθ=√(a^2-x^2)/a”。',
      },
      {
        label: '结果结构',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“答案含：根号项 + 反三角项”。',
      },
    ],
  },
  {
    title: '例题：分母是 √(4-x²)',
    sceneTitle: 'sin 代换例题',
    layout: '上方写题目，左侧选择 x=2sinθ，中间化简，右侧上下限，底部结果。',
    components: [
      {
        label: '题目识别',
        role: 'opening',
        marker: 'red',
        content: '写“计算 ∫ x^2/√(4-x^2) dx”；圈出“4-x^2”。',
      },
      {
        label: '选择代换',
        role: 'formula',
        marker: 'lime',
        content: '写“x=2sinθ”；“dx=2cosθ dθ”。',
      },
      {
        label: '根号消掉',
        role: 'formula',
        marker: 'blue',
        content: '写“√(4-4sin²θ)=2cosθ”；原式变成“4∫sin²θ dθ”。',
      },
      {
        label: '上下限转换',
        role: 'formula',
        marker: 'cyan',
        content: '写“若 x=0→θ=0；x=1→θ=π/6”；提醒按题目边界转换。',
      },
      {
        label: '计算提示',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“sin²θ 用半角公式继续积分”。',
      },
    ],
  },
  {
    title: '定积分中的 θ 上下限',
    sceneTitle: '三角代换上下限',
    layout: '左侧 x 轴区间，右侧 θ 区间，中间写 arcsin/arctan/arcsec 的对应；底部规则。',
    components: [
      {
        label: '边界入口',
        role: 'opening',
        marker: 'red',
        content: '标题“定积分中的 θ 上下限”；写“变量变了，边界也变”。',
      },
      {
        label: 'sin 边界',
        role: 'formula',
        marker: 'lime',
        content: '写“x=a sinθ ⇒ θ=arcsin(x/a)”。',
      },
      {
        label: 'tan 边界',
        role: 'formula',
        marker: 'blue',
        content: '写“x=a tanθ ⇒ θ=arctan(x/a)”。',
      },
      {
        label: 'sec 边界',
        role: 'formula',
        marker: 'cyan',
        content: '写“x=a secθ ⇒ secθ=x/a”；用三角形或反 sec 读 θ。',
      },
      {
        label: '边界规则',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“若保留 θ 积分，就把上下限换成 θ”。',
      },
    ],
  },
  {
    title: '平方和：x=a tanθ',
    sceneTitle: 'tan 代换',
    layout: '左侧根号形状，中央代换，右侧化简到 sec，底部提醒 sec³ 可先停在三角积分。',
    components: [
      {
        label: '题目入口',
        role: 'opening',
        marker: 'red',
        content: '写“化简 ∫ x^2/√(x^2+16) dx”；圈出“x^2+16”。',
      },
      {
        label: '选择 tan',
        role: 'formula',
        marker: 'lime',
        content: '写“x=4tanθ”；“dx=4sec²θ dθ”。',
      },
      {
        label: '根号化简',
        role: 'formula',
        marker: 'blue',
        content: '写“√(16tan²θ+16)=4secθ”。',
      },
      {
        label: '三角积分',
        role: 'formula',
        marker: 'cyan',
        content: '写“原式 =16∫(sec³θ-secθ)dθ”。',
      },
      {
        label: '范围提醒',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“本页重点是化简到 θ 积分，不急着算 sec³”。',
      },
    ],
  },
  {
    title: '平方差：x=a secθ',
    sceneTitle: 'sec 代换',
    layout: '左侧写根号 x²-a²，中央代换和 dx，右侧三角形，底部选择条件。',
    components: [
      {
        label: '形状入口',
        role: 'opening',
        marker: 'red',
        content: '标题“平方差：x=a secθ”；写“处理 √(x^2-a^2)”。',
      },
      {
        label: '选择 sec',
        role: 'formula',
        marker: 'lime',
        content: '写“x=a secθ”；“dx=a secθ tanθ dθ”。',
      },
      {
        label: '根号变 tan',
        role: 'formula',
        marker: 'blue',
        content: '写“√(a²sec²θ-a²)=a tanθ”。',
      },
      {
        label: '回代三角形',
        role: 'visual',
        marker: 'cyan',
        content: '画三角形：邻边 a，斜边 x，对边 √(x²-a²)。',
      },
      {
        label: '适用提醒',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“x²-a² 且 |x|≥a 时，sec 代换最自然”。',
      },
    ],
  },
  {
    title: 'sec 代换例题：识别 9x²-1',
    sceneTitle: 'sec 代换例题',
    layout: '上方写题目结构，左侧设 3x=secθ，中间化简根号和 dx，右侧整理成三角积分。',
    components: [
      {
        label: '题目结构',
        role: 'opening',
        marker: 'red',
        content: '写“根号 √(9x^2-1)”；提示“把 9x² 看成 (3x)²”。',
      },
      {
        label: '设定代换',
        role: 'formula',
        marker: 'lime',
        content: '写“3x=secθ”；“x=secθ/3”。',
      },
      {
        label: 'dx 改写',
        role: 'formula',
        marker: 'blue',
        content: '写“dx=(1/3)secθtanθ dθ”。',
      },
      {
        label: '根号化简',
        role: 'formula',
        marker: 'cyan',
        content: '写“√(9x²-1)=√(sec²θ-1)=tanθ”。',
      },
      {
        label: '整理提示',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“代入后先约分，再决定是否用降幂公式”。',
      },
    ],
  },
  {
    title: '先配方再逆换元',
    sceneTitle: '配方后再代换',
    layout: '左侧写 √(5+4x-x²)，中间完成平方，右侧识别 a²-(x-h)²，底部给代换选择。',
    components: [
      {
        label: '题目入口',
        role: 'opening',
        marker: 'red',
        content: '写“处理 √(5+4x-x^2)”；提醒“先看能否配方”。',
      },
      {
        label: '完成平方',
        role: 'formula',
        marker: 'lime',
        content: '写“5+4x-x² = 9-(x-2)²”。',
      },
      {
        label: '识别形状',
        role: 'formula',
        marker: 'blue',
        content: '写“√(9-(x-2)²)”；标出“a=3，内层=x-2”。',
      },
      {
        label: '选择代换',
        role: 'formula',
        marker: 'cyan',
        content: '写“x-2=3sinθ”；“dx=3cosθ dθ”。',
      },
      {
        label: '配方提醒',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“二次式先配方，再套三种根号字典”。',
      },
    ],
  },
  {
    title: '常见结果结构速记',
    sceneTitle: '结果结构',
    layout: '不是公式表，像三条结果结构笔记：平方差、平方和、反平方差；底部说明考试时先会推。',
    components: [
      {
        label: '结构入口',
        role: 'opening',
        marker: 'red',
        content: '标题“常见结果结构速记”；写“先理解结构，再记公式”。',
      },
      {
        label: 'a²-x² 结果',
        role: 'formula',
        marker: 'lime',
        content: '写“∫√(a²-x²)dx”；旁边写“根号项 + arcsin(x/a)”。',
      },
      {
        label: 'a²+x² 结果',
        role: 'formula',
        marker: 'blue',
        content: '写“∫√(a²+x²)dx”；旁边写“根号项 + ln|x+√(a²+x²)|”。',
      },
      {
        label: 'x²-a² 结果',
        role: 'formula',
        marker: 'cyan',
        content: '写“∫√(x²-a²)dx”；旁边写“根号项 + ln|x+√(x²-a²)|”。',
      },
      {
        label: '速记提醒',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“能从代换推出，就不怕公式忘掉”。',
      },
    ],
  },
  {
    title: '选择代换的流程图',
    sceneTitle: '选择流程',
    layout: '中心放简洁流程：先配方，再看三种根号形状，再选 sin/tan/sec；底部错误排查。',
    components: [
      {
        label: '流程入口',
        role: 'opening',
        marker: 'red',
        content: '标题“选择代换的流程图”；中心写“先认形状”。',
      },
      {
        label: '先配方',
        role: 'strategy',
        marker: 'lime',
        content: '写“若根号内是二次式：先配方”。',
      },
      {
        label: '看三形',
        role: 'formula',
        marker: 'blue',
        content: '写“a²-x²；a²+x²；x²-a²”。',
      },
      {
        label: '选代换',
        role: 'formula',
        marker: 'cyan',
        content: '写“sin；tan；sec”分别对应三种形状。',
      },
      {
        label: '错误排查',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部 checklist：“dx 改了吗？根号消了吗？θ 换回了吗？”',
      },
    ],
  },
  {
    title: '综合练习：先选再算',
    sceneTitle: '综合练习',
    layout: '三道小题错落摆放，中间写选择理由；底部写做题顺序。',
    components: [
      {
        label: '练习入口',
        role: 'opening',
        marker: 'red',
        content: '标题“综合练习”；写“每题先选代换，再动笔计算”。',
      },
      {
        label: '练习一',
        role: 'formula',
        marker: 'lime',
        content: '写“∫√(9-x²) dx”；提示“x=3sinθ”。',
      },
      {
        label: '练习二',
        role: 'formula',
        marker: 'blue',
        content: '写“∫ dx/√(x²+25)”；提示“x=5tanθ”。',
      },
      {
        label: '练习三',
        role: 'formula',
        marker: 'cyan',
        content: '写“∫√(x²-16)/x dx”；提示“x=4secθ”。',
      },
      {
        label: '做题顺序',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“认形状 → 写代换 → 改 dx → 化简 → 回代”。',
      },
    ],
  },
  {
    title: '总结：逆换元法的三件事',
    sceneTitle: '总结',
    layout: '中心写“逆换元法”，周围三件事：认形状、消根号、换回 x；底部最终清单。',
    components: [
      {
        label: '总结入口',
        role: 'opening',
        marker: 'red',
        content: '标题“逆换元法的三件事”；中心写“逆换元法”。',
      },
      {
        label: '第一件事',
        role: 'strategy',
        marker: 'lime',
        content: '写“认根号形状：a²-x²，a²+x²，x²-a²”。',
      },
      {
        label: '第二件事',
        role: 'formula',
        marker: 'blue',
        content: '写“选 sin/tan/sec，让根号变成普通三角函数”。',
      },
      {
        label: '第三件事',
        role: 'formula',
        marker: 'cyan',
        content: '写“积分后用三角形或反三角函数换回 x”。',
      },
      {
        label: '最终清单',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部 checklist：“形状对；dx 对；范围对；回代对”。',
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
        '为什么需要逆换元',
        '这一讲先看普通换元为什么不够用。遇到平方差、平方和这类根号时，直接把根号里面设成 u，常常找不到配套的 du。',
      ),
      narrationStep(
        'lime',
        '普通换元卡在哪里',
        '左边这个失败示意很重要：如果 du 带出的是 x dx，但原式里没有这样的因子，变量就换不干净，计算会卡住。',
      ),
      narrationStep(
        'blue',
        '先认根号形状',
        '所以逆换元法第一步不是急着算，而是先认根号里的形状：是 a 平方减 x 平方，还是 a 平方加 x 平方，还是 x 平方减 a 平方。',
      ),
      narrationStep(
        'cyan',
        '三角恒等式救场',
        '三角恒等式的作用，是把根号里面的表达式变成一个完全平方。根号一旦变成平方开根号，复杂度就会降下来。',
      ),
      narrationStep(
        'yellow',
        '本讲路线',
        '整本笔记就围绕五步走：认形状，选三角代换，改写 dx，完成积分，最后用三角形或者反三角函数换回 x。',
      ),
    ],
  ],
  [
    2,
    [
      narrationStep(
        'red',
        '工具箱的目标',
        '这一页先准备工具。我们不是为了背三角恒等式，而是要用它们把根号里的平方关系变成更好处理的完全平方。',
      ),
      narrationStep(
        'lime',
        '一减平方',
        '第一条恒等式来自 sin 平方加 cos 平方等于一。它最适合处理一减某个平方的形状，也就是 a 平方减 x 平方。',
      ),
      narrationStep(
        'blue',
        '一加平方',
        '第二条是一加 tan 平方等于 sec 平方。只要根号里是平方和，就很自然地想到 tan 代换。',
      ),
      narrationStep(
        'cyan',
        '平方减一',
        '第三条是 sec 平方减一等于 tan 平方。它对应 x 平方减 a 平方，因为变量平方在前，常数平方在后。',
      ),
      narrationStep(
        'yellow',
        '不要先背表',
        '所以学习顺序不是先背代换表，而是先看根号形状，再问它能配到哪条三角恒等式。',
      ),
      narrationStep('yellow', '本页带走', '只要形状和恒等式配上了，后面的代换选择就不再像猜公式。'),
    ],
  ],
  [
    3,
    [
      narrationStep(
        'red',
        '把工具变成字典',
        '这一页把刚才的三条恒等式整理成代换字典。根号形状一旦识别出来，代换基本就跟着出来。',
      ),
      narrationStep(
        'lime',
        'a 平方减 x 平方',
        '如果是 a 平方减 x 平方，就令 x 等于 a sin θ。这样根号里会出现一减 sin 平方，也就是 cos 平方。',
      ),
      narrationStep(
        'blue',
        'a 平方加 x 平方',
        '如果是 a 平方加 x 平方，就令 x 等于 a tan θ。因为一加 tan 平方正好变成 sec 平方。',
      ),
      narrationStep(
        'cyan',
        'x 平方减 a 平方',
        '如果是 x 平方减 a 平方，就令 x 等于 a sec θ。这样根号里变成 sec 平方减一，也就是 tan 平方。',
      ),
      narrationStep(
        'yellow',
        '代换目的',
        '三种代换的共同目的只有一个：把根号化成 a 乘一个普通三角函数。记住目的，比死背表格更稳。',
      ),
    ],
  ],
  [
    4,
    [
      narrationStep(
        'red',
        'dx 也必须改',
        '这一页强调一个最常见的漏步：代换不只是改 x，dx 也必须跟着进入 θ 的世界。',
      ),
      narrationStep(
        'lime',
        'sin 代换的 dx',
        '如果 x 等于 a sin θ，那么 dx 等于 a cos θ dθ。这个 cos 往往会和根号化简出来的 cos 配合。',
      ),
      narrationStep(
        'blue',
        'tan 代换的 dx',
        '如果 x 等于 a tan θ，那么 dx 等于 a sec 平方 θ dθ。这里的 sec 平方来自 tan 的导数。',
      ),
      narrationStep(
        'cyan',
        'sec 代换的 dx',
        '如果 x 等于 a sec θ，那么 dx 等于 a sec θ tan θ dθ。这个形式经常和 x 平方减 a 平方的根号互相抵消。',
      ),
      narrationStep(
        'yellow',
        '完整替换',
        '做题时要一起检查三样东西：根号改了吗，原来的 x 改了吗，dx 改了吗。只改其中一部分，就还没有完成代换。',
      ),
    ],
  ],
  [
    5,
    [
      narrationStep(
        'red',
        '为什么要画三角形',
        '逆换元法算到最后，答案通常还含有 θ。要回到原变量，最稳定的方法就是根据代换画直角三角形。',
      ),
      narrationStep(
        'lime',
        'sin 代换的三角形',
        '如果 x 等于 a sin θ，就说明 sin θ 等于 x 除以 a。三角形里对边是 x，斜边是 a，邻边就是根号 a 平方减 x 平方。',
      ),
      narrationStep(
        'blue',
        'tan 代换的三角形',
        '如果 x 等于 a tan θ，就说明 tan θ 等于 x 除以 a。对边是 x，邻边是 a，斜边就是根号 a 平方加 x 平方。',
      ),
      narrationStep(
        'cyan',
        'sec 代换的三角形',
        '如果 x 等于 a sec θ，就说明 sec θ 等于 x 除以 a。斜边是 x，邻边是 a，对边就是根号 x 平方减 a 平方。',
      ),
      narrationStep(
        'yellow',
        '回代检查',
        '最后答案如果还停在 θ，就还没有回到原题。要么用三角形读出三角函数，要么用反三角函数把角写回 x。',
      ),
      narrationStep('yellow', '一条原则', '三角形不是装饰，它是把 θ 世界翻译回 x 世界的字典。'),
    ],
  ],
  [
    6,
    [
      narrationStep(
        'red',
        '半圆型根号',
        '这道基础例题是 a 平方减 x 平方的形状，也就是半圆面积里常见的根号。因此第一反应是 sin 代换。',
      ),
      narrationStep(
        'lime',
        '写出代换和 dx',
        '令 x 等于 a sin θ，同时 dx 等于 a cos θ dθ。代换一写出来，就要把 dx 也一起带上。',
      ),
      narrationStep(
        'blue',
        '根号化简',
        '根号里提出 a 平方以后，剩下一减 sin 平方 θ，也就是 cos 平方 θ。开根号后，根号变成 a cos θ。',
      ),
      narrationStep(
        'cyan',
        '积分变成三角积分',
        '根号给出一个 a cos θ，dx 又给出一个 a cos θ，所以整个积分变成 a 平方乘 cos 平方 θ 的积分。',
      ),
      narrationStep(
        'yellow',
        '下一步不是结束',
        '到这里根号已经消掉，但积分还没结束。cos 平方不能当作普通 cos 直接积分，下一页要用半角公式收尾。',
      ),
    ],
  ],
  [
    7,
    [
      narrationStep(
        'red',
        '接着处理 cos 平方',
        '这一页接上一页。根号已经处理掉了，现在剩下的是 a 平方乘 cos 平方 θ 的积分。',
      ),
      narrationStep(
        'lime',
        '半角公式',
        '用半角公式把 cos 平方 θ 写成一加 cos 二 θ 的一半。这样就能逐项积分。',
      ),
      narrationStep(
        'blue',
        '积分结果的两部分',
        '积分以后会得到一个 θ 项，再加一个 sin θ cos θ 的项。这两部分对应最后答案里的反三角函数和根号代数项。',
      ),
      narrationStep(
        'cyan',
        '把 θ 换回 x',
        'θ 可以写成 arcsin x 除以 a；sin θ 和 cos θ 则从刚才的三角形里读出来。',
      ),
      narrationStep(
        'yellow',
        '结果结构',
        '所以这类题的答案常常长成两块：一个根号代数项，加上一个反三角函数项。',
      ),
      narrationStep(
        'yellow',
        '理解比背更稳',
        '看到这种结果时不要觉得突兀，它正是半角积分和三角形回代共同产生的。',
      ),
    ],
  ],
  [
    8,
    [
      narrationStep(
        'red',
        '识别 a 的值',
        '这题分母是根号四减 x 平方，也就是 a 平方减 x 平方的形状，其中 a 等于二。',
      ),
      narrationStep(
        'lime',
        '选择 sin 代换',
        '所以令 x 等于二 sin θ，dx 就等于二 cos θ dθ。代换选择来自根号形状，不是临时猜的。',
      ),
      narrationStep(
        'blue',
        '根号和 dx 抵消',
        '根号会变成二 cos θ，正好和 dx 中的二 cos θ 配合。分母的根号被消掉以后，积分明显简单很多。',
      ),
      narrationStep(
        'cyan',
        '如果有上下限',
        '如果题目带上下限，就要把 x 的边界也换成 θ 的边界。例如 x 从零到一时，θ 从零到圆周率六分之一。',
      ),
      narrationStep(
        'yellow',
        '最后还是三角积分',
        '整理后会出现 sin 平方 θ，所以最后仍然要用半角公式。逆换元法常常是先消根号，再处理三角积分。',
      ),
    ],
  ],
  [
    9,
    [
      narrationStep(
        'red',
        '定积分也要换边界',
        '逆换元如果出现在定积分里，也要处理上下限。只是这次新变量通常是 θ。',
      ),
      narrationStep(
        'lime',
        'sin 代换的边界',
        'sin 代换时，用 sin θ 等于 x 除以 a 来换边界。这样积分可以直接在 θ 世界里完成。',
      ),
      narrationStep(
        'blue',
        'tan 代换的边界',
        'tan 代换时，用 tan θ 等于 x 除以 a 来换边界。边界转换仍然来自代换本身。',
      ),
      narrationStep(
        'cyan',
        'sec 代换的边界',
        'sec 代换时，有时用反 sec，有时直接用三角形读角度。重点是选定一个一致的 θ 区间。',
      ),
      narrationStep(
        'yellow',
        '边界规则',
        '如果你不换回 x，而是直接在 θ 上积分，那么上下限必须也换成 θ。变量和边界要在同一个世界里。',
      ),
    ],
  ],
  [
    10,
    [
      narrationStep(
        'red',
        '平方和形状',
        '这一页处理平方和。根号里是 x 平方加十六，也就是 x 平方加 a 平方，其中 a 等于四。',
      ),
      narrationStep(
        'lime',
        '为什么选 tan',
        '平方和对应 tan 代换，因为一加 tan 平方等于 sec 平方。令 x 等于四 tan θ，根号就会朝 sec θ 化简。',
      ),
      narrationStep(
        'blue',
        '根号化成 sec',
        '把十六提出去以后，根号里剩下一加 tan 平方 θ，也就是 sec 平方 θ，所以根号变成四 sec θ。',
      ),
      narrationStep(
        'cyan',
        '整理到三角积分',
        'dx 会带出 sec 平方 θ。整理以后可能出现 sec 三次方这类积分，说明根号部分已经处理完，剩下的是三角积分技巧。',
      ),
      narrationStep(
        'yellow',
        '本页重点',
        '这一页的重点不是背 sec 三次方积分，而是看清平方和怎样通过 tan 代换把根号消掉。',
      ),
    ],
  ],
  [
    11,
    [
      narrationStep(
        'red',
        '变量平方在前',
        '这一页处理 x 平方减 a 平方。因为变量平方在前，通常用 sec 代换。',
      ),
      narrationStep(
        'lime',
        '选择 sec 代换',
        '令 x 等于 a sec θ，dx 就会带出 a sec θ tan θ dθ。这个形式会和根号化简后的 tan θ 配合。',
      ),
      narrationStep(
        'blue',
        '根号变 tan',
        '根号里提出 a 平方后，剩下 sec 平方 θ 减一，也就是 tan 平方 θ，所以根号变成 a tan θ。',
      ),
      narrationStep(
        'cyan',
        '回代三角形',
        '回代时，邻边是 a，斜边是 x，对边就是根号 x 平方减 a 平方。这样 tan、sec 都能回到 x。',
      ),
      narrationStep(
        'yellow',
        '适用范围',
        '这类根号通常要求 x 的绝对值至少是 a。范围不是小事，它决定 sec 代换和三角形关系是否自然一致。',
      ),
      narrationStep('yellow', '方法收束', '所以 x 平方减 a 平方这类题，要同时看形状和变量范围。'),
    ],
  ],
  [
    12,
    [
      narrationStep(
        'red',
        '先识别隐藏结构',
        '这道题的根号是九 x 平方减一。它看起来不是标准形状，但其实是三 x 的平方减一。',
      ),
      narrationStep(
        'lime',
        '把三 x 当作 sec',
        '既然结构是某个量的平方减一，就可以令三 x 等于 sec θ，也就是 x 等于三分之一 sec θ。',
      ),
      narrationStep(
        'blue',
        'dx 里的常数',
        '求 dx 时要保留三分之一这个常数。dx 等于三分之一 sec θ tan θ dθ，常数不能丢。',
      ),
      narrationStep(
        'cyan',
        '根号化简',
        '根号里的 sec 平方减一会变成 tan 平方，所以根号化成 tan θ。复杂根号就变成普通三角函数。',
      ),
      narrationStep(
        'yellow',
        '整理要慢',
        '最后整理时先看 sec 和 tan 的幂次能不能约分，再决定是否还需要三角恒等式或降幂公式。',
      ),
    ],
  ],
  [
    13,
    [
      narrationStep(
        'red',
        '二次式先配方',
        '有些根号不是一眼就是三种标准形状。遇到一般二次式时，先考虑配方。',
      ),
      narrationStep(
        'lime',
        '完成平方',
        '把五加四 x 减 x 平方整理成九减 x 减二的平方。配方之后，根号形状才真正显出来。',
      ),
      narrationStep(
        'blue',
        '识别标准形状',
        '现在它是 a 平方减某个平方的形状，其中 a 等于三，那个被平方的整体是 x 减二。',
      ),
      narrationStep(
        'cyan',
        '代换整个表达式',
        '所以不是令 x 等于三 sin θ，而是令 x 减二等于三 sin θ。dx 仍然可以顺着这个关系改写。',
      ),
      narrationStep(
        'yellow',
        '配方后的流程',
        '本页的顺序是：先配方，再认形状，再选代换。不要在二次式还没整理时急着套表。',
      ),
    ],
  ],
  [
    14,
    [
      narrationStep(
        'red',
        '看结果结构',
        '这一页不是让你死背结果表，而是看三类根号的答案通常会长成什么样。',
      ),
      narrationStep(
        'lime',
        'a 平方减 x 平方',
        '第一类 a 平方减 x 平方，结果常常有一个根号代数项，再加一个 arcsin 项。这来自 sin 代换和半角积分。',
      ),
      narrationStep(
        'blue',
        'a 平方加 x 平方',
        '第二类平方和，结果里常出现对数项。这通常和 tan 代换之后的 sec 积分有关。',
      ),
      narrationStep(
        'cyan',
        'x 平方减 a 平方',
        '第三类 x 平方减 a 平方，也常带对数项，但对应的是 sec 代换，根号结构和适用区间都不同。',
      ),
      narrationStep(
        'yellow',
        '会推比会背重要',
        '公式可以速记，但更重要的是知道它们从哪种代换推出来。忘了表格时，才能靠形状重新推回去。',
      ),
    ],
  ],
  [
    15,
    [
      narrationStep(
        'red',
        '选择流程',
        '这一页把选择动作整理成流程。逆换元最怕一上来乱背，最稳的是先认形状。',
      ),
      narrationStep(
        'lime',
        '先看是否要配方',
        '第一步看根号里是不是标准二次形状。如果不是，就先配方，把它整理成平方差或平方和。',
      ),
      narrationStep(
        'blue',
        '再看三种形状',
        '第二步区分三种形状：a 平方减 x 平方，a 平方加 x 平方，或者 x 平方减 a 平方。',
      ),
      narrationStep(
        'cyan',
        '最后选代换',
        '第三步才选代换：平方差配 sin，平方和配 tan，x 平方减 a 平方配 sec。',
      ),
      narrationStep(
        'yellow',
        '排错清单',
        '做完以后检查：dx 有没有改，根号有没有真的消掉，范围或上下限有没有一致，最后 θ 有没有换回 x。',
      ),
      narrationStep('yellow', '流程的价值', '有了这条流程，逆换元就不是记忆题，而是形状识别题。'),
    ],
  ],
  [
    16,
    [
      narrationStep(
        'red',
        '先判断再计算',
        '综合练习先训练判断。每题先说出根号形状和代换，再进入计算。',
      ),
      narrationStep(
        'lime',
        '练习一',
        '第一题是九减 x 平方，对应 a 平方减 x 平方，所以选 x 等于三 sin θ。',
      ),
      narrationStep(
        'blue',
        '练习二',
        '第二题是 x 平方加二十五，对应平方和，所以选 x 等于五 tan θ。',
      ),
      narrationStep(
        'cyan',
        '练习三',
        '第三题是 x 平方减十六，对应 x 平方减 a 平方，所以选 x 等于四 sec θ。',
      ),
      narrationStep(
        'yellow',
        '完整顺序',
        '每道题都按同一条线走：认形状，写代换，改 dx，化简积分，最后回代。',
      ),
    ],
  ],
  [
    17,
    [
      narrationStep(
        'red',
        '三件事收束',
        '最后一页把逆换元法收束成三件事。只要这三件事清楚，它就不是一张难背的公式表。',
      ),
      narrationStep(
        'lime',
        '第一件事：认形状',
        '第一件事是认形状。三种根号形状决定了后面该用 sin、tan 还是 sec。',
      ),
      narrationStep(
        'blue',
        '第二件事：消根号',
        '第二件事是消根号。选择合适代换以后，根号会变成普通三角函数，这是整套方法的核心目的。',
      ),
      narrationStep(
        'cyan',
        '第三件事：换回来',
        '第三件事是换回 x。积分结束后，答案不能停在 θ，要用三角形或者反三角函数回到原变量。',
      ),
      narrationStep(
        'yellow',
        '最终检查',
        '最后用四个问题检查：形状对不对，dx 改得对不对，范围或上下限对不对，最后回代对不对。',
      ),
      narrationStep(
        'yellow',
        '最后一句',
        '逆换元的本质，是用三角恒等式把根号变简单，再把临时引入的角完整翻译回原变量。',
      ),
    ],
  ],
]);

const PAGE_NARRATION_DETAILS = new Map([
  [
    1,
    [
      extraNarration(
        '普通换元卡在哪里',
        'lime',
        '卡住的是微分配套',
        '普通换元失败时，通常不是 u 不能设，而是 du 带出的因子在原题里配不上。根号型积分常常就卡在这里。',
      ),
      extraNarration(
        '先认根号形状',
        'blue',
        '形状决定方向',
        '逆换元的入口是形状识别。先把根号里的二次式看成平方差或平方和，后面的三角函数选择才有依据。',
      ),
      extraNarration(
        '三角恒等式救场',
        'cyan',
        '目标是制造平方',
        '三角代换不是为了把题目变成三角题，而是借恒等式制造完全平方。根号能开出来，才是这一步的价值。',
      ),
    ],
  ],
  [
    2,
    [
      extraNarration(
        '一减平方',
        'lime',
        '平方差对应 cos',
        '当 x 被写成 a sin θ，a 平方减 x 平方里会出现一减 sin 平方 θ。这个东西正好变成 cos 平方 θ。',
      ),
      extraNarration(
        '一加平方',
        'blue',
        '平方和对应 sec',
        'tan 代换的好处，是一加 tan 平方会变成 sec 平方。根号开出来以后，平方和就不再是根号里的障碍。',
      ),
      extraNarration(
        '平方减一',
        'cyan',
        '变量平方在前要换视角',
        'x 平方减 a 平方不是一减平方，而是 sec 平方减一的形状。这个方向一反，代换也要从 sin 换成 sec。',
      ),
    ],
  ],
  [
    3,
    [
      extraNarration(
        'a 平方减 x 平方',
        'lime',
        '先看 a 是谁',
        '用这条字典前先把常数写成 a 平方。认出 a 之后，x 等于 a sin θ 才能把比例对齐。',
      ),
      extraNarration(
        'a 平方加 x 平方',
        'blue',
        '平方和不会变成 cos',
        '平方和没有办法靠 sin 直接变成一减平方，所以转向 tan。选择 tan 是因为它天然带来一加 tan 平方。',
      ),
      extraNarration(
        'x 平方减 a 平方',
        'cyan',
        'sec 代换有范围意识',
        'sec 代换通常配合 |x| 至少为 a 的区间。范围说清楚，根号开出来时三角函数的符号才不会含糊。',
      ),
    ],
  ],
  [
    4,
    [
      extraNarration(
        'sin 代换的 dx',
        'lime',
        'dx 会参与抵消',
        'dx 里的 cos θ 不是附属信息。很多题里，根号化出的 cos θ 会和 dx 的 cos θ 一起决定最后的三角积分。',
      ),
      extraNarration(
        'tan 代换的 dx',
        'blue',
        'sec 平方来自导数',
        'tan 的导数是 sec 平方，所以平方和代换后常常会出现 sec 的高次幂。看到它不要慌，这是代换自然带来的。',
      ),
      extraNarration(
        '完整替换',
        'yellow',
        '三处同时检查',
        '每完成一次代换，就扫三处：原来的 x、根号、dx。三处都进入 θ 世界，才算真正换完。',
      ),
    ],
  ],
  [
    5,
    [
      extraNarration(
        'sin 代换的三角形',
        'lime',
        '邻边由勾股定理来',
        '对边和斜边确定以后，邻边不是猜的，而是用勾股定理算出根号 a 平方减 x 平方。',
      ),
      extraNarration(
        'tan 代换的三角形',
        'blue',
        'tan 三角形读 sec',
        'tan θ 等于对边除以邻边。画出三角形后，sec θ、cos θ 这些需要回代的量都能从边长读出来。',
      ),
      extraNarration(
        '回代检查',
        'yellow',
        'θ 不能留到最后',
        '不定积分的最终答案要回到 x。只要还看到 θ，就问自己还能不能用三角形或反三角函数继续翻译。',
      ),
    ],
  ],
  [
    6,
    [
      extraNarration(
        '写出代换和 dx',
        'lime',
        'a 要全程保留',
        '这里 a 不是一就不能省。x、dx、根号三处都会带着 a，少写一个 a，最后系数就会错。',
      ),
      extraNarration(
        '根号化简',
        'blue',
        '开根号要注意符号',
        '从 cos 平方开到 cos θ，通常默认 θ 在合适区间里让 cos θ 非负。这个区间选择是三角代换的一部分。',
      ),
      extraNarration(
        '积分变成三角积分',
        'cyan',
        '根号消失不是终点',
        '逆换元只负责把根号变简单。变成三角积分以后，还要继续用三角恒等式或已知积分公式完成计算。',
      ),
    ],
  ],
  [
    7,
    [
      extraNarration(
        '半角公式',
        'lime',
        '为什么不用直接反导',
        'cos 平方不是基础反导公式里的单个 cos。用半角公式，是把平方降成常数项加普通余弦项。',
      ),
      extraNarration(
        '积分结果的两部分',
        'blue',
        '两部分来源不同',
        'θ 项来自常数的一半，sin θ cos θ 项来自余弦二倍角的积分。最后答案的两块结构就是这样来的。',
      ),
      extraNarration(
        '把 θ 换回 x',
        'cyan',
        '角和边要分别回代',
        'θ 本身用 arcsin 表示，而 sin θ、cos θ 这些边长比例用三角形表示。不要把两种回代混在一起。',
      ),
    ],
  ],
  [
    8,
    [
      extraNarration(
        '选择 sin 代换',
        'lime',
        '二决定三角形比例',
        'a 等于二，所以三角形里斜边会是二。这个二后面会同时影响 dx、根号和边界。',
      ),
      extraNarration(
        '根号和 dx 抵消',
        'blue',
        '抵消后还要整理剩余因子',
        '根号和 dx 中的 cos θ 抵消后，不代表所有三角函数都消失。剩下的 sin 或 cos 仍然要按积分规则处理。',
      ),
      extraNarration(
        '如果有上下限',
        'cyan',
        '角度边界来自反正弦',
        '把 x 边界换成 θ 边界时，用 sin θ 等于 x 除以二。这样上下限和新的积分变量保持一致。',
      ),
    ],
  ],
  [
    9,
    [
      extraNarration(
        'sin 代换的边界',
        'lime',
        '先换边界能省回代',
        '定积分如果一开始就把边界换成 θ，最后可以直接在 θ 上代值，不必把整个原函数换回 x。',
      ),
      extraNarration(
        'sec 代换的边界',
        'cyan',
        'sec 的角度要选清楚',
        'sec 不是一一对应地覆盖所有实数，所以做定积分时要说清楚 θ 的取值区间。区间选好，边界才不含糊。',
      ),
      extraNarration(
        '边界规则',
        'yellow',
        '变量边界同世界',
        '定积分每一步都检查三件事是否同世界：被积函数、微分、上下限。它们一致，计算才有意义。',
      ),
    ],
  ],
  [
    10,
    [
      extraNarration(
        '为什么选 tan',
        'lime',
        '把 x 和常数配成比例',
        '令 x 等于四 tan θ，是为了让 x 平方和十六有共同因子十六。比例配好后，根号里才会出现一加 tan 平方。',
      ),
      extraNarration(
        '根号化成 sec',
        'blue',
        '提出常数再开根号',
        '先把十六提出根号，开根号后变成四。这个常数四要一直跟着，不能只关注三角函数。',
      ),
      extraNarration(
        '整理到三角积分',
        'cyan',
        '剩余积分可能更长',
        'tan 代换有时会留下 sec 三次方这类积分，步骤变长是正常的。它至少已经把根号型难点转成三角积分难点。',
      ),
    ],
  ],
  [
    11,
    [
      extraNarration(
        '选择 sec 代换',
        'lime',
        'sec 负责制造平方减一',
        'x 等于 a sec θ 后，x 平方减 a 平方会变成 a 平方乘 sec 平方减一。这个结构正好落到 tan 平方。',
      ),
      extraNarration(
        '根号变 tan',
        'blue',
        '根号和 dx 常会约分',
        '根号给出 tan θ，dx 也带着 sec θ tan θ。很多 sec 代换例题会在这里出现约分或幂次整理。',
      ),
      extraNarration(
        '适用范围',
        'yellow',
        '范围决定图形可画性',
        '如果 x 的大小不满足根号非负，原题本身就没有实数意义。逆换元前先确认区间，能避免后面三角形矛盾。',
      ),
    ],
  ],
  [
    12,
    [
      extraNarration(
        '先识别隐藏结构',
        'red',
        '先把整体平方看出来',
        '九 x 平方可以看成三 x 的平方。先看出这个整体，题目才会落到标准的平方减一形状。',
      ),
      extraNarration(
        'dx 里的常数',
        'blue',
        '常数来自反解',
        '从 x 等于三分之一 sec θ 出发求 dx，三分之一会自然保留下来。这个常数不是可省略的比例。',
      ),
      extraNarration(
        '整理要慢',
        'yellow',
        '先约分再积分',
        '代换后不要急着套公式，先把 sec 和 tan 的因子约分整理。很多题的难度会在这一步下降。',
      ),
    ],
  ],
  [
    13,
    [
      extraNarration(
        '完成平方',
        'lime',
        '配方要连符号一起处理',
        '这里二次项前面是负号，所以配方时要先把负号整理清楚。否则很容易把九减平方写成平方减九。',
      ),
      extraNarration(
        '识别标准形状',
        'blue',
        '整体变量代替 x',
        '标准形状里的变量不一定是 x 本身，也可以是 x 减二这样的整体。认形状时要允许整体被平方。',
      ),
      extraNarration(
        '代换整个表达式',
        'cyan',
        '平移不改变 dx',
        '令 x 减二等于三 sin θ 时，微分里 dx 等于三 cos θ dθ。常数平移的导数是一，所以不会额外出现项。',
      ),
    ],
  ],
  [
    14,
    [
      extraNarration(
        'a 平方减 x 平方',
        'lime',
        'arcsin 来自角本身',
        '这一类结果里出现 arcsin，是因为最后 θ 要写回 x，而 sin θ 等于 x 除以 a。',
      ),
      extraNarration(
        'a 平方加 x 平方',
        'blue',
        '对数来自 sec 积分',
        '平方和经 tan 代换后常常引出 sec 的积分，而 sec 的原函数会带对数。因此结果里出现对数并不意外。',
      ),
      extraNarration(
        '会推比会背重要',
        'yellow',
        '表格只是压缩结果',
        '结果表可以帮助检查答案，但不能替代推导。只要能从形状重新走代换，就算忘表也能做题。',
      ),
    ],
  ],
  [
    15,
    [
      extraNarration(
        '先看是否要配方',
        'lime',
        '非标准先整理',
        '根号里如果是一般二次式，先不要套三种代换。先配方，让它显出平方差或平方和，再决定代换。',
      ),
      extraNarration(
        '最后选代换',
        'cyan',
        '选择要能消根号',
        '选代换的标准不是名字对应，而是能不能把根号里的表达式变成完全平方。能消根号，选择才算对。',
      ),
      extraNarration(
        '排错清单',
        'yellow',
        '流程结束还要检查',
        '逆换元题结束前要检查四件事：常数比例、dx、上下限或范围、以及 θ 是否已经回到 x。',
      ),
    ],
  ],
  [
    16,
    [
      extraNarration(
        '练习一',
        'lime',
        '先说 a 的值',
        '第一题里 a 等于三。先说出 a，再写 x 等于三 sin θ，这样常数不会在后面的 dx 和根号里丢掉。',
      ),
      extraNarration(
        '练习二',
        'blue',
        '平方和配 tan',
        '第二题用 tan 代换的理由，是一加 tan 平方等于 sec 平方。说出理由，比只写代换更重要。',
      ),
      extraNarration(
        '练习三',
        'cyan',
        '平方减常数配 sec',
        '第三题变量平方在前，常数平方在后，所以用 sec 代换。这里也要注意 x 的取值范围。',
      ),
    ],
  ],
  [
    17,
    [
      extraNarration(
        '第一件事：认形状',
        'lime',
        '认形状先于计算',
        '逆换元的难点经常不在积分本身，而在第一眼有没有把根号形状认出来。形状错，后面全都会偏。',
      ),
      extraNarration(
        '第二件事：消根号',
        'blue',
        '消根号靠恒等式',
        '三角函数只是工具，真正起作用的是恒等式。它把根号里的二次表达式改成平方结构。',
      ),
      extraNarration(
        '第三件事：换回来',
        'cyan',
        '回代保证答案回答原题',
        'θ 是临时语言，x 才是原题语言。最后换回来，是为了让答案真正回答原来的积分。',
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

Generate page ${pageNumber} of a Chinese calculus inverse-substitution notebook as a marker source image. The image itself must contain the colored corner markers; later software will recover the regions and remove the markers.

Hard visible-text rules:
- All visible prose, headings, labels, and question text must be Simplified Chinese.
- Do not write any course code, course name, teacher name, date, page number, or week label.
- Do not write MAT136, Calculus II, Week, 第1周, 页码, Page, or any English prose.
- Do not write component numbers or circled numbers before headings.
- Standard math notation is allowed: x, a, θ, α, sin, cos, tan, sec, arcsin, arctan, arcsec, dx, dθ, √, ∫, C, π.

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
    title: '逆换元法：从根号形状到三角代换',
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
          name: '逆换元法：从根号形状到三角代换',
          description: '第三本中文手绘图片笔记本：逆换元法、三角代换、根号化简与回代。',
          tags: ['MAT136', '逆换元法', '三角代换', '根号化简', '中文笔记', '四角marker'],
          avatarUrl: '/avatars/notebook-agents/avatar8.avif',
          language: 'zh-CN',
          style: 'imagegen-marker-recovered-v2',
          updatedAt: now,
        },
        create: {
          id: NOTEBOOK_ID,
          ownerId: course.ownerId,
          courseId: course.id,
          name: '逆换元法：从根号形状到三角代换',
          description: '第三本中文手绘图片笔记本：逆换元法、三角代换、根号化简与回代。',
          tags: ['MAT136', '逆换元法', '三角代换', '根号化简', '中文笔记', '四角marker'],
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
