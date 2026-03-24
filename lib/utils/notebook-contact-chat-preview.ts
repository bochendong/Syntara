/**
 * 课程 /chat 里笔记本会话的快照消息（与 chat-page-client NotebookChatMessage 对齐）
 */
export type NotebookContactChatMessage =
  | {
      role: 'user';
      text: string;
      at: number;
    }
  | {
      role: 'assistant';
      answer: string;
      at: number;
    };

function truncate(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** 取线程中最后一条用户或助手消息的摘要（快照内按时间顺序排列），用于侧栏列表 */
export function lastNotebookChatPreview(
  messages: NotebookContactChatMessage[],
  maxLen = 72,
): string | null {
  let last: NotebookContactChatMessage | undefined;
  for (const m of messages) {
    if (m.role === 'user' || m.role === 'assistant') last = m;
  }
  if (!last) return null;
  if (last.role === 'user') {
    const text = last.text?.trim();
    return text ? truncate(text, maxLen) : null;
  }
  const text = last.answer?.trim();
  return text ? truncate(text, maxLen) : null;
}

/** 会话内最后一条消息的 `at` 时间戳，用于侧栏「最近在上」排序；无消息返回 0 */
export function lastNotebookChatActivityAt(messages: NotebookContactChatMessage[]): number {
  let max = 0;
  for (const m of messages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    if (typeof m.at === 'number' && m.at > max) max = m.at;
  }
  return max;
}
