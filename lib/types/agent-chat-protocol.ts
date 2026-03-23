/**
 * Course Agent <-> Notebook Agent chat protocol (draft v1)
 * Inspired by A2A task lifecycle: task dispatch, ack, wait, final.
 */

export type ProtocolRole = 'user' | 'course_agent' | 'notebook_agent';

export type ProtocolMessageType =
  | 'task.dispatch'
  | 'task.ack'
  | 'task.wait'
  | 'task.partial'
  | 'task.result'
  | 'task.error';

export type ProtocolAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  textExcerpt?: string;
  imageUrl?: string;
};

export type ProtocolMessageEnvelope<TPayload = Record<string, unknown>> = {
  protocol: 'openmaic.a2a.v1';
  messageId: string;
  conversationId: string;
  parentMessageId?: string;
  courseId: string;
  sender: {
    role: ProtocolRole;
    id: string;
    name: string;
  };
  receiver: {
    role: ProtocolRole;
    id: string;
    name: string;
  };
  type: ProtocolMessageType;
  createdAt: number;
  payload: TPayload;
  attachments?: ProtocolAttachment[];
};

export type TaskDispatchPayload = {
  taskId: string;
  intent: 'qa' | 'plan' | 'write';
  message: string;
  contextWindow: Array<{ role: 'user' | 'assistant'; content: string; at?: number }>;
  constraints?: {
    allowWrite?: boolean;
    deadlineMs?: number;
  };
};

export type TaskAckPayload = {
  taskId: string;
  accepted: boolean;
  reason?: string;
};

export type TaskWaitPayload = {
  taskId: string;
  waitingFor: 'tool' | 'human' | 'subagent' | 'network';
  etaMs?: number;
  progressText?: string;
};

export type TaskResultPayload = {
  taskId: string;
  summary: string;
  references?: Array<{ page?: number; title?: string; why?: string }>;
  operations?: {
    insert?: Array<Record<string, unknown>>;
    update?: Array<Record<string, unknown>>;
    delete?: Array<Record<string, unknown>>;
  };
};

export type TaskErrorPayload = {
  taskId: string;
  code: string;
  message: string;
  retryable?: boolean;
};
