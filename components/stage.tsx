'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useStageStore } from '@/lib/store';
import { PENDING_SCENE_ID } from '@/lib/store/stage';
import { useCanvasStore } from '@/lib/store/canvas';
import { useSettingsStore } from '@/lib/store/settings';
import { useI18n } from '@/lib/hooks/use-i18n';
import { Header } from './header';
import { QuizCourseQuestionHub } from '@/components/scene-renderers/quiz-course-question-hub';
import { CanvasPlaybackPill } from '@/components/canvas/canvas-playback-pill';
import { CanvasArea } from '@/components/canvas/canvas-area';
import { Roundtable } from '@/components/roundtable';
import { PlaybackEngine, computePlaybackView } from '@/lib/playback';
import type { EngineMode, TriggerEvent, Effect } from '@/lib/playback';
import { ActionEngine } from '@/lib/action/engine';
import { createAudioPlayer } from '@/lib/utils/audio-player';
import type { Action, DiscussionAction, SpeechAction } from '@/lib/types/action';
import type { Scene, SceneType } from '@/lib/types/stage';
import type { SceneOutline } from '@/lib/types/generation';
// Playback state persistence removed — refresh always starts from the beginning
import { ChatArea, type ChatAreaRef } from '@/components/chat/chat-area';
import { agentsToParticipants, useAgentRegistry } from '@/lib/orchestration/registry/store';
import type { AgentConfig } from '@/lib/orchestration/registry/types';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { AlertTriangle } from 'lucide-react';
import { VisuallyHidden } from 'radix-ui';
import { cn } from '@/lib/utils';

/** Bottom Roundtable strip in playback classroom — off until we ship the layout again. */
const SHOW_CLASSROOM_ROUNDTABLE = false;

const RAW_DATA_BASE_TYPES: SceneType[] = ['slide', 'quiz', 'interactive'];

function sceneTypeTabLabel(tr: (key: string) => string, type: SceneType): string {
  const key = `stage.sceneType.${type}`;
  const label = tr(key);
  return label === key ? type : label;
}

