'use client';

import { Stage } from '@/components/stage';
import { ThemeProvider } from '@/lib/hooks/use-theme';
import { useStageStore } from '@/lib/store';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { getCourse } from '@/lib/utils/course-storage';
import { loadImageMapping } from '@/lib/utils/image-storage';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useSceneGenerator } from '@/lib/hooks/use-scene-generator';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { useWhiteboardHistoryStore } from '@/lib/store/whiteboard-history';
import { createLogger } from '@/lib/logger';
import { MediaStageProvider } from '@/lib/contexts/media-stage-context';
import { generateMediaForOutlines } from '@/lib/media/media-orchestrator';
import { PENDING_SCENE_ID } from '@/lib/store/stage';
import type { SpeechAction } from '@/lib/types/action';
import type { PdfImage } from '@/lib/types/generation';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { toast } from 'sonner';
import { Loader2, RefreshCw } from 'lucide-react';
import { syncStageFromSource } from '@/lib/utils/stage-storage';

const log = createLogger('Classroom');

function summarizeSpeechProgress(scenes: Array<{ actions?: Array<{ type: string }> }>) {
  const speechActions = scenes.flatMap(
    (scene) =>
      (scene.actions || []).filter(
        (action): action is SpeechAction => action.type === 'speech',
      ),
  );
  const speechReadyCount = speechActions.filter((action) => Boolean(action.audioUrl)).length;
  return {
    speechReadyCount,
    speechMissingCount: Math.max(0, speechActions.length - speechReadyCount),
  };
}

