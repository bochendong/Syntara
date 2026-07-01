import type {
  LearnHooks,
  LearnRunContext,
  LearnTurnDecision,
  LearnTurnInput,
} from '../domain/types';
import { questionEvidence } from './evidence';
import { createLearnRunContext, snapshotLearnRunContext } from './run-context';
import { coerceLearnTurnDecisionOutput } from './responses';
import {
  type LearnSemanticRouterOutput,
  handoffOutputToPacketArgs,
  selectedToolIdsForTrace,
} from './semantic-router';
import { LearnTraceRecorder, compactTraceValue } from './tracing';

export type DecideTeachingTurnOptions = {
  hooks?: LearnHooks;
  runId?: string;
  currentDate?: string;
  semanticRouter?: (ctx: LearnRunContext) => Promise<LearnSemanticRouterOutput | null>;
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
    const hasPlanArtifact = output.artifacts.some((artifact) => {
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
    });
    if (!output.replyText.trim()) {
      throw new Error('AI semantic router client_activity_plan must include replyText.');
    }
    if (!hasPlanArtifact) {
      throw new Error('AI semantic router client_activity_plan must include a plan artifact.');
    }
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

async function routeWithSemanticRouter(
  ctx: LearnRunContext,
  recorder: LearnTraceRecorder,
  semanticRouter?: DecideTeachingTurnOptions['semanticRouter'],
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

  const tool = await recorder.toolStart({
    toolId: 'semantic_router',
    purpose: 'Choose the next typed learning route with the AI semantic router.',
    inputSummary: compactTraceValue(
      {
        question: input.question,
        courseId: input.courseId,
        courseCode: input.courseCode,
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
    output = await semanticRouter(ctx);
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
  return routeWithSemanticRouter(ctx, recorder, options.semanticRouter);
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
