import type {
  LearnHooks,
  LearnProblemBankSearchResult,
  LearnRunContext,
  LearnTurnDecision,
  LearnTurnInput,
} from '../domain/types';
import { resolveFixedReviewWorkflow } from '../../teaching-orchestrator/domain/fixed-workflows';
import { questionEvidence } from './evidence';
import { createLearnRunContext, snapshotLearnRunContext } from './run-context';
import { coerceLearnTurnDecisionOutput, createLearnTurnDecision } from './responses';
import {
  type LearnSemanticRouterOutput,
  handoffOutputToPacketArgs,
  selectedToolIdsForTrace,
} from './semantic-router';
import { learnProblemBankSearchResultSchema } from './schemas';
import { LearnTraceRecorder, compactTraceValue } from './tracing';

export type DecideTeachingTurnOptions = {
  hooks?: LearnHooks;
  runId?: string;
  currentDate?: string;
  semanticRouter?: (ctx: LearnRunContext) => Promise<LearnSemanticRouterOutput | null>;
  searchProblemBank?: (args: {
    courseId?: string;
    query: string;
    requestedCount: number;
  }) => Promise<LearnProblemBankSearchResult>;
};

async function emitValidationError(
  ctx: LearnRunContext,
  message: string,
  metadata?: Record<string, unknown>,
): Promise<never> {
  await ctx.hooks?.emit?.({ type: 'validation_error', message, metadata });
  throw new Error(message);
}

function nonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0;
}

function arrayLength(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function validateReviewPlanArtifact(artifact: Record<string, unknown>) {
  const hasLearningGoal = nonEmptyString(artifact.learningGoal);
  const focusPointCount = arrayLength(artifact.focusPoints);
  const selfCheckCount = arrayLength(artifact.selfChecks);

  if (!hasLearningGoal || focusPointCount < 2 || selfCheckCount < 2) {
    throw new Error(
      'AI semantic router review_plan must include learningGoal, at least two focusPoints, and at least two selfChecks.',
    );
  }
}

function isPlanArtifact(artifact: Record<string, unknown>) {
  if (artifact.kind === 'calendar_draft') {
    return Array.isArray(artifact.items) && artifact.items.length > 0;
  }
  if (artifact.kind === 'activity_plan' || artifact.kind === 'review_plan') {
    if (artifact.kind === 'review_plan') {
      validateReviewPlanArtifact(artifact);
    }
    return (
      (Array.isArray(artifact.tasks) && artifact.tasks.length > 0) ||
      (Array.isArray(artifact.calendarDraftItems) && artifact.calendarDraftItems.length > 0)
    );
  }
  return false;
}

function hasClarificationOrConfirmationAction(output: LearnSemanticRouterOutput) {
  return [...output.directCalls, ...output.proposals].some(
    (action) =>
      action.kind === 'review_mode.request_choice' ||
      action.kind === 'learner_progress.request_confirmation',
  );
}

function validateSemanticRouterOutput(output: LearnSemanticRouterOutput) {
  if (output.answerMode === 'course_answer') {
    if (!output.handoff) {
      throw new Error('AI semantic router must provide a handoff for course_answer turns.');
    }
    if (!output.handoff.requiredBehavior.length) {
      throw new Error('AI semantic router course_answer handoff must include requiredBehavior.');
    }
  }
  if (output.answerMode === 'client_activity_plan') {
    const hasPlanArtifact = output.artifacts.some(isPlanArtifact);
    if (!output.replyText.trim()) {
      throw new Error('AI semantic router client_activity_plan must include replyText.');
    }
    if (!hasPlanArtifact) {
      throw new Error('AI semantic router client_activity_plan must include a plan artifact.');
    }
  }
  if (
    output.planningDecision?.intent &&
    ['review_plan', 'preview_plan'].includes(output.planningDecision.intent) &&
    !output.artifacts.some(isPlanArtifact) &&
    !hasClarificationOrConfirmationAction(output)
  ) {
    throw new Error(
      `AI semantic router ${output.planningDecision.intent} must include a displayable plan artifact or a confirmation action.`,
    );
  }
  if (output.planningDecision?.shouldAskProgressFirst) {
    const hasProgressRequestAction = [...output.directCalls, ...output.proposals].some(
      (action) => action.kind === 'learner_progress.request_confirmation',
    );
    if (!hasProgressRequestAction) {
      throw new Error(
        'AI semantic router progress confirmation must use learner_progress.request_confirmation.',
      );
    }
  }
}

function reviewModeLabel(mode: string) {
  if (mode === 'explain') return '听讲解';
  if (mode === 'practice') return '练题目';
  return '讲解 + 练题';
}

function reviewModeFollowupText(query: string, mode: 'explain' | 'practice' | 'both') {
  const target = query.trim();
  if (mode === 'explain') return target ? `我想听讲解：${target}` : '听讲解';
  if (mode === 'practice') return target ? `我想练题目：${target}` : '练题目';
  return target ? `我想讲解和练题都有：${target}` : '都有';
}

function buildReviewModeChoiceAction(input: LearnTurnInput) {
  const options = [
    {
      value: 'explain',
      label: reviewModeLabel('explain'),
      followupText: reviewModeFollowupText(input.question, 'explain'),
    },
    {
      value: 'practice',
      label: reviewModeLabel('practice'),
      followupText: reviewModeFollowupText(input.question, 'practice'),
    },
    {
      value: 'both',
      label: reviewModeLabel('both'),
      followupText: reviewModeFollowupText(input.question, 'both'),
    },
  ];
  return {
    kind: 'review_mode.request_choice' as const,
    label: '选择复习方式',
    summary: '你这次更想听讲解、练题，还是两者都要？',
    confirmation: 'required' as const,
    payload: {
      confirmationType: 'review_mode',
      targetText: input.question,
      options,
    },
  };
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function payloadString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function shortReviewModeReply(text: string): 'explain' | 'practice' | 'both' | null {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return null;
  if (/^(听)?讲解$|^解释$|^explain$/.test(normalized)) return 'explain';
  if (/^练题目?$|^做题$|^刷题$|^练习$|^practice$/.test(normalized)) return 'practice';
  if (/^都有$|^都要$|^两个都$|^讲解\s*\+\s*练题$|^both$/.test(normalized)) return 'both';
  return null;
}

function latestReviewModeTarget(input: LearnTurnInput): string {
  for (const action of input.recentActions) {
    const record = readRecord(action);
    if (record?.kind !== 'review_mode.request_choice') continue;
    const payload = readRecord(record.payload);
    const targetText = payloadString(payload?.targetText);
    if (targetText) return targetText;
  }
  return '';
}

function reviewModeChoiceQuestion(mode: 'explain' | 'practice' | 'both', targetText: string) {
  if (mode === 'explain') return `我想听讲解：${targetText}`;
  if (mode === 'practice') return `我想练题目：${targetText}`;
  return `我想讲解和练题都有：${targetText}`;
}

function resolveReviewModeChoiceInput(input: LearnTurnInput): LearnTurnInput {
  const mode = shortReviewModeReply(input.question);
  if (!mode) return input;
  const targetText = latestReviewModeTarget(input);
  if (!targetText) return input;
  return {
    ...input,
    question: reviewModeChoiceQuestion(mode, targetText),
  };
}

function explicitPracticeTarget(text: string): string | null {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;
  if (/讲解.*练题|练题.*讲解|讲解.*做题|做题.*讲解|都有|都要|both/i.test(trimmed)) {
    return null;
  }
  if (!/(练题目?|做题|刷题|练习|practice|quiz)/i.test(trimmed)) return null;

  const directMatch =
    trimmed.match(
      /(?:我想|想|我要|需要|请)?\s*(?:练题目?|做题|刷题|练习|practice|quiz)\s*[：:]\s*(.+)$/i,
    ) ||
    trimmed.match(
      /(?:我想|想|我要|需要|请)?\s*(?:练题目?|做题|刷题|练习|practice|quiz)(?:一下|一组|一些|点)?\s+(.+)$/i,
    );
  const rawTarget = (directMatch?.[1] || trimmed)
    .replace(/^(?:我)?(?:需要|想要|想|要|准备|打算)\s*/i, '')
    .replace(/^(?:我)?(?:需要|想要|想)?\s*复习\s*/i, '')
    .replace(/^(?:复习|练习|巩固|刷)\s*/i, '')
    .replace(/^复习\s*/i, '')
    .replace(/^关于\s*/i, '')
    .trim();
  return rawTarget || trimmed;
}

function normalizeProblemBankSummaryText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\\forall|&forall;|∀/g, ' forall ')
    .replace(/\\exists|&exist;|&exists;|∃/g, ' exists ')
    .replace(/\s+/g, ' ')
    .trim();
}

