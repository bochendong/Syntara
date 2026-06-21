'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Ellipsis,
  GraduationCap,
  House,
  MessagesSquare,
  Plus,
  Settings,
  ShoppingBag,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserAvatarWithFrame } from '@/components/user-profile/user-avatar-with-frame';
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
import { useUserProfileStore } from '@/lib/store/user-profile';
import { cn } from '@/lib/utils';
import { getCourse } from '@/lib/utils/course-storage';
import { pruneCourseWorkspaceCachesForPathname } from '@/lib/utils/course-workspace-cache';

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

export function AppGlobalHeader() {
  const pathname = usePathname();
  const routeCourseId = useMemo(() => courseIdFromPathname(pathname), [pathname]);
  const authName = useAuthStore((state) => state.name);
  const storedCourseId = useCurrentCourseStore((state) => state.id);
  const courseName = useCurrentCourseStore((state) => state.name);
  const setCurrentCourse = useCurrentCourseStore((state) => state.setCurrentCourse);
  const userAvatar = useUserProfileStore((state) => state.avatar);
  const avatarFrameId = useUserProfileStore((state) => state.avatarFrameId);
  const nickname = useUserProfileStore((state) => state.nickname);
  const courseId = routeCourseId || storedCourseId;
  const encodedCourseId = courseId ? encodeURIComponent(courseId) : null;
  const courseHomeHref = encodedCourseId ? `/course/${encodedCourseId}` : '/my-courses';
  const createNotebookUrl = encodedCourseId ? createNotebookHref(courseId) : '/my-courses';
  const storeHref = encodedCourseId ? '/store' : '/store/courses';
  const storeActive =
    pathname === '/store' ||
    pathname === '/store/courses' ||
    Boolean(pathname?.startsWith('/store/'));
  const courseTitle = courseId ? courseName || '课程工作区' : '选择课程';
  const userDisplayName = nickname.trim() || authName.trim() || '个人中心';

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
          href="/chat"
          active={pathname === '/chat' || Boolean(pathname?.startsWith('/chat/'))}
          icon={MessagesSquare}
          label="聊天"
        />
        <HeaderLink href={storeHref} active={storeActive} icon={ShoppingBag} label="商城" />

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
            <MoreMenuLink href="/settings" icon={Settings} label="设置" />
          </DropdownMenuContent>
        </DropdownMenu>

        <Link
          href="/profile"
          className="ml-1 rounded-full outline-none ring-offset-2 transition-transform hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-sky-300"
          aria-label={`打开个人中心：${userDisplayName}`}
          title={userDisplayName}
        >
          <UserAvatarWithFrame
            src={userAvatar}
            frameId={avatarFrameId}
            className="size-8"
            imgClassName="ring-1 ring-black/5 dark:ring-white/10"
          />
        </Link>
      </nav>
    </header>
  );
}
