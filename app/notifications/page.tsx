'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { useAuthStore } from '@/lib/store/auth';

export default function NotificationsPage() {
  const router = useRouter();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/login');
    }
  }, [isLoggedIn, router]);

  if (!isLoggedIn) return null;

  return (
    <div className="min-h-full w-full apple-mesh-bg">
      <main className="mx-auto w-full max-w-3xl px-4 pb-12 pt-8 md:px-8">
        <section className="mb-6 apple-glass rounded-[28px] p-6">
          <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
            <Bell className="size-8 shrink-0 text-violet-600 dark:text-violet-400" strokeWidth={1.5} />
            通知
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-300">
            课程更新、系统消息与提醒会出现在这里。
          </p>
        </section>

        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white/60 px-8 py-16 text-center dark:border-white/20 dark:bg-white/5">
          <Bell className="mb-4 size-12 text-slate-300 dark:text-slate-600" strokeWidth={1.25} />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">暂无通知</p>
          <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
            有新消息时会在此显示。
          </p>
        </div>
      </main>
    </div>
  );
}