function problemBankSampleStrings(sample: Record<string, unknown>): string[] {
  const tags = Array.isArray(sample.tags)
    ? sample.tags.map((tag) => (typeof tag === 'string' ? tag : '')).filter(Boolean)
    : [];
  return [
    typeof sample.title === 'string' ? sample.title : '',
    typeof sample.notebookName === 'string' ? sample.notebookName : '',
    ...tags,
  ].filter(Boolean);
}

function problemBankSampleId(sample: Record<string, unknown>): string {
  const id = typeof sample.id === 'string' ? sample.id : '';
  const problemId = typeof sample.problemId === 'string' ? sample.problemId : '';
  return id || problemId;
}

function problemBankSampleTitle(sample: Record<string, unknown>): string {
  return typeof sample.title === 'string' && sample.title.trim()
    ? sample.title.trim()
    : problemBankSampleId(sample) || 'Untitled problem';
}

function problemBankSampleTags(sample: Record<string, unknown>): string[] {
  return Array.isArray(sample.tags)
    ? sample.tags.map((tag) => (typeof tag === 'string' ? tag.trim() : '')).filter(Boolean)
    : [];
}

function hasTruthTableSummarySignal(text: string): boolean {
  return /truth\s*table|truthtable|truth\s*(value|values|statement|statements|assignment|assignments)|logical\s*(equivalence|statement|statements)|compound\s*(proposition|statement)|真值表|命题真值|真值判断|逻辑等价|复合命题/i.test(
    text,
  );
}

function hasQuantifierSummarySignal(text: string): boolean {
  return /forall|for\s+all|exists|there\s+exists|predicate|quantifier|全称|存在|量词|谓词|任意|并非所有|不是所有|所有.*都/i.test(
    text,
  );
}

