'use client';

import type { ReactNode } from 'react';
import { Suspense, useState, useLayoutEffect } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
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
const Live2DStudyCompanion = dynamic(
  () => import('@/components/live2d-study-companion').then((mod) => mod.Live2DStudyCompanion),
  { ssr: false },
);

/** 侧栏 inset left-4 / right-4 各 16px；左侧 Dashboard 导航略宽，右侧聊天栏保持紧凑。 */
const SIDEBAR_GAP = 12;
const LEFT_RAIL_EXPANDED_WIDTH = 256;
const RIGHT_RAIL_EXPANDED_WIDTH = 270;
const RAIL_COLLAPSED_WIDTH = 78;

function railOuterPaddingPx(collapsed: boolean, expandedWidth: number): number {
  const maxW = typeof window !== 'undefined' ? Math.max(0, window.innerWidth - 32) : expandedWidth;
  const w = collapsed ? RAIL_COLLAPSED_WIDTH : Math.min(expandedWidth, maxW);
  return 16 + w + SIDEBAR_GAP;
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
  return pathname === '/' || pathname === '/my-courses';
}

function MainShellNoRail({
  children,
  balancedInset = false,
}: {
  children: ReactNode;
  balancedInset?: boolean;
}) {
  if (balancedInset) {
    return (
      <div className="box-border min-h-dvh px-4 py-4">
        <div className="h-[calc(100dvh-2rem)] w-full min-w-0 overflow-x-hidden overflow-y-auto rounded-[20px]">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="box-border min-h-dvh px-4 pt-4 pb-0">
      <div className="h-[calc(100dvh-1rem)] w-full min-w-0 overflow-x-hidden overflow-y-auto rounded-[20px]">
        {children}
      </div>
    </div>
  );
}

export function AppLayoutChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === '/login' || pathname?.startsWith('/login/');
  const isRegister = pathname === '/register' || pathname?.startsWith('/register/');
  const isLanding = pathname === '/';
  const isClassroom = pathname?.startsWith('/classroom/');
  const isAdmin = pathname?.startsWith('/admin');
  const isTestPage = isTestSurface(pathname);
  const isCourseProblemBank =
    pathname != null && /^\/course\/[^/]+\/problem-bank(?:\/|$)/.test(pathname);
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

  /** 独立聊天页与课程内创建页共享右侧信息/设置栏。 */
  const isChatPage = pathname === '/chat';
  const isNotebookCreatePage =
    pathname != null && /^\/course\/[^/]+\/create-notebook(?:\/|$)/.test(pathname);
  const hasRightRail = isChatPage || isNotebookCreatePage;
  const withStudyCompanion = (content: ReactNode) => {
    if (hideStudyCompanion) return <>{content}</>;

    return (
      <>
        {content}
        <Suspense fallback={null}>
          <Live2DStudyCompanion />
        </Suspense>
      </>
    );
  };

  if (isLogin || isRegister || isLanding) {
    return withStudyCompanion(<>{children}</>);
  }

  if (isReviewImmersive || isCourseProblemBank || isTestPage) {
    return withStudyCompanion(<MainShellNoRail balancedInset>{children}</MainShellNoRail>);
  }

  if (isClassroom || isAdmin) {
    return withStudyCompanion(<MainShellNoRail>{children}</MainShellNoRail>);
  }

  return withStudyCompanion(
    <>
      <AppLeftRail collapsed={sidebarCollapsed} onCollapsedChange={persistSidebarCollapsed} />
      <SidebarInset
        leftCollapsed={sidebarCollapsed}
        rightCollapsed={chatRightCollapsed}
        hasRightRail={hasRightRail}
        lockContentScroll={isChatPage}
      >
        {children}
      </SidebarInset>
      {hasRightRail ? (
        <Suspense fallback={null}>
          <ChatRightRail
            collapsed={chatRightCollapsed}
            onCollapsedChange={persistChatRightCollapsed}
            mode={isNotebookCreatePage ? 'notebook-create' : 'chat'}
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
  lockContentScroll = false,
  children,
}: {
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  hasRightRail: boolean;
  lockContentScroll?: boolean;
  children: ReactNode;
}) {
  const [padLeft, setPadLeft] = useState(() => railOuterPaddingPx(false, LEFT_RAIL_EXPANDED_WIDTH));
  const [padRight, setPadRight] = useState(() =>
    hasRightRail ? railOuterPaddingPx(false, RIGHT_RAIL_EXPANDED_WIDTH) : 16,
  );

  useLayoutEffect(() => {
    const sync = () => {
      setPadLeft(railOuterPaddingPx(leftCollapsed, LEFT_RAIL_EXPANDED_WIDTH));
      setPadRight(
        hasRightRail ? railOuterPaddingPx(rightCollapsed, RIGHT_RAIL_EXPANDED_WIDTH) : 16,
      );
    };
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [leftCollapsed, rightCollapsed, hasRightRail]);

  return (
    <div
      className={cn(
        'box-border pt-4 pb-0 transition-[padding-left,padding-right] duration-300 ease-in-out',
        lockContentScroll ? 'h-dvh overflow-hidden' : 'min-h-dvh',
      )}
      style={{ paddingLeft: padLeft, paddingRight: padRight }}
    >
      {/* 与侧栏一致：top-4 + h-[calc(100dvh-1rem)] + rounded-[20px] */}
      <div
        className={cn(
          'h-[calc(100dvh-1rem)] w-full min-w-0 overflow-x-hidden rounded-[20px]',
          lockContentScroll ? 'overflow-y-hidden' : 'overflow-y-auto',
        )}
      >
        {children}
      </div>
    </div>
  );
}
