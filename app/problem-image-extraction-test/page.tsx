'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileImage,
  ImagePlus,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { ProblemImageAssets, ProblemRichText } from '@/components/problem-bank/problem-rich-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getApiHeaders } from '@/lib/create/generation-headers';
import type { NotebookProblemImportDraft } from '@/lib/problem-bank';
import { backendJson } from '@/lib/utils/backend-api';
import { cn } from '@/lib/utils';
import { loadTestResult, saveTestResult } from '@/lib/utils/test-results';

const TEST_RESULT_ID = 'problem-image-extraction';
const TEST_RESULT_KEY = 'state-v2';

type CheckStatus = 'pass' | 'warn' | 'fail';

type SourceImage = {
  id: string;
  pageNumber: number;
  src?: string;
  width?: number;
  height?: number;
  description?: string;
};

type SourcePackage = {
  fileName: string;
  fileType: 'pdf' | 'pptx' | 'md' | 'txt' | 'unknown';
  sourceText: string;
  sourceImages: SourceImage[];
  pageCount: number;
  parser: string;
  warnings: string[];
  metadata: {
    sourceTextLength: number;
    imageCount: number;
    generatedAt: number;
  };
};

type QualityCheck = {
  id: string;
  title: string;
  status: CheckStatus;
  details: string[];
};

type ImageExtractionResult = {
  generatedAt: number;
  sourcePackage: SourcePackage;
  drafts: NotebookProblemImportDraft[];
  qualityReport: {
    passed: boolean;
    blockingIssueCount: number;
    warningIssueCount: number;
    summary: string;
    checks: QualityCheck[];
  };
};

type SavedState = {
  result: ImageExtractionResult | null;
  selectedDraftId: string | null;
};

function emptySavedState(): SavedState {
  return { result: null, selectedDraftId: null };
}

function formatTime(value: number | null | undefined): string {
  if (!value) return '尚未运行';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function draftStem(draft: NotebookProblemImportDraft): string {
  const content = draft.publicContent;
  if ('stem' in content) return content.stem;
  if ('stemTemplate' in content) return content.stemTemplate;
  return '';
}

function sourceMetaRecord(draft: NotebookProblemImportDraft): Record<string, unknown> {
  return draft.sourceMeta && typeof draft.sourceMeta === 'object'
    ? (draft.sourceMeta as Record<string, unknown>)
    : {};
}

function draftHasVisualSignal(draft: NotebookProblemImportDraft): boolean {
  if ((draft.publicContent.assets?.images || []).some((image) => image.src?.trim())) return true;
  const structure = sourceMetaRecord(draft).structure;
  if (structure && typeof structure === 'object' && !Array.isArray(structure)) {
    const visualRefs = (structure as { visualRefs?: unknown }).visualRefs;
    if (
      Array.isArray(visualRefs) &&
      visualRefs.some((ref) => typeof ref === 'string' && ref.trim())
    ) {
      return true;
    }
  }
  return /(?:graph|figure|diagram|plot|curve|chart|table|density|cdf|图|表|曲线|坐标)/i.test(
    draftStem(draft),
  );
}

function statusTone(status: CheckStatus): string {
  if (status === 'pass') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'warn') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-rose-200 bg-rose-50 text-rose-800';
}

function statusLabel(status: CheckStatus): string {
  if (status === 'pass') return '通过';
  if (status === 'warn') return '警告';
  return '未通过';
}

