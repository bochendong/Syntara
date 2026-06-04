'use client';

import type { Scene } from '@/lib/types/stage';
import type { MouthCue, SpeechAction, SpeechVisemeCue } from '@/lib/types/action';
import { createLogger } from '@/lib/logger';
import { verbalizeNarrationText } from '@/lib/audio/spoken-text';
import { backendJson } from '@/lib/utils/backend-api';

const log = createLogger('TtsAudioAssets');

function fallbackSpeechAudioAssetKey(payload: string): string {
  let h = 5381;
  for (let i = 0; i < payload.length; i += 1) {
    h = (Math.imul(33, h) ^ payload.charCodeAt(i)) >>> 0;
  }
  return `fb_${h.toString(16)}_${payload.length}`;
}

/** Stable key for user-owned speech audio (SHA-256 hex of user|action|provider|voice|speed|text). */
export async function buildUserSpeechAudioAssetKey(
  userId: string,
  actionId: string,
  providerId: string,
  voice: string,
  speed: number,
  text: string,
): Promise<string> {
  const payload = `${userId || 'anonymous'}\0${actionId}\0${providerId}\0${voice}\0${speed}\0${text}`;
  try {
    if (typeof crypto?.subtle?.digest === 'function') {
      const data = new TextEncoder().encode(payload);
      const digest = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {
    // non-secure context or subtle unavailable
  }
  return fallbackSpeechAudioAssetKey(payload);
}

export type UserSpeechAudioAsset = {
  format: string;
  base64: string;
  visemes?: SpeechVisemeCue[];
  mouthCues?: MouthCue[];
};

export async function getUserSpeechAudioAsset(
  assetKey: string,
): Promise<UserSpeechAudioAsset | null> {
  try {
    const data = await backendJson<{ audio: UserSpeechAudioAsset | null }>(
      `/api/user-speech-audio?key=${encodeURIComponent(assetKey)}`,
    );
    return data.audio;
  } catch (error) {
    log.warn('User speech audio lookup failed:', error);
    return null;
  }
}

export interface UserSpeechAudioAssetParams {
  userId: string;
  providerId: string;
  voice: string;
  speed: number;
}

/**
 * Fill missing speech audioUrl from the current user's private speech assets.
 * @returns true if at least one action was updated
 */
export async function hydrateSpeechAudioFromUserAssets(
  scene: Scene | null | undefined,
  params: UserSpeechAudioAssetParams,
): Promise<boolean> {
  if (!scene?.actions?.length) return false;
  let touched = false;
  for (const action of scene.actions) {
    if (action.type !== 'speech') continue;
    const sa = action as SpeechAction;
    if (!sa.text?.trim() || sa.audioUrl) continue;
    const key = await buildUserSpeechAudioAssetKey(
      params.userId,
      sa.audioId || `tts_${sa.id}`,
      params.providerId,
      params.voice,
      params.speed,
      verbalizeNarrationText(sa.text),
    );
    const hit = await getUserSpeechAudioAsset(key);
    if (hit) {
      sa.audioUrl = `data:audio/${hit.format};base64,${hit.base64}`;
      if (hit.visemes?.length) sa.visemes = hit.visemes;
      if (hit.mouthCues?.length) sa.mouthCues = hit.mouthCues;
      touched = true;
    }
  }
  return touched;
}
