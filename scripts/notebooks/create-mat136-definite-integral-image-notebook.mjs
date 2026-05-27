#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { generatedNotebookDir, generatedNotebookPublicPath } from '../shared/paths.mjs';

const NOTEBOOK_ID = 'nb-mat136-definite-integral-week1-20260518150500';
const COURSE_ID = 'cmpanemia001v8ouzmhttvkrn';
const OUTPUT_DIR = generatedNotebookDir(NOTEBOOK_ID);
const PUBLIC_DIR = generatedNotebookPublicPath(NOTEBOOK_ID);
const NOW = new Date();
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;
const SOURCE_WIDTH = 1600;
const SOURCE_HEIGHT = 900;
const HOTSPOT_PATH = 'M 0 0 L 200 0 L 200 200 L 0 200 Z';

const C = {
  ink: '#0f172a',
  teal: '#0f766e',
  tealSoft: '#d8f3ef',
  blue: '#2563eb',
  blueSoft: '#dbeafe',
  orange: '#f97316',
  orangeSoft: '#ffedd5',
  gold: '#f59e0b',
  goldSoft: '#fef3c7',
  green: '#16a34a',
  greenSoft: '#dcfce7',
  grid: '#e6edf3',
  paper: '#fbfdfc',
};

const FONT = 'Arial Unicode MS, Heiti SC, PingFang SC, STIX Two Text, Times New Roman, sans-serif';
const MATH_FONT = 'STIX Two Text, Times New Roman, Arial Unicode MS, serif';

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function displayLength(text) {
  return Array.from(text).reduce((sum, char) => sum + (char.charCodeAt(0) > 127 ? 2 : 1), 0);
}

function wrapText(text, maxLen) {
  const words = String(text)
    .split(/(\s+)/)
    .filter((part) => part.length > 0);
  const lines = [];
  let line = '';

  for (const word of words) {
    if (/^\s+$/.test(word)) {
      if (line && !line.endsWith(' ')) line += ' ';
      continue;
    }

    const candidate = line ? `${line}${word}` : word;
    if (displayLength(candidate) <= maxLen) {
      line = candidate;
      continue;
    }

    if (line) lines.push(line.trimEnd());
    if (displayLength(word) <= maxLen) {
      line = word;
      continue;
    }

    let chunk = '';
    for (const char of Array.from(word)) {
      if (displayLength(chunk + char) > maxLen) {
        lines.push(chunk);
        chunk = char;
      } else {
        chunk += char;
      }
    }
    line = chunk;
  }

  if (line) lines.push(line.trimEnd());
  return lines;
}