function buildProblemBankSummarySearch(args: {
  input: LearnTurnInput;
  target: string;
  requestedCount: number;
  searchError?: string;
}): LearnProblemBankSearchResult | null {
  const samples = args.input.problemBank.samples;
  if (!samples.length && args.input.problemBank.activeCount <= 0) return null;

  const targetText = normalizeProblemBankSummaryText(args.target);
  const truthTableTarget = hasTruthTableSummarySignal(targetText);
  const quantifierTarget = hasQuantifierSummarySignal(targetText) && !truthTableTarget;
  const matches: LearnProblemBankSearchResult['matches'] = [];
  const excluded: LearnProblemBankSearchResult['excluded'] = [];

  for (const sample of samples) {
    const sampleText = normalizeProblemBankSummaryText(problemBankSampleStrings(sample).join(' '));
    const problemId = problemBankSampleId(sample);
    const title = problemBankSampleTitle(sample);
    const tags = problemBankSampleTags(sample);
    const truthSignal = hasTruthTableSummarySignal(sampleText);
    const quantifierSignal = hasQuantifierSummarySignal(sampleText);

    if (truthTableTarget) {
      if (quantifierSignal) {
        excluded.push({
          problemId,
          title,
          reason: '题库摘要含有量词/谓词信号，不能归入本轮 truth table 练习。',
          excerpt: problemBankSampleStrings(sample).join('；'),
          metadata: { source: 'request_problem_bank_snapshot' },
        });
        continue;
      }
      if (!truthSignal) {
        excluded.push({
          problemId,
          title,
          reason: '题库摘要没有明确命中 truth table / truth values 证据。',
          excerpt: problemBankSampleStrings(sample).join('；'),
          metadata: { source: 'request_problem_bank_snapshot' },
        });
        continue;
      }
    } else if (quantifierTarget) {
      if (!quantifierSignal || truthSignal) {
        excluded.push({
          problemId,
          title,
          reason: '题库摘要没有严格命中量词/谓词练习目标。',
          excerpt: problemBankSampleStrings(sample).join('；'),
          metadata: { source: 'request_problem_bank_snapshot' },
        });
        continue;
      }
    } else if (targetText && !sampleText.includes(targetText)) {
      excluded.push({
        problemId,
        title,
        reason: `题库摘要没有直接命中「${args.target}」。`,
        excerpt: problemBankSampleStrings(sample).join('；'),
        metadata: { source: 'request_problem_bank_snapshot' },
      });
      continue;
    }

    matches.push({
      problemId,
      title,
      score: truthSignal || quantifierSignal ? 72 : 52,
      reason: '从请求携带的题库摘要中保守命中；用于 local-first 课程的 server fallback。',
      excerpt: problemBankSampleStrings(sample).join('；'),
      notebookName: typeof sample.notebookName === 'string' ? sample.notebookName : null,
      tags,
      difficulty: typeof sample.difficulty === 'string' ? sample.difficulty : undefined,
      problemType: typeof sample.type === 'string' ? sample.type : undefined,
      metadata: { source: 'request_problem_bank_snapshot' },
    });
  }

  const limitedMatches = matches.slice(0, args.requestedCount);
  const gaps: string[] = [];
  if (limitedMatches.length < args.requestedCount) {
    gaps.push(
      `题库摘要严格命中「${args.target}」的题只有 ${limitedMatches.length} 道；没有为了凑数量混入相邻专题。`,
    );
  }
  if (args.searchError) {
    gaps.push(`题库全文检索未完成：${args.searchError}`);
  }
  if (samples.length < args.input.problemBank.activeCount) {
    gaps.push(
      `本次 API 请求只携带了 ${samples.length} 个题库摘要；完整 local-first 题库仍在浏览器本地。`,
    );
  }

  return {
    query: args.target,
    requestedCount: args.requestedCount,
    source: 'problem_bank_summary',
    strictTopic: truthTableTarget ? 'truth_table' : quantifierTarget ? 'quantifier' : null,
    matches: limitedMatches,
    excluded: excluded.slice(0, 8),
    rationale: [
      '题库全文检索不可用时，使用请求携带的题库摘要做保守 fallback。',
      '这个结果标记为 problem_bank_summary；它不是完整 RAG，但仍会排除明显相邻专题。',
    ],
    gaps,
    searchedAt: new Date().toISOString(),
  };
}

function semanticPracticeTarget(input: LearnTurnInput, output: LearnSemanticRouterOutput) {
  const planningDecision = output.planningDecision;
  const focusTopic = planningDecision?.focusTopics?.find((topic) => topic.trim().length > 0);
  const scopeLabel = planningDecision?.scopeResolution?.contentScope?.label?.trim();
  const explicitTarget = explicitPracticeTarget(input.question);
  const resolvedPrompt = planningDecision?.resolvedPrompt?.trim();
  return (
    focusTopic?.trim() || scopeLabel || explicitTarget || resolvedPrompt || input.question.trim()
  );
}

function generatedCoursePracticeAction(args: {
  input: LearnTurnInput;
  target: string;
  requestedCount: number;
  reasonSummary: string;
  problemBankSearch?: LearnProblemBankSearchResult | null;
}): LearnSemanticRouterOutput['proposals'][number] {
  return {
    kind: 'practice.propose_generation',
    label: '生成并加入题库',
    summary: `根据课程内容生成 ${args.requestedCount} 道「${args.target}」练习题，保存进题库后开始练习。`,
    payload: {
      source: 'generated_from_course',
      persistToProblemBank: true,
      topic: args.target,
      count: args.requestedCount,
      courseId: args.input.courseId || '',
      concepts: [args.target],
      reason: args.reasonSummary,
      problemBankSearch: args.problemBankSearch ?? null,
    },
    confirmation: 'required',
  };
}

