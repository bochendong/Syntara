'use client';

import { nanoid } from 'nanoid';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { useSettingsStore } from '@/lib/store/settings';
import { useStageStore } from '@/lib/store/stage';
import { getCourse } from '@/lib/utils/course-storage';
import { loadStageData, saveStageData } from '@/lib/utils/stage-storage';
import { backendFetch } from '@/lib/utils/backend-api';
import type {
  SendNotebookMessageResponse,
  SendNotebookMessageRequest,
  NotebookSceneBrief,
} from '@/lib/types/notebook-message';
import type { Scene, SlideContent } from '@/lib/types/stage';

type SendMessageOptions = {
  applyChanges?: boolean;
  preferWebSearch?: boolean;
  allowWrite?: boolean;
  conversation?: Array<{
    role: 'user' | 'assistant';
    content: string;
    at?: number;
  }>;
  attachments?: Array<{
    id: string;
    name: string;
    mimeType: string;
    size: number;
    textExcerpt?: string;
  }>;
};

type SendMessageResult = SendNotebookMessageResponse & {
  applied?: {
    insertedPageRange?: string;
    updatedPages: number[];
    deletedPages: number[];
  };
};

export type NotebookPlanResult = SendNotebookMessageResponse;
export type NotebookApplySummary = NonNullable<SendMessageResult['applied']>;

