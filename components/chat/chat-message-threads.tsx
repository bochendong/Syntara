import Link from 'next/link';
import type { UIMessage } from 'ai';
import { Loader2, Presentation, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MessageResponse } from '@/components/ai-elements/message';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { ChatAttachmentBubble } from '@/components/chat/chat-attachment-bubble';
import { NotebookContentView } from '@/components/notebook-content/notebook-content-view';
import type { ChatMessageMetadata } from '@/lib/types/chat';
import type { Scene } from '@/lib/types/stage';
import type { CourseAgentListItem } from '@/lib/utils/course-agents';
import { cn } from '@/lib/utils';
import { ATTACHMENT_ONLY_PLACEHOLDER } from './chat-attachment-utils';
import { actionHref, AgentPeerAvatar, ChatUserAvatar, NotebookPeerAvatar } from './chat-avatars';
import { messageText } from './chat-message-utils';
import type { NotebookChatMessage } from './chat-page-types';
import { InlineLessonDeck } from './inline-lesson-deck';
import { NotebookReferencePreviewLi } from './notebook-reference-preview';

export function NotebookMessageThread({
  messages,
  userAvatar,
  nickname,
  stageMeta,
  notebookScenes,
  notebookScenesLoading,
  copyMessageText,
  deleteNotebookMessageAt,
  lessonGeneratingAt,
  generateInlineLessonDeck,
  lessonSavingAt,
  saveInlineLessonDeckToNotebook,
}: {
  messages: NotebookChatMessage[];
  userAvatar?: string | null;
  nickname: string;
  stageMeta: { id: string; name: string; avatarUrl?: string | null } | null;
  notebookScenes: Scene[];
  notebookScenesLoading: boolean;
  copyMessageText: (text: string) => void | Promise<void>;
  deleteNotebookMessageAt: (index: number) => void;
  lessonGeneratingAt: number | null;
  generateInlineLessonDeck: (targetAt: number) => void | Promise<void>;
  lessonSavingAt: number | null;
  saveInlineLessonDeckToNotebook: (targetAt: number) => void | Promise<void>;
}) {
  return (
    <>
      {messages.map((m, i) =>
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
                <ContextMenuItem variant="destructive" onSelect={() => deleteNotebookMessageAt(i)}>
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
                    <MessageResponse className="break-words leading-7 text-foreground">
                      {m.answer}
                    </MessageResponse>
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
                            需要的话，我可以把这道题自动整理成 3-5 页临时PPT，便于翻页讲解与复习。
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
                <ContextMenuItem variant="destructive" onSelect={() => deleteNotebookMessageAt(i)}>
                  删除该条
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </div>
        ),
      )}
    </>
  );
}

export function AgentMessageThread({
  messages,
  userAvatar,
  nickname,
  selectedAgent,
  copyMessageText,
  deleteAgentMessageById,
}: {
  messages: UIMessage<ChatMessageMetadata>[];
  userAvatar?: string | null;
  nickname: string;
  selectedAgent: CourseAgentListItem | null;
  copyMessageText: (text: string) => void | Promise<void>;
  deleteAgentMessageById: (messageId: string) => void;
}) {
  return (
    <>
      {messages.map((m) => {
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
                    <p className="mb-1 text-[10px] font-medium opacity-70">{meta.senderName}</p>
                  ) : null}
                  {!hideAttachmentOnlyText && isUser ? (
                    <p className="whitespace-pre-wrap break-words">{text}</p>
                  ) : null}
                  {!hideAttachmentOnlyText && !isUser ? (
                    <MessageResponse className="break-words leading-7">{text}</MessageResponse>
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
      })}
    </>
  );
}
