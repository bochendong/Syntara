#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const DEFAULT_COURSE_ID = 'cmpnueg4p001d8o017jee1mjq';
const DEFAULT_SOURCE_PATH = 'queue/production-csc108-questions.json';
const SOURCE_FILE_NAME = 'production-csc108-questions.json';

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

function loadSolutionMap(sourcePath) {
  const absolutePath = path.resolve(ROOT, sourcePath);
  const data = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  const questions = data.templateExports?.[0]?.questions;
  if (!Array.isArray(questions)) {
    throw new Error(`No questions found in ${sourcePath}`);
  }

  const solutionBySourceQuestionId = new Map();
  for (const question of questions) {
    const solutionCode = String(question.solutionCode || '').trim();
    if (!solutionCode) continue;
    solutionBySourceQuestionId.set(String(question.id), solutionCode);
  }
  return solutionBySourceQuestionId;
}

function sourceQuestionIdFrom(row) {
  const sourceMeta = row.sourceMeta && typeof row.sourceMeta === 'object' ? row.sourceMeta : {};
  return sourceMeta.sourceQuestionId == null ? null : String(sourceMeta.sourceQuestionId);
}

function gradingObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

async function main() {
  loadEnvLocal();
  const write = hasFlag('write');
  const courseId = argValue('course-id') || DEFAULT_COURSE_ID;
  const sourcePath = argValue('source') || DEFAULT_SOURCE_PATH;
  const solutionBySourceQuestionId = loadSolutionMap(sourcePath);

  const prisma = new PrismaClient();
  try {
    const rows = await prisma.notebookProblem.findMany({
      where: {
        type: 'code',
        OR: [{ courseId }, { notebook: { courseId } }],
        sourceMeta: {
          path: ['sourceFileName'],
          equals: SOURCE_FILE_NAME,
        },
      },
      select: {
        id: true,
        title: true,
        gradingJson: true,
        sourceMeta: true,
      },
      orderBy: [{ problemNumber: 'asc' }, { createdAt: 'asc' }],
    });

    const updates = [];
    const missingSolutions = [];
    for (const row of rows) {
      const sourceQuestionId = sourceQuestionIdFrom(row);
      const solutionCode = sourceQuestionId
        ? solutionBySourceQuestionId.get(sourceQuestionId)
        : undefined;

      if (!sourceQuestionId || !solutionCode) {
        missingSolutions.push({ id: row.id, title: row.title, sourceQuestionId });
        continue;
      }

      const currentGrading = gradingObject(row.gradingJson);
      if (
        currentGrading.referenceAnswer === solutionCode &&
        currentGrading.solutionCode === solutionCode
      ) {
        continue;
      }

      updates.push({
        id: row.id,
        title: row.title,
        sourceQuestionId,
        gradingJson: {
          ...currentGrading,
          type: 'code',
          referenceAnswer: solutionCode,
          solutionCode,
        },
      });
    }

    console.log(
      JSON.stringify(
        {
          mode: write ? 'write' : 'dry-run',
          courseId,
          sourcePath,
          sourceSolutionCount: solutionBySourceQuestionId.size,
          matchedProblemCount: rows.length,
          updateCount: updates.length,
          missingSolutionCount: missingSolutions.length,
          missingSolutions,
        },
        null,
        2,
      ),
    );

    if (!write || updates.length === 0) return;

    await prisma.$transaction(
      updates.map((update) =>
        prisma.notebookProblem.update({
          where: { id: update.id },
          data: { gradingJson: update.gradingJson },
        }),
      ),
      { timeout: 60_000 },
    );

    console.log(JSON.stringify({ updated: updates.length }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
