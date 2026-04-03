/**
 * Image/PDF 临时缓存：仅存内存 Map，不写 sessionStorage，避免大文件 base64 撑爆 ~5MB 配额。
 * 刷新页面会丢失；load* 仍尝试读旧版 session 键以兼容历史数据。
 */

import { nanoid } from 'nanoid';

type MemoryEntry = { kind: 'image' | 'source'; value: string | Blob; createdAt: number };
const memoryStore = new Map<string, MemoryEntry>();
const SESSION_PREFIX = 'synatra-image-storage:';

function isStorageQuotaError(e: unknown): boolean {
  return (
    e instanceof DOMException &&
    (e.name === 'QuotaExceededError' || e.code === 22)
  );
}

/** 配额溢出时抛出，便于在创建页等位置直接展示给用户 */
function throwSessionStorageQuotaExceeded(contextDetail?: string): never {
  const quotaHint =
    '浏览器为每个网站分配的 sessionStorage 通常只有约 5MB，且同一标签里其它数据（如生成会话、PDF/图片的 base64）共用这一额度。';
  const suggest = '可尝试：压缩 PDF、缩小或裁剪图片、减少页数/素材数量，或关闭本页其它步骤占用后重试。';
  const msg = [contextDetail?.trim(), quotaHint, suggest].filter(Boolean).join(' ');
  throw new Error(msg);
}

function writeSessionStorageRaw(storageKey: string, serialized: string, contextDetail?: string) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(storageKey, serialized);
  } catch (e) {
    if (isStorageQuotaError(e)) {
      throwSessionStorageQuotaExceeded(contextDetail);
    }
    throw new Error(
      `写入浏览器 sessionStorage 失败：${e instanceof Error ? e.message : String(e)}（键：${storageKey.length > 48 ? `${storageKey.slice(0, 48)}…` : storageKey}）`,
      { cause: e },
    );
  }
}

/**
 * 写入任意 sessionStorage 键（JSON），配额溢出时错误说明与 PDF/图片缓存一致。
 * 用于 `generationSession` 等大对象。
 */
export function setSessionStorageJson(key: string, value: unknown, contextDetail?: string): void {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch (e) {
    throw new Error('无法序列化待写入 sessionStorage 的内容。', { cause: e });
  }
  writeSessionStorageRaw(key, serialized, contextDetail);
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

export async function storeSourceBlob(file: File): Promise<string> {
  const key = `source_${nanoid(10)}`;
  const blob = new Blob([await file.arrayBuffer()], { type: file.type || 'application/octet-stream' });
  memoryStore.set(key, { kind: 'source', value: blob, createdAt: Date.now() });
  return key;
}

export async function loadSourceBlob(key: string): Promise<Blob | null> {
  const mem = memoryStore.get(key);
  if (mem?.kind === 'source' && mem.value instanceof Blob) return mem.value;
  const session = getSessionItem<{ kind: 'source'; value: string }>(key);
  if (!session?.value) return null;
  const [meta, data] = session.value.split(',');
  if (!meta || !data) return null;
  const mime = meta.match(/data:(.*?);base64/)?.[1] || 'application/octet-stream';
  const byteString = atob(data);
  const bytes = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function storePdfBlob(file: File): Promise<string> {
  return storeSourceBlob(file);
}

export async function loadPdfBlob(key: string): Promise<Blob | null> {
  return loadSourceBlob(key);
}
