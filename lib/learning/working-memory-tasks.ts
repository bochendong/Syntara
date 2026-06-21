'use client';

import {
  updateNotebookWorkingMemory,
  type NotebookWorkingMemory,
} from '@/lib/learning/study-memory';
import { addMemoryActivity, updateMemoryActivity } from '@/lib/store/memory-activity';
import type { NotebookProblemAttemptRecord } from '@/lib/problem-bank';
import type { NotebookProblemClientRecord } from '@/lib/utils/notebook-problem-api';
import type { NotebookPlanResult } from '@/lib/notebook/send-message';

function compact(value: string | null | undefined, maxChars: number) {
  const text = value?.replace(/\s+/g, ' ').trim() || '';
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}

function feedbackFromAttempt(attempt: NotebookProblemAttemptRecord) {
  return compact(
    [attempt.result?.feedback, attempt.result?.analysis]
      .map((item) => item?.trim())
      .filter(Boolean)
      .join(' '),
    600,
  );
}

function activityDoneDescription(memory: NotebookWorkingMemory) {
  return compact(
    [memory.currentTask, memory.masteredSignal, memory.stuckPoint, memory.nextTeachingMove]
      .filter(Boolean)
      .join(' · ') || memory.summary,
    120,
  );
}

function queueWorkingMemoryWrite(args: {
  stageId: string;
  activityDescription: string;
  buildMemory: () => Omit<NotebookWorkingMemory, 'updatedAt'>;
}) {
  const activityId = addMemoryActivity({
    title: '正在更新短期记忆',
    description: args.activityDescription,
    status: 'writing_study_memory',
    layer: 'study_memory',
    chips: ['短期', '笔记本', '后台'],
  });

  window.setTimeout(() => {
    try {
      const { memory } = updateNotebookWorkingMemory({
        stageId: args.stageId,
        memory: args.buildMemory(),
      });
      updateMemoryActivity(activityId, {
        title: '短期记忆已更新',
        description: activityDoneDescription(memory),
        status: 'completed',
        layer: 'study_memory',
        chips: ['短期', '已覆盖', memory.source === 'problem_attempt' ? '做题' : '聊天'],
      });
    } catch (error) {
      updateMemoryActivity(activityId, {
        title: '短期记忆没有更新',
        description: error instanceof Error ? error.message : String(error),
        status: 'failed',
        layer: 'study_memory',
        chips: ['短期', '失败'],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, 0);
}

function includesAny(text: string, needles: string[]) {
  return needles.some((needle) => text.includes(needle));
}

function firstMatch(input: string, regex: RegExp) {
  const match = input.match(regex);
  return match?.[1]?.trim();
}

function lastMatch(input: string, regex: RegExp) {
  const matches = Array.from(input.matchAll(regex));
  return matches.at(-1)?.[1]?.trim();
}

function compactTopicText(input: string) {
  const text = input
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/;;.*$/gm, ' ')
    .replace(/\(@problem\s+\d+\)/gi, ' ')
    .replace(/\(@(?:htdf|signature|template-origin)[^)]+\)/gi, ' ')
    .replace(/\(check-expect[\s\S]*?\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return compact(text, 120);
}

function isConfusionQuestion(input: string) {
  return /(不会|不懂|没懂|看不懂|咋|怎么|为什么|哪里错|哪里不对|区别|讲一下|解释|求|证明|改成|如何|what|why|how|\?|\？)/i.test(
    input,
  );
}

function hasStudentAttempt(input: string) {
  return /(\(define|\(local|\(lambda|check-expect|我的|我写|我觉得|这样写|attempt|try|solution|答案|解法)/i.test(
    input,
  );
}

function topicFromQuestion(args: {
  question: string;
  references?: NotebookPlanResult['references'];
  prerequisiteHints?: string[];
}) {
  const referenceTitle = args.references?.find((reference) => reference.title?.trim())?.title;
  if (referenceTitle) return compact(referenceTitle, 80);
  const prerequisite = args.prerequisiteHints?.find((hint) => hint.trim());
  if (prerequisite) return compact(prerequisite, 80);
  const compacted = compactTopicText(args.question);
  return compacted || '当前知识点';
}

function deriveProgrammingTopic(args: { question: string; answer: string }) {
  const question = args.question;
  const answer = args.answer;
  const haystack = `${question}\n${answer}`.toLowerCase();
  const answerFunctionName = firstMatch(answer, /\(define\s+\(([^\s)]+)/i);
  const questionFunctionName =
    lastMatch(question, /\(@htdf\s+([^)]+)\)/gi) || lastMatch(question, /\(define\s+\(([^\s)]+)/gi);
  const problemNumber = lastMatch(question, /\(@problem\s+(\d+)\)/gi);
  const isCodeQuestion = /@\w+|\(define|\(local|\(lambda|check-expect|tail recursive/i.test(
    haystack,
  );
  if (!isCodeQuestion) return null;

  const isSearchProblem = includesAny(haystack, [
    'search',
    'generated graph',
    'graph',
    'worklist',
    'todo',
    'visited',
    'airport',
    'route',
  ]);
  const isTailRecursionProblem = includesAny(haystack, [
    'tail recursive',
    'tail-recursive',
    'tail recursion',
    'tail-recursion',
    '尾递归',
    'accumulator',
    '累加器',
  ]);
  const isRacketProblem = /@\w+|\(define|\(local|\(lambda|check-expect/.test(haystack);
  const functionName =
    isTailRecursionProblem && answerFunctionName
      ? answerFunctionName
      : questionFunctionName || answerFunctionName;

  if (isSearchProblem && isTailRecursionProblem) {
    return {
      label: [
        problemNumber ? `Problem ${problemNumber}` : '',
        functionName ? `${functionName}` : 'search',
      ]
        .filter(Boolean)
        .join(' / '),
      currentTask: functionName
        ? `把 ${functionName} 的图搜索解法改写成 tail-recursive worklist + accumulator`
        : '把非尾递归图搜索改写成 tail-recursive worklist + accumulator',
      masteredSignal:
        '学生已经能给出非尾递归 search 解法的基本 helper 分工，并知道需要用 visited 防止重复搜索。',
      stuckPoint:
        '学生卡在 search + tail recursion：不知道如何把“递归回来后再组合结果”改成在 accumulator 中携带累计状态。',
      nextTeachingMove:
        '下一轮先检查 todo、累计值、visited 三个 accumulator 的不变量，再用一条边手算 worklist 如何更新。',
    };
  }

  if (isTailRecursionProblem) {
    return {
      label: functionName || (problemNumber ? `Problem ${problemNumber}` : 'tail recursion'),
      currentTask: functionName
        ? `理解并改写 ${functionName} 的 tail-recursive accumulator 解法`
        : '理解 tail-recursive accumulator 解法',
      masteredSignal: hasStudentAttempt(question)
        ? '学生能带着已有代码或具体题面来问，说明已经能定位到递归结构本身。'
        : '学生已经能把问题定位到 tail recursion / accumulator 这一类递归结构。',
      stuckPoint: '学生需要把“递归调用后还要做事”的位置，改写成递归前更新 accumulator。',
      nextTeachingMove:
        '下一轮先指出递归调用是否在 tail position，再让学生写出 accumulator 表示什么。',
    };
  }

  if (isSearchProblem) {
    return {
      label: functionName || (problemNumber ? `Problem ${problemNumber}` : 'search'),
      currentTask: functionName
        ? `理解 ${functionName} 的搜索问题解法`
        : '理解 generated graph / worklist 搜索题',
      masteredSignal: hasStudentAttempt(question)
        ? '学生能带着已有尝试讨论搜索题，说明对问题对象和目标已有初步定位。'
        : '学生已经能把问题定位到 search / generated graph 这类结构。',
      stuckPoint: '学生在搜索题中需要澄清状态、visited 和终止条件如何配合。',
      nextTeachingMove: '下一轮先画出当前节点、候选列表和 visited 的变化，再让学生补一个分支。',
    };
  }

  if (isRacketProblem) {
    return {
      label: functionName || (problemNumber ? `Problem ${problemNumber}` : 'Racket design'),
      currentTask: functionName
        ? `理解 ${functionName} 这道函数设计题`
        : `理解 ${compactTopicText(question) || '当前函数设计题'}`,
      masteredSignal: hasStudentAttempt(question)
        ? '学生能提供题面、签名、测试或已有代码，说明函数设计流程已有基础。'
        : '学生已经能把问题定位到具体函数设计任务。',
      stuckPoint: '学生正在请求代码设计题的解法拆解，需要继续用模板和递归结构讲清楚。',
      nextTeachingMove: '下一轮先对齐数据定义和模板，再让学生解释每个 helper 的职责。',
    };
  }

  return null;
}

function deriveChatWorkingMemory(args: {
  question: string;
  answer: string;
  knowledgeGap: boolean;
  references?: NotebookPlanResult['references'];
  prerequisiteHints?: string[];
}): Pick<
  NotebookWorkingMemory,
  'summary' | 'currentTask' | 'stuckPoint' | 'masteredSignal' | 'nextTeachingMove'
> {
  const programmingTopic = deriveProgrammingTopic({
    question: args.question,
    answer: args.answer,
  });
  if (programmingTopic) {
    return {
      summary: [
        `掌握较好：${programmingTopic.masteredSignal}`,
        `掌握不稳：${programmingTopic.stuckPoint}`,
      ].join('\n'),
      currentTask: programmingTopic.currentTask,
      masteredSignal: programmingTopic.masteredSignal,
      stuckPoint: programmingTopic.stuckPoint,
      nextTeachingMove: programmingTopic.nextTeachingMove,
    };
  }

  const topic = topicFromQuestion({
    question: args.question,
    references: args.references,
    prerequisiteHints: args.prerequisiteHints,
  });
  const confusion = args.knowledgeGap || isConfusionQuestion(args.question);
  const masteredSignal = hasStudentAttempt(args.question)
    ? `学生能围绕「${topic}」给出已有尝试或具体上下文，说明已经能定位问题对象。`
    : `学生能把问题聚焦到「${topic}」，说明对当前学习主题已有基本定位。`;
  const stuckPoint = confusion
    ? `学生对「${topic}」的关键概念、条件或解题步骤还不稳，需要下一轮继续诊断。`
    : `学生对「${topic}」的迁移应用还需要通过小题确认。`;
  const nextTeachingMove = confusion
    ? `下一轮先用一个更小的检查问题确认「${topic}」的薄弱环节，再继续讲解。`
    : `下一轮给一个同知识点的迁移问题，确认学生不是只理解了当前表述。`;
  return {
    summary: [`掌握较好：${masteredSignal}`, `掌握不稳：${stuckPoint}`].join('\n'),
    currentTask: `围绕「${topic}」继续判断掌握情况`,
    masteredSignal,
    stuckPoint,
    nextTeachingMove,
  };
}

export function queueChatTurnWorkingMemoryUpdate(args: {
  notebookId: string;
  notebookName?: string | null;
  question: string;
  plan: NotebookPlanResult;
}) {
  const question = compact(args.question, 320);
  if (!question) return;
  const derived = deriveChatWorkingMemory({
    question: args.question,
    answer: args.plan.answer,
    knowledgeGap: args.plan.knowledgeGap,
    references: args.plan.references,
    prerequisiteHints: args.plan.prerequisiteHints,
  });

  queueWorkingMemoryWrite({
    stageId: args.notebookId,
    activityDescription: '回答已展示，后台整理下一轮教学状态',
    buildMemory: () => ({
      source: 'chat_turn',
      title: '短期学习状态',
      summary: derived.summary,
      currentTask: derived.currentTask,
      masteredSignal: derived.masteredSignal,
      stuckPoint: derived.stuckPoint,
      nextTeachingMove: derived.nextTeachingMove,
      evidence: [
        {
          type: 'student_message',
          label: '学生问题',
          text: question,
        },
        {
          type: 'assistant_reply',
          label: '本轮回复',
          text: compact(args.plan.answer, 600),
        },
      ],
    }),
  });
}

export function queueProblemAttemptWorkingMemoryUpdate(args: {
  notebookId: string;
  notebookName?: string | null;
  problem: Pick<NotebookProblemClientRecord, 'id' | 'title' | 'type' | 'tags' | 'points'>;
  attempt: NotebookProblemAttemptRecord;
}) {
  const passed = args.attempt.status === 'passed';
  const feedback = feedbackFromAttempt(args.attempt);
  const scoreText =
    args.attempt.score != null ? `，得分 ${args.attempt.score}/${args.problem.points}` : '';

  queueWorkingMemoryWrite({
    stageId: args.notebookId,
    activityDescription: passed
      ? '判题结果已展示，后台记录当前掌握信号'
      : '判题结果已展示，后台记录下一步复盘重点',
    buildMemory: () => ({
      source: 'problem_attempt',
      title: '短期学习状态',
      summary: [
        `学生刚完成题目「${args.problem.title}」，结果：${args.attempt.status}${scoreText}。`,
        feedback ? `反馈：${feedback}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      currentTask: args.problem.title,
      stuckPoint: passed
        ? undefined
        : feedback || `题目「${args.problem.title}」尚未完全通过，需要下一轮复盘。`,
      masteredSignal: passed ? `题目「${args.problem.title}」已通过。` : undefined,
      nextTeachingMove: passed
        ? '下一轮可以给同知识点的迁移题，确认不是只记住了这一题。'
        : '下一轮先根据反馈定位错误步骤，再用一个更小的相似题检查修复情况。',
      recentAttempt: {
        problemId: args.problem.id,
        problemTitle: args.problem.title,
        status: args.attempt.status,
        score: args.attempt.score,
        feedback: feedback || undefined,
      },
      evidence: [
        {
          type: 'problem_attempt',
          label: '做题结果',
          text: `状态：${args.attempt.status}${scoreText}${feedback ? `；反馈：${feedback}` : ''}`,
        },
      ],
    }),
  });
}
