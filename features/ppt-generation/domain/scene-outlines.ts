export { buildPrompt, PROMPT_IDS } from '@/lib/generation/prompts';
export { normalizeSceneOutlineContentProfile } from '@/lib/generation/content-profile';
export { normalizeComputerScienceSceneOutline } from '@/lib/generation/cs-semantic-normalizer';
export { normalizeOutlineStructure } from '@/lib/generation/outline-structure';
export { attachDeckMemoryToOutlines } from '@/lib/generation/deck-memory';
export {
  attachGeneratedTeachingPlan,
  buildTeachingPlan,
  formatTeachingPlanForOutlinePrompt,
} from '@/lib/generation/teaching-plan';
export {
  buildVisionUserContent,
  formatImageDescription,
  formatImagePlaceholder,
  formatTeacherPersonaForPrompt,
  uniquifyMediaElementIds,
} from '@/lib/generation/generation-pipeline';
export type { AgentInfo } from '@/lib/generation/generation-pipeline';
export type {
  ImageMapping,
  PdfImage,
  SceneOutline,
  UserRequirements,
} from '@/lib/types/generation';
