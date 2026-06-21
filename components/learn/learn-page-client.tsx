'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  AlertTriangle,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Cpu,
  FileText,
  LibraryBig,
  Loader2,
  MessageSquarePlus,
  MoreHorizontal,
  Pin,
  Play,
  Plus,
  RefreshCcw,
  SendHorizontal,
  ShoppingBag,
  Target,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import type { UIMessage } from 'ai';
import { MessageResponse } from '@/components/ai-elements/message';
import { CourseMaterialsPanel } from '@/components/courses/course-materials-panel';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { usePersistHydrated } from '@/lib/hooks/use-persist-hydrated';
import { useAuthStore } from '@/lib/store/auth';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { useSettingsStore } from '@/lib/store/settings';
import { addMemoryActivity, updateMemoryActivity } from '@/lib/store/memory-activity';
import {
  askCourseOrchestrator,
  type CourseChatImageAttachment,
} from '@/lib/chat/ask-course-orchestrator';
import {
  buildCourseReplyProgress,
  dispatchCourseReplyProgress,
} from '@/lib/chat/course-reply-progress';
import type { ChatMessageMetadata, CourseChatContext } from '@/lib/types/chat';
import type { ParsedPdfContent } from '@/lib/types/pdf';
import {
  createPracticePlan,
  deletePracticePlan,
  listPracticePlans,
  loadLearnerCourseState,
  previewLearnerProgressCheckpoint,
  recordLearnerQuestion,
  saveLearnerCourseState,
  savePracticePlan,
  seedLearnerCourseStateFromCourse,
  setLearnerPlanningScope,
  setLearnerProgressCheckpoint,
  summarizeLearnerCourseState,
  type LearnerCourseSnapshot,
  type LearnerCourseState,
  type LearnerProgressCheckpointKind,
  type PracticePlan,
  type PracticePlanMode,
} from '@/lib/learning/course-learner-state';
import type { ProviderId } from '@/lib/ai/providers';
import { resolveCourseAvatarDisplayUrl } from '@/lib/constants/course-avatars';
import { cn } from '@/lib/utils';
import type { CourseRecord } from '@/lib/utils/database';
import { backendJson } from '@/lib/utils/backend-api';
import { listCourses } from '@/lib/utils/course-storage';
import {
  listCourseProblemSummaries,
  type CourseProblemClientSummary,
} from '@/lib/utils/notebook-problem-api';
import {
  listRemotePracticePlans,
  loadRemoteLearnerCourseState,
  saveRemoteLearnerCourseState,
  saveRemotePracticePlan,
} from '@/lib/utils/learner-course-api';
import {
  listRemoteLearnSessions,
  loadRemoteLearnConversation,
  syncRemoteLearnConversation,
  type RemoteLearnChatSession,
  type RemoteLearnMessage,
  type RemoteLearnMessagePayload,
} from '@/lib/utils/learn-conversation-api';
import { listStagesByCourse, type StageListItem } from '@/lib/utils/stage-storage';
import { normalizeLooseMathDelimiters } from '@/lib/math-engine';

type LearnMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: number;
  attachments?: LearnImageAttachment[];
  plan?: PracticePlan;
  progressProposal?: ProgressProposal;
  pendingAction?: PendingCourseAction;
};

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

type LearnImageAttachment = CourseChatImageAttachment & {
  objectUrl: string;
  width?: number;
  height?: number;
};

type LearnModelOption = {
  value: string;
  providerId: ProviderId;
  modelId: string;
  providerName: string;
  modelName: string;
  vision: boolean | null;
};

type PendingCourseAction =
  | {
      kind: 'practice_plan';
      mode: PracticePlanMode;
      prompt: string;
    }
  | {
      kind: 'review_plan';
      prompt: string;
    };

type PlanningIntent =
  | {
      kind: 'practice_plan';
      mode: PracticePlanMode;
    }
  | {
      kind: 'review_plan';
    };

type ProgressProposal = {
  selection: string;
  label: string;
  reason: string;
  confirmed?: boolean;
  title?: string;
  confirmLabel?: string;
  writeMode?: 'progress' | 'planning_scope';
};

type LearnLayeredMemoryContextResponse = {
  knowledgeMatches?: Array<{ id: string }>;
};

type CourseSourceUploadKind = 'pdf' | 'markdown' | 'plain_text' | 'pptx' | 'problem_bank' | 'other';

type CourseSourceIngestResponse = {
  ingest: {
    source: {
      title: string;
      kind: CourseSourceUploadKind;
      textChars: number;
      processedChars: number;
      truncated: boolean;
      courseCode: string | null;
    };
    classification: {
      allQuestionUpload: boolean;
      topic: string;
      problemSignalCount: number;
      templateSignalCount: number;
    };
    knowledgeGraph: {
      factId: string | null;
      nodeCount: number;
      edgeCount: number;
    };
    problems: {
      extractedCount: number;
      insertedCount: number;
      duplicateCount: number;
      importBatchId: string | null;
      usage: {
        inputTokens: number;
        outputTokens: number;
        cachedInputTokens: number;
        estimatedCostCredits: number | null;
      } | null;
    };
    memory: {
      writtenCount: number;
      templateCount: number;
      publicNotebookMemoryCount: number;
      skippedPublicNotebookMemory: boolean;
    };
    notebook: {
      id: string;
      name: string;
      created: boolean;
      sectionId: string | null;
      sectionTitle: string | null;
    } | null;
  };
};

type LearnSourceUploadStatus = 'ingesting' | 'stored' | 'failed';

type LearnSourceUploadItem = {
  id: string;
  fileName: string;
  sourceKind: CourseSourceUploadKind;
  status: LearnSourceUploadStatus;
  createdAt: number;
  updatedAt: number;
  summary?: string;
  error?: string;
};

const quickPrompts = [
  '我现在学到哪里了？',
  '帮我安排今天复习',
  '给我开一个小测',
  '我最近哪里最薄弱？',
];
const calendarWeekdays = ['日', '一', '二', '三', '四', '五', '六'];

const PROGRESS_SELECTION_NOT_STARTED = '__not_started__';
const PROGRESS_SELECTION_COMPLETED_ALL = '__completed_all__';
const MODEL_VALUE_SEPARATOR = '\u001e';
const MAX_LEARN_CHAT_IMAGES = 4;
const MAX_LEARN_CHAT_IMAGE_BYTES = 8 * 1024 * 1024;
const LEARN_CHAT_IMAGE_MAX_DIMENSION = 1280;
const MAX_LEARN_SOURCE_TEXT_FILE_BYTES = 4 * 1024 * 1024;
const MAX_LEARN_SOURCE_DOCUMENT_BYTES = 18 * 1024 * 1024;
const MAX_SYLLABUS_TEXT_FILE_BYTES = 2 * 1024 * 1024;
const MAX_SYLLABUS_PDF_FILE_BYTES = 12 * 1024 * 1024;
const LEARN_SESSION_INDEX_PREFIX = 'syntara-learn-session-index:v1';
const LEARN_SESSION_MESSAGES_PREFIX = 'syntara-learn-session-messages:v1';
const LEARN_LEFT_RAIL_COLLAPSED_STORAGE_KEY = 'syntara-learn-left-rail-collapsed';
const LEARN_RIGHT_RAIL_COLLAPSED_STORAGE_KEY = 'syntara-learn-right-rail-collapsed';
const LEARN_SYLLABUS_EVENTS_PREFIX = 'syntara-learn-syllabus-events:v1';
const LEARN_DELETED_PRACTICE_PLAN_IDS_PREFIX = 'syntara-learn-deleted-practice-plan-ids:v1';

type LearnChatSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

type LearnRightRailView = 'sessions' | 'calendar' | 'learning';

type SyllabusEventKind = 'assignment' | 'exam' | 'progress' | 'tutorial' | 'holiday' | 'other';

type SyllabusCalendarEvent = {
  id: string;
  title: string;
  kind: SyllabusEventKind;
  date: string;
  sourceName: string;
  createdAt: number;
  week?: string | null;
  sourceColumn?: string | null;
  rawText?: string | null;
  confidence?: number | null;
};

type SyllabusImportMode = 'file' | 'plan';
type SyllabusCommitMode = 'merge' | 'replace';
type StatusCalendarActivity = {
  id: string;
  source: 'plan' | 'syllabus';
  sourceId: string;
  title: string;
  date: string;
  meta: string;
  dotClassName: string;
  actionLabel?: string;
};

type ParsedSyllabusFileEvent = {
  title: string;
  kind: SyllabusEventKind;
  date: string;
  week?: string | null;
  sourceColumn?: string | null;
  rawText?: string | null;
  confidence?: number | null;
};

function makeLearnSessionId() {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function getInitialLearnRailCollapsed(storageKey: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(storageKey) === '1';
  } catch {
    return false;
  }
}

function learnSessionIndexKey(userId: string, courseId: string) {
  return [
    LEARN_SESSION_INDEX_PREFIX,
    encodeURIComponent(userId),
    encodeURIComponent(courseId),
  ].join(':');
}

function learnSessionMessagesKey(userId: string, courseId: string, sessionId: string) {
  return [
    LEARN_SESSION_MESSAGES_PREFIX,
    encodeURIComponent(userId),
    encodeURIComponent(courseId),
    encodeURIComponent(sessionId),
  ].join(':');
}

function readLearnSessions(userId: string, courseId: string): LearnChatSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(learnSessionIndexKey(userId, courseId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<LearnChatSession>[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is LearnChatSession =>
        Boolean(
          item &&
          typeof item.id === 'string' &&
          typeof item.title === 'string' &&
          typeof item.createdAt === 'number' &&
          typeof item.updatedAt === 'number',
        ),
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 12);
  } catch {
    return [];
  }
}

function writeLearnSessions(userId: string, courseId: string, sessions: LearnChatSession[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      learnSessionIndexKey(userId, courseId),
      JSON.stringify(sessions.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12)),
    );
  } catch {
    /* localStorage may be unavailable */
  }
}

function pruneDuplicateBlankLearnSessions(
  userId: string,
  courseId: string,
  sessions: LearnChatSession[],
  preferredSessionId: string,
): LearnChatSession[] {
  const blankSessionIds = new Set(
    sessions
      .filter((session) =>
        learnSessionIsBlank(readLearnSessionMessages(userId, courseId, session.id)),
      )
      .map((session) => session.id),
  );
  if (blankSessionIds.size <= 1) return sessions;

  const preferredBlankId = blankSessionIds.has(preferredSessionId)
    ? preferredSessionId
    : sessions.find((session) => blankSessionIds.has(session.id))?.id;
  return sessions.filter(
    (session) => !blankSessionIds.has(session.id) || session.id === preferredBlankId,
  );
}

function readLearnSessionMessages(
  userId: string,
  courseId: string,
  sessionId: string,
): LearnMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(learnSessionMessagesKey(userId, courseId, sessionId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LearnMessage[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((message): message is LearnMessage =>
      Boolean(
        message &&
        typeof message.id === 'string' &&
        (message.role === 'user' || message.role === 'assistant') &&
        typeof message.text === 'string' &&
        typeof message.createdAt === 'number',
      ),
    );
  } catch {
    return [];
  }
}

function writeLearnSessionMessages(
  userId: string,
  courseId: string,
  sessionId: string,
  messages: LearnMessage[],
) {
  if (typeof window === 'undefined') return;
  try {
    const serializableMessages = messages.map((message) => ({
      ...message,
      attachments: undefined,
    }));
    localStorage.setItem(
      learnSessionMessagesKey(userId, courseId, sessionId),
      JSON.stringify(serializableMessages.slice(-80)),
    );
  } catch {
    /* localStorage may be unavailable */
  }
}

function mergeLearnSessions(
  current: LearnChatSession[],
  incoming: Array<LearnChatSession | RemoteLearnChatSession>,
): LearnChatSession[] {
  const byId = new Map<string, LearnChatSession>();
  for (const session of current) byId.set(session.id, session);
  for (const session of incoming) {
    const existing = byId.get(session.id);
    if (!existing || session.updatedAt >= existing.updatedAt) {
      byId.set(session.id, {
        id: session.id,
        title: session.title || existing?.title || '新对话',
        createdAt: session.createdAt || existing?.createdAt || Date.now(),
        updatedAt: session.updatedAt || existing?.updatedAt || Date.now(),
      });
    }
  }
  return Array.from(byId.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 12);
}

function remoteMessageToLearnMessage(message: RemoteLearnMessage): LearnMessage {
  return {
    id: message.id,
    role: message.role,
    text: message.text || '',
    createdAt: message.createdAt || Date.now(),
    plan: message.plan == null ? undefined : (message.plan as PracticePlan),
    progressProposal:
      message.progressProposal == null ? undefined : (message.progressProposal as ProgressProposal),
    pendingAction:
      message.pendingAction == null ? undefined : (message.pendingAction as PendingCourseAction),
  };
}

function learnMessageToRemotePayload(message: LearnMessage): RemoteLearnMessagePayload {
  return {
    id: message.id,
    role: message.role,
    text: message.text,
    createdAt: message.createdAt,
    plan: message.plan,
    progressProposal: message.progressProposal,
    pendingAction: message.pendingAction,
    attachments: message.attachments?.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      width: attachment.width,
      height: attachment.height,
    })),
  };
}

function copyableLearnMessageText(message: LearnMessage): string {
  const parts = [
    message.text.trim(),
    message.plan?.title ? `计划：${message.plan.title}` : '',
    message.progressProposal?.label ? `学习范围：${message.progressProposal.label}` : '',
    message.attachments?.length ? `[附件 ${message.attachments.length} 个]` : '',
  ].filter(Boolean);
  return parts.join('\n').trim();
}

function syllabusEventsKey(userId: string, courseId: string) {
  return [
    LEARN_SYLLABUS_EVENTS_PREFIX,
    encodeURIComponent(userId),
    encodeURIComponent(courseId),
  ].join(':');
}

function deletedPracticePlanIdsKey(userId: string, courseId: string) {
  return [
    LEARN_DELETED_PRACTICE_PLAN_IDS_PREFIX,
    encodeURIComponent(userId),
    encodeURIComponent(courseId),
  ].join(':');
}

function readDeletedPracticePlanIds(userId: string, courseId: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(deletedPracticePlanIdsKey(userId, courseId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string' && id.length > 0));
  } catch {
    return new Set();
  }
}

function writeDeletedPracticePlanIds(userId: string, courseId: string, ids: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      deletedPracticePlanIdsKey(userId, courseId),
      JSON.stringify(Array.from(ids).slice(-120)),
    );
  } catch {
    /* localStorage may be unavailable */
  }
}

function rememberDeletedPracticePlanId(userId: string, courseId: string, planId: string) {
  const next = readDeletedPracticePlanIds(userId, courseId);
  next.add(planId);
  writeDeletedPracticePlanIds(userId, courseId, next);
}

function visiblePracticePlans(plans: PracticePlan[], deletedIds: Set<string>): PracticePlan[] {
  if (deletedIds.size === 0) return plans;
  return plans.filter((plan) => !deletedIds.has(plan.id));
}

function readSyllabusEvents(userId: string, courseId: string): SyllabusCalendarEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(syllabusEventsKey(userId, courseId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<SyllabusCalendarEvent>[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is SyllabusCalendarEvent =>
        Boolean(
          item &&
          typeof item.id === 'string' &&
          typeof item.title === 'string' &&
          typeof item.date === 'string' &&
          typeof item.sourceName === 'string' &&
          typeof item.createdAt === 'number' &&
          ['assignment', 'exam', 'progress', 'tutorial', 'holiday', 'other'].includes(
            String(item.kind),
          ),
        ),
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
      .slice(0, 120);
  } catch {
    return [];
  }
}

function writeSyllabusEvents(userId: string, courseId: string, events: SyllabusCalendarEvent[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(syllabusEventsKey(userId, courseId), JSON.stringify(events.slice(0, 120)));
  } catch {
    /* localStorage may be unavailable */
  }
}

function isSyllabusPdfFile(file: File) {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

function isPptxSourceFile(file: File) {
  const mime = (file.type || '').toLowerCase();
  return (
    mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    /\.pptx$/i.test(file.name)
  );
}

function learnSourceKindForFile(file: File): CourseSourceUploadKind {
  const lowerName = file.name.toLowerCase();
  const mime = (file.type || '').toLowerCase();
  if (isSyllabusPdfFile(file)) return 'pdf';
  if (isPptxSourceFile(file)) return 'pptx';
  if (mime.includes('markdown') || lowerName.endsWith('.md') || lowerName.endsWith('.markdown')) {
    return 'markdown';
  }
  if (lowerName.includes('problem') || lowerName.includes('question') || lowerName.includes('题')) {
    return 'problem_bank';
  }
  if (mime.startsWith('text/') || /\.(txt|csv|json)$/i.test(file.name)) return 'plain_text';
  return 'other';
}

function isLearnSourceDocumentFile(file: File) {
  if (file.type.startsWith('image/')) return false;
  return (
    isSyllabusPdfFile(file) ||
    isPptxSourceFile(file) ||
    /\.(txt|md|markdown|csv|json)$/i.test(file.name) ||
    (file.type || '').startsWith('text/')
  );
}

function pdfParseApiError(data: unknown, fallback: string) {
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
    return data.error;
  }
  return fallback;
}

async function parseSyllabusPdfWithOpenAI(
  file: File,
  options: {
    courseName?: string;
    courseDescription?: string;
  },
): Promise<{
  events: ParsedSyllabusFileEvent[];
  warnings: string[];
}> {
  const formData = new FormData();
  formData.append('pdf', file);
  if (options.courseName) formData.append('courseName', options.courseName);
  if (options.courseDescription) formData.append('courseDescription', options.courseDescription);

  const response = await fetch('/api/syllabus/parse', {
    method: 'POST',
    body: formData,
  });
  const data = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    events?: ParsedSyllabusFileEvent[];
    warnings?: string[];
    error?: string;
  };
  if (!response.ok || data.success === false || !Array.isArray(data.events)) {
    throw new Error(pdfParseApiError(data, `AI 读取 syllabus 失败：HTTP ${response.status}`));
  }
  return {
    events: data.events,
    warnings: Array.isArray(data.warnings) ? data.warnings.filter(Boolean) : [],
  };
}

async function readSyllabusFileText(
  file: File,
  options: {
    pdfProviderId: string;
    pdfProviderConfig?: { apiKey?: string; baseUrl?: string };
  },
) {
  if (!isSyllabusPdfFile(file)) {
    return file.text();
  }

  const formData = new FormData();
  formData.append('providerId', options.pdfProviderId || 'unpdf');
  if (options.pdfProviderConfig?.apiKey)
    formData.append('apiKey', options.pdfProviderConfig.apiKey);
  if (options.pdfProviderConfig?.baseUrl) {
    formData.append('baseUrl', options.pdfProviderConfig.baseUrl);
  }
  formData.append('pdf', file);

  const response = await fetch('/api/parse-pdf', {
    method: 'POST',
    body: formData,
  });
  const data = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    data?: ParsedPdfContent;
    error?: string;
  };
  if (!response.ok || data.success === false || !data.data) {
    throw new Error(pdfParseApiError(data, `PDF 读取失败：HTTP ${response.status}`));
  }
  const text = (data.data.text || '').trim();
  if (!text) throw new Error('PDF 读取完成，但没有提取到可用文字。');
  return text;
}

async function readLearnSourceFileText(
  file: File,
  options: {
    pdfProviderId: string;
    pdfProviderConfig?: { apiKey?: string; baseUrl?: string };
  },
) {
  if (isPptxSourceFile(file)) {
    const formData = new FormData();
    formData.append('pptx', file);
    const response = await fetch('/api/parse-pptx', {
      method: 'POST',
      body: formData,
    });
    const data = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      data?: { text?: string };
      error?: string;
    };
    if (!response.ok || data.success === false || !data.data) {
      throw new Error(pdfParseApiError(data, `PPTX 读取失败：HTTP ${response.status}`));
    }
    const text = (data.data.text || '').trim();
    if (!text) throw new Error('PPTX 读取完成，但没有提取到可用文字。');
    return text;
  }

  return readSyllabusFileText(file, options);
}

function formatSourceIngestMessage(fileName: string, result: CourseSourceIngestResponse['ingest']) {
  const allQuestionLine = result.classification.allQuestionUpload
    ? '判定为全题目文件，已跳过公共记忆补充和纯文本笔记本整理。'
    : result.notebook
      ? `${result.notebook.created ? '创建' : '更新'}笔记本「${result.notebook.name}」，写入 section「${result.notebook.sectionTitle || '上传资料'}」。`
      : '没有写入笔记本 section。';
  const tokenLine = result.problems.usage
    ? `题库抽取用量：input ${result.problems.usage.inputTokens}，output ${result.problems.usage.outputTokens}。`
    : '题库抽取没有额外模型用量或只使用了启发式解析。';
  return [
    `已读取并处理《${fileName}》。`,
    `主题：${result.classification.topic}。`,
    `知识图谱：${result.knowledgeGraph.nodeCount} 个节点，${result.knowledgeGraph.edgeCount} 条关系。`,
    `题库：识别 ${result.problems.extractedCount} 题，新增 ${result.problems.insertedCount} 题，跳过重复 ${result.problems.duplicateCount} 题。`,
    `模板库/公共记忆：写入 ${result.memory.writtenCount} 条，其中模板 ${result.memory.templateCount} 条，笔记本公共记忆 ${result.memory.publicNotebookMemoryCount} 条。`,
    allQuestionLine,
    result.source.truncated ? '原文较长，已按摄取预算截断后处理。' : '',
    tokenLine,
  ]
    .filter(Boolean)
    .join('\n');
}

