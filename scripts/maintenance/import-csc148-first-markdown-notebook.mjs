#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { Prisma, PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const DEFAULT_COURSE_ID = 'cmqjfarz800158oi68s595q9n';
const NOTEBOOK_ID = 'queue-csc148-01-python-memory-model';
const NOTEBOOK_NAME = '01 - Python 记忆模型：对象、引用与变异';
const IMPORT_VERSION = 'csc148-first-markdown-notebook-2026-06-18';
const PUBLIC_DIR = path.join(ROOT, 'public', 'generated-notebooks', NOTEBOOK_ID);
const PUBLIC_PATH = `/generated-notebooks/${NOTEBOOK_ID}`;
const IMAGEGEN_DIR = path.join(ROOT, 'output', 'imagegen');

const IMAGE_MIME_BY_EXTENSION = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

function m(strings, ...values) {
  return String.raw({ raw: strings }, ...values).trim();
}

function loadEnvFiles() {
  for (const filename of ['.env', '.env.local']) {
    const envPath = path.join(ROOT, filename);
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
      if (!match || match[1].startsWith('#')) continue;
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] ??= value;
    }
  }
}

function parseArgs(argv) {
  const args = {
    write: false,
    courseId: process.env.CSC148_COURSE_ID || DEFAULT_COURSE_ID,
    help: false,
  };
  for (const arg of argv) {
    if (arg === '--write') args.write = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg.startsWith('--course-id=')) args.courseId = arg.slice('--course-id='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return `
Usage:
  node scripts/maintenance/import-csc148-first-markdown-notebook.mjs [--write] [--course-id=${DEFAULT_COURSE_ID}]

Creates or updates the first CSC148 Chinese Markdown notebook and its generated memory-model
figures. Without --write, the script renders local PNG assets and prints the planned DB write.
  `.trim();
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function text(x, y, value, options = {}) {
  const {
    size = 36,
    weight = 600,
    fill = '#0f172a',
    anchor = 'start',
    family = 'Arial, PingFang SC, Hiragino Sans GB, Noto Sans CJK SC, sans-serif',
  } = options;
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(value)}</text>`;
}

function rect(x, y, width, height, options = {}) {
  const {
    fill = '#ffffff',
    stroke = '#334155',
    strokeWidth = 3,
    rx = 18,
    opacity = 1,
    filter = '',
  } = options;
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" ${filter ? `filter="${filter}"` : ''}/>`;
}

function line(x1, y1, x2, y2, options = {}) {
  const { stroke = '#334155', strokeWidth = 4, marker = true, dash = '' } = options;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${strokeWidth}" ${dash ? `stroke-dasharray="${dash}"` : ''} ${marker ? 'marker-end="url(#arrow)"' : ''}/>`;
}

function listObject(x, y, id, value, options = {}) {
  const { width = 440, height = 176, accent = '#f59e0b', valueSize = 38 } = options;
  return `
    ${rect(x, y, width, height, { fill: '#fffaf0', stroke: accent, strokeWidth: 3, rx: 22, filter: 'url(#cardShadow)' })}
    ${text(x + 26, y + 42, id, { size: 25, fill: '#92400e', weight: 800 })}
    ${text(x + width - 28, y + 42, 'list', { size: 25, fill: '#92400e', anchor: 'end', weight: 800 })}
    ${rect(x + 28, y + 70, width - 56, 72, { fill: '#ffffff', stroke: '#fbbf24', strokeWidth: 2, rx: 12 })}
    ${text(x + width / 2, y + 118, value, { size: valueSize, weight: 700, anchor: 'middle' })}
  `;
}

function mutatedListObject(x, y, id, options = {}) {
  const { width = 440, height = 176, accent = '#f59e0b' } = options;
  return `
    ${rect(x, y, width, height, { fill: '#fffaf0', stroke: accent, strokeWidth: 3, rx: 22, filter: 'url(#cardShadow)' })}
    ${text(x + 26, y + 42, id, { size: 25, fill: '#92400e', weight: 800 })}
    ${text(x + width - 28, y + 42, 'list', { size: 25, fill: '#92400e', anchor: 'end', weight: 800 })}
    ${rect(x + 28, y + 64, width - 56, 94, { fill: '#ffffff', stroke: '#fbbf24', strokeWidth: 2, rx: 14 })}
    ${text(x + 114, y + 118, '[', { size: 40, weight: 700, anchor: 'middle' })}
    ${text(x + 154, y + 113, '1', { size: 34, weight: 800, anchor: 'middle' })}
    ${line(x + 135, y + 101, x + 173, y + 121, { stroke: '#ef4444', strokeWidth: 5, marker: false })}
    ${text(x + 154, y + 154, '-999', { size: 28, weight: 800, anchor: 'middle', fill: '#b91c1c' })}
    ${text(x + 198, y + 118, ',', { size: 36, weight: 700, anchor: 'middle' })}
    ${text(x + 246, y + 118, '2', { size: 36, weight: 800, anchor: 'middle' })}
    ${text(x + 290, y + 118, ',', { size: 36, weight: 700, anchor: 'middle' })}
    ${text(x + 338, y + 118, '3', { size: 36, weight: 800, anchor: 'middle' })}
    ${text(x + 378, y + 118, ']', { size: 40, weight: 700, anchor: 'middle' })}
  `;
}

function variableBox(x, y, name, id, options = {}) {
  const { width = 250, height = 106 } = options;
  return `
    ${rect(x, y, width, height, { fill: '#eef6ff', stroke: '#2563eb', strokeWidth: 3, rx: 20, filter: 'url(#cardShadow)' })}
    ${text(x + 24, y + 42, name, { size: 34, fill: '#1e40af', weight: 800 })}
    ${rect(x + width - 126, y + 24, 104, 52, { fill: '#ffffff', stroke: '#93c5fd', strokeWidth: 2, rx: 12 })}
    ${text(x + width - 74, y + 58, id, { size: 26, weight: 700, anchor: 'middle', fill: '#1d4ed8' })}
  `;
}

function objectBox(x, y, id, type, value, options = {}) {
  const { width = 430, height = 170 } = options;
  return `
    ${rect(x, y, width, height, { fill: '#fffaf0', stroke: '#f59e0b', strokeWidth: 3, rx: 22, filter: 'url(#cardShadow)' })}
    ${text(x + 26, y + 42, id, { size: 25, fill: '#92400e', weight: 800 })}
    ${text(x + width - 28, y + 42, type, { size: 25, fill: '#92400e', anchor: 'end', weight: 800 })}
    ${rect(x + 42, y + 68, width - 84, 66, { fill: '#ffffff', stroke: '#fbbf24', strokeWidth: 2, rx: 12 })}
    ${text(x + width / 2, y + 113, value, { size: 38, weight: 700, anchor: 'middle' })}
  `;
}

function panelBox(x, y, width, height, title, options = {}) {
  const { accent = '#2563eb', titleFill = '#0f172a', fill = '#f8fafc' } = options;
  return `
    ${rect(x, y, width, height, { fill, stroke: '#d7e0ea', strokeWidth: 2, rx: 28, filter: 'url(#panelShadow)' })}
    ${rect(x + 24, y + 22, 12, 42, { fill: accent, stroke: accent, strokeWidth: 0, rx: 6 })}
    ${text(x + width / 2, y + 58, title, { size: 36, weight: 800, anchor: 'middle', fill: titleFill })}
  `;
}

function codePill(x, y, value, options = {}) {
  const { width = 360, accent = '#6366f1' } = options;
  return `
    ${rect(x, y, width, 62, { fill: '#eef2ff', stroke: accent, strokeWidth: 2, rx: 18 })}
    ${text(x + width / 2, y + 40, value, { size: 28, weight: 800, anchor: 'middle', fill: '#3730a3', family: 'Menlo, Monaco, Consolas, monospace' })}
  `;
}

function svgFrame(title, body, options = {}) {
  const { subtitle = '' } = options;
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
      <defs>
        <linearGradient id="pageBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#eef6ff"/>
          <stop offset="52%" stop-color="#fbfdff"/>
          <stop offset="100%" stop-color="#fff7ed"/>
        </linearGradient>
        <pattern id="paperDots" width="28" height="28" patternUnits="userSpaceOnUse">
          <circle cx="4" cy="4" r="1.1" fill="#cbd5e1" opacity="0.35"/>
        </pattern>
        <marker id="arrow" markerWidth="14" markerHeight="14" refX="12" refY="7" orient="auto" markerUnits="strokeWidth">
          <path d="M2,2 L12,7 L2,12 Z" fill="#334155"/>
        </marker>
        <filter id="panelShadow" x="-8%" y="-8%" width="116%" height="116%">
          <feDropShadow dx="0" dy="10" stdDeviation="8" flood-color="#0f172a" flood-opacity="0.08"/>
        </filter>
        <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="6" stdDeviation="5" flood-color="#0f172a" flood-opacity="0.12"/>
        </filter>
        <filter id="softShadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#0f172a" flood-opacity="0.08"/>
        </filter>
      </defs>
      <rect width="1600" height="900" fill="url(#pageBg)"/>
      <rect width="1600" height="900" fill="url(#paperDots)" opacity="0.55"/>
      <rect x="48" y="42" width="1504" height="816" rx="36" fill="#ffffff" stroke="#dbe4f0" stroke-width="2" filter="url(#softShadow)"/>
      <rect x="72" y="66" width="1456" height="768" rx="28" fill="#ffffff" stroke="#eef2f7" stroke-width="1"/>
      ${text(800, 112, title, { size: 52, weight: 800, anchor: 'middle' })}
      ${subtitle ? text(800, 160, subtitle, { size: 28, weight: 500, anchor: 'middle', fill: '#64748b' }) : ''}
      ${body}
    </svg>
  `;
}

function figureReferenceModelSvg() {
  const body = `
    ${panelBox(130, 210, 520, 470, '变量区', { accent: '#2563eb', titleFill: '#1d4ed8' })}
    ${panelBox(820, 210, 650, 470, '对象区', { accent: '#f59e0b', titleFill: '#b45309', fill: '#fffdf7' })}
    ${codePill(255, 295, 'x = 3', { width: 270 })}
    ${codePill(225, 485, "word = 'bonjour'", { width: 330 })}
    ${variableBox(240, 370, 'x', 'id92')}
    ${variableBox(240, 560, 'word', 'id51')}
    ${objectBox(950, 330, 'id92', 'int', '3')}
    ${objectBox(950, 535, 'id51', 'str', "'bonjour'")}
    ${line(490, 423, 940, 415)}
    ${line(490, 613, 940, 620)}
    ${rect(250, 720, 1100, 74, { fill: '#ecfeff', stroke: '#06b6d4', strokeWidth: 2, rx: 22 })}
    ${text(800, 768, '变量保存引用；对象保存 id、type、value。', { size: 34, weight: 800, anchor: 'middle', fill: '#0e7490' })}
  `;
  return svgFrame('Python 记忆模型', body, {
    subtitle: '变量不是盒子里的值；变量保存的是对象的引用',
  });
}

function figureAliasingMutationSvg() {
  const body = `
    ${panelBox(130, 205, 520, 520, '变量区', { accent: '#2563eb', titleFill: '#1d4ed8' })}
    ${panelBox(790, 205, 680, 520, '对象区', { accent: '#f59e0b', titleFill: '#b45309', fill: '#fffdf7' })}
    ${variableBox(245, 305, 'x', 'idA')}
    ${variableBox(245, 465, 'z', 'idA')}
    ${variableBox(245, 625, 'y', 'idB')}
    ${mutatedListObject(935, 310, 'idA', { width: 460, accent: '#f59e0b' })}
    ${listObject(935, 555, 'idB', '[1, 2, 3]', { width: 460, accent: '#94a3b8' })}
    ${line(495, 358, 925, 390)}
    ${line(495, 518, 925, 390)}
    ${line(495, 678, 925, 635)}
    ${rect(700, 470, 420, 80, { fill: '#fff1f2', stroke: '#ef4444', strokeWidth: 3, rx: 20, filter: 'url(#cardShadow)' })}
    ${text(910, 522, 'z[0] = -999', { size: 38, weight: 800, anchor: 'middle', fill: '#b91c1c', family: 'Menlo, Monaco, Consolas, monospace' })}
    ${rect(205, 760, 1190, 70, { fill: '#ecfeff', stroke: '#06b6d4', strokeWidth: 2, rx: 20 })}
    ${text(800, 806, 'x 和 z 指向同一个对象；改 z[0] 就是在改 x 也能看到的那个列表。', { size: 30, weight: 800, anchor: 'middle', fill: '#0e7490' })}
  `;
  return svgFrame('别名与变异', body);
}

function figureReassignmentSvg() {
  const body = `
    ${panelBox(100, 205, 650, 520, '执行前', { accent: '#64748b', titleFill: '#334155' })}
    ${panelBox(850, 205, 650, 520, '两行执行后', { accent: '#10b981', titleFill: '#065f46' })}
    ${codePill(570, 168, 'z[0] = -999    z = [1, 2, 3, 40]', { width: 460, accent: '#ef4444' })}
    ${variableBox(160, 335, 'x', 'idA', { width: 220 })}
    ${variableBox(160, 505, 'z', 'idA', { width: 220 })}
    ${listObject(450, 420, 'idA', '[1, 2, 3]', { width: 250, height: 166, valueSize: 32 })}
    ${line(380, 388, 442, 470)}
    ${line(380, 558, 442, 470)}
    ${variableBox(910, 345, 'x', 'idA', { width: 220 })}
    ${variableBox(910, 565, 'z', 'idC', { width: 220 })}
    ${listObject(1200, 328, 'idA', '[-999, 2, 3]', {
      width: 280,
      height: 154,
      accent: '#94a3b8',
      valueSize: 30,
    })}
    ${listObject(1200, 552, 'idC', '[1, 2, 3, 40]', {
      width: 280,
      height: 154,
      accent: '#f59e0b',
      valueSize: 28,
    })}
    ${line(1130, 398, 1192, 405)}
    ${line(1130, 618, 1192, 629)}
    ${rect(210, 760, 1180, 70, { fill: '#ecfeff', stroke: '#06b6d4', strokeWidth: 2, rx: 20 })}
    ${text(800, 806, '第一行改旧对象；第二行只让 z 换引用，所以 x 看到 [-999, 2, 3]。', { size: 29, weight: 800, anchor: 'middle', fill: '#0e7490' })}
  `;
  return svgFrame('重新赋值不是变异', body);
}

const FIGURES = [
  {
    filename: 'fig-01-variable-object-reference.png',
    alt: 'Python 记忆模型：变量保存对象引用，对象保存 id、type 和 value。',
    imagegenSource: 'csc148-fig-01-memory-model-imagegen.png',
    svg: figureReferenceModelSvg,
  },
  {
    filename: 'fig-02-aliasing-mutation.png',
    alt: '别名与变异：x 和 z 指向同一个 list，通过 z 变异会影响 x。',
    imagegenSource: 'csc148-fig-02-aliasing-mutation-imagegen.png',
    svg: figureAliasingMutationSvg,
  },
  {
    filename: 'fig-03-reassignment-not-mutation.png',
    alt: '重新赋值不是变异：先变异旧对象，再让 z 换到新对象，x 仍然指向被变异后的旧对象。',
    imagegenSource: 'csc148-fig-03-reassignment-imagegen.png',
    svg: figureReassignmentSvg,
  },
].map((figure) => ({
  ...figure,
  filePath: path.join(PUBLIC_DIR, figure.filename),
  imagegenPath: figure.imagegenSource ? path.join(IMAGEGEN_DIR, figure.imagegenSource) : null,
  publicPath: `${PUBLIC_PATH}/${figure.filename}`,
}));

async function renderFigures() {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  for (const figure of FIGURES) {
    if (figure.imagegenPath && fs.existsSync(figure.imagegenPath)) {
      await sharp(figure.imagegenPath).png().toFile(figure.filePath);
      continue;
    }
    const svg = figure.svg();
    await sharp(Buffer.from(svg)).png().toFile(figure.filePath);
  }
}

function imageMarkdown(index) {
  const figure = FIGURES[index];
  return `![${figure.alt}](${figure.publicPath})`;
}

const sections = [
  {
    title: '学习路线：先把“变量”和“对象”分开',
    summary: '把 Python memory model 作为调试复杂代码的第一张地图。',
    markdown: m`
这本笔记只做一件事：建立 CSC148 之后会反复使用的 **Python 记忆模型**。

你需要把三个问题分清：

- 一个对象有什么：\`id\`、\`type\`、\`value\`。
- 一个变量保存什么：它保存的是某个对象的引用，可以理解成对象的 \`id\`。
- 一行代码改变了什么：是让变量换引用，还是修改了某个对象内部的值。

${imageMarkdown(0)}

这张图是后面所有追踪题的底稿。看到 \`x = 3\` 时，不要只想“x 里面有 3”；更准确地说，\`x\` 保存了一个 \`int\` 对象的引用，这个对象的值是 \`3\`。
    `,
  },
  {
    title: '对象：id、type、value',
    summary: '对象才真正存放数据；类型决定对象能参与哪些操作。',
    markdown: m`
在 Python 里，所有数据都存在对象里。一个对象至少可以从三面理解：

| 成分 | 作用 | 例子 |
| --- | --- | --- |
| \`id\` | 这个对象的身份标记 | \`id(3)\` |
| \`type\` | 这个对象属于哪一类 | \`type(3)\` 得到 \`int\` |
| \`value\` | 这个对象当前表示的值 | \`3\`、\`'bonjour'\`、\`[1, 2, 3]\` |

例子：

~~~python
type(3)
type('words')
round(3.1419)
~~~

\`type\` 会影响你能对对象做什么。数值对象可以参与 \`round\`，字符串对象不能直接被 \`round\`。所以追踪错误时，不只要问“值是多少”，还要问“这个对象是什么类型”。

自查：

- \`3 + 4\` 可以执行，因为两个对象都支持数值加法。
- \`'hi' + 'there'\` 可以执行，因为字符串定义了拼接。
- \`3 + 'there'\` 会失败，因为这两个类型没有共同的 \`+\` 规则。
    `,
  },
  {
    title: '变量：变量没有类型，变量保存引用',
    summary: '变量名本身不是对象；变量当前指向的对象才有类型和值。',
    markdown: m`
变量不是对象本身。变量更像一个名字槽，里面放着某个对象的引用。

~~~python
word = 'bonjour'
type(word)
word = 42
type(word)
~~~

第一行之后，\`word\` 指向一个 \`str\` 对象。第三行之后，\`word\` 改为指向一个 \`int\` 对象。

所以更准确的说法是：

- 不是“变量 \`word\` 的类型从 \`str\` 变成 \`int\`”。
- 而是“变量 \`word\` 先后引用了两个不同类型的对象”。

这件事在 CSC148 很重要。类、链表、树、递归结构都会让一个变量指向更复杂的对象；如果你把变量和对象混在一起，后面追踪 mutation 会很容易乱。
    `,
  },
  {
    title: '赋值语句：先算右边，再更新左边',
    summary: '赋值不会直接修改旧对象；它先求值，再让变量保存新的引用。',
    markdown: m`
赋值语句可以按三步追踪：

1. 先计算右边表达式，得到某个对象的引用。
2. 如果左边变量还不存在，就创建这个变量。
3. 把右边得到的引用保存到左边变量里。

例题：

~~~python
x = 3
y = x + 4
x = 'hello'
~~~

追踪：

| 代码 | 发生了什么 |
| --- | --- |
| \`x = 3\` | 创建一个值为 \`3\` 的 \`int\` 对象，\`x\` 指向它。 |
| \`y = x + 4\` | 先取出 \`x\` 指向的对象参与加法，得到新对象 \`7\`，\`y\` 指向它。 |
| \`x = 'hello'\` | 创建或取得字符串对象，\`x\` 改为指向它。\`y\` 不受影响。 |

检查点：\`x = ...\` 这种形式通常是在改变变量保存的引用；它本身不是“钻进旧对象里改值”。
    `,
  },
  {
    title: '可变与不可变：能不能改对象内部',
    summary: 'immutable 对象不能被原地修改；mutable 对象可以被保留 id 地修改。',
    markdown: m`
对象可以分成两类：

| 类别 | 例子 | 关键特征 |
| --- | --- | --- |
| 不可变对象 | \`int\`、\`str\`、\`bool\`、\`tuple\` | 对象内部的值不能被改。 |
| 可变对象 | \`list\`、\`dict\`、自定义类实例 | 对象可以在保留同一个 \`id\` 的情况下改变内部内容。 |

例子一：字符串不可变。

~~~python
prof = 'Diane'
prof = prof + ' Horton'
~~~

第二行不会把旧字符串对象改长，而是产生一个新字符串对象，再让 \`prof\` 指向它。

例子二：列表可变。

~~~python
x = [1, 2, 3]
x[0] = 1000000
x.extend([10, 20, 30])
~~~

这里 \`x\` 仍然指向同一个列表对象，但这个列表对象内部的内容变了。

判断一句代码时，先问：这行是在换引用，还是在改对象？这比背“列表可变、字符串不可变”更有用。
    `,
  },
  {
    title: '别名：两个变量指向同一个对象',
    summary: 'aliasing 是很多副作用题的核心。',
    markdown: m`
当两个变量指向同一个对象时，它们互为别名。

~~~python
x = [1, 2, 3]
y = [1, 2, 3]
z = x
z[0] = -999
~~~

执行 \`z = x\` 后，\`z\` 和 \`x\` 保存的是同一个引用；\`y\` 虽然值看起来一样，但它指向另一个列表对象。

${imageMarkdown(1)}

所以 \`z[0] = -999\` 是修改 \`z\` 指向的对象。因为 \`x\` 也指向这个对象，所以从 \`x\` 看过去也会看到变化。

常见错法：

- 错：\`z[0] = -999\` 只改了 \`z\`。
- 对：它改的是 \`z\` 指向的列表对象；如果别的变量也指向这个对象，别的变量会看到同一处变化。
    `,
  },
  {
    title: '浅拷贝与深拷贝：复制外层还是整棵对象图',
    summary: '浅拷贝只复制最外层容器；深拷贝会递归复制内部可变对象。',
    markdown: m`
知道 aliasing 之后，下一步必须分清 **copy** 到底复制了哪一层。

先看一层 list：

~~~python
x = [1, 2, 3]
y = x
z = x.copy()
~~~

这里：

- \`y = x\` 没有复制 list，只是让 \`y\` 和 \`x\` 指向同一个 list。
- \`z = x.copy()\` 创建了一个新的 list 对象，里面放入同样的元素引用。

如果元素都是 \`int\`、\`str\` 这类 immutable 对象，浅拷贝通常已经足够。但 nested list 会暴露问题：

~~~python
grid = [[1, 2], [3, 4]]
shallow = grid.copy()
shallow[0][0] = 999

print(grid)
~~~

结果是：

~~~text
[[999, 2], [3, 4]]
~~~

原因：\`grid.copy()\` 只复制了最外层 list。新的外层 list 和旧的外层 list 是两个对象，但它们里面保存的内部 list 引用仍然相同。

可以用 memory model 这样画：

~~~text
grid    -> outerA -> inner1 [999, 2]
                 -> inner2 [3, 4]

shallow -> outerB -> inner1 [999, 2]
                 -> inner2 [3, 4]
~~~

如果你想连内部 list 也复制，就需要 **deep copy**：

~~~python
import copy

grid = [[1, 2], [3, 4]]
deep = copy.deepcopy(grid)
deep[0][0] = 999

print(grid)
print(deep)
~~~

结果：

~~~text
[[1, 2], [3, 4]]
[[999, 2], [3, 4]]
~~~

总结：

| 写法 | 是否创建新外层对象 | 内部可变对象是否共享 |
| --- | --- | --- |
| \`y = x\` | 否 | 全部共享 |
| \`x.copy()\` / \`x[:]\` / \`list(x)\` | 是 | 仍然共享内部对象 |
| \`copy.deepcopy(x)\` | 是 | 通常不共享内部对象 |

在 CSC148 里，判断 copy 题时不要只问“是不是复制了”。要问：复制了哪一层？内部 mutable object 还共享吗？
    `,
  },
  {
    title: '重新赋值不是变异',
    summary: '给变量赋新值，只是让变量转向新对象，不会自动修改旧对象。',
    markdown: m`
把下面两种代码分开：

~~~python
z[0] = -999
z = [1, 2, 3, 40]
~~~

第一行是变异：进入 \`z\` 指向的列表对象，把第一个位置改掉。

第二行是重新赋值：创建一个新列表对象，让 \`z\` 指向新对象。它不会再进入旧列表修改值；旧列表保持第一行之后的状态，也就是 \`[-999, 2, 3]\`。

${imageMarkdown(2)}

例题：

~~~python
x = [1, 2, 3]
z = x
z = [1, 2, 3, 40]
print(x)
~~~

答案是：

~~~text
[1, 2, 3]
~~~

原因：\`z = [1, 2, 3, 40]\` 让 \`z\` 换了引用；它没有修改 \`x\` 仍然指向的旧列表。
    `,
  },
  {
    title: '相等：== 和 is 问的是两件事',
    summary: '`==` 比较值，`is` 比较是否同一个对象。',
    markdown: m`
Python 里有两种“相等”：

| 写法 | 问题 | 例子 |
| --- | --- | --- |
| \`a == b\` | 两个对象的值是否相等？ | \`[1, 2] == [1, 2]\` 通常是 \`True\` |
| \`a is b\` | 两个变量是否指向同一个对象？ | \`z is x\` 在 \`z = x\` 后是 \`True\` |

例题：

~~~python
x = [1, 2, 3]
y = [1, 2, 3]
z = x

x == y
x is y
x == z
x is z
~~~

参考判断：

| 表达式 | 结果 | 原因 |
| --- | --- | --- |
| \`x == y\` | \`True\` | 两个列表的值一样。 |
| \`x is y\` | \`False\` | 它们是两个不同的列表对象。 |
| \`x == z\` | \`True\` | 同一个对象，值当然一样。 |
| \`x is z\` | \`True\` | \`z = x\` 后两者指向同一个对象。 |

做追踪题时，\`==\` 不能告诉你有没有 aliasing；\`is\` 才是在问“是不是同一个对象”。
    `,
  },
  {
    title: '列表和循环里的副作用',
    summary: '列表方法、循环变量和引用模型会一起影响最终结果。',
    markdown: m`
列表是可变对象，所以很多列表方法会直接修改原列表：

| 方法或操作 | 是否修改原列表 | 例子 |
| --- | --- | --- |
| \`append\` | 是 | \`xs.append(4)\` |
| \`extend\` | 是 | \`xs.extend([4, 5])\` |
| \`sort\` | 是 | \`xs.sort()\` |
| \`+\` | 通常产生新列表 | \`xs + [4]\` |

例题：

~~~python
xs = [1, 2]
ys = xs
xs.append(3)
ys = ys + [4]
print(xs)
print(ys)
~~~

追踪：

1. \`ys = xs\` 后，\`ys\` 和 \`xs\` 指向同一个列表。
2. \`xs.append(3)\` 修改这个共享列表，所以此时两个变量都能看到 \`[1, 2, 3]\`。
3. \`ys = ys + [4]\` 产生一个新列表，再让 \`ys\` 指向新列表。

结果：

~~~text
[1, 2, 3]
[1, 2, 3, 4]
~~~

最后一步没有修改旧列表；它只是让 \`ys\` 换到新列表。
    `,
  },
  {
    title: '自测清单',
    summary: '用短题检查是否真的能追踪对象和引用。',
    markdown: m`
学完这本后，你应该能回答这些问题：

1. 变量保存的是值本身，还是对象引用？
2. 对象的 \`id\`、\`type\`、\`value\` 分别表示什么？
3. \`x = ...\` 和 \`x[0] = ...\` 的差别是什么？
4. 两个列表值一样，是否一定是同一个对象？
5. \`append\`、\`extend\`、\`+\` 哪些会改原列表？

快速练习：

~~~python
a = [10, 20]
b = a
c = [10, 20]
b.append(30)
c = c + [40]
~~~

请自己画一张 memory model 图，然后判断：

~~~python
a == b
a is b
a == c
a is c
~~~

参考答案：

- \`a == b\` 是 \`True\`，而且 \`a is b\` 也是 \`True\`。
- \`a == c\` 是 \`False\`，因为 \`a\` 指向 \`[10, 20, 30]\`，\`c\` 指向 \`[10, 20, 40]\`。
- \`a is c\` 是 \`False\`，因为它们指向不同对象。

真正的目标不是背答案，而是每一步都能说清楚：变量现在指向哪个对象，这个对象有没有被修改。
    `,
  },
];

function buildNotebookSections() {
  return sections.map((section, index) => ({
    id: `${NOTEBOOK_ID}-section-${String(index + 1).padStart(2, '0')}`,
    title: section.title,
    order: index,
    markdown: section.markdown,
    summary: section.summary,
    sourceMeta: {
      source: 'CSC148 Course Notes',
      sourceUrl:
        'https://www.teach.cs.toronto.edu/~csc148h/notes/python-recap/memory_model_part1.html',
      courseNotesUrl: 'https://www.teach.cs.toronto.edu/~csc148h/notes/',
      importVersion: IMPORT_VERSION,
      localized: 'zh-CN',
      figurePaths: FIGURES.map((figure) => figure.publicPath),
    },
  }));
}

function collectImageReferences(markdown) {
  return [...markdown.matchAll(/!\[[^\]]*\]\((\/generated-notebooks\/[^)\s]+)\)/g)].map(
    (match) => match[1],
  );
}

