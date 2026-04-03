'use client';

import type { ReactNode } from 'react';
import { Suspense, useState, useEffect, useLayoutEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AppLeftRail } from '@/components/app-left-rail';
import { ChatRightRail } from '@/components/chat-right-rail';

/** 与 notebook-agent-sidebar 抽屉宽度一致：展开 270px / 收起 88px，侧栏 inset left-4 / right-4 各 16px */
const SIDEBAR_GAP = 12;

const CHAT_RIGHT_RAIL_STORAGE_KEY = 'synatra-chat-right-rail-collapsed';

function railOuterPaddingPx(collapsed: boolean): number {
  const maxW = typeof window !== 'undefined' ? Math.max(0, window.innerWidth - 32) : 270;
  const w = collapsed ? 88 : Math.min(270, maxW);
  return 16 + w + SIDEBAR_GAP;
}

function MainShellNoRail({ children }: { children: ReactNode }) {
  return (
    <div className="box-border min-h-dvh py-4 px-4">
      <div className="h-[calc(100dvh-2rem)] w-full min-w-0 overflow-x-hidden overflow-y-auto rounded-[20px]">
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [chatRightCollapsed, setChatRightCollapsed] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(CHAT_RIGHT_RAIL_STORAGE_KEY);
      if (v === '1') setChatRightCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

  const persistChatRightCollapsed = (collapsed: boolean) => {
    setChatRightCollapsed(collapsed);
    try {
      localStorage.setItem(CHAT_RIGHT_RAIL_STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  /** 仅独立路由 `/chat`（app/chat/page），课堂内或其它页的聊天 UI 不出现右侧栏 */
  const isChatPage = pathname === '/chat';

  if (isLogin || isRegister || isLanding) {
    return <>{children}</>;
  }

  if (isClassroom || isAdmin) {
    return <MainShellNoRail>{children}</MainShellNoRail>;
  }

  return (
    <>
      <AppLeftRail collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      <SidebarInset
        leftCollapsed={sidebarCollapsed}
        rightCollapsed={chatRightCollapsed}
        isChatPage={isChatPage}
      >
        {children}
      </SidebarInset>
      {isChatPage ? (
        <Suspense fallback={null}>
          <ChatRightRail collapsed={chatRightCollapsed} onCollapsedChange={persistChatRightCollapsed} />
        </Suspense>
      ) : null}
    </>
  );
}

function SidebarInset({
  leftCollapsed,
  rightCollapsed,
  isChatPage,
  children,
}: {
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  isChatPage: boolean;
  children: ReactNode;
}) {
  const [padLeft, setPadLeft] = useState(() => railOuterPaddingPx(false));
  const [padRight, setPadRight] = useState(() =>
    isChatPage ? railOuterPaddingPx(false) : 16,
  );

  useLayoutEffect(() => {
    const sync = () => {
      setPadLeft(railOuterPaddingPx(leftCollapsed));
      setPadRight(isChatPage ? railOuterPaddingPx(rightCollapsed) : 16);
    };
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [leftCollapsed, rightCollapsed, isChatPage]);

  return (
    <div
      className="box-border min-h-dvh py-4 transition-[padding-left,padding-right] duration-300 ease-in-out"
      style={{ paddingLeft: padLeft, paddingRight: padRight }}
    >
      {/* 与侧栏一致：top-4 + h-[calc(100dvh-2rem)] + rounded-[20px] */}
      <div className="h-[calc(100dvh-2rem)] w-full min-w-0 overflow-x-hidden overflow-y-auto rounded-[20px]">
        {children}
      </div>
    </div>
  );
}
