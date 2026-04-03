'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Coins, LogOut, Moon, Search, Settings, Sun } from 'lucide-react';
import { useUserProfileStore } from '@/lib/store/user-profile';
import { useAuthStore } from '@/lib/store/auth';
import { useAuthSignOut } from '@/lib/hooks/use-auth-sign-out';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useTheme } from '@/lib/hooks/use-theme';
import { cn } from '@/lib/utils';
import { backendJson } from '@/lib/utils/backend-api';
import { formatCreditsUsdCompactLabel, formatCreditsUsdLabel } from '@/lib/utils/credits';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AppCoreNavList } from '@/components/app-core-nav-list';
import { ChatContactsRail } from '@/components/chat-contacts-rail';
import { resolveCourseOrchestratorAvatar } from '@/lib/constants/course-chat';
import { isDashboardRoute } from '@/lib/utils/dashboard-routes';

const scrollClass = cn(
  'min-h-0 flex-1 overflow-y-auto py-2',
  '[&::-webkit-scrollbar]:w-[5px] [&::-webkit-scrollbar-track]:bg-transparent',
  '[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-900/15',
  'dark:[&::-webkit-scrollbar-thumb]:bg-white/20',
  'hover:[&::-webkit-scrollbar-thumb]:bg-slate-900/25 dark:hover:[&::-webkit-scrollbar-thumb]:bg-white/30',
);

