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
import {
  readPersistedStageOutlinesAsync,
  writePersistedStageOutlines,
} from '@/lib/utils/stage-outline-storage';
import { normalizeOutlineStructure } from '@/lib/generation/outline-structure';
import { refreshSemanticSlideScene } from '@/lib/notebook-content/semantic-slide-render';

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

function orderScenes(scenes: Scene[]): Scene[] {
  return scenes
    .map((scene, index) => ({ scene, index }))
    .sort((a, b) => {
      const orderDelta = (a.scene.order || 0) - (b.scene.order || 0);
      if (orderDelta !== 0) return orderDelta;

      const createdDelta = (a.scene.createdAt || 0) - (b.scene.createdAt || 0);
      if (createdDelta !== 0) return createdDelta;

      return a.index - b.index;
    })
    .map(({ scene }) => scene);
}

const WORKED_EXAMPLE_LABEL_PATTERN =
  /(例题|例|题目|问题|problem|example|exercise)\s*[\d一二三四五六七八九十]+/i;

const WORKED_EXAMPLE_PART_PATTERN =
  /\s*[\(（\[]\s*(?:第\s*)?(?:part\s*)?[\d一二三四五六七八九十]+\s*(?:\/\s*[\d一二三四五六七八九十]+)?\s*(?:部分|页|段|part)?\s*[\)）\]]\s*/i;

const SUMMARY_SCENE_PATTERN =
  /(总结|小结|回顾|收束|复盘|复习要点|结论|summary|recap|wrap[-\s]?up|takeaways?)/i;

function stripWorkedExamplePartTitle(title: string): string {
  return title.replace(WORKED_EXAMPLE_PART_PATTERN, '').trim();
}

function stripWorkedExamplePartMarkers<T>(value: T): T {
  if (typeof value === 'string') {
    return value
      .replace(WORKED_EXAMPLE_PART_PATTERN, '')
      .replace(/\\\\(?=[a-zA-Z()[\]])/g, '\\')
      .replace(/\\{1,2}[;,!]/g, ' ') as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripWorkedExamplePartMarkers(item)) as T;
  }
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [
      key,
      stripWorkedExamplePartMarkers(entryValue),
    ]),
  ) as T;
}

