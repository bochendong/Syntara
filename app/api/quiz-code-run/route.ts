import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { NextRequest } from 'next/server';
import type { QuizCodeCaseResult, QuizCodeReport, QuizTestCase } from '@/lib/types/stage';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';

const log = createLogger('QuizCodeRun');
const RUN_TIMEOUT_MS = 5000;

interface QuizCodeRunRequest {
  questionId: string;
  userCode: string;
  starterCode?: string;
  language?: 'python';
  testCases?: QuizTestCase[];
}

type RunnerPayload = {
  codePath: string;
  testCases: Array<{
    id: string;
    description?: string;
    expression: string;
    expected: string;
    hidden?: boolean;
  }>;
};

type RunnerResult = {
  cases: QuizCodeCaseResult[];
};

const PYTHON_RUNNER = `
import json
import sys
import traceback
import importlib.util
import io
import contextlib


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
    spec = importlib.util.spec_from_file_location("quiz_submission", payload["codePath"])
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    results = []
    globals_dict = {"__builtins__": __builtins__}
    globals_dict.update(module.__dict__)

    for case in payload["testCases"]:
      expected = parse_expected(case["expected"])
      stdout_capture = io.StringIO()
      try:
          with contextlib.redirect_stdout(stdout_capture):
              actual = eval(case["expression"], globals_dict, {})
          normalized_actual = normalize(actual)
          normalized_expected = normalize(expected)
          passed = normalized_actual == normalized_expected
          results.append({
              "id": case["id"],
              "description": case.get("description"),
              "expression": case["expression"],
              "expected": case["expected"],
              "actual": json.dumps(normalized_actual, ensure_ascii=False),
              "passed": passed,
              "hidden": bool(case.get("hidden")),
              "stdout": stdout_capture.getvalue(),
          })
      except Exception as exc:
          results.append({
              "id": case["id"],
              "description": case.get("description"),
              "expression": case["expression"],
              "expected": case["expected"],
              "actual": None,
              "passed": False,
              "hidden": bool(case.get("hidden")),
              "error": "".join(traceback.format_exception_only(type(exc), exc)).strip(),
              "stdout": stdout_capture.getvalue(),
          })

    print(json.dumps({"cases": results}, ensure_ascii=False))


if __name__ == "__main__":
    main()
`.trim();

function normalizeTestCases(testCases: QuizTestCase[] | undefined): RunnerPayload['testCases'] {
  return (testCases ?? []).map((testCase, index) => ({
    id: testCase.id || `case_${index + 1}`,
    description: testCase.description,
    expression: testCase.expression,
    expected: testCase.expected,
    hidden: testCase.hidden,
  }));
}

async function runPythonJudge(payload: RunnerPayload): Promise<RunnerResult> {
  const runnerPath = path.join(os.tmpdir(), `quiz_runner_${randomUUID()}.py`);
  await writeFile(runnerPath, PYTHON_RUNNER, 'utf8');

  return await new Promise<RunnerResult>((resolve, reject) => {
    const child = spawn('python3', [runnerPath, JSON.stringify(payload)], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, RUN_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error('Python runner timed out'));
        return;
      }
      if (code !== 0) {
        reject(new Error(stderr || `Python runner exited with code ${code}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as { cases: Array<Record<string, unknown>> };
        const cases: QuizCodeCaseResult[] = (parsed.cases || []).map((entry) => ({
          id: String(entry.id || ''),
          description: typeof entry.description === 'string' ? entry.description : undefined,
          expression: String(entry.expression || ''),
          expected: String(entry.expected || ''),
          actual: typeof entry.actual === 'string' ? entry.actual : undefined,
          passed: Boolean(entry.passed),
          hidden: Boolean(entry.hidden),
          error: typeof entry.error === 'string' ? entry.error : undefined,
        }));
        resolve({ cases });
      } catch (error) {
        reject(error);
      }
    });
  }).finally(async () => {
    await rm(runnerPath, { force: true }).catch(() => undefined);
  });
}

export async function POST(req: NextRequest) {
  const tempDir = path.join(os.tmpdir(), `quiz_code_${randomUUID()}`);
  try {
    const body = (await req.json()) as QuizCodeRunRequest;
    const { userCode, starterCode, language, testCases } = body;

    if ((language && language !== 'python') || !userCode?.trim()) {
      return apiError('INVALID_REQUEST', 400, 'Only non-empty Python submissions are supported');
    }

    const normalizedCases = normalizeTestCases(testCases);
    if (normalizedCases.length === 0) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'At least one test case is required');
    }

    await mkdir(tempDir, { recursive: true });
    const codePath = path.join(tempDir, 'submission.py');
    const mergedCode = [starterCode?.trim(), userCode.trim()].filter(Boolean).join('\n\n');
    await writeFile(codePath, mergedCode, 'utf8');

    const result = await runPythonJudge({ codePath, testCases: normalizedCases });
    const report: QuizCodeReport = {
      passedCount: result.cases.filter((testCase) => testCase.passed).length,
      totalCount: result.cases.length,
      cases: result.cases,
    };

    return apiSuccess({ report });
  } catch (error) {
    log.error('Failed to run quiz code', error);
    return apiError('INTERNAL_ERROR', 500, 'Failed to run quiz code');
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
