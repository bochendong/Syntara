'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Code2,
  FileText,
  Loader2,
  Presentation,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getApiHeaders } from '@/lib/create/generation-headers';
import { backendFetch } from '@/lib/utils/backend-api';
import { formatComputeCreditsLabel, formatUsdLabel } from '@/lib/utils/credits';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'syntara:html-ppt-test:v1';
const HTML_PPT_TEST_MODEL = 'gpt-5.2';

const DEFAULT_PROMPT = `Create a 16:9 PowerPoint-style slide for an education product team.

Topic: Weekly AI Tutor Operations Snapshot
Audience: product, curriculum, and learning operations leads
Content:
- Active learners: 12,840, up 18.4% week over week
- Mastery rate: 76%, goal is 80%
- Lesson quality: A-, rubric alignment stable
- Alerts: 3 areas need review
- Mastery trend over the last 7 days
- Review queue table: Algebra hints 42 high, Proof grading 18 medium, Code tasks 9 low

Style: clean SaaS analytics slide, blue/white palette, restrained accents, editable cards/table/chart, no stock imagery.`;

const PROMPT_PRESETS = [
  {
    id: 'ops',
    label: '运营数据',
    prompt: DEFAULT_PROMPT,
  },
  {
    id: 'calculus',
    label: '微积分推导',
    prompt: `Create a 16:9 PowerPoint-style math lesson slide.

Topic: Chain Rule, From Composition to Derivative
Audience: first-year calculus students
Content:
- Title: Chain Rule Derivation
- Show one main Chain Rule formula card with y = f(g(x)) and dy/dx = f'(g(x)) g'(x) as two short stacked MathML rows, not one long row
- Include exactly three compact derivation rows, each row no more than one short equation
- Include one worked example row: y = sin(x^2), y' = 2x cos(x^2)
- Add one short caution callout about inner vs outer function
- Use no more than 7 MathML formula blocks total
- Do not use <mspace>; use CSS spacing and stacked formula rows instead
- Do not set main/content min-height larger than 680px; the slide body must end above y=884

Style: clean classroom slide, white background, blue accents, native MathML/HTML math, formula cards, no images.`,
  },
  {
    id: 'linear-algebra',
    label: '线代矩阵',
    prompt: `Create a 16:9 PowerPoint-style math slide.

Topic: Solving a 2x2 Linear System with Matrices
Audience: undergraduate linear algebra students
Content:
- Title: Matrix Inverse Method for a 2x2 System
- Show Ax = b using a 2x2 matrix A and a 2x1 vector b
- Show determinant det(A) = ad - bc
- Show inverse formula for a 2x2 matrix
- Include a compact worked example table with values and result
- Add a small diagram explaining the transformation from x-space to b-space
- Use no more than 6 MathML formula blocks total

Style: precise lecture slide, editable HTML/CSS, native MathML for matrices and fractions, restrained blue/green accents.`,
  },
  {
    id: 'probability',
    label: '概率表格',
    prompt: `Create a 16:9 PowerPoint-style probability lesson slide.

Topic: Bayes' Theorem with a Diagnostic Test
Audience: high school statistics students
Content:
- Title: Bayes' Theorem in One Table
- Show P(Disease | Positive) = P(Positive | Disease) P(Disease) / P(Positive)
- Include a 2x2 contingency table with 10,000 people, 1% prevalence, 95% sensitivity, 90% specificity
- Show the final posterior probability with one highlighted formula card
- Add two short interpretation bullets
- Use no more than 5 MathML formula blocks total

Style: clean educational slide, compact table, native MathML fractions, no external libraries, all content within one slide.`,
  },
] as const;

type TokenUsage = {
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
  totalTokens?: number | null;
};

type HtmlCostEstimate = {
  baseUsd: number | null;
  retailUsd: number;
  computeCredits: number;
  markupMultiplier: number | null;
  source: 'openai_pricing' | 'token_fallback';
};

type GenerateHtmlPptResponse = {
  success: boolean;
  html?: string;
  model?: string;
  usage?: TokenUsage | null;
  costEstimate?: HtmlCostEstimate | null;
  generationAttempts?: number;
  skippedCreditCharge?: boolean;
  error?: string;
};

