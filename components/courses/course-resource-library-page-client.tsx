'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  BookOpen,
  Brain,
  Calculator,
  ChevronLeft,
  ChevronRight,
  Code2,
  FileText,
  LibraryBig,
  ListChecks,
  Loader2,
  Network,
  PenLine,
  Search,
  Sparkles,
  Target,
  Type,
  type LucideIcon,
} from 'lucide-react';
import {
  Background,
  BackgroundVariant,
  Handle,
  Position,
  ReactFlow,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeProps as FlowNodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProblemRichText, ProblemTitleText } from '@/components/problem-bank/problem-rich-text';
import { problemConceptTopics } from '@/lib/problem-bank/concept-tags.mjs';
import { getDefaultCoursePublicMemories } from '@/lib/learning/default-public-memories';
import {
  getLocalizedProblemContent,
  getLocalizedProblemTitle,
  type ProblemContentLanguage,
} from '@/lib/problem-bank';
import {
  getLocalStudyMemoryUserId,
  loadStudyMemory,
  STUDY_MEMORY_UPDATED_EVENT,
  type NotebookMemoryItem,
  type WeakPointMemory,
} from '@/lib/learning/study-memory';
import { cn } from '@/lib/utils';
import { backendJson } from '@/lib/utils/backend-api';
import { resolveCourseAvatarDisplayUrl } from '@/lib/constants/course-avatars';
import { resolveCourseBackgroundDisplayUrl } from '@/lib/constants/course-backgrounds';
import { getCourse } from '@/lib/utils/course-storage';
import type { CourseRecord } from '@/lib/utils/database';
import {
  listCourseProblems,
  type NotebookProblemClientRecord,
} from '@/lib/utils/notebook-problem-api';
import { listStagesByCourse, type StageListItem } from '@/lib/utils/stage-storage';
import { listStudyMemoryRecords, type StudyMemoryApiRecord } from '@/lib/utils/study-memory-api';

type CourseResourceLibraryPageClientProps = {
  courseId: string;
};

type NotebookMemoryRecordBundle = {
  notebookId: string;
  memories: StudyMemoryApiRecord[];
};

type ResourceFilter = 'all' | 'memory' | 'problem' | 'private';

type MemoryLayerFilter = 'all' | 'course' | 'notebook' | 'private';

type PracticeState = 'mastered' | 'review' | 'wrong' | 'unattempted';

type LibraryMemoryItem = {
  id: string;
  title: string;
  text: string;
  layer: 'course' | 'notebook' | 'private';
  layerLabel: string;
  scopeLabel: string;
  sourceLabel: string;
  kindLabel?: string;
  notebookId?: string;
  notebookName?: string;
  updatedAt?: number;
};

type LibraryProblemItem = NotebookProblemClientRecord & {
  practiceState: PracticeState;
};

type CourseResourceSearchMemory = {
  id: string;
  title: string;
  text: string;
  scope: 'public' | 'private' | string;
  kind: string;
  source: string;
  targetType: 'course' | 'notebook' | string;
  notebookId?: string | null;
  courseId?: string | null;
  reason?: string | null;
  question?: string | null;
  updatedAt?: string | null;
};

type CourseResourceKnowledgeMatch = {
  id: string;
  sourceType: 'problem_bank' | string;
  title: string;
  text: string;
  score: number;
  metadata: {
    courseId: string | null;
    notebookId: string | null;
    problemType: string;
    difficulty: string;
    tags: string[];
    status: string;
    notebookName: string | null;
    attemptStatus: string | null;
    attemptScore: number | null;
    attemptedCount: number;
    lastAttemptAt: string | null;
  };
};

type CourseResourceSearchResponse = {
  storage: 'database' | 'unavailable';
  answer?: string;
  directMemories: CourseResourceSearchMemory[];
  semanticMatches: CourseResourceSearchMemory[];
  knowledgeMatches: CourseResourceKnowledgeMatch[];
  counts?: {
    direct: number;
    semantic: number;
    knowledge: number;
    sourceEvidence: number;
    learnerAnalytics: number;
  };
  vectorUsed?: boolean;
};

type CourseResourceSearchRunState =
  | { status: 'idle'; query: string; data?: undefined; error?: undefined }
  | { status: 'loading'; query: string; data?: CourseResourceSearchResponse; error?: undefined }
  | { status: 'success'; query: string; data: CourseResourceSearchResponse; error?: undefined }
  | { status: 'error'; query: string; data?: CourseResourceSearchResponse; error: string };

type SearchResourceItem =
  | {
      id: string;
      title: string;
      kind: 'memory';
      updatedAt?: number;
      memory: LibraryMemoryItem;
    }
  | {
      id: string;
      title: string;
      kind: 'problem';
      updatedAt?: number;
      problem: LibraryProblemItem;
    };

type NotebookResourceRow = {
  notebook: StageListItem;
  publicCount: number;
  privateCount: number;
  weakCount: number;
  problemCount: number;
  latestMemoryTitle?: string;
  updatedAt: number;
};

function isActive(record: { status?: string | null }) {
  return record.status !== 'archived';
}

