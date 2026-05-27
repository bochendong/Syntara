#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { generatedNotebookDir, generatedNotebookPublicPath } from '../shared/paths.mjs';

const NOTEBOOK_ID = 'nb-cpsc107-recursion-bst-imagegen-20260522';
const COURSE_ID = process.env.CPSC107_COURSE_ID || 'cmpc9dqgv000p8ogmrsjl5co8';
const OUTPUT_DIR = generatedNotebookDir(NOTEBOOK_ID);
const PUBLIC_DIR = generatedNotebookPublicPath(NOTEBOOK_ID);
const SOURCE_WIDTH = 1600;
const SOURCE_HEIGHT = 900;
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;
const HOTSPOT_PATH = 'M 0 0 L 200 0 L 200 200 L 0 200 Z';

const slides = [
  {
    title: '递归先从公式加 base case',
    intent: '建立整章路线：先用阶乘和 Fibonacci 认识递归，再回到 list、helper、BST。',
    source:
      '/Users/dongpochen/.codex/generated_images/019e4728-6509-7983-8486-a7a68237847f/ig_08f24da1389d63bb016a0fe25884b88197bf5d189479c3bf44.png',
  },
  {
    title: '阶乘先写更小的问题',
    intent: '先只看递推关系，让学生看到当前问题如何变成更小的问题。',
    source:
      '/Users/dongpochen/.codex/generated_images/019e4728-6509-7983-8486-a7a68237847f/ig_0f8d7312aa06bafb016a0fedb208d8819397830cbfc31ea09d.png',
  },
  {
    title: '没有 base case 会不会停',
    intent: '用阶乘的错误版本制造问题：递归会继续往负数走，永远没有停止点。',
    source:
      '/Users/dongpochen/.codex/generated_images/019e4728-6509-7983-8486-a7a68237847f/ig_08f24da1389d63bb016a0fe2b152548197a1d050de2036804d.png',
  },
  {
    title: '阶乘加上 base case',
    intent: '把递归核心压成 recurrence plus base case。',
    source:
      '/Users/dongpochen/.codex/generated_images/019e4728-6509-7983-8486-a7a68237847f/ig_08f24da1389d63bb016a0fe314c1a881978c29cbcbbd01d91b.png',
  },
  {
    title: 'Fibonacci 一个 base case 不够',
    intent: '让学生看到 base case 数量由 recurrence 决定。',
    source:
      '/Users/dongpochen/.codex/generated_images/019e4728-6509-7983-8486-a7a68237847f/ig_08f24da1389d63bb016a0fe370a67c81978d342f2dc2a967a8.png',
  },
  {
    title: 'Fibonacci 需要两个 base cases',
    intent: '用递归树说明每条分支都必须能停在 base case。',
    source:
      '/Users/dongpochen/.codex/generated_images/019e4728-6509-7983-8486-a7a68237847f/ig_08f24da1389d63bb016a0fe3c95fe48197b5009182e419c44b.png',
  },
  {
    title: '回到 list：empty 就是 base case',
    intent: '把数学递归桥接回数据递归：rest 是更小的问题。',
    source:
      '/Users/dongpochen/.codex/generated_images/019e4728-6509-7983-8486-a7a68237847f/ig_08f24da1389d63bb016a0fe427242c81979e7e64945ae267d6.png',
  },
  {
    title: 'ListOfInteger 的 self-reference 在 rest',
    intent: '看清 ListOfInteger 的递归位置，不把 cons 的两个槽混在一起。',
    source:
      '/Users/dongpochen/.codex/generated_images/019e4728-6509-7983-8486-a7a68237847f/ig_08f24da1389d63bb016a0fde63cff081979fa9d29b6d764705.png',
  },
  {
    title: 'List template：两个 case 一个 recursive call',
    intent: '把 empty 和 cons 两个分支对应到模板里的代码位置。',
    source:
      '/Users/dongpochen/.codex/generated_images/019e4728-6509-7983-8486-a7a68237847f/ig_08f24da1389d63bb016a0fdeac07788197978acf2b5819af97.png',
  },
  {
    title: '递归 trace：一次处理一个元素',
    intent: '在写具体函数前先训练 current first 和 remaining rest 的 mental model。',
    source:
      '/Users/dongpochen/.codex/generated_images/019e4728-6509-7983-8486-a7a68237847f/ig_08f24da1389d63bb016a0fdfc316408197a0db3c73ad2ad797.png',
  },
  {
    title: 'Helper problem：先看函数要产出什么',
    intent: '从 package-required-dims 的期望输出出发，而不是直接把 helper 代码塞给学生。',
    source:
      '/Users/dongpochen/.codex/generated_images/019e4728-6509-7983-8486-a7a68237847f/ig_08f24da1389d63bb016a0fe01bbd2881979f7da6853358df0d.png',
  },
  {
    title: '三个数据定义，三个职责',
    intent: '区分 Gift、Package、Dimensions 各自知道什么。',
    source:
      '/Users/dongpochen/.codex/generated_images/019e4728-6509-7983-8486-a7a68237847f/ig_08f24da1389d63bb016a0fe070a1ac8197a9328bb3265fee38.png',
  },
  {
    title: 'Package 不知道 ball 或 block 的细节',
    intent: '让 helper 的必要性从数据定义里自然出现。',
    source:
      '/Users/dongpochen/.codex/generated_images/019e4728-6509-7983-8486-a7a68237847f/ig_08f24da1389d63bb016a0fe0d318cc8197b81b0930c754c362.png',
  },
  {
    title: 'Template helper：Package 调用 Gift',
    intent: '区分模板里的 helper call 和最终真实函数里的 helper call。',
    source:
      '/Users/dongpochen/.codex/generated_images/019e4728-6509-7983-8486-a7a68237847f/ig_08f24da1389d63bb016a0fe57e54288197a40b3cd9e4a7b425.png',
  },
  {
    title: 'Outer function 只拆掉 Package 外壳',
    intent: '说明 package-required-dims 的工作只是取 contents 并交给 Gift helper。',
    source:
      '/Users/dongpochen/.codex/generated_images/019e4728-6509-7983-8486-a7a68237847f/ig_08f24da1389d63bb016a0fe5cacae08197b0afb46db1ab2f6d.png',
  },
  {
    title: 'Gift helper：ball 分支',
    intent: '单独讲 ball 的盒子尺寸为什么要用 diameter。',
    source:
      '/Users/dongpochen/.codex/generated_images/019e4728-6509-7983-8486-a7a68237847f/ig_08f24da1389d63bb016a0fe6331d6c81978d60095d615c8bb8.png',
  },
  {
    title: 'Gift helper：block 分支',
    intent: '单独讲 block 已经有 width、length、height，可以直接组成 dims。',
    source:
      '/Users/dongpochen/.codex/generated_images/019e4728-6509-7983-8486-a7a68237847f/ig_08f24da1389d63bb016a0fe6918ee48197b0bb2150a9b048f1.png',
  },
  {
    title: 'Trace：block 例子跨过 helper 边界',
    intent: '把 outer function 和 gift helper 串成一条执行链。',
    source:
      '/Users/dongpochen/.codex/generated_images/019e4728-6509-7983-8486-a7a68237847f/ig_08f24da1389d63bb016a0fe6f3b7488197aaf986f36ab1dce8.png',
  },
  {
    title: 'Trace：ball 分支单独看',
    intent: '防止学生误以为 helper 只是在 block 情况下有用。',
    source:
      '/Users/dongpochen/.codex/generated_images/019e4728-6509-7983-8486-a7a68237847f/ig_08f24da1389d63bb016a0fe75b21a08197822aa06e7d31fb83.png',
  },
  {
    title: '从 list 到 tree：递归可以分叉',
    intent: '从一个 rest 过渡到 left 和 right 两个递归方向。',
    source:
      '/Users/dongpochen/.codex/generated_images/019e4728-6509-7983-8486-a7a68237847f/ig_0f8d7312aa06bafb016a0fe88e786c8193842c4de4f3901b48.png',
  },
  {
    title: 'BST 数据形状：false 或 node',
    intent: '按 PDF 的三字段 node 讲清楚 BST 的 base case 和 self-reference。',
    source:
      '/Users/dongpochen/.codex/generated_images/019e4728-6509-7983-8486-a7a68237847f/ig_0f8d7312aa06bafb016a0feb9fd54c8193839b61bd82d74f6d.png',
  },
  {
    title: 'BST invariant：左小右大',
    intent: '说明 lookup-key 为什么能跳过不可能的子树。',
    source:
      '/Users/dongpochen/.codex/generated_images/019e4728-6509-7983-8486-a7a68237847f/ig_0f8d7312aa06bafb016a0fe90945808193bcf876c625c23171.png',
  },
  {
    title: '用 make-node 读出一棵 BST',
    intent: '按 key、left subtree、right subtree 的顺序读 make-node。',
    source:
      '/Users/dongpochen/.codex/generated_images/019e4728-6509-7983-8486-a7a68237847f/ig_0f8d7312aa06bafb016a0febe36a4881939ae4c306bcd5b937.png',
  },
  {
    title: 'lookup-key 的 base case：空树找不到',
    intent: '先隔离 false 情况，明确它是停止并返回 false 的地方。',
    source:
      '/Users/dongpochen/.codex/generated_images/019e4728-6509-7983-8486-a7a68237847f/ig_0f8d7312aa06bafb016a0fecd6634881939ebdd1c3fa145cc4.png',
  },
  {
    title: 'lookup-key 的三路选择',
    intent: '拆开 equal、less、greater 三种情况，避免嵌套 cond 一页塞太满。',
    source:
      '/Users/dongpochen/.codex/generated_images/019e4728-6509-7983-8486-a7a68237847f/ig_0f8d7312aa06bafb016a0fec3acc5481939b99a5f95860ec21.png',
  },
  {
    title: 'trace：lookup-key 只走一条路',
    intent: '用一条高亮 search path 说明 BST lookup 不会访问每个节点。',
    source:
      '/Users/dongpochen/.codex/generated_images/019e4728-6509-7983-8486-a7a68237847f/ig_0f8d7312aa06bafb016a0fec87b58c819382fb92afc67dc4d8.png',
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

function pageLabel(order) {
  return String(order + 1).padStart(2, '0');
}

function slidePath(order) {
  return path.join(OUTPUT_DIR, `slide-${pageLabel(order)}.png`);
}

function publicSlidePath(order) {
  return `${PUBLIC_DIR}/slide-${pageLabel(order)}.png`;
}

function toCanvasRect([x, y, width, height]) {
  return {
    left: (x / SOURCE_WIDTH) * CANVAS_WIDTH,
    top: (y / SOURCE_HEIGHT) * CANVAS_HEIGHT,
    width: (width / SOURCE_WIDTH) * CANVAS_WIDTH,
    height: (height / SOURCE_HEIGHT) * CANVAS_HEIGHT,
  };
}

function regionsFor(order) {
  const page = pageLabel(order);
  const specs = [
    ['title', '标题与本页目标', [40, 45, 1520, 145]],
    ['left-board', '左侧定义或图像', [55, 195, 700, 465]],
    ['right-board', '右侧代码或推导', [805, 195, 700, 465]],
    ['takeaway', '底部总结', [65, 720, 1470, 120]],
  ];
  return specs.map(([semanticId, label, sourceRect]) => ({
    id: `${NOTEBOOK_ID}-s${page}-${semanticId}`,
    semanticId,
    label,
    sourceRect,
    canvasRect: toCanvasRect(sourceRect),
  }));
}

function imageElement(order) {
  return {
    id: `${NOTEBOOK_ID}-image-${pageLabel(order)}`,
    type: 'image',
    left: 0,
    top: 0,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    rotate: 0,
    fixedRatio: false,
    src: publicSlidePath(order),
    imageType: 'pageFigure',
    radius: 0,
  };
}

function hotspotElement(region) {
  return {
    id: region.id,
    name: `semantic-hit-map: ${region.label}`,
    type: 'shape',
    left: region.canvasRect.left,
    top: region.canvasRect.top,
    width: region.canvasRect.width,
    height: region.canvasRect.height,
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
    regions: regionsFor(order),
  };
}

function speechFor(order, regionIndex) {
  const slide = slides[order];
  const next = slides[order + 1]?.title || '本节收束';
  return [
    `这一页是《${slide.title}》。先把学生的注意力放在本页目标上：${slide.intent}`,
    '看左侧图像时，先让学生说出当前对象是什么，再指出它对应数据定义里的哪一个 case。',
    '看右侧代码或推导时，只讲这一页需要的那一步。遇到递归调用，要明确它进入的是哪个更小的问题。',
    order === slides.length - 1
      ? '最后收束：递归不是背模板，而是找 base case、找更小的问题，并用数据形状决定函数结构。'
      : `用底部总结把本页压成一句话，然后过渡到下一页：${next}。`,
  ][regionIndex];
}

function actionsFor(order) {
  return regionsFor(order).flatMap((region, index) => [
    {
      id: `${NOTEBOOK_ID}-spotlight-s${pageLabel(order)}-${String(index + 1).padStart(2, '0')}`,
      type: 'spotlight',
      elementId: region.id,
      title: region.label,
      description: `聚焦区域：${region.label}`,
      dimOpacity: 0.76,
    },
    {
      id: `${NOTEBOOK_ID}-speech-s${pageLabel(order)}-${String(index + 1).padStart(2, '0')}`,
      type: 'speech',
      title: `讲解：${region.label}`,
      text: speechFor(order, index),
    },
  ]);
}

function canvasFor(order) {
  const hitMap = semanticHitMapFor(order);
  return {
    id: `${NOTEBOOK_ID}-canvas-${pageLabel(order)}`,
    viewportSize: CANVAS_WIDTH,
    viewportRatio: 16 / 9,
    theme: {
      backgroundColor: '#ffffff',
      themeColors: ['#0f766e', '#2563eb', '#f97316', '#0f172a'],
      fontColor: '#0f172a',
      fontName: 'Inter',
      outline: { color: '#0f766e', width: 2, style: 'solid' },
      shadow: { h: 0, v: 0, blur: 10, color: '#000000' },
    },
    elements: [imageElement(order), ...hitMap.regions.map((region) => hotspotElement(region))],
    background: { type: 'solid', color: '#ffffff' },
    type: 'content',
  };
}

function scenesFor() {
  const now = new Date().toISOString();
  return slides.map((slide, order) => ({
    id: `${NOTEBOOK_ID}-p${pageLabel(order)}`,
    notebookId: NOTEBOOK_ID,
    title: slide.title,
    type: 'slide',
    order,
    content: {
      type: 'slide',
      canvas: canvasFor(order),
      webRenderMode: 'slide',
      semanticHitMap: semanticHitMapFor(order),
    },
    actions: actionsFor(order),
    whiteboard: null,
    createdAt: now,
    updatedAt: now,
  }));
}

async function copySlides() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const copied = [];
  for (const [order, slide] of slides.entries()) {
    if (!fs.existsSync(slide.source)) throw new Error(`Missing source image: ${slide.source}`);
    const destination = slidePath(order);
    await sharp(slide.source)
      .resize(SOURCE_WIDTH, SOURCE_HEIGHT, {
        fit: 'contain',
        position: 'center',
        background: '#f8fafc',
      })
      .png()
      .toFile(destination);
    copied.push({ order, title: slide.title, source: slide.source, destination });
  }
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'image-sources.json'),
    JSON.stringify(
      {
        mode: 'built-in-imagegen-selected-list',
        copiedAt: new Date().toISOString(),
        images: copied,
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'selected-image-sources.json'),
    JSON.stringify(copied, null, 2),
  );
}

