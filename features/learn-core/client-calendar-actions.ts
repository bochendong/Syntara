import type { LearningAction } from '@/lib/types/chat';

export type SyllabusEventKind =
  | 'assignment'
  | 'exam'
  | 'progress'
  | 'tutorial'
  | 'holiday'
  | 'other';

export type SyllabusCalendarEvent = {
  id: string;
  title: string;
  kind: SyllabusEventKind;
  date: string;
  sourceName: string;
  createdAt: number;
  origin?: 'syllabus' | 'ai_plan' | 'manual' | 'practice' | 'exam_prep';
  sourceRef?: { type: 'plan' | 'action' | 'syllabus' | 'manual'; id: string };
  durationMinutes?: number;
  status?: 'planned' | 'done' | 'skipped';
  week?: string | null;
  sourceColumn?: string | null;
  rawText?: string | null;
  confidence?: number | null;
};

const SYLLABUS_EVENTS_STORAGE_PREFIX = 'syntara-learn-syllabus-events:v1';

function syllabusEventsKey(userId: string, courseId: string): string {
  return [
    SYLLABUS_EVENTS_STORAGE_PREFIX,
    encodeURIComponent(userId),
    encodeURIComponent(courseId),
  ].join(':');
}

export function readSyllabusEvents(userId: string, courseId: string): SyllabusCalendarEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(syllabusEventsKey(userId, courseId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<SyllabusCalendarEvent>[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is SyllabusCalendarEvent =>
        Boolean(
          item &&
          typeof item.id === 'string' &&
          typeof item.title === 'string' &&
          typeof item.date === 'string' &&
          typeof item.sourceName === 'string' &&
          typeof item.createdAt === 'number' &&
          ['assignment', 'exam', 'progress', 'tutorial', 'holiday', 'other'].includes(
            String(item.kind),
          ),
        ),
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
      .slice(0, 120);
  } catch {
    return [];
  }
}

export function writeSyllabusEvents(
  userId: string,
  courseId: string,
  events: SyllabusCalendarEvent[],
): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(syllabusEventsKey(userId, courseId), JSON.stringify(events.slice(0, 120)));
  } catch {
    // localStorage may be unavailable.
  }
}

function makeClientId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function localDayKey(value: number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function addCalendarDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function payloadRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function actionPayload(action: LearningAction): Record<string, unknown> {
  return payloadRecord(action.payload);
}

function payloadString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function actionSummary(action: LearningAction): string {
  const payload = actionPayload(action);
  return (
    payloadString(payload.summary) ||
    payloadString(payload.reason) ||
    action.summary ||
    action.label ||
    'AI 学习动作'
  ).slice(0, 500);
}

function validDateKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : null;
}

export function mergeSyllabusEvents(
  existingEvents: SyllabusCalendarEvent[],
  incomingEvents: SyllabusCalendarEvent[],
): SyllabusCalendarEvent[] {
  const byKey = new Map<string, SyllabusCalendarEvent>();
  for (const event of [...existingEvents, ...incomingEvents]) {
    byKey.set(`${event.date}:${event.kind}:${event.title.toLowerCase()}`, event);
  }
  return Array.from(byKey.values()).sort(
    (a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title),
  );
}

