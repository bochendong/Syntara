import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { ThumbnailSlide } from '@/components/slide-renderer/components/ThumbnailSlide';
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
      <HoverCard openDelay={280} closeDelay={80}>
        <HoverCardTrigger asChild>
          <span
            className={cn(
              'cursor-help transition-colors hover:text-foreground',
              variant === 'chip'
                ? 'inline-flex max-w-full items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] leading-none text-muted-foreground hover:border-slate-300 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20 dark:hover:bg-white/10'
                : 'border-b border-dotted border-muted-foreground/45 hover:border-foreground/35',
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
        </HoverCardTrigger>
        <HoverCardContent
          side="right"
          align="start"
          className="z-[80] w-auto max-w-[min(92vw,320px)] border border-slate-900/[0.08] bg-white/95 p-2 text-xs shadow-lg dark:border-white/[0.12] dark:bg-[#1c1c1e]/95"
        >
          {scenesLoading ? (
            <p className="px-1 py-2 text-muted-foreground">正在加载该页预览…</p>
          ) : !scene ? (
            <p className="px-1 py-2 text-muted-foreground">
              未找到第 {reference.order} 节（可能已调整页序）。
            </p>
          ) : scene.content.type === 'slide' ? (
            <div className="overflow-hidden rounded-[10px] ring-1 ring-black/[0.06] dark:ring-white/[0.1]">
              <ThumbnailSlide
                slide={scene.content.canvas}
                size={240}
                viewportSize={scene.content.canvas.viewportSize ?? 1000}
                viewportRatio={scene.content.canvas.viewportRatio ?? 0.5625}
              />
            </div>
          ) : (
            <p className="max-w-[240px] px-1 py-2 text-muted-foreground">
              该页为
              {scene.type === 'quiz'
                ? '测验'
                : scene.type === 'interactive'
                  ? '交互'
                  : scene.type === 'pbl'
                    ? '项目式学习'
                    : '非幻灯片'}
              ，暂无幻灯片缩略图。
            </p>
          )}
        </HoverCardContent>
      </HoverCard>
      <Dialog modal={false} open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent
          showOverlay={false}
          showCloseButton={false}
          className="w-[min(92vw,860px)] max-w-[860px] overflow-hidden p-4"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>
              第 {reference.order} 节 · {reference.title}
            </DialogTitle>
            <DialogDescription>{reference.why || '仅预览该页 slides 内容。'}</DialogDescription>
          </DialogHeader>
          <DialogClose
            className={cn(
              'absolute right-3 top-3 z-20 inline-flex size-8 items-center justify-center rounded-full',
              'border border-slate-900/[0.08] bg-white/78 text-slate-700 backdrop-blur-md transition-all',
              'hover:bg-white hover:text-slate-900 hover:shadow-sm',
              'dark:border-white/[0.14] dark:bg-black/45 dark:text-slate-200 dark:hover:bg-black/65 dark:hover:text-white',
            )}
            aria-label="关闭预览"
          >
            <X className="size-4" />
          </DialogClose>
          <div className="mt-2 flex items-center justify-center overflow-auto rounded-[12px] border border-slate-900/[0.08] bg-white/85 p-2 dark:border-white/[0.1] dark:bg-black/30">
            {scenesLoading ? (
              <p className="px-2 py-6 text-sm text-muted-foreground">正在加载该页预览…</p>
            ) : !scene ? (
              <p className="px-2 py-6 text-sm text-muted-foreground">
                未找到第 {reference.order} 节（可能已调整页序）。
              </p>
            ) : scene.content.type === 'slide' ? (
              <ThumbnailSlide
                slide={scene.content.canvas}
                size={760}
                viewportSize={scene.content.canvas.viewportSize ?? 1000}
                viewportRatio={scene.content.canvas.viewportRatio ?? 0.5625}
              />
            ) : (
              <p className="px-2 py-6 text-sm text-muted-foreground">
                该页为
                {scene.type === 'quiz'
                  ? '测验'
                  : scene.type === 'interactive'
                    ? '交互'
                    : scene.type === 'pbl'
                      ? '项目式学习'
                      : '非幻灯片'}
                ，暂无幻灯片可预览。
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </li>
  );
}
