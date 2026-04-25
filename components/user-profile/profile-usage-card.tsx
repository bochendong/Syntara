'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProfileAvatarPicker } from './profile-avatar-picker';
import { ProfileAvatarFramePicker } from './profile-avatar-frame-picker';
import { ProfileNotificationStylePicker } from './profile-notification-style-picker';

/**
 * 个人中心：通知样式、头像、头像框（Credits / Token 在下方独立卡片 `NotificationCenterUsageCard`）
 */
export function ProfileUsageCard() {
  const [activeTab, setActiveTab] = useState('notification');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const applyHash = () => {
      if (window.location.hash === '#profile-usage-card-notification') {
        setActiveTab('notification');
        document.getElementById('profile-usage-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (window.location.hash === '#profile-usage-card-avatar') {
        setActiveTab('avatar');
        document.getElementById('profile-usage-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (window.location.hash === '#profile-usage-card-avatar-frame') {
        setActiveTab('avatar-frame');
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
              className="grid h-auto w-full grid-cols-1 gap-0.5 p-1 sm:grid-cols-3"
              variant="default"
              aria-label="个人中心分栏"
            >
              <TabsTrigger value="notification" className="px-1.5 text-xs sm:px-2 sm:text-sm">
                通知样式
              </TabsTrigger>
              <TabsTrigger value="avatar" className="px-1.5 text-xs sm:px-2 sm:text-sm">
                头像
              </TabsTrigger>
              <TabsTrigger value="avatar-frame" className="px-1.5 text-xs sm:px-2 sm:text-sm">
                头像框
              </TabsTrigger>
            </TabsList>
          </div>
        </div>
        <TabsContent
          value="notification"
          id="profile-usage-card-notification"
          className="mt-4 min-w-0 scroll-mt-4"
        >
          <div className="mx-auto w-full max-w-xl sm:max-w-2xl">
            <ProfileNotificationStylePicker />
          </div>
        </TabsContent>
        <TabsContent value="avatar" id="profile-usage-card-avatar" className="mt-4 min-w-0 scroll-mt-4">
          <div className="mx-auto w-full max-w-xl sm:max-w-2xl">
            <ProfileAvatarPicker size="lg" />
          </div>
        </TabsContent>
        <TabsContent
          value="avatar-frame"
          id="profile-usage-card-avatar-frame"
          className="mt-4 min-w-0 scroll-mt-4"
        >
          <div className="mx-auto w-full max-w-xl sm:max-w-2xl">
            <ProfileAvatarFramePicker />
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
