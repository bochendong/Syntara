'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, MessageCircle, RefreshCw, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageResponse } from '@/components/ai-elements/message';
import type {
  NotebookChatMessage,
  NotebookProblemChatCard,
} from '@/components/chat/chat-page-types';
import {
  NotebookProblemChatCardView,
  notebookProblemAskConversationText,
} from '@/components/chat/notebook-problem-chat-card';
import { NOTEBOOK_CHAT_PREVIEW_EVENT } from '@/components/chat/chat-notebook-routing';
import { cn } from '@/lib/utils';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { loadContactMessages, saveContactMessages } from '@/lib/utils/contact-chat-storage';
import { planNotebookMessageStream } from '@/lib/notebook/send-message';
import type { NotebookProblemPublicContent, NotebookProblemGrading } from '@/lib/problem-bank';
import type { NotebookProblemClientRecord } from '@/lib/utils/notebook-problem-api';
import type { StageListItem } from '@/lib/utils/stage-storage';
import { toast } from '@/lib/notifications/client-toast';

const USER_PROBLEM_HELP_TEXT = '我不会这道题，请完整讲解一下。';

const drawerAssistantClassName = cn(
  'text-[13px] leading-6 text-slate-900 dark:text-slate-50',
  '[&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-0.5',
  '[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold',
  '[&_h2]:mt-4 [&_h2]:mb-1.5 [&_h2]:text-sm [&_h2]:font-semibold',
  '[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold',
  '[&_[data-streamdown=code-block]]:my-4 [&_[data-streamdown=code-block]]:rounded-lg',
);

