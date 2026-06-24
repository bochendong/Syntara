'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell,
  Bug,
  ChevronLeft,
  ChevronRight,
  Coins,
  Cpu,
  LifeBuoy,
  LogOut,
  Moon,
  Plus,
  Search,
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
import {
  subscribeCreditsBalancesChanged,
  type CreditsBalances,
} from '@/lib/utils/credits-balance-events';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AppCoreNavList } from '@/components/app-core-nav-list';
import { CreateCourseDialog } from '@/components/courses/create-course-dialog';
import { resolveCourseOrchestratorAvatar } from '@/lib/constants/course-chat';
import { isDashboardRoute } from '@/lib/utils/dashboard-routes';
import { UserAvatarWithFrame } from '@/components/user-profile/user-avatar-with-frame';
import { isSolidColorBarStageId } from '@/lib/notifications/notification-bar-stage-ids';
import { CONTACT_SUPPORT_NAV_URL, REPORT_ISSUE_NAV_URL } from '@/lib/constants/support-nav';

const ChatContactsRail = lazy(() =>
  import('@/components/chat-contacts-rail').then((mod) => ({ default: mod.ChatContactsRail })),
);
const NotificationBarStageBackground = lazy(() =>
  import('@/components/notifications/notification-bar-stage-background').then((mod) => ({
    default: mod.NotificationBarStageBackground,
  })),
);

function leftRailScrollClass(lightSurface: boolean) {
  return cn(
    'min-h-0 flex-1 overflow-y-auto pt-2 pb-3',
    '[&::-webkit-scrollbar]:w-[5px] [&::-webkit-scrollbar-track]:bg-transparent',
    '[&::-webkit-scrollbar-thumb]:rounded-full',
    lightSurface
      ? '[&::-webkit-scrollbar-thumb]:bg-slate-900/15 hover:[&::-webkit-scrollbar-thumb]:bg-slate-900/25'
      : '[&::-webkit-scrollbar-thumb]:bg-white/20 hover:[&::-webkit-scrollbar-thumb]:bg-white/30',
  );
}

