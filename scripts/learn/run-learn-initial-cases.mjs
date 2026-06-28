#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const DEFAULT_CASE_FILE = path.join(ROOT, 'scripts', 'learn', 'learn-initial-25-cases.json');
const DEFAULT_OUT_ROOT = path.join(ROOT, 'tmp', 'learn-initial-case-runs');
const DEFAULT_BASE_URL = process.env.LEARN_TEST_BASE_URL || 'http://localhost:3000';
const DEFAULT_MODEL =
  process.env.LEARN_TEST_MODEL || process.env.DEFAULT_MODEL || 'openai:gpt-4o-mini';

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function parseArgs(argv) {
  const options = {
    caseFile: DEFAULT_CASE_FILE,
    outDir: '',
    baseUrl: DEFAULT_BASE_URL,
    model: DEFAULT_MODEL,
    userId: process.env.LEARN_TEST_USER_ID || 'local-demo-user',
    userEmail: process.env.LEARN_TEST_USER_EMAIL || 'local-demo@example.com',
    userName: process.env.LEARN_TEST_USER_NAME || 'Local Demo',
    runApi: false,
    limit: 0,
  };

  for (const arg of argv) {
    if (arg === '--run-api') {
      options.runApi = true;
    } else if (arg.startsWith('--case-file=')) {
      options.caseFile = path.resolve(ROOT, arg.slice('--case-file='.length));
    } else if (arg.startsWith('--out=')) {
      options.outDir = path.resolve(ROOT, arg.slice('--out='.length));
    } else if (arg.startsWith('--base-url=')) {
      options.baseUrl = arg.slice('--base-url='.length).replace(/\/$/, '');
    } else if (arg.startsWith('--model=')) {
      options.model = arg.slice('--model='.length);
    } else if (arg.startsWith('--limit=')) {
      options.limit = Math.max(0, Number.parseInt(arg.slice('--limit='.length), 10) || 0);
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.outDir ||= path.join(DEFAULT_OUT_ROOT, timestampSlug());
  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/learn/run-learn-initial-cases.mjs
  node scripts/learn/run-learn-initial-cases.mjs --run-api
  node scripts/learn/run-learn-initial-cases.mjs --run-api --limit=5

The runner saves JSONL and HTML for manual review. It intentionally avoids
semantic pass/fail assertions.
`);
}

function readCases(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const cases = Array.isArray(parsed) ? parsed : parsed.cases || [];
  return {
    name: parsed.name || path.basename(filePath, '.json'),
    description: parsed.description || '',
    cases: cases.map((item, index) => normalizeCase(item, index)),
  };
}

function normalizeCase(raw, index) {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Case ${index + 1} is not an object`);
  }
  const course = raw.course || {};
  const resources = raw.resources || {};
  return {
    id: String(raw.id || `case-${index + 1}`),
    course: {
      id: String(course.id || `course-${index + 1}`),
      name: String(course.name || 'Untitled Course'),
      code: String(course.code || course.courseCode || ''),
    },
    resources: {
      syllabus: Boolean(resources.syllabus),
      problemBankCount: Math.max(0, Number(resources.problemBankCount || 0)),
      uploadedSources: Boolean(resources.uploadedSources),
      memory: Boolean(resources.memory),
    },
    learnerSnapshot: raw.learnerSnapshot && typeof raw.learnerSnapshot === 'object'
      ? raw.learnerSnapshot
      : null,
    setup: raw.setup && typeof raw.setup === 'object' ? raw.setup : {},
    sourceUploads: Array.isArray(raw.sourceUploads) ? raw.sourceUploads : [],
    input: String(raw.input || '').trim(),
    expect: Array.isArray(raw.expect) ? raw.expect.map(String) : [],
  };
}

