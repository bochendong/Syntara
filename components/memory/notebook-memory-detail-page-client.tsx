'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  BookOpen,
  Brain,
  Clock3,
  FileText,
  Loader2,
  Lock,
  MessageCircle,
  Share2,
  Target,
} from 'lucide-react';
import { MemoryPageHeader } from '@/components/memory/memory-page-header';
import { findNotebookConversationTurn } from '@/components/memory/notebook-conversation-turns';
import { cn } from '@/lib/utils';
import {
  getLocalStudyMemoryUserId,
  loadStudyMemory,
  type NotebookMemoryItem,
  type NotebookMemorySourceReference,
  type NotebookWorkingMemory,
  type StudyMemoryProfile,
  type WeakPointMemory,
} from '@/lib/learning/study-memory';
import { loadContactMessages } from '@/lib/utils/contact-chat-storage';
import { loadStageData, loadStageMetadata } from '@/lib/utils/stage-storage';
import { listStudyMemoryRecords, type StudyMemoryApiRecord } from '@/lib/utils/study-memory-api';
import type { NotebookChatMessage } from '@/components/chat/chat-page-types';
import type { Scene, Stage } from '@/lib/types/stage';

type MemoryBubbleKind = 'fact' | 'public' | 'private' | 'weak' | 'recent' | 'source';

type NotebookMemoryDetailPageClientProps = {
  notebookId?: string | null;
  memoryId?: string | null;
};

type DetailRelatedItem = {
  label: string;
  title: string;
  text?: string;
};

type DetailRecord = {
  id: string;
  kind: MemoryBubbleKind;
  kindLabel: string;
  title: string;
  text: string;
  sourceLabel?: string;
  sourceReferences: NotebookMemorySourceReference[];
  updatedAt?: number;
  reason?: string | null;
  question?: string | null;
  relatedItems?: DetailRelatedItem[];
};

type DetailLoadState = {
  loading: boolean;
  requestKey?: string;
  stage: Stage | null;
  record: DetailRecord | null;
  error?: string;
};

const EMPTY_STATE: DetailLoadState = {
  loading: true,
  stage: null,
  record: null,
};

const toneStyles: Record<
  MemoryBubbleKind,
  {
    label: string;
    icon: typeof Share2;
    bg: string;
    text: string;
    chip: string;
    border: string;
  }
> = {
  fact: {
    label: '事实',
    icon: BadgeCheck,
    bg: 'bg-cyan-50 dark:bg-cyan-500/12',
    text: 'text-cyan-800 dark:text-cyan-100',
    chip: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-300/14 dark:text-cyan-100',
    border: 'border-cyan-200/90 dark:border-cyan-300/20',
  },
  public: {
    label: '公共',
    icon: Share2,
    bg: 'bg-emerald-50 dark:bg-emerald-500/12',
    text: 'text-emerald-700 dark:text-emerald-100',
    chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-300/14 dark:text-emerald-100',
    border: 'border-emerald-200/90 dark:border-emerald-300/20',
  },
  private: {
    label: '私有',
    icon: Lock,
    bg: 'bg-violet-50 dark:bg-violet-500/12',
    text: 'text-violet-700 dark:text-violet-100',
    chip: 'bg-violet-100 text-violet-700 dark:bg-violet-300/14 dark:text-violet-100',
    border: 'border-violet-200/90 dark:border-violet-300/20',
  },
  weak: {
    label: '弱点',
    icon: Target,
    bg: 'bg-amber-50 dark:bg-amber-500/12',
    text: 'text-amber-800 dark:text-amber-100',
    chip: 'bg-amber-100 text-amber-800 dark:bg-amber-300/14 dark:text-amber-100',
    border: 'border-amber-200/90 dark:border-amber-300/20',
  },
  recent: {
    label: '最近',
    icon: Clock3,
    bg: 'bg-sky-50 dark:bg-sky-500/12',
    text: 'text-sky-700 dark:text-sky-100',
    chip: 'bg-sky-100 text-sky-700 dark:bg-sky-300/14 dark:text-sky-100',
    border: 'border-sky-200/90 dark:border-sky-300/20',
  },
  source: {
    label: '来源',
    icon: FileText,
    bg: 'bg-slate-50 dark:bg-white/[0.06]',
    text: 'text-slate-700 dark:text-slate-100',
    chip: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-200',
    border: 'border-slate-200/90 dark:border-white/10',
  },
};

