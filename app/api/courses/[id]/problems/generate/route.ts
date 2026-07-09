import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';

import {
  notebookProblemImportDraftSchema,
  type NotebookProblemImportDraft,
} from '@/features/problems';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { createCourseProblemsFromDrafts } from '@/features/problems/server/service';

const bodySchema = z.object({
  topic: z.string().trim().min(1).max(200),
  count: z.number().int().min(1).max(8).default(3),
  courseName: z.string().trim().max(200).optional(),
  courseCode: z.string().trim().max(80).optional(),
  sourceSnippets: z.array(z.string().trim().min(1).max(4000)).max(8).default([]),
  commit: z.boolean().default(true),
});

function compactText(value: string, maxLength = 700) {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

function topicSlug(topic: string) {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function isTruthTableTopic(topic: string) {
  return /truth\s*table|truth\s*values?|真值表|命题真值|逻辑等价/i.test(topic);
}

function sourceMeta(args: {
  topic: string;
  sourceSnippets: string[];
  generationRunId: string;
  courseName?: string;
  courseCode?: string;
}) {
  return {
    generatedFromCourse: true,
    generationAgent: 'learn.question_generation',
    generationRunId: args.generationRunId,
    sourceKind: 'course_content',
    topic: args.topic,
    courseName: args.courseName || '',
    courseCode: args.courseCode || '',
    evidenceSnippets: args.sourceSnippets.map((snippet) => compactText(snippet, 500)),
  };
}

function truthTableDrafts(args: {
  topic: string;
  count: number;
  sourceSnippets: string[];
  generationRunId: string;
  courseName?: string;
  courseCode?: string;
}): NotebookProblemImportDraft[] {
  const meta = sourceMeta(args);
  const base = [
    {
      draftId: `generated-${topicSlug(args.topic)}-implication`,
      notebookId: null,
      title: 'Truth table: implication false case',
      type: 'choice',
      status: 'published',
      source: 'chat',
      points: 1,
      tags: ['truth table', 'truth values', 'propositional logic'],
      difficulty: 'easy',
      publicContent: {
        type: 'choice',
        stem: 'For the proposition p -> q, in which row of the truth table is the result false?',
        selectionMode: 'single',
        options: [
          { id: 'A', label: 'p is true and q is false' },
          { id: 'B', label: 'p is false and q is true' },
          { id: 'C', label: 'p is false and q is false' },
          { id: 'D', label: 'p is true and q is true' },
        ],
      },
      grading: {
        type: 'choice',
        correctOptionIds: ['A'],
        analysis:
          'An implication p -> q is false only when the antecedent p is true and the consequent q is false.',
      },
      sourceMeta: meta,
      validationErrors: [],
    },
    {
      draftId: `generated-${topicSlug(args.topic)}-row-count`,
      notebookId: null,
      title: 'Truth table row count',
      type: 'fill_blank',
      status: 'published',
      source: 'chat',
      points: 1,
      tags: ['truth table', 'truth values'],
      difficulty: 'easy',
      publicContent: {
        type: 'fill_blank',
        stemTemplate:
          'A truth table with n propositional variables has {{row_count}} rows. For p, q, r, this gives {{three_variables}} rows.',
        blanks: [
          { id: 'row_count', placeholder: 'formula' },
          { id: 'three_variables', placeholder: 'number' },
        ],
      },
      grading: {
        type: 'fill_blank',
        blanks: [
          {
            id: 'row_count',
            acceptedAnswers: ['2^n', '2^ n', '2 to the n', '2ⁿ'],
            caseSensitive: false,
          },
          { id: 'three_variables', acceptedAnswers: ['8', '8 rows'], caseSensitive: false },
        ],
        analysis:
          'Each propositional variable doubles the number of truth assignments, so n variables give 2^n rows.',
      },
      sourceMeta: meta,
      validationErrors: [],
    },
    {
      draftId: `generated-${topicSlug(args.topic)}-equivalence`,
      notebookId: null,
      title: 'Truth table: compare equivalence',
      type: 'short_answer',
      status: 'published',
      source: 'chat',
      points: 2,
      tags: ['truth table', 'logical equivalence'],
      difficulty: 'medium',
      publicContent: {
        type: 'short_answer',
        stem: 'Use a truth table to decide whether ¬(p ∨ q) and (¬p ∧ ¬q) are logically equivalent. State the final truth-value columns you compare.',
      },
      grading: {
        type: 'short_answer',
        referenceAnswer:
          'They are logically equivalent. The final columns for ¬(p ∨ q) and (¬p ∧ ¬q) match in every row: both are true only when p and q are both false, and false otherwise.',
        rubric:
          'Full credit requires listing or correctly reasoning through all rows, computing both final columns, and concluding equivalence because the columns match row by row.',
      },
      sourceMeta: meta,
      validationErrors: [],
    },
  ];
  return base.slice(0, args.count).map((draft) => notebookProblemImportDraftSchema.parse(draft));
}

function genericDrafts(args: {
  topic: string;
  count: number;
  sourceSnippets: string[];
  generationRunId: string;
  courseName?: string;
  courseCode?: string;
}): NotebookProblemImportDraft[] {
  const meta = sourceMeta(args);
  const context = args.sourceSnippets.length
    ? `\n\nCourse evidence:\n${args.sourceSnippets.map((snippet, index) => `${index + 1}. ${compactText(snippet)}`).join('\n')}`
    : '';
  return Array.from({ length: args.count }, (_, index) =>
    notebookProblemImportDraftSchema.parse({
      draftId: `generated-${topicSlug(args.topic)}-${index + 1}`,
      notebookId: null,
      title: `${args.topic} generated practice ${index + 1}`,
      type: 'short_answer',
      status: 'published',
      source: 'chat',
      points: 1,
      tags: [args.topic, 'AI生成练习'].filter(Boolean).slice(0, 16),
      difficulty: index === 0 ? 'easy' : index === args.count - 1 ? 'hard' : 'medium',
      publicContent: {
        type: 'short_answer',
        stem: `Answer a targeted practice question about ${args.topic}. Explain the key definition, operation, or reasoning step that applies.${context}`,
      },
      grading: {
        type: 'short_answer',
        rubric:
          'Full credit requires a correct statement of the relevant concept, a concrete application to the prompt, and a clear final conclusion.',
      },
      sourceMeta: meta,
      validationErrors: [],
    }),
  );
}

function buildDrafts(
  args: z.infer<typeof bodySchema>,
  generationRunId: string,
): NotebookProblemImportDraft[] {
  const draftArgs = { ...args, generationRunId };
  if (isTruthTableTopic(args.topic)) return truthTableDrafts(draftArgs);
  return genericDrafts(draftArgs);
}

function toClientProblem(
  problem: Awaited<ReturnType<typeof createCourseProblemsFromDrafts>>[number],
) {
  return {
    id: problem.id,
    courseId: problem.courseId ?? null,
    notebookId: problem.notebookId,
    notebookName: problem.notebookName,
    title: problem.title,
    type: problem.type,
    status: problem.status,
    source: problem.source,
    order: problem.order,
    problemNumber: problem.problemNumber ?? null,
    points: problem.points,
    tags: problem.tags,
    difficulty: problem.difficulty,
    publicContent: problem.publicContent,
    grading: problem.grading,
    sourceMeta: problem.sourceMeta,
    createdAt: problem.createdAt,
    updatedAt: problem.updatedAt,
    latestAttempt: problem.latestAttempt ?? null,
  };
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { id } = await context.params;

    const payload = bodySchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: payload.error.flatten() },
        { status: 400 },
      );
    }

    const generationRunId = randomUUID();
    const drafts = buildDrafts(payload.data, generationRunId);
    if (!payload.data.commit) {
      return NextResponse.json({
        generatedCount: drafts.length,
        committed: false,
        drafts,
        generation: {
          agent: 'learn.question_generation',
          mode: 'deterministic_course_grounded',
          topic: payload.data.topic,
          runId: generationRunId,
        },
      });
    }

    const problems = await createCourseProblemsFromDrafts({
      userId: auth.userId,
      courseId: id,
      drafts,
    });
    const generatedProblems = problems.filter((problem) => {
      const meta = problem.sourceMeta;
      return (
        meta &&
        typeof meta === 'object' &&
        !Array.isArray(meta) &&
        (meta as Record<string, unknown>).generationRunId === generationRunId
      );
    });
    return NextResponse.json(
      {
        generatedCount: drafts.length,
        committed: true,
        drafts,
        problems: generatedProblems.map(toClientProblem),
        generation: {
          agent: 'learn.question_generation',
          mode: 'deterministic_course_grounded',
          topic: payload.data.topic,
          runId: generationRunId,
        },
      },
      { status: 201 },
    );
  });
}
