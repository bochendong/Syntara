#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const DEFAULT_COURSE_ID = 'cmndgvcc10001l404oe8aymjc';
const DEFAULT_SOURCE_PATH = 'queue/production-csc148-questions.json';
const SOURCE_FILE_NAME = 'production-csc148-questions.json';

const CATEGORY_NOTEBOOK_IDS = {
  '1. Python内存模型与对象管理详解': 'queue-csc148-01-python-memory-model',
  '2. Python 函数设计流程与类型注解详解': 'queue-csc148-02-functions-design-recipe',
  '3. 类与对象(Class and Object)': 'queue-csc148-04-oop-basics',
  '4. Python 继承': 'queue-csc148-05-inheritance-polymorphism',
  '5. 抽象数据类型（ADT）、栈与队列': 'queue-csc148-06-adts-stacks-queues',
  '6. Python 异常处理与抛出': 'queue-csc148-07-exceptions-runtime',
  '7. Linked List': 'queue-csc148-08-linked-lists',
  '8. 递归学习笔记': 'queue-csc148-09-recursion-basics',
  '9. 树（Trees）学习笔记': 'queue-csc148-11-trees-bsts',
};

const CHOICE_OVERRIDES = {
  notebook_21: {
    selectionMode: 'single',
    options: [
      {
        id: 'A',
        label: '变量本身保存对象的值；对象的 id、类型和值都由变量名决定。',
      },
      {
        id: 'B',
        label: '对象有自己的 id、类型和值；变量名只是绑定或引用到对象。',
      },
      {
        id: 'C',
        label: '只要两个变量的值相等，它们就一定引用同一个对象。',
      },
      {
        id: 'D',
        label: '对象的类型会随着变量名重新赋值而自动改变。',
      },
    ],
    correctOptionIds: ['B'],
    analysis:
      'Python 中变量名绑定到对象；对象本身有 identity、type 和 value。重新赋值会改变变量名的绑定，不会改变原对象的 id 或 type。',
  },
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

function cleanText(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function trimTitle(value, fallback) {
  const text = cleanText(value || fallback).replace(/\s+/g, ' ');
  return text.slice(0, 200) || fallback;
}

function cleanTag(value) {
  const text = String(value ?? '').trim();
  return text && text.length <= 30 ? text : null;
}

function parseConceptTags(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function uniqueTags(values) {
  return Array.from(new Set(values.map(cleanTag).filter(Boolean))).slice(0, 16);
}

function stripMarkdownCodeFence(value) {
  const text = cleanText(value);
  const match = text.match(/^```[A-Za-z0-9_-]*\n([\s\S]*?)\n?```$/);
  return match ? match[1].trimEnd() : text;
}

function firstFencedCodeBlock(value) {
  const match = String(value ?? '').match(/```(?:python)?\s*\n([\s\S]*?)```/i);
  return match ? match[1].trimEnd() : '';
}

function extractStarterCode(question) {
  const template = stripMarkdownCodeFence(question.templateCode);
  if (template) return template;

  const questionText = cleanText(question.question || question.description);
  if (/^(from|import|class|def)\s+/m.test(questionText) && !questionText.includes('\n\n')) {
    return questionText;
  }

  return firstFencedCodeBlock(questionText);
}

function extractFunctionSignature(starterCode) {
  const line = String(starterCode ?? '')
    .split(/\r?\n/)
    .map((item) => item.trimEnd())
    .find((item) => /^(def|class)\s+/.test(item.trimStart()));
  return line?.trim() || '';
}

function sanitizeTestId(value, fallback) {
  const text = String(value ?? '')
    .trim()
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return text || fallback;
}

function extractDocstring(body) {
  const trimmed = body.trimStart();
  const singleLine = trimmed.match(/^"""([^"]{1,500})"""/);
  if (singleLine) return singleLine[1].trim();
  const multiLine = trimmed.match(/^"""([\s\S]{1,500}?)"""/);
  return multiLine?.[1].replace(/\s+/g, ' ').trim();
}

function normalizeTestCode(value) {
  const text = stripMarkdownCodeFence(value);
  const lines = text.split(/\r?\n/);
  const result = [];
  for (const line of lines) {
    if (/^if __name__\s*==\s*['"]__main__['"]/.test(line.trim())) break;
    if (/^\s*from\s+(solution|__main__)\s+import\s+/.test(line)) continue;
    result.push(line);
  }
  return result.join('\n').trim();
}

function splitPreludeAndTestMethods(testCode) {
  const lines = normalizeTestCode(testCode).split(/\r?\n/);
  const prelude = [];
  const methods = [];
  let insideTestClass = false;
  let current = null;

  for (const line of lines) {
    if (/^class\s+\w+.*\bTestCase\b/.test(line)) {
      insideTestClass = true;
      if (current) {
        methods.push(current);
        current = null;
      }
      continue;
    }

    const testMethodMatch = insideTestClass && line.match(/^    def\s+(test_[A-Za-z0-9_]+)\s*\(/);
    if (testMethodMatch) {
      if (current) methods.push(current);
      current = { name: testMethodMatch[1], lines: [line] };
      continue;
    }

    if (!insideTestClass) {
      prelude.push(line);
      continue;
    }

    if (current) {
      if (/^    def\s+/.test(line)) {
        methods.push(current);
        current = null;
        continue;
      }
      current.lines.push(line);
    }
  }

  if (current) methods.push(current);

  return {
    prelude: prelude.join('\n').trim(),
    methods: methods.map((method) => ({
      name: method.name,
      body: method.lines
        .slice(1)
        .filter((line) => line.trim())
        .map((line) => line.replace(/^        /, ''))
        .join('\n')
        .trim(),
    })),
  };
}

function buildAssertionExpression(prelude, body) {
  const code = [prelude, body].filter(Boolean).join('\n\n');
  return `(lambda __ns: (exec(${JSON.stringify(
    code,
  )}, __ns, __ns), True)[1])({**globals(), "self": __import__("unittest").TestCase()})`;
}

function buildCodeTests(testCode, kind, warnings) {
  const { prelude, methods } = splitPreludeAndTestMethods(testCode);
  return methods
    .map((method, index) => {
      const expression = buildAssertionExpression(prelude, method.body);
      if (Buffer.byteLength(expression, 'utf8') > 4000) {
        warnings.push(`${kind} test ${method.name} is too large for the problem schema.`);
        return null;
      }
      return {
        id: `${kind}_${String(index + 1).padStart(2, '0')}_${sanitizeTestId(
          method.name,
          'case',
        )}`.slice(0, 64),
        description:
          extractDocstring(method.body) || method.name.replace(/^test_/, '').replace(/_/g, ' '),
        expression,
        expected: 'true',
      };
    })
    .filter(Boolean);
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
  if (['easy', 'medium', 'hard'].includes(value)) return value;
  if (value === 'exam') return 'hard';
  return 'medium';
}

function stemForQuestion(question) {
  const stem = cleanText(question.question || question.description || question.title);
  const code = stripMarkdownCodeFence(question.templateCode);
  if (!code || stem.includes('```')) return stem;
  return `${stem}\n\n\`\`\`python\n${code}\n\`\`\``.trim();
}

function shortAnswerDraft(question, sourceData) {
  const originalType = question.questionType || 'short_answer';
  const referenceAnswer = cleanText(question.solutionCode);
  return {
    draftId: `production-csc148-${question.id}`,
    notebookId: null,
    title: trimTitle(question.title, `CSC148 question ${question.id}`),
    type: 'short_answer',
    status: 'published',
    source: 'manual',
    points: originalType === 'multiple_choice' ? 1 : 2,
    tags: uniqueTags([
      'CSC148',
      'python',
      originalType,
      question.category,
      question.sectionTitle,
      ...parseConceptTags(question.conceptTags),
    ]),
    difficulty: normalizeDifficulty(question.difficulty),
    publicContent: {
      type: 'short_answer',
      stem: stemForQuestion(question),
    },
    grading: {
      type: 'short_answer',
      ...(referenceAnswer ? { referenceAnswer } : {}),
      ...(question.summary ? { rubric: String(question.summary).trim() } : {}),
    },
    sourceMeta: sourceMetaForQuestion(question, sourceData),
    validationErrors: [],
  };
}

function choiceDraft(question, sourceData, override) {
  return {
    draftId: `production-csc148-${question.id}`,
    notebookId: null,
    title: trimTitle(question.title, `CSC148 choice question ${question.id}`),
    type: 'choice',
    status: 'published',
    source: 'manual',
    points: 1,
    tags: uniqueTags([
      'CSC148',
      'python',
      'multiple_choice',
      question.category,
      question.sectionTitle,
      ...parseConceptTags(question.conceptTags),
    ]),
    difficulty: normalizeDifficulty(question.difficulty),
    publicContent: {
      type: 'choice',
      stem: stemForQuestion(question),
      selectionMode: override.selectionMode,
      options: override.options,
    },
    grading: {
      type: 'choice',
      correctOptionIds: override.correctOptionIds,
      analysis: override.analysis,
    },
    sourceMeta: {
      ...sourceMetaForQuestion(question, sourceData),
      choiceOverride: 'curated-csc148-production-choice-overrides-v1',
    },
    validationErrors: [],
  };
}

function codeDraft(question, sourceData) {
  const validationErrors = [];
  const starterCode = extractStarterCode(question);
  const functionSignature = extractFunctionSignature(starterCode);
  const publicTests = buildCodeTests(question.publicTestCode, 'public', validationErrors);
  const secretTests = buildCodeTests(question.secretTestCode, 'secret', validationErrors);
  const publishable = publicTests.length > 0 && secretTests.length > 0;

  if (publicTests.length === 0) validationErrors.push('缺少 public tests');
  if (secretTests.length === 0) validationErrors.push('缺少 secret tests');

  return {
    draftId: `production-csc148-${question.id}`,
    notebookId: null,
    title: trimTitle(question.title, `CSC148 code question ${question.id}`),
    type: 'code',
    status: publishable ? 'published' : 'draft',
    source: 'manual',
    points: 5,
    tags: uniqueTags([
      'CSC148',
      'python',
      'code',
      question.category,
      question.sectionTitle,
      ...parseConceptTags(question.conceptTags),
    ]),
    difficulty: normalizeDifficulty(question.difficulty),
    publicContent: {
      type: 'code',
      stem: cleanText(question.question || question.description || question.title),
      language: 'python',
      ...(starterCode ? { starterCode } : {}),
      ...(functionSignature ? { functionSignature } : {}),
      constraints: [],
      publicTests,
      sampleIO: buildSampleIO(question.question || question.description),
      secretConfigPresent: secretTests.length > 0,
    },
    grading: {
      type: 'code',
      publishRequirementsMet: publishable,
    },
    ...(secretTests.length > 0
      ? {
          secretJudge: {
            language: 'python',
            secretTests,
            timeoutMs: 5000,
          },
        }
      : {}),
    sourceMeta: sourceMetaForQuestion(question, sourceData),
    validationErrors,
  };
}

function sourceMetaForQuestion(question, sourceData) {
  const recommendedNotebookId = CATEGORY_NOTEBOOK_IDS[question.category] ?? null;
  return {
    source: 'queue-json',
    sourcePath: DEFAULT_SOURCE_PATH,
    sourceFileName: SOURCE_FILE_NAME,
    sourceApi: sourceData.sourceApi ?? null,
    sourceCourse: sourceData.course ?? null,
    normalizedCourseCode: sourceData.normalizedCourseCode ?? null,
    sourceQuestionId: question.id,
    sourceQuestionNumber: question.questionNumber,
    sourceQuestionType: question.questionType,
    sourceCourseTemplateId: question.courseTemplateId,
    sourceCategory: question.category,
    sourceSectionTitle: question.sectionTitle,
    sourceNotebookId: question.notebookId,
    sourceNotebookTitle: question.notebookTitle,
    sourceFunctionName: question.functionName,
    sourceCreatedAt: question.createdAt,
    sourceUpdatedAt: question.updatedAt,
    recommendedNotebookId,
  };
}

function buildDrafts(sourceData) {
  const questions = Array.isArray(sourceData.combinedQuestions)
    ? sourceData.combinedQuestions
    : (sourceData.templateExports?.[0]?.questions ?? []);
  if (questions.length === 0) {
    throw new Error('No questions found in source JSON.');
  }

  return questions.map((question) => {
    const choiceOverride = CHOICE_OVERRIDES[question.id];
    if (question.questionType === 'multiple_choice' && choiceOverride) {
      return choiceDraft(question, sourceData, choiceOverride);
    }
    return question.questionType === 'code'
      ? codeDraft(question, sourceData)
      : shortAnswerDraft(question, sourceData);
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

function assignExistingNotebooks(drafts, existingNotebookIds) {
  return drafts.map((draft) => {
    const recommendedNotebookId = draft.sourceMeta.recommendedNotebookId;
    const notebookId =
      recommendedNotebookId && existingNotebookIds.has(recommendedNotebookId)
        ? recommendedNotebookId
        : null;
    return {
      ...draft,
      notebookId,
      sourceMeta: {
        ...draft.sourceMeta,
        assignedNotebookId: notebookId,
      },
    };
  });
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

    const courseNotebooks = await prisma.notebook.findMany({
      where: { ownerId: course.ownerId, courseId },
      select: { id: true, name: true },
    });
    const existingNotebookIds = new Set(courseNotebooks.map((notebook) => notebook.id));
    const drafts = assignExistingNotebooks(buildDrafts(sourceData), existingNotebookIds);
    const existingSourceIds = allowDuplicates
      ? new Set()
      : await loadExistingSourceQuestionIds(prisma, courseId);
    const draftsToInsert = drafts.filter(
      (draft) => !existingSourceIds.has(String(draft.sourceMeta.sourceQuestionId)),
    );

    const scopeWhere =
      courseNotebooks.length > 0
        ? {
            OR: [
              { courseId },
              { notebookId: { in: courseNotebooks.map((notebook) => notebook.id) } },
            ],
          }
        : { courseId };
    const currentProblemCount = await prisma.notebookProblem.count({ where: scopeWhere });
    const publicTestCount = draftsToInsert.reduce(
      (sum, draft) => sum + (draft.type === 'code' ? draft.publicContent.publicTests.length : 0),
      0,
    );
    const secretTestCount = draftsToInsert.reduce(
      (sum, draft) => sum + (draft.secretJudge?.secretTests.length ?? 0),
      0,
    );
    const draftProblemCount = draftsToInsert.filter((draft) => draft.status !== 'published').length;
    const validationWarningCount = draftsToInsert.reduce(
      (sum, draft) => sum + draft.validationErrors.length,
      0,
    );

    console.log(
      JSON.stringify(
        {
          mode: write ? 'write' : 'dry-run',
          course,
          sourcePath,
          sourceQuestionCount: drafts.length,
          duplicateSourceQuestionCount: existingSourceIds.size,
          insertQuestionCount: draftsToInsert.length,
          currentProblemCount,
          afterProblemCount: currentProblemCount + draftsToInsert.length,
          publicTestCount,
          secretTestCount,
          draftProblemCount,
          validationWarningCount,
          assignedNotebookCount: draftsToInsert.filter((draft) => draft.notebookId).length,
          availableNotebooks: courseNotebooks,
          typeCounts: draftsToInsert.reduce((acc, draft) => {
            acc[draft.type] = (acc[draft.type] ?? 0) + 1;
            return acc;
          }, {}),
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
                validationErrors: draft.validationErrors,
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
