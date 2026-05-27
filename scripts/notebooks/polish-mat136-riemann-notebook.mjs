#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { generatedNotebookDir, generatedNotebookPublicPath } from '../shared/paths.mjs';

const NOTEBOOK_ID = 'nb-mat136-riemann-sums-week1-20260518162551';
const COURSE_ID = 'cmpanemia001v8ouzmhttvkrn';
const OUTPUT_DIR = generatedNotebookDir(NOTEBOOK_ID);
const PUBLIC_DIR = generatedNotebookPublicPath(NOTEBOOK_ID);
const NOW = new Date();

const FONT = 'Inter, PingFang SC, Microsoft YaHei, Arial, sans-serif';
const MATH = 'Times New Roman, STIX Two Math, Cambria Math, serif';

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

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textUnits(value) {
  return Array.from(String(value)).reduce((sum, ch) => {
    if (/[\u4e00-\u9fff]/.test(ch)) return sum + 1.78;
    if (/[A-Z]/.test(ch)) return sum + 1.08;
    return sum + 1;
  }, 0);
}

function wrap(value, maxUnits) {
  const pieces = String(value).split(/(\s+)/);
  const lines = [];
  let current = '';
  for (const piece of pieces) {
    if (!piece) continue;
    if (/^\s+$/.test(piece)) {
      if (current && !current.endsWith(' ')) current += ' ';
      continue;
    }
    const proposed = current ? `${current}${piece}` : piece;
    if (textUnits(proposed) <= maxUnits) {
      current = proposed;
      continue;
    }
    if (current.trim()) lines.push(current.trim());
    current = '';
    for (const ch of Array.from(piece)) {
      const next = current + ch;
      if (textUnits(next) > maxUnits && current) {
        lines.push(current);
        current = ch;
      } else {
        current = next;
      }
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}

function label(x, y, value, options = {}) {
  const size = options.size ?? 28;
  const lines = Array.isArray(value)
    ? value.flatMap((line) => wrap(line, options.maxUnits ?? 40))
    : wrap(value, options.maxUnits ?? 40);
  const family = options.family ?? FONT;
  const lineHeight = options.lineHeight ?? Math.round(size * 1.28);
  const attrs = [
    `x="${x}"`,
    `y="${y}"`,
    `fill="${options.color ?? '#0f172a'}"`,
    `font-size="${size}"`,
    `font-weight="${options.weight ?? 600}"`,
    `font-family="${esc(family)}"`,
    `text-anchor="${options.anchor ?? 'start'}"`,
  ].join(' ');
  return `<text ${attrs}>${lines
    .map(
      (line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${esc(line)}</tspan>`,
    )
    .join('')}</text>`;
}

function mathText(x, y, value, options = {}) {
  return label(x, y, value, {
    size: options.size ?? 44,
    weight: options.weight ?? 700,
    color: options.color ?? '#0f172a',
    family: MATH,
    maxUnits: options.maxUnits ?? 50,
    lineHeight: options.lineHeight ?? Math.round((options.size ?? 44) * 1.28),
    anchor: options.anchor,
  });
}

function chip(x, y, value, color = '#2563eb') {
  const width = Math.max(122, textUnits(value) * 13 + 46);
  return `<g>
    <rect x="${x}" y="${y}" width="${width}" height="44" rx="22" fill="${color}" opacity="0.12"/>
    <text x="${x + 23}" y="${y + 29}" fill="${color}" font-size="22" font-weight="800" font-family="${FONT}">${esc(value)}</text>
  </g>`;
}

function card(x, y, w, h, title, body, color = '#2563eb') {
  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="#ffffff" stroke="#d7e0ea" stroke-width="2"/>
    <rect x="${x}" y="${y}" width="${w}" height="8" rx="4" fill="${color}"/>
    ${label(x + 28, y + 54, title, {
      size: 28,
      weight: 850,
      maxUnits: Math.floor(w / 19),
    })}
    ${label(x + 28, y + 102, body, {
      size: 24,
      weight: 560,
      color: '#475569',
      maxUnits: Math.floor(w / 15),
      lineHeight: 34,
    })}
  </g>`;
}