function syllabusFixture(caseItem) {
  if (!caseItem.resources.syllabus) return [];
  return [
    {
      id: `${caseItem.id}-syllabus-1`,
      title: '1.1 - Approximating Areas',
      kind: 'progress',
      date: '2026-05-04',
      origin: 'syllabus',
      sourceName: 'scenario syllabus',
    },
    {
      id: `${caseItem.id}-syllabus-2`,
      title: '1.2 - The definite integral',
      kind: 'progress',
      date: '2026-05-06',
      origin: 'syllabus',
      sourceName: 'scenario syllabus',
    },
    {
      id: `${caseItem.id}-syllabus-3`,
      title: '2.4 - u-substitution',
      kind: 'progress',
      date: '2026-05-20',
      origin: 'syllabus',
      sourceName: 'scenario syllabus',
    },
    {
      id: `${caseItem.id}-syllabus-4`,
      title: '3.7 - Improper integrals',
      kind: 'progress',
      date: '2026-06-10',
      origin: 'syllabus',
      sourceName: 'scenario syllabus',
    },
    {
      id: `${caseItem.id}-syllabus-5`,
      title: '5.1 - Sequences',
      kind: 'progress',
      date: '2026-07-06',
      origin: 'syllabus',
      sourceName: 'scenario syllabus',
    },
    {
      id: `${caseItem.id}-syllabus-6`,
      title: 'Test 2',
      kind: 'exam',
      date: '2026-07-28',
      origin: 'syllabus',
      sourceName: 'scenario syllabus',
    },
  ];
}

function problemBankFixture(caseItem) {
  const count = caseItem.resources.problemBankCount;
  if (!count) return { available: false, activeCount: 0, samples: [] };
  const topics = [
    'induction',
    'improper integrals',
    'BST insert',
    'edge cases',
    'recursion',
    'u-substitution',
  ];
  return {
    available: true,
    activeCount: count,
    samples: topics.slice(0, Math.min(6, count)).map((topic, index) => ({
      id: `${caseItem.id}-problem-${index + 1}`,
      title: `${topic} diagnostic problem`,
      notebookName: topic,
      tags: [caseItem.course.code, topic].filter(Boolean),
    })),
  };
}

function sourceUploadFixture(caseItem) {
  if (caseItem.sourceUploads.length) return caseItem.sourceUploads;
  if (!caseItem.resources.uploadedSources) return [];
  return [
    {
      id: `${caseItem.id}-source-1`,
      title: `${caseItem.course.code || caseItem.course.name} course notes`,
      kind: 'notebook',
      topic: caseItem.course.name,
      ragEntryIds: [`${caseItem.id}-rag-1`],
    },
  ];
}

function learnerSnapshotFixture(caseItem) {
  if (caseItem.learnerSnapshot) return caseItem.learnerSnapshot;
  return {
    progressKnown: caseItem.resources.memory,
    progressLabel: caseItem.resources.memory ? '已确认当前学习范围' : '',
    progressPercent: caseItem.resources.memory ? 35 : 0,
    weakConcepts: caseItem.resources.memory ? ['recent weak concept'] : [],
    nextConcepts: [],
    totalProblemCount: caseItem.resources.problemBankCount,
    attemptedProblemCount: 0,
  };
}

function buildRequestBody(caseItem) {
  const calendarEvents = [
    ...syllabusFixture(caseItem),
    ...(Array.isArray(caseItem.setup.calendarEvents) ? caseItem.setup.calendarEvents : []),
  ];
  const recentActivities = Array.isArray(caseItem.setup.recentActivities)
    ? caseItem.setup.recentActivities
    : [];
  const recentArtifacts = Array.isArray(caseItem.setup.recentArtifacts)
    ? caseItem.setup.recentArtifacts
    : [];
  const learnerSnapshot = learnerSnapshotFixture(caseItem);
  return {
    question: caseItem.input,
    recentMessages: [],
    courseId: caseItem.course.id,
    courseName: caseItem.course.name,
    courseCode: caseItem.course.code,
    hasSyllabus: caseItem.resources.syllabus,
    progressKnown: Boolean(learnerSnapshot.progressKnown),
    learnerSnapshot,
    calendarEvents,
    recentPlans: [],
    recentArtifacts,
    recentActions: [],
    recentActivities,
    sourceUploads: sourceUploadFixture(caseItem),
    problemBank: problemBankFixture(caseItem),
    layeredMemorySummary: caseItem.resources.memory
      ? 'Scenario memory: recent weak concept, mastery updates, and next teaching moves may exist.'
      : '',
  };
}