function formatDate(value?: number): string {
  if (!value) return '暂无';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function apiMemorySourceLabel(record: StudyMemoryApiRecord): string {
  if (record.source === 'notebook_generation') return '数据库生成记忆';
  if (record.source === 'manual_queue_rewrite') return '数据库课程重写';
  if (record.source === 'manual') return '数据库手动记忆';
  return '数据库记忆';
}

function apiMemoryKindLabel(record: StudyMemoryApiRecord): string {
  return studyMemoryKindLabel(record.kind);
}

function studyMemorySourceLabel(source: string): string {
  if (source === 'notebook_generation') return '数据库生成记忆';
  if (source === 'manual_queue_rewrite') return '数据库课程重写';
  if (source === 'manual') return '数据库手动记忆';
  if (source === 'chat') return '聊天记忆';
  if (source === 'quiz') return '题库记忆';
  return '数据库记忆';
}

function studyMemoryKindLabel(kind?: string | null): string {
  if (kind === 'mistake') return '错题';
  if (kind === 'preference') return '偏好';
  if (kind === 'reflection') return '反思';
  if (kind === 'manual') return '手动';
  return kind || '记忆';
}

function memoryKindLabel(memory: NotebookMemoryItem): string {
  if (memory.kind === 'mistake') return '错题';
  if (memory.kind === 'preference') return '偏好';
  if (memory.kind === 'reflection') return '反思';
  if (memory.kind === 'manual') return '手动';
  return '知识缺口';
}

function localPrivateSourceLabel(memory: NotebookMemoryItem): string {
  if (memory.source === 'notebook_generation') return '生成记忆';
  if (memory.source === 'manual') return '手动记忆';
  if (memory.source === 'quiz') return '题库记忆';
  return '聊天记忆';
}

function coursePublicMemory(record: StudyMemoryApiRecord): LibraryMemoryItem {
  return {
    id: `course:${record.id}`,
    title: record.title,
    text: record.text,
    layer: 'course',
    layerLabel: '课程控制层',
    scopeLabel: '共有',
    sourceLabel: apiMemorySourceLabel(record),
    kindLabel: apiMemoryKindLabel(record),
    updatedAt: Date.parse(record.updatedAt),
  };
}

function defaultCoursePublicMemory(memory: NotebookMemoryItem): LibraryMemoryItem {
  return {
    id: `default-course:${memory.id}`,
    title: memory.title,
    text: memory.text,
    layer: 'course',
    layerLabel: '课程控制层',
    scopeLabel: '共有',
    sourceLabel: '默认课程记忆',
    kindLabel: memoryKindLabel(memory),
    updatedAt: memory.updatedAt,
  };
}

function notebookPublicMemory(
  notebook: StageListItem,
  memory: NotebookMemoryItem,
): LibraryMemoryItem {
  return {
    id: `notebook-public:${notebook.id}:${memory.id}`,
    title: memory.title,
    text: memory.text,
    layer: 'notebook',
    layerLabel: '笔记本知识层',
    scopeLabel: '共有',
    sourceLabel: '笔记本公共记忆',
    kindLabel: memoryKindLabel(memory),
    notebookId: notebook.id,
    notebookName: notebook.name,
    updatedAt: memory.updatedAt,
  };
}

function notebookApiPublicMemory(
  notebook: StageListItem,
  record: StudyMemoryApiRecord,
): LibraryMemoryItem {
  return {
    id: `db-notebook-public:${notebook.id}:${record.id}`,
    title: record.title,
    text: record.text,
    layer: 'notebook',
    layerLabel: '笔记本知识层',
    scopeLabel: '共有',
    sourceLabel: apiMemorySourceLabel(record),
    kindLabel: apiMemoryKindLabel(record),
    notebookId: notebook.id,
    notebookName: notebook.name,
    updatedAt: Date.parse(record.updatedAt),
  };
}

function coursePrivateMemory(record: StudyMemoryApiRecord): LibraryMemoryItem {
  return {
    id: `private-course:${record.id}`,
    title: record.title,
    text: record.text,
    layer: 'private',
    layerLabel: '个人学习层',
    scopeLabel: '私有',
    sourceLabel: '数据库课程私有记忆',
    kindLabel: apiMemoryKindLabel(record),
    updatedAt: Date.parse(record.updatedAt),
  };
}

function notebookApiPrivateMemory(
  notebook: StageListItem,
  record: StudyMemoryApiRecord,
): LibraryMemoryItem {
  return {
    id: `db-notebook-private:${notebook.id}:${record.id}`,
    title: record.title,
    text: record.text,
    layer: 'private',
    layerLabel: '个人学习层',
    scopeLabel: '私有',
    sourceLabel: '数据库笔记本私有记忆',
    kindLabel: apiMemoryKindLabel(record),
    notebookId: notebook.id,
    notebookName: notebook.name,
    updatedAt: Date.parse(record.updatedAt),
  };
}

function notebookPrivateMemory(
  notebook: StageListItem,
  memory: NotebookMemoryItem,
): LibraryMemoryItem {
  return {
    id: `local-private:${notebook.id}:${memory.id}`,
    title: memory.title,
    text: memory.text,
    layer: 'private',
    layerLabel: '个人学习层',
    scopeLabel: '私有',
    sourceLabel: localPrivateSourceLabel(memory),
    kindLabel: memoryKindLabel(memory),
    notebookId: notebook.id,
    notebookName: notebook.name,
    updatedAt: memory.updatedAt,
  };
}

function weakPointMemory(notebook: StageListItem, point: WeakPointMemory): LibraryMemoryItem {
  return {
    id: `weak:${notebook.id}:${point.id}`,
    title: point.title,
    text: point.reason,
    layer: 'private',
    layerLabel: '个人学习层',
    scopeLabel: '私有',
    sourceLabel: '待复习弱点',
    kindLabel: '弱点',
    notebookId: notebook.id,
    notebookName: notebook.name,
    updatedAt: point.reviewedAt || point.createdAt,
  };
}

function parseSearchTimestamp(value?: string | number | null): number | undefined {
  if (!value) return undefined;
  const timestamp = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function searchMemoryToLibraryMemory(
  memory: CourseResourceSearchMemory,
  notebooksById: Map<string, StageListItem>,
): LibraryMemoryItem {
  const notebook = memory.notebookId ? notebooksById.get(memory.notebookId) : undefined;
  const isPrivate = memory.scope === 'private';
  const isNotebookLayer = Boolean(memory.notebookId) || memory.targetType === 'notebook';
  const layer: LibraryMemoryItem['layer'] = isPrivate
    ? 'private'
    : isNotebookLayer
      ? 'notebook'
      : 'course';

  return {
    id: `search-memory:${memory.id}`,
    title: memory.title,
    text: memory.text,
    layer,
    layerLabel:
      layer === 'course' ? '课程控制层' : layer === 'notebook' ? '笔记本知识层' : '个人学习层',
    scopeLabel: isPrivate ? '私有' : '共有',
    sourceLabel: studyMemorySourceLabel(memory.source),
    kindLabel: studyMemoryKindLabel(memory.kind),
    notebookId: memory.notebookId ?? undefined,
    notebookName: notebook?.name,
    updatedAt: parseSearchTimestamp(memory.updatedAt),
  };
}

function practiceState(problem: NotebookProblemClientRecord): PracticeState {
  const status = problem.latestAttempt?.status ?? null;
  if (!status) return 'unattempted';
  if (status === 'passed') return 'mastered';
  if (status === 'failed' || status === 'partial' || status === 'error') return 'wrong';
  return 'review';
}

const PROBLEM_BANK_PRIMARY_BUTTON_CLASS =
  'bg-sky-600 text-white shadow-sm shadow-sky-100/70 hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 dark:shadow-none dark:hover:bg-sky-400';
const PROBLEM_BANK_LIST_GRID_CLASS =
  'grid grid-cols-[4rem_5.25rem_minmax(14rem,1.7fr)_7rem_6.5rem_4rem_4.75rem_7.5rem]';
const PROBLEM_BANK_PAGE_SIZE = 10;
const RESOURCE_TAB_TRIGGER_CLASS =
  'h-11 flex-none gap-2 rounded-none border-0 px-4 text-sm font-semibold text-slate-500 shadow-none hover:text-slate-950 data-active:bg-transparent data-active:text-slate-950 data-active:shadow-none dark:text-slate-400 dark:hover:text-white dark:data-active:bg-transparent dark:data-active:text-white group-data-[orientation=horizontal]/tabs:after:bottom-0 group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=horizontal]/tabs:after:rounded-full';

function problemListPracticeStateLabel(
  problem: NotebookProblemClientRecord,
  locale: 'zh-CN' | 'en-US',
) {
  const state = practiceState(problem);
  if (state === 'wrong') return locale === 'zh-CN' ? '需复习' : 'Review';
  if (state === 'mastered') return locale === 'zh-CN' ? '已掌握' : 'Mastered';
  if (state === 'unattempted') return locale === 'zh-CN' ? '未做' : 'Untried';
  return locale === 'zh-CN' ? '进行中' : 'In progress';
}

function problemListPracticeStateClassName(problem: NotebookProblemClientRecord) {
  const state = practiceState(problem);
  if (state === 'wrong') {
    return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200';
  }
  if (state === 'mastered') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200';
  }
  if (state === 'unattempted') {
    return 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300';
  }
  return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200';
}

function typeLabel(type: NotebookProblemClientRecord['type'], locale: 'zh-CN' | 'en-US') {
  const zh = {
    short_answer: '简答题',
    choice: '选择题',
    proof: '证明题',
    calculation: '计算题',
    code: '代码题',
    fill_blank: '填空题',
  } as const;
  const en = {
    short_answer: 'Short answer',
    choice: 'Choice',
    proof: 'Proof',
    calculation: 'Calculation',
    code: 'Code',
    fill_blank: 'Fill blank',
  } as const;
  return locale === 'zh-CN' ? zh[type] : en[type];
}

function difficultyLabel(
  difficulty: NotebookProblemClientRecord['difficulty'],
  locale: 'zh-CN' | 'en-US',
) {
  const zh = { easy: '简单', medium: '中等', hard: '困难' } as const;
  const en = { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as const;
  return locale === 'zh-CN' ? zh[difficulty] : en[difficulty];
}

function formatProblemNumber(problem: NotebookProblemClientRecord): string {
  return `#${problem.problemNumber ?? problem.order + 1}`;
}

function difficultyDots(problem: NotebookProblemClientRecord) {
  const activeCount = problem.difficulty === 'easy' ? 1 : problem.difficulty === 'medium' ? 2 : 3;
  return [0, 1, 2].map((index) => index < activeCount);
}

function difficultyDotClassName(
  difficulty: NotebookProblemClientRecord['difficulty'],
  active: boolean,
) {
  if (!active) return 'bg-slate-200 dark:bg-slate-700';
  if (difficulty === 'easy') return 'bg-emerald-500 dark:bg-emerald-300';
  if (difficulty === 'medium') return 'bg-amber-500 dark:bg-amber-300';
  return 'bg-rose-500 dark:bg-rose-300';
}

function difficultyTextClassName(difficulty: NotebookProblemClientRecord['difficulty']) {
  if (difficulty === 'easy') return 'text-emerald-700 dark:text-emerald-300';
  if (difficulty === 'medium') return 'text-amber-700 dark:text-amber-300';
  return 'text-rose-700 dark:text-rose-300';
}

function latestScoreLabel(problem: NotebookProblemClientRecord, locale: 'zh-CN' | 'en-US') {
  if (typeof problem.latestAttempt?.score === 'number') {
    return `${problem.latestAttempt.score}/${problem.points}`;
  }
  return locale === 'zh-CN' ? '未提交' : 'No score';
}

function problemTypeVisual(type: NotebookProblemClientRecord['type']): {
  Icon: LucideIcon;
  className: string;
} {
  if (type === 'choice') {
    return {
      Icon: ListChecks,
      className:
        'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200',
    };
  }
  if (type === 'calculation') {
    return {
      Icon: Calculator,
      className:
        'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200',
    };
  }
  if (type === 'proof') {
    return {
      Icon: PenLine,
      className:
        'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
    };
  }
  if (type === 'code') {
    return {
      Icon: Code2,
      className:
        'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100',
    };
  }
  if (type === 'fill_blank') {
    return {
      Icon: Type,
      className:
        'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-500/30 dark:bg-fuchsia-500/10 dark:text-fuchsia-200',
    };
  }
  return {
    Icon: FileText,
    className:
      'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-200',
  };
}

function renderProblemContentStem(content: NotebookProblemClientRecord['publicContent']): string {
  if ('stem' in content) return content.stem;
  if ('stemTemplate' in content) return content.stemTemplate;
  return '';
}

function normalizeProblemTopic(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 48);
}

function problemTopics(problem: NotebookProblemClientRecord): string[] {
  const tags = problemConceptTopics(problem).map(normalizeProblemTopic).filter(Boolean);
  if (tags.length > 0) return Array.from(new Set(tags)).slice(0, 6);
  return ['未标注'];
}

type KnowledgeGraphNodeKind = 'center' | 'hub' | 'concept' | 'data' | 'practice' | 'risk';

type KnowledgeGraphNodeData = {
  id: string;
  title: string;
  detail: string;
  diameter: number;
  kind: KnowledgeGraphNodeKind;
  metricLabel?: string;
  onSelect?: (id: string) => void;
};

type KnowledgeGraphNode = FlowNode<KnowledgeGraphNodeData, 'knowledgeGraphBubble'>;

type KnowledgeGraphEdge = FlowEdge & {
  data?: {
    relation?: string;
  };
};

const knowledgeGraphNodeTypes = {
  knowledgeGraphBubble: KnowledgeGraphBubbleNode,
};

const knowledgeGraphFitViewOptions = {
  duration: 0,
  padding: 0.08,
} as const;

const knowledgeGraphToneStyles: Record<
  KnowledgeGraphNodeKind,
  {
    bg: string;
    border: string;
    text: string;
    selected: string;
    edge: string;
  }
> = {
  center: {
    bg: 'bg-[#ffc44d]',
    border: 'border-[#f3a729]',
    text: 'text-[#4f2c00]',
    selected: 'shadow-[0_0_0_8px_rgba(251,191,36,0.22),0_18px_45px_rgba(217,119,6,0.18)]',
    edge: '#f59e0b',
  },
  hub: {
    bg: 'bg-[#1585d1]',
    border: 'border-[#0b6cab]',
    text: 'text-white',
    selected: 'shadow-[0_0_0_8px_rgba(14,165,233,0.2),0_18px_45px_rgba(2,132,199,0.18)]',
    edge: '#0f75bc',
  },
  concept: {
    bg: 'bg-[#49c9c3]',
    border: 'border-[#25aaa4]',
    text: 'text-[#053f45]',
    selected: 'shadow-[0_0_0_8px_rgba(45,212,191,0.2),0_18px_45px_rgba(13,148,136,0.18)]',
    edge: '#14b8a6',
  },
  data: {
    bg: 'bg-[#4fc3eb]',
    border: 'border-[#25a7d5]',
    text: 'text-[#063547]',
    selected: 'shadow-[0_0_0_8px_rgba(56,189,248,0.2),0_18px_45px_rgba(2,132,199,0.18)]',
    edge: '#38bdf8',
  },
  practice: {
    bg: 'bg-[#f9bd4d]',
    border: 'border-[#efa32f]',
    text: 'text-[#4c2c00]',
    selected: 'shadow-[0_0_0_8px_rgba(251,191,36,0.18),0_18px_45px_rgba(217,119,6,0.14)]',
    edge: '#f59e0b',
  },
  risk: {
    bg: 'bg-[#f16b6d]',
    border: 'border-[#e05255]',
    text: 'text-white',
    selected: 'shadow-[0_0_0_8px_rgba(248,113,113,0.2),0_18px_45px_rgba(220,38,38,0.16)]',
    edge: '#ef4444',
  },
};

const knowledgeGraphHandleSides: Array<{ id: string; position: Position }> = [
  { id: 'left', position: Position.Left },
  { id: 'right', position: Position.Right },
  { id: 'top', position: Position.Top },
  { id: 'bottom', position: Position.Bottom },
];

function KnowledgeGraphBubbleNode({ data, selected }: FlowNodeProps<KnowledgeGraphNode>) {
  const tone = knowledgeGraphToneStyles[data.kind];
  const diameter = data.diameter;
  const compact = diameter < 76;

  return (
    <button
      type="button"
      className={cn(
        'relative flex cursor-pointer items-center justify-center rounded-full border text-center transition-all duration-200',
        'shadow-[0_12px_28px_rgba(15,23,42,0.12)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-200',
        tone.bg,
        tone.border,
        tone.text,
        selected ? tone.selected : '',
      )}
      style={{ width: diameter, height: diameter }}
      onClick={(event) => {
        event.stopPropagation();
        data.onSelect?.(data.id);
      }}
    >
      {knowledgeGraphHandleSides.map(({ id, position }) => (
        <span key={id}>
          <Handle className="opacity-0" id={`target-${id}`} position={position} type="target" />
          <Handle className="opacity-0" id={`source-${id}`} position={position} type="source" />
        </span>
      ))}
      <span
        className={cn(
          'max-w-[76%] whitespace-pre-line font-semibold leading-tight tracking-normal',
          compact ? 'text-[11px]' : diameter >= 116 ? 'text-[20px]' : 'text-[14px]',
        )}
      >
        {data.title}
      </span>
      {data.metricLabel ? (
        <span className="absolute -bottom-2 rounded-full bg-white/92 px-2 py-0.5 text-[10px] font-bold text-slate-500 shadow-sm ring-1 ring-slate-200 dark:bg-slate-950/90 dark:text-slate-200 dark:ring-white/10">
          {data.metricLabel}
        </span>
      ) : null}
    </button>
  );
}

function knowledgeNode(
  id: string,
  title: string,
  kind: KnowledgeGraphNodeKind,
  x: number,
  y: number,
  diameter: number,
  detail: string,
  metricLabel?: string,
): KnowledgeGraphNode {
  return {
    id,
    type: 'knowledgeGraphBubble',
    position: { x, y },
    origin: [0.5, 0.5],
    data: {
      id,
      title,
      detail,
      kind,
      diameter,
      metricLabel,
    },
    draggable: false,
  };
}

function knowledgeEdge(
  id: string,
  source: string,
  target: string,
  relation: string,
  color: string,
  sourceSide: 'left' | 'right' | 'top' | 'bottom' = 'right',
  targetSide: 'left' | 'right' | 'top' | 'bottom' = 'left',
): KnowledgeGraphEdge {
  return {
    id,
    source,
    target,
    sourceHandle: `source-${sourceSide}`,
    targetHandle: `target-${targetSide}`,
    type: 'straight',
    label: relation,
    labelShowBg: true,
    labelBgBorderRadius: 6,
    labelBgPadding: [4, 2],
    labelStyle: {
      fill: '#1f4f75',
      fontSize: 12,
      fontWeight: 600,
    },
    labelBgStyle: {
      fill: 'rgba(255,255,255,0.82)',
    },
    style: {
      stroke: color,
      strokeWidth: 1.25,
    },
    data: {
      relation,
    },
    focusable: false,
    selectable: false,
  };
}

function countProblemsByKeywords(problems: LibraryProblemItem[], keywords: string[]): number {
  const normalizedKeywords = keywords.map((keyword) => keyword.toLowerCase());
  return problems.filter((problem) => {
    const haystack = [
      problem.title,
      problem.notebookName,
      problem.type,
      problem.difficulty,
      ...problem.tags,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return normalizedKeywords.some((keyword) => haystack.includes(keyword));
  }).length;
}

type KnowledgeGraphCourseKey = 'CSC108' | 'CPSC107' | 'CSC148' | 'MAT102' | 'MAT136' | 'GENERIC';

type KnowledgeGraphTemplateCourseKey = Exclude<KnowledgeGraphCourseKey, 'CSC108'>;

type KnowledgeGraphMetricSource = 'problems' | 'memories' | 'topics' | 'notebooks';

type KnowledgeGraphSide = 'left' | 'right' | 'top' | 'bottom';

type KnowledgeGraphTemplateNode = {
  id: string;
  title: string;
  kind: KnowledgeGraphNodeKind;
  x: number;
  y: number;
  diameter: number;
  detail: string;
  metricSource?: KnowledgeGraphMetricSource;
  metricKeywords?: string[];
};

type KnowledgeGraphTemplateEdge = {
  id: string;
  source: string;
  target: string;
  relation: string;
  color: string;
  sourceSide?: KnowledgeGraphSide;
  targetSide?: KnowledgeGraphSide;
};

type KnowledgeGraphTemplate = {
  centerDetail: (courseName: string) => string;
  nodes: KnowledgeGraphTemplateNode[];
  edges: KnowledgeGraphTemplateEdge[];
};

type KnowledgeGraphBuildArgs = {
  course: CourseRecord | null | undefined;
  courseGraphKey: KnowledgeGraphCourseKey;
  problemItems: LibraryProblemItem[];
  problemTotal: number;
  memoryItems: LibraryMemoryItem[];
  topicRows: Array<{ title: string; total: number }>;
  notebooks: StageListItem[];
};

const COURSE_KNOWLEDGE_GRAPH_TEMPLATES: Record<
  KnowledgeGraphTemplateCourseKey,
  KnowledgeGraphTemplate
> = {
  CPSC107: {
    centerDetail: (courseName) =>
      `${courseName} 的知识总入口。图谱按 Racket 语义、设计配方、递归模板和搜索策略组织课程资源。`,
    nodes: [
      {
        id: 'racket-basics',
        title: 'Racket\n基础',
        kind: 'hub',
        x: 235,
        y: 390,
        diameter: 90,
        detail:
          '前缀表达式、primitive data、if/cond、全局变量和求值规则，是后续设计配方的执行语义底座。',
        metricSource: 'notebooks',
        metricKeywords: ['racket', 'prefix', 'primitive', 'if', 'cond'],
      },
      {
        id: 'prefix-expression',
        title: 'prefix\nexpression',
        kind: 'risk',
        x: 85,
        y: 320,
        diameter: 72,
        detail: 'Racket 表达式从左到右求值，operator 在最前。常见错误是按 Python 中缀表达式追踪。',
      },
      {
        id: 'cond-if',
        title: 'if\ncond',
        kind: 'risk',
        x: 95,
        y: 455,
        diameter: 70,
        detail: 'if 必须有两个分支；cond 按 question 顺序检查，只执行第一个 true 分支。',
      },
      {
        id: 'htdf-htdd',
        title: 'HtDF\nHtDD',
        kind: 'practice',
        x: 392,
        y: 205,
        diameter: 96,
        detail:
          '函数设计配方和数据定义配方：signature、purpose、examples/tests、stub、template，再到 body。',
        metricSource: 'notebooks',
        metricKeywords: ['htdf', 'htdd', 'signature', 'purpose', 'template'],
      },
      {
        id: 'signature-purpose',
        title: 'signature\npurpose',
        kind: 'data',
        x: 238,
        y: 78,
        diameter: 82,
        detail: '先写类型签名和 purpose，再写 examples。类型契约决定模板和测试边界。',
      },
      {
        id: 'template-origin',
        title: 'template\norigin',
        kind: 'data',
        x: 555,
        y: 82,
        diameter: 84,
        detail: '模板必须说明来自哪个数据定义。评分会看 template-origin 是否和 HTDD 对齐。',
      },
      {
        id: 'reference-list',
        title: 'Reference\nListOf',
        kind: 'risk',
        x: 405,
        y: 360,
        diameter: 94,
        detail:
          'Reference、自引用、ListOf primitive/compound 和 one-of template，把数据定义转成递归代码。',
        metricSource: 'notebooks',
        metricKeywords: ['reference', 'self-reference', 'listof', 'one-of'],
      },
      {
        id: 'self-reference',
        title: 'self\nreference',
        kind: 'concept',
        x: 302,
        y: 585,
        diameter: 76,
        detail: '数据定义中出现自身时，模板里自然产生递归调用。',
      },
      {
        id: 'one-of',
        title: 'one-of',
        kind: 'concept',
        x: 532,
        y: 520,
        diameter: 70,
        detail: 'one-of 的每个 case 都要有对应分支；two one-of 要先整理交叉表。',
      },
      {
        id: 'recursion-bst',
        title: 'Recursion\nBST',
        kind: 'concept',
        x: 780,
        y: 242,
        diameter: 96,
        detail:
          '结构递归、natural helper、tree terminology 和 BST invariant。代码必须尊重数据形状。',
        metricSource: 'notebooks',
        metricKeywords: ['recursion', 'bst', 'tree', 'lookup'],
      },
      {
        id: 'bst-invariant',
        title: 'BST\ninvariant',
        kind: 'data',
        x: 682,
        y: 150,
        diameter: 80,
        detail: '左子树 key 小于 node，右子树 key 大于 node。查找题要用 invariant 剪枝。',
      },
      {
        id: 'mutual-reference',
        title: 'mutual\nreference',
        kind: 'data',
        x: 952,
        y: 208,
        diameter: 86,
        detail: 'Node/ListOfNode、Course/ListOfCourse 这类互相引用的数据定义，需要互相递归的模板。',
      },
      {
        id: 'local-abstract',
        title: 'Local\nAbstract',
        kind: 'hub',
        x: 785,
        y: 460,
        diameter: 98,
        detail:
          'local scope、closure、lifting、filter/map/build-list/fold 和 lambda，把重复递归抽象成高阶函数。',
        metricSource: 'notebooks',
        metricKeywords: ['local', 'abstract', 'fold', 'lambda', 'filter', 'map'],
      },
      {
        id: 'fold-lambda',
        title: 'fold\nlambda',
        kind: 'practice',
        x: 665,
        y: 562,
        diameter: 78,
        detail: 'foldr/foldl 的 accumulator 方向不同；lambda 要从 signature 反推参数和返回值。',
      },
      {
        id: 'search-genrec',
        title: 'Search\ngenrec',
        kind: 'practice',
        x: 930,
        y: 585,
        diameter: 84,
        detail:
          'Generative recursion/backtracking：state、goal、successors、failure 和 termination 要同时说明。',
        metricSource: 'notebooks',
        metricKeywords: ['search', 'generative', 'backtracking'],
      },
      {
        id: 'tail-worklist',
        title: 'Tail\nworklist',
        kind: 'practice',
        x: 1050,
        y: 455,
        diameter: 84,
        detail:
          'Accumulator、tail position、worklist 和 visited 集合，用来把递归搜索变成可控遍历。',
        metricSource: 'notebooks',
        metricKeywords: ['tail', 'accumulator', 'worklist', 'visited'],
      },
    ],
    edges: [
      {
        id: 'course-racket',
        source: 'course-center',
        target: 'racket-basics',
        relation: '求值规则',
        color: '#94a3b8',
        sourceSide: 'left',
        targetSide: 'right',
      },
      {
        id: 'racket-prefix',
        source: 'racket-basics',
        target: 'prefix-expression',
        relation: '表达式',
        color: '#94a3b8',
        sourceSide: 'left',
        targetSide: 'right',
      },
      {
        id: 'racket-cond',
        source: 'racket-basics',
        target: 'cond-if',
        relation: '分支',
        color: '#94a3b8',
        sourceSide: 'left',
        targetSide: 'right',
      },
      {
        id: 'course-recipe',
        source: 'course-center',
        target: 'htdf-htdd',
        relation: '设计配方',
        color: '#0f75bc',
        sourceSide: 'left',
        targetSide: 'right',
      },
      {
        id: 'recipe-signature',
        source: 'htdf-htdd',
        target: 'signature-purpose',
        relation: '契约',
        color: '#0f75bc',
        sourceSide: 'top',
        targetSide: 'bottom',
      },
      {
        id: 'recipe-origin',
        source: 'htdf-htdd',
        target: 'template-origin',
        relation: '模板来源',
        color: '#0f75bc',
        sourceSide: 'top',
        targetSide: 'bottom',
      },
      {
        id: 'course-list',
        source: 'course-center',
        target: 'reference-list',
        relation: '数据递归',
        color: '#ef4444',
        sourceSide: 'left',
        targetSide: 'right',
      },
      {
        id: 'list-self',
        source: 'reference-list',
        target: 'self-reference',
        relation: '自引用',
        color: '#14b8a6',
        sourceSide: 'bottom',
        targetSide: 'top',
      },
      {
        id: 'list-one-of',
        source: 'reference-list',
        target: 'one-of',
        relation: '分类',
        color: '#14b8a6',
        sourceSide: 'right',
        targetSide: 'left',
      },
      {
        id: 'course-bst',
        source: 'course-center',
        target: 'recursion-bst',
        relation: '结构递归',
        color: '#14b8a6',
        sourceSide: 'right',
        targetSide: 'left',
      },
      {
        id: 'bst-invariant-edge',
        source: 'recursion-bst',
        target: 'bst-invariant',
        relation: '排序约束',
        color: '#38bdf8',
        sourceSide: 'left',
        targetSide: 'right',
      },
      {
        id: 'bst-mutual',
        source: 'recursion-bst',
        target: 'mutual-reference',
        relation: '树形数据',
        color: '#38bdf8',
        sourceSide: 'right',
        targetSide: 'left',
      },
      {
        id: 'course-abstract',
        source: 'course-center',
        target: 'local-abstract',
        relation: '抽象复用',
        color: '#0f75bc',
        sourceSide: 'right',
        targetSide: 'left',
      },
      {
        id: 'abstract-fold',
        source: 'local-abstract',
        target: 'fold-lambda',
        relation: '高阶函数',
        color: '#f59e0b',
        sourceSide: 'bottom',
        targetSide: 'top',
      },
      {
        id: 'abstract-search',
        source: 'local-abstract',
        target: 'search-genrec',
        relation: '搜索',
        color: '#f59e0b',
        sourceSide: 'bottom',
        targetSide: 'top',
      },
      {
        id: 'search-tail',
        source: 'local-abstract',
        target: 'tail-worklist',
        relation: '累加器',
        color: '#f59e0b',
        sourceSide: 'right',
        targetSide: 'left',
      },
    ],
  },
  CSC148: {
    centerDetail: (courseName) =>
      `${courseName} 的知识总入口。图谱把 Python 对象模型、设计配方、ADT、递归结构和运行时间放在同一张学习地图里。`,
    nodes: [
      {
        id: 'memory-model',
        title: 'Python\n内存模型',
        kind: 'practice',
        x: 232,
        y: 400,
        diameter: 92,
        detail:
          '变量绑定、object identity、aliasing、mutation 和 list/object state tracing，是所有 class 和 ADT 题的底层语义。',
        metricSource: 'notebooks',
        metricKeywords: ['memory model', 'aliasing', 'mutation'],
      },
      {
        id: 'aliasing',
        title: 'aliasing',
        kind: 'risk',
        x: 82,
        y: 325,
        diameter: 70,
        detail: '两个名字可能指向同一个对象。追踪题要画对象盒子，而不是只改变量名。',
      },
      {
        id: 'mutation',
        title: 'mutation',
        kind: 'risk',
        x: 100,
        y: 455,
        diameter: 74,
        detail: 'list、object attribute 和 method call 可能原地改变状态；返回值和副作用要分开。',
      },
      {
        id: 'function-testing',
        title: 'Function\nTesting',
        kind: 'hub',
        x: 392,
        y: 205,
        diameter: 96,
        detail:
          'Function Design Recipe、precondition、docstring、type annotation、pytest 和边界测试，决定代码题是否可评分。',
        metricSource: 'notebooks',
        metricKeywords: ['function', 'testing', 'pytest', 'precondition', 'docstring'],
      },
      {
        id: 'precondition',
        title: 'precondition',
        kind: 'data',
        x: 238,
        y: 78,
        diameter: 84,
        detail: 'Precondition 是调用者必须保证的输入条件，不应该在函数体里偷偷改题意。',
      },
      {
        id: 'pytest',
        title: 'pytest',
        kind: 'data',
        x: 560,
        y: 82,
        diameter: 74,
        detail: '测试要覆盖正常、边界和错误路径；不要只测题目样例。',
      },
      {
        id: 'class-oop',
        title: 'Class\nOOP',
        kind: 'risk',
        x: 405,
        y: 360,
        diameter: 94,
        detail:
          'Class Design Recipe、__init__、Instance Attributes、methods、inheritance 和 polymorphism。',
        metricSource: 'notebooks',
        metricKeywords: ['class', 'oop', 'inheritance', 'polymorphism'],
      },
      {
        id: 'rep-invariant',
        title: 'Rep\nInvariant',
        kind: 'concept',
        x: 302,
        y: 585,
        diameter: 78,
        detail: 'Representation Invariant 写清对象状态必须一直满足的约束。方法实现必须维护它。',
        metricSource: 'memories',
        metricKeywords: ['representation invariant', 'rep invariant', 'invariant'],
      },
      {
        id: 'inheritance',
        title: 'inheritance\npolymorphism',
        kind: 'concept',
        x: 536,
        y: 522,
        diameter: 92,
        detail: 'Subclass 复用父类接口，polymorphism 让调用者依赖公共行为而不是具体类型。',
      },
      {
        id: 'adt',
        title: 'ADT\nStack Queue',
        kind: 'concept',
        x: 780,
        y: 242,
        diameter: 100,
        detail:
          'Abstract Data Type 只暴露 public interface；Stack/Queue 的行为契约比内部实现更重要。',
        metricSource: 'notebooks',
        metricKeywords: ['adt', 'stack', 'queue'],
      },
      {
        id: 'exceptions',
        title: 'Exceptions',
        kind: 'data',
        x: 678,
        y: 150,
        diameter: 82,
        detail: '空容器 pop/remove 等非法操作应按接口抛出指定 exception，不要返回魔法值。',
      },
      {
        id: 'linked-list',
        title: 'Linked\nList',
        kind: 'hub',
        x: 952,
        y: 208,
        diameter: 88,
        detail:
          'Node、_first、empty/non-empty cases、traversal 和 mutation，是后续 tree recursion 的桥。',
        metricSource: 'notebooks',
        metricKeywords: ['linked list', 'node', '_first'],
      },
      {
        id: 'recursion-tree',
        title: 'Recursion\nTree BST',
        kind: 'hub',
        x: 785,
        y: 460,
        diameter: 102,
        detail:
          '递归 tracing、recursive method、Tree/BST template、traversal 和 sorting，是 CSC148 后半段主线。',
        metricSource: 'notebooks',
        metricKeywords: ['recursion', 'tree', 'bst', 'traversal'],
      },
      {
        id: 'tree-template',
        title: 'Tree\ntemplate',
        kind: 'practice',
        x: 665,
        y: 562,
        diameter: 82,
        detail: '先处理 root，再递归 children；BST 题还要用 ordering invariant 剪枝。',
      },
      {
        id: 'runtime',
        title: 'Running\nTime',
        kind: 'practice',
        x: 932,
        y: 586,
        diameter: 86,
        detail: '从代码结构和 ADT 操作成本推导 Big-O，递归题要写 recurrence 或解释每层工作量。',
        metricSource: 'notebooks',
        metricKeywords: ['running time', 'runtime', 'big-o', 'complexity'],
      },
      {
        id: 'recursive-sort',
        title: 'recursive\nsorting',
        kind: 'practice',
        x: 1050,
        y: 455,
        diameter: 86,
        detail:
          'merge sort、quick sort 这类 recursive sorting 要分清 split、recursive calls 和 combine cost。',
      },
    ],
    edges: [
      {
        id: 'course-memory',
        source: 'course-center',
        target: 'memory-model',
        relation: '对象语义',
        color: '#94a3b8',
        sourceSide: 'left',
        targetSide: 'right',
      },
      {
        id: 'memory-aliasing',
        source: 'memory-model',
        target: 'aliasing',
        relation: '共享对象',
        color: '#94a3b8',
        sourceSide: 'left',
        targetSide: 'right',
      },
      {
        id: 'memory-mutation',
        source: 'memory-model',
        target: 'mutation',
        relation: '状态变化',
        color: '#94a3b8',
        sourceSide: 'left',
        targetSide: 'right',
      },
      {
        id: 'course-testing',
        source: 'course-center',
        target: 'function-testing',
        relation: '函数合约',
        color: '#0f75bc',
        sourceSide: 'left',
        targetSide: 'right',
      },
      {
        id: 'testing-precondition',
        source: 'function-testing',
        target: 'precondition',
        relation: '输入条件',
        color: '#0f75bc',
        sourceSide: 'top',
        targetSide: 'bottom',
      },
      {
        id: 'testing-pytest',
        source: 'function-testing',
        target: 'pytest',
        relation: '验证',
        color: '#0f75bc',
        sourceSide: 'top',
        targetSide: 'bottom',
      },
      {
        id: 'course-class',
        source: 'course-center',
        target: 'class-oop',
        relation: '类设计',
        color: '#ef4444',
        sourceSide: 'left',
        targetSide: 'right',
      },
      {
        id: 'class-rep',
        source: 'class-oop',
        target: 'rep-invariant',
        relation: '状态约束',
        color: '#14b8a6',
        sourceSide: 'bottom',
        targetSide: 'top',
      },
      {
        id: 'class-inheritance',
        source: 'class-oop',
        target: 'inheritance',
        relation: '接口复用',
        color: '#14b8a6',
        sourceSide: 'right',
        targetSide: 'left',
      },
      {
        id: 'course-adt',
        source: 'course-center',
        target: 'adt',
        relation: '抽象接口',
        color: '#14b8a6',
        sourceSide: 'right',
        targetSide: 'left',
      },
      {
        id: 'adt-exceptions',
        source: 'adt',
        target: 'exceptions',
        relation: '错误合约',
        color: '#38bdf8',
        sourceSide: 'left',
        targetSide: 'right',
      },
      {
        id: 'adt-list',
        source: 'adt',
        target: 'linked-list',
        relation: '实现',
        color: '#38bdf8',
        sourceSide: 'right',
        targetSide: 'left',
      },
      {
        id: 'course-recursion',
        source: 'course-center',
        target: 'recursion-tree',
        relation: '递归结构',
        color: '#0f75bc',
        sourceSide: 'right',
        targetSide: 'left',
      },
      {
        id: 'recursion-template',
        source: 'recursion-tree',
        target: 'tree-template',
        relation: '模板',
        color: '#f59e0b',
        sourceSide: 'bottom',
        targetSide: 'top',
      },
      {
        id: 'recursion-runtime',
        source: 'recursion-tree',
        target: 'runtime',
        relation: '成本',
        color: '#f59e0b',
        sourceSide: 'bottom',
        targetSide: 'top',
      },
      {
        id: 'recursion-sort',
        source: 'recursion-tree',
        target: 'recursive-sort',
        relation: '排序',
        color: '#f59e0b',
        sourceSide: 'right',
        targetSide: 'left',
      },
    ],
  },
  MAT102: {
    centerDetail: (courseName) =>
      `${courseName} 的知识总入口。图谱把证明语言、集合关系、函数、归纳、数论、图论和群论连成可复习的离散数学地图。`,
    nodes: [
      {
        id: 'logic-proof',
        title: '逻辑\n证明',
        kind: 'hub',
        x: 238,
        y: 390,
        diameter: 92,
        detail:
          '命题逻辑、量词、direct proof、contrapositive、contradiction 和证明结构，是整门课的表达底座。',
        metricSource: 'notebooks',
        metricKeywords: ['proof', 'logic', 'quantifier', 'contradiction', 'contrapositive'],
      },
      {
        id: 'quantifiers',
        title: '量词',
        kind: 'risk',
        x: 85,
        y: 318,
        diameter: 66,
        detail: 'forall 与 exists 的顺序不能随意交换；否定量词时要同时换量词和谓词。',
      },
      {
        id: 'proof-methods',
        title: '反证\n逆否',
        kind: 'risk',
        x: 98,
        y: 455,
        diameter: 72,
        detail:
          'Contradiction 假设结论否定，contrapositive 证明 P -> Q 的等价命题 not Q -> not P。',
      },
      {
        id: 'sets-relations',
        title: '集合\n关系',
        kind: 'practice',
        x: 392,
        y: 205,
        diameter: 96,
        detail: '集合运算、笛卡尔积、关系性质、equivalence relation 和 partition。',
        metricSource: 'notebooks',
        metricKeywords: ['set', 'relation', 'equivalence', 'partition'],
      },
      {
        id: 'set-algebra',
        title: '集合\n运算',
        kind: 'data',
        x: 238,
        y: 78,
        diameter: 78,
        detail: '交并补差和 De Morgan 定律。证明集合相等时常用双向包含。',
      },
      {
        id: 'equivalence',
        title: 'equivalence\nrelation',
        kind: 'data',
        x: 565,
        y: 82,
        diameter: 92,
        detail: 'Reflexive、symmetric、transitive 三件套缺一不可；等价类会切分全集。',
      },
      {
        id: 'functions',
        title: '函数',
        kind: 'concept',
        x: 405,
        y: 360,
        diameter: 88,
        detail:
          'Domain/codomain、image/preimage、composition、inverse、injective、surjective、bijective。',
        metricSource: 'notebooks',
        metricKeywords: ['function', 'injective', 'surjective', 'bijective', 'inverse'],
      },
      {
        id: 'bijection',
        title: '双射',
        kind: 'concept',
        x: 304,
        y: 585,
        diameter: 68,
        detail: 'Bijection 同时 one-to-one 和 onto；构造反函数是证明双射的常见方式。',
      },
      {
        id: 'composition',
        title: 'composition',
        kind: 'concept',
        x: 538,
        y: 520,
        diameter: 80,
        detail: '复合函数要检查 codomain/domain 是否接得上，不能只算公式。',
      },
      {
        id: 'induction-counting',
        title: '归纳\n计数',
        kind: 'hub',
        x: 780,
        y: 242,
        diameter: 96,
        detail: 'Mathematical induction、strong induction、递推、鸽巢原理和基本计数。',
        metricSource: 'notebooks',
        metricKeywords: ['induction', 'counting', 'pigeonhole', 'recurrence'],
      },
      {
        id: 'strong-induction',
        title: 'strong\ninduction',
        kind: 'data',
        x: 680,
        y: 150,
        diameter: 82,
        detail: '强归纳可以假设所有更小情形成立，适合拆成多个前置规模的证明。',
      },
      {
        id: 'number-theory',
        title: '数论',
        kind: 'practice',
        x: 952,
        y: 210,
        diameter: 78,
        detail: 'Divisibility、gcd、Euclidean algorithm、modular arithmetic 和 congruence。',
        metricSource: 'notebooks',
        metricKeywords: ['number theory', 'divisibility', 'gcd', 'modular', 'congruence'],
      },
      {
        id: 'graphs',
        title: '图论',
        kind: 'concept',
        x: 785,
        y: 460,
        diameter: 86,
        detail: 'Graph、degree、path、cycle、connectedness、tree 和 counting arguments。',
        metricSource: 'notebooks',
        metricKeywords: ['graph', 'degree', 'path', 'cycle', 'tree'],
      },
      {
        id: 'group-theory',
        title: '群论',
        kind: 'hub',
        x: 665,
        y: 562,
        diameter: 78,
        detail:
          'Group axioms、subgroup、cyclic group、homomorphism。当前课程里这块需要更明确地从定义推进到证明。',
        metricSource: 'memories',
        metricKeywords: ['group', 'subgroup', 'homomorphism', 'cyclic', '群'],
      },
      {
        id: 'modular',
        title: 'modular\narithmetic',
        kind: 'practice',
        x: 932,
        y: 585,
        diameter: 88,
        detail: '同余类、模运算和整除证明经常连到群论中的 cyclic structure。',
      },
      {
        id: 'homomorphism',
        title: 'homomorphism',
        kind: 'practice',
        x: 1050,
        y: 455,
        diameter: 82,
        detail: '同态要保运算：phi(a*b)=phi(a)*phi(b)。证明时先写清运算所在集合。',
      },
    ],
    edges: [
      {
        id: 'course-proof',
        source: 'course-center',
        target: 'logic-proof',
        relation: '证明语言',
        color: '#94a3b8',
        sourceSide: 'left',
        targetSide: 'right',
      },
      {
        id: 'proof-quantifiers',
        source: 'logic-proof',
        target: 'quantifiers',
        relation: '命题表达',
        color: '#94a3b8',
        sourceSide: 'left',
        targetSide: 'right',
      },
      {
        id: 'proof-methods-edge',
        source: 'logic-proof',
        target: 'proof-methods',
        relation: '证明策略',
        color: '#94a3b8',
        sourceSide: 'left',
        targetSide: 'right',
      },
      {
        id: 'course-relations',
        source: 'course-center',
        target: 'sets-relations',
        relation: '结构对象',
        color: '#0f75bc',
        sourceSide: 'left',
        targetSide: 'right',
      },
      {
        id: 'relations-sets',
        source: 'sets-relations',
        target: 'set-algebra',
        relation: '集合代数',
        color: '#0f75bc',
        sourceSide: 'top',
        targetSide: 'bottom',
      },
      {
        id: 'relations-equiv',
        source: 'sets-relations',
        target: 'equivalence',
        relation: '分类',
        color: '#0f75bc',
        sourceSide: 'top',
        targetSide: 'bottom',
      },
      {
        id: 'course-functions',
        source: 'course-center',
        target: 'functions',
        relation: '映射',
        color: '#14b8a6',
        sourceSide: 'left',
        targetSide: 'right',
      },
      {
        id: 'functions-bijection',
        source: 'functions',
        target: 'bijection',
        relation: '一一对应',
        color: '#14b8a6',
        sourceSide: 'bottom',
        targetSide: 'top',
      },
      {
        id: 'functions-composition',
        source: 'functions',
        target: 'composition',
        relation: '复合',
        color: '#14b8a6',
        sourceSide: 'right',
        targetSide: 'left',
      },
      {
        id: 'course-induction',
        source: 'course-center',
        target: 'induction-counting',
        relation: '递推证明',
        color: '#38bdf8',
        sourceSide: 'right',
        targetSide: 'left',
      },
      {
        id: 'induction-strong',
        source: 'induction-counting',
        target: 'strong-induction',
        relation: '强归纳',
        color: '#38bdf8',
        sourceSide: 'left',
        targetSide: 'right',
      },
      {
        id: 'induction-number',
        source: 'induction-counting',
        target: 'number-theory',
        relation: '整数结构',
        color: '#f59e0b',
        sourceSide: 'right',
        targetSide: 'left',
      },
      {
        id: 'course-graphs',
        source: 'course-center',
        target: 'graphs',
        relation: '离散结构',
        color: '#0f75bc',
        sourceSide: 'right',
        targetSide: 'left',
      },
      {
        id: 'graphs-group',
        source: 'graphs',
        target: 'group-theory',
        relation: '结构证明',
        color: '#f59e0b',
        sourceSide: 'bottom',
        targetSide: 'top',
      },
      {
        id: 'number-modular',
        source: 'number-theory',
        target: 'modular',
        relation: '同余',
        color: '#f59e0b',
        sourceSide: 'bottom',
        targetSide: 'top',
      },
      {
        id: 'group-hom',
        source: 'group-theory',
        target: 'homomorphism',
        relation: '保运算',
        color: '#f59e0b',
        sourceSide: 'right',
        targetSide: 'left',
      },
    ],
  },
  MAT136: {
    centerDetail: (courseName) =>
      `${courseName} 的知识总入口。图谱按积分概念、技巧、应用、级数和微分方程组织复习路径。`,
    nodes: [
      {
        id: 'integration-foundation',
        title: '积分\n基础',
        kind: 'hub',
        x: 235,
        y: 390,
        diameter: 92,
        detail: 'Riemann sum、antiderivative、FTC、definite/indefinite integral 和面积解释。',
        metricSource: 'notebooks',
        metricKeywords: ['integral', 'riemann', 'ftc', 'antiderivative'],
      },
      {
        id: 'ftc',
        title: 'FTC',
        kind: 'risk',
        x: 88,
        y: 320,
        diameter: 66,
        detail: 'FTC I/II 连接面积函数、导数和定积分计算。上下限是函数时要链式法则。',
      },
      {
        id: 'riemann-sum',
        title: 'Riemann\nsum',
        kind: 'risk',
        x: 104,
        y: 455,
        diameter: 78,
        detail: '把极限和面积转成积分时，Delta x、sample point 和区间端点要对应。',
      },
      {
        id: 'techniques',
        title: '积分\n技巧',
        kind: 'practice',
        x: 392,
        y: 205,
        diameter: 96,
        detail:
          'Substitution、integration by parts、partial fractions、trig substitution 和 improper integrals。',
        metricSource: 'notebooks',
        metricKeywords: ['substitution', 'parts', 'partial fractions', 'improper'],
      },
      {
        id: 'substitution',
        title: 'u-sub',
        kind: 'data',
        x: 238,
        y: 78,
        diameter: 70,
        detail: 'u-sub 要同步替换 integrand、dx 和积分上下限。',
      },
      {
        id: 'parts',
        title: 'by parts',
        kind: 'data',
        x: 558,
        y: 82,
        diameter: 76,
        detail: '选择 u 和 dv 时优先让 u 变简单；定积分版本要带边界项。',
      },
      {
        id: 'applications',
        title: '积分\n应用',
        kind: 'risk',
        x: 405,
        y: 360,
        diameter: 92,
        detail:
          'Area between curves、volume、average value、arc length 和 work，需要先画量再设积分。',
        metricSource: 'notebooks',
        metricKeywords: ['area', 'volume', 'average', 'arc length', 'work'],
      },
      {
        id: 'volume',
        title: 'volume',
        kind: 'concept',
        x: 304,
        y: 585,
        diameter: 72,
        detail: 'Disk/washer/shell 要先确定旋转轴、半径和厚度方向。',
      },
      {
        id: 'improper',
        title: 'improper',
        kind: 'concept',
        x: 538,
        y: 520,
        diameter: 78,
        detail: '无穷区间或 integrand 发散点都要改写成极限后再判断收敛。',
      },
      {
        id: 'sequences-series',
        title: '数列\n级数',
        kind: 'hub',
        x: 780,
        y: 242,
        diameter: 96,
        detail:
          'Sequences、series、geometric/p-series、comparison、ratio、root、alternating tests。',
        metricSource: 'notebooks',
        metricKeywords: ['sequence', 'series', 'ratio', 'root', 'alternating', 'convergence'],
      },
      {
        id: 'convergence-tests',
        title: 'convergence\ntests',
        kind: 'data',
        x: 675,
        y: 150,
        diameter: 94,
        detail: '先识别级数类型，再选测试；ratio/root 对 factorial 和 exponential 尤其有用。',
      },
      {
        id: 'power-series',
        title: 'Power\nSeries',
        kind: 'data',
        x: 952,
        y: 210,
        diameter: 84,
        detail: 'Radius/interval of convergence 要单独检查端点；Taylor series 要从中心展开。',
        metricSource: 'notebooks',
        metricKeywords: ['power series', 'taylor', 'radius', 'interval'],
      },
      {
        id: 'differential-equations',
        title: '微分\n方程',
        kind: 'concept',
        x: 785,
        y: 460,
        diameter: 92,
        detail: 'Separable equations、slope fields、exponential growth/decay 和初值问题。',
        metricSource: 'notebooks',
        metricKeywords: ['differential', 'separable', 'slope field', 'initial value'],
      },
      {
        id: 'parametric-polar',
        title: '参数\n极坐标',
        kind: 'practice',
        x: 665,
        y: 562,
        diameter: 82,
        detail: 'Parametric/polar curves 的面积、弧长和切线斜率要转换变量后再计算。',
        metricSource: 'notebooks',
        metricKeywords: ['parametric', 'polar'],
      },
      {
        id: 'taylor',
        title: 'Taylor',
        kind: 'practice',
        x: 932,
        y: 585,
        diameter: 74,
        detail: 'Taylor polynomial 需要中心、阶数和余项估计；常用基本级数可以代换组合。',
      },
      {
        id: 'initial-value',
        title: 'initial\nvalue',
        kind: 'practice',
        x: 1050,
        y: 455,
        diameter: 78,
        detail: '解出 general solution 后必须用初值确定常数，不能把 C 留在最终答案里。',
      },
    ],
    edges: [
      {
        id: 'course-foundation',
        source: 'course-center',
        target: 'integration-foundation',
        relation: '积分定义',
        color: '#94a3b8',
        sourceSide: 'left',
        targetSide: 'right',
      },
      {
        id: 'foundation-ftc',
        source: 'integration-foundation',
        target: 'ftc',
        relation: '微积分桥梁',
        color: '#94a3b8',
        sourceSide: 'left',
        targetSide: 'right',
      },
      {
        id: 'foundation-riemann',
        source: 'integration-foundation',
        target: 'riemann-sum',
        relation: '面积极限',
        color: '#94a3b8',
        sourceSide: 'left',
        targetSide: 'right',
      },
      {
        id: 'course-techniques',
        source: 'course-center',
        target: 'techniques',
        relation: '计算工具',
        color: '#0f75bc',
        sourceSide: 'left',
        targetSide: 'right',
      },
      {
        id: 'techniques-sub',
        source: 'techniques',
        target: 'substitution',
        relation: '变量替换',
        color: '#0f75bc',
        sourceSide: 'top',
        targetSide: 'bottom',
      },
      {
        id: 'techniques-parts',
        source: 'techniques',
        target: 'parts',
        relation: '乘积反推',
        color: '#0f75bc',
        sourceSide: 'top',
        targetSide: 'bottom',
      },
      {
        id: 'course-applications',
        source: 'course-center',
        target: 'applications',
        relation: '建模',
        color: '#ef4444',
        sourceSide: 'left',
        targetSide: 'right',
      },
      {
        id: 'applications-volume',
        source: 'applications',
        target: 'volume',
        relation: '几何量',
        color: '#14b8a6',
        sourceSide: 'bottom',
        targetSide: 'top',
      },
      {
        id: 'applications-improper',
        source: 'applications',
        target: 'improper',
        relation: '极限',
        color: '#14b8a6',
        sourceSide: 'right',
        targetSide: 'left',
      },
      {
        id: 'course-series',
        source: 'course-center',
        target: 'sequences-series',
        relation: '无穷过程',
        color: '#38bdf8',
        sourceSide: 'right',
        targetSide: 'left',
      },
      {
        id: 'series-tests',
        source: 'sequences-series',
        target: 'convergence-tests',
        relation: '收敛判别',
        color: '#38bdf8',
        sourceSide: 'left',
        targetSide: 'right',
      },
      {
        id: 'series-power',
        source: 'sequences-series',
        target: 'power-series',
        relation: '函数级数',
        color: '#38bdf8',
        sourceSide: 'right',
        targetSide: 'left',
      },
      {
        id: 'course-de',
        source: 'course-center',
        target: 'differential-equations',
        relation: '变化模型',
        color: '#0f75bc',
        sourceSide: 'right',
        targetSide: 'left',
      },
      {
        id: 'de-parametric',
        source: 'differential-equations',
        target: 'parametric-polar',
        relation: '曲线描述',
        color: '#f59e0b',
        sourceSide: 'bottom',
        targetSide: 'top',
      },
      {
        id: 'series-taylor',
        source: 'power-series',
        target: 'taylor',
        relation: '局部近似',
        color: '#f59e0b',
        sourceSide: 'bottom',
        targetSide: 'top',
      },
      {
        id: 'de-initial',
        source: 'differential-equations',
        target: 'initial-value',
        relation: '初值约束',
        color: '#f59e0b',
        sourceSide: 'right',
        targetSide: 'left',
      },
    ],
  },
  GENERIC: {
    centerDetail: (courseName) =>
      `${courseName} 的知识总入口。图谱会先用课程笔记本、题库主题和学习记忆搭出通用结构。`,
    nodes: [
      {
        id: 'course-structure',
        title: '课程\n结构',
        kind: 'hub',
        x: 250,
        y: 390,
        diameter: 90,
        detail: '把课程的笔记本章节、资料和公共记忆先组织成可扫视的结构。',
        metricSource: 'notebooks',
        metricKeywords: [],
      },
      {
        id: 'notebooks',
        title: '笔记本',
        kind: 'practice',
        x: 90,
        y: 320,
        diameter: 76,
        detail: '每本笔记本对应一个学习单元，后续可以从这里下钻到章节内容。',
      },
      {
        id: 'materials',
        title: '资料',
        kind: 'practice',
        x: 105,
        y: 455,
        diameter: 70,
        detail: '上传资料默认标记为加入知识图谱，适合补充课程概念来源。',
      },
      {
        id: 'knowledge-memory',
        title: '共有\n记忆',
        kind: 'concept',
        x: 392,
        y: 205,
        diameter: 92,
        detail: '课程公共记忆提供稳定的教学合约和关键概念边界。',
        metricSource: 'memories',
        metricKeywords: [],
      },
      {
        id: 'learner-memory',
        title: '私有\n记忆',
        kind: 'risk',
        x: 238,
        y: 78,
        diameter: 78,
        detail: '私有记忆记录个人薄弱点、错因和下一步教学动作。',
      },
      {
        id: 'source-evidence',
        title: '来源\n证据',
        kind: 'data',
        x: 558,
        y: 82,
        diameter: 78,
        detail: '资料、题库和笔记本片段可以作为搜索和讲解的证据来源。',
      },
      {
        id: 'problem-topics',
        title: '题库\n主题',
        kind: 'hub',
        x: 405,
        y: 360,
        diameter: 92,
        detail: '题库标签会显示哪些主题已覆盖、哪些还需要复习。',
        metricSource: 'topics',
        metricKeywords: [],
      },
      {
        id: 'weak-points',
        title: '薄弱点',
        kind: 'risk',
        x: 302,
        y: 585,
        diameter: 76,
        detail: '错题、未掌握主题和复习中状态会汇入薄弱点区域。',
      },
      {
        id: 'practice-loop',
        title: '练习\n闭环',
        kind: 'practice',
        x: 538,
        y: 520,
        diameter: 82,
        detail: '从题目到反馈再到记忆更新，形成复习闭环。',
      },
      {
        id: 'retrieval',
        title: '搜索\n召回',
        kind: 'concept',
        x: 780,
        y: 242,
        diameter: 92,
        detail: '搜索会同时利用直接记忆、语义匹配和题库知识匹配。',
      },
      {
        id: 'semantic',
        title: '语义\n匹配',
        kind: 'data',
        x: 675,
        y: 150,
        diameter: 78,
        detail: '适合模糊提问和跨章节召回。',
      },
      {
        id: 'direct',
        title: '直接\n匹配',
        kind: 'data',
        x: 952,
        y: 210,
        diameter: 78,
        detail: '适合查明确术语、标题和标签。',
      },
      {
        id: 'learning-plan',
        title: '学习\n路线',
        kind: 'practice',
        x: 785,
        y: 460,
        diameter: 90,
        detail: '根据图谱里的资源密度和薄弱点，安排下一步笔记或练习。',
      },
      {
        id: 'review',
        title: '复习',
        kind: 'practice',
        x: 665,
        y: 562,
        diameter: 68,
        detail: '定期回到薄弱点和题库主题，检查是否已经掌握。',
      },
      {
        id: 'next-teaching',
        title: '下一步\n怎么教',
        kind: 'practice',
        x: 950,
        y: 585,
        diameter: 86,
        detail: '把学生当前问题转成教学动作：补概念、示例、练习或纠错。',
      },
    ],
    edges: [
      {
        id: 'course-structure-edge',
        source: 'course-center',
        target: 'course-structure',
        relation: '课程资源',
        color: '#94a3b8',
        sourceSide: 'left',
        targetSide: 'right',
      },
      {
        id: 'structure-notebooks',
        source: 'course-structure',
        target: 'notebooks',
        relation: '章节',
        color: '#94a3b8',
        sourceSide: 'left',
        targetSide: 'right',
      },
      {
        id: 'structure-materials',
        source: 'course-structure',
        target: 'materials',
        relation: '资料',
        color: '#94a3b8',
        sourceSide: 'left',
        targetSide: 'right',
      },
      {
        id: 'course-memory-edge',
        source: 'course-center',
        target: 'knowledge-memory',
        relation: '教学合约',
        color: '#0f75bc',
        sourceSide: 'left',
        targetSide: 'right',
      },
      {
        id: 'memory-learner',
        source: 'knowledge-memory',
        target: 'learner-memory',
        relation: '个人化',
        color: '#0f75bc',
        sourceSide: 'top',
        targetSide: 'bottom',
      },
      {
        id: 'memory-evidence',
        source: 'knowledge-memory',
        target: 'source-evidence',
        relation: '来源',
        color: '#0f75bc',
        sourceSide: 'top',
        targetSide: 'bottom',
      },
      {
        id: 'course-problems-edge',
        source: 'course-center',
        target: 'problem-topics',
        relation: '练习覆盖',
        color: '#ef4444',
        sourceSide: 'left',
        targetSide: 'right',
      },
      {
        id: 'problems-weak',
        source: 'problem-topics',
        target: 'weak-points',
        relation: '诊断',
        color: '#14b8a6',
        sourceSide: 'bottom',
        targetSide: 'top',
      },
      {
        id: 'problems-loop',
        source: 'problem-topics',
        target: 'practice-loop',
        relation: '反馈',
        color: '#14b8a6',
        sourceSide: 'right',
        targetSide: 'left',
      },
      {
        id: 'course-retrieval-edge',
        source: 'course-center',
        target: 'retrieval',
        relation: '查找知识',
        color: '#38bdf8',
        sourceSide: 'right',
        targetSide: 'left',
      },
      {
        id: 'retrieval-semantic',
        source: 'retrieval',
        target: 'semantic',
        relation: '模糊召回',
        color: '#38bdf8',
        sourceSide: 'left',
        targetSide: 'right',
      },
      {
        id: 'retrieval-direct',
        source: 'retrieval',
        target: 'direct',
        relation: '精确命中',
        color: '#38bdf8',
        sourceSide: 'right',
        targetSide: 'left',
      },
      {
        id: 'course-plan-edge',
        source: 'course-center',
        target: 'learning-plan',
        relation: '学习路径',
        color: '#0f75bc',
        sourceSide: 'right',
        targetSide: 'left',
      },
      {
        id: 'plan-review',
        source: 'learning-plan',
        target: 'review',
        relation: '回看',
        color: '#f59e0b',
        sourceSide: 'bottom',
        targetSide: 'top',
      },
      {
        id: 'plan-teaching',
        source: 'learning-plan',
        target: 'next-teaching',
        relation: '教学动作',
        color: '#f59e0b',
        sourceSide: 'bottom',
        targetSide: 'top',
      },
    ],
  },
};

function resolveCourseKnowledgeGraphKey(
  course: CourseRecord | null | undefined,
): KnowledgeGraphCourseKey {
  const normalized = [course?.id, course?.courseCode, course?.name]
    .filter(Boolean)
    .join(' ')
    .toUpperCase()
    .replace(/[\s_-]+/g, '');

  if (normalized.includes('CMPNUEG4P001D8O017JEE1MJQ') || normalized.includes('CSC108')) {
    return 'CSC108';
  }
  if (normalized.includes('CMPC9DQGV000P8OGMRSJL5CO8') || normalized.includes('CPSC107')) {
    return 'CPSC107';
  }
  if (
    normalized.includes('CMQJFARZ800158OI68S595Q9N') ||
    normalized.includes('CMNDGVCC10001L404OE8AYMJC') ||
    normalized.includes('CSC148')
  ) {
    return 'CSC148';
  }
  if (normalized.includes('CMPD5BIRD007V8OGMJUUIIO03') || normalized.includes('MAT102')) {
    return 'MAT102';
  }
  if (normalized.includes('CMPANEMIA001V8OUZMHTTVKRN') || normalized.includes('MAT136')) {
    return 'MAT136';
  }
  return 'GENERIC';
}

function countMemoryItemsByKeywords(memories: LibraryMemoryItem[], keywords: string[]): number {
  const normalizedKeywords = keywords.map((keyword) => keyword.toLowerCase());
  if (normalizedKeywords.length === 0) return memories.length;
  return memories.filter((memory) => {
    const haystack = [
      memory.title,
      memory.text,
      memory.layerLabel,
      memory.scopeLabel,
      memory.sourceLabel,
      memory.kindLabel,
      memory.notebookName,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return normalizedKeywords.some((keyword) => haystack.includes(keyword));
  }).length;
}

function countTopicRowsByKeywords(
  topicRows: Array<{ title: string; total: number }>,
  keywords: string[],
): number {
  const normalizedKeywords = keywords.map((keyword) => keyword.toLowerCase());
  if (normalizedKeywords.length === 0) {
    return topicRows.reduce((sum, topic) => sum + topic.total, 0);
  }
  return topicRows
    .filter((topic) =>
      normalizedKeywords.some((keyword) => topic.title.toLowerCase().includes(keyword)),
    )
    .reduce((sum, topic) => sum + topic.total, 0);
}

function countNotebooksByKeywords(notebooks: StageListItem[], keywords: string[]): number {
  const normalizedKeywords = keywords.map((keyword) => keyword.toLowerCase());
  if (normalizedKeywords.length === 0) return notebooks.length;
  return notebooks.filter((notebook) => {
    const haystack = [notebook.name, notebook.description, ...(notebook.tags ?? [])]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return normalizedKeywords.some((keyword) => haystack.includes(keyword));
  }).length;
}

function knowledgeGraphMetricLabel(
  node: KnowledgeGraphTemplateNode,
  args: KnowledgeGraphBuildArgs,
): string | undefined {
  if (!node.metricSource) return undefined;
  const keywords = node.metricKeywords ?? [];
  if (node.metricSource === 'problems') {
    const count = countProblemsByKeywords(args.problemItems, keywords);
    return count > 0 ? `${count}题` : undefined;
  }
  if (node.metricSource === 'memories') {
    const count = countMemoryItemsByKeywords(args.memoryItems, keywords);
    return count > 0 ? `${count}记忆` : undefined;
  }
  if (node.metricSource === 'topics') {
    const count = countTopicRowsByKeywords(args.topicRows, keywords);
    return count > 0 ? `${count}题` : undefined;
  }
  const count = countNotebooksByKeywords(args.notebooks, keywords);
  return count > 0 ? `${count}本` : undefined;
}

function buildCourseKnowledgeGraph(args: KnowledgeGraphBuildArgs): {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
} {
  const templateKey = args.courseGraphKey === 'CSC108' ? 'GENERIC' : args.courseGraphKey;
  const template = COURSE_KNOWLEDGE_GRAPH_TEMPLATES[templateKey];
  const centerLabel =
    [args.course?.courseCode, '知识图谱'].filter(Boolean).join('\n') || '课程\n知识图谱';
  const courseName = args.course?.name ?? '当前课程';
  const centerMetricLabel =
    args.problemTotal > 0
      ? `${args.problemTotal}题`
      : args.notebooks.length > 0
        ? `${args.notebooks.length}本`
        : undefined;

  const nodes = [
    knowledgeNode(
      'course-center',
      centerLabel,
      'center',
      620,
      315,
      126,
      template.centerDetail(courseName),
      centerMetricLabel,
    ),
    ...template.nodes.map((node) =>
      knowledgeNode(
        node.id,
        node.title,
        node.kind,
        node.x,
        node.y,
        node.diameter,
        node.detail,
        knowledgeGraphMetricLabel(node, args),
      ),
    ),
  ];

  const edges = template.edges.map((edge) =>
    knowledgeEdge(
      edge.id,
      edge.source,
      edge.target,
      edge.relation,
      edge.color,
      edge.sourceSide,
      edge.targetSide,
    ),
  );

  return { nodes, edges };
}

function LibraryChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center rounded-full border border-slate-200/85 bg-white/75 px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-300',
        className,
      )}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}

