'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { code } from '@streamdown/code';
import { createMathPlugin } from '@streamdown/math';
import {
  Archive,
  BadgeCheck,
  Brain,
  CircleDot,
  Clock3,
  FileText,
  List,
  Loader2,
  Lock,
  Search,
  Share2,
  Shuffle,
  Target,
  Trash2,
} from 'lucide-react';
import { Streamdown } from 'streamdown';
import { cn } from '@/lib/utils';
import { MemoryListDetailLayout } from '@/components/memory/memory-list-detail-layout';
import {
  buildNotebookConversationTurns,
  type NotebookConversationTurn,
} from '@/components/memory/notebook-conversation-turns';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import {
  deleteNotebookPrivateMemory,
  getLocalStudyMemoryUserId,
  loadStudyMemory,
  STUDY_MEMORY_UPDATED_EVENT,
  updateNotebookPrivateMemoryStatus,
  type NotebookMemoryItem,
  type NotebookMemorySourceReference,
  type NotebookWorkingMemory,
  type WeakPointMemory,
} from '@/lib/learning/study-memory';
import { loadContactMessages } from '@/lib/utils/contact-chat-storage';
import { getCourse } from '@/lib/utils/course-storage';
import { loadStageData, loadStageMetadata } from '@/lib/utils/stage-storage';
import { listStudyMemoryRecords, type StudyMemoryApiRecord } from '@/lib/utils/study-memory-api';
import type { NotebookChatMessage } from '@/components/chat/chat-page-types';
import type { Scene, Stage } from '@/lib/types/stage';
import {
  MemoryBubbleMap,
  memoryBubbleBackgroundOptions,
  type MemoryBubbleBackgroundId,
  type MemoryBubbleMapRecord,
} from '@/components/memory/memory-bubble-map';

type MemoryTab = 'all' | 'working' | 'recent' | 'private' | 'public' | 'sources';
type MemoryDisplayMode = 'map' | 'list';

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
  derived: boolean;
  updatedAt?: number;
};

type ConversationMemory = {
  title: string;
  lines: string[];
  sources: NotebookMemorySourceReference[];
  turns: NotebookConversationTurn[];
  messageCount: number;
  turnCount: number;
  updatedAt?: number;
};

type MemoryListItem = {
  id: string;
  detailId: string;
  kind: MemoryBubbleMapRecord['kind'];
  kindLabel: string;
  title: string;
  text: string;
  sourceLabel?: string;
  sourceReferences?: NotebookMemorySourceReference[];
  updatedAt?: number;
  privateMemory?: NotebookMemoryItem;
};

const EMPTY_SCENES: Scene[] = [];
const markdownMath = createMathPlugin({ singleDollarTextMath: true });

const demoMemoryBubbleCountOptions = [1, 2, 3, 4, 5, 10, 20, 100, 250, 500, 1000] as const;

