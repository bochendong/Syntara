#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const DEFAULT_COURSE_ID = 'cmqjfarz800158oi68s595q9n';

function loadEnvLocal() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || line.trim().startsWith('#')) continue;

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

function imageHits(value, pathParts = [], output = []) {
  if (typeof value === 'string') {
    if (/!\[[^\]]*]\([^)]*\)|<img\b|\/api\/uploads\/images|data:image\//i.test(value)) {
      output.push({
        path: pathParts.join('.'),
        sample: value.slice(0, 220),
      });
    }
    return output;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => imageHits(item, [...pathParts, String(index)], output));
    return output;
  }

  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (
        key === 'images' &&
        Array.isArray(item) &&
        item.some((image) => image && typeof image === 'object' && String(image.src ?? '').trim())
      ) {
        output.push({
          path: [...pathParts, key].join('.'),
          sample: JSON.stringify(item).slice(0, 220),
        });
      }
      imageHits(item, [...pathParts, key], output);
    }
  }

  return output;
}

async function refreshNotebookProblemSummaryFields(tx, notebookIds) {
  for (const notebookId of notebookIds) {
    const [problemCount, publishedProblemCount] = await Promise.all([
      tx.notebookProblem.count({ where: { notebookId } }),
      tx.notebookProblem.count({ where: { notebookId, status: 'published' } }),
    ]);
    await tx.notebook.updateMany({
      where: { id: notebookId },
      data: { problemCount, publishedProblemCount },
    });
  }
}

async function refreshCourseSummaryFields(tx, courseId) {
  const notebookAggregate = await tx.notebook.aggregate({
    where: { courseId },
    _count: { _all: true },
    _sum: {
      sceneCount: true,
      speechReadyCount: true,
      speechTotalCount: true,
    },
  });
  const [problemCount, publishedProblemCount] = await Promise.all([
    tx.notebookProblem.count({ where: { OR: [{ courseId }, { notebook: { courseId } }] } }),
    tx.notebookProblem.count({
      where: { status: 'published', OR: [{ courseId }, { notebook: { courseId } }] },
    }),
  ]);

  await tx.course.updateMany({
    where: { id: courseId },
    data: {
      notebookCount: notebookAggregate._count._all,
      sceneCount: notebookAggregate._sum.sceneCount ?? 0,
      problemCount,
      publishedProblemCount,
      speechReadyCount: notebookAggregate._sum.speechReadyCount ?? 0,
      speechTotalCount: notebookAggregate._sum.speechTotalCount ?? 0,
    },
  });
}

async function main() {
  loadEnvLocal();
  const courseId = argValue('course-id') || DEFAULT_COURSE_ID;
  const write = hasFlag('write');
  const prisma = new PrismaClient();

  try {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        name: true,
        courseCode: true,
        problemCount: true,
        publishedProblemCount: true,
      },
    });
    if (!course) throw new Error(`Course not found: ${courseId}`);

    const rows = await prisma.notebookProblem.findMany({
      where: { courseId },
      select: {
        id: true,
        problemNumber: true,
        order: true,
        title: true,
        type: true,
        status: true,
        notebookId: true,
        publicContentJson: true,
        gradingJson: true,
        sourceMeta: true,
      },
      orderBy: { problemNumber: 'asc' },
    });

    const imageProblems = rows
      .map((problem) => {
        const publicHits = imageHits(problem.publicContentJson).map((hit) => ({
          ...hit,
          section: 'publicContentJson',
        }));
        const gradingHits = imageHits(problem.gradingJson).map((hit) => ({
          ...hit,
          section: 'gradingJson',
        }));
        return {
          problem,
          hits: [...publicHits, ...gradingHits],
        };
      })
      .filter((item) => item.hits.length > 0);

    console.log(
      JSON.stringify(
        {
          mode: write ? 'write' : 'dry-run',
          course,
          scannedProblemCount: rows.length,
          imageProblemCount: imageProblems.length,
          imageProblems: imageProblems.map(({ problem, hits }) => ({
            id: problem.id,
            problemNumber: problem.problemNumber,
            title: problem.title,
            type: problem.type,
            status: problem.status,
            notebookId: problem.notebookId,
            sourceQuestionId: problem.sourceMeta?.sourceQuestionId ?? null,
            hits,
          })),
        },
        null,
        2,
      ),
    );

    if (!write || imageProblems.length === 0) return;

    const notebookIds = Array.from(
      new Set(imageProblems.map(({ problem }) => problem.notebookId).filter(Boolean)),
    );
    await prisma.$transaction(
      async (tx) => {
        await tx.notebookProblem.deleteMany({
          where: { id: { in: imageProblems.map(({ problem }) => problem.id) } },
        });
        await refreshNotebookProblemSummaryFields(tx, notebookIds);
        await refreshCourseSummaryFields(tx, courseId);
      },
      { timeout: 60_000 },
    );

    const [courseAfter, remainingImageCount, remainingProblemCount] = await Promise.all([
      prisma.course.findUnique({
        where: { id: courseId },
        select: { id: true, problemCount: true, publishedProblemCount: true },
      }),
      prisma.notebookProblem
        .findMany({
          where: { courseId },
          select: { publicContentJson: true, gradingJson: true },
        })
        .then(
          (remaining) =>
            remaining.filter(
              (problem) =>
                imageHits(problem.publicContentJson).length > 0 ||
                imageHits(problem.gradingJson).length > 0,
            ).length,
        ),
      prisma.notebookProblem.count({ where: { courseId } }),
    ]);

    console.log(
      JSON.stringify(
        {
          mode: 'write-complete',
          deletedProblemCount: imageProblems.length,
          remainingProblemCount,
          remainingImageProblemCount: remainingImageCount,
          courseAfter,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
