'use client';

import { useEffect } from 'react';
import {
  buildTitleCoverOpeningActions,
  buildTitleCoverSlideContentFromParts,
  hasTitleCoverOpeningAction,
  hasTitleCoverVersionMarker,
  shouldUpgradeLegacyTitleCoverContent,
} from '@/lib/generation/title-cover';
import type { Scene, Stage as StageRecord } from '@/lib/types/stage';

export function useTitleCoverUpgrade({
  scenes,
  stage,
  stageLanguage,
  updateScene,
}: {
  scenes: Scene[];
  stage: StageRecord | null | undefined;
  stageLanguage?: string | null;
  updateScene: (sceneId: string, updates: Partial<Scene>) => void;
}) {
  useEffect(() => {
    const firstScene = scenes.find((scene) => scene.order === 1);
    const titleSignals = `${stage?.name || ''} ${stage?.description || ''} ${firstScene?.title || ''}`;
    const firstSceneText =
      firstScene?.content.type === 'slide'
        ? firstScene.content.canvas.elements
            .filter((element) => element.type === 'text')
            .map((element) => element.content || '')
            .join(' ')
        : '';
    const positiveTitleSignals = titleSignals
      .replace(/不包含[:：][\s\S]*/g, ' ')
      .replace(/不包括[:：][\s\S]*/g, ' ')
      .replace(/\b(excluding|does not include|not included|do not include)\b[\s\S]*/gi, ' ');
    const hasWrongModularCover =
      /MODULAR ARITHMETIC/.test(firstSceneText) &&
      !/同余|模运算|模\s*\d+|模数|余数|congruence|modular|modulo|mod\s+\d+/i.test(
        positiveTitleSignals,
      );
    const hasWrongComputingCover =
      /COMPUTING/.test(firstSceneText) &&
      !/code|program|代码|程序|编程|python|javascript|typescript|数据结构|oop|object[-\s]*oriented|class|instance|attribute|method|constructor|initializer|__init__|self|tweet|twitter|userid|created_at|likes|面向对象|类|实例|对象|属性|方法|构造器|初始化器|推文|点赞|作者|日期/i.test(
        positiveTitleSignals,
      );
    const hasWrongGenericMathCover =
      /学习笔记|LEARNING NOTEBOOK/.test(firstSceneText) &&
      /mat|proof|证明|函数|映射|linear|algebra|calculus|math|同余|模运算|整除|线性|丢番图|素数|整数|数论|最大公约数|gcd|方程/.test(
        positiveTitleSignals,
      );
    const hasCurrentPosterCover = /syntara-cover-v12/.test(firstSceneText);
    const hasOldTitleCoverScaffold =
      !hasCurrentPosterCover &&
      /阅读路线|自学地图|READING ROUTE|Self-study map|核心问题|文本路径|生活练习/.test(
        firstSceneText,
      );

    if (
      !stage ||
      !firstScene ||
      firstScene.type !== 'slide' ||
      firstScene.content.type !== 'slide'
    ) {
      return;
    }

    const coverNeedsUpgrade =
      hasWrongModularCover ||
      hasWrongComputingCover ||
      hasWrongGenericMathCover ||
      hasOldTitleCoverScaffold ||
      shouldUpgradeLegacyTitleCoverContent({
        title: titleSignals,
        elements: firstScene.content.canvas.elements,
      });
    const openingNarrationMissing =
      (coverNeedsUpgrade || hasTitleCoverVersionMarker(firstScene.content.canvas.elements)) &&
      !hasTitleCoverOpeningAction(firstScene.actions);

    if (!coverNeedsUpgrade && !openingNarrationMissing) {
      return;
    }

    const language = (stage.language || stageLanguage) === 'en-US' ? 'en-US' : 'zh-CN';
    const content = coverNeedsUpgrade
      ? buildTitleCoverSlideContentFromParts({
          title: firstScene.title || stage.name,
          description: stage.description,
          language,
        })
      : null;
    const elements = content?.elements || firstScene.content.canvas.elements;
    const updates: Partial<Scene> = {
      updatedAt: Date.now(),
      actions: buildTitleCoverOpeningActions({
        title: firstScene.title || stage.name,
        description: stage.description,
        language,
        elements,
      }),
    };

    if (content) {
      updates.content = {
        ...firstScene.content,
        canvas: {
          ...firstScene.content.canvas,
          theme: content.theme || firstScene.content.canvas.theme,
          elements: content.elements,
          background: content.background,
          viewportSize: firstScene.content.canvas.viewportSize ?? 1000,
          viewportRatio: firstScene.content.canvas.viewportRatio ?? 0.5625,
        },
        syntaraMarkup: content.syntaraMarkup,
        semanticDocument: content.contentDocument,
        semanticRenderMode: undefined,
        semanticRenderVersion: undefined,
      };
    }

    updateScene(firstScene.id, updates);
  }, [scenes, stage, stageLanguage, updateScene]);
}
