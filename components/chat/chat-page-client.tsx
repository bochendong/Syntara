'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { UIMessage } from 'ai';
import {
  ArrowUp,
  BookOpen,
  FileText,
  Loader2,
  Paperclip,
  Presentation,
  Sparkles,
  X,
} from 'lucide-react';
import { ChatAttachmentBubble } from '@/components/chat/chat-attachment-bubble';
import { cn } from '@/lib/utils';
import {
  getStoredApplyNotebookWrites,
  subscribeApplyNotebookWrites,
} from '@/lib/utils/notebook-write-preference';
import {
  storeChatAttachmentBlob,
  deleteChatAttachmentBlob,
  hydrateMetadataAttachments,
} from '@/lib/utils/chat-attachment-blobs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  ComposerInputShell,
  composerTextareaClassName,
} from '@/components/ui/composer-input-shell';
import {
  ComposerVoiceSelector,
  GenerationModelSelector,
} from '@/components/generation/generation-toolbar';
import { SpeechButton } from '@/components/audio/speech-button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { useUserProfileStore } from '@/lib/store/user-profile';
import { useSettingsStore } from '@/lib/store/settings';
import { USER_AVATAR } from '@/lib/types/roundtable';
import type { ChatMessageMetadata, MessageAction } from '@/lib/types/chat';
import type { NotebookKnowledgeReference } from '@/lib/types/notebook-message';
import {
  applyNotebookPlan,
  planNotebookMessage,
  type NotebookPlanResult,
} from '@/lib/notebook/send-message';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import {
  listAgentsForCourse,
  toChatAgentConfig,
  type CourseAgentListItem,
} from '@/lib/utils/course-agents';
import { runCourseSideChatLoop } from '@/lib/chat/run-course-side-chat-loop';
import type { Scene } from '@/lib/types/stage';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { ThumbnailSlide } from '@/components/slide-renderer/components/ThumbnailSlide';
import { ScenePreviewDialog } from '@/components/slide-renderer/components/scene-preview-dialog';
import type { SettingsSection } from '@/lib/types/settings';
import { loadContactMessages, saveContactMessages } from '@/lib/utils/contact-chat-storage';
import {
  listStagesByCourse,
  loadStageData,
  saveStageData,
  type StageListItem,
} from '@/lib/utils/stage-storage';
import {
  createAgentTask,
  listAgentTasksByCourse,
  listChildTasks,
  listTasksForContact,
  updateAgentTask,
} from '@/lib/utils/agent-task-storage';
import {
  COURSE_ORCHESTRATOR_ID,
  COURSE_ORCHESTRATOR_NAME,
  resolveCourseOrchestratorAvatar,
} from '@/lib/constants/course-chat';
import type { ProtocolMessageEnvelope } from '@/lib/types/agent-chat-protocol';
import {
  runNotebookGenerationTask,
  type NotebookGenerationProgress,
} from '@/lib/create/run-notebook-generation-task';
import { useOrchestratorNotebookGenStore } from '@/lib/store/orchestrator-notebook-generation';
import {
  OrchestratorNotebookProgressPanel,
  OrchestratorRemoteTaskBanner,
} from '@/components/chat/orchestrator-notebook-progress';
import { NotebookContentView } from '@/components/notebook-content/notebook-content-view';
import {
  buildNotebookContentDocumentFromText,
  type NotebookContentDocument,
} from '@/lib/notebook-content';

type NotebookChatMessage =
  | {
      role: 'user';
      text: string;
      at: number;
      attachments?: ChatMessageMetadata['attachments'];
    }
  | {
      role: 'assistant';
      answer: string;
      answerDocument?: NotebookContentDocument;
      references: NotebookKnowledgeReference[];
      knowledgeGap: boolean;
      prerequisiteHints?: string[];
      webSearchUsed?: boolean;
      appliedLabel?: string;
      lessonSourceQuestion?: string;
      lessonDeckScenes?: Scene[];
      lessonSavedLabel?: string;
      lessonError?: string;
      at: number;
    };

type NotebookAttachmentInput = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  textExcerpt?: string;
  /** 原始文件；PDF / Markdown 可在总控创建时进入完整笔记本生成管线 */
  file?: File;
};

type OrchestratorChildTaskView = {
  id: string;
  title: string;
  detail?: string;
  status: 'running' | 'waiting' | 'done' | 'failed';
  contactId: string;
  updatedAt: number;
  lastEnvelope?: ProtocolMessageEnvelope;
};

