import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  NotebookProblemAttemptAnswer,
  NotebookProblemAttemptResult,
  NotebookProblemRecord,
  NotebookProblemSecretJudge,
} from '@/lib/problem-bank';
import { isNotebookCodeProblemRecord } from '@/lib/problem-bank';

const DEFAULT_TIMEOUT_MS = 5000;

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
    spec = importlib.util.spec_from_file_location("submission", payload["codePath"])
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
            results.append({
                "id": case["id"],
                "description": case.get("description"),
                "passed": normalized_actual == normalized_expected,
                "actual": json.dumps(normalized_actual, ensure_ascii=False),
                "stdout": stdout_capture.getvalue(),
            })
        except Exception as exc:
            results.append({
                "id": case["id"],
                "description": case.get("description"),
                "passed": False,
                "error": "".join(traceback.format_exception_only(type(exc), exc)).strip(),
                "stdout": stdout_capture.getvalue(),
            })

    print(json.dumps({"cases": results}, ensure_ascii=False))


if __name__ == "__main__":
    main()
`.trim();

type CodeCase = {
  id: string;
  description?: string;
  expression: string;
  expected: string;
};

type RawRunnerCaseResult = {
  id: string;
  description?: string;
  passed: boolean;
  actual?: string;
  error?: string;
};

type JudgeKind = 'run' | 'submit';

function normalizeCode(userAnswer: NotebookProblemAttemptAnswer): string {
  return userAnswer.code?.trim() || '';
}

function buildCodePayload(
  problem: NotebookProblemRecord,
  secretJudge: NotebookProblemSecretJudge | undefined,
  kind: JudgeKind,
): {
  timeoutMs: number;
  publicCases: CodeCase[];
  secretCases: CodeCase[];
} {
  if (!isNotebookCodeProblemRecord(problem)) {
    throw new Error('Only code problems can be judged');
  }

  const publicCases = problem.publicContent.publicTests.map((testCase) => ({
    id: testCase.id,
    description: testCase.description,
    expression: testCase.expression,
    expected: testCase.expected,
  }));
  const secretCases =
    kind === 'submit'
      ? (secretJudge?.secretTests ?? []).map((testCase) => ({
          id: testCase.id,
          description: testCase.description,
          expression: testCase.expression,
          expected: testCase.expected,
        }))
      : [];

  return {
    timeoutMs: secretJudge?.timeoutMs || DEFAULT_TIMEOUT_MS,
    publicCases,
    secretCases,
  };
}

async function executePythonCases(args: {
  code: string;
  starterCode?: string;
  testCases: CodeCase[];
  timeoutMs: number;
}): Promise<RawRunnerCaseResult[]> {
  const tempDir = path.join(os.tmpdir(), `problem_bank_${randomUUID()}`);
  const codePath = path.join(tempDir, 'submission.py');
  const runnerPath = path.join(tempDir, 'runner.py');

  await mkdir(tempDir, { recursive: true });
  await writeFile(
    codePath,
    [args.starterCode?.trim(), args.code.trim()].filter(Boolean).join('\n\n'),
    'utf8',
  );
  await writeFile(runnerPath, PYTHON_RUNNER, 'utf8');

  const payload = JSON.stringify({
    codePath,
    testCases: args.testCases,
  });

  try {
    return await new Promise<RawRunnerCaseResult[]>((resolve, reject) => {
      const child = spawn('python3', [runnerPath, payload], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, args.timeoutMs);

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
          const parsed = JSON.parse(stdout) as { cases?: RawRunnerCaseResult[] };
          resolve(parsed.cases ?? []);
        } catch (error) {
          reject(error);
        }
      });
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function judgeNotebookCodeProblem(args: {
  problem: NotebookProblemRecord;
  secretJudge?: NotebookProblemSecretJudge;
  userAnswer: NotebookProblemAttemptAnswer;
  kind: JudgeKind;
}): Promise<{
  status: 'passed' | 'failed' | 'partial' | 'error';
  score: number;
  result: NotebookProblemAttemptResult;
}> {
  const code = normalizeCode(args.userAnswer);
  if (!code) {
    return {
      status: 'error',
      score: 0,
      result: {
        correct: false,
        feedback: 'Code is required.',
        earnedPoints: 0,
        publicCases: [],
      },
    };
  }

  if (!isNotebookCodeProblemRecord(args.problem)) {
    return {
      status: 'error',
      score: 0,
      result: {
        correct: false,
        feedback: 'Only code problems can be judged here.',
        earnedPoints: 0,
        publicCases: [],
      },
    };
  }

  const problem = args.problem;

  const payload = buildCodePayload(problem, args.secretJudge, args.kind);
  if (payload.publicCases.length === 0) {
    return {
      status: 'error',
      score: 0,
      result: {
        correct: false,
        feedback: 'This code problem is missing public tests.',
        earnedPoints: 0,
        publicCases: [],
      },
    };
  }

  try {
    const publicCases = await executePythonCases({
      code,
      starterCode: problem.publicContent.starterCode,
      testCases: payload.publicCases,
      timeoutMs: payload.timeoutMs,
    });
    const publicCaseResults = publicCases.map((caseResult) => ({
      id: caseResult.id,
      description: caseResult.description,
      passed: caseResult.passed,
      actual: caseResult.actual,
      error: caseResult.error,
    }));

    const publicPassed = publicCaseResults.filter((caseResult) => caseResult.passed).length;
    const publicFailed = publicCaseResults.length - publicPassed;

    if (args.kind === 'run') {
      const allPassed = publicFailed === 0;
      return {
        status: allPassed ? 'passed' : publicPassed > 0 ? 'partial' : 'failed',
        score: allPassed ? problem.points : 0,
        result: {
          correct: allPassed,
          feedback: `Passed ${publicPassed}/${publicCaseResults.length} public tests.`,
          earnedPoints: allPassed ? problem.points : 0,
          publicCases: publicCaseResults,
        },
      };
    }

    const secretCases = await executePythonCases({
      code,
      starterCode: problem.publicContent.starterCode,
      testCases: payload.secretCases,
      timeoutMs: payload.timeoutMs,
    });
    const secretPassed = secretCases.filter((caseResult) => caseResult.passed).length;
    const secretFailed = secretCases.length - secretPassed;
    const allPassed = publicFailed === 0 && secretFailed === 0;
    return {
      status: allPassed ? 'passed' : publicPassed > 0 || secretPassed > 0 ? 'partial' : 'failed',
      score: allPassed ? problem.points : 0,
      result: {
        correct: allPassed,
        feedback: allPassed
          ? 'All public and secret tests passed.'
          : `Public ${publicPassed}/${publicCaseResults.length}; secret ${secretPassed}/${secretCases.length}.`,
        earnedPoints: allPassed ? problem.points : 0,
        publicCases: publicCaseResults,
        secretSummary: {
          total: secretCases.length,
          passed: secretPassed,
          failed: secretFailed,
          failureSummary:
            secretFailed > 0 ? `${secretFailed} secret tests failed.` : 'All secret tests passed.',
        },
      },
    };
  } catch (error) {
    return {
      status: 'error',
      score: 0,
      result: {
        correct: false,
        feedback:
          error instanceof Error
            ? error.message
            : 'Code runner unavailable. Please try again later.',
        earnedPoints: 0,
        publicCases: [],
      },
    };
  }
}
