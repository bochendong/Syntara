'use client';

import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { LayoutGrid } from 'lucide-react';
import { LEFT_RAIL_BAR_STAGE_OPTIONS } from '@/lib/notifications/notification-bar-stage-ids';
import { useUserProfileStore, type LeftRailBarStageChoice } from '@/lib/store/user-profile';
import { cn } from '@/lib/utils';

/** 个人中心：侧栏动效选择区与快捷入口 */
const LEFT_RAIL_STAGE_CHOICES: { id: LeftRailBarStageChoice; label: string }[] = [
  { id: 'default', label: '默认' },
  ...LEFT_RAIL_BAR_STAGE_OPTIONS,
];

export function ProfileSidebarPanel() {
  const router = useRouter();
  const leftRailBarStageId = useUserProfileStore((s) => s.leftRailBarStageId);
  const setLeftRailBarStageId = useUserProfileStore((s) => s.setLeftRailBarStageId);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="rounded-2xl border border-border/70 bg-card/60 p-3 shadow-sm">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
          <LayoutGrid className="size-4 text-violet-500" strokeWidth={1.9} />
          侧栏动效底图
        </div>
        <p className="mb-2 text-xs text-muted-foreground">
          选择后左侧主导航会立即出现预览（含个人中心、设置等页面）；在课程/聊天等页面为笔记本皮肤下的同款效果。
        </p>
        <div className="grid w-full min-w-0 grid-cols-2 content-start items-stretch gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {LEFT_RAIL_STAGE_CHOICES.map(({ id, label }) => {
            const selected = leftRailBarStageId === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setLeftRailBarStageId(id)}
                className={cn(
                  'flex min-h-[2.75rem] items-center justify-center gap-0.5 rounded-xl border px-2 py-2 text-center text-xs font-semibold leading-tight transition-all',
                  selected
                    ? 'border-violet-300/70 bg-violet-50 text-violet-950 ring-2 ring-violet-300/70 dark:border-violet-300/35 dark:bg-violet-400/12 dark:text-violet-50 dark:ring-violet-400/30'
                    : 'border-border/70 bg-background/55 text-foreground hover:border-muted-foreground/40 hover:bg-background/80',
                )}
                aria-pressed={selected}
                aria-label={id === 'default' ? '侧栏使用系统默认白底/深底' : `侧栏使用${label}动效`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => router.push('/chat')}>
          打开聊天页试试右侧栏
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => router.push('/my-courses')}>
          返回我的课程
        </Button>
      </div>
    </div>
  );
}
