import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { UIMessage } from 'ai';
import { planNotebookMessage, planNotebookMessageStream } from '@/lib/notebook/send-message';
import type { ChatMessageMetadata } from '@/lib/types/chat';
import type { StageListItem } from '@/lib/utils/stage-storage';
import { storeChatAttachmentBlob } from '@/lib/utils/chat-attachment-blobs';
import { loadContactMessages, saveContactMessages } from '@/lib/utils/contact-chat-storage';
import { createAgentTask, updateAgentTask } from '@/lib/utils/agent-task-storage';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { queueChatTurnWorkingMemoryUpdate } from '@/lib/learning/working-memory-tasks';
import {
  commitNotebookProblemImport,
  previewNotebookProblemImport,
} from '@/lib/utils/notebook-problem-api';
import {
  ATTACHMENT_ONLY_PLACEHOLDER,
  buildProblemBankImportPayload,
  shouldImportIntoProblemBank,
  stripProblemBankImportCommand,
} from './chat-attachment-utils';
import { buildChatMessage, shouldOfferMicroLessonButton } from './chat-message-utils';
import { NOTEBOOK_CHAT_PREVIEW_EVENT } from './chat-notebook-routing';
import { notebookProblemAskConversationText } from './notebook-problem-chat-card';
import type {
  NotebookAttachmentInput,
  NotebookChatMessage,
  NotebookSubtaskResult,
} from './chat-page-types';

