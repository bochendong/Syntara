export {
  buildCompleteScene,
  buildFallbackSceneActions,
  buildVisionUserContent,
  generateSceneActions,
} from '@/lib/generation/generation-pipeline';
export type {
  AgentInfo,
  CoursePersonalizationContext,
  SceneActionContinuityContext,
  SceneActionCourseSpineContext,
  SceneActionFocusPlanItem,
  SceneActionNarrationPolicy,
  SceneGenerationContext,
} from '@/lib/generation/generation-pipeline';
export type {
  GeneratedInteractiveContent,
  GeneratedPBLContent,
  GeneratedQuizContent,
  GeneratedSlideContent,
  SceneOutline,
} from '@/lib/types/generation';