const demoMemoryBubbleTemplates: MemoryBubbleMapRecord[] = [
  {
    id: 'demo:recent',
    kind: 'recent',
    title: '本轮短期上下文',
    text: '静态注入只带当前会话最需要的近期摘要：最新问题、刚刚确认的意图，以及还没有写成长期记忆的临时线索。',
    sourceLabel: '静态上下文',
    metricLabel: '本轮',
  },
  ...[
    [
      'demo:fact:language',
      'preference.language = zh-CN',
      '用户偏好以后默认用中文回答。它是可覆盖的结构事实，不靠向量召回判断当前值。',
      '用户画像',
      '当前值',
    ],
    [
      'demo:fact:budget',
      'goal.budget = 8 万',
      '预算从 5 万更新到 8 万后，当前 prompt 只注入 8 万；旧值留在事件历史里用于解释。',
      '对话事实',
      '覆盖值',
    ],
    [
      'demo:fact:course-rule',
      'course.requirement = 先按老师模板证明',
      '课程级事实作为 notebook 的上层约束；如果笔记本有更具体要求，再由局部事实覆盖。',
      '课程事实',
      '规则',
    ],
    [
      'demo:fact:notebook-goal',
      'notebook.goal = 先补概念桥',
      '笔记本级目标会覆盖用户全局基线，用于当前课程讲义和题库检索。',
      '笔记本事实',
      '局部',
    ],
    [
      'demo:fact:conversation',
      'conversation.mode = 展示记忆图谱',
      '本轮对话只要求调整忆泡展示，不移除随机预览功能。',
      '会话事实',
      '临时',
    ],
  ].map<MemoryBubbleMapRecord>(([id, title, text, sourceLabel, metricLabel]) => ({
    id,
    kind: 'fact',
    title,
    text,
    sourceLabel,
    metricLabel,
  })),
  ...[
    [
      'demo:public:proof',
      '共有记忆：证明结构',
      '课程公共记忆保留老师反复要求的证明顺序、符号口径和讲解节奏。',
    ],
    [
      'demo:public:notation',
      '共有记忆：符号约定',
      '同一本笔记本内统一集合、映射、区间和变量命名，避免每页重新解释。',
    ],
    [
      'demo:public:lecture-pattern',
      '共有记忆：讲义生成经验',
      '成功案例会记录“先定义、再例题、再反例”的课程层经验，但仍低于结构事实优先级。',
    ],
    [
      'demo:public:summary',
      '共有记忆：近期章节摘要',
      '对话摘要和页面摘要可参与语义召回，用来补充当前事实没有覆盖的背景。',
    ],
  ].map<MemoryBubbleMapRecord>(([id, title, text]) => ({
    id,
    kind: 'public',
    title,
    text,
    sourceLabel: 'StudyMemory',
    metricLabel: '共有',
  })),
  ...[
    [
      'demo:source:problem-bank',
      '题库索引：群论标签',
      '题库进入知识索引层，先按 course / notebook / tag 过滤，再做向量排序。',
      '题库',
    ],
    [
      'demo:source:upload',
      '上传文件：Lecture PDF',
      'PDF、讲义和文件片段是动态发现来源，不承担当前真值。',
      '文件',
    ],
    [
      'demo:source:answers',
      '用户答案：错题证据',
      '用户答案用于定位薄弱点和相似题，不覆盖结构事实。',
      '答案',
    ],
    [
      'demo:source:conversation',
      '全量对话索引',
      '历史对话进入知识索引层；只有被抽取成 fact 的内容才是当前值。',
      '对话',
    ],
  ].map<MemoryBubbleMapRecord>(([id, title, text, sourceLabel]) => ({
    id,
    kind: 'source',
    title,
    text,
    sourceLabel,
    metricLabel: '来源',
  })),
  ...[
    [
      'demo:private:style',
      '学习偏好：先例题后抽象',
      '私有记忆记录个人学习习惯，帮助聊天先给可操作例子，再抽象归纳。',
    ],
    [
      'demo:private:format',
      '回复偏好：少解释架构术语',
      '偏好类私有记忆可以被升级为 fact；普通经验仍保留在 StudyMemory。',
    ],
    [
      'demo:private:success',
      '历史成功案例：先画区间',
      '成功案例用于相似任务参考，不作为可覆盖事实。',
    ],
    [
      'demo:private:failure',
      '历史失败案例：旧事实被向量顶上来',
      '失败案例提醒召回编排器把结构事实排在语义匹配之前。',
    ],
  ].map<MemoryBubbleMapRecord>(([id, title, text]) => ({
    id,
    kind: 'private',
    title,
    text,
    sourceLabel: '私有 StudyMemory',
    metricLabel: '私有',
  })),
  ...[
    [
      'demo:weak:substitution',
      '待复习弱点：换元边界',
      '相似题召回后优先提示上下限变化和变量替换条件。',
    ],
    ['demo:weak:proof', '待复习弱点：条件引用', '证明题容易漏写使用了哪个定义或定理。'],
    [
      'demo:weak:filter',
      '待复习弱点：标签过滤',
      '题库查询不能只靠语义相似，需要先按课程、标签和笔记本过滤。',
    ],
    [
      'demo:weak:current-truth',
      '待复习弱点：旧值干扰',
      '预算、语言、目标这类事实必须走结构层覆盖。',
    ],
  ].map<MemoryBubbleMapRecord>(([id, title, text]) => ({
    id,
    kind: 'weak',
    title,
    text,
    sourceLabel: '复习诊断',
    metricLabel: '待复习',
  })),
];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffleMemoryTemplates(records: MemoryBubbleMapRecord[]): MemoryBubbleMapRecord[] {
  const shuffled = records.slice();
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function createRandomDemoBubbleRecords(): MemoryBubbleMapRecord[] {
  const count = demoMemoryBubbleCountOptions[randomInt(0, demoMemoryBubbleCountOptions.length - 1)];
  const templates = shuffleMemoryTemplates(
    demoMemoryBubbleTemplates.filter((record) => record.kind !== 'recent'),
  );
  const createdAt = Date.now();

  return Array.from({ length: count }, (_, index) => {
    const base =
      index === 0 ? demoMemoryBubbleTemplates[0] : templates[(index - 1) % templates.length];
    const serial = index + 1;
    return {
      ...base,
      id: `${base.id}:${createdAt}:${serial}`,
      title:
        count > demoMemoryBubbleTemplates.length && base.kind !== 'recent'
          ? `${base.title} · ${serial}`
          : base.title,
      text:
        count > demoMemoryBubbleTemplates.length && base.kind !== 'recent'
          ? `${base.text}\n\n模拟召回批次：${serial} / ${count}。用于检查高密度记忆图谱的布局和聚合效果。`
          : base.text,
      accessCount:
        base.kind === 'recent'
          ? randomInt(36, 98)
          : base.kind === 'fact'
            ? randomInt(50, 96)
            : base.kind === 'source'
              ? randomInt(12, 72)
              : base.kind === 'weak'
                ? randomInt(8, 70)
                : base.kind === 'private'
                  ? randomInt(6, 82)
                  : randomInt(16, 88),
    };
  });
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

function stableNumber(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function estimatedAccessCount(seed: string, min: number, max: number): number {
  return min + (stableNumber(seed) % Math.max(1, max - min + 1));
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

function apiMemoryKindLabel(kind: string | null | undefined): string {
  if (kind === 'notebook_operational_guide') return '操作指南';
  if (kind === 'course_concept_card') return '课程总控';
  if (kind === 'notebook_concept_card') return '概念卡片';
  if (kind === 'manual') return '手动';
  return kind || '记忆';
}

function apiMemorySourceLabel(record: StudyMemoryApiRecord): string {
  if (record.kind === 'notebook_operational_guide') return '笔记本共有记忆';
  if (record.kind === 'course_concept_card') return '课程共有记忆';
  if (record.source === 'notebook_generation') return '数据库生成记忆';
  if (record.source === 'manual_queue_rewrite') return '数据库课程重写';
  if (record.source === 'manual') return '数据库手动记忆';
  return '数据库记忆';
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
    sourceLabel: apiMemorySourceLabel(record),
    sourceReferences: sourceReferencesFromApi(record),
    kindLabel: apiMemoryKindLabel(record.kind),
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
  const turns = buildNotebookConversationTurns(messages);
  const messageCount = recent.length;
  const turnCount = turns.length;
  const sources = turns
    .flatMap((turn) => turn.sourceReferences)
    .slice(-5)
    .map((reference) => ({
      order: reference.order,
      title: reference.title,
      why: reference.why,
    }));

  return {
    title: '最近互动原文',
    lines: [
      messageCount ? `最近 ${messageCount} 条消息已拆成 ${turnCount} 条互动原文。` : '',
      turnCount ? '列表中每条最近互动可单独查看完整问答。' : '',
    ].filter(Boolean),
    sources,
    turns,
    messageCount,
    turnCount,
    updatedAt: recent[recent.length - 1]?.at,
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

function SourceChips({
  className,
  sources,
}: {
  className?: string;
  sources: NotebookMemorySourceReference[];
}) {
  if (sources.length === 0) return null;
  return (
    <div className={cn('mt-3 flex min-w-0 flex-wrap gap-1.5', className)}>
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

function sourceMemoryId(source: NotebookMemorySourceReference): string {
  return `source:${source.order || 'x'}:${source.title}`;
}

function uniqueMemoryListItems(items: MemoryListItem[]): MemoryListItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.kind}:${item.detailId}:${item.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function conversationTurnSearchText(turn: NotebookConversationTurn): string {
  return `${turn.title} ${turn.preview} ${turn.text} ${turn.sourceReferences
    .map((source) => `${source.title} ${source.why || ''}`)
    .join(' ')}`;
}

function memoryListDetailHref(notebookId: string, item: MemoryListItem): string {
  return `/classroom/${encodeURIComponent(notebookId)}/memory/detail?memoryId=${encodeURIComponent(
    item.detailId,
  )}`;
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
      const updatedAt = formatTime(item.updatedAt);
      const meta = [item.sourceLabel, updatedAt ? `更新：${updatedAt}` : ''].filter(Boolean);
      if (meta.length > 0) {
        lines.push(`> ${meta.join(' · ')}`, '');
      }
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

function workingMemoryMarkdown(memory: NotebookWorkingMemory): string {
  const lines = [`# ${memory.title || '短期学习状态'}`, '', memory.summary];
  if (memory.currentTask) lines.push('', `- 当前任务：${memory.currentTask}`);
  if (memory.stuckPoint) lines.push(`- 当前卡点：${memory.stuckPoint}`);
  if (memory.masteredSignal) lines.push(`- 掌握信号：${memory.masteredSignal}`);
  if (memory.nextTeachingMove) lines.push(`- 下一步教学动作：${memory.nextTeachingMove}`);
  if (memory.recentAttempt) {
    const score = memory.recentAttempt.score != null ? `，得分 ${memory.recentAttempt.score}` : '';
    lines.push(
      '',
      `## 最近做题结果`,
      '',
      `- 题目：${memory.recentAttempt.problemTitle}`,
      `- 状态：${memory.recentAttempt.status}${score}`,
      memory.recentAttempt.feedback ? `- 反馈：${memory.recentAttempt.feedback}` : '',
    );
  }
  return lines.filter((line) => line !== '').join('\n');
}

function WorkingMemoryCard({ memory }: { memory: NotebookWorkingMemory }) {
  return (
    <article className="rounded-2xl border border-sky-200/80 bg-sky-50/78 p-4 dark:border-sky-400/20 dark:bg-sky-500/10">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-700 dark:text-sky-200">
          <Clock3 className="size-4" strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold text-sky-800 dark:text-sky-100">短期学习状态</p>
          <h3 className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">
            {memory.currentTask || memory.title}
          </h3>
          <p className="mt-2 line-clamp-4 text-xs leading-5 text-sky-900/80 dark:text-sky-100/80">
            {memory.stuckPoint || memory.masteredSignal || memory.summary}
          </p>
          {memory.nextTeachingMove ? (
            <p className="mt-2 text-xs leading-5 text-sky-900/75 dark:text-sky-100/75">
              下一步：{memory.nextTeachingMove}
            </p>
          ) : null}
          <p className="mt-2 text-[10px] font-medium text-sky-800/70 dark:text-sky-100/65">
            {formatTime(memory.updatedAt) || '刚刚更新'}
          </p>
        </div>
      </div>
    </article>
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

const memoryListToneStyles: Record<
  MemoryBubbleMapRecord['kind'],
  {
    label: string;
    icon: typeof Share2;
    bg: string;
    text: string;
    border: string;
    chip: string;
  }
> = {
  fact: {
    label: '事实',
    icon: BadgeCheck,
    bg: 'bg-cyan-50 dark:bg-cyan-500/12',
    text: 'text-cyan-800 dark:text-cyan-100',
    border: 'border-cyan-200/90 dark:border-cyan-300/20',
    chip: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-300/14 dark:text-cyan-100',
  },
  public: {
    label: '共有',
    icon: Share2,
    bg: 'bg-emerald-50 dark:bg-emerald-500/12',
    text: 'text-emerald-700 dark:text-emerald-100',
    border: 'border-emerald-200/90 dark:border-emerald-300/20',
    chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-300/14 dark:text-emerald-100',
  },
  private: {
    label: '私有',
    icon: Lock,
    bg: 'bg-violet-50 dark:bg-violet-500/12',
    text: 'text-violet-700 dark:text-violet-100',
    border: 'border-violet-200/90 dark:border-violet-300/20',
    chip: 'bg-violet-100 text-violet-700 dark:bg-violet-300/14 dark:text-violet-100',
  },
  weak: {
    label: '弱点',
    icon: Target,
    bg: 'bg-amber-50 dark:bg-amber-500/12',
    text: 'text-amber-800 dark:text-amber-100',
    border: 'border-amber-200/90 dark:border-amber-300/20',
    chip: 'bg-amber-100 text-amber-800 dark:bg-amber-300/14 dark:text-amber-100',
  },
  recent: {
    label: '最近',
    icon: Clock3,
    bg: 'bg-sky-50 dark:bg-sky-500/12',
    text: 'text-sky-700 dark:text-sky-100',
    border: 'border-sky-200/90 dark:border-sky-300/20',
    chip: 'bg-sky-100 text-sky-700 dark:bg-sky-300/14 dark:text-sky-100',
  },
  source: {
    label: '来源',
    icon: FileText,
    bg: 'bg-slate-50 dark:bg-white/[0.06]',
    text: 'text-slate-700 dark:text-slate-100',
    border: 'border-slate-200/90 dark:border-white/10',
    chip: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-200',
  },
};

function MemoryListDetailPanel({
  item,
  notebookId,
  onArchive,
  onDelete,
}: {
  item: MemoryListItem | null;
  notebookId: string;
  onArchive: (memory: NotebookMemoryItem) => void;
  onDelete: (memory: NotebookMemoryItem) => void;
}) {
  if (!item) {
    return (
      <section className="min-w-0 rounded-2xl border border-slate-200/80 bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.04]">
        <EmptyState>请选择左侧的一条记忆。</EmptyState>
      </section>
    );
  }

  const tone = memoryListToneStyles[item.kind];
  const Icon = tone.icon;
  const detailHref = memoryListDetailHref(notebookId, item);
  const time = formatTime(item.updatedAt);

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/85 bg-white/88 shadow-sm dark:border-white/10 dark:bg-white/[0.045]">
      <div className="flex min-w-0 flex-col gap-3 border-b border-slate-200/80 px-4 py-4 dark:border-white/10 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-2xl border',
              tone.bg,
              tone.text,
              tone.border,
            )}
          >
            <Icon className="size-4" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', tone.chip)}>
                {tone.label}
              </span>
              <span className="max-w-full truncate rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                {item.kindLabel}
              </span>
              {item.sourceLabel ? (
                <span className="max-w-full truncate rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                  {item.sourceLabel}
                </span>
              ) : null}
              {time ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                  {time}
                </span>
              ) : null}
            </div>
            <h3 className="mt-2 text-lg font-semibold leading-6 text-slate-950 dark:text-white">
              {item.title}
            </h3>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {item.privateMemory ? (
            <>
              <button
                type="button"
                className="inline-flex h-8 items-center justify-center gap-1 rounded-xl border border-slate-200/85 bg-white px-2.5 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200 dark:hover:bg-white/[0.1]"
                onClick={() => onArchive(item.privateMemory as NotebookMemoryItem)}
              >
                <Archive className="size-3.5" strokeWidth={1.8} />
                归档
              </button>
              <button
                type="button"
                className="inline-flex h-8 items-center justify-center gap-1 rounded-xl border border-red-100 bg-white px-2.5 text-xs font-semibold text-red-500 shadow-sm transition-colors hover:border-red-200 hover:bg-red-50 dark:border-red-300/15 dark:bg-white/[0.06] dark:text-red-200 dark:hover:bg-red-500/10"
                onClick={() => onDelete(item.privateMemory as NotebookMemoryItem)}
              >
                <Trash2 className="size-3.5" strokeWidth={1.8} />
                撤销
              </button>
            </>
          ) : null}
          <Link
            href={detailHref}
            className="inline-flex h-8 items-center justify-center rounded-xl border border-slate-200/85 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-blue-200 hover:text-blue-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200 dark:hover:bg-white/[0.1]"
          >
            详情页
          </Link>
        </div>
      </div>

      <div className="max-h-[68dvh] overflow-y-auto px-4 py-4">
        <Streamdown
          mode="static"
          plugins={{ code, math: markdownMath }}
          className={cn(
            'text-sm leading-7 text-slate-700 dark:text-slate-200',
            '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
            '[&_h1]:mb-4 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:leading-tight [&_h1]:text-slate-950 dark:[&_h1]:text-white',
            '[&_h2]:mb-3 [&_h2]:mt-7 [&_h2]:border-b [&_h2]:border-slate-200 [&_h2]:pb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-900 dark:[&_h2]:border-white/10 dark:[&_h2]:text-white',
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
          {normalizeMarkdownBody(item.text || '暂无正文。')}
        </Streamdown>
        <SourceChips sources={item.sourceReferences || []} />
      </div>
    </section>
  );
}

function MemoryListPanel({
  emptyMessage,
  items,
  notebookId,
  onArchive,
  onDelete,
  onSelectItem,
  selectedItemId,
  title,
}: {
  emptyMessage: string;
  items: MemoryListItem[];
  notebookId: string;
  onArchive: (memory: NotebookMemoryItem) => void;
  onDelete: (memory: NotebookMemoryItem) => void;
  onSelectItem: (itemId: string) => void;
  selectedItemId: string | null;
  title: string;
}) {
  return (
    <MemoryListDetailLayout
      emptyMessage={emptyMessage}
      items={items}
      onSelectItem={onSelectItem}
      selectedItemId={selectedItemId}
      title={title}
      renderItemMeta={(item) => {
        const tone = memoryListToneStyles[item.kind];
        const time = formatTime(item.updatedAt);
        return (
          <>
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', tone.chip)}>
              {tone.label}
            </span>
            <span className="max-w-full truncate rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
              {item.kindLabel}
            </span>
            {item.sourceLabel ? (
              <span className="max-w-full truncate rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                {item.sourceLabel}
              </span>
            ) : null}
            {time ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                {time}
              </span>
            ) : null}
          </>
        );
      }}
      renderDetail={(selectedItem) => (
        <MemoryListDetailPanel
          item={selectedItem}
          notebookId={notebookId}
          onArchive={onArchive}
          onDelete={onDelete}
        />
      )}
    />
  );
}

export function NotebookMemoryPageClient({ notebookId, backHref }: NotebookMemoryPageClientProps) {
  const storedCourseId = useCurrentCourseStore((s) => s.id);
  const storedCourseName = useCurrentCourseStore((s) => s.name);
  const setCurrentCourse = useCurrentCourseStore((s) => s.setCurrentCourse);
  const [loaded, setLoaded] = useState<LoadedNotebook | null>(null);
  const [tab, setTab] = useState<MemoryTab>('all');
  const [memoryDisplayMode, setMemoryDisplayMode] = useState<MemoryDisplayMode>('map');
  const [selectedMemoryListItemId, setSelectedMemoryListItemId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [revision, setRevision] = useState(0);
  const [dbMemories, setDbMemories] = useState<StudyMemoryApiRecord[]>([]);
  const [showMemoryDemo, setShowMemoryDemo] = useState(false);
  const [demoBubbleRecords, setDemoBubbleRecords] = useState<MemoryBubbleMapRecord[]>([]);
  const [bubbleBackgroundId, setBubbleBackgroundId] =
    useState<MemoryBubbleBackgroundId>('soft-aurora');
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

  useEffect(() => {
    const stageCourseId = stage?.courseId?.trim();
    if (!stageCourseId) return;
    if (storedCourseId === stageCourseId && storedCourseName) return;
    let cancelled = false;

    (async () => {
      const course = await getCourse(stageCourseId);
      if (cancelled || !course) return;
      setCurrentCourse({
        id: course.id,
        name: course.name,
        avatarUrl: course.avatarUrl,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [setCurrentCourse, stage?.courseId, storedCourseId, storedCourseName]);

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
  const workingMemory = profile?.workingMemory || null;

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
    if (stored.length > 0) return stored;
    const derived = scenes
      .slice()
      .sort((a, b) => a.order - b.order)
      .map(sharedMemoryFromScene)
      .filter((item) => item.text.trim() || item.title.trim());
    return derived;
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
  const bubbleRecords = useMemo<MemoryBubbleMapRecord[]>(() => {
    const weak = filteredWeakPoints.map<MemoryBubbleMapRecord>((point) => ({
      id: `weak:${point.id}`,
      kind: 'weak',
      title: point.title,
      text: point.reason,
      updatedAt: point.reviewedAt || point.createdAt,
      accessCount: estimatedAccessCount(`${point.id}:${point.questionId}`, 5, 48),
    }));

    const privateRecords = filteredPrivate.map<MemoryBubbleMapRecord>((memory) => ({
      id: `private:${memory.id}`,
      kind: 'private',
      title: memory.title,
      text: memory.text,
      updatedAt: memory.updatedAt,
      accessCount: memory.lastUsedAt
        ? estimatedAccessCount(`${memory.id}:used:${memory.lastUsedAt}`, 24, 92)
        : estimatedAccessCount(memory.id, 4, 58),
    }));

    const hasPrivateBranches = privateRecords.length > 0 || weak.length > 0;
    const recentText =
      conversationMemory?.lines.join('\n') ||
      (hasPrivateBranches
        ? `这里连接 ${privateRecords.length} 条私有记忆和 ${weak.length} 个待复习弱点。`
        : '最近的聊天脉络会在这里连接到私有记忆和待复习弱点。');
    const recent: MemoryBubbleMapRecord[] =
      (conversationMemory &&
        (conversationMemory.lines.length > 0 || conversationMemory.sources.length > 0)) ||
      hasPrivateBranches
        ? [
            {
              id: 'recent:conversation',
              kind: 'recent',
              title: conversationMemory?.title || '最近互动摘要',
              text: recentText,
              accessCount: estimatedAccessCount(`${notebookId || 'notebook'}:recent`, 38, 96),
            },
          ]
        : [];

    const shared = filteredShared.map<MemoryBubbleMapRecord>((item) => ({
      id: item.id,
      kind: 'public',
      title: item.title,
      text: item.text || item.title,
      updatedAt: item.updatedAt,
      accessCount: estimatedAccessCount(item.id, item.derived ? 2 : 8, item.derived ? 42 : 84),
    }));

    const sourceRecordsByKey = new Map<string, MemoryBubbleMapRecord>();
    for (const item of filteredShared) {
      for (const reference of item.sourceReferences || []) {
        const title = reference.title?.trim();
        if (!title) continue;
        const key = `${reference.order || 0}:${title}`;
        const existing = sourceRecordsByKey.get(key);
        const accessCount =
          (existing?.accessCount || 0) + estimatedAccessCount(`${item.id}:${key}`, 1, 12);
        sourceRecordsByKey.set(key, {
          id: `source:${reference.order || 0}:${stableNumber(title)}`,
          kind: 'source',
          title: reference.order ? `第 ${reference.order} 页 · ${title}` : title,
          text: [
            `知识来源节点：${title}`,
            '它用于解释共有记忆从哪里来；动态知识检索仍会先按课程、笔记本或标签过滤，再做语义排序。',
          ].join('\n\n'),
          sourceLabel: '知识索引层',
          sourceReferences: [reference],
          metricLabel: '来源',
          accessCount,
        });
      }
    }
    const sourceRecords = Array.from(sourceRecordsByKey.values());

    return [...recent, ...shared, ...sourceRecords, ...weak, ...privateRecords];
  }, [conversationMemory, filteredPrivate, filteredShared, filteredWeakPoints, notebookId]);
  const activeBubbleRecords = showMemoryDemo ? demoBubbleRecords : bubbleRecords;
  const mapStats = {
    total: activeBubbleRecords.length,
    fact: activeBubbleRecords.filter((record) => record.kind === 'fact').length,
    public: activeBubbleRecords.filter((record) => record.kind === 'public').length,
    source: activeBubbleRecords.filter((record) => record.kind === 'source').length,
    private: activeBubbleRecords.filter((record) => record.kind === 'private').length,
    weak: activeBubbleRecords.filter((record) => record.kind === 'weak').length,
  };

  const toggleMemoryDemo = () => {
    if (showMemoryDemo) {
      setShowMemoryDemo(false);
      return;
    }
    setTab('all');
    setMemoryDisplayMode('map');
    setQuery('');
    setDemoBubbleRecords(createRandomDemoBubbleRecords());
    setShowMemoryDemo(true);
  };
  const currentBubbleBackground =
    memoryBubbleBackgroundOptions.find((option) => option.id === bubbleBackgroundId) ||
    memoryBubbleBackgroundOptions[0];
  const randomizeBubbleBackground = () => {
    setBubbleBackgroundId((current) => {
      const candidates = memoryBubbleBackgroundOptions.filter((option) => option.id !== current);
      return candidates[randomInt(0, Math.max(0, candidates.length - 1))]?.id || 'soft-aurora';
    });
  };

  const showShared = tab === 'public' || tab === 'sources';
  const showPrivate = tab === 'working' || tab === 'recent' || tab === 'private';
  const showWorkingMemorySection = tab === 'working' || tab === 'private';
  const showRecentInteractionSection = tab === 'recent' || tab === 'private';
  const showLongPrivateSection = tab === 'private';
  const isSingleColumn = showShared !== showPrivate;
  const hasConversationMemory = Boolean(
    conversationMemory &&
    (conversationMemory.turns.length > 0 || conversationMemory.sources.length > 0),
  );
  const filteredWorkingMemoryCount =
    workingMemory && matchesSearch(workingMemoryMarkdown(workingMemory), query) ? 1 : 0;
  const filteredRecentTurnCount =
    conversationMemory?.turns.filter((turn) =>
      matchesSearch(conversationTurnSearchText(turn), query),
    ).length || 0;
  const filteredLongPrivateCount = filteredWeakPoints.length + filteredPrivate.length;
  const privatePanelTitle =
    tab === 'working' ? '短期学习状态' : tab === 'recent' ? '最近互动原文' : '长期私有记忆';
  const privatePanelSubtitle =
    tab === 'working'
      ? '后台任务写入的当前学习状态，会被新任务覆盖。'
      : tab === 'recent'
        ? '最近几轮用户和助手的完整原文，只用于查看上下文。'
        : '稳定的个人学习习惯、待复习弱点和长期私有记录。';
  const privatePanelCount =
    tab === 'working'
      ? filteredWorkingMemoryCount
      : tab === 'recent'
        ? filteredRecentTurnCount
        : filteredLongPrivateCount;
  const memoryListItems = useMemo<MemoryListItem[]>(() => {
    const items: MemoryListItem[] = [];
    const includeShared = tab === 'all' || tab === 'public' || tab === 'sources';
    const includeWorking = tab === 'all' || tab === 'working';
    const includeRecent = tab === 'all' || tab === 'recent';
    const includePrivate = tab === 'all' || tab === 'private';

    if (
      includeWorking &&
      workingMemory &&
      matchesSearch(workingMemoryMarkdown(workingMemory), query)
    ) {
      items.push({
        id: 'working-memory',
        detailId: 'working:local',
        kind: 'recent',
        kindLabel: '短期状态',
        title: workingMemory.title || '短期学习状态',
        text: workingMemoryMarkdown(workingMemory),
        sourceLabel: workingMemory.source === 'problem_attempt' ? '做题后更新' : '回复后更新',
        updatedAt: workingMemory.updatedAt,
      });
    }

    if (includeRecent && hasConversationMemory && conversationMemory) {
      for (const turn of conversationMemory.turns) {
        if (!matchesSearch(conversationTurnSearchText(turn), query)) {
          continue;
        }

        items.push({
          id: `recent-turn:${turn.id}`,
          detailId: `recent:turn:${turn.id}`,
          kind: 'recent',
          kindLabel: '互动原文',
          title: turn.title,
          text: turn.text,
          sourceLabel: '最近互动',
          sourceReferences: turn.sourceReferences,
          updatedAt: turn.updatedAt,
        });
      }
    }

    if (includeShared) {
      for (const item of filteredShared) {
        if (tab === 'sources') {
          if (item.derived) {
            items.push({
              id: `source-list:${item.id}`,
              detailId: item.id,
              kind: 'source',
              kindLabel: item.kindLabel,
              title: item.title,
              text: item.text || item.sourceLabel,
              sourceLabel: item.sourceLabel,
              sourceReferences: item.sourceReferences,
              updatedAt: item.updatedAt,
            });
            continue;
          }

          if (item.sourceReferences.length > 0) {
            for (const [index, source] of item.sourceReferences.entries()) {
              items.push({
                id: `source-list:${item.id}:${source.order}:${index}`,
                detailId: sourceMemoryId(source),
                kind: 'source',
                kindLabel: '来源页面',
                title: `第 ${source.order} 页 · ${source.title}`,
                text: source.why || item.text,
                sourceLabel: item.title,
                sourceReferences: [source],
                updatedAt: item.updatedAt,
              });
            }
            continue;
          }
        }

        items.push({
          id: `shared-list:${item.id}`,
          detailId: item.id,
          kind: item.derived ? 'source' : 'public',
          kindLabel: item.kindLabel,
          title: item.title,
          text: item.text,
          sourceLabel: item.sourceLabel,
          sourceReferences: item.sourceReferences,
          updatedAt: item.updatedAt,
        });
      }
    }

    if (includePrivate) {
      for (const point of filteredWeakPoints) {
        items.push({
          id: `weak-list:${point.id}`,
          detailId: `weak:${point.id}`,
          kind: 'weak',
          kindLabel: '待复习弱点',
          title: point.title,
          text: point.reason,
          sourceLabel: '待复习弱点',
          updatedAt: point.reviewedAt || point.createdAt,
        });
      }

      for (const memory of filteredPrivate) {
        items.push({
          id: `private-list:${memory.id}`,
          detailId: `private:${memory.id}`,
          kind: 'private',
          kindLabel: memoryKindLabel(memory),
          title: memory.title,
          text: memory.text,
          sourceLabel:
            memory.source === 'notebook_generation'
              ? '生成'
              : memory.source === 'manual'
                ? '手动'
                : memory.source === 'quiz'
                  ? '题库'
                  : '对话',
          sourceReferences: memory.sourceReferences || [],
          updatedAt: memory.updatedAt,
          privateMemory: memory,
        });
      }
    }

    return uniqueMemoryListItems(items).sort((a, b) => {
      const byTime = (b.updatedAt || 0) - (a.updatedAt || 0);
      if (byTime !== 0) return byTime;
      return a.title.localeCompare(b.title, 'zh-CN');
    });
  }, [
    conversationMemory,
    filteredPrivate,
    filteredShared,
    filteredWeakPoints,
    hasConversationMemory,
    query,
    tab,
    workingMemory,
  ]);

  const memoryListTitle =
    tab === 'working'
      ? '短期学习状态'
      : tab === 'recent'
        ? '最近互动原文'
        : tab === 'private'
          ? '长期私有记忆'
          : tab === 'public'
            ? '共有记忆列表'
            : tab === 'sources'
              ? '来源页面列表'
              : '全部记忆与上下文';
  const memoryListSubtitle =
    tab === 'working'
      ? '只显示异步写入的当前学习状态，不混入聊天原文。'
      : tab === 'recent'
        ? '只显示最近几轮完整问答原文，方便回看上下文。'
        : tab === 'private'
          ? '只显示长期私有记录和待复习弱点。'
          : tab === 'public'
            ? '只显示这本笔记本已经沉淀的共有知识。'
            : tab === 'sources'
              ? '只显示共有记忆背后的来源页面。'
              : '按分类和搜索结果查看这本笔记本的短期状态、原文互动和长期记忆。';
  const memoryScopeTabs: Array<{
    value: MemoryTab;
    label: string;
    count: number;
    icon: typeof Brain;
  }> = [
    {
      value: 'all',
      label: '全部',
      count:
        filteredWorkingMemoryCount +
        filteredRecentTurnCount +
        filteredLongPrivateCount +
        filteredShared.length,
      icon: Brain,
    },
    { value: 'working', label: '短期状态', count: filteredWorkingMemoryCount, icon: Clock3 },
    { value: 'recent', label: '最近互动', count: filteredRecentTurnCount, icon: Clock3 },
    { value: 'private', label: '长期私有', count: filteredLongPrivateCount, icon: Lock },
    { value: 'public', label: '共有', count: filteredShared.length, icon: Share2 },
    { value: 'sources', label: '来源', count: filteredShared.length, icon: FileText },
  ];
  const memoryViewControls = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="group"
          aria-label="显示方式"
          className="grid h-9 w-fit grid-cols-2 rounded-xl border border-slate-200/85 bg-slate-50/75 p-1 shadow-sm dark:border-white/10 dark:bg-black/20"
        >
          {[
            { value: 'map' as const, label: '忆泡', icon: CircleDot },
            { value: 'list' as const, label: '列表', icon: List },
          ].map((item) => {
            const Icon = item.icon;
            const active = memoryDisplayMode === item.value;
            return (
              <button
                key={item.value}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setTab('all');
                  setSelectedMemoryListItemId(null);
                  if (item.value === 'map') {
                    setQuery('');
                  } else {
                    setShowMemoryDemo(false);
                  }
                  setMemoryDisplayMode(item.value);
                }}
                className={cn(
                  'inline-flex min-w-[4.5rem] items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-colors',
                  active
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-white hover:text-blue-700 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white',
                )}
              >
                <Icon className="size-3.5" strokeWidth={1.9} />
                {item.label}
              </button>
            );
          })}
        </div>
        {memoryDisplayMode === 'list' ? (
          <label className="flex h-9 min-w-0 items-center gap-2 rounded-xl border border-slate-200/85 bg-slate-50/75 px-3 text-xs font-semibold text-slate-500 shadow-sm dark:border-white/10 dark:bg-black/20 dark:text-slate-400 md:w-72">
            <Search className="size-3.5 shrink-0" strokeWidth={1.8} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
              placeholder="搜索短期状态、互动原文、知识点…"
            />
          </label>
        ) : null}
      </div>
      {memoryDisplayMode === 'list' ? (
        <div
          role="tablist"
          aria-label="记忆分类"
          className="flex min-w-0 gap-1 overflow-x-auto rounded-xl border border-slate-200/85 bg-slate-50/75 p-1 shadow-sm dark:border-white/10 dark:bg-black/20"
        >
          {memoryScopeTabs.map((item) => {
            const Icon = item.icon;
            const active = tab === item.value;
            return (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setTab(item.value);
                  setShowMemoryDemo(false);
                  setSelectedMemoryListItemId(null);
                }}
                className={cn(
                  'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition-colors',
                  active
                    ? 'bg-white text-blue-700 shadow-sm ring-1 ring-blue-100 dark:bg-white/12 dark:text-white dark:ring-white/10'
                    : 'text-slate-500 hover:bg-white/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white',
                )}
              >
                <Icon className="size-3.5" strokeWidth={1.9} />
                <span>{item.label}</span>
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
                    active
                      ? 'bg-blue-50 text-blue-700 dark:bg-white/15 dark:text-white'
                      : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300',
                  )}
                >
                  {item.count}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
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
      <main className="min-h-full bg-[#f3f6fb] text-slate-950 dark:bg-[#0e1117] dark:text-white">
        <div className="mx-auto flex w-full max-w-[86rem] flex-col gap-4 px-3 py-4 md:px-5 lg:px-6">
          <div className="flex min-h-[20rem] items-center justify-center">
            <div className="max-w-md rounded-3xl border border-slate-200/80 bg-white/86 p-7 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/[0.06]">
              <Brain className="mx-auto size-10 text-slate-400" strokeWidth={1.5} />
              <h2 className="mt-4 text-lg font-semibold text-slate-950 dark:text-white">
                请选择笔记本
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                进入某一本笔记本后，即可查看它的共有记忆、短期状态和私有记忆。
              </p>
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

  if (loading) {
    return (
      <main className="min-h-full bg-[#f3f6fb] text-slate-950 dark:bg-[#0e1117] dark:text-white">
        <div className="mx-auto flex w-full max-w-[86rem] flex-col gap-4 px-3 py-4 md:px-5 lg:px-6">
          <div className="flex min-h-[20rem] items-center justify-center">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/80 px-5 py-4 text-sm font-medium text-slate-500 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-300">
              <Loader2 className="size-4 animate-spin text-[#007AFF]" />
              正在读取笔记本记忆…
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!stage) {
    return (
      <main className="min-h-full bg-[#f3f6fb] text-slate-950 dark:bg-[#0e1117] dark:text-white">
        <div className="mx-auto flex w-full max-w-[86rem] flex-col gap-4 px-3 py-4 md:px-5 lg:px-6">
          <div className="flex min-h-[20rem] items-center justify-center">
            <div className="max-w-md rounded-3xl border border-slate-200/80 bg-white/86 p-7 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/[0.06]">
              <FileText className="mx-auto size-10 text-slate-400" strokeWidth={1.5} />
              <h2 className="mt-4 text-lg font-semibold text-slate-950 dark:text-white">
                未找到笔记本
              </h2>
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
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-full bg-[#f3f6fb] text-slate-950 dark:bg-[#0e1117] dark:text-white">
      <div className="mx-auto flex w-full max-w-[86rem] flex-col gap-4 px-3 py-4 md:px-5 lg:px-6">
        <section
          aria-labelledby="memory-map-title"
          className="rounded-[22px] border border-slate-200/80 bg-white/86 px-4 py-3 shadow-[0_18px_52px_rgba(15,23,42,0.07)] ring-1 ring-slate-900/[0.03] dark:border-white/10 dark:bg-white/[0.06] md:px-5"
        >
          <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <h1
                id="memory-map-title"
                className="truncate text-xl font-semibold tracking-normal text-slate-950 dark:text-white md:text-2xl"
              >
                {memoryDisplayMode === 'list'
                  ? `${stage.name} · ${memoryListTitle}`
                  : `${stage.name} 记忆图谱${showMemoryDemo ? ' · Demo' : ''}`}
              </h1>
              <p className="mt-1 line-clamp-1 text-sm text-slate-500 dark:text-slate-400">
                {memoryDisplayMode === 'list'
                  ? memoryListSubtitle
                  : showMemoryDemo
                    ? `正在用 ${demoBubbleRecords.length} 个分层 mock 忆泡预览图谱效果，不写入真实数据。`
                    : '按分层记忆组织短期状态、共有记忆、知识来源和长期私有记忆。'}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-start gap-2 md:justify-end">
              <button
                type="button"
                onClick={randomizeBubbleBackground}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200/85 bg-white/86 px-3 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-blue-200 hover:text-blue-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200 dark:hover:bg-white/[0.1]"
                aria-label={`随机切换忆泡背景，当前背景：${currentBubbleBackground.label}`}
              >
                <Shuffle className="size-3.5" strokeWidth={2} />
                随机背景
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                  {currentBubbleBackground.label}
                </span>
              </button>
              <button
                type="button"
                aria-pressed={showMemoryDemo}
                onClick={toggleMemoryDemo}
                className={cn(
                  'inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold shadow-sm transition-colors',
                  showMemoryDemo
                    ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
                    : 'border-slate-200/85 bg-white/86 text-slate-700 hover:border-blue-200 hover:text-blue-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200 dark:hover:bg-white/[0.1]',
                )}
              >
                <CircleDot className="size-3.5" strokeWidth={2} />
                {showMemoryDemo ? '返回真实记忆' : '随机忆泡'}
              </button>
              <div className="grid grid-cols-3 gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-300">
                {(showMemoryDemo
                  ? [
                      { label: '事实', value: mapStats.fact },
                      { label: '来源', value: mapStats.source },
                      { label: '总数', value: mapStats.total },
                    ]
                  : [
                      { label: '共有', value: mapStats.public },
                      { label: '来源', value: mapStats.source },
                      { label: '弱点', value: mapStats.weak },
                    ]
                ).map((item) => (
                  <span
                    key={item.label}
                    className="flex min-w-16 items-center justify-center gap-1 rounded-xl border border-slate-200/80 bg-slate-50/80 px-2.5 py-1.5 dark:border-white/10 dark:bg-white/[0.05]"
                  >
                    <span>{item.label}</span>
                    <span className="font-bold tabular-nums text-slate-950 dark:text-white">
                      {item.value}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 border-t border-slate-200/75 pt-3 dark:border-white/10">
            {memoryViewControls}
          </div>
        </section>

        {tab === 'all' && memoryDisplayMode === 'map' ? (
          <MemoryBubbleMap backgroundId={bubbleBackgroundId} records={activeBubbleRecords} />
        ) : (
          <MemoryListPanel
            emptyMessage="没有匹配的记忆。"
            items={memoryListItems}
            notebookId={stage.id}
            onArchive={archiveMemory}
            onDelete={deleteMemory}
            onSelectItem={setSelectedMemoryListItemId}
            selectedItemId={selectedMemoryListItemId}
            title={memoryListTitle}
          />
        )}

        {tab !== 'all' && memoryDisplayMode !== 'list' ? (
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
                    共有记忆优先读取数据库 public 记录；没有显式记录时，才整理页面知识为 Markdown。
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
                        {privatePanelTitle}
                      </h2>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {privatePanelSubtitle}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full border border-violet-200/80 bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700 dark:border-violet-400/20 dark:bg-violet-500/12 dark:text-violet-200">
                    {privatePanelCount} 条
                  </span>
                </div>
                <div className="grid gap-3 p-3">
                  {showWorkingMemorySection && workingMemory ? (
                    <WorkingMemoryCard memory={workingMemory} />
                  ) : null}

                  {showRecentInteractionSection && conversationMemory?.turns.length ? (
                    <div className="grid gap-2 rounded-2xl border border-blue-200/80 bg-blue-50/78 p-3 dark:border-blue-400/20 dark:bg-blue-500/10">
                      <div className="flex items-center gap-2 px-1">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-700 dark:text-blue-200">
                          <Clock3 className="size-4" strokeWidth={1.8} />
                        </span>
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-slate-950 dark:text-white">
                            最近互动原文
                          </h3>
                          <p className="mt-0.5 text-xs text-blue-900/70 dark:text-blue-100/70">
                            最近 {conversationMemory.messageCount} 条消息拆成{' '}
                            {conversationMemory.turnCount} 条互动。
                          </p>
                        </div>
                      </div>
                      {conversationMemory.turns.map((turn) => (
                        <article
                          key={turn.id}
                          className="rounded-xl border border-blue-100/85 bg-white/74 p-3 dark:border-blue-300/15 dark:bg-black/18"
                        >
                          <p className="text-xs font-semibold leading-5 text-slate-950 dark:text-white">
                            {turn.title}
                          </p>
                          <p className="mt-1 line-clamp-3 text-xs leading-5 text-blue-900/80 dark:text-blue-100/80">
                            {turn.preview}
                          </p>
                          <SourceChips sources={turn.sourceReferences} />
                        </article>
                      ))}
                    </div>
                  ) : null}

                  {showLongPrivateSection && filteredWeakPoints.length > 0
                    ? filteredWeakPoints.map((point) => (
                        <WeakPointCard key={point.id} point={point} />
                      ))
                    : null}

                  {showLongPrivateSection && filteredPrivate.length > 0 ? (
                    filteredPrivate.map((memory) => (
                      <PrivateMemoryCard
                        key={memory.id}
                        memory={memory}
                        onArchive={archiveMemory}
                        onDelete={deleteMemory}
                      />
                    ))
                  ) : privatePanelCount === 0 ? (
                    <EmptyState>
                      {tab === 'working'
                        ? '暂无短期学习状态。回复或做题结果出现后，会由后台任务写入这里。'
                        : tab === 'recent'
                          ? '暂无最近互动原文。开始聊天后，这里会按轮次展示完整问答。'
                          : '暂无长期私有记忆。明显学习断点、错题弱点或你明确要求记住时，会写入这里。'}
                    </EmptyState>
                  ) : null}
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-slate-200/80 px-4 py-3 text-[11px] text-slate-500 dark:border-white/10 dark:text-slate-400">
                  <span>
                    短期状态、最近互动原文和长期私有记忆分开展示，避免把原文摘要当成记忆写入。
                  </span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    设置控制后台写入
                  </span>
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}
