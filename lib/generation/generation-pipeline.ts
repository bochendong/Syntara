/**
 * Two-Stage Generation Pipeline
 *
 * Barrel re-export — all symbols previously exported from this file
 * are now spread across focused sub-modules.
 */

// Types
export type {
  AgentInfo,
  CoursePersonalizationContext,
  SceneActionContinuityContext,
  SceneActionCourseSpineContext,
  SceneActionFocusPlanItem,
  SceneActionNarrationPolicy,
  SceneGenerationContext,
  GeneratedSlideData,
  GenerationResult,
  GenerationCallbacks,
  AICallFn,
} from './pipeline-types';

// Prompt formatters
export {
  buildCourseContext,
  formatCoursePersonalizationForPrompt,
  formatSlideRewriteContext,
  formatSceneContentProfileContext,
  formatAgentsForPrompt,
  formatTeacherPersonaForPrompt,
  formatImageDescription,
  formatImagePlaceholder,
  buildVisionUserContent,
} from './prompt-formatters';

// JSON repair
export { parseJsonResponse, tryParseJson } from './json-repair';

// Outline generator (Stage 1)
export { generateSceneOutlinesFromRequirements, applyOutlineFallbacks } from './outline-generator';

// Scene generator (Stage 2)
export {
  generateFullScenes,
  generateSceneContent,
  normalizeImageFirstHeroOutlineForSceneContent,
  buildValidatedFallbackSlideContent,
  buildFallbackSlideContentFromOutline,
  generateSceneActions,
  buildFallbackSceneActions,
  createSceneWithActions,
} from './scene-generator';

// Scene builder (standalone)
export {
  buildSceneFromOutline,
  buildCompleteScene,
  uniquifyMediaElementIds,
} from './scene-builder';

// Pipeline runner
export { createGenerationSession, runGenerationPipeline } from './pipeline-runner';
