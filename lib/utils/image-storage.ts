/**
 * Image/PDF transient storage utilities (session + in-memory).
 * IndexedDB path removed.
 */

import { nanoid } from 'nanoid';

type MemoryEntry = { kind: 'image' | 'pdf'; value: string | Blob; createdAt: number };
const memoryStore = new Map<string, MemoryEntry>();
const SESSION_PREFIX = 'openmaic-image-storage:';

function setSessionItem(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(`${SESSION_PREFIX}${key}`, JSON.stringify(value));
}

function getSessionItem<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(`${SESSION_PREFIX}${key}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function storeImages(
  images: Array<{ id: string; src: string; pageNumber?: number }>,
): Promise<string[]> {
  const sessionId = nanoid(10);
  const ids: string[] = [];
  for (const img of images) {
    const storageId = `session_${sessionId}_${img.id}`;
    memoryStore.set(storageId, { kind: 'image', value: img.src, createdAt: Date.now() });
    setSessionItem(storageId, { kind: 'image', value: img.src, createdAt: Date.now() });
    ids.push(storageId);
  }
  return ids;
}

export async function loadImageMapping(imageIds: string[]): Promise<Record<string, string>> {
  const mapping: Record<string, string> = {};
  for (const storageId of imageIds) {
    const mem = memoryStore.get(storageId);
    const session = getSessionItem<{ kind: 'image'; value: string }>(storageId);
    const src =
      mem?.kind === 'image' && typeof mem.value === 'string'
        ? mem.value
        : session?.kind === 'image'
          ? session.value
          : '';
    if (src) {
      const originalId = storageId.replace(/^session_[^_]+_/, '');
      mapping[originalId] = src;
    }
  }
  return mapping;
}

export async function cleanupSessionImages(sessionId: string): Promise<void> {
  const prefix = `session_${sessionId}_`;
  for (const key of Array.from(memoryStore.keys())) {
    if (key.startsWith(prefix)) {
      memoryStore.delete(key);
      if (typeof window !== 'undefined') sessionStorage.removeItem(`${SESSION_PREFIX}${key}`);
    }
  }
}

export async function cleanupOldImages(hoursOld: number = 24): Promise<void> {
  const cutoff = Date.now() - hoursOld * 60 * 60 * 1000;
  for (const [k, v] of Array.from(memoryStore.entries())) {
    if (v.createdAt < cutoff) {
      memoryStore.delete(k);
      if (typeof window !== 'undefined') sessionStorage.removeItem(`${SESSION_PREFIX}${k}`);
    }
  }
}

export async function getImageStorageSize(): Promise<number> {
  let total = 0;
  for (const v of memoryStore.values()) {
    if (typeof v.value === 'string') total += v.value.length;
    else total += v.value.size;
  }
  return total;
}

export async function storePdfBlob(file: File): Promise<string> {
  const key = `pdf_${nanoid(10)}`;
  const blob = new Blob([await file.arrayBuffer()], { type: file.type || 'application/pdf' });
  memoryStore.set(key, { kind: 'pdf', value: blob, createdAt: Date.now() });
  // session fallback for reload within same tab (base64, potentially large)
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  setSessionItem(key, { kind: 'pdf', value: base64, createdAt: Date.now() });
  return key;
}

export async function loadPdfBlob(key: string): Promise<Blob | null> {
  const mem = memoryStore.get(key);
  if (mem?.kind === 'pdf' && mem.value instanceof Blob) return mem.value;
  const session = getSessionItem<{ kind: 'pdf'; value: string }>(key);
  if (!session?.value) return null;
  const [meta, data] = session.value.split(',');
  if (!meta || !data) return null;
  const mime = meta.match(/data:(.*?);base64/)?.[1] || 'application/pdf';
  const byteString = atob(data);
  const bytes = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
