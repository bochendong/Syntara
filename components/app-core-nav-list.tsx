'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, BookOpen, MessageCircle, ShoppingBag, UsersRound } from 'lucide-react';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

function navItemClass(collapsed: boolean, active: boolean) {
  return cn(
    'flex min-h-11 w-full items-center gap-3 rounded-[12px] py-2.5 text-left text-sm transition-all duration-[250ms] ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
    collapsed ? 'justify-center px-2' : 'px-3',
    active
      ? 'bg-[rgba(0,122,255,0.1)] font-medium text-[#007AFF] dark:bg-[rgba(10,132,255,0.15)] dark:text-[#0A84FF]'
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

export interface AppCoreNavListProps {
  collapsed: boolean;
  /** 收起时 Tooltip 弹出方向；左侧栏用 right，右侧栏用 left */
  tooltipSide?: 'left' | 'right';
  /** 点击某项时（在导航之前调用），例如聊天页左侧栏点击「聊天」时展开侧栏 */
  onItemClick?: (key: string) => void;
}

/**
 * 课程主页 / 商城 / Agent teams / 聊天 / 通知 等核心入口，与左侧栏逻辑一致。
 */
export function AppCoreNavList({
  collapsed,
  tooltipSide = 'right',
  onItemClick,
}: AppCoreNavListProps) {
  const pathname = usePathname();
  const courseId = useCurrentCourseStore((s) => s.id);

  const inCourseContext = Boolean(courseId);
  const isChatPage = pathname === '/chat' || pathname?.startsWith('/chat/');

  const agentTeamsHref = courseId
    ? `/course/${encodeURIComponent(courseId)}`
    : '/agent-teams';
  const agentTeamsActive = courseId
    ? pathname === `/course/${courseId}`
    : pathname === '/agent-teams' || pathname?.startsWith('/agent-teams/');

  const storeHref = inCourseContext ? '/store' : '/store/courses';
  const storeActive = inCourseContext
    ? pathname === '/store'
    : pathname === '/store/courses' || pathname?.startsWith('/store/courses/');
  const storeLabel = inCourseContext ? '笔记本商城' : '商城';

  const coreNavItems: CoreNavItem[] = [
    {
      key: 'courses',
      href: '/my-courses',
      label: '课程主页',
      icon: BookOpen,
      active: pathname === '/my-courses',
    },
    {
      key: 'store',
      href: storeHref,
      label: storeLabel,
      tooltip: inCourseContext ? '笔记本商城' : '课程商城',
      icon: ShoppingBag,
      active: storeActive,
    },
    ...(inCourseContext
      ? ([
          {
            key: 'agent-teams',
            href: agentTeamsHref,
            label: 'Agent teams',
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
          {
            key: 'notifications',
            href: '/notifications',
            label: '通知',
            icon: Bell,
            active: pathname === '/notifications' || pathname?.startsWith('/notifications/'),
          },
        ] satisfies CoreNavItem[])
      : []),
  ];

  return (
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
                  onClick={() => onItemClick?.(item.key)}
                >
                  <Icon className="size-[18px] shrink-0 opacity-80" strokeWidth={1.75} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              </TooltipTrigger>
              {collapsed && (
                <TooltipContent side={tooltipSide}>{item.tooltip ?? item.label}</TooltipContent>
              )}
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}
