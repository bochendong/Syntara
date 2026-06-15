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
import type {
  ChatMessageMetadata,
  CourseChatGroupMeta,
  CourseChatParticipant,
} from '@/lib/types/chat';
import type { Scene } from '@/lib/types/stage';
import type { CourseAgentListItem } from '@/lib/utils/course-agents';
import { cn } from '@/lib/utils';
import { normalizeLooseMathDelimiters } from '@/lib/math-engine';
import { ATTACHMENT_ONLY_PLACEHOLDER } from './chat-attachment-utils';
import { actionHref } from './chat-avatars';
import { messageText } from './chat-message-utils';
import type { NotebookChatMessage } from './chat-page-types';
import { InlineLessonDeck } from './inline-lesson-deck';
import { NotebookProblemChatCardView } from './notebook-problem-chat-card';
import { NotebookReferencePreviewLi } from './notebook-reference-preview';

const threadRowClassName = 'mx-auto w-full max-w-5xl';
const groupThreadRowClassName = 'mx-auto w-full max-w-4xl';

const userBubbleClassName = cn(
  'max-w-[min(78%,680px)] rounded-[24px] bg-black px-4 py-2.5',
  'text-[13px] leading-5 text-white shadow-sm dark:bg-white dark:text-black',
);

const selectableMessageTextClassName = 'select-text';

const assistantShellClassName = cn(
  'w-full max-w-3xl py-1 text-[13.5px] leading-6 text-slate-950 dark:text-slate-50',
);

const assistantRichTextClassName = cn(
  'h-auto w-full select-text break-words text-[13.5px] leading-6 text-slate-950 dark:text-slate-50',
  '[&_p]:my-2.5 [&_ul]:my-2.5 [&_ol]:my-2.5 [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-0.5',
  '[&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold',
  '[&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold',
  '[&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:text-sm [&_h3]:font-semibold',
  '[&_blockquote]:my-5 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-4 [&_blockquote]:text-slate-700 dark:[&_blockquote]:border-slate-600 dark:[&_blockquote]:text-slate-300',
  '[&_[data-streamdown=code-block]]:my-5 [&_[data-streamdown=code-block]]:rounded-[24px]',
  '[&_[data-streamdown=code-block]]:border-slate-200 [&_[data-streamdown=code-block]]:bg-[#f7f7f8] [&_[data-streamdown=code-block]]:p-3 dark:[&_[data-streamdown=code-block]]:border-white/10 dark:[&_[data-streamdown=code-block]]:bg-slate-950',
  '[&_[data-streamdown=code-block-header]]:h-8 [&_[data-streamdown=code-block-header]]:px-1 [&_[data-streamdown=code-block-header]]:text-xs',
  '[&_[data-streamdown=code-block-body]]:rounded-[18px] [&_[data-streamdown=code-block-body]]:border-0 [&_[data-streamdown=code-block-body]]:bg-transparent [&_[data-streamdown=code-block-body]]:p-3 [&_[data-streamdown=code-block-body]]:text-[12px] [&_[data-streamdown=code-block-body]]:leading-5',
  '[&_[data-streamdown=code-block-actions]]:rounded-full [&_[data-streamdown=code-block-actions]]:border-slate-200 [&_[data-streamdown=code-block-actions]]:bg-white/90 dark:[&_[data-streamdown=code-block-actions]]:border-white/10 dark:[&_[data-streamdown=code-block-actions]]:bg-slate-900/90',
);

function StreamingCursor() {
  return (
    <span
      className="ml-1 inline-block h-5 w-0.5 animate-pulse bg-current align-[-0.18em]"
      aria-hidden
    />
  );
}

function EmptyStreamingIndicator() {
  return (
    <span className="inline-flex h-7 items-center text-sm text-muted-foreground" aria-live="polite">
      正在整理回答…
    </span>
  );
}

function MessageStatusLine({ text }: { text: string }) {
  return (
    <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs text-muted-foreground dark:bg-white/10">
      <Loader2 className="size-3.5 animate-spin" />
      <span>{text}</span>
    </div>
  );
}

function normalizeAssistantMarkdown(text: string): string {
  return text
    .split(/(```[\s\S]*?```)/g)
    .map((part) => (part.startsWith('```') ? part : normalizeLooseMathDelimiters(part)))
    .join('');
}

function stripNotebookMarks(text: string): string {
  return text.replace(/[《》]/g, '');
}

