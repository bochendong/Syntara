#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';

const SCRIPT_NAME = 'create-cpsc107-first-notebook-v2.mjs';
const NOTEBOOK_ID = 'queue-cpsc107-01-racket-basics';
const COURSE_ID = process.env.CPSC107_COURSE_ID || 'cmpc9dqgv000p8ogmrsjl5co8';
const QUEUE_DIR = path.join('tmp', 'notebook-imagegen-queue', 'CPSC107', NOTEBOOK_ID);
const PUBLIC_DIR = path.join('public', 'generated-notebooks', NOTEBOOK_ID);
const PUBLIC_PATH = `/generated-notebooks/${NOTEBOOK_ID}`;
const SOURCE_WIDTH = 1600;
const SOURCE_HEIGHT = 900;
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;
const HOTSPOT_PATH = 'M 0 0 L 200 0 L 200 200 L 0 200 Z';

const MARKERS = [
  { name: 'red', hex: '#ff0000', cn: '红色', match: (r, g, b) => r > 180 && g < 85 && b < 85 },
  { name: 'lime', hex: '#00ff00', cn: '绿色', match: (r, g, b) => g > 170 && r < 90 && b < 95 },
  { name: 'blue', hex: '#0048ff', cn: '蓝色', match: (r, g, b) => b > 145 && r < 90 && g < 140 },
  { name: 'cyan', hex: '#00ffff', cn: '青色', match: (r, g, b) => g > 165 && b > 165 && r < 95 },
  { name: 'yellow', hex: '#ffff00', cn: '黄色', match: (r, g, b) => r > 170 && g > 170 && b < 110 },
];

const LAYOUTS = {
  red: { marker: [[350, 26], [1250, 26], [350, 156], [1250, 156]], body: [390, 48, 820, 88] },
  lime: { marker: [[58, 188], [746, 188], [58, 662], [746, 662]], body: [88, 218, 628, 410] },
  blue: { marker: [[876, 170], [1532, 170], [876, 366], [1532, 366]], body: [906, 198, 596, 136] },
  cyan: { marker: [[820, 406], [1452, 406], [820, 674], [1452, 674]], body: [850, 434, 572, 208] },
  yellow: { marker: [[330, 724], [1290, 724], [330, 866], [1290, 866]], body: [370, 748, 880, 92] },
};

