'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { code } from '@streamdown/code';
import { createMathPlugin } from '@streamdown/math';
import {
  Archive,
  ArrowLeft,
  BookOpen,
  Brain,
  CircleDot,
  Clock3,
  FileText,
  Loader2,
  Lock,
  MessageCircle,
  Search,
  Share2,
  Target,
  Trash2,
} from 'lucide-react';
import { Streamdown } from 'streamdown';
import { cn } from '@/lib/utils';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import {
  deleteNotebookPrivateMemory,
  getLocalStudyMemoryUserId,
  loadStudyMemory,
  STUDY_MEMORY_UPDATED_EVENT,
  updateNotebookPrivateMemoryStatus,
  type NotebookMemoryItem,
  type NotebookMemorySourceReference,
  type WeakPointMemory,
} from '@/lib/learning/study-memory';
import { loadContactMessages } from '@/lib/utils/contact-chat-storage';
import { loadStageData, loadStageMetadata } from '@/lib/utils/stage-storage';
import { listStudyMemoryRecords, type StudyMemoryApiRecord } from '@/lib/utils/study-memory-api';
import type { NotebookChatMessage } from '@/components/chat/chat-page-types';
import type { Scene, Stage } from '@/lib/types/stage';

type MemoryTab = 'all' | 'public' | 'private' | 'sources';

type NotebookMemoryPageClientProps = {
  notebookId?: string | null;
  backHref?: string;
  backLabel?: string;
};

type LoadedNotebook = {
  notebookId: string;
  stage: Stage | null;
  scenes: Scene[];
};

type SharedMemoryView = {
  id: string;
  title: string;
  text: string;
  sourceLabel: string;
  sourceReferences: NotebookMemorySourceReference[];
  kindLabel: string;
  confidence?: number;
  derived: boolean;
  updatedAt?: number;
};

type ConversationMemory = {
  title: string;
  lines: string[];
  sources: NotebookMemorySourceReference[];
};

const EMPTY_SCENES: Scene[] = [];
const markdownMath = createMathPlugin({ singleDollarTextMath: true });

const tabItems: Array<{ value: MemoryTab; label: string; description: string }> = [
  { value: 'all', label: '全部记忆', description: '共有和私有一起看' },
  { value: 'public', label: '共有记忆', description: 'Markdown 知识点' },
  { value: 'private', label: '私有记忆', description: '用户学习状态' },
  { value: 'sources', label: '来源页面', description: '页面知识索引' },
];

function isImageAvatar(src: string | null | undefined): src is string {
  const value = src?.trim();
  return Boolean(
    value &&
    (value.startsWith('/') ||
      value.startsWith('http://') ||
      value.startsWith('https://') ||
      value.startsWith('data:')),
  );
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

function stripHtml(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h[1-6]|div)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactText(input: string, maxLength: number): string {
  const text = stripHtml(input);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function collectBlockText(block: unknown): string[] {
  if (!block || typeof block !== 'object') return [];
  const record = block as Record<string, unknown>;
  const lines: string[] = [];

  for (const key of [
    'title',
    'text',
    'caption',
    'problem',
    'goal',
    'answer',
    'latex',
    'equation',
  ]) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) lines.push(value.trim());
  }

  for (const key of ['items', 'givens', 'steps', 'pitfalls', 'headers']) {
    const value = record[key];
    if (Array.isArray(value)) {
      lines.push(
        ...value
          .map((item) => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') {
              const itemRecord = item as Record<string, unknown>;
              return [itemRecord.title, itemRecord.expression, itemRecord.explanation]
                .filter(
                  (part): part is string => typeof part === 'string' && part.trim().length > 0,
                )
                .join(' ');
            }
            return '';
          })
          .filter(Boolean),
      );
    }
  }

  const rows = record.rows;
  if (Array.isArray(rows)) {
    lines.push(
      ...rows
        .flatMap((row) => (Array.isArray(row) ? row : []))
        .map((cell) => String(cell || '').trim())
        .filter(Boolean),
    );
  }

  return lines;
}

