#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import sharp from 'sharp';

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, 'data', 'csc148');
const COURSE_OUTPUT = path.join(OUTPUT_DIR, 'course.json');
const PROBLEM_BANK_OUTPUT = path.join(OUTPUT_DIR, 'problem-bank.json');
const LOCAL_PUBLIC_ASSET_ROOT = path.join(ROOT, 'public', 'csc148-local');
const LOCAL_PUBLIC_ASSET_PREFIX = '/csc148-local';

const FIRST_NOTEBOOK_SCRIPT = path.join(
  ROOT,
  'scripts',
  'maintenance',
  'import-csc148-first-markdown-notebook.mjs',
);
const REST_NOTEBOOK_SCRIPT = path.join(
  ROOT,
  'scripts',
  'maintenance',
  'import-csc148-rest-markdown-notebooks.mjs',
);
const PROBLEM_BANK_SOURCE = path.join(ROOT, 'queue', 'production-full-csc148-questions.json');
const missingUploadedAssets = new Set();

function prepareScriptForExtraction(filePath, appendedCode) {
  const source = fs
    .readFileSync(filePath, 'utf8')
    .replace(/^#!.*\n/, '')
    .replace(/^import .+;\n/gm, '')
    .replace(/\nmain\(\)\.catch\([\s\S]*$/, '\n');

  return `${source}\n${appendedCode}\n`;
}

function runExtractor(filePath, appendedCode) {
  const sandbox = {
    Buffer,
    console,
    fs,
    path,
    process: {
      argv: [],
      cwd: () => ROOT,
      env: {},
    },
    crypto: {
      createHash: () => ({
        update: () => ({ digest: () => '' }),
      }),
      randomUUID: () => 'local-fixture-id',
    },
    sharp: () => ({
      png: () => ({ toFile: async () => undefined }),
    }),
    Prisma: { DbNull: null },
    PrismaClient: class PrismaClient {},
  };
  vm.createContext(sandbox);
  vm.runInContext(prepareScriptForExtraction(filePath, appendedCode), sandbox, {
    filename: filePath,
  });
  return sandbox.__csc148LocalData;
}

function extractCourseNotebooks() {
  const first = runExtractor(
    FIRST_NOTEBOOK_SCRIPT,
    `
globalThis.__csc148LocalData = {
  notebook: {
    id: NOTEBOOK_ID,
    order: '01',
    topicKey: 'python-memory-model',
    name: NOTEBOOK_NAME,
    description: 'CSC148 中文 Markdown 笔记：Python 记忆模型、变量引用、可变性、别名、副作用与相等性。',
    tags: ['CSC148', 'Python', 'Markdown', '记忆模型'],
    coverImagePath: FIGURES[0]?.publicPath ?? null,
    imagePaths: FIGURES.map((figure) => figure.publicPath),
    sourceUrls: ['https://www.teach.cs.toronto.edu/~csc148h/notes/python-recap/memory_model_part1.html'],
    sections: buildNotebookSections(),
  },
};
    `,
  );

  const rest = runExtractor(
    REST_NOTEBOOK_SCRIPT,
    `
globalThis.__csc148LocalData = {
  notebooks: NOTEBOOK_PLANS.map((plan) => ({
    id: plan.id,
    order: plan.order,
    topicKey: plan.topicKey,
    name: plan.name,
    description: plan.description,
    tags: plan.tags,
    coverImagePath: plan.publicImagePath,
    imagePaths: [plan.publicImagePath],
    sourceUrls: plan.sourceUrls,
    sections: buildSections(plan).map((section, index) => ({
      id: \`\${plan.id}-section-\${String(index + 1).padStart(2, '0')}\`,
      ...section,
    })),
  })),
};
    `,
  );

  return [first.notebook, ...rest.notebooks].sort((a, b) => a.order.localeCompare(b.order));
}

function collectGeneratedNotebookImages(markdown) {
  return [
    ...new Set(
      [...String(markdown ?? '').matchAll(/\/generated-notebooks\/[^)\s]+/g)].map(
        (match) => match[0],
      ),
    ),
  ];
}

async function localizeGeneratedNotebookImage(publicPath) {
  if (!publicPath?.startsWith('/generated-notebooks/')) return publicPath;

  const relativePath = publicPath.replace(/^\/generated-notebooks\//, '');
  const sourcePath = path.join(ROOT, 'public', 'generated-notebooks', relativePath);
  if (!fs.existsSync(sourcePath)) return publicPath;

  const targetRelativePath = relativePath.replace(/\.[^.]+$/, '.webp');
  const targetPath = path.join(LOCAL_PUBLIC_ASSET_ROOT, targetRelativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  await sharp(sourcePath)
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(targetPath);
  return `${LOCAL_PUBLIC_ASSET_PREFIX}/${targetRelativePath}`;
}

async function localizeCourseAssets(notebooks) {
  const assetMap = new Map();
  const remember = async (publicPath) => {
    if (!publicPath?.startsWith('/generated-notebooks/')) return;
    if (!assetMap.has(publicPath)) {
      assetMap.set(publicPath, await localizeGeneratedNotebookImage(publicPath));
    }
  };

  for (const notebook of notebooks) {
    await remember(notebook.coverImagePath);
    for (const imagePath of notebook.imagePaths ?? []) await remember(imagePath);
    for (const section of notebook.sections ?? []) {
      for (const imagePath of collectGeneratedNotebookImages(section.markdown)) {
        await remember(imagePath);
      }
      for (const imagePath of section.sourceMeta?.figurePaths ?? []) await remember(imagePath);
    }
  }

  const rewrite = (value) =>
    typeof value === 'string'
      ? value.replace(/\/generated-notebooks\/[^)\s]+/g, (match) => assetMap.get(match) ?? match)
      : value;

  return {
    notebooks: notebooks.map((notebook) => ({
      ...notebook,
      coverImagePath: rewrite(notebook.coverImagePath),
      imagePaths: (notebook.imagePaths ?? []).map(rewrite),
      sections: notebook.sections.map((section) => ({
        ...section,
        markdown: rewrite(section.markdown),
        sourceMeta: {
          ...section.sourceMeta,
          figurePaths: (section.sourceMeta?.figurePaths ?? []).map(rewrite),
        },
      })),
    })),
    assetCount: new Set([...assetMap.values()]).size,
  };
}

function parseConceptTags(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string');
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return value
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function normalizeQuestionType(type) {
  if (type === 'multiple_choice') return 'choice';
  if (type === 'code_tracing') return 'code_tracing';
  if (type === 'code') return 'code';
  return 'short_answer';
}

function localizeUploadedAsset(publicPath) {
  if (!publicPath?.startsWith('/api/uploads/images/')) return publicPath;

  const filename = path.basename(publicPath);
  const candidatePaths = [
    path.join(ROOT, 'public', 'uploads', 'images', filename),
    path.join(ROOT, 'public', 'api', 'uploads', 'images', filename),
    path.join(ROOT, 'uploads', 'images', filename),
  ];
  const sourcePath = candidatePaths.find((candidatePath) => fs.existsSync(candidatePath));
  if (!sourcePath) {
    missingUploadedAssets.add(publicPath);
    return null;
  }

  const targetPath = path.join(LOCAL_PUBLIC_ASSET_ROOT, 'problem-assets', filename);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  return `${LOCAL_PUBLIC_ASSET_PREFIX}/problem-assets/${filename}`;
}

function rewriteProblemText(value) {
  if (typeof value !== 'string' || !value.includes('/api/uploads/images/')) return value;

  return value
    .replace(/!\[([^\]]*)]\((\/api\/uploads\/images\/[^)\s]+)\)/g, (_match, alt, imagePath) => {
      const localPath = localizeUploadedAsset(imagePath);
      if (localPath) return `![${alt}](${localPath})`;
      return `**[本地缺失图片：${path.basename(imagePath)}]**`;
    })
    .replace(/\/api\/uploads\/images\/[^\s)]+/g, (imagePath) => {
      const localPath = localizeUploadedAsset(imagePath);
      return localPath ?? `[本地缺失图片：${path.basename(imagePath)}]`;
    });
}