const CODE_BANK = {
  sourcePdf: 'queue/CPSC107/01_Rackert_基础.pdf',
  snippets: [
    {
      id: 'math-to-racket',
      sourcePages: [5],
      code: [
        '3 - 2                      -> (- 3 2)',
        '3 - 2 + 4/5                -> (+ (- 3 2) (/ 4 5))',
        '(6 - 4)(3 + 2)             -> (* (- 6 4) (+ 3 2))',
      ],
    },
    {
      id: 'primitive-operators',
      sourcePages: [5],
      code: [
        '(sqr 2)              ;; Output 4',
        '(sqrt 9)             ;; Output 3',
        '(quotient 75 7)      ;; Output 10',
        '(remainder 75 7)     ;; Output 5',
      ],
    },
    {
      id: 'eval-plus',
      sourcePages: [6],
      code: ['(+ (* 12 3) (- 2 1 3))', '(+ 36 (- 2 1 3))', '(+ 36 -2)', '34'],
    },
    {
      id: 'boolean-examples',
      sourcePages: [8],
      code: [
        '(and true true)                  ;; Output: True',
        '(or true false)                  ;; Output: True',
        '(not true)                       ;; Output: False',
        '(and (or true false) false)      ;; Output: False',
      ],
    },
    {
      id: 'short-circuit-eval',
      sourcePages: [9],
      code: [
        '(and (< 3 5)',
        '     (or (< 1 3) (= 1 3))',
        '     (or (> 1 5) (> 2 5)))',
        '⇒ (and true (or (< 1 3) (= 1 3))',
        '        (or (> 1 5) (> 2 5)))',
        '⇒ (and true true (or (> 1 5) (> 2 5)))',
        '⇒ (and true true (or false false))',
        '⇒ false',
      ],
    },
    {
      id: 'short-circuit-practice',
      sourcePages: [10],
      code: ['(and (< 3 5) (< 4 8) (7 < 6) (< 2 3))'],
    },
    {
      id: 'string-functions',
      sourcePages: [11],
      code: [
        '(string-append "123" "456" "789") ;; "123456789"',
        '(string-length "123")             ;; 3',
        '(substring "123" 0 1)             ;; "1"',
        '(string=? "123" "456")           ;; False',
      ],
    },
    {
      id: 'image-functions',
      sourcePages: [12],
      code: [
        '(require 2htdp/image)',
        '(circle 10 "solid" "red")',
        '(rectangle 10 20 "outline" "red")',
        '(text "hello" 24 "orange")',
        '(above image_1 image_2 ...)',
        '(beside image_1 image_2 ...)',
        '(overlay image_1 image_2 ...)',
        '(rotate 30 image)',
      ],
    },
    {
      id: 'function-template',
      sourcePages: [14],
      code: ['(define (函数名 变量一 变量二)', '  函数逻辑', '  )'],
    },
    {
      id: 'function-eval',
      sourcePages: [15],
      code: [
        '(define (f x) (* x x))',
        '(define (g x y) (- x y))',
        '',
        '(g (f 2) (g 3 1))',
        '⇒ (g (* 2 2) (g 3 1))',
        '⇒ (g 4 (g 3 1))',
        '⇒ (g 4 (- 3 1))',
        '⇒ (g 4 2)',
        '⇒ (- 4 2)',
        '⇒ 2',
      ],
    },
    {
      id: 'term-eval',
      sourcePages: [16],
      code: [
        '(define (term x y) (* x (sqr y)))',
        '',
        '(term (- 5 3) (+ 1 2))',
        '⇒ (term 2 (+ 1 2))',
        '⇒ (term 2 3)',
        '⇒ (* 2 (sqr 3))',
        '⇒ (* 2 9)',
        '⇒ 18',
      ],
    },
    {
      id: 'global-constants',
      sourcePages: [17],
      code: [
        '(define DISCOUNT 0.2)',
        '(define TAX-RATE 0.13)',
        '',
        '(define (cal_final-price total_price)',
        '  (* (* total_price DISCOUNT) TAX-RATE)',
        '  )',
        '',
        '(cal_final-price 200)',
      ],
    },
    {
      id: 'if-template',
      sourcePages: [18],
      code: ['(if question-expression', '    true-answer', '    false-answer', '    )'],
    },
    {
      id: 'if-eval',
      sourcePages: [19],
      code: [
        '(define IMAGE_HEIGHT 10)',
        '(define IMAGE_WIDTH 5)',
        '',
        '(if (> IMAGE_HEIGHT IMAGE_WIDTH)',
        '    "Tall"',
        '    "Wide"',
        '    )',
      ],
    },
    {
      id: 'foo-exercise',
      sourcePages: [20],
      code: [
        '(define A 5)',
        '(define B 10)',
        '',
        '(define (foo x y)',
        '  (+ (* A x y B) (+ x y x)))',
        '',
        '(foo 1 2)',
      ],
    },
    {
      id: 'cond-eval',
      sourcePages: [21, 22],
      code: [
        '(cond',
        '  [(2 > 3) "ab"]',
        '  [(4 < 2) "def"]',
        '  [else "g"])',
        '⇒ (cond',
        '    [false "ab"]',
        '    [(4 < 2) "def"]',
        '    [else "g"])',
        '⇒ (cond [false "def"] [else "g"])',
        '⇒ "g"',
      ],
    },
  ],
};

