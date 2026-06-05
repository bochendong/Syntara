import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScenePreviewDialog } from '@/components/slide-renderer/components/scene-preview-dialog';
import type { NotebookKnowledgeReference } from '@/lib/types/notebook-message';
import type { Scene } from '@/lib/types/stage';
import { cn } from '@/lib/utils';

/** 与 send-message 中 toSceneBrief 一致：第 N 节 ↔ scene.order === N - 1 */
function sceneForNotebookReferenceOrder(scenes: Scene[], refOrder: number): Scene | undefined {
  return scenes.find((s) => s.order === refOrder - 1);
}

export function NotebookReferencePreviewLi({
  reference,
  scenes,
  scenesLoading,
  variant = 'list',
}: {
  reference: NotebookKnowledgeReference;
  scenes: Scene[];
  scenesLoading: boolean;
  variant?: 'list' | 'chip';
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const scene = useMemo(
    () => sceneForNotebookReferenceOrder(scenes, reference.order),
    [scenes, reference.order],
  );

  return (
    <li className={cn(variant === 'chip' && 'max-w-full list-none')}>
      <span
        className={cn(
          'cursor-pointer transition-colors',
          variant === 'chip'
            ? 'inline-flex max-w-full items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] leading-none text-muted-foreground dark:border-white/10 dark:bg-white/5'
            : 'border-b border-dotted border-muted-foreground/45',
        )}
        tabIndex={0}
        onClick={() => setPreviewOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setPreviewOpen(true);
          }
        }}
      >
        <span className={cn('font-medium text-foreground', variant === 'chip' && 'truncate')}>
          第 {reference.order} 节 · {reference.title}
        </span>
        {reference.why && variant !== 'chip' ? <span> — {reference.why}</span> : null}
      </span>
      {scene ? (
        <ScenePreviewDialog
          scene={scene}
          previewMode="thumbnail"
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          description={reference.why || '放大当前来源缩略图。'}
        />
      ) : (
        <Dialog modal={false} open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent
            showOverlay={false}
            className="w-[min(92vw,420px)] max-w-[420px] overflow-hidden p-4"
          >
            <DialogHeader className="sr-only">
              <DialogTitle>
                第 {reference.order} 节 · {reference.title}
              </DialogTitle>
              <DialogDescription>{reference.why || '仅预览该页 slides 内容。'}</DialogDescription>
            </DialogHeader>
            <div className="mt-2 flex items-center justify-center rounded-[12px] border border-slate-900/[0.08] bg-white/85 p-4 dark:border-white/[0.1] dark:bg-black/30">
              {scenesLoading ? (
                <p className="px-2 py-6 text-sm text-muted-foreground">正在加载该页预览…</p>
              ) : (
                <p className="px-2 py-6 text-sm text-muted-foreground">
                  未找到第 {reference.order} 节（可能已调整页序）。
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </li>
  );
}
