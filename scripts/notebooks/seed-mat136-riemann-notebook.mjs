#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { generatedNotebookDir, generatedNotebookPublicPath } from '../shared/paths.mjs';

const COURSE_ID = 'cmpanemia001v8ouzmhttvkrn';
const NOW = new Date();
const RUN_STAMP = NOW.toISOString().replace(/\D/g, '').slice(0, 14);
const NOTEBOOK_ID = `nb-mat136-riemann-sums-week1-${RUN_STAMP}`;
const OUTPUT_DIR = generatedNotebookDir(NOTEBOOK_ID);
const PUBLIC_DIR = generatedNotebookPublicPath(NOTEBOOK_ID);

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

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function lineUnits(text) {
  return Array.from(text).reduce((sum, ch) => sum + (/[\u4e00-\u9fff]/.test(ch) ? 1.8 : 1), 0);
}

function wrapText(text, maxUnits) {
  const lines = [];
  let current = '';
  for (const token of String(text).split(/(\s+)/)) {
    if (!token) continue;
    if (/\s+/.test(token)) {
      if (current && !current.endsWith(' ')) current += ' ';
      continue;
    }
    let next = current ? `${current}${token}` : token;
    if (lineUnits(next) <= maxUnits) {
      current = next;
      continue;
    }
    if (current.trim()) lines.push(current.trim());
    current = '';
    for (const ch of Array.from(token)) {
      next = current + ch;
      if (lineUnits(next) > maxUnits && current) {
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

function textBlock(x, y, lines, options = {}) {
  const {
    size = 34,
    color = '#18243a',
    weight = 500,
    maxUnits = 36,
    lineHeight = Math.round(size * 1.32),
    family = 'Inter, "PingFang SC", "Microsoft YaHei", Arial, sans-serif',
    anchor = 'start',
    className = '',
  } = options;
  const expanded = [];
  for (const line of Array.isArray(lines) ? lines : [lines]) {
    if (typeof line === 'string') expanded.push(...wrapText(line, maxUnits));
    else expanded.push(line);
  }
  return `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-weight="${weight}" font-family="${escapeXml(family)}" text-anchor="${anchor}" class="${className}">
${expanded
  .map(
    (line, index) =>
      `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`,
  )
  .join('\n')}
</text>`;
}

function formula(x, y, text, options = {}) {
  return textBlock(x, y, text, {
    size: options.size ?? 38,
    color: options.color ?? '#111827',
    weight: options.weight ?? 600,
    maxUnits: options.maxUnits ?? 42,
    lineHeight: options.lineHeight ?? 50,
    family: '"Times New Roman", "STIX Two Math", "Cambria Math", serif',
    anchor: options.anchor ?? 'start',
  });
}

function pill(x, y, text, color = '#0f766e') {
  return `<g>
  <rect x="${x}" y="${y}" width="${Math.max(132, text.length * 16 + 40)}" height="42" rx="21" fill="${color}" opacity="0.12"/>
  <text x="${x + 22}" y="${y + 28}" fill="${color}" font-size="21" font-weight="700" font-family="Inter, PingFang SC, sans-serif">${escapeXml(text)}</text>
</g>`;
}

function card(x, y, w, h, title, body, options = {}) {
  const accent = options.accent || '#2563eb';
  const bodySize = options.bodySize || 24;
  return `<g>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="#ffffff" stroke="#dbe4f0" stroke-width="2"/>
  <rect x="${x}" y="${y}" width="${w}" height="9" rx="4.5" fill="${accent}"/>
  ${textBlock(x + 28, y + 54, title, {
    size: options.titleSize || 28,
    color: '#111827',
    weight: 800,
    maxUnits: Math.floor(w / 19),
  })}
  ${textBlock(x + 28, y + 100, body, {
    size: bodySize,
    color: '#475569',
    weight: 500,
    maxUnits: Math.floor(w / (bodySize * 0.58)),
    lineHeight: Math.round(bodySize * 1.42),
  })}
</g>`;
}

function axes(x, y, w, h, options = {}) {
  const stroke = options.stroke || '#1f2937';
  return `<g stroke="${stroke}" stroke-width="4" fill="none" stroke-linecap="round">
  <path d="M ${x} ${y + h} H ${x + w}"/>
  <path d="M ${x} ${y + h} V ${y}"/>
  <path d="M ${x + w - 16} ${y + h - 10} L ${x + w} ${y + h} L ${x + w - 16} ${y + h + 10}"/>
  <path d="M ${x - 10} ${y + 16} L ${x} ${y} L ${x + 10} ${y + 16}"/>
</g>`;
}

function curvePath(x, y, w, h, kind = 'increasing') {
  if (kind === 'decreasing')
    return `M ${x} ${y + 54} C ${x + 210} ${y + 96}, ${x + 360} ${y + h - 70}, ${x + w} ${y + h - 44}`;
  if (kind === 'wavy')
    return `M ${x} ${y + h - 100} C ${x + 130} ${y + 20}, ${x + 265} ${y + h - 70}, ${x + 420} ${y + 72} S ${x + 700} ${y + h - 36}, ${x + w} ${y + 120}`;
  return `M ${x} ${y + h - 38} C ${x + 160} ${y + h - 20}, ${x + 310} ${y + 155}, ${x + w} ${y + 36}`;
}

function riemannBars(x, y, w, h, samples, color = '#38bdf8', opacity = 0.34) {
  const n = samples.length;
  const dx = w / n;
  return samples
    .map((v, i) => {
      const bh = h * v;
      return `<rect x="${x + i * dx}" y="${y + h - bh}" width="${dx - 3}" height="${bh}" fill="${color}" opacity="${opacity}" stroke="${color}" stroke-width="2"/>`;
    })
    .join('\n');
}

function partitionTicks(x, y, w, labels) {
  const dx = w / (labels.length - 1);
  return `<g font-family="Inter, PingFang SC, sans-serif" font-size="20" fill="#475569">
${labels
  .map(
    (label, i) => `<g>
    <path d="M ${x + i * dx} ${y - 8} V ${y + 8}" stroke="#475569" stroke-width="3"/>
    <text x="${x + i * dx}" y="${y + 34}" text-anchor="middle">${escapeXml(label)}</text>
  </g>`,
  )
  .join('\n')}
</g>`;
}

function slideFrame(slide) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fffdf7"/>
      <stop offset="0.58" stop-color="#f8fbff"/>
      <stop offset="1" stop-color="#eef7f6"/>
    </linearGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#0f172a" flood-opacity="0.14"/>
    </filter>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#0f172a"/>
    </marker>
  </defs>
  <rect width="1600" height="900" fill="url(#bg)"/>
  <path d="M0 812 C260 760 410 846 652 802 C958 746 1114 800 1600 722 V900 H0Z" fill="#e3f6f2" opacity="0.72"/>
  <text x="78" y="62" font-size="24" fill="#64748b" font-weight="700" font-family="Inter, PingFang SC, sans-serif">MAT 136 · Week 1 · Riemann Sums</text>
  <text x="1522" y="62" font-size="24" fill="#64748b" text-anchor="end" font-weight="700" font-family="Inter, PingFang SC, sans-serif">${String(slide.order + 1).padStart(2, '0')}</text>
  ${slide.body}
</svg>`;
}

const slides = [
  {
    order: 0,
    title: '今天只做一件事：用矩形理解变化',
    narration:
      '这一页把学习边界说清楚：我们先不进入定积分的正式规则，只把变化中的总量如何被矩形近似这件事讲透。',
    body: `
      ${pill(78, 98, '目标边界', '#0f766e')}
      ${textBlock(78, 186, '黎曼和：把连续变化切成很多小块', {
        size: 58,
        color: '#0f172a',
        weight: 850,
        maxUnits: 24,
        lineHeight: 74,
      })}
      ${textBlock(
        82,
        356,
        '本 notebook 不做定积分公式与性质。我们先练会：怎么切区间、怎么选高度、怎么判断左/右端点估计偏大还是偏小。',
        {
          size: 31,
          color: '#334155',
          maxUnits: 44,
          lineHeight: 44,
        },
      )}
      <g transform="translate(890 150)" filter="url(#softShadow)">
        <rect x="0" y="0" width="560" height="520" rx="34" fill="#ffffff"/>
        <path d="M78 420 H502 M78 420 V72" stroke="#111827" stroke-width="5" fill="none" stroke-linecap="round"/>
        ${riemannBars(112, 154, 330, 266, [0.18, 0.33, 0.53, 0.75, 0.92], '#14b8a6', 0.36)}
        <path d="${curvePath(112, 154, 330, 266)}" stroke="#ef4444" stroke-width="7" fill="none" stroke-linecap="round"/>
        <text x="286" y="480" text-anchor="middle" font-size="28" fill="#334155" font-family="Inter, PingFang SC, sans-serif">总量 ≈ 小矩形面积相加</text>
      </g>
      ${card(82, 622, 375, 150, '直觉', '速度-时间图中，面积对应路程。', { accent: '#2563eb' })}
      ${card(500, 622, 375, 150, '工具', '分割区间，每段用一个高度代替变化。', { accent: '#0f766e' })}
      ${card(918, 622, 375, 150, '判断', '函数增减会决定左/右端点偏大或偏小。', { accent: '#f97316' })}
    `,
  },
  {
    order: 1,
    title: '从恒定速度到“面积”',
    narration:
      '如果速度恒定，路程等于速度乘以时间。把它画成图，就是一个矩形面积。这个旧知识会变成处理变化速度的入口。',
    body: `
      ${pill(78, 98, '动机 1', '#2563eb')}
      ${textBlock(78, 174, '速度不变时，路程就是一个矩形', {
        size: 52,
        color: '#0f172a',
        weight: 850,
        maxUnits: 25,
      })}
      <g transform="translate(90 272)">
        ${axes(0, 0, 640, 420)}
        <rect x="82" y="80" width="450" height="340" fill="#60a5fa" opacity="0.28" stroke="#2563eb" stroke-width="4"/>
        <path d="M82 80 H532" stroke="#2563eb" stroke-width="7"/>
        <text x="18" y="88" fill="#2563eb" font-size="28" font-weight="800" font-family="Inter, PingFang SC, sans-serif">50</text>
        <text x="310" y="468" fill="#475569" font-size="28" text-anchor="middle" font-family="Inter, PingFang SC, sans-serif">4 hours</text>
        <text x="306" y="262" fill="#0f172a" font-size="42" text-anchor="middle" font-weight="800" font-family="Inter, PingFang SC, sans-serif">50 × 4 = 200 miles</text>
        <text x="628" y="465" fill="#475569" font-size="24" font-family="Inter, PingFang SC, sans-serif">t</text>
        <text x="-28" y="18" fill="#475569" font-size="24" font-family="Inter, PingFang SC, sans-serif">v</text>
      </g>
      ${card(850, 266, 560, 160, '关键转译', '“乘法”可以看成“矩形面积”。当速度不再恒定，我们会把曲线下面切成许多近似矩形。', { accent: '#2563eb', bodySize: 25 })}
      ${formula(888, 514, 'distance = rate × time = area', { size: 44 })}
      ${textBlock(882, 610, '今天所有技巧都只是这件事的升级版：把一个大矩形，变成很多小矩形。', {
        size: 31,
        color: '#334155',
        maxUnits: 28,
        lineHeight: 46,
      })}
    `,
  },
  {
    order: 2,
    title: '速度变化时：先承认自己只能近似',
    narration:
      '速度一直在变，我们无法用一个高度代表整段时间。于是选择更短的时间间隔，每段取一个代表速度，矩形就更贴近曲线。',
    body: `
      ${pill(78, 98, '动机 2', '#f97316')}
      ${textBlock(78, 174, '采样越密，矩形越像曲线', {
        size: 54,
        color: '#0f172a',
        weight: 850,
        maxUnits: 24,
      })}
      <g transform="translate(76 265)">
        <rect x="0" y="0" width="674" height="455" rx="30" fill="#ffffff" stroke="#dbe4f0" stroke-width="2"/>
        <text x="44" y="62" font-size="30" font-weight="800" fill="#0f172a" font-family="Inter, PingFang SC, sans-serif">每 0.5 秒测一次</text>
        ${axes(62, 92, 530, 288)}
        ${riemannBars(106, 152, 424, 228, [0.26, 0.54, 0.74, 0.58], '#f97316', 0.3)}
        <path d="${curvePath(106, 152, 424, 228, 'wavy')}" stroke="#0f172a" stroke-width="6" fill="none" stroke-linecap="round"/>
      </g>
      <g transform="translate(850 265)">
        <rect x="0" y="0" width="674" height="455" rx="30" fill="#ffffff" stroke="#dbe4f0" stroke-width="2"/>
        <text x="44" y="62" font-size="30" font-weight="800" fill="#0f172a" font-family="Inter, PingFang SC, sans-serif">每 0.25 秒测一次</text>
        ${axes(62, 92, 530, 288)}
        ${riemannBars(106, 152, 424, 228, [0.22, 0.38, 0.56, 0.72, 0.76, 0.66, 0.55, 0.62], '#14b8a6', 0.32)}
        <path d="${curvePath(106, 152, 424, 228, 'wavy')}" stroke="#0f172a" stroke-width="6" fill="none" stroke-linecap="round"/>
      </g>
      ${textBlock(
        146,
        785,
        '核心问题：每个小区间该拿哪个点当高度？左端点、右端点，还是别的位置？',
        {
          size: 33,
          color: '#0f172a',
          weight: 750,
          maxUnits: 56,
        },
      )}
    `,
  },
  {
    order: 3,
    title: '区间分割：先把语言固定下来',
    narration:
      '黎曼和的第一步是切区间。把从 a 到 b 的区间切成 n 份，每份宽度是 delta t。第 i 个小区间需要一个代表点来决定高度。',
    body: `
      ${pill(78, 98, '语言', '#0f766e')}
      ${textBlock(78, 174, '把 [a, b] 切成 n 份', {
        size: 54,
        color: '#0f172a',
        weight: 850,
        maxUnits: 22,
      })}
      <g transform="translate(170 318)">
        <path d="M0 0 H1160" stroke="#0f172a" stroke-width="6" stroke-linecap="round"/>
        ${partitionTicks(0, 0, 1160, ['a=t₀', 't₁', 't₂', 't₃', '...', 'tₙ=b'])}
        <path d="M236 92 H464" stroke="#14b8a6" stroke-width="8" marker-end="url(#arrow)"/>
        <text x="350" y="144" text-anchor="middle" font-size="34" fill="#0f766e" font-weight="800" font-family="Inter, PingFang SC, sans-serif">Δt = (b-a)/n</text>
      </g>
      ${card(144, 560, 394, 170, '宽度', '每个小矩形都有同样宽度 Δt。', { accent: '#0f766e' })}
      ${card(602, 560, 394, 170, '高度', '高度来自 f(tᵢ) 或 f(tᵢ₋₁)，取决于你选哪个端点。', { accent: '#2563eb' })}
      ${card(1060, 560, 394, 170, '面积', '小矩形面积 = 高度 × 宽度。', { accent: '#f97316' })}
      ${formula(470, 792, 'one rectangle:  f(sample point) · Δt', { size: 40, color: '#111827' })}
    `,
  },
  {
    order: 4,
    title: 'Left-hand Sum：用左端点当高度',
    narration:
      '左端点和就是每个小区间都拿左边的函数值当高度。注意最后一个高度只到 t n minus 1，因为第 n 段的左端点不是 b。',
    body: `
      ${pill(78, 98, 'Left-hand Sum', '#2563eb')}
      ${textBlock(78, 174, '左端点高度：看每段的起点', {
        size: 50,
        color: '#0f172a',
        weight: 850,
        maxUnits: 24,
      })}
      <g transform="translate(95 265)">
        <rect x="0" y="0" width="770" height="478" rx="30" fill="#ffffff" stroke="#dbe4f0" stroke-width="2"/>
        ${axes(70, 66, 602, 340)}
        ${riemannBars(114, 140, 484, 266, [0.2, 0.32, 0.48, 0.68, 0.86], '#60a5fa', 0.35)}
        <path d="${curvePath(114, 140, 484, 266)}" stroke="#ef4444" stroke-width="7" fill="none" stroke-linecap="round"/>
        <text x="384" y="448" text-anchor="middle" font-size="26" fill="#475569" font-family="Inter, PingFang SC, sans-serif">height = f(left endpoint)</text>
      </g>
      <g transform="translate(930 268)">
        ${formula(0, 0, 'Lₙ = Σᵢ₌₀ⁿ⁻¹ f(tᵢ) Δt', { size: 54, maxUnits: 28 })}
        ${textBlock(8, 104, ['展开：', 'f(t₀)Δt + f(t₁)Δt + ... + f(tₙ₋₁)Δt'], {
          size: 34,
          color: '#334155',
          weight: 650,
          maxUnits: 28,
          lineHeight: 50,
        })}
        ${card(0, 280, 520, 176, '读法', '先决定分几份，再在每段左边读一次函数值，最后全部乘宽度相加。', { accent: '#2563eb', bodySize: 25 })}
      </g>
    `,
  },
  {
    order: 5,
    title: 'Right-hand Sum：用右端点当高度',
    narration:
      '右端点和拿每个小区间的右边当高度。第一个高度从 t 1 开始，最后一个高度到 t n，也就是 b。',
    body: `
      ${pill(78, 98, 'Right-hand Sum', '#ef4444')}
      ${textBlock(78, 174, '右端点高度：看每段的终点', {
        size: 50,
        color: '#0f172a',
        weight: 850,
        maxUnits: 24,
      })}
      <g transform="translate(95 265)">
        <rect x="0" y="0" width="770" height="478" rx="30" fill="#ffffff" stroke="#dbe4f0" stroke-width="2"/>
        ${axes(70, 66, 602, 340)}
        ${riemannBars(114, 140, 484, 266, [0.32, 0.48, 0.68, 0.86, 0.98], '#fb7185', 0.34)}
        <path d="${curvePath(114, 140, 484, 266)}" stroke="#0f766e" stroke-width="7" fill="none" stroke-linecap="round"/>
        <text x="384" y="448" text-anchor="middle" font-size="26" fill="#475569" font-family="Inter, PingFang SC, sans-serif">height = f(right endpoint)</text>
      </g>
      <g transform="translate(930 268)">
        ${formula(0, 0, 'Rₙ = Σᵢ₌₁ⁿ f(tᵢ) Δt', { size: 54, maxUnits: 28 })}
        ${textBlock(8, 104, ['展开：', 'f(t₁)Δt + f(t₂)Δt + ... + f(tₙ)Δt'], {
          size: 34,
          color: '#334155',
          weight: 650,
          maxUnits: 28,
          lineHeight: 50,
        })}
        ${card(0, 280, 520, 176, '常见错误', '右端点和不是“更正确”，它只是另一种采样规则；偏大还是偏小要看函数增减。', { accent: '#ef4444', bodySize: 25 })}
      </g>
    `,
  },
  {
    order: 6,
    title: '递增/递减决定高估还是低估',
    narration:
      '如果函数递增，左端点高度总在曲线下方，所以低估；右端点总在上方，所以高估。递减函数则刚好反过来。',
    body: `
      ${pill(78, 98, '判断', '#7c3aed')}
      ${textBlock(78, 174, '不用算，也能判断方向', {
        size: 52,
        color: '#0f172a',
        weight: 850,
        maxUnits: 22,
      })}
      <g transform="translate(90 282)">
        <rect x="0" y="0" width="675" height="430" rx="30" fill="#ffffff" stroke="#dbe4f0" stroke-width="2"/>
        <text x="44" y="62" font-size="31" font-weight="850" fill="#0f172a" font-family="Inter, PingFang SC, sans-serif">函数递增</text>
        ${axes(62, 94, 535, 268)}
        ${riemannBars(102, 164, 430, 198, [0.2, 0.34, 0.52, 0.72, 0.9], '#60a5fa', 0.3)}
        <path d="${curvePath(102, 164, 430, 198)}" stroke="#ef4444" stroke-width="6" fill="none" stroke-linecap="round"/>
        <text x="146" y="392" fill="#2563eb" font-size="27" font-weight="800" font-family="Inter, PingFang SC, sans-serif">Left: underestimate</text>
        <text x="392" y="392" fill="#ef4444" font-size="27" font-weight="800" font-family="Inter, PingFang SC, sans-serif">Right: overestimate</text>
      </g>
      <g transform="translate(840 282)">
        <rect x="0" y="0" width="675" height="430" rx="30" fill="#ffffff" stroke="#dbe4f0" stroke-width="2"/>
        <text x="44" y="62" font-size="31" font-weight="850" fill="#0f172a" font-family="Inter, PingFang SC, sans-serif">函数递减</text>
        ${axes(62, 94, 535, 268)}
        ${riemannBars(102, 164, 430, 198, [0.9, 0.72, 0.52, 0.34, 0.2], '#fb7185', 0.32)}
        <path d="${curvePath(102, 164, 430, 198, 'decreasing')}" stroke="#0f766e" stroke-width="6" fill="none" stroke-linecap="round"/>
        <text x="146" y="392" fill="#ef4444" font-size="27" font-weight="800" font-family="Inter, PingFang SC, sans-serif">Left: overestimate</text>
        <text x="400" y="392" fill="#0f766e" font-size="27" font-weight="800" font-family="Inter, PingFang SC, sans-serif">Right: underestimate</text>
      </g>
      ${textBlock(
        232,
        790,
        '口诀：递增时“左低右高”；递减时“左高右低”。先画趋势，再判断，不要死记。',
        {
          size: 34,
          color: '#111827',
          weight: 800,
          maxUnits: 56,
        },
      )}
    `,
  },
  {
    order: 7,
    title: '例题：从选项读出 RHS',
    narration:
      'PDF 里的例题关键是看见区间从二到四，被切成四段，所以每段宽度是零点五。右端点依次是二点五、三、三点五、四。',
    body: `
      ${pill(78, 98, 'Example', '#0f766e')}
      ${textBlock(78, 174, '区间 [2,4]，n=4：右端点在哪里？', {
        size: 48,
        color: '#0f172a',
        weight: 850,
        maxUnits: 29,
      })}
      <g transform="translate(126 316)">
        <path d="M0 0 H1040" stroke="#0f172a" stroke-width="7" stroke-linecap="round"/>
        ${partitionTicks(0, 0, 1040, ['2', '2.5', '3', '3.5', '4'])}
        <g fill="#ef4444">
          <circle cx="260" cy="0" r="12"/><circle cx="520" cy="0" r="12"/><circle cx="780" cy="0" r="12"/><circle cx="1040" cy="0" r="12"/>
        </g>
        <text x="650" y="132" text-anchor="middle" font-size="34" fill="#ef4444" font-weight="850" font-family="Inter, PingFang SC, sans-serif">RHS uses the right endpoints</text>
      </g>
      <g transform="translate(128 526)">
        ${card(0, 0, 390, 180, '宽度', 'Δx = (4-2)/4 = 1/2', { accent: '#0f766e', bodySize: 28 })}
        ${card(440, 0, 390, 180, '高度', 'f(2.5), f(3), f(3.5), f(4)', { accent: '#ef4444', bodySize: 27 })}
        ${card(880, 0, 390, 180, '相加', '每个高度都要乘同一个 Δx。', { accent: '#2563eb', bodySize: 27 })}
      </g>
      ${formula(198, 795, 'R₄ = 1/2 · [6√2.5 + 6√3 + 6√3.5 + 6√4]', {
        size: 43,
        color: '#111827',
        maxUnits: 60,
      })}
    `,
  },
  {
    order: 8,
    title: '概念陷阱：n 越大，Rₙ 一定越大吗？',
    narration:
      '一个很自然但错误的猜想是：函数递增时，右端点和随着 n 增大一定变大。反例 f(x)=x 在零到一上就能打破它。',
    body: `
      ${pill(78, 98, 'Counterexample', '#dc2626')}
      ${textBlock(78, 174, '更多矩形 ≠ 右端点和一定更大', {
        size: 48,
        color: '#0f172a',
        weight: 850,
        maxUnits: 26,
      })}
      ${card(88, 282, 430, 190, '猜想', '若 f 连续且严格递增，是否总有 Rₙ ≤ Rₙ₊₁？', { accent: '#dc2626', bodySize: 28 })}
      <g transform="translate(620 245)">
        <rect x="0" y="0" width="835" height="468" rx="30" fill="#ffffff" stroke="#dbe4f0" stroke-width="2"/>
        <text x="48" y="68" font-size="31" font-weight="850" fill="#0f172a" font-family="Inter, PingFang SC, sans-serif">反例：f(x)=x on [0,1]</text>
        ${axes(76, 102, 610, 280)}
        ${riemannBars(116, 172, 244, 210, [1 / 3, 2 / 3, 1], '#fb7185', 0.32)}
        ${riemannBars(410, 172, 244, 210, [1 / 4, 2 / 4, 3 / 4, 1], '#14b8a6', 0.3)}
        <path d="M116 382 L686 172" stroke="#0f172a" stroke-width="6" fill="none"/>
        <text x="238" y="428" text-anchor="middle" font-size="28" fill="#ef4444" font-weight="800" font-family="Inter, PingFang SC, sans-serif">n=3</text>
        <text x="532" y="428" text-anchor="middle" font-size="28" fill="#0f766e" font-weight="800" font-family="Inter, PingFang SC, sans-serif">n=4</text>
      </g>
      ${formula(110, 552, 'R₃ = (1/3)(1/3 + 2/3 + 1) = 2/3', { size: 35, maxUnits: 34 })}
      ${formula(110, 628, 'R₄ = (1/4)(1/4 + 2/4 + 3/4 + 1) = 5/8', { size: 35, maxUnits: 38 })}
      ${textBlock(
        110,
        730,
        '因为 2/3 > 5/8，所以 Rₙ ≤ Rₙ₊₁ 是假的。真正稳定的是：左右端点和会朝同一个目标靠近。',
        {
          size: 30,
          color: '#111827',
          weight: 750,
          maxUnits: 42,
          lineHeight: 42,
        },
      )}
    `,
  },
  {
    order: 9,
    title: '总结与下节课的钩子',
    narration:
      '最后收束今天的结构：动机是面积，方法是分割，计算是高度乘宽度再相加，判断靠单调性。下一节才把极限对象正式命名并发展定积分。',
    body: `
      ${pill(78, 98, 'Summary', '#0f766e')}
      ${textBlock(78, 174, '今天我们已经有了“积分前”的全部直觉', {
        size: 49,
        color: '#0f172a',
        weight: 850,
        maxUnits: 30,
      })}
      ${card(95, 292, 405, 170, '1. 面积模型', '速度变化时，总路程可以用曲线下的面积来想。', { accent: '#2563eb', bodySize: 26 })}
      ${card(598, 292, 405, 170, '2. 黎曼和', '切区间、选代表点、做矩形、求和。', { accent: '#0f766e', bodySize: 26 })}
      ${card(1100, 292, 405, 170, '3. 判断偏差', '递增：左低右高；递减：左高右低。', { accent: '#f97316', bodySize: 26 })}
      <g transform="translate(160 560)" filter="url(#softShadow)">
        <rect x="0" y="0" width="1280" height="195" rx="32" fill="#0f172a"/>
        <text x="58" y="72" font-size="35" fill="#ffffff" font-weight="850" font-family="Inter, PingFang SC, sans-serif">下节课钩子</text>
        <text x="58" y="126" font-size="30" fill="#dbeafe" font-weight="650" font-family="Inter, PingFang SC, sans-serif">当矩形越来越薄，Lₙ 和 Rₙ 如果逼近同一个数，我们要给这个数一个正式名字。</text>
        <text x="58" y="170" font-size="27" fill="#99f6e4" font-weight="700" font-family="Inter, PingFang SC, sans-serif">下一节：把“近似的极限”变成定积分，但今天先到这里。</text>
      </g>
      ${formula(425, 820, 'thin rectangles  →  one stable total', { size: 42, color: '#0f766e' })}
    `,
  },
];

function imageElement(order) {
  const fileName = `slide-${String(order + 1).padStart(2, '0')}.png`;
  return {
    type: 'image',
    id: `${NOTEBOOK_ID}-image-${String(order + 1).padStart(2, '0')}`,
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

function slideCanvas(order) {
  return {
    id: `${NOTEBOOK_ID}-canvas-${String(order + 1).padStart(2, '0')}`,
    viewportSize: 1000,
    viewportRatio: 16 / 9,
    theme: {
      backgroundColor: '#fffdf7',
      themeColors: ['#2563eb', '#0f766e', '#ef4444', '#f97316', '#0f172a'],
      fontColor: '#0f172a',
      fontName: 'Inter',
      outline: { color: '#2563eb', width: 2, style: 'solid' },
      shadow: { h: 0, v: 0, blur: 10, color: '#000000' },
    },
    elements: [imageElement(order)],
    background: {
      type: 'solid',
      color: '#fffdf7',
    },
    type: 'content',
  };
}

function sceneFromSlide(slide) {
  return {
    id: `${NOTEBOOK_ID}-p${String(slide.order + 1).padStart(2, '0')}`,
    notebookId: NOTEBOOK_ID,
    title: slide.title,
    type: 'slide',
    order: slide.order,
    content: {
      type: 'slide',
      canvas: slideCanvas(slide.order),
      webRenderMode: 'slide',
    },
    actions: [
      {
        id: `${NOTEBOOK_ID}-speech-${String(slide.order + 1).padStart(2, '0')}`,
        type: 'speech',
        text: slide.narration,
      },
    ],
    whiteboard: null,
  };
}

async function renderSlides() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const slide of slides) {
    const svg = slideFrame(slide);
    const fileName = `slide-${String(slide.order + 1).padStart(2, '0')}.png`;
    await sharp(Buffer.from(svg)).png().toFile(path.join(OUTPUT_DIR, fileName));
  }
}

async function seedNotebook() {
  loadEnvLocal();
  const prisma = new PrismaClient();
  try {
    const course = await prisma.course.findUnique({ where: { id: COURSE_ID } });
    if (!course) {
      throw new Error(`Course not found: ${COURSE_ID}`);
    }

    await prisma.notebook.create({
      data: {
        id: NOTEBOOK_ID,
        ownerId: course.ownerId,
        courseId: course.id,
        name: `Week 1：黎曼和与面积近似 ${RUN_STAMP}`,
        description:
          '基于 MAT 136 Week 1 handout 的 Riemann Sum 部分新建。只讲黎曼和、左右端点和、高估/低估与反例；定积分正式定义留到下一节。',
        tags: ['MAT136', 'Riemann Sum', '黎曼和', '面积近似'],
        avatarUrl: '/avatars/notebook-agents/avatar8.avif',
        language: 'zh-CN',
        style: 'visual-math',
        createdAt: NOW,
        updatedAt: NOW,
      },
    });

    const scenes = slides.map(sceneFromSlide);
    await prisma.$transaction([
      prisma.scene.deleteMany({ where: { notebookId: NOTEBOOK_ID } }),
      prisma.scene.createMany({
        data: scenes.map((scene) => ({
          id: scene.id,
          notebookId: NOTEBOOK_ID,
          title: scene.title,
          type: scene.type,
          order: scene.order,
          content: scene.content,
          actions: scene.actions,
          whiteboard: scene.whiteboard,
          createdAt: NOW,
          updatedAt: NOW,
        })),
      }),
      prisma.course.update({
        where: { id: COURSE_ID },
        data: { updatedAt: NOW },
      }),
    ]);

    return { course, scenes };
  } finally {
    await prisma.$disconnect();
  }
}

await renderSlides();
const { course, scenes } = await seedNotebook();
console.log(
  JSON.stringify(
    {
      courseId: course.id,
      courseName: course.name,
      notebookId: NOTEBOOK_ID,
      slideCount: scenes.length,
      imageDir: OUTPUT_DIR,
    },
    null,
    2,
  ),
);
