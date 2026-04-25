'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { UserAvatarFrameId } from '@/lib/constants/user-avatar-frames';
import { USER_AVATAR_FRAME_OPTIONS } from '@/lib/constants/user-avatar-frames';
import { useUserProfileStore } from '@/lib/store/user-profile';
import { UserAvatarWithFrame } from './user-avatar-with-frame';

/**
 * 个人中心：为圆头像选择外框（存于 `avatarFrameId`）
 */
export function ProfileAvatarFramePicker() {
  const avatar = useUserProfileStore((s) => s.avatar);
  const avatarFrameId = useUserProfileStore((s) => s.avatarFrameId);
  const setAvatarFrameId = useUserProfileStore((s) => s.setAvatarFrameId);
  const [draft, setDraft] = useState<UserAvatarFrameId>(avatarFrameId);

  useEffect(() => {
    setDraft(avatarFrameId);
  }, [avatarFrameId]);

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
          在下方点选后点击「应用」保存，将同步到侧栏等处。
        </p>
      </div>
      <ul className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {USER_AVATAR_FRAME_OPTIONS.map((opt) => {
          const active = draft === opt.id;
          return (
            <li key={opt.id} className="min-w-0">
              <button
                type="button"
                onClick={() => setDraft(opt.id)}
                className={cn(
                  'flex w-full min-w-0 flex-col items-center gap-2 rounded-2xl border p-3 transition-colors',
                  active
                    ? 'border-violet-400/80 bg-violet-500/8 dark:border-violet-400/50'
                    : 'border-border/60 bg-muted/30 hover:border-border',
                )}
                aria-pressed={active}
                aria-label={`选择头像框：${opt.label}`}
              >
                <UserAvatarWithFrame
                  src={avatar}
                  frameId={opt.id}
                  className="size-14"
                  imgClassName="ring-1 ring-black/5 dark:ring-white/10"
                />
                <span className="w-full truncate text-center text-xs font-medium text-foreground">
                  {opt.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex w-full min-w-0 justify-end">
        <Button
          type="button"
          size="sm"
          className="shrink-0"
          disabled={draft === avatarFrameId}
          onClick={() => setAvatarFrameId(draft)}
        >
          应用
        </Button>
      </div>
    </div>
  );
}
