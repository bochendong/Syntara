#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const DEFAULT_COURSE_ID = 'cmpnueg4p001d8o017jee1mjq';
const DEFAULT_SOURCE_PATH = 'queue/production-csc108-questions.json';
const SOURCE_FILE_NAME = 'production-csc108-questions.json';
const CATEGORY_NOTEBOOK_IDS = {
  Basic: 'queue-csc108-02-control',
  Dictionary: 'queue-csc108-07-dictionary',
  List: 'queue-csc108-04-list',
  Loop: 'queue-csc108-03-loop',
  OOP: 'queue-csc108-11-class',
  Regex: 'queue-csc108-09-regex',
  StringMethod: 'queue-csc108-02-control',
  Ticket: 'queue-csc108-02-control',
};

const FUNCTION_NOTEBOOK_IDS = {
  swap_values: 'queue-csc108-04-list',
  my_find: 'queue-csc108-10-running-time',
  my_split: 'queue-csc108-04-list',
  has_3_consecutive_letters: 'queue-csc108-03-loop',
  find_first_uppercase: 'queue-csc108-03-loop',
  letters_first_digits_last: 'queue-csc108-03-loop',
  time_on_task: 'queue-csc108-10-running-time',
  find_palindrome_words: 'queue-csc108-04-list',
  word_pattern: 'queue-csc108-07-dictionary',
};

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

function hashText(text) {
  return createHash('sha256').update(text).digest('hex');
}

function cleanTag(value) {
  const text = String(value ?? '').trim();
  return text && text.length <= 30 ? text : null;
}

function uniqueTags(values) {
  return Array.from(new Set(values.map(cleanTag).filter(Boolean))).slice(0, 16);
}

function sanitizeTestId(value, fallback) {
  const text = String(value ?? '')
    .trim()
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return text || fallback;
}

function extractFunctionSignature(templateCode) {
  const line = String(templateCode ?? '')
    .split(/\r?\n/)
    .map((item) => item.trimEnd())
    .find((item) => /^(def|class)\s+/.test(item.trimStart()));
  return line?.trim() || '';
}

function extractDocstring(body) {
  const trimmed = body.trimStart();
  const singleLine = trimmed.match(/^"""([^"]{1,500})"""/);
  if (singleLine) return singleLine[1].trim();
  const multiLine = trimmed.match(/^"""([\s\S]{1,500}?)"""/);
  return multiLine?.[1].replace(/\s+/g, ' ').trim();
}

function extractTestMethods(testCode) {
  const lines = String(testCode ?? '').split(/\r?\n/);
  const methods = [];
  let current = null;

  for (const line of lines) {
    if (/^    def test_/.test(line)) {
      if (current) methods.push(current);
      current = [line];
      continue;
    }

    if (!current) continue;

    if (/^    def /.test(line)) {
      methods.push(current);
      current = [line];
      continue;
    }

    if (/^if __name__/.test(line)) {
      methods.push(current);
      current = null;
      continue;
    }

    current.push(line);
  }

  if (current) methods.push(current);
  return methods.map((methodLines, index) => {
    const name = methodLines[0].match(/def\s+([A-Za-z_][A-Za-z0-9_]*)/)?.[1] ?? `test_${index + 1}`;
    const body = methodLines
      .slice(1)
      .filter((line) => line.trim())
      .map((line) => line.replace(/^        /, ''))
      .join('\n')
      .trim();
    return { name, body };
  });
}

function buildAssertionExpression(body) {
  return `(lambda __ns: (exec(${JSON.stringify(
    body,
  )}, __ns, __ns), True)[1])({**globals(), "self": __import__("unittest").TestCase()})`;
}

function buildCodeTests(testCode, kind) {
  return extractTestMethods(testCode).map((method, index) => {
    const expression = buildAssertionExpression(method.body);
    if (Buffer.byteLength(expression, 'utf8') > 4000) {
      throw new Error(`${kind} test ${method.name} is too large for the problem schema.`);
    }
    return {
      id: `${kind}_${String(index + 1).padStart(2, '0')}_${sanitizeTestId(method.name, 'case')}`.slice(
        0,
        64,
      ),
      description:
        extractDocstring(method.body) || method.name.replace(/^test_/, '').replace(/_/g, ' '),
      expression,
      expected: 'true',
    };
  });
}

function buildSampleIO(description) {
  const lines = String(description ?? '').split(/\r?\n/);
  const samples = [];
  for (let index = 0; index < lines.length; index += 1) {
    const input = lines[index].trim().match(/^>>>\s*(.+)$/)?.[1];
    if (!input) continue;
    const output = lines[index + 1]?.trim();
    if (!output || output.startsWith('>>>')) continue;
    samples.push({ input, output });
  }
  return samples.slice(0, 12);
}

function normalizeDifficulty(value) {
  return ['easy', 'medium', 'hard'].includes(value) ? value : 'medium';
}

function notebookIdForQuestion(question) {
  return (
    FUNCTION_NOTEBOOK_IDS[question.functionName] ?? CATEGORY_NOTEBOOK_IDS[question.category] ?? null
  );
}

