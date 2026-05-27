'use client';

import type { ReactNode } from 'react';
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Loader2,
  Play,
  Route,
  Target,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ReviewRoute } from '@/lib/learning/review-route-types';
import { cn } from '@/lib/utils';

import { PRESETS, REVIEW_SCENARIOS, REVIEW_STEPS } from './fixtures';
import {
  candidateReason,
  stateBadgeClassName,
  stateLabel,
  statusClassName,
  statusToneClassName,
  uniqueItems,
  splitLines,
} from './logic';
import type {
  CandidateProblemPayload,
  PipelineCheck,
  PipelineStepState,
  PrivateMemoryPayload,
  ReviewFormState,
  ReviewHistoryPayload,
  ReviewScenarioId,
  ReviewStepId,
} from './types';

export function GateCheckList({ checks }: { checks: PipelineCheck[] }) {
  return (
    <div className="grid gap-3">
      {checks.map((check) => {
        const Icon = check.status === 'pass' ? CheckCircle2 : AlertTriangle;
        return (
          <div
            key={check.id}
            className={cn('rounded-xl border p-3 text-sm leading-6', statusClassName(check.status))}
          >
            <div className="flex items-center gap-2 font-semibold">
              <Icon className="size-4 shrink-0" />
              {check.label}
            </div>
            <div className="mt-1 text-sm opacity-90">{check.detail}</div>
          </div>
        );
      })}
    </div>
  );
}

export function ProfileLearningDigest({
  form,
  privateMemory,
  reviewHistory,
  checks,
}: {
  form: ReviewFormState;
  privateMemory: PrivateMemoryPayload[];
  reviewHistory: ReviewHistoryPayload[];
  checks: PipelineCheck[];
}) {
  const weakPoints = splitLines(form.weakPoints);
  const knownConcepts = uniqueItems([
    ...splitLines(form.masteredConcepts),
    ...splitLines(form.weakConcepts),
    ...splitLines(form.untriedConcepts),
    ...splitLines(form.thinConcepts),
    ...splitLines(form.missingConcepts),
  ]);
  const openMemory = privateMemory.filter((item) => item.status === 'open');
  const reviewedMemory = privateMemory.filter((item) => item.status === 'reviewed');
  const failedConcepts = uniqueItems(reviewHistory.flatMap((item) => item.failedConcepts));
  const completedConcepts = uniqueItems(
    reviewHistory
      .filter((item) => item.status === 'completed')
      .flatMap((item) => item.coveredConcepts),
  );

  return (
    <div className="grid gap-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
              <BrainCircuit className="size-4 text-indigo-500" />
              学情先拆成三层信号
            </div>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              这一步不是看 pass 数，而是确认后面的选题和路线能读到用户画像、私人记忆和历史复习证据。
            </p>
          </div>
          <Badge variant="secondary" className="w-fit rounded-md">
            {checks.filter((check) => check.status === 'pass').length}/{checks.length} signals
          </Badge>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-3">
          <ProfileSignalGroup
            order="01"
            title="用户画像"
            summary={`${PRESETS[form.mode].title} · 强度 ${form.intensity}/5`}
            checks={checks.filter((check) =>
              [
                'profile-notebook',
                'profile-goal',
                'profile-weak-points',
                'profile-concepts',
              ].includes(check.id),
            )}
          >
            <ProfileDatum label="目标" value={form.goal} />
            <ProfileDatum label="薄弱点" value={weakPoints.join('、') || '暂无'} />
            <ProfileDatum label="画像规模" value={`${knownConcepts.length} 个知识点`} />
          </ProfileSignalGroup>

          <ProfileSignalGroup
            order="02"
            title="Notebook 私人记忆"
            summary={`${openMemory.length} open · ${reviewedMemory.length} reviewed`}
            checks={checks.filter((check) => check.id === 'profile-private-memory')}
          >
            {privateMemory.length === 0 ? (
              <ProfileDatum label="记忆状态" value="本场景不注入私人记忆，用于测试 cold start。" />
            ) : null}
            {openMemory.map((item) => (
              <ProfileMemoryRow key={item.id} memory={item} />
            ))}
            {reviewedMemory.length ? (
              <ProfileDatum
                label="已降权"
                value={reviewedMemory.map((item) => item.concept).join('、')}
              />
            ) : null}
          </ProfileSignalGroup>

          <ProfileSignalGroup
            order="03"
            title="历史复习证据"
            summary={`${reviewHistory.length} 轮记录 · ${failedConcepts.length} 个失败概念`}
            checks={checks.filter((check) =>
              ['profile-review-history', 'profile-custom-rules'].includes(check.id),
            )}
          >
            <ProfileDatum label="失败概念" value={failedConcepts.join('、') || '暂无'} />
            <ProfileDatum label="已完成概念" value={completedConcepts.join('、') || '暂无'} />
            {reviewHistory.length === 0 ? (
              <ProfileDatum label="历史状态" value="本场景不注入历史复习记录。" />
            ) : null}
            <ProfileDatum label="定制规则" value={form.customRules || '暂无'} />
          </ProfileSignalGroup>
        </div>
      </div>
    </div>
  );
}

