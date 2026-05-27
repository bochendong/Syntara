import type { Scene } from '@/lib/types/stage';

export function isSemanticScrollScene(scene: Scene | null): boolean {
  return Boolean(
    scene?.type === 'slide' &&
    scene.content.type === 'slide' &&
    scene.content.semanticDocument &&
    scene.content.semanticRenderMode !== 'manual' &&
    scene.content.webRenderMode !== 'slide',
  );
}
