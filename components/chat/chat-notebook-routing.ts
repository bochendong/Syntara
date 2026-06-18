import { runQueuedAiTask } from '@/lib/store/ai-task-queue';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import type { CourseChatContext } from '@/lib/types/chat';
import type { Scene } from '@/lib/types/stage';
import type { StageListItem } from '@/lib/utils/stage-storage';
import type { NotebookRouteDecision, OrchestratorViewMode } from './chat-page-types';

export const NOTEBOOK_CHAT_PREVIEW_EVENT = 'synatra-notebook-chat-updated';

function tokenizeForMatch(input: string): string[] {
  const lowered = input.toLowerCase();
  const zhChunks = lowered.match(/[\u4e00-\u9fff]{2,}/g) || [];
  const zhStopTokens = new Set([
    '一下',
    '一个',
    '这个',
    '那个',
    '我们',
    '你们',
    '他们',
    '为什么',
    '怎么',
    '如何',
    '说明',
    '解释',
    '必要',
  ]);
  const zhTokens = zhChunks.flatMap((chunk) => {
    const tokens: string[] = [chunk];
    for (const size of [2, 3, 4]) {
      for (let index = 0; index <= chunk.length - size; index++) {
        const token = chunk.slice(index, index + size);
        if (!zhStopTokens.has(token)) tokens.push(token);
      }
    }
    return tokens;
  });
  const latinTokens = lowered.match(/[a-z0-9][a-z0-9-]{1,}/g) || [];
  return Array.from(new Set([...zhTokens, ...latinTokens]));
}

function scoreNotebookMatch(
  message: string,
  notebook: StageListItem,
  contextNotebook?: CourseChatContext['notebooks'][number],
): number {
  const haystack = [notebook.name, notebook.description || '', ...(notebook.tags || [])]
    .join(' ')
    .toLowerCase();
  const tokens = tokenizeForMatch(message);
  let score = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) score += token.length >= 4 ? 3 : 2;
  }
  if (!tokens.length && haystack.includes(message.toLowerCase().trim())) score += 2;
  if (contextNotebook) {
    const topPageScore = contextNotebook.pages.reduce(
      (best, page) => Math.max(best, page.sourceScore),
      0,
    );
    const pageScoreTotal = contextNotebook.pages.reduce(
      (total, page) => total + page.sourceScore,
      0,
    );
    score += contextNotebook.sourceScore + topPageScore + Math.min(pageScoreTotal, 12);
  }
  return score;
}

function stripHtmlTags(input: string): string {
  return input
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sceneSearchText(scene: Scene): string {
  const title = scene.title || '';
  if (scene.content.type === 'markdown') {
    return `${title} ${scene.content.summary || ''} ${scene.content.markdown}`.trim();
  }
  if (scene.content.type !== 'slide') return title;
  const elements = scene.content.canvas.elements || [];
  const textBits = elements
    .filter((el) => el.type === 'text')
    .map((el) => {
      const content = (el as { content?: unknown }).content;
      return typeof content === 'string' ? stripHtmlTags(content) : '';
    })
    .filter(Boolean)
    .join(' ');
  return `${title} ${textBits}`.trim();
}

export function getSceneNarration(scene: Scene): { text: string; mode: 'script' | 'fallback' } {
  const script = (scene.actions || [])
    .flatMap((action) => {
      if (action.type !== 'speech') return [];
      const text = typeof action.text === 'string' ? action.text.trim() : '';
      return text ? [text] : [];
    })
    .join(' ');
  if (script) return { text: script, mode: 'script' };
  return { text: sceneSearchText(scene), mode: 'fallback' };
}

export function base64ToObjectUrl(base64: string, format: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: `audio/${format || 'mp3'}` });
  return URL.createObjectURL(blob);
}

export function summarizeQuestionForContext(input?: string): string {
  const text = (input || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > 38 ? `${text.slice(0, 38)}…` : text;
}

export function attachQuestionContextToFirstScene(scene: Scene, questionSummary: string): Scene {
  if (!questionSummary) return scene;
  const titleBase = (scene.title || '临时讲解').trim();
  const title = titleBase.includes('题目：')
    ? titleBase
    : `${titleBase}（题目：${questionSummary}）`;
  const intro = `本组讲解对应题目：${questionSummary}。`;
  const actions = scene.actions || [];
  const firstSpeechIndex = actions.findIndex(
    (action) => action.type === 'speech' && !!action.text?.trim(),
  );

  if (firstSpeechIndex >= 0) {
    const nextActions = actions.map((action, index) => {
      if (index !== firstSpeechIndex || action.type !== 'speech') return action;
      if (action.text.includes('本组讲解对应题目：')) return action;
      return { ...action, text: `${intro}${action.text}` };
    });
    return { ...scene, title, actions: nextActions };
  }

  return {
    ...scene,
    title,
    actions: [
      {
        id: `speech_intro_${Date.now().toString(36)}`,
        type: 'speech',
        text: intro,
      },
      ...actions,
    ],
  };
}

function toPageSummary(scene: Scene) {
  return {
    order: scene.order,
    title: scene.title || '未命名页面',
    summary: sceneSearchText(scene).slice(0, 600),
  };
}

function scoreTextMatch(tokens: string[], haystack: string): number {
  if (!tokens.length || !haystack) return 0;
  const h = haystack.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (!h.includes(token)) continue;
    score += token.length >= 6 ? 4 : token.length >= 4 ? 3 : 2;
  }
  return score;
}