export function ProfileSignalGroup({
  order,
  title,
  summary,
  checks,
  children,
}: {
  order: string;
  title: string;
  summary: string;
  checks: PipelineCheck[];
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-slate-400">{order}</div>
          <h3 className="mt-1 text-sm font-semibold text-slate-950">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">{summary}</p>
        </div>
        <div className="flex gap-1">
          {checks.map((check) => {
            const Icon = check.status === 'pass' ? CheckCircle2 : AlertTriangle;
            return (
              <span
                key={check.id}
                title={`${check.label}: ${check.detail}`}
                className={cn(
                  'flex size-7 items-center justify-center rounded-md border',
                  statusClassName(check.status),
                )}
              >
                <Icon className="size-3.5" />
              </span>
            );
          })}
        </div>
      </div>
      <div className="mt-3 grid gap-2">{children}</div>
    </section>
  );
}

export function ProfileDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 line-clamp-3 text-sm leading-6 text-slate-700">{value}</div>
    </div>
  );
}

export function ProfileMemoryRow({ memory }: { memory: PrivateMemoryPayload }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant={memory.severity === 'high' ? 'destructive' : 'outline'}
          className="rounded-md"
        >
          {memory.severity}
        </Badge>
        <span className="text-sm font-semibold text-slate-900">{memory.concept}</span>
      </div>
      <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">{memory.note}</p>
    </div>
  );
}

export function StepButton({
  id,
  active,
  state,
  failCount,
  warnCount,
  onClick,
}: {
  id: ReviewStepId;
  active: boolean;
  state: PipelineStepState;
  failCount: number;
  warnCount: number;
  onClick: () => void;
}) {
  const step = REVIEW_STEPS[id];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-2xl border p-4 text-left transition',
        active
          ? 'border-indigo-300 bg-indigo-50 shadow-sm'
          : 'border-slate-200 bg-white hover:bg-slate-50',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
              active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600',
            )}
          >
            {step.order}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-950">{step.title}</div>
            <div className="mt-0.5 text-xs leading-5 text-slate-500">{step.subtitle}</div>
          </div>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-md border px-2 py-0.5 text-xs font-semibold',
            stateBadgeClassName(state),
          )}
        >
          {stateLabel(state)}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium text-slate-500">
        <span className="rounded-md bg-slate-100 px-2 py-1">{step.artifact}</span>
        <span className="rounded-md bg-slate-100 px-2 py-1">{failCount} fail</span>
        <span className="rounded-md bg-slate-100 px-2 py-1">{warnCount} warn</span>
      </div>
    </button>
  );
}

