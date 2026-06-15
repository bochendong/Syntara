#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  MAT102_COURSE_ID,
  MAT102_COURSE_MEMORY_ID,
  MAT102_NOTEBOOK_MEMORY_SPECS,
  MAT136_COURSE_ID,
  MAT136_COURSE_MEMORY_ID,
  MATH_COURSE_MEMORY_TEXTS,
} from './math-public-memory-concepts.mjs';

const ROOT = process.cwd();
const MAT136_NOTEBOOK_MEMORY_PATH = path.join(
  ROOT,
  'scripts/maintenance/mat136-notebook-public-memory.json',
);

function loadEnvLocal() {
  for (const name of ['.env', '.env.local']) {
    const envPath = path.join(ROOT, name);
    if (!fs.existsSync(envPath)) continue;

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
}

function readMat136NotebookMemorySpecs() {
  const payload = JSON.parse(fs.readFileSync(MAT136_NOTEBOOK_MEMORY_PATH, 'utf8'));
  return payload.memories.map((entry) => ({
    memoryId: entry.id,
    notebookId: entry.notebookId,
    title: entry.title,
    text: entry.text,
  }));
}

async function clearVectorChunks(prisma, memoryId) {
  const tableRows = await prisma.$queryRawUnsafe(
    `SELECT to_regclass('"StudyMemoryChunk"')::text AS "tableName"`,
  );
  if (!tableRows[0]?.tableName) return;
  await prisma.$executeRawUnsafe('DELETE FROM "StudyMemoryChunk" WHERE "memoryId" = $1', memoryId);
}

async function upsertMemory(prisma, data) {
  const existing = await prisma.studyMemory.findUnique({
    where: { id: data.id },
    select: {
      id: true,
      ownerId: true,
      courseId: true,
      notebookId: true,
      targetType: true,
      scope: true,
      kind: true,
      status: true,
      source: true,
      title: true,
      text: true,
      reason: true,
    },
  });

  const same =
    existing &&
    existing.ownerId === data.ownerId &&
    existing.courseId === data.courseId &&
    existing.notebookId === data.notebookId &&
    existing.targetType === data.targetType &&
    existing.scope === data.scope &&
    existing.kind === data.kind &&
    existing.status === data.status &&
    existing.source === data.source &&
    existing.title === data.title &&
    existing.text === data.text &&
    existing.reason === data.reason;

  await prisma.studyMemory.upsert({
    where: { id: data.id },
    create: data,
    update: {
      ownerId: data.ownerId,
      courseId: data.courseId,
      notebookId: data.notebookId,
      targetType: data.targetType,
      scope: data.scope,
      kind: data.kind,
      status: data.status,
      source: data.source,
      title: data.title,
      text: data.text,
      reason: data.reason,
      question: data.question,
      sourceReferences: data.sourceReferences,
      confidence: data.confidence,
      updatedAt: new Date(),
    },
  });

  if (!same) {
    await clearVectorChunks(prisma, data.id);
  }

  return {
    id: data.id,
    title: data.title,
    targetType: data.targetType,
    notebookId: data.notebookId,
    chars: data.text.length,
    changed: !same,
  };
}

async function updateCourseMemories(prisma, spec) {
  const course = await prisma.course.findUnique({
    where: { id: spec.courseId },
    select: { id: true, ownerId: true, name: true, courseCode: true },
  });
  if (!course) {
    throw new Error(`Course not found: ${spec.courseId}`);
  }

  const notebookIds = spec.notebookMemories.map((entry) => entry.notebookId);
  const notebooks = await prisma.notebook.findMany({
    where: { id: { in: notebookIds }, courseId: course.id },
    select: { id: true, name: true },
  });
  const notebookById = new Map(notebooks.map((notebook) => [notebook.id, notebook]));
  const missing = notebookIds.filter((id) => !notebookById.has(id));
  if (missing.length > 0) {
    throw new Error(
      `Missing notebooks for ${course.courseCode || course.id}: ${missing.join(', ')}`,
    );
  }

  const updated = [];
  updated.push(
    await upsertMemory(prisma, {
      id: spec.courseMemoryId,
      ownerId: course.ownerId,
      courseId: course.id,
      notebookId: null,
      targetType: 'course',
      scope: 'public',
      kind: 'course_concept_card',
      status: 'active',
      source: 'manual_course_memory_contract',
      title: spec.courseMemoryTitle,
      text: spec.courseMemoryText,
      reason: spec.courseReason,
      question: null,
      sourceReferences: {
        maintainedBy: 'scripts/maintenance/update-math-public-memory-contracts.mjs',
        textSource: spec.textSource,
        courseId: course.id,
      },
      confidence: 0.92,
    }),
  );

  for (const entry of spec.notebookMemories) {
    const notebook = notebookById.get(entry.notebookId);
    updated.push(
      await upsertMemory(prisma, {
        id: entry.memoryId,
        ownerId: course.ownerId,
        courseId: course.id,
        notebookId: notebook.id,
        targetType: 'notebook',
        scope: 'public',
        kind: 'notebook_operational_guide',
        status: 'active',
        source: 'manual_notebook_memory_contract',
        title: entry.title,
        text: entry.text,
        reason: `${course.courseCode || course.name} 单本笔记本详细操作记忆：${notebook.name}。包含解题模板、关键步骤和检查清单。`,
        question: null,
        sourceReferences: {
          maintainedBy: 'scripts/maintenance/update-math-public-memory-contracts.mjs',
          textSource: spec.textSource,
          courseId: course.id,
          notebookId: notebook.id,
          notebookName: notebook.name,
        },
        confidence: 0.9,
      }),
    );
  }

  return {
    course: { id: course.id, code: course.courseCode, name: course.name },
    updated,
  };
}

async function main() {
  loadEnvLocal();
  const prisma = new PrismaClient();

  try {
    const mat136NotebookMemories = readMat136NotebookMemorySpecs();
    const results = [];
    results.push(
      await updateCourseMemories(prisma, {
        courseId: process.env.MAT102_COURSE_ID || MAT102_COURSE_ID,
        courseMemoryId: MAT102_COURSE_MEMORY_ID,
        courseMemoryTitle: 'MAT102 课程共有记忆',
        courseMemoryText: MATH_COURSE_MEMORY_TEXTS[MAT102_COURSE_MEMORY_ID],
        courseReason: 'MAT102 proof-first 整门课答题协议；notebook 公共记忆提供具体证明模板。',
        textSource: 'scripts/maintenance/math-public-memory-concepts.mjs',
        notebookMemories: MAT102_NOTEBOOK_MEMORY_SPECS,
      }),
    );
    results.push(
      await updateCourseMemories(prisma, {
        courseId: process.env.MAT136_COURSE_ID || MAT136_COURSE_ID,
        courseMemoryId: MAT136_COURSE_MEMORY_ID,
        courseMemoryTitle: 'MAT136 课程知识地图',
        courseMemoryText: MATH_COURSE_MEMORY_TEXTS[MAT136_COURSE_MEMORY_ID],
        courseReason:
          'MAT136 Calculus II 整门课答题协议；notebook 公共记忆提供计算、判别和建模模板。',
        textSource:
          'scripts/maintenance/math-public-memory-concepts.mjs + scripts/maintenance/mat136-notebook-public-memory.json',
        notebookMemories: mat136NotebookMemories,
      }),
    );

    console.log(
      JSON.stringify(
        {
          results,
          changedIds: results.flatMap((result) =>
            result.updated.filter((item) => item.changed).map((item) => item.id),
          ),
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
  process.exit(1);
});
