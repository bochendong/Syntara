#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { generatedNotebookDir, generatedNotebookPublicPath } from '../shared/paths.mjs';

const SOURCE_NOTEBOOK_ID = 'nb-mat136-inverse-substitution-week2-20260519011900';
const NOTEBOOK_ID = 'nb-mat136-inverse-substitution-week2-v2-20260519174000';
const COURSE_ID = 'cmpanemia001v8ouzmhttvkrn';
const SOURCE_DIR = generatedNotebookDir(SOURCE_NOTEBOOK_ID);
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

const insertedSlides = [
  {
    title: '为什么普通换元会卡住？',
    source:
      '/Users/dongpochen/.codex/generated_images/019e416c-3d64-7843-bacd-a9436ed9d25f/ig_0fcd108200572cfa016a0cd8b03f288195864b4d554296e068.png',
    steps: [
      {
        id: 'ordinary-substitution',
        label: '换元法擅长的形状',
        rect: [20, 180, 460, 510],
        speech:
          '先回忆普通换元法擅长什么：它喜欢看到一个内层函数，以及这个内层函数的导数在旁边。左边这个例子里，x 平方加一的导数二 x 就在外面。',
      },
      {
        id: 'radicals-do-not-cooperate',
        label: '根号不配合',
        rect: [520, 180, 510, 510],
        speech:
          '但逆换元法要处理的根号不太配合。像 a 平方减 x 平方、a 平方加 x 平方、x 平方减 a 平方，没有一个简单的内层导数能直接把根号清掉。',
      },
      {
        id: 'theta-idea',
        label: '换成 theta 的新想法',
        rect: [1060, 180, 520, 510],
        speech:
          '所以今天的新想法不是硬找 u，而是换成 theta。目标是让根号形状碰上三角恒等式，自己变成好算的三角函数。',
      },
      {
        id: 'opening-question',
        label: '本节课问题',
        rect: [35, 750, 1520, 110],
        speech:
          '这一页只提出问题：能不能选一个代换，让根号自己变简单？下一页我们先把这些根号形状框出来。',
      },
    ],
  },
  {
    title: '这类根号到底在问什么？',
    source:
      '/Users/dongpochen/.codex/generated_images/019e416c-3d64-7843-bacd-a9436ed9d25f/ig_0fcd108200572cfa016a0cd914e8dc8195a76f2d60513c0ea5.png',
    steps: [
      {
        id: 'radical-shapes',
        label: '三种根号形状',
        rect: [35, 170, 440, 540],
        speech:
          '先不要背代换表，先看根号里的形状。关键是分清谁减谁、谁在外面：a 平方减 x 平方、a 平方加 x 平方、x 平方减 a 平方。',
      },
      {
        id: 'trig-identities',
        label: '三角恒等式',
        rect: [520, 160, 460, 540],
        speech:
          '中间这三条恒等式就是工具箱。一减 sine 平方变 cosine 平方，一加 tangent 平方变 secant 平方，secant 平方减一变 tangent 平方。',
      },
      {
        id: 'matching-task',
        label: '把形状配到恒等式',
        rect: [1010, 160, 545, 540],
        speech:
          '下一步就是做匹配：每一种根号形状，都要配到一条能消掉根号的恒等式。下一页的三种代换表，其实就是这个匹配结果。',
      },
      {
        id: 'strategy',
        label: '策略',
        rect: [95, 755, 1400, 105],
        speech:
          '所以逆换元法的策略是：先识别形状，再选择能消掉根号的代换。这个顺序比直接背表更稳。',
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

function pageLabel(order) {
  return String(order + 1).padStart(2, '0');
}

function toCanvasRect([x, y, width, height]) {
  return {
    left: (x / SOURCE_WIDTH) * CANVAS_WIDTH,
    top: (y / SOURCE_HEIGHT) * CANVAS_HEIGHT,
    width: (width / SOURCE_WIDTH) * CANVAS_WIDTH,
    height: (height / SOURCE_HEIGHT) * CANVAS_HEIGHT,
  };
}

function imageElement(order) {
  const page = pageLabel(order);
  return {
    id: `${NOTEBOOK_ID}-image-${page}`,
    type: 'image',
    left: 0,
    top: 0,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    rotate: 0,
    fixedRatio: false,
    src: `${PUBLIC_DIR}/slide-${page}.png`,
    imageType: 'pageFigure',
    radius: 0,
  };
}

function hotspotElement(order, step) {
  const page = pageLabel(order);
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

function semanticHitMapForInserted(order, slide) {
  return {
    version: 1,
    sourceSize: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT },
    canvasSize: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    regions: slide.steps.map((step) => ({
      id: `${NOTEBOOK_ID}-s${pageLabel(order)}-${step.id}`,
      semanticId: step.id,
      label: step.label,
      sourceRect: step.rect,
      canvasRect: toCanvasRect(step.rect),
    })),
  };
}

function actionsForInserted(order, slide) {
  const page = pageLabel(order);
  return slide.steps.flatMap((step, index) => [
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

function canvasForInserted(order, slide) {
  return {
    id: `${NOTEBOOK_ID}-canvas-${pageLabel(order)}`,
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
    elements: [imageElement(order), ...slide.steps.map((step) => hotspotElement(order, step))],
    background: { type: 'solid', color: '#ffffff' },
    type: 'content',
  };
}

function remapStringIds(input, oldPage, newPage) {
  return input
    .replaceAll(SOURCE_NOTEBOOK_ID, NOTEBOOK_ID)
    .replaceAll(`-image-${oldPage}`, `-image-${newPage}`)
    .replaceAll(`-canvas-${oldPage}`, `-canvas-${newPage}`)
    .replaceAll(`-s${oldPage}-`, `-s${newPage}-`)
    .replaceAll(`slide-${oldPage}.png`, `slide-${newPage}.png`);
}

function remapJson(value, oldPage, newPage) {
  return JSON.parse(remapStringIds(JSON.stringify(value), oldPage, newPage));
}

function setCanvasImageSrc(content, order) {
  const elements = content?.canvas?.elements;
  if (!Array.isArray(elements)) return;
  const image = elements.find((element) => element?.type === 'image');
  if (image) {
    image.src = `${PUBLIC_DIR}/slide-${pageLabel(order)}.png`;
  }
}

async function renderSlides() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const fileName of fs.readdirSync(OUTPUT_DIR)) {
    if (/^slide-\d+\.png$/.test(fileName) || fileName === 'contact-sheet.png') {
      fs.unlinkSync(path.join(OUTPUT_DIR, fileName));
    }
  }

  const sources = [
    path.join(SOURCE_DIR, 'slide-01.png'),
    insertedSlides[0].source,
    insertedSlides[1].source,
    ...Array.from({ length: 8 }, (_, index) =>
      path.join(SOURCE_DIR, `slide-${String(index + 2).padStart(2, '0')}.png`),
    ),
  ];

  for (const [index, source] of sources.entries()) {
    if (!fs.existsSync(source)) throw new Error(`Missing source image: ${source}`);
    await sharp(source)
      .resize(SOURCE_WIDTH, SOURCE_HEIGHT, { fit: 'cover', position: 'center' })
      .png()
      .toFile(path.join(OUTPUT_DIR, `slide-${pageLabel(index)}.png`));
  }
}

async function buildSceneData(prisma) {
  const sourceScenes = await prisma.scene.findMany({
    where: { notebookId: SOURCE_NOTEBOOK_ID },
    orderBy: { order: 'asc' },
  });
  if (sourceScenes.length !== 9) {
    throw new Error(`Expected 9 source scenes, found ${sourceScenes.length}`);
  }

  const scenes = [];

  const coverContent = remapJson(sourceScenes[0].content, '01', '01');
  setCanvasImageSrc(coverContent, 0);
  scenes.push({
    id: `${NOTEBOOK_ID}-p01`,
    notebookId: NOTEBOOK_ID,
    title: sourceScenes[0].title,
    type: 'slide',
    order: 0,
    content: coverContent,
    actions: [],
    whiteboard: null,
    createdAt: NOW,
    updatedAt: NOW,
  });

  for (const [insertIndex, slide] of insertedSlides.entries()) {
    const order = insertIndex + 1;
    const content = {
      type: 'slide',
      canvas: canvasForInserted(order, slide),
      webRenderMode: 'slide',
      semanticHitMap: semanticHitMapForInserted(order, slide),
    };
    scenes.push({
      id: `${NOTEBOOK_ID}-p${pageLabel(order)}`,
      notebookId: NOTEBOOK_ID,
      title: slide.title,
      type: 'slide',
      order,
      content,
      actions: actionsForInserted(order, slide),
      whiteboard: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
  }

  for (let sourceIndex = 1; sourceIndex < sourceScenes.length; sourceIndex += 1) {
    const sourceScene = sourceScenes[sourceIndex];
    const order = sourceIndex + 2;
    const oldPage = String(sourceIndex + 1).padStart(2, '0');
    const newPage = pageLabel(order);
    const content = remapJson(sourceScene.content, oldPage, newPage);
    setCanvasImageSrc(content, order);
    scenes.push({
      id: `${NOTEBOOK_ID}-p${newPage}`,
      notebookId: NOTEBOOK_ID,
      title: sourceScene.title,
      type: 'slide',
      order,
      content,
      actions: remapJson(sourceScene.actions || [], oldPage, newPage),
      whiteboard: sourceScene.whiteboard,
      createdAt: NOW,
      updatedAt: NOW,
    });
  }

  return scenes;
}

async function renderMetadataAssets(scenes) {
  const hitMap = {
    notebookId: NOTEBOOK_ID,
    source: 'imagegen-full-slide-inverse-substitution-v2-with-introduction-hooks',
    sourceNotebookId: SOURCE_NOTEBOOK_ID,
    slides: scenes.map((scene, index) => ({
      order: index,
      title: scene.title,
      image: `${PUBLIC_DIR}/slide-${pageLabel(index)}.png`,
      hitMap: scene.content.semanticHitMap || {
        version: 1,
        sourceSize: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT },
        canvasSize: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
        regions: [],
      },
    })),
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'semantic-hit-map.json'), JSON.stringify(hitMap, null, 2));

  const columns = 2;
  const thumbWidth = 400;
  const thumbHeight = 225;
  const labelHeight = 42;
  const cellHeight = thumbHeight + labelHeight;
  const composites = [];
  for (const [index, scene] of scenes.entries()) {
    const file = path.join(OUTPUT_DIR, `slide-${pageLabel(index)}.png`);
    const labelSvg = `<svg width="${thumbWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="${thumbWidth}" height="${labelHeight}" fill="#0f172a"/><text x="16" y="28" fill="#ffffff" font-size="18" font-family="Arial">${index + 1}. ${esc(scene.title)}</text></svg>`;
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
      height: Math.ceil(scenes.length / columns) * cellHeight,
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
    const sourceNotebook = await prisma.notebook.findUnique({ where: { id: SOURCE_NOTEBOOK_ID } });
    if (!sourceNotebook) throw new Error(`Source notebook not found: ${SOURCE_NOTEBOOK_ID}`);

    const scenes = await buildSceneData(prisma);
    await renderMetadataAssets(scenes);

    await prisma.notebook.upsert({
      where: { id: NOTEBOOK_ID },
      update: {
        ownerId: course.ownerId,
        courseId: course.id,
        name: 'Week 2：逆换元法 · 引入重排版',
        description:
          'MAT 136 inverse substitution notebook in image-generated full-slide format. V2 adds introduction hooks before the substitution table: why ordinary u-substitution gets stuck, and how radical shapes map to trig identities.',
        tags: [
          'MAT136',
          'Inverse Substitution',
          'Trig Substitution',
          '逆换元法',
          'introduction-hook',
          'semantic-hit-map',
        ],
        avatarUrl: sourceNotebook.avatarUrl,
        language: 'zh-CN',
        style: 'imagegen-full-slide-semantic-hit-map',
        updatedAt: NOW,
      },
      create: {
        id: NOTEBOOK_ID,
        ownerId: course.ownerId,
        courseId: course.id,
        name: 'Week 2：逆换元法 · 引入重排版',
        description:
          'MAT 136 inverse substitution notebook in image-generated full-slide format. V2 adds introduction hooks before the substitution table: why ordinary u-substitution gets stuck, and how radical shapes map to trig identities.',
        tags: [
          'MAT136',
          'Inverse Substitution',
          'Trig Substitution',
          '逆换元法',
          'introduction-hook',
          'semantic-hit-map',
        ],
        avatarUrl: sourceNotebook.avatarUrl,
        language: 'zh-CN',
        style: 'imagegen-full-slide-semantic-hit-map',
        createdAt: NOW,
        updatedAt: NOW,
      },
    });

    await prisma.$transaction([
      prisma.scene.deleteMany({ where: { notebookId: NOTEBOOK_ID } }),
      prisma.scene.createMany({ data: scenes }),
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
