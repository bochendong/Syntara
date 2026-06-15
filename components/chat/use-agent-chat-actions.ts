import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { UIMessage } from 'ai';
import { runCourseSideChatLoop } from '@/lib/chat/run-course-side-chat-loop';
import { COURSE_ORCHESTRATOR_ID, COURSE_ORCHESTRATOR_NAME } from '@/lib/constants/course-chat';
import type { NotebookGenerationProgress } from '@/lib/create/run-notebook-generation-task';
import type {
  ChatMessageMetadata,
  CourseChatContext,
  CourseChatGroupMeta,
  CourseChatParticipant,
} from '@/lib/types/chat';
import { USER_AVATAR } from '@/lib/types/roundtable';
import type { Scene } from '@/lib/types/stage';
import { createAgentTask, updateAgentTask } from '@/lib/utils/agent-task-storage';
import { toChatAgentConfig, type CourseAgentListItem } from '@/lib/utils/course-agents';
import { storeChatAttachmentBlob } from '@/lib/utils/chat-attachment-blobs';
import {
  courseChatGroupTargetId,
  listCourseChatGroups,
  loadContactMessages,
  saveContactMessages,
} from '@/lib/utils/contact-chat-storage';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { listStagesByCourse } from '@/lib/utils/stage-storage';
import { PDF_PAGE_SELECTION_MAX_BYTES, type PdfSourceSelection } from '@/lib/pdf/page-selection';
import {
  ATTACHMENT_ONLY_PLACEHOLDER,
  isNotebookPipelineSourceFile,
  mergeOrchestratorPrompt,
} from './chat-attachment-utils';
import { buildChatMessage, stripAttachmentUrlsFromAgentMessages } from './chat-message-utils';
import { saveNotebookChatHandoff } from './chat-notebook-handoff';
import { decideNotebookRoute } from './chat-notebook-routing';
import {
  COURSE_CHAT_GROUPS_UPDATED_EVENT,
  buildGroupName,
  createGroupMeta,
  makeNotebookParticipant,
  makeOrchestratorParticipant,
  mergeParticipants,
  pickReusableGroup,
  updateGroupActivity,
} from './course-chat-groups';
import { buildCourseChatContext } from '@/lib/chat/course-chat-context';
import type {
  NotebookAttachmentInput,
  NotebookSubtaskResult,
  OrchestratorComposerMode,
  OrchestratorViewMode,
} from './chat-page-types';

const GROUP_NOTEBOOK_REPLY_LIMIT = 2;
const MAX_GROUP_NOTEBOOK_REPLY_CHARS = 700;

function participantLabel(participant: CourseChatParticipant): string {
  if (participant.kind === 'notebook') return `《${participant.name}》`;
  return participant.name;
}

function participantListLabel(participants: CourseChatParticipant[]): string {
  return participants.map(participantLabel).join('、');
}

function compactGroupReply(text: string): string {
  const normalized = text.replace(/\n{3,}/g, '\n\n').trim();
  if (normalized.length <= MAX_GROUP_NOTEBOOK_REPLY_CHARS) return normalized;
  return `${normalized.slice(0, MAX_GROUP_NOTEBOOK_REPLY_CHARS).trim()}…`;
}

