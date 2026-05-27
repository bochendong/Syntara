'use client';

import { AlertCircle, CheckCircle2, FileUp, Globe2, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ProblemDraftForm } from '@/components/problem-bank/problem-draft-form';
import {
  PROBLEM_BANK_OUTLINE_BLUE_BUTTON_CLASS,
  PROBLEM_BANK_PRIMARY_BUTTON_CLASS,
  difficultyLabel,
  statusLabel,
  typeLabel,
} from '@/components/problem-bank/course-problem-bank-helpers';
import type { CourseProblemBankController } from '@/components/problem-bank/use-course-problem-bank-controller';
import { cn } from '@/lib/utils';

export function CourseProblemImportDialog({ view }: { view: CourseProblemBankController }) {
  const {
    commitLoading,
    draftEditorText,
    drafts,
    editingDraft,
    editingDraftIsManual,
    handleCommitImport,
    handlePreviewImport,
    handleSaveDraftEditor,
    handleSaveManualDraft,
    importEstimatedProblemCount,
    importFile,
    importMode,
    importOpen,
    importProcessedProblemCount,
    importProcessingDetail,
    importProcessingStage,
    importSummaryNote,
    importText,
    importUsage,
    importWebQuery,
    importWebSearchSummary,
    includedDraftIds,
    locale,
    notebookOptions,
    previewLoading,
    setDraftEditorText,
    setDrafts,
    setEditingDraftId,
    setImportFile,
    setImportMode,
    setImportOpen,
    setImportText,
    setImportWebQuery,
    setIncludedDraftIds,
    webSearchProviderId,
    webSearchProvidersConfig,
  } = view;

  return (
    <Dialog open={importOpen} onOpenChange={setImportOpen}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-5xl overflow-y-auto rounded-2xl p-4 sm:max-h-[85vh] sm:w-full sm:p-6">
        <DialogHeader>
          <DialogTitle>
            {locale === 'zh-CN' ? '导入题目到课程题库' : 'Import into course problem bank'}
          </DialogTitle>
          <DialogDescription>
            {locale === 'zh-CN'
              ? '系统会先生成预览，再为每道题标记对应笔记本；找不到时会保留为未归类。'
              : 'We preview first, then assign each problem to a notebook when possible.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={importMode === 'text' ? 'default' : 'outline'}
            className={cn(
              'h-auto min-h-9',
              importMode === 'text'
                ? PROBLEM_BANK_PRIMARY_BUTTON_CLASS
                : PROBLEM_BANK_OUTLINE_BLUE_BUTTON_CLASS,
            )}
            onClick={() => setImportMode('text')}
          >
            {locale === 'zh-CN' ? '文本' : 'Text'}
          </Button>
          <Button
            type="button"
            variant={importMode === 'pdf' ? 'default' : 'outline'}
            className={cn(
              'h-auto min-h-9',
              importMode === 'pdf'
                ? PROBLEM_BANK_PRIMARY_BUTTON_CLASS
                : PROBLEM_BANK_OUTLINE_BLUE_BUTTON_CLASS,
            )}
            onClick={() => setImportMode('pdf')}
          >
            PDF
          </Button>
          <Button
            type="button"
            variant={importMode === 'web' ? 'default' : 'outline'}
            className={cn(
              'h-auto min-h-9',
              importMode === 'web'
                ? PROBLEM_BANK_PRIMARY_BUTTON_CLASS
                : PROBLEM_BANK_OUTLINE_BLUE_BUTTON_CLASS,
            )}
            onClick={() => setImportMode('web')}
          >
            <Globe2 className="mr-2 h-4 w-4" />
            {locale === 'zh-CN' ? '联网搜索' : 'Web search'}
          </Button>
          <Button
            type="button"
            variant={importMode === 'manual' ? 'default' : 'outline'}
            className={cn(
              'h-auto min-h-9',
              importMode === 'manual'
                ? PROBLEM_BANK_PRIMARY_BUTTON_CLASS
                : PROBLEM_BANK_OUTLINE_BLUE_BUTTON_CLASS,
            )}
            onClick={() => setImportMode('manual')}
          >
            {locale === 'zh-CN' ? '手动添加题目' : 'Manual draft'}
          </Button>
        </div>

        {importMode === 'text' ? (
          <Textarea
            className="min-h-[220px]"
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            placeholder={
              locale === 'zh-CN'
                ? '粘贴混合题库内容；系统会尝试按课程内笔记本自动分配。'
                : 'Paste a mixed problem sheet. We will try to assign each problem to a notebook.'
            }
          />
        ) : importMode === 'pdf' ? (
          <div className="space-y-3">
            <Input
              type="file"
              accept=".pdf,application/pdf"
              onChange={(event) => setImportFile(event.target.files?.[0] || null)}
            />
            {importFile ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">{importFile.name}</p>
            ) : null}
          </div>
        ) : importMode === 'web' ? (
          <div className="space-y-3">
            <Input
              value={importWebQuery}
              onChange={(event) => setImportWebQuery(event.target.value)}
              placeholder={
                locale === 'zh-CN'
                  ? '例如：UTSC CSCC69 past exam algorithm final'
                  : 'Example: university + course code + past exam + topic keywords'
              }
            />
            {!(
              webSearchProvidersConfig[webSearchProviderId]?.apiKey ||
              webSearchProvidersConfig[webSearchProviderId]?.isServerConfigured
            ) ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-6 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
                {locale === 'zh-CN'
                  ? '当前未检测到联网搜索配置。请先在设置中启用 Tavily。'
                  : 'Web search is not configured yet. Please enable Tavily first.'}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
            {locale === 'zh-CN'
              ? '会先创建 1 道可编辑草稿，并打开表单编辑器。你可以直接指定所属笔记本，或者暂时留空，之后再归类到课程里的某一章节。'
              : 'We will create one editable draft and open the form editor. You can assign it to a notebook now or leave it unassigned and organize it later.'}
          </div>
        )}

        <div className="flex justify-end">
          <Button
            onClick={handlePreviewImport}
            disabled={previewLoading || commitLoading}
            className={cn('w-full min-[420px]:w-auto', PROBLEM_BANK_PRIMARY_BUTTON_CLASS)}
          >
            {previewLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileUp className="mr-2 h-4 w-4" />
            )}
            {importMode === 'manual'
              ? locale === 'zh-CN'
                ? '创建草稿'
                : 'Create draft'
              : locale === 'zh-CN'
                ? '生成预览'
                : 'Preview import'}
          </Button>
        </div>

        {importProcessingStage !== 'idle' ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/60">
            <div className="flex items-start gap-3">
              {(previewLoading || commitLoading) && importProcessingStage !== 'completed' ? (
                <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-sky-600" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {locale === 'zh-CN' ? '导题处理中' : 'Import in progress'}
                </p>
                <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                  {importProcessingDetail}
                </p>
                {(importEstimatedProblemCount > 0 || importProcessedProblemCount > 0) && (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    {locale === 'zh-CN' ? '题目进度' : 'Problem progress'}:{' '}
                    {importProcessedProblemCount} /{' '}
                    {Math.max(importProcessedProblemCount, importEstimatedProblemCount, 1)}
                  </p>
                )}
                {importUsage ? (
                  <p className="mt-2 text-xs text-sky-700 dark:text-sky-200">
                    {locale === 'zh-CN'
                      ? `本次导题扣费 ${importUsage.estimatedCostCredits ?? 0} 算力积分`
                      : `Import charged ${importUsage.estimatedCostCredits ?? 0} compute credits`}
                  </p>
                ) : null}
                {importWebSearchSummary ? (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {locale === 'zh-CN'
                      ? `联网搜索命中 ${importWebSearchSummary.sourceCount} 个来源，额外扣费 ${importWebSearchSummary.estimatedCostCredits} 算力积分`
                      : `Web search found ${importWebSearchSummary.sourceCount} sources and charged ${importWebSearchSummary.estimatedCostCredits} compute credits`}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {importSummaryNote ? (
          <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-900 dark:border-sky-500/30 dark:bg-sky-950/25 dark:text-sky-100">
            {importSummaryNote}
          </div>
        ) : null}

        {drafts.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-3">
              {drafts.map((draft) => (
                <div
                  key={draft.draftId}
                  className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"
                >
                  <div className="flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={includedDraftIds[draft.draftId] ?? false}
                          onChange={(event) =>
                            setIncludedDraftIds((prev) => ({
                              ...prev,
                              [draft.draftId]: event.target.checked,
                            }))
                          }
                        />
                        <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                          {draft.title}
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {typeLabel(draft.type, locale)} ·{' '}
                        {difficultyLabel(draft.difficulty, locale)} ·{' '}
                        {statusLabel(draft.status, locale)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(
                        'w-full min-[420px]:w-auto',
                        PROBLEM_BANK_OUTLINE_BLUE_BUTTON_CLASS,
                      )}
                      onClick={() => {
                        setEditingDraftId(draft.draftId);
                        setDraftEditorText(JSON.stringify(draft, null, 2));
                      }}
                    >
                      {draft.sourceMeta &&
                      typeof draft.sourceMeta === 'object' &&
                      (draft.sourceMeta as Record<string, unknown>).importMode === 'manual_create'
                        ? locale === 'zh-CN'
                          ? '编辑表单'
                          : 'Edit form'
                        : locale === 'zh-CN'
                          ? '编辑 JSON'
                          : 'Edit JSON'}
                    </Button>
                  </div>

                  <div className="mt-3">
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                      {locale === 'zh-CN' ? '归属笔记本' : 'Assigned notebook'}
                    </label>
                    <select
                      value={draft.notebookId || '__unassigned__'}
                      onChange={(event) =>
                        setDrafts((prev) =>
                          prev.map((item) =>
                            item.draftId === draft.draftId
                              ? {
                                  ...item,
                                  notebookId:
                                    event.target.value === '__unassigned__'
                                      ? null
                                      : event.target.value,
                                }
                              : item,
                          ),
                        )
                      }
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                    >
                      <option value="__unassigned__">
                        {locale === 'zh-CN' ? '未归类题目' : 'Unassigned'}
                      </option>
                      {notebookOptions.map((notebook) => (
                        <option key={notebook.id} value={notebook.id}>
                          {notebook.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {draft.validationErrors.length > 0 ? (
                    <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/20 dark:text-amber-200">
                      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                        <AlertCircle className="h-4 w-4" />
                        {locale === 'zh-CN' ? '待修正' : 'Needs attention'}
                      </div>
                      <div className="space-y-1 text-sm">
                        {draft.validationErrors.map((error, index) => (
                          <p key={`${draft.draftId}-error-${index}`}>{error}</p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="space-y-3">
              {editingDraft && editingDraftIsManual ? (
                <ProblemDraftForm
                  key={editingDraft.draftId}
                  draft={editingDraft}
                  locale={locale}
                  onSave={handleSaveManualDraft}
                />
              ) : (
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {locale === 'zh-CN' ? '草稿 JSON 编辑器' : 'Draft JSON editor'}
                  </p>
                  <Textarea
                    className="mt-3 min-h-[520px] font-mono text-xs"
                    value={draftEditorText}
                    onChange={(event) => setDraftEditorText(event.target.value)}
                  />
                  <div className="mt-3 flex justify-end">
                    <Button
                      type="button"
                      onClick={handleSaveDraftEditor}
                      className={cn('w-full min-[420px]:w-auto', PROBLEM_BANK_PRIMARY_BUTTON_CLASS)}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {locale === 'zh-CN' ? '保存草稿' : 'Save draft'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {drafts.length > 0 ? (
          <div className="flex justify-end">
            <Button
              onClick={handleCommitImport}
              disabled={commitLoading}
              className={cn('w-full min-[420px]:w-auto', PROBLEM_BANK_PRIMARY_BUTTON_CLASS)}
            >
              {commitLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {locale === 'zh-CN' ? '写入课程题库' : 'Commit import'}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
