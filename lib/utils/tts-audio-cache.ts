/**
 * Client-side IndexedDB cache for TTS audio (same text + provider + voice + speed → reuse, saves API tokens).
 */

import type { Scene } from '@/lib/types/stage';
import type { SpeechAction, SpeechVisemeCue } from '@/lib/types/action';
import { createLogger } from '@/lib/logger';

const log = createLogger('TtsAudioCache');

const DB_NAME = 'openmaic-tts-audio';
const STORE = 'clips';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
  });
}

function fallbackTtsCacheKey(payload: string): string {
  let h = 5381;
  for (let i = 0; i < payload.length; i++) {
    h = (Math.imul(33, h) ^ payload.charCodeAt(i)) >>> 0;
  }
  return `fb_${h.toString(16)}_${payload.length}`;
}

/** Stable key for cache lookups (SHA-256 hex of provider|voice|speed|text). */
export async function buildTtsCacheKey(
  providerId: string,
  voice: string,
  speed: number,
  text: string,
): Promise<string> {
  const payload = `${providerId}\0${voice}\0${speed}\0${text}`;
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
  return fallbackTtsCacheKey(payload);
}

export async function getCachedTtsAudio(
  cacheKey: string,
): Promise<{ format: string; base64: string; visemes?: SpeechVisemeCue[] } | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(cacheKey);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const row = req.result as
          | { format?: string; base64?: string; visemes?: SpeechVisemeCue[] }
          | undefined;
        db.close();
        if (row?.format && row?.base64) {
          resolve({ format: row.format, base64: row.base64, visemes: row.visemes });
        } else resolve(null);
      };
    });
  } catch (e) {
    log.warn('TTS cache read failed:', e);
    return null;
  }
}

export async function setCachedTtsAudio(
  cacheKey: string,
  format: string,
  base64: string,
  visemes?: SpeechVisemeCue[],
): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put({
        key: cacheKey,
        format,
        base64,
        visemes,
        createdAt: Date.now(),
      });
    });
    db.close();
  } catch (e) {
    log.warn('TTS cache write failed:', e);
  }
}

export interface TtsCacheParams {
  providerId: string;
  voice: string;
  speed: number;
}

/**
 * Fill missing speech audioUrl from IndexedDB cache (no network).
 * @returns true if at least one action was updated
 */
export async function hydrateSpeechAudioFromTtsCache(
  scene: Scene | null | undefined,
  params: TtsCacheParams,
): Promise<boolean> {
  if (!scene?.actions?.length || typeof indexedDB === 'undefined') return false;
  let touched = false;
  for (const action of scene.actions) {
    if (action.type !== 'speech') continue;
    const sa = action as SpeechAction;
    if (!sa.text?.trim() || sa.audioUrl) continue;
    const key = await buildTtsCacheKey(params.providerId, params.voice, params.speed, sa.text);
    const hit = await getCachedTtsAudio(key);
    if (hit) {
      sa.audioUrl = `data:audio/${hit.format};base64,${hit.base64}`;
      if (hit.visemes?.length) sa.visemes = hit.visemes;
      touched = true;
    }
  }
  return touched;
}