function compactDispatchQuestion(question: string, limit = 220): string {
  const normalized = question.replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit).trim()}…`;
}

function buildSingleNotebookDispatchPrompt(notebookName: string, question: string): string {
  return `@${notebookName} 请基于你的笔记回答：${compactDispatchQuestion(question)}。先直接解决问题，再用一句话说明依据或复杂度。`;
}

function buildGroupNotebookDispatchPrompt(notebookName: string, question: string): string {
  return `@${notebookName} 请只补你这个笔记本最相关的一点：${compactDispatchQuestion(question)}。最多 4 句，能引用页码就引用。`;
}

export function useAgentChatActions({
  agentId,
  selectedAgent,
  sending,
  draft,
  pendingAttachments,
  orchestratorViewMode,
  orchestratorComposerMode,
  groupId,
  currentGroupMeta,
  setCurrentGroupMeta,
  replaceWithGroupChat,
  replaceWithNotebookChat,
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
  courseName,
  trackedOrchestratorCreateTaskIdRef,
  setActiveOrchestratorTaskId,
  setOrchestratorPipelineProgress,
  orchestratorAvatar,
  runNotebookSubtask,
}: {
  agentId: string | null;
  selectedAgent: CourseAgentListItem | null;
  sending: boolean;
  draft: string;
  pendingAttachments: NotebookAttachmentInput[];
  orchestratorViewMode: OrchestratorViewMode;
  orchestratorComposerMode: OrchestratorComposerMode;
  groupId: string | null;
  currentGroupMeta: CourseChatGroupMeta | null;
  setCurrentGroupMeta: Dispatch<SetStateAction<CourseChatGroupMeta | null>>;
  replaceWithGroupChat: (groupId: string) => void;
  replaceWithNotebookChat: (notebookId: string, handoffId?: string | null) => void;
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
  courseName?: string;
  trackedOrchestratorCreateTaskIdRef: MutableRefObject<string | null>;
  setActiveOrchestratorTaskId: Dispatch<SetStateAction<string | null>>;
  setOrchestratorPipelineProgress: Dispatch<SetStateAction<NotebookGenerationProgress | null>>;
  orchestratorAvatar?: string | null;
  runNotebookSubtask: (
    notebook: Awaited<ReturnType<typeof listStagesByCourse>>[number],
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
  ) => Promise<NotebookSubtaskResult>;
}) {
  return useCallback(
    async (forcedSourcePageSelection?: PdfSourceSelection) => {
      const text = draft.trim();
      if ((!agentId && !groupId) || !selectedAgent || sending) return;
      if (selectedAgent.id === COURSE_ORCHESTRATOR_ID) {
        if (!text && pendingAttachments.length === 0) return;
      } else if (!text) {
        return;
      }
      if (selectedAgent.id === COURSE_ORCHESTRATOR_ID && orchestratorViewMode === 'group') {
        window.alert('群聊由课程总控自动调度。请回到课程总控私聊里发送问题。');
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
        window.alert('上传文档创建笔记本已移到课程内创建界面，请从课程页点击「新建笔记本」。');
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

      let memoizedCourseContext: CourseChatContext | undefined;
      const getCourseContext = async () => {
        if (!courseId?.trim()) return undefined;
        if (!memoizedCourseContext) {
          memoizedCourseContext = await buildCourseChatContext({
            courseId: courseId.trim(),
            courseName,
            question: mergedPrompt,
            target: {
              kind: selectedAgent.id === COURSE_ORCHESTRATOR_ID ? 'orchestrator' : 'agent',
              id: selectedAgent.id,
              name: selectedAgent.name,
              role: selectedAgent.role,
            },
          });
        }
        return memoizedCourseContext;
      };

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
      const updateAgentMessage = (
        messageId: string,
        updater: (message: UIMessage<ChatMessageMetadata>) => UIMessage<ChatMessageMetadata>,
      ) => {
        nextThread = nextThread.map((message) =>
          message.id === messageId ? updater(message) : message,
        );
        setAgThread(nextThread);
      };

      if (selectedAgent.id === COURSE_ORCHESTRATOR_ID) {
        if (orchestratorViewMode === 'group') {
          const saveGroupSnapshot = async (
            meta: CourseChatGroupMeta,
            thread: UIMessage<ChatMessageMetadata>[],
          ) => {
            if (!courseId?.trim()) return meta;
            const activeMeta = updateGroupActivity(meta, thread);
            setCurrentGroupMeta(activeMeta);
            await saveContactMessages<UIMessage<ChatMessageMetadata>>({
              courseId: courseId.trim(),
              kind: 'agent',
              targetId: courseChatGroupTargetId(activeMeta.groupId),
              targetName: activeMeta.name,
              meta: activeMeta,
              messages: stripAttachmentUrlsFromAgentMessages(thread),
            });
            window.dispatchEvent(
              new CustomEvent(COURSE_CHAT_GROUPS_UPDATED_EVENT, {
                detail: { courseId: courseId.trim(), groupId: activeMeta.groupId },
              }),
            );
            return activeMeta;
          };

          const commitGroupThread = (thread: UIMessage<ChatMessageMetadata>[]) => {
            nextThread = thread;
            setAgThread(thread);
          };

          try {
            if (!courseId?.trim()) {
              throw new Error('缺少课程上下文，无法创建课程群聊。');
            }

            const notebooks = await listStagesByCourse(courseId.trim());
            const courseContext = await getCourseContext();
            const decision = decideNotebookRoute(
              mergedPrompt,
              notebooks,
              orchestratorViewMode,
              orchAttachments.length > 0,
              courseContext,
            );
            if (decision.type === 'single') {
              setAgThread(agThread);
              const handoffId = saveNotebookChatHandoff({
                courseId: courseId.trim(),
                notebookId: decision.notebook.id,
                question: mergedPrompt,
              });
              if (!handoffId) setDraft(text);
              replaceWithNotebookChat(decision.notebook.id, handoffId);
              return;
            }

            const routedNotebooks =
              decision.type === 'multi'
                ? decision.notebooks.slice(0, GROUP_NOTEBOOK_REPLY_LIMIT)
                : [];
            const routingReason =
              routedNotebooks.length > 0
                ? `问题需要 ${routedNotebooks.length} 个笔记本共同补充：${mergedPrompt.slice(0, 80)}`
                : `课程总控处理：${mergedPrompt.slice(0, 80)}`;

            const joinedAt = Date.now();
            const requiredParticipants: CourseChatParticipant[] = [
              makeOrchestratorParticipant({ avatarUrl: orchestratorAvatar, joinedAt }),
              ...routedNotebooks.map((notebook) => makeNotebookParticipant(notebook, joinedAt)),
            ];
            const groups = await listCourseChatGroups(courseId.trim());
            const currentFromList =
              groupId && currentGroupMeta?.groupId === groupId
                ? currentGroupMeta
                : groupId
                  ? groups.find((group) => group.groupId === groupId) || null
                  : null;

            let groupMeta: CourseChatGroupMeta;
            let createdGroup = false;
            let addedParticipants: CourseChatParticipant[] = [];

            if (currentFromList) {
              const merged = mergeParticipants(currentFromList.participants, requiredParticipants);
              addedParticipants = merged.added;
              groupMeta = {
                ...currentFromList,
                participants: merged.participants,
                name: buildGroupName(merged.participants),
                lastRoutingReason: routingReason,
                updatedAt: Date.now(),
              };
            } else {
              const reusable =
                routedNotebooks.length > 0
                  ? pickReusableGroup({
                      groups,
                      required: requiredParticipants,
                      currentGroupId: groupId,
                    })
                  : null;
              if (reusable) {
                const merged = mergeParticipants(reusable.participants, requiredParticipants);
                addedParticipants = merged.added;
                groupMeta = {
                  ...reusable,
                  participants: merged.participants,
                  name: buildGroupName(merged.participants),
                  lastRoutingReason: routingReason,
                  updatedAt: Date.now(),
                };
              } else {
                createdGroup = true;
                groupMeta = createGroupMeta({
                  participants: requiredParticipants,
                  createdReason: mergedPrompt.slice(0, 120),
                  lastRoutingReason: routingReason,
                });
              }
            }

            let groupThread =
              groupMeta.groupId === groupId
                ? nextThread
                : [
                    ...(await loadContactMessages<UIMessage<ChatMessageMetadata>>(
                      courseId.trim(),
                      'agent',
                      courseChatGroupTargetId(groupMeta.groupId),
                    )),
                    userMessage,
                  ];

            const appendGroupMessage = (message: UIMessage<ChatMessageMetadata>) => {
              groupThread = [...groupThread, message];
              commitGroupThread(groupThread);
            };

            commitGroupThread(groupThread);

            if (createdGroup) {
              const memberNames = participantListLabel(groupMeta.participants).replace(
                /[《》]/g,
                '',
              );
              appendGroupMessage(
                buildChatMessage(
                  `课程总控创建了「${groupMeta.name}」，成员：${participantListLabel(groupMeta.participants)}`,
                  {
                    senderName: '系统',
                    originalRole: 'agent',
                    senderKind: 'system',
                    groupEvent: 'created',
                    groupEventSummary: `已创建群聊 · ${memberNames}`,
                    groupEventDetail: `课程总控创建了「${groupMeta.name}」，成员：${participantListLabel(groupMeta.participants)}`,
                  },
                ),
              );
            } else if (addedParticipants.length > 0) {
              const memberNames = participantListLabel(addedParticipants).replace(/[《》]/g, '');
              appendGroupMessage(
                buildChatMessage(`课程总控邀请了 ${participantListLabel(addedParticipants)}`, {
                  senderName: '系统',
                  originalRole: 'agent',
                  senderKind: 'system',
                  groupEvent: 'members_added',
                  groupEventSummary: `已邀请成员 · ${memberNames}`,
                  groupEventDetail: `课程总控邀请了 ${participantListLabel(addedParticipants)}`,
                }),
              );
            }

            groupMeta = await saveGroupSnapshot(groupMeta, groupThread);
            if (groupMeta.groupId !== groupId) {
              replaceWithGroupChat(groupMeta.groupId);
            }

            if (decision.type === 'create' && notebooks.length > 0) {
              appendGroupMessage(
                buildChatMessage(
                  '创建新笔记本还是从课程页的「新建笔记本」进入比较合适；群聊里我先不直接生成课件。你也可以继续问现有笔记本里的内容，我会按需要拉相关成员进来。',
                  {
                    senderName: COURSE_ORCHESTRATOR_NAME,
                    senderAvatar: orchestratorAvatar,
                    originalRole: 'teacher',
                    senderKind: 'orchestrator',
                    actions: [
                      {
                        id: `create-notebook:${courseId.trim()}`,
                        label: '打开创建界面',
                        variant: 'highlight',
                      },
                    ],
                  },
                ),
              );
              await saveGroupSnapshot(groupMeta, groupThread);
              return;
            }

            if (routedNotebooks.length === 0) {
              const agentConfigs = [toChatAgentConfig(selectedAgent)];
              const getStoreState = () => ({
                stage: null,
                scenes: [] as Scene[],
                currentSceneId: null,
                mode: 'playback' as const,
                whiteboardOpen: false,
              });
              await runCourseSideChatLoop({
                initialMessages: groupThread,
                agentIds: [COURSE_ORCHESTRATOR_ID],
                agentConfigs,
                getStoreState,
                userProfile: { nickname: nickname.trim() || undefined },
                surface: 'course-chat',
                courseContext,
                apiKey: mc.apiKey,
                baseUrl: mc.baseUrl || undefined,
                model: mc.modelString,
                signal: controller.signal,
                onMessages: (messages) => {
                  groupThread = messages;
                  commitGroupThread(messages);
                },
              });
              await saveGroupSnapshot(groupMeta, groupThread);
              return;
            }

            const introducedNotebookIds = createdGroup
              ? new Set(routedNotebooks.map((notebook) => notebook.id))
              : new Set(
                  addedParticipants
                    .filter((participant) => participant.kind === 'notebook')
                    .map((participant) => participant.id),
                );
            const introducedNotebooks = routedNotebooks.filter((notebook) =>
              introducedNotebookIds.has(notebook.id),
            );

            if (introducedNotebooks.length > 0) {
              appendGroupMessage(
                buildChatMessage(
                  introducedNotebooks.length === 1
                    ? `我把《${introducedNotebooks[0].name}》拉进来，只让它补最相关的一点。`
                    : `我把${introducedNotebooks.map((notebook) => `《${notebook.name}》`).join('、')}拉进来，每个笔记本只补最相关的一点。`,
                  {
                    senderName: COURSE_ORCHESTRATOR_NAME,
                    senderAvatar: orchestratorAvatar,
                    originalRole: 'teacher',
                    senderKind: 'orchestrator',
                    mentionedParticipantIds: introducedNotebooks.map((notebook) => notebook.id),
                  },
                ),
              );
            }

            await saveGroupSnapshot(groupMeta, groupThread);

            for (const notebook of routedNotebooks) {
              if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
              try {
                const result = await runNotebookSubtask(
                  notebook,
                  `${mergedPrompt}\n\n请以课程微信群里的笔记本成员身份回答：最多 4 句；只讲你这个笔记本最相关的一个点；如果能引用页码或章节，用「第 N 页/第 N 节」说明；不要生成长文。`,
                  null,
                  undefined,
                  orchAttachments,
                  undefined,
                  { persistConversation: false },
                );
                appendGroupMessage(
                  buildChatMessage(compactGroupReply(result.answer), {
                    senderName: notebook.name,
                    senderAvatar: notebook.avatarUrl,
                    originalRole: 'agent',
                    senderKind: 'notebook',
                    sourceReferences: (result.references || []).slice(0, 3).map((reference) => ({
                      notebookId: notebook.id,
                      notebookName: notebook.name,
                      order: reference.order,
                      title: reference.title,
                      why: reference.why,
                    })),
                  }),
                );
                await saveGroupSnapshot(groupMeta, groupThread);
              } catch (error) {
                if (error instanceof DOMException && error.name === 'AbortError') throw error;
                const message = error instanceof Error ? error.message : String(error);
                appendGroupMessage(
                  buildChatMessage(`我这边暂时没取到结果：${message.slice(0, 160)}`, {
                    senderName: notebook.name,
                    senderAvatar: notebook.avatarUrl,
                    originalRole: 'agent',
                    senderKind: 'notebook',
                  }),
                );
                await saveGroupSnapshot(groupMeta, groupThread);
              }
            }
          } catch (e) {
            if (e instanceof DOMException && e.name === 'AbortError') return;
            const msg = e instanceof Error ? e.message : String(e);
            appendAgentMessage(
              buildChatMessage(`群聊处理失败：${msg}`, {
                senderName: '系统',
                originalRole: 'agent',
                senderKind: 'system',
              }),
            );
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
              detail: '正在查找合适的笔记本…',
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
          const courseContext = await getCourseContext();
          const decision = decideNotebookRoute(
            mergedPrompt,
            notebooks,
            orchestratorViewMode,
            orchAttachments.length > 0,
            courseContext,
          );

          if (decision.type === 'direct') {
            if (parentTaskId) {
              await updateAgentTask(parentTaskId, {
                detail: '未命中特定笔记本，由课程总控直接回答…',
                status: 'running',
              });
            }
            const agentConfigs = [toChatAgentConfig(selectedAgent)];
            const getStoreState = () => ({
              stage: null,
              scenes: [] as Scene[],
              currentSceneId: null,
              mode: 'playback' as const,
              whiteboardOpen: false,
            });
            await runCourseSideChatLoop({
              initialMessages: nextThread,
              agentIds: [COURSE_ORCHESTRATOR_ID],
              agentConfigs,
              getStoreState,
              userProfile: { nickname: nickname.trim() || undefined },
              surface: 'course-chat',
              courseContext,
              apiKey: mc.apiKey,
              baseUrl: mc.baseUrl || undefined,
              model: mc.modelString,
              signal: controller.signal,
              onMessages: setAgThread,
            });
            if (parentTaskId) {
              await updateAgentTask(parentTaskId, {
                detail: '课程总控已直接回答',
                status: 'done',
              });
            }
          } else if (decision.type === 'create') {
            if (parentTaskId) {
              await updateAgentTask(parentTaskId, {
                detail: '创建笔记本已移到课程内创建界面，请从课程页开始。',
                status: 'done',
              });
            }
            appendAgentMessage(
              buildChatMessage(
                '创建笔记本已移到课程内创建界面。请从课程页点击「新建笔记本」，或直接打开创建界面填写需求与上传资料。',
                {
                  senderName: COURSE_ORCHESTRATOR_NAME,
                  senderAvatar: orchestratorAvatar,
                  originalRole: 'teacher',
                  actions: courseId
                    ? [
                        {
                          id: `create-notebook:${courseId}`,
                          label: '打开创建界面',
                          variant: 'highlight',
                        },
                      ]
                    : [],
                },
              ),
            );
          } else if (decision.type === 'single') {
            const delegatedPrompt = buildSingleNotebookDispatchPrompt(
              decision.notebook.name,
              mergedPrompt,
            );
            if (parentTaskId) {
              await updateAgentTask(parentTaskId, {
                detail: `正在编辑发给《${decision.notebook.name}》的消息…`,
                status: 'running',
              });
            }
            appendAgentMessage(
              buildChatMessage(`课程总控将问题发给了《${decision.notebook.name}》。`, {
                senderName: COURSE_ORCHESTRATOR_NAME,
                senderAvatar: orchestratorAvatar,
                originalRole: 'teacher',
                senderKind: 'orchestrator',
                mentionedParticipantIds: [decision.notebook.id],
                mentionedParticipantDetails: [
                  {
                    id: decision.notebook.id,
                    kind: 'notebook',
                    name: decision.notebook.name,
                    avatarUrl: decision.notebook.avatarUrl || null,
                  },
                ],
                dispatchVerb: '发给了',
                dispatchNote: '已把用户问题整理成一条笔记本任务',
                dispatchPrompt: delegatedPrompt,
              }),
            );
            if (parentTaskId) {
              await updateAgentTask(parentTaskId, {
                detail: `已发给《${decision.notebook.name}》，等待笔记本开始思考…`,
                status: 'running',
              });
            }
            let streamedAnswer = '';
            const streamingMessage = buildChatMessage('', {
              senderName: decision.notebook.name,
              senderAvatar: decision.notebook.avatarUrl,
              originalRole: 'agent',
              senderKind: 'notebook',
              streaming: true,
              statusText: '开始思考，正在查看笔记本内容…',
            });
            appendAgentMessage(streamingMessage);
            const updateStreamingMessage = (
              patch: Partial<{
                text: string;
                metadata: Partial<ChatMessageMetadata>;
              }>,
            ) => {
              updateAgentMessage(streamingMessage.id, (message) => ({
                ...message,
                parts:
                  patch.text === undefined ? message.parts : [{ type: 'text', text: patch.text }],
                metadata: {
                  ...message.metadata,
                  ...patch.metadata,
                },
              }));
            };
            const result = await runNotebookSubtask(
              decision.notebook,
              delegatedPrompt,
              parentTaskId,
              undefined,
              orchAttachments,
              {
                onAnswerDelta: (delta) => {
                  streamedAnswer += delta;
                  updateStreamingMessage({
                    text: streamedAnswer,
                    metadata: { streaming: true, statusText: undefined },
                  });
                },
                onStatus: (message) => {
                  updateStreamingMessage({
                    text: streamedAnswer,
                    metadata: { streaming: true, statusText: message },
                  });
                },
              },
              { persistConversation: false },
            );
            updateStreamingMessage({
              text: result.answer || streamedAnswer || '这个笔记本暂时没有返回内容。',
              metadata: {
                streaming: false,
                statusText: undefined,
                sourceReferences: (result.references || []).slice(0, 4).map((reference) => ({
                  notebookId: decision.notebook.id,
                  notebookName: decision.notebook.name,
                  order: reference.order,
                  title: reference.title,
                  why: reference.why,
                })),
                actions: [
                  {
                    id: `open-notebook:${decision.notebook.id}`,
                    label: '打开该笔记本',
                    variant: 'highlight',
                  },
                ],
              },
            });
            if (parentTaskId) {
              await updateAgentTask(parentTaskId, {
                detail: `单笔记本任务已完成：${decision.notebook.name}`,
                status: 'done',
              });
            }
          } else {
            if (!courseId?.trim()) {
              throw new Error('缺少课程上下文，无法创建课程群聊。');
            }

            const routedNotebooks = decision.notebooks.slice(0, GROUP_NOTEBOOK_REPLY_LIMIT);
            const routingReason = `问题需要 ${routedNotebooks.length} 个笔记本共同补充：${mergedPrompt.slice(0, 80)}`;
            const joinedAt = Date.now();
            const requiredParticipants: CourseChatParticipant[] = [
              makeOrchestratorParticipant({ avatarUrl: orchestratorAvatar, joinedAt }),
              ...routedNotebooks.map((notebook) => makeNotebookParticipant(notebook, joinedAt)),
            ];
            const groups = await listCourseChatGroups(courseId.trim());
            const reusable = pickReusableGroup({
              groups,
              required: requiredParticipants,
              currentGroupId: null,
            });

            let groupMeta: CourseChatGroupMeta;
            let createdGroup = false;
            let addedParticipants: CourseChatParticipant[] = [];
            if (reusable) {
              const merged = mergeParticipants(reusable.participants, requiredParticipants);
              addedParticipants = merged.added;
              groupMeta = {
                ...reusable,
                participants: merged.participants,
                name: buildGroupName(merged.participants),
                lastRoutingReason: routingReason,
                updatedAt: Date.now(),
              };
            } else {
              createdGroup = true;
              groupMeta = createGroupMeta({
                participants: requiredParticipants,
                createdReason: mergedPrompt.slice(0, 120),
                lastRoutingReason: routingReason,
              });
            }

            const existingGroupThread = await loadContactMessages<UIMessage<ChatMessageMetadata>>(
              courseId.trim(),
              'agent',
              courseChatGroupTargetId(groupMeta.groupId),
            );
            let groupThread = [...existingGroupThread, userMessage];
            const saveGroupSnapshot = async () => {
              const activeMeta = updateGroupActivity(groupMeta, groupThread);
              groupMeta = activeMeta;
              setCurrentGroupMeta(activeMeta);
              await saveContactMessages<UIMessage<ChatMessageMetadata>>({
                courseId: courseId.trim(),
                kind: 'agent',
                targetId: courseChatGroupTargetId(activeMeta.groupId),
                targetName: activeMeta.name,
                meta: activeMeta,
                messages: stripAttachmentUrlsFromAgentMessages(groupThread),
              });
              window.dispatchEvent(
                new CustomEvent(COURSE_CHAT_GROUPS_UPDATED_EVENT, {
                  detail: { courseId: courseId.trim(), groupId: activeMeta.groupId },
                }),
              );
            };
            const appendGroupMessage = (message: UIMessage<ChatMessageMetadata>) => {
              groupThread = [...groupThread, message];
            };
            const updateGroupMessage = (
              messageId: string,
              updater: (message: UIMessage<ChatMessageMetadata>) => UIMessage<ChatMessageMetadata>,
            ) => {
              groupThread = groupThread.map((message) =>
                message.id === messageId ? updater(message) : message,
              );
            };

            if (createdGroup) {
              const memberNames = participantListLabel(groupMeta.participants).replace(
                /[《》]/g,
                '',
              );
              appendGroupMessage(
                buildChatMessage(
                  `课程总控创建了「${groupMeta.name}」，成员：${participantListLabel(groupMeta.participants)}`,
                  {
                    senderName: '系统',
                    originalRole: 'agent',
                    senderKind: 'system',
                    groupEvent: 'created',
                    groupEventSummary: `已创建群聊 · ${memberNames}`,
                    groupEventDetail: `课程总控创建了「${groupMeta.name}」，成员：${participantListLabel(groupMeta.participants)}`,
                  },
                ),
              );
            } else if (addedParticipants.length > 0) {
              const memberNames = participantListLabel(addedParticipants).replace(/[《》]/g, '');
              appendGroupMessage(
                buildChatMessage(`课程总控邀请了 ${participantListLabel(addedParticipants)}`, {
                  senderName: '系统',
                  originalRole: 'agent',
                  senderKind: 'system',
                  groupEvent: 'members_added',
                  groupEventSummary: `已邀请成员 · ${memberNames}`,
                  groupEventDetail: `课程总控邀请了 ${participantListLabel(addedParticipants)}`,
                }),
              );
            }

            const hasNewParticipants = createdGroup || addedParticipants.length > 0;
            appendGroupMessage(
              buildChatMessage(
                hasNewParticipants
                  ? `课程总控拉入了 ${routedNotebooks.map((notebook) => `《${notebook.name}》`).join('、')}`
                  : `课程总控把问题转发给 ${routedNotebooks.map((notebook) => `《${notebook.name}》`).join('、')}`,
                {
                  senderName: COURSE_ORCHESTRATOR_NAME,
                  senderAvatar: orchestratorAvatar,
                  originalRole: 'teacher',
                  senderKind: 'orchestrator',
                  mentionedParticipantIds: routedNotebooks.map((notebook) => notebook.id),
                  mentionedParticipantDetails: routedNotebooks.map((notebook) => ({
                    id: notebook.id,
                    kind: 'notebook',
                    name: notebook.name,
                    avatarUrl: notebook.avatarUrl || null,
                  })),
                  dispatchVerb: hasNewParticipants ? '拉入了' : '转发给',
                  dispatchNote: '已把用户问题拆成短任务发给相关笔记本',
                  dispatchPrompt: routedNotebooks
                    .map((notebook) =>
                      buildGroupNotebookDispatchPrompt(notebook.name, mergedPrompt),
                    )
                    .join('\n'),
                },
              ),
            );

            appendAgentMessage(
              buildChatMessage(
                hasNewParticipants
                  ? `课程总控拉起了「${groupMeta.name}」。`
                  : `课程总控复用了「${groupMeta.name}」。`,
                {
                  senderName: COURSE_ORCHESTRATOR_NAME,
                  senderAvatar: orchestratorAvatar,
                  originalRole: 'teacher',
                  senderKind: 'orchestrator',
                  mentionedParticipantIds: routedNotebooks.map((notebook) => notebook.id),
                  mentionedParticipantDetails: routedNotebooks.map((notebook) => ({
                    id: notebook.id,
                    kind: 'notebook',
                    name: notebook.name,
                    avatarUrl: notebook.avatarUrl || null,
                  })),
                  dispatchVerb: hasNewParticipants ? '拉入了' : '转发给',
                  dispatchNote: '进入群聊后，每个笔记本只补最相关的一点',
                  dispatchPrompt: routedNotebooks
                    .map((notebook) =>
                      buildGroupNotebookDispatchPrompt(notebook.name, mergedPrompt),
                    )
                    .join('\n'),
                },
              ),
            );
            await saveGroupSnapshot();
            replaceWithGroupChat(groupMeta.groupId);
            if (parentTaskId) {
              await updateAgentTask(parentTaskId, {
                detail: `已发起 ${routedNotebooks.length} 个笔记本协作子任务…`,
                status: 'running',
              });
            }

            const results: NotebookSubtaskResult[] = [];
            for (const notebook of routedNotebooks) {
              if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
              try {
                let streamedAnswer = '';
                const delegatedPrompt = `${buildGroupNotebookDispatchPrompt(
                  notebook.name,
                  mergedPrompt,
                )}\n\n请以课程微信群里的笔记本成员身份回答：最多 4 句；只讲你这个笔记本最相关的一个点；如果能引用页码或章节，用「第 N 页/第 N 节」说明；不要生成长文。`;
                const streamingMessage = buildChatMessage('', {
                  senderName: notebook.name,
                  senderAvatar: notebook.avatarUrl,
                  originalRole: 'agent',
                  senderKind: 'notebook',
                  streaming: true,
                  statusText: '开始思考，正在查看笔记本内容…',
                });
                appendGroupMessage(streamingMessage);
                await saveGroupSnapshot();
                const updateStreamingMessage = (
                  patch: Partial<{
                    text: string;
                    metadata: Partial<ChatMessageMetadata>;
                  }>,
                ) => {
                  updateGroupMessage(streamingMessage.id, (message) => ({
                    ...message,
                    parts:
                      patch.text === undefined
                        ? message.parts
                        : [{ type: 'text', text: patch.text }],
                    metadata: {
                      ...message.metadata,
                      ...patch.metadata,
                    },
                  }));
                  setAgThread(groupThread);
                };
                const result = await runNotebookSubtask(
                  notebook,
                  delegatedPrompt,
                  parentTaskId,
                  undefined,
                  orchAttachments,
                  {
                    onAnswerDelta: (delta) => {
                      streamedAnswer += delta;
                      updateStreamingMessage({
                        text: compactGroupReply(streamedAnswer),
                        metadata: { streaming: true, statusText: undefined },
                      });
                    },
                    onStatus: (message) => {
                      updateStreamingMessage({
                        text: compactGroupReply(streamedAnswer),
                        metadata: { streaming: true, statusText: message },
                      });
                    },
                  },
                  { persistConversation: false },
                );
                results.push(result);
                updateStreamingMessage({
                  text: compactGroupReply(result.answer || streamedAnswer),
                  metadata: {
                    streaming: false,
                    statusText: undefined,
                    sourceReferences: (result.references || []).slice(0, 3).map((reference) => ({
                      notebookId: notebook.id,
                      notebookName: notebook.name,
                      order: reference.order,
                      title: reference.title,
                      why: reference.why,
                    })),
                  },
                });
                await saveGroupSnapshot();
              } catch (error) {
                if (error instanceof DOMException && error.name === 'AbortError') throw error;
                const message = error instanceof Error ? error.message : String(error);
                appendGroupMessage(
                  buildChatMessage(`我这边暂时没取到结果：${message.slice(0, 160)}`, {
                    senderName: notebook.name,
                    senderAvatar: notebook.avatarUrl,
                    originalRole: 'agent',
                    senderKind: 'notebook',
                  }),
                );
                await saveGroupSnapshot();
              }
            }

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
        const courseContext = await getCourseContext();
        await runCourseSideChatLoop({
          initialMessages: nextThread,
          agentIds: [selectedAgent.id],
          agentConfigs,
          getStoreState,
          userProfile: { nickname: nickname.trim() || undefined },
          surface: 'course-chat',
          courseContext,
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
      courseName,
      currentGroupMeta,
      draft,
      groupId,
      nickname,
      orchestratorAvatar,
      orchestratorComposerMode,
      orchestratorViewMode,
      pendingAttachments,
      replaceWithGroupChat,
      replaceWithNotebookChat,
      runNotebookSubtask,
      selectedAgent,
      sending,
      setActiveOrchestratorTaskId,
      setAgThread,
      setCurrentGroupMeta,
      setDraft,
      setOrchestratorPdfSelectionDialogOpen,
      setOrchestratorPdfSelectionFile,
      setOrchestratorPipelineProgress,
      setPendingAttachments,
      setSending,
      trackedOrchestratorCreateTaskIdRef,
      userAvatar,
    ],
  );
}
