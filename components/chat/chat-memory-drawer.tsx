'use client';

import { useEffect, useMemo, useState } from 'react';
import type { UIMessage } from 'ai';
import { Archive, Brain, Clock3, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatMessageMetadata, CourseChatGroupMeta } from '@/lib/types/chat';
import {
  deleteNotebookPrivateMemory,
  getLocalStudyMemoryUserId,
  listNotebookPrivateMemories,
  loadStudyMemory,
  STUDY_MEMORY_UPDATED_EVENT,
  updateNotebookPrivateMemoryStatus,
  type NotebookMemoryItem,
  type WeakPointMemory,
} from '@/lib/learning/study-memory';
import { loadContactMessages } from '@/lib/utils/contact-chat-storage';
import type { NotebookChatMessage } from '@/components/chat/chat-page-types';
import { messageText } from './chat-message-utils';

type MemoryNotebookTarget = {
  id: string;
  name: string;
};

type ConversationMemory = {
  title: string;
  lines: string[];
  sources: Array<{ notebookName?: string; order: number; title: string }>;
  messageCount?: number;
  turnCount?: number;
  updatedAt?: number;
};

function formatTime(value?: number): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function notebookMessageText(message: NotebookChatMessage): string {
  return message.role === 'user' ? message.text : message.answer;
}

