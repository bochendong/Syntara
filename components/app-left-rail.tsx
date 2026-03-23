'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import {
  Bell,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  LogOut,
  MessageCircle,
  NotebookPen,
  Settings,
  ShoppingBag,
  UsersRound,
} from 'lucide-react';
import { signOut } from 'next-auth/react';
import { useUserProfileStore } from '@/lib/store/user-profile';
import { useAuthStore } from '@/lib/store/auth';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ChatContactsRail } from '@/components/chat-contacts-rail';

/** 对齐 notebook-agent-sidebar `sidebarGlassStyles.js` */
const surfaceClass = cn(
  'flex h-full flex-col overflow-hidden border shadow-[0_20px_50px_rgba(0,0,0,0.18)]',
  'rounded-[20px] backdrop-blur-[18px] transition-[width,box-shadow] duration-300 ease-in-out',
  'border-slate-900/[0.08] bg-gradient-to-b from-white/[0.94] to-[#f6f9ff]/[0.88]',
  'dark:border-white/[0.08] dark:from-[#12151f]/90 dark:to-[#0b0d14]/[0.84]',
);

const scrollClass = cn(
  'min-h-0 flex-1 overflow-y-auto py-2',
  '[&::-webkit-scrollbar]:w-[5px] [&::-webkit-scrollbar-track]:bg-transparent',
  '[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-900/15',
  'dark:[&::-webkit-scrollbar-thumb]:bg-white/20',
  'hover:[&::-webkit-scrollbar-thumb]:bg-slate-900/25 dark:hover:[&::-webkit-scrollbar-thumb]:bg-white/30',
);

function navItemClass(collapsed: boolean, active: boolean) {
  return cn(
    'flex min-h-11 w-full items-center gap-3 rounded-[10px] py-2.5 text-left text-sm transition-all duration-200',
    collapsed ? 'justify-center px-2' : 'px-3',
    active
      ? 'bg-violet-600/14 font-medium text-foreground dark:bg-violet-400/[0.18]'
      : 'font-normal text-foreground/85 hover:-translate-y-px hover:bg-violet-600/[0.08] dark:hover:bg-white/[0.06]',
  );
}

