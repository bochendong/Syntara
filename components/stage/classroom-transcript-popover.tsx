'use client';

import { BookOpen, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Scene } from '@/lib/types/stage';
import type { SpeechAction } from '@/lib/types/action';

interface TranscriptSegment {
  readonly id: string;
  readonly label: string;
  readonly text: string;
}

interface ClassroomTranscriptButtonProps {
  readonly scene?: Scene | null;
  readonly open: boolean;
  readonly disabled?: boolean;
  readonly onToggle: () => void;
}

interface ClassroomTranscriptSidebarProps {
  readonly scene?: Scene | null;
  readonly sceneIndex: number;
  readonly totalScenes: number;
  readonly currentSpeechActionId?: string | null;
  readonly open: boolean;
  readonly onClose: () => void;
}

function speechSegmentsForScene(scene: Scene | null | undefined): TranscriptSegment[] {
  if (!scene) return [];
  let speechIndex = 0;

  return (scene.actions ?? [])
    .filter((action): action is SpeechAction => action.type === 'speech')
    .map((action) => {
      speechIndex += 1;
      return {
        id: action.id,
        label: action.title?.trim() || `第 ${speechIndex} 段`,
        text: action.text?.trim() || '',
      };
    })
    .filter((segment) => segment.text.length > 0);
}

function sceneTitle(scene: Scene | null | undefined, pageNumber: number): string {
  const title = scene?.title?.trim();
  return title || `第 ${pageNumber} 页`;
}

export function ClassroomTranscriptButton({
  scene,
  open,
  disabled,
  onToggle,
}: ClassroomTranscriptButtonProps) {
  const segments = speechSegmentsForScene(scene);

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        'inline-flex h-9 max-w-[min(100%,14rem)] shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-all duration-200 ease-out',
        'focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
        'disabled:cursor-not-allowed disabled:opacity-45',
        open
          ? 'border-indigo-300 bg-indigo-100 text-indigo-950 shadow-sm dark:border-indigo-400/35 dark:bg-indigo-950/55 dark:text-indigo-100'
          : 'border-slate-200 bg-white/80 text-slate-700 hover:-translate-y-0.5 hover:bg-indigo-50 hover:text-indigo-700 hover:shadow-sm dark:border-white/[0.1] dark:bg-white/[0.05] dark:text-slate-200 dark:hover:bg-indigo-950/35 dark:hover:text-indigo-100',
      )}
      aria-expanded={open}
      aria-controls="classroom-transcript-sidebar"
      aria-label={open ? '关闭讲解稿' : '查看讲解稿'}
    >
      <BookOpen className="size-4 shrink-0" aria-hidden />
      <span className="truncate">讲解稿</span>
      <span
        className={cn(
          'rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
          open
            ? 'bg-white/70 text-indigo-800 dark:bg-white/12 dark:text-indigo-100'
            : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300',
        )}
      >
        {segments.length} 段
      </span>
    </button>
  );
}

export function ClassroomTranscriptSidebar({
  scene,
  sceneIndex,
  totalScenes,
  currentSpeechActionId,
  open,
  onClose,
}: ClassroomTranscriptSidebarProps) {
  if (!open) return null;

  const pageNumber = sceneIndex >= 0 ? sceneIndex + 1 : 1;
  const title = sceneTitle(scene, pageNumber);
  const segments = speechSegmentsForScene(scene);

  return (
    <aside
      id="classroom-transcript-sidebar"
      aria-label="当前页讲解稿"
      className={cn(
        'flex h-full min-h-0 w-[19rem] shrink-0 flex-col border-l border-slate-200/80 bg-white/96 shadow-[-16px_0_40px_rgba(15,23,42,0.08)] backdrop-blur-xl',
        'dark:border-white/10 dark:bg-slate-950/92 dark:shadow-[-16px_0_42px_rgba(0,0,0,0.24)]',
      )}
    >
      <header className="shrink-0 border-b border-slate-200/70 px-4 py-3 dark:border-white/10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">讲解稿</p>
            <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
              第 {pageNumber} / {Math.max(totalScenes, pageNumber)} 页 · {segments.length} 段讲解
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-100"
            aria-label="关闭讲解稿"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2 dark:border-sky-400/15 dark:bg-sky-400/10">
          <p className="truncate text-sm font-semibold text-sky-950 dark:text-sky-100">{title}</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {segments.length > 0 ? (
          segments.map((segment, index) => {
            const active = segment.id === currentSpeechActionId;
            return (
              <article
                key={segment.id}
                className={cn(
                  'rounded-xl border p-3',
                  active
                    ? 'border-sky-300 bg-sky-50/90 shadow-sm dark:border-sky-400/30 dark:bg-sky-400/10'
                    : 'border-slate-200/80 bg-white/78 dark:border-white/10 dark:bg-white/[0.04]',
                )}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums',
                      active
                        ? 'bg-sky-500 text-white'
                        : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300',
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 truncate text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {segment.label}
                  </span>
                  {active ? (
                    <span className="ml-auto shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-400/15 dark:text-sky-200">
                      正在播放
                    </span>
                  ) : null}
                </div>
                <p className="whitespace-pre-wrap text-sm leading-7 text-slate-800 dark:text-slate-100">
                  {segment.text}
                </p>
              </article>
            );
          })
        ) : (
          <div className="flex h-full min-h-[10rem] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400">
            当前页暂无讲解稿
          </div>
        )}
      </div>
    </aside>
  );
}
