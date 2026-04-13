import { create } from 'zustand';
import type { Stage, Scene, StageMode } from '@/lib/types/stage';
import { createSelectors } from '@/lib/utils/create-selectors';
import type { ChatSession } from '@/lib/types/chat';
import type { SceneOutline } from '@/lib/types/generation';
import type { CurrentPageGenerationData } from '@/lib/utils/current-page-generation-data';
import { getCurrentPageGenerationData } from '@/lib/utils/current-page-generation-data';
import { createLogger } from '@/lib/logger';
import { applySceneUpdatesWithSpeechTtsInvalidation } from '@/lib/audio/speech-tts-invalidation';
import { queueWriteStageDraftSnapshot } from '@/lib/utils/stage-draft-snapshot';

const log = createLogger('StageStore');

/** Virtual scene ID used when the user navigates to a page still being generated */
export const PENDING_SCENE_ID = '__pending__';

// ==================== Debounce Helper ====================

/**
 * Debounce function to limit how often a function is called
 * @param func Function to debounce
 * @param delay Delay in milliseconds
 */
function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  func: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, delay);
  };
}

function writeDraftSnapshotForState(
  stage: Stage | null,
  scenes: Scene[],
  currentSceneId: string | null,
) {
  if (!stage?.id) return;
  queueWriteStageDraftSnapshot(
    stage.id,
    {
      stage,
      scenes,
      currentSceneId,
    },
    false,
  );
}

type ToolbarState = 'design' | 'ai';

interface StageState {
  // Stage info
  stage: Stage | null;

  // Scenes
  scenes: Scene[];
  currentSceneId: string | null;

  // Chats
  chats: ChatSession[];

  // Mode
  mode: StageMode;

  // UI state
  toolbarState: ToolbarState;
  storageSaveState: 'idle' | 'saving' | 'saved' | 'error';
  storageSaveScope: 'remote' | 'draft';
  storageSavedAt: number | null;
  storageSaveError: string | null;

  // Transient generation state (not persisted)
  generatingOutlines: SceneOutline[];

  // Persisted outlines for resume-on-refresh
  outlines: SceneOutline[];

  // Transient generation tracking (not persisted)
  generationEpoch: number;
  generationStatus: 'idle' | 'generating' | 'paused' | 'completed' | 'error';
  currentGeneratingOrder: number;
  failedOutlines: SceneOutline[];
  fallbackUsageCount: number;

  // Actions
  setStage: (stage: Stage) => void;
  setScenes: (scenes: Scene[]) => void;
  addScene: (scene: Scene) => void;
  updateScene: (sceneId: string, updates: Partial<Scene>) => void;
  /** Shallow-copy scenes array after in-place mutation (e.g. speech audioUrl) to trigger persist */
  touchScenes: () => void;
  deleteScene: (sceneId: string) => void;
  setCurrentSceneId: (sceneId: string | null) => void;
  setChats: (chats: ChatSession[]) => void;
  setMode: (mode: StageMode) => void;
  setToolbarState: (state: ToolbarState) => void;
  setGeneratingOutlines: (outlines: SceneOutline[]) => void;
  setOutlines: (outlines: SceneOutline[]) => void;
  setGenerationStatus: (status: 'idle' | 'generating' | 'paused' | 'completed' | 'error') => void;
  setCurrentGeneratingOrder: (order: number) => void;
  bumpGenerationEpoch: () => void;
  addFailedOutline: (outline: SceneOutline) => void;
  clearFailedOutlines: () => void;
  retryFailedOutline: (outlineId: string) => void;
  incrementFallbackUsageCount: (delta?: number) => void;
  resetFallbackUsageCount: () => void;

  // Getters
  getCurrentScene: () => Scene | null;
  getSceneById: (sceneId: string) => Scene | null;
  getSceneIndex: (sceneId: string) => number;
  getCurrentPageGenerationData: () => CurrentPageGenerationData | null;
  getPageGenerationDataBySceneId: (sceneId: string) => CurrentPageGenerationData | null;

