#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';

const ROOT = process.cwd();
const DEFAULT_OUT_ROOT = path.join(ROOT, 'tmp', 'learn-core-contract-checks');

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function parseArgs(argv) {
  const options = { outDir: '' };
  for (const arg of argv) {
    if (arg === '--') continue;
    if (arg.startsWith('--out=')) {
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
  pnpm test:learn-core-contracts
  pnpm test:learn-core-contracts -- --out=tmp/learn-core-contract-checks/current

Directly exercises the AI-first learn-core decision chain without HTTP or LLM
calls. Checks hook emission, trace invariants, tool contracts, handoff packets,
structured actions, and that missing AI routing fails loudly instead of using a
hardcoded route.
`);
}

function installTypeScriptRequireHook() {
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = function transpileTs(module, filename) {
    const source = fs.readFileSync(filename, 'utf8');
    const output = ts.transpileModule(source, {
      fileName: filename,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        moduleResolution: ts.ModuleResolutionKind.Node10,
        jsx: ts.JsxEmit.ReactJSX,
      },
    });
    module._compile(output.outputText, filename);
  };
  return { require, restore: () => (require.extensions['.ts'] = previous) };
}

function calendarFixture() {
  return [
    {
      id: 'contract-syllabus-1',
      title: '1.1 - Approximating Areas',
      kind: 'progress',
      date: '2026-05-04',
      origin: 'syllabus',
    },
    {
      id: 'contract-syllabus-2',
      title: '3.7 - Improper integrals',
      kind: 'progress',
      date: '2026-06-10',
      origin: 'syllabus',
    },
  ];
}

function baseInput(question, overrides = {}) {
  return {
    question,
    recentMessages: [],
    courseId: 'mat136-local-fixture',
    courseName: 'Calculus II',
    courseCode: 'MAT 136',
    hasSyllabus: true,
    progressKnown: false,
    learnerSnapshot: { progressKnown: false, weakConcepts: [], nextConcepts: [] },
    calendarEvents: calendarFixture(),
    recentPlans: [],
    recentArtifacts: [],
    recentActions: [],
    recentActivities: [],
    problemBank: { available: false, activeCount: 0, samples: [] },
    sourceUploads: [],
    layeredMemorySummary: '',
    ...overrides,
  };
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function actionKinds(decision, key) {
  return asArray(decision?.[key])
    .map((action) => (action && typeof action === 'object' ? action.kind : null))
    .filter(Boolean);
}

function artifactKinds(decision) {
  return asArray(decision?.artifacts)
    .map((artifact) => (artifact && typeof artifact === 'object' ? artifact.kind : null))
    .filter(Boolean);
}

function traceToolIds(decision) {
  return asArray(decision?.trace?.toolCalls)
    .map((call) => (call && typeof call === 'object' ? call.toolId : null))
    .filter(Boolean);
}

function traceSelectedToolIds(decision) {
  const selected = [];
  for (const call of asArray(decision?.trace?.toolCalls)) {
    selected.push(...asArray(call?.metadata?.selectedToolIds));
  }
  return selected.filter(Boolean);
}

function reviewModeFollowups(decision) {
  const followups = [];
  for (const action of asArray(decision?.proposals)) {
    if (action?.kind !== 'review_mode.request_choice') continue;
    for (const option of asArray(action?.payload?.options)) {
      if (option?.followupText) followups.push(String(option.followupText));
    }
  }
  return followups;
}

function traceStepKinds(decision) {
  return asArray(decision?.trace?.steps)
    .map((step) => (step && typeof step === 'object' ? step.kind : null))
    .filter(Boolean);
}

function traceHandoffTargets(decision) {
  return asArray(decision?.trace?.handoffs)
    .map((handoff) => (handoff && typeof handoff === 'object' ? handoff.to : null))
    .filter(Boolean);
}

function hasAll(actual, expected) {
  const set = new Set(actual);
  return asArray(expected).every((item) => set.has(item));
}

function hasNone(actual, forbidden) {
  const set = new Set(actual);
  return asArray(forbidden).every((item) => !set.has(item));
}

function collectEvidenceIds(trace) {
  const ids = new Set();
  for (const step of asArray(trace?.steps)) {
    for (const item of asArray(step?.evidence)) {
      if (item?.id) ids.add(item.id);
    }
  }
  for (const handoff of asArray(trace?.handoffs)) {
    for (const item of asArray(handoff?.evidence)) {
      if (item?.id) ids.add(item.id);
    }
  }
  return ids;
}

const REQUIRED_CONFIRMATION_ACTIONS = new Set([
  'calendar.propose_add',
  'calendar.propose_update',
  'calendar.propose_delete',
  'memory.propose_write',
  'review_mode.request_choice',
  'practice.propose_generation',
  'classroom.propose_temporary_explanation',
  'image.propose_generation',
]);

function routeOutput(overrides = {}) {
  return {
    answerMode: 'course_answer',
    replyText: '',
    planningDecision: null,
    directCalls: [],
    proposals: [],
    artifacts: [],
    selectedToolIds: ['semantic_router'],
    handoff: null,
    reason: 'AI semantic router fixture decision.',
    confidence: 0.9,
    ...overrides,
  };
}

function answerHandoff(reasonSummary, requiredBehavior = []) {
  return {
    reasonSummary,
    requiredBehavior: requiredBehavior.length
      ? requiredBehavior
      : ['Answer with course evidence and state any missing personalization evidence.'],
    forbiddenBehavior: ['Do not claim calendar, memory, or generation writes happened.'],
    missingEvidence: [],
  };
}

function explicitTopicPlan(topic) {
  return {
    intent: 'review_plan',
    practiceMode: null,
    scopeHint: 'explicit_topic',
    scopeResolution: {
      contentScope: {
        label: topic,
        kind: 'explicit_topic',
        basis: 'user_explicit',
        eventIds: [],
        startDate: '',
        endDate: '',
        rationale: 'The learner explicitly named the review topic.',
        confidence: 0.96,
      },
      executionWindow: {
        startDate: '2026-06-28',
        days: 1,
        minutesPerDay: 45,
        rationale: 'Draft a useful immediate review activity.',
      },
      needsClarification: false,
      clarificationQuestion: '',
    },
    isFollowUpToPlan: false,
    shouldAskProgressFirst: false,
    useSyllabusAsDefaultScope: false,
    resolvedPrompt: `安排一次 ${topic} 复习`,
    focusTopics: [topic],
    constraintsSummary: `显式复习主题：${topic}`,
    reason: 'Explicit topic review can be planned without progress confirmation.',
    confidence: 0.94,
  };
}

function validateDecision({ id, decision, events, expect, getLearnCoreTool }) {
  const failures = [];
  const trace = decision.trace || {};
  const toolIds = traceToolIds(decision);
  const selectedToolIds = traceSelectedToolIds(decision);
  const stepKinds = traceStepKinds(decision);
  const handoffTargets = traceHandoffTargets(decision);

  if (decision.answerMode !== expect.answerMode) {
    failures.push(`expected answerMode ${expect.answerMode}, got ${decision.answerMode}`);
  }
  if (!trace.runId || !trace.startedAt || !trace.endedAt) {
    failures.push('trace must include runId, startedAt, and endedAt');
  }
  if (!events.length || events[0].type !== 'turn_start') {
    failures.push('first hook event must be turn_start');
  }
  if (!events.length || events[events.length - 1].type !== 'turn_end') {
    failures.push('last hook event must be turn_end');
  }
  const startContext = events.find((event) => event.type === 'turn_start')?.context;
  if (!startContext?.currentDate) failures.push('turn_start hook must include run context date');
  if (!hasAll(asArray(startContext?.enabledToolIds), ['semantic_router'])) {
    failures.push('enabled tool ids must include semantic_router');
  }

  if (!hasAll(toolIds, expect.toolsInclude)) {
    failures.push(
      `missing trace tools ${JSON.stringify(expect.toolsInclude)}, got ${JSON.stringify(toolIds)}`,
    );
  }
  if (!hasNone(toolIds, ['legacy_semantic_planner'])) {
    failures.push('trace must not include legacy_semantic_planner');
  }
  if (!hasAll(selectedToolIds, expect.selectedToolsInclude)) {
    failures.push(
      `missing selected tools ${JSON.stringify(expect.selectedToolsInclude)}, got ${JSON.stringify(selectedToolIds)}`,
    );
  }
  if (!hasAll(stepKinds, expect.stepsInclude)) {
    failures.push(
      `missing trace steps ${JSON.stringify(expect.stepsInclude)}, got ${JSON.stringify(stepKinds)}`,
    );
  }
  if (!hasNone(stepKinds, ['fallback'])) failures.push('trace must not include fallback step');
  if (!hasAll(handoffTargets, expect.handoffsTo)) {
    failures.push(
      `missing handoff targets ${JSON.stringify(expect.handoffsTo)}, got ${JSON.stringify(handoffTargets)}`,
    );
  }
  const handoffRequiredBehaviorText = asArray(trace.handoffs)
    .flatMap((handoff) => asArray(handoff?.requiredBehavior))
    .map((item) => String(item || ''))
    .join('\n');
  for (const requiredHandoffText of asArray(expect.handoffRequiredBehaviorIncludes)) {
    if (!handoffRequiredBehaviorText.includes(requiredHandoffText)) {
      failures.push(`handoff requiredBehavior must include ${requiredHandoffText}`);
    }
  }
  if (!hasAll(actionKinds(decision, 'directCalls'), expect.directCallsInclude)) {
    failures.push(
      `missing direct calls ${JSON.stringify(expect.directCallsInclude)}, got ${JSON.stringify(actionKinds(decision, 'directCalls'))}`,
    );
  }
  if (!hasAll(actionKinds(decision, 'proposals'), expect.proposalsInclude)) {
    failures.push(
      `missing proposals ${JSON.stringify(expect.proposalsInclude)}, got ${JSON.stringify(actionKinds(decision, 'proposals'))}`,
    );
  }
  if (!hasAll(artifactKinds(decision), expect.artifactsInclude)) {
    failures.push(
      `missing artifacts ${JSON.stringify(expect.artifactsInclude)}, got ${JSON.stringify(artifactKinds(decision))}`,
    );
  }
  if (!hasNone(artifactKinds(decision), expect.artifactsExclude)) {
    failures.push(
      `forbidden artifacts ${JSON.stringify(expect.artifactsExclude)}, got ${JSON.stringify(artifactKinds(decision))}`,
    );
  }
  if (expect.planningIntent && decision.planningDecision?.intent !== expect.planningIntent) {
    failures.push(
      `expected planning intent ${expect.planningIntent}, got ${decision.planningDecision?.intent}`,
    );
  }
  if (expect.scopeHint && decision.planningDecision?.scopeHint !== expect.scopeHint) {
    failures.push(
      `expected planning scopeHint ${expect.scopeHint}, got ${decision.planningDecision?.scopeHint}`,
    );
  }
  if (
    expect.resolvedPrompt &&
    String(decision.planningDecision?.resolvedPrompt || '') !== expect.resolvedPrompt
  ) {
    failures.push(
      `expected resolvedPrompt ${expect.resolvedPrompt}, got ${decision.planningDecision?.resolvedPrompt}`,
    );
  }
  if (
    expect.shouldAskProgressFirst != null &&
    decision.planningDecision?.shouldAskProgressFirst !== expect.shouldAskProgressFirst
  ) {
    failures.push(
      `expected shouldAskProgressFirst ${expect.shouldAskProgressFirst}, got ${decision.planningDecision?.shouldAskProgressFirst}`,
    );
  }
  if (!hasAll(asArray(decision.planningDecision?.focusTopics), expect.focusTopicsInclude)) {
    failures.push(
      `missing focus topics ${JSON.stringify(expect.focusTopicsInclude)}, got ${JSON.stringify(asArray(decision.planningDecision?.focusTopics))}`,
    );
  }
  if (expect.problemBankSearchMatchIdsInclude?.length) {
    const matchIds = asArray(decision.planningDecision?.problemBankSearch?.matches).map((match) =>
      String(match?.problemId || ''),
    );
    if (!hasAll(matchIds, expect.problemBankSearchMatchIdsInclude)) {
      failures.push(
        `missing problem bank search matches ${JSON.stringify(expect.problemBankSearchMatchIdsInclude)}, got ${JSON.stringify(matchIds)}`,
      );
    }
  }
  if (expect.problemBankSearchExcludedTitlesInclude?.length) {
    const excludedTitles = asArray(decision.planningDecision?.problemBankSearch?.excluded).map(
      (candidate) => String(candidate?.title || ''),
    );
    if (!hasAll(excludedTitles, expect.problemBankSearchExcludedTitlesInclude)) {
      failures.push(
        `missing problem bank excluded candidates ${JSON.stringify(expect.problemBankSearchExcludedTitlesInclude)}, got ${JSON.stringify(excludedTitles)}`,
      );
    }
  }
  if (expect.practiceGenerationSource) {
    const practiceGenerationActions = [
      ...asArray(decision.proposals),
      ...asArray(decision.directCalls),
    ].filter((action) => action?.kind === 'practice.propose_generation');
    const sources = practiceGenerationActions.map((action) =>
      String(action?.payload?.source || ''),
    );
    if (!sources.includes(expect.practiceGenerationSource)) {
      failures.push(
        `expected practice generation source ${expect.practiceGenerationSource}, got ${JSON.stringify(sources)}`,
      );
    }
  }
  if (expect.practiceGenerationPersistToProblemBank != null) {
    const practiceGenerationActions = [
      ...asArray(decision.proposals),
      ...asArray(decision.directCalls),
    ].filter((action) => action?.kind === 'practice.propose_generation');
    const hasPersist = practiceGenerationActions.some(
      (action) =>
        action?.payload?.persistToProblemBank === expect.practiceGenerationPersistToProblemBank,
    );
    if (!hasPersist) {
      failures.push(
        `expected practice generation persistToProblemBank ${expect.practiceGenerationPersistToProblemBank}`,
      );
    }
  }
  if (!hasAll(reviewModeFollowups(decision), expect.reviewModeFollowupsInclude)) {
    failures.push(
      `missing review mode followups ${JSON.stringify(expect.reviewModeFollowupsInclude)}, got ${JSON.stringify(reviewModeFollowups(decision))}`,
    );
  }

  const evidenceIds = collectEvidenceIds(trace);
  for (const tool of asArray(trace.toolCalls)) {
    if (!getLearnCoreTool(tool.toolId)) failures.push(`tool ${tool.toolId} has no contract`);
    if (tool.status === 'started') failures.push(`tool ${tool.toolId} did not finish`);
    if (!tool.endedAt) failures.push(`tool ${tool.toolId} is missing endedAt`);
    for (const evidenceId of asArray(tool.evidenceIds)) {
      if (!evidenceIds.has(evidenceId)) {
        failures.push(`tool ${tool.toolId} references unknown evidence ${evidenceId}`);
      }
    }
  }

  const toolStartCount = events.filter((event) => event.type === 'tool_start').length;
  const toolEndCount = events.filter((event) => event.type === 'tool_end').length;
  if (toolStartCount !== asArray(trace.toolCalls).length) {
    failures.push(`tool_start hook count ${toolStartCount} does not match trace tool count`);
  }
  if (toolEndCount !== asArray(trace.toolCalls).length) {
    failures.push(`tool_end hook count ${toolEndCount} does not match trace tool count`);
  }
  const handoffHookCount = events.filter((event) => event.type === 'handoff').length;
  if (handoffHookCount !== asArray(trace.handoffs).length) {
    failures.push(`handoff hook count ${handoffHookCount} does not match trace handoff count`);
  }
  for (const handoff of asArray(trace.handoffs)) {
    if (!handoff.reasonSummary || !handoff.to || !handoff.from) {
      failures.push('handoff must include from, to, and reasonSummary');
    }
    if (!asArray(handoff.requiredBehavior).length) {
      failures.push('handoff must include requiredBehavior');
    }
  }

  for (const action of [...asArray(decision.proposals), ...asArray(decision.directCalls)]) {
    if (REQUIRED_CONFIRMATION_ACTIONS.has(action.kind) && action.confirmation !== 'required') {
      failures.push(`${action.kind} must require confirmation`);
    }
    if (!REQUIRED_CONFIRMATION_ACTIONS.has(action.kind) && action.confirmation === 'required') {
      failures.push(`${action.kind} should not require confirmation`);
    }
  }

  return {
    id,
    failures,
    decision: {
      answerMode: decision.answerMode,
      reason: decision.reason,
      directCalls: actionKinds(decision, 'directCalls'),
      proposals: actionKinds(decision, 'proposals'),
      artifacts: artifactKinds(decision),
      planningDecision: decision.planningDecision || null,
      tools: toolIds,
      selectedTools: selectedToolIds,
      steps: stepKinds,
      handoffs: handoffTargets,
    },
    hookTypes: events.map((event) => event.type),
  };
}

async function validateMissingRouterFailure(decideTeachingTurn) {
  const events = [];
  try {
    await decideTeachingTurn(baseInput('我有点迷茫，先陪我把这门课下一步想清楚。'), {
      runId: 'contract-ai-router-required',
      currentDate: '2026-06-28',
      hooks: {
        emit(event) {
          events.push(JSON.parse(JSON.stringify(event)));
        },
      },
    });
    return { id: 'ai-router-required', failures: ['expected missing semantic router to fail'] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failures = [];
    if (!/AI semantic router/.test(message)) {
      failures.push(`expected AI semantic router error, got ${message}`);
    }
    if (!events.some((event) => event.type === 'validation_error')) {
      failures.push('missing router failure must emit validation_error');
    }
    if (events.some((event) => event.type === 'turn_end')) {
      failures.push('missing router failure must not emit turn_end');
    }
    return {
      id: 'ai-router-required',
      failures,
      error: message,
      hookTypes: events.map((event) => event.type),
    };
  }
}

async function validateShallowReviewPlanFailure(
  decideTeachingTurn,
  learnSemanticRouterOutputSchema,
) {
  const events = [];
  try {
    await decideTeachingTurn(
      baseInput('我想讲解和练题都有：我需要复习 linked list', {
        courseId: 'csc148-local-fixture',
        courseName: 'Introduction to Computer Science',
        courseCode: 'CSC 148',
      }),
      {
        runId: 'contract-shallow-review-plan-rejected',
        currentDate: '2026-06-28',
        hooks: {
          emit(event) {
            events.push(JSON.parse(JSON.stringify(event)));
          },
        },
        semanticRouter: async () =>
          learnSemanticRouterOutputSchema.parse(
            routeOutput({
              answerMode: 'client_activity_plan',
              replyText: '我先给你安排一个复习计划。',
              planningDecision: explicitTopicPlan('linked list'),
              selectedToolIds: ['semantic_router', 'plan_review'],
              artifacts: [
                {
                  kind: 'review_plan',
                  id: 'shallow-review-plan',
                  title: 'Linked list 复习计划',
                  tasks: [
                    {
                      title: '回顾 linked list 的核心结构与术语',
                      concepts: ['linked list'],
                      minutes: 15,
                    },
                  ],
                },
              ],
              reason: 'Fixture intentionally omits review-session content.',
            }),
          ),
      },
    );
    return {
      id: 'shallow-review-plan-rejected',
      failures: ['expected shallow review_plan to fail validation'],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const validationError = events.find((event) => event.type === 'validation_error');
    const validationMetadataError = String(validationError?.metadata?.error || '');
    const failures = [];
    if (
      !/AI semantic router failed to produce a valid decision/.test(message) ||
      !/review_plan must include learningGoal/.test(validationMetadataError)
    ) {
      failures.push(
        `expected review_plan quality error, got message=${message}, metadata=${validationMetadataError}`,
      );
    }
    if (!validationError) {
      failures.push('shallow review_plan failure must emit validation_error');
    }
    if (events.some((event) => event.type === 'turn_end')) {
      failures.push('shallow review_plan failure must not emit turn_end');
    }
    return {
      id: 'shallow-review-plan-rejected',
      failures,
      error: message,
      hookTypes: events.map((event) => event.type),
    };
  }
}

async function validateMissingReviewPlanArtifactFailure(
  decideTeachingTurn,
  learnSemanticRouterOutputSchema,
) {
  const events = [];
  try {
    await decideTeachingTurn(
      baseInput('我想讲解和练题都有：我需要复习 linked list', {
        courseId: 'csc148-local-fixture',
        courseName: 'Introduction to Computer Science',
        courseCode: 'CSC 148',
      }),
      {
        runId: 'contract-review-plan-intent-requires-artifact',
        currentDate: '2026-06-28',
        hooks: {
          emit(event) {
            events.push(JSON.parse(JSON.stringify(event)));
          },
        },
        semanticRouter: async () =>
          learnSemanticRouterOutputSchema.parse(
            routeOutput({
              answerMode: 'none',
              replyText: '',
              planningDecision: explicitTopicPlan('linked list'),
              selectedToolIds: ['semantic_router', 'plan_review'],
              artifacts: [],
              reason: 'Fixture intentionally returns a half-built planning decision.',
            }),
          ),
      },
    );
    return {
      id: 'review-plan-intent-requires-artifact',
      failures: ['expected review_plan intent without artifact to fail validation'],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const validationError = events.find((event) => event.type === 'validation_error');
    const validationMetadataError = String(validationError?.metadata?.error || '');
    const failures = [];
    if (
      !/AI semantic router failed to produce a valid decision/.test(message) ||
      !/review_plan must include a displayable plan artifact/.test(validationMetadataError)
    ) {
      failures.push(
        `expected missing review_plan artifact error, got message=${message}, metadata=${validationMetadataError}`,
      );
    }
    if (!validationError) {
      failures.push('missing review_plan artifact failure must emit validation_error');
    }
    if (events.some((event) => event.type === 'turn_end')) {
      failures.push('missing review_plan artifact failure must not emit turn_end');
    }
    return {
      id: 'review-plan-intent-requires-artifact',
      failures,
      error: message,
      hookTypes: events.map((event) => event.type),
    };
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { require, restore } = installTypeScriptRequireHook();
  const { decideTeachingTurn } = require(
    path.join(ROOT, 'features', 'learn-core', 'server', 'decision-chain.ts'),
  );
  const { LEARN_CORE_TOOL_CONTRACTS, getLearnCoreTool } = require(
    path.join(ROOT, 'features', 'learn-core', 'server', 'tool-registry.ts'),
  );
  const { learnSemanticRouterOutputSchema } = require(
    path.join(ROOT, 'features', 'learn-core', 'server', 'semantic-router.ts'),
  );

  const contractFailures = [];
  const contractIds = LEARN_CORE_TOOL_CONTRACTS.map((tool) => tool.id);
  const uniqueContractIds = new Set(contractIds);
  if (uniqueContractIds.size !== contractIds.length) {
    contractFailures.push('tool contract ids must be unique');
  }
  if (!contractIds.includes('semantic_router')) {
    contractFailures.push('tool contracts must include semantic_router');
  }
  if (contractIds.includes('legacy_semantic_planner')) {
    contractFailures.push('tool contracts must not include legacy_semantic_planner');
  }
  const semanticRouterContract = getLearnCoreTool('semantic_router');
  if (!semanticRouterContract?.sideEffects?.includes('llm')) {
    contractFailures.push('semantic_router contract must declare llm side effect');
  }
  if (!semanticRouterContract?.writesTo?.includes('decision')) {
    contractFailures.push('semantic_router contract must write a decision');
  }

  const learnCoreIndexSource = fs.readFileSync(
    path.join(ROOT, 'features', 'learn-core', 'index.ts'),
    'utf8',
  );
  if (/legacy-/.test(learnCoreIndexSource)) {
    contractFailures.push('features/learn-core/index.ts must not export legacy planner modules');
  }

  const decisionChainSource = fs.readFileSync(
    path.join(ROOT, 'features', 'learn-core', 'server', 'decision-chain.ts'),
    'utf8',
  );
  for (const forbiddenDecisionChainSource of [
    './pipeline',
    'runLearnDecisionPipeline',
    'semanticPlanner',
    'legacy_semantic_planner',
    'Defaulted to course answer',
    'tracedHandoffToAnswerer',
    "kind: 'fallback'",
  ]) {
    if (decisionChainSource.includes(forbiddenDecisionChainSource)) {
      contractFailures.push(
        `decision-chain must be AI-first and not include ${forbiddenDecisionChainSource}`,
      );
    }
  }
  if (!decisionChainSource.includes('AI semantic router is not configured')) {
    contractFailures.push('decision-chain must fail loudly when semantic router is unavailable');
  }
  if (!decisionChainSource.includes('validateSemanticRouterOutput')) {
    contractFailures.push('decision-chain must validate AI router output before continuing');
  }

  const semanticRouterSource = fs.readFileSync(
    path.join(ROOT, 'features', 'learn-core', 'server', 'semantic-router.ts'),
    'utf8',
  );
  const fixedWorkflowSource = fs.readFileSync(
    path.join(ROOT, 'features', 'teaching-orchestrator', 'domain', 'fixed-workflows.ts'),
    'utf8',
  );
  for (const requiredSemanticRouterContract of [
    'learnSemanticRouterOutputSchema',
    'handoff',
    'selectedToolIds',
    'explicit topic to review',
    'Explanation-only concept review is a course_answer handoff',
    'shouldAskProgressFirst=false',
    'Do not use keyword-only routing',
    'learningGoal',
    'focusPoints',
    'selfChecks',
    'walk through the example before code',
    'teachingWorkflowPromptSections',
    'Fixed review workflows',
    'Fixed memory extraction workflows',
  ]) {
    if (
      !semanticRouterSource.includes(requiredSemanticRouterContract) &&
      !fixedWorkflowSource.includes(requiredSemanticRouterContract)
    ) {
      contractFailures.push(`semantic-router must include ${requiredSemanticRouterContract}`);
    }
  }
  if (/minimal concept-review artifact is enough/.test(semanticRouterSource)) {
    contractFailures.push('semantic-router must not accept shallow review artifacts');
  }

  const toolRegistrySource = fs.readFileSync(
    path.join(ROOT, 'features', 'learn-core', 'server', 'tool-registry.ts'),
    'utf8',
  );
  if (/isLegacySemanticPlannerEnabled|legacy_semantic_planner/.test(toolRegistrySource)) {
    contractFailures.push('tool-registry must not expose legacy semantic planner switches');
  }

  const semanticRouterRuntimeSource = fs.readFileSync(
    path.join(ROOT, 'features', 'learn-core', 'server', 'semantic-router-runtime.ts'),
    'utf8',
  );
  if (!/generateObject/.test(semanticRouterRuntimeSource)) {
    contractFailures.push('semantic-router-runtime must use schema-native generateObject');
  }
  if (/generateText/.test(semanticRouterRuntimeSource)) {
    contractFailures.push('semantic-router-runtime must not parse freeform generateText output');
  }

  const routeFiles = [
    'app/api/learn/turn/route.ts',
    'app/api/learn/action-planner/route.ts',
    'app/api/learn/planning-intent/route.ts',
  ];
  for (const routeFile of routeFiles) {
    const source = fs.readFileSync(path.join(ROOT, routeFile), 'utf8');
    const topLevelImports = source
      .split('\n')
      .filter((line) => /^import\s/.test(line) || /^\s+\w*Legacy\w*/.test(line))
      .join('\n');
    if (/from 'ai'|from "ai"/.test(topLevelImports)) {
      contractFailures.push(`${routeFile} must not top-level import ai/generateText`);
    }
    if (/resolve-model/.test(topLevelImports)) {
      contractFailures.push(`${routeFile} must not top-level import resolveModelFromHeaders`);
    }
    if (/isLegacySemanticPlannerEnabled|legacy-semantic-planner|semanticPlanner/.test(source)) {
      contractFailures.push(`${routeFile} must use the AI semantic router, not legacy planners`);
    }
    if (!source.includes('createRequestSemanticRouter')) {
      contractFailures.push(`${routeFile} must use createRequestSemanticRouter`);
    }
  }

  const cases = [
    {
      id: 'explicit-topic-review-mode-choice',
      input: baseInput('我需要复习 linked list', {
        courseId: 'csc148-local-fixture',
        courseName: 'Introduction to Computer Science',
        courseCode: 'CSC 148',
        hasSyllabus: false,
        progressKnown: false,
        calendarEvents: [],
        problemBank: {
          available: true,
          activeCount: 2,
          samples: [
            { id: 'csc148-linked-list-1', title: 'Linked list recursion trace' },
            { id: 'csc148-linked-list-2', title: 'Linked list insert cases' },
          ],
        },
      }),
      routerOutput: routeOutput({
        answerMode: 'client_activity_plan',
        replyText:
          'This router output should not be used because the fixed workflow asks mode first.',
        planningDecision: explicitTopicPlan('linked list'),
        selectedToolIds: ['semantic_router', 'plan_review'],
        reason: 'Unused fixture.',
      }),
      expect: {
        answerMode: 'action_only',
        toolsInclude: ['resolve_fixed_review_workflow'],
        selectedToolsInclude: ['resolve_fixed_review_workflow'],
        stepsInclude: ['observe_input', 'select_evidence_plan'],
        proposalsInclude: ['review_mode.request_choice'],
        planningIntent: 'review_plan',
        scopeHint: 'explicit_topic',
        focusTopicsInclude: ['我需要复习 linked list'],
        reviewModeFollowupsInclude: [
          '我想听讲解：我需要复习 linked list',
          '我想练题目：我需要复习 linked list',
          '我想讲解和练题都有：我需要复习 linked list',
        ],
        shouldAskProgressFirst: false,
      },
    },
    {
      id: 'explicit-topic-explanation-review-handoff',
      input: baseInput('我想听讲解：我需要复习 linked list', {
        courseId: 'csc148-local-fixture',
        courseName: 'Introduction to Computer Science',
        courseCode: 'CSC 148',
        hasSyllabus: false,
        progressKnown: false,
        calendarEvents: [],
        problemBank: {
          available: true,
          activeCount: 2,
          samples: [
            { id: 'csc148-linked-list-1', title: 'Linked list recursion trace' },
            { id: 'csc148-linked-list-2', title: 'Linked list insert cases' },
          ],
        },
      }),
      routerOutput: routeOutput({
        answerMode: 'course_answer',
        selectedToolIds: [
          'semantic_router',
          'search_memory',
          'search_course_materials',
          'answer_course_question',
        ],
        planningDecision: {
          ...explicitTopicPlan('linked list'),
          intent: 'none',
          resolvedPrompt: '我想听讲解：我需要复习 linked list',
        },
        handoff: answerHandoff('The learner chose explanation-only concept review.', [
          'Teach linked list directly in chat instead of creating a review plan artifact.',
          'Use Chinese with this internal teaching rhythm: plain intuition -> concrete tiny walk-through -> main operation/state change -> likely confusion -> one short check question.',
          'For code or data-structure topics, walk through the example before code.',
          'Do not expose internal labels such as 核心心智模型 or 状态追踪.',
        ]),
        reason:
          'Explanation-only concept review should be handled by the course answerer, not by a review plan card.',
      }),
      expect: {
        answerMode: 'course_answer',
        selectedToolsInclude: [
          'search_memory',
          'search_course_materials',
          'answer_course_question',
        ],
        handoffsTo: ['course_answerer'],
        artifactsExclude: ['review_plan', 'activity_plan', 'calendar_draft'],
        scopeHint: 'explicit_topic',
        resolvedPrompt: '我想听讲解：我需要复习 linked list',
        focusTopicsInclude: ['linked list'],
        handoffRequiredBehaviorIncludes: [
          'walk through the example before code',
          'one short check question',
          'Do not expose internal labels',
        ],
        shouldAskProgressFirst: false,
      },
    },
    {
      id: 'explicit-topic-practice-request-uses-bank-selection',
      input: baseInput('我想练题目：我需要复习 truth table', {
        courseId: 'mat102-local-fixture',
        courseName: 'Mathematical Proofs',
        courseCode: 'MAT 102',
        hasSyllabus: false,
        progressKnown: false,
        problemBank: {
          available: true,
          activeCount: 3,
          samples: [
            { id: 'mat102-truth-table-1', title: 'Truth table for implication' },
            { id: 'mat102-truth-table-2', title: 'Logical equivalence by truth table' },
            { id: 'mat102-truth-table-3', title: 'Tautology and contradiction' },
          ],
        },
      }),
      routerOutput: () => {
        throw new Error('semantic router should not run for explicit bank-backed practice request');
      },
      searchProblemBank: async ({ query, requestedCount }) => {
        if (query !== 'truth table') {
          throw new Error(`expected cleaned truth table search query, got ${query}`);
        }
        return {
          query,
          requestedCount,
          source: 'problem_bank_full_text',
          strictTopic: 'truth_table',
          matches: [
            {
              problemId: 'mat102-truth-table-1',
              title: 'Truth table for implication',
              score: 92,
              reason: 'The problem asks for a truth table of a compound proposition.',
              excerpt: 'Construct a truth table for p -> q.',
              tags: ['truth table', 'propositional logic'],
              difficulty: 'basic',
              problemType: 'practice',
              attemptStatus: 'not_started',
            },
          ],
          excluded: [
            {
              problemId: 'mat102-quantifier-1',
              title: '"并非所有猫都是邪恶"的谓词公式表达',
              reason: 'Quantifier/predicate expression is not a truth-table exercise.',
              excerpt: 'Translate the sentence using predicates and quantifiers.',
            },
          ],
          rationale: ['Matched by full problem text, not only tags.'],
          gaps: [
            '严格命中「truth table / truth values」的题只有 1 道；没有为了凑数量混入相邻专题。',
          ],
          searchedAt: '2026-06-28T00:00:00.000Z',
        };
      },
      expect: {
        answerMode: 'client_practice_plan',
        toolsInclude: ['search_problem_bank'],
        selectedToolsInclude: ['search_problem_bank'],
        stepsInclude: ['observe_input', 'select_evidence_plan'],
        artifactsExclude: ['review_plan', 'activity_plan', 'calendar_draft'],
        planningIntent: 'practice_plan',
        scopeHint: 'explicit_topic',
        resolvedPrompt: '我想练题目：我需要复习 truth table',
        focusTopicsInclude: ['truth table'],
        problemBankSearchMatchIdsInclude: ['mat102-truth-table-1'],
        problemBankSearchExcludedTitlesInclude: ['"并非所有猫都是邪恶"的谓词公式表达'],
        shouldAskProgressFirst: false,
      },
    },
    {
      id: 'explicit-topic-practice-with-empty-bank-proposes-course-grounded-generation',
      input: baseInput('我想练题目：我需要复习 truth table', {
        courseId: 'mat102-local-fixture',
        courseName: 'Mathematical Proofs',
        courseCode: 'MAT 102',
        hasSyllabus: false,
        progressKnown: false,
        problemBank: {
          available: false,
          activeCount: 0,
          samples: [],
        },
      }),
      routerOutput: () => {
        throw new Error('semantic router should not run when explicit practice has an empty bank');
      },
      expect: {
        answerMode: 'action_only',
        toolsInclude: ['propose_practice_generation'],
        selectedToolsInclude: ['propose_practice_generation'],
        stepsInclude: ['observe_input', 'select_evidence_plan'],
        proposalsInclude: ['practice.propose_generation'],
        artifactsExclude: ['review_plan', 'activity_plan', 'calendar_draft'],
        planningIntent: 'practice_plan',
        scopeHint: 'explicit_topic',
        resolvedPrompt: '我想练题目：我需要复习 truth table',
        focusTopicsInclude: ['truth table'],
        practiceGenerationSource: 'generated_from_course',
        practiceGenerationPersistToProblemBank: true,
        shouldAskProgressFirst: false,
      },
    },
    {
      id: 'semantic-practice-plan-executes-problem-bank-search',
      input: baseInput('出一组能检查我是否会 truth table 的题', {
        courseId: 'mat102-local-fixture',
        courseName: 'Mathematical Proofs',
        courseCode: 'MAT 102',
        hasSyllabus: false,
        progressKnown: false,
        problemBank: {
          available: true,
          activeCount: 4,
          samples: [
            { id: 'mat102-truth-table-1', title: 'Truth table for implication' },
            { id: 'mat102-truth-table-2', title: 'Truth values of logical statements' },
            { id: 'mat102-quantifier-1', title: '"并非所有猫都是邪恶"的谓词公式表达' },
          ],
        },
      }),
      routerOutput: routeOutput({
        answerMode: 'client_practice_plan',
        planningDecision: {
          ...explicitTopicPlan('truth table'),
          intent: 'practice_plan',
          practiceMode: 'practice',
          resolvedPrompt: '出一组能检查我是否会 truth table 的题',
          focusTopics: ['truth table'],
          constraintsSummary: 'Router selected a practice plan; question selection is unresolved.',
          reason: 'The learner asks for a truth table practice check.',
        },
        selectedToolIds: ['semantic_router'],
        reason: 'Route to client-side practice plan.',
      }),
      searchProblemBank: async ({ query, requestedCount }) => {
        if (query !== 'truth table') {
          throw new Error(`expected truth table search query, got ${query}`);
        }
        return {
          query,
          requestedCount,
          source: 'problem_bank_full_text',
          strictTopic: 'truth_table',
          matches: [
            {
              problemId: 'mat102-truth-table-1',
              title: 'Truth table for implication',
              score: 91,
              reason: 'The problem asks for a truth table of a compound proposition.',
              excerpt: 'Construct a truth table for p -> q and identify when it is false.',
              tags: ['truth table', 'propositional logic'],
              difficulty: 'basic',
              problemType: 'practice',
              attemptStatus: 'not_started',
            },
            {
              problemId: 'mat102-truth-table-2',
              title: 'Truth values of logical statements',
              score: 86,
              reason: 'The prompt asks for truth values of propositional statements.',
              excerpt: 'Evaluate truth values for compound logical statements.',
              tags: ['truth value', 'logic'],
              difficulty: 'medium',
              problemType: 'practice',
              attemptStatus: 'draft',
            },
          ],
          excluded: [
            {
              problemId: 'mat102-quantifier-1',
              title: '"并非所有猫都是邪恶"的谓词公式表达',
              reason:
                'Contains quantifier/predicate-formula signals rather than truth-table signals.',
              excerpt: 'Translate "not all cats are evil" using predicates and quantifiers.',
            },
          ],
          rationale: [
            'Matched by full problem text and grading metadata, not only visible tags.',
            'Quantifier-only candidates are excluded from a strict truth table set.',
          ],
          gaps: [
            '严格命中「truth table / truth values」的题只有 2 道；没有为了凑数量混入相邻专题。',
          ],
          searchedAt: '2026-06-28T00:00:00.000Z',
        };
      },
      expect: {
        answerMode: 'client_practice_plan',
        toolsInclude: ['semantic_router', 'search_problem_bank'],
        selectedToolsInclude: ['search_problem_bank'],
        stepsInclude: ['observe_input', 'model_routing', 'select_evidence_plan'],
        artifactsExclude: ['review_plan', 'activity_plan', 'calendar_draft'],
        planningIntent: 'practice_plan',
        scopeHint: 'explicit_topic',
        resolvedPrompt: '出一组能检查我是否会 truth table 的题',
        focusTopicsInclude: ['truth table'],
        problemBankSearchMatchIdsInclude: ['mat102-truth-table-1', 'mat102-truth-table-2'],
        problemBankSearchExcludedTitlesInclude: ['"并非所有猫都是邪恶"的谓词公式表达'],
        shouldAskProgressFirst: false,
      },
    },
    {
      id: 'explicit-topic-review-plan-after-mode-choice',
      input: baseInput('我想讲解和练题都有：我需要复习 linked list', {
        courseId: 'csc148-local-fixture',
        courseName: 'Introduction to Computer Science',
        courseCode: 'CSC 148',
        hasSyllabus: false,
        progressKnown: false,
        calendarEvents: [],
        problemBank: {
          available: true,
          activeCount: 2,
          samples: [
            { id: 'csc148-linked-list-1', title: 'Linked list recursion trace' },
            { id: 'csc148-linked-list-2', title: 'Linked list insert cases' },
          ],
        },
      }),
      routerOutput: routeOutput({
        answerMode: 'client_activity_plan',
        replyText: '可以，我会只按 linked list 做一次复习活动，不扩展到课程起始范围。',
        planningDecision: explicitTopicPlan('linked list'),
        selectedToolIds: ['semantic_router', 'plan_review', 'search_problem_bank'],
        artifacts: [
          {
            kind: 'review_plan',
            id: 'review-linked-list',
            title: 'Linked list 复习',
            learningGoal: '把 linked list 的节点关系、常见操作和边界情况复习到能马上做小题。',
            tasks: [
              {
                title: '用图复述 node、head、tail、next 指针如何组成链表',
                concepts: ['linked list'],
                minutes: 12,
                reason: 'Start from the structure before operations.',
              },
              {
                title: '比较头部插入、尾部插入、删除节点和遍历的复杂度',
                concepts: ['linked list', 'time complexity'],
                minutes: 15,
                reason: 'The learner explicitly asked for linked list review.',
              },
            ],
            focusPoints: [
              {
                title: 'Node reference model',
                explanation:
                  'A linked list stores sequence order through references between nodes rather than contiguous array indexes.',
                checkQuestion: '如果只有 head，为什么访问第 k 个节点通常要从头走过去？',
              },
              {
                title: 'Edge cases around insertion and deletion',
                explanation:
                  'Empty lists, one-node lists, head updates, and tail updates are where most implementation mistakes happen.',
                checkQuestion: '删除 head 和删除中间节点时，哪一个指针更新最容易漏掉？',
              },
            ],
            selfChecks: [
              {
                question: '为什么 singly linked list 头部插入通常是 O(1)？',
                expectedAnswer: '只需要创建新节点，让它指向旧 head，再把 head 更新成新节点。',
                concept: 'head insertion',
                difficulty: 'warmup',
              },
              {
                question: '如果没有 tail 指针，尾部插入为什么通常是 O(n)？',
                expectedAnswer:
                  '需要从 head 遍历到最后一个节点，才能把最后节点的 next 接上新节点。',
                concept: 'tail insertion',
                difficulty: 'core',
              },
            ],
            practiceBridge: {
              title: '接到题库练习',
              summary: '题库里已有 linked list 样例，可在概念自检后抽题。',
              problemIds: ['csc148-linked-list-1', 'csc148-linked-list-2'],
              generatedPrompts: [],
            },
            nextSteps: ['如果自检答错，回到节点图示；如果答对，进入题库练习。'],
          },
        ],
        reason: 'The learner explicitly asked to review linked list, so plan that topic directly.',
        confidence: 0.94,
      }),
      expect: {
        answerMode: 'client_activity_plan',
        selectedToolsInclude: ['plan_review', 'search_problem_bank'],
        planningIntent: 'review_plan',
        scopeHint: 'explicit_topic',
        focusTopicsInclude: ['linked list'],
        shouldAskProgressFirst: false,
      },
    },
    {
      id: 'review-mode-short-reply-uses-target',
      input: baseInput('练题目', {
        courseId: 'csc148-local-fixture',
        courseName: 'Introduction to Computer Science',
        courseCode: 'CSC 148',
        recentActions: [
          {
            id: 'learn-action-review-mode',
            kind: 'review_mode.request_choice',
            label: '选择复习方式',
            summary: '你这次更想听讲解、练题，还是两者都要？',
            status: 'proposed',
            confirmation: 'required',
            payload: {
              targetText: '我需要复习 linked list',
            },
          },
        ],
        problemBank: {
          available: true,
          activeCount: 2,
          samples: [
            { id: 'csc148-linked-list-1', title: 'Linked list recursion trace' },
            { id: 'csc148-linked-list-2', title: 'Linked list insert cases' },
          ],
        },
      }),
      routerOutput(ctx) {
        throw new Error(
          `semantic router should not run for short bank-backed practice reply; got ${ctx.input.question}`,
        );
      },
      expect: {
        answerMode: 'client_practice_plan',
        toolsInclude: ['search_problem_bank'],
        selectedToolsInclude: ['search_problem_bank'],
        stepsInclude: ['observe_input', 'select_evidence_plan'],
        artifactsExclude: ['review_plan', 'activity_plan', 'calendar_draft'],
        planningIntent: 'practice_plan',
        scopeHint: 'explicit_topic',
        resolvedPrompt: '我想练题目：我需要复习 linked list',
        focusTopicsInclude: ['linked list'],
        shouldAskProgressFirst: false,
      },
    },
    {
      id: 'review-mode-short-both-reply-uses-target',
      input: baseInput('都有', {
        courseId: 'csc148-local-fixture',
        courseName: 'Introduction to Computer Science',
        courseCode: 'CSC 148',
        recentActions: [
          {
            id: 'learn-action-review-mode',
            kind: 'review_mode.request_choice',
            label: '选择复习方式',
            summary: '你这次更想听讲解、练题，还是两者都要？',
            status: 'proposed',
            confirmation: 'required',
            payload: {
              targetText: '我需要复习 linked list',
            },
          },
        ],
        problemBank: {
          available: true,
          activeCount: 2,
          samples: [
            { id: 'csc148-linked-list-1', title: 'Linked list recursion trace' },
            { id: 'csc148-linked-list-2', title: 'Linked list insert cases' },
          ],
        },
      }),
      routerOutput(ctx) {
        const got = ctx.input.question;
        return routeOutput({
          answerMode: 'client_activity_plan',
          replyText:
            got === '我想讲解和练题都有：我需要复习 linked list'
              ? '可以，我按 linked list 安排讲解和练题。'
              : `bad rewrite: ${got}`,
          planningDecision: {
            ...explicitTopicPlan('linked list'),
            resolvedPrompt: got,
          },
          selectedToolIds: ['semantic_router', 'plan_review', 'search_problem_bank'],
          artifacts: [
            {
              kind: 'review_plan',
              id: 'review-linked-list-both',
              title: 'Linked list 讲解 + 练题',
              learningGoal: '先讲清 linked list 的节点关系和指针更新，再接到题库小题。',
              tasks: [
                {
                  title: '讲解 linked list 的节点结构、head/tail 和 next 指针',
                  concepts: ['linked list'],
                  minutes: 12,
                  reason: 'The learner chose explanation plus practice.',
                },
                {
                  title: '用题库小题检查插入、删除和遍历边界',
                  concepts: ['linked list', 'edge cases'],
                  minutes: 18,
                  reason: 'Practice should follow the explanation immediately.',
                  problemIds: ['csc148-linked-list-1', 'csc148-linked-list-2'],
                },
              ],
              focusPoints: [
                {
                  title: 'Reference chain',
                  explanation:
                    'Linked lists encode order by node references, not by contiguous indexes.',
                  checkQuestion: '为什么访问第 k 个节点通常要从 head 开始走？',
                },
                {
                  title: 'Pointer rewiring',
                  explanation:
                    'Insertion and deletion mainly test whether next references are updated in the right order.',
                  checkQuestion: '删除中间节点时，前一个节点的 next 应该指向哪里？',
                },
              ],
              selfChecks: [
                {
                  question: '头部插入为什么是 O(1)？',
                  expectedAnswer: '只改新节点的 next 和 head，不需要遍历整条链。',
                  concept: 'head insertion',
                  difficulty: 'warmup',
                },
                {
                  question: '没有 tail 时尾部插入为什么通常是 O(n)？',
                  expectedAnswer: '必须从 head 走到最后一个节点才能接上新节点。',
                  concept: 'tail insertion',
                  difficulty: 'core',
                },
              ],
              practiceBridge: {
                title: '题库练习',
                summary: '讲解后抽 linked list 题库题检查边界情况。',
                problemIds: ['csc148-linked-list-1', 'csc148-linked-list-2'],
                generatedPrompts: [],
              },
              nextSteps: ['先看两分钟结构图，再做题库题；答错再回到指针更新。'],
            },
          ],
          reason:
            got === '我想讲解和练题都有：我需要复习 linked list'
              ? 'Short both reply was resolved from recent action target.'
              : `Short both reply was not resolved, got ${got}`,
          confidence: got === '我想讲解和练题都有：我需要复习 linked list' ? 0.95 : 0.1,
        });
      },
      expect: {
        answerMode: 'client_activity_plan',
        selectedToolsInclude: ['plan_review', 'search_problem_bank'],
        artifactsInclude: ['review_plan'],
        planningIntent: 'review_plan',
        scopeHint: 'explicit_topic',
        resolvedPrompt: '我想讲解和练题都有：我需要复习 linked list',
        focusTopicsInclude: ['linked list'],
        shouldAskProgressFirst: false,
      },
    },
    {
      id: 'source-evidence-answer-handoff',
      input: baseInput('上传的 benchmark 表格里关键数字是什么？请按原文证据回答。', {
        sourceUploads: [
          {
            id: 'source-contract',
            title: 'Benchmark table',
            kind: 'pdf',
            ragEntryIds: ['rag-contract'],
          },
        ],
      }),
      routerOutput: routeOutput({
        answerMode: 'course_answer',
        selectedToolIds: ['semantic_router', 'search_course_materials', 'answer_course_question'],
        artifacts: [
          {
            kind: 'answer_evidence',
            query: 'benchmark 表格关键数字',
            requiredLookup: 'uploaded_source',
            mustCite: true,
          },
        ],
        handoff: answerHandoff('The learner requested uploaded-source numeric evidence.', [
          'Retrieve uploaded source passages before answering.',
          'Cite the exact table evidence or state that the source evidence is missing.',
        ]),
        reason: 'This is a source-grounded course answer, not a planner or calendar action.',
      }),
      expect: {
        answerMode: 'course_answer',
        selectedToolsInclude: ['search_course_materials', 'answer_course_question'],
        artifactsInclude: ['answer_evidence'],
        handoffsTo: ['course_answerer'],
      },
    },
    {
      id: 'external-current-lookup',
      input: baseInput('帮我查一下现在 Python 最新稳定版是什么。'),
      routerOutput: routeOutput({
        answerMode: 'action_only',
        directCalls: [
          {
            kind: 'web.search',
            label: 'Search current Python release',
            summary: 'Find the latest stable Python release from current external sources.',
            payload: { query: 'latest stable Python release' },
            confirmation: 'none',
          },
        ],
        selectedToolIds: ['semantic_router'],
        reason: 'The learner asked for current external information, so use read-only web search.',
      }),
      expect: {
        answerMode: 'action_only',
        directCallsInclude: ['web.search'],
      },
    },
    {
      id: 'calendar-update-proposal',
      input: baseInput('我今天只有 20 分钟，把原计划压缩一下；如果要改日历，请先让我确认。'),
      routerOutput: routeOutput({
        answerMode: 'action_only',
        proposals: [
          {
            kind: 'calendar.propose_update',
            label: 'Propose compressed calendar activity',
            summary: 'Draft a calendar update for confirmation before changing the schedule.',
            payload: { minutesAvailable: 20 },
            confirmation: 'required',
          },
        ],
        selectedToolIds: ['semantic_router', 'propose_calendar_change'],
        reason:
          'The learner requested a calendar-changing update and explicitly asked for confirmation.',
      }),
      expect: {
        answerMode: 'action_only',
        selectedToolsInclude: ['propose_calendar_change'],
        proposalsInclude: ['calendar.propose_update'],
      },
    },
    {
      id: 'memory-write-proposal',
      input: baseInput(
        '其实我不是完全不会 linked list，我只是分不清什么时候该改 next pointer。请先总结成可确认的薄弱点。',
      ),
      routerOutput: routeOutput({
        answerMode: 'action_only',
        proposals: [
          {
            kind: 'memory.propose_write',
            label: 'Propose linked-list weakness memory',
            summary: 'Record the refined weakness after learner confirmation.',
            payload: {
              memoryType: 'correction',
              weakness: 'Knows linked list basics but confuses next-pointer update timing.',
              nextTeachingMove: 'Contrast insertion/deletion pointer rewiring cases.',
            },
            confirmation: 'required',
          },
        ],
        selectedToolIds: ['semantic_router', 'propose_memory_write'],
        reason:
          'The learner corrected the teaching-control memory and asked for confirmation first.',
      }),
      expect: {
        answerMode: 'action_only',
        selectedToolsInclude: ['propose_memory_write'],
        proposalsInclude: ['memory.propose_write'],
      },
    },
    {
      id: 'ordinary-course-question',
      input: baseInput('我不懂 improper integral 为什么要转成 limit。'),
      routerOutput: routeOutput({
        answerMode: 'course_answer',
        selectedToolIds: ['semantic_router', 'search_course_materials', 'answer_course_question'],
        handoff: answerHandoff('The learner asked a normal course concept question.', [
          'Explain improper integrals using course notation and learner context.',
          'State any missing course-material evidence before using generic explanation.',
        ]),
        reason: 'This should be answered by the course answerer with course evidence.',
      }),
      expect: {
        answerMode: 'course_answer',
        selectedToolsInclude: ['search_course_materials', 'answer_course_question'],
        handoffsTo: ['course_answerer'],
      },
    },
  ];

  fs.mkdirSync(options.outDir, { recursive: true });
  const jsonlPath = path.join(options.outDir, 'results.jsonl');
  fs.writeFileSync(jsonlPath, '');

  const records = [];
  if (contractFailures.length) {
    records.push({ id: 'ai-router-contract-registry', failures: contractFailures });
  }
  records.push(await validateMissingRouterFailure(decideTeachingTurn));
  records.push(
    await validateShallowReviewPlanFailure(decideTeachingTurn, learnSemanticRouterOutputSchema),
  );
  records.push(
    await validateMissingReviewPlanArtifactFailure(
      decideTeachingTurn,
      learnSemanticRouterOutputSchema,
    ),
  );

  for (const item of cases) {
    const events = [];
    const decision = await decideTeachingTurn(item.input, {
      runId: `contract-${item.id}`,
      currentDate: '2026-06-28',
      hooks: {
        emit(event) {
          events.push(JSON.parse(JSON.stringify(event)));
        },
      },
      semanticRouter: async (ctx) =>
        learnSemanticRouterOutputSchema.parse(
          typeof item.routerOutput === 'function' ? item.routerOutput(ctx) : item.routerOutput,
        ),
      searchProblemBank: item.searchProblemBank,
    });
    records.push(
      validateDecision({
        id: item.id,
        decision,
        events,
        expect: {
          toolsInclude: ['semantic_router'],
          selectedToolsInclude: [],
          stepsInclude: ['observe_input', 'model_routing'],
          handoffsTo: [],
          directCallsInclude: [],
          proposalsInclude: [],
          artifactsInclude: [],
          focusTopicsInclude: [],
          ...item.expect,
        },
        getLearnCoreTool,
      }),
    );
  }

  for (const record of records) {
    fs.appendFileSync(jsonlPath, `${JSON.stringify(record)}\n`);
    console.log(
      `${record.id}: ${record.failures?.length ? `FAIL ${record.failures.join('; ')}` : 'ok'}`,
    );
  }

  const failureCount = records.filter((record) => record.failures?.length).length;
  const summary = {
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
  restore();
  if (failureCount > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
