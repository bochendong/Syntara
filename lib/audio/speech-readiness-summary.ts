import type { Action, SpeechAction } from '@/lib/types/action';
import type { Scene } from '@/lib/types/stage';

export type SpeechReadinessStatus = 'no_speech' | 'ready' | 'pending';

export interface SpeechReadinessSummary {
  total: number;
  ready: number;
  pending: number;
  status: SpeechReadinessStatus;
}

export function summarizeSpeechReadinessFromActions(
  actions: Action[] | undefined,
): SpeechReadinessSummary {
  const speech = (actions || []).filter(
    (action): action is SpeechAction => action.type === 'speech' && Boolean(action.text?.trim()),
  );
  const total = speech.length;
  const ready = speech.filter((action) => Boolean(action.audioUrl)).length;
  const pending = Math.max(0, total - ready);
  const status: SpeechReadinessStatus =
    total === 0 ? 'no_speech' : pending === 0 ? 'ready' : 'pending';
  return { total, ready, pending, status };
}

export function summarizeSpeechReadinessFromScenes(
  scenes: Pick<Scene, 'actions'>[],
): SpeechReadinessSummary {
  let total = 0;
  let ready = 0;

  for (const scene of scenes) {
    const summary = summarizeSpeechReadinessFromActions(scene.actions);
    total += summary.total;
    ready += summary.ready;
  }

  const pending = Math.max(0, total - ready);
  const status: SpeechReadinessStatus =
    total === 0 ? 'no_speech' : pending === 0 ? 'ready' : 'pending';
  return { total, ready, pending, status };
}