async function renderContactSheet() {
  const columns = 3;
  const thumbWidth = 400;
  const thumbHeight = 225;
  const labelHeight = 54;
  const composites = [];

  for (const [order, slide] of slides.entries()) {
    const labelSvg = [
      `<svg width="${thumbWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg">`,
      '<rect width="100%" height="100%" fill="#0f172a"/>',
      `<text x="14" y="22" fill="#ffffff" font-size="14" font-family="PingFang SC, Noto Sans CJK SC, Arial">${pageLabel(order)}. ${slide.title}</text>`,
      `<text x="14" y="42" fill="#cbd5e1" font-size="11" font-family="PingFang SC, Noto Sans CJK SC, Arial">${slide.intent.slice(0, 42)}</text>`,
      '</svg>',
    ].join('');
    const thumb = await sharp(slidePath(order))
      .resize(thumbWidth, thumbHeight, { fit: 'cover' })
      .extend({ top: 0, bottom: labelHeight, left: 0, right: 0, background: '#ffffff' })
      .composite([{ input: Buffer.from(labelSvg), top: thumbHeight, left: 0 }])
      .png()
      .toBuffer();
    composites.push({
      input: thumb,
      left: (order % columns) * thumbWidth,
      top: Math.floor(order / columns) * (thumbHeight + labelHeight),
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

function writeMetadata() {
  const scenes = scenesFor();
  const semanticHitMap = {
    notebookId: NOTEBOOK_ID,
    source: 'cpsc107-built-in-imagegen-full-slide',
    sourcePdfs: [
      '/Users/dongpochen/Desktop/2026 Summer/CPSC 107/04_Recursion_BST/04_recursion_bst.pdf',
      '/Users/dongpochen/Desktop/2026 Summer/CPSC 107/05_Trees/05_trees.pdf',
    ],
    slides: slides.map((slide, order) => ({
      order,
      title: slide.title,
      teachingIntent: slide.intent,
      image: publicSlidePath(order),
      hitMap: semanticHitMapFor(order),
    })),
  };
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'semantic-hit-map.json'),
    JSON.stringify(semanticHitMap, null, 2),
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'scene-actions.json'),
    JSON.stringify(
      scenes.map((scene) => ({
        id: scene.id,
        title: scene.title,
        order: scene.order,
        actions: scene.actions,
      })),
      null,
      2,
    ),
  );
  fs.writeFileSync(path.join(OUTPUT_DIR, 'notebook-scenes.json'), JSON.stringify(scenes, null, 2));
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'notebook-outline.json'),
    JSON.stringify(
      {
        id: NOTEBOOK_ID,
        title: '递归、Helper 与 BST',
        description:
          '从阶乘和 Fibonacci 建立递归直觉，再进入 list recursion、helper function 和 binary search tree lookup。',
        courseId: COURSE_ID,
        slideCount: slides.length,
        outputDir: OUTPUT_DIR,
        publicDir: PUBLIC_DIR,
        slides: slides.map(({ source, ...slide }, order) => ({ order, ...slide })),
      },
      null,
      2,
    ),
  );
}