export default function ClassroomDetailPage() {
  const params = useParams();
  const classroomId = params?.id as string;
  const { t, locale } = useI18n();

  const { loadFromStorage } = useStageStore();
  const stage = useStageStore((s) => s.stage);
  const scenes = useStageStore((s) => s.scenes);
  const outlines = useStageStore((s) => s.outlines);
  const generatingOutlines = useStageStore((s) => s.generatingOutlines);
  const generationStatus = useStageStore((s) => s.generationStatus);
  const currentSceneId = useStageStore((s) => s.currentSceneId);
  const setCurrentSceneId = useStageStore((s) => s.setCurrentSceneId);
  const mediaTasks = useMediaGenerationStore((s) => s.tasks);
  const imageGenerationEnabled = useSettingsStore((s) => s.imageGenerationEnabled);
  const videoGenerationEnabled = useSettingsStore((s) => s.videoGenerationEnabled);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** 加载阶段说明；若有进行中的 Agent 任务则轮询写入与总控侧栏一致 */
  const [loadingSubtitle, setLoadingSubtitle] = useState<string>('正在连接服务器并读取笔记本…');
  const [resumeGenerationBusy, setResumeGenerationBusy] = useState(false);
  const [generateMediaBusy, setGenerateMediaBusy] = useState(false);
  const [syncFromSourceBusy, setSyncFromSourceBusy] = useState(false);
  const [sourceNotebookId, setSourceNotebookId] = useState<string | null>(null);

  const { generateRemaining, retrySingleOutline, stop } = useSceneGenerator({
    onComplete: () => {
      log.info('[Classroom] All scenes generated');
    },
  });

  const pendingOutlineCount = useMemo(() => {
    const completedOrders = new Set(scenes.map((scene) => scene.order));
    return outlines.filter((outline) => !completedOrders.has(outline.order)).length;
  }, [outlines, scenes]);

  const actionableMediaCount = useMemo(() => {
    let count = 0;
    for (const outline of outlines) {
      for (const media of outline.mediaGenerations || []) {
        if (media.type === 'image' && !imageGenerationEnabled) continue;
        if (media.type === 'video' && !videoGenerationEnabled) continue;
        const task = mediaTasks[media.elementId];
        if (task) continue;
        count += 1;
      }
    }
    return count;
  }, [outlines, mediaTasks, imageGenerationEnabled, videoGenerationEnabled]);

  const mediaGenerationInFlight = useMemo(
    () => Object.values(mediaTasks).some((task) => task.status === 'pending' || task.status === 'generating'),
    [mediaTasks],
  );

  const handleResumeGeneration = useCallback(async () => {
    if (resumeGenerationBusy || generationStatus === 'generating' || !stage) return;
    if (pendingOutlineCount === 0) {
      toast.success(
        locale === 'zh-CN' ? '当前没有待生成页面。' : 'There are no pending slides to generate.',
      );
      return;
    }

    const genParamsStr = sessionStorage.getItem('generationParams');
    if (!genParamsStr) {
      toast.error(
        locale === 'zh-CN'
          ? '缺少继续生成所需的上下文，请回到创建页重新发起生成。'
          : 'Missing generation context. Please go back to the creation flow and start generation again.',
      );
      return;
    }

    let params: {
      pdfImages?: PdfImage[];
      agents?: unknown[];
      userProfile?: string;
      courseContext?: unknown;
    };
    try {
      params = JSON.parse(genParamsStr);
    } catch {
      toast.error(
        locale === 'zh-CN'
          ? '生成上下文已损坏，请回到创建页重新发起生成。'
          : 'The saved generation context is invalid. Please start generation again from the creation flow.',
      );
      return;
    }

    setResumeGenerationBusy(true);
    try {
      if (currentSceneId == null || currentSceneId === PENDING_SCENE_ID) {
        setCurrentSceneId(PENDING_SCENE_ID);
      }

      const storageIds = (params.pdfImages || []).map((img) => img.storageId).filter(Boolean) as string[];
      const imageMapping = await loadImageMapping(storageIds);
      await generateRemaining({
        pdfImages: params.pdfImages,
        imageMapping,
        stageInfo: {
          name: stage.name || '',
          description: stage.description,
          language: stage.language,
          style: stage.style,
        },
        agents: params.agents as never,
        userProfile: params.userProfile,
        courseContext: params.courseContext as never,
      });
    } catch (resumeError) {
      toast.error(
        locale === 'zh-CN'
          ? `继续生成页面失败：${resumeError instanceof Error ? resumeError.message : '未知错误'}`
          : `Failed to resume slide generation: ${resumeError instanceof Error ? resumeError.message : 'Unknown error'}`,
      );
    } finally {
      setResumeGenerationBusy(false);
    }
  }, [
    currentSceneId,
    generateRemaining,
    generationStatus,
    locale,
    pendingOutlineCount,
    resumeGenerationBusy,
    setCurrentSceneId,
    stage,
  ]);

  const handleGenerateMedia = useCallback(async () => {
    if (generateMediaBusy || mediaGenerationInFlight || !stage) return;
    if (actionableMediaCount === 0) {
      toast.success(
        locale === 'zh-CN'
          ? '当前没有待生成媒体资源。'
          : 'There is no pending media to generate.',
      );
      return;
    }

    setGenerateMediaBusy(true);
    try {
      await generateMediaForOutlines(outlines, stage.id, stage.name);
    } catch (mediaError) {
      toast.error(
        locale === 'zh-CN'
          ? `媒体生成失败：${mediaError instanceof Error ? mediaError.message : '未知错误'}`
          : `Media generation failed: ${mediaError instanceof Error ? mediaError.message : 'Unknown error'}`,
      );
    } finally {
      setGenerateMediaBusy(false);
    }
  }, [
    actionableMediaCount,
    generateMediaBusy,
    locale,
    mediaGenerationInFlight,
    outlines,
    stage,
  ]);

  const loadClassroom = useCallback(async () => {
    try {
      setSourceNotebookId(null);
      const notebookMetaResponse = await fetch(`/api/notebooks/${encodeURIComponent(classroomId)}`, {
        credentials: 'same-origin',
      });
      if (notebookMetaResponse.ok) {
        const notebookMeta = (await notebookMetaResponse.json()) as {
          notebook?: { sourceNotebookId?: string | null };
        };
        const nextSourceNotebookId = notebookMeta.notebook?.sourceNotebookId?.trim();
        setSourceNotebookId(nextSourceNotebookId || null);
      }

      setLoadingSubtitle('正在从服务器加载笔记本与页面…');
      await loadFromStorage(classroomId);
      {
        const loadedState = useStageStore.getState();
        const loadedOutlines = loadedState.outlines;
        const loadedScenes = loadedState.scenes;
        const loadedGeneratingOutlines = loadedState.generatingOutlines;
        const { speechReadyCount, speechMissingCount } = summarizeSpeechProgress(loadedScenes);
        log.info('[Classroom] Load summary after storage restore', {
          classroomId,
          stageId: loadedState.stage?.id ?? null,
          outlineCount: loadedOutlines.length,
          displayedSceneCount: loadedScenes.length,
          displayedSceneOrders: loadedScenes.map((scene) => scene.order),
          pendingOutlineCount: loadedGeneratingOutlines.length,
          pageGenerationCompleted:
            loadedOutlines.length > 0 &&
            loadedGeneratingOutlines.length === 0 &&
            loadedScenes.length >= loadedOutlines.length,
          generationStatus: loadedState.generationStatus,
          currentSceneId: loadedState.currentSceneId,
          speechReadyCount,
          speechMissingCount,
        });
      }

      // If IndexedDB had no data, try server-side storage (API-generated classrooms)
      if (!useStageStore.getState().stage) {
        log.info('No IndexedDB data, trying server-side storage for:', classroomId);
        setLoadingSubtitle('正在从课程服务拉取笔记本数据…');
        try {
          const res = await fetch(`/api/classroom?id=${encodeURIComponent(classroomId)}`);
          if (res.ok) {
            const json = await res.json();
            if (json.success && json.classroom) {
              const { stage, scenes: scenesFromApi } = json.classroom;
              const scenes = Array.isArray(scenesFromApi) ? scenesFromApi : [];
              useStageStore.getState().setStage(stage);
              useStageStore.setState({
                scenes,
                currentSceneId: scenes[0]?.id ?? null,
              });
              log.info('Loaded from server-side storage:', classroomId);
            }
          }
        } catch (fetchErr) {
          log.warn('Server-side storage fetch failed:', fetchErr);
        }
      }

      setLoadingSubtitle('正在恢复媒体生成任务与本地缓存…');
      // Restore completed media generation tasks from IndexedDB
      await useMediaGenerationStore.getState().restoreFromDB(classroomId);
      setLoadingSubtitle('正在加载课程 Agent 配置…');
      // Restore generated agents for this stage
      const { loadGeneratedAgentsForStage } = await import('@/lib/orchestration/registry/store');
      const agentIds = await loadGeneratedAgentsForStage(classroomId);
      if (agentIds.length > 0) {
        const { useSettingsStore } = await import('@/lib/store/settings');
        useSettingsStore.getState().setSelectedAgentIds(agentIds);
      }
    } catch (error) {
      log.error('Failed to load classroom:', error);
      setError(error instanceof Error ? error.message : 'Failed to load classroom');
    } finally {
      setLoading(false);
    }
  }, [classroomId, loadFromStorage]);

  const handleSyncFromSource = useCallback(async () => {
    if (!sourceNotebookId || syncFromSourceBusy) return;
    setSyncFromSourceBusy(true);
    setLoading(true);
    setError(null);
    setLoadingSubtitle('正在同步发布者更新…');
    let reloaded = false;
    try {
      await syncStageFromSource(classroomId);
      await loadClassroom();
      reloaded = true;
      toast.success(
        locale === 'zh-CN'
          ? '已同步发布者最新内容'
          : 'Synced to the latest publisher content.',
      );
    } catch (syncError) {
      toast.error(
        locale === 'zh-CN'
          ? `同步失败：${syncError instanceof Error ? syncError.message : '未知错误'}`
          : `Sync failed: ${syncError instanceof Error ? syncError.message : 'Unknown error'}`,
      );
    } finally {
      if (!reloaded) setLoading(false);
      setSyncFromSourceBusy(false);
    }
  }, [classroomId, loadClassroom, locale, sourceNotebookId, syncFromSourceBusy]);

  /** 生成过程中从聊天/总控同步的任务详情（与右侧「进行中」一致） */
  useEffect(() => {
    if (!loading || !classroomId?.trim()) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(
          `/api/agent-tasks?notebookId=${encodeURIComponent(classroomId.trim())}`,
          { credentials: 'same-origin' },
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          tasks: Array<{ status: string; request?: unknown }>;
        };
        const active = data.tasks.find(
          (t) => t.status === 'running' || t.status === 'waiting' || t.status === 'queued',
        );
        if (!active || cancelled) return;
        const req = (active.request || {}) as { detail?: string };
        if (typeof req.detail === 'string' && req.detail.trim()) {
          setLoadingSubtitle(req.detail.trim());
        }
      } catch {
        /* ignore */
      }
    };
    void tick();
    const id = window.setInterval(tick, 1200);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [loading, classroomId]);

  useEffect(() => {
    if (loading || error || !stage) return;
    const { speechReadyCount, speechMissingCount } = summarizeSpeechProgress(scenes);
    const pageGenerationCompleted =
      outlines.length > 0 && generatingOutlines.length === 0 && scenes.length >= outlines.length;

    log.info('[Classroom] Render state snapshot', {
      classroomId,
      stageId: stage.id,
      stageName: stage.name,
      outlineCount: outlines.length,
      displayedSceneCount: scenes.length,
      displayedSceneOrders: scenes.map((scene) => scene.order),
      pendingOutlineCount: generatingOutlines.length,
      pendingOutlineOrders: generatingOutlines.map((outline) => outline.order),
      pageGenerationCompleted,
      generationStatus,
      currentSceneId,
      speechReadyCount,
      speechMissingCount,
    });
  }, [
    classroomId,
    currentSceneId,
    error,
    generationStatus,
    generatingOutlines,
    loading,
    outlines,
    scenes,
    stage,
  ]);

  useEffect(() => {
    // Reset loading state on course switch to unmount Stage during transition,
    // preventing stale data from syncing back to the new course
    setLoading(true);
    setError(null);
    setLoadingSubtitle('正在连接服务器并读取笔记本…');

    // Clear previous classroom's media tasks to prevent cross-classroom contamination.
    // Placeholder IDs (gen_img_1, gen_vid_1) are NOT globally unique across stages,
    // so stale tasks from a previous classroom would shadow the new one's.
    const mediaStore = useMediaGenerationStore.getState();
    mediaStore.revokeObjectUrls();
    useMediaGenerationStore.setState({ tasks: {} });

    // Clear whiteboard history to prevent snapshots from a previous course leaking in.
    useWhiteboardHistoryStore.getState().clearHistory();

    loadClassroom();

    // Cancel ongoing generation when classroomId changes or component unmounts
    return () => {
      stop();
    };
  }, [classroomId, loadClassroom, stop]);

  useEffect(() => {
    if (loading || error) return;
    const cid = stage?.courseId?.trim();
    if (!cid) {
      useCurrentCourseStore.getState().clearCurrentCourse();
      return;
    }
    let cancelled = false;
    (async () => {
      const c = await getCourse(cid);
      if (cancelled) return;
      if (c) {
        useCurrentCourseStore.getState().setCurrentCourse({
          id: c.id,
          name: c.name,
          avatarUrl: c.avatarUrl,
        });
      } else {
        useCurrentCourseStore.getState().clearCurrentCourse();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, error, stage?.courseId]);

  const manualGenerationActions =
    sourceNotebookId ||
    pendingOutlineCount > 0 ||
    actionableMediaCount > 0 ||
    mediaGenerationInFlight ? (
      <>
        {sourceNotebookId ? (
          <button
            type="button"
            onClick={() => void handleSyncFromSource()}
            disabled={syncFromSourceBusy}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-all hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-70 dark:border-emerald-500/30 dark:bg-emerald-950/35 dark:text-emerald-200 dark:hover:bg-emerald-950/55"
            title={locale === 'zh-CN' ? '用发布者最新版本覆盖当前笔记本' : 'Overwrite with the latest publisher version'}
          >
            {syncFromSourceBusy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            {locale === 'zh-CN' ? '更新笔记本' : 'Update notebook'}
          </button>
        ) : null}

        {pendingOutlineCount > 0 ? (
          <button
            type="button"
            onClick={() => void handleResumeGeneration()}
            disabled={resumeGenerationBusy || generationStatus === 'generating'}
            className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 transition-all hover:bg-violet-100 disabled:cursor-wait disabled:opacity-70 dark:border-violet-500/30 dark:bg-violet-950/35 dark:text-violet-200 dark:hover:bg-violet-950/55"
            title={t('stage.resumePageGenerationTooltip')}
          >
            {resumeGenerationBusy || generationStatus === 'generating' ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : null}
            {t('stage.resumePageGenerationButton')}
            {pendingOutlineCount > 0 ? ` (${pendingOutlineCount})` : ''}
          </button>
        ) : null}

        {(actionableMediaCount > 0 || mediaGenerationInFlight) ? (
          <button
            type="button"
            onClick={() => void handleGenerateMedia()}
            disabled={generateMediaBusy || mediaGenerationInFlight}
            className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-700 transition-all hover:bg-cyan-100 disabled:cursor-wait disabled:opacity-70 dark:border-cyan-500/30 dark:bg-cyan-950/35 dark:text-cyan-200 dark:hover:bg-cyan-950/55"
            title={t('stage.generateMediaTooltip')}
          >
            {generateMediaBusy || mediaGenerationInFlight ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : null}
            {t('stage.generateMediaButton')}
            {actionableMediaCount > 0 ? ` (${actionableMediaCount})` : ''}
          </button>
        ) : null}
      </>
    ) : null;

  return (
    <ThemeProvider>
      <MediaStageProvider value={classroomId}>
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          {loading ? (
            <div className="apple-mesh-bg flex flex-1 items-center justify-center px-4">
              <div className="apple-glass max-w-md rounded-[20px] px-8 py-6 text-center">
                <p className="text-sm font-medium text-[#1d1d1f] dark:text-white">正在加载教室</p>
                <p className="mt-2 text-xs leading-relaxed text-[#86868b] dark:text-[#a1a1a6]">
                  {loadingSubtitle}
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="apple-mesh-bg flex flex-1 items-center justify-center px-4">
              <div className="apple-glass max-w-md rounded-[20px] px-8 py-6 text-center">
                <p className="mb-4 text-sm text-red-600 dark:text-red-400">Error: {error}</p>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setLoading(true);
                    loadClassroom();
                  }}
                  className="apple-btn apple-btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : (
            <Stage onRetryOutline={retrySingleOutline} headerActions={manualGenerationActions} />
          )}
        </div>
      </MediaStageProvider>
    </ThemeProvider>
  );
}
