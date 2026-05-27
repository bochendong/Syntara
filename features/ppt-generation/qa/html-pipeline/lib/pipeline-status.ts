import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

import type { CheckStatus, PipelineCheck, PipelineStepState } from './pipeline-types';

export function statusClassName(status: CheckStatus): string {
  if (status === 'pass') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'warn') return 'border-amber-200 bg-amber-50 text-amber-900';
  return 'border-red-200 bg-red-50 text-red-800';
}

export function statusIcon(status: CheckStatus) {
  if (status === 'pass') return CheckCircle2;
  if (status === 'warn') return AlertTriangle;
  return XCircle;
}

export function hasBlockingFailure(checks: PipelineCheck[]): boolean {
  return checks.some((check) => check.status === 'fail');
}

export function hasWarning(checks: PipelineCheck[]): boolean {
  return checks.some((check) => check.status === 'warn');
}

export function checksToStepState(checks: PipelineCheck[]): PipelineStepState {
  if (hasBlockingFailure(checks)) return 'fail';
  if (hasWarning(checks)) return 'warn';
  return 'pass';
}

export function stepBadgeLabel(state: PipelineStepState): string {
  if (state === 'locked') return '锁定';
  if (state === 'ready') return '待测';
  if (state === 'running') return '运行中';
  if (state === 'pass') return '通过';
  if (state === 'warn') return '通过，有警告';
  return '未通过';
}

export function stepBadgeClassName(state: PipelineStepState): string {
  if (state === 'locked') return 'border-slate-200 bg-slate-100 text-slate-500';
  if (state === 'ready') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (state === 'running') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (state === 'pass') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (state === 'warn') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-red-200 bg-red-50 text-red-700';
}
