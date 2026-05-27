#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { generatedNotebookDir, generatedNotebookPublicPath } from '../shared/paths.mjs';

const NOTEBOOK_ID = 'nb-mat136-integration-by-parts-week2-v2-20260519151624';
const COURSE_ID = 'cmpanemia001v8ouzmhttvkrn';
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

const sourceImages = [
  '/Users/dongpochen/.codex/generated_images/019e416c-3d64-7843-bacd-a9436ed9d25f/ig_0fcd108200572cfa016a0cb21daeac8195b00708ba14418582.png',
  '/Users/dongpochen/.codex/generated_images/019e416c-3d64-7843-bacd-a9436ed9d25f/ig_0fcd108200572cfa016a0cb28003948195b82ef3537d41ac9f.png',
  '/Users/dongpochen/.codex/generated_images/019e416c-3d64-7843-bacd-a9436ed9d25f/ig_0fcd108200572cfa016a0cb2e740a08195a8580c76639b91a2.png',
  '/Users/dongpochen/.codex/generated_images/019e416c-3d64-7843-bacd-a9436ed9d25f/ig_0fcd108200572cfa016a0cb34df62481958d07f19de386609c.png',
  '/Users/dongpochen/.codex/generated_images/019e416c-3d64-7843-bacd-a9436ed9d25f/ig_0fcd108200572cfa016a0cb3aa79948195a869b0dc2726560e.png',
  '/Users/dongpochen/.codex/generated_images/019e416c-3d64-7843-bacd-a9436ed9d25f/ig_0fcd108200572cfa016a0cb410c2c881959a0072bba34fa401.png',
  '/Users/dongpochen/.codex/generated_images/019e416c-3d64-7843-bacd-a9436ed9d25f/ig_0fcd108200572cfa016a0cb475b234819588345d4745c1381e.png',
  '/Users/dongpochen/.codex/generated_images/019e416c-3d64-7843-bacd-a9436ed9d25f/ig_0fcd108200572cfa016a0cb4d4c11c8195ad58c4a624c18f8d.png',
  '/Users/dongpochen/.codex/generated_images/019e4dac-7e3f-7f21-b03a-c835dad2a4e8/ig_0c8e8c6ded9df511016a0fcbece00481958c0275c7accacc6c.png',
  '/Users/dongpochen/.codex/generated_images/019e4dac-7e3f-7f21-b03a-c835dad2a4e8/ig_0c8e8c6ded9df511016a0fcc37393c81958fe19b54f4107d32.png',
  '/Users/dongpochen/.codex/generated_images/019e416c-3d64-7843-bacd-a9436ed9d25f/ig_0fcd108200572cfa016a0cb5a7e60c81958d30b169b7ad1914.png',
];