function memoryScopeChipClassName(scopeLabel: string): string {
  if (scopeLabel === '私有') {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-300/20 dark:bg-amber-500/10 dark:text-amber-100';
  }
  return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-300/20 dark:bg-blue-500/10 dark:text-blue-100';
}

function memoryLayerChipClassName(layer: LibraryMemoryItem['layer']): string {
  if (layer === 'course') {
    return 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-300/20 dark:bg-indigo-500/10 dark:text-indigo-100';
  }
  if (layer === 'notebook') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-300/20 dark:bg-emerald-500/10 dark:text-emerald-100';
  }
  return 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-300/20 dark:bg-orange-500/10 dark:text-orange-100';
}

function memoryKindChipClassName(kindLabel?: string): string {
  if (kindLabel === '弱点') {
    return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-300/20 dark:bg-rose-500/10 dark:text-rose-100';
  }
  if (kindLabel?.includes('控制') || kindLabel?.includes('teaching')) {
    return 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-300/20 dark:bg-violet-500/10 dark:text-violet-100';
  }
  return 'border-slate-200 bg-white/75 text-slate-500 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-300';
}

type ResourceListDetailItem = {
  id: string;
  title: string;
};

function ResourceListDetailLayout<TItem extends ResourceListDetailItem>({
  detailClassName,
  emptyStateClassName,
  emptyMessage,
  eyebrow,
  headerActions,
  hideHeader = false,
  items,
  listClassName,
  maxVisibleItems,
  onSelectItem,
  renderDetail,
  renderItemMeta,
  selectedItemId,
  showEmptyState = true,
  title,
  toolbar,
}: {
  detailClassName?: string;
  emptyStateClassName?: string;
  emptyMessage: ReactNode;
  eyebrow: string;
  headerActions?: ReactNode;
  hideHeader?: boolean;
  items: TItem[];
  listClassName?: string;
  maxVisibleItems?: number;
  onSelectItem: (itemId: string) => void;
  renderDetail: (item: TItem | null) => ReactNode;
  renderItemMeta?: (item: TItem) => ReactNode;
  selectedItemId?: string | null;
  showEmptyState?: boolean;
  title: string;
  toolbar?: ReactNode;
}) {
  const [listPage, setListPage] = useState(1);
  const pageSize = maxVisibleItems || items.length || 1;
  const pageCount = maxVisibleItems ? Math.max(1, Math.ceil(items.length / pageSize)) : 1;
  const currentPage = Math.min(listPage, pageCount);
  const pageStartIndex = maxVisibleItems ? (currentPage - 1) * pageSize : 0;
  const pageEndIndex = maxVisibleItems
    ? Math.min(items.length, pageStartIndex + pageSize)
    : items.length;
  const visibleItems = items.slice(pageStartIndex, pageEndIndex);
  const selectedItem =
    visibleItems.find((item) => item.id === selectedItemId) || visibleItems[0] || null;

  const goToListPage = (nextPage: number) => {
    const safePage = Math.min(pageCount, Math.max(1, nextPage));
    const nextStartIndex = maxVisibleItems ? (safePage - 1) * pageSize : 0;
    const nextItem = items[nextStartIndex];
    setListPage(safePage);
    if (nextItem) onSelectItem(nextItem.id);
  };

  return (
    <section className="min-w-0 overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/90 shadow-[0_18px_58px_rgba(15,23,42,0.07)] dark:border-white/10 dark:bg-white/[0.06]">
      {!hideHeader ? (
        <div className="flex min-w-0 flex-col gap-3 border-b border-slate-200/80 px-4 py-4 dark:border-white/10 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-normal text-blue-700 dark:text-blue-200">
              {eyebrow}
            </p>
            <h2 className="mt-1 text-base font-semibold text-slate-950 dark:text-white">{title}</h2>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">{headerActions}</div>
        </div>
      ) : null}

      {toolbar ? (
        <div className="border-b border-slate-200/80 p-3 dark:border-white/10 md:p-4">
          {toolbar}
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="grid min-h-0 items-stretch gap-3 p-3 xl:grid-cols-[minmax(15rem,0.5fr)_minmax(0,1.5fr)]">
          <div className={cn('min-h-[22rem] min-w-0 rounded-2xl p-2', listClassName)}>
            <div className="grid gap-2">
              {visibleItems.map((item) => {
                const active = item.id === selectedItem?.id;

                return (
                  <article
                    key={item.id}
                    className={cn(
                      'rounded-xl border bg-white/82 p-2.5 shadow-sm transition-colors dark:bg-white/[0.045]',
                      active
                        ? 'border-blue-300 bg-blue-50/70 ring-1 ring-blue-200/80 dark:border-blue-300/30 dark:bg-blue-500/12 dark:ring-blue-300/15'
                        : 'border-slate-200/85 hover:border-blue-200 hover:bg-blue-50/35 dark:border-white/10 dark:hover:border-blue-300/20 dark:hover:bg-blue-500/10',
                    )}
                  >
                    <button
                      type="button"
                      className="block w-full min-w-0 text-left"
                      aria-pressed={active}
                      onClick={() => onSelectItem(item.id)}
                    >
                      <span className="line-clamp-2 block text-sm font-semibold leading-5 text-slate-950 dark:text-white">
                        {item.title}
                      </span>
                      {renderItemMeta ? (
                        <span className="mt-2 flex min-w-0 flex-wrap gap-1">
                          {renderItemMeta(item)}
                        </span>
                      ) : null}
                    </button>
                  </article>
                );
              })}
              {maxVisibleItems && pageCount > 1 ? (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white/72 px-2.5 py-2 text-[11px] font-semibold text-slate-500 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 rounded-lg px-2 text-[11px]"
                    disabled={currentPage <= 1}
                    onClick={() => goToListPage(currentPage - 1)}
                  >
                    <ChevronLeft className="size-3.5" />
                    上一页
                  </Button>
                  <span className="shrink-0 tabular-nums">
                    {pageStartIndex + 1}-{pageEndIndex} / {items.length}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 rounded-lg px-2 text-[11px]"
                    disabled={currentPage >= pageCount}
                    onClick={() => goToListPage(currentPage + 1)}
                  >
                    下一页
                    <ChevronRight className="size-3.5" />
                  </Button>
                </div>
              ) : null}
            </div>
          </div>

          <div className={cn('min-w-0', detailClassName)}>{renderDetail(selectedItem)}</div>
        </div>
      ) : showEmptyState ? (
        <div className="p-3">
          <div
            className={cn(
              'grid min-h-[10rem] place-items-center rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/70 px-4 py-6 text-center text-sm font-medium text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300',
              emptyStateClassName,
            )}
          >
            {emptyMessage}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ResourceFilterButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-9 rounded-xl px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
        active
          ? 'bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950'
          : 'border border-slate-200 bg-white/82 text-slate-600 hover:border-blue-200 hover:text-blue-700 dark:border-white/10 dark:bg-white/[0.055] dark:text-slate-300 dark:hover:bg-white/[0.1]',
      )}
    >
      {children}
    </button>
  );
}