function fallbackGroupEventSummary(meta: ChatMessageMetadata | undefined, text: string): string {
  if (meta?.groupEventSummary) return meta.groupEventSummary;
  if (meta?.groupEvent === 'created') {
    const members = text.match(/成员：(.+)$/u)?.[1];
    return members ? `已创建群聊 · ${stripNotebookMarks(members)}` : '已创建群聊';
  }
  if (meta?.groupEvent === 'members_added') {
    const members = text.replace(/^课程总控邀请了\s*/u, '').trim();
    return members ? `已邀请成员 · ${stripNotebookMarks(members)}` : '已邀请成员';
  }
  return text;
}

function participantInitial(name: string | undefined): string {
  return (name || '群').trim().slice(0, 1) || '群';
}

function participantAvatarClassName(
  kind?: CourseChatParticipant['kind'] | ChatMessageMetadata['senderKind'],
) {
  if (kind === 'orchestrator') {
    return 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-100';
  }
  if (kind === 'notebook') {
    return 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-100';
  }
  return 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-100';
}

function GroupAvatar({
  avatarUrl,
  kind,
  name,
}: {
  avatarUrl?: string | null;
  kind?: CourseChatParticipant['kind'] | ChatMessageMetadata['senderKind'];
  name?: string;
}) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" className="size-8 rounded-xl object-cover shadow-sm" />;
  }
  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-xl text-xs font-semibold shadow-sm',
        participantAvatarClassName(kind),
      )}
    >
      {participantInitial(name)}
    </span>
  );
}

function findParticipant(
  groupMeta: CourseChatGroupMeta | null | undefined,
  meta: ChatMessageMetadata | undefined,
): CourseChatParticipant | null {
  if (!groupMeta || !meta?.senderName) return null;
  return (
    groupMeta.participants.find((participant) => participant.name === meta.senderName) ||
    groupMeta.participants.find((participant) => participant.kind === meta.senderKind) ||
    null
  );
}

function mentionedParticipants(
  groupMeta: CourseChatGroupMeta | null | undefined,
  meta: ChatMessageMetadata | undefined,
): CourseChatParticipant[] {
  const ids = meta?.mentionedParticipantIds || [];
  const fallback = (meta?.mentionedParticipantDetails || [])
    .filter((participant) => participant.id && participant.name)
    .map((participant) => ({
      id: participant.id,
      kind: participant.kind || 'notebook',
      name: participant.name,
      avatarUrl: participant.avatarUrl || null,
      joinedAt: meta?.createdAt || Date.now(),
    }));
  if (!groupMeta || ids.length === 0) return fallback;
  const idSet = new Set(ids);
  const fromGroup = groupMeta.participants.filter((participant) => idSet.has(participant.id));
  if (fromGroup.length > 0) return fromGroup;
  return fallback;
}

function GroupEventPill({ meta, text }: { meta: ChatMessageMetadata | undefined; text: string }) {
  const summary = fallbackGroupEventSummary(meta, text);
  const detail = meta?.groupEventDetail || text;
  return (
    <div className={cn(groupThreadRowClassName, 'flex justify-center')}>
      <span
        title={detail}
        className="max-w-[80%] truncate rounded-full bg-slate-100/85 px-3 py-1 text-[11px] leading-5 text-muted-foreground dark:bg-white/10"
      >
        {summary}
      </span>
    </div>
  );
}

