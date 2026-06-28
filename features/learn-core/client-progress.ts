import type { LearnClientPlanningIntent } from './client-adapters';

export type LearnProgressWriteMode = 'progress' | 'planning_scope';

export type LearnPendingCourseAction =
  | {
      kind: 'practice_plan';
      mode: 'practice' | 'quiz';
      prompt: string;
    }
  | {
      kind: 'review_plan';
      prompt: string;
    }
  | {
      kind: 'preview_plan';
      prompt: string;
    };

export type LearnProgressProposal = {
  selection: string;
  label: string;
  reason: string;
  confirmed?: boolean;
  title?: string;
  confirmLabel?: string;
  writeMode?: LearnProgressWriteMode;
};

export function learnPendingActionFromPlanningIntent(
  intent: LearnClientPlanningIntent,
  prompt: string,
): LearnPendingCourseAction {
  if (intent.kind === 'practice_plan') {
    return { kind: 'practice_plan', mode: intent.mode, prompt };
  }
  if (intent.kind === 'preview_plan') {
    return { kind: 'preview_plan', prompt };
  }
  return { kind: 'review_plan', prompt };
}

export function learnProgressWriteMode(args: {
  intent?: LearnClientPlanningIntent | null;
  progressKnown: boolean;
  hasDetectedProgress: boolean;
}): LearnProgressWriteMode {
  return args.intent && args.progressKnown && !args.hasDetectedProgress
    ? 'planning_scope'
    : 'progress';
}

export function learnProgressRequestTitle(args: {
  intent?: LearnClientPlanningIntent | null;
  writeMode: LearnProgressWriteMode;
}): string {
  if (args.writeMode === 'progress') return '确认学习进度';
  if (args.intent?.kind === 'preview_plan') return '确认预习范围';
  if (args.intent?.kind === 'review_plan') return '确认复习范围';
  return '确认题目范围';
}

export function learnProgressRequestText(args: {
  intent?: LearnClientPlanningIntent | null;
  hasDetectedProgress: boolean;
  progressKnown: boolean;
}): string {
  if (args.intent?.kind === 'review_plan') {
    if (args.hasDetectedProgress) {
      return '好的，我捕捉到了你这次复习范围的线索。先确认一下，确认后我再安排复习计划。';
    }
    return args.progressKnown
      ? '好的。先选这次复习要覆盖到哪里；它可以等于当前学习进度，也可以换成更早或更后的范围。'
      : '好的，但是我还不知道你的学习进度。先选择这次复习要覆盖到哪里，确认后我再安排计划。';
  }

  if (args.intent?.kind === 'preview_plan') {
    if (args.hasDetectedProgress) {
      return '好的，我捕捉到了这次预习范围的线索。先确认一下，确认后我再给你安排预习计划和提纲。';
    }
    return args.progressKnown
      ? '好的。先选这次预习要从哪里开始或覆盖到哪里；确认后我再生成预习计划和提纲。'
      : '好的，但是我还不知道你现在学到哪里。先确认当前位置，我再把预习计划接在合适的起点上。';
  }

  if (args.intent?.kind === 'practice_plan') {
    if (args.hasDetectedProgress) {
      return '好的，我捕捉到了你这次题目范围的线索。先确认一下，确认后我再开出题目计划。';
    }
    return args.progressKnown
      ? '好的。先选这次题目计划覆盖到哪里；确认后我再给出对应的刷题/测验计划。'
      : '好的，但是我还不知道你的学习进度。先选择你现在学到哪里，确认后我再给出对应题目计划。';
  }

  if (args.hasDetectedProgress) {
    return '我捕捉到了学习进度线索。先确认一下，再写入记忆。';
  }

  return args.progressKnown
    ? '先确认一下这次要使用的学习进度。'
    : '先确认一下你的学习进度，我再继续。';
}

export function learnProgressRequestReason(args: {
  intent?: LearnClientPlanningIntent | null;
  hasDetectedProgress: boolean;
  detectedReason?: string;
  progressKnown: boolean;
}): string {
  if (args.hasDetectedProgress && args.detectedReason) return args.detectedReason;
  if (args.intent?.kind === 'review_plan') {
    return args.progressKnown
      ? '请选择这次复习覆盖到哪里。确认后，我会按这个范围更新学习记忆并生成复习安排。'
      : '请选择你现在在这门课里的位置，或者这次复习想覆盖到哪里。确认后，我会写入学习记忆并生成复习安排。';
  }
  if (args.intent?.kind === 'preview_plan') {
    return args.progressKnown
      ? '请选择这次预习从哪里开始或覆盖到哪里。确认后，我会按这个范围生成预习安排和提纲。'
      : '请选择你现在在这门课里的位置。确认后，我会把预习计划接在这个起点之后。';
  }
  if (args.intent?.kind === 'practice_plan') {
    return args.progressKnown
      ? '请选择这次刷题/测验覆盖到哪里。确认后，我会按这个范围生成题目计划。'
      : '请选择你现在在这门课里的位置。确认后，我会写入学习记忆并生成题目计划。';
  }
  return args.progressKnown
    ? '请选择要确认的学习位置。确认后，我会更新学习记忆。'
    : '请选择你现在在这门课里的位置。确认后，我会把它写入学习记忆。';
}

export function createLearnProgressRequest(args: {
  intent?: LearnClientPlanningIntent | null;
  text?: string;
  detectedProposal?: LearnProgressProposal | null;
  progressKnown: boolean;
  snapshotSelection: string;
  selectionLabel: string;
}): {
  text: string;
  proposal: LearnProgressProposal;
  pendingAction?: LearnPendingCourseAction;
} {
  const hasDetectedProgress = Boolean(args.detectedProposal);
  const selection = args.detectedProposal?.selection || args.snapshotSelection;
  const writeMode = learnProgressWriteMode({
    intent: args.intent,
    progressKnown: args.progressKnown,
    hasDetectedProgress,
  });
  return {
    text: learnProgressRequestText({
      intent: args.intent,
      hasDetectedProgress,
      progressKnown: args.progressKnown,
    }),
    proposal: {
      selection,
      label: args.detectedProposal?.label || args.selectionLabel,
      reason: learnProgressRequestReason({
        intent: args.intent,
        hasDetectedProgress,
        detectedReason: args.detectedProposal?.reason,
        progressKnown: args.progressKnown,
      }),
      title: learnProgressRequestTitle({ intent: args.intent, writeMode }),
      confirmLabel: args.intent ? '确认并继续' : '确认更新',
      writeMode,
    },
    pendingAction:
      args.intent && args.text
        ? learnPendingActionFromPlanningIntent(args.intent, args.text)
        : undefined,
  };
}
