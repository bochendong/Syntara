import type { PdfImage } from '@/lib/types/generation';

export interface StoredGenerationContext {
  pdfImages?: PdfImage[];
  agents?: unknown[];
  userProfile?: string;
  courseContext?: unknown;
}

const LEGACY_KEY = 'generationParams';

function getScopedKey(stageId: string): string {
  return `generationParams:${stageId}`;
}

function parseStoredGenerationContext(raw: string | null): StoredGenerationContext | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredGenerationContext;
  } catch {
    return null;
  }
}

function readFromStorage(stageId: string, storage: Storage): StoredGenerationContext | null {
  const scoped = parseStoredGenerationContext(storage.getItem(getScopedKey(stageId)));
  if (scoped) return scoped;
  return parseStoredGenerationContext(storage.getItem(LEGACY_KEY));
}

export function readGenerationContext(stageId: string): StoredGenerationContext | null {
  if (typeof window === 'undefined' || !stageId.trim()) return null;

  const fromSession = readFromStorage(stageId, sessionStorage);
  if (fromSession) {
    writeGenerationContext(stageId, fromSession);
    return fromSession;
  }

  const fromLocal = readFromStorage(stageId, localStorage);
  if (fromLocal) {
    writeGenerationContext(stageId, fromLocal);
    return fromLocal;
  }

  return null;
}

export function writeGenerationContext(
  stageId: string,
  context: StoredGenerationContext,
): void {
  if (typeof window === 'undefined' || !stageId.trim()) return;
  const serialized = JSON.stringify(context);
  sessionStorage.setItem(getScopedKey(stageId), serialized);
  sessionStorage.setItem(LEGACY_KEY, serialized);
  localStorage.setItem(getScopedKey(stageId), serialized);
}
