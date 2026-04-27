'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUp, BotOff, Loader2, Settings } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { createLogger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { GenerationToolbar } from '@/components/generation/generation-toolbar';
import { AgentBar } from '@/components/agent/agent-bar';
import { useSettingsStore } from '@/lib/store/settings';
import { useUserProfileStore } from '@/lib/store/user-profile';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { toast } from 'sonner';
import { useDraftCache } from '@/lib/hooks/use-draft-cache';
import { SpeechButton } from '@/components/audio/speech-button';
import { PdfPageSelectionDialog } from '@/components/create/pdf-page-selection-dialog';
import {
  ComposerInputShell,
  composerTextareaClassName,
} from '@/components/ui/composer-input-shell';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { GreetingBar } from '@/components/create/greeting-bar';
import {
  PDF_PAGE_SELECTION_MAX_BYTES,
  getPdfSourceFileSignature,
  type PdfSourceSelection,
} from '@/lib/pdf/page-selection';
import { useNotebookGenerationQueueStore } from '@/lib/store/notebook-generation-queue';
import { NotebookGenerationQueuePanel } from '@/components/generation/notebook-generation-queue-panel';

const log = createLogger('CreateNotebookComposer');

const WEB_SEARCH_STORAGE_KEY = 'webSearchEnabled';
const LANGUAGE_STORAGE_KEY = 'generationLanguage';
const GENERATE_SLIDES_STORAGE_KEY = 'generationGenerateSlides';

interface FormState {
  sourceFile: File | null;
  requirement: string;
  language: 'zh-CN' | 'en-US';
  webSearch: boolean;
  generateSlides: boolean;
}

const initialFormState: FormState = {
  sourceFile: null,
  requirement: '',
  language: 'zh-CN',
  webSearch: false,
  generateSlides: true,
};

function isPdfSourceFile(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  const lower = file.name.toLowerCase();
  return mime === 'application/pdf' || lower.endsWith('.pdf');
}

export interface CreateNotebookComposerProps {
  courseId: string;
  /** 聊天页底部内嵌时略压缩输入高度 */
  compact?: boolean;
  className?: string;
}