/** 原始数据里折叠 slide 画布，避免 JSON 过大 */
function serializeSceneForRawView(scene: Scene): unknown {
  if (scene.content.type === 'slide') {
    const canvas = scene.content.canvas;
    const elements = canvas.elements ?? [];
    const elementTypeCounts: Record<string, number> = {};
    for (const el of elements) {
      const k = el.type;
      elementTypeCounts[k] = (elementTypeCounts[k] || 0) + 1;
    }
    return {
      id: scene.id,
      stageId: scene.stageId,
      type: scene.type,
      title: scene.title,
      order: scene.order,
      actions: scene.actions,
      whiteboards: scene.whiteboards,
      multiAgent: scene.multiAgent,
      createdAt: scene.createdAt,
      updatedAt: scene.updatedAt,
      content: {
        type: 'slide' as const,
        canvas: {
          _collapsed: true,
          _note:
            'Canvas omitted for size; summary below. Full slide data remains in classroom storage.',
          id: canvas.id,
          viewportSize: canvas.viewportSize,
          viewportRatio: canvas.viewportRatio,
          elementCount: elements.length,
          elementTypeCounts,
        },
      },
    };
  }
  return scene;
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
}: {
  onRetryOutline?: (outlineId: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const { mode, getCurrentScene, scenes, currentSceneId, setCurrentSceneId, generatingOutlines } =
    useStageStore();
  const failedOutlines = useStageStore.use.failedOutlines();
  const outlines = useStageStore((s) => s.outlines);

  const currentScene = getCurrentScene();

  // Layout state from settings store (persisted via localStorage)
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useSettingsStore((s) => s.setSidebarCollapsed);
  const chatAreaWidth = useSettingsStore((s) => s.chatAreaWidth);
  const setChatAreaWidth = useSettingsStore((s) => s.setChatAreaWidth);
  const chatAreaCollapsed = useSettingsStore((s) => s.chatAreaCollapsed);
  const setChatAreaCollapsed = useSettingsStore((s) => s.setChatAreaCollapsed);

  // PlaybackEngine state
  const [engineMode, setEngineMode] = useState<EngineMode>('idle');
  const [playbackCompleted, setPlaybackCompleted] = useState(false); // Distinguishes "never played" idle from "finished" idle
  const [lectureSpeech, setLectureSpeech] = useState<string | null>(null); // From PlaybackEngine (lecture)
  const [liveSpeech, setLiveSpeech] = useState<string | null>(null); // From buffer (discussion/QA)
  const [speechProgress, setSpeechProgress] = useState<number | null>(null); // StreamBuffer reveal progress (0–1)
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

  // End flash state (Issue 3)
  const [showEndFlash, setShowEndFlash] = useState(false);
  const [endFlashSessionType, setEndFlashSessionType] = useState<'qa' | 'discussion'>('discussion');

  // Streaming state for stop button (Issue 1)
  const [chatIsStreaming, setChatIsStreaming] = useState(false);
  const [chatSessionType, setChatSessionType] = useState<string | null>(null);

  // Topic pending state: session is soft-paused, bubble stays visible, waiting for user input
  const [isTopicPending, setIsTopicPending] = useState(false);

  // Active bubble ID for playback highlight in chat area (Issue 8)
  const [activeBubbleId, setActiveBubbleId] = useState<string | null>(null);

  // Scene switch confirmation dialog state
  const [pendingSceneId, setPendingSceneId] = useState<string | null>(null);

  /** 主内容区：幻灯片画布 vs 原始 JSON */
  const [mainClassroomView, setMainClassroomView] = useState<'ppt' | 'quiz' | 'raw'>('ppt');
  /** 原始数据下的子 Tab：按场景类型（slide / quiz / interactive / …） */
  const [rawDataSubTab, setRawDataSubTab] = useState<SceneType>('slide');

  // Whiteboard state (from canvas store so AI tools can open it)
  const whiteboardOpen = useCanvasStore.use.whiteboardOpen();
  const setWhiteboardOpen = useCanvasStore.use.setWhiteboardOpen();

  // Selected agents from settings store (Zustand)
  const selectedAgentIds = useSettingsStore((s) => s.selectedAgentIds);

  // Generate participants from selected agents
  const participants = useMemo(
    () => agentsToParticipants(selectedAgentIds, t),
    [selectedAgentIds, t],
  );

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
  // Guard to prevent double flash when manual stop triggers onDiscussionEnd
  const manualStopRef = useRef(false);
  // Monotonic counter incremented on each scene switch — used to discard stale SSE callbacks
  const sceneEpochRef = useRef(0);
  // When true, the next engine init will auto-start playback (for auto-play scene advance)
  const autoStartRef = useRef(false);
  // Discussion buffer-level pause state (distinct from soft-pause which aborts SSE)
  const [isDiscussionPaused, setIsDiscussionPaused] = useState(false);

  /**
   * Soft-pause: interrupt current agent stream but keep the session active.
   * Used when clicking the bubble pause button or opening input during QA/discussion.
   * Does NOT end the topic — user can continue speaking in the same session.
   * Preserves liveSpeech (with "..." appended) and speakingAgentId so the
   * roundtable bubble stays on the interrupted agent's text.
   */
  const doSoftPause = useCallback(async () => {
    await chatAreaRef.current?.softPauseActiveSession();
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
  }, []);

  /**
   * Resume a soft-paused topic: re-call /chat with existing session messages.
   * The director picks the next agent to continue.
   */
  const doResumeTopic = useCallback(async () => {
    // Clear old bubble immediately — no lingering on interrupted text
    setIsTopicPending(false);
    setLiveSpeech(null);
    setSpeakingAgentId(null);
    setThinkingState({ stage: 'director' });
    setChatIsStreaming(true);
    // Fire new chat round — SSE events will drive thinking → agent_start → speech
    await chatAreaRef.current?.resumeActiveSession();
  }, []);

  /** Reset all live/discussion state (shared by doSessionCleanup & onDiscussionEnd) */
  const resetLiveState = useCallback(() => {
    setLiveSpeech(null);
    setSpeakingAgentId(null);
    setSpeechProgress(null);
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
    setSpeechProgress(null);
    setShowEndFlash(false);
    setActiveBubbleId(null);
    setDiscussionTrigger(null);
  }, [resetLiveState]);

  /**
   * Unified session cleanup — called by both roundtable stop button and chat area end button.
   * Handles: engine transition, flash, roundtable state clearing.
   */
  const doSessionCleanup = useCallback(() => {
    const activeType = chatSessionType;

    // Engine cleanup — guard to avoid double flash from onDiscussionEnd
    manualStopRef.current = true;
    engineRef.current?.handleEndDiscussion();
    manualStopRef.current = false;

    // Show end flash with correct session type
    if (activeType === 'qa' || activeType === 'discussion') {
      setEndFlashSessionType(activeType);
      setShowEndFlash(true);
      setTimeout(() => setShowEndFlash(false), 1800);
    }

    resetLiveState();
  }, [chatSessionType, resetLiveState]);

  // Shared stop-discussion handler (used by both Roundtable and Canvas toolbar)
  const handleStopDiscussion = useCallback(async () => {
    await chatAreaRef.current?.endActiveSession();
    doSessionCleanup();
  }, [doSessionCleanup]);

  // Initialize playback engine when scene changes
  useEffect(() => {
    // Bump epoch so any stale SSE callbacks from the previous scene are discarded
    sceneEpochRef.current++;

    // End any active QA/discussion session — this synchronously aborts the SSE
    // stream inside use-chat-sessions (abortControllerRef.abort()), preventing
    // stale onLiveSpeech callbacks from leaking into the new scene.
    chatAreaRef.current?.endActiveSession();

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
      onSpeechStart: (text) => {
        setLectureSpeech(text);
        // Add to lecture session with incrementing index for dedup
        // Chat area pacing is handled by the StreamBuffer (onTextReveal)
        if (lectureSessionIdRef.current) {
          const idx = lectureActionCounterRef.current++;
          const speechId = `speech-${Date.now()}`;
          chatAreaRef.current?.addLectureMessage(
            lectureSessionIdRef.current,
            { id: speechId, type: 'speech', text } as Action,
            idx,
          );
          // Track active bubble for highlight (Issue 8)
          const msgId = chatAreaRef.current?.getLectureMessageId(lectureSessionIdRef.current!);
          if (msgId) setActiveBubbleId(msgId);
        }
      },
      onSpeechEnd: () => {
        // Don't clear lectureSpeech — let it persist until the next
        // onSpeechStart replaces it or the scene transitions.
        // Clearing here causes fallback to idleText (first sentence).
        setActiveBubbleId(null);
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
        // Only show flash for engine-initiated ends (not manual stop — that's handled by doSessionCleanup)
        if (!manualStopRef.current) {
          setEndFlashSessionType('discussion');
          setShowEndFlash(true);
          setTimeout(() => setShowEndFlash(false), 1800);
        }
        // If all actions are exhausted (discussion was the last action), mark
        // playback as completed so the bubble shows reset instead of play.
        if (engineRef.current?.isExhausted()) {
          setPlaybackCompleted(true);
        }
      },
      onUserInterrupt: (text) => {
        // User interrupted → start a discussion via chat
        chatAreaRef.current?.sendMessage(text);
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
  }, [currentScene]);

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

  /**
   * Handle discussion SSE — POST /api/chat and push events to engine
   */
  const handleDiscussionSSE = useCallback(
    async (topic: string, prompt?: string, agentId?: string) => {
      // Start discussion display in ChatArea (lecture speech is preserved independently)
      chatAreaRef.current?.startDiscussion({
        topic,
        prompt,
        agentId: agentId || 'default-1',
      });
      // Auto-switch to chat tab when discussion starts
      chatAreaRef.current?.switchToTab('chat');
      // Immediately mark streaming for synchronized stop button
      setChatIsStreaming(true);
      setChatSessionType('discussion');
      // Optimistic thinking: show thinking dots immediately (same as onMessageSend)
      setThinkingState({ stage: 'director' });
    },
    [],
  );

  // First speech text for idle display (extracted here for playbackView)
  const firstSpeechText = useMemo(
    () => currentScene?.actions?.find((a): a is SpeechAction => a.type === 'speech')?.text ?? null,
    [currentScene],
  );

  // Whether the speaking agent is a student (for bubble role derivation)
  const speakingStudentFlag = useMemo(() => {
    if (!speakingAgentId) return false;
    const agent = useAgentRegistry.getState().getAgent(speakingAgentId);
    return agent?.role !== 'teacher';
  }, [speakingAgentId]);

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
    if (!engine) return;

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
  const currentSceneIndex = isPendingScene
    ? scenes.length
    : scenes.findIndex((s) => s.id === currentSceneId);
  const totalScenesCount = scenes.length + (hasNextPending ? 1 : 0);

  // get action information
  const totalActions = currentScene?.actions?.length || 0;

  // whiteboard toggle
  const handleWhiteboardToggle = () => {
    setWhiteboardOpen(!whiteboardOpen);
  };

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

  const playbackToolbarLiveSession =
    chatIsStreaming || isTopicPending || engineMode === 'live';

  const showPlaybackStopDiscussion =
    engineMode === 'live' ||
    chatSessionType === 'qa' ||
    chatSessionType === 'discussion';

  // Build discussion request for Roundtable ProactiveCard from trigger
  const discussionRequest: DiscussionAction | null = discussionTrigger
    ? {
        type: 'discussion',
        id: discussionTrigger.id,
        topic: discussionTrigger.question,
        prompt: discussionTrigger.prompt,
        agentId: discussionTrigger.agentId || 'default-1',
      }
    : null;

  const quizScenesInCourse = useMemo(
    () => scenes.filter((s) => s.type === 'quiz' && s.content.type === 'quiz'),
    [scenes],
  );

  const mergedOutlines = useMemo(() => {
    const byId = new Map<string, SceneOutline>();
    for (const o of outlines) byId.set(o.id, o);
    for (const o of generatingOutlines) byId.set(o.id, o);
    return Array.from(byId.values()).sort((a, b) => a.order - b.order);
  }, [outlines, generatingOutlines]);

  /** 子 Tab 顺序：固定 slide / quiz / interactive，再按字母序追加大纲或场景中出现的其它类型（如 pbl） */
  const rawDataTabTypes = useMemo((): SceneType[] => {
    const present = new Set<SceneType>();
    for (const o of mergedOutlines) present.add(o.type);
    for (const s of scenes) present.add(s.type);
    const extras = [...present].filter((t) => !RAW_DATA_BASE_TYPES.includes(t)).sort();
    return [...RAW_DATA_BASE_TYPES, ...extras];
  }, [mergedOutlines, scenes]);

  const rawTypePayloadJson = useMemo(() => {
    try {
      const type = rawDataSubTab;
      const outlinesForType = mergedOutlines.filter((o) => o.type === type);
      const scenesForType = scenes.filter((s) => s.type === type).map(serializeSceneForRawView);
      return JSON.stringify({ type, outlines: outlinesForType, scenes: scenesForType }, null, 2);
    } catch {
      return '{"error":"serialize_failed"}';
    }
  }, [rawDataSubTab, mergedOutlines, scenes]);

  useEffect(() => {
    if (!rawDataTabTypes.includes(rawDataSubTab)) {
      setRawDataSubTab(rawDataTabTypes[0] ?? 'slide');
    }
  }, [rawDataTabTypes, rawDataSubTab]);

  const viewToggle = (
    <div
      className="flex items-center gap-0.5 rounded-full border border-gray-200/80 bg-white/70 p-0.5 shadow-sm backdrop-blur-md dark:border-gray-600/60 dark:bg-gray-800/70"
      role="tablist"
      aria-label={`${t('stage.viewPpt')} / ${t('stage.viewQuiz')} / ${t('stage.viewRawData')}`}
    >
      <button
        type="button"
        role="tab"
        aria-selected={mainClassroomView === 'ppt'}
        onClick={() => setMainClassroomView('ppt')}
        className={cn(
          'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
          mainClassroomView === 'ppt'
            ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
            : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200',
        )}
      >
        {t('stage.viewPpt')}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mainClassroomView === 'quiz'}
        onClick={() => setMainClassroomView('quiz')}
        className={cn(
          'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
          mainClassroomView === 'quiz'
            ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
            : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200',
        )}
      >
        {t('stage.viewQuiz')}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mainClassroomView === 'raw'}
        onClick={() => setMainClassroomView('raw')}
        className={cn(
          'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
          mainClassroomView === 'raw'
            ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
            : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200',
        )}
      >
        {t('stage.viewRawData')}
      </button>
    </div>
  );

  // Calculate scene viewer height (subtract Header's 80px height; optional Roundtable reserve)
  const sceneViewerHeight = (() => {
    const headerHeight = 80; // Header h-20 = 80px
    const roundtableReserve =
      mode === 'playback' && SHOW_CLASSROOM_ROUNDTABLE ? 192 : 0;
    return `calc(100% - ${headerHeight + roundtableReserve}px)`;
  })();

  return (
    <div className="flex-1 flex overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Main Content Area — scene list lives inside CanvasArea, left of the slide */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
        {/* Header */}
        <Header
          currentSceneTitle={currentScene?.title || ''}
          viewToggle={viewToggle}
          centerSlot={
            mode === 'playback' && mainClassroomView === 'ppt' ? (
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
              />
            ) : undefined
          }
        />

        {/* Canvas Area — PPT 视图 / 原始数据 */}
        <div
          className="overflow-hidden relative flex-1 min-h-0 isolate"
          style={{
            height: sceneViewerHeight,
          }}
          suppressHydrationWarning
        >
          {mainClassroomView === 'raw' ? (
            <div className="flex h-full min-h-0 flex-col bg-slate-950 text-slate-100">
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
                <div
                  className="flex flex-wrap gap-0.5 rounded-lg bg-white/5 p-0.5"
                  role="tablist"
                  aria-label={t('stage.rawDataCaption')}
                >
                  {rawDataTabTypes.map((tabType) => (
                    <button
                      key={tabType}
                      type="button"
                      role="tab"
                      aria-selected={rawDataSubTab === tabType}
                      onClick={() => setRawDataSubTab(tabType)}
                      className={cn(
                        'rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
                        rawDataSubTab === tabType
                          ? 'bg-white/15 text-white'
                          : 'text-slate-400 hover:text-slate-200',
                      )}
                    >
                      {sceneTypeTabLabel(t, tabType)}
                    </button>
                  ))}
                </div>
                <p className="ml-auto min-w-0 text-[10px] text-slate-500">{t('stage.rawDataCaption')}</p>
              </div>
              <pre className="min-h-0 flex-1 overflow-auto p-4 text-[11px] leading-relaxed whitespace-pre-wrap break-words font-mono">
                {rawTypePayloadJson}
              </pre>
            </div>
          ) : mainClassroomView === 'quiz' ? (
            <QuizCourseQuestionHub
              quizScenes={quizScenesInCourse}
              onSwitchScene={gatedSceneSwitch}
            />
          ) : (
            <CanvasArea
              currentScene={currentScene}
              currentSceneIndex={currentSceneIndex}
              scenesCount={totalScenesCount}
              mode={mode}
              engineState={canvasEngineState}
              isLiveSession={playbackToolbarLiveSession || !!chatSessionType}
              whiteboardOpen={whiteboardOpen}
              sidebarCollapsed={sidebarCollapsed}
              onSidebarCollapseChange={setSidebarCollapsed}
              onSceneSelect={gatedSceneSwitch}
              onRetryOutline={onRetryOutline}
              chatCollapsed={chatAreaCollapsed}
              onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
              onToggleChat={() => setChatAreaCollapsed(!chatAreaCollapsed)}
              onPrevSlide={handlePreviousScene}
              onNextSlide={handleNextScene}
              onPlayPause={handlePlayPause}
              onWhiteboardClose={handleWhiteboardToggle}
              showStopDiscussion={
                engineMode === 'live' ||
                (chatIsStreaming && (chatSessionType === 'qa' || chatSessionType === 'discussion'))
              }
              onStopDiscussion={handleStopDiscussion}
              hideToolbar={mode === 'playback'}
              isPendingScene={isPendingScene}
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

        {/* Roundtable Area */}
        {mode === 'playback' && SHOW_CLASSROOM_ROUNDTABLE && (
          <Roundtable
            mode={mode}
            initialParticipants={participants}
            playbackView={playbackView}
            currentSpeech={liveSpeech}
            lectureSpeech={lectureSpeech}
            idleText={firstSpeechText}
            playbackCompleted={playbackCompleted}
            discussionRequest={discussionRequest}
            engineMode={engineMode}
            isStreaming={chatIsStreaming}
            sessionType={
              chatSessionType === 'qa'
                ? 'qa'
                : chatSessionType === 'discussion'
                  ? 'discussion'
                  : undefined
            }
            speakingAgentId={speakingAgentId}
            speechProgress={speechProgress}
            showEndFlash={showEndFlash}
            endFlashSessionType={endFlashSessionType}
            thinkingState={thinkingState}
            isCueUser={isCueUser}
            isTopicPending={isTopicPending}
            onMessageSend={(msg) => {
              // Clear soft-paused state — user is continuing the topic
              if (isTopicPending) {
                setIsTopicPending(false);
                setLiveSpeech(null);
                setSpeakingAgentId(null);
              }
              // User interrupts during playback — handleUserInterrupt triggers
              // onUserInterrupt callback which already calls sendMessage, so skip
              // the direct sendMessage below to avoid sending twice.
              // Include 'paused' because onInputActivate pauses the engine before
              // the user finishes typing — without this the interrupt position
              // would never be saved and resuming after QA skips to the next sentence.
              if (
                engineRef.current &&
                (engineMode === 'playing' || engineMode === 'live' || engineMode === 'paused')
              ) {
                engineRef.current.handleUserInterrupt(msg);
              } else {
                chatAreaRef.current?.sendMessage(msg);
              }
              // Auto-switch to chat tab when user sends a message
              chatAreaRef.current?.switchToTab('chat');
              setIsCueUser(false);
              // Immediately mark streaming for synchronized stop button
              setChatIsStreaming(true);
              setChatSessionType(chatSessionType || 'qa');
              // Optimistic thinking: show thinking dots immediately so there's
              // no blank gap between userMessage expiry and the SSE thinking event.
              // The real SSE event will overwrite this with the same or updated value.
              setThinkingState({ stage: 'director' });
            }}
            onDiscussionStart={() => {
              // User clicks "Join" on ProactiveCard
              engineRef.current?.confirmDiscussion();
            }}
            onDiscussionSkip={() => {
              // User clicks "Skip" on ProactiveCard
              engineRef.current?.skipDiscussion();
            }}
            onStopDiscussion={handleStopDiscussion}
            onInputActivate={async () => {
              // Soft-pause QA/Discussion if streaming (opening input = implicit pause)
              if (chatIsStreaming) {
                await doSoftPause();
              }
              // Also pause playback engine
              if (engineRef.current && (engineMode === 'playing' || engineMode === 'live')) {
                engineRef.current.pause();
              }
            }}
            onResumeTopic={doResumeTopic}
            onPlayPause={handlePlayPause}
            isDiscussionPaused={isDiscussionPaused}
            onDiscussionPause={() => {
              chatAreaRef.current?.pauseActiveLiveBuffer();
              setIsDiscussionPaused(true);
            }}
            onDiscussionResume={() => {
              chatAreaRef.current?.resumeActiveLiveBuffer();
              setIsDiscussionPaused(false);
            }}
            totalActions={totalActions}
            currentActionIndex={0}
            currentSceneIndex={currentSceneIndex}
            scenesCount={totalScenesCount}
            whiteboardOpen={whiteboardOpen}
            sidebarCollapsed={sidebarCollapsed}
            chatCollapsed={chatAreaCollapsed}
            onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
            onToggleChat={() => setChatAreaCollapsed(!chatAreaCollapsed)}
            onPrevSlide={handlePreviousScene}
            onNextSlide={handleNextScene}
            onWhiteboardClose={handleWhiteboardToggle}
          />
        )}
      </div>

      {/* Chat Area */}
      <ChatArea
        ref={chatAreaRef}
        width={chatAreaWidth}
        onWidthChange={setChatAreaWidth}
        collapsed={chatAreaCollapsed}
        onCollapseChange={setChatAreaCollapsed}
        activeBubbleId={activeBubbleId}
        onActiveBubble={(id) => setActiveBubbleId(id)}
        currentSceneId={currentSceneId}
        onLiveSpeech={(text, agentId) => {
          // Capture epoch at call time — discard if scene has changed since
          const epoch = sceneEpochRef.current;
          // Use queueMicrotask to let any pending scene-switch reset settle first
          queueMicrotask(() => {
            if (sceneEpochRef.current !== epoch) return; // stale — scene changed
            setLiveSpeech(text);
            if (agentId !== undefined) {
              setSpeakingAgentId(agentId);
            }
            if (text !== null || agentId) {
              setChatIsStreaming(true);
              setChatSessionType(chatAreaRef.current?.getActiveSessionType?.() ?? null);
              setIsTopicPending(false);
            } else if (text === null && agentId === null) {
              setChatIsStreaming(false);
              // Don't clear chatSessionType here — it's needed by the stop
              // button when director cues user (cue_user → done → liveSpeech null).
              // It gets properly cleared in doSessionCleanup and scene change.
            }
          });
        }}
        onSpeechProgress={(ratio) => {
          const epoch = sceneEpochRef.current;
          queueMicrotask(() => {
            if (sceneEpochRef.current !== epoch) return;
            setSpeechProgress(ratio);
          });
        }}
        onThinking={(state) => {
          const epoch = sceneEpochRef.current;
          queueMicrotask(() => {
            if (sceneEpochRef.current !== epoch) return;
            setThinkingState(state);
          });
        }}
        onCueUser={(_fromAgentId, _prompt) => {
          setIsCueUser(true);
        }}
        onStopSession={doSessionCleanup}
      />

      {/* Scene switch confirmation dialog */}
      <AlertDialog
        open={!!pendingSceneId}
        onOpenChange={(open) => {
          if (!open) cancelSceneSwitch();
        }}
      >
        <AlertDialogContent className="max-w-sm rounded-2xl p-0 overflow-hidden border-0 shadow-[0_25px_60px_-12px_rgba(0,0,0,0.15)] dark:shadow-[0_25px_60px_-12px_rgba(0,0,0,0.5)]">
          <VisuallyHidden.Root>
            <AlertDialogTitle>{t('stage.confirmSwitchTitle')}</AlertDialogTitle>
          </VisuallyHidden.Root>
          {/* Top accent bar */}
          <div className="h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-red-400" />

          <div className="px-6 pt-5 pb-2 flex flex-col items-center text-center">
            {/* Icon */}
            <div className="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mb-4 ring-1 ring-amber-200/50 dark:ring-amber-700/30">
              <AlertTriangle className="w-6 h-6 text-amber-500 dark:text-amber-400" />
            </div>
            {/* Title */}
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-1.5">
              {t('stage.confirmSwitchTitle')}
            </h3>
            {/* Description */}
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              {t('stage.confirmSwitchMessage')}
            </p>
          </div>

          <AlertDialogFooter className="px-6 pb-5 pt-3 flex-row gap-3">
            <AlertDialogCancel onClick={cancelSceneSwitch} className="flex-1 rounded-xl">
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmSceneSwitch}
              className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0 shadow-md shadow-amber-200/50 dark:shadow-amber-900/30"
            >
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
