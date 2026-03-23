'use client';

import type { ReactNode } from 'react';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AppLeftRail } from '@/components/app-left-rail';

/** 与 notebook-agent-sidebar 抽屉宽度一致：展开 270px / 收起 88px，左侧 left-4(16px) */
const SIDEBAR_GAP = 12;

function mainPaddingLeftPx(collapsed: boolean): number {
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (isLogin || isRegister || isLanding) {
    return <>{children}</>;
  }

  if (isClassroom) {
    return <MainShellNoRail>{children}</MainShellNoRail>;
  }

  return (
    <>
      <AppLeftRail collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      <SidebarInset collapsed={sidebarCollapsed}>{children}</SidebarInset>
    </>
  );
}

function SidebarInset({
  collapsed,
  children,
}: {
  collapsed: boolean;
  children: ReactNode;
}) {
  const [padLeft, setPadLeft] = useState(298);

  useEffect(() => {
    const sync = () => setPadLeft(mainPaddingLeftPx(collapsed));
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [collapsed]);

  return (
    <div
      className="box-border min-h-dvh py-4 pr-4 transition-[padding-left] duration-300 ease-in-out"
      style={{ paddingLeft: padLeft }}
    >
      {/* 与侧栏一致：top-4 + h-[calc(100dvh-2rem)] + rounded-[20px] */}
      <div className="h-[calc(100dvh-2rem)] w-full min-w-0 overflow-x-hidden overflow-y-auto rounded-[20px]">
        {children}
      </div>
    </div>
  );
}
