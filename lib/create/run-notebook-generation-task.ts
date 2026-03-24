'use client';

import { nanoid } from 'nanoid';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { useSettingsStore } from '@/lib/store/settings';
import { ensureLegacyCourseBucket, getCourse, LEGACY_COURSE_ID } from '@/lib/utils/course-storage';
import { pickStableNotebookAgentAvatarUrl } from '@/lib/constants/notebook-agent-avatars';
import { saveStageData } from '@/lib/utils/stage-storage';
import { persistGeneratedAgentsForStage, useAgentRegistry } from '@/lib/orchestration/registry/store';
import type { SceneOutline } from '@/lib/types/generation';
import type { Scene, Stage } from '@/lib/types/stage';
import type { AgentInfo, CoursePersonalizationContext } from '@/lib/generation/pipeline-types';
import { emitDebugLog } from '@/lib/debug/client-debug-log';

type NotebookMetadata = {
  name: string;
  description: string;
  tags: string[];
};

type WebSearchSource = {
  title: string;
  url: string;
};

type OutlineStreamEvent =
  | { type: 'outline'; data: SceneOutline }
  | { type: 'retry' }
  | { type: 'done'; outlines?: SceneOutline[] }
  | { type: 'error'; error: string };

export type NotebookGenerationProgress =
  | { stage: 'preparing'; detail: string }
  | { stage: 'research'; detail: string; sources?: WebSearchSource[] }
  | { stage: 'metadata'; detail: string }
  | { stage: 'agents'; detail: string }
  | { stage: 'outline'; detail: string; completed?: number }
  | { stage: 'scene'; detail: string; completed: number; total: number }
  | { stage: 'saving'; detail: string }
  | { stage: 'completed'; detail: string; notebookId: string; notebookName: string };

export type NotebookGenerationTaskInput = {
  courseId?: string;
  requirement: string;
  language?: 'zh-CN' | 'en-US';
  webSearch?: boolean;
  userNickname?: string;
  userBio?: string;
  signal?: AbortSignal;
  onProgress?: (progress: NotebookGenerationProgress) => void;
};

export type NotebookGenerationTaskResult = {
  stage: Stage;
  scenes: Scene[];
  outlines: SceneOutline[];
  agents: AgentInfo[];
  researchSources: WebSearchSource[];
};

function getApiHeaders(): HeadersInit {
  const modelConfig = getCurrentModelConfig();
  const settings = useSettingsStore.getState();
  const imageProviderConfig = settings.imageProvidersConfig?.[settings.imageProviderId];
  const videoProviderConfig = settings.videoProvidersConfig?.[settings.videoProviderId];
  return {
    'Content-Type': 'application/json',
    'x-model': modelConfig.modelString,
    'x-api-key': modelConfig.apiKey,
    'x-base-url': modelConfig.baseUrl,
    'x-provider-type': modelConfig.providerType || '',
    'x-requires-api-key': modelConfig.requiresApiKey ? 'true' : 'false',
    'x-image-provider': settings.imageProviderId || '',
    'x-image-model': settings.imageModelId || '',
    'x-image-api-key': imageProviderConfig?.apiKey || '',
    'x-image-base-url': imageProviderConfig?.baseUrl || '',
    'x-video-provider': settings.videoProviderId || '',
    'x-video-model': settings.videoModelId || '',
    'x-video-api-key': videoProviderConfig?.apiKey || '',
    'x-video-base-url': videoProviderConfig?.baseUrl || '',
    'x-image-generation-enabled': String(settings.imageGenerationEnabled ?? false),
    'x-video-generation-enabled': String(settings.videoGenerationEnabled ?? false),
  };
}

function extractTopicFromRequirement(requirement: string): string {
  const trimmed = requirement.trim();
  if (!trimmed) return '未命名笔记本';
  if (trimmed.length <= 28) return trimmed;
  return `${trimmed.substring(0, 28).trim()}...`;
}

function buildFallbackNotebookMetadata(
  requirement: string,
  language: 'zh-CN' | 'en-US',
  courseContext?: CoursePersonalizationContext,
): NotebookMetadata {
  const name = extractTopicFromRequirement(requirement);
  const normalized = requirement.replace(/[，。、“”‘’！？;；,.!?()[\]{}<>]/g, ' ');
  const words = normalized
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);
  const unique = Array.from(new Set(words)).slice(0, 5);
  const defaultTags =
    language === 'en-US' ? ['learning', 'notebook', 'ai-generated'] : ['学习', '笔记本', 'AI生成'];
  const tags = Array.from(new Set([...(courseContext?.tags || []), ...(unique.length > 0 ? unique : defaultTags)])).slice(
    0,
    8,
  );
  const description =
    language === 'en-US'
      ? `Includes: ${name}. Not included: Deep dives beyond the current requirement or unrelated topics.`
      : `包含：${name}相关核心内容与关键知识点。不包含：超出当前需求范围的深度延展或无关主题。`;
  return { name, description, tags };
}

