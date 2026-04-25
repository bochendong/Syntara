'use client';

import { LayoutGrid, Palette, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { TalkingAvatarOverlay } from '@/components/canvas/talking-avatar-overlay';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  getNotificationCardTheme,
  NOTIFICATION_STYLE_PRESET_LIST,
  type NotificationCardStyleChoice,
  type NotificationStyleId,
} from '@/lib/notifications/card-theme';
import { NotificationBarStageBackground } from '@/lib/notifications/notification-bar-stage-background';
import { NOTIFICATION_BAR_STAGE_OPTIONS } from '@/lib/notifications/notification-bar-stage-ids';
import type { NotificationBarStageId } from '@/lib/notifications/notification-bar-stage-ids';
import { resolveNotificationCompanionModelId } from '@/lib/notifications/companion-model';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/lib/store/settings';
import { useUserProfileStore } from '@/lib/store/user-profile';
import type { AppNotification } from '@/lib/notifications/types';

const PREVIEW_MOCK: Pick<AppNotification, 'sourceKind' | 'tone'> = {
  sourceKind: 'LESSON_REWARD',
  tone: 'positive',
};
const PREVIEW_SPEECH = '这节课学得很稳，奖励已经到账啦。';

const STYLE_SWATCH_CLASS: Record<NotificationStyleId, string> = {
  green: 'bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.55)]',
  blue: 'bg-sky-300 shadow-[0_0_18px_rgba(56,189,248,0.5)]',
  yellow: 'bg-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.5)]',
  purple: 'bg-violet-300 shadow-[0_0_18px_rgba(167,139,250,0.5)]',
  pink: 'bg-fuchsia-300 shadow-[0_0_18px_rgba(232,121,249,0.5)]',
};

const STYLE_OPTIONS: {
  id: NotificationCardStyleChoice;
  label: string;
  description: string;
  swatchClass: string;
}[] = [
  {
    id: 'auto',
    label: '智能',
    description: '随通知类型变色',
    swatchClass: 'bg-[conic-gradient(from_140deg,#67e8f9,#7dd3fc,#fcd34d,#c4b5fd,#f0abfc,#67e8f9)]',
  },
  ...NOTIFICATION_STYLE_PRESET_LIST.map((preset) => ({
    ...preset,
    description: '固定主题色',
    swatchClass: STYLE_SWATCH_CLASS[preset.id],
  })),
];

type ProfileNotificationStylePickerProps = {
  className?: string;
};

