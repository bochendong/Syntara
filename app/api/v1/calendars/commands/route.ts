import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { decideTeachingTurn } from '@/features/learn-core';
import { learnActionToClientAction } from '@/features/learn-core/client-actions';
import {
  applyLearningCalendarDelete,
  applyLearningCalendarUpdate,
  learningActionCalendarEvents,
  mergeSyllabusEvents,
  type SyllabusCalendarEvent,
} from '@/features/learn-core/client-calendar-actions';
import { createRequestSemanticRouter } from '@/features/learn-core/server/semantic-router-runtime';
import type { LearningAction } from '@/lib/types/chat';
import {
  publicApiError,
  publicApiRequestId,
  publicApiSuccess,
  requirePublicApi,
} from '@/lib/server/public-api';
import { withRequestContext } from '@/lib/server/request-context';

export const runtime = 'nodejs';
export const maxDuration = 120;

const eventKindSchema = z.enum(['assignment', 'exam', 'progress', 'tutorial', 'holiday', 'other']);

const calendarEventSchema = z.object({
  id: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(500),
  kind: eventKindSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: z.string().trim().max(80).optional(),
  source_name: z.string().trim().max(300).optional().default('External API'),
  created_at: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .default(() => Date.now()),
  origin: z.enum(['syllabus', 'ai_plan', 'manual', 'practice', 'exam_prep']).optional(),
  source_ref: z
    .object({
      type: z.enum(['plan', 'action', 'syllabus', 'manual']),
      id: z.string().trim().min(1).max(200),
    })
    .optional(),
  duration_minutes: z.number().int().min(5).max(1440).optional(),
  status: z.enum(['planned', 'done', 'skipped']).optional(),
  week: z.string().max(120).nullable().optional(),
  source_column: z.string().max(200).nullable().optional(),
  raw_text: z.string().max(3000).nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
});

const proposalSchema = z.object({
  id: z.string().trim().min(1).max(200),
  kind: z.enum(['calendar.propose_add', 'calendar.propose_update', 'calendar.propose_delete']),
  label: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(1000).optional().default(''),
  payload: z.record(z.string(), z.unknown()).optional().default({}),
  confirmation: z.literal('required').optional().default('required'),
});

const commandRequestSchema = z
  .object({
    instruction: z.string().trim().min(1).max(4000).optional(),
    course_id: z.string().trim().max(200).optional(),
    course_name: z.string().trim().max(200).optional(),
    calendar: z.object({
      id: z.string().trim().max(200).optional(),
      timezone: z.string().trim().min(1).max(100).optional().default('Asia/Shanghai'),
      events: z.array(calendarEventSchema).max(200).default([]),
    }),
    proposal: proposalSchema.optional(),
    confirm: z.boolean().optional().default(false),
  })
  .refine((value) => Boolean(value.instruction || value.proposal), {
    message: 'instruction or proposal is required',
    path: ['instruction'],
  });

type CalendarProposal = z.infer<typeof proposalSchema>;
type ApiCalendarEvent = SyllabusCalendarEvent & { start?: string };

function asLearningAction(proposal: CalendarProposal): LearningAction {
  const minutes = proposal.payload.minutes;
  return {
    id: proposal.id,
    kind: proposal.kind,
    label: proposal.label,
    summary: proposal.summary,
    payload: {
      ...proposal.payload,
      ...(typeof minutes === 'number' && Number.isFinite(minutes)
        ? { durationMinutes: minutes }
        : {}),
    },
    confirmation: 'required',
  } as LearningAction;
}

function externalEvent(event: ApiCalendarEvent) {
  return {
    id: event.id,
    title: event.title,
    kind: event.kind,
    date: event.date,
    start: event.start,
    source_name: event.sourceName,
    created_at: event.createdAt,
    origin: event.origin,
    source_ref: event.sourceRef,
    duration_minutes: event.durationMinutes,
    status: event.status,
    week: event.week,
    source_column: event.sourceColumn,
    raw_text: event.rawText,
    confidence: event.confidence,
  };
}

