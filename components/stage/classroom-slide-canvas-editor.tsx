'use client';

import { useEffect } from 'react';
import { SceneProvider } from '@/lib/contexts/scene-context';
import { useCanvasStore } from '@/lib/store/canvas';
import type { Scene } from '@/lib/types/stage';
import type { SlideRepairChatMessage } from '@/lib/types/slide-repair';
import { cn } from '@/lib/utils';
import { Canvas } from '@/components/slide-renderer/Editor/Canvas';
import { SlideElementInspector } from '@/components/stage/slide-element-inspector';
import { SceneSidebar } from '@/components/stage/scene-sidebar';
import type { PPTElement, PPTImageElement, Slide } from '@/lib/types/slides';

const IMAGE_NOTEBOOK_SRC_PATTERN = /\/generated-notebooks\//i;

function isImageNotebookPageElement(element: PPTElement): element is PPTImageElement {
  return (
    element.type === 'image' &&
    (element.imageType === 'pageFigure' || IMAGE_NOTEBOOK_SRC_PATTERN.test(element.src || ''))
  );
}

function resolveEditorViewportRatio(canvas: Slide): number {
  const pageImage = canvas.elements.find(isImageNotebookPageElement);
  if (pageImage?.width && pageImage.height && pageImage.width > 0 && pageImage.height > 0) {
    return pageImage.height / pageImage.width;
  }
  return canvas.viewportRatio ?? 0.5625;
}

interface ClassroomSlideCanvasEditorProps {
  readonly currentScene: Scene;
  readonly currentSceneIndex: number;
  readonly sidebarPanel: 'ai' | 'manual';
  readonly repairDraft: string;
  readonly onRepairDraftChange: (value: string) => void;
  readonly repairConversation: SlideRepairChatMessage[];
  readonly onSendRepairMessage: () => void;
  readonly repairPending: boolean;
  readonly repairInputFocusNonce: number;
  readonly onCloseInspector?: () => void;
  readonly onSceneSelect?: (sceneId: string) => void;
  readonly onRetryOutline?: (outlineId: string) => Promise<void>;
}

export function ClassroomSlideCanvasEditor({
  currentScene,
  sidebarPanel,
  repairDraft,
  onRepairDraftChange,
  repairConversation,
  onSendRepairMessage,
  repairPending,
  repairInputFocusNonce,
  onCloseInspector,
  onSceneSelect,
  onRetryOutline,
}: ClassroomSlideCanvasEditorProps) {
  const setCanvasPercentage = useCanvasStore.use.setCanvasPercentage();
  const setCanvasDragged = useCanvasStore.use.setCanvasDragged();
  const setViewportSize = useCanvasStore.use.setViewportSize();
  const setViewportRatio = useCanvasStore.use.setViewportRatio();
  const viewportRatio =
    currentScene.type === 'slide' && currentScene.content.type === 'slide'
      ? resolveEditorViewportRatio(currentScene.content.canvas)
      : 0.5625;
  const viewportSize =
    currentScene.type === 'slide' && currentScene.content.type === 'slide'
      ? (currentScene.content.canvas.viewportSize ?? 1000)
      : 1000;
  const hasImageNotebookPage =
    currentScene.type === 'slide' &&
    currentScene.content.type === 'slide' &&
    currentScene.content.canvas.elements.some(isImageNotebookPageElement);

  useEffect(() => {
    setViewportSize(viewportSize);
    setViewportRatio(viewportRatio);
    setCanvasPercentage(100);
    setCanvasDragged(false);
  }, [
    setCanvasDragged,
    setCanvasPercentage,
    setViewportRatio,
    setViewportSize,
    viewportRatio,
    viewportSize,
  ]);

  return (
    <div
      className={cn(
        'relative flex h-full min-h-0 flex-row items-stretch justify-start overflow-hidden transition-colors duration-500',
        'bg-white dark:bg-slate-950',
      )}
    >
      <SceneProvider>
        <div className="flex w-[84px] shrink-0 justify-center border-r border-slate-900/[0.08] bg-white/86 px-3 py-6 dark:border-white/[0.08] dark:bg-[#0f1115]/86">
          <SceneSidebar
            collapsed={false}
            onCollapseChange={() => undefined}
            variant="rail"
            onSceneSelect={onSceneSelect}
            onRetryOutline={onRetryOutline}
          />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 items-stretch">
          <div className="flex min-h-0 min-w-0 flex-1 items-stretch justify-center overflow-hidden px-5 pb-5 pt-5">
            <div
              className={cn(
                'relative h-full w-full overflow-hidden',
                hasImageNotebookPage
                  ? 'bg-transparent'
                  : 'rounded-[20px] border border-slate-900/[0.08] bg-white shadow-[0_8px_40px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)] dark:border-white/[0.08] dark:bg-[#1c1c1e] dark:shadow-[0_12px_48px_rgba(0,0,0,0.45)]',
              )}
            >
              <Canvas />
            </div>
          </div>

          <SlideElementInspector
            sidebarPanel={sidebarPanel}
            repairDraft={repairDraft}
            onRepairDraftChange={onRepairDraftChange}
            repairConversation={repairConversation}
            onSendRepairMessage={onSendRepairMessage}
            repairPending={repairPending}
            repairInputFocusNonce={repairInputFocusNonce}
            onClose={onCloseInspector}
          />
        </div>
      </SceneProvider>
    </div>
  );
}
