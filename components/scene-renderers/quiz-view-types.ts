import type { ReactNode } from 'react';
import type { QuizQuestion } from '@/lib/types/stage';
import type { AnswerValue, QuestionResult } from '@/components/scene-renderers/quiz-view-utils';

export type Phase = 'not_started' | 'answering' | 'grading' | 'reviewing';

export interface QuizViewProps {
  readonly questions: QuizQuestion[];
  readonly sceneId: string;
  readonly singleQuestionMode?: boolean;
  readonly initialSnapshot?: {
    phase: 'answering' | 'reviewing';
    answers: Record<string, AnswerValue>;
    results: QuestionResult[];
  };
  readonly onAttemptFinished?: (results?: QuestionResult[]) => void;
  readonly battleHeader?: ReactNode;
  /** 课程测验中心等单题场景：顶栏在列表中上一题 / 下一题 */
  readonly onHubPrevQuestion?: () => void;
  readonly hubPrevDisabled?: boolean;
  readonly onHubNextQuestion?: () => void;
  readonly hubNextDisabled?: boolean;
  readonly showLearningCompanion?: boolean;
}
