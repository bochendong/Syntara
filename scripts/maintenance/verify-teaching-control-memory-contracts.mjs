#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {
  CPSC107_COURSE_MEMORY_ID,
  CPSC107_PUBLIC_MEMORY_TEXTS,
} from './cpsc107-public-memory-concepts.mjs';
import {
  CSC108_COURSE_MEMORY_ID,
  CSC108_COURSE_MEMORY_TITLE,
  CSC108_NOTEBOOK_MEMORY_SPECS,
  CSC108_PUBLIC_MEMORY_TEXTS,
} from './csc108-public-memory-concepts.mjs';
import {
  CSC148_COURSE_MEMORY_ID,
  CSC148_COURSE_MEMORY_TITLE,
  CSC148_NOTEBOOK_MEMORY_SPECS,
  CSC148_PUBLIC_MEMORY_TEXTS,
} from './csc148-public-memory-concepts.mjs';
import {
  MAT102_COURSE_MEMORY_ID,
  MAT102_NOTEBOOK_MEMORY_SPECS,
  MAT136_COURSE_MEMORY_ID,
  MATH_COURSE_MEMORY_TEXTS,
} from './math-public-memory-concepts.mjs';
import {
  buildTeachingControlMemoryText,
  teachingControlMemoryKind,
  teachingControlMemoryReason,
  withTeachingControlSourceReference,
} from '../../features/memory/data/teaching-control-memory.mjs';

const ROOT = process.cwd();
const MAT136_NOTEBOOK_MEMORY_PATH = path.join(
  ROOT,
  'scripts/maintenance/mat136-notebook-public-memory.json',
);

const REQUIRED_HEADINGS = [
  '## Answer contract',
  '## Common mistakes',
  '## Validation checklist',
  '## 禁止事项',
];

function readMat136NotebookMemorySpecs() {
  const payload = JSON.parse(fs.readFileSync(MAT136_NOTEBOOK_MEMORY_PATH, 'utf8'));
  return payload.memories.map((entry) => ({
    memoryId: entry.id,
    notebookId: entry.notebookId,
    title: entry.title,
    text: entry.text,
  }));
}

function buildEntry({ courseCode, id, title, legacyText, level, notebookId, notebookTitle }) {
  const text = buildTeachingControlMemoryText({
    courseCode,
    level,
    title,
    legacyText,
    notebookId,
    notebookTitle,
  });
  return {
    courseCode,
    id,
    level,
    title,
    notebookId: notebookId || null,
    kind: teachingControlMemoryKind(level),
    reason: teachingControlMemoryReason(courseCode, level),
    sourceReferences: withTeachingControlSourceReference(null, {
      textSource: 'scripts/maintenance/verify-teaching-control-memory-contracts.mjs',
      legacyMemoryId: id,
    }),
    text,
  };
}

function buildEntries() {
  const entries = [];

  for (const [id, legacyText] of Object.entries(CPSC107_PUBLIC_MEMORY_TEXTS)) {
    entries.push(
      buildEntry({
        courseCode: 'CPSC107',
        id,
        title: id === CPSC107_COURSE_MEMORY_ID ? 'CPSC107 课程共有记忆' : id,
        legacyText,
        level: id === CPSC107_COURSE_MEMORY_ID ? 'course' : 'notebook',
        notebookId: id === CPSC107_COURSE_MEMORY_ID ? null : id,
      }),
    );
  }

  entries.push(
    buildEntry({
      courseCode: 'CSC108',
      id: CSC108_COURSE_MEMORY_ID,
      title: CSC108_COURSE_MEMORY_TITLE,
      legacyText: CSC108_PUBLIC_MEMORY_TEXTS[CSC108_COURSE_MEMORY_ID],
      level: 'course',
    }),
  );
  for (const spec of CSC108_NOTEBOOK_MEMORY_SPECS) {
    entries.push(
      buildEntry({
        courseCode: 'CSC108',
        id: spec.memoryId,
        title: spec.title,
        legacyText: CSC108_PUBLIC_MEMORY_TEXTS[spec.memoryId],
        level: 'notebook',
        notebookId: spec.notebookId,
        notebookTitle: spec.title,
      }),
    );
  }

  entries.push(
    buildEntry({
      courseCode: 'CSC148',
      id: CSC148_COURSE_MEMORY_ID,
      title: CSC148_COURSE_MEMORY_TITLE,
      legacyText: CSC148_PUBLIC_MEMORY_TEXTS[CSC148_COURSE_MEMORY_ID],
      level: 'course',
    }),
  );
  for (const spec of CSC148_NOTEBOOK_MEMORY_SPECS) {
    entries.push(
      buildEntry({
        courseCode: 'CSC148',
        id: spec.memoryId,
        title: spec.title,
        legacyText: CSC148_PUBLIC_MEMORY_TEXTS[spec.memoryId],
        level: 'notebook',
        notebookId: spec.notebookId,
        notebookTitle: spec.title,
      }),
    );
  }

  entries.push(
    buildEntry({
      courseCode: 'MAT102',
      id: MAT102_COURSE_MEMORY_ID,
      title: 'MAT102 课程共有记忆',
      legacyText: MATH_COURSE_MEMORY_TEXTS[MAT102_COURSE_MEMORY_ID],
      level: 'course',
    }),
  );
  for (const spec of MAT102_NOTEBOOK_MEMORY_SPECS) {
    entries.push(
      buildEntry({
        courseCode: 'MAT102',
        id: spec.memoryId,
        title: spec.title,
        legacyText: spec.text,
        level: 'notebook',
        notebookId: spec.notebookId,
        notebookTitle: spec.title,
      }),
    );
  }

  entries.push(
    buildEntry({
      courseCode: 'MAT136',
      id: MAT136_COURSE_MEMORY_ID,
      title: 'MAT136 课程知识地图',
      legacyText: MATH_COURSE_MEMORY_TEXTS[MAT136_COURSE_MEMORY_ID],
      level: 'course',
    }),
  );
  for (const spec of readMat136NotebookMemorySpecs()) {
    entries.push(
      buildEntry({
        courseCode: 'MAT136',
        id: spec.memoryId,
        title: spec.title,
        legacyText: spec.text,
        level: 'notebook',
        notebookId: spec.notebookId,
        notebookTitle: spec.title,
      }),
    );
  }

  return entries;
}

function validateEntry(entry) {
  const missingHeadings = REQUIRED_HEADINGS.filter((heading) => !entry.text.includes(heading));
  const sourceReferencesOk = Boolean(
    Array.isArray(entry.sourceReferences) &&
    entry.sourceReferences[0]?.order === 1 &&
    entry.sourceReferences[0]?.title,
  );
  return {
    id: entry.id,
    courseCode: entry.courseCode,
    level: entry.level,
    kind: entry.kind,
    chars: entry.text.length,
    ok: missingHeadings.length === 0 && sourceReferencesOk,
    missingHeadings,
    sourceReferencesOk,
  };
}

const entries = buildEntries();
const validations = entries.map(validateEntry);
const failures = validations.filter((item) => !item.ok);

console.log(
  JSON.stringify(
    {
      total: entries.length,
      byCourse: entries.reduce((acc, entry) => {
        acc[entry.courseCode] = (acc[entry.courseCode] || 0) + 1;
        return acc;
      }, {}),
      failures,
      sample: validations.slice(0, 8),
    },
    null,
    2,
  ),
);

if (failures.length > 0) {
  process.exitCode = 1;
}
