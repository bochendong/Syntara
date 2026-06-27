#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const DEFAULT_BASE_URL = process.env.LEARN_TEST_BASE_URL || 'http://localhost:3000';
const DEFAULT_OUT_ROOT = path.join(ROOT, 'tmp', 'learn-scenario-runs');
const DEFAULT_MODEL =
  process.env.LEARN_TEST_MODEL || process.env.DEFAULT_MODEL || 'openai:gpt-4o-mini';

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
    courseId: process.env.LEARN_TEST_COURSE_ID || 'mat136-local-fixture',
    courseName: process.env.LEARN_TEST_COURSE_NAME || 'Calculus II',
    courseCode: process.env.LEARN_TEST_COURSE_CODE || 'MAT 136',
    runApi: false,
    scenarioFiles: [],
    outDir: '',
  };

  for (const arg of argv) {
    if (arg === '--') {
      continue;
    } else if (arg === '--run-api') {
      options.runApi = true;
    } else if (arg.startsWith('--base-url=')) {
      options.baseUrl = arg.slice('--base-url='.length).replace(/\/$/, '');
    } else if (arg.startsWith('--model=')) {
      options.model = arg.slice('--model='.length);
    } else if (arg.startsWith('--user-id=')) {
      options.userId = arg.slice('--user-id='.length);
    } else if (arg.startsWith('--user-email=')) {
      options.userEmail = arg.slice('--user-email='.length);
    } else if (arg.startsWith('--user-name=')) {
      options.userName = arg.slice('--user-name='.length);
    } else if (arg.startsWith('--course-id=')) {
      options.courseId = arg.slice('--course-id='.length);
    } else if (arg.startsWith('--course-name=')) {
      options.courseName = arg.slice('--course-name='.length);
    } else if (arg.startsWith('--course-code=')) {
      options.courseCode = arg.slice('--course-code='.length);
    } else if (arg.startsWith('--scenario-file=')) {
      options.scenarioFiles.push(path.resolve(ROOT, arg.slice('--scenario-file='.length)));
    } else if (arg.startsWith('--scenario-dir=')) {
      const dir = path.resolve(ROOT, arg.slice('--scenario-dir='.length));
      const files = fs
        .readdirSync(dir)
        .filter((name) => name.endsWith('.json'))
        .sort()
        .map((name) => path.join(dir, name));
      options.scenarioFiles.push(...files);
    } else if (arg.startsWith('--out=')) {
      options.outDir = path.resolve(ROOT, arg.slice('--out='.length));
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.scenarioFiles.length === 0) {
    options.scenarioFiles.push(
      path.join(
        ROOT,
        'scripts',
        'maintenance',
        'course-chat-scenarios',
        'mat136-plan-weakness-calendar.json',
      ),
    );
  }
  options.outDir ||= path.join(DEFAULT_OUT_ROOT, timestampSlug());
  return options;
}

function printHelp() {
  console.log(`Usage:
  pnpm test:learn-scenarios
  pnpm test:learn-scenarios -- --run-api --scenario-dir=scripts/maintenance/course-chat-scenarios
  pnpm test:learn-scenarios -- --scenario-file=scripts/maintenance/course-chat-scenarios/mat136-plan-weakness-calendar.json

This runner intentionally does not assert semantic correctness. It saves the full
conversation inputs, /learn turn outputs, artifacts, actions, and simulated state
snapshots for manual review.
`);
}

function readScenario(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  const steps = Array.isArray(parsed) ? parsed : parsed.steps || parsed.messages || [];
  const initialCalendarEvents =
    parsed && typeof parsed === 'object' && Array.isArray(parsed.initialCalendarEvents)
      ? parsed.initialCalendarEvents.filter((event) => event && typeof event === 'object')
      : [];
  const initialArtifacts =
    parsed && typeof parsed === 'object' && Array.isArray(parsed.initialArtifacts)
      ? parsed.initialArtifacts.filter((artifact) => artifact && typeof artifact === 'object')
      : [];
  return {
    filePath,
    name:
      (parsed &&
        typeof parsed === 'object' &&
        typeof parsed.name === 'string' &&
        parsed.name.trim()) ||
      path.basename(filePath, '.json'),
    initialCalendarEvents,
    initialArtifacts,
    steps: steps.map((step, index) => normalizeStep(step, index)).filter(Boolean),
  };
}