export function useNotebookChatActions({
  courseId,
  notebookId,
  draft,
  pendingAttachments,
  sending,
  nbThread,
  notebookName,
  reloadNotebookScenes,
  setNbThread,
  setDraft,
  setSending,
  setNotebookPendingAction,
  setPendingAttachments,
}: {
  courseId: string | null | undefined;
  notebookId: string | null;
  draft: string;
  pendingAttachments: NotebookAttachmentInput[];
  sending: boolean;
  nbThread: NotebookChatMessage[];
  notebookName?: string | null;
  notebookAvatarUrl?: string | null;
  applyNotebookWrites: boolean;
  reloadNotebookScenes: () => Promise<void>;
  setNbThread: Dispatch<SetStateAction<NotebookChatMessage[]>>;
  setDraft: Dispatch<SetStateAction<string>>;
  setSending: Dispatch<SetStateAction<boolean>>;
  setNotebookPendingAction: Dispatch<SetStateAction<'chat' | 'import' | null>>;
  setPendingAttachments: Dispatch<SetStateAction<NotebookAttachmentInput[]>>;
}) {
  const persistNotebookConversation = useCallback(
    async (
      notebook: StageListItem,
      question: string,
      assistant: Omit<Extract<NotebookChatMessage, { role: 'assistant' }>, 'role' | 'at'>,
    ) => {
      if (!courseId) return;
      try {
        const existing = await loadContactMessages<NotebookChatMessage>(
          courseId,
          'notebook',
          notebook.id,
          { expectedTargetName: notebook.name },
        );
        const next: NotebookChatMessage[] = [
          ...existing,
          { role: 'user', text: question, at: Date.now() },
          { role: 'assistant', at: Date.now(), ...assistant },
        ];
        await saveContactMessages<NotebookChatMessage>({
          courseId,
          kind: 'notebook',
          targetId: notebook.id,
          targetName: notebook.name,
          messages: next,
        });
        window.dispatchEvent(
          new CustomEvent(NOTEBOOK_CHAT_PREVIEW_EVENT, {
            detail: { courseId, notebookId: notebook.id },
          }),
        );
      } catch {
        /* ignore notebook sync errors for orchestrator delegation */
      }
    },
    [courseId],
  );

  const runNotebookSubtask = useCallback(
    async (
      notebook: StageListItem,
      question: string,
      parentTaskId: string | null,
      appendAgentMessage?: (message: UIMessage<ChatMessageMetadata>) => void,
      attachments?: NotebookAttachmentInput[],
      streamCallbacks?: {
        onAnswerDelta?: (delta: string) => void;
        onStatus?: (message: string) => void;
      },
      options?: {
        persistConversation?: boolean;
      },
    ): Promise<NotebookSubtaskResult> => {
      const childTaskId =
        courseId && parentTaskId
          ? await createAgentTask({
              courseId,
              parentTaskId,
              contactKind: 'notebook',
              contactId: notebook.id,
              title: `子任务：${notebook.name}`,
              detail: '正在读取笔记本内容…',
              status: 'running',
            })
          : null;

      try {
        streamCallbacks?.onStatus?.('开始思考，正在查看笔记本内容…');
        const updateChildTaskStatus = (message: string) => {
          if (!childTaskId) return;
          void updateAgentTask(childTaskId, {
            detail: message.slice(0, 300),
            status: 'running',
          }).catch(() => undefined);
        };
        const plan = streamCallbacks
          ? await planNotebookMessageStream(
              notebook.id,
              question,
              {
                allowWrite: false,
                preferWebSearch: true,
                attachments: attachments && attachments.length > 0 ? attachments : undefined,
              },
              {
                onAnswerDelta: streamCallbacks.onAnswerDelta,
                onStatus: (message) => {
                  updateChildTaskStatus(message);
                  streamCallbacks.onStatus?.(message);
                },
              },
            )
          : await planNotebookMessage(notebook.id, question, {
              allowWrite: false,
              preferWebSearch: true,
              attachments: attachments && attachments.length > 0 ? attachments : undefined,
            });
        const answer = plan.answer;
        const answerDocument = plan.answerDocument;

        const assistantPayload: Omit<
          Extract<NotebookChatMessage, { role: 'assistant' }>,
          'role' | 'at'
        > = {
          answer,
          answerDocument,
          references: plan.references || [],
          knowledgeGap: plan.knowledgeGap,
          prerequisiteHints: plan.prerequisiteHints,
          promptLogId: plan.promptLogId,
          webSearchUsed: plan.webSearchUsed,
        };
        if (options?.persistConversation !== false) {
          await persistNotebookConversation(notebook, question, assistantPayload);
        }

        if (childTaskId) {
          await updateAgentTask(childTaskId, {
            detail: '已完成现有内容解答',
            status: 'done',
          });
        }

        return {
          notebook,
          answer,
          references: plan.references || [],
          knowledgeGap: plan.knowledgeGap,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (childTaskId) {
          await updateAgentTask(childTaskId, {
            detail: message.slice(0, 300),
            status: 'failed',
          });
        }
        appendAgentMessage?.(
          buildChatMessage(`《${notebook.name}》处理失败：${message}`, {
            senderName: notebook.name,
            senderAvatar: notebook.avatarUrl,
          }),
        );
        throw error;
      }
    },
    [courseId, persistNotebookConversation],
  );

  const handleImportNotebookProblemBank = useCallback(
    async (options?: { composerText?: string; commandTriggered?: boolean }) => {
      const currentDraft = options?.composerText ?? draft.trim();
      const importText = options?.commandTriggered
        ? stripProblemBankImportCommand(currentDraft)
        : currentDraft;
      const attachmentsSnapshot = [...pendingAttachments];
      const userFacingText =
        currentDraft || attachmentsSnapshot.length > 0
          ? options?.commandTriggered
            ? currentDraft || '导入到题库'
            : currentDraft
              ? `导入到题库\n\n${currentDraft}`
              : '导入到题库'
          : '';

      if ((!importText && attachmentsSnapshot.length === 0) || !notebookId || sending) return;
      const mc = getCurrentModelConfig();
      if (!mc.isServerConfigured) {
        window.alert('系统模型尚未配置，请联系管理员。');
        return;
      }

      try {
        await Promise.all(
          attachmentsSnapshot
            .filter((attachment): attachment is typeof attachment & { file: File } =>
              Boolean(attachment.file),
            )
            .map((attachment) => storeChatAttachmentBlob(attachment.id, attachment.file)),
        );
      } catch {
        /* IndexedDB 不可用时仍可导入，仅无法在刷新后再次打开附件 */
      }

      const userMsg: NotebookChatMessage = {
        role: 'user',
        text: userFacingText || ATTACHMENT_ONLY_PLACEHOLDER,
        at: Date.now(),
        attachments: attachmentsSnapshot.map((attachment) => ({
          id: attachment.id,
          name: attachment.name,
          mimeType: attachment.mimeType,
          size: attachment.size,
          objectUrl: attachment.file ? URL.createObjectURL(attachment.file) : undefined,
        })),
      };
      setNbThread((thread) => [...thread, userMsg]);
      setDraft('');
      setSending(true);
      setNotebookPendingAction('import');

      const taskTitleSeed =
        importText ||
        attachmentsSnapshot.map((attachment) => attachment.name).join('、') ||
        '新题目';
      const taskId =
        courseId && notebookId
          ? await createAgentTask({
              courseId,
              contactKind: 'notebook',
              contactId: notebookId,
              title: `题库导入：${taskTitleSeed.slice(0, 36)}`,
              detail: '正在解析题目并写入题库…',
              status: 'running',
            })
          : null;

      try {
        const payload = await buildProblemBankImportPayload({
          text: importText,
          attachments: attachmentsSnapshot,
        });
        const { drafts } = await previewNotebookProblemImport({
          notebookId,
          source: payload.source,
          text: payload.text,
          language: 'zh-CN',
        });
        const importedProblems = await commitNotebookProblemImport({
          notebookId,
          drafts,
        });
        void reloadNotebookScenes();

        const notes: string[] = [];
        if (payload.warnings.length > 0) {
          notes.push(`解析提示：${payload.warnings.join('；')}`);
        }
        if (payload.skippedAttachments.length > 0) {
          notes.push(`以下附件未导入：${payload.skippedAttachments.join('、')}`);
        }

        const assistantMsg: NotebookChatMessage = {
          role: 'assistant',
          answer: `已导入 ${importedProblems.length} 道题到题库。你现在可以切到题库页开始做题了。${
            notes.length > 0 ? `\n\n${notes.join('\n')}` : ''
          }`,
          references: [],
          knowledgeGap: false,
          at: Date.now(),
        };
        setNbThread((thread) => [...thread, assistantMsg]);
        setPendingAttachments([]);
        if (taskId) {
          await updateAgentTask(taskId, {
            status: 'done',
            detail: `已导入 ${importedProblems.length} 道题到题库`,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setNbThread((thread) => [
          ...thread,
          {
            role: 'assistant',
            answer: `题库导入失败：${message}`,
            references: [],
            knowledgeGap: false,
            at: Date.now(),
          },
        ]);
        if (taskId) {
          await updateAgentTask(taskId, {
            status: 'failed',
            detail: message.slice(0, 300),
          });
        }
      } finally {
        setSending(false);
        setNotebookPendingAction(null);
      }
    },
    [
      courseId,
      draft,
      notebookId,
      pendingAttachments,
      reloadNotebookScenes,
      sending,
      setDraft,
      setNbThread,
      setNotebookPendingAction,
      setPendingAttachments,
      setSending,
    ],
  );

  const handleSendNotebook = useCallback(
    async (options?: { text?: string }) => {
      const text = (options?.text ?? draft).trim();
      if (!text || !notebookId || sending) return;
      const mc = getCurrentModelConfig();
      if (!mc.isServerConfigured) {
        window.alert('系统模型尚未配置，请联系管理员。');
        return;
      }
      const attachmentsSnapshot = [...pendingAttachments];

      try {
        await Promise.all(
          attachmentsSnapshot
            .filter((a): a is typeof a & { file: File } => Boolean(a.file))
            .map((a) => storeChatAttachmentBlob(a.id, a.file)),
        );
      } catch {
        /* IndexedDB 不可用时仍可发送，仅无法在刷新后再次打开附件 */
      }

      const userMsg: NotebookChatMessage = {
        role: 'user',
        text,
        at: Date.now(),
        attachments: attachmentsSnapshot.map((a) => ({
          id: a.id,
          name: a.name,
          mimeType: a.mimeType,
          size: a.size,
          objectUrl: a.file ? URL.createObjectURL(a.file) : undefined,
        })),
      };
      setNbThread((t) => [...t, userMsg]);
      setDraft('');
      setSending(true);
      setNotebookPendingAction('chat');
      const taskId =
        courseId && notebookId
          ? await createAgentTask({
              courseId,
              contactKind: 'notebook',
              contactId: notebookId,
              title: `笔记本问答：${text.slice(0, 36)}`,
              detail: '正在生成回答…',
              status: 'running',
            })
          : null;
      let streamingAssistantAt: number | null = null;
      try {
        const conversation = [...nbThread, userMsg].slice(-12).map((m) =>
          m.role === 'user'
            ? {
                role: 'user' as const,
                content: `${m.text}${m.problemAsk ? notebookProblemAskConversationText(m.problemAsk) : ''}`,
                at: m.at,
              }
            : { role: 'assistant' as const, content: m.answer, at: m.at },
        );
        if (shouldImportIntoProblemBank(text)) {
          const payload = await buildProblemBankImportPayload({
            text: stripProblemBankImportCommand(text),
            attachments: attachmentsSnapshot,
          });
          const { drafts } = await previewNotebookProblemImport({
            notebookId,
            source: payload.source,
            text: payload.text,
            language: 'zh-CN',
          });
          const importedProblems = await commitNotebookProblemImport({
            notebookId,
            drafts,
          });
          void reloadNotebookScenes();
          const notes: string[] = [];
          if (payload.warnings.length > 0) {
            notes.push(`解析提示：${payload.warnings.join('；')}`);
          }
          if (payload.skippedAttachments.length > 0) {
            notes.push(`以下附件未导入：${payload.skippedAttachments.join('、')}`);
          }
          const assistantMsg: NotebookChatMessage = {
            role: 'assistant',
            answer: `已导入 ${importedProblems.length} 道题到题库。你现在可以切到题库页开始做题了。${
              notes.length > 0 ? `\n\n${notes.join('\n')}` : ''
            }`,
            references: [],
            knowledgeGap: false,
            at: Date.now(),
          };
          setNbThread((t) => [...t, assistantMsg]);
          setPendingAttachments([]);
          if (taskId) {
            await updateAgentTask(taskId, {
              status: 'done',
              detail: `已导入 ${importedProblems.length} 道题到题库`,
            });
          }
          return;
        }
        streamingAssistantAt = Date.now();
        let streamedAnswer = '';
        setNbThread((t) => [
          ...t,
          {
            role: 'assistant',
            answer: '',
            references: [],
            knowledgeGap: false,
            streaming: true,
            at: streamingAssistantAt!,
          },
        ]);
        const updateStreamingAssistant = (
          patch: Partial<Extract<NotebookChatMessage, { role: 'assistant' }>>,
        ) => {
          const targetAt = streamingAssistantAt;
          if (!targetAt) return;
          setNbThread((t) =>
            t.map((m) =>
              m.role === 'assistant' && m.at === targetAt
                ? {
                    ...m,
                    ...patch,
                  }
                : m,
            ),
          );
        };

        const plan = await planNotebookMessageStream(
          notebookId,
          text,
          {
            allowWrite: false,
            preferWebSearch: true,
            conversation,
            attachments: attachmentsSnapshot,
          },
          {
            onAnswerDelta: (delta) => {
              streamedAnswer += delta;
              updateStreamingAssistant({
                answer: streamedAnswer,
                streaming: true,
                statusText: undefined,
              });
            },
            onStatus: (message) => {
              updateStreamingAssistant({
                answer: streamedAnswer,
                streaming: false,
                statusText: message,
              });
            },
          },
        );
        if (taskId) {
          await updateAgentTask(taskId, {
            detail: '正在整理现有内容回答…',
            status: 'running',
          });
        }

        const finalAnswer = plan.answer;
        const answerDocument = plan.answerDocument;
        const assistantMsg: NotebookChatMessage = {
          role: 'assistant',
          answer: finalAnswer,
          answerDocument,
          references: plan.references || [],
          knowledgeGap: plan.knowledgeGap,
          prerequisiteHints: plan.prerequisiteHints,
          promptLogId: plan.promptLogId,
          webSearchUsed: plan.webSearchUsed,
          lessonSourceQuestion: shouldOfferMicroLessonButton(text) ? text : undefined,
          streaming: false,
          statusText: undefined,
          at: streamingAssistantAt!,
        };
        setNbThread((t) =>
          t.map((m) =>
            m.role === 'assistant' && m.at === streamingAssistantAt ? assistantMsg : m,
          ),
        );
        setPendingAttachments([]);
        if (taskId) {
          await updateAgentTask(taskId, {
            status: 'done',
            detail: '已完成',
          });
        }
        queueChatTurnWorkingMemoryUpdate({
          notebookId,
          notebookName,
          question: text,
          plan,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const errorMessage: NotebookChatMessage = {
          role: 'assistant',
          answer: `请求失败：${msg}`,
          references: [],
          knowledgeGap: false,
          streaming: false,
          statusText: undefined,
          at: streamingAssistantAt ?? Date.now(),
        };
        setNbThread((t) =>
          streamingAssistantAt
            ? t.map((m) =>
                m.role === 'assistant' && m.at === streamingAssistantAt ? errorMessage : m,
              )
            : [...t, errorMessage],
        );
        if (taskId) {
          await updateAgentTask(taskId, { status: 'failed', detail: msg.slice(0, 300) });
        }
      } finally {
        setSending(false);
        setNotebookPendingAction(null);
      }
    },
    [
      courseId,
      draft,
      nbThread,
      notebookId,
      notebookName,
      pendingAttachments,
      reloadNotebookScenes,
      sending,
      setDraft,
      setNbThread,
      setNotebookPendingAction,
      setPendingAttachments,
      setSending,
    ],
  );

  return {
    handleImportNotebookProblemBank,
    handleSendNotebook,
    persistNotebookConversation,
    runNotebookSubtask,
  };
}