async function createGeneratedCoursePracticeProposalDecision(args: {
  ctx: LearnRunContext;
  recorder: LearnTraceRecorder;
  userEvidence: ReturnType<typeof questionEvidence>;
  target: string;
  requestedCount: number;
  reasonSummary: string;
  problemBankSearch?: LearnProblemBankSearchResult | null;
  searchError?: string;
}): Promise<LearnTurnDecision> {
  const input = args.ctx.input;
  const tool = await args.recorder.toolStart({
    toolId: 'propose_practice_generation',
    purpose:
      'Propose a course-grounded question-generation agent that persists new questions to the course problem bank.',
    inputSummary: compactTraceValue({
      question: input.question,
      target: args.target,
      courseId: input.courseId,
      activeProblemCount: input.problemBank.activeCount,
      requestedCount: args.requestedCount,
      problemBankSearch: args.problemBankSearch
        ? {
            source: args.problemBankSearch.source,
            matchCount: args.problemBankSearch.matches.length,
            excludedCount: args.problemBankSearch.excluded.length,
            gaps: args.problemBankSearch.gaps,
          }
        : null,
      searchError: args.searchError || undefined,
    }),
    metadata: { selectedToolIds: ['propose_practice_generation'] },
  });
  await args.recorder.toolEnd(tool, {
    outputSummary: `Proposed generating ${args.requestedCount} course-grounded ${args.target} questions and saving them to the problem bank before practice.`,
    evidenceIds: [args.userEvidence.id],
    metadata: {
      selectedToolIds: ['propose_practice_generation'],
      source: 'generated_from_course',
      persistToProblemBank: true,
      target: args.target,
      count: args.requestedCount,
      problemBankGaps: args.problemBankSearch?.gaps ?? [],
      searchError: args.searchError || undefined,
    },
  });
  await args.recorder.step({
    kind: 'select_evidence_plan',
    label: 'Course-grounded problem generation route',
    reasonSummary: args.reasonSummary,
    evidence: [args.userEvidence],
    outputSummary: compactTraceValue({
      target: args.target,
      requestedCount: args.requestedCount,
      source: 'generated_from_course',
      persistToProblemBank: true,
    }),
    confidence: 0.92,
    metadata: {
      target: args.target,
      problemBankActiveCount: input.problemBank.activeCount,
      problemBankSearch: args.problemBankSearch ?? null,
    },
  });
  const decision = createLearnTurnDecision({
    answerMode: 'action_only',
    replyText: `题库里没有足够严格匹配「${args.target}」的题。我会先根据课程内容生成 ${args.requestedCount} 道题并保存进题库，再从这些题开始练。`,
    planningDecision: {
      intent: 'practice_plan',
      practiceMode: 'practice',
      scopeHint: 'explicit_topic',
      scopeResolution: {
        contentScope: {
          label: args.target,
          kind: 'explicit_topic',
          basis: 'user_explicit',
          eventIds: [],
          startDate: '',
          endDate: '',
          rationale:
            'The learner explicitly asked to practice this topic, but the bank-backed selection has no strict usable matches.',
          confidence: 0.9,
        },
        executionWindow: null,
        needsClarification: false,
        clarificationQuestion: '',
      },
      isFollowUpToPlan: false,
      shouldAskProgressFirst: false,
      useSyllabusAsDefaultScope: false,
      resolvedPrompt: input.question,
      focusTopics: [args.target],
      constraintsSummary:
        'Run the question-generation agent from course content, persist generated questions to the course problem bank, then start practice from the saved questions.',
      reason: args.reasonSummary,
      confidence: 0.92,
      problemBankSearch: args.problemBankSearch ?? null,
    },
    proposals: [
      generatedCoursePracticeAction({
        input,
        target: args.target,
        requestedCount: args.requestedCount,
        reasonSummary: args.reasonSummary,
        problemBankSearch: args.problemBankSearch,
      }),
    ],
    reason: 'Problem-bank practice fell back to a durable course-grounded generation proposal.',
    confidence: 0.92,
    trace: args.recorder.trace,
  });
  return args.recorder.finish(decision);
}

