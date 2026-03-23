import { create } from 'zustand';
import type { Snapshot } from '@/lib/utils/database';
import { useStageStore } from './stage';
import type { Scene } from '@/lib/types/stage';

export interface SnapshotState {
  // State
  snapshotCursor: number; // Snapshot pointer
  snapshotLength: number; // Snapshot count

  // Computed
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Actions
  setSnapshotCursor: (cursor: number) => void;
  setSnapshotLength: (length: number) => void;
  initSnapshotDatabase: () => Promise<void>;
  addSnapshot: () => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

/**
 * Snapshot store for undo/redo functionality
 * Based on PPTist's snapshot store, migrated to Zustand
 *
 * Uses in-memory snapshot history (per-tab)
 */
let snapshotsMemory: Snapshot[] = [];

export const useSnapshotStore = create<SnapshotState>((set, get) => ({
  // Initial state
  snapshotCursor: -1,
  snapshotLength: 0,

  // Computed properties
  canUndo: () => get().snapshotCursor > 0,
  canRedo: () => get().snapshotCursor < get().snapshotLength - 1,

  // Actions
  setSnapshotCursor: (cursor: number) => set({ snapshotCursor: cursor }),
  setSnapshotLength: (length: number) => set({ snapshotLength: length }),

  /**
   * Initialize snapshot database with current state
   */
  initSnapshotDatabase: async () => {
    const stageStore = useStageStore.getState();

    const newFirstSnapshot = {
      index: stageStore.getSceneIndex(stageStore.currentSceneId || ''),
      slides: JSON.parse(JSON.stringify(stageStore.scenes)),
    };
    snapshotsMemory = [newFirstSnapshot];

    set({
      snapshotCursor: 0,
      snapshotLength: 1,
    });
  },

  /**
   * Add a new snapshot to the history
   * Handles snapshot length limit and cursor position
   */
  addSnapshot: async () => {
    const stageStore = useStageStore.getState();
    const { snapshotCursor } = get();

    let next = snapshotsMemory.slice();

    // If cursor is not at the end, delete all snapshots after cursor
    // This happens when user undoes multiple times then performs a new action
    if (snapshotCursor >= 0 && snapshotCursor < next.length - 1) {
      next = next.slice(0, snapshotCursor + 1);
    }

    // Add new snapshot
    const snapshot = {
      index: stageStore.getSceneIndex(stageStore.currentSceneId || ''),
      slides: JSON.parse(JSON.stringify(stageStore.scenes)),
    };
    next.push(snapshot);

    // Calculate new snapshot length
    let snapshotLength = next.length;

    // Enforce snapshot length limit
    const snapshotLengthLimit = 20;
    if (snapshotLength > snapshotLengthLimit) {
      next = next.slice(next.length - snapshotLengthLimit);
      snapshotLength--;
    }

    // Maintain page focus after undo
    if (snapshotLength >= 2) {
      const currentSceneIndex = stageStore.getSceneIndex(stageStore.currentSceneId || '');
      next[snapshotLength - 2] = { ...next[snapshotLength - 2], index: currentSceneIndex };
    }
    snapshotsMemory = next;

    set({
      snapshotCursor: snapshotLength - 1,
      snapshotLength,
    });
  },

  /**
   * Undo: restore previous snapshot
   */
  undo: async () => {
    const { snapshotCursor } = get();
    if (snapshotCursor <= 0) return;

    const stageStore = useStageStore.getState();

    const newSnapshotCursor = snapshotCursor - 1;
    const snapshot = snapshotsMemory[newSnapshotCursor];
    const { index, slides } = snapshot;

    const sceneIndex = index > slides.length - 1 ? slides.length - 1 : index;

    // Restore scenes and current scene
    stageStore.setScenes(slides as unknown as Scene[]); // Type assertion needed due to Slide vs Scene difference
    if (slides[sceneIndex]) {
      stageStore.setCurrentSceneId(slides[sceneIndex].id);
    }

    set({ snapshotCursor: newSnapshotCursor });
  },

  /**
   * Redo: restore next snapshot
   */
  redo: async () => {
    const { snapshotCursor, snapshotLength } = get();
    if (snapshotCursor >= snapshotLength - 1) return;

    const stageStore = useStageStore.getState();

    const newSnapshotCursor = snapshotCursor + 1;
    const snapshot = snapshotsMemory[newSnapshotCursor];
    const { index, slides } = snapshot;

    const sceneIndex = index > slides.length - 1 ? slides.length - 1 : index;

    // Restore scenes and current scene
    stageStore.setScenes(slides as unknown as Scene[]); // Type assertion needed due to Slide vs Scene difference
    if (slides[sceneIndex]) {
      stageStore.setCurrentSceneId(slides[sceneIndex].id);
    }

    set({ snapshotCursor: newSnapshotCursor });
  },
}));
