'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BotOff,
  CheckCircle2,
  ChevronDown,
  FileText,
  FileUp,
  Globe2,
  ImageIcon,
  ListChecks,
  Loader2,
  Maximize2,
  PencilLine,
  PlayCircle,
  Plus,
  RefreshCcw,
  Search,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { PdfPageSelectionDialog } from '@/components/create/pdf-page-selection-dialog';
import { SpeechButton } from '@/components/audio/speech-button';
import { cn } from '@/lib/utils';
import type { OrchestratorWorkedExampleLevel } from '@/lib/store/orchestrator-notebook-generation';
import {
  IMAGE_GENERATION_STATUS_LABELS,
  MAX_SOURCE_FILE_SIZE_MB,
  PALETTES,
  PLANNING_MOCK_STATE_LABELS,
  PLANNING_MOCK_STATE_OPTIONS,
  STYLE_OPTIONS,
  WORKSPACE_PROGRESS_STEPS,
  fileKindLabel,
  formatFileSize,
  getGeneratedPageThumbnailUrl,
  getImageGenerationTileStatus,
  imageGenerationFocusClassName,
  imageGenerationGridClassName,
  imageGenerationTilePaddingClassName,
  imageGenerationTitleClassName,
  ImageGenerationCardProcessPreview,
  type ImageGenerationMockPageCount,
} from './create-notebook-workspace-model';
import {
  FieldShell,
  PipelineTextPanel,
  PlanningStreamBox,
  PromptPreviewPanel,
  StepProgress,
} from './create-notebook-workspace-panels';
import { useCreateNotebookWorkspaceController } from './use-create-notebook-workspace-controller';
export function CreateNotebookWorkspace({ courseId }: { courseId: string }) {
  const [previewSlide, setPreviewSlide] = useState<{
    imageUrl: string;
    pageNumber: number;
    title: string;
  } | null>(null);
  const controller = useCreateNotebookWorkspaceController({ courseId });
  const {
    activeGenerationTask,
    activeStep,
    activeStepIndex,
    activeStepLabel,
    addOutlineRow,
    busy,
    canStartImageGenerationFromResult,
    clearPlanningMockOverride,
    clearSourceFile,
    completedPlanningPhases,
    confirmedGenerationPromptPreview,
    copyPrompt,
    customStylePrompt,
    displayedPlanningStreamingPhases,
    drawingStylePromptCharacterCount,
    error,
    fileInputRef,
    form,
    generateOutlineForReview,
    generateStyleSample,
    goBack,
    goNext,
    handleFileSelect,
    handleGenerate,
    handleSourceInputDragEnter,
    handleSourceInputDragLeave,
    handleSourceInputDragOver,
    handleSourceInputDrop,
    hasCustomDrawingStyle,
    hasInput,
    hasPlanningMockStreams,
    hasSelectableSourceImages,
    hasSelectedPlanningStepText,
    hidePlanningInputPanel,
    imageGenerationGridRows,
    imageGenerationMockEnabled,
    imageGenerationMockPageCount,
    includeQuizScenes,
    keptMaterials,
    language,
    materials,
    missingSourceImagePreviewCount,
    notebookKind,
    outlineGenerationMessage,
    outlineGenerationStatus,
    outlineIsLoading,
    outlineLength,
    outlineNeedsInitialGeneration,
    outlineNextDisabled,
    outlineRows,
    pageSelectionDialogOpen,
    planningInputPreview,
    planningListPages,
    planningPhase,
    planningRevealRevision,
    resetSourceInput,
    resetStyleState,
    selectDrawingStyle,
    selectedOutline,
    selectedPalette,
    selectedPaletteId,
    selectedPlanningEffectivePhaseState,
    selectedPlanningIsWriting,
    selectedPlanningMockPhaseState,
    selectedPlanningPage,
    selectedPlanningRealPhaseState,
    selectedPlanningStepIsWriting,
    selectedPlanningStepText,
    selectedPlanningStructuredLoadingState,
    selectedPlanningStructuredOutput,
    selectedSourceImageIdSet,
    selectedSourceImages,
    selectedStyle,
    selectedStyleId,
    selectProgressStep,
    setActiveStep,
    setAllSourceImagesSelected,
    setConfirmedImageNotebookPlan,
    setCurrentPlanningPageNumbers,
    setCustomStylePrompt,
    setImageGenerationMockPageCount,
    setIncludeQuizScenes,
    setLanguage,
    setMaterialKeep,
    setNotebookKind,
    setOutlineGenerationMessage,
    setOutlineGenerationStatus,
    setOutlineLength,
    setOutlineRows,
    setPageSelectionDialogOpen,
    setPlanningCourseSpine,
    setPlanningLiveDraft,
    setPlanningMockPhaseState,
    setPlanningMockPhaseStates,
    setPlanningMockStreamingPhases,
    setPlanningMockStreams,
    setPlanningPages,
    setPlanningQuality,
    setPlanningRealPhaseStates,
    setPlanningStreamEvents,
    setSelectedOutlineId,
    setSelectedPaletteId,
    setSourceImageSelection,
    setSourcePageSelection,
    setWorkedExampleLevel,
    showPlanningInputOnly,
    showPlanningOutputPanel,
    sourceDragActive,
    sourcePreview,
    startParallelPlanningMockStreams,
    structuredPlanningCourseSpine,
    stylePromptTextareaRef,
    styleSample,
    styleSampleError,
    styleSampleIsCurrent,
    styleSampleIsStale,
    styleSampleQualityPassed,
    styleSampleStatus,
    updateRequirement,
    visiblePilotImagePrompt,
    workedExampleLevel,
  } = controller;
  const completedNotebookHref =
    activeGenerationTask?.status === 'completed' && activeGenerationTask.notebookId
      ? `/classroom/${encodeURIComponent(activeGenerationTask.notebookId)}`
      : '';
  const classroomHref = completedNotebookHref || `/course/${encodeURIComponent(courseId)}`;

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
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
      <Dialog open={Boolean(previewSlide)} onOpenChange={(open) => !open && setPreviewSlide(null)}>
        <DialogContent className="w-[min(94vw,1180px)] max-w-[1180px] gap-0 overflow-hidden rounded-2xl border-white/20 bg-slate-950 p-0 text-white shadow-[0_30px_120px_rgba(15,23,42,0.45)]">
          <DialogTitle className="sr-only">
            {previewSlide ? `第 ${previewSlide.pageNumber} 页生成缩略图预览` : '生成缩略图预览'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            放大查看已经生成完成的 16:9 幻灯片图片。
          </DialogDescription>
          <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-3 pr-14">
            <div className="min-w-0">
              <p className="text-xs font-medium text-white/55">
                第 {String(previewSlide?.pageNumber ?? 0).padStart(2, '0')} 页
              </p>
              <p className="mt-1 truncate text-sm font-semibold">
                {previewSlide?.title || '生成页面'}
              </p>
            </div>
          </div>
          <div className="bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.2),transparent_34%),#020617] p-4 sm:p-6">
            {previewSlide ? (
              <img
                src={previewSlide.imageUrl}
                alt={`第 ${previewSlide.pageNumber} 页生成图`}
                className="mx-auto aspect-video max-h-[76vh] w-full rounded-xl border border-white/10 bg-white object-contain shadow-2xl shadow-black/35"
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden lg:flex-row lg:gap-7">
        <aside className="shrink-0 lg:flex lg:w-[118px] lg:items-center lg:justify-center">
          <StepProgress
            activeStep={activeStep}
            planningPhase={planningPhase}
            streamingPhases={displayedPlanningStreamingPhases}
            completedPhases={completedPlanningPhases}
            onStepSelect={selectProgressStep}
            className="lg:w-[96px]"
          />
        </aside>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden lg:overflow-visible">
          <div className="min-h-0 flex-1 overflow-hidden lg:overflow-visible">
            {activeStep === 'input' ? (
              <div className="grid h-full min-h-0 gap-7 overflow-y-auto pb-2 pr-1 overscroll-contain lg:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)] lg:overflow-visible lg:pb-0 lg:pr-0">
                <section className="flex min-h-0 flex-col gap-3 lg:pl-6">
                  <div
                    className={cn(
                      'relative flex min-h-0 flex-1 flex-col overflow-visible rounded-[28px] border border-sky-100/90 bg-white/[0.92] p-5 shadow-[0_22px_80px_rgba(15,23,42,0.10)] ring-1 ring-white/80 transition-all lg:pl-12 dark:border-white/[0.08] dark:bg-white/[0.04] dark:ring-white/[0.04]',
                      sourceDragActive &&
                        'border-blue-500/55 bg-blue-50/70 ring-4 ring-blue-500/10 dark:border-cyan-300/50 dark:bg-blue-500/15',
                    )}
                    onDragEnter={handleSourceInputDragEnter}
                    onDragLeave={handleSourceInputDragLeave}
                    onDragOver={handleSourceInputDragOver}
                    onDrop={handleSourceInputDrop}
                  >
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute bottom-0 left-0 top-0 hidden w-4 rounded-l-[28px] border-r border-slate-900/[0.045] bg-gradient-to-r from-slate-100/50 via-white/55 to-transparent lg:block"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute -left-[18px] top-14 hidden h-[190px] w-[44px] lg:block"
                    >
                      {[0, 1, 2, 3].map((ring) => (
                        <span
                          key={ring}
                          className="absolute left-0 h-2 w-[44px] rounded-full border border-slate-400/55 bg-gradient-to-r from-slate-500/75 via-white to-slate-200 shadow-[0_2px_5px_rgba(15,23,42,0.18)]"
                          style={{ top: `${ring * 46}px` }}
                        >
                          <span className="absolute left-[5px] top-1/2 h-px w-8 -translate-y-1/2 rounded-full bg-white/80" />
                        </span>
                      ))}
                    </div>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute -left-2 bottom-[72px] hidden h-14 w-7 rotate-[20deg] rounded-full border-2 border-slate-300/80 border-r-slate-400/75 shadow-[0_2px_6px_rgba(15,23,42,0.14)] lg:block"
                    >
                      <span className="absolute left-1.5 top-1.5 h-11 w-4 rounded-full border-2 border-slate-300/75 border-r-slate-400/65" />
                    </span>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute left-12 right-8 top-[82px] hidden h-px bg-slate-900/[0.075] lg:block"
                    />
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="flex size-11 items-center justify-center rounded-[14px] bg-slate-950 text-white shadow-sm shadow-slate-950/20 dark:bg-white dark:text-slate-950">
                          <Sparkles className="size-4" />
                        </span>
                        <Label className="text-[17px] font-semibold">主题或问题</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <SpeechButton
                          size="md"
                          disabled={busy}
                          onTranscription={(text) => {
                            const next = form.requirement + (form.requirement ? ' ' : '') + text;
                            updateRequirement(next);
                          }}
                        />
                      </div>
                    </div>
                    <div className="mt-5 grid grid-cols-2 gap-2 rounded-[18px] border border-slate-900/[0.06] bg-white/72 p-1.5 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.04]">
                      {[
                        {
                          kind: 'image' as const,
                          label: '图像笔记本',
                          desc: '生成图片课堂页',
                          icon: ImageIcon,
                        },
                        {
                          kind: 'markdown' as const,
                          label: 'Markdown 文档',
                          desc: '连续阅读稿',
                          icon: FileText,
                        },
                      ].map((option) => {
                        const selected = notebookKind === option.kind;
                        const Icon = option.icon;
                        return (
                          <button
                            key={option.kind}
                            type="button"
                            disabled={busy}
                            onClick={() => setNotebookKind(option.kind)}
                            className={cn(
                              'flex min-h-[58px] items-center gap-3 rounded-[14px] px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                              selected
                                ? 'bg-slate-950 text-white shadow-sm shadow-slate-950/15 dark:bg-white dark:text-slate-950'
                                : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-white/[0.08]',
                            )}
                          >
                            <span
                              className={cn(
                                'flex size-9 shrink-0 items-center justify-center rounded-lg',
                                selected
                                  ? 'bg-white/12 dark:bg-black/10'
                                  : 'bg-slate-100 text-slate-600 dark:bg-white/[0.08] dark:text-slate-300',
                              )}
                            >
                              <Icon className="size-4" />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold">
                                {option.label}
                              </span>
                              <span
                                className={cn(
                                  'mt-0.5 block truncate text-[11px]',
                                  selected
                                    ? 'text-white/70 dark:text-slate-700'
                                    : 'text-muted-foreground',
                                )}
                              >
                                {option.desc}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <Textarea
                      value={form.requirement}
                      onChange={(event) => updateRequirement(event.target.value)}
                      placeholder="例如：讲一下 loop，生成 5 页以下 overview；或者讲清黎曼积分的直观含义、定义和一个轻量例题。"
                      className="mt-6 min-h-[300px] flex-1 resize-none rounded-none border-0 bg-transparent px-0 py-2 text-[16px] leading-10 shadow-none placeholder:text-slate-500/[0.72] focus-visible:ring-0 lg:mb-[104px] dark:bg-transparent"
                      disabled={busy}
                      style={{
                        backgroundImage:
                          'linear-gradient(to bottom, transparent 38px, rgba(100, 116, 139, 0.18) 39px, rgba(100, 116, 139, 0.18) 40px, transparent 40px)',
                        backgroundSize: '100% 40px',
                      }}
                    />

                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept=".pdf,.pptx,.md,text/markdown,text/x-markdown,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) handleFileSelect(file);
                        event.target.value = '';
                      }}
                    />
                    <div
                      className={cn(
                        'mt-5 flex items-center justify-between gap-3 rounded-[22px] border border-dashed px-5 py-4 transition-colors lg:absolute lg:bottom-5 lg:left-12 lg:right-5 lg:mt-0',
                        sourceDragActive
                          ? 'border-blue-500/45 bg-white/95 shadow-sm shadow-blue-900/[0.04] dark:bg-blue-500/10'
                          : form.sourceFile
                            ? 'border-teal-500/30 bg-white/85 shadow-sm shadow-teal-900/[0.03] dark:bg-teal-500/10'
                            : 'border-slate-900/[0.08] bg-white/70 hover:border-blue-400/45 hover:bg-white/95 dark:border-white/[0.08] dark:bg-white/[0.04] dark:hover:bg-blue-500/10',
                      )}
                    >
                      <button
                        type="button"
                        className="group flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={busy}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <span className="flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-blue-600 text-white shadow-sm shadow-blue-900/20">
                          {form.sourceFile ? (
                            <FileText className="size-4" />
                          ) : (
                            <FileUp className="size-4" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[15px] font-semibold">
                            {form.sourceFile ? form.sourceFile.name : '上传参考资料（可选）'}
                          </span>
                          <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                            {form.sourceFile
                              ? `${fileKindLabel(form.sourceFile)} · ${formatFileSize(form.sourceFile.size)}`
                              : `PDF / PPTX / Markdown，不超过 ${MAX_SOURCE_FILE_SIZE_MB}MB。`}
                          </span>
                        </span>
                      </button>
                      {form.sourceFile ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="移除源文件"
                          className="size-8 shrink-0 rounded-lg text-muted-foreground hover:text-rose-600"
                          disabled={busy}
                          onClick={() => {
                            clearSourceFile();
                          }}
                        >
                          <X className="size-4" />
                        </Button>
                      ) : (
                        <span className="hidden flex-wrap justify-end gap-1.5 sm:flex">
                          {['PDF', 'PPTX', 'Markdown'].map((kind) => (
                            <span
                              key={kind}
                              className="rounded-full border border-slate-900/[0.06] bg-white/80 px-2.5 py-1 text-[11px] font-medium text-slate-600 shadow-sm backdrop-blur dark:border-white/[0.08] dark:bg-white/[0.08] dark:text-slate-300"
                            >
                              {kind}
                            </span>
                          ))}
                        </span>
                      )}
                      <span className="sr-only">文件只作为补充，不是生成 notebook 的必填项。</span>
                    </div>
                  </div>
                </section>

                <section className="flex min-h-0 flex-col gap-3">
                  <div className="flex min-h-0 flex-1 flex-col rounded-[28px] border border-blue-200/80 bg-[#f5f9ff]/[0.92] p-5 shadow-[0_22px_80px_rgba(37,99,235,0.10)] ring-1 ring-white/80 dark:border-white/[0.08] dark:bg-white/[0.04] dark:ring-white/[0.04]">
                    {notebookKind === 'image' ? (
                      <>
                        <div className="flex min-h-0 flex-1 flex-col">
                          <div className="mb-5 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <span className="flex size-12 items-center justify-center rounded-full bg-blue-600/10 text-blue-700 shadow-sm shadow-blue-900/[0.04] ring-1 ring-blue-600/10 dark:text-blue-200">
                                <Wand2 className="size-4" />
                              </span>
                              <div>
                                <Label className="text-[17px] font-semibold">绘画风格</Label>
                                <p className="mt-0.5 text-xs text-muted-foreground">画面美术</p>
                              </div>
                            </div>
                            <span className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-900/[0.06] bg-white/75 px-3 py-2 text-xs font-medium text-slate-600 shadow-sm dark:bg-white/[0.08] dark:text-slate-300">
                              <PencilLine className="size-3.5" />
                              {selectedStyleId === 'custom'
                                ? '自定义'
                                : hasCustomDrawingStyle
                                  ? `${selectedStyle.label} + 自定义`
                                  : selectedStyle.label}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                            {STYLE_OPTIONS.map((style) => {
                              const selected = selectedStyleId === style.id;
                              return (
                                <button
                                  key={style.id}
                                  type="button"
                                  disabled={busy}
                                  className={cn(
                                    'relative min-h-12 rounded-2xl border px-2.5 py-2 text-center text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                                    selected
                                      ? 'border-blue-500/50 bg-blue-500/10 text-blue-950 shadow-sm shadow-blue-950/[0.05] dark:text-blue-100'
                                      : 'border-slate-900/[0.06] bg-white/[0.76] shadow-sm shadow-slate-950/[0.035] hover:border-blue-400/35 hover:bg-white dark:border-white/[0.08] dark:bg-black/20 dark:hover:bg-blue-500/10',
                                  )}
                                  onClick={() => selectDrawingStyle(style)}
                                >
                                  {style.label}
                                  {selected ? (
                                    <span className="absolute -bottom-3 left-1/2 h-1 w-7 -translate-x-1/2 rounded-full bg-blue-600" />
                                  ) : null}
                                </button>
                              );
                            })}
                          </div>
                          <div className="relative mt-6 flex min-h-[220px] flex-1">
                            <Textarea
                              ref={stylePromptTextareaRef}
                              value={customStylePrompt}
                              onChange={(event) => {
                                setCustomStylePrompt(event.target.value);
                                setConfirmedImageNotebookPlan(null);
                              }}
                              placeholder="也可以直接输入绘画风格，例如：像可汗学院黑板手绘、Notability 手写笔记、水彩示意图、极简线稿、漫画分镜感..."
                              className="h-full min-h-[220px] flex-1 resize-none rounded-[18px] border border-blue-400/45 bg-white/[0.86] px-5 py-5 pb-12 text-sm leading-7 shadow-[inset_0_1px_5px_rgba(15,23,42,0.04)] placeholder:text-muted-foreground/55 focus-visible:border-blue-500/70 focus-visible:ring-blue-500/20 dark:border-white/[0.08] dark:bg-black/20"
                              disabled={busy}
                              style={{
                                backgroundImage:
                                  'linear-gradient(to bottom, transparent 27px, rgba(15, 23, 42, 0.035) 28px)',
                                backgroundSize: '100% 28px',
                              }}
                            />
                            <span className="pointer-events-none absolute bottom-4 right-11 text-xs text-slate-500">
                              {drawingStylePromptCharacterCount} / 300
                            </span>
                            <span
                              aria-hidden="true"
                              className="pointer-events-none absolute bottom-4 right-4 h-5 w-5 text-blue-500/75"
                            >
                              <span className="absolute bottom-0 right-0 h-px w-3 rotate-[-45deg] rounded-full bg-current" />
                              <span className="absolute bottom-1.5 right-0 h-px w-4 rotate-[-45deg] rounded-full bg-current" />
                              <span className="absolute bottom-3 right-0 h-px w-5 rotate-[-45deg] rounded-full bg-current" />
                            </span>
                          </div>
                        </div>

                        <div className="mt-5 grid gap-4 border-t border-dashed border-blue-200/80 pt-5 sm:grid-cols-2 dark:border-white/[0.08]">
                          <div className="rounded-[20px] bg-white/[0.66] px-4 py-3.5 shadow-sm shadow-blue-950/[0.025] dark:bg-black/20">
                            <div className="mb-2 flex items-center gap-2">
                              <span className="flex size-6 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-600/10 dark:bg-white/[0.08] dark:text-blue-200">
                                <Globe2 className="size-3.5" />
                              </span>
                              <Label className="text-xs font-semibold">课程语言</Label>
                            </div>
                            <Select
                              value={language}
                              onValueChange={(value) => setLanguage(value as 'zh-CN' | 'en-US')}
                            >
                              <SelectTrigger className="h-11 w-full rounded-xl bg-white text-base shadow-sm dark:bg-black/20">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="zh-CN">中文</SelectItem>
                                <SelectItem value="en-US">English</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="rounded-[20px] bg-white/[0.66] px-4 py-3.5 shadow-sm shadow-blue-950/[0.025] dark:bg-black/20">
                            <div className="mb-2 flex items-center gap-2">
                              <span className="flex size-6 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-600/10 dark:bg-white/[0.08] dark:text-blue-200">
                                <FileText className="size-3.5" />
                              </span>
                              <Label className="text-xs font-semibold">页数范围</Label>
                            </div>
                            <Select
                              value={outlineLength}
                              onValueChange={(value) =>
                                setOutlineLength(value as typeof outlineLength)
                              }
                            >
                              <SelectTrigger className="h-11 w-full rounded-xl bg-white text-base shadow-sm dark:bg-black/20">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="minimal">极简（5 页以下）</SelectItem>
                                <SelectItem value="compact">简短（10 页以下）</SelectItem>
                                <SelectItem value="standard">中等（10-20 页）</SelectItem>
                                <SelectItem value="extended">深入（20 页以上）</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="flex min-h-0 flex-1 flex-col">
                        <div className="mb-5 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="flex size-12 items-center justify-center rounded-full bg-emerald-600/10 text-emerald-700 shadow-sm shadow-emerald-900/[0.04] ring-1 ring-emerald-600/10 dark:text-emerald-200">
                              <FileText className="size-4" />
                            </span>
                            <div>
                              <Label className="text-[17px] font-semibold">Markdown 结构</Label>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                section 化文字笔记
                              </p>
                            </div>
                          </div>
                          <span className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-900/[0.06] bg-white/75 px-3 py-2 text-xs font-medium text-slate-600 shadow-sm dark:bg-white/[0.08] dark:text-slate-300">
                            <FileText className="size-3.5" />
                            纯文字
                          </span>
                        </div>
                        <div className="grid gap-3">
                          {[
                            ['按标题切分', '上传 .md 时会优先使用 # / ## / ### 标题作为 section。'],
                            [
                              '无标题自动分段',
                              'PDF、PPTX 或普通文本会按段落长度切成多个 section。',
                            ],
                            ['引用到 section', '课程聊天中的 reference 会指向第 N 个 section。'],
                          ].map(([title, body]) => (
                            <div
                              key={title}
                              className="rounded-[18px] border border-emerald-200/70 bg-white/72 px-4 py-3 shadow-sm shadow-emerald-950/[0.025] dark:border-white/[0.08] dark:bg-black/20"
                            >
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-300" />
                                <p className="text-sm font-semibold">{title}</p>
                              </div>
                              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                                {body}
                              </p>
                            </div>
                          ))}
                        </div>
                        <div className="mt-5 rounded-[20px] bg-white/[0.66] px-4 py-3.5 shadow-sm shadow-blue-950/[0.025] dark:bg-black/20">
                          <div className="mb-2 flex items-center gap-2">
                            <span className="flex size-6 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/10 dark:bg-white/[0.08] dark:text-emerald-200">
                              <Globe2 className="size-3.5" />
                            </span>
                            <Label className="text-xs font-semibold">课程语言</Label>
                          </div>
                          <Select
                            value={language}
                            onValueChange={(value) => setLanguage(value as 'zh-CN' | 'en-US')}
                          >
                            <SelectTrigger className="h-11 w-full rounded-xl bg-white text-base shadow-sm dark:bg-black/20">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="zh-CN">中文</SelectItem>
                              <SelectItem value="en-US">English</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="mt-5 flex min-h-[180px] flex-1 items-center justify-center rounded-[22px] border border-dashed border-emerald-300/70 bg-white/55 px-5 py-6 text-center dark:border-white/[0.12] dark:bg-white/[0.04]">
                          <p className="max-w-sm text-sm leading-7 text-slate-600 dark:text-slate-300">
                            点击下一步后会直接创建文字笔记本，不进入图片规划和生图队列。
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            ) : null}

            {activeStep === 'materials' ? (
              <div className="grid h-full min-h-0 gap-5 overflow-y-auto pr-1 overscroll-contain lg:grid-cols-[0.95fr_1.05fr] lg:overflow-hidden lg:pr-0">
                <section className="min-h-0">
                  <div className="max-h-full overflow-y-auto rounded-xl border border-slate-900/[0.07] bg-white p-4 shadow-sm shadow-slate-950/[0.03] overscroll-contain dark:border-white/[0.08] dark:bg-white/[0.04]">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">提取结果</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {sourcePreview.status === 'loading'
                            ? '正在读取文件内容…'
                            : sourcePreview.status === 'ready'
                              ? `${sourcePreview.items.length} 个片段可预览`
                              : sourcePreview.status === 'error'
                                ? '解析遇到问题'
                                : '等待素材输入'}
                        </p>
                      </div>
                      {sourcePreview.status === 'loading' ? (
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      ) : null}
                    </div>

                    {sourcePreview.status === 'error' ? (
                      <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
                        {sourcePreview.message}
                      </div>
                    ) : null}

                    {sourcePreview.status === 'loading' ? (
                      <div className="mt-3 space-y-2">
                        {[0, 1, 2].map((item) => (
                          <div
                            key={item}
                            className="h-[68px] animate-pulse rounded-lg bg-slate-100 dark:bg-white/[0.06]"
                          />
                        ))}
                      </div>
                    ) : null}

                    {sourcePreview.status === 'ready' ? (
                      <div className="mt-3 space-y-2">
                        {sourcePreview.items.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-lg border border-slate-900/[0.06] bg-slate-50/80 p-3 dark:border-white/[0.08] dark:bg-white/[0.04]"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold">{item.title}</span>
                              <span
                                className={cn(
                                  'rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                                  item.kind === '图片'
                                    ? 'bg-teal-500/10 text-teal-700 dark:text-teal-200'
                                    : item.kind === '目标'
                                      ? 'bg-violet-500/10 text-violet-700 dark:text-violet-200'
                                      : 'bg-blue-500/10 text-blue-700 dark:text-blue-200',
                                )}
                              >
                                {item.kind}
                              </span>
                            </div>
                            <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                              {item.kind === '图片' && hasSelectableSourceImages
                                ? `已选择 ${selectedSourceImages.length} / ${sourcePreview.imagePreviews.length} 张图片作为生成依据。`
                                : item.detail}
                            </p>
                            {item.kind === '图片' && sourcePreview.imagePreviews.length > 0 ? (
                              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                <div className="space-y-0.5">
                                  <span className="block text-[11px] font-medium text-muted-foreground">
                                    点选缩略图决定是否保留
                                  </span>
                                  <span className="block text-[11px] leading-relaxed text-muted-foreground">
                                    这里会展示 PDF
                                    中可独立抽出的图片，以及页面里自动裁出的图形区域。
                                  </span>
                                  {sourcePreview.imageDuplicateCount > 0 ? (
                                    <span className="block text-[11px] text-teal-700 dark:text-teal-200">
                                      已合并 {sourcePreview.imageDuplicateCount} 张重复图片
                                    </span>
                                  ) : null}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 rounded-lg px-2 text-xs"
                                    onClick={() => setAllSourceImagesSelected(true)}
                                  >
                                    全选
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 rounded-lg px-2 text-xs"
                                    onClick={() => setAllSourceImagesSelected(false)}
                                  >
                                    清空
                                  </Button>
                                </div>
                              </div>
                            ) : null}
                            {item.kind === '图片' && sourcePreview.imagePreviews.length > 0 ? (
                              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                {sourcePreview.imagePreviews.map((image) => {
                                  const selected = selectedSourceImageIdSet.has(image.id);
                                  return (
                                    <div
                                      key={image.id}
                                      role="button"
                                      tabIndex={0}
                                      aria-pressed={selected}
                                      onClick={(event) => {
                                        if ((event.target as HTMLElement).closest('button')) return;
                                        setSourceImageSelection(image.id, !selected);
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key !== 'Enter' && event.key !== ' ') return;
                                        event.preventDefault();
                                        setSourceImageSelection(image.id, !selected);
                                      }}
                                      className={cn(
                                        'relative cursor-pointer overflow-hidden rounded-lg border bg-white transition dark:bg-white/[0.05]',
                                        selected
                                          ? 'border-blue-500 shadow-sm shadow-blue-500/15'
                                          : 'border-slate-900/[0.06] opacity-55 dark:border-white/[0.08]',
                                      )}
                                    >
                                      <Checkbox
                                        checked={selected}
                                        onCheckedChange={(checked) =>
                                          setSourceImageSelection(image.id, checked === true)
                                        }
                                        aria-label={`保留${image.title}`}
                                        className="absolute left-2 top-2 z-10 bg-white/90 shadow-sm"
                                      />
                                      <div className="aspect-[4/3] bg-slate-50 dark:bg-slate-900">
                                        <img
                                          src={image.url}
                                          alt={image.title}
                                          className="h-full w-full object-contain"
                                        />
                                      </div>
                                      <div className="truncate px-2 py-1.5 text-[10px] font-medium text-muted-foreground">
                                        {image.title}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
                            {item.kind === '图片' &&
                            missingSourceImagePreviewCount > 0 &&
                            sourcePreview.imagePreviews.length > 0 ? (
                              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                                还有 {missingSourceImagePreviewCount}{' '}
                                张图片未生成缩略图，不会进入本次图片依据。
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {sourcePreview.warnings.length > 0 ? (
                      <div className="mt-3 space-y-1">
                        {sourcePreview.warnings.slice(0, 2).map((warning) => (
                          <p key={warning} className="text-[11px] leading-relaxed text-amber-700">
                            {warning}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className="min-h-0">
                  <div className="max-h-full overflow-y-auto rounded-xl border border-slate-900/[0.06] bg-white/80 p-4 overscroll-contain dark:border-white/[0.08] dark:bg-black/20">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">素材清单</p>
                        <p className="text-xs text-muted-foreground">
                          {keptMaterials.length}/{materials.length} 项将写入生成要求
                        </p>
                      </div>
                      <Search className="size-4 text-muted-foreground" />
                    </div>
                    <div className="space-y-2">
                      {materials.map((item) => (
                        <label
                          key={item.id}
                          className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-900/[0.06] bg-slate-50/70 p-3 dark:border-white/[0.08] dark:bg-white/[0.04]"
                        >
                          <Checkbox
                            checked={item.keep}
                            onCheckedChange={(checked) =>
                              setMaterialKeep(item.id, checked === true)
                            }
                            className="mt-0.5"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{item.title}</span>
                              <span className="rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-200">
                                {item.kind}
                              </span>
                            </div>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                              {(item.id === 'pdf-images' || item.id === 'pptx-images') &&
                              hasSelectableSourceImages
                                ? `已保留 ${selectedSourceImages.length}/${sourcePreview.imagePreviews.length} 张图片`
                                : item.id === 'pdf-formulas'
                                  ? '从正文中识别公式、图表和视觉结构作为页面规划依据'
                                  : item.detail}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </section>
              </div>
            ) : null}

            {activeStep === 'outline' ? (
              <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pr-1 overscroll-contain lg:overflow-hidden lg:pr-0">
                <div className="flex shrink-0 items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">
                      {outlineIsLoading ? '正在生成规划与画图 prompt' : '审查规划与画图 prompt'}
                    </h2>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {outlineGenerationMessage}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    {canStartImageGenerationFromResult ? (
                      <Button
                        type="button"
                        size="sm"
                        className="h-9 rounded-lg"
                        disabled={busy}
                        onClick={() => void handleGenerate()}
                      >
                        {busy ? (
                          <Loader2 className="mr-1.5 size-4 animate-spin" />
                        ) : (
                          <Sparkles className="mr-1.5 size-4" />
                        )}
                        开始并行生图
                      </Button>
                    ) : null}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-lg"
                        >
                          <ListChecks className="mr-1.5 size-3.5" />
                          生成状态
                          {selectedPlanningEffectivePhaseState ? (
                            <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-white/[0.08] dark:text-slate-300">
                              {PLANNING_MOCK_STATE_LABELS[selectedPlanningEffectivePhaseState]}
                            </span>
                          ) : null}
                          {selectedPlanningMockPhaseState ? (
                            <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-400/10 dark:text-amber-200">
                              Mock
                            </span>
                          ) : null}
                          <ChevronDown className="ml-1 size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-64">
                        <DropdownMenuLabel>规划 + prompt 链路状态</DropdownMenuLabel>
                        <div className="px-2 pb-2 text-[11px] leading-relaxed text-muted-foreground">
                          真实：
                          {selectedPlanningRealPhaseState
                            ? PLANNING_MOCK_STATE_LABELS[selectedPlanningRealPhaseState]
                            : '未开始'}
                        </div>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={!hasPlanningMockStreams}
                          onSelect={clearPlanningMockOverride}
                        >
                          <RefreshCcw className="size-3.5" />
                          跟随真实链路
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {PLANNING_MOCK_STATE_OPTIONS.map((option) => {
                          const active = selectedPlanningMockPhaseState === option.state;
                          const Icon =
                            option.state === 'input'
                              ? FileText
                              : option.state === 'done'
                                ? CheckCircle2
                                : Loader2;
                          return (
                            <DropdownMenuItem
                              key={option.state}
                              className={cn(
                                'items-start gap-2 py-2',
                                active && 'bg-blue-50 text-blue-700 dark:bg-blue-300/[0.08]',
                              )}
                              onSelect={() =>
                                setPlanningMockPhaseState(planningPhase, option.state)
                              }
                            >
                              <Icon className="mt-0.5 size-3.5" />
                              <span className="min-w-0 flex-1">
                                <span className="block text-xs font-medium">{option.label}</span>
                                <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                                  {option.helper}
                                </span>
                              </span>
                              {active ? <CheckCircle2 className="mt-0.5 size-3.5" /> : null}
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg"
                      disabled={outlineIsLoading}
                      onClick={addOutlineRow}
                    >
                      <Plus className="mr-1.5 size-3.5" />
                      新增页面
                    </Button>
                  </div>
                </div>

                {outlineGenerationStatus === 'error' && outlineRows.length === 0 ? (
                  <div className="rounded-xl border border-amber-500/25 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
                    {outlineGenerationMessage}
                  </div>
                ) : null}

                <div
                  className={cn(
                    'grid min-h-0 flex-1 gap-4 overflow-y-auto overscroll-contain lg:overflow-hidden',
                    hidePlanningInputPanel || showPlanningInputOnly || !showPlanningOutputPanel
                      ? 'lg:grid-cols-1'
                      : 'lg:grid-cols-[0.42fr_0.58fr]',
                  )}
                >
                  {!hidePlanningInputPanel ? (
                    <section className="min-h-[300px] lg:min-h-0">
                      <PipelineTextPanel
                        value={planningInputPreview}
                        active={outlineIsLoading && planningPhase === 'course-spine'}
                      />
                    </section>
                  ) : null}

                  {showPlanningOutputPanel ? (
                    <section className="min-h-[360px] lg:min-h-0">
                      <PlanningStreamBox
                        page={selectedPlanningPage}
                        stepText={selectedPlanningStepText}
                        structured={selectedPlanningStructuredOutput}
                        loadingState={selectedPlanningStructuredLoadingState}
                        phase={planningPhase}
                        pages={planningListPages}
                        courseSpine={structuredPlanningCourseSpine}
                        selectedPage={selectedPlanningPage}
                        onPageSelect={setSelectedOutlineId}
                        onCopyPrompt={(page) =>
                          void copyPrompt(
                            page.drawingPrompt || '',
                            `第 ${page.pageNumber} 页图片 prompt`,
                          )
                        }
                        active={
                          hasSelectedPlanningStepText
                            ? selectedPlanningStepIsWriting
                            : selectedPlanningIsWriting
                        }
                        revision={planningRevealRevision}
                        action={
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-lg px-2.5 text-xs"
                            disabled={outlineIsLoading}
                            onClick={() => void generateOutlineForReview()}
                          >
                            {outlineIsLoading ? (
                              <Loader2 className="mr-1 size-3 animate-spin" />
                            ) : (
                              <RefreshCcw className="mr-1 size-3" />
                            )}
                            重新生成
                          </Button>
                        }
                      />
                    </section>
                  ) : null}
                </div>
              </div>
            ) : null}

            {activeStep === 'style' ? (
              <div className="grid h-full min-h-0 gap-5 overflow-y-auto pr-1 overscroll-contain lg:grid-cols-[0.82fr_1.18fr] lg:overflow-hidden lg:pr-0">
                <section className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      单页质检
                    </p>
                    <h2 className="mt-1 text-xl font-semibold">先跑一页真实质量检查</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      左侧选择风格和质检页，右侧跑正式 image-ppt 链路的一页质量检查。
                    </p>
                  </div>

                  <FieldShell label="质检页">
                    <div className="grid gap-2">
                      {outlineRows.map((row, index) => (
                        <button
                          key={row.id}
                          type="button"
                          className={cn(
                            'rounded-xl border p-3 text-left transition-colors',
                            selectedOutline?.id === row.id
                              ? 'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950'
                              : 'border-slate-900/[0.06] bg-white/80 hover:border-slate-400/30 dark:border-white/[0.08] dark:bg-black/20',
                          )}
                          onClick={() => setSelectedOutlineId(row.id)}
                        >
                          <span className="block text-[11px] opacity-60">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <span className="mt-1 block truncate text-sm font-semibold">
                            {row.title}
                          </span>
                        </button>
                      ))}
                    </div>
                  </FieldShell>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                    <FieldShell label="绘画风格">
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-5">
                        {STYLE_OPTIONS.map((style) => (
                          <button
                            key={style.id}
                            type="button"
                            className={cn(
                              'rounded-lg border px-2.5 py-2 text-center text-xs font-semibold transition-colors',
                              selectedStyleId === style.id
                                ? 'border-blue-500/35 bg-blue-500/10'
                                : 'border-slate-900/[0.06] bg-white/80 hover:border-blue-400/25 dark:border-white/[0.08] dark:bg-black/20',
                            )}
                            onClick={() => selectDrawingStyle(style)}
                          >
                            {style.label}
                          </button>
                        ))}
                      </div>
                      <Textarea
                        ref={stylePromptTextareaRef}
                        value={customStylePrompt}
                        onChange={(event) => {
                          setCustomStylePrompt(event.target.value);
                          setConfirmedImageNotebookPlan(null);
                        }}
                        placeholder="补充具体画风，例如：黑板粉笔、Notability 手写、水彩、极简线稿、漫画分镜..."
                        className="mt-3 min-h-[76px] resize-none rounded-lg bg-white/80 text-xs dark:bg-black/20"
                        disabled={busy}
                      />
                    </FieldShell>

                    <FieldShell label="色彩方向">
                      <div className="grid gap-2">
                        {PALETTES.map((palette) => (
                          <button
                            key={palette.id}
                            type="button"
                            className={cn(
                              'flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors',
                              selectedPaletteId === palette.id
                                ? 'border-teal-500/35 bg-teal-500/10'
                                : 'border-slate-900/[0.06] bg-white/80 hover:border-teal-400/25 dark:border-white/[0.08] dark:bg-black/20',
                            )}
                            onClick={() => setSelectedPaletteId(palette.id)}
                          >
                            <span className="text-sm font-semibold">{palette.label}</span>
                            <span className="flex gap-1.5">
                              {palette.colors.map((color) => (
                                <span
                                  key={color}
                                  className="size-5 rounded-full border border-black/10"
                                  style={{ backgroundColor: color }}
                                />
                              ))}
                            </span>
                          </button>
                        ))}
                      </div>
                    </FieldShell>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-900/[0.06] bg-white/80 px-3 py-3 dark:border-white/[0.08] dark:bg-black/20">
                      <div>
                        <Label className="text-xs font-semibold">整页图片生成</Label>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">image-ppt 已启用</p>
                      </div>
                      <span className="flex size-7 items-center justify-center rounded-full bg-teal-500/10 text-teal-700 dark:text-teal-200">
                        <CheckCircle2 className="size-4" />
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-900/[0.06] bg-white/80 px-3 py-3 dark:border-white/[0.08] dark:bg-black/20">
                      <div>
                        <Label className="text-xs font-semibold">测验页</Label>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">生成练习和复习题</p>
                      </div>
                      <Switch
                        checked={includeQuizScenes}
                        onCheckedChange={setIncludeQuizScenes}
                        aria-label="测验页"
                      />
                    </div>
                  </div>

                  <FieldShell label="例题数量">
                    <Select
                      value={workedExampleLevel}
                      onValueChange={(value) =>
                        setWorkedExampleLevel(value as OrchestratorWorkedExampleLevel)
                      }
                    >
                      <SelectTrigger className="h-10 rounded-lg bg-white/80 dark:bg-black/20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">无</SelectItem>
                        <SelectItem value="light">少量</SelectItem>
                        <SelectItem value="moderate">中等</SelectItem>
                        <SelectItem value="heavy">丰富</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldShell>

                  <PromptPreviewPanel
                    title="整本生成控制输入"
                    description="点「确认全量生成」时，队列会把这段文字作为整本笔记本的生成要求传入后端。"
                    value={confirmedGenerationPromptPreview}
                    minHeight="min-h-[260px]"
                    onCopy={() =>
                      void copyPrompt(confirmedGenerationPromptPreview, '整本生成控制输入')
                    }
                  />

                  <PromptPreviewPanel
                    title="当前页图片 prompt"
                    description="用于当前选中页的 image-ppt 单页质检；通过后这里会显示已记录的图片 prompt。"
                    value={visiblePilotImagePrompt}
                    minHeight="min-h-[220px]"
                    onCopy={() => void copyPrompt(visiblePilotImagePrompt, '当前页图片 prompt')}
                  />
                </section>

                <section className="flex min-h-0 flex-col rounded-xl border border-slate-900/[0.07] bg-white/88 shadow-sm shadow-slate-950/[0.03] dark:border-white/[0.08] dark:bg-black/20">
                  <div className="flex items-start justify-between gap-3 border-b border-slate-900/[0.06] px-4 py-3 dark:border-white/[0.08]">
                    <div>
                      <p className="text-sm font-semibold">单页质量检查</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Teacher Planner → 整页生图 → Vision QA → 讲解动作，只真实生成当前这一页。
                      </p>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium',
                        styleSampleStatus === 'loading'
                          ? 'bg-blue-500/10 text-blue-700 dark:text-blue-200'
                          : styleSampleQualityPassed
                            ? 'bg-teal-500/10 text-teal-700 dark:text-teal-200'
                            : styleSampleIsCurrent
                              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-200'
                              : styleSampleStatus === 'error'
                                ? 'bg-destructive/10 text-destructive'
                                : 'bg-slate-100 text-slate-600 dark:bg-white/[0.08] dark:text-slate-300',
                      )}
                    >
                      {styleSampleStatus === 'loading'
                        ? '生成中'
                        : styleSampleQualityPassed
                          ? '已通过'
                          : styleSampleIsCurrent
                            ? '需复查'
                            : styleSampleIsStale
                              ? '需重画'
                              : styleSampleStatus === 'error'
                                ? '生成失败'
                                : '等待生成'}
                    </span>
                  </div>

                  <div className="flex min-h-0 flex-1 items-center justify-center p-4">
                    {styleSampleStatus === 'loading' ? (
                      <div className="flex min-h-[320px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-blue-500/25 bg-blue-500/5 text-center">
                        <Loader2 className="size-7 animate-spin text-blue-600" />
                        <p className="mt-3 text-sm font-semibold">正在生成单页质检</p>
                        <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                          这一步最多只做 1 次真实图片调用，并同步检查 QA、遮罩和讲解稿。
                        </p>
                      </div>
                    ) : styleSample?.imageUrl ? (
                      <div className="w-full">
                        <div
                          className={cn(
                            'relative overflow-hidden rounded-xl border border-slate-900/[0.08] bg-slate-950 shadow-sm dark:border-white/[0.08]',
                            styleSampleIsStale && 'opacity-60',
                          )}
                        >
                          <img
                            src={styleSample.imageUrl}
                            alt="image-ppt 单页质量检查"
                            className="aspect-video h-full w-full object-contain"
                          />
                          {styleSampleIsStale ? (
                            <div className="absolute inset-x-0 bottom-0 bg-slate-950/80 px-4 py-2 text-xs font-medium text-white">
                              当前页面规划、风格或质检页已变化，请重跑质检后再确认全量生成。
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          {styleSample.qa ? (
                            <span
                              className={cn(
                                'rounded-full px-2 py-0.5 font-medium',
                                styleSample.qa.passed
                                  ? 'bg-teal-500/10 text-teal-700 dark:text-teal-200'
                                  : 'bg-destructive/10 text-destructive',
                              )}
                            >
                              QA {styleSample.qa.passed ? '通过' : '未通过'}
                            </span>
                          ) : null}
                          {styleSample.speechCount !== undefined ? (
                            <span>speech {styleSample.speechCount}</span>
                          ) : null}
                          {styleSample.focusCount !== undefined ? (
                            <span>focus {styleSample.focusCount}</span>
                          ) : null}
                          {styleSample.briefPageCount ? (
                            <span>brief {styleSample.briefPageCount} 页</span>
                          ) : null}
                          {styleSample.width && styleSample.height ? (
                            <span>
                              {styleSample.width} × {styleSample.height}
                            </span>
                          ) : null}
                          {styleSample.modelId ? <span>{styleSample.modelId}</span> : null}
                          <span>{new Date(styleSample.generatedAt).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    ) : styleSampleStatus === 'error' ? (
                      <div className="flex min-h-[320px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-destructive/25 bg-destructive/5 p-6 text-center">
                        <BotOff className="size-7 text-destructive" />
                        <p className="mt-3 text-sm font-semibold">单页质检没有通过</p>
                        <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                          {styleSampleError ||
                            '检查 image provider、vision 模型和 API key 后可以重试。'}
                        </p>
                      </div>
                    ) : (
                      <div className="flex min-h-[320px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-900/[0.08] bg-slate-50/70 text-center dark:border-white/[0.08] dark:bg-white/[0.04]">
                        <ImageIcon className="size-7 text-muted-foreground" />
                        <p className="mt-3 text-sm font-semibold">准备生成单页质检</p>
                        <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                          这一步不会用前端占位图，会跑正式生成链路，但只真实生成一页。
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 border-t border-slate-900/[0.06] px-4 py-3 dark:border-white/[0.08]">
                    <Button
                      type="button"
                      variant={styleSample?.imageUrl ? 'outline' : 'default'}
                      className="h-9 rounded-lg"
                      disabled={styleSampleStatus === 'loading' || !selectedOutline}
                      onClick={() => void generateStyleSample()}
                    >
                      {styleSampleStatus === 'loading' ? (
                        <Loader2 className="mr-1.5 size-4 animate-spin" />
                      ) : (
                        <RefreshCcw className="mr-1.5 size-4" />
                      )}
                      {styleSample?.imageUrl ? '重跑质检' : '生成质量检查'}
                    </Button>
                    <Button
                      type="button"
                      className="h-9 rounded-lg"
                      disabled={!styleSampleQualityPassed || busy}
                      onClick={() => void handleGenerate()}
                    >
                      {busy ? (
                        <Loader2 className="mr-1.5 size-4 animate-spin" />
                      ) : (
                        <Sparkles className="mr-1.5 size-4" />
                      )}
                      确认全量生成
                    </Button>
                  </div>
                </section>
              </div>
            ) : null}

            {activeStep === 'result' ? (
              <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pr-1 overscroll-contain">
                <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      生成与结果
                    </p>
                    <h2 className="mt-1 text-xl font-semibold">逐页并行生成图片</h2>
                    <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
                      一次最多 5 页同时生成，按页序保存；每个格子对应一张 16:9 幻灯片。
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant={imageGenerationMockEnabled ? 'default' : 'outline'}
                          size="sm"
                          className="h-9 rounded-lg"
                        >
                          <PlayCircle className="mr-1.5 size-4" />
                          {imageGenerationMockEnabled
                            ? `${imageGenerationMockPageCount} 页 mock`
                            : '生图 mock'}
                          <ChevronDown className="ml-1.5 size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuLabel>生图 mock 档位</DropdownMenuLabel>
                        {[5, 10, 20].map((pageCount) => (
                          <DropdownMenuItem
                            key={pageCount}
                            onSelect={() =>
                              setImageGenerationMockPageCount(
                                pageCount as ImageGenerationMockPageCount,
                              )
                            }
                          >
                            <span className="flex min-w-0 flex-1 items-center">
                              {pageCount} 页 mock
                            </span>
                            {imageGenerationMockPageCount === pageCount ? (
                              <CheckCircle2 className="size-4 text-blue-600" />
                            ) : null}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => setImageGenerationMockPageCount(null)}>
                          关闭 mock
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button type="button" variant="outline" size="sm" className="h-9 rounded-lg">
                      <RefreshCcw className="mr-1.5 size-4" />
                      重画选中页
                    </Button>
                    <Button type="button" size="sm" className="h-9 rounded-lg" asChild>
                      <Link href={classroomHref}>
                        <PlayCircle className="mr-1.5 size-4" />
                        进入课堂
                      </Link>
                    </Button>
                  </div>
                </div>

                <section className="min-h-0 flex-1 rounded-xl border border-slate-900/[0.06] bg-white/82 p-4 shadow-sm shadow-slate-950/[0.03] dark:border-white/[0.08] dark:bg-black/20">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">幻灯片生图网格</p>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:bg-white/[0.08] dark:text-slate-300">
                      共 {imageGenerationGridRows.length} 页
                    </span>
                  </div>

                  {imageGenerationGridRows.length > 0 ? (
                    <div className={imageGenerationGridClassName()}>
                      {imageGenerationGridRows.map((row, index) => {
                        const thumbnailUrl = getGeneratedPageThumbnailUrl(
                          activeGenerationTask,
                          index,
                        );
                        const hasGeneratedThumbnail = Boolean(thumbnailUrl);
                        const status = getImageGenerationTileStatus({
                          index,
                          total: imageGenerationGridRows.length,
                          mockEnabled: imageGenerationMockEnabled,
                          busy,
                          task: activeGenerationTask,
                          hasGeneratedThumbnail,
                        });
                        const statusLabel = IMAGE_GENERATION_STATUS_LABELS[status];
                        return (
                          <article
                            key={row.id}
                            role={hasGeneratedThumbnail ? 'button' : undefined}
                            tabIndex={hasGeneratedThumbnail ? 0 : undefined}
                            aria-label={
                              hasGeneratedThumbnail
                                ? `放大查看第 ${index + 1} 页：${row.title}`
                                : undefined
                            }
                            onClick={
                              hasGeneratedThumbnail
                                ? () =>
                                    setPreviewSlide({
                                      imageUrl: thumbnailUrl,
                                      pageNumber: index + 1,
                                      title: row.title,
                                    })
                                : undefined
                            }
                            onKeyDown={
                              hasGeneratedThumbnail
                                ? (event) => {
                                    if (event.key !== 'Enter' && event.key !== ' ') return;
                                    event.preventDefault();
                                    setPreviewSlide({
                                      imageUrl: thumbnailUrl,
                                      pageNumber: index + 1,
                                      title: row.title,
                                    });
                                  }
                                : undefined
                            }
                            className={cn(
                              'group relative aspect-video overflow-hidden rounded-xl border border-slate-900/[0.06] shadow-sm shadow-slate-950/[0.03] outline-none transition dark:border-white/[0.08]',
                              imageGenerationTilePaddingClassName(),
                              status === 'done' && 'text-white',
                              hasGeneratedThumbnail &&
                                'cursor-zoom-in bg-white hover:-translate-y-0.5 hover:ring-2 hover:ring-blue-400/60 focus-visible:ring-2 focus-visible:ring-blue-500',
                              status === 'generating' && 'bg-blue-50 text-blue-950',
                              status === 'waiting' && 'bg-slate-50 text-slate-500',
                            )}
                            style={
                              status === 'done' && !hasGeneratedThumbnail
                                ? {
                                    background: `linear-gradient(135deg, ${selectedPalette.colors[0]} 0%, #111827 62%, ${selectedPalette.colors[1]} 100%)`,
                                  }
                                : undefined
                            }
                          >
                            {hasGeneratedThumbnail ? (
                              <>
                                <img
                                  src={thumbnailUrl}
                                  alt={`第 ${index + 1} 页生成缩略图`}
                                  className="absolute inset-0 size-full object-cover"
                                />
                                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.18)_0%,rgba(15,23,42,0)_42%,rgba(15,23,42,0.1)_100%)]" />
                                <span className="absolute bottom-2 right-2 z-20 inline-flex size-6 items-center justify-center rounded-full bg-slate-950/55 text-white opacity-0 shadow-sm backdrop-blur transition group-hover:opacity-100">
                                  <Maximize2 className="size-3.5" />
                                </span>
                              </>
                            ) : null}
                            <ImageGenerationCardProcessPreview index={index} status={status} />
                            <div className="relative z-10 flex h-full flex-col justify-between">
                              <div className="flex items-center justify-between gap-2 text-[10px] font-medium">
                                <span
                                  className={cn(
                                    'rounded-full px-2 py-0.5',
                                    status === 'done' &&
                                      (hasGeneratedThumbnail
                                        ? 'bg-slate-950/55 text-white shadow-sm backdrop-blur'
                                        : 'bg-white/18 text-white'),
                                    status === 'generating' && 'bg-blue-600 text-white',
                                    status === 'waiting' && 'bg-white text-slate-500',
                                  )}
                                >
                                  第 {String(index + 1).padStart(2, '0')} 页
                                </span>
                                <span
                                  className={cn(
                                    'inline-flex items-center rounded-full px-2 py-0.5',
                                    status === 'done' &&
                                      (hasGeneratedThumbnail
                                        ? 'bg-teal-500/85 text-white shadow-sm backdrop-blur'
                                        : 'bg-teal-400/20 text-white'),
                                    status === 'generating' && 'bg-white text-blue-700',
                                    status === 'waiting' && 'bg-white text-slate-500',
                                  )}
                                >
                                  {status === 'done' ? (
                                    <CheckCircle2 className="mr-1 size-3" />
                                  ) : status === 'generating' ? (
                                    <Loader2 className="mr-1 size-3 animate-spin" />
                                  ) : (
                                    <ImageIcon className="mr-1 size-3" />
                                  )}
                                  {statusLabel}
                                </span>
                              </div>
                              {status === 'generating' || hasGeneratedThumbnail ? null : (
                                <div>
                                  <h3
                                    className={cn(
                                      'line-clamp-2 font-semibold',
                                      imageGenerationTitleClassName(),
                                      status === 'waiting' && 'text-slate-500',
                                    )}
                                  >
                                    {row.title}
                                  </h3>
                                  <p
                                    className={cn(
                                      'mt-1 line-clamp-2',
                                      imageGenerationFocusClassName(),
                                      status === 'done' && 'text-white/75',
                                      status === 'waiting' && 'text-slate-400',
                                    )}
                                  >
                                    {row.focus}
                                  </p>
                                </div>
                              )}
                            </div>
                            {status === 'generating' ? (
                              <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent_0%,rgba(59,130,246,0.13)_45%,transparent_70%)]" />
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-900/[0.08] bg-slate-50/70 p-6 text-center dark:border-white/[0.08] dark:bg-white/[0.04]">
                      <ImageIcon className="size-7 text-muted-foreground" />
                      <p className="mt-3 text-sm font-semibold">还没有可生成的页面</p>
                      <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                        完成规划后这里会按页数显示生图网格；也可以点击「生图 mock」预览状态。
                      </p>
                    </div>
                  )}
                </section>
              </div>
            ) : null}
          </div>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3"
              >
                <p className="text-sm text-destructive">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="relative z-[20] flex w-full shrink-0 items-center justify-between gap-3 rounded-[22px] border border-white/75 bg-white/[0.82] px-4 py-3 shadow-[0_18px_50px_rgba(15,23,42,0.09)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-slate-950/85">
            <Button
              type="button"
              variant="ghost"
              className="h-9 rounded-xl"
              disabled={activeStep === 'input' || busy}
              onClick={goBack}
            >
              <ArrowLeft className="mr-1.5 size-4" />
              上一步
            </Button>
            <div className="hidden min-w-0 flex-1 text-center text-xs text-muted-foreground sm:block">
              第 {activeStepIndex + 1} 步 / {WORKSPACE_PROGRESS_STEPS.length} · {activeStepLabel}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {activeStep === 'materials' ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-xl px-4"
                  disabled={outlineIsLoading}
                  onClick={() => startParallelPlanningMockStreams('course-spine')}
                >
                  <PlayCircle className="mr-1.5 size-4" />
                  当前流水线 mock
                </Button>
              ) : null}
              {activeStep !== 'result' ? (
                <Button
                  type="button"
                  className="h-11 rounded-2xl bg-gradient-to-r from-violet-500 to-blue-500 px-5 text-white shadow-sm shadow-violet-500/20 hover:from-violet-600 hover:to-blue-600"
                  disabled={
                    (activeStep === 'input' && !hasInput) ||
                    busy ||
                    outlineNextDisabled ||
                    (activeStep === 'style' && !styleSampleQualityPassed)
                  }
                  onClick={goNext}
                >
                  {activeStep === 'style' ? (
                    busy || styleSampleStatus === 'loading' ? (
                      <Loader2 className="mr-1.5 size-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-1.5 size-4" />
                    )
                  ) : notebookKind === 'markdown' && activeStep === 'input' ? (
                    busy ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <FileText className="mr-2 size-4" />
                    )
                  ) : ((activeStep === 'input' || activeStep === 'materials') &&
                      outlineIsLoading) ||
                    (activeStep === 'outline' && outlineIsLoading) ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 size-4" />
                  )}
                  {activeStep === 'style'
                    ? styleSampleQualityPassed
                      ? '确认全量生成'
                      : styleSampleStatus === 'loading'
                        ? '质检生成中'
                        : '先跑质量检查'
                    : notebookKind === 'markdown' && activeStep === 'input'
                      ? busy
                        ? '正在创建'
                        : '创建文字笔记本'
                      : activeStep === 'input' || activeStep === 'materials'
                        ? '生成规划+prompt'
                        : activeStep === 'outline'
                          ? outlineIsLoading
                            ? '规划+prompt 生成中'
                            : outlineNeedsInitialGeneration
                              ? '开始生成规划+prompt'
                              : '并行生成图片'
                          : '下一步'}
                  <ArrowRight className="ml-2 size-4" />
                </Button>
              ) : completedNotebookHref ? (
                <Button
                  type="button"
                  className="h-11 rounded-2xl bg-gradient-to-r from-violet-500 to-blue-500 px-6 text-white shadow-sm shadow-violet-500/20 hover:from-violet-600 hover:to-blue-600"
                  asChild
                >
                  <Link href={completedNotebookHref}>
                    <PlayCircle className="mr-2 size-4" />
                    进入课堂
                    <ArrowRight className="ml-2 size-4" />
                  </Link>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-lg px-4"
                  onClick={() => {
                    resetSourceInput();
                    resetStyleState();
                    setOutlineRows([]);
                    setSelectedOutlineId('');
                    setOutlineGenerationStatus('idle');
                    setOutlineGenerationMessage('输入后会直接生成一版规划与画图 prompt。');
                    setPlanningCourseSpine(null);
                    setPlanningPages([]);
                    setConfirmedImageNotebookPlan(null);
                    setPlanningLiveDraft(null);
                    setPlanningStreamEvents([]);
                    setPlanningQuality(null);
                    setPlanningRealPhaseStates({});
                    setPlanningMockStreams({});
                    setPlanningMockPhaseStates({});
                    setPlanningMockStreamingPhases([]);
                    setCurrentPlanningPageNumbers([]);
                    setActiveStep('input');
                  }}
                >
                  再创建一本
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
