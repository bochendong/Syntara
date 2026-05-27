import type { PdfImage } from '@/lib/types/generation';

export interface StoredGenerationContext {
  pdfImages?: PdfImage[];
  agents?: unknown[];
  userProfile?: string;
  courseContext?: unknown;
}

const LEGACY_KEY = 'generationParams';
const MAX_GENERATION_CONTEXT_BYTES = 256 * 1024;

function getScopedKey(stageId: string): string {
  return `generationParams:${stageId}`;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function stripInlinePdfImageSrc(pdfImages: PdfImage[] | undefined): PdfImage[] | undefined {
  return pdfImages?.map((image) => ({
    ...image,
    src: '',
    description: image.description?.slice(0, 600),
  }));
}

function sanitizeGenerationContext(context: StoredGenerationContext): StoredGenerationContext {
  return {
    ...context,
    pdfImages: stripInlinePdfImageSrc(context.pdfImages),
  };
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

function trySetStorageJson(storage: Storage, key: string, value: StoredGenerationContext): boolean {
  const serialized = JSON.stringify(sanitizeGenerationContext(value));
  if (byteLength(serialized) > MAX_GENERATION_CONTEXT_BYTES) {
    try {
      storage.removeItem(key);
    } catch {
      /* ignore cleanup */
    }
    return false;
  }
  try {
    storage.setItem(key, serialized);
    return true;
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      /* ignore cleanup */
    }
    return false;
  }
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
    try {
      localStorage.removeItem(getScopedKey(stageId));
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* ignore legacy cleanup */
    }
    return fromLocal;
  }

  return null;
}

export function writeGenerationContext(stageId: string, context: StoredGenerationContext): void {
  if (typeof window === 'undefined' || !stageId.trim()) return;
  trySetStorageJson(sessionStorage, getScopedKey(stageId), context);
  trySetStorageJson(sessionStorage, LEGACY_KEY, context);
  try {
    localStorage.removeItem(getScopedKey(stageId));
  } catch {
    /* The generation context is recoverable; storage cleanup must not block generation. */
  }
}