const PAGES = [
  {
    title: 'Racket 读法：operator 放在最前面',
    sceneTitle: '前缀表达式',
    components: [
      c('red', '读法核心', 'Racket 中每个括号表达式先看第一个位置：它是 operator，后面都是 operands。'),
      code('lime', '讲义代码', 'math-to-racket'),
      c('blue', 'Operands', 'operands 是跟在 operator 后面的表达式，先变成 value。'),
      c('cyan', '求值顺序', '从左到右，从里到外：先把 operands 算完，再执行 operator。'),
      c('yellow', '检查句', '读代码第一问：这组括号的第一个东西是谁？'),
    ],
  },
  {
    title: 'Primitive Operators：语言给好的积木',
    sceneTitle: '基础操作符',
    components: [
      c('red', '本页目标', '认识 Racket 已经提供的基础操作符和 built-in functions。'),
      code('lime', '讲义代码', 'primitive-operators'),
      c('blue', '操作符位置', 'sqr、sqrt、quotient、remainder 都放在括号第一位。'),
      c('cyan', 'Call to Primitive', '对最基础算式的计算称为 call to primitive。'),
      c('yellow', '检查句', '不要自己写这些函数，先学会正确调用它们。'),
    ],
  },
  {
    title: '逐步求值：每一步只化简一处',
    sceneTitle: '表达式求值',
    components: [
      c('red', '题目', 'Show the step by step evaluation of the expression.'),
      code('lime', '讲义代码', 'eval-plus'),
      c('blue', '第一步', '先算最左边能算的内部表达式：(* 12 3) 变成 36。'),
      c('cyan', '第二步', '再算右边 (- 2 1 3)，最后外层加法得到 34。'),
      c('yellow', '考试写法', '一行只做一次合法化简，步骤才清楚。'),
    ],
  },
  {
    title: 'Boolean：true 和 false 也是值',
    sceneTitle: '逻辑表达式',
    components: [
      c('red', '逻辑值', 'Boolean 只有 true 和 false，两者都是程序中的 value。'),
      code('lime', '讲义代码', 'boolean-examples'),
      c('blue', 'and / or', 'and 要全部为 true；or 只要有一个 true。'),
      c('cyan', 'not', 'not 把 true 和 false 反过来。'),
      c('yellow', '检查句', '先把小表达式算成 Boolean，再处理连接词。'),
    ],
  },
  {
    title: '短路求值：结果确定就停',
    sceneTitle: '短路求值',
    components: [
      c('red', '规则', 'AND 遇到 false 可停；OR 遇到 true 可停。'),
      code('lime', '讲义代码', 'short-circuit-eval'),
      c('blue', '关键一步', 'or 的第一个 operand 已经是 true 时，后面不必再算。'),
      c('cyan', '最后一步', 'and 的最后一个 operand 是 false，所以整体为 false。'),
      c('yellow', '考试提醒', '短路是期中常考点，要写出为什么可以停。'),
    ],
  },
  {
    title: '短路练习：先检查每个小表达式',
    sceneTitle: '短路练习',
    components: [
      c('red', '练习目标', '先不要急着算 true 或 false，先检查每个括号是不是 Racket 前缀写法。'),
      code('lime', '讲义题面', 'short-circuit-practice'),
      c('blue', '格式检查', '第三个比较写成了 (7 < 6)，读代码时要先发现 operator 位置不对。'),
      c('cyan', '求值策略', '合法比较先各自化成 Boolean，再让 and 从左到右决定是否短路。'),
      c('yellow', '检查句', '代码课第一步不是算答案，而是确认表达式本身能被 Racket 读懂。'),
    ],
  },
  {
    title: 'String：双引号里的数据',
    sceneTitle: '字符串操作',
    components: [
      c('red', '概念', '用双引号括起来的数据是 String；"123" 和 123 类型不同。'),
      code('lime', '讲义代码', 'string-functions'),
      c('blue', 'substring', 'substring 是前取后不取；0 到 1 只拿 index 0。'),
      c('cyan', 'string=?', '比较字符串相等要用 string=?，不是数学等号。'),
      c('yellow', '检查句', '先确认数据类型，再选对应的函数。'),
    ],
  },
  {
    title: 'Image：代码也可以画图',
    sceneTitle: '图像函数',
    components: [
      c('red', '先 require', '使用 circle、rectangle、text 之前，需要加载 2htdp/image。'),
      code('lime', '讲义代码', 'image-functions'),
      c('blue', '基础图形', 'circle、rectangle、text 都会产生 image。'),
      c('cyan', '组合图像', 'above、beside、overlay 会把多个 image 组合起来。'),
      c('yellow', '类型提醒', 'text 画出来的是 image，不是 string。'),
    ],
  },
  {
    title: 'Primitive Data：程序里的原子材料',
    sceneTitle: '基础数据类型',
    components: [
      c('red', '四种类型', '这节课主要看到 Booleans、numbers、image、String。'),
      c('lime', '为什么要类型', '同样的符号在不同类型里意义不同，程序需要区分。'),
      c('blue', '原子数据', '基础类型像原子材料，以后会组合成更复杂的数据。'),
      c('cyan', '常见混淆', '"123" 是 String，123 是 number，不能混着处理。'),
      c('yellow', '下节连接', 'HTDD 会把这些基础类型组织成自定义数据。'),
    ],
  },
  {
    title: 'Function：把一段逻辑命名',
    sceneTitle: '函数定义结构',
    components: [
      c('red', '函数意义', '函数是一段可以重复使用的代码，用于执行某个特定任务。'),
      code('lime', '讲义代码', 'function-template'),
      c('blue', '函数名', '函数名应该说明这段代码大概做什么。'),
      c('cyan', '参数', '变量一、变量二是占位符，调用时才被实际值替换。'),
      c('yellow', '检查句', '定义函数不等于执行函数；调用时才计算。'),
    ],
  },
  {
    title: '函数调用求值：先算参数，再展开函数',
    sceneTitle: '函数求值规则',
    components: [
      c('red', '规则', '总是先简化最左边需要简化的表达式。'),
      code('lime', '讲义代码', 'function-eval'),
      c('blue', '定义不执行', 'define 只是把 f 和 g 放进环境，调用才开始算。'),
      c('cyan', '参数先算', '外层 g 要等两个参数都变成 value 后才展开。'),
      c('yellow', '检查句', '函数调用题：先算参数，再代入 body。'),
    ],
  },
  {
    title: '练习：term 的逐步化简',
    sceneTitle: 'term 练习',
    components: [
      c('red', '题目', 'term 的 body 是 x 乘以 y 的平方，两个参数本身也是表达式。'),
      code('lime', '讲义代码', 'term-eval'),
      c('blue', '参数 x', '(- 5 3) 先化简成 2。'),
      c('cyan', '参数 y', '(+ 1 2) 先化简成 3，再进入 body。'),
      c('yellow', '检查句', '不要提前展开 body；参数先变成 value。'),
    ],
  },
  {
    title: 'Global Variable：共享的名字',
    sceneTitle: '全局常量',
    components: [
      c('red', '概念', 'global variable 可以在程序任何部分被访问，讲义建议一般写成大写。'),
      code('lime', '讲义代码', 'global-constants'),
      c('blue', '共享资源', '折扣和税率写一次，函数里直接使用这些名字。'),
      c('cyan', '求值规则', '调用时 total_price 替换为 200，全局名字替换为对应数值。'),
      c('yellow', '检查句', '全局常量减少重复，也让后续修改更集中。'),
    ],
  },
  {
    title: 'if：只选择一个分支执行',
    sceneTitle: 'if 结构',
    components: [
      c('red', '结构', 'if 由 question-expression、true-answer、false-answer 三部分组成。'),
      code('lime', '讲义代码', 'if-template'),
      c('blue', 'true 情况', '问题表达式为 true 时，整个 if 替换成 true-answer。'),
      c('cyan', 'false 情况', '问题表达式为 false 时，整个 if 替换成 false-answer。'),
      c('yellow', '检查句', 'if 只走一个分支，不是两个 answer 都算。'),
    ],
  },
  {
    title: 'if 求值练习：Tall 还是 Wide',
    sceneTitle: 'if 求值',
    components: [
      c('red', '题目', '根据 IMAGE_HEIGHT 和 IMAGE_WIDTH 判断结果。'),
      code('lime', '讲义代码', 'if-eval'),
      c('blue', '先算问题', '(> IMAGE_HEIGHT IMAGE_WIDTH) 会先被化简。'),
      c('cyan', '选择分支', '10 大于 5，所以保留 "Tall" 这一支。'),
      c('yellow', '检查句', 'question-expression 先变成 Boolean，才选择答案。'),
    ],
  },
  {
    title: '函数与全局变量混合求值',
    sceneTitle: 'foo 练习',
    components: [
      c('red', '题目', '这题同时考全局变量、函数参数和嵌套表达式。'),
      code('lime', '讲义代码', 'foo-exercise'),
      c('blue', '全局替换', 'A 和 B 来自外层 define，调用时可在 body 中使用。'),
      c('cyan', '参数替换', '(foo 1 2) 中 x 变成 1，y 变成 2。'),
      c('yellow', '检查句', '先替换名字，再按从左到右、从里到外求值。'),
    ],
  },
  {
    title: 'cond：多个条件从上往下试',
    sceneTitle: 'cond 结构',
    components: [
      c('red', '结构', 'cond 的每一行都有 question-expression 和 answer-expression。'),
      code('lime', '讲义代码', 'cond-eval'),
      c('blue', '第一行', '(2 > 3) 得到 false，所以跳过 "ab"。'),
      c('cyan', '第二行', '(4 < 2) 也得到 false，所以继续往下。'),
      c('yellow', '结果', 'else 被选中，最后结果是 "g"。'),
    ],
  },
  {
    title: '基础课总结：读、算、分类型、组织程序',
    sceneTitle: 'Racket 基础总结',
    components: [
      c('red', '读表达式', '先找 operator，再看 operands。'),
      c('lime', '算成 value', '从左到右、从里到外；参数先算，再展开函数。'),
      c('blue', '分清类型', 'Number、String、Boolean、Image 对应不同操作。'),
      c('cyan', '控制流程', 'and/or 会短路；if/cond 只选择对应分支。'),
      c('yellow', '下节钩子', '下一本进入 HTDF/HTDD：把函数和数据设计成固定格式。'),
    ],
  },
];