export function CourseResourceLibraryPageClient({
  courseId,
}: CourseResourceLibraryPageClientProps) {
  const router = useRouter();
  const [course, setCourse] = useState<CourseRecord | null | undefined>(undefined);
  const [notebooks, setNotebooks] = useState<StageListItem[]>([]);
  const [problems, setProblems] = useState<NotebookProblemClientRecord[]>([]);
  const [dbCourseMemories, setDbCourseMemories] = useState<StudyMemoryApiRecord[]>([]);
  const [dbNotebookMemories, setDbNotebookMemories] = useState<NotebookMemoryRecordBundle[]>([]);
  const [dbAvailable, setDbAvailable] = useState(false);
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [searchRun, setSearchRun] = useState<CourseResourceSearchRunState>({
    status: 'idle',
    query: '',
  });
  const [filter, setFilter] = useState<ResourceFilter>('memory');
  const [memoryLayerFilter, setMemoryLayerFilter] = useState<MemoryLayerFilter>('private');
  const [selectedSearchItemId, setSelectedSearchItemId] = useState<string | null>(null);
  const [selectedMemoryItemId, setSelectedMemoryItemId] = useState<string | null>(null);
  const [selectedKnowledgeNodeId, setSelectedKnowledgeNodeId] = useState<string | null>(null);
  const [problemPage, setProblemPage] = useState(1);
  const [memoryVersion, setMemoryVersion] = useState(0);
  const searchRequestIdRef = useRef(0);

  useEffect(() => {
    let alive = true;

    async function loadResourceLibrary() {
      const [loadedCourse, loadedNotebooks, loadedProblems, loadedCourseMemories] =
        await Promise.all([
          getCourse(courseId),
          listStagesByCourse(courseId).catch(() => []),
          listCourseProblems(courseId).catch(() => []),
          listStudyMemoryRecords({ targetType: 'course', targetId: courseId })
            .then((memories) => ({ ok: true, memories }))
            .catch(() => ({ ok: false, memories: [] as StudyMemoryApiRecord[] })),
        ]);

      const loadedNotebookMemories =
        loadedCourseMemories.ok && loadedNotebooks.length > 0
          ? await Promise.all(
              loadedNotebooks.map((notebook) =>
                listStudyMemoryRecords({ targetType: 'notebook', targetId: notebook.id })
                  .then((memories) => ({ notebookId: notebook.id, memories }))
                  .catch(() => ({ notebookId: notebook.id, memories: [] })),
              ),
            )
          : [];

      if (!alive) return;
      setCourse(loadedCourse ?? null);
      setNotebooks(loadedNotebooks);
      setProblems(loadedProblems);
      setDbCourseMemories(loadedCourseMemories.memories);
      setDbNotebookMemories(loadedNotebookMemories);
      setDbAvailable(loadedCourseMemories.ok);
    }

    void loadResourceLibrary();
    return () => {
      alive = false;
    };
  }, [courseId]);

  useEffect(() => {
    const handleMemoryUpdated = () => setMemoryVersion((version) => version + 1);
    window.addEventListener(STUDY_MEMORY_UPDATED_EVENT, handleMemoryUpdated);
    return () => window.removeEventListener(STUDY_MEMORY_UPDATED_EVENT, handleMemoryUpdated);
  }, []);

  const notebooksById = useMemo(
    () => new Map(notebooks.map((notebook) => [notebook.id, notebook] as const)),
    [notebooks],
  );
  const localProfiles = useMemo(() => {
    void memoryVersion;
    const userId = getLocalStudyMemoryUserId();
    return notebooks.map((notebook) => ({
      notebook,
      profile: loadStudyMemory(userId, notebook.id),
    }));
  }, [memoryVersion, notebooks]);
  const locale: 'zh-CN' | 'en-US' = course?.language === 'zh-CN' ? 'zh-CN' : 'en-US';
  const problemContentLanguage: ProblemContentLanguage =
    course?.language === 'zh-CN' ? 'zh-CN' : 'en-US';

  const memoryItems = useMemo<LibraryMemoryItem[]>(() => {
    const dbCoursePublic = dbCourseMemories
      .filter((memory) => memory.scope === 'public' && isActive(memory))
      .map(coursePublicMemory);
    const dbCoursePrivate = dbCourseMemories
      .filter((memory) => memory.scope === 'private' && isActive(memory))
      .map(coursePrivateMemory);
    const dbNotebookPublic = dbNotebookMemories.flatMap(({ notebookId, memories }) => {
      const notebook = notebooksById.get(notebookId);
      if (!notebook) return [];
      return memories
        .filter((memory) => memory.scope === 'public' && isActive(memory))
        .map((memory) => notebookApiPublicMemory(notebook, memory));
    });
    const dbNotebookPrivate = dbNotebookMemories.flatMap(({ notebookId, memories }) => {
      const notebook = notebooksById.get(notebookId);
      if (!notebook) return [];
      return memories
        .filter((memory) => memory.scope === 'private' && isActive(memory))
        .map((memory) => notebookApiPrivateMemory(notebook, memory));
    });
    const localNotebookPublic = localProfiles.flatMap(({ notebook, profile }) =>
      profile.publicMemories
        .filter(isActive)
        .map((memory) => notebookPublicMemory(notebook, memory)),
    );
    const localNotebookPrivate = localProfiles.flatMap(({ notebook, profile }) => [
      ...profile.privateMemories
        .filter(isActive)
        .map((memory) => notebookPrivateMemory(notebook, memory)),
      ...profile.weakPoints
        .filter((point) => point.status === 'open')
        .map((point) => weakPointMemory(notebook, point)),
    ]);
    const fallbackCoursePublic =
      course && dbCoursePublic.length === 0
        ? getDefaultCoursePublicMemories(course).map(defaultCoursePublicMemory)
        : [];

    return [
      ...dbCoursePublic,
      ...fallbackCoursePublic,
      ...dbNotebookPublic,
      ...localNotebookPublic,
      ...dbCoursePrivate,
      ...dbNotebookPrivate,
      ...localNotebookPrivate,
    ].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }, [course, dbCourseMemories, dbNotebookMemories, localProfiles, notebooksById]);

  const problemItems = useMemo<LibraryProblemItem[]>(
    () =>
      problems
        .filter((problem) => problem.status !== 'archived')
        .map((problem) => ({ ...problem, practiceState: practiceState(problem) })),
    [problems],
  );

  const searchMemoryResults = useMemo<LibraryMemoryItem[]>(() => {
    if (searchRun.status !== 'success') return [];
    if (filter === 'problem') return [];

    const seen = new Set<string>();
    return searchRun.data.semanticMatches
      .filter((memory) => {
        if (seen.has(memory.id)) return false;
        seen.add(memory.id);
        return true;
      })
      .map((memory) => searchMemoryToLibraryMemory(memory, notebooksById))
      .filter((memory) => filter !== 'private' || memory.layer === 'private');
  }, [filter, notebooksById, searchRun]);

  const problemById = useMemo(
    () => new Map(problemItems.map((problem) => [problem.id, problem] as const)),
    [problemItems],
  );

  const searchProblemResults = useMemo<LibraryProblemItem[]>(() => {
    if (searchRun.status !== 'success') return [];
    if (filter === 'memory' || filter === 'private') return [];

    const seen = new Set<string>();
    return searchRun.data.knowledgeMatches
      .map((match) => problemById.get(match.id))
      .filter((problem): problem is LibraryProblemItem => {
        if (!problem || seen.has(problem.id)) return false;
        seen.add(problem.id);
        return true;
      });
  }, [filter, problemById, searchRun]);

  const searchItems = useMemo<SearchResourceItem[]>(
    () =>
      [
        ...searchMemoryResults.map(
          (memory): SearchResourceItem => ({
            id: `memory:${memory.id}`,
            title: memory.title,
            kind: 'memory',
            updatedAt: memory.updatedAt,
            memory,
          }),
        ),
        ...searchProblemResults.map((problem): SearchResourceItem => {
          const localizedTitle = getLocalizedProblemTitle(problem, problemContentLanguage);
          return {
            id: `problem:${problem.id}`,
            title: localizedTitle,
            kind: 'problem',
            updatedAt: problem.updatedAt,
            problem,
          };
        }),
      ].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || a.title.localeCompare(b.title)),
    [problemContentLanguage, searchMemoryResults, searchProblemResults],
  );

  const memoryStats = useMemo(() => {
    const courseCount = memoryItems.filter((memory) => memory.layer === 'course').length;
    const notebookCount = memoryItems.filter((memory) => memory.layer === 'notebook').length;
    const privateCount = memoryItems.filter((memory) => memory.layer === 'private').length;
    return { courseCount, notebookCount, privateCount };
  }, [memoryItems]);

  const filteredLayerMemoryItems = useMemo(
    () =>
      memoryLayerFilter === 'all'
        ? memoryItems
        : memoryItems.filter((memory) => memory.layer === memoryLayerFilter),
    [memoryItems, memoryLayerFilter],
  );

  const problemStats = useMemo(() => {
    const counts = problemItems.reduce(
      (acc, problem) => {
        acc[problem.practiceState] += 1;
        return acc;
      },
      { mastered: 0, review: 0, wrong: 0, unattempted: 0 } as Record<PracticeState, number>,
    );
    const attempted = problemItems.length - counts.unattempted;
    const mastery =
      problemItems.length > 0 ? Math.round((counts.mastered / problemItems.length) * 100) : 0;
    return { ...counts, attempted, mastery, total: problemItems.length };
  }, [problemItems]);

  const bankStats = useMemo(() => {
    const allTopics = new Set<string>();
    const masteredTopics = new Set<string>();

    for (const problem of problemItems) {
      for (const topic of problemTopics(problem)) {
        if (topic === '未标注') continue;
        allTopics.add(topic);
        if (problem.practiceState === 'mastered') masteredTopics.add(topic);
      }
    }

    const coveredNotebookCount = new Set(
      problemItems.map((problem) => problem.notebookId).filter(Boolean),
    ).size;

    return {
      total: problemStats.total,
      attempted: problemStats.attempted,
      mastered: problemStats.mastered,
      review: problemStats.review,
      wrong: problemStats.wrong,
      unattempted: problemStats.unattempted,
      masteryPercent: problemStats.mastery,
      coveredNotebookCount,
      notebookCount: notebooks.length,
      masteredTopicCount: masteredTopics.size,
      topicCount: allTopics.size,
    };
  }, [notebooks.length, problemItems, problemStats]);

  const topicRows = useMemo(() => {
    const topicMap = new Map<
      string,
      {
        title: string;
        total: number;
        mastered: number;
        review: number;
        wrong: number;
        unattempted: number;
      }
    >();
    for (const problem of problemItems) {
      const tags = problem.tags.length > 0 ? problem.tags : ['未标注'];
      for (const tag of tags) {
        const title = tag.trim() || '未标注';
        const current = topicMap.get(title) ?? {
          title,
          total: 0,
          mastered: 0,
          review: 0,
          wrong: 0,
          unattempted: 0,
        };
        current.total += 1;
        if (problem.practiceState === 'mastered') current.mastered += 1;
        if (problem.practiceState === 'review') current.review += 1;
        if (problem.practiceState === 'wrong') current.wrong += 1;
        if (problem.practiceState === 'unattempted') current.unattempted += 1;
        topicMap.set(title, current);
      }
    }
    return Array.from(topicMap.values()).sort(
      (a, b) =>
        b.wrong + b.review - (a.wrong + a.review) ||
        b.total - a.total ||
        a.title.localeCompare(b.title),
    );
  }, [problemItems]);

  const knowledgeGraph = useMemo(() => {
    const courseGraphKey = resolveCourseKnowledgeGraphKey(course);
    if (courseGraphKey !== 'CSC108') {
      return buildCourseKnowledgeGraph({
        course,
        courseGraphKey,
        problemItems,
        problemTotal: problemStats.total,
        memoryItems,
        topicRows,
        notebooks,
      });
    }

    const centerLabel =
      [course?.courseCode, '知识图谱'].filter(Boolean).join('\n') || '课程\n知识图谱';
    const foundationCount = countProblemsByKeywords(problemItems, [
      'basic',
      'string',
      'operator',
      'slice',
      'calculate',
      'is_even',
    ]);
    const controlCount = countProblemsByKeywords(problemItems, [
      'function',
      'control',
      'conditional',
      'boolean',
      'docstring',
      'return',
    ]);
    const loopCount = countProblemsByKeywords(problemItems, [
      'loop',
      'range',
      'for',
      'while',
      'accumulator',
    ]);
    const listCount = countProblemsByKeywords(problemItems, [
      'list',
      'nested',
      'alias',
      'mutation',
      'append',
    ]);
    const dataCount = countProblemsByKeywords(problemItems, [
      'dictionary',
      'dict',
      'csv',
      'file',
      'textio',
      'reader',
    ]);
    const runtimeCount = countProblemsByKeywords(problemItems, [
      'running',
      'runtime',
      'search',
      'sort',
      'big-o',
      'complexity',
    ]);
    const regexCount = countProblemsByKeywords(problemItems, ['regex', 'dfa', 'regular']);
    const oopCount = countProblemsByKeywords(problemItems, [
      'oop',
      'class',
      'self',
      'object',
      'attribute',
    ]);

    const nodes = [
      knowledgeNode(
        'course-center',
        centerLabel,
        'center',
        620,
        315,
        126,
        `${course?.name ?? '当前课程'} 的知识总入口。图谱把课程记忆、笔记本章节和题库标签压成可扫视的概念网络。`,
        `${problemStats.total}题`,
      ),

      knowledgeNode(
        'python-foundation',
        'Python\n基础',
        'practice',
        235,
        405,
        88,
        '表达式、变量、类型、字符串和切片。它决定学生能不能准确追踪一行 Python 代码的值和类型。',
        foundationCount > 0 ? `${foundationCount}题` : undefined,
      ),
      knowledgeNode(
        'expression',
        '表达式',
        'risk',
        92,
        320,
        66,
        '算术、比较、优先级、整数除法和取模。常见错误是把 / 当成整数除法。',
      ),
      knowledgeNode(
        'variables',
        '变量\n绑定',
        'risk',
        84,
        438,
        66,
        '赋值是名字绑定，不是数学等式。追踪题要按执行顺序维护变量表。',
      ),
      knowledgeNode(
        'strings',
        '字符串',
        'risk',
        205,
        530,
        72,
        '字符串索引、切片、不可变性和常用方法。方法返回新字符串，不会原地修改。',
      ),
      knowledgeNode(
        'types',
        '类型',
        'risk',
        245,
        275,
        64,
        'int、float、str、bool 及转换。input 读到的永远先是 str。',
      ),

      knowledgeNode(
        'function-control',
        '函数与\n控制',
        'hub',
        395,
        205,
        94,
        '函数设计、return/print、docstring、if/elif/else 和布尔表达式，是后续所有代码题的提交格式底座。',
        controlCount > 0 ? `${controlCount}题` : undefined,
      ),
      knowledgeNode(
        'docstring',
        'docstring',
        'data',
        250,
        78,
        76,
        '题目要求的函数说明和 doctest 示例。CSC108 代码题要保留 header、annotation 和参数名。',
      ),
      knowledgeNode(
        'return-print',
        'return',
        'data',
        565,
        82,
        78,
        'return 是函数结果，print 是屏幕输出。漏 return 会得到 None。',
      ),
      knowledgeNode(
        'boolean',
        'Boolean',
        'data',
        515,
        205,
        74,
        'and/or/not 与 short-circuit。条件判断题要说明每个 branch 是否会执行。',
      ),

      knowledgeNode(
        'loop-list',
        '循环\n列表',
        'risk',
        405,
        355,
        88,
        'for、while、range、accumulator、list processing、mutation 和 aliasing，是中期题最密集的薄弱区。',
        loopCount + listCount > 0 ? `${loopCount + listCount}题` : undefined,
      ),
      knowledgeNode(
        'range',
        'range',
        'concept',
        305,
        585,
        64,
        'stop 不包含，step 可为负。循环边界最容易少 1 或多 1。',
      ),
      knowledgeNode(
        'accumulator',
        'accumulator',
        'concept',
        530,
        515,
        78,
        '先定义累计变量含义，再选初始值和更新规则。过早 return 是常见错误。',
      ),
      knowledgeNode(
        'mutation',
        'mutation',
        'concept',
        558,
        388,
        74,
        'append、sort、reverse 等方法原地修改 list，很多返回 None。',
      ),
      knowledgeNode(
        'aliasing',
        'aliasing',
        'concept',
        322,
        458,
        72,
        '两个变量可能指向同一个 list object。复制和 alias 必须分清。',
      ),

      knowledgeNode(
        'data-io',
        '文件与\n数据结构',
        'concept',
        780,
        242,
        96,
        'File IO、TextIO、CSV 和 Dictionary，把字符串/列表处理提升到真实数据处理。',
        dataCount > 0 ? `${dataCount}题` : undefined,
      ),
      knowledgeNode(
        'dictionary',
        'Dictionary',
        'data',
        680,
        155,
        78,
        'lookup、membership、counting 和 grouping。x in d 检查 key，不检查 value。',
      ),
      knowledgeNode(
        'file-io',
        'File IO',
        'practice',
        922,
        342,
        78,
        'open/read/readline/readlines/write/writelines/with。文件指针会随读取前进。',
      ),
      knowledgeNode(
        'csv',
        'CSV',
        'data',
        990,
        210,
        70,
        'csv.reader 的 row 是 list[str]，数字字段要显式 int/float 转换。',
      ),
      knowledgeNode(
        'textio',
        'TextIO',
        'data',
        1090,
        315,
        70,
        '函数消费打开的文件对象。调用者负责 open/close，函数按文件对象逐行处理。',
      ),

      knowledgeNode(
        'runtime-regex',
        '搜索\n复杂度',
        'hub',
        780,
        460,
        96,
        'Regex/DFA、linear/binary search、sorting 与 Big-O，把代码执行追踪变成算法成本判断。',
        runtimeCount + regexCount > 0 ? `${runtimeCount + regexCount}题` : undefined,
      ),
      knowledgeNode(
        'regex',
        'Regex\nDFA',
        'data',
        665,
        560,
        76,
        'pattern 语义、re.search/match/fullmatch/findall、DFA 状态转移追踪。',
      ),
      knowledgeNode(
        'bigo',
        'Big-O',
        'practice',
        910,
        585,
        78,
        '找主导循环或算法步骤，丢掉常数和低阶项。',
      ),
      knowledgeNode(
        'search-sort',
        'Search\nSort',
        'practice',
        1040,
        490,
        82,
        'linear search、binary search、selection/insertion/merge sort。binary search 必须先 sorted。',
      ),

      knowledgeNode(
        'oop',
        'Class\nOOP',
        'concept',
        1002,
        410,
        84,
        'class、self、attributes、methods、encapsulation 和 object aliasing。',
        oopCount > 0 ? `${oopCount}题` : undefined,
      ),
      knowledgeNode(
        'self',
        'self',
        'practice',
        1120,
        560,
        62,
        'method call 会把当前 object 绑定给 self。忘 self 是 class 题高频错误。',
      ),
      knowledgeNode(
        'attributes',
        'attributes',
        'practice',
        1110,
        438,
        78,
        '在 __init__ 中写 self.attribute，追踪 object state 时看 instance attributes。',
      ),
    ];

    const edges: KnowledgeGraphEdge[] = [
      knowledgeEdge(
        'course-basic',
        'course-center',
        'python-foundation',
        '基础语义',
        '#94a3b8',
        'left',
        'right',
      ),
      knowledgeEdge(
        'basic-expression',
        'python-foundation',
        'expression',
        '运算',
        '#94a3b8',
        'left',
        'right',
      ),
      knowledgeEdge(
        'basic-variables',
        'python-foundation',
        'variables',
        '绑定',
        '#94a3b8',
        'left',
        'right',
      ),
      knowledgeEdge(
        'basic-strings',
        'python-foundation',
        'strings',
        '文本',
        '#94a3b8',
        'bottom',
        'top',
      ),
      knowledgeEdge(
        'basic-types',
        'python-foundation',
        'types',
        '类型',
        '#94a3b8',
        'top',
        'bottom',
      ),

      knowledgeEdge(
        'course-control',
        'course-center',
        'function-control',
        '函数设计',
        '#0f75bc',
        'left',
        'right',
      ),
      knowledgeEdge(
        'control-docstring',
        'function-control',
        'docstring',
        '契约',
        '#0f75bc',
        'top',
        'bottom',
      ),
      knowledgeEdge(
        'control-return',
        'function-control',
        'return-print',
        '结果',
        '#0f75bc',
        'top',
        'bottom',
      ),
      knowledgeEdge(
        'control-boolean',
        'function-control',
        'boolean',
        '条件',
        '#0f75bc',
        'right',
        'left',
      ),

      knowledgeEdge(
        'course-loop',
        'course-center',
        'loop-list',
        '状态变化',
        '#ef4444',
        'left',
        'right',
      ),
      knowledgeEdge('loop-range', 'loop-list', 'range', '次数', '#14b8a6', 'bottom', 'top'),
      knowledgeEdge('loop-acc', 'loop-list', 'accumulator', '累计', '#14b8a6', 'right', 'left'),
      knowledgeEdge('loop-mutation', 'loop-list', 'mutation', '原地改', '#14b8a6', 'right', 'left'),
      knowledgeEdge('loop-alias', 'loop-list', 'aliasing', '共享对象', '#14b8a6', 'left', 'right'),

      knowledgeEdge(
        'course-data',
        'course-center',
        'data-io',
        '真实数据',
        '#14b8a6',
        'right',
        'left',
      ),
      knowledgeEdge('data-dict', 'data-io', 'dictionary', '映射', '#38bdf8', 'left', 'right'),
      knowledgeEdge('data-file', 'data-io', 'file-io', '读取/写入', '#f59e0b', 'right', 'left'),
      knowledgeEdge('data-csv', 'data-io', 'csv', '表格行', '#38bdf8', 'right', 'left'),
      knowledgeEdge('file-textio', 'file-io', 'textio', '对象接口', '#38bdf8', 'right', 'left'),

      knowledgeEdge(
        'course-runtime',
        'course-center',
        'runtime-regex',
        '算法意识',
        '#0f75bc',
        'right',
        'left',
      ),
      knowledgeEdge(
        'runtime-regex-edge',
        'runtime-regex',
        'regex',
        '模式',
        '#38bdf8',
        'left',
        'right',
      ),
      knowledgeEdge('runtime-bigo', 'runtime-regex', 'bigo', '成本', '#f59e0b', 'bottom', 'top'),
      knowledgeEdge(
        'runtime-search',
        'runtime-regex',
        'search-sort',
        '搜索排序',
        '#f59e0b',
        'right',
        'left',
      ),

      knowledgeEdge('course-oop', 'course-center', 'oop', '对象模型', '#14b8a6', 'right', 'left'),
      knowledgeEdge('oop-self', 'oop', 'self', '绑定', '#f59e0b', 'bottom', 'top'),
      knowledgeEdge('oop-attributes', 'oop', 'attributes', '状态', '#f59e0b', 'right', 'left'),
    ];

    return { nodes, edges };
  }, [course, memoryItems, notebooks, problemItems, problemStats.total, topicRows]);

  const notebookRows = useMemo<NotebookResourceRow[]>(() => {
    const problemCountByNotebook = new Map<string, number>();
    for (const problem of problemItems) {
      if (!problem.notebookId) continue;
      problemCountByNotebook.set(
        problem.notebookId,
        (problemCountByNotebook.get(problem.notebookId) ?? 0) + 1,
      );
    }
    return notebooks
      .map((notebook) => {
        const related = memoryItems.filter((memory) => memory.notebookId === notebook.id);
        const publicCount = related.filter((memory) => memory.scopeLabel === '共有').length;
        const privateCount = related.filter((memory) => memory.scopeLabel === '私有').length;
        const weakCount = related.filter((memory) => memory.kindLabel === '弱点').length;
        const latestMemory = related[0];
        return {
          notebook,
          publicCount,
          privateCount,
          weakCount,
          problemCount: problemCountByNotebook.get(notebook.id) ?? 0,
          latestMemoryTitle: latestMemory?.title,
          updatedAt: Math.max(notebook.updatedAt || 0, latestMemory?.updatedAt || 0),
        };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt || a.notebook.name.localeCompare(b.notebook.name));
  }, [memoryItems, notebooks, problemItems]);

  const resultCount = searchItems.length;
  const hasSubmittedSearch = submittedQuery.trim().length > 0;
  const isSearchLoading = searchRun.status === 'loading';

  const submitSearch = useCallback(async () => {
    const nextQuery = query.trim();
    if (!nextQuery) {
      searchRequestIdRef.current += 1;
      setSubmittedQuery('');
      setSearchRun({ status: 'idle', query: '' });
      setSelectedSearchItemId(null);
      return;
    }

    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;
    setQuery(nextQuery);
    setSubmittedQuery(nextQuery);
    setSelectedSearchItemId(null);
    setSearchRun((current) => ({
      status: 'loading',
      query: nextQuery,
      data: current.query === nextQuery ? current.data : undefined,
    }));

    try {
      const data = await backendJson<CourseResourceSearchResponse>('/api/memory/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: 'course',
          targetId: courseId,
          query: nextQuery,
        }),
      });
      if (searchRequestIdRef.current !== requestId) return;
      setSearchRun({ status: 'success', query: nextQuery, data });
    } catch (error) {
      if (searchRequestIdRef.current !== requestId) return;
      setSearchRun({
        status: 'error',
        query: nextQuery,
        error: error instanceof Error ? error.message : '搜索失败，请稍后再试。',
      });
    }
  }, [courseId, query]);

  const renderMemoryLayerFilter = () => {
    const layers: Array<{
      value: MemoryLayerFilter;
      label: string;
      count: number;
    }> = [
      {
        value: 'all',
        label: '全部',
        count: memoryItems.length,
      },
      {
        value: 'course',
        label: '课程控制层',
        count: memoryStats.courseCount,
      },
      {
        value: 'notebook',
        label: '笔记本知识层',
        count: memoryStats.notebookCount,
      },
      {
        value: 'private',
        label: '个人学习层',
        count: memoryStats.privateCount,
      },
    ];

    return (
      <div className="flex min-w-0 flex-wrap gap-1 rounded-2xl border border-slate-200/80 bg-slate-100/80 p-1 dark:border-white/10 dark:bg-white/[0.06]">
        {layers.map((layer) => (
          <button
            key={layer.value}
            type="button"
            onClick={() => {
              setMemoryLayerFilter(layer.value);
              setSelectedMemoryItemId(null);
            }}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
              memoryLayerFilter === layer.value
                ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-950 dark:text-white'
                : 'text-slate-500 hover:bg-white/75 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white',
            )}
          >
            <span>{layer.label}</span>
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-white/10 dark:text-slate-300">
              {layer.count}
            </span>
          </button>
        ))}
      </div>
    );
  };

  const renderMemoryPreview = (memory: LibraryMemoryItem | null) => {
    if (!memory) {
      return (
        <div className="flex h-full min-h-[22rem] items-center justify-center rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/70 px-4 py-6 text-sm font-medium text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
          请选择左侧的一条记忆。
        </div>
      );
    }

    return (
      <article className="flex h-full min-h-[22rem] flex-col rounded-2xl border border-slate-200/80 bg-white/82 p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.045]">
        <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-normal text-blue-700 dark:text-blue-200">
              Memory Preview
            </p>
            <h3 className="mt-2 text-xl font-semibold leading-7 text-slate-950 dark:text-white">
              {memory.title}
            </h3>
          </div>
          <span className="shrink-0 text-xs font-semibold text-slate-400">
            {formatDate(memory.updatedAt)}
          </span>
        </div>
        <div className="mt-3 flex min-w-0 flex-wrap gap-1.5">
          <LibraryChip className={memoryScopeChipClassName(memory.scopeLabel)}>
            {memory.scopeLabel}
          </LibraryChip>
          <LibraryChip className={memoryLayerChipClassName(memory.layer)}>
            {memory.layerLabel}
          </LibraryChip>
          <LibraryChip>{memory.sourceLabel}</LibraryChip>
          {memory.kindLabel ? (
            <LibraryChip className={memoryKindChipClassName(memory.kindLabel)}>
              {memory.kindLabel}
            </LibraryChip>
          ) : null}
          {memory.notebookName ? <LibraryChip>{memory.notebookName}</LibraryChip> : null}
        </div>
        <div className="mt-5 min-h-0 flex-1 rounded-2xl border border-slate-200/80 bg-slate-50/72 p-5 text-slate-700 dark:border-white/10 dark:bg-black/15 dark:text-slate-200">
          <ProblemRichText
            content={memory.text}
            className="text-[15px] leading-8 [&_h1]:mb-3 [&_h1]:mt-6 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-normal [&_h1]:text-slate-950 [&_h2]:mb-2.5 [&_h2]:mt-5 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-normal [&_h2]:text-slate-950 [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:tracking-normal [&_h3]:text-slate-950 [&_p]:my-2 dark:[&_h1]:text-white dark:[&_h2]:text-white dark:[&_h3]:text-white"
          />
        </div>
      </article>
    );
  };

  const renderProblemPreview = (problem: LibraryProblemItem | null) => {
    if (!problem) {
      return (
        <div className="flex h-full min-h-[22rem] items-center justify-center rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/70 px-4 py-6 text-sm font-medium text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
          请选择左侧的一道题。
        </div>
      );
    }

    const localizedContent = getLocalizedProblemContent(
      problem.publicContent,
      problemContentLanguage,
    );
    const localizedTitle = getLocalizedProblemTitle(problem, problemContentLanguage);
    const typeVisual = problemTypeVisual(problem.type);
    const ProblemTypeIcon = typeVisual.Icon;
    const problemHref = `/course/${encodeURIComponent(courseId)}/problem-bank/${encodeURIComponent(
      problem.id,
    )}`;

    return (
      <article className="h-full min-h-[22rem] rounded-2xl border border-slate-200/80 bg-white/82 p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.045]">
        <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-normal text-emerald-700 dark:text-emerald-200">
              Problem Preview
            </p>
            <ProblemTitleText
              content={localizedTitle}
              className="mt-2 block text-xl font-semibold leading-7 text-slate-950 dark:text-white"
            />
          </div>
          <Button
            asChild
            size="sm"
            className={cn('h-9 rounded-xl', PROBLEM_BANK_PRIMARY_BUTTON_CLASS)}
          >
            <Link href={problemHref}>{locale === 'zh-CN' ? '练习' : 'Practice'}</Link>
          </Button>
        </div>
        <div className="mt-3 flex min-w-0 flex-wrap gap-1.5">
          <LibraryChip>{formatProblemNumber(problem)}</LibraryChip>
          <LibraryChip className={problemListPracticeStateClassName(problem)}>
            {problemListPracticeStateLabel(problem, locale)}
          </LibraryChip>
          <LibraryChip className={typeVisual.className}>
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <ProblemTypeIcon className="size-3.5 shrink-0" />
              <span className="truncate">{typeLabel(problem.type, locale)}</span>
            </span>
          </LibraryChip>
          <LibraryChip>{difficultyLabel(problem.difficulty, locale)}</LibraryChip>
          <LibraryChip>{latestScoreLabel(problem, locale)}</LibraryChip>
          {problem.notebookName ? <LibraryChip>{problem.notebookName}</LibraryChip> : null}
        </div>
        <div className="mt-5 rounded-2xl border border-slate-200/80 bg-slate-50/72 p-4 text-sm leading-7 text-slate-700 dark:border-white/10 dark:bg-black/15 dark:text-slate-200">
          <ProblemTitleText
            content={renderProblemContentStem(localizedContent)}
            className="font-normal"
            forceInlineMath
          />
        </div>
        {problem.tags.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {problem.tags.slice(0, 8).map((tag) => (
              <LibraryChip key={tag}>{tag}</LibraryChip>
            ))}
          </div>
        ) : null}
      </article>
    );
  };

  const renderSearchPreview = (item: SearchResourceItem | null) => {
    if (!item) {
      return (
        <div className="flex h-full min-h-[22rem] items-center justify-center rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/70 px-4 py-6 text-sm font-medium text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
          没有匹配的资料。
        </div>
      );
    }

    return item.kind === 'memory'
      ? renderMemoryPreview(item.memory)
      : renderProblemPreview(item.problem);
  };

  const renderProblemCards = (items: LibraryProblemItem[], emptyText: string) => {
    if (items.length === 0) {
      return (
        <div className="rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/70 px-4 py-6 text-center text-sm font-medium text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
          {emptyText}
        </div>
      );
    }

    const problemPageCount = Math.max(1, Math.ceil(items.length / PROBLEM_BANK_PAGE_SIZE));
    const currentProblemPage = Math.min(problemPage, problemPageCount);
    const pageStartIndex = (currentProblemPage - 1) * PROBLEM_BANK_PAGE_SIZE;
    const pageEndIndex = Math.min(items.length, pageStartIndex + PROBLEM_BANK_PAGE_SIZE);
    const paginatedProblems = items.slice(pageStartIndex, pageEndIndex);
    const problemHref = (problem: LibraryProblemItem) =>
      `/course/${encodeURIComponent(courseId)}/problem-bank/${encodeURIComponent(problem.id)}`;
    const openProblem = (problem: LibraryProblemItem) => router.push(problemHref(problem));

    return (
      <>
        <div className="space-y-2 lg:hidden">
          {paginatedProblems.map((problem) => {
            const typeVisual = problemTypeVisual(problem.type);
            const ProblemTypeIcon = typeVisual.Icon;
            const localizedContent = getLocalizedProblemContent(
              problem.publicContent,
              problemContentLanguage,
            );
            const localizedTitle = getLocalizedProblemTitle(problem, problemContentLanguage);
            return (
              <div
                key={problem.id}
                role="button"
                tabIndex={0}
                onClick={() => openProblem(problem)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openProblem(problem);
                  }
                }}
                className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:bg-slate-900/60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                        {formatProblemNumber(problem)}
                      </span>
                      <span
                        className={cn(
                          'inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold',
                          problemListPracticeStateClassName(problem),
                        )}
                      >
                        {problemListPracticeStateLabel(problem, locale)}
                      </span>
                      <span
                        className={cn(
                          'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold',
                          typeVisual.className,
                        )}
                      >
                        <ProblemTypeIcon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{typeLabel(problem.type, locale)}</span>
                      </span>
                    </div>
                    <ProblemTitleText
                      content={localizedTitle}
                      className="mt-2 line-clamp-2 font-semibold leading-5 text-slate-950 dark:text-white"
                    />
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      <ProblemTitleText
                        content={renderProblemContentStem(localizedContent)}
                        className="font-normal"
                        forceInlineMath
                      />
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className={cn('h-8 px-2.5 text-xs', PROBLEM_BANK_PRIMARY_BUTTON_CLASS)}
                    onClick={(event) => {
                      event.stopPropagation();
                      openProblem(problem);
                    }}
                  >
                    {locale === 'zh-CN' ? '练习' : 'Practice'}
                  </Button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium text-slate-400">
                      {locale === 'zh-CN' ? '来源' : 'Source'}
                    </div>
                    <div className="truncate font-medium text-slate-700 dark:text-slate-200">
                      {problem.notebookName || (locale === 'zh-CN' ? '未归类' : 'Unassigned')}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-medium text-slate-400">
                      {locale === 'zh-CN' ? '难度 / 得分' : 'Level / Score'}
                    </div>
                    <div className="font-medium text-slate-700 dark:text-slate-200">
                      {difficultyLabel(problem.difficulty, locale)} ·{' '}
                      {latestScoreLabel(problem, locale)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
            <span>
              {locale === 'zh-CN'
                ? `显示 ${pageStartIndex + 1}-${pageEndIndex} / ${items.length} 道`
                : `Showing ${pageStartIndex + 1}-${pageEndIndex} of ${items.length}`}
            </span>
            <div className="flex items-center justify-between gap-2 min-[420px]:justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 px-2 text-xs"
                disabled={currentProblemPage <= 1}
                onClick={() => setProblemPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                {locale === 'zh-CN' ? '上一页' : 'Prev'}
              </Button>
              <span className="min-w-[4rem] text-center font-medium text-slate-600 dark:text-slate-300">
                {currentProblemPage} / {problemPageCount}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 px-2 text-xs"
                disabled={currentProblemPage >= problemPageCount}
                onClick={() => setProblemPage((current) => Math.min(problemPageCount, current + 1))}
              >
                {locale === 'zh-CN' ? '下一页' : 'Next'}
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <div className="min-w-[820px]">
            <div
              className={cn(
                PROBLEM_BANK_LIST_GRID_CLASS,
                'border-b border-slate-200 bg-slate-50/80 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400',
              )}
            >
              <span>{locale === 'zh-CN' ? '题号' : 'No.'}</span>
              <span>{locale === 'zh-CN' ? '状态' : 'State'}</span>
              <span>{locale === 'zh-CN' ? '题目' : 'Problem'}</span>
              <span>{locale === 'zh-CN' ? '来源' : 'Source'}</span>
              <span>{locale === 'zh-CN' ? '题型' : 'Type'}</span>
              <span>{locale === 'zh-CN' ? '难度' : 'Level'}</span>
              <span>{locale === 'zh-CN' ? '最近得分' : 'Score'}</span>
              <span>{locale === 'zh-CN' ? '操作' : 'Action'}</span>
            </div>
            {paginatedProblems.map((problem) => {
              const typeVisual = problemTypeVisual(problem.type);
              const ProblemTypeIcon = typeVisual.Icon;
              const localizedContent = getLocalizedProblemContent(
                problem.publicContent,
                problemContentLanguage,
              );
              const localizedTitle = getLocalizedProblemTitle(problem, problemContentLanguage);
              return (
                <div
                  key={problem.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openProblem(problem)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openProblem(problem);
                    }
                  }}
                  className={cn(
                    PROBLEM_BANK_LIST_GRID_CLASS,
                    'items-center border-b border-slate-100 bg-white px-4 py-3 text-sm transition hover:bg-slate-50/80 dark:border-slate-800/80 dark:bg-slate-950/25 dark:hover:bg-slate-900/50',
                  )}
                >
                  <div>
                    <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      {formatProblemNumber(problem)}
                    </span>
                  </div>
                  <div>
                    <span
                      className={cn(
                        'inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold',
                        problemListPracticeStateClassName(problem),
                      )}
                    >
                      {problemListPracticeStateLabel(problem, locale)}
                    </span>
                  </div>
                  <div className="min-w-0 pr-4">
                    <ProblemTitleText
                      content={localizedTitle}
                      className="line-clamp-1 font-semibold text-slate-950 dark:text-white"
                    />
                    <p className="mt-1 min-w-0 truncate text-xs text-slate-500 dark:text-slate-400">
                      <ProblemTitleText
                        content={renderProblemContentStem(localizedContent)}
                        className="font-normal"
                        forceInlineMath
                      />
                    </p>
                  </div>
                  <div className="min-w-0 pr-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="line-clamp-2">
                      {problem.notebookName || (locale === 'zh-CN' ? '未归类' : 'Unassigned')}
                    </span>
                  </div>
                  <div className="min-w-0 pr-2">
                    <span
                      className={cn(
                        'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold',
                        typeVisual.className,
                      )}
                    >
                      <ProblemTypeIcon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{typeLabel(problem.type, locale)}</span>
                    </span>
                  </div>
                  <div title={difficultyLabel(problem.difficulty, locale)}>
                    <div className="flex items-center gap-1">
                      {difficultyDots(problem).map((active, index) => (
                        <span
                          key={index}
                          className={cn(
                            'size-1.5 rounded-full',
                            difficultyDotClassName(problem.difficulty, active),
                          )}
                        />
                      ))}
                    </div>
                    <div
                      className={cn(
                        'mt-0.5 text-[10px] font-semibold',
                        difficultyTextClassName(problem.difficulty),
                      )}
                    >
                      {difficultyLabel(problem.difficulty, locale)}
                    </div>
                  </div>
                  <div className="text-xs font-medium text-slate-700 dark:text-slate-200">
                    {latestScoreLabel(problem, locale)}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      className={cn('h-8 px-2.5 text-xs', PROBLEM_BANK_PRIMARY_BUTTON_CLASS)}
                      onClick={(event) => {
                        event.stopPropagation();
                        openProblem(problem);
                      }}
                    >
                      {locale === 'zh-CN' ? '练习' : 'Practice'}
                    </Button>
                  </div>
                </div>
              );
            })}
            <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-400">
              <span>
                {locale === 'zh-CN'
                  ? `显示 ${pageStartIndex + 1}-${pageEndIndex} / ${items.length} 道`
                  : `Showing ${pageStartIndex + 1}-${pageEndIndex} of ${items.length}`}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 px-2 text-xs"
                  disabled={currentProblemPage <= 1}
                  onClick={() => setProblemPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  {locale === 'zh-CN' ? '上一页' : 'Prev'}
                </Button>
                <span className="min-w-[5rem] text-center font-medium text-slate-600 dark:text-slate-300">
                  {locale === 'zh-CN'
                    ? `${currentProblemPage} / ${problemPageCount} 页`
                    : `Page ${currentProblemPage} / ${problemPageCount}`}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 px-2 text-xs"
                  disabled={currentProblemPage >= problemPageCount}
                  onClick={() =>
                    setProblemPage((current) => Math.min(problemPageCount, current + 1))
                  }
                >
                  {locale === 'zh-CN' ? '下一页' : 'Next'}
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  };

  const renderProblemProgress = ({ compact = false }: { compact?: boolean } = {}) => (
    <article className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)] dark:border-slate-800 dark:bg-slate-950/60">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {locale === 'zh-CN' ? '掌握概览' : 'Mastery overview'}
          </p>
          <AlertCircle className="h-3.5 w-3.5 text-slate-400" />
        </div>
        <span className="w-fit rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
          {locale === 'zh-CN' ? `${topicRows.length} 个专题` : `${topicRows.length} topics`}
        </span>
      </div>
      <div
        className={cn(
          'mt-4 grid gap-4',
          compact ? 'grid-cols-1' : 'xl:grid-cols-[20rem_minmax(0,1fr)]',
        )}
      >
        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-black/15">
          <div className="flex items-center gap-4">
            <div
              className="grid size-[88px] shrink-0 place-items-center rounded-full"
              style={{
                background: `conic-gradient(#22c55e 0deg ${
                  (bankStats.mastered / Math.max(1, bankStats.total)) * 360
                }deg, #f59e0b ${(bankStats.mastered / Math.max(1, bankStats.total)) * 360}deg ${
                  ((bankStats.mastered + bankStats.review) / Math.max(1, bankStats.total)) * 360
                }deg, #ef4444 ${
                  ((bankStats.mastered + bankStats.review) / Math.max(1, bankStats.total)) * 360
                }deg ${
                  ((bankStats.mastered + bankStats.review + bankStats.wrong) /
                    Math.max(1, bankStats.total)) *
                  360
                }deg, #e2e8f0 ${
                  ((bankStats.mastered + bankStats.review + bankStats.wrong) /
                    Math.max(1, bankStats.total)) *
                  360
                }deg 360deg)`,
              }}
            >
              <div className="grid size-[62px] place-items-center rounded-full bg-white text-center shadow-inner dark:bg-slate-950">
                <span className="text-xl font-bold leading-none text-slate-950 dark:text-white">
                  {bankStats.masteryPercent}%
                </span>
                <span className="-mt-2 text-[10px] font-medium text-slate-400">
                  {locale === 'zh-CN' ? '总体掌握' : 'mastered'}
                </span>
              </div>
            </div>
            <dl className="min-w-0 flex-1 space-y-2 text-xs">
              {[
                {
                  label: locale === 'zh-CN' ? '掌握良好' : 'Mastered',
                  count: bankStats.mastered,
                  className: 'bg-emerald-500',
                },
                {
                  label: locale === 'zh-CN' ? '待复习' : 'To review',
                  count: bankStats.review,
                  className: 'bg-amber-500',
                },
                {
                  label: locale === 'zh-CN' ? '错题' : 'Wrong',
                  count: bankStats.wrong,
                  className: 'bg-rose-500',
                },
                {
                  label: locale === 'zh-CN' ? '未练习' : 'Untried',
                  count: bankStats.unattempted,
                  className: 'bg-slate-300',
                },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-2">
                  <dt className="flex min-w-0 items-center gap-2 text-slate-500 dark:text-slate-400">
                    <span className={cn('size-2 rounded-full', item.className)} />
                    <span className="truncate">{item.label}</span>
                  </dt>
                  <dd className="font-semibold text-slate-800 dark:text-slate-100">{item.count}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-200/70 pt-3 text-center text-xs dark:border-white/10">
            <div>
              <div className="font-semibold text-sky-600 dark:text-sky-300">
                {bankStats.attempted}/{bankStats.total || 0}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                {locale === 'zh-CN' ? '已练习' : 'Practiced'}
              </div>
            </div>
            <div>
              <div className="font-semibold text-sky-600 dark:text-sky-300">
                {bankStats.coveredNotebookCount}/{Math.max(1, bankStats.notebookCount)}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                {locale === 'zh-CN' ? '题库覆盖' : 'Coverage'}
              </div>
            </div>
            <div>
              <div className="font-semibold text-sky-600 dark:text-sky-300">
                {bankStats.masteredTopicCount}/{bankStats.topicCount || 0}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                {locale === 'zh-CN' ? '知识点' : 'Concepts'}
              </div>
            </div>
          </div>
        </div>
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                {locale === 'zh-CN' ? '专题掌握情况' : 'Topic mastery'}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                {locale === 'zh-CN'
                  ? '每个专题按掌握、待复习、错题和未练习拆分。'
                  : 'Each topic is split by mastery state.'}
              </p>
            </div>
            <Target className="size-4 shrink-0 text-slate-400" strokeWidth={1.8} />
          </div>
          {renderTopicRows({ compact })}
        </div>
      </div>
    </article>
  );

  const renderTopicRows = ({ compact = false }: { compact?: boolean } = {}) => (
    <div
      className={cn(
        'grid max-h-[25rem] gap-3 overflow-y-auto pr-1',
        compact ? 'grid-cols-1' : 'md:grid-cols-2',
      )}
    >
      {topicRows.length > 0 ? (
        topicRows.map((topic) => (
          <div
            key={topic.title}
            className="rounded-2xl border border-slate-200/80 bg-slate-50/72 p-3 dark:border-white/10 dark:bg-black/15"
          >
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate font-medium text-slate-700 dark:text-slate-200">
                {topic.title}
              </span>
              <span className="shrink-0 font-semibold text-slate-500 dark:text-slate-400">
                {topic.total} 题
              </span>
            </div>
            <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              {[
                { key: 'mastered', count: topic.mastered, className: 'bg-emerald-500' },
                { key: 'review', count: topic.review, className: 'bg-amber-500' },
                { key: 'wrong', count: topic.wrong, className: 'bg-rose-500' },
                { key: 'unattempted', count: topic.unattempted, className: 'bg-slate-300' },
              ].map((segment) =>
                segment.count > 0 ? (
                  <div
                    key={segment.key}
                    className={cn('h-full', segment.className)}
                    style={{ width: `${Math.max(4, (segment.count / topic.total) * 100)}%` }}
                  />
                ) : null,
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200">
                掌握 {topic.mastered}
              </span>
              <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700 dark:bg-amber-400/10 dark:text-amber-200">
                待复习 {topic.review}
              </span>
              <span className="rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-700 dark:bg-rose-400/10 dark:text-rose-200">
                错题 {topic.wrong}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-500 dark:bg-white/10 dark:text-slate-300">
                未练 {topic.unattempted}
              </span>
            </div>
          </div>
        ))
      ) : (
        <p
          className={cn(
            'rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/70 px-3 py-4 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300',
            !compact && 'md:col-span-2',
          )}
        >
          暂无题库标签。
        </p>
      )}
    </div>
  );

  const renderKnowledgeGraph = () => {
    const activeNodeId = selectedKnowledgeNodeId || 'course-center';
    const selectedNode =
      knowledgeGraph.nodes.find((node) => node.id === activeNodeId) || knowledgeGraph.nodes[0];
    const displayNodes = knowledgeGraph.nodes.map((node) => ({
      ...node,
      selected: node.id === selectedNode.id,
      data: {
        ...node.data,
        onSelect: setSelectedKnowledgeNodeId,
      },
    }));

    return (
      <section className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/90 shadow-[0_18px_58px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-white/[0.055]">
        <div className="flex flex-col gap-3 border-b border-slate-200/80 px-4 py-4 dark:border-white/10 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-normal text-cyan-700 dark:text-cyan-200">
              Knowledge Graph
            </p>
            <h2 className="mt-1 text-base font-semibold text-slate-950 dark:text-white">
              知识图谱
            </h2>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <LibraryChip>{notebooks.length} 个笔记本</LibraryChip>
            <LibraryChip>{topicRows.length} 个专题</LibraryChip>
            <LibraryChip>{problemStats.total} 道题</LibraryChip>
            <LibraryChip>{memoryItems.length} 条记忆</LibraryChip>
          </div>
        </div>

        <div className="p-3">
          <div className="relative h-[34rem] overflow-hidden rounded-[20px] border border-slate-200/80 bg-white dark:border-white/10 dark:bg-slate-950">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_52%_48%,rgba(255,196,77,0.12),transparent_32%),radial-gradient(circle_at_80%_18%,rgba(79,195,235,0.14),transparent_26%),radial-gradient(circle_at_18%_80%,rgba(241,107,109,0.12),transparent_28%)] dark:opacity-50" />
            <ReactFlow
              key={knowledgeGraph.nodes.map((node) => node.id).join('|')}
              nodes={displayNodes}
              edges={knowledgeGraph.edges}
              nodeTypes={knowledgeGraphNodeTypes}
              className="relative z-10"
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable
              fitView
              fitViewOptions={knowledgeGraphFitViewOptions}
              minZoom={0.58}
              maxZoom={1.35}
              panOnDrag
              zoomOnScroll={false}
              zoomOnPinch
              zoomOnDoubleClick={false}
              proOptions={{ hideAttribution: true }}
              onNodeClick={(_, node) => setSelectedKnowledgeNodeId(node.id)}
              onPaneClick={() => setSelectedKnowledgeNodeId(null)}
            >
              <Background
                color="rgba(148,163,184,0.16)"
                gap={42}
                size={1}
                variant={BackgroundVariant.Dots}
              />
            </ReactFlow>
          </div>
        </div>
      </section>
    );
  };

  const renderNotebookIndex = () => (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {notebookRows.map((row) => (
        <article
          key={row.notebook.id}
          className="rounded-2xl border border-slate-200/80 bg-slate-50/72 p-3 dark:border-white/10 dark:bg-black/15"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                href={`/classroom/${encodeURIComponent(row.notebook.id)}`}
                className="line-clamp-1 text-sm font-semibold text-slate-950 transition hover:text-blue-700 dark:text-white dark:hover:text-blue-200"
              >
                {row.notebook.name}
              </Link>
              <p className="mt-1 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
                {row.latestMemoryTitle || '暂无最近记忆'}
              </p>
            </div>
            <span className="shrink-0 text-[11px] font-semibold text-slate-400">
              {formatDate(row.updatedAt)}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <LibraryChip>共有 {row.publicCount}</LibraryChip>
            <LibraryChip>私有 {row.privateCount}</LibraryChip>
            <LibraryChip>弱点 {row.weakCount}</LibraryChip>
            <LibraryChip>题 {row.problemCount}</LibraryChip>
          </div>
        </article>
      ))}
      {notebookRows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/70 px-3 py-4 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 md:col-span-2 xl:col-span-3">
          这门课还没有笔记本。
        </p>
      ) : null}
    </div>
  );

  if (course === undefined) {
    return (
      <main className="min-h-full bg-[#f3f6fb] text-slate-950 dark:bg-[#0e1117] dark:text-white">
        <div className="mx-auto flex w-full max-w-[92rem] flex-col gap-4 px-3 py-4 md:px-5 lg:px-6">
          <div className="flex min-h-[22rem] items-center justify-center">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/86 px-5 py-4 text-sm font-medium text-slate-500 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-300">
              <Loader2 className="size-4 animate-spin text-blue-600 dark:text-blue-300" />
              正在读取课程资料库…
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!course) {
    return (
      <main className="min-h-full bg-[#f3f6fb] text-slate-950 dark:bg-[#0e1117] dark:text-white">
        <div className="mx-auto flex w-full max-w-[86rem] flex-col gap-4 px-3 py-4 md:px-5 lg:px-6">
          <div className="flex min-h-[22rem] items-center justify-center">
            <div className="max-w-md rounded-3xl border border-slate-200/80 bg-white/86 p-7 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/[0.06]">
              <LibraryBig className="mx-auto size-10 text-slate-400" strokeWidth={1.5} />
              <h1 className="mt-4 text-lg font-semibold text-slate-950 dark:text-white">
                未找到课程
              </h1>
              <Button asChild className="mt-5 rounded-xl">
                <Link href="/my-courses">返回我的课程</Link>
              </Button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const courseBackgroundUrl = resolveCourseBackgroundDisplayUrl(course.id);
  const courseAvatarUrl = resolveCourseAvatarDisplayUrl(course.id, course.avatarUrl);

  return (
    <main className="min-h-full bg-[#f3f6fb] text-slate-950 dark:bg-[#0e1117] dark:text-white">
      <div className="mx-auto flex w-full max-w-[92rem] flex-col gap-4 px-3 py-4 md:px-5 lg:px-6">
        <section className="relative min-h-[13.5rem] overflow-hidden rounded-[24px] border border-white/75 bg-slate-100 shadow-[0_18px_54px_rgba(15,23,42,0.11)] ring-1 ring-slate-900/[0.035] dark:border-white/10 dark:bg-slate-950 dark:shadow-[0_22px_60px_rgba(0,0,0,0.32)] md:min-h-[13rem]">
          <img
            src={courseBackgroundUrl}
            alt=""
            className="absolute inset-0 size-full object-cover brightness-[1.08] saturate-[1.06]"
            aria-hidden
          />
          <div
            className="absolute inset-0 bg-[linear-gradient(110deg,rgba(15,23,42,0.28)_0%,rgba(15,23,42,0.14)_52%,rgba(15,23,42,0.05)_100%)] dark:bg-[linear-gradient(110deg,rgba(8,13,24,0.74)_0%,rgba(8,13,24,0.52)_52%,rgba(8,13,24,0.24)_100%)]"
            aria-hidden
          />
          <div
            className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-slate-950/30 via-slate-950/7 to-transparent dark:from-slate-950/76 dark:via-slate-950/18"
            aria-hidden
          />
          <div className="relative z-10 flex min-h-[13.5rem] flex-col justify-between gap-4 p-4 md:min-h-[13rem] md:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
                <img
                  src={courseAvatarUrl}
                  alt=""
                  className="size-[4.25rem] shrink-0 rounded-[22px] border border-white/80 bg-white object-cover shadow-[0_14px_34px_rgba(15,23,42,0.2)] ring-1 ring-slate-900/[0.04] dark:border-white/15 dark:bg-slate-900 md:size-16 md:rounded-[18px]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex max-w-3xl items-center gap-3">
                    <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold tracking-normal text-white drop-shadow-[0_1px_2px_rgba(15,23,42,0.38)] md:text-3xl">
                      {course.name}
                    </h1>
                    <span className="rounded-full border border-sky-200/20 bg-sky-950/20 px-2.5 py-1 text-sky-50 shadow-sm backdrop-blur-md">
                      课程资料库
                    </span>
                  </div>
                  <div className="mt-2 flex max-w-4xl flex-wrap gap-1.5">
                    {course.courseCode ? (
                      <LibraryChip className="border-white/15 bg-slate-950/20 text-white shadow-sm backdrop-blur-md">
                        {course.courseCode}
                      </LibraryChip>
                    ) : null}
                    {course.university ? (
                      <LibraryChip className="border-white/15 bg-slate-950/20 text-white shadow-sm backdrop-blur-md">
                        {course.university}
                      </LibraryChip>
                    ) : null}
                    <LibraryChip className="border-white/15 bg-slate-950/20 text-white shadow-sm backdrop-blur-md">
                      {course.language === 'zh-CN' ? '中文' : 'English'}
                    </LibraryChip>
                    <LibraryChip className="border-white/15 bg-slate-950/20 text-white shadow-sm backdrop-blur-md">
                      {dbAvailable ? '数据库记忆' : '本地默认记忆'}
                    </LibraryChip>
                  </div>
                  <p className="mt-2 line-clamp-3 max-w-3xl text-sm leading-6 text-white/88 drop-shadow-[0_1px_1px_rgba(15,23,42,0.26)]">
                    {course.description?.trim() || '这门课程暂时没有补充描述。'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <Tabs defaultValue="search" className="gap-4">
          <div className="border-b border-slate-200/80 dark:border-white/10">
            <TabsList
              variant="line"
              className="h-11 w-full justify-start gap-2 overflow-x-auto rounded-none bg-transparent p-0"
            >
              <TabsTrigger value="search" className={RESOURCE_TAB_TRIGGER_CLASS}>
                <Search className="size-4" strokeWidth={1.8} />
                搜索
              </TabsTrigger>
              <TabsTrigger value="memory" className={RESOURCE_TAB_TRIGGER_CLASS}>
                <Brain className="size-4" strokeWidth={1.8} />
                记忆
              </TabsTrigger>
              <TabsTrigger value="notebooks" className={RESOURCE_TAB_TRIGGER_CLASS}>
                <FileText className="size-4" strokeWidth={1.8} />
                笔记本
              </TabsTrigger>
              <TabsTrigger value="problems" className={RESOURCE_TAB_TRIGGER_CLASS}>
                <BookOpen className="size-4" strokeWidth={1.8} />
                题库
              </TabsTrigger>
              <TabsTrigger value="knowledge" className={RESOURCE_TAB_TRIGGER_CLASS}>
                <Network className="size-4" strokeWidth={1.8} />
                知识图谱
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="search" className="mt-0">
            <ResourceListDetailLayout<SearchResourceItem>
              key={`${filter}:${submittedQuery || 'empty'}`}
              eyebrow="Search"
              emptyStateClassName="min-h-[14rem]"
              hideHeader
              title="搜索结果"
              toolbar={
                <>
                  <form
                    className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
                    onSubmit={(event) => {
                      event.preventDefault();
                      submitSearch();
                    }}
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row lg:max-w-2xl">
                      <label className="relative block min-w-0 flex-1">
                        <span className="sr-only">搜索资料库</span>
                        <Search
                          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                          strokeWidth={1.9}
                        />
                        <input
                          value={query}
                          onChange={(event) => {
                            const nextQuery = event.target.value;
                            setQuery(nextQuery);
                            if (!nextQuery.trim()) {
                              searchRequestIdRef.current += 1;
                              setSubmittedQuery('');
                              setSearchRun({ status: 'idle', query: '' });
                              setSelectedSearchItemId(null);
                            }
                          }}
                          placeholder="搜索记忆标题、内容、笔记本或标签"
                          className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:focus:border-sky-400/40 dark:focus:ring-sky-400/10"
                        />
                      </label>
                      <Button
                        type="submit"
                        className="h-11 gap-2 rounded-2xl px-5 text-sm font-semibold"
                        disabled={!query.trim() || isSearchLoading}
                      >
                        {isSearchLoading ? <Loader2 className="size-4 animate-spin" /> : null}
                        开始搜索
                      </Button>
                    </div>
                    <div className="flex min-w-0 flex-wrap gap-2">
                      <ResourceFilterButton
                        active={filter === 'all'}
                        onClick={() => setFilter('all')}
                      >
                        全部
                      </ResourceFilterButton>
                      <ResourceFilterButton
                        active={filter === 'memory'}
                        onClick={() => setFilter('memory')}
                      >
                        记忆
                      </ResourceFilterButton>
                      <ResourceFilterButton
                        active={filter === 'private'}
                        onClick={() => setFilter('private')}
                      >
                        私有记忆
                      </ResourceFilterButton>
                      <ResourceFilterButton
                        active={filter === 'problem'}
                        onClick={() => setFilter('problem')}
                      >
                        题库
                      </ResourceFilterButton>
                    </div>
                  </form>
                  {hasSubmittedSearch ? (
                    <p className="mt-3 text-xs font-medium text-slate-400">
                      {isSearchLoading
                        ? `正在搜索“${submittedQuery}”`
                        : searchRun.status === 'error'
                          ? `“${submittedQuery}” 搜索失败`
                          : `“${submittedQuery}” 匹配到 ${resultCount} 条资料${
                              searchRun.status === 'success' && searchRun.data.vectorUsed
                                ? ' · 已使用语义召回'
                                : ''
                            }`}
                    </p>
                  ) : null}
                </>
              }
              items={hasSubmittedSearch ? searchItems : []}
              maxVisibleItems={10}
              selectedItemId={selectedSearchItemId}
              showEmptyState
              onSelectItem={setSelectedSearchItemId}
              emptyMessage={
                hasSubmittedSearch ? (
                  isSearchLoading ? (
                    <div className="flex items-center justify-center gap-2 py-5 text-center">
                      <Loader2 className="size-4 animate-spin text-blue-600 dark:text-blue-300" />
                      <span>正在搜索课程记忆和题库索引。</span>
                    </div>
                  ) : searchRun.status === 'error' ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-5 text-center">
                      <AlertCircle className="size-5 text-rose-500" strokeWidth={1.8} />
                      <span className="text-sm font-semibold text-slate-600 dark:text-slate-200">
                        搜索失败
                      </span>
                      <span className="max-w-md text-xs font-medium leading-5 text-slate-400 dark:text-slate-400">
                        {searchRun.error}
                      </span>
                    </div>
                  ) : (
                    '没有匹配的资料。'
                  )
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 py-5 text-center">
                    <Search className="size-5 text-slate-300" strokeWidth={1.8} />
                    <span className="text-sm font-semibold text-slate-600 dark:text-slate-200">
                      搜索框为空
                    </span>
                    <span className="max-w-md text-xs font-medium leading-5 text-slate-400 dark:text-slate-400">
                      输入关键词后点击开始搜索，匹配项会显示在这里。
                    </span>
                  </div>
                )
              }
              renderItemMeta={(item) =>
                item.kind === 'memory' ? (
                  <>
                    <LibraryChip>记忆</LibraryChip>
                    <LibraryChip className={memoryScopeChipClassName(item.memory.scopeLabel)}>
                      {item.memory.scopeLabel}
                    </LibraryChip>
                    <LibraryChip className={memoryLayerChipClassName(item.memory.layer)}>
                      {item.memory.layerLabel}
                    </LibraryChip>
                    <LibraryChip>{formatDate(item.memory.updatedAt)}</LibraryChip>
                  </>
                ) : (
                  <>
                    <LibraryChip>题库</LibraryChip>
                    <LibraryChip>{typeLabel(item.problem.type, locale)}</LibraryChip>
                    <LibraryChip>{problemListPracticeStateLabel(item.problem, locale)}</LibraryChip>
                    <LibraryChip>{formatDate(item.problem.updatedAt)}</LibraryChip>
                  </>
                )
              }
              renderDetail={renderSearchPreview}
            />
          </TabsContent>

          <TabsContent value="memory" className="mt-0">
            <ResourceListDetailLayout<LibraryMemoryItem>
              key={memoryLayerFilter}
              eyebrow="Layered Memory"
              title="分层记忆"
              headerActions={renderMemoryLayerFilter()}
              items={filteredLayerMemoryItems}
              maxVisibleItems={10}
              selectedItemId={selectedMemoryItemId}
              onSelectItem={setSelectedMemoryItemId}
              emptyMessage="这门课还没有可显示的记忆。"
              renderItemMeta={(memory) => (
                <>
                  <LibraryChip className={memoryScopeChipClassName(memory.scopeLabel)}>
                    {memory.scopeLabel}
                  </LibraryChip>
                  <LibraryChip className={memoryLayerChipClassName(memory.layer)}>
                    {memory.layerLabel}
                  </LibraryChip>
                  {memory.kindLabel ? (
                    <LibraryChip className={memoryKindChipClassName(memory.kindLabel)}>
                      {memory.kindLabel}
                    </LibraryChip>
                  ) : null}
                  <LibraryChip>{formatDate(memory.updatedAt)}</LibraryChip>
                </>
              )}
              renderDetail={renderMemoryPreview}
            />
          </TabsContent>

          <TabsContent value="notebooks" className="mt-0">
            <section className="rounded-[24px] border border-slate-200/80 bg-white/90 shadow-[0_18px_58px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-white/[0.055]">
              <div className="flex flex-col gap-3 border-b border-slate-200/80 px-4 py-4 dark:border-white/10 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-normal text-violet-700 dark:text-violet-200">
                    Notebooks
                  </p>
                  <h2 className="mt-1 text-base font-semibold text-slate-950 dark:text-white">
                    笔记本索引
                  </h2>
                </div>
                <Sparkles className="size-4 text-slate-400" strokeWidth={1.8} />
              </div>
              <div className="p-3">{renderNotebookIndex()}</div>
            </section>
          </TabsContent>

          <TabsContent value="problems" className="mt-0">
            <section className="rounded-[24px] border border-slate-200/80 bg-white/90 shadow-[0_18px_58px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-white/[0.055]">
              <div className="flex flex-col gap-3 border-b border-slate-200/80 px-4 py-4 dark:border-white/10 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-normal text-emerald-700 dark:text-emerald-200">
                    Problem Bank
                  </p>
                  <h2 className="mt-1 text-base font-semibold text-slate-950 dark:text-white">
                    题库资料
                  </h2>
                </div>
              </div>
              <div className="grid items-start gap-3 p-3 xl:grid-cols-[minmax(22rem,0.38fr)_minmax(0,1fr)]">
                <div className="min-w-0">{renderProblemProgress({ compact: true })}</div>
                <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-[0_16px_40px_rgba(15,23,42,0.05)] dark:border-slate-800 dark:bg-slate-950/60">
                  {renderProblemCards(problemItems, '这门课还没有题目。')}
                </div>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="knowledge" className="mt-0">
            {renderKnowledgeGraph()}
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
