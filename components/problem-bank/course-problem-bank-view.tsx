'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRightLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  FileUp,
  Globe2,
  Loader2,
  Pencil,
  Save,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { parsePdfForGeneration } from '@/lib/pdf/parse-for-generation';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import {
  notebookProblemImportDraftSchema,
  type NotebookProblemImportDraft,
} from '@/lib/problem-bank';
import {
  commitCourseProblemImport,
  deleteCourseProblem,
  listCourseProblems,
  previewCourseProblemImport,
  submitNotebookProblem,
  updateCourseProblem,
  type NotebookProblemClientRecord,
} from '@/lib/utils/notebook-problem-api';
import { listStagesByCourse, type StageListItem } from '@/lib/utils/stage-storage';
import { getCourse } from '@/lib/utils/course-storage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { CommonMathSymbols } from '@/components/problem-bank/common-math-symbols';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type ImportProcessingStage =
  | 'idle'
  | 'parsing'
  | 'searching'
  | 'extracting'
  | 'validating'
  | 'preview-ready'
  | 'committing'
  | 'completed';

function typeLabel(type: NotebookProblemClientRecord['type'], locale: 'zh-CN' | 'en-US') {
  const zh = {
    short_answer: '简答题',
    choice: '选择题',
    proof: '证明题',
    calculation: '计算题',
    code: '代码题',
    fill_blank: '填空题',
  } as const;
  const en = {
    short_answer: 'Short answer',
    choice: 'Choice',
    proof: 'Proof',
    calculation: 'Calculation',
    code: 'Code',
    fill_blank: 'Fill blank',
  } as const;
  return locale === 'zh-CN' ? zh[type] : en[type];
}

function statusLabel(status: NotebookProblemClientRecord['status'], locale: 'zh-CN' | 'en-US') {
  const zh = { draft: '草稿', published: '已发布', archived: '已归档' } as const;
  const en = { draft: 'Draft', published: 'Published', archived: 'Archived' } as const;
  return locale === 'zh-CN' ? zh[status] : en[status];
}

function difficultyLabel(
  difficulty: NotebookProblemClientRecord['difficulty'],
  locale: 'zh-CN' | 'en-US',
) {
  const zh = { easy: '简单', medium: '中等', hard: '困难' } as const;
  const en = { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as const;
  return locale === 'zh-CN' ? zh[difficulty] : en[difficulty];
}

function sourceLabel(source: NotebookProblemClientRecord['source'], locale: 'zh-CN' | 'en-US') {
  const zh = {
    chat: '聊天导入',
    pdf: 'PDF 导入',
    manual: '手动录入',
    web: '联网导入',
    legacy_quiz_scene: '历史测验页',
  } as const;
  const en = {
    chat: 'Chat',
    pdf: 'PDF',
    manual: 'Manual',
    web: 'Web',
    legacy_quiz_scene: 'Legacy quiz',
  } as const;
  return locale === 'zh-CN' ? zh[source] : en[source];
}

function estimateProblemCountFromText(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const blocks = trimmed
    .split(
      /\n(?=(?:\d+[\.\)]\s+|Q\d+[:.]|Question\s+\d+|题目\s*\d+|题\s*\d+[：:]|选择题|证明题|代码题|填空题|简答题|计算题))/,
    )
    .map((block) => block.trim())
    .filter(Boolean);
  return Math.max(1, blocks.length);
}

function formatDraftValidationErrors(input: unknown): string[] {
  const parsed = notebookProblemImportDraftSchema.safeParse(input);
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'draft';
    if (issue.message === 'Invalid input') {
      return `字段 ${path} 结构不符合当前题型 schema`;
    }
    return `字段 ${path}: ${issue.message}`;
  });
}

function renderProblemStem(problem: NotebookProblemClientRecord): string {
  const content = problem.publicContent;
  if ('stem' in content) return content.stem;
  if ('stemTemplate' in content) return content.stemTemplate;
  return '';
}

function buildEditableProblemPayload(problem: NotebookProblemClientRecord) {
  return {
    title: problem.title,
    status: problem.status,
    points: problem.points,
    tags: problem.tags,
    difficulty: problem.difficulty,
    publicContent: problem.publicContent,
    grading: problem.grading,
  };
}