async function callLearnTurn(options, body) {
  const response = await fetch(`${options.baseUrl}/api/learn/turn`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-user-id': options.userId,
      'x-user-email': options.userEmail,
      'x-user-name': options.userName,
      ...(options.model.startsWith('openai:') ? { 'x-model': options.model } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { rawText: text };
  }
  return { status: response.status, ok: response.ok, body: parsed };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function summarizeResult(result) {
  if (!result) return 'not run';
  const body = result.body || {};
  const actionKinds = [...(body.directCalls || []), ...(body.proposals || [])]
    .map((action) => action.kind)
    .join(', ');
  const artifactKinds = (body.artifacts || []).map((artifact) => artifact.kind).join(', ');
  return [
    `HTTP ${result.status}`,
    `answerMode=${body.answerMode || 'unknown'}`,
    actionKinds ? `actions=${actionKinds}` : '',
    artifactKinds ? `artifacts=${artifactKinds}` : '',
  ]
    .filter(Boolean)
    .join(' | ');
}

function writeHtmlReport(args) {
  const rows = args.records
    .map((record) => {
      const body = record.result?.body || {};
      return `<tr>
        <td><strong>${escapeHtml(record.case.id)}</strong><br>${escapeHtml(record.case.course.code || record.case.course.name)}</td>
        <td>${escapeHtml(record.case.input)}</td>
        <td>${escapeHtml(record.case.expect.join(', '))}</td>
        <td>${escapeHtml(summarizeResult(record.result))}</td>
        <td><pre>${escapeHtml(body.replyText || '')}</pre></td>
        <td><pre>${escapeHtml(body.reason || '')}</pre></td>
        <td><pre>${escapeHtml(JSON.stringify({
          planningDecision: body.planningDecision || null,
          directCalls: body.directCalls || [],
          proposals: body.proposals || [],
          artifacts: body.artifacts || [],
        }, null, 2))}</pre></td>
      </tr>`;
    })
    .join('\n');

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(args.manifest.name)} /learn initial cases</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; color: #0f172a; background: #f8fafc; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    p { color: #475569; }
    table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #e2e8f0; }
    th, td { vertical-align: top; border-bottom: 1px solid #e2e8f0; padding: 10px; font-size: 13px; }
    th { position: sticky; top: 0; background: #e0f2fe; text-align: left; z-index: 1; }
    pre { white-space: pre-wrap; word-break: break-word; max-height: 280px; overflow: auto; margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
    tr:nth-child(even) td { background: #f8fafc; }
  </style>
</head>
<body>
  <h1>/learn initial 25 cases</h1>
  <p>${escapeHtml(args.manifest.description || '')}</p>
  <p>Generated at ${escapeHtml(new Date().toISOString())}. Semantic quality is for manual review; this report only preserves inputs and outputs.</p>
  <table>
    <thead>
      <tr>
        <th>Case</th>
        <th>Student entry</th>
        <th>Expected signals</th>
        <th>Runtime summary</th>
        <th>replyText</th>
        <th>reason</th>
        <th>Structured output</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
  fs.writeFileSync(path.join(args.outDir, 'report.html'), html);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = readCases(options.caseFile);
  const cases = options.limit ? manifest.cases.slice(0, options.limit) : manifest.cases;
  fs.mkdirSync(options.outDir, { recursive: true });
  const jsonlPath = path.join(options.outDir, 'results.jsonl');
  fs.writeFileSync(jsonlPath, '');

  const records = [];
  for (const caseItem of cases) {
    const body = buildRequestBody(caseItem);
    let result = null;
    if (options.runApi) {
      try {
        result = await callLearnTurn(options, body);
      } catch (error) {
        result = {
          status: 0,
          ok: false,
          body: { error: error instanceof Error ? error.message : String(error) },
        };
      }
    }
    const record = { case: caseItem, request: body, result };
    records.push(record);
    fs.appendFileSync(jsonlPath, `${JSON.stringify(record)}\n`);
    console.log(`${caseItem.id}: ${summarizeResult(result)}`);
  }

  writeHtmlReport({ outDir: options.outDir, manifest, records });
  fs.writeFileSync(
    path.join(options.outDir, 'summary.json'),
    `${JSON.stringify({
      name: manifest.name,
      caseCount: cases.length,
      runApi: options.runApi,
      baseUrl: options.baseUrl,
      model: options.model,
      outputs: {
        jsonl: path.relative(ROOT, jsonlPath),
        html: path.relative(ROOT, path.join(options.outDir, 'report.html')),
      },
    }, null, 2)}\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
