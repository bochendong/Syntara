import type { LearnRunContext, LearnRunContextSnapshot, LearnTurnInput } from '../domain/types';
import { listEnabledLearnCoreToolIds } from './tool-registry';
import { makeLearnRunId } from './tracing';

export function currentTorontoDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function createLearnRunContext(args: {
  input: LearnTurnInput;
  runId?: string;
  currentDate?: string;
  hooks?: LearnRunContext['hooks'];
}): LearnRunContext {
  return {
    runId: args.runId || makeLearnRunId(),
    input: args.input,
    currentDate: args.currentDate || currentTorontoDate(),
    hooks: args.hooks,
  };
}

export function snapshotLearnRunContext(ctx: LearnRunContext): LearnRunContextSnapshot {
  return {
    runId: ctx.runId,
    courseId: ctx.input.courseId,
    courseName: ctx.input.courseName,
    courseCode: ctx.input.courseCode,
    currentDate: ctx.currentDate,
    enabledToolIds: listEnabledLearnCoreToolIds(ctx),
  };
}

export function recordString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function recordNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
