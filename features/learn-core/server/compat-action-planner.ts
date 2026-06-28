import { z } from 'zod';

import { learnTurnMessageSchema } from './schemas';

export const compatActionPlannerRequestSchema = z.object({
  question: z.string().trim().min(1).max(4000),
  recentMessages: z.array(learnTurnMessageSchema).max(10).default([]),
  courseId: z.string().trim().max(200).optional(),
  courseName: z.string().trim().max(200).optional(),
  courseCode: z.string().trim().max(80).optional(),
  learnerSnapshot: z.unknown().optional(),
  calendarEvents: z.array(z.record(z.string(), z.unknown())).max(80).default([]),
  recentPlans: z.array(z.record(z.string(), z.unknown())).max(8).default([]),
  recentArtifacts: z.array(z.record(z.string(), z.unknown())).max(16).default([]),
  recentActions: z.array(z.record(z.string(), z.unknown())).max(8).default([]),
  recentActivities: z.array(z.record(z.string(), z.unknown())).max(8).default([]),
  layeredMemorySummary: z.string().trim().max(3000).optional().default(''),
});

export function compatActionPlannerInputToLearnTurnInput(
  input: z.infer<typeof compatActionPlannerRequestSchema>,
) {
  const learnerSnapshot =
    input.learnerSnapshot && typeof input.learnerSnapshot === 'object'
      ? (input.learnerSnapshot as Record<string, unknown>)
      : null;
  return {
    question: input.question,
    recentMessages: input.recentMessages,
    courseId: input.courseId,
    courseName: input.courseName,
    courseCode: input.courseCode,
    hasSyllabus: input.calendarEvents.length > 0,
    progressKnown: learnerSnapshot?.progressKnown === true,
    learnerSnapshot: input.learnerSnapshot,
    calendarEvents: input.calendarEvents,
    recentPlans: input.recentPlans,
    recentArtifacts: input.recentArtifacts,
    recentActions: input.recentActions,
    recentActivities: input.recentActivities,
    problemBank: { available: false, activeCount: 0, samples: [] },
    sourceUploads: [],
    layeredMemorySummary: input.layeredMemorySummary,
  };
}
