'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useUserProfileStore, AVATAR_OPTIONS } from '@/lib/store/user-profile';
import { useGamificationSummary } from '@/lib/hooks/use-gamification-summary';
import { UserAvatarWithFrame } from './user-avatar-with-frame';

function isCustomAvatar(avatar: string) {
  return avatar.startsWith('data:');
}

/** 大卡片：桌面端 10 列×4 行=40 格/页；窄屏为 5 列 */
const AVATARS_PER_PAGE_LG = 40;

type ProfileAvatarPickerProps = {
  /** 头像圆尺寸，默认适合卡片内 */
  size?: 'md' | 'lg';
  className?: string;
};

export function ProfileAvatarPicker({ size = 'md', className }: ProfileAvatarPickerProps) {
  const avatar = useUserProfileStore((s) => s.avatar);
  const setAvatar = useUserProfileStore((s) => s.setAvatar);
  const avatarFrameId = useUserProfileStore((s) => s.avatarFrameId);
  const { summary } = useGamificationSummary(true);
  const [page, setPage] = useState(0);
  /** lg：与网格选择同步，点「应用」后再写入 store */
  const [draft, setDraft] = useState(avatar);

  const isLg = size === 'lg';
  useEffect(() => {
    if (isLg) setDraft(avatar);
  }, [avatar, isLg]);

  const ring = size === 'lg' ? 'size-20' : 'size-11';
  /** lg：格内不固定 px，避免 10 列+窄容器时比列宽大导致重叠；最大 4.5rem */
  const chipLg = 'min-w-0 w-full max-w-[4.5rem] aspect-square shrink-0';
  const chipMd = 'size-8';
  const unlockedAvatarOptions =
    summary?.databaseEnabled && summary.avatarInventory.items.length > 0
      ? summary.avatarInventory.items.filter((item) => item.owned).map((item) => item.url)
      : AVATAR_OPTIONS;
  const availableAvatarOptions =
    !isCustomAvatar(avatar) && avatar && !unlockedAvatarOptions.includes(avatar)
      ? [avatar, ...unlockedAvatarOptions]
      : unlockedAvatarOptions;
  const avatarsPerPage = size === 'lg' ? AVATARS_PER_PAGE_LG : 9;
  const totalPages = Math.max(1, Math.ceil(availableAvatarOptions.length / avatarsPerPage));
  const safePage = Math.min(page, totalPages - 1);
  const pageStart = safePage * avatarsPerPage;
  const visibleAvatars = availableAvatarOptions.slice(pageStart, pageStart + avatarsPerPage);
  const previewSrc = isLg ? draft : avatar;
  const selection = isLg ? draft : avatar;

  return (
    <div className={cn('flex min-w-0 flex-col gap-3', className)}>
      {isLg ? (
        <div className="flex w-full min-w-0 flex-col items-center">
          <UserAvatarWithFrame
            src={previewSrc}
            frameId={avatarFrameId}
            className={cn('bg-gray-50 dark:bg-gray-800', ring)}
            imgClassName=""
            role="img"
            aria-label="当前头像"
          />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <UserAvatarWithFrame
            src={avatar}
            frameId={avatarFrameId}
            className={cn('bg-gray-50 dark:bg-gray-800', ring)}
            imgClassName=""
            aria-hidden
          />
          <p className="text-xs text-muted-foreground">当前头像</p>
        </div>
      )}

      {isLg ? <Separator className="my-0.5 bg-border/80" /> : null}

      <div
        className={cn(
          'min-w-0',
          size === 'lg'
            ? 'grid w-full min-w-0 auto-rows-min grid-cols-5 content-start items-center justify-items-stretch gap-3 sm:min-h-80 sm:grid-cols-10 sm:gap-4'
            : 'flex flex-wrap items-center gap-1.5',
        )}
      >
        {visibleAvatars.map((url) => (
          <button
            key={url}
            type="button"
            onClick={() => (isLg ? setDraft(url) : setAvatar(url))}
            className={cn(
              'rounded-full overflow-hidden bg-gray-50 dark:bg-gray-800 cursor-pointer transition-all duration-150',
              size === 'lg' ? ['justify-self-center', chipLg, 'active:brightness-95'] : [chipMd, 'hover:scale-110 active:scale-95'],
              selection === url
                ? 'ring-2 ring-violet-400 dark:ring-violet-500 ring-offset-1 ring-offset-background z-[1]'
                : 'hover:ring-1 hover:ring-muted-foreground/30',
            )}
            aria-label="选择此预设头像"
            aria-pressed={selection === url}
          >
            <img src={url} alt="" className="size-full object-cover" />
          </button>
        ))}
      </div>
      {isLg ? (
        <div className="flex w-full min-w-0 justify-end">
          <Button
            type="button"
            size="sm"
            className="shrink-0"
            disabled={draft === avatar}
            onClick={() => setAvatar(draft)}
          >
            应用
          </Button>
        </div>
      ) : null}
      {totalPages > 1 ? (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <button
            type="button"
            className="rounded-md border border-border/70 px-2 py-0.5 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
          >
            上一页
          </button>
          <span>
            {safePage + 1} / {totalPages}
          </span>
          <button
            type="button"
            className="rounded-md border border-border/70 px-2 py-0.5 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={safePage >= totalPages - 1}
          >
            下一页
          </button>
        </div>
      ) : null}
    </div>
  );
}
