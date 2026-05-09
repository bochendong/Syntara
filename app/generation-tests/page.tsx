'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, FileStack, ImageIcon, RefreshCw, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const SINGLE_PAGE_STORAGE_KEY = 'syntara:generation-quality:v2';
const FILE_PAGE_STORAGE_KEY = 'syntara:file-page-generation-test:v13';
const IMAGE_TEST_STORAGE_KEY = 'syntara:image-generation-test:v1';

type TestKind = 'single-page' | 'file-page' | 'image';

interface TestStatus {
  generatedCount: number;
  errorCount: number;
  lastUpdatedAt: number | null;
}

interface TestEntry {
  id: TestKind;
  title: string;
  eyebrow: string;
  description: string;
  href: string;
  storageKey: string;
  chips: string[];
  accentClass: string;
  icon: 'file' | 'image';
}

const TEST_ENTRIES: TestEntry[] = [
  {
    id: 'single-page',
    title: '单页生成质量测试',
    eyebrow: '17 种版式 / 单页 prompt',
    description:
      '从一个完整 SceneOutline 出发，只调用一次正式 scene-content，用来定向检查版式、prompt、渲染和质量规则。',
    href: '/generation-quality',
    storageKey: SINGLE_PAGE_STORAGE_KEY,
    chips: ['layout presets', 'prompt preview', 'local QA'],
    accentClass: 'from-blue-500 to-cyan-400',
    icon: 'file',
  },
  {
    id: 'file-page',
    title: 'Testfile 逐页生成测试',
    eyebrow: '3 个文件 / 一页一页生成',
    description:
      '读取 testfile 里的 Markdown、PDF、PPTX，转成 SceneOutline 队列，每次只生成当前页，适合检查上下文承接和真实文件输入。',
    href: '/generation-file-test',
    storageKey: FILE_PAGE_STORAGE_KEY,
    chips: ['testfile fixtures', 'page queue', 'saved generations'],
    accentClass: 'from-violet-500 to-amber-400',
    icon: 'file',
  },
  {
    id: 'image',
    title: '图片测试',
    eyebrow: '图片模型 / 单张生成',
    description:
      '选择当前系统支持的图片 Provider 和模型，调用正式 image generation 接口生成一张测试图。',
    href: '/generation-image-test',
    storageKey: IMAGE_TEST_STORAGE_KEY,
    chips: ['image providers', 'model select', 'visual result'],
    accentClass: 'from-emerald-500 to-lime-400',
    icon: 'image',
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readStorageObject(key: string): Record<string, unknown> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function getRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function getCreatedAt(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const createdAt = value.createdAt;
  return typeof createdAt === 'number' && Number.isFinite(createdAt) ? createdAt : null;
}

function summarizeStorage(entry: TestEntry): TestStatus {
  const saved = readStorageObject(entry.storageKey);
  if (entry.id === 'image') {
    const history = Array.isArray(saved.history) ? saved.history : [];
    const errors = Array.isArray(saved.errors) ? saved.errors : [];
    const timestamps = [...history, ...errors]
      .map(getCreatedAt)
      .filter((value): value is number => value !== null);

    return {
      generatedCount: history.length,
      errorCount: errors.length,
      lastUpdatedAt: timestamps.length > 0 ? Math.max(...timestamps) : null,
    };
  }

  const resultMap =
    entry.id === 'single-page' ? getRecord(saved.resultsByPreset) : getRecord(saved.resultsByPage);
  const errorMap =
    entry.id === 'single-page' ? getRecord(saved.errorsByPreset) : getRecord(saved.errorsByPage);
  const timestamps = [...Object.values(resultMap), ...Object.values(errorMap)]
    .map(getCreatedAt)
    .filter((value): value is number => value !== null);

  return {
    generatedCount: Object.keys(resultMap).length,
    errorCount: Object.keys(errorMap).length,
    lastUpdatedAt: timestamps.length > 0 ? Math.max(...timestamps) : null,
  };
}

function formatLastUpdated(value: number | null): string {
  if (!value) return '暂无保存';
  return new Date(value).toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function GenerationTestsPage() {
  const [statuses, setStatuses] = useState<Record<TestKind, TestStatus>>({
    'single-page': { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
    'file-page': { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
    image: { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
  });

  const refreshStatuses = useCallback(() => {
    setStatuses(
      Object.fromEntries(
        TEST_ENTRIES.map((entry) => [entry.id, summarizeStorage(entry)]),
      ) as Record<TestKind, TestStatus>,
    );
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(refreshStatuses, 0);
    const onFocus = () => refreshStatuses();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshStatuses]);

  const totalGenerated = useMemo(
    () => Object.values(statuses).reduce((sum, status) => sum + status.generatedCount, 0),
    [statuses],
  );

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-6">
        <header className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                <Sparkles className="size-4" />
                Generation QA
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-normal">生成测试中心</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                这里收口目前三个生成测试入口。每个测试页继续使用自己的本地持久化结果，
                刷新后可以从上一次生成的位置继续看。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={totalGenerated > 0 ? 'secondary' : 'outline'}>
                已保存生成 {totalGenerated}
              </Badge>
              <Button type="button" variant="outline" size="sm" onClick={refreshStatuses}>
                <RefreshCw className="size-4" />
                刷新状态
              </Button>
            </div>
          </div>
        </header>

        <section className="grid gap-4">
          {TEST_ENTRIES.map((entry) => {
            const status = statuses[entry.id];
            const EntryIcon = entry.icon === 'image' ? ImageIcon : FileStack;
            return (
              <Link
                key={entry.id}
                href={entry.href}
                className="group block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md"
              >
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 gap-4">
                    <div
                      className={cn(
                        'flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-sm',
                        entry.accentClass,
                      )}
                    >
                      <EntryIcon className="size-6" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                        {entry.eyebrow}
                      </div>
                      <h2 className="mt-1 text-xl font-semibold tracking-normal text-slate-950">
                        {entry.title}
                      </h2>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                        {entry.description}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {entry.chips.map((chip) => (
                          <Badge key={chip} variant="outline">
                            {chip}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3 lg:min-w-[280px]">
                    <div className="space-y-1 text-sm">
                      <div className="font-semibold text-slate-900">
                        已生成 {status.generatedCount}
                        {status.errorCount > 0 ? ` · 失败 ${status.errorCount}` : ''}
                      </div>
                      <div className="text-xs text-slate-500">
                        最近更新：{formatLastUpdated(status.lastUpdatedAt)}
                      </div>
                    </div>
                    <ArrowRight className="size-5 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-600" />
                  </div>
                </div>
              </Link>
            );
          })}
        </section>
      </div>
    </main>
  );
}
