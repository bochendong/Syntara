'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  Send,
  Upload,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type ParsedPdfContent = {
  text: string;
  images: string[];
  metadata?: {
    fileName?: string;
    fileSize?: number;
    pageCount?: number;
    parser?: string;
    [key: string]: unknown;
  };
};

type ParsePdfResponse = {
  success?: boolean;
  data?: ParsedPdfContent;
  error?: string;
  details?: string;
};

type ClassroomJobResponse = {
  success?: boolean;
  jobId?: string;
  status?: 'queued' | 'running' | 'succeeded' | 'failed';
  step?: string;
  progress?: number;
  message?: string;
  pollUrl?: string;
  pollIntervalMs?: number;
  scenesGenerated?: number;
  totalScenes?: number;
  result?: {
    classroomId: string;
    url: string;
    scenesCount: number;
  };
  error?: string;
  details?: string;
  done?: boolean;
};

const DEFAULT_REQUIREMENT =
  '请根据上传的 MAT 136 Week 1 定积分讲义，生成一整节 OpenMAIC 多页面课堂。保留讲义主线：面积近似、左/右黎曼和、定积分定义、性质和典型题。中文讲解，面向 UTM MAT 136 学生。';

function readApiError(data: { error?: string; details?: string }, fallback: string) {
  return [data.error, data.details].filter(Boolean).join('：') || fallback;
}

