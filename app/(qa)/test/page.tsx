'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Code2,
  FileCode2,
  FileQuestion,
  FileStack,
  Map as MapIcon,
  MessageSquare,
  Presentation,
  RefreshCw,
  Users,
} from 'lucide-react';
import { HtmlGenerationPipelinePanel } from '@/components/generation/html-test-progression-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { cn } from '@/lib/utils';
import {
  getMockCourseChatStageList,
  listStagesByCourse,
  MOCK_COURSE_CHAT_ID,
  MOCK_COURSE_CHAT_NAME,
  type StageListItem,
} from '@/lib/utils/stage-storage';
import { listTestResults, type TestResultRow } from '@/lib/utils/test-results';

import {
  EMPTY_TEST_STATUS,
  PROBLEM_IMPORT_TEST_ENTRIES,
  REVIEW_TEST_ENTRIES,
  SLIDE_TEST_ENTRIES,
  SLIDE_TEST_SECTIONS,
  TEST_ENTRIES,
  TEST_SURFACE_STORAGE_KEY,
  buildChatTestEntries,
  problemMetricLabels,
  readStoredTestSurface,
  type ChatTestEntry,
  type TestEntry,
  type TestKind,
  type TestStatus,
  type TestSurface,
} from '@/features/qa/test-center/registry';

