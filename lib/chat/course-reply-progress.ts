import type { PublicReplyProgressStep } from '@/lib/types/chat';

export const COURSE_REPLY_PROGRESS_EVENT = 'synatra-course-reply-progress';

export type CourseReplyProgressPhase =
  | 'queued'
  | 'director'
  | 'agent_loading'
  | 'agent_started'
  | 'streaming'
  | 'completed'
  | 'failed';

export interface CourseReplyProgressEventDetail {
  messageId?: string;
  phase: CourseReplyProgressPhase;
  title?: string;
  line: string;
  agentName?: string;
  steps: PublicReplyProgressStep[];
  updatedAt: number;
}

const STEP_DEFS = [
  {
    id: 'context',
    label: '读取课程上下文',
    description: '找当前课程、页面和相关笔记线索。',
  },
  {
    id: 'route',
    label: '选择回答路径',
    description: '判断直接回答，还是交给更合适的课程成员。',
  },
  {
    id: 'compose',
    label: '组织讲解顺序',
    description: '把概念、步骤和易错点排成可读的回答。',
  },
  {
    id: 'answer',
    label: '输出课程回复',
    description: '开始把整理好的讲解发出来。',
  },
] as const;

const ACTIVE_STEP_BY_PHASE: Record<CourseReplyProgressPhase, (typeof STEP_DEFS)[number]['id']> = {
  queued: 'context',
  director: 'route',
  agent_loading: 'compose',
  agent_started: 'compose',
  streaming: 'answer',
  completed: 'answer',
  failed: 'answer',
};

export function buildCourseReplyProgress(args: {
  phase: CourseReplyProgressPhase;
  agentName?: string | null;
  messageId?: string | null;
}): CourseReplyProgressEventDetail {
  const agentName = args.agentName?.trim() || undefined;
  const activeStepId = ACTIVE_STEP_BY_PHASE[args.phase];
  const activeIndex = STEP_DEFS.findIndex((step) => step.id === activeStepId);
  const isComplete = args.phase === 'completed';
  const isFailed = args.phase === 'failed';

  return {
    messageId: args.messageId || undefined,
    phase: args.phase,
    agentName,
    line: progressLine(args.phase, agentName),
    steps: STEP_DEFS.map((step, index): PublicReplyProgressStep => {
      const status =
        isComplete || (isFailed && index < activeIndex)
          ? 'complete'
          : index < activeIndex
            ? 'complete'
            : index === activeIndex
              ? 'active'
              : 'pending';
      return { ...step, status };
    }),
    updatedAt: Date.now(),
  };
}

export function dispatchCourseReplyProgress(detail: CourseReplyProgressEventDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<CourseReplyProgressEventDetail>(COURSE_REPLY_PROGRESS_EVENT, {
      detail,
    }),
  );
}

function progressLine(phase: CourseReplyProgressPhase, agentName?: string) {
  const name = agentName || '课程老师';
  if (phase === 'queued') return '我先看一下课程上下文。';
  if (phase === 'director') return '我在判断这题该走哪条回答路径。';
  if (phase === 'agent_loading') return `${name} 正在接手这个问题。`;
  if (phase === 'agent_started') return `${name} 正在组织讲解顺序。`;
  if (phase === 'streaming') return `${name} 已经开始输出回答。`;
  if (phase === 'completed') return '这轮课程回复已经准备好。';
  return '这轮课程回复中断了，我会把错误显示出来。';
}