async function maybeResolveExplicitProblemBankPractice(args: {
  ctx: LearnRunContext;
  recorder: LearnTraceRecorder;
  userEvidence: ReturnType<typeof questionEvidence>;
  searchProblemBank?: DecideTeachingTurnOptions['searchProblemBank'];
}): Promise<LearnTurnDecision | null> {
  const input = args.ctx.input;
  const target = explicitPracticeTarget(input.question);
  if (!target) return null;
  const requestedCount = 5;

  if (!input.problemBank.available || input.problemBank.activeCount <= 0) {
    return createGeneratedCoursePracticeProposalDecision({
      ...args,
      target,
      requestedCount: 3,
      reasonSummary:
        'The learner asked for targeted practice, but there are no active problem-bank questions. Generate course-grounded questions and persist them before practice.',
    });
  }

  const tool = await args.recorder.toolStart({
    toolId: 'search_problem_bank',
    purpose: 'Retrieve bank-backed questions and problem metadata for targeted practice.',
    inputSummary: compactTraceValue({
      question: input.question,
      target,
      courseId: input.courseId,
      activeProblemCount: input.problemBank.activeCount,
      sampleCount: input.problemBank.samples.length,
      requestedCount,
    }),
    metadata: { selectedToolIds: ['search_problem_bank'] },
  });

  let problemBankSearch: LearnProblemBankSearchResult | null = null;
  let searchError = '';
  if (args.searchProblemBank) {
    try {
      problemBankSearch = await args.searchProblemBank({
        courseId: input.courseId,
        query: target,
        requestedCount,
      });
    } catch (error) {
      searchError = error instanceof Error ? error.message : String(error);
    }
  }
  if (!problemBankSearch) {
    problemBankSearch = buildProblemBankSummarySearch({
      input,
      target,
      requestedCount,
      searchError,
    });
  }
  if (searchError && !problemBankSearch) {
    await args.recorder.toolEnd(tool, {
      status: 'failed',
      error: searchError,
      evidenceIds: [args.userEvidence.id],
      metadata: { selectedToolIds: ['search_problem_bank'] },
    });
  } else {
    await args.recorder.toolEnd(tool, {
      outputSummary: problemBankSearch
        ? `Retrieved ${problemBankSearch.matches.length} problem-bank matches for ${target}; excluded ${problemBankSearch.excluded.length}.`
        : 'No executable problem-bank search implementation was attached; client will use its local fallback.',
      evidenceIds: [args.userEvidence.id],
      metadata: {
        selectedToolIds: ['search_problem_bank'],
        resultCount: problemBankSearch?.matches.length ?? null,
        excludedCount: problemBankSearch?.excluded.length ?? null,
        gaps: problemBankSearch?.gaps ?? [],
        fallbackSource: problemBankSearch?.source === 'problem_bank_summary',
        searchError: searchError || undefined,
      },
    });
  }

  if (!problemBankSearch || problemBankSearch.matches.length === 0) {
    return createGeneratedCoursePracticeProposalDecision({
      ...args,
      target,
      requestedCount: 3,
      reasonSummary:
        'The learner asked for targeted practice, but the executed problem-bank search produced no strict usable matches. Generate course-grounded questions and persist them before practice.',
      problemBankSearch,
      searchError,
    });
  }

  const problemEvidence =
    problemBankSearch?.matches.slice(0, 6).map((match, index) => ({
      id: `problem-bank-match-${index + 1}-${match.problemId}`,
      sourceType: 'problem_bank' as const,
      sourceId: match.problemId,
      title: match.title,
      quoteOrSummary: match.excerpt || match.reason,
      supports: match.reason,
      confidence: Math.max(0.45, Math.min(0.98, match.score / 100)),
      metadata: match.metadata || {},
    })) || [];

  await args.recorder.step({
    kind: 'select_evidence_plan',
    label: 'Problem-bank practice route',
    reasonSummary: problemBankSearch
      ? 'The latest learner turn explicitly asks for practice, so use executed problem-bank search results as the practice-plan evidence.'
      : 'The latest learner turn explicitly asks for practice, but no executable problem-bank search implementation was attached.',
    evidence: [args.userEvidence, ...problemEvidence],
    outputSummary: problemBankSearch
      ? compactTraceValue({
          target,
          resultCount: problemBankSearch.matches.length,
          excludedCount: problemBankSearch.excluded.length,
          gaps: problemBankSearch.gaps,
        })
      : `Select real problem-bank questions for ${target}.`,
    confidence: 0.96,
    metadata: {
      target,
      problemBankActiveCount: input.problemBank.activeCount,
      problemBankSearch,
    },
  });

  const decision = createLearnTurnDecision({
    answerMode: 'client_practice_plan',
    replyText: '',
    planningDecision: {
      intent: 'practice_plan',
      practiceMode: 'practice',
      scopeHint: 'explicit_topic',
      scopeResolution: {
        contentScope: {
          label: target,
          kind: 'explicit_topic',
          basis: 'user_explicit',
          eventIds: [],
          startDate: '',
          endDate: '',
          rationale:
            'The learner explicitly asked to practice this topic and a problem bank is available.',
          confidence: 0.96,
        },
        executionWindow: null,
        needsClarification: false,
        clarificationQuestion: '',
      },
      isFollowUpToPlan: false,
      shouldAskProgressFirst: false,
      useSyllabusAsDefaultScope: false,
      resolvedPrompt: input.question,
      focusTopics: [target],
      constraintsSummary: problemBankSearch
        ? `Use only the returned problemBankSearch.matches for ${target}; do not fill missing slots with adjacent topics.`
        : `Use real problem-bank questions for ${target}.`,
      reason: problemBankSearch
        ? 'Explicit practice request should use executed problem-bank search evidence.'
        : 'Explicit practice request should open bank-backed practice selection.',
      confidence: 0.96,
      problemBankSearch,
    },
    reason: 'Deterministically routed explicit practice request to problem-bank selection.',
    confidence: 0.96,
    trace: args.recorder.trace,
  });
  return args.recorder.finish(decision);
}