async function generateNotebookMetadata(args: {
  requirement: string;
  language: 'zh-CN' | 'en-US';
  webSearch: boolean;
  courseContext?: CoursePersonalizationContext;
  signal?: AbortSignal;
}): Promise<NotebookMetadata> {
  const resp = await fetch('/api/generate/notebook-metadata', {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify({
      requirements: {
        requirement: args.requirement,
        language: args.language,
        webSearch: args.webSearch,
      },
      courseContext: args.courseContext,
    }),
    signal: args.signal,
  });

  if (!resp.ok) {
    const fallback = buildFallbackNotebookMetadata(args.requirement, args.language, args.courseContext);
    return fallback;
  }

  const data = await resp.json();
  if (!data?.success || !data?.name || !data?.description) {
    return buildFallbackNotebookMetadata(args.requirement, args.language, args.courseContext);
  }

  return {
    name: String(data.name),
    description: String(data.description),
    tags: Array.isArray(data.tags) ? data.tags.map((x: unknown) => String(x)).slice(0, 8) : [],
  };
}

async function maybeRunWebSearch(args: {
  requirement: string;
  enabled: boolean;
  signal?: AbortSignal;
}): Promise<{ context?: string; sources: WebSearchSource[] }> {
  if (!args.enabled) return { context: undefined, sources: [] };

  const settings = useSettingsStore.getState();
  const apiKey =
    settings.webSearchProvidersConfig?.[settings.webSearchProviderId]?.apiKey || undefined;

  const res = await fetch('/api/web-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: args.requirement, apiKey }),
    signal: args.signal,
  });

  if (!res.ok) {
    return { context: undefined, sources: [] };
  }

  const data = await res.json();
  return {
    context: data.context || undefined,
    sources: Array.isArray(data.sources) ? data.sources.slice(0, 8) : [],
  };
}

function getPresetAgents(): AgentInfo[] {
  const settings = useSettingsStore.getState();
  const registry = useAgentRegistry.getState();
  return settings.selectedAgentIds
    .map((id) => registry.getAgent(id))
    .filter(Boolean)
    .map((agent) => ({
      id: agent!.id,
      name: agent!.name,
      role: agent!.role,
      persona: agent!.persona,
    }));
}

async function maybeGenerateAgents(args: {
  stage: Stage;
  language: 'zh-CN' | 'en-US';
  courseContext?: CoursePersonalizationContext;
  signal?: AbortSignal;
}): Promise<AgentInfo[]> {
  const settings = useSettingsStore.getState();
  if (settings.agentMode !== 'auto') {
    return getPresetAgents();
  }

  const allAvatars = [
    '/avatars/assist.png',
    '/avatars/assist-2.png',
    '/avatars/clown.png',
    '/avatars/clown-2.png',
    '/avatars/curious.png',
    '/avatars/curious-2.png',
    '/avatars/note-taker.png',
    '/avatars/note-taker-2.png',
    '/avatars/teacher.png',
    '/avatars/teacher-2.png',
    '/avatars/thinker.png',
    '/avatars/thinker-2.png',
  ];

  const resp = await fetch('/api/generate/agent-profiles', {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify({
      stageInfo: { name: args.stage.name, description: args.stage.description },
      language: args.language,
      availableAvatars: allAvatars,
      courseContext: args.courseContext,
    }),
    signal: args.signal,
  });

  if (!resp.ok) {
    return getPresetAgents();
  }

  const data = await resp.json();
  if (!data?.success || !Array.isArray(data.agents) || data.agents.length === 0) {
    return getPresetAgents();
  }

  persistGeneratedAgentsForStage(args.stage.id, data.agents);
  return data.agents.map((agent: AgentInfo) => ({
    id: agent.id,
    name: agent.name,
    role: agent.role,
    persona: agent.persona,
  }));
}

