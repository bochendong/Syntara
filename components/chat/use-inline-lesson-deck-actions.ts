import {
  useCallback,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { createAgentTask, updateAgentTask } from '@/lib/utils/agent-task-storage';
import { runQueuedAiTask } from '@/lib/store/ai-task-queue';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { loadStageData, saveStageData } from '@/lib/utils/stage-storage';
import type { Scene } from '@/lib/types/stage';
import {
  attachQuestionContextToFirstScene,
  pickInsertIndexWithAI,
  pickSmartInsertIndex,
  summarizeQuestionForContext,
} from './chat-notebook-routing';
import type { NotebookChatMessage } from './chat-page-types';

export function useInlineLessonDeckActions({
  courseId,
  notebookId,
  nbThreadRef,
  setNbThread,
  reloadNotebookScenes,
}: {
  courseId: string | null | undefined;
  notebookId: string | null;
  nbThreadRef: MutableRefObject<NotebookChatMessage[]>;
  setNbThread: Dispatch<SetStateAction<NotebookChatMessage[]>>;
  reloadNotebookScenes: () => Promise<void>;
}) {
  const [lessonGeneratingAt, setLessonGeneratingAt] = useState<number | null>(null);
  const [lessonSavingAt, setLessonSavingAt] = useState<number | null>(null);

  const generateInlineLessonDeck = useCallback(
    async (targetAt: number) => {
      const msg = nbThreadRef.current.find((m) => m.role === 'assistant' && m.at === targetAt);
      if (!msg || msg.role !== 'assistant' || !msg.lessonSourceQuestion) return;
      let taskId: string | null = null;
      if (courseId && notebookId) {
        try {
          taskId = await createAgentTask({
            courseId,
            contactKind: 'notebook',
            contactId: notebookId,
            title: `临时PPT生成：${msg.lessonSourceQuestion.slice(0, 24)}`,
            detail: '正在把题目整理为 3-5 页临时PPT…',
            status: 'running',
          });
        } catch {
          taskId = null;
        }
      }
      setLessonGeneratingAt(targetAt);
      try {
        const mc = getCurrentModelConfig();
        const resp = await runQueuedAiTask(
          {
            kind: 'micro-lesson',
            title: '临时PPT生成',
            description: `正在生成临时PPT：${compactTaskText(msg.lessonSourceQuestion)}`,
          },
          ({ signal }) =>
            fetch('/api/notebooks/micro-lesson', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-model': mc.modelString,
                'x-api-key': mc.apiKey,
                'x-base-url': mc.baseUrl,
                'x-provider-type': mc.providerType || '',
                'x-requires-api-key': mc.requiresApiKey ? 'true' : 'false',
              },
              body: JSON.stringify({
                question: msg.lessonSourceQuestion,
                language: 'zh-CN',
              }),
              signal,
            }),
        );
        const data = (await resp.json()) as {
          success?: boolean;
          scenes?: Scene[];
          data?: { scenes?: Scene[] };
          error?: string;
          details?: string;
        };
        const scenes = data?.scenes || data?.data?.scenes || [];
        if (!resp.ok || data?.success === false || scenes.length === 0) {
          const backendMsg = data?.error?.trim() || data?.details?.trim();
          throw new Error(backendMsg || '生成临时PPT失败，请重试');
        }
        setNbThread((prev) =>
          prev.map((m) =>
            m.role === 'assistant' && m.at === targetAt
              ? { ...m, lessonDeckScenes: scenes, lessonError: undefined }
              : m,
          ),
        );
        if (taskId) {
          await updateAgentTask(taskId, {
            status: 'done',
            detail: `临时PPT已生成（${scenes.length} 页）`,
            notebookId: notebookId || undefined,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '生成临时PPT失败';
        setNbThread((prev) =>
          prev.map((m) =>
            m.role === 'assistant' && m.at === targetAt ? { ...m, lessonError: message } : m,
          ),
        );
        if (taskId) {
          await updateAgentTask(taskId, {
            status: 'failed',
            detail: message.slice(0, 300),
            notebookId: notebookId || undefined,
          });
        }
      } finally {
        setLessonGeneratingAt((cur) => (cur === targetAt ? null : cur));
      }
    },
    [courseId, nbThreadRef, notebookId, setNbThread],
  );

  const saveInlineLessonDeckToNotebook = useCallback(
    async (targetAt: number) => {
      if (!notebookId) return;
      const msg = nbThreadRef.current.find((m) => m.role === 'assistant' && m.at === targetAt);
      if (!msg || msg.role !== 'assistant' || !msg.lessonDeckScenes?.length) return;
      let taskId: string | null = null;
      if (courseId) {
        try {
          taskId = await createAgentTask({
            courseId,
            contactKind: 'notebook',
            contactId: notebookId,
            title: '保存临时PPT到笔记本',
            detail: '正在写入临时PPT页面到笔记本…',
            status: 'running',
          });
        } catch {
          taskId = null;
        }
      }
      setLessonSavingAt(targetAt);
      try {
        const data = await loadStageData(notebookId);
        if (!data?.stage) throw new Error('未找到目标笔记本');
        const current = [...(data.scenes || [])].sort((a, b) => a.order - b.order);
        const questionSummary = summarizeQuestionForContext(msg.lessonSourceQuestion);
        const lessonScenesForSave = msg.lessonDeckScenes.map((scene, idx) =>
          idx === 0 ? attachQuestionContextToFirstScene(scene, questionSummary) : scene,
        );
        const aiPlacement = await pickInsertIndexWithAI({
          notebookTitle: data.stage.name,
          currentScenes: current,
          lessonScenes: lessonScenesForSave,
        });
        const insertAt =
          aiPlacement?.insertAt ?? pickSmartInsertIndex(current, lessonScenesForSave);
        const now = Date.now();
        const inserted = lessonScenesForSave.map((scene, idx) => ({
          ...scene,
          id: `scene_${now}_${idx}_${Math.random().toString(36).slice(2, 8)}`,
          stageId: notebookId,
          order: insertAt + idx,
          createdAt: now,
          updatedAt: now,
        }));
        const merged = [...current.slice(0, insertAt), ...inserted, ...current.slice(insertAt)].map(
          (s, idx) => ({
            ...s,
            order: idx,
            updatedAt: s.updatedAt ?? now,
          }),
        );
        await saveStageData(notebookId, {
          ...data,
          scenes: merged,
          stage: { ...data.stage, updatedAt: now },
        });
        const start = insertAt + 1;
        const end = insertAt + inserted.length;
        const posHint =
          insertAt < current.length
            ? `（${aiPlacement ? 'AI判定' : '规则匹配'}插入到第 ${insertAt} 页后${aiPlacement?.reason ? `：${aiPlacement.reason}` : ''}）`
            : '（已追加到末尾）';
        const label =
          inserted.length === 1
            ? `已保存到笔记本：新增第 ${start} 页 ${posHint}`
            : `已保存到笔记本：新增第 ${start}-${end} 页 ${posHint}`;
        setNbThread((prev) =>
          prev.map((m) =>
            m.role === 'assistant' && m.at === targetAt ? { ...m, lessonSavedLabel: label } : m,
          ),
        );
        if (taskId) {
          await updateAgentTask(taskId, {
            status: 'done',
            detail: label,
            notebookId,
          });
        }
        void reloadNotebookScenes();
      } catch (error) {
        const message = error instanceof Error ? error.message : '保存失败';
        setNbThread((prev) =>
          prev.map((m) =>
            m.role === 'assistant' && m.at === targetAt
              ? { ...m, lessonError: `保存到笔记本失败：${message}` }
              : m,
          ),
        );
        if (taskId) {
          await updateAgentTask(taskId, {
            status: 'failed',
            detail: `保存到笔记本失败：${message}`.slice(0, 300),
            notebookId,
          });
        }
      } finally {
        setLessonSavingAt((cur) => (cur === targetAt ? null : cur));
      }
    },
    [courseId, nbThreadRef, notebookId, reloadNotebookScenes, setNbThread],
  );

  return {
    generateInlineLessonDeck,
    lessonGeneratingAt,
    lessonSavingAt,
    saveInlineLessonDeckToNotebook,
  };
}

function compactTaskText(input?: string) {
  const text = (input || '').replace(/\s+/g, ' ').trim();
  if (!text) return '当前题目';
  return text.length > 42 ? `${text.slice(0, 39)}...` : text;
}
