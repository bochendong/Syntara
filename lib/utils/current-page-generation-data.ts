import type { SceneOutline } from '@/lib/types/generation';
import type { Scene } from '@/lib/types/stage';
import type { NotebookContentDocument } from '@/lib/notebook-content';

export interface PageContinuationContext {
  rootOutlineId: string;
  currentPart: number;
  totalParts: number;
}

export interface CurrentPageGenerationData {
  sceneId: string;
  sceneOrder: number;
  sceneTitle: string;
  scene: Scene;
  currentOutline: SceneOutline | null;
  rootOutline: SceneOutline | null;
  relatedOutlines: SceneOutline[];
  semanticDocument: NotebookContentDocument | null;
  continuation: PageContinuationContext | null;
}

function getOutlineRootId(outline: SceneOutline): string {
  return outline.continuation?.rootOutlineId || outline.id;
}

function resolveContinuationFromSources(args: {
  outline: SceneOutline | null;
  semanticDocument: NotebookContentDocument | null;
  relatedOutlines: SceneOutline[];
}): PageContinuationContext | null {
  const fromOutline = args.outline?.continuation;
  if (fromOutline) {
    return {
      rootOutlineId: fromOutline.rootOutlineId,
      currentPart: fromOutline.partNumber,
      totalParts: fromOutline.totalParts,
    };
  }

  const fromDoc = args.semanticDocument?.continuation;
  if (fromDoc) {
    return {
      rootOutlineId: fromDoc.rootOutlineId,
      currentPart: fromDoc.partNumber,
      totalParts: fromDoc.totalParts,
    };
  }

  if (args.relatedOutlines.length <= 1) return null;
  return {
    rootOutlineId: getOutlineRootId(args.relatedOutlines[0]),
    currentPart: 1,
    totalParts: args.relatedOutlines.length,
  };
}

export function getCurrentPageGenerationData(args: {
  scenes: Scene[];
  outlines: SceneOutline[];
  sceneId: string | null;
}): CurrentPageGenerationData | null {
  if (!args.sceneId) return null;
  const scene = args.scenes.find((item) => item.id === args.sceneId);
  if (!scene) return null;

  const semanticDocument =
    scene.type === 'slide' && scene.content.type === 'slide' ? scene.content.semanticDocument || null : null;

  const currentOutline =
    args.outlines.find((outline) => outline.order === scene.order) ||
    args.outlines.find((outline) => outline.title === scene.title) ||
    null;

  const rootOutlineId =
    currentOutline?.continuation?.rootOutlineId ||
    semanticDocument?.continuation?.rootOutlineId ||
    currentOutline?.id ||
    '';

  const relatedOutlines = rootOutlineId
    ? args.outlines
        .filter((outline) => getOutlineRootId(outline) === rootOutlineId)
        .sort((a, b) => a.order - b.order)
    : currentOutline
      ? [currentOutline]
      : [];

  const rootOutline =
    (rootOutlineId && args.outlines.find((outline) => outline.id === rootOutlineId)) ||
    relatedOutlines.find((outline) => !outline.continuation) ||
    relatedOutlines[0] ||
    currentOutline ||
    null;

  const continuation = resolveContinuationFromSources({
    outline: currentOutline,
    semanticDocument,
    relatedOutlines,
  });

  return {
    sceneId: scene.id,
    sceneOrder: scene.order,
    sceneTitle: scene.title,
    scene,
    currentOutline,
    rootOutline,
    relatedOutlines,
    semanticDocument,
    continuation,
  };
}
