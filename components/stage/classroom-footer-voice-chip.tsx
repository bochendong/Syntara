'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Volume2 } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { DEFAULT_TTS_VOICES, TTS_PROVIDERS, getTTSVoices } from '@/lib/audio/constants';
import type { TTSProviderId } from '@/lib/audio/types';
import { getActiveVoiceDisplay, voiceRowBlurb } from '@/lib/audio/voice-display';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** 底栏右侧：当前朗读音色摘要与快速选择（与设置一致） */
export function ClassroomFooterVoiceChip() {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const ttsProviderId = useSettingsStore((s) => s.ttsProviderId);
  const ttsVoice = useSettingsStore((s) => s.ttsVoice);
  const ttsProvidersConfig = useSettingsStore((s) => s.ttsProvidersConfig);
  const setTTSProvider = useSettingsStore((s) => s.setTTSProvider);
  const setTTSVoice = useSettingsStore((s) => s.setTTSVoice);
  const voiceDisplay = useMemo(
    () => getActiveVoiceDisplay(ttsProviderId, ttsVoice, t, locale),
    [ttsProviderId, ttsVoice, t, locale],
  );
  const availableProviders = useMemo(
    () =>
      Object.values(TTS_PROVIDERS).filter((provider) => {
        const config = ttsProvidersConfig?.[provider.id];
        return (
          !provider.requiresApiKey ||
          Boolean(config?.apiKey?.trim()) ||
          Boolean(config?.isServerConfigured) ||
          provider.id === ttsProviderId
        );
      }),
    [ttsProviderId, ttsProvidersConfig],
  );
  const voices = useMemo(() => getTTSVoices(ttsProviderId), [ttsProviderId]);
  const providerLabel = TTS_PROVIDERS[ttsProviderId]?.name || ttsProviderId;
  const providerFieldLabel = locale === 'zh-CN' ? '语音服务' : 'Voice service';
  const voiceFieldLabel = locale === 'zh-CN' ? '音色' : 'Voice';

  const voiceTitle =
    voiceDisplay.blurb != null && voiceDisplay.blurb !== ''
      ? `${t('stage.ttsVoiceLabel')}：${voiceDisplay.name} — ${voiceDisplay.blurb}`
      : `${t('stage.ttsVoiceLabel')}：${voiceDisplay.name}`;

  return (
    <TooltipProvider delayDuration={250}>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'inline-flex max-w-[min(100%,20rem)] shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-left',
                  'border-slate-200/70 bg-slate-50/90 text-[11px] leading-tight transition-colors hover:bg-slate-100/90',
                  'focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
                  'dark:border-white/[0.1] dark:bg-white/[0.05] dark:hover:bg-white/[0.08]',
                )}
                aria-haspopup="dialog"
                aria-expanded={open}
              >
                <Volume2
                  className="size-3 shrink-0 text-slate-500 opacity-80 dark:text-slate-400"
                  aria-hidden
                />
                <span className="min-w-0 truncate text-slate-600 dark:text-slate-300">
                  <span className="text-slate-500 dark:text-slate-400">
                    {t('stage.ttsVoiceLabel')}
                  </span>
                  <span className="mx-1 text-slate-400 dark:text-slate-500">·</span>
                  <span className="font-medium text-slate-800 dark:text-slate-100">
                    {voiceDisplay.name}
                  </span>
                  {voiceDisplay.blurb ? (
                    <span className="text-slate-500 dark:text-slate-400">
                      {' '}
                      · {voiceDisplay.blurb}
                    </span>
                  ) : null}
                </span>
                <ChevronDown className="size-3 shrink-0 text-slate-400" aria-hidden />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            {voiceTitle}
          </TooltipContent>
        </Tooltip>
        <PopoverContent
          align="end"
          side="top"
          sideOffset={8}
          className="w-[min(100vw-1.5rem,22rem)] p-0"
        >
          <div className="border-b border-border/60 px-3 py-2">
            <p className="text-xs font-medium text-foreground">{t('stage.ttsVoiceLabel')}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {providerLabel} / {voiceDisplay.name}
            </p>
          </div>
          <div className="space-y-3 p-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground">
                {providerFieldLabel}
              </label>
              <Select
                value={ttsProviderId}
                onValueChange={(value) => {
                  const nextProviderId = value as TTSProviderId;
                  setTTSProvider(nextProviderId);
                  setTTSVoice(DEFAULT_TTS_VOICES[nextProviderId] || 'default');
                }}
              >
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {availableProviders.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id} className="text-xs">
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground">
                {voiceFieldLabel}
              </label>
              <div className="max-h-64 overflow-y-auto rounded-md border border-border/60 p-1">
                {voices.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-muted-foreground">
                    {t('toolbar.ttsVoiceListEmpty')}
                  </p>
                ) : (
                  voices.map((voice) => {
                    const blurb = voiceRowBlurb(voice, t, locale);
                    return (
                      <button
                        key={voice.id}
                        type="button"
                        className={cn(
                          'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                          voice.id === ttsVoice
                            ? 'bg-primary/12 font-medium text-primary'
                            : 'text-foreground hover:bg-muted/80',
                        )}
                        onClick={() => {
                          setTTSVoice(voice.id);
                          setOpen(false);
                        }}
                      >
                        <span className="min-w-0 shrink-0 font-medium">{voice.name}</span>
                        {blurb ? (
                          <span
                            className={cn(
                              'min-w-0 flex-1 text-right text-[11px] leading-snug text-muted-foreground line-clamp-2',
                              voice.id === ttsVoice && 'text-primary/80',
                            )}
                          >
                            {blurb}
                          </span>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