function buildDrafts(sourceData) {
  const templateExport = sourceData.templateExports?.[0];
  const questions = Array.isArray(templateExport?.questions) ? templateExport.questions : [];
  if (questions.length === 0) {
    throw new Error('No questions found in source JSON.');
  }

  return questions.map((question) => {
    const functionSignature = extractFunctionSignature(question.templateCode);
    const solutionCode = String(question.solutionCode || '').trim();
    const publicTests = buildCodeTests(question.publicTestCode, 'public');
    const secretTests = buildCodeTests(question.secretTestCode, 'secret');
    const publishable = Boolean(
      functionSignature && publicTests.length > 0 && secretTests.length > 0,
    );
    const validationErrors = [
      ...(functionSignature ? [] : ['缺少 function signature']),
      ...(publicTests.length > 0 ? [] : ['缺少 public tests']),
      ...(secretTests.length > 0 ? [] : ['缺少 secret tests']),
    ];

    return {
      draftId: `production-csc108-${question.id}`,
      notebookId: notebookIdForQuestion(question),
      title: String(
        question.title || question.functionName || `CSC108 question ${question.id}`,
      ).slice(0, 200),
      type: 'code',
      status: publishable ? 'published' : 'draft',
      source: 'manual',
      points: 1,
      tags: uniqueTags(['CSC108', 'python', question.category, question.questionNumber]),
      difficulty: normalizeDifficulty(question.difficulty),
      publicContent: {
        type: 'code',
        stem: String(question.description || '').trim(),
        language: 'python',
        starterCode: String(question.templateCode || ''),
        functionSignature,
        constraints: [],
        publicTests,
        sampleIO: buildSampleIO(question.description),
        secretConfigPresent: secretTests.length > 0,
      },
      grading: {
        type: 'code',
        publishRequirementsMet: publishable,
        ...(solutionCode
          ? {
              referenceAnswer: solutionCode,
              solutionCode,
            }
          : {}),
      },
      secretJudge:
        secretTests.length > 0
          ? {
              language: 'python',
              secretTests,
              timeoutMs: 5000,
            }
          : undefined,
      sourceMeta: {
        source: 'queue-json',
        sourcePath: DEFAULT_SOURCE_PATH,
        sourceFileName: SOURCE_FILE_NAME,
        sourceApi: sourceData.sourceApi ?? null,
        sourceCourse: sourceData.course ?? null,
        normalizedCourseCode: sourceData.normalizedCourseCode ?? null,
        sourceQuestionId: question.id,
        sourceQuestionNumber: question.questionNumber,
        sourceCourseTemplateId: question.courseTemplateId,
        sourceCategory: question.category,
        sourceFunctionName: question.functionName,
        sourceCreatedAt: question.createdAt,
        sourceUpdatedAt: question.updatedAt,
        assignedNotebookId: notebookIdForQuestion(question),
      },
      validationErrors,
    };
  });
}