function formatBytes(size: number | undefined) {
  if (!size) return '0 KB';
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

function isRunning(job: ClassroomJobResponse | null) {
  return job?.status === 'queued' || job?.status === 'running';
}

export default function OpenMaicClassroomTestClient() {
  const [file, setFile] = useState<File | null>(null);
  const [requirement, setRequirement] = useState(DEFAULT_REQUIREMENT);
  const [language, setLanguage] = useState<'zh-CN' | 'en-US'>('zh-CN');
  const [parsedPdf, setParsedPdf] = useState<ParsedPdfContent | null>(null);
  const [job, setJob] = useState<ClassroomJobResponse | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<string[]>([]);

  const running = isRunning(job);
  const pollUrl = job?.pollUrl;
  const pollIntervalMs = job?.pollIntervalMs;
  const jobStatus = job?.status;
  const canSubmit = Boolean(file && requirement.trim()) && !isParsing && !isSubmitting && !running;

  const progress = useMemo(() => {
    if (!job) return 0;
    if (typeof job.progress === 'number') return Math.max(0, Math.min(100, job.progress));
    if (job.status === 'succeeded') return 100;
    return 0;
  }, [job]);

  const pushEvent = useCallback((message: string) => {
    const time = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setEvents((previous) => [`${time} ${message}`, ...previous].slice(0, 12));
  }, []);

  const handleFileChange = useCallback((nextFile: File | null) => {
    setFile(nextFile);
    setParsedPdf(null);
    setJob(null);
    setError(null);
    setEvents([]);
  }, []);

  const parsePdf = useCallback(async () => {
    if (!file) {
      throw new Error('请先上传 PDF。');
    }
    setIsParsing(true);
    setError(null);
    pushEvent(`开始解析 PDF：${file.name}`);
    try {
      const formData = new FormData();
      formData.append('providerId', 'unpdf');
      formData.append('pdf', file);

      const response = await fetch('/api/parse-pdf', {
        method: 'POST',
        body: formData,
      });
      const data = (await response.json().catch(() => ({}))) as ParsePdfResponse;
      if (!response.ok || data.success === false || !data.data) {
        throw new Error(readApiError(data, `PDF 解析失败：HTTP ${response.status}`));
      }

      setParsedPdf(data.data);
      pushEvent(
        `PDF 解析完成：${data.data.metadata?.pageCount || 0} 页，${data.data.text.length} 字，${data.data.images.length} 张图。`,
      );
      return data.data;
    } finally {
      setIsParsing(false);
    }
  }, [file, pushEvent]);

  const submitClassroomJob = useCallback(
    async (pdfContent: ParsedPdfContent) => {
      setIsSubmitting(true);
      setError(null);
      pushEvent('提交 OpenMAIC-org 整节课生成 job。');
      try {
        const response = await fetch('/api/generate-classroom', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requirement: requirement.trim(),
            language,
            pdfContent: {
              text: pdfContent.text,
              images: pdfContent.images || [],
            },
            agentMode: 'default',
            slideGenerationRoute: 'openmaic-legacy',
          }),
        });
        const data = (await response.json().catch(() => ({}))) as ClassroomJobResponse;
        if (!response.ok || data.success === false || !data.jobId || !data.pollUrl) {
          throw new Error(readApiError(data, `生成 job 提交失败：HTTP ${response.status}`));
        }
        setJob(data);
        pushEvent(`job 已提交：${data.jobId}`);
      } finally {
        setIsSubmitting(false);
      }
    },
    [language, pushEvent, requirement],
  );

  const handleGenerate = useCallback(async () => {
    try {
      const pdfContent = parsedPdf || (await parsePdf());
      await submitClassroomJob(pdfContent);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      pushEvent(`失败：${message}`);
    }
  }, [parsePdf, parsedPdf, pushEvent, submitClassroomJob]);

  useEffect(() => {
    if (!pollUrl || (jobStatus !== 'queued' && jobStatus !== 'running')) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const response = await fetch(pollUrl);
        const data = (await response.json().catch(() => ({}))) as ClassroomJobResponse;
        if (!response.ok || data.success === false) {
          throw new Error(readApiError(data, `轮询失败：HTTP ${response.status}`));
        }
        if (cancelled) return;
        setJob(data);
        if (data.message) {
          pushEvent(
            `${data.status || 'running'} / ${data.step || 'unknown'}：${data.message}${
              data.totalScenes ? ` (${data.scenesGenerated || 0}/${data.totalScenes})` : ''
            }`,
          );
        }
        if (data.status === 'failed' && data.error) {
          setError(data.error);
        }
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        pushEvent(`轮询异常：${message}`);
      }
    };

    void poll();
    const interval = window.setInterval(poll, pollIntervalMs || 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [jobStatus, pollIntervalMs, pollUrl, pushEvent]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link
              href="/test"
              className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-700"
            >
              <ChevronLeft className="size-4" />
              返回测试页
            </Link>
            <h1 className="mt-4 text-2xl font-semibold tracking-normal text-slate-950">
              OpenMAIC-org PDF 整节课生成测试
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              复刻 OpenMAIC-org 首页的老链路：上传 PDF，先走 /api/parse-pdf，再提交
              /api/generate-classroom 生成完整 classroom。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <Badge variant="secondary">route: openmaic-legacy</Badge>
            <Badge variant="outline">/api/generate-classroom</Badge>
            <Badge variant="outline">whole lesson</Badge>
          </div>
        </div>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Upload className="size-4 text-blue-600" />
              <h2 className="text-sm font-semibold">输入</h2>
            </div>

            <label className="mt-4 block text-xs font-medium text-slate-600">
              PDF
              <Input
                className="mt-2"
                type="file"
                accept=".pdf,application/pdf"
                disabled={isParsing || isSubmitting || running}
                onChange={(event) => handleFileChange(event.target.files?.[0] || null)}
              />
            </label>

            {file ? (
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                  <FileText className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-slate-900">{file.name}</div>
                  <div className="text-xs text-slate-500">{formatBytes(file.size)}</div>
                </div>
              </div>
            ) : null}

            <label className="mt-4 block text-xs font-medium text-slate-600">
              生成要求
              <Textarea
                className="mt-2 min-h-[180px] resize-y text-[13px] leading-6"
                value={requirement}
                disabled={isParsing || isSubmitting || running}
                onChange={(event) => setRequirement(event.target.value)}
              />
            </label>

            <div className="mt-4 grid gap-3 sm:grid-cols-[160px_1fr]">
              <label className="block text-xs font-medium text-slate-600">
                language
                <Select
                  value={language}
                  disabled={isParsing || isSubmitting || running}
                  onValueChange={(value) => setLanguage(value as 'zh-CN' | 'en-US')}
                >
                  <SelectTrigger className="mt-2 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zh-CN">zh-CN</SelectItem>
                    <SelectItem value="en-US">en-US</SelectItem>
                  </SelectContent>
                </Select>
              </label>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                每页内容生成会强制传入 <code>slideGenerationRoute: openmaic-legacy</code>，并在
                classroom generation 里去掉 Syntara teaching contract，让旧版固定画布路线真正生效。
              </div>
            </div>

            {error ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm leading-6 text-red-900">
                <div className="flex items-center gap-2 font-semibold">
                  <XCircle className="size-4" />
                  失败
                </div>
                <div className="mt-1">{error}</div>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!file || isParsing || isSubmitting || running}
                onClick={() => {
                  void parsePdf().catch((err) => {
                    const message = err instanceof Error ? err.message : String(err);
                    setError(message);
                    pushEvent(`失败：${message}`);
                  });
                }}
              >
                {isParsing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                {isParsing ? '解析中...' : '只解析 PDF'}
              </Button>
              <Button type="button" disabled={!canSubmit} onClick={() => void handleGenerate()}>
                {isSubmitting || running ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                {running ? '生成中...' : '上传 PDF 生成整节课'}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">状态</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    job 提交后会在这里轮询，完成后直接打开课堂链接。
                  </p>
                </div>
                <Badge
                  variant={
                    job?.status === 'succeeded'
                      ? 'default'
                      : job?.status === 'failed'
                        ? 'destructive'
                        : running
                          ? 'secondary'
                          : 'outline'
                  }
                >
                  {job?.status || 'idle'}
                </Badge>
              </div>

              <div className="space-y-3">
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      job?.status === 'failed' ? 'bg-red-500' : 'bg-blue-600',
                    )}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="grid gap-2 text-xs leading-5 text-slate-600 sm:grid-cols-2">
                  <div>
                    <div className="font-semibold text-slate-900">jobId</div>
                    <div className="break-all">{job?.jobId || '-'}</div>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">step</div>
                    <div>{job?.step || '-'}</div>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">scenes</div>
                    <div>
                      {job?.totalScenes ? `${job.scenesGenerated || 0}/${job.totalScenes}` : '-'}
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">PDF</div>
                    <div>
                      {parsedPdf
                        ? `${parsedPdf.metadata?.pageCount || 0} 页 / ${parsedPdf.text.length} 字`
                        : '-'}
                    </div>
                  </div>
                </div>
              </div>

              {job?.result ? (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm leading-6 text-emerald-950">
                  <div className="flex items-center gap-2 font-semibold">
                    <CheckCircle2 className="size-4" />
                    整节课生成完成
                  </div>
                  <div className="mt-1">
                    classroomId: {job.result.classroomId} · {job.result.scenesCount} scenes
                  </div>
                  <Button type="button" className="mt-3" size="sm" asChild>
                    <Link href={job.result.url}>
                      打开 classroom
                      <ExternalLink className="size-4" />
                    </Link>
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold">运行日志</h2>
              <div className="mt-3 max-h-[360px] space-y-2 overflow-auto">
                {events.length > 0 ? (
                  events.map((event) => (
                    <div
                      key={event}
                      className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 font-mono text-[11px] leading-5 text-slate-700"
                    >
                      {event}
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center text-sm text-slate-400">
                    等待上传 PDF。
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
