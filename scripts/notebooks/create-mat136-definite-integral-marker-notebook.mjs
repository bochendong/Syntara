#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';

const SCRIPT_NAME = 'create-mat136-definite-integral-marker-notebook.mjs';
const SCRIPT_VERSION = '2026-05-29.v1';
const NOTEBOOK_ID = 'queue-mat136-01-definite-integral';
const COURSE_ID = 'cmpanemia001v8ouzmhttvkrn';
const QUEUE_DIR = path.join('tmp', 'notebook-imagegen-queue', 'MAT136', NOTEBOOK_ID);
const PUBLIC_DIR = path.join('public', 'generated-notebooks', NOTEBOOK_ID);
const PUBLIC_PATH = `/generated-notebooks/${NOTEBOOK_ID}`;
const PAGE_COUNT = 10;
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

const MARKER_MATCHERS = [
  { name: 'red', hex: '#ff0000', match: (r, g, b) => r > 180 && g < 85 && b < 85 },
  { name: 'lime', hex: '#00ff00', match: (r, g, b) => g > 170 && r < 90 && b < 95 },
  { name: 'blue', hex: '#0048ff', match: (r, g, b) => b > 145 && r < 90 && g < 140 },
  { name: 'cyan', hex: '#00ffff', match: (r, g, b) => g > 165 && b > 165 && r < 95 },
  { name: 'magenta', hex: '#ff00ff', match: (r, g, b) => r > 170 && b > 130 && g < 95 },
  { name: 'yellow', hex: '#ffff00', match: (r, g, b) => r > 170 && g > 170 && b < 110 },
];

