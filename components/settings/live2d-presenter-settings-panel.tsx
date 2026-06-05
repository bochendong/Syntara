'use client';

import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { TalkingAvatarOverlay } from '@/components/canvas/talking-avatar-overlay';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { LIVE2D_PRESENTER_MODELS } from '@/lib/live2d/presenter-models';
import { cn } from '@/lib/utils';

export function Live2dPresenterSettingsPanel({ className }: { className?: string }) {
  const { t } = useI18n();
  const live2dPresenterModelId = useSettingsStore((state) => state.live2dPresenterModelId);
  const live2dPresenterVisible = useSettingsStore((state) => state.live2dPresenterVisible);
  const setLive2DPresenterModelId = useSettingsStore((state) => state.setLive2DPresenterModelId);
  const setLive2DPresenterVisible = useSettingsStore(
    (state) => state.setLive2DPresenterVisible,
  );
  const [hoveredModelId, setHoveredModelId] = useState<string | null>(null);
  const activePreviewModelId = hoveredModelId ?? live2dPresenterModelId;

  return (
    <div className={cn('space-y-3', className)}>
      <div>
        <Label className="text-sm font-medium">{t('settings.live2dPresenter')}</Label>
        <p className="mt-1 text-xs text-muted-foreground">{t('settings.live2dPresenterDesc')}</p>
      </div>
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border/70 bg-card/70 px-4 py-3">
        <div className="min-w-0">
          <Label className="text-sm font-medium">{t('settings.live2dPresenterVisibility')}</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('settings.live2dPresenterVisibilityDesc')}
          </p>
        </div>
        <Switch
          checked={live2dPresenterVisible}
          onCheckedChange={setLive2DPresenterVisible}
          aria-label={t('settings.live2dPresenterVisibility')}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Object.values(LIVE2D_PRESENTER_MODELS).map((model) => {
          const selected = live2dPresenterModelId === model.id;
          const renderLive2D = activePreviewModelId === model.id;
          return (
            <button
              key={model.id}
              type="button"
              className={cn(
                'apple-btn h-auto w-full overflow-hidden border-0 p-0 text-left transition-all',
                selected
                  ? 'apple-btn-primary shadow-md ring-2 ring-[#007AFF]/35'
                  : 'apple-btn-secondary',
              )}
              onClick={() => setLive2DPresenterModelId(model.id)}
              onMouseEnter={() => setHoveredModelId(model.id)}
              onMouseLeave={() => setHoveredModelId((current) => (current === model.id ? null : current))}
            >
              <span className="flex w-full flex-col">
                <span className="relative aspect-[4/3] w-full overflow-hidden rounded-t-[inherit] bg-[radial-gradient(circle_at_50%_15%,rgba(125,211,252,0.2),transparent_58%),linear-gradient(180deg,rgba(148,163,184,0.12),rgba(148,163,184,0.04))]">
                  {renderLive2D ? (
                    <TalkingAvatarOverlay
                      layout="card"
                      speaking={false}
                      className="h-full"
                      modelIdOverride={model.id}
                      showBadge={false}
                    />
                  ) : (
                    <img
                      src={model.previewSrc}
                      alt={t(`settings.live2dPresenterOptions.${model.id}.label`)}
                      className="h-full w-full object-cover opacity-90"
                      draggable={false}
                    />
                  )}
                </span>
                <span className="flex flex-col items-start gap-1 px-4 py-3">
                  <span className={cn('text-sm font-medium', selected && 'text-white')}>
                    {t(`settings.live2dPresenterOptions.${model.id}.label`)}
                  </span>
                  <span
                    className={cn(
                      'text-xs leading-relaxed',
                      selected ? 'text-white/85' : 'text-muted-foreground',
                    )}
                  >
                    {t(`settings.live2dPresenterOptions.${model.id}.desc`)}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
