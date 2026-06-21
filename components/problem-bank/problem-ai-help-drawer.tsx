'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, MessageCircle, RefreshCw, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { MessageResponse } from '@/components/ai-elements/message';
import type {
  NotebookChatMessage,
  NotebookProblemChatCard,
} from '@/components/chat/chat-page-types';
import { NotebookProblemChatCardView } from '@/components/chat/notebook-problem-chat-card';
import { askCourseOrchestrator } from '@/lib/chat/ask-course-orchestrator';
import { buildProblemExplainPrompt } from '@/lib/chat/problem-explain-prompt';
import { cn } from '@/lib/utils';
import type {
  NotebookProblemAttemptAnswer,
  NotebookProblemAttemptRecord,
  NotebookProblemPublicContent,
} from '@/lib/problem-bank';
import type { NotebookProblemClientRecord } from '@/lib/utils/notebook-problem-api';
import type { StageListItem } from '@/lib/utils/stage-storage';
import { toast } from '@/lib/notifications/client-toast';

const USER_PROBLEM_HELP_TEXT = '我不会这道题，请完整讲解一下。';

const drawerAssistantClassName = cn(
  'min-w-0 max-w-full overflow-hidden text-[13px] leading-6 text-slate-900 dark:text-slate-50',
  '[&_p]:my-2 [&_p]:break-words [&_ul]:my-2 [&_ol]:my-2 [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-0.5 [&_li]:break-words',
  '[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold',
  '[&_h2]:mt-4 [&_h2]:mb-1.5 [&_h2]:text-sm [&_h2]:font-semibold',
  '[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold',
  '[&_.katex-display]:overflow-x-auto [&_[data-streamdown=code-block]]:my-4 [&_[data-streamdown=code-block]]:max-w-full [&_[data-streamdown=code-block]]:overflow-x-auto [&_[data-streamdown=code-block]]:rounded-lg',
);

function protectAngleLiteralsInPlainMarkdown(text: string): string {
  const protectLine = (line: string) =>
    line
      .split(/(`[^`]*`)/g)
      .map((part) =>
        part.startsWith('`')
          ? part
          : part.replace(/<([A-Za-z][A-Za-z0-9_-]*)>([A-Za-z]{1,3})?/g, (match, ...args) => {
              const offset = args[args.length - 2] as number;
              const source = args[args.length - 1] as string;
              const nextChar = source[offset + match.length] || '';
              if (nextChar && /[A-Za-z0-9_-]/.test(nextChar)) return match;
              return `\`${match}\``;
            }),
      )
      .join('');

  let inFence = false;
  return text
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return line;
      }
      return inFence ? line : protectLine(line);
    })
    .join('\n');
}

function AgentAvatar({
  avatarUrl,
  label,
  compact = false,
}: {
  avatarUrl?: string | null;
  label: string;
  compact?: boolean;
}) {
  const className = compact ? 'size-5 rounded-md' : 'size-9 rounded-lg';
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" className={cn(className, 'object-cover')} />;
  }
  return (
    <span
      className={cn(
        className,
        'flex shrink-0 items-center justify-center bg-sky-100 text-xs font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-100',
      )}
    >
      {label.trim().slice(0, 1) || 'AI'}
    </span>
  );
}