function c(marker, label, text) {
  return { marker, label, text, kind: 'text', speech: '' };
}

function code(marker, label, snippetId) {
  const snippet = CODE_BANK.snippets.find((item) => item.id === snippetId);
  if (!snippet) throw new Error(`Unknown snippet: ${snippetId}`);
  return { marker, label, snippetId, code: snippet.code, kind: 'code', speech: '' };
}

const SPEECH = {
  '前缀表达式': {
    读法核心: 'Racket 的第一件事是读括号。每组括号最前面的位置是 operator，后面的东西都是 operands。',
    讲义代码: '这里的代码来自讲义，把熟悉的数学写法翻成 Racket 前缀写法。注意加减乘除都放到最前面。',
    Operands: 'operands 不是装饰，它们自己也可能是表达式，所以通常要先被求值。',
    求值顺序: '求值顺序可以先记成从左到右、从里到外：里面的 operands 变成 value 后，外层 operator 才执行。',
    检查句: '之后看到任何 Racket 代码，第一问都是：这组括号第一个东西是谁。',
  },
  基础操作符: {
    本页目标: '这一页把语言已经提供好的基础操作符放在一起。我们先学会调用，再谈自己定义函数。',
    讲义代码: '这些代码逐行来自讲义：sqr、sqrt、quotient、remainder 都是可以直接调用的 built-in functions。',
    操作符位置: '它们都遵守同一个结构：函数名或操作符在括号第一位，输入放在后面。',
    'Call to Primitive': '对这些最基础操作符的调用，讲义称为 call to primitive。',
    检查句: '如果语言已经提供了操作，就不要自己重写；先保证调用格式正确。',
  },
};