function sceneDigest(scene: Scene): string {
  if (scene.content.type === 'slide') {
    const semanticBlocks = scene.content.semanticDocument?.blocks || [];
    const semanticText = semanticBlocks.flatMap(collectBlockText).join(' ');
    if (semanticText.trim()) return compactText(semanticText, 260);

    const canvasText = scene.content.canvas.elements
      .filter((element) => element.type === 'text')
      .map((element) => (element as { content?: string }).content || '')
      .join(' ');
    return compactText(canvasText || scene.title, 260);
  }

  if (scene.content.type === 'quiz') {
    const text = scene.content.questions
      .slice(0, 4)
      .map((question) => question.question)
      .join('；');
    return compactText(text || scene.title, 260);
  }

  if (scene.content.type === 'interactive') {
    return compactText(scene.content.html || scene.content.url || scene.title, 260);
  }

  if (scene.content.type === 'pbl') {
    return compactText(scene.content.projectConfig?.projectInfo?.description || scene.title, 260);
  }

  return scene.title;
}

function sceneTypeLabel(scene: Scene): string {
  if (scene.type === 'quiz') return '题库练习';
  if (scene.type === 'interactive') return '互动页';
  if (scene.type === 'pbl') return '项目页';
  return '课件页';
}

function memoryKindLabel(memory: NotebookMemoryItem): string {
  if (memory.kind === 'mistake') return '错题';
  if (memory.kind === 'preference') return '偏好';
  if (memory.kind === 'reflection') return '反思';
  if (memory.kind === 'manual') return '手动';
  return '知识缺口';
}

function sharedMemoryFromStored(memory: NotebookMemoryItem): SharedMemoryView {
  return {
    id: `stored:${memory.id}`,
    title: memory.title,
    text: memory.text,
    sourceLabel:
      memory.source === 'notebook_generation'
        ? '生成记忆'
        : memory.source === 'manual'
          ? '手动记忆'
          : memory.source === 'quiz'
            ? '题库记忆'
            : '聊天记忆',
    sourceReferences: memory.sourceReferences || [],
    kindLabel: memoryKindLabel(memory),
    confidence: memory.confidence,
    derived: false,
    updatedAt: memory.updatedAt,
  };
}

function sourceReferencesFromApi(record: StudyMemoryApiRecord): NotebookMemorySourceReference[] {
  if (!Array.isArray(record.sourceReferences)) return [];
  const references: NotebookMemorySourceReference[] = [];
  for (const source of record.sourceReferences) {
    if (!source || typeof source !== 'object') continue;
    const raw = source as Record<string, unknown>;
    const order = Number(raw.order);
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    const why = typeof raw.why === 'string' ? raw.why : undefined;
    if (!Number.isFinite(order) || !title) continue;
    references.push({ order, title, why });
  }
  return references;
}

function sharedMemoryFromApi(record: StudyMemoryApiRecord): SharedMemoryView {
  return {
    id: `db:${record.id}`,
    title: record.title,
    text: record.text,
    sourceLabel:
      record.source === 'notebook_generation'
        ? '数据库生成记忆'
        : record.source === 'manual'
          ? '数据库手动记忆'
          : '数据库记忆',
    sourceReferences: sourceReferencesFromApi(record),
    kindLabel: record.kind || 'manual',
    confidence: record.confidence ?? undefined,
    derived: false,
    updatedAt: Date.parse(record.updatedAt),
  };
}

function sharedMemoryFromScene(scene: Scene): SharedMemoryView {
  const order = scene.order + 1;
  const title = scene.title?.trim() || `第 ${order} 页`;
  return {
    id: `scene:${scene.id}`,
    title,
    text: sceneDigest(scene),
    sourceLabel: `第 ${order} 页 · ${sceneTypeLabel(scene)}`,
    sourceReferences: [{ order, title }],
    kindLabel: sceneTypeLabel(scene),
    derived: true,
    updatedAt: scene.updatedAt || scene.createdAt,
  };
}

function deriveConversationMemory(messages: NotebookChatMessage[]): ConversationMemory {
  const recent = messages.slice(-10);
  const lastUser = [...recent].reverse().find((message) => message.role === 'user');
  const lastAssistant = [...recent].reverse().find((message) => message.role === 'assistant');
  const sources = recent
    .flatMap((message) => (message.role === 'assistant' ? message.references || [] : []))
    .slice(-5)
    .map((reference) => ({
      order: reference.order,
      title: reference.title,
      why: reference.why,
    }));

  return {
    title: '私有短期记忆',
    lines: [
      lastUser ? `最近问题：${lastUser.text.replace(/\s+/g, ' ').slice(0, 96)}` : '',
      lastAssistant?.knowledgeGap ? '本轮出现了可长期记住的学习缺口。' : '',
      lastAssistant ? `最近回答：${lastAssistant.answer.replace(/\s+/g, ' ').slice(0, 120)}` : '',
    ].filter(Boolean),
    sources,
  };
}