function formatSourceUploadStatusSummary(result: CourseSourceIngestResponse['ingest']) {
  const notebookLine = result.classification.allQuestionUpload
    ? '全题目文件，已跳过公共记忆和笔记本整理'
    : result.notebook
      ? `${result.notebook.created ? '新建' : '更新'}笔记本「${result.notebook.name}」`
      : '未写入笔记本';
  return [
    `${result.classification.topic}`,
    `新增 ${result.problems.insertedCount} 题，重复 ${result.problems.duplicateCount} 题`,
    `知识图谱 ${result.knowledgeGraph.nodeCount} 点 / ${result.knowledgeGraph.edgeCount} 边`,
    notebookLine,
  ].join(' · ');
}

function sourceUploadLive2DLine(fileName: string, result: CourseSourceIngestResponse['ingest']) {
  if (result.classification.allQuestionUpload) {
    return `《${fileName}》题目入库完成：新增 ${result.problems.insertedCount} 题，跳过 ${result.problems.duplicateCount} 个重复。`;
  }
  const notebook = result.notebook
    ? `${result.notebook.created ? '新建' : '更新'}了「${result.notebook.name}」`
    : '已更新可检索资料';
  return `《${fileName}》已入库，${notebook}，并同步了题库和知识图谱。`;
}

function notifySourceUploadLive2D(fileName: string, result: CourseSourceIngestResponse['ingest']) {
  const progress = buildCourseReplyProgress({
    phase: 'completed',
    agentName: '资料入库',
  });
  dispatchCourseReplyProgress({
    ...progress,
    title: '课程资料入库',
    line: sourceUploadLive2DLine(fileName, result),
  });
}

function notifySourceUploadFailureLive2D(fileName: string, message: string) {
  const progress = buildCourseReplyProgress({
    phase: 'failed',
    agentName: '资料入库',
  });
  dispatchCourseReplyProgress({
    ...progress,
    title: '课程资料入库',
    line: `《${fileName}》入库失败：${message}`,
  });
}

function sourceUploadStatusLabel(status: LearnSourceUploadStatus) {
  if (status === 'ingesting') return '入库中';
  if (status === 'stored') return '已入库';
  return '入库失败';
}

function mergeSyllabusEvents(
  existingEvents: SyllabusCalendarEvent[],
  incomingEvents: SyllabusCalendarEvent[],
) {
  const byKey = new Map<string, SyllabusCalendarEvent>();
  for (const event of [...existingEvents, ...incomingEvents]) {
    byKey.set(`${event.date}:${event.kind}:${event.title.toLowerCase()}`, event);
  }
  return Array.from(byKey.values()).sort(
    (a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title),
  );
}

function modelOptionValue(providerId: ProviderId, modelId: string): string {
  return `${providerId}${MODEL_VALUE_SEPARATOR}${modelId}`;
}

function parseModelOptionValue(value: string): { providerId: ProviderId; modelId: string } | null {
  const separatorIndex = value.indexOf(MODEL_VALUE_SEPARATOR);
  if (separatorIndex < 0) return null;
  return {
    providerId: value.slice(0, separatorIndex) as ProviderId,
    modelId: value.slice(separatorIndex + 1),
  };
}

function compactBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('图片读取失败'));
    reader.onerror = () => reject(reader.error ?? new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片解析失败'));
    image.src = src;
  });
}

