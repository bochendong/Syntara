#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { generatedNotebookDir, generatedNotebookPublicPath } from '../shared/paths.mjs';

const NOTEBOOK_ID = 'nb-mat136-inverse-substitution-week2-20260519011900';
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

const slides = [
  {
    title: 'MAT 136 · 逆换元法',
    steps: [],
  },
  {
    title: '三种根号，三种代换',
    steps: [
      {
        id: 'minus-shape',
        label: '第一种：a² − x²',
        rect: [20, 225, 1560, 175],
        speech:
          '先看第一种根号：a 平方减 x 平方。我们希望用一个恒等式把一减某个平方变成另一个平方，所以选 x 等于 a sine theta。这样根号会变成 a cosine theta。',
      },
      {
        id: 'plus-shape',
        label: '第二种：a² + x²',
        rect: [20, 405, 1560, 175],
        speech:
          '第二种是 a 平方加 x 平方。看到一加某个平方，要想到一加 tangent 平方等于 secant 平方，所以选 x 等于 a tangent theta。根号就变成 a secant theta。',
      },
      {
        id: 'outside-shape',
        label: '第三种：x² − a²',
        rect: [20, 585, 1560, 180],
        speech:
          '第三种是 x 平方减 a 平方。这里 x 在外面更大，所以让 x 等于 a secant theta。利用 secant 平方减一等于 tangent 平方，根号就会变成 a tangent theta。',
      },
      {
        id: 'shape-rule',
        label: '选择规则',
        rect: [150, 785, 1300, 90],
        speech:
          '这页的核心不是背三行表，而是先识别根号形状，再选一个刚好能消掉根号的三角恒等式。形状决定代换。',
      },
    ],
  },
  {
    title: '为什么 √(a² − x²) 要选 sin?',
    steps: [
      {
        id: 'triangle',
        label: '用三角形解释代换',
        rect: [60, 145, 715, 540],
        speech:
          '用直角三角形看会比较自然。斜边是 a，对边是 x，所以 sine theta 等于 x 除以 a。于是 x 就等于 a sine theta，底边自然就是根号 a 平方减 x 平方。',
      },
      {
        id: 'root-simplification',
        label: '根号被消掉',
        rect: [835, 135, 670, 565],
        speech:
          '把 x 等于 a sine theta 代进去，根号里出现 a 平方乘一减 sine 平方 theta。恒等式把它变成 cosine 平方 theta，所以根号就是 a cosine theta。',
      },
      {
        id: 'dx-also-simple',
        label: 'dx 也一起变简单',
        rect: [80, 720, 1425, 130],
        speech:
          '代换不只是为了根号好看，还要让 dx 一起变简单。这里 dx 等于 a cosine theta d theta，常常会和根号里的 a cosine theta 配合起来。',
      },
    ],
  },
  {
    title: '例 1：先配方，再看形状',
    steps: [
      {
        id: 'problem',
        label: '题目',
        rect: [55, 110, 790, 145],
        speech:
          '第一道例题不是一眼就有 a 平方减 x 平方，因为根号里是五加四 x 减 x 平方。遇到二次式，先不要急着代换，先配方。',
      },
      {
        id: 'complete-square',
        label: '配方成圆的形状',
        rect: [40, 300, 425, 500],
        speech:
          '配方以后，五加四 x 减 x 平方等于九减 x 减二的平方。现在它就是三平方减某个量平方，所以形状已经出来了。',
      },
      {
        id: 'shift-variable',
        label: '平移变量',
        rect: [505, 295, 395, 335],
        speech:
          '接着令 u 等于 x 减二。这个代换只是把圆心平移到零，du 等于 dx，于是积分变成根号九减 u 平方的标准形状。',
      },
      {
        id: 'standard-formula',
        label: '套用标准公式',
        rect: [965, 295, 585, 335],
        speech:
          '根号 a 平方减 u 平方的积分，可以看成圆面积公式的一部分。这里 a 等于三，所以标准结果里会出现 arcsine u 除以三。',
      },
      {
        id: 'final-answer',
        label: '换回 x',
        rect: [450, 665, 1100, 160],
        speech:
          '最后把 u 换回 x 减二。注意根号也换回原来的五加四 x 减 x 平方，这样答案才回到原题的变量。',
      },
    ],
  },
  {
    title: '一般形状：∫√(α² − x²) dx 怎么变？',
    steps: [
      {
        id: 'problem',
        label: '一般问题',
        rect: [50, 170, 760, 125],
        speech:
          '这页把刚才的想法抽象出来。只要是 alpha 平方减 x 平方，而且 alpha 大于零，我们就按同一个路线处理。',
      },
      {
        id: 'four-step-flow',
        label: '四步变形',
        rect: [45, 365, 1160, 285],
        speech:
          '四步连在一起看：先选 x 等于 alpha sine theta；再算 dx；再把根号变成 alpha cosine theta；最后整个积分变成 alpha 平方乘 cosine 平方 theta 的积分。',
      },
      {
        id: 'triangle-memory',
        label: '三角形记忆',
        rect: [1225, 180, 320, 520],
        speech:
          '右边这张三角形是记忆工具。斜边是 alpha，对边是 x，邻边就是根号 alpha 平方减 x 平方。它帮我们避免代换以后忘记怎么换回去。',
      },
      {
        id: 'power-reduction',
        label: '剩下是三角积分',
        rect: [55, 700, 1200, 125],
        speech:
          '代换完成后，真正剩下的是 cosine 平方的三角积分。这里通常用降幂公式，把 cosine 平方变成一加 cosine 二 theta 再除以二。',
      },
    ],
  },
  {
    title: '例 2：定积分也要换上下限',
    steps: [
      {
        id: 'problem',
        label: '题目',
        rect: [45, 125, 785, 170],
        speech:
          '这一题是定积分，根号是四减 x 平方，所以 a 等于二。它最重要的检查点是：变量换成 theta 以后，上下限也必须换成 theta。',
      },
      {
        id: 'substitution',
        label: '代换与根号',
        rect: [45, 330, 405, 390],
        speech:
          '按照形状选 x 等于二 sine theta。于是 dx 等于二 cosine theta d theta，根号四减 x 平方变成二 cosine theta。',
      },
      {
        id: 'bounds',
        label: '上下限换成 θ',
        rect: [535, 320, 430, 395],
        speech:
          '接着换上下限：x 等于零时 theta 等于零；x 等于一时，sine theta 等于二分之一，所以 theta 等于 pi over six。',
      },
      {
        id: 'replace-all',
        label: '全换掉并降幂',
        rect: [1040, 320, 500, 395],
        speech:
          '现在把 x 平方、根号和 dx 全部换掉，原积分变成从零到 pi over six 的四 sine 平方 theta。再用 sine 平方的降幂公式。',
      },
      {
        id: 'answer',
        label: '答案',
        rect: [400, 740, 760, 110],
        speech:
          '计算以后得到 pi over three 减根号三除以二。这里可以顺手检查：区间很短，答案是正的，这和原函数为正一致。',
      },
    ],
  },
  {
    title: '例 3：√(x² + 16) 看见 tan',
    steps: [
      {
        id: 'problem',
        label: '题目',
        rect: [40, 120, 620, 150],
        speech:
          '这一题根号是 x 平方加十六，也就是 x 平方加四平方。看到加号形状，我们选 tangent，而不是 sine。',
      },
      {
        id: 'substitution',
        label: 'tan 代换',
        rect: [45, 280, 405, 430],
        speech:
          '令 x 等于四 tangent theta。这样 dx 等于四 secant 平方 theta d theta，而根号 x 平方加十六会变成四 secant theta。',
      },
      {
        id: 'simplify',
        label: '化成 sec 积分',
        rect: [500, 270, 505, 430],
        speech:
          '全换掉以后，积分先变成十六倍 tangent 平方 theta 乘 secant theta。再用 tangent 平方等于 secant 平方减一，变成 secant 三次减 secant。',
      },
      {
        id: 'standard-integrals',
        label: '标准积分',
        rect: [1040, 270, 505, 430],
        speech:
          '这里不需要重新推导 secant 三次的积分，直接使用标准公式。注意这个题真正的难点还是前面的代换和化简。',
      },
      {
        id: 'final-answer',
        label: '反代回 x',
        rect: [110, 720, 1385, 125],
        speech:
          '最后把 secant theta 和 tangent theta 都通过三角形换回 x，得到二分之一 x 根号 x 平方加十六，减八倍对数项，再加 C。',
      },
    ],
  },
  {
    title: '例 4：√(9x² − 1) 看见 sec',
    steps: [
      {
        id: 'problem',
        label: '题目',
        rect: [45, 115, 620, 170],
        speech:
          '最后这题看起来比较吓人，因为有 x 的五次方和根号九 x 平方减一。先只看根号，九 x 平方减一就是三 x 的平方减一。',
      },
      {
        id: 'sec-substitution',
        label: 'sec 代换',
        rect: [25, 300, 465, 385],
        speech:
          '为了把三 x 平方减一变成 secant 平方减一，我们令三 x 等于 secant theta。于是根号九 x 平方减一变成 tangent theta。',
      },
      {
        id: 'bounds',
        label: '换上下限',
        rect: [530, 290, 550, 395],
        speech:
          '这题是定积分，所以接着换上下限。下限根号二除以三给出 secant theta 等于根号二，也就是 theta 等于 pi over four。上限二除以三给出 theta 等于 pi over three。',
      },
      {
        id: 'clean-simplification',
        label: '漂亮化简',
        rect: [1110, 290, 455, 360],
        speech:
          '最漂亮的一步在这里：x 的五次方和 dx 里的 secant tangent 会大量抵消，整个积分变成八十一倍从 pi over four 到 pi over three 的 cosine 四次方。',
      },
      {
        id: 'power-reduction',
        label: '剩下用降幂',
        rect: [115, 720, 1320, 115],
        speech:
          '最后只是计算 cosine 四次方的定积分。用降幂公式把它拆成常数、cosine 二 theta 和 cosine 四 theta，计算就很机械了。',
      },
    ],
  },
  {
    title: '逆换元法总结',
    steps: [
      {
        id: 'five-step-flow',
        label: '五步流程',
        rect: [40, 145, 1520, 375],
        speech:
          '总结时把逆换元法看成五步：看根号形状，选代换，画三角形，全部换掉，算完再换回。只要这五步不乱，大部分题都能稳住。',
      },
      {
        id: 'common-errors',
        label: '常见错误',
        rect: [45, 525, 725, 330],
        speech:
          '常见错误也很固定：漏掉 dx，没有换上下限，secant 和 tangent 选反，或者最后答案还停在 theta。检查时就按这个列表逐项扫。',
      },
      {
        id: 'next-hook',
        label: '下节课钩子',
        rect: [810, 555, 735, 295],
        speech:
          '这节课的钩子留在这里：三角代换能处理很多根号，但不是什么都能解决。下一步我们需要分部积分，以及更强的代数整理能力。',
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
    source: 'imagegen-full-slide-inverse-substitution-from-03-pdf',
    sourcePdf: '/Users/dongpochen/Desktop/2026 Summer/MAT 136/讲义/03_逆换元法.pdf',
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
        name: 'Week 2：逆换元法 · 三角代换',
        description:
          'MAT 136 inverse substitution notebook in image-generated full-slide format. Teaches trig substitution through root-shape recognition, triangles, definite-integral bounds, worked examples, and a summary hook.',
        tags: [
          'MAT136',
          'Inverse Substitution',
          'Trig Substitution',
          '逆换元法',
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
        name: 'Week 2：逆换元法 · 三角代换',
        description:
          'MAT 136 inverse substitution notebook in image-generated full-slide format. Teaches trig substitution through root-shape recognition, triangles, definite-integral bounds, worked examples, and a summary hook.',
        tags: [
          'MAT136',
          'Inverse Substitution',
          'Trig Substitution',
          '逆换元法',
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