function matchesSearch(input: string, query: string): boolean {
  if (!query.trim()) return true;
  return input.toLowerCase().includes(query.trim().toLowerCase());
}

function EmptyState({ children }: { children: string }) {
  return (
    <div className="flex min-h-[10rem] items-center justify-center rounded-2xl border border-dashed border-slate-200/90 bg-white/56 px-5 text-center text-sm text-slate-500 dark:border-white/12 dark:bg-white/[0.035] dark:text-slate-400">
      {children}
    </div>
  );
}

function SourceChips({ sources }: { sources: NotebookMemorySourceReference[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="mt-3 flex min-w-0 flex-wrap gap-1.5">
      {sources.slice(0, 4).map((source, index) => (
        <span
          key={`${source.order}:${source.title}:${index}`}
          className="max-w-full truncate rounded-lg border border-slate-200/80 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-500 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-300"
          title={source.why || source.title}
        >
          第 {source.order} 页 · {source.title}
        </span>
      ))}
    </div>
  );
}

function normalizeMarkdownBody(input: string): string {
  const chunks: string[] = [];
  const outsideFenceLines: string[] = [];
  let inFence = false;

  function normalizeOutsideFence(text: string): string {
    return text
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|h[1-6]|div)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .split('\n')
      .map((line) => line.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/g, ''))
      .join('\n');
  }

  function flushOutsideFence(): void {
    if (outsideFenceLines.length === 0) return;
    chunks.push(normalizeOutsideFence(outsideFenceLines.join('\n')));
    outsideFenceLines.length = 0;
  }

  for (const line of input.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^[ \t]*(```|~~~)/.test(line)) {
      flushOutsideFence();
      chunks.push(line.replace(/[ \t]+$/g, ''));
      inFence = !inFence;
      continue;
    }

    if (inFence) {
      chunks.push(line.replace(/[ \t]+$/g, ''));
    } else {
      outsideFenceLines.push(line);
    }
  }
  flushOutsideFence();

  return chunks
    .join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeMarkdownInline(input: string, maxLength = 220): string {
  return compactText(input, maxLength).replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
}

function sourceLine(item: SharedMemoryView): string {
  const references = item.sourceReferences
    .slice(0, 3)
    .map((source) => `第 ${source.order} 页 ${source.title}`)
    .join('；');
  return references || item.sourceLabel;
}

function buildSharedMemoryMarkdown(args: {
  notebookName: string;
  items: SharedMemoryView[];
  mode: 'knowledge' | 'sources';
}): string {
  const { notebookName, items, mode } = args;
  const explicit = items.filter((item) => !item.derived);
  const derived = items.filter((item) => item.derived);
  const lines: string[] = [
    mode === 'sources' ? `# ${notebookName} 来源页面` : `# ${notebookName} 共有记忆`,
    '',
    mode === 'sources'
      ? '> 这些页面是当前共有记忆的来源索引。'
      : '> 这是这本笔记本已经沉淀出的公共知识底稿，描述它目前知道的知识点。',
    '',
  ];

  if (mode === 'sources') {
    lines.push('## 页面索引', '');
    for (const [index, item] of items.entries()) {
      lines.push(
        `- **${index + 1}. ${item.title}**：${normalizeMarkdownInline(
          item.text || item.sourceLabel,
          180,
        )}`,
      );
      lines.push(`  - 来源：${sourceLine(item)}`);
    }
    return lines.join('\n').trim();
  }

  if (explicit.length > 0) {
    lines.push('## 已写入的公共知识', '');
    for (const item of explicit) {
      lines.push(`### ${item.title}`, '');
      const body = normalizeMarkdownBody(item.text);
      lines.push(body || '- 暂无正文');
      lines.push('');
    }
  }

  if (derived.length > 0) {
    lines.push('## 从笔记本页面推导的知识点', '');
    for (const [index, item] of derived.entries()) {
      lines.push(`### ${index + 1}. ${item.title}`, '');
      lines.push(`- 知识点：${normalizeMarkdownInline(item.text || '暂无可提取文本', 240)}`);
      lines.push(`- 来源：${sourceLine(item)}`);
      lines.push(`- 类型：${item.kindLabel}`);
      lines.push('');
    }
  }

  if (explicit.length === 0 && derived.length === 0) {
    lines.push('## 暂无公共知识', '', '- 笔记本页面生成后，这里会形成可查看的 Markdown 知识档案。');
  }

  return lines.join('\n').trim();
}

