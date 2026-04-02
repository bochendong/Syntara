import { createLogger } from '@/lib/logger';
import type { Stage, Scene } from '@/lib/types/stage';
import type { Action, SpeechAction } from '@/lib/types/action';

const log = createLogger('StageDraftSnapshot');

const DB_NAME = 'openmaic-stage-drafts';
const DB_VERSION = 1;
const STORE = 'drafts';
const STAGE_DRAFT_KEY_PREFIX = 'openmaic-stage-draft:';
const STAGE_DRAFT_PERSISTENT_KEY_PREFIX = 'openmaic-stage-draft-persistent:';

type StageDraftRecord = {
  id: string;
  snapshot: StageDraftSnapshot;
};

let nextWriteToken = 1;
const latestWriteTokenByStage = new Map<string, number>();

export interface StageDraftSnapshot {
  savedAt: number;
  stage: Stage;
  scenes: Scene[];
  currentSceneId: string | null;
  remoteSynced: boolean;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
  });
}

export function sanitizeActionsForPersistence(actions: Action[] | undefined): Action[] | undefined {
  if (!actions?.length) return actions;
  return actions.map((action) => {
    if (action.type !== 'speech') return action;
    const speech = action as SpeechAction;
    return {
      ...speech,
      audioId: undefined,
      audioUrl: undefined,
      visemes: undefined,
      mouthCues: undefined,
    };
  });
}

export function sanitizeScenesForPersistence(scenes: Scene[]): Scene[] {
  return [...scenes]
    .sort((a, b) => a.order - b.order)
    .map((scene) => ({
      ...scene,
      actions: sanitizeActionsForPersistence(scene.actions),
    }));
}

function buildSnapshot(args: {
  stage: Stage;
  scenes: Scene[];
  currentSceneId: string | null;
  remoteSynced: boolean;
}): StageDraftSnapshot {
  return {
    savedAt: Date.now(),
    stage: args.stage,
    scenes: sanitizeScenesForPersistence(args.scenes),
    currentSceneId: args.currentSceneId,
    remoteSynced: args.remoteSynced,
  };
}

function parseSnapshot(raw: string | null): StageDraftSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StageDraftSnapshot>;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.savedAt !== 'number' ||
      !parsed.stage ||
      !Array.isArray(parsed.scenes)
    ) {
      return null;
    }
    return {
      savedAt: parsed.savedAt,
      stage: parsed.stage as Stage,
      scenes: parsed.scenes as Scene[],
      currentSceneId:
        typeof parsed.currentSceneId === 'string' || parsed.currentSceneId === null
          ? parsed.currentSceneId
          : null,
      remoteSynced: parsed.remoteSynced !== false,
    };
  } catch {
    return null;
  }
}

function readLegacySnapshot(stageId: string): StageDraftSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const sessionSnapshot = parseSnapshot(sessionStorage.getItem(`${STAGE_DRAFT_KEY_PREFIX}${stageId}`));
    const persistentSnapshot = parseSnapshot(
      localStorage.getItem(`${STAGE_DRAFT_PERSISTENT_KEY_PREFIX}${stageId}`),
    );

    if (!sessionSnapshot) return persistentSnapshot;
    if (!persistentSnapshot) return sessionSnapshot;
    return sessionSnapshot.savedAt >= persistentSnapshot.savedAt
      ? sessionSnapshot
      : persistentSnapshot;
  } catch {
    return null;
  }
}

function clearLegacySnapshot(stageId: string) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(`${STAGE_DRAFT_KEY_PREFIX}${stageId}`);
    localStorage.removeItem(`${STAGE_DRAFT_PERSISTENT_KEY_PREFIX}${stageId}`);
  } catch {
    // ignore cleanup errors
  }
}

async function readIndexedDbSnapshot(stageId: string): Promise<StageDraftSnapshot | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await openDb();
  try {
    const row = await new Promise<StageDraftRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(stageId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return row?.snapshot ?? null;
  } finally {
    db.close();
  }
}

async function writeIndexedDbSnapshot(stageId: string, snapshot: StageDraftSnapshot): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is unavailable in this browser context.');
  }
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put({ id: stageId, snapshot } satisfies StageDraftRecord);
    });
  } finally {
    db.close();
  }
}

function writeLegacySnapshot(stageId: string, snapshot: StageDraftSnapshot): void {
  if (typeof window === 'undefined') return;
  const serialized = JSON.stringify(snapshot);
  sessionStorage.setItem(`${STAGE_DRAFT_KEY_PREFIX}${stageId}`, serialized);
  localStorage.setItem(`${STAGE_DRAFT_PERSISTENT_KEY_PREFIX}${stageId}`, serialized);
}

export async function readStageDraftSnapshot(stageId: string): Promise<StageDraftSnapshot | null> {
  const indexedSnapshot = await readIndexedDbSnapshot(stageId).catch((error) => {
    log.warn('Failed to read draft snapshot from IndexedDB:', error);
    return null;
  });
  const legacySnapshot = readLegacySnapshot(stageId);

  if (!indexedSnapshot && !legacySnapshot) return null;

  const preferred =
    indexedSnapshot && legacySnapshot
      ? indexedSnapshot.savedAt >= legacySnapshot.savedAt
        ? indexedSnapshot
        : legacySnapshot
      : indexedSnapshot ?? legacySnapshot;

  if (
    preferred &&
    preferred === legacySnapshot &&
    (!indexedSnapshot || legacySnapshot!.savedAt > indexedSnapshot.savedAt)
  ) {
    void writeIndexedDbSnapshot(stageId, preferred)
      .then(() => clearLegacySnapshot(stageId))
      .catch(() => {
        // keep legacy snapshot if migration fails
      });
  }

  return preferred;
}

export async function writeStageDraftSnapshot(
  stageId: string,
  data: Pick<StageDraftSnapshot, 'stage' | 'scenes' | 'currentSceneId'>,
  remoteSynced: boolean,
): Promise<void> {
  const writeToken = nextWriteToken++;
  latestWriteTokenByStage.set(stageId, writeToken);
  const snapshot = buildSnapshot({
    stage: data.stage,
    scenes: data.scenes,
    currentSceneId: data.currentSceneId,
    remoteSynced,
  });

  try {
    if (latestWriteTokenByStage.get(stageId) !== writeToken) return;
    await writeIndexedDbSnapshot(stageId, snapshot);
    if (latestWriteTokenByStage.get(stageId) !== writeToken) return;
    clearLegacySnapshot(stageId);
    return;
  } catch (indexedError) {
    try {
      if (latestWriteTokenByStage.get(stageId) !== writeToken) return;
      writeLegacySnapshot(stageId, snapshot);
      return;
    } catch (legacyError) {
      log.warn('Failed to persist draft snapshot:', {
        indexedError,
        legacyError,
      });
    }
  }
}

export function queueWriteStageDraftSnapshot(
  stageId: string,
  data: Pick<StageDraftSnapshot, 'stage' | 'scenes' | 'currentSceneId'>,
  remoteSynced: boolean,
): void {
  void writeStageDraftSnapshot(stageId, data, remoteSynced);
}

export async function clearStageDraftSnapshot(stageId: string): Promise<void> {
  clearLegacySnapshot(stageId);
  if (typeof indexedDB === 'undefined') return;
  const db = await openDb().catch(() => null);
  if (!db) return;
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).delete(stageId);
    });
  } catch {
    // ignore cleanup errors
  } finally {
    db.close();
  }
}
