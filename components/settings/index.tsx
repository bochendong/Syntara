'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { SettingsSection } from '@/lib/types/settings';
import { Settings, FileText, Image as ImageIcon, Film, Search, Volume2, Mic, X } from 'lucide-react';
import { GeneralSettings } from './general-settings';
import { PDFSettings } from './pdf-settings';
import { ImageSettings } from './image-settings';
import { VideoSettings } from './video-settings';
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
  const videoProviderId = useSettingsStore((state) => state.videoProviderId);
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

  const getHeaderTitle = () => {
    switch (activeSection) {
      case 'providers':
        return 'OpenAI';
      case 'image':
        return t('settings.imageSettings');
      case 'video':
        return t('settings.videoSettings');
      case 'tts':
        return t('settings.ttsSettings');
      case 'asr':
        return t('settings.asrSettings');
      case 'pdf':
        return t('settings.pdfSettings');
      case 'web-search':
        return t('settings.webSearchSettings');
      case 'general':
      default:
        return t('settings.systemSettings');
    }
  };

  const mainColumn = (
    <div
      className={embedded ? 'flex min-h-0 w-full flex-1 overflow-hidden' : 'flex h-full overflow-hidden'}
    >
      <div className="w-56 shrink-0 bg-muted/30 p-3 space-y-1">
        <button
          onClick={() => setActiveSection('providers')}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors text-left',
            activeSection === 'providers' ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted',
          )}
        >
          <Settings className="h-4 w-4 shrink-0" />
          <span className="truncate">{t('settings.providers')}</span>
        </button>
        <button
          onClick={() => setActiveSection('image')}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors text-left',
            activeSection === 'image' ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted',
          )}
        >
          <ImageIcon className="h-4 w-4 shrink-0" />
          <span className="truncate">{t('settings.imageSettings')}</span>
        </button>
        <button
          onClick={() => setActiveSection('video')}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors text-left',
            activeSection === 'video' ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted',
          )}
        >
          <Film className="h-4 w-4 shrink-0" />
          <span className="truncate">{t('settings.videoSettings')}</span>
        </button>
        <button
          onClick={() => setActiveSection('tts')}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors text-left',
            activeSection === 'tts' ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted',
          )}
        >
          <Volume2 className="h-4 w-4 shrink-0" />
          <span className="truncate">{t('settings.ttsSettings')}</span>
        </button>
        <button
          onClick={() => setActiveSection('asr')}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors text-left',
            activeSection === 'asr' ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted',
          )}
        >
          <Mic className="h-4 w-4 shrink-0" />
          <span className="truncate">{t('settings.asrSettings')}</span>
        </button>
        <button
          onClick={() => setActiveSection('pdf')}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors text-left',
            activeSection === 'pdf' ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted',
          )}
        >
          <FileText className="h-4 w-4 shrink-0" />
          <span className="truncate">{t('settings.pdfSettings')}</span>
        </button>
        <button
          onClick={() => setActiveSection('web-search')}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors text-left',
            activeSection === 'web-search'
              ? 'bg-primary/10 text-primary font-medium'
              : 'hover:bg-muted',
          )}
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="truncate">{t('settings.webSearchSettings')}</span>
        </button>
        <button
          onClick={() => setActiveSection('general')}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors text-left',
            activeSection === 'general' ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted',
          )}
        >
          <Settings className="h-4 w-4 shrink-0" />
          <span className="truncate">{t('settings.systemSettings')}</span>
        </button>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold">{getHeaderTitle()}</h2>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {activeSection === 'providers' && <SystemLLMPanel />}
          {activeSection === 'general' && <GeneralSettings />}
          {activeSection === 'pdf' && <PDFSettings selectedProviderId={pdfProviderId} />}
          {activeSection === 'web-search' && (
            <WebSearchSettings selectedProviderId={webSearchProviderId} />
          )}
          {activeSection === 'image' && <ImageSettings selectedProviderId={imageProviderId} />}
          {activeSection === 'video' && <VideoSettings selectedProviderId={videoProviderId} />}
          {activeSection === 'tts' && <TTSSettings selectedProviderId={ttsProviderId} />}
          {activeSection === 'asr' && <ASRSettings selectedProviderId={asrProviderId} />}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t bg-muted/30">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t('settings.close')}
          </Button>
        </div>
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
          <DialogContent className="h-[85vh] p-0 gap-0 block" showCloseButton={false}>
            <DialogTitle className="sr-only">{t('settings.title')}</DialogTitle>
            <DialogDescription className="sr-only">{t('settings.description')}</DialogDescription>
            {mainColumn}
          </DialogContent>
        </Dialog>
      )}

    </>
  );
}
