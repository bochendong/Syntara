#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { sanitizeMathForSpeech } from './mat136-tts-speech.mjs';
import { generatedNotebookDir, generatedNotebookPublicPath } from '../shared/paths.mjs';

const RUN_STAMP = '20260519';
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;
const SOURCE_WIDTH = 1600;
const SOURCE_HEIGHT = 900;
const HOTSPOT_PATH = 'M 0 0 L 200 0 L 200 200 L 0 200 Z';

const DATA_PATH = path.resolve(process.cwd(), 'scripts/notebooks/mat102-queue-zh-notebooks.json');
const DEFAULT_CODEX_IMAGE_ROOT = path.join(
  process.env.CODEX_HOME || path.join(process.env.HOME || '', '.codex'),
  'generated_images',
);

const themeColors = {
  ink: '#0f172a',
  teal: '#0f766e',
  blue: '#2563eb',
  orange: '#f97316',
};

function parseArgs(argv) {
  const options = {
    copyLatest: 0,
    copyFromDir: null,
    copyFromList: null,
    forceImages: false,
    seedDb: false,
    skipDb: false,
    only: null,
    courseId: process.env.MAT102_COURSE_ID || null,
    imageRoot: DEFAULT_CODEX_IMAGE_ROOT,
  };

  for (const arg of argv.slice(2)) {
    if (arg === '--seed-db') options.seedDb = true;
    else if (arg === '--skip-db') options.skipDb = true;
    else if (arg === '--force-images') options.forceImages = true;
    else if (arg.startsWith('--copy-latest=')) {
      options.copyLatest = Number(arg.slice('--copy-latest='.length)) || 0;
    } else if (arg.startsWith('--copy-from-dir=')) {
      options.copyFromDir = path.resolve(arg.slice('--copy-from-dir='.length));
    } else if (arg.startsWith('--copy-from-list=')) {
      options.copyFromList = path.resolve(arg.slice('--copy-from-list='.length));
    } else if (arg.startsWith('--image-root=')) {
      options.imageRoot = path.resolve(arg.slice('--image-root='.length));
    } else if (arg.startsWith('--only=')) {
      options.only = new Set(
        arg
          .slice('--only='.length)
          .split(',')
          .map((s) => s.trim()),
      );
    } else if (arg.startsWith('--course-id=')) {
      options.courseId = arg.slice('--course-id='.length).trim();
    }
  }
  return options;
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

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function pageLabel(order) {
  return String(order + 1).padStart(2, '0');
}

function loadNotebooks() {
  const records = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  return records.map((notebook) => ({
    ...notebook,
    slug: `mat102-zh-${notebook.slug}`,
    id: `nb-mat102-zh-${notebook.slug}-${RUN_STAMP}`,
    language: 'zh-CN',
    tags: ['MAT102', 'zh-CN', 'imagegen-full-slide', 'semantic-hit-map', notebook.sourcePdf],
  }));
}

function selectNotebooks(notebooks, options) {
  if (!options.only) return notebooks;
  return notebooks.filter(
    (notebook) =>
      options.only.has(notebook.slug) ||
      options.only.has(notebook.id) ||
      options.only.has(notebook.slug.replace(/^mat102-zh-/, '')),
  );
}

function outputDirFor(notebook) {
  return generatedNotebookDir(notebook.id);
}

function publicDirFor(notebook) {
  return generatedNotebookPublicPath(notebook.id);
}

function slidePath(notebook, order) {
  return path.join(outputDirFor(notebook), `slide-${pageLabel(order)}.png`);
}

function listPngsRecursive(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(file);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) {
        const stat = fs.statSync(file);
        out.push({ file, mtimeMs: stat.mtimeMs });
      }
    }
  }
  return out;
}

function latestCodexImages(count, root) {
  const newestFirst = listPngsRecursive(root)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, count);
  return newestFirst.sort((a, b) => a.mtimeMs - b.mtimeMs).map((item) => item.file);
}

function imagesFromDir(dir) {
  return fs
    .readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith('.png'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name) => path.join(dir, name));
}