function buildGateChecks(result: ImageExtractionResult | null): QualityCheck[] {
  if (!result) return [];
  const draftImages = result.drafts.flatMap((draft) => draft.publicContent.assets?.images || []);
  const visualDrafts = result.drafts.filter(draftHasVisualSignal);
  const visualDraftsWithoutImages = visualDrafts.filter(
    (draft) => !(draft.publicContent.assets?.images || []).some((image) => image.src?.trim()),
  );
  const draftsWithValidationErrors = result.drafts.filter(
    (draft) => draft.validationErrors.length > 0,
  );
  const imagesWithoutProvenance = draftImages.filter(
    (image) => !image.sourceImageId || !image.pageNumber,
  );
  const unrenderableImages = draftImages.filter(
    (image) =>
      !image.src?.startsWith('data:image/') &&
      !image.src?.startsWith('/') &&
      !image.src?.startsWith('http'),
  );
  const jsonLikeDrafts = result.drafts.filter((draft) => {
    const stem = draftStem(draft).trim();
    return stem.startsWith('{') || stem.startsWith('[');
  });

  return [
    {
      id: 'source-package-image',
      title: 'Source Package 里有图',
      status: result.sourcePackage.sourceImages.some((image) => image.src?.trim())
        ? 'pass'
        : 'fail',
      details: [
        `sourceImages=${result.sourcePackage.sourceImages.length}`,
        `parser=${result.sourcePackage.parser}`,
      ],
    },
    {
      id: 'draft-schema',
      title: '图像题草稿可入库',
      status: result.drafts.length > 0 && draftsWithValidationErrors.length === 0 ? 'pass' : 'fail',
      details: [
        `drafts=${result.drafts.length}`,
        `validationErrors=${draftsWithValidationErrors.length}`,
      ],
    },
    {
      id: 'question-assets',
      title: '图像题绑定图片',
      status: visualDrafts.length > 0 && visualDraftsWithoutImages.length === 0 ? 'pass' : 'fail',
      details: visualDraftsWithoutImages.length
        ? [`图像题缺少附图：${visualDraftsWithoutImages.map((draft) => draft.title).join('、')}`]
        : [`visual drafts=${visualDrafts.length}`, `attached images=${draftImages.length}`],
    },
    {
      id: 'image-provenance',
      title: '图片来源可追踪',
      status: imagesWithoutProvenance.length === 0 ? 'pass' : 'fail',
      details: imagesWithoutProvenance.length
        ? [`缺少 sourceImageId/pageNumber：${imagesWithoutProvenance.length}`]
        : ['所有题目图片都有 sourceImageId 和 pageNumber。'],
    },
    {
      id: 'renderable-image',
      title: '前端可渲染图片',
      status: unrenderableImages.length === 0 ? 'pass' : 'fail',
      details: unrenderableImages.length
        ? [`不可直接渲染图片：${unrenderableImages.length}`]
        : ['所有 image src 都可直接用于前端渲染。'],
    },
    {
      id: 'normal-problem-ui',
      title: 'valid 时显示正常题目',
      status: jsonLikeDrafts.length === 0 ? 'pass' : 'fail',
      details: ['题干用 ProblemRichText 渲染，JSON 只留给 invalid/debug。'],
    },
  ];
}

async function readSavedState(signal?: AbortSignal): Promise<SavedState> {
  try {
    const row = await loadTestResult<SavedState>({
      testId: TEST_RESULT_ID,
      resultKey: TEST_RESULT_KEY,
      signal,
    });
    return row?.payload || emptySavedState();
  } catch {
    return emptySavedState();
  }
}

async function writeSavedState(state: SavedState): Promise<void> {
  await saveTestResult({
    testId: TEST_RESULT_ID,
    resultKey: TEST_RESULT_KEY,
    status: 'saved',
    title: '图像题提取测试',
    summary: {
      generatedCount: state.result?.drafts.length || 0,
      errorCount: state.result?.qualityReport.blockingIssueCount || 0,
      warningCount: state.result?.qualityReport.warningIssueCount || 0,
      lastUpdatedAt: state.result?.generatedAt || null,
      sourceImages: state.result?.sourcePackage.sourceImages.length || 0,
    },
    payload: state,
  });
}

function graphTestApiHeaders(): HeadersInit {
  const headers = new Headers(getApiHeaders({ imageGenerationEnabled: false }));
  headers.set('x-generation-test-no-charge', 'true');
  return headers;
}

