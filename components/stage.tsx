'use client';

import { useState, useEffect, useRef, useMemo, useCallback, type ReactNode } from 'react';
import type { UIMessage } from 'ai';
import { useStageStore } from '@/lib/store';
import { PENDING_SCENE_ID } from '@/lib/store/stage';
import { useCanvasStore } from '@/lib/store/canvas';
import { useSettingsStore } from '@/lib/store/settings';
import { useI18n } from '@/lib/hooks/use-i18n';
import { backendFetch } from '@/lib/utils/backend-api';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import {
  renderNotebookContentDocumentToSlide,
  resolveNotebookContentProfile,
  type NotebookContentProfile,
} from '@/lib/notebook-content';
import { Header } from './header';
import { QuizCourseQuestionHub } from '@/components/scene-renderers/quiz-course-question-hub';
import { CanvasPlaybackPill } from '@/components/canvas/canvas-playback-pill';
import { CanvasArea } from '@/components/canvas/canvas-area';
import { Roundtable } from '@/components/roundtable';
import { PlaybackEngine, computePlaybackView } from '@/lib/playback';
import type { EngineMode, TriggerEvent, Effect } from '@/lib/playback';
import { ActionEngine } from '@/lib/action/engine';
import { createAudioPlayer } from '@/lib/utils/audio-player';
import type { Action, DiscussionAction, MouthShape, SpeechAction } from '@/lib/types/action';
import type { Scene, SceneType, SlideContent } from '@/lib/types/stage';
import type { SceneOutline } from '@/lib/types/generation';
import { inferSceneContentProfile } from '@/lib/generation/content-profile';
import {
  normalizeAzureVisemesToMouthCues,
  resolveCurrentMouthCueFrame,
} from '@/lib/audio/mouth-cues';
// Playback state persistence removed — refresh always starts from the beginning
import { ChatArea, type ChatAreaRef } from '@/components/chat/chat-area';
import { agentsToParticipants, useAgentRegistry } from '@/lib/orchestration/registry/store';
import { getActionsForRole } from '@/lib/orchestration/registry/types';
import { ensureMissingSpeechAudioForScene } from '@/lib/hooks/use-scene-generator';
import { hydrateSpeechAudioFromTtsCache } from '@/lib/utils/tts-audio-cache';
import type { AgentConfig } from '@/lib/orchestration/registry/types';
import type { SlideRepairChatMessage } from '@/lib/types/slide-repair';
import {
  buildSceneSidebarAskThreadFromMessages,
  type SceneSidebarAskBubble,
} from '@/lib/utils/scene-sidebar-ask-thread';
import { runCourseSideChatLoop } from '@/lib/chat/run-course-side-chat-loop';
import type { ChatMessageMetadata } from '@/lib/types/chat';
import {
  AlertDialog,
  AlertDialogDescription,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, RefreshCcw, Sparkles, SquarePen } from 'lucide-react';
import { VisuallyHidden } from 'radix-ui';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ClassroomFooter } from '@/components/stage/classroom-footer';
import { ClassroomFooterVoiceChip } from '@/components/stage/classroom-footer-voice-chip';
import { SpeechGenerationIndicator } from '@/components/audio/speech-generation-indicator';
import { SlideNarrationEditor } from '@/components/stage/slide-narration-editor';
import { ClassroomSlideCanvasEditor } from '@/components/stage/classroom-slide-canvas-editor';

/** Bottom Roundtable strip in playback classroom — off until we ship the layout again. */
const SHOW_CLASSROOM_ROUNDTABLE = false;

const RAW_DATA_BASE_TYPES: SceneType[] = ['slide', 'quiz', 'interactive'];
type SpeechCadence = 'idle' | 'active' | 'pause' | 'fallback';
type SlideEditTab = 'canvas' | 'narration';
type SlideEditorSidebarTab = 'ai' | 'manual';

