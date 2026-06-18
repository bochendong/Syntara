#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const DEFAULT_COURSE_ID = 'cmpnueg4p001d8o017jee1mjq';

const PYTHON_RUNNER = `
import contextlib
import importlib.util
import io
import json
import sys
import traceback


def normalize(value):
    if isinstance(value, tuple):
        return [normalize(v) for v in value]
    if isinstance(value, list):
        return [normalize(v) for v in value]
    if isinstance(value, dict):
        return {str(k): normalize(v) for k, v in value.items()}
    return value


def parse_expected(raw):
    try:
        return json.loads(raw)
    except Exception:
        try:
            return eval(raw, {"__builtins__": {}}, {})
        except Exception:
            return raw


def main():
    payload = json.loads(sys.argv[1])
    spec = importlib.util.spec_from_file_location("submission", payload["codePath"])
    module = importlib.util.module_from_spec(spec)
    module_stdout_capture = io.StringIO()
    try:
        with contextlib.redirect_stdout(module_stdout_capture):
            spec.loader.exec_module(module)
    except BaseException as exc:
        error = "".join(traceback.format_exception_only(type(exc), exc)).strip()
        print(json.dumps({
            "cases": [
                {"id": case["id"], "passed": False, "error": error}
                for case in payload["testCases"]
            ],
            "moduleError": error,
        }, ensure_ascii=False))
        return

    globals_dict = module.__dict__
    globals_dict["__builtins__"] = __builtins__
    results = []
    for case in payload["testCases"]:
        expected = parse_expected(case["expected"])
        try:
            actual = eval(case["expression"], globals_dict, {})
            results.append({
                "id": case["id"],
                "passed": normalize(actual) == normalize(expected),
                "actual": json.dumps(normalize(actual), ensure_ascii=False),
            })
        except BaseException as exc:
            results.append({
                "id": case["id"],
                "passed": False,
                "error": "".join(traceback.format_exception_only(type(exc), exc)).strip(),
            })

    print(json.dumps({"cases": results}, ensure_ascii=False))


if __name__ == "__main__":
    main()
`.trim();

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

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function codeCases(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : [];
}

function runCases({ starterCode, solutionCode, testCases, timeoutMs }) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csc108-db-submit-'));
  const codePath = path.join(tempDir, 'submission.py');
  const runnerPath = path.join(tempDir, 'runner.py');
  try {
    fs.writeFileSync(
      codePath,
      [String(starterCode || '').trim(), String(solutionCode || '').trim()]
        .filter(Boolean)
        .join('\n\n') + '\n',
      'utf8',
    );
    fs.writeFileSync(runnerPath, PYTHON_RUNNER, 'utf8');

    const result = spawnSync(
      'python3',
      [
        runnerPath,
        JSON.stringify({
          codePath,
          testCases,
        }),
      ],
      {
        encoding: 'utf8',
        timeout: timeoutMs,
      },
    );

    if (result.status !== 0) {
      return {
        cases: testCases.map((testCase) => ({
          id: testCase.id,
          passed: false,
          error: result.stderr || `runner exited with ${result.status}`,
        })),
      };
    }

    return JSON.parse(result.stdout);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function main() {
  loadEnvLocal();
  const courseId = argValue('course-id') || DEFAULT_COURSE_ID;
  const sourceFileName = argValue('source-file');
  const prisma = new PrismaClient();
  try {
    const where = {
      type: 'code',
      OR: [{ courseId }, { notebook: { courseId } }],
    };
    if (sourceFileName) {
      where.sourceMeta = {
        path: ['sourceFileName'],
        equals: sourceFileName,
      };
    }

    const rows = await prisma.notebookProblem.findMany({
      where,
      include: { secret: true },
      orderBy: [{ problemNumber: 'asc' }, { createdAt: 'asc' }],
    });

    const failures = [];
    let publicTotal = 0;
    let publicPassed = 0;
    let secretTotal = 0;
    let secretPassed = 0;

    for (const row of rows) {
      const publicContent = objectValue(row.publicContentJson);
      const grading = objectValue(row.gradingJson);
      const secretJudge = objectValue(row.secret?.secretJudgeJson);
      const solutionCode = grading.referenceAnswer || grading.solutionCode;
      const publicCases = codeCases(publicContent.publicTests);
      const secretCases = codeCases(secretJudge.secretTests);
      const testCases = [...publicCases, ...secretCases];

      if (!solutionCode || testCases.length === 0) {
        failures.push({
          id: row.id,
          title: row.title,
          reason: !solutionCode ? 'missing solutionCode' : 'missing tests',
        });
        console.error(`FAIL ${row.title}: missing solution or tests`);
        continue;
      }

      const result = runCases({
        starterCode: publicContent.starterCode,
        solutionCode,
        testCases,
        timeoutMs: secretJudge.timeoutMs || 5000,
      });
      const publicResults = result.cases.slice(0, publicCases.length);
      const secretResults = result.cases.slice(publicCases.length);
      publicTotal += publicResults.length;
      secretTotal += secretResults.length;
      publicPassed += publicResults.filter((testCase) => testCase.passed).length;
      secretPassed += secretResults.filter((testCase) => testCase.passed).length;

      const failedCases = result.cases.filter((testCase) => !testCase.passed);
      if (failedCases.length > 0) {
        failures.push({
          id: row.id,
          title: row.title,
          failedCases,
        });
        console.error(`FAIL ${row.title}: ${failedCases.length} failed`);
      } else {
        console.log(`PASS ${row.title}`);
      }
    }

    console.log(
      JSON.stringify(
        {
          courseId,
          sourceFileName: sourceFileName || 'all',
          problemCount: rows.length,
          public: { passed: publicPassed, total: publicTotal },
          secret: { passed: secretPassed, total: secretTotal },
          failedProblems: failures.length,
          failures,
        },
        null,
        2,
      ),
    );

    if (failures.length > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
