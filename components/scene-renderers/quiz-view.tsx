'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  PieChart,
  CheckCircle2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { backendJson } from '@/lib/utils/backend-api';
import { notifyCreditsBalancesChanged } from '@/lib/utils/credits-balance-events';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { QuizQuestion } from '@/lib/types/stage';
import { useDraftCache } from '@/lib/hooks/use-draft-cache';
import { useStageStore } from '@/lib/store';
import { useAuthStore } from '@/lib/store/auth';
import { useSettingsStore } from '@/lib/store/settings';
import { useNotificationStore } from '@/lib/store/notifications';
import {
  clearQuestionProgress,
  getQuestionProgress,
  setQuestionProgress,
} from '@/lib/utils/quiz-question-progress';
import type { GamificationEventResponse } from '@/lib/types/gamification';
import { toast } from '@/lib/notifications/client-toast';
import {
  LEARNING_CARD_DEFINITIONS,
  buildQuestionHint,
  buildRubricPeek,
  createLearningRunState,
  drawLearningCard,
  pickWrongOptionToHide,
  summarizeLearningRun,
  type LearningCardDefinition,
  type LearningCardId,
  type LearningRunState,
  type LearningRunSummary,
} from '@/lib/learning/quiz-roguelike';
import {
  buildMistakeMemoryLine,
  buildStudyCompanionNotification,
  getLearningRunStats,
  recordQuizMemory,
} from '@/lib/learning/study-memory';
import {
  GamificationRewardBanner,
  LearningAssistPanels,
  LearningCompanionPanel,
  LearningRunSummaryBanner,
  ScoreBanner,
} from '@/components/scene-renderers/quiz-learning-panels';
import {
  getEffectiveAnswer,
  getEffectiveTextAnswer,
  gradeCodeQuestion,
  gradeObjectiveQuestions,
  gradeTextQuestion,
  isCodeQuestion,
  isObjectiveQuestion,
  isTextQuestion,
  type AnswerValue,
  type QuestionResult,
} from '@/components/scene-renderers/quiz-view-utils';
import { QuizCover, renderQuestion } from '@/components/scene-renderers/quiz-question-renderers';
import type { Phase, QuizViewProps } from '@/components/scene-renderers/quiz-view-types';

export type { QuizViewProps } from '@/components/scene-renderers/quiz-view-types';
export type { QuestionResult } from '@/components/scene-renderers/quiz-view-utils';