function normalizeStep(raw, index) {
  if (typeof raw === 'string') {
    const text = raw.trim();
    return text ? { kind: 'user', text } : null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const kind = String(raw.kind || raw.type || 'user').toLowerCase();
  if (kind === 'ui' || kind === 'button' || kind === 'click' || kind === 'confirm') {
    return {
      kind: 'ui',
      label: String(raw.label || raw.button || raw.actionLabel || `UI step ${index + 1}`),
      actionId: raw.actionId || raw.id || raw.action || null,
      event: raw.event || raw.outcome || raw.status || null,
      sendText: String(raw.sendText || raw.sendAsUser || raw.message || raw.prompt || '').trim(),
      note: raw.note || raw.description || null,
      payload: raw.payload && typeof raw.payload === 'object' ? raw.payload : null,
    };
  }
  if (kind === 'snapshot' || kind === 'state' || kind === 'inspect' || kind === 'check_state') {
    return {
      kind: 'snapshot',
      label: String(raw.label || raw.query || `Snapshot ${index + 1}`),
      query: raw.query || null,
      note: raw.note || raw.description || null,
    };
  }
  if (kind === 'new_conversation' || kind === 'new-dialog' || kind === 'new_dialog') {
    return {
      kind: 'new_conversation',
      label: String(raw.label || `New conversation ${index + 1}`),
      note: raw.note || raw.description || null,
    };
  }
  const text = String(raw.text || raw.message || raw.prompt || '').trim();
  return text ? { kind: 'user', text } : null;
}

function stableRecord(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function collectRecentArtifacts(messages, limit = 20) {
  return messages
    .slice()
    .reverse()
    .flatMap((message) => message.artifacts || [])
    .slice(0, limit);
}

function collectPendingActions(messages, limit = 10) {
  return messages
    .slice()
    .reverse()
    .flatMap((message) => message.learningActions || [])
    .filter(
      (action) =>
        action.confirmation === 'required' && (!action.status || action.status === 'proposed'),
    )
    .slice(0, limit);
}

function applySimulatedUiStep(state, step) {
  const pending = collectPendingActions(state.messages, 20);
  const matched =
    pending.find((action) => action.id === step.actionId || action.kind === step.actionId) || null;
  if (matched && step.event === 'confirmed') {
    if (matched.kind === 'calendar.propose_add') {
      const items = Array.isArray(matched.payload?.items) ? matched.payload.items : [];
      state.calendarEvents.push(
        ...items.map((item, index) => ({
          id: `sim-calendar-${state.calendarEvents.length + index + 1}`,
          title: item.title || item.label || `学习活动 ${index + 1}`,
          date: item.date || new Date().toISOString().slice(0, 10),
          kind: 'progress',
          origin: 'ai_plan',
          status: 'planned',
          durationMinutes: item.durationMinutes || null,
          sourceRef: { type: 'action', id: matched.id },
        })),
      );
    }
    if (matched.kind === 'memory.propose_write') {
      state.memoryCandidates.push({
        id: `sim-memory-${state.memoryCandidates.length + 1}`,
        summary: matched.summary || matched.payload?.summary || matched.label,
        memoryType: matched.payload?.memoryType || 'weakness',
        sourceActionId: matched.id,
      });
    }
    matched.status = 'completed';
  }
}

async function callLearnTurn(options, state, text) {
  const response = await fetch(`${options.baseUrl}/api/learn/turn`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-user-id': options.userId,
      'x-user-email': options.userEmail,
      'x-user-name': options.userName,
      ...(options.model.startsWith('openai:') ? { 'x-model': options.model } : {}),
    },
    body: JSON.stringify({
      question: text,
      recentMessages: state.messages.slice(-10).map((message) => ({
        role: message.role,
        text: message.text,
      })),
      courseId: options.courseId,
      courseName: options.courseName,
      courseCode: options.courseCode,
      hasSyllabus: state.calendarEvents.some((event) => event.origin === 'syllabus'),
      progressKnown: Boolean(state.learnerSnapshot.progressKnown),
      learnerSnapshot: state.learnerSnapshot,
      calendarEvents: state.calendarEvents,
      recentArtifacts: collectRecentArtifacts(state.messages),
      recentActions: collectPendingActions(state.messages),
      recentActivities: state.calendarEvents
        .filter((event) => event.origin === 'ai_plan')
        .slice(0, 8),
      recentPlans: [],
      sourceUploads: state.sourceUploads,
      layeredMemorySummary: state.memoryCandidates.map((item) => item.summary).join('\n'),
    }),
  });
  const body = await response.text();
  let json = null;
  try {
    json = body ? JSON.parse(body) : null;
  } catch {
    json = { rawText: body };
  }
  return { status: response.status, ok: response.ok, body: json };
}