function summaryNumber(row: TestResultRow | undefined, key: keyof TestStatus): number {
  const value = row?.summary?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function summaryTimestamp(row: TestResultRow | undefined): number | null {
  const value = row?.summary?.lastUpdatedAt;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return row?.updatedAt ? Date.parse(row.updatedAt) : null;
}

function summarizeRows(entry: TestEntry, rows: TestResultRow[]): TestStatus {
  const entryRows = rows.filter((row) => row.testId === entry.id);
  const stateRow =
    entryRows.find((row) => row.resultKey === 'state-v3') ||
    entryRows.find((row) => row.resultKey === 'state') ||
    entryRows.find((row) => row.resultKey.startsWith('state-'));
  if (stateRow) {
    return {
      generatedCount: summaryNumber(stateRow, 'generatedCount'),
      errorCount: summaryNumber(stateRow, 'errorCount'),
      lastUpdatedAt: summaryTimestamp(stateRow),
    };
  }

  if (!entryRows.length) return EMPTY_TEST_STATUS;
  const generatedCount = entryRows.filter(
    (row) => !['error', 'failed'].includes(row.status.toLowerCase()),
  ).length;
  const errorCount = entryRows.length - generatedCount;
  const lastUpdatedAt = Math.max(...entryRows.map((row) => Date.parse(row.updatedAt) || 0));

  return {
    generatedCount,
    errorCount,
    lastUpdatedAt: lastUpdatedAt > 0 ? lastUpdatedAt : null,
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

function getTestIcon(icon: TestEntry['icon']) {
  if (icon === 'presentation') return Presentation;
  if (icon === 'problem') return FileQuestion;
  if (icon === 'code') return FileCode2;
  if (icon === 'review') return MapIcon;
  return FileStack;
}

function getChatIcon(icon: ChatTestEntry['icon']) {
  if (icon === 'group') return Users;
  if (icon === 'notebook') return BookOpen;
  if (icon === 'render') return Code2;
  return MessageSquare;
}

export default function GenerationTestsPage() {
  const courseId = useCurrentCourseStore((s) => s.id);
  const courseName = useCurrentCourseStore((s) => s.name);
  const setCurrentCourse = useCurrentCourseStore((s) => s.setCurrentCourse);
  const [activeSurface, setActiveSurface] = useState<TestSurface>('slides');
  const [surfaceHydrated, setSurfaceHydrated] = useState(false);
  const [notebookCache, setNotebookCache] = useState<{
    courseId: string | null;
    notebooks: StageListItem[];
  }>({ courseId: null, notebooks: [] });
  const [statuses, setStatuses] = useState<Record<TestKind, TestStatus>>({
    'single-page': { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
    'openmaic-legacy': { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
    'html-pipeline': { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
    'chart-showcase': { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
    'html-single-page': { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
    'file-page': { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
    'html-file-page': { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
    'html-lesson': { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
    'html-openmaic-lesson': { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
    'html-notebook': { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
    'ppt-image': { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
    'problem-import-stepped': { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
    'problem-import-direct-llm': { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
    'problem-image-extraction': { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
    'problem-workspace-ui': { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
    'custom-review': { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
  });

  const refreshStatuses = useCallback(() => {
    void listTestResults({
      testIds: TEST_ENTRIES.map((entry) => entry.id),
      limit: 120,
    })
      .then((rows) => {
        setStatuses(
          Object.fromEntries(
            TEST_ENTRIES.map((entry) => [entry.id, summarizeRows(entry, rows)]),
          ) as Record<TestKind, TestStatus>,
        );
      })
      .catch(() => {
        setStatuses(
          Object.fromEntries(TEST_ENTRIES.map((entry) => [entry.id, EMPTY_TEST_STATUS])) as Record<
            TestKind,
            TestStatus
          >,
        );
      });
  }, []);

  useEffect(() => {
    refreshStatuses();
    const onFocus = () => refreshStatuses();
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshStatuses]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setActiveSurface(readStoredTestSurface());
      setSurfaceHydrated(true);
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!surfaceHydrated) return;
    try {
      window.localStorage.setItem(TEST_SURFACE_STORAGE_KEY, activeSurface);
    } catch {
      /* localStorage can be unavailable in private contexts; the tab still works in memory. */
    }
  }, [activeSurface, surfaceHydrated]);

  useEffect(() => {
    if (activeSurface !== 'chat') return;
    if (!courseId?.trim()) return;
    let cancelled = false;
    listStagesByCourse(courseId)
      .then((notebooks) => {
        if (!cancelled) setNotebookCache({ courseId, notebooks });
      })
      .catch(() => {
        if (!cancelled) setNotebookCache({ courseId, notebooks: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [activeSurface, courseId]);

  const totalGenerated = useMemo(
    () => Object.values(statuses).reduce((sum, status) => sum + status.generatedCount, 0),
    [statuses],
  );
  const activateMockCourse = useCallback(() => {
    setCurrentCourse({ id: MOCK_COURSE_CHAT_ID, name: MOCK_COURSE_CHAT_NAME });
  }, [setCurrentCourse]);
  const mockNotebooks = useMemo(() => getMockCourseChatStageList(), []);
  const isMockCourse = courseId === MOCK_COURSE_CHAT_ID;
  const isChatUsingMock = !courseId || isMockCourse;
  const courseNotebooks =
    courseId && notebookCache.courseId === courseId ? notebookCache.notebooks : [];
  const chatCourseId = courseId || MOCK_COURSE_CHAT_ID;
  const chatCourseName = courseId ? courseName : MOCK_COURSE_CHAT_NAME;
  const chatNotebooks = isChatUsingMock ? mockNotebooks : courseNotebooks;
  const firstNotebook = chatNotebooks[0] || null;
  const chatTestEntries = useMemo(
    () =>
      buildChatTestEntries({
        courseId: chatCourseId,
        courseName: chatCourseName,
        firstNotebook,
        notebookCount: chatNotebooks.length,
      }),
    [chatCourseId, chatCourseName, firstNotebook, chatNotebooks.length],
  );
  const activeDescription =
    activeSurface === 'slides'
      ? 'HTML 生成管线分步 gate，以及通过后的页面输出回归。'
      : activeSurface === 'chat'
        ? '课程总控、群聊路由、笔记本直聊和富文本消息渲染。'
        : activeSurface === 'problems'
          ? 'PDF 题目抽取、题库草稿、做题空间 UI、代码题 test case 和导入结果。'
          : '定制化复习画像、题库体检、复习计划生成和路线关卡验收。';

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
        <Tabs
          value={activeSurface}
          onValueChange={(value) => setActiveSurface(value as TestSurface)}
          className="gap-6"
        >
          <header className="border-b border-slate-200 pb-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                  <span className="flex size-6 items-center justify-center rounded-md bg-gradient-to-br from-sky-500 via-indigo-500 to-emerald-400 text-[11px] font-semibold text-white shadow-sm">
                    S
                  </span>
                  Syntara QA
                </div>
                <h1 className="mt-2 text-3xl font-semibold tracking-normal">测试中心</h1>
                <p className="mt-2 text-sm leading-6 text-slate-600">{activeDescription}</p>
              </div>

              <div className="flex flex-col gap-3 lg:items-end">
                <TabsList className="grid h-10 w-full grid-cols-4 rounded-lg border border-slate-200 bg-white p-1 shadow-sm lg:w-[720px]">
                  <TabsTrigger value="slides" className="gap-2 rounded-md text-sm">
                    <Presentation className="size-4" />
                    幻灯片生成
                  </TabsTrigger>
                  <TabsTrigger value="chat" className="gap-2 rounded-md text-sm">
                    <MessageSquare className="size-4" />
                    课程聊天
                  </TabsTrigger>
                  <TabsTrigger value="problems" className="gap-2 rounded-md text-sm">
                    <FileQuestion className="size-4" />
                    题目测试
                  </TabsTrigger>
                  <TabsTrigger value="review" className="gap-2 rounded-md text-sm">
                    <MapIcon className="size-4" />
                    复习路线
                  </TabsTrigger>
                </TabsList>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={totalGenerated > 0 ? 'secondary' : 'outline'}>
                    生成 {totalGenerated}
                  </Badge>
                  <Badge variant={courseId ? 'secondary' : 'outline'}>
                    {isMockCourse ? 'Mock 课程' : courseId ? courseName || courseId : '未选择课程'}
                  </Badge>
                  <Button type="button" variant="outline" size="sm" onClick={refreshStatuses}>
                    <RefreshCw className="size-4" />
                    刷新
                  </Button>
                </div>
              </div>
            </div>
          </header>

          <TabsContent value="slides" className="mt-0">
            <section className="grid gap-5">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-normal">幻灯片生成测试</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    共 {SLIDE_TEST_ENTRIES.length} 条测试链路
                  </p>
                </div>
              </div>

              <HtmlGenerationPipelinePanel />

              <div className="grid gap-5">
                {SLIDE_TEST_SECTIONS.map((section) => (
                  <div
                    key={section.id}
                    className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
                  >
                    <div className="border-b border-slate-100 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold tracking-normal text-slate-950">
                              {section.title}
                            </h3>
                            {section.deprecated ? (
                              <Badge variant="destructive" className="rounded-md">
                                弃用
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-1 text-sm leading-6 text-slate-500">
                            {section.description}
                          </p>
                        </div>
                        <Badge variant="outline" className="rounded-md">
                          {section.entries.length} 项
                        </Badge>
                      </div>
                    </div>

                    {section.entries.map((entry) => {
                      const status = statuses[entry.id];
                      const EntryIcon = getTestIcon(entry.icon);
                      return (
                        <Link
                          key={entry.id}
                          href={entry.href}
                          className="group block border-t border-slate-100 transition first:border-t-0 hover:bg-slate-50/80"
                        >
                          <div className="grid gap-4 p-4 lg:grid-cols-[1fr_300px_28px] lg:items-center">
                            <div className="flex min-w-0 gap-3">
                              <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-600">
                                <EntryIcon className="size-5" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="text-base font-semibold tracking-normal text-slate-950">
                                    {entry.title}
                                  </h4>
                                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                                    {entry.eyebrow}
                                  </span>
                                </div>
                                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                                  {entry.description}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {entry.chips.map((chip) => (
                                    <Badge key={chip} variant="outline" className="rounded-md">
                                      {chip}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                              <div>
                                <div className="text-[11px] font-medium text-slate-400">已生成</div>
                                <div className="mt-0.5 font-semibold text-slate-900">
                                  {status.generatedCount}
                                </div>
                              </div>
                              <div>
                                <div className="text-[11px] font-medium text-slate-400">失败</div>
                                <div
                                  className={cn(
                                    'mt-0.5 font-semibold',
                                    status.errorCount > 0 ? 'text-rose-600' : 'text-slate-900',
                                  )}
                                >
                                  {status.errorCount}
                                </div>
                              </div>
                              <div>
                                <div className="text-[11px] font-medium text-slate-400">最近</div>
                                <div className="mt-0.5 truncate font-semibold text-slate-900">
                                  {formatLastUpdated(status.lastUpdatedAt)}
                                </div>
                              </div>
                            </div>

                            <ArrowRight className="hidden size-5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-700 lg:block" />
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </div>
            </section>
          </TabsContent>

          <TabsContent value="chat" className="mt-0">
            <section className="grid gap-5">
              <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <h2 className="text-xl font-semibold tracking-normal">课程聊天测试</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {isChatUsingMock
                      ? `${MOCK_COURSE_CHAT_NAME} · ${chatNotebooks.length} 个 Mock 笔记本`
                      : `${courseName || courseId} · ${chatNotebooks.length} 个笔记本`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <Badge variant="secondary" className="w-fit rounded-md">
                    {isChatUsingMock ? 'Mock 上下文' : '真实上下文'}
                  </Badge>
                  <Button type="button" variant="outline" size="sm" onClick={activateMockCourse}>
                    使用 Mock 课程
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                {chatTestEntries.map((entry) => {
                  const EntryIcon = getChatIcon(entry.icon);
                  const content = (
                    <div
                      className={cn(
                        'group flex h-full flex-col justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition',
                        entry.disabled ? 'opacity-60' : 'hover:border-slate-300 hover:shadow-md',
                      )}
                    >
                      <div className="space-y-3">
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <div className="flex min-w-0 gap-3">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-600">
                              <EntryIcon className="size-5" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-slate-400">
                                {entry.eyebrow}
                              </div>
                              <h3 className="mt-1 text-base font-semibold tracking-normal text-slate-950">
                                {entry.title}
                              </h3>
                            </div>
                          </div>
                          <Badge
                            variant={entry.disabled ? 'outline' : 'secondary'}
                            className="rounded-md"
                          >
                            {entry.disabled ? '不可用' : '可测试'}
                          </Badge>
                        </div>

                        <p className="text-sm leading-6 text-slate-600">{entry.description}</p>

                        <div className="flex flex-wrap gap-1.5">
                          {entry.chips.map((chip) => (
                            <Badge key={chip} variant="outline" className="rounded-md">
                              {chip}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-600">
                          <span className="font-semibold text-slate-900">建议提问：</span>
                          {entry.suggestedPrompt}
                        </div>
                        <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
                          <span>{entry.disabled ? entry.disabledText : '打开测试'}</span>
                          <ArrowRight
                            className={cn(
                              'size-5 text-slate-400 transition',
                              !entry.disabled &&
                                'group-hover:translate-x-0.5 group-hover:text-slate-700',
                            )}
                          />
                        </div>
                      </div>
                    </div>
                  );

                  return entry.disabled ? (
                    <div key={entry.id}>{content}</div>
                  ) : (
                    <Link
                      key={entry.id}
                      href={entry.href}
                      className="block"
                      onClick={isChatUsingMock ? activateMockCourse : undefined}
                    >
                      {content}
                    </Link>
                  );
                })}
              </div>
            </section>
          </TabsContent>

          <TabsContent value="problems" className="mt-0">
            <section className="grid gap-5">
              <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <h2 className="text-xl font-semibold tracking-normal">题目测试</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    单独验收 PDF 解析、题目抽取、做题空间 UI、代码题 test case 和导入结果。
                  </p>
                </div>
                <Badge variant="secondary" className="w-fit rounded-md">
                  Problems QA
                </Badge>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                {PROBLEM_IMPORT_TEST_ENTRIES.map((entry) => {
                  const status = statuses[entry.id];
                  const EntryIcon = getTestIcon(entry.icon);
                  const metricLabels = problemMetricLabels(entry);
                  return (
                    <Link
                      key={entry.id}
                      href={entry.href}
                      className="group block border-t border-slate-100 transition first:border-t-0 hover:bg-slate-50/80"
                    >
                      <div
                        className={cn(
                          'grid gap-4 p-4 lg:grid-cols-[1fr_300px_28px] lg:items-center',
                          entry.deprecated && 'bg-slate-50/60',
                        )}
                      >
                        <div className="flex min-w-0 gap-3">
                          <div
                            className={cn(
                              'flex size-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-600',
                              entry.deprecated && 'text-slate-400',
                            )}
                          >
                            <EntryIcon className="size-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3
                                className={cn(
                                  'text-base font-semibold tracking-normal text-slate-950',
                                  entry.deprecated && 'text-slate-500',
                                )}
                              >
                                {entry.title}
                              </h3>
                              {entry.deprecated ? (
                                <Badge variant="destructive" className="rounded-md">
                                  弃用
                                </Badge>
                              ) : null}
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                                {entry.eyebrow}
                              </span>
                            </div>
                            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                              {entry.description}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {entry.chips.map((chip) => (
                                <Badge key={chip} variant="outline" className="rounded-md">
                                  {chip}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                          <div>
                            <div className="text-[11px] font-medium text-slate-400">
                              {metricLabels.generated}
                            </div>
                            <div className="mt-0.5 font-semibold text-slate-900">
                              {status.generatedCount}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] font-medium text-slate-400">
                              {metricLabels.error}
                            </div>
                            <div
                              className={cn(
                                'mt-0.5 font-semibold',
                                status.errorCount > 0 ? 'text-rose-600' : 'text-slate-900',
                              )}
                            >
                              {status.errorCount}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] font-medium text-slate-400">最近</div>
                            <div className="mt-0.5 truncate font-semibold text-slate-900">
                              {formatLastUpdated(status.lastUpdatedAt)}
                            </div>
                          </div>
                        </div>

                        <ArrowRight className="hidden size-5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-700 lg:block" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          </TabsContent>

          <TabsContent value="review" className="mt-0">
            <section className="grid gap-5">
              <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <h2 className="text-xl font-semibold tracking-normal">定制化复习测试</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    单独验收学生画像、题库体检、复习路线地图和做题关卡奖励。
                  </p>
                </div>
                <Badge variant="secondary" className="w-fit rounded-md">
                  Review Route
                </Badge>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                {REVIEW_TEST_ENTRIES.map((entry) => {
                  const status = statuses[entry.id];
                  const EntryIcon = getTestIcon(entry.icon);
                  return (
                    <Link
                      key={entry.id}
                      href={entry.href}
                      className="group block transition hover:bg-slate-50/80"
                    >
                      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_300px_28px] lg:items-center">
                        <div className="flex min-w-0 gap-3">
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-600">
                            <EntryIcon className="size-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-semibold tracking-normal text-slate-950">
                                {entry.title}
                              </h3>
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                                {entry.eyebrow}
                              </span>
                            </div>
                            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                              {entry.description}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {entry.chips.map((chip) => (
                                <Badge key={chip} variant="outline" className="rounded-md">
                                  {chip}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                          <div>
                            <div className="text-[11px] font-medium text-slate-400">节点</div>
                            <div className="mt-0.5 font-semibold text-slate-900">
                              {status.generatedCount}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] font-medium text-slate-400">风险</div>
                            <div
                              className={cn(
                                'mt-0.5 font-semibold',
                                status.errorCount > 0 ? 'text-rose-600' : 'text-slate-900',
                              )}
                            >
                              {status.errorCount}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] font-medium text-slate-400">最近</div>
                            <div className="mt-0.5 truncate font-semibold text-slate-900">
                              {formatLastUpdated(status.lastUpdatedAt)}
                            </div>
                          </div>
                        </div>

                        <ArrowRight className="hidden size-5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-700 lg:block" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
