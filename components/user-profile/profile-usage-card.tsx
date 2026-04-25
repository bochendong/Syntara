'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CreditsAccountPanel } from './credits-card';
import { TokenUsageAccountPanel } from './token-usage-card';
import { ProfileAvatarPicker } from './profile-avatar-picker';
import { ProfileNotificationStylePicker } from './profile-notification-style-picker';

/**
 * 个人中心：头像、通知样式、Credits、Token 同一卡片内可切换页签。
 */
export function ProfileUsageCard() {
  const [activeTab, setActiveTab] = useState('avatar');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const applyHash = () => {
      if (window.location.hash === '#profile-usage-card-avatar') {
        setActiveTab('avatar');
        document.getElementById('profile-usage-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (window.location.hash === '#profile-usage-card-notification') {
        setActiveTab('notification');
        document.getElementById('profile-usage-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  return (
    <Card
      id="profile-usage-card"
      className="p-5 !gap-0 shadow-xl border-muted/40 backdrop-blur-xl bg-white/80 dark:bg-slate-900/80"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full min-w-0">
        <div className="border-b border-border/60 pb-4">
          <div className="mx-auto w-full max-w-3xl">
            <TabsList
              className="grid h-auto w-full grid-cols-2 gap-0.5 p-1 sm:grid-cols-4"
              variant="default"
              aria-label="个人中心分栏"
            >
              <TabsTrigger value="avatar" className="px-1.5 text-xs sm:px-2 sm:text-sm">
                头像
              </TabsTrigger>
              <TabsTrigger value="notification" className="px-1.5 text-xs sm:px-2 sm:text-sm">
                通知样式
              </TabsTrigger>
              <TabsTrigger value="credits" className="px-1.5 text-xs sm:px-2 sm:text-sm">
                Credits 余额
              </TabsTrigger>
              <TabsTrigger value="token" className="px-1.5 text-xs sm:px-2 sm:text-sm">
                Token 用量
              </TabsTrigger>
            </TabsList>
          </div>
        </div>
        <TabsContent value="avatar" id="profile-usage-card-avatar" className="mt-4 min-w-0 scroll-mt-4">
          <div className="mx-auto w-full max-w-xl sm:max-w-2xl">
            <ProfileAvatarPicker size="lg" />
          </div>
        </TabsContent>
        <TabsContent
          value="notification"
          id="profile-usage-card-notification"
          className="mt-4 min-w-0 scroll-mt-4"
        >
          <div className="mx-auto w-full max-w-xl sm:max-w-2xl">
            <ProfileNotificationStylePicker />
          </div>
        </TabsContent>
        <TabsContent value="credits" className="mt-4 min-w-0">
          <CreditsAccountPanel variant="tab" />
        </TabsContent>
        <TabsContent value="token" className="mt-4 min-w-0">
          <TokenUsageAccountPanel variant="tab" />
        </TabsContent>
      </Tabs>
    </Card>
  );
}
