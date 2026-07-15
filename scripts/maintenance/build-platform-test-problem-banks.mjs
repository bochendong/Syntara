#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, 'data', 'platform-tests', 'problem-banks');
const MAT136_SOURCE = path.join(
  ROOT,
  'tmp',
  'db-v2-critical-export-smoke',
  'mat102-mat136-problem-banks.json',
);
const CSC148_SOURCE = path.join(ROOT, 'data', 'csc148', 'problem-bank.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function compact(value, maxLength = 8_000) {
  const text = String(value ?? '').trim();
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

function compactTitle(value) {
  const firstMeaningfulLine = String(value ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s{0,3}#{1,6}\s*/, '').trim())
    .find(Boolean);
  return compact(firstMeaningfulLine || '未命名题目', 180);
}

function publicQuestionText(publicContent, fallback) {
  const content = asRecord(publicContent);
  const direct = content.stem ?? content.stemTemplate ?? content.question ?? content.prompt;
  if (typeof direct === 'string' && direct.trim()) return compact(direct);
  return compact(fallback);
}

function sanitizedPublicContent(value) {
  const content = asRecord(value);
  const allowedKeys = [
    'type',
    'stem',
    'stemTemplate',
    'selectionMode',
    'options',
    'blanks',
    'starterCode',
    'codeSnippet',
    'functionName',
    'description',
    'statementSections',
    'starterCodeDescription',
  ];
  return Object.fromEntries(
    allowedKeys.filter((key) => content[key] !== undefined).map((key) => [key, content[key]]),
  );
}

function buildMat136() {
  const source = readJson(MAT136_SOURCE);
  const course = source.courses.find(
    (item) =>
      String(item.courseCode || '')
        .replace(/\s+/g, '')
        .toUpperCase() === 'MAT136' && item.listedInCourseStore,
  );
  if (!course) throw new Error('The MAT136 published course is missing from the DB snapshot.');
  const notebookNames = new Map(course.notebooks.map((item) => [item.id, item.name]));
  const problems = course.problems
    .filter((problem) => problem.status === 'published')
    .map((problem) => ({
      id: problem.id,
      order: problem.order,
      title: compactTitle(problem.title),
      notebookId: problem.notebookId || null,
      notebookTitle: notebookNames.get(problem.notebookId) || null,
      type: problem.type,
      difficulty: problem.difficulty,
      points: problem.points,
      tags: Array.isArray(problem.tags) ? problem.tags.map(String) : [],
      question: publicQuestionText(problem.publicContentJson, problem.title),
      publicContent: sanitizedPublicContent(problem.publicContentJson),
      source: 'database_snapshot',
    }));
  return {
    schemaVersion: 1,
    courseCode: 'MAT136',
    courseName: course.name,
    source: 'db-v2-critical-export-smoke',
    sourceExportedAt: source.exportedAt,
    generatedAt: new Date().toISOString(),
    problemCount: problems.length,
    problems,
  };
}

function buildCsc148() {
  const source = readJson(CSC148_SOURCE);
  const problems = source.problems.map((problem) => {
    const publicContent = {
      type: problem.type,
      stem: problem.question || problem.description || problem.title,
      options: problem.options,
      starterCode: problem.templateCode,
    };
    return {
      id: problem.id,
      order: problem.order,
      title: compactTitle(problem.title),
      notebookId: problem.notebookId || null,
      notebookTitle: problem.notebookTitle || problem.sectionTitle || problem.category || null,
      type: problem.type,
      difficulty: problem.difficulty,
      points: typeof problem.points === 'number' ? problem.points : 1,
      tags: Array.isArray(problem.tags) ? problem.tags.map(String) : [],
      question: publicQuestionText(publicContent, problem.title),
      publicContent: sanitizedPublicContent(publicContent),
      source: 'database_snapshot',
    };
  });
  return {
    schemaVersion: 1,
    courseCode: 'CSC148',
    courseName: source.course || 'CSC148',
    source: source.sourceFile || 'data/csc148/problem-bank.json',
    sourceExportedAt: source.generatedAt || null,
    generatedAt: new Date().toISOString(),
    problemCount: problems.length,
    problems,
  };
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const banks = [buildMat136(), buildCsc148()];
for (const bank of banks) {
  const filePath = path.join(OUTPUT_DIR, `${bank.courseCode.toLowerCase()}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(bank, null, 2)}\n`);
  console.log(
    `${bank.courseCode}: ${bank.problemCount} problems -> ${path.relative(ROOT, filePath)}`,
  );
}
