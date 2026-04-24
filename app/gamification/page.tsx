'use client';

import { Flame } from 'lucide-react';
import { GamificationSummaryCard } from '@/components/gamification/gamification-summary-card';

export default function GamificationPage() {
  return (
    <div className="relative min-h-full w-full overflow-hidden apple-mesh-bg">
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-orb-1 absolute left-[-8rem] top-[-8rem] h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(circle,rgba(244,114,182,0.08)_0%,transparent_72%)]" />
        <div className="animate-orb-2 absolute bottom-[-10rem] right-[-8rem] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.08)_0%,transparent_72%)]" />
      </div>

      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-12 pt-8 md:px-8">
        <section className="mb-6 apple-glass rounded-[28px] p-6">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-orange-500/15 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200">
              <Flame className="size-5" strokeWidth={1.75} />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
                学习成长
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                查看你的连胜、奖励、任务节奏与陪伴角色成长。
              </p>
            </div>
          </div>
        </section>

        <div className="space-y-6">
          <GamificationSummaryCard title="陪伴系统总览" />
        </div>
      </main>
    </div>
  );
}
