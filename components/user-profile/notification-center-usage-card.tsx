'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CreditsAccountPanel } from './credits-card';
import { TokenUsageAccountPanel } from './token-usage-card';

/**
 * 个人中心：紧挨「头像 / 头像框 / 通知样式」卡片下方，展示 Credits 与 Token 用量分栏。
 */
export function NotificationCenterUsageCard() {
  const [activeTab, setActiveTab] = useState('credits');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const applyHash = () => {
      if (window.location.hash === '#notification-center-credits') {
        setActiveTab('credits');
        document.getElementById('notification-center-usage-card')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
        return;
      }
      if (window.location.hash === '#notification-center-token') {
        setActiveTab('token');
        document.getElementById('notification-center-usage-card')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  return (
    <Card
      id="notification-center-usage-card"
      className="p-5 !gap-0 shadow-xl border-muted/40 backdrop-blur-xl bg-white/80 dark:bg-slate-900/80"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full min-w-0">
        <div className="border-b border-border/60 pb-4">
          <div className="mx-auto w-full max-w-xl">
            <TabsList
              className="grid h-9 w-full grid-cols-2 gap-0.5 p-1"
              variant="default"
              aria-label="额度与用量"
            >
              <TabsTrigger value="credits" className="text-sm">
                Credits 余额
              </TabsTrigger>
              <TabsTrigger value="token" className="text-sm">
                Token 用量
              </TabsTrigger>
            </TabsList>
          </div>
        </div>
        <TabsContent
          value="credits"
          id="notification-center-credits"
          className="mt-4 min-w-0 scroll-mt-4"
        >
          <CreditsAccountPanel variant="tab" />
        </TabsContent>
        <TabsContent
          value="token"
          id="notification-center-token"
          className="mt-4 min-w-0 scroll-mt-4"
        >
          <TokenUsageAccountPanel variant="tab" />
        </TabsContent>
      </Tabs>
    </Card>
  );
}
