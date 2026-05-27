#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { generatedNotebookDir, generatedNotebookPublicPath } from '../shared/paths.mjs';

const NOTEBOOK_ID = 'nb-cpsc107-ref-self-ref-week4-20260519140849';
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
    title: 'CPSC 107 · Reference + Self-Reference',
    steps: [],
  },
  {
    title: '今天的地图：ref 和 self-ref 到底在说什么？',
    steps: [
      {
        id: 'ref-panel',
        label: 'ref',
        rect: [40, 150, 490, 530],
        speech:
          '先看 ref。它的意思是：一个数据定义里面用了另一个已经定义好的数据。比如 Game 里有一个 Ball 字段，处理这个字段时要交给 Ball 的模板。',
      },
      {
        id: 'self-ref-panel',
        label: 'self-ref',
        rect: [555, 150, 490, 530],
        speech:
          'self-ref 是数据定义在自己的定义里再次出现。最典型的是 list：rest 的类型又是同一种 list，所以模板里会出现递归调用。',
      },
      {
        id: 'ref-self-ref-panel',
        label: 'ref + self-ref',
        rect: [1070, 150, 490, 530],
        speech:
          '有些数据会同时出现 ref 和 self-ref，比如 ListOfDot。first 是 Dot，要调用 fn-for-dot；rest 是 ListOfDot，要递归调用 fn-for-lod。',
      },
      {
        id: 'rule',
        label: '判断规则',
        rect: [95, 725, 1415, 120],
        speech: '今天的判断方法很机械：先看字段类型，再看它是别的 HTDD，还是回到同一个 HTDD。',
      },
    ],
  },
  {
    title: 'Reference：Game 里有一个 Ball',
    steps: [
      {
        id: 'ball-definition',
        label: 'Ball 定义',
        rect: [35, 150, 515, 575],
        speech:
          '左边是 Ball。它是 compound data，有 x 和 y 两个 Number 字段，所以 Ball 自己的模板直接使用 ball-x 和 ball-y。',
      },
      {
        id: 'game-definition',
        label: 'Game 定义',
        rect: [1080, 150, 480, 565],
        speech:
          '右边是 Game。它有两个字段：ball 和 score。score 是 Number 可以直接用，但 ball 的类型是 Ball，这就是 ref。',
      },
      {
        id: 'field-analysis',
        label: '字段类型分析',
        rect: [575, 220, 455, 470],
        speech:
          '中间这张小卡片就是写模板前要做的判断：game-ball g 的类型是 Ball，所以要调用 fn-for-ball；game-score g 是 Number，所以直接使用。',
      },
      {
        id: 'insight',
        label: 'ref 的写法',
        rect: [75, 740, 1450, 115],
        speech:
          'ref 最常见的错误是直接写 game-ball。正确写法是把这个字段交给对应的 helper template。',
      },
    ],
  },
  {
    title: 'Reference Template：遇到 ref，就调用 helper template',
    steps: [
      {
        id: 'template-code',
        label: 'Game 模板',
        rect: [45, 140, 860, 610],
        speech:
          '这页把 Game 的模板单独放大。dd-template-rules 里有 compound，因为 Game 是结构；也有 ref，因为 ball 字段是 Ball。',
      },
      {
        id: 'nested-game',
        label: '嵌套记录',
        rect: [930, 160, 600, 460],
        speech:
          '右边的图把嵌套关系画出来：Game 里面装着一个 Ball。模板不是把 Ball 展开在 Game 里，而是调用 fn-for-ball。',
      },
      {
        id: 'checklist',
        label: '逐字段检查',
        rect: [165, 670, 1260, 190],
        speech:
          '写 compound template 时逐个字段问：primitive 就直接用，自定义数据就调用对应的 fn-for。',
      },
    ],
  },
  {
    title: 'List 的基本组成：empty 和 cons',
    steps: [
      {
        id: 'cons-chain',
        label: 'cons 链',
        rect: [75, 145, 1425, 245],
        speech:
          'list 的结构不是一整块，而是一条链。每个 cons cell 都有 first 和 rest，最后一定停在 empty。',
      },
      {
        id: 'cons-examples',
        label: 'cons 写法',
        rect: [55, 430, 680, 255],
        speech:
          '左下角是完整 cons 写法。L1 是一接二再接 empty；L3 说明 list 里甚至可以混不同类型的值。',
      },
      {
        id: 'shorthand',
        label: '简写',
        rect: [790, 430, 735, 255],
        speech: '右下角是简写。list 函数和 quote 写法都可以更快地写出同一条 list。',
      },
      {
        id: 'list-insight',
        label: 'first + rest',
        rect: [80, 735, 1440, 115],
        speech: '后面所有 list template 都来自这句话：list 是 first 加 rest 的链，最后停在 empty。',
      },
    ],
  },
  {
    title: 'List Operations：先看 first，再看 rest',
    steps: [
      {
        id: 'list-diagram',
        label: 'L7 图示',
        rect: [70, 155, 790, 515],
        speech: '左边把 L7 画成一条链。first 拿当前第一个元素，rest 拿剩下整条 list。',
      },
      {
        id: 'operations-table',
        label: '常用操作表',
        rect: [925, 155, 600, 530],
        speech:
          '右边列出常用操作。注意 rest 的结果仍然是 list，不是单个元素。这一点会直接引出递归模板。',
      },
      {
        id: 'recursive-link',
        label: '递归连接',
        rect: [100, 735, 1400, 115],
        speech:
          '写递归模板时，first 处理当前元素，rest 交给下一次递归；这就是 list 函数的固定节奏。',
      },
    ],
  },
  {
    title: 'ListOfInteger：第一个 self-ref 数据定义',
    steps: [
      {
        id: 'loi-definition',
        label: 'ListOfInteger 定义',
        rect: [45, 155, 650, 520],
        speech:
          'ListOfInteger 是 one-of：要么是 empty，要么是 cons 一个 Integer 和另一个 ListOfInteger。',
      },
      {
        id: 'recursive-shape',
        label: '递归形状',
        rect: [735, 155, 780, 520],
        speech:
          '右边这张图是关键。cons 的 rest 字段又回到了 ListOfInteger，所以这不是普通 compound，而是 self-ref。',
      },
      {
        id: 'template-rule',
        label: 'template rules',
        rect: [120, 690, 1360, 80],
        speech:
          'template rule 里同时有 one-of、atomic-distinct、compound 和 self-ref。每个词都能从数据定义里找到原因。',
      },
      {
        id: 'self-ref-insight',
        label: 'self-ref 意义',
        rect: [100, 775, 1390, 90],
        speech: 'self-ref 不是特殊魔法，只是 rest 又是同一种数据，所以函数会调用自己。',
      },
    ],
  },
  {
    title: 'List Template：base case + recursive case',
    steps: [
      {
        id: 'template-code',
        label: 'List template',
        rect: [35, 170, 560, 520],
        speech: 'List 的模板有两个分支。empty? 是 base case，代表链走到尽头；else 是 cons case。',
      },
      {
        id: 'callouts',
        label: '三处关键',
        rect: [625, 210, 345, 430],
        speech:
          '三个标注分别对应 base case、当前元素 first、以及递归调用。看到 rest 是 ListOfInteger，就写 fn-for-loi rest。',
      },
      {
        id: 'loi-example',
        label: 'LOI1 拆分',
        rect: [990, 170, 560, 530],
        speech:
          '右边用二一二、负九十八、三这条 list 展示 first 和 rest。rest 仍然是 ListOfInteger，所以可以继续交给同一个函数。',
      },
      {
        id: 'rhythm',
        label: '递归节奏',
        rect: [75, 735, 1450, 115],
        speech: '递归模板的节奏就是：先处理 first，再把 rest 交给同一个函数。',
      },
    ],
  },
  {
    title: '递归模板怎么跑：每次吃掉一个 first',
    steps: [
      {
        id: 'trace-frames',
        label: '递归帧',
        rect: [35, 140, 1180, 560],
        speech:
          '这页展示递归模板实际怎么跑。每一层都取出当前 first，再把 rest 变成下一次调用的输入。',
      },
      {
        id: 'stop-rule',
        label: '停止规则',
        rect: [1240, 190, 300, 470],
        speech: '右边的规则很重要：empty? 负责停下来；else 负责继续处理 first 和 rest。',
      },
      {
        id: 'shorter-rest',
        label: 'rest 变短',
        rect: [75, 735, 1450, 115],
        speech: '递归会停的原因是 rest 每次都让 list 变短，最后一定到 empty。',
      },
    ],
  },
  {
    title: 'ListOfString：换元素类型，模板节奏不变',
    steps: [
      {
        id: 'comparison',
        label: '和 ListOfInteger 对比',
        rect: [40, 145, 590, 350],
        speech:
          'ListOfString 和 ListOfInteger 的整体结构一样，区别只是 first 的元素类型从 Integer 换成 String。',
      },
      {
        id: 'los-definition',
        label: 'ListOfString 定义',
        rect: [685, 145, 850, 350],
        speech:
          '右上角写出 ListOfString 的数据定义。仍然是 empty 或 cons，一个 String 加上另一个 ListOfString。',
      },
      {
        id: 'los-template',
        label: 'ListOfString 模板',
        rect: [260, 525, 1100, 175],
        speech: '模板节奏完全不变：empty 分支停，else 分支使用 first，然后递归处理 rest。',
      },
      {
        id: 'structure-unchanged',
        label: '结构不变',
        rect: [90, 745, 1415, 110],
        speech:
          '这就是 design recipe 的力量：元素类型可以换，但只要 list 形状一样，模板结构就一样。',
      },
    ],
  },
  {
    title: 'List of Compound：first 是 Book，rest 是 ListOfBook',
    steps: [
      {
        id: 'book-template',
        label: 'Book 模板',
        rect: [35, 135, 1530, 260],
        speech:
          'Book 本身是 compound data，有 title、auth、year、genre 四个字段，所以 Book 的模板用四个 selector。',
      },
      {
        id: 'listofbook-chain',
        label: 'ListOfBook 链',
        rect: [65, 430, 1450, 260],
        speech: '当它变成 ListOfBook 时，first 的类型是 Book，rest 的类型是 ListOfBook。',
      },
      {
        id: 'ref-and-self-ref',
        label: 'ref + self-ref',
        rect: [110, 725, 1390, 125],
        speech:
          '所以 list of compound 同时有两件事：first 要交给 Book 的模板，rest 要递归处理同一种 list。',
      },
    ],
  },
  {
    title: 'ListOfDot：ref + self-ref 的完整模板',
    steps: [
      {
        id: 'dot-definition',
        label: 'Dot 定义',
        rect: [35, 155, 520, 585],
        speech: '左边是 Dot。它是普通 compound，模板直接使用 dot-x 和 dot-y。',
      },
      {
        id: 'field-analysis',
        label: 'first / rest 分析',
        rect: [575, 260, 260, 340],
        speech:
          '中间两张卡片是写模板前的关键判断：first lod 是 Dot，所以是 ref；rest lod 是 ListOfDot，所以是 self-ref。',
      },
      {
        id: 'lod-template',
        label: 'ListOfDot 模板',
        rect: [865, 155, 690, 585],
        speech: '右边的完整模板把这两件事都写出来：fn-for-dot 处理 first，fn-for-lod 处理 rest。',
      },
      {
        id: 'cons-rule',
        label: '看到 cons Dot ListOfDot',
        rect: [110, 755, 1390, 105],
        speech:
          '看到 cons Dot ListOfDot，就应该自动想到：first 用 fn-for-dot，rest 用 fn-for-lod。',
      },
    ],
  },
  {
    title: '考试题策略：先标 shape，再写 template',
    steps: [
      {
        id: 'workflow',
        label: '四步流程',
        rect: [30, 145, 1535, 300],
        speech:
          '考试题先不要直接写答案。第一步圈出 one-of 的每个 case，第二步给每个 case 标 template rule。',
      },
      {
        id: 'rule-table',
        label: '规则表',
        rect: [80, 475, 1430, 245],
        speech:
          '这张表把规则压缩成一句话：distinct value 写对应问题；compound 用 selector；别的 HTDD 用 helper；同一个 HTDD 用递归调用。',
      },
      {
        id: 'mechanical-not-magic',
        label: '机械推导',
        rect: [95, 745, 1410, 105],
        speech: 'template 不是背出来的，是从数据定义机械推出来的。这样遇到没见过的题也能稳住。',
      },
    ],
  },
  {
    title: '例题 1：Waldo 的数据形状先读清楚',
    steps: [
      {
        id: 'waldo-definition',
        label: 'Waldo 定义',
        rect: [40, 145, 620, 560],
        speech:
          'Waldo 有五个 case：两个 string，两个 struct，一个 true。先把每个 case 的形状读清楚。',
      },
      {
        id: 'shape-tree',
        label: 'Waldo 形状树',
        rect: [700, 145, 835, 560],
        speech:
          '右边标出每个 case 的 rule。fie 是 compound；foe 也是 compound，而且 foe-d 的类型又是 Waldo。',
      },
      {
        id: 'waldo-key',
        label: '关键 self-ref',
        rect: [100, 735, 1390, 120],
        speech:
          'Waldo 的关键不是有几个分支，而是看出 foe-d 回到了 Waldo，所以这里必须有 self-ref。',
      },
    ],
  },
  {
    title: 'Waldo 答案：每个 case 对应 cond 的一个问题',
    steps: [
      {
        id: 'waldo-rules',
        label: 'Waldo rules',
        rect: [35, 135, 815, 255],
        speech:
          '上面先写 template rules。五个 case 对应两次 atomic-distinct、两次 compound、一次 true，并且 foe-d 带来 self-ref。',
      },
      {
        id: 'waldo-template',
        label: 'Waldo template',
        rect: [45, 405, 860, 335],
        speech:
          '下面的 cond 每个 case 一个问题。字符串用 string? 和 string=?；fie 和 foe 用对应的 predicate。',
      },
      {
        id: 'case-callouts',
        label: 'case 标注',
        rect: [920, 125, 620, 615],
        speech: '右边的标注把答案和数据定义对齐。fie 只取字段；foe 的 d 字段需要递归调用。',
      },
      {
        id: 'waldo-insight',
        label: 'Waldo 难点',
        rect: [100, 760, 1400, 105],
        speech: 'Waldo 的难点不是 cond 本身，而是看出 foe-d 的类型回到了 Waldo。',
      },
    ],
  },
  {
    title: '例题 2：Peat 的 self-ref 藏在哪个字段？',
    steps: [
      {
        id: 'peat-definition',
        label: 'Peat 定义',
        rect: [40, 145, 600, 545],
        speech:
          'Peat 有四个 case：crim、rudz、false、zap。先把每个 case 标成 compound 或 atomic-distinct。',
      },
      {
        id: 'peat-shape-tree',
        label: 'Peat 形状树',
        rect: [690, 145, 835, 545],
        speech: '右边可以看到，只有 crim 的 d 字段类型是 Peat，所以 self-ref 只发生在 crim 分支。',
      },
      {
        id: 'peat-analysis',
        label: '字段分析',
        rect: [80, 705, 1430, 150],
        speech: 'rudz 的两个字段都是 primitive，直接用 selector；false 和 zap 是 atomic-distinct。',
      },
    ],
  },
  {
    title: 'Peat 答案：crim 分支带 self-ref',
    steps: [
      {
        id: 'peat-rules',
        label: 'Peat rules',
        rect: [145, 130, 1170, 235],
        speech:
          'Peat 的 template rules 先写 one-of。crim 是 compound 且带 self-ref；rudz 是普通 compound；false 和 zap 是 atomic-distinct。',
      },
      {
        id: 'peat-template',
        label: 'Peat template',
        rect: [100, 380, 810, 365],
        speech: '模板里 crim 分支使用 crim-k，同时对 crim-d 做 fn-for-peat 递归调用。',
      },
      {
        id: 'peat-callouts',
        label: '字段解释',
        rect: [960, 400, 500, 330],
        speech:
          '右边说明每个字段如何处理。rudz-s 和 rudz-b 都是 primitive，所以直接 selectors 就够了。',
      },
      {
        id: 'peat-core',
        label: 'Peat 核心',
        rect: [80, 760, 1440, 105],
        speech: 'Peat 的核心：只有 crim-d 回到 Peat；rudz 只是普通 compound。',
      },
    ],
  },
  {
    title: '常见错误：ref 和 self-ref 别写反',
    steps: [
      {
        id: 'mistake-ref',
        label: '把 ref 当直接字段',
        rect: [30, 160, 380, 485],
        speech:
          '第一个错误是把 ref 当直接字段。Game 的 ball 字段是 Ball，所以应该调用 fn-for-ball。',
      },
      {
        id: 'mistake-base',
        label: '忘记 base case',
        rect: [435, 160, 370, 485],
        speech:
          '第二个错误是忘记 base case。list template 必须先处理 empty，否则递归没有停止条件。',
      },
      {
        id: 'mistake-rest',
        label: 'rest 没有递归',
        rect: [830, 160, 370, 485],
        speech: '第三个错误是直接使用 rest。rest 仍然是一条 list，所以应该交给同一个 fn-for-loi。',
      },
      {
        id: 'mistake-selector',
        label: 'compound 忘记 selector',
        rect: [1220, 160, 350, 485],
        speech: '第四个错误是 compound 忘记 selector。结构体本身要拆成字段，才能在 body 里使用。',
      },
      {
        id: 'check-order',
        label: '检查顺序',
        rect: [65, 665, 1480, 195],
        speech:
          '最后用这个检查顺序兜底：one-of、compound、field type、ref or self-ref。每一行 template 都应该能回到数据定义找到原因。',
      },
    ],
  },
  {
    title: '今天总结：数据定义会告诉你函数怎么长',
    steps: [
      {
        id: 'reference-summary',
        label: 'Reference',
        rect: [35, 160, 745, 265],
        speech:
          'Reference 的关键词是 another HTDD。字段类型是别的数据定义时，调用对应 helper template。',
      },
      {
        id: 'self-reference-summary',
        label: 'Self-Reference',
        rect: [820, 160, 745, 265],
        speech:
          'Self-reference 的关键词是 same HTDD。字段或 rest 的类型回到自己时，就出现递归调用。',
      },
      {
        id: 'lists-summary',
        label: 'Lists',
        rect: [35, 450, 745, 270],
        speech:
          'List 的关键词是 empty 和 cons。empty 是 base case，cons 是 first 加 rest，rest 每次让 list 变短。',
      },
      {
        id: 'exam-summary',
        label: 'Exam Templates',
        rect: [820, 450, 745, 270],
        speech:
          '考试模板题不要猜。标出每个 case，选 predicate，struct 用 selector，只有类型重复的地方才递归。',
      },
      {
        id: 'next-hook',
        label: '下节课钩子',
        rect: [75, 745, 1450, 105],
        speech:
          '下节课我们就用 self-ref template 写真正处理整条 list 的函数，比如计数、筛选、转换和汇总。',
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
    source: 'imagegen-full-slide-cpsc107-ref-self-ref-from-04-pdf',
    sourcePdf: '/Users/dongpochen/Desktop/2026 Summer/CPSC 107/03_ref_self_ref/04_ref_self_ref.pdf',
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
        name: 'Reference + Self-Reference · Lists',
        description:
          'CPSC 107 notebook in image-generated full-slide format. Covers reference, self-reference, list construction and operations, ListOfInteger, ListOfString, list of compound data, Waldo and Peat exam-style recursive templates, common mistakes, and a next-lesson hook.',
        tags: [
          'CPSC107',
          'Reference',
          'Self-Reference',
          'Lists',
          'Recursive Templates',
          'Systematic Program Design',
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
        name: 'Reference + Self-Reference · Lists',
        description:
          'CPSC 107 notebook in image-generated full-slide format. Covers reference, self-reference, list construction and operations, ListOfInteger, ListOfString, list of compound data, Waldo and Peat exam-style recursive templates, common mistakes, and a next-lesson hook.',
        tags: [
          'CPSC107',
          'Reference',
          'Self-Reference',
          'Lists',
          'Recursive Templates',
          'Systematic Program Design',
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