export interface AppLeftRailProps {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

/** 进入这些路由时清空「当前课程」。侧栏「商城」：未选课程 → `/store/courses`（课程商城）；已选课程 → `/store`（笔记本商城） */
const COURSE_CONTEXT_CLEAR_PREFIXES = [
  '/my-courses',
  '/top-up',
  '/store/courses',
  '/profile',
  '/settings',
  '/live2d',
  '/login',
  '/courses/new',
  '/notifications',
] as const;

export function AppLeftRail({ collapsed, onCollapsedChange }: AppLeftRailProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const { resolvedTheme, setTheme } = useTheme();

  const avatar = useUserProfileStore((s) => s.avatar);
  const nickname = useUserProfileStore((s) => s.nickname);
  const authName = useAuthStore((s) => s.name);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const signOutAndRedirect = useAuthSignOut();

  const courseId = useCurrentCourseStore((s) => s.id);
  const courseName = useCurrentCourseStore((s) => s.name);
  const courseAvatarUrl = useCurrentCourseStore((s) => s.avatarUrl);
  const clearCurrentCourse = useCurrentCourseStore((s) => s.clearCurrentCourse);

  const displayName = nickname.trim() || authName.trim() || t('profile.defaultNickname');

  const settingsActive = pathname === '/settings' || pathname?.startsWith('/settings/');

  const inCourseContext = Boolean(courseId);
  /** 与 `isDashboardRoute` 对齐：Dashboard 壳层用浅色玻璃与固定五项导航；课程/课堂/笔记本商城等为 Notebook 工作区 */
  const notebookSidebar = !isDashboardRoute(pathname);
  const resolvedCourseAvatar = resolveCourseOrchestratorAvatar(courseId, courseAvatarUrl);
  const railAvatarSrc = inCourseContext ? resolvedCourseAvatar : avatar;
  const railTitle = inCourseContext ? courseName : displayName;
  const railHref = inCourseContext ? `/course/${courseId}` : '/';
  const railTooltip = inCourseContext ? 'Dashboard' : '首页';
  const railSurfaceClass = cn(
    'flex h-full flex-col overflow-hidden rounded-[20px] transition-[width,box-shadow,background,border-color] duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
    notebookSidebar
      ? [
          'border border-slate-900/[0.08] bg-[linear-gradient(180deg,rgba(236,244,255,0.96)_0%,rgba(244,247,255,0.92)_30%,rgba(255,255,255,0.92)_100%)] shadow-[0_24px_48px_rgba(60,92,154,0.12)]',
          'dark:border-white/[0.08] dark:bg-[linear-gradient(180deg,rgba(11,19,40,0.96)_0%,rgba(19,28,52,0.94)_34%,rgba(14,18,31,0.95)_100%)] dark:shadow-[0_24px_48px_rgba(2,6,23,0.42)]',
        ]
      : 'apple-glass-heavy',
  );
  const contextBadge = notebookSidebar ? 'Notebook 工作区' : 'Dashboard';

  const isChatPage = pathname === '/chat' || pathname?.startsWith('/chat/');

  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [creditsBalance, setCreditsBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!pathname) return;
    const shouldClear = COURSE_CONTEXT_CLEAR_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
    if (shouldClear) clearCurrentCourse();
  }, [pathname, clearCurrentCourse]);

  useEffect(() => {
    let cancelled = false;
    if (!isLoggedIn) return () => {
      cancelled = true;
    };

    void backendJson<{
      success: true;
      balance: number;
    }>('/api/profile/credits')
      .then((response) => {
        if (!cancelled) setCreditsBalance(response.balance);
      })
      .catch(() => {
        if (!cancelled) setCreditsBalance(null);
      });

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  const expandIfCollapsed = () => {
    if (collapsed) onCollapsedChange(false);
  };

  return (
    <>
      <aside
        className={cn(
          'pointer-events-none fixed left-4 top-4 z-[1300] h-[calc(100dvh-2rem)]',
          collapsed ? 'w-[88px]' : 'w-[min(270px,calc(100vw-2rem))]',
        )}
        aria-label="主导航"
      >
        <div className={cn('pointer-events-auto h-full', railSurfaceClass)}>
          {notebookSidebar ? (
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(76,110,245,0.16),transparent_72%)] dark:bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.14),transparent_70%)]" />
          ) : null}
          {isChatPage ? (
            <div
              className={cn(
                'relative flex shrink-0 items-center gap-2 border-b border-slate-900/[0.08] dark:border-white/[0.08]',
                collapsed ? 'justify-center px-2 py-2' : 'px-2 py-2',
              )}
            >
              <button
                type="button"
                onClick={() => onCollapsedChange(!collapsed)}
                className="flex size-8 shrink-0 items-center justify-center rounded-[10px] border-0 bg-transparent text-muted-foreground shadow-none transition-colors hover:text-foreground"
                aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
              >
                {collapsed ? (
                  <ChevronRight className="size-4" strokeWidth={1.75} />
                ) : (
                  <ChevronLeft className="size-4" strokeWidth={1.75} />
                )}
              </button>
              {!collapsed && (
                <div className="relative min-w-0 flex-1">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                    strokeWidth={2}
                    aria-hidden
                  />
                  <Input
                    type="search"
                    value={contactSearchQuery}
                    onChange={(e) => setContactSearchQuery(e.target.value)}
                    placeholder="搜索联系人…"
                    aria-label="搜索联系人"
                    className="h-8 border-slate-900/[0.12] bg-black/[0.03] pl-8 text-sm dark:border-white/[0.12] dark:bg-white/[0.06]"
                  />
                </div>
              )}
            </div>
          ) : (
            <div
              className={cn(
                'relative shrink-0 border-b border-slate-900/[0.08] dark:border-white/[0.08]',
                collapsed
                  ? 'flex flex-col items-center px-2 py-3'
                  : 'flex flex-col items-center px-4 pb-3 pt-10',
              )}
            >
              <button
                type="button"
                onClick={() => onCollapsedChange(!collapsed)}
                className={cn(
                  'flex size-8 items-center justify-center rounded-[10px] border-0 bg-transparent text-muted-foreground shadow-none transition-colors hover:text-foreground',
                  collapsed ? 'mb-2' : 'absolute left-2 top-2',
                )}
                aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
              >
                {collapsed ? (
                  <ChevronRight className="size-4" strokeWidth={1.75} />
                ) : (
                  <ChevronLeft className="size-4" strokeWidth={1.75} />
                )}
              </button>

              {!collapsed && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href={railHref}
                        className={cn(
                          'block w-fit outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-violet-500',
                          inCourseContext ? 'rounded-2xl' : 'rounded-full',
                        )}
                      >
                        <img
                          src={railAvatarSrc}
                          alt=""
                          className={cn(
                            'size-[72px] object-cover ring-1 ring-black/5 dark:ring-white/10',
                            inCourseContext ? 'rounded-2xl' : 'rounded-full',
                          )}
                        />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">{railTooltip}</TooltipContent>
                  </Tooltip>
                  <p className="mt-2 w-full truncate text-center text-sm font-medium text-foreground">
                    {railTitle}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                    <div
                      className={cn(
                        'rounded-full px-2.5 py-1 text-[10px] font-medium tracking-[0.14em]',
                        notebookSidebar
                          ? 'bg-sky-500/10 text-sky-700 dark:bg-sky-400/10 dark:text-sky-200'
                          : 'bg-black/[0.04] text-muted-foreground dark:bg-white/[0.05]',
                      )}
                    >
                      {contextBadge}
                    </div>
                    {creditsBalance != null ? (
                      <Link
                        href="/top-up"
                        className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/70 bg-amber-50/80 px-2.5 py-1 text-[11px] font-medium text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100 dark:hover:bg-amber-400/15"
                      >
                        <Coins className="size-3.5" />
                        <span>{formatCreditsUsdCompactLabel(creditsBalance)}</span>
                      </Link>
                    ) : null}
                  </div>
                </>
              )}

              {collapsed && (
                <div className="flex flex-col items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href={railHref}
                        className={cn(
                          'block w-fit outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-violet-500',
                          inCourseContext ? 'rounded-xl' : 'rounded-full',
                        )}
                      >
                        <img
                          src={railAvatarSrc}
                          alt=""
                          className={cn(
                            'size-10 object-cover ring-1 ring-black/5 dark:ring-white/10',
                            inCourseContext ? 'rounded-xl' : 'rounded-full',
                          )}
                        />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">{railTooltip}</TooltipContent>
                  </Tooltip>
                  {creditsBalance != null ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          href="/top-up"
                          className="inline-flex size-8 items-center justify-center rounded-full border border-amber-200/70 bg-amber-50/80 text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100 dark:hover:bg-amber-400/15"
                        >
                          <Coins className="size-3.5" />
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        {formatCreditsUsdLabel(creditsBalance)} · 去充值
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                </div>
              )}
            </div>
          )}

          {isChatPage ? (
            <nav
              className={cn(
                'flex min-h-0 flex-1 flex-col overflow-hidden',
                collapsed ? 'px-1.5' : 'px-2',
              )}
              aria-label="聊天联系人"
            >
              <div className={cn(scrollClass, 'min-h-0 flex-1 px-0')}>
                <Suspense
                  fallback={
                    <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                      加载联系人…
                    </div>
                  }
                >
                  <ChatContactsRail
                    courseId={courseId}
                    collapsed={collapsed}
                    courseName={courseName}
                    courseAvatarUrl={resolvedCourseAvatar}
                    searchQuery={isChatPage ? contactSearchQuery : ''}
                  />
                </Suspense>
              </div>
            </nav>
          ) : (
            <nav
              className={cn(
                'flex min-h-0 flex-1 flex-col overflow-hidden',
                collapsed ? 'px-1.5' : 'px-2',
              )}
              aria-label="页面导航"
            >
              <div className={cn(scrollClass, 'px-0')}>
                <AppCoreNavList
                  collapsed={collapsed}
                  variant={notebookSidebar ? 'notebook' : 'home'}
                  onItemClick={(key) => {
                    if (key === 'chat') expandIfCollapsed();
                  }}
                />
              </div>
            </nav>
          )}

          <div className="shrink-0 border-t border-slate-900/[0.08] dark:border-white/[0.08]">
            {!collapsed ? (
              <div className="px-3 py-3">
                <div className="flex items-center gap-0.5">
                  <div className="mr-auto min-w-0 flex-1 pl-1">
                    <p className="truncate text-[11px] text-muted-foreground">
                      {isLoggedIn ? '账户已连接' : '本地体验模式'}
                    </p>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() =>
                          setTheme(resolvedTheme === 'light' ? 'dark' : 'light')
                        }
                        className="flex size-9 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.06]"
                        aria-label={
                          resolvedTheme === 'light'
                            ? t('settings.themeSwitchToDark')
                            : t('settings.themeSwitchToLight')
                        }
                      >
                        {resolvedTheme === 'light' ? (
                          <Moon className="size-[18px]" strokeWidth={1.75} />
                        ) : (
                          <Sun className="size-[18px]" strokeWidth={1.75} />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {resolvedTheme === 'light'
                        ? t('settings.themeSwitchToDark')
                        : t('settings.themeSwitchToLight')}
                    </TooltipContent>
                  </Tooltip>
                  {isChatPage ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => router.push('/settings')}
                          className={cn(
                            'flex size-9 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.06]',
                            settingsActive &&
                              'bg-violet-600/14 text-foreground dark:bg-violet-400/[0.18]',
                          )}
                          aria-label="设置"
                        >
                          <Settings className="size-[18px]" strokeWidth={1.75} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right">设置</TooltipContent>
                    </Tooltip>
                  ) : null}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() =>
                          isLoggedIn ? void signOutAndRedirect() : router.push('/login')
                        }
                        className="flex size-9 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                        aria-label={isLoggedIn ? '退出登录' : '登录'}
                      >
                        <LogOut className="size-[18px]" strokeWidth={1.75} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">{isLoggedIn ? '退出登录' : '登录'}</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 px-2 py-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() =>
                        setTheme(resolvedTheme === 'light' ? 'dark' : 'light')
                      }
                      className="flex size-10 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.06]"
                      aria-label={
                        resolvedTheme === 'light'
                          ? t('settings.themeSwitchToDark')
                          : t('settings.themeSwitchToLight')
                      }
                    >
                      {resolvedTheme === 'light' ? (
                        <Moon className="size-[18px]" strokeWidth={1.75} />
                      ) : (
                        <Sun className="size-[18px]" strokeWidth={1.75} />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {resolvedTheme === 'light'
                      ? t('settings.themeSwitchToDark')
                      : t('settings.themeSwitchToLight')}
                  </TooltipContent>
                </Tooltip>
                {isChatPage ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => router.push('/settings')}
                        className={cn(
                          'flex size-10 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.06]',
                          settingsActive &&
                            'bg-violet-600/14 text-foreground dark:bg-violet-400/[0.18]',
                        )}
                        aria-label="设置"
                      >
                        <Settings className="size-[18px]" strokeWidth={1.75} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">设置</TooltipContent>
                  </Tooltip>
                ) : null}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() =>
                        isLoggedIn ? void signOutAndRedirect() : router.push('/login')
                      }
                      className="flex size-10 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                      aria-label={isLoggedIn ? '退出登录' : '登录'}
                    >
                      <LogOut className="size-[18px]" strokeWidth={1.75} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{isLoggedIn ? '退出登录' : '登录'}</TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