type StoredRun = {
  id: string;
  createdAt: number;
  prompt: string;
  model?: string;
  html: string;
  htmlLength: number;
  textNodeCount: number;
  elementCount: number;
  mathElementCount?: number;
  usage?: TokenUsage | null;
  costEstimate?: HtmlCostEstimate | null;
  generationAttempts?: number;
  skippedCreditCharge?: boolean;
};

type StoredError = {
  createdAt: number;
  prompt: string;
  message: string;
};

type StoredState = {
  history: StoredRun[];
  errors: StoredError[];
};

type LayoutQaStatus = 'idle' | 'pass' | 'warning' | 'fail';

type LayoutQa = {
  status: LayoutQaStatus;
  message: string;
  scrollWidth: number;
  scrollHeight: number;
  slideCount: number;
  hasSlideContent: boolean;
  outOfBoundsCount: number;
  outOfBoundsSamples: string[];
};

function emptyStoredState(): StoredState {
  return { history: [], errors: [] };
}

function readStoredRuns(): StoredState {
  if (typeof window === 'undefined') return emptyStoredState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStoredState();
    const parsed = JSON.parse(raw) as { history?: unknown; errors?: unknown };
    return {
      history: Array.isArray(parsed.history) ? (parsed.history as StoredRun[]) : [],
      errors: Array.isArray(parsed.errors) ? (parsed.errors as StoredError[]) : [],
    };
  } catch {
    return emptyStoredState();
  }
}

function writeStoredRuns(next: StoredState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      history: next.history.slice(0, 12),
      errors: next.errors.slice(0, 20),
    }),
  );
}

