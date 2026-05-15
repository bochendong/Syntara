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
import { COURSE_ORCHESTRATOR_ID } from '@/lib/constants/course-chat';
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

type TestKind =
  | 'single-page'
  | 'html-pipeline'
  | 'html-single-page'
  | 'file-page'
  | 'html-file-page'
  | 'html-lesson'
  | 'html-notebook'
  | 'problem-import'
  | 'custom-review';

type TestSurface = 'slides' | 'chat' | 'problems' | 'review';

const TEST_SURFACE_STORAGE_KEY = 'syntara-test-center:active-surface';
const TEST_SURFACES = new Set<TestSurface>(['slides', 'chat', 'problems', 'review']);

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
  chips: string[];
  accentClass: string;
  icon: 'file' | 'problem' | 'presentation' | 'code' | 'review';
}

interface SlideTestSection {
  id: string;
  title: string;
  description: string;
  entries: TestEntry[];
  deprecated?: boolean;
}

interface ChatTestEntry {
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  href: string;
  disabled?: boolean;
  disabledText?: string;
  chips: string[];
  suggestedPrompt: string;
  icon: 'message' | 'group' | 'notebook' | 'render';
}

const TEST_ENTRIES: TestEntry[] = [
  {
    id: 'html-pipeline',
    title: 'HTML 生成管线分步测试',
    eyebrow: 'Source → coursePlan → slideOutlines',
    description:
      '独立验收 Source Package、coursePlan、slideOutlines 和 slides[].htmlPrompt，再进入整节课/整本 notebook HTML 生成。',
    href: '/generation-html-pipeline-test',
    chips: ['source package', 'coursePlan', 'slideOutlines', 'htmlPrompt gate'],
    accentClass: 'from-emerald-500 to-blue-400',
    icon: 'code',
  },
  {
    id: 'single-page',
    title: '单页生成质量测试',
    eyebrow: 'SceneOutline / Layout Template',
    description:
      '沿用原来的单页生成链路，测试 SceneOutline、layout template、语义内容渲染和 stage 结果质量。',
    href: '/generation-quality',
    chips: ['scene outline', 'layout template', 'stage render'],
    accentClass: 'from-blue-500 to-cyan-400',
    icon: 'presentation',
  },
  {
    id: 'html-single-page',
    title: 'HTML 单页质量测试',
    eyebrow: 'HTML / 页面类型 / 16:9',
    description:
      '直接让模型生成一张 16:9 HTML/CSS PPT，按介绍、总结、流程、表格、数学、代码、例题检查稳定性。',
    href: '/generation-html-single-page-test',
    chips: ['prompt to html', 'page kind QA', 'iframe preview'],
    accentClass: 'from-sky-500 to-emerald-400',
    icon: 'code',
  },
  {
    id: 'file-page',
    title: '文件逐页生成测试',
    eyebrow: 'testfile / 3 个文件 / 一页一页生成',
    description:
      '读取 testfile 里的 Markdown、PDF、PPTX，转成 SceneOutline 队列，每次只生成当前页，适合检查上下文承接和真实文件输入。',
    href: '/generation-file-test',
    chips: ['generation-file-test', 'testfile fixtures', 'saved generations'],
    accentClass: 'from-violet-500 to-amber-400',
    icon: 'file',
  },
  {
    id: 'html-file-page',
    title: '文件逐页 HTML 生成测试',
    eyebrow: 'testfile / HTML / 逐页生成',
    description:
      '读取同一批 testfile 固定样本，每次只把当前页直接生成一张 16:9 HTML/CSS PPT，用 iframe 检查真实 DOM 版式。',
    href: '/generation-html-file-test',
    chips: ['testfile fixtures', 'prompt to html', 'iframe QA'],
    accentClass: 'from-cyan-500 to-violet-500',
    icon: 'code',
  },
  {
    id: 'html-lesson',
    title: 'HTML 整节课生成测试',
    eyebrow: 'testfile / 页数档位 / 整课规划',
    description:
      '先根据 testfile 文件和页数档位规划整节课，再为每页写 HTML prompt 并一键生成整套 16:9 HTML slides。',
    href: '/generation-html-lesson-test',
    chips: ['lesson plan', 'page budget', 'prompt to html'],
    accentClass: 'from-blue-500 to-emerald-400',
    icon: 'code',
  },
  {
    id: 'html-notebook',
    title: 'HTML 整本笔记本生成测试',
    eyebrow: 'testfile 科目文件 / 页数档位 / 全书规划',
    description:
      '读取 testfile/科目测试 下按科目分组的文件 notebook，先规划整本笔记本，再并行生成每页 16:9 HTML slides。',
    href: '/generation-html-notebook-test',
    chips: ['file notebook', 'subject route', 'parallel html'],
    accentClass: 'from-emerald-500 to-sky-400',
    icon: 'code',
  },
  {
    id: 'problem-import',
    title: 'PDF 导题测试',
    eyebrow: 'PDF / 题目抽取 / 数据库保存',
    description:
      '上传 PDF 后解析题目，生成题库草稿，并把导入记录持久化到通用测试结果表，刷新后继续查看上一次结果。',
    href: '/problem-import-test',
    chips: ['pdf import', 'problem drafts', 'persistent QA'],
    accentClass: 'from-rose-500 to-orange-400',
    icon: 'problem',
  },
  {
    id: 'custom-review',
    title: '复习计划生成分步测试',
    eyebrow: 'Profile → problemBank → readiness → route',
    description:
      '先验收学生画像、题库与场景 payload，再体检题库，最后调用正式复习路线 API 生成并验收整套复习计划。',
    href: '/custom-review-test',
    chips: ['student profile', 'problemBank gate', 'review route QA'],
    accentClass: 'from-indigo-500 to-emerald-400',
    icon: 'review',
  },
];