export function ProblemAiHelpButton({
  courseId,
  problem,
  problemTitle,
  problemContent,
  notebook,
  notebookLabel,
  locale,
  currentAnswer,
  latestAttempt,
}: {
  courseId: string;
  problem: NotebookProblemClientRecord;
  problemTitle: string;
  problemContent: NotebookProblemPublicContent | null;
  notebook: StageListItem | null;
  notebookLabel: string;
  locale: string;
  currentAnswer?: NotebookProblemAttemptAnswer | null;
  latestAttempt?: NotebookProblemAttemptRecord | null;
}) {
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState<NotebookChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const targetNotebookId = problem.notebookId || notebook?.id || '';
  const targetNotebookName =
    notebook?.name || notebookLabel || problem.notebookName || '当前笔记本';
  const chatHref = `/learn?courseId=${encodeURIComponent(courseId)}`;

  useEffect(() => {
    setOpen(false);
    setThread([]);
    setSending(false);
  }, [problem.id]);

  const problemCard = useMemo<NotebookProblemChatCard | null>(() => {
    if (!targetNotebookId) return null;
    return {
      courseId,
      notebookId: targetNotebookId,
      problemId: problem.id,
      href: `/course/${encodeURIComponent(courseId)}/problem-bank/${encodeURIComponent(problem.id)}`,
      title: problemTitle || problem.title,
      notebookName: targetNotebookName,
      problemNumber: problem.problemNumber ?? null,
    };
  }, [
    courseId,
    problem.id,
    problem.problemNumber,
    problem.title,
    problemTitle,
    targetNotebookId,
    targetNotebookName,
  ]);

  const startExplanation = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      setOpen(true);
      if (sending) return;
      if (!force && thread.length > 0) return;
      if (!problemContent) {
        toast.error(
          locale === 'zh-CN' ? '题目内容还没加载完成。' : 'Problem content is still loading.',
        );
        return;
      }

      const userAt = Date.now();
      const assistantAt = userAt + 1;
      const userMsg: NotebookChatMessage = {
        role: 'user',
        text: USER_PROBLEM_HELP_TEXT,
        at: userAt,
        ...(problemCard ? { problemAsk: problemCard } : {}),
      };
      const streamingMsg: NotebookChatMessage = {
        role: 'assistant',
        answer: '',
        references: [],
        knowledgeGap: false,
        streaming: true,
        statusText: '正在读取课程记忆和题目上下文…',
        at: assistantAt,
      };
      setThread([userMsg, streamingMsg]);
      setSending(true);

      try {
        const prompt = [
          buildProblemExplainPrompt({
            problem,
            problemTitle,
            problemContent,
            notebookName: targetNotebookName,
            currentAnswer,
            latestAttempt,
          }),
          '',
          '课程级补充要求：请结合课程控制记忆、题库上下文和学生学习信号来讲解，不要只依赖单个笔记本；如果这道题没有归属章节，也继续按照课程题库题目完整讲。',
        ].join('\n');
        const plan = await askCourseOrchestrator({
          courseId,
          question: prompt,
        });
        const protectedAnswer = protectAngleLiteralsInPlainMarkdown(
          plan.answer.trim() || '这道题暂时没有生成讲解，请稍后再试。',
        );
        const assistantMsg: NotebookChatMessage = {
          role: 'assistant',
          answer: protectedAnswer,
          references: [],
          knowledgeGap: false,
          streaming: false,
          statusText: undefined,
          at: assistantAt,
        };
        setThread([userMsg, assistantMsg]);
      } catch (error) {
        const message = error instanceof Error ? error.message : '讲解生成失败';
        toast.error(message);
        setThread((current) =>
          current.map((item) =>
            item.role === 'assistant' && item.at === assistantAt
              ? {
                  ...item,
                  answer: `讲解生成失败：${message}`,
                  streaming: false,
                  statusText: undefined,
                }
              : item,
          ),
        );
      } finally {
        setSending(false);
      }
    },
    [
      courseId,
      currentAnswer,
      latestAttempt,
      locale,
      problem,
      problemCard,
      problemContent,
      problemTitle,
      sending,
      targetNotebookName,
      thread.length,
    ],
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 rounded-md border-sky-200 bg-sky-50 px-2 text-xs font-semibold text-sky-700 hover:bg-sky-100 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-100 dark:hover:bg-sky-500/15"
        onClick={() => void startExplanation()}
        disabled={sending}
        title={targetNotebookName}
      >
        {sending ? (
          <Loader2 className="mr-1.5 size-3.5 animate-spin" />
        ) : (
          <AgentAvatar avatarUrl={notebook?.avatarUrl} label={targetNotebookName} compact />
        )}
        {locale === 'zh-CN' ? 'AI 讲题' : 'Explain'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[min(52rem,calc(100dvh-1.5rem))] w-[min(64rem,calc(100vw-1.5rem))] max-w-none min-w-0 flex-col gap-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl dark:border-slate-800 dark:bg-slate-950"
        >
          <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <AgentAvatar avatarUrl={notebook?.avatarUrl} label={targetNotebookName} />
            <div className="min-w-0 flex-1">
              <DialogTitle className="flex items-center gap-1.5 text-sm font-semibold text-slate-950 dark:text-white">
                <Sparkles className="size-4 text-sky-600 dark:text-sky-300" />
                {locale === 'zh-CN' ? '课程 AI 讲题' : 'Course AI'}
              </DialogTitle>
              <p className="truncate text-xs text-muted-foreground">{targetNotebookName}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="rounded-md"
              onClick={() => setOpen(false)}
              aria-label={locale === 'zh-CN' ? '关闭' : 'Close'}
            >
              <X className="size-4" />
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
            <div className="min-w-0 max-w-full space-y-4 px-4 py-4">
              {problemCard ? <NotebookProblemChatCardView card={problemCard} /> : null}
              {thread.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-muted-foreground dark:border-slate-800 dark:bg-slate-900/40">
                  {locale === 'zh-CN'
                    ? '点击按钮后，我会讲完整道题。'
                    : 'Tap the button to explain the full problem.'}
                </div>
              ) : null}
              {thread.map((message, index) =>
                message.role === 'user' ? (
                  <div key={`${message.at}-${index}`} className="flex justify-end">
                    <div className="max-w-[82%] rounded-lg bg-black px-3 py-2 text-[13px] leading-5 text-white dark:bg-white dark:text-black">
                      {message.text}
                    </div>
                  </div>
                ) : (
                  <div
                    key={`${message.at}-${index}`}
                    className="min-w-0 max-w-full overflow-hidden rounded-lg bg-slate-50 px-3 py-3 dark:bg-white/[0.04]"
                  >
                    {(() => {
                      if (message.answer) {
                        return (
                          <MessageResponse className={drawerAssistantClassName}>
                            {protectAngleLiteralsInPlainMarkdown(message.answer)}
                          </MessageResponse>
                        );
                      }
                      if (message.statusText) {
                        return (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" />
                            <span>{message.statusText}</span>
                          </div>
                        );
                      }
                      return (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="size-4 animate-spin" />
                          <span>{locale === 'zh-CN' ? '正在讲解…' : 'Explaining...'}</span>
                        </div>
                      );
                    })()}
                  </div>
                ),
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-md text-xs"
              onClick={() => void startExplanation({ force: true })}
              disabled={sending}
            >
              {sending ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 size-3.5" />
              )}
              {locale === 'zh-CN' ? '重新讲一遍' : 'Explain again'}
            </Button>
            <Button
              asChild
              size="sm"
              className="h-8 rounded-md bg-sky-600 px-3 text-xs text-white hover:bg-sky-500"
            >
              <Link href={chatHref}>
                <MessageCircle className="mr-1.5 size-3.5" />
                {locale === 'zh-CN' ? '回课程聊天继续问' : 'Open course chat'}
                <ExternalLink className="ml-1.5 size-3.5" />
              </Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
