import type { SceneOutline } from '@/lib/types/generation';

export function coerceRuntimeSceneOutline(outline: SceneOutline): SceneOutline {
  const runtimeType = (outline as { type?: string }).type;
  if (runtimeType !== 'summary') return outline;

  return {
    ...outline,
    type: 'slide',
    archetype: 'summary',
    layoutIntent: {
      ...outline.layoutIntent,
      layoutFamily: 'summary',
      layoutTemplate: 'two_by_one_summary',
      teachingFlow: outline.layoutIntent?.teachingFlow ?? 'concept_explain',
      visualRole: outline.layoutIntent?.visualRole ?? 'none',
      overflowPolicy: outline.layoutIntent?.overflowPolicy ?? 'compress_first',
    },
  };
}
