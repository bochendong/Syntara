'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  Brain,
  BookOpenCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Copy,
  Cpu,
  FileText,
  LibraryBig,
  Loader2,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  Play,
  Plus,
  SendHorizontal,
  ShoppingBag,
  Target,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import type { UIMessage } from 'ai';
import { MessageResponse } from '@/components/ai-elements/message';
import { CreateCourseDialog } from '@/components/courses/create-course-dialog';
import { CourseMaterialsPanel } from '@/components/courses/course-materials-panel';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  addMemoryActivity,
  dismissMemoryActivity,
  isActiveMemoryActivityStatus,
  updateMemoryActivity,
  useMemoryActivityStore,
  type MemoryActivityRecord,
} from '@/lib/store/memory-activity';
import { useTaskHistoryStore, type TaskHistoryRecord } from '@/lib/store/task-history';
import {
  askCourseOrchestrator,
  type CourseChatImageAttachment,
} from '@/lib/chat/ask-course-orchestrator';
import {
  answererHandoffFromLearnTurn,
  planningDecisionFromLearnTurn,
  type LearnTurnClientResponse,
} from '@/features/learn-core/client-adapters';
import {
  createLearnActionExecutionResult,
  filterLearningActionsForQuestion,
  latestLearningActionsForTurn,
  learnActionRequiresConfirmation,
  learnActionToClientAction,
  neutralizeUnconfirmedMemoryWriteClaim,
} from '@/features/learn-core/client-actions';
import {
  createCalendarAddActionFromArtifacts,
  latestLearnArtifactsForTurn,
  matchingCalendarAddActionForArtifact,
  visibleLearningActionsForArtifacts,
} from '@/features/learn-core/client-artifacts';
import {
  createLearnProgressRequest,
  type LearnPendingCourseAction as PendingCourseAction,
  type LearnProgressProposal as ProgressProposal,
} from '@/features/learn-core/client-progress';
import type { LearnTurnMessage } from '@/features/learn-core/domain/types';
import {
  buildCourseReplyProgress,
  dispatchCourseReplyProgress,
} from '@/lib/chat/course-reply-progress';
import type {
  ChatMessageMetadata,
  CourseChatContext,
  LearnActivityPlanTask,
  LearnAnswerEvidenceSource,
  LearnArtifact,
  LearnCalendarDraftItem,
  LearningAction,
} from '@/lib/types/chat';
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
  type LearnerWeakPoint,
  type LearnerCourseSnapshot,
  type LearnerCourseState,
  type LearnerProgressCheckpointKind,
  type PracticePlan,
  type PracticePlanMode,
} from '@/lib/learning/course-learner-state';
import type { ProviderId } from '@/lib/ai/providers';
import { resolveCourseAvatarDisplayUrl } from '@/lib/constants/course-avatars';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/notifications/client-toast';
import type { CourseRecord } from '@/lib/utils/database';
import { backendJson } from '@/lib/utils/backend-api';
import { deleteCourseAndNotebooks, listCourses, updateCourse } from '@/lib/utils/course-storage';
import { getCoursePublishBlockReason } from '@/lib/utils/course-publish';
import {
  listCourseProblemSummaries,
  type CourseProblemClientSummary,
} from '@/lib/utils/notebook-problem-api';
import {
  deleteCourseSourceUpload,
  listCourseSourceUploads,
  type CourseSourceUploadRecord,
} from '@/lib/utils/course-source-upload-api';
import {
  listNotebookStudyMemoryCounts,
  listStudyMemoryRecords,
} from '@/lib/utils/study-memory-api';
import {
  listRemotePracticePlans,
  loadRemoteLearnerCourseState,
  saveRemoteLearnerCourseState,
  saveRemotePracticePlan,
} from '@/lib/utils/learner-course-api';
import {
  deleteRemoteLearnConversation,
  listRemoteLearnSessions,
  loadRemoteLearnConversation,
  syncRemoteLearnConversation,
  type RemoteLearnChatSession,
  type RemoteLearnMessage,
  type RemoteLearnMessagePayload,
} from '@/lib/utils/learn-conversation-api';
import {
  writeMemoryWithActivity,
  type MemoryWriteCandidate,
  type MemoryWriteContentType,
} from '@/lib/utils/memory-write-api';
import { listStagesByCourse, type StageListItem } from '@/lib/utils/stage-storage';

type LearnMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: number;
  attachments?: LearnImageAttachment[];
  plan?: PracticePlan;
  progressProposal?: ProgressProposal;
  pendingAction?: PendingCourseAction;
  lecturePrompt?: MiniLecturePrompt;
  lectureDeck?: MiniLectureDeck;
  learningActions?: LearningAction[];
  artifacts?: LearnArtifact[];
  publicTrace?: LearnPublicTraceStep[];
  transient?: boolean;
};

type LearnPublicTraceStep = {
  id: string;
  title: string;
  detail: string;
  status: 'done' | 'waiting' | 'blocked';
  evidence?: string[];
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

type CourseSourceUploadKind = 'pdf' | 'markdown' | 'plain_text' | 'pptx' | 'problem_bank' | 'other';

type CourseSourceIngestResponse = {
  ingest: {
    source: {
      title: string;
      kind: CourseSourceUploadKind;
      hash: string;
      rawFileHash: string | null;
      openaiFileId: string | null;
      parser: string;
      textChars: number;
      processedChars: number;
      truncated: boolean;
      courseCode: string | null;
    };
    classification: {
      documentType: string;
      allQuestionUpload: boolean;
      topic: string;
      problemSignalCount: number;
      templateSignalCount: number;
      confidence: number;
      reasons: string[];
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
      publicPlatformMemoryCount?: number;
      publicCourseMemoryCount?: number;
      publicNotebookMemoryCount: number;
      privateMemoryCount: number;
      skippedPublicNotebookMemory: boolean;
      layers?: Array<{
        layer: string;
        status: 'written' | 'skipped' | 'available';
        summary: string;
      }>;
    };
    notebook: {
      id: string;
      name: string;
      created: boolean;
      sectionId: string | null;
      sectionTitle: string | null;
      sections?: Array<{ id: string; title: string; summary: string | null }>;
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

type SourceLibraryTile = {
  id: string;
  tileKind: 'source' | 'notebook' | 'transient';
  title: string;
  subtitle: string;
  dateLabel: string;
  coverImagePath: string | null;
  placeholderLabel: string;
  typeLabel: string;
  updatedAt: number;
  isProblemBank: boolean;
  status: LearnSourceUploadStatus | null;
  error: string | null;
  sourceHash: string | null;
  textNotebookIds: string[];
  textSectionIds: string[];
  textBlocks: Array<{
    id: string;
    title: string;
    markdown: string;
  }>;
};

function sourceLibraryCoverTone(seed: string) {
  const tones = [
    {
      shell:
        'bg-[radial-gradient(circle_at_78%_12%,rgba(125,211,252,0.72),transparent_34%),radial-gradient(circle_at_16%_76%,rgba(167,139,250,0.42),transparent_32%),linear-gradient(150deg,#f8fbff,#dff4ff_48%,#b9e3f8)] text-slate-800',
      accent: 'bg-sky-500',
      soft: 'bg-white/42',
    },
    {
      shell:
        'bg-[radial-gradient(circle_at_22%_18%,rgba(252,165,165,0.62),transparent_32%),radial-gradient(circle_at_80%_72%,rgba(134,239,172,0.48),transparent_34%),linear-gradient(150deg,#fffaf4,#fde7da_45%,#c6f6d5)] text-slate-800',
      accent: 'bg-emerald-500',
      soft: 'bg-white/46',
    },
    {
      shell:
        'bg-[radial-gradient(circle_at_82%_18%,rgba(253,224,71,0.62),transparent_32%),radial-gradient(circle_at_18%_72%,rgba(147,197,253,0.58),transparent_36%),linear-gradient(150deg,#fffdf7,#eef6ff_45%,#dbeafe)] text-slate-800',
      accent: 'bg-amber-500',
      soft: 'bg-white/48',
    },
  ];
  const hash = Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return tones[hash % tones.length];
}

function SourceLibraryGeneratedCover({
  tile,
  size = 'grid',
}: {
  tile: SourceLibraryTile;
  size?: 'grid' | 'detail';
}) {
  const tone = sourceLibraryCoverTone(tile.sourceHash || tile.title);
  const isDetail = size === 'detail';
  return (
    <div
      className={cn(
        'relative flex size-full flex-col overflow-hidden text-left',
        tone.shell,
        isDetail ? 'p-8' : 'p-3',
      )}
    >
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.24)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.22)_1px,transparent_1px)] bg-[size:36px_36px]" />
      <div className="absolute -left-10 top-10 size-32 rounded-full bg-white/30 blur-2xl" />
      <div className="absolute -right-12 bottom-8 size-40 rounded-full bg-sky-200/34 blur-2xl" />
      <div
        className={cn(
          'absolute rounded-full shadow-[0_0_0_10px_rgba(255,255,255,0.22)]',
          tone.accent,
          isDetail ? 'right-14 top-20 size-5' : 'right-5 top-12 size-2.5',
        )}
      />
      <div
        className={cn(
          'absolute rotate-[-26deg] rounded-full bg-white/58',
          isDetail ? 'left-16 top-36 h-2 w-44' : 'left-7 top-16 h-1 w-20',
        )}
      />
      <div
        className={cn(
          'absolute rotate-[33deg] rounded-full bg-white/46',
          isDetail ? 'right-20 top-44 h-2 w-36' : 'right-6 top-20 h-1 w-16',
        )}
      />

      <div className="relative z-10 flex items-start justify-between gap-3">
        <span
          className={cn(
            'rounded-full bg-white/72 font-bold uppercase tracking-normal text-slate-600 shadow-sm',
            isDetail ? 'px-3 py-1.5 text-xs' : 'px-2 py-0.5 text-[10px]',
          )}
        >
          {tile.placeholderLabel}
        </span>
        <FileText
          className={cn('text-white/86 drop-shadow-sm', isDetail ? 'size-6' : 'size-4')}
          strokeWidth={1.8}
        />
      </div>

      <div className={cn('relative z-10 mt-auto', isDetail ? 'space-y-5' : 'space-y-2')}>
        <div
          className={cn(
            'w-fit rounded-full font-semibold text-slate-700 shadow-sm',
            tone.soft,
            isDetail ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-[10px]',
          )}
        >
          {tile.typeLabel}
        </div>
        <h3
          className={cn(
            'font-semibold leading-tight tracking-normal text-slate-900',
            isDetail ? 'max-w-[520px] text-5xl' : 'line-clamp-3 text-[17px]',
          )}
        >
          {tile.title}
        </h3>
        <div
          className={cn(
            'border-t border-slate-900/10 pt-2 font-medium text-slate-700/82',
            isDetail ? 'flex items-center justify-between gap-3 text-sm' : 'space-y-0.5 text-[9px]',
          )}
        >
          <span className={cn(!isDetail && 'block truncate')}>{tile.subtitle}</span>
          <span className={cn(!isDetail && 'block truncate')}>{tile.dateLabel}</span>
        </div>
      </div>
    </div>
  );
}

type SourceLibraryTextState = {
  status: 'loading' | 'ready' | 'empty' | 'failed';
  text: string;
  error?: string;
};

type SourceLibraryDetailView = 'image' | 'text';

const learningQuickPrompts = [
  '我现在学到哪里了？',
  '帮我安排今天复习',
  '给我开一个小测',
  '我最近哪里最薄弱？',
];
const researchQuickPrompts = [
  '帮我梳理今天的研究任务',
  '把下一步实验拆清楚',
  '整理这篇论文的贡献',
  '制定一下研究计划',
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
  origin?: 'syllabus' | 'ai_plan' | 'manual' | 'practice' | 'exam_prep';
  sourceRef?: { type: 'plan' | 'action' | 'syllabus' | 'manual'; id: string };
  durationMinutes?: number;
  status?: 'planned' | 'done' | 'skipped';
  week?: string | null;
  sourceColumn?: string | null;
  rawText?: string | null;
  confidence?: number | null;
};

type MiniLecturePrompt = {
  id: string;
  title: string;
  question: string;
  answer: string;
  courseName: string;
  createdAt: number;
};

type MiniLectureRegion = {
  id: string;
  label: string;
  script: string;
  markerColorHex: string;
  bbox: [number, number, number, number];
  markerPoints: Array<{
    x: number;
    y: number;
    corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  }>;
};

type MiniLectureAction =
  | {
      id: string;
      type: 'spotlight';
      elementId: string;
      title: string;
      dimOpacity: number;
    }
  | {
      id: string;
      type: 'speech';
      title: string;
      text: string;
    };

type MiniLecturePage = {
  id: string;
  title: string;
  imageDataUrl: string;
  regions: MiniLectureRegion[];
  actions: MiniLectureAction[];
};

type MiniLectureDeck = {
  id: string;
  title: string;
  sourceQuestion: string;
  sourceAnswer: string;
  pages: MiniLecturePage[];
  markerProtocol: {
    type: 'corner-square-markers';
    markerSizePx: number;
    markerCountPerComponent: 4;
    recoveredFrom: 'client-mini-lecture';
  };
  createdAt: number;
};

type TeachingReviewPlanEvidenceItem = {
  id: string;
  sourceType: string;
  sourceId?: string;
  title: string;
  excerpt?: string;
  reason: string;
  target?: { type: string; id: string };
  conceptTags?: string[];
};

type TeachingReviewQuestionCandidate = {
  problemId: string;
  title: string;
  type: string;
  difficulty: string;
  tags: string[];
  latestAttempt?: { status?: string } | null;
  reason: string;
  evidenceIds: string[];
};

type TeachingReviewPlanTask = {
  id: string;
  title: string;
  concepts: string[];
  minutes: number;
  reason: string;
  evidenceIds: string[];
  problemIds: string[];
};

type TeachingReviewPlanOutput = {
  summary: string;
  scheduleSummary: string | null;
  estimatedMinutes: number;
  tasks: TeachingReviewPlanTask[];
  questionCandidates: TeachingReviewQuestionCandidate[];
  rationale: string[];
  evidenceGaps: string[];
};

type TeachingReviewPlanResponse = {
  decision: {
    id: string;
    targetConcepts: string[];
    output: TeachingReviewPlanOutput;
    evidence: {
      items: TeachingReviewPlanEvidenceItem[];
      gaps: Array<{ reason: string; fallback: string }>;
    };
    userFacingRationale: string[];
  };
};