export function learningActionCalendarEvents(action: LearningAction): SyllabusCalendarEvent[] {
  const payload = actionPayload(action);
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const items = rawItems.filter((item): item is Record<string, unknown> =>
    Boolean(item && typeof item === 'object' && !Array.isArray(item)),
  );

  if (items.length > 0) {
    return items.slice(0, 30).map((item, index) => ({
      id: makeClientId('learning-action-event'),
      title:
        payloadString(item.title) ||
        payloadString(item.label) ||
        `${action.label || '学习日程'} ${index + 1}`,
      kind: 'progress',
      date:
        validDateKey(item.date) ||
        validDateKey(item.day) ||
        localDayKey(addCalendarDays(new Date(), index)),
      sourceName: 'AI 学习动作',
      origin: 'ai_plan',
      sourceRef: { type: 'action', id: action.id },
      durationMinutes:
        typeof item.durationMinutes === 'number' && Number.isFinite(item.durationMinutes)
          ? Math.max(5, Math.round(item.durationMinutes))
          : undefined,
      status: 'planned',
      rawText: payloadString(item.reason) || actionSummary(action),
      createdAt: Date.now(),
    }));
  }

  return [
    {
      id: makeClientId('learning-action-event'),
      title: actionSummary(action),
      kind: 'progress',
      date: validDateKey(payload.date) || localDayKey(new Date()),
      sourceName: 'AI 学习动作',
      origin: 'ai_plan',
      sourceRef: { type: 'action', id: action.id },
      durationMinutes:
        typeof payload.durationMinutes === 'number' && Number.isFinite(payload.durationMinutes)
          ? Math.max(5, Math.round(payload.durationMinutes))
          : undefined,
      status: 'planned',
      rawText: actionSummary(action),
      createdAt: Date.now(),
    },
  ];
}

function actionTargets(action: LearningAction): string[] {
  const payload = actionPayload(action);
  const targets = Array.isArray(payload.targets) ? payload.targets : [];
  const targetIds = Array.isArray(payload.targetIds) ? payload.targetIds : [];
  return Array.from(
    new Set(
      [
        ...targetIds.map((item) => payloadString(item)),
        payloadString(payload.eventId),
        ...targets.map((item) => payloadString(item)),
        payloadString(payload.target),
      ].filter(Boolean),
    ),
  );
}

function calendarEventMatchesTarget(event: SyllabusCalendarEvent, target: string): boolean {
  const normalizedTarget = target.trim().toLowerCase();
  if (!normalizedTarget) return false;
  if (event.id.toLowerCase() === normalizedTarget) return true;
  if (event.sourceRef?.id?.toLowerCase() === normalizedTarget) return true;
  const normalizedTitle = event.title.trim().toLowerCase();
  return normalizedTitle === normalizedTarget || normalizedTitle.includes(normalizedTarget);
}

function uniqueCalendarTargetMatches(
  events: SyllabusCalendarEvent[],
  targets: string[],
): SyllabusCalendarEvent[] {
  const matched = new Map<string, SyllabusCalendarEvent>();
  for (const target of targets) {
    for (const event of events) {
      if (calendarEventMatchesTarget(event, target)) matched.set(event.id, event);
    }
  }
  return [...matched.values()];
}

function weekdayIndexFromText(text: string): number | null {
  const normalized = text.toLowerCase();
  if (/周日|星期日|礼拜日|sunday|sun/.test(normalized)) return 0;
  if (/周一|星期一|礼拜一|monday|mon/.test(normalized)) return 1;
  if (/周二|星期二|礼拜二|tuesday|tue/.test(normalized)) return 2;
  if (/周三|星期三|礼拜三|wednesday|wed/.test(normalized)) return 3;
  if (/周四|星期四|礼拜四|thursday|thu/.test(normalized)) return 4;
  if (/周五|星期五|礼拜五|friday|fri/.test(normalized)) return 5;
  if (/周六|星期六|礼拜六|saturday|sat/.test(normalized)) return 6;
  return null;
}

function firstCalendarDateForWeekday(
  events: SyllabusCalendarEvent[],
  weekday: number,
): string | null {
  const today = localDayKey(new Date());
  const matched = events
    .filter((event) => event.date >= today)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'zh-CN'))
    .find((event) => new Date(`${event.date}T12:00:00`).getDay() === weekday);
  return matched?.date || null;
}

function isAiEditableCalendarEvent(event: SyllabusCalendarEvent): boolean {
  return (
    event.origin === 'ai_plan' ||
    event.origin === 'practice' ||
    event.origin === 'manual' ||
    event.sourceName === 'AI 学习动作'
  );
}