function frame(slideNo, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
    <defs>
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M40 0H0V40" fill="none" stroke="#e9eef4" stroke-width="1"/>
      </pattern>
      <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fbfcff"/>
        <stop offset="1" stop-color="#f4faf7"/>
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#0f172a" flood-opacity="0.14"/>
      </filter>
      <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M0 0L10 5L0 10Z" fill="#0f172a"/>
      </marker>
    </defs>
    <rect width="1600" height="900" fill="url(#paper)"/>
    <rect width="1600" height="900" fill="url(#grid)" opacity="0.55"/>
    <path d="M0 814C276 752 438 826 676 792C982 748 1118 792 1600 720V900H0Z" fill="#e7f7f2" opacity="0.85"/>
    <text x="82" y="64" fill="#64748b" font-size="23" font-weight="800" font-family="${FONT}">MAT 136 · Riemann Sums</text>
    <text x="1518" y="64" fill="#64748b" font-size="23" font-weight="800" text-anchor="end" font-family="${FONT}">${String(slideNo).padStart(2, '0')}</text>
    ${body}
  </svg>`;
}

function axes(x, y, w, h, options = {}) {
  const c = options.color ?? '#0f172a';
  return `<g fill="none" stroke="${c}" stroke-width="${options.width ?? 5}" stroke-linecap="round">
    <path d="M${x} ${y + h}H${x + w}" marker-end="url(#arrow)"/>
    <path d="M${x} ${y + h}V${y}" marker-end="url(#arrow)"/>
  </g>`;
}

function curve(x, y, w, h, kind = 'inc', color = '#ef4444', width = 7) {
  const d =
    kind === 'dec'
      ? `M${x} ${y + 52}C${x + 150} ${y + 82},${x + 330} ${y + h - 72},${x + w} ${y + h - 46}`
      : kind === 'wave'
        ? `M${x} ${y + h - 90}C${x + 130} ${y + 20},${x + 270} ${y + h - 54},${x + 420} ${y + 72}S${x + 700} ${y + h - 40},${x + w} ${y + 112}`
        : `M${x} ${y + h - 34}C${x + 145} ${y + h - 25},${x + 310} ${y + 140},${x + w} ${y + 38}`;
  return `<path d="${d}" stroke="${color}" stroke-width="${width}" fill="none" stroke-linecap="round"/>`;
}

function bars(x, y, w, h, values, color, opacity = 0.32) {
  const dx = w / values.length;
  return values
    .map((v, i) => {
      const bh = h * v;
      return `<rect x="${x + i * dx}" y="${y + h - bh}" width="${dx - 4}" height="${bh}" fill="${color}" opacity="${opacity}" stroke="${color}" stroke-width="2"/>`;
    })
    .join('');
}

function graphCard(x, y, w, h, inner) {
  return `<g filter="url(#shadow)">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="28" fill="#ffffff" stroke="#dbe4ee" stroke-width="2"/>
    ${inner}
  </g>`;
}

function numberLine(x, y, w, labels, highlight = []) {
  const dx = w / (labels.length - 1);
  return `<g>
    <path d="M${x} ${y}H${x + w}" stroke="#0f172a" stroke-width="6" stroke-linecap="round"/>
    ${labels
      .map((item, i) => {
        const cx = x + i * dx;
        const isHot = highlight.includes(i);
        return `<g>
          <path d="M${cx} ${y - 13}V${y + 13}" stroke="${isHot ? '#ef4444' : '#64748b'}" stroke-width="${isHot ? 6 : 4}"/>
          <circle cx="${cx}" cy="${y}" r="${isHot ? 12 : 0}" fill="#ef4444"/>
          <text x="${cx}" y="${y + 48}" text-anchor="middle" fill="#334155" font-size="26" font-weight="700" font-family="${FONT}">${esc(item)}</text>
        </g>`;
      })
      .join('')}
  </g>`;
}

const slides = [
  {
    title: '今天只做一件事：用矩形理解变化',
    narration: '这版只讲黎曼和。我们先不进入定积分性质，而是把变化中的总量如何被矩形近似讲清楚。',
    svg: frame(
      1,
      `
      ${chip(86, 112, '只讲 Riemann Sum', '#0f766e')}
      ${label(86, 222, '把连续变化', { size: 74, weight: 900, maxUnits: 14 })}
      ${label(86, 312, '切成小矩形', { size: 74, weight: 900, maxUnits: 14 })}
      ${label(92, 430, '不碰定积分公式；先练会切区间、选高度、判断偏大/偏小。', {
        size: 34,
        weight: 620,
        color: '#334155',
        maxUnits: 31,
        lineHeight: 48,
      })}
      ${graphCard(
        900,
        156,
        542,
        518,
        `
        ${axes(86 + 900, 74 + 156, 382, 344)}
        ${bars(126 + 900, 164 + 156, 300, 254, [0.14, 0.28, 0.46, 0.67, 0.88], '#14b8a6', 0.38)}
        ${curve(126 + 900, 164 + 156, 300, 254, 'inc', '#ef4444', 8)}
        ${mathText(1015, 638, 'area ≈ Σ rectangles', { size: 34, color: '#0f766e' })}
        `,
      )}
      ${card(90, 650, 382, 132, '直觉', '面积表示累积量', '#2563eb')}
      ${card(504, 650, 382, 132, '算法', '切、取高、相加', '#0f766e')}
      ${card(918, 650, 382, 132, '判断', '增减决定偏差', '#f97316')}
    `,
    ),
  },
  {
    title: '从恒定速度到“面积”',
    narration: '恒定速度的路程是速度乘时间。画在速度时间图上，这就是矩形面积。',
    svg: frame(
      2,
      `
      ${chip(86, 112, '旧知识', '#2563eb')}
      ${label(86, 198, '恒定速度：一个矩形就够了', { size: 58, weight: 900, maxUnits: 22 })}
      ${graphCard(
        114,
        286,
        870,
        455,
        `
        ${axes(220, 356, 620, 300)}
        <rect x="302" y="426" width="430" height="230" fill="#bfdbfe" stroke="#2563eb" stroke-width="4"/>
        <path d="M302 426H732" stroke="#2563eb" stroke-width="8"/>
        <text x="250" y="438" fill="#2563eb" font-size="31" font-weight="850" font-family="${FONT}">50</text>
        <text x="520" y="704" fill="#475569" font-size="28" text-anchor="middle" font-family="${FONT}">4 hours</text>
        <text x="522" y="546" fill="#0f172a" font-size="46" font-weight="900" text-anchor="middle" font-family="${FONT}">50 × 4 = 200</text>
        `,
      )}
      ${label(1088, 338, '第一句翻译', { size: 31, weight: 850, color: '#2563eb' })}
      ${mathText(1088, 430, 'distance = rate × time', { size: 43, maxUnits: 30 })}
      ${mathText(1088, 508, '= area under v(t)', { size: 43, color: '#0f766e', maxUnits: 30 })}
      ${label(1092, 624, '下一步：如果速度不是水平线，就把曲线下面切成很多小矩形。', {
        size: 31,
        weight: 620,
        color: '#334155',
        maxUnits: 22,
        lineHeight: 44,
      })}
    `,
    ),
  },
  {
    title: '速度变化时：先承认自己只能近似',
    narration: '速度变化时，我们用短时间间隔内的一个代表速度近似整段。采样越密，矩形越贴近曲线。',
    svg: frame(
      3,
      `
      ${chip(86, 112, '采样', '#f97316')}
      ${label(86, 198, '采样越密，矩形越贴近曲线', { size: 58, weight: 900, maxUnits: 22 })}
      ${graphCard(
        94,
        300,
        670,
        395,
        `
        ${label(142, 362, '粗分割', { size: 32, weight: 850 })}
        ${axes(156, 412, 500, 205)}
        ${bars(196, 462, 392, 155, [0.3, 0.58, 0.76, 0.58], '#fb923c', 0.34)}
        ${curve(196, 462, 392, 155, 'wave', '#0f172a', 6)}
        ${label(316, 660, '误差明显', { size: 28, weight: 800, color: '#f97316' })}
        `,
      )}
      ${graphCard(
        836,
        300,
        670,
        395,
        `
        ${label(884, 362, '细分割', { size: 32, weight: 850 })}
        ${axes(898, 412, 500, 205)}
        ${bars(938, 462, 392, 155, [0.22, 0.36, 0.54, 0.72, 0.76, 0.66, 0.55, 0.62], '#14b8a6', 0.38)}
        ${curve(938, 462, 392, 155, 'wave', '#0f172a', 6)}
        ${label(1055, 660, '更像真实面积', { size: 28, weight: 800, color: '#0f766e' })}
        `,
      )}
      ${label(334, 792, '问题变成：每个小区间拿哪个点的高度？', {
        size: 38,
        weight: 850,
        color: '#0f172a',
        maxUnits: 32,
      })}
    `,
    ),
  },
  {
    title: '区间分割：先把语言固定下来',
    narration:
      '把区间从 a 到 b 切成 n 份。每份宽度是 delta x 或 delta t，后面所有矩形都用这个宽度。',
    svg: frame(
      4,
      `
      ${chip(86, 112, 'Notation', '#0f766e')}
      ${label(86, 198, '先把 [a, b] 切成 n 份', { size: 60, weight: 900, maxUnits: 20 })}
      ${numberLine(204, 390, 1190, ['a=t₀', 't₁', 't₂', 't₃', '…', 'tₙ=b'])}
      <path d="M446 520H682" stroke="#0f766e" stroke-width="8" marker-end="url(#arrow)"/>
      ${mathText(474, 590, 'Δt = (b-a)/n', { size: 50, color: '#0f766e' })}
      ${card(140, 690, 385, 118, '宽度', '每一段都是 Δt', '#0f766e')}
      ${card(608, 690, 385, 118, '高度', '来自某个 sample point', '#2563eb')}
      ${card(1076, 690, 385, 118, '面积', 'height × Δt', '#f97316')}
    `,
    ),
  },
  {
    title: 'Left-hand Sum：用左端点当高度',
    narration: '左端点和在每个小区间取左边的函数值当高度。对递增函数，它会落在曲线下面。',
    svg: frame(
      5,
      `
      ${chip(86, 112, 'Left-hand Sum', '#2563eb')}
      ${label(86, 198, '用每段的左端点做高度', { size: 58, weight: 900, maxUnits: 22 })}
      ${graphCard(
        96,
        288,
        820,
        458,
        `
        ${axes(186, 350, 610, 292)}
        ${bars(236, 438, 490, 204, [0.17, 0.3, 0.46, 0.66, 0.84], '#60a5fa', 0.36)}
        ${curve(236, 438, 490, 204, 'inc', '#ef4444', 8)}
        ${label(354, 694, 'height = f(left endpoint)', { size: 26, weight: 800, color: '#2563eb' })}
        `,
      )}
      ${mathText(1010, 350, 'Lₙ = Σᵢ₌₀ⁿ⁻¹ f(tᵢ) Δt', { size: 56, maxUnits: 28 })}
      ${label(1016, 468, '展开时，最后一个高度是 f(tₙ₋₁)，不是 f(tₙ)。', {
        size: 33,
        weight: 620,
        color: '#334155',
        maxUnits: 22,
        lineHeight: 46,
      })}
      ${label(1016, 634, '递增函数：左端点通常低估。', {
        size: 36,
        weight: 850,
        color: '#2563eb',
        maxUnits: 22,
      })}
    `,
    ),
  },
  {
    title: 'Right-hand Sum：用右端点当高度',
    narration: '右端点和在每个小区间取右边的函数值当高度。对递增函数，它会落在曲线上方。',
    svg: frame(
      6,
      `
      ${chip(86, 112, 'Right-hand Sum', '#ef4444')}
      ${label(86, 198, '用每段的右端点做高度', { size: 58, weight: 900, maxUnits: 22 })}
      ${graphCard(
        96,
        288,
        820,
        458,
        `
        ${axes(186, 350, 610, 292)}
        ${bars(236, 438, 490, 204, [0.3, 0.46, 0.66, 0.84, 0.98], '#fb7185', 0.34)}
        ${curve(236, 438, 490, 204, 'inc', '#0f766e', 8)}
        ${label(350, 694, 'height = f(right endpoint)', { size: 26, weight: 800, color: '#ef4444' })}
        `,
      )}
      ${mathText(1010, 350, 'Rₙ = Σᵢ₌₁ⁿ f(tᵢ) Δt', { size: 56, maxUnits: 28 })}
      ${label(1016, 468, '展开时，第一个高度是 f(t₁)，最后一个高度是 f(tₙ)。', {
        size: 33,
        weight: 620,
        color: '#334155',
        maxUnits: 22,
        lineHeight: 46,
      })}
      ${label(1016, 634, '递增函数：右端点通常高估。', {
        size: 36,
        weight: 850,
        color: '#ef4444',
        maxUnits: 22,
      })}
    `,
    ),
  },
  {
    title: '递增/递减决定高估还是低估',
    narration: '单调性直接决定估计方向。递增时左低右高，递减时左高右低。',
    svg: frame(
      7,
      `
      ${chip(86, 112, 'Error Direction', '#7c3aed')}
      ${label(86, 198, '先看趋势，再判断偏差', { size: 58, weight: 900, maxUnits: 22 })}
      ${graphCard(
        96,
        300,
        650,
        368,
        `
        ${label(150, 365, '递增函数', { size: 32, weight: 850 })}
        ${axes(154, 410, 486, 178)}
        ${bars(194, 462, 392, 126, [0.18, 0.32, 0.5, 0.7, 0.9], '#60a5fa', 0.34)}
        ${curve(194, 462, 392, 126, 'inc', '#ef4444', 6)}
        ${label(184, 625, 'Left 低估', { size: 28, color: '#2563eb', weight: 900 })}
        ${label(444, 625, 'Right 高估', { size: 28, color: '#ef4444', weight: 900 })}
        `,
      )}
      ${graphCard(
        854,
        300,
        650,
        368,
        `
        ${label(908, 365, '递减函数', { size: 32, weight: 850 })}
        ${axes(912, 410, 486, 178)}
        ${bars(952, 462, 392, 126, [0.9, 0.7, 0.5, 0.32, 0.18], '#fb7185', 0.34)}
        ${curve(952, 462, 392, 126, 'dec', '#0f766e', 6)}
        ${label(942, 625, 'Left 高估', { size: 28, color: '#ef4444', weight: 900 })}
        ${label(1202, 625, 'Right 低估', { size: 28, color: '#0f766e', weight: 900 })}
        `,
      )}
      ${label(450, 780, '口诀：递增左低右高；递减左高右低。', {
        size: 42,
        weight: 900,
        color: '#0f172a',
        maxUnits: 32,
      })}
    `,
    ),
  },
  {
    title: '例题：从选项读出 RHS',
    narration: '区间二到四切成四段，宽度是二分之一。右端点依次是二点五、三、三点五、四。',
    svg: frame(
      8,
      `
      ${chip(86, 112, 'Example', '#0f766e')}
      ${label(86, 198, '[2,4], n=4：右端点在哪里？', { size: 58, weight: 900, maxUnits: 25 })}
      ${numberLine(204, 390, 1190, ['2', '2.5', '3', '3.5', '4'], [1, 2, 3, 4])}
      ${label(612, 520, 'RHS 取每段右端点', { size: 34, weight: 900, color: '#ef4444', maxUnits: 26 })}
      ${card(140, 638, 360, 120, '宽度', 'Δx = (4-2)/4 = 1/2', '#0f766e')}
      ${card(620, 638, 360, 120, '高度', '2.5, 3, 3.5, 4', '#ef4444')}
      ${card(1100, 638, 360, 120, '结构', '同一个 Δx 乘每个高度', '#2563eb')}
      ${mathText(268, 826, 'R₄ = 1/2 [6√2.5 + 6√3 + 6√3.5 + 6√4]', {
        size: 43,
        maxUnits: 58,
      })}
    `,
    ),
  },
  {
    title: '概念陷阱：n 越大，Rₙ 一定越大吗？',
    narration:
      '更多矩形并不意味着右端点和一定更大。函数 f x 等于 x 在零到一上的三份和四份就是反例。',
    svg: frame(
      9,
      `
      ${chip(86, 112, 'Trap', '#dc2626')}
      ${label(86, 198, '更多矩形 ≠ Rₙ 一定更大', { size: 58, weight: 900, maxUnits: 23 })}
      ${card(94, 300, 426, 150, '错误猜想', '递增函数会不会总有 Rₙ ≤ Rₙ₊₁？', '#dc2626')}
      ${mathText(112, 535, 'f(x)=x on [0,1]', { size: 42, color: '#0f172a' })}
      ${mathText(112, 624, 'R₃ = 2/3', { size: 42, color: '#ef4444' })}
      ${mathText(112, 700, 'R₄ = 5/8', { size: 42, color: '#0f766e' })}
      ${label(116, 784, '因为 2/3 > 5/8，猜想为假。', {
        size: 32,
        weight: 850,
        color: '#0f172a',
        maxUnits: 24,
      })}
      ${graphCard(
        646,
        292,
        820,
        455,
        `
        ${axes(732, 368, 630, 264)}
        ${bars(782, 442, 252, 190, [1 / 3, 2 / 3, 1], '#fb7185', 0.32)}
        ${bars(1088, 442, 252, 190, [1 / 4, 2 / 4, 3 / 4, 1], '#14b8a6', 0.35)}
        <path d="M782 632L1362 442" stroke="#0f172a" stroke-width="6" fill="none"/>
        ${label(870, 680, 'n=3', { size: 28, weight: 900, color: '#ef4444' })}
        ${label(1182, 680, 'n=4', { size: 28, weight: 900, color: '#0f766e' })}
        `,
      )}
    `,
    ),
  },
  {
    title: '总结与下节课的钩子',
    narration:
      '今天的全部结构是切区间、选高度、求矩形和。下节课把矩形越来越薄时逼近的稳定值正式叫做定积分。',
    svg: frame(
      10,
      `
      ${chip(86, 112, 'Summary', '#0f766e')}
      ${label(86, 198, '今天的流程', { size: 62, weight: 900, maxUnits: 16 })}
      <g transform="translate(132 340)">
        <rect x="0" y="0" width="290" height="132" rx="22" fill="#ffffff" stroke="#dbe4ee" stroke-width="2"/>
        <text x="145" y="56" text-anchor="middle" font-size="31" font-weight="900" fill="#0f172a" font-family="${FONT}">切区间</text>
        <text x="145" y="96" text-anchor="middle" font-size="25" font-weight="650" fill="#64748b" font-family="${FONT}">partition</text>
        <path d="M316 66H426" stroke="#0f172a" stroke-width="5" marker-end="url(#arrow)"/>
        <rect x="450" y="0" width="290" height="132" rx="22" fill="#ffffff" stroke="#dbe4ee" stroke-width="2"/>
        <text x="595" y="56" text-anchor="middle" font-size="31" font-weight="900" fill="#0f172a" font-family="${FONT}">选高度</text>
        <text x="595" y="96" text-anchor="middle" font-size="25" font-weight="650" fill="#64748b" font-family="${FONT}">sample</text>
        <path d="M766 66H876" stroke="#0f172a" stroke-width="5" marker-end="url(#arrow)"/>
        <rect x="900" y="0" width="290" height="132" rx="22" fill="#ffffff" stroke="#dbe4ee" stroke-width="2"/>
        <text x="1045" y="56" text-anchor="middle" font-size="31" font-weight="900" fill="#0f172a" font-family="${FONT}">求和</text>
        <text x="1045" y="96" text-anchor="middle" font-size="25" font-weight="650" fill="#64748b" font-family="${FONT}">sum</text>
      </g>
      ${mathText(382, 580, 'Σ f(sample point) · Δt', { size: 58, color: '#0f766e' })}
      <g filter="url(#shadow)">
        <rect x="190" y="680" width="1220" height="128" rx="28" fill="#0f172a"/>
        ${label(242, 730, '下节课', { size: 34, weight: 900, color: '#ffffff', maxUnits: 12 })}
        ${label(430, 730, '当矩形无限变薄，左右端点和逼近同一个稳定值。这个值叫什么？', {
          size: 32,
          weight: 760,
          color: '#dbeafe',
          maxUnits: 42,
        })}
        ${mathText(430, 784, 'limit of Riemann sums → definite integral', {
          size: 34,
          color: '#99f6e4',
          maxUnits: 48,
        })}
      </g>
    `,
    ),
  },
];

function imageElement(order) {
  const fileName = `slide-${String(order + 1).padStart(2, '0')}.png`;
  return {
    id: `${NOTEBOOK_ID}-image-${String(order + 1).padStart(2, '0')}`,
    type: 'image',
    left: 0,
    top: 0,
    width: 1000,
    height: 562.5,
    rotate: 0,
    fixedRatio: false,
    src: `${PUBLIC_DIR}/${fileName}`,
    imageType: 'pageFigure',
    radius: 0,
  };
}

function canvasFor(order) {
  return {
    id: `${NOTEBOOK_ID}-canvas-${String(order + 1).padStart(2, '0')}`,
    viewportSize: 1000,
    viewportRatio: 16 / 9,
    theme: {
      backgroundColor: '#fbfcff',
      themeColors: ['#2563eb', '#0f766e', '#ef4444', '#f97316', '#0f172a'],
      fontColor: '#0f172a',
      fontName: 'Inter',
      outline: { color: '#2563eb', width: 2, style: 'solid' },
      shadow: { h: 0, v: 0, blur: 10, color: '#000000' },
    },
    elements: [imageElement(order)],
    background: { type: 'solid', color: '#fbfcff' },
    type: 'content',
  };
}

async function renderSlides() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const [index, slide] of slides.entries()) {
    await sharp(Buffer.from(slide.svg))
      .png()
      .toFile(path.join(OUTPUT_DIR, `slide-${String(index + 1).padStart(2, '0')}.png`));
  }

  const composites = [];
  for (const [index] of slides.entries()) {
    const file = path.join(OUTPUT_DIR, `slide-${String(index + 1).padStart(2, '0')}.png`);
    const labelSvg = `<svg width="320" height="36" xmlns="http://www.w3.org/2000/svg"><rect width="320" height="36" fill="#0f172a"/><text x="14" y="24" fill="#ffffff" font-size="18" font-family="Arial">${index + 1}. slide-${String(index + 1).padStart(2, '0')}.png</text></svg>`;
    const thumb = await sharp(file)
      .resize(320, 180)
      .extend({ top: 0, bottom: 36, left: 0, right: 0, background: '#ffffff' })
      .composite([{ input: Buffer.from(labelSvg), top: 180, left: 0 }])
      .png()
      .toBuffer();
    composites.push({
      input: thumb,
      left: (index % 2) * 320,
      top: Math.floor(index / 2) * 216,
    });
  }

  await sharp({
    create: {
      width: 640,
      height: Math.ceil(slides.length / 2) * 216,
      channels: 4,
      background: '#e5e7eb',
    },
  })
    .composite(composites)
    .png()
    .toFile(path.join(OUTPUT_DIR, 'contact-sheet.png'));
}

async function updateNotebook() {
  loadEnvLocal();
  const prisma = new PrismaClient();
  try {
    const notebook = await prisma.notebook.findUnique({ where: { id: NOTEBOOK_ID } });
    if (!notebook) throw new Error(`Notebook not found: ${NOTEBOOK_ID}`);
    if (notebook.courseId !== COURSE_ID) {
      throw new Error(`Notebook is not attached to expected course: ${notebook.courseId}`);
    }

    await prisma.notebook.update({
      where: { id: NOTEBOOK_ID },
      data: {
        name: 'Week 1：黎曼和与面积近似',
        description:
          'MAT 136 Week 1 Riemann Sum polished visual notebook。只覆盖定积分前的黎曼和、左右端点和、高估/低估、例题与反例。',
        style: 'polished-visual-math',
        updatedAt: NOW,
      },
    });

    const existing = await prisma.scene.findMany({
      where: { notebookId: NOTEBOOK_ID },
      orderBy: { order: 'asc' },
      select: { id: true },
    });

    await prisma.$transaction(
      slides.map((slide, index) => {
        const content = {
          type: 'slide',
          canvas: canvasFor(index),
          webRenderMode: 'slide',
        };
        const actions = [
          {
            id: `${NOTEBOOK_ID}-speech-${String(index + 1).padStart(2, '0')}`,
            type: 'speech',
            text: slide.narration,
          },
        ];
        const id = existing[index]?.id || `${NOTEBOOK_ID}-p${String(index + 1).padStart(2, '0')}`;
        return prisma.scene.upsert({
          where: { id },
          update: {
            title: slide.title,
            order: index,
            type: 'slide',
            content,
            actions,
            whiteboard: null,
            updatedAt: NOW,
          },
          create: {
            id,
            notebookId: NOTEBOOK_ID,
            title: slide.title,
            order: index,
            type: 'slide',
            content,
            actions,
            whiteboard: null,
            createdAt: NOW,
            updatedAt: NOW,
          },
        });
      }),
    );

    if (existing.length > slides.length) {
      await prisma.scene.deleteMany({
        where: {
          notebookId: NOTEBOOK_ID,
          id: { in: existing.slice(slides.length).map((scene) => scene.id) },
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

await renderSlides();
await updateNotebook();

console.log(
  JSON.stringify(
    {
      notebookId: NOTEBOOK_ID,
      slides: slides.length,
      outputDir: OUTPUT_DIR,
    },
    null,
    2,
  ),
);
