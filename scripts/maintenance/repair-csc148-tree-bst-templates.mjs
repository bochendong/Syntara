#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  collectCsc148TreeBstTemplateIssues,
  CSC148_TREE_BST_SOURCE_IDS,
  CSC148_TREE_BST_TEMPLATE_REPAIR_VERSION,
  normalizeCsc148TreeBstJson,
  normalizeCsc148TreeBstPublicContent,
} from './csc148-tree-bst-template-normalizer.mjs';

const ROOT = process.cwd();
const COURSE_ID = 'cmqjfarz800158oi68s595q9n';

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

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sourceQuestionIdFor(problem) {
  return String(problem.sourceMeta?.sourceQuestionId ?? '');
}

function normalizeProblem(problem) {
  const sourceQuestionId = sourceQuestionIdFor(problem);
  const sourceMetaObject =
    problem.sourceMeta &&
    typeof problem.sourceMeta === 'object' &&
    !Array.isArray(problem.sourceMeta)
      ? problem.sourceMeta
      : {};
  const repairAt = sourceMetaObject.treeBstTemplateRepairAt ?? new Date().toISOString();
  const publicContentJson = normalizeCsc148TreeBstPublicContent(
    problem.publicContentJson,
    sourceQuestionId,
  );
  const gradingJson = normalizeCsc148TreeBstJson(problem.gradingJson, sourceQuestionId);
  const secretJudgeJson = problem.secret?.secretJudgeJson
    ? normalizeCsc148TreeBstJson(problem.secret.secretJudgeJson, sourceQuestionId)
    : null;
  const sourceMeta = {
    ...sourceMetaObject,
    treeBstTemplateRepair: CSC148_TREE_BST_TEMPLATE_REPAIR_VERSION,
    treeBstTemplateRepairAt: repairAt,
  };

  return {
    publicContentJson,
    gradingJson,
    secretJudgeJson,
    sourceMeta,
    changed:
      !sameJson(problem.publicContentJson, publicContentJson) ||
      !sameJson(problem.gradingJson, gradingJson) ||
      !sameJson(problem.secret?.secretJudgeJson ?? null, secretJudgeJson) ||
      !sameJson(problem.sourceMeta, sourceMeta),
  };
}

async function main() {
  loadEnvLocal();

  const write = hasFlag('write');
  const prisma = new PrismaClient();

  try {
    const course = await prisma.course.findUnique({
      where: { id: COURSE_ID },
      select: { id: true, name: true, courseCode: true, problemCount: true },
    });
    if (!course) throw new Error(`Course not found: ${COURSE_ID}`);

    const problems = await prisma.notebookProblem.findMany({
      where: { courseId: COURSE_ID },
      include: { secret: true },
      orderBy: { problemNumber: 'asc' },
    });

    const targeted = problems.filter((problem) =>
      CSC148_TREE_BST_SOURCE_IDS.has(sourceQuestionIdFor(problem)),
    );

    const beforeIssues = targeted
      .map((problem) => ({
        id: problem.id,
        problemNumber: problem.problemNumber,
        title: problem.title,
        sourceQuestionId: sourceQuestionIdFor(problem),
        issues: collectCsc148TreeBstTemplateIssues(
          problem.publicContentJson,
          problem.gradingJson,
          problem.secret?.secretJudgeJson,
        ),
      }))
      .filter((item) => item.issues.length > 0);

    const updates = targeted
      .map((problem) => ({
        problem,
        normalized: normalizeProblem(problem),
      }))
      .filter((item) => item.normalized.changed);

    const preview = {
      mode: write ? 'write' : 'dry-run',
      course,
      totalCourseProblems: problems.length,
      targetedProblemCount: targeted.length,
      changedProblemCount: updates.length,
      beforeIssueCount: beforeIssues.length,
      beforeIssues,
      changedProblems: updates.map(({ problem }) => ({
        id: problem.id,
        problemNumber: problem.problemNumber,
        title: problem.title,
        sourceQuestionId: sourceQuestionIdFor(problem),
      })),
    };
    console.log(JSON.stringify(preview, null, 2));

    if (!write) return;

    await prisma.$transaction(
      async (tx) => {
        for (const { problem, normalized } of updates) {
          await tx.notebookProblem.update({
            where: { id: problem.id },
            data: {
              publicContentJson: normalized.publicContentJson,
              gradingJson: normalized.gradingJson,
              sourceMeta: normalized.sourceMeta,
            },
          });

          if (problem.secret && normalized.secretJudgeJson) {
            await tx.notebookProblemSecret.update({
              where: { problemId: problem.id },
              data: { secretJudgeJson: normalized.secretJudgeJson },
            });
          }
        }
      },
      { timeout: 60_000 },
    );

    const after = await prisma.notebookProblem.findMany({
      where: { courseId: COURSE_ID },
      include: { secret: true },
      orderBy: { problemNumber: 'asc' },
    });
    const afterTargeted = after.filter((problem) =>
      CSC148_TREE_BST_SOURCE_IDS.has(sourceQuestionIdFor(problem)),
    );
    const afterIssues = afterTargeted
      .map((problem) => ({
        id: problem.id,
        problemNumber: problem.problemNumber,
        title: problem.title,
        sourceQuestionId: sourceQuestionIdFor(problem),
        issues: collectCsc148TreeBstTemplateIssues(
          problem.publicContentJson,
          problem.gradingJson,
          problem.secret?.secretJudgeJson,
        ),
      }))
      .filter((item) => item.issues.length > 0);

    console.log(
      JSON.stringify(
        {
          mode: 'write-complete',
          updatedProblemCount: updates.length,
          afterIssueCount: afterIssues.length,
          afterIssues,
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
