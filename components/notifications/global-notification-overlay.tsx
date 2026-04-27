'use client';

import { usePathname } from 'next/navigation';
import { NotificationBannerCard } from '@/components/notifications/notification-banner-card';
import { useNotificationStore } from '@/lib/store/notifications';

const AUTO_DISMISS_MS = 6500;

export function GlobalNotificationOverlay() {
  const pathname = usePathname();
  const activeBanners = useNotificationStore((state) => state.activeBanners);
  const dismissBanner = useNotificationStore((state) => state.dismissBanner);
  const suppressOnLive2dPage = pathname === '/live2d' || pathname?.startsWith('/live2d/');

  if (activeBanners.length === 0 || suppressOnLive2dPage) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[1600] flex justify-center px-4 sm:justify-end sm:px-6">
      <div className="flex w-full max-w-[420px] flex-col gap-3">
        {activeBanners.map((item) => (
          <NotificationBannerCard
            key={item.id}
            item={item}
            onDismiss={dismissBanner}
            autoDismissMs={AUTO_DISMISS_MS}
          />
        ))}
      </div>
    </div>
  );
}