export interface AppLeftRailProps {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

/** 商城需保留「当前课程」，以便将笔记本一键归入该课程 */
const COURSE_CONTEXT_CLEAR_PREFIXES = [
  '/my-courses',
  '/settings',
  '/login',
  '/courses/new',
  '/notifications',
] as const;

export function AppLeftRail({ collapsed, onCollapsedChange }: AppLeftRailProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();

  const avatar = useUserProfileStore((s) => s.avatar);
  const nickname = useUserProfileStore((s) => s.nickname);
  const authName = useAuthStore((s) => s.name);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const logout = useAuthStore((s) => s.logout);

  const courseId = useCurrentCourseStore((s) => s.id);
  const courseName = useCurrentCourseStore((s) => s.name);
  const courseAvatarUrl = useCurrentCourseStore((s) => s.avatarUrl);
  const clearCurrentCourse = useCurrentCourseStore((s) => s.clearCurrentCourse);

  const settingsActive = pathname === '/settings';

  const displayName =
    nickname.trim() || authName.trim() || t('profile.defaultNickname');

  const inCourseContext = Boolean(courseId);
  const railAvatarSrc = inCourseContext
    ? courseAvatarUrl || '/avatars/assist-2.png'
    : avatar;
  const railTitle = inCourseContext ? courseName : displayName;
  const railHref = inCourseContext ? `/course/${courseId}` : '/';
  const railTooltip = inCourseContext ? '课程主页' : '首页';

  const isChatPage = pathname === '/chat' || pathname?.startsWith('/chat/');

  useEffect(() => {
    if (!pathname) return;
    const shouldClear = COURSE_CONTEXT_CLEAR_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
    if (shouldClear) clearCurrentCourse();
  }, [pathname, clearCurrentCourse]);

  const handleLogout = async () => {
    await signOut({ redirect: false });
    logout();
    router.push('/login');
  };

  const createNotebookHref = courseId
    ? `/create?courseId=${encodeURIComponent(courseId)}`
    : '/create';

  /** 与「当前课程」一致：进入该课程空间，而非笔记本列表页 */
  const agentTeamsHref = courseId
    ? `/course/${encodeURIComponent(courseId)}`
    : '/agent-teams';
  const agentTeamsActive = courseId
    ? pathname === `/course/${courseId}`
    : pathname === '/agent-teams' || pathname?.startsWith('/agent-teams/');

  const chatActive = isChatPage;

  type CoreNavItem = {
    key: string;
    href: string;
    label: string;
    icon: typeof BookOpen;
    active: boolean;
  };

  const coreNavItems: CoreNavItem[] = [
    {
      key: 'courses',
      href: '/my-courses',
      label: '我的课程',
      icon: BookOpen,
      active: pathname === '/my-courses',
    },
    {
      key: 'store',
      href: '/store',
      label: '商城',
      icon: ShoppingBag,
      active: pathname === '/store',
    },
    {
      key: 'agent-teams',
      href: agentTeamsHref,
      label: 'AgentTeams',
      icon: UsersRound,
      active: agentTeamsActive,
    },
    {
      key: 'chat',
      href: '/chat',
      label: '聊天',
      icon: MessageCircle,
      active: chatActive,
    },
    {
      key: 'notifications',
      href: '/notifications',
      label: '通知',
      icon: Bell,
      active: pathname === '/notifications' || pathname?.startsWith('/notifications/'),
    },
  ];

  const createNavItem = {
    key: 'create',
    href: createNotebookHref,
    label: '创建笔记本',
    icon: NotebookPen,
    active: pathname === '/create',
  };

  const expandIfCollapsed = () => {
    if (collapsed) onCollapsedChange(false);
  };

  const renderCoreNavList = () => (
    <ul className="flex flex-col gap-0.5 p-0">
      {coreNavItems.map((item) => {
        const Icon = item.icon;
        return (
          <li key={item.key}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href={item.href}
                  className={navItemClass(collapsed, item.active)}
                  aria-current={item.active ? 'page' : undefined}
                  onClick={() => {
                    if (item.key === 'chat') expandIfCollapsed();
                  }}
                >
                  <Icon className="size-[18px] shrink-0 opacity-80" strokeWidth={1.75} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              </TooltipTrigger>
              {collapsed && <TooltipContent side="right">{item.label}</TooltipContent>}
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );

  const createNotebookBlock = (
    <div className="shrink-0 border-t border-slate-900/[0.08] pb-2 pt-2 dark:border-white/[0.08]">
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={createNavItem.href}
            className={cn(
              navItemClass(collapsed, createNavItem.active),
              'border border-slate-900/[0.12] dark:border-white/[0.1]',
            )}
            aria-current={createNavItem.active ? 'page' : undefined}
          >
            <NotebookPen className="size-[18px] shrink-0 opacity-80" strokeWidth={1.75} />
            {!collapsed && <span className="truncate">{createNavItem.label}</span>}
          </Link>
        </TooltipTrigger>
        {collapsed && <TooltipContent side="right">{createNavItem.label}</TooltipContent>}
      </Tooltip>
    </div>
  );

  return (
    <>
      <aside
        className={cn(
          'pointer-events-none fixed left-4 top-4 z-[1300] h-[calc(100dvh-2rem)]',
          collapsed ? 'w-[88px]' : 'w-[min(270px,calc(100vw-2rem))]',
        )}
        aria-label="主导航"
      >
        <div className={cn('pointer-events-auto h-full', surfaceClass)}>
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
              </>
            )}

            {collapsed && (
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
            )}
          </div>

          {isChatPage ? (
            <nav
              className={cn(
                'flex min-h-0 flex-1 flex-col overflow-hidden',
                collapsed ? 'px-1.5' : 'px-2',
              )}
              aria-label="聊天联系人"
            >
              <div className="shrink-0 border-b border-slate-900/[0.08] py-2 dark:border-white/[0.08]">
                {renderCoreNavList()}
              </div>
              <div className={cn(scrollClass, 'min-h-0 flex-1 px-0')}>
                <Suspense
                  fallback={
                    <div className="px-3 py-8 text-center text-xs text-muted-foreground">加载联系人…</div>
                  }
                >
                  <ChatContactsRail courseId={courseId} collapsed={collapsed} />
                </Suspense>
              </div>
              {createNotebookBlock}
            </nav>
          ) : (
            <nav
              className={cn(
                'flex min-h-0 flex-1 flex-col overflow-hidden',
                collapsed ? 'px-1.5' : 'px-2',
              )}
              aria-label="页面导航"
            >
              <div className={cn(scrollClass, 'px-0')}>{renderCoreNavList()}</div>
              {createNotebookBlock}
            </nav>
          )}

          <div className="shrink-0 border-t border-slate-900/[0.08] dark:border-white/[0.08]">
            {!collapsed ? (
              <div className="flex items-center gap-0.5 px-3 py-3">
                <div className="mr-auto min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-tight" title={displayName}>
                    {isLoggedIn ? displayName : 'OpenMAIC'}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {isLoggedIn ? '已登录' : '本地体验'}
                  </p>
                </div>
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => (isLoggedIn ? handleLogout() : router.push('/login'))}
                      className="flex size-9 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                      aria-label={isLoggedIn ? '退出登录' : '登录'}
                    >
                      <LogOut className="size-[18px]" strokeWidth={1.75} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{isLoggedIn ? '退出登录' : '登录'}</TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 px-2 py-3">
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => (isLoggedIn ? handleLogout() : router.push('/login'))}
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