function auditSections(notebookSections) {
  const errors = [];
  for (const section of notebookSections) {
    if (/^\s*[*-]\s*$/m.test(section.markdown)) {
      errors.push(`${section.title}: orphan list marker`);
    }
    if (/Disclaimer|Speed Up Education|not for sale/i.test(section.markdown)) {
      errors.push(`${section.title}: leaked source boilerplate`);
    }
    for (const publicPath of collectImageReferences(section.markdown)) {
      const filePath = path.join(ROOT, 'public', publicPath.replace(/^\//, ''));
      if (!fs.existsSync(filePath)) errors.push(`${section.title}: missing image ${publicPath}`);
    }
  }
  const referenced = new Set(
    notebookSections.flatMap((section) => collectImageReferences(section.markdown)),
  );
  for (const figure of FIGURES) {
    if (!referenced.has(figure.publicPath)) {
      errors.push(`figure not referenced: ${figure.publicPath}`);
    }
  }
  if (errors.length) throw new Error(`Notebook audit failed:\n${errors.join('\n')}`);
}

function mimeTypeForPath(filePath) {
  return (
    IMAGE_MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
  );
}

async function ensureNotebookImageAssetTable(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "NotebookImageAsset" (
      "id" TEXT PRIMARY KEY,
      "path" TEXT NOT NULL UNIQUE,
      "mimeType" TEXT NOT NULL,
      "data" BYTEA NOT NULL,
      "sizeBytes" INTEGER NOT NULL,
      "sha256" TEXT NOT NULL,
      "source" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "NotebookImageAsset_sha256_idx" ON "NotebookImageAsset"("sha256")',
  );
}

async function upsertImageAsset(prisma, figure) {
  const bytes = fs.readFileSync(figure.filePath);
  const fileStat = fs.statSync(figure.filePath);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const mimeType = mimeTypeForPath(figure.filePath);
  const id = crypto.randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "NotebookImageAsset" (
      "id",
      "path",
      "mimeType",
      "data",
      "sizeBytes",
      "sha256",
      "source",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${id},
      ${figure.publicPath},
      ${mimeType},
      ${bytes},
      ${fileStat.size},
      ${sha256},
      ${'scripts/maintenance/import-csc148-first-markdown-notebook.mjs'},
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT ("path") DO UPDATE SET
      "mimeType" = EXCLUDED."mimeType",
      "data" = EXCLUDED."data",
      "sizeBytes" = EXCLUDED."sizeBytes",
      "sha256" = EXCLUDED."sha256",
      "source" = EXCLUDED."source",
      "updatedAt" = CURRENT_TIMESTAMP
  `;
}

async function refreshCourseSummaryFields(prisma, courseId) {
  const notebookAggregate = await prisma.notebook.aggregate({
    where: { courseId },
    _count: { _all: true },
    _sum: {
      sceneCount: true,
      speechReadyCount: true,
      speechTotalCount: true,
    },
  });
  const [problemCount, publishedProblemCount] = await Promise.all([
    prisma.notebookProblem.count({
      where: { OR: [{ courseId }, { notebook: { courseId } }] },
    }),
    prisma.notebookProblem.count({
      where: {
        status: 'published',
        OR: [{ courseId }, { notebook: { courseId } }],
      },
    }),
  ]);

  await prisma.course.update({
    where: { id: courseId },
    data: {
      notebookCount: notebookAggregate._count._all,
      sceneCount: notebookAggregate._sum.sceneCount ?? 0,
      problemCount,
      publishedProblemCount,
      speechReadyCount: notebookAggregate._sum.speechReadyCount ?? 0,
      speechTotalCount: notebookAggregate._sum.speechTotalCount ?? 0,
    },
  });
}

async function resolveCourse(prisma, preferredCourseId) {
  let course = preferredCourseId
    ? await prisma.course.findUnique({
        where: { id: preferredCourseId },
        select: { id: true, name: true, courseCode: true, ownerId: true },
      })
    : null;
  if (course) return course;

  course = await prisma.course.findFirst({
    where: {
      OR: [
        { courseCode: { contains: 'CSC148', mode: 'insensitive' } },
        { name: { contains: 'CSC148', mode: 'insensitive' } },
        { tags: { has: 'CSC148' } },
      ],
    },
    select: { id: true, name: true, courseCode: true, ownerId: true },
    orderBy: { updatedAt: 'desc' },
  });
  if (course) return course;
  throw new Error(
    `CSC148 course not found. Pass --course-id=<id> after creating the course, or set CSC148_COURSE_ID.`,
  );
}

async function upsertMarkdownNotebook(prisma, course, notebookSections) {
  await prisma.$transaction(async (tx) => {
    await tx.notebook.upsert({
      where: { id: NOTEBOOK_ID },
      create: {
        id: NOTEBOOK_ID,
        ownerId: course.ownerId,
        courseId: course.id,
        name: NOTEBOOK_NAME,
        description:
          'CSC148 中文 Markdown 笔记：Python 记忆模型、变量引用、可变性、别名、副作用与相等性。',
        tags: ['CSC148', 'Python', 'Markdown', '记忆模型'],
        avatarUrl: FIGURES[0].publicPath,
        language: 'zh-CN',
        style: 'source-markdown-with-figures',
        notebookKind: 'markdown',
        listedInNotebookStore: false,
        notebookPriceCents: 0,
        sceneCount: notebookSections.length,
        sectionCount: notebookSections.length,
        speechReadyCount: 0,
        speechTotalCount: 0,
        speechStatus: 'no_speech',
        coverSlideJson: Prisma.DbNull,
        coverImagePath: FIGURES[0].publicPath,
      },
      update: {
        ownerId: course.ownerId,
        courseId: course.id,
        name: NOTEBOOK_NAME,
        description:
          'CSC148 中文 Markdown 笔记：Python 记忆模型、变量引用、可变性、别名、副作用与相等性。',
        tags: ['CSC148', 'Python', 'Markdown', '记忆模型'],
        avatarUrl: FIGURES[0].publicPath,
        language: 'zh-CN',
        style: 'source-markdown-with-figures',
        notebookKind: 'markdown',
        listedInNotebookStore: false,
        notebookPriceCents: 0,
        sceneCount: notebookSections.length,
        sectionCount: notebookSections.length,
        speechReadyCount: 0,
        speechTotalCount: 0,
        speechStatus: 'no_speech',
        coverSlideJson: Prisma.DbNull,
        coverImagePath: FIGURES[0].publicPath,
        contentVersion: { increment: 1 },
        updatedAt: new Date(),
      },
    });
    await tx.scene.deleteMany({ where: { notebookId: NOTEBOOK_ID } });
    await tx.markdownNotebookSection.deleteMany({ where: { notebookId: NOTEBOOK_ID } });
    await tx.markdownNotebookSection.createMany({
      data: notebookSections.map((section) => ({
        ...section,
        notebookId: NOTEBOOK_ID,
        courseId: course.id,
      })),
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  loadEnvFiles();
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is not configured. Add it to .env.local or the shell env.');
  }

  await renderFigures();
  const notebookSections = buildNotebookSections();
  auditSections(notebookSections);

  const prisma = new PrismaClient();
  try {
    const course = await resolveCourse(prisma, args.courseId);
    const existing = await prisma.notebook.findUnique({
      where: { id: NOTEBOOK_ID },
      select: {
        id: true,
        notebookKind: true,
        sceneCount: true,
        sectionCount: true,
        _count: { select: { scenes: true, markdownSections: true } },
      },
    });

    console.log(`Mode: ${args.write ? 'write' : 'dry-run'}`);
    console.log(`Course: ${course.name} (${course.id}) code=${course.courseCode || 'N/A'}`);
    console.log(`Notebook: ${NOTEBOOK_NAME} (${NOTEBOOK_ID})`);
    console.log(`Import version: ${IMPORT_VERSION}`);
    console.log(`Figures: ${FIGURES.length}`);
    for (const figure of FIGURES) {
      const stat = fs.statSync(figure.filePath);
      console.log(`- ${figure.publicPath} (${stat.size} bytes)`);
    }
    console.log(`Sections: ${notebookSections.length}`);
    for (const section of notebookSections) {
      console.log(`- ${section.order + 1}. ${section.title}`);
    }
    if (existing) {
      console.log(
        `Existing notebook: kind=${existing.notebookKind}, sectionCount=${existing.sectionCount}, markdownSections=${existing._count.markdownSections}, scenes=${existing._count.scenes}`,
      );
    } else {
      console.log('Existing notebook: none');
    }

    if (!args.write) {
      console.log('Dry-run complete. Re-run with --write to mutate the target DB.');
      return;
    }

    await ensureNotebookImageAssetTable(prisma);
    for (const figure of FIGURES) {
      await upsertImageAsset(prisma, figure);
    }
    await upsertMarkdownNotebook(prisma, course, notebookSections);
    await refreshCourseSummaryFields(prisma, course.id);

    const created = await prisma.notebook.findUnique({
      where: { id: NOTEBOOK_ID },
      select: {
        id: true,
        name: true,
        notebookKind: true,
        sceneCount: true,
        sectionCount: true,
        coverImagePath: true,
        _count: { select: { scenes: true, markdownSections: true } },
      },
    });
    const assetCount = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS count
      FROM "NotebookImageAsset"
      WHERE "path" = ANY(${FIGURES.map((figure) => figure.publicPath)})
    `;
    console.log('Write complete.');
    console.log(
      JSON.stringify(
        { notebook: created, persistedImageAssets: Number(assetCount[0]?.count ?? 0) },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
