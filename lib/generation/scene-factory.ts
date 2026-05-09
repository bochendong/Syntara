import { nanoid } from 'nanoid';
import { createStageAPI } from '@/lib/api/stage-api';
import { markSemanticSlideContent } from '@/lib/notebook-content/semantic-slide-render';
import { normalizeSlideTextLayout } from '@/lib/slide-text-layout';
import type {
  GeneratedInteractiveContent,
  GeneratedPBLContent,
  GeneratedQuizContent,
  GeneratedSlideContent,
  SceneOutline,
} from '@/lib/types/generation';
import type { Action } from '@/lib/types/action';
import type { Slide, SlideTheme } from '@/lib/types/slides';
import type { SceneGenerationDiagnostics } from '@/lib/types/stage';

export function createSceneWithActions(
  outline: SceneOutline,
  content:
    | GeneratedSlideContent
    | GeneratedQuizContent
    | GeneratedInteractiveContent
    | GeneratedPBLContent,
  actions: Action[],
  api: ReturnType<typeof createStageAPI>,
  generationDiagnostics?: SceneGenerationDiagnostics,
): string | null {
  if (outline.type === 'slide' && 'elements' in content) {
    const defaultTheme: SlideTheme = {
      backgroundColor: '#ffffff',
      themeColors: ['#5b9bd5', '#ed7d31', '#a5a5a5', '#ffc000', '#4472c4'],
      fontColor: '#333333',
      fontName: 'Microsoft YaHei',
      outline: { color: '#d14424', width: 2, style: 'solid' },
      shadow: { h: 0, v: 0, blur: 10, color: '#000000' },
    };

    const slide: Slide = {
      id: nanoid(),
      viewportSize: 1000,
      viewportRatio: 0.5625,
      theme: content.theme || defaultTheme,
      elements: content.contentDocument
        ? content.elements
        : normalizeSlideTextLayout(content.elements),
      background: content.background,
    };

    const sceneResult = api.scene.create({
      type: 'slide',
      title: outline.title,
      order: outline.order,
      content: markSemanticSlideContent({
        type: 'slide',
        canvas: slide,
        syntaraMarkup: content.syntaraMarkup,
        semanticDocument: content.contentDocument,
      }),
      actions,
      generationDiagnostics,
    });

    return sceneResult.success ? (sceneResult.data ?? null) : null;
  }

  if (outline.type === 'quiz' && 'questions' in content) {
    const sceneResult = api.scene.create({
      type: 'quiz',
      title: outline.title,
      order: outline.order,
      content: {
        type: 'quiz',
        questions: content.questions,
      },
      actions,
      generationDiagnostics,
    });

    return sceneResult.success ? (sceneResult.data ?? null) : null;
  }

  if (outline.type === 'interactive' && 'html' in content) {
    const sceneResult = api.scene.create({
      type: 'interactive',
      title: outline.title,
      order: outline.order,
      content: {
        type: 'interactive',
        url: '',
        html: content.html,
      },
      actions,
      generationDiagnostics,
    });

    return sceneResult.success ? (sceneResult.data ?? null) : null;
  }

  if (outline.type === 'pbl' && 'projectConfig' in content) {
    const sceneResult = api.scene.create({
      type: 'pbl',
      title: outline.title,
      order: outline.order,
      content: {
        type: 'pbl',
        projectConfig: content.projectConfig,
      },
      actions,
      generationDiagnostics,
    });

    return sceneResult.success ? (sceneResult.data ?? null) : null;
  }

  return null;
}
