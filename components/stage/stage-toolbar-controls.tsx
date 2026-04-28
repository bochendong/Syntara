import type { ReactNode } from 'react';
import { AlertTriangle, RefreshCcw, Sparkles, SquarePen } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SceneType } from '@/lib/types/stage';

export type SlideEditTab = 'canvas' | 'narration';
export type SlideEditorSidebarTab = 'ai' | 'manual';
export type MainClassroomView = 'ppt' | 'quiz' | 'raw';

function SegmentedShell({ children, ariaLabel }: { children: ReactNode; ariaLabel: string }) {
  return (
    <div
      className={cn(
        'apple-glass flex items-center gap-0.5 rounded-[14px] p-0.5',
        'shadow-[0_2px_16px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_20px_rgba(0,0,0,0.25)]',
      )}
      role="tablist"
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}

function SegmentedButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'rounded-[10px] px-3 py-1.5 text-xs font-semibold transition-all duration-[250ms] ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
        active
          ? 'bg-[rgba(0,122,255,0.12)] text-[#007AFF] shadow-sm dark:bg-[rgba(10,132,255,0.18)] dark:text-[#0A84FF]'
          : 'text-[#1d1d1f]/65 hover:bg-black/[0.04] hover:text-[#1d1d1f] dark:text-white/70 dark:hover:bg-white/[0.06] dark:hover:text-white',
      )}
    >
      {children}
    </button>
  );
}

export function StageViewToggle({
  slideEditorOpen,
  slideEditTab,
  onSlideEditTabChange,
  mainClassroomView,
  onMainClassroomViewChange,
  currentSceneType,
  onRawDataSubTabChange,
  labels,
}: {
  slideEditorOpen: boolean;
  slideEditTab: SlideEditTab;
  onSlideEditTabChange: (tab: SlideEditTab) => void;
  mainClassroomView: MainClassroomView;
  onMainClassroomViewChange: (view: MainClassroomView) => void;
  currentSceneType?: SceneType;
  onRawDataSubTabChange: (tab: SceneType) => void;
  labels: {
    ppt: string;
    quiz: string;
    raw: string;
  };
}) {
  if (slideEditorOpen) {
    return (
      <SegmentedShell ariaLabel="编辑模式切换">
        <SegmentedButton
          active={slideEditTab === 'canvas'}
          onClick={() => onSlideEditTabChange('canvas')}
        >
          页面
        </SegmentedButton>
        <SegmentedButton
          active={slideEditTab === 'narration'}
          onClick={() => onSlideEditTabChange('narration')}
        >
          讲解
        </SegmentedButton>
      </SegmentedShell>
    );
  }

  return (
    <SegmentedShell ariaLabel={`${labels.ppt} / ${labels.quiz} / ${labels.raw}`}>
      <SegmentedButton
        active={mainClassroomView === 'ppt'}
        onClick={() => onMainClassroomViewChange('ppt')}
      >
        {labels.ppt}
      </SegmentedButton>
      <SegmentedButton
        active={mainClassroomView === 'quiz'}
        onClick={() => onMainClassroomViewChange('quiz')}
      >
        {labels.quiz}
      </SegmentedButton>
      <SegmentedButton
        active={mainClassroomView === 'raw'}
        onClick={() => {
          onMainClassroomViewChange('raw');
          if (currentSceneType) onRawDataSubTabChange(currentSceneType);
        }}
      >
        {labels.raw}
      </SegmentedButton>
    </SegmentedShell>
  );
}