function searchCalendar(events: ApiCalendarEvent[], instruction: string) {
  const dates = Array.from(instruction.match(/\b\d{4}-\d{2}-\d{2}\b/g) || []);
  const tokens = Array.from(
    new Set(
      instruction
        .normalize('NFKC')
        .toLowerCase()
        .split(/[^a-z0-9_+\-\u3400-\u9fff]+/)
        .map((item) => item.trim())
        .filter(
          (item) =>
            item.length >= 2 &&
            !['查询', '查看', '搜索', '日历', '日程', '安排', '哪些', '什么', 'calendar'].includes(
              item,
            ),
        ),
    ),
  ).slice(0, 12);
  const matched = events.filter((event) => {
    if (dates.length && !dates.includes(event.date)) return false;
    if (!tokens.length) return true;
    const haystack = [
      event.title,
      event.rawText || '',
      event.sourceName,
      event.kind,
      event.start || '',
    ]
      .join(' ')
      .toLowerCase();
    return tokens.some((token) => haystack.includes(token));
  });
  return matched.sort(
    (left, right) => left.date.localeCompare(right.date) || left.title.localeCompare(right.title),
  );
}

function proposalStart(payload: Record<string, unknown>, index = 0): string | undefined {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const item = items[index];
  const itemRecord =
    item && typeof item === 'object' && !Array.isArray(item)
      ? (item as Record<string, unknown>)
      : null;
  const value = itemRecord?.start ?? itemRecord?.startTime ?? payload.start;
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 80) : undefined;
}

function executeProposal(events: ApiCalendarEvent[], proposal: CalendarProposal) {
  const action = asLearningAction(proposal);
  if (proposal.kind === 'calendar.propose_add') {
    const added: ApiCalendarEvent[] = learningActionCalendarEvents(action).map((event, index) => ({
      ...event,
      start: proposalStart(proposal.payload, index),
    }));
    return {
      events: mergeSyllabusEvents(events, added),
      changed: added,
      message: `Added ${added.length} calendar event(s).`,
    };
  }
  if (proposal.kind === 'calendar.propose_update') {
    const result = applyLearningCalendarUpdate({ events, action });
    if (!result) return null;
    const start = proposalStart(proposal.payload);
    const updated: ApiCalendarEvent = { ...result.updated, ...(start ? { start } : {}) };
    return {
      events: result.events.map((event) => (event.id === updated.id ? updated : event)),
      changed: [updated],
      message: `Updated: ${updated.title}`,
    };
  }
  const result = applyLearningCalendarDelete({ events, action });
  return result
    ? {
        events: result.events,
        changed: [result.deleted],
        message: `Deleted: ${result.deleted.title}`,
      }
    : null;
}

