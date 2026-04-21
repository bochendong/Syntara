import type { Stage, Scene } from '../types/stage';
import type { ChatSession } from '../types/chat';
import { createLogger } from '@/lib/logger';
import { backendFetch, backendJson } from '@/lib/utils/backend-api';
import { loadContactMessages } from '@/lib/utils/contact-chat-storage';
import type { Slide } from '../types/slides';
import {
  clearStageDraftSnapshot,
  readStageDraftSnapshot,
  sanitizeScenesForPersistence,
  writeStageDraftSnapshot,
} from '@/lib/utils/stage-draft-snapshot';
import { refreshSemanticSlideScene } from '@/lib/notebook-content/semantic-slide-render';

const log = createLogger('StageStorage');

export interface StageStoreData {
  stage: Stage;
  scenes: Scene[];
  currentSceneId: string | null;
  chats: ChatSession[];
}

export interface SaveStageDataResult {
  remoteSynced: boolean;
}

export interface StageListItem {
  id: string;
  courseId?: string;
  name: string;
  description?: string;
  tags?: string[];
  avatarUrl?: string;
  listedInNotebookStore?: boolean;
  notebookPriceCents?: number;
  storePublishedAt?: number;
  sourceNotebookId?: string;
  speechReadyCount?: number;
  speechTotalCount?: number;
  speechStatus?: 'no_speech' | 'ready' | 'pending';
  sceneCount: number;
  createdAt: number;
  updatedAt: number;
}

type NotebookApiRow = {
  id: string;
  ownerId: string;
  courseId: string | null;
  name: string;
  description: string | null;
  tags: string[];
  avatarUrl: string | null;
  language: string | null;
  style: string | null;
  listedInNotebookStore?: boolean;
  notebookPriceCents?: number;
  storePublishedAt?: string | null;
  sourceNotebookId?: string | null;
  speechReadyCount?: number;
  speechTotalCount?: number;
  speechStatus?: 'no_speech' | 'ready' | 'pending';
  createdAt: string;
  updatedAt: string;
  _count?: { scenes: number };
};

type SceneApiRow = {
  id: string;
  notebookId: string;
  title: string;
  type: string;
  order: number;
  content: Scene['content'];
  actions?: Scene['actions'];
  whiteboards?: Scene['whiteboards'];
  createdAt: string;
  updatedAt: string;
};

function mapNotebook(row: NotebookApiRow): StageListItem {
  return {
    id: row.id,
    courseId: row.courseId || undefined,
    name: row.name,
    description: row.description || undefined,
    tags: row.tags || [],
    avatarUrl: row.avatarUrl || undefined,
    listedInNotebookStore: Boolean(row.listedInNotebookStore),
    notebookPriceCents: row.notebookPriceCents ?? 0,
    storePublishedAt: row.storePublishedAt ? Date.parse(row.storePublishedAt) : undefined,
    sourceNotebookId: row.sourceNotebookId || undefined,
    speechReadyCount: row.speechReadyCount ?? 0,
    speechTotalCount: row.speechTotalCount ?? 0,
    speechStatus: row.speechStatus ?? 'no_speech',
    sceneCount: row._count?.scenes ?? 0,
    createdAt: Date.parse(row.createdAt),
    updatedAt: Date.parse(row.updatedAt),
  };
}

/** 生成流程使用客户端 nanoid 作为 id，首次保存前数据库中尚无该行，需先 POST 创建 */
async function ensureNotebookRow(stageId: string, data: StageStoreData): Promise<void> {
  const getResp = await backendFetch(`/api/notebooks/${encodeURIComponent(stageId)}`, {
    method: 'GET',
  });
  if (getResp.ok) return;

  if (getResp.status !== 404) {
    const ct = getResp.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const err = (await getResp.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error?.trim() || `请求失败: HTTP ${getResp.status}`);
    }
    throw new Error(`请求失败: HTTP ${getResp.status}`);
  }

  await backendJson<{ notebook: NotebookApiRow }>('/api/notebooks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: stageId,
      courseId: data.stage.courseId?.trim() || undefined,
      name: data.stage.name,
      description: data.stage.description,
      tags: data.stage.tags ?? [],
      avatarUrl: data.stage.avatarUrl,
      language: data.stage.language,
      style: data.stage.style,
    }),
  });
}

function mapScene(stageId: string, row: SceneApiRow): Scene {
  return {
    id: row.id,
    stageId,
    title: row.title,
    type: row.type as Scene['type'],
    order: row.order,
    content: row.content,
    actions: row.actions,
    whiteboards: row.whiteboards,
    createdAt: Date.parse(row.createdAt),
    updatedAt: Date.parse(row.updatedAt),
  };
}

