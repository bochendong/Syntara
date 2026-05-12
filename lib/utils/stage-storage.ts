import type { Stage, Scene, SceneGenerationDiagnostics } from '../types/stage';
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
import { clearPersistedStageOutlines } from '@/lib/utils/stage-outline-storage';
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

const SCENE_CONTENT_DIAGNOSTICS_KEY = '__generationDiagnostics';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function extractGenerationDiagnosticsFromContent(content: Scene['content']): {
  content: Scene['content'];
  generationDiagnostics?: SceneGenerationDiagnostics;
} {
  if (!isRecord(content) || !(SCENE_CONTENT_DIAGNOSTICS_KEY in content)) {
    return { content };
  }

  const { [SCENE_CONTENT_DIAGNOSTICS_KEY]: rawDiagnostics, ...rest } = content;
  return {
    content: rest as Scene['content'],
    generationDiagnostics: isRecord(rawDiagnostics)
      ? (rawDiagnostics as SceneGenerationDiagnostics)
      : undefined,
  };
}

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

export const MOCK_COURSE_CHAT_ID = 'syntara-mock-course-chat';
export const MOCK_COURSE_CHAT_NAME = 'Mock 课程聊天测试';

const MOCK_COURSE_CHAT_CREATED_AT = Date.parse('2026-01-01T00:00:00.000Z');

function isMockCourseChatId(courseId: string | null | undefined): boolean {
  return courseId === MOCK_COURSE_CHAT_ID;
}

function mockTextElement(id: string, top: number, content: string) {
  return {
    id,
    type: 'text' as const,
    left: 72,
    top,
    width: 820,
    height: 86,
    rotate: 0,
    content,
    defaultFontName: 'Inter',
    defaultColor: '#0f172a',
    textType: top < 120 ? ('title' as const) : ('content' as const),
  };
}

function mockScene(stageId: string, order: number, title: string, paragraphs: string[]): Scene {
  return {
    id: `${stageId}-scene-${order + 1}`,
    stageId,
    type: 'slide',
    title,
    order,
    content: {
      type: 'slide',
      canvas: {
        id: `${stageId}-slide-${order + 1}`,
        viewportSize: 1000,
        viewportRatio: 16 / 9,
        theme: {
          backgroundColor: '#ffffff',
          themeColors: ['#2563eb', '#10b981', '#f59e0b'],
          fontColor: '#0f172a',
          fontName: 'Inter',
        },
        elements: [
          mockTextElement(`${stageId}-title-${order + 1}`, 72, `<h1>${title}</h1>`),
          mockTextElement(
            `${stageId}-body-${order + 1}`,
            168,
            paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join(''),
          ),
        ],
      },
    },
    actions: [
      {
        id: `${stageId}-speech-${order + 1}`,
        type: 'speech',
        text: `${title}。${paragraphs.join(' ')}`,
      },
    ],
    createdAt: MOCK_COURSE_CHAT_CREATED_AT + order * 1000,
    updatedAt: MOCK_COURSE_CHAT_CREATED_AT + order * 1000,
  };
}

function makeMockNotebook(args: {
  id: string;
  name: string;
  description: string;
  tags: string[];
  sceneDefs: Array<{ title: string; paragraphs: string[] }>;
}): StageListItem & { scenes: Scene[] } {
  return {
    id: args.id,
    courseId: MOCK_COURSE_CHAT_ID,
    name: args.name,
    description: args.description,
    tags: args.tags,
    avatarUrl: undefined,
    sceneCount: args.sceneDefs.length,
    createdAt: MOCK_COURSE_CHAT_CREATED_AT,
    updatedAt: MOCK_COURSE_CHAT_CREATED_AT + args.sceneDefs.length * 1000,
    scenes: args.sceneDefs.map((scene, index) =>
      mockScene(args.id, index, scene.title, scene.paragraphs),
    ),
  };
}

const MOCK_COURSE_CHAT_NOTEBOOKS = [
  makeMockNotebook({
    id: 'mock-course-chat-algorithms',
    name: '算法复杂度与递归',
    description: '用于测试课程聊天上下文引用、复杂度解释、代码块和公式渲染。',
    tags: ['algorithms', 'recursion', 'big-o'],
    sceneDefs: [
      {
        title: '复杂度的核心问题',
        paragraphs: [
          '时间复杂度关注输入规模 n 增长时，运行时间如何增长。常见阶包括 O(1)、O(log n)、O(n)、O(n log n)、O(n^2)。',
          '判断复杂度时先找主导项，再忽略常数。二分查找每次把搜索空间减半，因此复杂度是 O(log n)。',
        ],
      },
      {
        title: '递归三件事',
        paragraphs: [
          '递归需要明确 base case、recursive case、以及每次调用如何靠近终止条件。',
          '阶乘可以写成 n! = n × (n - 1)!，其中 0! = 1。递归深度是 n，因此空间复杂度通常是 O(n)。',
        ],
      },
      {
        title: '分治与归并排序',
        paragraphs: [
          '分治算法把问题拆成更小的子问题，分别解决后合并结果。归并排序的递推式是 T(n)=2T(n/2)+O(n)。',
          '根据主定理，归并排序时间复杂度为 O(n log n)，适合测试公式解释和步骤化回答。',
        ],
      },
    ],
  }),
  makeMockNotebook({
    id: 'mock-course-chat-linear-algebra',
    name: '线性代数速记',
    description: '用于测试跨笔记本综合、概念比较和公式引用。',
    tags: ['linear algebra', 'matrix', 'eigenvalue'],
    sceneDefs: [
      {
        title: '矩阵乘法的含义',
        paragraphs: [
          '矩阵乘法可以理解为线性变换的复合。若 A 和 B 都表示变换，则 AB 表示先做 B 再做 A。',
          '矩阵乘法一般不满足交换律，也就是说 AB 通常不等于 BA。',
        ],
      },
      {
        title: '特征值与特征向量',
        paragraphs: [
          '若 Av = λv，且 v 不是零向量，则 v 是特征向量，λ 是对应特征值。',
          '特征向量表示经过线性变换后方向不变或反向的方向，特征值表示伸缩比例。',
        ],
      },
      {
        title: '线性无关',
        paragraphs: [
          '一组向量线性无关，表示没有一个向量可以由其他向量线性组合得到。',
          '判断线性无关可以把向量作为列组成矩阵，看秩是否等于向量个数。',
        ],
      },
    ],
  }),
] satisfies Array<StageListItem & { scenes: Scene[] }>;

