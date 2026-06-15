'use client';

import {
  planNotebookMessage,
  planNotebookMessageStream,
  type NotebookPlanResult,
} from '@/lib/notebook/send-message';

export type AskNotebookConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
  at?: number;
};

export type AskNotebookAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  textExcerpt?: string;
};

export type AskNotebookOptions = {
  notebookId: string;
  question: string;
  conversation?: AskNotebookConversationMessage[];
  attachments?: AskNotebookAttachment[];
  allowWrite?: boolean;
  preferWebSearch?: boolean;
  stream?: boolean;
  onAnswerDelta?: (delta: string) => void;
  onStatus?: (message: string) => void;
};

export async function askNotebook(options: AskNotebookOptions): Promise<NotebookPlanResult> {
  const shouldStream = options.stream ?? Boolean(options.onAnswerDelta || options.onStatus);
  const sendOptions = {
    allowWrite: options.allowWrite ?? false,
    preferWebSearch: options.preferWebSearch ?? true,
    conversation: options.conversation,
    attachments: options.attachments,
  };

  if (shouldStream) {
    return planNotebookMessageStream(options.notebookId, options.question, sendOptions, {
      onAnswerDelta: options.onAnswerDelta,
      onStatus: options.onStatus,
    });
  }

  return planNotebookMessage(options.notebookId, options.question, sendOptions);
}
