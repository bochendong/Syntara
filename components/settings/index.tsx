'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { SettingsButton } from '@/components/settings/settings-button';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { SettingsSection } from '@/lib/types/settings';
import { Settings, FileText, Image as ImageIcon, Search, Volume2, Mic } from 'lucide-react';
import { GeneralSettings } from './general-settings';
import { PDFSettings } from './pdf-settings';
import { ImageSettings } from './image-settings';
import { TTSSettings } from './tts-settings';
import { ASRSettings } from './asr-settings';
import { WebSearchSettings } from './web-search-settings';
import { SystemLLMPanel } from './system-llm-panel';
import { useSettingsStore } from '@/lib/store/settings';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSection?: SettingsSection;
  /** 为 true 时不使用模态 Dialog，在主内容区以整页/嵌入式面板展示（用于 /settings 路由） */
  embedded?: boolean;
}

export function SettingsDialog({
  open,
  onOpenChange,
  initialSection,
  embedded = false,
}: SettingsDialogProps) {
  const { t } = useI18n();
  const pdfProviderId = useSettingsStore((state) => state.pdfProviderId);
  const webSearchProviderId = useSettingsStore((state) => state.webSearchProviderId);
  const imageProviderId = useSettingsStore((state) => state.imageProviderId);
  const ttsProviderId = useSettingsStore((state) => state.ttsProviderId);
  const asrProviderId = useSettingsStore((state) => state.asrProviderId);

  // Navigation
  const [activeSection, setActiveSection] = useState<SettingsSection>('providers');
  // Navigate to initialSection when dialog opens or embedded page loads / query changes
  useEffect(() => {
    const active = embedded || open;
    if (active && initialSection) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Sync section from prop
      setActiveSection(initialSection);
    }
  }, [embedded, open, initialSection]);

  const mainColumn = (
    <div
      className={cn('flex overflow-hidden', embedded ? 'min-h-0 w-full flex-1' : 'h-full')}
    >
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-5 py-5">
          <div className="min-h-0 min-w-0 flex-1 basis-0 shrink" aria-hidden />
          <div className="w-[min(100%,72rem)] max-w-6xl shrink-0">
            {activeSection === 'providers' && <SystemLLMPanel />}
            {activeSection === 'general' && <GeneralSettings />}
            {activeSection === 'pdf' && <PDFSettings selectedProviderId={pdfProviderId} />}
            {activeSection === 'web-search' && (
              <WebSearchSettings selectedProviderId={webSearchProviderId} />
            )}
            {activeSection === 'image' && <ImageSettings selectedProviderId={imageProviderId} />}
            {activeSection === 'tts' && <TTSSettings selectedProviderId={ttsProviderId} />}
            {activeSection === 'asr' && <ASRSettings selectedProviderId={asrProviderId} />}
          </div>
          <div className="min-h-0 min-w-0 flex-1 basis-0 shrink" aria-hidden />
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-900/[0.06] bg-slate-50/40 px-5 py-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
          <SettingsButton
            variant="secondary"
            size="sm"
            className="rounded-full px-4"
            onClick={() => onOpenChange(false)}
          >
            {t('settings.close')}
          </SettingsButton>
        </div>
      </div>

      <div
        className="w-56 shrink-0 space-y-1 border-l border-slate-900/[0.06] bg-slate-50/45 p-3 dark:border-white/[0.08] dark:bg-white/[0.03]"
        role="navigation"
        aria-label={t('settings.title')}
      >
        <button
          onClick={() => setActiveSection('providers')}
          className={cn(
            'apple-nav-item flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors',
            activeSection === 'providers' ? 'active font-medium' : 'text-slate-700 dark:text-slate-200',
          )}
        >
          <Settings className="h-4 w-4 shrink-0" />
          <span className="truncate">{t('settings.providers')}</span>
        </button>
        <button
          onClick={() => setActiveSection('image')}
          className={cn(
            'apple-nav-item flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors',
            activeSection === 'image' ? 'active font-medium' : 'text-slate-700 dark:text-slate-200',
          )}
        >
          <ImageIcon className="h-4 w-4 shrink-0" />
          <span className="truncate">{t('settings.imageSettings')}</span>
        </button>
        <button
          onClick={() => setActiveSection('tts')}
          className={cn(
            'apple-nav-item flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors',
            activeSection === 'tts' ? 'active font-medium' : 'text-slate-700 dark:text-slate-200',
          )}
        >
          <Volume2 className="h-4 w-4 shrink-0" />
          <span className="truncate">{t('settings.ttsSettings')}</span>
        </button>
        <button
          onClick={() => setActiveSection('asr')}
          className={cn(
            'apple-nav-item flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors',
            activeSection === 'asr' ? 'active font-medium' : 'text-slate-700 dark:text-slate-200',
          )}
        >
          <Mic className="h-4 w-4 shrink-0" />
          <span className="truncate">{t('settings.asrSettings')}</span>
        </button>
        <button
          onClick={() => setActiveSection('pdf')}
          className={cn(
            'apple-nav-item flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors',
            activeSection === 'pdf' ? 'active font-medium' : 'text-slate-700 dark:text-slate-200',
          )}
        >
          <FileText className="h-4 w-4 shrink-0" />
          <span className="truncate">{t('settings.pdfSettings')}</span>
        </button>
        <button
          onClick={() => setActiveSection('web-search')}
          className={cn(
            'apple-nav-item flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors',
            activeSection === 'web-search' ? 'active font-medium' : 'text-slate-700 dark:text-slate-200',
          )}
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="truncate">{t('settings.webSearchSettings')}</span>
        </button>
        <button
          onClick={() => setActiveSection('general')}
          className={cn(
            'apple-nav-item flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors',
            activeSection === 'general' ? 'active font-medium' : 'text-slate-700 dark:text-slate-200',
          )}
        >
          <Settings className="h-4 w-4 shrink-0" />
          <span className="truncate">{t('settings.systemSettings')}</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {embedded ? (
        <>
          <h1 className="sr-only">{t('settings.title')}</h1>
          <p className="sr-only">{t('settings.description')}</p>
          {mainColumn}
        </>
      ) : (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="h-[85vh] p-0 gap-0 block">
            <DialogTitle className="sr-only">{t('settings.title')}</DialogTitle>
            <DialogDescription className="sr-only">{t('settings.description')}</DialogDescription>
            {mainColumn}
          </DialogContent>
        </Dialog>
      )}

    </>
  );
}
