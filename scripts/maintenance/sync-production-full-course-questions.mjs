#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { normalizeCsc148TreeBstDraft } from './csc148-tree-bst-template-normalizer.mjs';

const ROOT = process.cwd();

const COURSE_CONFIGS = {
  csc148: {
    courseId: 'cmqjfarz800158oi68s595q9n',
    courseTag: 'CSC148',
    skipImageQuestions: true,
    sourcePath:
      '/Users/dongpochen/Github/TeachingPlatform/exports/course_questions_production_full_20260618/production-full-csc148-questions.json',
    categoryNotebookIds: {
      '1. Python内存模型与对象管理详解': 'queue-csc148-01-python-memory-model',
      '2. Python 函数设计流程与类型注解详解': 'queue-csc148-02-functions-design-recipe',
      '3. 类与对象(Class and Object)': 'queue-csc148-04-oop-basics',
      '4. Python 继承': 'queue-csc148-05-inheritance-polymorphism',
      '5. 抽象数据类型（ADT）、栈与队列': 'queue-csc148-06-adts-stacks-queues',
      '6. Python 异常处理与抛出': 'queue-csc148-07-exceptions-runtime',
      '7. Linked List': 'queue-csc148-08-linked-lists',
      '8. 递归学习笔记': 'queue-csc148-09-recursion-basics',
      '9. 树（Trees）学习笔记': 'queue-csc148-11-trees-bsts',
    },
  },
  mat102: {
    courseId: 'cmpd5bird007v8ogmjuuiio03',
    courseTag: 'MAT102',
    sourcePath:
      '/Users/dongpochen/Github/TeachingPlatform/exports/course_questions_production_full_20260618/production-full-mat102-questions.json',
    categoryNotebookIds: {
      '01. 命题逻辑与符号化笔记': 'mat102-sets-propositions-proof-v2',
      '02. 集合论基础与证明技巧': 'mat102-sets-propositions-proof-v2',
      '03. 量词：全称与存在量词': 'mat102-logic-quantifiers-proof-v2',
      '04. 间接证明（反证法、逆否命题与否定）笔记': 'mat102-logic-quantifiers-proof-v2',
      '05. 关系（Relations）与序关系学习笔记': 'mat102-relations-equivalence-orders-proof-v2',
      '06. 函数与映射': 'mat102-functions-i-proof-v2',
      '07. 基数论（Cardinality）笔记': 'mat102-functions-ii-cardinality-proof-v2',
      '08. 数论第一章': 'mat102-number-theory-i-euclidean-proof-v2',
      '09. 数论第二章': 'mat102-number-theory-ii-primes-proof-v2',
      '10. 数论第三章': 'mat102-number-theory-iii-modular-proof-v2',
    },
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

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return '';
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

  const solution = stripMarkdownCodeFence(question.codeAnswer || question.solutionCode);
  if (solution && /\bpass\b/.test(solution)) return solution;

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
  const stem = firstNonEmpty(question.question, question.description, question.title);
  const code = stripMarkdownCodeFence(question.templateCode);
  if (!code || stem.includes('```')) return stem;
  return `${stem}\n\n\`\`\`python\n${code}\n\`\`\``.trim();
}

function sourceMetaForQuestion(question, sourceData, config, sourcePath) {
  const sourceFileName = path.basename(sourcePath);
  const recommendedNotebookId = config.categoryNotebookIds[question.category] ?? null;
  return {
    source: 'teaching-platform-production-full',
    sourcePath,
    sourceFileName,
    sourceApi: sourceData.sourceApi ?? null,
    sourceCourse: sourceData.course ?? null,
    normalizedCourseCode: sourceData.normalizedCourseCode ?? null,
    sourceQuestionId: question.id,
    sourceQuestionNumber: question.questionNumber,
    sourceQuestionType: question.questionType,
    sourceCourseTemplateId: question.courseTemplateId ?? question.templateId ?? null,
    sourceCategory: question.category,
    sourceSectionTitle: question.sectionTitle,
    sourceNotebookId: question.notebookId,
    sourceNotebookDbId: question.notebookDbId ?? null,
    sourceNotebookTitle: question.notebookTitle,
    sourceFullExampleId: question.fullExampleId ?? null,
    sourceFunctionName: question.functionName,
    sourceCreatedAt: question.createdAt,
    sourceUpdatedAt: question.updatedAt,
    recommendedNotebookId,
    fullExportSyncedAt: new Date().toISOString(),
  };
}

function normalizeOptions(question, warnings) {
  const rawOptions = Array.isArray(question.options) ? question.options : [];
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const options = rawOptions
    .map((item, index) => {
      const idFromObject =
        item && typeof item === 'object' && 'id' in item ? cleanText(item.id).toUpperCase() : '';
      const labelFromObject =
        item && typeof item === 'object' && 'label' in item ? item.label : item;
      const id = idFromObject || letters[index];
      const label = cleanText(labelFromObject).replace(
        new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[.)：:]\\s*`, 'i'),
        '',
      );
      return label ? { id, label: formatChoiceOptionLabel(question, label) } : null;
    })
    .filter(Boolean);

  if (options.length < 2) warnings.push('选择题缺少可用 options');
  return options;
}

function shouldRenderOptionAsPythonBlock(question, label) {
  return (
    question.questionType === 'code_tracing' &&
    label.includes('\n') &&
    !label.trim().startsWith('```')
  );
}

function decodeCodeTracingOptionNewlines(question, label) {
  const text = String(label ?? '');
  if (question.questionType !== 'code_tracing') return text;
  return text
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n');
}

function formatChoiceOptionLabel(question, label) {
  const text = cleanText(decodeCodeTracingOptionNewlines(question, label));
  return shouldRenderOptionAsPythonBlock(question, text) ? `\`\`\`python\n${text}\n\`\`\`` : text;
}

function normalizeCorrectOptionIds(question, options, warnings) {
  const raw = question.correctAnswer;
  const values = Array.isArray(raw) ? raw : String(raw ?? '').split(/[,，;；\s]+/);
  const optionIds = new Set(options.map((option) => option.id));
  const correctOptionIds = values
    .map((value) =>
      String(value)
        .trim()
        .replace(/^[([]|[\]).]$/g, '')
        .toUpperCase(),
    )
    .filter((value) => optionIds.has(value));

  if (correctOptionIds.length === 0) {
    const rawText = cleanText(raw);
    const matched = options.find((option) => option.label === rawText);
    if (matched) correctOptionIds.push(matched.id);
  }

  if (correctOptionIds.length === 0) warnings.push('选择题缺少可用 correctAnswer');
  return Array.from(new Set(correctOptionIds));
}

function baseDraft(question, sourceData, config, sourcePath, type, points) {
  return {
    draftId: `${config.courseTag.toLowerCase()}-production-full-${question.id}`,
    notebookId: null,
    title: trimTitle(question.title, `${config.courseTag} question ${question.id}`),
    type,
    status: 'published',
    source: 'manual',
    points,
    tags: uniqueTags([
      config.courseTag,
      question.questionType,
      question.category,
      question.sectionTitle,
      ...parseConceptTags(question.conceptTags),
    ]),
    difficulty: normalizeDifficulty(question.difficulty),
    sourceMeta: sourceMetaForQuestion(question, sourceData, config, sourcePath),
    validationErrors: [],
  };
}

function choiceDraft(question, sourceData, config, sourcePath) {
  const draft = baseDraft(question, sourceData, config, sourcePath, 'choice', 1);
  const options = normalizeOptions(question, draft.validationErrors);
  const correctOptionIds = normalizeCorrectOptionIds(question, options, draft.validationErrors);
  return {
    ...draft,
    status: options.length >= 2 && correctOptionIds.length > 0 ? 'published' : 'draft',
    publicContent: {
      type: 'choice',
      stem: stemForQuestion(question),
      selectionMode: correctOptionIds.length > 1 ? 'multiple' : 'single',
      options,
      ...(firstNonEmpty(question.explanation, question.proof)
        ? { explanation: firstNonEmpty(question.explanation, question.proof) }
        : {}),
    },
    grading: {
      type: 'choice',
      correctOptionIds,
      ...(firstNonEmpty(question.answer, question.explanation, question.proof)
        ? { analysis: firstNonEmpty(question.answer, question.explanation, question.proof) }
        : {}),
    },
  };
}

function codeDraft(question, sourceData, config, sourcePath) {
  const draft = baseDraft(question, sourceData, config, sourcePath, 'code', 5);
  const starterCode = extractStarterCode(question);
  const functionSignature = extractFunctionSignature(starterCode);
  const publicTestCode = firstNonEmpty(question.publicTests, question.publicTestCode);
  const secretTestCode = firstNonEmpty(question.secretTests, question.secretTestCode);
  const publicTests = buildCodeTests(publicTestCode, 'public', draft.validationErrors);
  const secretTests = buildCodeTests(secretTestCode, 'secret', draft.validationErrors);
  const publishable = publicTests.length > 0 && secretTests.length > 0;

  if (publicTests.length === 0) draft.validationErrors.push('缺少 public tests');
  if (secretTests.length === 0) draft.validationErrors.push('缺少 secret tests');

  return {
    ...draft,
    status: publishable ? 'published' : 'draft',
    publicContent: {
      type: 'code',
      stem: firstNonEmpty(question.question, question.description, question.title),
      language: 'python',
      ...(starterCode ? { starterCode } : {}),
      ...(functionSignature ? { functionSignature } : {}),
      constraints: [],
      publicTests,
      sampleIO: buildSampleIO(question.question || question.description),
      secretConfigPresent: secretTests.length > 0,
      ...(firstNonEmpty(question.explanation)
        ? { explanation: firstNonEmpty(question.explanation) }
        : {}),
    },
    grading: {
      type: 'code',
      publishRequirementsMet: publishable,
      ...(firstNonEmpty(question.answer) ? { analysis: firstNonEmpty(question.answer) } : {}),
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
  };
}

function shortAnswerDraft(question, sourceData, config, sourcePath) {
  const draft = baseDraft(question, sourceData, config, sourcePath, 'short_answer', 2);
  return {
    ...draft,
    publicContent: {
      type: 'short_answer',
      stem: stemForQuestion(question),
      ...(firstNonEmpty(question.explanation, question.proof)
        ? { explanation: firstNonEmpty(question.explanation, question.proof) }
        : {}),
    },
    grading: {
      type: 'short_answer',
      ...(firstNonEmpty(question.answer, question.proof)
        ? { referenceAnswer: firstNonEmpty(question.answer, question.proof) }
        : {}),
      ...(firstNonEmpty(question.summary, question.explanation)
        ? { rubric: firstNonEmpty(question.summary, question.explanation) }
        : {}),
    },
  };
}

function proofDraft(question, sourceData, config, sourcePath) {
  const draft = baseDraft(question, sourceData, config, sourcePath, 'proof', 3);
  return {
    ...draft,
    publicContent: {
      type: 'proof',
      stem: stemForQuestion(question),
      ...(firstNonEmpty(question.explanation)
        ? { explanation: firstNonEmpty(question.explanation) }
        : {}),
    },
    grading: {
      type: 'proof',
      ...(firstNonEmpty(question.proof, question.answer)
        ? { referenceProof: firstNonEmpty(question.proof, question.answer) }
        : {}),
      ...(firstNonEmpty(question.summary, question.explanation)
        ? { rubric: firstNonEmpty(question.summary, question.explanation) }
        : {}),
      ...(firstNonEmpty(question.answer) ? { analysis: firstNonEmpty(question.answer) } : {}),
    },
  };
}

function sourceQuestionContainsImage(value) {
  if (typeof value === 'string') {
    return /!\[[^\]]*]\([^)]*\)|<img\b|\/api\/uploads\/images|data:image\//i.test(value);
  }
  if (Array.isArray(value)) return value.some(sourceQuestionContainsImage);
  if (value && typeof value === 'object')
    return Object.values(value).some(sourceQuestionContainsImage);
  return false;
}

function buildDrafts(sourceData, config, sourcePath) {
  const sourceQuestions = Array.isArray(sourceData.combinedQuestions)
    ? sourceData.combinedQuestions
    : (sourceData.templateExports?.[0]?.questions ?? []);
  if (sourceQuestions.length === 0) throw new Error('No questions found in source JSON.');
  const questions = config.skipImageQuestions
    ? sourceQuestions.filter((question) => !sourceQuestionContainsImage(question))
    : sourceQuestions;

  return questions.map((question) => {
    const hasChoiceData =
      Array.isArray(question.options) && question.options.length > 0 && question.correctAnswer;
    let draft;
    if (question.questionType === 'multiple_choice' || hasChoiceData) {
      draft = choiceDraft(question, sourceData, config, sourcePath);
    } else if (question.questionType === 'code') {
      draft = codeDraft(question, sourceData, config, sourcePath);
    } else if (question.questionType === 'proof') {
      draft = proofDraft(question, sourceData, config, sourcePath);
    } else {
      draft = shortAnswerDraft(question, sourceData, config, sourcePath);
    }
    return config.courseTag === 'CSC148' ? normalizeCsc148TreeBstDraft(draft) : draft;
  });
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

function isProductionSourceMeta(sourceMeta) {
  if (!sourceMeta || typeof sourceMeta !== 'object') return false;
  const source = String(sourceMeta.source ?? '');
  const sourceFileName = String(sourceMeta.sourceFileName ?? '');
  return source.includes('production') || /^production.*questions\.json$/.test(sourceFileName);
}

async function loadExistingProductionProblems(prisma, scopeWhere) {
  const rows = await prisma.notebookProblem.findMany({
    where: scopeWhere,
    select: {
      id: true,
      sourceMeta: true,
      problemNumber: true,
      order: true,
    },
  });
  const bySourceQuestionId = new Map();
  for (const row of rows) {
    const sourceMeta = row.sourceMeta && typeof row.sourceMeta === 'object' ? row.sourceMeta : {};
    if (!isProductionSourceMeta(sourceMeta)) continue;
    const sourceQuestionId = sourceMeta.sourceQuestionId;
    if (!sourceQuestionId) continue;
    bySourceQuestionId.set(String(sourceQuestionId), row);
  }
  return bySourceQuestionId;
}

async function refreshCourseAndNotebookSummaryFields(prisma, courseId) {
  const notebooks = await prisma.notebook.findMany({
    where: { courseId },
    select: { id: true },
  });
  await Promise.all(
    notebooks.map(async (notebook) => {
      const [problemCount, publishedProblemCount] = await Promise.all([
        prisma.notebookProblem.count({ where: { notebookId: notebook.id } }),
        prisma.notebookProblem.count({ where: { notebookId: notebook.id, status: 'published' } }),
      ]);
      await prisma.notebook.updateMany({
        where: { id: notebook.id },
        data: { problemCount, publishedProblemCount },
      });
    }),
  );

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

function typeCounts(drafts) {
  return drafts.reduce((acc, draft) => {
    acc[draft.type] = (acc[draft.type] ?? 0) + 1;
    return acc;
  }, {});
}

function sourceTypeCounts(drafts) {
  return drafts.reduce((acc, draft) => {
    const type = draft.sourceMeta.sourceQuestionType || 'unknown';
    acc[type] = (acc[type] ?? 0) + 1;
    return acc;
  }, {});
}

async function syncCourse(courseKey) {
  const config = COURSE_CONFIGS[courseKey];
  if (!config) throw new Error(`Unknown course config: ${courseKey}`);

  const write = hasFlag('write');
  const courseId = argValue('course-id') || config.courseId;
  const sourcePath = path.resolve(ROOT, argValue('source') || config.sourcePath);
  const sourceText = fs.readFileSync(sourcePath, 'utf8');
  const sourceData = JSON.parse(sourceText);
  const sourceFileName = path.basename(sourcePath);
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
      orderBy: { name: 'asc' },
    });
    const existingNotebookIds = new Set(courseNotebooks.map((notebook) => notebook.id));
    const drafts = assignExistingNotebooks(
      buildDrafts(sourceData, config, sourcePath),
      existingNotebookIds,
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

    const existingBySourceId = await loadExistingProductionProblems(prisma, scopeWhere);
    const updates = [];
    const inserts = [];
    for (const draft of drafts) {
      const existing = existingBySourceId.get(String(draft.sourceMeta.sourceQuestionId));
      if (existing) updates.push({ draft, existing });
      else inserts.push(draft);
    }

    const currentProblemCount = await prisma.notebookProblem.count({ where: scopeWhere });
    const maxNumber = await prisma.notebookProblem.aggregate({
      where: scopeWhere,
      _max: { problemNumber: true, order: true },
    });
    const validationWarningCount = drafts.reduce(
      (sum, draft) => sum + draft.validationErrors.length,
      0,
    );
    const summary = {
      courseKey,
      mode: write ? 'write' : 'dry-run',
      course,
      sourcePath,
      sourceQuestionCount: drafts.length,
      updateQuestionCount: updates.length,
      insertQuestionCount: inserts.length,
      currentProblemCount,
      afterProblemCount: currentProblemCount + inserts.length,
      storedTypeCounts: typeCounts(drafts),
      sourceTypeCounts: sourceTypeCounts(drafts),
      assignedNotebookCount: drafts.filter((draft) => draft.notebookId).length,
      validationWarningCount,
      availableNotebookCount: courseNotebooks.length,
      categories: drafts.reduce((acc, draft) => {
        const category = draft.sourceMeta.sourceCategory || 'Unknown';
        acc[category] = (acc[category] ?? 0) + 1;
        return acc;
      }, {}),
    };
    console.log(JSON.stringify(summary, null, 2));

    if (!write) return summary;

    await prisma.$transaction(
      async (tx) => {
        const importBatch = await tx.problemImportBatch.create({
          data: {
            ownerId: course.ownerId,
            courseId,
            targetType: 'course',
            source: 'teaching-platform-production-full',
            status: 'previewed',
            sourceFileName,
            sourceFileMime: 'application/json',
            sourceTextHash: hashText(sourceText),
            draftCount: drafts.length,
            draftSnapshotJson: drafts,
            warnings: drafts.flatMap((draft) =>
              draft.validationErrors.map(
                (warning) => `${draft.sourceMeta.sourceQuestionId}: ${warning}`,
              ),
            ),
          },
          select: { id: true },
        });

        for (const { draft, existing } of updates) {
          await tx.notebookProblem.update({
            where: { id: existing.id },
            data: {
              courseId,
              notebookId: draft.notebookId,
              title: draft.title,
              type: draft.type,
              status: draft.status,
              source: draft.source,
              points: draft.points,
              tags: draft.tags,
              difficulty: draft.difficulty,
              publicContentJson: draft.publicContent,
              gradingJson: draft.grading,
              sourceMeta: {
                ...draft.sourceMeta,
                importBatchId: importBatch.id,
                validationErrors: draft.validationErrors,
                previousProblemNumber: existing.problemNumber,
              },
            },
          });

          if (draft.secretJudge) {
            await tx.notebookProblemSecret.upsert({
              where: { problemId: existing.id },
              create: {
                problemId: existing.id,
                secretJudgeJson: draft.secretJudge,
              },
              update: {
                secretJudgeJson: draft.secretJudge,
              },
            });
          } else {
            await tx.notebookProblemSecret.deleteMany({ where: { problemId: existing.id } });
          }
        }

        const firstProblemNumber = (maxNumber._max.problemNumber ?? 0) + 1;
        const firstOrder = (maxNumber._max.order ?? -1) + 1;
        for (let index = 0; index < inserts.length; index += 1) {
          const draft = inserts[index];
          const created = await tx.notebookProblem.create({
            data: {
              courseId,
              notebookId: draft.notebookId,
              title: draft.title,
              type: draft.type,
              status: draft.status,
              source: draft.source,
              order: firstOrder + index,
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
            committedCount: drafts.length,
          },
        });
      },
      { timeout: 120_000 },
    );

    await refreshCourseAndNotebookSummaryFields(prisma, courseId);

    const [courseAfter, productionRows] = await Promise.all([
      prisma.course.findUnique({
        where: { id: courseId },
        select: { id: true, problemCount: true, publishedProblemCount: true },
      }),
      prisma.notebookProblem.findMany({
        where: scopeWhere,
        select: { type: true, status: true, sourceMeta: true },
      }),
    ]);
    const fromSource = productionRows.filter((row) => {
      const sourceMeta = row.sourceMeta && typeof row.sourceMeta === 'object' ? row.sourceMeta : {};
      return sourceMeta.sourceFileName === sourceFileName;
    });
    const afterSummary = {
      courseKey,
      sourceFileName,
      importedFromSource: fromSource.length,
      choiceFromSource: fromSource.filter((row) => row.type === 'choice').length,
      proofFromSource: fromSource.filter((row) => row.type === 'proof').length,
      codeFromSource: fromSource.filter((row) => row.type === 'code').length,
      draftFromSource: fromSource.filter((row) => row.status !== 'published').length,
      courseAfter,
    };
    console.log(JSON.stringify(afterSummary, null, 2));
    return afterSummary;
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  loadEnvLocal();
  const courseArg = argValue('course');
  const courseKeys = courseArg
    ? courseArg.split(',').map((item) => item.trim())
    : ['csc148', 'mat102'];
  for (const courseKey of courseKeys) {
    await syncCourse(courseKey);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
