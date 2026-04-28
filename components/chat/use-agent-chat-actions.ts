import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { UIMessage } from 'ai';
import { runCourseSideChatLoop } from '@/lib/chat/run-course-side-chat-loop';
import { COURSE_ORCHESTRATOR_ID, COURSE_ORCHESTRATOR_NAME } from '@/lib/constants/course-chat';
import type { NotebookGenerationProgress } from '@/lib/create/run-notebook-generation-task';
import { createLogger } from '@/lib/logger';
import { useNotebookGenerationQueueStore } from '@/lib/store/notebook-generation-queue';
import { useOrchestratorNotebookGenStore } from '@/lib/store/orchestrator-notebook-generation';
import type { ChatMessageMetadata } from '@/lib/types/chat';
import { USER_AVATAR } from '@/lib/types/roundtable';
import type { Scene } from '@/lib/types/stage';
import { cancelAgentTask, createAgentTask, updateAgentTask } from '@/lib/utils/agent-task-storage';
import { toChatAgentConfig, type CourseAgentListItem } from '@/lib/utils/course-agents';
import { storeChatAttachmentBlob } from '@/lib/utils/chat-attachment-blobs';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { listStagesByCourse } from '@/lib/utils/stage-storage';
import { PDF_PAGE_SELECTION_MAX_BYTES, type PdfSourceSelection } from '@/lib/pdf/page-selection';
import {
  ATTACHMENT_ONLY_PLACEHOLDER,
  isNotebookPipelineSourceFile,
  mergeOrchestratorPrompt,
} from './chat-attachment-utils';
import { buildChatMessage } from './chat-message-utils';
import { decideNotebookRoute } from './chat-notebook-routing';
import type {
  NotebookAttachmentInput,
  NotebookSubtaskResult,
  OrchestratorComposerMode,
  OrchestratorViewMode,
} from './chat-page-types';

const log = createLogger('ChatPage');

