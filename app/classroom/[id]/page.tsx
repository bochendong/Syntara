'use client';

import { Stage } from '@/components/stage';
import { ThemeProvider } from '@/lib/hooks/use-theme';
import { useStageStore } from '@/lib/store';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { getCourse } from '@/lib/utils/course-storage';
import { loadImageMapping } from '@/lib/utils/image-storage';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useSceneGenerator } from '@/lib/hooks/use-scene-generator';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { useWhiteboardHistoryStore } from '@/lib/store/whiteboard-history';
import { createLogger } from '@/lib/logger';
import { MediaStageProvider } from '@/lib/contexts/media-stage-context';
import { generateMediaForOutlines } from '@/lib/media/media-orchestrator';
import { PENDING_SCENE_ID } from '@/lib/store/stage';

const log = createLogger('Classroom');

export default function ClassroomDetailPage() {
  const params = useParams();
  const classroomId = params?.id as string;

  const { loadFromStorage } = useStageStore();
  const stage = useStageStore((s) => s.stage);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** 加载阶段说明；若有进行中的 Agent 任务则轮询写入与总控侧栏一致 */
  const [loadingSubtitle, setLoadingSubtitle] = useState<string>('正在连接服务器并读取笔记本…');

  const generationStartedRef = useRef(false);

  const { generateRemaining, retrySingleOutline, stop } = useSceneGenerator({
    onComplete: () => {
      log.info('[Classroom] All scenes generated');
    },
  });

  const loadClassroom = useCallback(async () => {
    try {
      setLoadingSubtitle('正在从服务器加载笔记本与页面…');
      await loadFromStorage(classroomId);

      // If IndexedDB had no data, try server-side storage (API-generated classrooms)
      if (!useStageStore.getState().stage) {
        log.info('No IndexedDB data, trying server-side storage for:', classroomId);
        setLoadingSubtitle('正在从课程服务拉取笔记本数据…');
        try {
          const res = await fetch(`/api/classroom?id=${encodeURIComponent(classroomId)}`);
          if (res.ok) {
            const json = await res.json();
            if (json.success && json.classroom) {
              const { stage, scenes } = json.classroom;
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
    // Reset loading state on course switch to unmount Stage during transition,
    // preventing stale data from syncing back to the new course
    setLoading(true);
    setError(null);
    setLoadingSubtitle('正在连接服务器并读取笔记本…');
    generationStartedRef.current = false;

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

  // Auto-resume generation for pending outlines
  useEffect(() => {
    if (loading || error || generationStartedRef.current) return;

    const state = useStageStore.getState();
    const { outlines, scenes, stage } = state;

    // Check if there are pending outlines
    const completedOrders = new Set(scenes.map((s) => s.order));
    const hasPending = outlines.some((o) => !completedOrders.has(o.order));

    if (hasPending && stage) {
      generationStartedRef.current = true;

      if (scenes.length === 0 && state.currentSceneId !== PENDING_SCENE_ID) {
        useStageStore.getState().setCurrentSceneId(PENDING_SCENE_ID);
      }

      // Load generation params from sessionStorage (stored by generation-preview before navigating)
      const genParamsStr = sessionStorage.getItem('generationParams');
      const params = genParamsStr ? JSON.parse(genParamsStr) : {};

      // Reconstruct imageMapping from IndexedDB using pdfImages storageIds
      const storageIds = (params.pdfImages || [])
        .map((img: { storageId?: string }) => img.storageId)
        .filter(Boolean);

      loadImageMapping(storageIds).then((imageMapping) => {
        generateRemaining({
          pdfImages: params.pdfImages,
          imageMapping,
          stageInfo: {
            name: stage.name || '',
            description: stage.description,
            language: stage.language,
            style: stage.style,
          },
          agents: params.agents,
          userProfile: params.userProfile,
          courseContext: params.courseContext,
        });
      });
    } else if (outlines.length > 0 && stage) {
      // All scenes are generated, but some media may not have finished.
      // Resume media generation for any tasks not yet in IndexedDB.
      // generateMediaForOutlines skips already-completed tasks automatically.
      generationStartedRef.current = true;
      generateMediaForOutlines(outlines, stage.id).catch((err) => {
        log.warn('[Classroom] Media generation resume error:', err);
      });
    }
  }, [loading, error, generateRemaining]);

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
            <Stage onRetryOutline={retrySingleOutline} />
          )}
        </div>
      </MediaStageProvider>
    </ThemeProvider>
  );
}