function cleanProblem(row, index) {
  return {
    id: String(row.id || row._id || `csc148-problem-${index + 1}`),
    sourceId: row._id ?? null,
    order: index,
    title: row.title || row.question || `CSC148 Problem ${index + 1}`,
    category: row.category ?? null,
    sectionTitle: row.sectionTitle ?? null,
    notebookId: row.notebookId ?? null,
    notebookTitle: row.notebookTitle ?? null,
    type: normalizeQuestionType(row.questionType),
    rawQuestionType: row.questionType ?? null,
    difficulty: row.difficulty ?? 'medium',
    language: row.language ?? 'python',
    questionNumber: row.questionNumber ?? null,
    summary: row.summary ?? null,
    tags: parseConceptTags(row.conceptTags),
    question: rewriteProblemText(row.question || row.description || row.title || ''),
    description: rewriteProblemText(row.description) ?? null,
    options: Array.isArray(row.options) ? row.options : [],
    correctAnswer: row.correctAnswer ?? null,
    explanation: rewriteProblemText(row.explanation) ?? null,
    answer: rewriteProblemText(row.answer) ?? null,
    proof: rewriteProblemText(row.proof) ?? null,
    functionName: row.functionName ?? null,
    templateCode: row.templateCode ?? null,
    testCode: row.testCode ?? null,
    publicTestCode: row.publicTestCode ?? null,
    secretTestCode: row.secretTestCode ?? null,
    solutionCode: row.solutionCode ?? null,
    codeAnswer: row.codeAnswer ?? null,
    publicTests: row.publicTests ?? null,
    secretTests: row.secretTests ?? null,
    blanks: row.blanks ?? null,
    sourceMeta: {
      courseTemplateId: row.courseTemplateId ?? null,
      exportCourseTemplateId: row.exportCourseTemplateId ?? null,
      fullExampleId: row.fullExampleId ?? null,
      notebookDbId: row.notebookDbId ?? null,
      isNotebookExample: Boolean(row.isNotebookExample),
      createdAt: row.createdAt ?? null,
      updatedAt: row.updatedAt ?? null,
    },
  };
}