for (const page of PAGES) {
  for (const component of page.components) {
    component.speech =
      SPEECH[page.sceneTitle]?.[component.label] ||
      `这一块聚焦“${component.label}”。请按页面上的代码或说明读：${component.text || `代码片段 ${component.snippetId}`}。`;
  }
}

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function pageLabel(pageNumber) {
  return String(pageNumber).padStart(3, '0');
}

function markerFor(name) {
  const marker = MARKERS.find((item) => item.name === name);
  if (!marker) throw new Error(`Unknown marker ${name}`);
  return marker;
}

function wrapLine(text, maxChars) {
  const value = String(text);
  if (value.length <= maxChars) return [value];
  const out = [];
  let rest = value;
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf(' ', maxChars);
    if (cut < maxChars * 0.45) cut = maxChars;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

function textBlock(lines, x, y, width, options = {}) {
  const fontSize = options.fontSize || 24;
  const lineHeight = options.lineHeight || Math.round(fontSize * 1.35);
  const family = options.family || 'Arial, PingFang SC, sans-serif';
  const weight = options.weight || 400;
  const color = options.color || '#111827';
  const maxChars = Math.max(8, Math.floor(width / (fontSize * (options.mono ? 0.62 : 0.95))));
  const rendered = [];
  for (const line of lines) rendered.push(...wrapLine(line, maxChars));
  return `<text x="${x}" y="${y}" fill="${color}" font-size="${fontSize}" font-family="${family}" font-weight="${weight}">${rendered
    .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${esc(line || ' ')}</tspan>`)
    .join('')}</text>`;
}

function componentSvg(component) {
  const layout = LAYOUTS[component.marker];
  const [x, y, width, height] = layout.body;
  const title = textBlock([component.label], x, y + 22, width, {
    fontSize: 24,
    weight: 700,
    color: '#0f172a',
  });
  if (component.kind === 'code') {
    const codeY = y + 62;
    const fontSize = component.code.length > 7 ? 18 : 21;
    return `${title}<rect x="${x - 8}" y="${codeY - 27}" width="${width + 16}" height="${Math.min(
      height - 50,
      component.code.length * Math.round(fontSize * 1.28) + 24,
    )}" rx="7" fill="#f8fafc" opacity="0.82"/><text x="${x}" y="${codeY}" fill="#111827" font-size="${fontSize}" font-family="Menlo, Consolas, monospace">${component.code
      .map(
        (line, index) =>
          `<tspan x="${x}" dy="${index === 0 ? 0 : Math.round(fontSize * 1.28)}">${esc(line || ' ')}</tspan>`,
      )
      .join('')}</text>`;
  }
  const body = textBlock([component.text], x, y + 64, width, { fontSize: height > 200 ? 24 : 22 });
  return `${title}${body}`;
}

function markerSquares(component) {
  const marker = markerFor(component.marker);
  return LAYOUTS[component.marker].marker
    .map(([x, y]) => `<rect x="${x}" y="${y}" width="18" height="18" fill="${marker.hex}"/>`)
    .join('');
}

function slideSvg(page, pageNumber, includeMarkers) {
  const grid = `<defs><pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M 28 0 L 0 0 0 28" fill="none" stroke="#e5e7eb" stroke-width="0.7"/></pattern></defs><rect width="1600" height="900" fill="#ffffff"/><rect width="1600" height="900" fill="url(#grid)" opacity="0.7"/>`;
  const title = `<text x="800" y="82" text-anchor="middle" fill="#111827" font-family="Arial, PingFang SC, sans-serif" font-size="38" font-weight="700">${esc(
    page.title,
  )}</text>`;
  const components = page.components.map((component) => componentSvg(component)).join('');
  const arrows = `<path d="M760 395 C820 390, 805 430, 855 430" fill="none" stroke="#8b6f47" stroke-width="4" stroke-linecap="round" opacity="0.75"/><path d="M760 562 C810 590, 805 616, 850 628" fill="none" stroke="#8b6f47" stroke-width="4" stroke-linecap="round" opacity="0.55"/>`;
  const markers = includeMarkers ? page.components.map((component) => markerSquares(component)).join('') : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">${grid}${title}${arrows}${components}${markers}</svg>`;
}