function cleanPromptText(input: string | undefined): string {
  return (input || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clipPromptText(input: string, maxLength = 6000): string {
  if (input.length <= maxLength) return input;
  return `${input.slice(0, maxLength)}\n...`;
}

function formatProblemContentForPrompt(content: NotebookProblemPublicContent): string {
  const lines: string[] = [];
  if ('stem' in content) {
    lines.push(`题干：${cleanPromptText(content.stem)}`);
  }
  if (content.type === 'choice') {
    lines.push(`选择方式：${content.selectionMode === 'multiple' ? '多选' : '单选'}`);
    lines.push(
      `选项：${content.options
        .map((option) => `${option.id}. ${cleanPromptText(option.label)}`)
        .join('\n')}`,
    );
  }
  if (content.type === 'fill_blank') {
    lines.push(`题干：${cleanPromptText(content.stemTemplate)}`);
    lines.push(
      `空格：${content.blanks
        .map((blank) => `${blank.id}${blank.placeholder ? `（${blank.placeholder}）` : ''}`)
        .join('、')}`,
    );
  }
  if (content.type === 'calculation' && content.unit) {
    lines.push(`单位：${content.unit}`);
  }
  if (content.type === 'code') {
    if (content.functionSignature) lines.push(`函数签名：${content.functionSignature}`);
    if (content.constraints.length > 0) lines.push(`约束：${content.constraints.join('；')}`);
    if (content.sampleIO.length > 0) {
      lines.push(
        `样例：${content.sampleIO
          .map((item, index) => {
            const note = item.explanation ? `，说明：${cleanPromptText(item.explanation)}` : '';
            return `样例${index + 1} 输入 ${item.input}，输出 ${item.output}${note}`;
          })
          .join('\n')}`,
      );
    }
    if (content.starterCode) lines.push(`起始代码：\n${clipPromptText(content.starterCode, 3000)}`);
  }
  if (content.explanation) {
    lines.push(`题目已有说明：${cleanPromptText(content.explanation)}`);
  }
  const images = content.assets?.images || [];
  if (images.length > 0) {
    lines.push(
      `题目图片：${images
        .map((image) => image.caption || image.alt || image.id)
        .filter(Boolean)
        .join('；')}`,
    );
  }
  return lines.filter(Boolean).join('\n');
}

function formatGradingForPrompt(grading: NotebookProblemGrading): string {
  switch (grading.type) {
    case 'choice':
      return [
        `正确选项：${grading.correctOptionIds.join('、')}`,
        grading.analysis ? `解析：${cleanPromptText(grading.analysis)}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    case 'fill_blank':
      return [
        `参考答案：${grading.blanks
          .map((blank) => `${blank.id}: ${blank.acceptedAnswers.join(' / ')}`)
          .join('；')}`,
        grading.analysis ? `解析：${cleanPromptText(grading.analysis)}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    case 'calculation':
      return [
        grading.referenceAnswer ? `参考答案：${grading.referenceAnswer}` : '',
        grading.acceptedForms.length > 0 ? `可接受形式：${grading.acceptedForms.join('；')}` : '',
        grading.analysis ? `解析：${cleanPromptText(grading.analysis)}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    case 'short_answer':
      return [
        grading.referenceAnswer ? `参考答案：${cleanPromptText(grading.referenceAnswer)}` : '',
        grading.rubric ? `评分标准：${cleanPromptText(grading.rubric)}` : '',
        grading.analysis ? `解析：${cleanPromptText(grading.analysis)}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    case 'proof':
      return [
        grading.referenceProof ? `参考证明：${cleanPromptText(grading.referenceProof)}` : '',
        grading.rubric ? `评分标准：${cleanPromptText(grading.rubric)}` : '',
        grading.analysis ? `解析：${cleanPromptText(grading.analysis)}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    case 'code':
      return grading.analysis ? `解析：${cleanPromptText(grading.analysis)}` : '';
    default:
      return '';
  }
}

function buildProblemExplainPrompt(args: {
  problem: NotebookProblemClientRecord;
  problemTitle: string;
  problemContent: NotebookProblemPublicContent;
  notebookName: string;
}): string {
  const gradingText = formatGradingForPrompt(args.problem.grading);
  return clipPromptText(
    [
      `学生正在做《${args.notebookName}》中的一道题，不会做。请作为这个章节的 AI 老师，完整讲解整道题。`,
      '讲解要求：先解释题意和考点，再给出清晰步骤，最后给出答案；不要只给结论；语气像在旁边辅导学生。',
      `题目标题：${args.problemTitle || args.problem.title}`,
      `题型：${args.problem.type}`,
      args.problem.problemNumber ? `题号：${args.problem.problemNumber}` : '',
      formatProblemContentForPrompt(args.problemContent),
      gradingText ? `\n可参考的标准答案或解析：\n${gradingText}` : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    14000,
  );
}

function notebookMessageToConversation(message: NotebookChatMessage) {
  if (message.role === 'user') {
    return {
      role: 'user' as const,
      content: `${message.text}${
        message.problemAsk ? notebookProblemAskConversationText(message.problemAsk) : ''
      }`,
      at: message.at,
    };
  }
  return { role: 'assistant' as const, content: message.answer, at: message.at };
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
}: {
  courseId: string;
  problem: NotebookProblemClientRecord;
  problemTitle: string;
  problemContent: NotebookProblemPublicContent | null;
  notebook: StageListItem | null;
  notebookLabel: string;
  locale: string;
}) {
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState<NotebookChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const targetNotebookId = problem.notebookId || notebook?.id || '';
  const targetNotebookName =
    notebook?.name || notebookLabel || problem.notebookName || '当前笔记本';
  const chatHref = targetNotebookId
    ? `/chat?notebook=${encodeURIComponent(targetNotebookId)}`
    : '/chat';

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
      if (!targetNotebookId || !problemCard) {
        toast.error(
          locale === 'zh-CN' ? '这道题还没有关联章节。' : 'This problem has no notebook yet.',
        );
        return;
      }
      if (!problemContent) {
        toast.error(
          locale === 'zh-CN' ? '题目内容还没加载完成。' : 'Problem content is still loading.',
        );
        return;
      }
      const modelConfig = getCurrentModelConfig();
      if (!modelConfig.isServerConfigured) {
        window.alert('系统模型尚未配置，请联系管理员。');
        return;
      }

      const userAt = Date.now();
      const assistantAt = userAt + 1;
      const userMsg: NotebookChatMessage = {
        role: 'user',
        text: USER_PROBLEM_HELP_TEXT,
        at: userAt,
        problemAsk: problemCard,
      };
      const streamingMsg: NotebookChatMessage = {
        role: 'assistant',
        answer: '',
        references: [],
        knowledgeGap: false,
        streaming: true,
        statusText: '正在读取题目和章节内容…',
        at: assistantAt,
      };
      setThread([userMsg, streamingMsg]);
      setSending(true);

      let streamedAnswer = '';
      try {
        const existing = await loadContactMessages<NotebookChatMessage>(
          courseId,
          'notebook',
          targetNotebookId,
          { ignoreCourseId: true, expectedTargetName: targetNotebookName },
        );
        const prompt = buildProblemExplainPrompt({
          problem,
          problemTitle,
          problemContent,
          notebookName: targetNotebookName,
        });
        const conversation = [...existing, userMsg]
          .slice(-12)
          .map((message) => notebookMessageToConversation(message));
        const plan = await planNotebookMessageStream(
          targetNotebookId,
          prompt,
          {
            allowWrite: false,
            preferWebSearch: false,
            conversation,
          },
          {
            onAnswerDelta: (delta) => {
              streamedAnswer += delta;
              setThread((current) =>
                current.map((message) =>
                  message.role === 'assistant' && message.at === assistantAt
                    ? {
                        ...message,
                        answer: streamedAnswer,
                        streaming: true,
                        statusText: undefined,
                      }
                    : message,
                ),
              );
            },
            onStatus: (message) => {
              setThread((current) =>
                current.map((item) =>
                  item.role === 'assistant' && item.at === assistantAt
                    ? { ...item, statusText: message, streaming: false }
                    : item,
                ),
              );
            },
          },
        );
        const assistantMsg: NotebookChatMessage = {
          role: 'assistant',
          answer: plan.answer,
          answerDocument: plan.answerDocument,
          references: plan.references || [],
          knowledgeGap: plan.knowledgeGap,
          prerequisiteHints: plan.prerequisiteHints,
          webSearchUsed: plan.webSearchUsed,
          streaming: false,
          statusText: undefined,
          at: assistantAt,
        };
        const nextMessages = [...existing, userMsg, assistantMsg];
        await saveContactMessages<NotebookChatMessage>({
          courseId,
          kind: 'notebook',
          targetId: targetNotebookId,
          targetName: targetNotebookName,
          messages: nextMessages,
        });
        window.dispatchEvent(
          new CustomEvent(NOTEBOOK_CHAT_PREVIEW_EVENT, {
            detail: { courseId, notebookId: targetNotebookId },
          }),
        );
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
      locale,
      problem,
      problemCard,
      problemContent,
      problemTitle,
      sending,
      targetNotebookId,
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
        title={targetNotebookId ? targetNotebookName : '这道题还没有关联章节'}
      >
        {sending ? (
          <Loader2 className="mr-1.5 size-3.5 animate-spin" />
        ) : (
          <AgentAvatar avatarUrl={notebook?.avatarUrl} label={targetNotebookName} compact />
        )}
        {locale === 'zh-CN' ? 'AI 讲题' : 'Explain'}
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/25 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-label={locale === 'zh-CN' ? 'AI 讲题' : 'AI explanation'}
          onClick={() => setOpen(false)}
        >
          <aside
            className="flex h-full w-full max-w-[440px] flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <AgentAvatar avatarUrl={notebook?.avatarUrl} label={targetNotebookName} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-950 dark:text-white">
                  <Sparkles className="size-4 text-sky-600 dark:text-sky-300" />
                  {locale === 'zh-CN' ? '本章 AI 讲题' : 'Chapter AI'}
                </p>
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

            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-4 px-4 py-4">
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
                      className="rounded-lg bg-slate-50 px-3 py-3 dark:bg-white/[0.04]"
                    >
                      {message.answer ? (
                        <MessageResponse className={drawerAssistantClassName}>
                          {message.answer}
                        </MessageResponse>
                      ) : message.statusText ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="size-4 animate-spin" />
                          <span>{message.statusText}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="size-4 animate-spin" />
                          <span>{locale === 'zh-CN' ? '正在讲解…' : 'Explaining...'}</span>
                        </div>
                      )}
                    </div>
                  ),
                )}
              </div>
            </ScrollArea>

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
                  {locale === 'zh-CN' ? '去聊天页继续问' : 'Open chat'}
                  <ExternalLink className="ml-1.5 size-3.5" />
                </Link>
              </Button>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