export async function saveStageData(
  stageId: string,
  data: StageStoreData,
): Promise<SaveStageDataResult> {
  const sortedScenes = [...data.scenes].sort((a, b) => a.order - b.order);
  const persistedScenes = sanitizeScenesForPersistence(sortedScenes);

  await writeStageDraftSnapshot(
    stageId,
    {
      stage: data.stage,
      scenes: persistedScenes,
      currentSceneId: data.currentSceneId,
    },
    false,
  );

  try {
    await ensureNotebookRow(stageId, data);

    await backendJson<{ notebook: NotebookApiRow }>(
      `/api/notebooks/${encodeURIComponent(stageId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: data.stage.courseId ?? null,
          name: data.stage.name,
          description: data.stage.description,
          tags: data.stage.tags ?? [],
          avatarUrl: data.stage.avatarUrl,
          language: data.stage.language,
          style: data.stage.style,
        }),
      },
    );

    await backendJson<{ scenes: SceneApiRow[] }>(
      `/api/notebooks/${encodeURIComponent(stageId)}/scenes`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenes: persistedScenes.map((s, i) => ({
            id: s.id,
            title: s.title,
            type: s.type,
            order: Number.isFinite(s.order) ? s.order : i,
            content: s.content,
            actions: s.actions,
            whiteboards: s.whiteboards,
          })),
        }),
      },
    );
    await writeStageDraftSnapshot(
      stageId,
      {
        stage: data.stage,
        scenes: persistedScenes,
        currentSceneId: data.currentSceneId,
      },
      true,
    );
    return { remoteSynced: true };
  } catch (error) {
    log.warn('Remote stage sync failed; local draft snapshot is kept:', error);
    return { remoteSynced: false };
  }
}

/** 防止损坏的本地/服务端快照把 `scenes` 写成非数组，导致打开课堂页时 `scenes.map` 崩溃 */
function normalizeStageStoreData(data: StageStoreData): StageStoreData {
  const scenes = Array.isArray(data.scenes) ? data.scenes : [];
  const chats = Array.isArray(data.chats) ? data.chats : [];
  let currentSceneId = data.currentSceneId;
  if (currentSceneId && !scenes.some((s) => s.id === currentSceneId)) {
    currentSceneId = scenes[0]?.id ?? null;
  }
  return { ...data, scenes, chats, currentSceneId };
}

export async function loadStageData(stageId: string): Promise<StageStoreData | null> {
  const draftSnapshot = await readStageDraftSnapshot(stageId);
  try {
    const { notebook } = await backendJson<{
      notebook: NotebookApiRow & { scenes: SceneApiRow[] };
    }>(`/api/notebooks/${encodeURIComponent(stageId)}`);

    const scenes = (notebook.scenes || [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((s) => refreshSemanticSlideScene(mapScene(stageId, s)));
    const chats = await loadContactMessages<ChatSession>(
      notebook.courseId || '',
      'notebook',
      stageId,
    ).catch(() => []);

    const stage: Stage = {
      id: notebook.id,
      courseId: notebook.courseId || undefined,
      avatarUrl: notebook.avatarUrl || undefined,
      name: notebook.name,
      description: notebook.description || undefined,
      tags: notebook.tags || [],
      createdAt: Date.parse(notebook.createdAt),
      updatedAt: Date.parse(notebook.updatedAt),
      language: notebook.language || undefined,
      style: notebook.style || undefined,
    };

    const remoteData: StageStoreData = {
      stage,
      scenes,
      currentSceneId: scenes[0]?.id || null,
      chats,
    };

    const remoteSceneUpdatedAt = scenes.reduce(
      (latest, scene) => Math.max(latest, scene.updatedAt || 0),
      0,
    );
    const remoteFreshness = Math.max(remoteData.stage.updatedAt, remoteSceneUpdatedAt);

    if (draftSnapshot?.remoteSynced === false) {
      const draftScenes = Array.isArray(draftSnapshot.scenes) ? draftSnapshot.scenes : [];
      const draftSceneUpdatedAt = draftScenes.reduce(
        (latest, scene) => Math.max(latest, scene.updatedAt || 0),
        0,
      );
      const draftFreshness = Math.max(
        draftSnapshot.savedAt,
        draftSnapshot.stage.updatedAt || 0,
        draftSceneUpdatedAt,
      );
      const remoteHasMoreScenes = remoteData.scenes.length > draftScenes.length;
      const remoteIsNewer = remoteFreshness > draftFreshness;

      if (remoteHasMoreScenes || remoteIsNewer) {
        void writeStageDraftSnapshot(
          stageId,
          {
            stage: remoteData.stage,
            scenes: remoteData.scenes,
            currentSceneId: remoteData.currentSceneId,
          },
          true,
        );
        return normalizeStageStoreData(remoteData);
      }

      return normalizeStageStoreData({
        stage: draftSnapshot.stage,
        scenes: draftScenes,
        currentSceneId: draftSnapshot.currentSceneId ?? draftScenes[0]?.id ?? null,
        chats,
      });
    }

    if (draftSnapshot && draftSnapshot.savedAt >= remoteFreshness) {
      const draftScenes = Array.isArray(draftSnapshot.scenes) ? draftSnapshot.scenes : [];
      return normalizeStageStoreData({
        stage: draftSnapshot.stage,
        scenes: draftScenes,
        currentSceneId: draftSnapshot.currentSceneId ?? draftScenes[0]?.id ?? null,
        chats,
      });
    }

    return normalizeStageStoreData(remoteData);
  } catch {
    if (!draftSnapshot) {
      return null;
    }
    return normalizeStageStoreData({
      stage: draftSnapshot.stage,
      scenes: draftSnapshot.scenes,
      currentSceneId: draftSnapshot.currentSceneId ?? null,
      chats: [],
    });
  }
}

export async function deleteStageData(stageId: string): Promise<void> {
  await backendJson<{ ok: true }>(`/api/notebooks/${encodeURIComponent(stageId)}`, {
    method: 'DELETE',
  });
  await clearStageDraftSnapshot(stageId);
}

/**
 * Rename a stage (updates notebook name).
 */
export async function renameStage(stageId: string, newName: string): Promise<void> {
  await backendJson<{ notebook: NotebookApiRow }>(`/api/notebooks/${encodeURIComponent(stageId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  });
}

export async function moveStageToCourse(stageId: string, targetCourseId: string): Promise<void> {
  await backendJson<{ notebook: NotebookApiRow }>(`/api/notebooks/${encodeURIComponent(stageId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ courseId: targetCourseId }),
  });
}

export async function updateStageStoreMeta(
  stageId: string,
  payload: {
    listedInNotebookStore?: boolean;
    notebookPriceCents?: number;
    name?: string;
    description?: string;
    tags?: string[];
    avatarUrl?: string;
  },
): Promise<void> {
  await backendJson<{ notebook: NotebookApiRow }>(`/api/notebooks/${encodeURIComponent(stageId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function syncStageFromSource(
  stageId: string,
): Promise<{ syncedFromSourceNotebookId: string }> {
  return backendJson<{ syncedFromSourceNotebookId: string }>(
    `/api/notebooks/${encodeURIComponent(stageId)}/sync`,
    {
      method: 'POST',
    },
  );
}

export async function savePublishedStageData(
  stageId: string,
  data: StageStoreData,
  options: { includeSpeechAudio: boolean },
): Promise<void> {
  const sortedScenes = [...data.scenes].sort((a, b) => a.order - b.order);
  const persistedScenes = options.includeSpeechAudio
    ? sortedScenes
    : sanitizeScenesForPersistence(sortedScenes);

  await backendJson<{ notebook: NotebookApiRow }>(`/api/notebooks/${encodeURIComponent(stageId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      courseId: data.stage.courseId ?? null,
      name: data.stage.name,
      description: data.stage.description,
      tags: data.stage.tags ?? [],
      avatarUrl: data.stage.avatarUrl,
      language: data.stage.language,
      style: data.stage.style,
    }),
  });

  await backendJson<{ scenes: SceneApiRow[] }>(
    `/api/notebooks/${encodeURIComponent(stageId)}/scenes`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenes: persistedScenes.map((s, i) => ({
          id: s.id,
          title: s.title,
          type: s.type,
          order: Number.isFinite(s.order) ? s.order : i,
          content: s.content,
          actions: s.actions,
          whiteboards: s.whiteboards,
        })),
      }),
    },
  );
}

export async function listStages(): Promise<StageListItem[]> {
  try {
    const data = await backendJson<{ notebooks: NotebookApiRow[] }>('/api/notebooks');
    return data.notebooks.map(mapNotebook);
  } catch (error) {
    log.error('Failed to list stages:', error);
    return [];
  }
}

export async function listStagesByCourse(courseId: string): Promise<StageListItem[]> {
  try {
    const data = await backendJson<{ notebooks: NotebookApiRow[] }>(
      `/api/notebooks?courseId=${encodeURIComponent(courseId)}`,
    );
    return data.notebooks.map(mapNotebook);
  } catch (error) {
    log.error('Failed to list stages by course:', error);
    return [];
  }
}

export async function getFirstSlideByStages(stageIds: string[]): Promise<Record<string, Slide>> {
  const result: Record<string, Slide> = {};
  await Promise.all(
    stageIds.map(async (stageId) => {
      try {
        const data = await backendJson<{ scenes: SceneApiRow[] }>(
          `/api/notebooks/${encodeURIComponent(stageId)}/scenes`,
        );
        const firstSlide = data.scenes
          .slice()
          .sort((a, b) => a.order - b.order)
          .find((s) => s.content?.type === 'slide');
        if (firstSlide && firstSlide.content.type === 'slide') {
          result[stageId] = structuredClone(firstSlide.content.canvas);
        }
      } catch {
        // ignore single notebook thumbnail errors
      }
    }),
  );
  return result;
}

export async function stageExists(stageId: string): Promise<boolean> {
  try {
    await backendJson<{ notebook: NotebookApiRow }>(
      `/api/notebooks/${encodeURIComponent(stageId)}`,
    );
    return true;
  } catch {
    return false;
  }
}