function createRepairMessageId(role: 'user' | 'assistant') {
  return `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getDefaultRepairRequest(
  language: 'zh-CN' | 'en-US' | undefined,
  profile: NotebookContentProfile,
) {
  if (profile === 'code') {
    return language === 'en-US'
      ? 'Repair this slide with the default code-slide repair flow.'
      : '按默认代码页修复链路优化当前页。';
  }
  if (profile === 'math') {
    return language === 'en-US'
      ? 'Repair this slide with the default math-slide repair flow.'
      : '按默认数学页修复链路优化当前页。';
  }
  return language === 'en-US'
    ? 'Repair this slide with the default general-slide repair flow.'
    : '按默认通用页修复链路优化当前页。';
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectFallbackKeyPointsFromSlide(content: SlideContent): string[] {
  const semanticBlocks = content.semanticDocument?.blocks ?? [];
  const semanticPoints = semanticBlocks
    .flatMap((block) => {
      switch (block.type) {
        case 'heading':
          return [block.text];
        case 'paragraph':
          return [block.text];
        case 'bullet_list':
          return block.items;
        case 'equation':
          return [block.latex];
        case 'matrix':
          return [block.label || '', block.caption || '', ...block.rows.flat()];
        case 'derivation_steps':
          return block.steps.map((step) => step.expression);
        case 'code_block':
          return [block.caption || '', block.code];
        case 'code_walkthrough':
          return [
            block.title || '',
            block.caption || '',
            ...block.steps.map((step) => step.title || step.focus || step.explanation),
          ];
        case 'callout':
          return [block.title || '', block.text];
        case 'example':
          return [
            block.problem,
            ...block.givens,
            ...(block.goal ? [block.goal] : []),
            ...block.steps,
          ];
        case 'process_flow':
          return [
            block.title || '',
            ...block.context.flatMap((item) => [item.label, item.text]),
            ...block.steps.flatMap((step) => [step.title, step.detail, step.note || '']),
            ...(block.summary ? [block.summary] : []),
          ];
        default:
          return [];
      }
    })
    .map((item) => item.trim())
    .filter(Boolean);

  if (semanticPoints.length > 0) return semanticPoints.slice(0, 5);

  const canvasPoints = content.canvas.elements
    .flatMap((element) => {
      if (element.type === 'text') return [stripHtmlToText(element.content)];
      if (element.type === 'latex') return [element.latex];
      if (element.type === 'shape' && element.text?.content) {
        return [stripHtmlToText(element.text.content)];
      }
      if (element.type === 'table') {
        const rows = element.data ?? [];
        return rows.flat().map((cell) => cell.text);
      }
      return [];
    })
    .map((item) => item.trim())
    .filter(Boolean);

  return canvasPoints.slice(0, 5);
}

function buildFallbackRewriteOutline(scene: Scene, language: 'zh-CN' | 'en-US'): SceneOutline {
  const keyPoints =
    scene.type === 'slide' && scene.content.type === 'slide'
      ? collectFallbackKeyPointsFromSlide(scene.content)
      : [scene.title];
  const contentProfile =
    scene.type === 'slide' && scene.content.type === 'slide' && scene.content.semanticDocument
      ? resolveNotebookContentProfile(scene.content.semanticDocument)
      : undefined;

  return {
    id: `rewrite_${scene.id}`,
    type: scene.type === 'slide' ? 'slide' : 'slide',
    contentProfile,
    title: scene.title,
    description:
      language === 'en-US'
        ? `Rewrite this slide while keeping the same topic and teaching goal as "${scene.title}".`
        : `围绕“${scene.title}”这个主题，重写这一页，但保持原有教学目标。`,
    keyPoints: keyPoints.length > 0 ? keyPoints : [scene.title],
    order: scene.order,
    language,
  };
}

function normalizeOutlineTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

function resolveRewriteOutline(
  scene: Scene,
  outlines: SceneOutline[],
  language: 'zh-CN' | 'en-US',
): SceneOutline {
  const byOrder = outlines.find((outline) => outline.order === scene.order);
  if (byOrder) return byOrder;

  const sceneTitle = normalizeOutlineTitle(scene.title);
  const byTitle = outlines.find((outline) => normalizeOutlineTitle(outline.title) === sceneTitle);
  if (byTitle) return byTitle;

  return buildFallbackRewriteOutline(scene, language);
}

function resolveSlideRepairProfile(scene: Scene, outline?: SceneOutline): NotebookContentProfile {
  if (scene.type === 'slide' && scene.content.type === 'slide' && scene.content.semanticDocument) {
    return resolveNotebookContentProfile(scene.content.semanticDocument);
  }
  if (outline?.contentProfile) return outline.contentProfile;
  return outline ? inferSceneContentProfile(outline) : 'general';
}

function repairRequestLooksMathFocused(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  return /公式|latex|符号|下标|上标|矩阵|推导|证明|同余|映射|核|像|math|formula|notation|equation|derivation|proof|matrix|subscript|superscript|kernel|image/i.test(
    normalized,
  );
}

function buildRepairPendingMessage(args: {
  language: 'zh-CN' | 'en-US';
  profile: NotebookContentProfile;
}): string {
  if (args.profile === 'code') {
    return args.language === 'en-US'
      ? "I'm repairing this slide through the code-specific repair flow now."
      : '收到，我现在按代码讲解修复链路重写当前页。';
  }
  if (args.profile === 'math') {
    return args.language === 'en-US'
      ? "I'm repairing this slide through the math-specific repair flow now."
      : '收到，我现在按数学修复链路重写当前页。';
  }
  return args.language === 'en-US'
    ? "I'm repairing this slide through the general slide-repair flow now."
    : '收到，我现在按通用页修复链路重写当前页。';
}

function buildRepairAssistantReply(args: {
  language: 'zh-CN' | 'en-US';
  profile: NotebookContentProfile;
  rewriteReason: string;
  outlineTitle: string;
}): string {
  const flowLabel =
    args.profile === 'code'
      ? args.language === 'en-US'
        ? 'the code-specific repair flow'
        : '代码页修复链路'
      : args.profile === 'math'
        ? args.language === 'en-US'
          ? 'the math-specific repair flow'
          : '数学页修复链路'
        : args.language === 'en-US'
          ? 'the general slide-repair flow'
          : '通用页修复链路';

  if (args.language === 'en-US') {
    return args.rewriteReason.trim()
      ? `I repaired this slide through ${flowLabel} and used your instruction to steer the new structure and emphasis around "${args.outlineTitle}".`
      : `I repaired this slide through ${flowLabel} and regenerated a clearer version around "${args.outlineTitle}".`;
  }

  return args.rewriteReason.trim()
    ? `我已经按${flowLabel}修了这一页，并把你给的要求真正带进了“${args.outlineTitle}”这一页的新结构和重点里。`
    : `我已经按${flowLabel}修了这一页，重新整理出了一版围绕“${args.outlineTitle}”的更清楚页面。`;
}

function sceneTypeTabLabel(tr: (key: string) => string, type: SceneType): string {
  const key = `stage.sceneType.${type}`;
  const label = tr(key);
  return label === key ? type : label;
}

/** 原始数据里默认折叠 slide 画布；当前页可选择展开查看完整 canvas */
function serializeSceneForRawView(
  scene: Scene,
  options?: { expandSlideCanvas?: boolean },
): unknown {
  if (scene.content.type === 'slide' && !options?.expandSlideCanvas) {
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
  headerActions,
}: {
  onRetryOutline?: (outlineId: string) => Promise<void>;
  headerActions?: ReactNode;
}) {
  const { t, locale } = useI18n();
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
  const [lectureSpeechActive, setLectureSpeechActive] = useState(false);
  const [currentSpeechAction, setCurrentSpeechAction] = useState<SpeechAction | null>(null);
  const [currentMouthShape, setCurrentMouthShape] = useState<MouthShape | null>(null);
  const [speechCadence, setSpeechCadence] = useState<SpeechCadence>('idle');
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
  /** 幻灯片原始数据细分：生成结果 / 大纲 / 讲解动作 / UI衍生数据 */
  const [rawSlideDataView, setRawSlideDataView] = useState<
    'generated' | 'outline' | 'narration' | 'ui'
  >(
    'generated',
  );
  /** 课堂内当前页编辑模式：页面布局 / 讲解稿 */
  const [slideEditorOpen, setSlideEditorOpen] = useState(false);
  const [slideEditTab, setSlideEditTab] = useState<SlideEditTab>('canvas');
  const [slideEditorSidebarTab, setSlideEditorSidebarTab] =
    useState<SlideEditorSidebarTab>('manual');
  const [editEntryConfirmOpen, setEditEntryConfirmOpen] = useState(false);
  const [repairDraftByScene, setRepairDraftByScene] = useState<Record<string, string>>({});
  const [repairConversationByScene, setRepairConversationByScene] = useState<
    Record<string, SlideRepairChatMessage[]>
  >({});
  const [pendingRepairSidebarFocus, setPendingRepairSidebarFocus] = useState(false);
  const [repairSidebarFocusNonce, setRepairSidebarFocusNonce] = useState(0);
  const [slideRepairPending, setSlideRepairPending] = useState(false);
  const [speechAudioPreparing, setSpeechAudioPreparing] = useState(false);
  const [gridReflowPending, setGridReflowPending] = useState(false);
  const currentSlideSceneId = currentScene?.type === 'slide' ? currentScene.id : null;
  const repairInstructions = useMemo(
    () => (currentSlideSceneId ? (repairDraftByScene[currentSlideSceneId] ?? '') : ''),
    [currentSlideSceneId, repairDraftByScene],
  );
  const repairConversation = useMemo(
    () => (currentSlideSceneId ? (repairConversationByScene[currentSlideSceneId] ?? []) : []),
    [currentSlideSceneId, repairConversationByScene],
  );

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
  const sidebarAskAbortRef = useRef<AbortController | null>(null);
  // Guard to prevent double flash when manual stop triggers onDiscussionEnd
  const manualStopRef = useRef(false);
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
          parts.push({ type: 'text', text: '...' } as UIMessage<ChatMessageMetadata>['parts'][number]);
        }
        next[i] = { ...next[i], parts };
        return next;
      }
      return prev;
    });
  }, []);

  const abortSidebarAskLoop = useCallback(
    (markInterrupted: boolean) => {
      if (!sidebarAskAbortRef.current) return;
      sidebarAskAbortRef.current.abort();
      sidebarAskAbortRef.current = null;
      if (markInterrupted) {
        appendInterruptedSidebarAskMessage();
      }
    },
    [appendInterruptedSidebarAskMessage],
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
    setLectureSpeechActive(false);
    setCurrentSpeechAction(null);
    setCurrentMouthShape(null);
    setSpeechCadence('idle');
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
          // Track active bubble for highlight (Issue 8)
          const msgId = chatAreaRef.current?.getLectureMessageId(lectureSessionIdRef.current!);
          if (msgId) setActiveBubbleId(msgId);
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
        // User interrupted → continue in the classroom sidebar ask thread
        void runSidebarAskLoop(text);
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

  const executeSidebarAskLoop = useCallback(
    async (initialMessages: UIMessage<ChatMessageMetadata>[]) => {
      const modelConfig = getCurrentModelConfig();
      if (!modelConfig.isServerConfigured) {
        toast.error(t('settings.setupNeeded'), {
          description: '系统 OpenAI 模型尚未配置，请联系管理员。',
        });
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

      const agentIds = selectedAgentIds.length > 0 ? selectedAgentIds : ['default-1'];
      const agentConfigs = agentIds
        .map((id) => useAgentRegistry.getState().getAgent(id))
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
            setLiveSpeech(
              textPart && textPart.type === 'text' ? (textPart.text || null) : null,
            );
            setSpeakingAgentId(lastAssistant?.metadata?.agentId || null);
            if (messages.some((m) => m.role === 'assistant')) {
              setThinkingState(null);
            }
          },
        });
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
    [selectedAgentIds, t],
  );

  const runSidebarAskLoop = useCallback(
    async (message: string) => {
      const trimmed = message.trim();
      if (!trimmed) return;

      abortSidebarAskLoop(true);

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

      await executeSidebarAskLoop(nextMessages);
    },
    [abortSidebarAskLoop, executeSidebarAskLoop, t],
  );

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
    await executeSidebarAskLoop(sceneSidebarAskMessages);
  }, [executeSidebarAskLoop, sceneSidebarAskMessages]);

  /** 侧栏提问框聚焦：切到聊天 Tab、暂停讲解，但不自动展开右侧聊天区（避免一点输入框就「弹开」右栏；发送时仍会展开）。 */
  const handleSidebarInputActivate = useCallback(async () => {
    chatAreaRef.current?.switchToTab('chat');

    if (chatIsStreaming) {
      await doSoftPause();
    }

    const mode = engineRef.current?.getMode();
    if (engineRef.current && (mode === 'playing' || mode === 'live')) {
      engineRef.current.pause();
    }
  }, [chatIsStreaming, doSoftPause]);

  const sendClassroomQuestion = useCallback(
    (msg: string, options?: { revealChatArea?: boolean; restoreChatAreaCollapsed?: boolean }) => {
      const trimmed = msg.trim();
      if (!trimmed) return;

      const shouldRestoreChatArea = Boolean(options?.restoreChatAreaCollapsed && chatAreaCollapsed);

      if (options?.revealChatArea) {
        setChatAreaCollapsed(false);
      }

      if (isTopicPending) {
        setIsTopicPending(false);
        setLiveSpeech(null);
        setSpeakingAgentId(null);
      }

      if (
        engineRef.current &&
        (engineMode === 'playing' || engineMode === 'live' || engineMode === 'paused')
      ) {
        engineRef.current.handleUserInterrupt(trimmed);
      } else {
        void runSidebarAskLoop(trimmed);
      }

      setIsCueUser(false);
      setIsDiscussionPaused(false);

      if (shouldRestoreChatArea) {
        window.setTimeout(() => {
          setChatAreaCollapsed(true);
        }, 0);
      }
    },
    [chatAreaCollapsed, engineMode, isTopicPending, runSidebarAskLoop, setChatAreaCollapsed],
  );

  const handleSidebarQuestionSend = useCallback(
    (msg: string) => {
      sendClassroomQuestion(msg, {
        revealChatArea: true,
        restoreChatAreaCollapsed: true,
      });
    },
    [sendClassroomQuestion],
  );

  const handleChatAreaQuestionSend = useCallback(
    (msg: string) => {
      sendClassroomQuestion(msg, { revealChatArea: true });
    },
    [sendClassroomQuestion],
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

  const sceneSidebarAskSpeakerName = useMemo(() => {
    if (!speakingAgentId) {
      return chatSessionType === 'qa' ? '老师' : null;
    }
    const agent = useAgentRegistry.getState().getAgent(speakingAgentId);
    if (!agent) return chatSessionType === 'qa' ? '老师' : null;
    return agent.role === 'teacher' ? agent.name || '老师' : agent.name;
  }, [chatSessionType, speakingAgentId]);

  const sceneSidebarAskSpeakerMeta = useMemo(() => {
    if (!speakingAgentId) {
      const teacher = selectedAgentIds
        .map((id) => useAgentRegistry.getState().getAgent(id))
        .find((agent) => agent?.role === 'teacher');
      return {
        avatar: teacher?.avatar || null,
        color: teacher?.color || '#38bdf8',
      };
    }
    const agent = useAgentRegistry.getState().getAgent(speakingAgentId);
    return {
      avatar: agent?.avatar || null,
      color: agent?.color || '#38bdf8',
    };
  }, [selectedAgentIds, speakingAgentId]);

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
            />,
          );
          setSpeechAudioPreparing(true);
          let ttsReady: Awaited<ReturnType<typeof ensureMissingSpeechAudioForScene>>;
          try {
            ttsReady = await ensureMissingSpeechAudioForScene(
              sceneForTts,
              undefined,
              ({ done, total }) => {
                toast.loading(
                  <SpeechGenerationIndicator
                    label={locale === 'zh-CN' ? '语音生成中' : 'Generating speech'}
                    done={done}
                    total={total}
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

  // get action information
  const totalActions = currentScene?.actions?.length || 0;

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

  const setCurrentSlideRepairDraft = useCallback(
    (value: string) => {
      if (!currentSlideSceneId) return;
      setRepairDraftByScene((prev) => {
        if ((prev[currentSlideSceneId] ?? '') === value) return prev;
        return {
          ...prev,
          [currentSlideSceneId]: value,
        };
      });
    },
    [currentSlideSceneId],
  );

  const saveCurrentSceneActions = useCallback(
    (nextActions: Action[]) => {
      if (!currentScene || currentScene.type !== 'slide') return;
      updateScene(currentScene.id, {
        actions: nextActions,
      });
    },
    [currentScene, updateScene],
  );

  const handleRepairCurrentSlide = useCallback(async () => {
    if (
      slideRepairPending ||
      !currentScene ||
      currentScene.type !== 'slide' ||
      currentScene.content.type !== 'slide' ||
      !stage
    ) {
      return;
    }

    const sceneId = currentScene.id;
    const trimmedDraft = repairInstructions.trim();
    const rewriteLanguage = (stageLanguage as 'zh-CN' | 'en-US' | undefined) || 'zh-CN';
    const matchedOutline = resolveRewriteOutline(currentScene, outlines, rewriteLanguage);
    const baseRepairProfile = resolveSlideRepairProfile(currentScene, matchedOutline);
    const repairProfile = repairRequestLooksMathFocused(trimmedDraft) ? 'math' : baseRepairProfile;
    const userMessageContent =
      trimmedDraft || getDefaultRepairRequest(rewriteLanguage, repairProfile);
    const outlineExists = outlines.some((outline) => outline.id === matchedOutline.id);
    const outlineCollection = (outlineExists ? outlines : [...outlines, matchedOutline])
      .slice()
      .sort((a, b) => a.order - b.order);
    const userMessage: SlideRepairChatMessage = {
      id: createRepairMessageId('user'),
      role: 'user',
      content: userMessageContent,
      createdAt: Date.now(),
      status: 'ready',
    };
    const pendingAssistantMessage: SlideRepairChatMessage = {
      id: createRepairMessageId('assistant'),
      role: 'assistant',
      content: buildRepairPendingMessage({
        language: rewriteLanguage,
        profile: repairProfile,
      }),
      createdAt: Date.now() + 1,
      status: 'pending',
    };
    setRepairConversationByScene((prev) => ({
      ...prev,
      [sceneId]: [...(prev[sceneId] ?? []), userMessage, pendingAssistantMessage],
    }));
    setRepairDraftByScene((prev) => ({
      ...prev,
      [sceneId]: '',
    }));
    setSlideRepairPending(true);
    try {
      const modelConfig = getCurrentModelConfig();
      const repairSnapshot =
        currentScene.repairSnapshot ||
        ({
          title: currentScene.title,
          content: JSON.parse(JSON.stringify(currentScene.content)) as SlideContent,
          savedAt: Date.now(),
        } satisfies NonNullable<Scene['repairSnapshot']>);
      const repairRoute =
        repairProfile === 'code'
          ? '/api/classroom/repair-slide-code'
          : repairProfile === 'math'
            ? '/api/classroom/repair-slide-math'
            : '/api/classroom/repair-slide-general';
      const repairResp = await backendFetch(repairRoute, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-model': modelConfig.modelString,
          'x-provider-type': modelConfig.providerType,
          'x-requires-api-key': modelConfig.requiresApiKey ? 'true' : 'false',
        },
        body: JSON.stringify({
          notebookId: stage.id,
          notebookName: stage.name,
          sceneId: currentScene.id,
          sceneOrder: currentScene.order + 1,
          sceneTitle: currentScene.title,
          language: rewriteLanguage,
          content: currentScene.content,
          repairInstructions: userMessageContent,
          repairConversation: [
            ...repairConversation,
            { role: 'user' as const, content: userMessageContent },
          ],
        }),
      });

      const repairData = (await repairResp.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        sceneTitle?: string;
        assistantReply?: string;
        content?: SlideContent;
      };

      if (!repairResp.ok || !repairData.success || !repairData.content) {
        throw new Error(repairData.error?.trim() || 'AI 重写失败');
      }

      const nextTitle = repairData.sceneTitle?.trim() || currentScene.title;
      const nextOutline: SceneOutline = {
        ...matchedOutline,
        id: matchedOutline.id,
        order: currentScene.order,
        type: 'slide',
        language: rewriteLanguage,
        contentProfile: repairProfile,
        title: nextTitle,
      };
      const nextOutlines = (() => {
        if (outlineCollection.length === 0) return [nextOutline];
        let found = false;
        const updated = outlineCollection.map((outline) => {
          if (outline.id === matchedOutline.id || outline.order === currentScene.order) {
            found = true;
            return nextOutline;
          }
          return outline;
        });
        if (!found) updated.push(nextOutline);
        return updated.slice().sort((a, b) => a.order - b.order);
      })();

      updateScene(currentScene.id, {
        title: nextTitle,
        content: repairData.content,
        repairSnapshot,
        updatedAt: Date.now(),
      });
      setOutlines(nextOutlines);
      setRepairConversationByScene((prev) => ({
        ...prev,
        [sceneId]: (prev[sceneId] ?? []).map((message) =>
          message.id === pendingAssistantMessage.id
            ? {
                ...message,
                content:
                  repairData.assistantReply?.trim() ||
                  buildRepairAssistantReply({
                    language: rewriteLanguage,
                    profile: repairProfile,
                    rewriteReason: userMessageContent,
                    outlineTitle: nextTitle,
                  }),
                status: 'ready',
              }
            : message,
        ),
      }));
      toast.success(
        repairProfile === 'code'
          ? '当前页已完成代码讲解修复'
          : repairProfile === 'math'
            ? '当前页已完成数学内容修复'
            : '当前页已完成通用讲解修复',
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'AI 重写失败';
      setRepairConversationByScene((prev) => ({
        ...prev,
        [sceneId]: (prev[sceneId] ?? []).map((message) =>
          message.id === pendingAssistantMessage.id
            ? {
                ...message,
                content: errorMessage,
                status: 'error',
              }
            : message,
        ),
      }));
      toast.error(errorMessage);
    } finally {
      setSlideRepairPending(false);
    }
  }, [
    currentScene,
    outlines,
    repairConversation,
    repairInstructions,
    setOutlines,
    slideRepairPending,
    stage,
    stageLanguage,
    updateScene,
  ]);

  useEffect(() => {
    if (!pendingRepairSidebarFocus || !slideEditorOpen || slideEditTab !== 'canvas') return;
    setSlideEditorSidebarTab('ai');
    setRepairSidebarFocusNonce((current) => current + 1);
    setPendingRepairSidebarFocus(false);
  }, [pendingRepairSidebarFocus, slideEditTab, slideEditorOpen]);

  const handleRestorePreRepairSlide = useCallback(() => {
    if (
      !currentScene ||
      currentScene.type !== 'slide' ||
      currentScene.content.type !== 'slide' ||
      !currentScene.repairSnapshot
    ) {
      return;
    }

    updateScene(currentScene.id, {
      title: currentScene.repairSnapshot.title,
      content: currentScene.repairSnapshot.content,
      repairSnapshot: undefined,
      updatedAt: Date.now(),
    });
    toast.success('已恢复到重写前的版本');
  }, [currentScene, updateScene]);

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

  const live2dPresenterVisible = useSettingsStore((s) => s.live2dPresenterVisible);
  /** 与幻灯片角标时代一致：不因 mode 卡在 autonomous 就隐藏侧栏入口（自主模式下为待机姿态） */
  const live2dSidebarEligible =
    live2dPresenterVisible &&
    !isPendingScene &&
    !whiteboardOpen &&
    !playbackToolbarLiveSession &&
    !chatSessionType;

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

  const rawCurrentScene = useMemo(() => {
    if (currentScene && currentScene.type === rawDataSubTab) {
      return currentScene;
    }
    return null;
  }, [currentScene, rawDataSubTab]);

  const rawCurrentOutline = useMemo(() => {
    if (!rawCurrentScene) return null;
    const byOrder = mergedOutlines.find(
      (outline) => outline.type === rawDataSubTab && outline.order === rawCurrentScene.order,
    );
    if (byOrder) return byOrder;
    return (
      mergedOutlines.find(
        (outline) =>
          outline.type === rawDataSubTab &&
          outline.title.trim().toLowerCase() === rawCurrentScene.title.trim().toLowerCase(),
      ) || null
    );
  }, [mergedOutlines, rawCurrentScene, rawDataSubTab]);

  const canReflowCurrentGridScene = useMemo(() => {
    if (!rawCurrentScene || rawCurrentScene.type !== 'slide' || rawCurrentScene.content.type !== 'slide') {
      return false;
    }
    return rawCurrentScene.content.semanticDocument?.layout?.mode === 'grid';
  }, [rawCurrentScene]);

  const canReflowCurrentLayoutCardsScene = useMemo(() => {
    if (!rawCurrentScene || rawCurrentScene.type !== 'slide' || rawCurrentScene.content.type !== 'slide') {
      return false;
    }
    return Boolean(
      rawCurrentScene.content.semanticDocument?.blocks.some((block) => block.type === 'layout_cards'),
    );
  }, [rawCurrentScene]);

  const handleReflowCurrentGridScene = useCallback(() => {
    if (!rawCurrentScene || rawCurrentScene.type !== 'slide' || rawCurrentScene.content.type !== 'slide') {
      return;
    }
    const semanticDocument = rawCurrentScene.content.semanticDocument;
    if (!semanticDocument || semanticDocument.layout.mode !== 'grid') {
      toast.info('当前页不是 Grid 布局，无需重排。');
      return;
    }
    try {
      setGridReflowPending(true);
      const reRendered = renderNotebookContentDocumentToSlide({
        document: semanticDocument,
        fallbackTitle: semanticDocument.title || rawCurrentScene.title,
      });
      updateScene(rawCurrentScene.id, {
        content: {
          ...rawCurrentScene.content,
          canvas: reRendered,
          semanticDocument,
        },
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
    if (!rawCurrentScene || rawCurrentScene.type !== 'slide' || rawCurrentScene.content.type !== 'slide') {
      return;
    }
    const semanticDocument = rawCurrentScene.content.semanticDocument;
    if (!semanticDocument || !semanticDocument.blocks.some((block) => block.type === 'layout_cards')) {
      toast.info('当前页没有 Layout Cards 块，无需重排。');
      return;
    }
    try {
      setGridReflowPending(true);
      const reRendered = renderNotebookContentDocumentToSlide({
        document: semanticDocument,
        fallbackTitle: semanticDocument.title || rawCurrentScene.title,
      });
      updateScene(rawCurrentScene.id, {
        content: {
          ...rawCurrentScene.content,
          canvas: reRendered,
          semanticDocument,
        },
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

  const rawTypePayloadJson = useMemo(() => {
    try {
      const type = rawDataSubTab;
      const scene = rawCurrentScene;
      const scenePayload =
        !scene
          ? null
          : type === 'slide'
            ? (() => {
                if (rawSlideDataView === 'generated') {
                  return {
                    id: scene.id,
                    type: scene.type,
                    title: scene.title,
                    order: scene.order,
                    content: scene.content,
                  };
                }

                if (rawSlideDataView === 'outline') {
                  return {
                    id: scene.id,
                    type: scene.type,
                    title: scene.title,
                    order: scene.order,
                    outline: rawCurrentOutline,
                  };
                }

                if (rawSlideDataView === 'narration') {
                  return {
                    id: scene.id,
                    type: scene.type,
                    title: scene.title,
                    order: scene.order,
                    actions: scene.actions || [],
                  };
                }

                const serialized = serializeSceneForRawView(scene, {
                  expandSlideCanvas: scene.id === currentSceneId && scene.content.type === 'slide',
                }) as Record<string, unknown>;
                const { actions, ...rest } = serialized;
                return {
                  ...rest,
                  actionsSummary: Array.isArray(scene.actions)
                    ? {
                        total: scene.actions.length,
                        speech: scene.actions.filter((action) => action.type === 'speech').length,
                        spotlight: scene.actions.filter((action) => action.type === 'spotlight').length,
                        laser: scene.actions.filter((action) => action.type === 'laser').length,
                      }
                    : { total: 0, speech: 0, spotlight: 0, laser: 0 },
                };
              })()
            : serializeSceneForRawView(scene);

      return JSON.stringify(
        {
          type,
          view: type === 'slide' ? rawSlideDataView : 'default',
          sceneId: scene?.id ?? null,
          outline: rawCurrentOutline,
          scene: scenePayload,
        },
        null,
        2,
      );
    } catch {
      return '{"error":"serialize_failed"}';
    }
  }, [
    currentSceneId,
    rawDataSubTab,
    rawSlideDataView,
    rawCurrentOutline,
    rawCurrentScene,
  ]);

  useEffect(() => {
    if (!rawDataTabTypes.includes(rawDataSubTab)) {
      setRawDataSubTab(rawDataTabTypes[0] ?? 'slide');
    }
  }, [rawDataTabTypes, rawDataSubTab]);

  const viewToggle = slideEditorOpen ? (
    <div
      className={cn(
        'apple-glass flex items-center gap-0.5 rounded-[14px] p-0.5',
        'shadow-[0_2px_16px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_20px_rgba(0,0,0,0.25)]',
      )}
      role="tablist"
      aria-label="编辑模式切换"
    >
      <button
        type="button"
        role="tab"
        aria-selected={slideEditTab === 'canvas'}
        onClick={() => setSlideEditTab('canvas')}
        className={cn(
          'rounded-[10px] px-3 py-1.5 text-xs font-semibold transition-all duration-[250ms] ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
          slideEditTab === 'canvas'
            ? 'bg-[rgba(0,122,255,0.12)] text-[#007AFF] shadow-sm dark:bg-[rgba(10,132,255,0.18)] dark:text-[#0A84FF]'
            : 'text-[#1d1d1f]/65 hover:bg-black/[0.04] hover:text-[#1d1d1f] dark:text-white/70 dark:hover:bg-white/[0.06] dark:hover:text-white',
        )}
      >
        页面
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={slideEditTab === 'narration'}
        onClick={() => setSlideEditTab('narration')}
        className={cn(
          'rounded-[10px] px-3 py-1.5 text-xs font-semibold transition-all duration-[250ms] ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
          slideEditTab === 'narration'
            ? 'bg-[rgba(0,122,255,0.12)] text-[#007AFF] shadow-sm dark:bg-[rgba(10,132,255,0.18)] dark:text-[#0A84FF]'
            : 'text-[#1d1d1f]/65 hover:bg-black/[0.04] hover:text-[#1d1d1f] dark:text-white/70 dark:hover:bg-white/[0.06] dark:hover:text-white',
        )}
      >
        讲解
      </button>
    </div>
  ) : (
    <div
      className={cn(
        'apple-glass flex items-center gap-0.5 rounded-[14px] p-0.5',
        'shadow-[0_2px_16px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_20px_rgba(0,0,0,0.25)]',
      )}
      role="tablist"
      aria-label={`${t('stage.viewPpt')} / ${t('stage.viewQuiz')} / ${t('stage.viewRawData')}`}
    >
      <button
        type="button"
        role="tab"
        aria-selected={mainClassroomView === 'ppt'}
        onClick={() => setMainClassroomView('ppt')}
        className={cn(
          'rounded-[10px] px-3 py-1.5 text-xs font-semibold transition-all duration-[250ms] ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
          mainClassroomView === 'ppt'
            ? 'bg-[rgba(0,122,255,0.12)] text-[#007AFF] shadow-sm dark:bg-[rgba(10,132,255,0.18)] dark:text-[#0A84FF]'
            : 'text-[#1d1d1f]/65 hover:bg-black/[0.04] hover:text-[#1d1d1f] dark:text-white/70 dark:hover:bg-white/[0.06] dark:hover:text-white',
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
          'rounded-[10px] px-3 py-1.5 text-xs font-semibold transition-all duration-[250ms] ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
          mainClassroomView === 'quiz'
            ? 'bg-[rgba(0,122,255,0.12)] text-[#007AFF] shadow-sm dark:bg-[rgba(10,132,255,0.18)] dark:text-[#0A84FF]'
            : 'text-[#1d1d1f]/65 hover:bg-black/[0.04] hover:text-[#1d1d1f] dark:text-white/70 dark:hover:bg-white/[0.06] dark:hover:text-white',
        )}
      >
        {t('stage.viewQuiz')}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mainClassroomView === 'raw'}
        onClick={() => {
          setMainClassroomView('raw');
          if (currentScene?.type) setRawDataSubTab(currentScene.type);
        }}
        className={cn(
          'rounded-[10px] px-3 py-1.5 text-xs font-semibold transition-all duration-[250ms] ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
          mainClassroomView === 'raw'
            ? 'bg-[rgba(0,122,255,0.12)] text-[#007AFF] shadow-sm dark:bg-[rgba(10,132,255,0.18)] dark:text-[#0A84FF]'
            : 'text-[#1d1d1f]/65 hover:bg-black/[0.04] hover:text-[#1d1d1f] dark:text-white/70 dark:hover:bg-white/[0.06] dark:hover:text-white',
        )}
      >
        {t('stage.viewRawData')}
      </button>
    </div>
  );

  const editorStatusSlot = slideEditorOpen ? (
    <div className="apple-glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200">
      <span
        className={cn(
          'inline-flex size-2 rounded-full',
          storageSaveState === 'saving'
            ? 'bg-amber-500 dark:bg-amber-400'
            : storageSaveState === 'error'
              ? 'bg-rose-500 dark:bg-rose-400'
              : 'bg-emerald-500 dark:bg-emerald-400',
        )}
      />
      <span>
        {storageSaveState === 'saving'
          ? slideEditTab === 'canvas'
            ? '页面改动正在保存…'
            : '讲解改动正在保存…'
          : storageSaveState === 'error'
            ? `保存失败${storageSaveError ? `：${storageSaveError}` : ''}`
            : storageSaveState === 'saved'
              ? storageSaveScope === 'draft'
                ? `已保存草稿${storageSavedAt ? '，刷新不会丢' : ''}`
                : '已保存'
              : slideEditTab === 'canvas'
                ? '编辑模式：页面改动会自动保存'
                : '编辑模式：讲解修改需要手动保存'}
      </span>
    </div>
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
      const reRendered = renderNotebookContentDocumentToSlide({
        document: semanticDocument,
        fallbackTitle: semanticDocument.title || currentScene.title,
      });
      updateScene(currentScene.id, {
        content: {
          ...currentScene.content,
          canvas: reRendered,
          semanticDocument,
        },
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
  const openRepairSidebar = useCallback(() => {
    if (!canRepairCurrentSlide) return;

    if (slideEditorOpen) {
      setSlideEditTab('canvas');
      setSlideEditorSidebarTab('ai');
      setRepairSidebarFocusNonce((current) => current + 1);
      return;
    }

    setPendingRepairSidebarFocus(true);
    handleOpenSlideEditor();
  }, [canRepairCurrentSlide, handleOpenSlideEditor, slideEditorOpen]);

  const builtInTitleActions =
    canEditCurrentSlide ||
    slideEditorOpen ||
    canRepairCurrentSlide ||
    canRestoreCurrentSlide ||
    canRerenderCurrentSlide ? (
      <>
        {canRerenderCurrentSlide ? (
          <button
            type="button"
            onClick={handleRerenderCurrentSlide}
            disabled={gridReflowPending}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all',
              gridReflowPending
                ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/35'
                : 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-950/35 dark:text-violet-200 dark:hover:bg-violet-950/55',
            )}
            title="按 semanticDocument 重新生成当前页布局"
          >
            <RefreshCcw className="size-3.5" />
            {gridReflowPending ? '重新渲染中…' : '重新渲染'}
          </button>
        ) : null}

        {canRestoreCurrentSlide ? (
          <button
            type="button"
            onClick={handleRestorePreRepairSlide}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all',
              'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-950/35 dark:text-amber-100 dark:hover:bg-amber-950/55',
            )}
            title="恢复到 AI 重写前的版本"
          >
            <AlertTriangle className="size-3.5" />
            恢复重写前
          </button>
        ) : null}

        {canRepairCurrentSlide ? (
          <button
            type="button"
            onClick={openRepairSidebar}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all',
              slideEditorOpen && slideEditorSidebarTab === 'ai'
                ? 'border-sky-400 bg-sky-100 text-sky-900 shadow-sm dark:border-sky-400/45 dark:bg-sky-950/55 dark:text-sky-50'
                : 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-950/35 dark:text-sky-200 dark:hover:bg-sky-950/55',
            )}
            title="打开 AI 重写侧栏；与「编辑当前页」互斥，可在顶栏切换"
          >
            <Sparkles className="size-3.5" />
            AI 重写
          </button>
        ) : null}

        {canEditCurrentSlide || slideEditorOpen ? (
          <button
            type="button"
            onClick={() => {
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
            }}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all',
              slideEditorOpen && slideEditorSidebarTab === 'manual'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-950/35 dark:text-emerald-200 dark:hover:bg-emerald-950/55'
                : 'border-slate-200 bg-white/80 text-slate-700 hover:bg-slate-50 dark:border-white/[0.1] dark:bg-white/[0.05] dark:text-slate-200 dark:hover:bg-white/[0.08]',
            )}
          >
            <SquarePen className="size-3.5" />
            {slideEditorOpen && slideEditorSidebarTab === 'manual' ? '完成编辑' : '编辑当前页'}
          </button>
        ) : null}
      </>
    ) : null;

  const titleActions =
    headerActions || builtInTitleActions ? (
      <div className="flex items-center gap-2">
        {headerActions}
        {builtInTitleActions}
      </div>
    ) : null;

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
                {rawDataSubTab === 'slide' ? (
                  <div
                    className="flex flex-wrap gap-0.5 rounded-lg bg-white/5 p-0.5"
                    role="tablist"
                    aria-label="幻灯片原始数据视图"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={rawSlideDataView === 'generated'}
                      onClick={() => setRawSlideDataView('generated')}
                      className={cn(
                        'rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
                        rawSlideDataView === 'generated'
                          ? 'bg-white/15 text-white'
                          : 'text-slate-400 hover:text-slate-200',
                      )}
                    >
                      生成数据
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={rawSlideDataView === 'outline'}
                      onClick={() => setRawSlideDataView('outline')}
                      className={cn(
                        'rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
                        rawSlideDataView === 'outline'
                          ? 'bg-white/15 text-white'
                          : 'text-slate-400 hover:text-slate-200',
                      )}
                    >
                      大纲
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={rawSlideDataView === 'narration'}
                      onClick={() => setRawSlideDataView('narration')}
                      className={cn(
                        'rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
                        rawSlideDataView === 'narration'
                          ? 'bg-white/15 text-white'
                          : 'text-slate-400 hover:text-slate-200',
                      )}
                    >
                      讲解数据
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={rawSlideDataView === 'ui'}
                      onClick={() => setRawSlideDataView('ui')}
                      className={cn(
                        'rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
                        rawSlideDataView === 'ui'
                          ? 'bg-white/15 text-white'
                          : 'text-slate-400 hover:text-slate-200',
                      )}
                    >
                      UI计算
                    </button>
                    <button
                      type="button"
                      onClick={handleReflowCurrentGridScene}
                      disabled={!canReflowCurrentGridScene || gridReflowPending}
                      className={cn(
                        'rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
                        canReflowCurrentGridScene && !gridReflowPending
                          ? 'bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                          : 'cursor-not-allowed text-slate-500',
                      )}
                    >
                      {gridReflowPending ? '重排中…' : '仅重排 Grid'}
                    </button>
                    <button
                      type="button"
                      onClick={handleReflowCurrentLayoutCardsScene}
                      disabled={!canReflowCurrentLayoutCardsScene || gridReflowPending}
                      className={cn(
                        'rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
                        canReflowCurrentLayoutCardsScene && !gridReflowPending
                          ? 'bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30'
                          : 'cursor-not-allowed text-slate-500',
                      )}
                    >
                      {gridReflowPending ? '重排中…' : '仅重排 Layout Cards'}
                    </button>
                  </div>
                ) : null}
                <p className="ml-auto min-w-0 text-[10px] text-slate-500">
                  {t('stage.rawDataCaption')}
                </p>
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
              chatCollapsed={chatAreaCollapsed}
              onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
              onToggleChat={() => setChatAreaCollapsed(!chatAreaCollapsed)}
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
            onMessageSend={handleChatAreaQuestionSend}
            onDiscussionStart={() => {
              // User clicks "Join" on ProactiveCard
              engineRef.current?.confirmDiscussion();
            }}
            onDiscussionSkip={() => {
              // User clicks "Skip" on ProactiveCard
              engineRef.current?.skipDiscussion();
            }}
            onStopDiscussion={handleStopDiscussion}
            onInputActivate={handleSidebarInputActivate}
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
        onInputActivate={handleSidebarInputActivate}
        onMessageSend={handleChatAreaQuestionSend}
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

      <AlertDialog open={editEntryConfirmOpen} onOpenChange={setEditEntryConfirmOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>进入编辑模式？</AlertDialogTitle>
            <AlertDialogDescription>
              进入编辑会暂停当前讲解，并结束这页正在进行的互动或讨论。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void forceEnterSlideEditor()}>
              继续编辑
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