async function attachProblemBankSearchToSemanticPractice(args: {
  ctx: LearnRunContext;
  recorder: LearnTraceRecorder;
  userEvidence: ReturnType<typeof questionEvidence>;
  output: LearnSemanticRouterOutput;
  searchProblemBank?: DecideTeachingTurnOptions['searchProblemBank'];
}): Promise<LearnSemanticRouterOutput> {
  const input = args.ctx.input;
  const planningDecision = args.output.planningDecision;
  if (
    args.output.answerMode !== 'client_practice_plan' ||
    planningDecision?.intent !== 'practice_plan' ||
    planningDecision.problemBankSearch ||
    !input.problemBank.available ||
    input.problemBank.activeCount <= 0
  ) {
    return args.output;
  }

  const requestedCount = 5;
  const target = semanticPracticeTarget(input, args.output);
  const tool = await args.recorder.toolStart({
    toolId: 'search_problem_bank',
    purpose: 'Execute targeted problem-bank retrieval for the semantic practice plan.',
    inputSummary: compactTraceValue({
      question: input.question,
      target,
      courseId: input.courseId,
      activeProblemCount: input.problemBank.activeCount,
      requestedCount,
      routerReason: args.output.reason,
    }),
    metadata: { selectedToolIds: ['search_problem_bank'], route: 'semantic_practice_plan' },
  });

  let problemBankSearch: LearnProblemBankSearchResult | null = null;
  let searchError = '';
  if (args.searchProblemBank) {
    try {
      problemBankSearch = await args.searchProblemBank({
        courseId: input.courseId,
        query: target,
        requestedCount,
      });
    } catch (error) {
      searchError = error instanceof Error ? error.message : String(error);
    }
  }
  if (!problemBankSearch) {
    problemBankSearch = buildProblemBankSummarySearch({
      input,
      target,
      requestedCount,
      searchError,
    });
  }

  if (searchError && !problemBankSearch) {
    await args.recorder.toolEnd(tool, {
      status: 'failed',
      error: searchError,
      evidenceIds: [args.userEvidence.id],
      metadata: {
        selectedToolIds: ['search_problem_bank'],
        route: 'semantic_practice_plan',
      },
    });
    return args.output;
  }

  await args.recorder.toolEnd(tool, {
    outputSummary: problemBankSearch
      ? `Retrieved ${problemBankSearch.matches.length} problem-bank matches for ${target}; excluded ${problemBankSearch.excluded.length}.`
      : 'No executable problem-bank search implementation was attached; client will use its local fallback.',
    evidenceIds: [args.userEvidence.id],
    metadata: {
      selectedToolIds: ['search_problem_bank'],
      route: 'semantic_practice_plan',
      resultCount: problemBankSearch?.matches.length ?? null,
      excludedCount: problemBankSearch?.excluded.length ?? null,
      gaps: problemBankSearch?.gaps ?? [],
      fallbackSource: problemBankSearch?.source === 'problem_bank_summary',
      searchError: searchError || undefined,
    },
  });

  if (!problemBankSearch) return args.output;

  if (problemBankSearch.matches.length === 0) {
    const reasonSummary =
      'The semantic router selected a practice plan, but executed problem-bank search produced no strict usable matches. Generate course-grounded questions and persist them before practice.';
    const generationTool = await args.recorder.toolStart({
      toolId: 'propose_practice_generation',
      purpose:
        'Propose a course-grounded question-generation agent that persists new questions to the course problem bank.',
      inputSummary: compactTraceValue({
        question: input.question,
        target,
        courseId: input.courseId,
        requestedCount,
        problemBankSearch: {
          source: problemBankSearch.source,
          matchCount: problemBankSearch.matches.length,
          excludedCount: problemBankSearch.excluded.length,
          gaps: problemBankSearch.gaps,
        },
        routerReason: args.output.reason,
      }),
      metadata: {
        selectedToolIds: ['search_problem_bank', 'propose_practice_generation'],
        route: 'semantic_practice_plan',
      },
    });
    await args.recorder.toolEnd(generationTool, {
      outputSummary: `Proposed generating 3 course-grounded ${target} questions and saving them to the problem bank before practice.`,
      evidenceIds: [args.userEvidence.id],
      metadata: {
        selectedToolIds: ['search_problem_bank', 'propose_practice_generation'],
        route: 'semantic_practice_plan',
        source: 'generated_from_course',
        persistToProblemBank: true,
        target,
        count: 3,
      },
    });
    await args.recorder.step({
      kind: 'select_evidence_plan',
      label: 'Course-grounded problem generation route',
      reasonSummary,
      evidence: [args.userEvidence],
      outputSummary: compactTraceValue({
        target,
        requestedCount: 3,
        source: 'generated_from_course',
        persistToProblemBank: true,
      }),
      confidence: 0.9,
      metadata: {
        target,
        problemBankSearch,
      },
    });
    const selectedToolIds: LearnSemanticRouterOutput['selectedToolIds'] = Array.from(
      new Set<LearnSemanticRouterOutput['selectedToolIds'][number]>([
        ...args.output.selectedToolIds,
        'search_problem_bank',
        'propose_practice_generation',
      ]),
    );
    const normalizedProblemBankSearch = learnProblemBankSearchResultSchema.parse(problemBankSearch);
    return {
      ...args.output,
      answerMode: 'action_only',
      replyText: `题库里没有足够严格匹配「${target}」的题。我会先根据课程内容生成 3 道题并保存进题库，再从这些题开始练。`,
      directCalls: [],
      proposals: [
        ...args.output.proposals,
        generatedCoursePracticeAction({
          input,
          target,
          requestedCount: 3,
          reasonSummary,
          problemBankSearch,
        }),
      ],
      artifacts: [],
      selectedToolIds,
      planningDecision: {
        ...planningDecision,
        constraintsSummary:
          'Run the question-generation agent from course content, persist generated questions to the course problem bank, then start practice from the saved questions.',
        reason: [planningDecision.reason, reasonSummary].filter(Boolean).join(' '),
        problemBankSearch: normalizedProblemBankSearch,
      },
      reason: reasonSummary,
      confidence: Math.max(0.9, args.output.confidence),
    };
  }

  const problemEvidence = problemBankSearch.matches.slice(0, 6).map((match, index) => ({
    id: `semantic-problem-bank-match-${index + 1}-${match.problemId}`,
    sourceType: 'problem_bank' as const,
    sourceId: match.problemId,
    title: match.title,
    quoteOrSummary: match.excerpt || match.reason,
    supports: match.reason,
    confidence: Math.max(0.45, Math.min(0.98, match.score / 100)),
    metadata: match.metadata || {},
  }));

  await args.recorder.step({
    kind: 'select_evidence_plan',
    label: 'Attach problem-bank retrieval to practice plan',
    reasonSummary:
      'The AI router selected a practice plan, so the platform executed problem-bank search before the client selects questions.',
    evidence: [args.userEvidence, ...problemEvidence],
    outputSummary: compactTraceValue({
      target,
      resultCount: problemBankSearch.matches.length,
      excludedCount: problemBankSearch.excluded.length,
      gaps: problemBankSearch.gaps,
    }),
    confidence: 0.94,
    metadata: {
      target,
      problemBankSearch,
    },
  });

  const selectedToolIds: LearnSemanticRouterOutput['selectedToolIds'] = Array.from(
    new Set<LearnSemanticRouterOutput['selectedToolIds'][number]>([
      ...args.output.selectedToolIds,
      'search_problem_bank',
    ]),
  );
  const normalizedProblemBankSearch = learnProblemBankSearchResultSchema.parse(problemBankSearch);
  return {
    ...args.output,
    selectedToolIds,
    planningDecision: {
      ...planningDecision,
      constraintsSummary: `Use only the returned problemBankSearch.matches for ${target}; do not fill missing slots with adjacent topics.`,
      reason: [
        planningDecision.reason,
        'Problem-bank question selection was resolved by executed search evidence.',
      ]
        .filter(Boolean)
        .join(' '),
      problemBankSearch: normalizedProblemBankSearch,
    },
  };
}