async function runScenario(options, scenario) {
  const outPath = path.join(options.outDir, `${scenario.name}.jsonl`);
  const state = {
    messages: [],
    calendarEvents: [
      {
        id: 'fixture-syllabus-1',
        title: '1.1 - Approximating Areas',
        kind: 'progress',
        date: '2026-05-04',
        origin: 'syllabus',
      },
      {
        id: 'fixture-syllabus-2',
        title: '1.2 - The definite integral',
        kind: 'progress',
        date: '2026-05-06',
        origin: 'syllabus',
      },
      {
        id: 'fixture-syllabus-3',
        title: '2.1 - The FTC',
        kind: 'progress',
        date: '2026-05-11',
        origin: 'syllabus',
      },
      {
        id: 'fixture-syllabus-4',
        title: '2.4 - u-substitution',
        kind: 'progress',
        date: '2026-05-20',
        origin: 'syllabus',
      },
      {
        id: 'fixture-syllabus-5',
        title: '3.3 - Areas and volumes',
        kind: 'progress',
        date: '2026-06-03',
        origin: 'syllabus',
      },
      {
        id: 'fixture-syllabus-6',
        title: '3.7 - Improper integrals',
        kind: 'progress',
        date: '2026-06-10',
        origin: 'syllabus',
      },
      {
        id: 'fixture-syllabus-7',
        title: '5.1 - Sequences',
        kind: 'progress',
        date: '2026-07-06',
        origin: 'syllabus',
      },
      {
        id: 'fixture-syllabus-8',
        title: '5.1 continued',
        kind: 'progress',
        date: '2026-07-08',
        origin: 'syllabus',
      },
      {
        id: 'fixture-syllabus-9',
        title: 'Test 2',
        kind: 'exam',
        date: '2026-07-28',
        origin: 'syllabus',
      },
      ...scenario.initialCalendarEvents,
    ],
    memoryCandidates: [],
    learnerSnapshot: { progressKnown: false, weakConcepts: [], nextConcepts: [] },
    sourceUploads: [
      {
        id: 'fixture-source-sketchmol',
        title: 'Bochen Paper 2 Molecule Image MolecularGeneration',
        kind: 'pdf',
        topic: 'SketchMol benchmark tables',
        ragEntryIds: ['fixture-rag-1'],
      },
    ],
  };
  if (scenario.initialArtifacts.length) {
    state.messages.push({
      role: 'assistant',
      text: '已载入用于测试的学习活动上下文。',
      createdAt: Date.now(),
      artifacts: scenario.initialArtifacts,
    });
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, '');

  const write = (record) => {
    fs.appendFileSync(outPath, `${JSON.stringify(record)}\n`);
  };

  write({
    type: 'scenario_start',
    scenario: scenario.name,
    filePath: path.relative(ROOT, scenario.filePath),
    runApi: options.runApi,
    createdAt: new Date().toISOString(),
  });

  for (const [index, step] of scenario.steps.entries()) {
    const before = stableRecord({
      calendarEvents: state.calendarEvents,
      memoryCandidates: state.memoryCandidates,
      pendingActions: collectPendingActions(state.messages),
      artifacts: collectRecentArtifacts(state.messages),
    });

    if (step.kind === 'new_conversation') {
      write({
        type: 'step',
        index,
        step,
        before,
        after: stableRecord(before),
        note: 'visible messages cleared',
      });
      state.messages = [];
      continue;
    }

    if (step.kind === 'snapshot') {
      write({
        type: 'step',
        index,
        step,
        before,
        snapshot: stableRecord({
          calendarEvents: state.calendarEvents,
          memoryCandidates: state.memoryCandidates,
          messages: state.messages,
        }),
      });
      continue;
    }

    if (step.kind === 'ui') {
      applySimulatedUiStep(state, step);
      if (step.sendText) {
        state.messages.push({ role: 'user', text: step.sendText, createdAt: Date.now() });
      }
      write({
        type: 'step',
        index,
        step,
        before,
        after: stableRecord({
          calendarEvents: state.calendarEvents,
          memoryCandidates: state.memoryCandidates,
          pendingActions: collectPendingActions(state.messages),
        }),
      });
      continue;
    }

    state.messages.push({ role: 'user', text: step.text, createdAt: Date.now() });
    const apiResult = options.runApi ? await callLearnTurn(options, state, step.text) : null;
    if (apiResult?.body) {
      state.messages.push({
        role: 'assistant',
        text: apiResult.body.replyText || '',
        createdAt: Date.now(),
        learningActions: [
          ...(apiResult.body.proposals || []),
          ...(apiResult.body.directCalls || []),
        ],
        artifacts: apiResult.body.artifacts || [],
      });
    }
    write({
      type: 'step',
      index,
      step,
      before,
      apiResult,
      after: stableRecord({
        calendarEvents: state.calendarEvents,
        memoryCandidates: state.memoryCandidates,
        pendingActions: collectPendingActions(state.messages),
        artifacts: collectRecentArtifacts(state.messages),
      }),
    });
  }

  write({ type: 'scenario_end', scenario: scenario.name, endedAt: new Date().toISOString() });
  return outPath;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.outDir, { recursive: true });
  const scenarios = options.scenarioFiles.map(readScenario);
  const outputs = [];
  for (const scenario of scenarios) {
    outputs.push(await runScenario(options, scenario));
  }
  const summary = {
    runApi: options.runApi,
    baseUrl: options.baseUrl,
    model: options.model,
    scenarioCount: scenarios.length,
    outputs: outputs.map((item) => path.relative(ROOT, item)),
  };
  fs.writeFileSync(
    path.join(options.outDir, 'summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
