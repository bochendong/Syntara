#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';

const ROOT = process.cwd();

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

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isPreviewableImageSrc(src) {
  const value = typeof src === 'string' ? src.trim() : '';
  return value.startsWith('/') || value.startsWith('http://') || value.startsWith('https://');
}

function toFiniteNumber(value, fallback) {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function imageArea(image) {
  return toFiniteNumber(image.width, 0) * toFiniteNumber(image.height, 0);
}

function summarizeActions(actions) {
  const speech = Array.isArray(actions)
    ? actions.filter((action) => action?.type === 'speech' && action.text?.trim())
    : [];
  return {
    ready: speech.length,
    total: speech.length,
    status: speech.length === 0 ? 'no_speech' : 'ready',
  };
}

function findCoverSlideJson(scenes) {
  const orderedScenes = [...scenes].sort((a, b) => a.order - b.order);
  for (const scene of orderedScenes) {
    if (!isRecord(scene.content) || scene.content.type !== 'slide') continue;
    if (!isRecord(scene.content.canvas)) continue;
    const canvas = scene.content.canvas;
    const elements = Array.isArray(canvas.elements) ? canvas.elements : [];
    const image = elements
      .filter(isRecord)
      .filter((element) => element.type === 'image' && isPreviewableImageSrc(element.src))
      .sort((a, b) => imageArea(b) - imageArea(a))[0];
    if (!image) continue;
    return {
      coverSlideJson: {
        id: typeof canvas.id === 'string' ? canvas.id : 'cover-preview',
        type: 'content',
        theme: {
          fontName: 'Inter',
          fontColor: '#0f172a',
          themeColors: ['#0f766e', '#334155', '#a16207', '#0f172a'],
          backgroundColor: '#ffffff',
        },
        background: { type: 'solid', color: '#ffffff' },
        viewportSize: toFiniteNumber(canvas.viewportSize, 1000),
        viewportRatio: toFiniteNumber(canvas.viewportRatio, 1.777777777777778),
        elements: [image],
      },
      coverImagePath: typeof image.src === 'string' ? image.src : null,
    };
  }
  return { coverSlideJson: null, coverImagePath: null };
}

function summarizeScenes(scenes) {
  let speechReadyCount = 0;
  let speechTotalCount = 0;
  for (const scene of scenes) {
    const speech = summarizeActions(scene.actions);
    speechReadyCount += speech.ready;
    speechTotalCount += speech.total;
  }
  return {
    sceneCount: scenes.length,
    speechReadyCount,
    speechTotalCount,
    speechStatus:
      speechTotalCount === 0
        ? 'no_speech'
        : speechReadyCount >= speechTotalCount
          ? 'ready'
          : 'pending',
    ...findCoverSlideJson(scenes),
  };
}

function jsonHash(value) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(value ?? null))
    .digest('hex');
}

async function refreshNotebookSummaries(prisma, materializePages) {
  const notebooks = await prisma.notebook.findMany({
    select: {
      id: true,
      courseId: true,
      scenes: {
        orderBy: { order: 'asc' },
        select: {
          id: true,
          title: true,
          type: true,
          order: true,
          content: true,
          actions: true,
          whiteboard: true,
        },
      },
    },
  });

  let updated = 0;
  for (const notebook of notebooks) {
    const summary = summarizeScenes(notebook.scenes);
    const [problemCount, publishedProblemCount] = await Promise.all([
      prisma.notebookProblem.count({ where: { notebookId: notebook.id } }),
      prisma.notebookProblem.count({ where: { notebookId: notebook.id, status: 'published' } }),
    ]);

    await prisma.notebook.update({
      where: { id: notebook.id },
      data: {
        sceneCount: summary.sceneCount,
        problemCount,
        publishedProblemCount,
        speechReadyCount: summary.speechReadyCount,
        speechTotalCount: summary.speechTotalCount,
        speechStatus: summary.speechStatus,
        coverSlideJson: summary.coverSlideJson ?? Prisma.DbNull,
        coverImagePath: summary.coverImagePath,
      },
    });

    if (materializePages) {
      await prisma.notebookPage.deleteMany({ where: { notebookId: notebook.id } });
      for (const scene of notebook.scenes) {
        const speech = summarizeActions(scene.actions);
        await prisma.notebookPage.create({
          data: {
            notebookId: notebook.id,
            courseId: notebook.courseId,
            sourceSceneId: scene.id,
            title: scene.title,
            type: scene.type,
            order: scene.order,
            contentHash: jsonHash(scene.content),
            actionsHash: jsonHash(scene.actions),
            content: {
              create: {
                content: scene.content,
                whiteboard: scene.whiteboard ?? Prisma.DbNull,
              },
            },
            actions: {
              create: {
                actions: scene.actions ?? Prisma.DbNull,
                speechReadyCount: speech.ready,
                speechTotalCount: speech.total,
                speechStatus: speech.status,
              },
            },
          },
        });
      }
    }

    updated += 1;
    if (updated % 25 === 0) console.log(`Updated ${updated}/${notebooks.length} notebooks...`);
  }
  return updated;
}