function analyzeHtml(html: string) {
  return {
    htmlLength: html.length,
    textNodeCount: html
      .replace(/<style\b[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '\n')
      .split('\n')
      .map((part) => part.trim())
      .filter(Boolean).length,
    elementCount: html.match(/<[a-z][\w:-]*(?:\s|>)/gi)?.length || 0,
    mathElementCount: html.match(/<math(?:\s|>)/gi)?.length || 0,
  };
}

function formatTime(value: number): string {
  return new Date(value).toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toSafeInt(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.max(0, Math.round(value));
}

function getUsageTotal(usage: TokenUsage | null | undefined): number {
  const inputTokens = toSafeInt(usage?.inputTokens);
  const outputTokens = toSafeInt(usage?.outputTokens);
  return toSafeInt(usage?.totalTokens ?? inputTokens + outputTokens);
}

function formatUsageLabel(usage: TokenUsage | null | undefined): string | null {
  const inputTokens = toSafeInt(usage?.inputTokens);
  const outputTokens = toSafeInt(usage?.outputTokens);
  const totalTokens = getUsageTotal(usage);
  if (inputTokens <= 0 && outputTokens <= 0 && totalTokens <= 0) return null;
  return `${totalTokens.toLocaleString()} tokens · 输入 ${inputTokens.toLocaleString()} / 输出 ${outputTokens.toLocaleString()}`;
}

function formatCostLabel(run: StoredRun): string {
  if (run.costEstimate) {
    const sourceLabel =
      run.costEstimate.source === 'token_fallback' ? '按 token 兜底估算' : 'OpenAI 定价估算';
    return `${formatComputeCreditsLabel(run.costEstimate.computeCredits)} · ${formatUsdLabel(run.costEstimate.retailUsd)} · ${sourceLabel}`;
  }
  const usageLabel = formatUsageLabel(run.usage);
  return usageLabel ? `${usageLabel} · 费用待估算` : '费用未知';
}

function getHtmlPptTestHeaders(): HeadersInit {
  const headers = new Headers(
    getApiHeaders({
      imageGenerationEnabled: false,
      modelIdOverride: HTML_PPT_TEST_MODEL,
    }),
  );
  headers.set('x-generation-test-no-charge', 'true');
  return headers;
}

function emptyLayoutQa(): LayoutQa {
  return {
    status: 'idle',
    message: '等待预览载入',
    scrollWidth: 0,
    scrollHeight: 0,
    slideCount: 0,
    hasSlideContent: false,
    outOfBoundsCount: 0,
    outOfBoundsSamples: [],
  };
}

export default function GenerationHtmlPptTestPage() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<StoredRun | null>(null);
  const [storedRuns, setStoredRuns] = useState<StoredState>(emptyStoredState);
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const qaTimerRef = useRef<number | null>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const [layoutQa, setLayoutQa] = useState<LayoutQa>(emptyLayoutQa);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = readStoredRuns();
      setStoredRuns(saved);
      setResult(saved.history[0] ?? null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const element = previewFrameRef.current;
    if (!element) return;

    const updateScale = () => {
      const rect = element.getBoundingClientRect();
      const scale = Math.min(rect.width / 1600, rect.height / 900);
      setPreviewScale(Number.isFinite(scale) && scale > 0 ? scale : 1);
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const persistRun = useCallback((run: StoredRun) => {
    setStoredRuns((prev) => {
      const next = {
        history: [run, ...prev.history].slice(0, 12),
        errors: prev.errors,
      };
      writeStoredRuns(next);
      return next;
    });
  }, []);

  const persistError = useCallback((errorRun: StoredError) => {
    setStoredRuns((prev) => {
      const next = {
        history: prev.history,
        errors: [errorRun, ...prev.errors].slice(0, 20),
      };
      writeStoredRuns(next);
      return next;
    });
  }, []);

  const handleGenerate = useCallback(async () => {
    const trimmedPrompt = (promptTextareaRef.current?.value ?? prompt).trim();
    if (!trimmedPrompt || isGenerating) return;

    setIsGenerating(true);
    setError('');
    setLayoutQa(emptyLayoutQa());
    try {
      const response = await backendFetch('/api/generate/html-ppt-slide', {
        method: 'POST',
        headers: getHtmlPptTestHeaders(),
        body: JSON.stringify({ prompt: trimmedPrompt }),
      });
      const data = (await response.json().catch(() => ({}))) as GenerateHtmlPptResponse;
      if (!response.ok || !data.success || !data.html) {
        throw new Error(data.error || `HTML PPT 生成失败：HTTP ${response.status}`);
      }

      const run: StoredRun = {
        id: `${Date.now()}`,
        createdAt: Date.now(),
        prompt: trimmedPrompt,
        model: data.model,
        html: data.html,
        usage: data.usage ?? null,
        costEstimate: data.costEstimate ?? null,
        generationAttempts: data.generationAttempts,
        skippedCreditCharge: data.skippedCreditCharge,
        ...analyzeHtml(data.html),
      };
      setResult(run);
      persistRun(run);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      persistError({ createdAt: Date.now(), prompt: trimmedPrompt, message });
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating, persistError, persistRun, prompt]);

  const inspectPreviewLayout = useCallback(() => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!doc?.documentElement || !doc.body) {
      setLayoutQa({
        ...emptyLayoutQa(),
        status: 'warning',
        message: '无法读取 iframe 布局',
      });
      return;
    }

    const root = doc.documentElement;
    const body = doc.body;
    const scrollWidth = Math.ceil(Math.max(root.scrollWidth, body.scrollWidth));
    const scrollHeight = Math.ceil(Math.max(root.scrollHeight, body.scrollHeight));
    const slideCount = doc.querySelectorAll('.slide').length;
    const hasSlideContent = Boolean(doc.querySelector('.slide-content'));
    const outOfBoundsElements = Array.from(body.querySelectorAll('*')).filter((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      return rect.left < -1 || rect.top < -1 || rect.right > 1601 || rect.bottom > 901;
    });
    const outOfBoundsSamples = outOfBoundsElements.slice(0, 6).map((element) => {
      const rect = element.getBoundingClientRect();
      const className =
        typeof element.className === 'string'
          ? element.className
          : element.getAttribute('class') || '';
      const label = [element.tagName.toLowerCase(), className ? `.${className}` : '']
        .join('')
        .trim();
      return `${label} ${Math.round(rect.left)},${Math.round(rect.top)}-${Math.round(rect.right)},${Math.round(rect.bottom)}`;
    });
    const outOfBoundsCount = outOfBoundsElements.length;
    const hasScrollOverflow = scrollWidth > 1601 || scrollHeight > 901;
    const hasStructureIssue = slideCount !== 1 || !hasSlideContent;
    const status: LayoutQaStatus =
      hasScrollOverflow || outOfBoundsCount > 0 ? 'fail' : hasStructureIssue ? 'warning' : 'pass';

    setLayoutQa({
      status,
      message:
        status === 'pass'
          ? '16:9 无滚动溢出，结构通过'
          : status === 'warning'
            ? '比例正常，但缺少标准 .slide 结构'
            : '检测到滚动或越界元素',
      scrollWidth,
      scrollHeight,
      slideCount,
      hasSlideContent,
      outOfBoundsCount,
      outOfBoundsSamples,
    });
  }, []);

  const schedulePreviewInspection = useCallback(() => {
    if (qaTimerRef.current != null) {
      window.clearTimeout(qaTimerRef.current);
    }
    qaTimerRef.current = window.setTimeout(() => {
      qaTimerRef.current = null;
      inspectPreviewLayout();
    }, 80);
  }, [inspectPreviewLayout]);

  useEffect(() => {
    if (!result) return;

    const timers = [120, 450, 1000].map((delay) => window.setTimeout(inspectPreviewLayout, delay));
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      if (qaTimerRef.current != null) {
        window.clearTimeout(qaTimerRef.current);
        qaTimerRef.current = null;
      }
    };
  }, [inspectPreviewLayout, result]);

  const currentUsageLabel = useMemo(() => formatUsageLabel(result?.usage), [result?.usage]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-6 py-6">
        <div className="flex items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/test">
              <ArrowLeft className="size-4" />
              返回所有测试
            </Link>
          </Button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant="outline">HTML {storedRuns.history.length}</Badge>
            {storedRuns.errors.length > 0 && (
              <Badge variant="destructive">失败 {storedRuns.errors.length}</Badge>
            )}
          </div>
        </div>

        <header className="rounded-xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                <Presentation className="size-4" />
                HTML PPT QA
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-normal">HTML PPT 页面测试</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                直接让模型生成单页 16:9 HTML/CSS PPT，用 iframe 预览真实页面结构。
              </p>
            </div>
            <Badge variant="secondary" className="w-fit">
              默认模型 {HTML_PPT_TEST_MODEL}
            </Badge>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[420px_1fr]">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <FileText className="size-4 text-blue-700" />
              Prompt
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {PROMPT_PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPrompt(preset.prompt)}
                  disabled={isGenerating}
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            <Textarea
              ref={promptTextareaRef}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              className="mt-4 min-h-[300px] resize-y rounded-lg border-slate-200 font-mono text-xs leading-5"
            />

            {error && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-700">
                {error}
              </div>
            )}

            <div className="mt-4 grid gap-2">
              <Button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={isGenerating || prompt.trim().length === 0}
              >
                {isGenerating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Presentation className="size-4" />
                )}
                {isGenerating ? '生成中' : '生成 HTML PPT'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPrompt(DEFAULT_PROMPT)}
                disabled={isGenerating}
              >
                <RefreshCw className="size-4" />
                恢复默认 prompt
              </Button>
            </div>

            {result && (
              <div className="mt-5 grid gap-2 text-sm">
                <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-slate-500">模型</span>
                  <span className="font-medium text-slate-900">{result.model || '未知'}</span>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-slate-500">费用</span>
                  <span className="text-right font-medium text-slate-900">
                    {formatCostLabel(result)}
                  </span>
                </div>
                {currentUsageLabel && (
                  <div className="flex items-center justify-between gap-4 rounded-lg bg-slate-50 px-3 py-2">
                    <span className="text-slate-500">用量</span>
                    <span className="text-right font-medium text-slate-900">
                      {currentUsageLabel}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-slate-500">HTML 长度</span>
                  <span className="font-medium text-slate-900">
                    {result.htmlLength.toLocaleString()} chars
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-slate-500">文本段</span>
                  <span className="font-medium text-slate-900">{result.textNodeCount}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-slate-500">元素数</span>
                  <span className="font-medium text-slate-900">{result.elementCount}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-slate-500">MathML</span>
                  <span className="font-medium text-slate-900">
                    {(result.mathElementCount ?? 0).toLocaleString()} formulas
                  </span>
                </div>
                {result.generationAttempts && result.generationAttempts > 1 && (
                  <div className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2">
                    <span className="text-amber-700">自动重试</span>
                    <span className="font-medium text-amber-900">
                      {result.generationAttempts} 次调用
                    </span>
                  </div>
                )}
                {result.skippedCreditCharge && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800">
                    <Save className="mr-1 inline size-3.5" />
                    测试页已跳过本地积分扣费，仅显示估算费用。
                  </div>
                )}
                <div
                  className={cn(
                    'rounded-lg border px-3 py-2 text-xs leading-5',
                    layoutQa.status === 'pass'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : layoutQa.status === 'fail'
                        ? 'border-red-200 bg-red-50 text-red-800'
                        : 'border-amber-200 bg-amber-50 text-amber-800',
                  )}
                >
                  <div className="font-semibold">版式 QA：{layoutQa.message}</div>
                  <div className="mt-1">
                    scroll {layoutQa.scrollWidth || '-'} x {layoutQa.scrollHeight || '-'} · slide{' '}
                    {layoutQa.slideCount} · content {layoutQa.hasSlideContent ? '有' : '缺'} · 越界{' '}
                    {layoutQa.outOfBoundsCount}
                  </div>
                  {layoutQa.outOfBoundsSamples.length > 0 && (
                    <div className="mt-1 truncate text-[11px] opacity-90">
                      {layoutQa.outOfBoundsSamples.join(' / ')}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-5">
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">HTML PPT 预览</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {result?.model
                      ? `Generated by ${result.model} · iframe 1600 x 900`
                      : '等待生成结果 · iframe 1600 x 900'}
                  </p>
                </div>
                {result && (
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="size-3.5" />
                    sanitized
                  </Badge>
                )}
              </div>

              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-100 p-4">
                <div
                  ref={previewFrameRef}
                  className="relative aspect-video overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
                >
                  {isGenerating ? (
                    <div className="flex size-full flex-col items-center justify-center gap-3 text-sm text-slate-500">
                      <Loader2 className="size-8 animate-spin text-blue-700" />
                      正在生成 HTML PPT
                    </div>
                  ) : result ? (
                    <iframe
                      ref={iframeRef}
                      title="HTML PPT generated preview"
                      srcDoc={result.html}
                      className="absolute left-0 top-0 border-0"
                      style={{
                        width: 1600,
                        height: 900,
                        transform: `scale(${previewScale})`,
                        transformOrigin: 'top left',
                      }}
                      onLoad={schedulePreviewInspection}
                    />
                  ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-slate-500">
                      <Presentation className="size-10 text-slate-300" />
                      还没有 HTML PPT。
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Code2 className="size-4 text-slate-500" />
                HTML 源码
              </div>
              <pre className="mt-4 max-h-[360px] overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-5 text-slate-100">
                {result?.html || '等待 HTML 生成结果...'}
              </pre>
            </section>
          </div>
        </section>

        {storedRuns.history.length > 0 && (
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">最近 HTML PPT</h2>
            <div className="mt-3 grid gap-2">
              {storedRuns.history.slice(0, 6).map((run) => (
                <button
                  key={run.id}
                  type="button"
                  aria-pressed={result?.id === run.id}
                  onClick={() => {
                    setResult(run);
                    setPrompt(run.prompt);
                    setError('');
                    setLayoutQa(emptyLayoutQa());
                  }}
                  className={cn(
                    'flex flex-col gap-1 rounded-lg border px-3 py-2 text-left text-sm transition sm:flex-row sm:items-center sm:justify-between',
                    result?.id === run.id
                      ? 'border-blue-300 bg-blue-50 ring-1 ring-blue-200'
                      : 'border-transparent bg-slate-50 hover:border-slate-200 hover:bg-white',
                  )}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-900">
                      {run.model || 'unknown'} · {run.textNodeCount} text · {run.elementCount}{' '}
                      elements · {run.mathElementCount ?? 0} math
                    </div>
                    <div className="mt-0.5 truncate text-xs text-slate-500">
                      {formatCostLabel(run)}
                    </div>
                  </div>
                  <div className="shrink-0 text-xs text-slate-500">
                    {formatTime(run.createdAt)} · 点击回看
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {storedRuns.history.length > 0 && (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                const next = emptyStoredState();
                writeStoredRuns(next);
                setStoredRuns(next);
                setResult(null);
              }}
            >
              <Trash2 className="size-4" />
              清空 HTML PPT 历史
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