async function prepareLearnImageAttachment(file: File): Promise<LearnImageAttachment> {
  if (!file.type.startsWith('image/')) {
    throw new Error('请选择图片文件。');
  }
  if (file.size > MAX_LEARN_CHAT_IMAGE_BYTES) {
    throw new Error(`图片不能超过 ${compactBytes(MAX_LEARN_CHAT_IMAGE_BYTES)}。`);
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  let dataUrl = rawDataUrl;
  let mimeType = file.type || 'image/png';
  let width: number | undefined;
  let height: number | undefined;

  if (!/image\/(?:gif|svg\+xml)/.test(mimeType)) {
    const image = await loadImageElement(rawDataUrl);
    width = image.naturalWidth;
    height = image.naturalHeight;
    const longestEdge = Math.max(width, height);
    if (longestEdge > LEARN_CHAT_IMAGE_MAX_DIMENSION) {
      const scale = LEARN_CHAT_IMAGE_MAX_DIMENSION / longestEdge;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('图片压缩失败');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      mimeType = 'image/jpeg';
      dataUrl = canvas.toDataURL(mimeType, 0.86);
      width = canvas.width;
      height = canvas.height;
    }
  }

  const id = makeClientId('learn-image');
  return {
    id,
    name: file.name.trim() || '图片',
    mimeType,
    size: file.size,
    dataUrl,
    objectUrl: dataUrl,
    width,
    height,
  };
}

function buildLearnModelOptions(
  providersConfig: ReturnType<typeof useSettingsStore.getState>['providersConfig'],
): LearnModelOption[] {
  const options: LearnModelOption[] = [];
  for (const [rawProviderId, config] of Object.entries(providersConfig)) {
    const providerId = rawProviderId as ProviderId;
    if (
      !config ||
      (config.requiresApiKey && !config.apiKey && !config.isServerConfigured) ||
      !(config.baseUrl || config.defaultBaseUrl || config.serverBaseUrl)
    ) {
      continue;
    }

    let models = config.models || [];
    if (config.isServerConfigured && !config.apiKey && config.serverModels?.length) {
      const allowed = new Set(config.serverModels);
      models = models.filter((model) => allowed.has(model.id));
    }

    for (const model of models) {
      options.push({
        value: modelOptionValue(providerId, model.id),
        providerId,
        modelId: model.id,
        providerName: config.name || providerId,
        modelName: model.name || model.id,
        vision: model.capabilities?.vision ?? null,
      });
    }
  }
  return options;
}

const courseMarkdownClassName = cn(
  'w-full max-w-none select-text break-words text-[15.5px] leading-7 text-foreground',
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
  '[&_p]:my-3',
  '[&_strong]:font-semibold [&_strong]:text-foreground',
  '[&_h1]:mb-4 [&_h1]:mt-8 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:leading-tight',
  '[&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:border-b [&_h2]:border-border [&_h2]:pb-3 [&_h2]:text-xl [&_h2]:font-semibold',
  '[&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold',
  '[&_ul]:my-4 [&_ol]:my-4 [&_ul]:space-y-1.5 [&_ol]:space-y-1.5 [&_ul]:pl-6 [&_ol]:pl-6',
  '[&_li]:pl-1',
  '[&_blockquote]:my-5 [&_blockquote]:border-l-4 [&_blockquote]:border-muted-foreground/25 [&_blockquote]:pl-4 [&_blockquote]:font-medium',
  '[&_blockquote]:text-foreground [&_blockquote_p]:my-0',
  '[&_hr]:my-8 [&_hr]:border-border',
  '[&_code]:rounded-md [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em]',
  '[&_[data-streamdown=code-block]]:my-5 [&_[data-streamdown=code-block]]:rounded-lg [&_[data-streamdown=code-block]]:border [&_[data-streamdown=code-block]]:border-border [&_[data-streamdown=code-block]]:bg-muted/60',
  '[&_[data-streamdown=code-block-body]]:text-sm [&_[data-streamdown=code-block-body]]:leading-6',
  '[&_table]:my-5 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:rounded-lg [&_table]:border [&_table]:border-border',
  '[&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-sm [&_th]:font-semibold',
  '[&_td]:border-b [&_td]:border-border/70 [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_td]:text-sm',
);

function makeClientId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function learnMessageHasContent(message: LearnMessage): boolean {
  return Boolean(
    message.text.trim() ||
    message.attachments?.length ||
    message.plan ||
    message.progressProposal ||
    message.pendingAction,
  );
}

function learnSessionIsBlank(messages: LearnMessage[]): boolean {
  return !messages.some(learnMessageHasContent);
}

function normalizeLearnSessionTitle(text: string): string {
  const compact = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#*_`>\[\]()]/g, ' ')
    .replace(/[\/／]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const firstSentence = compact.split(/[。！？!?]/).find((part) => part.trim()) || compact;
  let title = firstSentence.trim();
  for (let index = 0; index < 4; index += 1) {
    const next = title
      .replace(/^(老师|ai|AI)[，,：:\s]*/i, '')
      .replace(/^(请帮我|可以帮我|麻烦你|帮我|帮忙|我想要|我想|请问|问一下)[，,：:\s]*/i, '')
      .trim();
    if (next === title) break;
    title = next;
  }
  if (!title) return '';
  return title.length > 24 ? `${title.slice(0, 24)}...` : title;
}

function learnSessionTitleFromMessages(messages: LearnMessage[], fallback: string): string {
  const userMessage = messages.find(
    (message) => message.role === 'user' && (message.text.trim() || message.attachments?.length),
  );
  if (userMessage?.text.trim()) {
    return normalizeLearnSessionTitle(userMessage.text) || fallback;
  }
  if (userMessage?.attachments?.length) return '图片问题';

  const actionMessage = messages.find((message) => message.plan || message.progressProposal);
  if (actionMessage?.plan?.title) {
    return normalizeLearnSessionTitle(actionMessage.plan.title) || fallback;
  }
  if (actionMessage?.progressProposal?.title) return actionMessage.progressProposal.title;

  const assistantMessage = messages.find(
    (message) => message.role === 'assistant' && message.text.trim(),
  );
  if (assistantMessage) {
    return normalizeLearnSessionTitle(assistantMessage.text) || fallback;
  }
  return fallback;
}

function courseSubtitle(course: CourseRecord): string {
  return [course.university, course.courseCode, course.tags?.[0]].filter(Boolean).join(' · ');
}

function isPracticeIntent(text: string): PracticePlanMode | null {
  const normalized = text.toLowerCase();
  if (/小测|测验|考试|quiz|test|检测|掌握度/.test(normalized)) return 'quiz';
  if (/刷题|做题|练习题|出.*题|开.*练习|错题|practice/.test(normalized)) {
    return 'practice';
  }
  return null;
}

function detectPlanningIntent(text: string): PlanningIntent | null {
  const practiceMode = isPracticeIntent(text);
  if (practiceMode) return { kind: 'practice_plan', mode: practiceMode };
  const normalized = text.toLowerCase();
  if (
    /(安排.*复习|今天.*复习|复习安排|复习计划|学习计划|制定.*计划|制定.*复习|怎么复习|下一步.*学|下一步.*复习|review plan|study plan)/i.test(
      normalized,
    )
  ) {
    return { kind: 'review_plan' };
  }
  return null;
}

function needsProgressConfirmation(text: string): boolean {
  return /(学到哪里|学到哪|进度|当前状态|学习状态|目前.*哪里|现在.*哪里|复习|学习计划|下一步|刷题|做题|练习|小测|测验|quiz|test|掌握度|薄弱|不足|短板|弱点)/i.test(
    text,
  );
}

function progressSelectionFromSnapshot(snapshot: LearnerCourseSnapshot | null): string {
  if (!snapshot?.progressKnown) return '';
  if (snapshot.progressCheckpointKind === 'not_started') return PROGRESS_SELECTION_NOT_STARTED;
  if (snapshot.progressCheckpointKind === 'completed_all') return PROGRESS_SELECTION_COMPLETED_ALL;
  return snapshot.progressNotebookId || snapshot.currentNotebook?.id || '';
}

function normalizeProgressText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[：:，,。！？!?、/\\()[\]{}"'`~*_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function progressLabelForSelection(selection: string, notebooks: StageListItem[]): string {
  if (selection === PROGRESS_SELECTION_NOT_STARTED) return '还没开始';
  if (selection === PROGRESS_SELECTION_COMPLETED_ALL) return '已学完整门课';
  const notebook = notebooks.find((item) => item.id === selection);
  return notebook ? `正在学习《${notebook.name}》` : '选择学习进度';
}

function progressCheckpointForSelection(
  selection: string,
): { kind: LearnerProgressCheckpointKind; notebookId?: string } | null {
  if (!selection) return null;
  if (selection === PROGRESS_SELECTION_NOT_STARTED) return { kind: 'not_started' };
  if (selection === PROGRESS_SELECTION_COMPLETED_ALL) return { kind: 'completed_all' };
  return { kind: 'notebook', notebookId: selection };
}

function detectProgressProposal(args: {
  text: string;
  notebooks: StageListItem[];
  snapshot: LearnerCourseSnapshot;
}): ProgressProposal | null {
  const raw = args.text.trim();
  if (!raw) return null;
  const normalized = normalizeProgressText(raw);
  const hasProgressCue =
    /(学到|学完|刚学|正在学|在学|讲到|上到|看到|复习到|current|currently|covered|finished|reached)/i.test(
      raw,
    );
  const currentSelection = progressSelectionFromSnapshot(args.snapshot);

  if (/(还没开始|没开始|尚未开始|刚开始|还没有开始)/.test(raw)) {
    if (currentSelection === PROGRESS_SELECTION_NOT_STARTED) return null;
    return {
      selection: PROGRESS_SELECTION_NOT_STARTED,
      label: '还没开始',
      reason: '你提到自己还没有正式开始这门课。',
    };
  }

  if (/(全部学完|都学完|学完整门|整门课.*学完|finished.*course|covered.*all)/i.test(raw)) {
    if (currentSelection === PROGRESS_SELECTION_COMPLETED_ALL) return null;
    return {
      selection: PROGRESS_SELECTION_COMPLETED_ALL,
      label: '已学完整门课',
      reason: '你提到已经覆盖完整门课程内容。',
    };
  }

  if (!hasProgressCue) return null;

  const scored = args.notebooks
    .map((notebook, index) => {
      const numericId = notebook.name.match(/\b0?(\d{1,2})\b/)?.[1];
      const candidates = [
        notebook.name,
        notebook.name.replace(/^\s*\d+\s*[-–—]\s*/, ''),
        ...(notebook.tags || []),
      ]
        .map(normalizeProgressText)
        .filter((candidate) => candidate.length >= 4);
      let score = 0;
      for (const candidate of candidates) {
        if (normalized.includes(candidate)) score += candidate.length;
      }
      if (numericId) {
        const numericPattern = new RegExp(
          `(week|lecture|lec|chapter|unit|第)\\s*0?${numericId}\\b|0?${numericId}\\s*(周|讲|章|单元)`,
          'i',
        );
        if (numericPattern.test(raw)) score += 12;
      }
      return { notebook, index, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const best = scored[0];
  if (!best || best.notebook.id === currentSelection) return null;
  return {
    selection: best.notebook.id,
    label: `正在学习《${best.notebook.name}》`,
    reason: `你刚才的消息里出现了“${best.notebook.name}”相关的学习进度线索。`,
  };
}

function messageText(message: UIMessage<ChatMessageMetadata>): string {
  return message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

function latestAssistantText(messages: UIMessage<ChatMessageMetadata>[]): string {
  const assistant = messages
    .slice()
    .reverse()
    .find((message) => message.role === 'assistant');
  return assistant ? messageText(assistant) : '';
}

function normalizeAssistantMarkdown(text: string): string {
  return text
    .split(/(```[\s\S]*?```)/g)
    .map((part) => (part.startsWith('```') ? part : normalizeLooseMathDelimiters(part)))
    .join('');
}

function pendingActionFromPlanningIntent(
  intent: PlanningIntent,
  prompt: string,
): PendingCourseAction {
  if (intent.kind === 'practice_plan') {
    return { kind: 'practice_plan', mode: intent.mode, prompt };
  }
  return { kind: 'review_plan', prompt };
}

async function loadMemoryPreferredProblemIds(args: {
  courseId: string;
  prompt: string;
}): Promise<string[]> {
  const prompt = args.prompt.trim();
  if (!prompt) return [];
  const params = new URLSearchParams({
    targetType: 'course',
    targetId: args.courseId,
    message: prompt,
  });
  try {
    const data = await backendJson<LearnLayeredMemoryContextResponse>(
      `/api/memory/context?${params.toString()}`,
    );
    return Array.from(new Set((data.knowledgeMatches || []).map((match) => match.id))).slice(0, 20);
  } catch (error) {
    console.warn(
      '[learn] Failed to load memory preferred problem ids:',
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

function progressRequestText(args: {
  intent?: PlanningIntent | null;
  hasDetectedProgress: boolean;
  progressKnown: boolean;
}): string {
  if (args.intent?.kind === 'review_plan') {
    if (args.hasDetectedProgress) {
      return '好的，我捕捉到了你这次复习范围的线索。先确认一下，确认后我再安排复习计划。';
    }
    return args.progressKnown
      ? '好的。先选这次复习要覆盖到哪里；它可以等于当前学习进度，也可以换成更早或更后的范围。'
      : '好的，但是我还不知道你的学习进度。先选择这次复习要覆盖到哪里，确认后我再安排计划。';
  }

  if (args.intent?.kind === 'practice_plan') {
    if (args.hasDetectedProgress) {
      return '好的，我捕捉到了你这次题目范围的线索。先确认一下，确认后我再开出题目计划。';
    }
    return args.progressKnown
      ? '好的。先选这次题目计划覆盖到哪里；确认后我再给出对应的刷题/测验计划。'
      : '好的，但是我还不知道你的学习进度。先选择你现在学到哪里，确认后我再给出对应题目计划。';
  }

  if (args.hasDetectedProgress) {
    return '我捕捉到了学习进度线索。先确认一下，再写入记忆。';
  }

  return args.progressKnown
    ? '先确认一下这次要使用的学习进度。'
    : '先确认一下你的学习进度，我再继续。';
}

function progressRequestReason(args: {
  intent?: PlanningIntent | null;
  hasDetectedProgress: boolean;
  detectedReason?: string;
  progressKnown: boolean;
}): string {
  if (args.hasDetectedProgress && args.detectedReason) return args.detectedReason;
  if (args.intent?.kind === 'review_plan') {
    return args.progressKnown
      ? '请选择这次复习覆盖到哪里。确认后，我会按这个范围更新学习记忆并生成复习安排。'
      : '请选择你现在在这门课里的位置，或者这次复习想覆盖到哪里。确认后，我会写入学习记忆并生成复习安排。';
  }
  if (args.intent?.kind === 'practice_plan') {
    return args.progressKnown
      ? '请选择这次刷题/测验覆盖到哪里。确认后，我会按这个范围生成题目计划。'
      : '请选择你现在在这门课里的位置。确认后，我会写入学习记忆并生成题目计划。';
  }
  return args.progressKnown
    ? '请选择要确认的学习位置。确认后，我会更新学习记忆。'
    : '请选择你现在在这门课里的位置。确认后，我会把它写入学习记忆。';
}

function announceLearningMemoryUpdated(label: string, descriptionPrefix = '记忆已更新') {
  const activityId = addMemoryActivity({
    title: '学习记忆写入中',
    description: `正在写入：${label}`,
    status: 'writing_study_memory',
    layer: 'study_memory',
    chips: ['课程', '进度'],
  });
  window.setTimeout(() => {
    updateMemoryActivity(activityId, {
      title: '学习记忆已更新',
      description: `${descriptionPrefix}：${label}`,
      status: 'completed',
      layer: 'study_memory',
      chips: ['课程', '进度'],
    });
  }, 520);
}

function announceSyllabusScheduleUpdated(label: string) {
  const activityId = addMemoryActivity({
    title: '课程日程写入中',
    description: `正在记录：${label}`,
    status: 'writing_study_memory',
    layer: 'study_memory',
    chips: ['课程', '日程'],
  });
  window.setTimeout(() => {
    updateMemoryActivity(activityId, {
      title: '课程日程已更新',
      description: `已记录：${label}`,
      status: 'completed',
      layer: 'study_memory',
      chips: ['课程', '日程'],
    });
  }, 520);
}

function planIntro(plan: PracticePlan): string {
  const noun = plan.mode === 'quiz' ? '测验' : '刷题计划';
  const concepts = plan.targetConcepts.slice(0, 3).join('、') || '当前课程重点';
  const count = plan.problemIds.length > 0 ? `${plan.problemIds.length} 题` : '待补充题目';
  return `我根据你当前的学习状态开了一个${noun}：聚焦 ${concepts}，预计 ${plan.estimatedMinutes} 分钟，${count}。`;
}

function conceptSentence(concepts: string[], fallback: string): string {
  const selected = concepts.filter(Boolean).slice(0, 5);
  return selected.length > 0 ? selected.join('、') : fallback;
}

function buildLocalLearningAnswer(args: {
  text: string;
  course: CourseRecord;
  snapshot: LearnerCourseSnapshot;
  state: LearnerCourseState;
}): string | null {
  const normalized = args.text.toLowerCase();
  if (!args.snapshot.progressKnown && needsProgressConfirmation(args.text)) {
    return null;
  }

  const currentNotebook = args.snapshot.currentNotebook?.name;
  const progressTarget = currentNotebook ? `《${currentNotebook}》` : args.snapshot.progressLabel;
  const weakConcepts = args.snapshot.weakConcepts.length
    ? args.snapshot.weakConcepts
    : args.snapshot.nextConcepts;
  const weakCopy = conceptSentence(weakConcepts, args.course.courseCode || args.course.name);
  const progressLine = currentNotebook
    ? `当前定位在《${currentNotebook}》，课程进度约 ${args.snapshot.progressPercent}%，已做 ${args.snapshot.attemptedProblemCount}/${args.snapshot.totalProblemCount} 道题。`
    : `当前进度是：${progressTarget || '已确认'}，课程进度约 ${args.snapshot.progressPercent}%，已做 ${args.snapshot.attemptedProblemCount}/${args.snapshot.totalProblemCount} 道题。`;
  const reviewTarget = currentNotebook
    ? `《${currentNotebook}》的定义和例子`
    : `${args.course.courseCode || args.course.name} 的入门目标和第一组核心概念`;

  if (/(学到哪里|学到哪|进度|当前状态|学习状态|目前.*哪里|现在.*哪里)/.test(normalized)) {
    return `${progressLine}\n\n下一步不要全量重刷，先围绕 ${conceptSentence(
      args.snapshot.nextConcepts,
      '当前笔记本的核心概念',
    )} 复习；如果你完成一组题，我会用新的做题结果更新这个判断。`;
  }

  if (/(哪里.*薄弱|薄弱点|不足|短板|弱点|总结.*不足|不足.*总结|归纳.*不足|不熟)/.test(normalized)) {
    const recentMisses = args.state.recentProblemAttempts
      .filter((attempt) => attempt.status !== 'passed')
      .slice(0, 2)
      .map((attempt) => `《${attempt.problemTitle}》`);
    const evidence =
      recentMisses.length > 0
        ? `依据最近的 ${recentMisses.join('、')}。`
        : currentNotebook
          ? '目前做题证据还不多，所以先按当前笔记本、题库标签和学习进度判断。'
          : '目前做题证据还不多，所以先按课程标签、入门范围和学习进度判断。';
    return `目前最需要补的是：${weakCopy}。\n\n${evidence}\n\n建议先做小范围复习：把这些概念各用一句话解释清楚，再做少量对应题。如果做题结果继续显示不稳，我会把它们加入待复习队列。`;
  }

  if (
    /(安排.*复习|今天.*复习|复习安排|复习计划|学习计划|制定.*计划|制定.*复习|怎么复习|下一步)/.test(
      normalized,
    )
  ) {
    return `${progressLine}\n\n今天按这个顺序来：\n1. 先用 10 分钟回看 ${reviewTarget}。\n2. 再用 20 分钟集中复习 ${weakCopy}，只看相关小节。\n3. 最后用 15 分钟做一组对应题，做完后我会按结果更新薄弱点和下一轮复习范围。`;
  }

  return null;
}

function buildLearnerChatContext(args: {
  snapshot: LearnerCourseSnapshot;
  state: LearnerCourseState;
  plans: PracticePlan[];
  syllabusEvents?: SyllabusCalendarEvent[];
}): NonNullable<CourseChatContext['learner']> {
  const today = localDayKey(new Date());
  const sortedSyllabusEvents = (args.syllabusEvents || [])
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  const upcomingSyllabusEvents = sortedSyllabusEvents.filter((event) => event.date >= today);
  const learnerSyllabus =
    sortedSyllabusEvents.length > 0
      ? {
          importedCount: sortedSyllabusEvents.length,
          upcoming: upcomingSyllabusEvents.slice(0, 12).map((event) => ({
            title: event.title,
            kind: event.kind,
            date: event.date,
            sourceName: event.sourceName,
          })),
          nextAssignment: upcomingSyllabusEvents.find((event) => event.kind === 'assignment'),
          nextExam: upcomingSyllabusEvents.find((event) => event.kind === 'exam'),
          nextSchoolProgress: upcomingSyllabusEvents.find((event) => event.kind === 'progress'),
        }
      : undefined;

  return {
    progressKnown: args.snapshot.progressKnown,
    progressLabel: args.snapshot.progressLabel,
    progressPercent: args.snapshot.progressPercent,
    currentNotebookName: args.snapshot.currentNotebook?.name,
    attemptedProblemCount: args.snapshot.attemptedProblemCount,
    totalProblemCount: args.snapshot.totalProblemCount,
    dueReviewCount: args.snapshot.dueReviewCount,
    weakConcepts: args.snapshot.weakConcepts,
    nextConcepts: args.snapshot.nextConcepts,
    recentQuestions: args.state.recentQuestions.slice(0, 5).map((question) => question.text),
    recentAttempts: args.state.recentProblemAttempts.slice(0, 8).map((attempt) => ({
      title: attempt.problemTitle,
      status: attempt.status,
      concepts: attempt.concepts,
    })),
    activePlans: args.plans.slice(0, 4).map((plan) => ({
      title: plan.title,
      mode: plan.mode,
      status: plan.status,
      targetConcepts: plan.targetConcepts,
    })),
    syllabus: learnerSyllabus
      ? {
          ...learnerSyllabus,
          nextAssignment: learnerSyllabus.nextAssignment
            ? {
                title: learnerSyllabus.nextAssignment.title,
                date: learnerSyllabus.nextAssignment.date,
              }
            : undefined,
          nextExam: learnerSyllabus.nextExam
            ? {
                title: learnerSyllabus.nextExam.title,
                date: learnerSyllabus.nextExam.date,
              }
            : undefined,
          nextSchoolProgress: learnerSyllabus.nextSchoolProgress
            ? {
                title: learnerSyllabus.nextSchoolProgress.title,
                date: learnerSyllabus.nextSchoolProgress.date,
              }
            : undefined,
        }
      : undefined,
  };
}

function mergePlans(local: PracticePlan[], remote: PracticePlan[]): PracticePlan[] {
  const byId = new Map<string, PracticePlan>();
  for (const plan of [...local, ...remote]) {
    const current = byId.get(plan.id);
    if (!current || plan.updatedAt > current.updatedAt) byId.set(plan.id, plan);
  }
  return Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

function localDayKey(value: number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function syllabusEventTone(kind: SyllabusEventKind): string {
  if (kind === 'assignment') return 'bg-sky-500';
  if (kind === 'exam') return 'bg-rose-500';
  if (kind === 'progress') return 'bg-amber-500';
  if (kind === 'tutorial') return 'bg-violet-500';
  if (kind === 'holiday') return 'bg-emerald-500';
  return 'bg-slate-400';
}

function syllabusEventPillTone(kind: SyllabusEventKind): string {
  if (kind === 'assignment') return 'bg-sky-100 text-sky-800 dark:bg-sky-400/15 dark:text-sky-100';
  if (kind === 'exam') return 'bg-rose-100 text-rose-800 dark:bg-rose-400/15 dark:text-rose-100';
  if (kind === 'progress')
    return 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-100';
  if (kind === 'tutorial')
    return 'bg-violet-100 text-violet-800 dark:bg-violet-400/15 dark:text-violet-100';
  if (kind === 'holiday')
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-100';
  return 'bg-slate-100 text-slate-700 dark:bg-slate-400/15 dark:text-slate-100';
}

function syllabusEventLabel(kind: SyllabusEventKind): string {
  if (kind === 'assignment') return '作业';
  if (kind === 'exam') return '考试';
  if (kind === 'progress') return '进度';
  if (kind === 'tutorial') return 'Tutorial';
  if (kind === 'holiday') return '假期';
  return '事项';
}

function inferSyllabusEventKind(line: string): SyllabusEventKind {
  if (/midterm|final|exam|test|quiz|考试|期中|期末|测验/i.test(line)) return 'exam';
  if (/tutorial|two-stage|workshop|activity|discussion|辅导|习题课/i.test(line)) return 'tutorial';
  if (/holiday|break|closed|no class|no lecture|假期|放假|停课/i.test(line)) return 'holiday';
  if (
    /assignment|homework|project|paper|essay|report|lab|problem set|pset|due|deadline|作业|项目|论文|报告|截止/i.test(
      line,
    )
  ) {
    return 'assignment';
  }
  if (
    /week|lecture|reading|chapter|module|unit|topic|第.+周|周进度|进度|阅读|章节|单元|主题/i.test(
      line,
    )
  ) {
    return 'progress';
  }
  return 'other';
}

function parseSyllabusDate(
  line: string,
  fallbackYear: number,
): { key: string; raw: string } | null {
  const iso = line.match(/\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/);
  if (iso) {
    return {
      key: localDayKey(new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))),
      raw: iso[0],
    };
  }

  const numeric = line.match(/\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])(?:\/(20\d{2}))?\b/);
  if (numeric) {
    return {
      key: localDayKey(
        new Date(Number(numeric[3] || fallbackYear), Number(numeric[1]) - 1, Number(numeric[2])),
      ),
      raw: numeric[0],
    };
  }

  const monthNames =
    'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
  const named = line.match(
    new RegExp(`\\b(${monthNames})\\.?\\s+(0?[1-9]|[12]\\d|3[01])(?:,?\\s*(20\\d{2}))?\\b`, 'i'),
  );
  if (named) {
    const monthIndex = [
      'jan',
      'feb',
      'mar',
      'apr',
      'may',
      'jun',
      'jul',
      'aug',
      'sep',
      'oct',
      'nov',
      'dec',
    ].findIndex((prefix) => named[1].toLowerCase().startsWith(prefix));
    return {
      key: localDayKey(new Date(Number(named[3] || fallbackYear), monthIndex, Number(named[2]))),
      raw: named[0],
    };
  }

  const chinese = line.match(/\b(20\d{2})?年?\s*(0?[1-9]|1[0-2])月\s*(0?[1-9]|[12]\d|3[01])日?\b/);
  if (chinese) {
    return {
      key: localDayKey(
        new Date(Number(chinese[1] || fallbackYear), Number(chinese[2]) - 1, Number(chinese[3])),
      ),
      raw: chinese[0],
    };
  }

  return null;
}

function parseSyllabusEventsFromText(
  text: string,
  sourceName: string,
  fallbackYear = new Date().getFullYear(),
): SyllabusCalendarEvent[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 6)
    .slice(0, 500);
  const seen = new Set<string>();
  const events: SyllabusCalendarEvent[] = [];
  for (const line of lines) {
    const parsedDate = parseSyllabusDate(line, fallbackYear);
    if (!parsedDate) continue;
    const title =
      line
        .replace(parsedDate.raw, ' ')
        .replace(/^[-*•\d.)\s]+/, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80) || 'Syllabus 事项';
    const kind = inferSyllabusEventKind(line);
    const dedupeKey = `${parsedDate.key}:${kind}:${title.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    events.push({
      id: makeClientId('syllabus-event'),
      title,
      kind,
      date: parsedDate.key,
      sourceName,
      createdAt: Date.now(),
    });
  }
  return events.slice(0, 80);
}

function addCalendarDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function nextStudyWeekStart(referenceDate = new Date()): Date {
  const next = new Date(referenceDate);
  next.setHours(12, 0, 0, 0);
  const daysUntilMonday = (8 - next.getDay()) % 7;
  next.setDate(next.getDate() + (daysUntilMonday || 1));
  return next;
}

function inferSyllabusWeekCount(planText: string, notebookCount: number): number {
  const weekMatch = planText.match(/(\d{1,2})\s*(周|星期|week|weeks)/i);
  if (weekMatch) return Math.min(16, Math.max(2, Number(weekMatch[1])));
  const monthMatch = planText.match(/(\d{1,2})\s*(个月|month|months)/i);
  if (monthMatch) return Math.min(16, Math.max(4, Number(monthMatch[1]) * 4));
  const dayMatch = planText.match(/(\d{1,3})\s*(天|day|days)/i);
  if (dayMatch) return Math.min(16, Math.max(2, Math.ceil(Number(dayMatch[1]) / 7)));
  return Math.min(12, Math.max(6, notebookCount || 0));
}

function courseSyllabusTopics(course: CourseRecord, notebooks: StageListItem[], count: number) {
  const descriptionTopics = (course.description || '')
    .split(/[。！？.!?\n;；]/)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter((item) => item.length >= 6)
    .map((item) => item.slice(0, 42));
  const notebookTopics = notebooks
    .map((notebook) => notebook.name?.trim())
    .filter((name): name is string => Boolean(name));
  const tagTopics = (course.tags || []).map((tag) => tag.trim()).filter(Boolean);
  const pool = [...descriptionTopics, ...notebookTopics, ...tagTopics, course.name].filter(Boolean);
  return Array.from(
    { length: count },
    (_, index) => pool[index % pool.length] || `第 ${index + 1} 周主题`,
  );
}

function simulateSyllabusEventsFromPlan({
  course,
  notebooks,
  planText,
}: {
  course: CourseRecord;
  notebooks: StageListItem[];
  planText: string;
}): SyllabusCalendarEvent[] {
  const weekCount = inferSyllabusWeekCount(planText, notebooks.length);
  const topics = courseSyllabusTopics(course, notebooks, weekCount);
  const startDate = nextStudyWeekStart();
  const sourceName = '模拟 syllabus';
  const courseLabel = course.courseCode || course.name;
  const events: SyllabusCalendarEvent[] = [];

  for (let index = 0; index < weekCount; index += 1) {
    const weekStart = addCalendarDays(startDate, index * 7);
    const topic = topics[index];
    events.push({
      id: makeClientId('syllabus-event'),
      title: `第 ${index + 1} 周：${topic}`,
      kind: 'progress',
      date: localDayKey(weekStart),
      sourceName,
      createdAt: Date.now(),
    });
    if ((index + 1) % 2 === 0 || index === weekCount - 1) {
      events.push({
        id: makeClientId('syllabus-event'),
        title: `作业 ${Math.ceil((index + 1) / 2)}：${topic} 练习`,
        kind: 'assignment',
        date: localDayKey(addCalendarDays(weekStart, 4)),
        sourceName,
        createdAt: Date.now(),
      });
    }
  }

  if (weekCount >= 5) {
    events.push({
      id: makeClientId('syllabus-event'),
      title: `${courseLabel} 期中检查`,
      kind: 'exam',
      date: localDayKey(addCalendarDays(startDate, Math.floor(weekCount / 2) * 7 - 1)),
      sourceName,
      createdAt: Date.now(),
    });
  }
  events.push({
    id: makeClientId('syllabus-event'),
    title: `${courseLabel} 期末复盘`,
    kind: 'exam',
    date: localDayKey(addCalendarDays(startDate, weekCount * 7 - 2)),
    sourceName,
    createdAt: Date.now(),
  });

  return events.slice(0, 80);
}

function formatCalendarMonth(value: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    year: 'numeric',
  }).format(value);
}

function formatShortCalendarDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map((part) => Number(part));
  if (!year || !month || !day) return dateKey;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(year, month - 1, day));
}

function planCalendarTimestamp(plan: PracticePlan): number {
  return plan.status === 'completed' && plan.completedAt ? plan.completedAt : plan.createdAt;
}

function buildLearningCalendarDays(
  referenceDate: Date,
  plans: PracticePlan[],
  syllabusEvents: SyllabusCalendarEvent[],
) {
  const monthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());
  const todayKey = localDayKey(new Date());
  const planCountByDay = new Map<string, number>();
  for (const plan of plans) {
    const key = localDayKey(planCalendarTimestamp(plan));
    planCountByDay.set(key, (planCountByDay.get(key) || 0) + 1);
  }
  const syllabusCountByDay = new Map<string, number>();
  for (const event of syllabusEvents) {
    syllabusCountByDay.set(event.date, (syllabusCountByDay.get(event.date) || 0) + 1);
  }
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const key = localDayKey(date);
    return {
      key,
      day: date.getDate(),
      inMonth: date.getMonth() === referenceDate.getMonth(),
      isToday: key === todayKey,
      planCount: planCountByDay.get(key) || 0,
      syllabusCount: syllabusCountByDay.get(key) || 0,
    };
  });
}

function statusTone(state: LearnerCourseSnapshot | null): string {
  if (!state) return 'bg-muted text-muted-foreground';
  if (!state.progressKnown)
    return 'bg-amber-100 text-amber-800 dark:bg-amber-400/12 dark:text-amber-200';
  if (state.weakConcepts.length > 0)
    return 'bg-amber-100 text-amber-800 dark:bg-amber-400/12 dark:text-amber-200';
  if (state.progressPercent >= 70)
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/12 dark:text-emerald-200';
  return 'bg-sky-100 text-sky-700 dark:bg-sky-400/12 dark:text-sky-200';
}

function CourseAvatar({ course, className }: { course: CourseRecord; className?: string }) {
  const avatar = resolveCourseAvatarDisplayUrl(course.id, course.avatarUrl);
  return (
    <img
      src={avatar}
      alt=""
      className={cn(
        'size-10 shrink-0 rounded-[14px] object-cover ring-1 ring-black/5 dark:ring-white/10',
        className,
      )}
    />
  );
}

const learnConfirmationSciFiImages = {
  progress: '/images/learn-confirmations/card-progress-sci-fi.png',
  scope: '/images/learn-confirmations/card-scope-sci-fi.png',
  quiz: '/images/learn-confirmations/card-quiz-sci-fi.png',
  practice: '/images/learn-confirmations/card-practice-sci-fi.png',
} as const;

function PlanActionCard({
  plan,
  onStart,
  onRegenerate,
  onEasier,
}: {
  plan: PracticePlan;
  onStart: (plan: PracticePlan) => void;
  onRegenerate: (plan: PracticePlan) => void;
  onEasier: (plan: PracticePlan) => void;
}) {
  const backgroundImage =
    plan.mode === 'quiz'
      ? learnConfirmationSciFiImages.quiz
      : learnConfirmationSciFiImages.practice;

  return (
    <div className="relative mt-4 overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-slate-950">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${backgroundImage})` }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.92)_0%,rgba(255,255,255,0.78)_50%,rgba(255,255,255,0.38)_100%)] dark:bg-[linear-gradient(90deg,rgba(2,6,23,0.9)_0%,rgba(2,6,23,0.72)_50%,rgba(2,6,23,0.42)_100%)]"
        aria-hidden="true"
      />
      <div className="relative border-b border-slate-100/80 px-5 py-4 dark:border-white/10">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-[12px] border border-sky-100 bg-white/76 text-sky-700 shadow-sm dark:border-sky-300/20 dark:bg-slate-950/72 dark:text-sky-100">
              <BookOpenCheck className="size-4" strokeWidth={1.9} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{plan.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {plan.mode === 'quiz' ? '课程测验' : '刷题计划'} · {plan.estimatedMinutes} 分钟 ·{' '}
                {plan.problemIds.length || 0} 题
              </p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-400/12 dark:text-emerald-200 dark:ring-emerald-300/15">
            可开始
          </span>
        </div>
      </div>
      <div className="relative space-y-4 px-5 py-4">
        <div className="flex flex-wrap gap-2">
          {plan.targetConcepts.slice(0, 5).map((concept) => (
            <span
              key={concept}
              className="rounded-full border border-sky-200/80 bg-sky-50/70 px-3 py-1 text-xs font-medium text-sky-700 dark:border-sky-300/20 dark:bg-sky-400/10 dark:text-sky-200"
            >
              {concept}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-[14px] bg-white/72 px-2 py-2.5 shadow-sm ring-1 ring-black/5 dark:bg-white/5 dark:ring-white/10">
            <p className="font-semibold text-foreground">{plan.difficultyMix.easy}</p>
            <p className="mt-0.5 text-muted-foreground">基础</p>
          </div>
          <div className="rounded-[14px] bg-white/72 px-2 py-2.5 shadow-sm ring-1 ring-black/5 dark:bg-white/5 dark:ring-white/10">
            <p className="font-semibold text-foreground">{plan.difficultyMix.medium}</p>
            <p className="mt-0.5 text-muted-foreground">中等</p>
          </div>
          <div className="rounded-[14px] bg-white/72 px-2 py-2.5 shadow-sm ring-1 ring-black/5 dark:bg-white/5 dark:ring-white/10">
            <p className="font-semibold text-foreground">{plan.difficultyMix.hard}</p>
            <p className="mt-0.5 text-muted-foreground">挑战</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => onStart(plan)}
            className="gap-2 rounded-full bg-slate-950 px-4 text-white shadow-sm hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            <Play className="size-4" />
            开始
          </Button>
          <Button
            variant="outline"
            onClick={() => onRegenerate(plan)}
            className="gap-2 rounded-full border-slate-200 bg-white px-4 shadow-sm dark:border-white/10 dark:bg-white/5"
          >
            <RefreshCcw className="size-4" />
            换一组
          </Button>
          <Button
            variant="ghost"
            onClick={() => onEasier(plan)}
            className="gap-2 rounded-full px-4 text-muted-foreground"
          >
            <Target className="size-4" />
            降低难度
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProgressConfirmationCard({
  proposal,
  notebooks,
  onSelectionChange,
  onConfirm,
  onDismiss,
}: {
  proposal: ProgressProposal;
  notebooks: StageListItem[];
  onSelectionChange: (selection: string) => void;
  onConfirm: () => void;
  onDismiss?: () => void;
}) {
  const backgroundImage =
    proposal.writeMode === 'planning_scope'
      ? learnConfirmationSciFiImages.scope
      : learnConfirmationSciFiImages.progress;

  return (
    <div className="relative mt-4 overflow-hidden rounded-[22px] border border-amber-200/80 bg-[#fffdf7] px-5 py-5 text-sm text-slate-800 shadow-[0_18px_50px_rgba(120,79,18,0.08)] dark:border-amber-300/20 dark:bg-amber-400/10 dark:text-amber-50">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${backgroundImage})` }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.92)_0%,rgba(255,255,255,0.78)_50%,rgba(255,255,255,0.38)_100%)] dark:bg-[linear-gradient(90deg,rgba(2,6,23,0.9)_0%,rgba(2,6,23,0.72)_50%,rgba(2,6,23,0.42)_100%)]"
        aria-hidden="true"
      />
      <div className="relative">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border border-amber-200 bg-white/76 text-amber-600 shadow-sm dark:border-amber-300/20 dark:bg-slate-950/70 dark:text-amber-200">
            <Target className="size-4" strokeWidth={1.9} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-950 dark:text-amber-50">
              {proposal.confirmed
                ? proposal.writeMode === 'planning_scope'
                  ? '计划范围已确认'
                  : '学习进度已更新'
                : (proposal.title ?? '确认学习进度')}
            </p>
            <p className="mt-1 leading-6 text-slate-600 dark:text-amber-100/85">
              {proposal.reason}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <select
            value={proposal.selection}
            onChange={(event) => onSelectionChange(event.target.value)}
            disabled={proposal.confirmed}
            className="h-11 min-w-0 flex-1 rounded-[14px] border border-amber-200 bg-white/86 px-3 text-sm text-foreground shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:opacity-70 dark:border-amber-300/20 dark:bg-slate-950/70"
            aria-label="确认学习进度"
          >
            <option value="">选择学习进度</option>
            <option value={PROGRESS_SELECTION_NOT_STARTED}>还没开始</option>
            {notebooks.map((notebook, index) => (
              <option key={notebook.id} value={notebook.id}>
                正在学习 {index + 1}. {notebook.name}
              </option>
            ))}
            {notebooks.length > 0 ? (
              <option value={PROGRESS_SELECTION_COMPLETED_ALL}>已经学完整门课</option>
            ) : null}
          </select>
          <Button
            onClick={onConfirm}
            disabled={!proposal.selection || proposal.confirmed}
            className="h-11 rounded-[14px] bg-slate-950 px-5 text-white shadow-sm hover:bg-slate-800 disabled:bg-slate-300 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            {proposal.confirmed ? '已确认' : (proposal.confirmLabel ?? '确认更新')}
          </Button>
          {onDismiss && !proposal.confirmed ? (
            <Button variant="ghost" onClick={onDismiss} className="h-11 rounded-[14px] px-4">
              稍后再说
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function LearnPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlSessionId = searchParams.get('session')?.trim() || '';
  const imageInputRef = useRef<HTMLInputElement>(null);
  const draftTextareaRef = useRef<HTMLTextAreaElement>(null);
  const syllabusInputRef = useRef<HTMLInputElement>(null);
  const sourceUploadPanelOpenRef = useRef(false);
  const lastSyncedConversationRef = useRef('');
  const authHydrated = usePersistHydrated(useAuthStore);
  const courseHydrated = usePersistHydrated(useCurrentCourseStore);
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  const userId = useAuthStore((state) => state.userId);
  const userName = useAuthStore((state) => state.name);
  const storedCourseId = useCurrentCourseStore((state) => state.id);
  const setCurrentCourse = useCurrentCourseStore((state) => state.setCurrentCourse);
  const providerId = useSettingsStore((state) => state.providerId);
  const modelId = useSettingsStore((state) => state.modelId);
  const providersConfig = useSettingsStore((state) => state.providersConfig);
  const pdfProviderId = useSettingsStore((state) => state.pdfProviderId);
  const pdfProvidersConfig = useSettingsStore((state) => state.pdfProvidersConfig);
  const setModel = useSettingsStore((state) => state.setModel);

  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [coursesLoadState, setCoursesLoadState] = useState<LoadState>('idle');
  const [assetLoadState, setAssetLoadState] = useState<LoadState>('idle');
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const [notebooks, setNotebooks] = useState<StageListItem[]>([]);
  const [problems, setProblems] = useState<CourseProblemClientSummary[]>([]);
  const [snapshot, setSnapshot] = useState<LearnerCourseSnapshot | null>(null);
  const [, setProgressSelection] = useState('');
  const [recentPlans, setRecentPlans] = useState<PracticePlan[]>([]);
  const [syllabusEvents, setSyllabusEvents] = useState<SyllabusCalendarEvent[]>([]);
  const [syllabusImportMessage, setSyllabusImportMessage] = useState<string | null>(null);
  const [syllabusDialogOpen, setSyllabusDialogOpen] = useState(false);
  const [courseFilesDialogOpen, setCourseFilesDialogOpen] = useState(false);
  const [syllabusImportMode, setSyllabusImportMode] = useState<SyllabusImportMode>('file');
  const [syllabusCommitMode, setSyllabusCommitMode] = useState<SyllabusCommitMode>('merge');
  const [syllabusImportLoading, setSyllabusImportLoading] = useState(false);
  const [syllabusDraftEvents, setSyllabusDraftEvents] = useState<SyllabusCalendarEvent[]>([]);
  const [syllabusDraftSourceName, setSyllabusDraftSourceName] = useState('');
  const [syllabusPlanDraft, setSyllabusPlanDraft] = useState('');
  const [messages, setMessages] = useState<LearnMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<LearnImageAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [sourceUploading, setSourceUploading] = useState(false);
  const [sourceUploadPanelOpen, setSourceUploadPanelOpen] = useState(false);
  const [sourceUploadItems, setSourceUploadItems] = useState<LearnSourceUploadItem[]>([]);
  const [completedSourceUploadBadgeCount, setCompletedSourceUploadBadgeCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [learnSessions, setLearnSessions] = useState<LearnChatSession[]>([]);
  const [messageStoreKey, setMessageStoreKey] = useState('');
  const [remoteConversationReadyKey, setRemoteConversationReadyKey] = useState('');
  const [leftRailCollapsed, setLeftRailCollapsed] = useState(() =>
    getInitialLearnRailCollapsed(LEARN_LEFT_RAIL_COLLAPSED_STORAGE_KEY),
  );
  const [rightRailCollapsed, setRightRailCollapsed] = useState(() =>
    getInitialLearnRailCollapsed(LEARN_RIGHT_RAIL_COLLAPSED_STORAGE_KEY),
  );
  const [rightRailView, setRightRailView] = useState<LearnRightRailView>('sessions');
  const [calendarDialogOpen, setCalendarDialogOpen] = useState(false);
  const [calendarReferenceDate, setCalendarReferenceDate] = useState(() => new Date());

  const hydrated = authHydrated && courseHydrated;
  const localUserId = userId || 'anonymous';
  const activeSessionId = urlSessionId || 'default';
  const activeMessageStoreKey = activeCourseId
    ? `${localUserId}:${activeCourseId}:${activeSessionId}`
    : '';
  const activeCourse = useMemo(
    () => courses.find((course) => course.id === activeCourseId) || null,
    [activeCourseId, courses],
  );
  const modelOptions = useMemo(() => buildLearnModelOptions(providersConfig), [providersConfig]);
  const selectedModelValue = modelOptionValue(providerId, modelId);
  const selectedModel = useMemo(
    () =>
      modelOptions.find((option) => option.value === selectedModelValue) || {
        value: selectedModelValue,
        providerId,
        modelId,
        providerName: providerId,
        modelName: modelId || '未选择模型',
        vision: null,
      },
    [modelId, modelOptions, providerId, selectedModelValue],
  );
  const visibleModelOptions = useMemo(
    () =>
      modelOptions.some((option) => option.value === selectedModelValue)
        ? modelOptions
        : [selectedModel, ...modelOptions],
    [modelOptions, selectedModel, selectedModelValue],
  );
  const selectedKnownNoVision = selectedModel.vision === false;
  const pdfProviderConfig = pdfProvidersConfig[pdfProviderId];

  const setSourceUploadDialogOpen = useCallback((open: boolean) => {
    sourceUploadPanelOpenRef.current = open;
    setSourceUploadPanelOpen(open);
    if (open) setCompletedSourceUploadBadgeCount(0);
  }, []);

  const openSourceUploadPanel = useCallback(() => {
    setSourceUploadDialogOpen(true);
  }, [setSourceUploadDialogOpen]);

  const updateSourceUploadItem = useCallback(
    (itemId: string, patch: Partial<Omit<LearnSourceUploadItem, 'id' | 'createdAt'>>) => {
      setSourceUploadItems((current) =>
        current.map((item) =>
          item.id === itemId
            ? {
                ...item,
                ...patch,
                updatedAt: Date.now(),
              }
            : item,
        ),
      );
    },
    [],
  );

  const handleUploadButtonClick = useCallback(() => {
    if (sourceUploading || sourceUploadItems.length > 0 || completedSourceUploadBadgeCount > 0) {
      openSourceUploadPanel();
      return;
    }
    imageInputRef.current?.click();
  }, [
    completedSourceUploadBadgeCount,
    openSourceUploadPanel,
    sourceUploadItems.length,
    sourceUploading,
  ]);

  useEffect(() => {
    const textarea = draftTextareaRef.current;
    if (!textarea) return;

    textarea.style.height = '24px';
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 24), 128)}px`;
  }, [draft]);

  const showPreviousCalendarMonth = useCallback(() => {
    setCalendarReferenceDate(
      (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1),
    );
  }, []);
  const showNextCalendarMonth = useCallback(() => {
    setCalendarReferenceDate(
      (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1),
    );
  }, []);
  const showCurrentCalendarMonth = useCallback(() => {
    setCalendarReferenceDate(new Date());
  }, []);
  const calendarDays = useMemo(
    () => buildLearningCalendarDays(calendarReferenceDate, recentPlans, syllabusEvents),
    [calendarReferenceDate, recentPlans, syllabusEvents],
  );
  const calendarMonthLabel = useMemo(
    () => formatCalendarMonth(calendarReferenceDate),
    [calendarReferenceDate],
  );
  const statusCalendarActivities = useMemo<StatusCalendarActivity[]>(() => {
    const todayKey = localDayKey(new Date());
    const planActivities = recentPlans.map((plan) => {
      const date = localDayKey(planCalendarTimestamp(plan));
      return {
        id: `plan-${plan.id}`,
        source: 'plan' as const,
        sourceId: plan.id,
        title: plan.title,
        date,
        meta: `${plan.mode === 'quiz' ? '小测' : '刷题'} · ${plan.estimatedMinutes} 分钟`,
        dotClassName: plan.mode === 'quiz' ? 'bg-violet-500' : 'bg-emerald-500',
        actionLabel: plan.mode === 'quiz' ? '开始小测' : '开始刷题',
      };
    });
    const syllabusActivities = syllabusEvents.map((event) => ({
      id: `syllabus-${event.id}`,
      source: 'syllabus' as const,
      sourceId: event.id,
      title: event.title,
      date: event.date,
      meta: `${syllabusEventLabel(event.kind)}${event.sourceName ? ` · ${event.sourceName}` : ''}`,
      dotClassName: syllabusEventTone(event.kind),
    }));
    const allActivities = [...planActivities, ...syllabusActivities];
    const upcoming = allActivities
      .filter((activity) => activity.date >= todayKey)
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          a.title.localeCompare(b.title, 'zh-CN') ||
          a.id.localeCompare(b.id),
      );
    const recentPast = allActivities
      .filter((activity) => activity.date < todayKey)
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          a.title.localeCompare(b.title, 'zh-CN') ||
          a.id.localeCompare(b.id),
      );
    return [...upcoming, ...recentPast].slice(0, 4);
  }, [recentPlans, syllabusEvents]);
  const learningSuggestionItems = useMemo(() => {
    if (!snapshot) return ['先同步课程学习状态，再生成复习或刷题安排。'];

    const items: string[] = [];
    if (!snapshot.progressKnown) {
      items.push('先更新学习进度，避免复习范围按全量课程展开。');
    } else if (snapshot.progressLabel) {
      items.push(`当前按「${snapshot.progressLabel}」继续推进。`);
    }

    if (snapshot.dueReviewCount > 0) {
      items.push(`今天优先回顾 ${snapshot.dueReviewCount} 个到期内容。`);
    }

    if (snapshot.weakConcepts.length > 0) {
      items.push(`重点补 ${snapshot.weakConcepts.slice(0, 2).join(' / ')}，再做对应题目。`);
    } else if (snapshot.nextConcepts.length > 0) {
      items.push(`下一步关注 ${snapshot.nextConcepts.slice(0, 2).join(' / ')}。`);
    } else if (snapshot.progressPercent >= 70) {
      items.push('用一组小测确认高频知识点是否稳定。');
    } else {
      items.push('先补齐当前单元概念，再安排一组短练习。');
    }

    if (statusCalendarActivities.length > 0) {
      items.push('结合最近活动预留复习时间。');
    }

    return items.slice(0, 3);
  }, [snapshot, statusCalendarActivities.length]);
  const plansByCalendarDay = useMemo(() => {
    const next = new Map<string, PracticePlan[]>();
    for (const plan of recentPlans) {
      const key = localDayKey(planCalendarTimestamp(plan));
      const items = next.get(key) || [];
      items.push(plan);
      next.set(key, items);
    }
    return next;
  }, [recentPlans]);
  const syllabusEventsByCalendarDay = useMemo(() => {
    const next = new Map<string, SyllabusCalendarEvent[]>();
    for (const event of syllabusEvents) {
      const items = next.get(event.date) || [];
      items.push(event);
      next.set(event.date, items);
    }
    return next;
  }, [syllabusEvents]);
  const upcomingSyllabusEvents = useMemo(() => {
    const today = localDayKey(calendarReferenceDate);
    return syllabusEvents
      .filter((event) => event.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
      .slice(0, 5);
  }, [calendarReferenceDate, syllabusEvents]);
  const syllabusEventSummary = useMemo(() => {
    const counts = syllabusEvents.reduce(
      (acc, event) => {
        acc[event.kind] += 1;
        return acc;
      },
      {
        assignment: 0,
        exam: 0,
        progress: 0,
        tutorial: 0,
        holiday: 0,
        other: 0,
      } satisfies Record<SyllabusEventKind, number>,
    );
    const parts = [
      counts.assignment ? `${counts.assignment} 个作业` : '',
      counts.exam ? `${counts.exam} 个考试` : '',
      counts.progress ? `${counts.progress} 个周进度` : '',
      counts.tutorial ? `${counts.tutorial} 个 tutorial` : '',
      counts.holiday ? `${counts.holiday} 个假期` : '',
      counts.other ? `${counts.other} 个事项` : '',
    ].filter(Boolean);
    return parts.length ? parts.join('，') : '';
  }, [syllabusEvents]);
  const syllabusNeedsReview = syllabusEvents.length > 0 && syllabusEvents.length < 3;
  const missingLearningSetup = !snapshot?.progressKnown && syllabusEvents.length === 0;
  const validSyllabusDraftEvents = useMemo(
    () =>
      syllabusDraftEvents
        .map((event) => ({
          ...event,
          title: event.title.trim(),
          sourceName: event.sourceName.trim() || syllabusDraftSourceName || 'syllabus',
        }))
        .filter((event) => event.title && /^\d{4}-\d{2}-\d{2}$/.test(event.date)),
    [syllabusDraftEvents, syllabusDraftSourceName],
  );

  useEffect(() => {
    if (!activeCourseId) {
      setSyllabusEvents([]);
      return;
    }
    setError(null);
    setProgressSelection('');
    setAttachments([]);
    setSyllabusImportMessage(null);
    setSyllabusDialogOpen(false);
    setSyllabusPlanDraft('');
    setSyllabusImportMode('file');
    setSyllabusCommitMode('merge');
    setSyllabusImportLoading(false);
    setSyllabusDraftEvents([]);
    setSyllabusDraftSourceName('');
    setSyllabusEvents(readSyllabusEvents(localUserId, activeCourseId));
  }, [activeCourseId, localUserId]);

  const learnSessionHref = useCallback(
    (sessionId: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (activeCourseId) next.set('courseId', activeCourseId);
      if (sessionId === 'default') next.delete('session');
      else next.set('session', sessionId);
      const query = next.toString();
      return query ? `/learn?${query}` : '/learn';
    },
    [activeCourseId, searchParams],
  );

  const switchCourse = useCallback(
    (courseId: string) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set('courseId', courseId);
      next.delete('session');
      setActiveCourseId(courseId);
      router.push(`/learn?${next.toString()}`);
    },
    [router, searchParams],
  );

  const persistLeftRailCollapsed = useCallback((collapsed: boolean) => {
    setLeftRailCollapsed(collapsed);
    try {
      localStorage.setItem(LEARN_LEFT_RAIL_COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      /* localStorage may be unavailable */
    }
  }, []);

  const persistRightRailCollapsed = useCallback((collapsed: boolean) => {
    setRightRailCollapsed(collapsed);
    try {
      localStorage.setItem(LEARN_RIGHT_RAIL_COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      /* localStorage may be unavailable */
    }
  }, []);

  useEffect(() => {
    if (!activeCourseId) {
      setLearnSessions([]);
      setMessages([]);
      setMessageStoreKey('');
      setRemoteConversationReadyKey('');
      return;
    }
    let alive = true;
    const now = Date.now();
    const nextStoreKey = `${localUserId}:${activeCourseId}:${activeSessionId}`;
    setRemoteConversationReadyKey('');
    const existing = readLearnSessions(localUserId, activeCourseId);
    const byId = new Map<string, LearnChatSession>();
    const defaultSession = existing.find((session) => session.id === 'default');
    byId.set('default', {
      id: 'default',
      title:
        defaultSession?.title && defaultSession.title !== '默认学习会话'
          ? defaultSession.title
          : '新对话',
      createdAt: defaultSession?.createdAt ?? now,
      updatedAt: defaultSession?.updatedAt ?? now,
    });
    for (const session of existing) byId.set(session.id, session);
    const currentSession = byId.get(activeSessionId);
    byId.set(activeSessionId, {
      id: activeSessionId,
      title:
        currentSession?.title && currentSession.title !== '默认学习会话'
          ? currentSession.title
          : '新对话',
      createdAt: currentSession?.createdAt ?? now,
      updatedAt: currentSession?.updatedAt ?? now,
    });
    const nextSessions = pruneDuplicateBlankLearnSessions(
      localUserId,
      activeCourseId,
      Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt),
      activeSessionId,
    );
    writeLearnSessions(localUserId, activeCourseId, nextSessions);
    setLearnSessions(nextSessions);
    setMessageStoreKey(nextStoreKey);
    const localMessages = readLearnSessionMessages(localUserId, activeCourseId, activeSessionId);
    setMessages(localMessages);

    Promise.all([
      listRemoteLearnSessions(activeCourseId),
      loadRemoteLearnConversation(activeCourseId, activeSessionId),
    ])
      .then(([remoteSessions, remoteConversation]) => {
        if (!alive) return;
        let mergedSessions = nextSessions;
        if (remoteSessions?.storage === 'database' && remoteSessions.sessions.length > 0) {
          mergedSessions = mergeLearnSessions(mergedSessions, remoteSessions.sessions);
        }

        if (remoteConversation?.storage === 'database' && remoteConversation.session) {
          const remoteSession = remoteConversation.session;
          mergedSessions = mergeLearnSessions(mergedSessions, [remoteSession]);
          const localSession = nextSessions.find((session) => session.id === activeSessionId);
          const remoteIsNewer =
            !localSession ||
            remoteSession.updatedAt >= localSession.updatedAt ||
            localMessages.length === 0;
          if (remoteIsNewer) {
            const remoteMessages = remoteConversation.messages.map(remoteMessageToLearnMessage);
            writeLearnSessionMessages(localUserId, activeCourseId, activeSessionId, remoteMessages);
            setMessages(remoteMessages);
          }
        }

        mergedSessions = pruneDuplicateBlankLearnSessions(
          localUserId,
          activeCourseId,
          mergedSessions,
          activeSessionId,
        );
        writeLearnSessions(localUserId, activeCourseId, mergedSessions);
        setLearnSessions(mergedSessions);
      })
      .finally(() => {
        if (alive) setRemoteConversationReadyKey(nextStoreKey);
      });

    return () => {
      alive = false;
    };
  }, [activeCourseId, activeSessionId, localUserId]);

  useEffect(() => {
    if (!activeCourseId) return;
    if (messageStoreKey !== activeMessageStoreKey) return;
    writeLearnSessionMessages(localUserId, activeCourseId, activeSessionId, messages);
    const syncTitle = learnSessionTitleFromMessages(messages, '新对话');
    setLearnSessions((current) => {
      const now = Date.now();
      const byId = new Map<string, LearnChatSession>();
      for (const session of current) byId.set(session.id, session);
      const currentSession = byId.get(activeSessionId);
      const fallbackTitle =
        currentSession?.title &&
        currentSession.title !== '默认学习会话' &&
        !/^新会话\s+\d+$/.test(currentSession.title)
          ? currentSession.title
          : '新对话';
      byId.set(activeSessionId, {
        id: activeSessionId,
        title: learnSessionTitleFromMessages(messages, fallbackTitle),
        createdAt: currentSession?.createdAt ?? now,
        updatedAt: messages.length > 0 ? now : (currentSession?.updatedAt ?? now),
      });
      const nextSessions = pruneDuplicateBlankLearnSessions(
        localUserId,
        activeCourseId,
        Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt),
        activeSessionId,
      );
      writeLearnSessions(localUserId, activeCourseId, nextSessions);
      return nextSessions;
    });
    if (remoteConversationReadyKey !== activeMessageStoreKey) return;

    const payload = messages.map(learnMessageToRemotePayload);
    const syncSignature = JSON.stringify({
      key: activeMessageStoreKey,
      title: syncTitle,
      messages: payload,
    });
    if (lastSyncedConversationRef.current === syncSignature) return;
    lastSyncedConversationRef.current = syncSignature;
    void syncRemoteLearnConversation({
      courseId: activeCourseId,
      sessionId: activeSessionId,
      title: syncTitle,
      messages: payload,
    }).then((ok) => {
      if (!ok && lastSyncedConversationRef.current === syncSignature) {
        lastSyncedConversationRef.current = '';
      }
    });
  }, [
    activeCourseId,
    activeMessageStoreKey,
    activeSessionId,
    localUserId,
    messageStoreKey,
    messages,
    remoteConversationReadyKey,
  ]);

  useEffect(() => {
    if (!hydrated) return;
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }
    let alive = true;
    setCoursesLoadState('loading');
    listCourses()
      .then((items) => {
        if (!alive) return;
        setCourses(items);
        setCoursesLoadState('ready');
        const urlCourseId = searchParams.get('courseId');
        const nextCourseId =
          (urlCourseId && items.some((course) => course.id === urlCourseId) ? urlCourseId : null) ||
          (storedCourseId && items.some((course) => course.id === storedCourseId)
            ? storedCourseId
            : null) ||
          items[0]?.id ||
          null;
        setActiveCourseId(nextCourseId);
      })
      .catch((err) => {
        if (!alive) return;
        setCoursesLoadState('error');
        setError(err instanceof Error ? err.message : '课程加载失败');
      });
    return () => {
      alive = false;
    };
  }, [hydrated, isLoggedIn, router, searchParams, storedCourseId]);

  useEffect(() => {
    if (!activeCourse) return;
    setCurrentCourse({
      id: activeCourse.id,
      name: activeCourse.name,
      avatarUrl: activeCourse.avatarUrl,
    });
    let alive = true;
    setAssetLoadState('loading');
    Promise.all([
      listStagesByCourse(activeCourse.id).catch(() => []),
      listCourseProblemSummaries(activeCourse.id).catch(() => []),
    ])
      .then(async ([nextNotebooks, nextProblems]) => {
        if (!alive) return;
        setNotebooks(nextNotebooks);
        setProblems(nextProblems);
        const localUserId = userId || 'anonymous';
        const remoteState = await loadRemoteLearnerCourseState(activeCourse.id);
        if (!alive) return;
        if (remoteState) saveLearnerCourseState(remoteState);
        const seeded = seedLearnerCourseStateFromCourse({
          userId: localUserId,
          course: activeCourse,
          notebooks: nextNotebooks,
          problems: nextProblems,
        });
        const nextSnapshot = summarizeLearnerCourseState({
          state: seeded,
          notebooks: nextNotebooks,
          problems: nextProblems,
        });
        setSnapshot(nextSnapshot);
        setProgressSelection(progressSelectionFromSnapshot(nextSnapshot));
        void saveRemoteLearnerCourseState(seeded);
        const deletedPlanIds = readDeletedPracticePlanIds(localUserId, activeCourse.id);
        const localPlans = visiblePracticePlans(
          listPracticePlans(localUserId, activeCourse.id),
          deletedPlanIds,
        );
        const remotePlans = await listRemotePracticePlans(activeCourse.id);
        if (!alive) return;
        const visibleRemotePlans = visiblePracticePlans(remotePlans, deletedPlanIds);
        visibleRemotePlans.forEach(savePracticePlan);
        setRecentPlans(mergePlans(localPlans, visibleRemotePlans).slice(0, 4));
        setAssetLoadState('ready');
      })
      .catch((err) => {
        if (!alive) return;
        setAssetLoadState('error');
        setError(err instanceof Error ? err.message : '课程材料加载失败');
      });
    return () => {
      alive = false;
    };
  }, [activeCourse, setCurrentCourse, userId]);

  const refreshLearnerSnapshot = useCallback(() => {
    if (!activeCourse) return;
    const localUserId = userId || 'anonymous';
    const nextState = loadLearnerCourseState({
      userId: localUserId,
      courseId: activeCourse.id,
    });
    const nextSnapshot = summarizeLearnerCourseState({ state: nextState, notebooks, problems });
    setSnapshot(nextSnapshot);
    setProgressSelection(progressSelectionFromSnapshot(nextSnapshot));
    void saveRemoteLearnerCourseState(nextState);
    const deletedPlanIds = readDeletedPracticePlanIds(localUserId, activeCourse.id);
    const localPlans = visiblePracticePlans(
      listPracticePlans(localUserId, activeCourse.id),
      deletedPlanIds,
    );
    setRecentPlans(localPlans.slice(0, 4));
    void listRemotePracticePlans(activeCourse.id).then((remotePlans) => {
      const nextDeletedPlanIds = readDeletedPracticePlanIds(localUserId, activeCourse.id);
      const visibleRemotePlans = visiblePracticePlans(remotePlans, nextDeletedPlanIds);
      visibleRemotePlans.forEach(savePracticePlan);
      setRecentPlans(
        mergePlans(visiblePracticePlans(localPlans, nextDeletedPlanIds), visibleRemotePlans).slice(
          0,
          4,
        ),
      );
    });
  }, [activeCourse, notebooks, problems, userId]);

  const updateLearningPosition = useCallback(
    (selection: string) => {
      if (!activeCourse || !selection) return null;
      const localUserId = userId || 'anonymous';
      const checkpoint = progressCheckpointForSelection(selection);
      if (!checkpoint) return null;
      const nextState = setLearnerProgressCheckpoint({
        userId: localUserId,
        courseId: activeCourse.id,
        notebooks,
        kind: checkpoint.kind,
        notebookId: checkpoint.notebookId,
      });
      const nextSnapshot = summarizeLearnerCourseState({ state: nextState, notebooks, problems });
      const label = progressLabelForSelection(selection, notebooks);
      setSnapshot(nextSnapshot);
      setProgressSelection(progressSelectionFromSnapshot(nextSnapshot));
      void saveRemoteLearnerCourseState(nextState);
      announceLearningMemoryUpdated(label);
      return { state: nextState, snapshot: nextSnapshot, label };
    },
    [activeCourse, notebooks, problems, userId],
  );

  const confirmPlanningScope = useCallback(
    (selection: string, action: PendingCourseAction | undefined) => {
      if (!activeCourse || !selection || !action) return null;
      const checkpoint = progressCheckpointForSelection(selection);
      if (!checkpoint) return null;
      const localUserId = userId || 'anonymous';
      const seededState = seedLearnerCourseStateFromCourse({
        userId: localUserId,
        course: activeCourse,
        notebooks,
        problems,
      });
      const savedState = setLearnerPlanningScope({
        userId: localUserId,
        courseId: activeCourse.id,
        notebooks,
        kind: checkpoint.kind,
        notebookId: checkpoint.notebookId,
        purpose: action.kind,
        prompt: action.prompt,
      });
      const scopedState = previewLearnerProgressCheckpoint({
        state: savedState,
        notebooks,
        kind: checkpoint.kind,
        notebookId: checkpoint.notebookId,
      });
      const nextSnapshot = summarizeLearnerCourseState({
        state: seededState,
        notebooks,
        problems,
      });
      const scopedSnapshot = summarizeLearnerCourseState({
        state: scopedState,
        notebooks,
        problems,
      });
      const label = progressLabelForSelection(selection, notebooks);
      setSnapshot(nextSnapshot);
      setProgressSelection(progressSelectionFromSnapshot(nextSnapshot));
      void saveRemoteLearnerCourseState(savedState);
      announceLearningMemoryUpdated(label, '计划范围已记录');
      return { state: scopedState, snapshot: scopedSnapshot, label };
    },
    [activeCourse, notebooks, problems, userId],
  );

  const updateMessageProgressProposal = useCallback(
    (messageId: string, selection: string) => {
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId && message.progressProposal
            ? {
                ...message,
                progressProposal: {
                  ...message.progressProposal,
                  selection,
                  label: progressLabelForSelection(selection, notebooks),
                },
              }
            : message,
        ),
      );
    },
    [notebooks],
  );

  const dismissMessageProgressProposal = useCallback((messageId: string) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId && message.progressProposal
          ? {
              ...message,
              text: '好的，我先不更新学习进度。你也可以随时点“更新学习进度”手动调整。',
              progressProposal: undefined,
              pendingAction: undefined,
            }
          : message,
      ),
    );
  }, []);

  const deleteLearnMessage = useCallback((messageId: string) => {
    setMessages((current) => current.filter((message) => message.id !== messageId));
  }, []);

  const copyLearnMessage = useCallback(async (message: LearnMessage) => {
    const text = copyableLearnMessageText(message);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard can be unavailable in some browser permission states.
    }
  }, []);

  const handleModelChange = useCallback(
    (value: string) => {
      const parsed = parseModelOptionValue(value);
      if (!parsed) return;
      setModel(parsed.providerId, parsed.modelId);
    },
    [setModel],
  );

  const handleImageFiles = useCallback(
    async (fileList: FileList | File[] | null) => {
      const files = Array.from(fileList || []).filter((file) => file.type.startsWith('image/'));
      if (!files.length) return;
      const remainingSlots = Math.max(0, MAX_LEARN_CHAT_IMAGES - attachments.length);
      if (remainingSlots <= 0) {
        setError(`最多添加 ${MAX_LEARN_CHAT_IMAGES} 张图片。`);
        return;
      }
      try {
        const prepared = await Promise.all(
          files.slice(0, remainingSlots).map((file) => prepareLearnImageAttachment(file)),
        );
        setAttachments((current) => [...current, ...prepared].slice(0, MAX_LEARN_CHAT_IMAGES));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : '图片添加失败');
      }
    },
    [attachments.length],
  );

  const handleLearnUploadFiles = useCallback(
    async (fileList: FileList | null) => {
      const files = Array.from(fileList || []);
      if (!files.length) return;

      const imageFiles = files.filter((file) => file.type.startsWith('image/'));
      const sourceFiles = files.filter(isLearnSourceDocumentFile);
      const unsupportedFiles = files.filter(
        (file) => !file.type.startsWith('image/') && !isLearnSourceDocumentFile(file),
      );

      if (imageFiles.length) {
        await handleImageFiles(imageFiles);
      }
      if (unsupportedFiles.length) {
        setError(
          `暂不支持 ${unsupportedFiles[0].name}，请上传图片、PDF、PPTX、Markdown 或文本文件。`,
        );
      }
      if (!sourceFiles.length) return;
      if (!activeCourse) {
        setError('请先选择课程，再上传课程资料。');
        return;
      }
      if (sourceUploading) {
        openSourceUploadPanel();
        return;
      }

      const queuedSourceFiles = sourceFiles.slice(0, 3);
      if (sourceFiles.length > queuedSourceFiles.length) {
        setError('一次最多入库 3 个课程资料文件，已处理前 3 个。');
      }

      openSourceUploadPanel();
      setSourceUploading(true);
      if (sourceFiles.length <= queuedSourceFiles.length) setError(null);
      let didIngestAnyFile = false;
      try {
        for (const file of queuedSourceFiles) {
          const sourceKind = learnSourceKindForFile(file);
          const itemId = makeClientId('source-upload');
          const now = Date.now();
          setSourceUploadItems((current) => [
            {
              id: itemId,
              fileName: file.name,
              sourceKind,
              status: 'ingesting',
              createdAt: now,
              updatedAt: now,
            },
            ...current,
          ]);
          const activityId = addMemoryActivity({
            title: '课程资料入库中',
            description: `正在入库：${file.name}`,
            status: 'indexing_source',
            layer: 'knowledge_index',
            chips: [activeCourse.courseCode || '课程', '资料'],
          });

          const maxSize =
            sourceKind === 'plain_text' ||
            sourceKind === 'markdown' ||
            sourceKind === 'problem_bank'
              ? MAX_LEARN_SOURCE_TEXT_FILE_BYTES
              : MAX_LEARN_SOURCE_DOCUMENT_BYTES;

          try {
            if (file.size > maxSize) {
              throw new Error(
                `${file.name} 太大，请上传 ${compactBytes(maxSize)} 以内的课程资料。`,
              );
            }

            const text = await readLearnSourceFileText(file, {
              pdfProviderId,
              pdfProviderConfig,
            });
            const response = await backendJson<CourseSourceIngestResponse>(
              `/api/courses/${encodeURIComponent(activeCourse.id)}/source-ingest`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(providerId === 'openai' && modelId ? { 'x-model': `openai:${modelId}` } : {}),
                },
                body: JSON.stringify({
                  sourceTitle: file.name,
                  sourceKind,
                  sourceFileMime: file.type || undefined,
                  language: activeCourse.language === 'en-US' ? 'en-US' : 'zh-CN',
                  text,
                }),
              },
            );
            const summary = formatSourceUploadStatusSummary(response.ingest);
            updateSourceUploadItem(itemId, {
              status: 'stored',
              summary,
              error: undefined,
            });
            updateMemoryActivity(activityId, {
              title: '课程资料已入库',
              description: summary,
              status: 'completed',
              layer: 'knowledge_index',
              chips: [activeCourse.courseCode || '课程', '资料'],
            });
            notifySourceUploadLive2D(file.name, response.ingest);
            if (!sourceUploadPanelOpenRef.current) {
              setCompletedSourceUploadBadgeCount((count) => Math.min(99, count + 1));
            }
            didIngestAnyFile = true;
            setMessages((current) => [
              ...current,
              {
                id: makeClientId('assistant-source-upload-done'),
                role: 'assistant',
                text: formatSourceIngestMessage(file.name, response.ingest),
                createdAt: Date.now(),
              },
            ]);
          } catch (err) {
            const message = err instanceof Error ? err.message : '课程资料上传失败';
            updateSourceUploadItem(itemId, {
              status: 'failed',
              error: message,
            });
            updateMemoryActivity(activityId, {
              title: '课程资料入库失败',
              description: file.name,
              status: 'failed',
              layer: 'knowledge_index',
              chips: [activeCourse.courseCode || '课程', '资料'],
              error: message,
            });
            notifySourceUploadFailureLive2D(file.name, message);
            setError(message);
            setMessages((current) => [
              ...current,
              {
                id: makeClientId('assistant-source-upload-error'),
                role: 'assistant',
                text: `${message}。`,
                createdAt: Date.now(),
              },
            ]);
          }
        }

        if (didIngestAnyFile) {
          const [nextNotebooks, nextProblems] = await Promise.all([
            listStagesByCourse(activeCourse.id).catch(() => notebooks),
            listCourseProblemSummaries(activeCourse.id).catch(() => problems),
          ]);
          setNotebooks(nextNotebooks);
          setProblems(nextProblems);
          refreshLearnerSnapshot();
        }
      } finally {
        setSourceUploading(false);
      }
    },
    [
      activeCourse,
      handleImageFiles,
      modelId,
      notebooks,
      openSourceUploadPanel,
      pdfProviderConfig,
      pdfProviderId,
      problems,
      providerId,
      refreshLearnerSnapshot,
      sourceUploading,
      updateSourceUploadItem,
    ],
  );

  const commitSyllabusEvents = useCallback(
    (
      incomingEvents: SyllabusCalendarEvent[],
      message: string,
      activityLabel: string,
      mode: SyllabusCommitMode,
    ) => {
      if (!activeCourseId || !incomingEvents.length) return;
      const nextEvents =
        mode === 'replace'
          ? incomingEvents
              .slice()
              .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
          : mergeSyllabusEvents(syllabusEvents, incomingEvents);
      writeSyllabusEvents(localUserId, activeCourseId, nextEvents);
      setSyllabusEvents(nextEvents);
      setSyllabusImportMessage(message);
      setSyllabusDialogOpen(false);
      setSyllabusDraftEvents([]);
      setSyllabusDraftSourceName('');
      setSyllabusImportLoading(false);
      setRightRailView('calendar');

      const today = localDayKey(new Date());
      const focusEvent =
        incomingEvents
          .slice()
          .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
          .find((event) => event.date >= today) || incomingEvents[0];
      setCalendarReferenceDate(new Date(`${focusEvent.date}T12:00:00`));
      announceSyllabusScheduleUpdated(activityLabel);
    },
    [activeCourseId, localUserId, syllabusEvents],
  );

  const openSyllabusUploadDialog = useCallback(
    (mode: SyllabusCommitMode = syllabusEvents.length ? 'replace' : 'merge') => {
      setSyllabusImportMode('file');
      setSyllabusCommitMode(mode);
      setSyllabusImportMessage(null);
      setSyllabusImportLoading(false);
      setSyllabusDraftEvents([]);
      setSyllabusDraftSourceName('');
      setSyllabusDialogOpen(true);
    },
    [syllabusEvents.length],
  );

  const openSyllabusEditDialog = useCallback(() => {
    setSyllabusImportMode('file');
    setSyllabusCommitMode('replace');
    setSyllabusImportMessage(null);
    setSyllabusImportLoading(false);
    setSyllabusDraftSourceName('已保存 syllabus');
    setSyllabusDraftEvents(
      syllabusEvents.map((event) => ({
        ...event,
        id: makeClientId('syllabus-draft'),
      })),
    );
    setSyllabusDialogOpen(true);
  }, [syllabusEvents]);

  const clearSyllabusEvents = useCallback(() => {
    if (!activeCourseId) return;
    writeSyllabusEvents(localUserId, activeCourseId, []);
    setSyllabusEvents([]);
    setSyllabusDraftEvents([]);
    setSyllabusDraftSourceName('');
    setSyllabusImportMessage('已清空 syllabus 日程。');
    announceSyllabusScheduleUpdated('已清空 syllabus 日程');
  }, [activeCourseId, localUserId]);

  const removeStatusCalendarActivity = useCallback(
    (activity: StatusCalendarActivity) => {
      if (!activeCourseId) return;

      if (activity.source === 'plan') {
        rememberDeletedPracticePlanId(localUserId, activeCourseId, activity.sourceId);
        deletePracticePlan(activity.sourceId, localUserId);
        setRecentPlans((current) => current.filter((plan) => plan.id !== activity.sourceId));
        return;
      }

      const nextEvents = syllabusEvents.filter((event) => event.id !== activity.sourceId);
      writeSyllabusEvents(localUserId, activeCourseId, nextEvents);
      setSyllabusEvents(nextEvents);
      if (syllabusDraftEvents.some((event) => event.id === activity.sourceId)) {
        setSyllabusDraftEvents((current) =>
          current.filter((event) => event.id !== activity.sourceId),
        );
      }
    },
    [activeCourseId, localUserId, syllabusDraftEvents, syllabusEvents],
  );

  const handleSyllabusFile = useCallback(
    async (fileList: FileList | null) => {
      if (!activeCourseId) return;
      const file = fileList?.[0];
      if (!file) return;
      const isPdfFile = isSyllabusPdfFile(file);
      const maxSize = isPdfFile ? MAX_SYLLABUS_PDF_FILE_BYTES : MAX_SYLLABUS_TEXT_FILE_BYTES;
      if (file.size > maxSize) {
        setSyllabusDraftEvents([]);
        setSyllabusImportMessage(
          isPdfFile
            ? 'PDF 文件太大，请上传 12MB 以内的 syllabus。'
            : 'Syllabus 文件太大，请先导出为较短的文本或 Markdown。',
        );
        return;
      }
      try {
        setSyllabusImportLoading(true);
        setSyllabusDraftEvents([]);
        setSyllabusDraftSourceName(file.name);
        setSyllabusImportMessage(isPdfFile ? '正在用 AI 读取 syllabus PDF...' : null);
        let parsedEvents: SyllabusCalendarEvent[];
        let parseWarnings: string[] = [];
        if (isPdfFile) {
          try {
            const parsed = await parseSyllabusPdfWithOpenAI(file, {
              courseName: activeCourse?.name,
              courseDescription: activeCourse?.description,
            });
            parseWarnings = parsed.warnings;
            parsedEvents = parsed.events.map((event) => ({
              id: makeClientId('syllabus-event'),
              title: event.title,
              kind: event.kind,
              date: event.date,
              sourceName: file.name,
              createdAt: Date.now(),
              week: event.week,
              sourceColumn: event.sourceColumn,
              rawText: event.rawText,
              confidence: event.confidence,
            }));
          } catch {
            setSyllabusImportMessage('AI 读取失败，正在用文本解析兜底...');
            const text = await readSyllabusFileText(file, {
              pdfProviderId,
              pdfProviderConfig,
            });
            parsedEvents = parseSyllabusEventsFromText(text, file.name);
            parseWarnings = ['AI 文件读取失败，已使用文本解析兜底。'];
          }
        } else {
          const text = await readSyllabusFileText(file, {
            pdfProviderId,
            pdfProviderConfig,
          });
          parsedEvents = parseSyllabusEventsFromText(text, file.name);
        }
        if (!parsedEvents.length) {
          setSyllabusImportMessage('没有识别到带日期的作业、考试或课程进度。');
          return;
        }
        const warningText = parseWarnings.length ? ` ${parseWarnings[0]}` : '';
        setSyllabusDraftEvents(parsedEvents);
        setSyllabusImportMessage(
          `识别出 ${parsedEvents.length} 个 syllabus 事项。请检查后确认添加。${warningText}`,
        );
      } catch (err) {
        setSyllabusDraftEvents([]);
        setSyllabusImportMessage(err instanceof Error ? err.message : 'Syllabus 导入失败');
      } finally {
        setSyllabusImportLoading(false);
      }
    },
    [
      activeCourse?.description,
      activeCourse?.name,
      activeCourseId,
      pdfProviderConfig,
      pdfProviderId,
    ],
  );

  const handleSimulateSyllabus = useCallback(() => {
    if (!activeCourse || !activeCourseId) return;
    const generatedEvents = simulateSyllabusEventsFromPlan({
      course: activeCourse,
      notebooks,
      planText: syllabusPlanDraft,
    });
    setSyllabusDraftSourceName('模拟 syllabus');
    setSyllabusDraftEvents(generatedEvents);
    setSyllabusImportMessage(`已生成 ${generatedEvents.length} 个模拟事项。请检查后确认添加。`);
  }, [activeCourse, activeCourseId, notebooks, syllabusPlanDraft]);

  const updateSyllabusDraftEvent = useCallback(
    (eventId: string, patch: Partial<SyllabusCalendarEvent>) => {
      setSyllabusDraftEvents((current) =>
        current.map((event) => (event.id === eventId ? { ...event, ...patch } : event)),
      );
    },
    [],
  );

  const removeSyllabusDraftEvent = useCallback((eventId: string) => {
    setSyllabusDraftEvents((current) => current.filter((event) => event.id !== eventId));
  }, []);

  const addSyllabusDraftEvent = useCallback(() => {
    setSyllabusDraftEvents((current) => [
      ...current,
      {
        id: makeClientId('syllabus-draft'),
        title: '',
        kind: 'other',
        date: localDayKey(new Date()),
        sourceName: syllabusDraftSourceName || '手动添加',
        createdAt: Date.now(),
      },
    ]);
  }, [syllabusDraftSourceName]);

  const confirmSyllabusDraftEvents = useCallback(() => {
    if (!validSyllabusDraftEvents.length) {
      setSyllabusImportMessage('请至少保留一个标题和日期都有效的事项。');
      return;
    }
    const sourceLabel = syllabusDraftSourceName || 'syllabus';
    const modeLabel = syllabusCommitMode === 'replace' ? '已更新' : '已添加';
    commitSyllabusEvents(
      validSyllabusDraftEvents.map((event) => ({
        ...event,
        sourceName: event.sourceName || sourceLabel,
        createdAt: event.createdAt || Date.now(),
      })),
      `${modeLabel} ${validSyllabusDraftEvents.length} 个 syllabus 事项。`,
      `${sourceLabel}，${validSyllabusDraftEvents.length} 个事项`,
      syllabusCommitMode,
    );
    setSyllabusPlanDraft('');
  }, [commitSyllabusEvents, syllabusCommitMode, syllabusDraftSourceName, validSyllabusDraftEvents]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }, []);

  const createNewLearnSession = useCallback(() => {
    if (!activeCourseId) return;
    if (learnSessionIsBlank(messages)) return;

    const existingBlankSession = learnSessions.find(
      (session) =>
        session.id !== activeSessionId &&
        learnSessionIsBlank(readLearnSessionMessages(localUserId, activeCourseId, session.id)),
    );
    if (existingBlankSession) {
      const nextSessions = pruneDuplicateBlankLearnSessions(
        localUserId,
        activeCourseId,
        learnSessions.map((session) =>
          session.id === existingBlankSession.id
            ? { ...session, title: session.title || '新对话', updatedAt: Date.now() }
            : session,
        ),
        existingBlankSession.id,
      );
      writeLearnSessions(localUserId, activeCourseId, nextSessions);
      setLearnSessions(nextSessions);
      router.push(learnSessionHref(existingBlankSession.id));
      return;
    }

    const now = Date.now();
    const nextSession: LearnChatSession = {
      id: makeLearnSessionId(),
      title: '新对话',
      createdAt: now,
      updatedAt: now,
    };
    const nextSessions = [nextSession, ...learnSessions];
    writeLearnSessions(localUserId, activeCourseId, nextSessions);
    setLearnSessions(nextSessions);
    router.push(learnSessionHref(nextSession.id));
  }, [
    activeCourseId,
    activeSessionId,
    learnSessionHref,
    learnSessions,
    localUserId,
    messages,
    router,
  ]);

  const addAssistantPlan = useCallback(
    (plan: PracticePlan) => {
      void saveRemotePracticePlan(plan);
      setMessages((current) => [
        ...current,
        {
          id: makeClientId('assistant-plan'),
          role: 'assistant',
          text: planIntro(plan),
          createdAt: Date.now(),
          plan,
        },
      ]);
      refreshLearnerSnapshot();
    },
    [refreshLearnerSnapshot],
  );

  const buildPlan = useCallback(
    (
      mode: PracticePlanMode,
      prompt?: string,
      targetCount?: number,
      preferredConcepts?: string[],
      stateOverride?: LearnerCourseState,
      preferredProblemIds?: string[],
    ) => {
      if (!activeCourse) return null;
      return createPracticePlan({
        userId: userId || 'anonymous',
        course: activeCourse,
        notebooks,
        problems,
        mode,
        prompt,
        targetCount,
        preferredConcepts,
        stateOverride,
        preferredProblemIds,
      });
    },
    [activeCourse, notebooks, problems, userId],
  );

  const continuePendingAction = useCallback(
    async (
      action: PendingCourseAction | undefined,
      nextState: LearnerCourseState,
      nextSnapshot: LearnerCourseSnapshot,
    ) => {
      if (!action || !activeCourse) return;
      setSending(true);
      if (action.kind === 'practice_plan') {
        try {
          const preferredProblemIds = await loadMemoryPreferredProblemIds({
            courseId: activeCourse.id,
            prompt: action.prompt,
          });
          const plan = buildPlan(
            action.mode,
            action.prompt,
            undefined,
            undefined,
            nextState,
            preferredProblemIds,
          );
          if (plan) {
            addAssistantPlan(plan);
            return;
          }
          setMessages((current) => [
            ...current,
            {
              id: makeClientId('assistant-plan-empty'),
              role: 'assistant',
              text: '进度已经更新，但这门课当前没有足够题目生成计划。你可以先问我整理复习重点。',
              createdAt: Date.now(),
            },
          ]);
        } finally {
          setSending(false);
        }
        return;
      }

      try {
        const result = await askCourseOrchestrator({
          courseId: activeCourse.id,
          courseName: activeCourse.name,
          question: action.prompt,
          orchestratorAvatarUrl: activeCourse.avatarUrl,
          learnerContext: buildLearnerChatContext({
            snapshot: nextSnapshot,
            state: nextState,
            plans: recentPlans,
            syllabusEvents,
          }),
          userProfile: { nickname: userName },
        });
        const answer =
          latestAssistantText(result.messages) ||
          result.answer ||
          buildLocalLearningAnswer({
            text: action.prompt,
            course: activeCourse,
            snapshot: nextSnapshot,
            state: nextState,
          }) ||
          `已按 ${nextSnapshot.progressLabel || '刚确认的范围'} 安排复习。`;
        setMessages((current) => [
          ...current,
          {
            id: makeClientId('assistant-review-plan'),
            role: 'assistant',
            text: answer,
            createdAt: Date.now(),
          },
        ]);
        refreshLearnerSnapshot();
      } catch {
        const answer =
          buildLocalLearningAnswer({
            text: action.prompt,
            course: activeCourse,
            snapshot: nextSnapshot,
            state: nextState,
          }) ||
          `已按 ${nextSnapshot.progressLabel || '刚确认的范围'} 安排复习。\n\n1. 先用 10 分钟回看这一段的核心定义和例子。\n2. 再用 20 分钟只复习相关薄弱点，不做全量重刷。\n3. 最后做一组对应题，做完后我会根据结果更新下一轮复习范围。`;
        setMessages((current) => [
          ...current,
          {
            id: makeClientId('assistant-review-plan'),
            role: 'assistant',
            text: answer,
            createdAt: Date.now(),
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    [
      activeCourse,
      addAssistantPlan,
      buildPlan,
      recentPlans,
      refreshLearnerSnapshot,
      syllabusEvents,
      userName,
    ],
  );

  const confirmMessageProgressProposal = useCallback(
    (messageId: string, selection: string) => {
      if (!selection) return;
      const message = messages.find((item) => item.id === messageId);
      const writeMode = message?.progressProposal?.writeMode ?? 'progress';
      const result =
        writeMode === 'planning_scope'
          ? confirmPlanningScope(selection, message?.pendingAction)
          : updateLearningPosition(selection);
      if (!result) return;
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId && message.progressProposal
            ? {
                ...message,
                text:
                  writeMode === 'planning_scope'
                    ? `已确认本次范围：${result.label}。`
                    : `已更新学习进度：${result.label}。`,
                progressProposal: {
                  ...message.progressProposal,
                  selection,
                  label: result.label,
                  confirmed: true,
                },
                pendingAction: undefined,
              }
            : message,
        ),
      );
      void continuePendingAction(message?.pendingAction, result.state, result.snapshot);
    },
    [confirmPlanningScope, continuePendingAction, messages, updateLearningPosition],
  );

  const addProgressRequestMessage = useCallback(
    (args: {
      snapshot: LearnerCourseSnapshot | null;
      intent?: PlanningIntent | null;
      text?: string;
      detectedProposal?: ProgressProposal | null;
    }) => {
      const hasDetectedProgress = Boolean(args.detectedProposal);
      const progressKnown = Boolean(args.snapshot?.progressKnown);
      const selection =
        args.detectedProposal?.selection || progressSelectionFromSnapshot(args.snapshot);
      const writeMode =
        args.intent && progressKnown && !hasDetectedProgress ? 'planning_scope' : 'progress';
      const messageId = makeClientId('assistant-progress-proposal');
      const title =
        writeMode === 'progress'
          ? '确认学习进度'
          : args.intent?.kind === 'review_plan'
            ? '确认复习范围'
            : '确认题目范围';
      setMessages((current) => [
        ...current,
        {
          id: messageId,
          role: 'assistant',
          text: progressRequestText({
            intent: args.intent,
            hasDetectedProgress,
            progressKnown,
          }),
          createdAt: Date.now(),
          progressProposal: {
            selection,
            label: args.detectedProposal?.label || progressLabelForSelection(selection, notebooks),
            reason: progressRequestReason({
              intent: args.intent,
              hasDetectedProgress,
              detectedReason: args.detectedProposal?.reason,
              progressKnown,
            }),
            title,
            confirmLabel: args.intent ? '确认并继续' : '确认更新',
            writeMode,
          },
          pendingAction:
            args.intent && args.text
              ? pendingActionFromPlanningIntent(args.intent, args.text)
              : undefined,
        },
      ]);
    },
    [notebooks],
  );

  const startPlan = useCallback(
    (plan: PracticePlan) => {
      router.push(`/practice/${encodeURIComponent(plan.id)}`);
    },
    [router],
  );

  const startStatusCalendarActivity = useCallback(
    (activity: StatusCalendarActivity) => {
      if (activity.source !== 'plan') return;
      router.push(`/practice/${encodeURIComponent(activity.sourceId)}`);
    },
    [router],
  );

  const regeneratePlan = useCallback(
    (plan: PracticePlan) => {
      const nextPlan = buildPlan(
        plan.mode,
        plan.createdFrom.prompt,
        plan.problemIds.length || undefined,
      );
      if (nextPlan) addAssistantPlan(nextPlan);
    },
    [addAssistantPlan, buildPlan],
  );

  const easierPlan = useCallback(
    (plan: PracticePlan) => {
      const nextPlan = buildPlan(
        plan.mode,
        plan.createdFrom.prompt,
        5,
        plan.targetConcepts.slice(0, 2),
      );
      if (nextPlan) addAssistantPlan(nextPlan);
    },
    [addAssistantPlan, buildPlan],
  );

  const sendMessage = useCallback(
    async (textOverride?: string) => {
      const text = (textOverride ?? draft).trim();
      const outgoingAttachments = attachments;
      const hasAttachments = outgoingAttachments.length > 0;
      if ((!text && !hasAttachments) || !activeCourse || sending || sourceUploading) return;
      if (hasAttachments && selectedKnownNoVision) {
        setError('当前模型不支持图片，请先切换到带视觉能力的模型。');
        return;
      }
      const questionText = text || '请看我上传的图片，结合课程内容帮我分析。';
      setDraft('');
      setAttachments([]);
      setError(null);
      setSending(true);
      setMessages((current) => [
        ...current,
        {
          id: makeClientId('user'),
          role: 'user',
          text: questionText,
          attachments: outgoingAttachments,
          createdAt: Date.now(),
        },
      ]);
      const questionState = recordLearnerQuestion({
        userId: userId || 'anonymous',
        courseId: activeCourse.id,
        text: hasAttachments
          ? `${questionText}\n[学生上传了 ${outgoingAttachments.length} 张图片]`
          : questionText,
      });
      const questionSnapshot = summarizeLearnerCourseState({
        state: questionState,
        notebooks,
        problems,
      });
      setSnapshot(questionSnapshot);
      setProgressSelection(progressSelectionFromSnapshot(questionSnapshot));
      void saveRemoteLearnerCourseState(questionState);

      const planningIntent = detectPlanningIntent(questionText);
      const progressProposal = detectProgressProposal({
        text: questionText,
        notebooks,
        snapshot: questionSnapshot,
      });

      if (!hasAttachments && planningIntent) {
        addProgressRequestMessage({
          snapshot: questionSnapshot,
          intent: planningIntent,
          text: questionText,
          detectedProposal: progressProposal,
        });
        setSending(false);
        return;
      }

      if (!hasAttachments && progressProposal) {
        addProgressRequestMessage({
          snapshot: questionSnapshot,
          detectedProposal: progressProposal,
        });
        setSending(false);
        return;
      }

      if (
        !hasAttachments &&
        !questionSnapshot.progressKnown &&
        needsProgressConfirmation(questionText)
      ) {
        addProgressRequestMessage({
          snapshot: questionSnapshot,
        });
        setSending(false);
        return;
      }

      const localAnswer = buildLocalLearningAnswer({
        text: questionText,
        course: activeCourse,
        snapshot: questionSnapshot,
        state: questionState,
      });
      if (!hasAttachments && localAnswer) {
        setMessages((current) => [
          ...current,
          {
            id: makeClientId('assistant-state'),
            role: 'assistant',
            text: localAnswer,
            createdAt: Date.now(),
          },
        ]);
        setSending(false);
        return;
      }

      try {
        const result = await askCourseOrchestrator({
          courseId: activeCourse.id,
          courseName: activeCourse.name,
          question: questionText,
          attachments: outgoingAttachments.map((attachment) => ({
            id: attachment.id,
            name: attachment.name,
            mimeType: attachment.mimeType,
            size: attachment.size,
            dataUrl: attachment.dataUrl,
          })),
          orchestratorAvatarUrl: activeCourse.avatarUrl,
          learnerContext: buildLearnerChatContext({
            snapshot: questionSnapshot,
            state: questionState,
            plans: recentPlans,
            syllabusEvents,
          }),
          userProfile: { nickname: userName },
        });
        const answer =
          latestAssistantText(result.messages) || result.answer || '我先记录下这个问题。';
        setMessages((current) => [
          ...current,
          {
            id: makeClientId('assistant'),
            role: 'assistant',
            text: answer,
            createdAt: Date.now(),
          },
        ]);
        refreshLearnerSnapshot();
      } catch (err) {
        const message = err instanceof Error ? err.message : '课程回复失败';
        setMessages((current) => [
          ...current,
          {
            id: makeClientId('assistant-error'),
            role: 'assistant',
            text: `${message}。我仍然可以先帮你生成刷题计划或查看课程状态。`,
            createdAt: Date.now(),
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    [
      activeCourse,
      addProgressRequestMessage,
      attachments,
      draft,
      notebooks,
      problems,
      refreshLearnerSnapshot,
      recentPlans,
      selectedKnownNoVision,
      sending,
      sourceUploading,
      syllabusEvents,
      userId,
      userName,
    ],
  );

  if (!hydrated || coursesLoadState === 'loading') {
    return (
      <div className="grid h-full min-h-[70dvh] place-items-center text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          加载课程…
        </div>
      </div>
    );
  }

  if (!activeCourse) {
    return (
      <div className="grid h-full min-h-[70dvh] place-items-center px-6 text-center">
        <div className="max-w-md">
          <ShoppingBag className="mx-auto size-10 text-muted-foreground" />
          <h1 className="mt-4 text-2xl font-semibold text-foreground">先加入一门课程</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            新版学习页以课程为主线。加入课程后，聊天、复习、题库和记忆都会围绕这门课展开。
          </p>
          <Button onClick={() => router.push('/store/courses')} className="mt-5 gap-2">
            <ShoppingBag className="size-4" />
            去课程商城
          </Button>
        </div>
      </div>
    );
  }

  const courseSidebar = (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col transition-[padding] duration-300',
        leftRailCollapsed ? 'items-center px-1 py-3' : 'px-4 py-5',
      )}
    >
      {leftRailCollapsed ? (
        <button
          type="button"
          onClick={() => persistLeftRailCollapsed(false)}
          className="mb-3 flex size-8 items-center justify-center rounded-[10px] text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
          aria-label="展开左侧栏"
          title="展开左侧栏"
        >
          <ChevronRight className="size-4" strokeWidth={1.75} />
        </button>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[17px] font-semibold leading-none text-slate-950 dark:text-slate-50">
              课程
            </p>
            <p className="mt-1.5 text-xs text-slate-500">Course Library</p>
          </div>
          <button
            type="button"
            onClick={() => persistLeftRailCollapsed(true)}
            className="flex size-8 shrink-0 items-center justify-center rounded-[10px] text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
            aria-label="收起左侧栏"
            title="收起左侧栏"
          >
            <ChevronLeft className="size-4" strokeWidth={1.75} />
          </button>
        </div>
      )}

      <nav
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-y-auto',
          leftRailCollapsed ? 'mt-0 items-center gap-2 pb-4' : 'mt-4 gap-2 pb-4',
        )}
      >
        {courses.map((course) => {
          const active = course.id === activeCourseId;
          return (
            <button
              key={course.id}
              type="button"
              onClick={() => switchCourse(course.id)}
              className={cn(
                leftRailCollapsed
                  ? 'flex size-12 items-center justify-center rounded-[15px] transition hover:bg-white hover:shadow-sm hover:ring-1 hover:ring-slate-200'
                  : 'group relative flex min-h-[68px] w-full min-w-0 items-center gap-3 rounded-[18px] border px-3 py-2.5 text-left transition hover:border-slate-200 hover:bg-white hover:shadow-sm',
                active
                  ? leftRailCollapsed
                    ? 'bg-white shadow-sm ring-1 ring-sky-200'
                    : 'border-sky-200 bg-sky-50/55 shadow-[0_12px_28px_rgba(14,165,233,0.10)]'
                  : !leftRailCollapsed
                    ? 'border-transparent bg-transparent'
                    : null,
              )}
              aria-current={active ? 'page' : undefined}
              aria-label={course.name}
              title={course.name}
            >
              {!leftRailCollapsed && active ? (
                <span className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-sky-500" />
              ) : null}
              <CourseAvatar course={course} className={cn(!leftRailCollapsed && 'size-11')} />
              {!leftRailCollapsed ? (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold leading-5 text-slate-950 dark:text-slate-50">
                    {course.name}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">
                    {course.courseCode || courseSubtitle(course) || '课程对话'}
                  </span>
                  {active && snapshot?.progressKnown ? (
                    <span className="mt-2 flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                        <span
                          className="block h-full rounded-full bg-sky-500"
                          style={{
                            width: `${Math.min(100, Math.max(4, snapshot.progressPercent))}%`,
                          }}
                        />
                      </span>
                      <span className="text-[10px] font-semibold tabular-nums text-slate-500">
                        {snapshot.progressPercent}%
                      </span>
                    </span>
                  ) : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div
        className={cn(
          'shrink-0 border-t border-slate-200/80 pt-3',
          leftRailCollapsed ? 'w-full' : null,
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size={leftRailCollapsed ? 'icon' : 'default'}
          className={cn(
            leftRailCollapsed
              ? 'mx-auto flex size-10 rounded-[13px] text-slate-600 hover:bg-white hover:text-slate-950 hover:shadow-sm'
              : 'h-10 w-full justify-start gap-2 rounded-[13px] px-3 text-sm text-slate-700 hover:bg-white hover:text-slate-950 hover:shadow-sm',
          )}
          onClick={() => router.push('/courses/new')}
          aria-label="新建课程"
          title="新建课程"
        >
          <Plus className="size-4" />
          {!leftRailCollapsed ? '新建课程' : null}
        </Button>
      </div>
    </div>
  );

  const rightRailCardClassName =
    'rounded-[20px] border border-slate-200/80 bg-white/[0.92] shadow-[0_14px_34px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-slate-950/[0.88]';
  const rightRailRowClassName =
    'rounded-[14px] border border-slate-200/70 bg-white/65 px-3 py-2 dark:border-white/[0.08] dark:bg-white/5';
  const rightRailSectionTitleClassName =
    'text-[13px] font-semibold leading-5 text-slate-700 dark:text-slate-200';
  const rightRailSectionIconClassName = 'size-3.5 text-slate-400 dark:text-slate-500';
  const rightRailIconButtonClassName =
    'grid size-8 shrink-0 place-items-center rounded-full bg-white/75 text-slate-500 shadow-sm ring-1 ring-slate-200/80 transition hover:bg-white hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-100 dark:bg-white/5 dark:text-slate-400 dark:ring-white/10 dark:hover:bg-white/10 dark:hover:text-slate-100 dark:focus-visible:ring-sky-300/20';

  const learningCalendarPanel = (
    <button
      type="button"
      className={cn(
        rightRailCardClassName,
        'w-full cursor-pointer p-3 text-left transition hover:border-border hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      )}
      onClick={() => setCalendarDialogOpen(true)}
      aria-label="打开大日历"
      title="打开大日历"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 text-muted-foreground" strokeWidth={1.8} />
            <p className="text-sm font-semibold text-foreground">学习日历</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{calendarMonthLabel}</p>
        </div>
        <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
          {snapshot?.dueReviewCount ? `${snapshot.dueReviewCount} 个复习` : '暂无到期'}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center">
        {calendarWeekdays.map((day) => (
          <span key={day} className="text-[10px] font-medium text-muted-foreground">
            {day}
          </span>
        ))}
        {calendarDays.map((day) => (
          <div
            key={day.key}
            className={cn(
              'relative flex aspect-square items-center justify-center rounded-[10px] text-[11px] font-medium transition',
              day.inMonth ? 'text-foreground' : 'text-muted-foreground/35',
              day.isToday ? 'bg-red-500 text-white' : 'bg-muted/45',
              (day.planCount || day.syllabusCount) && !day.isToday ? 'ring-1 ring-border' : null,
            )}
            title={[
              day.planCount ? `${day.planCount} 个学习计划` : '',
              day.syllabusCount ? `${day.syllabusCount} 个 syllabus 事项` : '',
            ]
              .filter(Boolean)
              .join('，')}
          >
            {day.day}
            {day.planCount || day.syllabusCount ? (
              <span className="absolute bottom-1 flex items-center gap-0.5">
                {day.planCount ? (
                  <span
                    className={cn(
                      'size-1 rounded-full',
                      day.isToday ? 'bg-white' : 'bg-emerald-500',
                    )}
                  />
                ) : null}
                {day.syllabusCount ? (
                  <span
                    className={cn('size-1 rounded-full', day.isToday ? 'bg-white' : 'bg-sky-500')}
                  />
                ) : null}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </button>
  );

  const syllabusImportPanel = (
    <section className={cn(rightRailCardClassName, 'mt-3 p-3')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-muted-foreground" strokeWidth={1.8} />
            <p className="text-sm font-semibold text-foreground">
              {syllabusEvents.length ? 'syllabus 日程' : '导入 syllabus'}
            </p>
          </div>
          {syllabusEvents.length ? (
            <p className="mt-1 text-xs text-muted-foreground">{syllabusEvents.length} 个事项</p>
          ) : null}
        </div>
        {syllabusEvents.length ? null : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 shrink-0 rounded-full border-border bg-background px-3 text-xs shadow-sm"
            onClick={() => openSyllabusUploadDialog('merge')}
          >
            上传
          </Button>
        )}
      </div>

      {syllabusImportMessage ? (
        <p className={cn(rightRailRowClassName, 'mt-2 text-xs leading-5 text-muted-foreground')}>
          {syllabusImportMessage}
        </p>
      ) : null}

      {syllabusEvents.length ? (
        <div className={cn(rightRailRowClassName, 'mt-3 space-y-2 text-xs leading-5')}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-foreground">管理 syllabus</span>
          </div>
          <p className="text-muted-foreground">
            {syllabusNeedsReview
              ? `目前只识别到 ${syllabusEventSummary || `${syllabusEvents.length} 个事项`}，建议先补充关键日期，再安排复习。`
              : `已记录 ${syllabusEventSummary}，可以把这些日期作为约束来安排复习和刷题。`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={syllabusNeedsReview ? 'default' : 'outline'}
              className="h-8 rounded-full px-3 text-xs"
              onClick={openSyllabusEditDialog}
            >
              更改
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 rounded-full px-3 text-xs"
              onClick={() => openSyllabusUploadDialog('replace')}
            >
              重新上传
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 rounded-full px-3 text-xs text-muted-foreground hover:text-destructive"
              onClick={clearSyllabusEvents}
            >
              清空
            </Button>
            <Button
              type="button"
              size="sm"
              variant={syllabusNeedsReview ? 'outline' : 'default'}
              className="h-8 rounded-full px-3 text-xs"
              disabled={sending}
              onClick={() => {
                void sendMessage(
                  '我已经导入了 syllabus 日程。请结合这些作业、考试和课程进度，帮我安排接下来两周的学习计划；如果还不清楚我的学习进度，请先让我确认。',
                );
              }}
            >
              安排学习计划
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-3 space-y-1.5">
        {upcomingSyllabusEvents.length ? (
          upcomingSyllabusEvents.map((event) => (
            <div key={event.id} className={cn(rightRailRowClassName, 'text-xs leading-5')}>
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium text-foreground">{event.title}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {event.date.slice(5)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className={cn('size-1.5 rounded-full', syllabusEventTone(event.kind))} />
                <span>{syllabusEventLabel(event.kind)}</span>
                <span className="min-w-0 truncate">· {event.sourceName}</span>
              </div>
            </div>
          ))
        ) : (
          <p className={cn(rightRailRowClassName, 'text-xs leading-5 text-muted-foreground')}>
            导入课程大纲后，我会把作业、考试和每周进度放到日历里。
          </p>
        )}
      </div>
    </section>
  );

  const syllabusImportDialog = (
    <Dialog open={syllabusDialogOpen} onOpenChange={setSyllabusDialogOpen}>
      <DialogContent className="h-[min(760px,86dvh)] w-[calc(100vw-1rem)] max-w-[1180px] overflow-hidden rounded-[28px] border-border/80 bg-background p-0 shadow-2xl sm:h-[min(780px,86dvh)]">
        <div className="flex h-full min-h-0 flex-col">
          <DialogHeader className="shrink-0 border-b border-border px-5 py-4 text-left">
            <DialogTitle className="text-base">添加课程日程</DialogTitle>
            <p className="text-xs leading-5 text-muted-foreground">
              先读取 syllabus，再检查、修改或移除事项；确认后才会写入日历。
            </p>
          </DialogHeader>
          <input
            ref={syllabusInputRef}
            type="file"
            accept=".pdf,.txt,.md,.csv,.json,application/pdf,text/*"
            className="hidden"
            onChange={(event) => {
              void handleSyllabusFile(event.currentTarget.files);
              event.currentTarget.value = '';
            }}
          />

          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[360px_1fr]">
            <aside className="min-h-0 border-b border-border/70 bg-muted/25 p-4 lg:border-b-0 lg:border-r">
              <div className="grid grid-cols-2 rounded-full bg-muted p-1 text-sm font-medium">
                {[
                  { value: 'file' as const, label: '上传文件' },
                  { value: 'plan' as const, label: '描述计划' },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setSyllabusImportMode(item.value)}
                    className={cn(
                      'h-9 rounded-full transition',
                      syllabusImportMode === item.value
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {syllabusImportMessage ? (
                <p
                  className={cn(
                    rightRailRowClassName,
                    'mt-4 text-xs leading-5 text-muted-foreground',
                  )}
                >
                  {syllabusImportMessage}
                </p>
              ) : null}

              {syllabusImportMode === 'file' ? (
                <section className="mt-4 rounded-[18px] border border-border/70 bg-background p-4">
                  <div className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
                    {syllabusImportLoading ? (
                      <Loader2 className="size-5 animate-spin" strokeWidth={1.8} />
                    ) : (
                      <FileText className="size-5" strokeWidth={1.8} />
                    )}
                  </div>
                  <p className="mt-3 text-sm font-semibold text-foreground">
                    {syllabusImportLoading ? '正在读取 syllabus' : '上传 syllabus 文件'}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    PDF 会优先让 AI 直接读取文件内容；识别完成后会先显示预览。
                  </p>
                  <Button
                    type="button"
                    className="mt-4 h-9 rounded-full px-4 text-sm"
                    onClick={() => syllabusInputRef.current?.click()}
                    disabled={syllabusImportLoading}
                  >
                    {syllabusImportLoading ? '读取中...' : '选择文件'}
                  </Button>
                </section>
              ) : (
                <section className="mt-4 rounded-[18px] border border-border/70 bg-background p-4">
                  <div className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
                    <CalendarDays className="size-5" strokeWidth={1.8} />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-foreground">描述你的学习计划</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    没有 syllabus 文件时，可以先描述节奏，我会生成可确认的模拟日程。
                  </p>
                  <Textarea
                    value={syllabusPlanDraft}
                    onChange={(event) => setSyllabusPlanDraft(event.target.value)}
                    placeholder="例如：我想 8 周学完，每周学习 3 次，有一次期中和一次期末。"
                    className="mt-4 min-h-32 resize-none rounded-[16px] border-border bg-muted/30 text-sm shadow-none focus-visible:ring-1"
                  />
                  <Button
                    type="button"
                    className="mt-4 h-9 rounded-full px-4 text-sm"
                    onClick={handleSimulateSyllabus}
                    disabled={!activeCourse}
                  >
                    生成预览
                  </Button>
                </section>
              )}

              <div
                className={cn(
                  rightRailRowClassName,
                  'mt-4 text-xs leading-5 text-muted-foreground',
                )}
              >
                {syllabusCommitMode === 'replace'
                  ? '确认后会替换当前已保存的 syllabus 日程。'
                  : '确认后会和当前已保存的 syllabus 日程合并。'}
              </div>
            </aside>

            <section className="flex min-h-0 flex-col bg-background">
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">确认添加</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {syllabusDraftEvents.length
                      ? `${syllabusDraftEvents.length} 个待确认事项`
                      : '上传或生成后，这里会显示可编辑的日程预览'}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 rounded-full px-3 text-xs"
                  onClick={addSyllabusDraftEvent}
                  disabled={syllabusImportLoading}
                >
                  添加事项
                </Button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                {syllabusImportLoading ? (
                  <div className="grid h-full place-items-center rounded-[22px] border border-dashed border-border bg-muted/20 text-center">
                    <div>
                      <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
                      <p className="mt-3 text-sm font-medium text-foreground">正在读取文件</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        读取完成后会显示可编辑的 syllabus 事项。
                      </p>
                    </div>
                  </div>
                ) : syllabusDraftEvents.length ? (
                  <div className="space-y-3">
                    {syllabusDraftEvents.map((event) => (
                      <div
                        key={event.id}
                        className="rounded-[18px] border border-border/70 bg-background p-3 shadow-sm"
                      >
                        <div className="grid gap-2 lg:grid-cols-[140px_130px_1fr_32px]">
                          <input
                            type="date"
                            value={event.date}
                            onChange={(changeEvent) =>
                              updateSyllabusDraftEvent(event.id, {
                                date: changeEvent.currentTarget.value,
                              })
                            }
                            className="h-9 rounded-full border border-border bg-muted/30 px-3 text-xs text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                          />
                          <select
                            value={event.kind}
                            onChange={(changeEvent) =>
                              updateSyllabusDraftEvent(event.id, {
                                kind: changeEvent.currentTarget.value as SyllabusEventKind,
                              })
                            }
                            className="h-9 rounded-full border border-border bg-muted/30 px-3 text-xs text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                          >
                            <option value="assignment">作业</option>
                            <option value="exam">考试</option>
                            <option value="progress">进度</option>
                            <option value="tutorial">Tutorial</option>
                            <option value="holiday">假期</option>
                            <option value="other">事项</option>
                          </select>
                          <input
                            value={event.title}
                            onChange={(changeEvent) =>
                              updateSyllabusDraftEvent(event.id, {
                                title: changeEvent.currentTarget.value,
                              })
                            }
                            placeholder="事项标题"
                            className="h-9 min-w-0 rounded-full border border-border bg-muted/30 px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-9 rounded-full text-muted-foreground hover:text-destructive"
                            onClick={() => removeSyllabusDraftEvent(event.id)}
                            aria-label="移除事项"
                            title="移除事项"
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                          {event.week ? (
                            <span className="rounded-full bg-muted px-2 py-0.5">{event.week}</span>
                          ) : null}
                          {event.sourceColumn ? (
                            <span className="rounded-full bg-muted px-2 py-0.5">
                              {event.sourceColumn}
                            </span>
                          ) : null}
                          {event.confidence != null ? (
                            <span className="rounded-full bg-muted px-2 py-0.5">
                              置信度 {Math.round(event.confidence * 100)}%
                            </span>
                          ) : null}
                          {event.rawText ? (
                            <span className="min-w-0 truncate rounded-full bg-muted px-2 py-0.5">
                              {event.rawText}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid h-full place-items-center rounded-[22px] border border-dashed border-border bg-muted/20 text-center">
                    <div>
                      <UploadCloud className="mx-auto size-7 text-muted-foreground" />
                      <p className="mt-3 text-sm font-medium text-foreground">还没有待确认的事项</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        选择 syllabus 文件，或描述学习计划生成预览。
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/70 px-5 py-4">
                <p className="min-w-0 text-xs text-muted-foreground">
                  {validSyllabusDraftEvents.length
                    ? `${validSyllabusDraftEvents.length} 个有效事项会被写入日历`
                    : '确认前请至少保留一个有效事项'}
                </p>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 rounded-full px-4 text-sm"
                    onClick={() => setSyllabusDialogOpen(false)}
                  >
                    取消
                  </Button>
                  <Button
                    type="button"
                    className="h-9 rounded-full px-4 text-sm"
                    onClick={confirmSyllabusDraftEvents}
                    disabled={syllabusImportLoading || !validSyllabusDraftEvents.length}
                  >
                    {syllabusCommitMode === 'replace' ? '确认保存' : '确认添加'}
                  </Button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  const courseFilesDialog = (
    <Dialog open={courseFilesDialogOpen} onOpenChange={setCourseFilesDialogOpen}>
      <DialogContent className="max-h-[min(760px,86dvh)] w-[calc(100vw-1rem)] max-w-3xl overflow-y-auto rounded-[28px] border-border/80 bg-background p-0 shadow-2xl">
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <DialogTitle className="text-base">上传文件</DialogTitle>
          <p className="text-xs leading-5 text-muted-foreground">管理这门课里你上传过的文件。</p>
        </DialogHeader>
        <div className="p-4 sm:p-5">
          <CourseMaterialsPanel courseId={activeCourse.id} className="shadow-none" />
        </div>
      </DialogContent>
    </Dialog>
  );

  const sourceUploadStatusDialog = (
    <Dialog open={sourceUploadPanelOpen} onOpenChange={setSourceUploadDialogOpen}>
      <DialogContent className="max-h-[min(720px,86dvh)] w-[calc(100vw-1rem)] max-w-2xl overflow-hidden rounded-[28px] border-border/80 bg-background p-0 shadow-2xl">
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <DialogTitle className="text-base">课程资料入库</DialogTitle>
          <p className="text-xs leading-5 text-muted-foreground">
            关闭这个窗口不会中断入库；完成后，伴学角色会提示，上传按钮也会显示角标。
          </p>
        </DialogHeader>
        <div className="flex max-h-[calc(min(720px,86dvh)-82px)] flex-col overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/70 px-5 py-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {sourceUploading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  入库中，可以先关闭窗口
                </>
              ) : sourceUploadItems.length ? (
                <>
                  <CheckCircle2 className="size-3.5 text-emerald-600" />
                  最近入库状态已更新
                </>
              ) : (
                <>
                  <UploadCloud className="size-3.5" />
                  选择课程资料开始入库
                </>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-full px-3 text-xs"
                onClick={() => {
                  setSourceUploadDialogOpen(false);
                  setCourseFilesDialogOpen(true);
                }}
              >
                查看文件库
              </Button>
              {sourceUploadItems.some((item) => item.status !== 'ingesting') ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-full px-3 text-xs"
                  onClick={() =>
                    setSourceUploadItems((items) =>
                      items.filter((item) => item.status === 'ingesting'),
                    )
                  }
                >
                  清空完成项
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                className="h-8 rounded-full px-3 text-xs"
                disabled={sourceUploading}
                onClick={() => imageInputRef.current?.click()}
              >
                选择文件
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {sourceUploadItems.length ? (
              <ul className="space-y-2.5">
                {sourceUploadItems.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-[18px] border border-border/70 bg-muted/20 p-3"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className={cn(
                          'mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full border',
                          item.status === 'ingesting'
                            ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-300/20 dark:bg-sky-400/10 dark:text-sky-100'
                            : item.status === 'stored'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-300/20 dark:bg-emerald-400/10 dark:text-emerald-100'
                              : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-300/20 dark:bg-rose-400/10 dark:text-rose-100',
                        )}
                      >
                        {item.status === 'ingesting' ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : item.status === 'stored' ? (
                          <CheckCircle2 className="size-4" />
                        ) : (
                          <AlertCircle className="size-4" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <p className="min-w-0 truncate text-sm font-semibold text-foreground">
                            {item.fileName}
                          </p>
                          <span className="shrink-0 rounded-full bg-background px-2 py-0.5 text-[11px] font-medium uppercase text-muted-foreground ring-1 ring-border">
                            {item.sourceKind.replace('_', ' ')}
                          </span>
                          <span
                            className={cn(
                              'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                              item.status === 'ingesting'
                                ? 'bg-sky-100 text-sky-700 dark:bg-sky-400/10 dark:text-sky-100'
                                : item.status === 'stored'
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-100'
                                  : 'bg-rose-100 text-rose-700 dark:bg-rose-400/10 dark:text-rose-100',
                            )}
                          >
                            {sourceUploadStatusLabel(item.status)}
                          </span>
                        </div>
                        {item.summary ? (
                          <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
                            {item.summary}
                          </p>
                        ) : item.error ? (
                          <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-destructive">
                            {item.error}
                          </p>
                        ) : (
                          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                            正在读取、去重并同步到知识图谱、题库、模板库和笔记本。
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="grid min-h-52 place-items-center rounded-[22px] border border-dashed border-border bg-muted/20 text-center">
                <div className="px-6">
                  <UploadCloud className="mx-auto size-8 text-muted-foreground" />
                  <p className="mt-3 text-sm font-medium text-foreground">还没有入库任务</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    支持 PDF、PPTX、Markdown、文本和题库文件。
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  const recentActivityPanel = (
    <section className="min-h-0">
      <div className="flex items-center gap-2 px-1">
        <CalendarDays className={rightRailSectionIconClassName} strokeWidth={1.8} />
        <p className={rightRailSectionTitleClassName}>最近活动</p>
      </div>
      <div className="mt-2 space-y-1.5">
        {statusCalendarActivities.length ? (
          statusCalendarActivities.map((activity) => (
            <div key={activity.id} className={cn(rightRailRowClassName, 'text-[12px] leading-4')}>
              <div className="flex items-start gap-2">
                {activity.source === 'plan' ? (
                  <button
                    type="button"
                    onClick={() => startStatusCalendarActivity(activity)}
                    className="-m-1 min-w-0 flex-1 rounded-[12px] p-1 text-left transition hover:bg-slate-50/80 focus-visible:bg-slate-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-100 dark:hover:bg-white/5 dark:focus-visible:bg-white/5 dark:focus-visible:ring-sky-300/20"
                    aria-label={`${activity.actionLabel ?? '打开'}：${activity.title}`}
                    title={activity.actionLabel ?? '打开'}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={cn('size-1.5 shrink-0 rounded-full', activity.dotClassName)}
                      />
                      <span className="min-w-0 flex-1 truncate font-semibold text-slate-800 dark:text-slate-100">
                        {activity.title}
                      </span>
                      <span className="shrink-0 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        {formatShortCalendarDate(activity.date)}
                      </span>
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-sky-50 text-sky-700 ring-1 ring-sky-100 dark:bg-sky-400/10 dark:text-sky-100 dark:ring-sky-300/15">
                        <Play className="size-3.5" fill="currentColor" strokeWidth={1.8} />
                      </span>
                    </span>
                    <span className="mt-1 block truncate pl-3.5 text-[11px] font-medium leading-4 text-slate-500 dark:text-slate-400">
                      {activity.meta}
                    </span>
                  </button>
                ) : (
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn('size-1.5 shrink-0 rounded-full', activity.dotClassName)}
                      />
                      <span className="min-w-0 flex-1 truncate font-semibold text-slate-800 dark:text-slate-100">
                        {activity.title}
                      </span>
                      <span className="shrink-0 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        {formatShortCalendarDate(activity.date)}
                      </span>
                    </div>
                    <p className="mt-1 truncate pl-3.5 text-[11px] font-medium leading-4 text-slate-500 dark:text-slate-400">
                      {activity.meta}
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeStatusCalendarActivity(activity)}
                  className="grid size-6 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 focus-visible:bg-rose-50 focus-visible:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-100 dark:hover:bg-rose-400/10 dark:hover:text-rose-200 dark:focus-visible:bg-rose-400/10 dark:focus-visible:text-rose-200 dark:focus-visible:ring-rose-300/20"
                  aria-label={`删除日历活动：${activity.title}`}
                  title="删除"
                >
                  <Trash2 className="size-3.5" strokeWidth={1.8} />
                </button>
              </div>
            </div>
          ))
        ) : (
          <p className={cn(rightRailRowClassName, 'text-[12px] leading-4 text-muted-foreground')}>
            暂无日历活动。
          </p>
        )}
      </div>
    </section>
  );

  const largeCalendarDialog = (
    <Dialog open={calendarDialogOpen} onOpenChange={setCalendarDialogOpen}>
      <DialogContent className="h-[min(760px,86dvh)] w-[calc(100vw-1rem)] max-w-[1180px] overflow-hidden rounded-[28px] border-border/80 bg-background p-0 shadow-2xl sm:h-[min(780px,86dvh)]">
        <DialogHeader className="sr-only">
          <DialogTitle>学习日历</DialogTitle>
        </DialogHeader>

        <div className="flex h-full min-h-0 bg-background">
          <aside className="hidden w-[230px] shrink-0 border-r border-border/70 bg-muted/30 px-4 py-5 lg:flex lg:flex-col">
            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold text-muted-foreground">学习日历</p>
                <div className="mt-3 space-y-2.5 text-sm">
                  {[
                    {
                      label: '复习计划',
                      count: recentPlans.length,
                      dotClassName: 'bg-emerald-500',
                    },
                    {
                      label: '作业',
                      count: syllabusEvents.filter((event) => event.kind === 'assignment').length,
                      dotClassName: 'bg-sky-500',
                    },
                    {
                      label: '考试',
                      count: syllabusEvents.filter((event) => event.kind === 'exam').length,
                      dotClassName: 'bg-rose-500',
                    },
                    {
                      label: '周进度',
                      count: syllabusEvents.filter((event) => event.kind === 'progress').length,
                      dotClassName: 'bg-amber-500',
                    },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn(
                            'grid size-4 shrink-0 place-items-center rounded-[5px]',
                            item.dotClassName,
                          )}
                        >
                          <span className="size-1.5 rounded-full bg-white" />
                        </span>
                        <span className="min-w-0 truncate font-medium text-foreground">
                          {item.label}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-4 px-5 pb-4 pt-5 sm:px-6">
              <h2 className="truncate text-3xl font-semibold tracking-normal text-foreground sm:text-4xl">
                {calendarMonthLabel}
              </h2>
              <div className="flex shrink-0 items-center gap-3 pr-8">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={showCurrentCalendarMonth}
                    className="rounded-full bg-muted px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    今天
                  </button>
                  <button
                    type="button"
                    onClick={showPreviousCalendarMonth}
                    className="grid size-9 place-items-center rounded-full bg-muted text-muted-foreground transition hover:bg-muted/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    aria-label="上一个月"
                    title="上一个月"
                  >
                    <ChevronLeft className="size-4" strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={showNextCalendarMonth}
                    className="grid size-9 place-items-center rounded-full bg-muted text-muted-foreground transition hover:bg-muted/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    aria-label="下一个月"
                    title="下一个月"
                  >
                    <ChevronRight className="size-4" strokeWidth={2} />
                  </button>
                </div>
              </div>
            </div>

            <div className="grid shrink-0 grid-cols-7 border-y border-border/80 text-right">
              {calendarWeekdays.map((day) => (
                <div
                  key={day}
                  className="border-r border-border/70 px-3 py-2 text-sm font-semibold text-muted-foreground last:border-r-0"
                >
                  周{day}
                </div>
              ))}
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 overflow-hidden">
              {calendarDays.map((day) => {
                const dayPlans = plansByCalendarDay.get(day.key) || [];
                const dayEvents = syllabusEventsByCalendarDay.get(day.key) || [];
                const items = [
                  ...dayPlans.map((plan) => ({
                    id: `plan-${plan.id}`,
                    title: plan.title,
                    meta: plan.mode === 'quiz' ? '小测' : '刷题',
                    dotClassName: 'bg-emerald-500',
                    pillClassName:
                      'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-100',
                  })),
                  ...dayEvents.map((event) => ({
                    id: `syllabus-${event.id}`,
                    title: event.title,
                    meta: syllabusEventLabel(event.kind),
                    dotClassName: syllabusEventTone(event.kind),
                    pillClassName: syllabusEventPillTone(event.kind),
                  })),
                ];
                const visibleItems = items.slice(0, 3);
                const hiddenItemCount = items.length - visibleItems.length;

                return (
                  <div
                    key={day.key}
                    className={cn(
                      'min-h-0 border-b border-r border-border/70 px-2 py-2 last:border-r-0',
                      !day.inMonth ? 'bg-muted/20' : 'bg-background',
                    )}
                  >
                    <div className="flex justify-end">
                      <span
                        className={cn(
                          'grid size-7 place-items-center rounded-full text-lg font-semibold leading-none',
                          day.inMonth ? 'text-foreground' : 'text-muted-foreground/35',
                          day.isToday ? 'bg-red-500 text-white' : null,
                        )}
                      >
                        {day.day}
                      </span>
                    </div>

                    <div className="mt-2 space-y-1 overflow-hidden">
                      {visibleItems.map((item) => (
                        <div
                          key={item.id}
                          className={cn(
                            'flex h-5 min-w-0 items-center gap-1.5 rounded-full px-2 text-[11px] font-semibold leading-none',
                            item.pillClassName,
                          )}
                        >
                          <span
                            className={cn('size-1.5 shrink-0 rounded-full', item.dotClassName)}
                          />
                          <span className="min-w-0 truncate">{item.title}</span>
                        </div>
                      ))}
                      {hiddenItemCount > 0 ? (
                        <p className="truncate px-2 text-[10px] font-medium text-muted-foreground">
                          还有 {hiddenItemCount} 项
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  const sessionsPanel = (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col bg-slate-50/80 transition-[padding] duration-300 dark:bg-slate-950/40',
        rightRailCollapsed ? 'items-center px-1 py-3' : 'px-4 py-5',
      )}
    >
      {rightRailCollapsed ? (
        <>
          <button
            type="button"
            onClick={() => persistRightRailCollapsed(false)}
            className="mb-3 flex size-9 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm ring-1 ring-border/70 transition hover:text-foreground"
            aria-label="展开右侧栏"
            title="展开右侧栏"
          >
            <ChevronLeft className="size-4" strokeWidth={1.75} />
          </button>
          <nav className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto">
            {[
              {
                value: 'sessions' as const,
                label: '会话',
                Icon: MessageSquarePlus,
                action: () => {
                  setRightRailView('sessions');
                  persistRightRailCollapsed(false);
                },
              },
              {
                value: 'calendar' as const,
                label: '日历',
                Icon: CalendarDays,
                action: () => {
                  setRightRailView('calendar');
                  persistRightRailCollapsed(false);
                },
              },
              {
                value: 'learning' as const,
                label: '状态',
                Icon: BookOpenCheck,
                action: () => {
                  setRightRailView('learning');
                  persistRightRailCollapsed(false);
                },
              },
            ].map(({ value, label, Icon, action }) => (
              <button
                key={label}
                type="button"
                onClick={action}
                className={cn(
                  'flex size-10 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm ring-1 ring-border/70 transition hover:text-foreground',
                  rightRailView === value ? 'text-foreground ring-border' : null,
                )}
                aria-label={label}
                title={label}
              >
                <Icon className="size-[18px]" strokeWidth={1.75} />
              </button>
            ))}
          </nav>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div className="grid min-h-9 min-w-0 flex-1 grid-cols-3 rounded-[18px] bg-slate-100/80 p-1 shadow-inner dark:bg-white/5">
              {[
                { value: 'sessions' as const, label: '会话' },
                { value: 'calendar' as const, label: '日历' },
                { value: 'learning' as const, label: '状态' },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setRightRailView(item.value)}
                  className={cn(
                    'h-7 rounded-[13px] px-1 text-xs font-medium transition-all',
                    rightRailView === item.value
                      ? 'bg-white text-slate-950 shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-950 dark:text-slate-50 dark:ring-white/10'
                      : 'text-slate-500 hover:text-slate-950 dark:hover:text-slate-100',
                  )}
                  aria-pressed={rightRailView === item.value}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => persistRightRailCollapsed(true)}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm ring-1 ring-border/70 transition hover:text-foreground"
              aria-label="收起右侧栏"
              title="收起右侧栏"
            >
              <ChevronRight className="size-4" strokeWidth={1.75} />
            </button>
          </div>

          {rightRailView === 'sessions' ? (
            <div className="mt-4 flex min-h-0 flex-1 flex-col">
              <div className="flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2">
                  <MessageSquarePlus className={rightRailSectionIconClassName} strokeWidth={1.8} />
                  <p className={rightRailSectionTitleClassName}>会话</p>
                </div>
                <button
                  type="button"
                  onClick={createNewLearnSession}
                  className={rightRailIconButtonClassName}
                  aria-label="添加新会话"
                  title="添加新会话"
                >
                  <MessageSquarePlus className="size-3.5" strokeWidth={1.8} />
                </button>
              </div>
              <nav className="mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pb-6">
                {learnSessions.map((session) => {
                  const active = session.id === activeSessionId;
                  return (
                    <Link
                      key={session.id}
                      href={learnSessionHref(session.id)}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group flex min-h-10 min-w-0 items-center justify-between gap-2 rounded-[14px] border px-3 py-2 text-[12px] font-semibold leading-4 tracking-normal text-slate-700 transition hover:border-slate-200 hover:bg-white/80 dark:text-slate-100 dark:hover:bg-white/5',
                        active
                          ? 'border-slate-200/80 bg-white/75 shadow-sm dark:border-white/10 dark:bg-white/5'
                          : 'border-transparent bg-transparent',
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{session.title}</span>
                      <span
                        className={cn(
                          'shrink-0 items-center gap-2 text-slate-400 dark:text-slate-500',
                          active ? 'flex' : 'hidden group-hover:flex',
                        )}
                      >
                        <Pin className="size-3.5 rotate-45" strokeWidth={1.8} />
                        <MoreHorizontal className="size-3.5" strokeWidth={1.8} />
                      </span>
                    </Link>
                  );
                })}
              </nav>
              <div className="my-3 h-px shrink-0 bg-slate-200/80 dark:bg-white/10" />
              <div className="max-h-[45%] min-h-[180px] shrink-0 overflow-y-auto pb-6">
                {recentActivityPanel}
              </div>
            </div>
          ) : null}

          {rightRailView === 'calendar' ? (
            <div className="mt-4 min-h-0 flex-1 overflow-y-auto pb-6">
              {learningCalendarPanel}
              {syllabusImportPanel}
            </div>
          ) : null}

          {rightRailView === 'learning' ? (
            <div className="mt-4 min-h-0 flex-1 overflow-y-auto pb-6">
              <section className={cn(rightRailCardClassName, 'p-3')}>
                <div className="flex items-center gap-2">
                  <BookOpenCheck className="size-4 text-muted-foreground" strokeWidth={1.8} />
                  <p className="text-sm font-semibold text-foreground">学习进度</p>
                </div>
                <div className="mt-3 text-xs">
                  <div
                    className={cn(rightRailRowClassName, 'flex items-center justify-between gap-2')}
                  >
                    <span className="text-muted-foreground">当前进度</span>
                    <span className="font-medium text-foreground">
                      {snapshot?.progressLabel || '未确认'}
                    </span>
                  </div>
                </div>
              </section>

              <section className={cn(rightRailCardClassName, 'mt-3 p-3')}>
                <div className="flex items-center gap-2">
                  <Target className="size-4 text-muted-foreground" strokeWidth={1.8} />
                  <p className="text-sm font-semibold text-foreground">学习建议</p>
                </div>
                <div className="mt-3 space-y-1.5">
                  {learningSuggestionItems.map((item, index) => (
                    <div
                      key={`${index}-${item}`}
                      className={cn(rightRailRowClassName, 'flex gap-2 text-xs leading-5')}
                    >
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-background text-[10px] font-semibold text-muted-foreground">
                        {index + 1}
                      </span>
                      <span className="min-w-0 text-foreground">{item}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          ) : null}
        </>
      )}
    </div>
  );

  return (
    <>
      <div
        className={cn(
          'grid h-full min-h-0 overflow-hidden bg-slate-50 text-foreground transition-[grid-template-columns] duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] dark:bg-slate-950',
          !leftRailCollapsed && !rightRailCollapsed && 'lg:grid-cols-[280px_minmax(0,1fr)_320px]',
          leftRailCollapsed && !rightRailCollapsed && 'lg:grid-cols-[78px_minmax(0,1fr)_320px]',
          !leftRailCollapsed && rightRailCollapsed && 'lg:grid-cols-[280px_minmax(0,1fr)_88px]',
          leftRailCollapsed && rightRailCollapsed && 'lg:grid-cols-[78px_minmax(0,1fr)_88px]',
        )}
      >
        <aside className="hidden min-h-0 flex-col overflow-hidden border-r border-slate-200/80 bg-slate-50/75 lg:flex dark:border-white/10 dark:bg-slate-950/40">
          {courseSidebar}
        </aside>

        <main className="flex min-h-[70dvh] flex-col overflow-hidden bg-white lg:min-h-0 dark:bg-slate-950">
          <header className="shrink-0 border-b border-slate-200/80 bg-white/95 px-5 py-3 dark:border-white/10 dark:bg-slate-950/95">
            <div className="mx-auto flex w-full max-w-4xl flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex w-full min-w-0 items-center gap-2.5 sm:w-auto">
                <CourseAvatar course={activeCourse} className="size-8 rounded-[10px]" />
                <div className="min-w-0">
                  <h1 className="line-clamp-2 text-sm font-semibold leading-4 text-slate-950 dark:text-slate-50">
                    {activeCourse.name}
                  </h1>
                  <p className="truncate text-[11px] font-medium leading-4 text-slate-400">
                    {activeCourse.courseCode || '当前课程上下文'}
                  </p>
                </div>
              </div>
              <div className="flex max-w-full shrink-0 items-center gap-1.5 overflow-x-auto pb-0.5 sm:overflow-visible sm:pb-0">
                {assetLoadState === 'loading' ? (
                  <span
                    className={cn(
                      'inline-flex h-8 items-center rounded-[10px] px-3 text-xs font-semibold shadow-sm',
                      statusTone(null),
                    )}
                  >
                    课程状态同步中
                  </span>
                ) : missingLearningSetup ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        onClick={() => {
                          setRightRailCollapsed(false);
                          setRightRailView('calendar');
                        }}
                        className="size-8 rounded-[10px] border-amber-200 bg-amber-50 text-amber-700 shadow-sm hover:bg-amber-100 hover:text-amber-800 dark:border-amber-300/25 dark:bg-amber-400/12 dark:text-amber-200 dark:hover:bg-amber-400/18"
                        aria-label="缺少 syllabus 和学习状态"
                      >
                        <AlertTriangle className="size-4" strokeWidth={2.1} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="end" className="max-w-[280px] leading-5">
                      还没有导入 syllabus，也没有更新学习进度。请到右侧边栏的「日历」导入
                      syllabus，并到「状态」更新学习状态，来获得最佳体验。
                    </TooltipContent>
                  </Tooltip>
                ) : !snapshot?.progressKnown ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => addProgressRequestMessage({ snapshot })}
                    className="h-8 rounded-[10px] border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-700 shadow-sm hover:bg-sky-100"
                  >
                    更新学习进度
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={openSourceUploadPanel}
                  className="relative h-8 gap-1.5 rounded-[10px] border-slate-200 bg-white px-3 text-xs font-semibold shadow-sm dark:border-white/10 dark:bg-white/5"
                >
                  <UploadCloud className="size-3.5" />
                  上传文件
                  {completedSourceUploadBadgeCount > 0 ? (
                    <span className="absolute -right-1.5 -top-1.5 grid min-w-4 place-items-center rounded-full border border-white bg-emerald-500 px-1 text-[10px] font-bold leading-4 text-white shadow-sm dark:border-slate-950">
                      {completedSourceUploadBadgeCount > 9 ? '9+' : completedSourceUploadBadgeCount}
                    </span>
                  ) : null}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    router.push(`/course/${encodeURIComponent(activeCourse.id)}/resources`)
                  }
                  className="h-8 gap-1.5 rounded-[10px] border-slate-200 bg-white px-3 text-xs font-semibold shadow-sm dark:border-white/10 dark:bg-white/5"
                >
                  <LibraryBig className="size-3.5" />
                  资料库
                </Button>
              </div>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto bg-white px-5 py-5 dark:bg-slate-950">
            <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-4">
              {messages.length === 0 && !sending ? (
                <div className="flex min-h-[260px] flex-1 items-center justify-center">
                  <div className="flex max-w-2xl flex-col items-center gap-4 px-3 text-center">
                    <div className="relative">
                      <CourseAvatar course={activeCourse} className="size-14 rounded-[18px]" />
                      <span
                        className={cn(
                          'absolute -right-1 -top-1 size-3 rounded-full border-2 border-white shadow-sm dark:border-slate-950',
                          missingLearningSetup ? 'bg-amber-400' : 'bg-emerald-400',
                        )}
                        aria-hidden="true"
                      />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                        {activeCourse.courseCode || 'Learning'}
                      </p>
                      <p className="mt-1 text-lg font-semibold tracking-normal text-slate-950 dark:text-slate-50">
                        今天想从哪里开始？
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                        {missingLearningSetup
                          ? '补齐 syllabus 和学习进度后，今天的安排会更准。'
                          : snapshot?.progressKnown && snapshot.progressLabel
                            ? `当前进度：${snapshot.progressLabel}`
                            : `围绕 ${activeCourse.courseCode || activeCourse.name} 继续推进。`}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2" aria-label="快捷入口">
                      {quickPrompts.map((prompt) => (
                        <Button
                          key={prompt}
                          variant="outline"
                          size="sm"
                          onClick={() => void sendMessage(prompt)}
                          className="h-8 rounded-full border-slate-200 bg-white px-3 text-xs shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-white/5"
                        >
                          {prompt}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
              {messages.map((message) => (
                <ContextMenu key={message.id}>
                  <ContextMenuTrigger asChild>
                    <div
                      className={cn(
                        message.role === 'user'
                          ? 'ml-auto max-w-[min(78%,680px)] rounded-[24px] bg-slate-950 px-4 py-2.5 text-sm leading-6 text-white shadow-[0_12px_28px_rgba(15,23,42,0.18)] dark:bg-white dark:text-black'
                          : 'mr-auto w-full max-w-4xl py-2',
                      )}
                    >
                      {message.role === 'user' ? (
                        <>
                          {message.attachments?.length ? (
                            <div className="mb-2 grid max-w-full grid-cols-2 gap-2">
                              {message.attachments.map((attachment) => (
                                <img
                                  key={attachment.id}
                                  src={attachment.objectUrl}
                                  alt={attachment.name}
                                  className="max-h-40 w-full rounded-lg border border-white/15 object-cover"
                                />
                              ))}
                            </div>
                          ) : null}
                          <p className="select-text whitespace-pre-wrap">{message.text}</p>
                        </>
                      ) : (
                        <div className="select-text">
                          {message.text ? (
                            <MessageResponse className={courseMarkdownClassName}>
                              {normalizeAssistantMarkdown(message.text)}
                            </MessageResponse>
                          ) : null}
                          {message.plan ? (
                            <PlanActionCard
                              plan={message.plan}
                              onStart={startPlan}
                              onRegenerate={regeneratePlan}
                              onEasier={easierPlan}
                            />
                          ) : null}
                          {message.progressProposal ? (
                            <ProgressConfirmationCard
                              proposal={message.progressProposal}
                              notebooks={notebooks}
                              onSelectionChange={(selection) =>
                                updateMessageProgressProposal(message.id, selection)
                              }
                              onConfirm={() =>
                                confirmMessageProgressProposal(
                                  message.id,
                                  message.progressProposal?.selection || '',
                                )
                              }
                              onDismiss={() => dismissMessageProgressProposal(message.id)}
                            />
                          ) : null}
                        </div>
                      )}
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-40">
                    <ContextMenuItem onSelect={() => void copyLearnMessage(message)}>
                      <Copy className="size-4" />
                      复制消息
                    </ContextMenuItem>
                    <ContextMenuItem
                      variant="destructive"
                      onSelect={() => deleteLearnMessage(message.id)}
                    >
                      <Trash2 className="size-4" />
                      删除消息
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))}
              {sending ? (
                <div className="mr-auto flex items-center gap-2 rounded-full bg-slate-50 px-3 py-2 text-sm text-slate-500 ring-1 ring-slate-200 dark:bg-white/5 dark:ring-white/10">
                  <Loader2 className="size-4 animate-spin" />
                  课程正在整理回答…
                </div>
              ) : null}
              {sourceUploading ? (
                <div className="mr-auto flex items-center gap-2 rounded-full bg-sky-50 px-3 py-2 text-sm text-sky-700 ring-1 ring-sky-100 dark:bg-sky-400/10 dark:text-sky-100 dark:ring-sky-300/15">
                  <Loader2 className="size-4 animate-spin" />
                  正在摄取课程资料…
                </div>
              ) : null}
            </div>
          </div>

          <footer className="shrink-0 border-t border-transparent bg-transparent px-5 py-3">
            <div className="mx-auto max-w-4xl">
              <div className="rounded-[22px] border border-slate-200/70 bg-transparent px-2.5 py-2 shadow-none dark:border-white/10">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*,.pdf,.pptx,.txt,.md,.markdown,.csv,.json,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/*"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    void handleLearnUploadFiles(event.currentTarget.files);
                    event.currentTarget.value = '';
                  }}
                />
                {attachments.length > 0 ? (
                  <div className="mb-2 grid grid-cols-2 gap-2 px-1 pb-2 sm:grid-cols-4">
                    {attachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="group relative overflow-hidden rounded-[14px] border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5"
                      >
                        <img
                          src={attachment.objectUrl}
                          alt={attachment.name}
                          className="h-20 w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeAttachment(attachment.id)}
                          className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/65 text-white opacity-90 transition hover:bg-black"
                          title="移除图片"
                          aria-label={`移除图片 ${attachment.name}`}
                        >
                          <X className="size-3.5" />
                        </button>
                        <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-[11px] text-white">
                          <p className="truncate">{attachment.name}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="flex min-h-10 items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={handleUploadButtonClick}
                    disabled={sending && !sourceUploading && sourceUploadItems.length === 0}
                    title={
                      sourceUploadItems.length > 0 || completedSourceUploadBadgeCount > 0
                        ? '查看课程资料入库状态'
                        : '上传图片或课程资料'
                    }
                    aria-label={
                      sourceUploadItems.length > 0 || completedSourceUploadBadgeCount > 0
                        ? '查看课程资料入库状态'
                        : '上传图片或课程资料'
                    }
                    className="relative size-9 shrink-0 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/10 dark:hover:text-white"
                  >
                    {sourceUploading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    {completedSourceUploadBadgeCount > 0 ? (
                      <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full border border-white bg-emerald-500 px-1 text-[10px] font-bold leading-4 text-white shadow-sm dark:border-slate-950">
                        {completedSourceUploadBadgeCount > 9
                          ? '9+'
                          : completedSourceUploadBadgeCount}
                      </span>
                    ) : null}
                  </Button>
                  <Textarea
                    ref={draftTextareaRef}
                    rows={1}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={`问 ${activeCourse.courseCode || activeCourse.name} 一个问题`}
                    className="max-h-32 min-h-9 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-0 py-1.5 text-sm leading-6 shadow-none [field-sizing:fixed] focus-visible:ring-0"
                  />
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Select value={selectedModelValue} onValueChange={handleModelChange}>
                      <SelectTrigger
                        size="sm"
                        className="h-8 w-10 rounded-full border-slate-200 bg-transparent px-0 text-[11px] shadow-none sm:w-[148px] sm:px-2 dark:border-white/10"
                        aria-label="选择聊天模型"
                      >
                        <Cpu className="size-3.5 text-muted-foreground" />
                        <span className="hidden min-w-0 truncate sm:block">
                          {selectedModel.providerName} · {selectedModel.modelName}
                        </span>
                      </SelectTrigger>
                      <SelectContent align="end" className="max-h-72 w-[300px]">
                        <SelectGroup>
                          {visibleModelOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.providerName} · {option.modelName}
                              {option.vision === false ? ' · 无视觉' : ''}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="icon"
                      onClick={() => void sendMessage()}
                      disabled={
                        (!draft.trim() && attachments.length === 0) ||
                        sending ||
                        sourceUploading ||
                        (attachments.length > 0 && selectedKnownNoVision)
                      }
                      className="size-9 rounded-full bg-slate-950 text-white shadow-[0_10px_22px_rgba(15,23,42,0.18)] hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 dark:disabled:bg-white/10 dark:disabled:text-white/35"
                      aria-label="发送"
                      title="发送"
                    >
                      {sending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <SendHorizontal className="size-4" />
                      )}
                    </Button>
                  </div>
                </div>
                {attachments.length > 0 && selectedKnownNoVision ? (
                  <p className="mt-2 px-1 text-xs text-destructive">当前模型不支持图片</p>
                ) : null}
              </div>
              {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
            </div>
          </footer>
        </main>

        <aside className="hidden min-h-0 flex-col overflow-hidden border-l border-border/70 bg-background lg:flex">
          {sessionsPanel}
        </aside>
      </div>
      {syllabusImportDialog}
      {sourceUploadStatusDialog}
      {courseFilesDialog}
      {largeCalendarDialog}
    </>
  );
}
