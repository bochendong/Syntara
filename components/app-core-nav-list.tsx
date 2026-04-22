'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowRightLeft,
  BookOpen,
  ListChecks,
  Bug,
  ChevronDown,
  ChevronRight,
  Coins,
  Flame,
  LifeBuoy,
  MessageCircle,
  Settings,
  ShoppingBag,
  Sparkles,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { isDashboardRoute } from '@/lib/utils/dashboard-routes';
import { CONTACT_SUPPORT_NAV_URL, REPORT_ISSUE_NAV_URL } from '@/lib/constants/support-nav';

function navItemClass(collapsed: boolean, active: boolean, variant: 'home' | 'notebook') {
  return cn(
    'flex min-h-10 w-full items-center gap-3 rounded-[12px] py-2 text-left text-xs transition-all duration-[250ms] ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
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
  /** 外链：新标签页打开 */
  external?: boolean;
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
  'credits-market': 3,
  gamification: 4,
  store: 5,
  'avatar-store': 6,
  chat: 7,
  live2d: 8,
  profile: 9,
  settings: 10,
  'contact-support': 11,
  'report-issue': 12,
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
 * Dashboard（/my-courses）/ 商城 / 课程主页（课程内）/ 聊天 等核心入口，与左侧栏逻辑一致。
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
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

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
  const avatarStoreActive = pathname === '/store/avatars' || pathname?.startsWith('/store/avatars/');
  const courseMilestoneActive =
    Boolean(pathname?.startsWith('/course/')) &&
    (pathname?.endsWith('/milestone') || pathname?.includes('/milestone/'));
  const courseProblemBankActive =
    Boolean(pathname?.startsWith('/course/')) &&
    (pathname?.endsWith('/problem-bank') || pathname?.includes('/problem-bank/'));
  const topUpActive = pathname === '/top-up' || pathname?.startsWith('/top-up/');
  const creditsMarketActive =
    pathname === '/credits-market' || pathname?.startsWith('/credits-market/');
  const profileActive = pathname === '/profile' || pathname?.startsWith('/profile/');
  const settingsActive = pathname === '/settings' || pathname?.startsWith('/settings/');
  const gamificationActive = pathname === '/gamification' || pathname?.startsWith('/gamification/');

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
          key: 'gamification',
          href: '/gamification',
          label: '学习成长',
          tooltip: '学习成长',
          icon: Flame,
          active: gamificationActive,
        },
        {
          key: 'live2d',
          href: '/live2d',
          label: '讲师中心',
          tooltip: '管理课堂/通知/签到讲师',
          icon: Sparkles,
          active: live2dActive,
        },
      ],
    },
    {
      key: 'marketplace',
      label: '商城',
      items: [
        {
          key: 'store',
          href: '/store/courses',
          label: '课程商城',
          tooltip: '课程商城',
          icon: ShoppingBag,
          active: courseStoreActive,
        },
        {
          key: 'avatar-store',
          href: '/store/avatars',
          label: '抽卡补给站',
          tooltip: '抽卡补给站',
          icon: UserRound,
          active: avatarStoreActive,
        },
      ],
    },
    {
      key: 'credits',
      label: '积分中心',
      items: [
        {
          key: 'top-up',
          href: '/top-up',
          label: '充值/转换',
          tooltip: '充值/转换',
          icon: Coins,
          active: topUpActive,
        },
        {
          key: 'credits-market',
          href: '/credits-market',
          label: '交易积分',
          tooltip: '交易积分',
          icon: ArrowRightLeft,
          active: creditsMarketActive,
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
          key: 'settings',
          href: '/settings',
          label: '设置',
          tooltip: '设置',
          icon: Settings,
          active: settingsActive,
        },
      ],
    },
    {
      key: 'support',
      label: '帮助与支持',
      items: [
        {
          key: 'contact-support',
          href: CONTACT_SUPPORT_NAV_URL,
          label: '联系客服',
          tooltip: '联系客服',
          icon: LifeBuoy,
          active: false,
          external: true,
        },
        {
          key: 'report-issue',
          href: REPORT_ISSUE_NAV_URL,
          label: '报告问题',
          tooltip: '报告问题',
          icon: Bug,
          active: false,
          external: true,
        },
      ],
    },
  ];

  const coreNavSections: CoreNavSection[] = isDashboardRoute(pathname)
    ? dashboardNavSections
    : [
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
                  {
                    key: 'course-milestone',
                    href: `/course/${encodeURIComponent(courseId ?? '')}/milestone`,
                    label: '课程里程碑',
                    tooltip: '课程里程碑',
                    icon: Flame,
                    active: courseMilestoneActive,
                  },
                  {
                    key: 'course-problem-bank',
                    href: `/course/${encodeURIComponent(courseId ?? '')}/problem-bank`,
                    label: '课程题库',
                    tooltip: '课程题库',
                    icon: ListChecks,
                    active: courseProblemBankActive,
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
          ],
        },
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
            ...(!inCourseContext
              ? ([
                  {
                    key: 'gamification',
                    href: '/gamification',
                    label: '学习成长',
                    tooltip: '学习成长',
                    icon: Flame,
                    active: gamificationActive,
                  },
                ] satisfies CoreNavItem[])
              : []),
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
                    label: '讲师中心',
                    tooltip: '管理课堂/通知/签到讲师',
                    icon: Sparkles,
                    active: live2dActive,
                  },
                  {
                    key: 'avatar-store',
                    href: '/store/avatars',
                    label: '抽卡补给站',
                    tooltip: '抽卡补给站',
                    icon: UserRound,
                    active: avatarStoreActive,
                  },
                ] satisfies CoreNavItem[])
              : []),
          ],
        },
        {
          key: 'credits',
          label: '积分中心',
          items: [
            {
              key: 'top-up',
              href: '/top-up',
              label: '充值/转换',
              tooltip: '充值/转换',
              icon: Coins,
              active: topUpActive,
            },
            {
              key: 'credits-market',
              href: '/credits-market',
              label: '交易积分',
              tooltip: '交易积分',
              icon: ArrowRightLeft,
              active: creditsMarketActive,
            },
          ],
        },
        {
          key: 'support',
          label: '帮助与支持',
          items: [
            {
              key: 'contact-support',
              href: CONTACT_SUPPORT_NAV_URL,
              label: '联系客服',
              tooltip: '联系客服',
              icon: LifeBuoy,
              active: false,
              external: true,
            },
            {
              key: 'report-issue',
              href: REPORT_ISSUE_NAV_URL,
              label: '报告问题',
              tooltip: '报告问题',
              icon: Bug,
              active: false,
              external: true,
            },
          ],
        },
      ].filter((section) => section.items.length > 0);

  const omit = excludeKeys?.length ? new Set(excludeKeys) : null;
  const visibleSections = omit
    ? coreNavSections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => !omit.has(item.key)),
        }))
        .filter((section) => section.items.length > 0)
    : coreNavSections;
  const enableCollapsibleSections = grouped && !collapsed && isDashboardRoute(pathname);

  const isDashboardSectionExpandedByDefault = (sectionKey: string) =>
    sectionKey === 'workspace' || sectionKey === 'marketplace' || sectionKey === 'credits';

  useEffect(() => {
    if (!enableCollapsibleSections) return;
    setCollapsedSections((current) => {
      const next = { ...current };
      let changed = false;

      for (const section of visibleSections) {
        if (next[section.key] !== undefined) continue;
        next[section.key] = !isDashboardSectionExpandedByDefault(section.key);
        changed = true;
      }

      for (const key of Object.keys(next)) {
        if (visibleSections.some((section) => section.key === key)) continue;
        delete next[key];
        changed = true;
      }

      return changed ? next : current;
    });
  }, [enableCollapsibleSections, visibleSections]);

  const renderItem = (item: CoreNavItem) => {
    const Icon = item.icon;

    return (
      <li key={item.key}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href={item.href}
              className={navItemClass(collapsed, item.active, variant)}
              aria-current={item.active ? 'page' : undefined}
              onClick={() => onItemClick?.(item.key)}
              {...(item.external
                ? { target: '_blank' as const, rel: 'noopener noreferrer' as const }
                : {})}
            >
              <span className="relative shrink-0">
                <Icon className="size-[18px] shrink-0 opacity-80" strokeWidth={1.75} />
              </span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          </TooltipTrigger>
          {collapsed && (
            <TooltipContent side={tooltipSide}>{item.tooltip ?? item.label}</TooltipContent>
          )}
        </Tooltip>
      </li>
    );
  };

  if (!grouped) {
    const rawFlat = visibleSections.flatMap((s) => s.items);
    const ordered = chatRightRailOrder ? sortChatRightRailItems(rawFlat) : rawFlat;
    const flatItems = ordered;
    return (
      <div className="flex flex-col p-0">
        <ul className="flex flex-col gap-0.5 p-0">{flatItems.map(renderItem)}</ul>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-0">
      {visibleSections.map((section, sectionIndex) => {
        const sectionCollapsed = enableCollapsibleSections
          ? (collapsedSections[section.key] ?? section.key !== 'workspace')
          : false;

        return (
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
              enableCollapsibleSections ? (
                <button
                  type="button"
                  onClick={() =>
                    setCollapsedSections((current) => ({
                      ...current,
                      [section.key]: !sectionCollapsed,
                    }))
                  }
                  className="flex w-full items-center gap-1.5 rounded-[10px] px-2 pb-1.5 pt-0.5 text-left text-[11px] font-semibold tracking-[0.08em] text-muted-foreground/90 transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
                  aria-expanded={!sectionCollapsed}
                  aria-controls={`nav-section-${section.key}`}
                >
                  {sectionCollapsed ? (
                    <ChevronRight className="size-3 shrink-0" strokeWidth={2} />
                  ) : (
                    <ChevronDown className="size-3 shrink-0" strokeWidth={2} />
                  )}
                  <span className="truncate">{section.label}</span>
                </button>
              ) : (
                <div className="px-2 pb-1.5 pt-0.5 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground/90">
                  {section.label}
                </div>
              )
            ) : null}
            {!sectionCollapsed ? (
              <ul id={`nav-section-${section.key}`} className="flex flex-col gap-0.5 p-0">
                {section.items.map(renderItem)}
              </ul>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
