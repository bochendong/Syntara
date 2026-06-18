import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/notifications/client-toast';
import { runQueuedAiTask } from '@/lib/store/ai-task-queue';
import { backendFetch } from '@/lib/utils/backend-api';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import type { Action } from '@/lib/types/action';
import type { Scene, SlideContent } from '@/lib/types/stage';
import type { SceneOutline } from '@/lib/types/generation';
import type { SlideRepairChatMessage } from '@/lib/types/slide-repair';
import {
  buildRepairAssistantReply,
  buildRepairPendingMessage,
  createRepairMessageId,
  getDefaultRepairRequest,
  inferRepairTargetLanguage,
  repairRequestLooksMathFocused,
  resolveRewriteOutline,
  resolveSlideRepairProfile,
} from '@/components/stage/stage-helpers';
import type { SlideEditorSidebarTab } from '@/components/stage/stage-toolbar-controls';

export function useSlideRepair({
  currentScene,
  currentSlideSceneId,
  stage,
  stageLanguage,
  outlines,
  setOutlines,
  updateScene,
  slideEditorOpen,
  setSlideEditorSidebarTab,
}: {
  currentScene: Scene | undefined;
  currentSlideSceneId: string | null;
  stage: { id: string; name: string } | null | undefined;
  stageLanguage: string | undefined;
  outlines: SceneOutline[];
  setOutlines: (outlines: SceneOutline[]) => void;
  updateScene: (id: string, patch: Partial<Scene>) => void;
  slideEditorOpen: boolean;
  setSlideEditorSidebarTab: (tab: SlideEditorSidebarTab) => void;
}) {
  const [repairDraftByScene, setRepairDraftByScene] = useState<Record<string, string>>({});
  const [repairConversationByScene, setRepairConversationByScene] = useState<
    Record<string, SlideRepairChatMessage[]>
  >({});
  const [pendingRepairSidebarFocus, setPendingRepairSidebarFocus] = useState(false);
  const [repairSidebarFocusNonce, setRepairSidebarFocusNonce] = useState(0);
  const [slideRepairPending, setSlideRepairPending] = useState(false);
  const repairInstructions = useMemo(
    () => (currentSlideSceneId ? (repairDraftByScene[currentSlideSceneId] ?? '') : ''),
    [currentSlideSceneId, repairDraftByScene],
  );
  const repairConversation = useMemo(
    () => (currentSlideSceneId ? (repairConversationByScene[currentSlideSceneId] ?? []) : []),
    [currentSlideSceneId, repairConversationByScene],
  );

  const focusRepairSidebar = useCallback(() => {
    setSlideEditorSidebarTab('ai');
    setRepairSidebarFocusNonce((current) => current + 1);
  }, [setSlideEditorSidebarTab]);

  const requestRepairSidebarFocus = useCallback(() => {
    setPendingRepairSidebarFocus(true);
  }, []);

  const setCurrentSlideRepairDraft = useCallback(
    (value: string) => {
      if (!currentSlideSceneId) return;
      setRepairDraftByScene((prev) => {
        if ((prev[currentSlideSceneId] ?? '') === value) return prev;
        return {
          ...prev,
          [currentSlideSceneId]: value,
        };
      });
    },
    [currentSlideSceneId],
  );

  const saveCurrentSceneActions = useCallback(
    (nextActions: Action[]) => {
      if (!currentScene || currentScene.type !== 'slide') return;
      updateScene(currentScene.id, {
        actions: nextActions,
      });
    },
    [currentScene, updateScene],
  );

  const handleRepairCurrentSlide = useCallback(async () => {
    if (
      slideRepairPending ||
      !currentScene ||
      currentScene.type !== 'slide' ||
      currentScene.content.type !== 'slide' ||
      !stage
    ) {
      return;
    }

    const sceneId = currentScene.id;
    const trimmedDraft = repairInstructions.trim();
    const rewriteLanguage = inferRepairTargetLanguage({
      repairInstructions: trimmedDraft,
      fallbackLanguage: (stageLanguage as 'zh-CN' | 'en-US' | undefined) || 'zh-CN',
    });
    const matchedOutline = resolveRewriteOutline(currentScene, outlines, rewriteLanguage);
    const baseRepairProfile = resolveSlideRepairProfile(currentScene, matchedOutline);
    const repairProfile = repairRequestLooksMathFocused(trimmedDraft) ? 'math' : baseRepairProfile;
    const userMessageContent =
      trimmedDraft || getDefaultRepairRequest(rewriteLanguage, repairProfile);
    const outlineExists = outlines.some((outline) => outline.id === matchedOutline.id);
    const outlineCollection = (outlineExists ? outlines : [...outlines, matchedOutline])
      .slice()
      .sort((a, b) => a.order - b.order);
    const userMessage: SlideRepairChatMessage = {
      id: createRepairMessageId('user'),
      role: 'user',
      content: userMessageContent,
      createdAt: Date.now(),
      status: 'ready',
    };
    const pendingAssistantMessage: SlideRepairChatMessage = {
      id: createRepairMessageId('assistant'),
      role: 'assistant',
      content: buildRepairPendingMessage({
        language: rewriteLanguage,
        profile: repairProfile,
      }),
      createdAt: Date.now() + 1,
      status: 'pending',
    };
    setRepairConversationByScene((prev) => ({
      ...prev,
      [sceneId]: [...(prev[sceneId] ?? []), userMessage, pendingAssistantMessage],
    }));
    setRepairDraftByScene((prev) => ({
      ...prev,
      [sceneId]: '',
    }));
    setSlideRepairPending(true);
    try {
      const modelConfig = getCurrentModelConfig();
      const repairSnapshot =
        currentScene.repairSnapshot ||
        ({
          title: currentScene.title,
          content: JSON.parse(JSON.stringify(currentScene.content)) as SlideContent,
          savedAt: Date.now(),
        } satisfies NonNullable<Scene['repairSnapshot']>);
      const repairRoute =
        repairProfile === 'code'
          ? '/api/classroom/repair-slide-code'
          : repairProfile === 'math'
            ? '/api/classroom/repair-slide-math'
            : '/api/classroom/repair-slide-general';
      const repairResp = await runQueuedAiTask(
        {
          kind: 'slide-repair',
          title: '页面修复',
          description: `正在修复第 ${currentScene.order + 1} 页：${compactTaskText(userMessageContent)}`,
        },
        ({ signal }) =>
          backendFetch(repairRoute, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-model': modelConfig.modelString,
              'x-provider-type': modelConfig.providerType,
              'x-requires-api-key': modelConfig.requiresApiKey ? 'true' : 'false',
            },
            body: JSON.stringify({
              notebookId: stage.id,
              notebookName: stage.name,
              sceneId: currentScene.id,
              sceneOrder: currentScene.order + 1,
              sceneTitle: currentScene.title,
              language: rewriteLanguage,
              content: currentScene.content,
              repairInstructions: userMessageContent,
              repairConversation: [{ role: 'user' as const, content: userMessageContent }],
            }),
            signal,
          }),
      );

      const repairData = (await repairResp.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        sceneTitle?: string;
        assistantReply?: string;
        content?: SlideContent;
      };

      if (!repairResp.ok || !repairData.success || !repairData.content) {
        throw new Error(repairData.error?.trim() || 'AI 重写失败');
      }

      const nextTitle = repairData.sceneTitle?.trim() || currentScene.title;
      const nextOutline: SceneOutline = {
        ...matchedOutline,
        id: matchedOutline.id,
        order: currentScene.order,
        type: 'slide',
        language: rewriteLanguage,
        contentProfile: repairProfile,
        title: nextTitle,
      };
      const nextOutlines = (() => {
        if (outlineCollection.length === 0) return [nextOutline];
        let found = false;
        const updated = outlineCollection.map((outline) => {
          if (outline.id === matchedOutline.id || outline.order === currentScene.order) {
            found = true;
            return nextOutline;
          }
          return outline;
        });
        if (!found) updated.push(nextOutline);
        return updated.slice().sort((a, b) => a.order - b.order);
      })();

      updateScene(currentScene.id, {
        title: nextTitle,
        content: repairData.content,
        repairSnapshot,
        updatedAt: Date.now(),
      });
      setOutlines(nextOutlines);
      setRepairConversationByScene((prev) => ({
        ...prev,
        [sceneId]: (prev[sceneId] ?? []).map((message) =>
          message.id === pendingAssistantMessage.id
            ? {
                ...message,
                content:
                  repairData.assistantReply?.trim() ||
                  buildRepairAssistantReply({
                    language: rewriteLanguage,
                    profile: repairProfile,
                    rewriteReason: userMessageContent,
                    outlineTitle: nextTitle,
                  }),
                status: 'ready',
              }
            : message,
        ),
      }));
      toast.success(
        repairProfile === 'code'
          ? '当前页已完成代码讲解修复'
          : repairProfile === 'math'
            ? '当前页已完成数学内容修复'
            : '当前页已完成通用讲解修复',
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'AI 重写失败';
      setRepairConversationByScene((prev) => ({
        ...prev,
        [sceneId]: (prev[sceneId] ?? []).map((message) =>
          message.id === pendingAssistantMessage.id
            ? {
                ...message,
                content: errorMessage,
                status: 'error',
              }
            : message,
        ),
      }));
      toast.error(errorMessage);
    } finally {
      setSlideRepairPending(false);
    }
  }, [
    currentScene,
    outlines,
    repairInstructions,
    setOutlines,
    slideRepairPending,
    stage,
    stageLanguage,
    updateScene,
  ]);

  useEffect(() => {
    if (!pendingRepairSidebarFocus || !slideEditorOpen) return;
    focusRepairSidebar();
    setPendingRepairSidebarFocus(false);
  }, [focusRepairSidebar, pendingRepairSidebarFocus, slideEditorOpen]);

  const handleRestorePreRepairSlide = useCallback(() => {
    if (
      !currentScene ||
      currentScene.type !== 'slide' ||
      currentScene.content.type !== 'slide' ||
      !currentScene.repairSnapshot
    ) {
      return;
    }

    updateScene(currentScene.id, {
      title: currentScene.repairSnapshot.title,
      content: currentScene.repairSnapshot.content,
      repairSnapshot: undefined,
      updatedAt: Date.now(),
    });
    toast.success('已恢复到重写前的版本');
  }, [currentScene, updateScene]);

  return {
    focusRepairSidebar,
    handleRepairCurrentSlide,
    handleRestorePreRepairSlide,
    repairConversation,
    repairInstructions,
    repairSidebarFocusNonce,
    requestRepairSidebarFocus,
    saveCurrentSceneActions,
    setCurrentSlideRepairDraft,
    slideRepairPending,
  };
}

function compactTaskText(input: string) {
  const text = input.replace(/\s+/g, ' ').trim();
  if (!text) return '当前页面';
  return text.length > 42 ? `${text.slice(0, 39)}...` : text;
}