function compactConversationText(input: string, maxLength: number): string {
  const text = String(input || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function deriveNotebookConversationMemory(messages: NotebookChatMessage[]): ConversationMemory {
  const recent = messages.slice(-10);
  const userMessages = recent.filter((message) => message.role === 'user');
  const assistantMessages = recent.filter((message) => message.role === 'assistant');
  const lastUser = userMessages[userMessages.length - 1];
  const lastAssistant = assistantMessages[assistantMessages.length - 1];
  const messageCount = recent.length;
  const turnCount = Math.max(userMessages.length, assistantMessages.length);
  const references = recent
    .flatMap((message) => (message.role === 'assistant' ? message.references || [] : []))
    .slice(-5)
    .map((reference) => ({
      order: reference.order,
      title: reference.title,
    }));
  const lines = [
    messageCount
      ? `摘要范围：最近 ${messageCount} 条消息，约 ${turnCount} 轮互动；这里只显示摘录。`
      : '',
    lastUser ? `最近问题：${compactConversationText(notebookMessageText(lastUser), 140)}` : '',
    lastAssistant?.role === 'assistant' && lastAssistant.knowledgeGap
      ? '本轮出现了可长期记住的学习缺口。'
      : '',
    lastAssistant
      ? `最近回答摘录：${compactConversationText(notebookMessageText(lastAssistant), 180)}`
      : '',
  ].filter(Boolean);
  return {
    title: '最近互动摘要',
    lines,
    sources: references,
    messageCount,
    turnCount,
    updatedAt: recent[recent.length - 1]?.at,
  };
}

function deriveGroupConversationMemory(groupMeta: CourseChatGroupMeta): ConversationMemory {
  const memory = groupMeta.workingMemory;
  return {
    title: '群聊短期记忆',
    lines: [
      memory?.lastUserQuestion ? `最近问题：${memory.lastUserQuestion}` : '',
      groupMeta.lastRoutingReason ? `调度原因：${groupMeta.lastRoutingReason}` : '',
      memory?.dispatchSummary ? `最近调度：${memory.dispatchSummary}` : '',
      groupMeta.memberSummary ? `成员状态：${groupMeta.memberSummary}` : '',
    ].filter(Boolean),
    sources: (memory?.recentSources || []).map((source) => ({
      notebookName: source.notebookName,
      order: source.order,
      title: source.title,
    })),
  };
}

function kindLabel(memory: NotebookMemoryItem): string {
  if (memory.kind === 'mistake') return '错题';
  if (memory.kind === 'preference') return '偏好';
  if (memory.kind === 'reflection') return '反思';
  if (memory.kind === 'manual') return '手动';
  return '知识缺口';
}

function sourceLabel(memory: NotebookMemoryItem, targets: MemoryNotebookTarget[]): string {
  const targetName = targets.find((target) => target.id === memory.stageId)?.name;
  return targetName || memory.sourceReferences?.[0]?.notebookName || '笔记本';
}

export function ChatMemoryDrawer({
  courseId,
  notebookId,
  notebookName,
  groupMeta,
}: {
  courseId?: string | null;
  notebookId?: string | null;
  notebookName?: string | null;
  groupMeta?: CourseChatGroupMeta | null;
}) {
  const targets = useMemo<MemoryNotebookTarget[]>(() => {
    if (notebookId) return [{ id: notebookId, name: notebookName || '当前笔记本' }];
    return (groupMeta?.participants || [])
      .filter((participant) => participant.kind === 'notebook')
      .map((participant) => ({ id: participant.id, name: participant.name }));
  }, [groupMeta?.participants, notebookId, notebookName]);
  const [memoryRevision, setMemoryRevision] = useState(0);
  const [notebookConversationSnapshot, setNotebookConversationSnapshot] = useState<{
    notebookId: string;
    memory: ConversationMemory;
  } | null>(null);

  const { privateMemories, weakPoints, workingMemory } = useMemo(() => {
    void memoryRevision;
    if (targets.length === 0) {
      return {
        privateMemories: [] as NotebookMemoryItem[],
        weakPoints: [] as WeakPointMemory[],
        workingMemory: null as ReturnType<typeof loadStudyMemory>['workingMemory'] | null,
      };
    }
    const userId = getLocalStudyMemoryUserId();
    const profiles = targets.map((target) => loadStudyMemory(userId, target.id));
    return {
      privateMemories: targets
        .flatMap((target) =>
          listNotebookPrivateMemories({ userId, stageId: target.id, limit: 6 }).map((memory) => ({
            ...memory,
            stageId: target.id,
          })),
        )
        .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
        .slice(0, 12),
      weakPoints: targets
        .flatMap((target, index) => profiles[index]?.weakPoints || [])
        .filter((item) => item.status === 'open')
        .slice(0, 8),
      workingMemory:
        profiles
          .map((profile) => profile.workingMemory)
          .filter(Boolean)
          .sort((a, b) => (b?.updatedAt || 0) - (a?.updatedAt || 0))[0] || null,
    };
  }, [memoryRevision, targets]);

  useEffect(() => {
    const onMemoryUpdated = (event: Event) => {
      const stageId = (event as CustomEvent<{ stageId?: string }>).detail?.stageId;
      if (stageId && !targets.some((target) => target.id === stageId)) return;
      setMemoryRevision((revision) => revision + 1);
    };
    window.addEventListener(STUDY_MEMORY_UPDATED_EVENT, onMemoryUpdated as EventListener);
    return () =>
      window.removeEventListener(STUDY_MEMORY_UPDATED_EVENT, onMemoryUpdated as EventListener);
  }, [targets]);

  const groupConversationMemory = useMemo(
    () => (groupMeta ? deriveGroupConversationMemory(groupMeta) : null),
    [groupMeta],
  );
  const notebookConversationMemory =
    notebookConversationSnapshot && notebookConversationSnapshot.notebookId === notebookId
      ? notebookConversationSnapshot.memory
      : null;
  const conversationMemory = groupConversationMemory || notebookConversationMemory;

  useEffect(() => {
    if (groupMeta || !courseId || !notebookId) return;
    const targetName = targets.find((target) => target.id === notebookId)?.name;
    let alive = true;
    void loadContactMessages<NotebookChatMessage>(courseId, 'notebook', notebookId, {
      ignoreCourseId: true,
      expectedTargetName: targetName,
    })
      .then((messages) => {
        if (!alive) return;
        setNotebookConversationSnapshot({
          notebookId,
          memory: deriveNotebookConversationMemory(messages),
        });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [courseId, groupMeta, notebookId, targets]);

  const removeMemory = (memory: NotebookMemoryItem) => {
    deleteNotebookPrivateMemory({ stageId: memory.stageId, memoryId: memory.id });
    setMemoryRevision((revision) => revision + 1);
  };

  const archiveMemory = (memory: NotebookMemoryItem) => {
    updateNotebookPrivateMemoryStatus({
      stageId: memory.stageId,
      memoryId: memory.id,
      status: 'archived',
    });
    setMemoryRevision((revision) => revision + 1);
  };

  const hasConversationMemory = Boolean(
    conversationMemory &&
    (conversationMemory.lines.length > 0 || conversationMemory.sources.length > 0),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-0.5 [&::-webkit-scrollbar]:w-[5px] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-900/15 dark:[&::-webkit-scrollbar-thumb]:bg-white/20">
      {workingMemory ? (
        <section className="rounded-[14px] border border-sky-200/80 bg-sky-50/70 p-3 dark:border-sky-300/20 dark:bg-sky-500/10">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-xl bg-sky-500/10 text-sky-700 dark:text-sky-200">
              <Clock3 className="size-4" strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-foreground">短期学习状态</p>
              <p className="text-[10px] text-muted-foreground">回复或做题结束后后台覆盖更新</p>
            </div>
          </div>
          <div className="mt-3 space-y-1.5 text-[11px] leading-5 text-sky-900 dark:text-sky-100">
            <p>{workingMemory.currentTask || workingMemory.summary}</p>
            {workingMemory.stuckPoint ? <p>卡点：{workingMemory.stuckPoint}</p> : null}
            {workingMemory.masteredSignal ? <p>掌握：{workingMemory.masteredSignal}</p> : null}
            {workingMemory.nextTeachingMove ? (
              <p>下一步：{workingMemory.nextTeachingMove}</p>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="rounded-[14px] border border-slate-900/[0.06] bg-white/60 p-3 dark:border-white/[0.08] dark:bg-white/[0.04]">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-xl bg-sky-500/10 text-sky-700 dark:text-sky-200">
            <Clock3 className="size-4" strokeWidth={1.8} />
          </span>
          <div>
            <p className="text-xs font-semibold text-foreground">
              {conversationMemory?.title || '最近互动摘要'}
            </p>
            <p className="text-[10px] text-muted-foreground">
              短期摘要会随会话恢复，长期私有记忆在下方单独保存
            </p>
          </div>
        </div>
        {hasConversationMemory ? (
          <div className="mt-3 space-y-2">
            {conversationMemory?.lines.map((line) => (
              <p key={line} className="text-[11px] leading-5 text-slate-700 dark:text-slate-300">
                {line}
              </p>
            ))}
            {conversationMemory?.sources.length ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {conversationMemory.sources.map((source, index) => (
                  <span
                    key={`${source.notebookName || 'source'}-${source.order}-${index}`}
                    className="max-w-full truncate rounded-full border border-slate-200/80 bg-slate-50 px-2 py-1 text-[10px] text-muted-foreground dark:border-white/10 dark:bg-white/[0.05]"
                  >
                    {source.notebookName ? `《${source.notebookName}》` : ''}第 {source.order} 页 ·{' '}
                    {source.title}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
            当前会话还没有形成可展示的短期记忆。
          </p>
        )}
      </section>

      <section className="rounded-[14px] border border-slate-900/[0.06] bg-white/60 p-3 dark:border-white/[0.08] dark:bg-white/[0.04]">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-xl bg-violet-500/10 text-violet-700 dark:text-violet-200">
            <Brain className="size-4" strokeWidth={1.8} />
          </span>
          <div>
            <p className="text-xs font-semibold text-foreground">私有长期记忆</p>
            <p className="text-[10px] text-muted-foreground">学习断点、错题弱点与明确记住的偏好</p>
          </div>
        </div>

        {weakPoints.length > 0 ? (
          <div className="mt-3 rounded-xl bg-amber-500/10 p-2.5 text-[11px] leading-5 text-amber-900 dark:text-amber-100">
            <p className="font-semibold">待复习弱点</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {weakPoints.slice(0, 3).map((point) => (
                <li key={point.id}>{point.title}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {privateMemories.length > 0 ? (
          <ul className="mt-3 flex list-none flex-col gap-2 p-0">
            {privateMemories.map((memory) => (
              <li
                key={`${memory.stageId}:${memory.id}`}
                className="rounded-xl border border-slate-900/[0.06] bg-white/70 p-2.5 dark:border-white/[0.08] dark:bg-black/20"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="shrink-0 rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-medium text-violet-700 dark:text-violet-200">
                        {kindLabel(memory)}
                      </span>
                      <p className="truncate text-xs font-semibold text-foreground">
                        {memory.title}
                      </p>
                    </div>
                    <p className="mt-1 line-clamp-3 text-[11px] leading-5 text-muted-foreground">
                      {memory.text}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground/80">
                      {sourceLabel(memory, targets)}
                      {formatTime(memory.updatedAt) ? ` · ${formatTime(memory.updatedAt)}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      className={cn(
                        'flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors',
                        'hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white',
                      )}
                      aria-label="归档记忆"
                      title="归档"
                      onClick={() => archiveMemory(memory)}
                    >
                      <Archive className="size-3.5" strokeWidth={1.8} />
                    </button>
                    <button
                      type="button"
                      className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600"
                      aria-label="撤销这条私有记忆"
                      title="撤销"
                      onClick={() => removeMemory(memory)}
                    >
                      <Trash2 className="size-3.5" strokeWidth={1.8} />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
            暂无私有长期记忆。只有明显学习断点、错题弱点或你明确要求记住时，才会后台写入。
          </p>
        )}
      </section>
    </div>
  );
}

export function deriveAgentConversationMemory(
  messages: UIMessage<ChatMessageMetadata>[],
): ConversationMemory {
  const recent = messages.slice(-10);
  const lastUser = [...recent].reverse().find((message) => message.role === 'user');
  const lastAssistant = [...recent].reverse().find((message) => message.role !== 'user');
  return {
    title: '最近互动摘要',
    lines: [
      recent.length ? `摘要范围：最近 ${recent.length} 条消息；这里只显示摘录。` : '',
      lastUser ? `最近问题：${compactConversationText(messageText(lastUser), 140)}` : '',
      lastAssistant
        ? `最近回答摘录：${compactConversationText(messageText(lastAssistant), 180)}`
        : '',
    ].filter(Boolean),
    sources: [],
    messageCount: recent.length,
  };
}