function htmlEscape(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function getSceneDigest(scene: Scene): string {
  if (scene.content.type === 'slide') {
    const canvas = scene.content.canvas;
    const text = canvas.elements
      .filter((el) => el.type === 'text')
      .map((el) => (el as { content?: string }).content || '')
      .join(' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, 220) || scene.title;
  }
  if (scene.content.type === 'quiz') {
    const qs = scene.content.questions
      .slice(0, 3)
      .map((q) => q.question)
      .join(' | ');
    return qs || scene.title;
  }
  if (scene.content.type === 'interactive') {
    return (scene.content.html || scene.content.url || scene.title).slice(0, 220);
  }
  if (scene.content.type === 'pbl') {
    return scene.content.projectConfig?.projectInfo?.description || scene.title;
  }
  return scene.title;
}

function toSceneBrief(scene: Scene): NotebookSceneBrief {
  return {
    id: scene.id,
    order: scene.order + 1,
    type: scene.type,
    title: scene.title,
    knowledgeDigest: getSceneDigest(scene),
  };
}

function buildSlideFromInsert(
  title: string,
  description: string,
  keyPoints: string[],
): Scene['content'] {
  const bullets = keyPoints.length > 0 ? keyPoints.map((p) => `- ${p}`).join('<br/>') : description;
  return {
    type: 'slide',
    canvas: {
      id: `slide_${nanoid(8)}`,
      viewportSize: 1000,
      viewportRatio: 0.5625,
      theme: {
        backgroundColor: '#ffffff',
        themeColors: ['#5b9bd5', '#ed7d31', '#a5a5a5', '#ffc000', '#4472c4'],
        fontColor: '#333333',
        fontName: 'Microsoft YaHei',
        outline: { color: '#d14424', width: 2, style: 'solid' },
        shadow: { h: 0, v: 0, blur: 10, color: '#000000' },
      },
      elements: [
        {
          id: `text_${nanoid(8)}`,
          type: 'text',
          left: 64,
          top: 42,
          width: 872,
          height: 82,
          rotate: 0,
          content: `<p><strong>${htmlEscape(title)}</strong></p>`,
          defaultFontName: 'Microsoft YaHei',
          defaultColor: '#111827',
          textType: 'title',
          lineHeight: 1.3,
        },
        {
          id: `text_${nanoid(8)}`,
          type: 'text',
          left: 72,
          top: 142,
          width: 856,
          height: 330,
          rotate: 0,
          content: `<p>${htmlEscape(bullets || description)}</p>`,
          defaultFontName: 'Microsoft YaHei',
          defaultColor: '#334155',
          textType: 'content',
          lineHeight: 1.5,
        },
      ],
    },
  } as SlideContent;
}

function buildQuizFromInsert(title: string, keyPoints: string[]): Scene['content'] {
  return {
    type: 'quiz',
    questions: keyPoints.slice(0, 3).map((k, i) => {
      if (i === 0) {
        return {
          id: `q_${nanoid(6)}`,
          type: 'multiple_choice' as const,
          question: `${title} - 练习 ${i + 1}: 关于“${k}”，以下哪项最符合本页内容？`,
          options: [
            { value: 'A', label: `${k} 是本页的核心概念之一` },
            { value: 'B', label: `${k} 与主题无关，可忽略` },
            { value: 'C', label: `${k} 只适用于与本页无关的其他场景` },
          ],
          answer: 'A',
          correctAnswer: 'A',
          analysis: `本题用于帮助学习者回顾“${k}”这一关键点。`,
          points: 1,
          hasAnswer: true,
        };
      }

      return {
        id: `q_${nanoid(6)}`,
        type: 'short_answer' as const,
        question: `${title} - 练习 ${i + 1}: 请简要说明 ${k}。`,
        answer: `回答应覆盖 ${k} 的核心含义与本页中的作用。`,
        analysis: `可从定义、作用和应用场景三个角度概述 ${k}。`,
        commentPrompt: `请检查回答是否准确说明了 ${k} 的定义、作用，以及与当前主题的关系。`,
        hasAnswer: false,
        points: 1,
      };
    }),
  };
}

function reindexScenesInMemory(scenes: Scene[]): Scene[] {
  return scenes
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((s, idx) => ({ ...s, order: idx }));
}

function syncOpenStage(stageId: string, scenes: Scene[]): void {
  const st = useStageStore.getState();
  if (st.stage?.id !== stageId) return;
  st.setScenes(scenes);
}

async function loadNotebookRequestPayload(
  stageId: string,
  message: string,
  options: SendMessageOptions = {},
): Promise<SendNotebookMessageRequest> {
  const loaded = await loadStageData(stageId);
  if (!loaded?.stage) throw new Error('未找到目标笔记本');
  const stage = loaded.stage;
  const scenes = loaded.scenes.slice().sort((a, b) => a.order - b.order);
  const course = stage.courseId ? await getCourse(stage.courseId) : undefined;
  const notebookScenes = scenes.map(toSceneBrief);

  const settings = useSettingsStore.getState();
  const wsApiKey = settings.webSearchProvidersConfig?.[settings.webSearchProviderId]?.apiKey;

  return {
    message,
    conversation: options.conversation?.slice(-12),
    attachments: options.attachments?.slice(-6),
    notebook: {
      id: stage.id,
      name: stage.name,
      description: stage.description,
      scenes: notebookScenes,
    },
    course: course
      ? {
          name: course.name,
          purpose: course.purpose,
          language: course.language,
          tags: course.tags,
          university: course.university,
          courseCode: course.courseCode,
        }
      : undefined,
    options: {
      allowWrite: options.allowWrite ?? options.applyChanges ?? true,
      preferWebSearch: options.preferWebSearch ?? true,
      webSearchApiKey: wsApiKey || undefined,
    },
  };
}

export async function planNotebookMessage(
  stageId: string,
  message: string,
  options: SendMessageOptions = {},
): Promise<NotebookPlanResult> {
  const payload = await loadNotebookRequestPayload(stageId, message, options);
  const mc = getCurrentModelConfig();

  const resp = await backendFetch('/api/notebooks/send-message', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-model': mc.modelString,
      'x-api-key': mc.apiKey,
      'x-base-url': mc.baseUrl,
      'x-provider-type': mc.providerType || '',
      'x-requires-api-key': mc.requiresApiKey ? 'true' : 'false',
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({ error: '请求失败' }));
    throw new Error(data.error || `请求失败: ${resp.status}`);
  }
  const data = (await resp.json()) as { success: true } & NotebookPlanResult;

  return {
    answer: data.answer,
    references: data.references || [],
    knowledgeGap: data.knowledgeGap,
    operations: data.operations || { insert: [], update: [], delete: [] },
    webSearchUsed: data.webSearchUsed,
    prerequisiteHints: data.prerequisiteHints,
  };
}

export async function applyNotebookPlan(
  stageId: string,
  plan: Pick<NotebookPlanResult, 'operations'>,
): Promise<NotebookApplySummary> {
  const loaded = await loadStageData(stageId);
  if (!loaded?.stage) throw new Error('未找到目标笔记本');
  const stage = loaded.stage;
  let scenes = loaded.scenes.slice().sort((a, b) => a.order - b.order);

  const applied: NotebookApplySummary = {
    updatedPages: [],
    deletedPages: [],
  };

  // Delete first (from high to low order)
  const deleteOrders = Array.from(
    new Set((plan.operations.delete || []).map((d) => d.order).filter((x) => x > 0)),
  ).sort((a, b) => b - a);
  for (const order1 of deleteOrders) {
    const scene = scenes.find((s) => s.order === order1 - 1);
    if (!scene) continue;
    scenes = scenes.filter((s) => s.id !== scene.id);
    applied.deletedPages.push(order1);
  }

  let currentScenes = reindexScenesInMemory(scenes);

  // Updates
  for (const upd of plan.operations.update || []) {
    const target = currentScenes.find((s) => s.order === upd.order - 1);
    if (!target) continue;
    const patch: Partial<Scene> = {};
    if (upd.title) patch.title = upd.title;
    if (upd.appendKnowledge && target.content.type === 'slide') {
      const content = target.content as SlideContent;
      const extra = {
        id: `text_${nanoid(8)}`,
        type: 'text' as const,
        left: 72,
        top: 490,
        width: 856,
        height: 56,
        rotate: 0,
        content: `<p>${htmlEscape(upd.appendKnowledge)}</p>`,
        defaultFontName: 'Microsoft YaHei',
        defaultColor: '#475569',
        textType: 'notes' as const,
      };
      patch.content = {
        ...content,
        canvas: { ...content.canvas, elements: [...content.canvas.elements, extra] },
      } as Scene['content'];
    }
    currentScenes = currentScenes.map((s) =>
      s.id === target.id ? ({ ...s, ...patch, updatedAt: Date.now() } as Scene) : s,
    );
    applied.updatedPages.push(upd.order);
  }

  currentScenes = reindexScenesInMemory(currentScenes);

  // Inserts
  const insertOrders: number[] = [];
  for (const ins of plan.operations.insert || []) {
    const afterIdx = Math.max(0, Math.min(ins.afterOrder, currentScenes.length));
    currentScenes = currentScenes.map((s) =>
      s.order >= afterIdx ? ({ ...s, order: s.order + 1, updatedAt: Date.now() } as Scene) : s,
    );

    const scene: Scene = {
      id: `scene_${nanoid(10)}`,
      stageId,
      type: ins.type,
      title: ins.title,
      order: afterIdx,
      content:
        ins.type === 'quiz'
          ? buildQuizFromInsert(ins.title, ins.keyPoints)
          : buildSlideFromInsert(ins.title, ins.description, ins.keyPoints),
      actions: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    currentScenes = reindexScenesInMemory([...currentScenes, scene]);
    insertOrders.push(afterIdx + 1);
  }

  if (insertOrders.length > 0) {
    const min = Math.min(...insertOrders);
    const max = Math.max(...insertOrders);
    applied.insertedPageRange = min === max ? `${min}` : `${min}-${max}`;
  }

  await saveStageData(stageId, {
    stage: {
      ...stage,
      updatedAt: Date.now(),
    },
    scenes: currentScenes,
    currentSceneId: useStageStore.getState().currentSceneId,
    chats: loaded.chats,
  });
  syncOpenStage(stageId, currentScenes);
  return applied;
}

export async function sendMessageToNotebook(
  stageId: string,
  message: string,
  options: SendMessageOptions = {},
): Promise<SendMessageResult> {
  const plan = await planNotebookMessage(stageId, message, options);
  const result: SendMessageResult = {
    ...plan,
    applied: {
      updatedPages: [],
      deletedPages: [],
    },
  };

  if (!(options.applyChanges ?? true)) {
    return result;
  }

  result.applied = await applyNotebookPlan(stageId, plan);
  return result;
}