function imagesFromList(file) {
  const records = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(records)) throw new Error(`Image list must be a JSON array: ${file}`);
  return records.map((item) => path.resolve(typeof item === 'string' ? item : item.file));
}

async function normalizeImage(source, destination) {
  await sharp(source)
    .resize(SOURCE_WIDTH, SOURCE_HEIGHT, { fit: 'cover', position: 'center' })
    .png()
    .toFile(destination);
}

async function copyImages(selectedNotebooks, options) {
  if (!options.copyLatest && !options.copyFromDir && !options.copyFromList) return;

  const expected = selectedNotebooks.reduce((total, notebook) => total + notebook.slides.length, 0);
  const sources = options.copyFromList
    ? imagesFromList(options.copyFromList)
    : options.copyFromDir
      ? imagesFromDir(options.copyFromDir)
      : latestCodexImages(options.copyLatest, options.imageRoot);

  if (sources.length < expected) {
    throw new Error(`Need ${expected} source images, found ${sources.length}`);
  }

  let cursor = 0;
  for (const notebook of selectedNotebooks) {
    fs.mkdirSync(outputDirFor(notebook), { recursive: true });
    const copiedSources = [];
    for (const [order] of notebook.slides.entries()) {
      const destination = slidePath(notebook, order);
      if (!options.forceImages && fs.existsSync(destination)) {
        cursor += 1;
        continue;
      }
      const source = sources[cursor];
      cursor += 1;
      await normalizeImage(source, destination);
      copiedSources.push({ order, source, destination });
    }
    fs.writeFileSync(
      path.join(outputDirFor(notebook), 'image-sources.json'),
      JSON.stringify(
        {
          mode: options.copyFromList
            ? 'copy-from-list'
            : options.copyFromDir
              ? 'copy-from-dir'
              : 'copy-latest-codex-imagegen',
          sourceRoot: options.copyFromList || options.copyFromDir || options.imageRoot,
          copiedAt: new Date().toISOString(),
          images: copiedSources,
        },
        null,
        2,
      ),
    );
  }
}

function toCanvasRect([x, y, width, height]) {
  return {
    left: (x / SOURCE_WIDTH) * CANVAS_WIDTH,
    top: (y / SOURCE_HEIGHT) * CANVAS_HEIGHT,
    width: (width / SOURCE_WIDTH) * CANVAS_WIDTH,
    height: (height / SOURCE_HEIGHT) * CANVAS_HEIGHT,
  };
}

function regionsFor(notebook, order) {
  const page = pageLabel(order);
  const specs = [
    ['title', '标题与本页位置', [45, 80, 1510, 130]],
    ['main-idea', '左侧核心概念区', [55, 220, 690, 470]],
    ['worked-board', '右侧例题或图像区', [815, 220, 690, 470]],
    ['takeaway', '底部总结与下一步', [70, 735, 1460, 105]],
  ];
  return specs.map(([semanticId, label, sourceRect]) => ({
    id: `${notebook.id}-s${page}-${semanticId}`,
    semanticId,
    label,
    sourceRect,
    canvasRect: toCanvasRect(sourceRect),
  }));
}

