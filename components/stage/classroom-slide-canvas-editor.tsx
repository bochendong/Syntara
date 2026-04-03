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
  currentSceneIndex,
  currentScene: _currentScene,
  sidebarPanel,
  repairDraft,
  onRepairDraftChange,
  repairConversation,
  onSendRepairMessage,
  repairPending,
  repairInputFocusNonce,
  onCloseInspector,
}: ClassroomSlideCanvasEditorProps) {
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
          <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
            <div className="relative h-full min-h-0 w-full overflow-hidden rounded-[24px] border border-slate-900/[0.08] bg-white shadow-[0_8px_40px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)] dark:border-white/[0.08] dark:bg-[#1c1c1e] dark:shadow-[0_12px_48px_rgba(0,0,0,0.45)]">
              <Canvas />
              <div className="pointer-events-none absolute right-4 top-4 text-4xl font-black text-gray-200 opacity-50 mix-blend-multiply select-none dark:text-gray-700 dark:mix-blend-screen">
                {(currentSceneIndex + 1).toString().padStart(2, '0')}
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