const CHINESE_PAGE_BRIEFS = [
  {
    title: '定积分：从面积近似到计算',
    sceneTitle: '定积分',
    visibleText: [
      'MAT 136',
      'Calculus II',
      '定积分',
      'Week 1',
      '面积近似 -> 黎曼和 -> 定积分 -> 微积分基本定理',
    ],
    layout: [
      '顶部：课程标签、Calculus II、定积分、Week 1。',
      '中部左侧：曲线下方用矩形近似面积。',
      '中部右侧：积分符号连接到 F(b)-F(a)。',
      '底部：面积近似 -> 黎曼和 -> 定积分 -> 微积分基本定理 的路线条。',
    ],
    components: [
      { label: '标题与课程定位', visibleText: ['MAT 136', 'Calculus II', '定积分', 'Week 1'] },
      { label: '曲线下面积与矩形近似', visibleText: ['曲线 y=f(x)', '矩形近似面积'] },
      { label: '定积分到端点差的桥接', visibleText: ['∫_a^b f(x) dx', 'F(b)-F(a)', "F'(x)=f(x)"] },
      {
        label: '本节课路线',
        visibleText: ['面积近似', '黎曼和', '定积分', '微积分基本定理'],
      },
    ],
  },
  {
    title: '如何使用这份笔记',
    sceneTitle: '如何使用这份笔记',
    visibleText: [
      'MAT 136 · Week 1',
      '如何使用这份笔记',
      '辅助理解，不替代练习',
      '配合课堂笔记、作业题、往年题',
      '核心问题：面积怎样变成一个数？',
      '下一页：面积近似',
    ],
    layout: [
      '顶部：MAT 136 标签和标题。',
      '左侧：课堂笔记、作业题、往年题三层材料。',
      '中间：辅助理解，不替代练习 的便签卡。',
      '右侧与底部：面积问题小图和下一页过渡。',
    ],
    components: [
      { label: '标题与使用定位', visibleText: ['如何使用这份笔记'] },
      { label: '学习材料组合', visibleText: ['课堂笔记', '作业题', '往年题'] },
      { label: '辅助理解提醒', visibleText: ['辅助理解，不替代练习'] },
      {
        label: '面积问题与下一页过渡',
        visibleText: ['核心问题：面积怎样变成一个数？', '下一页：面积近似'],
      },
    ],
  },
  {
    title: '面积近似：固定速度',
    sceneTitle: '面积近似',
    visibleText: [
      'MAT 136 · Week 1',
      '面积近似',
      '固定速度',
      '50 miles/hour',
      '4 hours',
      '距离 = 速度 x 时间',
      '50 x 4 = 200 miles',
      '矩形面积 = 高 x 宽',
      '下一页：速度变化怎么办？',
    ],
    layout: [
      '顶部：标题 面积近似。',
      '左侧：小车和固定速度故事。',
      '中间：速度-时间图，水平线 y=50，矩形阴影。',
      '右侧与底部：距离计算和下一页过渡。',
    ],
    components: [
      { label: '标题与问题入口', visibleText: ['面积近似', '固定速度'] },
      { label: '固定速度故事', visibleText: ['50 miles/hour', '4 hours'] },
      { label: '速度时间矩形图', visibleText: ['v=50', '矩形面积'] },
      {
        label: '距离计算与过渡',
        visibleText: ['距离 = 速度 x 时间', '50 x 4 = 200 miles', '下一页：速度变化怎么办？'],
      },
    ],
  },
  {
    title: '速度变化：为什么要切小段',
    sceneTitle: '速度变化',
    visibleText: [
      'MAT 136 · Week 1',
      '速度变化',
      '速度随时间变化',
      '每 0.5 秒取样',
      '每 0.25 秒取样',
      '粗矩形',
      '细矩形',
      '时间间隔越小，近似越好',
      '下一页：左手和与右手和',
    ],
    layout: [
      '顶部：标题 速度变化。',
      '左侧：速度变化提示卡。',
      '中间：0.5 秒粗矩形与 0.25 秒细矩形两个图合为一个组件。',
      '右侧/底部：结论和下一页过渡。',
    ],
    components: [
      { label: '标题与承接问题', visibleText: ['速度变化'] },
      { label: '速度变化提示卡', visibleText: ['速度随时间变化'] },
      {
        label: '粗细矩形对比图',
        visibleText: ['每 0.5 秒取样', '每 0.25 秒取样', '粗矩形', '细矩形'],
      },
      {
        label: '近似结论与过渡',
        visibleText: ['时间间隔越小，近似越好', '下一页：左手和与右手和'],
      },
    ],
  },
  {
    title: '黎曼和：左端点与右端点',
    sceneTitle: '黎曼和',
    visibleText: [
      'MAT 136 · Week 1',
      '黎曼和',
      '左手和',
      '右手和',
      '同一分割，不同高度选择',
      '左端点高度',
      '右端点高度',
      'L_n = f(t0)Δt + f(t1)Δt + ... + f(t_{n-1})Δt',
      'R_n = f(t1)Δt + f(t2)Δt + ... + f(t_n)Δt',
      '下一页：高估还是低估？',
    ],
    layout: [
      '顶部：标题 黎曼和。',
      '上方：左手和与右手和公式卡。',
      '左侧：左端点矩形图。',
      '右侧：右端点矩形图。',
      '底部：同一分割，不同高度选择，并过渡到高估/低估。',
    ],
    components: [
      { label: '标题区', visibleText: ['黎曼和'] },
      { label: '左右端点公式', visibleText: ['L_n', 'R_n'] },
      { label: '左手和图像', visibleText: ['左端点高度'] },
      { label: '右手和图像', visibleText: ['右端点高度'] },
      {
        label: '同一分割的提醒',
        visibleText: ['同一分割，不同高度选择', '下一页：高估还是低估？'],
      },
    ],
  },
  {
    title: '高估 / 低估：先看单调性',
    sceneTitle: '高估与低估',
    visibleText: [
      'MAT 136 · Week 1',
      '总结',
      '高估 / 低估',
      '递增函数',
      '递减函数',
      '左手和',
      '右手和',
      '低估',
      '高估',
      '第一步：判断递增还是递减',
      '第二步：判断左端点还是右端点',
      '下一页：选择正确的黎曼和',
    ],
    layout: [
      '顶部：总结标题。',
      '左侧：递增函数的左/右端点规则。',
      '右侧：递减函数的左/右端点规则。',
      '底部：两步判断法和下一页过渡。',
    ],
    components: [
      { label: '标题与规则目的', visibleText: ['高估 / 低估'] },
      { label: '递增函数规则', visibleText: ['左手和低估', '右手和高估'] },
      { label: '递减函数规则', visibleText: ['左手和高估', '右手和低估'] },
      {
        label: '两步判断法',
        visibleText: ['第一步：判断递增还是递减', '第二步：判断左端点还是右端点'],
      },
      { label: '下一题过渡', visibleText: ['下一页：选择正确的黎曼和'] },
    ],
  },
  {
    title: '例题：识别右手和',
    sceneTitle: '例题：选择右手和',
    visibleText: [
      'MAT 136 · Week 1',
      '例题',
      'v(t)=6√t',
      't=2 到 t=4 的距离',
      '右手和',
      'Δt = 1/2',
      '4 个矩形',
      '右端点：2.5, 3, 3.5, 4',
      '正确选择：i=5 到 8',
      'Σ from i=5 to 8  6√(i/2) · 1/2',
      '下一页：R_n 一定变大吗？',
    ],
    layout: [
      '左侧：题目条件卡。',
      '中间：v(t)=6√t 图像和 [2,4] 上的右端点矩形。',
      '右侧：Δt、矩形个数、右端点清单。',
      '底部：正确选择和求和式。',
      '右下：下一页过渡。',
    ],
    components: [
      { label: '题目条件', visibleText: ['v(t)=6√t', 't=2 到 t=4', '右手和'] },
      { label: '区间与图像', visibleText: ['[2,4]', 'v(t)=6√t'] },
      { label: '右端点选择', visibleText: ['右端点：2.5, 3, 3.5, 4'] },
      {
        label: '答案选择与求和式',
        visibleText: ['正确选择：i=5 到 8', 'Σ from i=5 to 8  6√(i/2) · 1/2'],
      },
      { label: '反例过渡', visibleText: ['下一页：R_n 一定变大吗？'] },
    ],
  },
  {
    title: '反例：右手和一定变大吗？',
    sceneTitle: '反例：右手和',
    visibleText: [
      'MAT 136 · Week 1',
      '例题',
      '命题：递增函数是否总有 R_n ≤ R_{n+1}？',
      '反例：f(x)=x, 区间 [0,1]',
      '右手和',
      'n=3',
      'R_3 = 2/3 ≈ 0.667',
      'n=4',
      'R_4 = 5/8 = 0.625',
      'R_3 > R_4',
      '命题为假',
      '下一页：定义定积分',
    ],
    layout: [
      '顶部：例题标题。',
      '左上：命题卡。',
      '右上：反例选择卡。',
      '左中：n=3 右手和图。',
      '右中：n=4 右手和图。',
      '底部：R_3 > R_4，命题为假，下一页过渡。',
    ],
    components: [
      { label: '命题与任务', visibleText: ['递增函数是否总有 R_n ≤ R_{n+1}？'] },
      { label: '反例选择', visibleText: ['f(x)=x', '[0,1]'] },
      { label: 'n=3 的右手和', visibleText: ['R_3 = 2/3 ≈ 0.667'] },
      { label: 'n=4 的右手和', visibleText: ['R_4 = 5/8 = 0.625'] },
      { label: '反例结论', visibleText: ['R_3 > R_4', '命题为假', '下一页：定义定积分'] },
    ],
  },
  {
    title: '定积分：黎曼和的极限',
    sceneTitle: '定积分',
    visibleText: [
      'MAT 136 · Week 1',
      '定积分',
      'f 在 [a,b] 上连续',
      'a 到 b 的面积',
      '黎曼和变成极限',
      'n 个小区间',
      'n → ∞',
      '∫_a^b f(t) dt',
      '= lim R_n = lim L_n',
      '左手和与右手和趋向同一个值',
      '下一页：积分性质',
    ],
    layout: [
      '顶部：标题 定积分。',
      '左上：定义条件卡。',
      '右上：积分极限公式卡。',
      '中部：粗矩形 -> 细矩形 -> 精确面积的视觉路径。',
      '底部：左右和趋向同一个值与下一页过渡。',
    ],
    components: [
      { label: '标题与定义条件', visibleText: ['定积分', 'f 在 [a,b] 上连续'] },
      { label: '极限公式卡', visibleText: ['∫_a^b f(t) dt', '= lim R_n = lim L_n'] },
      { label: '粗到细的矩形序列', visibleText: ['n 个小区间', 'n → ∞'] },
      { label: '精确面积与共同极限', visibleText: ['左手和与右手和趋向同一个值'] },
      { label: '下一页过渡', visibleText: ['下一页：积分性质'] },
    ],
  },
  {
    title: '积分性质',
    sceneTitle: '积分性质',
    visibleText: [
      'MAT 136 · Week 1',
      '积分性质',
      '1. 相同上下限：∫_a^a f(x) dx = 0',
      '2. 常数倍：∫_a^b c f(x) dx = c ∫_a^b f(x) dx',
      '3. 加法：∫_a^b [f(x)+g(x)] dx = ∫_a^b f(x) dx + ∫_a^b g(x) dx',
      '4. 减法：∫_a^b [f(x)-g(x)] dx = ∫_a^b f(x) dx - ∫_a^b g(x) dx',
      '5. 拆区间：∫_a^b f(x) dx = ∫_a^c f(x) dx + ∫_c^b f(x) dx',
      '6. 变量名不重要',
      '先整理，再计算',
      '下一页：FTC II',
    ],
    layout: [
      '顶部：标题 积分性质。',
      '左侧：相同上下限。',
      '中间：常数倍、加法、减法。',
      '右侧：拆区间和变量名不重要。',
      '底部：先整理，再计算；下一页 FTC II。',
    ],
    components: [
      { label: '标题与相同上下限', visibleText: ['积分性质', '相同上下限：∫_a^a f(x) dx = 0'] },
      { label: '常数倍性质', visibleText: ['常数倍：∫ c f = c ∫ f'] },
      { label: '加法与减法性质', visibleText: ['加法', '减法'] },
      { label: '拆区间与变量名', visibleText: ['拆区间', '变量名不重要'] },
      { label: '整理后再计算', visibleText: ['先整理，再计算', '下一页：FTC II'] },
    ],
  },
];

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

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function usage() {
  return [
    `Usage: node scripts/notebooks/${SCRIPT_NAME} [--prepare-prompts] [--recover] [--seed-db] [--render-contact-sheet]`,
    '',
    'This script does not call image generation APIs. Generate images with Codex built-in imagegen,',
    `save them as ${QUEUE_DIR}/marker-generated/page-XXX.png, then run --recover --seed-db.`,
  ].join('\n');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function pageLabel(pageNumber) {
  return String(pageNumber).padStart(3, '0');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function briefForPage(pageNumber) {
  const brief = CHINESE_PAGE_BRIEFS[pageNumber - 1];
  if (!brief) throw new Error(`Missing Chinese page brief for page ${pageNumber}`);
  return brief;
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function inferRole(label) {
  const text = String(label || '');
  if (/title|header|标题|课程|路线|orientation/i.test(text)) return 'opening';
  if (/formula|公式|expression|property|性质|rule|规则/i.test(text)) return 'formula';
  if (/example|例|counterexample|choice/i.test(text)) return 'example';
  if (/graph|visual|area|rectangle|图|面积|矩形/i.test(text)) return 'visual';
  if (/takeaway|next|transition|总结|下一页/i.test(text)) return 'takeaway';
  return 'setup';
}

function layoutSlot(rect) {
  const top = Number(rect.top || 0);
  const left = Number(rect.left || 0);
  const width = Number(rect.width || 1);
  const centerX = left + width / 2;
  if (top < 120) return 'top-full';
  if (top > 410) return 'bottom-full';
  if (centerX < 330) return 'middle-left';
  if (centerX < 670) return 'middle-center';
  return 'middle-right';
}

function toCanvasRect(rect) {
  return {
    left: round1((Number(rect.left || 0) / CANVAS_WIDTH) * CANVAS_WIDTH),
    top: round1((Number(rect.top || 0) / CANVAS_HEIGHT) * CANVAS_HEIGHT),
    width: round1((Number(rect.width || 1) / CANVAS_WIDTH) * CANVAS_WIDTH),
    height: round1((Number(rect.height || 1) / CANVAS_HEIGHT) * CANVAS_HEIGHT),
  };
}

function componentContent(component) {
  const visible = component.visibleText?.filter(Boolean).join('; ') || component.label;
  const formulas = component.formulas?.filter(Boolean).join('; ');
  return [visible, formulas ? `公式：${formulas}` : '', component.diagramPrompt || '']
    .filter(Boolean)
    .join(' ');
}

function oldFocusRegionsForPage(page) {
  const narrationPath = path.resolve(page.narrationPath);
  if (!fs.existsSync(narrationPath)) return [];
  const narration = readJson(narrationPath);
  return Array.isArray(narration.focusRegions) ? narration.focusRegions : [];
}

function componentPlansForPage(page) {
  const brief = briefForPage(page.pageNumber);
  const oldRegions = oldFocusRegionsForPage(page).slice(0, MARKER_COLORS.length);
  const components = brief.components.slice(0, MARKER_COLORS.length);
  if (oldRegions.length !== components.length) {
    throw new Error(
      `Page ${page.pageNumber} Chinese components (${components.length}) do not match old focus regions (${oldRegions.length})`,
    );
  }
  return oldRegions.slice(0, MARKER_COLORS.length).map((region, index) => {
    const color = MARKER_COLORS[index];
    const rect = toCanvasRect(region.rect || region);
    const component = components[index] || {};
    const label = component.label || `组件 ${index + 1}`;
    const visibleText = Array.isArray(component.visibleText)
      ? component.visibleText.filter(Boolean)
      : [label];
    return {
      id: region.id || `${NOTEBOOK_ID}-p${pageLabel(page.pageNumber)}-component-${index + 1}`,
      label,
      role: inferRole(label),
      order: index + 1,
      layoutSlot: layoutSlot(rect),
      markerColorName: color.name,
      markerColorHex: color.hex,
      visibleText,
      formulas: Array.isArray(component.formulas) ? component.formulas.filter(Boolean) : [],
      diagramPrompt:
        component.diagramPrompt || `把“${label}”画成一个紧凑、独立、可讲解的中文课堂笔记区域。`,
      participatesInMask: true,
      plannedRect: rect,
    };
  });
}

function compilePageBrief(page, brief) {
  return [
    `页标题：${brief.title}`,
    '',
    '必须出现的中文/数学文字：',
    ...brief.visibleText.map((text) => `- ${text}`),
    '',
    '页面布局：',
    ...brief.layout.map((item) => `- ${item}`),
    '',
    '组件要求：',
    ...brief.components.map((component, index) => {
      const visible = component.visibleText.join('；');
      return `${index + 1}. ${component.label}：${visible}`;
    }),
  ].join('\n');
}

function compileMarkerPrompt(page, componentPlans) {
  const brief = briefForPage(page.pageNumber);
  const markerSummary = componentPlans
    .map(
      (component, index) =>
        `${index + 1}. ${component.label}\n   Marker color: pure ${component.markerColorName} ${component.markerColorHex}\n   Content: ${componentContent(component)}\n   Put four ${component.markerColorName} corner markers around this whole component.`,
    )
    .join('\n\n');
  const validationCounts = componentPlans
    .map((component) => `4 ${component.markerColorName}`)
    .join(', ');
  return [
    'Use case: scientific-educational',
    'Asset type: 16:9 中文手绘课程笔记页，带可恢复四角 marker',
    '',
    'Primary request / 主要任务：',
    `生成一页 MAT 136 Calculus II 中文手绘笔记，第 ${page.pageNumber} 页。整页必须像普通中文课堂笔记，只有参与遮罩恢复的学习组件旁边带四个很小的彩色角点。`,
    `Slide title / 页面标题：${brief.title}`,
    '',
    'Chinese page brief / 中文页面规划：',
    compilePageBrief(page, brief),
    '',
    'Student-visible style / 学生可见风格：',
    '- 白色方格笔记本背景，浅灰细网格。',
    '- 常见大学课程手绘笔记风格，清楚、轻松、不要像海报。',
    '- 可见文字必须以简体中文为主；只允许保留 MAT 136、Calculus II、Week 1、函数名、变量和标准数学记号。',
    '- 不要把中文内容翻译成英文。',
    '- 使用黑色马克笔文字、深青绿色图像、浅青绿色填充、低饱和棕色箭头、少量琥珀色装饰。',
    '- 普通内容禁止使用纯红、纯绿、纯蓝、纯青、纯品红、纯黄。',
    '- 无照片真实感、无 UI 外壳、无水印、无学校 logo、无二维码。',
    '',
    'Layout / 布局：',
    '- 按中文页面规划布局，把组件画成紧凑的矩形学习区域，区域之间留出明显空白。',
    '- 标题区和下方组件之间至少留出约 40 px 空白；相邻组件之间至少留出约 35 px 空白。',
    '- 每个 marker-tracked 组件必须保持在一个简单的逻辑矩形区域中。',
    '- 不要把一个组件拆成多个相距很远的小岛。',
    '- 可以加入少量不影响学习的装饰草图，但装饰物不分配 marker。',
    '- 不要在组件周围画任何彩色边框、彩色括号、彩色引导线或彩色框。',
    '',
    'Corner marker protocol:',
    `- There are exactly ${componentPlans.length} marker-tracked learning components.`,
    '- Each marker-tracked component must have exactly four tiny isolated colored square markers: one near the outer top-left corner, one near top-right, one near bottom-left, and one near bottom-right.',
    '- Place the four markers just outside the visual boundary of that component, as if they mark the component bounding box.',
    '- Markers should be close enough to tightly recover the component area, but not touching text, formulas, graph lines, arrows, or fills.',
    '- Leave at least 30 px of blank low-texture graph-paper background around every marker so it can be removed cleanly.',
    '- Markers are solid colored squares, about 16 px on a 1600x900 image.',
    '- Do not connect the markers with lines.',
    '- Do not draw colored rectangles or colored outlines.',
    `- The only pure-color marks in the entire image should be these ${componentPlans.length * 4} marker squares.`,
    '- The pure marker colors are reserved only for markers: #ff0000, #00ff00, #0048ff, #00ffff, #ff00ff, #ffff00.',
    '- Marker squares must be visible in the original output image; later software will remove them for students.',
    '',
    'Learning components and marker colors:',
    '',
    markerSummary,
    '',
    'Validation target:',
    `The output is valid only if it contains exactly ${componentPlans.length * 4} isolated colored square markers: ${validationCounts}. No colored connecting lines, no colored borders, no missing corner markers, and no extra pure-color marker-like squares.`,
    '',
  ].join('\n');
}

function buildPromptPlan(page, compiledImagePrompt, componentPlans) {
  const promptHash = crypto.createHash('sha256').update(compiledImagePrompt).digest('hex');
  const markerCountsByColor = {};
  for (const component of componentPlans) markerCountsByColor[component.markerColorHex] = 4;
  return {
    schemaVersion: 1,
    canvas: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT, aspectRatio: '16:9' },
    componentPlans: componentPlans.map(({ plannedRect, ...component }) => component),
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
      markerCountsByColor,
      forbiddenVisibleMarks: [
        'colored connecting lines',
        'colored component borders',
        'extra pure-color squares outside marker corners',
      ],
    },
    recoveryResult: { status: 'pending' },
  };
}

function preparePrompts() {
  const notebook = readJson(path.join(QUEUE_DIR, 'notebook.json'));
  const promptDir = path.join(QUEUE_DIR, 'marker-prompts');
  const planDir = path.join(QUEUE_DIR, 'prompt-plans');
  ensureDir(promptDir);
  ensureDir(planDir);

  const pages = notebook.pages.slice(0, PAGE_COUNT);
  for (const page of pages) {
    const componentPlans = componentPlansForPage(page);
    if (!componentPlans.length) {
      throw new Error(`Missing focus regions for page ${page.pageNumber}: ${page.narrationPath}`);
    }
    const compiledPrompt = compileMarkerPrompt(page, componentPlans);
    const promptPlan = buildPromptPlan(page, compiledPrompt, componentPlans);
    const label = pageLabel(page.pageNumber);
    fs.writeFileSync(path.join(promptDir, `page-${label}.prompt.md`), compiledPrompt);
    writeJson(path.join(planDir, `page-${label}.prompt-plan.json`), promptPlan);
  }
  console.log(`[prompts] wrote ${pages.length} marker prompts to ${promptDir}`);
}

async function decodeRawImage(filePath) {
  const { data, info } = await sharp(filePath)
    .resize(SOURCE_WIDTH, SOURCE_HEIGHT, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function componentsForColor(raw, matcher) {
  const mask = new Uint8Array(raw.width * raw.height);
  for (let i = 0, p = 0; i < raw.data.length; i += 3, p += 1) {
    if (matcher.match(raw.data[i] || 0, raw.data[i + 1] || 0, raw.data[i + 2] || 0)) {
      mask[p] = 1;
    }
  }

  const seen = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  const components = [];
  for (let y = 0; y < raw.height; y += 1) {
    for (let x = 0; x < raw.width; x += 1) {
      const idx = y * raw.width + x;
      if (!mask[idx] || seen[idx]) continue;
      let head = 0;
      let tail = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let area = 0;
      queue[tail] = idx;
      tail += 1;
      seen[idx] = 1;
      while (head < tail) {
        const cur = queue[head] || 0;
        head += 1;
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
            queue[tail] = ni;
            tail += 1;
          }
        }
      }
      const width = maxX - minX + 1;
      const height = maxY - minY + 1;
      if (area >= 18 && width >= 4 && height >= 4) {
        components.push({ minX, minY, maxX, maxY, width, height, area });
      }
    }
  }
  return components;
}

function isCompactCornerMarker(component) {
  const aspect = component.width / Math.max(1, component.height);
  const fillRatio = component.area / Math.max(1, component.width * component.height);
  return (
    component.width >= 5 &&
    component.height >= 5 &&
    component.width <= 80 &&
    component.height <= 80 &&
    aspect >= 0.35 &&
    aspect <= 2.85 &&
    fillRatio >= 0.16
  );
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

function selectCornerHitsFromComponents(components) {
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
        const nx = (center.x - left) / Math.max(1, width);
        const ny = (center.y - top) / Math.max(1, height);
        return { corner, component, score: cornerScore(corner, nx, ny) };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, Math.min(8, components.length)),
  );

  let bestHits = [];
  let bestScore = Number.POSITIVE_INFINITY;
  const used = new Set();
  const current = [];
  const search = (cornerIndex, score) => {
    if (score >= bestScore) return;
    if (cornerIndex >= corners.length) {
      bestHits = current.slice();
      bestScore = score;
      return;
    }
    for (const candidate of candidatesByCorner[cornerIndex] || []) {
      if (used.has(candidate.component)) continue;
      used.add(candidate.component);
      current.push({ corner: candidate.corner, component: candidate.component });
      search(cornerIndex + 1, score + candidate.score);
      current.pop();
      used.delete(candidate.component);
    }
  };
  search(0, 0);
  return bestHits.length === 4 ? bestHits : [];
}

