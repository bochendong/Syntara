'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ClipboardList,
  Coins,
  Cpu,
  Ellipsis,
  GraduationCap,
  House,
  LayoutDashboard,
  MessagesSquare,
  Plus,
  Settings,
  ShoppingBag,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { createNotebookHref } from '@/lib/constants/course-chat';
import { useAuthStore } from '@/lib/store/auth';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { cn } from '@/lib/utils';
import { backendJson } from '@/lib/utils/backend-api';
import { getCourse } from '@/lib/utils/course-storage';
import { pruneCourseWorkspaceCachesForPathname } from '@/lib/utils/course-workspace-cache';
import {
  formatCashCreditsLabel,
  formatComputeCreditsLabel,
  formatPurchaseCreditsLabel,
} from '@/lib/utils/credits';
import {
  subscribeCreditsBalancesChanged,
  type CreditsBalances,
} from '@/lib/utils/credits-balance-events';

function courseIdFromPathname(pathname: string | null): string | null {
  if (!pathname) return null;
  const match = pathname.match(/^\/course\/([^/]+)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function HeaderLink({
  href,
  active,
  icon: Icon,
  label,
}: {
  href: string;
  active?: boolean;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] px-2.5 text-xs font-semibold transition-colors',
        active
          ? 'bg-sky-50 text-sky-700 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.22)] dark:bg-sky-400/10 dark:text-sky-100'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white',
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
      <span className="hidden xl:inline">{label}</span>
    </Link>
  );
}

function MoreMenuLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <DropdownMenuItem asChild>
      <Link href={href}>
        <Icon className="h-4 w-4" />
        {label}
      </Link>
    </DropdownMenuItem>
  );
}

function formatHeaderCreditAmount(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString('en-US');
}

async function fetchCreditBalances(): Promise<CreditsBalances | null> {
  const data = await backendJson<{ balances: CreditsBalances }>('/api/profile/credits?pageSize=1')
    .then((value) => value)
    .catch(() => null);
  return data?.balances ?? null;
}

