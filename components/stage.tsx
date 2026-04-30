'use client';

import { useState, useEffect, useRef, useMemo, useCallback, type ReactNode } from 'react';
import type { UIMessage } from 'ai';
import { useSearchParams } from 'next/navigation';
import { useStageStore } from '@/lib/store';
import { PENDING_SCENE_ID } from '@/lib/store/stage';
import { useCanvasStore } from '@/lib/store/canvas';
import { useSettingsStore } from '@/lib/store/settings';
import { useI18n } from '@/lib/hooks/use-i18n';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { renderSemanticSlideContent } from '@/lib/notebook-content/semantic-slide-render';
import {
  buildTitleCoverSlideContentFromParts,
  shouldUpgradeLegacyTitleCoverContent,
} from '@/lib/generation/title-cover';
import { Header } from './header';
import { ProblemBankView } from '@/components/problem-bank/problem-bank-view';
import { CanvasPlaybackPill } from '@/components/canvas/canvas-playback-pill';
import { CanvasArea } from '@/components/canvas/canvas-area';
import { PlaybackEngine, computePlaybackView } from '@/lib/playback';
import type { EngineMode, TriggerEvent, Effect } from '@/lib/playback';
import { ActionEngine } from '@/lib/action/engine';
import { createAudioPlayer } from '@/lib/utils/audio-player';
import type { Action, MouthShape, SpeechAction } from '@/lib/types/action';
import type { Scene, SceneType } from '@/lib/types/stage';
import type { SceneOutline } from '@/lib/types/generation';
import {
  normalizeAzureVisemesToMouthCues,
  resolveCurrentMouthCueFrame,
} from '@/lib/audio/mouth-cues';
import { verbalizeNarrationText } from '@/lib/audio/spoken-text';
import type { TTSProviderId } from '@/lib/audio/types';
// Playback state persistence removed — refresh always starts from the beginning
import type { ChatAreaRef } from '@/components/chat/chat-area';
import { useAgentRegistry } from '@/lib/orchestration/registry/store';
import { getActionsForRole } from '@/lib/orchestration/registry/types';
import { ensureMissingSpeechAudioForScene } from '@/lib/hooks/use-scene-generator';
import { hydrateSpeechAudioFromTtsCache } from '@/lib/utils/tts-audio-cache';
import type { AgentConfig } from '@/lib/orchestration/registry/types';
import { buildSceneSidebarAskThreadFromMessages } from '@/lib/utils/scene-sidebar-ask-thread';
import { runCourseSideChatLoop } from '@/lib/chat/run-course-side-chat-loop';
import type { ChatMessageMetadata } from '@/lib/types/chat';
import { toast } from 'sonner';
import { ClassroomFooter } from '@/components/stage/classroom-footer';
import { ClassroomFooterVoiceChip } from '@/components/stage/classroom-footer-voice-chip';
import { SpeechGenerationIndicator } from '@/components/audio/speech-generation-indicator';
import { SlideNarrationEditor } from '@/components/stage/slide-narration-editor';
import { ClassroomSlideCanvasEditor } from '@/components/stage/classroom-slide-canvas-editor';
import { ClassroomSemanticSlideEditor } from '@/components/stage/classroom-semantic-slide-editor';
import { LIVE2D_PRESENTER_MODELS } from '@/lib/live2d/presenter-models';
import { sceneTypeTabLabel } from '@/components/stage/stage-helpers';
import {
  buildRawTypePayloadJson,
  canReflowGridScene,
  canReflowLayoutCardsScene,
  getRawCurrentOutline,
  getRawCurrentScene,
  getRawDataTabTypes,
  renderReflowedGridScene,
  renderReflowedLayoutCardsScene,
  type RawSlideDataView,
} from '@/components/stage/raw-view-helpers';
import { normalizeSyntaraMarkupLayout, type NotebookContentDocument } from '@/lib/notebook-content';
import {
  EditorStatusChip,
  StageTitleActions,
  StageViewToggle,
  type MainClassroomView,
  type SlideEditorSidebarTab,
  type SlideEditTab,
} from '@/components/stage/stage-toolbar-controls';
import { RawDataPanel } from '@/components/stage/raw-data-panel';
import { StageConfirmationDialogs } from '@/components/stage/stage-confirmation-dialogs';
import { useSlideRepair } from '@/components/stage/use-slide-repair';

type SpeechCadence = 'idle' | 'active' | 'pause' | 'fallback';
const LIVE2D_PRESENTER_AVATAR_BY_ID = {
  haru: '/liv2d_poster/haru-avator.png',
  hiyori: '/liv2d_poster/hiyori-avator.png',
  mark: '/liv2d_poster/mark-avator.png',
  mao: '/liv2d_poster/mao-avator.png',
  rice: '/liv2d_poster/rice-avator.png',
} as const;

const SIDEBAR_VOICE_REPLY_PROVIDER_ORDER = [
  'qwen-tts',
  'azure-tts',
  'glm-tts',
  'openai-tts',
  'elevenlabs-tts',
] as const satisfies readonly TTSProviderId[];

const SIDEBAR_VOICE_REPLY_PREFERRED_VOICE: Partial<Record<TTSProviderId, string>> = {
  'qwen-tts': 'Stella',
  'azure-tts': 'zh-CN-XiaoyiNeural',
  'glm-tts': 'tongtong',
  'openai-tts': 'nova',
  'elevenlabs-tts': 'EXAVITQu4vr4xnSDxMaL',
};

function isSemanticScrollScene(scene: Scene | null): boolean {
  return Boolean(
    scene?.type === 'slide' &&
    scene.content.type === 'slide' &&
    scene.content.semanticDocument &&
    scene.content.semanticRenderMode !== 'manual' &&
    scene.content.webRenderMode !== 'slide',
  );
}

/**
 * Stage Component
 *
 * The main container for the classroom/course.
 * Combines sidebar (scene navigation) and content area (scene viewer).
 * Supports two modes: autonomous and playback.
 */