export function StepShell({
  id,
  state,
  actionLabel,
  actionDisabled,
  onAction,
  children,
}: {
  id: ReviewStepId;
  state: PipelineStepState;
  actionLabel?: string;
  actionDisabled?: boolean;
  onAction?: () => void;
  children: ReactNode;
}) {
  const step = REVIEW_STEPS[id];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
              {step.order}
            </span>
            <div>
              <h2 className="text-xl font-semibold tracking-normal">{step.title}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">{step.subtitle}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <Badge variant="outline" className="rounded-md">
            {step.artifact}
          </Badge>
          <span
            className={cn(
              'rounded-md border px-2.5 py-1 text-xs font-semibold',
              stateBadgeClassName(state),
            )}
          >
            {stateLabel(state)}
          </span>
          {actionLabel && onAction ? (
            <Button type="button" onClick={onAction} disabled={actionDisabled}>
              {state === 'running' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              {actionLabel}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function ReviewContextStory({
  privateMemory,
  selectedCandidateProblems,
  reviewHistory,
  route,
}: {
  privateMemory: PrivateMemoryPayload[];
  selectedCandidateProblems: CandidateProblemPayload[];
  reviewHistory: ReviewHistoryPayload[];
  route: ReviewRoute | null;
}) {
  const openMemory = privateMemory.filter((item) => item.status === 'open');
  const reviewedMemory = privateMemory.filter((item) => item.status === 'reviewed');
  const failedConcepts = uniqueItems(reviewHistory.flatMap((item) => item.failedConcepts));
  const completedConcepts = uniqueItems([
    ...reviewedMemory.map((item) => item.concept),
    ...reviewHistory
      .filter((item) => item.status === 'completed')
      .flatMap((item) => item.coveredConcepts),
  ]);
  const wrongOrPartial = selectedCandidateProblems.filter((problem) =>
    ['failed', 'partial', 'error'].includes(problem.status),
  );
  const unattempted = selectedCandidateProblems.filter(
    (problem) => problem.status === 'unattempted',
  );
  const selectedConcepts = uniqueItems(
    selectedCandidateProblems.flatMap((problem) => problem.concepts),
  );
  const referencedProblemIds = route
    ? uniqueItems(
        route.layers.flatMap((layer) => layer.nodes.flatMap((node) => node.problemIds || [])),
      )
    : [];
  const urgentConcepts = uniqueItems([
    ...openMemory.filter((item) => item.severity === 'high').map((item) => item.concept),
    ...failedConcepts,
  ]);
  const reviewedConcepts = completedConcepts.slice(0, 4);
  const supportConcepts = selectedConcepts.filter(
    (concept) => !urgentConcepts.includes(concept) && !reviewedConcepts.includes(concept),
  );
  const repairProblems = selectedCandidateProblems.filter((problem) =>
    problem.concepts.some((concept) => urgentConcepts.includes(concept)),
  );
  const routeReferenceLabel = route
    ? `${referencedProblemIds.length}/${selectedCandidateProblems.length} 题被路线引用`
    : '生成路线后检查 problemIds';

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="text-xs font-semibold uppercase tracking-normal text-slate-400">
              Notebook learning context
            </div>
            <h2 className="mt-1 text-xl font-semibold tracking-normal">
              这轮复习的核心判断：先修 open memory，再用候选题组织路线
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              学情不是一个总分，而是一组优先级：哪些记忆还
              open，上一轮哪里失败，题库里哪些题能承担返修和 Boss。
            </p>
          </div>
          <Badge variant={route ? 'secondary' : 'outline'} className="rounded-md">
            {routeReferenceLabel}
          </Badge>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-4 p-5">
          <div className="grid gap-3">
            <SignalPriorityRow
              level="P0"
              title="必须返修"
              description="open 私人记忆和上一轮失败概念决定本轮路线的主线。"
              tone="rose"
              items={urgentConcepts}
              meta={`${openMemory.length} 条 open memory · ${failedConcepts.length} 个历史失败概念`}
            />
            <SignalPriorityRow
              level="P1"
              title="进入本轮选题"
              description="错题、半对题和未尝试题优先进入 normal/elite/boss 的候选池。"
              tone="amber"
              items={supportConcepts.slice(0, 6)}
              meta={`${wrongOrPartial.length} 道错题/半对题 · ${unattempted.length} 道未尝试题`}
            />
            <SignalPriorityRow
              level="P2"
              title="降权巩固"
              description="已 reviewed 或上一轮已完成的概念只做低频巩固，避免路线重复。"
              tone="slate"
              items={reviewedConcepts}
              meta={`${reviewedMemory.length} 条 reviewed memory`}
            />
          </div>

          <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Route className="size-4 text-indigo-500" />
              选题决策链
            </div>
            <div className="grid gap-2 text-sm leading-6 md:grid-cols-4">
              <DecisionStep
                label="1. 私人记忆"
                value={openMemory.map((item) => item.concept).join('、') || '暂无'}
              />
              <DecisionStep label="2. 历史失败" value={failedConcepts.join('、') || '暂无'} />
              <DecisionStep
                label="3. 候选题"
                value={`${repairProblems.length} 道返修题 / ${selectedCandidateProblems.length} 道已选`}
              />
              <DecisionStep label="4. 路线引用" value={routeReferenceLabel} />
            </div>
          </div>
        </div>

        <aside className="border-t border-slate-100 bg-slate-50/70 p-5 lg:border-t-0 lg:border-l">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Target className="size-4 text-rose-500" />
            本轮选题样本
          </div>
          <div className="mt-3 grid gap-2">
            {selectedCandidateProblems.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-3 text-sm leading-6 text-slate-500">
                当前场景没有可选候选题，后续步骤应该提示先补题，而不是继续生成路线。
              </div>
            ) : null}
            {selectedCandidateProblems.slice(0, 5).map((problem) => (
              <div key={problem.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-950">
                      {problem.title}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {problem.id} · {problem.type} · {problem.difficulty}
                    </div>
                  </div>
                  <Badge className={cn('rounded-md border', statusToneClassName(problem.status))}>
                    {problem.status}
                  </Badge>
                </div>
                <p className="mt-2 text-xs font-medium leading-5 text-indigo-700">
                  {candidateReason(problem, privateMemory, reviewHistory)}
                </p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}

export function SignalPriorityRow({
  level,
  title,
  description,
  tone,
  items,
  meta,
}: {
  level: string;
  title: string;
  description: string;
  tone: 'rose' | 'amber' | 'slate';
  items: string[];
  meta: string;
}) {
  const toneClass =
    tone === 'rose'
      ? 'border-rose-200 bg-rose-50 text-rose-800'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-slate-200 bg-slate-50 text-slate-700';
  return (
    <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-[76px_1fr_auto] md:items-center">
      <div className={cn('w-fit rounded-md border px-2.5 py-1 text-sm font-semibold', toneClass)}>
        {level}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-950">{title}</div>
        <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(items.length ? items : ['暂无']).map((item) => (
            <Badge key={item} variant="outline" className="rounded-md bg-white">
              {item}
            </Badge>
          ))}
        </div>
      </div>
      <div className="text-sm font-medium text-slate-500 md:text-right">{meta}</div>
    </div>
  );
}

export function DecisionStep({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-xs font-semibold text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-medium text-slate-800">{value}</div>
    </div>
  );
}

export function ScenarioCoverageBar({
  activeScenarioId,
  onSelect,
}: {
  activeScenarioId: ReviewScenarioId;
  onSelect: (scenarioId: ReviewScenarioId) => void;
}) {
  return (
    <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-normal text-slate-400">
            Scenario matrix
          </div>
          <h2 className="mt-1 text-lg font-semibold tracking-normal">复习计划生成管线覆盖场景</h2>
        </div>
        <Badge variant="secondary" className="w-fit rounded-md">
          {Object.keys(REVIEW_SCENARIOS).length} 种测试场景
        </Badge>
      </div>
      <div className="grid gap-2 md:grid-cols-5">
        {Object.values(REVIEW_SCENARIOS).map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            onClick={() => onSelect(scenario.id)}
            className={cn(
              'rounded-xl border p-3 text-left text-sm transition',
              activeScenarioId === scenario.id
                ? 'border-indigo-300 bg-indigo-50 shadow-sm'
                : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-950">{scenario.title}</span>
              {activeScenarioId === scenario.id ? <Badge className="rounded-md">当前</Badge> : null}
            </div>
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
              {scenario.description}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-medium text-slate-500">
              <span className="rounded-md bg-white px-2 py-1">
                {scenario.memoryMode === 'full' ? '有记忆' : '无记忆'}
              </span>
              <span className="rounded-md bg-white px-2 py-1">
                {scenario.bankMode === 'full'
                  ? '题库充足'
                  : scenario.bankMode === 'empty'
                    ? '空题库'
                    : '题库不足'}
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