async function refreshCourseSummaries(prisma) {
  const courses = await prisma.course.findMany({ select: { id: true } });
  let updated = 0;
  for (const course of courses) {
    const notebookAggregate = await prisma.notebook.aggregate({
      where: { courseId: course.id },
      _count: { _all: true },
      _sum: {
        sceneCount: true,
        speechReadyCount: true,
        speechTotalCount: true,
      },
    });
    const [problemCount, publishedProblemCount] = await Promise.all([
      prisma.notebookProblem.count({
        where: { OR: [{ courseId: course.id }, { notebook: { courseId: course.id } }] },
      }),
      prisma.notebookProblem.count({
        where: {
          status: 'published',
          OR: [{ courseId: course.id }, { notebook: { courseId: course.id } }],
        },
      }),
    ]);
    await prisma.course.update({
      where: { id: course.id },
      data: {
        notebookCount: notebookAggregate._count._all,
        sceneCount: notebookAggregate._sum.sceneCount ?? 0,
        problemCount,
        publishedProblemCount,
        speechReadyCount: notebookAggregate._sum.speechReadyCount ?? 0,
        speechTotalCount: notebookAggregate._sum.speechTotalCount ?? 0,
      },
    });
    updated += 1;
  }
  return updated;
}

async function backfillProblemProgress(prisma) {
  const attempts = await prisma.notebookProblemAttempt.findMany({
    orderBy: [{ userId: 'asc' }, { problemId: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      problemId: true,
      userId: true,
      status: true,
      score: true,
      createdAt: true,
    },
  });

  const progressByKey = new Map();
  for (const attempt of attempts) {
    const key = `${attempt.problemId}\u0000${attempt.userId}`;
    const entry = progressByKey.get(key) ?? {
      problemId: attempt.problemId,
      userId: attempt.userId,
      latest: attempt,
      attemptedCount: 0,
      passedCount: 0,
    };
    entry.attemptedCount += 1;
    if (attempt.status === 'passed') entry.passedCount += 1;
    progressByKey.set(key, entry);
  }

  let updated = 0;
  for (const entry of progressByKey.values()) {
    await prisma.notebookProblemProgress.upsert({
      where: {
        problemId_userId: {
          problemId: entry.problemId,
          userId: entry.userId,
        },
      },
      update: {
        latestAttemptId: entry.latest.id,
        status: entry.latest.status,
        score: entry.latest.score,
        attemptedCount: entry.attemptedCount,
        passedCount: entry.passedCount,
        lastAttemptAt: entry.latest.createdAt,
      },
      create: {
        problemId: entry.problemId,
        userId: entry.userId,
        latestAttemptId: entry.latest.id,
        status: entry.latest.status,
        score: entry.latest.score,
        attemptedCount: entry.attemptedCount,
        passedCount: entry.passedCount,
        lastAttemptAt: entry.latest.createdAt,
      },
    });
    updated += 1;
  }
  return updated;
}

async function backfillAssetIndex(prisma) {
  const rows = await prisma.notebookImageAsset.findMany({
    select: {
      path: true,
      mimeType: true,
      sizeBytes: true,
      sha256: true,
      source: true,
    },
  });
  let updated = 0;
  for (const row of rows) {
    await prisma.asset.upsert({
      where: { path: row.path },
      update: {
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        sha256: row.sha256,
        source: row.source ?? 'notebook-image-asset',
      },
      create: {
        path: row.path,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        sha256: row.sha256,
        source: row.source ?? 'notebook-image-asset',
      },
    });
    updated += 1;
  }
  return updated;
}

loadEnvLocal();
if (!process.env.DATABASE_URL?.trim()) {
  throw new Error('DATABASE_URL is not configured. Add it to .env.local first.');
}

const prisma = new PrismaClient();
const materializePages = hasFlag('materialize-pages');

try {
  const notebooks = await refreshNotebookSummaries(prisma, materializePages);
  const courses = await refreshCourseSummaries(prisma);
  const progress = await backfillProblemProgress(prisma);
  const assets = await backfillAssetIndex(prisma);
  console.log(
    JSON.stringify(
      {
        ok: true,
        notebooks,
        courses,
        progress,
        assets,
        materializedPages: materializePages,
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
