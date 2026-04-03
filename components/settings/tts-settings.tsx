'use client';

import { useState, useEffect, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { SettingsButton } from '@/components/settings/settings-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { TTS_PROVIDERS, DEFAULT_TTS_VOICES, getTTSVoices } from '@/lib/audio/constants';
import type { TTSProviderId } from '@/lib/audio/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Volume2, Loader2, CheckCircle2, XCircle, Eye, EyeOff, Info, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createLogger } from '@/lib/logger';
import { useTTSPreview } from '@/lib/audio/use-tts-preview';

const log = createLogger('TTSSettings');

interface TTSSettingsProps {
  selectedProviderId: TTSProviderId;
}

export function TTSSettings({ selectedProviderId }: TTSSettingsProps) {
  const { t } = useI18n();

  const ttsVoice = useSettingsStore((state) => state.ttsVoice);
  const ttsSpeed = useSettingsStore((state) => state.ttsSpeed);
  const ttsProvidersConfig = useSettingsStore((state) => state.ttsProvidersConfig);
  const setTTSProviderConfig = useSettingsStore((state) => state.setTTSProviderConfig);
  const activeProviderId = useSettingsStore((state) => state.ttsProviderId);
  const setTTSProvider = useSettingsStore((state) => state.setTTSProvider);
  const setTTSVoice = useSettingsStore((state) => state.setTTSVoice);
  const setTTSSpeed = useSettingsStore((state) => state.setTTSSpeed);

  /** When previewing a provider that is not the active one, keep a separate voice/speed for the test button */
  const [previewVoice, setPreviewVoice] = useState<string | null>(null);
  const [previewSpeed, setPreviewSpeed] = useState<number | null>(null);

  const effectiveVoice = useMemo(() => {
    if (selectedProviderId === activeProviderId) {
      return ttsVoice;
    }
    return previewVoice ?? (DEFAULT_TTS_VOICES[selectedProviderId] || 'default');
  }, [selectedProviderId, activeProviderId, ttsVoice, previewVoice]);

  const effectiveSpeed = useMemo(() => {
    if (selectedProviderId === activeProviderId) {
      return ttsSpeed;
    }
    return previewSpeed ?? ttsSpeed;
  }, [selectedProviderId, activeProviderId, ttsSpeed, previewSpeed]);

  const handleVoiceChange = (v: string) => {
    if (selectedProviderId === activeProviderId) {
      setTTSVoice(v);
    } else {
      setPreviewVoice(v);
    }
  };

  const handleSpeedChange = (v: number) => {
    if (selectedProviderId === activeProviderId) {
      setTTSSpeed(v);
    } else {
      setPreviewSpeed(v);
    }
  };

  const ttsProvider = TTS_PROVIDERS[selectedProviderId] ?? TTS_PROVIDERS['openai-tts'];
  const isServerConfigured = !!ttsProvidersConfig[selectedProviderId]?.isServerConfigured;
  const anyTtsProviderServerConfigured = useMemo(
    () => Object.values(ttsProvidersConfig).some((c) => c?.isServerConfigured),
    [ttsProvidersConfig],
  );
  const serverProviderIds = useMemo(
    () =>
      (Object.keys(ttsProvidersConfig) as TTSProviderId[]).filter(
        (pid) => !!ttsProvidersConfig[pid]?.isServerConfigured,
      ),
    [ttsProvidersConfig],
  );
  const systemManaged = anyTtsProviderServerConfigured;

  const [showApiKey, setShowApiKey] = useState(false);
  const [testText, setTestText] = useState(t('settings.ttsTestTextDefault'));
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const { previewing: testingTTS, startPreview, stopPreview } = useTTSPreview();

  // Update test text when language changes
  useEffect(() => {
    setTestText(t('settings.ttsTestTextDefault'));
  }, [t]);

  // Reset state when provider changes
  useEffect(() => {
    stopPreview();
    setShowApiKey(false);
    setTestStatus('idle');
    setTestMessage('');
  }, [selectedProviderId, stopPreview]);

  useEffect(() => {
    if (!systemManaged) return;
    if (!serverProviderIds.length) return;
    if (!ttsProvidersConfig[selectedProviderId]?.isServerConfigured) {
      setTTSProvider(serverProviderIds[0]);
    }
  }, [systemManaged, serverProviderIds, selectedProviderId, setTTSProvider, ttsProvidersConfig]);

  const handleTestTTS = async () => {
    if (!testText.trim()) return;

    setTestStatus('testing');
    setTestMessage('');

    try {
      await startPreview({
        text: testText,
        providerId: selectedProviderId,
        voice: effectiveVoice,
        speed: effectiveSpeed,
        apiKey: ttsProvidersConfig[selectedProviderId]?.apiKey,
        baseUrl: ttsProvidersConfig[selectedProviderId]?.baseUrl,
      });
      setTestStatus('success');
      setTestMessage(t('settings.ttsTestSuccess'));
    } catch (error) {
      log.error('TTS test failed:', error);
      setTestStatus('error');
      setTestMessage(
        error instanceof Error && error.message
          ? `${t('settings.ttsTestFailed')}: ${error.message}`
          : t('settings.ttsTestFailed'),
      );
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {systemManaged && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Volume2 className="h-4 w-4" />
              系统语音合成
            </CardTitle>
            <CardDescription>
              语音来源于管理员配置。你可以在管理员开放的语音服务范围内切换 Provider 和音色，API Key 由系统统一托管。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Provider: {ttsProvider?.name || selectedProviderId}</Badge>
              <Badge variant="secondary">Voice: {effectiveVoice}</Badge>
              <Badge variant="outline" className="gap-1">
                <ShieldCheck className="h-3.5 w-3.5" />
                系统托管
              </Badge>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">选择语音服务（管理员开放范围）</Label>
                <Select value={selectedProviderId} onValueChange={(v) => setTTSProvider(v as TTSProviderId)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {serverProviderIds.map((pid) => (
                      <SelectItem key={pid} value={pid}>
                        {TTS_PROVIDERS[pid]?.name || pid}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground">
              <p className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>你的语音调用将统一走站点管理员配置的服务，系统会记录调用情况用于统计与运维。</span>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Server-configured notice */}
      {!systemManaged && isServerConfigured && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3 text-sm text-blue-700 dark:text-blue-300">
          {t('settings.serverConfiguredNotice')}
        </div>
      )}
      {!systemManaged && !isServerConfigured && anyTtsProviderServerConfigured && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3 text-sm text-blue-700 dark:text-blue-300">
          {t('settings.serverConfiguredNoticeOtherProvider')}
        </div>
      )}

      {/* API Key & Base URL */}
      {!systemManaged && (ttsProvider.requiresApiKey || isServerConfigured) && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">{t('settings.ttsApiKey')}</Label>
              <div className="relative">
                <Input
                  name={`tts-api-key-${selectedProviderId}`}
                  type={showApiKey ? 'text' : 'password'}
                  autoComplete="new-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder={
                    isServerConfigured ? t('settings.optionalOverride') : t('settings.enterApiKey')
                  }
                  value={ttsProvidersConfig[selectedProviderId]?.apiKey || ''}
                  onChange={(e) =>
                    setTTSProviderConfig(selectedProviderId, {
                      apiKey: e.target.value,
                    })
                  }
                  className="font-mono text-sm pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">{t('settings.ttsBaseUrl')}</Label>
              <Input
                name={`tts-base-url-${selectedProviderId}`}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder={ttsProvider.defaultBaseUrl || t('settings.enterCustomBaseUrl')}
                value={ttsProvidersConfig[selectedProviderId]?.baseUrl || ''}
                onChange={(e) =>
                  setTTSProviderConfig(selectedProviderId, {
                    baseUrl: e.target.value,
                  })
                }
                className="text-sm"
              />
            </div>
          </div>
          {/* Request URL Preview */}
          {(() => {
            const effectiveBaseUrl =
              ttsProvidersConfig[selectedProviderId]?.baseUrl || ttsProvider.defaultBaseUrl || '';
            if (!effectiveBaseUrl) return null;
            let endpointPath = '';
            switch (selectedProviderId) {
              case 'openai-tts':
              case 'glm-tts':
                endpointPath = '/audio/speech';
                break;
              case 'azure-tts':
                endpointPath = '/cognitiveservices/v1';
                break;
              case 'qwen-tts':
                endpointPath = '/services/aigc/multimodal-generation/generation';
                break;
              case 'elevenlabs-tts':
                endpointPath = '/text-to-speech';
                break;
            }
            if (!endpointPath) return null;
            return (
              <p className="text-xs text-muted-foreground break-all">
                {t('settings.requestUrl')}: {effectiveBaseUrl + endpointPath}
              </p>
            );
          })()}
        </>
      )}

      {/* Voice & speed — applies to playback and course narration when this provider is active */}
      {selectedProviderId !== 'browser-native-tts' && getTTSVoices(selectedProviderId).length > 0 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm">{t('settings.ttsVoice')}</Label>
            <Select value={effectiveVoice} onValueChange={handleVoiceChange}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getTTSVoices(selectedProviderId).map((voice) => {
                  const genderSuffix =
                    voice.gender === 'male'
                      ? ` · ${t('settings.voiceGenderMale')}`
                      : voice.gender === 'female'
                        ? ` · ${t('settings.voiceGenderFemale')}`
                        : '';
                  const desc = voice.description
                    ? ` — ${t(`settings.${voice.description}` as 'settings.voiceAlloy')}`
                    : '';
                  return (
                    <SelectItem key={voice.id} value={voice.id}>
                      {voice.name}
                      {desc}
                      {genderSuffix}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {selectedProviderId === 'openai-tts' && (
              <p className="text-xs text-muted-foreground">{t('settings.ttsVoiceOpenaiHint')}</p>
            )}
          </div>

          {ttsProvider.speedRange && (
            <div className="space-y-2">
              <Label className="text-sm">{t('settings.ttsSpeed')}</Label>
              <div className="flex items-center gap-3">
                <Slider
                  value={[effectiveSpeed]}
                  onValueChange={(value) => handleSpeedChange(value[0])}
                  min={ttsProvider.speedRange.min}
                  max={ttsProvider.speedRange.max}
                  step={0.1}
                  className="flex-1"
                />
                <span className="min-w-[3rem] text-right text-xs font-medium tabular-nums text-[#007AFF] dark:text-[#5AC8FA]">
                  {effectiveSpeed.toFixed(1)}x
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Test TTS */}
      <div className="space-y-2">
        <Label className="text-sm">{t('settings.testTTS')}</Label>
        <div className="flex gap-2">
          <Input
            placeholder={t('settings.ttsTestTextPlaceholder')}
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            className="flex-1"
          />
          <SettingsButton
            onClick={handleTestTTS}
            disabled={
              testingTTS ||
              !testText.trim() ||
              (ttsProvider.requiresApiKey &&
                !ttsProvidersConfig[selectedProviderId]?.apiKey?.trim() &&
                !isServerConfigured)
            }
            className="w-32 gap-2"
          >
            {testingTTS ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
            {t('settings.testTTS')}
          </SettingsButton>
        </div>
      </div>

      {testMessage && (
        <div
          className={cn(
            'rounded-lg p-3 text-sm overflow-hidden',
            testStatus === 'success' &&
              'bg-green-50 text-green-700 border border-green-200 dark:bg-green-950/50 dark:text-green-400 dark:border-green-800',
            testStatus === 'error' &&
              'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800',
          )}
        >
          <div className="flex items-start gap-2 min-w-0">
            {testStatus === 'success' && <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />}
            {testStatus === 'error' && <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
            <p className="flex-1 min-w-0 break-all">{testMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}
