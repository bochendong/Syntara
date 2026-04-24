'use client';

import { useEffect, useRef } from 'react';
import { BookOpen, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { LectureNoteEntry } from '@/lib/types/chat';

interface LectureNotesViewProps {
  notes: LectureNoteEntry[];
  currentSceneId?: string | null;
  currentOnly?: boolean;
}

export function LectureNotesView({ notes, currentSceneId, currentOnly = false }: LectureNotesViewProps) {
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
      {visibleNotes.map((note, index) => {
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
                  | { kind: 'speech'; inlineActions: string[]; text: string }
                  | { kind: 'discussion'; label?: string }
                  | { kind: 'trailing'; inlineActions: string[] };
                const rows: Row[] = [];
                let pendingInline: string[] = [];
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
                    rows.push({ kind: 'discussion', label: item.label });
                  } else if (item.kind === 'action') {
                    pendingInline.push(item.type);
                  } else {
                    rows.push({
                      kind: 'speech',
                      inlineActions: pendingInline,
                      text: item.text,
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
                  return (
                    <p
                      key={i}
                      className="rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-[12px] leading-[1.8] text-gray-700 shadow-sm dark:border-slate-700/40 dark:bg-slate-900/55 dark:text-gray-300"
                    >
                      {row.kind === 'speech' ? row.text : null}
                    </p>
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
