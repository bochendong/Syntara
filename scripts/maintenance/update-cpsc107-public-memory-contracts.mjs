#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
import {
  CPSC107_COURSE_MEMORY_ID,
  CPSC107_NOTEBOOK_DESCRIPTIONS,
  CPSC107_PUBLIC_MEMORY_TEXTS,
} from './cpsc107-public-memory-concepts.mjs';
import {
  buildTeachingControlMemoryText,
  teachingControlMemoryKind,
  teachingControlMemoryReason,
  withTeachingControlSourceReference,
} from '../../features/memory/data/teaching-control-memory.mjs';
import {
  assertSafeTeachingControlWrite,
  loadMaintenanceEnvFiles,
} from './teaching-control-update-safety.mjs';

async function updateMemory(prisma, id, text) {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT "id", "title", "text", "kind", "reason", "sourceReferences" FROM "StudyMemory" WHERE "id" = $1 AND "status" = $2',
    id,
    'active',
  );
  if (rows.length !== 1) {
    throw new Error(`Expected one active StudyMemory row for ${id}, found ${rows.length}`);
  }
  const isCourseMemory = id === CPSC107_COURSE_MEMORY_ID;
  const nextText = buildTeachingControlMemoryText({
    courseCode: 'CPSC107',
    level: isCourseMemory ? 'course' : 'notebook',
    title: rows[0].title,
    legacyText: text,
    notebookId: isCourseMemory ? null : id,
    notebookTitle: rows[0].title,
  });
  const nextKind = teachingControlMemoryKind(isCourseMemory ? 'course' : 'notebook');
  const nextReason = teachingControlMemoryReason('CPSC107', isCourseMemory ? 'course' : 'notebook');
  const nextSourceReferences = withTeachingControlSourceReference(rows[0].sourceReferences, {
    maintainedBy: 'scripts/maintenance/update-cpsc107-public-memory-contracts.mjs',
    textSource: 'scripts/maintenance/cpsc107-public-memory-concepts.mjs',
    legacyMemoryId: id,
  });
  if (rows[0].text === nextText && rows[0].kind === nextKind && rows[0].reason === nextReason) {
    return { title: rows[0].title, changed: false };
  }
  await prisma.$executeRawUnsafe(
    'UPDATE "StudyMemory" SET "text" = $1, "kind" = $2, "reason" = $3, "sourceReferences" = $4::jsonb, "confidence" = $5, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $6',
    nextText,
    nextKind,
    nextReason,
    JSON.stringify(nextSourceReferences),
    isCourseMemory ? 0.97 : 0.93,
    id,
  );
  await prisma.$executeRawUnsafe('DELETE FROM "StudyMemoryChunk" WHERE "memoryId" = $1', id);
  return { title: rows[0].title, changed: true };
}

async function updateNotebookDescription(prisma, id, description) {
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

async function main() {
  loadMaintenanceEnvFiles(process.cwd(), ['.env', '.env.local']);
  assertSafeTeachingControlWrite('update-cpsc107-public-memory-contracts');
  const prisma = new PrismaClient();

  try {
    const updated = [];
    for (const [id, text] of Object.entries(CPSC107_PUBLIC_MEMORY_TEXTS)) {
      const result = await updateMemory(prisma, id, text);
      updated.push({ id, title: result.title, changed: result.changed, chars: text.length });
    }

    const updatedNotebookDescriptions = [];
    for (const [id, description] of Object.entries(CPSC107_NOTEBOOK_DESCRIPTIONS)) {
      const result = await updateNotebookDescription(prisma, id, description);
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
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
