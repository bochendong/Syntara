#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { generatedNotebookDir, generatedNotebookPublicPath } from '../shared/paths.mjs';

const NOTEBOOK_ID = 'nb-cpsc107-racket-basics-week1-20260519024537';
const COURSE_ID = 'cmpc9dqgv000p8ogmrsjl5co8';
const OUTPUT_DIR = generatedNotebookDir(NOTEBOOK_ID);
const PUBLIC_DIR = generatedNotebookPublicPath(NOTEBOOK_ID);
const NOW = new Date();
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;
const SOURCE_WIDTH = 1600;
const SOURCE_HEIGHT = 900;
const HOTSPOT_PATH = 'M 0 0 L 200 0 L 200 200 L 0 200 Z';

const themeColors = {
  ink: '#0f172a',
  teal: '#0f766e',
  blue: '#2563eb',
  orange: '#f97316',
};

const slides = [
  {
    title: 'CPSC 107 · Racket 基础',
    steps: [],
  },
  {
    title: 'Racket 怎么读：一切都是表达式',
    steps: [
      {
        id: 'expression-flow',
        label: 'Expression 到 Value',
        rect: [65, 170, 1470, 290],
        speech:
          '先建立 Racket 的基本读法：我们写下的是 expression，Racket 会按照求值规则 evaluation，把它变成一个 value。后面所有知识都在这条线上。',
      },
      {
        id: 'prefix-notation',
        label: '前缀表达式',
        rect: [390, 475, 820, 190],
        speech:
          'Racket 的括号不是数学里的装饰括号。每个 list 的第一个位置是 operator，后面的表达式是 operands。所以加法写成加号在前面，而不是夹在两个数中间。',
      },
      {
        id: 'reading-question',
        label: '读代码的第一问',
        rect: [110, 690, 1380, 150],
        speech:
          '读 Racket 代码时，第一问永远是：这个 list 的第一个东西是谁？它决定这整个表达式怎么被解释。',
      },
    ],
  },
  {
    title: 'Primitive Operators：语言已经给你的积木',
    steps: [
      {
        id: 'notation-table',
        label: '熟悉写法转 Racket',
        rect: [65, 170, 1120, 365],
        speech:
          '这页把数学里熟悉的写法翻成 DrRacket 写法。核心变化是 operator 放在最前面，后面的每一项都作为 operand 放进同一组括号里。',
      },
      {
        id: 'operator-rule',
        label: 'Operator 和 Operands',
        rect: [1250, 190, 305, 325],
        speech:
          '右边这句话非常重要：第一个位置是 operator，后面的都是 operands。只要能抓住这个结构，复杂表达式也不会乱。',
      },
      {
        id: 'built-in-cards',
        label: 'Built-in Functions',
        rect: [45, 580, 1510, 250],
        speech:
          'sqr、sqrt、quotient、remainder 这些是语言已经提供好的 primitive operators，也可以叫 built-in functions。我们先学会调用它们，再学会自己定义函数。',
      },
    ],
  },
  {
    title: '求值规则：从左到右，从里到外',
    steps: [
      {
        id: 'problem',
        label: '原表达式',
        rect: [250, 145, 790, 130],
        speech:
          '现在来看怎么一步一步算。这个表达式最外层是加法，但两个 operand 本身还没有变成 value，所以不能马上加。',
      },
      {
        id: 'evaluation-ladder',
        label: '逐步求值',
        rect: [80, 305, 650, 440],
        speech:
          '按照最左边、最里面的规则，先算左边的乘法得到三十六，再算右边的减法得到负二，最后把三十六和负二相加得到三十四。',
      },
      {
        id: 'nested-visual',
        label: '嵌套结构',
        rect: [875, 310, 520, 440],
        speech:
          '右边的图把嵌套关系画出来。外层加法要等里面两个 operand 都变成 value，才真正执行自己的 operator。',
      },
      {
        id: 'one-step-rule',
        label: '每步只做一件事',
        rect: [105, 765, 1395, 95],
        speech:
          '写考试步骤时不要跳太快。每一步只做一个最左边、最里面能算的表达式，这样逻辑最清楚。',
      },
    ],
  },
  {
    title: 'Boolean：true / false 是一种值',
    steps: [
      {
        id: 'and-panel',
        label: 'and 规则',
        rect: [35, 180, 480, 520],
        speech:
          'Boolean 也是一种 value。先看 and：只有所有部分都是 true，结果才是 true；只要有一个 false，最后就是 false。',
      },
      {
        id: 'or-panel',
        label: 'or 规则',
        rect: [550, 180, 500, 520],
        speech:
          'or 的规则相反一点：只要有一个 true，结果就是 true。只有全部都是 false，它才会得到 false。',
      },
      {
        id: 'not-panel',
        label: 'not 规则',
        rect: [1085, 180, 480, 520],
        speech:
          'not 最简单，就是把 true 和 false 反过来。注意在 Racket 里它们是小写 true 和 false。',
      },
      {
        id: 'combined-example',
        label: '组合例子',
        rect: [80, 730, 1435, 115],
        speech:
          '组合起来看，先算里面的 or true false，得到 true；再看 and true false，所以整体是 false。',
      },
    ],
  },
  {
    title: '短路求值：能决定结果，就不往后算',
    steps: [
      {
        id: 'and-short-circuit',
        label: 'AND 短路',
        rect: [35, 155, 735, 500],
        speech:
          '短路求值是期中非常常考的点。AND 只要第一个 operand 已经是 false，后面再怎么算都不可能把整体变成 true，所以 Racket 直接停止。',
      },
      {
        id: 'or-short-circuit',
        label: 'OR 短路',
        rect: [805, 155, 755, 500],
        speech:
          'OR 正好反过来。只要第一个 operand 已经是 true，整体已经确定为 true，后面的 expression 不会被计算。',
      },
      {
        id: 'mini-example',
        label: '小例子',
        rect: [40, 675, 1515, 180],
        speech:
          '下面的小例子把规则放在一起。先算中间的 or 得到 true，最后 and 看到末尾的 false，整体变成 false。',
      },
    ],
  },
  {
    title: '例题：一步一步算 Boolean',
    steps: [
      {
        id: 'problem',
        label: '题目',
        rect: [95, 155, 1355, 105],
        speech:
          '这道题练的是混合比较和 Boolean 连接词。先不要看着一整行害怕，把每个比较表达式先变成 true 或 false。',
      },
      {
        id: 'evaluation-ladder',
        label: '求值步骤',
        rect: [70, 285, 1010, 450],
        speech:
          '步骤里先把小于号和大于号这些 comparison 算出来，再用 or 和 and 的规则收掉。遇到 or 的第一个 true 时，可以直接短路成 true。',
      },
      {
        id: 'short-circuit-callout',
        label: '关键短路',
        rect: [1150, 350, 360, 330],
        speech:
          '右边这个框就是关键：or true 后面的等于一三不需要再算。考试时如果能说明这里短路，步骤会更漂亮。',
      },
      {
        id: 'exam-note',
        label: '考试写法',
        rect: [105, 735, 1295, 125],
        speech:
          '总结成一句话：先把 comparison 算成 true 或 false，再用 and 和 or 的规则收掉。不要把两个层次混在一起。',
      },
    ],
  },
  {
    title: 'String：双引号里的数据',
    steps: [
      {
        id: 'string-vs-number',
        label: 'String 和 Number',
        rect: [40, 205, 660, 485],
        speech:
          '双引号里的东西是 string。注意，一二三加引号和不加引号不是同一种数据：前者是文字，后者是数字。',
      },
      {
        id: 'string-functions',
        label: '常用 String 函数',
        rect: [760, 155, 800, 590],
        speech:
          '右边是常见 string 操作：append 连接字符串，length 算长度，substring 切片，string=? 比较两个字符串是否相等。',
      },
      {
        id: 'substring-rule',
        label: 'Substring 规则',
        rect: [90, 760, 1400, 95],
        speech: 'substring 的规则是前取后不取。零到一只拿 index 零的位置，所以结果是一这个字符串。',
      },
    ],
  },
  {
    title: 'Image：代码也可以画图',
    steps: [
      {
        id: 'require-image',
        label: '先 require',
        rect: [80, 165, 560, 160],
        speech:
          '如果要在 Racket 里画图，先要 require 二 htdp image。没有这行，circle、rectangle 这些 image 函数就用不了。',
      },
      {
        id: 'basic-shapes',
        label: '基础图形',
        rect: [740, 155, 780, 350],
        speech:
          'circle、rectangle、text 都会产生 image。尤其是 text，这里画出来的是一张图片，不是 string 本身。',
      },
      {
        id: 'image-composition',
        label: '组合图片',
        rect: [30, 520, 1510, 215],
        speech:
          'above、beside、overlay 是组合 image 的工具。它们不只是画单个东西，而是把多个 image 按规则拼起来。',
      },
      {
        id: 'text-is-image',
        label: 'Text 的类型',
        rect: [185, 765, 1195, 95],
        speech: '最后再提醒一次：text 函数输出的是 image，不是 string。这个类型意识后面会很重要。',
      },
    ],
  },
  {
    title: 'Primitive Data：程序里的原子材料',
    steps: [
      {
        id: 'four-types',
        label: '四种基础数据',
        rect: [115, 150, 1290, 550],
        speech:
          '这一页把今天见到的四种 primitive data 放在一起：number、Boolean、string、image。它们是之后更复杂数据的原子材料。',
      },
      {
        id: 'why-types',
        label: '为什么需要类型',
        rect: [70, 710, 1070, 140],
        speech:
          '为什么需要类型？因为同样的符号，在不同类型里意义不同。Racket 需要知道一个东西是数字、文字、真假值，还是图片。',
      },
      {
        id: 'string-number-warning',
        label: 'String 和 Number 不能混',
        rect: [1170, 715, 360, 125],
        speech:
          '右下角这个例子很典型：引号里的一二三和数字一二三不是同一种东西。把它们混起来，是初学者最常见的错误。',
      },
    ],
  },
  {
    title: 'Function：把一段逻辑命名，重复使用',
    steps: [
      {
        id: 'analogy',
        label: '函数的意义',
        rect: [40, 185, 355, 500],
        speech:
          '函数就是把一段计算逻辑命名，让它以后可以重复使用。数学里 f of x 是一个规则，程序里的 function 也是一个规则。',
      },
      {
        id: 'syntax-template',
        label: '函数定义结构',
        rect: [415, 185, 710, 510],
        speech:
          'Racket 函数定义的结构是 define 后面跟函数名和参数，再下面写函数逻辑。函数名决定以后怎么调用，参数代表输入。',
      },
      {
        id: 'square-example',
        label: '简单例子',
        rect: [1145, 205, 405, 470],
        speech:
          '右边的 square 函数还没有调用时不会自动算。只有写 square 五的时候，Racket 才把五带进去，得到二十五。',
      },
      {
        id: 'call-note',
        label: '调用才计算',
        rect: [55, 720, 1420, 120],
        speech: '这页最重要的一句是：函数不是马上算，调用它的时候才把输入带进去算。',
      },
    ],
  },
  {
    title: '例题：把数学函数翻成 Racket',
    steps: [
      {
        id: 'problem',
        label: '题目',
        rect: [75, 160, 1160, 120],
        speech:
          '现在把数学函数翻成 Racket。题目要求把 f x y 等于 x 平方加 y 平方，写成一个可以调用的程序函数。',
      },
      {
        id: 'math-idea',
        label: '数学想法',
        rect: [45, 310, 430, 420],
        speech:
          '左边先保留数学想法：输入 x 和 y，分别平方，然后把两个结果加起来。写代码之前先把数据流想清楚。',
      },
      {
        id: 'racket-code',
        label: 'Racket 写法',
        rect: [530, 310, 490, 420],
        speech:
          '中间是 Racket 写法。函数名是 f，参数是 x 和 y，body 里用加号把两个 sqr 的结果相加。',
      },
      {
        id: 'call-evaluation',
        label: '调用并求值',
        rect: [1070, 305, 460, 430],
        speech: '右边用 f 三四来测试。三和四替换参数以后，得到九加十六，所以输出二十五。',
      },
      {
        id: 'parameter-insight',
        label: '参数是占位符',
        rect: [80, 755, 1400, 105],
        speech: '参数只是占位符；调用时实际输入会替换进去。这个观念就是后面函数求值的核心。',
      },
    ],
  },
  {
    title: '函数调用求值：先算参数，再展开函数',
    steps: [
      {
        id: 'definitions',
        label: '函数定义',
        rect: [80, 120, 805, 140],
        speech:
          '这里先定义两个函数：f 做平方，g 做减法。定义本身只是把名字放进环境里，还没有开始计算。',
      },
      {
        id: 'evaluation-ladder',
        label: '逐步求值',
        rect: [105, 280, 610, 460],
        speech:
          '调用 g 的时候，先把两个参数都算成 value。左边参数 f 二得到四，右边参数 g 三一得到二，最后才展开外层 g。',
      },
      {
        id: 'call-tree',
        label: '调用结构',
        rect: [755, 285, 790, 430],
        speech:
          '右边的树状图帮助我们看结构：外层 g 有两个参数，两个参数都要先变成 value，外层函数才真正执行。',
      },
      {
        id: 'rule',
        label: '规则没有变',
        rect: [95, 755, 1410, 105],
        speech:
          '规则其实没有变：最左边、最里面，先变成 value。只是现在 expression 里多了自己定义的函数。',
      },
    ],
  },
  {
    title: '练习：term 的逐步化简',
    steps: [
      {
        id: 'definition-and-problem',
        label: '定义和题目',
        rect: [75, 145, 880, 215],
        speech:
          '这道练习用 term 函数。函数 body 是 x 乘以 y 的平方，题目给的两个参数本身又是表达式，所以先算参数。',
      },
      {
        id: 'evaluation-ladder',
        label: '逐步化简',
        rect: [75, 390, 570, 350],
        speech: '先把负五三算成二，再把加一二算成三。参数都是 value 以后，才展开 term 的 body。',
      },
      {
        id: 'parameter-map',
        label: '参数对应关系',
        rect: [1010, 175, 390, 560],
        speech: '右边把参数对应关系画出来：x 对应二，y 对应三。把它们填进 body，就是二乘三的平方。',
      },
      {
        id: 'body-rule',
        label: '填进函数 body',
        rect: [120, 760, 1325, 95],
        speech: '所以函数题的稳定流程是：先把参数变成 value，再把 value 填进函数 body。',
      },
    ],
  },
  {
    title: 'Global Constants：全局可用的名字',
    steps: [
      {
        id: 'idea',
        label: '定义想法',
        rect: [25, 180, 410, 490],
        speech:
          'Global constant 是整个程序都可以访问的名字。CPSC 一般会把这种共享常数写成大写，让它在代码里一眼就能被看出来。',
      },
      {
        id: 'code',
        label: '代码结构',
        rect: [455, 180, 675, 490],
        speech:
          '中间的代码把折扣和税率写成两个全局常数。函数里直接使用这两个名字，而不是把零点二和零点一三到处复制。',
      },
      {
        id: 'evaluation',
        label: '调用与求值',
        rect: [1145, 195, 395, 465],
        speech:
          '调用 cal-final-price 二百时，total-price 变成二百，DISCOUNT 和 TAX-RATE 也会被替换成它们对应的值。',
      },
      {
        id: 'benefit',
        label: '为什么要用',
        rect: [85, 720, 1410, 120],
        speech: '使用全局常数的好处是共享的数值只写一次。以后改折扣，不用到处找，也减少出错机会。',
      },
    ],
  },
  {
    title: 'if：只选择一个分支执行',
    steps: [
      {
        id: 'syntax',
        label: 'if 结构',
        rect: [80, 170, 590, 225],
        speech:
          'if 有三个部分：问题表达式、true-answer、false-answer。它不是三个都算，而是先看问题的结果。',
      },
      {
        id: 'flowchart',
        label: '分支选择',
        rect: [720, 135, 715, 335],
        speech:
          '如果 question-expression 得到 true，整个 if 变成 true-answer；如果得到 false，整个 if 变成 false-answer。只走一条路。',
      },
      {
        id: 'tall-wide-example',
        label: 'Tall / Wide 例子',
        rect: [50, 500, 975, 340],
        speech:
          '例子里 IMAGE-HEIGHT 是十，IMAGE-WIDTH 是五，所以大于号表达式为 true。整个 if 直接替换成 Tall 这个字符串。',
      },
      {
        id: 'branch-rule',
        label: '只算一个分支',
        rect: [1060, 515, 425, 325],
        speech:
          '右边这句是重点：if 只选择一个分支执行。不要把 true-answer 和 false-answer 都拿去算。',
      },
    ],
  },
  {
    title: 'cond：多个条件，从上往下试',
    steps: [
      {
        id: 'syntax',
        label: 'cond 结构',
        rect: [65, 165, 825, 220],
        speech:
          'cond 是多个条件版本的 if。每一行都有一个 question-expression 和一个 answer-expression，最后可以用 else 兜底。',
      },
      {
        id: 'example',
        label: '例题',
        rect: [955, 165, 395, 210],
        speech: '右上的例子先问二是否大于三，再问四是否小于二。如果两个问题都不成立，就走 else。',
      },
      {
        id: 'evaluation',
        label: '逐步求值',
        rect: [55, 410, 995, 330],
        speech:
          '求值时从上往下检查。第一行是 false，跳过；第二行也是 false，继续跳过；最后 else 被选中，所以结果是 g。',
      },
      {
        id: 'traffic-light',
        label: '从上到下检查',
        rect: [1095, 410, 455, 330],
        speech:
          '右边的红绿灯图就是 cond 的节奏：一路往下，遇到第一个 true 就停，后面的分支不再看。',
      },
      {
        id: 'rule',
        label: 'cond 规则',
        rect: [50, 780, 1500, 85],
        speech: '一句话总结：cond 从上到下检查，第一个 true 的 answer 留下，后面不看。',
      },
    ],
  },
  {
    title: 'Racket 基础总结',
    steps: [
      {
        id: 'four-actions',
        label: '四个核心动作',
        rect: [25, 150, 1530, 390],
        speech:
          'Racket 基础可以收束成四个动作：读表达式、算成 value、区分类型、组织程序。重点不是背很多函数，而是把这四个动作练熟。',
      },
      {
        id: 'common-errors',
        label: '常见错误',
        rect: [45, 565, 690, 300],
        speech:
          '常见错误也很固定：把字符串当数字，忘记短路，函数参数还没算完就展开，以及 if 和 cond 两个分支都去算。',
      },
      {
        id: 'next-hook',
        label: '下节课钩子',
        rect: [770, 570, 720, 300],
        speech:
          '下节课进入 Design Recipe。目标不只是写能跑的代码，而是系统地设计程序：先想数据、签名、例子，再写函数。',
      },
    ],
  },
];

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

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
      themeColors: [themeColors.teal, themeColors.blue, themeColors.orange, themeColors.ink],
      fontColor: themeColors.ink,
      fontName: 'Inter',
      outline: { color: themeColors.teal, width: 2, style: 'solid' },
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