type SyllabusImportMode = 'file' | 'plan';
type SyllabusCommitMode = 'merge' | 'replace';
const SYLLABUS_EVENT_KIND_OPTIONS: Array<{ value: SyllabusEventKind; label: string }> = [
  { value: 'assignment', label: '作业' },
  { value: 'exam', label: '考试' },
  { value: 'progress', label: '进度' },
  { value: 'tutorial', label: 'Tutorial' },
  { value: 'holiday', label: '假期' },
  { value: 'other', label: '事项' },
];
const RESEARCH_EVENT_KIND_OPTIONS: Array<{ value: SyllabusEventKind; label: string }> = [
  { value: 'assignment', label: 'DDL' },
  { value: 'exam', label: '会议' },
  { value: 'progress', label: '进展' },
  { value: 'tutorial', label: '论文阅读' },
  { value: 'holiday', label: '暂停' },
  { value: 'other', label: '事项' },
];
type StatusCalendarActivity = {
  id: string;
  source: 'plan' | 'syllabus';
  sourceId: string;
  title: string;
  date: string;
  meta: string;
  dotClassName: string;
  actionLabel?: string;
  event?: SyllabusCalendarEvent;
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

function sortLearnSessionsForList(
  userId: string,
  courseId: string,
  sessions: LearnChatSession[],
): LearnChatSession[] {
  return [...sessions].sort((a, b) => {
    const aIsBlankNew =
      a.title === '新对话' && learnSessionIsBlank(readLearnSessionMessages(userId, courseId, a.id));
    const bIsBlankNew =
      b.title === '新对话' && learnSessionIsBlank(readLearnSessionMessages(userId, courseId, b.id));
    if (aIsBlankNew !== bIsBlankNew) return aIsBlankNew ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}

function readLearnSessions(userId: string, courseId: string): LearnChatSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(learnSessionIndexKey(userId, courseId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<LearnChatSession>[];
    if (!Array.isArray(parsed)) return [];
    const sessions = parsed.filter((item): item is LearnChatSession =>
      Boolean(
        item &&
        typeof item.id === 'string' &&
        typeof item.title === 'string' &&
        typeof item.createdAt === 'number' &&
        typeof item.updatedAt === 'number',
      ),
    );
    return sortLearnSessionsForList(userId, courseId, sessions).slice(0, 12);
  } catch {
    return [];
  }
}

function writeLearnSessions(userId: string, courseId: string, sessions: LearnChatSession[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      learnSessionIndexKey(userId, courseId),
      JSON.stringify(sortLearnSessionsForList(userId, courseId, sessions).slice(0, 12)),
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
    return parsed
      .filter((message): message is LearnMessage =>
        Boolean(
          message &&
          typeof message.id === 'string' &&
          (message.role === 'user' || message.role === 'assistant') &&
          typeof message.text === 'string' &&
          typeof message.createdAt === 'number',
        ),
      )
      .filter((message) => !message.transient);
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
    const serializableMessages = messages
      .filter((message) => !message.transient)
      .map((message) => ({
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

function deleteLearnSessionMessages(userId: string, courseId: string, sessionId: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(learnSessionMessagesKey(userId, courseId, sessionId));
  } catch {
    /* localStorage may be unavailable */
  }
}

function mergeLearnSessions(
  userId: string,
  courseId: string,
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
  return sortLearnSessionsForList(userId, courseId, Array.from(byId.values())).slice(0, 12);
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
    lecturePrompt:
      message.lecturePrompt == null ? undefined : (message.lecturePrompt as MiniLecturePrompt),
    lectureDeck: message.lectureDeck == null ? undefined : (message.lectureDeck as MiniLectureDeck),
    learningActions:
      message.learningActions == null ? undefined : (message.learningActions as LearningAction[]),
    artifacts: message.artifacts == null ? undefined : (message.artifacts as LearnArtifact[]),
    publicTrace:
      message.publicTrace == null ? undefined : (message.publicTrace as LearnPublicTraceStep[]),
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
    lecturePrompt: message.lecturePrompt,
    lectureDeck: message.lectureDeck,
    learningActions: message.learningActions,
    artifacts: message.artifacts,
    publicTrace: message.publicTrace,
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
    message.lectureDeck?.title ? `课堂讲解：${message.lectureDeck.title}` : '',
    message.learningActions?.length
      ? `学习操作：${message.learningActions.map((a) => a.label).join(' / ')}`
      : '',
    message.artifacts?.length ? `学习素材：${message.artifacts.length} 个` : '',
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

function sourceUploadKindLabel(kind: string): string {
  switch (kind) {
    case 'pdf':
      return 'PDF';
    case 'markdown':
      return 'Markdown';
    case 'plain_text':
      return '文本';
    case 'pptx':
      return 'PPTX';
    case 'problem_bank':
      return '题库';
    default:
      return '资料';
  }
}

function formatLibraryItemDate(value: string | number | null | undefined): string {
  const timestamp = typeof value === 'number' ? value : value ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(timestamp)) return '';
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMemoryActivityTime(value: number) {
  return new Date(value).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function memoryActivityStatusLabel(
  status: MemoryActivityRecord['status'] | TaskHistoryRecord['status'],
) {
  if (
    status === 'detecting' ||
    status === 'writing_fact' ||
    status === 'writing_study_memory' ||
    status === 'indexing_source' ||
    status === 'needs_confirmation' ||
    status === 'running' ||
    status === 'queued' ||
    status === 'needs_attention'
  ) {
    return '理解中';
  }
  if (status === 'completed') return '已记住';
  if (status === 'failed') return '没记成';
  return '已跳过';
}

const INTERNAL_MEMORY_PROCESS_PATTERN =
  /用户先看到|后台|处理判断|写入和索引|独立任务|独立判断|正在覆盖当前任务|当前任务、卡点|教学动作|currentTask|stuckPoint|nextTeachingMove/i;

function memoryActivityStudentTitle(title: string, description: string) {
  const raw = [title, description].join(' ').trim();
  if (INTERNAL_MEMORY_PROCESS_PATTERN.test(raw)) {
    return '我记录了这次互动里有用的学习线索';
  }
  if (
    /(考试|测验|quiz|test|midterm|final|ddl|deadline|due|作业|assignment|日程|calendar|syllabus|上课|office hour)/i.test(
      raw,
    )
  ) {
    return '课程安排已更新';
  }
  if (/(课程要求|笔记本要求|要求|格式|模板|rubric|marking|评分|规则|contract)/i.test(raw)) {
    return '课程要求已更新';
  }
  if (/(个人背景|背景|目标|专业|年级|学校|profile)/i.test(raw)) {
    return '个人背景已更新';
  }
  if (/(重要信息|事实|current fact|fact|记住.*信息)/i.test(raw)) {
    return '重要信息已更新';
  }
  if (/(对话摘要|conversation summary|摘要|总结)/i.test(raw)) {
    return '对话摘要已更新';
  }
  if (/进度|范围|checkpoint|学到的位置/i.test(raw)) return '学习进度已更新';
  if (/薄弱|不稳|不会|卡点|weak|错|mistake|stuck/i.test(raw)) return '薄弱点已更新';
  if (/掌握|会了|已通过|mastered|passed/i.test(raw)) return '掌握情况已更新';
  if (/下一步|怎么帮|教学动作|next/i.test(raw)) return '下一步学习建议已更新';
  if (/资料|索引|入库|source/i.test(raw)) return '资料理解已更新';
  if (/偏好|preference|喜欢|希望|习惯/i.test(raw)) return '学习偏好已更新';
  return title || '我更新了一条学习记忆';
}

function memoryActivityStudentDescription(record: {
  title: string;
  description: string;
  status: MemoryActivityRecord['status'] | TaskHistoryRecord['status'];
  error?: string;
}) {
  if (record.status === 'failed') {
    return record.error || record.description || '这次没有写入成功，我会保留当前对话继续帮你。';
  }
  if (INTERNAL_MEMORY_PROCESS_PATTERN.test(record.description)) {
    return '我会把这次对话里有用的学习状态整理出来，之后回答时更接得上你的进度和卡点。';
  }
  if (record.description) return record.description;
  if (record.status === 'completed')
    return '这条记忆已经更新。之后我会用它判断你的进度、薄弱点和下一步学习安排。';
  return '平台正在判断这条信息会不会帮助之后的学习。';
}

function platformMemoryChipLabel(chip: string) {
  if (chip === 'conversation') return '对话';
  if (chip === 'course') return '课程';
  if (chip === 'notebook') return '笔记本';
  if (chip === 'private') return '私有';
  if (chip === 'public') return '共享';
  if (chip === 'study_memory') return '学习记忆';
  if (chip === 'knowledge_index') return '资料理解';
  if (chip === 'structured_fact') return '事实';
  return chip;
}

type PlatformMemoryVisualTone =
  | 'schedule'
  | 'preference'
  | 'progress'
  | 'weakness'
  | 'mastery'
  | 'source'
  | 'next'
  | 'writing';

const PLATFORM_MEMORY_SPHERES: Array<{
  tone: PlatformMemoryVisualTone;
  label: string;
  className: string;
}> = [
  { tone: 'progress', label: '进度', className: 'learn-memory-sphere-xl sphere-progress' },
  { tone: 'weakness', label: '薄弱点', className: 'learn-memory-sphere-md sphere-weakness' },
  { tone: 'mastery', label: '掌握', className: 'learn-memory-sphere-lg sphere-mastery' },
  { tone: 'schedule', label: '安排', className: 'learn-memory-sphere-sm sphere-schedule' },
  { tone: 'source', label: '资料', className: 'learn-memory-sphere-md sphere-source' },
  { tone: 'preference', label: '偏好', className: 'learn-memory-sphere-sm sphere-preference' },
  { tone: 'next', label: '下一步', className: 'learn-memory-sphere-lg sphere-next' },
  { tone: 'writing', label: '写入中', className: 'learn-memory-sphere-xs sphere-writing' },
  { tone: 'source', label: '索引', className: 'learn-memory-sphere-xs sphere-source-alt' },
  { tone: 'mastery', label: '稳定', className: 'learn-memory-sphere-sm sphere-mastery-alt' },
];

function platformMemoryVisualTone(record: { title: string; description: string; chips: string[] }) {
  const raw = [record.title, record.description, ...record.chips].join(' ');
  if (
    /(考试|测验|quiz|test|midterm|final|ddl|deadline|due|作业|assignment|日程|calendar|syllabus|上课|office hour|课程安排)/i.test(
      raw,
    )
  ) {
    return 'schedule';
  }
  if (/偏好|preference|喜欢|希望|习惯|学习偏好/i.test(raw)) return 'preference';
  if (/进度|范围|checkpoint|学到的位置|学习进度/i.test(raw)) return 'progress';
  if (/薄弱|不稳|不会|卡点|weak|错|mistake|stuck|薄弱点/i.test(raw)) {
    return 'weakness';
  }
  if (/掌握|会了|已通过|mastered|passed|掌握情况/i.test(raw)) return 'mastery';
  if (/下一步|怎么帮|教学动作|next|学习建议/i.test(raw)) return 'next';
  if (/资料|索引|入库|source|题目|讲义|资料理解/i.test(raw)) return 'source';
  return 'writing';
}

function shouldShowPlatformMemoryRecord(record: TaskHistoryRecord) {
  if (record.source !== 'memory_activity') return false;
  if (record.kind === 'none') return false;
  if (INTERNAL_MEMORY_PROCESS_PATTERN.test([record.title, record.description].join(' '))) {
    return false;
  }
  return true;
}

function isPlatformMemoryStatusMockRecord(record: TaskHistoryRecord) {
  return (
    record.sourceId.startsWith('platform-memory-status-mock-') ||
    record.sourceId.startsWith('live2d-memory-status-mock-')
  );
}

function shouldCountPlatformMemoryActivity(activity: MemoryActivityRecord) {
  if (activity.layer === 'none') return false;
  if (INTERNAL_MEMORY_PROCESS_PATTERN.test([activity.title, activity.description].join(' '))) {
    return false;
  }
  return true;
}

type PlatformMemoryStatusMockMode = 'off' | 'running' | 'flow';

const PLATFORM_MEMORY_STATUS_MOCK_QUERY_PARAM = 'memoryStatusMock';
const PLATFORM_MEMORY_STATUS_MOCK_ACTIVITY_IDS = [
  'platform-memory-status-mock-schedule',
  'platform-memory-status-mock-preference',
  'platform-memory-status-mock-progress',
  'platform-memory-status-mock-weakness',
  'platform-memory-status-mock-mastery',
  'platform-memory-status-mock-source',
  'platform-memory-status-mock-next-step',
] as const;

function platformMemoryStatusMockModeFromValue(
  value: string | null | undefined,
): PlatformMemoryStatusMockMode {
  if (value === 'running' || value === 'flow') return value;
  return 'off';
}

function dismissPlatformMemoryStatusMockActivities() {
  for (const id of PLATFORM_MEMORY_STATUS_MOCK_ACTIVITY_IDS) {
    dismissMemoryActivity(id);
  }
}

function showRunningPlatformMemoryStatusMock() {
  dismissPlatformMemoryStatusMockActivities();

  addMemoryActivity({
    id: 'platform-memory-status-mock-schedule',
    title: '课程安排已更新',
    description:
      '课程安排：你说 CSC108 下周五有 midterm。之后安排复习、小测和提醒时，我会围绕这个时间倒排。',
    status: 'completed',
    layer: 'study_memory',
    chips: ['课程安排', '考试'],
  });
  addMemoryActivity({
    id: 'platform-memory-status-mock-preference',
    title: '学习偏好已更新',
    description:
      '学习偏好：你更希望先看一个具体例子，再回到定义和规则。之后讲新概念时我会按这个顺序来。',
    status: 'completed',
    layer: 'structured_fact',
    chips: ['学习偏好'],
  });
  addMemoryActivity({
    id: 'platform-memory-status-mock-progress',
    title: '学习进度写入中',
    description: '学习进度：正在学习 03 循环，重点是 range、for、while 和嵌套循环。',
    status: 'writing_study_memory',
    layer: 'study_memory',
    chips: ['学习进度', 'CSC108'],
  });
  addMemoryActivity({
    id: 'platform-memory-status-mock-weakness',
    title: '薄弱点写入中',
    description:
      '薄弱点：循环边界和 range 的停止位置还不稳，尤其容易把最后一次循环是否执行判断错。',
    status: 'writing_study_memory',
    layer: 'study_memory',
    chips: ['薄弱点', '循环'],
  });
}

function replayPlatformMemoryStatusMock() {
  dismissPlatformMemoryStatusMockActivities();

  addMemoryActivity({
    id: 'platform-memory-status-mock-schedule',
    title: '课程安排写入中',
    description: '课程安排：你说 CSC108 下周五有 midterm，我正在把它放进之后的复习规划里。',
    status: 'writing_study_memory',
    layer: 'study_memory',
    chips: ['课程安排', '考试'],
  });
  addMemoryActivity({
    id: 'platform-memory-status-mock-preference',
    title: '学习偏好写入中',
    description: '学习偏好：你更喜欢先看例子，再看定义。之后我会按这个顺序组织讲解。',
    status: 'writing_fact',
    layer: 'structured_fact',
    chips: ['学习偏好'],
  });
  addMemoryActivity({
    id: 'platform-memory-status-mock-progress',
    title: '学习进度写入中',
    description: '学习进度：正在学习 03 循环，范围包括 range、for、while 和嵌套循环。',
    status: 'writing_study_memory',
    layer: 'study_memory',
    chips: ['学习进度', 'CSC108'],
  });
  addMemoryActivity({
    id: 'platform-memory-status-mock-weakness',
    title: '薄弱点写入中',
    description: '薄弱点：循环边界和 range 的停止位置还不稳，需要用小题继续确认。',
    status: 'writing_study_memory',
    layer: 'study_memory',
    chips: ['薄弱点', '循环'],
  });
  addMemoryActivity({
    id: 'platform-memory-status-mock-source',
    title: '资料理解写入中',
    description: '资料理解：我正在把循环讲义和刚才的小测题整理成之后可以检索的课程依据。',
    status: 'indexing_source',
    layer: 'knowledge_index',
    chips: ['资料理解', '题目'],
  });

  return [
    window.setTimeout(() => {
      updateMemoryActivity('platform-memory-status-mock-schedule', {
        title: '课程安排已更新',
        status: 'completed',
        description:
          '课程安排：CSC108 下周五有 midterm。之后安排复习、小测和提醒时，我会围绕这个时间倒排。',
      });
    }, 700),
    window.setTimeout(() => {
      updateMemoryActivity('platform-memory-status-mock-preference', {
        title: '学习偏好已更新',
        status: 'completed',
        description:
          '学习偏好：你更喜欢先看例子，再看定义。之后讲新概念时我会先给一个可运行的小例子。',
      });
    }, 1200),
    window.setTimeout(() => {
      updateMemoryActivity('platform-memory-status-mock-progress', {
        title: '学习进度已更新',
        status: 'completed',
        description:
          '学习进度：你现在定位在 03 循环。下一轮复习会从 range、for、while 和嵌套循环接上。',
      });
    }, 1700),
    window.setTimeout(() => {
      addMemoryActivity({
        id: 'platform-memory-status-mock-mastery',
        title: '掌握情况已更新',
        description: '掌握情况：你已经能读懂简单 for 循环，并能说出循环变量每轮怎样变化。',
        status: 'completed',
        layer: 'study_memory',
        chips: ['掌握情况', '循环'],
      });
    }, 2300),
    window.setTimeout(() => {
      updateMemoryActivity('platform-memory-status-mock-weakness', {
        title: '薄弱点已更新',
        status: 'completed',
        description:
          '薄弱点：range 的停止位置和 while 的终止条件还不稳。下一步要用 2-3 道边界小题来补。',
      });
    }, 2800),
    window.setTimeout(() => {
      addMemoryActivity({
        id: 'platform-memory-status-mock-next-step',
        title: '下一步学习建议已更新',
        description:
          '下一步：先做一组循环边界判断题，再让你自己写一个带 accumulator 的 while 循环。',
        status: 'completed',
        layer: 'study_memory',
        chips: ['下一步', '练习'],
      });
    }, 3400),
    window.setTimeout(() => {
      updateMemoryActivity('platform-memory-status-mock-source', {
        title: '资料理解已更新',
        status: 'completed',
        description:
          '资料理解：循环讲义和小测题已经整理好。之后问到 range/for/while，我可以回到这些材料里找依据。',
      });
    }, 4100),
  ];
}

function formatSourceUploadStatusSummary(result: CourseSourceIngestResponse['ingest']) {
  const sectionCount = result.notebook?.sections?.length ?? (result.notebook?.sectionId ? 1 : 0);
  const notebookLine = result.classification.allQuestionUpload
    ? '我识别出这是一份题目文件，已经把能练习的题目整理出来'
    : result.notebook
      ? `我${result.notebook.created ? '新建' : '更新'}了笔记本「${result.notebook.name}」${sectionCount ? `，整理出 ${sectionCount} 个段落` : ''}`
      : '我已经把资料放进可检索的课程理解里';
  return [
    `我读懂了这份关于「${result.classification.topic}」的资料`,
    result.problems.insertedCount
      ? `还整理出 ${result.problems.insertedCount} 道可以之后练习的题`
      : '',
    notebookLine,
  ]
    .filter(Boolean)
    .join('。');
}

function sourceUploadLive2DLine(fileName: string, result: CourseSourceIngestResponse['ingest']) {
  if (result.classification.allQuestionUpload) {
    return `《${fileName}》题目入库完成：新增 ${result.problems.insertedCount} 题，跳过 ${result.problems.duplicateCount} 个重复。`;
  }
  const notebook = result.notebook
    ? `${result.notebook.created ? '新建' : '更新'}了「${result.notebook.name}」${result.notebook.sections?.length ? `，写入 ${result.notebook.sections.length} 个 section` : ''}`
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

type NotebookMarkdownPreview = {
  markdownSections?: Array<{
    id: string;
    title: string;
    order: number;
    markdown: string;
  }>;
};

function sourceLibraryTextFromBlocks(
  blocks: Array<{
    title: string;
    markdown: string;
  }>,
) {
  return blocks
    .map((block, index) => {
      const markdown = block.markdown.trim();
      if (!markdown) return '';
      const title = block.title || `文本 ${index + 1}`;
      return [`## ${title}`, markdown].join('\n\n');
    })
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function sourceLibraryTextFromMarkdownPreviews(
  previewResults: Array<{ notebook: NotebookMarkdownPreview } | null>,
  textSectionIds: string[],
) {
  const wantedSectionIds = new Set(textSectionIds);
  return previewResults
    .flatMap((previewResult) => {
      const allMarkdownSections = (previewResult?.notebook.markdownSections || [])
        .slice()
        .sort((a, b) => a.order - b.order);
      const matchedMarkdownSections =
        wantedSectionIds.size > 0
          ? allMarkdownSections.filter((section) => wantedSectionIds.has(section.id))
          : allMarkdownSections;
      const markdownSections =
        matchedMarkdownSections.length > 0 ? matchedMarkdownSections : allMarkdownSections;
      return markdownSections.map((section, index) => {
        const title = section.title || `文本 ${index + 1}`;
        return [`## ${title}`, section.markdown.trim()].filter(Boolean).join('\n\n');
      });
    })
    .join('\n\n')
    .trim();
}

async function loadNotebookMarkdownPreview(notebookId: string, timeoutMs = 4500) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return Promise.race([
    backendJson<{ notebook: NotebookMarkdownPreview }>(
      `/api/notebooks/${encodeURIComponent(notebookId)}?includeScenes=0&includeMarkdown=1`,
    ),
    new Promise<null>((resolve) => {
      timeoutId = setTimeout(() => resolve(null), timeoutMs);
    }),
  ]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function sourceUploadStatusLabel(status: LearnSourceUploadStatus) {
  if (status === 'ingesting') return '入库中';
  if (status === 'stored') return '已入库';
  return '入库失败';
}

function SourceUploadBadge({
  uploading,
  completedCount,
  compact = false,
}: {
  uploading: boolean;
  completedCount: number;
  compact?: boolean;
}) {
  if (!uploading && completedCount <= 0) return null;
  const label = uploading
    ? compact
      ? '中'
      : '入库中'
    : completedCount > 9
      ? '9+'
      : String(completedCount);
  const srLabel = uploading ? '课程资料正在入库' : `有 ${completedCount} 个新文件已入库`;

  return (
    <span
      className={cn(
        'absolute z-10 grid place-items-center rounded-full border border-white px-1 text-[10px] font-bold leading-4 text-white shadow-sm dark:border-slate-950',
        compact ? '-right-0.5 -top-0.5 min-w-4' : '-right-1.5 -top-1.5 min-w-4',
        uploading ? 'bg-sky-500' : 'bg-emerald-500',
        !compact && uploading ? 'min-w-[2.5rem] px-1.5' : null,
      )}
      aria-label={srLabel}
    >
      {label}
    </span>
  );
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
  'w-full max-w-none select-text break-words text-[15px] leading-7 text-foreground',
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
  '[&_p]:my-3',
  '[&_strong]:font-semibold [&_strong]:text-foreground',
  '[&_h1]:mb-4 [&_h1]:mt-8 [&_h1]:text-[1.35rem] [&_h1]:font-semibold [&_h1]:leading-tight',
  '[&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:border-b [&_h2]:border-border [&_h2]:pb-3 [&_h2]:text-lg [&_h2]:font-semibold',
  '[&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-[1.05rem] [&_h3]:font-semibold',
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
    message.pendingAction ||
    message.lecturePrompt ||
    message.lectureDeck ||
    message.learningActions?.length ||
    message.artifacts?.length,
  );
}

function learnSessionIsBlank(messages: LearnMessage[]): boolean {
  return !messages.some(learnMessageHasContent);
}

function learnSessionUpdatedAtFromMessages(messages: LearnMessage[]): number | null {
  const messageTimes = messages
    .filter(learnMessageHasContent)
    .map((message) => message.createdAt)
    .filter((createdAt) => Number.isFinite(createdAt));
  if (!messageTimes.length) return null;
  return Math.max(...messageTimes);
}

function learnConversationSyncSignature(args: {
  key: string;
  title: string;
  messages: RemoteLearnMessagePayload[];
}) {
  return JSON.stringify(args);
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

function isSyllabusDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function syllabusPlanningEvents(events: SyllabusCalendarEvent[]): SyllabusCalendarEvent[] {
  return events
    .filter((event) => event.title.trim() && isSyllabusDate(event.date) && event.kind !== 'holiday')
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

function progressSelectionFromSnapshot(snapshot: LearnerCourseSnapshot | null): string {
  if (!snapshot?.progressKnown) return '';
  if (snapshot.progressCheckpointKind === 'not_started') return PROGRESS_SELECTION_NOT_STARTED;
  if (snapshot.progressCheckpointKind === 'completed_all') return PROGRESS_SELECTION_COMPLETED_ALL;
  return snapshot.progressNotebookId || snapshot.currentNotebook?.id || '';
}

function notebookCourseOrder(notebook: Pick<StageListItem, 'id' | 'name' | 'createdAt'>): number {
  const candidates = [notebook.name, notebook.id];
  for (const candidate of candidates) {
    const match = candidate.match(/(?:^|[-_\s])0?(\d{1,2})(?:\s*[-–—_:]|[-_\s]|$)/);
    if (match) return Number(match[1]);
  }
  return Number.MAX_SAFE_INTEGER;
}

function orderedCourseNotebooks<T extends Pick<StageListItem, 'id' | 'name' | 'createdAt'>>(
  notebooks: T[],
): T[] {
  return notebooks.slice().sort((a, b) => {
    const orderA = notebookCourseOrder(a);
    const orderB = notebookCourseOrder(b);
    if (orderA !== orderB) return orderA - orderB;
    return a.createdAt - b.createdAt || a.name.localeCompare(b.name);
  });
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

function normalizeRepeatedWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function collapseDuplicatedAssistantText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length < 320) return trimmed;

  const paragraphs = trimmed.split(/\n{2,}/).map((paragraph) => paragraph.trim());
  if (paragraphs.length >= 4 && paragraphs.length % 2 === 0) {
    const midpoint = paragraphs.length / 2;
    const firstHalf = normalizeRepeatedWhitespace(paragraphs.slice(0, midpoint).join('\n\n'));
    const secondHalf = normalizeRepeatedWhitespace(paragraphs.slice(midpoint).join('\n\n'));
    if (firstHalf && firstHalf === secondHalf) {
      return paragraphs.slice(0, midpoint).join('\n\n');
    }
  }

  const probe = normalizeRepeatedWhitespace(trimmed.slice(0, 260));
  if (probe.length >= 180) {
    const normalized = normalizeRepeatedWhitespace(trimmed);
    const repeatedAt = normalized.indexOf(probe, probe.length + 40);
    if (repeatedAt > 0) {
      return normalized.slice(0, repeatedAt).trim();
    }
  }

  return trimmed;
}

function plainTextMathForLearnChat(text: string): string {
  return text
    .replace(/`([^`\n]*)`/g, '$1')
    .replace(/\$\$([\s\S]*?)\$\$/g, (_, content: string) => content.trim())
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, content: string) => content.trim())
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, content: string) => content.trim())
    .replace(/\$([^$\n]+)\$/g, (_, content: string) => content.trim())
    .replace(/\[blocked\]/gi, '')
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1) / ($2)')
    .replace(/\\sqrt\{([^{}]+)\}/g, 'sqrt($1)')
    .replace(/\\Delta/g, 'Δ')
    .replace(/\\cdots/g, '...')
    .replace(/\\ldots/g, '...')
    .replace(/\\times/g, '×')
    .replace(/\\cdot/g, '·')
    .replace(/\\infty/g, '∞')
    .replace(/\\int/g, '∫')
    .replace(/\\sum/g, 'sum')
    .replace(/\\leq/g, '<=')
    .replace(/\\geq/g, '>=')
    .replace(/\\neq/g, '!=')
    .replace(/\\to/g, '->')
    .replace(/\\left/g, '')
    .replace(/\\right/g, '')
    .replace(/\\,/g, '')
    .replace(/\\mathrm\{([^{}]+)\}/g, '$1')
    .replace(/\\text\{([^{}]+)\}/g, '$1')
    .replace(/\^\{([^{}]+)\}/g, '^$1')
    .replace(/_\{([^{}]+)\}/g, '_$1')
    .replace(/\\([A-Za-z]+)/g, '$1')
    .replace(/`/g, '')
    .replace(/\$/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeCourseAssistantAnswer(text: string): string {
  const collapsed = collapseDuplicatedAssistantText(text);
  return collapsed
    .split(/(```[\s\S]*?```)/g)
    .map((part) => (part.startsWith('```') ? part : plainTextMathForLearnChat(part)))
    .join('')
    .trim();
}

function latestAssistantLearningActions(
  messages: UIMessage<ChatMessageMetadata>[],
): LearningAction[] {
  const assistant = messages
    .slice()
    .reverse()
    .find((message) => message.role === 'assistant' && message.metadata?.learningActions?.length);
  return assistant?.metadata?.learningActions?.map((action) => ({ ...action })) || [];
}

function normalizeAssistantMarkdown(text: string): string {
  return collapseDuplicatedAssistantText(text)
    .split(/(```[\s\S]*?```)/g)
    .map((part) => (part.startsWith('```') ? part : plainTextMathForLearnChat(part)))
    .join('')
    .trim();
}

function isExplicitProblemBankSelectionRequest(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    /(题库|题目库|problem\s*bank|question\s*bank)/i.test(normalized) &&
    /(选|挑|抽|找|从|bank|题库|select|choose|pick)/i.test(normalized)
  );
}

function buildNoCourseProblemBankAnswer(args: {
  course: CourseRecord;
  questionText: string;
  notebooks: StageListItem[];
}): string {
  const courseLabel = args.course.courseCode || args.course.name;
  const topic =
    args.questionText
      .replace(/给我|帮我|请|从题库|题库|选|挑|抽|找|道|题|。|，|,/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40) || '这个主题';
  const notebookLine = args.notebooks.length
    ? `我可以改用 ${courseLabel} 的课程笔记，临时生成一组关于「${topic}」的练习；但这不是从题库选择。`
    : `我也没有看到可用课程笔记来支撑临时生成练习。`;
  return [
    `${courseLabel} 这门课当前没有可用的课程题库，所以我不能假装“从题库里选 3 道”。`,
    '',
    notebookLine,
    '',
    '如果你要临时练习，可以直接说“基于笔记临时出 3 道题”；如果你要真正的题库选择，需要先导入或发布这门课的题库。',
  ].join('\n');
}

function learnMessagesForPlanningIntent(messages: LearnMessage[]): LearnTurnMessage[] {
  return messages
    .slice(-8)
    .map((message) => ({
      role: message.role,
      text: message.text.trim().slice(0, 2200),
    }))
    .filter((message) => message.text.length > 0);
}

async function planLearnTurn(args: {
  question: string;
  messages: LearnMessage[];
  course: CourseRecord;
  snapshot: LearnerCourseSnapshot | null;
  calendarEvents: SyllabusCalendarEvent[];
  recentActivities?: StatusCalendarActivity[];
  recentPlans: PracticePlan[];
  problems: CourseProblemClientSummary[];
  sourceUploads: CourseSourceUploadRecord[];
  providerId: ProviderId;
  modelId: string;
}): Promise<LearnTurnClientResponse | null> {
  const activeProblems = args.problems.filter((problem) => problem.status !== 'archived');
  try {
    return await backendJson<LearnTurnClientResponse>('/api/learn/turn', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(args.providerId === 'openai' && args.modelId
          ? { 'x-model': `openai:${args.modelId}` }
          : {}),
      },
      body: JSON.stringify({
        question: args.question,
        recentMessages: learnMessagesForPlanningIntent(args.messages),
        courseId: args.course.id,
        courseName: args.course.name,
        courseCode: args.course.courseCode,
        hasSyllabus: syllabusPlanningEvents(args.calendarEvents).length > 0,
        progressKnown: Boolean(args.snapshot?.progressKnown),
        learnerSnapshot: args.snapshot,
        calendarEvents: args.calendarEvents.slice(0, 160).map((event) => ({
          id: event.id,
          title: event.title,
          rawText: event.rawText,
          kind: event.kind,
          date: event.date,
          sourceName: event.sourceName,
          origin: event.origin || 'syllabus',
          status: event.status,
          durationMinutes: event.durationMinutes,
        })),
        recentPlans: args.recentPlans.slice(0, 4).map((plan) => ({
          id: plan.id,
          title: plan.title,
          mode: plan.mode,
          targetConcepts: plan.targetConcepts,
          estimatedMinutes: plan.estimatedMinutes,
          status: plan.status,
        })),
        recentArtifacts: latestLearnArtifactsForTurn(args.messages, 12),
        recentActions: latestLearningActionsForTurn(args.messages, 10),
        recentActivities: (args.recentActivities || []).slice(0, 6).map((activity) => ({
          id: activity.id,
          source: activity.source,
          sourceId: activity.sourceId,
          title: activity.title,
          date: activity.date,
          meta: activity.meta,
          eventKind: activity.event?.kind,
          durationMinutes: activity.event?.durationMinutes,
          origin: activity.event?.origin,
          rawText: activity.event?.rawText,
        })),
        problemBank: {
          available: activeProblems.length > 0,
          activeCount: activeProblems.length,
          samples: activeProblems.slice(0, 8).map((problem) => ({
            id: problem.id,
            title: problem.title,
            notebookName: problem.notebookName,
            tags: problem.tags,
          })),
        },
        sourceUploads: args.sourceUploads.slice(0, 12).map((source) => ({
          id: source.sourceHash,
          sourceHash: source.sourceHash,
          title: source.title,
          kind: source.kind,
          topic: source.topic,
          usageProfile: source.usageProfile,
          createdAt: source.createdAt,
          notebookIds: source.notebookIds,
          problemIds: source.problemIds,
          memoryIds: source.memoryIds,
          ragEntryIds: source.ragEntryIds,
          stats: source.stats,
        })),
      }),
    });
  } catch (error) {
    console.warn(
      '[learn] AI learn turn planner unavailable:',
      error instanceof Error ? error.message : error,
    );
    const rawMessage = error instanceof Error ? error.message : '学习路由失败';
    if (
      /AI semantic router failed to produce a valid decision|AI semantic router/i.test(rawMessage)
    ) {
      throw new Error('这次没有拿到可用的复习结构');
    }
    throw error;
  }
}

function payloadRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function learnAnswerModeLabel(mode?: LearnTurnClientResponse['answerMode']) {
  if (mode === 'client_activity_plan') return '学习活动计划';
  if (mode === 'client_practice_plan') return '题库练习';
  if (mode === 'action_only') return '工具操作';
  if (mode === 'course_answer') return '课程讲解';
  return '学习回应';
}

function publicTraceToolIds(response: LearnTurnClientResponse | null): string[] {
  const ids: string[] = [];
  const trace = response?.trace;
  const steps = Array.isArray(trace?.steps) ? trace.steps : [];
  const toolCalls = Array.isArray(trace?.toolCalls) ? trace.toolCalls : [];
  for (const step of steps) {
    const selectedToolIds = payloadRecord(step.metadata).selectedToolIds;
    if (Array.isArray(selectedToolIds)) ids.push(...selectedToolIds.map(String));
  }
  for (const call of toolCalls) {
    if (call.toolId) ids.push(call.toolId);
    const selectedToolIds = payloadRecord(call.metadata).selectedToolIds;
    if (Array.isArray(selectedToolIds)) ids.push(...selectedToolIds.map(String));
  }
  return Array.from(new Set(ids.filter(Boolean)));
}

function makePublicTraceStep(
  id: string,
  title: string,
  detail: string,
  evidence?: string[],
  status: LearnPublicTraceStep['status'] = 'done',
): LearnPublicTraceStep {
  return {
    id,
    title,
    detail,
    status,
    evidence: evidence?.filter(Boolean).slice(0, 3),
  };
}

function pendingPublicTraceForQuestion(question: string): LearnPublicTraceStep[] {
  return [
    makePublicTraceStep(
      'classify',
      '识别学习意图',
      `判断这次是知识点复习、刷题、课程讲解、考试准备、预习还是进度确认：${question.slice(0, 80)}`,
      undefined,
      'waiting',
    ),
    makePublicTraceStep(
      'context',
      '读取学习上下文',
      '查看学习记忆、课程进度、近期活动、课程日程和题库可用性。',
      undefined,
      'waiting',
    ),
    makePublicTraceStep(
      'route',
      '选择下一步动作',
      '按上下文决定生成知识点复习、题库练习、课程讲解交接或进度确认。',
      undefined,
      'waiting',
    ),
  ];
}

function replaceLearnMessage(
  messages: LearnMessage[],
  messageId: string,
  replacement: LearnMessage,
): LearnMessage[] {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index < 0) return [...messages, replacement];
  return messages.map((message) => (message.id === messageId ? replacement : message));
}

function removeLearnMessage(messages: LearnMessage[], messageId: string): LearnMessage[] {
  return messages.filter((message) => message.id !== messageId);
}

function publicTraceFromLearnTurn(
  response: LearnTurnClientResponse | null,
  args: {
    question: string;
    progressKnown?: boolean;
    calendarCount?: number;
    problemCount?: number;
  },
): LearnPublicTraceStep[] {
  if (!response) return [];
  const steps: LearnPublicTraceStep[] = [];
  const toolIds = publicTraceToolIds(response);
  const focusTopics = (response.planningDecision?.focusTopics || [])
    .map((topic) => topic.trim())
    .filter(Boolean);
  const answerMode = response.answerMode || 'course_answer';
  const addStep = (step: LearnPublicTraceStep) => {
    if (!steps.some((item) => item.id === step.id)) steps.push(step);
  };

  addStep(
    makePublicTraceStep(
      'classify',
      '识别学习请求',
      focusTopics.length
        ? `识别为${learnAnswerModeLabel(answerMode)}，范围聚焦：${focusTopics.join('、')}。`
        : `识别为${learnAnswerModeLabel(answerMode)}：${args.question.slice(0, 80)}`,
    ),
  );

  if (toolIds.includes('search_memory')) {
    addStep(
      makePublicTraceStep(
        'memory',
        '查看学习记忆',
        args.progressKnown
          ? '读取当前进度、薄弱点、近期错题和下一步概念。'
          : '检查是否已有进度、薄弱点和做题记录；当前没有把未知进度当作阻塞。',
      ),
    );
  }
  if (toolIds.includes('search_schedule')) {
    addStep(
      makePublicTraceStep(
        'schedule',
        '检查课程日程',
        typeof args.calendarCount === 'number' && args.calendarCount > 0
          ? `查看 ${args.calendarCount} 个 syllabus/日历事项，寻找考试、作业和复习窗口。`
          : '检查 syllabus、考试、作业和近期活动；没有可用日程时不编造 deadline。',
      ),
    );
  }
  if (toolIds.includes('search_problem_bank')) {
    addStep(
      makePublicTraceStep(
        'problem-bank',
        '查看题库',
        typeof args.problemCount === 'number' && args.problemCount > 0
          ? `读取 ${args.problemCount} 道可用题，判断是否需要进入刷题/诊断。`
          : '检查是否有可用题库；没有题库时不会假装抽题。',
      ),
    );
  }
  if (toolIds.includes('search_course_materials')) {
    addStep(
      makePublicTraceStep(
        'materials',
        '查看课程资料',
        '检查资料库、笔记和上传来源，决定是否需要基于原文讲解。',
      ),
    );
  }
  if (toolIds.includes('plan_review')) {
    addStep(
      makePublicTraceStep(
        'plan-review',
        '生成复习路线',
        '把复习分成知识点梳理、自检和需要时的题库练习。',
      ),
    );
  }
  if (toolIds.includes('propose_practice_generation')) {
    addStep(
      makePublicTraceStep(
        'practice',
        '准备刷题方案',
        '根据题库可用性准备练习/小测 proposal，执行前需要学生确认。',
      ),
    );
  }
  if (toolIds.includes('answer_course_question')) {
    addStep(
      makePublicTraceStep('answerer', '交给课程讲解', '把证据、缺口和回答要求交给课程答疑 agent。'),
    );
  }

  const handoffs = Array.isArray(response.trace?.handoffs) ? response.trace?.handoffs : [];
  for (const handoff of handoffs.slice(0, 2)) {
    addStep(
      makePublicTraceStep(
        `handoff-${handoff.id || handoff.to || steps.length}`,
        '交接给下一个 agent',
        handoff.reasonSummary || '已把上下文、证据和行为要求交给下一个 agent。',
        handoff.missingEvidence?.length
          ? [`缺少证据：${handoff.missingEvidence.slice(0, 3).join('、')}`]
          : undefined,
      ),
    );
  }

  const artifacts = response.artifacts || [];
  const reviewPlan = artifacts.find((artifact) => artifact.kind === 'review_plan');
  if (reviewPlan) {
    const record = payloadRecord(reviewPlan);
    const tasks = Array.isArray(record.tasks) ? record.tasks : [];
    addStep(
      makePublicTraceStep(
        'review-artifact',
        '产出知识点复习',
        `${payloadString(record.title, '复习计划')}：${tasks.length || 1} 个复习任务。`,
      ),
    );
  }
  const calendarDraft = artifacts.find((artifact) => artifact.kind === 'calendar_draft');
  if (calendarDraft) {
    const items = payloadRecord(calendarDraft).items;
    addStep(
      makePublicTraceStep(
        'calendar-artifact',
        '产生日程草稿',
        `生成 ${Array.isArray(items) ? items.length : 0} 个可加入日历的活动。`,
      ),
    );
  }

  return steps.slice(0, 8);
}

function announceLearningMemoryUpdated(label: string, descriptionPrefix = '记忆已更新') {
  const activityId = addMemoryActivity({
    title: '学习进度写入中',
    description: `学习进度：你现在定位在「${label}」。我会用它判断下一步该复习、预习还是练题。`,
    status: 'writing_study_memory',
    layer: 'study_memory',
    chips: ['课程', '进度'],
  });
  window.setTimeout(() => {
    updateMemoryActivity(activityId, {
      title: '学习进度已更新',
      description: `学习进度：${label}。${descriptionPrefix}，之后我会按这个位置安排复习、预习和练习。`,
      status: 'completed',
      layer: 'study_memory',
      chips: ['课程', '进度'],
    });
  }, 520);
}

function announceSyllabusScheduleUpdated(label: string) {
  const activityId = addMemoryActivity({
    title: '我正在整理课程安排',
    description: `我会记住「${label}」，之后提醒复习和规划任务时会参考它。`,
    status: 'writing_study_memory',
    layer: 'study_memory',
    chips: ['课程', '日程'],
  });
  window.setTimeout(() => {
    updateMemoryActivity(activityId, {
      title: '我已经记住这门课的安排',
      description: `「${label}」已经放进学习日历，之后计划会避开临近任务和考试。`,
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
  const base = `我根据你当前的学习状态开了一个${noun}：聚焦 ${concepts}，预计 ${plan.estimatedMinutes} 分钟，${count}。`;
  const rationale = plan.evidence?.rationale?.slice(0, 2) || [];
  if (!rationale.length) return base;
  return `${base}\n\n为什么这样排：\n${rationale.map((line, index) => `${index + 1}. ${line}`).join('\n')}`;
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

const MINI_LECTURE_CANVAS_WIDTH = 1000;
const MINI_LECTURE_CANVAS_HEIGHT = 562.5;
const MINI_LECTURE_MARKER_SIZE = 14;
const MINI_LECTURE_MARKER_COLORS = ['#ef4444', '#0ea5e9', '#10b981', '#f59e0b'] as const;

function compactLectureText(value: string, maxChars: number): string {
  const text = value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*]\([^)]*\)/g, (match) => match.replace(/^\[|\]\([^)]*\)$/g, ''))
    .replace(/[#>*_~|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapLectureLine(text: string, maxChars: number, maxLines: number): string[] {
  const normalized = compactLectureText(text, maxChars * maxLines * 2);
  const lines: string[] = [];
  let current = '';
  for (const char of normalized) {
    current += char;
    if (current.length >= maxChars) {
      lines.push(current.trim());
      current = '';
      if (lines.length >= maxLines) break;
    }
  }
  if (current.trim() && lines.length < maxLines) lines.push(current.trim());
  return lines.length ? lines : ['这一步先抓住核心关系。'];
}

function lectureSentences(text: string): string[] {
  return compactLectureText(text, 1600)
    .split(/(?<=[。！？!?；;])|\n+/)
    .map((item) => item.replace(/^\d+[.、)]\s*/, '').trim())
    .filter((item) => item.length >= 8)
    .slice(0, 8);
}

function miniLectureMarkerPoints(
  bbox: [number, number, number, number],
): MiniLectureRegion['markerPoints'] {
  const [x0, y0, x1, y1] = bbox;
  const half = MINI_LECTURE_MARKER_SIZE / 2;
  return [
    { x: x0 + half, y: y0 + half, corner: 'top-left' },
    { x: x1 - half, y: y0 + half, corner: 'top-right' },
    { x: x0 + half, y: y1 - half, corner: 'bottom-left' },
    { x: x1 - half, y: y1 - half, corner: 'bottom-right' },
  ];
}

function miniLectureRegion(args: {
  pageIndex: number;
  index: number;
  label: string;
  script: string;
  bbox: [number, number, number, number];
}): MiniLectureRegion {
  const color =
    MINI_LECTURE_MARKER_COLORS[args.index % MINI_LECTURE_MARKER_COLORS.length] ||
    MINI_LECTURE_MARKER_COLORS[0];
  return {
    id: `mini-lecture-p${args.pageIndex + 1}-focus-${args.index + 1}`,
    label: compactLectureText(args.label, 36),
    script: compactLectureText(args.script, 240),
    markerColorHex: color,
    bbox: args.bbox,
    markerPoints: miniLectureMarkerPoints(args.bbox),
  };
}

function miniLectureActions(page: MiniLecturePage): MiniLectureAction[] {
  return page.regions.flatMap((region) => [
    {
      id: `${region.id}-spotlight`,
      type: 'spotlight' as const,
      elementId: region.id,
      title: `聚焦：${region.label}`,
      dimOpacity: 0.62,
    },
    {
      id: `${region.id}-speech`,
      type: 'speech' as const,
      title: region.label,
      text: region.script,
    },
  ]);
}

function svgTextBlock(args: {
  text: string;
  x: number;
  y: number;
  maxChars: number;
  maxLines: number;
  fontSize: number;
  color?: string;
  weight?: number;
}) {
  const lines = wrapLectureLine(args.text, args.maxChars, args.maxLines);
  return `<text x="${args.x}" y="${args.y}" font-family="Microsoft YaHei, PingFang SC, Arial, sans-serif" font-size="${args.fontSize}" font-weight="${args.weight || 500}" fill="${args.color || '#0f172a'}">${lines
    .map(
      (line, index) =>
        `<tspan x="${args.x}" dy="${index === 0 ? 0 : args.fontSize * 1.45}">${xmlEscape(line)}</tspan>`,
    )
    .join('')}</text>`;
}

function miniLectureSlideDataUrl(args: {
  title: string;
  subtitle: string;
  regions: MiniLectureRegion[];
}) {
  const regionMarkup = args.regions
    .map((region, index) => {
      const [x0, y0, x1, y1] = region.bbox;
      const textX = x0 + 22;
      const textY = y0 + 42;
      const markerRects = region.markerPoints
        .map(
          (point) =>
            `<rect x="${point.x - MINI_LECTURE_MARKER_SIZE / 2}" y="${point.y - MINI_LECTURE_MARKER_SIZE / 2}" width="${MINI_LECTURE_MARKER_SIZE}" height="${MINI_LECTURE_MARKER_SIZE}" rx="2" fill="${region.markerColorHex}" opacity="0.95" />`,
        )
        .join('');
      return `
        <rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="20" fill="${index % 2 === 0 ? '#f8fafc' : '#f0fdfa'}" stroke="${region.markerColorHex}" stroke-opacity="0.18" />
        ${markerRects}
        ${svgTextBlock({
          text: region.label,
          x: textX,
          y: textY,
          maxChars: 22,
          maxLines: 1,
          fontSize: 24,
          color: '#0f172a',
          weight: 700,
        })}
        ${svgTextBlock({
          text: region.script,
          x: textX,
          y: textY + 38,
          maxChars: 34,
          maxLines: 3,
          fontSize: 18,
          color: '#334155',
          weight: 450,
        })}
      `;
    })
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${MINI_LECTURE_CANVAS_WIDTH}" height="${MINI_LECTURE_CANVAS_HEIGHT}" viewBox="0 0 ${MINI_LECTURE_CANVAS_WIDTH} ${MINI_LECTURE_CANVAS_HEIGHT}">
    <defs>
      <pattern id="miniGrid" width="28" height="28" patternUnits="userSpaceOnUse">
        <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#e2e8f0" stroke-width="1" opacity="0.45" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="#fffdf8" />
    <rect width="100%" height="100%" fill="url(#miniGrid)" />
    <rect x="34" y="28" width="932" height="506" rx="28" fill="#ffffff" opacity="0.72" />
    ${svgTextBlock({
      text: args.title,
      x: 70,
      y: 72,
      maxChars: 24,
      maxLines: 1,
      fontSize: 30,
      color: '#0f172a',
      weight: 800,
    })}
    ${svgTextBlock({
      text: args.subtitle,
      x: 72,
      y: 108,
      maxChars: 42,
      maxLines: 1,
      fontSize: 15,
      color: '#64748b',
      weight: 500,
    })}
    ${regionMarkup}
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function miniLecturePage(args: {
  deckId: string;
  pageIndex: number;
  title: string;
  subtitle: string;
  regions: MiniLectureRegion[];
}): MiniLecturePage {
  const page: MiniLecturePage = {
    id: `${args.deckId}-page-${args.pageIndex + 1}`,
    title: args.title,
    imageDataUrl: miniLectureSlideDataUrl({
      title: args.title,
      subtitle: args.subtitle,
      regions: args.regions,
    }),
    regions: args.regions,
    actions: [],
  };
  return { ...page, actions: miniLectureActions(page) };
}

function isMiniLectureCandidate(question: string, answer: string): boolean {
  if (answer.trim().length < 120) return false;
  if (
    /(学到哪里|学习状态|当前状态|进度|复习计划|学习计划|刷题计划|小测|quiz|test)/i.test(question)
  ) {
    return false;
  }
  return /(讲解|解释|说明|为什么|怎么理解|怎么做|如何做|题目|这道题|证明|推导|公式|概念|知识点|错在哪|哪里错|step|explain|why|prove|problem)/i.test(
    question,
  );
}

function buildMiniLecturePrompt(args: {
  question: string;
  answer: string;
  course: CourseRecord;
}): MiniLecturePrompt | undefined {
  if (!isMiniLectureCandidate(args.question, args.answer)) return undefined;
  const titleSource = compactLectureText(args.question, 42) || '课堂讲解';
  return {
    id: makeClientId('mini-lecture-prompt'),
    title: titleSource,
    question: compactLectureText(args.question, 900),
    answer: compactLectureText(args.answer, 2200),
    courseName: args.course.name,
    createdAt: Date.now(),
  };
}

function buildMiniLectureDeck(prompt: MiniLecturePrompt): MiniLectureDeck {
  const deckId = makeClientId('mini-lecture');
  const sentences = lectureSentences(prompt.answer);
  const first = sentences[0] || '先把题目的目标翻译成一句可以操作的话。';
  const second = sentences[1] || '再找出关键条件，决定先用定义、公式还是例子。';
  const third = sentences[2] || '最后把推理链条补完整，检查每一步是否回应题目。';
  const fourth = sentences[3] || sentences[2] || '讲完后做一个小检查，确认自己能复述方法。';
  const title = compactLectureText(prompt.title, 28) || '课堂讲解';
  const pageOneRegions = [
    miniLectureRegion({
      pageIndex: 0,
      index: 0,
      label: '题目抓手',
      script: `先看题目在问什么：${compactLectureText(prompt.question, 120)}`,
      bbox: [70, 130, 930, 220],
    }),
    miniLectureRegion({
      pageIndex: 0,
      index: 1,
      label: '核心思路',
      script: first,
      bbox: [70, 244, 930, 346],
    }),
    miniLectureRegion({
      pageIndex: 0,
      index: 2,
      label: '第一步怎么落地',
      script: second,
      bbox: [70, 370, 930, 484],
    }),
  ];
  const pages: MiniLecturePage[] = [
    miniLecturePage({
      deckId,
      pageIndex: 0,
      title,
      subtitle: `${prompt.courseName} · 迷你课堂讲解`,
      regions: pageOneRegions,
    }),
  ];

  if (sentences.length >= 3 || prompt.answer.length > 520) {
    const pageTwoRegions = [
      miniLectureRegion({
        pageIndex: 1,
        index: 0,
        label: '容易卡住的地方',
        script: third,
        bbox: [70, 140, 930, 258],
      }),
      miniLectureRegion({
        pageIndex: 1,
        index: 1,
        label: '检查答案',
        script: fourth,
        bbox: [70, 290, 930, 410],
      }),
    ];
    pages.push(
      miniLecturePage({
        deckId,
        pageIndex: 1,
        title: '把讲解收束成检查清单',
        subtitle: `${prompt.courseName} · 最后一页`,
        regions: pageTwoRegions,
      }),
    );
  }

  return {
    id: deckId,
    title,
    sourceQuestion: prompt.question,
    sourceAnswer: prompt.answer,
    pages,
    markerProtocol: {
      type: 'corner-square-markers',
      markerSizePx: MINI_LECTURE_MARKER_SIZE,
      markerCountPerComponent: 4,
      recoveredFrom: 'client-mini-lecture',
    },
    createdAt: Date.now(),
  };
}

function uniquePlanStrings(values: Array<string | undefined | null>, limit = 12): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = (value || '').replace(/\s+/g, ' ').trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized.slice(0, 80));
    if (output.length >= limit) break;
  }
  return output;
}

function reviewPlanScheduleEvents(syllabusEvents: SyllabusCalendarEvent[]): Array<{
  id: string;
  title: string;
  date: string;
  kind: SyllabusEventKind;
  sourceName: string;
  notes?: string;
}> {
  return syllabusEvents.map((event) => {
    const notes = [event.week, event.sourceColumn, event.rawText]
      .filter((item): item is string => Boolean(item?.trim()))
      .join('\n');
    return {
      id: event.id,
      title: event.title,
      date: event.date,
      kind: event.kind,
      sourceName: event.sourceName,
      notes: notes || undefined,
    };
  });
}

function reviewQuestionDifficultyBucket(difficulty: string): keyof PracticePlan['difficultyMix'] {
  const normalized = difficulty.toLowerCase();
  if (/hard|advanced|challenge|difficult|困难|挑战|高/.test(normalized)) return 'hard';
  if (/easy|beginner|basic|基础|简单|入门|低/.test(normalized)) return 'easy';
  return 'medium';
}

function difficultyMixFromReviewQuestions(
  questions: TeachingReviewQuestionCandidate[],
  fallbackCount: number,
): PracticePlan['difficultyMix'] {
  const mix = { easy: 0, medium: 0, hard: 0 };
  for (const question of questions) {
    mix[reviewQuestionDifficultyBucket(question.difficulty)] += 1;
  }
  const selectedCount = mix.easy + mix.medium + mix.hard;
  if (selectedCount > 0) return mix;
  const count = Math.max(1, fallbackCount);
  const easy = Math.max(1, Math.round(count * 0.35));
  const hard = count >= 4 ? Math.max(1, Math.round(count * 0.15)) : 0;
  return { easy, medium: Math.max(0, count - easy - hard), hard };
}

async function requestTeachingReviewPlan(args: {
  courseId: string;
  prompt: string;
  conversationId: string;
  syllabusEvents: SyllabusCalendarEvent[];
  mode: PracticePlanMode;
  questionCount?: number;
}): Promise<TeachingReviewPlanResponse> {
  const questionCount = Math.max(
    1,
    Math.min(args.questionCount ?? (args.mode === 'quiz' ? 10 : 8), 20),
  );
  return backendJson<TeachingReviewPlanResponse>('/api/teaching/review-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetType: 'course',
      targetId: args.courseId,
      query: args.prompt,
      conversationId: args.conversationId,
      scheduleEvents: reviewPlanScheduleEvents(args.syllabusEvents),
      constraints: {
        today: localDayKey(new Date()),
        questionCount,
        totalMinutes: args.mode === 'quiz' ? Math.max(25, questionCount * 3) : 45,
        maxTasks: 4,
      },
    }),
  });
}

function practicePlanFromTeachingReviewDecision(args: {
  response: TeachingReviewPlanResponse;
  userId: string;
  course: CourseRecord;
  mode: PracticePlanMode;
  prompt: string;
  state: LearnerCourseState;
  snapshot: LearnerCourseSnapshot;
  targetCount?: number;
}): PracticePlan {
  const { decision } = args.response;
  const output = decision.output;
  const problemIds = uniquePlanStrings(
    [
      ...output.questionCandidates.map((question) => question.problemId),
      ...output.tasks.flatMap((task) => task.problemIds),
    ],
    args.targetCount ?? (args.mode === 'quiz' ? 10 : 8),
  );
  const targetConcepts = uniquePlanStrings(
    [
      ...decision.targetConcepts,
      ...output.tasks.flatMap((task) => task.concepts),
      ...output.questionCandidates.flatMap((question) => question.tags),
      ...args.snapshot.weakConcepts,
      ...args.snapshot.nextConcepts,
    ],
    6,
  );
  const evidenceIdSet = new Set(
    [
      ...output.tasks.flatMap((task) => task.evidenceIds),
      ...output.questionCandidates.flatMap((question) => question.evidenceIds),
    ].filter(Boolean),
  );
  const evidenceItems = decision.evidence.items
    .filter((item) => evidenceIdSet.size === 0 || evidenceIdSet.has(item.id))
    .slice(0, 14)
    .map((item) => ({
      id: item.id,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      title: item.title,
      reason: item.reason,
      excerpt: item.excerpt,
    }));
  const now = Date.now();
  const concepts = targetConcepts.length ? targetConcepts : ['课程综合复习'];
  const title =
    args.mode === 'quiz'
      ? `${args.course.courseCode || args.course.name} 证据化小测`
      : `${concepts.slice(0, 2).join(' + ')} 复习计划`;

  return savePracticePlan({
    version: 1,
    id: makeClientId(args.mode === 'quiz' ? 'quiz' : 'practice'),
    userId: args.userId || 'anonymous',
    courseId: args.course.id,
    courseName: args.course.name,
    mode: args.mode,
    title,
    targetConcepts: concepts,
    problemIds,
    estimatedMinutes:
      output.estimatedMinutes || (args.mode === 'quiz' ? Math.max(15, problemIds.length * 3) : 45),
    difficultyMix: difficultyMixFromReviewQuestions(output.questionCandidates, problemIds.length),
    createdFrom: {
      currentNotebookId: args.snapshot.currentNotebook?.id || args.state.currentNotebookId,
      currentNotebookName: args.snapshot.currentNotebook?.name || args.state.currentSectionLabel,
      weakPoints: args.snapshot.weakConcepts,
      recentAttemptProblemIds: uniquePlanStrings(
        args.state.recentProblemAttempts.map((attempt) => attempt.problemId),
        8,
      ),
      prompt: args.prompt.trim().slice(0, 600),
    },
    status: 'active',
    createdAt: now,
    updatedAt: now,
    evidence: {
      decisionId: decision.id,
      rationale: uniquePlanStrings(
        [...decision.userFacingRationale, ...output.rationale, output.summary],
        8,
      ),
      gaps: uniquePlanStrings(
        [
          ...output.evidenceGaps,
          ...decision.evidence.gaps.map((gap) => `${gap.reason} ${gap.fallback}`),
        ],
        4,
      ),
      items: evidenceItems,
    },
  });
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

function scheduleEventLabel(kind: SyllabusEventKind, isResearchCourse: boolean): string {
  const options = isResearchCourse ? RESEARCH_EVENT_KIND_OPTIONS : SYLLABUS_EVENT_KIND_OPTIONS;
  return options.find((option) => option.value === kind)?.label || syllabusEventLabel(kind);
}

function buildCalendarActivityStartText(args: {
  event: SyllabusCalendarEvent;
  course: CourseRecord | null;
  isResearchCourse: boolean;
}): string {
  const eventLabel = scheduleEventLabel(args.event.kind, args.isResearchCourse);
  const duration = args.event.durationMinutes ? ` · ${args.event.durationMinutes} 分钟` : '';
  const source = args.event.rawText ? `\n依据：${args.event.rawText}` : '';
  const courseLabel = args.course?.courseCode || args.course?.name || '这门课';
  if (args.isResearchCourse) {
    return `开始最近活动：${args.event.title}\n\n${args.event.date} · ${eventLabel}${duration}${source}\n\n建议这次先这样推进：\n1. 用 5 分钟明确这次要产出的东西。\n2. 用主要时间完成活动本身，不重新规划。\n3. 结束时记录一个结果或阻塞点，方便下次接着推进。`;
  }
  return `开始最近活动：${args.event.title}\n\n${args.event.date} · ${eventLabel}${duration} · ${courseLabel}${source}\n\n建议这次先这样学：\n1. 用 5 分钟回看相关定义或例题。\n2. 用主要时间完成这项活动本身，不重新生成计划。\n3. 最后记录一个错因、一个还不稳的点，之后我可以据此更新薄弱点。`;
}

function activeActivityArtifactFromEvent(args: {
  event: SyllabusCalendarEvent;
  course: CourseRecord | null;
}): Extract<LearnArtifact, { kind: 'active_activity' }> {
  return {
    kind: 'active_activity',
    id: makeClientId('active-activity'),
    activityId: args.event.id,
    title: args.event.title,
    date: args.event.date,
    source: 'calendar',
    sourceId: args.event.id,
    courseId: args.course?.id,
    courseCode: args.course?.courseCode,
    courseName: args.course?.name,
    eventKind: args.event.kind,
    durationMinutes: args.event.durationMinutes,
    origin: args.event.origin || 'syllabus',
    rawText: args.event.rawText || undefined,
    startedAt: Date.now(),
  };
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

function validDraftDate(value: unknown): string | undefined {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
    ? value.trim()
    : undefined;
}

function learnCalendarDraftItemFromRecord(
  raw: Record<string, unknown>,
  fallbackIndex = 0,
): LearnCalendarDraftItem | null {
  const title =
    payloadString(raw.title) ||
    payloadString(raw.label) ||
    payloadString(raw.summary) ||
    `学习安排 ${fallbackIndex + 1}`;
  if (!title.trim()) return null;
  const duration =
    typeof raw.durationMinutes === 'number' && Number.isFinite(raw.durationMinutes)
      ? Math.max(5, Math.round(raw.durationMinutes))
      : undefined;
  return {
    id: payloadString(raw.id) || undefined,
    eventId: payloadString(raw.eventId) || undefined,
    title: title.slice(0, 120),
    date: validDraftDate(raw.date) || validDraftDate(raw.day),
    start: payloadString(raw.start) || undefined,
    durationMinutes: duration,
    courseId: payloadString(raw.courseId) || undefined,
    reason: payloadString(raw.reason) || payloadString(raw.summary) || undefined,
  };
}

function normalizeAnswerEvidenceSource(raw: unknown): LearnAnswerEvidenceSource | null {
  const record = payloadRecord(raw);
  const title = payloadString(record.title) || payloadString(record.sourceId) || '证据来源';
  if (!title.trim()) return null;
  const sourceType = payloadString(record.sourceType);
  return {
    sourceType:
      sourceType === 'notebook' ||
      sourceType === 'memory' ||
      sourceType === 'problem_bank' ||
      sourceType === 'calendar' ||
      sourceType === 'web' ||
      sourceType === 'user' ||
      sourceType === 'system'
        ? sourceType
        : 'source',
    id: payloadString(record.id) || undefined,
    sourceId: payloadString(record.sourceId) || undefined,
    notebookId: payloadString(record.notebookId) || null,
    title: title.slice(0, 160),
    previewText:
      payloadString(record.previewText) ||
      payloadString(record.renderedText).slice(0, 900) ||
      payloadString(record.originalText).slice(0, 900) ||
      undefined,
    score: typeof record.score === 'number' ? record.score : undefined,
    metadata: payloadRecord(record.metadata),
  };
}

function normalizeLearnArtifact(raw: unknown): LearnArtifact | null {
  const record = payloadRecord(raw);
  const kind = payloadString(record.kind);
  const id = payloadString(record.id) || makeClientId('artifact');

  if (kind === 'activity_plan') {
    const title = payloadString(record.title) || '学习活动计划';
    const planType = payloadString(record.planType);
    const tasks = Array.isArray(record.tasks)
      ? record.tasks
          .map((task) => payloadRecord(task))
          .map((task, index) => {
            const taskKind = payloadString(task.kind);
            const normalizedKind: LearnActivityPlanTask['kind'] =
              taskKind === 'review' ||
              taskKind === 'preview' ||
              taskKind === 'practice' ||
              taskKind === 'reading' ||
              taskKind === 'reflection' ||
              taskKind === 'catch_up' ||
              taskKind === 'other'
                ? taskKind
                : undefined;
            return {
              title: payloadString(task.title) || `活动 ${index + 1}`,
              kind: normalizedKind,
              concepts: Array.isArray(task.concepts)
                ? task.concepts
                    .map((item) => String(item))
                    .filter(Boolean)
                    .slice(0, 8)
                : undefined,
              minutes: typeof task.minutes === 'number' ? task.minutes : undefined,
              reason: payloadString(task.reason) || undefined,
            };
          })
          .filter((task) => task.title)
          .slice(0, 16)
      : [];
    const calendarDraftItems = Array.isArray(record.calendarDraftItems)
      ? record.calendarDraftItems
          .map((item, index) => learnCalendarDraftItemFromRecord(payloadRecord(item), index))
          .filter((item): item is LearnCalendarDraftItem => Boolean(item))
      : undefined;
    const evidence = Array.isArray(record.evidence)
      ? record.evidence
          .map((source) => normalizeAnswerEvidenceSource(source))
          .filter(
            (source): source is NonNullable<ReturnType<typeof normalizeAnswerEvidenceSource>> =>
              Boolean(source),
          )
          .slice(0, 12)
      : undefined;
    const rawScope = payloadRecord(record.scope);
    const scope = rawScope
      ? {
          label: payloadString(rawScope.label) || undefined,
          startDate: payloadString(rawScope.startDate) || undefined,
          endDate: payloadString(rawScope.endDate) || undefined,
          eventIds: Array.isArray(rawScope.eventIds)
            ? rawScope.eventIds
                .map((item) => String(item))
                .filter(Boolean)
                .slice(0, 80)
            : undefined,
          rationale: payloadString(rawScope.rationale) || undefined,
        }
      : undefined;
    if (!tasks.length && !calendarDraftItems?.length) return null;
    return {
      kind,
      id,
      title,
      planType:
        planType === 'preview' || planType === 'study' || planType === 'catch_up'
          ? planType
          : 'review',
      tasks,
      calendarDraftItems,
      evidence,
      scope,
    };
  }

  if (kind === 'calendar_draft') {
    const items = Array.isArray(record.items)
      ? record.items
          .map((item, index) => learnCalendarDraftItemFromRecord(payloadRecord(item), index))
          .filter((item): item is LearnCalendarDraftItem => Boolean(item))
      : [];
    if (!items.length) return null;
    return {
      kind,
      id,
      title: payloadString(record.title) || '日历草稿',
      items,
      sourceArtifactId: payloadString(record.sourceArtifactId) || undefined,
    };
  }

  if (kind === 'active_activity') {
    const title = payloadString(record.title);
    const date = payloadString(record.date);
    if (!title || !date) return null;
    const source = payloadString(record.source);
    const eventKind = payloadString(record.eventKind);
    const origin = payloadString(record.origin);
    return {
      kind,
      id,
      activityId: payloadString(record.activityId) || payloadString(record.sourceId) || id,
      title,
      date,
      source: source === 'plan' || source === 'manual' ? source : 'calendar',
      sourceId: payloadString(record.sourceId) || undefined,
      courseId: payloadString(record.courseId) || undefined,
      courseCode: payloadString(record.courseCode) || undefined,
      courseName: payloadString(record.courseName) || undefined,
      eventKind:
        eventKind === 'assignment' ||
        eventKind === 'exam' ||
        eventKind === 'progress' ||
        eventKind === 'tutorial' ||
        eventKind === 'holiday' ||
        eventKind === 'other'
          ? eventKind
          : undefined,
      durationMinutes:
        typeof record.durationMinutes === 'number' ? record.durationMinutes : undefined,
      origin:
        origin === 'syllabus' ||
        origin === 'ai_plan' ||
        origin === 'manual' ||
        origin === 'practice' ||
        origin === 'exam_prep'
          ? origin
          : undefined,
      rawText: payloadString(record.rawText) || undefined,
      startedAt: typeof record.startedAt === 'number' ? record.startedAt : undefined,
    };
  }

  if (kind === 'image_prompt_draft') {
    const prompt = payloadString(record.prompt);
    if (!prompt) return null;
    const aspectRatio = payloadString(record.aspectRatio);
    return {
      kind,
      id,
      prompt,
      aspectRatio:
        aspectRatio === '16:9' ||
        aspectRatio === '4:3' ||
        aspectRatio === '1:1' ||
        aspectRatio === '9:16'
          ? aspectRatio
          : undefined,
      sourceQuestion: payloadString(record.sourceQuestion) || undefined,
      imageUrl: payloadString(record.imageUrl) || undefined,
      width: typeof record.width === 'number' ? record.width : undefined,
      height: typeof record.height === 'number' ? record.height : undefined,
    };
  }

  if (kind === 'web_search_result') {
    const query = payloadString(record.query);
    if (!query) return null;
    const sources = Array.isArray(record.sources)
      ? record.sources
          .map((source) => payloadRecord(source))
          .map((source) => ({
            title: payloadString(source.title) || payloadString(source.url) || '网页来源',
            url: payloadString(source.url),
            content: payloadString(source.content) || undefined,
            score: typeof source.score === 'number' ? source.score : undefined,
          }))
          .filter((source) => source.url)
          .slice(0, 8)
      : [];
    return {
      kind,
      id,
      query,
      sources,
      answer: payloadString(record.answer) || undefined,
      usedFor: payloadString(record.usedFor) || undefined,
    };
  }

  if (kind === 'memory_candidate') {
    const summary = payloadString(record.summary);
    const memoryType = payloadString(record.memoryType);
    if (!summary) return null;
    return {
      kind,
      id,
      memoryType:
        memoryType === 'mastery' ||
        memoryType === 'progress' ||
        memoryType === 'preference' ||
        memoryType === 'correction' ||
        memoryType === 'next_step'
          ? memoryType
          : 'weakness',
      summary,
      evidence: Array.isArray(record.evidence)
        ? record.evidence
            .map((item) => String(item))
            .filter(Boolean)
            .slice(0, 8)
        : undefined,
    };
  }

  if (kind === 'answer_evidence') {
    const sources = Array.isArray(record.sources)
      ? record.sources
          .map((source) => normalizeAnswerEvidenceSource(source))
          .filter((source): source is LearnAnswerEvidenceSource => Boolean(source))
          .slice(0, 16)
      : [];
    if (!sources.length) return null;
    return {
      kind,
      id,
      title: payloadString(record.title) || undefined,
      usedFor: payloadString(record.usedFor) || undefined,
      sources,
    };
  }

  if (kind === 'review_plan') {
    const title = payloadString(record.title) || '复习计划';
    const tasks = Array.isArray(record.tasks)
      ? record.tasks
          .map((task) => payloadRecord(task))
          .map((task, index) => ({
            title: payloadString(task.title) || `任务 ${index + 1}`,
            concepts: Array.isArray(task.concepts)
              ? task.concepts
                  .map((item) => String(item))
                  .filter(Boolean)
                  .slice(0, 8)
              : undefined,
            minutes: typeof task.minutes === 'number' ? task.minutes : undefined,
            reason: payloadString(task.reason) || undefined,
          }))
          .filter((task) => task.title)
          .slice(0, 12)
      : [];
    const calendarDraftItems = Array.isArray(record.calendarDraftItems)
      ? record.calendarDraftItems
          .map((item, index) => learnCalendarDraftItemFromRecord(payloadRecord(item), index))
          .filter((item): item is LearnCalendarDraftItem => Boolean(item))
      : undefined;
    if (!tasks.length && !calendarDraftItems?.length) return null;
    return { kind, id, title, tasks, calendarDraftItems };
  }

  return null;
}

function answerEvidenceArtifactFromCourseContext(args: {
  courseContext?: CourseChatContext;
  question: string;
}): Extract<LearnArtifact, { kind: 'answer_evidence' }> | null {
  const memory = args.courseContext?.layeredMemory;
  if (!memory) return null;
  const sources: LearnAnswerEvidenceSource[] = [];

  for (const source of memory.sourceEvidence || []) {
    const sourcePreview = (source.renderedText || source.originalText || '').trim();
    if (
      /学生消息|student message/i.test(source.title || '') ||
      /助手回复|assistant reply/i.test(source.title || '') ||
      /^学生消息[:：]/.test(sourcePreview) ||
      /^助手回复[:：]/.test(sourcePreview)
    ) {
      continue;
    }
    sources.push({
      sourceType: 'source',
      id: source.id,
      sourceId: source.sourceId,
      notebookId: source.notebookId ?? null,
      title: source.title || '原文证据',
      previewText: sourcePreview.slice(0, 900),
      score: typeof source.score === 'number' ? source.score : undefined,
      metadata: {
        ...(source.metadata || {}),
        evidenceType: source.sourceType,
      },
    });
  }

  for (const match of memory.knowledgeMatches || []) {
    sources.push({
      sourceType: 'problem_bank',
      id: match.id,
      title: match.title || '题库匹配',
      previewText: (match.text || '').trim().slice(0, 700),
      metadata: match.metadata || {},
    });
  }

  for (const match of memory.semanticMatches || []) {
    sources.push({
      sourceType: 'memory',
      id: match.id,
      title: match.title || '语义记忆',
      previewText: (match.summary || match.text || '').trim().slice(0, 700),
      metadata: match.source ? { source: match.source } : undefined,
    });
  }

  for (const cache of memory.knowledgeCache || []) {
    sources.push({
      sourceType: cache.sourceType === 'problem' ? 'problem_bank' : 'source',
      id: cache.id,
      title: cache.title || '知识缓存',
      previewText: (cache.previewText || '').trim().slice(0, 700),
      metadata: {
        sourceType: cache.sourceType,
        hitCount: cache.hitCount,
        lastAccessedAt: cache.lastAccessedAt,
      },
    });
  }

  const deduped = sources.filter(
    (source, index, all) =>
      all.findIndex(
        (item) =>
          item.sourceType === source.sourceType &&
          (item.id || item.sourceId || item.title) ===
            (source.id || source.sourceId || source.title),
      ) === index,
  );
  if (!deduped.length) return null;
  return {
    kind: 'answer_evidence',
    id: makeClientId('answer-evidence'),
    title: '本次回答证据',
    usedFor: args.question.slice(0, 160),
    sources: deduped.slice(0, 16),
  };
}

function practicePlanCalendarDraftItems(plan: PracticePlan): LearnCalendarDraftItem[] {
  const concepts = plan.targetConcepts.length ? plan.targetConcepts : [plan.title];
  const count = Math.min(7, Math.max(1, concepts.length));
  const minutes = Math.max(20, Math.ceil(plan.estimatedMinutes / count));
  return concepts.slice(0, count).map((concept, index) => ({
    id: makeClientId('calendar-draft-item'),
    title: `${plan.mode === 'quiz' ? '小测' : '练习'}：${concept}`,
    date: localDayKey(addCalendarDays(new Date(), index)),
    durationMinutes: minutes,
    courseId: plan.courseId,
    reason: `来自计划「${plan.title}」`,
  }));
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

const learnAssistantActionCardWidthClassName = 'w-full max-w-none';
const learnHomeGlowCardBaseClassName =
  'relative overflow-hidden border border-[#A9E7FF]/45 bg-[#f7fbfd]/90 shadow-[0_22px_64px_rgba(47,143,201,0.14),0_2px_14px_rgba(16,56,50,0.06)] ring-1 ring-white/55 dark:border-white/10 dark:bg-slate-950 dark:ring-white/5';
const learnHomeGlowSheenClassName =
  'absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.42),rgba(255,255,255,0.2)_54%,rgba(255,255,255,0.04))] dark:bg-[linear-gradient(115deg,rgba(2,6,23,0.42),rgba(15,23,42,0.34)_54%,rgba(15,23,42,0.18))]';
const learnHomeGlowSurfaceClassNames = {
  lecture:
    'bg-[radial-gradient(circle_at_18%_18%,rgba(169,231,255,0.58),transparent_34%),radial-gradient(circle_at_86%_22%,rgba(169,240,220,0.5),transparent_32%),radial-gradient(circle_at_76%_82%,rgba(206,198,255,0.3),transparent_36%),#f7fbfd] dark:bg-[radial-gradient(circle_at_18%_18%,rgba(169,231,255,0.18),transparent_36%),radial-gradient(circle_at_86%_22%,rgba(169,240,220,0.16),transparent_34%),radial-gradient(circle_at_76%_82%,rgba(206,198,255,0.14),transparent_36%),#020617]',
  quiz: 'bg-[radial-gradient(circle_at_18%_18%,rgba(169,231,255,0.66),transparent_34%),radial-gradient(circle_at_84%_18%,rgba(206,198,255,0.52),transparent_32%),radial-gradient(circle_at_76%_84%,rgba(169,240,220,0.28),transparent_35%),#f7fbfd] dark:bg-[radial-gradient(circle_at_18%_18%,rgba(169,231,255,0.2),transparent_36%),radial-gradient(circle_at_84%_18%,rgba(206,198,255,0.19),transparent_34%),radial-gradient(circle_at_76%_84%,rgba(169,240,220,0.12),transparent_36%),#020617]',
  practice:
    'bg-[radial-gradient(circle_at_22%_20%,rgba(169,240,220,0.62),transparent_34%),radial-gradient(circle_at_82%_18%,rgba(169,231,255,0.48),transparent_32%),radial-gradient(circle_at_72%_82%,rgba(206,198,255,0.26),transparent_36%),#f7fbfd] dark:bg-[radial-gradient(circle_at_22%_20%,rgba(169,240,220,0.19),transparent_36%),radial-gradient(circle_at_82%_18%,rgba(169,231,255,0.16),transparent_34%),radial-gradient(circle_at_72%_82%,rgba(206,198,255,0.12),transparent_36%),#020617]',
  progress:
    'bg-[radial-gradient(circle_at_18%_24%,rgba(255,154,154,0.34),transparent_34%),radial-gradient(circle_at_84%_18%,rgba(206,198,255,0.5),transparent_32%),radial-gradient(circle_at_72%_78%,rgba(169,231,255,0.34),transparent_36%),#f7fbfd] dark:bg-[radial-gradient(circle_at_18%_24%,rgba(255,154,154,0.16),transparent_36%),radial-gradient(circle_at_84%_18%,rgba(206,198,255,0.18),transparent_34%),radial-gradient(circle_at_72%_78%,rgba(169,231,255,0.14),transparent_36%),#020617]',
} as const;
const learnHomeGlowBloomClassNames = {
  lecture:
    'bg-[radial-gradient(circle_at_16%_8%,rgba(169,231,255,0.94),transparent_34%),radial-gradient(circle_at_88%_10%,rgba(169,240,220,0.78),transparent_32%),radial-gradient(circle_at_78%_88%,rgba(206,198,255,0.5),transparent_38%)] dark:bg-[radial-gradient(circle_at_16%_8%,rgba(169,231,255,0.34),transparent_36%),radial-gradient(circle_at_88%_10%,rgba(169,240,220,0.26),transparent_34%),radial-gradient(circle_at_78%_88%,rgba(206,198,255,0.2),transparent_40%)]',
  quiz: 'bg-[radial-gradient(circle_at_14%_6%,rgba(169,231,255,0.98),transparent_34%),radial-gradient(circle_at_88%_8%,rgba(206,198,255,0.84),transparent_34%),radial-gradient(circle_at_78%_88%,rgba(169,240,220,0.42),transparent_40%)] dark:bg-[radial-gradient(circle_at_14%_6%,rgba(169,231,255,0.36),transparent_36%),radial-gradient(circle_at_88%_8%,rgba(206,198,255,0.3),transparent_36%),radial-gradient(circle_at_78%_88%,rgba(169,240,220,0.16),transparent_42%)]',
  practice:
    'bg-[radial-gradient(circle_at_16%_8%,rgba(169,240,220,0.98),transparent_34%),radial-gradient(circle_at_86%_10%,rgba(169,231,255,0.78),transparent_34%),radial-gradient(circle_at_76%_88%,rgba(206,198,255,0.42),transparent_40%)] dark:bg-[radial-gradient(circle_at_16%_8%,rgba(169,240,220,0.34),transparent_36%),radial-gradient(circle_at_86%_10%,rgba(169,231,255,0.26),transparent_36%),radial-gradient(circle_at_76%_88%,rgba(206,198,255,0.16),transparent_42%)]',
  progress:
    'bg-[radial-gradient(circle_at_14%_12%,rgba(255,154,154,0.82),transparent_34%),radial-gradient(circle_at_88%_8%,rgba(206,198,255,0.9),transparent_34%),radial-gradient(circle_at_74%_86%,rgba(169,231,255,0.52),transparent_40%)] dark:bg-[radial-gradient(circle_at_14%_12%,rgba(255,154,154,0.28),transparent_36%),radial-gradient(circle_at_88%_8%,rgba(206,198,255,0.32),transparent_36%),radial-gradient(circle_at_74%_86%,rgba(169,231,255,0.2),transparent_42%)]',
} as const;

function LearnHomeGlowLayers({
  variant,
}: {
  variant: keyof typeof learnHomeGlowSurfaceClassNames;
}) {
  return (
    <>
      <div
        className={cn('absolute inset-0', learnHomeGlowSurfaceClassNames[variant])}
        aria-hidden
      />
      <div
        className={cn(
          'absolute -inset-12 opacity-90 blur-2xl saturate-150',
          learnHomeGlowBloomClassNames[variant],
        )}
        aria-hidden
      />
      <div className={learnHomeGlowSheenClassName} aria-hidden />
      <div className="absolute inset-x-0 top-0 h-px bg-white/80 dark:bg-white/15" aria-hidden />
    </>
  );
}

function miniLectureRegionStyle(region: MiniLectureRegion) {
  const [x0, y0, x1, y1] = region.bbox;
  return {
    left: `${(x0 / MINI_LECTURE_CANVAS_WIDTH) * 100}%`,
    top: `${(y0 / MINI_LECTURE_CANVAS_HEIGHT) * 100}%`,
    width: `${((x1 - x0) / MINI_LECTURE_CANVAS_WIDTH) * 100}%`,
    height: `${((y1 - y0) / MINI_LECTURE_CANVAS_HEIGHT) * 100}%`,
  };
}

function MiniLectureInviteCard({
  prompt,
  deck,
  generating,
  onGenerate,
  onOpen,
}: {
  prompt?: MiniLecturePrompt;
  deck?: MiniLectureDeck;
  generating: boolean;
  onGenerate: () => void;
  onOpen: (deck: MiniLectureDeck) => void;
}) {
  if (!prompt && !deck) return null;
  return (
    <div
      className={cn(
        learnAssistantActionCardWidthClassName,
        'mt-3 flex flex-col gap-2 border-t border-slate-200/80 pt-3 text-sm dark:border-white/10',
      )}
    >
      <div
        className={cn(
          learnHomeGlowCardBaseClassName,
          'flex flex-col gap-2 rounded-[16px] px-3.5 py-3',
        )}
      >
        <LearnHomeGlowLayers variant="lecture" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
              需要生成课堂讲解吗？
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
              {deck
                ? `已生成 ${deck.pages.length} 页迷你课堂，可以直接打开观看。`
                : '我可以把这段讲解压成一两页图片课堂，配合移动遮罩和语音播放。'}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-[#2F8FC9] ring-1 ring-[#A9E7FF]/65 dark:bg-white/10 dark:text-[#A9E7FF] dark:ring-[#A9E7FF]/20">
            {deck ? `${deck.pages.length} 页` : '1-2 页'}
          </span>
        </div>
        <div className="relative flex flex-wrap gap-2">
          {deck ? (
            <Button
              type="button"
              size="sm"
              className="h-8 gap-2 rounded-full bg-[#103832] px-3 text-xs text-white hover:bg-[#15574d] dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
              onClick={() => onOpen(deck)}
            >
              <Play className="size-3.5" />
              进入课堂
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              className="h-8 gap-2 rounded-full bg-[#103832] px-3 text-xs text-white hover:bg-[#15574d] dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
              onClick={onGenerate}
              disabled={generating}
            >
              {generating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <BookOpenCheck className="size-3.5" />
              )}
              {generating ? '生成中' : '生成课堂讲解'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniLectureClassroomDialog({
  deck,
  open,
  onOpenChange,
}: {
  deck: MiniLectureDeck | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pageIndex, setPageIndex] = useState(0);
  const [actionIndex, setActionIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [activeRegionId, setActiveRegionId] = useState<string | null>(null);
  const [speechText, setSpeechText] = useState('');
  const timeoutRef = useRef<number | null>(null);
  const playbackRef = useRef(0);

  const page = deck?.pages[Math.max(0, Math.min(pageIndex, (deck?.pages.length || 1) - 1))] || null;
  const activeRegion = page?.regions.find((region) => region.id === activeRegionId) || null;
  const canPrev = pageIndex > 0;
  const canNext = Boolean(deck && pageIndex < deck.pages.length - 1);

  const stopPlayback = useCallback(() => {
    playbackRef.current += 1;
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (typeof window !== 'undefined') {
      window.speechSynthesis?.cancel();
    }
    setPlaying(false);
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (!open) {
        stopPlayback();
        return;
      }
      setPageIndex(0);
      setActionIndex(0);
      setActiveRegionId(null);
      setSpeechText('');
    }, 0);
    return () => window.clearTimeout(handle);
  }, [deck?.id, open, stopPlayback]);

  useEffect(() => {
    if (!playing || !page || !deck) return;
    const action = page.actions[actionIndex];
    const requestId = playbackRef.current;
    if (!action) {
      timeoutRef.current = window.setTimeout(() => {
        if (playbackRef.current !== requestId) return;
        if (pageIndex < deck.pages.length - 1) {
          setPageIndex((current) => current + 1);
          setActionIndex(0);
          setActiveRegionId(null);
          return;
        }
        setPlaying(false);
      }, 0);
      return;
    }

    if (action.type === 'spotlight') {
      timeoutRef.current = window.setTimeout(() => {
        if (playbackRef.current !== requestId) return;
        setActiveRegionId(action.elementId);
        timeoutRef.current = window.setTimeout(() => {
          if (playbackRef.current !== requestId) return;
          setActionIndex((current) => current + 1);
        }, 520);
      }, 0);
      return () => {
        if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      };
    }

    timeoutRef.current = window.setTimeout(() => {
      if (playbackRef.current !== requestId) return;
      setSpeechText(action.text);
      if (typeof window === 'undefined' || !window.speechSynthesis) {
        timeoutRef.current = window.setTimeout(
          () => setActionIndex((current) => current + 1),
          Math.max(1400, Math.min(5200, action.text.length * 90)),
        );
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(action.text);
      utterance.lang = 'zh-CN';
      utterance.rate = 1;
      utterance.volume = 1;
      const voices = window.speechSynthesis.getVoices();
      const zhVoice = voices.find((voice) =>
        /^zh|Chinese|Mandarin/i.test(voice.lang || voice.name),
      );
      if (zhVoice) utterance.voice = zhVoice;
      utterance.onend = () => {
        if (playbackRef.current !== requestId) return;
        setActionIndex((current) => current + 1);
      };
      utterance.onerror = () => {
        if (playbackRef.current !== requestId) return;
        setActionIndex((current) => current + 1);
      };
      window.speechSynthesis.speak(utterance);
    }, 0);
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      window.speechSynthesis.cancel();
    };
  }, [actionIndex, deck, page, pageIndex, playing]);

  useEffect(() => () => stopPlayback(), [stopPlayback]);

  const jumpToPage = useCallback(
    (nextIndex: number) => {
      stopPlayback();
      setPageIndex(nextIndex);
      setActionIndex(0);
      setActiveRegionId(null);
      setSpeechText('');
    },
    [stopPlayback],
  );

  if (!deck || !page) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(860px,92dvh)] w-[calc(100vw-1rem)] max-w-5xl overflow-hidden rounded-[28px] border-slate-200/80 bg-slate-950 p-0 text-white shadow-2xl dark:border-white/10">
        <DialogHeader className="border-b border-white/10 px-5 py-4 text-left">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="truncate text-base text-white">{deck.title}</DialogTitle>
              <p className="mt-1 text-xs text-slate-400">
                第 {pageIndex + 1}/{deck.pages.length} 页 · {page.regions.length} 个讲解区域
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 rounded-full border-white/15 bg-white/8 px-3 text-xs text-white hover:bg-white/15"
              onClick={() => {
                if (playing) {
                  stopPlayback();
                  return;
                }
                playbackRef.current += 1;
                setActionIndex(0);
                setPlaying(true);
              }}
            >
              {playing ? '暂停' : '播放'}
            </Button>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 gap-0 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="bg-black px-3 py-4 sm:px-5">
            <div className="relative mx-auto aspect-video max-h-[68dvh] overflow-hidden rounded-[18px] border border-white/10 bg-white">
              <img
                src={page.imageDataUrl}
                alt={page.title}
                className="absolute inset-0 size-full object-contain"
              />
              {activeRegion ? (
                <div
                  className="pointer-events-none absolute rounded-[18px] border-2 transition-all duration-700 ease-out"
                  style={{
                    ...miniLectureRegionStyle(activeRegion),
                    borderColor: activeRegion.markerColorHex,
                    boxShadow: `0 0 0 9999px rgba(2, 6, 23, 0.58), 0 0 34px ${activeRegion.markerColorHex}`,
                  }}
                />
              ) : null}
            </div>
          </div>

          <aside className="flex min-h-0 flex-col border-t border-white/10 bg-slate-950/95 lg:border-l lg:border-t-0">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                讲解节奏
              </p>
              <div className="mt-3 space-y-2">
                {page.regions.map((region) => (
                  <button
                    key={region.id}
                    type="button"
                    className={cn(
                      'w-full rounded-[14px] border px-3 py-2 text-left text-xs leading-5 transition',
                      activeRegionId === region.id
                        ? 'border-sky-300/70 bg-sky-400/15 text-sky-50'
                        : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10',
                    )}
                    onClick={() => {
                      stopPlayback();
                      setActiveRegionId(region.id);
                      setSpeechText(region.script);
                    }}
                  >
                    <span className="block font-semibold">{region.label}</span>
                    <span className="mt-0.5 line-clamp-2 block text-slate-400">
                      {region.script}
                    </span>
                  </button>
                ))}
              </div>
              {speechText ? (
                <div className="mt-4 rounded-[16px] border border-white/10 bg-white/5 px-3 py-3 text-xs leading-5 text-slate-200">
                  {speechText}
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-white/10 px-4 py-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-full border-white/15 bg-white/8 px-3 text-xs text-white hover:bg-white/15 disabled:opacity-40"
                onClick={() => jumpToPage(pageIndex - 1)}
                disabled={!canPrev}
              >
                <ChevronLeft className="size-3.5" />
                上一页
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-full border-white/15 bg-white/8 px-3 text-xs text-white hover:bg-white/15 disabled:opacity-40"
                onClick={() => jumpToPage(pageIndex + 1)}
                disabled={!canNext}
              >
                下一页
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PlanActionCard({
  plan,
  onStart,
}: {
  plan: PracticePlan;
  onStart: (plan: PracticePlan) => void;
}) {
  const isQuizPlan = plan.mode === 'quiz';
  const planGlowVariant = isQuizPlan ? 'quiz' : 'practice';
  const planIconClassName = isQuizPlan
    ? 'border-[#A9E7FF]/70 bg-white/72 text-[#2F8FC9] dark:border-[#A9E7FF]/20 dark:bg-white/8 dark:text-[#A9E7FF]'
    : 'border-[#A9F0DC]/70 bg-white/72 text-[#106453] dark:border-[#A9F0DC]/20 dark:bg-white/8 dark:text-[#A9F0DC]';
  const planChipClassName = isQuizPlan
    ? 'border-[#A9E7FF]/70 bg-white/58 text-[#2F8FC9] dark:border-[#A9E7FF]/22 dark:bg-white/6 dark:text-[#A9E7FF]'
    : 'border-[#A9F0DC]/70 bg-white/58 text-[#106453] dark:border-[#A9F0DC]/22 dark:bg-white/6 dark:text-[#A9F0DC]';
  const planMetricPillClassName =
    'inline-flex h-8 min-w-[76px] items-center justify-center gap-1.5 rounded-full bg-white/68 px-2.5 text-[11px] shadow-sm ring-1 ring-[#A9E7FF]/35 dark:bg-white/5 dark:ring-white/10';
  const rationale = plan.evidence?.rationale?.slice(0, 4) || [];
  const gaps = plan.evidence?.gaps?.slice(0, 2) || [];
  const evidenceItems = plan.evidence?.items?.slice(0, 4) || [];

  return (
    <div
      className={cn(
        learnAssistantActionCardWidthClassName,
        learnHomeGlowCardBaseClassName,
        'mt-3 rounded-[18px]',
      )}
    >
      <LearnHomeGlowLayers variant={planGlowVariant} />
      <div className="relative px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={cn(
                'mt-0.5 grid size-8 shrink-0 place-items-center rounded-[11px] border shadow-sm',
                planIconClassName,
              )}
            >
              <BookOpenCheck className="size-3.5" strokeWidth={1.9} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{plan.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {plan.mode === 'quiz' ? '课程测验' : '刷题计划'} · {plan.estimatedMinutes} 分钟 ·{' '}
                {plan.problemIds.length || 0} 题
              </p>
            </div>
          </div>
          <Button
            type="button"
            onClick={() => onStart(plan)}
            className="h-8 shrink-0 gap-1.5 rounded-full bg-[#103832] px-3 text-xs text-white shadow-sm hover:bg-[#15574d] dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            <Play className="size-3.5" />
            开始
          </Button>
        </div>

        <div className="mt-3 grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {plan.targetConcepts.slice(0, 5).map((concept) => (
              <span
                key={concept}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-5',
                  planChipClassName,
                )}
              >
                {concept}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 text-center text-xs sm:justify-end">
            <span className={planMetricPillClassName}>
              <strong className="text-foreground">{plan.difficultyMix.easy}</strong>
              <span className="text-muted-foreground">基础</span>
            </span>
            <span className={planMetricPillClassName}>
              <strong className="text-foreground">{plan.difficultyMix.medium}</strong>
              <span className="text-muted-foreground">中等</span>
            </span>
            <span className={planMetricPillClassName}>
              <strong className="text-foreground">{plan.difficultyMix.hard}</strong>
              <span className="text-muted-foreground">挑战</span>
            </span>
          </div>
        </div>
        {rationale.length ? (
          <div className="mt-3 border-t border-white/70 pt-3 text-xs leading-5 text-slate-600 dark:border-white/10 dark:text-slate-300">
            <p className="font-semibold text-slate-900 dark:text-slate-100">计划依据</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              {rationale.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {evidenceItems.length ? (
              <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                参考来源：
                {evidenceItems
                  .map((item) => item.title)
                  .filter(Boolean)
                  .join('、')}
              </p>
            ) : null}
            {gaps.length ? (
              <p className="mt-2 text-[11px] text-[#DB544E] dark:text-[#FF9A9A]">
                证据缺口：{gaps.join('；')}
              </p>
            ) : null}
          </div>
        ) : null}
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
  const orderedNotebooks = orderedCourseNotebooks(notebooks);
  return (
    <div
      className={cn(
        learnAssistantActionCardWidthClassName,
        learnHomeGlowCardBaseClassName,
        'mt-3 rounded-[16px] px-3.5 py-3 text-sm text-slate-800 dark:text-slate-50',
      )}
    >
      <LearnHomeGlowLayers variant="progress" />
      <div className="relative">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-[#FF9A9A]/45 bg-white/72 text-[#DB544E] shadow-sm dark:border-[#FF9A9A]/22 dark:bg-white/8 dark:text-[#FF9A9A]">
            <Target className="size-3.5" strokeWidth={1.9} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
              {proposal.confirmed
                ? proposal.writeMode === 'planning_scope'
                  ? '计划范围已确认'
                  : '学习进度已更新'
                : (proposal.title ?? '确认学习进度')}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
              {proposal.reason}
            </p>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <select
            value={proposal.selection}
            onChange={(event) => onSelectionChange(event.target.value)}
            disabled={proposal.confirmed}
            className="h-9 min-w-0 rounded-[10px] border border-[#CEC6FF]/55 bg-white/72 px-3 text-sm text-foreground shadow-sm outline-none transition focus:border-[#A9E7FF] focus:ring-2 focus:ring-[#A9E7FF]/30 disabled:cursor-not-allowed disabled:opacity-70 dark:border-[#CEC6FF]/22 dark:bg-slate-950/70"
            aria-label="确认学习进度"
          >
            <option value="">选择学习进度</option>
            <option value={PROGRESS_SELECTION_NOT_STARTED}>还没开始</option>
            {orderedNotebooks.map((notebook) => (
              <option key={notebook.id} value={notebook.id}>
                正在学习：{notebook.name}
              </option>
            ))}
            {notebooks.length > 0 ? (
              <option value={PROGRESS_SELECTION_COMPLETED_ALL}>已经学完整门课</option>
            ) : null}
          </select>
          <Button
            onClick={onConfirm}
            disabled={!proposal.selection || proposal.confirmed}
            className="h-9 rounded-[10px] bg-[#103832] px-4 text-sm text-white shadow-sm hover:bg-[#15574d] disabled:bg-slate-300 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            {proposal.confirmed ? '已确认' : (proposal.confirmLabel ?? '确认更新')}
          </Button>
          {onDismiss && !proposal.confirmed ? (
            <Button variant="ghost" onClick={onDismiss} className="h-9 rounded-[10px] px-3 text-sm">
              稍后再说
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function learnActionTitle(action: LearningAction): string {
  switch (action.kind) {
    case 'calendar.propose_add':
      return '添加到学习日历';
    case 'calendar.propose_update':
      return '修改学习日历';
    case 'calendar.propose_delete':
      return '删除日历事项';
    case 'calendar.search':
      return '查看学习日程';
    case 'calendar.start_recent':
      return '开始最近活动';
    case 'memory.search':
      return '查看学习记忆';
    case 'web.search':
      return '联网搜索';
    case 'learner_progress.request_confirmation':
      return '确认学习进度';
    case 'practice.propose_generation':
      return '生成练习计划';
    case 'classroom.propose_temporary_explanation':
      return '生成临时课堂';
    case 'image.propose_generation':
      return '生成学习图片';
    case 'memory.propose_write':
      return '写入学习记忆';
    default:
      return action.label;
  }
}

function learnActionButtonLabel(action: LearningAction): string {
  if (action.status === 'completed') return '已完成';
  if (action.status === 'confirmed') return '已确认';
  if (action.status === 'cancelled') return '已取消';
  if (action.status === 'failed') return '重试';
  switch (action.kind) {
    case 'calendar.search':
    case 'calendar.start_recent':
    case 'memory.search':
    case 'web.search':
      return '查看';
    case 'calendar.propose_add':
      return '确认添加';
    case 'calendar.propose_update':
      return '确认修改';
    case 'calendar.propose_delete':
      return '确认删除';
    case 'learner_progress.request_confirmation':
      return '确认进度';
    case 'practice.propose_generation':
      return '确认生成';
    case 'classroom.propose_temporary_explanation':
      return '生成课堂';
    case 'image.propose_generation':
      return '确认生成';
    case 'memory.propose_write':
      return '确认写入';
    default:
      return '确认';
  }
}

function LearnLearningActionCards({
  actions,
  onConfirm,
  onCancel,
}: {
  actions?: LearningAction[];
  onConfirm: (action: LearningAction) => void;
  onCancel: (action: LearningAction) => void;
}) {
  if (!actions?.length) return null;
  return (
    <div className="mt-3 space-y-2">
      {actions.map((action) => {
        const completed =
          action.status === 'completed' ||
          action.status === 'confirmed' ||
          action.status === 'cancelled';
        const requiresConfirmation = action.confirmation === 'required';
        return (
          <div
            key={action.id}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs shadow-sm dark:border-white/10 dark:bg-white/[0.04]"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  {learnActionTitle(action)}
                </p>
                <p className="mt-1 line-clamp-2 text-slate-500 dark:text-slate-400">
                  {action.summary || action.label}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={completed}
                className={cn(
                  'h-8 shrink-0 rounded-[10px] px-3 text-xs',
                  requiresConfirmation ? '' : 'hidden',
                )}
                onClick={() => onCancel(action)}
              >
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                variant={action.confirmation === 'none' ? 'outline' : 'default'}
                disabled={completed}
                className="h-8 shrink-0 rounded-[10px] px-3 text-xs"
                onClick={() => onConfirm(action)}
              >
                {learnActionButtonLabel(action)}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function buildSyllabusEventsByDay(
  events: SyllabusCalendarEvent[],
): Map<string, SyllabusCalendarEvent[]> {
  const next = new Map<string, SyllabusCalendarEvent[]>();
  for (const event of events) {
    const items = next.get(event.date) || [];
    items.push(event);
    next.set(event.date, items);
  }
  return next;
}

function LearningCalendarGrid({
  days,
  plansByCalendarDay,
  syllabusEventsByCalendarDay,
  isResearchCourse,
  maxVisibleItems = 3,
  className,
}: {
  days: ReturnType<typeof buildLearningCalendarDays>;
  plansByCalendarDay?: Map<string, PracticePlan[]>;
  syllabusEventsByCalendarDay?: Map<string, SyllabusCalendarEvent[]>;
  isResearchCourse: boolean;
  maxVisibleItems?: number;
  className?: string;
}) {
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', className)}>
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
        {days.map((day) => {
          const dayPlans = plansByCalendarDay?.get(day.key) || [];
          const dayEvents = syllabusEventsByCalendarDay?.get(day.key) || [];
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
              meta: scheduleEventLabel(event.kind, isResearchCourse),
              dotClassName: syllabusEventTone(event.kind),
              pillClassName: syllabusEventPillTone(event.kind),
            })),
          ];
          const visibleItems = items.slice(0, maxVisibleItems);
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
                    title={`${item.title}${item.meta ? ` · ${item.meta}` : ''}`}
                  >
                    <span className={cn('size-1.5 shrink-0 rounded-full', item.dotClassName)} />
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
  );
}

function calendarDraftEvents(
  draft: Extract<LearnArtifact, { kind: 'calendar_draft' }>,
): SyllabusCalendarEvent[] {
  return draft.items.map((item, index) => ({
    id: item.id || `${draft.id}-item-${index}`,
    title: item.title,
    kind: 'progress',
    date: item.date || localDayKey(addCalendarDays(new Date(), index)),
    sourceName: draft.title || '日程规划草稿',
    createdAt: Date.now(),
    origin: 'ai_plan',
    sourceRef: { type: 'plan', id: draft.sourceArtifactId || draft.id },
    durationMinutes: item.durationMinutes,
    status: 'planned',
    rawText: item.reason || null,
  }));
}

function calendarDraftInitialDate(draft: Extract<LearnArtifact, { kind: 'calendar_draft' }>) {
  const firstDate = draft.items.map((item) => item.date).find(Boolean);
  return new Date(`${firstDate || localDayKey(new Date())}T12:00:00`);
}

function CalendarDraftPreview({
  draft,
  addAction,
  completed,
  isResearchCourse,
  onAddToCalendar,
  onClose,
}: {
  draft: Extract<LearnArtifact, { kind: 'calendar_draft' }>;
  addAction: LearningAction | null;
  completed: boolean;
  isResearchCourse: boolean;
  onAddToCalendar?: (action: LearningAction) => void;
  onClose: () => void;
}) {
  const [referenceDate, setReferenceDate] = useState(() => calendarDraftInitialDate(draft));
  useEffect(() => {
    setReferenceDate(calendarDraftInitialDate(draft));
  }, [draft]);
  const draftEvents = useMemo(() => calendarDraftEvents(draft), [draft]);
  const calendarDays = useMemo(
    () => buildLearningCalendarDays(referenceDate, [], draftEvents),
    [draftEvents, referenceDate],
  );
  const eventsByDay = useMemo(() => buildSyllabusEventsByDay(draftEvents), [draftEvents]);
  const firstDate = draftEvents[0]?.date;
  const monthLabel = useMemo(() => formatCalendarMonth(referenceDate), [referenceDate]);

  const showPreviousMonth = useCallback(() => {
    setReferenceDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1));
  }, []);
  const showNextMonth = useCallback(() => {
    setReferenceDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1));
  }, []);
  const showDraftStart = useCallback(() => {
    setReferenceDate(calendarDraftInitialDate(draft));
  }, [draft]);

  return (
    <>
      <div className="min-h-0 flex-1 overflow-hidden px-5 py-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-2xl font-semibold text-foreground">{monthLabel}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {draft.items.length} 个活动{firstDate ? ` · 从 ${firstDate} 开始` : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={showDraftStart}
              className="rounded-full bg-muted px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              首日
            </button>
            <button
              type="button"
              onClick={showPreviousMonth}
              className="grid size-9 place-items-center rounded-full bg-muted text-muted-foreground transition hover:bg-muted/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="上一个月"
              title="上一个月"
            >
              <ChevronLeft className="size-4" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={showNextMonth}
              className="grid size-9 place-items-center rounded-full bg-muted text-muted-foreground transition hover:bg-muted/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="下一个月"
              title="下一个月"
            >
              <ChevronRight className="size-4" strokeWidth={2} />
            </button>
          </div>
        </div>
        <LearningCalendarGrid
          days={calendarDays}
          syllabusEventsByCalendarDay={eventsByDay}
          isResearchCourse={isResearchCourse}
          maxVisibleItems={4}
          className="h-[min(430px,52dvh)] rounded-[18px] border border-border/70"
        />
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-border/70 px-5 py-4">
        <Button type="button" variant="ghost" className="rounded-[10px]" onClick={onClose}>
          关闭
        </Button>
        <Button
          type="button"
          disabled={!addAction || completed}
          className="rounded-[10px] bg-[#103832] text-white hover:bg-[#15574d] dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          onClick={() => {
            if (!addAction || !onAddToCalendar) return;
            onAddToCalendar(addAction);
            onClose();
          }}
        >
          {completed ? '已添加到日历' : '添加到日历'}
        </Button>
      </div>
    </>
  );
}

function LearnArtifactCards({
  artifacts,
  actions,
  isResearchCourse,
  onConfirmCalendarAction,
}: {
  artifacts?: LearnArtifact[];
  actions?: LearningAction[];
  isResearchCourse?: boolean;
  onConfirmCalendarAction?: (action: LearningAction) => void;
}) {
  const [openCalendarDraftId, setOpenCalendarDraftId] = useState<string | null>(null);
  if (!artifacts?.length) return null;
  return (
    <div className="mt-3 space-y-2">
      {artifacts.map((artifact) => {
        if (artifact.kind === 'web_search_result') {
          return (
            <div
              key={artifact.id}
              className="rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-2.5 text-xs dark:border-sky-300/15 dark:bg-sky-400/10"
            >
              <p className="font-semibold text-sky-950 dark:text-sky-100">
                网页搜索：{artifact.query}
              </p>
              {artifact.answer ? (
                <p className="mt-1 line-clamp-3 text-sky-800/80 dark:text-sky-100/75">
                  {artifact.answer}
                </p>
              ) : null}
              {artifact.sources.length ? (
                <div className="mt-2 space-y-1">
                  {artifact.sources.slice(0, 3).map((source) => (
                    <a
                      key={`${artifact.id}-${source.url}`}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate font-medium text-sky-700 underline-offset-2 hover:underline dark:text-sky-200"
                    >
                      {source.title}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          );
        }

        if (artifact.kind === 'calendar_draft') {
          const matchingAction = matchingCalendarAddActionForArtifact(artifact, actions);
          const addAction =
            matchingAction ||
            createCalendarAddActionFromArtifacts({
              artifacts: [artifact],
              id: makeClientId('calendar-add-action'),
            });
          const completed =
            matchingAction?.status === 'completed' || matchingAction?.status === 'confirmed';
          return (
            <div key={artifact.id}>
              <button
                type="button"
                onClick={() => setOpenCalendarDraftId(artifact.id)}
                className="flex w-full items-center gap-3 rounded-lg border border-amber-100 bg-amber-50/70 px-3 py-2.5 text-left text-xs shadow-sm transition hover:border-amber-200 hover:bg-amber-50 dark:border-amber-300/15 dark:bg-amber-400/10 dark:hover:bg-amber-400/15"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-[12px] border border-amber-200 bg-white text-amber-700 shadow-sm dark:border-amber-300/20 dark:bg-white/10 dark:text-amber-100">
                  <CalendarDays className="size-4" strokeWidth={1.9} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-amber-950 dark:text-amber-100">
                    {artifact.title || '日程规划'}
                  </span>
                  <span className="mt-0.5 block text-amber-800/75 dark:text-amber-100/70">
                    {artifact.items.length} 个活动 · 点击查看这次规划
                  </span>
                </span>
                {completed ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:border-emerald-300/20 dark:bg-emerald-400/10 dark:text-emerald-100">
                    <CheckCircle2 className="size-3.5" />
                    已添加
                  </span>
                ) : null}
              </button>

              <Dialog
                open={openCalendarDraftId === artifact.id}
                onOpenChange={(open) => setOpenCalendarDraftId(open ? artifact.id : null)}
              >
                <DialogContent className="flex max-h-[min(720px,86dvh)] w-[calc(100vw-1rem)] max-w-2xl flex-col overflow-hidden rounded-[24px] border-border/80 bg-background p-0 shadow-2xl">
                  <DialogHeader className="border-b border-border/70 px-5 py-4 text-left">
                    <DialogTitle className="flex items-center gap-2 text-base">
                      <span className="grid size-8 place-items-center rounded-[10px] bg-amber-50 text-amber-700 ring-1 ring-amber-100 dark:bg-amber-400/10 dark:text-amber-100 dark:ring-amber-300/15">
                        <CalendarDays className="size-4" />
                      </span>
                      {artifact.title || '日程规划'}
                    </DialogTitle>
                    <DialogDescription>
                      只显示这一次生成的活动安排。添加后会进入当前课程的学习日历。
                    </DialogDescription>
                  </DialogHeader>
                  <CalendarDraftPreview
                    draft={artifact}
                    addAction={addAction}
                    completed={completed}
                    isResearchCourse={Boolean(isResearchCourse)}
                    onAddToCalendar={onConfirmCalendarAction}
                    onClose={() => setOpenCalendarDraftId(null)}
                  />
                </DialogContent>
              </Dialog>
            </div>
          );
        }

        if (artifact.kind === 'image_prompt_draft') {
          return (
            <div
              key={artifact.id}
              className="rounded-lg border border-violet-100 bg-violet-50/70 px-3 py-2.5 text-xs dark:border-violet-300/15 dark:bg-violet-400/10"
            >
              <p className="font-semibold text-violet-950 dark:text-violet-100">图片草稿</p>
              <p className="mt-1 line-clamp-3 text-violet-800/80 dark:text-violet-100/75">
                {artifact.prompt}
              </p>
              {artifact.imageUrl ? (
                <img
                  src={artifact.imageUrl}
                  alt="生成的学习图片"
                  className="mt-2 max-h-72 rounded-lg border border-white/70 object-contain shadow-sm dark:border-white/10"
                />
              ) : null}
            </div>
          );
        }

        if (artifact.kind === 'activity_plan') {
          return (
            <div
              key={artifact.id}
              className="rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2.5 text-xs dark:border-emerald-300/15 dark:bg-emerald-400/10"
            >
              <p className="font-semibold text-emerald-950 dark:text-emerald-100">
                {artifact.title}
              </p>
              <div className="mt-2 space-y-1">
                {artifact.tasks.slice(0, 4).map((task, index) => (
                  <p key={`${artifact.id}-${index}`} className="text-emerald-800/85">
                    {task.title}
                    {task.minutes ? ` · ${task.minutes} 分钟` : ''}
                  </p>
                ))}
              </div>
            </div>
          );
        }

        if (artifact.kind === 'answer_evidence') {
          return (
            <details
              key={artifact.id}
              className="group rounded-lg border border-indigo-100 bg-indigo-50/45 px-3 py-2 text-xs dark:border-indigo-300/15 dark:bg-indigo-400/10"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-indigo-900 dark:text-indigo-100">
                <span className="min-w-0 truncate font-medium">
                  {artifact.title || '本次回答证据'} · {artifact.sources.length} 个来源
                </span>
                <span className="shrink-0 text-[11px] text-indigo-700/70 group-open:hidden dark:text-indigo-100/60">
                  展开
                </span>
                <span className="hidden shrink-0 text-[11px] text-indigo-700/70 group-open:inline dark:text-indigo-100/60">
                  收起
                </span>
              </summary>
              {artifact.usedFor ? (
                <p className="mt-2 line-clamp-2 text-indigo-800/70 dark:text-indigo-100/65">
                  {artifact.usedFor}
                </p>
              ) : null}
              <div className="mt-2 space-y-1.5">
                {artifact.sources.slice(0, 4).map((source) => (
                  <div
                    key={`${artifact.id}-${source.sourceType}-${source.id || source.sourceId || source.title}`}
                    className="rounded-md bg-white/70 px-2 py-1.5 text-indigo-900/80 shadow-sm dark:bg-white/10 dark:text-indigo-100/80"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-normal text-indigo-700 dark:bg-indigo-300/15 dark:text-indigo-100">
                        {source.sourceType}
                      </span>
                      <span className="min-w-0 truncate font-semibold">{source.title}</span>
                    </div>
                    {source.previewText ? (
                      <p className="mt-1 line-clamp-2 text-indigo-800/65 dark:text-indigo-100/60">
                        {source.previewText}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </details>
          );
        }

        if (artifact.kind === 'review_plan') {
          return (
            <div
              key={artifact.id}
              className="rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2.5 text-xs dark:border-emerald-300/15 dark:bg-emerald-400/10"
            >
              <p className="font-semibold text-emerald-950 dark:text-emerald-100">
                {artifact.title}
              </p>
              <div className="mt-2 space-y-1">
                {artifact.tasks.slice(0, 4).map((task, index) => (
                  <p key={`${artifact.id}-${index}`} className="text-emerald-800/85">
                    {task.title}
                    {task.minutes ? ` · ${task.minutes} 分钟` : ''}
                  </p>
                ))}
              </div>
            </div>
          );
        }

        if (artifact.kind === 'memory_candidate') {
          return (
            <div
              key={artifact.id}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs dark:border-white/10 dark:bg-white/[0.04]"
            >
              <p className="font-semibold text-slate-900 dark:text-slate-100">记忆候选</p>
              <p className="mt-1 line-clamp-3 text-slate-500 dark:text-slate-400">
                {artifact.summary}
              </p>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

function LearnPublicTraceCard({ steps }: { steps?: LearnPublicTraceStep[] }) {
  if (!steps?.length) return null;
  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-xs shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <div className="mb-2 flex items-center gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-[8px] bg-white text-slate-700 ring-1 ring-slate-200 dark:bg-white/10 dark:text-slate-100 dark:ring-white/10">
          <Brain className="size-3.5" strokeWidth={1.9} />
        </span>
        <p className="font-semibold text-slate-900 dark:text-slate-100">本次工作流</p>
      </div>
      <ol className="space-y-2">
        {steps.map((step) => (
          <li key={step.id} className="flex gap-2">
            <span
              className={cn(
                'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ring-1',
                step.status === 'done' &&
                  'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-100 dark:ring-emerald-300/15',
                step.status === 'waiting' &&
                  'bg-sky-50 text-sky-700 ring-sky-100 dark:bg-sky-400/10 dark:text-sky-100 dark:ring-sky-300/15',
                step.status === 'blocked' &&
                  'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-400/10 dark:text-amber-100 dark:ring-amber-300/15',
              )}
            >
              {step.status === 'waiting' ? (
                <Loader2 className="size-3 animate-spin" strokeWidth={1.9} />
              ) : step.status === 'blocked' ? (
                <AlertTriangle className="size-3" strokeWidth={1.9} />
              ) : (
                <CheckCircle2 className="size-3" strokeWidth={1.9} />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-slate-900 dark:text-slate-100">
                {step.title}
              </span>
              <span className="mt-0.5 block leading-5 text-slate-600 dark:text-slate-300">
                {step.detail}
              </span>
              {step.evidence?.length ? (
                <span className="mt-1 block space-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  {step.evidence.map((item) => (
                    <span key={`${step.id}-${item}`} className="block">
                      {item}
                    </span>
                  ))}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function actionPayload(action: LearningAction): Record<string, unknown> {
  return action.payload && typeof action.payload === 'object' ? action.payload : {};
}

function payloadString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function actionSummary(action: LearningAction): string {
  const payload = actionPayload(action);
  return (
    payloadString(payload.summary) ||
    payloadString(payload.reason) ||
    action.summary ||
    action.label ||
    learnActionTitle(action)
  ).slice(0, 500);
}

function latestUserLearnMessageText(messages: LearnMessage[]): string {
  return (
    messages
      .slice()
      .reverse()
      .find((message) => message.role === 'user')
      ?.text.trim()
      .slice(0, 1000) || ''
  );
}

function memoryActionType(action: LearningAction): string {
  return payloadString(action.payload?.memoryType, 'weakness').toLowerCase();
}

function memoryActionContentType(memoryType: string): MemoryWriteContentType {
  if (memoryType === 'weakness' || memoryType === 'correction') return 'weakness';
  return 'learning_pattern';
}

function memoryActionStudyKind(memoryType: string): string {
  if (memoryType === 'weakness' || memoryType === 'correction') return 'knowledge_gap';
  if (memoryType === 'preference') return 'preference';
  if (memoryType === 'mastery') return 'mastery';
  if (memoryType === 'progress') return 'progress';
  if (memoryType === 'next_step') return 'next_teaching_move';
  return 'reflection';
}

function memoryActionTitle(action: LearningAction): string {
  const payload = actionPayload(action);
  return (
    payloadString(payload.title) ||
    payloadString(payload.label) ||
    action.label ||
    'AI 确认的学习记忆'
  ).slice(0, 120);
}

function memoryWriteCandidateFromLearningAction(args: {
  action: LearningAction;
  courseId: string;
  summary: string;
  question: string;
}): MemoryWriteCandidate {
  const memoryType = memoryActionType(args.action);
  const title = memoryActionTitle(args.action);
  const reason =
    payloadString(args.action.payload?.reason) ||
    '学生在课程聊天里确认了这条学习记忆，后续讲解、复习和练习选择应参考它。';
  return {
    id: `learn-action:${args.action.id}`,
    trigger: memoryType === 'correction' ? 'fact_correction' : 'explicit_user',
    contentType: memoryActionContentType(memoryType),
    targetType: 'course',
    targetId: args.courseId,
    privacy: 'private',
    title,
    text: args.summary,
    source: 'learn.learning_action',
    sourceRef: {
      actionId: args.action.id,
      actionKind: args.action.kind,
      memoryType,
      evidence: args.action.evidence || args.action.payload?.evidence || null,
    },
    studyMemory: {
      targetType: 'course',
      targetId: args.courseId,
      scope: 'private',
      kind: memoryActionStudyKind(memoryType),
      title,
      text: args.summary,
      reason,
      question: args.question || undefined,
      sourceReferences: {
        source: 'learn.learning_action',
        actionId: args.action.id,
        memoryType,
        evidence: args.action.evidence || args.action.payload?.evidence || null,
      },
    },
  };
}

function validDateKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : null;
}

function learningActionCalendarEvents(action: LearningAction): SyllabusCalendarEvent[] {
  const payload = actionPayload(action);
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const itemRecords = rawItems.filter((item): item is Record<string, unknown> =>
    Boolean(item && typeof item === 'object'),
  );
  const sourceName = 'AI 学习动作';

  if (itemRecords.length > 0) {
    return itemRecords.slice(0, 30).map((item, index) => {
      const date =
        validDateKey(item.date) ||
        validDateKey(item.day) ||
        localDayKey(addCalendarDays(new Date(), index));
      return {
        id: makeClientId('learning-action-event'),
        title:
          payloadString(item.title) ||
          payloadString(item.label) ||
          `${learnActionTitle(action)} ${index + 1}`,
        kind: 'progress',
        date,
        sourceName,
        origin: 'ai_plan',
        sourceRef: { type: 'action', id: action.id },
        durationMinutes:
          typeof item.durationMinutes === 'number' && Number.isFinite(item.durationMinutes)
            ? Math.max(5, Math.round(item.durationMinutes))
            : undefined,
        status: 'planned',
        rawText: payloadString(item.reason) || actionSummary(action),
        createdAt: Date.now(),
      };
    });
  }

  return [
    {
      id: makeClientId('learning-action-event'),
      title: actionSummary(action) || learnActionTitle(action),
      kind: 'progress',
      date: validDateKey(payload.date) || localDayKey(new Date()),
      sourceName,
      origin: 'ai_plan',
      sourceRef: { type: 'action', id: action.id },
      durationMinutes:
        typeof payload.durationMinutes === 'number' && Number.isFinite(payload.durationMinutes)
          ? Math.max(5, Math.round(payload.durationMinutes))
          : undefined,
      status: 'planned',
      rawText: actionSummary(action),
      createdAt: Date.now(),
    },
  ];
}

function actionTargets(action: LearningAction): string[] {
  const payload = actionPayload(action);
  const targets = Array.isArray(payload.targets) ? payload.targets : [];
  const fromTargets = targets.map((item) => payloadString(item)).filter(Boolean);
  const targetIds = Array.isArray(payload.targetIds) ? payload.targetIds : [];
  const fromTargetIds = targetIds.map((item) => payloadString(item)).filter(Boolean);
  const singleTarget = payloadString(payload.target);
  const eventId = payloadString(payload.eventId);
  return Array.from(
    new Set([...fromTargetIds, eventId, ...fromTargets, singleTarget].filter(Boolean)),
  );
}

function calendarEventMatchesTarget(event: SyllabusCalendarEvent, target: string): boolean {
  const normalizedTarget = target.trim().toLowerCase();
  if (!normalizedTarget) return false;
  if (event.id.toLowerCase() === normalizedTarget) return true;
  if (event.sourceRef?.id?.toLowerCase() === normalizedTarget) return true;
  const normalizedTitle = event.title.trim().toLowerCase();
  return normalizedTitle === normalizedTarget || normalizedTitle.includes(normalizedTarget);
}

function uniqueCalendarTargetMatches(
  events: SyllabusCalendarEvent[],
  targets: string[],
): SyllabusCalendarEvent[] {
  const matched = new Map<string, SyllabusCalendarEvent>();
  for (const target of targets) {
    for (const event of events) {
      if (calendarEventMatchesTarget(event, target)) matched.set(event.id, event);
    }
  }
  return [...matched.values()];
}

function weekdayIndexFromText(text: string): number | null {
  const normalized = text.toLowerCase();
  if (/周日|星期日|礼拜日|sunday|sun/.test(normalized)) return 0;
  if (/周一|星期一|礼拜一|monday|mon/.test(normalized)) return 1;
  if (/周二|星期二|礼拜二|tuesday|tue/.test(normalized)) return 2;
  if (/周三|星期三|礼拜三|wednesday|wed/.test(normalized)) return 3;
  if (/周四|星期四|礼拜四|thursday|thu/.test(normalized)) return 4;
  if (/周五|星期五|礼拜五|friday|fri/.test(normalized)) return 5;
  if (/周六|星期六|礼拜六|saturday|sat/.test(normalized)) return 6;
  return null;
}

function firstCalendarDateForWeekday(
  events: SyllabusCalendarEvent[],
  weekday: number,
): string | null {
  const today = localDayKey(new Date());
  const sorted = events
    .filter((event) => event.date >= today)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'zh-CN'));
  const matched = sorted.find((event) => new Date(`${event.date}T12:00:00`).getDay() === weekday);
  return matched?.date || null;
}

function isAiEditableCalendarEvent(event: SyllabusCalendarEvent): boolean {
  return (
    event.origin === 'ai_plan' ||
    event.origin === 'practice' ||
    event.origin === 'manual' ||
    event.sourceName === 'AI 学习动作'
  );
}

function applyBulkLearningCalendarUpdate(args: {
  events: SyllabusCalendarEvent[];
  action: LearningAction;
}): { events: SyllabusCalendarEvent[]; updated: SyllabusCalendarEvent } | null {
  const payload = actionPayload(args.action);
  const updates = payloadRecord(payload.updates);
  const actionText = [
    actionSummary(args.action),
    payloadString(payload.reason),
    payloadString(updates.reason),
    payloadString(payload.description),
  ]
    .filter(Boolean)
    .join('\n');
  const shiftByDays =
    typeof updates.shiftByDays === 'number' && Number.isFinite(updates.shiftByDays)
      ? Math.round(updates.shiftByDays)
      : typeof payload.shiftByDays === 'number' && Number.isFinite(payload.shiftByDays)
        ? Math.round(payload.shiftByDays)
        : /(顺延|后移|推迟|delay|shift)/i.test(actionText)
          ? 1
          : 0;
  if (!shiftByDays) return null;

  const weekday = weekdayIndexFromText(actionText);
  const sinceDate =
    validDateKey(updates.sinceDate) ||
    validDateKey(payload.sinceDate) ||
    validDateKey(updates.fromDate) ||
    validDateKey(payload.fromDate) ||
    validDateKey(updates.date) ||
    validDateKey(payload.date) ||
    (weekday === null ? null : firstCalendarDateForWeekday(args.events, weekday));
  if (!sinceDate) return null;

  const candidates = args.events.filter(
    (event) => isAiEditableCalendarEvent(event) && event.date >= sinceDate,
  );
  if (!candidates.length) return null;
  const candidateIds = new Set(candidates.map((event) => event.id));
  let firstUpdated: SyllabusCalendarEvent | null = null;
  const nextEvents = args.events.map((event) => {
    if (!candidateIds.has(event.id)) return event;
    const updated: SyllabusCalendarEvent = {
      ...event,
      date: localDayKey(addCalendarDays(new Date(`${event.date}T12:00:00`), shiftByDays)),
      rawText: payloadString(updates.reason) || payloadString(payload.reason) || event.rawText,
    };
    firstUpdated ||= updated;
    return updated;
  });
  return firstUpdated ? { events: nextEvents, updated: firstUpdated } : null;
}

function applyLearningCalendarUpdate(args: {
  events: SyllabusCalendarEvent[];
  action: LearningAction;
}): { events: SyllabusCalendarEvent[]; updated: SyllabusCalendarEvent } | null {
  const payload = actionPayload(args.action);
  const targets = actionTargets(args.action);
  const matches = uniqueCalendarTargetMatches(args.events, targets);
  if (matches.length !== 1) return applyBulkLearningCalendarUpdate(args);
  const target = matches[0];
  const updates = payloadRecord(payload.updates);
  const shiftByDays =
    typeof updates.shiftByDays === 'number' && Number.isFinite(updates.shiftByDays)
      ? Math.round(updates.shiftByDays)
      : 0;
  const updated: SyllabusCalendarEvent = {
    ...target,
    title: payloadString(updates.title) || payloadString(payload.title) || target.title,
    date:
      validDateKey(updates.date) ||
      validDateKey(payload.date) ||
      (shiftByDays
        ? localDayKey(addCalendarDays(new Date(`${target.date}T12:00:00`), shiftByDays))
        : target.date),
    durationMinutes:
      typeof updates.durationMinutes === 'number' && Number.isFinite(updates.durationMinutes)
        ? Math.max(5, Math.round(updates.durationMinutes))
        : typeof payload.durationMinutes === 'number' && Number.isFinite(payload.durationMinutes)
          ? Math.max(5, Math.round(payload.durationMinutes))
          : target.durationMinutes,
    status:
      updates.status === 'done' || updates.status === 'skipped' || updates.status === 'planned'
        ? updates.status
        : target.status,
    rawText: payloadString(updates.reason) || payloadString(payload.reason) || target.rawText,
  };
  return {
    events: args.events.map((event) => (event.id === target.id ? updated : event)),
    updated,
  };
}

function learningActionPreferredConcepts(action: LearningAction): string[] {
  const payload = actionPayload(action);
  const concepts = Array.isArray(payload.concepts) ? payload.concepts : [];
  return concepts
    .map((item) => payloadString(item))
    .filter(Boolean)
    .slice(0, 8);
}

export function LearnPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlSessionId = searchParams.get('session')?.trim() || '';
  const urlCourseId = searchParams.get('courseId')?.trim() || '';
  const debugNoCourses = searchParams.get('debugNoCourses') === '1';
  const platformMemoryStatusMockMode = platformMemoryStatusMockModeFromValue(
    searchParams.get(PLATFORM_MEMORY_STATUS_MOCK_QUERY_PARAM),
  );
  const imageInputRef = useRef<HTMLInputElement>(null);
  const sourceDocumentInputRef = useRef<HTMLInputElement>(null);
  const draftTextareaRef = useRef<HTMLTextAreaElement>(null);
  const syllabusInputRef = useRef<HTMLInputElement>(null);
  const sourceUploadPanelOpenRef = useRef(false);
  const platformMemoryStatusMockTimersRef = useRef<number[]>([]);
  const appliedPlatformMemoryStatusMockModeRef = useRef<PlatformMemoryStatusMockMode>('off');
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
  const webSearchProviderId = useSettingsStore((state) => state.webSearchProviderId);
  const webSearchProvidersConfig = useSettingsStore((state) => state.webSearchProvidersConfig);
  const imageGenerationEnabled = useSettingsStore((state) => state.imageGenerationEnabled);
  const imageProviderId = useSettingsStore((state) => state.imageProviderId);
  const imageModelId = useSettingsStore((state) => state.imageModelId);
  const imageProvidersConfig = useSettingsStore((state) => state.imageProvidersConfig);
  const setModel = useSettingsStore((state) => state.setModel);
  const memoryActivities = useMemoryActivityStore((state) => state.activities);
  const memoryHistoryRecords = useTaskHistoryStore((state) => state.records);

  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [coursesLoadState, setCoursesLoadState] = useState<LoadState>('idle');
  const [deletingCourseId, setDeletingCourseId] = useState<string | null>(null);
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
  const [createCourseOpen, setCreateCourseOpen] = useState(false);
  const [syllabusImportMode, setSyllabusImportMode] = useState<SyllabusImportMode>('file');
  const [syllabusCommitMode, setSyllabusCommitMode] = useState<SyllabusCommitMode>('merge');
  const [syllabusImportLoading, setSyllabusImportLoading] = useState(false);
  const [syllabusDraftEvents, setSyllabusDraftEvents] = useState<SyllabusCalendarEvent[]>([]);
  const [syllabusDraftSourceName, setSyllabusDraftSourceName] = useState('');
  const [syllabusPlanDraft, setSyllabusPlanDraft] = useState('');
  const [manualScheduleDialogOpen, setManualScheduleDialogOpen] = useState(false);
  const [manualScheduleTitle, setManualScheduleTitle] = useState('');
  const [manualScheduleDate, setManualScheduleDate] = useState(() => localDayKey(new Date()));
  const [manualScheduleKind, setManualScheduleKind] = useState<SyllabusEventKind>('assignment');
  const [manualScheduleError, setManualScheduleError] = useState<string | null>(null);
  const [messages, setMessages] = useState<LearnMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<LearnImageAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [sourceUploading, setSourceUploading] = useState(false);
  const [sourceUploadPanelOpen, setSourceUploadPanelOpen] = useState(false);
  const [sourceUploadItems, setSourceUploadItems] = useState<LearnSourceUploadItem[]>([]);
  const [selectedSourceLibraryTileId, setSelectedSourceLibraryTileId] = useState<string | null>(
    null,
  );
  const [sourceLibraryDetailView, setSourceLibraryDetailView] =
    useState<SourceLibraryDetailView>('image');
  const [sourceLibraryImageExpanded, setSourceLibraryImageExpanded] = useState(false);
  const [deletingSourceHashes, setDeletingSourceHashes] = useState<string[]>([]);
  const [sourceLibraryTextCache, setSourceLibraryTextCache] = useState<
    Record<string, SourceLibraryTextState>
  >({});
  const [courseSourceUploads, setCourseSourceUploads] = useState<CourseSourceUploadRecord[]>([]);
  const [completedSourceUploadBadgeCount, setCompletedSourceUploadBadgeCount] = useState(0);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishingCourse, setPublishingCourse] = useState(false);
  const [publishableMemoryCount, setPublishableMemoryCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [learnSessions, setLearnSessions] = useState<LearnChatSession[]>([]);
  const [deletingLearnSessionId, setDeletingLearnSessionId] = useState<string | null>(null);
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
  const [memoryActivityDialogOpen, setMemoryActivityDialogOpen] = useState(false);
  const [calendarReferenceDate, setCalendarReferenceDate] = useState(() => new Date());
  const [miniLectureOpen, setMiniLectureOpen] = useState(false);
  const [activeMiniLectureDeck, setActiveMiniLectureDeck] = useState<MiniLectureDeck | null>(null);
  const [generatingMiniLectureMessageId, setGeneratingMiniLectureMessageId] = useState<
    string | null
  >(null);

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
  const hasActiveCourse = Boolean(activeCourse);
  const activeCourseIsOwner = activeCourse?.accessRole !== 'enrolled';
  const isResearchCourse = activeCourse?.purpose === 'research';
  const coursePublishBlockReason = activeCourse
    ? getCoursePublishBlockReason(activeCourse, notebooks)
    : null;
  const publishableProblemCount = useMemo(
    () => problems.filter((problem) => problem.status === 'published').length,
    [problems],
  );
  const activeQuickPrompts = isResearchCourse ? researchQuickPrompts : learningQuickPrompts;
  const manualScheduleKindOptions = isResearchCourse
    ? RESEARCH_EVENT_KIND_OPTIONS
    : SYLLABUS_EVENT_KIND_OPTIONS;
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
    else {
      setSelectedSourceLibraryTileId(null);
      setSourceLibraryDetailView('image');
      setSourceLibraryImageExpanded(false);
    }
  }, []);

  const openSourceUploadPanel = useCallback(() => {
    setSourceUploadDialogOpen(true);
  }, [setSourceUploadDialogOpen]);

  const openMiniLectureDeck = useCallback((deck: MiniLectureDeck) => {
    setActiveMiniLectureDeck(deck);
    setMiniLectureOpen(true);
  }, []);

  const generateMiniLectureForMessage = useCallback(
    (messageId: string) => {
      const message = messages.find((item) => item.id === messageId);
      if (!message?.lecturePrompt && !message?.lectureDeck) return;
      if (message.lectureDeck) {
        openMiniLectureDeck(message.lectureDeck);
        return;
      }
      const prompt = message.lecturePrompt;
      if (!prompt) return;
      const deck = buildMiniLectureDeck(prompt);
      setGeneratingMiniLectureMessageId(messageId);
      setMessages((current) =>
        current.map((item) =>
          item.id === messageId
            ? {
                ...item,
                lectureDeck: deck,
              }
            : item,
        ),
      );
      setActiveMiniLectureDeck(deck);
      setMiniLectureOpen(true);
      window.setTimeout(() => {
        setGeneratingMiniLectureMessageId((current) => (current === messageId ? null : current));
      }, 260);
    },
    [messages, openMiniLectureDeck],
  );

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
    if (!activeCourse) {
      setError('先添加或选择一门课程，再上传课程资料。');
      return;
    }
    if (sourceUploading || sourceUploadItems.length > 0 || completedSourceUploadBadgeCount > 0) {
      openSourceUploadPanel();
      return;
    }
    imageInputRef.current?.click();
  }, [
    completedSourceUploadBadgeCount,
    activeCourse,
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

  useEffect(() => {
    const clearPlatformMemoryStatusMockTimers = () => {
      for (const timerId of platformMemoryStatusMockTimersRef.current) {
        window.clearTimeout(timerId);
      }
      platformMemoryStatusMockTimersRef.current = [];
    };

    clearPlatformMemoryStatusMockTimers();

    if (platformMemoryStatusMockMode === 'off') {
      if (appliedPlatformMemoryStatusMockModeRef.current !== 'off') {
        dismissPlatformMemoryStatusMockActivities();
      }
      appliedPlatformMemoryStatusMockModeRef.current = 'off';
      return undefined;
    }

    dismissPlatformMemoryStatusMockActivities();
    appliedPlatformMemoryStatusMockModeRef.current = platformMemoryStatusMockMode;
    if (platformMemoryStatusMockMode === 'flow') {
      platformMemoryStatusMockTimersRef.current = replayPlatformMemoryStatusMock();
    } else {
      showRunningPlatformMemoryStatusMock();
    }

    return () => {
      clearPlatformMemoryStatusMockTimers();
      dismissPlatformMemoryStatusMockActivities();
      appliedPlatformMemoryStatusMockModeRef.current = 'off';
    };
  }, [platformMemoryStatusMockMode]);

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
      meta: `${scheduleEventLabel(event.kind, isResearchCourse)}${event.sourceName ? ` · ${event.sourceName}` : ''}`,
      dotClassName: syllabusEventTone(event.kind),
      actionLabel:
        event.origin === 'ai_plan' || event.kind === 'progress' ? '开始活动' : '查看日程',
      event,
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
  }, [isResearchCourse, recentPlans, syllabusEvents]);
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
    return buildSyllabusEventsByDay(syllabusEvents);
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
    const parts = (
      [
        ['assignment', counts.assignment],
        ['exam', counts.exam],
        ['progress', counts.progress],
        ['tutorial', counts.tutorial],
        ['holiday', counts.holiday],
        ['other', counts.other],
      ] as Array<[SyllabusEventKind, number]>
    )
      .map(([kind, count]) =>
        count ? `${count} 个${scheduleEventLabel(kind, isResearchCourse)}` : '',
      )
      .filter(Boolean);
    return parts.length ? parts.join('，') : '';
  }, [isResearchCourse, syllabusEvents]);
  const syllabusNeedsReview =
    !isResearchCourse && syllabusEvents.length > 0 && syllabusEvents.length < 3;
  const missingLearningSetup =
    Boolean(activeCourse) &&
    !isResearchCourse &&
    !snapshot?.progressKnown &&
    syllabusEvents.length === 0;
  const activeMemoryActivities = useMemo(
    () =>
      memoryActivities.filter(
        (activity) =>
          shouldCountPlatformMemoryActivity(activity) &&
          isActiveMemoryActivityStatus(activity.status),
      ),
    [memoryActivities],
  );
  const completedMemoryActivities = useMemo(
    () =>
      memoryActivities.filter(
        (activity) =>
          shouldCountPlatformMemoryActivity(activity) && activity.status === 'completed',
      ),
    [memoryActivities],
  );
  const platformMemoryState = activeMemoryActivities.length
    ? 'writing'
    : completedMemoryActivities.length
      ? 'completed'
      : 'idle';
  const platformMemoryBadgeCount =
    activeMemoryActivities.length || completedMemoryActivities.length;
  const platformMemoryHistory = useMemo(
    () =>
      memoryHistoryRecords
        .filter(
          (record) =>
            shouldShowPlatformMemoryRecord(record) &&
            (platformMemoryStatusMockMode !== 'off' || !isPlatformMemoryStatusMockRecord(record)),
        )
        .slice(0, 15),
    [memoryHistoryRecords, platformMemoryStatusMockMode],
  );
  const platformMemoryButtonLabel =
    platformMemoryState === 'writing'
      ? `平台记忆正在更新，${platformMemoryBadgeCount} 条`
      : platformMemoryState === 'completed'
        ? `平台记忆刚更新了 ${platformMemoryBadgeCount} 条`
        : '平台记忆动态';
  const platformMemoryTooltip =
    platformMemoryState === 'writing'
      ? '平台正在理解新的学习信息'
      : platformMemoryState === 'completed'
        ? '平台记忆刚刚有更新'
        : '查看平台记忆写入历史';
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
    setManualScheduleDialogOpen(false);
    setManualScheduleTitle('');
    setManualScheduleDate(localDayKey(new Date()));
    setManualScheduleKind('assignment');
    setManualScheduleError(null);
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
      router.replace(`/learn?${next.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const handleCourseCreated = useCallback(async (courseId: string) => {
    setCoursesLoadState('loading');
    const items = await listCourses();
    setCourses(items);
    setCoursesLoadState('ready');
    setActiveCourseId((current) => {
      if (current && items.some((course) => course.id === current)) return current;
      if (items.some((course) => course.id === courseId)) return courseId;
      return items[0]?.id || null;
    });
  }, []);

  const handleDeleteCourse = useCallback(
    async (course: CourseRecord) => {
      if (deletingCourseId) return;

      const isEnrolledCourse = course.accessRole === 'enrolled';
      const confirmed = window.confirm(
        isEnrolledCourse
          ? `确认从我的课程中移除「${course.name}」吗？这不会删除创建者的课程内容。`
          : `确认删除课程「${course.name}」吗？课程下的笔记本、题库、记忆、对话和资料索引都会一起删除。`,
      );
      if (!confirmed) return;

      setDeletingCourseId(course.id);
      setError(null);
      try {
        await deleteCourseAndNotebooks(course.id);
        const nextCourses = courses.filter((item) => item.id !== course.id);
        const deletedIndex = courses.findIndex((item) => item.id === course.id);
        const fallbackCourse =
          nextCourses[Math.min(Math.max(deletedIndex, 0), Math.max(nextCourses.length - 1, 0))] ||
          nextCourses[0] ||
          null;

        setCourses(nextCourses);
        if (activeCourseId === course.id) {
          const next = new URLSearchParams(searchParams.toString());
          next.delete('session');
          if (fallbackCourse) {
            next.set('courseId', fallbackCourse.id);
            setActiveCourseId(fallbackCourse.id);
            router.replace(`/learn?${next.toString()}`, { scroll: false });
          } else {
            next.delete('courseId');
            setActiveCourseId(null);
            setCurrentCourse(null);
            setMessages([]);
            setLearnSessions([]);
            setNotebooks([]);
            setProblems([]);
            setCourseSourceUploads([]);
            setSnapshot(null);
            const query = next.toString();
            router.replace(query ? `/learn?${query}` : '/learn', { scroll: false });
          }
        }
        toast.success(isEnrolledCourse ? '课程已从我的课程移除' : '课程已删除');
      } catch (err) {
        const message = err instanceof Error ? err.message : '课程操作失败';
        setError(message);
        toast.error(message);
      } finally {
        setDeletingCourseId(null);
      }
    },
    [activeCourseId, courses, deletingCourseId, router, searchParams, setCurrentCourse],
  );

  const handlePublishActiveCourse = useCallback(async () => {
    if (!activeCourse || publishingCourse) return;
    if (!activeCourseIsOwner) {
      toast.error('已加入的课程由创建者维护，不能发布到商城');
      return;
    }
    if (coursePublishBlockReason) {
      toast.error(coursePublishBlockReason);
      return;
    }

    setPublishingCourse(true);
    try {
      const updatedCourse = await updateCourse(activeCourse.id, {
        name: activeCourse.name,
        description: activeCourse.description ?? '',
        language: activeCourse.language,
        tags: activeCourse.tags,
        purpose: activeCourse.purpose,
        university: activeCourse.university,
        courseCode: activeCourse.courseCode,
        avatarUrl: activeCourse.avatarUrl,
        listedInCourseStore: true,
        coursePriceCents: activeCourse.coursePriceCents ?? 0,
      });
      setCourses((current) =>
        current.map((course) => (course.id === updatedCourse.id ? updatedCourse : course)),
      );
      setPublishDialogOpen(false);
      toast.success('已发布到课程商城：题库和公开课程记忆已同步，源文件和私人内容不会发布。');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '课程发布失败');
    } finally {
      setPublishingCourse(false);
    }
  }, [activeCourse, activeCourseIsOwner, coursePublishBlockReason, publishingCourse]);

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
      sortLearnSessionsForList(localUserId, activeCourseId, Array.from(byId.values())),
      activeSessionId,
    );
    writeLearnSessions(localUserId, activeCourseId, nextSessions);
    setLearnSessions(nextSessions);
    setMessageStoreKey(nextStoreKey);
    const localMessages = readLearnSessionMessages(localUserId, activeCourseId, activeSessionId);
    let loadedMessages = localMessages;
    setMessages(localMessages);

    Promise.all([
      listRemoteLearnSessions(activeCourseId),
      loadRemoteLearnConversation(activeCourseId, activeSessionId),
    ])
      .then(([remoteSessions, remoteConversation]) => {
        if (!alive) return;
        let mergedSessions = nextSessions;
        if (remoteSessions?.storage === 'database' && remoteSessions.sessions.length > 0) {
          mergedSessions = mergeLearnSessions(
            localUserId,
            activeCourseId,
            mergedSessions,
            remoteSessions.sessions,
          );
        }

        if (remoteConversation?.storage === 'database' && remoteConversation.session) {
          const remoteSession = remoteConversation.session;
          mergedSessions = mergeLearnSessions(localUserId, activeCourseId, mergedSessions, [
            remoteSession,
          ]);
          const localSession = nextSessions.find((session) => session.id === activeSessionId);
          const remoteIsNewer =
            !localSession ||
            remoteSession.updatedAt >= localSession.updatedAt ||
            localMessages.length === 0;
          if (remoteIsNewer) {
            const remoteMessages = remoteConversation.messages.map(remoteMessageToLearnMessage);
            loadedMessages = remoteMessages;
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
        if (alive) {
          lastSyncedConversationRef.current = learnConversationSyncSignature({
            key: nextStoreKey,
            title: learnSessionTitleFromMessages(loadedMessages, '新对话'),
            messages: loadedMessages.map(learnMessageToRemotePayload),
          });
          setRemoteConversationReadyKey(nextStoreKey);
        }
      });

    return () => {
      alive = false;
    };
  }, [activeCourseId, activeSessionId, localUserId]);

  useEffect(() => {
    if (!activeCourseId) return;
    if (messageStoreKey !== activeMessageStoreKey) return;
    const persistentMessages = messages.filter((message) => !message.transient);
    writeLearnSessionMessages(localUserId, activeCourseId, activeSessionId, persistentMessages);
    const syncTitle = learnSessionTitleFromMessages(persistentMessages, '新对话');
    setLearnSessions((current) => {
      const now = Date.now();
      const latestMessageUpdatedAt = learnSessionUpdatedAtFromMessages(persistentMessages);
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
        title: learnSessionTitleFromMessages(persistentMessages, fallbackTitle),
        createdAt: currentSession?.createdAt ?? now,
        updatedAt: latestMessageUpdatedAt ?? currentSession?.updatedAt ?? now,
      });
      const nextSessions = pruneDuplicateBlankLearnSessions(
        localUserId,
        activeCourseId,
        sortLearnSessionsForList(localUserId, activeCourseId, Array.from(byId.values())),
        activeSessionId,
      );
      writeLearnSessions(localUserId, activeCourseId, nextSessions);
      return nextSessions;
    });
    if (remoteConversationReadyKey !== activeMessageStoreKey) return;

    const payload = persistentMessages.map(learnMessageToRemotePayload);
    const syncSignature = learnConversationSyncSignature({
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
    if (debugNoCourses) {
      setCourses([]);
      setCoursesLoadState('ready');
      return () => {
        alive = false;
      };
    }
    listCourses()
      .then((items) => {
        if (!alive) return;
        setCourses(items);
        setCoursesLoadState('ready');
      })
      .catch((err) => {
        if (!alive) return;
        setCoursesLoadState('error');
        setError(err instanceof Error ? err.message : '课程加载失败');
      });
    return () => {
      alive = false;
    };
  }, [debugNoCourses, hydrated, isLoggedIn, router]);

  useEffect(() => {
    if (coursesLoadState !== 'ready') return;
    if (debugNoCourses) {
      setActiveCourseId((current) => (current === null ? current : null));
      return;
    }
    const nextCourseId =
      (urlCourseId && courses.some((course) => course.id === urlCourseId) ? urlCourseId : null) ||
      (storedCourseId && courses.some((course) => course.id === storedCourseId)
        ? storedCourseId
        : null) ||
      courses[0]?.id ||
      null;
    setActiveCourseId((current) => (current === nextCourseId ? current : nextCourseId));
  }, [courses, coursesLoadState, debugNoCourses, storedCourseId, urlCourseId]);

  useEffect(() => {
    if (!activeCourse) {
      setCourseSourceUploads([]);
      setPublishableMemoryCount(0);
      return;
    }
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
      listCourseSourceUploads(activeCourse.id).catch(() => []),
    ])
      .then(async ([nextNotebooks, nextProblems, nextSourceUploads]) => {
        if (!alive) return;
        setNotebooks(nextNotebooks);
        setProblems(nextProblems);
        setCourseSourceUploads(nextSourceUploads);
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

  useEffect(() => {
    if (!activeCourse || !activeCourseIsOwner) {
      setPublishableMemoryCount(0);
      return;
    }
    let alive = true;
    Promise.all([
      listStudyMemoryRecords({ targetType: 'course', targetId: activeCourse.id }).catch(() => []),
      listNotebookStudyMemoryCounts(notebooks.map((notebook) => notebook.id)).catch(() => ({})),
    ]).then(([courseMemories, notebookMemoryCounts]) => {
      if (!alive) return;
      const publicCourseMemoryCount = courseMemories.filter(
        (memory) => memory.scope === 'public' && memory.status === 'active',
      ).length;
      const publicNotebookMemoryCount = Object.values(notebookMemoryCounts).reduce(
        (total, item) => total + (item.public || 0),
        0,
      );
      setPublishableMemoryCount(publicCourseMemoryCount + publicNotebookMemoryCount);
    });
    return () => {
      alive = false;
    };
  }, [activeCourse, activeCourseIsOwner, notebooks]);

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

            const formData = new FormData();
            formData.append('file', file);
            formData.append('sourceTitle', file.name);
            formData.append('sourceKind', sourceKind);
            formData.append('language', activeCourse.language === 'en-US' ? 'en-US' : 'zh-CN');
            formData.append('pdfProviderId', pdfProviderId);
            if (pdfProviderConfig?.apiKey) formData.append('pdfApiKey', pdfProviderConfig.apiKey);
            if (pdfProviderConfig?.baseUrl) {
              formData.append('pdfBaseUrl', pdfProviderConfig.baseUrl);
            }
            const response = await backendJson<CourseSourceIngestResponse>(
              `/api/courses/${encodeURIComponent(activeCourse.id)}/source-ingest`,
              {
                method: 'POST',
                headers: {
                  ...(providerId === 'openai' && modelId ? { 'x-model': `openai:${modelId}` } : {}),
                },
                body: formData,
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
          const [nextNotebooks, nextProblems, nextSourceUploads] = await Promise.all([
            listStagesByCourse(activeCourse.id).catch(() => notebooks),
            listCourseProblemSummaries(activeCourse.id).catch(() => problems),
            listCourseSourceUploads(activeCourse.id).catch(() => courseSourceUploads),
          ]);
          setNotebooks(nextNotebooks);
          setProblems(nextProblems);
          setCourseSourceUploads(nextSourceUploads);
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
      courseSourceUploads,
      sourceUploading,
      updateSourceUploadItem,
    ],
  );

  useEffect(() => {
    if (!sourceUploadPanelOpen || !activeCourse?.id) return;
    let alive = true;
    void listCourseSourceUploads(activeCourse.id)
      .then((uploads) => {
        if (alive) setCourseSourceUploads(uploads);
      })
      .catch(() => {
        if (alive) setCourseSourceUploads((current) => current);
      });
    return () => {
      alive = false;
    };
  }, [activeCourse?.id, sourceUploadPanelOpen]);

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
    const label = isResearchCourse ? '研究日程' : 'syllabus 日程';
    setSyllabusImportMessage(`已清空 ${label}。`);
    announceSyllabusScheduleUpdated(`已清空 ${label}`);
  }, [activeCourseId, isResearchCourse, localUserId]);

  const openManualScheduleDialog = useCallback(() => {
    setManualScheduleTitle('');
    setManualScheduleDate(localDayKey(new Date()));
    setManualScheduleKind('assignment');
    setManualScheduleError(null);
    setManualScheduleDialogOpen(true);
  }, []);

  const confirmManualScheduleEvent = useCallback(() => {
    if (!activeCourseId) return;
    const title = manualScheduleTitle.trim();
    if (!title) {
      setManualScheduleError('请填写日程标题。');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(manualScheduleDate)) {
      setManualScheduleError('请选择有效日期。');
      return;
    }

    const event: SyllabusCalendarEvent = {
      id: makeClientId('syllabus-event'),
      title,
      kind: manualScheduleKind,
      date: manualScheduleDate,
      sourceName: '手动添加',
      createdAt: Date.now(),
    };
    const nextEvents = mergeSyllabusEvents(syllabusEvents, [event]);
    writeSyllabusEvents(localUserId, activeCourseId, nextEvents);
    setSyllabusEvents(nextEvents);
    setSyllabusImportMessage(`已添加日程「${title}」。`);
    setCalendarReferenceDate(new Date(`${manualScheduleDate}T12:00:00`));
    setRightRailView('calendar');
    setManualScheduleDialogOpen(false);
    setManualScheduleTitle('');
    setManualScheduleDate(localDayKey(new Date()));
    setManualScheduleKind('assignment');
    setManualScheduleError(null);
    announceSyllabusScheduleUpdated(`${title}，${manualScheduleDate}`);
  }, [
    activeCourseId,
    localUserId,
    manualScheduleDate,
    manualScheduleKind,
    manualScheduleTitle,
    syllabusEvents,
  ]);

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

  const startStatusCalendarActivity = useCallback(
    async (activity: StatusCalendarActivity) => {
      if (sending) return;
      if (activity.source === 'plan') {
        router.push(`/practice/${encodeURIComponent(activity.sourceId)}`);
        return;
      }

      const event = syllabusEvents.find((item) => item.id === activity.sourceId);
      if (!event) {
        toast.error('没有找到这个日历活动。');
        return;
      }

      setRightRailCollapsed(false);
      setRightRailView('calendar');
      setCalendarReferenceDate(new Date(`${event.date}T12:00:00`));
      const activeArtifact = activeActivityArtifactFromEvent({
        event,
        course: activeCourse,
      });
      const messageId = makeClientId('assistant-calendar-activity-start');
      if (!activeCourse) {
        setMessages((current) => [
          ...current,
          {
            id: messageId,
            role: 'assistant',
            text: buildCalendarActivityStartText({
              event,
              course: activeCourse,
              isResearchCourse,
            }),
            createdAt: Date.now(),
            artifacts: [activeArtifact],
          },
        ]);
        return;
      }

      setSending(true);
      try {
        const currentState = loadLearnerCourseState({
          userId: localUserId,
          courseId: activeCourse.id,
        });
        const currentSnapshot = summarizeLearnerCourseState({
          state: currentState,
          notebooks,
          problems,
        });
        const activityQuestion = [
          `开始日历活动：${event.title}`,
          `日期：${event.date}`,
          `类型：${scheduleEventLabel(event.kind, isResearchCourse)}`,
          event.durationMinutes ? `预计时长：${event.durationMinutes} 分钟` : '',
          event.rawText ? `来源内容：${event.rawText}` : '',
          '请直接带我执行这个活动；如果需要题库、日历或记忆操作，请返回结构化 action/artifact。',
        ]
          .filter(Boolean)
          .join('\n');
        const learnTurn = await planLearnTurn({
          question: activityQuestion,
          messages,
          course: activeCourse,
          snapshot: currentSnapshot,
          calendarEvents: syllabusEvents,
          recentActivities: statusCalendarActivities,
          recentPlans,
          problems,
          sourceUploads: courseSourceUploads,
          providerId,
          modelId,
        });
        const artifacts = [
          activeArtifact,
          ...(learnTurn?.artifacts || [])
            .map(normalizeLearnArtifact)
            .filter((artifact): artifact is LearnArtifact => Boolean(artifact)),
        ];
        const learningActions = [
          ...(learnTurn?.proposals || []),
          ...(learnTurn?.directCalls || []),
        ].map((learnAction) =>
          learnActionToClientAction({
            action: learnAction,
            id: makeClientId('learn-action'),
            defaultConfirmation: learnActionRequiresConfirmation(learnAction.kind)
              ? 'required'
              : 'none',
          }),
        );
        const text = learnTurn?.replyText?.trim() || '';
        if (!text && artifacts.length <= 1 && !learningActions.length) {
          throw new Error('AI 没有返回可展示的活动执行内容。');
        }
        setMessages((current) => [
          ...current,
          {
            id: messageId,
            role: 'assistant',
            text,
            createdAt: Date.now(),
            learningActions: learningActions.length ? learningActions : undefined,
            artifacts,
            publicTrace: publicTraceFromLearnTurn(learnTurn, {
              question: activityQuestion,
              progressKnown: currentSnapshot.progressKnown,
              calendarCount: syllabusEvents.length,
              problemCount: problems.length,
            }),
          },
        ]);
        refreshLearnerSnapshot();
      } catch (error) {
        const message = error instanceof Error ? error.message : '活动执行失败';
        setMessages((current) => [
          ...current,
          {
            id: messageId,
            role: 'assistant',
            text: `${message}。我没有使用本地活动兜底，请稍后重试或换一个模型。`,
            createdAt: Date.now(),
            artifacts: [activeArtifact],
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    [
      activeCourse,
      courseSourceUploads,
      isResearchCourse,
      localUserId,
      messages,
      modelId,
      notebooks,
      problems,
      providerId,
      recentPlans,
      refreshLearnerSnapshot,
      router,
      sending,
      statusCalendarActivities,
      syllabusEvents,
    ],
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
          } catch (error) {
            const message = error instanceof Error ? error.message : '未知错误';
            throw new Error(`AI 读取 syllabus PDF 失败：${message}`);
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
      const nextSessions = sortLearnSessionsForList(
        localUserId,
        activeCourseId,
        pruneDuplicateBlankLearnSessions(
          localUserId,
          activeCourseId,
          learnSessions.map((session) =>
            session.id === existingBlankSession.id
              ? { ...session, title: session.title || '新对话' }
              : session,
          ),
          existingBlankSession.id,
        ),
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
    const nextSessions = sortLearnSessionsForList(localUserId, activeCourseId, [
      nextSession,
      ...learnSessions,
    ]);
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

  const deleteLearnSession = useCallback(
    async (session: LearnChatSession) => {
      if (!activeCourseId || deletingLearnSessionId) return;

      setDeletingLearnSessionId(session.id);
      try {
        const remainingSessions = learnSessions.filter((item) => item.id !== session.id);
        const now = Date.now();
        const fallbackSession =
          remainingSessions[0] ??
          ({
            id: 'default',
            title: '新对话',
            createdAt: now,
            updatedAt: now,
          } satisfies LearnChatSession);
        const nextSessions = sortLearnSessionsForList(
          localUserId,
          activeCourseId,
          remainingSessions.length ? remainingSessions : [fallbackSession],
        );

        deleteLearnSessionMessages(localUserId, activeCourseId, session.id);
        writeLearnSessions(localUserId, activeCourseId, nextSessions);
        setLearnSessions(nextSessions);

        if (session.id === activeSessionId) {
          setMessages(readLearnSessionMessages(localUserId, activeCourseId, fallbackSession.id));
          setRemoteConversationReadyKey('');
          router.push(learnSessionHref(fallbackSession.id));
        }

        const remoteDeleted = await deleteRemoteLearnConversation(activeCourseId, session.id);
        toast.success(remoteDeleted ? '会话已删除。' : '本地会话已删除。');
      } catch (deleteError) {
        console.error('[learn] failed to delete session', deleteError);
        toast.error('删除会话失败，请稍后再试。');
      } finally {
        setDeletingLearnSessionId(null);
      }
    },
    [
      activeCourseId,
      activeSessionId,
      deletingLearnSessionId,
      learnSessionHref,
      learnSessions,
      localUserId,
      router,
    ],
  );

  const addAssistantPlan = useCallback(
    (plan: PracticePlan, textOverride?: string, extraArtifacts: LearnArtifact[] = []) => {
      const savedPlan = savePracticePlan(plan);
      const calendarDraftItems = practicePlanCalendarDraftItems(savedPlan);
      const artifacts: LearnArtifact[] = [
        ...(calendarDraftItems.length
          ? [
              {
                kind: 'calendar_draft' as const,
                id: makeClientId('calendar-draft'),
                title: `${savedPlan.title} 日历草稿`,
                items: calendarDraftItems,
                sourceArtifactId: savedPlan.id,
              },
            ]
          : []),
        ...extraArtifacts,
      ];
      void saveRemotePracticePlan(savedPlan);
      setRecentPlans((current) => mergePlans([savedPlan], current).slice(0, 4));
      setMessages((current) => [
        ...current,
        {
          id: makeClientId('assistant-plan'),
          role: 'assistant',
          text: textOverride || planIntro(savedPlan),
          createdAt: Date.now(),
          plan: savedPlan,
          artifacts,
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

  const actionResult = useCallback(
    (
      action: LearningAction,
      args: Omit<
        Parameters<typeof createLearnActionExecutionResult>[1],
        'courseId' | 'conversationId'
      >,
    ) =>
      createLearnActionExecutionResult(action, {
        ...args,
        courseId: activeCourseId || undefined,
        conversationId: activeSessionId,
      }),
    [activeCourseId, activeSessionId],
  );

  const markLearningActionStatus = useCallback(
    (
      actionId: string,
      status: NonNullable<LearningAction['status']>,
      result?: NonNullable<LearningAction['result']>,
    ) => {
      setMessages((current) =>
        current.map((message) =>
          message.learningActions?.some((action) => action.id === actionId)
            ? {
                ...message,
                learningActions: message.learningActions.map((action) =>
                  action.id === actionId
                    ? {
                        ...action,
                        status,
                        result:
                          result ||
                          (status === 'completed' || status === 'failed' || status === 'cancelled'
                            ? actionResult(action, {
                                status,
                                input: {
                                  payload: action.payload || {},
                                },
                              })
                            : action.result),
                      }
                    : action,
                ),
              }
            : message,
        ),
      );
    },
    [actionResult],
  );

  const handleLearningActionConfirm = useCallback(
    async (action: LearningAction) => {
      if (!activeCourseId || !activeCourse) {
        markLearningActionStatus(action.id, 'failed');
        toast.error('当前没有可写入的课程。');
        return;
      }

      try {
        if (action.kind === 'calendar.search') {
          setRightRailCollapsed(false);
          setRightRailView('calendar');
          setCalendarDialogOpen(true);
          markLearningActionStatus(
            action.id,
            'completed',
            actionResult(action, {
              status: 'completed',
              summary: '已打开学习日历供用户查看。',
              input: { payload: action.payload || {} },
              output: { openedView: 'calendar' },
            }),
          );
          return;
        }

        if (action.kind === 'calendar.start_recent') {
          const payload = actionPayload(action);
          const activityId = payloadString(payload.activityId);
          const activity =
            statusCalendarActivities.find(
              (item) => item.id === activityId || item.sourceId === activityId,
            ) || statusCalendarActivities[0];
          if (!activity) {
            setMessages((current) => [
              ...current,
              {
                id: makeClientId('assistant-calendar-no-activity'),
                role: 'assistant',
                text: '现在没有可开始的课程日历活动。你可以先生成一个活动计划，或手动添加今天的学习安排。',
                createdAt: Date.now(),
              },
            ]);
            markLearningActionStatus(
              action.id,
              'failed',
              actionResult(action, {
                status: 'failed',
                summary: '没有可开始的课程日历活动。',
                input: { payload: action.payload || {} },
                error: 'No recent calendar activity was available.',
              }),
            );
            return;
          }
          await startStatusCalendarActivity(activity);
          markLearningActionStatus(
            action.id,
            'completed',
            actionResult(action, {
              status: 'completed',
              summary: `已开始学习活动：${activity.title}`,
              input: { payload: action.payload || {} },
              output: {
                activityId: activity.id,
                sourceId: activity.sourceId,
                title: activity.title,
              },
            }),
          );
          return;
        }

        if (action.kind === 'memory.search') {
          const query = payloadString(action.payload?.query) || actionSummary(action);
          const data = await backendJson<{
            answer?: string;
            counts?: Record<string, number>;
          }>('/api/memory/search', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(providerId === 'openai' && modelId ? { 'x-model': `openai:${modelId}` } : {}),
            },
            body: JSON.stringify({
              targetType: 'course',
              targetId: activeCourseId,
              query,
              conversationId: activeSessionId,
            }),
          });
          setMessages((current) => [
            ...current,
            {
              id: makeClientId('assistant-memory-search'),
              role: 'assistant',
              text:
                data.answer ||
                `我查了这门课的学习记忆，但没有找到足够明确的记录来回答「${query}」。`,
              createdAt: Date.now(),
            },
          ]);
          markLearningActionStatus(
            action.id,
            'completed',
            actionResult(action, {
              status: 'completed',
              summary: `已查询学习记忆：${query}`,
              input: { query },
              output: { counts: data.counts || {}, hasAnswer: Boolean(data.answer) },
            }),
          );
          return;
        }

        if (action.kind === 'web.search') {
          const query = payloadString(action.payload?.query) || actionSummary(action);
          const webConfig = webSearchProvidersConfig[webSearchProviderId];
          const data = await backendJson<{
            answer?: string;
            sources?: Array<{ title: string; url: string; content?: string; score?: number }>;
            query?: string;
            skipped?: boolean;
            reason?: string;
          }>('/api/web-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query,
              apiKey: webConfig?.apiKey || undefined,
              usageContext: {
                courseId: activeCourseId || undefined,
                courseName: activeCourse.name,
                operationCode: 'learn_web_search',
                chargeReason: '学习页联网搜索',
                serviceLabel: 'Tavily Web Search',
              },
            }),
          });
          if (data.skipped) {
            setMessages((current) => [
              ...current,
              {
                id: makeClientId('assistant-web-search-skipped'),
                role: 'assistant',
                text: '当前没有配置可用的网页搜索 API key，所以这次没有联网搜索。',
                createdAt: Date.now(),
              },
            ]);
            markLearningActionStatus(
              action.id,
              'failed',
              actionResult(action, {
                status: 'failed',
                summary: '网页搜索未执行：没有可用 API key。',
                input: { query },
                error: data.reason || 'Web search provider was not configured.',
              }),
            );
            return;
          }
          const artifact: LearnArtifact = {
            kind: 'web_search_result',
            id: makeClientId('web-search-artifact'),
            query: data.query || query,
            answer: data.answer || undefined,
            usedFor: payloadString(action.payload?.usedFor) || undefined,
            sources: (data.sources || []).slice(0, 8),
          };
          const sourceLines = artifact.sources
            .slice(0, 4)
            .map((source, index) => `${index + 1}. [${source.title}](${source.url})`)
            .join('\n');
          setMessages((current) => [
            ...current,
            {
              id: makeClientId('assistant-web-search'),
              role: 'assistant',
              text: [
                data.answer || `我查到了和「${query}」相关的网页来源。`,
                sourceLines ? `\n来源：\n${sourceLines}` : '',
              ]
                .filter(Boolean)
                .join('\n'),
              createdAt: Date.now(),
              artifacts: [artifact],
            },
          ]);
          markLearningActionStatus(
            action.id,
            'completed',
            actionResult(action, {
              status: 'completed',
              summary: `已完成网页搜索：${query}`,
              input: { query },
              output: {
                sourceCount: artifact.sources.length,
                artifactId: artifact.id,
              },
            }),
          );
          return;
        }

        if (action.kind === 'calendar.propose_add') {
          const events = learningActionCalendarEvents(action);
          const nextEvents = mergeSyllabusEvents(syllabusEvents, events);
          writeSyllabusEvents(localUserId, activeCourseId, nextEvents);
          setSyllabusEvents(nextEvents);
          setSyllabusImportMessage(`已添加 ${events.length} 个 AI 学习日程。`);
          setRightRailCollapsed(false);
          setRightRailView('calendar');
          setCalendarReferenceDate(new Date(`${events[0].date}T12:00:00`));
          announceSyllabusScheduleUpdated(events[0].title);
          markLearningActionStatus(
            action.id,
            'completed',
            actionResult(action, {
              status: 'completed',
              summary: `已加入 ${events.length} 个学习日历事项。`,
              input: { payload: action.payload || {} },
              output: {
                eventIds: events.map((event) => event.id),
                eventCount: events.length,
              },
            }),
          );
          toast.success('已加入学习日历。');
          return;
        }

        if (action.kind === 'calendar.propose_update') {
          const updateResult = applyLearningCalendarUpdate({ events: syllabusEvents, action });
          if (!updateResult) {
            setRightRailCollapsed(false);
            setRightRailView('calendar');
            setCalendarDialogOpen(true);
            markLearningActionStatus(
              action.id,
              'failed',
              actionResult(action, {
                status: 'failed',
                summary: '日历修改没有命中唯一事项。',
                input: { payload: action.payload || {} },
                error: 'Calendar update target was ambiguous.',
              }),
            );
            toast.error('这个日历修改没有命中唯一事项，请在日历里选择后再改。');
            return;
          }
          writeSyllabusEvents(localUserId, activeCourseId, updateResult.events);
          setSyllabusEvents(updateResult.events);
          setSyllabusImportMessage('已记录 AI 建议的日历调整，请在学习日历中检查。');
          setRightRailCollapsed(false);
          setRightRailView('calendar');
          setCalendarReferenceDate(new Date(`${updateResult.updated.date}T12:00:00`));
          announceSyllabusScheduleUpdated(updateResult.updated.title);
          markLearningActionStatus(
            action.id,
            'completed',
            actionResult(action, {
              status: 'completed',
              summary: `已调整日历事项：${updateResult.updated.title}`,
              input: { payload: action.payload || {} },
              output: {
                eventId: updateResult.updated.id,
                title: updateResult.updated.title,
                date: updateResult.updated.date,
              },
            }),
          );
          toast.success('日历调整已记录。');
          return;
        }

        if (action.kind === 'calendar.propose_delete') {
          const targets = actionTargets(action);
          const matches = uniqueCalendarTargetMatches(syllabusEvents, targets);
          if (matches.length !== 1) {
            setRightRailCollapsed(false);
            setRightRailView('calendar');
            setCalendarDialogOpen(true);
            markLearningActionStatus(
              action.id,
              'failed',
              actionResult(action, {
                status: 'failed',
                summary: '日历删除没有命中唯一事项。',
                input: { payload: action.payload || {} },
                error: 'Calendar delete target was ambiguous.',
              }),
            );
            toast.error('这个删除操作没有命中唯一事项，请在日历里手动确认。');
            return;
          }
          const targetId = matches[0].id;
          const nextEvents = syllabusEvents.filter((event) => event.id !== targetId);
          writeSyllabusEvents(localUserId, activeCourseId, nextEvents);
          setSyllabusEvents(nextEvents);
          setRightRailCollapsed(false);
          setRightRailView('calendar');
          markLearningActionStatus(
            action.id,
            'completed',
            actionResult(action, {
              status: 'completed',
              summary: '已删除 1 个日历事项。',
              input: { payload: action.payload || {} },
              output: { eventId: targetId },
            }),
          );
          toast.success('已删除 1 个日历事项。');
          return;
        }

        if (action.kind === 'learner_progress.request_confirmation') {
          setMessages((current) => [
            ...current,
            {
              id: makeClientId('assistant-progress-action'),
              role: 'assistant',
              text: '先确认一下学习进度；确认后我会按这个位置继续安排计划和复习。',
              createdAt: Date.now(),
              progressProposal: {
                selection: '',
                label: action.label || '确认学习进度',
                title: '确认学习进度',
                reason: actionSummary(action),
                confirmLabel: '确认进度',
                writeMode: 'progress',
              },
            },
          ]);
          setRightRailCollapsed(false);
          setRightRailView('learning');
          markLearningActionStatus(
            action.id,
            'completed',
            actionResult(action, {
              status: 'completed',
              summary: '已打开学习进度确认卡。',
              input: { payload: action.payload || {} },
              output: { pendingAction: 'progress_confirmation' },
            }),
          );
          return;
        }

        if (action.kind === 'practice.propose_generation') {
          if (!problems.length && isExplicitProblemBankSelectionRequest(actionSummary(action))) {
            setMessages((current) => [
              ...current,
              {
                id: makeClientId('assistant-no-course-bank-confirm'),
                role: 'assistant',
                text: buildNoCourseProblemBankAnswer({
                  course: activeCourse,
                  questionText: actionSummary(action),
                  notebooks,
                }),
                createdAt: Date.now(),
              },
            ]);
            markLearningActionStatus(
              action.id,
              'completed',
              actionResult(action, {
                status: 'completed',
                summary: '没有可用题库，已改为说明缺失而不是生成题库题。',
                input: { payload: action.payload || {} },
                output: { generatedPlan: false, missingEvidence: ['problem_bank'] },
              }),
            );
            return;
          }
          const currentState = loadLearnerCourseState({
            userId: localUserId,
            courseId: activeCourseId,
          });
          const currentSnapshot =
            snapshot ||
            summarizeLearnerCourseState({
              state: currentState,
              notebooks,
              problems,
            });
          if (!currentSnapshot.progressKnown) {
            setMessages((current) => [
              ...current,
              {
                id: makeClientId('assistant-practice-progress'),
                role: 'assistant',
                text: '生成练习前需要先确认学习进度，这样题目范围不会偏。',
                createdAt: Date.now(),
                progressProposal: {
                  selection: '',
                  label: '确认练习范围',
                  title: '确认练习范围',
                  reason: actionSummary(action),
                  confirmLabel: '确认并生成练习',
                  writeMode: 'planning_scope',
                },
                pendingAction: {
                  kind: 'practice_plan',
                  mode: 'practice',
                  prompt: actionSummary(action),
                },
              },
            ]);
            markLearningActionStatus(
              action.id,
              'completed',
              actionResult(action, {
                status: 'completed',
                summary: '练习生成已转为学习范围确认。',
                input: { payload: action.payload || {} },
                output: { generatedPlan: false, pendingAction: 'practice_plan' },
              }),
            );
            return;
          }
          const plan = buildPlan(
            'practice',
            actionSummary(action),
            typeof action.payload?.count === 'number' ? action.payload.count : undefined,
            learningActionPreferredConcepts(action),
            currentState,
          );
          if (!plan) {
            setMessages((current) => [
              ...current,
              {
                id: makeClientId('assistant-practice-empty'),
                role: 'assistant',
                text: '这门课当前没有足够题库内容生成练习计划。我先保留这个练习意图，你可以继续让我自生成讲解题。',
                createdAt: Date.now(),
              },
            ]);
          } else {
            addAssistantPlan(plan);
          }
          markLearningActionStatus(
            action.id,
            'completed',
            actionResult(action, {
              status: 'completed',
              summary: plan ? `已生成练习计划：${plan.title}` : '未能生成练习计划。',
              input: { payload: action.payload || {} },
              output: plan
                ? {
                    generatedPlan: true,
                    planId: plan.id,
                    problemCount: plan.problemIds.length,
                  }
                : { generatedPlan: false },
            }),
          );
          return;
        }

        if (action.kind === 'classroom.propose_temporary_explanation') {
          const topic = payloadString(action.payload?.topic) || action.label || '临时课堂讲解';
          const answer = actionSummary(action);
          const lecturePrompt = buildMiniLecturePrompt({
            question: topic,
            answer,
            course: activeCourse,
          });
          setMessages((current) => [
            ...current,
            {
              id: makeClientId('assistant-lecture-action'),
              role: 'assistant',
              text: lecturePrompt ? '已准备好临时课堂讲解。' : answer,
              createdAt: Date.now(),
              lecturePrompt,
            },
          ]);
          markLearningActionStatus(
            action.id,
            'completed',
            actionResult(action, {
              status: 'completed',
              summary: lecturePrompt ? `已准备临时课堂讲解：${topic}` : '已返回临时讲解文本。',
              input: { payload: action.payload || {} },
              output: { hasLecturePrompt: Boolean(lecturePrompt), topic },
            }),
          );
          return;
        }

        if (action.kind === 'image.propose_generation') {
          if (!imageGenerationEnabled) {
            markLearningActionStatus(
              action.id,
              'failed',
              actionResult(action, {
                status: 'failed',
                summary: '图片生成未执行：功能未开启。',
                input: { payload: action.payload || {} },
                error: 'Image generation is disabled.',
              }),
            );
            toast.error('图片生成功能还没有开启，请先到设置里启用图片生成。');
            return;
          }
          const prompt = payloadString(action.payload?.prompt) || actionSummary(action);
          if (!prompt) {
            markLearningActionStatus(
              action.id,
              'failed',
              actionResult(action, {
                status: 'failed',
                summary: '图片生成未执行：缺少 prompt。',
                input: { payload: action.payload || {} },
                error: 'Missing image prompt.',
              }),
            );
            toast.error('这个图片生成操作缺少 prompt。');
            return;
          }
          const aspectRatio = payloadString(action.payload?.aspectRatio) || '16:9';
          const imageConfig = imageProvidersConfig[imageProviderId];
          const data = await backendJson<{
            result?: {
              url?: string;
              base64?: string;
              width?: number;
              height?: number;
            };
          }>('/api/generate/image', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-image-provider': imageProviderId,
              'x-image-model': imageModelId,
              'x-api-key': imageConfig?.apiKey || '',
              'x-base-url': imageConfig?.baseUrl || '',
            },
            body: JSON.stringify({
              prompt,
              aspectRatio:
                aspectRatio === '4:3' ||
                aspectRatio === '1:1' ||
                aspectRatio === '9:16' ||
                aspectRatio === '16:9'
                  ? aspectRatio
                  : '16:9',
              notebookContext: {
                courseId: activeCourseId || undefined,
                courseName: activeCourse.name,
              },
            }),
          });
          const imageUrl = data.result?.url || data.result?.base64 || '';
          if (!imageUrl) throw new Error('图片生成完成，但响应里没有可展示图片。');
          const artifact: LearnArtifact = {
            kind: 'image_prompt_draft',
            id: makeClientId('image-artifact'),
            prompt,
            aspectRatio:
              aspectRatio === '4:3' ||
              aspectRatio === '1:1' ||
              aspectRatio === '9:16' ||
              aspectRatio === '16:9'
                ? aspectRatio
                : '16:9',
            sourceQuestion: latestUserLearnMessageText(messages),
            imageUrl,
            width: data.result?.width,
            height: data.result?.height,
          };
          setMessages((current) => [
            ...current,
            {
              id: makeClientId('assistant-image-result'),
              role: 'assistant',
              text: '图片已生成。',
              createdAt: Date.now(),
              artifacts: [artifact],
            },
          ]);
          markLearningActionStatus(
            action.id,
            'completed',
            actionResult(action, {
              status: 'completed',
              summary: '图片已生成。',
              input: { prompt, aspectRatio },
              output: {
                artifactId: artifact.id,
                hasImageUrl: Boolean(imageUrl),
                width: artifact.width,
                height: artifact.height,
              },
            }),
          );
          toast.success('图片已生成。');
          return;
        }

        if (action.kind === 'memory.propose_write') {
          const summary = actionSummary(action);
          const question = latestUserLearnMessageText(messages);
          const timestamp = Date.now();
          const currentState = loadLearnerCourseState({
            userId: localUserId,
            courseId: activeCourseId,
          });
          const concept = payloadString(action.payload?.concept) || summary.slice(0, 64);
          const weakPoint: LearnerWeakPoint = {
            id: makeClientId('weak'),
            concept,
            title: payloadString(action.payload?.title) || 'AI 确认的薄弱点',
            evidence: summary,
            source: 'chat',
            severity: 'medium',
            status: 'open',
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          const nextState = saveLearnerCourseState({
            ...currentState,
            activeWeakPoints: [
              weakPoint,
              ...currentState.activeWeakPoints.filter(
                (item) =>
                  item.evidence !== weakPoint.evidence && item.concept !== weakPoint.concept,
              ),
            ].slice(0, 30),
          });
          setSnapshot(
            summarizeLearnerCourseState({
              state: nextState,
              notebooks,
              problems,
            }),
          );
          void saveRemoteLearnerCourseState(nextState);
          try {
            await writeMemoryWithActivity({
              candidate: memoryWriteCandidateFromLearningAction({
                action,
                courseId: activeCourseId,
                summary,
                question,
              }),
            });
          } catch (error) {
            toast.warning(
              `已更新本地学习状态，但长期记忆暂时没有同步：${
                error instanceof Error ? error.message : '未知错误'
              }`,
            );
          }
          markLearningActionStatus(
            action.id,
            'completed',
            actionResult(action, {
              status: 'completed',
              summary: `已更新学习记忆：${concept}`,
              input: { payload: action.payload || {} },
              output: {
                weakPointId: weakPoint.id,
                concept,
                localStateUpdated: true,
              },
            }),
          );
          toast.success('已更新学习记忆。');
          return;
        }
      } catch (error) {
        markLearningActionStatus(
          action.id,
          'failed',
          actionResult(action, {
            status: 'failed',
            summary: '学习动作执行失败。',
            input: { payload: action.payload || {} },
            error: error instanceof Error ? error.message : String(error),
          }),
        );
        toast.error(error instanceof Error ? error.message : '学习动作执行失败。');
      }
    },
    [
      activeCourse,
      activeCourseId,
      activeSessionId,
      actionResult,
      addAssistantPlan,
      buildPlan,
      imageGenerationEnabled,
      imageModelId,
      imageProviderId,
      imageProvidersConfig,
      localUserId,
      markLearningActionStatus,
      messages,
      modelId,
      notebooks,
      problems,
      providerId,
      snapshot,
      startStatusCalendarActivity,
      statusCalendarActivities,
      syllabusEvents,
      webSearchProviderId,
      webSearchProvidersConfig,
    ],
  );

  const handleLearningActionCancel = useCallback(
    (action: LearningAction) => {
      if (!action?.id) return;
      markLearningActionStatus(action.id, 'cancelled');
      toast.info('已取消这个学习操作。');
    },
    [markLearningActionStatus],
  );

  useEffect(() => {
    const handleLearningActionEvent = (event: Event) => {
      const action = (event as CustomEvent<LearningAction>).detail;
      if (!action?.id || !action.kind) return;
      handleLearningActionConfirm(action);
    };
    const handleLearningActionCancelEvent = (event: Event) => {
      const action = (event as CustomEvent<LearningAction>).detail;
      if (!action?.id || !action.kind) return;
      handleLearningActionCancel(action);
    };
    window.addEventListener('syntara:learning-action-confirm', handleLearningActionEvent);
    window.addEventListener('syntara:learning-action-cancel', handleLearningActionCancelEvent);
    return () => {
      window.removeEventListener('syntara:learning-action-confirm', handleLearningActionEvent);
      window.removeEventListener('syntara:learning-action-cancel', handleLearningActionCancelEvent);
    };
  }, [handleLearningActionCancel, handleLearningActionConfirm]);

  const buildEvidenceBasedPlan = useCallback(
    async (args: {
      mode: PracticePlanMode;
      prompt: string;
      targetCount?: number;
      stateOverride?: LearnerCourseState;
      snapshotOverride?: LearnerCourseSnapshot;
      allowUnconfirmedSchedule?: boolean;
    }) => {
      if (!activeCourse) return null;
      const localUserId = userId || 'anonymous';
      const planState =
        args.stateOverride ||
        seedLearnerCourseStateFromCourse({
          userId: localUserId,
          course: activeCourse,
          notebooks,
          problems,
        });
      const planSnapshot =
        args.snapshotOverride ||
        summarizeLearnerCourseState({
          state: planState,
          notebooks,
          problems,
        });
      if (
        !planSnapshot.progressKnown &&
        !(args.allowUnconfirmedSchedule && syllabusPlanningEvents(syllabusEvents).length > 0)
      ) {
        return null;
      }

      try {
        const response = await requestTeachingReviewPlan({
          courseId: activeCourse.id,
          prompt: args.prompt,
          conversationId: activeSessionId,
          syllabusEvents,
          mode: args.mode,
          questionCount: args.targetCount,
        });
        return practicePlanFromTeachingReviewDecision({
          response,
          userId: localUserId,
          course: activeCourse,
          mode: args.mode,
          prompt: args.prompt,
          state: planState,
          snapshot: planSnapshot,
          targetCount: args.targetCount,
        });
      } catch (error) {
        console.warn(
          '[learn] evidence-based review plan unavailable:',
          error instanceof Error ? error.message : error,
        );
        return null;
      }
    },
    [activeCourse, activeSessionId, notebooks, problems, syllabusEvents, userId],
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
          const evidencePlan = await buildEvidenceBasedPlan({
            mode: action.mode,
            prompt: action.prompt,
            stateOverride: nextState,
            snapshotOverride: nextSnapshot,
          });
          if (evidencePlan) {
            addAssistantPlan(evidencePlan);
            return;
          }
          setMessages((current) => [
            ...current,
            {
              id: makeClientId('assistant-plan-empty'),
              role: 'assistant',
              text: '进度已经更新，但 AI 没有返回可用的练习计划。我没有使用本地计划兜底，请重试一次或换一个模型。',
              createdAt: Date.now(),
            },
          ]);
        } finally {
          setSending(false);
        }
        return;
      }

      const messagePrefix =
        action.kind === 'preview_plan' ? 'assistant-preview-plan' : 'assistant-review-plan';

      try {
        const learnTurn = await planLearnTurn({
          question: action.prompt,
          messages,
          course: activeCourse,
          snapshot: nextSnapshot,
          calendarEvents: syllabusEvents,
          recentActivities: statusCalendarActivities,
          recentPlans,
          problems,
          sourceUploads: courseSourceUploads,
          providerId,
          modelId,
        });
        const artifacts = (learnTurn?.artifacts || [])
          .map(normalizeLearnArtifact)
          .filter((artifact): artifact is LearnArtifact => Boolean(artifact));
        const learningActions = [
          ...(learnTurn?.proposals || []),
          ...(learnTurn?.directCalls || []),
        ].map((learnAction) =>
          learnActionToClientAction({
            action: learnAction,
            id: makeClientId('learn-action'),
            defaultConfirmation: learnActionRequiresConfirmation(learnAction.kind)
              ? 'required'
              : 'none',
          }),
        );
        const text = learnTurn?.replyText?.trim() || '';
        if (!text && !artifacts.length && !learningActions.length) {
          throw new Error('AI 没有返回可展示的计划草稿。');
        }
        setMessages((current) => [
          ...current,
          {
            id: makeClientId(messagePrefix),
            role: 'assistant',
            text,
            createdAt: Date.now(),
            artifacts: artifacts.length ? artifacts : undefined,
            learningActions: learningActions.length ? learningActions : undefined,
            publicTrace: publicTraceFromLearnTurn(learnTurn, {
              question: action.prompt,
              progressKnown: nextSnapshot.progressKnown,
              calendarCount: syllabusEvents.length,
              problemCount: problems.length,
            }),
          },
        ]);
        refreshLearnerSnapshot();
      } catch (error) {
        const message = error instanceof Error ? error.message : '学习路由失败';
        setMessages((current) => [
          ...current,
          {
            id: makeClientId('assistant-learn-router-error'),
            role: 'assistant',
            text: `${message}。我没有使用本地兜底计划，请稍后重试或换一个模型。`,
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
      buildEvidenceBasedPlan,
      courseSourceUploads,
      messages,
      modelId,
      problems,
      providerId,
      recentPlans,
      refreshLearnerSnapshot,
      statusCalendarActivities,
      syllabusEvents,
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
    (args: { snapshot: LearnerCourseSnapshot | null }) => {
      const progressKnown = Boolean(args.snapshot?.progressKnown);
      const selection = progressSelectionFromSnapshot(args.snapshot);
      const progressRequest = createLearnProgressRequest({
        progressKnown,
        snapshotSelection: selection,
        selectionLabel: progressLabelForSelection(selection, notebooks),
      });
      const messageId = makeClientId('assistant-progress-proposal');
      setMessages((current) => [
        ...current,
        {
          id: messageId,
          role: 'assistant',
          text: progressRequest.text,
          createdAt: Date.now(),
          progressProposal: progressRequest.proposal,
          pendingAction: progressRequest.pendingAction,
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
      const pendingWorkflowMessageId = hasAttachments ? null : makeClientId('assistant-workflow');
      const pendingWorkflowMessage: LearnMessage | null = pendingWorkflowMessageId
        ? {
            id: pendingWorkflowMessageId,
            role: 'assistant',
            text: '',
            createdAt: Date.now(),
            publicTrace: pendingPublicTraceForQuestion(questionText),
            transient: true,
          }
        : null;
      setDraft('');
      setAttachments([]);
      setError(null);
      setSending(true);
      setMessages((current) => {
        const nextMessages: LearnMessage[] = [
          ...current,
          {
            id: makeClientId('user'),
            role: 'user',
            text: questionText,
            attachments: outgoingAttachments,
            createdAt: Date.now(),
          },
        ];
        if (pendingWorkflowMessage) nextMessages.push(pendingWorkflowMessage);
        return nextMessages;
      });
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

      let learnTurn: LearnTurnClientResponse | null = null;
      if (!hasAttachments) {
        try {
          learnTurn = await planLearnTurn({
            question: questionText,
            messages,
            course: activeCourse,
            snapshot: questionSnapshot,
            calendarEvents: syllabusEvents,
            recentActivities: statusCalendarActivities,
            recentPlans,
            problems,
            sourceUploads: courseSourceUploads,
            providerId,
            modelId,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : '学习路由失败';
          const errorMessage: LearnMessage = {
            id: makeClientId('assistant-learn-router-error'),
            role: 'assistant',
            text: `${message}。我没有使用本地兜底计划，请稍后重试或换一个模型。`,
            createdAt: Date.now(),
            publicTrace: [
              ...pendingPublicTraceForQuestion(questionText).slice(0, 2),
              makePublicTraceStep(
                'router-blocked',
                '路由没有返回可执行结构',
                '没有拿到合法的结构化学习决定，所以停止生成计划或题目。',
                undefined,
                'blocked',
              ),
            ],
          };
          setMessages((current) =>
            pendingWorkflowMessageId
              ? replaceLearnMessage(current, pendingWorkflowMessageId, errorMessage)
              : [...current, errorMessage],
          );
          setSending(false);
          return;
        }
      }
      const learnTurnAnswerMode = learnTurn?.answerMode || 'course_answer';
      const shouldContinueToCourseAnswer = learnTurnAnswerMode === 'course_answer';
      const actionPlanArtifacts = (learnTurn?.artifacts || [])
        .map(normalizeLearnArtifact)
        .filter((artifact): artifact is LearnArtifact => Boolean(artifact));
      const learnTurnPlanningDecision = planningDecisionFromLearnTurn(learnTurn, questionText);
      const answererHandoff = answererHandoffFromLearnTurn(learnTurn);
      const proposalActions = filterLearningActionsForQuestion(
        (learnTurn?.proposals || []).map((action) =>
          learnActionToClientAction({
            action,
            id: makeClientId('learn-action'),
            defaultConfirmation: learnActionRequiresConfirmation(action.kind) ? 'required' : 'none',
          }),
        ),
        questionText,
      );
      const directActions = (learnTurn?.directCalls || []).map((action) =>
        learnActionToClientAction({
          action,
          id: makeClientId('learn-action'),
          defaultConfirmation: 'none',
        }),
      );
      const deferredAnswerActions = shouldContinueToCourseAnswer
        ? proposalActions.filter(
            (action) =>
              action.kind === 'memory.propose_write' ||
              action.kind === 'classroom.propose_temporary_explanation',
          )
        : [];
      const blockingProposalActions = shouldContinueToCourseAnswer
        ? proposalActions.filter(
            (action) =>
              action.kind !== 'memory.propose_write' &&
              action.kind !== 'classroom.propose_temporary_explanation',
          )
        : proposalActions;
      const deferredAnswerArtifacts = shouldContinueToCourseAnswer ? actionPlanArtifacts : [];
      const visibleActionPlanArtifacts = shouldContinueToCourseAnswer ? [] : actionPlanArtifacts;
      const visibleBlockingProposalActions = blockingProposalActions;
      const visibleDirectActions = directActions;
      const visibleArtifacts = visibleActionPlanArtifacts;
      const actionPlanText = learnTurn?.replyText?.trim() || '';
      if (actionPlanText || visibleBlockingProposalActions.length || visibleArtifacts.length) {
        const actionPlanMessage: LearnMessage = {
          id: makeClientId('assistant-action-plan'),
          role: 'assistant',
          text: actionPlanText,
          createdAt: Date.now(),
          learningActions: visibleBlockingProposalActions.length
            ? visibleBlockingProposalActions
            : undefined,
          artifacts: visibleArtifacts.length ? visibleArtifacts : undefined,
          publicTrace: publicTraceFromLearnTurn(learnTurn, {
            question: questionText,
            progressKnown: questionSnapshot.progressKnown,
            calendarCount: syllabusEvents.length,
            problemCount: problems.length,
          }),
        };
        setMessages((current) =>
          pendingWorkflowMessageId
            ? replaceLearnMessage(current, pendingWorkflowMessageId, actionPlanMessage)
            : [...current, actionPlanMessage],
        );
      }
      if (visibleDirectActions.length) {
        for (const action of visibleDirectActions) {
          await handleLearningActionConfirm(action);
        }
        if (!actionPlanText && !visibleBlockingProposalActions.length && !visibleArtifacts.length) {
          const actionOnlyMessage: LearnMessage = {
            id: makeClientId('assistant-action-plan'),
            role: 'assistant',
            text: '已完成这次结构化学习操作。',
            createdAt: Date.now(),
            publicTrace: publicTraceFromLearnTurn(learnTurn, {
              question: questionText,
              progressKnown: questionSnapshot.progressKnown,
              calendarCount: syllabusEvents.length,
              problemCount: problems.length,
            }),
          };
          setMessages((current) =>
            pendingWorkflowMessageId
              ? replaceLearnMessage(current, pendingWorkflowMessageId, actionOnlyMessage)
              : [...current, actionOnlyMessage],
          );
        }
      }
      if (
        visibleDirectActions.length ||
        visibleBlockingProposalActions.length ||
        visibleArtifacts.length ||
        learnTurnAnswerMode === 'action_only' ||
        learnTurnAnswerMode === 'none'
      ) {
        if (
          pendingWorkflowMessageId &&
          !actionPlanText &&
          !visibleBlockingProposalActions.length &&
          !visibleArtifacts.length &&
          !visibleDirectActions.length
        ) {
          setMessages((current) => removeLearnMessage(current, pendingWorkflowMessageId));
        }
        setSending(false);
        return;
      }

      const planningDecision = learnTurnPlanningDecision;

      const planningIntent = planningDecision?.intent ?? null;
      const planningPrompt = planningDecision?.resolvedPrompt || questionText;

      if (!hasAttachments && planningIntent && planningDecision) {
        if (planningIntent.kind === 'practice_plan') {
          const evidencePlan = await buildEvidenceBasedPlan({
            mode: planningIntent.mode,
            prompt: planningPrompt,
            stateOverride: questionState,
            snapshotOverride: questionSnapshot,
          });
          if (evidencePlan) {
            if (pendingWorkflowMessageId) {
              setMessages((current) => removeLearnMessage(current, pendingWorkflowMessageId));
            }
            addAssistantPlan(evidencePlan);
            setSending(false);
            return;
          }
          const emptyPlanMessage: LearnMessage = {
            id: makeClientId('assistant-plan-empty'),
            role: 'assistant',
            text: 'AI 没有返回可用的练习计划。我没有使用本地计划兜底，请重试一次或换一个模型。',
            createdAt: Date.now(),
            publicTrace: [
              ...pendingPublicTraceForQuestion(questionText).slice(0, 2),
              makePublicTraceStep(
                'practice-plan-blocked',
                '练习计划不可展示',
                '已经识别为练习计划请求，但没有拿到可用的题目/计划结构。',
                undefined,
                'blocked',
              ),
            ],
          };
          setMessages((current) =>
            pendingWorkflowMessageId
              ? replaceLearnMessage(current, pendingWorkflowMessageId, emptyPlanMessage)
              : [...current, emptyPlanMessage],
          );
          setSending(false);
          return;
        }

        const missingArtifactMessage: LearnMessage = {
          id: makeClientId('assistant-ai-plan-missing-artifact'),
          role: 'assistant',
          text: 'AI 已识别这是学习计划请求，但没有返回可展示的计划草稿。我没有使用本地计划兜底，请重试一次或换一个模型。',
          createdAt: Date.now(),
          publicTrace: [
            ...pendingPublicTraceForQuestion(questionText).slice(0, 2),
            makePublicTraceStep(
              'artifact-blocked',
              '计划草稿不可展示',
              '路由给出了计划意图，但没有返回合格的 plan artifact。',
              undefined,
              'blocked',
            ),
          ],
        };
        setMessages((current) =>
          pendingWorkflowMessageId
            ? replaceLearnMessage(current, pendingWorkflowMessageId, missingArtifactMessage)
            : [...current, missingArtifactMessage],
        );
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
          answererHandoff,
          learnerContext: buildLearnerChatContext({
            snapshot: questionSnapshot,
            state: questionState,
            plans: recentPlans,
            syllabusEvents,
          }),
          userProfile: { nickname: userName },
        });
        const rawAnswer = normalizeCourseAssistantAnswer(
          latestAssistantText(result.messages) || result.answer || '我先记录下这个问题。',
        );
        const learningActions = filterLearningActionsForQuestion(
          [...latestAssistantLearningActions(result.messages), ...deferredAnswerActions],
          questionText,
        );
        const answer = neutralizeUnconfirmedMemoryWriteClaim(rawAnswer, learningActions);
        const lecturePrompt = buildMiniLecturePrompt({
          question: questionText,
          answer,
          course: activeCourse,
        });
        const evidenceArtifact = answerEvidenceArtifactFromCourseContext({
          courseContext: result.courseContext,
          question: questionText,
        });
        const artifacts = [
          ...(evidenceArtifact ? [evidenceArtifact] : []),
          ...deferredAnswerArtifacts,
        ];
        const answerMessage: LearnMessage = {
          id: makeClientId('assistant'),
          role: 'assistant',
          text: answer,
          createdAt: Date.now(),
          lecturePrompt,
          learningActions: learningActions.length ? learningActions : undefined,
          artifacts: artifacts.length ? artifacts : undefined,
          publicTrace: publicTraceFromLearnTurn(learnTurn, {
            question: questionText,
            progressKnown: questionSnapshot.progressKnown,
            calendarCount: syllabusEvents.length,
            problemCount: problems.length,
          }),
        };
        setMessages((current) =>
          pendingWorkflowMessageId
            ? replaceLearnMessage(current, pendingWorkflowMessageId, answerMessage)
            : [...current, answerMessage],
        );
        refreshLearnerSnapshot();
      } catch (err) {
        const message = err instanceof Error ? err.message : '课程回复失败';
        const errorMessage: LearnMessage = {
          id: makeClientId('assistant-error'),
          role: 'assistant',
          text: `${message}。我没有生成本地兜底回答，请稍后重试或换一个模型。`,
          createdAt: Date.now(),
          publicTrace: [
            ...pendingPublicTraceForQuestion(questionText).slice(0, 2),
            makePublicTraceStep(
              'answer-blocked',
              '课程讲解没有完成',
              '已经进入课程讲解路径，但回答生成没有成功完成。',
              undefined,
              'blocked',
            ),
          ],
        };
        setMessages((current) =>
          pendingWorkflowMessageId
            ? replaceLearnMessage(current, pendingWorkflowMessageId, errorMessage)
            : [...current, errorMessage],
        );
      } finally {
        setSending(false);
      }
    },
    [
      activeCourse,
      addAssistantPlan,
      attachments,
      buildEvidenceBasedPlan,
      courseSourceUploads,
      draft,
      handleLearningActionConfirm,
      messages,
      modelId,
      notebooks,
      problems,
      providerId,
      refreshLearnerSnapshot,
      statusCalendarActivities,
      recentPlans,
      selectedKnownNoVision,
      sending,
      sourceUploading,
      syllabusEvents,
      userId,
      userName,
    ],
  );

  const sourceBackedNotebookIds = useMemo(() => {
    const ids = new Set<string>();
    for (const upload of courseSourceUploads) {
      for (const notebookId of upload.notebookIds) ids.add(notebookId);
    }
    return ids;
  }, [courseSourceUploads]);

  const sourceLibraryTiles = useMemo<SourceLibraryTile[]>(() => {
    const uploadTiles = courseSourceUploads.map((upload) => {
      const isProblemBank = upload.allQuestionUpload === true || upload.kind === 'problem_bank';
      const sectionCount = upload.stats.sectionCount || upload.sectionIds.length;
      const problemCount = upload.stats.problemCount || upload.problemIds.length;
      const updatedLabel = formatLibraryItemDate(upload.updatedAt);
      return {
        id: `source-${upload.sourceHash}`,
        tileKind: 'source' as const,
        title: upload.topic || upload.title,
        subtitle: isProblemBank
          ? problemCount > 0
            ? `${problemCount} 道题`
            : '题库文件'
          : sectionCount > 0
            ? `${sectionCount} 段笔记`
            : sourceUploadKindLabel(upload.kind),
        dateLabel: updatedLabel,
        coverImagePath: isProblemBank ? null : upload.coverImagePath,
        placeholderLabel: isProblemBank ? '题库' : 'Notebook',
        typeLabel: isProblemBank ? '题库' : sourceUploadKindLabel(upload.kind),
        updatedAt: Date.parse(upload.updatedAt) || 0,
        isProblemBank,
        status: null as LearnSourceUploadStatus | null,
        error: null as string | null,
        sourceHash: upload.sourceHash,
        textNotebookIds: upload.notebookIds,
        textSectionIds: upload.sectionIds,
        textBlocks: (upload.textSections || []).map((section) => ({
          id: section.id,
          title: section.title,
          markdown: section.markdown,
        })),
      };
    });

    const notebookTiles = notebooks
      .filter((notebook) => !sourceBackedNotebookIds.has(notebook.id))
      .map((notebook) => ({
        id: `notebook-${notebook.id}`,
        tileKind: 'notebook' as const,
        title: notebook.name,
        subtitle:
          notebook.notebookKind === 'markdown'
            ? `${notebook.sectionCount || 0} 段笔记`
            : `${notebook.sceneCount || 0} 页`,
        dateLabel: formatLibraryItemDate(notebook.updatedAt),
        coverImagePath: notebook.coverImagePath || null,
        placeholderLabel: notebook.notebookKind === 'markdown' ? 'Notebook' : 'Image notebook',
        typeLabel: notebook.notebookKind === 'markdown' ? '笔记本' : '图片笔记本',
        updatedAt: notebook.updatedAt || 0,
        isProblemBank: false,
        status: null as LearnSourceUploadStatus | null,
        error: null as string | null,
        sourceHash: null,
        textNotebookIds: notebook.notebookKind === 'markdown' ? [notebook.id] : [],
        textSectionIds: [],
        textBlocks: [],
      }));

    return [...uploadTiles, ...notebookTiles].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [courseSourceUploads, notebooks, sourceBackedNotebookIds]);

  const transientSourceUploadTiles = useMemo<SourceLibraryTile[]>(
    () =>
      sourceUploadItems
        .filter((item) => item.status !== 'stored')
        .map((item) => ({
          id: `transient-${item.id}`,
          tileKind: 'transient' as const,
          title: item.fileName,
          subtitle: item.status === 'ingesting' ? '入库中' : '入库失败',
          dateLabel: formatLibraryItemDate(item.updatedAt),
          coverImagePath: null,
          placeholderLabel: item.sourceKind === 'problem_bank' ? '题库' : 'Notebook',
          typeLabel: sourceUploadKindLabel(item.sourceKind),
          updatedAt: item.updatedAt,
          isProblemBank: item.sourceKind === 'problem_bank',
          status: item.status,
          error: item.error ?? null,
          sourceHash: null,
          textNotebookIds: [],
          textSectionIds: [],
          textBlocks: [],
        })),
    [sourceUploadItems],
  );

  const allSourceLibraryTiles = useMemo(
    () => [...transientSourceUploadTiles, ...sourceLibraryTiles],
    [sourceLibraryTiles, transientSourceUploadTiles],
  );

  const selectedSourceLibraryTile = useMemo(
    () => allSourceLibraryTiles.find((tile) => tile.id === selectedSourceLibraryTileId) ?? null,
    [allSourceLibraryTiles, selectedSourceLibraryTileId],
  );
  const selectedSourceLibraryTileCacheState = selectedSourceLibraryTile
    ? sourceLibraryTextCache[selectedSourceLibraryTile.id]?.status
    : undefined;

  useEffect(() => {
    if (!selectedSourceLibraryTile || !selectedSourceLibraryTile.textNotebookIds.length) return;
    if (selectedSourceLibraryTile.textBlocks.length > 0) return;
    if (selectedSourceLibraryTileCacheState && selectedSourceLibraryTileCacheState !== 'failed') {
      return;
    }

    let alive = true;
    setSourceLibraryTextCache((current) => ({
      ...current,
      [selectedSourceLibraryTile.id]: { status: 'loading', text: '' },
    }));
    const loadingFallbackId = setTimeout(() => {
      if (!alive) return;
      setSourceLibraryTextCache((current) => {
        if (current[selectedSourceLibraryTile.id]?.status !== 'loading') return current;
        return {
          ...current,
          [selectedSourceLibraryTile.id]: {
            status: 'empty',
            text: '',
          },
        };
      });
    }, 6000);

    void Promise.all(
      selectedSourceLibraryTile.textNotebookIds.map((notebookId) =>
        loadNotebookMarkdownPreview(notebookId).catch(() => null),
      ),
    )
      .then((previewResults) => {
        if (!alive) return;
        const text = sourceLibraryTextFromMarkdownPreviews(
          previewResults,
          selectedSourceLibraryTile.textSectionIds,
        );
        setSourceLibraryTextCache((current) => ({
          ...current,
          [selectedSourceLibraryTile.id]: {
            status: text ? 'ready' : 'empty',
            text,
          },
        }));
      })
      .catch((err) => {
        if (!alive) return;
        setSourceLibraryTextCache((current) => ({
          ...current,
          [selectedSourceLibraryTile.id]: {
            status: 'failed',
            text: '',
            error: err instanceof Error ? err.message : '文本读取失败',
          },
        }));
      });

    return () => {
      alive = false;
      clearTimeout(loadingFallbackId);
    };
  }, [selectedSourceLibraryTile, selectedSourceLibraryTileCacheState]);

  const selectedSourceLibraryTextState = selectedSourceLibraryTile
    ? sourceLibraryTextCache[selectedSourceLibraryTile.id]
    : undefined;
  const selectedSourceLibraryHasImage = Boolean(selectedSourceLibraryTile?.coverImagePath);
  const selectedSourceLibraryPreloadedText = selectedSourceLibraryTile
    ? sourceLibraryTextFromBlocks(selectedSourceLibraryTile.textBlocks)
    : '';
  const selectedSourceLibraryText =
    selectedSourceLibraryPreloadedText.trim() || selectedSourceLibraryTextState?.text.trim() || '';
  const selectedSourceLibraryHasText =
    Boolean(selectedSourceLibraryPreloadedText.trim()) ||
    (selectedSourceLibraryTextState?.status === 'ready' && selectedSourceLibraryText.length > 0);
  const selectedSourceLibraryTextResolved =
    selectedSourceLibraryTextState?.status === 'empty' ||
    selectedSourceLibraryTextState?.status === 'failed';
  const selectedSourceLibraryTextLoading =
    Boolean(selectedSourceLibraryTile?.textNotebookIds.length) &&
    !selectedSourceLibraryTile?.textBlocks.length &&
    (!selectedSourceLibraryTextState || selectedSourceLibraryTextState.status === 'loading');
  const showSourceLibraryViewSwitch = selectedSourceLibraryHasImage && selectedSourceLibraryHasText;
  const effectiveSourceLibraryDetailView: SourceLibraryDetailView = showSourceLibraryViewSwitch
    ? sourceLibraryDetailView
    : selectedSourceLibraryHasText ||
        selectedSourceLibraryTextResolved ||
        (!selectedSourceLibraryHasImage && selectedSourceLibraryTextLoading)
      ? 'text'
      : 'image';

  const loadSourceLibraryTileText = useCallback((tile: SourceLibraryTile) => {
    if (!tile.textNotebookIds.length || tile.textBlocks.length > 0) return;
    setSourceLibraryTextCache((current) => ({
      ...current,
      [tile.id]: { status: 'loading', text: '' },
    }));
    const loadingFallbackId = setTimeout(() => {
      setSourceLibraryTextCache((current) => {
        if (current[tile.id]?.status !== 'loading') return current;
        return {
          ...current,
          [tile.id]: {
            status: 'empty',
            text: '',
          },
        };
      });
    }, 6000);

    void Promise.all(
      tile.textNotebookIds.map((notebookId) =>
        loadNotebookMarkdownPreview(notebookId).catch(() => null),
      ),
    )
      .then((previewResults) => {
        const text = sourceLibraryTextFromMarkdownPreviews(previewResults, tile.textSectionIds);
        setSourceLibraryTextCache((current) => ({
          ...current,
          [tile.id]: {
            status: text ? 'ready' : 'empty',
            text,
          },
        }));
      })
      .catch((err) => {
        setSourceLibraryTextCache((current) => ({
          ...current,
          [tile.id]: {
            status: 'failed',
            text: '',
            error: err instanceof Error ? err.message : '文本读取失败',
          },
        }));
      })
      .finally(() => {
        clearTimeout(loadingFallbackId);
      });
  }, []);

  const handleDeleteSourceLibraryTile = useCallback(
    async (tile: SourceLibraryTile) => {
      if (!activeCourse?.id || !tile.sourceHash) return;
      const sourceHash = tile.sourceHash;
      if (deletingSourceHashes.includes(sourceHash)) return;

      setDeletingSourceHashes((current) =>
        current.includes(sourceHash) ? current : [...current, sourceHash],
      );
      try {
        await deleteCourseSourceUpload({
          courseId: activeCourse.id,
          sourceHash,
        });
        setCourseSourceUploads((current) =>
          current.filter((upload) => upload.sourceHash !== sourceHash),
        );
        setSourceLibraryTextCache((current) => {
          const next = { ...current };
          delete next[tile.id];
          return next;
        });
        if (selectedSourceLibraryTileId === tile.id) {
          setSelectedSourceLibraryTileId(null);
          setSourceLibraryDetailView('image');
          setSourceLibraryImageExpanded(false);
        }
        const [nextNotebooks, nextProblems, nextSourceUploads] = await Promise.all([
          listStagesByCourse(activeCourse.id).catch(() => notebooks),
          listCourseProblemSummaries(activeCourse.id).catch(() => problems),
          listCourseSourceUploads(activeCourse.id).catch(() => null),
        ]);
        setNotebooks(nextNotebooks);
        setProblems(nextProblems);
        if (nextSourceUploads) setCourseSourceUploads(nextSourceUploads);
        toast.success('已删除资料及相关记录');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '删除资料失败');
      } finally {
        setDeletingSourceHashes((current) => current.filter((hash) => hash !== sourceHash));
      }
    },
    [activeCourse?.id, deletingSourceHashes, notebooks, problems, selectedSourceLibraryTileId],
  );

  const resolvingActiveCourse = coursesLoadState === 'ready' && courses.length > 0 && !activeCourse;

  if (
    !hydrated ||
    coursesLoadState === 'idle' ||
    coursesLoadState === 'loading' ||
    resolvingActiveCourse
  ) {
    return (
      <div className="grid h-full min-h-[70dvh] place-items-center text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          加载课程…
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
          const deletingThisCourse = deletingCourseId === course.id;
          const isEnrolledCourse = course.accessRole === 'enrolled';
          return (
            <div
              key={course.id}
              role="button"
              tabIndex={0}
              onClick={() => {
                if (!deletingCourseId) switchCourse(course.id);
              }}
              onKeyDown={(event) => {
                if (deletingCourseId) return;
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  switchCourse(course.id);
                }
              }}
              className={cn(
                leftRailCollapsed
                  ? 'flex size-12 cursor-pointer items-center justify-center rounded-[15px] transition hover:bg-white hover:shadow-sm hover:ring-1 hover:ring-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200'
                  : 'group relative flex min-h-[68px] w-full min-w-0 cursor-pointer items-center gap-3 rounded-[18px] border px-3 py-2.5 text-left transition hover:border-slate-200 hover:bg-white hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200',
                active
                  ? leftRailCollapsed
                    ? 'bg-white shadow-sm ring-1 ring-sky-200'
                    : 'border-sky-200 bg-sky-50/55 shadow-[0_12px_28px_rgba(14,165,233,0.10)]'
                  : !leftRailCollapsed
                    ? 'border-transparent bg-transparent'
                    : null,
              )}
              aria-current={active ? 'page' : undefined}
              aria-disabled={deletingThisCourse ? true : undefined}
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
                </span>
              ) : null}
              {!leftRailCollapsed ? (
                <button
                  type="button"
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-[10px] text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 dark:hover:bg-rose-500/10 dark:hover:text-rose-300',
                    active || deletingThisCourse
                      ? 'opacity-100'
                      : 'opacity-70 group-hover:opacity-100 group-focus-within:opacity-100',
                  )}
                  disabled={Boolean(deletingCourseId)}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleDeleteCourse(course);
                  }}
                  aria-label={`${isEnrolledCourse ? '移除课程' : '删除课程'} ${course.name}`}
                  title={isEnrolledCourse ? '从我的课程移除' : '删除课程'}
                >
                  {deletingThisCourse ? (
                    <Loader2 className="size-4 animate-spin" strokeWidth={1.8} />
                  ) : (
                    <Trash2 className="size-4" strokeWidth={1.8} />
                  )}
                </button>
              ) : null}
            </div>
          );
        })}
        {courses.length === 0 && !leftRailCollapsed ? (
          <div className="pt-1 text-sm">
            <div className="flex items-start gap-3 px-1">
              <span className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-sky-50/80 text-sky-700 ring-1 ring-sky-100/80 dark:bg-sky-400/10 dark:text-sky-100 dark:ring-sky-300/15">
                <BookOpenCheck className="size-[18px]" strokeWidth={1.75} />
              </span>
              <div className="min-w-0">
                <p className="font-semibold leading-5 text-slate-950 dark:text-slate-50">
                  课程库为空
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  添加课程后，聊天、资料和记忆会自动归到对应上下文。
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-1.5">
              <button
                type="button"
                className="group flex h-10 w-full items-center justify-between rounded-[13px] bg-white/75 px-3 text-[13px] font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200/75 transition hover:bg-white hover:text-slate-950 hover:ring-sky-200 dark:bg-white/5 dark:text-slate-200 dark:ring-white/10 dark:hover:bg-white/10"
                onClick={() => setCreateCourseOpen(true)}
              >
                <span className="flex items-center gap-2">
                  <Plus className="size-3.5 text-sky-600" strokeWidth={1.9} />
                  新建课程
                </span>
                <ChevronRight
                  className="size-3.5 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-sky-500"
                  strokeWidth={1.8}
                />
              </button>
              <button
                type="button"
                className="group flex h-10 w-full items-center justify-between rounded-[13px] px-3 text-[13px] font-semibold text-slate-600 transition hover:bg-white/70 hover:text-slate-950 hover:shadow-sm hover:ring-1 hover:ring-slate-200/75 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-slate-50 dark:hover:ring-white/10"
                onClick={() => router.push('/store/courses')}
              >
                <span className="flex items-center gap-2">
                  <ShoppingBag className="size-3.5 text-slate-400" strokeWidth={1.9} />
                  去课程商城
                </span>
                <ChevronRight
                  className="size-3.5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500"
                  strokeWidth={1.8}
                />
              </button>
            </div>
          </div>
        ) : null}
        {courses.length === 0 && leftRailCollapsed ? (
          <button
            type="button"
            onClick={() => persistLeftRailCollapsed(false)}
            className="grid size-12 place-items-center rounded-[15px] border border-slate-200/75 bg-white/75 text-slate-500 shadow-sm transition hover:bg-white hover:text-slate-950 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 dark:hover:text-slate-50"
            aria-label="添加课程"
            title="添加课程"
          >
            <ShoppingBag className="size-5" strokeWidth={1.8} />
          </button>
        ) : null}
      </nav>

      {courses.length > 0 ? (
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
            onClick={() => setCreateCourseOpen(true)}
            aria-label="新建课程"
            title="新建课程"
          >
            <Plus className="size-4" />
            {!leftRailCollapsed ? '新建课程' : null}
          </Button>
        </div>
      ) : null}
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
            <p className="text-sm font-semibold text-foreground">
              {isResearchCourse ? '研究日历' : '学习日历'}
            </p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{calendarMonthLabel}</p>
        </div>
        <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
          {snapshot?.dueReviewCount
            ? `${snapshot.dueReviewCount} 个复习`
            : isResearchCourse
              ? '暂无安排'
              : '暂无到期'}
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
              day.syllabusCount
                ? `${day.syllabusCount} 个${isResearchCourse ? '研究日程' : 'syllabus 事项'}`
                : '',
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
              {isResearchCourse
                ? '研究日程'
                : syllabusEvents.length
                  ? 'syllabus 日程'
                  : '导入 syllabus'}
            </p>
          </div>
          {syllabusEvents.length ? (
            <p className="mt-1 text-xs text-muted-foreground">{syllabusEvents.length} 个事项</p>
          ) : null}
        </div>
        {isResearchCourse || syllabusEvents.length ? null : (
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

      <button
        type="button"
        onClick={openManualScheduleDialog}
        className={cn(
          rightRailRowClassName,
          'mt-3 flex w-full items-center justify-between gap-3 text-left transition hover:border-sky-200 hover:bg-sky-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-100 dark:hover:border-sky-300/20 dark:hover:bg-sky-400/10 dark:focus-visible:ring-sky-300/20',
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sky-50 text-sky-700 ring-1 ring-sky-100 dark:bg-sky-400/10 dark:text-sky-100 dark:ring-sky-300/15">
            <Plus className="size-4" strokeWidth={1.8} />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold leading-5 text-slate-900 dark:text-slate-100">
              添加日程
            </span>
            <span className="mt-0.5 block text-[11px] leading-4 text-slate-500 dark:text-slate-400">
              {isResearchCourse ? '手动补一个会议、DDL 或研究提醒' : '手动补一个作业、考试或提醒'}
            </span>
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-slate-400" strokeWidth={1.8} />
      </button>

      {syllabusEvents.length ? (
        <div className={cn(rightRailRowClassName, 'mt-3 space-y-2 text-xs leading-5')}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-foreground">
              {isResearchCourse ? '管理日程' : '管理 syllabus'}
            </span>
          </div>
          <p className="text-muted-foreground">
            {isResearchCourse
              ? `已记录 ${syllabusEventSummary || `${syllabusEvents.length} 个事项`}，可以把这些日期作为研究推进的约束。`
              : syllabusNeedsReview
                ? `目前只识别到 ${syllabusEventSummary || `${syllabusEvents.length} 个事项`}，建议先补充关键日期，再安排复习。`
                : `已记录 ${syllabusEventSummary}，可以把这些日期作为约束来安排复习和刷题。`}
          </p>
          <div className="flex flex-wrap gap-2">
            {isResearchCourse ? null : (
              <Button
                type="button"
                size="sm"
                variant={syllabusNeedsReview ? 'default' : 'outline'}
                className="h-8 rounded-full px-3 text-xs"
                onClick={openSyllabusEditDialog}
              >
                更改
              </Button>
            )}
            {isResearchCourse ? null : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-full px-3 text-xs"
                onClick={() => openSyllabusUploadDialog('replace')}
              >
                重新上传
              </Button>
            )}
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
                  isResearchCourse
                    ? '我已经添加了研究日程。请结合这些会议、DDL 和研究节点，帮我安排接下来两周的研究推进计划。'
                    : '我已经导入了 syllabus 日程。请结合这些作业、考试和课程进度，帮我安排接下来两周的学习计划；如果还不清楚我的学习进度，请先让我确认。',
                );
              }}
            >
              {isResearchCourse ? '安排研究计划' : '安排学习计划'}
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
                <span>{scheduleEventLabel(event.kind, isResearchCourse)}</span>
                <span className="min-w-0 truncate">· {event.sourceName}</span>
              </div>
            </div>
          ))
        ) : (
          <p className={cn(rightRailRowClassName, 'text-xs leading-5 text-muted-foreground')}>
            {isResearchCourse
              ? '添加关键会议、DDL 或实验节点后，我会把它们放到研究日历里。'
              : '导入课程大纲后，我会把作业、考试和每周进度放到日历里。'}
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
                            {manualScheduleKindOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
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

  const manualScheduleDialog = (
    <Dialog
      open={manualScheduleDialogOpen}
      onOpenChange={(open) => {
        setManualScheduleDialogOpen(open);
        if (!open) setManualScheduleError(null);
      }}
    >
      <DialogContent className="w-[calc(100vw-1rem)] max-w-md rounded-[24px] border-border/80 bg-background p-0 shadow-2xl">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            confirmManualScheduleEvent();
          }}
        >
          <DialogHeader className="border-b border-border px-5 py-4 text-left">
            <DialogTitle className="text-base">添加日程</DialogTitle>
            <p className="text-xs leading-5 text-muted-foreground">
              {isResearchCourse
                ? '手动补充一条会议、DDL、实验节点或研究提醒。'
                : '手动补充一条作业、考试、课程进度或提醒。'}
            </p>
          </DialogHeader>

          <div className="space-y-4 px-5 py-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">标题</span>
              <input
                value={manualScheduleTitle}
                onChange={(event) => {
                  setManualScheduleTitle(event.currentTarget.value);
                  setManualScheduleError(null);
                }}
                placeholder={isResearchCourse ? '例如：完成消融实验' : '例如：Assignment 2 截止'}
                className="h-10 w-full rounded-[14px] border border-border bg-muted/30 px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/20"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground">日期</span>
                <input
                  type="date"
                  value={manualScheduleDate}
                  onChange={(event) => {
                    setManualScheduleDate(event.currentTarget.value);
                    setManualScheduleError(null);
                  }}
                  className="h-10 w-full rounded-[14px] border border-border bg-muted/30 px-3 text-sm text-foreground outline-none transition focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/20"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground">类型</span>
                <select
                  value={manualScheduleKind}
                  onChange={(event) =>
                    setManualScheduleKind(event.currentTarget.value as SyllabusEventKind)
                  }
                  className="h-10 w-full rounded-[14px] border border-border bg-muted/30 px-3 text-sm text-foreground outline-none transition focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/20"
                >
                  {manualScheduleKindOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {manualScheduleError ? (
              <p className="rounded-[14px] border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700 dark:border-rose-300/20 dark:bg-rose-400/10 dark:text-rose-100">
                {manualScheduleError}
              </p>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-full px-4 text-sm"
              onClick={() => setManualScheduleDialogOpen(false)}
            >
              取消
            </Button>
            <Button type="submit" className="h-9 rounded-full px-4 text-sm">
              添加
            </Button>
          </div>
        </form>
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
          {activeCourse ? (
            <CourseMaterialsPanel courseId={activeCourse.id} className="shadow-none" />
          ) : (
            <p className="rounded-[18px] border border-dashed border-border bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
              先添加或选择课程，再管理课程文件。
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );

  const sourceUploadStatusDialog = (
    <Dialog open={sourceUploadPanelOpen} onOpenChange={setSourceUploadDialogOpen}>
      <DialogContent className="flex h-[min(760px,86dvh)] w-[calc(100vw-1rem)] max-w-[1180px] flex-col overflow-hidden rounded-[28px] border-border/80 bg-background p-0 shadow-2xl sm:h-[min(780px,86dvh)]">
        <DialogHeader className="sr-only">
          <DialogTitle>资料库</DialogTitle>
          <DialogDescription>
            浏览课程资料和整理好的笔记本；第一个位置用于上传新的课程文件。
          </DialogDescription>
        </DialogHeader>
        <input
          ref={sourceDocumentInputRef}
          type="file"
          accept=".pdf,.pptx,.txt,.md,.markdown,.csv,.json,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/*"
          multiple
          className="hidden"
          onChange={(event) => {
            void handleLearnUploadFiles(event.currentTarget.files);
            event.currentTarget.value = '';
          }}
        />
        <div className="flex min-h-0 flex-1 flex-col bg-white dark:bg-slate-950">
          <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-slate-200/70 px-6 py-4 dark:border-white/10">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-slate-950 dark:text-white">
                资料库
              </h2>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                {!selectedSourceLibraryTile ? (
                  <span>
                    {sourceLibraryTiles.length + transientSourceUploadTiles.length} 个项目
                  </span>
                ) : null}
                {sourceUploading ? (
                  <span className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-100">
                    <Loader2 className="size-3 animate-spin" />
                    入库中
                  </span>
                ) : null}
              </div>
            </div>
            {!selectedSourceLibraryTile ? (
              <div className="inline-flex items-center rounded-xl bg-slate-100 p-1 text-xs font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                <span className="rounded-lg bg-white px-4 py-1.5 text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white">
                  Date
                </span>
                <span className="px-4 py-1.5">Name</span>
                <span className="px-4 py-1.5">Type</span>
              </div>
            ) : (
              <div />
            )}
            <div className="flex min-w-0 justify-end">
              {!selectedSourceLibraryTile &&
              sourceUploadItems.some((item) => item.status !== 'ingesting') ? (
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
            </div>
          </div>

          {selectedSourceLibraryTile ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-5">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSourceLibraryTileId(null);
                    setSourceLibraryDetailView('image');
                    setSourceLibraryImageExpanded(false);
                  }}
                  className="inline-flex h-8 w-fit items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <ChevronLeft className="size-4" strokeWidth={1.8} />
                  资料库
                </button>
                {showSourceLibraryViewSwitch ? (
                  <div className="inline-flex items-center rounded-xl bg-slate-100 p-1 text-xs font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                    {(['text', 'image'] as const).map((view) => (
                      <button
                        key={view}
                        type="button"
                        onClick={() => {
                          setSourceLibraryDetailView(view);
                          if (view === 'text') setSourceLibraryImageExpanded(false);
                        }}
                        className={cn(
                          'rounded-lg px-4 py-1.5 transition',
                          effectiveSourceLibraryDetailView === view
                            ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                            : 'hover:text-slate-900 dark:hover:text-white',
                        )}
                      >
                        {view === 'text' ? '文本' : '图片'}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div />
                )}
                <div />
              </div>
              <div className="mt-5 flex justify-center">
                {effectiveSourceLibraryDetailView === 'text' ? (
                  <div className="w-full max-w-[760px] rounded-[18px] border border-slate-200 bg-white px-6 py-6 shadow-[0_20px_48px_rgba(15,23,42,0.12)] dark:border-white/10 dark:bg-slate-900">
                    {selectedSourceLibraryTextLoading ? (
                      <div className="grid min-h-64 place-items-center text-sm text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="size-4 animate-spin" />
                          正在读取文本…
                        </span>
                      </div>
                    ) : selectedSourceLibraryHasText ? (
                      <MessageResponse className="text-[15px] leading-8 text-slate-800 dark:text-slate-100 [&_a]:text-blue-600 [&_a]:underline-offset-4 hover:[&_a]:underline dark:[&_a]:text-blue-300">
                        {selectedSourceLibraryText}
                      </MessageResponse>
                    ) : (
                      <div className="grid min-h-64 place-items-center text-center text-sm text-slate-500 dark:text-slate-400">
                        <div className="max-w-sm">
                          <FileText className="mx-auto size-7 text-slate-300" strokeWidth={1.7} />
                          <p className="mt-3 font-medium text-slate-700 dark:text-slate-200">
                            {selectedSourceLibraryTextState?.status === 'failed'
                              ? '文本读取失败'
                              : '没有可预览的文本'}
                          </p>
                          <p className="mt-1 text-xs leading-5">
                            {selectedSourceLibraryTextState?.error ||
                              '这份资料可能是图片笔记本或暂时没有整理出的 markdown 文本。'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : selectedSourceLibraryTile.coverImagePath ? (
                  <div
                    className="relative w-full transition-[max-width] duration-200 ease-out"
                    style={{ maxWidth: sourceLibraryImageExpanded ? 1080 : 760 }}
                  >
                    <img
                      src={selectedSourceLibraryTile.coverImagePath}
                      alt=""
                      className="w-full rounded-[18px] border border-slate-200 bg-white shadow-[0_20px_48px_rgba(15,23,42,0.16)] dark:border-white/10 dark:bg-slate-900"
                      loading="lazy"
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setSourceLibraryImageExpanded((expanded) => !expanded)}
                          className="absolute right-3 top-3 inline-flex size-9 items-center justify-center rounded-full border border-white/80 bg-white/85 text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.18)] backdrop-blur transition hover:bg-white hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 dark:border-white/15 dark:bg-slate-950/78 dark:text-slate-100 dark:hover:bg-slate-900"
                          aria-label={sourceLibraryImageExpanded ? '缩小图片' : '放大图片'}
                        >
                          {sourceLibraryImageExpanded ? (
                            <Minimize2 className="size-4" strokeWidth={1.9} />
                          ) : (
                            <Maximize2 className="size-4" strokeWidth={1.9} />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="font-medium">
                        {sourceLibraryImageExpanded ? '缩小图片' : '放大图片'}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                ) : (
                  <div className="aspect-[0.707] w-full max-w-[760px] overflow-hidden rounded-[18px] border border-slate-200 shadow-[0_20px_48px_rgba(15,23,42,0.16)] dark:border-white/10">
                    <SourceLibraryGeneratedCover tile={selectedSourceLibraryTile} size="detail" />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-7">
              <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                <div className="min-w-0 text-center">
                  <button
                    type="button"
                    disabled={sourceUploading}
                    onClick={() => sourceDocumentInputRef.current?.click()}
                    className="group mx-auto flex aspect-[0.707] w-full max-w-[142px] items-center justify-center rounded-[16px] border-2 border-dashed border-sky-300 bg-white text-sky-600 transition hover:border-sky-400 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-sky-300/40 dark:bg-white/[0.03] dark:text-sky-200 dark:hover:bg-sky-400/10"
                    aria-label="上传文件"
                  >
                    {sourceUploading ? (
                      <Loader2 className="size-7 animate-spin" strokeWidth={1.8} />
                    ) : (
                      <Plus className="size-8 transition group-hover:scale-110" strokeWidth={1.8} />
                    )}
                  </button>
                  <p className="mt-3 truncate text-sm font-semibold text-sky-600 dark:text-sky-200">
                    上传文件
                  </p>
                </div>

                {allSourceLibraryTiles.map((tile) => {
                  const status = tile.status;
                  const deletingSource = tile.sourceHash
                    ? deletingSourceHashes.includes(tile.sourceHash)
                    : false;
                  const openTile = () => {
                    const preloadedText = sourceLibraryTextFromBlocks(tile.textBlocks);
                    if (preloadedText) {
                      setSourceLibraryTextCache((current) => ({
                        ...current,
                        [tile.id]: { status: 'ready', text: preloadedText },
                      }));
                    } else {
                      loadSourceLibraryTileText(tile);
                    }
                    setSourceLibraryDetailView(
                      (preloadedText || tile.textNotebookIds.length > 0) && !tile.coverImagePath
                        ? 'text'
                        : 'image',
                    );
                    setSourceLibraryImageExpanded(false);
                    setSelectedSourceLibraryTileId(tile.id);
                  };
                  return (
                    <div key={tile.id} className="min-w-0 text-center">
                      <div className="relative mx-auto w-full max-w-[142px]">
                        <button
                          type="button"
                          aria-label={`查看 ${tile.title}`}
                          onClick={openTile}
                          disabled={deletingSource}
                          className="group block w-full focus-visible:outline-none disabled:cursor-wait disabled:opacity-55"
                        >
                          <span className="relative block aspect-[0.707] w-full overflow-hidden rounded-[14px] border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.12)] transition group-hover:-translate-y-0.5 group-hover:shadow-[0_16px_30px_rgba(15,23,42,0.16)] group-focus-visible:ring-2 group-focus-visible:ring-sky-300 dark:border-white/10 dark:bg-slate-900">
                            {tile.coverImagePath ? (
                              <img
                                src={tile.coverImagePath}
                                alt=""
                                className="size-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <SourceLibraryGeneratedCover tile={tile} />
                            )}
                            {status ? (
                              <span
                                className={cn(
                                  'absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-sm backdrop-blur',
                                  status === 'ingesting'
                                    ? 'bg-sky-100/90 text-sky-700 dark:bg-sky-400/20 dark:text-sky-100'
                                    : 'bg-rose-100/90 text-rose-700 dark:bg-rose-400/20 dark:text-rose-100',
                                )}
                              >
                                {sourceUploadStatusLabel(status)}
                              </span>
                            ) : null}
                          </span>
                        </button>
                        {tile.sourceHash ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => void handleDeleteSourceLibraryTile(tile)}
                                disabled={deletingSource}
                                className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-full border border-white/80 bg-white/90 text-slate-500 shadow-sm backdrop-blur transition hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 disabled:cursor-wait disabled:opacity-75 dark:border-white/15 dark:bg-slate-950/78 dark:text-slate-200 dark:hover:bg-rose-400/15 dark:hover:text-rose-100"
                                aria-label={`删除 ${tile.title}`}
                              >
                                {deletingSource ? (
                                  <Loader2 className="size-3.5 animate-spin" strokeWidth={1.8} />
                                ) : (
                                  <Trash2 className="size-3.5" strokeWidth={1.8} />
                                )}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="font-medium">
                              删除资料及相关记录
                            </TooltipContent>
                          </Tooltip>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={openTile}
                        disabled={deletingSource}
                        className="mt-3 block w-full min-w-0 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 disabled:cursor-wait disabled:opacity-55"
                      >
                        <span className="block line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-5 text-sky-600 dark:text-sky-200">
                          {tile.title}
                        </span>
                        <span className="mt-1 block truncate text-xs text-slate-500 dark:text-slate-400">
                          {tile.dateLabel || tile.typeLabel}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-slate-400 dark:text-slate-500">
                          {tile.subtitle}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
                <button
                  type="button"
                  onClick={() => {
                    void startStatusCalendarActivity(activity);
                  }}
                  className="-m-1 min-w-0 flex-1 rounded-[12px] p-1 text-left transition hover:bg-slate-50/80 focus-visible:bg-slate-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-100 dark:hover:bg-white/5 dark:focus-visible:bg-white/5 dark:focus-visible:ring-sky-300/20"
                  aria-label={`${activity.actionLabel ?? '打开'}：${activity.title}`}
                  title={activity.actionLabel ?? '打开'}
                >
                  <span className="flex items-center gap-2">
                    <span className={cn('size-1.5 shrink-0 rounded-full', activity.dotClassName)} />
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

  const platformMemoryDialog = (
    <Dialog open={memoryActivityDialogOpen} onOpenChange={setMemoryActivityDialogOpen}>
      <DialogContent className="learn-memory-dialog-shell h-[min(760px,86dvh)] w-[calc(100vw-1rem)] max-w-[1180px] overflow-hidden rounded-[28px] border-0 bg-transparent p-0 shadow-none sm:h-[min(780px,86dvh)]">
        <DialogHeader className="sr-only">
          <DialogTitle>平台记忆动态</DialogTitle>
          <DialogDescription>查看平台最近怎样更新对学生学习状态的理解。</DialogDescription>
        </DialogHeader>

        <div className="learn-memory-dialog-surface flex h-full min-h-0">
          <aside className="learn-memory-sidebar hidden w-[282px] shrink-0 px-6 py-6 lg:flex lg:flex-col">
            <p className="text-xs font-semibold tracking-normal text-slate-500">平台记忆</p>
            <h2 className="mt-3 text-[32px] font-semibold leading-10 tracking-normal text-slate-950">
              记忆动态
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              这里显示平台最近怎样理解你的资料、进度、偏好和薄弱点。
            </p>
            <div className="mt-6 grid gap-2 text-sm">
              <div className="learn-memory-metric-row" data-tone="writing">
                <span className="font-semibold">写入中</span>
                <span className="tabular-nums">{activeMemoryActivities.length}</span>
              </div>
              <div className="learn-memory-metric-row" data-tone="completed">
                <span className="font-semibold">刚完成</span>
                <span className="tabular-nums">{completedMemoryActivities.length}</span>
              </div>
            </div>

            <div className="learn-memory-sphere-stage mt-auto" aria-hidden="true">
              <div className="learn-memory-sphere-glow" />
              {PLATFORM_MEMORY_SPHERES.map((sphere) => (
                <span
                  key={`${sphere.tone}-${sphere.className}`}
                  className={cn('learn-memory-glass-sphere', sphere.className)}
                  data-tone={sphere.tone}
                />
              ))}
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="learn-memory-dialog-header flex shrink-0 items-start justify-between gap-4 px-7 py-6">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500 lg:hidden">平台记忆</p>
                <h2 className="truncate text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
                  最近写入
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  平台正在把新的学习线索整理成之后能用上的记忆。
                </p>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-7 pt-5">
              {platformMemoryHistory.length ? (
                <div className="learn-memory-list-surface">
                  {platformMemoryHistory.map((record) => {
                    const statusLabel = memoryActivityStatusLabel(record.status);
                    const isRunning =
                      record.status === 'running' ||
                      record.status === 'queued' ||
                      record.status === 'needs_attention';
                    const isCompleted = record.status === 'completed';
                    const tone = platformMemoryVisualTone(record);
                    return (
                      <div
                        key={record.id}
                        className="learn-memory-history-row grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
                      >
                        <div className="grid min-w-0 grid-cols-[22px_minmax(0,1fr)] gap-3">
                          <span
                            className="learn-memory-glass-bead mt-1"
                            data-tone={tone}
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={cn(
                                  'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold',
                                  isRunning
                                    ? 'bg-amber-100/75 text-amber-800 ring-1 ring-amber-200/70'
                                    : isCompleted
                                      ? 'bg-sky-100/75 text-sky-800 ring-1 ring-sky-200/70'
                                      : 'bg-slate-100/80 text-slate-600 ring-1 ring-slate-200/70',
                                )}
                              >
                                {statusLabel}
                              </span>
                              {record.chips.slice(0, 3).map((chip) => (
                                <span
                                  key={`${record.id}-${chip}`}
                                  className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200/70"
                                >
                                  {platformMemoryChipLabel(chip)}
                                </span>
                              ))}
                            </div>
                            <p className="mt-2 text-sm font-semibold leading-5 text-slate-950">
                              {memoryActivityStudentTitle(record.title, record.description)}
                            </p>
                            <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">
                              {memoryActivityStudentDescription(record)}
                            </p>
                          </div>
                        </div>
                        <time className="text-xs font-medium tabular-nums text-slate-400 sm:pt-1">
                          {formatMemoryActivityTime(record.updatedAt)}
                        </time>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="learn-memory-empty-state grid h-full min-h-72 place-items-center text-center">
                  <div className="max-w-sm px-6">
                    <div className="learn-memory-empty-orbs mx-auto" aria-hidden="true">
                      <span data-tone="progress" />
                      <span data-tone="mastery" />
                      <span data-tone="weakness" />
                    </div>
                    <p className="mt-4 text-sm font-semibold text-slate-950">还没有记忆动态</p>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      当你上传资料、确认学习进度或完成练习后，平台会在这里告诉你它学到了什么。
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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

            <LearningCalendarGrid
              days={calendarDays}
              plansByCalendarDay={plansByCalendarDay}
              syllabusEventsByCalendarDay={syllabusEventsByCalendarDay}
              isResearchCourse={isResearchCourse}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  const coursePublishDialog = (
    <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
      <DialogContent className="max-w-[520px] rounded-[24px] border-border/80 bg-background p-0 shadow-2xl">
        <DialogHeader className="border-b border-border/70 px-5 py-4 text-left">
          <DialogTitle className="text-base">
            {activeCourse?.listedInCourseStore ? '更新课程发布' : '发布到课程商城'}
          </DialogTitle>
          <DialogDescription className="leading-5">
            共享你的课程，让其他同学加入学习；有人加入付费课程时，你可以获得额度。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-3 gap-2">
            <div className={cn(rightRailRowClassName, 'text-center')}>
              <p className="text-lg font-semibold text-foreground">{notebooks.length}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">课程笔记本</p>
            </div>
            <div className={cn(rightRailRowClassName, 'text-center')}>
              <p className="text-lg font-semibold text-foreground">{publishableProblemCount}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">已发布题目</p>
            </div>
            <div className={cn(rightRailRowClassName, 'text-center')}>
              <p className="text-lg font-semibold text-foreground">{publishableMemoryCount}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">公开记忆</p>
            </div>
          </div>

          <div className="space-y-2">
            {[
              '不会发布你的私人学习状态、私人记忆或聊天记录。',
              '不会上传 PDF、图片等源文件；源文件只留在你的资料库里。',
              '会同步课程信息、课程笔记本、已发布题库，以及课程回复题目需要用到的公开记忆。',
            ].map((item) => (
              <div key={item} className="flex gap-2 text-sm leading-5 text-slate-600">
                <CheckCircle2
                  className="mt-0.5 size-4 shrink-0 text-emerald-600"
                  strokeWidth={1.9}
                />
                <span>{item}</span>
              </div>
            ))}
          </div>

          {coursePublishBlockReason ? (
            <div className="rounded-[16px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:border-amber-300/20 dark:bg-amber-400/10 dark:text-amber-100">
              {coursePublishBlockReason}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/70 px-5 py-4">
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-full px-4 text-sm"
            onClick={() => setPublishDialogOpen(false)}
            disabled={publishingCourse}
          >
            取消
          </Button>
          <Button
            type="button"
            className="h-9 rounded-full px-4 text-sm"
            onClick={() => void handlePublishActiveCourse()}
            disabled={publishingCourse || Boolean(coursePublishBlockReason)}
          >
            {publishingCourse ? (
              <Loader2 className="size-4 animate-spin" strokeWidth={1.8} />
            ) : (
              <ShoppingBag className="size-4" strokeWidth={1.8} />
            )}
            {activeCourse?.listedInCourseStore ? '更新发布' : '确认发布'}
          </Button>
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
                  onClick={
                    hasActiveCourse ? createNewLearnSession : () => setCreateCourseOpen(true)
                  }
                  className={rightRailIconButtonClassName}
                  aria-label="添加新会话"
                  title="添加新会话"
                >
                  <MessageSquarePlus className="size-3.5" strokeWidth={1.8} />
                </button>
              </div>
              <nav className="mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pb-6">
                {!hasActiveCourse ? (
                  <div
                    className={cn(rightRailRowClassName, 'text-xs leading-5 text-muted-foreground')}
                  >
                    先在左侧添加课程；添加后这里会保存这门课的聊天会话。
                  </div>
                ) : null}
                {hasActiveCourse
                  ? learnSessions.map((session) => {
                      const active = session.id === activeSessionId;
                      const deleting = deletingLearnSessionId === session.id;
                      return (
                        <div
                          key={session.id}
                          className={cn(
                            'group flex min-h-10 min-w-0 items-center gap-1 rounded-[14px] border pr-1 text-[12px] font-semibold leading-4 tracking-normal text-slate-700 transition hover:border-slate-200 hover:bg-white/80 dark:text-slate-100 dark:hover:bg-white/5',
                            active
                              ? 'border-slate-200/80 bg-white/75 shadow-sm dark:border-white/10 dark:bg-white/5'
                              : 'border-transparent bg-transparent',
                          )}
                        >
                          <Link
                            href={learnSessionHref(session.id)}
                            aria-current={active ? 'page' : undefined}
                            className="flex min-h-10 min-w-0 flex-1 items-center px-3 py-2"
                          >
                            <span className="min-w-0 flex-1 truncate">{session.title}</span>
                          </Link>
                          <button
                            type="button"
                            onClick={() => void deleteLearnSession(session)}
                            disabled={deleting}
                            className={cn(
                              'grid size-8 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:pointer-events-none disabled:opacity-60 dark:text-slate-500 dark:hover:bg-rose-500/10 dark:hover:text-rose-300',
                              active ? 'opacity-100' : 'opacity-70 group-hover:opacity-100',
                            )}
                            aria-label={`删除会话：${session.title}`}
                            title="删除会话"
                          >
                            {deleting ? (
                              <Loader2 className="size-3.5 animate-spin" strokeWidth={1.9} />
                            ) : (
                              <Trash2 className="size-3.5" strokeWidth={1.9} />
                            )}
                          </button>
                        </div>
                      );
                    })
                  : null}
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
                  <p className="text-sm font-semibold text-foreground">
                    {isResearchCourse ? '研究进度' : '学习进度'}
                  </p>
                </div>
                <div className="mt-3 text-xs">
                  <div
                    className={cn(rightRailRowClassName, 'flex items-center justify-between gap-2')}
                  >
                    <span className="text-muted-foreground">
                      {isResearchCourse ? '当前阶段' : '当前进度'}
                    </span>
                    <span className="font-medium text-foreground">
                      {snapshot?.progressLabel || '未确认'}
                    </span>
                  </div>
                </div>
              </section>

              {activeCourse && activeCourseIsOwner ? (
                <section className={cn(rightRailCardClassName, 'mt-3 p-3')}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <ShoppingBag className="size-4 text-muted-foreground" strokeWidth={1.8} />
                        <p className="text-sm font-semibold text-foreground">课程发布</p>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {activeCourse.listedInCourseStore
                          ? '课程已在商城展示，可重新同步题库和公开记忆。'
                          : '发布后其他同学可以加入课程，你可以通过付费加入获得额度。'}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold',
                        activeCourse.listedInCourseStore
                          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-100 dark:ring-emerald-300/20'
                          : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200/80 dark:bg-white/5 dark:text-slate-300 dark:ring-white/10',
                      )}
                    >
                      {activeCourse.listedInCourseStore ? '已上架' : '未上架'}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                    <div className={cn(rightRailRowClassName, 'px-2 py-2')}>
                      <p className="text-sm font-semibold text-foreground">{notebooks.length}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">笔记本</p>
                    </div>
                    <div className={cn(rightRailRowClassName, 'px-2 py-2')}>
                      <p className="text-sm font-semibold text-foreground">
                        {publishableProblemCount}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">题目</p>
                    </div>
                    <div className={cn(rightRailRowClassName, 'px-2 py-2')}>
                      <p className="text-sm font-semibold text-foreground">
                        {publishableMemoryCount}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">公开记忆</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="mt-3 h-9 w-full rounded-[12px] text-xs"
                    variant={activeCourse.listedInCourseStore ? 'outline' : 'default'}
                    onClick={() => setPublishDialogOpen(true)}
                  >
                    <ShoppingBag className="size-3.5" strokeWidth={1.8} />
                    {activeCourse.listedInCourseStore ? '更新发布' : '发布课程'}
                  </Button>
                  {coursePublishBlockReason ? (
                    <p className="mt-2 text-[11px] leading-4 text-amber-700 dark:text-amber-200">
                      {coursePublishBlockReason}
                    </p>
                  ) : null}
                </section>
              ) : null}

              <section className={cn(rightRailCardClassName, 'mt-3 p-3')}>
                <div className="flex items-center gap-2">
                  <Target className="size-4 text-muted-foreground" strokeWidth={1.8} />
                  <p className="text-sm font-semibold text-foreground">
                    {isResearchCourse ? '研究建议' : '学习建议'}
                  </p>
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
          <header className="shrink-0 border-b border-slate-200/80 bg-white/95 px-6 py-3 dark:border-white/10 dark:bg-slate-950/95 sm:px-8 lg:px-10">
            <div className="mx-auto flex w-full max-w-[52rem] flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="w-full min-w-0 sm:w-auto">
                <div className="min-w-0">
                  <h1 className="line-clamp-2 text-sm font-semibold leading-4 text-slate-950 dark:text-slate-50">
                    {activeCourse?.name || '学习聊天'}
                  </h1>
                  <p className="truncate text-[11px] font-medium leading-4 text-slate-400">
                    {activeCourse?.courseCode ||
                      (activeCourse ? '当前课程上下文' : '等待添加课程上下文')}
                  </p>
                </div>
              </div>
              <div className="flex max-w-full shrink-0 items-center gap-1.5 overflow-x-auto pb-0.5 sm:overflow-visible sm:pb-0">
                {activeCourse && assetLoadState === 'loading' ? (
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
                ) : activeCourse && !snapshot?.progressKnown ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => addProgressRequestMessage({ snapshot })}
                    className="h-8 rounded-[10px] border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-700 shadow-sm hover:bg-sky-100"
                  >
                    {isResearchCourse ? '更新研究进度' : '更新学习进度'}
                  </Button>
                ) : null}
                {activeCourse ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={openSourceUploadPanel}
                      className="relative h-8 gap-1.5 rounded-[10px] border-slate-200 bg-white px-3 text-xs font-semibold shadow-sm dark:border-white/10 dark:bg-white/5"
                    >
                      <LibraryBig className="size-3.5" />
                      资料库
                      <SourceUploadBadge
                        uploading={sourceUploading}
                        completedCount={completedSourceUploadBadgeCount}
                      />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        router.push(
                          `/course/${encodeURIComponent(activeCourse.id)}/resources?tab=memory`,
                        );
                      }}
                      className="h-8 gap-1.5 rounded-[10px] border-slate-200 bg-white px-3 text-xs font-semibold shadow-sm dark:border-white/10 dark:bg-white/5"
                    >
                      <Brain className="size-3.5" />
                      记忆库
                    </Button>
                  </>
                ) : null}
                {activeCourse ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        onClick={() => setMemoryActivityDialogOpen(true)}
                        className="learn-memory-orb-button size-9 rounded-full border-transparent p-0 text-white shadow-sm hover:text-white focus-visible:ring-sky-200"
                        data-memory-state={platformMemoryState}
                        aria-label={platformMemoryButtonLabel}
                      >
                        <span className="learn-memory-orb-core" aria-hidden="true">
                          <span className="learn-memory-orb-ribbon learn-memory-orb-ribbon-a" />
                          <span className="learn-memory-orb-ribbon learn-memory-orb-ribbon-b" />
                          <span className="learn-memory-orb-ribbon learn-memory-orb-ribbon-c" />
                          <span className="learn-memory-orb-star" />
                        </span>
                        {platformMemoryBadgeCount > 0 ? (
                          <span
                            className={cn(
                              'absolute -right-1.5 -top-1.5 z-20 grid min-w-5 place-items-center rounded-full border border-white px-1 text-[10px] font-bold leading-5 shadow-sm dark:border-slate-950',
                              platformMemoryState === 'writing'
                                ? 'bg-amber-400 text-amber-950'
                                : 'bg-sky-500 text-white',
                            )}
                            aria-hidden="true"
                          >
                            {platformMemoryBadgeCount > 9 ? '9+' : platformMemoryBadgeCount}
                          </span>
                        ) : null}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="end" className="font-medium">
                      {platformMemoryTooltip}
                    </TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto bg-white px-6 py-5 dark:bg-slate-950 sm:px-8 lg:px-10">
            <div className="mx-auto flex min-h-full w-full max-w-[52rem] flex-col gap-4">
              {messages.length === 0 && !sending ? (
                <div className="learn-empty-ambient relative isolate flex min-h-[420px] flex-1 items-center justify-center overflow-hidden">
                  <span className="learn-empty-spotlight learn-empty-spotlight-main" aria-hidden />
                  <span
                    className="learn-empty-spotlight learn-empty-spotlight-accent"
                    aria-hidden
                  />
                  <div
                    className="learn-empty-center relative z-10 flex max-w-2xl flex-col items-center gap-4 px-3 text-center"
                    style={{
                      background: 'transparent',
                      borderColor: 'transparent',
                      boxShadow: 'none',
                      backdropFilter: 'none',
                    }}
                  >
                    <div className="learn-empty-avatar relative">
                      {activeCourse ? (
                        <CourseAvatar course={activeCourse} className="size-14 rounded-[18px]" />
                      ) : (
                        <div className="grid size-14 place-items-center rounded-[18px] bg-sky-50 text-sky-700 ring-1 ring-sky-100 dark:bg-sky-400/10 dark:text-sky-100 dark:ring-sky-300/15">
                          <MessageSquarePlus className="size-6" strokeWidth={1.8} />
                        </div>
                      )}
                      <span
                        className={cn(
                          'absolute -right-1 -top-1 size-3 rounded-full border-2 border-white shadow-sm dark:border-slate-950',
                          !activeCourse || missingLearningSetup ? 'bg-amber-400' : 'bg-emerald-400',
                        )}
                        aria-hidden="true"
                      />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                        {activeCourse?.courseCode ||
                          (activeCourse
                            ? isResearchCourse
                              ? 'Research'
                              : 'Learning'
                            : 'General chat')}
                      </p>
                      <p className="mt-1 text-lg font-semibold tracking-normal text-slate-950 dark:text-slate-50">
                        {!activeCourse
                          ? '添加课程后开始聊天'
                          : isResearchCourse
                            ? '今天想推进什么？'
                            : '今天想从哪里开始？'}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                        {!activeCourse
                          ? '添加课程后，我会把聊天、复习、题库和记忆都绑定到对应课程。'
                          : isResearchCourse
                            ? `围绕 ${activeCourse.courseCode || activeCourse.name} 继续推进研究。`
                            : missingLearningSetup
                              ? '补齐 syllabus 和学习进度后，今天的安排会更准。'
                              : snapshot?.progressKnown && snapshot.progressLabel
                                ? `当前进度：${snapshot.progressLabel}`
                                : `围绕 ${activeCourse.courseCode || activeCourse.name} 继续推进。`}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2" aria-label="快捷入口">
                      {(activeCourse ? activeQuickPrompts : ['添加一门课程', '去课程商城']).map(
                        (prompt) => (
                          <Button
                            key={prompt}
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (prompt === '添加一门课程') {
                                setCreateCourseOpen(true);
                                return;
                              }
                              if (prompt === '去课程商城') {
                                router.push('/store/courses');
                                return;
                              }
                              void sendMessage(prompt);
                            }}
                            className="h-8 rounded-full border-slate-200/80 bg-white/76 px-3 text-xs shadow-sm backdrop-blur-sm hover:bg-white dark:border-white/10 dark:bg-white/8 dark:hover:bg-white/12"
                          >
                            {prompt}
                          </Button>
                        ),
                      )}
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
                          : 'mr-auto flex w-full max-w-[52rem] items-start gap-3 py-2',
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
                        <>
                          {activeCourse ? (
                            <CourseAvatar
                              course={activeCourse}
                              className="mt-1 size-8 rounded-[10px]"
                            />
                          ) : (
                            <div className="mt-1 grid size-8 shrink-0 place-items-center rounded-[10px] bg-sky-50 text-sky-700 ring-1 ring-sky-100 dark:bg-sky-400/10 dark:text-sky-100 dark:ring-sky-300/15">
                              <MessageSquarePlus className="size-4" strokeWidth={1.8} />
                            </div>
                          )}
                          <div className="min-w-0 flex-1 select-text">
                            {message.text ? (
                              <MessageResponse className={courseMarkdownClassName}>
                                {normalizeAssistantMarkdown(message.text)}
                              </MessageResponse>
                            ) : null}
                            {message.plan ? (
                              <PlanActionCard plan={message.plan} onStart={startPlan} />
                            ) : null}
                            {message.artifacts?.length ? (
                              <LearnArtifactCards
                                artifacts={message.artifacts}
                                actions={message.learningActions}
                                isResearchCourse={isResearchCourse}
                                onConfirmCalendarAction={handleLearningActionConfirm}
                              />
                            ) : null}
                            {message.publicTrace?.length ? (
                              <LearnPublicTraceCard steps={message.publicTrace} />
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
                            {message.lecturePrompt || message.lectureDeck ? (
                              <MiniLectureInviteCard
                                prompt={message.lecturePrompt}
                                deck={message.lectureDeck}
                                generating={generatingMiniLectureMessageId === message.id}
                                onGenerate={() => generateMiniLectureForMessage(message.id)}
                                onOpen={openMiniLectureDeck}
                              />
                            ) : null}
                            {message.learningActions?.length ? (
                              <LearnLearningActionCards
                                actions={visibleLearningActionsForArtifacts(
                                  message.learningActions,
                                  message.artifacts,
                                )}
                                onConfirm={handleLearningActionConfirm}
                                onCancel={handleLearningActionCancel}
                              />
                            ) : null}
                          </div>
                        </>
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
              {sending &&
              !messages.some((message) => message.transient && message.publicTrace?.length) ? (
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

          <footer className="shrink-0 border-t border-transparent bg-transparent px-6 py-3 sm:px-8 lg:px-10">
            <div className="mx-auto max-w-[52rem]">
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
                    <SourceUploadBadge
                      uploading={sourceUploading}
                      completedCount={completedSourceUploadBadgeCount}
                      compact
                    />
                  </Button>
                  <Textarea
                    ref={draftTextareaRef}
                    rows={1}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={
                      activeCourse
                        ? `问 ${activeCourse.courseCode || activeCourse.name} 一个问题`
                        : '添加课程后开始提问'
                    }
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
                        !activeCourse ||
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
      <CreateCourseDialog
        open={createCourseOpen}
        onOpenChange={setCreateCourseOpen}
        onSuccess={handleCourseCreated}
      />
      <MiniLectureClassroomDialog
        deck={activeMiniLectureDeck}
        open={miniLectureOpen}
        onOpenChange={setMiniLectureOpen}
      />
      {syllabusImportDialog}
      {manualScheduleDialog}
      {sourceUploadStatusDialog}
      {courseFilesDialog}
      {platformMemoryDialog}
      {largeCalendarDialog}
      {coursePublishDialog}
    </>
  );
}