export function CourseProblemBankView({
  courseId,
  initialNotebookId,
}: {
  courseId: string;
  initialNotebookId?: string;
}) {
  const router = useRouter();
  const { locale } = useI18n();
  const pdfProviderId = useSettingsStore((state) => state.pdfProviderId);
  const pdfProvidersConfig = useSettingsStore((state) => state.pdfProvidersConfig);
  const webSearchProviderId = useSettingsStore((state) => state.webSearchProviderId);
  const webSearchProvidersConfig = useSettingsStore((state) => state.webSearchProvidersConfig);

  const [courseName, setCourseName] = useState('');
  const [notebooks, setNotebooks] = useState<StageListItem[]>([]);
  const [problems, setProblems] = useState<NotebookProblemClientRecord[]>([]);
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveNotebookId, setMoveNotebookId] = useState<string>('__unassigned__');
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [deletingProblem, setDeletingProblem] = useState(false);
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>({});
  const [choiceAnswers, setChoiceAnswers] = useState<Record<string, string[]>>({});
  const [blankAnswers, setBlankAnswers] = useState<Record<string, Record<string, string>>>({});
  const [codeAnswers, setCodeAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<'all' | NotebookProblemClientRecord['type']>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | NotebookProblemClientRecord['status']>(
    'all',
  );
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [editProblemOpen, setEditProblemOpen] = useState(false);
  const [editProblemText, setEditProblemText] = useState('');
  const [savingProblemEdit, setSavingProblemEdit] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<'text' | 'pdf' | 'web'>('text');
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
  const [previewNotebookOptions, setPreviewNotebookOptions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const textAnswerInputRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

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
      setNotebooks(courseNotebooks);
      setProblems(courseProblems);
      const preferred =
        courseProblems.find((problem) =>
          initialNotebookId ? problem.notebookId === initialNotebookId : true,
        )?.id ??
        courseProblems[0]?.id ??
        null;
      setSelectedProblemId((current) => current ?? preferred);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load course problems');
    } finally {
      setLoading(false);
    }
  }, [courseId, initialNotebookId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const filteredProblems = useMemo(
    () =>
      problems.filter((problem) => {
        if (typeFilter !== 'all' && problem.type !== typeFilter) return false;
        if (statusFilter !== 'all' && problem.status !== statusFilter) return false;
        if (initialNotebookId && problem.notebookId !== initialNotebookId) return false;
        return true;
      }),
    [initialNotebookId, problems, statusFilter, typeFilter],
  );

  const groupedProblems = useMemo(() => {
    const notebookById = new Map(notebooks.map((notebook) => [notebook.id, notebook]));
    const groups = new Map<string, { label: string; items: NotebookProblemClientRecord[] }>();
    for (const problem of filteredProblems) {
      const key = problem.notebookId || '__unassigned__';
      const label = problem.notebookName || (locale === 'zh-CN' ? '未归类题目' : 'Unassigned');
      const current = groups.get(key) ?? { label, items: [] };
      current.items.push(problem);
      groups.set(key, current);
    }
    return Array.from(groups.entries()).map(([key, value]) => ({
      key,
      label: value.label,
      avatarUrl: key === '__unassigned__' ? null : (notebookById.get(key)?.avatarUrl ?? null),
      items: value.items,
    }));
  }, [filteredProblems, locale, notebooks]);

  const selectedProblem =
    filteredProblems.find((problem) => problem.id === selectedProblemId) ||
    problems.find((problem) => problem.id === selectedProblemId) ||
    null;

  useEffect(() => {
    setMoveNotebookId(selectedProblem?.notebookId || '__unassigned__');
  }, [selectedProblem?.id, selectedProblem?.notebookId]);

  const notebookOptions = useMemo(
    () =>
      previewNotebookOptions.length > 0
        ? previewNotebookOptions
        : notebooks.map((notebook) => ({ id: notebook.id, name: notebook.name })),
    [notebooks, previewNotebookOptions],
  );

  const handlePreviewImport = useCallback(async () => {
    setPreviewLoading(true);
    setImportSummaryNote(null);
    setImportUsage(null);
    setImportWebSearchSummary(null);
    try {
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
        language: locale,
      });

      setPreviewNotebookOptions(previewResult.notebooks);
      setImportUsage(previewResult.usage);
      setImportWebSearchSummary(previewResult.webSearch);
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
    } finally {
      setPreviewLoading(false);
    }
  }, [
    courseId,
    importFile,
    importMode,
    importText,
    importWebQuery,
    locale,
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

  const handleCommitImport = useCallback(async () => {
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
      });
      setProblems(nextProblems);
      setSelectedProblemId(nextProblems[0]?.id ?? null);
      setImportOpen(false);
      setImportText('');
      setImportFile(null);
      setImportWebQuery('');
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
  }, [courseId, drafts, includedDraftIds, locale]);

  const handleSaveAssignment = useCallback(async () => {
    if (!selectedProblem || savingAssignment) return;
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
  }, [courseId, locale, moveNotebookId, savingAssignment, selectedProblem]);

  const openEditProblemDialog = useCallback(() => {
    if (!selectedProblem) return;
    setEditProblemText(JSON.stringify(buildEditableProblemPayload(selectedProblem), null, 2));
    setEditProblemOpen(true);
  }, [selectedProblem]);

  const handleSaveProblemEdit = useCallback(async () => {
    if (!selectedProblem || savingProblemEdit) return;

    let parsed: Record<string, unknown>;
    try {
      const raw = JSON.parse(editProblemText) as unknown;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(locale === 'zh-CN' ? 'JSON 必须是对象。' : 'JSON must be an object.');
      }
      parsed = raw as Record<string, unknown>;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Invalid JSON');
      return;
    }

    try {
      const title = parsed.title;
      const status = parsed.status;
      const points = parsed.points;
      const tags = parsed.tags;
      const difficulty = parsed.difficulty;
      const publicContent = parsed.publicContent;
      const grading = parsed.grading;

      if (typeof title !== 'string' || !title.trim()) {
        throw new Error(locale === 'zh-CN' ? 'title 必须是非空字符串。' : 'title must be a non-empty string.');
      }
      if (!['draft', 'published', 'archived'].includes(String(status))) {
        throw new Error(
          locale === 'zh-CN'
            ? 'status 仅支持 draft / published / archived。'
            : 'status must be draft / published / archived.',
        );
      }
      if (typeof points !== 'number' || !Number.isFinite(points)) {
        throw new Error(locale === 'zh-CN' ? 'points 必须是数字。' : 'points must be a number.');
      }
      if (!['easy', 'medium', 'hard'].includes(String(difficulty))) {
        throw new Error(
          locale === 'zh-CN'
            ? 'difficulty 仅支持 easy / medium / hard。'
            : 'difficulty must be easy / medium / hard.',
        );
      }
      if (!Array.isArray(tags) || tags.some((item) => typeof item !== 'string')) {
        throw new Error(locale === 'zh-CN' ? 'tags 必须是字符串数组。' : 'tags must be a string array.');
      }
      if (!publicContent || typeof publicContent !== 'object') {
        throw new Error(
          locale === 'zh-CN' ? 'publicContent 必须是对象。' : 'publicContent must be an object.',
        );
      }
      if (!grading || typeof grading !== 'object') {
        throw new Error(locale === 'zh-CN' ? 'grading 必须是对象。' : 'grading must be an object.');
      }

      setSavingProblemEdit(true);
      const updated = await updateCourseProblem({
        courseId,
        problemId: selectedProblem.id,
        patch: {
          title,
          status: status as NotebookProblemClientRecord['status'],
          points,
          tags: tags as string[],
          difficulty: difficulty as NotebookProblemClientRecord['difficulty'],
          publicContent,
          grading,
        },
      });
      setProblems((prev) => prev.map((problem) => (problem.id === updated.id ? updated : problem)));
      setSelectedProblemId(updated.id);
      setEditProblemOpen(false);
      toast.success(locale === 'zh-CN' ? '题目已更新' : 'Problem updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Update failed');
    } finally {
      setSavingProblemEdit(false);
    }
  }, [courseId, editProblemText, locale, savingProblemEdit, selectedProblem]);

  const handleDeleteProblem = useCallback(async () => {
    if (!selectedProblem || deletingProblem) return;
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
  }, [courseId, deletingProblem, locale, selectedProblem]);

  const handleSubmitInlineAnswer = useCallback(async () => {
    if (!selectedProblem || submittingAnswer) return;
    if (!selectedProblem.notebookId) {
      toast.error(
        locale === 'zh-CN'
          ? '请先为这道题设置归属章节并保存，才能作答。'
          : 'Assign this problem to a notebook and save before submitting.',
      );
      return;
    }
    setSubmittingAnswer(true);
    try {
      const payload =
        selectedProblem.type === 'choice'
          ? { selectedOptionIds: choiceAnswers[selectedProblem.id] ?? [] }
          : selectedProblem.type === 'fill_blank'
            ? { blanks: blankAnswers[selectedProblem.id] ?? {} }
            : selectedProblem.type === 'code'
              ? { code: codeAnswers[selectedProblem.id] ?? '' }
              : { text: textAnswers[selectedProblem.id] ?? '' };
      await submitNotebookProblem({
        notebookId: selectedProblem.notebookId,
        problemId: selectedProblem.id,
        language: locale,
        ...payload,
      });
      await loadAll();
      setSelectedProblemId(selectedProblem.id);
      toast.success(locale === 'zh-CN' ? '已提交答案' : 'Answer submitted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Submit failed');
    } finally {
      setSubmittingAnswer(false);
    }
  }, [
    blankAnswers,
    choiceAnswers,
    codeAnswers,
    loadAll,
    locale,
    selectedProblem,
    submittingAnswer,
    textAnswers,
  ]);

  const insertSymbolIntoTextAnswer = useCallback(
    (problemId: string, symbol: string) => {
      const textarea = textAnswerInputRefs.current[problemId];
      if (!textarea) {
        setTextAnswers((prev) => ({
          ...prev,
          [problemId]: `${prev[problemId] || ''}${symbol}`,
        }));
        return;
      }

      const start = textarea.selectionStart ?? textarea.value.length;
      const end = textarea.selectionEnd ?? textarea.value.length;
      const currentValue = textAnswers[problemId] || '';
      const nextValue = `${currentValue.slice(0, start)}${symbol}${currentValue.slice(end)}`;
      setTextAnswers((prev) => ({
        ...prev,
        [problemId]: nextValue,
      }));
      requestAnimationFrame(() => {
        textarea.focus();
        const nextCursor = start + symbol.length;
        textarea.setSelectionRange(nextCursor, nextCursor);
      });
    },
    [textAnswers],
  );

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-7xl gap-4 p-4">
      <div className="order-2 flex h-full w-[380px] shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/90 dark:border-slate-800 dark:bg-slate-950/50">
        <div className="border-b border-slate-200 px-4 py-4 dark:border-slate-800">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {courseName || (locale === 'zh-CN' ? '课程题库' : 'Course problem bank')}
              </h1>
            </div>
            <Button size="sm" className="gap-2" onClick={() => setImportOpen(true)}>
              <FileUp className="h-4 w-4" />
              {locale === 'zh-CN' ? '导入题目' : 'Import'}
            </Button>
          </div>
          <div className="mt-3 flex gap-2">
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}
              className="h-9 flex-1 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="all">{locale === 'zh-CN' ? '全部题型' : 'All types'}</option>
              <option value="short_answer">{typeLabel('short_answer', locale)}</option>
              <option value="choice">{typeLabel('choice', locale)}</option>
              <option value="proof">{typeLabel('proof', locale)}</option>
              <option value="calculation">{typeLabel('calculation', locale)}</option>
              <option value="fill_blank">{typeLabel('fill_blank', locale)}</option>
              <option value="code">{typeLabel('code', locale)}</option>
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="all">{locale === 'zh-CN' ? '全部状态' : 'All status'}</option>
              <option value="draft">{statusLabel('draft', locale)}</option>
              <option value="published">{statusLabel('published', locale)}</option>
              <option value="archived">{statusLabel('archived', locale)}</option>
            </select>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {locale === 'zh-CN' ? '正在加载课程题库...' : 'Loading course problem bank...'}
            </div>
          ) : groupedProblems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
              {locale === 'zh-CN' ? '当前没有题目。' : 'No problems yet.'}
            </div>
          ) : (
            <div className="space-y-4">
              {groupedProblems.map((group) => {
                const isCollapsed = collapsedGroups[group.key] !== false;
                return (
                <div key={group.key}>
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsedGroups((prev) => ({
                        ...prev,
                        [group.key]: !isCollapsed,
                      }))
                    }
                    className="mb-2 flex w-full items-center justify-between rounded-md px-1 py-0.5 text-left hover:bg-slate-100/80 dark:hover:bg-slate-800/40"
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      {isCollapsed ? (
                        <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                      )}
                      {group.avatarUrl ? (
                        <img
                          src={group.avatarUrl}
                          alt=""
                          className="size-4 rounded-full object-cover ring-1 ring-black/5 dark:ring-white/10"
                        />
                      ) : (
                        <span className="inline-flex size-4 items-center justify-center rounded-full bg-slate-200 text-[9px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                          {group.label.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {group.label}
                      </p>
                    </div>
                    <span className="text-[11px] text-slate-400">{group.items.length}</span>
                  </button>
                  {!isCollapsed ? (
                    <div className="space-y-2">
                      {group.items.map((problem) => (
                        <button
                          key={problem.id}
                          type="button"
                          onClick={() => setSelectedProblemId(problem.id)}
                          className={`w-full rounded-xl border p-3 text-left transition-colors ${
                            selectedProblemId === problem.id
                              ? 'border-sky-300 bg-sky-50 dark:border-sky-700 dark:bg-sky-950/30'
                              : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-slate-700'
                          }`}
                        >
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {problem.title}
                          </p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {typeLabel(problem.type, locale)} ·{' '}
                            {difficultyLabel(problem.difficulty, locale)} ·{' '}
                            {sourceLabel(problem.source, locale)}
                          </p>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="order-1 min-h-0 min-w-0 flex-1">
        {!selectedProblem ? (
          <div className="flex h-full items-center justify-center rounded-2xl border border-slate-200 bg-white/80 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
            {locale === 'zh-CN' ? '请选择一道题查看详情。' : 'Select a problem to inspect.'}
          </div>
        ) : (
          <>
            <Card className="h-full">
            <CardHeader className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="line-clamp-1 text-xl" title={selectedProblem.title}>
                    {selectedProblem.title}
                  </CardTitle>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="outline">
                      {locale === 'zh-CN'
                        ? `归属：${selectedProblem.notebookName || '未归类题目'}`
                        : `Notebook: ${selectedProblem.notebookName || 'Unassigned'}`}
                    </Badge>
                    <Badge variant="secondary">{typeLabel(selectedProblem.type, locale)}</Badge>
                    <Badge variant="secondary">{difficultyLabel(selectedProblem.difficulty, locale)}</Badge>
                    <Badge variant="secondary">{statusLabel(selectedProblem.status, locale)}</Badge>
                    <Badge variant="secondary">{sourceLabel(selectedProblem.source, locale)}</Badge>
                    <Badge variant="secondary">
                      {selectedProblem.points} {locale === 'zh-CN' ? '分' : 'pts'}
                    </Badge>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={locale === 'zh-CN' ? '更多操作' : 'More actions'}
                    >
                      <Ellipsis className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={openEditProblemDialog}>
                      <Pencil className="h-4 w-4" />
                      {locale === 'zh-CN' ? '编辑题目' : 'Edit problem'}
                    </DropdownMenuItem>
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
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col space-y-4 overflow-y-auto">
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm leading-7 text-slate-700 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-200">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {locale === 'zh-CN' ? '题目描述' : 'Problem statement'}
                </p>
                <p>
                  {renderProblemStem(selectedProblem) ||
                    (locale === 'zh-CN' ? '暂无题面。' : 'No stem available.')}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950/40">
                {selectedProblem.type === 'choice' &&
                selectedProblem.publicContent.type === 'choice' ? (
                  <div className="space-y-2">
                    {selectedProblem.publicContent.options.map((option) => {
                      const selected = choiceAnswers[selectedProblem.id] ?? [];
                      const multi = selectedProblem.publicContent.selectionMode === 'multiple';
                      return (
                        <label
                          key={option.id}
                          className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
                        >
                          <input
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
                                return { ...prev, [selectedProblem.id]: Array.from(new Set(next)) };
                              });
                            }}
                          />
                          <span>
                            <span className="font-medium">{option.id}.</span> {option.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : selectedProblem.type === 'fill_blank' &&
                  selectedProblem.publicContent.type === 'fill_blank' ? (
                  <div className="space-y-2">
                    {selectedProblem.publicContent.blanks.map((blank) => (
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
                  selectedProblem.publicContent.type === 'code' ? (
                  <Textarea
                    className="min-h-[220px] font-mono text-xs"
                    value={
                      codeAnswers[selectedProblem.id] ??
                      selectedProblem.publicContent.starterCode ??
                      ''
                    }
                    onChange={(event) =>
                      setCodeAnswers((prev) => ({
                        ...prev,
                        [selectedProblem.id]: event.target.value,
                      }))
                    }
                    placeholder={
                      locale === 'zh-CN' ? '在这里编写代码并提交。' : 'Write code here and submit.'
                    }
                  />
                ) : (
                  <div className="space-y-3">
                    {selectedProblem.type === 'short_answer' ||
                    selectedProblem.type === 'proof' ||
                    selectedProblem.type === 'calculation' ? (
                      <CommonMathSymbols
                        locale={locale}
                        onInsert={(symbol) => insertSymbolIntoTextAnswer(selectedProblem.id, symbol)}
                      />
                    ) : null}
                    <Textarea
                      className="min-h-[140px]"
                      value={textAnswers[selectedProblem.id] ?? ''}
                      onChange={(event) =>
                        setTextAnswers((prev) => ({
                          ...prev,
                          [selectedProblem.id]: event.target.value,
                        }))
                      }
                      ref={(node) => {
                        textAnswerInputRefs.current[selectedProblem.id] = node;
                      }}
                      placeholder={
                        locale === 'zh-CN' ? '在这里输入你的答案。' : 'Type your answer here.'
                      }
                    />
                  </div>
                )}
                <div className="mt-3">
                  <Button onClick={handleSubmitInlineAnswer} disabled={submittingAnswer}>
                    {submittingAnswer ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    {locale === 'zh-CN' ? '提交答案' : 'Submit answer'}
                  </Button>
                </div>
              </div>
            </CardContent>
            </Card>

            <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>{locale === 'zh-CN' ? '移动题目归属' : 'Move problem'}</DialogTitle>
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
                    <Button onClick={handleSaveAssignment} disabled={savingAssignment}>
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

            <Dialog open={editProblemOpen} onOpenChange={setEditProblemOpen}>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>{locale === 'zh-CN' ? '编辑题目' : 'Edit problem'}</DialogTitle>
                  <DialogDescription>
                    {locale === 'zh-CN'
                      ? '可编辑 title/status/points/tags/difficulty/publicContent/grading。'
                      : 'Edit title/status/points/tags/difficulty/publicContent/grading.'}
                  </DialogDescription>
                </DialogHeader>
                <Textarea
                  className="min-h-[380px] font-mono text-xs"
                  value={editProblemText}
                  onChange={(event) => setEditProblemText(event.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setEditProblemOpen(false)}>
                    {locale === 'zh-CN' ? '取消' : 'Cancel'}
                  </Button>
                  <Button onClick={handleSaveProblemEdit} disabled={savingProblemEdit}>
                    {savingProblemEdit ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    {locale === 'zh-CN' ? '保存' : 'Save'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto">
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

          <div className="flex gap-2">
            <Button
              type="button"
              variant={importMode === 'text' ? 'default' : 'outline'}
              onClick={() => setImportMode('text')}
            >
              {locale === 'zh-CN' ? '文本' : 'Text'}
            </Button>
            <Button
              type="button"
              variant={importMode === 'pdf' ? 'default' : 'outline'}
              onClick={() => setImportMode('pdf')}
            >
              PDF
            </Button>
            <Button
              type="button"
              variant={importMode === 'web' ? 'default' : 'outline'}
              onClick={() => setImportMode('web')}
            >
              <Globe2 className="mr-2 h-4 w-4" />
              {locale === 'zh-CN' ? '联网搜索' : 'Web search'}
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
          ) : (
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
          )}

          <div className="flex justify-end">
            <Button onClick={handlePreviewImport} disabled={previewLoading || commitLoading}>
              {previewLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileUp className="mr-2 h-4 w-4" />
              )}
              {locale === 'zh-CN' ? '生成预览' : 'Preview import'}
            </Button>
          </div>

          {importProcessingStage !== 'idle' ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/60">
              <div className="flex items-start gap-3">
                {(previewLoading || commitLoading) && importProcessingStage !== 'completed' ? (
                  <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-violet-600" />
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
                    <p className="mt-2 text-xs text-violet-700 dark:text-violet-200">
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
            <div className="rounded-xl border border-violet-200 bg-violet-50/80 px-4 py-3 text-sm text-violet-900 dark:border-violet-900/50 dark:bg-violet-950/20 dark:text-violet-100">
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
                    <div className="flex items-start justify-between gap-3">
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
                        onClick={() => {
                          setEditingDraftId(draft.draftId);
                          setDraftEditorText(JSON.stringify(draft, null, 2));
                        }}
                      >
                        {locale === 'zh-CN' ? '编辑 JSON' : 'Edit JSON'}
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
                    <Button type="button" onClick={handleSaveDraftEditor}>
                      <Save className="mr-2 h-4 w-4" />
                      {locale === 'zh-CN' ? '保存草稿' : 'Save draft'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {drafts.length > 0 ? (
            <div className="flex justify-end">
              <Button onClick={handleCommitImport} disabled={commitLoading}>
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
    </div>
  );
}