function imageElement(notebook, order) {
  const page = pageLabel(order);
  return {
    id: `${notebook.id}-image-${page}`,
    type: 'image',
    left: 0,
    top: 0,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    rotate: 0,
    fixedRatio: false,
    src: `${publicDirFor(notebook)}/slide-${page}.png`,
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

function semanticHitMapFor(notebook, order) {
  return {
    version: 1,
    sourceSize: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT },
    canvasSize: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    regions: regionsFor(notebook, order),
  };
}

function speechFor(notebook, order, regionIndex) {
  const [title, intent] = notebook.slides[order];
  const nextTitle = notebook.slides[order + 1]?.[0] || '下一节内容';
  const speeches = [
    `这一页是《${title}》。先把它在整节课里的位置放清楚，不急着把结论全部说完。`,
    `${intent} 这里先问：对象是什么，条件是什么，最后要判断什么。`,
    `看右侧例题或图像时，按照一步一步的推理来读。先看起点，再看为什么能写下一行，最后再看结论。`,
    order === notebook.slides.length - 1
      ? '最后收束本节主线：今天学了哪些语言、哪些证明动作、哪些坑要避开；再把问题自然交给下一节。'
      : `用底部总结把本页结论压成一句话，然后顺势引到下一页：${nextTitle}。`,
  ];
  return sanitizeMathForSpeech(
    speeches[regionIndex].replaceAll('让学生', '让你').replaceAll('学生', '你'),
  );
}

function actionsFor(notebook, order) {
  return regionsFor(notebook, order).flatMap((region, index) => [
    {
      id: `${notebook.id}-spotlight-s${pageLabel(order)}-${String(index + 1).padStart(2, '0')}`,
      type: 'spotlight',
      elementId: region.id,
      title: region.label,
      description: `遮罩聚焦父级区域：${region.label}；其他区域暗下去，当前区域保持正常亮度。`,
      dimOpacity: 0.76,
    },
    {
      id: `${notebook.id}-speech-s${pageLabel(order)}-${String(index + 1).padStart(2, '0')}`,
      type: 'speech',
      title: `讲解：${region.label}`,
      text: speechFor(notebook, order, index),
    },
  ]);
}

function canvasFor(notebook, order) {
  const hitMap = semanticHitMapFor(notebook, order);
  return {
    id: `${notebook.id}-canvas-${pageLabel(order)}`,
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
      imageElement(notebook, order),
      ...hitMap.regions.map((region) => hotspotElement(region)),
    ],
    background: { type: 'solid', color: '#ffffff' },
    type: 'content',
  };
}

function scenesFor(notebook) {
  const now = new Date().toISOString();
  return notebook.slides.map((slide, order) => {
    const content = {
      type: 'slide',
      canvas: canvasFor(notebook, order),
      webRenderMode: 'slide',
      semanticHitMap: semanticHitMapFor(notebook, order),
    };
    return {
      id: `${notebook.id}-p${pageLabel(order)}`,
      notebookId: notebook.id,
      title: slide[0],
      type: 'slide',
      order,
      content,
      actions: actionsFor(notebook, order),
      whiteboard: null,
      createdAt: now,
      updatedAt: now,
    };
  });
}

async function renderContactSheet(notebook) {
  const dir = outputDirFor(notebook);
  const columns = 3;
  const thumbWidth = 400;
  const thumbHeight = 225;
  const labelHeight = 48;
  const cellHeight = thumbHeight + labelHeight;
  const composites = [];

  for (const [index, slide] of notebook.slides.entries()) {
    const file = slidePath(notebook, index);
    const title = `${index + 1}. ${slide[0]}`;
    const labelSvg = [
      `<svg width="${thumbWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg">`,
      `<rect width="${thumbWidth}" height="${labelHeight}" fill="#0f172a"/>`,
      `<text x="16" y="30" fill="#ffffff" font-size="16" font-family="PingFang SC, Noto Sans CJK SC, Arial Unicode MS, Arial">${esc(title)}</text>`,
      '</svg>',
    ].join('');
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
      height: Math.ceil(notebook.slides.length / columns) * cellHeight,
      channels: 4,
      background: '#e5e7eb',
    },
  })
    .composite(composites)
    .png()
    .toFile(path.join(dir, 'contact-sheet.png'));
}