async function renderPage(pageNumber) {
  const page = PAGES[pageNumber - 1];
  const label = pageLabel(pageNumber);
  ensureDir(path.join(QUEUE_DIR, 'v2-marker-generated'));
  ensureDir(PUBLIC_DIR);
  await sharp(Buffer.from(slideSvg(page, pageNumber, true)))
    .png()
    .toFile(path.join(QUEUE_DIR, 'v2-marker-generated', `page-${label}.png`));
  await sharp(Buffer.from(slideSvg(page, pageNumber, true))).png().toFile(path.join(PUBLIC_DIR, `v2-marker-slide-${label}.png`));
  await sharp(Buffer.from(slideSvg(page, pageNumber, false))).png().toFile(path.join(PUBLIC_DIR, `v2-slide-${label}.png`));
}

async function decodeRaw(filePath) {
  const { data, info } = await sharp(filePath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function componentsForColor(raw, marker) {
  const seen = new Uint8Array(raw.width * raw.height);
  const components = [];
  for (let y = 0; y < raw.height; y += 1) {
    for (let x = 0; x < raw.width; x += 1) {
      const offset = y * raw.width + x;
      if (seen[offset]) continue;
      const i = offset * 3;
      const r = raw.data[i] || 0;
      const g = raw.data[i + 1] || 0;
      const b = raw.data[i + 2] || 0;
      if (!marker.match(r, g, b)) continue;
      const stack = [[x, y]];
      seen[offset] = 1;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let count = 0;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        count += 1;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        for (const [nx, ny] of [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ]) {
          if (nx < 0 || ny < 0 || nx >= raw.width || ny >= raw.height) continue;
          const no = ny * raw.width + nx;
          if (seen[no]) continue;
          const ni = no * 3;
          if (marker.match(raw.data[ni] || 0, raw.data[ni + 1] || 0, raw.data[ni + 2] || 0)) {
            seen[no] = 1;
            stack.push([nx, ny]);
          }
        }
      }
      if (count > 40) components.push({ minX, minY, maxX, maxY, count });
    }
  }
  return components;
}

function bboxForMarker(markerName) {
  const points = LAYOUTS[markerName].marker;
  const xs = points.map(([x]) => x + 9);
  const ys = points.map(([, y]) => y + 9);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function toCanvasBbox([left, top, right, bottom]) {
  return [
    Math.round((left / SOURCE_WIDTH) * CANVAS_WIDTH * 10) / 10,
    Math.round((top / SOURCE_HEIGHT) * CANVAS_HEIGHT * 10) / 10,
    Math.round((right / SOURCE_WIDTH) * CANVAS_WIDTH * 10) / 10,
    Math.round((bottom / SOURCE_HEIGHT) * CANVAS_HEIGHT * 10) / 10,
  ];
}

function markerPoints(markerName) {
  return LAYOUTS[markerName].marker.map(([x, y], index) => ({
    corner: ['top-left', 'top-right', 'bottom-left', 'bottom-right'][index],
    x: Math.round(((x + 9) / SOURCE_WIDTH) * CANVAS_WIDTH * 10) / 10,
    y: Math.round(((y + 9) / SOURCE_HEIGHT) * CANVAS_HEIGHT * 10) / 10,
  }));
}

function buildPrompt(page, pageNumber) {
  return `Use case: scientific-educational
Asset type: 16:9 Chinese hand-drawn code-course notebook slide with recoverable component corner markers

Generate page ${pageNumber} for a CPSC-style Racket notebook. This page is code-first. Use the exact Racket code blocks listed below from the lecture code bank; do not invent, optimize, translate, or rewrite code tokens.

Visible prose should be Simplified Chinese. Racket keywords, literals, strings, and comments from the lecture code bank must remain exactly as provided.
Do not write course code, course name, teacher name, date, page number, or week label on the slide.

Slide title: ${page.title}

Components:
${page.components
  .map((component) => {
    const marker = markerFor(component.marker);
    const codeText = component.kind === 'code' ? `\nExact code:\n${component.code.join('\n')}` : '';
    return `- ${component.label}; marker ${marker.hex}; content: ${component.text || `use code bank snippet ${component.snippetId}`}${codeText}`;
  })
  .join('\n')}

Marker target: exactly 20 isolated square markers, 4 per component, colors #ff0000, #00ff00, #0048ff, #00ffff, #ffff00.`;
}

function buildPromptPlan(page, pageNumber, prompt) {
  const componentPlans = page.components.map((component, index) => {
    const marker = markerFor(component.marker);
    return {
      id: `${NOTEBOOK_ID}-p${pageLabel(pageNumber)}-${marker.name}`,
      label: component.label,
      role: component.kind,
      order: index + 1,
      markerColorName: marker.name,
      markerColorHex: marker.hex,
      visibleText: component.kind === 'code' ? component.code : [component.text],
      sourceSnippetId: component.snippetId || null,
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
    },
    compiledImagePrompt: prompt,
    validationTarget: {
      maskableComponentCount: componentPlans.length,
      totalMarkerCount: componentPlans.length * 4,
      markerCountsByColor: Object.fromEntries(componentPlans.map((component) => [component.markerColorHex, 4])),
    },
    recoveryResult: { status: 'pending' },
  };
}

function preparePrompts() {
  const promptDir = path.join(QUEUE_DIR, 'v2-prompts');
  const planDir = path.join(QUEUE_DIR, 'v2-prompt-plans');
  ensureDir(promptDir);
  ensureDir(planDir);
  writeJson(path.join(QUEUE_DIR, 'code-bank.json'), CODE_BANK);
  for (const [index, page] of PAGES.entries()) {
    const pageNumber = index + 1;
    const label = pageLabel(pageNumber);
    const prompt = buildPrompt(page, pageNumber);
    fs.writeFileSync(path.join(promptDir, `page-${label}.prompt.md`), prompt);
    writeJson(path.join(planDir, `page-${label}.prompt-plan.json`), buildPromptPlan(page, pageNumber, prompt));
  }
  writeJson(path.join(QUEUE_DIR, 'v2-outline.json'), {
    notebookId: NOTEBOOK_ID,
    title: 'Racket 基础：从表达式到条件求值',
    pageCount: PAGES.length,
    sourcePdf: CODE_BANK.sourcePdf,
    pages: PAGES.map((page, index) => ({
      pageNumber: index + 1,
      title: page.title,
      sceneTitle: page.sceneTitle,
      components: page.components.map(({ label, marker, kind, snippetId }) => ({ label, marker, kind, snippetId })),
    })),
  });
  console.log(`[prepare] wrote ${PAGES.length} prompts`);
}

async function recoverPage(pageNumber) {
  const label = pageLabel(pageNumber);
  const markerPublic = path.join(PUBLIC_DIR, `v2-marker-slide-${label}.png`);
  const promptPlanPath = path.join(QUEUE_DIR, 'v2-prompt-plans', `page-${label}.prompt-plan.json`);
  const plan = readJson(promptPlanPath);
  const raw = await decodeRaw(markerPublic);
  const findings = [];
  const recoveredComponents = [];
  for (const component of plan.componentPlans) {
    const marker = markerFor(component.markerColorName);
    const components = componentsForColor(raw, marker);
    if (components.length !== 4) findings.push(`${component.label}: expected 4 ${marker.name} markers, recovered ${components.length}`);
    recoveredComponents.push({
      componentId: component.id,
      markerColorHex: marker.hex,
      bbox: toCanvasBbox(bboxForMarker(marker.name)),
      markerPoints: markerPoints(marker.name),
      markerCount: components.length,
    });
  }
  const recoveryResult = {
    status: findings.length ? 'failed' : 'passed',
    recoveredAt: Date.now(),
    originalMarkerImageUrl: `${PUBLIC_PATH}/v2-marker-slide-${label}.png`,
    cleanImageUrl: `${PUBLIC_PATH}/v2-slide-${label}.png`,
    originalMarkerImageDimensions: { width: raw.width, height: raw.height },
    findings,
    components: recoveredComponents,
  };
  writeJson(promptPlanPath, { ...plan, recoveryResult });
  return recoveryResult;
}

async function renderPages(pageNumbers) {
  preparePrompts();
  const summary = [];
  for (const pageNumber of pageNumbers) {
    await renderPage(pageNumber);
    const recoveryResult = await recoverPage(pageNumber);
    summary.push({ pageNumber, status: recoveryResult.status, findings: recoveryResult.findings });
    console.log(`[render] page-${pageLabel(pageNumber)} ${recoveryResult.status}`);
  }
  writeJson(path.join(QUEUE_DIR, 'v2-marker-recovery-summary.json'), summary);
}

function focusRegionsFromPlan(promptPlan) {
  const recoveredById = new Map((promptPlan.recoveryResult?.components || []).map((component) => [component.componentId, component]));
  return promptPlan.componentPlans.map((component) => {
    const recovered = recoveredById.get(component.id);
    const [left, top, right, bottom] = recovered.bbox;
    return {
      id: component.id,
      label: component.label,
      role: component.role,
      left,
      top,
      width: Math.round((right - left) * 10) / 10,
      height: Math.round((bottom - top) * 10) / 10,
      order: component.order,
    };
  });
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

function canvasFor(pageNumber, focusRegions) {
  return {
    id: `${NOTEBOOK_ID}-v2-canvas-${pageLabel(pageNumber)}`,
    viewportSize: CANVAS_WIDTH,
    viewportRatio: 16 / 9,
    theme: {
      backgroundColor: '#ffffff',
      themeColors: ['#0f766e', '#8b6f47', '#0f172a'],
      fontColor: '#0f172a',
      fontName: 'Inter',
      outline: { color: '#0f766e', width: 2, style: 'solid' },
    },
    elements: [imageElement(pageNumber), ...focusRegions.map(hotspotElement)],
    background: { type: 'solid', color: '#ffffff' },
    type: 'content',
  };
}

function actionsForPage(page, pageNumber, focusRegions) {
  return page.components.flatMap((component, index) => {
    const region = focusRegions[index];
    return [
      {
        id: `${NOTEBOOK_ID}-p${pageLabel(pageNumber)}-spotlight-${index + 1}`,
        type: 'spotlight',
        elementId: region.id,
        title: component.label,
        description: `聚焦“${component.label}”区域。`,
        dimOpacity: 0.76,
      },
      {
        id: `${NOTEBOOK_ID}-p${pageLabel(pageNumber)}-speech-${index + 1}`,
        type: 'speech',
        title: `讲解：${component.label}`,
        text: component.speech,
      },
    ];
  });
}

async function writeNarrationFiles() {
  const outDir = path.join(QUEUE_DIR, 'v2-narration');
  ensureDir(outDir);
  for (const [index, page] of PAGES.entries()) {
    const pageNumber = index + 1;
    const label = pageLabel(pageNumber);
    const promptPlan = readJson(path.join(QUEUE_DIR, 'v2-prompt-plans', `page-${label}.prompt-plan.json`));
    const focusRegions = focusRegionsFromPlan(promptPlan);
    writeJson(path.join(outDir, `page-${label}.actions.json`), {
      notebookId: NOTEBOOK_ID,
      pageNumber,
      sceneTitle: page.sceneTitle,
      actions: actionsForPage(page, pageNumber, focusRegions),
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
    const labelSvg = `<svg width="${thumbWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="${thumbWidth}" height="${labelHeight}" fill="#0f172a"/><text x="12" y="21" fill="#ffffff" font-size="15" font-family="Arial">${pageNumber}. ${esc(PAGES[pageNumber - 1].sceneTitle)}</text></svg>`;
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
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
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
      const promptPlan = readJson(path.join(QUEUE_DIR, 'v2-prompt-plans', `page-${label}.prompt-plan.json`));
      const focusRegions = focusRegionsFromPlan(promptPlan);
      if (promptPlan.recoveryResult?.status !== 'passed') throw new Error(`Page ${pageNumber} recovery is not passed`);
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
            source: 'deterministic-code-corner-marker-recovery-v2',
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
          sourceCodeBank: CODE_BANK,
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
          name: 'Racket 基础：从表达式到条件求值',
          description: 'CPSC107 第一本文字代码笔记本：Racket 前缀表达式、primitive operators、求值规则、Boolean、String、Image、函数、全局常量、if 与 cond。',
          tags: ['CPSC107', 'Racket', '代码课', '求值规则', '中文笔记', '四角marker'],
          avatarUrl: '/avatars/notebook-agents/avatar8.avif',
          language: 'zh-CN',
          style: 'code-marker-recovered-v2',
          updatedAt: now,
        },
        create: {
          id: NOTEBOOK_ID,
          ownerId: course.ownerId,
          courseId: course.id,
          name: 'Racket 基础：从表达式到条件求值',
          description: 'CPSC107 第一本文字代码笔记本：Racket 前缀表达式、primitive operators、求值规则、Boolean、String、Image、函数、全局常量、if 与 cond。',
          tags: ['CPSC107', 'Racket', '代码课', '求值规则', '中文笔记', '四角marker'],
          avatarUrl: '/avatars/notebook-agents/avatar8.avif',
          language: 'zh-CN',
          style: 'code-marker-recovered-v2',
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
  node scripts/notebooks/${SCRIPT_NAME} --render [--page <n>]
  node scripts/notebooks/${SCRIPT_NAME} --write-narration
  node scripts/notebooks/${SCRIPT_NAME} --contact-sheet
  node scripts/notebooks/${SCRIPT_NAME} --seed-db`);
}

async function main() {
  if (process.argv.includes('--prepare-prompts')) return preparePrompts();
  if (process.argv.includes('--render')) return renderPages(pageNumbersFromArgs());
  if (process.argv.includes('--write-narration')) return writeNarrationFiles();
  if (process.argv.includes('--contact-sheet')) return renderContactSheet();
  if (process.argv.includes('--seed-db')) return seedDb();
  usage();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
