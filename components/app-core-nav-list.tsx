'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  BookOpen,
  Coins,
  MessageCircle,
  Settings,
  ShoppingBag,
  Sparkles,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { useNotificationStore } from '@/lib/store/notifications';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { isDashboardRoute } from '@/lib/utils/dashboard-routes';

function navItemClass(collapsed: boolean, active: boolean, variant: 'home' | 'notebook') {
  return cn(
    'flex min-h-11 w-full items-center gap-3 rounded-[12px] py-2.5 text-left text-sm transition-all duration-[250ms] ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
    collapsed ? 'justify-center px-2' : 'px-3',
    active
      ? variant === 'notebook'
        ? 'bg-[linear-gradient(135deg,rgba(76,110,245,0.16),rgba(14,165,233,0.12))] font-medium text-[#3155D4] shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] dark:bg-[linear-gradient(135deg,rgba(99,102,241,0.24),rgba(59,130,246,0.18))] dark:text-sky-100'
        : 'bg-[rgba(0,122,255,0.1)] font-medium text-[#007AFF] dark:bg-[rgba(10,132,255,0.15)] dark:text-[#0A84FF]'
      : variant === 'notebook'
        ? 'font-normal text-slate-700/90 dark:text-white/78 hover:bg-slate-900/[0.05] hover:translate-x-0.5 dark:hover:bg-white/[0.07]'
        : 'font-normal text-[#1d1d1f]/80 dark:text-white/75 hover:bg-black/[0.04] hover:translate-x-0.5 dark:hover:bg-white/[0.06]',
  );
}

type CoreNavItem = {
  key: string;
  href: string;
  label: string;
  tooltip?: string;
  icon: typeof BookOpen;
  active: boolean;
};

type CoreNavSection = {
  key: string;
  label: string;
  items: CoreNavItem[];
};

/** 聊天右侧栏扁平列表：课程主页 → Dashboard → 商城，其余项按此表随后 */
const CHAT_RIGHT_RAIL_KEY_ORDER: Record<string, number> = {
  'agent-teams': 0,
  courses: 1,
  'top-up': 2,
  store: 3,
  chat: 4,
  notifications: 5,
  live2d: 6,
  profile: 7,
  settings: 8,
};

