'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@/lib/notifications/client-toast';
import { useRouter } from 'next/navigation';
import { parsePdfForGeneration } from '@/lib/pdf/parse-for-generation';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import {
  getLocalizedProblemContent,
  getLocalizedProblemTitle,
  hasProblemTranslation,
  notebookProblemImportDraftSchema,
  type NotebookProblemAttemptRecord,
  type NotebookProblemAttemptStatus,
  type NotebookProblemImportDraft,
  type ProblemContentLanguage,
} from '@/lib/problem-bank';
import {
  commitCourseProblemImport,
  deleteCourseProblem,
  listNotebookProblemAttempts,
  listCourseProblems,
  previewCourseProblemImport,
  runNotebookCodeProblem,
  submitNotebookProblem,
  updateCourseProblem,
  type NotebookProblemClientRecord,
} from '@/lib/utils/notebook-problem-api';
import { listStagesByCourse, type StageListItem } from '@/lib/utils/stage-storage';
import { getCourse } from '@/lib/utils/course-storage';
import type { CourseRecord } from '@/lib/utils/database';
import { useAnswerComposerController } from '@/components/problem-bank/answer-composer';
import { problemRecordToDraft } from '@/lib/problem-bank/editor';
import {
  MAX_PHOTO_ANSWER_BYTES,
  MAX_PHOTO_ANSWER_FILES,
  PROBLEM_BANK_PAGE_SIZE,
  buildChoiceAnswerFeedback,
  compareProblemSequence,
  createManualProblemDraft,
  difficultyLabel,
  estimateProblemCountFromText,
  feedbackFromAttempt,
  formatDraftValidationErrors,
  latestAttemptFromRecord,
  matchesPracticeFilter,
  practiceFilterLabel,
  problemPracticeState,
  problemSolutionSections,
  problemTopics,
  readFileAsDataUrl,
  renderProblemContentStem,
  renderProblemStem,
  statusLabel,
  supportsPhotoAnswer,
  typeLabel,
  type AnswerPanelTab,
  type FilterSelectOption,
  type ImportProcessingStage,
  type InlineAnswerFeedback,
  type PhotoAnswerDraft,
  type PracticeFilter,
  type ProblemPracticeState,
  type ProblemInfoTab,
  type TextAnswerMode,
} from '@/components/problem-bank/course-problem-bank-helpers';

type CourseProblemBankControllerArgs = {
  courseId: string;
  initialNotebookId?: string;
  initialProblemId?: string;
  mode?: 'bank' | 'practice';
  onPracticeAttemptResolved?: (event: CourseProblemPracticeAttemptResolvedEvent) => void;
};

export type CourseProblemPracticeAttemptResolvedEvent = {
  problemId: string;
  status: NotebookProblemAttemptStatus;
  score?: number | null;
  feedback: string;
};

export type CourseCodeRunTarget = 'code' | 'public' | 'secret';

export type CourseCodeRunResult = {
  attempt?: NotebookProblemAttemptRecord;
  error?: string;
  code: string;
  target: CourseCodeRunTarget;
  ranAt: number;
};

