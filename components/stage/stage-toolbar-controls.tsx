import type { ReactNode } from 'react';
import { AlertTriangle, RefreshCcw, SquarePen } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SlideEditorSidebarTab = 'ai' | 'manual';

export function StageTitleActions({
  headerActions,
  canToggleEditMode,
  editModeActive,
  canRestoreCurrentSlide,
  canRerenderCurrentSlide,
  gridReflowPending,
  slideEditorOpen,
  onRerender,
  onRestore,
  onEditModeToggle,
}: {
  headerActions?: ReactNode;
  canToggleEditMode: boolean;
  editModeActive: boolean;
  canRestoreCurrentSlide: boolean;
  canRerenderCurrentSlide: boolean;
  gridReflowPending: boolean;
  slideEditorOpen: boolean;
  onRerender: () => void;
  onRestore: () => void;
  onEditModeToggle: () => void;
}) {
  const hasBuiltInActions =
    canToggleEditMode ||
    editModeActive ||
    slideEditorOpen ||
    canRestoreCurrentSlide ||
    canRerenderCurrentSlide;

  if (!headerActions && !hasBuiltInActions) return null;

  return (
    <div className="flex items-center gap-2">
      {headerActions}
      {canRerenderCurrentSlide ? (
        <button
          type="button"
          onClick={onRerender}
          disabled={gridReflowPending}
          className={cn(
            'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all',
            gridReflowPending
              ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/35'
              : 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-950/35 dark:text-violet-200 dark:hover:bg-violet-950/55',
          )}
          title="按 semanticDocument 重新生成当前页布局"
        >
          <RefreshCcw className="size-3.5" />
          {gridReflowPending ? '重新渲染中…' : '重新渲染'}
        </button>
      ) : null}

      {canRestoreCurrentSlide ? (
        <button
          type="button"
          onClick={onRestore}
          className={cn(
            'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all',
            'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-950/35 dark:text-amber-100 dark:hover:bg-amber-950/55',
          )}
          title="恢复到修改前的版本"
        >
          <AlertTriangle className="size-3.5" />
          恢复修改前
        </button>
      ) : null}

      {canToggleEditMode || editModeActive ? (
        <button
          type="button"
          onClick={onEditModeToggle}
          aria-pressed={editModeActive}
          aria-label={editModeActive ? '退出编辑模式' : '进入编辑模式'}
          className={cn(
            'inline-flex size-9 items-center justify-center rounded-full border text-xs font-semibold transition-all',
            editModeActive
              ? 'border-emerald-300 bg-emerald-100 text-emerald-800 shadow-sm hover:bg-emerald-100 dark:border-emerald-400/45 dark:bg-emerald-950/55 dark:text-emerald-50'
              : 'border-slate-200 bg-white/80 text-slate-700 hover:bg-slate-50 dark:border-white/[0.1] dark:bg-white/[0.05] dark:text-slate-200 dark:hover:bg-white/[0.08]',
          )}
          title={editModeActive ? '退出编辑模式' : '进入编辑模式'}
        >
          <SquarePen className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
