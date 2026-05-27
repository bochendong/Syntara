'use client';

import {
  AlertCircle,
  ArrowRightLeft,
  BookOpen,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  ExternalLink,
  FileUp,
  Gauge,
  Globe2,
  ImagePlus,
  Loader2,
  Save,
  Search,
  Sparkles,
  SlidersHorizontal,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { toast } from '@/lib/notifications/client-toast';
import { cn } from '@/lib/utils';
import { getLocalizedProblemContent, getLocalizedProblemTitle } from '@/lib/problem-bank';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AnswerComposer, AnswerComposerToolbar } from '@/components/problem-bank/answer-composer';
import { ProblemDraftForm } from '@/components/problem-bank/problem-draft-form';
import { ProblemLanguageToggle } from '@/components/problem-bank/problem-language-toggle';
import {
  ProblemImageAssets,
  ProblemRichText,
  ProblemTitleText,
} from '@/components/problem-bank/problem-rich-text';
import { problemDraftToPatch } from '@/lib/problem-bank/editor';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  AnswerFeedbackSummaryBadge,
  AnswerPreviewPanel,
  AttemptHistoryPanel,
  ChoiceAnswerPreviewPanel,
  FilterRuleRow,
  FormulaReferencePanel,
  PROBLEM_BANK_EMERALD_ACTION_BUTTON_CLASS,
  PROBLEM_BANK_EMERALD_OUTLINE_BUTTON_CLASS,
  PROBLEM_BANK_LIST_GRID_CLASS,
  PROBLEM_BANK_PRIMARY_BUTTON_CLASS,
  PhotoAnswerUploader,
  ProblemDraftPreviewPanel,
  ProblemMetaChip,
  answerComposerPlaceholder,
  difficultyDotClassName,
  difficultyDots,
  difficultyLabel,
  difficultyTextClassName,
  formatProblemNumber,
  latestScoreLabel,
  practiceStateClassName,
  practiceStateLabel,
  problemMetaChips,
  problemTypeVisual,
  renderProblemContentStem,
  supportsPhotoAnswer,
  typeLabel,
  weakTopicBarClass,
  type PracticeFilter,
} from '@/components/problem-bank/course-problem-bank-helpers';
import { useCourseProblemBankController } from '@/components/problem-bank/use-course-problem-bank-controller';
import { CourseProblemImportDialog } from '@/components/problem-bank/course-problem-import-dialog';
export function CourseProblemBankView({
  courseId,
  initialNotebookId,
  initialProblemId,
  mode = 'bank',
}: {
  courseId: string;
  initialNotebookId?: string;
  initialProblemId?: string;
  mode?: 'bank' | 'practice';
}) {
  const view = useCourseProblemBankController({
    courseId,
    initialNotebookId,
    initialProblemId,
    mode,
  });
  const {
    activeBankFilterCount,
    answerPanelTab,
    bankStats,
    blankAnswers,
    choiceAnswers,
    codeAnswers,
    courseHasTranslations,
    courseName,
    currentNotebookProblemPosition,
    currentProblemPage,
    deletingProblem,
    difficultyFilter,
    difficultyFilterOptions,
    filteredProblems,
    handleAddPhotoAnswerFiles,
    handleDeleteProblem,
    handleEditingDraftChange,
    handleProblemInfoTabChange,
    handleRemovePhotoAnswer,
    handleSaveAssignment,
    handleSubmitInlineAnswer,
    handleUpdateProblem,
    insertFormulaIntoAnswer,
    isPracticeMode,
    loading,
    locale,
    moveDialogOpen,
    moveNotebookId,
    navigateToPracticeProblem,
    nextPracticeIsChapterJump,
    nextPracticeTarget,
    notebookFilter,
    notebookFilterOptions,
    notebooks,
    pageEndIndex,
    pageStartIndex,
    paginatedProblems,
    photoAnswers,
    practiceFilter,
    practiceFilterOptions,
    previousPracticeIsChapterJump,
    previousPracticeTarget,
    problemInfoTab,
    problemLanguage,
    problemPageCount,
    problems,
    router,
    sameNotebookProblems,
    savingAssignment,
    searchQuery,
    selectedAnswerMode,
    selectedAnswerController,
    selectedAnswerFeedback,
    selectedProblem,
    selectedProblemAttempts,
    selectedProblemAttemptsLoading,
    selectedProblemContent,
    selectedProblemEditDraft,
    selectedProblemHasTranslation,
    selectedProblemId,
    selectedProblemNotebookLabel,
    selectedProblemPoints,
    selectedProblemSolutionSections,
    selectedProblemTitle,
    selectedTextAnswerValue,
    setAnswerFeedbackByProblemId,
    setAnswerModes,
    setAnswerPanelTab,
    setBlankAnswers,
    setChoiceAnswers,
    setCodeAnswers,
    setDifficultyFilter,
    setImportMode,
    setImportOpen,
    setMoveDialogOpen,
    setMoveNotebookId,
    setNotebookFilter,
    setPracticeFilter,
    setProblemLanguage,
    setProblemPage,
    setSearchQuery,
    setSelectedTextAnswer,
    setStatusFilter,
    setTypeFilter,
    showSidebarAnswerTools,
    statusFilter,
    statusFilterOptions,
    submittingAnswer,
    textAnswers,
    typeFilter,
    typeFilterOptions,
    visibleProblemPreviewDraft,
  } = view;

  return (
    <div
      className={cn(
        'flex h-full min-h-0 w-full',
        isPracticeMode ? 'gap-2 bg-[#f5f5f5] p-2 dark:bg-slate-950' : 'gap-2 p-2 sm:gap-3 sm:p-3',
      )}
    >
      {!isPracticeMode ? (
        <>
          <div className="order-1 flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/92 shadow-[0_16px_40px_rgba(15,23,42,0.05)] dark:border-slate-800 dark:bg-slate-950/55">
            <div className="border-b border-slate-200 px-3 py-3 dark:border-slate-800 sm:px-4 sm:py-2">
              <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center md:gap-3">
                <span className="min-w-0 truncate text-sm font-semibold text-sky-600 dark:text-sky-300">
                  {courseName || (locale === 'zh-CN' ? '课程空间' : 'Course workspace')}
                </span>

                <label className="relative w-full md:ml-auto md:w-[320px] md:max-w-[45%] md:shrink-0">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={
                      locale === 'zh-CN'
                        ? '搜索题号、题目、知识点、来源'
                        : 'Search numbers, problems, topics, sources'
                    }
                    className="h-9 pl-9"
                  />
                </label>

                <div className="flex w-full shrink-0 items-center justify-between gap-2 md:w-auto md:justify-start">
                  {courseHasTranslations ? (
                    <ProblemLanguageToggle
                      value={problemLanguage}
                      locale={locale}
                      onChange={setProblemLanguage}
                    />
                  ) : null}
                  <span className="text-xs font-medium text-slate-400">
                    {filteredProblems.length}/{problems.length}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 gap-2 border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <SlidersHorizontal className="h-4 w-4 text-sky-600 dark:text-sky-300" />
                        {locale === 'zh-CN' ? '筛选' : 'Filters'}
                        {activeBankFilterCount > 0 ? (
                          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-sky-600 px-1.5 text-[11px] font-bold text-white dark:bg-sky-400 dark:text-slate-950">
                            {activeBankFilterCount}
                          </span>
                        ) : null}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      sideOffset={8}
                      className="w-[620px] max-w-[calc(100vw-1.5rem)] p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                            {locale === 'zh-CN' ? '筛选题目' : 'Filter problems'}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            {filteredProblems.length}/{problems.length}
                          </p>
                        </div>
                        {activeBankFilterCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setPracticeFilter('all');
                              setTypeFilter('all');
                              setDifficultyFilter('all');
                              setNotebookFilter('all');
                              setStatusFilter('all');
                            }}
                            className="rounded-full px-2 py-1 text-[11px] font-semibold text-sky-700 transition hover:bg-sky-50 dark:text-sky-200 dark:hover:bg-sky-500/10"
                          >
                            {locale === 'zh-CN' ? '清空' : 'Clear'}
                          </button>
                        ) : null}
                      </div>

                      <div className="mt-3 space-y-2">
                        <FilterRuleRow
                          icon={CheckSquare}
                          label={locale === 'zh-CN' ? '练习状态' : 'Status'}
                          value={practiceFilter}
                          options={practiceFilterOptions}
                          locale={locale}
                          onChange={(value) => setPracticeFilter(value as PracticeFilter)}
                          onClear={() => setPracticeFilter('all')}
                        />
                        <FilterRuleRow
                          icon={Gauge}
                          label={locale === 'zh-CN' ? '难度' : 'Difficulty'}
                          value={difficultyFilter}
                          options={difficultyFilterOptions}
                          locale={locale}
                          onChange={(value) =>
                            setDifficultyFilter(value as typeof difficultyFilter)
                          }
                          onClear={() => setDifficultyFilter('all')}
                        />
                        <FilterRuleRow
                          icon={BookOpen}
                          label={locale === 'zh-CN' ? '笔记本' : 'Notebook'}
                          value={notebookFilter}
                          options={notebookFilterOptions}
                          locale={locale}
                          onChange={setNotebookFilter}
                          onClear={() => setNotebookFilter('all')}
                        />
                        <FilterRuleRow
                          icon={Type}
                          label={locale === 'zh-CN' ? '题型' : 'Type'}
                          value={typeFilter}
                          options={typeFilterOptions}
                          locale={locale}
                          onChange={(value) => setTypeFilter(value as typeof typeFilter)}
                          onClear={() => setTypeFilter('all')}
                        />
                        <FilterRuleRow
                          icon={Globe2}
                          label={locale === 'zh-CN' ? '发布状态' : 'Publish state'}
                          value={statusFilter}
                          options={statusFilterOptions}
                          locale={locale}
                          onChange={(value) => setStatusFilter(value as typeof statusFilter)}
                          onClear={() => setStatusFilter('all')}
                        />
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 xl:hidden">
                <button
                  type="button"
                  onClick={() => {
                    setImportMode('pdf');
                    setImportOpen(true);
                  }}
                  className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-center text-xs font-semibold text-slate-700 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200 dark:hover:border-sky-500/30 dark:hover:bg-sky-500/10"
                >
                  <FileUp className="mx-auto mb-1 h-4 w-4 text-sky-600 dark:text-sky-300" />
                  {locale === 'zh-CN' ? '导入题目' : 'Import'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImportMode('web');
                    setImportOpen(true);
                  }}
                  className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-center text-xs font-semibold text-slate-700 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200 dark:hover:border-sky-500/30 dark:hover:bg-sky-500/10"
                >
                  <Sparkles className="mx-auto mb-1 h-4 w-4 text-sky-600 dark:text-sky-300" />
                  {locale === 'zh-CN' ? '智能生成' : 'Generate'}
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              {loading ? (
                <div className="flex items-center justify-center py-16 text-sm text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {locale === 'zh-CN' ? '正在加载课程题库...' : 'Loading course problem bank...'}
                </div>
              ) : filteredProblems.length === 0 ? (
                <div className="m-4 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
                  {locale === 'zh-CN' ? '当前筛选下没有题目。' : 'No problems match this filter.'}
                </div>
              ) : (
                <>
                  <div className="space-y-2 p-3 lg:hidden">
                    {paginatedProblems.map((problem) => {
                      const selected = selectedProblemId === problem.id;
                      const typeVisual = problemTypeVisual(problem.type);
                      const ProblemTypeIcon = typeVisual.Icon;
                      const localizedContent = getLocalizedProblemContent(
                        problem.publicContent,
                        problemLanguage,
                      );
                      const localizedTitle = getLocalizedProblemTitle(problem, problemLanguage);
                      return (
                        <div
                          key={problem.id}
                          role="button"
                          tabIndex={0}
                          onClick={() =>
                            router.push(
                              `/course/${encodeURIComponent(courseId)}/problem-bank/${encodeURIComponent(problem.id)}`,
                            )
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              router.push(
                                `/course/${encodeURIComponent(courseId)}/problem-bank/${encodeURIComponent(problem.id)}`,
                              );
                            }
                          }}
                          className={cn(
                            'rounded-xl border p-3 text-sm shadow-sm transition',
                            selected
                              ? 'border-sky-200 bg-sky-50/90 dark:border-sky-500/30 dark:bg-sky-500/10'
                              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:bg-slate-900/60',
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                  {formatProblemNumber(problem)}
                                </span>
                                <span
                                  className={cn(
                                    'inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold',
                                    practiceStateClassName(problem),
                                  )}
                                >
                                  {practiceStateLabel(problem, locale)}
                                </span>
                                <span
                                  className={cn(
                                    'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold',
                                    typeVisual.className,
                                  )}
                                >
                                  <ProblemTypeIcon className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate">
                                    {typeLabel(problem.type, locale)}
                                  </span>
                                </span>
                              </div>
                              <ProblemTitleText
                                content={localizedTitle}
                                className="mt-2 line-clamp-2 font-semibold leading-5 text-slate-950 dark:text-white"
                              />
                              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                                <ProblemTitleText
                                  content={renderProblemContentStem(localizedContent)}
                                  className="font-normal"
                                  forceInlineMath
                                />
                              </p>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              className={cn(
                                'h-8 shrink-0 px-2.5 text-xs',
                                PROBLEM_BANK_PRIMARY_BUTTON_CLASS,
                              )}
                              onClick={(event) => {
                                event.stopPropagation();
                                router.push(
                                  `/course/${encodeURIComponent(courseId)}/problem-bank/${encodeURIComponent(problem.id)}`,
                                );
                              }}
                            >
                              {locale === 'zh-CN' ? '练习' : 'Practice'}
                            </Button>
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                            <div className="min-w-0">
                              <div className="text-[11px] font-medium text-slate-400">
                                {locale === 'zh-CN' ? '来源' : 'Source'}
                              </div>
                              <div className="truncate font-medium text-slate-700 dark:text-slate-200">
                                {problem.notebookName ||
                                  (locale === 'zh-CN' ? '未归类' : 'Unassigned')}
                              </div>
                            </div>
                            <div>
                              <div className="text-[11px] font-medium text-slate-400">
                                {locale === 'zh-CN' ? '难度 / 得分' : 'Level / Score'}
                              </div>
                              <div className="font-medium text-slate-700 dark:text-slate-200">
                                {difficultyLabel(problem.difficulty, locale)} ·{' '}
                                {latestScoreLabel(problem, locale)}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
                      <span>
                        {locale === 'zh-CN'
                          ? `显示 ${pageStartIndex + 1}-${pageEndIndex} / ${filteredProblems.length} 道`
                          : `Showing ${pageStartIndex + 1}-${pageEndIndex} of ${filteredProblems.length}`}
                      </span>
                      <div className="flex items-center justify-between gap-2 min-[420px]:justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 px-2 text-xs"
                          disabled={currentProblemPage <= 1}
                          onClick={() => setProblemPage((current) => Math.max(1, current - 1))}
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                          {locale === 'zh-CN' ? '上一页' : 'Prev'}
                        </Button>
                        <span className="min-w-[4rem] text-center font-medium text-slate-600 dark:text-slate-300">
                          {currentProblemPage} / {problemPageCount}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 px-2 text-xs"
                          disabled={currentProblemPage >= problemPageCount}
                          onClick={() =>
                            setProblemPage((current) => Math.min(problemPageCount, current + 1))
                          }
                        >
                          {locale === 'zh-CN' ? '下一页' : 'Next'}
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="hidden min-w-[820px] lg:block">
                    <div
                      className={cn(
                        PROBLEM_BANK_LIST_GRID_CLASS,
                        'border-b border-slate-200 bg-slate-50/80 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400',
                      )}
                    >
                      <span>{locale === 'zh-CN' ? '题号' : 'No.'}</span>
                      <span>{locale === 'zh-CN' ? '状态' : 'State'}</span>
                      <span>{locale === 'zh-CN' ? '题目' : 'Problem'}</span>
                      <span>{locale === 'zh-CN' ? '来源' : 'Source'}</span>
                      <span>{locale === 'zh-CN' ? '题型' : 'Type'}</span>
                      <span>{locale === 'zh-CN' ? '难度' : 'Level'}</span>
                      <span>{locale === 'zh-CN' ? '最近得分' : 'Score'}</span>
                      <span>{locale === 'zh-CN' ? '操作' : 'Action'}</span>
                    </div>
                    {paginatedProblems.map((problem) => {
                      const selected = selectedProblemId === problem.id;
                      const typeVisual = problemTypeVisual(problem.type);
                      const ProblemTypeIcon = typeVisual.Icon;
                      const localizedContent = getLocalizedProblemContent(
                        problem.publicContent,
                        problemLanguage,
                      );
                      const localizedTitle = getLocalizedProblemTitle(problem, problemLanguage);
                      return (
                        <div
                          key={problem.id}
                          role="button"
                          tabIndex={0}
                          onClick={() =>
                            router.push(
                              `/course/${encodeURIComponent(courseId)}/problem-bank/${encodeURIComponent(problem.id)}`,
                            )
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              router.push(
                                `/course/${encodeURIComponent(courseId)}/problem-bank/${encodeURIComponent(problem.id)}`,
                              );
                            }
                          }}
                          className={cn(
                            PROBLEM_BANK_LIST_GRID_CLASS,
                            'items-center border-b border-slate-100 px-4 py-3 text-sm transition dark:border-slate-800/80',
                            selected
                              ? 'bg-sky-50/80 dark:bg-sky-500/10'
                              : 'bg-white hover:bg-slate-50/80 dark:bg-slate-950/25 dark:hover:bg-slate-900/50',
                          )}
                        >
                          <div>
                            <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                              {formatProblemNumber(problem)}
                            </span>
                          </div>
                          <div>
                            <span
                              className={cn(
                                'inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold',
                                practiceStateClassName(problem),
                              )}
                            >
                              {practiceStateLabel(problem, locale)}
                            </span>
                          </div>
                          <div className="min-w-0 pr-4">
                            <ProblemTitleText
                              content={localizedTitle}
                              className="line-clamp-1 font-semibold text-slate-950 dark:text-white"
                            />
                            <p className="mt-1 min-w-0 truncate text-xs text-slate-500 dark:text-slate-400">
                              <ProblemTitleText
                                content={renderProblemContentStem(localizedContent)}
                                className="font-normal"
                                forceInlineMath
                              />
                            </p>
                          </div>
                          <div className="min-w-0 pr-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="line-clamp-2">
                              {problem.notebookName ||
                                (locale === 'zh-CN' ? '未归类' : 'Unassigned')}
                            </span>
                          </div>
                          <div className="min-w-0 pr-2">
                            <span
                              className={cn(
                                'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold',
                                typeVisual.className,
                              )}
                            >
                              <ProblemTypeIcon className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{typeLabel(problem.type, locale)}</span>
                            </span>
                          </div>
                          <div title={difficultyLabel(problem.difficulty, locale)}>
                            <div className="flex items-center gap-1">
                              {difficultyDots(problem).map((active, index) => (
                                <span
                                  key={index}
                                  className={cn(
                                    'size-1.5 rounded-full',
                                    difficultyDotClassName(problem.difficulty, active),
                                  )}
                                />
                              ))}
                            </div>
                            <div
                              className={cn(
                                'mt-0.5 text-[10px] font-semibold',
                                difficultyTextClassName(problem.difficulty),
                              )}
                            >
                              {difficultyLabel(problem.difficulty, locale)}
                            </div>
                          </div>
                          <div className="text-xs font-medium text-slate-700 dark:text-slate-200">
                            {latestScoreLabel(problem, locale)}
                          </div>
                          <div>
                            <Button
                              type="button"
                              size="sm"
                              className={cn(
                                'h-8 px-2.5 text-xs',
                                PROBLEM_BANK_PRIMARY_BUTTON_CLASS,
                              )}
                              onClick={(event) => {
                                event.stopPropagation();
                                router.push(
                                  `/course/${encodeURIComponent(courseId)}/problem-bank/${encodeURIComponent(problem.id)}`,
                                );
                              }}
                            >
                              {locale === 'zh-CN' ? '练习' : 'Practice'}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-400">
                      <span>
                        {locale === 'zh-CN'
                          ? `显示 ${pageStartIndex + 1}-${pageEndIndex} / ${filteredProblems.length} 道`
                          : `Showing ${pageStartIndex + 1}-${pageEndIndex} of ${filteredProblems.length}`}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 px-2 text-xs"
                          disabled={currentProblemPage <= 1}
                          onClick={() => setProblemPage((current) => Math.max(1, current - 1))}
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                          {locale === 'zh-CN' ? '上一页' : 'Prev'}
                        </Button>
                        <span className="min-w-[5rem] text-center font-medium text-slate-600 dark:text-slate-300">
                          {locale === 'zh-CN'
                            ? `${currentProblemPage} / ${problemPageCount} 页`
                            : `Page ${currentProblemPage} / ${problemPageCount}`}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 px-2 text-xs"
                          disabled={currentProblemPage >= problemPageCount}
                          onClick={() =>
                            setProblemPage((current) => Math.min(problemPageCount, current + 1))
                          }
                        >
                          {locale === 'zh-CN' ? '下一页' : 'Next'}
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <aside className="order-2 hidden h-full w-[270px] shrink-0 flex-col gap-3 overflow-hidden xl:flex">
            <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)] dark:border-slate-800 dark:bg-slate-950/60">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {locale === 'zh-CN' ? '掌握概览' : 'Mastery overview'}
                </p>
                <AlertCircle className="h-3.5 w-3.5 text-slate-400" />
              </div>
              <div className="mt-4 flex items-center gap-4">
                <div
                  className="grid size-[88px] shrink-0 place-items-center rounded-full"
                  style={{
                    background: `conic-gradient(#22c55e 0deg ${
                      (bankStats.mastered / Math.max(1, bankStats.total)) * 360
                    }deg, #f59e0b ${(bankStats.mastered / Math.max(1, bankStats.total)) * 360}deg ${
                      ((bankStats.mastered + bankStats.review) / Math.max(1, bankStats.total)) * 360
                    }deg, #ef4444 ${
                      ((bankStats.mastered + bankStats.review) / Math.max(1, bankStats.total)) * 360
                    }deg ${
                      ((bankStats.mastered + bankStats.review + bankStats.wrong) /
                        Math.max(1, bankStats.total)) *
                      360
                    }deg, #e2e8f0 ${
                      ((bankStats.mastered + bankStats.review + bankStats.wrong) /
                        Math.max(1, bankStats.total)) *
                      360
                    }deg 360deg)`,
                  }}
                >
                  <div className="grid size-[62px] place-items-center rounded-full bg-white text-center shadow-inner dark:bg-slate-950">
                    <span className="text-xl font-bold leading-none text-slate-950 dark:text-white">
                      {bankStats.masteryPercent}%
                    </span>
                    <span className="-mt-2 text-[10px] font-medium text-slate-400">
                      {locale === 'zh-CN' ? '总体掌握' : 'mastered'}
                    </span>
                  </div>
                </div>
                <dl className="min-w-0 flex-1 space-y-2 text-xs">
                  {[
                    {
                      label: locale === 'zh-CN' ? '掌握良好' : 'Mastered',
                      count: bankStats.mastered,
                      className: 'bg-emerald-500',
                    },
                    {
                      label: locale === 'zh-CN' ? '待复习' : 'To review',
                      count: bankStats.review,
                      className: 'bg-amber-500',
                    },
                    {
                      label: locale === 'zh-CN' ? '错题' : 'Wrong',
                      count: bankStats.wrong,
                      className: 'bg-rose-500',
                    },
                    {
                      label: locale === 'zh-CN' ? '未练习' : 'Untried',
                      count: bankStats.unattempted,
                      className: 'bg-slate-300',
                    },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between gap-2">
                      <dt className="flex min-w-0 items-center gap-2 text-slate-500 dark:text-slate-400">
                        <span className={cn('size-2 rounded-full', item.className)} />
                        <span className="truncate">{item.label}</span>
                      </dt>
                      <dd className="font-semibold text-slate-800 dark:text-slate-100">
                        {item.count}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center text-xs dark:border-slate-800">
                <div>
                  <div className="font-semibold text-sky-600 dark:text-sky-300">
                    {bankStats.attempted}/{bankStats.total || 0}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {locale === 'zh-CN' ? '已练习' : 'Practiced'}
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-sky-600 dark:text-sky-300">
                    {bankStats.coveredNotebookCount}/{Math.max(1, bankStats.notebookCount)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {locale === 'zh-CN' ? '题库覆盖' : 'Coverage'}
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-sky-600 dark:text-sky-300">
                    {bankStats.masteredTopicCount}/{bankStats.topicCount || 0}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {locale === 'zh-CN' ? '知识点' : 'Concepts'}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)] dark:border-slate-800 dark:bg-slate-950/60">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {locale === 'zh-CN' ? '做题最少章节 TOP5' : 'Least practiced chapters TOP5'}
              </p>
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                {locale === 'zh-CN'
                  ? '按已做题目数量升序统计'
                  : 'Sorted by attempted problem count'}
              </p>
              <div className="mt-4 space-y-3">
                {bankStats.weakTopics.length > 0 ? (
                  bankStats.weakTopics.map((item, index) => (
                    <div key={item.topic} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate font-medium text-slate-700 dark:text-slate-200">
                          {item.topic}
                        </span>
                        <span className="shrink-0 font-semibold text-slate-500 dark:text-slate-400">
                          {locale === 'zh-CN' ? `已做 ${item.count} 题` : `${item.count} done`}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className={cn('h-full rounded-full', weakTopicBarClass(index))}
                          style={{ width: `${item.percent}%` }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2 text-xs leading-5 text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                    {locale === 'zh-CN' ? '暂无章节刷题数据。' : 'No chapter practice data yet.'}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setImportMode('pdf');
                  setImportOpen(true);
                }}
                className="rounded-2xl border border-slate-200 bg-white/95 p-3 text-center text-xs font-semibold text-slate-700 shadow-[0_16px_40px_rgba(15,23,42,0.05)] transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200 dark:hover:border-sky-500/30 dark:hover:bg-sky-500/10"
              >
                <FileUp className="mx-auto mb-2 h-5 w-5 text-sky-600 dark:text-sky-300" />
                <span>{locale === 'zh-CN' ? '导入题目' : 'Import'}</span>
                <span className="mt-1 block text-[10px] font-normal text-slate-400">
                  {locale === 'zh-CN' ? 'PDF / LaTeX / 文本' : 'PDF / LaTeX / text'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setImportMode('web');
                  setImportOpen(true);
                }}
                className="rounded-2xl border border-slate-200 bg-white/95 p-3 text-center text-xs font-semibold text-slate-700 shadow-[0_16px_40px_rgba(15,23,42,0.05)] transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200 dark:hover:border-sky-500/30 dark:hover:bg-sky-500/10"
              >
                <Sparkles className="mx-auto mb-2 h-5 w-5 text-sky-600 dark:text-sky-300" />
                <span>{locale === 'zh-CN' ? '智能生成' : 'Generate'}</span>
                <span className="mt-1 block text-[10px] font-normal text-slate-400">
                  {locale === 'zh-CN' ? '按知识点出题' : 'By concepts'}
                </span>
              </button>
            </div>
          </aside>
        </>
      ) : null}

      {isPracticeMode ? (
        <div className="order-1 flex min-h-0 min-w-0 flex-1 flex-col">
          {!selectedProblem ? (
            <div className="flex h-full w-full items-center justify-center rounded-2xl border border-slate-200 bg-white/80 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {locale === 'zh-CN' ? '正在加载题目...' : 'Loading problem...'}
                </>
              ) : (
                <>{locale === 'zh-CN' ? '没有找到这道题。' : 'Problem not found.'}</>
              )}
            </div>
          ) : (
            <>
              <div className="mb-2 flex min-h-11 shrink-0 flex-col gap-2 rounded-lg border border-slate-200 bg-white px-2 py-2 shadow-sm shadow-slate-950/[0.03] sm:flex-row sm:items-center sm:justify-between sm:px-3 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 rounded-md px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
                    onClick={() => router.push(`/course/${encodeURIComponent(courseId)}`)}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    {locale === 'zh-CN' ? '课程空间' : 'Course'}
                  </Button>
                  <span className="hidden rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500 sm:inline-flex dark:bg-slate-900 dark:text-slate-400">
                    {currentNotebookProblemPosition > 0
                      ? `${currentNotebookProblemPosition}/${sameNotebookProblems.length}`
                      : locale === 'zh-CN'
                        ? '未归类'
                        : 'Unassigned'}
                  </span>
                  {selectedProblemNotebookLabel ? (
                    <span
                      className="flex min-w-0 max-w-full items-center gap-1.5 rounded bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700 ring-1 ring-sky-100 sm:max-w-[min(18rem,42vw)] dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-500/20"
                      title={selectedProblemNotebookLabel}
                    >
                      <BookOpen className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{selectedProblemNotebookLabel}</span>
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      'hidden shrink-0 rounded px-2 py-1 text-[11px] font-semibold md:inline-flex',
                      difficultyTextClassName(selectedProblem.difficulty),
                    )}
                  >
                    {difficultyLabel(selectedProblem.difficulty, locale)}
                  </span>
                </div>

                <div className="flex shrink-0 flex-wrap items-center justify-between gap-1.5 sm:justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-md px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
                    disabled={!previousPracticeTarget}
                    onClick={() => {
                      if (!previousPracticeTarget) return;
                      navigateToPracticeProblem(previousPracticeTarget);
                    }}
                    title={
                      previousPracticeTarget
                        ? previousPracticeTarget.title
                        : locale === 'zh-CN'
                          ? '没有上一题'
                          : 'No previous problem'
                    }
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    {previousPracticeIsChapterJump
                      ? locale === 'zh-CN'
                        ? '上一章'
                        : 'Prev chapter'
                      : locale === 'zh-CN'
                        ? '上一题'
                        : 'Prev'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-md px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
                    disabled={!nextPracticeTarget}
                    onClick={() => {
                      if (!nextPracticeTarget) return;
                      navigateToPracticeProblem(nextPracticeTarget);
                    }}
                    title={
                      nextPracticeTarget
                        ? nextPracticeTarget.title
                        : locale === 'zh-CN'
                          ? '没有下一题'
                          : 'No next problem'
                    }
                  >
                    {nextPracticeIsChapterJump
                      ? locale === 'zh-CN'
                        ? '下一章'
                        : 'Next chapter'
                      : locale === 'zh-CN'
                        ? '下一题'
                        : 'Next'}
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 rounded-md text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900"
                        aria-label={locale === 'zh-CN' ? '更多操作' : 'More actions'}
                      >
                        <Ellipsis className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => setMoveDialogOpen(true)}>
                        <ArrowRightLeft className="h-4 w-4" />
                        {locale === 'zh-CN' ? '移动到其他笔记本' : 'Move to notebook'}
                      </DropdownMenuItem>
                      {selectedProblem.notebookId ? (
                        <DropdownMenuItem
                          onClick={() => router.push(`/classroom/${selectedProblem.notebookId}`)}
                        >
                          <ExternalLink className="h-4 w-4" />
                          {locale === 'zh-CN' ? '打开对应笔记本' : 'Open notebook'}
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={handleDeleteProblem}
                        disabled={deletingProblem}
                      >
                        {deletingProblem ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        {locale === 'zh-CN' ? '删除题目' : 'Delete'}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="grid min-h-0 flex-1 gap-2 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(24rem,1fr)] lg:overflow-hidden">
                <section className="flex min-h-[min(34rem,72dvh)] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white lg:min-h-0 dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex min-h-11 shrink-0 items-center gap-3 overflow-x-auto border-b border-slate-200 px-3 sm:gap-4 sm:px-4 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => handleProblemInfoTabChange('description')}
                      className={cn(
                        'relative h-full text-sm font-semibold transition',
                        problemInfoTab === 'description'
                          ? 'text-slate-950 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-sky-500 dark:text-white'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100',
                      )}
                    >
                      {locale === 'zh-CN' ? '题目描述' : 'Description'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleProblemInfoTabChange('formula')}
                      className={cn(
                        'relative h-full text-sm font-semibold transition',
                        problemInfoTab === 'formula'
                          ? 'text-slate-950 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-sky-500 dark:text-white'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100',
                      )}
                    >
                      {locale === 'zh-CN' ? '公式表' : 'Formula'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleProblemInfoTabChange('edit')}
                      className={cn(
                        'relative h-full text-sm font-semibold transition',
                        problemInfoTab === 'edit'
                          ? 'text-slate-950 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-sky-500 dark:text-white'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100',
                      )}
                    >
                      {locale === 'zh-CN' ? '编辑题目' : 'Edit'}
                    </button>
                    {selectedProblemHasTranslation ? (
                      <div className="ml-auto">
                        <ProblemLanguageToggle
                          value={problemLanguage}
                          locale={locale}
                          onChange={setProblemLanguage}
                        />
                      </div>
                    ) : null}
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 text-[15px] leading-8 text-slate-800 sm:px-5 sm:py-5 dark:text-slate-200">
                    {problemInfoTab === 'description' ? (
                      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col">
                        <div>
                          <h1
                            className="mb-4 border-b border-slate-200 pb-3 text-base font-semibold leading-7 text-slate-950 dark:border-slate-800 dark:text-white"
                            title={selectedProblemTitle}
                          >
                            <ProblemTitleText content={selectedProblemTitle} />
                          </h1>
                          {selectedProblemContent &&
                          renderProblemContentStem(selectedProblemContent) ? (
                            <ProblemRichText
                              content={renderProblemContentStem(selectedProblemContent)}
                            />
                          ) : (
                            <p>{locale === 'zh-CN' ? '暂无题面。' : 'No stem available.'}</p>
                          )}
                          <ProblemImageAssets
                            content={selectedProblemContent}
                            className="mt-6 sm:grid-cols-1 [&_figure]:rounded-lg [&_figure]:bg-white [&_img]:max-h-[360px]"
                          />
                        </div>
                        <div className="mt-auto flex flex-wrap gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                          {problemMetaChips(selectedProblem, locale).map((chip) => (
                            <ProblemMetaChip
                              key={chip.key}
                              label={chip.label}
                              Icon={chip.Icon}
                              className={chip.className}
                            />
                          ))}
                        </div>
                      </div>
                    ) : problemInfoTab === 'formula' ? (
                      <FormulaReferencePanel locale={locale} onInsert={insertFormulaIntoAnswer} />
                    ) : selectedProblemEditDraft ? (
                      <ProblemDraftForm
                        key={`${selectedProblemEditDraft.draftId}-${selectedProblem.updatedAt}`}
                        draft={selectedProblemEditDraft}
                        locale={locale}
                        saveLabel={locale === 'zh-CN' ? '保存题目' : 'Save problem'}
                        onDraftChange={handleEditingDraftChange}
                        onSave={async (nextDraft) => {
                          await handleUpdateProblem(problemDraftToPatch(nextDraft));
                          toast.success(locale === 'zh-CN' ? '题目已更新' : 'Problem updated');
                        }}
                      />
                    ) : null}
                  </div>
                </section>

                <section className="flex min-h-[min(34rem,72dvh)] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white lg:min-h-0 dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex min-h-11 shrink-0 items-center gap-3 overflow-x-auto border-b border-slate-200 px-3 sm:gap-4 sm:px-4 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setAnswerPanelTab('answer')}
                      className={cn(
                        'relative h-full text-sm font-semibold transition',
                        answerPanelTab === 'answer'
                          ? 'text-slate-950 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-emerald-500 dark:text-white'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100',
                      )}
                    >
                      {locale === 'zh-CN' ? '作答' : 'Answer'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnswerPanelTab('preview')}
                      className={cn(
                        'relative h-full text-sm font-semibold transition',
                        answerPanelTab === 'preview'
                          ? 'text-slate-950 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-emerald-500 dark:text-white'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100',
                      )}
                    >
                      {problemInfoTab === 'edit'
                        ? locale === 'zh-CN'
                          ? '预览题目'
                          : 'Problem preview'
                        : locale === 'zh-CN'
                          ? '预览'
                          : 'Preview'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnswerPanelTab('solution')}
                      className={cn(
                        'relative h-full text-sm font-semibold transition',
                        answerPanelTab === 'solution'
                          ? 'text-slate-950 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-emerald-500 dark:text-white'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100',
                      )}
                    >
                      {locale === 'zh-CN' ? '题解' : 'Solution'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnswerPanelTab('history')}
                      className={cn(
                        'relative h-full text-sm font-semibold transition',
                        answerPanelTab === 'history'
                          ? 'text-slate-950 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-emerald-500 dark:text-white'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100',
                      )}
                    >
                      {locale === 'zh-CN' ? '提交历史' : 'History'}
                    </button>
                    {answerPanelTab === 'answer' ? (
                      <Button
                        onClick={handleSubmitInlineAnswer}
                        disabled={submittingAnswer}
                        className={cn(
                          'ml-auto h-8 shrink-0 rounded-md px-3 text-xs font-semibold',
                          PROBLEM_BANK_EMERALD_ACTION_BUTTON_CLASS,
                        )}
                      >
                        {submittingAnswer ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        {locale === 'zh-CN' ? '提交答案' : 'Submit'}
                      </Button>
                    ) : null}
                  </div>

                  <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3 sm:p-4">
                    {answerPanelTab === 'answer' ? (
                      <div className="flex min-h-full flex-col">
                        {selectedProblem.type === 'choice' &&
                        selectedProblemContent?.type === 'choice' ? (
                          <div className="space-y-2">
                            {selectedProblemContent.options.map((option) => {
                              const selected = choiceAnswers[selectedProblem.id] ?? [];
                              const multi = selectedProblemContent.selectionMode === 'multiple';
                              const correctOptionIds =
                                selectedAnswerFeedback?.correctOptionIds ?? [];
                              const hasAnswerFeedback = Boolean(selectedAnswerFeedback);
                              const isCorrectOption = correctOptionIds.includes(option.id);
                              const isWrongSelected =
                                hasAnswerFeedback &&
                                selected.includes(option.id) &&
                                !isCorrectOption;
                              return (
                                <label
                                  key={option.id}
                                  className={cn(
                                    'flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3 text-[15px] transition dark:border-slate-700',
                                    hasAnswerFeedback && isCorrectOption
                                      ? 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-500/50 dark:bg-emerald-500/10 dark:text-emerald-50'
                                      : isWrongSelected
                                        ? 'border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-500/50 dark:bg-rose-500/10 dark:text-rose-50'
                                        : selected.includes(option.id)
                                          ? 'border-sky-300 bg-sky-50 text-slate-950 dark:border-sky-500/50 dark:bg-sky-500/10 dark:text-white'
                                          : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-900/70',
                                  )}
                                >
                                  <input
                                    className="mt-1 size-4 accent-sky-600"
                                    type={multi ? 'checkbox' : 'radio'}
                                    checked={selected.includes(option.id)}
                                    onChange={(event) => {
                                      setChoiceAnswers((prev) => {
                                        const current = prev[selectedProblem.id] ?? [];
                                        const next = multi
                                          ? event.target.checked
                                            ? [...current, option.id]
                                            : current.filter((item) => item !== option.id)
                                          : [option.id];
                                        return {
                                          ...prev,
                                          [selectedProblem.id]: Array.from(new Set(next)),
                                        };
                                      });
                                      setAnswerFeedbackByProblemId((prev) => {
                                        if (!prev[selectedProblem.id]) return prev;
                                        const next = { ...prev };
                                        delete next[selectedProblem.id];
                                        return next;
                                      });
                                    }}
                                  />
                                  <div className="min-w-0">
                                    <span className="font-medium">{option.id}.</span>
                                    <ProblemRichText
                                      content={option.label}
                                      className="inline-block align-middle [&_p]:inline [&_.katex-display]:inline-block"
                                    />
                                  </div>
                                  {hasAnswerFeedback && isCorrectOption ? (
                                    <CheckCircle2 className="ml-auto mt-1 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
                                  ) : isWrongSelected ? (
                                    <X className="ml-auto mt-1 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-300" />
                                  ) : null}
                                </label>
                              );
                            })}
                          </div>
                        ) : selectedProblem.type === 'fill_blank' &&
                          selectedProblemContent?.type === 'fill_blank' ? (
                          <div className="space-y-2">
                            {selectedProblemContent.blanks.map((blank) => (
                              <div key={blank.id}>
                                <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
                                  {blank.id}
                                </label>
                                <Input
                                  value={blankAnswers[selectedProblem.id]?.[blank.id] ?? ''}
                                  placeholder={
                                    blank.placeholder ||
                                    (locale === 'zh-CN' ? '请输入答案' : 'Type your answer')
                                  }
                                  onChange={(event) =>
                                    setBlankAnswers((prev) => ({
                                      ...prev,
                                      [selectedProblem.id]: {
                                        ...(prev[selectedProblem.id] ?? {}),
                                        [blank.id]: event.target.value,
                                      },
                                    }))
                                  }
                                />
                              </div>
                            ))}
                          </div>
                        ) : selectedProblem.type === 'code' &&
                          selectedProblemContent?.type === 'code' ? (
                          <Textarea
                            className="min-h-[220px] font-mono text-xs"
                            value={
                              codeAnswers[selectedProblem.id] ??
                              selectedProblemContent.starterCode ??
                              ''
                            }
                            onChange={(event) =>
                              setCodeAnswers((prev) => ({
                                ...prev,
                                [selectedProblem.id]: event.target.value,
                              }))
                            }
                            placeholder={
                              locale === 'zh-CN'
                                ? '在这里编写代码并提交。'
                                : 'Write code here and submit.'
                            }
                          />
                        ) : supportsPhotoAnswer(selectedProblem) &&
                          selectedAnswerMode === 'photo' ? (
                          <PhotoAnswerUploader
                            inputId={`photo-answer-${selectedProblem.id}`}
                            photos={photoAnswers[selectedProblem.id] ?? []}
                            disabled={submittingAnswer}
                            locale={locale}
                            onAddFiles={handleAddPhotoAnswerFiles}
                            onRemovePhoto={handleRemovePhotoAnswer}
                          />
                        ) : (
                          <AnswerComposer
                            value={textAnswers[selectedProblem.id] ?? ''}
                            onChange={setSelectedTextAnswer}
                            controller={selectedAnswerController}
                            showToolbar={false}
                            showToolbarPanels={!showSidebarAnswerTools}
                            locale={locale}
                            className="flex min-h-[300px] flex-1 flex-col sm:min-h-[360px]"
                            textareaClassName="flex-1"
                            placeholder={answerComposerPlaceholder(locale)}
                          />
                        )}
                        {supportsPhotoAnswer(selectedProblem) ? (
                          <div className="mt-3 flex w-full flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className={cn(
                                'h-8 gap-1.5 rounded-md px-3 text-xs font-semibold',
                                selectedAnswerMode === 'text'
                                  ? PROBLEM_BANK_EMERALD_ACTION_BUTTON_CLASS
                                  : PROBLEM_BANK_EMERALD_OUTLINE_BUTTON_CLASS,
                              )}
                              onClick={() =>
                                setAnswerModes((prev) => ({
                                  ...prev,
                                  [selectedProblem.id]: 'text',
                                }))
                              }
                            >
                              <Type className="h-4 w-4" />
                              {locale === 'zh-CN' ? '文字输入' : 'Text'}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className={cn(
                                'h-8 gap-1.5 rounded-md px-3 text-xs font-semibold',
                                selectedAnswerMode === 'photo'
                                  ? PROBLEM_BANK_EMERALD_ACTION_BUTTON_CLASS
                                  : PROBLEM_BANK_EMERALD_OUTLINE_BUTTON_CLASS,
                              )}
                              onClick={() =>
                                setAnswerModes((prev) => ({
                                  ...prev,
                                  [selectedProblem.id]: 'photo',
                                }))
                              }
                            >
                              <ImagePlus className="h-4 w-4" />
                              {locale === 'zh-CN' ? '照片上传' : 'Photos'}
                            </Button>
                            {selectedAnswerFeedback ? (
                              <AnswerFeedbackSummaryBadge
                                feedback={selectedAnswerFeedback}
                                points={selectedProblemPoints}
                                locale={locale}
                                className="ml-auto max-w-[min(21rem,100%)]"
                              />
                            ) : null}
                          </div>
                        ) : null}
                        {selectedAnswerFeedback && !supportsPhotoAnswer(selectedProblem) ? (
                          <AnswerFeedbackSummaryBadge
                            feedback={selectedAnswerFeedback}
                            points={selectedProblemPoints}
                            locale={locale}
                            className="mt-3"
                          />
                        ) : null}
                      </div>
                    ) : answerPanelTab === 'preview' && problemInfoTab === 'edit' ? (
                      visibleProblemPreviewDraft ? (
                        <ProblemDraftPreviewPanel
                          draft={visibleProblemPreviewDraft}
                          locale={locale}
                        />
                      ) : (
                        <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
                          {locale === 'zh-CN'
                            ? '暂无可预览的题目。'
                            : 'No problem preview available.'}
                        </div>
                      )
                    ) : answerPanelTab === 'preview' ? (
                      <div className="flex min-h-full flex-col">
                        {selectedProblem.type === 'choice' &&
                        selectedProblemContent?.type === 'choice' ? (
                          <ChoiceAnswerPreviewPanel
                            content={selectedProblemContent}
                            selectedOptionIds={
                              choiceAnswers[selectedProblem.id] ??
                              selectedAnswerFeedback?.selectedOptionIds ??
                              []
                            }
                            feedback={selectedAnswerFeedback}
                            locale={locale}
                          />
                        ) : selectedProblem.type === 'fill_blank' &&
                          selectedProblem.publicContent.type === 'fill_blank' ? (
                          <div className="space-y-2">
                            {selectedProblem.publicContent.blanks.map((blank) => (
                              <div
                                key={blank.id}
                                className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-sm dark:border-slate-700 dark:bg-slate-900/60"
                              >
                                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                  {blank.id}
                                </p>
                                <p className="mt-1 text-slate-800 dark:text-slate-100">
                                  {blankAnswers[selectedProblem.id]?.[blank.id]?.trim() ||
                                    (locale === 'zh-CN' ? '未填写' : 'Empty')}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : selectedProblem.type === 'code' &&
                          selectedProblem.publicContent.type === 'code' ? (
                          <pre className="min-h-[180px] overflow-x-auto rounded-lg border border-slate-200 bg-slate-950 p-4 text-xs leading-6 text-slate-50 dark:border-slate-700">
                            {codeAnswers[selectedProblem.id] ??
                              selectedProblem.publicContent.starterCode ??
                              (locale === 'zh-CN' ? '还没有代码。' : 'No code yet.')}
                          </pre>
                        ) : supportsPhotoAnswer(selectedProblem) &&
                          selectedAnswerMode === 'photo' ? (
                          (photoAnswers[selectedProblem.id] ?? []).length > 0 ? (
                            <div className="grid gap-3 sm:grid-cols-2">
                              {(photoAnswers[selectedProblem.id] ?? []).map((photo) => (
                                <figure
                                  key={photo.id}
                                  className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60"
                                >
                                  <img
                                    src={photo.dataUrl}
                                    alt={photo.name}
                                    className="max-h-72 w-full object-contain"
                                  />
                                  <figcaption className="border-t border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                                    {photo.name}
                                  </figcaption>
                                </figure>
                              ))}
                            </div>
                          ) : (
                            <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
                              {locale === 'zh-CN' ? '还没有上传照片。' : 'No photos uploaded yet.'}
                            </div>
                          )
                        ) : (
                          <AnswerPreviewPanel
                            value={selectedTextAnswerValue}
                            placeholder={answerComposerPlaceholder(locale)}
                          />
                        )}
                      </div>
                    ) : answerPanelTab === 'history' ? (
                      <AttemptHistoryPanel
                        attempts={selectedProblemAttempts}
                        loading={selectedProblemAttemptsLoading}
                        points={selectedProblem.points}
                        locale={locale}
                      />
                    ) : selectedProblemSolutionSections.length > 0 ? (
                      <div className="space-y-4">
                        {selectedProblemSolutionSections.map((section) => (
                          <section key={section.title}>
                            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              {section.title}
                            </p>
                            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-sm leading-6 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                              <ProblemRichText content={section.content} />
                            </div>
                          </section>
                        ))}
                      </div>
                    ) : (
                      <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
                        {locale === 'zh-CN'
                          ? '这道题还没有题解。'
                          : 'No solution has been added yet.'}
                      </div>
                    )}
                  </div>
                </section>
              </div>

              <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
                <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-md overflow-y-auto rounded-2xl p-4 sm:w-full sm:p-6">
                  <DialogHeader>
                    <DialogTitle>
                      {locale === 'zh-CN' ? '移动题目归属' : 'Move problem'}
                    </DialogTitle>
                    <DialogDescription>
                      {locale === 'zh-CN'
                        ? '选择要将当前题目归属到的笔记本。'
                        : 'Choose the notebook to reassign this problem.'}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <select
                      value={moveNotebookId}
                      onChange={(event) => setMoveNotebookId(event.target.value)}
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                    >
                      <option value="__unassigned__">
                        {locale === 'zh-CN' ? '未归类题目' : 'Unassigned'}
                      </option>
                      {notebooks.map((notebook) => (
                        <option key={notebook.id} value={notebook.id}>
                          {notebook.name}
                        </option>
                      ))}
                    </select>
                    <div className="flex justify-end">
                      <Button
                        onClick={handleSaveAssignment}
                        disabled={savingAssignment}
                        className={cn(
                          'w-full min-[420px]:w-auto',
                          PROBLEM_BANK_PRIMARY_BUTTON_CLASS,
                        )}
                      >
                        {savingAssignment ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="mr-2 h-4 w-4" />
                        )}
                        {locale === 'zh-CN' ? '确认移动' : 'Move'}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      ) : null}

      {showSidebarAnswerTools ? (
        <div className="order-3 flex h-full w-[280px] shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/90 2xl:w-[300px] dark:border-slate-800 dark:bg-slate-950/50">
          <div className="min-h-0 flex-1 overflow-hidden p-2">
            <AnswerComposerToolbar
              controller={selectedAnswerController}
              locale={locale}
              fillPanels
              showControls={false}
              className="bg-white dark:bg-slate-950/40"
            />
          </div>
        </div>
      ) : null}

      <CourseProblemImportDialog view={view} />
    </div>
  );
}