function GroupDispatchCard({
  groupMeta,
  meta,
}: {
  groupMeta?: CourseChatGroupMeta | null;
  meta: ChatMessageMetadata | undefined;
}) {
  const participant = findParticipant(groupMeta, meta);
  const targets = mentionedParticipants(groupMeta, meta);
  const targetLabel =
    targets.length > 0
      ? targets.map((target) => stripNotebookMarks(participantLabel(target))).join('、')
      : '相关成员';
  const verb = meta?.dispatchVerb || '拉入了';
  const note =
    meta?.dispatchNote ||
    (targets.length > 1 ? '让它们各自补充最相关的一点' : '让它补充最相关的一点');
  const dispatchLines = meta?.dispatchPrompt?.trim()
    ? meta.dispatchPrompt
        .trim()
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
    : [`@${targetLabel} ${note}`];
  const senderName = meta?.senderName || participant?.name || '课程总控Agent';
  return (
    <div className="flex max-w-[min(88%,780px)] items-start gap-3">
      <GroupAvatar
        avatarUrl={meta?.senderAvatar || participant?.avatarUrl}
        kind="orchestrator"
        name={senderName}
      />
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
          <span className="truncate">{senderName}</span>
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] text-rose-700 dark:bg-rose-500/15 dark:text-rose-100">
            主持
          </span>
          <span className="min-w-0 truncate">
            {verb} {targetLabel}
          </span>
        </div>
        <div className="rounded-2xl border border-slate-200/85 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <div className="space-y-2">
            {dispatchLines.map((line, index) => {
              const match = line.match(/^(@\S+)(?:\s+([\s\S]*))?$/u);
              const mention = match?.[1];
              const content = match?.[2] || line;
              return (
                <p
                  key={`${line}-${index}`}
                  className="whitespace-pre-wrap text-[13px] leading-5 text-slate-900 dark:text-slate-100"
                >
                  {mention ? (
                    <span className="mr-1.5 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-100">
                      {mention}
                    </span>
                  ) : null}
                  <span>{content}</span>
                </p>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function participantLabel(participant: CourseChatParticipant): string {
  if (participant.kind === 'notebook') return `《${participant.name}》`;
  return participant.name;
}

function SourceReferencePreviewChip({
  reference,
}: {
  reference: NonNullable<ChatMessageMetadata['sourceReferences']>[number];
}) {
  const label = `${reference.notebookName ? `《${reference.notebookName}》` : ''}第 ${reference.order} 节 · ${reference.title}`;

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[11px] leading-none',
        'border-slate-200 bg-slate-50 text-muted-foreground',
        'dark:border-white/10 dark:bg-white/5',
      )}
    >
      <span className="truncate font-medium">{label}</span>
    </span>
  );
}

function GroupSourceReferences({ meta }: { meta: ChatMessageMetadata | undefined }) {
  const references = meta?.sourceReferences || [];
  if (references.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-900/[0.06] pt-2 text-[11px] leading-5 text-muted-foreground dark:border-white/[0.08]">
      <span className="mr-0.5 font-medium">来源</span>
      {references.map((reference, index) => (
        <SourceReferencePreviewChip
          key={`${reference.notebookId || reference.notebookName || 'source'}-${reference.order}-${index}`}
          reference={reference}
        />
      ))}
    </div>
  );
}

function GroupMemberMessage({
  groupMeta,
  meta,
  text,
}: {
  groupMeta?: CourseChatGroupMeta | null;
  meta: ChatMessageMetadata | undefined;
  text: string;
}) {
  const participant = findParticipant(groupMeta, meta);
  const kind = meta?.senderKind || participant?.kind;
  const isNotebook = kind === 'notebook';
  const senderName = meta?.senderName || participant?.name || '成员';
  return (
    <div className="flex max-w-[min(88%,780px)] items-start gap-3">
      <GroupAvatar
        avatarUrl={meta?.senderAvatar || participant?.avatarUrl}
        kind={kind}
        name={senderName}
      />
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span className="truncate">{senderName}</span>
          {isNotebook ? (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] text-violet-700 dark:bg-violet-500/15 dark:text-violet-100">
              笔记本
            </span>
          ) : null}
        </div>
        <div
          className={cn(
            'rounded-2xl px-4 py-3',
            isNotebook
              ? 'border border-slate-200/85 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.04]'
              : 'bg-slate-50/85 dark:bg-white/[0.04]',
          )}
        >
          {text ? (
            <MessageResponse className={assistantRichTextClassName}>
              {normalizeAssistantMarkdown(text)}
            </MessageResponse>
          ) : meta?.streaming ? (
            <EmptyStreamingIndicator />
          ) : null}
          {meta?.streaming ? <StreamingCursor /> : null}
          {meta?.statusText ? <MessageStatusLine text={meta.statusText} /> : null}
          {isNotebook ? <GroupSourceReferences meta={meta} /> : null}
          {meta?.actions?.length ? (
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
      </div>
    </div>
  );
}

export function NotebookMessageThread({
  messages,
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
          <div key={`u-${m.at}-${i}`} className={cn(threadRowClassName, 'flex justify-end')}>
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <div className="flex min-w-0 flex-col items-end gap-2">
                  {m.problemAsk ? <NotebookProblemChatCardView card={m.problemAsk} /> : null}
                  <div className={userBubbleClassName}>
                    <p className="select-text whitespace-pre-wrap break-words">{m.text}</p>
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
          </div>
        ) : (
          <div key={`a-${m.at}-${i}`} className={cn(threadRowClassName, 'flex justify-start')}>
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <div className={assistantShellClassName}>
                  {m.answerDocument ? (
                    <NotebookContentView
                      document={m.answerDocument}
                      className={selectableMessageTextClassName}
                    />
                  ) : m.answer ? (
                    <div>
                      <MessageResponse className={assistantRichTextClassName}>
                        {normalizeAssistantMarkdown(m.answer)}
                      </MessageResponse>
                      {m.streaming ? <StreamingCursor /> : null}
                    </div>
                  ) : (
                    <>{m.streaming ? <EmptyStreamingIndicator /> : null}</>
                  )}
                  {m.statusText ? <MessageStatusLine text={m.statusText} /> : null}
                  {m.references.length > 0 ? (
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-900/[0.06] pt-3 dark:border-white/[0.08]">
                      <span className="text-[11px] font-medium text-muted-foreground">来源</span>
                      <ul className="flex min-w-0 flex-wrap gap-1.5 p-0">
                        {m.references.map((r, j) => (
                          <NotebookReferencePreviewLi
                            key={j}
                            reference={r}
                            scenes={notebookScenes}
                            scenesLoading={notebookScenesLoading}
                            variant="chip"
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
                  {m.knowledgeGap && !m.answerDocument ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      模型判断存在知识缺口，可能已尝试补充内容。
                    </p>
                  ) : null}
                  {m.webSearchUsed ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">已使用联网检索</p>
                  ) : null}
                  {m.appliedLabel && !m.answerDocument ? (
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
  selectedAgent,
  groupMeta,
  copyMessageText,
  deleteAgentMessageById,
}: {
  messages: UIMessage<ChatMessageMetadata>[];
  selectedAgent: CourseAgentListItem | null;
  groupMeta?: CourseChatGroupMeta | null;
  copyMessageText: (text: string) => void | Promise<void>;
  deleteAgentMessageById: (messageId: string) => void;
}) {
  return (
    <>
      {messages.map((m) => {
        const isUser = m.role === 'user';
        const text = messageText(m);
        const meta = m.metadata;
        if (groupMeta && !isUser) {
          if (meta?.groupEvent) {
            return <GroupEventPill key={m.id} meta={meta} text={text} />;
          }
          const isDispatch =
            meta?.senderKind === 'orchestrator' && (meta.mentionedParticipantIds?.length || 0) > 0;
          return (
            <div key={m.id} className={cn(groupThreadRowClassName, 'flex justify-start')}>
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  {isDispatch ? (
                    <GroupDispatchCard groupMeta={groupMeta} meta={meta} />
                  ) : (
                    <GroupMemberMessage groupMeta={groupMeta} meta={meta} text={text} />
                  )}
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
        }
        if (!isUser && meta?.groupEvent) {
          return <GroupEventPill key={m.id} meta={meta} text={text} />;
        }
        const isDispatch =
          !isUser &&
          meta?.senderKind === 'orchestrator' &&
          (meta.mentionedParticipantIds?.length || 0) > 0;
        const isNotebookMemberMessage = !isUser && meta?.senderKind === 'notebook';
        if (isDispatch || isNotebookMemberMessage) {
          return (
            <div key={m.id} className={cn(threadRowClassName, 'flex justify-start')}>
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  {isDispatch ? (
                    <GroupDispatchCard groupMeta={null} meta={meta} />
                  ) : (
                    <GroupMemberMessage groupMeta={null} meta={meta} text={text} />
                  )}
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
        }
        const hideAttachmentOnlyText =
          isUser &&
          meta?.attachments &&
          meta.attachments.length > 0 &&
          (text === ATTACHMENT_ONLY_PLACEHOLDER || !text.trim());
        const assistantLabel =
          !isUser && meta?.senderName && meta.senderName !== selectedAgent?.name
            ? meta.senderName
            : null;
        return (
          <div
            key={m.id}
            className={cn(threadRowClassName, 'flex', isUser ? 'justify-end' : 'justify-start')}
          >
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <div className={cn(isUser ? userBubbleClassName : assistantShellClassName)}>
                  {assistantLabel ? (
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      {assistantLabel}
                    </p>
                  ) : null}
                  {!hideAttachmentOnlyText && isUser ? (
                    <p className="select-text whitespace-pre-wrap break-words">{text}</p>
                  ) : null}
                  {!hideAttachmentOnlyText && !isUser ? (
                    text ? (
                      <div>
                        <MessageResponse className={assistantRichTextClassName}>
                          {normalizeAssistantMarkdown(text)}
                        </MessageResponse>
                        {meta?.streaming ? <StreamingCursor /> : null}
                      </div>
                    ) : meta?.streaming ? (
                      <EmptyStreamingIndicator />
                    ) : null
                  ) : null}
                  {!isUser && meta?.statusText ? (
                    <MessageStatusLine text={meta.statusText} />
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
