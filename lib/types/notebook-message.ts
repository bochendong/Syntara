import type { CoursePurpose } from '@/lib/utils/database';
import type { NotebookContentDocument } from '@/lib/notebook-content';

export type NotebookSceneBrief = {
  id: string;
  order: number;
  type: 'slide' | 'quiz' | 'interactive' | 'pbl' | 'markdown';
  title: string;
  knowledgeDigest: string;
};

export type NotebookKnowledgeReference = {
  order: number;
  title: string;
  why: string;
};

export type NotebookInsertOperation = {
  afterOrder: number;
  type: 'slide' | 'quiz';
  title: string;
  description: string;
  keyPoints: string[];
  contentDocument?: NotebookContentDocument;
};

export type NotebookUpdateOperation = {
  order: number;
  title?: string;
  appendKnowledge?: string;
};

export type NotebookDeleteOperation = {
  order: number;
  reason: string;
};

export type NotebookMessagePlan = {
  answer: string;
  answerDocument?: NotebookContentDocument;
  references: NotebookKnowledgeReference[];
  knowledgeGap: boolean;
  operations: {
    insert: NotebookInsertOperation[];
    update: NotebookUpdateOperation[];
    delete: NotebookDeleteOperation[];
  };
};

export type SendNotebookMessageRequest = {
  message: string;
  conversation?: Array<{
    role: 'user' | 'assistant';
    content: string;
    at?: number;
  }>;
  attachments?: Array<{
    id: string;
    name: string;
    mimeType: string;
    size: number;
    /** text attachments only; truncate on client */
    textExcerpt?: string;
  }>;
  notebook: {
    id: string;
    name: string;
    description?: string;
    scenes: NotebookSceneBrief[];
  };
  course?: {
    name?: string;
    purpose?: CoursePurpose;
    language?: 'zh-CN' | 'en-US';
    tags?: string[];
    university?: string;
    courseCode?: string;
  };
  options?: {
    allowWrite?: boolean;
    preferWebSearch?: boolean;
    webSearchApiKey?: string;
  };
};

export type SendNotebookMessageResponse = NotebookMessagePlan & {
  webSearchUsed?: boolean;
  prerequisiteHints?: string[];
};

export type SendNotebookMessageStreamEvent =
  | { type: 'answer_delta'; data: { content: string } }
  | { type: 'status'; data: { message: string } }
  | { type: 'final'; data: SendNotebookMessageResponse }
  | { type: 'error'; data: { message: string } };
