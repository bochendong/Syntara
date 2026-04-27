'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowRightLeft,
  BookOpen,
  ListChecks,
  Bug,
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

function navItemClass(
  collapsed: boolean,
  active: boolean,
  variant: 'home' | 'notebook',
  itemLayout: 'list' | 'grid' = 'list',
  blackSurface = false,
) {
  if (itemLayout === 'grid' && !collapsed) {
    return cn(
      'flex min-h-[3.2rem] w-full min-w-0 items-center justify-start gap-2 rounded-[12px] border px-2.5 py-2 text-left text-[12px] font-medium leading-snug transition-all duration-[250ms] ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
      active
        ? variant === 'notebook'
          ? blackSurface
            ? 'border-sky-300/45 bg-sky-400/14 text-sky-100 shadow-[inset_3px_0_0_rgba(125,211,252,0.75)]'
            : 'border-sky-300/70 bg-sky-50/80 text-sky-700 shadow-[inset_3px_0_0_rgba(56,189,248,0.72)] dark:border-sky-300/45 dark:bg-sky-400/12 dark:text-sky-100'
          : blackSurface
            ? 'border-sky-300/45 bg-sky-400/14 text-sky-100 shadow-[inset_3px_0_0_rgba(125,211,252,0.75)]'
            : 'border-sky-300/70 bg-sky-50/80 text-sky-700 shadow-[inset_3px_0_0_rgba(56,189,248,0.72)] dark:border-sky-300/45 dark:bg-sky-400/12 dark:text-sky-100'
        : variant === 'notebook'
          ? blackSurface
            ? 'border-white/12 bg-white/[0.035] font-normal text-white/76 hover:border-white/22 hover:bg-white/[0.07] hover:text-white'
            : 'border-slate-200/85 bg-white/34 font-normal text-slate-700/90 hover:border-slate-300/90 hover:bg-white/75 hover:text-slate-950 dark:border-white/12 dark:bg-white/[0.035] dark:text-white/76 dark:hover:border-white/22 dark:hover:bg-white/[0.07] dark:hover:text-white'
          : blackSurface
            ? 'border-white/12 bg-white/[0.035] font-normal text-white/74 hover:border-white/22 hover:bg-white/[0.07] hover:text-white'
            : 'border-slate-200/85 bg-white/34 font-normal text-[#1d1d1f]/78 hover:border-slate-300/90 hover:bg-white/75 hover:text-slate-950 dark:border-white/12 dark:bg-white/[0.035] dark:text-white/74 dark:hover:border-white/22 dark:hover:bg-white/[0.07] dark:hover:text-white',
    );
  }

  return cn(
    'flex min-h-9 w-full items-center gap-3 rounded-[11px] py-1.5 text-left text-xs transition-all duration-[250ms] ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
    collapsed ? 'justify-center px-2' : 'px-2.5',
    active
      ? variant === 'notebook'
        ? blackSurface
          ? 'bg-sky-400/9 font-medium text-sky-100 shadow-[inset_2px_0_0_rgba(125,211,252,0.72)]'
          : 'bg-sky-50/62 font-medium text-sky-700 shadow-[inset_2px_0_0_rgba(56,189,248,0.68)] dark:bg-sky-400/10 dark:text-sky-100'
        : blackSurface
          ? 'bg-sky-400/9 font-medium text-sky-100 shadow-[inset_2px_0_0_rgba(125,211,252,0.72)]'
          : 'bg-sky-50/62 font-medium text-sky-700 shadow-[inset_2px_0_0_rgba(56,189,248,0.68)] dark:bg-sky-400/10 dark:text-sky-100'
      : variant === 'notebook'
        ? blackSurface
          ? 'font-normal text-white/76 hover:bg-white/[0.07] hover:text-white'
          : 'font-normal text-slate-700/90 hover:bg-slate-900/[0.04] hover:text-slate-950 dark:text-white/76 dark:hover:bg-white/[0.07] dark:hover:text-white'
        : blackSurface
          ? 'font-normal text-white/74 hover:bg-white/[0.07] hover:text-white'
          : 'font-normal text-[#1d1d1f]/78 hover:bg-black/[0.04] hover:text-slate-950 dark:text-white/74 dark:hover:bg-white/[0.07] dark:hover:text-white',
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
  /** 为 true 时按固定顺序重排（聊天右侧栏：课程主页 → Dashboard → 商城…） */
  chatRightRailOrder?: boolean;
  /** 按 item.key 排除入口（例如右侧栏不展示充值、商城） */
  excludeKeys?: string[];
  /**
   * `flat-grid`：Dashboard 壳层用扁平 + 多列宫格；`sectioned-list`：课程工作区用分组标题 + 纵向列表。
   */
  layout?: 'flat-grid' | 'sectioned-list';
  /** 黑色侧栏底（如主导航 `bg-black`）时用浅色字与 hover，避免在浅色系统主题下用灰字 */
  blackSurface?: boolean;
}

/**
 * 左侧栏核心入口：课程工作区为分组列表，Dashboard 为扁平宫格；聊天右侧栏为扁平列表。
 */
export function AppCoreNavList({
  collapsed,
  variant = 'home',
  tooltipSide = 'right',
  onItemClick,
  chatRightRailOrder = false,
  excludeKeys,
  layout = 'flat-grid',
  blackSurface = false,
}: AppCoreNavListProps) {
  const pathname = usePathname();
  const courseId = useCurrentCourseStore((s) => s.id);

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
  const avatarStoreActive =
    pathname === '/store/avatars' || pathname?.startsWith('/store/avatars/');
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
          label: '所有课程',
          tooltip: '所有课程',
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

  const coreNavSections: CoreNavSection[] = isDashboardRoute(pathname, courseId)
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
              label: '所有课程',
              tooltip: '所有课程',
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

  const useSectioned = layout === 'sectioned-list' && !chatRightRailOrder;

  const renderItem = (item: CoreNavItem, itemLayout: 'list' | 'grid' = 'list') => {
    const Icon = item.icon;
    const isGrid = itemLayout === 'grid' && !collapsed;

    return (
      <li key={item.key} className={cn(isGrid && 'min-w-0')}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href={item.href}
              className={navItemClass(collapsed, item.active, variant, itemLayout, blackSurface)}
              aria-current={item.active ? 'page' : undefined}
              onClick={() => onItemClick?.(item.key)}
              {...(item.external
                ? { target: '_blank' as const, rel: 'noopener noreferrer' as const }
                : {})}
            >
              <span
                className={cn(
                  'relative shrink-0',
                  isGrid &&
                    cn(
                      'flex size-7 items-center justify-center rounded-[9px]',
                      item.active
                        ? blackSurface
                          ? 'bg-sky-300/14'
                          : 'bg-sky-100/90 dark:bg-sky-300/14'
                        : blackSurface
                          ? 'bg-white/[0.055]'
                          : 'bg-slate-100/70 dark:bg-white/[0.055]',
                    ),
                )}
              >
                <Icon
                  className={cn(
                    'shrink-0',
                    isGrid ? 'size-[17px] opacity-90' : 'size-[18px] opacity-80',
                  )}
                  strokeWidth={1.75}
                />
              </span>
              {!collapsed && (
                <span className={cn('truncate', isGrid && 'min-w-0 flex-1')}>{item.label}</span>
              )}
            </Link>
          </TooltipTrigger>
          {collapsed && (
            <TooltipContent side={tooltipSide}>{item.tooltip ?? item.label}</TooltipContent>
          )}
        </Tooltip>
      </li>
    );
  };

  if (useSectioned) {
    return (
      <div className="flex flex-col gap-2.5 p-0">
        {visibleSections.map((section, sectionIndex) => (
          <div
            key={section.key}
            className={cn(
              'flex flex-col',
              !collapsed &&
                (blackSurface
                  ? 'rounded-[16px] border border-white/10 bg-white/[0.04] px-2 py-2'
                  : 'rounded-[16px] border border-black/[0.04] bg-black/[0.02] px-2 py-2 dark:border-white/[0.06] dark:bg-white/[0.03]'),
              collapsed && sectionIndex > 0 && 'pt-1.5',
            )}
          >
            {!collapsed ? (
              <div
                className={cn(
                  'px-2 pb-1.5 pt-0.5 text-[11px] font-semibold tracking-[0.08em]',
                  blackSurface ? 'text-zinc-500' : 'text-muted-foreground/90',
                )}
              >
                {section.label}
              </div>
            ) : null}
            <ul className="flex flex-col gap-0.5 p-0">
              {section.items.map((item) => renderItem(item, 'list'))}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  const rawFlat = visibleSections.flatMap((s) => s.items);
  const ordered = chatRightRailOrder ? sortChatRightRailItems(rawFlat) : rawFlat;
  const itemLayout = collapsed ? 'list' : 'grid';

  if (!collapsed && !chatRightRailOrder) {
    return (
      <div className="flex flex-col gap-2.5 p-0">
        {visibleSections.map((section) => (
          <div key={section.key} className="min-w-0">
            <div
              className={cn(
                'mb-0.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.08em]',
                blackSurface ? 'text-white/42' : 'text-slate-500/75 dark:text-white/42',
              )}
            >
              {section.label}
            </div>
            <ul className="flex flex-col gap-0.5 p-0">
              {section.items.map((item) => renderItem(item, 'list'))}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col p-0">
      <ul
        className={cn(
          'p-0',
          collapsed
            ? 'flex flex-col gap-0.5'
            : chatRightRailOrder
              ? 'grid grid-cols-3 gap-1.5'
              : 'grid grid-cols-2 gap-1.5',
        )}
      >
        {ordered.map((item) => renderItem(item, itemLayout))}
      </ul>
    </div>
  );
}
