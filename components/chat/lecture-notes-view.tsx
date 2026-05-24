'use client';

import { useEffect, useRef } from 'react';
import { BookOpen, MessageSquare, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { LectureNoteEntry, LectureNoteItem } from '@/lib/types/chat';

interface LectureNotesViewProps {
  notes: LectureNoteEntry[];
  currentSceneId?: string | null;
  currentOnly?: boolean;
  selectedItemKey?: string | null;
  onItemSelect?: (note: LectureNoteEntry, item: LectureNoteItem) => void;
  onClearSelection?: () => void;
}

function lectureNoteItemKey(note: LectureNoteEntry, item: LectureNoteItem): string {
  return `${note.sceneId}:${item.id}`;
}

function actionLabel(type: string): string {
  switch (type) {
    case 'spotlight':
      return '聚焦';
    case 'laser':
      return '指示';
    case 'semantic_step':
      return '步骤';
    case 'play_video':
      return '视频';
    default:
      return '动作';
  }
}

export function LectureNotesView({
  notes,
  currentSceneId,
  currentOnly = false,
  selectedItemKey,
  onItemSelect,
  onClearSelection,
}: LectureNotesViewProps) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const visibleNotes = currentOnly
    ? notes.filter((note) => note.sceneId === currentSceneId)
    : notes;

  // Auto-scroll to the current scene note
  useEffect(() => {
    if (currentOnly) return;
    if (!currentSceneId || !containerRef.current) return;
    const el = containerRef.current.querySelector(`[data-scene-id="${currentSceneId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentOnly, currentSceneId]);

  // Empty state
  if (visibleNotes.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6">
        <div className="w-12 h-12 bg-sky-50 dark:bg-sky-900/20 rounded-2xl flex items-center justify-center mb-3 text-sky-300 dark:text-sky-500 ring-1 ring-sky-100 dark:ring-sky-800/30">
          <BookOpen className="w-6 h-6" />
        </div>
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
          {t('chat.lectureNotes.empty')}
        </p>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
          {t('chat.lectureNotes.emptyHint')}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 scrollbar-hide"
    >
      {onClearSelection && selectedItemKey ? (
        <div className="sticky top-0 z-10 mb-2 flex justify-end bg-white/85 py-1 backdrop-blur-md dark:bg-slate-950/75">
          <button
            type="button"
            onClick={onClearSelection}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-slate-200/80 bg-white/90 px-2.5 text-[11px] font-medium text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-800 dark:border-white/10 dark:bg-slate-900/90 dark:text-slate-300 dark:hover:border-white/20 dark:hover:text-white"
          >
            <XCircle className="size-3.5" strokeWidth={1.9} />
            清空选择
          </button>
        </div>
      ) : null}
      {visibleNotes.map((note) => {
        const isCurrent = note.sceneId === currentSceneId;

        return (
          <div
            key={note.sceneId}
            data-scene-id={note.sceneId}
            className={cn(
              'relative mb-3 last:mb-0 rounded-lg px-3 py-2.5 transition-colors duration-200',
              isCurrent
                ? 'bg-sky-50/80 dark:bg-sky-950/25 ring-1 ring-sky-200/60 dark:ring-sky-700/30'
                : 'bg-gray-50/50 dark:bg-gray-800/30',
            )}
          >
            {/* Scene title */}
            <h4 className="text-[13px] font-bold text-gray-800 dark:text-gray-100 mb-1.5 leading-snug">
              {note.sceneTitle}
            </h4>

            {/* Ordered items: spotlight/laser inline at sentence start, discussion as card */}
            <div className="space-y-2">
              {(() => {
                // Build render rows: group inline actions (spotlight/laser) with next speech,
                // but render discussion as its own block
                type Row =
                  | {
                      kind: 'speech';
                      inlineActions: Extract<LectureNoteItem, { kind: 'action' }>[];
                      item: Extract<LectureNoteItem, { kind: 'speech' }>;
                    }
                  | {
                      kind: 'discussion';
                      item: Extract<LectureNoteItem, { kind: 'action' }>;
                      label?: string;
                    }
                  | {
                      kind: 'trailing';
                      inlineActions: Extract<LectureNoteItem, { kind: 'action' }>[];
                    };
                const rows: Row[] = [];
                let pendingInline: Extract<LectureNoteItem, { kind: 'action' }>[] = [];
                for (const item of note.items) {
                  if (item.kind === 'action' && item.type === 'discussion') {
                    // Flush pending inline actions as trailing if any
                    if (pendingInline.length > 0) {
                      rows.push({
                        kind: 'trailing',
                        inlineActions: pendingInline,
                      });
                      pendingInline = [];
                    }
                    rows.push({ kind: 'discussion', item, label: item.label });
                  } else if (item.kind === 'action') {
                    pendingInline.push(item);
                  } else {
                    rows.push({
                      kind: 'speech',
                      inlineActions: pendingInline,
                      item,
                    });
                    pendingInline = [];
                  }
                }
                if (pendingInline.length > 0) {
                  rows.push({ kind: 'trailing', inlineActions: pendingInline });
                }
                return rows.map((row, i) => {
                  if (row.kind === 'discussion') {
                    return (
                      <div
                        key={i}
                        className="my-1.5 flex items-start gap-1.5 rounded-md border border-amber-200/60 dark:border-amber-700/30 bg-amber-50/60 dark:bg-amber-900/10 px-2 py-1.5"
                      >
                        <MessageSquare className="w-3 h-3 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
                        <span className="text-[11px] leading-snug text-amber-800 dark:text-amber-300">
                          {row.label}
                        </span>
                      </div>
                    );
                  }
                  const visualInlineActions =
                    row.kind === 'speech'
                      ? []
                      : row.inlineActions.filter((action) => action.visualCue);
                  const visualCues =
                    row.kind === 'speech'
                      ? row.item.visualCues
                      : visualInlineActions
                          .map((action) => action.visualCue)
                          .filter((cue): cue is NonNullable<typeof cue> => Boolean(cue));
                  const hasVisualCue = visualCues.length > 0;
                  const isSelected =
                    hasVisualCue &&
                    (row.kind === 'speech'
                      ? selectedItemKey === lectureNoteItemKey(note, row.item)
                      : visualInlineActions.some(
                          (action) => selectedItemKey === lectureNoteItemKey(note, action),
                        ));

                  return (
                    <button
                      key={i}
                      type="button"
                      title={onItemSelect && hasVisualCue ? '查看聚焦' : undefined}
                      onClick={() => {
                        if (row.kind === 'speech') {
                          onItemSelect?.(note, row.item);
                        } else {
                          const item = visualInlineActions[0];
                          if (item) onItemSelect?.(note, item);
                        }
                      }}
                      className={cn(
                        'w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-left text-[12px] leading-[1.8] text-gray-700 shadow-sm transition dark:border-slate-700/40 dark:bg-slate-900/55 dark:text-gray-300',
                        onItemSelect &&
                          hasVisualCue &&
                          'cursor-pointer hover:border-sky-200 hover:bg-sky-50/80 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 dark:hover:border-sky-500/30 dark:hover:bg-sky-500/10 dark:hover:text-white',
                        onItemSelect && !hasVisualCue && 'cursor-default',
                        isSelected &&
                          'border-sky-300 bg-sky-50 text-slate-950 ring-1 ring-sky-200 dark:border-sky-400/40 dark:bg-sky-500/15 dark:text-white dark:ring-sky-400/20',
                      )}
                    >
                      {row.kind === 'speech' ? (
                        <>
                          {visualCues.length > 0 ? (
                            <span className="mb-1 flex flex-wrap gap-1">
                              {visualCues.map((cue) => (
                                <span
                                  key={cue.actionId}
                                  className="rounded-full bg-sky-100/80 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-sky-700 dark:bg-sky-400/10 dark:text-sky-200"
                                >
                                  {actionLabel(cue.type)}
                                </span>
                              ))}
                            </span>
                          ) : null}
                          {row.item.text}
                        </>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {visualInlineActions.map((action) => (
                            <span
                              key={action.id}
                              className="rounded-full bg-sky-100/80 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-sky-700 dark:bg-sky-400/10 dark:text-sky-200"
                            >
                              {actionLabel(action.type)}
                            </span>
                          ))}
                        </span>
                      )}
                    </button>
                  );
                });
              })()}
            </div>
          </div>
        );
      })}
    </div>
  );
}
