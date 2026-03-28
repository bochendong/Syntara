import type { Scene } from '@/lib/types/stage';
import type { SpeechAction } from '@/lib/types/action';

export type SceneSpeechTtsBanner =
  | { variant: 'none' }
  | { variant: 'browser' }
  | { variant: 'tts_disabled' }
  | { variant: 'ready'; segments: number }
  | { variant: 'pending'; ready: number; total: number };

export function getSceneSpeechTtsBanner(
  scene: Scene | null | undefined,
  opts: { ttsEnabled: boolean; ttsProviderId: string },
): SceneSpeechTtsBanner {
  const speech =
    scene?.actions?.filter((a): a is SpeechAction => a.type === 'speech' && Boolean(a.text?.trim())) ??
    [];
  if (speech.length === 0) return { variant: 'none' };
  if (!opts.ttsEnabled) return { variant: 'tts_disabled' };
  if (opts.ttsProviderId === 'browser-native-tts') return { variant: 'browser' };
  const withUrl = speech.filter((s) => Boolean(s.audioUrl));
  if (withUrl.length === speech.length) return { variant: 'ready', segments: speech.length };
  return { variant: 'pending', ready: withUrl.length, total: speech.length };
}
