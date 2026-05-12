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
  ImageIcon,
  MessageSquare,
  Presentation,
  RefreshCw,
  Users,
} from 'lucide-react';
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

const SINGLE_PAGE_STORAGE_KEY = 'syntara:generation-quality:v2';
const HTML_SINGLE_PAGE_STORAGE_KEY = 'syntara:generation-quality-html:v3';
const FILE_PAGE_STORAGE_KEY = 'syntara:file-page-generation-test:v14';
const HTML_FILE_PAGE_STORAGE_KEY = 'syntara:html-file-page-generation-test:v1';
const HTML_LESSON_STORAGE_KEY = 'syntara:html-lesson-generation-test:v1';
const PROBLEM_IMPORT_STORAGE_KEY = 'syntara:problem-import-test:v1';
const IMAGE_TEST_STORAGE_KEY = 'syntara:image-generation-test:v1';
const PPT_IMAGE_TEST_STORAGE_KEY = 'syntara:ppt-image-generation-test:v1';
const HTML_PPT_TEST_STORAGE_KEY = 'syntara:html-ppt-test:v1';

type TestKind =
  | 'single-page'
  | 'html-single-page'
  | 'file-page'
  | 'html-file-page'
  | 'html-lesson'
  | 'problem-import'
  | 'image'
  | 'ppt-image'
  | 'html-ppt';

type TestSurface = 'slides' | 'chat';

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
  icon: 'file' | 'problem' | 'image' | 'presentation' | 'code';
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
    id: 'single-page',
    title: '单页生成质量测试',
    eyebrow: 'SceneOutline / Layout Template',
    description:
      '沿用原来的单页生成链路，测试 SceneOutline、layout template、语义内容渲染和 stage 结果质量。',
    href: '/generation-quality',
    storageKey: SINGLE_PAGE_STORAGE_KEY,
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
    storageKey: HTML_SINGLE_PAGE_STORAGE_KEY,
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
    storageKey: FILE_PAGE_STORAGE_KEY,
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
    storageKey: HTML_FILE_PAGE_STORAGE_KEY,
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
    storageKey: HTML_LESSON_STORAGE_KEY,
    chips: ['lesson plan', 'page budget', 'prompt to html'],
    accentClass: 'from-blue-500 to-emerald-400',
    icon: 'code',
  },
  {
    id: 'problem-import',
    title: 'PDF 导题测试',
    eyebrow: 'PDF / 题目抽取 / 本地保存',
    description:
      '上传 PDF 后解析题目，生成题库草稿，并把导入记录持久化在本地，刷新后继续查看上一次结果。',
    href: '/problem-import-test',
    storageKey: PROBLEM_IMPORT_STORAGE_KEY,
    chips: ['pdf import', 'problem drafts', 'persistent QA'],
    accentClass: 'from-rose-500 to-orange-400',
    icon: 'problem',
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
  {
    id: 'ppt-image',
    title: 'PPT 图片测试',
    eyebrow: '16:9 PPT 素材 / 单张生成',
    description:
      '只调用图片生成接口生成一张 16:9 PPT 位图，用来检查图片模型是否适合 PPT 视觉素材。',
    href: '/generation-ppt-image-test',
    storageKey: PPT_IMAGE_TEST_STORAGE_KEY,
    chips: ['ppt visual', '16:9 image', 'model QA'],
    accentClass: 'from-indigo-500 to-sky-400',
    icon: 'presentation',
  },
  {
    id: 'html-ppt',
    title: 'HTML PPT 页面测试',
    eyebrow: 'Prompt / HTML / 16:9 slide',
    description: '直接让模型生成一页自包含 HTML/CSS PPT，用真实 DOM 和 iframe 预览检查版式质量。',
    href: '/generation-html-ppt-test',
    storageKey: HTML_PPT_TEST_STORAGE_KEY,
    chips: ['prompt to html', 'iframe preview', 'persistent QA'],
    accentClass: 'from-fuchsia-500 to-indigo-400',
    icon: 'code',
  },
];