function textLines(x, y, lines, options = {}) {
  const {
    size = 32,
    color = C.ink,
    weight = 500,
    lineHeight = size * 1.35,
    family = FONT,
    anchor = 'start',
    style = '',
  } = options;
  const spans = lines
    .map(
      (line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${esc(line)}</tspan>`,
    )
    .join('');
  return `<text x="${x}" y="${y}" font-family="${esc(family)}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}" ${style}>${spans}</text>`;
}

function wrappedText(x, y, width, text, options = {}) {
  const maxLen = Math.max(16, Math.floor(width / ((options.size ?? 30) * 0.55)));
  return textLines(x, y, wrapText(text, maxLen), options);
}

function math(x, y, text, options = {}) {
  return textLines(x, y, [text], {
    family: MATH_FONT,
    size: options.size ?? 40,
    color: options.color ?? C.ink,
    weight: options.weight ?? 600,
    anchor: options.anchor ?? 'start',
    style: options.style ?? '',
  });
}

function paper(title, subtitle = 'MAT 136 · Week 1') {
  const vertical = Array.from({ length: 51 }, (_, i) => i * 32)
    .map(
      (x) =>
        `<line x1="${x}" y1="0" x2="${x}" y2="${SOURCE_HEIGHT}" stroke="${C.grid}" stroke-width="1"/>`,
    )
    .join('');
  const horizontal = Array.from({ length: 29 }, (_, i) => i * 32)
    .map(
      (y) =>
        `<line x1="0" y1="${y}" x2="${SOURCE_WIDTH}" y2="${y}" stroke="${C.grid}" stroke-width="1"/>`,
    )
    .join('');

  return `
    <rect width="${SOURCE_WIDTH}" height="${SOURCE_HEIGHT}" fill="${C.paper}"/>
    <g opacity="0.72">${vertical}${horizontal}</g>
    <rect x="8" y="8" width="1584" height="884" fill="none" stroke="${C.teal}" stroke-width="6"/>
    ${textLines(55, 88, [title], { size: title.length > 16 ? 58 : 68, weight: 800, color: C.teal })}
    <path d="M58 116 C330 104, 620 112, 900 108" stroke="${C.teal}" stroke-width="7" fill="none" stroke-linecap="round" opacity="0.9"/>
    ${textLines(1370, 58, [subtitle], { size: 26, weight: 800, color: C.teal })}
    ${textLines(1358, 94, ['定积分与计算'], { size: 24, weight: 700, color: C.ink })}
    <line x1="1348" y1="110" x2="1555" y2="110" stroke="#38bdf8" stroke-width="4"/>
  `;
}

function card(x, y, w, h, options = {}) {
  const {
    stroke = C.teal,
    fill = '#ffffff',
    title = '',
    titleFill = stroke,
    body = '',
    bodySize = 28,
  } = options;
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="3"/>
    ${
      title
        ? `<rect x="${x + 18}" y="${y - 24}" width="${Math.min(w - 36, Math.max(190, displayLength(title) * 16))}" height="52" rx="8" fill="${titleFill}"/>
           ${textLines(x + 38, y + 13, [title], { size: 28, weight: 800, color: '#ffffff' })}`
        : ''
    }
    ${body ? wrappedText(x + 28, y + 58, w - 56, body, { size: bodySize, lineHeight: bodySize * 1.42, weight: 520 }) : ''}
  `;
}

function formulaBox(x, y, w, h, formulas, options = {}) {
  const { stroke = C.blue, fill = C.blueSoft, size = 38, startY = y + 56 } = options;
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="3"/>
    ${formulas
      .map((f, index) =>
        math(x + 34, startY + index * (size * 1.55), f, {
          size,
          color: index === 0 ? C.ink : stroke,
        }),
      )
      .join('')}
  `;
}

function pill(x, y, text, color = C.teal, width = null) {
  const w = width ?? Math.max(180, displayLength(text) * 15 + 44);
  return `
    <rect x="${x}" y="${y}" width="${w}" height="52" rx="8" fill="${color}"/>
    ${textLines(x + w / 2, y + 35, [text], { size: 27, weight: 800, color: '#ffffff', anchor: 'middle' })}
  `;
}

function axes(x, y, w, h, options = {}) {
  const { xlabel = 'x', ylabel = 'f(x)' } = options;
  return `
    <line x1="${x}" y1="${y + h}" x2="${x + w}" y2="${y + h}" stroke="${C.ink}" stroke-width="4" marker-end="url(#arrow)"/>
    <line x1="${x}" y1="${y + h}" x2="${x}" y2="${y}" stroke="${C.ink}" stroke-width="4" marker-end="url(#arrow)"/>
    ${textLines(x + w + 18, y + h + 10, [xlabel], { size: 26, weight: 700 })}
    ${textLines(x + 10, y - 12, [ylabel], { size: 26, weight: 700 })}
  `;
}

function rootDefs() {
  return `
    <defs>
      <marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto">
        <path d="M2 2 L10 6 L2 10 Z" fill="${C.ink}"/>
      </marker>
      <marker id="arrowTeal" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto">
        <path d="M2 2 L10 6 L2 10 Z" fill="${C.teal}"/>
      </marker>
      <filter id="softShadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#0f172a" flood-opacity="0.13"/>
      </filter>
    </defs>
  `;
}

function svg(title, body) {
  return Buffer.from(`
    <svg width="${SOURCE_WIDTH}" height="${SOURCE_HEIGHT}" viewBox="0 0 ${SOURCE_WIDTH} ${SOURCE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      ${rootDefs()}
      ${paper(title)}
      ${body}
    </svg>
  `);
}

function slideCover() {
  const body = `
    ${textLines(88, 205, ['从面积极限到可计算的定积分'], { size: 46, weight: 800, color: C.ink })}
    ${textLines(100, 282, ['MAT 136 · Week 1', 'Definite Integral'], {
      size: 32,
      weight: 700,
      color: C.blue,
      lineHeight: 46,
    })}
    <g transform="translate(115,360)">
      ${pill(0, 0, 'Riemann sums', C.teal, 285)}
      <line x1="300" y1="26" x2="405" y2="26" stroke="${C.ink}" stroke-width="5" marker-end="url(#arrow)"/>
      ${pill(430, 0, '∫ₐᵇ f(x) dx', C.blue, 285)}
      <line x1="730" y1="26" x2="835" y2="26" stroke="${C.ink}" stroke-width="5" marker-end="url(#arrow)"/>
      ${pill(860, 0, 'F(b) − F(a)', C.orange, 285)}
    </g>
    <g transform="translate(930,208)">
      ${axes(0, 0, 500, 280, { ylabel: 'f(x)' })}
      <path d="M40 225 C110 110, 190 75, 275 135 C350 190, 405 160, 465 85" stroke="${C.teal}" stroke-width="6" fill="none"/>
      <path d="M40 225 C110 110, 190 75, 275 135 C350 190, 405 160, 465 85 L465 280 L40 280 Z" fill="${C.tealSoft}" opacity="0.72"/>
      ${textLines(150, 330, ['面积极限变成计算规则'], { size: 28, weight: 800, color: C.teal })}
    </g>
    <rect x="125" y="690" width="1180" height="92" rx="8" fill="${C.goldSoft}" stroke="${C.gold}" stroke-width="3"/>
    ${textLines(165, 750, ['本节主线：定义 → 性质 → FTC II → Riemann sum 转换 → FTC I'], {
      size: 34,
      weight: 800,
      color: C.ink,
    })}
  `;
  return svg('MAT 136 · 定积分', body);
}

function slideDefinition() {
  const body = `
    ${card(55, 155, 455, 520, {
      stroke: C.teal,
      fill: '#ffffff',
      title: '从矩形和出发',
      body: '把 [a,b] 等分成 n 段，宽度 Δx=(b-a)/n。右端点采样时，第 i 个采样点是 xᵢ=a+iΔx。',
    })}
    <g transform="translate(95,405)">
      ${axes(0, 0, 335, 165, { ylabel: 'f(x)' })}
      <path d="M30 135 C85 55, 150 36, 220 80 C270 112, 305 88, 330 58" stroke="${C.teal}" stroke-width="5" fill="none"/>
      ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${38 + i * 48}" y="${128 - [20, 58, 78, 70, 55, 85][i]}" width="48" height="${[20, 58, 78, 70, 55, 85][i]}" fill="${C.tealSoft}" stroke="${C.teal}" stroke-width="2"/>`).join('')}
    </g>
    ${formulaBox(
      565,
      178,
      930,
      250,
      ['∫ₐᵇ f(x) dx = lim n→∞  Σ(i=1→n)', 'f(a+iΔx) · Δx', 'Δx = (b−a)/n'],
      {
        stroke: C.blue,
        fill: C.blueSoft,
        size: 32,
        startY: 238,
      },
    )}
    ${card(565, 485, 930, 245, {
      stroke: C.orange,
      fill: '#fffaf5',
      title: '这一定义在说什么？',
      titleFill: C.orange,
      body: '定积分不是突然出现的新符号。它就是当矩形越来越窄时，左/右黎曼和稳定下来的极限。连续函数时，左和右会收敛到同一个数。',
      bodySize: 30,
    })}
    <rect x="360" y="775" width="890" height="70" rx="8" fill="${C.tealSoft}" stroke="${C.teal}" stroke-width="3"/>
    ${textLines(405, 822, ['读作：f 从 a 到 b 的定积分，也可以理解成有向面积。'], {
      size: 31,
      weight: 800,
      color: C.teal,
    })}
  `;
  return svg('定积分：黎曼和的极限', body);
}

function slideSignedArea() {
  const body = `
    <g transform="translate(80,175)">
      ${card(0, 0, 690, 505, {
        stroke: C.teal,
        fill: '#ffffff',
        title: '正面积：曲线在 x 轴上方',
        body: '',
      })}
      ${axes(70, 95, 520, 260, { ylabel: 'f(x)' })}
      <path d="M90 270 C170 95, 280 80, 375 165 C445 226, 515 198, 570 125" stroke="${C.teal}" stroke-width="6" fill="none"/>
      <path d="M90 270 C170 95, 280 80, 375 165 C445 226, 515 198, 570 125 L570 355 L90 355 Z" fill="${C.greenSoft}" stroke="${C.green}" stroke-width="2" opacity="0.86"/>
      ${math(145, 418, '∫ₐᵇ f(x) dx > 0', { size: 40, color: C.green })}
    </g>
    <g transform="translate(830,175)">
      ${card(0, 0, 690, 505, {
        stroke: C.orange,
        fill: '#ffffff',
        title: '负面积：曲线在 x 轴下方',
        titleFill: C.orange,
        body: '',
      })}
      ${axes(70, 95, 520, 260, { ylabel: 'f(x)' })}
      <line x1="70" y1="235" x2="590" y2="235" stroke="${C.ink}" stroke-width="3"/>
      <path d="M90 250 C180 340, 300 360, 405 292 C470 250, 525 290, 570 325" stroke="${C.orange}" stroke-width="6" fill="none"/>
      <path d="M90 235 C180 340, 300 360, 405 292 C470 250, 525 290, 570 325 L570 235 Z" fill="${C.orangeSoft}" stroke="${C.orange}" stroke-width="2" opacity="0.92"/>
      ${math(145, 418, '∫ₐᵇ f(x) dx < 0', { size: 40, color: C.orange })}
    </g>
    ${formulaBox(260, 715, 1080, 110, ['∫ₐᵃ f(x) dx = 0     且     ∫ₐᵇ f(x) dx 是“净面积”'], {
      stroke: C.blue,
      fill: C.blueSoft,
      size: 40,
      startY: 780,
    })}
  `;
  return svg('有向面积：正负号很重要', body);
}

function slideProperties() {
  const items = [
    ['零长度区间', '∫ₐᵃ f(x) dx = 0', C.teal, C.tealSoft],
    ['常数可以提出', '∫ₐᵇ c f(x) dx = c ∫ₐᵇ f(x) dx', C.blue, C.blueSoft],
    ['加减可以拆开', '∫ₐᵇ (f ± g) dx = ∫ₐᵇ f dx ± ∫ₐᵇ g dx', C.orange, C.orangeSoft],
    ['区间可以相加', '∫ₐᵇ f dx = ∫[a,c] f dx + ∫[c,b] f dx', C.green, C.greenSoft],
    ['变量名字不重要', '∫ₐᵇ f(x) dx = ∫ₐᵇ f(t) dt', C.gold, C.goldSoft],
  ];
  const body = `
    ${items
      .map((item, index) => {
        const [title, formula, color, fill] = item;
        const x = index < 3 ? 60 + index * 500 : 255 + (index - 3) * 620;
        const y = index < 3 ? 170 : 515;
        const w = index < 3 ? 440 : 500;
        return `
          <rect x="${x}" y="${y}" width="${w}" height="250" rx="8" fill="${fill}" stroke="${color}" stroke-width="3"/>
          ${pill(x + 24, y - 26, title, color, Math.min(w - 48, Math.max(210, displayLength(title) * 15 + 48)))}
          ${math(x + 34, y + 122, formula, { size: formula.length > 52 ? 28 : 34, color: C.ink })}
        `;
      })
      .join('')}
    <rect x="235" y="785" width="1130" height="62" rx="8" fill="#ffffff" stroke="${C.teal}" stroke-width="3"/>
    ${textLines(278, 826, ['这些性质都是“面积加法”和“极限线性”的翻译。'], {
      size: 31,
      weight: 800,
      color: C.teal,
    })}
  `;
  return svg('定积分的基本性质', body);
}

function slideFtc2() {
  const body = `
    ${card(65, 165, 615, 520, {
      stroke: C.teal,
      fill: '#ffffff',
      title: 'FTC II',
      body: '如果 f 在 [a,b] 上连续，并且 F 是 f 的任意一个反导函数，也就是 F′(x)=f(x)，那么定积分可以直接用端点差计算。',
      bodySize: 31,
    })}
    ${formulaBox(730, 178, 800, 250, ['∫ₐᵇ f(x) dx = F(b) − F(a)', '其中  F′(x)=f(x)'], {
      stroke: C.blue,
      fill: C.blueSoft,
      size: 46,
      startY: 268,
    })}
    <g transform="translate(800,490)">
      ${axes(0, 0, 560, 240, { ylabel: 'F(x)' })}
      <path d="M50 210 C140 150, 220 70, 330 95 C430 120, 485 60, 535 35" stroke="${C.orange}" stroke-width="6" fill="none"/>
      <line x1="105" y1="210" x2="105" y2="162" stroke="${C.teal}" stroke-width="3" stroke-dasharray="8 8"/>
      <line x1="475" y1="210" x2="475" y2="70" stroke="${C.teal}" stroke-width="3" stroke-dasharray="8 8"/>
      ${textLines(94, 242, ['a'], { size: 28, weight: 800 })}
      ${textLines(464, 242, ['b'], { size: 28, weight: 800 })}
      ${textLines(215, 286, ['积分 = 原函数的净变化'], { size: 30, weight: 800, color: C.orange })}
    </g>
    <rect x="135" y="735" width="930" height="88" rx="8" fill="${C.goldSoft}" stroke="${C.gold}" stroke-width="3"/>
    ${textLines(178, 790, ['这一步把“极限面积问题”变成了“找反导函数并代端点”。'], {
      size: 32,
      weight: 800,
      color: C.ink,
    })}
  `;
  return svg('FTC II：用反导函数算定积分', body);
}

function slideFtc2Examples() {
  const examples = [
    ['例 1', '∫₀² x² dx', '[x³/3]₀² = 8/3', C.teal, C.tealSoft],
    ['例 2', '∫₀¹ eˣ dx', '[eˣ]₀¹ = e − 1', C.blue, C.blueSoft],
    ['例 3', '∫₁⁴ √x dx', '[ 2x³ᐟ² / 3 ]₁⁴ = 14/3', C.orange, C.orangeSoft],
  ];
  const body = `
    ${examples
      .map((ex, index) => {
        const [title, problem, answer, color, fill] = ex;
        const x = 80 + index * 500;
        return `
          <rect x="${x}" y="190" width="430" height="455" rx="8" fill="${fill}" stroke="${color}" stroke-width="3"/>
          ${pill(x + 28, 160, title, color, 150)}
          ${math(x + 45, 300, problem, { size: 52, color: C.ink })}
          <line x1="${x + 35}" y1="355" x2="${x + 395}" y2="355" stroke="${color}" stroke-width="3"/>
          ${math(x + 45, 445, answer, { size: 40, color })}
          ${wrappedText(x + 45, 535, 340, '流程：先找反导函数，再代上端点减下端点。', {
            size: 27,
            lineHeight: 38,
            weight: 700,
          })}
        `;
      })
      .join('')}
    <rect x="305" y="720" width="990" height="88" rx="8" fill="#ffffff" stroke="${C.teal}" stroke-width="3"/>
    ${textLines(352, 775, ['不要忘记：定积分结果是一个数，不是一个新的函数。'], {
      size: 33,
      weight: 800,
      color: C.teal,
    })}
  `;
  return svg('FTC II 计算例题', body);
}

function slideRiemannConversion() {
  const body = `
    ${formulaBox(
      55,
      155,
      700,
      235,
      [
        'lim n→∞  Σ(i=1→n)  [宽度] · [高度]',
        '        ↓              ↓',
        '       Δx           f(xᵢ)',
      ],
      {
        stroke: C.teal,
        fill: C.tealSoft,
        size: 35,
        startY: 225,
      },
    )}
    ${card(810, 145, 705, 560, {
      stroke: C.blue,
      fill: '#ffffff',
      title: '三步翻译法',
      titleFill: C.blue,
      body: '',
    })}
    <g transform="translate(850,215)">
      <rect x="0" y="0" width="615" height="96" rx="8" fill="${C.tealSoft}" stroke="${C.teal}" stroke-width="3"/>
      ${textLines(28, 38, ['1. 先找宽度 Δx'], { size: 28, weight: 800, color: C.teal })}
      ${textLines(28, 76, ['通常是求和项外面乘的系数，例如 6/n。'], { size: 25, weight: 650 })}
      <rect x="0" y="126" width="615" height="118" rx="8" fill="${C.blueSoft}" stroke="${C.blue}" stroke-width="3"/>
      ${textLines(28, 164, ['2. 再找采样点 xᵢ = a + iΔx'], { size: 28, weight: 800, color: C.blue })}
      ${textLines(28, 202, ['如果起点是 0，Δx=6/n，那么 xᵢ=6i/n。'], { size: 25, weight: 650 })}
      <rect x="0" y="274" width="615" height="126" rx="8" fill="${C.orangeSoft}" stroke="${C.orange}" stroke-width="3"/>
      ${textLines(28, 312, ['3. 把求和项改写成 f(xᵢ)'], { size: 28, weight: 800, color: C.orange })}
      ${textLines(28, 350, ['所有 i 都尽量换成 xᵢ，最后把 xᵢ 改成 x。'], { size: 25, weight: 650 })}
    </g>
    <g transform="translate(105,465)">
      ${pill(0, 0, 'Δx', C.teal, 130)}
      <line x1="145" y1="26" x2="225" y2="26" stroke="${C.ink}" stroke-width="4" marker-end="url(#arrow)"/>
      ${pill(250, 0, 'xᵢ', C.blue, 130)}
      <line x1="395" y1="26" x2="475" y2="26" stroke="${C.ink}" stroke-width="4" marker-end="url(#arrow)"/>
      ${pill(500, 0, 'f(xᵢ)', C.orange, 170)}
    </g>
    <rect x="250" y="735" width="1080" height="82" rx="8" fill="${C.goldSoft}" stroke="${C.gold}" stroke-width="3"/>
    ${textLines(298, 788, ['核心不是背模板，而是还原：宽度、采样点、函数、区间。'], {
      size: 31,
      weight: 800,
      color: C.ink,
    })}
  `;
  return svg('黎曼和 ⇄ 定积分', body);
}

function slideConversionExamples() {
  const body = `
    ${card(55, 150, 1490, 170, {
      stroke: C.teal,
      fill: '#ffffff',
      title: '完整例题',
      body: '',
    })}
    ${math(95, 255, 'lim n→∞  Σ(i=1→n)  (6/n) [ 12i/n − (6i/n)² ]', { size: 42 })}
    <g transform="translate(80,390)">
      <rect x="0" y="0" width="430" height="230" rx="8" fill="${C.tealSoft}" stroke="${C.teal}" stroke-width="3"/>
      ${pill(28, -24, '1. 宽度和区间', C.teal, 230)}
      ${math(36, 82, 'Δx = 6/n', { size: 38, color: C.teal })}
      ${textLines(36, 142, ['若 a = 0，则 b − a = 6'], { size: 29, weight: 700 })}
      ${math(36, 198, '区间：[0, 6]', { size: 35, color: C.ink })}
      <rect x="500" y="0" width="430" height="230" rx="8" fill="${C.blueSoft}" stroke="${C.blue}" stroke-width="3"/>
      ${pill(528, -24, '2. 采样点', C.blue, 200)}
      ${math(536, 82, 'xᵢ = a + iΔx', { size: 36, color: C.blue })}
      ${math(536, 145, '= 0 + i(6/n)', { size: 34, color: C.ink })}
      ${math(536, 200, '= 6i/n', { size: 36, color: C.ink })}
      <rect x="1000" y="0" width="430" height="230" rx="8" fill="${C.orangeSoft}" stroke="${C.orange}" stroke-width="3"/>
      ${pill(1028, -24, '3. 改写函数', C.orange, 210)}
      ${math(1036, 80, '12i/n = 2(6i/n)', { size: 32, color: C.orange })}
      ${math(1036, 135, '= 2xᵢ', { size: 36, color: C.ink })}
      ${math(1036, 198, '(6i/n)² = xᵢ²', { size: 34, color: C.ink })}
    </g>
    <rect x="230" y="680" width="1140" height="76" rx="8" fill="${C.greenSoft}" stroke="${C.green}" stroke-width="3"/>
    ${math(325, 732, '所以：lim Σ ... = ∫₀⁶ (2x − x²) dx', { size: 40, color: C.green })}
    <rect x="290" y="785" width="1020" height="58" rx="8" fill="${C.goldSoft}" stroke="${C.gold}" stroke-width="3"/>
    ${textLines(335, 824, ['关键：先把 6i/n 命名成 xᵢ，再把所有 i 相关项改写成 xᵢ。'], {
      size: 33,
      weight: 800,
      color: C.ink,
    })}
  `;
  return svg('Riemann Sum 转换例题', body);
}

function slideNetChange() {
  const body = `
    ${formulaBox(80, 160, 720, 210, ['∫ₐᵇ f′(t) dt = f(b) − f(a)', '导数的面积 = 原函数的净变化'], {
      stroke: C.blue,
      fill: C.blueSoft,
      size: 42,
      startY: 240,
    })}
    <g transform="translate(875,150)">
      ${axes(0, 20, 560, 310, { ylabel: 'f′(t)' })}
      <line x1="0" y1="220" x2="560" y2="220" stroke="${C.ink}" stroke-width="3"/>
      <path d="M40 220 C105 70, 190 40, 280 105 C340 152, 383 215, 420 220 C470 228, 510 275, 540 295" stroke="${C.teal}" stroke-width="6" fill="none"/>
      <path d="M40 220 C105 70, 190 40, 280 105 C340 152, 383 215, 420 220 L40 220 Z" fill="${C.greenSoft}" opacity="0.86"/>
      <path d="M420 220 C470 228, 510 275, 540 295 L540 220 Z" fill="${C.orangeSoft}" opacity="0.92"/>
      ${textLines(155, 72, ['f 增加'], { size: 28, weight: 800, color: C.green })}
      ${textLines(440, 300, ['f 减少'], { size: 28, weight: 800, color: C.orange })}
    </g>
    ${card(80, 445, 680, 260, {
      stroke: C.teal,
      fill: '#ffffff',
      title: '怎么读图？',
      body: 'f′ 在 x 轴上方时，原函数 f 正在增加；f′ 在 x 轴下方时，原函数 f 正在减少。累积的正负面积决定 f 的总变化。',
      bodySize: 30,
    })}
    ${card(850, 520, 600, 185, {
      stroke: C.orange,
      fill: '#fffaf5',
      title: '最大/最小的线索',
      titleFill: C.orange,
      body: '原函数的峰值通常出现在 f′ 从正变负的地方；谷值通常出现在 f′ 从负变正的地方。',
      bodySize: 29,
    })}
    <rect x="230" y="760" width="1080" height="72" rx="8" fill="${C.goldSoft}" stroke="${C.gold}" stroke-width="3"/>
    ${textLines(278, 807, ['这就是“导数图像”和“原函数变化量”之间的桥。'], {
      size: 32,
      weight: 800,
      color: C.ink,
    })}
  `;
  return svg('导数和面积：定积分是净变化', body);
}

function slideFtc1() {
  const body = `
    ${formulaBox(70, 160, 720, 245, ['A(x) = ∫ₐˣ f(t) dt', 'A′(x) = f(x)'], {
      stroke: C.teal,
      fill: C.tealSoft,
      size: 52,
      startY: 250,
    })}
    ${card(860, 155, 620, 520, {
      stroke: C.blue,
      fill: '#ffffff',
      title: '为什么？',
      titleFill: C.blue,
      body: '当 x 增加一点点 h，A(x) 多出来的是 [x,x+h] 上的一小条面积。这个小条面积大约等于 f(x)·h。除以 h，再让 h→0，就留下 f(x)。',
      bodySize: 30,
    })}
    <g transform="translate(95,478)">
      ${axes(0, 0, 560, 235, { ylabel: 'f(t)' })}
      <path d="M50 170 C135 72, 230 58, 335 130 C430 190, 485 160, 540 95" stroke="${C.teal}" stroke-width="6" fill="none"/>
      <rect x="325" y="95" width="95" height="140" fill="${C.orangeSoft}" stroke="${C.orange}" stroke-width="3"/>
      ${textLines(320, 270, ['x'], { size: 26, weight: 800 })}
      ${textLines(392, 270, ['x+h'], { size: 26, weight: 800 })}
      ${textLines(210, 318, ['新增面积 ≈ f(x)·h'], { size: 31, weight: 800, color: C.orange })}
    </g>
    <rect x="265" y="760" width="1030" height="72" rx="8" fill="${C.goldSoft}" stroke="${C.gold}" stroke-width="3"/>
    ${textLines(314, 807, ['FTC I：先积分再求导，会回到原来的函数。'], {
      size: 33,
      weight: 800,
      color: C.ink,
    })}
  `;
  return svg('FTC I：面积函数的导数', body);
}

function slideChainRule() {
  const body = `
    ${formulaBox(55, 160, 700, 220, ['d/dx [ ∫ a→g(x) f(t) dt ] = f(g(x)) g′(x)'], {
      stroke: C.teal,
      fill: C.tealSoft,
      size: 38,
      startY: 255,
    })}
    ${formulaBox(
      845,
      160,
      700,
      220,
      ['d/dx [ ∫ u(x)→v(x) f(t) dt ]', '= f(v(x))v′(x) − f(u(x))u′(x)'],
      {
        stroke: C.blue,
        fill: C.blueSoft,
        size: 36,
        startY: 240,
      },
    )}
    ${card(80, 455, 620, 230, {
      stroke: C.orange,
      fill: '#fffaf5',
      title: '例',
      titleFill: C.orange,
      body: '如果 G(x)=∫₀ˣ² cos(t²) dt，那么 G′(x)=cos((x²)²)·2x = 2x cos(x⁴)。',
      bodySize: 30,
    })}
    ${card(840, 455, 620, 230, {
      stroke: C.green,
      fill: '#f5fff7',
      title: '记忆方式',
      titleFill: C.green,
      body: '上限动：加 f(上限)·上限导数；下限动：减 f(下限)·下限导数。',
      bodySize: 31,
    })}
    <rect x="250" y="748" width="1100" height="78" rx="8" fill="${C.goldSoft}" stroke="${C.gold}" stroke-width="3"/>
    ${textLines(300, 799, ['这不是新的定理，而是 FTC I 加上链式法则。'], {
      size: 34,
      weight: 800,
      color: C.ink,
    })}
  `;
  return svg('变上限积分与链式法则', body);
}

function slideFormulaToolbox() {
  const rows = [
    ['Power', '∫ xⁿ dx = xⁿ⁺¹/(n+1) + C,  n≠−1'],
    ['Exponential', '∫ eˣ dx = eˣ + C'],
    ['Reciprocal', '∫ 1/x dx = ln|x| + C'],
    ['Trig', '∫ cos x dx = sin x + C,   ∫ sin x dx = −cos x + C'],
    ['Arctan', '∫ 1/(1+x²) dx = arctan x + C'],
  ];
  const body = `
    <rect x="90" y="160" width="1420" height="565" rx="8" fill="#ffffff" stroke="${C.teal}" stroke-width="3"/>
    ${pill(125, 134, '常用反导公式', C.teal, 270)}
    ${rows
      .map((row, index) => {
        const y = 220 + index * 92;
        const fill = index % 2 === 0 ? C.blueSoft : '#ffffff';
        return `
          <rect x="130" y="${y - 42}" width="1340" height="76" rx="8" fill="${fill}" stroke="${index % 2 === 0 ? C.blue : C.grid}" stroke-width="2"/>
          ${textLines(165, y + 8, [row[0]], { size: 30, weight: 800, color: index % 2 === 0 ? C.blue : C.teal })}
          ${math(430, y + 8, row[1], { size: 34, color: C.ink })}
        `;
      })
      .join('')}
    <rect x="245" y="765" width="1100" height="70" rx="8" fill="${C.orangeSoft}" stroke="${C.orange}" stroke-width="3"/>
    ${textLines(292, 812, ['做定积分时：先找反导函数，再代端点；不要把 +C 写进最终答案。'], {
      size: 31,
      weight: 800,
      color: C.ink,
    })}
  `;
  return svg('计算工具箱：常用反导函数', body);
}

function slideSummary() {
  const body = `
    <g transform="translate(70,165)">
      ${pill(0, 0, '1 定义', C.teal, 180)}
      ${pill(245, 0, '2 性质', C.blue, 180)}
      ${pill(490, 0, '3 FTC II', C.orange, 190)}
      ${pill(750, 0, '4 转换', C.green, 190)}
      ${pill(1010, 0, '5 FTC I', C.gold, 190)}
      ${[190, 435, 690, 950].map((x) => `<line x1="${x}" y1="26" x2="${x + 45}" y2="26" stroke="${C.ink}" stroke-width="4" marker-end="url(#arrow)"/>`).join('')}
    </g>
    ${card(90, 310, 650, 340, {
      stroke: C.teal,
      fill: '#ffffff',
      title: '今天你应该会',
      body: '把定积分解释成 Riemann sums 的极限；用性质拆积分；用 FTC II 计算定积分；把极限求和式翻译成定积分；用 FTC I 处理变上限积分。',
      bodySize: 30,
    })}
    ${card(840, 310, 650, 340, {
      stroke: C.orange,
      fill: '#fffaf5',
      title: '下节课钩子',
      titleFill: C.orange,
      body: '下一步不是再画更多矩形，而是学习计算技巧：换元、分部积分，以及更复杂函数的面积和净变化。',
      bodySize: 31,
    })}
    ${formulaBox(270, 705, 1060, 125, ['∫ₐᵇ f(x) dx  =  面积极限  =  F(b) − F(a)'], {
      stroke: C.blue,
      fill: C.blueSoft,
      size: 43,
      startY: 782,
    })}
  `;
  return svg('本节课总结：定积分的三种面孔', body);
}

const slides = [
  {
    title: 'MAT 136 · 定积分',
    render: slideCover,
    steps: [
      {
        id: 'cover-flow',
        label: '封面学习路线',
        rect: [110, 350, 1160, 245],
        speech: '',
      },
    ],
  },
  {
    title: '定积分：黎曼和的极限',
    render: slideDefinition,
    steps: [
      {
        id: 'riemann-source',
        label: '从矩形和出发',
        rect: [55, 155, 455, 520],
        speech:
          '这一页先不要急着看积分符号。先回到矩形：区间 [a,b] 被等分成 n 段，每段宽度是 delta x 等于 b 减 a 除以 n。右端点采样时，第 i 个矩形用的横坐标是 a 加 i delta x。',
      },
      {
        id: 'definition-formula',
        label: '定积分定义公式',
        rect: [565, 178, 930, 250],
        speech:
          '右边公式只是在把这句话写严谨：把每个矩形的高度 f(a+i delta x) 乘宽度 delta x，再全部加起来；当 n 越来越大，矩形越来越窄，如果这个和稳定下来，这个稳定值就叫定积分。',
      },
      {
        id: 'meaning-note',
        label: '定义含义',
        rect: [565, 485, 930, 245],
        speech:
          '所以要记住的不是符号长什么样，而是它的来源：定积分就是黎曼和的极限。连续函数时，不管用左端点还是右端点，分得足够细以后都会逼近同一个数。',
      },
    ],
  },
  {
    title: '有向面积：正负号很重要',
    render: slideSignedArea,
    steps: [
      {
        id: 'positive-area',
        label: '正面积区域',
        rect: [80, 175, 690, 505],
        speech:
          '先看左边：曲线在 x 轴上方，函数值为正，所以这一段对定积分的贡献是正的。这里的面积和我们平常说的几何面积方向一致。',
      },
      {
        id: 'negative-area',
        label: '负面积区域',
        rect: [830, 175, 690, 505],
        speech:
          '右边是最容易混的地方：曲线在 x 轴下方，函数值为负，所以贡献是负的。定积分算的是有向面积，也叫净面积，不是普通几何面积。',
      },
      {
        id: 'zero-interval',
        label: '零长度和净面积',
        rect: [260, 715, 1080, 110],
        speech:
          '因此如果题目问面积要小心：定积分可能正负抵消。如果上下限相同，区间宽度为零，所以积分就是零。以后先判断函数在 x 轴上方还是下方。',
      },
    ],
  },
  {
    title: '定积分的基本性质',
    render: slideProperties,
    steps: [
      {
        id: 'top-properties',
        label: '线性性质',
        rect: [55, 145, 1490, 290],
        speech:
          '这些性质不要当成孤立公式背。上面这一排解决的是“被积函数怎么拆”：常数可以提出去，函数相加或相减，可以拆成积分相加或相减。它们本质上是极限的线性。',
      },
      {
        id: 'bottom-properties',
        label: '区间与变量性质',
        rect: [245, 500, 1120, 255],
        speech:
          '下面这一排解决的是“区间和变量怎么处理”：从 a 到 b 的面积可以在 c 处分成两段；积分变量只是临时名字，用 x 或用 t，不会改变这个数。',
      },
      {
        id: 'property-summary',
        label: '性质总结',
        rect: [235, 785, 1130, 62],
        speech:
          '做题时看到复杂积分，先问两件事：能不能拆函数？能不能拆区间？这比直接硬找反导函数更稳。',
      },
    ],
  },
  {
    title: 'FTC II：用反导函数算定积分',
    render: slideFtc2,
    steps: [
      {
        id: 'theorem-statement',
        label: 'FTC II 条件',
        rect: [65, 165, 615, 520],
        speech:
          '现在进入计算核心。FTC II 的前提是：你要找到一个 F，它的导数正好是被积函数 f。也就是说，F prime 等于 f。只有先找对反导函数，后面的端点差才有意义。',
      },
      {
        id: 'formula-main',
        label: '端点差公式',
        rect: [730, 178, 800, 250],
        speech:
          '公式本身很短：积分等于 F(b) 减 F(a)。它真正厉害的地方是，把无限多个矩形的极限，变成了两个端点的代入。',
      },
      {
        id: 'net-change-visual',
        label: '原函数净变化图',
        rect: [790, 455, 670, 315],
        speech:
          '图像上要注意：这里算的不是 F 曲线下面积，而是 F 从 a 到 b 的高度变化。定积分给的是原函数的净变化量。',
      },
    ],
  },
  {
    title: 'FTC II 计算例题',
    render: slideFtc2Examples,
    steps: [
      {
        id: 'three-examples',
        label: '三个基础计算',
        rect: [70, 155, 1450, 510],
        speech:
          '这三个例题都按同一个流程做：第一步，找反导函数 F；第二步，写成 F 上端点减 F 下端点；第三步，化简成一个数。比如 x squared 的反导是 x cubed over three，e to x 的反导还是 e to x，根号 x 要先写成 x 的二分之一次方。',
      },
      {
        id: 'definite-result-note',
        label: '定积分结果提醒',
        rect: [305, 720, 990, 88],
        speech:
          '这页的易错点是加 C。定积分最后是一个数，上端点减下端点时常数会抵消，所以最终答案不要写加 C。',
      },
    ],
  },
  {
    title: '黎曼和 ⇄ 定积分',
    render: slideRiemannConversion,
    steps: [
      {
        id: 'template-form',
        label: '标准结构',
        rect: [55, 155, 700, 235],
        speech:
          '把黎曼和翻译成定积分时，不要先猜答案。先看标准结构：求和项一定是一个宽度乘一个高度。宽度就是 delta x，高度就是某个采样点 x i 处的函数值 f of x i。',
      },
      {
        id: 'checklist',
        label: '三步翻译法',
        rect: [810, 145, 705, 560],
        speech:
          '真正的解题顺序是三步。第一，找 delta x，通常是求和项外面乘的系数。第二，找采样点 x i，它应该长成 a 加 i delta x。第三，把求和项里所有含 i 的东西尽量改写成 x i，最后把 x i 换成 x。',
      },
      {
        id: 'conversion-summary',
        label: '转换总结',
        rect: [105, 465, 1225, 360],
        speech:
          '所以翻译顺序是：先看宽度，再看采样点，再识别函数，最后写成积分。最容易错的地方，就是还没有确定 x i 是什么，就直接把 i 的表达式硬换成 x。',
      },
    ],
  },
  {
    title: 'Riemann Sum 转换例题',
    render: slideConversionExamples,
    steps: [
      {
        id: 'problem',
        label: '题目原式',
        rect: [55, 150, 1490, 170],
        speech:
          '我们完整拆一个例题。先看这个极限和：前面的六除以 n 是宽度 delta x，括号里面的十二 i 除以 n 和六 i 除以 n 的平方，是要被我们改写成函数值的部分。',
      },
      {
        id: 'three-step-work',
        label: '三步拆解',
        rect: [80, 390, 1430, 230],
        speech:
          '第一步，delta x 等于六除以 n，所以如果起点是零，区间终点就是六。第二步，采样点 x i 等于零加 i 乘六除以 n，也就是六 i 除以 n。第三步，把十二 i 除以 n 改成二乘六 i 除以 n，也就是二 x i；同时六 i 除以 n 的平方就是 x i squared。',
      },
      {
        id: 'final-integral',
        label: '最终定积分',
        rect: [230, 680, 1140, 163],
        speech:
          '于是括号里的函数值就是二 x i 减 x i squared。把 x i 换成 x，最终得到从零到六的二 x 减 x squared 的积分。这一步才是把求和式真正翻译成定积分。',
      },
    ],
  },
  {
    title: '导数和面积：定积分是净变化',
    render: slideNetChange,
    steps: [
      {
        id: 'net-change-formula',
        label: '导数面积公式',
        rect: [80, 160, 720, 210],
        speech:
          '如果被积函数是 f prime，积分就有一个特别重要的解释：它不是只在算导数图像下的面积，而是在算原函数 f 从 a 到 b 总共变了多少。',
      },
      {
        id: 'derivative-graph',
        label: '导数图像判断',
        rect: [865, 150, 610, 390],
        speech:
          '看导数图像时，f prime 在 x 轴上方，说明原函数正在增加；在 x 轴下方，说明原函数正在减少。正面积让 f 往上走，负面积让 f 往下走。',
      },
      {
        id: 'max-min-clue',
        label: '最大最小线索',
        rect: [80, 445, 1370, 260],
        speech:
          '所以判断原函数最大最小时，先看导数符号怎么变。f prime 从正变负，原函数从增加变减少，通常是局部最大；从负变正，通常是局部最小。',
      },
    ],
  },
  {
    title: 'FTC I：面积函数的导数',
    render: slideFtc1,
    steps: [
      {
        id: 'accumulation-function',
        label: '面积函数定义',
        rect: [70, 160, 720, 245],
        speech:
          'FTC I 和 FTC II 不一样。这里定义的是一个面积函数 A(x)：上限 x 在动，所以积分值也跟着 x 变。定理说，对这个面积函数求导，会回到当前的高度 f(x)。',
      },
      {
        id: 'why-small-strip',
        label: '小面积条解释',
        rect: [860, 155, 620, 520],
        speech:
          '直觉是这样的：x 增加一点点 h，面积函数只多出一条很窄的面积条。这条面积大约等于高度 f(x) 乘宽度 h。再除以 h，最后只剩高度 f(x)。',
      },
      {
        id: 'visual-strip',
        label: '新增小条图像',
        rect: [95, 478, 660, 300],
        speech:
          '图上的橙色小条就是这个新增面积。你可以把 FTC I 记成一句话：累积函数的瞬时变化率，等于当前被积函数的高度。',
      },
    ],
  },
  {
    title: '变上限积分与链式法则',
    render: slideChainRule,
    steps: [
      {
        id: 'upper-limit-rule',
        label: '变上限公式',
        rect: [55, 160, 700, 220],
        speech:
          '变上限积分的题，第一眼先看谁在动。如果上限不是 x，而是 g(x)，就先把 g(x) 代进被积函数，再乘 g prime x。这就是 FTC I 加链式法则。',
      },
      {
        id: 'two-moving-limits',
        label: '上下限都变',
        rect: [845, 160, 700, 220],
        speech:
          '如果上下限都依赖 x，就分开处理。上限移动带正号，下限移动带负号，所以是上限那项减下限那项。',
      },
      {
        id: 'worked-example',
        label: '变上限例题',
        rect: [80, 455, 620, 230],
        speech:
          '例题中，上限是 x squared，被积函数是 cos of t squared。先把 t 换成 x squared，得到 cos of x to the fourth；再乘上上限 x squared 的导数，也就是二 x。',
      },
      {
        id: 'memory-rule',
        label: '记忆方式',
        rect: [840, 455, 620, 230],
        speech:
          '记忆方式很简单：上限动就加，下限动就减；每一项都要把对应限代入 f，再乘这个限自己的导数。',
      },
    ],
  },
  {
    title: '计算工具箱：常用反导函数',
    render: slideFormulaToolbox,
    steps: [
      {
        id: 'formula-table',
        label: '常用反导表',
        rect: [90, 150, 1420, 575],
        speech:
          '这一页是工具箱，不是新概念。做 FTC II 计算时，你真正需要的是快速找到反导函数。幂函数、指数函数、一 over x、三角函数和 arctan 这几类要先熟。',
      },
      {
        id: 'definite-workflow',
        label: '定积分计算流程',
        rect: [245, 765, 1100, 70],
        speech:
          '使用顺序是：先认函数类型，再找反导函数，再代上端点减下端点。最后再次提醒，定积分最终答案不要加 C。',
      },
    ],
  },
  {
    title: '本节课总结：定积分的三种面孔',
    render: slideSummary,
    steps: [
      {
        id: 'top-flow',
        label: '五步知识流',
        rect: [70, 165, 1250, 80],
        speech:
          '总结一下今天的知识流：先从黎曼和定义定积分，再学性质，再用 FTC II 计算，再把 Riemann sum 翻译回积分，最后用 FTC I 处理变上限积分。',
      },
      {
        id: 'today-skills',
        label: '本节课能力总结',
        rect: [90, 310, 650, 340],
        speech:
          '学完这一节，你应该能解释定积分的意义，能用基本性质拆积分，能用反导函数计算定积分，也能识别极限求和式对应的定积分。',
      },
      {
        id: 'next-hook',
        label: '下节课钩子',
        rect: [840, 310, 650, 340],
        speech:
          '下一节，我们会开始系统练计算技巧。定积分不再只是定义和性质，而会变成解决面积、净变化和应用题的工具。',
      },
      {
        id: 'final-identity',
        label: '三种面孔公式',
        rect: [270, 705, 1060, 125],
        speech: '最后记住这一条主线：定积分既是面积极限，也是净面积，也是原函数端点差。',
      },
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
  if (order === 0) return [];
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
      themeColors: [C.teal, C.blue, C.orange, C.ink],
      fontColor: C.ink,
      fontName: 'Inter',
      outline: { color: C.teal, width: 2, style: 'solid' },
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
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const renderProgrammaticSlides = process.env.RENDER_PROGRAMMATIC_SLIDES === '1';

  for (const fileName of fs.readdirSync(OUTPUT_DIR)) {
    if (
      fileName === 'contact-sheet.png' ||
      (renderProgrammaticSlides && /^slide-\d+\.png$/.test(fileName))
    ) {
      fs.unlinkSync(path.join(OUTPUT_DIR, fileName));
    }
  }

  if (renderProgrammaticSlides) {
    for (const [index, slide] of slides.entries()) {
      await sharp(slide.render())
        .png()
        .toFile(path.join(OUTPUT_DIR, `slide-${String(index + 1).padStart(2, '0')}.png`));
    }
  } else {
    for (const [index] of slides.entries()) {
      const fileName = `slide-${String(index + 1).padStart(2, '0')}.png`;
      if (!fs.existsSync(path.join(OUTPUT_DIR, fileName))) {
        throw new Error(`Missing imagegen slide asset: ${path.join(OUTPUT_DIR, fileName)}`);
      }
    }
  }

  const hitMap = {
    notebookId: NOTEBOOK_ID,
    source: renderProgrammaticSlides
      ? 'programmatic-raster-definite-integral-from-week1-pdf'
      : 'imagegen-full-slide-definite-integral-from-week1-pdf',
    slides: slides.map((slide, index) => ({
      order: index,
      title: slide.title,
      image: `${PUBLIC_DIR}/slide-${String(index + 1).padStart(2, '0')}.png`,
      hitMap: semanticHitMapFor(index),
    })),
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'semantic-hit-map.json'), JSON.stringify(hitMap, null, 2));

  const composites = [];
  for (const [index, slide] of slides.entries()) {
    const file = path.join(OUTPUT_DIR, `slide-${String(index + 1).padStart(2, '0')}.png`);
    const labelSvg = `<svg width="400" height="42" xmlns="http://www.w3.org/2000/svg"><rect width="400" height="42" fill="#0f172a"/><text x="16" y="28" fill="#ffffff" font-size="19" font-family="Arial">${index + 1}. ${esc(slide.title)}</text></svg>`;
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

  await sharp({
    create: {
      width: 800,
      height: Math.ceil(slides.length / 2) * 267,
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
        name: 'Week 1：定积分 · 从面积到计算',
        description:
          'MAT 136 Week 1 definite integral notebook in full-slide PNG format. Covers definite integral as a Riemann-sum limit, signed area, properties, FTC II, Riemann-sum conversion, net change, FTC I, variable limits, and a next-lesson hook.',
        tags: ['MAT136', 'Definite Integral', '定积分', 'FTC', 'semantic-hit-map'],
        avatarUrl: '/avatars/notebook-agents/avatar8.avif',
        language: 'zh-CN',
        style: 'direct-raster-slide-semantic-hit-map',
        updatedAt: NOW,
      },
      create: {
        id: NOTEBOOK_ID,
        ownerId: course.ownerId,
        courseId: course.id,
        name: 'Week 1：定积分 · 从面积到计算',
        description:
          'MAT 136 Week 1 definite integral notebook in full-slide PNG format. Covers definite integral as a Riemann-sum limit, signed area, properties, FTC II, Riemann-sum conversion, net change, FTC I, variable limits, and a next-lesson hook.',
        tags: ['MAT136', 'Definite Integral', '定积分', 'FTC', 'semantic-hit-map'],
        avatarUrl: '/avatars/notebook-agents/avatar8.avif',
        language: 'zh-CN',
        style: 'direct-raster-slide-semantic-hit-map',
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
