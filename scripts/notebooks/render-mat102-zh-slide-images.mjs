#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { generatedNotebookDir } from '../shared/paths.mjs';

const RUN_STAMP = '20260519';
const WIDTH = 1600;
const HEIGHT = 900;
const DATA_PATH = path.resolve(process.cwd(), 'scripts/notebooks/mat102-queue-zh-notebooks.json');

const themes = [
  {
    name: 'blue',
    accent: '#2563eb',
    soft: '#dbeafe',
    pale: '#eff6ff',
    grid: '#bfdbfe',
    secondary: '#0f766e',
    warm: '#f97316',
  },
  {
    name: 'teal',
    accent: '#0f766e',
    soft: '#ccfbf1',
    pale: '#f0fdfa',
    grid: '#99f6e4',
    secondary: '#2563eb',
    warm: '#f59e0b',
  },
  {
    name: 'violet',
    accent: '#7c3aed',
    soft: '#ede9fe',
    pale: '#f5f3ff',
    grid: '#ddd6fe',
    secondary: '#0891b2',
    warm: '#ea580c',
  },
  {
    name: 'amber',
    accent: '#d97706',
    soft: '#fef3c7',
    pale: '#fffbeb',
    grid: '#fde68a',
    secondary: '#2563eb',
    warm: '#16a34a',
  },
  {
    name: 'rose',
    accent: '#e11d48',
    soft: '#ffe4e6',
    pale: '#fff1f2',
    grid: '#fecdd3',
    secondary: '#0f766e',
    warm: '#7c3aed',
  },
];

const topicPalettes = {
  functions: themes[0],
  number: themes[3],
  modular: themes[2],
  induction: themes[4],
  group: themes[2],
  default: themes[1],
};

function parseArgs(argv) {
  const options = {
    only: null,
    force: false,
  };
  for (const arg of argv.slice(2)) {
    if (arg === '--force') options.force = true;
    else if (arg.startsWith('--only=')) {
      options.only = new Set(
        arg
          .slice('--only='.length)
          .split(',')
          .map((item) => item.trim()),
      );
    }
  }
  return options;
}

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function notebookId(slug) {
  return `nb-mat102-zh-${slug}-${RUN_STAMP}`;
}

function outputDir(slug) {
  return generatedNotebookDir(notebookId(slug));
}

function slidePath(slug, order) {
  return path.join(outputDir(slug), `slide-${String(order + 1).padStart(2, '0')}.png`);
}

function pickTheme(notebook) {
  const slug = notebook.slug;
  if (slug.includes('functions')) return topicPalettes.functions;
  if (slug.includes('modular')) return topicPalettes.modular;
  if (slug.includes('number-theory')) return topicPalettes.number;
  if (slug.includes('induction')) return topicPalettes.induction;
  if (slug.includes('group')) return topicPalettes.group;
  return topicPalettes.default;
}

function wrapText(text, maxChars, maxLines = 4) {
  const normalized = String(text).replace(/\s+/g, ' ').trim();
  const tokens = normalized
    .split(/(?=[，。；：、（）()])|(?<=[，。；：、（）()])|\s+/)
    .filter(Boolean);
  const lines = [];
  let current = '';

  for (const token of tokens) {
    if (!current) {
      current = token;
      continue;
    }
    if ((current + token).length <= maxChars) {
      current += token;
    } else {
      lines.push(current);
      current = token;
    }
    if (lines.length === maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length > maxLines) lines.length = maxLines;
  if (tokens.join('').length > lines.join('').length && lines.length > 0) {
    lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, Math.max(1, maxChars - 1))}...`;
  }
  return lines;
}

function textBlock(lines, x, y, options = {}) {
  const {
    size = 44,
    lineHeight = 1.28,
    weight = 700,
    fill = '#0f172a',
    anchor = 'start',
    maxWidth = null,
  } = options;
  const tspans = lines
    .map((line, index) => {
      const dy = index === 0 ? 0 : size * lineHeight;
      return `<tspan x="${x}" dy="${index === 0 ? 0 : dy}">${esc(line)}</tspan>`;
    })
    .join('');
  const widthAttr = maxWidth ? ` textLength="${maxWidth}" lengthAdjust="spacingAndGlyphs"` : '';
  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" font-family="PingFang SC, Noto Sans CJK SC, Microsoft YaHei, Arial Unicode MS, Arial"${widthAttr}>${tspans}</text>`;
}

