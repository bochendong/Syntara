'use client';

import dynamic from 'next/dynamic';

function StagePanelLoading() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center bg-white/70 text-xs font-medium text-slate-500 dark:bg-slate-950/60 dark:text-slate-300">
      正在准备面板…
    </div>
  );
}

export const ProblemBankView = dynamic(
  () => import('@/components/problem-bank/problem-bank-view').then((mod) => mod.ProblemBankView),
  { ssr: false, loading: StagePanelLoading },
);

export const SlideNarrationEditor = dynamic(
  () => import('@/components/stage/slide-narration-editor').then((mod) => mod.SlideNarrationEditor),
  { ssr: false, loading: StagePanelLoading },
);

export const ClassroomSlideCanvasEditor = dynamic(
  () =>
    import('@/components/stage/classroom-slide-canvas-editor').then(
      (mod) => mod.ClassroomSlideCanvasEditor,
    ),
  { ssr: false, loading: StagePanelLoading },
);

export const ClassroomSemanticSlideEditor = dynamic(
  () =>
    import('@/components/stage/classroom-semantic-slide-editor').then(
      (mod) => mod.ClassroomSemanticSlideEditor,
    ),
  { ssr: false, loading: StagePanelLoading },
);

export const RawDataPanel = dynamic(
  () => import('@/components/stage/raw-data-panel').then((mod) => mod.RawDataPanel),
  { ssr: false, loading: StagePanelLoading },
);