export function EditorStatusChip({
  storageSaveState,
  storageSaveScope,
  storageSavedAt,
  storageSaveError,
  slideEditTab,
  semanticEditorOpen = false,
}: {
  storageSaveState: string;
  storageSaveScope?: string | null;
  storageSavedAt?: number | null;
  storageSaveError?: string | null;
  slideEditTab: SlideEditTab;
  semanticEditorOpen?: boolean;
}) {
  return (
    <div className="apple-glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200">
      <span
        className={cn(
          'inline-flex size-2 rounded-full',
          storageSaveState === 'saving'
            ? 'bg-amber-500 dark:bg-amber-400'
            : storageSaveState === 'error'
              ? 'bg-rose-500 dark:bg-rose-400'
              : 'bg-emerald-500 dark:bg-emerald-400',
        )}
      />
      <span>
        {storageSaveState === 'saving'
          ? semanticEditorOpen
            ? 'Markup 正在保存…'
            : slideEditTab === 'canvas'
              ? '页面改动正在保存…'
              : '讲解改动正在保存…'
          : storageSaveState === 'error'
            ? `保存失败${storageSaveError ? `：${storageSaveError}` : ''}`
            : storageSaveState === 'saved'
              ? storageSaveScope === 'draft'
                ? `已保存草稿${storageSavedAt ? '，刷新不会丢' : ''}`
                : '已保存'
              : semanticEditorOpen
                ? 'Markup 编辑模式：点击保存后重新编译当前页'
                : slideEditTab === 'canvas'
                  ? '编辑模式：页面改动会自动保存'
                  : '编辑模式：讲解修改需要手动保存'}
      </span>
    </div>
  );
}

export function StageTitleActions({
  headerActions,
  canEditCurrentSlide,
  canRepairCurrentSlide,
  canRestoreCurrentSlide,
  canRerenderCurrentSlide,
  gridReflowPending,
  slideEditorOpen,
  slideEditorSidebarTab,
  onRerender,
  onRestore,
  onOpenRepairSidebar,
  onManualEditToggle,
}: {
  headerActions?: ReactNode;
  canEditCurrentSlide: boolean;
  canRepairCurrentSlide: boolean;
  canRestoreCurrentSlide: boolean;
  canRerenderCurrentSlide: boolean;
  gridReflowPending: boolean;
  slideEditorOpen: boolean;
  slideEditorSidebarTab: SlideEditorSidebarTab;
  onRerender: () => void;
  onRestore: () => void;
  onOpenRepairSidebar: () => void;
  onManualEditToggle: () => void;
}) {
  const hasBuiltInActions =
    canEditCurrentSlide ||
    slideEditorOpen ||
    canRepairCurrentSlide ||
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
          title="恢复到 AI 重写前的版本"
        >
          <AlertTriangle className="size-3.5" />
          恢复重写前
        </button>
      ) : null}

      {canRepairCurrentSlide ? (
        <button
          type="button"
          onClick={onOpenRepairSidebar}
          className={cn(
            'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all',
            slideEditorOpen && slideEditorSidebarTab === 'ai'
              ? 'border-sky-400 bg-sky-100 text-sky-900 shadow-sm dark:border-sky-400/45 dark:bg-sky-950/55 dark:text-sky-50'
              : 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-950/35 dark:text-sky-200 dark:hover:bg-sky-950/55',
          )}
          title="打开 AI 重写侧栏；与「编辑当前页」互斥，可在顶栏切换"
        >
          <Sparkles className="size-3.5" />
          AI 重写
        </button>
      ) : null}

      {canEditCurrentSlide || slideEditorOpen ? (
        <button
          type="button"
          onClick={onManualEditToggle}
          className={cn(
            'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all',
            slideEditorOpen && slideEditorSidebarTab === 'manual'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-950/35 dark:text-emerald-200 dark:hover:bg-emerald-950/55'
              : 'border-slate-200 bg-white/80 text-slate-700 hover:bg-slate-50 dark:border-white/[0.1] dark:bg-white/[0.05] dark:text-slate-200 dark:hover:bg-white/[0.08]',
          )}
        >
          <SquarePen className="size-3.5" />
          {slideEditorOpen && slideEditorSidebarTab === 'manual' ? '完成编辑' : '编辑当前页'}
        </button>
      ) : null}
    </div>
  );
}
