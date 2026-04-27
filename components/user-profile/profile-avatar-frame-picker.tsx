'use client';

import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { UserAvatarFrameId } from '@/lib/constants/user-avatar-frames';
import {
  USER_AVATAR_FRAME_OPTIONS,
  userAvatarFrameRequiredLevel,
} from '@/lib/constants/user-avatar-frames';
import { useUserProfileStore } from '@/lib/store/user-profile';
import { useGamificationSummary } from '@/lib/hooks/use-gamification-summary';
import { UserAvatarWithFrame } from './user-avatar-with-frame';

/**
 * 个人中心：为圆头像选择外框（存于 `avatarFrameId`）
 */
export function ProfileAvatarFramePicker() {
  const avatar = useUserProfileStore((s) => s.avatar);
  const avatarFrameId = useUserProfileStore((s) => s.avatarFrameId);
  const setAvatarFrameId = useUserProfileStore((s) => s.setAvatarFrameId);
  const { summary } = useGamificationSummary(true);
  const [draft, setDraft] = useState<UserAvatarFrameId>(avatarFrameId);
  const currentLevel = summary?.databaseEnabled ? summary.profile.affinityLevel : 1;

  useEffect(() => {
    setDraft(avatarFrameId);
  }, [avatarFrameId]);

  const selectedRequiredLevel = userAvatarFrameRequiredLevel(draft);
  const selectedUnlocked = currentLevel >= selectedRequiredLevel;
  const canApply = selectedUnlocked && draft !== avatarFrameId;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm font-medium text-foreground">预览</p>
        <UserAvatarWithFrame
          src={avatar}
          frameId={draft}
          className="size-24 sm:size-28"
          imgClassName="ring-1 ring-black/5 dark:ring-white/10"
          role="img"
          aria-label="头像框预览"
        />
        <p className="text-center text-xs text-muted-foreground">
          {selectedUnlocked
            ? '在下方点选后点击「应用」保存，将同步到侧栏等处。'
            : `当前头像框需要成长等级 Lv.${selectedRequiredLevel}，你现在是 Lv.${currentLevel}；可预览但不可应用。`}
        </p>
      </div>
      <ul className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {USER_AVATAR_FRAME_OPTIONS.map((opt) => {
          const active = draft === opt.id;
          const unlocked = currentLevel >= opt.requiredLevel;
          return (
            <li key={opt.id} className="min-w-0">
              <button
                type="button"
                onClick={() => setDraft(opt.id)}
                className={cn(
                  'relative flex w-full min-w-0 flex-col items-center gap-2 rounded-2xl border p-3 transition-colors',
                  active
                    ? 'border-violet-400/80 bg-violet-500/8 dark:border-violet-400/50'
                    : 'border-border/60 bg-muted/30 hover:border-border',
                )}
                aria-pressed={active}
                aria-label={
                  unlocked
                    ? `选择头像框：${opt.label}`
                    : `预览未解锁的头像框：${opt.label}，需要成长等级${opt.requiredLevel}`
                }
              >
                {!unlocked ? (
                  <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/90 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm">
                    <Lock className="size-3" strokeWidth={2} />
                    Lv.{opt.requiredLevel}
                  </span>
                ) : null}
                <UserAvatarWithFrame
                  src={avatar}
                  frameId={opt.id}
                  className="size-14"
                  imgClassName="ring-1 ring-black/5 dark:ring-white/10"
                />
                <span className="w-full truncate text-center text-xs font-medium text-foreground">
                  {opt.label}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {unlocked ? '已解锁' : `成长 Lv.${opt.requiredLevel}`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {!selectedUnlocked ? (
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs text-amber-950 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100">
          当前只是预览，未解锁不可应用：需要成长等级 Lv.{selectedRequiredLevel}。
        </div>
      ) : null}

      <div className="flex w-full min-w-0 flex-wrap justify-end gap-2">
        <Button
          type="button"
          size="sm"
          className="shrink-0"
          disabled={!canApply}
          onClick={() => {
            if (!selectedUnlocked) {
              toast.error(`成长等级达到 Lv.${selectedRequiredLevel} 后可应用此头像框`);
              return;
            }
            setAvatarFrameId(draft);
          }}
        >
          应用
        </Button>
      </div>
    </div>
  );
}