async function renderMetadataAssets() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const [index] of slides.entries()) {
    const fileName = `slide-${String(index + 1).padStart(2, '0')}.png`;
    if (!fs.existsSync(path.join(OUTPUT_DIR, fileName))) {
      throw new Error(`Missing imagegen slide asset: ${path.join(OUTPUT_DIR, fileName)}`);
    }
  }

  const hitMap = {
    notebookId: NOTEBOOK_ID,
    source: 'imagegen-full-slide-cpsc107-racket-basics-from-01-pdf',
    sourcePdf: '/Users/dongpochen/Desktop/2026 Summer/CPSC 107/01_Rackert_基础/01_Rackert_基础.pdf',
    slides: slides.map((slide, index) => ({
      order: index,
      title: slide.title,
      image: `${PUBLIC_DIR}/slide-${String(index + 1).padStart(2, '0')}.png`,
      hitMap: semanticHitMapFor(index),
    })),
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'semantic-hit-map.json'), JSON.stringify(hitMap, null, 2));

  const thumbWidth = 400;
  const thumbHeight = 225;
  const labelHeight = 42;
  const columns = 3;
  const composites = [];
  for (const [index, slide] of slides.entries()) {
    const file = path.join(OUTPUT_DIR, `slide-${String(index + 1).padStart(2, '0')}.png`);
    const labelSvg = `<svg width="${thumbWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="${thumbWidth}" height="${labelHeight}" fill="#0f172a"/><text x="16" y="28" fill="#ffffff" font-size="18" font-family="Arial">${index + 1}. ${esc(slide.title)}</text></svg>`;
    const thumb = await sharp(file)
      .resize(thumbWidth, thumbHeight)
      .extend({ top: 0, bottom: labelHeight, left: 0, right: 0, background: '#ffffff' })
      .composite([{ input: Buffer.from(labelSvg), top: thumbHeight, left: 0 }])
      .png()
      .toBuffer();
    composites.push({
      input: thumb,
      left: (index % columns) * thumbWidth,
      top: Math.floor(index / columns) * (thumbHeight + labelHeight),
    });
  }

  await sharp({
    create: {
      width: columns * thumbWidth,
      height: Math.ceil(slides.length / columns) * (thumbHeight + labelHeight),
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
        name: 'Racket 基础 · Systematic Program Design',
        description:
          'CPSC 107 notebook in image-generated full-slide format. Covers Racket expression reading, primitive operators, evaluation rules, Boolean short-circuiting, strings, images, primitive data, function definitions, function-call evaluation, globals, if, cond, and a Design Recipe hook.',
        tags: [
          'CPSC107',
          'Racket',
          'Systematic Program Design',
          'Primitive Data',
          'Functions',
          'semantic-hit-map',
        ],
        avatarUrl: '/avatars/notebook-agents/avatar8.avif',
        language: 'zh-CN',
        style: 'imagegen-full-slide-semantic-hit-map',
        updatedAt: NOW,
      },
      create: {
        id: NOTEBOOK_ID,
        ownerId: course.ownerId,
        courseId: course.id,
        name: 'Racket 基础 · Systematic Program Design',
        description:
          'CPSC 107 notebook in image-generated full-slide format. Covers Racket expression reading, primitive operators, evaluation rules, Boolean short-circuiting, strings, images, primitive data, function definitions, function-call evaluation, globals, if, cond, and a Design Recipe hook.',
        tags: [
          'CPSC107',
          'Racket',
          'Systematic Program Design',
          'Primitive Data',
          'Functions',
          'semantic-hit-map',
        ],
        avatarUrl: '/avatars/notebook-agents/avatar8.avif',
        language: 'zh-CN',
        style: 'imagegen-full-slide-semantic-hit-map',
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

await renderMetadataAssets();
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