function bboxFromComponents(components) {
  if (!components.length) return undefined;
  return [
    Math.min(...components.map((component) => component.minX)),
    Math.min(...components.map((component) => component.minY)),
    Math.max(...components.map((component) => component.maxX)),
    Math.max(...components.map((component) => component.maxY)),
  ].map(round1);
}

function fallbackCornerHits(components) {
  return components.map((component) => ({ corner: 'estimated', component }));
}

function toCanvasBbox(bbox, raw) {
  const scaleX = CANVAS_WIDTH / raw.width;
  const scaleY = CANVAS_HEIGHT / raw.height;
  return [
    round1(bbox[0] * scaleX),
    round1(bbox[1] * scaleY),
    round1(bbox[2] * scaleX),
    round1(bbox[3] * scaleY),
  ];
}

function median(values, fallback = 248) {
  if (!values.length) return fallback;
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] || fallback;
}

function isAnyMarkerPixel(r, g, b) {
  return MARKER_MATCHERS.some((matcher) => matcher.match(r, g, b));
}

async function cleanMarkerImage(raw, markerComponents) {
  const out = Buffer.from(raw.data);
  for (const component of markerComponents) {
    const pad = 6;
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
        if (isAnyMarkerPixel(r, g, b)) continue;
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
  return sharp(out, { raw: { width: raw.width, height: raw.height, channels: 3 } })
    .png()
    .toBuffer();
}

function matcherForHex(hex) {
  return MARKER_MATCHERS.find((matcher) => matcher.hex === String(hex || '').toLowerCase());
}

async function recoverPage(pageNumber) {
  const label = pageLabel(pageNumber);
  const markerImagePath = path.join(QUEUE_DIR, 'marker-generated', `page-${label}.png`);
  const promptPlanPath = path.join(QUEUE_DIR, 'prompt-plans', `page-${label}.prompt-plan.json`);
  if (!fs.existsSync(markerImagePath))
    throw new Error(`Missing marker-generated image: ${markerImagePath}`);
  if (!fs.existsSync(promptPlanPath)) throw new Error(`Missing prompt plan: ${promptPlanPath}`);

  ensureDir(PUBLIC_DIR);
  const markerPublicFile = path.join(PUBLIC_DIR, `marker-slide-${label}.png`);
  const studentPublicFile = path.join(PUBLIC_DIR, `slide-${label}.png`);
  await sharp(markerImagePath)
    .resize(SOURCE_WIDTH, SOURCE_HEIGHT, { fit: 'fill' })
    .png()
    .toFile(markerPublicFile);

  const promptPlan = readJson(promptPlanPath);
  const raw = await decodeRawImage(markerPublicFile);
  const findings = [];
  const recoveredComponents = [];
  const cleanComponents = [];
  const componentPlans = promptPlan.componentPlans.filter(
    (component) => component.participatesInMask,
  );

  for (const component of componentPlans) {
    const matcher = matcherForHex(component.markerColorHex);
    if (!matcher) continue;
    const components = componentsForColor(raw, matcher);
    const compactComponents = components.filter(isCompactCornerMarker);
    cleanComponents.push(...components);
    const hits = selectCornerHitsFromComponents(compactComponents);
    const usableHits =
      hits.length === 4
        ? hits
        : compactComponents.length >= 3
          ? fallbackCornerHits(compactComponents)
          : [];
    const sourceBbox =
      usableHits.length >= 3
        ? bboxFromComponents(usableHits.map((hit) => hit.component))
        : undefined;
    const canvasBbox = sourceBbox ? toCanvasBbox(sourceBbox, raw) : undefined;
    if (!canvasBbox) {
      findings.push(
        `${component.label}: expected 4 isolated ${component.markerColorName} corner markers, recovered ${compactComponents.length}; skipped this component region.`,
      );
    } else if (hits.length !== 4) {
      findings.push(
        `${component.label}: recovered ${compactComponents.length} ${component.markerColorName} marker-like squares; using estimated bbox from available markers.`,
      );
    } else if (compactComponents.length !== 4) {
      findings.push(
        `${component.label}: recovered ${compactComponents.length} ${component.markerColorName} marker-like squares; using 4 best corner candidates.`,
      );
    }
    recoveredComponents.push({
      componentId: component.id,
      markerColorHex: matcher.hex,
      bbox: canvasBbox,
      markerPoints: usableHits.map((hit) => {
        const center = componentCenter(hit.component);
        return {
          x: round1((center.x / raw.width) * CANVAS_WIDTH),
          y: round1((center.y / raw.height) * CANVAS_HEIGHT),
          corner: hit.corner,
        };
      }),
      markerCount: compactComponents.length,
    });
  }

  const recoveredRegionCount = recoveredComponents.filter((component) => component.bbox).length;
  const cleanBuffer = await cleanMarkerImage(raw, cleanComponents);
  await sharp(cleanBuffer)
    .resize(SOURCE_WIDTH, SOURCE_HEIGHT, { fit: 'fill' })
    .png()
    .toFile(studentPublicFile);

  const recoveryResult = {
    status: findings.length ? (recoveredRegionCount > 0 ? 'partial' : 'failed') : 'passed',
    recoveredAt: Date.now(),
    originalMarkerImageUrl: `${PUBLIC_PATH}/marker-slide-${label}.png`,
    originalMarkerImageDimensions: { width: raw.width, height: raw.height },
    findings,
    components: recoveredComponents,
  };
  const nextPromptPlan = { ...promptPlan, recoveryResult };
  writeJson(promptPlanPath, nextPromptPlan);
  return { promptPlan: nextPromptPlan, recoveredRegionCount, findings };
}

async function recoverImages() {
  const summary = [];
  for (let pageNumber = 1; pageNumber <= PAGE_COUNT; pageNumber += 1) {
    const result = await recoverPage(pageNumber);
    summary.push({ pageNumber, recovered: result.recoveredRegionCount, findings: result.findings });
    console.log(
      `[recover] page-${pageLabel(pageNumber)} recovered=${result.recoveredRegionCount} findings=${result.findings.length}`,
    );
  }
  writeJson(path.join(QUEUE_DIR, 'marker-recovery-summary.json'), summary);
}

function focusRegionsFromPlan(promptPlan) {
  const recoveredById = new Map(
    (promptPlan.recoveryResult?.components || [])
      .filter((component) => component.bbox && (component.markerPoints?.length || 0) >= 3)
      .map((component) => [component.componentId, component]),
  );
  return promptPlan.componentPlans
    .filter((component) => component.participatesInMask)
    .flatMap((component, index) => {
      const recovered = recoveredById.get(component.id);
      const bbox = recovered?.bbox;
      if (!bbox) return [];
      const left = Math.max(0, Math.min(CANVAS_WIDTH - 1, bbox[0]));
      const top = Math.max(0, Math.min(CANVAS_HEIGHT - 1, bbox[1]));
      const right = Math.max(left + 1, Math.min(CANVAS_WIDTH, bbox[2]));
      const bottom = Math.max(top + 1, Math.min(CANVAS_HEIGHT, bbox[3]));
      return {
        id: component.id,
        label: component.label,
        role: component.role,
        left: round1(left),
        top: round1(top),
        width: round1(right - left),
        height: round1(bottom - top),
        order: component.order || index + 1,
      };
    })
    .sort((a, b) => a.order - b.order);
}

function imageElement(pageNumber) {
  const label = pageLabel(pageNumber);
  return {
    id: `${NOTEBOOK_ID}-image-${label}`,
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

function oldActionsForPage(page, focusRegions) {
  const narrationPath = path.resolve(page.narrationPath);
  const narration = readJson(narrationPath);
  const oldFocus = Array.isArray(narration.focusRegions) ? narration.focusRegions : [];
  const focusIds = new Set(focusRegions.map((region) => region.id));
  const regionIdByOldId = new Map(oldFocus.map((region) => [region.id, region.id]));
  const actions = Array.isArray(narration.actions) ? narration.actions : [];
  return actions.flatMap((action) => {
    if (action?.type !== 'spotlight' && action?.type !== 'laser') return [action];
    const id =
      action.elementId || action.targetElementId || action.targetId || action.focusTargetId;
    const nextId = regionIdByOldId.get(id);
    if (!nextId || !focusIds.has(nextId)) return [];
    return [{ ...action, elementId: nextId }];
  });
}

function canvasFor(pageNumber, promptPlan, focusRegions) {
  return {
    id: `${NOTEBOOK_ID}-canvas-${pageLabel(pageNumber)}`,
    viewportSize: CANVAS_WIDTH,
    viewportRatio: 16 / 9,
    theme: {
      backgroundColor: '#ffffff',
      themeColors: ['#0f766e', '#2563eb', '#d97706', '#0f172a'],
      fontColor: '#0f172a',
      fontName: 'Inter',
      outline: { color: '#0f766e', width: 2, style: 'solid' },
      shadow: { h: 0, v: 0, blur: 10, color: '#000000' },
    },
    elements: [imageElement(pageNumber), ...focusRegions.map((region) => hotspotElement(region))],
    background: { type: 'solid', color: '#ffffff' },
    type: 'content',
  };
}

async function seedDb() {
  loadEnvLocal();
  const prisma = new PrismaClient();
  try {
    const course = await prisma.course.findUnique({ where: { id: COURSE_ID } });
    if (!course) throw new Error(`Course not found: ${COURSE_ID}`);
    const notebook = readJson(path.join(QUEUE_DIR, 'notebook.json'));
    const now = new Date();
    await prisma.notebook.upsert({
      where: { id: NOTEBOOK_ID },
      update: {
        ownerId: course.ownerId,
        courseId: course.id,
        name: 'MAT136 定积分',
        description:
          '根据 queue/MAT136/01_Definite_Integral.pdf 重新制作的 MAT 136 中文图片笔记本，包含可恢复四角 marker 聚焦区域。',
        tags: ['MAT136', 'Calculus II', '定积分', '中文笔记', '四角marker'],
        avatarUrl: '/avatars/notebook-agents/avatar8.avif',
        language: 'zh-CN',
        style: 'imagegen-marker-full-slide',
        updatedAt: now,
      },
      create: {
        id: NOTEBOOK_ID,
        ownerId: course.ownerId,
        courseId: course.id,
        name: 'MAT136 定积分',
        description:
          '根据 queue/MAT136/01_Definite_Integral.pdf 重新制作的 MAT 136 中文图片笔记本，包含可恢复四角 marker 聚焦区域。',
        tags: ['MAT136', 'Calculus II', '定积分', '中文笔记', '四角marker'],
        avatarUrl: '/avatars/notebook-agents/avatar8.avif',
        language: 'zh-CN',
        style: 'imagegen-marker-full-slide',
        createdAt: now,
        updatedAt: now,
      },
    });

    const scenes = [];
    for (const page of notebook.pages.slice(0, PAGE_COUNT)) {
      const label = pageLabel(page.pageNumber);
      const promptPlan = readJson(
        path.join(QUEUE_DIR, 'prompt-plans', `page-${label}.prompt-plan.json`),
      );
      const focusRegions = focusRegionsFromPlan(promptPlan);
      const content = {
        type: 'slide',
        canvas: canvasFor(page.pageNumber, promptPlan, focusRegions),
        webRenderMode: 'slide',
        semanticHitMap: {
          version: 1,
          source: 'imagegen-corner-marker-recovery',
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
      };
      const narration = readJson(path.resolve(page.narrationPath));
      const brief = briefForPage(page.pageNumber);
      scenes.push({
        id: `${NOTEBOOK_ID}-p${label}`,
        notebookId: NOTEBOOK_ID,
        title: brief.sceneTitle || narration.sceneTitle || `第 ${page.pageNumber} 页`,
        type: 'slide',
        order: page.pageNumber - 1,
        content,
        actions: oldActionsForPage(page, focusRegions),
        whiteboard: null,
        createdAt: now,
        updatedAt: now,
      });
    }
    await prisma.$transaction([
      prisma.scene.deleteMany({ where: { notebookId: NOTEBOOK_ID } }),
      prisma.scene.createMany({ data: scenes }),
    ]);
    console.log(`[db] seeded ${NOTEBOOK_ID} into course=${course.id} scenes=${scenes.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function renderContactSheet() {
  const columns = 2;
  const thumbWidth = 640;
  const thumbHeight = 360;
  const labelHeight = 34;
  const composites = [];
  for (let pageNumber = 1; pageNumber <= PAGE_COUNT; pageNumber += 1) {
    const label = pageLabel(pageNumber);
    const file = path.join(PUBLIC_DIR, `slide-${label}.png`);
    const labelSvg = `<svg width="${thumbWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="${thumbWidth}" height="${labelHeight}" fill="#0f172a"/><text x="14" y="23" fill="#ffffff" font-size="17" font-family="Arial">Page ${pageNumber}</text></svg>`;
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
      height: Math.ceil(PAGE_COUNT / columns) * (thumbHeight + labelHeight),
      channels: 4,
      background: '#e5e7eb',
    },
  })
    .composite(composites)
    .png()
    .toFile(path.join(PUBLIC_DIR, 'contact-sheet.png'));
  console.log(`[contact-sheet] ${path.join(PUBLIC_DIR, 'contact-sheet.png')}`);
}

async function main() {
  if (hasFlag('--help')) {
    console.log(usage());
    return;
  }
  if (hasFlag('--prepare-prompts')) preparePrompts();
  if (hasFlag('--recover')) await recoverImages();
  if (hasFlag('--seed-db')) await seedDb();
  if (hasFlag('--render-contact-sheet')) await renderContactSheet();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
