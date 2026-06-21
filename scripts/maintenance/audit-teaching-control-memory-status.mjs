#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  CPSC107_COURSE_MEMORY_ID,
  CPSC107_PUBLIC_MEMORY_TEXTS,
} from './cpsc107-public-memory-concepts.mjs';
import {
  CSC108_COURSE_ID,
  CSC108_COURSE_MEMORY_ID,
  CSC108_NOTEBOOK_MEMORY_SPECS,
} from './csc108-public-memory-concepts.mjs';
import {
  CSC148_COURSE_ID,
  CSC148_COURSE_MEMORY_ID,
  CSC148_NOTEBOOK_MEMORY_SPECS,
  CSC148_OBSOLETE_MEMORY_IDS,
} from './csc148-public-memory-concepts.mjs';
import {
  MAT102_COURSE_ID,
  MAT102_COURSE_MEMORY_ID,
  MAT102_NOTEBOOK_MEMORY_SPECS,
  MAT136_COURSE_ID,
  MAT136_COURSE_MEMORY_ID,
} from './math-public-memory-concepts.mjs';
import { loadMaintenanceEnvFiles } from './teaching-control-update-safety.mjs';

const ROOT = process.cwd();
const MAT136_NOTEBOOK_MEMORY_PATH = path.join(
  ROOT,
  'scripts/maintenance/mat136-notebook-public-memory.json',
);
const BACKUP_DIR = path.join(ROOT, 'tmp/teaching-control-memory-backups');
const CONTROL_HEADINGS = [
  '## Answer contract',
  '## Common mistakes',
  '## Validation checklist',
  '## 禁止事项',
];

function readMat136MemoryIds() {
  const payload = JSON.parse(fs.readFileSync(MAT136_NOTEBOOK_MEMORY_PATH, 'utf8'));
  return payload.memories.map((entry) => entry.id);
}

function targetMemorySpecs() {
  return [
    ...Object.keys(CPSC107_PUBLIC_MEMORY_TEXTS).map((id) => ({
      id,
      courseCode: 'CPSC107',
      level: id === CPSC107_COURSE_MEMORY_ID ? 'course' : 'notebook',
    })),
    {
      id: CSC108_COURSE_MEMORY_ID,
      courseCode: 'CSC108',
      level: 'course',
      courseId: CSC108_COURSE_ID,
    },
    ...CSC108_NOTEBOOK_MEMORY_SPECS.map((spec) => ({
      id: spec.memoryId,
      courseCode: 'CSC108',
      level: 'notebook',
      courseId: CSC108_COURSE_ID,
    })),
    {
      id: CSC148_COURSE_MEMORY_ID,
      courseCode: 'CSC148',
      level: 'course',
      courseId: CSC148_COURSE_ID,
    },
    ...CSC148_NOTEBOOK_MEMORY_SPECS.map((spec) => ({
      id: spec.memoryId,
      courseCode: 'CSC148',
      level: 'notebook',
      courseId: CSC148_COURSE_ID,
    })),
    {
      id: MAT102_COURSE_MEMORY_ID,
      courseCode: 'MAT102',
      level: 'course',
      courseId: MAT102_COURSE_ID,
    },
    ...MAT102_NOTEBOOK_MEMORY_SPECS.map((spec) => ({
      id: spec.memoryId,
      courseCode: 'MAT102',
      level: 'notebook',
      courseId: MAT102_COURSE_ID,
    })),
    {
      id: MAT136_COURSE_MEMORY_ID,
      courseCode: 'MAT136',
      level: 'course',
      courseId: MAT136_COURSE_ID,
    },
    ...readMat136MemoryIds().map((id) => ({
      id,
      courseCode: 'MAT136',
      level: 'notebook',
      courseId: MAT136_COURSE_ID,
    })),
  ];
}

function unique(items) {
  return [...new Set(items)];
}

function sanitizeDatabaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}/...`;
  } catch {
    return 'invalid DATABASE_URL';
  }
}

async function fetchChunkCounts(prisma, ids) {
  const tableRows = await prisma.$queryRawUnsafe(
    `SELECT to_regclass('"StudyMemoryChunk"')::text AS "tableName"`,
  );
  if (!tableRows[0]?.tableName) return new Map();
  const rows = await prisma.$queryRawUnsafe(
    'SELECT "memoryId", COUNT(*)::int AS count FROM "StudyMemoryChunk" WHERE "memoryId" = ANY($1::text[]) GROUP BY "memoryId"',
    ids,
  );
  return new Map(rows.map((row) => [row.memoryId, Number(row.count)]));
}

function validateDesiredMemory(spec, row, chunkCount) {
  const expectedKind =
    spec.level === 'course' ? 'course_teaching_control' : 'notebook_teaching_control';
  const text = String(row?.text || '');
  const missingHeadings = CONTROL_HEADINGS.filter((heading) => !text.includes(heading));
  const failures = [];
  if (!row) failures.push('missing');
  if (row && row.status !== 'active') failures.push(`status=${row.status}`);
  if (row && row.kind !== expectedKind) failures.push(`kind=${row.kind}`);
  if (row && missingHeadings.length > 0)
    failures.push(`missingHeadings=${missingHeadings.join('|')}`);
  return {
    id: spec.id,
    courseCode: spec.courseCode,
    level: spec.level,
    courseId: row?.courseId || spec.courseId || null,
    title: row?.title || null,
    status: row?.status || null,
    kind: row?.kind || null,
    source: row?.source || null,
    chunkCount,
    ok: failures.length === 0,
    failures,
  };
}

function validateObsoleteMemory(id, row, chunkCount) {
  const ok = !row || row.status === 'archived';
  return {
    id,
    status: row?.status || 'missing',
    kind: row?.kind || null,
    title: row?.title || null,
    chunkCount,
    ok,
    failures: ok ? [] : [`obsoleteStill${row.status || 'present'}`],
  };
}

async function writeBackup(rows, chunkCounts) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `${stamp}-teaching-control-memory-backup.json`);
  const payload = {
    createdAt: new Date().toISOString(),
    database: sanitizeDatabaseUrl(),
    rows: rows.map((row) => ({
      ...row,
      chunkCount: chunkCounts.get(row.id) || 0,
    })),
  };
  fs.writeFileSync(backupPath, `${JSON.stringify(payload, null, 2)}\n`);
  return backupPath;
}

async function main() {
  loadMaintenanceEnvFiles(ROOT, ['.env', '.env.local']);
  const desired = targetMemorySpecs();
  const obsoleteIds = CSC148_OBSOLETE_MEMORY_IDS;
  const allIds = unique([...desired.map((spec) => spec.id), ...obsoleteIds]);
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.studyMemory.findMany({
      where: { id: { in: allIds } },
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
        question: true,
        sourceReferences: true,
        confidence: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ courseId: 'asc' }, { targetType: 'asc' }, { id: 'asc' }],
    });
    const rowById = new Map(rows.map((row) => [row.id, row]));
    const chunkCounts = await fetchChunkCounts(prisma, allIds);
    const desiredValidations = desired.map((spec) =>
      validateDesiredMemory(spec, rowById.get(spec.id), chunkCounts.get(spec.id) || 0),
    );
    const obsoleteValidations = obsoleteIds.map((id) =>
      validateObsoleteMemory(id, rowById.get(id), chunkCounts.get(id) || 0),
    );
    const failures = [
      ...desiredValidations.filter((item) => !item.ok),
      ...obsoleteValidations.filter((item) => !item.ok),
    ];
    const byCourse = desiredValidations.reduce((acc, item) => {
      acc[item.courseCode] ||= {
        expected: 0,
        found: 0,
        ok: 0,
        active: 0,
        teachingControl: 0,
        indexed: 0,
      };
      acc[item.courseCode].expected += 1;
      if (item.status) acc[item.courseCode].found += 1;
      if (item.ok) acc[item.courseCode].ok += 1;
      if (item.status === 'active') acc[item.courseCode].active += 1;
      if (item.kind === 'course_teaching_control' || item.kind === 'notebook_teaching_control') {
        acc[item.courseCode].teachingControl += 1;
      }
      if (item.chunkCount > 0) acc[item.courseCode].indexed += 1;
      return acc;
    }, {});
    const backupPath = process.argv.includes('--backup')
      ? await writeBackup(rows, chunkCounts)
      : null;
    const expectControl = process.argv.includes('--expect-control');
    console.log(
      JSON.stringify(
        {
          database: sanitizeDatabaseUrl(),
          desiredCount: desired.length,
          obsoleteCount: obsoleteIds.length,
          foundRows: rows.length,
          backupPath,
          byCourse,
          failures,
          obsolete: obsoleteValidations,
        },
        null,
        2,
      ),
    );
    if (expectControl && failures.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