function shouldOfferMicroLessonButton(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.length >= 700) return true;
  if (/```|def\s+\w+\(|class\s+\w+|big\s*o|复杂度|quicksort|quick sort|递归|算法/i.test(t))
    return true;
  const lines = t.split(/\r?\n/).filter((l) => l.trim() !== '');
  return lines.length >= 18;
}

const NOTEBOOK_CHAT_PREVIEW_EVENT = 'openmaic-notebook-chat-updated';

type NotebookRouteDecision =
  | { type: 'create' }
  | { type: 'single'; notebook: StageListItem }
  | { type: 'multi'; notebooks: StageListItem[] };

type OrchestratorViewMode = 'private' | 'group';

/** 课程总控私聊：生成笔记本走完整管线；发送消息为向总控直接问答，不自动创建笔记本 */
type OrchestratorComposerMode = 'generate-notebook' | 'send-message';

type NotebookSubtaskResult = {
  notebook: StageListItem;
  answer: string;
  appliedLabel?: string;
  knowledgeGap: boolean;
};

function messageText(m: UIMessage<ChatMessageMetadata>) {
  return m.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

function formatAppliedSummary(result: {
  applied?: {
    insertedPageRange?: string;
    updatedPages?: number[];
    deletedPages?: number[];
  } | null;
}) {
  const a = result.applied;
  if (!a) return '';
  const bits: string[] = [];
  if (a.insertedPageRange) bits.push(`已插入页：${a.insertedPageRange}`);
  if (a.updatedPages?.length) bits.push(`已更新页：${a.updatedPages.join(', ')}`);
  if (a.deletedPages?.length) bits.push(`已删除页：${a.deletedPages.join(', ')}`);
  return bits.join(' · ') || '';
}

function hasNotebookWrites(plan: Pick<NotebookPlanResult, 'operations'>): boolean {
  return (
    (plan.operations.insert?.length || 0) > 0 ||
    (plan.operations.update?.length || 0) > 0 ||
    (plan.operations.delete?.length || 0) > 0
  );
}

/** 将用户文字与附件摘录合并，供总控路由与创建笔记本生成使用 */
function mergeOrchestratorPrompt(
  text: string,
  attachments: NotebookAttachmentInput[],
  skipPdfExcerptForFullPipeline = false,
): string {
  const t = text.trim();
  const useAttach = skipPdfExcerptForFullPipeline
    ? attachments.filter(
        (a) =>
          !(
            a.mimeType === 'application/pdf' ||
            a.name.toLowerCase().endsWith('.pdf') ||
            a.mimeType === 'text/markdown' ||
            a.mimeType === 'text/x-markdown' ||
            a.name.toLowerCase().endsWith('.md')
          ),
      )
    : attachments;
  if (useAttach.length === 0) {
    return t || (skipPdfExcerptForFullPipeline ? '请根据上传的文档创建笔记本。' : '');
  }
  const blocks = useAttach.map((a) => {
    const excerpt = a.textExcerpt?.trim();
    return `【附件：${a.name}】\n${excerpt || '（未能提取文本，请结合文件名与上方说明理解需求。）'}`;
  });
  if (!t) {
    return `请根据以下上传材料创建或组织笔记本内容：\n\n${blocks.join('\n\n')}`;
  }
  return `${t}\n\n---\n参考材料：\n\n${blocks.join('\n\n')}`;
}

function buildChatMessage(
  text: string,
  options: {
    senderName: string;
    senderAvatar?: string | null;
    originalRole?: ChatMessageMetadata['originalRole'];
    actions?: MessageAction[];
    attachments?: ChatMessageMetadata['attachments'];
  },
): UIMessage<ChatMessageMetadata> {
  const now = Date.now();
  return {
    id: `msg-${now}-${Math.random().toString(36).slice(2, 8)}`,
    role: options.originalRole === 'user' ? 'user' : 'assistant',
    parts: [{ type: 'text', text }],
    metadata: {
      senderName: options.senderName,
      senderAvatar: options.senderAvatar || undefined,
      originalRole: options.originalRole || 'agent',
      createdAt: now,
      actions: options.actions,
      attachments: options.attachments,
    },
  };
}

function appendNotebookAnswerCallout(args: {
  document?: NotebookContentDocument;
  fallbackText: string;
  tone: 'info' | 'success' | 'warning' | 'danger' | 'tip';
  title?: string;
  text: string;
}): NotebookContentDocument {
  const base =
    args.document ||
    buildNotebookContentDocumentFromText({
      text: args.fallbackText,
    });
  return {
    ...base,
    blocks: [
      ...base.blocks,
      {
        type: 'callout',
        tone: args.tone,
        title: args.title,
        text: args.text,
      },
    ],
  };
}

const ATTACHMENT_ONLY_PLACEHOLDER = '（已上传附件）';

function stripAttachmentUrlsFromAgentMessages(
  messages: UIMessage<ChatMessageMetadata>[],
): UIMessage<ChatMessageMetadata>[] {
  return messages.map((m) => {
    if (!m.metadata?.attachments?.length) return m;
    return {
      ...m,
      metadata: {
        ...m.metadata,
        attachments: m.metadata.attachments.map(({ objectUrl: _u, ...rest }) => rest),
      },
    };
  });
}

function stripAttachmentUrlsFromNotebookMessages(
  messages: NotebookChatMessage[],
): NotebookChatMessage[] {
  return messages.map((m) => {
    if (m.role !== 'user' || !m.attachments?.length) return m;
    return {
      ...m,
      attachments: m.attachments.map(({ objectUrl: _u, ...rest }) => rest),
    };
  });
}

async function hydrateNotebookThread(
  messages: NotebookChatMessage[],
): Promise<NotebookChatMessage[]> {
  const out: NotebookChatMessage[] = [];
  for (const m of messages) {
    if (m.role !== 'user' || !m.attachments?.length) {
      out.push(m);
      continue;
    }
    const attachments = await hydrateMetadataAttachments(m.attachments);
    out.push({ ...m, attachments });
  }
  return out;
}

async function hydrateAgentThread(
  messages: UIMessage<ChatMessageMetadata>[],
): Promise<UIMessage<ChatMessageMetadata>[]> {
  return Promise.all(
    messages.map(async (m) => {
      if (!m.metadata?.attachments?.length) return m;
      const attachments = await hydrateMetadataAttachments(m.metadata.attachments);
      return { ...m, metadata: { ...m.metadata, attachments } };
    }),
  );
}

function revokeNotebookAttachmentUrls(thread: NotebookChatMessage[]) {
  for (const m of thread) {
    if (m.role === 'user' && m.attachments) {
      for (const a of m.attachments) {
        if (a.objectUrl) URL.revokeObjectURL(a.objectUrl);
      }
    }
  }
}

function revokeAgentAttachmentUrls(thread: UIMessage<ChatMessageMetadata>[]) {
  for (const m of thread) {
    m.metadata?.attachments?.forEach((a) => {
      if (a.objectUrl) URL.revokeObjectURL(a.objectUrl);
    });
  }
}

function InlineLessonDeck({
  scenes,
  onSave,
  saving,
  savedLabel,
}: {
  scenes: Scene[];
  onSave: () => void;
  saving: boolean;
  savedLabel?: string;
}) {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [narrationError, setNarrationError] = useState<string | null>(null);
  const [narrationMode, setNarrationMode] = useState<'script' | 'fallback'>('script');
  /** API TTS：从请求到开始播放前的等待态（浏览器原生 TTS 无此阶段） */
  const [ttsGenerating, setTtsGenerating] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const playbackRequestRef = useRef(0);
  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled);
  const ttsMuted = useSettingsStore((s) => s.ttsMuted);
  const ttsVolume = useSettingsStore((s) => s.ttsVolume);
  const ttsSpeed = useSettingsStore((s) => s.ttsSpeed);
  const ttsProviderId = useSettingsStore((s) => s.ttsProviderId);
  const ttsVoice = useSettingsStore((s) => s.ttsVoice);
  const ttsProvidersConfig = useSettingsStore((s) => s.ttsProvidersConfig);
  const slideScenes = useMemo(
    () => scenes.filter((s) => s.type === 'slide' && s.content.type === 'slide'),
    [scenes],
  );
  const total = slideScenes.length;
  const current = slideScenes[Math.max(0, Math.min(idx, total - 1))];

  useEffect(() => {
    setIdx(0);
  }, [total]);

  useEffect(() => {
    if (!playing) setTtsGenerating(false);
  }, [playing]);

  useEffect(() => {
    if (!playing) return;
    const requestId = ++playbackRequestRef.current;
    const stopAudio = () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
    const advanceOrStop = () => {
      setIdx((i) => {
        if (i >= total - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    };
    const isStale = () => playbackRequestRef.current !== requestId;

    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setNarrationError('当前浏览器不支持语音播放');
      setPlaying(false);
      return;
    }
    if (!ttsEnabled || ttsMuted || ttsVolume <= 0) {
      setNarrationError('语音播放已关闭，请先在设置中开启 TTS');
      setPlaying(false);
      return;
    }
    const scene = slideScenes[Math.max(0, Math.min(idx, total - 1))];
    if (!scene || scene.content.type !== 'slide') {
      setPlaying(false);
      return;
    }
    const narration = getSceneNarration(scene);
    const text = narration.text.slice(0, 1800);
    if (!text.trim()) {
      setPlaying(false);
      return;
    }
    setNarrationMode(narration.mode);
    setNarrationError(null);
    setTtsGenerating(false);
    window.speechSynthesis.cancel();
    stopAudio();

    if (ttsProviderId === 'browser-native-tts') {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      utterance.rate = Math.max(0.6, Math.min(2, ttsSpeed || 1));
      utterance.volume = Math.max(0, Math.min(1, ttsVolume));
      if (ttsVoice && ttsVoice !== 'default') {
        const voices = window.speechSynthesis.getVoices();
        const selected = voices.find((v) => v.voiceURI === ttsVoice || v.name === ttsVoice);
        if (selected) utterance.voice = selected;
      }
      utterance.onend = () => {
        if (isStale()) return;
        advanceOrStop();
      };
      utterance.onerror = () => {
        if (isStale()) return;
        setNarrationError('语音播放失败，请重试');
        setPlaying(false);
      };
      window.speechSynthesis.speak(utterance);
    } else {
      setTtsGenerating(true);
      const providerConfig = ttsProvidersConfig[ttsProviderId];
      void (async () => {
        try {
          const response = await fetch('/api/generate/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text,
              audioId: `inline_lesson_${Date.now()}_${idx}`,
              ttsProviderId,
              ttsVoice,
              ttsSpeed,
              ttsApiKey: providerConfig?.apiKey || undefined,
              ttsBaseUrl: providerConfig?.baseUrl || undefined,
            }),
          });
          const data = (await response.json().catch(() => ({}))) as {
            base64?: string;
            format?: string;
            error?: string;
          };
          if (!response.ok || !data.base64) {
            throw new Error(data.error || '语音生成失败');
          }
          if (isStale()) {
            setTtsGenerating(false);
            return;
          }
          setTtsGenerating(false);
          const url = base64ToObjectUrl(data.base64, data.format || 'mp3');
          audioUrlRef.current = url;
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.volume = Math.max(0, Math.min(1, ttsVolume));
          audio.onended = () => {
            if (isStale()) return;
            stopAudio();
            advanceOrStop();
          };
          audio.onerror = () => {
            if (isStale()) return;
            stopAudio();
            setNarrationError('语音播放失败，请重试');
            setPlaying(false);
          };
          await audio.play();
        } catch (error) {
          setTtsGenerating(false);
          if (isStale()) return;
          setNarrationError(error instanceof Error ? error.message : '语音生成失败，请重试');
          setPlaying(false);
        }
      })();
    }
    return () => {
      window.speechSynthesis.cancel();
      stopAudio();
      setTtsGenerating(false);
    };
  }, [
    playing,
    idx,
    slideScenes,
    total,
    ttsEnabled,
    ttsMuted,
    ttsVolume,
    ttsSpeed,
    ttsProviderId,
    ttsVoice,
    ttsProvidersConfig,
  ]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      playbackRequestRef.current += 1;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, []);

  if (!current || current.content.type !== 'slide') return null;

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-2">
        <ScenePreviewDialog
          scene={current}
          description="临时讲解PPT预览。播放时优先使用讲解脚本，支持上下页与保存到笔记本。"
          topBar={
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium text-muted-foreground">
                  临时讲解PPT · {idx + 1}/{total}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => setIdx((i) => Math.max(0, i - 1))}
                    disabled={idx <= 0}
                  >
                    上一页
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
                    disabled={idx >= total - 1}
                  >
                    下一页
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => {
                      playbackRequestRef.current += 1;
                      if (audioRef.current) {
                        audioRef.current.pause();
                        audioRef.current = null;
                      }
                      if (audioUrlRef.current) {
                        URL.revokeObjectURL(audioUrlRef.current);
                        audioUrlRef.current = null;
                      }
                      if (playing && typeof window !== 'undefined' && window.speechSynthesis) {
                        window.speechSynthesis.cancel();
                      }
                      setPlaying((v) => !v);
                    }}
                    disabled={!ttsEnabled || ttsMuted || ttsVolume <= 0}
                  >
                    {playing ? '暂停' : '播放'}
                  </Button>
                </div>
              </div>
              {ttsGenerating ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-1.5 rounded-md border border-violet-200/80 bg-violet-50/80 px-2 py-1 text-[11px] text-violet-800 dark:border-violet-800/60 dark:bg-violet-950/40 dark:text-violet-200"
                >
                  <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
                  <span>正在生成语音，请稍候…</span>
                </div>
              ) : null}
            </div>
          }
          bottomBar={
            <div>
              <p className="truncate text-[11px] text-muted-foreground">{current.title}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {narrationMode === 'script'
                  ? '按讲解脚本播放'
                  : '当前页缺少讲解脚本，已回退为页面摘要朗读'}
              </p>
              {narrationError ? (
                <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                  {narrationError}
                </p>
              ) : null}
            </div>
          }
          trigger={
            <button
              type="button"
              aria-label="打开临时讲解PPT"
              className="flex w-full max-w-[min(100%,280px)] items-center gap-2.5 rounded-[10px] border border-slate-200/90 bg-white p-2 pr-2.5 text-left text-slate-900 shadow-sm transition-[transform,box-shadow] hover:shadow-md active:scale-[0.99] dark:border-slate-600/60 dark:bg-slate-900/50 dark:text-slate-100"
            >
              <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-[#f5e6e8] text-[#e64340] dark:bg-[#3d2528] dark:text-[#ff6b6b]">
                <Presentation className="size-6" strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1 py-0.5">
                <p className="line-clamp-2 text-[13px] font-medium leading-snug text-slate-900 dark:text-slate-100">
                  临时讲解PPT
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  点击展开预览（{total} 页）
                </p>
              </div>
            </button>
          }
        />
        <Button
          type="button"
          size="sm"
          className="h-8 shrink-0 px-3 text-[11px]"
          onClick={onSave}
          disabled={saving || !!savedLabel}
        >
          {savedLabel ? '已保存到笔记本' : saving ? '保存中…' : '保存到笔记本'}
        </Button>
      </div>
      {savedLabel ? (
        <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">{savedLabel}</p>
      ) : null}
    </div>
  );
}

function tokenizeForMatch(input: string): string[] {
  const lowered = input.toLowerCase();
  const zhTokens = lowered.match(/[\u4e00-\u9fff]{2,}/g) || [];
  const latinTokens = lowered.match(/[a-z0-9][a-z0-9-]{1,}/g) || [];
  return Array.from(new Set([...zhTokens, ...latinTokens]));
}

function scoreNotebookMatch(message: string, notebook: StageListItem): number {
  const haystack = [notebook.name, notebook.description || '', ...(notebook.tags || [])]
    .join(' ')
    .toLowerCase();
  const tokens = tokenizeForMatch(message);
  let score = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) score += token.length >= 4 ? 3 : 2;
  }
  if (!tokens.length && haystack.includes(message.toLowerCase().trim())) score += 2;
  return score;
}

function stripHtmlTags(input: string): string {
  return input
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sceneSearchText(scene: Scene): string {
  const title = scene.title || '';
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

function getSceneNarration(scene: Scene): { text: string; mode: 'script' | 'fallback' } {
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

function base64ToObjectUrl(base64: string, format: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: `audio/${format || 'mp3'}` });
  return URL.createObjectURL(blob);
}

function summarizeQuestionForContext(input?: string): string {
  const text = (input || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > 38 ? `${text.slice(0, 38)}…` : text;
}

function attachQuestionContextToFirstScene(scene: Scene, questionSummary: string): Scene {
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

function pickSmartInsertIndex(current: Scene[], lessonScenes: Scene[]): number {
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

async function pickInsertIndexWithAI(args: {
  notebookTitle?: string;
  currentScenes: Scene[];
  lessonScenes: Scene[];
}): Promise<{ insertAt: number; reason?: string } | null> {
  if (args.currentScenes.length === 0) return { insertAt: 0, reason: 'empty notebook' };
  try {
    const mc = getCurrentModelConfig();
    const resp = await fetch('/api/notebooks/micro-lesson/insert-position', {
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
    });
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

function decideNotebookRoute(
  message: string,
  notebooks: StageListItem[],
  mode: OrchestratorViewMode,
  hasAttachments: boolean,
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

  const ranked = notebooks
    .map((notebook) => ({ notebook, score: scoreNotebookMatch(text, notebook) }))
    .sort((a, b) => b.score - a.score || b.notebook.updatedAt - a.notebook.updatedAt);

  const broadIntent = /(综合|比较|对比|串联|跨|多个|协作|整体|全局|一起)/i.test(text);
  const positive = ranked.filter((item) => item.score > 0);

  if (
    broadIntent ||
    (positive.length >= 2 && (positive[1].score >= positive[0].score || positive[0].score <= 2))
  ) {
    return {
      type: 'multi',
      notebooks: (positive.length ? positive : ranked).slice(0, 3).map((x) => x.notebook),
    };
  }

  return { type: 'single', notebook: (positive[0] || ranked[0]).notebook };
}

function actionHref(actionId: string): string | null {
  if (actionId.startsWith('open-notebook:')) {
    return `/classroom/${encodeURIComponent(actionId.replace('open-notebook:', ''))}`;
  }
  if (actionId.startsWith('open-agent:')) {
    return `/chat?agent=${encodeURIComponent(actionId.replace('open-agent:', ''))}`;
  }
  return null;
}

function isImageAvatarUrl(src: string | undefined | null): boolean {
  if (!src) return false;
  return (
    src.startsWith('/') ||
    src.startsWith('http://') ||
    src.startsWith('https://') ||
    src.startsWith('data:')
  );
}

/** 当前用户头像（侧气泡右侧） */
function ChatUserAvatar({
  src,
  displayName,
  className,
}: {
  src?: string | null;
  displayName: string;
  className?: string;
}) {
  const resolved = src?.trim() || USER_AVATAR;
  if (isImageAvatarUrl(resolved)) {
    return (
      <img
        src={resolved}
        alt=""
        className={cn(
          'size-9 shrink-0 rounded-full object-cover ring-1 ring-black/5 dark:ring-white/10',
          className,
        )}
      />
    );
  }
  return (
    <div
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground ring-1 ring-black/5 dark:ring-white/10',
        className,
      )}
      aria-hidden
    >
      {displayName.trim().slice(0, 1) || '我'}
    </div>
  );
}

/** 笔记本「助手」侧头像（左侧，方角与侧栏笔记本一致） */
function NotebookPeerAvatar({
  avatarUrl,
  notebookName,
}: {
  avatarUrl?: string | null;
  notebookName: string;
}) {
  if (avatarUrl && isImageAvatarUrl(avatarUrl)) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className="size-9 shrink-0 rounded-xl object-cover ring-1 ring-black/5 dark:ring-white/10"
      />
    );
  }
  return (
    <div
      className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-50 dark:border-white/10 dark:bg-white/5"
      title={notebookName}
    >
      <BookOpen className="size-4 text-slate-400" strokeWidth={1.75} />
    </div>
  );
}

/** Agent 回复侧头像 */
function AgentPeerAvatar({
  avatarSrc,
  agentName,
}: {
  avatarSrc?: string | null;
  agentName: string;
}) {
  const src = avatarSrc?.trim() || '';
  if (isImageAvatarUrl(src)) {
    return (
      <img
        src={src}
        alt=""
        className="size-9 shrink-0 rounded-full object-cover ring-1 ring-black/5 dark:ring-white/10"
      />
    );
  }
  return (
    <div
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-sm font-medium text-violet-800 ring-1 ring-black/5 dark:text-violet-200 dark:ring-white/10"
      title={agentName}
      aria-hidden
    >
      {src && !isImageAvatarUrl(src) ? src.slice(0, 1) : agentName.slice(0, 1) || 'A'}
    </div>
  );
}

const TEXT_LIKE_MIME_PREFIXES = ['text/', 'application/json', 'application/xml'];
const TEXT_LIKE_FILE_EXT = [
  '.md',
  '.txt',
  '.csv',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.py',
  '.java',
  '.go',
  '.rs',
  '.sql',
  '.yaml',
  '.yml',
];

function isTextLikeFile(file: File): boolean {
  const mime = file.type || '';
  if (TEXT_LIKE_MIME_PREFIXES.some((p) => mime.startsWith(p))) return true;
  const lower = file.name.toLowerCase();
  return TEXT_LIKE_FILE_EXT.some((ext) => lower.endsWith(ext));
}

function isNotebookPipelineSourceFile(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  const lower = file.name.toLowerCase();
  return (
    mime === 'application/pdf' ||
    lower.endsWith('.pdf') ||
    mime === 'text/markdown' ||
    mime === 'text/x-markdown' ||
    lower.endsWith('.md')
  );
}

async function extractTextExcerpt(file: File): Promise<string | undefined> {
  if (!isTextLikeFile(file)) return undefined;
  try {
    const raw = await file.text();
    const cleaned = raw.replace(/\u0000/g, '').trim();
    if (!cleaned) return undefined;
    return cleaned.slice(0, 6000);
  } catch {
    return undefined;
  }
}

function formatTs(ts?: number): string {
  if (!ts) return 'N/A';
  return new Date(ts).toLocaleString();
}

function isMockTaskLike(task: { title?: string | null; detail?: string | null }): boolean {
  const title = task.title || '';
  const detail = task.detail || '';
  return /mock/i.test(title) || /\[mock\]/i.test(detail);
}

function isMockAgentMessage(message: UIMessage<ChatMessageMetadata>): boolean {
  const text = messageText(message);
  return /^【Mock\s*流程/.test(text) || /^\[Mock\]/i.test(text);
}

/** 与 send-message 中 toSceneBrief 一致：第 N 节 ↔ scene.order === N - 1 */
function sceneForNotebookReferenceOrder(scenes: Scene[], refOrder: number): Scene | undefined {
  return scenes.find((s) => s.order === refOrder - 1);
}

function NotebookReferencePreviewLi({
  reference,
  scenes,
  scenesLoading,
}: {
  reference: NotebookKnowledgeReference;
  scenes: Scene[];
  scenesLoading: boolean;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const scene = useMemo(
    () => sceneForNotebookReferenceOrder(scenes, reference.order),
    [scenes, reference.order],
  );

  return (
    <li>
      <HoverCard openDelay={280} closeDelay={80}>
        <HoverCardTrigger asChild>
          <span
            className="cursor-help border-b border-dotted border-muted-foreground/45 transition-colors hover:border-foreground/35 hover:text-foreground"
            tabIndex={0}
            onClick={() => setPreviewOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setPreviewOpen(true);
              }
            }}
          >
            <span className="font-medium text-foreground">
              第 {reference.order} 节 · {reference.title}
            </span>
            {reference.why ? <span> — {reference.why}</span> : null}
          </span>
        </HoverCardTrigger>
        <HoverCardContent
          side="right"
          align="start"
          className="z-[80] w-auto max-w-[min(92vw,320px)] border border-slate-900/[0.08] bg-white/95 p-2 text-xs shadow-lg dark:border-white/[0.12] dark:bg-[#1c1c1e]/95"
        >
          {scenesLoading ? (
            <p className="px-1 py-2 text-muted-foreground">正在加载该页预览…</p>
          ) : !scene ? (
            <p className="px-1 py-2 text-muted-foreground">
              未找到第 {reference.order} 节（可能已调整页序）。
            </p>
          ) : scene.content.type === 'slide' ? (
            <div className="overflow-hidden rounded-[10px] ring-1 ring-black/[0.06] dark:ring-white/[0.1]">
              <ThumbnailSlide
                slide={scene.content.canvas}
                size={240}
                viewportSize={scene.content.canvas.viewportSize ?? 1000}
                viewportRatio={scene.content.canvas.viewportRatio ?? 0.5625}
              />
            </div>
          ) : (
            <p className="max-w-[240px] px-1 py-2 text-muted-foreground">
              该页为
              {scene.type === 'quiz'
                ? '测验'
                : scene.type === 'interactive'
                  ? '交互'
                  : scene.type === 'pbl'
                    ? '项目式学习'
                    : '非幻灯片'}
              ，暂无幻灯片缩略图。
            </p>
          )}
        </HoverCardContent>
      </HoverCard>
      <Dialog modal={false} open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent
          showOverlay={false}
          showCloseButton={false}
          className="w-[min(92vw,860px)] max-w-[860px] overflow-hidden p-4"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>
              第 {reference.order} 节 · {reference.title}
            </DialogTitle>
            <DialogDescription>{reference.why || '仅预览该页 slides 内容。'}</DialogDescription>
          </DialogHeader>
          <DialogClose
            className={cn(
              'absolute right-3 top-3 z-20 inline-flex size-8 items-center justify-center rounded-full',
              'border border-slate-900/[0.08] bg-white/78 text-slate-700 backdrop-blur-md transition-all',
              'hover:bg-white hover:text-slate-900 hover:shadow-sm',
              'dark:border-white/[0.14] dark:bg-black/45 dark:text-slate-200 dark:hover:bg-black/65 dark:hover:text-white',
            )}
            aria-label="关闭预览"
          >
            <X className="size-4" />
          </DialogClose>
          <div className="mt-2 flex items-center justify-center overflow-auto rounded-[12px] border border-slate-900/[0.08] bg-white/85 p-2 dark:border-white/[0.1] dark:bg-black/30">
            {scenesLoading ? (
              <p className="px-2 py-6 text-sm text-muted-foreground">正在加载该页预览…</p>
            ) : !scene ? (
              <p className="px-2 py-6 text-sm text-muted-foreground">
                未找到第 {reference.order} 节（可能已调整页序）。
              </p>
            ) : scene.content.type === 'slide' ? (
              <ThumbnailSlide
                slide={scene.content.canvas}
                size={760}
                viewportSize={scene.content.canvas.viewportSize ?? 1000}
                viewportRatio={scene.content.canvas.viewportRatio ?? 0.5625}
              />
            ) : (
              <p className="px-2 py-6 text-sm text-muted-foreground">
                该页为
                {scene.type === 'quiz'
                  ? '测验'
                  : scene.type === 'interactive'
                    ? '交互'
                    : scene.type === 'pbl'
                      ? '项目式学习'
                      : '非幻灯片'}
                ，暂无幻灯片可预览。
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </li>
  );
}

export function ChatPageClient() {
  const { t } = useI18n();
  const router = useRouter();
  const openSettings = (section?: SettingsSection) => {
    if (section) {
      router.push(`/settings?section=${encodeURIComponent(section)}`);
    } else {
      router.push('/settings');
    }
  };
  const searchParams = useSearchParams();
  const courseId = useCurrentCourseStore((s) => s.id);
  const courseAvatarUrlStored = useCurrentCourseStore((s) => s.avatarUrl);
  const orchestratorAvatar = useMemo(
    () => resolveCourseOrchestratorAvatar(courseId, courseAvatarUrlStored),
    [courseId, courseAvatarUrlStored],
  );
  const notebookId = searchParams.get('notebook');
  const agentId = searchParams.get('agent');
  const chatView = searchParams.get('view');

  const nickname = useUserProfileStore((s) => s.nickname);
  const userAvatar = useUserProfileStore((s) => s.avatar);

  const [stageMeta, setStageMeta] = useState<{
    id: string;
    name: string;
    avatarUrl?: string | null;
  } | null>(null);
  const [notebookScenes, setNotebookScenes] = useState<Scene[]>([]);
  const [notebookScenesLoading, setNotebookScenesLoading] = useState(false);
  const [agents, setAgents] = useState<CourseAgentListItem[]>([]);
  const [nbThread, setNbThread] = useState<NotebookChatMessage[]>([]);
  const [nbThreadHydrated, setNbThreadHydrated] = useState(false);
  const [agThread, setAgThread] = useState<UIMessage<ChatMessageMetadata>[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [applyNotebookWrites, setApplyNotebookWrites] = useState(true);
  useEffect(() => {
    setApplyNotebookWrites(getStoredApplyNotebookWrites());
    return subscribeApplyNotebookWrites(() => {
      setApplyNotebookWrites(getStoredApplyNotebookWrites());
    });
  }, []);
  const [pendingAttachments, setPendingAttachments] = useState<NotebookAttachmentInput[]>([]);
  const [lessonGeneratingAt, setLessonGeneratingAt] = useState<number | null>(null);
  const [lessonSavingAt, setLessonSavingAt] = useState<number | null>(null);
  const agThreadRef = useRef(agThread);
  const nbThreadRef = useRef(nbThread);
  agThreadRef.current = agThread;
  nbThreadRef.current = nbThread;
  const [pickContactDone, setPickContactDone] = useState(false);
  const [contactTaskHint, setContactTaskHint] = useState<string | null>(null);
  const [activeOrchestratorTaskId, setActiveOrchestratorTaskId] = useState<string | null>(null);
  const [orchestratorChildTasks, setOrchestratorChildTasks] = useState<OrchestratorChildTaskView[]>(
    [],
  );
  const [selectedChildTaskId, setSelectedChildTaskId] = useState<string | null>(null);
  /** 总控创建笔记本：与右侧「进行中」任务同步的进度文案 */
  const [orchestratorPipelineProgress, setOrchestratorPipelineProgress] =
    useState<NotebookGenerationProgress | null>(null);
  /** 本地进度丢失时，与右侧「进行中」同步的总控创建任务（轮询 API） */
  const [orchestratorRemoteTask, setOrchestratorRemoteTask] = useState<{
    detail: string;
    notebookId?: string;
  } | null>(null);
  const [orchestratorComposerMode, setOrchestratorComposerMode] =
    useState<OrchestratorComposerMode>('send-message');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const comp = searchParams.get('composer');
    if (comp !== 'generate-notebook' && comp !== 'send-message') return;
    if (agentId !== COURSE_ORCHESTRATOR_ID) return;
    setOrchestratorComposerMode(comp as OrchestratorComposerMode);
  }, [searchParams, agentId]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** 总控「创建笔记本」任务 id，用于轮询检测完成并补发气泡 */
  const trackedOrchestratorCreateTaskIdRef = useRef<string | null>(null);
  const orchestratorCompletionAnnouncedRef = useRef<string | null>(null);

  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === agentId) ?? null,
    [agents, agentId],
  );
  const selectedChildTask = useMemo(
    () => orchestratorChildTasks.find((t) => t.id === selectedChildTaskId) || null,
    [orchestratorChildTasks, selectedChildTaskId],
  );
  const isCourseOrchestrator = agentId === COURSE_ORCHESTRATOR_ID;
  const orchestratorViewMode: OrchestratorViewMode =
    isCourseOrchestrator && chatView === 'group' ? 'group' : 'private';
  const shouldRenderGroupReplies = isCourseOrchestrator && orchestratorViewMode === 'group';
  const agentConversationTargetId =
    isCourseOrchestrator && agentId
      ? orchestratorViewMode === 'group'
        ? `${agentId}::group`
        : `${agentId}::private`
      : agentId;

  const mode = notebookId
    ? ('notebook' as const)
    : agentId
      ? ('agent' as const)
      : ('none' as const);

  useEffect(() => {
    if (!courseId) return;
    let alive = true;
    (async () => {
      const ags = await listAgentsForCourse(courseId);
      if (!alive) return;
      setAgents([
        {
          id: COURSE_ORCHESTRATOR_ID,
          name: COURSE_ORCHESTRATOR_NAME,
          avatar: orchestratorAvatar,
          role: 'teacher',
          persona: '课程总控，会并行调度本课程笔记本完成任务。',
          color: '#7c3aed',
          priority: 100,
          isGenerated: false,
        },
        ...ags,
      ]);
    })();
    return () => {
      alive = false;
    };
  }, [courseId, orchestratorAvatar]);

  useEffect(() => {
    const nb = searchParams.get('notebook');
    const ag = searchParams.get('agent');
    if (nb && ag) {
      router.replace(`/chat?notebook=${encodeURIComponent(nb)}`);
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (!courseId) {
      setPickContactDone(true);
      return;
    }
    const nb = searchParams.get('notebook');
    const ag = searchParams.get('agent');
    if (nb || ag) {
      setPickContactDone(true);
      return;
    }
    let cancelled = false;
    setPickContactDone(false);
    (async () => {
      await listStagesByCourse(courseId);
      await listAgentsForCourse(courseId);
      if (cancelled) return;
      const next = new URLSearchParams();
      next.set('agent', COURSE_ORCHESTRATOR_ID);
      const v = searchParams.get('view');
      if (v) next.set('view', v);
      const comp = searchParams.get('composer');
      if (comp === 'generate-notebook' || comp === 'send-message') next.set('composer', comp);
      router.replace(`/chat?${next.toString()}`);
      setPickContactDone(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, router, searchParams]);

  useEffect(() => {
    if (!courseId || !agentId) return;
    if (agents.length === 0) return;
    if (!agents.some((a) => a.id === agentId)) {
      router.replace('/chat');
    }
  }, [courseId, agentId, agents, router]);

  useEffect(() => {
    if (!notebookId) {
      setNotebookScenes([]);
      setNotebookScenesLoading(false);
    }
  }, [notebookId]);

  useEffect(() => {
    // 切换笔记本时先清空，避免旧线程被保存到新 notebook 会话
    setNbThread([]);
    setNbThreadHydrated(false);
  }, [notebookId]);

  useEffect(() => {
    if (!notebookId || !courseId) {
      setStageMeta(null);
      return;
    }
    let alive = true;
    listStagesByCourse(courseId).then((stages) => {
      if (!alive) return;
      const st = stages.find((s) => s.id === notebookId);
      if (!st || st.courseId !== courseId) {
        setStageMeta(null);
        router.replace('/chat');
        return;
      }
      setStageMeta({ id: st.id, name: st.name, avatarUrl: st.avatarUrl });
    });
    return () => {
      alive = false;
    };
  }, [notebookId, courseId, router]);

  const reloadNotebookScenes = useCallback(async () => {
    if (!notebookId) {
      setNotebookScenes([]);
      return;
    }
    setNotebookScenesLoading(true);
    try {
      const data = await loadStageData(notebookId);
      const list = data?.scenes?.slice().sort((a, b) => a.order - b.order) ?? [];
      setNotebookScenes(list);
    } finally {
      setNotebookScenesLoading(false);
    }
  }, [notebookId]);

  const generateInlineLessonDeck = useCallback(
    async (targetAt: number) => {
      const msg = nbThreadRef.current.find((m) => m.role === 'assistant' && m.at === targetAt);
      if (!msg || msg.role !== 'assistant' || !msg.lessonSourceQuestion) return;
      let taskId: string | null = null;
      if (courseId && notebookId) {
        try {
          taskId = await createAgentTask({
            courseId,
            contactKind: 'notebook',
            contactId: notebookId,
            title: `临时PPT生成：${msg.lessonSourceQuestion.slice(0, 24)}`,
            detail: '正在把题目整理为 3-5 页临时PPT…',
            status: 'running',
          });
        } catch {
          taskId = null;
        }
      }
      setLessonGeneratingAt(targetAt);
      try {
        const mc = getCurrentModelConfig();
        const resp = await fetch('/api/notebooks/micro-lesson', {
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
            question: msg.lessonSourceQuestion,
            language: 'zh-CN',
          }),
        });
        const data = (await resp.json()) as {
          success?: boolean;
          scenes?: Scene[];
          data?: { scenes?: Scene[] };
          error?: string;
          details?: string;
        };
        const scenes = data?.scenes || data?.data?.scenes || [];
        if (!resp.ok || data?.success === false || scenes.length === 0) {
          const backendMsg = data?.error?.trim() || data?.details?.trim();
          throw new Error(backendMsg || '生成临时PPT失败，请重试');
        }
        setNbThread((prev) =>
          prev.map((m) =>
            m.role === 'assistant' && m.at === targetAt
              ? { ...m, lessonDeckScenes: scenes, lessonError: undefined }
              : m,
          ),
        );
        if (taskId) {
          await updateAgentTask(taskId, {
            status: 'done',
            detail: `临时PPT已生成（${scenes.length} 页）`,
            notebookId: notebookId || undefined,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '生成临时PPT失败';
        setNbThread((prev) =>
          prev.map((m) =>
            m.role === 'assistant' && m.at === targetAt ? { ...m, lessonError: message } : m,
          ),
        );
        if (taskId) {
          await updateAgentTask(taskId, {
            status: 'failed',
            detail: message.slice(0, 300),
            notebookId: notebookId || undefined,
          });
        }
      } finally {
        setLessonGeneratingAt((cur) => (cur === targetAt ? null : cur));
      }
    },
    [courseId, notebookId],
  );

  const saveInlineLessonDeckToNotebook = useCallback(
    async (targetAt: number) => {
      if (!notebookId) return;
      const msg = nbThreadRef.current.find((m) => m.role === 'assistant' && m.at === targetAt);
      if (!msg || msg.role !== 'assistant' || !msg.lessonDeckScenes?.length) return;
      let taskId: string | null = null;
      if (courseId) {
        try {
          taskId = await createAgentTask({
            courseId,
            contactKind: 'notebook',
            contactId: notebookId,
            title: '保存临时PPT到笔记本',
            detail: '正在写入临时PPT页面到笔记本…',
            status: 'running',
          });
        } catch {
          taskId = null;
        }
      }
      setLessonSavingAt(targetAt);
      try {
        const data = await loadStageData(notebookId);
        if (!data?.stage) throw new Error('未找到目标笔记本');
        const current = [...(data.scenes || [])].sort((a, b) => a.order - b.order);
        const questionSummary = summarizeQuestionForContext(msg.lessonSourceQuestion);
        const lessonScenesForSave = msg.lessonDeckScenes.map((scene, idx) =>
          idx === 0 ? attachQuestionContextToFirstScene(scene, questionSummary) : scene,
        );
        const aiPlacement = await pickInsertIndexWithAI({
          notebookTitle: data.stage.name,
          currentScenes: current,
          lessonScenes: lessonScenesForSave,
        });
        const insertAt =
          aiPlacement?.insertAt ?? pickSmartInsertIndex(current, lessonScenesForSave);
        const now = Date.now();
        const inserted = lessonScenesForSave.map((scene, idx) => ({
          ...scene,
          id: `scene_${now}_${idx}_${Math.random().toString(36).slice(2, 8)}`,
          stageId: notebookId,
          order: insertAt + idx,
          createdAt: now,
          updatedAt: now,
        }));
        const merged = [...current.slice(0, insertAt), ...inserted, ...current.slice(insertAt)].map(
          (s, idx) => ({
            ...s,
            order: idx,
            updatedAt: s.updatedAt ?? now,
          }),
        );
        await saveStageData(notebookId, {
          ...data,
          scenes: merged,
          stage: { ...data.stage, updatedAt: now },
        });
        const start = insertAt + 1;
        const end = insertAt + inserted.length;
        const posHint =
          insertAt < current.length
            ? `（${aiPlacement ? 'AI判定' : '规则匹配'}插入到第 ${insertAt} 页后${aiPlacement?.reason ? `：${aiPlacement.reason}` : ''}）`
            : '（已追加到末尾）';
        const label =
          inserted.length === 1
            ? `已保存到笔记本：新增第 ${start} 页 ${posHint}`
            : `已保存到笔记本：新增第 ${start}-${end} 页 ${posHint}`;
        setNbThread((prev) =>
          prev.map((m) =>
            m.role === 'assistant' && m.at === targetAt ? { ...m, lessonSavedLabel: label } : m,
          ),
        );
        if (taskId) {
          await updateAgentTask(taskId, {
            status: 'done',
            detail: label,
            notebookId,
          });
        }
        void reloadNotebookScenes();
      } catch (error) {
        const message = error instanceof Error ? error.message : '保存失败';
        setNbThread((prev) =>
          prev.map((m) =>
            m.role === 'assistant' && m.at === targetAt
              ? { ...m, lessonError: `保存到笔记本失败：${message}` }
              : m,
          ),
        );
        if (taskId) {
          await updateAgentTask(taskId, {
            status: 'failed',
            detail: `保存到笔记本失败：${message}`.slice(0, 300),
            notebookId,
          });
        }
      } finally {
        setLessonSavingAt((cur) => (cur === targetAt ? null : cur));
      }
    },
    [courseId, notebookId, reloadNotebookScenes],
  );

  useEffect(() => {
    void reloadNotebookScenes();
  }, [reloadNotebookScenes]);

  useEffect(() => {
    if (!notebookId) {
      revokeNotebookAttachmentUrls(nbThreadRef.current);
      setNbThread([]);
      setNbThreadHydrated(false);
      return;
    }
    let cancelled = false;
    loadContactMessages<NotebookChatMessage>(courseId, 'notebook', notebookId, {
      ignoreCourseId: true,
    }).then(async (messages) => {
      const hydrated = await hydrateNotebookThread(messages);
      if (cancelled) {
        revokeNotebookAttachmentUrls(hydrated);
        return;
      }
      setNbThread(hydrated);
      setNbThreadHydrated(true);
    });
    return () => {
      cancelled = true;
      revokeNotebookAttachmentUrls(nbThreadRef.current);
    };
  }, [notebookId, courseId]);

  useEffect(() => {
    if (!notebookId || !courseId || !nbThreadHydrated) return;
    let cancelled = false;
    void (async () => {
      try {
        await saveContactMessages<NotebookChatMessage>({
          courseId,
          kind: 'notebook',
          targetId: notebookId,
          targetName: stageMeta?.name || '笔记本',
          messages: stripAttachmentUrlsFromNotebookMessages(nbThread),
        });
        if (cancelled) return;
        window.dispatchEvent(
          new CustomEvent('openmaic-notebook-chat-updated', {
            detail: { courseId, notebookId },
          }),
        );
      } catch {
        /* 无 DB 或未登录时保存失败，侧栏仍依赖初次 load / visibility 刷新 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notebookId, courseId, stageMeta?.name, nbThread, nbThreadHydrated]);

  useEffect(() => {
    if (!agentConversationTargetId || !courseId) {
      revokeAgentAttachmentUrls(agThreadRef.current);
      setAgThread([]);
      return;
    }
    let cancelled = false;
    loadContactMessages<UIMessage<ChatMessageMetadata>>(
      courseId,
      'agent',
      agentConversationTargetId,
    ).then(async (messages) => {
      const filtered = messages.filter((m) => !isMockAgentMessage(m));
      const hydrated = await hydrateAgentThread(filtered);
      if (cancelled) {
        revokeAgentAttachmentUrls(hydrated);
        return;
      }
      setAgThread(hydrated);
    });
    return () => {
      cancelled = true;
      revokeAgentAttachmentUrls(agThreadRef.current);
    };
  }, [agentConversationTargetId, courseId]);

  useEffect(() => {
    if (!agentConversationTargetId || !courseId || !selectedAgent) return;
    void saveContactMessages<UIMessage<ChatMessageMetadata>>({
      courseId,
      kind: 'agent',
      targetId: agentConversationTargetId,
      targetName:
        isCourseOrchestrator && orchestratorViewMode === 'group'
          ? `${selectedAgent.name} · 群聊`
          : selectedAgent.name,
      messages: stripAttachmentUrlsFromAgentMessages(
        agThread.filter((m) => !isMockAgentMessage(m)),
      ),
    });
  }, [
    agentConversationTargetId,
    courseId,
    selectedAgent,
    agThread,
    isCourseOrchestrator,
    orchestratorViewMode,
  ]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [nbThread.length, agThread.length, sending, orchestratorRemoteTask?.detail]);

  useEffect(() => {
    return () => {
      for (const m of agThreadRef.current) {
        m.metadata?.attachments?.forEach((a) => {
          if (a.objectUrl) URL.revokeObjectURL(a.objectUrl);
        });
      }
      for (const m of nbThreadRef.current) {
        if (m.role === 'user' && m.attachments) {
          m.attachments.forEach((a) => {
            if (a.objectUrl) URL.revokeObjectURL(a.objectUrl);
          });
        }
      }
    };
  }, []);

  /** 与右侧栏「进行中」对齐：轮询任务列表，显示远程进度 + 检测完成后补发完成/失败气泡 */
  useEffect(() => {
    if (!courseId?.trim() || !isCourseOrchestrator || orchestratorViewMode !== 'private') {
      setOrchestratorRemoteTask(null);
      return;
    }
    let alive = true;
    const sync = async () => {
      try {
        const allTasks = await listAgentTasksByCourse(courseId.trim());
        if (!alive) return;

        const createActive = allTasks.find(
          (t) =>
            t.contactKind === 'agent' &&
            t.contactId === COURSE_ORCHESTRATOR_ID &&
            (t.title.startsWith('总控任务') || Boolean(t.notebookId?.trim())) &&
            (t.status === 'running' || t.status === 'waiting'),
        );

        if (createActive) {
          trackedOrchestratorCreateTaskIdRef.current = createActive.id;
        }

        if (!orchestratorPipelineProgress) {
          if (createActive && (createActive.detail?.trim() || createActive.notebookId?.trim())) {
            setOrchestratorRemoteTask({
              detail:
                createActive.detail?.trim() ||
                '笔记本正在生成中，请稍候。进度与右侧「进行中」同步。',
              notebookId: createActive.notebookId?.trim(),
            });
          } else {
            setOrchestratorRemoteTask(null);
          }
        } else {
          setOrchestratorRemoteTask(null);
        }

        const tid = trackedOrchestratorCreateTaskIdRef.current;
        if (
          tid &&
          orchestratorCompletionAnnouncedRef.current !== tid &&
          !orchestratorPipelineProgress
        ) {
          const task = allTasks.find((t) => t.id === tid);
          if (!task) return;
          const isCreateNotebookTask =
            task.contactId === COURSE_ORCHESTRATOR_ID && task.title.startsWith('总控任务');

          if (
            task.status === 'done' &&
            isCreateNotebookTask &&
            (task.detail?.includes('创建完成') || Boolean(task.notebookId?.trim()))
          ) {
            const m = task.detail?.match(/创建完成：(.+)/);
            const name = m?.[1]?.trim() || '新笔记本';
            const nid = task.notebookId?.trim();
            orchestratorCompletionAnnouncedRef.current = tid;
            trackedOrchestratorCreateTaskIdRef.current = null;
            setOrchestratorRemoteTask(null);
            if (courseId && nid) {
              window.dispatchEvent(
                new CustomEvent('openmaic-notebook-list-updated', {
                  detail: { courseId, notebookId: nid },
                }),
              );
            }
            setAgThread((prev) => [
              ...prev,
              {
                ...buildChatMessage(
                  `笔记本「${name}」已创建完成。现在可以直接打开它开始提问、查看内容或听讲。`,
                  {
                    senderName: COURSE_ORCHESTRATOR_NAME,
                    senderAvatar: orchestratorAvatar,
                    originalRole: 'teacher',
                    actions: nid
                      ? [
                          {
                            id: `open-notebook:${nid}`,
                            label: '打开笔记本',
                            variant: 'highlight',
                          },
                        ]
                      : [],
                  },
                ),
                id: `orch-create-done-${tid}`,
              },
            ]);
          } else if (task.status === 'failed' && isCreateNotebookTask) {
            orchestratorCompletionAnnouncedRef.current = tid;
            trackedOrchestratorCreateTaskIdRef.current = null;
            setOrchestratorRemoteTask(null);
            setAgThread((prev) => [
              ...prev,
              {
                ...buildChatMessage(`笔记本生成失败：${task.detail?.trim() || '请重试'}`, {
                  senderName: COURSE_ORCHESTRATOR_NAME,
                  senderAvatar: orchestratorAvatar,
                  originalRole: 'teacher',
                }),
                id: `orch-create-failed-${tid}`,
              },
            ]);
          }
        }
      } catch {
        if (alive) setOrchestratorRemoteTask(null);
      }
    };
    void sync();
    const timer = window.setInterval(sync, 2000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [courseId, isCourseOrchestrator, orchestratorViewMode, orchestratorPipelineProgress]);

  useEffect(() => {
    setPendingAttachments([]);
    setActiveOrchestratorTaskId(null);
    setSelectedChildTaskId(null);
  }, [notebookId, agentId]);

  useEffect(() => {
    if (!agentId) {
      setContactTaskHint(null);
      return;
    }
    let alive = true;
    const sync = async () => {
      const tasks = await listTasksForContact('agent', agentId);
      const realTasks = tasks.filter((t) => !isMockTaskLike(t));
      if (!alive) return;
      const active = realTasks.find((t) => t.status === 'running' || t.status === 'waiting');
      setContactTaskHint(active?.detail || (active ? active.title : null));
    };
    void sync();
    const timer = window.setInterval(sync, 1500);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [agentId]);

  useEffect(() => {
    if (!courseId || !isCourseOrchestrator || orchestratorViewMode !== 'private') return;
    let cancelled = false;
    void (async () => {
      try {
        const tasks = await listTasksForContact('agent', COURSE_ORCHESTRATOR_ID);
        const staleMockTasks = tasks.filter(
          (t) => isMockTaskLike(t) && (t.status === 'running' || t.status === 'waiting'),
        );
        for (const t of staleMockTasks) {
          if (cancelled) return;
          await updateAgentTask(t.id, {
            status: 'done',
            detail: '已清理历史 mock 任务',
          });
        }
      } catch {
        /* ignore cleanup errors */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, isCourseOrchestrator, orchestratorViewMode]);

  useEffect(() => {
    if (!activeOrchestratorTaskId || !isCourseOrchestrator) {
      setOrchestratorChildTasks([]);
      return;
    }
    let alive = true;
    const sync = async () => {
      const rows = await listChildTasks(activeOrchestratorTaskId);
      if (!alive) return;
      setOrchestratorChildTasks(
        rows.map((r) => ({
          id: r.id,
          title: r.title,
          detail: r.detail,
          status: r.status,
          contactId: r.contactId,
          updatedAt: r.updatedAt,
          lastEnvelope: r.lastEnvelope,
        })),
      );
    };
    void sync();
    const timer = window.setInterval(sync, 1200);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [activeOrchestratorTaskId, isCourseOrchestrator]);

  useEffect(() => {
    if (!selectedChildTaskId) return;
    if (!orchestratorChildTasks.some((t) => t.id === selectedChildTaskId)) {
      setSelectedChildTaskId(null);
    }
  }, [selectedChildTaskId, orchestratorChildTasks]);

  const openAttachmentPicker = () => {
    fileInputRef.current?.click();
  };

  const removePendingAttachment = (id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const copyMessageText = useCallback(async (text: string) => {
    const normalized = text.trim();
    if (!normalized) return;
    try {
      await navigator.clipboard.writeText(normalized);
    } catch {
      // ignore clipboard errors
    }
  }, []);

  const deleteNotebookMessageAt = useCallback((index: number) => {
    setNbThread((prev) => {
      const removed = prev[index];
      if (removed?.role === 'user' && removed.attachments?.length) {
        for (const a of removed.attachments) {
          if (a.objectUrl) URL.revokeObjectURL(a.objectUrl);
          void deleteChatAttachmentBlob(a.id);
        }
      }
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const deleteAgentMessageById = useCallback((messageId: string) => {
    setAgThread((prev) => {
      const removed = prev.find((m) => m.id === messageId);
      if (removed?.metadata?.attachments?.length) {
        for (const a of removed.metadata.attachments) {
          if (a.objectUrl) URL.revokeObjectURL(a.objectUrl);
          void deleteChatAttachmentBlob(a.id);
        }
      }
      return prev.filter((m) => m.id !== messageId);
    });
  }, []);

  const onPickAttachments = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const selected = Array.from(files).slice(0, 6);
    const built: NotebookAttachmentInput[] = [];
    for (const file of selected) {
      const textExcerpt = await extractTextExcerpt(file);
      built.push({
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        textExcerpt,
        file,
      });
    }
    setPendingAttachments((prev) => [...prev, ...built].slice(-6));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const persistNotebookConversation = useCallback(
    async (
      notebook: StageListItem,
      question: string,
      assistant: Omit<Extract<NotebookChatMessage, { role: 'assistant' }>, 'role' | 'at'>,
    ) => {
      if (!courseId) return;
      try {
        const existing = await loadContactMessages<NotebookChatMessage>(
          courseId,
          'notebook',
          notebook.id,
        );
        const next: NotebookChatMessage[] = [
          ...existing,
          { role: 'user', text: question, at: Date.now() },
          { role: 'assistant', at: Date.now(), ...assistant },
        ];
        await saveContactMessages<NotebookChatMessage>({
          courseId,
          kind: 'notebook',
          targetId: notebook.id,
          targetName: notebook.name,
          messages: next,
        });
        window.dispatchEvent(
          new CustomEvent(NOTEBOOK_CHAT_PREVIEW_EVENT, {
            detail: { courseId, notebookId: notebook.id },
          }),
        );
      } catch {
        /* ignore notebook sync errors for orchestrator delegation */
      }
    },
    [courseId],
  );

  const runNotebookSubtask = useCallback(
    async (
      notebook: StageListItem,
      question: string,
      parentTaskId: string | null,
      appendAgentMessage?: (message: UIMessage<ChatMessageMetadata>) => void,
      attachments?: NotebookAttachmentInput[],
    ): Promise<NotebookSubtaskResult> => {
      const childTaskId =
        courseId && parentTaskId
          ? await createAgentTask({
              courseId,
              parentTaskId,
              contactKind: 'notebook',
              contactId: notebook.id,
              title: `子任务：${notebook.name}`,
              detail: '正在查看现有内容并判断是否需要补充 slides…',
              status: 'running',
            })
          : null;

      try {
        const plan = await planNotebookMessage(notebook.id, question, {
          allowWrite: true,
          preferWebSearch: true,
          attachments: attachments && attachments.length > 0 ? attachments : undefined,
        });
        const shouldGenerateSlides = hasNotebookWrites(plan);
        let appliedLabel: string | undefined;

        if (shouldGenerateSlides) {
          appendAgentMessage?.(
            buildChatMessage(
              `我发现《${notebook.name}》里还缺少这部分知识点，已开始生成补充 slides。`,
              {
                senderName: notebook.name,
                senderAvatar: notebook.avatarUrl,
              },
            ),
          );
          if (childTaskId) {
            await updateAgentTask(childTaskId, {
              detail: '发现知识缺口，正在生成补充 slides…',
              status: 'running',
            });
          }
          const applied = await applyNotebookPlan(notebook.id, plan);
          appliedLabel = formatAppliedSummary({ applied }) || undefined;
          if (notebookId === notebook.id) {
            void reloadNotebookScenes();
          }
        }

        const answer = shouldGenerateSlides
          ? `${plan.answer}\n\n${appliedLabel ? `已补充内容：${appliedLabel}。` : '已补充相关 slides。'}现在可以开始听讲/查看新增内容了。`
          : plan.answer;
        const answerDocument = shouldGenerateSlides
          ? appendNotebookAnswerCallout({
              document: plan.answerDocument,
              fallbackText: answer,
              tone: 'success',
              title: '已补充内容',
              text: appliedLabel
                ? `${appliedLabel}。现在可以开始听讲或查看新增内容了。`
                : '已补充相关 slides，现在可以开始听讲或查看新增内容了。',
            })
          : plan.answerDocument;

        const assistantPayload: Omit<
          Extract<NotebookChatMessage, { role: 'assistant' }>,
          'role' | 'at'
        > = {
          answer,
          answerDocument,
          references: plan.references || [],
          knowledgeGap: plan.knowledgeGap,
          prerequisiteHints: plan.prerequisiteHints,
          webSearchUsed: plan.webSearchUsed,
          appliedLabel,
        };
        await persistNotebookConversation(notebook, question, assistantPayload);

        if (childTaskId) {
          await updateAgentTask(childTaskId, {
            detail: shouldGenerateSlides
              ? `已完成并补充内容：${appliedLabel || '新增 slides'}`
              : '已完成现有内容解答',
            status: 'done',
          });
        }

        return {
          notebook,
          answer,
          appliedLabel,
          knowledgeGap: plan.knowledgeGap,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (childTaskId) {
          await updateAgentTask(childTaskId, {
            detail: message.slice(0, 300),
            status: 'failed',
          });
        }
        appendAgentMessage?.(
          buildChatMessage(`《${notebook.name}》处理失败：${message}`, {
            senderName: notebook.name,
            senderAvatar: notebook.avatarUrl,
          }),
        );
        throw error;
      }
    },
    [courseId, notebookId, persistNotebookConversation, reloadNotebookScenes],
  );

  const handleSendNotebook = async () => {
    const text = draft.trim();
    if (!text || !notebookId || sending) return;
    const mc = getCurrentModelConfig();
    if (!mc.isServerConfigured) {
      window.alert('系统模型尚未配置，请联系管理员。');
      return;
    }

    try {
      await Promise.all(
        pendingAttachments
          .filter((a): a is typeof a & { file: File } => Boolean(a.file))
          .map((a) => storeChatAttachmentBlob(a.id, a.file)),
      );
    } catch {
      /* IndexedDB 不可用时仍可发送，仅无法在刷新后再次打开附件 */
    }

    const userMsg: NotebookChatMessage = {
      role: 'user',
      text,
      at: Date.now(),
      attachments: pendingAttachments.map((a) => ({
        id: a.id,
        name: a.name,
        mimeType: a.mimeType,
        size: a.size,
        objectUrl: a.file ? URL.createObjectURL(a.file) : undefined,
      })),
    };
    setNbThread((t) => [...t, userMsg]);
    setDraft('');
    setSending(true);
    const taskId =
      courseId && notebookId
        ? await createAgentTask({
            courseId,
            contactKind: 'notebook',
            contactId: notebookId,
            title: `笔记本问答：${text.slice(0, 36)}`,
            detail: '正在生成回答…',
            status: 'running',
          })
        : null;
    try {
      const conversation = [...nbThread, userMsg]
        .slice(-12)
        .map((m) =>
          m.role === 'user'
            ? { role: 'user' as const, content: m.text, at: m.at }
            : { role: 'assistant' as const, content: m.answer, at: m.at },
        );
      const plan = await planNotebookMessage(notebookId, text, {
        allowWrite: applyNotebookWrites,
        preferWebSearch: true,
        conversation,
        attachments: pendingAttachments,
      });
      const shouldGenerateSlides = applyNotebookWrites && hasNotebookWrites(plan);
      let appliedLabel = '';

      if (taskId) {
        await updateAgentTask(taskId, {
          detail: shouldGenerateSlides ? '发现知识缺口，正在补充 slides…' : '正在整理现有内容回答…',
          status: 'running',
        });
      }

      if (shouldGenerateSlides) {
        setNbThread((t) => [
          ...t,
          {
            role: 'assistant',
            answer: '我发现当前笔记本还缺少相关知识点，已开始生成补充 slides，请稍等。',
            references: [],
            knowledgeGap: true,
            at: Date.now(),
          },
        ]);
        const applied = await applyNotebookPlan(notebookId, plan);
        appliedLabel = formatAppliedSummary({ applied });
        void reloadNotebookScenes();
      }

      const finalAnswer =
        shouldGenerateSlides && applyNotebookWrites
          ? `${plan.answer}\n\n${appliedLabel ? `已补充内容：${appliedLabel}。` : '已补充相关 slides。'}现在可以开始听讲/查看新增内容了。`
          : !applyNotebookWrites && hasNotebookWrites(plan)
            ? `${plan.answer}\n\n${t('chat.notebookWritesDisabledHint')}`
            : plan.answer;
      const answerDocument =
        shouldGenerateSlides && applyNotebookWrites
          ? appendNotebookAnswerCallout({
              document: plan.answerDocument,
              fallbackText: finalAnswer,
              tone: 'success',
              title: '已补充内容',
              text: appliedLabel
                ? `${appliedLabel}。现在可以开始听讲或查看新增内容了。`
                : '已补充相关 slides，现在可以开始听讲或查看新增内容了。',
            })
          : !applyNotebookWrites && hasNotebookWrites(plan)
            ? appendNotebookAnswerCallout({
                document: plan.answerDocument,
                fallbackText: finalAnswer,
                tone: 'info',
                title: '未自动写入笔记本',
                text: t('chat.notebookWritesDisabledHint'),
              })
            : plan.answerDocument;
      const assistantMsg: NotebookChatMessage = {
        role: 'assistant',
        answer: finalAnswer,
        answerDocument,
        references: plan.references || [],
        knowledgeGap: plan.knowledgeGap,
        prerequisiteHints: plan.prerequisiteHints,
        webSearchUsed: plan.webSearchUsed,
        appliedLabel: appliedLabel || undefined,
        lessonSourceQuestion: shouldOfferMicroLessonButton(text) ? text : undefined,
        at: Date.now(),
      };
      setNbThread((t) => [...t, assistantMsg]);
      setPendingAttachments([]);
      if (taskId) {
        await updateAgentTask(taskId, {
          status: 'done',
          detail:
            shouldGenerateSlides && applyNotebookWrites
              ? `已完成并补充内容：${appliedLabel || '新增 slides'}`
              : plan.knowledgeGap
                ? '已完成（含知识缺口建议）'
                : '已完成',
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setNbThread((t) => [
        ...t,
        {
          role: 'assistant',
          answer: `请求失败：${msg}`,
          references: [],
          knowledgeGap: false,
          at: Date.now(),
        },
      ]);
      if (taskId) {
        await updateAgentTask(taskId, { status: 'failed', detail: msg.slice(0, 300) });
      }
    } finally {
      setSending(false);
    }
  };

  const handleSendAgent = async () => {
    const text = draft.trim();
    if (!agentId || !selectedAgent || sending) return;
    if (selectedAgent.id === COURSE_ORCHESTRATOR_ID) {
      if (!text && pendingAttachments.length === 0) return;
    } else if (!text) {
      return;
    }
    const mc = getCurrentModelConfig();
    if (!mc.isServerConfigured) {
      window.alert('系统模型尚未配置，请联系管理员。');
      return;
    }

    const orchAttachments =
      selectedAgent.id === COURSE_ORCHESTRATOR_ID ? [...pendingAttachments] : [];
    const sourceFileForPipeline =
      selectedAgent.id === COURSE_ORCHESTRATOR_ID
        ? (orchAttachments.find((a) => a.file && isNotebookPipelineSourceFile(a.file))?.file ??
          null)
        : null;
    const mergedPrompt =
      selectedAgent.id === COURSE_ORCHESTRATOR_ID
        ? mergeOrchestratorPrompt(text, orchAttachments, Boolean(sourceFileForPipeline))
        : text;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await Promise.all(
        orchAttachments
          .filter((a): a is typeof a & { file: File } => Boolean(a.file))
          .map((a) => storeChatAttachmentBlob(a.id, a.file)),
      );
    } catch {
      /* IndexedDB 不可用时仍可发送 */
    }

    const userMessage = buildChatMessage(
      text || (orchAttachments.length ? ATTACHMENT_ONLY_PLACEHOLDER : ''),
      {
        senderName: nickname.trim() || '我',
        senderAvatar: userAvatar || USER_AVATAR,
        originalRole: 'user',
        attachments:
          orchAttachments.length > 0
            ? orchAttachments.map((a) => ({
                id: a.id,
                name: a.name,
                mimeType: a.mimeType,
                size: a.size,
                objectUrl: a.file ? URL.createObjectURL(a.file) : undefined,
              }))
            : undefined,
      },
    );

    let nextThread = [...agThread, userMessage];
    setAgThread(nextThread);
    setDraft('');
    if (selectedAgent.id === COURSE_ORCHESTRATOR_ID) {
      setPendingAttachments([]);
    }
    setSending(true);

    const appendAgentMessage = (message: UIMessage<ChatMessageMetadata>) => {
      nextThread = [...nextThread, message];
      setAgThread(nextThread);
    };

    if (selectedAgent.id === COURSE_ORCHESTRATOR_ID) {
      if (orchestratorViewMode === 'private' && orchestratorComposerMode === 'send-message') {
        const agentConfigs = [toChatAgentConfig(selectedAgent)];
        const getStoreState = () => ({
          stage: null,
          scenes: [] as Scene[],
          currentSceneId: null,
          mode: 'playback' as const,
          whiteboardOpen: false,
        });
        try {
          await runCourseSideChatLoop({
            initialMessages: nextThread,
            agentIds: [COURSE_ORCHESTRATOR_ID],
            agentConfigs,
            getStoreState,
            userProfile: { nickname: nickname.trim() || undefined },
            apiKey: mc.apiKey,
            baseUrl: mc.baseUrl || undefined,
            model: mc.modelString,
            signal: controller.signal,
            onMessages: setAgThread,
          });
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') return;
          const msg = e instanceof Error ? e.message : String(e);
          const errId = `err-${Date.now()}`;
          setAgThread((t) => [
            ...t,
            {
              id: errId,
              role: 'assistant',
              parts: [{ type: 'text', text: `发送失败：${msg}` }],
              metadata: {
                senderName: '系统',
                originalRole: 'agent',
                createdAt: Date.now(),
              },
            },
          ]);
        } finally {
          if (abortRef.current === controller) abortRef.current = null;
          setSending(false);
        }
        return;
      }

      let parentTaskId: string | null = null;
      if (courseId) {
        try {
          parentTaskId = await createAgentTask({
            courseId,
            contactKind: 'agent',
            contactId: COURSE_ORCHESTRATOR_ID,
            title: `总控任务：${mergedPrompt.slice(0, 36)}`,
            detail: '正在判断该需求应该走创建、单笔记本还是多笔记本协作流…',
            status: 'running',
          });
        } catch (error) {
          throw error;
        }
      }
      if (parentTaskId) {
        setActiveOrchestratorTaskId(parentTaskId);
        trackedOrchestratorCreateTaskIdRef.current = parentTaskId;
      }

      try {
        const notebooks = courseId ? await listStagesByCourse(courseId) : [];
        const decision = decideNotebookRoute(
          mergedPrompt,
          notebooks,
          orchestratorViewMode,
          orchAttachments.length > 0,
        );

        if (decision.type === 'create') {
          if (parentTaskId) {
            await updateAgentTask(parentTaskId, {
              detail: '已开始创建笔记本，正在生成大纲与页面…',
              status: 'running',
            });
          }

          const orchGen = useOrchestratorNotebookGenStore.getState();
          const created = await runNotebookGenerationTask({
            courseId: courseId || undefined,
            requirement: mergedPrompt,
            modelIdOverride: orchGen.modelIdOverride,
            language: orchGen.language,
            webSearch: orchGen.webSearch,
            userNickname: nickname.trim() || undefined,
            signal: controller.signal,
            sourceFile: sourceFileForPipeline,
            imageGenerationEnabledOverride: orchGen.useAiImages,
            outlinePreferences: {
              length: orchGen.outlineLength,
              includeQuizScenes: orchGen.includeQuizScenes,
              workedExampleLevel: orchGen.workedExampleLevel ?? 'moderate',
            },
            onProgress: (progress) => {
              if (progress.stage === 'completed') {
                return;
              }
              setOrchestratorPipelineProgress(progress);
              if (parentTaskId) {
                void updateAgentTask(parentTaskId, {
                  detail: progress.detail,
                  status: 'running',
                  ...(progress.stage === 'notebook-ready' && progress.notebookId
                    ? { notebookId: progress.notebookId }
                    : {}),
                });
              }
            },
          });

          appendAgentMessage(
            buildChatMessage(
              `笔记本「${created.stage.name}」已创建完成。现在可以直接打开它开始提问、查看内容或听讲。`,
              {
                senderName: COURSE_ORCHESTRATOR_NAME,
                senderAvatar: orchestratorAvatar,
                originalRole: 'teacher',
                actions: [
                  {
                    id: `open-notebook:${created.stage.id}`,
                    label: '打开笔记本',
                    variant: 'highlight',
                  },
                ],
              },
            ),
          );
          if (courseId) {
            window.dispatchEvent(
              new CustomEvent('openmaic-notebook-list-updated', {
                detail: { courseId, notebookId: created.stage.id },
              }),
            );
          }
          if (parentTaskId) {
            orchestratorCompletionAnnouncedRef.current = parentTaskId;
            await updateAgentTask(parentTaskId, {
              detail: `创建完成：${created.stage.name}`,
              status: 'done',
              notebookId: created.stage.id,
            });
          }
        } else if (decision.type === 'single') {
          appendAgentMessage(
            buildChatMessage(
              shouldRenderGroupReplies
                ? `我已将这个需求交给《${decision.notebook.name}》处理，并会把处理过程同步在这里。`
                : `我已将这个需求路由给《${decision.notebook.name}》处理，稍后由我统一把结果回复给你。`,
              {
                senderName: COURSE_ORCHESTRATOR_NAME,
                senderAvatar: orchestratorAvatar,
                originalRole: 'teacher',
              },
            ),
          );
          if (parentTaskId) {
            await updateAgentTask(parentTaskId, {
              detail: `已路由到《${decision.notebook.name}》，正在执行单笔记本任务…`,
              status: 'running',
            });
          }
          const result = await runNotebookSubtask(
            decision.notebook,
            mergedPrompt,
            parentTaskId,
            shouldRenderGroupReplies ? appendAgentMessage : undefined,
            orchAttachments,
          );
          appendAgentMessage(
            buildChatMessage(
              shouldRenderGroupReplies
                ? `《${decision.notebook.name}》已处理完成。你也可以直接进入该笔记本继续追问。`
                : `我已收到《${decision.notebook.name}》的处理结果。\n\n${result.answer}\n\n你也可以直接进入该笔记本继续追问。`,
              {
                senderName: COURSE_ORCHESTRATOR_NAME,
                senderAvatar: orchestratorAvatar,
                originalRole: 'teacher',
                actions: [
                  {
                    id: `open-notebook:${decision.notebook.id}`,
                    label: '打开该笔记本',
                    variant: 'highlight',
                  },
                ],
              },
            ),
          );
          if (parentTaskId) {
            await updateAgentTask(parentTaskId, {
              detail: `单笔记本任务已完成：${decision.notebook.name}`,
              status: 'done',
            });
          }
        } else {
          appendAgentMessage(
            buildChatMessage(
              shouldRenderGroupReplies
                ? `我已升级为多笔记本协作流。\n\n目标总结：${text || mergedPrompt.slice(0, 800)}\n\n参与笔记本：${decision.notebooks.map((n) => `《${n.name}》`).join('、')}`
                : `我会在后台发起多笔记本协作，并由我统一汇总结果回复给你。\n\n目标总结：${text || mergedPrompt.slice(0, 800)}\n\n参与笔记本：${decision.notebooks.map((n) => `《${n.name}》`).join('、')}`,
              {
                senderName: COURSE_ORCHESTRATOR_NAME,
                senderAvatar: orchestratorAvatar,
                originalRole: 'teacher',
              },
            ),
          );
          if (parentTaskId) {
            await updateAgentTask(parentTaskId, {
              detail: `已发起 ${decision.notebooks.length} 个笔记本协作子任务…`,
              status: 'running',
            });
          }

          const results: NotebookSubtaskResult[] = [];
          for (const notebook of decision.notebooks) {
            try {
              const result = await runNotebookSubtask(
                notebook,
                mergedPrompt,
                parentTaskId,
                shouldRenderGroupReplies ? appendAgentMessage : undefined,
                orchAttachments,
              );
              results.push(result);
              if (shouldRenderGroupReplies) {
                appendAgentMessage(
                  buildChatMessage(result.answer, {
                    senderName: notebook.name,
                    senderAvatar: notebook.avatarUrl,
                  }),
                );
              }
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              appendAgentMessage(
                buildChatMessage(
                  shouldRenderGroupReplies
                    ? `《${notebook.name}》暂时未能完成：${message}`
                    : `协作笔记本《${notebook.name}》暂时未能完成：${message}`,
                  {
                    senderName: shouldRenderGroupReplies ? notebook.name : COURSE_ORCHESTRATOR_NAME,
                    senderAvatar: shouldRenderGroupReplies
                      ? notebook.avatarUrl
                      : orchestratorAvatar,
                    originalRole: shouldRenderGroupReplies ? 'agent' : 'teacher',
                  },
                ),
              );
            }
          }

          const mergedText =
            results.length > 0
              ? `多笔记本协作已完成。我已综合 ${results.length} 个笔记本的结果：\n\n${results
                  .map(
                    (result, index) =>
                      `${index + 1}. 《${result.notebook.name}》\n${result.answer}${result.appliedLabel ? `\n补充内容：${result.appliedLabel}` : ''}`,
                  )
                  .join('\n\n')}`
              : '多笔记本协作已结束，但暂时没有可用结果，请稍后重试。';

          appendAgentMessage(
            buildChatMessage(mergedText, {
              senderName: COURSE_ORCHESTRATOR_NAME,
              senderAvatar: orchestratorAvatar,
              originalRole: 'teacher',
              actions: results.map((result) => ({
                id: `open-notebook:${result.notebook.id}`,
                label: `打开《${result.notebook.name}》`,
                variant: 'highlight',
              })),
            }),
          );
          if (parentTaskId) {
            await updateAgentTask(parentTaskId, {
              detail:
                results.length > 0
                  ? `多笔记本协作已完成（${results.length} 个结果）`
                  : '多笔记本协作结束，但没有产出结果',
              status: 'done',
            });
          }
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        const msg = e instanceof Error ? e.message : String(e);
        appendAgentMessage(
          buildChatMessage(`总控任务失败：${msg}`, {
            senderName: '系统',
            originalRole: 'agent',
          }),
        );
        if (parentTaskId) {
          await updateAgentTask(parentTaskId, { status: 'failed', detail: msg.slice(0, 300) });
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setOrchestratorPipelineProgress(null);
        setSending(false);
      }
      return;
    }

    const agentConfigs = selectedAgent.id.startsWith('default-')
      ? undefined
      : [toChatAgentConfig(selectedAgent)];

    const getStoreState = () => ({
      stage: null,
      scenes: [] as Scene[],
      currentSceneId: null,
      mode: 'playback' as const,
      whiteboardOpen: false,
    });

    try {
      await runCourseSideChatLoop({
        initialMessages: nextThread,
        agentIds: [selectedAgent.id],
        agentConfigs,
        getStoreState,
        userProfile: { nickname: nickname.trim() || undefined },
        apiKey: mc.apiKey,
        baseUrl: mc.baseUrl || undefined,
        model: mc.modelString,
        signal: controller.signal,
        onMessages: setAgThread,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      const msg = e instanceof Error ? e.message : String(e);
      const errId = `err-${Date.now()}`;
      setAgThread((t) => [
        ...t,
        {
          id: errId,
          role: 'assistant',
          parts: [{ type: 'text', text: `发送失败：${msg}` }],
          metadata: {
            senderName: '系统',
            originalRole: 'agent',
            createdAt: Date.now(),
          },
        },
      ]);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setSending(false);
    }
  };

  const titleLine = useMemo(() => {
    if (!courseId) return '聊天';
    if (mode === 'notebook' && stageMeta) return stageMeta.name;
    if (mode === 'agent' && selectedAgent) {
      if (selectedAgent.id === COURSE_ORCHESTRATOR_ID && orchestratorViewMode === 'group') {
        return '群聊 · 课程内协作会话';
      }
      return selectedAgent.name;
    }
    return '选择联系人';
  }, [courseId, mode, stageMeta, selectedAgent, orchestratorViewMode]);

  if (!courseId) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 px-6 text-center">
        <BookOpen className="size-12 text-muted-foreground/40" strokeWidth={1.25} />
        <div className="max-w-md space-y-2">
          <p className="text-lg font-medium text-foreground">尚未选择课程</p>
          <p className="text-sm text-muted-foreground">
            请先从「我的课程」进入一门课，或从课堂返回以保留侧栏课程上下文，再使用聊天。
          </p>
        </div>
        <Button asChild variant="default" className="rounded-xl">
          <Link href="/my-courses">前往我的课程</Link>
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col',
        'bg-[radial-gradient(circle_at_15%_0%,rgba(179,229,252,0.35),transparent_38%),linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)]',
        'dark:bg-[radial-gradient(circle_at_20%_10%,rgba(71,85,105,0.25),transparent_45%),linear-gradient(180deg,#0b0f16_0%,#111827_100%)]',
      )}
    >
      <header className="shrink-0 border-b border-slate-900/[0.06] bg-white/60 px-5 py-4 backdrop-blur-md dark:border-white/[0.08] dark:bg-black/25">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{titleLine}</h1>
        {mode === 'agent' && contactTaskHint ? (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            任务状态：{contactTaskHint}
          </p>
        ) : null}
        {mode === 'agent' && isCourseOrchestrator && orchestratorChildTasks.length > 0 ? (
          <div className="mt-2 max-h-24 overflow-y-auto rounded-lg border border-slate-900/[0.08] bg-white/70 px-2 py-1 text-[11px] dark:border-white/[0.1] dark:bg-black/30">
            {orchestratorChildTasks.slice(0, 8).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedChildTaskId(t.id)}
                className={cn(
                  'flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/10',
                  selectedChildTaskId === t.id ? 'bg-black/5 dark:bg-white/10' : '',
                )}
              >
                <span
                  className={cn(
                    'size-2 rounded-full',
                    t.status === 'done'
                      ? 'bg-emerald-500'
                      : t.status === 'failed'
                        ? 'bg-rose-500'
                        : 'bg-amber-500',
                  )}
                  aria-hidden
                />
                <span className="truncate text-foreground">{t.title.replace(/^子任务：/, '')}</span>
                <span className="truncate text-muted-foreground">{t.detail || ''}</span>
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {mode === 'none' && courseId && pickContactDone ? (
          <p className="text-center text-sm text-muted-foreground">
            本课程下还没有笔记本或 Agent。请先创建笔记本，或从生成流程创建课程角色。
          </p>
        ) : null}
        {mode === 'none' && courseId && !pickContactDone ? (
          <p className="text-center text-sm text-muted-foreground">正在打开会话…</p>
        ) : null}

        {mode === 'agent' &&
        isCourseOrchestrator &&
        agThread.length === 0 &&
        !orchestratorPipelineProgress &&
        !orchestratorRemoteTask ? (
          <p className="mx-auto max-w-md px-2 text-center text-sm leading-relaxed text-muted-foreground">
            {orchestratorViewMode === 'group'
              ? '这里是课程内协作群聊，会显示课程总控与被调度笔记本的协作过程。'
              : orchestratorComposerMode === 'send-message'
                ? '在此直接向课程总控提问：课程安排、概念解释、与笔记本无关的答疑等。不会自动创建笔记本或调度多笔记本协作。'
                : `生成笔记本：在下方选择「生成笔记本」，填写需求、可添加 PDF、Markdown 或其它附件后发送。将走创建管线（与「${t('toolbar.enterClassroom')}」一致），进度在输入区上方与右侧「进行中」同步。`}
          </p>
        ) : null}

        {mode === 'notebook'
          ? nbThread.map((m, i) =>
              m.role === 'user' ? (
                <div key={`u-${m.at}-${i}`} className="flex items-end justify-end gap-2">
                  <ContextMenu>
                    <ContextMenuTrigger asChild>
                      <div className="max-w-[min(100%,520px)] rounded-2xl bg-violet-600 px-4 py-2.5 text-sm text-white dark:bg-violet-500">
                        <p className="whitespace-pre-wrap break-words">{m.text}</p>
                        {m.attachments && m.attachments.length > 0 ? (
                          <div className="mt-2 space-y-2">
                            {m.attachments.map((a) => (
                              <ChatAttachmentBubble
                                key={a.id}
                                name={a.name}
                                size={a.size}
                                mimeType={a.mimeType}
                                objectUrl={a.objectUrl}
                                variant="onUserBubble"
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem onSelect={() => void copyMessageText(m.text)}>
                        复制内容
                      </ContextMenuItem>
                      <ContextMenuItem
                        variant="destructive"
                        onSelect={() => deleteNotebookMessageAt(i)}
                      >
                        删除该条
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                  <ChatUserAvatar src={userAvatar} displayName={nickname.trim() || '我'} />
                </div>
              ) : (
                <div key={`a-${m.at}-${i}`} className="flex items-start justify-start gap-2">
                  <NotebookPeerAvatar
                    avatarUrl={stageMeta?.avatarUrl}
                    notebookName={stageMeta?.name ?? '笔记本'}
                  />
                  <ContextMenu>
                    <ContextMenuTrigger asChild>
                      <div className="max-w-[min(100%,640px)] rounded-2xl border border-slate-900/[0.08] bg-white/90 px-4 py-3 text-sm shadow-sm dark:border-white/[0.1] dark:bg-black/40">
                        {m.answerDocument ? (
                          <NotebookContentView document={m.answerDocument} />
                        ) : (
                          <p className="whitespace-pre-wrap break-words text-foreground">
                            {m.answer}
                          </p>
                        )}
                        {m.references.length > 0 ? (
                          <div className="mt-3 border-t border-slate-900/[0.06] pt-3 dark:border-white/[0.08]">
                            <p className="text-xs font-semibold text-muted-foreground">页码引用</p>
                            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                              {m.references.map((r, j) => (
                                <NotebookReferencePreviewLi
                                  key={j}
                                  reference={r}
                                  scenes={notebookScenes}
                                  scenesLoading={notebookScenesLoading}
                                />
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {m.prerequisiteHints && m.prerequisiteHints.length > 0 ? (
                          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                            前置提示：{m.prerequisiteHints.join('；')}
                          </p>
                        ) : null}
                        {m.knowledgeGap ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            模型判断存在知识缺口，可能已尝试补充内容。
                          </p>
                        ) : null}
                        {m.webSearchUsed ? (
                          <p className="mt-1 text-[11px] text-muted-foreground">已使用联网检索</p>
                        ) : null}
                        {m.appliedLabel ? (
                          <p className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-400">
                            {m.appliedLabel}
                          </p>
                        ) : null}
                        {m.lessonSourceQuestion && !m.lessonDeckScenes?.length ? (
                          <div className="mt-3 rounded-xl border border-violet-200/70 bg-gradient-to-r from-violet-50/90 via-fuchsia-50/80 to-white/80 p-2.5 dark:border-violet-700/40 dark:from-violet-950/35 dark:via-fuchsia-950/20 dark:to-black/20">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 dark:text-violet-300">
                                  <Sparkles className="size-3.5" />
                                  快速讲解
                                </p>
                                <p className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                                  需要的话，我可以把这道题自动整理成 3-5
                                  页临时PPT，便于翻页讲解与复习。
                                </p>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                className="h-8 shrink-0 rounded-full bg-violet-600 px-3 text-[11px] text-white hover:bg-violet-500 dark:bg-violet-500 dark:hover:bg-violet-400"
                                disabled={lessonGeneratingAt === m.at}
                                onClick={() => void generateInlineLessonDeck(m.at)}
                              >
                                {lessonGeneratingAt === m.at ? (
                                  <>
                                    <Loader2 className="mr-1 size-3 animate-spin" />
                                    生成中…
                                  </>
                                ) : (
                                  <>
                                    <Presentation className="mr-1 size-3.5" />
                                    讲成临时PPT
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        ) : null}
                        {m.lessonDeckScenes?.length ? (
                          <InlineLessonDeck
                            scenes={m.lessonDeckScenes}
                            onSave={() => void saveInlineLessonDeckToNotebook(m.at)}
                            saving={lessonSavingAt === m.at}
                            savedLabel={m.lessonSavedLabel}
                          />
                        ) : null}
                        {m.lessonError ? (
                          <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
                            {m.lessonError}
                          </p>
                        ) : null}
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem onSelect={() => void copyMessageText(m.answer)}>
                        复制内容
                      </ContextMenuItem>
                      <ContextMenuItem
                        variant="destructive"
                        onSelect={() => deleteNotebookMessageAt(i)}
                      >
                        删除该条
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                </div>
              ),
            )
          : null}

        {mode === 'agent'
          ? agThread.map((m) => {
              const isUser = m.role === 'user';
              const text = messageText(m);
              const meta = m.metadata;
              const hideAttachmentOnlyText =
                isUser &&
                meta?.attachments &&
                meta.attachments.length > 0 &&
                (text === ATTACHMENT_ONLY_PLACEHOLDER || !text.trim());
              return (
                <div
                  key={m.id}
                  className={cn(
                    'flex gap-2',
                    isUser ? 'flex-row-reverse items-end' : 'flex-row items-start',
                  )}
                >
                  {isUser ? (
                    <ChatUserAvatar
                      src={meta?.senderAvatar || userAvatar}
                      displayName={meta?.senderName || nickname.trim() || '我'}
                    />
                  ) : (
                    <AgentPeerAvatar
                      avatarSrc={meta?.senderAvatar ?? selectedAgent?.avatar}
                      agentName={meta?.senderName || selectedAgent?.name || 'Agent'}
                    />
                  )}
                  <ContextMenu>
                    <ContextMenuTrigger asChild>
                      <div
                        className={cn(
                          'max-w-[min(100%,560px)] rounded-2xl px-4 py-2.5 text-sm',
                          isUser
                            ? 'bg-violet-600 text-white dark:bg-violet-500'
                            : 'border border-slate-900/[0.08] bg-white/90 text-foreground dark:border-white/[0.1] dark:bg-black/40',
                        )}
                      >
                        {!isUser && meta?.senderName ? (
                          <p className="mb-1 text-[10px] font-medium opacity-70">
                            {meta.senderName}
                          </p>
                        ) : null}
                        {!hideAttachmentOnlyText ? (
                          <p className="whitespace-pre-wrap break-words">{text}</p>
                        ) : null}
                        {isUser && meta?.attachments && meta.attachments.length > 0 ? (
                          <div className={cn('space-y-2', !hideAttachmentOnlyText && 'mt-2')}>
                            {meta.attachments.map((a) => (
                              <ChatAttachmentBubble
                                key={a.id}
                                name={a.name}
                                size={a.size}
                                mimeType={a.mimeType}
                                objectUrl={a.objectUrl}
                                variant="onUserBubble"
                              />
                            ))}
                          </div>
                        ) : null}
                        {!isUser && meta?.actions?.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {meta.actions.map((action) => {
                              const href = actionHref(action.id);
                              return href ? (
                                <Link
                                  key={action.id}
                                  href={href}
                                  className="rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-[11px] font-medium text-violet-700 transition-colors hover:bg-violet-500/15 dark:text-violet-200"
                                >
                                  {action.label}
                                </Link>
                              ) : (
                                <span
                                  key={action.id}
                                  className="rounded-full border border-slate-900/[0.08] bg-black/[0.03] px-3 py-1 text-[11px] font-medium text-muted-foreground dark:border-white/[0.08] dark:bg-white/[0.04]"
                                >
                                  {action.label}
                                </span>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem onSelect={() => void copyMessageText(text)}>
                        复制内容
                      </ContextMenuItem>
                      <ContextMenuItem
                        variant="destructive"
                        onSelect={() => deleteAgentMessageById(m.id)}
                      >
                        删除该条
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                </div>
              );
            })
          : null}

        {mode === 'agent' && isCourseOrchestrator && orchestratorPipelineProgress ? (
          <OrchestratorNotebookProgressPanel progress={orchestratorPipelineProgress} />
        ) : mode === 'agent' && isCourseOrchestrator && orchestratorRemoteTask ? (
          <OrchestratorRemoteTaskBanner
            detail={orchestratorRemoteTask.detail}
            notebookId={orchestratorRemoteTask.notebookId}
          />
        ) : sending ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {mode === 'notebook' ? '正在询问笔记本…' : '正在回复…'}
          </div>
        ) : null}
      </div>

      <footer className="shrink-0 border-t border-slate-900/[0.06] px-4 pb-4 pt-3 dark:border-white/[0.06]">
        {mode === 'agent' && isCourseOrchestrator && orchestratorViewMode === 'private' ? (
          <Tabs
            value={orchestratorComposerMode}
            onValueChange={(v) => {
              const mode = v as OrchestratorComposerMode;
              setOrchestratorComposerMode(mode);
              const next = new URLSearchParams(searchParams.toString());
              next.set('composer', mode);
              router.replace(`/chat?${next.toString()}`, { scroll: false });
            }}
            className="mb-2 w-full"
          >
            <TabsList
              variant="default"
              className="grid min-h-9 w-full min-w-0 grid-cols-2 gap-0 p-[3px]"
            >
              <TabsTrigger value="send-message" className="text-xs">
                发送消息
              </TabsTrigger>
              <TabsTrigger value="generate-notebook" className="text-xs">
                生成笔记本
              </TabsTrigger>
            </TabsList>
            <TabsContent value="send-message" className="hidden" tabIndex={-1} aria-hidden />
            <TabsContent value="generate-notebook" className="hidden" tabIndex={-1} aria-hidden />
          </Tabs>
        ) : null}
        <ComposerInputShell>
          {(mode === 'notebook' || (mode === 'agent' && isCourseOrchestrator)) &&
          pendingAttachments.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 border-b border-border/40 px-3 py-2">
              {pendingAttachments.map((a) => (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-white/70 px-2 py-0.5 text-[11px] text-foreground dark:bg-black/30"
                >
                  <Paperclip className="size-3" />
                  <span className="max-w-[200px] truncate">{a.name}</span>
                  <button
                    type="button"
                    className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
                    onClick={() => removePendingAttachment(a.id)}
                    aria-label={`移除附件 ${a.name}`}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              mode === 'none'
                ? '请选择左侧联系人…'
                : mode === 'notebook'
                  ? '向该笔记本提问…'
                  : isCourseOrchestrator
                    ? orchestratorViewMode === 'group'
                      ? '在课程协作群聊中发起多方协作…'
                      : orchestratorComposerMode === 'send-message'
                        ? '向课程总控提问：概念、安排、答疑等（不自动创建笔记本）…'
                        : '描述要生成的笔记本主题与要求，可添加 PDF、Markdown 等附件…'
                    : `与 ${selectedAgent?.name ?? 'Agent'} 对话…`
            }
            disabled={mode === 'none' || sending}
            className={cn(
              composerTextareaClassName,
              'min-h-[100px] max-h-[min(40vh,280px)] resize-y px-4 pt-1 pb-2 text-[13px] leading-relaxed md:text-[13px]',
            )}
            rows={4}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (mode === 'notebook') void handleSendNotebook();
                else if (mode === 'agent') void handleSendAgent();
              }
            }}
          />

          {/* 与创建页一致的底栏：左侧工具区 · 语音 · 主按钮 */}
          <div className="flex items-end gap-2 px-3 pb-3">
            <div className="min-h-8 flex-1 min-w-0">
              {mode === 'notebook' ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 rounded-lg border-border/60 bg-white/50 text-xs dark:bg-black/20"
                    onClick={openAttachmentPicker}
                    disabled={sending}
                  >
                    <Paperclip className="mr-1 size-3.5" />
                    添加附件
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      void onPickAttachments(e.target.files);
                    }}
                  />
                  <GenerationModelSelector onSettingsOpen={openSettings} />
                  <ComposerVoiceSelector onSettingsOpen={openSettings} />
                </div>
              ) : mode === 'agent' && isCourseOrchestrator ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 rounded-lg border-border/60 bg-white/50 text-xs dark:bg-black/20"
                    onClick={openAttachmentPicker}
                    disabled={sending}
                  >
                    <Paperclip className="mr-1 size-3.5" />
                    添加附件
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      void onPickAttachments(e.target.files);
                    }}
                  />
                  <GenerationModelSelector onSettingsOpen={openSettings} />
                  <ComposerVoiceSelector onSettingsOpen={openSettings} />
                </div>
              ) : null}
            </div>

            <SpeechButton
              size="md"
              disabled={
                mode === 'none' ||
                sending ||
                (mode === 'agent' &&
                  isCourseOrchestrator &&
                  !draft.trim() &&
                  pendingAttachments.length === 0)
              }
              onTranscription={(text) => {
                setDraft((prev) => {
                  const next = prev + (prev ? ' ' : '') + text;
                  return next;
                });
              }}
            />

            <button
              type="button"
              disabled={
                mode === 'none' ||
                sending ||
                (mode === 'notebook' && !draft.trim()) ||
                (mode === 'agent' &&
                  !draft.trim() &&
                  (!isCourseOrchestrator || pendingAttachments.length === 0))
              }
              onClick={() => {
                if (mode === 'notebook') void handleSendNotebook();
                else if (mode === 'agent') void handleSendAgent();
              }}
              className={cn(
                'shrink-0 flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 transition-all',
                mode !== 'none' &&
                  !sending &&
                  (draft.trim() || (isCourseOrchestrator && pendingAttachments.length > 0))
                  ? 'cursor-pointer bg-primary text-primary-foreground shadow-sm hover:opacity-90'
                  : 'cursor-not-allowed bg-muted text-muted-foreground/40',
              )}
            >
              {sending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <>
                  <span className="text-xs font-medium">{t('chat.send')}</span>
                  <ArrowUp className="size-3.5" />
                </>
              )}
            </button>
          </div>
        </ComposerInputShell>
      </footer>

      <Dialog
        open={Boolean(selectedChildTask)}
        onOpenChange={(open) => {
          if (!open) setSelectedChildTaskId(null);
        }}
      >
        <DialogContent className="max-h-[80dvh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedChildTask?.title || '子任务详情'}</DialogTitle>
            <DialogDescription>
              查看该子任务的协议事件快照、路由信息与最新 payload。
            </DialogDescription>
          </DialogHeader>

          {selectedChildTask ? (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-900/[0.08] bg-muted/20 p-3 dark:border-white/[0.1]">
                <div>
                  <p className="text-[11px] text-muted-foreground">状态</p>
                  <p className="font-medium">{selectedChildTask.status}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">更新时间</p>
                  <p className="font-medium">{formatTs(selectedChildTask.updatedAt)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[11px] text-muted-foreground">详情</p>
                  <p className="font-medium">{selectedChildTask.detail || 'N/A'}</p>
                </div>
              </div>

              {selectedChildTask.lastEnvelope ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Protocol Envelope
                  </p>
                  <div className="rounded-lg border border-slate-900/[0.08] bg-white/70 p-3 dark:border-white/[0.1] dark:bg-black/30">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">type</span>
                        <p className="font-medium">{selectedChildTask.lastEnvelope.type}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">protocol</span>
                        <p className="font-medium">{selectedChildTask.lastEnvelope.protocol}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">messageId</span>
                        <p className="font-mono text-[11px] break-all">
                          {selectedChildTask.lastEnvelope.messageId}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">conversationId</span>
                        <p className="font-mono text-[11px] break-all">
                          {selectedChildTask.lastEnvelope.conversationId}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">sender</span>
                        <p>
                          {selectedChildTask.lastEnvelope.sender.name} (
                          {selectedChildTask.lastEnvelope.sender.role})
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">receiver</span>
                        <p>
                          {selectedChildTask.lastEnvelope.receiver.name} (
                          {selectedChildTask.lastEnvelope.receiver.role})
                        </p>
                      </div>
                      <div className="col-span-2">
                        <span className="text-muted-foreground">createdAt</span>
                        <p>{formatTs(selectedChildTask.lastEnvelope.createdAt)}</p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <p className="mb-1 text-xs text-muted-foreground">payload</p>
                      <pre className="max-h-72 overflow-auto rounded bg-black/90 p-3 text-[11px] leading-relaxed text-slate-100">
                        {JSON.stringify(selectedChildTask.lastEnvelope.payload, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">该任务尚无 envelope 快照。</p>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
