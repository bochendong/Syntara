#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const DEFAULT_SOURCE_PATH = 'queue/production-full-csc108-questions.json';

function argValue(name) {
  const prefix = `--${name}=`;
  const matched = process.argv.find((arg) => arg.startsWith(prefix));
  return matched ? matched.slice(prefix.length).trim() : null;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function loadQuestions(sourcePath) {
  const absolutePath = path.resolve(ROOT, sourcePath);
  const data = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  const questions = data.templateExports?.[0]?.questions;
  if (!Array.isArray(questions)) {
    throw new Error(`No questions found in ${sourcePath}`);
  }
  return questions;
}

function writeQuestionFiles(tempDir, question) {
  const importMatch = `${question.publicTestCode || ''}\n${question.secretTestCode || ''}`.match(
    /^\s*from\s+([A-Za-z_][A-Za-z0-9_]*)\s+import\s+/m,
  );
  const moduleName = String(importMatch?.[1] || question.questionNumber || 'q').replace(
    /[^A-Za-z0-9_]/g,
    '',
  );
  if (!moduleName) throw new Error(`Invalid questionNumber for ${question.id}`);

  const solutionCode = String(question.solutionCode || '').trim();
  if (!solutionCode) throw new Error(`Missing solutionCode for ${question.id}`);

  fs.writeFileSync(path.join(tempDir, `${moduleName}.py`), `${solutionCode}\n`, 'utf8');
  fs.writeFileSync(path.join(tempDir, 'test_public.py'), question.publicTestCode || '', 'utf8');
  fs.writeFileSync(path.join(tempDir, 'test_secret.py'), question.secretTestCode || '', 'utf8');
}

function runQuestion(question, keepFailures) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `csc108-${question.id}-`));
  try {
    writeQuestionFiles(tempDir, question);
    const result = spawnSync('python3', ['-m', 'unittest', 'test_public.py', 'test_secret.py'], {
      cwd: tempDir,
      encoding: 'utf8',
      timeout: 10_000,
    });

    const passed = result.status === 0;
    if (!passed && keepFailures) {
      console.error(`Kept failing files for ${question.id}:${question.functionName} at ${tempDir}`);
      return { passed, tempDir, result };
    }
    if (!keepFailures) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    return { passed, tempDir: keepFailures ? tempDir : null, result };
  } catch (error) {
    if (!keepFailures) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    throw error;
  }
}

const sourcePath = argValue('source') || DEFAULT_SOURCE_PATH;
const keepFailures = hasFlag('keep-failures');
const questions = loadQuestions(sourcePath);
const failures = [];

for (const question of questions) {
  const run = runQuestion(question, keepFailures);
  if (run.passed) {
    console.log(`PASS ${question.id}:${question.functionName}`);
    continue;
  }

  failures.push({
    id: question.id,
    functionName: question.functionName,
    category: question.category,
    stdout: run.result.stdout,
    stderr: run.result.stderr,
    status: run.result.status,
    signal: run.result.signal,
    tempDir: run.tempDir,
  });
  console.error(`FAIL ${question.id}:${question.functionName}`);
  if (run.result.stdout) console.error(run.result.stdout);
  if (run.result.stderr) console.error(run.result.stderr);
}

console.log(
  JSON.stringify(
    {
      sourcePath,
      total: questions.length,
      passed: questions.length - failures.length,
      failed: failures.length,
      failures: failures.map((failure) => ({
        id: failure.id,
        functionName: failure.functionName,
        category: failure.category,
        status: failure.status,
        signal: failure.signal,
        tempDir: failure.tempDir,
      })),
    },
    null,
    2,
  ),
);

if (failures.length > 0) {
  process.exitCode = 1;
}