async function maybeResolveFixedReviewWorkflow(args: {
  ctx: LearnRunContext;
  recorder: LearnTraceRecorder;
  userEvidence: ReturnType<typeof questionEvidence>;
}): Promise<LearnTurnDecision | null> {
  const input = args.ctx.input;
  const workflow = resolveFixedReviewWorkflow({ query: input.question });
  if (workflow.workflowId !== 'review_mode_clarification') return null;

  const tool = await args.recorder.toolStart({
    toolId: 'resolve_fixed_review_workflow',
    purpose: 'Apply fixed review workflow before the AI router.',
    inputSummary: compactTraceValue({
      question: input.question,
      workflowId: workflow.workflowId,
      targetKind: workflow.targetKind,
      mode: workflow.mode,
    }),
  });
  await args.recorder.toolEnd(tool, {
    outputSummary: 'Review target is present but review mode is missing.',
    evidenceIds: [args.userEvidence.id],
    metadata: {
      selectedToolIds: ['resolve_fixed_review_workflow'],
      workflowId: workflow.workflowId,
      requiredEvidence: workflow.requiredEvidence,
    },
  });

  await args.recorder.step({
    kind: 'select_evidence_plan',
    label: 'Fixed review workflow',
    reasonSummary:
      'The learner named a review target but did not choose explanation, practice, or both, so the fixed workflow pauses for a mode choice.',
    evidence: [args.userEvidence],
    outputSummary: workflow.clarificationQuestion || 'Ask learner to choose review mode.',
    confidence: 0.95,
    metadata: {
      workflowId: workflow.workflowId,
      targetKind: workflow.targetKind,
      mode: workflow.mode,
    },
  });

  const decision = createLearnTurnDecision({
    answerMode: 'action_only',
    replyText: workflow.clarificationQuestion || '你这次更想听讲解、练题，还是两者都要？',
    planningDecision: {
      intent: 'review_plan',
      scopeHint: 'explicit_topic',
      scopeResolution: {
        contentScope: {
          label: input.question,
          kind: 'explicit_topic',
          basis: 'user_explicit',
          eventIds: [],
          startDate: '',
          endDate: '',
          rationale: 'The learner named a review target, but the review mode is missing.',
          confidence: 0.85,
        },
        executionWindow: null,
        needsClarification: true,
        clarificationQuestion:
          workflow.clarificationQuestion || '你这次更想听讲解、练题，还是两者都要？',
      },
      isFollowUpToPlan: false,
      shouldAskProgressFirst: false,
      useSyllabusAsDefaultScope: false,
      resolvedPrompt: input.question,
      focusTopics: [input.question],
      constraintsSummary: 'Awaiting review mode: explanation, practice, or both.',
      reason: 'Fixed review workflow requires an explicit review mode before planning.',
      confidence: 0.9,
    },
    proposals: [buildReviewModeChoiceAction(input)],
    reason: 'Fixed review workflow paused to ask for review mode before planning.',
    confidence: 0.95,
    trace: args.recorder.trace,
  });
  return args.recorder.finish(decision);
}