export function getMockCourseChatStageList(): StageListItem[] {
  return MOCK_COURSE_CHAT_NOTEBOOKS.map(({ scenes: _scenes, ...notebook }) => ({ ...notebook }));
}

function loadMockCourseChatStageData(stageId: string): StageStoreData | null {
  const notebook = MOCK_COURSE_CHAT_NOTEBOOKS.find((item) => item.id === stageId);
  if (!notebook) return null;
  const { scenes, ...stageMeta } = notebook;
  const clonedScenes = JSON.parse(JSON.stringify(scenes)) as Scene[];
  return {
    stage: {
      id: stageMeta.id,
      courseId: stageMeta.courseId,
      avatarUrl: stageMeta.avatarUrl,
      name: stageMeta.name,
      description: stageMeta.description,
      tags: stageMeta.tags,
      createdAt: stageMeta.createdAt,
      updatedAt: stageMeta.updatedAt,
      language: 'zh-CN',
      style: 'mock',
    },
    scenes: clonedScenes,
    currentSceneId: clonedScenes[0]?.id || null,
    chats: [],
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
  const extracted = extractGenerationDiagnosticsFromContent(row.content);
  return {
    id: row.id,
    stageId,
    title: row.title,
    type: row.type as Scene['type'],
    order: row.order,
    content: extracted.content,
    actions: row.actions,
    whiteboards: row.whiteboards,
    createdAt: Date.parse(row.createdAt),
    updatedAt: Date.parse(row.updatedAt),
    generationDiagnostics: extracted.generationDiagnostics,
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
            generationDiagnostics: s.generationDiagnostics,
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
  const scenes = Array.isArray(data.scenes)
    ? data.scenes.map((scene) => refreshSemanticSlideScene(scene))
    : [];
  const chats = Array.isArray(data.chats) ? data.chats : [];
  let currentSceneId = data.currentSceneId;
  if (currentSceneId && !scenes.some((s) => s.id === currentSceneId)) {
    currentSceneId = scenes[0]?.id ?? null;
  }
  return { ...data, scenes, chats, currentSceneId };
}

async function withFallbackTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function loadStageData(stageId: string): Promise<StageStoreData | null> {
  const mockStageData = loadMockCourseChatStageData(stageId);
  if (mockStageData) return mockStageData;

  const draftSnapshot = await readStageDraftSnapshot(stageId);
  try {
    const { notebook } = await backendJson<{
      notebook: NotebookApiRow & { scenes: SceneApiRow[] };
    }>(`/api/notebooks/${encodeURIComponent(stageId)}`);

    const scenes = (notebook.scenes || [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((s) => refreshSemanticSlideScene(mapScene(stageId, s)));
    const chats = await withFallbackTimeout(
      loadContactMessages<ChatSession>(notebook.courseId || '', 'notebook', stageId).catch(
        () => [],
      ),
      2500,
      [],
    );

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
      const draftContentFreshness = Math.max(
        draftSnapshot.stage.updatedAt || 0,
        draftSceneUpdatedAt,
      );
      const remoteHasMoreScenes = remoteData.scenes.length > draftScenes.length;
      const remoteIsNewer = remoteFreshness > draftFreshness;
      const remoteHasNewerContent = remoteFreshness > draftContentFreshness;

      if (remoteHasMoreScenes || remoteIsNewer || remoteHasNewerContent) {
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
      const draftSceneUpdatedAt = draftScenes.reduce(
        (latest, scene) => Math.max(latest, scene.updatedAt || 0),
        0,
      );
      const draftContentFreshness = Math.max(
        draftSnapshot.stage.updatedAt || 0,
        draftSceneUpdatedAt,
      );
      const remoteHasMoreScenes = remoteData.scenes.length > draftScenes.length;
      const remoteHasNewerContent = remoteFreshness > draftContentFreshness;
      if (remoteHasMoreScenes || remoteHasNewerContent) {
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
  clearPersistedStageOutlines(stageId);
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
          generationDiagnostics: s.generationDiagnostics,
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
  if (isMockCourseChatId(courseId)) return getMockCourseChatStageList();

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