const slides = [
  {
    title: 'MAT 136 · 分部积分',
    steps: [
      {
        id: 'overview-roadmap',
        label: '整节课路线',
        rect: [80, 330, 1440, 270],
        speech:
          '这页只做 overview。今天不是先冲进计算，而是按一条课堂路线走：先问为什么需要分部积分，再学公式怎么用，再看公式来源，最后处理选 u 和多个例题。',
      },
      {
        id: 'lesson-mainline',
        label: '主线和目标',
        rect: [55, 635, 1485, 225],
        speech:
          '整节课的目标是：把难的乘积积分，改写成一个乘积结果减去一个更简单的积分。最后你应该能判断、能选择、能完整写步骤。',
      },
    ],
  },
  {
    title: '为什么需要分部积分？',
    steps: [
      {
        id: 'substitution-works',
        label: '换元法擅长的形状',
        rect: [25, 165, 490, 525],
        speech:
          '先承接上一节的换元法。像二 x 乘 cosine x 平方这种题，内层 x 平方的导数二 x 在旁边，所以换元很自然。',
      },
      {
        id: 'product-integrals',
        label: '不像换元的乘积积分',
        rect: [545, 165, 485, 525],
        speech:
          '但现在这些题不一样：x e 的 x 次方、x cosine x、ln x。它们不一定有一个清楚的内层和内层导数，而是更像乘积本身需要被处理。',
      },
      {
        id: 'new-idea',
        label: '新的想法',
        rect: [1055, 165, 520, 525],
        speech:
          '所以新想法不是硬找内层，而是把乘积求导倒过来看。我们希望把难的乘积积分，换成更容易处理的积分。',
      },
      {
        id: 'opening-question',
        label: '今天的问题',
        rect: [45, 735, 1510, 115],
        speech: '这页只提出问题：怎样把一个乘积积分拆成更容易处理的东西？下一页先看公式怎么用。',
      },
    ],
  },
  {
    title: '公式怎么用：先看一个例子',
    steps: [
      {
        id: 'formula-preview',
        label: '核心公式预览',
        rect: [460, 125, 820, 165],
        speech:
          '先不急着证明，先学会识别公式里的四个位置。分部积分公式是 u dv 的积分，等于 uv 减 v du 的积分。',
      },
      {
        id: 'role-assignment',
        label: '分配角色',
        rect: [35, 365, 490, 385],
        speech:
          '例子是 x e 的 x 次方。我们选 u 等于 x，因为它求导变简单；选 dv 等于 e 的 x 次方 dx，因为它容易积分。',
      },
      {
        id: 'plug-formula',
        label: '套进公式',
        rect: [565, 365, 500, 385],
        speech:
          '把四个位置放进公式，原积分变成 x e 的 x 次方，减去 e 的 x 次方的积分。这里的减号来自公式本身。',
      },
      {
        id: 'remaining-integral',
        label: '算剩下的积分',
        rect: [1115, 365, 445, 385],
        speech:
          '剩下的 e 的 x 次方积分可以直接算，所以答案是 x e 的 x 次方减 e 的 x 次方，也可以写成 e 的 x 次方乘 x 减一。',
      },
      {
        id: 'position-check',
        label: '位置检查',
        rect: [100, 775, 1400, 90],
        speech: '这页的重点不是证明，而是看懂公式的四个位置：u、dv、du、v 分别从哪里来。',
      },
    ],
  },
  {
    title: '公式从哪来？乘积法则',
    steps: [
      {
        id: 'product-rule',
        label: '乘积法则',
        rect: [15, 220, 400, 315],
        speech: '现在回头证明公式。起点是乘积法则：uv 的导数等于 u prime v 加 u v prime。',
      },
      {
        id: 'differential-form',
        label: '微分形式',
        rect: [445, 220, 380, 315],
        speech:
          '把乘积法则写成微分形式，就是 d of uv 等于 u dv 加 v du。这里 dv 和 du 是后面公式里的角色。',
      },
      {
        id: 'integrate-both-sides',
        label: '两边积分',
        rect: [845, 220, 395, 315],
        speech: '两边积分以后，左边回到 uv，右边出现两个积分：u dv 的积分和 v du 的积分。',
      },
      {
        id: 'move-term',
        label: '移项得到公式',
        rect: [300, 560, 1020, 165],
        speech:
          '最后把 v du 的积分移到右边，就得到分部积分公式。这就是为什么公式里一定有一个减号。',
      },
      {
        id: 'proof-note',
        label: '证明核心',
        rect: [120, 760, 1360, 115],
        speech:
          '所以分部积分不是新魔法，只是乘积法则的反向使用。理解这一点，后面选 u 和 dv 就更有方向。',
      },
    ],
  },
  {
    title: '怎么选 u 和 dv？',
    steps: [
      {
        id: 'hard-conditions',
        label: '两个硬条件',
        rect: [40, 145, 490, 445],
        speech:
          '真正难的是选择。硬条件有两个：u 求导后要更简单，dv 必须真的会积分；最后还要检查新的积分有没有变容易。',
      },
      {
        id: 'liate-guide',
        label: 'LIATE 指南',
        rect: [555, 140, 475, 470],
        speech:
          'LIATE 是选 u 的优先级提醒：对数、反三角、代数、三角、指数。它帮助你起步，但不是死规则。',
      },
      {
        id: 'quick-decisions',
        label: '快速判断',
        rect: [1060, 145, 500, 470],
        speech:
          '右边给了几个快速判断：x e 的 x 次方和 x cosine x 通常选 u 等于 x；ln x 本身适合求导，所以选 u 等于 ln x。',
      },
      {
        id: 'choice-outcome',
        label: '好选择与坏选择',
        rect: [40, 610, 1500, 240],
        speech:
          '每做一步都问：新的积分有没有变简单？如果越做越复杂，就说明 u 和 dv 的角色可能选反了。',
      },
    ],
  },
  {
    title: '例题 1：∫ x cos x dx',
    steps: [
      {
        id: 'problem-choice',
        label: '题目与角色分配',
        rect: [50, 130, 570, 410],
        speech:
          '第一题计算 x cosine x。让 u 等于 x，dv 等于 cosine x dx，因为 x 求导变成一，cosine x 容易积分成 sine x。',
      },
      {
        id: 'apply-formula',
        label: '套公式',
        rect: [755, 165, 720, 320],
        speech:
          '套公式后，原积分等于 x sine x 减去 sine x 的积分。这个减号必须保留，后面的符号全靠它。',
      },
      {
        id: 'sign-check',
        label: '符号检查',
        rect: [650, 505, 730, 320],
        speech:
          '剩下的 sine x 积分是负 cosine x。前面还有一个负号，所以负负得正，最后得到加 cosine x。',
      },
      {
        id: 'common-error',
        label: '常见错误',
        rect: [45, 625, 430, 220],
        speech: '这题最常见的错误是把最后写成减 cosine x。正确答案是 x sine x 加 cosine x 加 C。',
      },
    ],
  },
  {
    title: '例题 2：∫ ln x dx',
    steps: [
      {
        id: 'hidden-product',
        label: '先看成乘积',
        rect: [25, 300, 535, 350],
        speech:
          '第二题看起来不是乘积，但可以把 ln x 看成 ln x 乘一。这样就能把它放进分部积分框架里。',
      },
      {
        id: 'choose-u-dv',
        label: '选择 u 和 dv',
        rect: [595, 300, 400, 345],
        speech: '选 u 等于 ln x，因为它求导变成一除以 x；选 dv 等于 dx，所以 v 等于 x。',
      },
      {
        id: 'plug-and-simplify',
        label: '套公式并化简',
        rect: [1045, 300, 510, 345],
        speech: '套公式后出现 x 乘一除以 x，这正好化成一。于是剩下的积分是最简单的一的积分。',
      },
      {
        id: 'answer',
        label: '最终答案',
        rect: [80, 690, 770, 150],
        speech: '所以 ln x 的积分是 x ln x 减 x 加 C。这也是为什么 ln x 的积分常常要靠分部积分。',
      },
      {
        id: 'wrong-choice',
        label: '错误选择',
        rect: [930, 720, 620, 125],
        speech: '不要把 dv 选成 ln x dx，因为它正是原题本身；如果你已经会积它，就不需要这道题了。',
      },
    ],
  },
  {
    title: '例题 3：分部一次还不够',
    steps: [
      {
        id: 'first-round',
        label: '第一次分部积分',
        rect: [25, 280, 470, 410],
        speech:
          '第三题是 x 平方乘 e 的 x 次方。第一次选 u 等于 x 平方，dv 等于 e 的 x 次方 dx，结果还剩一个二 x e 的 x 次方的积分。',
      },
      {
        id: 'second-round',
        label: '第二次处理剩下的积分',
        rect: [550, 275, 500, 420],
        speech:
          '剩下的二 x e 的 x 次方仍然是多项式乘指数，所以再分部一次。二 x 求导后变成二，题目继续变轻。',
      },
      {
        id: 'combine-answer',
        label: '合并答案',
        rect: [1075, 275, 480, 410],
        speech:
          '最后把第二次结果代回第一次，并把 e 的 x 次方提出来，得到 e 的 x 次方乘 x 平方减二 x 加二，再加 C。',
      },
      {
        id: 'degree-drop',
        label: '次数下降规律',
        rect: [90, 735, 1380, 120],
        speech:
          '这页留下一个规律：多项式乘指数时，每分部一次，多项式次数通常下降一。次数降到零就结束。',
      },
    ],
  },
  {
    title: '挑战例题 4：先换元再分部',
    steps: [
      {
        id: 'read-structure',
        label: '先读结构',
        rect: [55, 175, 465, 255],
        speech:
          '这题比前面的例子更难一点，因为它不是直接分部。先看结构：cos 里面有 x 平方，外面还有 x 的三次方。',
      },
      {
        id: 'substitution-first',
        label: '先做换元',
        rect: [570, 175, 460, 255],
        speech:
          '先令 t 等于 x 平方。因为 dt 等于二 x dx，所以 x 的三次方 dx 可以拆成 x 平方乘 x dx，也就是二分之一 t dt。',
      },
      {
        id: 'parts-in-t',
        label: '在 t 里分部',
        rect: [1080, 175, 465, 255],
        speech:
          '现在才进入分部积分。对 t cosine t 分部，选 u 等于 t，dv 等于 cosine t dt，剩下的 sine t 积分带来正 cosine t。',
      },
      {
        id: 'substitute-back',
        label: '代回 x',
        rect: [125, 500, 630, 260],
        speech:
          '最后把 t 换回 x 平方。答案是二分之一乘 x 平方 sine x 平方加 cosine x 平方，再加 C。',
      },
      {
        id: 'method-warning',
        label: '方法提醒',
        rect: [840, 500, 610, 260],
        speech:
          '这题的重点是顺序：先换元，把题目变成标准的乘积积分；再分部。不要一上来硬分部，否则步骤会很乱。',
      },
    ],
  },
  {
    title: '挑战例题 5：∫ arctan x dx',
    steps: [
      {
        id: 'hidden-product',
        label: '隐藏的乘积',
        rect: [55, 175, 465, 255],
        speech: '这题看起来不像乘积，但和 ln x 一样，可以把 arctan x 看成 arctan x 乘以一。',
      },
      {
        id: 'choose-roles',
        label: '选择 u 和 dv',
        rect: [570, 175, 460, 255],
        speech: '选择 u 等于 arctan x，因为它求导会变成一个有理函数。dv 就是 dx，所以 v 等于 x。',
      },
      {
        id: 'apply-formula',
        label: '套分部积分',
        rect: [1080, 175, 465, 255],
        speech: '套公式后，原积分变成 x arctan x，减去 x 除以一加 x 平方的积分。难点已经降成换元。',
      },
      {
        id: 'log-integral',
        label: '处理剩余积分',
        rect: [125, 500, 630, 260],
        speech:
          '剩下的积分用换元。令 w 等于一加 x 平方，那么 x dx 是二分之一 dw，所以得到二分之一 ln 一加 x 平方。',
      },
      {
        id: 'final-answer',
        label: '最终答案',
        rect: [840, 500, 610, 260],
        speech:
          '最后答案是 x arctan x 减二分之一 ln 一加 x 平方，再加 C。这里的负号仍然来自分部积分公式。',
      },
    ],
  },
  {
    title: '本节总结：分部积分怎么想',
    steps: [
      {
        id: 'main-flow',
        label: '一条主线',
        rect: [285, 160, 1120, 90],
        speech:
          '总结一下，分部积分的一条主线是：看见乘积积分，选择 u 和 dv，套公式，再检查剩下的积分。',
      },
      {
        id: 'four-steps',
        label: '做题四步',
        rect: [20, 285, 420, 410],
        speech:
          '做题时按四步检查：是不是乘积，u 求导能不能变简单，dv 会不会积分，最后别漏符号和加 C。',
      },
      {
        id: 'core-formula',
        label: '核心公式',
        rect: [470, 330, 670, 190],
        speech:
          '核心公式仍然是 u dv 的积分，等于 uv 减去 v du 的积分。所有例题都是在给这四个位置找合适的对象。',
      },
      {
        id: 'example-types',
        label: '今天见过的题型',
        rect: [1160, 285, 400, 410],
        speech:
          '今天见过三类代表：多项式乘指数，多项式乘三角，对数函数，以及需要重复分部积分的题。',
      },
      {
        id: 'common-errors',
        label: '常见错误',
        rect: [20, 750, 1000, 110],
        speech:
          '常见错误是选错 u，忘记 dx，漏掉负号，或者最后忘记加 C。尤其是负号，要每一步都跟住。',
      },
      {
        id: 'next-hook',
        label: '下节课钩子',
        rect: [1040, 750, 530, 110],
        speech: '下节课可以继续讲表格法，以及定积分里的分部积分。那时还会多一个上下限处理问题。',
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

async function renderSlides() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const fileName of fs.readdirSync(OUTPUT_DIR)) {
    if (/^slide-\d+\.png$/.test(fileName) || fileName === 'contact-sheet.png') {
      fs.unlinkSync(path.join(OUTPUT_DIR, fileName));
    }
  }

  for (const [index, slide] of slides.entries()) {
    const outputFile = path.join(OUTPUT_DIR, `slide-${String(index + 1).padStart(2, '0')}.png`);
    const source = sourceImages[index];
    if (!source) throw new Error(`Missing visual source for slide ${index + 1}: ${slide.title}`);
    if (!fs.existsSync(source)) throw new Error(`Missing generated image: ${source}`);
    await sharp(source)
      .resize(SOURCE_WIDTH, SOURCE_HEIGHT, { fit: 'cover', position: 'center' })
      .png()
      .toFile(outputFile);
  }

  const hitMap = {
    notebookId: NOTEBOOK_ID,
    source: 'imagegen-full-slide-integration-by-parts-week2-v2',
    slides: slides.map((slide, index) => ({
      order: index,
      title: slide.title,
      image: `${PUBLIC_DIR}/slide-${String(index + 1).padStart(2, '0')}.png`,
      hitMap: semanticHitMapFor(index),
    })),
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'semantic-hit-map.json'), JSON.stringify(hitMap, null, 2));

  const columns = 3;
  const thumbWidth = 400;
  const thumbHeight = 225;
  const labelHeight = 42;
  const cellHeight = thumbHeight + labelHeight;
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
      top: Math.floor(index / columns) * cellHeight,
    });
  }

  await sharp({
    create: {
      width: columns * thumbWidth,
      height: Math.ceil(slides.length / columns) * cellHeight,
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
        name: 'Week 2：分部积分 · 教学重排版',
        description:
          'MAT 136 Week 2 integration by parts notebook in image-generated full-slide format. V2 follows a teacher-led lesson arc: overview, motivation, formula use, proof, u/dv choice, worked examples, two PDF-derived challenge examples, and a final summary.',
        tags: ['MAT136', 'Integration by Parts', '分部积分', 'calculus', 'semantic-hit-map'],
        avatarUrl: '/avatars/notebook-agents/avatar8.avif',
        language: 'zh-CN',
        style: 'imagegen-full-slide-semantic-hit-map',
        updatedAt: NOW,
      },
      create: {
        id: NOTEBOOK_ID,
        ownerId: course.ownerId,
        courseId: course.id,
        name: 'Week 2：分部积分 · 教学重排版',
        description:
          'MAT 136 Week 2 integration by parts notebook in image-generated full-slide format. V2 follows a teacher-led lesson arc: overview, motivation, formula use, proof, u/dv choice, worked examples, two PDF-derived challenge examples, and a final summary.',
        tags: ['MAT136', 'Integration by Parts', '分部积分', 'calculus', 'semantic-hit-map'],
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
    ]);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  await renderSlides();
  await seedNotebook();
  console.log(`Created ${NOTEBOOK_ID}`);
  console.log(`Output: ${OUTPUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
