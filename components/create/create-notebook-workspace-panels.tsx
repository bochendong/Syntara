'use client';

import type * as React from 'react';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Copy,
  FileText,
  FileUp,
  ListChecks,
  Loader2,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ImageNotebookBriefPlan } from '@/lib/generation/image-notebook-quality';
import { cn } from '@/lib/utils';
import {
  WORKSPACE_PROGRESS_STEPS,
  getWorkspaceProgressIndex,
  type PagePlanningPreview,
  type PlanningMockPhaseState,
  type PlanningPhase,
  type WorkspaceProgressStep,
  type WorkspaceStep,
} from './create-notebook-workspace-model';

function StepProgress({
  activeStep,
  planningPhase,
  streamingPhases = [],
  completedPhases = [],
  onStepSelect,
  className,
}: {
  activeStep: WorkspaceStep;
  planningPhase: PlanningPhase;
  streamingPhases?: PlanningPhase[];
  completedPhases?: PlanningPhase[];
  onStepSelect?: (step: WorkspaceProgressStep) => void;
  className?: string;
}) {
  const activeIndex = getWorkspaceProgressIndex(activeStep, planningPhase);
  return (
    <ol
      className={cn(
        'grid grid-cols-1 gap-2 rounded-2xl border border-slate-900/[0.07] bg-white/85 p-2 shadow-sm shadow-slate-950/[0.03] sm:grid-cols-3 lg:relative lg:flex lg:flex-col lg:items-start lg:gap-14 lg:border-0 lg:bg-transparent lg:p-0 lg:pl-1 lg:shadow-none lg:before:absolute lg:before:bottom-12 lg:before:left-5 lg:before:top-12 lg:before:border-l lg:before:border-dashed lg:before:border-slate-300/70 dark:border-white/[0.08] dark:bg-white/[0.04] dark:lg:bg-transparent dark:lg:before:border-white/15',
        className,
      )}
    >
      {WORKSPACE_PROGRESS_STEPS.map((step, index) => {
        const Icon = step.icon;
        const phases = step.planningPhases || (step.planningPhase ? [step.planningPhase] : []);
        const phaseComplete = phases.length
          ? phases.every((phase) => completedPhases.includes(phase))
          : false;
        const complete = index < activeIndex || phaseComplete;
        const active = index === activeIndex;
        const isStreaming = phases.some((phase) => streamingPhases.includes(phase));
        const content = (
          <>
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-lg lg:size-10 lg:rounded-full lg:shadow-sm',
                active
                  ? 'bg-white/15 text-white lg:bg-slate-950 lg:text-white lg:shadow-slate-950/20 dark:bg-slate-950/10 dark:text-slate-950 dark:lg:bg-white dark:lg:text-slate-950'
                  : complete
                    ? 'bg-teal-600 text-white'
                    : 'bg-white text-slate-500 ring-1 ring-slate-900/[0.06] dark:bg-white/[0.08] dark:text-slate-300',
              )}
            >
              {isStreaming ? (
                <Loader2 className="size-4 animate-spin" />
              ) : complete ? (
                <CheckCircle2 className="size-4" />
              ) : (
                <Icon className="size-4" />
              )}
            </span>
            <span className="min-w-0 lg:text-left">
              <span className="block text-[11px] leading-none opacity-70">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="mt-1 block truncate font-semibold lg:whitespace-normal lg:text-[12px] lg:leading-tight lg:text-clip">
                {step.label}
              </span>
            </span>
          </>
        );
        return (
          <li key={step.id} className="min-w-0 lg:w-full">
            <button
              type="button"
              className={cn(
                'relative z-10 flex h-12 w-full min-w-0 items-center gap-2 rounded-xl px-3 text-left text-xs transition-colors lg:h-auto lg:min-h-0 lg:w-auto lg:flex-row lg:justify-start lg:gap-3 lg:rounded-[22px] lg:px-0 lg:py-0 lg:text-left',
                active
                  ? 'bg-slate-950 text-white shadow-sm lg:bg-transparent lg:text-slate-950 lg:shadow-none dark:bg-white dark:text-slate-950 dark:lg:bg-transparent dark:lg:text-white'
                  : complete
                    ? 'bg-teal-50 text-teal-800 hover:bg-teal-100/80 lg:bg-transparent lg:text-teal-700 dark:bg-teal-500/10 dark:text-teal-200 dark:hover:bg-teal-500/15 dark:lg:bg-transparent'
                    : 'text-muted-foreground hover:bg-slate-100/70 lg:hover:bg-white/60 dark:hover:bg-white/[0.05] dark:lg:hover:bg-white/[0.06]',
              )}
              onClick={() => onStepSelect?.(step)}
            >
              {content}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function FieldShell({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-foreground">{label}</Label>
      {children}
      {hint ? <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function buildCourseSpineWriterText(
  courseSpine: ImageNotebookBriefPlan['courseSpine'] | null | undefined,
): string {
  if (!courseSpine) return '';

  const lines = [
    'courseSpine',
    '',
    `logline: ${courseSpine.logline || '等待写入…'}`,
    `centralQuestion: ${courseSpine.centralQuestion || '等待写入…'}`,
    '',
    'acts:',
  ];

  courseSpine.acts.forEach((act, index) => {
    lines.push(
      `${index + 1}. ${act.title || act.act}`,
      `   purpose: ${act.purpose || '等待写入…'}`,
      `   pages: ${act.pages.length ? act.pages.join(', ') : '待定'}`,
      act.keyQuestion ? `   keyQuestion: ${act.keyQuestion}` : '',
    );
  });

  lines.push('', `closingCallback: ${courseSpine.closingCallback || '等待写入…'}`);
  return lines.filter((line) => line !== '').join('\n');
}

function buildPlanningWriterText(page: PagePlanningPreview): string {
  const lines: string[] = [
    `第 ${String(page.pageNumber).padStart(2, '0')} 页｜${page.title}`,
    '',
    `教学动作：${page.currentJob}`,
  ];

  const appendList = (title: string, items: string[]) => {
    if (!items.length) return;
    lines.push('', `${title}：`);
    items.forEach((item, index) => lines.push(`${index + 1}. ${item}`));
  };

  appendList('页面上要真正写出来', page.mustShow);
  appendList('公式 / 符号', page.formulas);
  appendList('例题或证明步骤', page.exampleSteps);
  appendList('marker 组件', page.markerComponents);
  appendList('父级聚焦区域', page.focusRegions);
  appendList('易错点', page.commonPitfalls);

  if (page.bottomTakeaway) {
    lines.push('', `底部收束：${page.bottomTakeaway}`);
  }
  if (page.fromPrevious) {
    lines.push('', `承接上一页：${page.fromPrevious}`);
  }
  if (page.toNext) {
    lines.push(`引到下一页：${page.toNext}`);
  }
  if (page.visualBrief) {
    lines.push(`视觉意图：${page.visualBrief}`);
  }
  if (page.markerCount > 0) {
    lines.push('', `marker 校验目标：${page.markerCount} 个四角点`);
  }
  if (page.promptHash) {
    lines.push(`prompt hash：${page.promptHash}`);
  }

  return lines.join('\n');
}

function AnimatedTypewriterBlock({
  text,
  active,
  revision,
}: {
  text: string;
  active?: boolean;
  revision: number;
}) {
  if (!active) return <>{text}</>;
  return <AnimatedTypewriterBlockInner key={`${revision}-${text}`} text={text} />;
}

function AnimatedTypewriterBlockInner({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState('');

  useEffect(() => {
    let length = 0;
    const intervalId = window.setInterval(() => {
      length = Math.min(text.length, length + 8);
      setDisplayed(text.slice(0, length));
      if (length >= text.length) {
        window.clearInterval(intervalId);
      }
    }, 20);

    return () => window.clearInterval(intervalId);
  }, [text]);

  return (
    <>
      {displayed}
      {displayed.length < text.length ? (
        <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-full bg-blue-500 align-[-2px]" />
      ) : null}
    </>
  );
}

function compactPlanningItems(items?: string[]): string[] {
  return (items || []).map((item) => item.trim()).filter(Boolean);
}

function StructuredOutputSection({ label, items }: { label: string; items?: string[] }) {
  const list = compactPlanningItems(items);
  if (!list.length) return null;

  return (
    <div className="rounded-lg border border-slate-900/[0.06] bg-white/70 p-3 dark:border-white/[0.08] dark:bg-white/[0.04]">
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
      <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
        {list.map((item, index) => (
          <li key={`${label}-${index}`} className="flex gap-2">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-slate-400" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function getPlanningLoadingLabel(state?: PlanningMockPhaseState) {
  if (state === 'connecting') return '连接中';
  if (state === 'spine-loading') return '主线生成中';
  if (state === 'index-loading') return '索引生成中';
  if (state === 'index-first-page') return '索引生成中';
  return '生成中';
}

function PlanningLoadingBadge({ label = '生成中' }: { label?: string }) {
  return (
    <span className="inline-flex h-8 items-center rounded-lg border border-blue-500/20 bg-blue-50 px-2.5 text-xs font-medium text-blue-700 dark:border-blue-300/20 dark:bg-blue-300/[0.08] dark:text-blue-200">
      <Loader2 className="mr-1 size-3 animate-spin" />
      {label}
    </span>
  );
}

function SkeletonLine({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'block h-3 animate-pulse rounded-full bg-slate-200 dark:bg-white/[0.08]',
        className,
      )}
    />
  );
}

function PageIndexResultCard({
  page,
  action,
  loading,
  loadingLabel,
}: {
  page: PagePlanningPreview;
  action?: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-900/[0.07] bg-white p-3 shadow-sm shadow-slate-950/[0.02] dark:border-white/[0.08] dark:bg-white/[0.05]">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-xs font-semibold text-white dark:bg-white dark:text-slate-950">
          {String(page.pageNumber).padStart(2, '0')}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex flex-wrap items-center gap-2">
              {loading ? (
                <SkeletonLine className="h-4 w-52 max-w-full" />
              ) : (
                <h3 className="text-sm font-semibold leading-snug text-slate-950 dark:text-slate-50">
                  {page.title}
                </h3>
              )}
              {!loading && page.pageRole ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-white/[0.08] dark:text-slate-300">
                  {page.pageRole}
                </span>
              ) : null}
            </div>
            {loading ? (
              <div className="shrink-0">
                <PlanningLoadingBadge label={loadingLabel} />
              </div>
            ) : action ? (
              <div className="shrink-0">{action}</div>
            ) : null}
          </div>
          {loading ? (
            <div className="mt-2 space-y-2">
              <SkeletonLine className="w-full" />
              <SkeletonLine className="w-2/3" />
            </div>
          ) : (
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {page.currentJob}
            </p>
          )}
        </div>
      </div>
      {loading ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <SkeletonLine className="h-5 w-28" />
          <SkeletonLine className="h-5 w-36" />
          <SkeletonLine className="h-5 w-24" />
        </div>
      ) : compactPlanningItems(page.mustShow).length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {compactPlanningItems(page.mustShow).map((item, index) => (
            <span
              key={`${page.id}-must-${index}`}
              className="rounded-full bg-blue-50 px-2 py-1 text-[11px] leading-none text-blue-800 dark:bg-blue-400/10 dark:text-blue-200"
            >
              {item}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PageIndexLoadingPanel({ label }: { label?: string }) {
  return (
    <div className="h-full rounded-xl border border-blue-500/20 bg-blue-50/45 p-4 shadow-sm shadow-blue-950/[0.03] dark:border-blue-300/20 dark:bg-blue-300/[0.08]">
      <div className="flex items-center justify-between gap-3">
        <SkeletonLine className="h-4 w-40" />
        <PlanningLoadingBadge label={label} />
      </div>
      <div className="mt-5 space-y-3">
        <SkeletonLine className="h-4 w-3/4" />
        <SkeletonLine className="w-full" />
        <SkeletonLine className="w-5/6" />
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-900/[0.06] bg-white/70 p-3 dark:border-white/[0.08] dark:bg-white/[0.04]">
          <SkeletonLine className="h-3.5 w-24" />
          <SkeletonLine className="mt-3 w-full" />
          <SkeletonLine className="mt-2 w-2/3" />
        </div>
        <div className="rounded-lg border border-slate-900/[0.06] bg-white/70 p-3 dark:border-white/[0.08] dark:bg-white/[0.04]">
          <SkeletonLine className="h-3.5 w-28" />
          <SkeletonLine className="mt-3 w-5/6" />
          <SkeletonLine className="mt-2 w-1/2" />
        </div>
      </div>
    </div>
  );
}

function PagePromptResultCard({
  page,
  className,
  loading,
  onCopyPrompt,
}: {
  page: PagePlanningPreview;
  className?: string;
  loading?: boolean;
  onCopyPrompt?: () => void;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-900/[0.07] bg-white p-4 shadow-sm shadow-slate-950/[0.02] dark:border-white/[0.08] dark:bg-white/[0.05]',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {loading ? (
          <div className="min-w-0 flex-1 pt-1">
            <SkeletonLine className="h-4 w-64 max-w-full" />
          </div>
        ) : (
          <h3 className="min-w-0 flex-1 text-sm font-semibold leading-snug text-slate-950 dark:text-slate-50">
            {page.title}
          </h3>
        )}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-slate-950 px-2 py-1 text-[11px] font-semibold text-white dark:bg-white dark:text-slate-950">
              第 {String(page.pageNumber).padStart(2, '0')} 页
            </span>
            {!loading && page.pageRole ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-white/[0.08] dark:text-slate-300">
                {page.pageRole}
              </span>
            ) : null}
          </div>
          {!loading && page.batchLabel ? (
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200">
              {page.batchLabel}
            </span>
          ) : null}
          {!loading && page.drawingPrompt ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 rounded-lg px-2 text-[11px]"
              disabled={!onCopyPrompt}
              onClick={onCopyPrompt}
            >
              <Copy className="mr-1 size-3" />
              复制 prompt
            </Button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-3 dark:bg-black/20">
          <div className="space-y-2">
            <SkeletonLine className="w-full" />
            <SkeletonLine className="w-3/4" />
          </div>
        </div>
      ) : (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700 dark:bg-black/20 dark:text-slate-200">
          {page.currentJob}
        </p>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {loading ? (
          <>
            {['必须写出', '公式 / 符号', '完整步骤', '避免'].map((label) => (
              <div
                key={label}
                className="rounded-lg border border-slate-900/[0.06] bg-white/70 p-3 dark:border-white/[0.08] dark:bg-white/[0.04]"
              >
                <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
                <div className="mt-3 space-y-2">
                  <SkeletonLine className="w-full" />
                  <SkeletonLine className="w-2/3" />
                </div>
              </div>
            ))}
          </>
        ) : (
          <>
            <StructuredOutputSection label="必须写出" items={page.mustShow} />
            <StructuredOutputSection label="公式 / 符号" items={page.formulas} />
            <StructuredOutputSection label="完整步骤" items={page.exampleSteps} />
            <StructuredOutputSection label="避免" items={page.commonPitfalls} />
          </>
        )}
      </div>

      {!loading && page.bottomTakeaway ? (
        <div className="mt-3 rounded-lg border border-amber-400/20 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
          <span className="font-semibold">收束：</span>
          {page.bottomTakeaway}
        </div>
      ) : null}

      {!loading && (page.markerComponents.length > 0 || page.markerCount > 0 || page.promptHash) ? (
        <div className="mt-3 rounded-lg border border-slate-900/[0.06] bg-white/70 px-3 py-2 text-xs leading-relaxed dark:border-white/[0.08] dark:bg-white/[0.04]">
          <div className="flex flex-wrap items-center gap-2">
            {page.markerCount > 0 ? (
              <span className="rounded-full bg-slate-950 px-2 py-1 text-[10px] font-semibold text-white dark:bg-white dark:text-slate-950">
                marker {page.markerCount}
              </span>
            ) : null}
            {page.promptHash ? (
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600 dark:bg-white/[0.08] dark:text-slate-300">
                {page.promptHash}
              </span>
            ) : null}
          </div>
          {page.markerComponents.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {page.markerComponents.map((component, index) => (
                <span
                  key={`${page.id}-marker-${index}`}
                  className="rounded-full bg-blue-50 px-2 py-1 text-[10px] leading-none text-blue-800 dark:bg-blue-400/10 dark:text-blue-200"
                >
                  {component}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {!loading && page.drawingPrompt ? (
        <details className="mt-3 rounded-lg border border-slate-900/[0.06] bg-slate-50/80 p-3 dark:border-white/[0.08] dark:bg-black/20">
          <summary className="cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-200">
            最终图片 prompt
          </summary>
          <Textarea
            readOnly
            value={page.drawingPrompt}
            className="mt-3 max-h-80 min-h-[180px] resize-y rounded-lg bg-white/90 font-mono text-[11px] leading-relaxed dark:bg-black/30"
          />
        </details>
      ) : null}
    </div>
  );
}

function CourseSpineSummaryPanel({
  courseSpine,
  action,
  loading,
  loadingLabel,
}: {
  courseSpine?: ImageNotebookBriefPlan['courseSpine'] | null;
  action?: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
}) {
  return (
    <div className="h-full overflow-y-auto rounded-xl border border-slate-900/[0.07] bg-white p-4 shadow-sm shadow-slate-950/[0.02] dark:border-white/[0.08] dark:bg-white/[0.05]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold text-muted-foreground">整课主线</p>
        {loading ? (
          <div className="shrink-0">
            <PlanningLoadingBadge label={loadingLabel} />
          </div>
        ) : action ? (
          <div className="shrink-0">{action}</div>
        ) : null}
      </div>
      {loading ? (
        <div className="mt-3 space-y-3">
          <div className="space-y-2">
            <SkeletonLine className="h-4 w-full" />
            <SkeletonLine className="h-4 w-5/6" />
          </div>
          <div className="space-y-2">
            <SkeletonLine className="w-full" />
            <SkeletonLine className="w-3/4" />
          </div>
          <div className="mt-4 rounded-lg bg-slate-50 px-3 py-4 dark:bg-black/20">
            <SkeletonLine className="h-3.5 w-2/3" />
            <SkeletonLine className="mt-3 w-full" />
            <SkeletonLine className="mt-2 w-1/2" />
          </div>
        </div>
      ) : (
        <>
          <h3 className="mt-2 text-base font-semibold leading-snug text-slate-950 dark:text-slate-50">
            {courseSpine?.logline || '页面规划已完成'}
          </h3>
          {courseSpine?.centralQuestion ? (
            <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
              {courseSpine.centralQuestion}
            </p>
          ) : null}
        </>
      )}
      {!loading && courseSpine?.acts?.length ? (
        <div className="mt-4 grid gap-2">
          {courseSpine.acts.map((act, index) => (
            <div
              key={`${act.act || act.title}-${index}`}
              className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-black/20"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {act.title || act.act}
                </p>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-500 dark:bg-white/[0.08] dark:text-slate-300">
                  {act.pages.length ? `页 ${act.pages.join(', ')}` : '页待定'}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {act.purpose}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StructuredPlanningOutput({
  phase,
  pages,
  courseSpine,
  selectedPage,
  onPageSelect,
  onCopyPrompt,
  action,
  loadingState,
}: {
  phase: PlanningPhase;
  pages: PagePlanningPreview[];
  courseSpine?: ImageNotebookBriefPlan['courseSpine'] | null;
  selectedPage?: PagePlanningPreview;
  onPageSelect?: (pageId: string) => void;
  onCopyPrompt?: (page: PagePlanningPreview) => void;
  action?: ReactNode;
  loadingState?: PlanningMockPhaseState;
}) {
  const isLoading = Boolean(loadingState && loadingState !== 'input' && loadingState !== 'done');
  const spineLoading = loadingState === 'connecting' || loadingState === 'spine-loading';
  const loadingLabel = getPlanningLoadingLabel(loadingState);
  const pageIndexLoadingLabel = loadingState === 'spine-loading' ? '等待索引生成中' : loadingLabel;
  const showPageIndexLoadingCards =
    loadingState === 'index-loading' || loadingState === 'index-first-page';
  const visibleGeneratedIndexCount = loadingState === 'index-first-page' ? 1 : 0;
  const sortedPages = pages
    .slice()
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .filter((page) => page.title || page.currentJob);
  const selectedPageIndex = Math.max(
    0,
    sortedPages.findIndex((page) => page.id === selectedPage?.id),
  );
  const currentPage = sortedPages[selectedPageIndex] || selectedPage || sortedPages[0];

  if (phase === 'course-spine') {
    return (
      <div className="grid min-h-0 flex-1 gap-4 bg-white/80 p-4 lg:grid-cols-[0.34fr_0.66fr] dark:bg-black/30">
        <section className="min-h-0">
          <CourseSpineSummaryPanel
            courseSpine={courseSpine}
            action={action}
            loading={spineLoading}
            loadingLabel={loadingLabel}
          />
        </section>
        <section className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {showPageIndexLoadingCards ? (
              <div className="grid gap-2">
                {sortedPages.map((page, index) => (
                  <PageIndexResultCard
                    key={page.id}
                    page={page}
                    action={action}
                    loading={index >= visibleGeneratedIndexCount}
                    loadingLabel="索引生成中"
                  />
                ))}
              </div>
            ) : isLoading ? (
              <PageIndexLoadingPanel label={pageIndexLoadingLabel} />
            ) : (
              <div className="grid gap-2">
                {sortedPages.map((page) => (
                  <PageIndexResultCard key={page.id} page={page} action={action} />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    );
  }

  if (!currentPage) {
    return <div className="min-h-0 flex-1 bg-white/80 dark:bg-black/30" />;
  }

  const goToPage = (direction: -1 | 1) => {
    const nextPage = sortedPages[selectedPageIndex + direction];
    if (nextPage) onPageSelect?.(nextPage.id);
  };

  return (
    <div className="grid min-h-0 flex-1 gap-4 bg-white/80 p-4 lg:grid-cols-[0.34fr_0.66fr] dark:bg-black/30">
      <section className="min-h-0">
        <CourseSpineSummaryPanel
          courseSpine={courseSpine}
          action={action}
          loading={spineLoading}
          loadingLabel={loadingLabel}
        />
      </section>
      <section className="flex min-h-0 flex-col">
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
          <p className="text-xs font-medium text-muted-foreground">
            第 {selectedPageIndex + 1} / {sortedPages.length} 页
          </p>
          <div className="flex items-center gap-2">
            {isLoading ? <PlanningLoadingBadge label={loadingLabel} /> : action}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-lg px-2.5 text-xs"
              disabled={selectedPageIndex <= 0}
              onClick={() => goToPage(-1)}
            >
              <ArrowLeft className="mr-1 size-3.5" />
              上一页
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-lg px-2.5 text-xs"
              disabled={selectedPageIndex >= sortedPages.length - 1}
              onClick={() => goToPage(1)}
            >
              下一页
              <ArrowRight className="ml-1 size-3.5" />
            </Button>
          </div>
        </div>
        <PagePromptResultCard
          page={currentPage}
          loading={isLoading}
          onCopyPrompt={() => onCopyPrompt?.(currentPage)}
          className="min-h-0 flex-1 overflow-y-auto border-blue-500/25 bg-blue-50/55 dark:border-blue-300/20 dark:bg-blue-300/[0.08]"
        />
      </section>
    </div>
  );
}

function PlanningStreamBox({
  page,
  mockText,
  stepText,
  structured,
  loadingState,
  phase = 'course-spine',
  pages = [],
  courseSpine,
  selectedPage,
  onPageSelect,
  onCopyPrompt,
  active,
  revision,
  action,
}: {
  page?: PagePlanningPreview;
  mockText?: string;
  stepText?: string;
  structured?: boolean;
  loadingState?: PlanningMockPhaseState;
  phase?: PlanningPhase;
  pages?: PagePlanningPreview[];
  courseSpine?: ImageNotebookBriefPlan['courseSpine'] | null;
  selectedPage?: PagePlanningPreview;
  onPageSelect?: (pageId: string) => void;
  onCopyPrompt?: (page: PagePlanningPreview) => void;
  active?: boolean;
  revision: number;
  action?: ReactNode;
}) {
  const isStepStream = mockText !== undefined || stepText !== undefined;
  const text = isStepStream
    ? (stepText ?? mockText ?? '')
    : page
      ? buildPlanningWriterText(page)
      : '';
  const showStructured = Boolean(structured || loadingState);

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden rounded-xl border transition-colors',
        active
          ? 'border-blue-500/30 bg-blue-50/80 shadow-sm shadow-blue-950/[0.04] dark:border-blue-300/25 dark:bg-blue-300/[0.08]'
          : 'border-slate-900/[0.06] bg-slate-50/80 dark:border-white/[0.08] dark:bg-white/[0.04]',
      )}
    >
      {!showStructured ? (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-900/[0.06] px-4 py-3 dark:border-white/[0.08]">
          <p className="text-xs font-semibold text-muted-foreground">
            {isStepStream ? '当前阶段模型输出' : '当前页规划'}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {action}
            {active ? (
              <span className="inline-flex items-center rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white">
                <Loader2 className="mr-1 size-3 animate-spin" />
                正在接收
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      {showStructured ? (
        <StructuredPlanningOutput
          phase={phase}
          pages={pages}
          courseSpine={courseSpine}
          selectedPage={selectedPage}
          onPageSelect={onPageSelect}
          onCopyPrompt={onCopyPrompt}
          action={action}
          loadingState={loadingState}
        />
      ) : (
        <pre className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap bg-white/80 p-5 font-mono text-sm leading-7 text-slate-950 dark:bg-black/30 dark:text-slate-100">
          {isStepStream ? (
            <>
              {text}
              {active ? (
                <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-full bg-blue-500 align-[-2px]" />
              ) : null}
            </>
          ) : (
            <AnimatedTypewriterBlock text={text} active={active} revision={revision} />
          )}
        </pre>
      )}
    </div>
  );
}

function PromptPreviewPanel({
  title,
  description,
  value,
  onCopy,
  minHeight = 'min-h-[220px]',
}: {
  title: string;
  description: string;
  value: string;
  onCopy: () => void;
  minHeight?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-900/[0.07] bg-slate-50/70 p-3 dark:border-white/[0.08] dark:bg-white/[0.04]">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 rounded-lg"
          disabled={!value}
          onClick={onCopy}
        >
          <Copy className="mr-1.5 size-3.5" />
          复制
        </Button>
      </div>
      <Textarea
        readOnly
        value={value}
        className={cn(
          minHeight,
          'resize-y rounded-lg bg-white/90 font-mono text-xs leading-relaxed dark:bg-black/30',
        )}
      />
    </div>
  );
}

type PipelineInputSection = {
  title: string;
  lines: string[];
};

function parsePipelineInputSections(value: string): PipelineInputSection[] {
  return value
    .split(/\n\s*\n/g)
    .map((block) =>
      block
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    )
    .filter((lines) => lines.length > 0)
    .map((lines) => {
      const first = lines[0] || '';
      if (first.endsWith('：') || first.endsWith(':')) {
        return {
          title: first.replace(/[：:]$/, ''),
          lines: lines.slice(1),
        };
      }
      return {
        title: first,
        lines: lines.slice(1),
      };
    });
}

function mergePipelineInputSourceSections(
  sections: PipelineInputSection[],
): PipelineInputSection[] {
  const merged: PipelineInputSection[] = [];
  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index];
    const next = sections[index + 1];
    if (section?.title.includes('用户输入') && next?.title.includes('来源流')) {
      merged.push({
        title: '输入与来源',
        lines: [
          `用户输入：${section.lines.join('；') || '等待输入…'}`,
          `来源流：${next.lines.join('；') || '等待来源…'}`,
        ],
      });
      index += 1;
      continue;
    }
    merged.push(section);
  }
  return merged;
}

function PipelineSectionIcon({ title, className }: { title: string; className?: string }) {
  if (title.includes('用户') || title.includes('输入')) return <Sparkles className={className} />;
  if (title.includes('来源') || title.includes('文件')) return <FileUp className={className} />;
  if (title.includes('任务') || title.includes('规划')) return <ListChecks className={className} />;
  if (title.includes('约束') || title.includes('必须'))
    return <CheckCircle2 className={className} />;
  if (title.includes('风格') || title.toLowerCase().includes('prompt'))
    return <Wand2 className={className} />;
  return <FileText className={className} />;
}

function PipelineLine({ line }: { line: string }) {
  const match = line.match(/^([^：:]{2,12})[：:](.+)$/);
  if (match) {
    return (
      <div className="rounded-lg bg-slate-50/80 px-3 py-2 text-xs leading-relaxed dark:bg-white/[0.04]">
        <span className="font-semibold text-slate-700 dark:text-slate-200">{match[1]}：</span>
        <span className="text-slate-600 dark:text-slate-300">{match[2].trim()}</span>
      </div>
    );
  }
  return (
    <div className="flex gap-2 rounded-lg bg-slate-50/70 px-3 py-2 text-xs leading-relaxed text-slate-600 dark:bg-white/[0.04] dark:text-slate-300">
      <span className="mt-[0.45em] size-1.5 shrink-0 rounded-full bg-blue-500/60" />
      <span>{line.replace(/^\d+\.\s*/, '')}</span>
    </div>
  );
}

function PipelineTextPanel({ value, active }: { value: string; active?: boolean }) {
  const sections = mergePipelineInputSourceSections(parsePipelineInputSections(value));
  const [selectedSectionIndex, setSelectedSectionIndex] = useState(0);
  const visibleSectionIndex = Math.min(selectedSectionIndex, Math.max(sections.length - 1, 0));
  const selectedSection = sections[visibleSectionIndex] ?? sections[0];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-900/[0.07] bg-white/88 shadow-sm shadow-slate-950/[0.03] dark:border-white/[0.08] dark:bg-black/20">
      <div className="flex min-h-0 flex-1 flex-col bg-slate-50/70 p-4 dark:bg-black/25">
        {sections.length > 0 ? (
          <>
            <div className="mb-3 flex shrink-0 gap-2 overflow-x-auto pb-1">
              {sections.map((section, index) => {
                const selected = index === visibleSectionIndex;
                return (
                  <button
                    key={`${section.title}-${index}`}
                    type="button"
                    className={cn(
                      'inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-xs font-medium transition',
                      selected
                        ? 'border-slate-950 bg-slate-950 text-white shadow-sm dark:border-white dark:bg-white dark:text-slate-950'
                        : 'border-slate-900/[0.07] bg-white/80 text-slate-600 hover:border-blue-300 hover:text-slate-950 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-300 dark:hover:text-white',
                    )}
                    onClick={() => setSelectedSectionIndex(index)}
                  >
                    <PipelineSectionIcon title={section.title} className="size-3.5" />
                    <span>{section.title}</span>
                  </button>
                );
              })}
            </div>
            <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-900/[0.06] bg-white/92 p-4 shadow-sm shadow-slate-950/[0.03] dark:border-white/[0.08] dark:bg-white/[0.04]">
              <div className="mb-4 flex shrink-0 items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-600/10 dark:bg-blue-300/[0.08] dark:text-blue-200">
                    <PipelineSectionIcon
                      title={selectedSection?.title ?? ''}
                      className="size-4.5"
                    />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold">{selectedSection?.title}</h3>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-white/[0.08] dark:text-slate-300">
                        {visibleSectionIndex + 1} / {sections.length}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      选择上方标签查看当前生成输入的不同部分。
                    </p>
                  </div>
                </div>
                {active ? (
                  <span className="inline-flex shrink-0 items-center rounded-full bg-blue-600 px-2.5 py-1 text-[10px] font-medium text-white">
                    <Loader2 className="mr-1 size-3 animate-spin" />
                    生成中
                  </span>
                ) : null}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <div
                  className={cn(
                    'grid gap-2',
                    selectedSection?.title === '输入与来源' && 'sm:grid-cols-2',
                    (selectedSection?.lines.length ?? 0) > 4 && 'xl:grid-cols-2',
                  )}
                >
                  {selectedSection?.lines.length ? (
                    selectedSection.lines.map((line, lineIndex) => (
                      <PipelineLine key={`${selectedSection.title}-${lineIndex}`} line={line} />
                    ))
                  ) : (
                    <p className="rounded-lg bg-slate-50/80 px-3 py-2 text-xs text-muted-foreground dark:bg-white/[0.04]">
                      等待输入…
                    </p>
                  )}
                </div>
              </div>
            </section>
          </>
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-900/[0.08] bg-white/70 text-sm text-muted-foreground dark:border-white/[0.08] dark:bg-white/[0.04]">
            等待输入…
          </div>
        )}
      </div>
    </div>
  );
}

export {
  StepProgress,
  FieldShell,
  buildCourseSpineWriterText,
  buildPlanningWriterText,
  PlanningStreamBox,
  PromptPreviewPanel,
  PipelineTextPanel,
};
