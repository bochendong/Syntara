'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ThemeProvider } from '@/lib/hooks/use-theme';
import { useStageStore } from '@/lib/store';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { getCourse } from '@/lib/utils/course-storage';
import { loadImageMapping } from '@/lib/utils/image-storage';
import { useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { useSceneGenerator } from '@/lib/hooks/use-scene-generator';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { useWhiteboardHistoryStore } from '@/lib/store/whiteboard-history';
import { createLogger } from '@/lib/logger';
import { MediaStageProvider } from '@/lib/contexts/media-stage-context';
import { generateMediaRequests } from '@/lib/media/media-orchestrator';
import { collectMediaGenerationRequestsForScene } from '@/lib/media/media-generation-requests';
import { PENDING_SCENE_ID } from '@/lib/store/stage';
import type { SpeechAction } from '@/lib/types/action';
import type { PdfImage } from '@/lib/types/generation';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { toast } from '@/lib/notifications/client-toast';
import { BookOpen, FileText, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { syncStageFromSource } from '@/lib/utils/stage-storage';
import { refreshSemanticSlideScene } from '@/lib/notebook-content/semantic-slide-render';
import { readGenerationContext } from '@/lib/utils/generation-context-storage';
import { getCurrentPageGenerationData } from '@/lib/utils/current-page-generation-data';
import { backendFetch } from '@/lib/utils/backend-api';
import { ClassroomLoadingSkeleton } from '@/components/loading/app-page-skeletons';
import { MessageResponse } from '@/components/ai-elements/message';
import type { Scene, Stage as StageData } from '@/lib/types/stage';

const log = createLogger('Classroom');

const Stage = dynamic(() => import('@/components/stage').then((mod) => mod.Stage), {
  ssr: false,
  loading: () => <ClassroomLoadingSkeleton subtitle="正在准备课堂画布…" />,
});

function summarizeSpeechProgress(scenes: Array<{ actions?: Array<{ type: string }> }>) {
  const speechActions = scenes.flatMap((scene) =>
    (scene.actions || []).filter((action): action is SpeechAction => action.type === 'speech'),
  );
  const speechReadyCount = speechActions.filter((action) => Boolean(action.audioUrl)).length;
  return {
    speechReadyCount,
    speechMissingCount: Math.max(0, speechActions.length - speechReadyCount),
  };
}

function MarkdownNotebookReader({
  stage,
  scenes,
  currentSceneId,
  onSelectScene,
  headerActions,
}: {
  stage: StageData;
  scenes: Scene[];
  currentSceneId: string | null;
  onSelectScene: (sceneId: string) => void;
  headerActions?: ReactNode;
}) {
  const sections = useMemo(
    () => scenes.filter((scene) => scene.content.type === 'markdown'),
    [scenes],
  );
  const fallbackActiveSectionId =
    currentSceneId && sections.some((scene) => scene.id === currentSceneId)
      ? currentSceneId
      : sections[0]?.id || null;
  const [scrollActiveSectionId, setScrollActiveSectionId] = useState<string | null>(
    fallbackActiveSectionId,
  );
  const activeSectionId =
    scrollActiveSectionId && sections.some((section) => section.id === scrollActiveSectionId)
      ? scrollActiveSectionId
      : fallbackActiveSectionId;
  const activeSectionIdRef = useRef<string | null>(activeSectionId);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const navItemRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());
  const scrollRafRef = useRef<number | null>(null);
  const courseHref = stage.courseId
    ? `/course/${encodeURIComponent(stage.courseId)}`
    : '/my-courses';
  const sectionAnchors = useMemo(
    () =>
      sections.map((section, index) => ({
        sceneId: section.id,
        domId: `markdown-${String(section.id || index).replace(/[^a-zA-Z0-9_-]/g, '-')}`,
        title: section.title || `Markdown ${index + 1}`,
        summary: section.content.type === 'markdown' ? section.content.summary : undefined,
      })),
    [sections],
  );

  const setActiveSection = useCallback(
    (sceneId: string | null) => {
      if (!sceneId || activeSectionIdRef.current === sceneId) return;
      activeSectionIdRef.current = sceneId;
      setScrollActiveSectionId(sceneId);
      onSelectScene(sceneId);
    },
    [onSelectScene],
  );

  const syncActiveSectionFromScroll = useCallback(() => {
    const scrollRoot = scrollContainerRef.current;
    if (!scrollRoot || sections.length === 0) return;

    const rootRect = scrollRoot.getBoundingClientRect();
    const probeY = rootRect.top + Math.min(152, rootRect.height * 0.24);
    let nextSectionId = sections[0]?.id ?? null;

    for (const section of sections) {
      const sectionNode = sectionRefs.current.get(section.id);
      if (!sectionNode) continue;
      const sectionRect = sectionNode.getBoundingClientRect();
      if (sectionRect.top <= probeY) {
        nextSectionId = section.id;
      } else {
        break;
      }
    }

    setActiveSection(nextSectionId);
  }, [sections, setActiveSection]);

  const scheduleScrollSync = useCallback(() => {
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      syncActiveSectionFromScroll();
    });
  }, [syncActiveSectionFromScroll]);

  useEffect(() => {
    activeSectionIdRef.current = activeSectionId;
  }, [activeSectionId]);

  useEffect(() => {
    const scrollRoot = scrollContainerRef.current;
    if (!scrollRoot) return;

    scrollRoot.addEventListener('scroll', scheduleScrollSync, { passive: true });
    window.addEventListener('resize', scheduleScrollSync);
    const initialSyncTimer = window.setTimeout(scheduleScrollSync, 0);

    return () => {
      scrollRoot.removeEventListener('scroll', scheduleScrollSync);
      window.removeEventListener('resize', scheduleScrollSync);
      window.clearTimeout(initialSyncTimer);
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [scheduleScrollSync]);

  useEffect(() => {
    const activeNavItem = activeSectionId ? navItemRefs.current.get(activeSectionId) : null;
    activeNavItem?.scrollIntoView({ block: 'nearest' });
  }, [activeSectionId]);

  return (
    <div className="flex min-h-0 flex-1 bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <aside className="hidden w-[280px] shrink-0 border-r border-slate-200 bg-white/88 p-4 lg:flex lg:flex-col dark:border-white/10 dark:bg-white/[0.04]">
        <Link
          href={courseHref}
          className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
        >
          <BookOpen className="size-3.5" />
          返回课程
        </Link>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300">
            Markdown 文档
          </p>
          <h1 className="mt-1 line-clamp-2 text-lg font-semibold">{stage.name}</h1>
          {stage.description ? (
            <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {stage.description}
            </p>
          ) : null}
        </div>
        <nav
          aria-label="Markdown 章节目录"
          className="mt-5 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1"
        >
          {sectionAnchors.map((section, index) => {
            const active = section.sceneId === activeSectionId;
            return (
              <a
                key={section.sceneId}
                ref={(node) => {
                  if (node) {
                    navItemRefs.current.set(section.sceneId, node);
                  } else {
                    navItemRefs.current.delete(section.sceneId);
                  }
                }}
                href={`#${section.domId}`}
                aria-current={active ? 'location' : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  setActiveSection(section.sceneId);
                  sectionRefs.current
                    .get(section.sceneId)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  window.history.replaceState(null, '', `#${section.domId}`);
                }}
                className={[
                  'relative flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-all',
                  active
                    ? 'border-blue-300 bg-blue-50 text-blue-950 shadow-sm ring-1 ring-blue-200/70 dark:border-blue-400/50 dark:bg-blue-400/12 dark:text-blue-50 dark:ring-blue-400/20'
                    : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 dark:text-slate-300 dark:hover:border-white/10 dark:hover:bg-white/[0.06]',
                ].join(' ')}
              >
                {active ? (
                  <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-blue-600 dark:bg-blue-300" />
                ) : null}
                <span
                  className={[
                    'mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold shadow-sm ring-1',
                    active
                      ? 'bg-blue-600 text-white ring-blue-600 dark:bg-blue-300 dark:text-slate-950 dark:ring-blue-300'
                      : 'bg-white text-slate-500 ring-slate-900/[0.06] dark:bg-black/20 dark:text-slate-300 dark:ring-white/10',
                  ].join(' ')}
                >
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{section.title}</span>
                  {section.summary ? (
                    <span className="mt-1 line-clamp-2 text-[11px] leading-4 opacity-75">
                      {section.summary}
                    </span>
                  ) : null}
                </span>
              </a>
            );
          })}
        </nav>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 items-center justify-between gap-3 border-b border-slate-200 bg-white/88 px-5 py-3 dark:border-white/10 dark:bg-white/[0.04]">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {sections.length} 段 Markdown 内容
            </p>
            <h2 className="truncate text-base font-semibold">{stage.name}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">{headerActions}</div>
        </div>
        <div
          ref={scrollContainerRef}
          className="min-h-0 flex-1 scroll-smooth overflow-auto bg-slate-100/60 px-4 py-6 sm:px-8 lg:px-12 dark:bg-slate-950"
        >
          {sections.length > 0 ? (
            <article className="mx-auto flex max-w-4xl flex-col gap-8 pb-16">
              {sections.map((section, index) => {
                if (section.content.type !== 'markdown') return null;
                const anchor = sectionAnchors[index];
                return (
                  <section
                    key={section.id}
                    id={anchor.domId}
                    ref={(node) => {
                      if (node) {
                        sectionRefs.current.set(section.id, node);
                      } else {
                        sectionRefs.current.delete(section.id);
                      }
                    }}
                    className="scroll-mt-6 overflow-hidden rounded-lg border border-slate-300/85 border-t-4 border-t-blue-500/80 bg-white shadow-[0_16px_36px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/[0.04] dark:border-white/12 dark:border-t-blue-300/80 dark:bg-white/[0.045] dark:ring-white/[0.05]"
                  >
                    <header className="border-b border-slate-200 bg-slate-100/80 px-5 py-4 dark:border-white/10 dark:bg-white/[0.05] sm:px-7">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="mt-0.5 inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md bg-slate-950 px-2 text-xs font-bold text-white dark:bg-white dark:text-slate-950">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                            章节
                          </p>
                          <h3 className="mt-1 text-lg font-semibold leading-7 text-slate-950 dark:text-white">
                            {anchor.title}
                          </h3>
                          {anchor.summary ? (
                            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                              {anchor.summary}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </header>
                    <div className="px-5 py-6 sm:px-7 sm:py-7">
                      <MessageResponse className="text-[15px] leading-8 text-slate-800 dark:text-slate-100 [&_a]:text-blue-600 [&_a]:underline-offset-4 hover:[&_a]:underline dark:[&_a]:text-blue-300 [&_[data-streamdown=image-wrapper]]:my-7 [&_[data-streamdown=image-wrapper]]:block [&_[data-streamdown=image-wrapper]]:w-full [&_[data-streamdown=image]]:mx-auto [&_[data-streamdown=image]]:max-h-[520px] [&_[data-streamdown=image]]:w-full [&_[data-streamdown=image]]:max-w-3xl [&_[data-streamdown=image]]:border [&_[data-streamdown=image]]:border-slate-200 [&_[data-streamdown=image]]:bg-white [&_[data-streamdown=image]]:object-contain [&_[data-streamdown=image]]:shadow-sm dark:[&_[data-streamdown=image]]:border-white/10 dark:[&_[data-streamdown=image]]:bg-slate-900">
                        {section.content.markdown}
                      </MessageResponse>
                    </div>
                  </section>
                );
              })}
            </article>
          ) : (
            <div className="mx-auto flex min-h-[360px] max-w-3xl items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white/80 text-center text-sm text-slate-500 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-400">
              <div>
                <FileText className="mx-auto mb-3 size-8 opacity-60" />
                这个 Markdown 笔记本还没有内容。
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function ClassroomDetailPage() {
  const params = useParams();
  const classroomId = params?.id as string;
  const { t, locale } = useI18n();

  const { loadFromStorage } = useStageStore();
  const stage = useStageStore((s) => s.stage);
  const scenes = useStageStore((s) => s.scenes);
  const markdownScenes = useStageStore((s) => s.markdownScenes);
  const outlines = useStageStore((s) => s.outlines);
  const generatingOutlines = useStageStore((s) => s.generatingOutlines);
  const generationStatus = useStageStore((s) => s.generationStatus);
  const currentSceneId = useStageStore((s) => s.currentSceneId);
  const setCurrentSceneId = useStageStore((s) => s.setCurrentSceneId);
  const discardPendingOutlines = useStageStore((s) => s.discardPendingOutlines);
  const mediaTasks = useMediaGenerationStore((s) => s.tasks);
  const imageGenerationEnabled = useSettingsStore((s) => s.imageGenerationEnabled);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** 加载阶段说明；若有进行中的 Agent 任务则轮询写入与总控侧栏一致 */
  const [loadingSubtitle, setLoadingSubtitle] = useState<string>('正在连接服务器并读取笔记本…');
  const [resumeGenerationBusy, setResumeGenerationBusy] = useState(false);
  const [generateMediaBusy, setGenerateMediaBusy] = useState(false);
  const [syncFromSourceBusy, setSyncFromSourceBusy] = useState(false);
  const [sourceNotebookId, setSourceNotebookId] = useState<string | null>(null);
  const [showMarkdownReader, setShowMarkdownReader] = useState(false);
  const [currentMarkdownSceneId, setCurrentMarkdownSceneId] = useState<string | null>(null);

  const { generateRemaining, retrySingleOutline, stop } = useSceneGenerator({
    onComplete: () => {
      log.info('[Classroom] All scenes generated');
    },
  });

  const pendingOutlineCount = useMemo(() => {
    return generatingOutlines.length;
  }, [generatingOutlines.length]);

  const currentPageGenerationData = useMemo(
    () => getCurrentPageGenerationData({ scenes, outlines, sceneId: currentSceneId }),
    [currentSceneId, outlines, scenes],
  );

  const currentPageImageRequests = useMemo(() => {
    if (!currentPageGenerationData) return [];
    return collectMediaGenerationRequestsForScene({
      scene: currentPageGenerationData.scene,
      outlines,
      preferredOutlines: [
        currentPageGenerationData.currentOutline,
        currentPageGenerationData.rootOutline,
        ...currentPageGenerationData.relatedOutlines,
      ],
      type: 'image',
    });
  }, [currentPageGenerationData, outlines]);

  const actionableMediaCount = useMemo(() => {
    if (!imageGenerationEnabled) return 0;
    return currentPageImageRequests.filter((media) => !mediaTasks[media.elementId]).length;
  }, [currentPageImageRequests, imageGenerationEnabled, mediaTasks]);

  const mediaGenerationInFlight = useMemo(
    () =>
      currentPageImageRequests.some((media) => {
        const task = mediaTasks[media.elementId];
        return task?.status === 'pending' || task?.status === 'generating';
      }),
    [currentPageImageRequests, mediaTasks],
  );

  const handleResumeGeneration = useCallback(async () => {
    if (resumeGenerationBusy || generationStatus === 'generating' || !stage) return;
    if (pendingOutlineCount === 0) {
      toast.success(
        locale === 'zh-CN' ? '当前没有待生成页面。' : 'There are no pending slides to generate.',
      );
      return;
    }

    let params: {
      pdfImages?: PdfImage[];
      agents?: unknown[];
      userProfile?: string;
      courseContext?: unknown;
    };
    const savedContext = readGenerationContext(stage.id);
    if (savedContext) {
      params = savedContext;
    } else {
      params = {};
      toast.info(
        locale === 'zh-CN'
          ? '未找到首次生成时的上下文，将按当前笔记本信息继续生成；结果可能与原始生成略有差异。'
          : 'The original generation context is unavailable. Continuing with the current notebook info; results may differ slightly from the original run.',
      );
    }

    setResumeGenerationBusy(true);
    try {
      if (currentSceneId == null || currentSceneId === PENDING_SCENE_ID) {
        setCurrentSceneId(PENDING_SCENE_ID);
      }

      const storageIds = (params.pdfImages || [])
        .map((img) => img.storageId)
        .filter(Boolean) as string[];
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
        locale === 'zh-CN' ? '当前页没有待生成图片。' : 'There are no pending images on this page.',
      );
      return;
    }

    setGenerateMediaBusy(true);
    try {
      await generateMediaRequests(currentPageImageRequests, stage.id, stage.name);
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
    currentPageImageRequests,
    generateMediaBusy,
    locale,
    mediaGenerationInFlight,
    stage,
  ]);

  const handleCancelPendingGeneration = useCallback(() => {
    if (pendingOutlineCount === 0) return;
    const confirmed = window.confirm(t('stage.cancelPendingGenerationConfirm'));
    if (!confirmed) return;

    stop();
    const removedCount = discardPendingOutlines();
    if (removedCount > 0) {
      toast.success(t('stage.cancelPendingGenerationSuccess'));
    }
  }, [discardPendingOutlines, pendingOutlineCount, stop, t]);

  const loadClassroom = useCallback(async () => {
    try {
      setSourceNotebookId(null);
      setShowMarkdownReader(false);
      setCurrentMarkdownSceneId(null);
      const notebookMetaResponse = await backendFetch(
        `/api/notebooks/${encodeURIComponent(classroomId)}`,
        {
          method: 'GET',
        },
      );
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
        const loadedMarkdownScenes = loadedState.markdownScenes;
        const loadedGeneratingOutlines = loadedState.generatingOutlines;
        const { speechReadyCount, speechMissingCount } = summarizeSpeechProgress(loadedScenes);
        log.info('[Classroom] Load summary after storage restore', {
          classroomId,
          stageId: loadedState.stage?.id ?? null,
          outlineCount: loadedOutlines.length,
          displayedSceneCount: loadedScenes.length,
          markdownSectionCount: loadedMarkdownScenes.length,
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
          const res = await backendFetch(`/api/classroom?id=${encodeURIComponent(classroomId)}`);
          if (res.ok) {
            const json = await res.json();
            if (json.success && json.classroom) {
              const { stage, scenes: scenesFromApi } = json.classroom;
              const scenes = Array.isArray(scenesFromApi)
                ? scenesFromApi.map((scene) => refreshSemanticSlideScene(scene))
                : [];
              useStageStore.getState().setStage(stage);
              useStageStore.setState({
                scenes,
                markdownScenes: [],
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
        locale === 'zh-CN' ? '已同步发布者最新内容' : 'Synced to the latest publisher content.',
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
    let inFlight = false;
    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await backendFetch(
          `/api/agent-tasks?notebookId=${encodeURIComponent(classroomId.trim())}`,
          { method: 'GET' },
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
      } finally {
        inFlight = false;
      }
    };
    void tick();
    const id = window.setInterval(tick, 5000);
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

  const mixedMarkdownScenes = useMemo(
    () => markdownScenes.filter((scene) => scene.content.type === 'markdown'),
    [markdownScenes],
  );
  const isPureMarkdownNotebook = stage?.notebookKind === 'markdown';
  const hasMixedMarkdown = !isPureMarkdownNotebook && mixedMarkdownScenes.length > 0;
  const markdownReaderScenes = isPureMarkdownNotebook ? scenes : mixedMarkdownScenes;
  const shouldShowMarkdownReader =
    Boolean(isPureMarkdownNotebook) || (hasMixedMarkdown && showMarkdownReader);
  const markdownReaderCurrentSceneId = isPureMarkdownNotebook
    ? currentSceneId
    : currentMarkdownSceneId;
  const handleSelectMarkdownScene = isPureMarkdownNotebook
    ? setCurrentSceneId
    : setCurrentMarkdownSceneId;

  useEffect(() => {
    if (!hasMixedMarkdown) {
      setShowMarkdownReader(false);
      setCurrentMarkdownSceneId(null);
      return;
    }

    if (
      currentMarkdownSceneId &&
      mixedMarkdownScenes.some((scene) => scene.id === currentMarkdownSceneId)
    ) {
      return;
    }
    setCurrentMarkdownSceneId(mixedMarkdownScenes[0]?.id ?? null);
  }, [currentMarkdownSceneId, hasMixedMarkdown, mixedMarkdownScenes]);

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
            title={
              locale === 'zh-CN'
                ? '用发布者最新版本覆盖当前笔记本'
                : 'Overwrite with the latest publisher version'
            }
          >
            {syncFromSourceBusy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
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

        {pendingOutlineCount > 0 ? (
          <button
            type="button"
            onClick={handleCancelPendingGeneration}
            className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition-all hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-950/35 dark:text-rose-200 dark:hover:bg-rose-950/55"
            title={t('stage.cancelPendingGenerationTooltip')}
          >
            <Trash2 className="size-3.5" />
            {t('stage.cancelPendingGenerationButton')}
          </button>
        ) : null}

        {actionableMediaCount > 0 || mediaGenerationInFlight ? (
          <button
            type="button"
            onClick={() => void handleGenerateMedia()}
            disabled={generateMediaBusy || mediaGenerationInFlight}
            className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-700 transition-all hover:bg-cyan-100 disabled:cursor-wait disabled:opacity-70 dark:border-cyan-500/30 dark:bg-cyan-950/35 dark:text-cyan-200 dark:hover:bg-cyan-950/55"
            title={t('stage.generatePageImagesTooltip')}
          >
            {generateMediaBusy || mediaGenerationInFlight ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : null}
            {t('stage.generatePageImagesButton')}
            {actionableMediaCount > 0 ? ` (${actionableMediaCount})` : ''}
          </button>
        ) : null}
      </>
    ) : null;
  const markdownToggleAction = hasMixedMarkdown ? (
    <button
      type="button"
      onClick={() => setShowMarkdownReader((value) => !value)}
      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200 dark:hover:border-blue-400/40 dark:hover:bg-blue-400/10 dark:hover:text-blue-100"
    >
      <FileText className="size-3.5" />
      {showMarkdownReader
        ? locale === 'zh-CN'
          ? '返回幻灯片'
          : 'Back to slides'
        : `Markdown ${mixedMarkdownScenes.length}`}
    </button>
  ) : null;
  const classroomHeaderActions =
    markdownToggleAction || manualGenerationActions ? (
      <>
        {markdownToggleAction}
        {manualGenerationActions}
      </>
    ) : null;

  return (
    <ThemeProvider>
      <MediaStageProvider value={classroomId}>
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          {loading ? (
            <ClassroomLoadingSkeleton subtitle={loadingSubtitle} />
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
          ) : stage && shouldShowMarkdownReader ? (
            <MarkdownNotebookReader
              stage={stage}
              scenes={markdownReaderScenes}
              currentSceneId={markdownReaderCurrentSceneId}
              onSelectScene={handleSelectMarkdownScene}
              headerActions={classroomHeaderActions}
            />
          ) : (
            <Stage onRetryOutline={retrySingleOutline} headerActions={classroomHeaderActions} />
          )}
        </div>
      </MediaStageProvider>
    </ThemeProvider>
  );
}