function buildChatTestEntries(args: {
  courseId: string | null;
  courseName: string;
  firstNotebook: StageListItem | null;
  notebookCount: number;
}): ChatTestEntry[] {
  const hasCourse = Boolean(args.courseId?.trim());
  const orchestratorPrivateHref = `/chat?agent=${encodeURIComponent(COURSE_ORCHESTRATOR_ID)}`;
  const orchestratorGroupHref = `/chat?agent=${encodeURIComponent(COURSE_ORCHESTRATOR_ID)}&view=group`;
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
      title: '总控群聊路由',
      eyebrow: `${args.notebookCount || 0} notebooks`,
      description: '验证单/多笔记本路由：综合、比较、串联类问题应触发多笔记本协作。',
      href: orchestratorGroupHref,
      disabled: !hasCourse,
      disabledText: '先进入一门课程',
      chips: ['route decision', 'multi notebook', 'summary'],
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
  if (entry.id === 'single-page') {
    const resultMap = getRecord(saved.resultsByPreset);
    const errorMap = getRecord(saved.errorsByPreset);
    const promptPreviewErrorMap = getRecord(saved.promptPreviewErrorsByPreset);
    const timestamps = [
      ...Object.values(resultMap),
      ...Object.values(errorMap),
      ...Object.values(promptPreviewErrorMap),
    ]
      .map(getCreatedAt)
      .filter((value): value is number => value !== null);

    return {
      generatedCount: Object.keys(resultMap).length,
      errorCount: Object.keys(errorMap).length + Object.keys(promptPreviewErrorMap).length,
      lastUpdatedAt: timestamps.length > 0 ? Math.max(...timestamps) : null,
    };
  }

  if (
    entry.id === 'html-single-page' ||
    entry.id === 'image' ||
    entry.id === 'ppt-image' ||
    entry.id === 'html-ppt'
  ) {
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

  if (entry.id === 'html-lesson') {
    const planMap = getRecord(saved.plansByKey);
    const htmlMap = getRecord(saved.htmlBySlide);
    const errorMap = getRecord(saved.errorsBySlide);
    const planErrorMap = getRecord(saved.planErrorsByKey);
    const timestamps = [
      ...Object.values(planMap),
      ...Object.values(htmlMap),
      ...Object.values(errorMap),
      ...Object.values(planErrorMap),
    ]
      .map(getCreatedAt)
      .filter((value): value is number => value !== null);

    return {
      generatedCount: Object.keys(htmlMap).length,
      errorCount: Object.keys(errorMap).length + Object.keys(planErrorMap).length,
      lastUpdatedAt: timestamps.length > 0 ? Math.max(...timestamps) : null,
    };
  }

  if (entry.id === 'problem-import') {
    const runs = Array.isArray(saved.runs) ? saved.runs : [];
    const drafts = runs.flatMap((run) =>
      isRecord(run) && Array.isArray(run.drafts) ? run.drafts : [],
    );
    const timestamps = runs.map(getCreatedAt).filter((value): value is number => value !== null);
    const validationErrorCount = drafts.filter(
      (draft) =>
        isRecord(draft) &&
        Array.isArray(draft.validationErrors) &&
        draft.validationErrors.length > 0,
    ).length;

    return {
      generatedCount: drafts.length,
      errorCount: validationErrorCount,
      lastUpdatedAt: timestamps.length > 0 ? Math.max(...timestamps) : null,
    };
  }

  const resultMap = getRecord(saved.resultsByPage);
  const errorMap = getRecord(saved.errorsByPage);
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

function getTestIcon(icon: TestEntry['icon']) {
  if (icon === 'image') return ImageIcon;
  if (icon === 'presentation') return Presentation;
  if (icon === 'problem') return FileQuestion;
  if (icon === 'code') return FileCode2;
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
  const [notebookCache, setNotebookCache] = useState<{
    courseId: string | null;
    notebooks: StageListItem[];
  }>({ courseId: null, notebooks: [] });
  const [statuses, setStatuses] = useState<Record<TestKind, TestStatus>>({
    'single-page': { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
    'html-single-page': { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
    'file-page': { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
    'html-file-page': { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
    'html-lesson': { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
    'problem-import': { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
    image: { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
    'ppt-image': { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
    'html-ppt': { generatedCount: 0, errorCount: 0, lastUpdatedAt: null },
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

  useEffect(() => {
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
  }, [courseId]);

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
      ? '幻灯片、HTML PPT、文件逐页生成、图片素材和导题链路。'
      : '课程总控、群聊路由、笔记本直聊和富文本消息渲染。';

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
                <p className="text-sm font-medium text-slate-500">Syntara QA</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-normal">测试中心</h1>
                <p className="mt-2 text-sm leading-6 text-slate-600">{activeDescription}</p>
              </div>

              <div className="flex flex-col gap-3 lg:items-end">
                <TabsList className="grid h-10 w-full grid-cols-2 rounded-lg border border-slate-200 bg-white p-1 shadow-sm lg:w-[360px]">
                  <TabsTrigger value="slides" className="gap-2 rounded-md text-sm">
                    <Presentation className="size-4" />
                    幻灯片生成
                  </TabsTrigger>
                  <TabsTrigger value="chat" className="gap-2 rounded-md text-sm">
                    <MessageSquare className="size-4" />
                    课程聊天
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
                  <p className="mt-1 text-sm text-slate-500">共 {TEST_ENTRIES.length} 条测试链路</p>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                {TEST_ENTRIES.map((entry) => {
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
                            <div className="text-[11px] font-medium text-slate-400">已生成</div>
                            <div className="mt-0.5 font-semibold text-slate-900">
                              {status.generatedCount}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] font-medium text-slate-400">
                              {entry.id === 'problem-import' ? '待修正' : '失败'}
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
        </Tabs>
      </div>
    </main>
  );
}
