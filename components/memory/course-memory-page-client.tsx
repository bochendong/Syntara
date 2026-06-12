'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { code } from '@streamdown/code';
import { createMathPlugin } from '@streamdown/math';
import {
  BadgeCheck,
  BookOpen,
  Brain,
  Database,
  FileText,
  Layers3,
  Loader2,
  Lock,
  MessageSquareText,
  RefreshCw,
  Search,
  Share2,
  Target,
} from 'lucide-react';
import { Streamdown } from 'streamdown';
import { MemoryPageHeader } from '@/components/memory/memory-page-header';
import { getDefaultCoursePublicMemories } from '@/lib/learning/default-public-memories';
import {
  getLocalStudyMemoryUserId,
  loadStudyMemory,
  type NotebookMemoryItem,
  type NotebookMemorySourceReference,
  type WeakPointMemory,
} from '@/lib/learning/study-memory';
import { cn } from '@/lib/utils';
import { backendJson } from '@/lib/utils/backend-api';
import { getCourse } from '@/lib/utils/course-storage';
import type { CourseRecord } from '@/lib/utils/database';
import {
  listCourseProblemSummaries,
  type CourseProblemClientSummary,
} from '@/lib/utils/notebook-problem-api';
import { listStagesByCourse, type StageListItem } from '@/lib/utils/stage-storage';
import { listStudyMemoryRecords, type StudyMemoryApiRecord } from '@/lib/utils/study-memory-api';

type CourseMemoryPageClientProps = {
  courseId: string;
};

type CourseMemoryTab = 'overview' | 'public' | 'private' | 'search';

type PublicMemoryView = {
  id: string;
  title: string;
  text: string;
  sourceLabel: string;
  sourceReferences: NotebookMemorySourceReference[];
  notebookId?: string;
  notebookName?: string;
  updatedAt?: number;
};

type PrivateMemoryView = {
  id: string;
  title: string;
  text: string;
  sourceLabel: string;
  kindLabel: string;
  sourceReferences: NotebookMemorySourceReference[];
  notebookId?: string;
  notebookName?: string;
  updatedAt?: number;
};

type CourseFactView = {
  id: string;
  label: string;
  value: string;
  scope: string;
};

type NotebookMemoryRecordBundle = {
  notebookId: string;
  memories: StudyMemoryApiRecord[];
};

type NotebookIndexView = {
  notebook: StageListItem;
  publicCount: number;
  privateCount: number;
  weakCount: number;
  sourceCount: number;
  latestTitle?: string;
  updatedAt?: number;
};

type SourceReferenceView = {
  id: string;
  title: string;
  subtitle: string;
  why?: string;
  count: number;
};

type RecallPreviewSection = {
  id: string;
  title: string;
  subtitle: string;
  items: Array<{ id: string; title: string; text: string }>;
};

type MemorySearchIntentView = {
  kind:
    | 'concept'
    | 'problem'
    | 'unattempted_problem'
    | 'weakness_review'
    | 'learner_understanding'
    | 'learning_status'
    | 'learner_questions'
    | 'general';
  originalQuery: string;
  rewrittenQuery: string;
  progressFilter: 'unattempted' | 'wrong_or_partial' | 'attempted' | null;
  knowledgeTypes: string[];
  matchedSignals: string[];
  notes: string[];
  source?: 'ai' | 'fallback';
  plan?: {
    summary: string;
    answerMode: 'explain' | 'list_results' | 'review_weakness' | 'mixed';
    primarySources: string[];
    secondarySources: string[];
    searchQueries: string[];
    filters: {
      progress: 'unattempted' | 'wrong_or_partial' | 'attempted' | null;
      tags: string[];
      notebookHints: string[];
      courseHints: string[];
    };
  };
};

type MemorySearchFact = {
  id: string;
  namespace: string;
  key: string;
  valueJson: unknown;
  scopeType: string;
  scopeId?: string | null;
  source: string;
  validFrom: string;
};

type MemorySearchMemory = {
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
};