async function renderMetadataAssets(selectedNotebooks) {
  for (const notebook of selectedNotebooks) {
    const dir = outputDirFor(notebook);
    fs.mkdirSync(dir, { recursive: true });
    const missing = notebook.slides
      .map((_, order) => slidePath(notebook, order))
      .filter((file) => !fs.existsSync(file));
    if (missing.length > 0) {
      console.warn(
        `[metadata] ${notebook.slug}: ${missing.length} slides missing; metadata still written`,
      );
    }

    const hitMap = {
      notebookId: notebook.id,
      source: 'mat102-queue-zh-built-in-imagegen-full-slide',
      sourcePdf: notebook.sourcePdf,
      slides: notebook.slides.map((slide, order) => ({
        order,
        title: slide[0],
        teachingIntent: slide[1],
        image: `${publicDirFor(notebook)}/slide-${pageLabel(order)}.png`,
        hitMap: semanticHitMapFor(notebook, order),
      })),
    };

    const scenes = scenesFor(notebook);
    fs.writeFileSync(path.join(dir, 'semantic-hit-map.json'), JSON.stringify(hitMap, null, 2));
    fs.writeFileSync(
      path.join(dir, 'scene-actions.json'),
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
    fs.writeFileSync(path.join(dir, 'notebook-scenes.json'), JSON.stringify(scenes, null, 2));
    fs.writeFileSync(
      path.join(dir, 'notebook-outline.json'),
      JSON.stringify({ ...notebook, outputDir: dir, publicDir: publicDirFor(notebook) }, null, 2),
    );

    if (missing.length === 0) await renderContactSheet(notebook);
  }
}

async function findMat102Course(prisma, explicitCourseId) {
  if (explicitCourseId) {
    const course = await prisma.course.findUnique({ where: { id: explicitCourseId } });
    if (!course) throw new Error(`Course not found: ${explicitCourseId}`);
    return course;
  }
  const courses = await prisma.course.findMany({
    where: {
      OR: [
        { name: { contains: 'MAT102', mode: 'insensitive' } },
        { courseCode: { contains: 'MAT102', mode: 'insensitive' } },
        { description: { contains: 'MAT102', mode: 'insensitive' } },
        { tags: { has: 'MAT102' } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  });
  if (courses.length === 0)
    throw new Error('No MAT102 course found. Re-run with --course-id=<id>.');
  const normalizedCourseCode = (course) =>
    (course.courseCode || '').replace(/\s+/g, '').toUpperCase();
  const exact =
    courses.find((course) => normalizedCourseCode(course) === 'MAT102') ||
    courses.find((course) => /MAT102/i.test(course.name || '')) ||
    courses[0];
  console.log(`[db] Using course ${exact.id}: ${exact.name}`);
  return exact;
}

async function seedDb(selectedNotebooks, options) {
  if (options.skipDb || !options.seedDb) return;
  const prisma = new PrismaClient();
  try {
    const course = await findMat102Course(prisma, options.courseId);
    const now = new Date();
    for (const notebook of selectedNotebooks) {
      await prisma.notebook.upsert({
        where: { id: notebook.id },
        update: {
          ownerId: course.ownerId,
          courseId: course.id,
          name: notebook.title,
          description: notebook.description,
          tags: notebook.tags,
          avatarUrl: '/avatars/notebook-agents/avatar8.avif',
          language: 'zh-CN',
          style: 'imagegen-full-slide-semantic-hit-map',
          updatedAt: now,
        },
        create: {
          id: notebook.id,
          ownerId: course.ownerId,
          courseId: course.id,
          name: notebook.title,
          description: notebook.description,
          tags: notebook.tags,
          avatarUrl: '/avatars/notebook-agents/avatar8.avif',
          language: 'zh-CN',
          style: 'imagegen-full-slide-semantic-hit-map',
          createdAt: now,
          updatedAt: now,
        },
      });

      const scenes = scenesFor(notebook).map((scene) => ({
        ...scene,
        createdAt: now,
        updatedAt: now,
      }));
      await prisma.$transaction([
        prisma.scene.deleteMany({ where: { notebookId: notebook.id } }),
        prisma.scene.createMany({ data: scenes }),
      ]);
      console.log(`[db] seeded ${notebook.id} scenes=${scenes.length}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  loadEnvLocal();
  const options = parseArgs(process.argv);
  const notebooks = loadNotebooks();
  const selectedNotebooks = selectNotebooks(notebooks, options);
  if (selectedNotebooks.length === 0) throw new Error('No notebooks selected');

  console.log(`[notebooks] selected=${selectedNotebooks.length}`);
  await copyImages(selectedNotebooks, options);
  await renderMetadataAssets(selectedNotebooks);
  await seedDb(selectedNotebooks, options);
  console.log('[done]');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