export interface AppLeftRailProps {
  collapsed: boolean;
  hasGlobalHeader?: boolean;
  hideBelowLg?: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

/** 进入这些路由时清空「当前课程」。侧栏「商城」：未选课程 → `/store/courses`（课程商城）；已选课程 → `/store`（笔记本商城） */
const COURSE_CONTEXT_CLEAR_PREFIXES = [
  '/my-courses',
  '/store/courses',
  '/store/avatars',
  '/profile',
  '/settings',
  '/live2d',
  '/login',
  '/courses/new',
  '/notifications',
] as const;

function formatRailCreditAmount(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString('en-US');
}

const CHAT_CONTACT_SCROLL_THUMB_RATIO = 0.13;
const CHAT_CONTACT_SCROLL_THUMB_MIN_PX = 32;

export function AppLeftRail({
  collapsed,
  hasGlobalHeader = true,
  hideBelowLg = false,
  onCollapsedChange,
}: AppLeftRailProps) {
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

  const notificationsActive =
    pathname === '/notifications' || pathname?.startsWith('/notifications/');
  const newCourseActive = pathname === '/courses/new' || pathname?.startsWith('/courses/new/');
  const unreadNotificationCount = useNotificationStore((s) => s.unreadCount);
  const unreadNotificationLabel =
    unreadNotificationCount > 99 ? '99+' : String(unreadNotificationCount);

  const inCourseContext = Boolean(courseId);
  /** 与 `isDashboardRoute` 对齐：Dashboard 壳层用浅色玻璃与固定五项导航；课程/课堂/笔记本商城等为 Notebook 工作区 */
  const notebookSidebar = !isDashboardRoute(pathname, courseId);
  const resolvedCourseAvatar = resolveCourseOrchestratorAvatar(courseId, courseAvatarUrl);
  const railAvatarSrc = inCourseContext ? resolvedCourseAvatar : avatar;
  const railTitle = inCourseContext ? courseName : displayName;
  const railHref = inCourseContext ? `/course/${courseId}` : '/profile';
  const railTooltip = inCourseContext ? '所有课程' : '个人中心';
  /** 聊天页也跟随全局主题，避免左侧联系人栏和聊天主体割裂。 */
  const isChatPage = pathname === '/chat' || pathname?.startsWith('/chat/');
  /** 非「默认」时在主导航上叠动效；课程区与 Dashboard（如 /profile）均生效，避免在设置页点击无反馈 */
  const showLeftRailStage = leftRailBarStageId !== 'default';
  /** 平铺底色：外层不用黑底，避免与淡色实色叠出灰黑；WebGL 动效仍用黑底衬底+蒙版 */
  const isLeftRailSolidColor = showLeftRailStage && isSolidColorBarStageId(leftRailBarStageId);
  /** 浅色主题下使用浅色玻璃侧栏；动效/纯色仍优先尊重用户选择。 */
  const onDefaultWhite = !showLeftRailStage && resolvedTheme === 'light';
  const onLightRail =
    resolvedTheme === 'light' &&
    (!showLeftRailStage || (isLeftRailSolidColor && leftRailBarStageId !== 'solid-black'));
  /** 外框 + 头/底分割：随白底、淡实色、深/WebGL 四档略作区分，避免各背景下对比失当 */
  const railDividers = (() => {
    if (onDefaultWhite) {
      return {
        edge: 'border-muted/40',
        b: 'border-b border-border/60',
        t: 'border-t border-border/60',
        headerRule: 'bg-border/60',
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
    'flex h-full flex-col overflow-hidden rounded-[20px]',
    showLeftRailStage
      ? cn(
          isChatPage ? 'border border-transparent' : 'border',
          isLeftRailSolidColor
            ? cn(
                'bg-transparent',
                onLightRail
                  ? 'shadow-[0_12px_40px_rgba(15,23,42,0.1)]'
                  : 'shadow-[0_20px_50px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.04)_inset]',
              )
            : 'bg-[linear-gradient(180deg,rgba(16,16,20,0.78),rgba(5,5,5,0.78))] shadow-[0_20px_50px_rgba(0,0,0,0.35)]',
          railDividers.edge,
        )
      : cn('apple-glass-heavy', isChatPage ? 'app-left-rail-borderless' : 'app-left-rail-bordered'),
    'transition-[width,box-shadow,background,border-color] duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
  );
  const railIconPadBtn = onLightRail
    ? 'text-slate-500 transition-colors hover:bg-black/[0.05] hover:text-slate-900'
    : 'text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100';

  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [createCourseOpen, setCreateCourseOpen] = useState(false);
  const [userAffinityLevel, setUserAffinityLevel] = useState<number | null>(null);
  const [userCreditBalances, setUserCreditBalances] = useState<CreditsBalances | null>(null);
  const chatContactsScrollRef = useRef<HTMLDivElement | null>(null);
  const [chatContactsScrollThumb, setChatContactsScrollThumb] = useState({
    height: 0,
    top: 0,
    visible: false,
  });

  const loadRailAccountState = useCallback(
    async (shouldApply: () => boolean = () => true) => {
      if (!isLoggedIn) {
        setUserAffinityLevel(null);
        setUserCreditBalances(null);
        return;
      }

      const gamificationResult = await backendJson<{
        success: true;
        profile: {
          affinityLevel: number;
        };
        balances: CreditsBalances;
      }>('/api/gamification/summary').then(
        (value) => ({ status: 'fulfilled' as const, value }),
        () => ({ status: 'rejected' as const }),
      );

      if (!shouldApply()) return;

      if (gamificationResult.status === 'fulfilled') {
        setUserAffinityLevel(gamificationResult.value.profile.affinityLevel);
        setUserCreditBalances(gamificationResult.value.balances);
      } else {
        setUserAffinityLevel(null);
        setUserCreditBalances(null);
      }
    },
    [isLoggedIn],
  );

  const railAccountLine = userAffinityLevel != null ? `成长等级 Lv.${userAffinityLevel}` : null;
  const railCreditItems = userCreditBalances
    ? [
        {
          key: 'cash',
          label: '现金',
          value: userCreditBalances.cash,
          title: formatCashCreditsLabel(userCreditBalances.cash),
          Icon: Wallet,
          accentClass: 'text-emerald-500',
        },
        {
          key: 'compute',
          label: '算力',
          value: userCreditBalances.compute,
          title: formatComputeCreditsLabel(userCreditBalances.compute),
          Icon: Cpu,
          accentClass: 'text-sky-500',
        },
        {
          key: 'purchase',
          label: '购买',
          value: userCreditBalances.purchase,
          title: formatPurchaseCreditsLabel(userCreditBalances.purchase),
          Icon: Coins,
          accentClass: 'text-amber-500',
        },
      ]
    : [];

  const syncChatContactsScrollThumb = useCallback(() => {
    const el = chatContactsScrollRef.current;
    if (!isChatPage || collapsed || !el || el.scrollHeight <= el.clientHeight + 1) {
      setChatContactsScrollThumb((prev) =>
        prev.visible ? { height: 0, top: 0, visible: false } : prev,
      );
      return;
    }

    const trackHeight = el.clientHeight;
    const height = Math.min(
      trackHeight,
      Math.max(CHAT_CONTACT_SCROLL_THUMB_MIN_PX, trackHeight * CHAT_CONTACT_SCROLL_THUMB_RATIO),
    );
    const maxScrollTop = el.scrollHeight - el.clientHeight;
    const maxThumbTop = Math.max(0, trackHeight - height);
    const top = maxScrollTop > 0 ? (el.scrollTop / maxScrollTop) * maxThumbTop : 0;

    setChatContactsScrollThumb((prev) => {
      if (prev.visible && Math.abs(prev.height - height) < 0.5 && Math.abs(prev.top - top) < 0.5) {
        return prev;
      }
      return { height, top, visible: true };
    });
  }, [collapsed, isChatPage]);

  useEffect(() => {
    if (!isChatPage) {
      return;
    }

    const sync = () => syncChatContactsScrollThumb();
    sync();
    const frame = window.requestAnimationFrame(sync);
    const timers = [
      window.setTimeout(sync, 250),
      window.setTimeout(sync, 1000),
      window.setTimeout(sync, 3000),
    ];
    const el = chatContactsScrollRef.current;
    const observer = typeof ResizeObserver === 'undefined' || !el ? null : new ResizeObserver(sync);
    if (observer && el) {
      observer.observe(el);
      if (el.firstElementChild) observer.observe(el.firstElementChild);
    }
    window.addEventListener('resize', sync);
    return () => {
      window.cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
      observer?.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, [isChatPage, syncChatContactsScrollThumb]);

  useEffect(() => {
    if (!pathname) return;
    const shouldClear = COURSE_CONTEXT_CLEAR_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
    if (shouldClear) clearCurrentCourse();
  }, [pathname, clearCurrentCourse]);

  useEffect(() => {
    let active = true;
    const timeoutId = window.setTimeout(() => {
      void loadRailAccountState(() => active);
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [loadRailAccountState]);

  useEffect(() => {
    if (!isLoggedIn) return;
    return subscribeCreditsBalancesChanged((balances) => {
      if (balances) {
        setUserCreditBalances(balances);
        return;
      }
      void loadRailAccountState();
    });
  }, [isLoggedIn, loadRailAccountState]);

  const expandIfCollapsed = () => {
    if (collapsed) onCollapsedChange(false);
  };

  const openCreateCourseDialog = () => {
    if (!isLoggedIn) {
      router.push('/login');
      return;
    }
    setCreateCourseOpen(true);
  };

  return (
    <>
      <aside
        className={cn(
          'pointer-events-none fixed left-4 z-[1300] overflow-hidden rounded-[20px]',
          hideBelowLg && 'hidden lg:block',
          hasGlobalHeader ? 'top-[76px] h-[calc(100dvh-92px)]' : 'top-4 h-[calc(100dvh-2rem)]',
          collapsed ? 'w-[78px]' : 'w-[min(280px,calc(100vw-2rem))]',
        )}
        aria-label="主导航"
      >
        <div className={cn('pointer-events-auto relative h-full', railSurfaceClass)}>
          {showLeftRailStage ? (
            <div
              className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[20px]"
              aria-hidden
            >
              <Suspense fallback={null}>
                <NotificationBarStageBackground
                  id={leftRailBarStageId}
                  className={cn(
                    '!min-h-full',
                    isLeftRailSolidColor
                      ? 'opacity-100'
                      : 'opacity-[0.62] [mask-image:linear-gradient(180deg,black_0%,black_88%,transparent_100%)]',
                  )}
                />
              </Suspense>
            </div>
          ) : null}
          <div
            className={cn(
              'relative z-[1] flex h-full min-h-0 flex-col',
              onLightRail ? 'text-slate-800' : 'text-zinc-200',
            )}
          >
            <div
              className={cn(
                'relative flex shrink-0 flex-col',
                collapsed
                  ? 'items-center px-2 py-3'
                  : isChatPage
                    ? 'items-stretch px-3 pb-0 pt-0'
                    : 'items-stretch px-3 pb-0 pt-3',
              )}
            >
              {collapsed ? (
                <button
                  type="button"
                  onClick={() => onCollapsedChange(false)}
                  className={cn(
                    'mb-2 flex size-8 items-center justify-center rounded-[10px] border-0 bg-transparent shadow-none',
                    railIconPadBtn,
                  )}
                  aria-label="展开侧栏"
                >
                  <ChevronRight className="size-4" strokeWidth={1.75} />
                </button>
              ) : null}

              {!collapsed && !isChatPage && (
                <div
                  className={cn(
                    'relative w-full rounded-[18px] border p-3 shadow-sm backdrop-blur-md',
                    onLightRail
                      ? 'border-border/60 bg-card/70 shadow-slate-950/[0.035]'
                      : 'border-white/10 bg-white/[0.055] shadow-black/15',
                  )}
                >
                  <div className="absolute right-2 top-2 z-20 flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => onCollapsedChange(true)}
                          className={cn(
                            'inline-flex size-8 items-center justify-center rounded-[10px]',
                            onLightRail
                              ? 'text-slate-500 transition-colors hover:bg-black/[0.05] hover:text-slate-900'
                              : 'text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100',
                          )}
                          aria-label="收起侧栏"
                        >
                          <ChevronLeft className="size-[17px]" strokeWidth={1.75} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right">收起侧栏</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          href="/notifications"
                          className={cn(
                            'inline-flex size-8 items-center justify-center rounded-[10px]',
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
                  </div>

                  <div className="flex min-w-0 items-center gap-3 pr-[4.75rem]">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        {inCourseContext ? (
                          <Link
                            href={railHref}
                            className="block shrink-0 rounded-2xl outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-violet-500"
                          >
                            <img
                              src={railAvatarSrc}
                              alt=""
                              className="size-12 rounded-2xl object-cover ring-1 ring-black/5 dark:ring-white/10"
                            />
                          </Link>
                        ) : (
                          <Link
                            href={railHref}
                            className="block shrink-0 rounded-full outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-violet-500"
                            aria-label={`打开个人中心：${displayName}`}
                          >
                            <UserAvatarWithFrame
                              src={railAvatarSrc}
                              frameId={avatarFrameId}
                              className="size-12"
                              imgClassName="ring-1 ring-black/5 dark:ring-white/10"
                            />
                          </Link>
                        )}
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        {railTooltip}
                      </TooltipContent>
                    </Tooltip>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          'truncate text-[15px] font-semibold leading-5',
                          onLightRail ? 'text-slate-950' : 'text-zinc-50',
                        )}
                      >
                        {railTitle}
                      </p>
                      {inCourseContext ? (
                        <p
                          className={cn(
                            'mt-0.5 truncate text-[11px] leading-4',
                            onLightRail ? 'text-slate-500' : 'text-zinc-400',
                          )}
                        >
                          课程工作区
                        </p>
                      ) : railAccountLine ? (
                        <p
                          className={cn(
                            'mt-0.5 truncate text-[11px] leading-4',
                            onLightRail ? 'text-slate-500' : 'text-zinc-400',
                          )}
                        >
                          {railAccountLine}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {railCreditItems.length > 0 ? (
                    <div className="mt-2 grid grid-cols-3 gap-1.5">
                      {railCreditItems.map(({ key, label, value, title, Icon, accentClass }) => (
                        <div
                          key={key}
                          className={cn(
                            'min-w-0 rounded-[10px] border px-1.5 py-1 text-center',
                            onLightRail
                              ? 'border-slate-200/80 bg-white/55 text-slate-600'
                              : 'border-white/10 bg-white/[0.075] text-zinc-300',
                          )}
                          title={title}
                          aria-label={title}
                        >
                          <span className="flex min-w-0 items-center justify-center gap-1">
                            <Icon className={cn('size-3 shrink-0', accentClass)} strokeWidth={2} />
                            <span className="truncate text-[10px] font-medium leading-3">
                              {label}
                            </span>
                          </span>
                          <span
                            className={cn(
                              'mt-0.5 block truncate text-[11px] font-semibold leading-3 tabular-nums',
                              onLightRail ? 'text-slate-950' : 'text-zinc-50',
                            )}
                          >
                            {formatRailCreditAmount(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
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
                        <Link
                          href={railHref}
                          className="block w-fit rounded-full outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-violet-500"
                          aria-label={`打开个人中心：${displayName}`}
                        >
                          <UserAvatarWithFrame
                            src={railAvatarSrc}
                            frameId={avatarFrameId}
                            className="size-10"
                            imgClassName="ring-1 ring-black/5 dark:ring-white/10"
                          />
                        </Link>
                      )}
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {railTooltip}
                    </TooltipContent>
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
                </div>
              )}
              {!collapsed && isChatPage ? (
                <div className="flex h-14 items-center px-2">
                  <div className="relative w-full">
                    <Search
                      className={cn(
                        'pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2',
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
                        'h-9 rounded-full pl-8 text-sm',
                        onLightRail
                          ? 'border border-slate-200/80 bg-white/72 text-slate-900 placeholder:text-slate-400'
                          : 'border border-white/12 bg-white/5 text-zinc-100 placeholder:text-zinc-500',
                      )}
                    />
                  </div>
                </div>
              ) : null}
              <div
                className={cn(
                  'w-full shrink-0',
                  collapsed ? 'px-2 pt-2' : isChatPage ? 'px-4 pt-0' : 'px-4 pt-3',
                )}
                role="presentation"
                aria-hidden
              >
                <div className={cn('h-px w-full', railDividers.headerRule)} />
              </div>
            </div>

            {isChatPage ? (
              <nav
                className={cn(
                  'relative flex min-h-0 flex-1 flex-col overflow-hidden',
                  collapsed ? 'px-1.5' : 'px-2',
                )}
                aria-label="聊天联系人"
              >
                <div
                  ref={chatContactsScrollRef}
                  onScroll={syncChatContactsScrollThumb}
                  className={cn(
                    leftRailScrollClass(onLightRail),
                    'min-h-0 flex-1 px-0',
                    !collapsed &&
                      '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                  )}
                >
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
                {chatContactsScrollThumb.visible ? (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute bottom-0 right-0 top-0 w-[5px]"
                  >
                    <div
                      className={cn(
                        'absolute left-0 top-0 w-[5px] rounded-full transition-[background-color,height,transform] duration-150',
                        onLightRail
                          ? 'bg-slate-900/18'
                          : 'bg-white/25 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]',
                      )}
                      style={{
                        height: `${chatContactsScrollThumb.height}px`,
                        transform: `translateY(${chatContactsScrollThumb.top}px)`,
                      }}
                    />
                  </div>
                ) : null}
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
                    leftRailScrollClass(onLightRail),
                    'px-0',
                    collapsed ? 'pt-3' : 'pt-4',
                  )}
                >
                  <AppCoreNavList
                    blackSurface={!onLightRail}
                    collapsed={collapsed}
                    variant={notebookSidebar ? 'notebook' : 'home'}
                    layout={notebookSidebar ? 'sectioned-list' : 'flat-grid'}
                    excludeKeys={['contact-support', 'report-issue', 'store', 'avatar-store']}
                    onItemClick={(key) => {
                      if (key === 'chat') expandIfCollapsed();
                    }}
                  />
                </div>
              </nav>
            )}

            {!isChatPage ? (
              <div className={cn('shrink-0', railDividers.t)}>
                {!collapsed ? (
                  <div className="px-3 py-3">
                    <button
                      type="button"
                      onClick={openCreateCourseDialog}
                      className={cn(
                        'mb-2 flex h-9 w-full items-center justify-center gap-2 rounded-[12px] border text-xs font-semibold transition-colors',
                        newCourseActive
                          ? onLightRail
                            ? 'border-sky-300/70 bg-sky-50 text-sky-700 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.2)]'
                            : 'border-sky-300/35 bg-sky-400/14 text-sky-100'
                          : onLightRail
                            ? 'border-slate-200/80 bg-white/55 text-slate-700 hover:border-sky-200 hover:bg-sky-50 hover:text-slate-950'
                            : 'border-white/10 bg-white/[0.065] text-zinc-200 hover:border-white/18 hover:bg-white/[0.1] hover:text-white',
                      )}
                    >
                      <Plus className="size-4" strokeWidth={1.9} />
                      <span>新建课程</span>
                    </button>
                    <div
                      className={cn(
                        'ml-auto flex w-fit items-center gap-0.5 rounded-full border p-1 backdrop-blur-md',
                        onLightRail
                          ? 'border-border/60 bg-card/70 shadow-sm shadow-slate-950/[0.03]'
                          : 'border-white/10 bg-white/[0.055] shadow-sm shadow-black/20',
                      )}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link
                            href={CONTACT_SUPPORT_NAV_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                              'flex size-8 shrink-0 items-center justify-center rounded-full shadow-none',
                              railIconPadBtn,
                            )}
                            aria-label="联系客服"
                          >
                            <LifeBuoy className="size-[17px]" strokeWidth={1.75} />
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right">联系客服</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link
                            href={REPORT_ISSUE_NAV_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                              'flex size-8 shrink-0 items-center justify-center rounded-full shadow-none',
                              railIconPadBtn,
                            )}
                            aria-label="报告问题"
                          >
                            <Bug className="size-[17px]" strokeWidth={1.75} />
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right">报告问题</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => setTheme(resolvedTheme === 'light' ? 'dark' : 'light')}
                            className={cn(
                              'flex size-8 shrink-0 items-center justify-center rounded-full shadow-none',
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
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() =>
                              isLoggedIn ? void signOutAndRedirect() : router.push('/login')
                            }
                            className={cn(
                              'flex size-8 shrink-0 items-center justify-center rounded-full shadow-none',
                              onLightRail
                                ? 'text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-600'
                                : 'text-zinc-400 transition-colors hover:bg-red-500/15 hover:text-red-400',
                            )}
                            aria-label={isLoggedIn ? '退出登录' : '登录'}
                          >
                            <LogOut className="size-[18px]" strokeWidth={1.75} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          {isLoggedIn ? '退出登录' : '登录'}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 px-2 py-3">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={openCreateCourseDialog}
                          className={cn(
                            'flex size-10 items-center justify-center rounded-[10px] shadow-none',
                            newCourseActive
                              ? onLightRail
                                ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-200'
                                : 'bg-sky-400/14 text-sky-100 ring-1 ring-sky-300/25'
                              : railIconPadBtn,
                          )}
                          aria-label="新建课程"
                        >
                          <Plus className="size-[18px]" strokeWidth={1.9} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right">新建课程</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          href={CONTACT_SUPPORT_NAV_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            'flex size-10 items-center justify-center rounded-[10px] shadow-none',
                            railIconPadBtn,
                          )}
                          aria-label="联系客服"
                        >
                          <LifeBuoy className="size-[18px]" strokeWidth={1.75} />
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right">联系客服</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          href={REPORT_ISSUE_NAV_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            'flex size-10 items-center justify-center rounded-[10px] shadow-none',
                            railIconPadBtn,
                          )}
                          aria-label="报告问题"
                        >
                          <Bug className="size-[18px]" strokeWidth={1.75} />
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right">报告问题</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setTheme(resolvedTheme === 'light' ? 'dark' : 'light')}
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
                      <TooltipContent side="right">
                        {isLoggedIn ? '退出登录' : '登录'}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </aside>
      <CreateCourseDialog
        open={createCourseOpen}
        onOpenChange={setCreateCourseOpen}
        onSuccess={() => router.refresh()}
      />
    </>
  );
}
