'use client';

import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { LIVE2D_PRESENTER_MODELS } from '@/lib/live2d/presenter-models';
import { cn } from '@/lib/utils';

export function Live2dPresenterSettingsPanel({ className }: { className?: string }) {
  const { t } = useI18n();
  const live2dPresenterModelId = useSettingsStore((state) => state.live2dPresenterModelId);
  const setLive2DPresenterModelId = useSettingsStore((state) => state.setLive2DPresenterModelId);

  return (
    <div className={cn('space-y-3', className)}>
      <div>
        <Label className="text-sm font-medium">{t('settings.live2dPresenter')}</Label>
        <p className="mt-1 text-xs text-muted-foreground">{t('settings.live2dPresenterDesc')}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Object.values(LIVE2D_PRESENTER_MODELS).map((model) => {
          const selected = live2dPresenterModelId === model.id;
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
            >
              <span className="flex w-full flex-col">
                <span className="relative aspect-[4/3] w-full overflow-hidden">
                  <img
                    src={model.previewSrc}
                    alt={t(`settings.live2dPresenterOptions.${model.id}.label`)}
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                  <span className="absolute inset-x-0 bottom-0 h-16 bg-[linear-gradient(180deg,rgba(15,23,42,0)_0%,rgba(15,23,42,0.8)_100%)]" />
                  <span className="absolute left-3 top-3 rounded-full bg-black/45 px-2 py-1 text-[10px] font-semibold text-white">
                    {t('settings.live2dPresenterPreviewBadge')}
                  </span>
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