export function Stage({
  onRetryOutline,
  headerActions,
}: {
  onRetryOutline?: (outlineId: string) => Promise<void>;
  headerActions?: ReactNode;
}) {
  const { t, locale } = useI18n();
  const searchParams = useSearchParams();
  const {
    mode,
    getCurrentScene,
    scenes,
    currentSceneId,
    setCurrentSceneId,
    generatingOutlines,
    generationStatus,
  } = useStageStore();
  const stage = useStageStore((s) => s.stage);
  const stageLanguage = useStageStore((s) => s.stage?.language);
  const updateScene = useStageStore((s) => s.updateScene);
  const storageSaveState = useStageStore((s) => s.storageSaveState);
  const storageSaveScope = useStageStore((s) => s.storageSaveScope);
  const storageSavedAt = useStageStore((s) => s.storageSavedAt);
  const storageSaveError = useStageStore((s) => s.storageSaveError);
  const setOutlines = useStageStore((s) => s.setOutlines);
  const failedOutlines = useStageStore.use.failedOutlines();
  const outlines = useStageStore((s) => s.outlines);

  const currentScene = getCurrentScene();

  useEffect(() => {
    const firstScene = scenes.find((scene) => scene.order === 1);
    const titleSignals = `${stage?.name || ''} ${stage?.description || ''} ${firstScene?.title || ''}`;
    const firstSceneText =
      firstScene?.content.type === 'slide'
        ? firstScene.content.canvas.elements
            .filter((element) => element.type === 'text')
            .map((element) => element.content || '')
            .join(' ')
        : '';
    const positiveTitleSignals = titleSignals
      .replace(/不包含[:：][\s\S]*/g, ' ')
      .replace(/不包括[:：][\s\S]*/g, ' ')
      .replace(/\b(excluding|does not include|not included|do not include)\b[\s\S]*/gi, ' ');
    const hasWrongModularCover =
      /MODULAR ARITHMETIC/.test(firstSceneText) &&
      !/同余|模运算|模\s*\d+|模数|余数|congruence|modular|modulo|mod\s+\d+/i.test(
        positiveTitleSignals,
      );
    const hasWrongComputingCover =
      /COMPUTING/.test(firstSceneText) &&
      !/code|program|代码|程序|编程|python|javascript|typescript|数据结构/i.test(
        positiveTitleSignals,
      );
    const hasWrongGenericMathCover =
      /学习笔记|LEARNING NOTEBOOK/.test(firstSceneText) &&
      /mat|proof|证明|函数|映射|linear|algebra|calculus|math|同余|模运算|整除|线性|丢番图|素数|整数|数论|最大公约数|gcd|方程/.test(
        positiveTitleSignals,
      );

    if (
      !stage ||
      !firstScene ||
      firstScene.type !== 'slide' ||
      firstScene.content.type !== 'slide' ||
      (!hasWrongModularCover &&
        !hasWrongComputingCover &&
        !hasWrongGenericMathCover &&
        !shouldUpgradeLegacyTitleCoverContent({
          title: titleSignals,
          elements: firstScene.content.canvas.elements,
        }))
    ) {
      return;
    }

    const content = buildTitleCoverSlideContentFromParts({
      title: firstScene.title || stage.name,
      description: stage.description,
      language: (stage.language || stageLanguage) === 'en-US' ? 'en-US' : 'zh-CN',
    });

    updateScene(firstScene.id, {
      content: {
        ...firstScene.content,
        canvas: {
          ...firstScene.content.canvas,
          theme: content.theme || firstScene.content.canvas.theme,
          elements: content.elements,
          background: content.background,
          viewportSize: firstScene.content.canvas.viewportSize ?? 1000,
          viewportRatio: firstScene.content.canvas.viewportRatio ?? 0.5625,
        },
        syntaraMarkup: content.syntaraMarkup,
        semanticDocument: content.contentDocument,
        semanticRenderMode: undefined,
        semanticRenderVersion: undefined,
      },
      updatedAt: Date.now(),
    });
  }, [scenes, stage, stageLanguage, updateScene]);

  // Layout state from settings store (persisted via localStorage)
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useSettingsStore((s) => s.setSidebarCollapsed);
  const live2dPresenterVisible = useSettingsStore((s) => s.live2dPresenterVisible);
  const live2dPresenterModelId = useSettingsStore((s) => s.live2dPresenterModelId);

  // PlaybackEngine state
  const [engineMode, setEngineMode] = useState<EngineMode>('idle');
  const [playbackCompleted, setPlaybackCompleted] = useState(false); // Distinguishes "never played" idle from "finished" idle
  const [lectureSpeech, setLectureSpeech] = useState<string | null>(null); // From PlaybackEngine (lecture)
  const [lectureSpeechActive, setLectureSpeechActive] = useState(false);
  const [currentSpeechAction, setCurrentSpeechAction] = useState<SpeechAction | null>(null);
  const [currentMouthShape, setCurrentMouthShape] = useState<MouthShape | null>(null);
  const [speechCadence, setSpeechCadence] = useState<SpeechCadence>('idle');
  const [liveSpeech, setLiveSpeech] = useState<string | null>(null); // From buffer (discussion/QA)
  const [discussionTrigger, setDiscussionTrigger] = useState<TriggerEvent | null>(null);

  // Speaking agent tracking (Issue 2)
  const [speakingAgentId, setSpeakingAgentId] = useState<string | null>(null);

  // Thinking state (Issue 5)
  const [thinkingState, setThinkingState] = useState<{
    stage: string;
    agentId?: string;
  } | null>(null);

  // Cue user state (Issue 7)
  const [isCueUser, setIsCueUser] = useState(false);

  // Streaming state for stop button (Issue 1)
  const [chatIsStreaming, setChatIsStreaming] = useState(false);
  const [chatSessionType, setChatSessionType] = useState<string | null>(null);

  // Topic pending state: session is soft-paused, bubble stays visible, waiting for user input
  const [isTopicPending, setIsTopicPending] = useState(false);

  // Scene switch confirmation dialog state
  const [pendingSceneId, setPendingSceneId] = useState<string | null>(null);
  const requestedInitialClassroomView = searchParams.get('view');

  /** 主内容区：幻灯片画布 vs 原始 JSON */
  const [mainClassroomView, setMainClassroomView] = useState<MainClassroomView>(
    requestedInitialClassroomView === 'quiz' ||
      requestedInitialClassroomView === 'raw' ||
      requestedInitialClassroomView === 'ppt'
      ? requestedInitialClassroomView
      : 'ppt',
  );
  /** 原始数据下的子 Tab：按场景类型（slide / quiz / interactive / …） */
  const [rawDataSubTab, setRawDataSubTab] = useState<SceneType>('slide');
  /** 幻灯片原始数据细分：生成源 / 编译结果 / 渲染摘要 / 大纲 / 讲解动作 / UI衍生数据 */
  const [rawSlideDataView, setRawSlideDataView] = useState<RawSlideDataView>('source');
  /** 课堂内当前页编辑模式：页面布局 / 讲解稿 */
  const [slideEditorOpen, setSlideEditorOpen] = useState(false);
  const [slideEditTab, setSlideEditTab] = useState<SlideEditTab>('canvas');
  const [slideEditorSidebarTab, setSlideEditorSidebarTab] =
    useState<SlideEditorSidebarTab>('manual');
  const [editEntryConfirmOpen, setEditEntryConfirmOpen] = useState(false);
  const [speechAudioPreparing, setSpeechAudioPreparing] = useState(false);
  const [gridReflowPending, setGridReflowPending] = useState(false);
  const currentSlideSceneId = currentScene?.type === 'slide' ? currentScene.id : null;
  const {
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
  } = useSlideRepair({
    currentScene: currentScene ?? undefined,
    currentSlideSceneId,
    stage,
    stageLanguage,
    outlines,
    setOutlines,
    updateScene,
    slideEditorOpen,
    slideEditTab,
    setSlideEditorSidebarTab,
  });

  // Whiteboard state (from canvas store so AI tools can open it)
  const whiteboardOpen = useCanvasStore.use.whiteboardOpen();
  const setWhiteboardOpen = useCanvasStore.use.setWhiteboardOpen();

  // Selected agents from settings store (Zustand)
  const selectedAgentIds = useSettingsStore((s) => s.selectedAgentIds);

  useEffect(() => {
    const requestedView = searchParams.get('view');
    if (requestedView === 'quiz' || requestedView === 'raw' || requestedView === 'ppt') {
      setMainClassroomView(requestedView);
    }
  }, [searchParams]);

  // Pick a student agent for discussion trigger (prioritize student > non-teacher > fallback)
  const pickStudentAgent = useCallback((): string => {
    const registry = useAgentRegistry.getState();
    const agents = selectedAgentIds
      .map((id) => registry.getAgent(id))
      .filter((a): a is AgentConfig => a != null);
    const students = agents.filter((a) => a.role === 'student');
    if (students.length > 0) {
      return students[Math.floor(Math.random() * students.length)].id;
    }
    const nonTeachers = agents.filter((a) => a.role !== 'teacher');
    if (nonTeachers.length > 0) {
      return nonTeachers[Math.floor(Math.random() * nonTeachers.length)].id;
    }
    return agents[0]?.id || 'default-1';
  }, [selectedAgentIds]);

  const engineRef = useRef<PlaybackEngine | null>(null);
  const audioPlayerRef = useRef(createAudioPlayer());
  const chatAreaRef = useRef<ChatAreaRef>(null);
  const lectureSessionIdRef = useRef<string | null>(null);
  const lectureActionCounterRef = useRef(0);
  const discussionAbortRef = useRef<AbortController | null>(null);
  const sidebarAskAbortRef = useRef<AbortController | null>(null);
  const classroomQuestionLoopRef = useRef<(message: string) => void>(() => {});
  const sidebarAskVoiceReplyRef = useRef(false);
  const sidebarAnswerAudioRef = useRef<HTMLAudioElement | null>(null);
  const sidebarAnswerAudioUrlRef = useRef<string | null>(null);
  // Monotonic counter incremented on each scene switch — used to discard stale SSE callbacks
  const sceneEpochRef = useRef(0);
  // When true, the next engine init will auto-start playback (for auto-play scene advance)
  const autoStartRef = useRef(false);
  // Discussion buffer-level pause state (distinct from soft-pause which aborts SSE)
  const [isDiscussionPaused, setIsDiscussionPaused] = useState(false);
  const [sceneSidebarAskMessages, setSceneSidebarAskMessages] = useState<
    UIMessage<ChatMessageMetadata>[]
  >([]);

  const sceneSidebarAskThread = useMemo(
    () => buildSceneSidebarAskThreadFromMessages(sceneSidebarAskMessages, chatIsStreaming),
    [sceneSidebarAskMessages, chatIsStreaming],
  );

  const stopSidebarAnswerAudio = useCallback(() => {
    if (sidebarAnswerAudioRef.current) {
      sidebarAnswerAudioRef.current.pause();
      sidebarAnswerAudioRef.current = null;
    }
    if (sidebarAnswerAudioUrlRef.current) {
      URL.revokeObjectURL(sidebarAnswerAudioUrlRef.current);
      sidebarAnswerAudioUrlRef.current = null;
    }
    if (typeof window !== 'undefined') {
      window.speechSynthesis?.cancel();
    }
  }, []);

  useEffect(() => stopSidebarAnswerAudio, [stopSidebarAnswerAudio]);

  const appendInterruptedSidebarAskMessage = useCallback(() => {
    setSceneSidebarAskMessages((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role !== 'assistant') continue;
        const parts = [...next[i].parts];
        let appended = false;
        for (let j = parts.length - 1; j >= 0; j--) {
          if (parts[j].type !== 'text') continue;
          const textPart = parts[j] as { type: 'text'; text?: string };
          parts[j] = {
            ...textPart,
            text: `${textPart.text || ''}...`,
          } as UIMessage<ChatMessageMetadata>['parts'][number];
          appended = true;
          break;
        }
        if (!appended) {
          parts.push({
            type: 'text',
            text: '...',
          } as UIMessage<ChatMessageMetadata>['parts'][number]);
        }
        next[i] = { ...next[i], parts };
        return next;
      }
      return prev;
    });
  }, []);

  const abortSidebarAskLoop = useCallback(
    (markInterrupted: boolean) => {
      stopSidebarAnswerAudio();
      if (!sidebarAskAbortRef.current) return;
      sidebarAskAbortRef.current.abort();
      sidebarAskAbortRef.current = null;
      if (markInterrupted) {
        appendInterruptedSidebarAskMessage();
      }
    },
    [appendInterruptedSidebarAskMessage, stopSidebarAnswerAudio],
  );

  /**
   * Soft-pause: interrupt current agent stream but keep the session active.
   * Used when clicking the bubble pause button or opening input during QA/discussion.
   * Does NOT end the topic — user can continue speaking in the same session.
   * Preserves liveSpeech (with "..." appended) and speakingAgentId so the
   * roundtable bubble stays on the interrupted agent's text.
   */
  const doSoftPause = useCallback(async () => {
    await chatAreaRef.current?.softPauseActiveSession();
    abortSidebarAskLoop(true);
    // Append "..." to live speech to show interruption in roundtable bubble.
    // Only annotate when there's actual text being interrupted — during pure
    // director-thinking (prev is null, no agent assigned), leave liveSpeech
    // as-is so no spurious teacher bubble appears.
    setLiveSpeech((prev) => (prev !== null ? prev + '...' : null));
    // Keep speakingAgentId — bubble identity is preserved
    setThinkingState(null);
    setChatIsStreaming(false);
    setIsTopicPending(true);
    setIsDiscussionPaused(false);
    // Don't clear chatSessionType, speakingAgentId, or liveSpeech
    // Don't show end flash
    // Don't call handleEndDiscussion — engine stays in current state
  }, [abortSidebarAskLoop]);

  /** Reset all live/discussion state (shared by doSessionCleanup & onDiscussionEnd) */
  const resetLiveState = useCallback(() => {
    setLiveSpeech(null);
    setSpeakingAgentId(null);
    setThinkingState(null);
    setIsCueUser(false);
    setIsTopicPending(false);
    setChatIsStreaming(false);
    setChatSessionType(null);
    setIsDiscussionPaused(false);
  }, []);

  /** Full scene reset (scene switch) — resetLiveState + lecture/visual state */
  const resetSceneState = useCallback(() => {
    resetLiveState();
    setPlaybackCompleted(false);
    setLectureSpeech(null);
    setLectureSpeechActive(false);
    setCurrentSpeechAction(null);
    setCurrentMouthShape(null);
    setSpeechCadence('idle');
    setDiscussionTrigger(null);
  }, [resetLiveState]);

  /**
   * Unified session cleanup — called by both roundtable stop button and chat area end button.
   * Handles: engine transition, flash, roundtable state clearing.
   */
  const doSessionCleanup = useCallback(() => {
    engineRef.current?.handleEndDiscussion();
    resetLiveState();
  }, [resetLiveState]);

  // Shared stop-discussion handler (used by both Roundtable and Canvas toolbar)
  const handleStopDiscussion = useCallback(async () => {
    await chatAreaRef.current?.endActiveSession();
    abortSidebarAskLoop(true);
    doSessionCleanup();
  }, [abortSidebarAskLoop, doSessionCleanup]);

  // Initialize playback engine when scene changes
  useEffect(() => {
    // Bump epoch so any stale SSE callbacks from the previous scene are discarded
    sceneEpochRef.current++;

    // End any active QA/discussion session — this synchronously aborts the SSE
    // stream inside use-chat-sessions (abortControllerRef.abort()), preventing
    // stale onLiveSpeech callbacks from leaking into the new scene.
    chatAreaRef.current?.endActiveSession();
    abortSidebarAskLoop(false);

    // Also abort the engine-level discussion controller
    if (discussionAbortRef.current) {
      discussionAbortRef.current.abort();
      discussionAbortRef.current = null;
    }

    // Reset all roundtable/live state so scenes are fully isolated
    resetSceneState();

    if (!currentScene || !currentScene.actions || currentScene.actions.length === 0) {
      engineRef.current = null;
      setEngineMode('idle');

      return;
    }

    // Stop previous engine
    if (engineRef.current) {
      engineRef.current.stop();
    }

    // Create ActionEngine for playback (with audioPlayer for TTS)
    const actionEngine = new ActionEngine(useStageStore, audioPlayerRef.current);

    // Create new PlaybackEngine
    const engine = new PlaybackEngine([currentScene], actionEngine, audioPlayerRef.current, {
      onModeChange: (mode) => {
        setEngineMode(mode);
      },
      onSceneChange: (_sceneId) => {
        // Scene change handled by engine
      },
      onSpeechStart: (speech) => {
        setLectureSpeech(speech.text);
        setLectureSpeechActive(true);
        setCurrentSpeechAction(speech);
        setCurrentMouthShape(null);
        setSpeechCadence(speech.mouthCues?.length || speech.visemes?.length ? 'pause' : 'fallback');
        // Add to lecture session with incrementing index for dedup
        // Chat area pacing is handled by the StreamBuffer (onTextReveal)
        if (lectureSessionIdRef.current) {
          const idx = lectureActionCounterRef.current++;
          const speechId = `speech-${Date.now()}`;
          chatAreaRef.current?.addLectureMessage(
            lectureSessionIdRef.current,
            { id: speechId, type: 'speech', text: speech.text } as Action,
            idx,
          );
        }
      },
      onSpeechEnd: () => {
        // Don't clear lectureSpeech — let it persist until the next
        // onSpeechStart replaces it or the scene transitions.
        // Clearing here causes fallback to idleText (first sentence).
        setLectureSpeechActive(false);
        setCurrentSpeechAction(null);
        setCurrentMouthShape(null);
        setSpeechCadence('idle');
      },
      onEffectFire: (effect: Effect) => {
        // Add to lecture session with incrementing index
        if (
          lectureSessionIdRef.current &&
          (effect.kind === 'spotlight' || effect.kind === 'laser')
        ) {
          const idx = lectureActionCounterRef.current++;
          chatAreaRef.current?.addLectureMessage(
            lectureSessionIdRef.current,
            {
              id: `${effect.kind}-${Date.now()}`,
              type: effect.kind,
              elementId: effect.targetId,
            } as Action,
            idx,
          );
        }
      },
      onProactiveShow: (trigger) => {
        if (!trigger.agentId) {
          // Mutate in-place so engine.currentTrigger also gets the agentId
          // (confirmDiscussion reads agentId from the same object reference)
          trigger.agentId = pickStudentAgent();
        }
        setDiscussionTrigger(trigger);
      },
      onProactiveHide: () => {
        setDiscussionTrigger(null);
      },
      onDiscussionConfirmed: (topic, prompt, agentId) => {
        // Start SSE discussion via ChatArea
        handleDiscussionSSE(topic, prompt, agentId);
      },
      onDiscussionEnd: () => {
        // Abort any active SSE
        if (discussionAbortRef.current) {
          discussionAbortRef.current.abort();
          discussionAbortRef.current = null;
        }
        setDiscussionTrigger(null);
        // Clear roundtable state (idempotent — may already be cleared by doSessionCleanup)
        resetLiveState();
        // If all actions are exhausted (discussion was the last action), mark
        // playback as completed so the bubble shows reset instead of play.
        if (engineRef.current?.isExhausted()) {
          setPlaybackCompleted(true);
        }
      },
      onUserInterrupt: (text) => {
        // User interrupted → continue through the unified classroom Q&A session.
        classroomQuestionLoopRef.current(text);
      },
      isAgentSelected: (agentId) => {
        const ids = useSettingsStore.getState().selectedAgentIds;
        return ids.includes(agentId);
      },
      getPlaybackSpeed: () => useSettingsStore.getState().playbackSpeed || 1,
      onComplete: () => {
        // lectureSpeech intentionally NOT cleared — last sentence stays visible
        // until scene transition (auto-play) or user restarts. Scene change
        // effect handles the reset.
        setLectureSpeechActive(false);
        setCurrentSpeechAction(null);
        setCurrentMouthShape(null);
        setPlaybackCompleted(true);

        // End lecture session on playback complete
        if (lectureSessionIdRef.current) {
          chatAreaRef.current?.endSession(lectureSessionIdRef.current);
          lectureSessionIdRef.current = null;
        }
        // Auto-play: advance to next scene after a short pause
        const { autoPlayLecture } = useSettingsStore.getState();
        if (autoPlayLecture) {
          setTimeout(() => {
            const stageState = useStageStore.getState();
            if (!useSettingsStore.getState().autoPlayLecture) return;
            const allScenes = stageState.scenes;
            const curId = stageState.currentSceneId;
            const idx = allScenes.findIndex((s) => s.id === curId);
            if (idx >= 0 && idx < allScenes.length - 1) {
              const currentScene = allScenes[idx];
              if (
                currentScene.type === 'quiz' ||
                currentScene.type === 'interactive' ||
                currentScene.type === 'pbl'
              ) {
                return;
              }
              autoStartRef.current = true;
              stageState.setCurrentSceneId(allScenes[idx + 1].id);
            } else if (idx === allScenes.length - 1 && stageState.generatingOutlines.length > 0) {
              // Last scene exhausted but next is still generating — go to pending page
              const currentScene = allScenes[idx];
              if (
                currentScene.type === 'quiz' ||
                currentScene.type === 'interactive' ||
                currentScene.type === 'pbl'
              ) {
                return;
              }
              autoStartRef.current = true;
              stageState.setCurrentSceneId(PENDING_SCENE_ID);
            }
          }, 1500);
        }
      },
    });

    engineRef.current = engine;

    // Auto-start if triggered by auto-play scene advance
    if (autoStartRef.current) {
      autoStartRef.current = false;
      (async () => {
        if (currentScene && chatAreaRef.current) {
          const sessionId = await chatAreaRef.current.startLecture(currentScene.id);
          lectureSessionIdRef.current = sessionId;
          lectureActionCounterRef.current = 0;
        }
        engine.start();
      })();
    } else {
      // Load saved playback state and restore position (but never auto-play).
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only re-run when scene changes, functions are stable refs
  }, [abortSidebarAskLoop, currentScene, resetSceneState]);

  // Cleanup on unmount
  useEffect(() => {
    const audioPlayer = audioPlayerRef.current;
    return () => {
      if (engineRef.current) {
        engineRef.current.stop();
      }
      audioPlayer.destroy();
      if (discussionAbortRef.current) {
        discussionAbortRef.current.abort();
      }
      if (sidebarAskAbortRef.current) {
        sidebarAskAbortRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    const flushStageDraft = () => {
      void useStageStore.getState().saveToStorage();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushStageDraft();
      }
    };

    window.addEventListener('pagehide', flushStageDraft);
    window.addEventListener('beforeunload', flushStageDraft);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', flushStageDraft);
      window.removeEventListener('beforeunload', flushStageDraft);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Sync mute state from settings store to audioPlayer
  const ttsMuted = useSettingsStore((s) => s.ttsMuted);
  useEffect(() => {
    audioPlayerRef.current.setMuted(ttsMuted);
  }, [ttsMuted]);

  // Sync volume from settings store to audioPlayer
  const ttsVolume = useSettingsStore((s) => s.ttsVolume);
  useEffect(() => {
    if (!ttsMuted) {
      audioPlayerRef.current.setVolume(ttsVolume);
    }
  }, [ttsVolume, ttsMuted]);

  // Sync playback speed to audio player (for live-updating current audio)
  const playbackSpeed = useSettingsStore((s) => s.playbackSpeed);
  useEffect(() => {
    audioPlayerRef.current.setPlaybackRate(playbackSpeed);
  }, [playbackSpeed]);

  useEffect(() => {
    const mouthCues = currentSpeechAction?.mouthCues?.length
      ? currentSpeechAction.mouthCues
      : normalizeAzureVisemesToMouthCues(currentSpeechAction?.visemes);

    if (!lectureSpeechActive || !mouthCues?.length) {
      setCurrentMouthShape(null);
      setSpeechCadence(lectureSpeechActive ? 'fallback' : 'idle');
      return;
    }

    let frameId = 0;

    const tick = () => {
      const currentTimeMs = audioPlayerRef.current.getCurrentTime();
      const frame = resolveCurrentMouthCueFrame(mouthCues, currentTimeMs);
      setCurrentMouthShape((prev) => (prev === frame.mouthShape ? prev : frame.mouthShape));
      setSpeechCadence((prev) => (prev === frame.cadence ? prev : frame.cadence));
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [currentSpeechAction, lectureSpeechActive]);

  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled);
  const ttsProviderId = useSettingsStore((s) => s.ttsProviderId);
  const ttsVoice = useSettingsStore((s) => s.ttsVoice);
  const ttsSpeed = useSettingsStore((s) => s.ttsSpeed);

  /** Restore speech audioUrl from local TTS cache when scene has text but no URL (saves tokens on replay). */
  useEffect(() => {
    if (!currentScene || !ttsEnabled || ttsProviderId === 'browser-native-tts') return;
    let cancelled = false;
    void (async () => {
      const touched = await hydrateSpeechAudioFromTtsCache(currentScene, {
        providerId: ttsProviderId,
        voice: ttsVoice,
        speed: ttsSpeed,
      });
      if (!cancelled && touched) {
        updateScene(currentScene.id, {
          actions: [...(currentScene.actions ?? [])],
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentScene, ttsEnabled, ttsProviderId, ttsVoice, ttsSpeed, updateScene]);

  const speakSidebarAnswer = useCallback(
    async (text: string) => {
      const spokenText = verbalizeNarrationText(text).trim();
      if (!spokenText || typeof window === 'undefined') return;

      const settings = useSettingsStore.getState();
      if (!settings.ttsEnabled || settings.ttsMuted || settings.ttsVolume <= 0) return;

      stopSidebarAnswerAudio();

      const chooseProvider = (): TTSProviderId | null => {
        const configuredPreferred = SIDEBAR_VOICE_REPLY_PROVIDER_ORDER.find((providerId) => {
          const providerConfig = settings.ttsProvidersConfig?.[providerId];
          return Boolean(providerConfig?.isServerConfigured || providerConfig?.apiKey?.trim());
        });
        if (configuredPreferred) return configuredPreferred;
        if (settings.ttsProviderId !== 'browser-native-tts') {
          const providerConfig = settings.ttsProvidersConfig?.[settings.ttsProviderId];
          if (providerConfig?.isServerConfigured || providerConfig?.apiKey?.trim()) {
            return settings.ttsProviderId;
          }
        }
        return null;
      };

      const providerId = chooseProvider();
      if (!providerId) {
        toast.warning(
          '当前没有可用的服务端 TTS，先临时用浏览器朗读。建议在设置里启用 Qwen/Azure 等少女音色。',
        );
      }

      setLiveSpeech(spokenText);

      try {
        if (!providerId) {
          if (!window.speechSynthesis) return;
          const utterance = new SpeechSynthesisUtterance(spokenText);
          utterance.rate = settings.ttsSpeed ?? 1;
          utterance.volume = settings.ttsVolume ?? 1;
          utterance.lang = 'zh-CN';
          await new Promise<void>((resolve) => {
            utterance.onend = () => resolve();
            utterance.onerror = () => resolve();
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(utterance);
          });
          return;
        }

        const providerConfig = settings.ttsProvidersConfig?.[providerId];
        const voice =
          SIDEBAR_VOICE_REPLY_PREFERRED_VOICE[providerId] ||
          (providerId === settings.ttsProviderId && settings.ttsVoice !== 'default'
            ? settings.ttsVoice
            : 'default');
        const body: Record<string, unknown> = {
          text: spokenText,
          audioId: `sidebar-answer-${Date.now()}`,
          ttsProviderId: providerId,
          ttsVoice: voice,
          ttsSpeed: settings.ttsSpeed ?? 1,
        };
        if (providerConfig?.apiKey?.trim()) body.ttsApiKey = providerConfig.apiKey;
        if (providerConfig?.baseUrl?.trim()) body.ttsBaseUrl = providerConfig.baseUrl;

        const response = await fetch('/api/generate/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await response.json().catch(() => ({ error: response.statusText }));
        if (!response.ok || !data.base64) {
          throw new Error(data.error || 'TTS 生成失败');
        }

        const binary = atob(data.base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: `audio/${data.format || 'mp3'}` });
        const url = URL.createObjectURL(blob);
        sidebarAnswerAudioUrlRef.current = url;

        const audio = new Audio(url);
        audio.volume = settings.ttsVolume ?? 1;
        sidebarAnswerAudioRef.current = audio;
        await new Promise<void>((resolve, reject) => {
          audio.onended = () => resolve();
          audio.onerror = () => reject(new Error('语音播放失败'));
          void audio.play().catch(reject);
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '语音回复失败');
      } finally {
        stopSidebarAnswerAudio();
        setLiveSpeech(null);
      }
    },
    [stopSidebarAnswerAudio],
  );

  /**
   * Handle discussion SSE — POST /api/chat and push events to engine
   */
  const handleDiscussionSSE = useCallback(
    async (topic: string, prompt?: string, _agentId?: string) => {
      const seed = prompt?.trim() || topic.trim();
      if (!seed) return;
      setChatSessionType('discussion');
      classroomQuestionLoopRef.current(seed);
    },
    [],
  );

  const executeSidebarAskLoop = useCallback(
    async (
      initialMessages: UIMessage<ChatMessageMetadata>[],
      options?: { speakReply?: boolean },
    ) => {
      const modelConfig = getCurrentModelConfig();
      if (!modelConfig.isServerConfigured) {
        toast.error(t('settings.setupNeeded'), {
          description: '系统 OpenAI 模型尚未配置，请联系管理员。',
        });
        setSceneSidebarAskMessages((prev) => [
          ...prev,
          {
            id: `config-missing-${Date.now()}`,
            role: 'assistant',
            parts: [{ type: 'text', text: '当前模型未配置，暂时无法回答问题。' }],
            metadata: {
              senderName: '系统',
              originalRole: 'agent',
              createdAt: Date.now(),
            },
          },
        ]);
        return;
      }

      const controller = new AbortController();
      sidebarAskAbortRef.current = controller;
      setChatIsStreaming(true);
      setChatSessionType('qa');
      setThinkingState({ stage: 'director' });
      setIsDiscussionPaused(false);
      setIsCueUser(false);
      setIsTopicPending(false);

      const registry = useAgentRegistry.getState();
      const availableSelectedAgentIds = selectedAgentIds.filter((id) =>
        Boolean(registry.getAgent(id)),
      );
      const agentIds =
        availableSelectedAgentIds.length > 0 ? availableSelectedAgentIds : ['default-1'];
      const agentConfigs = agentIds
        .map((id) => registry.getAgent(id))
        .filter((agent): agent is AgentConfig => Boolean(agent))
        .filter((agent) => !agent.id.startsWith('default-'))
        .map((agent) => ({
          id: agent.id,
          name: agent.name,
          role: agent.role,
          persona: agent.persona,
          avatar: agent.avatar,
          color: agent.color,
          allowedActions: getActionsForRole(agent.role),
          priority: agent.priority,
          isGenerated: agent.isGenerated,
          boundStageId: agent.boundStageId,
        }));
      let finalAssistantText = '';
      let hasAssistantReply = false;

      try {
        await runCourseSideChatLoop({
          initialMessages,
          agentIds,
          agentConfigs: agentConfigs.length > 0 ? agentConfigs : undefined,
          getStoreState: () => {
            const state = useStageStore.getState();
            return {
              stage: state.stage,
              scenes: state.scenes,
              currentSceneId: state.currentSceneId,
              mode: state.mode,
              whiteboardOpen: useCanvasStore.getState().whiteboardOpen,
            };
          },
          apiKey: modelConfig.apiKey,
          baseUrl: modelConfig.baseUrl || undefined,
          model: modelConfig.modelString,
          signal: controller.signal,
          onMessages: (messages) => {
            setSceneSidebarAskMessages(messages);
            const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
            const textPart = lastAssistant?.parts.find((part) => part.type === 'text');
            const answerText = textPart && textPart.type === 'text' ? textPart.text || '' : '';
            finalAssistantText = answerText;
            setLiveSpeech(answerText || null);
            setSpeakingAgentId(lastAssistant?.metadata?.agentId || null);
            if (messages.some((m) => m.role === 'assistant')) {
              hasAssistantReply = true;
              setThinkingState(null);
            }
          },
        });
        if (!controller.signal.aborted && !hasAssistantReply) {
          setSceneSidebarAskMessages((prev) => [
            ...prev,
            {
              id: `empty-${Date.now()}`,
              role: 'assistant',
              parts: [{ type: 'text', text: '我暂时没有生成有效回复，请再试一次。' }],
              metadata: {
                senderName: '系统',
                originalRole: 'agent',
                createdAt: Date.now(),
              },
            },
          ]);
        }
        if (!controller.signal.aborted && options?.speakReply && finalAssistantText.trim()) {
          await speakSidebarAnswer(finalAssistantText);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        const errText = error instanceof Error ? error.message : String(error);
        setSceneSidebarAskMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: 'assistant',
            parts: [{ type: 'text', text: `发送失败：${errText}` }],
            metadata: {
              senderName: '系统',
              originalRole: 'agent',
              createdAt: Date.now(),
            },
          },
        ]);
      } finally {
        if (sidebarAskAbortRef.current === controller) {
          sidebarAskAbortRef.current = null;
          setChatIsStreaming(false);
          setThinkingState(null);
          setLiveSpeech(null);
          setSpeakingAgentId(null);
        }
      }
    },
    [selectedAgentIds, speakSidebarAnswer, t],
  );

  const runSidebarAskLoop = useCallback(
    async (message: string, options?: { inputMode?: 'text' | 'voice' }) => {
      const trimmed = message.trim();
      if (!trimmed) return;

      abortSidebarAskLoop(true);
      sidebarAskVoiceReplyRef.current = options?.inputMode === 'voice';

      const now = Date.now();
      const userMessage: UIMessage<ChatMessageMetadata> = {
        id: `user-${now}`,
        role: 'user',
        parts: [{ type: 'text', text: trimmed }],
        metadata: {
          senderName: t('common.you'),
          originalRole: 'user',
          createdAt: now,
        },
      };

      let nextMessages: UIMessage<ChatMessageMetadata>[] = [];
      setSceneSidebarAskMessages((prev) => {
        nextMessages = [...prev, userMessage];
        return nextMessages;
      });

      await executeSidebarAskLoop(nextMessages, {
        speakReply: sidebarAskVoiceReplyRef.current,
      });
    },
    [abortSidebarAskLoop, executeSidebarAskLoop, t],
  );

  useEffect(() => {
    classroomQuestionLoopRef.current = (message: string) => {
      void runSidebarAskLoop(message);
    };
  }, [runSidebarAskLoop]);

  const handleSidebarAskPause = useCallback(() => {
    if (!sidebarAskAbortRef.current) return;
    abortSidebarAskLoop(true);
    setIsDiscussionPaused(true);
    setIsTopicPending(true);
    setChatIsStreaming(false);
    setThinkingState(null);
  }, [abortSidebarAskLoop]);

  const handleSidebarAskResume = useCallback(async () => {
    if (sidebarAskAbortRef.current || sceneSidebarAskMessages.length === 0) return;
    setIsDiscussionPaused(false);
    await executeSidebarAskLoop(sceneSidebarAskMessages, {
      speakReply: sidebarAskVoiceReplyRef.current,
    });
  }, [executeSidebarAskLoop, sceneSidebarAskMessages]);

  /** 侧栏提问框聚焦：暂停讲解/回答，让用户在左侧栏接着追问。 */
  const handleSidebarInputActivate = useCallback(async () => {
    if (chatIsStreaming) {
      await doSoftPause();
    }

    const mode = engineRef.current?.getMode();
    if (engineRef.current && (mode === 'playing' || mode === 'live')) {
      engineRef.current.pause();
    }
  }, [chatIsStreaming, doSoftPause]);

  const handleSidebarQuestionSend = useCallback(
    (msg: string, options?: { inputMode?: 'text' | 'voice' }) => {
      const trimmed = msg.trim();
      if (!trimmed) return;
      if (isTopicPending) {
        setIsTopicPending(false);
        setLiveSpeech(null);
        setSpeakingAgentId(null);
      }
      void runSidebarAskLoop(trimmed, options);
      setIsCueUser(false);
      setIsDiscussionPaused(false);
    },
    [isTopicPending, runSidebarAskLoop],
  );

  // First speech text for idle display (extracted here for playbackView)
  const firstSpeechText = useMemo(
    () => currentScene?.actions?.find((a): a is SpeechAction => a.type === 'speech')?.text ?? null,
    [currentScene],
  );

  useEffect(() => {
    if (!lectureSpeechActive || !currentSpeechAction || !isSemanticScrollScene(currentScene)) {
      return;
    }

    const speechActions =
      currentScene?.actions?.filter((action): action is SpeechAction => action.type === 'speech') ??
      [];
    const speechIndex = speechActions.findIndex((action) => action.id === currentSpeechAction.id);
    if (speechIndex < 0) return;

    const frameId = window.requestAnimationFrame(() => {
      const root = window.document.querySelector<HTMLElement>('[data-semantic-scroll-root="true"]');
      const targets = root?.querySelectorAll<HTMLElement>('[data-semantic-scroll-target="true"]');
      if (!targets?.length) return;

      const maxSpeechIndex = Math.max(1, speechActions.length - 1);
      const maxTargetIndex = Math.max(0, targets.length - 1);
      const targetIndex = Math.min(
        maxTargetIndex,
        Math.round((speechIndex / maxSpeechIndex) * maxTargetIndex),
      );
      targets[targetIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [currentScene, currentSpeechAction, lectureSpeechActive]);

  // Whether the speaking agent is a student (for bubble role derivation)
  const speakingStudentFlag = useMemo(() => {
    if (!speakingAgentId) return false;
    const agent = useAgentRegistry.getState().getAgent(speakingAgentId);
    return agent?.role !== 'teacher';
  }, [speakingAgentId]);

  const sceneSidebarAskSpeakerName = useMemo(() => {
    const presenterNameKey = `settings.live2dPresenterOptions.${live2dPresenterModelId}.label`;
    const presenterNameRaw = t(presenterNameKey);
    const presenterName =
      presenterNameRaw && presenterNameRaw !== presenterNameKey ? presenterNameRaw : '导师';

    if (!speakingAgentId) {
      return chatSessionType === 'qa' ? presenterName : null;
    }
    const agent = useAgentRegistry.getState().getAgent(speakingAgentId);
    if (!agent) return chatSessionType === 'qa' ? presenterName : null;
    return agent.role === 'teacher' ? presenterName : agent.name;
  }, [chatSessionType, live2dPresenterModelId, speakingAgentId, t]);

  const sceneSidebarAskSpeakerMeta = useMemo(() => {
    const presenterAvatar =
      LIVE2D_PRESENTER_AVATAR_BY_ID[live2dPresenterModelId] ||
      LIVE2D_PRESENTER_MODELS[live2dPresenterModelId]?.previewSrc ||
      null;
    if (!speakingAgentId) {
      const teacher = selectedAgentIds
        .map((id) => useAgentRegistry.getState().getAgent(id))
        .find((agent) => agent?.role === 'teacher');
      return {
        avatar: presenterAvatar || teacher?.avatar || null,
        color: teacher?.color || '#38bdf8',
      };
    }
    const agent = useAgentRegistry.getState().getAgent(speakingAgentId);
    const avatar =
      agent?.role === 'teacher' ? presenterAvatar || agent?.avatar || null : agent?.avatar || null;
    return {
      avatar,
      color: agent?.color || '#38bdf8',
    };
  }, [live2dPresenterModelId, selectedAgentIds, speakingAgentId]);

  // Centralised derived playback view
  const playbackView = useMemo(
    () =>
      computePlaybackView({
        engineMode,
        lectureSpeech,
        liveSpeech,
        speakingAgentId,
        thinkingState,
        isCueUser,
        isTopicPending,
        chatIsStreaming,
        discussionTrigger,
        playbackCompleted,
        idleText: firstSpeechText,
        speakingStudent: speakingStudentFlag,
        sessionType: chatSessionType,
      }),
    [
      engineMode,
      lectureSpeech,
      liveSpeech,
      speakingAgentId,
      thinkingState,
      isCueUser,
      isTopicPending,
      chatIsStreaming,
      discussionTrigger,
      playbackCompleted,
      firstSpeechText,
      speakingStudentFlag,
      chatSessionType,
    ],
  );

  const isTopicActive = playbackView.isTopicActive;

  /**
   * Gated scene switch — if a topic is active, show AlertDialog before switching.
   * Returns true if the switch was immediate, false if gated (dialog shown).
   */
  const gatedSceneSwitch = useCallback(
    (targetSceneId: string): boolean => {
      if (targetSceneId === currentSceneId) return false;
      if (isTopicActive) {
        setPendingSceneId(targetSceneId);
        return false;
      }
      setCurrentSceneId(targetSceneId);
      return true;
    },
    [currentSceneId, isTopicActive, setCurrentSceneId],
  );

  /** User confirmed scene switch via AlertDialog */
  const confirmSceneSwitch = useCallback(() => {
    if (!pendingSceneId) return;
    chatAreaRef.current?.endActiveSession();
    doSessionCleanup();
    setCurrentSceneId(pendingSceneId);
    setPendingSceneId(null);
  }, [pendingSceneId, setCurrentSceneId, doSessionCleanup]);

  /** User cancelled scene switch via AlertDialog */
  const cancelSceneSwitch = useCallback(() => {
    setPendingSceneId(null);
  }, []);

  // play/pause toggle
  const handlePlayPause = async () => {
    const engine = engineRef.current;
    if (!engine || speechAudioPreparing) return;

    const mode = engine.getMode();
    if (mode === 'playing' || mode === 'live') {
      engine.pause();
      // Pause lecture buffer so text stops immediately
      if (lectureSessionIdRef.current) {
        chatAreaRef.current?.pauseBuffer(lectureSessionIdRef.current);
      }
    } else if (mode === 'paused') {
      engine.resume();
      // Resume lecture buffer
      if (lectureSessionIdRef.current) {
        chatAreaRef.current?.resumeBuffer(lectureSessionIdRef.current);
      }
    } else {
      const wasCompleted = playbackCompleted;
      const speechActions =
        currentScene?.actions?.filter(
          (action): action is SpeechAction => action.type === 'speech',
        ) || [];
      if (speechActions.length > 0) {
        const settings = useSettingsStore.getState();
        if (!settings.ttsEnabled) {
          toast.info(
            locale === 'zh-CN'
              ? '当前会静音播放：TTS 已关闭，所以不会等待转换，也不会播语音。'
              : 'Playback is currently silent: TTS is disabled, so there is no conversion or voice playback.',
          );
        } else if (settings.ttsMuted || settings.ttsVolume <= 0) {
          toast.info(
            locale === 'zh-CN'
              ? '当前会静音播放：已静音或音量为 0。'
              : 'Playback is currently silent because audio is muted or volume is 0.',
          );
        } else if (
          settings.ttsProviderId === 'browser-native-tts' &&
          speechActions.every((action) => !action.audioUrl)
        ) {
          toast.info(
            locale === 'zh-CN'
              ? '当前使用浏览器实时朗读，不需要等待语音转换完成。'
              : 'Browser-native speech is being used, so there is no separate TTS conversion step to wait for.',
          );
        } else if (
          settings.ttsProviderId !== 'browser-native-tts' &&
          speechActions.some((action) => !action.audioUrl)
        ) {
          const sceneForTts = useStageStore.getState().getCurrentScene();
          if (!sceneForTts) return;
          const missingCount = speechActions.filter((a) => !a.audioUrl).length;
          const loadingId = toast.loading(
            <SpeechGenerationIndicator
              label={locale === 'zh-CN' ? '语音生成中' : 'Generating speech'}
              done={0}
              total={missingCount}
              active={0}
              parallelism={Math.min(6, missingCount)}
              parallelLabel={locale === 'zh-CN' ? '并发' : 'active'}
            />,
          );
          setSpeechAudioPreparing(true);
          let ttsReady: Awaited<ReturnType<typeof ensureMissingSpeechAudioForScene>>;
          try {
            ttsReady = await ensureMissingSpeechAudioForScene(
              sceneForTts,
              undefined,
              ({ done, total, active, parallelism }) => {
                toast.loading(
                  <SpeechGenerationIndicator
                    label={locale === 'zh-CN' ? '语音生成中' : 'Generating speech'}
                    done={done}
                    total={total}
                    active={active}
                    parallelism={parallelism}
                    parallelLabel={locale === 'zh-CN' ? '并发' : 'active'}
                  />,
                  { id: loadingId },
                );
              },
            );
          } finally {
            setSpeechAudioPreparing(false);
            toast.dismiss(loadingId);
          }
          if (!ttsReady.ok) {
            toast.error(
              locale === 'zh-CN'
                ? `语音生成失败，无法播放：${ttsReady.error ?? ''}`
                : `Speech generation failed; playback was not started. ${ttsReady.error ?? ''}`,
            );
            return;
          }
          updateScene(sceneForTts.id, {
            actions: [...(sceneForTts.actions ?? [])],
          });
        }
      }
      setPlaybackCompleted(false);
      // Starting playback - create/reuse lecture session
      if (currentScene && chatAreaRef.current) {
        const sessionId = await chatAreaRef.current.startLecture(currentScene.id);
        lectureSessionIdRef.current = sessionId;
      }
      if (wasCompleted) {
        // Restart from beginning (user clicked restart after completion)
        lectureActionCounterRef.current = 0;
        engine.start();
      } else {
        // Continue from current position (e.g. after discussion end)
        engine.continuePlayback();
      }
    }
  };

  // previous scene (gated)
  const handlePreviousScene = () => {
    if (isPendingScene) {
      // From pending page → go to last real scene
      if (scenes.length > 0) {
        gatedSceneSwitch(scenes[scenes.length - 1].id);
      }
      return;
    }
    const currentIndex = scenes.findIndex((s) => s.id === currentSceneId);
    if (currentIndex > 0) {
      gatedSceneSwitch(scenes[currentIndex - 1].id);
    }
  };

  // next scene (gated)
  const handleNextScene = () => {
    if (isPendingScene) return; // Already on pending, nowhere to go
    const currentIndex = scenes.findIndex((s) => s.id === currentSceneId);
    if (currentIndex < scenes.length - 1) {
      gatedSceneSwitch(scenes[currentIndex + 1].id);
    } else if (hasNextPending) {
      // On last real scene → advance to pending page
      setCurrentSceneId(PENDING_SCENE_ID);
    }
  };

  // get scene information
  const isPendingScene = currentSceneId === PENDING_SCENE_ID;
  const hasNextPending = generatingOutlines.length > 0;
  const pendingSceneTitle =
    isPendingScene && generationStatus === 'generating' ? generatingOutlines[0]?.title || '' : '';
  const currentSceneIndex = isPendingScene
    ? scenes.length
    : scenes.findIndex((s) => s.id === currentSceneId);
  const totalScenesCount = scenes.length + (hasNextPending ? 1 : 0);

  // whiteboard toggle
  const handleWhiteboardToggle = () => {
    setWhiteboardOpen(!whiteboardOpen);
  };

  const canEditCurrentSlide =
    mainClassroomView === 'ppt' &&
    !isPendingScene &&
    currentScene?.type === 'slide' &&
    currentScene.content.type === 'slide';
  const hasActivePlaybackOrLiveSession =
    engineMode !== 'idle' || chatIsStreaming || isTopicPending || !!discussionTrigger;

  const slideSceneIds = useMemo(
    () =>
      scenes
        .filter((scene) => scene.type === 'slide' && scene.content.type === 'slide')
        .map((scene) => scene.id),
    [scenes],
  );
  const currentEditableSlideIndex = currentSceneId ? slideSceneIds.indexOf(currentSceneId) : -1;
  const canGoPrevEditableSlide = currentEditableSlideIndex > 0;
  const canGoNextEditableSlide =
    currentEditableSlideIndex >= 0 && currentEditableSlideIndex < slideSceneIds.length - 1;

  const handlePrevEditableSlide = useCallback(() => {
    if (!canGoPrevEditableSlide) return;
    gatedSceneSwitch(slideSceneIds[currentEditableSlideIndex - 1]);
  }, [canGoPrevEditableSlide, currentEditableSlideIndex, gatedSceneSwitch, slideSceneIds]);

  const handleNextEditableSlide = useCallback(() => {
    if (!canGoNextEditableSlide) return;
    gatedSceneSwitch(slideSceneIds[currentEditableSlideIndex + 1]);
  }, [canGoNextEditableSlide, currentEditableSlideIndex, gatedSceneSwitch, slideSceneIds]);

  const forceEnterSlideEditor = useCallback(async () => {
    if (!canEditCurrentSlide) return;
    await chatAreaRef.current?.endActiveSession();
    if (discussionAbortRef.current) {
      discussionAbortRef.current.abort();
      discussionAbortRef.current = null;
    }
    engineRef.current?.stop();
    resetSceneState();
    setWhiteboardOpen(false);
    setMainClassroomView('ppt');
    setSlideEditorOpen(true);
    setSlideEditTab('canvas');
    setEditEntryConfirmOpen(false);
  }, [canEditCurrentSlide, resetSceneState, setWhiteboardOpen]);

  const handleOpenSlideEditor = useCallback(() => {
    if (!canEditCurrentSlide) return;
    if (hasActivePlaybackOrLiveSession) {
      setEditEntryConfirmOpen(true);
      return;
    }
    void forceEnterSlideEditor();
  }, [canEditCurrentSlide, forceEnterSlideEditor, hasActivePlaybackOrLiveSession]);

  const handleCloseSlideEditor = useCallback(() => {
    setSlideEditorOpen(false);
    setSlideEditTab('canvas');
    setSlideEditorSidebarTab('manual');
    setWhiteboardOpen(false);
  }, [setWhiteboardOpen]);

  // Map engine mode to the CanvasArea's expected engine state
  const canvasEngineState = (() => {
    switch (engineMode) {
      case 'playing':
      case 'live':
        return 'playing';
      case 'paused':
        return 'paused';
      default:
        return 'idle';
    }
  })();

  const playbackToolbarLiveSession = chatIsStreaming || isTopicPending || engineMode === 'live';

  useEffect(() => {
    if (!slideEditorOpen) return;
    if (
      mainClassroomView !== 'ppt' ||
      isPendingScene ||
      !currentScene ||
      currentScene.type !== 'slide' ||
      currentScene.content.type !== 'slide'
    ) {
      setSlideEditorOpen(false);
      setSlideEditTab('canvas');
    }
  }, [slideEditorOpen, mainClassroomView, isPendingScene, currentScene]);

  /** 侧栏 Live2D 标签应持续可见；问答中也保留入口，仅在白板/待生成页隐藏。 */
  const live2dSidebarEligible = live2dPresenterVisible && !isPendingScene && !whiteboardOpen;

  const sceneSidebarLive2d = live2dSidebarEligible
    ? mode === 'playback' && currentScene?.type === 'slide'
      ? {
          speaking: lectureSpeechActive && engineMode === 'playing',
          speechText: lectureSpeech,
          playbackRate: playbackSpeed,
          currentMouthShape,
          cadence: speechCadence,
        }
      : { speaking: false, cadence: 'idle' as const }
    : undefined;

  const showPlaybackStopDiscussion =
    engineMode === 'live' || chatSessionType === 'qa' || chatSessionType === 'discussion';

  const mergedOutlines = useMemo(() => {
    const byId = new Map<string, SceneOutline>();
    for (const o of outlines) byId.set(o.id, o);
    for (const o of generatingOutlines) byId.set(o.id, o);
    return Array.from(byId.values()).sort((a, b) => a.order - b.order);
  }, [outlines, generatingOutlines]);

  /** 子 Tab 顺序：固定 slide / quiz / interactive，再按字母序追加大纲或场景中出现的其它类型（如 pbl） */
  const rawDataTabTypes = useMemo(
    () => getRawDataTabTypes(mergedOutlines, scenes),
    [mergedOutlines, scenes],
  );

  const rawCurrentScene = useMemo(
    () => getRawCurrentScene(currentScene, rawDataSubTab),
    [currentScene, rawDataSubTab],
  );

  const rawCurrentOutline = useMemo(
    () => getRawCurrentOutline(mergedOutlines, rawCurrentScene, rawDataSubTab),
    [mergedOutlines, rawCurrentScene, rawDataSubTab],
  );

  const canReflowCurrentGridScene = useMemo(
    () => canReflowGridScene(rawCurrentScene),
    [rawCurrentScene],
  );

  const canReflowCurrentLayoutCardsScene = useMemo(
    () => canReflowLayoutCardsScene(rawCurrentScene),
    [rawCurrentScene],
  );

  const handleReflowCurrentGridScene = useCallback(() => {
    if (!rawCurrentScene) return;
    const reRendered = renderReflowedGridScene(rawCurrentScene);
    if (!reRendered) {
      toast.info('当前页不是 Grid 布局，无需重排。');
      return;
    }
    try {
      setGridReflowPending(true);
      updateScene(rawCurrentScene.id, {
        content: reRendered,
        updatedAt: Date.now(),
      });
      toast.success('已按 Grid 规则重排当前页。');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Grid 重排失败：${message}`);
    } finally {
      setGridReflowPending(false);
    }
  }, [rawCurrentScene, updateScene]);

  const handleReflowCurrentLayoutCardsScene = useCallback(() => {
    if (!rawCurrentScene) return;
    const reRendered = renderReflowedLayoutCardsScene(rawCurrentScene);
    if (!reRendered) {
      toast.info('当前页没有 Layout Cards 块，无需重排。');
      return;
    }
    try {
      setGridReflowPending(true);
      updateScene(rawCurrentScene.id, {
        content: reRendered,
        updatedAt: Date.now(),
      });
      toast.success('已按 Layout Cards 规则重排当前页。');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Layout Cards 重排失败：${message}`);
    } finally {
      setGridReflowPending(false);
    }
  }, [rawCurrentScene, updateScene]);

  const rawTypePayloadJson = useMemo(
    () =>
      buildRawTypePayloadJson({
        currentSceneId,
        rawDataSubTab,
        rawSlideDataView,
        rawCurrentOutline,
        rawCurrentScene,
      }),
    [currentSceneId, rawDataSubTab, rawSlideDataView, rawCurrentOutline, rawCurrentScene],
  );

  useEffect(() => {
    if (!rawDataTabTypes.includes(rawDataSubTab)) {
      setRawDataSubTab(rawDataTabTypes[0] ?? 'slide');
    }
  }, [rawDataTabTypes, rawDataSubTab]);

  const viewToggle = (
    <StageViewToggle
      slideEditorOpen={slideEditorOpen}
      slideEditTab={slideEditTab}
      onSlideEditTabChange={setSlideEditTab}
      mainClassroomView={mainClassroomView}
      onMainClassroomViewChange={setMainClassroomView}
      currentSceneType={currentScene?.type}
      onRawDataSubTabChange={setRawDataSubTab}
      labels={{
        ppt: t('stage.viewPpt'),
        quiz: t('stage.viewQuiz'),
        raw: t('stage.viewRawData'),
      }}
    />
  );

  const semanticManualEditorOpen =
    slideEditorOpen &&
    slideEditTab === 'canvas' &&
    slideEditorSidebarTab === 'manual' &&
    currentScene?.type === 'slide' &&
    currentScene.content.type === 'slide' &&
    Boolean(currentScene.content.semanticDocument);

  const editorStatusSlot = slideEditorOpen ? (
    <EditorStatusChip
      storageSaveState={storageSaveState}
      storageSaveScope={storageSaveScope}
      storageSavedAt={storageSavedAt}
      storageSaveError={storageSaveError}
      slideEditTab={slideEditTab}
      semanticEditorOpen={semanticManualEditorOpen}
    />
  ) : undefined;

  const canRepairCurrentSlide =
    !isPendingScene && currentScene?.type === 'slide' && currentScene.content.type === 'slide';
  const canRerenderCurrentSlide =
    currentScene?.type === 'slide' &&
    currentScene.content.type === 'slide' &&
    Boolean(currentScene.content.semanticDocument);
  const canRestoreCurrentSlide =
    currentScene?.type === 'slide' &&
    currentScene.content.type === 'slide' &&
    Boolean(currentScene.repairSnapshot);
  const handleRerenderCurrentSlide = useCallback(() => {
    if (!currentScene || currentScene.type !== 'slide' || currentScene.content.type !== 'slide') {
      return;
    }
    const semanticDocument = currentScene.content.semanticDocument;
    if (!semanticDocument) {
      toast.info('当前页没有语义文档，无法重新渲染。');
      return;
    }
    try {
      setGridReflowPending(true);
      const reRendered = renderSemanticSlideContent({
        document: semanticDocument,
        fallbackTitle: semanticDocument.title || currentScene.title,
        preserveCanvasId: currentScene.content.canvas.id,
      });
      updateScene(currentScene.id, {
        content: reRendered,
        updatedAt: Date.now(),
      });
      toast.success('已根据生成数据重新渲染当前页。');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`重新渲染失败：${message}`);
    } finally {
      setGridReflowPending(false);
    }
  }, [currentScene, updateScene]);
  const handleSaveSemanticSlideMarkup = useCallback(
    (markup: string, document: NotebookContentDocument) => {
      if (!currentScene || currentScene.type !== 'slide' || currentScene.content.type !== 'slide') {
        return;
      }
      const normalizedMarkup = normalizeSyntaraMarkupLayout(markup);
      const title = document.title || currentScene.title;
      const rendered = renderSemanticSlideContent({
        document,
        fallbackTitle: title,
        preserveCanvasId: currentScene.content.canvas.id,
        syntaraMarkup: normalizedMarkup,
        renderMode: currentScene.content.semanticRenderMode ?? 'auto',
      });

      updateScene(currentScene.id, {
        title,
        content: rendered,
        updatedAt: Date.now(),
      });
      toast.success('已通过 Syntara Markup 重新编译并渲染当前页。');
    },
    [currentScene, updateScene],
  );
  const openRepairSidebar = useCallback(() => {
    if (!canRepairCurrentSlide) return;

    if (slideEditorOpen) {
      setSlideEditTab('canvas');
      focusRepairSidebar();
      return;
    }

    requestRepairSidebarFocus();
    handleOpenSlideEditor();
  }, [
    canRepairCurrentSlide,
    focusRepairSidebar,
    handleOpenSlideEditor,
    requestRepairSidebarFocus,
    slideEditorOpen,
  ]);

  const handleManualEditToggle = useCallback(() => {
    if (!slideEditorOpen) {
      setSlideEditorSidebarTab('manual');
      handleOpenSlideEditor();
      return;
    }
    if (slideEditorSidebarTab === 'manual') {
      handleCloseSlideEditor();
    } else {
      setSlideEditorSidebarTab('manual');
    }
  }, [handleCloseSlideEditor, handleOpenSlideEditor, slideEditorOpen, slideEditorSidebarTab]);

  const titleActions = (
    <StageTitleActions
      headerActions={headerActions}
      canEditCurrentSlide={canEditCurrentSlide}
      canRepairCurrentSlide={canRepairCurrentSlide}
      canRestoreCurrentSlide={canRestoreCurrentSlide}
      canRerenderCurrentSlide={canRerenderCurrentSlide}
      gridReflowPending={gridReflowPending}
      slideEditorOpen={slideEditorOpen}
      slideEditorSidebarTab={slideEditorSidebarTab}
      onRerender={handleRerenderCurrentSlide}
      onRestore={handleRestorePreRepairSlide}
      onOpenRepairSidebar={openRepairSidebar}
      onManualEditToggle={handleManualEditToggle}
    />
  );

  const footerCenterSlot = slideEditorOpen ? (
    editorStatusSlot
  ) : mode === 'playback' && mainClassroomView === 'ppt' ? (
    <CanvasPlaybackPill
      currentSceneIndex={currentSceneIndex}
      scenesCount={totalScenesCount}
      engineState={canvasEngineState}
      isLiveSession={playbackToolbarLiveSession}
      whiteboardOpen={whiteboardOpen}
      onPrevSlide={handlePreviousScene}
      onNextSlide={handleNextScene}
      onPlayPause={handlePlayPause}
      onWhiteboardClose={handleWhiteboardToggle}
      showStopDiscussion={showPlaybackStopDiscussion}
      onStopDiscussion={handleStopDiscussion}
      playPauseDisabled={speechAudioPreparing}
      playPauseBusy={speechAudioPreparing}
    />
  ) : undefined;

  return (
    <div className="apple-mesh-bg flex-1 flex min-h-0 overflow-hidden">
      {/* Main Content Area — scene list lives inside CanvasArea, left of the slide */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
        {/* Header */}
        <Header
          currentSceneTitle={currentScene?.title || pendingSceneTitle || stage?.name || ''}
          titleActions={titleActions}
        />

        {/* Canvas Area — PPT 视图 / 原始数据 */}
        <div className="overflow-hidden relative flex-1 min-h-0 isolate" suppressHydrationWarning>
          {mainClassroomView === 'raw' ? (
            <RawDataPanel
              rawDataTabTypes={rawDataTabTypes}
              rawDataSubTab={rawDataSubTab}
              onRawDataSubTabChange={setRawDataSubTab}
              rawSlideDataView={rawSlideDataView}
              onRawSlideDataViewChange={setRawSlideDataView}
              rawDataCaption={t('stage.rawDataCaption')}
              sceneTypeLabel={(tabType) => sceneTypeTabLabel(t, tabType)}
              canReflowCurrentGridScene={canReflowCurrentGridScene}
              canReflowCurrentLayoutCardsScene={canReflowCurrentLayoutCardsScene}
              gridReflowPending={gridReflowPending}
              onReflowCurrentGridScene={handleReflowCurrentGridScene}
              onReflowCurrentLayoutCardsScene={handleReflowCurrentLayoutCardsScene}
              rawTypePayloadJson={rawTypePayloadJson}
            />
          ) : mainClassroomView === 'quiz' ? (
            <ProblemBankView notebookId={stage?.id || ''} />
          ) : slideEditorOpen && slideEditTab === 'narration' && currentScene?.type === 'slide' ? (
            <SlideNarrationEditor
              scene={currentScene}
              sceneIndex={currentSceneIndex}
              totalScenes={totalScenesCount}
              language={stageLanguage}
              canGoPrev={canGoPrevEditableSlide}
              canGoNext={canGoNextEditableSlide}
              onGoPrev={handlePrevEditableSlide}
              onGoNext={handleNextEditableSlide}
              onSaveActions={saveCurrentSceneActions}
            />
          ) : slideEditorOpen && slideEditTab === 'canvas' && currentScene?.type === 'slide' ? (
            currentScene.content.type === 'slide' &&
            currentScene.content.semanticDocument &&
            slideEditorSidebarTab === 'manual' ? (
              <ClassroomSemanticSlideEditor
                key={currentScene.id}
                currentScene={currentScene}
                onSaveMarkup={handleSaveSemanticSlideMarkup}
                onClose={handleCloseSlideEditor}
              />
            ) : (
              <ClassroomSlideCanvasEditor
                currentScene={currentScene}
                currentSceneIndex={currentSceneIndex}
                sidebarPanel={slideEditorSidebarTab}
                repairDraft={repairInstructions}
                onRepairDraftChange={setCurrentSlideRepairDraft}
                repairConversation={repairConversation}
                onSendRepairMessage={() => void handleRepairCurrentSlide()}
                repairPending={slideRepairPending}
                repairInputFocusNonce={repairSidebarFocusNonce}
                onCloseInspector={handleCloseSlideEditor}
              />
            )
          ) : (
            <CanvasArea
              currentScene={currentScene}
              currentSceneIndex={currentSceneIndex}
              scenesCount={totalScenesCount}
              mode={slideEditorOpen ? 'autonomous' : mode}
              engineState={canvasEngineState}
              isLiveSession={playbackToolbarLiveSession || !!chatSessionType}
              whiteboardOpen={whiteboardOpen}
              sidebarCollapsed={sidebarCollapsed}
              onSidebarCollapseChange={setSidebarCollapsed}
              onSceneSelect={gatedSceneSwitch}
              onRetryOutline={onRetryOutline}
              onSidebarAskActivate={handleSidebarInputActivate}
              onSidebarAskSubmit={handleSidebarQuestionSend}
              sceneSidebarAskThread={sceneSidebarAskThread}
              sceneSidebarAskLiveSpeech={liveSpeech}
              sceneSidebarAskThinking={thinkingState?.stage === 'director'}
              sceneSidebarAskStreaming={chatIsStreaming}
              sceneSidebarAskSpeakerName={sceneSidebarAskSpeakerName}
              sceneSidebarAskSpeakerAvatar={sceneSidebarAskSpeakerMeta.avatar}
              sceneSidebarAskSpeakerColor={sceneSidebarAskSpeakerMeta.color}
              sceneSidebarAskPaused={isDiscussionPaused}
              onSidebarAskPause={handleSidebarAskPause}
              onSidebarAskResume={() => void handleSidebarAskResume()}
              chatCollapsed={true}
              onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
              onPrevSlide={handlePreviousScene}
              onNextSlide={handleNextScene}
              onPlayPause={handlePlayPause}
              playPauseDisabled={speechAudioPreparing}
              playPauseBusy={speechAudioPreparing}
              onWhiteboardClose={handleWhiteboardToggle}
              showStopDiscussion={
                engineMode === 'live' ||
                (chatIsStreaming && (chatSessionType === 'qa' || chatSessionType === 'discussion'))
              }
              onStopDiscussion={handleStopDiscussion}
              hideToolbar={mode === 'playback' || slideEditorOpen}
              isPendingScene={isPendingScene}
              sceneSidebarLive2d={sceneSidebarLive2d}
              isGenerationFailed={
                isPendingScene && failedOutlines.some((f) => f.id === generatingOutlines[0]?.id)
              }
              onRetryGeneration={
                onRetryOutline && generatingOutlines[0]
                  ? () => onRetryOutline(generatingOutlines[0].id)
                  : undefined
              }
            />
          )}
        </div>

        <ClassroomFooter
          leadingSlot={viewToggle}
          centerSlot={footerCenterSlot}
          trailingSlot={<ClassroomFooterVoiceChip />}
        />
      </div>

      <StageConfirmationDialogs
        pendingSceneId={pendingSceneId}
        onCancelSceneSwitch={cancelSceneSwitch}
        onConfirmSceneSwitch={confirmSceneSwitch}
        editEntryConfirmOpen={editEntryConfirmOpen}
        onEditEntryConfirmOpenChange={setEditEntryConfirmOpen}
        onForceEnterSlideEditor={() => void forceEnterSlideEditor()}
        labels={{
          confirmSwitchTitle: t('stage.confirmSwitchTitle'),
          confirmSwitchMessage: t('stage.confirmSwitchMessage'),
          cancel: t('common.cancel'),
          confirm: t('common.confirm'),
        }}
      />
    </div>
  );
}