function getWorkedExampleSceneSignature(scene: Scene): string | null {
  if (scene.type !== 'slide') return null;
  if (scene.content.type !== 'slide') return null;
  if (!WORKED_EXAMPLE_PART_PATTERN.test(scene.title)) return null;

  const title = stripWorkedExamplePartTitle(scene.title);
  const label = title.match(WORKED_EXAMPLE_LABEL_PATTERN)?.[0]?.trim();
  if (!label) return null;
  return label.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

function mergeSplitWorkedExampleScenes(scenes: Scene[]): Scene[] {
  const merged: Scene[] = [];
  let activeGroup: Scene[] = [];
  let activeSignature: string | null = null;

  const flushActiveGroup = () => {
    if (activeGroup.length === 0) return;
    if (activeGroup.length === 1) {
      merged.push(activeGroup[0]);
    } else {
      merged.push(mergeWorkedExampleSceneGroup(activeGroup));
    }
    activeGroup = [];
    activeSignature = null;
  };

  for (const scene of scenes) {
    const signature = getWorkedExampleSceneSignature(scene);
    if (!signature) {
      flushActiveGroup();
      merged.push(scene);
      continue;
    }

    if (activeSignature === signature) {
      activeGroup.push(scene);
      continue;
    }

    flushActiveGroup();
    activeSignature = signature;
    activeGroup = [scene];
  }

  flushActiveGroup();
  return merged.map((scene, index) => ({ ...scene, order: index + 1 }));
}

function isSummaryScene(scene: Scene): boolean {
  if (scene.type !== 'slide' || scene.content.type !== 'slide') return false;
  if (scene.content.semanticDocument?.archetype === 'summary') return true;
  if (scene.content.semanticDocument?.layoutFamily === 'summary') return true;
  return SUMMARY_SCENE_PATTERN.test(scene.title);
}

function sceneRichnessScore(scene: Scene): number {
  return scene.title.length * 2 + JSON.stringify(scene.content).length;
}

function chooseRicherScene(current: Scene, candidate: Scene): Scene {
  return sceneRichnessScore(candidate) > sceneRichnessScore(current) ? candidate : current;
}

function compactDuplicateSummaryScenes(scenes: Scene[]): Scene[] {
  const summaries = scenes.filter(isSummaryScene);
  if (summaries.length <= 1) return scenes;

  const finalSummary = summaries.reduce(chooseRicherScene, summaries[0]);
  const mainScenes = scenes.filter((scene) => !isSummaryScene(scene));
  return [...mainScenes, finalSummary].map((scene, index) => ({ ...scene, order: index + 1 }));
}

function cleanSceneResidualMarkup(scene: Scene): Scene {
  if (scene.type !== 'slide' || scene.content.type !== 'slide') return scene;
  return {
    ...scene,
    title: stripWorkedExamplePartMarkers(scene.title),
    content: {
      ...scene.content,
      canvas: stripWorkedExamplePartMarkers(scene.content.canvas),
      syntaraMarkup: stripWorkedExamplePartMarkers(scene.content.syntaraMarkup),
      semanticDocument: stripWorkedExamplePartMarkers(scene.content.semanticDocument),
    },
  };
}

function normalizeSceneStructure(scenes: Scene[]): Scene[] {
  return compactDuplicateSummaryScenes(mergeSplitWorkedExampleScenes(orderScenes(scenes))).map(
    (scene, index) => ({
      ...cleanSceneResidualMarkup(scene),
      order: index + 1,
    }),
  );
}

function mergeWorkedExampleSceneGroup(group: Scene[]): Scene {
  const first = group[0];
  if (first.type !== 'slide' || first.content.type !== 'slide') return first;

  const documents = group
    .map((scene) =>
      scene.type === 'slide' && scene.content.type === 'slide'
        ? stripWorkedExamplePartMarkers(scene.content.semanticDocument)
        : undefined,
    )
    .filter(Boolean);
  const title = stripWorkedExamplePartTitle(first.title) || first.title;
  const baseDocument = documents[0];
  const slots = documents.flatMap((document, documentIndex) => {
    if (!document) return [];
    if (document.slots?.length) {
      return document.slots.map((slot, slotIndex) => ({
        ...slot,
        slotId: `part_${documentIndex + 1}_${slotIndex + 1}_${slot.slotId}`.slice(0, 80),
      }));
    }
    return [
      {
        slotId: `part_${documentIndex + 1}`,
        role: document.title || title,
        priority: documentIndex + 1,
        preserve: true,
        blocks: document.blocks,
      },
    ];
  });

  return {
    ...first,
    title,
    content: {
      ...first.content,
      canvas: stripWorkedExamplePartMarkers(first.content.canvas),
      syntaraMarkup: group
        .map((scene) =>
          scene.type === 'slide' && scene.content.type === 'slide'
            ? stripWorkedExamplePartMarkers(scene.content.syntaraMarkup)
            : undefined,
        )
        .filter(Boolean)
        .join('\n\n'),
      semanticDocument: baseDocument
        ? {
            ...baseDocument,
            title,
            blocks: documents.flatMap((document) => document?.blocks || []),
            slots: slots.length > 0 ? slots : undefined,
            continuation: undefined,
          }
        : first.content.semanticDocument,
      webRenderMode: 'scroll',
    },
    updatedAt: Date.now(),
  };
}

function orderOutlines(outlines: SceneOutline[]): SceneOutline[] {
  return outlines
    .map((outline, index) => ({ outline, index }))
    .sort((a, b) => {
      const orderDelta = (a.outline.order || 0) - (b.outline.order || 0);
      return orderDelta !== 0 ? orderDelta : a.index - b.index;
    })
    .map(({ outline }) => outline);
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
  discardPendingOutlines: () => number;
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
    const orderedScenes = normalizeSceneStructure(scenes);
    set({ scenes: orderedScenes, storageSaveState: 'saving', storageSaveError: null });
    // Auto-select first scene if no current scene
    const currentSceneId = get().currentSceneId;
    const nextCurrentSceneId =
      currentSceneId && orderedScenes.some((scene) => scene.id === currentSceneId)
        ? currentSceneId
        : orderedScenes[0]?.id || null;
    if (nextCurrentSceneId !== currentSceneId) {
      set({ currentSceneId: nextCurrentSceneId });
    }
    writeDraftSnapshotForState(get().stage, orderedScenes, nextCurrentSceneId);
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
    const scenes = orderScenes([...get().scenes, scene]);
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
    writeDraftSnapshotForState(
      currentStage,
      scenes,
      shouldSwitch ? scene.id : get().currentSceneId,
    );
    debouncedSave();
  },

  updateScene: (sceneId, updates) => {
    const scenes = orderScenes(
      get().scenes.map((scene) =>
        scene.id === sceneId ? applySceneUpdatesWithSpeechTtsInvalidation(scene, updates) : scene,
      ),
    );
    set({ scenes, storageSaveState: 'saving', storageSaveError: null });
    writeDraftSnapshotForState(get().stage, scenes, get().currentSceneId);
    debouncedSave();
  },

  touchScenes: () => {
    set((s) => ({
      scenes: orderScenes(s.scenes),
      storageSaveState: 'saving',
      storageSaveError: null,
    }));
    const state = get();
    writeDraftSnapshotForState(state.stage, state.scenes, state.currentSceneId);
    debouncedSave();
  },

  deleteScene: (sceneId) => {
    const scenes = orderScenes(get().scenes.filter((scene) => scene.id !== sceneId));
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

  setGeneratingOutlines: (generatingOutlines) =>
    set({ generatingOutlines: orderOutlines(generatingOutlines) }),

  setOutlines: (outlines) => {
    const orderedOutlines = orderOutlines(outlines);
    set({ outlines: orderedOutlines });
    const stageId = get().stage?.id;
    if (stageId) writePersistedStageOutlines(stageId, orderedOutlines);
  },

  setGenerationStatus: (generationStatus) => set({ generationStatus }),

  setCurrentGeneratingOrder: (currentGeneratingOrder) => set({ currentGeneratingOrder }),

  bumpGenerationEpoch: () => set((s) => ({ generationEpoch: s.generationEpoch + 1 })),

  discardPendingOutlines: () => {
    const state = get();
    const completedOrders = new Set(state.scenes.map((scene) => scene.order));
    const pendingOrders = new Set(
      state.outlines
        .filter((outline) => !completedOrders.has(outline.order))
        .map((outline) => outline.order),
    );
    if (pendingOrders.size === 0) return 0;

    const nextOutlines = state.outlines.filter((outline) => completedOrders.has(outline.order));
    const nextGeneratingOutlines = state.generatingOutlines.filter(
      (outline) => !pendingOrders.has(outline.order),
    );
    const nextFailedOutlines = state.failedOutlines.filter(
      (outline) => !pendingOrders.has(outline.order),
    );
    const nextCurrentSceneId =
      state.currentSceneId === PENDING_SCENE_ID
        ? (state.scenes[state.scenes.length - 1]?.id ?? state.scenes[0]?.id ?? null)
        : state.currentSceneId;

    set({
      outlines: nextOutlines,
      generatingOutlines: nextGeneratingOutlines,
      failedOutlines: nextFailedOutlines,
      currentSceneId: nextCurrentSceneId,
      generationStatus: 'idle',
      currentGeneratingOrder: -1,
      storageSaveState: 'saving',
      storageSaveError: null,
    });

    if (state.stage?.id) {
      writePersistedStageOutlines(state.stage.id, nextOutlines);
    }

    writeDraftSnapshotForState(state.stage, state.scenes, nextCurrentSceneId);
    debouncedSave();
    return pendingOrders.size;
  },

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
        const refreshedScenes = normalizeSceneStructure(
          currentState.scenes.map((scene) => refreshSemanticSlideScene(scene)),
        );
        const resolvedCurrentSceneId =
          currentState.currentSceneId &&
          refreshedScenes.some((scene) => scene.id === currentState.currentSceneId)
            ? currentState.currentSceneId
            : refreshedScenes[0]?.id || null;
        set({
          scenes: refreshedScenes,
          currentSceneId: resolvedCurrentSceneId,
        });
        writeDraftSnapshotForState(currentState.stage, refreshedScenes, resolvedCurrentSceneId);
        log.info('Stage already loaded in memory, skipping IndexedDB load:', stageId);
        return;
      }

      const { loadStageData } = await import('@/lib/utils/stage-storage');
      const data = await loadStageData(stageId);

      const rawOutlines = await readPersistedStageOutlinesAsync(stageId);
      const outlines = orderOutlines(
        rawOutlines.length > 1 ? normalizeOutlineStructure(rawOutlines) : rawOutlines,
      );

      if (data) {
        const loadedScenes = Array.isArray(data.scenes) ? normalizeSceneStructure(data.scenes) : [];
        const loadedChats = Array.isArray(data.chats) ? data.chats : [];
        const pendingOutlines = outlines.filter(
          (o) => !loadedScenes.some((s) => s.order === o.order),
        );
        const resolvedCurrentSceneId =
          data.currentSceneId && loadedScenes.some((scene) => scene.id === data.currentSceneId)
            ? data.currentSceneId
            : loadedScenes[0]?.id || (pendingOutlines.length > 0 ? PENDING_SCENE_ID : null);
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