export function ProfileNotificationStylePicker({ className }: ProfileNotificationStylePickerProps) {
  const notificationBarStageId = useUserProfileStore((s) => s.notificationBarStageId);
  const setNotificationBarStageId = useUserProfileStore((s) => s.setNotificationBarStageId);
  const notificationCardStyle = useUserProfileStore((s) => s.notificationCardStyle);
  const setNotificationCardStyle = useUserProfileStore((s) => s.setNotificationCardStyle);
  const notificationCompanionId = useSettingsStore((s) => s.notificationCompanionId);
  const checkInCompanionId = useSettingsStore((s) => s.checkInCompanionId);
  const [draft, setDraft] = useState<NotificationBarStageId>(notificationBarStageId);
  const [draftStyle, setDraftStyle] = useState<NotificationCardStyleChoice>(notificationCardStyle);
  const [companionSpeaking, setCompanionSpeaking] = useState(true);

  const resolvedCompanionModelId = resolveNotificationCompanionModelId(
    PREVIEW_MOCK,
    notificationCompanionId,
    checkInCompanionId,
  );
  const theme = getNotificationCardTheme(PREVIEW_MOCK, draftStyle);

  useEffect(() => {
    setDraft(notificationBarStageId);
  }, [notificationBarStageId]);

  useEffect(() => {
    setDraftStyle(notificationCardStyle);
  }, [notificationCardStyle]);

  useEffect(() => {
    setCompanionSpeaking(true);
    const t = window.setTimeout(() => {
      setCompanionSpeaking(false);
    }, 2200);
    return () => window.clearTimeout(t);
  }, [resolvedCompanionModelId, draft, draftStyle]);

  return (
    <div className={cn('flex min-w-0 flex-col gap-3', className)}>
      <div className="flex w-full min-w-0 flex-col items-center">
        <div
          className="relative w-full max-w-[420px] overflow-hidden rounded-[24px] border border-white/12 bg-black shadow-[0_24px_70px_rgba(0,0,0,0.45)] dark:border-white/10"
          role="region"
          aria-label="全站弹层通知样式预览"
        >
          <div className="absolute inset-0 z-0 bg-black" aria-hidden />
          <div className={cn('absolute inset-0 z-[1]', theme.glowClass)} aria-hidden />
          <NotificationBarStageBackground id={draft} className="min-h-[12rem]" />
          <div
            className="absolute inset-0 z-[1] bg-gradient-to-b from-black/15 via-black/20 to-black/40"
            aria-hidden
          />
          <div
            className={cn(
              'absolute inset-x-0 top-0 z-[2] h-px bg-gradient-to-r',
              theme.topLineClass,
            )}
          />
          <div className="relative z-10 flex min-h-[12rem] items-stretch gap-3 p-4">
            <span
              className="absolute right-4 top-4 z-20 text-xs text-white tabular-nums [text-shadow:0_1px_8px_rgba(0,0,0,0.5)]"
              aria-label="12:34"
            >
              12:34
            </span>
            <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col pe-11 sm:pe-0">
              <div className="flex w-full min-w-0 flex-wrap items-center justify-start gap-x-3 gap-y-1.5">
                <div className="flex min-w-0 flex-wrap items-center justify-start gap-2 sm:shrink-0">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold backdrop-blur-md',
                      theme.amountPrimaryClass,
                    )}
                  >
                    +8 现金学分
                  </span>
                  <span className="shrink-0 rounded-full border border-white/12 bg-white/10 px-2.5 py-1 text-xs text-white backdrop-blur-md">
                    当前余额 1,200
                  </span>
                </div>
              </div>
              <p className="mt-1 text-sm text-white [text-shadow:0_1px_12px_rgba(0,0,0,0.65)]">
                {PREVIEW_SPEECH}
              </p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.55)]">
                节末进度已记录，随堂现金学分与明细以通知与账本为准。
              </p>
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                  看课奖励
                </span>
                <Button
                  type="button"
                  size="sm"
                  className={cn(
                    'h-7 shrink-0 rounded-full px-3 text-[11px] font-semibold backdrop-blur-md hover:brightness-110',
                    theme.amountPrimaryClass,
                  )}
                  aria-label="查看明细（仅样式预览，无操作）"
                >
                  查看明细
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 gap-1 rounded-full px-2.5 text-[11px] font-medium text-white hover:bg-white/10 hover:text-white"
                  aria-label="关闭（仅样式预览，无操作）"
                >
                  <X className="size-3.5 shrink-0" strokeWidth={2} />
                  关闭
                </Button>
              </div>
            </div>
            <div className="hidden shrink-0 self-center sm:flex">
              <div className="relative flex h-[172px] w-[118px] items-end overflow-hidden rounded-[22px]">
                <TalkingAvatarOverlay
                  layout="card"
                  speaking={companionSpeaking}
                  cadence="active"
                  speechText={PREVIEW_SPEECH}
                  modelIdOverride={resolvedCompanionModelId}
                  cardFraming={
                    resolvedCompanionModelId === 'haru' ||
                    resolvedCompanionModelId === 'hiyori' ||
                    resolvedCompanionModelId === 'rice'
                      ? 'half'
                      : 'default'
                  }
                  showBadge={false}
                  showStatusDot={false}
                  className="h-full min-h-[172px] w-[118px] flex-none"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <Separator className="my-0.5 bg-border/80" />

      <div className="rounded-2xl border border-border/70 bg-card/60 p-3 shadow-sm">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
          <Palette className="size-4 text-violet-500" strokeWidth={1.9} />
          通知配色
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {STYLE_OPTIONS.map((option) => {
            const selected = draftStyle === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setDraftStyle(option.id)}
                className={cn(
                  'flex min-h-[3.25rem] items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-all',
                  selected
                    ? 'border-violet-300/70 bg-violet-50 text-violet-950 ring-2 ring-violet-300/70 dark:border-violet-300/35 dark:bg-violet-400/12 dark:text-violet-50 dark:ring-violet-400/30'
                    : 'border-border/70 bg-background/55 hover:border-muted-foreground/40 hover:bg-background/80',
                )}
                aria-pressed={selected}
                aria-label={`选择${option.label}通知配色`}
              >
                <span
                  className={cn(
                    'size-6 shrink-0 rounded-full border border-white/55',
                    option.swatchClass,
                  )}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold leading-4">{option.label}</span>
                  <span className="block truncate text-[11px] leading-4 text-muted-foreground">
                    {option.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-border/70 bg-card/60 p-3 shadow-sm">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
          <LayoutGrid className="size-4 text-violet-500" strokeWidth={1.9} />
          动效底图
        </div>
        <div className="grid w-full min-w-0 grid-cols-2 content-start items-stretch gap-2 sm:grid-cols-5">
          {NOTIFICATION_BAR_STAGE_OPTIONS.map(({ id, label }) => {
            const selected = draft === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setDraft(id)}
                className={cn(
                  'flex min-h-[3.25rem] items-center justify-center gap-0.5 rounded-xl border px-2.5 py-2 text-center text-xs font-semibold leading-tight transition-all',
                  selected
                    ? 'border-violet-300/70 bg-violet-50 text-violet-950 ring-2 ring-violet-300/70 dark:border-violet-300/35 dark:bg-violet-400/12 dark:text-violet-50 dark:ring-violet-400/30'
                    : 'border-border/70 bg-background/55 text-foreground hover:border-muted-foreground/40 hover:bg-background/80',
                )}
                aria-pressed={selected}
                aria-label={`选择${label}背景`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex w-full min-w-0 justify-end">
        <Button
          type="button"
          size="sm"
          className="shrink-0"
          disabled={draft === notificationBarStageId && draftStyle === notificationCardStyle}
          onClick={() => {
            setNotificationBarStageId(draft);
            setNotificationCardStyle(draftStyle);
          }}
        >
          应用
        </Button>
      </div>
    </div>
  );
}