async function seedDb() {
  loadEnvLocal();
  const prisma = new PrismaClient();
  try {
    const course = await prisma.course.findUnique({ where: { id: COURSE_ID } });
    if (!course) throw new Error(`Course not found: ${COURSE_ID}`);
    const now = new Date();
    await prisma.notebook.upsert({
      where: { id: NOTEBOOK_ID },
      update: {
        ownerId: course.ownerId,
        courseId: course.id,
        name: '递归、Helper 与 BST',
        description:
          '从阶乘和 Fibonacci 建立递归直觉，再进入 list recursion、helper function 和 BST lookup。',
        tags: ['CPSC107', 'recursion', 'helper', 'BST', 'imagegen-full-slide', 'semantic-hit-map'],
        avatarUrl: '/avatars/notebook-agents/avatar4.avif',
        language: 'zh-CN',
        style: 'imagegen-full-slide-semantic-hit-map',
        updatedAt: now,
      },
      create: {
        id: NOTEBOOK_ID,
        ownerId: course.ownerId,
        courseId: course.id,
        name: '递归、Helper 与 BST',
        description:
          '从阶乘和 Fibonacci 建立递归直觉，再进入 list recursion、helper function 和 BST lookup。',
        tags: ['CPSC107', 'recursion', 'helper', 'BST', 'imagegen-full-slide', 'semantic-hit-map'],
        avatarUrl: '/avatars/notebook-agents/avatar4.avif',
        language: 'zh-CN',
        style: 'imagegen-full-slide-semantic-hit-map',
        createdAt: now,
        updatedAt: now,
      },
    });
    const scenes = scenesFor().map((scene) => ({
      ...scene,
      createdAt: now,
      updatedAt: now,
    }));
    await prisma.$transaction([
      prisma.scene.deleteMany({ where: { notebookId: NOTEBOOK_ID } }),
      prisma.scene.createMany({ data: scenes }),
    ]);
    console.log(`[db] seeded ${NOTEBOOK_ID} scenes=${scenes.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  await copySlides();
  writeMetadata();
  await renderContactSheet();
  await seedDb();
  console.log(`[done] ${NOTEBOOK_ID}: ${slides.length} slides`);
  console.log(`[files] ${OUTPUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
