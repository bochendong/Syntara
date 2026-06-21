#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  CSC148_COURSE_ID,
  CSC148_COURSE_MEMORY_ID,
  CSC148_COURSE_MEMORY_TITLE,
  CSC148_NOTEBOOK_MEMORY_SPECS,
  CSC148_OBSOLETE_MEMORY_IDS,
  CSC148_PUBLIC_MEMORY_TEXTS,
} from './csc148-public-memory-concepts.mjs';
import {
  buildTeachingControlMemoryText,
  teachingControlMemoryKind,
  teachingControlMemoryReason,
  withTeachingControlSourceReference,
} from '../../features/memory/data/teaching-control-memory.mjs';
import { assertSafeTeachingControlWrite } from './teaching-control-update-safety.mjs';

const ROOT = process.cwd();
const COURSE_ID = process.env.CSC148_COURSE_ID || CSC148_COURSE_ID;

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
      text: true,
      title: true,
      kind: true,
      reason: true,
      status: true,
      source: true,
      targetType: true,
      scope: true,
      courseId: true,
      notebookId: true,
    },
  });

  const same =
    existing &&
    existing.text === data.text &&
    existing.title === data.title &&
    existing.kind === data.kind &&
    existing.reason === data.reason &&
    existing.status === data.status &&
    existing.source === data.source &&
    existing.targetType === data.targetType &&
    existing.scope === data.scope &&
    existing.courseId === data.courseId &&
    existing.notebookId === data.notebookId;

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

  return { id: data.id, title: data.title, chars: data.text.length, changed: !same };
}

async function archiveObsoleteMemories(prisma, courseId) {
  if (CSC148_OBSOLETE_MEMORY_IDS.length === 0) return [];
  const rows = await prisma.studyMemory.findMany({
    where: {
      id: { in: CSC148_OBSOLETE_MEMORY_IDS },
      courseId,
      status: 'active',
    },
    select: { id: true, title: true },
  });
  const archived = [];
  for (const row of rows) {
    await prisma.studyMemory.update({
      where: { id: row.id },
      data: {
        status: 'archived',
        reason:
          'Archived by CSC148 teaching-control migration: old notebook mapping was shifted and is replaced by corrected specialist memory.',
        updatedAt: new Date(),
      },
    });
    await clearVectorChunks(prisma, row.id);
    archived.push(row);
  }
  return archived;
}

async function main() {
  loadEnvLocal();
  assertSafeTeachingControlWrite('update-csc148-public-memory-contracts');
  const prisma = new PrismaClient();

  try {
    const course = await prisma.course.findUnique({
      where: { id: COURSE_ID },
      select: { id: true, ownerId: true, name: true, courseCode: true },
    });
    if (!course) {
      throw new Error(`Course not found: ${COURSE_ID}`);
    }

    const notebookIds = CSC148_NOTEBOOK_MEMORY_SPECS.map((item) => item.notebookId);
    const notebooks = await prisma.notebook.findMany({
      where: { id: { in: notebookIds }, courseId: course.id },
      select: { id: true, name: true },
    });
    const notebookById = new Map(notebooks.map((notebook) => [notebook.id, notebook]));
    const missing = notebookIds.filter((id) => !notebookById.has(id));
    if (missing.length > 0) {
      throw new Error(`Missing CSC148 notebooks for ${course.id}: ${missing.join(', ')}`);
    }

    const sourceReferences = {
      maintainedBy: 'scripts/maintenance/update-csc148-public-memory-contracts.mjs',
      textSource: 'scripts/maintenance/csc148-public-memory-concepts.mjs',
      courseId: course.id,
    };
    const teachingControlSourceReferences = withTeachingControlSourceReference(sourceReferences);

    const updated = [];
    updated.push(
      await upsertMemory(prisma, {
        id: CSC148_COURSE_MEMORY_ID,
        ownerId: course.ownerId,
        courseId: course.id,
        notebookId: null,
        targetType: 'course',
        scope: 'public',
        kind: teachingControlMemoryKind('course'),
        status: 'active',
        source: 'manual_teaching_control_memory',
        title: CSC148_COURSE_MEMORY_TITLE,
        text: buildTeachingControlMemoryText({
          courseCode: 'CSC148',
          level: 'course',
          title: CSC148_COURSE_MEMORY_TITLE,
          legacyText: CSC148_PUBLIC_MEMORY_TEXTS[CSC148_COURSE_MEMORY_ID],
        }),
        reason: teachingControlMemoryReason('CSC148', 'course'),
        question: null,
        sourceReferences: teachingControlSourceReferences,
        confidence: 0.94,
      }),
    );

    for (const spec of CSC148_NOTEBOOK_MEMORY_SPECS) {
      const notebook = notebookById.get(spec.notebookId);
      const text = CSC148_PUBLIC_MEMORY_TEXTS[spec.memoryId];
      if (!text) {
        throw new Error(`Missing memory text for ${spec.memoryId}`);
      }
      updated.push(
        await upsertMemory(prisma, {
          id: spec.memoryId,
          ownerId: course.ownerId,
          courseId: course.id,
          notebookId: notebook.id,
          targetType: 'notebook',
          scope: 'public',
          kind: teachingControlMemoryKind('notebook'),
          status: 'active',
          source: 'manual_teaching_control_memory',
          title: spec.title,
          text: buildTeachingControlMemoryText({
            courseCode: 'CSC148',
            level: 'notebook',
            title: spec.title,
            legacyText: text,
            notebookId: notebook.id,
            notebookTitle: notebook.name,
          }),
          reason: teachingControlMemoryReason('CSC148', 'notebook'),
          question: null,
          sourceReferences: withTeachingControlSourceReference(sourceReferences, {
            notebookId: notebook.id,
            notebookName: notebook.name,
          }),
          confidence: 0.91,
        }),
      );
    }
    const archivedObsolete = await archiveObsoleteMemories(prisma, course.id);

    console.log(
      JSON.stringify(
        {
          course: { id: course.id, code: course.courseCode, name: course.name },
          updated,
          archivedObsolete,
          changedIds: updated.filter((item) => item.changed).map((item) => item.id),
          totalPublicMemories: updated.length,
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
