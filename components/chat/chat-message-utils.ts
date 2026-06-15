import type { UIMessage } from 'ai';
import type { ChatMessageMetadata, MessageAction } from '@/lib/types/chat';
import {
  buildNotebookContentDocumentFromText,
  type NotebookContentDocument,
} from '@/lib/notebook-content';
import type { NotebookPlanResult } from '@/lib/notebook/send-message';
import { hydrateMetadataAttachments } from '@/lib/utils/chat-attachment-blobs';
import type { NotebookChatMessage } from './chat-page-types';

export function shouldOfferMicroLessonButton(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.length >= 700) return true;
  if (/```|def\s+\w+\(|class\s+\w+|big\s*o|复杂度|quicksort|quick sort|递归|算法/i.test(t))
    return true;
  const lines = t.split(/\r?\n/).filter((l) => l.trim() !== '');
  return lines.length >= 18;
}

export function messageText(m: UIMessage<ChatMessageMetadata>) {
  return m.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

export function formatAppliedSummary(result: {
  applied?: {
    insertedPageRange?: string;
    updatedPages?: number[];
    deletedPages?: number[];
  } | null;
}) {
  const a = result.applied;
  if (!a) return '';
  const bits: string[] = [];
  if (a.insertedPageRange) bits.push(`已插入页：${a.insertedPageRange}`);
  if (a.updatedPages?.length) bits.push(`已更新页：${a.updatedPages.join(', ')}`);
  if (a.deletedPages?.length) bits.push(`已删除页：${a.deletedPages.join(', ')}`);
  return bits.join(' · ') || '';
}

export function hasNotebookWrites(plan: Pick<NotebookPlanResult, 'operations'>): boolean {
  return (
    (plan.operations.insert?.length || 0) > 0 ||
    (plan.operations.update?.length || 0) > 0 ||
    (plan.operations.delete?.length || 0) > 0
  );
}

export function buildChatMessage(
  text: string,
  options: {
    senderName: string;
    senderAvatar?: string | null;
    originalRole?: ChatMessageMetadata['originalRole'];
    senderKind?: ChatMessageMetadata['senderKind'];
    groupEvent?: ChatMessageMetadata['groupEvent'];
    groupEventSummary?: string;
    groupEventDetail?: string;
    mentionedParticipantIds?: string[];
    mentionedParticipantDetails?: ChatMessageMetadata['mentionedParticipantDetails'];
    dispatchVerb?: string;
    dispatchNote?: string;
    dispatchPrompt?: string;
    sourceReferences?: ChatMessageMetadata['sourceReferences'];
    actions?: MessageAction[];
    attachments?: ChatMessageMetadata['attachments'];
    streaming?: boolean;
    statusText?: string;
  },
): UIMessage<ChatMessageMetadata> {
  const now = Date.now();
  return {
    id: `msg-${now}-${Math.random().toString(36).slice(2, 8)}`,
    role: options.originalRole === 'user' ? 'user' : 'assistant',
    parts: [{ type: 'text', text }],
    metadata: {
      senderName: options.senderName,
      senderAvatar: options.senderAvatar || undefined,
      originalRole: options.originalRole || 'agent',
      senderKind: options.senderKind,
      groupEvent: options.groupEvent,
      groupEventSummary: options.groupEventSummary,
      groupEventDetail: options.groupEventDetail,
      mentionedParticipantIds: options.mentionedParticipantIds,
      mentionedParticipantDetails: options.mentionedParticipantDetails,
      dispatchVerb: options.dispatchVerb,
      dispatchNote: options.dispatchNote,
      dispatchPrompt: options.dispatchPrompt,
      sourceReferences: options.sourceReferences,
      createdAt: now,
      actions: options.actions,
      attachments: options.attachments,
      streaming: options.streaming,
      statusText: options.statusText,
    },
  };
}

export function appendNotebookAnswerCallout(args: {
  document?: NotebookContentDocument;
  fallbackText: string;
  tone: 'info' | 'success' | 'warning' | 'danger' | 'tip';
  title?: string;
  text: string;
}): NotebookContentDocument {
  const base =
    args.document ||
    buildNotebookContentDocumentFromText({
      text: args.fallbackText,
    });
  return {
    ...base,
    blocks: [
      ...base.blocks,
      {
        type: 'callout',
        tone: args.tone,
        title: args.title,
        text: args.text,
      },
    ],
  };
}

type NotebookAssistantMessage = Extract<NotebookChatMessage, { role: 'assistant' }>;

function inferLegacyCodeLanguage(text: string): string {
  if (/\(@(?:htdf|signature|template-origin)\b|\(check-expect\b|\(define\b|#reader|#lang/u.test(text)) {
    return 'racket';
  }
  if (/\bdef\s+\w+\s*\(|\bclass\s+\w+|^\s*(?:from|import)\s+\w+/mu.test(text)) {
    return 'python';
  }
  if (/\b(?:const|let|var|function)\s+\w+|=>|console\.log/u.test(text)) {
    return 'typescript';
  }
  return 'text';
}

function normalizeLegacyAnswerText(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/\s+(\(@(?:htdf|signature|template-origin)\b)/gu, '\n$1')
    .replace(/\s+(\(check-expect\b)/gu, '\n$1')
    .replace(/\s+(\(define\b)/gu, '\n$1')
    .replace(/\s+(;\s*\(define\b)/gu, '\n$1')
    .trim();
}

function looksLikeLegacyCodeLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return (
    /\(@(?:htdf|signature|template-origin)\b|\(check-expect\b|\(define\b|#reader|#lang/u.test(
      trimmed,
    ) ||
    /^(?:;|;;|\(|\)|\[|\]|\{|\})/u.test(trimmed) ||
    /^(?:require|local|cond|else|lambda)\b/u.test(trimmed) ||
    /^(?:def|class|return|print|import|from|if|elif|else|for|while|with|try|except)\b/u.test(
      trimmed,
    ) ||
    /^[A-Za-z_][\w-]*\s*=/u.test(trimmed)
  );
}

function looksLikeLegacyCodeContinuation(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  return (
    looksLikeLegacyCodeLine(line) ||
    /^\s{2,}\S/u.test(line) ||
    /^[\])}]+/u.test(trimmed) ||
    /[()[\]{}]$/.test(trimmed)
  );
}

function pushLegacyProseBlocks(
  blocks: NotebookContentDocument['blocks'],
  prose: string[],
): string[] {
  const lines = prose.map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const allBullets = lines.every((line) => /^[-*•]\s+/.test(line));
  const allNumbered = lines.every((line) => /^\d+[.)]\s+/.test(line));
  if (allBullets || allNumbered) {
    blocks.push({
      type: 'bullet_list',
      items: lines.map((line) => line.replace(/^[-*•]\s+|^\d+[.)]\s+/u, '').trim()),
    });
    return [];
  }

  const paragraph = lines.join('\n').trim();
  if (paragraph) {
    blocks.push({ type: 'paragraph', text: paragraph });
  }
  return [];
}

function parseLegacyProseAndCode(
  text: string,
  blocks: NotebookContentDocument['blocks'],
): boolean {
  const lines = normalizeLegacyAnswerText(text).split('\n');
  let prose: string[] = [];
  let code: string[] = [];
  let sawCode = false;

  const flushProse = () => {
    prose = pushLegacyProseBlocks(blocks, prose);
  };
  const flushCode = () => {
    const codeText = code.join('\n').trim();
    if (!codeText) {
      code = [];
      return;
    }
    blocks.push({
      type: 'code_block',
      language: inferLegacyCodeLanguage(codeText),
      code: codeText,
    });
    sawCode = true;
    code = [];
  };

  for (const line of lines) {
    if (code.length > 0) {
      if (looksLikeLegacyCodeContinuation(line)) {
        code.push(line);
        continue;
      }
      flushCode();
      prose.push(line);
      continue;
    }

    if (looksLikeLegacyCodeLine(line)) {
      flushProse();
      code.push(line);
      continue;
    }

    if (!line.trim()) {
      flushProse();
      continue;
    }

    prose.push(line);
  }

  flushCode();
  flushProse();
  return sawCode;
}

function buildLegacyNotebookAnswerDocumentFromText(
  answer: string,
): NotebookContentDocument | undefined {
  const normalized = normalizeLegacyAnswerText(answer);
  if (!normalized) return undefined;

  const hasStructuredSignal =
    /```|\(@(?:htdf|signature|template-origin)\b|\(check-expect\b|\(define\b|#reader|#lang|\bdef\s+\w+\s*\(/u.test(
      normalized,
    );
  if (!hasStructuredSignal) return undefined;

  const blocks: NotebookContentDocument['blocks'] = [];
  const fencePattern = /```([a-zA-Z0-9_+-]*)[^\n]*\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let sawCode = false;
  let match: RegExpExecArray | null;

  while ((match = fencePattern.exec(normalized)) !== null) {
    const before = normalized.slice(lastIndex, match.index);
    if (before.trim()) {
      sawCode = parseLegacyProseAndCode(before, blocks) || sawCode;
    }
    const codeText = (match[2] || '').trim();
    if (codeText) {
      blocks.push({
        type: 'code_block',
        language: (match[1] || '').trim() || inferLegacyCodeLanguage(codeText),
        code: codeText,
      });
      sawCode = true;
    }
    lastIndex = match.index + match[0].length;
  }

  const rest = normalized.slice(lastIndex);
  if (rest.trim()) {
    sawCode = parseLegacyProseAndCode(rest, blocks) || sawCode;
  }

  if (!sawCode || blocks.length === 0) return undefined;
  const profile = 'code';
  return {
    version: 1,
    language: 'zh-CN',
    profile,
    disciplineStyle: profile === 'code' ? 'code' : 'general',
    teachingFlow: profile === 'code' ? 'code_walkthrough' : 'concept_explain',
    layout: { mode: 'stack' },
    density: 'standard',
    visualRole: 'none',
    overflowPolicy: 'compress_first',
    preserveFullProblemStatement: false,
    archetype: profile === 'code' ? 'example' : 'concept',
    blocks,
  };
}

export function getNotebookAnswerDocumentForDisplay(
  message: NotebookAssistantMessage,
): NotebookContentDocument | undefined {
  if (message.answerDocument) return message.answerDocument;
  if (message.streaming) return undefined;
  return buildLegacyNotebookAnswerDocumentFromText(message.answer);
}

function upgradeLegacyNotebookAnswer(message: NotebookChatMessage): NotebookChatMessage {
  if (message.role !== 'assistant' || message.answerDocument || message.streaming) return message;
  const answerDocument = buildLegacyNotebookAnswerDocumentFromText(message.answer);
  return answerDocument ? { ...message, answerDocument } : message;
}

export function stripAttachmentUrlsFromAgentMessages(
  messages: UIMessage<ChatMessageMetadata>[],
): UIMessage<ChatMessageMetadata>[] {
  return messages.map((m) => {
    if (!m.metadata?.attachments?.length) {
      return m.metadata?.streaming || m.metadata?.statusText
        ? { ...m, metadata: { ...m.metadata, streaming: false, statusText: undefined } }
        : m;
    }
    return {
      ...m,
      metadata: {
        ...m.metadata,
        streaming: false,
        statusText: undefined,
        attachments: m.metadata.attachments.map(({ objectUrl: _u, ...rest }) => rest),
      },
    };
  });
}

export function stripAttachmentUrlsFromNotebookMessages(
  messages: NotebookChatMessage[],
): NotebookChatMessage[] {
  return messages.map((m) => {
    if (m.role === 'assistant' && (m.streaming || m.statusText)) {
      return { ...m, streaming: false, statusText: undefined };
    }
    if (m.role !== 'user' || !m.attachments?.length) return m;
    return {
      ...m,
      attachments: m.attachments.map(({ objectUrl: _u, ...rest }) => rest),
    };
  });
}

export async function hydrateNotebookThread(
  messages: NotebookChatMessage[],
): Promise<NotebookChatMessage[]> {
  const out: NotebookChatMessage[] = [];
  for (const m of messages) {
    if (m.role === 'assistant') {
      out.push(upgradeLegacyNotebookAnswer(m));
      continue;
    }
    if (m.role !== 'user' || !m.attachments?.length) {
      out.push(m);
      continue;
    }
    const attachments = await hydrateMetadataAttachments(m.attachments);
    out.push({ ...m, attachments });
  }
  return out;
}

export async function hydrateAgentThread(
  messages: UIMessage<ChatMessageMetadata>[],
): Promise<UIMessage<ChatMessageMetadata>[]> {
  return Promise.all(
    messages.map(async (m) => {
      if (!m.metadata?.attachments?.length) return m;
      const attachments = await hydrateMetadataAttachments(m.metadata.attachments);
      return { ...m, metadata: { ...m.metadata, attachments } };
    }),
  );
}

export function revokeNotebookAttachmentUrls(thread: NotebookChatMessage[]) {
  for (const m of thread) {
    if (m.role === 'user' && m.attachments) {
      for (const a of m.attachments) {
        if (a.objectUrl) URL.revokeObjectURL(a.objectUrl);
      }
    }
  }
}

export function revokeAgentAttachmentUrls(thread: UIMessage<ChatMessageMetadata>[]) {
  for (const m of thread) {
    m.metadata?.attachments?.forEach((a) => {
      if (a.objectUrl) URL.revokeObjectURL(a.objectUrl);
    });
  }
}

export function isMockTaskLike(task: { title?: string | null; detail?: string | null }): boolean {
  const title = task.title || '';
  const detail = task.detail || '';
  return /mock/i.test(title) || /\[mock\]/i.test(detail);
}

export function isMockAgentMessage(message: UIMessage<ChatMessageMetadata>): boolean {
  const text = messageText(message);
  return /^【Mock\s*流程/.test(text) || /^\[Mock\]/i.test(text);
}

export function formatTs(ts?: number): string {
  if (!ts) return 'N/A';
  return new Date(ts).toLocaleString();
}