function SharedMemoryMarkdownDocument({ markdown }: { markdown: string }) {
  return (
    <div className="rounded-[20px] border border-slate-200/85 bg-white/92 p-4 shadow-sm dark:border-white/10 dark:bg-black/18 md:p-5">
      <div className="mb-4 flex min-w-0 items-center justify-between gap-3 border-b border-slate-200/80 pb-3 dark:border-white/10">
        <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-bold uppercase tracking-normal text-white dark:bg-white dark:text-slate-950">
          Markdown
        </span>
        <span className="truncate text-[11px] font-semibold text-slate-400 dark:text-slate-500">
          shared-memory.md
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
          '[&_code]:rounded-md [&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em] dark:[&_code]:bg-white/10',
        )}
      >
        {markdown}
      </Streamdown>
    </div>
  );
}

function WeakPointCard({ point }: { point: WeakPointMemory }) {
  return (
    <article className="rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4 dark:border-amber-400/20 dark:bg-amber-500/10">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-xl bg-amber-500/14 text-amber-800 dark:text-amber-200">
          <Target className="size-3.5" strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold text-amber-900 dark:text-amber-100">待复习弱点</p>
          <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-slate-950 dark:text-white">
            {point.title}
          </h3>
          <p className="mt-2 line-clamp-3 text-xs leading-5 text-amber-900/80 dark:text-amber-100/80">
            {point.reason}
          </p>
          <p className="mt-2 text-[10px] font-medium text-amber-800/70 dark:text-amber-100/65">
            {formatTime(point.createdAt) || '最近记录'}
          </p>
        </div>
      </div>
    </article>
  );
}

