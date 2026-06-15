#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
import {
  CPSC107_COURSE_MEMORY_ID,
  CPSC107_NOTEBOOK_DESCRIPTIONS,
  CPSC107_PUBLIC_MEMORY_TEXTS,
} from './cpsc107-public-memory-concepts.mjs';

const prisma = new PrismaClient();

async function updateMemory(id, text) {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT "id", "title", "text", "kind", "reason" FROM "StudyMemory" WHERE "id" = $1 AND "status" = $2',
    id,
    'active',
  );
  if (rows.length !== 1) {
    throw new Error(`Expected one active StudyMemory row for ${id}, found ${rows.length}`);
  }
  const isCourseMemory = id === CPSC107_COURSE_MEMORY_ID;
  const nextKind = isCourseMemory ? 'course_concept_card' : 'notebook_operational_guide';
  const nextReason = isCourseMemory
    ? 'CPSC107 整门课 concept card；精确课程合约由 Course Pack 直接注入。'
    : 'CPSC107 单本笔记本详细操作记忆；包含指导、模板例子和检查清单。精确课程合约由 Course Pack 直接注入。';
  if (rows[0].text === text && rows[0].kind === nextKind && rows[0].reason === nextReason) {
    return { title: rows[0].title, changed: false };
  }
  await prisma.$executeRawUnsafe(
    'UPDATE "StudyMemory" SET "text" = $1, "kind" = $2, "reason" = $3, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $4',
    text,
    nextKind,
    nextReason,
    id,
  );
  await prisma.$executeRawUnsafe('DELETE FROM "StudyMemoryChunk" WHERE "memoryId" = $1', id);
  return { title: rows[0].title, changed: true };
}

async function updateNotebookDescription(id, description) {
  const notebook = await prisma.notebook.findUnique({
    where: { id },
    select: { id: true, name: true, description: true },
  });
  if (!notebook) {
    throw new Error(`Expected Notebook row for ${id}`);
  }
  if (notebook.description === description) {
    return { name: notebook.name, changed: false };
  }
  await prisma.notebook.update({
    where: { id },
    data: { description },
  });
  return { name: notebook.name, changed: true };
}

try {
  const updated = [];
  for (const [id, text] of Object.entries(CPSC107_PUBLIC_MEMORY_TEXTS)) {
    const result = await updateMemory(id, text);
    updated.push({ id, title: result.title, changed: result.changed, chars: text.length });
  }

  const updatedNotebookDescriptions = [];
  for (const [id, description] of Object.entries(CPSC107_NOTEBOOK_DESCRIPTIONS)) {
    const result = await updateNotebookDescription(id, description);
    updatedNotebookDescriptions.push({
      id,
      name: result.name,
      changed: result.changed,
      chars: description.length,
    });
  }

  console.log(
    JSON.stringify(
      {
        updated,
        updatedNotebookDescriptions,
        invalidatedVectorChunksFor: updated.filter((item) => item.changed).map((item) => item.id),
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