async function refreshCourseSummaryFields(prisma, courseId) {
  const notebookAggregate = await prisma.notebook.aggregate({
    where: { courseId },
    _count: { _all: true },
    _sum: {
      sceneCount: true,
      speechReadyCount: true,
      speechTotalCount: true,
    },
  });
  const [problemCount, publishedProblemCount] = await Promise.all([
    prisma.notebookProblem.count({ where: { OR: [{ courseId }, { notebook: { courseId } }] } }),
    prisma.notebookProblem.count({
      where: { status: 'published', OR: [{ courseId }, { notebook: { courseId } }] },
    }),
  ]);

  await prisma.course.updateMany({
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

async function loadExistingSourceQuestionIds(prisma, courseId) {
  const rows = await prisma.notebookProblem.findMany({
    where: {
      OR: [{ courseId }, { notebook: { courseId } }],
    },
    select: {
      id: true,
      title: true,
      sourceMeta: true,
    },
  });
  const ids = new Set();
  for (const row of rows) {
    const sourceMeta = row.sourceMeta && typeof row.sourceMeta === 'object' ? row.sourceMeta : {};
    if (sourceMeta.sourceFileName !== SOURCE_FILE_NAME) continue;
    ids.add(String(sourceMeta.sourceQuestionId));
  }
  return ids;
}

async function main() {
  loadEnvLocal();
  const write = hasFlag('write');
  const allowDuplicates = hasFlag('allow-duplicates');
  const courseId = argValue('course-id') || DEFAULT_COURSE_ID;
  const sourcePath = argValue('source') || DEFAULT_SOURCE_PATH;
  const absoluteSourcePath = path.resolve(ROOT, sourcePath);
  const sourceText = fs.readFileSync(absoluteSourcePath, 'utf8');
  const sourceData = JSON.parse(sourceText);
  const drafts = buildDrafts(sourceData);

  const prisma = new PrismaClient();
  try {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        ownerId: true,
        name: true,
        courseCode: true,
        problemCount: true,
        publishedProblemCount: true,
      },
    });
    if (!course) throw new Error(`Course not found: ${courseId}`);

    const existingSourceIds = allowDuplicates
      ? new Set()
      : await loadExistingSourceQuestionIds(prisma, courseId);
    const draftsToInsert = drafts.filter(
      (draft) => !existingSourceIds.has(String(draft.sourceMeta.sourceQuestionId)),
    );
    const assignedNotebookIds = Array.from(
      new Set(draftsToInsert.map((draft) => draft.notebookId).filter(Boolean)),
    );
    const existingAssignedNotebookIds =
      assignedNotebookIds.length > 0
        ? new Set(
            (
              await prisma.notebook.findMany({
                where: { id: { in: assignedNotebookIds }, courseId },
                select: { id: true },
              })
            ).map((notebook) => notebook.id),
          )
        : new Set();
    const missingAssignedNotebookIds = assignedNotebookIds.filter(
      (notebookId) => !existingAssignedNotebookIds.has(notebookId),
    );

    const publicTestCount = draftsToInsert.reduce(
      (sum, draft) => sum + draft.publicContent.publicTests.length,
      0,
    );
    const secretTestCount = draftsToInsert.reduce(
      (sum, draft) => sum + (draft.secretJudge?.secretTests.length ?? 0),
      0,
    );
    const draftProblemCount = draftsToInsert.filter((draft) => draft.status !== 'published').length;

    console.log(
      JSON.stringify(
        {
          mode: write ? 'write' : 'dry-run',
          course,
          sourcePath,
          sourceQuestionCount: drafts.length,
          duplicateSourceQuestionCount: existingSourceIds.size,
          insertQuestionCount: draftsToInsert.length,
          publicTestCount,
          secretTestCount,
          draftProblemCount,
          missingAssignedNotebookIds,
          categories: draftsToInsert.reduce((acc, draft) => {
            const category = draft.sourceMeta.sourceCategory || 'Unknown';
            acc[category] = (acc[category] ?? 0) + 1;
            return acc;
          }, {}),
        },
        null,
        2,
      ),
    );

    if (!write || draftsToInsert.length === 0) return;
    if (missingAssignedNotebookIds.length > 0) {
      throw new Error(`Missing CSC108 notebooks: ${missingAssignedNotebookIds.join(', ')}`);
    }

    const notebookIds = (
      await prisma.notebook.findMany({
        where: { ownerId: course.ownerId, courseId },
        select: { id: true },
      })
    ).map((notebook) => notebook.id);
    const scopeWhere =
      notebookIds.length > 0
        ? { OR: [{ courseId }, { notebookId: { in: notebookIds } }] }
        : { courseId };

    await prisma.$transaction(
      async (tx) => {
        const [count, maxNumber] = await Promise.all([
          tx.notebookProblem.count({ where: scopeWhere }),
          tx.notebookProblem.aggregate({ where: scopeWhere, _max: { problemNumber: true } }),
        ]);
        const firstProblemNumber = (maxNumber._max.problemNumber ?? 0) + 1;
        const importBatch = await tx.problemImportBatch.create({
          data: {
            ownerId: course.ownerId,
            courseId,
            targetType: 'course',
            source: 'queue-json',
            status: 'previewed',
            sourceFileName: SOURCE_FILE_NAME,
            sourceFileMime: 'application/json',
            sourceTextHash: hashText(sourceText),
            draftCount: draftsToInsert.length,
            draftSnapshotJson: draftsToInsert,
            warnings: [],
          },
          select: { id: true },
        });

        for (let index = 0; index < draftsToInsert.length; index += 1) {
          const draft = draftsToInsert[index];
          const created = await tx.notebookProblem.create({
            data: {
              courseId,
              notebookId: draft.notebookId,
              title: draft.title,
              type: draft.type,
              status: draft.status,
              source: draft.source,
              order: count + index,
              problemNumber: firstProblemNumber + index,
              points: draft.points,
              tags: draft.tags,
              difficulty: draft.difficulty,
              publicContentJson: draft.publicContent,
              gradingJson: draft.grading,
              sourceMeta: {
                ...draft.sourceMeta,
                importBatchId: importBatch.id,
              },
            },
            select: { id: true },
          });

          if (draft.secretJudge) {
            await tx.notebookProblemSecret.create({
              data: {
                problemId: created.id,
                secretJudgeJson: draft.secretJudge,
              },
            });
          }
        }

        await tx.problemImportBatch.update({
          where: { id: importBatch.id },
          data: {
            status: 'committed',
            committedCount: draftsToInsert.length,
          },
        });
      },
      { timeout: 60_000 },
    );

    await refreshCourseSummaryFields(prisma, courseId);
    const after = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, problemCount: true, publishedProblemCount: true },
    });
    const imported = await prisma.notebookProblem.count({
      where: {
        courseId,
        sourceMeta: {
          path: ['sourceFileName'],
          equals: SOURCE_FILE_NAME,
        },
      },
    });
    console.log(JSON.stringify({ importedFromSource: imported, courseAfter: after }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