function PrivateMemoryCard({
  memory,
  onArchive,
  onDelete,
}: {
  memory: NotebookMemoryItem;
  onArchive: (memory: NotebookMemoryItem) => void;
  onDelete: (memory: NotebookMemoryItem) => void;
}) {
  return (
    <article className="rounded-2xl border border-slate-200/85 bg-white/82 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.055]">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-500/12 dark:text-violet-200">
          <Lock className="size-3.5" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700 dark:bg-violet-500/12 dark:text-violet-200">
              {memoryKindLabel(memory)}
            </span>
            <h3 className="truncate text-sm font-semibold text-slate-950 dark:text-white">
              {memory.title}
            </h3>
          </div>
          <p className="mt-2 line-clamp-4 text-xs leading-5 text-slate-600 dark:text-slate-300">
            {memory.text}
          </p>
          {memory.reason ? (
            <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
              {memory.reason}
            </p>
          ) : null}
          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
              {memory.source === 'notebook_generation'
                ? '生成'
                : memory.source === 'manual'
                  ? '手动'
                  : memory.source === 'quiz'
                    ? '题库'
                    : '对话'}
            </span>
            {formatTime(memory.updatedAt) ? (
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                {formatTime(memory.updatedAt)}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white"
            aria-label="归档记忆"
            title="归档"
            onClick={() => onArchive(memory)}
          >
            <Archive className="size-4" strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-200"
            aria-label="撤销这条私有记忆"
            title="撤销"
            onClick={() => onDelete(memory)}
          >
            <Trash2 className="size-4" strokeWidth={1.8} />
          </button>
        </div>
      </div>
      <SourceChips sources={memory.sourceReferences || []} />
    </article>
  );
}

export function NotebookMemoryPageClient({
  notebookId,
  backHref,
  backLabel = '返回',
}: NotebookMemoryPageClientProps) {
  const storedCourseId = useCurrentCourseStore((s) => s.id);
  const [loaded, setLoaded] = useState<LoadedNotebook | null>(null);
  const [tab, setTab] = useState<MemoryTab>('all');
  const [query, setQuery] = useState('');
  const [revision, setRevision] = useState(0);
  const [dbMemories, setDbMemories] = useState<StudyMemoryApiRecord[]>([]);
  const [conversationSnapshot, setConversationSnapshot] = useState<{
    notebookId: string;
    memory: ConversationMemory;
  } | null>(null);

  useEffect(() => {
    if (!notebookId) return;
    let alive = true;
    void Promise.all([
      loadStageMetadata(notebookId),
      listStudyMemoryRecords({ targetType: 'notebook', targetId: notebookId }).catch(
        () => [] as StudyMemoryApiRecord[],
      ),
    ]).then(([stage, memories]) => {
      if (!alive) return;
      setLoaded({
        notebookId,
        stage,
        scenes: [],
      });
      setDbMemories(memories);
    });
    return () => {
      alive = false;
    };
  }, [notebookId]);

  useEffect(() => {
    const onMemoryUpdated = (event: Event) => {
      const stageId = (event as CustomEvent<{ stageId?: string }>).detail?.stageId;
      if (stageId && stageId !== notebookId) return;
      setRevision((value) => value + 1);
    };
    window.addEventListener(STUDY_MEMORY_UPDATED_EVENT, onMemoryUpdated as EventListener);
    return () =>
      window.removeEventListener(STUDY_MEMORY_UPDATED_EVENT, onMemoryUpdated as EventListener);
  }, [notebookId]);

  const currentLoaded = loaded?.notebookId === notebookId ? loaded : null;
  const loading = Boolean(notebookId && !currentLoaded);
  const stage = currentLoaded?.stage || null;
  const scenes = currentLoaded?.scenes || EMPTY_SCENES;
  const courseId = stage?.courseId || storedCourseId || null;
  const resolvedBackHref =
    backHref || (courseId ? `/course/${encodeURIComponent(courseId)}` : '/my-courses');
  const chatHref = notebookId ? `/chat?notebook=${encodeURIComponent(notebookId)}` : '/chat';

  useEffect(() => {
    if (!notebookId || !courseId) return;
    let alive = true;
    void loadContactMessages<NotebookChatMessage>(courseId, 'notebook', notebookId, {
      ignoreCourseId: true,
      expectedTargetName: stage?.name,
    })
      .then((messages) => {
        if (!alive) return;
        setConversationSnapshot({
          notebookId,
          memory: deriveConversationMemory(messages),
        });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [courseId, notebookId, stage?.name]);

  const currentConversationSnapshot =
    conversationSnapshot?.notebookId === notebookId ? conversationSnapshot : null;
  const conversationMemory = currentConversationSnapshot?.memory || null;

  const profile = useMemo(() => {
    void revision;
    if (!notebookId) return null;
    return loadStudyMemory(getLocalStudyMemoryUserId(), notebookId);
  }, [notebookId, revision]);

  const publicMemories = useMemo(
    () => (profile?.publicMemories || []).filter((memory) => memory.status !== 'archived'),
    [profile?.publicMemories],
  );
  const dbPublicMemories = useMemo(
    () => dbMemories.filter((memory) => memory.scope === 'public' && memory.status !== 'archived'),
    [dbMemories],
  );
  const privateMemories = useMemo(
    () => (profile?.privateMemories || []).filter((memory) => memory.status !== 'archived'),
    [profile?.privateMemories],
  );
  const weakPoints = useMemo(
    () => (profile?.weakPoints || []).filter((point) => point.status === 'open'),
    [profile?.weakPoints],
  );

  useEffect(() => {
    if (!notebookId || !currentLoaded || currentLoaded.scenes.length > 0) return;
    const hasStoredPublicMemory = dbPublicMemories.length > 0 || publicMemories.length > 0;
    if (hasStoredPublicMemory) return;

    let alive = true;
    void loadStageData(notebookId).then((data) => {
      if (!alive || !data) return;
      setLoaded({
        notebookId,
        stage: data.stage,
        scenes: data.scenes,
      });
    });
    return () => {
      alive = false;
    };
  }, [currentLoaded, dbPublicMemories.length, notebookId, publicMemories.length]);

  const sharedMemories = useMemo(() => {
    const stored = [
      ...dbPublicMemories.map(sharedMemoryFromApi),
      ...publicMemories.map(sharedMemoryFromStored),
    ];
    if (stored.length > 0) return stored.slice(0, 80);
    const derived = scenes
      .slice()
      .sort((a, b) => a.order - b.order)
      .map(sharedMemoryFromScene)
      .filter((item) => item.text.trim() || item.title.trim());
    return derived.slice(0, 80);
  }, [dbPublicMemories, publicMemories, scenes]);

  const filteredShared = useMemo(
    () =>
      sharedMemories.filter((item) =>
        matchesSearch(`${item.title} ${item.text} ${item.sourceLabel}`, query),
      ),
    [query, sharedMemories],
  );
  const filteredPrivate = useMemo(
    () =>
      privateMemories.filter((memory) =>
        matchesSearch(`${memory.title} ${memory.text} ${memory.reason || ''}`, query),
      ),
    [privateMemories, query],
  );
  const filteredWeakPoints = useMemo(
    () => weakPoints.filter((point) => matchesSearch(`${point.title} ${point.reason}`, query)),
    [query, weakPoints],
  );
  const sharedMarkdown = useMemo(
    () =>
      buildSharedMemoryMarkdown({
        notebookName: stage?.name || '笔记本',
        items: filteredShared,
        mode: tab === 'sources' ? 'sources' : 'knowledge',
      }),
    [filteredShared, stage?.name, tab],
  );

  const showShared = tab === 'all' || tab === 'public' || tab === 'sources';
  const showPrivate = tab === 'all' || tab === 'private';
  const isSingleColumn = showShared !== showPrivate;
  const tabCounts: Record<MemoryTab, number> = {
    all: sharedMemories.length + privateMemories.length + weakPoints.length,
    public: sharedMemories.length,
    private: privateMemories.length + weakPoints.length,
    sources: sharedMemories.length,
  };
  const memoryViewControls = (
    <section className="rounded-[24px] border border-blue-200/90 bg-blue-50/75 p-3 shadow-[0_18px_50px_rgba(37,99,235,0.12)] dark:border-blue-300/20 dark:bg-blue-500/10 md:p-4">
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-normal text-blue-700 dark:text-blue-200">
            记忆视图
          </p>
          <h2 className="mt-1 text-base font-semibold text-slate-950 dark:text-white">
            选择要查看的记忆范围
          </h2>
        </div>
        <label className="flex h-10 min-w-0 items-center gap-2 rounded-2xl border border-blue-200/90 bg-white px-3 text-xs font-semibold text-slate-500 shadow-sm dark:border-white/10 dark:bg-black/20 dark:text-slate-400 md:w-80">
          <Search className="size-3.5 shrink-0" strokeWidth={1.8} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
            placeholder="搜索知识点、页面、私有记忆…"
          />
        </label>
      </div>
      <div
        role="tablist"
        aria-label="记忆分类"
        className="grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-4"
      >
        {tabItems.map((item) => {
          const active = tab === item.value;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.value)}
              className={cn(
                'min-h-16 rounded-2xl border px-3 py-2 text-left transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500',
                active
                  ? 'border-blue-600 bg-white text-blue-800 shadow-sm dark:border-blue-300 dark:bg-white dark:text-blue-950'
                  : 'border-blue-200/80 bg-white/55 text-slate-700 hover:border-blue-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-200 dark:hover:bg-white/[0.09]',
              )}
            >
              <span className="flex min-w-0 items-center justify-between gap-2">
                <span className="truncate text-sm font-bold">{item.label}</span>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums',
                    active
                      ? 'bg-blue-600 text-white dark:bg-blue-100 dark:text-blue-950'
                      : 'bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-100',
                  )}
                >
                  {tabCounts[item.value]}
                </span>
              </span>
              <span className="mt-1 block text-xs font-medium leading-5 opacity-80">
                {item.description}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );

  const archiveMemory = (memory: NotebookMemoryItem) => {
    updateNotebookPrivateMemoryStatus({
      stageId: memory.stageId,
      memoryId: memory.id,
      status: 'archived',
    });
    setRevision((value) => value + 1);
  };

  const deleteMemory = (memory: NotebookMemoryItem) => {
    deleteNotebookPrivateMemory({ stageId: memory.stageId, memoryId: memory.id });
    setRevision((value) => value + 1);
  };

  if (!notebookId) {
    return (
      <main className="flex min-h-full items-center justify-center bg-[#f3f6fb] p-6 dark:bg-[#0e1117]">
        <div className="max-w-md rounded-3xl border border-slate-200/80 bg-white/86 p-7 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/[0.06]">
          <Brain className="mx-auto size-10 text-slate-400" strokeWidth={1.5} />
          <h1 className="mt-4 text-lg font-semibold text-slate-950 dark:text-white">
            请选择笔记本
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
            进入某一本笔记本后，即可查看它的共有记忆和私有记忆。
          </p>
          <Link
            href="/my-courses"
            className="mt-5 inline-flex h-9 items-center justify-center rounded-xl bg-[#007AFF] px-4 text-sm font-semibold text-white"
          >
            返回我的课程
          </Link>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-full items-center justify-center bg-[#f3f6fb] p-6 dark:bg-[#0e1117]">
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/80 px-5 py-4 text-sm font-medium text-slate-500 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-300">
          <Loader2 className="size-4 animate-spin text-[#007AFF]" />
          正在读取笔记本记忆…
        </div>
      </main>
    );
  }

  if (!stage) {
    return (
      <main className="flex min-h-full items-center justify-center bg-[#f3f6fb] p-6 dark:bg-[#0e1117]">
        <div className="max-w-md rounded-3xl border border-slate-200/80 bg-white/86 p-7 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/[0.06]">
          <FileText className="mx-auto size-10 text-slate-400" strokeWidth={1.5} />
          <h1 className="mt-4 text-lg font-semibold text-slate-950 dark:text-white">
            未找到笔记本
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
            该笔记本可能已删除，或当前环境暂时无法加载它。
          </p>
          <Link
            href={resolvedBackHref}
            className="mt-5 inline-flex h-9 items-center justify-center rounded-xl bg-[#007AFF] px-4 text-sm font-semibold text-white"
          >
            返回
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-full bg-[#f3f6fb] text-slate-950 dark:bg-[#0e1117] dark:text-white">
      <div className="mx-auto flex w-full max-w-[86rem] flex-col gap-4 px-3 py-4 md:px-5 lg:px-6">
        <header className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <Link
              href={resolvedBackHref}
              className="inline-flex items-center gap-1 rounded-xl px-2 py-1 transition-colors hover:bg-white/80 hover:text-slate-950 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <ArrowLeft className="size-3.5" strokeWidth={1.8} />
              {backLabel}
            </Link>
            <span>/</span>
            <span className="truncate text-slate-800 dark:text-slate-100">笔记本记忆</span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={chatHref}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200/85 bg-white/82 px-3 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200 dark:hover:bg-white/[0.1]"
            >
              <MessageCircle className="size-3.5" strokeWidth={1.8} />
              打开聊天
            </Link>
            <Link
              href={`/classroom/${encodeURIComponent(stage.id)}`}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#007AFF] px-3 text-xs font-semibold text-white shadow-[0_10px_22px_rgba(0,122,255,0.24)] transition-colors hover:opacity-[0.92]"
            >
              <BookOpen className="size-3.5" strokeWidth={1.8} />
              进入笔记本
            </Link>
          </div>
        </header>

        {memoryViewControls}

        <section className="rounded-[24px] border border-white/80 bg-white/90 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/[0.03] dark:border-white/10 dark:bg-white/[0.065] md:p-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <div className="flex min-w-0 gap-4">
              <div className="relative flex size-20 shrink-0 items-center justify-center rounded-3xl border border-blue-200/80 bg-blue-50 text-xl font-bold text-blue-600 shadow-sm dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-200">
                {isImageAvatar(stage.avatarUrl) ? (
                  <img
                    src={stage.avatarUrl}
                    alt=""
                    className="size-full rounded-3xl object-cover"
                  />
                ) : (
                  <Brain className="size-8" strokeWidth={1.6} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <CircleDot className="size-3.5 text-emerald-600" strokeWidth={2} />
                    当前笔记本
                  </span>
                  <span>local-first memory</span>
                </div>
                <h1 className="mt-2 line-clamp-2 text-2xl font-semibold leading-tight tracking-normal text-slate-950 dark:text-white md:text-3xl">
                  {stage.name} 记忆
                </h1>
                {stage.description ? (
                  <p className="mt-2 line-clamp-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {stage.description}
                  </p>
                ) : null}
                {stage.tags && stage.tags.length > 0 ? (
                  <div className="mt-3 flex min-w-0 flex-wrap gap-1.5">
                    {stage.tags.slice(0, 8).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-blue-200/70 bg-blue-50/80 px-2.5 py-1 text-[11px] font-semibold text-blue-700 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-200"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { label: '共有记忆', value: sharedMemories.length, hint: 'Markdown 知识点' },
                { label: '私有记忆', value: privateMemories.length, hint: '学习状态' },
                { label: '待复习弱点', value: weakPoints.length, hint: 'open' },
              ].map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-2xl border border-slate-200/85 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-white/[0.045]"
                >
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    {metric.label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950 dark:text-white">
                    {metric.value}
                  </p>
                  <p className="mt-1 text-[10px] font-medium text-slate-400 dark:text-slate-500">
                    {metric.hint}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div
          className={cn(
            'grid min-h-0 gap-4',
            isSingleColumn
              ? 'grid-cols-1'
              : 'grid-cols-1 xl:grid-cols-[minmax(0,1.16fr)_minmax(22rem,0.84fr)]',
          )}
        >
          {showShared ? (
            <section className="min-w-0 overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/90 shadow-[0_18px_58px_rgba(15,23,42,0.07)] dark:border-white/10 dark:bg-white/[0.06]">
              <div className="flex min-w-0 items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-4 dark:border-white/10">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-200">
                    <Share2 className="size-5" strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-slate-950 dark:text-white">
                      {tab === 'sources' ? '来源页面' : '共有记忆'}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      以 Markdown 方式整理这本笔记本知道的知识点。
                    </p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-slate-200/80 bg-white/80 px-2.5 py-1 text-[11px] font-bold text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
                  {filteredShared.length} 条
                </span>
              </div>
              <div className="grid gap-3 p-3">
                {filteredShared.length > 0 ? (
                  <SharedMemoryMarkdownDocument markdown={sharedMarkdown} />
                ) : (
                  <EmptyState>
                    没有匹配的共有记忆。笔记本页面生成后会自动形成可查看的 Markdown 知识档案。
                  </EmptyState>
                )}
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-slate-200/80 px-4 py-3 text-[11px] text-slate-500 dark:border-white/10 dark:text-slate-400">
                <span>
                  共有记忆读取 publicMemories；没有显式记录时，才整理页面知识为 Markdown。
                </span>
                <span className="hidden font-semibold text-slate-700 dark:text-slate-200 sm:inline">
                  /classroom/{stage.id}/memory
                </span>
              </div>
            </section>
          ) : null}

          {showPrivate ? (
            <section className="min-w-0 overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/90 shadow-[0_18px_58px_rgba(15,23,42,0.07)] dark:border-white/10 dark:bg-white/[0.06]">
              <div className="flex min-w-0 items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-4 dark:border-white/10">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700 dark:bg-violet-500/12 dark:text-violet-200">
                    <Lock className="size-5" strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-slate-950 dark:text-white">
                      私有记忆
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      当前用户在这本笔记本里的学习习惯、卡点、错题和最近互动。
                    </p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-violet-200/80 bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700 dark:border-violet-400/20 dark:bg-violet-500/12 dark:text-violet-200">
                  仅自己可见
                </span>
              </div>
              <div className="grid gap-3 p-3">
                {conversationMemory &&
                (conversationMemory.lines.length > 0 || conversationMemory.sources.length > 0) ? (
                  <article className="rounded-2xl border border-blue-200/80 bg-blue-50/78 p-4 dark:border-blue-400/20 dark:bg-blue-500/10">
                    <div className="flex items-start gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-700 dark:text-blue-200">
                        <Clock3 className="size-4" strokeWidth={1.8} />
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-slate-950 dark:text-white">
                          {conversationMemory.title}
                        </h3>
                        <div className="mt-2 grid gap-1">
                          {conversationMemory.lines.map((line) => (
                            <p
                              key={line}
                              className="text-xs leading-5 text-blue-900/80 dark:text-blue-100/80"
                            >
                              {line}
                            </p>
                          ))}
                        </div>
                        <SourceChips sources={conversationMemory.sources} />
                      </div>
                    </div>
                  </article>
                ) : null}

                {filteredWeakPoints.length > 0
                  ? filteredWeakPoints.map((point) => (
                      <WeakPointCard key={point.id} point={point} />
                    ))
                  : null}

                {filteredPrivate.length > 0 ? (
                  filteredPrivate.map((memory) => (
                    <PrivateMemoryCard
                      key={memory.id}
                      memory={memory}
                      onArchive={archiveMemory}
                      onDelete={deleteMemory}
                    />
                  ))
                ) : filteredWeakPoints.length === 0 ? (
                  <EmptyState>
                    暂无私有长期记忆。明显学习断点、错题弱点或你明确要求记住时，会写入这里。
                  </EmptyState>
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-slate-200/80 px-4 py-3 text-[11px] text-slate-500 dark:border-white/10 dark:text-slate-400">
                <span>私有记忆沿用 privateMemories / weakPoints，不会自动改写页面内容。</span>
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  设置控制后台写入
                </span>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