type MemorySearchKnowledgeMatch = {
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

type MemorySearchSourceEvidence = {
  id: string;
  sourceType: 'markdown_section' | 'problem' | 'student_message' | 'problem_attempt' | string;
  title: string;
  originalText: string;
  renderedText: string;
  score: number;
  courseId: string | null;
  notebookId: string | null;
  sourceId: string;
  metadata: Record<string, unknown>;
};

type MemorySearchScope = {
  requestedMode: 'notebook_local' | 'course_wide' | 'auto_expand';
  effectiveMode: 'notebook_local' | 'course_wide';
  expanded: boolean;
  reason: string;
  originalTargetType: 'course' | 'notebook';
  originalTargetId: string;
  effectiveTargetType: 'course' | 'notebook';
  effectiveTargetId: string;
  courseId: string | null;
  notebookId: string | null;
  localEvidenceCount: number;
  courseEvidenceCount: number;
};

type MemorySearchLearnerAnalytics = {
  targetType: 'course' | 'notebook';
  targetId: string;
  timeScope: 'week' | 'month' | 'term' | 'all';
  since: string | null;
  until: string;
  summary: {
    questionCount: number;
    attemptCount: number;
    attemptedProblemCount: number;
    passedCount: number;
    failedCount: number;
    partialCount: number;
    privateMemoryCount: number;
    activeNotebookCount: number;
  };
  messages: Array<{
    id: string;
    notebookName: string | null;
    text: string;
    createdAt: string;
  }>;
  attempts: Array<{
    id: string;
    problemTitle: string;
    notebookName: string | null;
    status: string;
    score: number | null;
    tags: string[];
    createdAt: string;
  }>;
  privateMemories: Array<{
    id: string;
    title: string;
    text: string;
    notebookName: string | null;
    updatedAt: string;
  }>;
  weakTags: Array<{ tag: string; count: number }>;
  activeNotebooks: Array<{ notebookId: string; notebookName: string; count: number }>;
};

type MemorySearchResponse = {
  storage: 'database' | 'unavailable';
  answer: string;
  scope: MemorySearchScope;
  intent: MemorySearchIntentView;
  prompt: string;
  staticFacts: MemorySearchFact[];
  directMemories: MemorySearchMemory[];
  semanticMatches: MemorySearchMemory[];
  knowledgeMatches: MemorySearchKnowledgeMatch[];
  sourceEvidence: MemorySearchSourceEvidence[];
  learnerAnalytics: MemorySearchLearnerAnalytics | null;
  conflicts: unknown[];
  filteredStaleMemoryIds: string[];
  counts: {
    direct: number;
    semantic: number;
    knowledge: number;
    sourceEvidence: number;
    learnerAnalytics: number;
  };
  vectorUsed: boolean;
};

type MemorySearchRunState =
  | { status: 'idle'; query: string; data?: undefined; error?: undefined }
  | { status: 'loading'; query: string; data?: MemorySearchResponse; error?: undefined }
  | { status: 'success'; query: string; data: MemorySearchResponse; error?: undefined }
  | { status: 'error'; query: string; data?: MemorySearchResponse; error: string };

const markdownMath = createMathPlugin({ singleDollarTextMath: true });

function isActive(record: { status?: string | null }) {
  return record.status !== 'archived';
}

function formatTime(value?: number): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function compactText(input: string, maxLength: number): string {
  const text = input
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[#>*|`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function sourceReferencesFromApi(record: StudyMemoryApiRecord): NotebookMemorySourceReference[] {
  if (!Array.isArray(record.sourceReferences)) return [];
  const references: NotebookMemorySourceReference[] = [];

  for (const source of record.sourceReferences) {
    if (!source || typeof source !== 'object') continue;
    const raw = source as Record<string, unknown>;
    const order = Number(raw.order);
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (!Number.isFinite(order) || !title) continue;
    references.push({
      notebookId: typeof raw.notebookId === 'string' ? raw.notebookId : undefined,
      notebookName: typeof raw.notebookName === 'string' ? raw.notebookName : undefined,
      order,
      title,
      why: typeof raw.why === 'string' ? raw.why : undefined,
    });
  }

  return references;
}

function apiMemorySourceLabel(record: StudyMemoryApiRecord): string {
  if (record.source === 'notebook_generation') return '数据库生成记忆';
  if (record.source === 'manual_queue_rewrite') return '数据库课程重写';
  if (record.source === 'manual') return '数据库手动记忆';
  return '数据库记忆';
}

function memoryKindLabel(memory: NotebookMemoryItem): string {
  if (memory.kind === 'mistake') return '错题';
  if (memory.kind === 'preference') return '偏好';
  if (memory.kind === 'reflection') return '反思';
  if (memory.kind === 'manual') return '手动';
  return '知识缺口';
}

function apiMemoryKindLabel(record: StudyMemoryApiRecord): string {
  if (record.kind === 'mistake') return '错题';
  if (record.kind === 'preference') return '偏好';
  if (record.kind === 'reflection') return '反思';
  if (record.kind === 'manual') return '手动';
  return record.kind || '记忆';
}

function localPrivateSourceLabel(memory: NotebookMemoryItem): string {
  if (memory.source === 'notebook_generation') return '生成记忆';
  if (memory.source === 'manual') return '手动记忆';
  if (memory.source === 'quiz') return '题库记忆';
  return '聊天记忆';
}

function apiPublicMemory(record: StudyMemoryApiRecord): PublicMemoryView {
  return {
    id: `db:${record.id}`,
    title: record.title,
    text: record.text,
    sourceLabel: apiMemorySourceLabel(record),
    sourceReferences: sourceReferencesFromApi(record),
    updatedAt: Date.parse(record.updatedAt),
  };
}

function defaultPublicMemory(memory: NotebookMemoryItem): PublicMemoryView {
  return {
    id: `default:${memory.id}`,
    title: memory.title,
    text: memory.text,
    sourceLabel: '默认课程记忆',
    sourceReferences: memory.sourceReferences || [],
    updatedAt: memory.updatedAt,
  };
}

function notebookPublicMemory(
  notebook: StageListItem,
  memory: NotebookMemoryItem,
): PublicMemoryView {
  return {
    id: `notebook:${notebook.id}:${memory.id}`,
    title: memory.title,
    text: memory.text,
    sourceLabel: '笔记本公共记忆',
    sourceReferences: (memory.sourceReferences || []).map((source) => ({
      ...source,
      notebookId: source.notebookId || notebook.id,
      notebookName: source.notebookName || notebook.name,
    })),
    notebookId: notebook.id,
    notebookName: notebook.name,
    updatedAt: memory.updatedAt,
  };
}

function notebookApiPublicMemory(
  notebook: StageListItem,
  record: StudyMemoryApiRecord,
): PublicMemoryView {
  return {
    id: `db-notebook:${notebook.id}:${record.id}`,
    title: record.title,
    text: record.text,
    sourceLabel: apiMemorySourceLabel(record),
    sourceReferences: sourceReferencesFromApi(record).map((source) => ({
      ...source,
      notebookId: source.notebookId || notebook.id,
      notebookName: source.notebookName || notebook.name,
    })),
    notebookId: notebook.id,
    notebookName: notebook.name,
    updatedAt: Date.parse(record.updatedAt),
  };
}

function apiPrivateMemory(record: StudyMemoryApiRecord): PrivateMemoryView {
  return {
    id: `db:${record.id}`,
    title: record.title,
    text: record.text,
    sourceLabel: '数据库课程私有记忆',
    kindLabel: apiMemoryKindLabel(record),
    sourceReferences: sourceReferencesFromApi(record),
    updatedAt: Date.parse(record.updatedAt),
  };
}

function notebookApiPrivateMemory(
  notebook: StageListItem,
  record: StudyMemoryApiRecord,
): PrivateMemoryView {
  return {
    id: `db-notebook-private:${notebook.id}:${record.id}`,
    title: record.title,
    text: record.text,
    sourceLabel: '数据库笔记本私有记忆',
    kindLabel: apiMemoryKindLabel(record),
    sourceReferences: sourceReferencesFromApi(record),
    notebookId: notebook.id,
    notebookName: notebook.name,
    updatedAt: Date.parse(record.updatedAt),
  };
}

function notebookPrivateMemory(
  notebook: StageListItem,
  memory: NotebookMemoryItem,
): PrivateMemoryView {
  return {
    id: `private:${notebook.id}:${memory.id}`,
    title: memory.title,
    text: memory.text,
    sourceLabel: localPrivateSourceLabel(memory),
    kindLabel: memoryKindLabel(memory),
    sourceReferences: memory.sourceReferences || [],
    notebookId: notebook.id,
    notebookName: notebook.name,
    updatedAt: memory.updatedAt,
  };
}

function weakPointMemory(notebook: StageListItem, point: WeakPointMemory): PrivateMemoryView {
  return {
    id: `weak:${notebook.id}:${point.id}`,
    title: point.title,
    text: point.reason,
    sourceLabel: '待复习弱点',
    kindLabel: '弱点',
    sourceReferences: [],
    notebookId: notebook.id,
    notebookName: notebook.name,
    updatedAt: point.reviewedAt || point.createdAt,
  };
}

function purposeLabel(purpose: CourseRecord['purpose']): string {
  if (purpose === 'research') return '科研';
  if (purpose === 'university') return '大学课程';
  return '日常使用';
}

function languageLabel(language: CourseRecord['language']): string {
  return language === 'zh-CN' ? '中文' : 'English';
}

function buildCourseFacts(args: {
  course: CourseRecord;
  notebooks: StageListItem[];
  dbAvailable: boolean;
  publicMemoryCount: number;
  privateMemoryCount: number;
}): CourseFactView[] {
  return [
    {
      id: 'course:name',
      label: '课程名称',
      value: args.course.name,
      scope: 'course',
    },
    {
      id: 'course:language',
      label: '默认语言',
      value: languageLabel(args.course.language),
      scope: 'course',
    },
    {
      id: 'course:purpose',
      label: '使用场景',
      value: purposeLabel(args.course.purpose),
      scope: 'course',
    },
    {
      id: 'course:notebooks',
      label: '笔记本数量',
      value: String(args.notebooks.length),
      scope: 'course',
    },
    {
      id: 'course:problem-bank',
      label: '题库规模',
      value: String(args.course.problemCount || 0),
      scope: 'knowledge',
    },
    {
      id: 'course:memory-store',
      label: '记忆来源',
      value: args.dbAvailable ? '数据库 + 本地' : '本地默认',
      scope: 'storage',
    },
    {
      id: 'course:public-memory',
      label: '公共记忆',
      value: String(args.publicMemoryCount),
      scope: 'public',
    },
    {
      id: 'course:private-memory',
      label: '私有信号',
      value: String(args.privateMemoryCount),
      scope: 'private',
    },
  ].filter((fact) => fact.value.trim().length > 0);
}

function buildCoursePublicMarkdown(args: {
  courseName: string;
  courseMemories: PublicMemoryView[];
  notebookMemories: PublicMemoryView[];
}): string {
  const lines = [`# ${args.courseName} 课程记忆`, '', '> 这是课程层面的公共知识地图。', ''];

  if (args.courseMemories.length > 0) {
    lines.push('## 课程公共记忆', '');
    for (const memory of args.courseMemories) {
      const meta = [memory.sourceLabel, formatTime(memory.updatedAt)].filter(Boolean);
      lines.push(`### ${memory.title}`, '');
      if (meta.length > 0) lines.push(`> ${meta.join(' · ')}`, '');
      lines.push(memory.text.trim(), '');
    }
  }

  if (args.notebookMemories.length > 0) {
    lines.push('## 笔记本记忆索引', '');
    for (const memory of args.notebookMemories) {
      const notebookName = memory.notebookName ? `${memory.notebookName}：` : '';
      const summary = compactText(memory.text, 220);
      lines.push(`- **${notebookName}${memory.title}**：${summary || '已写入公共知识点。'}`);
    }
  }

  if (args.courseMemories.length === 0 && args.notebookMemories.length === 0) {
    lines.push('## 暂无公共记忆', '', '- 课程或笔记本写入公共记忆后，会在这里汇总。');
  }

  return lines.join('\n').trim();
}

function collectKnowledgeSources(args: {
  course: CourseRecord;
  notebooks: StageListItem[];
  memories: PublicMemoryView[];
}): SourceReferenceView[] {
  const sourceMap = new Map<string, SourceReferenceView>();

  const addSource = (source: Omit<SourceReferenceView, 'count'>, increment = 1) => {
    const existing = sourceMap.get(source.id);
    sourceMap.set(source.id, {
      ...source,
      count: (existing?.count || 0) + increment,
      why: existing?.why || source.why,
    });
  };

  for (const memory of args.memories) {
    for (const source of memory.sourceReferences) {
      const notebookName = source.notebookName || memory.notebookName || '笔记本';
      const sourceTitle = source.order ? `第 ${source.order} 页 · ${source.title}` : source.title;
      addSource({
        id: `${source.notebookId || memory.notebookId || 'course'}:${source.order}:${source.title}`,
        title: sourceTitle,
        subtitle: notebookName,
        why: source.why,
      });
    }
  }

  const totalScenes = args.notebooks.reduce((sum, notebook) => sum + (notebook.sceneCount || 0), 0);
  if (totalScenes > 0) {
    addSource(
      {
        id: 'derived:notebook-scenes',
        title: '笔记本页面',
        subtitle: `${args.notebooks.length} 本笔记本 · ${totalScenes} 页`,
      },
      totalScenes,
    );
  }

  if ((args.course.problemCount || 0) > 0) {
    addSource(
      {
        id: 'derived:problem-bank',
        title: '课程题库',
        subtitle: `${args.course.publishedProblemCount || 0} 已发布 / ${args.course.problemCount || 0} 总题`,
      },
      args.course.problemCount || 1,
    );
  }

  return Array.from(sourceMap.values()).sort((a, b) => b.count - a.count);
}

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledValues<T>(values: T[], seed: number): T[] {
  const random = seededRandom(seed || Date.now());
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function shuffledProblemSuggestionTitles(
  problems: CourseProblemClientSummary[],
  seed: number,
): string[] {
  const published = problems.filter((problem) => problem.status === 'published');
  const generated = published.filter((problem) => problem.tags.includes('AI生成练习'));
  const source = generated.length > 0 ? generated : published;
  return shuffledValues(source, seed)
    .map((problem) => problem.title.trim())
    .filter(Boolean);
}

function MarkdownDocument({ markdown }: { markdown: string }) {
  return (
    <div className="rounded-[20px] border border-slate-200/85 bg-white/92 p-4 shadow-sm dark:border-white/10 dark:bg-black/18 md:p-5">
      <div className="mb-4 flex min-w-0 items-center justify-between gap-3 border-b border-slate-200/80 pb-3 dark:border-white/10">
        <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-bold uppercase tracking-normal text-white dark:bg-white dark:text-slate-950">
          Markdown
        </span>
        <span className="truncate text-[11px] font-semibold text-slate-400 dark:text-slate-500">
          course-memory.md
        </span>
      </div>
      <Streamdown
        mode="static"
        plugins={{ code, math: markdownMath }}
        className={cn(
          'text-sm leading-7 text-slate-700 dark:text-slate-200',
          '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
          '[&_h1]:mb-4 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:leading-tight [&_h1]:text-slate-950 dark:[&_h1]:text-white',
          '[&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:border-b [&_h2]:border-slate-200 [&_h2]:pb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-900 dark:[&_h2]:border-white/10 dark:[&_h2]:text-white',
          '[&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-slate-900 dark:[&_h3]:text-slate-100',
          '[&_p]:my-3 [&_p]:text-slate-600 dark:[&_p]:text-slate-300',
          '[&_blockquote]:my-4 [&_blockquote]:rounded-2xl [&_blockquote]:border-l-4 [&_blockquote]:border-emerald-400 [&_blockquote]:bg-emerald-50/70 [&_blockquote]:px-4 [&_blockquote]:py-3 [&_blockquote]:text-sm [&_blockquote]:text-emerald-900 dark:[&_blockquote]:bg-emerald-500/10 dark:[&_blockquote]:text-emerald-100',
          '[&_ul]:my-3 [&_ul]:grid [&_ul]:gap-1.5 [&_ul]:pl-5 [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-slate-950 dark:[&_strong]:text-white',
          '[&_table]:my-4 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:rounded-xl [&_table]:border [&_table]:border-slate-200 [&_table]:text-left dark:[&_table]:border-white/10',
          '[&_thead]:bg-slate-50 dark:[&_thead]:bg-white/8 [&_th]:whitespace-nowrap [&_th]:border-b [&_th]:border-slate-200 [&_th]:px-3 [&_th]:py-2 [&_th]:text-xs [&_th]:font-semibold [&_th]:text-slate-700 dark:[&_th]:border-white/10 dark:[&_th]:text-slate-200',
          '[&_td]:border-b [&_td]:border-slate-100 [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_td]:text-xs [&_td]:leading-5 dark:[&_td]:border-white/8',
        )}
      >
        {markdown}
      </Streamdown>
    </div>
  );
}

function Panel({
  actions,
  children,
  icon: Icon,
  subtitle,
  title,
}: {
  actions?: ReactNode;
  children: ReactNode;
  icon: typeof Brain;
  subtitle?: string;
  title: string;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-[22px] border border-slate-200/80 bg-white/90 shadow-[0_18px_58px_rgba(15,23,42,0.07)] dark:border-white/10 dark:bg-white/[0.06]">
      <div className="flex min-w-0 items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-4 dark:border-white/10">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-100">
            <Icon className="size-5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">{title}</h2>
            {subtitle ? (
              <p className="mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="p-3 md:p-4">{children}</div>
    </section>
  );
}

function EmptyState({ children }: { children: string }) {
  return (
    <div className="flex min-h-[9rem] items-center justify-center rounded-2xl border border-dashed border-slate-200/90 bg-white/56 px-5 text-center text-sm text-slate-500 dark:border-white/12 dark:bg-white/[0.035] dark:text-slate-400">
      {children}
    </div>
  );
}

function CourseFactsPanel({ facts }: { facts: CourseFactView[] }) {
  return (
    <Panel icon={BadgeCheck} subtitle="当前课程召回的稳定基线。" title="结构事实">
      <div className="grid gap-2 sm:grid-cols-2">
        {facts.map((fact) => (
          <article
            key={fact.id}
            className="rounded-2xl border border-cyan-100 bg-cyan-50/60 p-3 dark:border-cyan-300/14 dark:bg-cyan-400/8"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold text-cyan-700 dark:text-cyan-100">{fact.label}</p>
              <span className="rounded-full bg-white/75 px-2 py-0.5 text-[10px] font-bold text-cyan-700 dark:bg-white/10 dark:text-cyan-100">
                {fact.scope}
              </span>
            </div>
            <p className="mt-2 line-clamp-2 text-sm font-semibold text-slate-950 dark:text-white">
              {fact.value}
            </p>
          </article>
        ))}
      </div>
    </Panel>
  );
}

function MetricStrip({
  metrics,
}: {
  metrics: Array<{ label: string; value: string | number; hint: string }>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="rounded-2xl border border-slate-200/85 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-white/[0.045]"
        >
          <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{metric.label}</p>
          <p className="mt-2 truncate text-2xl font-semibold tabular-nums text-slate-950 dark:text-white">
            {metric.value}
          </p>
          <p className="mt-1 truncate text-[10px] font-medium text-slate-400 dark:text-slate-500">
            {metric.hint}
          </p>
        </div>
      ))}
    </div>
  );
}

function PublicMemoryList({
  memories,
  titlePrefix,
}: {
  memories: PublicMemoryView[];
  titlePrefix?: string;
}) {
  if (memories.length === 0) {
    return <EmptyState>暂无公共记忆。</EmptyState>;
  }

  return (
    <div className="grid gap-2.5">
      {memories.slice(0, 12).map((memory) => (
        <article
          key={memory.id}
          className="rounded-2xl border border-slate-200/85 bg-white/82 p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.045]"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-300/14 dark:text-emerald-100">
              {memory.sourceLabel}
            </span>
            {memory.notebookName ? (
              <span className="max-w-full truncate rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                {memory.notebookName}
              </span>
            ) : null}
            {formatTime(memory.updatedAt) ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                {formatTime(memory.updatedAt)}
              </span>
            ) : null}
          </div>
          <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-slate-950 dark:text-white">
            {titlePrefix ? `${titlePrefix}${memory.title}` : memory.title}
          </h3>
          <p className="mt-1.5 line-clamp-3 text-xs leading-5 text-slate-600 dark:text-slate-300">
            {compactText(memory.text, 260)}
          </p>
        </article>
      ))}
    </div>
  );
}

function NotebookIndexPanel({ items }: { items: NotebookIndexView[] }) {
  return (
    <Panel icon={BookOpen} subtitle="每本笔记本贡献的课程记忆入口。" title="笔记本记忆索引">
      {items.length > 0 ? (
        <div className="grid gap-2.5">
          {items.slice(0, 10).map((item) => (
            <article
              key={item.notebook.id}
              className="rounded-2xl border border-slate-200/85 bg-white/82 p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.045]"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-slate-950 dark:text-white">
                    {item.notebook.name}
                  </h3>
                  <p className="mt-1 line-clamp-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {item.latestTitle || item.notebook.description || '暂无近期记忆摘要'}
                  </p>
                </div>
                <Link
                  href={`/classroom/${encodeURIComponent(item.notebook.id)}/memory`}
                  className="shrink-0 rounded-xl border border-slate-200/85 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-600 transition-colors hover:border-blue-200 hover:text-blue-700 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-200"
                >
                  进入
                </Link>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-1.5 text-center text-[10px] font-bold text-slate-500 dark:text-slate-300">
                {[
                  ['共有', item.publicCount],
                  ['私有', item.privateCount],
                  ['弱点', item.weakCount],
                  ['来源', item.sourceCount],
                ].map(([label, value]) => (
                  <span key={label} className="rounded-xl bg-slate-100 px-2 py-1 dark:bg-white/10">
                    {label} {value}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState>这门课还没有可索引的笔记本。</EmptyState>
      )}
    </Panel>
  );
}

function KnowledgeSourcesPanel({ sources }: { sources: SourceReferenceView[] }) {
  return (
    <Panel icon={Database} subtitle="课程召回可用的来源入口。" title="知识来源">
      {sources.length > 0 ? (
        <div className="grid gap-2.5">
          {sources.slice(0, 10).map((source) => (
            <article
              key={source.id}
              className="rounded-2xl border border-slate-200/85 bg-white/82 p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.045]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-slate-950 dark:text-white">
                    {source.title}
                  </h3>
                  <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {source.subtitle}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                  {source.count}
                </span>
              </div>
              {source.why ? (
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
                  {source.why}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState>暂无来源索引。</EmptyState>
      )}
    </Panel>
  );
}

function PrivateMemoryPanel({ memories }: { memories: PrivateMemoryView[] }) {
  const weakCount = memories.filter((memory) => memory.kindLabel === '弱点').length;
  return (
    <Panel
      icon={Lock}
      subtitle={`${weakCount} 个待复习弱点，${Math.max(0, memories.length - weakCount)} 条私有记忆。`}
      title="我的学习状态"
    >
      {memories.length > 0 ? (
        <div className="grid gap-2.5">
          {memories.slice(0, 16).map((memory) => (
            <article
              key={memory.id}
              className="rounded-2xl border border-slate-200/85 bg-white/82 p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.045]"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-bold',
                    memory.kindLabel === '弱点'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-300/14 dark:text-amber-100'
                      : 'bg-violet-100 text-violet-700 dark:bg-violet-300/14 dark:text-violet-100',
                  )}
                >
                  {memory.kindLabel}
                </span>
                <span className="max-w-full truncate rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                  {memory.sourceLabel}
                </span>
                {memory.notebookName ? (
                  <span className="max-w-full truncate rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                    {memory.notebookName}
                  </span>
                ) : null}
              </div>
              <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-slate-950 dark:text-white">
                {memory.title}
              </h3>
              <p className="mt-1.5 line-clamp-3 text-xs leading-5 text-slate-600 dark:text-slate-300">
                {memory.text}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState>暂无课程私有记忆。聊天、错题或复习产生的卡点会汇总到这里。</EmptyState>
      )}
    </Panel>
  );
}

function RecallPreviewPanel({ sections }: { sections: RecallPreviewSection[] }) {
  return (
    <Panel
      icon={MessageSquareText}
      subtitle="按聊天召回优先级展示当前可用上下文。"
      title="召回预览"
    >
      <div className="grid gap-3">
        {sections.map((section) => (
          <article
            key={section.id}
            className="rounded-2xl border border-slate-200/85 bg-white/82 p-3 dark:border-white/10 dark:bg-white/[0.045]"
          >
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-950 dark:text-white">
                  {section.title}
                </h3>
                <p className="mt-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {section.subtitle}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                {section.items.length}
              </span>
            </div>
            {section.items.length > 0 ? (
              <div className="mt-3 grid gap-1.5">
                {section.items.slice(0, 3).map((item) => (
                  <div key={item.id} className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/5">
                    <p className="line-clamp-1 text-xs font-semibold text-slate-800 dark:text-slate-100">
                      {item.title}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                      {item.text}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </Panel>
  );
}

function intentKindLabel(kind: MemorySearchIntentView['kind']): string {
  if (kind === 'concept') return '知识点/概念';
  if (kind === 'problem') return '题目搜索';
  if (kind === 'unattempted_problem') return '未做题目';
  if (kind === 'weakness_review') return '错题/薄弱点';
  if (kind === 'learner_understanding') return '学生理解状态';
  if (kind === 'learning_status') return '学习情况';
  if (kind === 'learner_questions') return '提问历史';
  return '通用检索';
}

function sourceEvidenceLabel(sourceType: MemorySearchSourceEvidence['sourceType']): string {
  if (sourceType === 'markdown_section') return '概念原文';
  if (sourceType === 'problem') return '题目原文';
  if (sourceType === 'student_message') return '学生提问';
  if (sourceType === 'problem_attempt') return '做题记录';
  return '来源原文';
}

function progressFilterLabel(filter: MemorySearchIntentView['progressFilter']): string {
  if (filter === 'unattempted') return '只看未尝试';
  if (filter === 'wrong_or_partial') return '只看错题/半对';
  if (filter === 'attempted') return '只看已尝试';
  return '不限制作答进度';
}

function attemptStatusLabel(match: MemorySearchKnowledgeMatch): string {
  if (!match.metadata.attemptedCount) return '未尝试';
  if (match.metadata.attemptStatus === 'passed') return '已通过';
  if (match.metadata.attemptStatus === 'failed') return '做错';
  if (match.metadata.attemptStatus === 'partial') return '半对';
  if (match.metadata.attemptStatus === 'error') return '批改异常';
  return '已尝试';
}

function learnerAnalyticsTimeScopeLabel(scope: MemorySearchLearnerAnalytics['timeScope']): string {
  if (scope === 'week') return '最近 7 天';
  if (scope === 'month') return '最近 30 天';
  if (scope === 'term') return '本课程周期';
  return '全部记录';
}

function memorySearchScopeLabel(scope: MemorySearchScope): string {
  if (scope.expanded) return '已扩大到整门课';
  if (scope.effectiveMode === 'course_wide') return '整门课';
  return '当前笔记本';
}

function CourseMemorySearchPanel({
  fixedSuggestions,
  problemSuggestions,
  query,
  searchRun,
  onQueryChange,
  onSearch,
}: {
  fixedSuggestions: string[];
  problemSuggestions: string[];
  query: string;
  searchRun: MemorySearchRunState;
  onQueryChange: (value: string) => void;
  onSearch: (value?: string) => void;
}) {
  const [suggestionPage, setSuggestionPage] = useState(0);
  const [suggestionSeed] = useState(() => Date.now());
  const hasQuery = query.trim().length > 0;
  const data = searchRun.data;
  const isLoading = searchRun.status === 'loading';
  const suggestions = useMemo(() => {
    const suggestionPool = Array.from(
      new Set([...fixedSuggestions, ...problemSuggestions].filter(Boolean)),
    );
    return shuffledValues(suggestionPool, suggestionSeed + suggestionPage * 9973).slice(0, 9);
  }, [fixedSuggestions, problemSuggestions, suggestionPage, suggestionSeed]);
  const hasSuggestionPool = fixedSuggestions.length > 0 || problemSuggestions.length > 0;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="min-w-0 overflow-hidden rounded-[22px] border border-slate-200/80 bg-white/90 shadow-[0_18px_58px_rgba(15,23,42,0.07)] dark:border-white/10 dark:bg-white/[0.06]">
        <div className="border-b border-slate-200/80 p-4 dark:border-white/10">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-400/12 dark:text-blue-100">
              <Search className="size-5" strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-950 dark:text-white">
                AI/RAG 自然语言搜索
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                聊天 AI 会用这条链路搜索概念原文、题目原文、学习情况和学生历史。
              </p>
            </div>
          </div>
          <div className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row">
            <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-2xl border border-slate-200/85 bg-slate-50/88 px-3 text-sm shadow-inner dark:border-white/10 dark:bg-black/18">
              <Search className="size-4 shrink-0 text-slate-400" strokeWidth={1.9} />
              <input
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onSearch();
                }}
                placeholder="例如：分部积分选 u、没做的黎曼积分题目、这周学生学习情况、整学期问过什么"
                className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
              />
            </label>
            <button
              type="button"
              disabled={!hasQuery || isLoading}
              onClick={() => onSearch()}
              className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-white dark:text-slate-950 dark:hover:bg-blue-100 dark:disabled:bg-white/20 dark:disabled:text-white/50"
            >
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              运行搜索
            </button>
          </div>
        </div>

        <div className="grid gap-3 p-3 md:p-4">
          {searchRun.status === 'error' ? (
            <EmptyState>{searchRun.error}</EmptyState>
          ) : isLoading && !data ? (
            <div className="flex min-h-32 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-8 text-sm font-semibold text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
              <Loader2 className="mr-2 size-4 animate-spin" />
              正在搜索课程记忆和题库索引。
            </div>
          ) : data ? (
            <article className="rounded-[22px] border border-slate-200/85 bg-white/86 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.05] md:p-5">
              <div className="mb-4 flex min-w-0 items-center justify-between gap-3 border-b border-slate-200/75 pb-3 dark:border-white/10">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-400/12 dark:text-blue-100">
                    <MessageSquareText className="size-4" strokeWidth={1.9} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-950 dark:text-white">
                      AI 回复
                    </h3>
                    <p className="mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
                      已按课程范围、结构事实优先级和题库进度过滤整理。
                    </p>
                  </div>
                </div>
                {isLoading ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-slate-400" />
                ) : null}
              </div>
              <Streamdown
                mode="static"
                plugins={{ code, math: markdownMath }}
                className={cn(
                  'text-sm leading-7 text-slate-700 dark:text-slate-200',
                  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
                  '[&_p]:my-3 [&_p]:text-slate-700 dark:[&_p]:text-slate-200',
                  '[&_ol]:my-3 [&_ol]:grid [&_ol]:gap-2 [&_ol]:pl-5',
                  '[&_ul]:my-3 [&_ul]:grid [&_ul]:gap-1.5 [&_ul]:pl-5',
                  '[&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-slate-950 dark:[&_strong]:text-white',
                )}
              >
                {data.answer}
              </Streamdown>
              <details className="mt-5 rounded-2xl border border-slate-200/80 bg-slate-50/72 px-3 py-2 text-xs text-slate-600 dark:border-white/10 dark:bg-black/16 dark:text-slate-300">
                <summary className="cursor-pointer select-none font-semibold text-slate-700 dark:text-slate-200">
                  召回依据
                </summary>
                <div className="mt-3 grid gap-3">
                  <div className="flex min-w-0 flex-wrap gap-1.5">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-400/12 dark:text-emerald-100">
                      {data.intent.source === 'ai' ? 'AI 搜索计划' : '降级通用检索'}
                    </span>
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 dark:bg-blue-400/12 dark:text-blue-100">
                      {intentKindLabel(data.intent.kind)}
                    </span>
                    <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[11px] font-bold text-cyan-700 dark:bg-cyan-400/12 dark:text-cyan-100">
                      {memorySearchScopeLabel(data.scope)}
                    </span>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                      {progressFilterLabel(data.intent.progressFilter)}
                    </span>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                      结构事实 {data.staticFacts.length}
                    </span>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                      记忆 {data.counts.direct + data.counts.semantic}
                    </span>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                      题库 {data.counts.knowledge}
                    </span>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                      原文 {data.counts.sourceEvidence}
                    </span>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                      学习分析 {data.counts.learnerAnalytics}
                    </span>
                  </div>
                  {data.intent.plan?.summary ? (
                    <p className="rounded-xl bg-white px-3 py-2 text-[11px] leading-5 text-slate-500 dark:bg-white/[0.06] dark:text-slate-300">
                      {data.intent.plan.summary}
                    </p>
                  ) : null}
                  {data.learnerAnalytics ? (
                    <div className="rounded-xl bg-white px-3 py-2 text-[11px] leading-5 text-slate-500 dark:bg-white/[0.06] dark:text-slate-300">
                      <p className="font-semibold text-slate-700 dark:text-slate-200">
                        学习分析：{learnerAnalyticsTimeScopeLabel(data.learnerAnalytics.timeScope)}
                      </p>
                      <p className="mt-0.5">
                        提问 {data.learnerAnalytics.summary.questionCount} · 做题{' '}
                        {data.learnerAnalytics.summary.attemptCount} · 错/半对{' '}
                        {data.learnerAnalytics.summary.failedCount +
                          data.learnerAnalytics.summary.partialCount}{' '}
                        · 私有记忆 {data.learnerAnalytics.summary.privateMemoryCount}
                      </p>
                    </div>
                  ) : null}
                  {data.knowledgeMatches.length > 0 ? (
                    <div className="grid gap-1.5">
                      {data.knowledgeMatches.slice(0, 4).map((match) => (
                        <div
                          key={match.id}
                          className="rounded-xl bg-white px-3 py-2 dark:bg-white/[0.06]"
                        >
                          <p className="line-clamp-1 font-semibold text-slate-800 dark:text-slate-100">
                            {match.title}
                          </p>
                          <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400">
                            {[match.metadata.notebookName, attemptStatusLabel(match)]
                              .filter(Boolean)
                              .join(' / ')}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {data.sourceEvidence.length > 0 ? (
                    <div className="grid gap-1.5">
                      {data.sourceEvidence.slice(0, 5).map((evidence) => (
                        <div
                          key={evidence.id}
                          className="rounded-xl bg-white px-3 py-2 dark:bg-white/[0.06]"
                        >
                          <p className="line-clamp-1 font-semibold text-slate-800 dark:text-slate-100">
                            {evidence.title}
                          </p>
                          <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400">
                            {sourceEvidenceLabel(evidence.sourceType)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </details>
            </article>
          ) : hasQuery ? (
            <EmptyState>输入后点击运行搜索，查看 AI 整理后的搜索答案。</EmptyState>
          ) : (
            <EmptyState>
              输入一句自然语言问题，例如“某个知识点概念”“某道题目”“没做的黎曼积分题目”。
            </EmptyState>
          )}
        </div>
      </section>

      <aside className="grid content-start gap-4">
        <Panel
          icon={MessageSquareText}
          subtitle="概念、题目和学习状态都可以搜。"
          title="AI 搜索样例"
        >
          <div className="grid gap-2">
            <button
              type="button"
              disabled={!hasSuggestionPool}
              onClick={() => setSuggestionPage((current) => current + 1)}
              className="inline-flex min-h-9 items-center justify-end gap-1.5 rounded-2xl border border-slate-200/85 bg-white/82 px-3 py-2 text-right text-xs font-bold leading-5 text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50/50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/10 dark:bg-white/[0.045] dark:text-slate-200 dark:hover:bg-blue-400/10"
            >
              <RefreshCw className="size-3.5" strokeWidth={1.9} />
              换一批
            </button>
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => {
                  onQueryChange(suggestion);
                  onSearch(suggestion);
                }}
                className="rounded-2xl border border-slate-200/85 bg-white/82 px-3 py-2 text-left text-xs font-semibold leading-5 text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50/50 hover:text-blue-700 dark:border-white/10 dark:bg-white/[0.045] dark:text-slate-200 dark:hover:bg-blue-400/10"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </Panel>
        {data ? (
          <Panel icon={Database} subtitle="只显示轻量摘要。" title="本次搜索">
            <div className="grid gap-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
              <p>意图：{intentKindLabel(data.intent.kind)}</p>
              <p>范围：{memorySearchScopeLabel(data.scope)}</p>
              <p>进度：{progressFilterLabel(data.intent.progressFilter)}</p>
              <p>题库命中：{data.counts.knowledge}</p>
              <p>原文证据：{data.counts.sourceEvidence}</p>
              <p>学习分析：{data.counts.learnerAnalytics}</p>
              {data.learnerAnalytics ? (
                <p>范围：{learnerAnalyticsTimeScopeLabel(data.learnerAnalytics.timeScope)}</p>
              ) : null}
            </div>
          </Panel>
        ) : null}
      </aside>
    </div>
  );
}

function TabButton({
  active,
  children,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  icon: typeof Brain;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors',
        active
          ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
          : 'border-slate-200/85 bg-white/86 text-slate-700 hover:border-blue-200 hover:text-blue-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200 dark:hover:bg-white/[0.1]',
      )}
    >
      <Icon className="size-3.5" strokeWidth={1.9} />
      {children}
    </button>
  );
}

export function CourseMemoryPageClient({ courseId }: CourseMemoryPageClientProps) {
  const [course, setCourse] = useState<CourseRecord | null | undefined>(undefined);
  const [notebooks, setNotebooks] = useState<StageListItem[]>([]);
  const [courseProblemSummaries, setCourseProblemSummaries] = useState<
    CourseProblemClientSummary[]
  >([]);
  const [dbMemories, setDbMemories] = useState<StudyMemoryApiRecord[]>([]);
  const [dbNotebookMemories, setDbNotebookMemories] = useState<NotebookMemoryRecordBundle[]>([]);
  const [dbAvailable, setDbAvailable] = useState(false);
  const [activeTab, setActiveTab] = useState<CourseMemoryTab>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestionBatchSeed] = useState(() => Date.now());
  const [searchRun, setSearchRun] = useState<MemorySearchRunState>({
    status: 'idle',
    query: '',
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      const [loadedCourse, loadedNotebooks, loadedProblemSummaries, loadedMemories] =
        await Promise.all([
          getCourse(courseId),
          listStagesByCourse(courseId).catch(() => []),
          listCourseProblemSummaries(courseId).catch(() => []),
          listStudyMemoryRecords({ targetType: 'course', targetId: courseId })
            .then((memories) => ({ ok: true, memories }))
            .catch(() => ({ ok: false, memories: [] as StudyMemoryApiRecord[] })),
        ]);
      const loadedNotebookMemories =
        loadedMemories.ok && loadedNotebooks.length > 0
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
      setCourseProblemSummaries(loadedProblemSummaries);
      setDbMemories(loadedMemories.memories);
      setDbNotebookMemories(loadedNotebookMemories);
      setDbAvailable(loadedMemories.ok);
    })();
    return () => {
      alive = false;
    };
  }, [courseId]);

  const runMemorySearch = useCallback(
    async (nextQuery?: string) => {
      const query = (nextQuery ?? searchQuery).trim();
      if (!query) return;
      setSearchQuery(query);
      setSearchRun((current) => ({
        status: 'loading',
        query,
        data: current.query === query ? current.data : undefined,
      }));

      try {
        const data = await backendJson<MemorySearchResponse>('/api/memory/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetType: 'course',
            targetId: courseId,
            query,
          }),
        });
        setSearchRun({ status: 'success', query, data });
      } catch (error) {
        setSearchRun({
          status: 'error',
          query,
          error: error instanceof Error ? error.message : '搜索失败，请稍后再试。',
        });
      }
    },
    [courseId, searchQuery],
  );

  const userId = getLocalStudyMemoryUserId();
  const notebookProfiles = useMemo(
    () =>
      notebooks.map((notebook) => ({
        notebook,
        profile: loadStudyMemory(userId, notebook.id),
      })),
    [notebooks, userId],
  );

  const notebooksById = useMemo(
    () => new Map(notebooks.map((notebook) => [notebook.id, notebook] as const)),
    [notebooks],
  );
  const dbPublicMemories = useMemo(
    () => dbMemories.filter((memory) => memory.scope === 'public' && isActive(memory)),
    [dbMemories],
  );
  const dbNotebookPublicMemories = useMemo(
    () =>
      dbNotebookMemories.flatMap(({ notebookId, memories }) => {
        const notebook = notebooksById.get(notebookId);
        if (!notebook) return [];
        return memories
          .filter((memory) => memory.scope === 'public' && isActive(memory))
          .map((memory) => notebookApiPublicMemory(notebook, memory));
      }),
    [dbNotebookMemories, notebooksById],
  );
  const coursePublicMemories = useMemo(() => {
    if (!course) return [];
    if (dbPublicMemories.length > 0) return dbPublicMemories.map(apiPublicMemory);
    return getDefaultCoursePublicMemories(course).map(defaultPublicMemory);
  }, [course, dbPublicMemories]);
  const notebookPublicMemories = useMemo(
    () =>
      [
        ...dbNotebookPublicMemories,
        ...notebookProfiles.flatMap(({ notebook, profile }) =>
          profile.publicMemories
            .filter(isActive)
            .map((memory) => notebookPublicMemory(notebook, memory)),
        ),
      ].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    [dbNotebookPublicMemories, notebookProfiles],
  );
  const privateMemories = useMemo(() => {
    const dbPrivate = dbMemories
      .filter((memory) => memory.scope === 'private' && isActive(memory))
      .map(apiPrivateMemory);
    const dbNotebookPrivate = dbNotebookMemories.flatMap(({ notebookId, memories }) => {
      const notebook = notebooksById.get(notebookId);
      if (!notebook) return [];
      return memories
        .filter((memory) => memory.scope === 'private' && isActive(memory))
        .map((memory) => notebookApiPrivateMemory(notebook, memory));
    });
    const notebookPrivate = notebookProfiles.flatMap(({ notebook, profile }) => [
      ...profile.privateMemories
        .filter(isActive)
        .map((memory) => notebookPrivateMemory(notebook, memory)),
      ...profile.weakPoints
        .filter((point) => point.status === 'open')
        .map((point) => weakPointMemory(notebook, point)),
    ]);
    return [...dbPrivate, ...dbNotebookPrivate, ...notebookPrivate].sort(
      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
    );
  }, [dbMemories, dbNotebookMemories, notebookProfiles, notebooksById]);

  const notebookIndex = useMemo<NotebookIndexView[]>(
    () =>
      notebooks
        .map((notebook) => {
          const dbBundle = dbNotebookMemories.find((bundle) => bundle.notebookId === notebook.id);
          const dbNotebookPublic = (dbBundle?.memories || []).filter(
            (memory) => memory.scope === 'public' && isActive(memory),
          );
          const dbNotebookPrivate = (dbBundle?.memories || []).filter(
            (memory) => memory.scope === 'private' && isActive(memory),
          );
          const localProfile = notebookProfiles.find((item) => item.notebook.id === notebook.id);
          const localPublic = localProfile?.profile.publicMemories.filter(isActive) || [];
          const localPrivate = localProfile?.profile.privateMemories.filter(isActive) || [];
          const localWeak =
            localProfile?.profile.weakPoints.filter((point) => point.status === 'open') || [];
          const relatedPublic = notebookPublicMemories.filter(
            (memory) => memory.notebookId === notebook.id,
          );
          const latest = [...relatedPublic].sort(
            (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
          )[0];

          return {
            notebook,
            publicCount: dbNotebookPublic.length + localPublic.length,
            privateCount: dbNotebookPrivate.length + localPrivate.length,
            weakCount: localWeak.length,
            sourceCount: relatedPublic.reduce(
              (sum, memory) => sum + memory.sourceReferences.length,
              0,
            ),
            latestTitle: latest?.title,
            updatedAt: Math.max(notebook.updatedAt || 0, latest?.updatedAt || 0),
          };
        })
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    [dbNotebookMemories, notebookProfiles, notebookPublicMemories, notebooks],
  );

  const knowledgeSources = useMemo(
    () =>
      course
        ? collectKnowledgeSources({
            course,
            notebooks,
            memories: [...coursePublicMemories, ...notebookPublicMemories],
          })
        : [],
    [course, coursePublicMemories, notebookPublicMemories, notebooks],
  );
  const courseFacts = useMemo(
    () =>
      course
        ? buildCourseFacts({
            course,
            notebooks,
            dbAvailable,
            publicMemoryCount: coursePublicMemories.length + notebookPublicMemories.length,
            privateMemoryCount: privateMemories.length,
          })
        : [],
    [
      course,
      coursePublicMemories.length,
      dbAvailable,
      notebookPublicMemories.length,
      notebooks,
      privateMemories.length,
    ],
  );
  const publicMarkdown = useMemo(
    () =>
      buildCoursePublicMarkdown({
        courseName: course?.name || '课程',
        courseMemories: coursePublicMemories,
        notebookMemories: notebookPublicMemories,
      }),
    [course?.name, coursePublicMemories, notebookPublicMemories],
  );
  const recallPreviewSections = useMemo<RecallPreviewSection[]>(
    () => [
      {
        id: 'facts',
        title: '静态事实',
        subtitle: '课程级当前值',
        items: courseFacts.slice(0, 4).map((fact) => ({
          id: fact.id,
          title: fact.label,
          text: fact.value,
        })),
      },
      {
        id: 'direct',
        title: '直接记忆',
        subtitle: '课程公共记忆',
        items: coursePublicMemories.slice(0, 3).map((memory) => ({
          id: memory.id,
          title: memory.title,
          text: compactText(memory.text, 120),
        })),
      },
      {
        id: 'semantic',
        title: '笔记本发现',
        subtitle: '公共记忆索引',
        items: notebookPublicMemories.slice(0, 3).map((memory) => ({
          id: memory.id,
          title: memory.notebookName ? `${memory.notebookName}：${memory.title}` : memory.title,
          text: compactText(memory.text, 120),
        })),
      },
      {
        id: 'private',
        title: '私有信号',
        subtitle: '学习状态',
        items: privateMemories.slice(0, 3).map((memory) => ({
          id: memory.id,
          title: memory.title,
          text: compactText(memory.text, 120),
        })),
      },
    ],
    [courseFacts, coursePublicMemories, notebookPublicMemories, privateMemories],
  );
  const fixedSearchSuggestions = useMemo(() => {
    const firstNotebook = notebookIndex[0]?.notebook.name;
    const firstPublicTitle = coursePublicMemories[0]?.title;
    const weakTitle = privateMemories.find((memory) => memory.kindLabel === '弱点')?.title;
    const suggestions = [
      'Riemann sum 是什么',
      'FTC I 和 FTC II 的区别',
      'u-substitution 的核心想法',
      '幂级数收敛半径怎么判断',
      '分部积分选 u 的原文在哪里',
      '分部积分选 u 学生掌握得怎么样',
      '积分换元的薄弱点在哪里',
      '这周学生的学习情况怎么样',
      '整学期学生问过什么问题',
      '最近学生主要卡在哪些知识点',
      '本月错题集中在哪些标签',
      '做错的题',
      '做错的积分题目',
      '没做的黎曼积分题目',
      '找一道关于极限定义的题目',
      course?.name ? `${course.name} 里最重要的课程要求是什么` : '',
      firstPublicTitle ? `${firstPublicTitle} 这个规则会影响哪些回答` : '',
      firstNotebook ? `${firstNotebook} 里的核心概念` : '',
      weakTitle ? `${weakTitle} 相关的错题和复习建议` : '',
    ];
    return Array.from(new Set(suggestions.filter(Boolean)));
  }, [course, coursePublicMemories, notebookIndex, privateMemories]);
  const problemSearchSuggestions = useMemo(
    () => shuffledProblemSuggestionTitles(courseProblemSummaries, suggestionBatchSeed),
    [courseProblemSummaries, suggestionBatchSeed],
  );

  if (course === undefined) {
    return (
      <main className="min-h-full bg-[#f3f6fb] text-slate-950 dark:bg-[#0e1117] dark:text-white">
        <div className="mx-auto flex w-full max-w-[92rem] flex-col gap-4 px-3 py-4 md:px-5 lg:px-6">
          <MemoryPageHeader
            title="课程记忆"
            subtitle="正在读取课程公共记忆、笔记本索引和私有学习状态。"
            eyebrow="课程记忆"
            backHref="/my-courses"
            backLabel="返回我的课程"
            icon={Brain}
          />
          <div className="flex min-h-[20rem] items-center justify-center">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/80 px-5 py-4 text-sm font-medium text-slate-500 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-300">
              <Loader2 className="size-4 animate-spin text-[#007AFF]" />
              正在读取课程记忆…
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
          <MemoryPageHeader
            title="课程记忆"
            subtitle="该课程可能已删除，或当前环境暂时无法加载它。"
            eyebrow="课程记忆"
            backHref="/my-courses"
            backLabel="返回我的课程"
            icon={Brain}
          />
          <div className="flex min-h-[20rem] items-center justify-center">
            <div className="max-w-md rounded-3xl border border-slate-200/80 bg-white/86 p-7 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/[0.06]">
              <BookOpen className="mx-auto size-10 text-slate-400" strokeWidth={1.5} />
              <h2 className="mt-4 text-lg font-semibold text-slate-950 dark:text-white">
                未找到课程
              </h2>
              <Link
                href="/my-courses"
                className="mt-5 inline-flex h-9 items-center justify-center rounded-xl bg-[#007AFF] px-4 text-sm font-semibold text-white"
              >
                返回我的课程
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const weakPointCount = privateMemories.filter((memory) => memory.kindLabel === '弱点').length;
  const latestMemoryAt = Math.max(
    course.updatedAt || 0,
    ...coursePublicMemories.map((memory) => memory.updatedAt || 0),
    ...notebookPublicMemories.map((memory) => memory.updatedAt || 0),
    ...privateMemories.map((memory) => memory.updatedAt || 0),
  );
  const metrics = [
    { label: '结构事实', value: courseFacts.length, hint: 'current' },
    { label: '课程公共', value: coursePublicMemories.length, hint: 'course' },
    { label: '笔记本索引', value: notebookIndex.length, hint: 'notebooks' },
    { label: '知识来源', value: knowledgeSources.length, hint: 'sources' },
    { label: '我的弱点', value: weakPointCount, hint: 'private' },
    { label: '最近更新', value: formatTime(latestMemoryAt) || '暂无', hint: 'memory' },
  ];

  return (
    <main className="min-h-full bg-[#f3f6fb] text-slate-950 dark:bg-[#0e1117] dark:text-white">
      <div className="mx-auto flex w-full max-w-[92rem] flex-col gap-4 px-3 py-4 md:px-5 lg:px-6">
        <MemoryPageHeader
          title="课程记忆"
          subtitle={[course.name, course.courseCode].filter(Boolean).join(' · ')}
          eyebrow="课程记忆"
          backHref={`/course/${encodeURIComponent(course.id)}`}
          backLabel="返回课程"
          icon={Brain}
          actions={
            <span className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200/85 bg-white/82 px-3 text-xs font-semibold text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200">
              <Database className="size-3.5" strokeWidth={1.8} />
              {dbAvailable ? '数据库已连接' : '本地默认记忆'}
            </span>
          }
        />

        <section className="rounded-[24px] border border-white/80 bg-white/90 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/[0.03] dark:border-white/10 dark:bg-white/[0.065] md:p-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(34rem,0.9fr)]">
            <div className="flex min-w-0 gap-4">
              <div className="flex size-20 shrink-0 items-center justify-center rounded-3xl border border-blue-200/80 bg-blue-50 text-blue-600 shadow-sm dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-200">
                <Brain className="size-8" strokeWidth={1.6} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span>当前课程</span>
                  {course.courseCode ? <span>{course.courseCode}</span> : null}
                  <span>{purposeLabel(course.purpose)}</span>
                </div>
                <h1 className="mt-2 line-clamp-2 text-2xl font-semibold leading-tight tracking-normal text-slate-950 dark:text-white md:text-3xl">
                  {course.name} 记忆控制台
                </h1>
                {course.description ? (
                  <p className="mt-2 line-clamp-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {course.description}
                  </p>
                ) : null}
              </div>
            </div>
            <MetricStrip metrics={metrics} />
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <TabButton
            active={activeTab === 'overview'}
            icon={Layers3}
            onClick={() => setActiveTab('overview')}
          >
            总览
          </TabButton>
          <TabButton
            active={activeTab === 'public'}
            icon={Share2}
            onClick={() => setActiveTab('public')}
          >
            公共记忆
          </TabButton>
          <TabButton
            active={activeTab === 'private'}
            icon={Lock}
            onClick={() => setActiveTab('private')}
          >
            我的学习状态
          </TabButton>
          <TabButton
            active={activeTab === 'search'}
            icon={Search}
            onClick={() => setActiveTab('search')}
          >
            搜索
          </TabButton>
        </div>

        {activeTab === 'overview' ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.24fr)_minmax(24rem,0.76fr)]">
            <div className="grid content-start gap-4">
              <CourseFactsPanel facts={courseFacts} />
              <RecallPreviewPanel sections={recallPreviewSections} />
              <Panel icon={Share2} subtitle="课程层公共知识与老师约束。" title="课程公共记忆">
                <PublicMemoryList memories={coursePublicMemories} />
              </Panel>
            </div>
            <div className="grid content-start gap-4">
              <NotebookIndexPanel items={notebookIndex} />
              <KnowledgeSourcesPanel sources={knowledgeSources} />
              <PrivateMemoryPanel memories={privateMemories} />
            </div>
          </div>
        ) : null}

        {activeTab === 'public' ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.16fr)_minmax(24rem,0.84fr)]">
            <Panel icon={FileText} subtitle="课程公共知识地图和笔记本索引。" title="公共 Markdown">
              <MarkdownDocument markdown={publicMarkdown} />
            </Panel>
            <div className="grid content-start gap-4">
              <Panel icon={Share2} subtitle="课程级稳定公共记忆。" title="课程公共记忆">
                <PublicMemoryList memories={coursePublicMemories} />
              </Panel>
              <Panel icon={BookOpen} subtitle="各笔记本贡献的公共记忆。" title="笔记本公共记忆">
                <PublicMemoryList memories={notebookPublicMemories} />
              </Panel>
              <KnowledgeSourcesPanel sources={knowledgeSources} />
            </div>
          </div>
        ) : null}

        {activeTab === 'private' ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <PrivateMemoryPanel memories={privateMemories} />
            <div className="grid content-start gap-4">
              <Panel icon={Target} subtitle="按课程聚合的复习压力点。" title="待复习弱点">
                {privateMemories.some((memory) => memory.kindLabel === '弱点') ? (
                  <div className="grid gap-2.5">
                    {privateMemories
                      .filter((memory) => memory.kindLabel === '弱点')
                      .slice(0, 12)
                      .map((memory) => (
                        <article
                          key={memory.id}
                          className="rounded-2xl border border-amber-100 bg-amber-50/70 p-3 dark:border-amber-300/14 dark:bg-amber-400/8"
                        >
                          <p className="text-sm font-semibold text-slate-950 dark:text-white">
                            {memory.title}
                          </p>
                          <p className="mt-1 line-clamp-3 text-xs leading-5 text-slate-600 dark:text-slate-300">
                            {memory.text}
                          </p>
                          {memory.notebookName ? (
                            <p className="mt-2 text-[10px] font-bold text-amber-700 dark:text-amber-100">
                              {memory.notebookName}
                            </p>
                          ) : null}
                        </article>
                      ))}
                  </div>
                ) : (
                  <EmptyState>暂无待复习弱点。</EmptyState>
                )}
              </Panel>
              <RecallPreviewPanel sections={recallPreviewSections} />
            </div>
          </div>
        ) : null}

        {activeTab === 'search' ? (
          <CourseMemorySearchPanel
            fixedSuggestions={fixedSearchSuggestions}
            problemSuggestions={problemSearchSuggestions}
            query={searchQuery}
            searchRun={searchRun}
            onQueryChange={setSearchQuery}
            onSearch={runMemorySearch}
          />
        ) : null}
      </div>
    </main>
  );
}
