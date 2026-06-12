'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { code } from '@streamdown/code';
import { createMathPlugin } from '@streamdown/math';
import { BookOpen, Brain, Database, Loader2, Lock, Share2 } from 'lucide-react';
import { Streamdown } from 'streamdown';
import { MemoryPageHeader } from '@/components/memory/memory-page-header';
import { getDefaultCoursePublicMemories } from '@/lib/learning/default-public-memories';
import {
  getLocalStudyMemoryUserId,
  loadStudyMemory,
  type NotebookMemoryItem,
  type WeakPointMemory,
} from '@/lib/learning/study-memory';
import { cn } from '@/lib/utils';
import { getCourse } from '@/lib/utils/course-storage';
import type { CourseRecord } from '@/lib/utils/database';
import { listStagesByCourse, type StageListItem } from '@/lib/utils/stage-storage';
import { listStudyMemoryRecords, type StudyMemoryApiRecord } from '@/lib/utils/study-memory-api';

type CourseMemoryPageClientProps = {
  courseId: string;
};

type PublicMemoryView = {
  id: string;
  title: string;
  text: string;
  sourceLabel: string;
  updatedAt?: number;
};

type PrivateMemoryView = {
  id: string;
  title: string;
  text: string;
  sourceLabel: string;
  notebookName?: string;
  updatedAt?: number;
};

type NotebookMemoryRecordBundle = {
  notebookId: string;
  memories: StudyMemoryApiRecord[];
};

const markdownMath = createMathPlugin({ singleDollarTextMath: true });

function isActive(record: { status?: string | null }) {
  return record.status !== 'archived';
}

function formatTime(value?: number): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function apiPublicMemory(record: StudyMemoryApiRecord): PublicMemoryView {
  return {
    id: `db:${record.id}`,
    title: record.title,
    text: record.text,
    sourceLabel: '数据库课程记忆',
    updatedAt: Date.parse(record.updatedAt),
  };
}

function defaultPublicMemory(memory: NotebookMemoryItem): PublicMemoryView {
  return {
    id: `default:${memory.id}`,
    title: memory.title,
    text: memory.text,
    sourceLabel: '默认课程记忆',
    updatedAt: memory.updatedAt,
  };
}

function notebookPublicMemory(
  notebook: StageListItem,
  memory: NotebookMemoryItem,
): PublicMemoryView {
  return {
    id: `notebook:${notebook.id}:${memory.id}`,
    title: `${notebook.name}：${memory.title}`,
    text: memory.text,
    sourceLabel: '笔记本公共记忆',
    updatedAt: memory.updatedAt,
  };
}

function notebookApiPublicMemory(
  notebook: StageListItem,
  record: StudyMemoryApiRecord,
): PublicMemoryView {
  return {
    id: `db-notebook:${notebook.id}:${record.id}`,
    title: `${notebook.name}：${record.title}`,
    text: record.text,
    sourceLabel: '数据库笔记本记忆',
    updatedAt: Date.parse(record.updatedAt),
  };
}

function apiPrivateMemory(record: StudyMemoryApiRecord): PrivateMemoryView {
  return {
    id: `db:${record.id}`,
    title: record.title,
    text: record.text,
    sourceLabel: '数据库课程私有记忆',
    updatedAt: Date.parse(record.updatedAt),
  };
}

function notebookApiPrivateMemory(
  notebook: StageListItem,
  record: StudyMemoryApiRecord,
): PrivateMemoryView {
  return {
    id: `db-notebook-private:${notebook.id}:${record.id}`,
    title: record.title,
    text: record.text,
    sourceLabel: '数据库笔记本私有记忆',
    notebookName: notebook.name,
    updatedAt: Date.parse(record.updatedAt),
  };
}

function notebookPrivateMemory(
  notebook: StageListItem,
  memory: NotebookMemoryItem,
): PrivateMemoryView {
  return {
    id: `private:${notebook.id}:${memory.id}`,
    title: memory.title,
    text: memory.text,
    sourceLabel: '笔记本私有记忆',
    notebookName: notebook.name,
    updatedAt: memory.updatedAt,
  };
}

