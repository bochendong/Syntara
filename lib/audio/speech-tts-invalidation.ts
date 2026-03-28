import type { Scene } from '@/lib/types/stage';
import type { Action, SpeechAction } from '@/lib/types/action';

/** Remove pre-generated speech audio so playback / TTS must run again. */
export function stripSpeechAudioFromActions(actions: Action[] | undefined): Action[] {
  if (!actions?.length) return actions ?? [];
  return actions.map((action) => {
    if (action.type !== 'speech') return action;
    const sa = action as SpeechAction;
    return { ...sa, audioUrl: undefined, audioId: undefined };
  });
}

/**
 * Apply a new actions array: same speech id + same text keeps prior audio URLs;
 * new id or changed text drops audio (previous TTS is invalid).
 */
export function mergeSpeechActionsInvalidatingStaleTts(
  prev: Action[] | undefined,
  next: Action[],
): Action[] {
  const prevSpeechById = new Map(
    (prev ?? [])
      .filter((x): x is SpeechAction => x.type === 'speech')
      .map((x) => [x.id, x] as const),
  );

  return next.map((action) => {
    if (action.type !== 'speech') return action;
    const sa = action as SpeechAction;
    const oldSp = prevSpeechById.get(sa.id);
    if (!oldSp) {
      return { ...sa, audioUrl: undefined, audioId: undefined };
    }
    if (oldSp.text !== sa.text) {
      return { ...sa, audioUrl: undefined, audioId: undefined };
    }
    if (sa.audioUrl) return sa;
    return { ...sa, audioUrl: oldSp.audioUrl, audioId: oldSp.audioId };
  });
}

/**
 * Central rules: page body / whiteboard change invalidates all speech audio for that scene;
 * actions-only updates use per-segment text comparison.
 */
export function applySceneUpdatesWithSpeechTtsInvalidation(
  prev: Scene,
  updates: Partial<Scene>,
): Scene {
  let actions = prev.actions;

  if (updates.actions !== undefined) {
    actions = mergeSpeechActionsInvalidatingStaleTts(prev.actions, updates.actions);
  }

  if (updates.content !== undefined || updates.whiteboards !== undefined) {
    actions = stripSpeechAudioFromActions(actions);
  }

  return {
    ...prev,
    ...updates,
    actions,
    updatedAt: Date.now(),
  };
}