export function useCourseProblemBankController({
  courseId,
  initialNotebookId,
  initialProblemId,
  mode = 'bank',
  onPracticeAttemptResolved,
}: CourseProblemBankControllerArgs) {
  const router = useRouter();
  const isPracticeMode = mode === 'practice';
  const { locale } = useI18n();
  const pdfProviderId = useSettingsStore((state) => state.pdfProviderId);
  const pdfProvidersConfig = useSettingsStore((state) => state.pdfProvidersConfig);
  const webSearchProviderId = useSettingsStore((state) => state.webSearchProviderId);
  const webSearchProvidersConfig = useSettingsStore((state) => state.webSearchProvidersConfig);

  const [courseName, setCourseName] = useState('');
  const [courseAccessRole, setCourseAccessRole] = useState<CourseRecord['accessRole']>();
  const [notebooks, setNotebooks] = useState<StageListItem[]>([]);
  const [problems, setProblems] = useState<NotebookProblemClientRecord[]>([]);
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null);
  const [problemLanguage, setProblemLanguage] = useState<ProblemContentLanguage>(
    locale === 'zh-CN' ? 'zh-CN' : 'en-US',
  );
  const [problemInfoTab, setProblemInfoTab] = useState<ProblemInfoTab>('description');
  const [answerPanelTab, setAnswerPanelTab] = useState<AnswerPanelTab>('answer');
  const [editingPreviewDraft, setEditingPreviewDraft] = useState<NotebookProblemImportDraft | null>(
    null,
  );
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveNotebookId, setMoveNotebookId] = useState<string>('__unassigned__');
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [deletingProblem, setDeletingProblem] = useState(false);
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [answerModes, setAnswerModes] = useState<Record<string, TextAnswerMode>>({});
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>({});
  const [photoAnswers, setPhotoAnswers] = useState<Record<string, PhotoAnswerDraft[]>>({});
  const [choiceAnswers, setChoiceAnswers] = useState<Record<string, string[]>>({});
  const [blankAnswers, setBlankAnswers] = useState<Record<string, Record<string, string>>>({});
  const [codeAnswers, setCodeAnswers] = useState<Record<string, string>>({});
  const [runningCode, setRunningCode] = useState(false);
  const [runningCodeTarget, setRunningCodeTarget] = useState<CourseCodeRunTarget | null>(null);
  const [codeRunResults, setCodeRunResults] = useState<Record<string, CourseCodeRunResult>>({});
  const [answerFeedbackByProblemId, setAnswerFeedbackByProblemId] = useState<
    Record<string, InlineAnswerFeedback>
  >({});
  const [attemptsByProblemId, setAttemptsByProblemId] = useState<
    Record<string, NotebookProblemAttemptRecord[]>
  >({});
  const [attemptHistoryLoadingProblemId, setAttemptHistoryLoadingProblemId] = useState<
    string | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [problemPage, setProblemPage] = useState(1);
  const [practiceFilter, setPracticeFilter] = useState<PracticeFilter>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | NotebookProblemClientRecord['type']>('all');
  const [difficultyFilter, setDifficultyFilter] = useState<
    'all' | NotebookProblemClientRecord['difficulty']
  >('all');
  const [notebookFilter, setNotebookFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | NotebookProblemClientRecord['status']>(
    'all',
  );

  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<'text' | 'pdf' | 'web' | 'manual'>('text');
  const [importText, setImportText] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importWebQuery, setImportWebQuery] = useState('');
  const [drafts, setDrafts] = useState<NotebookProblemImportDraft[]>([]);
  const [includedDraftIds, setIncludedDraftIds] = useState<Record<string, boolean>>({});
  const [previewLoading, setPreviewLoading] = useState(false);
  const [commitLoading, setCommitLoading] = useState(false);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [draftEditorText, setDraftEditorText] = useState('');
  const [importProcessingStage, setImportProcessingStage] = useState<ImportProcessingStage>('idle');
  const [importProcessingDetail, setImportProcessingDetail] = useState('');
  const [importSummaryNote, setImportSummaryNote] = useState<string | null>(null);
  const [importEstimatedProblemCount, setImportEstimatedProblemCount] = useState(0);
  const [importProcessedProblemCount, setImportProcessedProblemCount] = useState(0);
  const [importUsage, setImportUsage] = useState<{
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    estimatedCostCredits: number | null;
  } | null>(null);
  const [importWebSearchSummary, setImportWebSearchSummary] = useState<{
    query: string;
    sourceCount: number;
    estimatedCostCredits: number;
    sources: Array<{ title: string; url: string }>;
  } | null>(null);
  const [importBatchId, setImportBatchId] = useState<string | null>(null);
  const [previewNotebookOptions, setPreviewNotebookOptions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const loadAll = useCallback(async () => {
    if (!courseId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [course, courseNotebooks, courseProblems] = await Promise.all([
        getCourse(courseId),
        listStagesByCourse(courseId),
        listCourseProblems(courseId),
      ]);
      setCourseName(course?.name || '');
      setCourseAccessRole(course?.accessRole);
      setNotebooks(courseNotebooks);
      setProblems(courseProblems);
      if (isPracticeMode) {
        const preferred =
          courseProblems.find((problem) => problem.id === initialProblemId)?.id ??
          courseProblems.find((problem) =>
            initialNotebookId ? problem.notebookId === initialNotebookId : true,
          )?.id ??
          courseProblems[0]?.id ??
          null;
        setSelectedProblemId(preferred);
      } else {
        setSelectedProblemId((current) =>
          current && courseProblems.some((problem) => problem.id === current) ? current : null,
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load course problems');
    } finally {
      setLoading(false);
    }
  }, [courseId, initialNotebookId, initialProblemId, isPracticeMode]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const canEditProblems = courseAccessRole === 'owner';

  useEffect(() => {
    if (canEditProblems) return;
    setImportOpen(false);
    setMoveDialogOpen(false);
    setProblemInfoTab((current) => (current === 'edit' ? 'description' : current));
  }, [canEditProblems]);

  useEffect(() => {
    setProblemLanguage(locale === 'zh-CN' ? 'zh-CN' : 'en-US');
  }, [locale]);

  useEffect(() => {
    if (!isPracticeMode || problems.length === 0) return;
    const syncSelectedProblemFromUrl = () => {
      const [, courseSegment, encodedCourseId, problemBankSegment, encodedProblemId] =
        window.location.pathname.split('/');
      if (
        courseSegment !== 'course' ||
        problemBankSegment !== 'problem-bank' ||
        decodeURIComponent(encodedCourseId || '') !== courseId ||
        !encodedProblemId
      ) {
        return;
      }
      const problemId = decodeURIComponent(encodedProblemId);
      if (problems.some((problem) => problem.id === problemId)) {
        setSelectedProblemId(problemId);
      }
    };
    window.addEventListener('popstate', syncSelectedProblemFromUrl);
    return () => window.removeEventListener('popstate', syncSelectedProblemFromUrl);
  }, [courseId, isPracticeMode, problems]);

  const filteredProblems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return problems.filter((problem) => {
      if (typeFilter !== 'all' && problem.type !== typeFilter) return false;
      if (statusFilter !== 'all' && problem.status !== statusFilter) return false;
      if (practiceFilter !== 'all' && !matchesPracticeFilter(problem, practiceFilter)) {
        return false;
      }
      if (difficultyFilter !== 'all' && problem.difficulty !== difficultyFilter) return false;
      if (notebookFilter === '__unassigned__') {
        if (problem.notebookId) return false;
      } else if (notebookFilter !== 'all' && problem.notebookId !== notebookFilter) {
        return false;
      }
      if (initialNotebookId && problem.notebookId !== initialNotebookId) return false;
      if (query) {
        const problemNumber = problem.problemNumber ?? problem.order + 1;
        const zhContent = getLocalizedProblemContent(problem.publicContent, 'zh-CN');
        const haystack = [
          String(problemNumber),
          `#${problemNumber}`,
          `q${problemNumber}`,
          problem.title,
          getLocalizedProblemTitle(problem, 'zh-CN'),
          renderProblemStem(problem),
          renderProblemContentStem(zhContent),
          problem.notebookName ?? '',
          ...problem.tags,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [
    difficultyFilter,
    initialNotebookId,
    notebookFilter,
    practiceFilter,
    problems,
    searchQuery,
    statusFilter,
    typeFilter,
  ]);

  useEffect(() => {
    setProblemPage(1);
  }, [
    difficultyFilter,
    initialNotebookId,
    notebookFilter,
    practiceFilter,
    searchQuery,
    statusFilter,
    typeFilter,
  ]);

  const problemPageCount = Math.max(1, Math.ceil(filteredProblems.length / PROBLEM_BANK_PAGE_SIZE));

  useEffect(() => {
    setProblemPage((current) => Math.min(Math.max(current, 1), problemPageCount));
  }, [problemPageCount]);

  const currentProblemPage = Math.min(Math.max(problemPage, 1), problemPageCount);
  const pageStartIndex = (currentProblemPage - 1) * PROBLEM_BANK_PAGE_SIZE;
  const paginatedProblems = useMemo(
    () => filteredProblems.slice(pageStartIndex, pageStartIndex + PROBLEM_BANK_PAGE_SIZE),
    [filteredProblems, pageStartIndex],
  );
  const pageEndIndex = Math.min(pageStartIndex + paginatedProblems.length, filteredProblems.length);

  const activeProblems = useMemo(
    () => problems.filter((problem) => problem.status !== 'archived'),
    [problems],
  );
  const courseHasTranslations = useMemo(
    () => problems.some((problem) => hasProblemTranslation(problem)),
    [problems],
  );

  const difficultyOptions = useMemo(
    () =>
      (['easy', 'medium', 'hard'] as NotebookProblemClientRecord['difficulty'][]).map((value) => ({
        value,
        count: activeProblems.filter((problem) => problem.difficulty === value).length,
      })),
    [activeProblems],
  );

  const bankNotebookOptions = useMemo(() => {
    const counts = new Map<string, { id: string; name: string; count: number }>();
    for (const problem of activeProblems) {
      const id = problem.notebookId || '__unassigned__';
      const name = problem.notebookName || (locale === 'zh-CN' ? '未归类' : 'Unassigned');
      const current = counts.get(id);
      counts.set(id, { id, name, count: (current?.count ?? 0) + 1 });
    }
    for (const notebook of notebooks) {
      if (!counts.has(notebook.id))
        counts.set(notebook.id, { id: notebook.id, name: notebook.name, count: 0 });
    }
    return Array.from(counts.values()).sort((a, b) => {
      if (a.id === '__unassigned__') return 1;
      if (b.id === '__unassigned__') return -1;
      return b.count - a.count || a.name.localeCompare(b.name);
    });
  }, [activeProblems, locale, notebooks]);

  const practiceFilterOptions = useMemo<FilterSelectOption[]>(
    () =>
      (['all', 'review', 'wrong', 'unattempted', 'mastered'] as PracticeFilter[]).map((value) => ({
        value,
        label: practiceFilterLabel(value, locale),
      })),
    [locale],
  );

  const difficultyFilterOptions = useMemo<FilterSelectOption[]>(
    () => [
      { value: 'all', label: locale === 'zh-CN' ? '全部难度' : 'All levels' },
      ...difficultyOptions.map((option) => ({
        value: option.value,
        label: difficultyLabel(option.value, locale),
        count: option.count,
      })),
    ],
    [difficultyOptions, locale],
  );

  const notebookFilterOptions = useMemo<FilterSelectOption[]>(
    () => [
      { value: 'all', label: locale === 'zh-CN' ? '全部笔记本' : 'All notebooks' },
      ...bankNotebookOptions.map((option) => ({
        value: option.id,
        label: option.name,
        count: option.count,
      })),
    ],
    [bankNotebookOptions, locale],
  );

  const typeFilterOptions = useMemo<FilterSelectOption[]>(
    () => [
      { value: 'all', label: locale === 'zh-CN' ? '全部题型' : 'All types' },
      { value: 'short_answer', label: typeLabel('short_answer', locale) },
      { value: 'choice', label: typeLabel('choice', locale) },
      { value: 'proof', label: typeLabel('proof', locale) },
      { value: 'calculation', label: typeLabel('calculation', locale) },
      { value: 'fill_blank', label: typeLabel('fill_blank', locale) },
      { value: 'code', label: typeLabel('code', locale) },
    ],
    [locale],
  );

  const statusFilterOptions = useMemo<FilterSelectOption[]>(
    () => [
      { value: 'all', label: locale === 'zh-CN' ? '全部状态' : 'All status' },
      { value: 'draft', label: statusLabel('draft', locale) },
      { value: 'published', label: statusLabel('published', locale) },
      { value: 'archived', label: statusLabel('archived', locale) },
    ],
    [locale],
  );

  const bankStats = useMemo(() => {
    const stateCounts = activeProblems.reduce(
      (counts, problem) => {
        counts[problemPracticeState(problem)] += 1;
        return counts;
      },
      { mastered: 0, review: 0, wrong: 0, unattempted: 0 } as Record<ProblemPracticeState, number>,
    );
    const attempted = activeProblems.length - stateCounts.unattempted;
    const masteryPercent =
      activeProblems.length > 0
        ? Math.round((stateCounts.mastered / activeProblems.length) * 100)
        : 0;
    const allTopics = new Set<string>();
    const masteredTopics = new Set<string>();
    const notebookNameById = new Map(notebooks.map((notebook) => [notebook.id, notebook.name]));
    const chapterPracticeCounts = new Map<
      string,
      { topic: string; count: number; total: number; order: number }
    >(
      notebooks.map((notebook, index) => [
        notebook.id,
        { topic: notebook.name, count: 0, total: 0, order: index },
      ]),
    );
    let unassignedOrder = notebooks.length;
    for (const problem of activeProblems) {
      const state = problemPracticeState(problem);
      for (const topic of problemTopics(problem)) {
        if (topic !== '未标注') {
          allTopics.add(topic);
          if (state === 'mastered') masteredTopics.add(topic);
        }
      }

      if (state !== 'unattempted') {
        const notebookKey = problem.notebookId || `__unassigned__:${problem.notebookName || ''}`;
        const notebookName =
          problem.notebookName ||
          (problem.notebookId ? notebookNameById.get(problem.notebookId) : null) ||
          (locale === 'zh-CN' ? '未归属笔记本' : 'Unassigned notebook');
        const current = chapterPracticeCounts.get(notebookKey) ?? {
          topic: notebookName,
          count: 0,
          total: 0,
          order: unassignedOrder++,
        };
        current.count += 1;
        chapterPracticeCounts.set(notebookKey, current);
      }

      const notebookKey = problem.notebookId || `__unassigned__:${problem.notebookName || ''}`;
      const notebookName =
        problem.notebookName ||
        (problem.notebookId ? notebookNameById.get(problem.notebookId) : null) ||
        (locale === 'zh-CN' ? '未归属笔记本' : 'Unassigned notebook');
      const current = chapterPracticeCounts.get(notebookKey) ?? {
        topic: notebookName,
        count: 0,
        total: 0,
        order: unassignedOrder++,
      };
      current.total += 1;
      chapterPracticeCounts.set(notebookKey, current);
    }
    const coveredNotebookCount = new Set(
      activeProblems.map((problem) => problem.notebookId).filter(Boolean),
    ).size;
    const maxChapterPracticeCount = Math.max(
      1,
      ...Array.from(chapterPracticeCounts.values()).map((item) => item.count),
    );
    const leastPracticedChapters = Array.from(chapterPracticeCounts.values())
      .sort(
        (a, b) =>
          a.count - b.count ||
          b.total - a.total ||
          a.order - b.order ||
          a.topic.localeCompare(b.topic),
      )
      .slice(0, 5)
      .map((item) => ({
        topic: item.topic,
        count: item.count,
        total: item.total,
        percent: Math.min(100, Math.round((item.count / maxChapterPracticeCount) * 100)),
      }));
    return {
      total: activeProblems.length,
      attempted,
      mastered: stateCounts.mastered,
      review: stateCounts.review,
      wrong: stateCounts.wrong,
      unattempted: stateCounts.unattempted,
      masteryPercent,
      coveredNotebookCount,
      notebookCount: notebooks.length,
      masteredTopicCount: masteredTopics.size,
      topicCount: allTopics.size,
      weakTopics: leastPracticedChapters,
    };
  }, [activeProblems, locale, notebooks]);

  const selectedProblem =
    filteredProblems.find((problem) => problem.id === selectedProblemId) ||
    problems.find((problem) => problem.id === selectedProblemId) ||
    null;
  const selectedProblemContent = selectedProblem
    ? getLocalizedProblemContent(selectedProblem.publicContent, problemLanguage)
    : null;
  const selectedProblemTitle = selectedProblem
    ? getLocalizedProblemTitle(selectedProblem, problemLanguage)
    : '';
  const selectedProblemHasTranslation = hasProblemTranslation(selectedProblem);
  const selectedProblemRef = useRef<NotebookProblemClientRecord | null>(null);
  const selectedProblemNotebookId = selectedProblem?.notebookId ?? null;
  const selectedProblemNotebook = useMemo(() => {
    if (!selectedProblemNotebookId) return null;
    return notebooks.find((notebook) => notebook.id === selectedProblemNotebookId) ?? null;
  }, [notebooks, selectedProblemNotebookId]);
  const selectedProblemNotebookLabel = useMemo(() => {
    if (!selectedProblem) return '';
    if (!selectedProblem.notebookId) {
      return (
        selectedProblem.notebookName ||
        (locale === 'zh-CN' ? '未归属笔记本' : 'Unassigned notebook')
      );
    }
    return (
      selectedProblemNotebook?.name ||
      selectedProblem.notebookName ||
      (locale === 'zh-CN' ? '未知笔记本' : 'Unknown notebook')
    );
  }, [locale, selectedProblem, selectedProblemNotebook?.name]);
  const selectedProblemLatestAttemptId = selectedProblem?.latestAttempt?.id ?? null;
  useEffect(() => {
    selectedProblemRef.current = selectedProblem;
  }, [selectedProblem]);
  const notebookProblemGroups = useMemo(() => {
    const notebookNameById = new Map(notebooks.map((notebook) => [notebook.id, notebook.name]));
    const groupsByNotebook = new Map<string, NotebookProblemClientRecord[]>();

    for (const problem of problems) {
      if (problem.status === 'archived' || !problem.notebookId) continue;
      const group = groupsByNotebook.get(problem.notebookId) ?? [];
      group.push(problem);
      groupsByNotebook.set(problem.notebookId, group);
    }

    for (const group of groupsByNotebook.values()) {
      group.sort(compareProblemSequence);
    }

    const orderedNotebookIds = [
      ...notebooks
        .map((notebook) => notebook.id)
        .filter((notebookId) => groupsByNotebook.has(notebookId)),
      ...Array.from(groupsByNotebook.keys()).filter(
        (notebookId) => !notebookNameById.has(notebookId),
      ),
    ];

    return orderedNotebookIds.map((notebookId) => ({
      id: notebookId,
      name:
        notebookNameById.get(notebookId) ||
        groupsByNotebook.get(notebookId)?.[0]?.notebookName ||
        (locale === 'zh-CN' ? '未知笔记本' : 'Unknown notebook'),
      problems: groupsByNotebook.get(notebookId) ?? [],
    }));
  }, [locale, notebooks, problems]);
  const sameNotebookProblems = useMemo(() => {
    if (!selectedProblem?.notebookId) return [];
    return problems
      .filter(
        (problem) =>
          problem.status !== 'archived' && problem.notebookId === selectedProblem.notebookId,
      )
      .sort(compareProblemSequence);
  }, [problems, selectedProblem?.notebookId]);
  const nextNotebookProblem = useMemo(() => {
    if (!selectedProblem || sameNotebookProblems.length === 0) return null;
    const currentIndex = sameNotebookProblems.findIndex(
      (problem) => problem.id === selectedProblem.id,
    );
    return currentIndex >= 0 ? (sameNotebookProblems[currentIndex + 1] ?? null) : null;
  }, [sameNotebookProblems, selectedProblem]);
  const previousNotebookProblem = useMemo(() => {
    if (!selectedProblem || sameNotebookProblems.length === 0) return null;
    const currentIndex = sameNotebookProblems.findIndex(
      (problem) => problem.id === selectedProblem.id,
    );
    return currentIndex > 0 ? sameNotebookProblems[currentIndex - 1] : null;
  }, [sameNotebookProblems, selectedProblem]);
  const nextChapterProblem = useMemo(() => {
    if (!selectedProblem?.notebookId || nextNotebookProblem) return null;
    const currentNotebookIndex = notebookProblemGroups.findIndex(
      (group) => group.id === selectedProblem.notebookId,
    );
    if (currentNotebookIndex < 0) return null;
    for (const group of notebookProblemGroups.slice(currentNotebookIndex + 1)) {
      if (group.problems.length > 0) return group.problems[0];
    }
    return null;
  }, [nextNotebookProblem, notebookProblemGroups, selectedProblem?.notebookId]);
  const previousChapterProblem = useMemo(() => {
    if (!selectedProblem?.notebookId || previousNotebookProblem) return null;
    const currentNotebookIndex = notebookProblemGroups.findIndex(
      (group) => group.id === selectedProblem.notebookId,
    );
    if (currentNotebookIndex <= 0) return null;
    for (let index = currentNotebookIndex - 1; index >= 0; index -= 1) {
      const group = notebookProblemGroups[index];
      if (group.problems.length > 0) return group.problems[group.problems.length - 1];
    }
    return null;
  }, [notebookProblemGroups, previousNotebookProblem, selectedProblem?.notebookId]);
  const previousPracticeTarget = previousNotebookProblem ?? previousChapterProblem;
  const nextPracticeTarget = nextNotebookProblem ?? nextChapterProblem;
  const previousPracticeIsChapterJump = !previousNotebookProblem && Boolean(previousChapterProblem);
  const nextPracticeIsChapterJump = !nextNotebookProblem && Boolean(nextChapterProblem);
  const currentNotebookProblemPosition = useMemo(() => {
    if (!selectedProblem || sameNotebookProblems.length === 0) return 0;
    const currentIndex = sameNotebookProblems.findIndex(
      (problem) => problem.id === selectedProblem.id,
    );
    return currentIndex >= 0 ? currentIndex + 1 : 0;
  }, [sameNotebookProblems, selectedProblem]);
  const selectedProblemEditDraft = useMemo(
    () => (selectedProblem ? problemRecordToDraft(selectedProblem) : null),
    [selectedProblem],
  );
  const visibleProblemPreviewDraft = editingPreviewDraft ?? selectedProblemEditDraft;
  const selectedProblemSolutionSections = useMemo(() => {
    if (!selectedProblem || !selectedProblemContent) return [];
    return problemSolutionSections(
      { ...selectedProblem, publicContent: selectedProblemContent },
      locale,
    );
  }, [locale, selectedProblem, selectedProblemContent]);
  const selectedAnswerFeedback = selectedProblem
    ? (answerFeedbackByProblemId[selectedProblem.id] ?? null)
    : null;
  const selectedProblemPoints = selectedProblem?.points ?? 0;
  const selectedProblemAttempts = selectedProblem
    ? (attemptsByProblemId[selectedProblem.id] ?? [])
    : [];
  const selectedProblemAttemptsLoading = selectedProblem
    ? attemptHistoryLoadingProblemId === selectedProblem.id
    : false;
  const selectedAnswerMode: TextAnswerMode = selectedProblem
    ? (answerModes[selectedProblem.id] ?? 'text')
    : 'text';
  const selectedTextAnswerValue = selectedProblem ? (textAnswers[selectedProblem.id] ?? '') : '';
  const selectedTextAnswerId = selectedProblem?.id;
  const setSelectedTextAnswer = useCallback(
    (nextValue: string) => {
      if (!selectedTextAnswerId) return;
      setTextAnswers((prev) => ({
        ...prev,
        [selectedTextAnswerId]: nextValue,
      }));
    },
    [selectedTextAnswerId],
  );
  const selectedAnswerController = useAnswerComposerController({
    value: selectedTextAnswerValue,
    onChange: setSelectedTextAnswer,
  });
  const handleProblemInfoTabChange = useCallback(
    (tab: ProblemInfoTab) => {
      if (tab === 'edit' && !canEditProblems) {
        setProblemInfoTab('description');
        setAnswerPanelTab('answer');
        return;
      }
      setProblemInfoTab(tab);
      if (tab === 'edit') setAnswerPanelTab('preview');
    },
    [canEditProblems],
  );
  const handleEditingDraftChange = useCallback((nextDraft: NotebookProblemImportDraft) => {
    setEditingPreviewDraft(nextDraft);
  }, []);
  const insertFormulaIntoAnswer = useCallback(
    (latex: string) => {
      if (!selectedProblem) return;
      if (!supportsPhotoAnswer(selectedProblem)) {
        toast.error(
          locale === 'zh-CN'
            ? '这类题没有文字作答框，暂时不能插入公式。'
            : 'This problem type does not have a text answer box yet.',
        );
        return;
      }

      setAnswerPanelTab('answer');
      if (selectedAnswerMode === 'photo') {
        setAnswerModes((prev) => ({
          ...prev,
          [selectedProblem.id]: 'text',
        }));
      }

      window.setTimeout(() => {
        selectedAnswerController.applyEdit({ kind: 'insert', text: latex });
      }, 0);
    },
    [locale, selectedAnswerController, selectedAnswerMode, selectedProblem],
  );
  useEffect(() => {
    if (!isPracticeMode || !selectedProblemId || !selectedProblemNotebookId) return;
    const problem = selectedProblemRef.current;
    if (
      !problem ||
      problem.id !== selectedProblemId ||
      problem.notebookId !== selectedProblemNotebookId
    ) {
      return;
    }

    let cancelled = false;
    setAttemptHistoryLoadingProblemId(selectedProblemId);
    void listNotebookProblemAttempts(selectedProblemNotebookId, selectedProblemId)
      .then((attempts) => {
        if (cancelled) return;
        setAttemptsByProblemId((prev) => ({
          ...prev,
          [selectedProblemId]: attempts,
        }));
        const latestAttempt = attempts[0];
        if (!latestAttempt) return;
        const answer = latestAttempt.answer;

        setProblems((prev) =>
          prev.map((item) =>
            item.id === problem.id
              ? {
                  ...item,
                  latestAttempt: latestAttemptFromRecord(latestAttempt),
                }
              : item,
          ),
        );
        if (Array.isArray(answer.selectedOptionIds)) {
          setChoiceAnswers((prev) => ({
            ...prev,
            [problem.id]: answer.selectedOptionIds ?? [],
          }));
        }
        if (answer.blanks) {
          setBlankAnswers((prev) => ({
            ...prev,
            [problem.id]: answer.blanks ?? {},
          }));
        }
        if (typeof answer.code === 'string' && answer.code.trim()) {
          setCodeAnswers((prev) =>
            Object.prototype.hasOwnProperty.call(prev, problem.id)
              ? prev
              : {
                  ...prev,
                  [problem.id]: answer.code ?? '',
                },
          );
        }
        if (typeof answer.text === 'string') {
          setTextAnswers((prev) => ({
            ...prev,
            [problem.id]: answer.text ?? '',
          }));
        }
        if (Array.isArray(answer.images)) {
          setPhotoAnswers((prev) => ({
            ...prev,
            [problem.id]: answer.images ?? [],
          }));
        }
        setAnswerFeedbackByProblemId((prev) => ({
          ...prev,
          [problem.id]: feedbackFromAttempt(problem, latestAttempt, locale),
        }));
      })
      .catch((error) => {
        console.warn('Failed to restore latest problem attempt', error);
        if (!cancelled) {
          setAttemptsByProblemId((prev) => ({
            ...prev,
            [selectedProblemId]: [],
          }));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAttemptHistoryLoadingProblemId((current) =>
            current === selectedProblemId ? null : current,
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    isPracticeMode,
    locale,
    selectedProblemId,
    selectedProblemLatestAttemptId,
    selectedProblemNotebookId,
  ]);
  const navigateToPracticeProblem = useCallback(
    (problem: NotebookProblemClientRecord) => {
      if (!isPracticeMode) {
        router.push(
          `/course/${encodeURIComponent(courseId)}/problem-bank/${encodeURIComponent(problem.id)}`,
        );
        return;
      }
      setSelectedProblemId(problem.id);
      const nextPath = `/course/${encodeURIComponent(courseId)}/problem-bank/${encodeURIComponent(problem.id)}`;
      if (window.location.pathname !== nextPath) {
        window.history.pushState(null, '', nextPath);
      }
    },
    [courseId, isPracticeMode, router],
  );
  const showSidebarAnswerTools = false;
  const activeBankFilterCount = [
    practiceFilter !== 'all',
    typeFilter !== 'all',
    difficultyFilter !== 'all',
    notebookFilter !== 'all',
    statusFilter !== 'all',
  ].filter(Boolean).length;

  useEffect(() => {
    if (!selectedProblemId) return;
    setAnswerModes((prev) => {
      if (prev[selectedProblemId] === 'text') return prev;
      return {
        ...prev,
        [selectedProblemId]: 'text',
      };
    });
  }, [selectedProblemId]);

  useEffect(() => {
    setMoveNotebookId(selectedProblem?.notebookId || '__unassigned__');
  }, [selectedProblem?.id, selectedProblem?.notebookId]);

  useEffect(() => {
    setProblemInfoTab('description');
    setAnswerPanelTab('answer');
  }, [selectedProblem?.id]);

  useEffect(() => {
    setEditingPreviewDraft(selectedProblemEditDraft);
  }, [selectedProblemEditDraft]);

  const notebookOptions = useMemo(
    () =>
      previewNotebookOptions.length > 0
        ? previewNotebookOptions
        : notebooks.map((notebook) => ({ id: notebook.id, name: notebook.name })),
    [notebooks, previewNotebookOptions],
  );

  const handlePreviewImport = useCallback(async () => {
    if (!canEditProblems) {
      toast.error(
        locale === 'zh-CN' ? '只有课程作者可以编辑题目。' : 'Only the author can edit problems.',
      );
      return;
    }
    setPreviewLoading(true);
    setImportSummaryNote(null);
    setImportUsage(null);
    setImportWebSearchSummary(null);
    setImportBatchId(null);
    try {
      if (importMode === 'manual') {
        const manualDraft = createManualProblemDraft(locale, initialNotebookId ?? null);
        setPreviewNotebookOptions(
          notebooks.map((notebook) => ({ id: notebook.id, name: notebook.name })),
        );
        setImportEstimatedProblemCount(1);
        setImportProcessedProblemCount(1);
        setImportProcessingStage('preview-ready');
        setImportProcessingDetail(
          locale === 'zh-CN'
            ? '已创建 1 道手动草稿，可以直接设置章节归属并填写题目表单。'
            : 'Created 1 manual draft. You can assign a notebook and fill out the form right away.',
        );
        setDrafts([manualDraft]);
        setIncludedDraftIds({ [manualDraft.draftId]: true });
        setEditingDraftId(manualDraft.draftId);
        setDraftEditorText(JSON.stringify(manualDraft, null, 2));
        setImportSummaryNote(
          locale === 'zh-CN'
            ? '已创建 1 道手动题目草稿。手动添加不触发导题扣费，补充完成后可直接写入课程题库。'
            : 'Created 1 manual draft. Manual creation does not trigger import charges.',
        );
        return;
      }

      let text = importText.trim();
      let source: 'manual' | 'pdf' | 'web' = 'manual';
      let searchQuery = '';
      if (importMode === 'pdf') {
        if (!importFile) {
          throw new Error(locale === 'zh-CN' ? '请先选择 PDF 文件' : 'Select a PDF first');
        }
        setImportProcessingStage('parsing');
        setImportProcessingDetail(
          locale === 'zh-CN' ? '正在解析 PDF，并提取可用于导题的文本…' : 'Parsing PDF…',
        );
        const providerCfg = pdfProvidersConfig[pdfProviderId];
        const parsed = await parsePdfForGeneration({
          pdfFile: importFile,
          language: locale,
          providerId: pdfProviderId,
          providerConfig: {
            apiKey: providerCfg?.apiKey,
            baseUrl: providerCfg?.baseUrl,
          },
        });
        text = parsed.pdfText.trim();
        source = 'pdf';
        setImportEstimatedProblemCount(estimateProblemCountFromText(text));
        setImportProcessedProblemCount(0);
      } else if (importMode === 'web') {
        searchQuery = importWebQuery.trim();
        if (!searchQuery) {
          throw new Error(
            locale === 'zh-CN'
              ? '请先输入课程名或搜题关键词'
              : 'Enter a course name or search query first',
          );
        }
        source = 'web';
        setImportProcessingStage('searching');
        setImportProcessingDetail(
          locale === 'zh-CN'
            ? '正在联网搜索课程题目、往届试题和练习材料…'
            : 'Searching the web for course problems and past exams…',
        );
      }

      if (source !== 'web' && !text) {
        throw new Error(locale === 'zh-CN' ? '请先输入题目内容' : 'Enter problem text first');
      }
      if (importMode === 'text') {
        setImportEstimatedProblemCount(estimateProblemCountFromText(text));
        setImportProcessedProblemCount(0);
      }
      if (source !== 'web') {
        setImportProcessingStage('extracting');
        setImportProcessingDetail(
          locale === 'zh-CN' ? '正在从材料中拆分题目草稿…' : 'Extracting problem drafts…',
        );
      }

      const previewResult = await previewCourseProblemImport({
        courseId,
        source,
        text,
        searchQuery,
        webSearchApiKey: webSearchProvidersConfig[webSearchProviderId]?.apiKey || undefined,
        sourceFileName: importFile?.name,
        sourceFileMime: importFile?.type,
        language: locale,
      });

      setPreviewNotebookOptions(previewResult.notebooks);
      setImportUsage(previewResult.usage);
      setImportWebSearchSummary(previewResult.webSearch);
      setImportBatchId(previewResult.importBatch?.id ?? null);
      setImportProcessingStage('validating');
      setImportProcessingDetail(
        locale === 'zh-CN'
          ? '正在校验题目 schema，并给题目匹配章节…'
          : 'Validating and matching notebooks…',
      );

      setImportProcessedProblemCount(previewResult.drafts.length);
      setDrafts(previewResult.drafts);
      setIncludedDraftIds(
        Object.fromEntries(previewResult.drafts.map((draft) => [draft.draftId, true])),
      );
      if (previewResult.drafts[0]) {
        setEditingDraftId(previewResult.drafts[0].draftId);
        setDraftEditorText(JSON.stringify(previewResult.drafts[0], null, 2));
      }

      const needsFixCount = previewResult.drafts.filter(
        (draft) => draft.validationErrors.length > 0,
      ).length;
      setImportProcessingStage('preview-ready');
      setImportProcessingDetail(
        locale === 'zh-CN' ? '草稿预览已生成，可以调整章节归属后写入课程题库。' : 'Preview ready.',
      );
      setImportSummaryNote(
        locale === 'zh-CN'
          ? `已生成 ${previewResult.drafts.length} 道题草稿，其中 ${needsFixCount} 道需要修正。`
          : `${previewResult.drafts.length} drafts generated, ${needsFixCount} need fixes.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import preview failed');
      setImportProcessingStage('idle');
      setImportProcessingDetail('');
      setImportEstimatedProblemCount(0);
      setImportProcessedProblemCount(0);
      setImportBatchId(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [
    courseId,
    canEditProblems,
    importFile,
    importMode,
    importText,
    importWebQuery,
    initialNotebookId,
    locale,
    notebooks,
    pdfProviderId,
    pdfProvidersConfig,
    webSearchProviderId,
    webSearchProvidersConfig,
  ]);

  const handleSaveDraftEditor = useCallback(() => {
    if (!editingDraftId) return;
    try {
      const parsedJson = JSON.parse(draftEditorText) as unknown;
      const validated = notebookProblemImportDraftSchema.safeParse(parsedJson);
      if (!validated.success) {
        throw new Error(formatDraftValidationErrors(parsedJson).join('\n'));
      }
      setDrafts((prev) =>
        prev.map((draft) => (draft.draftId === editingDraftId ? validated.data : draft)),
      );
      toast.success(locale === 'zh-CN' ? '草稿已更新' : 'Draft updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Invalid JSON');
    }
  }, [draftEditorText, editingDraftId, locale]);

  const handleSaveManualDraft = useCallback(
    (nextDraft: NotebookProblemImportDraft) => {
      setDrafts((prev) =>
        prev.map((draft) => (draft.draftId === nextDraft.draftId ? nextDraft : draft)),
      );
      setEditingDraftId(nextDraft.draftId);
      setDraftEditorText(JSON.stringify(nextDraft, null, 2));
      toast.success(locale === 'zh-CN' ? '草稿表单已保存' : 'Draft form saved');
    },
    [locale],
  );

  const handleCommitImport = useCallback(async () => {
    if (!canEditProblems) {
      toast.error(
        locale === 'zh-CN' ? '只有课程作者可以编辑题目。' : 'Only the author can edit problems.',
      );
      return;
    }
    const selectedDrafts = drafts.filter((draft) => includedDraftIds[draft.draftId]);
    if (selectedDrafts.length === 0) {
      toast.error(locale === 'zh-CN' ? '请至少选择一条草稿' : 'Select at least one draft');
      return;
    }

    setCommitLoading(true);
    setImportProcessingStage('committing');
    setImportProcessingDetail(
      locale === 'zh-CN' ? '正在写入课程题库，并刷新列表…' : 'Committing to course problem bank…',
    );
    try {
      const nextProblems = await commitCourseProblemImport({
        courseId,
        drafts: selectedDrafts,
        importBatchId,
      });
      setProblems(nextProblems);
      setSelectedProblemId(nextProblems[0]?.id ?? null);
      setImportOpen(false);
      setImportText('');
      setImportFile(null);
      setImportWebQuery('');
      setImportBatchId(null);
      setDrafts([]);
      setImportProcessingStage('completed');
      setImportProcessingDetail(
        locale === 'zh-CN' ? '题目已经写入课程题库。' : 'Problems imported.',
      );
      toast.success(locale === 'zh-CN' ? '题目已写入课程题库' : 'Problems imported');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import commit failed');
      setImportProcessingStage('preview-ready');
    } finally {
      setCommitLoading(false);
    }
  }, [canEditProblems, courseId, drafts, importBatchId, includedDraftIds, locale]);

  const editingDraft = drafts.find((draft) => draft.draftId === editingDraftId) || null;
  const editingDraftIsManual =
    editingDraft?.sourceMeta &&
    typeof editingDraft.sourceMeta === 'object' &&
    (editingDraft.sourceMeta as Record<string, unknown>).importMode === 'manual_create';

  const handleSaveAssignment = useCallback(async () => {
    if (!selectedProblem || savingAssignment) return;
    if (!canEditProblems) {
      toast.error(
        locale === 'zh-CN' ? '只有课程作者可以编辑题目。' : 'Only the author can edit problems.',
      );
      return;
    }
    setSavingAssignment(true);
    try {
      const updated = await updateCourseProblem({
        courseId,
        problemId: selectedProblem.id,
        patch: {
          notebookId: moveNotebookId === '__unassigned__' ? null : moveNotebookId,
        },
      });
      setProblems((prev) => prev.map((problem) => (problem.id === updated.id ? updated : problem)));
      setMoveNotebookId(updated.notebookId ?? '__unassigned__');
      setMoveDialogOpen(false);
      toast.success(locale === 'zh-CN' ? '题目归属已更新' : 'Problem assignment updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Assignment update failed');
    } finally {
      setSavingAssignment(false);
    }
  }, [canEditProblems, courseId, locale, moveNotebookId, savingAssignment, selectedProblem]);

  const handleAddPhotoAnswerFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!selectedProblem) return;
      const problemId = selectedProblem.id;
      const existingCount = photoAnswers[problemId]?.length ?? 0;
      const remainingSlots = MAX_PHOTO_ANSWER_FILES - existingCount;
      if (remainingSlots <= 0) {
        toast.error(
          locale === 'zh-CN'
            ? `最多只能上传 ${MAX_PHOTO_ANSWER_FILES} 张照片。`
            : `You can upload up to ${MAX_PHOTO_ANSWER_FILES} photos.`,
        );
        return;
      }

      const incoming = Array.from(files);
      const imageFiles = incoming.filter((file) => file.type.startsWith('image/'));
      if (imageFiles.length === 0) {
        toast.error(locale === 'zh-CN' ? '请选择图片文件。' : 'Choose image files.');
        return;
      }

      const accepted = imageFiles
        .filter((file) => {
          if (file.size <= MAX_PHOTO_ANSWER_BYTES) return true;
          toast.error(
            locale === 'zh-CN'
              ? `${file.name} 超过 4 MB，已跳过。`
              : `${file.name} is larger than 4 MB and was skipped.`,
          );
          return false;
        })
        .slice(0, remainingSlots);

      if (imageFiles.length > accepted.length) {
        toast.error(
          locale === 'zh-CN'
            ? `已达到最多 ${MAX_PHOTO_ANSWER_FILES} 张照片的限制。`
            : `Only ${MAX_PHOTO_ANSWER_FILES} photos are allowed.`,
        );
      }
      if (accepted.length === 0) return;

      try {
        const nextPhotos = await Promise.all(
          accepted.map(async (file) => ({
            id: crypto.randomUUID(),
            name: file.name,
            mimeType: file.type || 'image/*',
            size: file.size,
            dataUrl: await readFileAsDataUrl(file),
          })),
        );
        setPhotoAnswers((prev) => ({
          ...prev,
          [problemId]: [...(prev[problemId] ?? []), ...nextPhotos].slice(0, MAX_PHOTO_ANSWER_FILES),
        }));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to read image');
      }
    },
    [locale, photoAnswers, selectedProblem],
  );

  const handleRemovePhotoAnswer = useCallback(
    (photoId: string) => {
      if (!selectedProblem) return;
      setPhotoAnswers((prev) => ({
        ...prev,
        [selectedProblem.id]: (prev[selectedProblem.id] ?? []).filter(
          (photo) => photo.id !== photoId,
        ),
      }));
    },
    [selectedProblem],
  );

  const handleUpdateProblem = useCallback(
    async (patch: {
      title?: string;
      status?: 'draft' | 'published' | 'archived';
      points?: number;
      tags?: string[];
      difficulty?: 'easy' | 'medium' | 'hard';
      publicContent?: unknown;
      grading?: unknown;
      secretJudge?: unknown | null;
    }) => {
      if (!selectedProblem) return;
      if (!canEditProblems) {
        throw new Error(
          locale === 'zh-CN' ? '只有课程作者可以编辑题目。' : 'Only the author can edit problems.',
        );
      }
      const updated = await updateCourseProblem({
        courseId,
        problemId: selectedProblem.id,
        patch,
      });
      setProblems((prev) => prev.map((problem) => (problem.id === updated.id ? updated : problem)));
      setSelectedProblemId(updated.id);
    },
    [canEditProblems, courseId, locale, selectedProblem],
  );

  const handleDeleteProblem = useCallback(async () => {
    if (!selectedProblem || deletingProblem) return;
    if (!canEditProblems) {
      toast.error(
        locale === 'zh-CN' ? '只有课程作者可以编辑题目。' : 'Only the author can edit problems.',
      );
      return;
    }
    const confirmed = window.confirm(
      locale === 'zh-CN'
        ? `确认删除题目「${selectedProblem.title}」吗？删除后不可恢复。`
        : `Delete "${selectedProblem.title}"? This cannot be undone.`,
    );
    if (!confirmed) return;

    setDeletingProblem(true);
    try {
      await deleteCourseProblem({
        courseId,
        problemId: selectedProblem.id,
      });
      setProblems((prev) => prev.filter((problem) => problem.id !== selectedProblem.id));
      setSelectedProblemId((current) => (current === selectedProblem.id ? null : current));
      toast.success(locale === 'zh-CN' ? '题目已删除' : 'Problem deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delete failed');
    } finally {
      setDeletingProblem(false);
    }
  }, [canEditProblems, courseId, deletingProblem, locale, selectedProblem]);

  const handleSubmitInlineAnswer = useCallback(async () => {
    if (!selectedProblem || submittingAnswer) return false;
    if (!selectedProblem.notebookId) {
      toast.error(
        locale === 'zh-CN'
          ? '请先为这道题设置归属章节并保存，才能作答。'
          : 'Assign this problem to a notebook and save before submitting.',
      );
      return false;
    }
    const photoMode = supportsPhotoAnswer(selectedProblem) && selectedAnswerMode === 'photo';
    const selectedPhotos = photoAnswers[selectedProblem.id] ?? [];
    if (photoMode && selectedPhotos.length === 0) {
      toast.error(locale === 'zh-CN' ? '请先上传照片答案。' : 'Upload a photo answer first.');
      return false;
    }
    const selectedChoiceOptionIds = choiceAnswers[selectedProblem.id] ?? [];
    if (selectedProblem.type === 'choice' && selectedChoiceOptionIds.length === 0) {
      toast.error(locale === 'zh-CN' ? '请先选择一个答案。' : 'Choose an answer first.');
      return false;
    }
    const immediateChoiceFeedback =
      selectedProblem.type === 'choice'
        ? buildChoiceAnswerFeedback(selectedProblem, selectedChoiceOptionIds, locale)
        : null;
    const selectedCodeAnswer =
      selectedProblem.type === 'code' && selectedProblemContent?.type === 'code'
        ? (codeAnswers[selectedProblem.id] ?? selectedProblemContent.starterCode ?? '')
        : '';
    if (selectedProblem.type === 'code' && !selectedCodeAnswer.trim()) {
      toast.error(locale === 'zh-CN' ? '请先填写代码。' : 'Code is required.');
      return false;
    }
    if (immediateChoiceFeedback) {
      setAnswerFeedbackByProblemId((prev) => ({
        ...prev,
        [selectedProblem.id]: immediateChoiceFeedback,
      }));
    }
    setSubmittingAnswer(true);
    try {
      const payload =
        selectedProblem.type === 'choice'
          ? { selectedOptionIds: selectedChoiceOptionIds }
          : selectedProblem.type === 'fill_blank'
            ? { blanks: blankAnswers[selectedProblem.id] ?? {} }
            : selectedProblem.type === 'code'
              ? { code: selectedCodeAnswer }
              : photoMode
                ? { images: selectedPhotos }
                : { text: textAnswers[selectedProblem.id] ?? '' };
      const { attempt, result } = await submitNotebookProblem({
        notebookId: selectedProblem.notebookId,
        problemId: selectedProblem.id,
        language: locale,
        ...payload,
      });
      if (selectedProblem.type === 'code') {
        setCodeAnswers((prev) => ({
          ...prev,
          [selectedProblem.id]: selectedCodeAnswer,
        }));
      }
      setProblems((prev) =>
        prev.map((problem) =>
          problem.id === selectedProblem.id
            ? {
                ...problem,
                latestAttempt: latestAttemptFromRecord(attempt),
              }
            : problem,
        ),
      );
      setAttemptsByProblemId((prev) => ({
        ...prev,
        [selectedProblem.id]: [
          attempt,
          ...(prev[selectedProblem.id] ?? []).filter((item) => item.id !== attempt.id),
        ],
      }));
      const feedback =
        result?.feedback ||
        immediateChoiceFeedback?.feedback ||
        (locale === 'zh-CN' ? '答案已提交。' : 'Answer submitted.');
      const score = attempt.score ?? immediateChoiceFeedback?.score ?? null;
      setAnswerFeedbackByProblemId((prev) => ({
        ...prev,
        [selectedProblem.id]: {
          status: attempt.status,
          score,
          feedback,
          correctOptionIds: immediateChoiceFeedback?.correctOptionIds,
          selectedOptionIds: immediateChoiceFeedback?.selectedOptionIds,
          saving: false,
        },
      }));
      setAnswerPanelTab('history');
      onPracticeAttemptResolved?.({
        problemId: selectedProblem.id,
        status: attempt.status,
        score,
        feedback,
      });
      return true;
    } catch (error) {
      setAnswerFeedbackByProblemId((prev) => ({
        ...prev,
        [selectedProblem.id]: {
          status: 'error',
          score: null,
          feedback:
            locale === 'zh-CN'
              ? '答案没有保存成功，请再试一次。'
              : 'The answer was not saved. Please try again.',
          correctOptionIds: immediateChoiceFeedback?.correctOptionIds,
          selectedOptionIds: immediateChoiceFeedback?.selectedOptionIds,
          saving: false,
        },
      }));
      toast.error(error instanceof Error ? error.message : 'Submit failed');
      return false;
    } finally {
      setSubmittingAnswer(false);
    }
  }, [
    blankAnswers,
    choiceAnswers,
    codeAnswers,
    locale,
    photoAnswers,
    selectedProblem,
    selectedProblemContent,
    selectedAnswerMode,
    onPracticeAttemptResolved,
    submittingAnswer,
    textAnswers,
  ]);

  const handleRunCodeAnswer = useCallback(
    async (target: CourseCodeRunTarget = 'public') => {
      if (!selectedProblem || runningCode) return false;
      if (selectedProblem.type !== 'code' || selectedProblemContent?.type !== 'code') return false;
      if (!selectedProblem.notebookId) {
        toast.error(
          locale === 'zh-CN'
            ? '请先为这道题设置归属章节并保存，才能运行代码。'
            : 'Assign this problem to a notebook and save before running code.',
        );
        return false;
      }
      if (target === 'secret' && (selectedProblem.secretJudge?.secretTests?.length ?? 0) === 0) {
        toast.error(locale === 'zh-CN' ? '暂无隐藏测试。' : 'No secret tests available.');
        return false;
      }

      const selectedCodeAnswer =
        codeAnswers[selectedProblem.id] ?? selectedProblemContent.starterCode ?? '';
      if (!selectedCodeAnswer.trim()) {
        toast.error(locale === 'zh-CN' ? '请先填写代码。' : 'Code is required.');
        return false;
      }

      setRunningCode(true);
      setRunningCodeTarget(target);
      try {
        const { attempt, result } = await runNotebookCodeProblem({
          notebookId: selectedProblem.notebookId,
          problemId: selectedProblem.id,
          code: selectedCodeAnswer,
          target,
          language: locale,
        });
        setCodeAnswers((prev) => ({
          ...prev,
          [selectedProblem.id]: selectedCodeAnswer,
        }));
        setCodeRunResults((prev) => ({
          ...prev,
          [selectedProblem.id]: {
            attempt,
            code: selectedCodeAnswer,
            target,
            ranAt: Date.now(),
          },
        }));
        setProblems((prev) =>
          prev.map((problem) =>
            problem.id === selectedProblem.id
              ? {
                  ...problem,
                  latestAttempt: latestAttemptFromRecord(attempt),
                }
              : problem,
          ),
        );
        setAttemptsByProblemId((prev) => ({
          ...prev,
          [selectedProblem.id]: [
            attempt,
            ...(prev[selectedProblem.id] ?? []).filter((item) => item.id !== attempt.id),
          ],
        }));

        if (target === 'code') {
          if (attempt.status === 'passed') {
            toast.success(locale === 'zh-CN' ? '代码运行完成' : 'Code ran successfully');
          } else {
            toast.error(
              result?.error ||
                result?.feedback ||
                (locale === 'zh-CN' ? '代码运行出错' : 'Code failed'),
            );
          }
        } else if (attempt.status === 'passed') {
          toast.success(
            target === 'secret'
              ? locale === 'zh-CN'
                ? '隐藏测试全部通过'
                : 'All secret tests passed'
              : locale === 'zh-CN'
                ? '公开测试全部通过'
                : 'All public tests passed',
          );
        } else {
          toast.error(
            (locale === 'zh-CN'
              ? result?.feedback
                  ?.replaceAll('Public tests', '公开测试')
                  .replaceAll('Secret tests', '隐藏测试')
              : result?.feedback) ||
              (target === 'secret'
                ? locale === 'zh-CN'
                  ? '隐藏测试未全部通过'
                  : 'Secret tests failed'
                : locale === 'zh-CN'
                  ? '公开测试未全部通过'
                  : 'Public tests failed'),
          );
        }
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Run failed';
        setCodeRunResults((prev) => ({
          ...prev,
          [selectedProblem.id]: {
            error: message,
            code: selectedCodeAnswer,
            target,
            ranAt: Date.now(),
          },
        }));
        toast.error(message);
        return true;
      } finally {
        setRunningCode(false);
        setRunningCodeTarget(null);
      }
    },
    [codeAnswers, locale, runningCode, selectedProblem, selectedProblemContent],
  );

  return {
    activeBankFilterCount,
    answerPanelTab,
    bankStats,
    blankAnswers,
    canEditProblems,
    choiceAnswers,
    codeAnswers,
    codeRunResults,
    commitLoading,
    courseAccessRole,
    courseHasTranslations,
    courseId,
    courseName,
    currentNotebookProblemPosition,
    currentProblemPage,
    deletingProblem,
    difficultyFilter,
    difficultyFilterOptions,
    draftEditorText,
    drafts,
    editingDraft,
    editingDraftIsManual,
    filteredProblems,
    handleAddPhotoAnswerFiles,
    handleCommitImport,
    handleDeleteProblem,
    handleEditingDraftChange,
    handlePreviewImport,
    handleProblemInfoTabChange,
    handleRemovePhotoAnswer,
    handleRunCodeAnswer,
    handleSaveAssignment,
    handleSaveDraftEditor,
    handleSaveManualDraft,
    handleSubmitInlineAnswer,
    handleUpdateProblem,
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
    notebookOptions,
    notebooks,
    pageEndIndex,
    pageStartIndex,
    paginatedProblems,
    photoAnswers,
    practiceFilter,
    practiceFilterOptions,
    previewLoading,
    previousPracticeIsChapterJump,
    previousPracticeTarget,
    problemInfoTab,
    problemLanguage,
    problemPageCount,
    problems,
    router,
    runningCode,
    runningCodeTarget,
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
    selectedProblemNotebook,
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
    setDraftEditorText,
    setDrafts,
    setEditingDraftId,
    setImportFile,
    setImportMode,
    setImportOpen,
    setImportText,
    setImportWebQuery,
    setIncludedDraftIds,
    setMoveDialogOpen,
    setMoveNotebookId,
    setNotebookFilter,
    setPracticeFilter,
    setProblemLanguage,
    setProblemPage,
    setSelectedProblemId,
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
    webSearchProviderId,
    webSearchProvidersConfig,
  };
}

export type CourseProblemBankController = ReturnType<typeof useCourseProblemBankController>;