function weakPointMemory(notebook: StageListItem, point: WeakPointMemory): PrivateMemoryView {
  return {
    id: `weak:${notebook.id}:${point.id}`,
    title: point.title,
    text: point.reason,
    sourceLabel: '待复习弱点',
    notebookName: notebook.name,
    updatedAt: point.reviewedAt || point.createdAt,
  };
}

function buildCoursePublicMarkdown(args: {
  courseName: string;
  courseMemories: PublicMemoryView[];
  notebookMemories: PublicMemoryView[];
}): string {
  const lines = [`# ${args.courseName} 课程记忆`, '', '> 这是课程层面的公共知识地图。', ''];

  if (args.courseMemories.length > 0) {
    lines.push('## 课程公共记忆', '');
    for (const memory of args.courseMemories) {
      lines.push(`### ${memory.title}`, '', memory.text.trim(), '');
    }
  }

  if (args.notebookMemories.length > 0) {
    lines.push('## 笔记本记忆索引', '');
    for (const memory of args.notebookMemories) {
      const summary = memory.text
        .replace(/```[\s\S]*?```/g, '')
        .replace(/[#>*|`]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 220);
      lines.push(`- **${memory.title}**：${summary || '已写入公共知识点。'}`);
    }
  }

  if (args.courseMemories.length === 0 && args.notebookMemories.length === 0) {
    lines.push('## 暂无公共记忆', '', '- 课程或笔记本写入公共记忆后，会在这里汇总。');
  }

  return lines.join('\n').trim();
}

function MarkdownDocument({ markdown }: { markdown: string }) {
  return (
    <div className="rounded-[20px] border border-slate-200/85 bg-white/92 p-4 shadow-sm dark:border-white/10 dark:bg-black/18 md:p-5">
      <div className="mb-4 flex min-w-0 items-center justify-between gap-3 border-b border-slate-200/80 pb-3 dark:border-white/10">
        <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-bold uppercase tracking-normal text-white dark:bg-white dark:text-slate-950">
          Markdown
        </span>
        <span className="truncate text-[11px] font-semibold text-slate-400 dark:text-slate-500">
          course-memory.md
        </span>
      </div>
      <Streamdown
        mode="static"
        plugins={{ code, math: markdownMath }}
        className={cn(
          'text-sm leading-7 text-slate-700 dark:text-slate-200',
          '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
          '[&_h1]:mb-4 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:leading-tight [&_h1]:text-slate-950 dark:[&_h1]:text-white',
          '[&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:border-b [&_h2]:border-slate-200 [&_h2]:pb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-900 dark:[&_h2]:border-white/10 dark:[&_h2]:text-white',
          '[&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-slate-900 dark:[&_h3]:text-slate-100',
          '[&_p]:my-3 [&_p]:text-slate-600 dark:[&_p]:text-slate-300',
          '[&_blockquote]:my-4 [&_blockquote]:rounded-2xl [&_blockquote]:border-l-4 [&_blockquote]:border-emerald-400 [&_blockquote]:bg-emerald-50/70 [&_blockquote]:px-4 [&_blockquote]:py-3 [&_blockquote]:text-sm [&_blockquote]:text-emerald-900 dark:[&_blockquote]:bg-emerald-500/10 dark:[&_blockquote]:text-emerald-100',
          '[&_ul]:my-3 [&_ul]:grid [&_ul]:gap-1.5 [&_ul]:pl-5 [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-slate-950 dark:[&_strong]:text-white',
          '[&_table]:my-4 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:rounded-xl [&_table]:border [&_table]:border-slate-200 [&_table]:text-left dark:[&_table]:border-white/10',
          '[&_thead]:bg-slate-50 dark:[&_thead]:bg-white/8 [&_th]:whitespace-nowrap [&_th]:border-b [&_th]:border-slate-200 [&_th]:px-3 [&_th]:py-2 [&_th]:text-xs [&_th]:font-semibold [&_th]:text-slate-700 dark:[&_th]:border-white/10 dark:[&_th]:text-slate-200',
          '[&_td]:border-b [&_td]:border-slate-100 [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_td]:text-xs [&_td]:leading-5 dark:[&_td]:border-white/8',
        )}
      >
        {markdown}
      </Streamdown>
    </div>
  );
}

export function CourseMemoryPageClient({ courseId }: CourseMemoryPageClientProps) {
  const [course, setCourse] = useState<CourseRecord | null | undefined>(undefined);
  const [notebooks, setNotebooks] = useState<StageListItem[]>([]);
  const [dbMemories, setDbMemories] = useState<StudyMemoryApiRecord[]>([]);
  const [dbNotebookMemories, setDbNotebookMemories] = useState<NotebookMemoryRecordBundle[]>([]);
  const [dbAvailable, setDbAvailable] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [loadedCourse, loadedNotebooks, loadedMemories] = await Promise.all([
        getCourse(courseId),
        listStagesByCourse(courseId).catch(() => []),
        listStudyMemoryRecords({ targetType: 'course', targetId: courseId })
          .then((memories) => ({ ok: true, memories }))
          .catch(() => ({ ok: false, memories: [] as StudyMemoryApiRecord[] })),
      ]);
      const loadedNotebookMemories =
        loadedMemories.ok && loadedNotebooks.length > 0
          ? await Promise.all(
              loadedNotebooks.map((notebook) =>
                listStudyMemoryRecords({ targetType: 'notebook', targetId: notebook.id })
                  .then((memories) => ({ notebookId: notebook.id, memories }))
                  .catch(() => ({ notebookId: notebook.id, memories: [] })),
              ),
            )
          : [];
      if (!alive) return;
      setCourse(loadedCourse ?? null);
      setNotebooks(loadedNotebooks);
      setDbMemories(loadedMemories.memories);
      setDbNotebookMemories(loadedNotebookMemories);
      setDbAvailable(loadedMemories.ok);
    })();
    return () => {
      alive = false;
    };
  }, [courseId]);

  const userId = getLocalStudyMemoryUserId();
  const notebookProfiles = useMemo(
    () =>
      notebooks.map((notebook) => ({
        notebook,
        profile: loadStudyMemory(userId, notebook.id),
      })),
    [notebooks, userId],
  );

  const dbPublicMemories = useMemo(
    () => dbMemories.filter((memory) => memory.scope === 'public' && isActive(memory)),
    [dbMemories],
  );
  const notebooksById = useMemo(
    () => new Map(notebooks.map((notebook) => [notebook.id, notebook] as const)),
    [notebooks],
  );
  const dbNotebookPublicMemories = useMemo(
    () =>
      dbNotebookMemories.flatMap(({ notebookId, memories }) => {
        const notebook = notebooksById.get(notebookId);
        if (!notebook) return [];
        return memories
          .filter((memory) => memory.scope === 'public' && isActive(memory))
          .map((memory) => notebookApiPublicMemory(notebook, memory));
      }),
    [dbNotebookMemories, notebooksById],
  );
  const coursePublicMemories = useMemo(() => {
    if (!course) return [];
    if (dbPublicMemories.length > 0) return dbPublicMemories.map(apiPublicMemory);
    return getDefaultCoursePublicMemories(course).map(defaultPublicMemory);
  }, [course, dbPublicMemories]);
  const notebookPublicMemories = useMemo(
    () =>
      [
        ...dbNotebookPublicMemories,
        ...notebookProfiles.flatMap(({ notebook, profile }) =>
          profile.publicMemories
            .filter(isActive)
            .map((memory) => notebookPublicMemory(notebook, memory)),
        ),
      ].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    [dbNotebookPublicMemories, notebookProfiles],
  );
  const privateMemories = useMemo(() => {
    const dbPrivate = dbMemories
      .filter((memory) => memory.scope === 'private' && isActive(memory))
      .map(apiPrivateMemory);
    const dbNotebookPrivate = dbNotebookMemories.flatMap(({ notebookId, memories }) => {
      const notebook = notebooksById.get(notebookId);
      if (!notebook) return [];
      return memories
        .filter((memory) => memory.scope === 'private' && isActive(memory))
        .map((memory) => notebookApiPrivateMemory(notebook, memory));
    });
    const notebookPrivate = notebookProfiles.flatMap(({ notebook, profile }) => [
      ...profile.privateMemories
        .filter(isActive)
        .map((memory) => notebookPrivateMemory(notebook, memory)),
      ...profile.weakPoints
        .filter((point) => point.status === 'open')
        .map((point) => weakPointMemory(notebook, point)),
    ]);
    return [...dbPrivate, ...dbNotebookPrivate, ...notebookPrivate].sort(
      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
    );
  }, [dbMemories, dbNotebookMemories, notebookProfiles, notebooksById]);

  const publicMarkdown = useMemo(
    () =>
      buildCoursePublicMarkdown({
        courseName: course?.name || '课程',
        courseMemories: coursePublicMemories,
        notebookMemories: notebookPublicMemories,
      }),
    [course?.name, coursePublicMemories, notebookPublicMemories],
  );

  if (course === undefined) {
    return (
      <main className="min-h-full bg-[#f3f6fb] text-slate-950 dark:bg-[#0e1117] dark:text-white">
        <div className="mx-auto flex w-full max-w-[86rem] flex-col gap-4 px-3 py-4 md:px-5 lg:px-6">
          <MemoryPageHeader
            title="课程记忆"
            subtitle="正在读取课程公共记忆、笔记本索引和私有学习状态。"
            eyebrow="课程记忆"
            backHref="/my-courses"
            backLabel="返回我的课程"
            icon={Brain}
          />
          <div className="flex min-h-[20rem] items-center justify-center">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/80 px-5 py-4 text-sm font-medium text-slate-500 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-300">
              <Loader2 className="size-4 animate-spin text-[#007AFF]" />
              正在读取课程记忆…
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!course) {
    return (
      <main className="min-h-full bg-[#f3f6fb] text-slate-950 dark:bg-[#0e1117] dark:text-white">
        <div className="mx-auto flex w-full max-w-[86rem] flex-col gap-4 px-3 py-4 md:px-5 lg:px-6">
          <MemoryPageHeader
            title="课程记忆"
            subtitle="该课程可能已删除，或当前环境暂时无法加载它。"
            eyebrow="课程记忆"
            backHref="/my-courses"
            backLabel="返回我的课程"
            icon={Brain}
          />
          <div className="flex min-h-[20rem] items-center justify-center">
            <div className="max-w-md rounded-3xl border border-slate-200/80 bg-white/86 p-7 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/[0.06]">
              <BookOpen className="mx-auto size-10 text-slate-400" strokeWidth={1.5} />
              <h2 className="mt-4 text-lg font-semibold text-slate-950 dark:text-white">
                未找到课程
              </h2>
              <Link
                href="/my-courses"
                className="mt-5 inline-flex h-9 items-center justify-center rounded-xl bg-[#007AFF] px-4 text-sm font-semibold text-white"
              >
                返回我的课程
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-full bg-[#f3f6fb] text-slate-950 dark:bg-[#0e1117] dark:text-white">
      <div className="mx-auto flex w-full max-w-[86rem] flex-col gap-4 px-3 py-4 md:px-5 lg:px-6">
        <MemoryPageHeader
          title="课程记忆"
          subtitle={[course.name, course.courseCode].filter(Boolean).join(' · ')}
          eyebrow="课程记忆"
          backHref={`/course/${encodeURIComponent(course.id)}`}
          backLabel="返回课程"
          icon={Brain}
          actions={
            <span className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200/85 bg-white/82 px-3 text-xs font-semibold text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200">
              <Database className="size-3.5" strokeWidth={1.8} />
              {dbAvailable ? '数据库已连接' : '本地默认记忆'}
            </span>
          }
        />

        <section className="rounded-[24px] border border-white/80 bg-white/90 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/[0.03] dark:border-white/10 dark:bg-white/[0.065] md:p-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <div className="flex min-w-0 gap-4">
              <div className="flex size-20 shrink-0 items-center justify-center rounded-3xl border border-blue-200/80 bg-blue-50 text-blue-600 shadow-sm dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-200">
                <Brain className="size-8" strokeWidth={1.6} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span>当前课程</span>
                  {course.courseCode ? <span>{course.courseCode}</span> : null}
                </div>
                <h1 className="mt-2 line-clamp-2 text-2xl font-semibold leading-tight tracking-normal text-slate-950 dark:text-white md:text-3xl">
                  {course.name} 记忆
                </h1>
                {course.description ? (
                  <p className="mt-2 line-clamp-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {course.description}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { label: '课程公共记忆', value: coursePublicMemories.length, hint: 'course' },
                { label: '笔记本索引', value: notebookPublicMemories.length, hint: 'notebooks' },
                { label: '私有记忆', value: privateMemories.length, hint: 'user' },
              ].map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-2xl border border-slate-200/85 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-white/[0.045]"
                >
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    {metric.label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950 dark:text-white">
                    {metric.value}
                  </p>
                  <p className="mt-1 text-[10px] font-medium text-slate-400 dark:text-slate-500">
                    {metric.hint}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1.16fr)_minmax(22rem,0.84fr)]">
          <section className="min-w-0 overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/90 shadow-[0_18px_58px_rgba(15,23,42,0.07)] dark:border-white/10 dark:bg-white/[0.06]">
            <div className="flex min-w-0 items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-4 dark:border-white/10">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-200">
                  <Share2 className="size-5" strokeWidth={1.8} />
                </span>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-slate-950 dark:text-white">
                    共有记忆
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    课程级 Markdown 知识地图，以及各笔记本的公共记忆索引。
                  </p>
                </div>
              </div>
            </div>
            <div className="grid gap-3 p-3">
              <MarkdownDocument markdown={publicMarkdown} />
            </div>
          </section>

          <section className="min-w-0 overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/90 shadow-[0_18px_58px_rgba(15,23,42,0.07)] dark:border-white/10 dark:bg-white/[0.06]">
            <div className="flex min-w-0 items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-4 dark:border-white/10">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700 dark:bg-violet-500/12 dark:text-violet-200">
                  <Lock className="size-5" strokeWidth={1.8} />
                </span>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-slate-950 dark:text-white">
                    私有记忆
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    当前用户在这门课里的卡点、错题和学习状态。
                  </p>
                </div>
              </div>
              <span className="shrink-0 rounded-full border border-violet-200/80 bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700 dark:border-violet-400/20 dark:bg-violet-500/12 dark:text-violet-200">
                仅自己可见
              </span>
            </div>
            <div className="grid gap-3 p-3">
              {privateMemories.length > 0 ? (
                privateMemories.slice(0, 40).map((memory) => (
                  <article
                    key={memory.id}
                    className="rounded-2xl border border-slate-200/85 bg-white/82 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.055]"
                  >
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <h3 className="truncate text-sm font-semibold text-slate-950 dark:text-white">
                        {memory.title}
                      </h3>
                      {formatTime(memory.updatedAt) ? (
                        <span className="shrink-0 text-[10px] font-semibold text-slate-400">
                          {formatTime(memory.updatedAt)}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 line-clamp-4 text-xs leading-5 text-slate-600 dark:text-slate-300">
                      {memory.text}
                    </p>
                    <p className="mt-3 text-[10px] font-semibold text-slate-400">
                      {[memory.sourceLabel, memory.notebookName].filter(Boolean).join(' · ')}
                    </p>
                  </article>
                ))
              ) : (
                <div className="flex min-h-[10rem] items-center justify-center rounded-2xl border border-dashed border-slate-200/90 bg-white/56 px-5 text-center text-sm text-slate-500 dark:border-white/12 dark:bg-white/[0.035] dark:text-slate-400">
                  暂无课程私有记忆。聊天、错题或复习产生的卡点会汇总到这里。
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