/** 与 `/create?courseId=` 相同的底部输入区；提交后进入当前标签页的生成队列。 */
export function CreateNotebookComposer({
  courseId,
  compact,
  className,
}: CreateNotebookComposerProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialFormState);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { cachedValue: cachedRequirement, updateCache: updateRequirementCache } =
    useDraftCache<string>({ key: 'requirementDraft' });

  const currentModelId = useSettingsStore((s) => s.modelId);
  const enqueueNotebookGeneration = useNotebookGenerationQueueStore((s) => s.enqueue);

  useEffect(() => {
    try {
      const savedWebSearch = localStorage.getItem(WEB_SEARCH_STORAGE_KEY);
      const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      const savedGenerateSlides = localStorage.getItem(GENERATE_SLIDES_STORAGE_KEY);
      const updates: Partial<FormState> = {};
      if (savedWebSearch === 'true') updates.webSearch = true;
      if (savedGenerateSlides === 'false') updates.generateSlides = false;
      if (savedLanguage === 'zh-CN' || savedLanguage === 'en-US') {
        updates.language = savedLanguage;
      } else {
        const detected = navigator.language?.startsWith('zh') ? 'zh-CN' : 'en-US';
        updates.language = detected;
      }
      if (Object.keys(updates).length > 0) {
        setForm((prev) => ({ ...prev, ...updates }));
      }
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  useEffect(() => {
    useMediaGenerationStore.getState().revokeObjectUrls();
    useMediaGenerationStore.setState({ tasks: {} });
  }, []);

  const [prevCachedRequirement, setPrevCachedRequirement] = useState(cachedRequirement);
  if (cachedRequirement !== prevCachedRequirement) {
    setPrevCachedRequirement(cachedRequirement);
    if (cachedRequirement) {
      setForm((prev) => ({ ...prev, requirement: cachedRequirement }));
    }
  }

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pageSelectionDialogOpen, setPageSelectionDialogOpen] = useState(false);
  const [sourcePageSelection, setSourcePageSelection] = useState<PdfSourceSelection | null>(null);

  useEffect(() => {
    const file = form.sourceFile;
    if (!file || !isPdfSourceFile(file)) {
      setSourcePageSelection(null);
      return;
    }
    const signature = getPdfSourceFileSignature(file);
    setSourcePageSelection((current) => (current?.fileSignature === signature ? current : null));
  }, [form.sourceFile]);

  const openSettings = (section?: import('@/lib/types/settings').SettingsSection) => {
    if (section) {
      router.push(`/settings?section=${encodeURIComponent(section)}`);
    } else {
      router.push('/settings');
    }
  };

  const updateForm = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    try {
      if (field === 'webSearch') localStorage.setItem(WEB_SEARCH_STORAGE_KEY, String(value));
      if (field === 'language') localStorage.setItem(LANGUAGE_STORAGE_KEY, String(value));
      if (field === 'generateSlides') {
        localStorage.setItem(GENERATE_SLIDES_STORAGE_KEY, String(value));
      }
      if (field === 'requirement') updateRequirementCache(value as string);
    } catch {
      /* ignore */
    }
  };

  const showSetupToast = (icon: React.ReactNode, title: string, desc: string) => {
    toast.custom(
      (id) => (
        <div
          className="flex w-[356px] cursor-pointer items-start gap-3 rounded-xl border border-amber-200/60 bg-gradient-to-r from-amber-50 via-white to-amber-50 p-4 shadow-lg shadow-amber-500/8 dark:border-amber-800/40 dark:from-amber-950/60 dark:via-slate-900 dark:to-amber-950/60 dark:shadow-amber-900/20"
          onClick={() => {
            toast.dismiss(id);
            openSettings();
          }}
        >
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 ring-1 ring-amber-200/50 dark:bg-amber-900/40 dark:ring-amber-800/30">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight text-amber-900 dark:text-amber-200">
              {title}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-700/80 dark:text-amber-400/70">
              {desc}
            </p>
          </div>
          <div className="mt-1 shrink-0 text-[10px] font-medium tracking-wide text-amber-500 dark:text-amber-500/70">
            <Settings className="size-3.5 animate-[spin_3s_linear_infinite]" />
          </div>
        </div>
      ),
      { duration: 4000 },
    );
  };

  const handleGenerate = async (forcedSelection?: PdfSourceSelection) => {
    if (!currentModelId) {
      showSetupToast(
        <BotOff className="size-4.5 text-amber-600 dark:text-amber-400" />,
        t('settings.modelNotConfigured'),
        t('settings.setupNeeded'),
      );
      openSettings();
      return;
    }

    if (!form.requirement.trim()) {
      setError(t('upload.requirementRequired'));
      return;
    }

    const cid = courseId.trim();
    if (!cid) {
      setError('请先从「我的课程」进入某一门课程，再创建笔记本。');
      return;
    }

    const effectiveSelection = (() => {
      const sourceFile = form.sourceFile;
      if (!sourceFile || !isPdfSourceFile(sourceFile)) return undefined;
      const signature = getPdfSourceFileSignature(sourceFile);
      const candidate = forcedSelection ?? sourcePageSelection ?? undefined;
      return candidate?.fileSignature === signature ? candidate : undefined;
    })();

    if (
      form.sourceFile &&
      isPdfSourceFile(form.sourceFile) &&
      form.sourceFile.size > PDF_PAGE_SELECTION_MAX_BYTES &&
      !effectiveSelection
    ) {
      setPageSelectionDialogOpen(true);
      return;
    }

    setError(null);
    setBusy(true);

    try {
      const userProfile = useUserProfileStore.getState();
      enqueueNotebookGeneration(
        {
          courseId: cid,
          requirement: form.requirement,
          language: form.language,
          webSearch: form.webSearch,
          generateSlides: form.generateSlides,
          sourceFile: form.sourceFile,
          sourcePageSelection: effectiveSelection,
          userNickname: userProfile.nickname || undefined,
          userBio: userProfile.bio || undefined,
          outlinePreferences: {
            length: 'standard',
            includeQuizScenes: true,
            workedExampleLevel: 'moderate',
          },
        },
        {
          onProgress: (_task, progress) => {
            if (progress.stage === 'notebook-ready') {
              window.dispatchEvent(
                new CustomEvent('synatra-notebook-list-updated', {
                  detail: { courseId: cid, notebookId: progress.notebookId },
                }),
              );
            }
          },
          onCompleted: (_task, result) => {
            window.dispatchEvent(
              new CustomEvent('synatra-notebook-list-updated', {
                detail: { courseId: cid, notebookId: result.stage.id },
              }),
            );
            toast.success(
              result.scenes.length > 0
                ? `笔记本「${result.stage.name}」已创建完成`
                : `笔记本「${result.stage.name}」已加入仓库`,
            );
          },
          onFailed: (_task, message) => {
            toast.error(`笔记本生成失败：${message}`);
          },
          onCancelled: () => {
            toast.info('已取消笔记本生成任务');
          },
        },
      );
      toast.success(form.generateSlides ? '已加入生成队列' : '已加入仓库队列');
      setForm((prev) => ({ ...prev, requirement: '', sourceFile: null }));
      updateRequirementCache('');
      setSourcePageSelection(null);
    } catch (err) {
      log.error('Error preparing generation:', err);
      setError(err instanceof Error ? err.message : t('upload.generateFailed'));
    } finally {
      setBusy(false);
    }
  };

  const canGenerate = !!form.requirement.trim() && !!courseId.trim() && !busy;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (canGenerate) void handleGenerate();
    }
  };

  const textareaBox = compact ? 'min-h-[100px] max-h-[220px]' : 'min-h-[140px] max-h-[300px]';

  return (
    <div className={cn('w-full', className)}>
      <NotebookGenerationQueuePanel className="mb-3" />
      <PdfPageSelectionDialog
        open={pageSelectionDialogOpen}
        file={form.sourceFile}
        language={form.language}
        onOpenChange={setPageSelectionDialogOpen}
        onConfirm={(selection) => {
          setSourcePageSelection(selection);
          setPageSelectionDialogOpen(false);
          void handleGenerate(selection);
        }}
      />
      <ComposerInputShell className="w-full">
        <div className="relative z-20 flex items-start justify-between">
          <GreetingBar />
          <div className="shrink-0 pr-3 pt-3.5">
            <AgentBar />
          </div>
        </div>

        <textarea
          ref={textareaRef}
          placeholder={t('upload.requirementPlaceholder')}
          className={cn(composerTextareaClassName, 'px-4 pb-2 pt-1 text-[13px]', textareaBox)}
          value={form.requirement}
          onChange={(e) => updateForm('requirement', e.target.value)}
          onKeyDown={handleKeyDown}
          rows={4}
          disabled={busy}
        />

        <div className="flex items-center justify-between gap-3 border-t border-slate-900/[0.06] px-4 py-2 dark:border-white/[0.08]">
          <div className="min-w-0 flex-1">
            <Label className="text-[11px] font-semibold">生成 PPT 课件</Label>
            <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
              关闭后只把笔记本加入仓库，不生成页面、口播或讲解角色。
            </p>
          </div>
          <Switch
            checked={form.generateSlides}
            onCheckedChange={(v) => updateForm('generateSlides', v)}
            aria-label="生成 PPT 课件"
            disabled={busy}
          />
        </div>

        <div className="flex items-end gap-2 px-3 pb-3">
          <div className="min-w-0 flex-1">
            <GenerationToolbar
              language={form.language}
              onLanguageChange={(lang) => updateForm('language', lang)}
              webSearch={form.webSearch}
              onWebSearchChange={(v) => updateForm('webSearch', v)}
              onSettingsOpen={(section) => {
                openSettings(section);
              }}
              sourceFile={form.sourceFile}
              onSourceFileChange={(f) => updateForm('sourceFile', f)}
              onSourceFileError={setError}
            />
          </div>

          <SpeechButton
            size="md"
            disabled={busy}
            onTranscription={(text) => {
              setForm((prev) => {
                const next = prev.requirement + (prev.requirement ? ' ' : '') + text;
                updateRequirementCache(next);
                return { ...prev, requirement: next };
              });
            }}
          />

          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={!canGenerate}
            className={cn(
              'flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 transition-all',
              canGenerate
                ? 'cursor-pointer bg-primary text-primary-foreground shadow-sm hover:opacity-90'
                : 'cursor-not-allowed bg-muted text-muted-foreground/40',
            )}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <>
                <span className="text-xs font-medium">
                  {form.generateSlides ? t('toolbar.enterClassroom') : '加入仓库'}
                </span>
                <ArrowUp className="size-3.5" />
              </>
            )}
          </button>
        </div>
      </ComposerInputShell>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 w-full rounded-lg border border-destructive/20 bg-destructive/10 p-3"
          >
            <p className="text-sm text-destructive">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