  // Storage
  saveToStorage: () => Promise<void>;
  loadFromStorage: (stageId: string) => Promise<void>;
  clearStore: () => void;
}

const useStageStoreBase = create<StageState>()((set, get) => ({
  // Initial state
  stage: null,
  scenes: [],
  currentSceneId: null,
  chats: [],
  mode: 'playback',
  toolbarState: 'ai',
  storageSaveState: 'idle',
  storageSaveScope: 'remote',
  storageSavedAt: null,
  storageSaveError: null,
  generatingOutlines: [],
  outlines: [],
  generationEpoch: 0,
  generationStatus: 'idle' as const,
  currentGeneratingOrder: -1,
  failedOutlines: [],
  fallbackUsageCount: 0,

  // Actions
  setStage: (stage) => {
    set((s) => ({
      stage,
      scenes: [],
      currentSceneId: null,
      chats: [],
      generationEpoch: s.generationEpoch + 1,
      fallbackUsageCount: Math.max(0, Math.round(stage.fallbackUsageCount || 0)),
      storageSaveState: 'saving',
      storageSaveError: null,
    }));
    debouncedSave();
  },

  setScenes: (scenes) => {
    set({ scenes, storageSaveState: 'saving', storageSaveError: null });
    // Auto-select first scene if no current scene
    const nextCurrentSceneId = !get().currentSceneId && scenes.length > 0 ? scenes[0].id : get().currentSceneId;
    if (nextCurrentSceneId !== get().currentSceneId) {
      set({ currentSceneId: nextCurrentSceneId });
    }
    writeDraftSnapshotForState(get().stage, scenes, nextCurrentSceneId);
    debouncedSave();
  },

  addScene: (scene) => {
    const currentStage = get().stage;
    // Ignore scenes from different stages (prevents race condition during generation)
    if (!currentStage || scene.stageId !== currentStage.id) {
      log.warn(
        `Ignoring scene "${scene.title}" - stageId mismatch (scene: ${scene.stageId}, current: ${currentStage?.id})`,
      );
      return;
    }
    const scenes = [...get().scenes, scene];
    // Remove the matching outline from generatingOutlines (match by order)
    const generatingOutlines = get().generatingOutlines.filter((o) => o.order !== scene.order);
    // Auto-switch from pending page to the newly generated scene
    const shouldSwitch = get().currentSceneId === PENDING_SCENE_ID;
    set({
      scenes,
      generatingOutlines,
      storageSaveState: 'saving',
      storageSaveError: null,
      ...(shouldSwitch ? { currentSceneId: scene.id } : {}),
    });
    writeDraftSnapshotForState(currentStage, scenes, shouldSwitch ? scene.id : get().currentSceneId);
    debouncedSave();
  },

  updateScene: (sceneId, updates) => {
    const scenes = get().scenes.map((scene) =>
      scene.id === sceneId ? applySceneUpdatesWithSpeechTtsInvalidation(scene, updates) : scene,
    );
    set({ scenes, storageSaveState: 'saving', storageSaveError: null });
    writeDraftSnapshotForState(get().stage, scenes, get().currentSceneId);
    debouncedSave();
  },

  touchScenes: () => {
    set((s) => ({
      scenes: [...s.scenes],
      storageSaveState: 'saving',
      storageSaveError: null,
    }));
    const state = get();
    writeDraftSnapshotForState(state.stage, state.scenes, state.currentSceneId);
    debouncedSave();
  },

  deleteScene: (sceneId) => {
    const scenes = get().scenes.filter((scene) => scene.id !== sceneId);
    const currentSceneId = get().currentSceneId;

    // If deleted scene was current, select next or previous
    if (currentSceneId === sceneId) {
      const index = get().getSceneIndex(sceneId);
      const newIndex = index < scenes.length ? index : scenes.length - 1;
      set({
        scenes,
        storageSaveState: 'saving',
        storageSaveError: null,
        currentSceneId: scenes[newIndex]?.id || null,
      });
      writeDraftSnapshotForState(get().stage, scenes, scenes[newIndex]?.id || null);
    } else {
      set({ scenes, storageSaveState: 'saving', storageSaveError: null });
      writeDraftSnapshotForState(get().stage, scenes, get().currentSceneId);
    }
    debouncedSave();
  },

  setCurrentSceneId: (sceneId) => {
    set({ currentSceneId: sceneId });
    writeDraftSnapshotForState(get().stage, get().scenes, sceneId);
    debouncedSave();
  },

  setChats: (chats) => {
    set({ chats });
  },

  setMode: (mode) => set({ mode }),

  setToolbarState: (toolbarState) => set({ toolbarState }),

  setGeneratingOutlines: (generatingOutlines) => set({ generatingOutlines }),

  setOutlines: (outlines) => {
    set({ outlines });
    // Persist outlines to sessionStorage (deprecated local fallback)
    const stageId = get().stage?.id;
    if (stageId && typeof window !== 'undefined') {
      sessionStorage.setItem(`stage-outlines:${stageId}`, JSON.stringify(outlines));
    }
  },

  setGenerationStatus: (generationStatus) => set({ generationStatus }),

  setCurrentGeneratingOrder: (currentGeneratingOrder) => set({ currentGeneratingOrder }),

  bumpGenerationEpoch: () => set((s) => ({ generationEpoch: s.generationEpoch + 1 })),

  addFailedOutline: (outline) => {
    const existed = get().failedOutlines.some((o) => o.id === outline.id);
    if (existed) return;
    set({ failedOutlines: [...get().failedOutlines, outline] });
  },

  clearFailedOutlines: () => set({ failedOutlines: [] }),

  retryFailedOutline: (outlineId) => {
    set({
      failedOutlines: get().failedOutlines.filter((o) => o.id !== outlineId),
    });
  },

  incrementFallbackUsageCount: (delta = 1) => {
    if (!Number.isFinite(delta) || delta <= 0) return;
    const increment = Math.round(delta);
    set((s) => {
      const nextFallbackUsageCount = s.fallbackUsageCount + increment;
      return {
        fallbackUsageCount: nextFallbackUsageCount,
        stage: s.stage
          ? {
              ...s.stage,
              fallbackUsageCount: nextFallbackUsageCount,
            }
          : s.stage,
        storageSaveState: 'saving',
        storageSaveError: null,
      };
    });
    const state = get();
    writeDraftSnapshotForState(state.stage, state.scenes, state.currentSceneId);
    debouncedSave();
  },

  resetFallbackUsageCount: () => {
    set((s) => ({
      fallbackUsageCount: 0,
      stage: s.stage
        ? {
            ...s.stage,
            fallbackUsageCount: 0,
          }
        : s.stage,
      storageSaveState: 'saving',
      storageSaveError: null,
    }));
    const state = get();
    writeDraftSnapshotForState(state.stage, state.scenes, state.currentSceneId);
    debouncedSave();
  },

  // Getters
  getCurrentScene: () => {
    const { scenes, currentSceneId } = get();
    if (!currentSceneId) return null;
    return scenes.find((s) => s.id === currentSceneId) || null;
  },

  getSceneById: (sceneId) => {
    return get().scenes.find((s) => s.id === sceneId) || null;
  },

  getSceneIndex: (sceneId) => {
    return get().scenes.findIndex((s) => s.id === sceneId);
  },

  getCurrentPageGenerationData: () => {
    const { scenes, outlines, currentSceneId } = get();
    return getCurrentPageGenerationData({
      scenes,
      outlines,
      sceneId: currentSceneId,
    });
  },

  getPageGenerationDataBySceneId: (sceneId) => {
    const { scenes, outlines } = get();
    return getCurrentPageGenerationData({
      scenes,
      outlines,
      sceneId,
    });
  },

  // Storage methods
  saveToStorage: async () => {
    const { stage, scenes, currentSceneId, chats } = get();
    if (!stage?.id) {
      log.warn('Cannot save: stage.id is required');
      return;
    }

    try {
      const { saveStageData } = await import('@/lib/utils/stage-storage');
      set({ storageSaveState: 'saving', storageSaveError: null });
      const result = await saveStageData(stage.id, {
        stage,
        scenes,
        currentSceneId,
        chats,
      });
      set({
        storageSaveState: 'saved',
        storageSaveScope: result.remoteSynced ? 'remote' : 'draft',
        storageSavedAt: Date.now(),
        storageSaveError: null,
      });
    } catch (error) {
      log.error('Failed to save to storage:', error);
      set({
        storageSaveState: 'error',
        storageSaveError: error instanceof Error ? error.message : 'Failed to save',
      });
    }
  },

  loadFromStorage: async (stageId: string) => {
    try {
      // Skip IndexedDB load if the store already has this stage with scenes
      // (e.g. navigated from generation-preview with fresh in-memory data)
      const currentState = get();
      if (currentState.stage?.id === stageId && currentState.scenes.length > 0) {
        log.info('Stage already loaded in memory, skipping IndexedDB load:', stageId);
        return;
      }

      const { loadStageData } = await import('@/lib/utils/stage-storage');
      const data = await loadStageData(stageId);

      // Load outlines for resume-on-refresh (sessionStorage fallback)
      const outlines =
        typeof window !== 'undefined'
          ? (JSON.parse(sessionStorage.getItem(`stage-outlines:${stageId}`) || '[]') as SceneOutline[])
          : [];

      if (data) {
        const loadedScenes = Array.isArray(data.scenes) ? data.scenes : [];
        const loadedChats = Array.isArray(data.chats) ? data.chats : [];
        const pendingOutlines = outlines.filter((o) => !loadedScenes.some((s) => s.order === o.order));
        const resolvedCurrentSceneId =
          data.currentSceneId && loadedScenes.some((scene) => scene.id === data.currentSceneId)
            ? data.currentSceneId
            : loadedScenes[0]?.id ||
              (pendingOutlines.length > 0 ? PENDING_SCENE_ID : null);
        set({
          stage: data.stage,
          scenes: loadedScenes,
          currentSceneId: resolvedCurrentSceneId,
          chats: loadedChats,
          outlines,
          fallbackUsageCount: Math.max(0, Math.round(data.stage.fallbackUsageCount || 0)),
          storageSaveState: 'idle',
          storageSaveScope: 'remote',
          storageSavedAt: null,
          storageSaveError: null,
          // Compute generatingOutlines from persisted outlines minus completed scenes
          generatingOutlines: pendingOutlines,
        });
        log.info('Loaded from storage:', stageId);
      } else {
        log.warn('No data found for stage:', stageId);
      }
    } catch (error) {
      log.error('Failed to load from storage:', error);
      throw error;
    }
  },

  clearStore: () => {
    set((s) => ({
      stage: null,
      scenes: [],
      currentSceneId: null,
      chats: [],
      outlines: [],
      storageSaveState: 'idle',
      storageSaveScope: 'remote',
      storageSavedAt: null,
      storageSaveError: null,
      generationEpoch: s.generationEpoch + 1,
      generationStatus: 'idle' as const,
      currentGeneratingOrder: -1,
      failedOutlines: [],
      generatingOutlines: [],
      fallbackUsageCount: 0,
    }));
    log.info('Store cleared');
  },
}));

export const useStageStore = createSelectors(useStageStoreBase);

// ==================== Debounced Save ====================

/**
 * Debounced version of saveToStorage to prevent excessive writes
 * Waits 500ms after the last change before saving
 */
const debouncedSave = debounce(() => {
  useStageStore.getState().saveToStorage();
}, 500);