export function useAgentChatActions({
  agentId,
  selectedAgent,
  sending,
  draft,
  pendingAttachments,
  orchestratorViewMode,
  orchestratorComposerMode,
  switchOrchestratorComposer,
  setOrchestratorPdfSelectionFile,
  setOrchestratorPdfSelectionDialogOpen,
  abortRef,
  nickname,
  userAvatar,
  agThread,
  setAgThread,
  setDraft,
  setPendingAttachments,
  setSending,
  courseId,
  enqueueNotebookGeneration,
  trackedOrchestratorCreateTaskIdRef,
  setActiveOrchestratorTaskId,
  orchestratorCompletionAnnouncedRef,
  setOrchestratorPipelineProgress,
  orchestratorAvatar,
  shouldRenderGroupReplies,
  runNotebookSubtask,
}: {
  agentId: string | null;
  selectedAgent: CourseAgentListItem | null;
  sending: boolean;
  draft: string;
  pendingAttachments: NotebookAttachmentInput[];
  orchestratorViewMode: OrchestratorViewMode;
  orchestratorComposerMode: OrchestratorComposerMode;
  switchOrchestratorComposer: (mode: OrchestratorComposerMode) => void;
  setOrchestratorPdfSelectionFile: Dispatch<SetStateAction<File | null>>;
  setOrchestratorPdfSelectionDialogOpen: Dispatch<SetStateAction<boolean>>;
  abortRef: MutableRefObject<AbortController | null>;
  nickname: string;
  userAvatar?: string | null;
  agThread: UIMessage<ChatMessageMetadata>[];
  setAgThread: Dispatch<SetStateAction<UIMessage<ChatMessageMetadata>[]>>;
  setDraft: Dispatch<SetStateAction<string>>;
  setPendingAttachments: Dispatch<SetStateAction<NotebookAttachmentInput[]>>;
  setSending: Dispatch<SetStateAction<boolean>>;
  courseId: string | null | undefined;
  enqueueNotebookGeneration: ReturnType<typeof useNotebookGenerationQueueStore.getState>['enqueue'];
  trackedOrchestratorCreateTaskIdRef: MutableRefObject<string | null>;
  setActiveOrchestratorTaskId: Dispatch<SetStateAction<string | null>>;
  orchestratorCompletionAnnouncedRef: MutableRefObject<string | null>;
  setOrchestratorPipelineProgress: Dispatch<SetStateAction<NotebookGenerationProgress | null>>;
  orchestratorAvatar?: string | null;
  shouldRenderGroupReplies: boolean;
  runNotebookSubtask: (
    notebook: Awaited<ReturnType<typeof listStagesByCourse>>[number],
    question: string,
    parentTaskId: string | null,
    appendAgentMessage?: (message: UIMessage<ChatMessageMetadata>) => void,
    attachments?: NotebookAttachmentInput[],
  ) => Promise<NotebookSubtaskResult>;
}) {
  return useCallback(
    async (forcedSourcePageSelection?: PdfSourceSelection) => {
      const text = draft.trim();
      if (!agentId || !selectedAgent || sending) return;
      if (selectedAgent.id === COURSE_ORCHESTRATOR_ID) {
        if (!text && pendingAttachments.length === 0) return;
      } else if (!text) {
        return;
      }
      const mc = getCurrentModelConfig();
      if (!mc.isServerConfigured) {
        window.alert('系统模型尚未配置，请联系管理员。');
        return;
      }

      const orchAttachments =
        selectedAgent.id === COURSE_ORCHESTRATOR_ID ? [...pendingAttachments] : [];
      const sourceFileForPipeline =
        selectedAgent.id === COURSE_ORCHESTRATOR_ID
          ? (orchAttachments.find((a) => a.file && isNotebookPipelineSourceFile(a.file))?.file ??
            null)
          : null;

      if (
        selectedAgent.id === COURSE_ORCHESTRATOR_ID &&
        orchestratorViewMode === 'private' &&
        orchestratorComposerMode === 'send-message' &&
        sourceFileForPipeline
      ) {
        switchOrchestratorComposer('generate-notebook');
        return;
      }

      const effectiveSourcePageSelection =
        sourceFileForPipeline &&
        ((sourceFileForPipeline.type || '').toLowerCase() === 'application/pdf' ||
          sourceFileForPipeline.name.toLowerCase().endsWith('.pdf'))
          ? forcedSourcePageSelection
          : undefined;

      if (
        selectedAgent.id === COURSE_ORCHESTRATOR_ID &&
        orchestratorViewMode === 'private' &&
        orchestratorComposerMode === 'generate-notebook' &&
        sourceFileForPipeline &&
        ((sourceFileForPipeline.type || '').toLowerCase() === 'application/pdf' ||
          sourceFileForPipeline.name.toLowerCase().endsWith('.pdf')) &&
        sourceFileForPipeline.size > PDF_PAGE_SELECTION_MAX_BYTES &&
        !effectiveSourcePageSelection
      ) {
        setOrchestratorPdfSelectionFile(sourceFileForPipeline);
        setOrchestratorPdfSelectionDialogOpen(true);
        return;
      }
      const mergedPrompt =
        selectedAgent.id === COURSE_ORCHESTRATOR_ID
          ? mergeOrchestratorPrompt(text, orchAttachments, Boolean(sourceFileForPipeline))
          : text;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await Promise.all(
          orchAttachments
            .filter((a): a is typeof a & { file: File } => Boolean(a.file))
            .map((a) => storeChatAttachmentBlob(a.id, a.file)),
        );
      } catch {
        /* IndexedDB 不可用时仍可发送 */
      }

      const userMessage = buildChatMessage(
        text || (orchAttachments.length ? ATTACHMENT_ONLY_PLACEHOLDER : ''),
        {
          senderName: nickname.trim() || '我',
          senderAvatar: userAvatar || USER_AVATAR,
          originalRole: 'user',
          attachments:
            orchAttachments.length > 0
              ? orchAttachments.map((a) => ({
                  id: a.id,
                  name: a.name,
                  mimeType: a.mimeType,
                  size: a.size,
                  objectUrl: a.file ? URL.createObjectURL(a.file) : undefined,
                }))
              : undefined,
        },
      );

      let nextThread = [...agThread, userMessage];
      setAgThread(nextThread);
      setDraft('');
      if (selectedAgent.id === COURSE_ORCHESTRATOR_ID) {
        setPendingAttachments([]);
      }
      setSending(true);

      const appendAgentMessage = (message: UIMessage<ChatMessageMetadata>) => {
        nextThread = [...nextThread, message];
        setAgThread(nextThread);
      };

      if (selectedAgent.id === COURSE_ORCHESTRATOR_ID) {
        if (orchestratorViewMode === 'private' && orchestratorComposerMode === 'send-message') {
          const agentConfigs = [toChatAgentConfig(selectedAgent)];
          const getStoreState = () => ({
            stage: null,
            scenes: [] as Scene[],
            currentSceneId: null,
            mode: 'playback' as const,
            whiteboardOpen: false,
          });
          try {
            await runCourseSideChatLoop({
              initialMessages: nextThread,
              agentIds: [COURSE_ORCHESTRATOR_ID],
              agentConfigs,
              getStoreState,
              userProfile: { nickname: nickname.trim() || undefined },
              apiKey: mc.apiKey,
              baseUrl: mc.baseUrl || undefined,
              model: mc.modelString,
              signal: controller.signal,
              onMessages: setAgThread,
            });
          } catch (e) {
            if (e instanceof DOMException && e.name === 'AbortError') return;
            const msg = e instanceof Error ? e.message : String(e);
            const errId = `err-${Date.now()}`;
            setAgThread((t) => [
              ...t,
              {
                id: errId,
                role: 'assistant',
                parts: [{ type: 'text', text: `发送失败：${msg}` }],
                metadata: {
                  senderName: '系统',
                  originalRole: 'agent',
                  createdAt: Date.now(),
                },
              },
            ]);
          } finally {
            if (abortRef.current === controller) abortRef.current = null;
            setSending(false);
          }
          return;
        }

        let parentTaskId: string | null = null;
        if (courseId) {
          try {
            parentTaskId = await createAgentTask({
              courseId,
              contactKind: 'agent',
              contactId: COURSE_ORCHESTRATOR_ID,
              title: `总控任务：${mergedPrompt.slice(0, 36)}`,
              detail: '正在判断该需求应该走创建、单笔记本还是多笔记本协作流…',
              status: 'running',
            });
          } catch (error) {
            throw error;
          }
        }
        if (parentTaskId) {
          setActiveOrchestratorTaskId(parentTaskId);
          trackedOrchestratorCreateTaskIdRef.current = parentTaskId;
        }

        try {
          const notebooks = courseId ? await listStagesByCourse(courseId) : [];
          const decision = decideNotebookRoute(
            mergedPrompt,
            notebooks,
            orchestratorViewMode,
            orchAttachments.length > 0,
          );

          if (decision.type === 'create') {
            if (parentTaskId) {
              await updateAgentTask(parentTaskId, {
                detail: '已加入笔记本生成队列，等待自动开始…',
                status: 'running',
              });
            }

            const orchGen = useOrchestratorNotebookGenStore.getState();
            enqueueNotebookGeneration(
              {
                courseId: courseId || undefined,
                generationTaskId: parentTaskId,
                requirement: mergedPrompt,
                modelIdOverride: orchGen.modelIdOverride,
                notebookStageModelOverrides: orchGen.notebookStageModelOverrides,
                notebookModelMode: orchGen.notebookModelMode,
                language: orchGen.language,
                webSearch: orchGen.webSearch,
                generateSlides: orchGen.generateSlides,
                slideGenerationRoute: orchGen.slideGenerationRoute,
                userNickname: nickname.trim() || undefined,
                sourceFile: sourceFileForPipeline,
                sourcePageSelection: effectiveSourcePageSelection,
                imageGenerationEnabledOverride: orchGen.useAiImages,
                outlinePreferences: {
                  length: orchGen.outlineLength,
                  includeQuizScenes: orchGen.includeQuizScenes,
                  workedExampleLevel: orchGen.workedExampleLevel ?? 'moderate',
                },
              },
              {
                onProgress: (_task, progress) => {
                  log.info('[Orchestrator] Notebook generation progress', {
                    stage: progress.stage,
                    detail: progress.detail,
                    completed: 'completed' in progress ? progress.completed : undefined,
                    total: 'total' in progress ? progress.total : undefined,
                    notebookId: 'notebookId' in progress ? progress.notebookId : undefined,
                  });
                  if (progress.stage === 'completed') {
                    return;
                  }
                  if (progress.stage === 'notebook-ready') {
                    if (courseId) {
                      window.dispatchEvent(
                        new CustomEvent('synatra-notebook-list-updated', {
                          detail: { courseId, notebookId: progress.notebookId },
                        }),
                      );
                    }
                    if (parentTaskId) {
                      void updateAgentTask(parentTaskId, {
                        detail: progress.detail,
                        status: 'running',
                        notebookId: progress.notebookId,
                      });
                    }
                  }
                  setOrchestratorPipelineProgress(progress);
                  if (parentTaskId) {
                    void updateAgentTask(parentTaskId, {
                      detail: progress.detail,
                      status: 'running',
                    });
                  }
                },
                onCompleted: (_task, created) => {
                  const generatedSlides = created.scenes.length > 0;
                  setAgThread((thread) => [
                    ...thread,
                    buildChatMessage(
                      generatedSlides
                        ? `笔记本「${created.stage.name}」已创建完成。现在可以直接打开它开始提问、查看内容或听讲。`
                        : `笔记本「${created.stage.name}」已加入仓库。按你的设置，这次没有生成 PPT 课件。`,
                      {
                        senderName: COURSE_ORCHESTRATOR_NAME,
                        senderAvatar: orchestratorAvatar,
                        originalRole: 'teacher',
                        actions: [
                          {
                            id: `open-notebook:${created.stage.id}`,
                            label: '打开笔记本',
                            variant: 'highlight',
                          },
                        ],
                      },
                    ),
                  ]);
                  log.info('[Orchestrator] Notebook generation task completed', {
                    notebookId: created.stage.id,
                    notebookName: created.stage.name,
                    outlineCount: created.outlines.length,
                    generatedSceneCount: created.scenes.length,
                    generatedSceneOrders: created.scenes.map((scene) => scene.order),
                    failedSceneCount: created.failedScenes?.length ?? 0,
                    failedScenes: (created.failedScenes || []).map((item) => ({
                      outlineId: item.outlineId,
                      title: item.title,
                      error: item.error,
                    })),
                  });
                  if (courseId) {
                    window.dispatchEvent(
                      new CustomEvent('synatra-notebook-list-updated', {
                        detail: { courseId, notebookId: created.stage.id },
                      }),
                    );
                  }
                  if (parentTaskId) {
                    orchestratorCompletionAnnouncedRef.current = parentTaskId;
                    void updateAgentTask(parentTaskId, {
                      detail: `创建完成：${created.stage.name}`,
                      status: 'done',
                      notebookId: created.stage.id,
                    });
                  }
                  setOrchestratorPipelineProgress(null);
                },
                onFailed: (_task, message) => {
                  setAgThread((thread) => [
                    ...thread,
                    buildChatMessage(`总控任务失败：${message}`, {
                      senderName: '系统',
                      originalRole: 'agent',
                    }),
                  ]);
                  if (parentTaskId) {
                    void updateAgentTask(parentTaskId, {
                      status: 'failed',
                      detail: message.slice(0, 300),
                    });
                  }
                  setOrchestratorPipelineProgress(null);
                },
                onCancelled: () => {
                  if (parentTaskId) {
                    void cancelAgentTask(parentTaskId, '任务已取消');
                  }
                  setOrchestratorPipelineProgress(null);
                },
              },
            );
            appendAgentMessage(
              buildChatMessage(
                orchGen.generateSlides
                  ? '已加入笔记本生成队列。你可以继续上传下一个笔记本，我会按顺序生成。'
                  : '已加入笔记本生成队列。这个任务会只加入仓库，不生成 PPT；你可以继续上传下一个笔记本。',
                {
                  senderName: COURSE_ORCHESTRATOR_NAME,
                  senderAvatar: orchestratorAvatar,
                  originalRole: 'teacher',
                },
              ),
            );
          } else if (decision.type === 'single') {
            appendAgentMessage(
              buildChatMessage(
                shouldRenderGroupReplies
                  ? `我已将这个需求交给《${decision.notebook.name}》处理，并会把处理过程同步在这里。`
                  : `我已将这个需求路由给《${decision.notebook.name}》处理，稍后由我统一把结果回复给你。`,
                {
                  senderName: COURSE_ORCHESTRATOR_NAME,
                  senderAvatar: orchestratorAvatar,
                  originalRole: 'teacher',
                },
              ),
            );
            if (parentTaskId) {
              await updateAgentTask(parentTaskId, {
                detail: `已路由到《${decision.notebook.name}》，正在执行单笔记本任务…`,
                status: 'running',
              });
            }
            const result = await runNotebookSubtask(
              decision.notebook,
              mergedPrompt,
              parentTaskId,
              shouldRenderGroupReplies ? appendAgentMessage : undefined,
              orchAttachments,
            );
            appendAgentMessage(
              buildChatMessage(
                shouldRenderGroupReplies
                  ? `《${decision.notebook.name}》已处理完成。你也可以直接进入该笔记本继续追问。`
                  : `我已收到《${decision.notebook.name}》的处理结果。\n\n${result.answer}\n\n你也可以直接进入该笔记本继续追问。`,
                {
                  senderName: COURSE_ORCHESTRATOR_NAME,
                  senderAvatar: orchestratorAvatar,
                  originalRole: 'teacher',
                  actions: [
                    {
                      id: `open-notebook:${decision.notebook.id}`,
                      label: '打开该笔记本',
                      variant: 'highlight',
                    },
                  ],
                },
              ),
            );
            if (parentTaskId) {
              await updateAgentTask(parentTaskId, {
                detail: `单笔记本任务已完成：${decision.notebook.name}`,
                status: 'done',
              });
            }
          } else {
            appendAgentMessage(
              buildChatMessage(
                shouldRenderGroupReplies
                  ? `我已升级为多笔记本协作流。\n\n目标总结：${text || mergedPrompt.slice(0, 800)}\n\n参与笔记本：${decision.notebooks.map((n) => `《${n.name}》`).join('、')}`
                  : `我会在后台发起多笔记本协作，并由我统一汇总结果回复给你。\n\n目标总结：${text || mergedPrompt.slice(0, 800)}\n\n参与笔记本：${decision.notebooks.map((n) => `《${n.name}》`).join('、')}`,
                {
                  senderName: COURSE_ORCHESTRATOR_NAME,
                  senderAvatar: orchestratorAvatar,
                  originalRole: 'teacher',
                },
              ),
            );
            if (parentTaskId) {
              await updateAgentTask(parentTaskId, {
                detail: `已发起 ${decision.notebooks.length} 个笔记本协作子任务…`,
                status: 'running',
              });
            }

            const results: NotebookSubtaskResult[] = [];
            for (const notebook of decision.notebooks) {
              try {
                const result = await runNotebookSubtask(
                  notebook,
                  mergedPrompt,
                  parentTaskId,
                  shouldRenderGroupReplies ? appendAgentMessage : undefined,
                  orchAttachments,
                );
                results.push(result);
                if (shouldRenderGroupReplies) {
                  appendAgentMessage(
                    buildChatMessage(result.answer, {
                      senderName: notebook.name,
                      senderAvatar: notebook.avatarUrl,
                    }),
                  );
                }
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                appendAgentMessage(
                  buildChatMessage(
                    shouldRenderGroupReplies
                      ? `《${notebook.name}》暂时未能完成：${message}`
                      : `协作笔记本《${notebook.name}》暂时未能完成：${message}`,
                    {
                      senderName: shouldRenderGroupReplies
                        ? notebook.name
                        : COURSE_ORCHESTRATOR_NAME,
                      senderAvatar: shouldRenderGroupReplies
                        ? notebook.avatarUrl
                        : orchestratorAvatar,
                      originalRole: shouldRenderGroupReplies ? 'agent' : 'teacher',
                    },
                  ),
                );
              }
            }

            const mergedText =
              results.length > 0
                ? `多笔记本协作已完成。我已综合 ${results.length} 个笔记本的结果：\n\n${results
                    .map(
                      (result, index) =>
                        `${index + 1}. 《${result.notebook.name}》\n${result.answer}${result.appliedLabel ? `\n补充内容：${result.appliedLabel}` : ''}`,
                    )
                    .join('\n\n')}`
                : '多笔记本协作已结束，但暂时没有可用结果，请稍后重试。';

            appendAgentMessage(
              buildChatMessage(mergedText, {
                senderName: COURSE_ORCHESTRATOR_NAME,
                senderAvatar: orchestratorAvatar,
                originalRole: 'teacher',
                actions: results.map((result) => ({
                  id: `open-notebook:${result.notebook.id}`,
                  label: `打开《${result.notebook.name}》`,
                  variant: 'highlight',
                })),
              }),
            );
            if (parentTaskId) {
              await updateAgentTask(parentTaskId, {
                detail:
                  results.length > 0
                    ? `多笔记本协作已完成（${results.length} 个结果）`
                    : '多笔记本协作结束，但没有产出结果',
                status: 'done',
              });
            }
          }
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') return;
          const msg = e instanceof Error ? e.message : String(e);
          appendAgentMessage(
            buildChatMessage(`总控任务失败：${msg}`, {
              senderName: '系统',
              originalRole: 'agent',
            }),
          );
          if (parentTaskId) {
            await updateAgentTask(parentTaskId, { status: 'failed', detail: msg.slice(0, 300) });
          }
        } finally {
          if (abortRef.current === controller) abortRef.current = null;
          setOrchestratorPipelineProgress(null);
          setSending(false);
        }
        return;
      }

      const agentConfigs = selectedAgent.id.startsWith('default-')
        ? undefined
        : [toChatAgentConfig(selectedAgent)];

      const getStoreState = () => ({
        stage: null,
        scenes: [] as Scene[],
        currentSceneId: null,
        mode: 'playback' as const,
        whiteboardOpen: false,
      });

      try {
        await runCourseSideChatLoop({
          initialMessages: nextThread,
          agentIds: [selectedAgent.id],
          agentConfigs,
          getStoreState,
          userProfile: { nickname: nickname.trim() || undefined },
          apiKey: mc.apiKey,
          baseUrl: mc.baseUrl || undefined,
          model: mc.modelString,
          signal: controller.signal,
          onMessages: setAgThread,
        });
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        const msg = e instanceof Error ? e.message : String(e);
        const errId = `err-${Date.now()}`;
        setAgThread((t) => [
          ...t,
          {
            id: errId,
            role: 'assistant',
            parts: [{ type: 'text', text: `发送失败：${msg}` }],
            metadata: {
              senderName: '系统',
              originalRole: 'agent',
              createdAt: Date.now(),
            },
          },
        ]);
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setSending(false);
      }
    },
    [
      abortRef,
      agThread,
      agentId,
      courseId,
      draft,
      enqueueNotebookGeneration,
      nickname,
      orchestratorAvatar,
      orchestratorCompletionAnnouncedRef,
      orchestratorComposerMode,
      orchestratorViewMode,
      pendingAttachments,
      runNotebookSubtask,
      selectedAgent,
      sending,
      setActiveOrchestratorTaskId,
      setAgThread,
      setDraft,
      setOrchestratorPdfSelectionDialogOpen,
      setOrchestratorPdfSelectionFile,
      setOrchestratorPipelineProgress,
      setPendingAttachments,
      setSending,
      shouldRenderGroupReplies,
      switchOrchestratorComposer,
      trackedOrchestratorCreateTaskIdRef,
      userAvatar,
    ],
  );
}
