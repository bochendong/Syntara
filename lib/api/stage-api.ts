/**
 * Stage API - AI Agent Toolkit
 *
 * Provides the Stage operations still used by generation and playback flows.
 *
 * Design Principles:
 * 1. Type Safety: Fully leverage TypeScript's type system
 * 2. Ease of Use: Provide high-level abstractions with clear, intuitive API naming
 * 3. Extensibility: Support adding new scene types in the future
 * 4. Idempotency: Multiple calls with the same parameters produce the same result
 * 5. Error Handling: Return explicit success/failure status and error messages
 *
 * @example
 * ```typescript
 * const api = createStageAPI(stageStore);
 *
 * // Create a new scene
 * const sceneId = api.scene.create({
 *   type: 'slide',
 *   title: 'Introduction',
 *   // speech is now in actions
 * });
 * ```
 */

// Re-export all types
export type { APIResult, CreateSceneParams, StageStore } from './stage-api-types';

// Re-export utility functions that were previously accessible
export {
  generateId,
  validateSceneId,
  getScene,
  createDefaultContent,
  createDefaultSlideContent,
  createDefaultQuizContent,
  createDefaultInteractiveContent,
  createDefaultPBLContent,
} from './stage-api-defaults';

// Import sub-API factories
import { createSceneAPI } from './stage-api-scene';
import { createNavigationAPI } from './stage-api-navigation';
import { createWhiteboardAPI } from './stage-api-whiteboard';
import { createModeAPI, createStageMetaAPI } from './stage-api-mode';
import type { StageStore } from './stage-api-types';

// ==================== Stage API Implementation ====================

/**
 * Create a Stage API instance
 *
 * @param store - Zustand store instance
 * @returns Stage API object
 */
export function createStageAPI(store: StageStore) {
  return {
    scene: createSceneAPI(store),
    navigation: createNavigationAPI(store),
    whiteboard: createWhiteboardAPI(store),
    mode: createModeAPI(store),
    stage: createStageMetaAPI(store),
  };
}

// ==================== Type Exports ====================

export type StageAPI = ReturnType<typeof createStageAPI>;
