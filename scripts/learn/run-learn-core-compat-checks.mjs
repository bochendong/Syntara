#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const DEFAULT_BASE_URL = process.env.LEARN_TEST_BASE_URL || 'http://localhost:3000';
const DEFAULT_MODEL =
  process.env.LEARN_TEST_MODEL || process.env.DEFAULT_MODEL || 'openai:gpt-4o-mini';
const DEFAULT_OUT_ROOT = path.join(ROOT, 'tmp', 'learn-core-compat-checks');

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    model: DEFAULT_MODEL,
    userId: process.env.LEARN_TEST_USER_ID || 'local-demo-user',
    userEmail: process.env.LEARN_TEST_USER_EMAIL || 'local-demo@example.com',
    userName: process.env.LEARN_TEST_USER_NAME || 'Local Demo',
    outDir: '',
  };

  for (const arg of argv) {
    if (arg === '--') {
      continue;
    } else if (arg.startsWith('--base-url=')) {
      options.baseUrl = arg.slice('--base-url='.length).replace(/\/$/, '');
    } else if (arg.startsWith('--model=')) {
      options.model = arg.slice('--model='.length);
    } else if (arg.startsWith('--out=')) {
      options.outDir = path.resolve(ROOT, arg.slice('--out='.length));
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
  pnpm test:learn-core-compat
  pnpm test:learn-core-compat -- --base-url=http://localhost:3000

Checks that /api/learn/turn, /api/learn/action-planner, and
/api/learn/planning-intent share the AI semantic router and expose compatible
structured responses for stable scenarios.
`);
}

function calendarFixture() {
  return [
    {
      id: 'compat-syllabus-1',
      title: '1.1 - Approximating Areas',
      kind: 'progress',
      date: '2026-05-04',
      origin: 'syllabus',
    },
    {
      id: 'compat-syllabus-2',
      title: '3.7 - Improper integrals',
      kind: 'progress',
      date: '2026-06-10',
      origin: 'syllabus',
    },
    {
      id: 'compat-syllabus-3',
      title: 'Test 2',
      kind: 'exam',
      date: '2026-07-28',
      origin: 'syllabus',
    },
  ];
}

function turnBody(question) {
  const calendarEvents = calendarFixture();
  return {
    question,
    recentMessages: [],
    courseId: 'mat136-local-fixture',
    courseName: 'Calculus II',
    courseCode: 'MAT 136',
    hasSyllabus: true,
    progressKnown: false,
    learnerSnapshot: { progressKnown: false, weakConcepts: [], nextConcepts: [] },
    calendarEvents,
    recentPlans: [],
    recentArtifacts: [],
    recentActions: [],
    recentActivities: [],
    problemBank: { available: false, activeCount: 0, samples: [] },
    sourceUploads: [],
    layeredMemorySummary: '',
  };
}

function actionPlannerBody(question) {
  return {
    question,
    recentMessages: [],
    courseId: 'mat136-local-fixture',
    courseName: 'Calculus II',
    courseCode: 'MAT 136',
    learnerSnapshot: { progressKnown: false, weakConcepts: [], nextConcepts: [] },
    calendarEvents: calendarFixture(),
    recentPlans: [],
    recentArtifacts: [],
    recentActions: [],
    recentActivities: [],
    layeredMemorySummary: '',
  };
}

function planningIntentBody(question) {
  return {
    question,
    recentMessages: [],
    hasSyllabus: true,
    progressKnown: false,
    courseName: 'Calculus II',
    courseCode: 'MAT 136',
  };
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function traceToolIds(body) {
  return asArray(body?.trace?.toolCalls)
    .map((call) => (call && typeof call === 'object' ? call.toolId : null))
    .filter(Boolean);
}

function traceSelectedToolIds(body) {
  const selected = [];
  for (const call of asArray(body?.trace?.toolCalls)) {
    selected.push(...asArray(call?.metadata?.selectedToolIds));
  }
  return selected.filter(Boolean);
}

function actionKinds(body, key) {
  return asArray(body?.[key])
    .map((action) => (action && typeof action === 'object' ? action.kind : null))
    .filter(Boolean);
}

function hasAll(actual, expected) {
  const set = new Set(actual);
  return expected.every((item) => set.has(item));
}

function hasNone(actual, forbidden) {
  const set = new Set(actual);
  return forbidden.every((item) => !set.has(item));
}

async function callEndpoint(options, endpoint, body) {
  const response = await fetch(`${options.baseUrl}${endpoint}`, {
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

const CHECKS = [
  {
    id: 'turn-review-plan',
    endpoint: '/api/learn/turn',
    body: turnBody('我这门 MAT136 还有 4 周考试，帮我排一个课程计划。'),
    expect(body) {
      return [
        body.answerMode === 'client_activity_plan' || 'expected client_activity_plan',
        hasAll(traceToolIds(body), ['semantic_router']) || 'expected semantic_router trace tool',
        hasAll(traceSelectedToolIds(body), ['plan_review']) || 'expected plan_review selection',
        hasNone(traceToolIds(body), ['legacy_semantic_planner']) ||
          'did not expect legacy_semantic_planner',
      ];
    },
  },
  {
    id: 'action-planner-calendar-update',
    endpoint: '/api/learn/action-planner',
    body: actionPlannerBody('如果我周三没学，后面怎么顺延？需要改日历的话先给确认。'),
    expect(body) {
      return [
        hasAll(actionKinds(body, 'proposals'), ['calendar.propose_update']) ||
          'expected calendar.propose_update proposal',
        hasAll(traceToolIds(body), ['semantic_router']) || 'expected semantic_router trace tool',
        hasAll(traceSelectedToolIds(body), ['propose_calendar_change']) ||
          'expected propose_calendar_change selection',
        hasNone(traceToolIds(body), ['legacy_semantic_planner']) ||
          'did not expect legacy_semantic_planner',
      ];
    },
  },
  {
    id: 'planning-intent-review-plan',
    endpoint: '/api/learn/planning-intent',
    body: planningIntentBody('帮我做一个 MAT136 四周复习计划。'),
    expect(body) {
      return [
        body.intent === 'review_plan' || 'expected review_plan intent',
        hasAll(traceToolIds(body), ['semantic_router']) || 'expected semantic_router trace tool',
        hasAll(traceSelectedToolIds(body), ['plan_review']) || 'expected plan_review selection',
        hasNone(traceToolIds(body), ['legacy_semantic_planner']) ||
          'did not expect legacy_semantic_planner',
      ];
    },
  },
  {
    id: 'planning-intent-first-half-scope',
    endpoint: '/api/learn/planning-intent',
    body: planningIntentBody('帮我按前半学期内容做一个复习计划。'),
    expect(body) {
      return [
        body.intent === 'review_plan' || 'expected review_plan intent',
        body.scopeHint === 'first_half' || `expected first_half scopeHint, got ${body.scopeHint}`,
        hasAll(traceToolIds(body), ['semantic_router']) || 'expected semantic_router trace tool',
        hasAll(traceSelectedToolIds(body), ['plan_review']) || 'expected plan_review selection',
        hasNone(traceToolIds(body), ['legacy_semantic_planner']) ||
          'did not expect legacy_semantic_planner',
      ];
    },
  },
];

async function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.outDir, { recursive: true });
  const jsonlPath = path.join(options.outDir, 'results.jsonl');
  fs.writeFileSync(jsonlPath, '');

  const records = [];
  for (const check of CHECKS) {
    let result;
    try {
      result = await callEndpoint(options, check.endpoint, check.body);
    } catch (error) {
      result = {
        status: 0,
        ok: false,
        body: { error: error instanceof Error ? error.message : String(error) },
      };
    }
    const failures = [
      result.ok || `HTTP ${result.status}`,
      ...check.expect(result.body || {}),
    ].filter((item) => item !== true);
    const record = { id: check.id, endpoint: check.endpoint, result, failures };
    records.push(record);
    fs.appendFileSync(jsonlPath, `${JSON.stringify(record)}\n`);
    console.log(`${check.id}: ${failures.length ? `FAIL ${failures.join('; ')}` : 'ok'}`);
  }

  const failureCount = records.filter((record) => record.failures.length > 0).length;
  const summary = {
    baseUrl: options.baseUrl,
    model: options.model,
    checkCount: records.length,
    failureCount,
    outputs: {
      jsonl: path.relative(ROOT, jsonlPath),
    },
  };
  fs.writeFileSync(
    path.join(options.outDir, 'summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  console.log(JSON.stringify(summary, null, 2));
  if (failureCount > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