async function generateOutlines(args: {
  requirement: string;
  language: 'zh-CN' | 'en-US';
  researchContext?: string;
  agents: AgentInfo[];
  coursePurpose?: 'research' | 'university' | 'daily';
  courseContext?: CoursePersonalizationContext;
  signal?: AbortSignal;
  onOutline?: (count: number) => void;
}): Promise<SceneOutline[]> {
  const response = await fetch('/api/generate/scene-outlines-stream', {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify({
      requirements: {
        requirement: args.requirement,
        language: args.language,
      },
      researchContext: args.researchContext,
      agents: args.agents,
      coursePurpose: args.coursePurpose,
      courseContext: args.courseContext,
    }),
    signal: args.signal,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: '大纲生成失败' }));
    throw new Error(data.error || '大纲生成失败');
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('无法读取大纲流');

  const decoder = new TextDecoder();
  let buffer = '';
  const outlines: SceneOutline[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const evt = JSON.parse(line.slice(6)) as OutlineStreamEvent;
        if (evt.type === 'outline') {
          outlines.push(evt.data);
          args.onOutline?.(outlines.length);
        } else if (evt.type === 'retry') {
          outlines.length = 0;
          args.onOutline?.(0);
        } else if (evt.type === 'done') {
          return evt.outlines?.length ? evt.outlines : outlines;
        } else if (evt.type === 'error') {
          throw new Error(evt.error || '大纲生成失败');
        }
      }
    }

    if (done) {
      return outlines;
    }
  }
}

async function generateSingleScene(args: {
  outline: SceneOutline;
  allOutlines: SceneOutline[];
  stage: Stage;
  agents: AgentInfo[];
  previousSpeeches: string[];
  userProfile?: string;
  courseContext?: CoursePersonalizationContext;
  signal?: AbortSignal;
}): Promise<{ scene: Scene; previousSpeeches: string[] }> {
  const contentResp = await fetch('/api/generate/scene-content', {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify({
      outline: args.outline,
      allOutlines: args.allOutlines,
      stageInfo: {
        name: args.stage.name,
        description: args.stage.description,
        language: args.stage.language,
        style: args.stage.style,
      },
      stageId: args.stage.id,
      agents: args.agents,
      courseContext: args.courseContext,
    }),
    signal: args.signal,
  });

  if (!contentResp.ok) {
    const data = await contentResp.json().catch(() => ({ error: '页面内容生成失败' }));
    throw new Error(data.error || '页面内容生成失败');
  }

  const contentData = await contentResp.json();
  if (!contentData?.success || !contentData?.content) {
    throw new Error(contentData?.error || '页面内容生成失败');
  }

  const actionsResp = await fetch('/api/generate/scene-actions', {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify({
      outline: contentData.effectiveOutline || args.outline,
      allOutlines: args.allOutlines,
      content: contentData.content,
      stageId: args.stage.id,
      agents: args.agents,
      previousSpeeches: args.previousSpeeches,
      userProfile: args.userProfile,
      courseContext: args.courseContext,
    }),
    signal: args.signal,
  });

  if (!actionsResp.ok) {
    const data = await actionsResp.json().catch(() => ({ error: '页面讲解生成失败' }));
    throw new Error(data.error || '页面讲解生成失败');
  }

  const actionsData = await actionsResp.json();
  if (!actionsData?.success || !actionsData?.scene) {
    throw new Error(actionsData?.error || '页面讲解生成失败');
  }

  return {
    scene: actionsData.scene as Scene,
    previousSpeeches: Array.isArray(actionsData.previousSpeeches)
      ? actionsData.previousSpeeches
      : [],
  };
}

