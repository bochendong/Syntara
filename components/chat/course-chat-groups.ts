import type { UIMessage } from 'ai';
import { COURSE_ORCHESTRATOR_ID, COURSE_ORCHESTRATOR_NAME } from '@/lib/constants/course-chat';
import type {
  ChatMessageMetadata,
  CourseChatGroupMeta,
  CourseChatParticipant,
  CourseChatWorkingMemory,
} from '@/lib/types/chat';
import type { StageListItem } from '@/lib/utils/stage-storage';
import { messageText } from './chat-message-utils';

export const COURSE_CHAT_GROUPS_UPDATED_EVENT = 'synatra-course-chat-groups-updated';

export function createCourseChatGroupId(): string {
  return `grp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function makeOrchestratorParticipant(args: {
  avatarUrl?: string | null;
  joinedAt?: number;
}): CourseChatParticipant {
  return {
    id: COURSE_ORCHESTRATOR_ID,
    kind: 'orchestrator',
    name: COURSE_ORCHESTRATOR_NAME,
    avatarUrl: args.avatarUrl || null,
    joinedAt: args.joinedAt ?? Date.now(),
  };
}

export function makeNotebookParticipant(
  notebook: StageListItem,
  joinedAt = Date.now(),
): CourseChatParticipant {
  return {
    id: notebook.id,
    kind: 'notebook',
    name: notebook.name,
    avatarUrl: notebook.avatarUrl || null,
    joinedAt,
  };
}

export function participantIds(participants: CourseChatParticipant[]): Set<string> {
  return new Set(participants.map((p) => p.id));
}

export function hasAllParticipants(
  group: CourseChatGroupMeta,
  required: CourseChatParticipant[],
): boolean {
  const ids = participantIds(group.participants);
  return required.every((p) => ids.has(p.id));
}

export function mergeParticipants(
  current: CourseChatParticipant[],
  additions: CourseChatParticipant[],
): { participants: CourseChatParticipant[]; added: CourseChatParticipant[] } {
  const order = current.map((participant) => participant.id);
  const byId = new Map(current.map((participant) => [participant.id, participant]));
  const added: CourseChatParticipant[] = [];
  for (const participant of additions) {
    const existing = byId.get(participant.id);
    if (existing) {
      byId.set(participant.id, {
        ...existing,
        kind: participant.kind || existing.kind,
        name: participant.name || existing.name,
        avatarUrl: participant.avatarUrl || existing.avatarUrl || null,
        joinedAt: existing.joinedAt || participant.joinedAt,
      });
      continue;
    }
    byId.set(participant.id, participant);
    order.push(participant.id);
    added.push(participant);
  }
  return {
    participants: order
      .map((id) => byId.get(id))
      .filter((participant): participant is CourseChatParticipant => Boolean(participant)),
    added,
  };
}

export function refreshGroupParticipants(
  group: CourseChatGroupMeta,
  freshParticipants: CourseChatParticipant[],
): CourseChatGroupMeta {
  const merged = mergeParticipants(group.participants, freshParticipants);
  return {
    ...group,
    participants: merged.participants,
    name: buildGroupName(merged.participants),
    memberSummary: buildMemberSummary(merged.participants),
    updatedAt: Date.now(),
  };
}

export function pickReusableGroup(args: {
  groups: CourseChatGroupMeta[];
  required: CourseChatParticipant[];
  currentGroupId?: string | null;
}): CourseChatGroupMeta | null {
  if (args.currentGroupId) {
    const current = args.groups.find((group) => group.groupId === args.currentGroupId);
    if (current && hasAllParticipants(current, args.required)) return current;
  }
  return args.groups.find((group) => hasAllParticipants(group, args.required)) || null;
}

export function buildGroupName(participants: CourseChatParticipant[]): string {
  const notebookNames = participants
    .filter((p) => p.kind === 'notebook')
    .map((p) => p.name)
    .slice(0, 3);
  if (notebookNames.length === 0) return '课程讨论群';
  if (notebookNames.length === 1) return `${notebookNames[0]}讨论群`;
  return `${notebookNames.join(' × ')}讨论组`;
}

export function createGroupMeta(args: {
  participants: CourseChatParticipant[];
  createdReason?: string;
  lastRoutingReason?: string;
}): CourseChatGroupMeta {
  const now = Date.now();
  return {
    version: 1,
    groupId: createCourseChatGroupId(),
    name: buildGroupName(args.participants),
    participants: args.participants,
    createdReason: args.createdReason,
    lastRoutingReason: args.lastRoutingReason,
    memberSummary: buildMemberSummary(args.participants),
    createdAt: now,
    updatedAt: now,
    lastActiveAt: now,
  };
}

export function buildMemberSummary(participants: CourseChatParticipant[]): string {
  const notebooks = participants.filter((participant) => participant.kind === 'notebook');
  if (notebooks.length === 0) return '课程总控负责调度和收束';
  return `${participants.length} 位成员 · ${notebooks
    .map((participant) => participant.name)
    .slice(0, 3)
    .join('、')}`;
}

function deriveGroupWorkingMemory(
  messages: UIMessage<ChatMessageMetadata>[],
  previous?: CourseChatWorkingMemory,
): CourseChatWorkingMemory | undefined {
  const recent = messages.slice(-20);
  const lastUser = [...recent].reverse().find((message) => message.role === 'user');
  const dispatch = [...recent]
    .reverse()
    .find(
      (message) =>
        message.role !== 'user' &&
        message.metadata?.senderKind === 'orchestrator' &&
        ((message.metadata.mentionedParticipantIds?.length || 0) > 0 ||
          Boolean(message.metadata.dispatchNote)),
    );
  const sources = recent
    .flatMap((message) => message.metadata?.sourceReferences || [])
    .map((source) => ({
      notebookId: source.notebookId,
      notebookName: source.notebookName,
      order: source.order,
      title: source.title,
    }))
    .filter((source) => Number.isFinite(source.order) && source.order > 0 && source.title);
  const sourceKey = (source: { notebookId?: string; notebookName?: string; order: number; title: string }) =>
    `${source.notebookId || source.notebookName || 'source'}:${source.order}:${source.title}`;
  const uniqueSources: typeof sources = [];
  const seen = new Set<string>();
  for (const source of sources.reverse()) {
    const key = sourceKey(source);
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueSources.unshift(source);
  }

  const next: CourseChatWorkingMemory = {
    lastUserQuestion: lastUser ? messageText(lastUser).replace(/\s+/g, ' ').trim().slice(0, 160) : previous?.lastUserQuestion,
    dispatchSummary: dispatch
      ? messageText(dispatch).replace(/\s+/g, ' ').trim().slice(0, 160)
      : previous?.dispatchSummary,
    recentSources: uniqueSources.slice(-6),
    updatedAt: Date.now(),
  };
  if (!next.lastUserQuestion && !next.dispatchSummary && (next.recentSources?.length || 0) === 0) {
    return previous;
  }
  return next;
}

export function updateGroupActivity(
  meta: CourseChatGroupMeta,
  messages: UIMessage<ChatMessageMetadata>[],
): CourseChatGroupMeta {
  const lastMessage = [...messages].reverse().find((message) => messageText(message).trim());
  const preview = lastMessage
    ? messageText(lastMessage).replace(/\s+/g, ' ').trim().slice(0, 80)
    : '';
  const activeAt = lastMessage?.metadata?.createdAt || Date.now();
  return {
    ...meta,
    workingMemory: deriveGroupWorkingMemory(messages, meta.workingMemory),
    memberSummary: buildMemberSummary(meta.participants),
    lastMessagePreview: preview || meta.lastMessagePreview,
    lastActiveAt: activeAt,
    updatedAt: Date.now(),
  };
}
