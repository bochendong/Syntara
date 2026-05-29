#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const NOTEBOOK_ID = 'nb-mat136-riemann-integral-week1-20260518135718';
const OUT_DIR = path.join(
  'public',
  'generated-notebooks',
  NOTEBOOK_ID,
  'page-plan-prototype',
);
const PUBLIC_DIR = `/generated-notebooks/${NOTEBOOK_ID}/page-plan-prototype`;
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;
const SOURCE_WIDTH = 1600;
const SOURCE_HEIGHT = 900;
const HOTSPOT_PATH = 'M 0 0 L 200 0 L 200 200 L 0 200 Z';

const palette = {
  ink: '#102033',
  mutedInk: '#334155',
  teal: '#0f766e',
  tealDark: '#075b59',
  tealSoft: '#dff6f3',
  tealSofter: '#eefbf9',
  brown: '#8a4b18',
  orange: '#b45309',
  blue: '#1d4ed8',
  paper: '#fffdf8',
  grid: '#d9e2e7',
  yellow: '#fff7bf',
};

const pages = [
  {
    order: 0,
    title: 'MAT 136 · 黎曼积分',
    image: `${PUBLIC_DIR}/slide-01-plan.png`,
    regions: [
      {
        semanticId: 'cover-title',
        label: '封面标题区',
        rect: [56, 30, 850, 105],
        speech:
          '这节课先不急着背定积分符号。我们先看一个更直观的问题：曲线下面的面积，能不能从一堆矩形里长出来。',
      },
      {
        semanticId: 'coarse-rectangles',
        label: '粗分割图',
        rect: [28, 210, 260, 190],
        speech:
          '左边是粗分割。矩形很少，每个矩形都很宽，所以它只是曲线下面积的粗略近似。',
      },
      {
        semanticId: 'finer-rectangles',
        label: '较细分割图',
        rect: [330, 210, 255, 190],
        speech:
          '中间把区间切得更细。矩形数量变多以后，顶边开始更贴近曲线，近似也更可信。',
      },
      {
        semanticId: 'finest-rectangles',
        label: '更细分割图',
        rect: [628, 210, 245, 190],
        speech:
          '右边继续细分。矩形仍然不是曲线本身，但整体轮廓已经在追着曲线走。',
      },
      {
        semanticId: 'stable-area',
        label: '稳定面积数',
        rect: [866, 250, 110, 105],
        speech:
          '最右边的 A 表示我们希望矩形和最终稳定靠近的面积数。后面所有定义都围绕这个稳定性。',
      },
      {
        semanticId: 'lesson-flow',
        label: '课程路线条',
        rect: [60, 445, 880, 74],
        speech:
          '底部路线是今天的顺序：先讲 Riemann sums，再讲 integrability，最后把稳定面积数留给下一节的 definite integral。',
      },
    ],
  },
  {
    order: 1,
    title: '黎曼积分：从矩形到极限',
    image: `${PUBLIC_DIR}/slide-02-plan.png`,
    regions: [
      {
        semanticId: 'page-bridge',
        label: '标题与本页承接',
        rect: [35, 28, 790, 96],
        speech:
          '这一页把第一页的直觉拆成四个动作：面积、分割、采样、网格变细。后面的公式都服务于这四步。',
      },
      {
        semanticId: 'area-as-accumulation',
        label: '面积是累积量',
        rect: [30, 125, 210, 305],
        speech:
          '第一步先把面积看成累积量。曲线下方这块区域不好直接算，但可以被拆成许多小块相加。',
      },
      {
        semanticId: 'partition-card',
        label: '分割区间卡片',
        rect: [270, 125, 215, 305],
        speech:
          '第二步是分割区间。分割 P 告诉我们从 a 到 b 中间在哪里切开，也就是先确定每个矩形的宽度。',
      },
      {
        semanticId: 'sample-card',
        label: '采样点卡片',
        rect: [515, 125, 215, 305],
        speech:
          '第三步是在每个小区间里选择采样点 c_i。函数值 f(c_i) 就成为这一段矩形的高度。',
      },
      {
        semanticId: 'limit-card',
        label: '网格变细卡片',
        rect: [760, 125, 210, 305],
        speech:
          '最后让网格变细。我们关心的不是某一次矩形和，而是分割越来越细时这些和会不会趋向同一个数。',
      },
      {
        semanticId: 'lesson-question',
        label: '底部问题',
        rect: [125, 455, 750, 68],
        speech:
          '底部问题就是今天的主线：矩形和怎样逼近曲线下面积。下一页先解释为什么面积适合被看成累积量。',
      },
    ],
  },
  {
    order: 2,
    title: '面积为什么是累积量？',
    image: `${PUBLIC_DIR}/slide-03-plan.png`,
    regions: [
      {
        semanticId: 'page-bridge',
        label: '标题与承接问题',
        rect: [35, 28, 760, 96],
        speech:
          '要理解黎曼和，先要接受一件事：面积是一种累积量。它可以被拆成局部小贡献再相加。',
      },
      {
        semanticId: 'constant-panel-graph',
        label: '恒定高度图像',
        rect: [35, 135, 425, 195],
        speech:
          '如果高度不变，累积量就是一个矩形。比如速度恒定时，距离等于速度乘时间。',
      },
      {
        semanticId: 'constant-formula',
        label: '速度乘时间',
        rect: [92, 350, 290, 68],
        speech:
          '这个公式在图上就是长乘宽：高度乘以底边长度。它是最简单的面积累积。',
      },
      {
        semanticId: 'changing-panel-graph',
        label: '变化高度图像',
        rect: [505, 135, 460, 195],
        speech:
          '当高度随 x 变化时，一个大矩形不够用了。我们把区间切小，在每一段里用一个矩形近似。',
      },
      {
        semanticId: 'local-approximation',
        label: '局部近似文字',
        rect: [550, 350, 360, 72],
        speech:
          '局部近似的意思是：在很短的一段里，先用一个代表高度当作这一段的高度。',
      },
      {
        semanticId: 'core-summary',
        label: '底部核心想法',
        rect: [105, 462, 790, 70],
        speech:
          '核心想法只有一句：把复杂面积拆成许多简单矩形，再把这些矩形面积全部加起来。',
      },
    ],
  },
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function canvasToSourceRect(rect) {
  return [
    round((rect[0] / CANVAS_WIDTH) * SOURCE_WIDTH),
    round((rect[1] / CANVAS_HEIGHT) * SOURCE_HEIGHT),
    round((rect[2] / CANVAS_WIDTH) * SOURCE_WIDTH),
    round((rect[3] / CANVAS_HEIGHT) * SOURCE_HEIGHT),
  ];
}

function canvasRectObject(rect) {
  return {
    left: rect[0],
    top: rect[1],
    width: rect[2],
    height: rect[3],
  };
}

function pageLabel(order) {
  return String(order + 1).padStart(2, '0');
}

function regionId(page, region) {
  return `${NOTEBOOK_ID}-plan-s${pageLabel(page.order)}-${region.semanticId}`;
}

function textLines(text, maxChars = 16) {
  const raw = String(text);
  const segments = raw.split(/\n/);
  const lines = [];
  for (const segment of segments) {
    let current = '';
    for (const char of segment) {
      const charWeight = /[ -~]/.test(char) ? 0.55 : 1;
      const currentWeight = Array.from(current).reduce(
        (total, item) => total + (/[ -~]/.test(item) ? 0.55 : 1),
        0,
      );
      if (current && currentWeight + charWeight > maxChars) {
        lines.push(current);
        current = char;
      } else {
        current += char;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function textBlock(x, y, lines, options = {}) {
  const size = options.size ?? 20;
  const lineHeight = options.lineHeight ?? size * 1.35;
  const weight = options.weight ?? 500;
  const color = options.color ?? palette.ink;
  const family = options.family ?? `'Kaiti SC', 'STKaiti', 'PingFang SC', sans-serif`;
  const anchor = options.anchor ?? 'start';
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">
${lines
  .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${esc(line)}</tspan>`)
  .join('\n')}
</text>`;
}

function card(x, y, width, height, options = {}) {
  const fill = options.fill ?? 'rgba(255,255,255,0.75)';
  const stroke = options.stroke ?? palette.tealDark;
  const strokeWidth = options.strokeWidth ?? 1.8;
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
}

function arrow(x1, y1, x2, y2, color = palette.brown) {
  return `<path d="M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1 - 3}, ${(x1 + x2) / 2} ${y2 + 3}, ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round" marker-end="url(#arrowHead)"/>`;
}

function graphAxes(x, y, width, height) {
  const left = x + 26;
  const bottom = y + height - 24;
  return `
<path d="M ${left} ${bottom} L ${left} ${y + 18}" stroke="${palette.ink}" stroke-width="2.2" fill="none" marker-end="url(#axisHead)"/>
<path d="M ${x + 12} ${bottom} L ${x + width - 14} ${bottom}" stroke="${palette.ink}" stroke-width="2.2" fill="none" marker-end="url(#axisHead)"/>
${textBlock(left + 8, y + 28, ['f(x)'], { size: 15, weight: 600 })}
${textBlock(x + 38, bottom + 20, ['a'], { size: 15, weight: 600 })}
${textBlock(x + width - 34, bottom + 20, ['b'], { size: 15, weight: 600 })}
`;
}

function curvePath(x, y, width, height) {
  const base = y + height - 70;
  return `M ${x + 55} ${base} C ${x + width * 0.28} ${y + 42}, ${x + width * 0.4} ${
    y + 30
  }, ${x + width * 0.52} ${y + 78} C ${x + width * 0.68} ${y + 130}, ${
    x + width * 0.74
  } ${y + 70}, ${x + width - 44} ${y + 83}`;
}

function rectanglesUnderCurve(x, y, width, height, count, options = {}) {
  const left = x + 46;
  const bottom = y + height - 24;
  const usable = width - 92;
  const rectWidth = usable / count;
  const heights = Array.from({ length: count }, (_, index) => {
    const t = count === 1 ? 0 : index / (count - 1);
    return 42 + Math.sin(t * Math.PI) * 55 + Math.sin(t * Math.PI * 2) * 14;
  });
  const rects = heights
    .map((heightValue, index) => {
      const rx = left + index * rectWidth;
      const ry = bottom - heightValue;
      return `<rect x="${rx}" y="${ry}" width="${rectWidth}" height="${heightValue}" fill="${
        options.fill ?? palette.tealSoft
      }" fill-opacity="0.78" stroke="${palette.tealDark}" stroke-width="1.3"/>`;
    })
    .join('\n');
  const curve = `<path d="${curvePath(x, y, width, height)}" stroke="${palette.tealDark}" stroke-width="2.8" fill="none" stroke-linecap="round"/>`;
  return `${rects}\n${curve}`;
}

function miniGraph(x, y, width, height, count = 5, label = '') {
  return `
${graphAxes(x, y, width, height)}
${rectanglesUnderCurve(x, y, width, height, count)}
${label ? textBlock(x + width / 2, y + height - 5, [label], { size: 18, weight: 700, anchor: 'middle', color: palette.tealDark }) : ''}
`;
}

function areaGraph(x, y, width, height) {
  const bottom = y + height - 28;
  const path = curvePath(x, y, width, height);
  return `
${graphAxes(x, y, width, height)}
<path d="${path} L ${x + width - 44} ${bottom} L ${x + 55} ${bottom} Z" fill="${palette.tealSoft}" opacity="0.82" stroke="none"/>
<path d="${path}" stroke="${palette.tealDark}" stroke-width="2.8" fill="none"/>
${textBlock(x + width / 2, y + height / 2 + 30, ['A'], { size: 30, weight: 700, anchor: 'middle', color: palette.tealDark })}
`;
}

function partitionLine(x, y, width, options = {}) {
  const ticks = options.ticks ?? 6;
  const baseY = y + 52;
  const left = x + 20;
  const right = x + width - 20;
  const tickSvg = Array.from({ length: ticks }, (_, index) => {
    const tx = left + ((right - left) * index) / (ticks - 1);
    const label =
      index === 0 ? 'x₀' : index === ticks - 1 ? 'xₙ' : index === ticks - 2 ? 'xₙ₋₁' : `x${index}`;
    return `<path d="M ${tx} ${baseY - 45} L ${tx} ${baseY + 6}" stroke="${palette.ink}" stroke-dasharray="4 5" stroke-width="1.7"/>
${textBlock(tx, baseY + 25, [label], { size: 14, weight: 600, anchor: 'middle' })}`;
  }).join('\n');
  return `
<path d="M ${left - 8} ${baseY} L ${right + 18} ${baseY}" stroke="${palette.ink}" stroke-width="2.3" marker-end="url(#axisHead)"/>
${tickSvg}
`;
}

function sampleGraph(x, y, width, height) {
  const bottom = y + height - 38;
  const left = x + 42;
  const rx = x + width * 0.36;
  const rw = width * 0.28;
  const rh = height * 0.35;
  return `
${graphAxes(x, y, width, height)}
<rect x="${rx}" y="${bottom - rh}" width="${rw}" height="${rh}" fill="${palette.tealSoft}" stroke="${palette.tealDark}" stroke-width="1.7"/>
<path d="${curvePath(x, y, width, height)}" stroke="${palette.tealDark}" stroke-width="2.8" fill="none"/>
<circle cx="${rx + rw * 0.58}" cy="${bottom - rh - 1}" r="5" fill="${palette.tealDark}"/>
<path d="M ${rx + rw * 0.58} ${bottom - rh - 1} L ${rx + rw * 0.86} ${bottom - rh - 28}" stroke="${palette.tealDark}" stroke-width="1.8"/>
${textBlock(rx + rw * 0.86 + 4, bottom - rh - 28, ['(cᵢ, f(cᵢ))'], { size: 13, color: palette.tealDark, weight: 700 })}
${textBlock(left + 4, bottom - rh / 2, ['f(cᵢ)'], { size: 14, color: palette.tealDark, weight: 700 })}
${textBlock(rx + rw * 0.58, bottom + 22, ['cᵢ'], { size: 14, color: palette.tealDark, weight: 700, anchor: 'middle' })}
`;
}

function refinementStack(x, y, width, height) {
  const rows = [4, 7, 13];
  return rows
    .map((count, index) => {
      const rowY = y + index * (height / 3);
      const rowH = height / 3 - 8;
      const left = x + 10;
      const bottom = rowY + rowH - 6;
      const usable = width * 0.55;
      const rectW = usable / count;
      const bars = Array.from({ length: count }, (_, i) => {
        const t = i / Math.max(1, count - 1);
        const h = 18 + Math.sin(t * Math.PI) * 28 + (1 - t) * 6;
        return `<rect x="${left + i * rectW}" y="${bottom - h}" width="${rectW}" height="${h}" fill="${palette.tealSoft}" stroke="${palette.tealDark}" stroke-width="1"/>`;
      }).join('\n');
      return `
<g>
${bars}
<path d="M ${left} ${bottom} L ${left + usable + 8} ${bottom}" stroke="${palette.ink}" stroke-width="1.6"/>
${arrow(left + usable + 28, bottom - 16, left + usable + 64, bottom - 16, palette.ink)}
${textBlock(left + usable + 78, bottom - 10, [`S(P${index + 1})`], { size: 15, weight: 600 })}
</g>`;
    })
    .join('\n');
}

function svgDefs() {
  return `
<defs>
  <pattern id="smallGrid" width="20" height="20" patternUnits="userSpaceOnUse">
    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="${palette.grid}" stroke-width="0.55" opacity="0.72"/>
  </pattern>
  <marker id="arrowHead" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
    <path d="M0,0 L0,6 L8,3 z" fill="${palette.brown}"/>
  </marker>
  <marker id="axisHead" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
    <path d="M0,0 L0,6 L7,3 z" fill="${palette.ink}"/>
  </marker>
  <filter id="paperShadow" x="-10%" y="-10%" width="120%" height="120%">
    <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#0f172a" flood-opacity="0.08"/>
  </filter>
</defs>`;
}

function baseSvg(content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SOURCE_WIDTH}" height="${SOURCE_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}">
${svgDefs()}
<rect width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" fill="${palette.paper}"/>
<rect width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" fill="url(#smallGrid)" opacity="0.9"/>
${content}
</svg>`;
}

function title(x, y, text, subtitle = null) {
  return `
${textBlock(x, y, [text], { size: 42, weight: 900, color: palette.ink, family: `'Kaiti SC', 'STKaiti', 'PingFang SC', sans-serif` })}
<path d="M ${x - 2} ${y + 18} C ${x + 250} ${y + 10}, ${x + 520} ${y + 20}, ${x + 780} ${y + 14}" stroke="${palette.tealDark}" stroke-width="4" fill="none" stroke-linecap="round"/>
${subtitle ? textBlock(x + 780, y - 3, [subtitle], { size: 22, weight: 800, color: palette.tealDark }) : ''}
`;
}

function pageOne() {
  return baseSvg(`
${title(92, 102, 'MAT 136 · 黎曼积分', 'Week 1')}
${card(190, 150, 610, 45, { strokeWidth: 0, fill: 'rgba(255,255,255,0.4)' })}
${textBlock(500, 180, ['从矩形近似到面积极限'], { size: 30, weight: 900, anchor: 'middle' })}
${miniGraph(28, 220, 260, 170, 4, '粗分割')}
${arrow(300, 305, 326, 305)}
${miniGraph(330, 220, 255, 170, 9, '较细分割')}
${arrow(592, 305, 623, 305)}
${miniGraph(628, 220, 245, 170, 17, '更细分割')}
${arrow(870, 305, 908, 305, palette.ink)}
<circle cx="934" cy="305" r="31" fill="${palette.yellow}" stroke="${palette.orange}" stroke-width="2.5"/>
${textBlock(934, 316, ['A'], { size: 34, weight: 900, anchor: 'middle', color: palette.orange })}
${card(60, 445, 880, 74, { fill: 'rgba(255,255,255,0.76)' })}
${textBlock(118, 493, ['Riemann sums'], { size: 27, weight: 900, color: palette.tealDark })}
${arrow(315, 485, 370, 485, palette.ink)}
${textBlock(402, 493, ['integrability'], { size: 27, weight: 900, color: palette.blue })}
${arrow(610, 485, 665, 485, palette.orange)}
${textBlock(695, 493, ['definite integral'], { size: 27, weight: 900, color: palette.orange })}
`);
}

function pageTwo() {
  return baseSvg(`
${title(290, 58, '黎曼积分：从矩形到极限')}
${card(35, 78, 575, 40, { fill: 'rgba(255,255,255,0.68)' })}
${textBlock(58, 105, ['上一页提出问题：从矩形近似到面积极限。'], { size: 20, weight: 700 })}
${[30, 270, 515, 760]
  .map((x) => card(x, 135, x === 760 ? 210 : 215, 285, { fill: 'rgba(255,255,255,0.7)' }))
  .join('\n')}
${textBlock(56, 172, ['① 面积是累积量'], { size: 20, weight: 900 })}
${textBlock(292, 172, ['② 分割区间'], { size: 20, weight: 900 })}
${textBlock(538, 172, ['③ 选择采样点'], { size: 20, weight: 900 })}
${textBlock(782, 172, ['④ 网格变细，和稳定'], { size: 19, weight: 900 })}
${areaGraph(48, 195, 165, 145)}
${textBlock(54, 375, textLines('曲线下面积可看作对“高度”的累积。', 12), { size: 16, lineHeight: 22 })}
${partitionLine(292, 213, 170, { ticks: 5 })}
${textBlock(294, 325, ['P: a=x₀<...<xₙ=b', 'Δxᵢ=xᵢ−xᵢ₋₁'], { size: 16, lineHeight: 24 })}
${sampleGraph(535, 205, 170, 145)}
${textBlock(538, 375, ['矩形面积 = f(cᵢ) Δxᵢ'], { size: 16, weight: 700 })}
${refinementStack(782, 205, 170, 145)}
${textBlock(784, 375, ['当 ||P|| → 0,', 'S(P) → A'], { size: 17, lineHeight: 25, weight: 700 })}
${card(125, 455, 750, 68, { fill: 'rgba(255,255,255,0.78)' })}
${textBlock(500, 499, ['本节核心问题：矩形和怎样逼近曲线下面积？'], { size: 26, weight: 900, anchor: 'middle' })}
`);
}

function pageThree() {
  return baseSvg(`
${title(315, 58, '面积为什么是累积量？')}
${card(35, 78, 560, 40, { fill: 'rgba(255,255,255,0.68)' })}
${textBlock(58, 105, ['面积可以拆成局部贡献，再把这些贡献相加。'], { size: 20, weight: 700 })}
${card(35, 135, 425, 195, { fill: 'rgba(255,255,255,0.72)' })}
${textBlock(58, 168, ['恒定高度：一个矩形'], { size: 21, weight: 900 })}
${graphAxes(70, 185, 330, 120)}
<rect x="130" y="223" width="185" height="62" fill="${palette.tealSoft}" stroke="${palette.tealDark}" stroke-width="2"/>
${textBlock(223, 260, ['v'], { size: 24, weight: 800, anchor: 'middle', color: palette.tealDark })}
${card(92, 350, 290, 68, { fill: 'rgba(255,255,255,0.78)' })}
${textBlock(237, 391, ['距离 = 速度 × 时间'], { size: 22, weight: 900, anchor: 'middle' })}
${card(505, 135, 460, 195, { fill: 'rgba(255,255,255,0.72)' })}
${textBlock(530, 168, ['变化高度：切成很多小段'], { size: 21, weight: 900 })}
${miniGraph(535, 185, 375, 120, 9)}
${card(550, 350, 360, 72, { fill: 'rgba(255,255,255,0.78)' })}
${textBlock(575, 379, textLines('每一小段先用一个代表高度近似。', 15), { size: 18, lineHeight: 24, weight: 700 })}
${card(105, 462, 790, 70, { fill: 'rgba(255,255,255,0.78)' })}
${textBlock(500, 505, ['复杂面积 → 许多简单矩形 → 全部相加'], { size: 27, weight: 900, anchor: 'middle' })}
`);
}

function svgForPage(page) {
  if (page.order === 0) return pageOne();
  if (page.order === 1) return pageTwo();
  return pageThree();
}

function semanticHitMap() {
  return {
    notebookId: NOTEBOOK_ID,
    source: 'deterministic-page-plan-prototype',
    slides: pages.map((page) => ({
      order: page.order,
      title: page.title,
      image: page.image,
      hitMap: {
        version: 1,
        sourceSize: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT },
        canvasSize: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
        regions: page.regions.map((region) => ({
          id: regionId(page, region),
          semanticId: region.semanticId,
          label: region.label,
          sourceRect: canvasToSourceRect(region.rect),
          canvasRect: canvasRectObject(region.rect),
        })),
      },
    })),
  };
}

function focusShape(page, region) {
  const [left, top, width, height] = region.rect;
  return {
    id: regionId(page, region),
    name: `lecture-focus-generated: ${region.label}`,
    type: 'shape',
    left,
    top,
    width,
    height,
    rotate: 0,
    lock: true,
    viewBox: [200, 200],
    path: HOTSPOT_PATH,
    fixedRatio: false,
    fill: '#ffffff',
    opacity: 0,
    outline: { color: '#ffffff', width: 0, style: 'solid' },
  };
}

function imageElement(page) {
  return {
    id: `${NOTEBOOK_ID}-plan-image-s${pageLabel(page.order)}`,
    type: 'image',
    left: 0,
    top: 0,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    rotate: 0,
    fixedRatio: false,
    src: page.image,
    imageType: 'pageFigure',
    radius: 0,
  };
}

function prototypeScenes() {
  return pages.map((page) => ({
    id: `${NOTEBOOK_ID}-plan-p${pageLabel(page.order)}`,
    title: page.title,
    order: page.order,
    content: {
      type: 'canvas',
      canvas: {
        id: `${NOTEBOOK_ID}-plan-canvas-s${pageLabel(page.order)}`,
        viewportSize: CANVAS_WIDTH,
        viewportRatio: 16 / 9,
        elements: [imageElement(page), ...page.regions.map((region) => focusShape(page, region))],
      },
    },
    actions: page.regions.flatMap((region, index) => [
      {
        id: `${NOTEBOOK_ID}-plan-spotlight-s${pageLabel(page.order)}-${String(index + 1).padStart(2, '0')}`,
        type: 'spotlight',
        elementId: regionId(page, region),
        title: region.label,
        dimOpacity: 0.76,
      },
      {
        id: `${NOTEBOOK_ID}-plan-speech-s${pageLabel(page.order)}-${String(index + 1).padStart(2, '0')}`,
        type: 'speech',
        title: `讲解：${region.label}`,
        text: region.speech,
      },
    ]),
  }));
}

function narrationOrder() {
  return pages.map((page) => ({
    order: page.order,
    title: page.title,
    beats: page.regions.map((region, index) => ({
      order: index + 1,
      targetId: regionId(page, region),
      semanticId: region.semanticId,
      label: region.label,
      rect: canvasRectObject(region.rect),
      speech: region.speech,
    })),
  }));
}

function pagePlan() {
  return {
    notebookId: NOTEBOOK_ID,
    source: 'deterministic-page-plan-prototype',
    canvasSize: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    sourceSize: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT },
    contract:
      'The renderer, semantic hit map, invisible lecture-focus shapes, and narration order are all produced from this same plan.',
    pages: pages.map((page) => ({
      order: page.order,
      title: page.title,
      image: page.image,
      regions: page.regions.map((region, index) => ({
        order: index + 1,
        id: regionId(page, region),
        semanticId: region.semanticId,
        label: region.label,
        rect: canvasRectObject(region.rect),
        speech: region.speech,
      })),
    })),
  };
}

function overlaySvg(page) {
  const colors = ['#ef4444', '#22c55e', '#2563eb', '#06b6d4', '#d946ef', '#eab308'];
  const rects = page.regions
    .map((region, index) => {
      const [x, y, width, height] = region.rect;
      const color = colors[index % colors.length];
      return `<g>
  <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${color}" fill-opacity="0.08" stroke="${color}" stroke-width="3"/>
  <rect x="${x}" y="${Math.max(0, y - 24)}" width="${Math.max(145, region.label.length * 15)}" height="22" fill="white" fill-opacity="0.88"/>
  <text x="${x + 6}" y="${Math.max(16, y - 8)}" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="${color}">${index + 1}. ${esc(
    region.label,
  )}</text>
</g>`;
    })
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SOURCE_WIDTH}" height="${SOURCE_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}">${rects}</svg>`;
}

async function render() {
  ensureDir(OUT_DIR);
  for (const page of pages) {
    const svg = svgForPage(page);
    const pageNo = pageLabel(page.order);
    const svgPath = path.join(OUT_DIR, `slide-${pageNo}-plan.svg`);
    const pngPath = path.join(OUT_DIR, `slide-${pageNo}-plan.png`);
    const overlayPath = path.join(OUT_DIR, `slide-${pageNo}-plan-overlay.png`);
    fs.writeFileSync(svgPath, svg);
    await sharp(Buffer.from(svg)).png().toFile(pngPath);
    await sharp(pngPath)
      .composite([{ input: Buffer.from(overlaySvg(page)), top: 0, left: 0 }])
      .png()
      .toFile(overlayPath);
  }
  fs.writeFileSync(path.join(OUT_DIR, 'page-plan.json'), `${JSON.stringify(pagePlan(), null, 2)}\n`);
  fs.writeFileSync(
    path.join(OUT_DIR, 'semantic-hit-map.generated.json'),
    `${JSON.stringify(semanticHitMap(), null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(OUT_DIR, 'prototype-scenes.generated.json'),
    `${JSON.stringify(prototypeScenes(), null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(OUT_DIR, 'narration-order.generated.json'),
    `${JSON.stringify(narrationOrder(), null, 2)}\n`,
  );

  const summary = pages.map((page) => ({
    slide: pageLabel(page.order),
    title: page.title,
    image: path.join(OUT_DIR, `slide-${pageLabel(page.order)}-plan.png`),
    overlay: path.join(OUT_DIR, `slide-${pageLabel(page.order)}-plan-overlay.png`),
    regions: page.regions.length,
  }));
  console.log(JSON.stringify({ outDir: OUT_DIR, pages: summary }, null, 2));
}

await render();