function buildProblemBank() {
  const source = JSON.parse(fs.readFileSync(PROBLEM_BANK_SOURCE, 'utf8'));
  const problems = (source.combinedQuestions ?? []).map(cleanProblem);
  const byType = {};
  const byDifficulty = {};
  const byNotebook = {};
  const byCategory = {};
  for (const problem of problems) {
    byType[problem.type] = (byType[problem.type] ?? 0) + 1;
    byDifficulty[problem.difficulty] = (byDifficulty[problem.difficulty] ?? 0) + 1;
    if (problem.notebookTitle) {
      byNotebook[problem.notebookTitle] = (byNotebook[problem.notebookTitle] ?? 0) + 1;
    }
    if (problem.category) {
      byCategory[problem.category] = (byCategory[problem.category] ?? 0) + 1;
    }
  }

  return {
    course: source.course,
    normalizedCourseCode: source.normalizedCourseCode,
    sourceApi: source.sourceApi,
    sourceFile: 'queue/production-full-csc148-questions.json',
    stats: {
      total: problems.length,
      byType,
      byDifficulty,
      byNotebook,
      byCategory,
      sourceStats: source.stats ?? null,
      missingUploadedAssets: [...missingUploadedAssets],
    },
    problems,
  };
}

async function buildCourseData() {
  const localized = await localizeCourseAssets(extractCourseNotebooks());
  const { notebooks } = localized;
  const sectionCount = notebooks.reduce((count, notebook) => count + notebook.sections.length, 0);
  return {
    course: {
      id: 'local-csc148',
      code: 'CSC148',
      name: 'CSC148 本地课程包',
      language: 'zh-CN',
      source: 'scripts/maintenance/import-csc148-*-markdown-notebook.mjs',
      snapshotVersion: 'csc148-local-2026-07-10',
      notebookCount: notebooks.length,
      sectionCount,
      assetCount: localized.assetCount,
    },
    notebooks,
  };
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.rmSync(LOCAL_PUBLIC_ASSET_ROOT, { force: true, recursive: true });

const courseData = await buildCourseData();
const problemBank = buildProblemBank();

fs.writeFileSync(COURSE_OUTPUT, `${JSON.stringify(courseData, null, 2)}\n`);
fs.writeFileSync(PROBLEM_BANK_OUTPUT, `${JSON.stringify(problemBank, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      wrote: [path.relative(ROOT, COURSE_OUTPUT), path.relative(ROOT, PROBLEM_BANK_OUTPUT)],
      notebooks: courseData.course.notebookCount,
      sections: courseData.course.sectionCount,
      problems: problemBank.stats.total,
      problemTypes: problemBank.stats.byType,
    },
    null,
    2,
  ),
);
