'use client';

import { useState, useCallback, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Loader2, Trash2, AlertTriangle, Sun, Moon, Monitor } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useTheme } from '@/lib/hooks/use-theme';
import { clearDatabase } from '@/lib/utils/database';
import { toast } from 'sonner';
import { createLogger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import {
  getStoredApplyNotebookWrites,
  setStoredApplyNotebookWrites,
} from '@/lib/utils/notebook-write-preference';
import { UserProfileCard } from '@/components/user-profile';
import { useSettingsStore } from '@/lib/store/settings';
import { LIVE2D_PRESENTER_MODELS } from '@/lib/live2d/presenter-models';

const log = createLogger('GeneralSettings');

export function GeneralSettings() {
  const { t, locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();
  const live2dPresenterModelId = useSettingsStore((state) => state.live2dPresenterModelId);
  const setLive2DPresenterModelId = useSettingsStore((state) => state.setLive2DPresenterModelId);

  const [applyNotebookWrites, setApplyNotebookWrites] = useState(true);
  useEffect(() => {
    setApplyNotebookWrites(getStoredApplyNotebookWrites());
  }, []);

  // Clear cache state
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [clearing, setClearing] = useState(false);

  const confirmPhrase = t('settings.clearCacheConfirmPhrase');
  const isConfirmValid = confirmInput === confirmPhrase;

  const handleClearCache = useCallback(async () => {
    if (!isConfirmValid) return;
    setClearing(true);
    try {
      // 1. Clear IndexedDB
      await clearDatabase();
      // 2. Clear localStorage
      localStorage.clear();
      // 3. Clear sessionStorage
      sessionStorage.clear();

      toast.success(t('settings.clearCacheSuccess'));

      // Reload page after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      log.error('Failed to clear cache:', error);
      toast.error(t('settings.clearCacheFailed'));
      setClearing(false);
    }
  }, [isConfirmValid, t]);

  const clearCacheItems =
    t('settings.clearCacheConfirmItems').split('、').length > 1
      ? t('settings.clearCacheConfirmItems').split('、')
      : t('settings.clearCacheConfirmItems').split(', ');

  return (
    <div className="flex flex-col gap-8">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          {t('profile.title')}
        </h3>
        <p className="text-xs text-muted-foreground">{t('profile.avatarHint')}</p>
        <UserProfileCard />
      </div>

      <div className="rounded-xl border border-border/80 bg-card/50 p-5 space-y-6">
        <div className="space-y-3">
          <div>
            <Label className="text-sm font-medium">{t('settings.language')}</Label>
            <p className="text-xs text-muted-foreground mt-1">{t('settings.languageDesc')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['zh-CN', 'en-US'] as const).map((code) => (
              <Button
                key={code}
                type="button"
                variant={locale === code ? 'default' : 'outline'}
                size="sm"
                className="h-9"
                onClick={() => setLocale(code)}
              >
                {code === 'zh-CN'
                  ? t('settings.languageOptions.zhCN')
                  : t('settings.languageOptions.enUS')}
              </Button>
            ))}
          </div>
        </div>

        <div className="h-px bg-border/60" />

        <div className="space-y-3">
          <div>
            <Label className="text-sm font-medium">{t('settings.theme')}</Label>
            <p className="text-xs text-muted-foreground mt-1">{t('settings.themeDesc')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: 'light' as const, icon: Sun, label: t('settings.themeOptions.light') },
                { id: 'dark' as const, icon: Moon, label: t('settings.themeOptions.dark') },
                { id: 'system' as const, icon: Monitor, label: t('settings.themeOptions.system') },
              ] as const
            ).map(({ id, icon: Icon, label }) => (
              <Button
                key={id}
                type="button"
                variant={theme === id ? 'default' : 'outline'}
                size="sm"
                className={cn('h-9 gap-2', theme === id && 'shadow-sm')}
                onClick={() => setTheme(id)}
              >
                <Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
                {label}
              </Button>
            ))}
          </div>
        </div>

        <div className="h-px bg-border/60" />

        <div className="space-y-3">
          <div>
            <Label className="text-sm font-medium">{t('settings.live2dPresenter')}</Label>
            <p className="text-xs text-muted-foreground mt-1">
              {t('settings.live2dPresenterDesc')}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Object.values(LIVE2D_PRESENTER_MODELS).map((model) => {
              const selected = live2dPresenterModelId === model.id;
              return (
                <Button
                  key={model.id}
                  type="button"
                  variant={selected ? 'default' : 'outline'}
                  className={cn(
                    'h-auto overflow-hidden p-0 text-left',
                    selected && 'shadow-sm ring-2 ring-primary/30',
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
                      <span className="absolute left-3 top-3 rounded-full bg-black/45 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
                        Live2D
                      </span>
                    </span>
                    <span className="flex flex-col items-start gap-1 px-4 py-3">
                      <span className="text-sm font-medium">
                        {t(`settings.live2dPresenterOptions.${model.id}.label`)}
                      </span>
                      <span
                        className={cn(
                          'text-xs leading-relaxed',
                          selected ? 'text-primary-foreground/85' : 'text-muted-foreground',
                        )}
                      >
                        {t(`settings.live2dPresenterOptions.${model.id}.desc`)}
                      </span>
                    </span>
                  </span>
                </Button>
              );
            })}
          </div>
        </div>

        <div className="h-px bg-border/60" />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="min-w-0 flex-1 space-y-1">
            <Label className="text-sm font-medium">{t('settings.notebookChatWrites')}</Label>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t('settings.notebookChatWritesDesc')}
            </p>
          </div>
          <Checkbox
            className="mt-1 shrink-0 sm:mt-0.5"
            checked={applyNotebookWrites}
            onCheckedChange={(v) => {
              const next = v === true;
              setApplyNotebookWrites(next);
              setStoredApplyNotebookWrites(next);
            }}
            aria-label={t('settings.notebookChatWrites')}
          />
        </div>
      </div>

      {/* Danger Zone - Clear Cache */}
      <div className="relative rounded-xl border border-destructive/30 bg-destructive/[0.03] dark:bg-destructive/[0.06] overflow-hidden">
        {/* Subtle diagonal stripe pattern for danger emphasis */}
        <div
          className="absolute inset-0 opacity-[0.015] dark:opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: `repeating-linear-gradient(
              -45deg,
              transparent,
              transparent 10px,
              currentColor 10px,
              currentColor 11px
            )`,
          }}
        />

        <div className="relative p-4 space-y-4">
          {/* Header */}
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-destructive/10 text-destructive">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-destructive">{t('settings.dangerZone')}</h3>
          </div>

          {/* Content */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{t('settings.clearCache')}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {t('settings.clearCacheDescription')}
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="shrink-0"
              onClick={() => {
                setConfirmInput('');
                setShowClearDialog(true);
              }}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              {t('settings.clearCache')}
            </Button>
          </div>
        </div>
      </div>

      {/* Clear Cache Confirmation Dialog */}
      <AlertDialog
        open={showClearDialog}
        onOpenChange={(open) => {
          if (!clearing) {
            setShowClearDialog(open);
            if (!open) setConfirmInput('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              {t('settings.clearCacheConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>{t('settings.clearCacheConfirmDescription')}</p>
                <ul className="space-y-1.5 ml-1">
                  {clearCacheItems.map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-destructive/60 shrink-0" />
                      {item.trim()}
                    </li>
                  ))}
                </ul>
                <div className="pt-1">
                  <Label className="text-xs font-medium text-foreground">
                    {t('settings.clearCacheConfirmInput')}
                  </Label>
                  <Input
                    className="mt-1.5 h-9 text-sm"
                    placeholder={confirmPhrase}
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && isConfirmValid) {
                        handleClearCache();
                      }
                    }}
                    autoFocus
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>{t('common.cancel')}</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={!isConfirmValid || clearing}
              onClick={handleClearCache}
            >
              {clearing ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-1.5" />
              )}
              {t('settings.clearCacheButton')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
