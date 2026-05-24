import { useMemo, useState, type DragEvent as ReactDragEvent, type RefObject } from 'react';
import { ArrowUp, Check, FolderInput, Loader2, Paperclip, Plus, Volume2, X } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import {
  ComposerInputShell,
  composerTextareaClassName,
} from '@/components/ui/composer-input-shell';
import { GenerationModelSelector } from '@/components/generation/generation-toolbar';
import { SpeechButton } from '@/components/audio/speech-button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getTTSVoices } from '@/lib/audio/constants';
import { voiceRowBlurb } from '@/lib/audio/voice-display';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import type { SettingsSection } from '@/lib/types/settings';
import { cn } from '@/lib/utils';
import type { NotebookAttachmentInput, OrchestratorViewMode } from './chat-page-types';

type ChatMode = 'notebook' | 'agent' | 'none';

export function ChatComposer({
  mode,
  isCourseOrchestrator,
  supportsComposerAttachments,
  isComposerDragging,
  handleComposerDragEnter,
  handleComposerDragOver,
  handleComposerDragLeave,
  handleComposerDrop,
  pendingAttachments,
  removePendingAttachment,
  draft,
  setDraft,
  sending,
  handleSendNotebook,
  handleSendAgent,
  openAttachmentPicker,
  fileInputRef,
  onPickAttachments,
  handleImportNotebookProblemBank,
  openSettings,
  readOnlyReason,
}: {
  mode: ChatMode;
  isCourseOrchestrator: boolean;
  orchestratorViewMode: OrchestratorViewMode;
  supportsComposerAttachments: boolean;
  isComposerDragging: boolean;
  handleComposerDragEnter: (event: ReactDragEvent<HTMLDivElement>) => void;
  handleComposerDragOver: (event: ReactDragEvent<HTMLDivElement>) => void;
  handleComposerDragLeave: (event: ReactDragEvent<HTMLDivElement>) => void;
  handleComposerDrop: (event: ReactDragEvent<HTMLDivElement>) => void;
  pendingAttachments: NotebookAttachmentInput[];
  removePendingAttachment: (id: string) => void;
  draft: string;
  setDraft: (next: string | ((prev: string) => string)) => void;
  sending: boolean;
  handleSendNotebook: () => void | Promise<void>;
  handleSendAgent: () => void | Promise<void>;
  openAttachmentPicker: () => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onPickAttachments: (files: FileList | null) => void | Promise<void>;
  handleImportNotebookProblemBank: () => void | Promise<void>;
  openSettings: (section?: SettingsSection) => void;
  readOnlyReason?: string | null;
}) {
  const { t, locale } = useI18n();
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const ttsProviderId = useSettingsStore((s) => s.ttsProviderId);
  const ttsVoice = useSettingsStore((s) => s.ttsVoice);
  const setTTSVoice = useSettingsStore((s) => s.setTTSVoice);
  const voices = useMemo(() => getTTSVoices(ttsProviderId), [ttsProviderId]);
  const isReadOnly = Boolean(readOnlyReason);
  const canUseVoiceSelector =
    !isReadOnly && (mode === 'notebook' || (mode === 'agent' && isCourseOrchestrator));
  const canOpenAddMenu = !isReadOnly && !sending && (mode === 'notebook' || canUseVoiceSelector);
  const addMenuLabel = mode === 'none' ? '请选择联系人' : '更多操作';
  const voiceSectionLabel = locale.startsWith('zh') ? '语音选择' : 'Voice';

  const openAttachmentsFromMenu = () => {
    setAddMenuOpen(false);
    openAttachmentPicker();
  };

  const importProblemBankFromMenu = () => {
    setAddMenuOpen(false);
    if (!draft.trim() && pendingAttachments.length === 0) {
      openAttachmentPicker();
      return;
    }
    void handleImportNotebookProblemBank();
  };

  return (
    <footer className="sticky bottom-0 z-20 shrink-0 bg-background/95 px-4 pb-5 pt-2 backdrop-blur supports-[backdrop-filter]:bg-background/85 md:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <ComposerInputShell
          className={cn(
            'relative overflow-hidden rounded-[32px] border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.10)] transition-all dark:border-white/10 dark:bg-slate-950',
            supportsComposerAttachments &&
              isComposerDragging &&
              'border-sky-400/80 bg-sky-50/90 shadow-[0_0_0_4px_rgba(56,189,248,0.14)] dark:bg-sky-500/10',
          )}
          onDragEnter={handleComposerDragEnter}
          onDragOver={handleComposerDragOver}
          onDragLeave={handleComposerDragLeave}
          onDrop={handleComposerDrop}
        >
          {supportsComposerAttachments && isComposerDragging ? (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[32px] border-2 border-dashed border-sky-400/80 bg-sky-50/90 text-sky-900 dark:bg-slate-950/80 dark:text-sky-100">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/80 bg-white/90 px-4 py-2 text-sm font-medium shadow-sm dark:border-sky-400/30 dark:bg-slate-900/90">
                <Paperclip className="size-4" />
                松开以上传附件
              </div>
            </div>
          ) : null}

          {mode === 'notebook' && pendingAttachments.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 px-5 pt-4">
              {pendingAttachments.map((a) => (
                <span
                  key={a.id}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/60 bg-slate-50 px-2.5 py-1 text-[11px] text-foreground dark:bg-white/5"
                >
                  <Paperclip className="size-3 shrink-0" />
                  <span className="max-w-[220px] truncate">{a.name}</span>
                  <button
                    type="button"
                    className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
                    onClick={() => removePendingAttachment(a.id)}
                    aria-label={`移除附件 ${a.name}`}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <div className="flex items-end gap-2 px-3 py-3">
            <Popover open={addMenuOpen} onOpenChange={setAddMenuOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  title={addMenuLabel}
                  aria-label={addMenuLabel}
                  disabled={!canOpenAddMenu}
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-900 transition-colors dark:text-slate-100',
                    canOpenAddMenu
                      ? 'hover:bg-slate-100 dark:hover:bg-white/10'
                      : 'cursor-not-allowed opacity-35',
                  )}
                >
                  <Plus className="size-6" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                sideOffset={8}
                className="w-[min(92vw,22rem)] rounded-2xl p-2"
              >
                {mode === 'notebook' ? (
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={openAttachmentsFromMenu}
                      disabled={!supportsComposerAttachments}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-white/10"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200">
                        <Paperclip className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1 font-medium">添加附件</span>
                    </button>
                    <button
                      type="button"
                      onClick={importProblemBankFromMenu}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-slate-100 dark:hover:bg-white/10"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200">
                        <FolderInput className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1 font-medium">题库</span>
                    </button>
                  </div>
                ) : null}

                {canUseVoiceSelector ? (
                  <div className={cn(mode === 'notebook' && 'mt-2 border-t border-border/60 pt-2')}>
                    <div className="flex items-center gap-2 px-3 pb-1.5 pt-1 text-xs font-medium text-muted-foreground">
                      <Volume2 className="size-3.5" />
                      <span>{voiceSectionLabel}</span>
                    </div>
                    <div className="max-h-64 overflow-y-auto pr-1">
                      {voices.length === 0 ? (
                        <p className="px-3 py-3 text-xs text-muted-foreground">
                          {t('toolbar.ttsVoiceListEmpty')}
                        </p>
                      ) : (
                        voices.map((v) => {
                          const blurb = voiceRowBlurb(v, t, locale);
                          const selected = v.id === ttsVoice;
                          return (
                            <button
                              key={v.id}
                              type="button"
                              className={cn(
                                'flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors',
                                selected
                                  ? 'bg-primary/10 font-medium text-primary'
                                  : 'text-foreground hover:bg-slate-100 dark:hover:bg-white/10',
                              )}
                              onClick={() => {
                                setTTSVoice(v.id);
                                setAddMenuOpen(false);
                              }}
                            >
                              <span className="min-w-0 shrink-0">{v.name}</span>
                              {blurb ? (
                                <span
                                  className={cn(
                                    'min-w-0 flex-1 text-right text-[11px] leading-snug text-muted-foreground line-clamp-2',
                                    selected && 'text-primary/80',
                                  )}
                                >
                                  {blurb}
                                </span>
                              ) : null}
                              {selected ? <Check className="mt-0.5 size-3.5 shrink-0" /> : null}
                            </button>
                          );
                        })
                      )}
                    </div>
                    <button
                      type="button"
                      className="mt-1 flex h-8 w-full items-center justify-center rounded-xl text-xs text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground dark:hover:bg-white/10"
                      onClick={() => {
                        setAddMenuOpen(false);
                        openSettings('tts');
                      }}
                    >
                      {t('toolbar.advancedSettings')}…
                    </button>
                  </div>
                ) : null}
              </PopoverContent>
            </Popover>
            {mode === 'notebook' ? (
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  void onPickAttachments(e.target.files);
                }}
              />
            ) : null}

            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                mode === 'none'
                  ? '请选择联系人'
                  : isReadOnly
                    ? readOnlyReason || ''
                    : '有问题，尽管问'
              }
              disabled={mode === 'none' || sending || isReadOnly}
              className={cn(
                composerTextareaClassName,
                'min-h-11 max-h-[min(34vh,220px)] flex-1 resize-none px-1 py-2.5 text-[13px] leading-5 placeholder:text-slate-400 md:text-[13px]',
              )}
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (isReadOnly) return;
                  if (mode === 'notebook') void handleSendNotebook();
                  else if (mode === 'agent') void handleSendAgent();
                }
              }}
            />

            <div className="flex shrink-0 items-center gap-1 self-end">
              {!isReadOnly &&
              (mode === 'notebook' || (mode === 'agent' && isCourseOrchestrator)) ? (
                <div className="hidden items-center gap-1 md:flex">
                  <GenerationModelSelector
                    onSettingsOpen={openSettings}
                    triggerClassName="h-10 max-w-[9rem] rounded-full border-0 bg-transparent px-2 text-sm text-muted-foreground shadow-none hover:bg-slate-100 hover:text-foreground dark:hover:bg-white/10 data-[size=sm]:h-10"
                  />
                </div>
              ) : null}

              <SpeechButton
                size="md"
                className="h-10 w-10 rounded-full text-slate-900 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-100 dark:hover:bg-white/10"
                disabled={mode === 'none' || sending || isReadOnly}
                onTranscription={(text) => {
                  setDraft((prev) => {
                    const next = prev + (prev ? ' ' : '') + text;
                    return next;
                  });
                }}
              />

              <button
                type="button"
                aria-label={t('chat.send')}
                disabled={
                  mode === 'none' ||
                  sending ||
                  isReadOnly ||
                  (mode === 'notebook' && !draft.trim()) ||
                  (mode === 'agent' && !draft.trim())
                }
                onClick={() => {
                  if (mode === 'notebook') void handleSendNotebook();
                  else if (mode === 'agent') void handleSendAgent();
                }}
                className={cn(
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all',
                  mode !== 'none' && !sending && !isReadOnly && draft.trim()
                    ? 'cursor-pointer bg-black text-white shadow-sm hover:bg-black/85 dark:bg-white dark:text-black dark:hover:bg-white/90'
                    : 'cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-white/10 dark:text-slate-500',
                )}
              >
                {sending ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <ArrowUp className="size-5" />
                )}
              </button>
            </div>
          </div>
        </ComposerInputShell>
      </div>
    </footer>
  );
}
