import type { UIMessage } from 'ai';
import type { ChatMessageMetadata } from '@/lib/types/chat';
import type { NotebookKnowledgeReference } from '@/lib/types/notebook-message';
import type { ProtocolMessageEnvelope } from '@/lib/types/agent-chat-protocol';
import type { NotebookContentDocument } from '@/lib/notebook-content';
import type { Scene } from '@/lib/types/stage';
import type { StageListItem } from '@/lib/utils/stage-storage';

export type NotebookProblemChatCard = {
  courseId: string;
  notebookId: string;
  problemId: string;
  href: string;
  title: string;
  notebookName?: string | null;
  problemNumber?: number | null;
};

export type NotebookChatMessage =
  | {
      role: 'user';
      text: string;
      at: number;
      attachments?: ChatMessageMetadata['attachments'];
      problemAsk?: NotebookProblemChatCard;
    }
  | {
      role: 'assistant';
      answer: string;
      answerDocument?: NotebookContentDocument;
      references: NotebookKnowledgeReference[];
      knowledgeGap: boolean;
      prerequisiteHints?: string[];
      webSearchUsed?: boolean;
      appliedLabel?: string;
      lessonSourceQuestion?: string;
      lessonDeckScenes?: Scene[];
      lessonSavedLabel?: string;
      lessonError?: string;
      streaming?: boolean;
      statusText?: string;
      at: number;
    };

export type NotebookAttachmentInput = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  textExcerpt?: string;
  /** 原始文件；PDF / Markdown 可在总控创建时进入完整笔记本生成管线 */
  file?: File;
};

export type OrchestratorChildTaskView = {
  id: string;
  title: string;
  detail?: string;
  status: 'running' | 'waiting' | 'done' | 'failed';
  contactId: string;
  updatedAt: number;
  lastEnvelope?: ProtocolMessageEnvelope;
};

export type NotebookRouteDecision =
  | { type: 'direct' }
  | { type: 'create' }
  | { type: 'single'; notebook: StageListItem }
  | { type: 'multi'; notebooks: StageListItem[] };

export type OrchestratorViewMode = 'private' | 'group';

/** 历史兼容：聊天页只保留发送消息；旧 `generate-notebook` 深链会迁移到课程内创建界面。 */
export type OrchestratorComposerMode = 'generate-notebook' | 'send-message';

export type NotebookSubtaskResult = {
  notebook: StageListItem;
  answer: string;
  references?: NotebookKnowledgeReference[];
  appliedLabel?: string;
  knowledgeGap: boolean;
};

export type AgentChatMessage = UIMessage<ChatMessageMetadata>;
