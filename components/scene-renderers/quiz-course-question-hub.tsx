'use client';

import { useMemo, useState, useCallback } from 'react';
import { ArrowLeft, CheckCircle2, CircleDashed, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { Scene, QuizQuestion } from '@/lib/types/stage';
import { QuizView, type QuestionResult } from '@/components/scene-renderers/quiz-view';
import { useStageStore } from '@/lib/store';
import { useAuthStore } from '@/lib/store/auth';
import { getListItemStatus, getQuestionProgress } from '@/lib/utils/quiz-question-progress';

export interface QuizCourseQuestionHubProps {
  readonly quizScenes: Scene[];
  readonly onSwitchScene: (sceneId: string) => void;
}

type FlatRow = {
  scene: Scene;
  question: QuizQuestion;
  indexInScene: number;
};

function truncate(s: string, max: number) {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export function QuizCourseQuestionHub({ quizScenes, onSwitchScene }: QuizCourseQuestionHubProps) {
  const { t } = useI18n();
  const stageId = useStageStore((s) => s.stage?.id ?? '');
  const userId = useAuthStore((s) => (s.userId?.trim() ? s.userId : 'user-anonymous'));

  const [selected, setSelected] = useState<{ sceneId: string; questionId: string } | null>(null);
  const [listVersion, setListVersion] = useState(0);

  const rows = useMemo((): FlatRow[] => {
    const out: FlatRow[] = [];
    for (const scene of quizScenes) {
      if (scene.type !== 'quiz' || scene.content.type !== 'quiz') continue;
      scene.content.questions.forEach((q, indexInScene) => {
        out.push({ scene, question: q, indexInScene });
      });
    }
    return out;
  }, [quizScenes]);

  const bumpList = useCallback(() => setListVersion((v) => v + 1), []);

  const activeRow = useMemo(() => {
    if (!selected) return null;
    return (
      rows.find((r) => r.scene.id === selected.sceneId && r.question.id === selected.questionId) ??
      null
    );
  }, [rows, selected]);

  const initialSnapshot = useMemo(() => {
    if (!selected || !stageId) return undefined;
    const status = getListItemStatus(stageId, userId, selected.sceneId, selected.questionId);
    if (status === 'unanswered') return undefined;
    const rec = getQuestionProgress(stageId, userId, selected.sceneId, selected.questionId);
    if (!rec) return undefined;
    const qid = rec.result.questionId;
    const answers: Record<string, string | string[]> = {};
    if (rec.userAnswer != null) answers[qid] = rec.userAnswer;
    const results: QuestionResult[] = [
      {
        questionId: rec.result.questionId,
        correct: rec.result.correct,
        status: rec.result.status,
        earned: rec.result.earned,
        aiComment: rec.result.aiComment,
      },
    ];
    return { phase: 'reviewing' as const, answers, results };
  }, [selected, stageId, userId]);

  if (rows.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
        {t('stage.quizViewNoQuizzes')}
      </div>
    );
  }

  if (selected && activeRow) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-gray-50 dark:bg-gray-900">
        <div className="flex shrink-0 items-center gap-2 border-b border-gray-200/80 bg-white/90 px-4 py-2.5 backdrop-blur-md dark:border-gray-700/80 dark:bg-gray-900/90">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t('quiz.hubBackToList')}
          </button>
          <span className="min-w-0 flex-1 truncate text-xs text-gray-500 dark:text-gray-400">
            {activeRow.scene.title}
          </span>
        </div>
        <div className="min-h-0 flex-1 p-3">
          <div className="mx-auto flex h-full max-w-[min(100%,96rem)] min-h-0 flex-col overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-gray-950/5 dark:bg-gray-800 dark:ring-white/5">
            <QuizView
              key={`${selected.sceneId}-${selected.questionId}`}
              questions={[activeRow.question]}
              sceneId={activeRow.scene.id}
              singleQuestionMode
              initialSnapshot={initialSnapshot}
              onAttemptFinished={bumpList}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
      <div className="border-b border-gray-200/80 bg-white/80 px-6 py-4 backdrop-blur-md dark:border-gray-700/80 dark:bg-gray-900/80">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('quiz.hubTitle')}</h2>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('quiz.hubSubtitle')}</p>
      </div>
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4" key={listVersion}>
        {rows.map((row, globalIdx) => {
          const st = stageId
            ? getListItemStatus(stageId, userId, row.scene.id, row.question.id)
            : 'unanswered';
          return (
            <li key={`${row.scene.id}-${row.question.id}`}>
              <button
                type="button"
                onClick={() => {
                  onSwitchScene(row.scene.id);
                  setSelected({ sceneId: row.scene.id, questionId: row.question.id });
                }}
                className="flex w-full items-start gap-3 rounded-xl border border-gray-200/90 bg-white p-4 text-left shadow-sm transition-colors hover:border-violet-200 hover:bg-violet-50/40 dark:border-gray-700/90 dark:bg-gray-800/80 dark:hover:border-violet-700/50 dark:hover:bg-violet-950/20"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-xs font-bold text-violet-700 dark:bg-violet-900/50 dark:text-violet-200">
                  {globalIdx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    {row.scene.title}
                  </p>
                  <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                    {truncate(row.question.question, 120)}
                  </p>
                  <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                    {t('quiz.hubWithinScene').replace('{n}', String(row.indexInScene + 1))}
                  </p>
                </div>
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold',
                    st === 'correct' &&
                      'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
                    st === 'incorrect' && 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
                    st === 'unanswered' &&
                      'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
                  )}
                >
                  {st === 'correct' && <CheckCircle2 className="h-3.5 w-3.5" />}
                  {st === 'incorrect' && <XCircle className="h-3.5 w-3.5" />}
                  {st === 'unanswered' && <CircleDashed className="h-3.5 w-3.5" />}
                  {st === 'correct' && t('quiz.hubStatusCorrect')}
                  {st === 'incorrect' && t('quiz.hubStatusWrong')}
                  {st === 'unanswered' && t('quiz.hubStatusTodo')}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