function bullets(items, x, y, theme, options = {}) {
  const size = options.size ?? 34;
  const gap = options.gap ?? 62;
  return items
    .map((item, index) => {
      const top = y + index * gap;
      return [
        `<circle cx="${x}" cy="${top - 10}" r="13" fill="${theme.soft}" stroke="${theme.accent}" stroke-width="3"/>`,
        `<path d="M ${x - 6} ${top - 10} L ${x - 1} ${top - 3} L ${x + 8} ${top - 18}" fill="none" stroke="${theme.accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
        textBlock(wrapText(item, 22, 2), x + 34, top, {
          size,
          lineHeight: 1.18,
          weight: 600,
          fill: '#334155',
        }),
      ].join('');
    })
    .join('');
}

function keywordChips(items, x, y, theme) {
  return items
    .slice(0, 3)
    .map((item, index) => {
      const width = [190, 220, 210][index] ?? 200;
      const left = x + index * 218;
      return [
        `<rect x="${left}" y="${y - 34}" width="${width}" height="54" rx="19" fill="#ffffff" stroke="${theme.grid}" stroke-width="2"/>`,
        `<circle cx="${left + 26}" cy="${y - 7}" r="11" fill="${theme.soft}" stroke="${theme.accent}" stroke-width="3"/>`,
        `<text x="${left + 48}" y="${y + 3}" fill="#334155" font-size="25" font-weight="800" font-family="Arial, PingFang SC, Noto Sans CJK SC">${esc(item)}</text>`,
      ].join('');
    })
    .join('');
}

function getKeywords(title, intent, slug) {
  const source = `${title} ${intent}`;
  if (slug.includes('functions-ii')) {
    if (/逆|inverse|undo/i.test(source)) return ['f o g = id', 'g o f = id', '双边 undo'];
    if (/双射|bijection|可逆/.test(source)) return ['injective', 'surjective', 'bijection'];
    if (/基数|count|无限|Cantor|Schroder|对角线/.test(source))
      return ['|S| <= |T|', 'N ~ 2N', 'diagonal'];
    return ['domain', 'codomain', 'map'];
  }
  if (slug.includes('number-theory-i')) {
    if (/欧几里得|gcd|Bezout|回代/.test(source))
      return ['616 = 1·427 + 189', '427 = 2·189 + 49', 'gcd = 7'];
    if (/整除|divisibility|余数|带余/.test(source)) return ['a = qb + r', 'b | a', '0 <= r < b'];
    return ['Z', 'gcd(a,b)', 'linear combo'];
  }
  if (slug.includes('number-theory-ii')) {
    if (/丢番图|整数解|方程|所有解/.test(source))
      return ['ax + by = c', 'gcd(a,b) | c', 'x = x0 + bt'];
    if (/素数|算术基本|无限/.test(source))
      return ['p | ab', 'prime factorization', 'N = p1...pk + 1'];
    return ['gcd', 'Bezout', 'prime'];
  }
  if (slug.includes('number-theory-iii')) {
    if (/模|同余|Z_n|余数/.test(source)) return ['a ≡ b (mod n)', 'Z_n', 'remainder classes'];
    if (/费马|Fermat|逆元|消去/.test(source)) return ['a^(p-1) ≡ 1', 'mod p', 'a^{-1} exists'];
    return ['clock arithmetic', 'cycles', 'classes'];
  }
  return ['definition', 'example', 'proof'];
}

function diagramSvg(slug, order, title, intent, theme) {
  const keyword = `${title} ${intent}`;
  if (slug.includes('functions')) return functionsDiagram(keyword, theme);
  if (slug.includes('number-theory-iii')) return modularDiagram(keyword, theme);
  if (slug.includes('number-theory')) return numberTheoryDiagram(keyword, theme);
  return genericDiagram(order, title, theme);
}

function functionsDiagram(keyword, theme) {
  const nodesLeft = [
    ['a', 1020, 345],
    ['b', 1020, 460],
    ['c', 1020, 575],
  ];
  const nodesRight = [
    ['1', 1340, 330],
    ['2', 1340, 455],
    ['3', 1340, 580],
  ];
  const arrows = /基数|无限|Cantor|count|对角线/.test(keyword)
    ? [
        [1020, 345, 1340, 330],
        [1020, 460, 1340, 455],
        [1020, 575, 1340, 580],
        [1020, 660, 1340, 705],
      ]
    : [
        [1060, 345, 1300, 455],
        [1060, 460, 1300, 330],
        [1060, 575, 1300, 580],
      ];
  return [
    `<rect x="940" y="260" width="500" height="430" rx="34" fill="#ffffff" stroke="${theme.grid}" stroke-width="3"/>`,
    `<text x="1190" y="305" text-anchor="middle" fill="${theme.accent}" font-size="34" font-weight="800" font-family="PingFang SC, Noto Sans CJK SC, Arial">映射图</text>`,
    `<text x="1020" y="642" text-anchor="middle" fill="#64748b" font-size="26" font-family="Arial">A</text>`,
    `<text x="1340" y="642" text-anchor="middle" fill="#64748b" font-size="26" font-family="Arial">B</text>`,
    ...arrows.map(
      ([x1, y1, x2, y2]) =>
        `<path d="M ${x1} ${y1} C ${x1 + 95} ${y1}, ${x2 - 95} ${y2}, ${x2} ${y2}" fill="none" stroke="${theme.accent}" stroke-width="6" stroke-linecap="round" marker-end="url(#arrow-${theme.name})"/>`,
    ),
    ...nodesLeft.map(
      ([label, x, y]) =>
        `<circle cx="${x}" cy="${y}" r="38" fill="${theme.soft}" stroke="${theme.accent}" stroke-width="4"/><text x="${x}" y="${y + 11}" text-anchor="middle" fill="#0f172a" font-size="34" font-weight="800" font-family="Arial">${label}</text>`,
    ),
    ...nodesRight.map(
      ([label, x, y]) =>
        `<circle cx="${x}" cy="${y}" r="38" fill="#ecfdf5" stroke="${theme.secondary}" stroke-width="4"/><text x="${x}" y="${y + 11}" text-anchor="middle" fill="#0f172a" font-size="34" font-weight="800" font-family="Arial">${label}</text>`,
    ),
  ].join('');
}

function numberTheoryDiagram(keyword, theme) {
  const isPrime = /素数|prime|算术基本|无限/.test(keyword);
  const isEquation = /丢番图|方程|整数解|解/.test(keyword);
  const rows = isPrime
    ? ['若 p | ab', '且 p 为素数', '则 p | a 或 p | b']
    : isEquation
      ? ['ax + by = c', 'gcd(a,b) | c', '整数解存在']
      : ['a = qb + r', '0 <= r < b', 'gcd 会下降'];
  return [
    `<rect x="930" y="255" width="520" height="440" rx="34" fill="#ffffff" stroke="${theme.grid}" stroke-width="3"/>`,
    `<path d="M 990 610 C 1050 500, 1165 520, 1215 420 S 1360 350, 1390 285" fill="none" stroke="${theme.secondary}" stroke-width="8" stroke-linecap="round"/>`,
    ...rows
      .map((row, index) => {
        const y = 320 + index * 105;
        return `<rect x="985" y="${y}" width="370" height="64" rx="20" fill="${index === 1 ? theme.pale : theme.soft}" stroke="${theme.accent}" stroke-width="3"/><text x="1170" y="${y + 42}" text-anchor="middle" fill="#0f172a" font-size="31" font-weight="800" font-family="Arial, PingFang SC, Noto Sans CJK SC">${esc(row)}</text>`;
      })
      .join(''),
    `<text x="1190" y="658" text-anchor="middle" fill="#64748b" font-size="25" font-family="PingFang SC, Noto Sans CJK SC, Arial">从计算走向证明</text>`,
  ].join('');
}

function modularDiagram(keyword, theme) {
  const labels = ['0', '1', '2', '3', '4', '5'];
  const centerX = 1190;
  const centerY = 455;
  const radius = 170;
  return [
    `<rect x="930" y="255" width="520" height="440" rx="34" fill="#ffffff" stroke="${theme.grid}" stroke-width="3"/>`,
    `<circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="${theme.pale}" stroke="${theme.accent}" stroke-width="5"/>`,
    ...labels
      .map((label, index) => {
        const angle = -Math.PI / 2 + (index / labels.length) * Math.PI * 2;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        return `<circle cx="${x}" cy="${y}" r="38" fill="#ffffff" stroke="${theme.secondary}" stroke-width="4"/><text x="${x}" y="${y + 12}" text-anchor="middle" fill="#0f172a" font-size="34" font-weight="800" font-family="Arial">${label}</text>`;
      })
      .join(''),
    `<path d="M ${centerX} ${centerY} L ${centerX + 115} ${centerY - 85}" stroke="${theme.warm}" stroke-width="8" stroke-linecap="round" marker-end="url(#arrow-${theme.name})"/>`,
    `<text x="${centerX}" y="${centerY + 15}" text-anchor="middle" fill="${theme.accent}" font-size="35" font-weight="900" font-family="Arial">mod n</text>`,
    `<text x="${centerX}" y="670" text-anchor="middle" fill="#64748b" font-size="25" font-family="PingFang SC, Noto Sans CJK SC, Arial">同余类像时钟一样循环</text>`,
  ].join('');
}

function genericDiagram(order, title, theme) {
  const steps = ['定义', '例子', '证明'];
  return [
    `<rect x="930" y="255" width="520" height="440" rx="34" fill="#ffffff" stroke="${theme.grid}" stroke-width="3"/>`,
    ...steps
      .map((step, index) => {
        const x = 1010 + index * 150;
        const y = 430 + Math.sin(index) * 28;
        return `<circle cx="${x}" cy="${y}" r="58" fill="${theme.soft}" stroke="${theme.accent}" stroke-width="4"/><text x="${x}" y="${y + 12}" text-anchor="middle" fill="#0f172a" font-size="30" font-weight="800" font-family="PingFang SC, Noto Sans CJK SC, Arial">${step}</text>`;
      })
      .join(''),
    `<path d="M 1070 430 C 1115 385, 1165 385, 1210 430 S 1305 475, 1360 430" fill="none" stroke="${theme.secondary}" stroke-width="7" stroke-linecap="round" marker-end="url(#arrow-${theme.name})"/>`,
    `<text x="1190" y="640" text-anchor="middle" fill="#64748b" font-size="25" font-family="PingFang SC, Noto Sans CJK SC, Arial">${esc(title)}</text>`,
  ].join('');
}

function slideSvg(notebook, order) {
  const [title, intent] = notebook.slides[order];
  const theme = pickTheme(notebook);
  const keywordItems = getKeywords(title, intent, notebook.slug);
  const titleLines = wrapText(title, 22, 2);
  const intentLines = wrapText(intent, 25, 4);
  const total = notebook.slides.length;
  const section =
    order === 0
      ? '课程封面'
      : order < 3
        ? '引入与问题'
        : order < total - 2
          ? '核心推进'
          : '总结与连接';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="grid-${theme.name}" width="36" height="36" patternUnits="userSpaceOnUse">
      <path d="M 36 0 L 0 0 0 36" fill="none" stroke="${theme.grid}" stroke-width="1" opacity="0.42"/>
    </pattern>
    <marker id="arrow-${theme.name}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="${theme.accent}"/>
    </marker>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#0f172a" flood-opacity="0.14"/>
    </filter>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#f8fafc"/>
  <rect x="36" y="34" width="1528" height="832" rx="46" fill="${theme.pale}" opacity="0.95"/>
  <rect x="36" y="34" width="1528" height="832" rx="46" fill="url(#grid-${theme.name})"/>
  <path d="M 74 116 C 180 54, 315 58, 420 102 C 610 178, 765 128, 920 84 C 1115 28, 1360 76, 1510 150" fill="none" stroke="${theme.soft}" stroke-width="22" opacity="0.65"/>
  <rect x="78" y="84" width="1444" height="748" rx="38" fill="#ffffff" opacity="0.9" filter="url(#shadow)"/>
  <rect x="78" y="84" width="18" height="748" rx="9" fill="${theme.accent}"/>
  <rect x="96" y="132" width="8" height="72" rx="4" fill="#ffffff" opacity="0.95"/>
  <rect x="96" y="238" width="8" height="72" rx="4" fill="#ffffff" opacity="0.95"/>
  <rect x="96" y="344" width="8" height="72" rx="4" fill="#ffffff" opacity="0.95"/>
  <rect x="130" y="126" width="166" height="52" rx="26" fill="#ffffff" stroke="${theme.grid}" stroke-width="2"/>
  <text x="213" y="162" text-anchor="middle" fill="${theme.accent}" font-size="27" font-weight="900" font-family="Arial">第 ${order + 1} 页 / 共 ${total} 页</text>
  <rect x="318" y="126" width="170" height="52" rx="26" fill="${theme.soft}" stroke="${theme.accent}" stroke-width="2"/>
  <text x="403" y="162" text-anchor="middle" fill="${theme.accent}" font-size="27" font-weight="800" font-family="PingFang SC, Noto Sans CJK SC, Arial">${esc(section)}</text>
  ${textBlock(titleLines, 142, 256, { size: titleLines.length > 1 ? 55 : 62, lineHeight: 1.15, weight: 900, fill: '#0f172a' })}
  <rect x="142" y="392" width="692" height="268" rx="30" fill="#ffffff" stroke="#e2e8f0" stroke-width="3"/>
  <text x="182" y="452" fill="${theme.accent}" font-size="34" font-weight="900" font-family="PingFang SC, Noto Sans CJK SC, Arial">这一页要解决什么？</text>
  ${textBlock(intentLines, 182, 510, { size: 31, lineHeight: 1.36, weight: 600, fill: '#475569' })}
  <rect x="142" y="692" width="692" height="86" rx="26" fill="${theme.soft}" stroke="${theme.grid}" stroke-width="2"/>
  ${keywordChips(keywordItems, 176, 744, theme)}
  ${diagramSvg(notebook.slug, order, title, intent, theme)}
  <text x="1450" y="775" text-anchor="end" fill="#94a3b8" font-size="24" font-weight="700" font-family="Arial">MAT102 · ${esc(notebook.title)}</text>
</svg>`;
}

function loadNotebooks() {
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}

function selectNotebooks(notebooks, options) {
  if (!options.only) return notebooks;
  return notebooks.filter(
    (notebook) =>
      options.only.has(notebook.slug) ||
      options.only.has(`mat102-zh-${notebook.slug}`) ||
      options.only.has(notebookId(notebook.slug)),
  );
}

async function renderNotebook(notebook, options) {
  const dir = outputDir(notebook.slug);
  fs.mkdirSync(dir, { recursive: true });
  for (const [order] of notebook.slides.entries()) {
    const destination = slidePath(notebook.slug, order);
    if (!options.force && fs.existsSync(destination)) continue;
    await sharp(Buffer.from(slideSvg(notebook, order)))
      .png()
      .toFile(destination);
  }
  fs.writeFileSync(
    path.join(dir, 'image-sources.json'),
    JSON.stringify(
      {
        mode: 'deterministic-svg-sharp',
        source: DATA_PATH,
        renderedAt: new Date().toISOString(),
        slides: notebook.slides.map((slide, order) => ({
          order,
          title: slide[0],
          destination: slidePath(notebook.slug, order),
        })),
      },
      null,
      2,
    ),
  );
  console.log(`[render] ${notebook.slug}: ${notebook.slides.length} slides`);
}

async function main() {
  const options = parseArgs(process.argv);
  const selected = selectNotebooks(loadNotebooks(), options);
  if (selected.length === 0) throw new Error('No notebooks selected');
  for (const notebook of selected) await renderNotebook(notebook, options);
  console.log('[done]');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
