import type { MediaGenerationRequest } from '@/lib/media/types';
import type { SceneOutline } from '@/lib/types/generation';
import type { Scene } from '@/lib/types/stage';

type MediaType = MediaGenerationRequest['type'];

function isGeneratedMediaId(value: string, type?: MediaType): boolean {
  if (type === 'image') return /^gen_img_[\w-]+$/i.test(value);
  if (type === 'video') return /^gen_vid_[\w-]+$/i.test(value);
  return /^gen_(img|vid)_[\w-]+$/i.test(value);
}

function uniqueOutlines(outlines: Array<SceneOutline | null | undefined>): SceneOutline[] {
  const seen = new Set<string>();
  const result: SceneOutline[] = [];
  for (const outline of outlines) {
    if (!outline) continue;
    const key = outline.id || `${outline.order}:${outline.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(outline);
  }
  return result;
}

export function collectSceneMediaPlaceholderIds(scene: Scene | null | undefined, type?: MediaType) {
  const ids = new Set<string>();
  if (!scene || scene.type !== 'slide' || scene.content.type !== 'slide') return ids;

  for (const element of scene.content.canvas.elements || []) {
    if (type === 'image' && element.type !== 'image') continue;
    if (type === 'video' && element.type !== 'video') continue;
    if (element.type !== 'image' && element.type !== 'video') continue;
    const src = (element as { src?: unknown }).src;
    if (typeof src === 'string' && isGeneratedMediaId(src, type)) {
      ids.add(src);
    }
  }

  return ids;
}

export function findMediaGenerationRequestByElementId(
  outlines: Array<SceneOutline | null | undefined>,
  elementId: string,
): MediaGenerationRequest | undefined {
  if (!elementId) return undefined;
  for (const outline of outlines) {
    const request = outline?.mediaGenerations?.find((media) => media.elementId === elementId);
    if (request) return request;
  }
  return undefined;
}

export function collectMediaGenerationRequestsForScene(args: {
  scene: Scene | null | undefined;
  outlines: SceneOutline[];
  preferredOutlines?: Array<SceneOutline | null | undefined>;
  type?: MediaType;
}): MediaGenerationRequest[] {
  const placeholderIds = collectSceneMediaPlaceholderIds(args.scene, args.type);
  const searchOutlines = uniqueOutlines([...(args.preferredOutlines || []), ...args.outlines]);

  if (placeholderIds.size > 0) {
    const requests: MediaGenerationRequest[] = [];
    for (const id of placeholderIds) {
      const request = findMediaGenerationRequestByElementId(searchOutlines, id);
      if (request && (!args.type || request.type === args.type)) {
        requests.push(request);
      }
    }
    return requests;
  }

  return uniqueOutlines(args.preferredOutlines || []).flatMap((outline) =>
    (outline.mediaGenerations || []).filter((request) => !args.type || request.type === args.type),
  );
}