const HTML_PIPELINE_TEST_IDS = new Set<TestKind>(['html-pipeline']);
const HTML_OUTPUT_REGRESSION_TEST_IDS = new Set<TestKind>([
  'html-single-page',
  'html-file-page',
  'html-lesson',
  'html-notebook',
]);
const BUILT_IN_LAYOUT_TEST_IDS = new Set<TestKind>(['single-page', 'file-page']);

const SLIDE_TEST_SECTIONS: SlideTestSection[] = [
  {
    id: 'html-pipeline',
    title: 'HTML 主流程分步测试',
    description:
      '先逐步验收 Source Package、coursePlan、slideOutlines 和 slides[].htmlPrompt；前一 gate 通过后，才进入后一 gate。',
    entries: TEST_ENTRIES.filter((entry) => HTML_PIPELINE_TEST_IDS.has(entry.id)),
  },
  {
    id: 'html-output-regression',
    title: 'HTML 输出回归测试',
    description:
      '这些是不同输入粒度的输出回归入口，不再当作生成逻辑的前后步骤；主流程以分步管线测试为准。',
    entries: TEST_ENTRIES.filter((entry) => HTML_OUTPUT_REGRESSION_TEST_IDS.has(entry.id)),
  },
  {
    id: 'built-in-layout',
    title: '内置版式测试',
    description:
      '已弃用，仅保留作历史回归参考；主链路以 HTML 生成管线为准，不再继续扩展内置 layout template。',
    entries: TEST_ENTRIES.filter((entry) => BUILT_IN_LAYOUT_TEST_IDS.has(entry.id)),
    deprecated: true,
  },
];

const SLIDE_TEST_ENTRIES = SLIDE_TEST_SECTIONS.flatMap((section) => section.entries);
const PROBLEM_IMPORT_TEST_ENTRIES = TEST_ENTRIES.filter((entry) => entry.id === 'problem-import');
const REVIEW_TEST_ENTRIES = TEST_ENTRIES.filter((entry) => entry.id === 'custom-review');

function readStoredTestSurface(): TestSurface {
  if (typeof window === 'undefined') return 'slides';
  try {
    const value = window.localStorage.getItem(TEST_SURFACE_STORAGE_KEY);
    return TEST_SURFACES.has(value as TestSurface) ? (value as TestSurface) : 'slides';
  } catch {
    return 'slides';
  }
}

