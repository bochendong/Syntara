#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const DEFAULT_TARGET_CODES = ['MAT102', 'MAT136'];

function loadEnvLocal() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || match[1].startsWith('#')) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] ??= value;
  }
}

function argValue(name) {
  const prefix = `--${name}=`;
  const matched = process.argv.find((arg) => arg.startsWith(prefix));
  return matched ? matched.slice(prefix.length).trim() : null;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function normalize(value) {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function safeFilename(value) {
  return String(value || 'asset')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 160);
}

function targetCodesFromArgs() {
  const raw = argValue('course-codes');
  if (!raw) return DEFAULT_TARGET_CODES;
  return raw
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

function isTargetCourse(course, targetCodes) {
  const haystack = [course.courseCode, course.name, ...(course.tags ?? [])]
    .map(normalize)
    .join(' ');
  return targetCodes.some((code) => haystack.includes(normalize(code)));
}

async function findTargetCourses(prisma, targetCodes) {
  const candidates = await prisma.course.findMany({
    select: {
      id: true,
      name: true,
      courseCode: true,
      tags: true,
    },
    orderBy: { updatedAt: 'desc' },
  });
  return candidates.filter((course) => isTargetCourse(course, targetCodes));
}

async function exportProblemBanks(prisma, outputDir, targetCourses, targetCodes) {
  const courseIds = targetCourses.map((course) => course.id);
  const courses = await prisma.course.findMany({
    where: { id: { in: courseIds } },
    select: {
      id: true,
      ownerId: true,
      name: true,
      description: true,
      language: true,
      tags: true,
      purpose: true,
      university: true,
      courseCode: true,
      avatarUrl: true,
      listedInCourseStore: true,
      coursePriceCents: true,
      storePublishedAt: true,
      sourceCourseId: true,
      createdAt: true,
      updatedAt: true,
      notebooks: {
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          ownerId: true,
          courseId: true,
          name: true,
          description: true,
          tags: true,
          avatarUrl: true,
          language: true,
          style: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      problems: {
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        include: { secret: true },
      },
    },
  });

  const notebookIds = courses.flatMap((course) => course.notebooks.map((notebook) => notebook.id));
  const notebookProblems =
    notebookIds.length === 0
      ? []
      : await prisma.notebookProblem.findMany({
          where: { notebookId: { in: notebookIds } },
          orderBy: [{ notebookId: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
          include: { secret: true },
        });

  const payload = {
    exportedAt: new Date().toISOString(),
    targetCodes,
    targetCourseIds: courseIds,
    courses,
    notebookProblems,
  };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, 'mat102-mat136-problem-banks.json'),
    JSON.stringify(payload, null, 2),
  );
  return {
    courses: courses.length,
    notebooks: notebookIds.length,
    courseProblems: courses.reduce((sum, course) => sum + course.problems.length, 0),
    notebookProblems: notebookProblems.length,
  };
}

async function exportNotebookImageAssets(prisma, outputDir) {
  const assetDir = path.join(outputDir, 'notebook-image-assets');
  fs.mkdirSync(assetDir, { recursive: true });

  const assets = await prisma.notebookImageAsset.findMany({
    orderBy: { path: 'asc' },
  });

  const manifest = [];
  let totalBytes = 0;
  for (const asset of assets) {
    const basename = safeFilename(path.basename(asset.path));
    const fileName = `${asset.id}-${basename || 'image'}`;
    const relativeFile = path.join('notebook-image-assets', fileName);
    fs.writeFileSync(path.join(outputDir, relativeFile), Buffer.from(asset.data));
    totalBytes += asset.sizeBytes;
    manifest.push({
      id: asset.id,
      path: asset.path,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      sha256: asset.sha256,
      source: asset.source,
      file: relativeFile,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    });
  }

  fs.writeFileSync(
    path.join(outputDir, 'notebook-image-assets.manifest.json'),
    JSON.stringify(
      { exportedAt: new Date().toISOString(), count: assets.length, totalBytes, assets: manifest },
      null,
      2,
    ),
  );
  return { count: assets.length, totalBytes };
}

loadEnvLocal();
if (!process.env.DATABASE_URL?.trim()) {
  throw new Error('DATABASE_URL is not configured. Add it to .env.local first.');
}

const prisma = new PrismaClient();
const targetCodes = targetCodesFromArgs();
const outputDir = path.resolve(
  ROOT,
  argValue('out') || path.join('tmp', `db-v2-critical-export-${timestamp()}`),
);
const skipAssets = hasFlag('skip-assets');

try {
  const targetCourses = await findTargetCourses(prisma, targetCodes);
  if (targetCourses.length === 0) {
    throw new Error(`No courses matched target codes: ${targetCodes.join(', ')}`);
  }

  const problemBanks = await exportProblemBanks(prisma, outputDir, targetCourses, targetCodes);
  const imageAssets = skipAssets
    ? { skipped: true }
    : await exportNotebookImageAssets(prisma, outputDir);
  fs.writeFileSync(
    path.join(outputDir, 'README.md'),
    [
      '# DB v2 Critical Export',
      '',
      `Exported at: ${new Date().toISOString()}`,
      `Target codes: ${targetCodes.join(', ')}`,
      '',
      'Files:',
      '- `mat102-mat136-problem-banks.json`: course, notebook, problem, and secret judge JSON for target courses.',
      '- `notebook-image-assets.manifest.json`: generated course image asset manifest.',
      '- `notebook-image-assets/`: generated course image binary files.',
      '',
      'Import should happen only after the new Prisma schema has been pushed and reviewed.',
    ].join('\n'),
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        outputDir,
        targetCourses: targetCourses.map((course) => course.id),
        problemBanks,
        imageAssets,
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
