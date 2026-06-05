'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProfileAvatarPicker } from './profile-avatar-picker';
import { ProfileAvatarFramePicker } from './profile-avatar-frame-picker';

/**
 * 个人中心：头像与头像框
 * （Credits / Token 在下方独立卡片 `NotificationCenterUsageCard`）
 */
export function ProfileUsageCard() {
  const [activeTab, setActiveTab] = useState('avatar');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const applyHash = () => {
      if (window.location.hash === '#profile-usage-card-avatar') {
        setActiveTab('avatar');
        document
          .getElementById('profile-usage-card')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (window.location.hash === '#profile-usage-card-avatar-frame') {
        setActiveTab('avatar-frame');
        document
          .getElementById('profile-usage-card')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  return (
    <Card
      id="profile-usage-card"
      className="!gap-0 scroll-mt-24 border-muted/40 bg-white/80 p-5 shadow-xl backdrop-blur-xl dark:bg-slate-900/80"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full min-w-0">
        <div className="border-b border-border/60 pb-4">
          <div className="mx-auto w-full max-w-xl">
            <TabsList
              className="grid h-auto w-full grid-cols-2 gap-0.5 p-1"
              variant="default"
              aria-label="个人中心分栏"
            >
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
          value="avatar"
          id="profile-usage-card-avatar"
          className="mt-4 min-w-0 scroll-mt-4"
        >
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
