import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';
import { routeLayeredMemoryWriteCandidates } from '@/features/memory/server/write-routing';

const triggerSchema = z.enum([
  'explicit_user',
  'fact_correction',
  'chat_turn_end',
  'problem_attempt',
  'source_import',
  'periodic_summary',
  'manual',
  'agent_tool',
]);

const contentTypeSchema = z.enum([
  'current_fact',
  'preference',
  'profile',
  'course_requirement',
  'notebook_requirement',
  'learning_pattern',
  'weakness',
  'conversation_summary',
  'source_original',
  'problem_original',
  'problem_attempt',
  'other',
]);

const targetTypeSchema = z.enum(['platform', 'course', 'notebook']);
const privacySchema = z.enum(['public', 'private']);
const factScopeSchema = z.enum(['user', 'course', 'notebook', 'conversation']);

const factCandidateSchema = z
  .object({
    namespace: z.string().trim().min(1).max(80).optional().nullable(),
    key: z.string().trim().min(1).max(120).optional().nullable(),
    valueJson: z.unknown().optional(),
    confidence: z.number().min(0).max(1).optional().nullable(),
  })
  .passthrough();

const studyMemoryCandidateSchema = z.object({
  targetType: targetTypeSchema.optional().nullable(),
  targetId: z.string().trim().min(1).optional().nullable(),
  scope: privacySchema.optional().nullable(),
  kind: z.string().trim().min(1).max(40).optional().nullable(),
  title: z.string().trim().min(1).max(120).optional().nullable(),
  text: z.string().trim().min(1).max(12000).optional().nullable(),
  reason: z.string().trim().max(1000).optional().nullable(),
  question: z.string().trim().max(1000).optional().nullable(),
  sourceReferences: z.unknown().optional(),
});

const memoryWriteCandidateSchema = z.object({
  id: z.string().trim().min(1).max(120).optional().nullable(),
  trigger: triggerSchema.default('agent_tool'),
  contentType: contentTypeSchema,
  targetType: targetTypeSchema.optional().nullable(),
  targetId: z.string().trim().min(1).optional().nullable(),
  conversationId: z.string().trim().min(1).optional().nullable(),
  title: z.string().trim().min(1).max(120).optional().nullable(),
  text: z.string().trim().min(1).max(12000).optional().nullable(),
  privacy: privacySchema.optional().nullable(),
  scopeType: factScopeSchema.optional().nullable(),
  scopeId: z.string().trim().min(1).optional().nullable(),
  source: z.string().trim().min(1).max(80).optional().nullable(),
  sourceRef: z.unknown().optional(),
  fact: factCandidateSchema.optional().nullable(),
  studyMemory: studyMemoryCandidateSchema.optional().nullable(),
});

const memoryWriteRequestSchema = z
  .object({
    dryRun: z.boolean().optional(),
    candidate: memoryWriteCandidateSchema.optional(),
    candidates: z.array(memoryWriteCandidateSchema).min(1).max(20).optional(),
  })
  .refine((value) => Boolean(value.candidate || value.candidates?.length), {
    message: 'candidate or candidates is required',
  });

export async function POST(request: Request) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;

    const prisma = getOptionalPrisma();
    if (!prisma) {
      return NextResponse.json({ error: 'Database is not configured' }, { status: 503 });
    }

    const payload = memoryWriteRequestSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: payload.error.flatten() },
        { status: 400 },
      );
    }

    const candidates =
      payload.data.candidates || (payload.data.candidate ? [payload.data.candidate] : []);
    const results = await routeLayeredMemoryWriteCandidates({
      prisma,
      userId: auth.userId,
      candidates,
      dryRun: payload.data.dryRun,
    });

    return NextResponse.json({
      storage: 'database',
      dryRun: Boolean(payload.data.dryRun),
      results,
      counts: {
        total: results.length,
        executed: results.filter((result) => result.executed).length,
        needsConfirmation: results.filter((result) => result.action === 'needs_confirmation')
          .length,
        skipped: results.filter((result) => !result.executed).length,
      },
    });
  });
}