export function pickSmartInsertIndex(current: Scene[], lessonScenes: Scene[]): number {
  if (current.length === 0) return 0;
  const lessonText = lessonScenes.map((s) => sceneSearchText(s)).join(' ');
  const tokens = tokenizeForMatch(lessonText);
  if (!tokens.length) return current.length;

  let bestScore = 0;
  let bestInsertIndex = current.length;
  for (let i = 0; i < current.length; i++) {
    const scene = current[i];
    const score = scoreTextMatch(tokens, sceneSearchText(scene));
    if (score > bestScore) {
      bestScore = score;
      bestInsertIndex = i + 1; // insert after matched scene
    }
  }
  return bestScore >= 4 ? bestInsertIndex : current.length;
}

export async function pickInsertIndexWithAI(args: {
  notebookTitle?: string;
  currentScenes: Scene[];
  lessonScenes: Scene[];
}): Promise<{ insertAt: number; reason?: string } | null> {
  if (args.currentScenes.length === 0) return { insertAt: 0, reason: 'empty notebook' };
  try {
    const mc = getCurrentModelConfig();
    const resp = await runQueuedAiTask(
      {
        kind: 'micro-lesson',
        title: '临时PPT插入位置判断',
        description: '正在判断临时PPT应该插入到笔记本哪里',
      },
      ({ signal }) =>
        fetch('/api/notebooks/micro-lesson/insert-position', {
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
            notebookTitle: args.notebookTitle || '',
            currentPages: args.currentScenes.map(toPageSummary),
            lessonPages: args.lessonScenes.map(toPageSummary),
          }),
          signal,
        }),
    );
    const data = (await resp.json()) as {
      success?: boolean;
      insertAfterOrder?: number;
      reason?: string;
    };
    if (!resp.ok || data.success === false || typeof data.insertAfterOrder !== 'number')
      return null;
    const insertAfter = Math.round(data.insertAfterOrder);
    const insertAt = Math.max(0, Math.min(args.currentScenes.length, insertAfter + 1));
    return { insertAt, reason: data.reason?.trim() || undefined };
  } catch {
    return null;
  }
}

export function decideNotebookRoute(
  message: string,
  notebooks: StageListItem[],
  mode: OrchestratorViewMode,
  hasAttachments: boolean,
  courseContext?: CourseChatContext,
): NotebookRouteDecision {
  const text = message.trim();
  if (!text) return { type: 'create' };
  const explicitNotebookIntent = /(笔记本|notebook|讲义|课件|slides?)/i.test(text);
  const explicitCreateIntent =
    notebooks.length === 0 ||
    /(创建|新建|生成|做一个|搭一个|帮我做|帮我建|准备一套|给我一套|做成课件|生成笔记本)/i.test(
      text,
    );
  const genericCreateIntent =
    hasAttachments ||
    (!explicitNotebookIntent &&
      /(总结|总结一下|概述|梳理|提炼|归纳|整理|读一下|看一下|解读|帮我看|帮我总结)/i.test(text));
  const createIntent = explicitCreateIntent || (mode === 'private' && genericCreateIntent);
  if (createIntent) return { type: 'create' };

  const contextByNotebookId = new Map(
    (courseContext?.notebooks || []).map((notebook) => [notebook.id, notebook]),
  );
  const ranked = notebooks
    .map((notebook) => ({
      notebook,
      score: scoreNotebookMatch(text, notebook, contextByNotebookId.get(notebook.id)),
    }))
    .sort((a, b) => b.score - a.score || b.notebook.updatedAt - a.notebook.updatedAt);

  const broadIntent = /(综合|比较|对比|串联|跨|多个|协作|整体|全局|一起)/i.test(text);
  const positive = ranked.filter((item) => item.score > 0);

  if (positive.length === 0 && !broadIntent) {
    return { type: 'direct' };
  }

  if (
    (broadIntent && ranked.length > 1) ||
    (positive.length >= 2 && (positive[1].score >= positive[0].score || positive[0].score <= 2))
  ) {
    return {
      type: 'multi',
      notebooks: (positive.length ? positive : ranked).slice(0, 3).map((x) => x.notebook),
    };
  }

  return { type: 'single', notebook: (positive[0] || ranked[0]).notebook };
}