function detailKindDisplayLabel(kind: MemoryBubbleKind): string {
  if (kind === 'fact') return '结构事实';
  if (kind === 'source') return '知识来源';
  if (kind === 'recent') return '短期上下文';
  if (kind === 'weak') return '待复习弱点';
  if (kind === 'private') return '私有记忆';
  return '共有记忆';
}

function formatTime(value?: number): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
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
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function compactText(input: string, maxLength: number): string {
  const text = stripHtml(input).replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function normalizeBody(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
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

function memoryKindLabel(memory: NotebookMemoryItem): string {
  if (memory.kind === 'mistake') return '错题';
  if (memory.kind === 'preference') return '偏好';
  if (memory.kind === 'reflection') return '反思';
  if (memory.kind === 'manual') return '手动';
  return '知识缺口';
}

function localMemorySourceLabel(memory: NotebookMemoryItem): string {
  if (memory.source === 'notebook_generation') return '生成记忆';
  if (memory.source === 'manual') return '手动记忆';
  if (memory.source === 'quiz') return '题库记忆';
  return '聊天记忆';
}

function apiMemorySourceLabel(record: StudyMemoryApiRecord): string {
  if (record.source === 'notebook_generation') return '数据库生成记忆';
  if (record.source === 'manual_queue_rewrite') return '数据库课程重写';
  if (record.source === 'manual') return '数据库手动记忆';
  return '数据库记忆';
}

function detailFromApiMemory(record: StudyMemoryApiRecord): DetailRecord {
  return {
    id: `db:${record.id}`,
    kind: record.scope === 'private' ? 'private' : 'public',
    kindLabel: record.kind || (record.scope === 'private' ? '私有记忆' : '共有记忆'),
    title: record.title,
    text: normalizeBody(record.text || ''),
    sourceLabel: apiMemorySourceLabel(record),
    sourceReferences: sourceReferencesFromApi(record),
    updatedAt: Date.parse(record.updatedAt),
    reason: record.reason,
    question: record.question,
  };
}

function detailFromLocalMemory(memory: NotebookMemoryItem, kind: MemoryBubbleKind): DetailRecord {
  return {
    id: kind === 'private' ? `private:${memory.id}` : `stored:${memory.id}`,
    kind,
    kindLabel: memoryKindLabel(memory),
    title: memory.title,
    text: normalizeBody(memory.text || ''),
    sourceLabel: localMemorySourceLabel(memory),
    sourceReferences: memory.sourceReferences || [],
    updatedAt: memory.updatedAt,
    reason: memory.reason,
    question: memory.question,
  };
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
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (typeof item === 'string' && item.trim()) {
        lines.push(item.trim());
      } else if (item && typeof item === 'object') {
        const itemRecord = item as Record<string, unknown>;
        const text = [itemRecord.title, itemRecord.expression, itemRecord.explanation]
          .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
          .join(' ');
        if (text.trim()) lines.push(text.trim());
      }
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

function sceneTypeLabel(scene: Scene): string {
  if (scene.type === 'quiz') return '题库练习';
  if (scene.type === 'interactive') return '互动页';
  if (scene.type === 'pbl') return '项目页';
  if (scene.type === 'markdown') return 'Markdown 页面';
  return '课件页';
}

function sceneBody(scene: Scene): string {
  if (scene.content.type === 'slide') {
    const chunks: string[] = [];
    if (scene.content.syntaraMarkup?.trim()) {
      chunks.push(scene.content.syntaraMarkup.trim());
    }

    const semanticText = (scene.content.semanticDocument?.blocks || [])
      .flatMap(collectBlockText)
      .join('\n');
    if (semanticText.trim()) chunks.push(semanticText.trim());

    const canvasText = scene.content.canvas.elements
      .filter((element) => element.type === 'text')
      .map((element) => (element as { content?: string }).content || '')
      .filter(Boolean)
      .join('\n');
    if (canvasText.trim()) chunks.push(stripHtml(canvasText));

    return normalizeBody(Array.from(new Set(chunks)).join('\n\n') || scene.title);
  }

  if (scene.content.type === 'markdown') {
    return normalizeBody(scene.content.markdown || scene.content.summary || scene.title);
  }

  if (scene.content.type === 'quiz') {
    const lines = scene.content.questions.map((question, index) => {
      const answer = question.answer || question.correctAnswer;
      const answerText = Array.isArray(answer) ? answer.join(', ') : answer;
      return [
        `${index + 1}. ${question.question}`,
        answerText ? `答案：${answerText}` : '',
        question.analysis || question.explanation
          ? `解析：${question.analysis || question.explanation}`
          : '',
      ]
        .filter(Boolean)
        .join('\n');
    });
    return normalizeBody(lines.join('\n\n') || scene.title);
  }

  if (scene.content.type === 'interactive') {
    return normalizeBody([scene.content.url, scene.content.html].filter(Boolean).join('\n\n'));
  }

  if (scene.content.type === 'pbl') {
    return normalizeBody(scene.content.projectConfig?.projectInfo?.description || scene.title);
  }

  return scene.title;
}

function detailFromScene(scene: Scene): DetailRecord {
  const order = scene.order + 1;
  const title = scene.title?.trim() || `第 ${order} 页`;
  return {
    id: `scene:${scene.id}`,
    kind: 'source',
    kindLabel: sceneTypeLabel(scene),
    title,
    text: sceneBody(scene),
    sourceLabel: `第 ${order} 页 · ${sceneTypeLabel(scene)}`,
    sourceReferences: [{ order, title }],
    updatedAt: scene.updatedAt || scene.createdAt,
  };
}

function detailFromWeakPoint(point: WeakPointMemory, scenes: Scene[]): DetailRecord {
  const scene = scenes.find((item) => item.id === point.sceneId);
  return {
    id: `weak:${point.id}`,
    kind: 'weak',
    kindLabel: '待复习弱点',
    title: point.title,
    text: normalizeBody(point.reason),
    sourceLabel: scene ? `${sceneTypeLabel(scene)} · ${scene.title}` : '待复习弱点',
    sourceReferences: scene
      ? [
          {
            order: scene.order + 1,
            title: scene.title || point.title,
            why: point.questionId ? `关联题目：${point.questionId}` : undefined,
          },
        ]
      : [],
    updatedAt: point.reviewedAt || point.createdAt,
    relatedItems: scene
      ? [
          {
            label: '关联页面',
            title: scene.title,
            text: compactText(sceneBody(scene), 180),
          },
        ]
      : undefined,
  };
}

function detailFromConversation(messages: NotebookChatMessage[]): DetailRecord {
  const recent = messages.slice(-10);
  const userCount = recent.filter((message) => message.role === 'user').length;
  const assistantCount = recent.filter((message) => message.role === 'assistant').length;
  const turnCount = Math.max(userCount, assistantCount);
  const sourceReferences = recent
    .flatMap((message) => (message.role === 'assistant' ? message.references || [] : []))
    .slice(-8)
    .map((reference) => ({
      order: reference.order,
      title: reference.title,
      why: reference.why,
    }));
  const lines = recent.flatMap((message) => {
    if (message.role === 'user') {
      return [`用户：${message.text}`];
    }
    return [
      `助手：${message.answer}`,
      message.knowledgeGap ? '学习缺口：本轮出现了可长期记住的学习缺口。' : '',
    ].filter(Boolean);
  });
  const intro = recent.length
    ? [
        `摘要说明：这是最近互动的短期摘要，不是长期私有记忆；这里展示最近 ${recent.length} 条消息，约 ${turnCount} 轮互动。`,
        '长期私有记忆会单独出现在“私有长期记忆”，通常来自明确学习断点、错题弱点或手动记录。',
      ]
    : [];

  return {
    id: 'recent:conversation',
    kind: 'recent',
    kindLabel: '短期摘要',
    title: '最近互动摘要',
    text: normalizeBody([...intro, ...lines].join('\n\n') || '暂无最近聊天内容。'),
    sourceLabel: '最近互动',
    sourceReferences,
    updatedAt: recent.at(-1)?.at,
  };
}

function detailFromConversationTurn(
  messages: NotebookChatMessage[],
  turnId: string,
): DetailRecord | null {
  const turn = findNotebookConversationTurn(messages, turnId);
  if (!turn) return null;
  return {
    id: `recent:turn:${turn.id}`,
    kind: 'recent',
    kindLabel: '互动原文',
    title: turn.title,
    text: normalizeBody(turn.text),
    sourceLabel: '最近互动',
    sourceReferences: turn.sourceReferences,
    updatedAt: turn.updatedAt,
  };
}

function workingMemoryText(memory: NotebookWorkingMemory): string {
  const lines = [`# ${memory.title || '短期学习状态'}`, '', memory.summary];
  if (memory.currentTask) lines.push('', `- 当前任务：${memory.currentTask}`);
  if (memory.stuckPoint) lines.push(`- 当前卡点：${memory.stuckPoint}`);
  if (memory.masteredSignal) lines.push(`- 掌握信号：${memory.masteredSignal}`);
  if (memory.nextTeachingMove) lines.push(`- 下一步教学动作：${memory.nextTeachingMove}`);
  if (memory.recentAttempt) {
    const score = memory.recentAttempt.score != null ? `，得分 ${memory.recentAttempt.score}` : '';
    lines.push(
      '',
      '## 最近做题结果',
      '',
      `- 题目：${memory.recentAttempt.problemTitle}`,
      `- 状态：${memory.recentAttempt.status}${score}`,
      memory.recentAttempt.feedback ? `- 反馈：${memory.recentAttempt.feedback}` : '',
    );
  }
  return normalizeBody(lines.join('\n'));
}

function detailFromWorkingMemory(memory?: NotebookWorkingMemory): DetailRecord | null {
  if (!memory) return null;
  return {
    id: 'working:local',
    kind: 'recent',
    kindLabel: '短期状态',
    title: memory.title || '短期学习状态',
    text: workingMemoryText(memory),
    sourceLabel: memory.source === 'problem_attempt' ? '做题后更新' : '回复后更新',
    sourceReferences: [],
    updatedAt: memory.updatedAt,
  };
}

function parseSourceMemoryId(memoryId: string): { order?: number; title: string } | null {
  if (!memoryId.startsWith('source:')) return null;
  const [, rawOrder, ...titleParts] = memoryId.split(':');
  const title = titleParts.join(':').trim();
  const order = rawOrder && rawOrder !== 'x' ? Number(rawOrder) : undefined;
  return {
    order: Number.isFinite(order) ? order : undefined,
    title,
  };
}

function referenceMatches(
  reference: NotebookMemorySourceReference,
  parsed: { order?: number; title: string },
): boolean {
  const normalizedReferenceTitle = reference.title.trim().toLowerCase();
  const normalizedTargetTitle = parsed.title.trim().toLowerCase();
  const orderMatches = parsed.order === undefined || reference.order === parsed.order;
  if (!orderMatches) return false;
  if (!normalizedTargetTitle) return true;
  return (
    normalizedReferenceTitle === normalizedTargetTitle ||
    normalizedReferenceTitle.includes(normalizedTargetTitle) ||
    normalizedTargetTitle.includes(normalizedReferenceTitle)
  );
}

function sourceDetailFromReferences(args: {
  memoryId: string;
  dbMemories: StudyMemoryApiRecord[];
  profile: StudyMemoryProfile;
  scenes: Scene[];
  messages: NotebookChatMessage[];
}): DetailRecord | null {
  const parsed = parseSourceMemoryId(args.memoryId);
  if (!parsed) return null;
  const parsedSource = parsed;

  const relatedItems: DetailRelatedItem[] = [];
  const sourceReferences: NotebookMemorySourceReference[] = [];

  function collect(
    label: string,
    title: string,
    text: string,
    references: NotebookMemorySourceReference[],
  ) {
    const matched = references.filter((reference) => referenceMatches(reference, parsedSource));
    if (matched.length === 0) return;
    sourceReferences.push(...matched);
    relatedItems.push({ label, title, text: compactText(text, 220) });
  }

  for (const memory of args.dbMemories) {
    collect(
      apiMemorySourceLabel(memory),
      memory.title,
      memory.text,
      sourceReferencesFromApi(memory),
    );
  }
  for (const memory of args.profile.publicMemories) {
    collect(
      localMemorySourceLabel(memory),
      memory.title,
      memory.text,
      memory.sourceReferences || [],
    );
  }
  for (const memory of args.profile.privateMemories) {
    collect(
      localMemorySourceLabel(memory),
      memory.title,
      memory.text,
      memory.sourceReferences || [],
    );
  }

  for (const message of args.messages) {
    if (message.role !== 'assistant') continue;
    collect('最近回答', '聊天引用', message.answer, message.references || []);
  }

  const scene =
    args.scenes.find((item) => parsed.order !== undefined && item.order + 1 === parsed.order) ||
    args.scenes.find((item) => item.title.trim().toLowerCase() === parsed.title.toLowerCase());
  const matchedScene = scene ? detailFromScene(scene) : null;
  const firstReference = sourceReferences[0];
  const title =
    parsed.order !== undefined
      ? `第 ${parsed.order} 页`
      : firstReference?.title || parsed.title || '来源页面';
  const body = [
    firstReference?.why ? `引用说明：${firstReference.why}` : '',
    matchedScene?.text || '',
    relatedItems.length > 0
      ? [
          '相关记忆：',
          ...relatedItems.map((item) => `- ${item.label} · ${item.title}\n  ${item.text || ''}`),
        ].join('\n')
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  if (!body.trim() && !parsed.title) return null;

  return {
    id: args.memoryId,
    kind: 'source',
    kindLabel: '来源节点',
    title,
    text: normalizeBody(body || parsed.title),
    sourceLabel: firstReference?.title || matchedScene?.sourceLabel || parsed.title,
    sourceReferences:
      sourceReferences.length > 0
        ? sourceReferences
        : matchedScene?.sourceReferences || (parsed.order ? [{ order: parsed.order, title }] : []),
    updatedAt: matchedScene?.updatedAt,
    relatedItems,
  };
}

function resolveDetailRecord(args: {
  memoryId: string;
  dbMemories: StudyMemoryApiRecord[];
  profile: StudyMemoryProfile;
  scenes: Scene[];
  messages: NotebookChatMessage[];
}): DetailRecord | null {
  const { memoryId, dbMemories, profile, scenes, messages } = args;
  if (memoryId === 'working:local') return detailFromWorkingMemory(profile.workingMemory);
  if (memoryId === 'recent:conversation') return detailFromConversation(messages);
  if (memoryId.startsWith('recent:turn:')) {
    return detailFromConversationTurn(messages, memoryId.slice('recent:turn:'.length));
  }

  if (memoryId.startsWith('db:')) {
    const id = memoryId.slice('db:'.length);
    const record = dbMemories.find((item) => item.id === id);
    return record ? detailFromApiMemory(record) : null;
  }

  if (memoryId.startsWith('stored:')) {
    const id = memoryId.slice('stored:'.length);
    const memory = profile.publicMemories.find((item) => item.id === id);
    return memory ? detailFromLocalMemory(memory, 'public') : null;
  }

  if (memoryId.startsWith('private:')) {
    const id = memoryId.slice('private:'.length);
    const memory = profile.privateMemories.find((item) => item.id === id);
    return memory ? detailFromLocalMemory(memory, 'private') : null;
  }

  if (memoryId.startsWith('weak:')) {
    const id = memoryId.slice('weak:'.length);
    const point = profile.weakPoints.find((item) => item.id === id);
    return point ? detailFromWeakPoint(point, scenes) : null;
  }

  if (memoryId.startsWith('scene:')) {
    const id = memoryId.slice('scene:'.length);
    const scene = scenes.find((item) => item.id === id);
    return scene ? detailFromScene(scene) : null;
  }

  if (memoryId.startsWith('source:')) {
    return sourceDetailFromReferences({ memoryId, dbMemories, profile, scenes, messages });
  }

  const directApiRecord = dbMemories.find((item) => item.id === memoryId);
  if (directApiRecord) return detailFromApiMemory(directApiRecord);
  return null;
}

function SourceChips({ sources }: { sources: NotebookMemorySourceReference[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      {sources.slice(0, 12).map((source, index) => (
        <span
          key={`${source.order}:${source.title}:${index}`}
          className="max-w-full truncate rounded-lg border border-slate-200/80 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:border-white/10 dark:bg-white/[0.055] dark:text-slate-300"
          title={source.why || source.title}
        >
          第 {source.order} 页 · {source.title}
        </span>
      ))}
    </div>
  );
}

function DetailBody({ record }: { record: DetailRecord }) {
  const tone = toneStyles[record.kind];
  const Icon = tone.icon;
  const time = formatTime(record.updatedAt);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="min-w-0 overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/92 shadow-[0_24px_80px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/[0.03] dark:border-white/10 dark:bg-white/[0.065]">
        <div className="border-b border-slate-200/80 p-5 dark:border-white/10">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                'flex size-11 shrink-0 items-center justify-center rounded-2xl border',
                tone.bg,
                tone.text,
                tone.border,
              )}
            >
              <Icon className="size-5" strokeWidth={1.8} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-bold', tone.chip)}>
                  {detailKindDisplayLabel(record.kind)}
                </span>
                <span className="max-w-full truncate rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                  {record.kindLabel}
                </span>
              </div>
              <h1 className="mt-3 text-2xl font-semibold leading-tight tracking-normal text-slate-950 dark:text-white md:text-3xl">
                {record.title}
              </h1>
              {record.sourceLabel || time ? (
                <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                  {[record.sourceLabel, time ? `更新于 ${time}` : ''].filter(Boolean).join(' · ')}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="p-5">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-normal text-slate-400 dark:text-slate-500">
            记忆原文
          </p>
          <pre className="max-h-[58dvh] min-h-[18rem] overflow-auto whitespace-pre-wrap rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 font-sans text-sm leading-7 text-slate-700 shadow-inner dark:border-white/10 dark:bg-black/18 dark:text-slate-200">
            {record.text || '暂无正文。'}
          </pre>
        </div>
      </section>

      <aside className="grid content-start gap-3">
        <section className="rounded-[22px] border border-slate-200/80 bg-white/86 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.055]">
          <h2 className="text-sm font-semibold text-slate-950 dark:text-white">记忆元数据</h2>
          <dl className="mt-3 grid gap-2 text-xs">
            <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/[0.045]">
              <dt className="font-semibold text-slate-500 dark:text-slate-400">ID</dt>
              <dd className="min-w-0 truncate font-mono text-[11px] text-slate-700 dark:text-slate-200">
                {record.id}
              </dd>
            </div>
            {time ? (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/[0.045]">
                <dt className="font-semibold text-slate-500 dark:text-slate-400">更新时间</dt>
                <dd className="text-right font-semibold text-slate-800 dark:text-slate-100">
                  {time}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>

        {record.question || record.reason ? (
          <section className="rounded-[22px] border border-slate-200/80 bg-white/86 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.055]">
            <h2 className="text-sm font-semibold text-slate-950 dark:text-white">写入上下文</h2>
            {record.question ? (
              <p className="mt-3 text-xs leading-5 text-slate-600 dark:text-slate-300">
                {record.question}
              </p>
            ) : null}
            {record.reason ? (
              <p className="mt-3 text-xs leading-5 text-slate-600 dark:text-slate-300">
                {record.reason}
              </p>
            ) : null}
          </section>
        ) : null}

        {record.sourceReferences.length > 0 ? (
          <section className="rounded-[22px] border border-slate-200/80 bg-white/86 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.055]">
            <h2 className="mb-3 text-sm font-semibold text-slate-950 dark:text-white">来源页面</h2>
            <SourceChips sources={record.sourceReferences} />
          </section>
        ) : null}

        {record.relatedItems?.length ? (
          <section className="rounded-[22px] border border-slate-200/80 bg-white/86 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.055]">
            <h2 className="text-sm font-semibold text-slate-950 dark:text-white">相关记忆</h2>
            <div className="mt-3 grid gap-2">
              {record.relatedItems.slice(0, 6).map((item, index) => (
                <article
                  key={`${item.label}:${item.title}:${index}`}
                  className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-white/[0.045]"
                >
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                    {item.label}
                  </p>
                  <h3 className="mt-1 text-xs font-semibold text-slate-900 dark:text-white">
                    {item.title}
                  </h3>
                  {item.text ? (
                    <p className="mt-1 line-clamp-3 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                      {item.text}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </aside>
    </div>
  );
}

export function NotebookMemoryDetailPageClient({
  notebookId,
  memoryId,
}: NotebookMemoryDetailPageClientProps) {
  const [state, setState] = useState<DetailLoadState>(EMPTY_STATE);
  const requestKey = `${notebookId || ''}:${memoryId || ''}`;

  useEffect(() => {
    if (!notebookId || !memoryId) return;

    let alive = true;
    const currentNotebookId = notebookId;
    const currentMemoryId = memoryId;
    const currentRequestKey = `${currentNotebookId}:${currentMemoryId}`;

    async function loadDetail() {
      const [metadata, dbMemories, stageData] = await Promise.all([
        loadStageMetadata(currentNotebookId),
        listStudyMemoryRecords({ targetType: 'notebook', targetId: currentNotebookId }).catch(
          () => [] as StudyMemoryApiRecord[],
        ),
        loadStageData(currentNotebookId).catch(() => null),
      ]);
      const stage = stageData?.stage || metadata;
      const scenes = stageData?.scenes || [];
      const profile = loadStudyMemory(getLocalStudyMemoryUserId(), currentNotebookId);
      const messages = stage
        ? await loadContactMessages<NotebookChatMessage>(
            stage.courseId || '',
            'notebook',
            currentNotebookId,
            {
              ignoreCourseId: true,
              expectedTargetName: stage.name,
            },
          ).catch(() => [] as NotebookChatMessage[])
        : [];
      const record = resolveDetailRecord({
        memoryId: currentMemoryId,
        dbMemories,
        profile,
        scenes,
        messages,
      });

      if (!alive) return;
      setState({
        loading: false,
        requestKey: currentRequestKey,
        stage,
        record,
        error: record ? undefined : '没有找到这条记忆，可能已经被归档、删除或来源数据尚未加载。',
      });
    }

    void loadDetail().catch((error: unknown) => {
      if (!alive) return;
      setState({
        loading: false,
        requestKey: currentRequestKey,
        stage: null,
        record: null,
        error: error instanceof Error ? error.message : '读取记忆详情失败。',
      });
    });

    return () => {
      alive = false;
    };
  }, [memoryId, notebookId]);

  const memoryHref = useMemo(
    () => (notebookId ? `/classroom/${encodeURIComponent(notebookId)}/memory` : '/my-courses'),
    [notebookId],
  );
  const classroomHref = useMemo(
    () => (notebookId ? `/classroom/${encodeURIComponent(notebookId)}` : '/my-courses'),
    [notebookId],
  );
  const chatHref = useMemo(
    () => (notebookId ? `/chat?notebook=${encodeURIComponent(notebookId)}` : '/chat'),
    [notebookId],
  );
  const headerActions = notebookId ? (
    <>
      <Link
        href={chatHref}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200/85 bg-white/82 px-3 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200 dark:hover:bg-white/[0.1]"
      >
        <MessageCircle className="size-3.5" strokeWidth={1.8} />
        打开聊天
      </Link>
      <Link
        href={classroomHref}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#007AFF] px-3 text-xs font-semibold text-white shadow-[0_10px_22px_rgba(0,122,255,0.24)] transition-colors hover:opacity-[0.92]"
      >
        <BookOpen className="size-3.5" strokeWidth={1.8} />
        进入笔记本
      </Link>
    </>
  ) : null;

  if (!notebookId || !memoryId) {
    const error = !notebookId ? '缺少笔记本 ID。' : '缺少记忆 ID。';
    return (
      <main className="min-h-full bg-[#f3f6fb] text-slate-950 dark:bg-[#0e1117] dark:text-white">
        <div className="mx-auto flex w-full max-w-[86rem] flex-col gap-4 px-3 py-4 md:px-5 lg:px-6">
          <MemoryPageHeader
            title="记忆详情"
            subtitle={error}
            eyebrow="记忆详情"
            backHref={memoryHref}
            backLabel={notebookId ? '返回记忆地图' : '返回我的课程'}
            icon={Brain}
            actions={headerActions}
          />
          <section className="flex min-h-[22rem] items-center justify-center rounded-[24px] border border-dashed border-slate-200/90 bg-white/70 p-6 text-center dark:border-white/12 dark:bg-white/[0.04]">
            <div>
              <FileText className="mx-auto size-10 text-slate-400" strokeWidth={1.5} />
              <h2 className="mt-4 text-lg font-semibold">无法打开记忆详情</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{error}</p>
              <Link
                href={memoryHref}
                className="mt-5 inline-flex h-9 items-center justify-center rounded-xl bg-[#007AFF] px-4 text-sm font-semibold text-white"
              >
                返回记忆地图
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (state.loading || state.requestKey !== requestKey) {
    return (
      <main className="min-h-full bg-[#f3f6fb] text-slate-950 dark:bg-[#0e1117] dark:text-white">
        <div className="mx-auto flex w-full max-w-[86rem] flex-col gap-4 px-3 py-4 md:px-5 lg:px-6">
          <MemoryPageHeader
            title="记忆详情"
            subtitle="正在读取原始记忆内容和写入上下文。"
            eyebrow="记忆详情"
            backHref={memoryHref}
            backLabel="返回记忆地图"
            icon={Brain}
            actions={headerActions}
          />
          <div className="flex min-h-[20rem] items-center justify-center">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/80 px-5 py-4 text-sm font-medium text-slate-500 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-300">
              <Loader2 className="size-4 animate-spin text-[#007AFF]" />
              正在读取记忆详情…
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-full bg-[#f3f6fb] text-slate-950 dark:bg-[#0e1117] dark:text-white">
      <div className="mx-auto flex w-full max-w-[86rem] flex-col gap-4 px-3 py-4 md:px-5 lg:px-6">
        <MemoryPageHeader
          title="记忆详情"
          subtitle={state.stage?.name || '笔记本记忆节点'}
          eyebrow="记忆详情"
          backHref={memoryHref}
          backLabel="返回记忆地图"
          icon={Brain}
          actions={headerActions}
        />

        <section className="rounded-[24px] border border-white/80 bg-white/90 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/[0.03] dark:border-white/10 dark:bg-white/[0.065] md:p-5">
          <div className="flex min-w-0 gap-4">
            <div className="relative flex size-16 shrink-0 items-center justify-center rounded-3xl border border-blue-200/80 bg-blue-50 text-blue-600 shadow-sm dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-200">
              <Brain className="size-7" strokeWidth={1.6} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <FileText className="size-3.5 text-blue-600" strokeWidth={2} />
                  精确记忆
                </span>
                {state.stage ? <span>{state.stage.name}</span> : null}
              </div>
              <h1 className="mt-2 line-clamp-2 text-2xl font-semibold leading-tight tracking-normal text-slate-950 dark:text-white md:text-3xl">
                {state.record?.title || '记忆详情'}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                这里展示当前忆泡对应的原始记忆内容和写入上下文。
              </p>
            </div>
          </div>
        </section>

        {state.record ? (
          <DetailBody record={state.record} />
        ) : (
          <section className="flex min-h-[22rem] items-center justify-center rounded-[24px] border border-dashed border-slate-200/90 bg-white/70 p-6 text-center dark:border-white/12 dark:bg-white/[0.04]">
            <div className="max-w-md">
              <FileText className="mx-auto size-10 text-slate-400" strokeWidth={1.5} />
              <h2 className="mt-4 text-lg font-semibold text-slate-950 dark:text-white">
                没有找到这条记忆
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                {state.error || '这条记忆可能已经变化。'}
              </p>
              <Link
                href={memoryHref}
                className="mt-5 inline-flex h-9 items-center justify-center rounded-xl bg-[#007AFF] px-4 text-sm font-semibold text-white"
              >
                返回记忆地图
              </Link>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
