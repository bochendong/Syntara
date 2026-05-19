'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUp, BotOff, Loader2, Settings } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { createLogger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { GenerationToolbar } from '@/components/generation/generation-toolbar';
import { useSettingsStore } from '@/lib/store/settings';
import { useUserProfileStore } from '@/lib/store/user-profile';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { toast } from '@/lib/notifications/client-toast';
import { useDraftCache } from '@/lib/hooks/use-draft-cache';
import { SpeechButton } from '@/components/audio/speech-button';
import { PdfPageSelectionDialog } from '@/components/create/pdf-page-selection-dialog';
import {
  ComposerInputShell,
  composerTextareaClassName,
} from '@/components/ui/composer-input-shell';
import {
  PDF_PAGE_SELECTION_MAX_BYTES,
  getPdfSourceFileSignature,
  type PdfSourceSelection,
} from '@/lib/pdf/page-selection';
import { useNotebookGenerationQueueStore } from '@/lib/store/notebook-generation-queue';
import { NotebookGenerationQueuePanel } from '@/components/generation/notebook-generation-queue-panel';
import { useOrchestratorNotebookGenStore } from '@/lib/store/orchestrator-notebook-generation';
import { useNotificationStore } from '@/lib/store/notifications';
import { buildStudyCompanionNotification } from '@/lib/learning/study-memory';

const log = createLogger('CreateNotebookComposer');

interface FormState {
  sourceFile: File | null;
  requirement: string;
}

const initialFormState: FormState = {
  sourceFile: null,
  requirement: '',
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

/** 课程内创建界面的需求输入区；提交后进入当前标签页的生成队列。 */
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
  const enqueueCompanionBanner = useNotificationStore((s) => s.enqueueBanner);
  const notebookModelMode = useOrchestratorNotebookGenStore((s) => s.notebookModelMode);
  const modelIdOverride = useOrchestratorNotebookGenStore((s) => s.modelIdOverride);
  const notebookStageModelOverrides = useOrchestratorNotebookGenStore(
    (s) => s.notebookStageModelOverrides,
  );
  const language = useOrchestratorNotebookGenStore((s) => s.language);
  const webSearch = useOrchestratorNotebookGenStore((s) => s.webSearch);
  const generateSlides = useOrchestratorNotebookGenStore((s) => s.generateSlides);
  const slideGenerationRoute = useOrchestratorNotebookGenStore((s) => s.slideGenerationRoute);
  const outlineLength = useOrchestratorNotebookGenStore((s) => s.outlineLength);
  const includeQuizScenes = useOrchestratorNotebookGenStore((s) => s.includeQuizScenes);
  const workedExampleLevel = useOrchestratorNotebookGenStore((s) => s.workedExampleLevel);
  const useAiImages = useOrchestratorNotebookGenStore((s) => s.useAiImages);

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
          notebookModelMode,
          modelIdOverride,
          notebookStageModelOverrides,
          language,
          webSearch,
          generateSlides,
          slideGenerationRoute,
          sourceFile: form.sourceFile,
          sourcePageSelection: effectiveSelection,
          userNickname: userProfile.nickname || undefined,
          userBio: userProfile.bio || undefined,
          imageGenerationEnabledOverride: useAiImages,
          outlinePreferences: {
            length: outlineLength,
            includeQuizScenes,
            workedExampleLevel,
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
            enqueueCompanionBanner(
              buildStudyCompanionNotification({
                id: `notebook-ready:${result.stage.id}`,
                sourceKind: 'notebook_ready',
                title: '笔记本生成好了',
                body:
                  result.scenes.length > 0
                    ? `笔记本「${result.stage.name}」已创建完成，共 ${result.scenes.length} 页。`
                    : `笔记本「${result.stage.name}」已加入仓库。`,
                amountLabel: '生成好了',
                sourceLabel: '笔记本生成',
                details: [
                  { key: 'notebook', label: '笔记本', value: result.stage.name },
                  { key: 'pages', label: '页面数', value: String(result.scenes.length) },
                ],
              }),
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
      toast.success(generateSlides ? '已加入生成队列' : '已加入仓库队列');
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
  const createNotebookPlaceholder =
    language === 'zh-CN'
      ? '描述这本笔记本要怎么生成，例如：\n「围绕上传资料整理成 10 页复习笔记」\n「重点讲清定义、证明思路和常见误区」\n「每个概念配 1 道例题和 1 道练习」'
      : 'Describe the notebook you want to create, e.g.\n"Turn the uploaded material into a 10-page review notebook"\n"Focus on definitions, proof ideas, and common mistakes"\n"Add one worked example and one practice problem per concept"';

  return (
    <div className={cn('w-full', className)}>
      <NotebookGenerationQueuePanel className="mb-3" />
      <PdfPageSelectionDialog
        open={pageSelectionDialogOpen}
        file={form.sourceFile}
        language={language}
        onOpenChange={setPageSelectionDialogOpen}
        onConfirm={(selection) => {
          setSourcePageSelection(selection);
          setPageSelectionDialogOpen(false);
          void handleGenerate(selection);
        }}
      />
      <ComposerInputShell className="w-full">
        <textarea
          ref={textareaRef}
          placeholder={createNotebookPlaceholder}
          className={cn(composerTextareaClassName, 'px-4 pb-2 pt-4 text-[13px]', textareaBox)}
          value={form.requirement}
          onChange={(e) => updateForm('requirement', e.target.value)}
          onKeyDown={handleKeyDown}
          rows={4}
          disabled={busy}
        />

        <div className="flex items-end gap-2 px-3 pb-3">
          <div className="min-w-0 flex-1">
            <GenerationToolbar
              language={language}
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
                  {generateSlides ? t('toolbar.enterClassroom') : '加入仓库'}
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
