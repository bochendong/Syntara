import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { prisma } from '@/lib/server/prisma';
import {
  createNotebookProblemAttempt,
  listCourseProblemsForUser,
} from '@/features/problems/server/service';
import { routeLayeredMemoryWriteCandidates } from '@/features/memory/server/write-routing';
import type { MemoryWriteCandidate } from '@/lib/server/memory-write-router';

const requestSchema = z.object({
  courseId: z.string().trim().min(1).max(200),
  topic: z.string().trim().min(1).max(1000),
  resultKey: z.string().trim().min(1).max(200),
  practiceHistory: z.string().trim().max(12000).optional(),
  memory: z.string().trim().max(16000).optional(),
});

function topicTokens(topic: string): string[] {
  return Array.from(
    new Set(
      topic
        .normalize('NFKC')
        .toLowerCase()
        .split(/[^a-z0-9_+\-\u3400-\u9fff]+/)
        .map((item) => item.trim())
        .filter((item) => item.length >= 2),
    ),
  ).slice(0, 12);
}

export async function POST(request: Request) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;

    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid platform test fixture request', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const input = parsed.data;
    const problems = await listCourseProblemsForUser(auth.userId, input.courseId);
    const tokens = topicTokens(input.topic);
    const ranked = problems
      .filter((problem) => problem.status !== 'archived')
      .map((problem) => {
        const haystack = [problem.title, ...problem.tags].join(' ').toLowerCase();
        return {
          problem,
          score: tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0),
        };
      })
      .sort((a, b) => b.score - a.score || a.problem.title.localeCompare(b.problem.title));

    const createdAttempts = [];
    if (input.practiceHistory) {
      const statuses = ['failed', 'partial', 'passed'] as const;
      for (const [index, item] of ranked.slice(0, 3).entries()) {
        const status = statuses[index] || 'failed';
        const attempt = await createNotebookProblemAttempt({
          userId: auth.userId,
          problemId: item.problem.id,
          kind: 'answer',
          status,
          score: status === 'failed' ? 0.25 : status === 'partial' ? 0.55 : 1,
          answer: {
            text: `[平台测试模拟作答]\n${input.practiceHistory.slice(0, 4000)}`,
          },
          result: {
            correct: status === 'passed',
            publicCases: [],
            feedback: [
              '这是一条由平台测试输入层创建的模拟刷题记录。',
              input.practiceHistory.slice(0, 6000),
            ].join('\n'),
          },
        });
        createdAttempts.push(attempt);
      }
    }

    const candidates: MemoryWriteCandidate[] = [];
    const baseCandidate = {
      trigger: 'chat_turn_end' as const,
      targetType: 'course' as const,
      targetId: input.courseId,
      privacy: 'private' as const,
      source: 'platform-test-fixture',
    };
    if (input.memory) {
      candidates.push({
        ...baseCandidate,
        id: `${input.resultKey}:memory`,
        contentType: 'learning_pattern',
        title: `[平台测试] 学习记忆 · ${input.topic}`,
        text: input.memory,
        studyMemory: {
          targetType: 'course',
          targetId: input.courseId,
          scope: 'private',
          kind: 'reflection',
          title: `[平台测试] 学习记忆 · ${input.topic}`,
          text: input.memory,
          reason: '用于验证生产复习计划能否读取掌握、薄弱点、原因和下一步教学动作。',
          sourceReferences: { resultKey: input.resultKey, fixture: true },
        },
      });
    }

    const memoryResults = candidates.length
      ? await routeLayeredMemoryWriteCandidates({
          prisma,
          userId: auth.userId,
          candidates,
        })
      : [];

    return NextResponse.json({
      fixture: {
        resultKey: input.resultKey,
        courseId: input.courseId,
        attemptedProblemIds: createdAttempts.map((attempt) => attempt.problemId),
        attemptCount: createdAttempts.length,
        memoryIds: memoryResults.flatMap((result) => (result.memory ? [result.memory.id] : [])),
        memoryCount: memoryResults.filter((result) => result.executed && result.memory).length,
        availableProblemCount: problems.length,
      },
    });
  });
}
