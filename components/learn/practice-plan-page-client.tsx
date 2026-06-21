'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ClipboardCheck, Loader2 } from 'lucide-react';
import { CourseProblemBankView } from '@/components/problem-bank/course-problem-bank-view';
import type { CourseProblemPracticeAttemptResolvedEvent } from '@/components/problem-bank/use-course-problem-bank-controller';
import { Button } from '@/components/ui/button';
import { usePersistHydrated } from '@/lib/hooks/use-persist-hydrated';
import {
  loadPracticePlan,
  recordPracticeAttemptResult,
  saveLearnerCourseState,
  savePracticePlan,
  type PracticeAttemptStatus,
  type PracticePlan,
} from '@/lib/learning/course-learner-state';
import { useAuthStore } from '@/lib/store/auth';
import {
  loadRemoteLearnerCourseState,
  loadRemotePracticePlan,
  saveRemoteLearnerCourseState,
} from '@/lib/utils/learner-course-api';

function practiceStatusFromAttempt(status: unknown): PracticeAttemptStatus {
  if (status === 'passed' || status === 'partial' || status === 'failed') return status;
  if (status === 'error') return 'failed';
  return 'partial';
}

function defaultScoreFromStatus(status: PracticeAttemptStatus): number {
  if (status === 'passed') return 1;
  if (status === 'partial') return 0.5;
  return 0;
}

function normalizedAttemptScore(
  score: number | null | undefined,
  status: PracticeAttemptStatus,
): number {
  if (typeof score !== 'number' || Number.isNaN(score)) return defaultScoreFromStatus(status);
  return Math.max(0, Math.min(1, score));
}

function learnHref(courseId?: string) {
  return courseId ? `/learn?courseId=${encodeURIComponent(courseId)}` : '/learn';
}

export function PracticePlanPageClient({ planId }: { planId: string }) {
  const router = useRouter();
  const authHydrated = usePersistHydrated(useAuthStore);
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  const userId = useAuthStore((state) => state.userId);
  const [plan, setPlan] = useState<PracticePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authHydrated) return;
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }

    let alive = true;
    setLoading(true);
    setError(null);

    (async () => {
      const localPlan = loadPracticePlan(planId);
      const remotePlan = await loadRemotePracticePlan(planId);
      if (!alive) return;

      const loadedPlan = remotePlan || localPlan;
      if (!loadedPlan) {
        setPlan(null);
        setLoading(false);
        return;
      }

      if (remotePlan) savePracticePlan(remotePlan);
      const remoteState = await loadRemoteLearnerCourseState(loadedPlan.courseId);
      if (!alive) return;
      if (remoteState) saveLearnerCourseState(remoteState);

      setPlan(loadedPlan);
      setLoading(false);
    })().catch((err) => {
      if (!alive) return;
      setError(err instanceof Error ? err.message : '练习计划加载失败');
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [authHydrated, isLoggedIn, planId, router]);

  const planProblemIds = useMemo(
    () => Array.from(new Set(plan?.problemIds.filter(Boolean) ?? [])),
    [plan],
  );

  const handlePracticeAttemptResolved = useCallback(
    (event: CourseProblemPracticeAttemptResolvedEvent) => {
      if (!plan) return;
      const status = practiceStatusFromAttempt(event.status);
      const title = event.problemTitle || event.problemId;
      const concepts = event.concepts.length > 0 ? event.concepts : [title];
      const nextState = recordPracticeAttemptResult({
        userId: userId || 'anonymous',
        courseId: plan.courseId,
        result: {
          problemId: event.problemId,
          problemTitle: title,
          concepts,
          status,
          score: normalizedAttemptScore(event.score, status),
        },
      });
      void saveRemoteLearnerCourseState(nextState);
    },
    [plan, userId],
  );

  if (!authHydrated || loading) {
    return (
      <div className="grid h-full min-h-[70dvh] place-items-center text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          加载练习…
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="grid h-full min-h-[70dvh] place-items-center px-6 text-center">
        <div className="max-w-md">
          <ClipboardCheck className="mx-auto size-10 text-muted-foreground" />
          <h1 className="mt-4 text-2xl font-semibold">没有找到这个计划</h1>
          {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
          <Button onClick={() => router.push('/learn')} className="mt-5 gap-2">
            <ArrowLeft className="size-4" />
            回到学习页
          </Button>
        </div>
      </div>
    );
  }

  if (planProblemIds.length === 0) {
    return (
      <div className="grid h-full min-h-[70dvh] place-items-center px-6 text-center">
        <div className="max-w-md">
          <ClipboardCheck className="mx-auto size-10 text-muted-foreground" />
          <h1 className="mt-4 text-2xl font-semibold">这个计划还没有题目</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            回到课程聊天重新生成一组练习。
          </p>
          <Button onClick={() => router.push(learnHref(plan.courseId))} className="mt-5 gap-2">
            <ArrowLeft className="size-4" />
            回到课程聊天
          </Button>
        </div>
      </div>
    );
  }

  return (
    <CourseProblemBankView
      key={plan.id}
      courseId={plan.courseId}
      initialProblemId={planProblemIds[0]}
      mode="practice"
      practiceBackLabel="课程聊天"
      practiceProblemIds={planProblemIds}
      onPracticeBack={() => router.push(learnHref(plan.courseId))}
      onPracticeAttemptResolved={handlePracticeAttemptResolved}
    />
  );
}
