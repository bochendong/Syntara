import type { DragEvent as ReactDragEvent, RefObject } from 'react';
import { ArrowUp, FolderInput, Loader2, Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  ComposerInputShell,
  composerTextareaClassName,
} from '@/components/ui/composer-input-shell';
import {
  ComposerVoiceSelector,
  GenerationModelSelector,
} from '@/components/generation/generation-toolbar';
import { SpeechButton } from '@/components/audio/speech-button';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { SettingsSection } from '@/lib/types/settings';
import type { CourseAgentListItem } from '@/lib/utils/course-agents';
import { cn } from '@/lib/utils';
import type { NotebookAttachmentInput, OrchestratorViewMode } from './chat-page-types';

type ChatMode = 'notebook' | 'agent' | 'none';

export function ChatComposer({
  mode,
  isCourseOrchestrator,
  orchestratorViewMode,
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
  selectedAgent,
  sending,
  handleSendNotebook,
  handleSendAgent,
  openAttachmentPicker,
  fileInputRef,
  onPickAttachments,
  handleImportNotebookProblemBank,
  openSettings,
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
  selectedAgent: CourseAgentListItem | null;
  sending: boolean;
  handleSendNotebook: () => void | Promise<void>;
  handleSendAgent: () => void | Promise<void>;
  openAttachmentPicker: () => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onPickAttachments: (files: FileList | null) => void | Promise<void>;
  handleImportNotebookProblemBank: () => void | Promise<void>;
  openSettings: (section?: SettingsSection) => void;
}) {
  const { t } = useI18n();

  return (
    <footer className="shrink-0 border-t border-slate-900/[0.06] px-4 pb-4 pt-3 dark:border-white/[0.06]">
      <ComposerInputShell
        className={cn(
          'relative transition-all',
          supportsComposerAttachments &&
            isComposerDragging &&
            'border-sky-400/80 bg-sky-50/80 shadow-[0_0_0_4px_rgba(56,189,248,0.14)] dark:bg-sky-500/10',
        )}
        onDragEnter={handleComposerDragEnter}
        onDragOver={handleComposerDragOver}
        onDragLeave={handleComposerDragLeave}
        onDrop={handleComposerDrop}
      >
        {supportsComposerAttachments && isComposerDragging ? (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-sky-400/80 bg-sky-50/90 text-sky-900 dark:bg-slate-950/80 dark:text-sky-100">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/80 bg-white/90 px-4 py-2 text-sm font-medium shadow-sm dark:border-sky-400/30 dark:bg-slate-900/90">
              <Paperclip className="size-4" />
              松开以上传附件
            </div>
          </div>
        ) : null}
        {mode === 'notebook' && pendingAttachments.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 border-b border-border/40 px-3 py-2">
            {pendingAttachments.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-white/70 px-2 py-0.5 text-[11px] text-foreground dark:bg-black/30"
              >
                <Paperclip className="size-3" />
                <span className="max-w-[200px] truncate">{a.name}</span>
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

        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            mode === 'none'
              ? '请选择左侧联系人…'
              : mode === 'notebook'
                ? '向该笔记本提问，或上传 PDF / 文本导入题库…'
                : isCourseOrchestrator
                  ? orchestratorViewMode === 'group'
                    ? '在课程协作群聊中发起多方协作…'
                    : '向课程总控提问：概念、安排、答疑等…'
                  : `与 ${selectedAgent?.name ?? 'Agent'} 对话…`
          }
          disabled={mode === 'none' || sending}
          className={cn(
            composerTextareaClassName,
            'min-h-[100px] max-h-[min(40vh,280px)] resize-y px-4 pt-1 pb-2 text-[13px] leading-relaxed md:text-[13px]',
          )}
          rows={4}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (mode === 'notebook') void handleSendNotebook();
              else if (mode === 'agent') void handleSendAgent();
            }
          }}
        />

        {/* 与创建页一致的底栏：左侧工具区 · 语音 · 主按钮 */}
        <div className="flex items-end gap-2 px-3 pb-3">
          <div className="min-h-8 flex-1 min-w-0">
            {mode === 'notebook' ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 rounded-lg border-border/60 bg-white/50 text-xs dark:bg-black/20"
                  onClick={openAttachmentPicker}
                  disabled={sending}
                >
                  <Paperclip className="mr-1 size-3.5" />
                  添加附件
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void onPickAttachments(e.target.files);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 rounded-lg border-border/60 bg-white/50 text-xs dark:bg-black/20"
                  onClick={() => {
                    if (!draft.trim() && pendingAttachments.length === 0) {
                      openAttachmentPicker();
                      return;
                    }
                    void handleImportNotebookProblemBank();
                  }}
                  disabled={sending}
                >
                  <FolderInput className="mr-1 size-3.5" />
                  导入题库
                </Button>
                <GenerationModelSelector onSettingsOpen={openSettings} />
                <ComposerVoiceSelector onSettingsOpen={openSettings} />
              </div>
            ) : mode === 'agent' && isCourseOrchestrator ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <GenerationModelSelector onSettingsOpen={openSettings} />
                <ComposerVoiceSelector onSettingsOpen={openSettings} />
              </div>
            ) : null}
          </div>

          <SpeechButton
            size="md"
            disabled={
              mode === 'none' ||
              sending ||
              (mode === 'agent' && isCourseOrchestrator && !draft.trim())
            }
            onTranscription={(text) => {
              setDraft((prev) => {
                const next = prev + (prev ? ' ' : '') + text;
                return next;
              });
            }}
          />

          <button
            type="button"
            disabled={
              mode === 'none' ||
              sending ||
              (mode === 'notebook' && !draft.trim()) ||
              (mode === 'agent' && !draft.trim())
            }
            onClick={() => {
              if (mode === 'notebook') void handleSendNotebook();
              else if (mode === 'agent') void handleSendAgent();
            }}
            className={cn(
              'shrink-0 flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 transition-all',
              mode !== 'none' && !sending && draft.trim()
                ? 'cursor-pointer bg-primary text-primary-foreground shadow-sm hover:opacity-90'
                : 'cursor-not-allowed bg-muted text-muted-foreground/40',
            )}
          >
            {sending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <>
                <span className="text-xs font-medium">{t('chat.send')}</span>
                <ArrowUp className="size-3.5" />
              </>
            )}
          </button>
        </div>
      </ComposerInputShell>
    </footer>
  );
}
