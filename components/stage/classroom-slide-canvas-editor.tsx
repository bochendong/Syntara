'use client';

import { SceneProvider } from '@/lib/contexts/scene-context';
import type { Scene } from '@/lib/types/stage';
import type { SlideRepairChatMessage } from '@/lib/types/slide-repair';
import { cn } from '@/lib/utils';
import { Canvas } from '@/components/slide-renderer/Editor/Canvas';
import { SlideElementInspector } from '@/components/stage/slide-element-inspector';

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
}: ClassroomSlideCanvasEditorProps) {
  const viewportRatio =
    currentScene.type === 'slide' && currentScene.content.type === 'slide'
      ? currentScene.content.canvas.viewportRatio ?? 0.5625
      : 0.5625;
  const slideAspectRatio = 1 / viewportRatio;

  return (
    <div
      className={cn(
        'relative flex h-full min-h-0 flex-row items-stretch justify-start gap-3 overflow-hidden p-3 transition-colors duration-500 md:p-4',
        'bg-[radial-gradient(circle_at_15%_0%,rgba(179,229,252,0.28),transparent_40%),linear-gradient(180deg,rgba(248,250,252,0.92)_0%,rgba(238,242,247,0.85)_100%)]',
        'dark:bg-[radial-gradient(circle_at_20%_10%,rgba(71,85,105,0.22),transparent_45%),linear-gradient(180deg,rgba(11,15,22,0.92)_0%,rgba(17,24,39,0.88)_100%)]',
      )}
    >
      <SceneProvider>
        <div className="flex min-h-0 min-w-0 flex-1 items-stretch gap-3">
          <div className="flex min-h-0 min-w-0 flex-1 items-stretch justify-center overflow-hidden">
            <div
              className="relative h-full"
              style={{ aspectRatio: `${slideAspectRatio}` }}
            >
              <div className="relative h-full w-full overflow-hidden rounded-[24px] border border-slate-900/[0.08] bg-white shadow-[0_8px_40px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)] dark:border-white/[0.08] dark:bg-[#1c1c1e] dark:shadow-[0_12px_48px_rgba(0,0,0,0.45)]">
                <Canvas />
              </div>
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