function buildChatTestEntries(args: {
  courseId: string | null;
  courseName: string;
  firstNotebook: StageListItem | null;
  notebookCount: number;
}): ChatTestEntry[] {
  const hasCourse = Boolean(args.courseId?.trim());
  const orchestratorPrivateHref = `/chat?agent=${encodeURIComponent(COURSE_ORCHESTRATOR_ID)}`;
  const notebookHref = args.firstNotebook
    ? `/chat?notebook=${encodeURIComponent(args.firstNotebook.id)}`
    : orchestratorPrivateHref;

  return [
    {
      id: 'orchestrator-private',
      title: '课程总控私聊',
      eyebrow: args.courseName || 'Course Orchestrator',
      description: '验证总控能读取当前课程与笔记本页面摘要，直接回答并引用具体来源。',
      href: orchestratorPrivateHref,
      disabled: !hasCourse,
      disabledText: '先进入一门课程',
      chips: ['courseContext', 'citation', 'direct answer'],
      suggestedPrompt: '请根据这门课的笔记，解释一个我现在最应该复习的核心概念，并标明来源。',
      icon: 'message',
    },
    {
      id: 'orchestrator-group',
      title: '总控自动调度',
      eyebrow: `${args.notebookCount || 0} notebooks`,
      description: '验证单笔记本会转发给对应笔记本，多笔记本才由总控自动创建或复用群聊。',
      href: orchestratorPrivateHref,
      disabled: !hasCourse,
      disabledText: '先进入一门课程',
      chips: ['route decision', 'single handoff', 'group only when multi'],
      suggestedPrompt: '综合比较这门课里最相关的几个笔记本，把它们串成一条复习路线。',
      icon: 'group',
    },
    {
      id: 'notebook-direct',
      title: '笔记本直聊',
      eyebrow: args.firstNotebook?.name || 'Notebook QA',
      description: '验证笔记本问答仍优先显示结构化 answerDocument，fallback 文本支持富文本。',
      href: notebookHref,
      disabled: !args.firstNotebook,
      disabledText: hasCourse ? '当前课程暂无笔记本' : '先进入一门课程',
      chips: ['answerDocument', 'fallback markdown', 'references'],
      suggestedPrompt: '请总结这个笔记本的前三页，并给我一个带公式或代码块的例子。',
      icon: 'notebook',
    },
    {
      id: 'rich-rendering',
      title: 'Markdown / 公式渲染',
      eyebrow: 'Streamdown',
      description: '验证 Agent 气泡能正确渲染列表、代码块、行内/块级公式。',
      href: orchestratorPrivateHref,
      disabled: !hasCourse,
      disabledText: '先进入一门课程',
      chips: ['markdown', 'latex', 'code block'],
      suggestedPrompt:
        '用 Markdown 列表、一个 TypeScript 代码块和一个 LaTeX 公式解释这节课的一个知识点。',
      icon: 'render',
    },
  ];
}

const EMPTY_TEST_STATUS: TestStatus = {
  generatedCount: 0,
  errorCount: 0,
  lastUpdatedAt: null,
};

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
  const stateRow = entryRows.find((row) => row.resultKey === 'state');
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
    'html-pipeline': { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
    'html-single-page': { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
    'file-page': { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
    'html-file-page': { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
    'html-lesson': { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
    'html-notebook': { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
    'problem-import': { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
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
          ? 'PDF 题目抽取、题库草稿、校验错误和导入结果。'
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
                    题目导入
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
                  <h2 className="text-xl font-semibold tracking-normal">题目导入测试</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    单独验收 PDF 解析、题目抽取、草稿校验和数据库持久化。
                  </p>
                </div>
                <Badge variant="secondary" className="w-fit rounded-md">
                  PDF Import
                </Badge>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                {PROBLEM_IMPORT_TEST_ENTRIES.map((entry) => {
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
                            <div className="text-[11px] font-medium text-slate-400">草稿</div>
                            <div className="mt-0.5 font-semibold text-slate-900">
                              {status.generatedCount}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] font-medium text-slate-400">待修正</div>
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
