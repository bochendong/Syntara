'use client';

import { useMemo } from 'react';
import { Volume2 } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { getActiveVoiceDisplay } from '@/lib/audio/voice-display';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** 底栏右侧：当前朗读音色摘要（与设置一致） */
export function ClassroomFooterVoiceChip() {
  const { t, locale } = useI18n();
  const ttsProviderId = useSettingsStore((s) => s.ttsProviderId);
  const ttsVoice = useSettingsStore((s) => s.ttsVoice);
  const voiceDisplay = useMemo(
    () => getActiveVoiceDisplay(ttsProviderId, ttsVoice, t, locale),
    [ttsProviderId, ttsVoice, t, locale],
  );

  const voiceTitle =
    voiceDisplay.blurb != null && voiceDisplay.blurb !== ''
      ? `${t('stage.ttsVoiceLabel')}：${voiceDisplay.name} — ${voiceDisplay.blurb}`
      : `${t('stage.ttsVoiceLabel')}：${voiceDisplay.name}`;

  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'inline-flex max-w-[min(100%,20rem)] shrink-0 cursor-default items-center gap-1.5 rounded-lg border px-2 py-1',
              'border-slate-200/70 bg-slate-50/90 text-[11px] leading-tight',
              'dark:border-white/[0.1] dark:bg-white/[0.05]',
            )}
          >
            <Volume2 className="size-3 shrink-0 text-slate-500 opacity-80 dark:text-slate-400" aria-hidden />
            <span className="min-w-0 truncate text-slate-600 dark:text-slate-300">
              <span className="text-slate-500 dark:text-slate-400">{t('stage.ttsVoiceLabel')}</span>
              <span className="mx-1 text-slate-400 dark:text-slate-500">·</span>
              <span className="font-medium text-slate-800 dark:text-slate-100">{voiceDisplay.name}</span>
              {voiceDisplay.blurb ? (
                <span className="text-slate-500 dark:text-slate-400"> · {voiceDisplay.blurb}</span>
              ) : null}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {voiceTitle}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
