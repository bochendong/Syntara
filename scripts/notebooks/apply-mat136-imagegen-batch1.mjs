#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { generatedNotebookDir, generatedNotebookPublicPath } from '../shared/paths.mjs';

const NOTEBOOK_ID = 'nb-mat136-riemann-sums-week1-20260518162551';
const COURSE_ID = 'cmpanemia001v8ouzmhttvkrn';
const OUTPUT_DIR = generatedNotebookDir(NOTEBOOK_ID);
const PUBLIC_DIR = generatedNotebookPublicPath(NOTEBOOK_ID);
const NOW = new Date();
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;
const SOURCE_WIDTH = 1600;
const SOURCE_HEIGHT = 900;
const HOTSPOT_PATH = 'M 0 0 L 200 0 L 200 200 L 0 200 Z';

const IMAGEGEN_DIR =
  '/Users/dongpochen/.codex/generated_images/019e3bde-a8aa-75c0-a656-942c58162092';

const sourceImages = [
  `${IMAGEGEN_DIR}/ig_00d7adbca787e46e016a0b43ab64608197a794d33d177e17e5.png`,
  `${IMAGEGEN_DIR}/ig_00d7adbca787e46e016a0b442fbe988197bd5afb00043f311b.png`,
  `${IMAGEGEN_DIR}/ig_00d7adbca787e46e016a0b446d6e088197be63e902e1fcb6c9.png`,
  `${IMAGEGEN_DIR}/ig_00d7adbca787e46e016a0b44ebcb488197bf82b7166e3c8bfa.png`,
];

const slides = [
  {
    title: '面积为什么代表累积量？',
    steps: [
      {
        id: 'constant-rectangle',
        label: '恒定速度的面积模型',
        rect: [95, 158, 590, 265],
        speech:
          '先抓住最简单的事实：速度固定时，路程等于速度乘时间。放在速度时间图上，这不是新的规则，就是这个矩形的面积。',
      },
      {
        id: 'changing-velocity',
        label: '变化速度需要近似',
        rect: [845, 150, 600, 270],
        speech:
          '真正的难点是速度在变。我们没有一个统一高度，就把时间切得很细，让每一小段暂时看作近似恒定。',
      },
      {
        id: 'many-rectangles',
        label: '多个小矩形累加',
        rect: [205, 455, 645, 260],
        speech: '于是每个小矩形给出一小段累积量近似，所有矩形加起来，就是整段路程或面积的近似。',
      },
      {
        id: 'main-idea',
        label: '黎曼和主线',
        rect: [100, 738, 1410, 95],
        speech: '这就是黎曼和的主线：用可计算的矩形面积，逼近弯曲图像下方的累积量。',
      },
    ],
  },
  {
    title: 'Riemann Sum 的标准结构',
    steps: [
      {
        id: 'partition',
        label: '区间分割与宽度',
        rect: [120, 160, 605, 190],
        speech:
          '第一步是分割区间。把从 a 到 b 的总长度平均切成 n 份，每一份的宽度就是 delta x 等于 b 减 a 再除以 n。',
      },
      {
        id: 'sample-points',
        label: '采样点决定高度',
        rect: [865, 150, 560, 330],
        speech: '第二步是在每个小区间里选一个采样点 c_i。函数值 f(c_i) 就是这一段矩形的高度。',
      },
      {
        id: 'sum-formula',
        label: '黎曼和公式',
        rect: [100, 505, 690, 150],
        speech: '所以每个矩形面积是 f(c_i) 乘 delta x。把 i 从 1 加到 n，就得到标准的黎曼和。',
      },
      {
        id: 'choice-matters',
        label: '选点方式影响近似',
        rect: [825, 545, 620, 190],
        speech:
          '注意：左端点、右端点、中点都只是不同的采样规则。规则不同，近似值会变，但结构都是高度乘宽度再求和。',
      },
    ],
  },
  {
    title: 'Left-hand vs Right-hand',
    steps: [
      {
        id: 'left-graph',
        label: '左端点矩形',
        rect: [75, 170, 685, 370],
        speech:
          '左端点和的采样点永远在每个小区间左侧。对递增函数来说，左边高度比这一段后面的函数值低。',
      },
      {
        id: 'right-graph',
        label: '右端点矩形',
        rect: [845, 165, 650, 370],
        speech:
          '右端点和则用每段右侧的高度。递增时右端点站在这一小段最高的位置，所以矩形会整体偏高。',
      },
      {
        id: 'left-formula',
        label: '左端点和公式',
        rect: [105, 618, 640, 120],
        speech: '公式上，左端点和用的是 x_0 到 x_{n-1} 这些左边界的函数值。',
      },
      {
        id: 'right-formula',
        label: '右端点和公式',
        rect: [850, 620, 620, 120],
        speech:
          '右端点和用的是 x_1 到 x_n 这些右边界的函数值。两者只差采样点，但估计方向可能完全不同。',
      },
      {
        id: 'compare-rule',
        label: '比较规则',
        rect: [200, 775, 1200, 80],
        speech:
          '所以判断高估低估时，不要死记左或右。先看函数单调性，再看采样点落在每段的低处还是高处。',
      },
    ],
  },
  {
    title: '高估 / 低估：看单调性',
    steps: [
      {
        id: 'increasing-left-low',
        label: '递增左端点低估',
        rect: [55, 155, 735, 270],
        speech:
          '先看递增函数。每一段左端点都在这一小段的较低位置，所以矩形大多落在曲线下方，左端点和低估真实面积。',
      },
      {
        id: 'increasing-right-high',
        label: '递增右端点高估',
        rect: [815, 155, 735, 270],
        speech: '还是递增函数，右端点在每段较高位置，矩形盖过曲线，因此右端点和高估真实面积。',
      },
      {
        id: 'decreasing-left-high',
        label: '递减左端点高估',
        rect: [55, 435, 735, 260],
        speech: '换成递减函数，左端点反而是每段较高位置，所以左端点和高估。',
      },
      {
        id: 'decreasing-right-low',
        label: '递减右端点低估',
        rect: [815, 435, 735, 260],
        speech:
          '递减函数的右端点在每段较低位置，所以右端点和低估。四种情况其实都来自同一个判断：高度在曲线上方还是下方。',
      },
      {
        id: 'inequalities',
        label: '不等式总结',
        rect: [90, 700, 1425, 88],
        speech:
          '总结成不等式：递增时 L_n 小于等于真实面积，小于等于 R_n；递减时顺序反过来，R_n 小于等于真实面积，小于等于 L_n。',
      },
      {
        id: 'next-hook',
        label: '下节课钩子',
        rect: [230, 815, 1130, 70],
        speech:
          '最后留下一个问题：当 n 越来越大，矩形越来越窄时，左端点和与右端点和会不会稳定到同一个数？下节课这个数就会变成定积分。',
      },
    ],
  },
];

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
    name: `svg-hotspot: ${step.label}`,
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

