import type { SceneOutline } from '@/lib/types/generation';
import { db } from '@/lib/utils/database';

const SESSION_KEY_PREFIX = 'stage-outlines:';
const PERSISTENT_KEY_PREFIX = 'stage-outlines-persistent:';

type PersistedStageOutlines = {
  savedAt: number;
  outlines: SceneOutline[];
};

function parsePersistedOutlines(raw: string | null): PersistedStageOutlines | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedStageOutlines>;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.savedAt !== 'number' ||
      !Array.isArray(parsed.outlines)
    ) {
      return null;
    }
    return {
      savedAt: parsed.savedAt,
      outlines: parsed.outlines as SceneOutline[],
    };
  } catch {
    return null;
  }
}

export function writePersistedStageOutlines(stageId: string, outlines: SceneOutline[]): void {
  if (typeof window === 'undefined') return;
  void db.stageOutlines
    .put({
      stageId,
      outlines,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    .catch(() => {
      /* Outline persistence should never block generation. */
    });
}

export function readPersistedStageOutlines(stageId: string): SceneOutline[] {
  if (typeof window === 'undefined') return [];
  const sessionSnapshot = parsePersistedOutlines(
    sessionStorage.getItem(`${SESSION_KEY_PREFIX}${stageId}`),
  );
  const persistentSnapshot = parsePersistedOutlines(
    localStorage.getItem(`${PERSISTENT_KEY_PREFIX}${stageId}`),
  );
  const preferred =
    sessionSnapshot && persistentSnapshot
      ? sessionSnapshot.savedAt >= persistentSnapshot.savedAt
        ? sessionSnapshot
        : persistentSnapshot
      : (sessionSnapshot ?? persistentSnapshot);
  return preferred?.outlines ?? [];
}

export async function readPersistedStageOutlinesAsync(stageId: string): Promise<SceneOutline[]> {
  if (typeof window === 'undefined') return [];
  const row = await db.stageOutlines.get(stageId).catch(() => null);
  if (row?.outlines?.length) return row.outlines;
  return readPersistedStageOutlines(stageId);
}

export function clearPersistedStageOutlines(stageId: string): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(`${SESSION_KEY_PREFIX}${stageId}`);
  localStorage.removeItem(`${PERSISTENT_KEY_PREFIX}${stageId}`);
  void db.stageOutlines.delete(stageId).catch(() => {
    /* ignore */
  });
}
