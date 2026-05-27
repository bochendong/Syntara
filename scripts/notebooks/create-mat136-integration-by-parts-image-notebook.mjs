#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { generatedNotebookDir, generatedNotebookPublicPath } from '../shared/paths.mjs';

const NOTEBOOK_ID = 'nb-mat136-integration-by-parts-week2-20260519142600';
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
  '/Users/dongpochen/.codex/generated_images/019e416c-3d64-7843-bacd-a9436ed9d25f/ig_0fcd108200572cfa016a0caa842ae48195a2af616e9c94e0cb.png',
  '/Users/dongpochen/.codex/generated_images/019e416c-3d64-7843-bacd-a9436ed9d25f/ig_0fcd108200572cfa016a0ca8aecd608195a9ae7735c53f50c5.png',
  '/Users/dongpochen/.codex/generated_images/019e416c-3d64-7843-bacd-a9436ed9d25f/ig_0fcd108200572cfa016a0ca8f6cdf081959dd13fd96397302c.png',
  '/Users/dongpochen/.codex/generated_images/019e416c-3d64-7843-bacd-a9436ed9d25f/ig_0fcd108200572cfa016a0ca9977a208195b46d2872ce2d7e78.png',
];

const slides = [
  {
    title: 'MAT 136 · 分部积分',
    steps: [
      {
        id: 'product-rule-origin',
        label: '从乘积法则出发',
        rect: [35, 265, 490, 430],
        speech:
          '分部积分不是凭空来的技巧，而是乘积法则倒过来看。左边先抓住熟悉的事实：两个函数相乘再求导，会分成两项。',
      },
      {
        id: 'reverse-arrangement',
        label: '反过来整理',
        rect: [555, 270, 520, 430],
        speech:
          '把乘积法则积分回来，就得到中间这两行。我们关心的是第一项 u dv，所以把另一项移到右边，得到分部积分公式。',
      },
      {
        id: 'when-to-use',
        label: '什么时候用',
        rect: [1120, 270, 440, 430],
        speech:
          '什么时候想到它？通常是两个函数相乘，其中一个求导以后会变简单，另一个又比较容易积分。',
      },
      {
        id: 'core-choice',
        label: '核心选择',
        rect: [190, 735, 1210, 115],
        speech:
          '所以做题时先别急着算，先分配角色：选 u 去求导，选 dv 去积分。这个角色分配决定后面是否会变简单。',
      },
    ],
  },
  {
    title: '为什么要分部积分？',
    steps: [
      {
        id: 'substitution-stuck',
        label: '换元法卡住',
        rect: [40, 140, 485, 470],
        speech:
          '用 x e 的 x 次方这个例子来看。它是两个因子相乘，如果只想硬套换元，变量并不会被清干净，题目没有真正变轻。',
      },
      {
        id: 'reverse-product-rule',
        label: '倒看乘积求导',
        rect: [550, 140, 475, 440],
        speech:
          '更自然的想法是看整体 x e 的 x 次方。它的微分会同时产生 e 的 x 次方 dx 和 x e 的 x 次方 dx，正好包含原题。',
      },
      {
        id: 'integrate-both-sides',
        label: '两边积分',
        rect: [1060, 140, 500, 440],
        speech:
          '于是把原来的难乘积写成一个乘积结果，减去一个更简单的积分。剩下的 e 的 x 次方就可以直接积分。',
      },
      {
        id: 'two-step-roadmap',
        label: '两步路线图',
        rect: [35, 625, 1500, 250],
        speech:
          '这页的主线可以压缩成两步：先识别乘积，再找到一个合适的乘积导数，把难积分换成更简单的积分。',
      },
    ],
  },
  {
    title: '怎么选 u 和 dv？',
    steps: [
      {
        id: 'parts-table',
        label: '分部积分表',
        rect: [35, 135, 530, 405],
        speech:
          '分部积分通常先写一个小表。这里选 u 等于 x，因为它求导会变成一；选 dv 等于 e 的 x 次方 dx，因为它很容易积分。',
      },
      {
        id: 'u-principle',
        label: '选 u 的原则',
        rect: [600, 135, 450, 405],
        speech:
          '选 u 的核心原则是：求导之后要更简单。对数、反三角函数、多项式常常适合放在 u 的位置。',
      },
      {
        id: 'liate-guide',
        label: 'LIATE 小指南',
        rect: [1080, 135, 465, 405],
        speech:
          'LIATE 是一个选 u 的优先级提醒：log、inverse trig、algebraic、trig、exponential。它是指南，不是死规则。',
      },
      {
        id: 'choice-check',
        label: '选择检查点',
        rect: [45, 555, 1505, 320],
        speech:
          '真正的检查点在底部：dv 必须真的会积分，du 必须真的让题目变轻。如果选完以后剩下的积分更复杂，就要回头重选。',
      },
    ],
  },
  {
    title: '例题：∫ x cos x dx',
    steps: [
      {
        id: 'problem-and-choice',
        label: '题目与角色分配',
        rect: [55, 115, 530, 425],
        speech:
          '现在做完整例题：计算 x 乘 cosine x 的积分。让 u 等于 x，dv 等于 cosine x dx，因为 x 求导变简单，而 cosine 容易积分成 sine。',
      },
      {
        id: 'apply-formula',
        label: '套分部积分公式',
        rect: [675, 150, 655, 335],
        speech:
          '把表里的四个量放进公式，得到 x sine x 减去 sine x 的积分。这里一定要保留前面的减号。',
      },
      {
        id: 'remaining-integral',
        label: '算剩下的积分',
        rect: [600, 505, 735, 285],
        speech:
          '最后处理剩下的积分。sin x 的积分是负 cos x，所以前面再减一次，负负得正，得到加 cos x。',
      },
      {
        id: 'sign-warning',
        label: '符号易错点',
        rect: [35, 615, 430, 220],
        speech:
          '这题最容易错的地方就是最后的符号。答案是 x sine x 加 cosine x 加 C，不是减 cosine x。',
      },
      {
        id: 'next-hook',
        label: '下节钩子',
        rect: [1280, 610, 300, 220],
        speech:
          '最后留一个钩子：如果分部积分做一次还不够，下一步该怎么办？下一批可以讲重复分部积分和表格法。',
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

  for (const [index, source] of sourceImages.entries()) {
    if (!fs.existsSync(source)) throw new Error(`Missing generated image: ${source}`);
    await sharp(source)
      .resize(SOURCE_WIDTH, SOURCE_HEIGHT, { fit: 'cover', position: 'center' })
      .png()
      .toFile(path.join(OUTPUT_DIR, `slide-${String(index + 1).padStart(2, '0')}.png`));
  }

  const hitMap = {
    notebookId: NOTEBOOK_ID,
    source: 'imagegen-full-slide-integration-by-parts-week2',
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
        name: 'Week 2：分部积分 · 乘积法则倒过来',
        description:
          'MAT 136 Week 2 integration by parts notebook in image-generated full-slide format. Covers the product-rule origin, why substitution gets stuck, choosing u and dv, and a first worked example with semantic spotlight regions.',
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
        name: 'Week 2：分部积分 · 乘积法则倒过来',
        description:
          'MAT 136 Week 2 integration by parts notebook in image-generated full-slide format. Covers the product-rule origin, why substitution gets stuck, choosing u and dv, and a first worked example with semantic spotlight regions.',
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
