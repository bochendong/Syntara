'use client';

import type { ReactNode } from 'react';
import { Suspense, useState, useLayoutEffect } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { AppGlobalHeader } from '@/components/app-global-header';
import { cn } from '@/lib/utils';
import {
  CHAT_RIGHT_RAIL_COLLAPSED_STORAGE_KEY,
  LEFT_RAIL_COLLAPSED_STORAGE_KEY,
} from '@/lib/constants/app-rail-storage';

const AppLeftRail = dynamic(
  () => import('@/components/app-left-rail').then((mod) => mod.AppLeftRail),
  { ssr: false },
);
const ChatRightRail = dynamic(
  () => import('@/components/chat-right-rail').then((mod) => mod.ChatRightRail),
  { ssr: false },
);
const Live2DStudyCompanionLauncher = dynamic(
  () =>
    import('@/components/live2d-study-companion-launcher').then(
      (mod) => mod.Live2DStudyCompanionLauncher,
    ),
  { ssr: false },
);

/** 侧栏 inset left-4 / right-4 各 16px；左侧 Dashboard 导航略宽，右侧聊天栏保持紧凑。 */
const SIDEBAR_GAP = 12;
const LEFT_RAIL_EXPANDED_WIDTH = 256;
const RIGHT_RAIL_EXPANDED_WIDTH = 270;
const RAIL_COLLAPSED_WIDTH = 78;
const GLOBAL_HEADER_OFFSET_PX = 76;
const COMPACT_RAIL_BREAKPOINT_PX = 1024;
const COMPACT_PAGE_INSET_PX = 16;

function railOuterPaddingPx(collapsed: boolean, expandedWidth: number): number {
  const maxW = typeof window !== 'undefined' ? Math.max(0, window.innerWidth - 32) : expandedWidth;
  const w = collapsed ? RAIL_COLLAPSED_WIDTH : Math.min(expandedWidth, maxW);
  return 16 + w + SIDEBAR_GAP;
}

function shouldUseCompactRailLayout(hasRightRail: boolean): boolean {
  if (typeof window === 'undefined' || hasRightRail) return false;
  return window.innerWidth < COMPACT_RAIL_BREAKPOINT_PX;
}

function getInitialSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(LEFT_RAIL_COLLAPSED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function getInitialChatRightCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(CHAT_RIGHT_RAIL_COLLAPSED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function isTestSurface(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    pathname === '/test' ||
    pathname === '/generation-quality' ||
    pathname === '/generation-tests' ||
    /^\/[^/]+-test(?:\/|$)/.test(pathname)
  );
}

function shouldHideStudyCompanion(pathname: string | null): boolean {
  return (
    pathname === '/' ||
    (pathname != null && /^\/login(?:\/|$)/.test(pathname)) ||
    (pathname != null && /^\/register(?:\/|$)/.test(pathname)) ||
    pathname === '/my-courses' ||
    (pathname != null && /^\/store(?:\/|$)/.test(pathname)) ||
    pathname === '/credits-market' ||
    pathname === '/top-up' ||
    (pathname != null && /^\/course\/[^/]+\/?$/.test(pathname)) ||
    (pathname != null && /^\/course\/[^/]+\/problem-bank(?:\/|$)/.test(pathname)) ||
    (pathname != null && /^\/course\/[^/]+\/create-notebook(?:\/|$)/.test(pathname)) ||
    (pathname != null && /^\/course\/[^/]+\/memory(?:\/|$)/.test(pathname)) ||
    (pathname != null && /^\/course\/[^/]+\/milestone(?:\/|$)/.test(pathname))
  );
}

function MainShellNoRail({
  children,
  balancedInset = false,
  showHeader = false,
}: {
  children: ReactNode;
  balancedInset?: boolean;
  showHeader?: boolean;
}) {
  return (
    <div className={cn('box-border min-h-dvh px-4', balancedInset ? 'py-4' : 'pt-4 pb-0')}>
      <div
        className={cn(
          'flex min-h-0 w-full min-w-0 flex-col gap-3',
          balancedInset ? 'h-[calc(100dvh-2rem)]' : 'h-[calc(100dvh-1rem)]',
        )}
      >
        {showHeader ? <AppGlobalHeader /> : null}
        <div className="min-h-0 w-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto rounded-[20px]">
          {children}
        </div>
      </div>
    </div>
  );
}

export function AppLayoutChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === '/login' || pathname?.startsWith('/login/');
  const isRegister = pathname === '/register' || pathname?.startsWith('/register/');
  const isLanding = pathname === '/';
  const isMyCourses = pathname === '/my-courses' || pathname?.startsWith('/my-courses/');
  const isClassroom = pathname?.startsWith('/classroom/');
  const isAdmin = pathname?.startsWith('/admin');
  const isTestPage = isTestSurface(pathname);
  const isCourseHome = pathname != null && /^\/course\/[^/]+\/?$/.test(pathname);
  const isCourseProblemDetail =
    pathname != null && /^\/course\/[^/]+\/problem-bank\/[^/]+\/?$/.test(pathname);
  const isCourseProblemBank =
    pathname != null && /^\/course\/[^/]+\/problem-bank(?:\/|$)/.test(pathname);
  const isCourseMemory = pathname != null && /^\/course\/[^/]+\/memory(?:\/|$)/.test(pathname);
  const isNotebookCreatePage =
    pathname != null && /^\/course\/[^/]+\/create-notebook(?:\/|$)/.test(pathname);
  const isReviewImmersive =
    pathname != null && /^\/review\/[^/]+\/(?:loading|map)(?:\/|$)/.test(pathname);
  const hideStudyCompanion = shouldHideStudyCompanion(pathname);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getInitialSidebarCollapsed);
  const [chatRightCollapsed, setChatRightCollapsed] = useState(getInitialChatRightCollapsed);

  const persistSidebarCollapsed = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
    try {
      localStorage.setItem(LEFT_RAIL_COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  const persistChatRightCollapsed = (collapsed: boolean) => {
    setChatRightCollapsed(collapsed);
    try {
      localStorage.setItem(CHAT_RIGHT_RAIL_COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  /** 独立聊天页使用右侧信息栏；创建笔记本页的设置已并入主工作台。 */
  const isChatPage = pathname === '/chat';
  const hasRightRail = isChatPage;
  const hasGlobalHeader = !isMyCourses && !isChatPage;
  const withStudyCompanion = (content: ReactNode) => {
    if (hideStudyCompanion) return <>{content}</>;

    return (
      <>
        {content}
        <Suspense fallback={null}>
          <Live2DStudyCompanionLauncher />
        </Suspense>
      </>
    );
  };

  if (isLogin || isRegister || isLanding) {
    return withStudyCompanion(<>{children}</>);
  }

  if (isReviewImmersive || isTestPage) {
    return withStudyCompanion(<MainShellNoRail balancedInset>{children}</MainShellNoRail>);
  }

  if (isNotebookCreatePage) {
    return withStudyCompanion(
      <MainShellNoRail balancedInset showHeader>
        {children}
      </MainShellNoRail>,
    );
  }

  if (isCourseHome) {
    return withStudyCompanion(
      <MainShellNoRail balancedInset showHeader>
        {children}
      </MainShellNoRail>,
    );
  }

  if (isCourseProblemDetail) {
    return withStudyCompanion(<MainShellNoRail balancedInset>{children}</MainShellNoRail>);
  }

  if (isCourseProblemBank) {
    return withStudyCompanion(
      <MainShellNoRail balancedInset showHeader>
        {children}
      </MainShellNoRail>,
    );
  }

  if (isCourseMemory) {
    return withStudyCompanion(
      <MainShellNoRail balancedInset showHeader>
        {children}
      </MainShellNoRail>,
    );
  }

  if (isAdmin) {
    return withStudyCompanion(<MainShellNoRail>{children}</MainShellNoRail>);
  }

  if (isClassroom) {
    return withStudyCompanion(<MainShellNoRail>{children}</MainShellNoRail>);
  }

  return withStudyCompanion(
    <>
      {hasGlobalHeader ? (
        <div className="fixed left-3 right-3 top-3 z-[1400] sm:left-4 sm:right-4 sm:top-4">
          <AppGlobalHeader />
        </div>
      ) : !hasRightRail ? (
        <div className="fixed left-3 right-3 top-3 z-[1400] lg:hidden">
          <AppGlobalHeader />
        </div>
      ) : null}
      <AppLeftRail
        collapsed={sidebarCollapsed}
        hasGlobalHeader={hasGlobalHeader}
        hideBelowLg={!hasRightRail}
        onCollapsedChange={persistSidebarCollapsed}
      />
      <SidebarInset
        leftCollapsed={sidebarCollapsed}
        rightCollapsed={chatRightCollapsed}
        hasRightRail={hasRightRail}
        hasGlobalHeader={hasGlobalHeader}
        lockContentScroll={isChatPage}
      >
        {children}
      </SidebarInset>
      {hasRightRail ? (
        <Suspense fallback={null}>
          <ChatRightRail
            collapsed={chatRightCollapsed}
            hasGlobalHeader={hasGlobalHeader}
            onCollapsedChange={persistChatRightCollapsed}
            mode="chat"
          />
        </Suspense>
      ) : null}
    </>,
  );
}

function SidebarInset({
  leftCollapsed,
  rightCollapsed,
  hasRightRail,
  hasGlobalHeader = true,
  lockContentScroll = false,
  children,
}: {
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  hasRightRail: boolean;
  hasGlobalHeader?: boolean;
  lockContentScroll?: boolean;
  children: ReactNode;
}) {
  const [compactLayout, setCompactLayout] = useState(() =>
    shouldUseCompactRailLayout(hasRightRail),
  );
  const [padLeft, setPadLeft] = useState(() =>
    shouldUseCompactRailLayout(hasRightRail)
      ? COMPACT_PAGE_INSET_PX
      : railOuterPaddingPx(false, LEFT_RAIL_EXPANDED_WIDTH),
  );
  const [padRight, setPadRight] = useState(() => {
    if (shouldUseCompactRailLayout(hasRightRail)) return COMPACT_PAGE_INSET_PX;
    return hasRightRail ? railOuterPaddingPx(false, RIGHT_RAIL_EXPANDED_WIDTH) : 16;
  });

  useLayoutEffect(() => {
    const sync = () => {
      const compact = shouldUseCompactRailLayout(hasRightRail);
      setCompactLayout(compact);
      setPadLeft(
        compact
          ? COMPACT_PAGE_INSET_PX
          : railOuterPaddingPx(leftCollapsed, LEFT_RAIL_EXPANDED_WIDTH),
      );
      setPadRight(
        compact
          ? COMPACT_PAGE_INSET_PX
          : hasRightRail
            ? railOuterPaddingPx(rightCollapsed, RIGHT_RAIL_EXPANDED_WIDTH)
            : 16,
      );
    };
    sync();
    const frame = window.requestAnimationFrame(sync);
    const timer = window.setTimeout(sync, 120);
    window.addEventListener('resize', sync);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.removeEventListener('resize', sync);
    };
  }, [leftCollapsed, rightCollapsed, hasRightRail]);

  return (
    <div
      className={cn(
        'box-border pb-0 transition-[padding-left,padding-right] duration-300 ease-in-out',
        !hasRightRail && 'app-sidebar-inset-compactable',
        lockContentScroll ? 'h-dvh overflow-hidden' : 'min-h-dvh',
      )}
      style={{
        paddingLeft: padLeft,
        paddingRight: padRight,
        paddingTop: hasGlobalHeader || compactLayout ? GLOBAL_HEADER_OFFSET_PX : 16,
      }}
    >
      {/* 与侧栏一致：有全局 header 时从 header 下方开始；无 header 时回到普通页面 inset。 */}
      <div
        className="app-sidebar-inset-content flex w-full min-w-0 flex-col gap-3 overflow-hidden"
        style={{
          height: `calc(100dvh - ${hasGlobalHeader || compactLayout ? GLOBAL_HEADER_OFFSET_PX : 32}px)`,
        }}
      >
        <div
          className={cn(
            'min-h-0 w-full min-w-0 flex-1 overflow-x-hidden rounded-[20px]',
            lockContentScroll ? 'overflow-y-hidden' : 'overflow-y-auto',
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