export async function POST(request: NextRequest) {
  const requestId = publicApiRequestId(request);
  const principal = requirePublicApi(request, requestId);
  if (principal instanceof NextResponse) return principal;

  let input: z.infer<typeof commandRequestSchema>;
  try {
    const parsed = commandRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return publicApiError(
        requestId,
        400,
        'invalid_request',
        'Invalid calendar command request.',
        parsed.error.flatten(),
      );
    }
    input = parsed.data;
  } catch {
    return publicApiError(requestId, 400, 'invalid_request', 'Request body must be valid JSON.');
  }

  let localDate: string;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: input.calendar.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const part = (type: 'year' | 'month' | 'day') =>
      parts.find((item) => item.type === type)?.value || '';
    localDate = `${part('year')}-${part('month')}-${part('day')}`;
  } catch {
    return publicApiError(
      requestId,
      400,
      'invalid_request',
      `Invalid IANA timezone: ${input.calendar.timezone}`,
    );
  }

  const events: ApiCalendarEvent[] = input.calendar.events.map((event) => ({
    id: event.id,
    title: event.title,
    kind: event.kind,
    date: event.date,
    start: event.start,
    sourceName: event.source_name,
    createdAt: event.created_at,
    origin: event.origin,
    sourceRef: event.source_ref,
    durationMinutes: event.duration_minutes,
    status: event.status,
    week: event.week,
    sourceColumn: event.source_column,
    rawText: event.raw_text,
    confidence: event.confidence,
  }));
  if (input.proposal) {
    if (!input.confirm) {
      return publicApiSuccess(requestId, {
        status: 'requires_confirmation',
        operation: input.proposal.kind.replace('calendar.propose_', ''),
        proposal: input.proposal,
        calendar: { ...input.calendar, events: events.map(externalEvent) },
      });
    }
    const executed = executeProposal(events, input.proposal);
    if (!executed) {
      return publicApiError(
        requestId,
        409,
        'ambiguous_target',
        'The proposal did not match exactly one editable calendar event.',
      );
    }
    return publicApiSuccess(requestId, {
      status: 'completed',
      operation: input.proposal.kind.replace('calendar.propose_', ''),
      message: executed.message,
      changed_events: executed.changed.map(externalEvent),
      calendar: {
        ...input.calendar,
        id: input.calendar.id || `cal_${randomUUID()}`,
        events: executed.events.map(externalEvent),
      },
    });
  }

  const instruction = input.instruction || '';
  if (
    /^(?:帮我)?(?:查询|查看|搜索|列出)|有哪些日程|what.*calendar|list.*events/i.test(instruction)
  ) {
    const matched = searchCalendar(events, instruction);
    return publicApiSuccess(requestId, {
      status: 'completed',
      operation: 'search',
      matched_events: matched.map(externalEvent),
      calendar: { ...input.calendar, events: events.map(externalEvent) },
    });
  }

  try {
    const turn = await withRequestContext(
      {
        userId: principal.userId,
        route: '/api/v1/calendars/commands',
        operationCode: 'public_calendar_command',
        chargeReason: '自然语言日历命令',
      },
      () =>
        decideTeachingTurn(
          {
            question: `${instruction}\n\nCalendar execution context: timezone=${input.calendar.timezone}; local_date=${localDate}. Resolve relative dates and times against this context.`,
            courseId: input.course_id,
            courseName: input.course_name,
            hasSyllabus: events.length > 0,
            progressKnown: false,
            calendarEvents: events,
            recentMessages: [],
            recentPlans: [],
            recentArtifacts: [],
            recentActions: [],
            recentActivities: [],
            problemBank: { available: false, activeCount: 0, samples: [] },
            sourceUploads: [],
            layeredMemorySummary: '',
          },
          { semanticRouter: createRequestSemanticRouter(new NextRequest(request.url)) },
        ),
    );
    const rawAction = [...(turn.proposals || []), ...(turn.directCalls || [])].find((action) =>
      ['calendar.propose_add', 'calendar.propose_update', 'calendar.propose_delete'].includes(
        action.kind,
      ),
    );
    if (!rawAction) {
      const matched = searchCalendar(events, instruction);
      if (/查|找|列出|查看|search|find|list/i.test(instruction)) {
        return publicApiSuccess(requestId, {
          status: 'completed',
          operation: 'search',
          message: turn.replyText || turn.reason,
          matched_events: matched.map(externalEvent),
          calendar: { ...input.calendar, events: events.map(externalEvent) },
        });
      }
      return publicApiError(
        requestId,
        422,
        'invalid_request',
        turn.replyText || turn.reason || 'No calendar operation could be inferred.',
      );
    }

    const action = learnActionToClientAction({
      action: rawAction,
      id: `calact_${randomUUID()}`,
      defaultConfirmation: 'required',
    });
    const proposal = proposalSchema.parse({ ...action, confirmation: 'required' });
    if (!input.confirm) {
      return publicApiSuccess(requestId, {
        status: 'requires_confirmation',
        operation: proposal.kind.replace('calendar.propose_', ''),
        message: turn.replyText || proposal.summary || proposal.label,
        proposal,
        calendar: { ...input.calendar, events: events.map(externalEvent) },
      });
    }

    const executed = executeProposal(events, proposal);
    if (!executed) {
      return publicApiError(
        requestId,
        409,
        'ambiguous_target',
        'The command did not match exactly one editable calendar event.',
      );
    }
    return publicApiSuccess(requestId, {
      status: 'completed',
      operation: proposal.kind.replace('calendar.propose_', ''),
      message: executed.message,
      changed_events: executed.changed.map(externalEvent),
      calendar: {
        ...input.calendar,
        id: input.calendar.id || `cal_${randomUUID()}`,
        events: executed.events.map(externalEvent),
      },
    });
  } catch (error) {
    return publicApiError(
      requestId,
      500,
      'internal_error',
      error instanceof Error ? error.message : 'Calendar command failed.',
    );
  }
}
