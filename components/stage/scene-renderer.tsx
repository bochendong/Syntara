'use client';

import { useMemo } from 'react';
import type { Scene, StageMode } from '@/lib/types/stage';
import { SlideEditor as SlideRenderer } from '../slide-renderer/Editor';
import { QuizView } from '../scene-renderers/quiz-view';
import { InteractiveRenderer } from '../scene-renderers/interactive-renderer';
import { PBLRenderer } from '../scene-renderers/pbl-renderer';
import { MessageResponse } from '@/components/ai-elements/message';
import { SemanticScrollPage } from './semantic-scroll-page';
import { normalizeSemanticDocumentForRender } from '@/lib/notebook-content/semantic-slide-render';

interface SceneRendererProps {
  readonly scene: Scene;
  readonly mode: StageMode;
  readonly showMaskDebugOverlay?: boolean;
}

export function SceneRenderer({ scene, mode, showMaskDebugOverlay = false }: SceneRendererProps) {
  const renderer = useMemo(() => {
    switch (scene.type) {
      case 'slide':
        if (scene.content.type !== 'slide') return <div>Invalid slide content</div>;
        if (
          scene.content.semanticDocument &&
          scene.content.semanticRenderMode !== 'manual' &&
          scene.content.webRenderMode !== 'slide'
        ) {
          const document = normalizeSemanticDocumentForRender(scene.content.semanticDocument);
          return (
            <SemanticScrollPage
              key={scene.id}
              document={document}
              elements={scene.content.canvas.elements}
              sceneId={scene.id}
              title={scene.title}
            />
          );
        }
        return <SlideRenderer mode={mode} showMaskDebugOverlay={showMaskDebugOverlay} />;
      case 'quiz':
        if (scene.content.type !== 'quiz') return <div>Invalid quiz content</div>;
        return <QuizView key={scene.id} questions={scene.content.questions} sceneId={scene.id} />;
      case 'interactive':
        if (scene.content.type !== 'interactive') return <div>Invalid interactive content</div>;
        return <InteractiveRenderer content={scene.content} mode={mode} sceneId={scene.id} />;
      case 'pbl':
        if (scene.content.type !== 'pbl') return <div>Invalid PBL content</div>;
        return <PBLRenderer content={scene.content} mode={mode} sceneId={scene.id} />;
      case 'markdown':
        if (scene.content.type !== 'markdown') return <div>Invalid markdown content</div>;
        return (
          <article className="h-full overflow-auto bg-white px-10 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
            <MessageResponse className="mx-auto max-w-3xl text-[15px] leading-8">
              {scene.content.markdown}
            </MessageResponse>
          </article>
        );
      default:
        return <div>Unknown scene type</div>;
    }
  }, [scene, mode, showMaskDebugOverlay]);

  return <div className="w-full h-full">{renderer}</div>;
}
