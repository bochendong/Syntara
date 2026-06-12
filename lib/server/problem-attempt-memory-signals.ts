import type { PrismaClient } from '@/lib/server/generated-prisma';
import type {
  NotebookProblemAttemptRecord,
  NotebookProblemRecord,
} from '@/lib/problem-bank/schema';
import { routeMemoryWriteCandidate } from '@/lib/server/memory-write-router';

const MEMORY_SIGNAL_MIN_NON_PASSING_ATTEMPTS = 2;

type ProblemAttemptMemorySignalArgs = {
  prisma: PrismaClient;
  userId: string;
  notebookId: string;
  problem: NotebookProblemRecord;
  attempt: NotebookProblemAttemptRecord;
  recentAttempts: NotebookProblemAttemptRecord[];
};

function isNonPassingAttempt(attempt: NotebookProblemAttemptRecord) {
  return attempt.status === 'failed' || attempt.status === 'partial' || attempt.status === 'error';
}

function compact(value: string | null | undefined, maxChars: number) {
  const text = value?.replace(/\s+/g, ' ').trim() || '';
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}

function problemStem(problem: NotebookProblemRecord) {
  const publicContent = problem.publicContent;
  if ('stem' in publicContent) return publicContent.stem;
  if ('stemTemplate' in publicContent) return publicContent.stemTemplate;
  return problem.title;
}

function latestFeedback(attempt: NotebookProblemAttemptRecord) {
  return compact(
    [attempt.result?.feedback, attempt.result?.analysis]
      .map((item) => item?.trim())
      .filter(Boolean)
      .join(' '),
    600,
  );
}

function buildWeaknessMemoryText(args: {
  problem: NotebookProblemRecord;
  attempt: NotebookProblemAttemptRecord;
  nonPassingAttempts: NotebookProblemAttemptRecord[];
}) {
  const { problem, attempt, nonPassingAttempts } = args;
  const tags = problem.tags.length > 0 ? problem.tags.join('、') : '暂无标签';
  const feedback = latestFeedback(attempt) || '本次作答未完全通过，暂无更细评分反馈。';
  const stem = compact(problemStem(problem), 900);
  return [
    `系统根据做题记录推断：学生在「${problem.title}」上已经出现 ${nonPassingAttempts.length} 次未完全通过，不是学生自述。`,
    '',
    `题目类型：${problem.type}；难度：${problem.difficulty}；标签：${tags}。`,
    `最近结果：${attempt.status}${attempt.score != null ? `，得分 ${attempt.score}/${problem.points}` : ''}。`,
    `最近反馈：${feedback}`,
    '',
    `题目原文：${stem}`,
    '',
    '后续聊天或复习中，如果问题涉及这些标签/知识点，应优先检查解题步骤、变量/边界/条件处理和评分反馈，而不是假设学生只是粗心。',
  ].join('\n');
}

export async function maybeWriteProblemAttemptMemorySignal(
  args: ProblemAttemptMemorySignalArgs,
): Promise<void> {
  if (!isNonPassingAttempt(args.attempt)) return;

  const nonPassingAttempts = args.recentAttempts.filter(isNonPassingAttempt);
  if (nonPassingAttempts.length !== MEMORY_SIGNAL_MIN_NON_PASSING_ATTEMPTS) return;
  const latestTwo = nonPassingAttempts.slice(0, MEMORY_SIGNAL_MIN_NON_PASSING_ATTEMPTS);
  if (!latestTwo.some((attempt) => attempt.id === args.attempt.id)) return;

  const text = buildWeaknessMemoryText({
    problem: args.problem,
    attempt: args.attempt,
    nonPassingAttempts,
  });

  await routeMemoryWriteCandidate({
    prisma: args.prisma,
    userId: args.userId,
    candidate: {
      id: `problem-attempt-weakness:${args.problem.id}:${args.attempt.id}`,
      trigger: 'problem_attempt',
      contentType: 'weakness',
      targetType: 'notebook',
      targetId: args.notebookId,
      privacy: 'private',
      source: 'problem_attempt_inference',
      title: `做题记录观察：${args.problem.title}`,
      text,
      studyMemory: {
        targetType: 'notebook',
        targetId: args.notebookId,
        scope: 'private',
        kind: 'problem_attempt_signal',
        title: `做题记录观察：${args.problem.title}`,
        text,
        reason: '同一道题多次未完全通过，系统根据行为证据推断出可复用的学习信号。',
        sourceReferences: {
          sourceType: 'problem_attempt',
          problemId: args.problem.id,
          problemTitle: args.problem.title,
          notebookId: args.notebookId,
          attemptIds: latestTwo.map((attempt) => attempt.id),
          latestAttemptStatus: args.attempt.status,
          tags: args.problem.tags,
        },
      },
    },
  });
}