export function AppGlobalHeader() {
  const pathname = usePathname();
  const routeCourseId = useMemo(() => courseIdFromPathname(pathname), [pathname]);
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  const storedCourseId = useCurrentCourseStore((state) => state.id);
  const courseName = useCurrentCourseStore((state) => state.name);
  const setCurrentCourse = useCurrentCourseStore((state) => state.setCurrentCourse);
  const [creditBalances, setCreditBalances] = useState<CreditsBalances | null>(null);
  const courseId = routeCourseId || storedCourseId;
  const encodedCourseId = courseId ? encodeURIComponent(courseId) : null;
  const courseHomeHref = encodedCourseId ? `/course/${encodedCourseId}` : '/my-courses';
  const problemBankHref = encodedCourseId
    ? `/course/${encodedCourseId}/problem-bank`
    : '/my-courses';
  const createNotebookUrl = encodedCourseId ? createNotebookHref(courseId) : '/my-courses';
  const courseTitle = courseId ? courseName || '课程工作区' : '选择课程';
  const creditItems =
    isLoggedIn && creditBalances
      ? [
          {
            key: 'cash',
            value: creditBalances.cash,
            title: formatCashCreditsLabel(creditBalances.cash),
            Icon: Wallet,
            className: 'text-emerald-500',
          },
          {
            key: 'compute',
            value: creditBalances.compute,
            title: formatComputeCreditsLabel(creditBalances.compute),
            Icon: Cpu,
            className: 'text-sky-500',
          },
          {
            key: 'purchase',
            value: creditBalances.purchase,
            title: formatPurchaseCreditsLabel(creditBalances.purchase),
            Icon: Coins,
            className: 'text-amber-500',
          },
        ]
      : [];

  useEffect(() => {
    pruneCourseWorkspaceCachesForPathname(pathname);
  }, [pathname]);

  useEffect(() => {
    if (!routeCourseId) return;
    if (storedCourseId === routeCourseId && courseName) return;
    let cancelled = false;

    (async () => {
      const course = await getCourse(routeCourseId);
      if (cancelled || !course) return;
      setCurrentCourse({
        id: course.id,
        name: course.name,
        avatarUrl: course.avatarUrl,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [courseName, routeCourseId, setCurrentCourse, storedCourseId]);

  useEffect(() => {
    if (!isLoggedIn) return;
    let active = true;

    (async () => {
      const balances = await fetchCreditBalances();
      if (active && balances) setCreditBalances(balances);
    })();

    return () => {
      active = false;
    };
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;
    let active = true;
    const unsubscribe = subscribeCreditsBalancesChanged((balances) => {
      if (!active) return;
      if (balances) {
        setCreditBalances(balances);
        return;
      }

      void (async () => {
        const nextBalances = await fetchCreditBalances();
        if (active && nextBalances) setCreditBalances(nextBalances);
      })();
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [isLoggedIn]);

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 rounded-[18px] border border-slate-200/80 bg-white/88 px-3 shadow-[0_14px_34px_rgba(15,23,42,0.055)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/68">
      {encodedCourseId ? (
        <Link
          href="/my-courses"
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] border border-slate-200/75 bg-white/64 px-2.5 text-xs font-semibold text-slate-600 transition-colors hover:border-sky-200 hover:bg-sky-50 hover:text-slate-950 dark:border-white/10 dark:bg-white/[0.055] dark:text-slate-200 dark:hover:border-sky-400/25 dark:hover:bg-sky-400/10"
        >
          <House className="h-3.5 w-3.5" strokeWidth={2} />
          <span className="hidden md:inline">主页</span>
        </Link>
      ) : null}

      {encodedCourseId ? <div className="h-5 w-px shrink-0 bg-slate-200 dark:bg-white/10" /> : null}

      <Link
        href={courseHomeHref}
        className="flex min-w-0 max-w-[20rem] shrink items-center gap-2 rounded-[11px] px-2 py-1.5 text-left transition-colors hover:bg-slate-100 dark:hover:bg-white/10"
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-200">
          <GraduationCap className="h-4 w-4" strokeWidth={2} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-xs font-semibold text-slate-900 dark:text-white">
            {courseTitle}
          </span>
          <span className="block truncate text-[10px] font-medium text-slate-400">
            当前课程上下文
          </span>
        </span>
      </Link>

      <nav className="ml-auto flex min-w-0 items-center justify-end gap-1">
        <HeaderLink
          href={courseHomeHref}
          active={Boolean(encodedCourseId && pathname === courseHomeHref)}
          icon={LayoutDashboard}
          label="课程主页"
        />
        <HeaderLink
          href={problemBankHref}
          active={Boolean(pathname?.startsWith(problemBankHref))}
          icon={ClipboardList}
          label="题库"
        />
        <HeaderLink
          href="/chat"
          active={pathname === '/chat' || Boolean(pathname?.startsWith('/chat/'))}
          icon={MessagesSquare}
          label="聊天"
        />

        {creditItems.length > 0 ? (
          <>
            <div className="mx-1 hidden h-5 w-px shrink-0 bg-slate-200 lg:block dark:bg-white/10" />
            <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
              {creditItems.map(({ key, value, title, Icon, className }) => (
                <Link
                  key={key}
                  href={key === 'cash' ? '/top-up' : '/credits-market'}
                  title={title}
                  aria-label={title}
                  className="inline-flex h-8 min-w-[4rem] items-center justify-center gap-1.5 rounded-[10px] border border-slate-200/75 bg-white/64 px-2 text-xs font-semibold text-slate-700 transition-colors hover:border-sky-200 hover:bg-sky-50 hover:text-slate-950 dark:border-white/10 dark:bg-white/[0.055] dark:text-slate-200 dark:hover:border-sky-400/25 dark:hover:bg-sky-400/10"
                >
                  <Icon className={cn('h-3.5 w-3.5', className)} strokeWidth={2} />
                  <span className="tabular-nums text-slate-950 dark:text-white">
                    {formatHeaderCreditAmount(value)}
                  </span>
                </Link>
              ))}
            </div>
          </>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="h-8 w-8 rounded-[10px] text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
              aria-label="更多全局导航"
              title="更多"
            >
              <Ellipsis className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="w-48">
            <MoreMenuLink href={createNotebookUrl} icon={Plus} label="新建笔记本" />
            <MoreMenuLink href="/my-courses" icon={GraduationCap} label="所有课程" />
            <DropdownMenuSeparator />
            <MoreMenuLink href="/store" icon={ShoppingBag} label="笔记本商城" />
            <MoreMenuLink href="/credits-market" icon={Coins} label="积分中心" />
            <MoreMenuLink href="/settings" icon={Settings} label="设置" />
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </header>
  );
}