async function routeWithSemanticRouter(
  ctx: LearnRunContext,
  recorder: LearnTraceRecorder,
  semanticRouter?: DecideTeachingTurnOptions['semanticRouter'],
  searchProblemBank?: DecideTeachingTurnOptions['searchProblemBank'],
): Promise<LearnTurnDecision> {
  const input = ctx.input;
  const userEvidence = questionEvidence(input, 'latest learner request');

  await recorder.step({
    kind: 'observe_input',
    label: 'Observe learner turn',
    reasonSummary: 'Captured the current question and available platform context.',
    evidence: [userEvidence],
    metadata: {
      courseId: input.courseId,
      hasSyllabus: input.hasSyllabus,
      problemBankActiveCount: input.problemBank.activeCount,
      sourceUploadCount: input.sourceUploads.length,
      recentActivityCount: input.recentActivities.length,
    },
  });

  const reviewModeResolvedInput = resolveReviewModeChoiceInput(input);
  const reviewModeResolvedCtx =
    reviewModeResolvedInput === input
      ? ctx
      : {
          ...ctx,
          input: reviewModeResolvedInput,
        };

  const explicitPracticeDecision = await maybeResolveExplicitProblemBankPractice({
    ctx: reviewModeResolvedCtx,
    recorder,
    userEvidence,
    searchProblemBank,
  });
  if (explicitPracticeDecision) return explicitPracticeDecision;

  const fixedWorkflowDecision = await maybeResolveFixedReviewWorkflow({
    ctx,
    recorder,
    userEvidence,
  });
  if (fixedWorkflowDecision) return fixedWorkflowDecision;

  const semanticRouterInput = reviewModeResolvedInput;
  const semanticRouterCtx =
    semanticRouterInput === input
      ? ctx
      : {
          ...ctx,
          input: semanticRouterInput,
        };

  const tool = await recorder.toolStart({
    toolId: 'semantic_router',
    purpose: 'Choose the next typed learning route with the AI semantic router.',
    inputSummary: compactTraceValue(
      {
        question: semanticRouterInput.question,
        originalQuestion: input.question,
        courseId: semanticRouterInput.courseId,
        courseCode: semanticRouterInput.courseCode,
        currentDate: ctx.currentDate,
      },
      900,
    ),
  });

  if (!semanticRouter) {
    await recorder.toolEnd(tool, {
      status: 'failed',
      error: 'AI semantic router is not configured.',
    });
    return emitValidationError(ctx, 'AI semantic router is not configured.');
  }

  let output: LearnSemanticRouterOutput | null = null;
  try {
    output = await semanticRouter(semanticRouterCtx);
    if (!output) {
      throw new Error('AI semantic router returned no decision.');
    }
    validateSemanticRouterOutput(output);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[learn-core] AI semantic router invalid decision:', message);
    await recorder.toolEnd(tool, {
      status: 'failed',
      error: message,
    });
    return emitValidationError(
      ctx,
      `AI semantic router failed to produce a valid decision: ${message}`,
      {
        error: message,
      },
    );
  }

  const selectedToolIds = selectedToolIdsForTrace(output);
  await recorder.toolEnd(tool, {
    outputSummary: `${output.answerMode} selected by AI semantic router.`,
    evidenceIds: [userEvidence.id],
    metadata: { selectedToolIds },
  });

  await recorder.step({
    kind: 'model_routing',
    label: 'AI semantic routing',
    reasonSummary: output.reason || 'AI semantic router returned a structured route.',
    evidence: [userEvidence],
    outputSummary: compactTraceValue(
      {
        answerMode: output.answerMode,
        selectedToolIds,
        planningIntent: output.planningDecision?.intent,
        directCalls: output.directCalls.map((action) => action.kind),
        proposals: output.proposals.map((action) => action.kind),
      },
      900,
    ),
    confidence: output.confidence,
    metadata: {
      selectedToolIds,
      hasHandoff: Boolean(output.handoff),
    },
  });

  output = await attachProblemBankSearchToSemanticPractice({
    ctx: semanticRouterCtx,
    recorder,
    userEvidence,
    output,
    searchProblemBank,
  });

  if (output.answerMode === 'course_answer') {
    const handoffArgs = handoffOutputToPacketArgs({ output, evidence: [userEvidence] });
    if (!handoffArgs) {
      return emitValidationError(ctx, 'AI semantic router omitted a course_answer handoff.');
    }
    await recorder.handoff(handoffArgs);
  }

  const decision = coerceLearnTurnDecisionOutput(output, recorder.trace);
  return recorder.finish(decision);
}

export async function decideTeachingTurn(
  input: LearnTurnInput,
  options: DecideTeachingTurnOptions = {},
): Promise<LearnTurnDecision> {
  const ctx = createLearnRunContext({
    input,
    runId: options.runId,
    currentDate: options.currentDate,
    hooks: options.hooks,
  });
  await ctx.hooks?.emit?.({ type: 'turn_start', context: snapshotLearnRunContext(ctx) });

  const recorder = new LearnTraceRecorder(ctx);
  return routeWithSemanticRouter(ctx, recorder, options.semanticRouter, options.searchProblemBank);
}

export function learnTurnDecisionToResponse(decision: LearnTurnDecision) {
  return {
    answerMode: decision.answerMode,
    replyText: decision.replyText,
    planningDecision: decision.planningDecision,
    directCalls: decision.directCalls,
    proposals: decision.proposals,
    artifacts: decision.artifacts,
    reason: decision.reason,
    confidence: decision.confidence,
    trace: decision.trace,
  };
}
