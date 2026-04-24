'use client';

import { AvatarCollectionStoreCard } from '@/components/gamification/avatar-collection-store-card';

export default function AvatarStorePage() {
  return (
    <div className="relative h-full w-full min-h-0 overflow-hidden apple-mesh-bg">
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-orb-2 absolute -top-40 right-1/4 h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(236,72,153,0.08)_0%,transparent_70%)]" />
        <div className="animate-orb-1 absolute bottom-0 left-1/4 h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.06)_0%,transparent_70%)]" />
      </div>
      {/* 与 app/live2d/page.tsx 一致：铺满右侧主内容区（父级 h-[calc(100dvh-1rem)] 可解 height:100%） */}
      <main className="relative z-10 flex h-full w-full min-h-0 flex-col p-0">
        <div className="flex min-h-0 flex-1 flex-col">
          <AvatarCollectionStoreCard />
        </div>
      </main>
    </div>
  );
}
