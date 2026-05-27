#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { generatedNotebookDir, generatedNotebookPublicPath } from '../shared/paths.mjs';

const NOTEBOOK_ID = 'nb-cpsc107-htdf-htdd-week2-20260519043417';
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
    title: 'CPSC 107 · HTDF + HTDD',
    steps: [],
  },
  {
    title: 'HTDF：一个函数的设计蓝图',
    steps: [
      {
        id: 'seven-step-map',
        label: 'HTDF 七步蓝图',
        rect: [55, 155, 1490, 525],
        speech:
          '这一页先把 HTDF 当成一张函数蓝图来看。我们不是直接冲进 body，而是按顺序写名字、类型、目的、例子、stub、template，最后才写真正逻辑。',
      },
      {
        id: 'design-before-body',
        label: '先设计，再写 body',
        rect: [105, 705, 1390, 140],
        speech:
          '下面这句话是今天的主线：先设计，再写 body。这样做不是为了多写格式，而是为了让函数在开始实现前已经有清楚的目标和检查方式。',
      },
    ],
  },
  {
    title: '例题规划：圆面积函数先不急着写 body',
    steps: [
      {
        id: 'problem',
        label: '题目',
        rect: [315, 105, 835, 95],
        speech:
          '例题是圆面积。先不要急着写乘法，我们先问：这个函数叫什么，输入是什么，输出是什么，学生和读代码的人应该期待什么。',
      },
      {
        id: 'htdf-worksheet',
        label: 'HTDF 规划表',
        rect: [130, 190, 1095, 560],
        speech:
          '表格左边就是 HTDF 的顺序。函数名是 circle-area，签名是 Number 到 Number，例子先写两个：半径零得到零，半径一得到三点一四。',
      },
      {
        id: 'circle-formula',
        label: '圆面积公式',
        rect: [1245, 210, 280, 470],
        speech:
          '右边只是数学背景：面积是 pi r squared。我们在程序里用三点一四近似 pi，所以 body idea 是三点一四乘 r 乘 r。',
      },
      {
        id: 'planning-note',
        label: '规划的价值',
        rect: [125, 765, 1320, 105],
        speech:
          '这一步的价值是把思路固定下来。名字、类型和例子都说清楚以后，body 只是把已经明确的计算翻成 Racket。',
      },
    ],
  },
  {
    title: '例题代码：circle-area 的完整 HTDF',
    steps: [
      {
        id: 'design-record',
        label: '完整设计记录',
        rect: [45, 150, 745, 550],
        speech:
          '左边是完整的设计记录。注意 check-expect 在真正 define 之前就已经出现了，这意味着我们先决定什么叫做正确。',
      },
      {
        id: 'final-body',
        label: '最终函数体',
        rect: [910, 215, 630, 310],
        speech:
          '右边才是最终 body。Racket 的乘法是前缀形式，所以三点一四乘 r 乘 r 写成星号在前面，里面再算 r 乘 r。',
      },
      {
        id: 'test-flow',
        label: '调用测试',
        rect: [815, 595, 760, 115],
        speech:
          '下面用半径二做一次代入：circle-area 二会变成三点一四乘二乘二，结果是十二点五六。这个流程和 check-expect 要对应。',
      },
      {
        id: 'examples-first',
        label: 'Examples 先写',
        rect: [60, 750, 1490, 115],
        speech:
          '所以这一页的核心不是公式，而是顺序：examples 先写，body 后写，最后用例子检查 body 是否符合预期。',
      },
    ],
  },
  {
    title: '为什么要用 HTDF？',
    steps: [
      {
        id: 'messy-code',
        label: '直接写 body 的问题',
        rect: [30, 155, 500, 520],
        speech:
          '左边是没有设计记录的代码。它可能能跑，但读者很难立刻知道这个函数的输入、输出和业务含义。',
      },
      {
        id: 'next-color-cycle',
        label: 'next-color 的含义',
        rect: [545, 225, 330, 360],
        speech:
          '中间的图把 next-color 的规则讲清楚：零变二，一变零，二变一。图和例子一起出现，规则就不再藏在 body 里。',
      },
      {
        id: 'design-record',
        label: 'HTDF 记录',
        rect: [900, 145, 650, 525],
        speech:
          '右边的 HTDF 记录把类型和例子摆出来。即使还没看完整实现，也能知道这是一个 Natural 到 Natural 的转换函数。',
      },
      {
        id: 'readability-insight',
        label: '可读性提升',
        rect: [70, 720, 1450, 120],
        speech: 'HTDF 最直接的好处是可读性。它告诉读者这个函数吃什么、吐什么、为什么存在。',
      },
    ],
  },
  {
    title: '三件事先写：Purpose / Signature / Examples',
    steps: [
      {
        id: 'purpose-card',
        label: 'Purpose',
        rect: [45, 190, 470, 480],
        speech:
          'Purpose 是一句话说明。它不应该只重复函数名，而要说清楚 consume 什么、produce 什么。',
      },
      {
        id: 'signature-card',
        label: 'Signature',
        rect: [555, 190, 480, 480],
        speech:
          'Signature 是类型契约。Number 到 Number、String 到 Boolean 这种写法，帮我们在写 body 前先检查输入和输出的形状。',
      },
      {
        id: 'examples-card',
        label: 'Examples',
        rect: [1080, 190, 455, 480],
        speech: 'Examples 用 check-expect 表达具体预期。左边是函数调用，右边是我们希望得到的结果。',
      },
      {
        id: 'three-first',
        label: '三件事说不清就先停',
        rect: [120, 735, 1360, 115],
        speech:
          '如果这三件事说不清，body 通常也会写偏。遇到卡住时，先回到 purpose、signature 和 examples。',
      },
    ],
  },
  {
    title: 'Stub / Template / Body：从空壳到真正逻辑',
    steps: [
      {
        id: 'stub',
        label: 'Stub 空壳',
        rect: [30, 190, 470, 495],
        speech:
          'Stub 是一个能返回正确类型的空壳。输出是 Number 就先返回零，输出是 Boolean 就先返回 false。',
      },
      {
        id: 'template',
        label: 'Template 模板',
        rect: [565, 190, 475, 495],
        speech:
          'Template 不是凭感觉写的，它由数据类型决定。Number 这种 atomic non-distinct 数据，模板会直接把变量放进 body。',
      },
      {
        id: 'body',
        label: 'Body 函数体',
        rect: [1100, 190, 470, 495],
        speech:
          '最后才写 body，也就是把模板里的点点点换成真正计算。对于 circle-area，就是三点一四乘 r 乘 r。',
      },
      {
        id: 'order-insight',
        label: '思考顺序',
        rect: [75, 730, 1450, 125],
        speech:
          '这一页把 HTDF 的后半段串起来：先有可运行的空壳，再有由数据决定的模板，最后补上具体逻辑。',
      },
    ],
  },
  {
    title: 'HTDD：先设计数据，再设计函数',
    steps: [
      {
        id: 'bridge',
        label: '现实概念到 Racket data',
        rect: [145, 135, 1310, 235],
        speech:
          '从 HTDF 转到 HTDD：我们先把现实概念变成 Racket 里的数据定义。城市名这个概念，可以被命名为 CityName。',
      },
      {
        id: 'htdd-checklist',
        label: 'HTDD 四个部分',
        rect: [80, 410, 990, 280],
        speech:
          'HTDD 也有固定结构：data name、interpretation、examples 或 constants、template rule。它是在给数据写说明书。',
      },
      {
        id: 'cityname-code',
        label: 'CityName 例子',
        rect: [1085, 390, 430, 310],
        speech:
          '右边是 CityName 的小例子。底层仍然是 String，但类型名提醒读者：这里的 string 代表城市名。',
      },
      {
        id: 'data-manual',
        label: '数据也需要说明书',
        rect: [115, 740, 1375, 115],
        speech:
          'HTDD 的目标就是让数据本身也清楚。函数的 template 往往会直接从这个数据说明书里长出来。',
      },
    ],
  },
  {
    title: 'Atomic Data：Non-Distinct vs Distinct',
    steps: [
      {
        id: 'non-distinct',
        label: 'Atomic Non-Distinct',
        rect: [30, 150, 760, 535],
        speech:
          'Atomic non-distinct 指很多可能值，比如 Number、String、Boolean、Image，或者一到三十二这样的 interval。模板通常直接使用变量。',
      },
      {
        id: 'distinct',
        label: 'Atomic Distinct',
        rect: [810, 150, 760, 535],
        speech:
          'Atomic distinct 指一个固定值，比如精确的字符串 red、false、empty。它本身已经是一个具体 case。',
      },
      {
        id: 'confusion-warning',
        label: '常见混淆',
        rect: [75, 725, 1450, 115],
        speech:
          '最容易混的是 String 和某个具体字符串。String 是很多可能值；精确的 red 只是一个固定值，所以它是 distinct。',
      },
    ],
  },
  {
    title: '为什么不用 String，而要叫 CityName？',
    steps: [
      {
        id: 'generic-string',
        label: '太泛的 String',
        rect: [45, 160, 630, 520],
        speech:
          '左边的 signature 只有 String 到 Boolean。它能运行，但读者不知道这个 string 是城市、密码、文件名还是别的东西。',
      },
      {
        id: 'cityname-type',
        label: '更清楚的 CityName',
        rect: [840, 145, 700, 540],
        speech:
          '右边加了 CityName。底层还是 String，但意义被写进了类型名，best-city? 的输入也就更具体。',
      },
      {
        id: 'semantic-type-name',
        label: '类型名表达语义',
        rect: [110, 725, 1360, 120],
        speech: '自定义类型名的价值是表达语义。代码不是只给机器看，也给下一个读代码的人看。',
      },
    ],
  },
  {
    title: 'HTDD Template Rules：数据形状决定函数形状',
    steps: [
      {
        id: 'rules-table',
        label: 'Template rules 表',
        rect: [40, 145, 1520, 575],
        speech:
          '这张表是 HTDD 的核心。数据形状决定函数形状：atomic 直接使用变量，one-of 要 cond，compound 要 selectors。',
      },
      {
        id: 'rule-insight',
        label: '不要凭感觉写 template',
        rect: [90, 740, 1410, 115],
        speech:
          '写 template 时不要凭感觉。回到数据定义，看它对应的是 atomic-non-distinct、atomic-distinct、one-of 还是 compound。',
      },
    ],
  },
  {
    title: 'Interval：SeatNumber 是 1 到 32',
    steps: [
      {
        id: 'seat-interval',
        label: '座位区间',
        rect: [155, 115, 1290, 185],
        speech: 'SeatNumber 是从一到三十二的整数。它不是任意整数，但在这个范围里仍然有很多可能值。',
      },
      {
        id: 'data-definition',
        label: 'SeatNumber 定义',
        rect: [80, 345, 560, 300],
        speech:
          '左下角把数据定义写出来，并给出 START、MID、END 三个代表性常量。常量让例子和测试更容易读。',
      },
      {
        id: 'interval-template',
        label: 'Interval 模板',
        rect: [1020, 335, 500, 300],
        speech:
          '右边的 template rule 是 atomic-non-distinct。所以模板直接把变量 sn 放进 body，等待后续函数去使用它。',
      },
      {
        id: 'interval-summary',
        label: 'Interval 小结',
        rect: [120, 735, 1360, 120],
        speech:
          '因此 interval 的重点是：范围有限，但仍然当作很多可能值处理。模板通常是直接使用这个变量。',
      },
    ],
  },
  {
    title: 'One-of：一个数据类型有几种可能形状',
    steps: [
      {
        id: 'enumeration',
        label: 'Enumeration',
        rect: [35, 155, 520, 520],
        speech: 'Enumeration 是 one-of 的一种常见情况：每个 case 都是固定值，比如 A、B、C。',
      },
      {
        id: 'branching-data',
        label: 'one-of 分支',
        rect: [595, 185, 300, 420],
        speech:
          '中间的图提醒我们：one-of 表示一个数据类型有几种可能形状，但具体某个值只会落在其中一种形状里。',
      },
      {
        id: 'itemization',
        label: 'Itemization',
        rect: [970, 155, 550, 520],
        speech:
          'Itemization 更复杂一些，不同 case 可能是不同类型或不同范围，比如 false、一个自然数区间、或者字符串 complete。',
      },
      {
        id: 'one-of-cond',
        label: 'one-of 对应 cond',
        rect: [80, 715, 1440, 125],
        speech:
          '所有 one-of 的共同点是 template 需要 cond。每一种可能形状，对应 cond 里的一个问题。',
      },
    ],
  },
  {
    title: 'Enumeration：LetterGrade 的每个 case 都是固定值',
    steps: [
      {
        id: 'lettergrade-data',
        label: 'LetterGrade 数据定义',
        rect: [40, 145, 720, 545],
        speech:
          'LetterGrade 是一个小枚举：A、B、C，每个 case 都是精确字符串，所以它们都是 atomic distinct。',
      },
      {
        id: 'lettergrade-template',
        label: 'LetterGrade 模板',
        rect: [845, 145, 705, 545],
        speech:
          '右边的 template 用 cond 分别检查 A、B、C。这里不要把三个固定值混成一个模糊的问题。',
      },
      {
        id: 'no-else-small-enum',
        label: '小枚举不用 else',
        rect: [110, 730, 1390, 120],
        speech:
          '小枚举通常不急着用 else。把每个具体值写出来，代码更容易检查，也更容易发现数据定义变了没有同步更新。',
      },
    ],
  },
  {
    title: 'Itemization：CountDown 有三种不同形状',
    steps: [
      {
        id: 'countdown-cases',
        label: 'CountDown 三种形状',
        rect: [300, 175, 700, 420],
        speech:
          'CountDown 是 itemization：它可能是 false，可能是一到十的自然数，也可能是字符串 complete。三个 case 的形状不同。',
      },
      {
        id: 'countdown-definition',
        label: 'CountDown 定义',
        rect: [55, 350, 330, 300],
        speech:
          '左边定义了这个数据类型的解释。这里的重点不是某一个值，而是整个状态空间分成了三块。',
      },
      {
        id: 'countdown-examples',
        label: '代表性例子',
        rect: [1090, 320, 430, 330],
        speech:
          '右边的 CD0 到 CD3 是代表性例子。false、十、一、complete 分别覆盖了不同 case 或边界。',
      },
      {
        id: 'itemization-rule',
        label: 'Itemization 规则',
        rect: [85, 690, 1430, 80],
        speech:
          '下面的 template rule 明确告诉我们：这是 one-of，里面混合了 atomic-distinct 和 atomic-non-distinct。',
      },
      {
        id: 'itemization-insight',
        label: '判断方式不同',
        rect: [90, 770, 1410, 90],
        speech:
          'Itemization 的关键是不同 case 的判断方式可能完全不同，下一页我们就看 cond 怎么写。',
      },
    ],
  },
  {
    title: 'Itemization 的 cond：先问类型，再问范围',
    steps: [
      {
        id: 'guarded-code',
        label: 'guarded cond 代码',
        rect: [55, 180, 720, 470],
        speech:
          '这段 template 展示 itemization 的安全写法。先问 false?，再问是不是 number，并且在一到十范围内。',
      },
      {
        id: 'case-callouts',
        label: '每个 case 的问题',
        rect: [800, 180, 420, 470],
        speech:
          '右边三个标注对应三个 case。atomic distinct 直接问 false?；区间需要 type predicate 加 range check；最后一个 case 用 else。',
      },
      {
        id: 'decision-flow',
        label: '判断流程',
        rect: [1235, 180, 310, 470],
        speech: '流程图把顺序画出来：先排除 false，再确认 number 和范围，剩下的才是 complete。',
      },
      {
        id: 'predicate-warning',
        label: '先问类型的原因',
        rect: [80, 735, 1440, 120],
        speech:
          '不要只写小于等于一这种范围判断。如果 c 是 false 或 string，范围比较会先出错，所以必须先用 number? 保护。',
      },
    ],
  },
  {
    title: 'Compound Data：一个值同时带着多个字段',
    steps: [
      {
        id: 'one-of-review',
        label: 'one-of 是选一种',
        rect: [35, 145, 520, 520],
        speech:
          '先复习 one-of：几个可能形状里选一种。一个 CountDown 值不会同时又是 false 又是 number。',
      },
      {
        id: 'compound-record',
        label: 'compound 字段同时存在',
        rect: [605, 145, 930, 330],
        speech:
          'Compound 刚好相反：一个值同时带着多个字段。Student 这个值里 id、name、major 都存在。',
      },
      {
        id: 'student-code',
        label: 'define-struct student',
        rect: [595, 500, 940, 180],
        speech:
          'Racket 里用 define-struct 定义 compound data。student 结构有三个字段，构造器会叫 make-student。',
      },
      {
        id: 'compound-insight',
        label: '选一种 vs 字段全部都有',
        rect: [110, 730, 1390, 125],
        speech:
          '一句话区分：one-of 是选一种，compound 是字段全部都有。这个区别会直接影响 template。',
      },
    ],
  },
  {
    title: 'Compound Template：用 selector 拆字段',
    steps: [
      {
        id: 'ball-template',
        label: 'Ball 模板',
        rect: [35, 145, 765, 535],
        speech:
          'Ball 这个 compound data 有 x 和 y 两个字段。template 不是只写 b，而是用 ball-x 和 ball-y 把字段取出来。',
      },
      {
        id: 'student-template',
        label: 'Student 模板',
        rect: [840, 145, 710, 535],
        speech:
          'Student 同理。student-id、student-name、student-major 这些 selectors，才是函数真正会用到的数据入口。',
      },
      {
        id: 'selector-insight',
        label: 'selector 是核心',
        rect: [110, 730, 1390, 125],
        speech:
          'Compound 的模板重点就是 selector。看到 define-struct，就要想到：模板里应该把每个字段都拆出来。',
      },
    ],
  },
  {
    title: '今天的核心：函数设计跟着数据设计走',
    steps: [
      {
        id: 'htdf-summary',
        label: 'HTDF 总结',
        rect: [35, 150, 740, 255],
        speech:
          '今天第一条线是 HTDF：一个函数应该有名字、签名、目的、例子、stub、template 和 body。它让函数设计可检查。',
      },
      {
        id: 'htdd-summary',
        label: 'HTDD 总结',
        rect: [830, 150, 730, 255],
        speech:
          '第二条线是 HTDD：数据也要有名字、解释、例子和 template rule。数据定义不是注释装饰，而是函数模板的来源。',
      },
      {
        id: 'rules-and-pitfalls',
        label: '规则与常见坑',
        rect: [35, 430, 1525, 265],
        speech:
          '第三条线是规则和常见坑：atomic 直接用，one-of 用 cond，compound 用 selectors。很多错误都来自把这些形状混在一起。',
      },
      {
        id: 'next-hook',
        label: '下节课钩子',
        rect: [100, 740, 1395, 115],
        speech:
          '下节课我们继续往前走：当数据结构变复杂，函数模板会怎样自动长出来？这是系统设计程序真正有力量的地方。',
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
    source: 'imagegen-full-slide-cpsc107-htdf-htdd-from-02-pdf',
    sourcePdf: '/Users/dongpochen/Desktop/2026 Summer/CPSC 107/02_htdf_htdd/02_htdf_htdd.pdf',
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
        name: 'HTDF + HTDD · 设计函数与数据',
        description:
          'CPSC 107 notebook in image-generated full-slide format. Covers How to Design Functions, How to Design Data, atomic data, one-of data, enumerations, itemizations, compound data, templates, examples, and a next-lesson hook.',
        tags: [
          'CPSC107',
          'HTDF',
          'HTDD',
          'Systematic Program Design',
          'Racket',
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
        name: 'HTDF + HTDD · 设计函数与数据',
        description:
          'CPSC 107 notebook in image-generated full-slide format. Covers How to Design Functions, How to Design Data, atomic data, one-of data, enumerations, itemizations, compound data, templates, examples, and a next-lesson hook.',
        tags: [
          'CPSC107',
          'HTDF',
          'HTDD',
          'Systematic Program Design',
          'Racket',
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
