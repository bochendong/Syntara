'use client';

import { useMemo, useState } from 'react';
import { Coins, Flame, Heart, Loader2, Sparkles, Target, WandSparkles } from 'lucide-react';
import { toast } from '@/lib/notifications/client-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useGamificationSummary } from '@/lib/hooks/use-gamification-summary';

type GamificationSummaryCardProps = {
  title?: string;
  className?: string;
  courseMilestone?: {
    courseId: string;
    courseName?: string;
    enabled: boolean;
  };
};

function rewardText(purchaseCredits: number, affinity: number) {
  const chunks: string[] = [];
  if (purchaseCredits > 0) chunks.push(`+${purchaseCredits} 购买积分`);
  if (affinity > 0) chunks.push(`+${affinity} 亲密度`);
  return chunks.join(' · ') || '已记录';
}

export function GamificationSummaryCard({
  title = '学习成长总览',
  className,
  courseMilestone,
}: GamificationSummaryCardProps) {
  const { summary, loading, error, claim, sendEvent } = useGamificationSummary(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const affinityProgress = useMemo(() => {
    if (!summary) return 0;
    if (!summary.profile.nextAffinityLevelExp) return 100;
    const prevLevelFloor =
      summary.profile.affinityLevel <= 1
        ? 0
        : [0, 30, 80, 160, 300][summary.profile.affinityLevel - 1] ?? 0;
    const current = Math.max(0, summary.profile.affinityExp - prevLevelFloor);
    const total = Math.max(1, summary.profile.nextAffinityLevelExp - prevLevelFloor);
    return Math.max(0, Math.min(100, Math.round((current / total) * 100)));
  }, [summary]);

  const handleClaim = async (kind: 'daily_sign_in' | 'daily_tasks' | 'streak_bonus') => {
    setBusyAction(kind);
    try {
      const result = await claim(kind);
      toast.success(rewardText(result.rewardedPurchaseCredits, result.rewardedAffinity));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '领取奖励失败');
    } finally {
      setBusyAction(null);
    }
  };

  const handleCourseMilestone = async () => {
    if (!courseMilestone) return;
    setBusyAction('course_milestone');
    try {
      const result = await sendEvent({
        type: 'lesson_milestone_completed',
        courseId: courseMilestone.courseId,
        courseName: courseMilestone.courseName,
        progressPercent: 100,
        checkpointCount: 1,
      });
      toast.success(`课程里程碑已结算：${rewardText(result.rewardedPurchaseCredits, result.rewardedAffinity)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '课程里程碑结算失败');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <Card className={cn('p-5 !gap-0 border-muted/40 bg-white/85 backdrop-blur-xl dark:bg-slate-900/80', className)}>
      <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            每天靠看课、做题和回顾慢慢把积分、亲密度和连胜攒起来。
          </p>
        </div>
        {loading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-amber-200/60 bg-amber-50/80 px-3 py-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
          {error}
        </div>
      ) : null}

      {!summary ? null : !summary.databaseEnabled ? (
        <div className="mt-4 rounded-xl border border-dashed border-muted-foreground/25 bg-background/50 px-4 py-4 text-sm text-muted-foreground">
          需要登录并启用数据库同步后，才能保存连续学习、亲密度、角色解锁和任务进度。
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border bg-background/60 p-4">
              <div className="flex items-center gap-2 text-[11px] font-medium text-orange-700 dark:text-orange-200">
                <Flame className="size-4" />
                连续学习
              </div>
              <div className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{summary.profile.streakDays}</div>
              <div className="mt-1 text-xs text-muted-foreground">days</div>
            </div>
            <div className="rounded-2xl border bg-background/60 p-4">
              <div className="flex items-center gap-2 text-[11px] font-medium text-emerald-700 dark:text-emerald-200">
                <Coins className="size-4" />
                今日学习奖励
              </div>
              <div className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
                {summary.profile.todayEarnedPurchaseCredits}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">/ 120 购买积分</div>
            </div>
            <div className="rounded-2xl border bg-background/60 p-4">
              <div className="flex items-center gap-2 text-[11px] font-medium text-pink-700 dark:text-pink-200">
                <Heart className="size-4" />
                当前亲密度
              </div>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-3xl font-semibold tracking-[-0.04em]">
                  Lv{summary.profile.affinityLevel}
                </span>
                <span className="pb-1 text-xs text-muted-foreground">
                  {summary.profile.affinityExp} EXP
                </span>
              </div>
              <div className="mt-2">
                <Progress value={affinityProgress} />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-background/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  当前陪伴角色：{summary.characters.find((character) => character.isEquipped)?.name ?? 'Haru'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  今日亲密度 {summary.profile.todayAffinityEarned}/{summary.profile.todayAffinityCap}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!summary.claimables.dailySignIn || busyAction != null}
                  onClick={() => void handleClaim('daily_sign_in')}
                >
                  {busyAction === 'daily_sign_in' ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  每日签到
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!summary.claimables.dailyTasks || busyAction != null}
                  onClick={() => void handleClaim('daily_tasks')}
                >
                  {busyAction === 'daily_tasks' ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  领取日常奖励
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!summary.claimables.streakBonusDays || busyAction != null}
                  onClick={() => void handleClaim('streak_bonus')}
                >
                  {busyAction === 'streak_bonus' ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  {summary.claimables.streakBonusDays
                    ? `领取 ${summary.claimables.streakBonusDays} 天连胜奖励`
                    : '连续奖励待解锁'}
                </Button>
              </div>
            </div>
          </div>

          {courseMilestone ? (
            <div className="rounded-2xl border bg-sky-50/70 p-4 dark:bg-sky-950/20">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-sky-900 dark:text-sky-100">课程里程碑</p>
                  <p className="mt-1 text-xs text-sky-700/80 dark:text-sky-200/80">
                    看完这节课后，把今天的课程里程碑记下来，结算 +8 购买积分和 +2 亲密度。
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!courseMilestone.enabled || busyAction != null}
                  onClick={() => void handleCourseMilestone()}
                >
                  {busyAction === 'course_milestone' ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  记录看课完成
                </Button>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border bg-background/60 p-4">
              <div className="flex items-center gap-2">
                <Target className="size-4 text-sky-500" />
                <p className="text-sm font-semibold">今日任务</p>
              </div>
              <div className="mt-3 space-y-2">
                {summary.dailyTasks.map((task) => (
                  <div key={task.id} className="rounded-xl border px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm">{task.label}</span>
                      <span
                        className={cn(
                          'text-xs font-medium',
                          task.completed ? 'text-emerald-600' : 'text-muted-foreground',
                        )}
                      >
                        {task.progressValue}/{task.targetValue}
                      </span>
                    </div>
                    <div className="mt-2">
                      <Progress value={(task.progressValue / task.targetValue) * 100} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border bg-background/60 p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-fuchsia-500" />
                <p className="text-sm font-semibold">本周节奏</p>
              </div>
              <div className="mt-3 space-y-2">
                {summary.weeklyTasks.map((task) => (
                  <div key={task.id} className="rounded-xl border px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm">{task.label}</span>
                      <span
                        className={cn(
                          'text-xs font-medium',
                          task.completed ? 'text-emerald-600' : 'text-muted-foreground',
                        )}
                      >
                        {task.progressValue}/{task.targetValue}
                      </span>
                    </div>
                    <div className="mt-2">
                      <Progress value={(task.progressValue / task.targetValue) * 100} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {summary.nudge ? (
            <div className="rounded-2xl border bg-gradient-to-r from-rose-50 via-white to-sky-50 p-4 dark:from-rose-950/20 dark:via-slate-900 dark:to-sky-950/20">
              <div className="flex items-start gap-3">
                <WandSparkles className="mt-0.5 size-4 text-rose-500" />
                <div>
                  <p className="text-sm font-semibold text-foreground">{summary.nudge.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{summary.nudge.body}</p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}

