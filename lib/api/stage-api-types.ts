/**
 * Stage API - Type Definitions
 *
 * Shared types used across all stage-api sub-modules.
 */

import type {
  Stage,
  Scene,
  SceneContent,
  SceneGenerationDiagnostics,
  SceneType,
  StageMode,
} from '@/lib/types/stage';
import type { Action } from '@/lib/types/action';

// ==================== Type Definitions ====================

/**
 * API operation result
 */
export interface APIResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Scene creation parameters
 */
export interface CreateSceneParams {
  type: SceneType;
  title: string;
  content?: Partial<SceneContent>;
  order?: number;
  actions?: Action[];
  generationDiagnostics?: SceneGenerationDiagnostics;
}

// ==================== Store Interface ====================

/**
 * Stage Store interface (for dependency injection)
 */
export interface StageStore {
  getState: () => {
    stage: Stage | null;
    scenes: Scene[];
    currentSceneId: string | null;
    mode: StageMode;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setState: (partial: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subscribe: (listener: (state: any, prevState: any) => void) => () => void;
}