function sortChatRightRailItems(items: CoreNavItem[]): CoreNavItem[] {
  return [...items]
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const oa = CHAT_RIGHT_RAIL_KEY_ORDER[a.item.key] ?? 100;
      const ob = CHAT_RIGHT_RAIL_KEY_ORDER[b.item.key] ?? 100;
      if (oa !== ob) return oa - ob;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

export interface AppCoreNavListProps {
  collapsed: boolean;
  variant?: 'home' | 'notebook';
  /** 收起时 Tooltip 弹出方向；左侧栏用 right，右侧栏用 left */
  tooltipSide?: 'left' | 'right';
  /** 点击某项时（在导航之前调用），例如聊天页左侧栏点击「聊天」时展开侧栏 */
  onItemClick?: (key: string) => void;
  /** 为 false 时不展示分组标题与分组卡片，仅一条连续列表（如聊天右侧栏） */
  grouped?: boolean;
  /** 与 grouped=false 联用：聊天右侧栏将入口排为 课程主页 → Dashboard → 商城 → … */
  chatRightRailOrder?: boolean;
  /** 按 item.key 排除入口（例如右侧栏不展示充值、商城） */
  excludeKeys?: string[];
}

/**
 * Dashboard（/my-courses）/ 商城 / 课程主页（课程内）/ 聊天 / 通知 等核心入口，与左侧栏逻辑一致。
 */
export function AppCoreNavList({
  collapsed,
  variant = 'home',
  tooltipSide = 'right',
  onItemClick,
  grouped = true,
  chatRightRailOrder = false,
  excludeKeys,
}: AppCoreNavListProps) {
  const pathname = usePathname();
  const courseId = useCurrentCourseStore((s) => s.id);
  const unreadNotificationCount = useNotificationStore((s) => s.unreadCount);

  const inCourseContext = Boolean(courseId);
  const isChatPage = pathname === '/chat' || pathname?.startsWith('/chat/');

  const agentTeamsHref = courseId ? `/course/${encodeURIComponent(courseId)}` : '/agent-teams';
  const agentTeamsActive = courseId
    ? pathname === `/course/${courseId}`
    : pathname === '/agent-teams' || pathname?.startsWith('/agent-teams/');

  const storeHref = inCourseContext ? '/store' : '/store/courses';
  const storeActive = inCourseContext
    ? pathname === '/store'
    : pathname === '/store/courses' || pathname?.startsWith('/store/courses/');
  const storeLabel = inCourseContext ? '笔记本商城' : '课程商城';

  const live2dActive = pathname === '/live2d' || pathname?.startsWith('/live2d/');
  const topUpActive = pathname === '/top-up' || pathname?.startsWith('/top-up/');
  const profileActive = pathname === '/profile' || pathname?.startsWith('/profile/');
  const settingsActive = pathname === '/settings' || pathname?.startsWith('/settings/');
  const notificationsActive =
    pathname === '/notifications' || pathname?.startsWith('/notifications/');

  const courseStoreActive =
    pathname === '/store/courses' || pathname?.startsWith('/store/courses/');

  /** Dashboard 壳层：固定入口，课程商城始终链到 `/store/courses`，并始终显示「个人中心」 */
  const dashboardNavSections: CoreNavSection[] = [
    {
      key: 'workspace',
      label: '开始使用',
      items: [
        {
          key: 'courses',
          href: '/my-courses',
          label: 'Dashboard',
          tooltip: 'Dashboard',
          icon: BookOpen,
          active: pathname === '/my-courses',
        },
        {
          key: 'top-up',
          href: '/top-up',
          label: '充值',
          tooltip: '充值中心',
          icon: Coins,
          active: topUpActive,
        },
        {
          key: 'store',
          href: '/store/courses',
          label: '课程商城',
          tooltip: '课程商城',
          icon: ShoppingBag,
          active: courseStoreActive,
        },
        {
          key: 'live2d',
          href: '/live2d',
          label: '虚拟讲师',
          tooltip: '选择虚拟讲师形象',
          icon: Sparkles,
          active: live2dActive,
        },
      ],
    },
    {
      key: 'personal',
      label: '个人与系统',
      items: [
        {
          key: 'profile',
          href: '/profile',
          label: '个人中心',
          tooltip: '个人中心',
          icon: UserRound,
          active: profileActive,
        },
        {
          key: 'notifications',
          href: '/notifications',
          label: '通知',
          tooltip: '通知',
          icon: Bell,
          active: notificationsActive,
        },
        {
          key: 'settings',
          href: '/settings',
          label: '设置',
          tooltip: '设置',
          icon: Settings,
          active: settingsActive,
        },
      ],
    },
  ];

  const coreNavSections: CoreNavSection[] = isDashboardRoute(pathname)
    ? dashboardNavSections
    : [
        {
          key: 'workspace',
          label: inCourseContext ? '当前工作区' : '开始使用',
          items: [
            {
              key: 'courses',
              href: '/my-courses',
              label: 'Dashboard',
              tooltip: 'Dashboard',
              icon: BookOpen,
              active: pathname === '/my-courses',
            },
            {
              key: 'top-up',
              href: '/top-up',
              label: '充值',
              tooltip: '充值中心',
              icon: Coins,
              active: topUpActive,
            },
            {
              key: 'store',
              href: storeHref,
              label: storeLabel,
              tooltip: inCourseContext ? '笔记本商城' : '课程商城',
              icon: ShoppingBag,
              active: storeActive,
            },
            /** 进入某门课程后隐藏：讲师形象在课堂内调整即可，避免侧栏过长 */
            ...(!inCourseContext
              ? ([
                  {
                    key: 'live2d',
                    href: '/live2d',
                    label: '虚拟讲师',
                    tooltip: '选择虚拟讲师形象',
                    icon: Sparkles,
                    active: live2dActive,
                  },
                ] satisfies CoreNavItem[])
              : []),
          ],
        },
        {
          key: 'course-tools',
          label: inCourseContext ? '课程内协作' : '消息与提醒',
          items: [
            ...(inCourseContext
              ? [
                  {
                    key: 'agent-teams',
                    href: agentTeamsHref,
                    label: '课程主页',
                    tooltip: '课程主页',
                    icon: UsersRound,
                    active: agentTeamsActive,
                  },
                  ...(isChatPage
                    ? []
                    : ([
                        {
                          key: 'chat',
                          href: '/chat',
                          label: '聊天',
                          icon: MessageCircle,
                          active: false,
                        },
                      ] satisfies CoreNavItem[])),
                ]
              : []),
            {
              key: 'notifications',
              href: '/notifications',
              label: '通知',
              tooltip: '通知',
              icon: Bell,
              active: notificationsActive,
            },
          ],
        },
      ].filter((section) => section.items.length > 0);

  const renderItem = (item: CoreNavItem) => {
    const Icon = item.icon;
    const isNotificationsItem = item.key === 'notifications';
    const showUnreadBadge = isNotificationsItem && unreadNotificationCount > 0;
    const unreadLabel = unreadNotificationCount > 99 ? '99+' : String(unreadNotificationCount);

    return (
      <li key={item.key}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href={item.href}
              className={navItemClass(collapsed, item.active, variant)}
              aria-current={item.active ? 'page' : undefined}
              onClick={() => onItemClick?.(item.key)}
            >
              <span className="relative shrink-0">
                <Icon className="size-[18px] shrink-0 opacity-80" strokeWidth={1.75} />
                {showUnreadBadge ? (
                  <span className="absolute -right-2 -top-2 inline-flex min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-4 text-white shadow-[0_6px_16px_rgba(244,63,94,0.38)]">
                    {collapsed
                      ? unreadNotificationCount > 9
                        ? '9+'
                        : unreadNotificationCount
                      : unreadLabel}
                  </span>
                ) : null}
              </span>
              {!collapsed && <span className="truncate">{item.label}</span>}
              {!collapsed && showUnreadBadge ? (
                <span className="ml-auto inline-flex min-w-[22px] items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                  {unreadLabel}
                </span>
              ) : null}
            </Link>
          </TooltipTrigger>
          {collapsed && (
            <TooltipContent side={tooltipSide}>
              {showUnreadBadge
                ? `${item.tooltip ?? item.label} · ${unreadNotificationCount} 条未读`
                : (item.tooltip ?? item.label)}
            </TooltipContent>
          )}
        </Tooltip>
      </li>
    );
  };

  if (!grouped) {
    const rawFlat = coreNavSections.flatMap((s) => s.items);
    const ordered = chatRightRailOrder ? sortChatRightRailItems(rawFlat) : rawFlat;
    const omit = excludeKeys?.length ? new Set(excludeKeys) : null;
    const flatItems = omit ? ordered.filter((item) => !omit.has(item.key)) : ordered;
    return (
      <div className="flex flex-col p-0">
        <ul className="flex flex-col gap-0.5 p-0">{flatItems.map(renderItem)}</ul>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-0">
      {coreNavSections.map((section, sectionIndex) => (
        <div
          key={section.key}
          className={cn(
            'flex flex-col',
            !collapsed &&
              'rounded-[16px] border border-black/[0.04] bg-black/[0.02] px-2 py-2 dark:border-white/[0.06] dark:bg-white/[0.03]',
            collapsed && sectionIndex > 0 && 'pt-1.5',
          )}
        >
          {!collapsed ? (
            <div className="px-2 pb-1.5 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/90">
              {section.label}
            </div>
          ) : null}
          <ul className="flex flex-col gap-0.5 p-0">{section.items.map(renderItem)}</ul>
        </div>
      ))}
    </div>
  );
}
