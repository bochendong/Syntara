'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  BookOpen,
  Bot,
  Braces,
  FileQuestion,
  GitBranch,
  Home,
  Loader2,
  Play,
  ScrollText,
} from 'lucide-react';
import { ProblemRichText } from '@/components/problem-bank/problem-rich-text';
import type { Csc148LocalAgentRun } from '@/lib/csc148-local/types';
import { useSettingsStore } from '@/lib/store/settings';
import { backendJson } from '@/lib/utils/backend-api';
import { listTestResults, saveTestResult } from '@/lib/utils/test-results';
import { cn } from '@/lib/utils';

type Csc148ChatResultPayload = {
  kind?: string;
  input?: string;
  output?: string;
  model?: string;
  costEstimate?: { retailUsd?: number | null; computeCredits?: number | null };
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
    totalTokens?: number;
  };
  run?: Csc148LocalAgentRun;
};

type Csc148ChatResponse = {
  success: true;
  run: Csc148LocalAgentRun;
  model: string;
  usage: Csc148ChatResultPayload['usage'];
  costEstimate: Csc148ChatResultPayload['costEstimate'];
  resultKey: string;
  summary: Record<string, unknown>;
  payload: Csc148ChatResultPayload;
};

function displayTitle(value: string): string {
  return value
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/[`*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function PromptPartView({ run }: { run: Csc148LocalAgentRun }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = run.promptParts[activeIndex] ?? run.promptParts[0];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {run.promptParts.map((part, index) => (
          <button
            key={`${part.role}-${part.title}`}
            type="button"
            onClick={() => setActiveIndex(index)}
            className={cn(
              'min-w-0 rounded-md border px-3 py-2 text-left text-xs transition',
              index === activeIndex
                ? 'border-blue-200 bg-blue-50 text-blue-900'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            <span className="block font-mono text-[10px] uppercase">{part.role}</span>
            <span className="mt-0.5 block font-semibold">{part.title}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setActiveIndex(-1)}
          className={cn(
            'min-w-0 rounded-md border px-3 py-2 text-left text-xs transition',
            activeIndex === -1
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
          )}
        >
          <span className="block font-mono text-[11px] uppercase">full</span>
          <span className="mt-1 block font-semibold">完整 prompt</span>
        </button>
      </div>
      <pre className="max-h-[calc(100vh-250px)] overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-4 font-mono text-[12px] leading-6 text-slate-100 [overflow-wrap:anywhere]">
        <code className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {activeIndex === -1 ? run.prompt : active?.content}
        </code>
      </pre>
    </div>
  );
}

function DataFlowView({ run }: { run: Csc148LocalAgentRun }) {
  return (
    <div className="space-y-3">
      {run.dataFlow.map((step) => (
        <div key={step.id} className="border-b border-slate-200 pb-3 last:border-0">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-950">{step.label}</h3>
            <span className="rounded-md bg-white px-2 py-1 font-mono text-[11px] text-slate-500 ring-1 ring-slate-200">
              {step.id}
            </span>
          </div>
          <div className="mt-2 grid gap-2 text-xs leading-5">
            <div className="rounded-md bg-slate-50 p-2">
              <div className="mb-1 font-semibold text-slate-500">Input</div>
              <div className="break-words text-slate-800">{step.input}</div>
            </div>
            <div className="rounded-md bg-slate-50 p-2">
              <div className="mb-1 font-semibold text-slate-500">Output</div>
              <div className="break-words text-slate-800">{step.output}</div>
            </div>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">{step.detail}</p>
        </div>
      ))}
    </div>
  );
}

function EvidenceView({ run }: { run: Csc148LocalAgentRun }) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
          <BookOpen className="h-4 w-4 text-blue-600" />
          <span>课程证据</span>
        </div>
        {run.selectedSections.map((hit) => (
          <div key={hit.id} className="border-b border-slate-200 pb-3 last:border-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold leading-6 text-slate-950">
                  {hit.section.title}
                </h3>
                <p className="text-xs text-slate-500">{hit.notebook.name}</p>
              </div>
              <span className="font-mono text-xs text-slate-400">score {hit.score}</span>
            </div>
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
              {hit.section.summary || hit.section.markdown}
            </p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
          <FileQuestion className="h-4 w-4 text-emerald-600" />
          <span>题库证据</span>
        </div>
        {run.selectedProblems.map((hit) => (
          <div key={hit.id} className="border-b border-slate-200 pb-3 last:border-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold leading-6 text-slate-950">
                  {displayTitle(hit.problem.title)}
                </h3>
                <p className="text-xs text-slate-500">
                  {hit.problem.type} / {hit.problem.difficulty} / {hit.problem.sectionTitle}
                </p>
              </div>
              <span className="font-mono text-xs text-slate-400">score {hit.score}</span>
            </div>
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
              {hit.problem.summary || hit.problem.question}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Csc148AiChatPageClient() {
  const [message, setMessage] = useState('');
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [inspector, setInspector] = useState<'evidence' | 'prompt' | 'flow'>('evidence');
  const [run, setRun] = useState<Csc148LocalAgentRun | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [runModel, setRunModel] = useState('');
  const [usage, setUsage] = useState<Csc148ChatResultPayload['usage']>(undefined);
  const [costEstimate, setCostEstimate] =
    useState<Csc148ChatResultPayload['costEstimate']>(undefined);
  const providerId = useSettingsStore((state) => state.providerId);
  const modelId = useSettingsStore((state) => state.modelId);

  useEffect(() => {
    const controller = new AbortController();
    void listTestResults<Csc148ChatResultPayload>({
      testId: 'end-to-end-learning-loop',
      includePayload: true,
      limit: 40,
      signal: controller.signal,
    })
      .then((rows) => {
        const latest = rows.find((row) => row.payload?.kind === 'csc148-ai-chat');
        const payload = latest?.payload;
        if (!payload?.run) return;
        const restoredInput = payload.input || payload.run.userMessage;
        setMessage(restoredInput);
        setSubmittedMessage(restoredInput);
        setRun(payload.run);
        setRunModel(payload.model || '');
        setUsage(payload.usage);
        setCostEstimate(payload.costEstimate);
        setSavedMessage('已从当前浏览器本地库恢复上一次 AI 运行。');
      })
      .catch((loadError) => {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : '历史测试结果恢复失败。');
      })
      .finally(() => {
        if (!controller.signal.aborted) setHasHydrated(true);
      });
    return () => controller.abort();
  }, []);

  const runLocalAgent = async () => {
    const nextMessage = message.trim();
    if (!nextMessage || running) return;
    setRunning(true);
    setError('');
    setSavedMessage('');
    try {
      const response = await backendJson<Csc148ChatResponse>('/api/csc148-test/chat', {
        method: 'POST',
        headers:
          providerId === 'openai' && modelId
            ? { 'content-type': 'application/json', 'x-model': `openai:${modelId}` }
            : { 'content-type': 'application/json' },
        body: JSON.stringify({ message: nextMessage }),
      });
      setSubmittedMessage(nextMessage);
      setRun(response.run);
      setRunModel(response.model);
      setUsage(response.usage);
      setCostEstimate(response.costEstimate);
      await saveTestResult({
        testId: 'end-to-end-learning-loop',
        resultKey: response.resultKey,
        status: 'completed',
        title: `CSC148 AI 问答 · ${nextMessage.slice(0, 80)}`,
        summary: response.summary,
        payload: response.payload,
      });
      setSavedMessage('AI 结果已保存到当前浏览器本地库，刷新或退出后仍可恢复。');
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'CSC148 AI 测试运行失败。');
    } finally {
      setRunning(false);
    }
  };

  return (
    <main className="min-h-full bg-[#f6f7f9] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-slate-950 text-white">
              <Bot className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-semibold text-slate-950">CSC148 AI 问答闭环</h1>
              <p className="text-sm text-slate-500">
                本地课程与题库证据 + 正式模型 · 每次结果自动保存
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-4 px-4 py-4 lg:grid-cols-[200px_minmax(0,1fr)]">
        <aside
          aria-label="CSC148 课程导航"
          className="flex h-fit flex-col rounded-lg border border-slate-200 bg-white p-2 lg:sticky lg:top-4 lg:min-h-[calc(100vh-130px)]"
        >
          <div className="px-3 py-2 text-xs font-semibold uppercase text-slate-400">课程操作</div>
          <nav className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-1">
            {[
              { href: '/test', label: '测试列表', icon: ArrowLeft },
              { href: '/test/end-to-end-learning-loop', label: '闭环主页', icon: Home },
              {
                href: '/test/end-to-end-learning-loop?mode=course',
                label: '课程内容',
                icon: BookOpen,
              },
              {
                href: '/test/end-to-end-learning-loop?mode=problems',
                label: '题库练习',
                icon: FileQuestion,
              },
              {
                href: '/test/end-to-end-learning-loop/chat',
                label: 'AI 课程问答',
                icon: Bot,
                active: true,
              },
              {
                href: '/test/end-to-end-learning-loop?mode=results',
                label: '测试结果',
                icon: Archive,
              },
            ].map(({ href, label, icon: Icon, active }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold transition',
                  active
                    ? 'bg-slate-950 text-white'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950',
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </Link>
            ))}
          </nav>
          <div className="mt-3 border-t border-slate-200 px-3 py-3 text-xs leading-5 text-slate-500 lg:mt-auto">
            {run
              ? '最近一次 AI 运行已写入当前浏览器本地库，可跨刷新和浏览器会话恢复。'
              : '尚无已保存的 AI 课程问答运行。'}
          </div>
        </aside>

        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="flex h-[calc(100svh-190px)] min-h-[600px] min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white lg:h-[calc(100vh-130px)] lg:min-h-0">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 px-5 py-3 text-xs text-slate-500">
              <span className={cn('font-semibold', run ? 'text-emerald-700' : 'text-slate-500')}>
                {!hasHydrated
                  ? '正在恢复历史运行'
                  : running
                    ? 'AI 正在生成'
                    : run
                      ? 'AI 运行完成并已保存'
                      : '尚未运行'}
              </span>
              {run ? (
                <>
                  <span>{run.selectedSections.length} 条课程证据</span>
                  <span>{run.selectedProblems.length} 道题库证据</span>
                  <span className="font-mono">{run.prompt.length} prompt chars</span>
                  {runModel ? <span className="font-mono">{runModel}</span> : null}
                  {usage?.totalTokens ? (
                    <span className="font-mono">{usage.totalTokens} tokens</span>
                  ) : null}
                  {typeof costEstimate?.retailUsd === 'number' ? (
                    <span className="font-mono">${costEstimate.retailUsd.toFixed(4)}</span>
                  ) : null}
                </>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-5 py-6 sm:px-8">
              {run && submittedMessage ? (
                <div className="space-y-8">
                  <div className="ml-auto max-w-[82%] rounded-lg bg-slate-950 px-4 py-3 text-sm leading-6 text-white">
                    {submittedMessage}
                  </div>
                  <div className="flex max-w-3xl items-start gap-3">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                      <Bot className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-3 text-xs font-semibold text-slate-500">
                        CSC148 本地 Agent
                      </div>
                      <ProblemRichText
                        content={run.assistantReply}
                        className="text-[15px] leading-8"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-80 flex-col items-center justify-center text-center">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                    <Bot className="h-5 w-5" />
                  </span>
                  <h2 className="mt-4 text-base font-semibold text-slate-950">
                    开始付费 AI 课程问答测试
                  </h2>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                    系统会先检索 CSC148
                    本地课程与题库，再把完整证据交给正式模型；结果生成后立即保存。
                  </p>
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 bg-white p-4">
              <div className="flex items-end gap-2 rounded-lg border border-slate-300 bg-slate-50 p-2 focus-within:border-blue-400 focus-within:bg-white">
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  aria-label="CSC148 测试消息"
                  placeholder="输入课程问题，例如：linked list 的 representation invariant 是什么？"
                  className="max-h-40 min-h-14 min-w-0 flex-1 resize-y bg-transparent px-2 py-1 text-sm leading-6 text-slate-950 outline-none placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => void runLocalAgent()}
                  disabled={!message.trim() || running}
                  aria-label="运行并保存 AI 链路"
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {running ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">{running ? '生成中' : '运行并保存'}</span>
                </button>
              </div>
              {error || savedMessage ? (
                <p
                  className={cn(
                    'mt-2 text-xs leading-5',
                    error ? 'text-rose-600' : 'text-emerald-700',
                  )}
                >
                  {error || savedMessage}
                </p>
              ) : null}
            </div>
          </section>

          <aside className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white xl:max-h-[calc(100vh-130px)]">
            <div className="grid grid-cols-3 border-b border-slate-200 p-2">
              {(
                [
                  ['evidence', '证据', ScrollText],
                  ['prompt', 'Prompt', Braces],
                  ['flow', '数据流', GitBranch],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setInspector(id)}
                  className={cn(
                    'inline-flex h-10 items-center justify-center gap-2 rounded-md text-sm font-semibold transition',
                    inspector === id
                      ? 'bg-slate-950 text-white'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-950',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <div className="max-h-[calc(100vh-190px)] overflow-auto p-4">
              {run ? (
                <>
                  {inspector === 'evidence' ? <EvidenceView run={run} /> : null}
                  {inspector === 'prompt' ? <PromptPartView run={run} /> : null}
                  {inspector === 'flow' ? <DataFlowView run={run} /> : null}
                </>
              ) : (
                <div className="py-12 text-center text-sm leading-6 text-slate-500">
                  运行课程问答后，这里会显示对应的本地证据。
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
