import type { LearnClientAction } from './client-actions';

export type LearnClientCalendarDraftItem = {
  id?: string;
  eventId?: string;
  title: string;
  date?: string;
  start?: string;
  durationMinutes?: number;
  courseId?: string;
  reason?: string;
};

export type LearnClientCalendarArtifact =
  | {
      kind: 'calendar_draft';
      id: string;
      title?: string;
      items: LearnClientCalendarDraftItem[];
      sourceArtifactId?: string;
    }
  | {
      kind: 'activity_plan' | 'review_plan';
      id: string;
      title?: string;
      calendarDraftItems?: LearnClientCalendarDraftItem[];
    };

export type LearnClientArtifactMessage<TArtifact> = {
  artifacts?: TArtifact[];
};

function payloadRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function payloadString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function artifactHasCalendarItems(artifact: unknown): artifact is LearnClientCalendarArtifact {
  const record = payloadRecord(artifact);
  if (record.kind === 'calendar_draft') {
    return typeof record.id === 'string' && Array.isArray(record.items) && record.items.length > 0;
  }
  if (record.kind === 'activity_plan' || record.kind === 'review_plan') {
    return (
      typeof record.id === 'string' &&
      Array.isArray(record.calendarDraftItems) &&
      record.calendarDraftItems.length > 0
    );
  }
  return false;
}

function calendarArtifactFromUnknown(value: unknown): LearnClientCalendarArtifact | null {
  return artifactHasCalendarItems(value) ? value : null;
}

export function latestLearnArtifactsForTurn<TArtifact>(
  messages: LearnClientArtifactMessage<TArtifact>[],
  limit = 10,
): TArtifact[] {
  const artifacts: TArtifact[] = [];
  for (const message of messages.slice().reverse()) {
    if (!message.artifacts?.length) continue;
    artifacts.push(...message.artifacts);
    if (artifacts.length >= limit) break;
  }
  return artifacts.slice(0, limit);
}

export function createCalendarAddActionFromArtifacts<TArtifact>(args: {
  artifacts: TArtifact[];
  id: string;
}): LearnClientAction | null {
  let calendarDraft: Extract<LearnClientCalendarArtifact, { kind: 'calendar_draft' }> | undefined;
  let sourcePlan:
    | Extract<LearnClientCalendarArtifact, { kind: 'activity_plan' | 'review_plan' }>
    | undefined;
  for (const candidate of args.artifacts) {
    const artifact = calendarArtifactFromUnknown(candidate);
    if (!artifact) continue;
    if (!calendarDraft && artifact.kind === 'calendar_draft') {
      calendarDraft = artifact;
      continue;
    }
    if (!sourcePlan && (artifact.kind === 'activity_plan' || artifact.kind === 'review_plan')) {
      sourcePlan = artifact;
    }
    if (calendarDraft && sourcePlan) break;
  }
  const items = calendarDraft?.items || sourcePlan?.calendarDraftItems || [];
  if (!items.length) return null;
  const title = calendarDraft?.title || `${sourcePlan?.title || '学习计划'} 日历草稿`;
  return {
    id: args.id,
    kind: 'calendar.propose_add',
    label: '把活动计划加入日历',
    summary: `确认后会把「${title}」里的 ${items.length} 个活动加入学习日历。`,
    status: 'proposed',
    confirmation: 'required',
    payload: {
      title,
      items,
      sourceArtifactId: calendarDraft?.sourceArtifactId || sourcePlan?.id,
    },
  };
}

export function calendarArtifactReferenceIds<TArtifact>(artifacts?: TArtifact[]): Set<string> {
  const ids = new Set<string>();
  for (const candidate of artifacts || []) {
    const artifact = calendarArtifactFromUnknown(candidate);
    if (!artifact) continue;
    ids.add(artifact.id);
    if (artifact.kind === 'calendar_draft' && artifact.sourceArtifactId) {
      ids.add(artifact.sourceArtifactId);
    }
  }
  return ids;
}

export function matchingCalendarAddActionForArtifact(
  artifact: LearnClientCalendarArtifact,
  actions?: LearnClientAction[],
): LearnClientAction | null {
  if (!artifactHasCalendarItems(artifact)) return null;
  const candidateRefs = new Set(
    [
      artifact.id,
      artifact.kind === 'calendar_draft' ? artifact.sourceArtifactId : undefined,
    ].filter((item): item is string => Boolean(item)),
  );
  return (
    actions?.find((action) => {
      if (action.kind !== 'calendar.propose_add') return false;
      const sourceArtifactId = payloadString(payloadRecord(action.payload).sourceArtifactId);
      return sourceArtifactId ? candidateRefs.has(sourceArtifactId) : false;
    }) || null
  );
}

export function visibleLearningActionsForArtifacts<TArtifact>(
  actions?: LearnClientAction[],
  artifacts?: TArtifact[],
): LearnClientAction[] | undefined {
  if (!actions?.length) return undefined;
  const calendarRefs = calendarArtifactReferenceIds(artifacts);
  if (!calendarRefs.size) return actions;
  const visible = actions.filter((action) => {
    if (action.kind !== 'calendar.propose_add') return true;
    const sourceArtifactId = payloadString(payloadRecord(action.payload).sourceArtifactId);
    return sourceArtifactId ? !calendarRefs.has(sourceArtifactId) : false;
  });
  return visible.length ? visible : undefined;
}