export async function runNotebookGenerationTask(
  input: NotebookGenerationTaskInput,
): Promise<NotebookGenerationTaskResult> {
  const requirement = input.requirement.trim();
  if (!requirement) throw new Error('缺少笔记本创建需求');

  const language = input.language || 'zh-CN';
  const webSearch = input.webSearch ?? true;
  // #region agent log
  emitDebugLog({
    hypothesisId: 'D',
    location: 'lib/create/run-notebook-generation-task.ts:402',
    message: 'Notebook generation started',
    data: {
      courseId: input.courseId?.trim() || null,
      language,
      webSearch,
      requirementPreview: requirement.slice(0, 80),
    },
  });
  // #endregion
  input.onProgress?.({ stage: 'preparing', detail: '正在初始化创建任务…' });

  try {
    await ensureLegacyCourseBucket();
    const resolvedCourseId = input.courseId?.trim() || LEGACY_COURSE_ID;
    const currentCourse = await getCourse(resolvedCourseId);
    const courseContext: CoursePersonalizationContext | undefined = currentCourse
      ? {
          name: currentCourse.name,
          description: currentCourse.description,
          tags: currentCourse.tags,
          purpose: currentCourse.purpose,
          university: currentCourse.university,
          courseCode: currentCourse.courseCode,
          language: currentCourse.language,
        }
      : undefined;

    let researchContext: string | undefined;
    let researchSources: WebSearchSource[] = [];
    if (webSearch) {
      input.onProgress?.({ stage: 'research', detail: '正在补充联网研究资料…' });
      const research = await maybeRunWebSearch({
        requirement,
        enabled: webSearch,
        signal: input.signal,
      });
      researchContext = research.context;
      researchSources = research.sources;
      input.onProgress?.({
        stage: 'research',
        detail: research.sources.length > 0 ? `已整理 ${research.sources.length} 条外部资料` : '未找到可用外部资料，继续本地生成',
        sources: research.sources,
      });
    }

    input.onProgress?.({ stage: 'metadata', detail: '正在生成笔记本标题与简介…' });
    const notebookMeta = await generateNotebookMetadata({
      requirement,
      language,
      webSearch,
      courseContext,
      signal: input.signal,
    });

    const stageId = nanoid(10);
    const stage: Stage = {
      id: stageId,
      courseId: resolvedCourseId,
      avatarUrl: pickStableNotebookAgentAvatarUrl(stageId),
      name: notebookMeta.name,
      description: notebookMeta.description,
      tags: notebookMeta.tags,
      language,
      style: 'professional',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    input.onProgress?.({ stage: 'agents', detail: '正在准备讲解角色…' });
    const agents = await maybeGenerateAgents({
      stage,
      language,
      courseContext,
      signal: input.signal,
    });

    input.onProgress?.({ stage: 'outline', detail: '正在生成课程大纲…', completed: 0 });
    const outlines = await generateOutlines({
      requirement,
      language,
      researchContext,
      agents,
      coursePurpose: currentCourse?.purpose,
      courseContext,
      signal: input.signal,
      onOutline: (count) => {
        input.onProgress?.({
          stage: 'outline',
          detail: count > 0 ? `已生成 ${count} 个大纲节点…` : '正在重新整理课程结构…',
          completed: count,
        });
      },
    });

    if (!outlines.length) throw new Error('未生成任何课程大纲');

    const scenes: Scene[] = [];
    let previousSpeeches: string[] = [];
    const userProfile =
      input.userNickname || input.userBio
        ? `Student: ${input.userNickname || 'Unknown'}${input.userBio ? ` — ${input.userBio}` : ''}`
        : undefined;

    for (let i = 0; i < outlines.length; i += 1) {
      const outline = outlines[i];
      input.onProgress?.({
        stage: 'scene',
        detail: `正在生成第 ${i + 1}/${outlines.length} 页：${outline.title}`,
        completed: i,
        total: outlines.length,
      });
      const result = await generateSingleScene({
        outline,
        allOutlines: outlines,
        stage,
        agents,
        previousSpeeches,
        userProfile,
        courseContext,
        signal: input.signal,
      });
      scenes.push(result.scene);
      previousSpeeches = result.previousSpeeches;
    }

    input.onProgress?.({ stage: 'saving', detail: '正在保存笔记本与页面…' });
    await saveStageData(stage.id, {
      stage: {
        ...stage,
        updatedAt: Date.now(),
      },
      scenes,
      currentSceneId: scenes[0]?.id || null,
      chats: [],
    });

    if (typeof window !== 'undefined') {
      sessionStorage.setItem(`stage-outlines:${stage.id}`, JSON.stringify(outlines));
    }

    input.onProgress?.({
      stage: 'completed',
      detail: `已完成，共生成 ${scenes.length} 页`,
      notebookId: stage.id,
      notebookName: stage.name,
    });
    // #region agent log
    emitDebugLog({
      hypothesisId: 'D',
      location: 'lib/create/run-notebook-generation-task.ts:538',
      message: 'Notebook generation completed',
      data: {
        stageId: stage.id,
        stageName: stage.name,
        outlineCount: outlines.length,
        sceneCount: scenes.length,
      },
    });
    // #endregion

    return {
      stage,
      scenes,
      outlines,
      agents,
      researchSources,
    };
  } catch (error) {
    // #region agent log
    emitDebugLog({
      hypothesisId: 'D',
      location: 'lib/create/run-notebook-generation-task.ts:551',
      message: 'Notebook generation failed',
      data: {
        error: error instanceof Error ? error.message : String(error),
      },
    });
    // #endregion
    throw error;
  }
}
