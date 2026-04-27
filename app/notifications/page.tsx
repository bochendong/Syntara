'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/lib/store/auth';
import { useNotificationStore } from '@/lib/store/notifications';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function formatNotificationTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function accountTheme(accountType: 'CASH' | 'COMPUTE' | 'PURCHASE') {
  switch (accountType) {
    case 'COMPUTE':
      return {
        badge: 'bg-sky-500/12 text-sky-700 dark:bg-sky-400/12 dark:text-sky-200',
        chip: 'bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-100',
      };
    case 'PURCHASE':
      return {
        badge: 'bg-emerald-500/12 text-emerald-700 dark:bg-emerald-400/12 dark:text-emerald-200',
        chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-100',
      };
    default:
      return {
        badge: 'bg-amber-500/12 text-amber-700 dark:bg-amber-400/12 dark:text-amber-200',
        chip: 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-100',
      };
  }
}

export default function NotificationsPage() {
  const router = useRouter();
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  const userId = useAuthStore((state) => state.userId);
  const activeUserId = useNotificationStore((state) => state.activeUserId);
  const databaseEnabled = useNotificationStore((state) => state.databaseEnabled);
  const hasInitializedSession = useNotificationStore((state) => state.hasInitializedSession);
  const isLoading = useNotificationStore((state) => state.isLoading);
  const notifications = useNotificationStore((state) => state.notifications);
  const readByUser = useNotificationStore((state) => state.readByUser);
  const refreshNotifications = useNotificationStore((state) => state.refreshNotifications);
  const markAsRead = useNotificationStore((state) => state.markAsRead);
  const deleteNotification = useNotificationStore((state) => state.deleteNotification);
  const clearNotifications = useNotificationStore((state) => state.clearNotifications);

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }

    if (userId.trim()) {
      void refreshNotifications({ userId });
    }
  }, [isLoggedIn, refreshNotifications, router, userId]);

  if (!isLoggedIn) return null;

  const currentReadSet = new Set(readByUser[(activeUserId || userId).trim()] ?? []);
  const unreadCount = notifications.reduce(
    (count, item) => count + (currentReadSet.has(item.id) ? 0 : 1),
    0,
  );

  return (
    <div className="min-h-full w-full apple-mesh-bg">
      <main className="mx-auto w-full max-w-4xl px-4 pb-12 pt-8 md:px-8">
        <section className="apple-glass mb-6 rounded-[28px] p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
                <Bell
                  className="size-8 shrink-0 text-sky-600 dark:text-sky-400"
                  strokeWidth={1.5}
                />
                通知中心
              </h1>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-300">
                扣款、收益和系统积分发放都会保留在这里，并同步到侧边栏未读角标。
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-white/8 dark:text-slate-300">
                {unreadCount > 0 ? `${unreadCount} 条未读` : '全部已读'}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => clearNotifications()}
                disabled={notifications.length === 0}
                className="gap-2 rounded-full"
              >
                <Trash2 className="size-4" strokeWidth={1.8} />
                清除所有通知
              </Button>
            </div>
          </div>
        </section>

        {hasInitializedSession && !databaseEnabled ? (
          <section className="apple-glass mb-6 rounded-[24px] border border-amber-200/70 p-5 text-sm text-amber-900 dark:border-amber-400/20 dark:text-amber-100">
            当前环境还没有启用数据库，积分通知历史暂时无法持久保存。启用 `DATABASE_URL`
            后，这里的扣款和收益通知会自动保留。
          </section>
        ) : null}

        {isLoading && notifications.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white/60 px-8 py-16 text-center text-sm text-slate-500 dark:border-white/20 dark:bg-white/5 dark:text-slate-400">
            正在加载通知…
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white/60 px-8 py-16 text-center dark:border-white/20 dark:bg-white/5">
            <Bell className="mb-4 size-12 text-slate-300 dark:text-slate-600" strokeWidth={1.25} />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">暂无通知</p>
            <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
              有新的扣款或收益记录时，会自动出现在这里。
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {notifications.map((item) => {
              const isUnread = !currentReadSet.has(item.id);
              const theme = accountTheme(item.accountType);

              return (
                <article
                  key={item.id}
                  className={cn(
                    'apple-glass rounded-[26px] border p-5 transition-colors',
                    isUnread
                      ? 'border-sky-300/60 shadow-[0_18px_50px_rgba(59,130,246,0.10)] dark:border-sky-400/20'
                      : 'border-white/40',
                  )}
                >
                  <div className="min-w-0">
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                              {item.title}
                            </h2>
                            {isUnread ? (
                              <span className="inline-flex items-center rounded-full bg-sky-500/12 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-400/12 dark:text-sky-200">
                                未读
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                            {item.body}
                          </p>
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
                              theme.badge,
                            )}
                          >
                            {item.amountLabel}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {formatNotificationTime(item.createdAt)}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <span className={cn('rounded-full px-2.5 py-1 text-xs', theme.chip)}>
                          {item.sourceLabel}
                        </span>
                        {isUnread ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => markAsRead(item.id)}
                            className="h-8 rounded-full px-3 text-xs"
                          >
                            标记已读
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteNotification(item.id)}
                          className="h-8 rounded-full px-3 text-xs text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-300 dark:hover:bg-rose-400/10 dark:hover:text-rose-100"
                        >
                          <Trash2 className="mr-1 size-3.5" strokeWidth={1.8} />
                          删除
                        </Button>
                      </div>

                      {item.details.length > 0 ? (
                        <div className="mt-4 grid gap-2 md:grid-cols-2">
                          {item.details.map((detail) => (
                            <div
                              key={`${item.id}:${detail.key}`}
                              className="rounded-2xl border border-black/5 bg-white/45 px-3 py-2 dark:border-white/8 dark:bg-white/5"
                            >
                              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                                {detail.label}
                              </div>
                              <div
                                className={cn(
                                  'mt-1 text-sm text-slate-700 dark:text-slate-200',
                                  detail.key === 'model' ? 'font-mono text-[13px]' : '',
                                )}
                              >
                                {detail.value}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