export function QuizView({
  questions,
  sceneId,
  singleQuestionMode = false,
  initialSnapshot,
  onAttemptFinished,
  battleHeader,
  onHubPrevQuestion,
  hubPrevDisabled = false,
  onHubNextQuestion,
  hubNextDisabled = false,
  showLearningCompanion = true,
}: QuizViewProps) {
  const { t, locale } = useI18n();
  const stageId = useStageStore((s) => s.stage?.id ?? '');
  const userId = useAuthStore((s) => (s.userId?.trim() ? s.userId : 'user-anonymous'));
  const live2dPresenterModelId = useSettingsStore((s) => s.live2dPresenterModelId);
  const enqueueBanner = useNotificationStore((s) => s.enqueueBanner);

  const initialPhase: Phase = useMemo(() => {
    if (initialSnapshot?.phase === 'reviewing') return 'reviewing';
    if (initialSnapshot?.phase === 'answering') return 'answering';
    return singleQuestionMode ? 'answering' : 'not_started';
  }, [initialSnapshot, singleQuestionMode]);

  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(
    () => initialSnapshot?.answers ?? {},
  );
  const [results, setResults] = useState<QuestionResult[]>(() => initialSnapshot?.results ?? []);
  const [answeringQuestionIndex, setAnsweringQuestionIndex] = useState(0);
  const questionsKey = useMemo(
    () => questions.map((question) => question.id).join('|'),
    [questions],
  );
  const [questionEditsState, setQuestionEditsState] = useState<{
    key: string;
    edits: Record<string, Partial<QuizQuestion>>;
  }>(() => ({ key: questionsKey, edits: {} }));
  const questionEdits = useMemo(
    () => (questionEditsState.key === questionsKey ? questionEditsState.edits : {}),
    [questionEditsState, questionsKey],
  );
  const [gamificationReward, setGamificationReward] = useState<GamificationEventResponse | null>(
    null,
  );
  const [learningRun, setLearningRun] = useState<LearningRunState | null>(null);
  const [learningRunSummary, setLearningRunSummary] = useState<LearningRunSummary | null>(null);
  const [newlyUnlockedCards, setNewlyUnlockedCards] = useState<LearningCardDefinition[]>([]);
  const useBattleShell = Boolean(battleHeader);
  const battleGridClass = showLearningCompanion
    ? 'lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]'
    : 'grid-cols-1';

  const effectiveQuestions = useMemo(
    () => questions.map((q) => ({ ...q, ...(questionEdits[q.id] ?? {}) })),
    [questions, questionEdits],
  );

  const handleQuestionUpdate = useCallback(
    (questionId: string, patch: Partial<QuizQuestion>) => {
      setQuestionEditsState((prev) => ({
        key: questionsKey,
        edits: {
          ...(prev.key === questionsKey ? prev.edits : {}),
          [questionId]: {
            ...((prev.key === questionsKey ? prev.edits[questionId] : undefined) ?? {}),
            ...patch,
          },
        },
      }));
    },
    [questionsKey],
  );

  const draftKey =
    singleQuestionMode && questions[0]
      ? `quizDraft:${sceneId}:q:${questions[0].id}`
      : `quizDraft:${sceneId}`;

  const {
    cachedValue: cachedAnswers,
    updateCache: updateAnswersCache,
    clearCache: clearAnswersCache,
  } = useDraftCache<Record<string, AnswerValue>>({ key: draftKey });

  const [prevCachedAnswers, setPrevCachedAnswers] = useState(cachedAnswers);
  if (!initialSnapshot && cachedAnswers !== prevCachedAnswers) {
    setPrevCachedAnswers(cachedAnswers);
    if (cachedAnswers && Object.keys(cachedAnswers).length > 0 && phase === 'not_started') {
      setAnswers(cachedAnswers);
      setPhase('answering');
    }
  }

  const totalPoints = useMemo(
    () => effectiveQuestions.reduce((sum, q) => sum + (q.points ?? 1), 0),
    [effectiveQuestions],
  );

  const answeredCount = useMemo(
    () =>
      effectiveQuestions.filter((question) => {
        const answer = getEffectiveAnswer(question, answers[question.id]);
        if (Array.isArray(answer)) return answer.length > 0;
        return typeof answer === 'string' && answer.trim().length > 0;
      }).length,
    [effectiveQuestions, answers],
  );

  const allAnswered = answeredCount === effectiveQuestions.length;

  const safeAnsweringQuestionIndex =
    effectiveQuestions.length > 0
      ? Math.max(0, Math.min(answeringQuestionIndex, effectiveQuestions.length - 1))
      : 0;

  const handleSetAnswer = useCallback(
    (questionId: string, value: AnswerValue) => {
      setAnswers((prev) => {
        const next = { ...prev, [questionId]: value };
        updateAnswersCache(next);
        return next;
      });
    },
    [updateAnswersCache],
  );

  const startLearningRun = useCallback(() => {
    const stats = getLearningRunStats(userId, stageId || sceneId);
    setLearningRun(
      createLearningRunState({ sceneId, userId, stats, mentorId: live2dPresenterModelId }),
    );
    setLearningRunSummary(null);
    setNewlyUnlockedCards([]);
  }, [live2dPresenterModelId, sceneId, stageId, userId]);

  const handleStartQuiz = useCallback(() => {
    setAnsweringQuestionIndex(0);
    startLearningRun();
    setPhase('answering');
  }, [startLearningRun]);

  useEffect(() => {
    if (phase !== 'answering' || learningRun) return;
    const timeoutId = window.setTimeout(() => {
      startLearningRun();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [phase, learningRun, startLearningRun]);

  const handleSubmit = useCallback(() => {
    setPhase('grading');
    clearAnswersCache();
  }, [clearAnswersCache]);

  useEffect(() => {
    if (phase !== 'answering' || !learningRun || effectiveQuestions.length <= 1) return;
    const milestones = [
      Math.ceil(effectiveQuestions.length / 3),
      Math.ceil((effectiveQuestions.length * 2) / 3),
    ].filter((value, index, values) => value > 0 && values.indexOf(value) === index);
    const nextMilestone = milestones.find(
      (value) => answeredCount >= value && !learningRun.milestoneDraws.includes(value),
    );
    if (!nextMilestone) return;
    const cardId = drawLearningCard({
      sceneId,
      userId,
      stats: getLearningRunStats(userId, stageId || sceneId),
      drawIndex: learningRun.milestoneDraws.length + 1,
      excludeIds: learningRun.hand,
      mentorId: live2dPresenterModelId,
    });
    const timeoutId = window.setTimeout(() => {
      setLearningRun((prev) =>
        prev
          ? {
              ...prev,
              hand: [...prev.hand, cardId],
              milestoneDraws: [...prev.milestoneDraws, nextMilestone],
            }
          : prev,
      );
      toast.success(`宝箱掉落：${LEARNING_CARD_DEFINITIONS[cardId].name}`);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [
    answeredCount,
    effectiveQuestions.length,
    learningRun,
    live2dPresenterModelId,
    phase,
    sceneId,
    stageId,
    userId,
  ]);

  const handleUseLearningCard = useCallback(
    (cardId: LearningCardId) => {
      const card = LEARNING_CARD_DEFINITIONS[cardId];
      const currentQuestion = effectiveQuestions[safeAnsweringQuestionIndex];
      if (!card || !currentQuestion) return;

      setLearningRun((prev) => {
        if (!prev || prev.usedCards.includes(cardId)) return prev;
        const next: LearningRunState = {
          ...prev,
          usedCards: [...prev.usedCards, cardId],
          eliminatedOptions: { ...prev.eliminatedOptions },
          hints: { ...prev.hints },
          rubricPeeks: { ...prev.rubricPeeks },
        };

        switch (card.effect) {
          case 'hint':
            next.hints[currentQuestion.id] = buildQuestionHint(currentQuestion);
            break;
          case 'mistakeShield':
            next.mistakeShield += 1;
            break;
          case 'eliminateOption': {
            const hidden = pickWrongOptionToHide(
              currentQuestion,
              `${sceneId}:${currentQuestion.id}:${cardId}`,
            );
            if (hidden) {
              next.eliminatedOptions[currentQuestion.id] = [
                ...(next.eliminatedOptions[currentQuestion.id] ?? []),
                hidden,
              ];
            }
            break;
          }
          case 'nextCorrectBonus':
            next.nextCorrectBonus += 0.1;
            break;
          case 'preserveMultiplier':
            next.preserveMultiplier = true;
            break;
          case 'comboDouble':
            next.comboDoubleQuestions = Math.max(next.comboDoubleQuestions, 3);
            break;
          case 'mistakeRadar':
            next.mistakeRadar = true;
            break;
          case 'rubricPeek':
            next.rubricPeeks[currentQuestion.id] = buildRubricPeek(currentQuestion);
            break;
          case 'bossBonus':
            next.bossBonus = true;
            break;
          default:
            break;
        }
        return next;
      });
      toast.success(`${card.name}：${card.teacherLine}`);
    },
    [safeAnsweringQuestionIndex, effectiveQuestions, sceneId],
  );

  useEffect(() => {
    if (phase !== 'grading') return;
    let cancelled = false;

    (async () => {
      const objectiveResults = gradeObjectiveQuestions(effectiveQuestions, answers);
      const textResults = await Promise.all(
        effectiveQuestions
          .filter((question) => isTextQuestion(question) && !isObjectiveQuestion(question))
          .map((question) =>
            gradeTextQuestion(
              question,
              getEffectiveTextAnswer(question, answers[question.id]),
              locale,
            ),
          ),
      );
      const codeResults = await Promise.all(
        effectiveQuestions
          .filter(isCodeQuestion)
          .map((question) =>
            gradeCodeQuestion(
              question,
              getEffectiveTextAnswer(question, answers[question.id]),
              locale,
            ),
          ),
      );

      if (cancelled) return;

      const allResultsMap = new Map<string, QuestionResult>();
      [...objectiveResults, ...textResults, ...codeResults].forEach((result) => {
        allResultsMap.set(result.questionId, result);
      });
      const ordered = effectiveQuestions
        .map((question) => allResultsMap.get(question.id))
        .filter(Boolean) as QuestionResult[];
      const runForSummary = learningRun;
      if (runForSummary) {
        const previousStats = getLearningRunStats(userId, stageId || sceneId);
        const summary = summarizeLearningRun({
          results: ordered,
          previousStats,
          run: runForSummary,
        });
        const memory = recordQuizMemory({
          userId,
          stageId: stageId || sceneId,
          sceneId,
          questions: effectiveQuestions,
          results: ordered,
          mistakeRadar: runForSummary.mistakeRadar,
        });
        setLearningRunSummary(summary);
        setNewlyUnlockedCards(summary.unlockedCards);
        if (memory.newWeakPoints.length > 0) {
          const weakPoint = memory.newWeakPoints[0];
          enqueueBanner(
            buildStudyCompanionNotification({
              id: `mistake-memory:${weakPoint.id}:${Date.now()}`,
              sourceKind: 'mistake_review',
              title: '我帮你记下来了',
              body: buildMistakeMemoryLine(weakPoint),
              sourceLabel: '错题记忆',
              details: [
                { key: 'weakPoint', label: '卡点', value: weakPoint.title },
                { key: 'reason', label: '复习线索', value: weakPoint.reason },
              ],
            }),
          );
        } else if (summary.correctCount > 0) {
          enqueueBanner(
            buildStudyCompanionNotification({
              id: `study-run:${sceneId}:${Date.now()}`,
              sourceKind: 'study_nudge',
              title: '这局手感我收到了',
              body: `这局答对 ${summary.correctCount} 题，最高连胜 ${summary.longestStreak}。你刚才的推进我有好好记着，下一关继续陪你。`,
              sourceLabel: '做题陪伴',
            }),
          );
        }
      }
      setResults(ordered);
      setPhase('reviewing');
    })();

    return () => {
      cancelled = true;
    };
  }, [
    phase,
    effectiveQuestions,
    answers,
    locale,
    learningRun,
    userId,
    stageId,
    sceneId,
    enqueueBanner,
  ]);

  const persistDoneRef = useRef(false);

  useEffect(() => {
    if (singleQuestionMode && initialSnapshot?.phase === 'reviewing') {
      persistDoneRef.current = true;
    }
  }, [singleQuestionMode, initialSnapshot]);

  const rewardEventDoneRef = useRef(false);
  const attemptFinishedDoneRef = useRef(false);

  useEffect(() => {
    if (initialSnapshot?.phase === 'reviewing') {
      rewardEventDoneRef.current = true;
    }
  }, [initialSnapshot]);

  useEffect(() => {
    if (phase !== 'reviewing') {
      persistDoneRef.current = false;
      rewardEventDoneRef.current = false;
      attemptFinishedDoneRef.current = false;
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== 'reviewing' || results.length === 0 || attemptFinishedDoneRef.current) return;
    attemptFinishedDoneRef.current = true;
    onAttemptFinished?.(results);
  }, [phase, results, onAttemptFinished]);

  useEffect(() => {
    if (
      phase !== 'reviewing' ||
      !singleQuestionMode ||
      effectiveQuestions.length !== 1 ||
      !stageId ||
      persistDoneRef.current
    ) {
      return;
    }
    const question = effectiveQuestions[0];
    const result = results.find((entry) => entry.questionId === question.id);
    if (!result) return;
    persistDoneRef.current = true;
    setQuestionProgress(stageId, userId, sceneId, question.id, {
      status: result.status,
      updatedAt: Date.now(),
      userAnswer:
        (getEffectiveAnswer(question, answers[question.id]) as AnswerValue | undefined) ?? null,
      result: {
        questionId: result.questionId,
        correct: result.correct,
        status: result.status,
        earned: result.earned,
        aiComment: result.aiComment,
        codeReport: result.codeReport,
      },
    });
  }, [phase, singleQuestionMode, effectiveQuestions, results, answers, sceneId, stageId, userId]);

  const handleRetry = useCallback(() => {
    if (singleQuestionMode && effectiveQuestions.length === 1 && stageId) {
      clearQuestionProgress(stageId, userId, sceneId, effectiveQuestions[0].id);
    }
    setAnsweringQuestionIndex(0);
    setPhase(singleQuestionMode ? 'answering' : 'not_started');
    setAnswers({});
    setResults([]);
    setGamificationReward(null);
    setLearningRun(null);
    setLearningRunSummary(null);
    setNewlyUnlockedCards([]);
    clearAnswersCache();
    onAttemptFinished?.([]);
  }, [
    clearAnswersCache,
    singleQuestionMode,
    effectiveQuestions,
    stageId,
    userId,
    sceneId,
    onAttemptFinished,
  ]);

  useEffect(() => {
    if (phase !== 'reviewing' || rewardEventDoneRef.current || results.length === 0) {
      return;
    }
    rewardEventDoneRef.current = true;

    let cancelled = false;

    (async () => {
      try {
        const correctCount = results.filter((result) => result.status === 'correct').length;
        const accuracyPercent =
          effectiveQuestions.length > 0
            ? Math.round((correctCount / effectiveQuestions.length) * 100)
            : 0;

        let payload:
          | {
              type: 'quiz_completed';
              sceneId: string;
              sceneTitle?: string;
              referenceKey: string;
              questionCount: number;
              correctCount: number;
              accuracyPercent: number;
            }
          | {
              type: 'review_completed';
              sceneId: string;
              sceneTitle?: string;
              referenceKey: string;
              hadPreviousIncorrect: boolean;
            };

        if (singleQuestionMode && effectiveQuestions.length === 1) {
          const question = effectiveQuestions[0];
          const previous = getQuestionProgress(stageId, userId, sceneId, question.id);
          const current = results.find((item) => item.questionId === question.id);
          const referenceKey = `${sceneId}:${question.id}`;

          if (previous?.status === 'incorrect' && current?.status === 'correct') {
            payload = {
              type: 'review_completed',
              sceneId,
              sceneTitle: question.question,
              referenceKey,
              hadPreviousIncorrect: true,
            };
          } else {
            payload = {
              type: 'quiz_completed',
              sceneId,
              sceneTitle: question.question,
              referenceKey,
              questionCount: 1,
              correctCount,
              accuracyPercent,
            };
          }
        } else {
          payload = {
            type: 'quiz_completed',
            sceneId,
            referenceKey: sceneId,
            questionCount: effectiveQuestions.length,
            correctCount,
            accuracyPercent,
          };
        }

        const reward = await backendJson<GamificationEventResponse>('/api/gamification/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (cancelled) return;
        notifyCreditsBalancesChanged();
        setGamificationReward(reward);
        if (reward.rewardedPurchaseCredits > 0 || reward.rewardedAffinity > 0) {
          toast.success(
            [
              reward.rewardedPurchaseCredits > 0
                ? `+${reward.rewardedPurchaseCredits} 购买积分`
                : '',
              reward.rewardedAffinity > 0 ? `+${reward.rewardedAffinity} 亲密度` : '',
            ]
              .filter(Boolean)
              .join(' · '),
          );
        }
      } catch {
        // Reward settlement should never block quiz review.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [phase, results, effectiveQuestions, sceneId, singleQuestionMode, stageId, userId]);

  const earnedScore = useMemo(
    () => results.reduce((sum, result) => sum + result.earned, 0),
    [results],
  );
  const resultMap = useMemo(() => {
    const map: Record<string, QuestionResult> = {};
    results.forEach((result) => {
      map[result.questionId] = result;
    });
    return map;
  }, [results]);

  return (
    <div className="w-full h-full bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-900 overflow-hidden flex flex-col">
      <AnimatePresence mode="wait">
        {phase === 'not_started' && (
          <motion.div
            key="cover"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 min-h-0"
          >
            {useBattleShell ? (
              <div className="h-full min-h-0 bg-gradient-to-br from-rose-50/45 via-white to-sky-50/55 dark:from-rose-950/10 dark:via-slate-900 dark:to-sky-950/15">
                <div className={cn('grid h-full min-h-0', battleGridClass)}>
                  <div className="flex min-h-0 flex-col gap-3 p-3 md:p-4">
                    {battleHeader ? <div className="shrink-0">{battleHeader}</div> : null}
                    <div className="min-h-0 flex-1 overflow-hidden rounded-3xl border border-gray-100 bg-white/95 shadow-sm dark:border-white/10 dark:bg-slate-900/85">
                      <QuizCover
                        questionCount={effectiveQuestions.length}
                        totalPoints={totalPoints}
                        onStart={handleStartQuiz}
                      />
                    </div>
                  </div>
                  {showLearningCompanion ? (
                    <LearningCompanionPanel
                      run={learningRun}
                      currentQuestion={effectiveQuestions[0]}
                      summary={learningRunSummary}
                      modelId={live2dPresenterModelId}
                      phase={phase}
                      answeredCount={answeredCount}
                      totalCount={effectiveQuestions.length}
                      onUseCard={handleUseLearningCard}
                      fullHeight
                    />
                  ) : null}
                </div>
              </div>
            ) : (
              <QuizCover
                questionCount={effectiveQuestions.length}
                totalPoints={totalPoints}
                onStart={handleStartQuiz}
              />
            )}
          </motion.div>
        )}

        {phase === 'answering' && (
          <motion.div
            key="answering"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 min-h-0"
          >
            <div
              className={cn(
                'h-full min-h-0 bg-gradient-to-br from-rose-50/45 via-white to-sky-50/55 dark:from-rose-950/10 dark:via-slate-900 dark:to-sky-950/15',
                useBattleShell ? 'p-0' : 'p-4',
              )}
            >
              <div
                className={cn(
                  'grid h-full min-h-0',
                  battleGridClass,
                  useBattleShell ? 'gap-0' : 'gap-4',
                )}
              >
                <div
                  className={cn('flex min-h-0 flex-col gap-3', useBattleShell ? 'p-3 md:p-4' : '')}
                >
                  {battleHeader ? <div className="shrink-0">{battleHeader}</div> : null}
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white/95 shadow-sm dark:border-white/10 dark:bg-slate-900/85">
                    <div className="flex shrink-0 items-center justify-between border-b border-gray-100 bg-white/80 px-6 py-3 backdrop-blur dark:border-gray-700 dark:bg-gray-900/80">
                      <div className="flex items-center gap-2">
                        <PieChart className="h-4 w-4 text-sky-500" />
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                          {t('quiz.answering')}
                        </span>
                        <span className="ml-1 text-xs text-gray-400">
                          {effectiveQuestions.length > 1
                            ? locale === 'zh-CN'
                              ? `第 ${safeAnsweringQuestionIndex + 1} / ${effectiveQuestions.length} 题 · 已答 ${answeredCount}`
                              : `Q${safeAnsweringQuestionIndex + 1}/${effectiveQuestions.length} · ${answeredCount} answered`
                            : `${answeredCount} / ${effectiveQuestions.length}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {onHubPrevQuestion && (
                          <button
                            type="button"
                            onClick={onHubPrevQuestion}
                            disabled={hubPrevDisabled}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                              hubPrevDisabled
                                ? 'cursor-not-allowed text-gray-300 dark:text-gray-600'
                                : 'text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-900/30',
                            )}
                          >
                            <ChevronLeft className="h-4 w-4" />
                            {t('quiz.prevQuestion')}
                          </button>
                        )}
                        {onHubNextQuestion && (
                          <button
                            type="button"
                            onClick={onHubNextQuestion}
                            disabled={hubNextDisabled}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                              hubNextDisabled
                                ? 'cursor-not-allowed text-gray-300 dark:text-gray-600'
                                : 'text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-900/30',
                            )}
                          >
                            {t('quiz.nextQuestion')}
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={handleSubmit}
                          disabled={!allAnswered}
                          className={cn(
                            'rounded-lg px-4 py-1.5 text-xs font-medium transition-all',
                            allAnswered
                              ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-sm hover:shadow-md hover:shadow-sky-200/50 active:scale-[0.97] dark:hover:shadow-sky-900/50'
                              : 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500',
                          )}
                        >
                          {t('quiz.submitAnswers')}
                        </button>
                      </div>
                    </div>
                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
                      {(effectiveQuestions.length > 1
                        ? [
                            {
                              question: effectiveQuestions[safeAnsweringQuestionIndex],
                              index: safeAnsweringQuestionIndex,
                            },
                          ]
                        : effectiveQuestions.map((question, index) => ({ question, index }))
                      ).map(({ question, index }) => (
                        <div key={question.id} className="space-y-3">
                          <LearningAssistPanels question={question} run={learningRun} />
                          {renderQuestion(
                            question,
                            index,
                            getEffectiveAnswer(question, answers[question.id]),
                            (value) => handleSetAnswer(question.id, value),
                            undefined,
                            locale,
                            handleQuestionUpdate,
                            learningRun?.eliminatedOptions[question.id] ?? [],
                          )}
                        </div>
                      ))}
                    </div>
                    {effectiveQuestions.length > 1 && (
                      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-100 bg-white/90 px-6 py-3 backdrop-blur dark:border-gray-700 dark:bg-gray-900/90">
                        <button
                          type="button"
                          disabled={safeAnsweringQuestionIndex <= 0}
                          onClick={() => setAnsweringQuestionIndex((i) => Math.max(0, i - 1))}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                            safeAnsweringQuestionIndex <= 0
                              ? 'cursor-not-allowed text-gray-300 dark:text-gray-600'
                              : 'text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-900/30',
                          )}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          {t('quiz.prevQuestion')}
                        </button>
                        <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                          {safeAnsweringQuestionIndex + 1} / {effectiveQuestions.length}
                        </span>
                        <button
                          type="button"
                          disabled={safeAnsweringQuestionIndex >= effectiveQuestions.length - 1}
                          onClick={() =>
                            setAnsweringQuestionIndex((i) =>
                              Math.min(effectiveQuestions.length - 1, i + 1),
                            )
                          }
                          className={cn(
                            'inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                            safeAnsweringQuestionIndex >= effectiveQuestions.length - 1
                              ? 'cursor-not-allowed text-gray-300 dark:text-gray-600'
                              : 'text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-900/30',
                          )}
                        >
                          {t('quiz.nextQuestion')}
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {showLearningCompanion ? (
                  <LearningCompanionPanel
                    run={learningRun}
                    currentQuestion={effectiveQuestions[safeAnsweringQuestionIndex]}
                    summary={learningRunSummary}
                    modelId={live2dPresenterModelId}
                    phase={phase}
                    answeredCount={answeredCount}
                    totalCount={effectiveQuestions.length}
                    onUseCard={handleUseLearningCard}
                    fullHeight={useBattleShell}
                  />
                ) : null}
              </div>
            </div>
          </motion.div>
        )}

        {phase === 'grading' && (
          <motion.div
            key="grading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col items-center justify-center gap-5"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
            >
              <Loader2 className="w-10 h-10 text-sky-500" />
            </motion.div>
            <div className="text-center">
              <p className="text-base font-semibold text-gray-700 dark:text-gray-200">
                {t('quiz.aiGrading')}
              </p>
              <p className="text-sm text-gray-400 mt-1">{t('quiz.aiGradingWait')}</p>
            </div>
            <div className="flex gap-1 mt-2">
              {[0, 1, 2].map((idx) => (
                <motion.div
                  key={idx}
                  className="w-2 h-2 rounded-full bg-sky-400"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ repeat: Infinity, duration: 1.2, delay: idx * 0.2 }}
                />
              ))}
            </div>
          </motion.div>
        )}

        {phase === 'reviewing' && (
          <motion.div
            key="reviewing"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex-1 min-h-0"
          >
            <div
              className={cn(
                'h-full min-h-0 bg-gradient-to-br from-rose-50/45 via-white to-sky-50/55 dark:from-rose-950/10 dark:via-slate-900 dark:to-sky-950/15',
                useBattleShell ? 'p-0' : 'p-4',
              )}
            >
              <div
                className={cn(
                  'grid h-full min-h-0',
                  battleGridClass,
                  useBattleShell ? 'gap-0' : 'gap-4',
                )}
              >
                <div
                  className={cn('flex min-h-0 flex-col gap-3', useBattleShell ? 'p-3 md:p-4' : '')}
                >
                  {battleHeader ? <div className="shrink-0">{battleHeader}</div> : null}
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white/95 shadow-sm dark:border-white/10 dark:bg-slate-900/85">
                    <div className="flex shrink-0 items-center justify-between border-b border-gray-100 bg-white/80 px-6 py-3 backdrop-blur dark:border-gray-700 dark:bg-gray-900/80">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                          {t('quiz.quizReport')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {onHubPrevQuestion && (
                          <button
                            type="button"
                            onClick={onHubPrevQuestion}
                            disabled={hubPrevDisabled}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                              hubPrevDisabled
                                ? 'cursor-not-allowed text-gray-300 dark:text-gray-600'
                                : 'text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-900/30',
                            )}
                          >
                            <ChevronLeft className="h-4 w-4" />
                            {t('quiz.prevQuestion')}
                          </button>
                        )}
                        {onHubNextQuestion && (
                          <button
                            type="button"
                            onClick={onHubNextQuestion}
                            disabled={hubNextDisabled}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                              hubNextDisabled
                                ? 'cursor-not-allowed text-gray-300 dark:text-gray-600'
                                : 'text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-900/30',
                            )}
                          >
                            {t('quiz.nextQuestion')}
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={handleRetry}
                          className="flex items-center gap-1.5 text-xs text-gray-500 transition-colors hover:text-sky-600 dark:text-gray-400 dark:hover:text-sky-400"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          {t('quiz.retry')}
                        </button>
                      </div>
                    </div>
                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
                      {!(singleQuestionMode && effectiveQuestions.length === 1) && (
                        <ScoreBanner score={earnedScore} total={totalPoints} results={results} />
                      )}
                      <LearningRunSummaryBanner
                        summary={learningRunSummary}
                        unlockedCards={newlyUnlockedCards}
                      />
                      <GamificationRewardBanner reward={gamificationReward} />
                      {effectiveQuestions.map((question, index) =>
                        renderQuestion(
                          question,
                          index,
                          getEffectiveAnswer(question, answers[question.id]),
                          () => {},
                          resultMap[question.id],
                          locale,
                          handleQuestionUpdate,
                        ),
                      )}
                    </div>
                  </div>
                </div>
                {showLearningCompanion ? (
                  <LearningCompanionPanel
                    run={learningRun}
                    currentQuestion={effectiveQuestions[0]}
                    summary={learningRunSummary}
                    modelId={live2dPresenterModelId}
                    phase={phase}
                    answeredCount={effectiveQuestions.length}
                    totalCount={effectiveQuestions.length}
                    onUseCard={handleUseLearningCard}
                    fullHeight={useBattleShell}
                  />
                ) : null}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
