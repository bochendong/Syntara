import type { LectureNoteEntry, LectureNoteItem, LectureNoteVisualCue } from '@/lib/types/chat';
import type { Scene } from '@/lib/types/stage';
import type {
  Action,
  DiscussionAction,
  LaserAction,
  SemanticStepAction,
  SpeechAction,
  SpotlightAction,
} from '@/lib/types/action';

function visualCueForAction(action: Action): LectureNoteVisualCue | undefined {
  if (action.type === 'spotlight') {
    return {
      type: 'spotlight',
      actionId: action.id,
      elementId: (action as SpotlightAction).elementId,
    };
  }
  if (action.type === 'laser') {
    return {
      type: 'laser',
      actionId: action.id,
      elementId: (action as LaserAction).elementId,
    };
  }
  if (action.type === 'semantic_step') {
    const semanticAction = action as SemanticStepAction;
    return {
      type: 'semantic_step',
      actionId: action.id,
      blockId: semanticAction.blockId,
      stepIndex: semanticAction.stepIndex,
    };
  }
  return undefined;
}

/** 与 ChatArea「笔记」Tab 一致：从场景 actions 生成授课笔记列表 */
export function buildLectureNotesFromScenes(scenes: Scene[]): LectureNoteEntry[] {
  return scenes
    .filter((scene) => scene.actions && scene.actions.length > 0)
    .map((scene) => {
      const items: LectureNoteItem[] = [];
      let pendingVisualCues: LectureNoteVisualCue[] = [];
      let speechIndex = 0;

      for (const [actionIndex, action] of scene.actions!.entries()) {
        const visualCue = visualCueForAction(action);

        if (
          action.type === 'spotlight' ||
          action.type === 'laser' ||
          action.type === 'semantic_step'
        ) {
          if (visualCue) {
            pendingVisualCues = [...pendingVisualCues, visualCue];
          }
          items.push({
            kind: 'action',
            id: action.id,
            actionIndex,
            type: action.type,
            visualCue,
          });
          continue;
        }

        if (action.type === 'speech') {
          items.push({
            kind: 'speech',
            id: action.id,
            actionIndex,
            speechIndex,
            text: (action as SpeechAction).text,
            visualCues: pendingVisualCues,
          });
          pendingVisualCues = [];
          speechIndex += 1;
          continue;
        }

        if (action.type === 'play_video' || action.type === 'discussion') {
          items.push({
            kind: 'action',
            id: action.id,
            actionIndex,
            type: action.type,
            label: action.type === 'discussion' ? (action as DiscussionAction).topic : undefined,
          });
        }
        pendingVisualCues = [];
      }

      return {
        sceneId: scene.id,
        sceneTitle: scene.title,
        sceneOrder: scene.order,
        items,
        completedAt: scene.updatedAt || scene.createdAt || 0,
      };
    })
    .sort((a, b) => a.sceneOrder - b.sceneOrder);
}
