/**
 * Playback Storage - Persist playback engine state to IndexedDB
 *
 * Stores minimal state needed to resume playback from a breakpoint:
 * position (sceneIndex + actionIndex) and consumed discussions.
 */

const KEY_PREFIX = 'synatra-playback:';

export interface PlaybackSnapshot {
  sceneIndex: number;
  actionIndex: number;
  consumedDiscussions: string[];
  sceneId?: string; // Scene this snapshot belongs to; discard on mismatch
}

/**
 * Save playback state for a stage.
 * Each stage has at most one playback state record.
 */
export async function savePlaybackState(
  stageId: string,
  snapshot: PlaybackSnapshot,
): Promise<void> {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(
    `${KEY_PREFIX}${stageId}`,
    JSON.stringify({
      stageId,
      sceneIndex: snapshot.sceneIndex,
      actionIndex: snapshot.actionIndex,
      consumedDiscussions: snapshot.consumedDiscussions,
      sceneId: snapshot.sceneId,
      updatedAt: Date.now(),
    }),
  );
}

/**
 * Load playback state for a stage.
 * Returns null if no saved state exists.
 */
export async function loadPlaybackState(stageId: string): Promise<PlaybackSnapshot | null> {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(`${KEY_PREFIX}${stageId}`);
  const record = raw ? (JSON.parse(raw) as PlaybackSnapshot | null) : null;
  if (!record) return null;

  return {
    sceneIndex: record.sceneIndex,
    actionIndex: record.actionIndex,
    consumedDiscussions: record.consumedDiscussions,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sceneId: (record as any).sceneId as string | undefined,
  };
}

/**
 * Clear playback state for a stage (e.g. on playback complete or stop).
 */
export async function clearPlaybackState(stageId: string): Promise<void> {
  if (typeof window !== 'undefined') sessionStorage.removeItem(`${KEY_PREFIX}${stageId}`);
}
