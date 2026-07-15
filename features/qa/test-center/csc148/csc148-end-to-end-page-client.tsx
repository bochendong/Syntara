'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  BookOpen,
  Bot,
  CheckCircle2,
  Code2,
  FileQuestion,
  Filter,
  GraduationCap,
  ListChecks,
  MessageSquareText,
  Search,
  Sparkles,
} from 'lucide-react';
import { ProblemRichText } from '@/components/problem-bank/problem-rich-text';
import { PlatformTestRunArchive } from '@/features/qa/test-center/components/platform-test-run-archive';
import { cn } from '@/lib/utils';
import type {
  Csc148LocalDataset,
  Csc148LocalNotebook,
  Csc148LocalProblem,
  Csc148LocalProblemType,
  Csc148LocalSearchHit,
  Csc148LocalSection,
} from '@/lib/csc148-local/types';

type Csc148Mode = 'chat' | 'course' | 'problems' | 'results';
type ProblemTypeFilter = 'all' | Csc148LocalProblemType;
type SectionSearchHit = Extract<Csc148LocalSearchHit, { kind: 'section' }>;
type ProblemSearchHit = Extract<Csc148LocalSearchHit, { kind: 'problem' }>;

const PROBLEM_TYPE_LABELS: Record<Csc148LocalProblemType, string> = {
  choice: '选择题',
  code_tracing: '代码追踪',
  short_answer: '简答题',
  code: '代码题',
};