export default function ProblemImageExtractionTestPage() {
  const [result, setResult] = useState<ImageExtractionResult | null>(null);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [running, setRunning] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'failed'>('idle');
  const [error, setError] = useState<string | null>(null);
  const autoRunRef = useRef(false);

  const selectedDraft = useMemo(() => {
    if (!result?.drafts.length) return null;
    return (
      result.drafts.find((draft) => draft.draftId === selectedDraftId) || result.drafts[0] || null
    );
  }, [result, selectedDraftId]);
  const selectedDraftIndex = useMemo(() => {
    if (!result?.drafts.length || !selectedDraft) return -1;
    return result.drafts.findIndex((draft) => draft.draftId === selectedDraft.draftId);
  }, [result, selectedDraft]);

  const gateChecks = useMemo(() => buildGateChecks(result), [result]);
  const failCount = gateChecks.filter((check) => check.status === 'fail').length;
  const warnCount = gateChecks.filter((check) => check.status === 'warn').length;

  const runTest = useCallback(async () => {
    setRunning(true);
    setError(null);
    setSaveState('idle');
    try {
      const nextResult = await backendJson<ImageExtractionResult>(
        '/api/problem-image-extraction-test',
        {
          method: 'POST',
          headers: graphTestApiHeaders(),
        },
      );
      const nextState: SavedState = {
        result: nextResult,
        selectedDraftId: nextResult.drafts[0]?.draftId || null,
      };
      setResult(nextResult);
      setSelectedDraftId(nextState.selectedDraftId);
      try {
        await writeSavedState(nextState);
        setSaveState('saved');
      } catch {
        setSaveState('failed');
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '图像题测试生成失败。');
    } finally {
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    readSavedState(controller.signal)
      .then((state) => {
        setResult(state.result);
        setSelectedDraftId(state.selectedDraftId || state.result?.drafts[0]?.draftId || null);
        if (!state.result && !autoRunRef.current) {
          autoRunRef.current = true;
          void runTest();
        }
      })
      .finally(() => setLoadingSaved(false));
    return () => controller.abort();
  }, [runTest]);

  const selectedSourceImage = useMemo(() => {
    const selectedAsset = selectedDraft?.publicContent.assets?.images?.[0] || null;
    if (selectedAsset?.sourceImageId) {
      return (
        result?.sourcePackage.sourceImages.find(
          (image) => image.id === selectedAsset.sourceImageId,
        ) || null
      );
    }
    if (selectedAsset?.pageNumber) {
      return (
        result?.sourcePackage.sourceImages.find(
          (image) => image.pageNumber === selectedAsset.pageNumber,
        ) || null
      );
    }
    return result?.sourcePackage.sourceImages.find((image) => image.src) || null;
  }, [result, selectedDraft]);

  const selectRelativeDraft = useCallback(
    (direction: -1 | 1) => {
      if (!result?.drafts.length) return;
      const currentIndex = selectedDraftIndex >= 0 ? selectedDraftIndex : 0;
      const nextIndex = (currentIndex + direction + result.drafts.length) % result.drafts.length;
      setSelectedDraftId(result.drafts[nextIndex]?.draftId || null);
    },
    [result, selectedDraftIndex],
  );

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-5 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <Button asChild variant="ghost" className="w-fit gap-2 px-0 text-slate-500">
              <Link href="/test?surface=problems">
                <ArrowLeft className="h-4 w-4" />
                返回测试中心
              </Link>
            </Button>
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">
                Problem image extraction test
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">图像题提取测试</h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
                读取 testfile/GraphTest 里的 MAT133 PDF，把这个 PDF 作为唯一输入交给正式 Direct LLM
                导题管线；题目边界、图像题判断、题面和图片绑定都由导题器生成。
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="bg-white">
              上次运行：{formatTime(result?.generatedAt)}
            </Badge>
            {saveState === 'saved' ? (
              <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">已保存</Badge>
            ) : null}
            {saveState === 'failed' ? (
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">结果未保存</Badge>
            ) : null}
            <Button onClick={runTest} disabled={running || loadingSaved} className="gap-2">
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              重新生成
            </Button>
          </div>
        </div>

        {error ? (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-800">
            <AlertTriangle className="mt-0.5 h-5 w-5" />
            <div>
              <p className="font-semibold">测试运行失败</p>
              <p className="mt-1 text-sm">{error}</p>
            </div>
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-4">
          {[
            {
              label: 'fail',
              value: failCount,
              tone: failCount ? 'text-rose-600' : 'text-slate-900',
            },
            {
              label: 'warn',
              value: warnCount,
              tone: warnCount ? 'text-amber-600' : 'text-slate-900',
            },
            {
              label: 'sourceImages',
              value: result?.sourcePackage.sourceImages.length || 0,
              tone: 'text-slate-900',
            },
            { label: 'drafts', value: result?.drafts.length || 0, tone: 'text-slate-900' },
          ].map((metric) => (
            <div
              key={metric.label}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {metric.label}
              </p>
              <p className={cn('mt-1 text-2xl font-semibold', metric.tone)}>{metric.value}</p>
            </div>
          ))}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Gate checks</h2>
              <p className="mt-1 text-sm text-slate-500">
                这个测试使用真实 PDF fixture，并调用正式 Direct LLM
                导题链路；开发环境下走测试免扣费请求头。
              </p>
            </div>
            <Badge
              className={cn(
                failCount
                  ? 'bg-rose-100 text-rose-800 hover:bg-rose-100'
                  : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
              )}
            >
              {failCount ? `${failCount} fail` : 'pass'}
            </Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {gateChecks.map((check) => (
              <div
                key={check.id}
                className={cn('rounded-2xl border px-4 py-3 text-sm', statusTone(check.status))}
              >
                <div className="flex items-center gap-2 font-semibold">
                  {check.status === 'pass' ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <AlertTriangle className="h-5 w-5" />
                  )}
                  {check.title}
                  <span className="ml-auto text-xs">{statusLabel(check.status)}</span>
                </div>
                <p className="mt-2 leading-6 opacity-80">{check.details.join(' · ')}</p>
              </div>
            ))}
            {loadingSaved && !gateChecks.length ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                正在读取上次测试结果…
              </div>
            ) : null}
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Source Package</h2>
                <p className="mt-1 text-sm text-slate-500">
                  这里展示导题器从唯一 PDF 输入中生成并挂载到题目的 sourceImages。
                </p>
              </div>
              <FileImage className="h-5 w-5 text-sky-600" />
            </div>
            {selectedSourceImage ? (
              <figure className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                <div className="flex min-h-[280px] items-center justify-center bg-white p-3">
                  <img
                    src={selectedSourceImage.src}
                    alt={selectedSourceImage.description || selectedSourceImage.id}
                    className="max-h-[520px] w-full rounded-xl object-contain"
                  />
                </div>
                <figcaption className="space-y-2 px-4 py-3 text-sm text-slate-600">
                  <p className="font-medium text-slate-800">
                    {selectedSourceImage.description || '源页图片'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">id: {selectedSourceImage.id}</Badge>
                    <Badge variant="outline">page {selectedSourceImage.pageNumber}</Badge>
                    {selectedSourceImage.width && selectedSourceImage.height ? (
                      <Badge variant="outline">
                        {selectedSourceImage.width}×{selectedSourceImage.height}
                      </Badge>
                    ) : null}
                  </div>
                </figcaption>
              </figure>
            ) : (
              <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-slate-500">
                <ImagePlus className="h-8 w-8" />
                <p className="mt-3 text-sm">暂无 source image。</p>
              </div>
            )}
            {result ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                <p className="font-medium text-slate-800">{result.sourcePackage.fileName}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="outline">pages {result.sourcePackage.pageCount}</Badge>
                  <Badge variant="outline">
                    source images {result.sourcePackage.sourceImages.length}
                  </Badge>
                  <Badge variant="outline">
                    text {result.sourcePackage.metadata.sourceTextLength}
                  </Badge>
                </div>
                {result.sourcePackage.warnings.length ? (
                  <p className="mt-3 text-xs leading-5 text-amber-700">
                    {result.sourcePackage.warnings.join(' ')}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">题目预览</h2>
                <p className="mt-1 text-sm text-slate-500">
                  valid draft 按正常题面展示，图片作为题目资产挂在题干下方。
                </p>
              </div>
              {selectedDraft ? (
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{selectedDraft.type}</Badge>
                  <Badge variant="outline">{selectedDraft.difficulty}</Badge>
                  {selectedDraftIndex >= 0 && result ? (
                    <Badge variant="outline">
                      {selectedDraftIndex + 1}/{result.drafts.length}
                    </Badge>
                  ) : null}
                </div>
              ) : null}
            </div>
            {result?.drafts.length ? (
              <div className="mb-4 grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => selectRelativeDraft(-1)}
                    disabled={result.drafts.length <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    上一题
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => selectRelativeDraft(1)}
                    disabled={result.drafts.length <= 1}
                  >
                    下一题
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {result.drafts.map((draft, index) => {
                    const active = draft.draftId === selectedDraft?.draftId;
                    const imageCount = draft.publicContent.assets?.images.length || 0;
                    return (
                      <button
                        key={draft.draftId}
                        type="button"
                        onClick={() => setSelectedDraftId(draft.draftId)}
                        className={cn(
                          'min-h-20 rounded-2xl border px-3 py-2 text-left transition',
                          active
                            ? 'border-sky-300 bg-sky-50 text-sky-950'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-slate-600">
                            {index + 1}
                          </span>
                          <span className="line-clamp-2 text-sm font-semibold">{draft.title}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <Badge variant="outline" className="bg-white text-[11px]">
                            page {draft.publicContent.assets?.images[0]?.pageNumber || '-'}
                          </Badge>
                          <Badge variant="outline" className="bg-white text-[11px]">
                            images {imageCount}
                          </Badge>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {selectedDraft ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      draft
                    </p>
                    <h3 className="mt-1 text-xl font-semibold">{selectedDraft.title}</h3>
                  </div>
                  <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                    valid
                  </Badge>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <ProblemRichText content={draftStem(selectedDraft)} />
                  <ProblemImageAssets content={selectedDraft.publicContent} className="mt-4" />
                </div>
                {'analysis' in selectedDraft.grading && selectedDraft.grading.analysis ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
                    <p className="mb-1 font-medium text-slate-800">评分参考</p>
                    <ProblemRichText content={selectedDraft.grading.analysis} />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
                {running || loadingSaved ? '正在生成图像题测试…' : '暂无题目预览。'}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
