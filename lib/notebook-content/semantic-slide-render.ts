import type { Scene, SlideContent } from '@/lib/types/stage';
import type { Slide } from '@/lib/types/slides';
import type { NotebookContentDocument } from './schema';
import { renderNotebookContentDocumentToSlide } from './slide-adapter';

export const SEMANTIC_SLIDE_RENDER_VERSION = 3;

export function markSemanticSlideContent(
  content: SlideContent,
  options?: { renderMode?: 'auto' | 'manual' },
): SlideContent {
  if (!content.semanticDocument) return content;
  return {
    ...content,
    semanticRenderVersion: SEMANTIC_SLIDE_RENDER_VERSION,
    semanticRenderMode: options?.renderMode ?? content.semanticRenderMode ?? 'auto',
  };
}

export function renderSemanticSlideContent(args: {
  document: NotebookContentDocument;
  fallbackTitle: string;
  preserveCanvasId?: string;
  renderMode?: 'auto' | 'manual';
}): SlideContent {
  const renderedCanvas = renderNotebookContentDocumentToSlide({
    document: args.document,
    fallbackTitle: args.fallbackTitle,
  });
  const canvas: Slide = args.preserveCanvasId
    ? {
        ...renderedCanvas,
        id: args.preserveCanvasId,
      }
    : renderedCanvas;

  return {
    type: 'slide',
    canvas,
    semanticDocument: args.document,
    semanticRenderVersion: SEMANTIC_SLIDE_RENDER_VERSION,
    semanticRenderMode: args.renderMode ?? 'auto',
  };
}

export function shouldAutoRefreshSemanticSlideContent(content: SlideContent): boolean {
  if (!content.semanticDocument) return false;
  if (content.semanticRenderMode === 'manual') return false;
  return content.semanticRenderVersion !== SEMANTIC_SLIDE_RENDER_VERSION;
}

export function refreshSemanticSlideScene(scene: Scene): Scene {
  if (scene.type !== 'slide' || scene.content.type !== 'slide') {
    return scene;
  }

  const { content } = scene;
  if (!shouldAutoRefreshSemanticSlideContent(content) || !content.semanticDocument) {
    return scene;
  }

  return {
    ...scene,
    content: renderSemanticSlideContent({
      document: content.semanticDocument,
      fallbackTitle: content.semanticDocument.title || scene.title,
      preserveCanvasId: content.canvas.id,
      renderMode: content.semanticRenderMode ?? 'auto',
    }),
  };
}