function hotspotElements(order) {
  return slides[order].steps.map((step) => hotspotElement(order, step));
}

function actionsFor(order) {
  const page = String(order + 1).padStart(2, '0');
  return slides[order].steps.flatMap((step, index) => [
    {
      id: `${NOTEBOOK_ID}-spotlight-s${page}-${String(index + 1).padStart(2, '0')}`,
      type: 'spotlight',
      elementId: `${NOTEBOOK_ID}-s${page}-${step.id}`,
      title: step.label,
      dimOpacity: 0.76,
    },
    {
      id: `${NOTEBOOK_ID}-speech-s${page}-${String(index + 1).padStart(2, '0')}`,
      type: 'speech',
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
      themeColors: ['#0f766e', '#2563eb', '#ef4444', '#f97316', '#0f172a'],
      fontColor: '#0f172a',
      fontName: 'Inter',
      outline: { color: '#0f766e', width: 2, style: 'solid' },
      shadow: { h: 0, v: 0, blur: 10, color: '#000000' },
    },
    elements: [imageElement(order), ...hotspotElements(order)],
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
      .resize(1600, 900, { fit: 'cover', position: 'center' })
      .png()
      .toFile(path.join(OUTPUT_DIR, `slide-${String(index + 1).padStart(2, '0')}.png`));
  }

  const composites = [];
  for (const [index] of sourceImages.entries()) {
    const file = path.join(OUTPUT_DIR, `slide-${String(index + 1).padStart(2, '0')}.png`);
    const labelSvg = `<svg width="400" height="42" xmlns="http://www.w3.org/2000/svg"><rect width="400" height="42" fill="#0f172a"/><text x="16" y="28" fill="#ffffff" font-size="19" font-family="Arial">${index + 1}. direct imagegen slide</text></svg>`;
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
      height: 534,
      channels: 4,
      background: '#e5e7eb',
    },
  })
    .composite(composites)
    .png()
    .toFile(path.join(OUTPUT_DIR, 'contact-sheet.png'));
}

async function updateNotebook() {
  loadEnvLocal();
  const prisma = new PrismaClient();
  try {
    const notebook = await prisma.notebook.findUnique({ where: { id: NOTEBOOK_ID } });
    if (!notebook) throw new Error(`Notebook not found: ${NOTEBOOK_ID}`);
    if (notebook.courseId !== COURSE_ID) {
      throw new Error(`Notebook is not attached to expected course: ${notebook.courseId}`);
    }

    await prisma.notebook.update({
      where: { id: NOTEBOOK_ID },
      data: {
        name: 'Week 1：黎曼和与面积近似 · 生图 + SVG 定位',
        description:
          'MAT 136 Week 1 Riemann sums notebook. The first four pages are direct generated slide images with transparent SVG hotspot layers for spotlight-based teaching; definite integral content is intentionally left for the next lesson.',
        style: 'direct-imagegen-slide-svg-hotspots',
        updatedAt: NOW,
      },
    });

    const existing = await prisma.scene.findMany({
      where: { notebookId: NOTEBOOK_ID },
      orderBy: { order: 'asc' },
      select: { id: true },
    });

    await prisma.$transaction(
      slides.map((slide, index) => {
        const content = {
          type: 'slide',
          canvas: canvasFor(index),
          webRenderMode: 'slide',
        };
        const actions = actionsFor(index);
        const id = existing[index]?.id || `${NOTEBOOK_ID}-p${String(index + 1).padStart(2, '0')}`;
        return prisma.scene.upsert({
          where: { id },
          update: {
            title: slide.title,
            order: index,
            type: 'slide',
            content,
            actions,
            whiteboard: null,
            updatedAt: NOW,
          },
          create: {
            id,
            notebookId: NOTEBOOK_ID,
            title: slide.title,
            order: index,
            type: 'slide',
            content,
            actions,
            whiteboard: null,
            createdAt: NOW,
            updatedAt: NOW,
          },
        });
      }),
    );

    if (existing.length > slides.length) {
      await prisma.scene.deleteMany({
        where: {
          notebookId: NOTEBOOK_ID,
          id: { in: existing.slice(slides.length).map((scene) => scene.id) },
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

await renderSlides();
await updateNotebook();

console.log(
  JSON.stringify(
    {
      notebookId: NOTEBOOK_ID,
      slides: slides.length,
      outputDir: OUTPUT_DIR,
      source: 'direct-imagegen-slides-svg-hotspots',
    },
    null,
    2,
  ),
);
