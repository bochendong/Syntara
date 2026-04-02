'use client';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import type { NotebookGenerationProgress } from '@/lib/create/run-notebook-generation-task';
import { StepVisualizer } from '@/app/generation-preview/components/visualizers';
import { ALL_STEPS } from '@/app/generation-preview/types';
import { COURSE_ORCHESTRATOR_NAME, resolveCourseOrchestratorAvatar } from '@/lib/constants/course-chat';
import { useCurrentCourseStore } from '@/lib/store/current-course';

function OrchestratorProgressAvatar() {
  const courseId = useCurrentCourseStore((s) => s.id);
  const courseAvatarUrl = useCurrentCourseStore((s) => s.avatarUrl);
  const src = resolveCourseOrchestratorAvatar(courseId, courseAvatarUrl).trim();
  const isImage =
    src.startsWith('/') || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:');
  if (isImage) {
    return (
      <img
        src={src}
        alt=""
        className="size-9 shrink-0 rounded-full object-cover ring-1 ring-black/5 dark:ring-white/10"
      />
    );
  }
  return (
    <div
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-sm font-medium text-violet-800 ring-1 ring-black/5 dark:text-violet-200 dark:ring-white/10"
      title={COURSE_ORCHESTRATOR_NAME}
      aria-hidden
    >
      {(src || COURSE_ORCHESTRATOR_NAME).slice(0, 1)}
    </div>
  );
}

function progressToVisualizerStepId(p: NotebookGenerationProgress): string {
  if (p.stage === 'completed') return 'outline';
  switch (p.stage) {
    case 'preparing':
      return 'outline';
    case 'pdf-analysis':
      return 'pdf-analysis';
    case 'research':
      return 'web-search';
    case 'metadata':
      return 'agent-generation';
    case 'notebook-ready':
      return 'outline';
    case 'agents':
      return 'agent-generation';
    case 'outline':
      return 'outline';
    case 'scene':
      return 'slide-content';
    case 'saving':
      return 'actions';
    default:
      return 'outline';
  }
}

function progressMotionKey(p: NotebookGenerationProgress): string {
  if (p.stage === 'scene') {
    return `${p.stage}-${p.completed}`;
  }
  if (p.stage === 'notebook-ready') {
    return `${p.stage}-${p.notebookId}`;
  }
  return p.stage;
}

export function OrchestratorNotebookProgressPanel({
  progress,
  className,
  onCancel,
  cancelPending = false,
}: {
  progress: NotebookGenerationProgress;
  className?: string;
  onCancel?: () => void;
  cancelPending?: boolean;
}) {
  const { t } = useI18n();
  const stepId = progressToVisualizerStepId(progress);
  const stepMeta = ALL_STEPS.find((s) => s.id === stepId);
  const title = stepMeta ? t(stepMeta.title) : progress.detail;
  const webSearchSources =
    progress.stage === 'research' && progress.sources?.length
      ? progress.sources.map((s) => ({ title: s.title, url: s.url }))
      : undefined;
  const notebookLinkId = progress.stage === 'completed' ? progress.notebookId?.trim() : undefined;

  return (
    <div className={cn('flex items-start gap-2', className)} role="status" aria-live="polite">
      <OrchestratorProgressAvatar />
      <div className="w-full max-w-[min(100%,640px)] rounded-xl border border-slate-900/[0.08] bg-white/85 px-3 py-3 shadow-sm dark:border-white/[0.1] dark:bg-black/35">
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="relative flex h-[148px] w-full max-w-[200px] shrink-0 items-center justify-center sm:h-[160px] sm:max-w-[220px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={progressMotionKey(progress)}
                initial={{ opacity: 0, scale: 0.92, filter: 'blur(6px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 1.04, filter: 'blur(6px)' }}
                transition={{ duration: 0.38 }}
                className="flex w-full items-center justify-center"
              >
                <StepVisualizer
                  stepId={stepId}
                  outlines={[]}
                  webSearchSources={webSearchSources}
                />
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{progress.detail}</p>
            {progress.stage === 'scene' ? (
              <p className="mt-2 text-[11px] tabular-nums text-muted-foreground">
                页面 {progress.completed + 1} / {progress.total}
              </p>
            ) : null}
            {notebookLinkId ? (
              <Link
                href={`/classroom/${encodeURIComponent(notebookLinkId)}`}
                className="mt-2 inline-flex rounded-full border border-violet-500/25 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-500/15 dark:text-violet-200"
              >
                查看笔记本
              </Link>
            ) : null}
            {onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                disabled={cancelPending}
                className="mt-2 inline-flex rounded-full border border-rose-500/20 bg-rose-500/8 px-3 py-1 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-60 dark:text-rose-200"
              >
                {cancelPending ? '正在取消…' : '取消任务'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 本地进度状态丢失时，用任务 API 上的 detail 与侧栏「进行中」对齐 */
export function OrchestratorRemoteTaskBanner({
  detail,
  className,
  onCancel,
  cancelPending = false,
}: {
  detail: string;
  className?: string;
  onCancel?: () => void;
  cancelPending?: boolean;
}) {
  return (
    <div className={cn('flex items-start gap-2', className)} role="status" aria-live="polite">
      <OrchestratorProgressAvatar />
      <div className="w-full max-w-[min(100%,640px)] rounded-xl border border-slate-900/[0.08] bg-white/85 px-3 py-3 shadow-sm dark:border-white/[0.1] dark:bg-black/35">
        <div className="flex items-start gap-2.5">
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">笔记本生成进行中</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</p>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              还在后台生成中。完成后，这里会自动出现“查看笔记本”入口。
            </p>
            {onCancel ? (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={cancelPending}
                  className="inline-flex rounded-full border border-rose-500/20 bg-rose-500/8 px-3 py-1 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-60 dark:text-rose-200"
                >
                  {cancelPending ? '正在取消…' : '取消任务'}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
