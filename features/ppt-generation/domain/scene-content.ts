export {
  applyOutlineFallbacks,
  buildVisionUserContent,
  generateSceneContent,
  normalizeImageFirstHeroOutlineForSceneContent,
} from '@/lib/generation/generation-pipeline';
export type { AgentInfo, CoursePersonalizationContext } from '@/lib/generation/generation-pipeline';
export { normalizeComputerScienceSceneOutline } from '@/lib/generation/cs-semantic-normalizer';
export { flattenGeneratedSlideContentPages } from '@/lib/generation/continuation-pages';
export {
  normalizeNotebookSlideGenerationRoute,
  normalizeSlideGenerationRoute,
} from '@/lib/generation/slide-generation-route';
export type { ImageMapping, PdfImage, SceneOutline } from '@/lib/types/generation';
