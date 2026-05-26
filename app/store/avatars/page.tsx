'use client';

import { AvatarCollectionStoreCard } from '@/components/gamification/avatar-collection-store-card';

export default function AvatarStorePage() {
  return (
    <div className="relative min-h-full w-full overflow-y-auto apple-mesh-bg">
      {/* 与 app/live2d/page.tsx 一致：铺满右侧主内容区（父级 h-[calc(100dvh-1rem)] 可解 height:100%） */}
      <main className="relative z-10 flex min-h-full w-full flex-col p-3 sm:p-4">
        <div className="flex min-h-0 flex-1 flex-col">
          <AvatarCollectionStoreCard />
        </div>
      </main>
    </div>
  );
}
