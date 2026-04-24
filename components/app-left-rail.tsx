'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import {
  ArrowRightLeft,
  Bell,
  Bug,
  ChevronLeft,
  ChevronRight,
  Cpu,
  LifeBuoy,
  LogOut,
  Moon,
  Search,
  Settings,
  ShoppingBag,
  Sun,
  Wallet,
} from 'lucide-react';
import { useUserProfileStore } from '@/lib/store/user-profile';
import { useAuthStore } from '@/lib/store/auth';
import { useAuthSignOut } from '@/lib/hooks/use-auth-sign-out';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { useNotificationStore } from '@/lib/store/notifications';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useTheme } from '@/lib/hooks/use-theme';
import { cn } from '@/lib/utils';
import { backendJson } from '@/lib/utils/backend-api';
import {
  formatCashCreditsLabel,
  formatComputeCreditsLabel,
  formatPurchaseCreditsLabel,
} from '@/lib/utils/credits';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AppCoreNavList } from '@/components/app-core-nav-list';
import { ChatContactsRail } from '@/components/chat-contacts-rail';
import { resolveCourseOrchestratorAvatar } from '@/lib/constants/course-chat';
import { isDashboardRoute } from '@/lib/utils/dashboard-routes';
import { CONTACT_SUPPORT_NAV_URL, REPORT_ISSUE_NAV_URL } from '@/lib/constants/support-nav';
import { ProfileAvatarPicker } from '@/components/user-profile/profile-avatar-picker';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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
  '/gamification',
  '/store/courses',
  '/store/avatars',
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
  const notificationsActive =
    pathname === '/notifications' || pathname?.startsWith('/notifications/');
  const unreadNotificationCount = useNotificationStore((s) => s.unreadCount);
  const unreadNotificationLabel =
    unreadNotificationCount > 99 ? '99+' : String(unreadNotificationCount);

  const inCourseContext = Boolean(courseId);
  /** 与 `isDashboardRoute` 对齐：Dashboard 壳层用浅色玻璃与固定五项导航；课程/课堂/笔记本商城等为 Notebook 工作区 */
  const notebookSidebar = !isDashboardRoute(pathname, courseId);
  const resolvedCourseAvatar = resolveCourseOrchestratorAvatar(courseId, courseAvatarUrl);
  const railAvatarSrc = inCourseContext ? resolvedCourseAvatar : avatar;
  const railTitle = inCourseContext ? courseName : displayName;
  const railHref = inCourseContext ? `/course/${courseId}` : '/';
  const railTooltip = inCourseContext ? '所有课程' : '首页';
  const railSurfaceClass = cn(
    'flex h-full flex-col overflow-hidden rounded-[20px] transition-[width,box-shadow,background,border-color] duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
    notebookSidebar
      ? [
          'border border-slate-900/[0.08] bg-[linear-gradient(180deg,rgba(236,244,255,0.96)_0%,rgba(244,247,255,0.92)_30%,rgba(255,255,255,0.92)_100%)] shadow-[0_24px_48px_rgba(60,92,154,0.12)]',
          'dark:border-white/[0.08] dark:bg-[linear-gradient(180deg,rgba(11,19,40,0.96)_0%,rgba(19,28,52,0.94)_34%,rgba(14,18,31,0.95)_100%)] dark:shadow-[0_24px_48px_rgba(2,6,23,0.42)]',
        ]
      : 'apple-glass-heavy',
  );

  const isChatPage = pathname === '/chat' || pathname?.startsWith('/chat/');

  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [balances, setBalances] = useState<{
    cash: number;
    compute: number;
    purchase: number;
  } | null>(null);
  const [userAffinityLevel, setUserAffinityLevel] = useState<number | null>(null);

  useEffect(() => {
    if (!pathname) return;
    const shouldClear = COURSE_CONTEXT_CLEAR_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
    if (shouldClear) clearCurrentCourse();
  }, [pathname, clearCurrentCourse]);

  useEffect(() => {
    let cancelled = false;
    if (!isLoggedIn) {
      setBalances(null);
      setUserAffinityLevel(null);
      return () => {
        cancelled = true;
      };
    }

    void Promise.allSettled([
      backendJson<{
        success: true;
        balances: {
          cash: number;
          compute: number;
          purchase: number;
        };
      }>('/api/profile/credits'),
      backendJson<{
        success: true;
        profile: {
          affinityLevel: number;
        };
      }>('/api/gamification/summary'),
    ]).then(([creditsResult, gamificationResult]) => {
      if (cancelled) return;

      if (creditsResult.status === 'fulfilled') {
        setBalances(creditsResult.value.balances);
      } else {
        setBalances(null);
      }

      if (gamificationResult.status === 'fulfilled') {
        setUserAffinityLevel(gamificationResult.value.profile.affinityLevel);
      } else {
        setUserAffinityLevel(null);
      }
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
                  : 'flex flex-col items-center px-4 pb-3 pt-6',
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
              {!collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href="/notifications"
                      className={cn(
                        'absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.06]',
                        notificationsActive &&
                          'bg-violet-600/14 text-foreground dark:bg-violet-400/[0.18]',
                      )}
                      aria-label={
                        unreadNotificationCount > 0
                          ? `通知，${unreadNotificationCount} 条未读`
                          : '通知'
                      }
                    >
                      <span className="relative inline-flex">
                        <Bell className="size-[17px]" strokeWidth={1.75} />
                        {unreadNotificationCount > 0 ? (
                          <span className="absolute -right-2 -top-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-4 text-white shadow-[0_6px_16px_rgba(244,63,94,0.38)]">
                            {unreadNotificationLabel}
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {unreadNotificationCount > 0
                      ? `通知 · ${unreadNotificationCount} 条未读`
                      : '通知'}
                  </TooltipContent>
                </Tooltip>
              ) : null}

              {!collapsed && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      {inCourseContext ? (
                        <Link
                          href={railHref}
                          className={cn(
                            'block w-fit outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-violet-500',
                            'rounded-2xl',
                          )}
                        >
                          <img
                            src={railAvatarSrc}
                            alt=""
                            className="size-[72px] rounded-2xl object-cover ring-1 ring-black/5 dark:ring-white/10"
                          />
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAvatarPickerOpen(true)}
                          className="block w-fit rounded-full outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-violet-500"
                          aria-label="选择头像"
                        >
                          <img
                            src={railAvatarSrc}
                            alt=""
                            className="size-[72px] rounded-full object-cover ring-1 ring-black/5 dark:ring-white/10"
                          />
                        </button>
                      )}
                    </TooltipTrigger>
                    <TooltipContent side="right">{inCourseContext ? railTooltip : '选择头像'}</TooltipContent>
                  </Tooltip>
                  <p className="mt-2 w-full truncate text-center text-sm font-medium text-foreground">
                    {railTitle}
                  </p>
                  <div className="mt-2 grid w-full gap-2">
                    {balances != null ? (
                      <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                        <div className="rounded-xl border border-amber-200/70 bg-amber-50/80 px-2 py-2 text-center text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
                          <div className="flex items-center justify-center">
                            <Wallet className="size-3" />
                          </div>
                          <div className="mt-1 font-semibold leading-none">{balances.cash}</div>
                        </div>
                        <div className="rounded-xl border border-sky-200/70 bg-sky-50/80 px-2 py-2 text-center text-sky-900 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100">
                          <div className="flex items-center justify-center">
                            <Cpu className="size-3" />
                          </div>
                          <div className="mt-1 font-semibold leading-none">{balances.compute}</div>
                        </div>
                        <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/80 px-2 py-2 text-center text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100">
                          <div className="flex items-center justify-center">
                            <ShoppingBag className="size-3" />
                          </div>
                          <div className="mt-1 font-semibold leading-none">{balances.purchase}</div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </>
              )}

              {collapsed && (
                <div className="flex flex-col items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      {inCourseContext ? (
                        <Link
                          href={railHref}
                          className="block w-fit rounded-xl outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-violet-500"
                        >
                          <img
                            src={railAvatarSrc}
                            alt=""
                            className="size-10 rounded-xl object-cover ring-1 ring-black/5 dark:ring-white/10"
                          />
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAvatarPickerOpen(true)}
                          className="block w-fit rounded-full outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-violet-500"
                          aria-label="选择头像"
                        >
                          <img
                            src={railAvatarSrc}
                            alt=""
                            className="size-10 rounded-full object-cover ring-1 ring-black/5 dark:ring-white/10"
                          />
                        </button>
                      )}
                    </TooltipTrigger>
                    <TooltipContent side="right">{inCourseContext ? railTooltip : '选择头像'}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href="/notifications"
                        className={cn(
                          'inline-flex size-8 items-center justify-center rounded-full border border-slate-200/80 bg-white/80 text-slate-700 transition-colors hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10',
                          notificationsActive &&
                            'border-violet-300/80 bg-violet-500/15 text-violet-700 dark:border-violet-300/30 dark:bg-violet-500/20 dark:text-violet-100',
                        )}
                        aria-label={
                          unreadNotificationCount > 0
                            ? `通知，${unreadNotificationCount} 条未读`
                            : '通知'
                        }
                      >
                        <span className="relative inline-flex">
                          <Bell className="size-3.5" />
                          {unreadNotificationCount > 0 ? (
                            <span className="absolute -right-2 -top-2 inline-flex min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-semibold leading-4 text-white">
                              {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                            </span>
                          ) : null}
                        </span>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {unreadNotificationCount > 0
                        ? `通知 · ${unreadNotificationCount} 条未读`
                        : '通知'}
                    </TooltipContent>
                  </Tooltip>
                  {balances != null ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex size-8 items-center justify-center rounded-full border border-slate-200/80 bg-white/80 text-slate-700 transition-colors hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                        >
                          <Wallet className="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        {`${formatCashCreditsLabel(balances.cash)} · ${formatComputeCreditsLabel(
                          balances.compute,
                        )} · ${formatPurchaseCreditsLabel(balances.purchase)}`}
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
                  excludeKeys={['contact-support', 'report-issue']}
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
                    {!inCourseContext && userAffinityLevel != null ? (
                      <p className="text-[11px] text-muted-foreground/90">
                        {`Lv.${userAffinityLevel}`}
                      </p>
                    ) : null}
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a
                        href={CONTACT_SUPPORT_NAV_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex size-9 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.06]"
                        aria-label="联系客服"
                      >
                        <LifeBuoy className="size-[18px]" strokeWidth={1.75} />
                      </a>
                    </TooltipTrigger>
                    <TooltipContent side="right">联系客服</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a
                        href={REPORT_ISSUE_NAV_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex size-9 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.06]"
                        aria-label="报告问题"
                      >
                        <Bug className="size-[18px]" strokeWidth={1.75} />
                      </a>
                    </TooltipTrigger>
                    <TooltipContent side="right">报告问题</TooltipContent>
                  </Tooltip>
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
      <Dialog open={avatarPickerOpen} onOpenChange={setAvatarPickerOpen}>
        <DialogContent className="max-h-[85vh] w-[min(92vw,980px)] max-w-[980px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>选择头像</DialogTitle>
          </DialogHeader>
          <ProfileAvatarPicker size="lg" />
        </DialogContent>
      </Dialog>
    </>
  );
}