function applyBulkLearningCalendarUpdate(args: {
  events: SyllabusCalendarEvent[];
  action: LearningAction;
}): { events: SyllabusCalendarEvent[]; updated: SyllabusCalendarEvent } | null {
  const payload = actionPayload(args.action);
  const updates = payloadRecord(payload.updates);
  const actionText = [
    actionSummary(args.action),
    payloadString(payload.reason),
    payloadString(updates.reason),
    payloadString(payload.description),
  ]
    .filter(Boolean)
    .join('\n');
  const shiftByDays =
    typeof updates.shiftByDays === 'number' && Number.isFinite(updates.shiftByDays)
      ? Math.round(updates.shiftByDays)
      : typeof payload.shiftByDays === 'number' && Number.isFinite(payload.shiftByDays)
        ? Math.round(payload.shiftByDays)
        : /(顺延|后移|推迟|delay|shift)/i.test(actionText)
          ? 1
          : 0;
  if (!shiftByDays) return null;

  const weekday = weekdayIndexFromText(actionText);
  const sinceDate =
    validDateKey(updates.sinceDate) ||
    validDateKey(payload.sinceDate) ||
    validDateKey(updates.fromDate) ||
    validDateKey(payload.fromDate) ||
    validDateKey(updates.date) ||
    validDateKey(payload.date) ||
    (weekday === null ? null : firstCalendarDateForWeekday(args.events, weekday));
  if (!sinceDate) return null;

  const candidateIds = new Set(
    args.events
      .filter((event) => isAiEditableCalendarEvent(event) && event.date >= sinceDate)
      .map((event) => event.id),
  );
  if (!candidateIds.size) return null;
  let firstUpdated: SyllabusCalendarEvent | null = null;
  const events = args.events.map((event) => {
    if (!candidateIds.has(event.id)) return event;
    const updated: SyllabusCalendarEvent = {
      ...event,
      date: localDayKey(addCalendarDays(new Date(`${event.date}T12:00:00`), shiftByDays)),
      rawText: payloadString(updates.reason) || payloadString(payload.reason) || event.rawText,
    };
    firstUpdated ||= updated;
    return updated;
  });
  return firstUpdated ? { events, updated: firstUpdated } : null;
}

export function applyLearningCalendarUpdate(args: {
  events: SyllabusCalendarEvent[];
  action: LearningAction;
}): { events: SyllabusCalendarEvent[]; updated: SyllabusCalendarEvent } | null {
  const payload = actionPayload(args.action);
  const matches = uniqueCalendarTargetMatches(args.events, actionTargets(args.action));
  if (matches.length !== 1) return applyBulkLearningCalendarUpdate(args);
  const target = matches[0];
  const updates = payloadRecord(payload.updates);
  const shiftByDays =
    typeof updates.shiftByDays === 'number' && Number.isFinite(updates.shiftByDays)
      ? Math.round(updates.shiftByDays)
      : 0;
  const updated: SyllabusCalendarEvent = {
    ...target,
    title: payloadString(updates.title) || payloadString(payload.title) || target.title,
    date:
      validDateKey(updates.date) ||
      validDateKey(payload.date) ||
      (shiftByDays
        ? localDayKey(addCalendarDays(new Date(`${target.date}T12:00:00`), shiftByDays))
        : target.date),
    durationMinutes:
      typeof updates.durationMinutes === 'number' && Number.isFinite(updates.durationMinutes)
        ? Math.max(5, Math.round(updates.durationMinutes))
        : typeof payload.durationMinutes === 'number' && Number.isFinite(payload.durationMinutes)
          ? Math.max(5, Math.round(payload.durationMinutes))
          : target.durationMinutes,
    status:
      updates.status === 'done' || updates.status === 'skipped' || updates.status === 'planned'
        ? updates.status
        : target.status,
    rawText: payloadString(updates.reason) || payloadString(payload.reason) || target.rawText,
  };
  return {
    events: args.events.map((event) => (event.id === target.id ? updated : event)),
    updated,
  };
}

export function applyLearningCalendarDelete(args: {
  events: SyllabusCalendarEvent[];
  action: LearningAction;
}): { events: SyllabusCalendarEvent[]; deleted: SyllabusCalendarEvent } | null {
  const matches = uniqueCalendarTargetMatches(args.events, actionTargets(args.action));
  if (matches.length !== 1) return null;
  return {
    events: args.events.filter((event) => event.id !== matches[0].id),
    deleted: matches[0],
  };
}
