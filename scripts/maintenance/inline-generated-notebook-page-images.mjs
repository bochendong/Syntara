#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  PUBLIC_GENERATED_NOTEBOOKS_PATH,
  PUBLIC_GENERATED_NOTEBOOKS_ROOT,
  generatedNotebookDir,
} from '../shared/paths.mjs';

const DEFAULT_MAX_INLINE_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_MIME_BY_EXTENSION = {
  '.avif': 'image/avif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function readOption(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

function readOptions(name) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) {
      values.push(process.argv[index + 1]);
    }
  }
  return values;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function parseMaxBytes() {
  const raw = readOption('--max-bytes');
  if (!raw) return DEFAULT_MAX_INLINE_IMAGE_BYTES;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid --max-bytes value: ${raw}`);
  }
  return Math.floor(parsed);
}

function getGeneratedNotebookImagePathname(src) {
  const trimmed = String(src || '').trim();
  if (!trimmed) return null;

  let pathname = trimmed;
  try {
    pathname = new URL(trimmed).pathname;
  } catch {
    // Keep relative paths as-is.
  }

  if (pathname.startsWith(`${PUBLIC_GENERATED_NOTEBOOKS_PATH}/`)) {
    return pathname;
  }
  if (pathname.startsWith(`.${PUBLIC_GENERATED_NOTEBOOKS_PATH}/`)) {
    return pathname.slice(1);
  }
  if (pathname.startsWith('generated-notebooks/')) {
    return `/${pathname}`;
  }
  if (/^\.?\/?slide-\d{1,3}\.(png|jpe?g|webp|avif)$/i.test(pathname)) {
    return pathname;
  }
  return null;
}

function generatedNotebookFilePath(src) {
  const pathname = getGeneratedNotebookImagePathname(src);
  if (!pathname) return null;
  if (!pathname.startsWith(`${PUBLIC_GENERATED_NOTEBOOKS_PATH}/`)) return null;

  const relativePath = decodeURIComponent(
    pathname.slice(`${PUBLIC_GENERATED_NOTEBOOKS_PATH}/`.length),
  );
  const resolvedPath = path.resolve(PUBLIC_GENERATED_NOTEBOOKS_ROOT, relativePath);
  const rootWithSeparator = `${PUBLIC_GENERATED_NOTEBOOKS_ROOT}${path.sep}`;
  if (
    resolvedPath !== PUBLIC_GENERATED_NOTEBOOKS_ROOT &&
    !resolvedPath.startsWith(rootWithSeparator)
  ) {
    return null;
  }
  return resolvedPath;
}

function localImageToDataUrl(src, stats, maxBytes) {
  const filePath = generatedNotebookFilePath(src);
  if (!filePath) {
    stats.unresolvedRelative += 1;
    return null;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    stats.missing += 1;
    return null;
  }

  const fileSize = fs.statSync(filePath).size;
  if (fileSize > maxBytes) {
    stats.skippedTooLarge += 1;
    return null;
  }

  const extension = path.extname(filePath).toLowerCase();
  const mimeType = IMAGE_MIME_BY_EXTENSION[extension] || 'application/octet-stream';
  stats.inlined += 1;
  return `data:${mimeType};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

function imageFileToDataUrl(filePath, stats, maxBytes) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    stats.missing += 1;
    return null;
  }

  const fileSize = fs.statSync(filePath).size;
  if (fileSize > maxBytes) {
    stats.skippedTooLarge += 1;
    return null;
  }

  const extension = path.extname(filePath).toLowerCase();
  const mimeType = IMAGE_MIME_BY_EXTENSION[extension] || 'application/octet-stream';
  stats.inlined += 1;
  return `data:${mimeType};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

function slideFilePath(notebookId, order) {
  return path.join(
    generatedNotebookDir(notebookId),
    `slide-${String(order + 1).padStart(2, '0')}.png`,
  );
}

function visit(value, stats, maxBytes) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) visit(item, stats, maxBytes);
    return;
  }

  if (typeof value.src === 'string') {
    const dataUrl = localImageToDataUrl(value.src, stats, maxBytes);
    if (dataUrl) value.src = dataUrl;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (key === 'src') continue;
    visit(nested, stats, maxBytes);
  }
}

function transformContent(content, maxBytes) {
  const copy = JSON.parse(JSON.stringify(content));
  const stats = {
    inlined: 0,
    missing: 0,
    skippedTooLarge: 0,
    unresolvedRelative: 0,
  };
  visit(copy, stats, maxBytes);
  return { content: copy, stats };
}

function addStats(total, stats) {
  total.inlined += stats.inlined;
  total.missing += stats.missing;
  total.skippedTooLarge += stats.skippedTooLarge;
  total.unresolvedRelative += stats.unresolvedRelative;
}

function readCourseCodes() {
  return [...readOptions('--course-code'), ...(process.env.COURSE_CODES || '').split(',')]
    .map((value) => value.trim())
    .filter(Boolean);
}

function buildNotebookMatchFilter(courseCodes) {
  if (!courseCodes.length) return undefined;
  return {
    OR: courseCodes.flatMap((code) => [
      { id: { contains: code, mode: 'insensitive' } },
      { name: { contains: code, mode: 'insensitive' } },
      {
        course: {
          is: {
            courseCode: { contains: code, mode: 'insensitive' },
          },
        },
      },
      {
        course: {
          is: {
            name: { contains: code, mode: 'insensitive' },
          },
        },
      },
    ]),
  };
}

async function main() {
  const write = hasFlag('--write');
  const quiet = hasFlag('--quiet');
  const refreshFromFiles = hasFlag('--refresh-from-files');
  const notebookId = readOption('--notebook') || process.env.NOTEBOOK_ID || null;
  const courseCodes = readCourseCodes();
  const maxBytes = parseMaxBytes();
  const prisma = new PrismaClient();
  const total = {
    scannedScenes: 0,
    changedScenes: 0,
    inlined: 0,
    missing: 0,
    skippedTooLarge: 0,
    unresolvedRelative: 0,
  };

  try {
    const notebookMatchFilter = buildNotebookMatchFilter(courseCodes);
    const scenes = await prisma.scene.findMany({
      where: {
        type: 'slide',
        ...(notebookId ? { notebookId } : {}),
        ...(notebookMatchFilter ? { notebook: { is: notebookMatchFilter } } : {}),
      },
      select: {
        id: true,
        notebookId: true,
        title: true,
        order: true,
        ...(refreshFromFiles ? {} : { content: true }),
        notebook: {
          select: {
            name: true,
            course: {
              select: {
                name: true,
                courseCode: true,
              },
            },
          },
        },
      },
      orderBy: [{ notebookId: 'asc' }, { order: 'asc' }],
    });

    for (const scene of scenes) {
      total.scannedScenes += 1;
      const result = refreshFromFiles
        ? {
            content: null,
            stats: {
              inlined: 0,
              missing: 0,
              skippedTooLarge: 0,
              unresolvedRelative: 0,
            },
          }
        : transformContent(scene.content, maxBytes);
      if (refreshFromFiles) {
        const dataUrl = imageFileToDataUrl(
          slideFilePath(scene.notebookId, scene.order),
          result.stats,
          maxBytes,
        );
        if (dataUrl) result.content = dataUrl;
      }
      addStats(total, result.stats);
      if (result.stats.inlined === 0) continue;

      total.changedScenes += 1;
      const courseLabel = scene.notebook.course?.courseCode || scene.notebook.course?.name || '';
      if (!quiet) {
        console.log(
          `${write ? 'updating' : 'would update'} ${scene.notebookId}/${scene.id} ` +
            `order=${scene.order} images=${result.stats.inlined} ` +
            `${courseLabel ? `course="${courseLabel}" ` : ''}` +
            `notebook="${scene.notebook.name}" title="${scene.title}"`,
        );
      }
      if (write) {
        if (refreshFromFiles) {
          await prisma.$executeRaw`
            UPDATE "Scene"
            SET "content" = jsonb_set(
              "content"::jsonb,
              '{canvas,elements,0,src}',
              to_jsonb(${result.content}::text),
              false
            )
            WHERE "id" = ${scene.id}
          `;
        } else {
          await prisma.scene.update({
            where: { id: scene.id },
            data: { content: result.content },
          });
        }
      }
    }

    console.log(
      [
        write ? 'Write complete.' : 'Dry run complete. Re-run with --write to update DB.',
        `scannedScenes=${total.scannedScenes}`,
        `changedScenes=${total.changedScenes}`,
        `inlinedImages=${total.inlined}`,
        `missingFiles=${total.missing}`,
        `tooLarge=${total.skippedTooLarge}`,
        `unresolvedRelative=${total.unresolvedRelative}`,
      ].join(' '),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
