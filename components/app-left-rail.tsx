'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import {
  ArrowRightLeft,
  Bell,
  ChevronLeft,
  ChevronRight,
  Cpu,
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
import { ProfileAvatarPicker } from '@/components/user-profile/profile-avatar-picker';
import { UserAvatarWithFrame } from '@/components/user-profile/user-avatar-with-frame';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NotificationBarStageBackground } from '@/lib/notifications/notification-bar-stage-background';
import { isSolidColorBarStageId } from '@/lib/notifications/notification-bar-stage-ids';

const leftRailScrollClass = cn(
  'min-h-0 flex-1 overflow-y-auto py-2',
  '[&::-webkit-scrollbar]:w-[5px] [&::-webkit-scrollbar-track]:bg-transparent',
  '[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20',
  'hover:[&::-webkit-scrollbar-thumb]:bg-white/30',
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
  const avatarFrameId = useUserProfileStore((s) => s.avatarFrameId);
  const leftRailBarStageId = useUserProfileStore((s) => s.leftRailBarStageId);
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
  /** 仅 `/chat` 独立路由：动效/纯色只作用于左侧 `aside`，不与中间聊天区做「同套浅色」；默认仍为深色条以免与主区连成一片 */
  const isChatPage = pathname === '/chat' || pathname?.startsWith('/chat/');
  /** 非「默认」时在主导航上叠动效；课程区与 Dashboard（如 /profile）均生效，避免在设置页点击无反馈 */
  const showLeftRailStage = leftRailBarStageId !== 'default';
  /** 平铺底色：外层不用黑底，避免与淡色实色叠出灰黑；WebGL 动效仍用黑底衬底+蒙版 */
  const isLeftRailSolidColor =
    showLeftRailStage && isSolidColorBarStageId(leftRailBarStageId);
  /** 浅色主题下白底/浅字：排除独立聊天（默认不刷白、避免误以为改了聊天区背景；仍可在侧栏里选淡色实色等） */
  const onDefaultWhite =
    !showLeftRailStage && resolvedTheme === 'light' && !isChatPage;
  const onLightRail =
    resolvedTheme === 'light' &&
    ((!isChatPage && !showLeftRailStage) ||
      (isLeftRailSolidColor && leftRailBarStageId !== 'solid-black'));
  /** 外框 + 头/底分割：随白底、淡实色、深/WebGL 四档略作区分，避免各背景下对比失当 */
  const railDividers = (() => {
    if (onDefaultWhite) {
      return {
        edge: 'border-slate-300/90',
        b: 'border-b border-slate-300/85',
        t: 'border-t border-slate-300/85',
        headerRule: 'bg-slate-300/85',
      };
    }
    if (onLightRail && isLeftRailSolidColor) {
      return {
        edge: 'border-slate-800/22',
        b: 'border-b border-slate-800/32',
        t: 'border-t border-slate-800/32',
        headerRule: 'bg-slate-800/32',
      };
    }
    if (showLeftRailStage && !isLeftRailSolidColor) {
      return {
        edge: 'border-white/20',
        b: 'border-b border-white/28',
        t: 'border-t border-white/35',
        headerRule: 'bg-white/28',
      };
    }
    return {
      edge: 'border-white/18',
      b: 'border-b border-white/24',
      t: 'border-t border-white/24',
      headerRule: 'bg-white/24',
    };
  })();
  const railSurfaceClass = cn(
    'flex h-full flex-col overflow-hidden rounded-[20px] border',
    isLeftRailSolidColor
      ? cn(
          'bg-transparent',
          onLightRail
            ? 'shadow-[0_12px_40px_rgba(15,23,42,0.1)]'
            : 'shadow-[0_20px_50px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.04)_inset]',
        )
      : onDefaultWhite
        ? 'bg-white shadow-[0_12px_40px_rgba(15,23,42,0.1)]'
        : 'bg-black shadow-[0_20px_50px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.04)_inset]',
    railDividers.edge,
    'transition-[width,box-shadow,background,border-color] duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
  );
  const railIconPadBtn = onLightRail
    ? 'text-slate-500 transition-colors hover:bg-black/[0.05] hover:text-slate-900'
    : 'text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100';

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
          'pointer-events-none fixed left-4 top-4 z-[1300] h-[calc(100dvh-2rem)] overflow-hidden rounded-[20px]',
          collapsed ? 'w-[88px]' : 'w-[min(270px,calc(100vw-2rem))]',
        )}
        aria-label="主导航"
      >
        <div className={cn('pointer-events-auto relative h-full', railSurfaceClass)}>
          {notebookSidebar && leftRailBarStageId === 'default' ? (
            <div
              className={cn(
                'pointer-events-none absolute inset-x-0 top-0 z-0 h-24',
                onDefaultWhite
                  ? 'bg-[radial-gradient(ellipse_120%_100%_at_50%_0%,rgba(99,102,241,0.1),rgba(6,182,212,0.05)_40%,transparent_70%)]'
                  : 'bg-[radial-gradient(ellipse_120%_100%_at_50%_0%,rgba(99,102,241,0.22),rgba(6,182,212,0.1)_40%,transparent_72%)]',
              )}
            />
          ) : null}
          {showLeftRailStage ? (
            <div
              className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[20px]"
              aria-hidden
            >
              <NotificationBarStageBackground
                id={leftRailBarStageId}
                className={cn(
                  '!min-h-full',
                  isLeftRailSolidColor
                    ? 'opacity-100'
                    : 'opacity-[0.62] [mask-image:linear-gradient(180deg,black_0%,black_88%,transparent_100%)]',
                )}
              />
            </div>
          ) : null}
          <div
            className={cn(
              'relative z-[1] flex h-full min-h-0 flex-col',
              onLightRail ? 'text-slate-800' : 'text-zinc-200',
            )}
          >
          {isChatPage ? (
            <div
              className={cn(
                'relative flex shrink-0 items-center gap-2',
                railDividers.b,
                collapsed ? 'justify-center px-2 py-2' : 'px-2 py-2',
              )}
            >
              <button
                type="button"
                onClick={() => onCollapsedChange(!collapsed)}
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-[10px] border-0 bg-transparent shadow-none',
                  railIconPadBtn,
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
                <div className="relative min-w-0 flex-1">
                  <Search
                    className={cn(
                      'pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2',
                      onLightRail ? 'text-slate-400' : 'text-zinc-500',
                    )}
                    strokeWidth={2}
                    aria-hidden
                  />
                  <Input
                    type="search"
                    value={contactSearchQuery}
                    onChange={(e) => setContactSearchQuery(e.target.value)}
                    placeholder="搜索联系人…"
                    aria-label="搜索联系人"
                    className={cn(
                      'h-8 pl-8 text-sm',
                      onLightRail
                        ? 'border border-slate-200/80 bg-white/90 text-slate-900 placeholder:text-slate-400'
                        : 'border border-white/12 bg-white/5 text-zinc-100 placeholder:text-zinc-500',
                    )}
                  />
                </div>
              )}
            </div>
          ) : (
            <div
              className={cn(
                'relative flex shrink-0 flex-col',
                collapsed
                  ? 'items-center px-2 py-3'
                  : 'items-center px-4 pt-6',
              )}
            >
              <button
                type="button"
                onClick={() => onCollapsedChange(!collapsed)}
                className={cn(
                  'flex size-8 items-center justify-center rounded-[10px] border-0 bg-transparent shadow-none',
                  railIconPadBtn,
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
                        'absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-[10px]',
                        onLightRail
                          ? 'text-slate-500 transition-colors hover:bg-black/[0.05] hover:text-slate-900'
                          : 'text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100',
                        notificationsActive &&
                          (onLightRail
                            ? 'bg-violet-200/60 text-violet-900'
                            : 'bg-violet-500/20 text-violet-200'),
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
                          <UserAvatarWithFrame
                            src={railAvatarSrc}
                            frameId={avatarFrameId}
                            className="size-[72px]"
                            imgClassName="ring-1 ring-black/5 dark:ring-white/10"
                          />
                        </button>
                      )}
                    </TooltipTrigger>
                    <TooltipContent side="right">{inCourseContext ? railTooltip : '选择头像'}</TooltipContent>
                  </Tooltip>
                  <p
                    className={cn(
                      'mt-2 w-full truncate text-center text-sm font-medium',
                      onLightRail ? 'text-slate-900' : 'text-zinc-100',
                    )}
                  >
                    {railTitle}
                  </p>
                  <div className="mt-2 grid w-full gap-2">
                    {balances != null ? (
                      <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                        <div
                          className={cn(
                            'rounded-xl border px-2 py-2 text-center',
                            onLightRail
                              ? 'border-amber-200/90 bg-amber-50 text-amber-950'
                              : 'border-amber-400/25 bg-amber-500/10 text-amber-100',
                          )}
                        >
                          <div className="flex items-center justify-center">
                            <Wallet className="size-3" />
                          </div>
                          <div className="mt-1 font-semibold leading-none">{balances.cash}</div>
                        </div>
                        <div
                          className={cn(
                            'rounded-xl border px-2 py-2 text-center',
                            onLightRail
                              ? 'border-sky-200/90 bg-sky-50 text-sky-950'
                              : 'border-sky-400/25 bg-sky-500/10 text-sky-100',
                          )}
                        >
                          <div className="flex items-center justify-center">
                            <Cpu className="size-3" />
                          </div>
                          <div className="mt-1 font-semibold leading-none">{balances.compute}</div>
                        </div>
                        <div
                          className={cn(
                            'rounded-xl border px-2 py-2 text-center',
                            onLightRail
                              ? 'border-emerald-200/90 bg-emerald-50 text-emerald-950'
                              : 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100',
                          )}
                        >
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
                          <UserAvatarWithFrame
                            src={railAvatarSrc}
                            frameId={avatarFrameId}
                            className="size-10"
                            imgClassName="ring-1 ring-black/5 dark:ring-white/10"
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
                          'inline-flex size-8 items-center justify-center rounded-full border transition-colors',
                          onLightRail
                            ? 'border-slate-200/90 bg-white/50 text-slate-600 hover:bg-white/80'
                            : 'border-white/12 bg-white/8 text-zinc-300 hover:bg-white/12',
                          notificationsActive &&
                            (onLightRail
                              ? 'border-violet-300/60 bg-violet-100/80 text-violet-800'
                              : 'border-violet-400/50 bg-violet-500/20 text-violet-200'),
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
                          className={cn(
                            'inline-flex size-8 items-center justify-center rounded-full border transition-colors',
                            onLightRail
                              ? 'border-slate-200/90 bg-white/50 text-slate-600 hover:bg-white/80'
                              : 'border-white/12 bg-white/8 text-zinc-300 hover:bg-white/12',
                          )}
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
              <div
                className={cn('w-full shrink-0', collapsed ? 'px-2 pt-2' : 'px-4 pt-3')}
                role="presentation"
                aria-hidden
              >
                <div className={cn('h-px w-full', railDividers.headerRule)} />
              </div>
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
              <div className={cn(leftRailScrollClass, 'min-h-0 flex-1 px-0')}>
                <Suspense
                  fallback={
                    <div
                      className={cn(
                        'px-3 py-8 text-center text-xs',
                        onLightRail ? 'text-slate-500' : 'text-zinc-500',
                      )}
                    >
                      加载联系人…
                    </div>
                  }
                >
                  <ChatContactsRail
                    courseId={courseId}
                    collapsed={collapsed}
                    courseName={courseName}
                    courseAvatarUrl={resolvedCourseAvatar}
                    lightSolidSurface={onLightRail}
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
              <div
                className={cn(
                  leftRailScrollClass,
                  'px-0',
                  'pt-6',
                )}
              >
                <AppCoreNavList
                  blackSurface={!onLightRail}
                  collapsed={collapsed}
                  variant={notebookSidebar ? 'notebook' : 'home'}
                  layout={notebookSidebar ? 'sectioned-list' : 'flat-grid'}
                  excludeKeys={
                    notebookSidebar ? ['contact-support', 'report-issue'] : undefined
                  }
                  onItemClick={(key) => {
                    if (key === 'chat') expandIfCollapsed();
                  }}
                />
              </div>
            </nav>
          )}

          <div className={cn('shrink-0', railDividers.t)}>
            {!collapsed ? (
              <div className="px-3 py-3">
                <div className="flex items-center gap-0.5">
                  <div className="mr-auto min-w-0 flex-1 pl-1">
                    {!inCourseContext && userAffinityLevel != null ? (
                      <p
                        className={cn(
                          'text-[11px]',
                          onLightRail ? 'text-slate-500' : 'text-zinc-500',
                        )}
                      >
                        {`Lv.${userAffinityLevel}`}
                      </p>
                    ) : null}
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() =>
                          setTheme(resolvedTheme === 'light' ? 'dark' : 'light')
                        }
                        className={cn(
                          'flex size-9 shrink-0 items-center justify-center rounded-[10px] shadow-none',
                          railIconPadBtn,
                        )}
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
                            'flex size-9 shrink-0 items-center justify-center rounded-[10px] shadow-none',
                            railIconPadBtn,
                            settingsActive &&
                              (onLightRail
                                ? 'bg-violet-200/50 text-violet-900'
                                : 'bg-violet-500/20 text-violet-200'),
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
                        className={cn(
                          'flex size-9 shrink-0 items-center justify-center rounded-[10px] shadow-none',
                          onLightRail
                            ? 'text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-600'
                            : 'text-zinc-400 transition-colors hover:bg-red-500/15 hover:text-red-400',
                        )}
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
                      className={cn(
                        'flex size-10 items-center justify-center rounded-[10px] shadow-none',
                        railIconPadBtn,
                      )}
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
                          'flex size-10 items-center justify-center rounded-[10px] shadow-none',
                          railIconPadBtn,
                          settingsActive &&
                            (onLightRail
                              ? 'bg-violet-200/50 text-violet-900'
                              : 'bg-violet-500/20 text-violet-200'),
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
                      className={cn(
                        'flex size-10 items-center justify-center rounded-[10px] shadow-none',
                        onLightRail
                          ? 'text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-600'
                          : 'text-zinc-400 transition-colors hover:bg-red-500/15 hover:text-red-400',
                      )}
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