const PROMPT_PRESETS = [
  '我想练 linked list，帮我找课程内容和题库入口',
  'representation invariant 和 class design recipe 怎么复习',
  'tree / BST recursion 有哪些本地题能测',
];

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function queryTokens(query: string): string[] {
  const normalized = normalizeText(
    query
      .replace(/\bri\b/gi, ' representation invariant 表示不变量 ')
      .replace(/链表/g, ' linked list 链表 ')
      .replace(/树/g, ' tree 树 ')
      .replace(/不变量/g, ' invariant representation invariant 不变量 '),
  );

  return [
    ...new Set(
      normalized
        .split(/[\s,，.。;；:：/\\|()[\]{}"'`]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2),
    ),
  ];
}

function scoreFields(tokens: string[], fields: Array<[string | null | undefined, number]>): number {
  if (tokens.length === 0) return 0;
  let score = 0;
  for (const [field, weight] of fields) {
    if (!field) continue;
    const haystack = normalizeText(field);
    for (const token of tokens) {
      if (haystack.includes(token)) score += weight;
    }
  }
  return score;
}

function scoreSection(
  tokens: string[],
  section: Csc148LocalSection,
  notebook: Csc148LocalNotebook,
): number {
  return scoreFields(tokens, [
    [section.title, 8],
    [section.summary, 5],
    [notebook.name, 5],
    [notebook.tags.join(' '), 4],
    [section.markdown, 1],
  ]);
}

function scoreProblem(tokens: string[], problem: Csc148LocalProblem): number {
  return scoreFields(tokens, [
    [problem.title, 9],
    [problem.summary, 7],
    [problem.sectionTitle, 5],
    [problem.notebookTitle, 4],
    [problem.category, 4],
    [problem.tags.join(' '), 4],
    [problem.question, 2],
    [problem.explanation, 1],
    [problem.templateCode, 1],
  ]);
}

function sectionPreview(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/[#>*_`|~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function stripCodeFence(code: string | null): string {
  if (!code) return '';
  const trimmed = code.trim();
  const fenced = trimmed.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```$/);
  return (fenced?.[1] ?? trimmed).trim();
}

function makeHits(
  input: string,
  dataset: Csc148LocalDataset,
  limit: number,
): Csc148LocalSearchHit[] {
  const tokens = queryTokens(input);
  if (tokens.length === 0) return [];

  const sectionHits: Csc148LocalSearchHit[] = dataset.sections
    .map(({ notebook, ...section }) => ({
      kind: 'section' as const,
      id: section.id,
      score: scoreSection(tokens, section, notebook),
      notebook,
      section,
    }))
    .filter((hit) => hit.score > 0);

  const problemHits: Csc148LocalSearchHit[] = dataset.problemBank.problems
    .map((problem) => ({
      kind: 'problem' as const,
      id: problem.id,
      score: scoreProblem(tokens, problem),
      problem,
    }))
    .filter((hit) => hit.score > 0);

  return [...sectionHits, ...problemHits]
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);
}

function ModeButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof BookOpen;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold transition',
        active
          ? 'bg-slate-950 text-white shadow-sm'
          : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-950',
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-500">
      <Search className="h-4 w-4 shrink-0" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-slate-950 outline-none placeholder:text-slate-400"
      />
    </label>
  );
}

function CodeBlock({ code, title }: { code: string; title: string }) {
  const stripped = stripCodeFence(code);
  if (!stripped) return null;

  return (
    <section className="rounded-lg border border-slate-200 bg-slate-950">
      <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2 text-xs font-semibold text-slate-300">
        <Code2 className="h-3.5 w-3.5" />
        <span>{title}</span>
      </div>
      <pre className="max-h-[360px] overflow-auto p-4 font-mono text-[13px] leading-6 text-slate-100">
        <code>{stripped}</code>
      </pre>
    </section>
  );
}

function ProblemList({
  problems,
  activeProblemId,
  onProblemSelect,
}: {
  problems: Csc148LocalProblem[];
  activeProblemId: string;
  onProblemSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {problems.map((problem) => (
        <button
          key={problem.id}
          type="button"
          onClick={() => onProblemSelect(problem.id)}
          className={cn(
            'w-full rounded-lg border p-3 text-left transition',
            problem.id === activeProblemId
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-slate-200 bg-white hover:bg-slate-50',
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
              {PROBLEM_TYPE_LABELS[problem.type]}
            </span>
            <span className="font-mono text-[11px] text-slate-400">{problem.difficulty}</span>
          </div>
          <div className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-slate-950">
            {problem.title}
          </div>
          <div className="mt-2 line-clamp-1 text-xs text-slate-500">
            {problem.sectionTitle || problem.notebookTitle || problem.category}
          </div>
        </button>
      ))}
    </div>
  );
}

function ProblemDetail({ problem }: { problem: Csc148LocalProblem }) {
  const [showSolution, setShowSolution] = useState(false);

  return (
    <article className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-100">
            {PROBLEM_TYPE_LABELS[problem.type]}
          </span>
          <span className="rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-100">
            {problem.difficulty}
          </span>
          {problem.sectionTitle ? (
            <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {problem.sectionTitle}
            </span>
          ) : null}
        </div>
        <h2 className="mt-4 text-xl font-semibold leading-8 text-slate-950">{problem.title}</h2>
        {problem.summary ? (
          <p className="mt-2 text-sm leading-6 text-slate-600">{problem.summary}</p>
        ) : null}
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-950">
          <FileQuestion className="h-4 w-4 text-blue-600" />
          <span>题目</span>
        </div>
        <ProblemRichText content={problem.question} className="text-[15px] leading-8" />
      </section>

      {problem.options.length > 0 ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-950">
            <ListChecks className="h-4 w-4 text-emerald-600" />
            <span>选项</span>
          </div>
          <div className="space-y-2">
            {problem.options.map((option, index) => {
              const id = String.fromCharCode(65 + index);
              const isCorrect = showSolution && problem.correctAnswer?.includes(id);
              return (
                <div
                  key={`${problem.id}-${id}`}
                  className={cn(
                    'flex gap-3 rounded-md border px-3 py-2 text-sm leading-6',
                    isCorrect
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                      : 'border-slate-200 bg-slate-50 text-slate-700',
                  )}
                >
                  <span className="font-mono font-semibold">{id}</span>
                  <ProblemRichText content={option} className="min-w-0 flex-1" />
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <CodeBlock code={problem.templateCode || ''} title="题目代码 / starter code" />
      <CodeBlock code={problem.publicTestCode || ''} title="public tests" />

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>答案与解析</span>
          </div>
          <button
            type="button"
            onClick={() => setShowSolution((value) => !value)}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white"
          >
            <Sparkles className="h-4 w-4" />
            <span>{showSolution ? '隐藏' : '显示'}</span>
          </button>
        </div>
        {showSolution ? (
          <div className="mt-4 space-y-4">
            {problem.correctAnswer ? (
              <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-100">
                正确答案：{problem.correctAnswer}
              </div>
            ) : null}
            {problem.answer ? (
              <ProblemRichText content={problem.answer} className="text-sm leading-7" />
            ) : null}
            {problem.explanation ? (
              <ProblemRichText content={problem.explanation} className="text-sm leading-7" />
            ) : null}
            <CodeBlock code={problem.solutionCode || problem.codeAnswer || ''} title="参考代码" />
          </div>
        ) : null}
      </section>
    </article>
  );
}

function CourseDetail({
  notebook,
  section,
}: {
  notebook: Csc148LocalNotebook;
  section: Csc148LocalSection;
}) {
  return (
    <article className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-blue-50 px-2.5 py-1 font-mono text-xs font-semibold text-blue-700 ring-1 ring-blue-100">
              {notebook.order}
            </span>
            {notebook.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600"
              >
                {tag}
              </span>
            ))}
          </div>
          <h2 className="mt-4 text-xl font-semibold leading-8 text-slate-950">{notebook.name}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{notebook.description}</p>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase text-emerald-700">
              Section {section.order + 1}
            </div>
            <h3 className="mt-1 text-lg font-semibold text-slate-950">{section.title}</h3>
            {section.summary ? (
              <p className="mt-1 text-sm text-slate-500">{section.summary}</p>
            ) : null}
          </div>
        </div>
        <ProblemRichText content={section.markdown} className="text-[15px] leading-8" />
      </section>
    </article>
  );
}

function ChatHitList({
  hits,
  onOpenCourse,
  onOpenProblem,
}: {
  hits: Csc148LocalSearchHit[];
  onOpenCourse: (notebookId: string, sectionId: string) => void;
  onOpenProblem: (problemId: string) => void;
}) {
  if (hits.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
        没有本地命中。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {hits.map((hit) =>
        hit.kind === 'section' ? (
          <button
            key={`section-${hit.id}`}
            type="button"
            onClick={() => onOpenCourse(hit.notebook.id, hit.section.id)}
            className="w-full rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:bg-slate-50"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-950">
                <BookOpen className="h-4 w-4 text-blue-600" />
                {hit.section.title}
              </span>
              <span className="text-xs font-medium text-blue-600">课程内容</span>
            </div>
            <div className="mt-1 text-xs font-medium text-slate-500">{hit.notebook.name}</div>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
              {sectionPreview(hit.section.markdown)}
            </p>
          </button>
        ) : (
          <button
            key={`problem-${hit.id}`}
            type="button"
            onClick={() => onOpenProblem(hit.problem.id)}
            className="w-full rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:bg-slate-50"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-950">
                <FileQuestion className="h-4 w-4 text-emerald-600" />
                {hit.problem.title}
              </span>
              <span className="text-xs font-medium text-emerald-600">题库</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-2">
              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                {PROBLEM_TYPE_LABELS[hit.problem.type]}
              </span>
              {hit.problem.sectionTitle ? (
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                  {hit.problem.sectionTitle}
                </span>
              ) : null}
            </div>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
              {hit.problem.summary || hit.problem.question}
            </p>
          </button>
        ),
      )}
    </div>
  );
}

export function Csc148EndToEndPageClient({
  dataset,
  initialHits,
  initialMode = 'chat',
}: {
  dataset: Csc148LocalDataset;
  initialHits: Csc148LocalSearchHit[];
  initialMode?: Csc148Mode;
}) {
  const [mode, setMode] = useState<Csc148Mode>(initialMode);
  const [query, setQuery] = useState('');
  const [chatInput, setChatInput] = useState(PROMPT_PRESETS[0]);
  const [problemType, setProblemType] = useState<ProblemTypeFilter>('all');
  const [activeNotebookId, setActiveNotebookId] = useState(dataset.notebooks[0]?.id ?? '');
  const [activeSectionId, setActiveSectionId] = useState(
    dataset.notebooks[0]?.sections[0]?.id ?? '',
  );
  const [activeProblemId, setActiveProblemId] = useState(dataset.problemBank.problems[0]?.id ?? '');

  const activeNotebook =
    dataset.notebooks.find((notebook) => notebook.id === activeNotebookId) ??
    dataset.notebooks[0] ??
    null;
  const activeSection =
    activeNotebook?.sections.find((section) => section.id === activeSectionId) ??
    activeNotebook?.sections[0] ??
    null;

  const filteredProblems = useMemo(() => {
    const tokens = queryTokens(query);
    return dataset.problemBank.problems
      .map((problem) => ({
        problem,
        score: tokens.length === 0 ? 1 : scoreProblem(tokens, problem),
      }))
      .filter(({ problem, score }) => {
        if (problemType !== 'all' && problem.type !== problemType) return false;
        return tokens.length === 0 || score > 0;
      })
      .sort((a, b) => b.score - a.score || a.problem.order - b.problem.order)
      .map(({ problem }) => problem);
  }, [dataset.problemBank.problems, problemType, query]);

  const activeProblem =
    filteredProblems.find((problem) => problem.id === activeProblemId) ??
    dataset.problemBank.problems.find((problem) => problem.id === activeProblemId) ??
    filteredProblems[0] ??
    dataset.problemBank.problems[0] ??
    null;

  const chatHits = useMemo(() => {
    const hits = makeHits(chatInput, dataset, 12);
    return hits.length > 0 ? hits : initialHits;
  }, [chatInput, dataset, initialHits]);

  const topSections = chatHits
    .filter((hit): hit is SectionSearchHit => hit.kind === 'section')
    .slice(0, 3);
  const topProblems = chatHits
    .filter((hit): hit is ProblemSearchHit => hit.kind === 'problem')
    .slice(0, 4);

  if (!activeNotebook || !activeSection || !activeProblem) {
    return (
      <main className="min-h-screen bg-[#f6f7f9] p-6 text-slate-950">
        <section className="rounded-lg border border-rose-200 bg-white p-5 text-sm text-rose-700">
          CSC148 本地数据为空，请重新运行 scripts/maintenance/build-csc148-local-data.mjs。
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f7f9] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-slate-950 text-white">
              <GraduationCap className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-semibold text-slate-950">CSC148 完整学习闭环</h1>
              <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
                {dataset.course.notebookCount} notebooks · {dataset.course.sectionCount} sections ·{' '}
                {dataset.problemBank.stats.total} 道题 · {dataset.course.assetCount} 个本地资源
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/test"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-white px-3 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-950"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>测试列表</span>
            </Link>
            <Link
              href="/test/end-to-end-learning-loop/chat"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
            >
              <Bot className="h-4 w-4" />
              <span>运行 AI 问答</span>
            </Link>
            <ModeButton
              active={mode === 'chat'}
              icon={MessageSquareText}
              label="本地对话"
              onClick={() => setMode('chat')}
            />
            <ModeButton
              active={mode === 'course'}
              icon={BookOpen}
              label="课程内容"
              onClick={() => setMode('course')}
            />
            <ModeButton
              active={mode === 'problems'}
              icon={FileQuestion}
              label="题库"
              onClick={() => setMode('problems')}
            />
            <ModeButton
              active={mode === 'results'}
              icon={Archive}
              label="测试结果"
              onClick={() => setMode('results')}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6">
        <section className="mb-5 grid gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-4">
          {[
            ['01', '课程检索', '从真实 CSC148 notebook 找证据'],
            ['02', 'AI 问答', '正式模型生成并记录 token/费用'],
            ['03', '题库练习', '进入匹配的真实题库题目'],
            ['04', '结果归档', '历次昂贵结果长期保留'],
          ].map(([step, label, detail]) => (
            <div
              key={step}
              className="rounded-lg bg-slate-50 px-3 py-3 ring-1 ring-inset ring-slate-100"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold text-slate-400">{step}</span>
                <span className="text-sm font-semibold text-slate-900">{label}</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
            </div>
          ))}
        </section>

        {mode === 'chat' ? (
          <div className="mx-auto max-w-4xl space-y-4">
            <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-950">
                <MessageSquareText className="h-4 w-4 text-blue-600" />
                <span>测试本地检索</span>
              </div>
              <textarea
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                aria-label="本地检索请求"
                className="min-h-24 w-full resize-y rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-950 outline-none focus:border-blue-300 focus:bg-white"
              />
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {PROMPT_PRESETS.map((preset, index) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setChatInput(preset)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-blue-50 hover:text-blue-800"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    示例 {index + 1}
                  </button>
                ))}
              </div>
            </section>

            <section className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-slate-700">
                命中 {topSections.length} 个课程片段、{topProblems.length} 道题库题目
              </p>
              {topSections[0]?.kind === 'section' ? (
                <p className="truncate text-xs text-slate-500 sm:max-w-md">
                  建议从「{topSections[0].section.title}」开始
                </p>
              ) : null}
            </section>

            <ChatHitList
              hits={chatHits.slice(0, 8)}
              onOpenCourse={(notebookId, sectionId) => {
                setActiveNotebookId(notebookId);
                setActiveSectionId(sectionId);
                setMode('course');
              }}
              onOpenProblem={(problemId) => {
                setActiveProblemId(problemId);
                setMode('problems');
              }}
            />
          </div>
        ) : null}

        {mode === 'course' ? (
          <div className="mx-auto max-w-5xl space-y-4">
            <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-xs font-semibold text-slate-500">
                <span>Notebook</span>
                <select
                  value={activeNotebook.id}
                  onChange={(event) => {
                    const notebook = dataset.notebooks.find(
                      (item) => item.id === event.target.value,
                    );
                    setActiveNotebookId(event.target.value);
                    setActiveSectionId(notebook?.sections[0]?.id ?? '');
                  }}
                  className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-950 outline-none focus:border-blue-300"
                >
                  {dataset.notebooks.map((notebook) => (
                    <option key={notebook.id} value={notebook.id}>
                      {notebook.order}. {notebook.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-xs font-semibold text-slate-500">
                <span>Section</span>
                <select
                  value={activeSection.id}
                  onChange={(event) => setActiveSectionId(event.target.value)}
                  className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-950 outline-none focus:border-blue-300"
                >
                  {activeNotebook.sections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.order + 1}. {section.title}
                    </option>
                  ))}
                </select>
              </label>
            </section>
            <CourseDetail notebook={activeNotebook} section={activeSection} />
          </div>
        ) : null}

        {mode === 'problems' ? (
          <div className="space-y-4">
            <section className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
              <SearchBox
                value={query}
                onChange={setQuery}
                placeholder="搜索题库：linked list / RI / tree"
              />
              <label className="flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-500">
                <Filter className="h-4 w-4 shrink-0" />
                <select
                  value={problemType}
                  onChange={(event) => setProblemType(event.target.value as ProblemTypeFilter)}
                  className="min-w-0 flex-1 bg-transparent text-slate-950 outline-none"
                >
                  <option value="all">全部题型</option>
                  <option value="choice">选择题</option>
                  <option value="code_tracing">代码追踪</option>
                  <option value="short_answer">简答题</option>
                  <option value="code">代码题</option>
                </select>
              </label>
            </section>
            <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
              <aside className="max-h-[calc(100vh-190px)] overflow-auto pr-1">
                <ProblemList
                  problems={filteredProblems}
                  activeProblemId={activeProblem.id}
                  onProblemSelect={setActiveProblemId}
                />
              </aside>
              <section className="min-w-0">
                <ProblemDetail problem={activeProblem} />
              </section>
            </div>
          </div>
        ) : null}

        {mode === 'results' ? (
          <PlatformTestRunArchive
            testId="end-to-end-learning-loop"
            title="CSC148 完整学习闭环回归"
            defaultPrompt="结合 CSC148 本地课程和题库，讲解 linked list 的 representation invariant，并推荐下一道练习题。"
          />
        ) : null}
      </div>
    </main>
  );
}
