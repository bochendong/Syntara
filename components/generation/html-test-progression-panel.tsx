'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, Layers3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  HTML_GENERATION_PIPELINE,
  getHtmlTestNeighbors,
  HTML_TEST_PROGRESSION,
  type HtmlTestStageId,
} from '@/lib/generation/html-test-progression';
import { cn } from '@/lib/utils';

type ProgressStatus = {
  generatedCount?: number;
  errorCount?: number;
  lastUpdatedAt?: number | null;
};

function formatStatusTime(value: number | null | undefined): string {
  if (!value) return '暂无保存';
  return new Date(value).toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function HtmlTestProgressionPanel({
  currentStageId,
  statusByStage,
  compact = false,
  className,
}: {
  currentStageId?: HtmlTestStageId;
  statusByStage?: Partial<Record<HtmlTestStageId, ProgressStatus>>;
  compact?: boolean;
  className?: string;
}) {
  const neighbors = currentStageId ? getHtmlTestNeighbors(currentStageId) : null;

  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm',
        className,
      )}
    >
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
            <Layers3 className="size-4" />
            HTML 输出回归入口
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            这是按输入粒度归类的回归入口，不是实际生成顺序。真正的生成顺序是 Source Package →
            coursePlan → slideOutlines → htmlPrompt → HTML。
          </p>
        </div>
        <Badge variant="secondary" className="w-fit rounded-md">
          regression
        </Badge>
      </div>

      <div className="grid divide-y divide-slate-100 md:grid-cols-4 md:divide-x md:divide-y-0">
        {HTML_TEST_PROGRESSION.map((stage) => {
          const active = stage.id === currentStageId;
          const status = statusByStage?.[stage.id];
          return (
            <Link
              key={stage.id}
              href={stage.href}
              className={cn(
                'group flex min-h-full flex-col gap-3 px-4 py-4 transition hover:bg-slate-50',
                active && 'bg-blue-50/80 hover:bg-blue-50',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                      active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500',
                    )}
                  >
                    {stage.order}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-950">
                      {stage.shortTitle}
                    </div>
                    <div className="truncate text-[11px] font-medium text-slate-400">
                      {stage.eyebrow}
                    </div>
                  </div>
                </div>
                {active ? (
                  <Badge variant="default" className="shrink-0 rounded-md">
                    当前
                  </Badge>
                ) : (
                  <ArrowRight className="size-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-600" />
                )}
              </div>

              <p className="text-xs leading-5 text-slate-600">{stage.proves}</p>

              {status ? (
                <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-100 bg-white/70 px-2 py-2 text-[11px]">
                  <div>
                    <div className="font-medium text-slate-400">通过</div>
                    <div className="mt-0.5 font-semibold text-slate-900">
                      {status.generatedCount || 0}
                    </div>
                  </div>
                  <div>
                    <div className="font-medium text-slate-400">失败</div>
                    <div
                      className={cn(
                        'mt-0.5 font-semibold',
                        status.errorCount ? 'text-rose-600' : 'text-slate-900',
                      )}
                    >
                      {status.errorCount || 0}
                    </div>
                  </div>
                  <div>
                    <div className="font-medium text-slate-400">最近</div>
                    <div className="mt-0.5 truncate font-semibold text-slate-900">
                      {formatStatusTime(status.lastUpdatedAt)}
                    </div>
                  </div>
                </div>
              ) : null}
            </Link>
          );
        })}
      </div>

      {neighbors ? (
        <div className="border-t border-slate-100 px-4 py-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="grid gap-3 text-sm md:grid-cols-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  输入范围
                </div>
                <p className="mt-1 leading-6 text-slate-700">{neighbors.current.inputContract}</p>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  本入口检查
                </div>
                <p className="mt-1 leading-6 text-slate-700">{neighbors.current.gate}</p>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  可复用结论
                </div>
                <p className="mt-1 leading-6 text-slate-700">{neighbors.current.promotes}</p>
              </div>
            </div>

            {!compact ? (
              <div className="flex flex-wrap gap-2 lg:justify-end">
                {neighbors.previous ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={neighbors.previous.href}>
                      <ChevronLeft className="size-4" />
                      较小粒度：{neighbors.previous.shortTitle}
                    </Link>
                  </Button>
                ) : null}
                {neighbors.next ? (
                  <Button asChild size="sm">
                    <Link href={neighbors.next.href}>
                      较大粒度：{neighbors.next.shortTitle}
                      <ChevronRight className="size-4" />
                    </Link>
                  </Button>
                ) : (
                  <Badge variant="outline" className="rounded-md px-3 py-1.5">
                    <CheckCircle2 className="mr-1 inline size-4" />
                    最高层级
                  </Badge>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function HtmlGenerationPipelinePanel({
  activePhase,
  className,
}: {
  activePhase?: (typeof HTML_GENERATION_PIPELINE)[number]['id'];
  className?: string;
}) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm',
        className,
      )}
    >
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
            <Layers3 className="size-4" />
            HTML 生成管线
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            真正的递进生成顺序：先读取 Source Package，再形成课程级规划，再拆页，再把每页降解成 HTML
            生成契约，最后做页面 QA。
          </p>
        </div>
        <Badge variant="secondary" className="w-fit rounded-md">
          plan first
        </Badge>
      </div>

      <div className="grid divide-y divide-slate-100 lg:grid-cols-6 lg:divide-x lg:divide-y-0">
        {HTML_GENERATION_PIPELINE.map((phase) => {
          const active = phase.id === activePhase;
          return (
            <div
              key={phase.id}
              className={cn(
                'flex min-h-full flex-col gap-3 px-4 py-4',
                active && 'bg-emerald-50/80',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                      active ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500',
                    )}
                  >
                    {phase.order}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-950">
                      {phase.title}
                    </div>
                    <div className="truncate text-[11px] font-medium text-slate-400">
                      {phase.artifact}
                    </div>
                  </div>
                </div>
                {active ? (
                  <Badge variant="default" className="shrink-0 rounded-md bg-emerald-600">
                    当前
                  </Badge>
                ) : null}
              </div>
              <p className="text-xs leading-5 text-slate-600">{phase.purpose}</p>
              <div className="mt-auto rounded-lg border border-slate-100 bg-slate-50 px-2 py-2 text-[11px] leading-5 text-slate-500">
                {phase.handoff}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
