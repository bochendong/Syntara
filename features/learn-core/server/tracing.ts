import type {
  LearnDecisionChainStep,
  LearnDecisionChainStepKind,
  LearnEvidenceLink,
  LearnHandoffPacket,
  LearnHooks,
  LearnRunContext,
  LearnToolCallTrace,
  LearnToolId,
  LearnTrace,
  LearnTurnDecision,
} from '../domain/types';

function randomSuffix() {
  return Math.random().toString(36).slice(2, 10);
}

export function makeLearnRunId(prefix = 'learn-run') {
  return `${prefix}-${Date.now()}-${randomSuffix()}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function createLearnTrace(runId: string): LearnTrace {
  return {
    runId,
    startedAt: nowIso(),
    steps: [],
    toolCalls: [],
    handoffs: [],
  };
}

async function emitHook(
  ctx: Pick<LearnRunContext, 'hooks'>,
  event: Parameters<NonNullable<LearnHooks['emit']>>[0],
) {
  await ctx.hooks?.emit?.(event);
}

export class LearnTraceRecorder {
  readonly trace: LearnTrace;
  private sequence = 0;

  constructor(
    private readonly ctx: LearnRunContext,
    trace?: LearnTrace,
  ) {
    this.trace = trace ?? createLearnTrace(ctx.runId);
  }

  async step(args: {
    kind: LearnDecisionChainStepKind;
    label: string;
    reasonSummary: string;
    evidence?: LearnEvidenceLink[];
    inputSummary?: string;
    outputSummary?: string;
    confidence?: number;
    metadata?: Record<string, unknown>;
  }): Promise<LearnDecisionChainStep> {
    this.sequence += 1;
    const step: LearnDecisionChainStep = {
      id: `step-${this.sequence}-${randomSuffix()}`,
      createdAt: nowIso(),
      ...args,
    };
    this.trace.steps.push(step);
    await emitHook(this.ctx, { type: 'step', step });
    return step;
  }

  async toolStart(args: {
    toolId: LearnToolId;
    purpose: string;
    inputSummary: string;
    metadata?: Record<string, unknown>;
  }): Promise<LearnToolCallTrace> {
    const call: LearnToolCallTrace = {
      id: `tool-${this.trace.toolCalls.length + 1}-${randomSuffix()}`,
      toolId: args.toolId,
      purpose: args.purpose,
      inputSummary: args.inputSummary,
      status: 'started',
      evidenceIds: [],
      startedAt: nowIso(),
      metadata: args.metadata,
    };
    this.trace.toolCalls.push(call);
    await emitHook(this.ctx, { type: 'tool_start', toolCall: call });
    return call;
  }

  async toolEnd(
    call: LearnToolCallTrace,
    args: {
      status?: 'completed' | 'failed' | 'skipped';
      outputSummary?: string;
      evidenceIds?: string[];
      error?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<LearnToolCallTrace> {
    call.status = args.status ?? 'completed';
    call.outputSummary = args.outputSummary;
    call.evidenceIds = args.evidenceIds ?? call.evidenceIds;
    call.error = args.error;
    call.metadata = { ...(call.metadata || {}), ...(args.metadata || {}) };
    call.endedAt = nowIso();
    await emitHook(this.ctx, { type: 'tool_end', toolCall: call });
    return call;
  }

  async handoff(args: Omit<LearnHandoffPacket, 'id' | 'createdAt'>): Promise<LearnHandoffPacket> {
    const handoff: LearnHandoffPacket = {
      id: `handoff-${this.trace.handoffs.length + 1}-${randomSuffix()}`,
      createdAt: nowIso(),
      ...args,
    };
    this.trace.handoffs.push(handoff);
    await this.step({
      kind: 'handoff',
      label: `${handoff.from} -> ${handoff.to}`,
      reasonSummary: handoff.reasonSummary,
      evidence: handoff.evidence,
      metadata: {
        requiredBehavior: handoff.requiredBehavior,
        forbiddenBehavior: handoff.forbiddenBehavior,
        missingEvidence: handoff.missingEvidence,
      },
    });
    await emitHook(this.ctx, { type: 'handoff', handoff });
    return handoff;
  }

  async finish(decision: LearnTurnDecision): Promise<LearnTurnDecision> {
    this.trace.endedAt = nowIso();
    await emitHook(this.ctx, { type: 'turn_end', decision });
    return decision;
  }
}

export function compactTraceValue(value: unknown, maxChars = 500): string {
  const text =
    typeof value === 'string'
      ? value
      : JSON.stringify(value, (_key, item) => {
          if (typeof item === 'string' && item.length > 300) return `${item.slice(0, 300)}...`;
          return item;
        });
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}...`;
}
