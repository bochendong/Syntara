'use client';

import { useState } from 'react';
import {
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Database,
  FileCheck2,
  FlaskConical,
  Image as ImageIcon,
  Layers3,
  Lightbulb,
  ListChecks,
  RefreshCw,
  Route,
  Search,
  XCircle,
} from 'lucide-react';
import { MessageResponse } from '@/components/ai-elements/message';
import { CodeProblemStatement } from '@/components/problem-bank/code-problem-statement';
import { ProblemImageAssets, ProblemRichText } from '@/components/problem-bank/problem-rich-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PlatformFlowOutput } from './types';
import type { NotebookNoteDesign } from './types';
import type { QuestionTestItem } from './types';

const CALENDAR_KIND_LABELS: Record<string, string> = {
  assignment: '作业',
  exam: '考试',
  progress: '课程进度',
  tutorial: 'Tutorial',
  holiday: '假期',
  other: '其他',
};

const COURSE_NOTEBOOK_NAV_ITEMS = [
  ['#course-methods', '怎么选方法'],
  ['#course-format', '答案怎么写'],
  ['#course-definitions', '完整定义'],
  ['#course-map', '知识脉络'],
  ['#course-examples', '代表题型'],
] as const;

function ImageResult({ output }: { output: Extract<PlatformFlowOutput, { kind: 'image' }> }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">{output.title}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{output.summary}</p>
        </div>
        {output.width && output.height ? (
          <Badge variant="outline" className="shrink-0 rounded-md bg-white font-mono">
            {output.width} × {output.height}
          </Badge>
        ) : null}
      </div>
      <div className="flex min-h-[440px] items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
        {output.imageUrl ? (
          <img
            src={output.imageUrl}
            alt={output.title}
            className="max-h-[720px] w-full object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-3 px-8 text-center text-sm text-slate-500">
            <ImageIcon className="size-10 text-slate-300" />
            图片提示词已经生成，等待图片模型返回。
          </div>
        )}
      </div>
      {output.sections?.length ? (
        <div className="flex flex-wrap gap-2">
          {output.sections.map((section) => (
            <Badge key={section} variant="secondary" className="rounded-md">
              {section}
            </Badge>
          ))}
        </div>
      ) : null}
      <details className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
        <summary className="cursor-pointer font-semibold text-slate-900">查看图片 Prompt</summary>
        <p className="mt-3 whitespace-pre-wrap leading-6">{output.imagePrompt}</p>
      </details>
    </div>
  );
}

function CalendarResult({ output }: { output: Extract<PlatformFlowOutput, { kind: 'calendar' }> }) {
  const sortedEvents = output.events
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
        {output.changeSummary}
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2 font-semibold text-slate-950">
            <CalendarDays className="size-4 text-sky-600" />
            学习日历
          </div>
          <Badge variant="secondary" className="rounded-md">
            {sortedEvents.length} 个事项
          </Badge>
        </div>
        {sortedEvents.length ? (
          <div className="divide-y divide-slate-100">
            {sortedEvents.map((event) => (
              <div
                key={event.id}
                className="grid gap-3 px-5 py-4 sm:grid-cols-[120px_110px_1fr] sm:items-center"
              >
                <div className="font-mono text-sm font-semibold text-slate-900">{event.date}</div>
                <Badge variant="outline" className="w-fit rounded-md">
                  {CALENDAR_KIND_LABELS[event.kind] || event.kind}
                </Badge>
                <div>
                  <div className="text-sm font-semibold text-slate-950">{event.title}</div>
                  {event.rawText ? (
                    <div className="mt-1 text-xs leading-5 text-slate-500">{event.rawText}</div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-16 text-center text-sm text-slate-500">当前日历没有事项。</div>
        )}
      </div>
    </div>
  );
}

const FAILURE_TYPE_LABELS: Record<string, string> = {
  irrelevant: '主题不相关',
  duplicate: '重复',
  unanswerable: '题面不可作答',
  wrong_difficulty: '难度不合适',
  poor_coverage: '覆盖价值不足',
  other: '其他',
};

function QuestionDecisionTrace({
  trace,
}: {
  trace: NonNullable<Extract<PlatformFlowOutput, { kind: 'questions' }>['decisionTrace']>;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-sm">
      <div className="border-b border-violet-100 bg-violet-50/80 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-base font-semibold text-violet-950">
              <BrainCircuit className="size-5" /> AI 决策轨迹
            </div>
            <p className="mt-1 text-sm leading-6 text-violet-800">
              检索词、RAG 分数、候选验收、拒绝原因和重试都会随本次结果保存在平台共享测试历史中。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="rounded-md bg-white font-mono text-violet-900">
              {trace.embeddingModel} · {trace.embeddingDimensions}d
            </Badge>
            <Badge variant="outline" className="rounded-md bg-white text-violet-900">
              最多 {trace.maxRounds} 轮
            </Badge>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
              <Route className="size-4 text-violet-600" /> 1. AI 如何拆解检索任务
            </div>
            <div className="mt-3 space-y-2">
              {trace.plannerReasoning.map((reason, index) => (
                <div
                  key={`${index}-${reason}`}
                  className="flex gap-2 text-sm leading-6 text-slate-700"
                >
                  <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-violet-100 font-mono text-[10px] font-semibold text-violet-800">
                    {index + 1}
                  </span>
                  <AiText value={reason} />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {trace.initialQueries.map((query, index) => (
              <article
                key={`${index}-${query.query}`}
                className="rounded-xl border border-violet-100 p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-violet-600 font-mono text-xs font-semibold text-white">
                    Q{index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <AiText value={query.query} className="font-semibold text-slate-950" />
                    <AiText value={query.purpose} className="mt-1 text-sm text-slate-600" />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {query.targetConcepts.map((concept) => (
                    <Badge
                      key={concept}
                      className="rounded-md bg-violet-100 text-violet-900 hover:bg-violet-100"
                    >
                      {concept}
                    </Badge>
                  ))}
                  {query.desiredTypes.map((type) => (
                    <Badge key={type} variant="outline" className="rounded-md">
                      题型：{type}
                    </Badge>
                  ))}
                  {query.exclusions.map((exclusion) => (
                    <Badge
                      key={exclusion}
                      variant="outline"
                      className="rounded-md border-rose-200 bg-rose-50 text-rose-800"
                    >
                      排除：{exclusion}
                    </Badge>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-sky-950">
            <Database className="size-4" /> 2. 本轮可见语料：{trace.visibleProblemCount} 题
          </div>
          <AiText value={trace.corpusPreparation} className="mt-2 text-sm leading-6 text-sky-900" />
        </div>

        <div className="space-y-4">
          {trace.rounds.map((round) => {
            const acceptedCount = round.candidates.filter(
              (candidate) => candidate.decision === 'accepted',
            ).length;
            const rejectedCount = round.candidates.filter(
              (candidate) => candidate.decision === 'rejected',
            ).length;
            return (
              <details
                key={round.round}
                open
                className="group overflow-hidden rounded-xl border border-slate-200 bg-white"
              >
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 bg-slate-50 px-4 py-3">
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                    <Search className="size-4 text-violet-600" /> 3.{round.round} 第 {round.round}{' '}
                    轮 RAG 与 AI 验收
                  </span>
                  <span className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline" className="rounded-md bg-white">
                      候选 {round.candidates.length}
                    </Badge>
                    <Badge className="rounded-md bg-emerald-600 text-white hover:bg-emerald-600">
                      接受 {acceptedCount}
                    </Badge>
                    <Badge className="rounded-md bg-rose-600 text-white hover:bg-rose-600">
                      拒绝 {rejectedCount}
                    </Badge>
                  </span>
                </summary>
                <div className="space-y-4 border-t border-slate-200 p-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      本轮使用的检索词
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {round.queries.map((query) => (
                        <Badge
                          key={query.query}
                          variant="outline"
                          className="h-auto max-w-full whitespace-normal rounded-md bg-white px-2.5 py-1.5 text-left leading-5"
                        >
                          {query.query}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full min-w-[920px] table-fixed text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="w-[28%] px-3 py-2 font-semibold">候选题</th>
                          <th className="w-[18%] px-3 py-2 font-semibold">检索分数</th>
                          <th className="w-[18%] px-3 py-2 font-semibold">命中 query</th>
                          <th className="w-[36%] px-3 py-2 font-semibold">AI 验收决定</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {round.candidates.map((candidate) => (
                          <tr key={candidate.id} className="align-top">
                            <td className="px-3 py-3">
                              <div className="font-medium leading-5 text-slate-950">
                                {candidate.title}
                              </div>
                              <div className="mt-1 break-all font-mono text-[10px] text-slate-400">
                                {candidate.id}
                              </div>
                            </td>
                            <td className="px-3 py-3 font-mono leading-5 text-slate-600">
                              <div>混合 {candidate.hybridScore.toFixed(3)}</div>
                              <div>语义 {candidate.semanticScore.toFixed(3)}</div>
                              <div>词汇 {candidate.lexicalScore.toFixed(3)}</div>
                            </td>
                            <td className="px-3 py-3 leading-5 text-slate-600">
                              {candidate.matchedQuery}
                            </td>
                            <td className="px-3 py-3">
                              <Badge
                                className={cn(
                                  'rounded-md',
                                  candidate.decision === 'accepted'
                                    ? 'bg-emerald-600 text-white hover:bg-emerald-600'
                                    : candidate.decision === 'rejected'
                                      ? 'bg-rose-600 text-white hover:bg-rose-600'
                                      : 'bg-slate-500 text-white hover:bg-slate-500',
                                )}
                              >
                                {candidate.decision === 'accepted'
                                  ? '接受'
                                  : candidate.decision === 'rejected'
                                    ? `拒绝${candidate.failureType ? ` · ${FAILURE_TYPE_LABELS[candidate.failureType]}` : ''}`
                                    : 'AI 未分类'}
                              </Badge>
                              {candidate.decisionReason ? (
                                <AiText
                                  value={candidate.decisionReason}
                                  className="mt-2 text-xs leading-5 text-slate-700"
                                />
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {round.missingCoverage.length ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <div className="text-xs font-semibold text-amber-900">仍缺少的覆盖</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {round.missingCoverage.map((item) => (
                          <Badge
                            key={item}
                            variant="outline"
                            className="rounded-md border-amber-300 bg-white text-amber-900"
                          >
                            {item}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {round.nextQueries.length ? (
                    <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
                      <div className="flex items-center gap-2 text-xs font-semibold text-violet-950">
                        <RefreshCw className="size-3.5" /> AI 针对拒绝结果发起的下一轮检索
                      </div>
                      <div className="mt-2 space-y-2">
                        {round.nextQueries.map((query) => (
                          <div key={query.query} className="text-sm leading-6 text-violet-900">
                            <AiText value={`**${query.query}** — ${query.purpose}`} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {round.invalidIds.length || round.protocolIssues.length ? (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                      <div className="flex items-center gap-2 font-semibold">
                        <XCircle className="size-4" /> AI 输出协议问题
                      </div>
                      {round.invalidIds.length ? (
                        <p className="mt-2">不存在的 ID：{round.invalidIds.join('、')}</p>
                      ) : null}
                      {round.protocolIssues.map((issue) => (
                        <AiText key={issue} value={issue} className="mt-1" />
                      ))}
                    </div>
                  ) : null}

                  <div className="text-sm leading-6 text-slate-600">
                    <span className="font-semibold text-slate-800">本轮停止判断：</span>{' '}
                    <AiText value={round.stopReason} />
                  </div>
                </div>
              </details>
            );
          })}
        </div>

        {trace.generation ? (
          <div
            className={cn(
              'rounded-xl border p-4',
              trace.generation.allowed
                ? 'border-amber-200 bg-amber-50'
                : 'border-slate-200 bg-slate-50',
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                <Layers3 className="size-4" /> 4. 检索后的补题决定
              </div>
              <Badge variant="outline" className="rounded-md bg-white">
                缺口 {trace.generation.needed} / 实际生成 {trace.generation.generated}
              </Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {trace.generation.allowed
                ? `允许补题，依据：${trace.generation.grounding === 'notebook' ? 'Mock 笔记' : '一般课程知识边界'}。`
                : '充足题库场景禁止用 AI 生成题掩盖检索失败，因此保留实际缺口。'}
            </p>
            {trace.generation.reasoning.map((reason) => (
              <AiText key={reason} value={reason} className="mt-2 text-sm text-slate-700" />
            ))}
          </div>
        ) : null}

        <div className="rounded-xl bg-slate-950 px-4 py-3 text-sm text-white">
          <span className="font-semibold">最终停止原因：</span>{' '}
          <AiText value={trace.finalStopReason} className="inline text-slate-100" />
        </div>
      </div>
    </section>
  );
}

function QuestionResult({
  output,
}: {
  output: Extract<PlatformFlowOutput, { kind: 'questions' }>;
}) {
  const routeLabel =
    output.route === 'select_only'
      ? '只选题库题'
      : output.route === 'generate_only'
        ? '全部生成'
        : output.route === 'mixed'
          ? '题库 + 补题'
          : '未提供路由';
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-sky-900">
          <ListChecks className="size-4" />
          {output.topic} · {output.questions.length} 道题
        </div>
        <AiText value={output.selectionSummary} className="mt-1 text-sm leading-6 text-sky-800" />
        {output.requestedCount ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="outline" className="rounded-md bg-white text-sky-900">
              {output.courseCode} 本地题库 {output.localBankTotal ?? 0} 题
            </Badge>
            <Badge variant="outline" className="rounded-md bg-white text-sky-900">
              可见语料 {output.candidateCount ?? 0} 题
            </Badge>
            <Badge variant="outline" className="rounded-md bg-white text-sky-900">
              请求 {output.requestedCount} / 返回 {output.questions.length}
            </Badge>
            <Badge variant="outline" className="rounded-md bg-white text-sky-900">
              {routeLabel}
            </Badge>
            <Badge variant="outline" className="rounded-md bg-white text-sky-900">
              原题 {output.existingCount ?? 0} / AI 补题 {output.generatedCount ?? 0}
            </Badge>
            {output.invalidExistingCount ? (
              <Badge className="rounded-md bg-rose-600 text-white hover:bg-rose-600">
                无效题库 ID {output.invalidExistingCount}
              </Badge>
            ) : null}
          </div>
        ) : null}
      </div>
      {output.evaluation ? (
        <section
          className={cn(
            'overflow-hidden rounded-2xl border bg-white',
            output.evaluation.passed ? 'border-emerald-200' : 'border-rose-200',
          )}
        >
          <div
            className={cn(
              'flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4',
              output.evaluation.passed
                ? 'border-emerald-100 bg-emerald-50'
                : 'border-rose-100 bg-rose-50',
            )}
          >
            <div className="flex items-center gap-2 font-semibold text-slate-950">
              {output.evaluation.passed ? (
                <CheckCircle2 className="size-5 text-emerald-600" />
              ) : (
                <XCircle className="size-5 text-rose-600" />
              )}
              本次测试评估
            </div>
            <Badge
              className={cn(
                'rounded-md text-white',
                output.evaluation.passed
                  ? 'bg-emerald-600 hover:bg-emerald-600'
                  : 'bg-rose-600 hover:bg-rose-600',
              )}
            >
              {output.evaluation.passed ? '通过' : '需要检查'}
            </Badge>
          </div>
          <div className="grid gap-3 p-4 lg:grid-cols-3">
            {output.evaluation.checks.map((check) => (
              <div
                key={check.id}
                className={cn(
                  'rounded-xl border p-4',
                  check.passed
                    ? 'border-emerald-200 bg-emerald-50/60'
                    : 'border-rose-200 bg-rose-50/60',
                )}
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                  {check.passed ? (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle className="size-4 shrink-0 text-rose-600" />
                  )}
                  {check.label}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{check.detail}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {output.decisionTrace ? <QuestionDecisionTrace trace={output.decisionTrace} /> : null}
      <div className="space-y-4">
        {output.questions.map((question, index) => (
          <article
            key={question.id}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-slate-950 font-mono text-xs font-semibold text-white">
                {index + 1}
              </span>
              <Badge variant="outline" className="rounded-md">
                {question.type}
              </Badge>
              <Badge variant="outline" className="rounded-md">
                {question.difficulty}
              </Badge>
              {question.source ? (
                <Badge
                  className={cn(
                    'rounded-md',
                    question.source === 'local_problem_bank'
                      ? 'bg-emerald-600 text-white hover:bg-emerald-600'
                      : 'bg-violet-600 text-white hover:bg-violet-600',
                  )}
                >
                  {question.source === 'local_problem_bank'
                    ? '本地题库原题'
                    : question.groundedIn === 'notebook'
                      ? 'AI 补题 · 笔记依据'
                      : 'AI 补题 · 一般知识'}
                </Badge>
              ) : null}
              {question.formatValidation ? (
                <Badge
                  variant="outline"
                  className={cn(
                    'rounded-md bg-white',
                    question.formatValidation.valid
                      ? 'border-emerald-200 text-emerald-800'
                      : 'border-rose-200 text-rose-800',
                  )}
                >
                  {question.formatValidation.valid ? '格式校验通过' : '格式校验失败'}
                </Badge>
              ) : null}
              {question.sectionTitle ? (
                <span className="text-xs text-slate-500">{question.sectionTitle}</span>
              ) : null}
            </div>
            <h3 className="mt-4 text-base font-semibold leading-7 text-slate-950">
              {question.title}
            </h3>
            <CompleteQuestionContent question={question} />
            {question.formatValidation?.issues.length ? (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
                <div className="text-sm font-semibold text-rose-900">格式问题</div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-rose-800">
                  {question.formatValidation.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-950">
                <CheckCircle2 className="size-4 shrink-0" />
                为什么选这道题
              </div>
              <p className="mt-2 text-sm leading-6 text-emerald-900">{question.reason}</p>
              {question.coverage?.length ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-emerald-800">主题匹配</span>
                  {question.coverage.map((item) => (
                    <Badge
                      key={item}
                      variant="outline"
                      className="rounded-md border-emerald-200 bg-white text-emerald-900"
                    >
                      {item}
                    </Badge>
                  ))}
                </div>
              ) : null}
              {question.roleInSet ? (
                <div className="mt-3 grid gap-1 text-sm leading-6 sm:grid-cols-[88px_1fr]">
                  <span className="font-semibold text-emerald-800">组合价值</span>
                  <span className="text-emerald-950">{question.roleInSet}</span>
                </div>
              ) : null}
              {question.sourceEvidence ? (
                <div className="mt-2 grid gap-1 text-sm leading-6 sm:grid-cols-[88px_1fr]">
                  <span className="font-semibold text-emerald-800">题源证据</span>
                  <span className="text-emerald-950">{question.sourceEvidence}</span>
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function CompleteQuestionContent({ question }: { question: QuestionTestItem }) {
  const content = question.publicContent;
  if (!content) {
    return (
      <div className="mt-3 rounded-xl bg-slate-50 px-4 py-3">
        <ProblemRichText content={question.question} className="text-sm leading-7" />
      </div>
    );
  }

  if (content.type === 'code') {
    return (
      <div className="mt-3 space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
        <CodeProblemStatement content={content} locale="zh-CN" />
        {content.functionSignature ? (
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              函数签名
            </div>
            <ProblemRichText content={`\`\`\`python\n${content.functionSignature}\n\`\`\``} />
          </div>
        ) : null}
        {content.starterCode ? (
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              起始代码（完整）
            </div>
            <ProblemRichText content={`\`\`\`python\n${content.starterCode}\n\`\`\``} />
          </div>
        ) : null}
        {content.publicTests.length ? (
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              公开测试
            </div>
            <div className="space-y-2">
              {content.publicTests.map((test) => (
                <div key={test.id} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-xs font-semibold text-slate-500">
                    {test.description || test.id}
                  </div>
                  <ProblemRichText
                    content={`\`\`\`python\n${test.expression}\n\`\`\`\n期望：\`${test.expected}\``}
                    className="mt-2"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <ProblemImageAssets content={content} />
        {content.explanation ? (
          <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
            <div className="mb-2 text-xs font-semibold text-sky-800">公开说明</div>
            <ProblemRichText content={content.explanation} />
          </div>
        ) : null}
      </div>
    );
  }

  const stem = content.type === 'fill_blank' ? content.stemTemplate : content.stem;
  return (
    <div className="mt-3 space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <ProblemRichText content={stem} className="text-sm leading-7" />
      <ProblemImageAssets content={content} />
      {content.type === 'choice' ? (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {content.selectionMode === 'multiple' ? '多选题选项' : '单选题选项'}
          </div>
          {content.options.map((option) => (
            <div
              key={option.id}
              className="grid gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 sm:grid-cols-[32px_1fr]"
            >
              <span className="flex size-7 items-center justify-center rounded-md bg-slate-100 font-mono text-xs font-semibold text-slate-700">
                {option.id}
              </span>
              <ProblemRichText content={option.label} />
            </div>
          ))}
        </div>
      ) : null}
      {content.type === 'fill_blank' ? (
        <div className="flex flex-wrap gap-2">
          {content.blanks.map((blank) => (
            <Badge key={blank.id} variant="outline" className="rounded-md bg-white">
              空格 {blank.id}
              {blank.placeholder ? ` · ${blank.placeholder}` : ''}
            </Badge>
          ))}
        </div>
      ) : null}
      {content.type === 'calculation' && content.unit ? (
        <div className="text-sm text-slate-600">
          <span className="font-semibold text-slate-800">答案单位：</span> {content.unit}
        </div>
      ) : null}
      {content.explanation ? (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
          <div className="mb-2 text-xs font-semibold text-sky-800">公开说明</div>
          <ProblemRichText content={content.explanation} />
        </div>
      ) : null}
    </div>
  );
}

function TextResult({ output }: { output: Extract<PlatformFlowOutput, { kind: 'text' }> }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white px-6 py-7 shadow-sm sm:px-9">
      <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{output.title}</h2>
      <MessageResponse className="mt-5 text-[15px] leading-8 text-slate-700">
        {output.markdown}
      </MessageResponse>
    </article>
  );
}

function ExplanationResult({
  output,
}: {
  output: Extract<PlatformFlowOutput, { kind: 'explanation' }>;
}) {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-base font-semibold text-slate-950">
              <BrainCircuit className="size-5 text-violet-600" /> 本次讲解条件
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge className="rounded-md bg-slate-950 text-white hover:bg-slate-950">
                {output.explanationKind === 'concept' ? '知识点讲解' : '题目讲解'}
              </Badge>
              <Badge
                className={cn(
                  'rounded-md',
                  output.noteMode === 'with_extracted_notes'
                    ? 'bg-violet-600 text-white hover:bg-violet-600'
                    : 'bg-amber-500 text-white hover:bg-amber-500',
                )}
              >
                {output.noteMode === 'with_extracted_notes'
                  ? output.sourceNotebook?.sourceType === 'mock_extraction'
                    ? '有笔记 · 模拟提取'
                    : '有笔记 · 提取历史'
                  : '无笔记 · 一般知识'}
              </Badge>
            </div>
          </div>
          {output.sourceNotebook ? (
            <div className="max-w-xl rounded-xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-violet-950">
              <div className="text-xs font-semibold text-violet-600">
                {output.sourceNotebook.sourceType === 'mock_extraction'
                  ? '实际注入的模拟笔记提取'
                  : '实际注入的笔记来源'}
              </div>
              <AiText value={output.sourceNotebook.title} className="mt-1 font-semibold" />
              <div className="mt-1 text-xs leading-5 text-violet-700">
                {output.sourceNotebook.fileName || '未知源文件'} · 路由{' '}
                {output.sourceNotebook.routeKind} · 全部 {output.sourceNotebook.sectionCount} 章
              </div>
            </div>
          ) : (
            <div className="max-w-md rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              本轮没有注入任何笔记、题库或学习记忆；讲解只能依赖模型的一般知识。
            </div>
          )}
        </div>

        {output.contextPages.length ? (
          <details open className="mt-4 overflow-hidden rounded-xl border border-slate-200">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-950">
              <span className="flex items-center gap-2">
                <Search className="size-4 text-violet-600" /> 实际进入讲解上下文的章节
              </span>
              <Badge variant="outline" className="rounded-md bg-white">
                {output.contextPages.length} 章
              </Badge>
            </summary>
            <div className="grid gap-3 border-t border-slate-200 p-4 lg:grid-cols-2">
              {output.contextPages.map((page) => (
                <article key={page.id} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <AiText value={page.title} className="font-semibold text-slate-950" />
                    <Badge variant="outline" className="shrink-0 rounded-md font-mono text-[10px]">
                      score {page.sourceScore}
                    </Badge>
                  </div>
                  <AiText value={page.summary} className="mt-2 text-xs leading-5 text-slate-600" />
                  <div className="mt-2 text-[11px] text-slate-400">
                    注入上下文 {page.characterCount.toLocaleString('zh-CN')} 字符
                  </div>
                </article>
              ))}
            </div>
          </details>
        ) : null}
      </section>

      <article className="rounded-2xl border border-slate-200 bg-white px-6 py-7 shadow-sm sm:px-9">
        <AiText value={output.title} className="text-2xl font-semibold text-slate-950" />
        <MessageResponse className="mt-6 text-[15px] leading-8 text-slate-700">
          {output.markdown}
        </MessageResponse>
      </article>
    </div>
  );
}

function AiText({ value, className }: { value: string; className?: string }) {
  return (
    <MessageResponse
      className={`h-auto w-auto min-w-0 max-w-full overflow-x-auto ${className || ''}`}
    >
      {value}
    </MessageResponse>
  );
}

function NoteDesignResult({ noteDesign }: { noteDesign: NotebookNoteDesign }) {
  return (
    <details open className="group rounded-xl border border-amber-200 bg-amber-50/60">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-amber-950">
        <span className="flex items-center gap-2">
          <FileCheck2 className="size-4" /> 什么是一份好笔记
        </span>
        <span className="text-xs font-normal text-amber-700 group-open:hidden">展开</span>
      </summary>
      <div className="border-t border-amber-200 px-4 py-4">
        <AiText value={noteDesign.notePurpose} className="text-sm leading-7 text-amber-950" />
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {[
            ['应该保留', noteDesign.inclusionRules],
            ['应该省略', noteDesign.omissionRules],
            ['怎么使用', noteDesign.howToUse],
          ].map(([title, values]) => (
            <div key={title as string}>
              <div className="text-xs font-semibold text-amber-800">{title as string}</div>
              <div className="mt-2 space-y-1.5">
                {(values as string[]).map((value) => (
                  <div key={value} className="flex gap-2 text-sm leading-6 text-slate-700">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-amber-500" />
                    <AiText value={value} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

function NotebookRouteResult({
  output,
}: {
  output: Extract<PlatformFlowOutput, { kind: 'notebook' }>;
}) {
  const routeLabels = {
    university_course: '课程型生成器',
    research: '研究型生成器',
    daily_use: '日常资料生成器',
  } as const;
  const confidence = Math.round(Math.max(0, Math.min(1, output.routing.confidence)) * 100);
  return (
    <details className="group rounded-xl border border-violet-200 bg-violet-50/60">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-3">
        <span className="mr-auto flex items-center gap-2 text-sm font-semibold text-violet-950">
          <Route className="size-4" /> AI 路由依据
        </span>
        <Badge className="rounded-md bg-violet-700 text-white hover:bg-violet-700">
          {routeLabels[output.routing.usageProfile]}
        </Badge>
        <Badge variant="outline" className="rounded-md bg-white">
          {output.routing.source === 'ai' ? '自动路由' : '手动指定'}
        </Badge>
        <Badge variant="outline" className="rounded-md bg-white font-mono">
          {confidence}%
        </Badge>
      </summary>
      <div className="grid gap-5 border-t border-violet-200 px-4 py-4 lg:grid-cols-2">
        <div>
          <div className="text-xs font-semibold text-violet-700">判断理由</div>
          <div className="mt-2 space-y-2">
            {output.routing.reasons.map((reason) => (
              <AiText
                key={reason}
                value={`- ${reason}`}
                className="text-sm leading-6 text-slate-700"
              />
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-violet-700">原文信号</div>
          <div className="mt-2 space-y-2">
            {output.routing.sourceSignals.map((signal) => (
              <AiText
                key={signal}
                value={`- ${signal}`}
                className="text-sm leading-6 text-slate-700"
              />
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}

function CourseNotebookResult({
  output,
}: {
  output: Extract<PlatformFlowOutput, { kind: 'notebook' }>;
}) {
  if (output.studyGuide.kind !== 'course') return null;
  const guide = output.studyGuide.content;
  return (
    <div className="flex flex-col gap-6">
      <section className="order-1 rounded-xl border border-sky-200 bg-sky-50/70 px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white">
            <Lightbulb className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">
              本讲主线
            </div>
            <AiText
              value={guide.lectureFocus}
              className="mt-1 text-base leading-7 text-slate-900"
            />
          </div>
        </div>
      </section>

      <section className="order-4 scroll-mt-20" id="course-definitions">
        <h3 className="text-base font-semibold text-slate-950">完整定义</h3>
        <div className="mt-3 space-y-3">
          {guide.definitions.map((definition) => (
            <article
              key={`${definition.term}-${definition.sourceRef}`}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
                <AiText value={definition.term} className="font-semibold text-slate-950" />
                <span className="text-xs text-slate-400">{definition.sourceRef}</span>
              </div>
              <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_240px]">
                <div className="min-w-0">
                  <AiText
                    value={definition.statement}
                    className="text-sm leading-7 text-slate-800"
                  />
                  {definition.notation ? (
                    <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
                      <AiText
                        value={`记号：${definition.notation}`}
                        className="text-sm leading-7 text-slate-700"
                      />
                    </div>
                  ) : null}
                </div>
                {definition.conditions.length ? (
                  <div className="border-l border-slate-200 pl-4">
                    <div className="text-xs font-semibold text-slate-500">成立条件 / 边界</div>
                    <div className="mt-2 space-y-1.5">
                      {definition.conditions.map((condition) => (
                        <AiText
                          key={condition}
                          value={`- ${condition}`}
                          className="text-sm leading-6 text-slate-700"
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section
        className="order-5 scroll-mt-20 rounded-xl border border-slate-200 bg-white p-4"
        id="course-map"
      >
        <h3 className="text-base font-semibold text-slate-950">知识脉络</h3>
        <div className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
          {guide.knowledgeMap.map((edge, index) => (
            <div
              key={`${edge.from}-${edge.relation}-${edge.to}`}
              className="grid gap-2 px-3 py-2.5 text-sm sm:grid-cols-[28px_minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center"
            >
              <span className="flex size-6 items-center justify-center rounded-md bg-slate-100 font-mono text-[11px] text-slate-500">
                {index + 1}
              </span>
              <span className="font-medium text-slate-900">{edge.from}</span>
              <span className="text-xs font-semibold text-violet-600">{edge.relation} →</span>
              <span className="text-slate-700">{edge.to}</span>
            </div>
          ))}
        </div>
      </section>

      <section
        className="order-2 scroll-mt-20 overflow-hidden rounded-xl border border-emerald-200 bg-white"
        id="course-methods"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-950">
          <div className="w-full border-b border-emerald-200 bg-emerald-50 px-4 py-3">
            <span className="inline-flex items-center gap-2">
              <Lightbulb className="size-4" /> 做题的想法与选法
            </span>
          </div>
        </div>
        <AiText
          value={guide.problemSolving.guidingIdea}
          className="px-4 pt-4 text-sm leading-7 text-slate-800"
        />
        <div className="mt-4 overflow-x-auto border-t border-slate-200">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[1.45fr_1.25fr_0.72fr_1fr] bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500">
              <span>题目特征</span>
              <span>先想到什么</span>
              <span>选择方法</span>
              <span>为什么 / 边界</span>
            </div>
            <div className="divide-y divide-slate-100">
              {guide.problemSolving.methodSelection.map((choice) => (
                <div
                  key={`${choice.when}-${choice.method}`}
                  className="grid grid-cols-[1.45fr_1.25fr_0.72fr_1fr] gap-4 px-4 py-3 text-sm leading-6"
                >
                  <AiText value={choice.when} className="font-medium text-slate-950" />
                  <AiText value={choice.idea} className="text-slate-700" />
                  <AiText value={choice.method} className="font-semibold text-emerald-800" />
                  <AiText value={choice.why} className="text-slate-600" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        className="order-3 scroll-mt-20 rounded-xl border border-slate-200 bg-white p-4"
        id="course-format"
      >
        <h3 className="text-base font-semibold text-slate-950">本讲做题格式</h3>
        <div className="mt-4 space-y-3">
          {guide.problemSolving.solutionFormat.map((step, index) => (
            <div
              key={`${step.stage}-${index}`}
              className="grid gap-2 rounded-xl bg-slate-50 p-4 sm:grid-cols-[36px_1fr]"
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-slate-950 font-mono text-xs font-semibold text-white">
                {index + 1}
              </span>
              <div>
                <AiText value={step.stage} className="font-semibold text-slate-950" />
                <AiText
                  value={`目的：${step.purpose}`}
                  className="mt-1 text-sm leading-6 text-slate-600"
                />
                <AiText
                  value={`落笔格式：${step.writeLike}`}
                  className="mt-1 text-sm leading-7 text-slate-800"
                />
              </div>
            </div>
          ))}
        </div>
        {guide.problemSolving.checks.length ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
            <div className="text-xs font-semibold text-rose-700">提交前检查</div>
            {guide.problemSolving.checks.map((check) => (
              <AiText
                key={check}
                value={`- ${check}`}
                className="mt-1 text-sm leading-6 text-rose-900"
              />
            ))}
          </div>
        ) : null}
      </section>

      <section className="order-6 scroll-mt-20" id="course-examples">
        <h3 className="text-base font-semibold text-slate-950">代表题型（不是题目全集）</h3>
        <div className="mt-3 space-y-3">
          {guide.representativeProblems.map((problem) => (
            <article
              key={`${problem.title}-${problem.sourceRef}`}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <AiText value={problem.title} className="font-semibold text-slate-950" />
                <span className="text-xs text-slate-400">{problem.sourceRef}</span>
              </div>
              <div className="mt-3 grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
                <div className="rounded-lg bg-violet-50 px-3 py-3">
                  <AiText
                    value={`代表：${problem.represents}`}
                    className="text-sm leading-6 text-slate-700"
                  />
                  <AiText
                    value={`触发：${problem.trigger}`}
                    className="mt-2 text-sm leading-6 text-violet-800"
                  />
                </div>
                <div className="space-y-1.5">
                  {problem.solutionOutline.map((step, index) => (
                    <AiText
                      key={`${step}-${index}`}
                      value={`${index + 1}. ${step}`}
                      className="text-sm leading-6 text-slate-700"
                    />
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {guide.commonMistakes.length ? (
        <section className="order-7 rounded-xl border border-rose-200 bg-rose-50/60 p-4">
          <h3 className="text-base font-semibold text-rose-950">常见误区</h3>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {guide.commonMistakes.map((item) => (
              <div key={item.mistake} className="rounded-xl bg-white p-4">
                <AiText
                  value={`误区：${item.mistake}`}
                  className="text-sm leading-6 text-rose-900"
                />
                <AiText
                  value={`纠正：${item.correction}`}
                  className="mt-2 text-sm leading-6 text-emerald-900"
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <div className="order-8">
        <NoteDesignResult noteDesign={guide.noteDesign} />
      </div>
    </div>
  );
}

function ResearchNotebookResult({
  output,
}: {
  output: Extract<PlatformFlowOutput, { kind: 'notebook' }>;
}) {
  if (output.studyGuide.kind !== 'research') return null;
  const guide = output.studyGuide.content;
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-indigo-950">
          <FlaskConical className="size-4" /> 研究问题
        </div>
        <AiText value={guide.researchQuestion} className="mt-3 text-lg leading-8 text-slate-900" />
      </section>
      <section>
        <h3 className="text-base font-semibold text-slate-950">核心主张 · 证据 · 边界</h3>
        <div className="mt-3 space-y-3">
          {guide.coreClaims.map((item, index) => (
            <article
              key={`${item.claim}-${index}`}
              className="rounded-2xl border border-slate-200 bg-white p-5"
            >
              <AiText
                value={`${index + 1}. ${item.claim}`}
                className="font-semibold leading-7 text-slate-950"
              />
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="rounded-xl bg-emerald-50 p-4">
                  <div className="text-xs font-semibold text-emerald-700">证据</div>
                  <AiText
                    value={item.evidence}
                    className="mt-2 text-sm leading-7 text-emerald-950"
                  />
                </div>
                <div className="rounded-xl bg-amber-50 p-4">
                  <div className="text-xs font-semibold text-amber-700">不能越过的边界</div>
                  <AiText value={item.boundary} className="mt-2 text-sm leading-7 text-amber-950" />
                </div>
              </div>
              <div className="mt-3 text-xs text-slate-400">{item.sourceRef}</div>
            </article>
          ))}
        </div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-base font-semibold text-slate-950">方法 Pipeline</h3>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {guide.methodPipeline.map((stage, index) => (
            <article key={`${stage.stage}-${index}`} className="rounded-xl bg-slate-50 p-4">
              <AiText
                value={`${index + 1}. ${stage.stage}`}
                className="font-semibold text-slate-950"
              />
              <AiText
                value={`输入：${stage.input}`}
                className="mt-2 text-sm leading-6 text-slate-600"
              />
              <AiText
                value={`处理：${stage.action}`}
                className="mt-1 text-sm leading-6 text-slate-700"
              />
              <AiText
                value={`输出：${stage.output}`}
                className="mt-1 text-sm leading-6 text-indigo-800"
              />
            </article>
          ))}
        </div>
      </section>
      <section>
        <h3 className="text-base font-semibold text-slate-950">实验与证据地图</h3>
        <div className="mt-3 space-y-3">
          {guide.evidenceMap.map((item) => (
            <article
              key={`${item.experimentOrSource}-${item.metric}`}
              className="rounded-2xl border border-slate-200 bg-white p-5"
            >
              <AiText value={item.experimentOrSource} className="font-semibold text-slate-950" />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <AiText
                  value={`指标：${item.metric}`}
                  className="text-sm leading-6 text-slate-700"
                />
                <AiText
                  value={`结果：${item.result}`}
                  className="text-sm leading-6 text-slate-700"
                />
                <AiText
                  value={`支持：${item.supports}`}
                  className="text-sm leading-6 text-emerald-800"
                />
                <AiText
                  value={`边界：${item.boundary}`}
                  className="text-sm leading-6 text-amber-800"
                />
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-5">
          <h3 className="text-base font-semibold text-rose-950">局限</h3>
          {guide.limitations.map((item) => (
            <AiText
              key={item}
              value={`- ${item}`}
              className="mt-2 text-sm leading-7 text-rose-900"
            />
          ))}
        </div>
        <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-5">
          <h3 className="text-base font-semibold text-sky-950">复现信息</h3>
          <div className="mt-3 space-y-3">
            {guide.reproducibility.map((item) => (
              <div key={item.item} className="rounded-xl bg-white p-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="rounded-md">
                    {item.status}
                  </Badge>
                  <AiText value={item.item} className="text-sm font-semibold text-slate-900" />
                </div>
                <AiText value={item.detail} className="mt-2 text-sm leading-6 text-slate-600" />
              </div>
            ))}
          </div>
        </div>
      </section>
      <div className="flex flex-wrap gap-2">
        {guide.retrievalKeywords.map((keyword) => (
          <Badge key={keyword} variant="secondary" className="rounded-md">
            {keyword}
          </Badge>
        ))}
      </div>
      <NoteDesignResult noteDesign={guide.noteDesign} />
    </div>
  );
}

function DailyNotebookResult({
  output,
}: {
  output: Extract<PlatformFlowOutput, { kind: 'notebook' }>;
}) {
  if (output.studyGuide.kind !== 'daily') return null;
  const guide = output.studyGuide.content;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-3">
        {[
          ['必要信息', guide.essentialInformation],
          ['后续行动', guide.actions],
          ['时间线', guide.timeline],
        ].map(([title, items]) => (
          <section
            key={title as string}
            className="rounded-2xl border border-slate-200 bg-white p-5"
          >
            <h3 className="font-semibold text-slate-950">{title as string}</h3>
            {(items as string[]).map((item) => (
              <AiText
                key={item}
                value={`- ${item}`}
                className="mt-2 text-sm leading-7 text-slate-700"
              />
            ))}
          </section>
        ))}
      </div>
      <NoteDesignResult noteDesign={guide.noteDesign} />
    </div>
  );
}

function NotebookResult({ output }: { output: Extract<PlatformFlowOutput, { kind: 'notebook' }> }) {
  const guide = output.studyGuide.content;
  const guideLabel =
    output.studyGuide.kind === 'course'
      ? '课程学习笔记'
      : output.studyGuide.kind === 'research'
        ? '研究阅读笔记'
        : '资料索引';
  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-emerald-700">
          <span>结构化笔记</span>
          <Badge variant="outline" className="rounded-md bg-white text-slate-600">
            {guideLabel}
          </Badge>
        </div>
        <h2 className="mt-2 max-w-5xl text-2xl font-semibold leading-tight tracking-tight text-slate-950">
          {output.title}
        </h2>
      </div>

      {output.studyGuide.kind === 'course' ? (
        <nav
          aria-label="课程笔记内容导航"
          className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2 text-sm shadow-sm"
        >
          {COURSE_NOTEBOOK_NAV_ITEMS.map(([href, label], index) => (
            <a
              key={href}
              href={href}
              className="rounded-lg px-3 py-2 font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
            >
              <span className="mr-1.5 font-mono text-[11px] text-slate-400">{index + 1}</span>
              {label}
            </a>
          ))}
        </nav>
      ) : null}

      <CourseNotebookResult output={output} />
      <ResearchNotebookResult output={output} />
      <DailyNotebookResult output={output} />

      {'quickLookup' in guide && guide.quickLookup.length ? (
        <section className="rounded-2xl border border-sky-200 bg-sky-50/60 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-sky-950">
            <Search className="size-4" /> 快速查阅
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {guide.quickLookup.map((item) => (
              <div key={`${item.question}-${item.sourceRef}`} className="rounded-xl bg-white p-4">
                <AiText
                  value={item.question}
                  className="text-sm font-semibold leading-6 text-slate-950"
                />
                <AiText value={item.answer} className="mt-2 text-sm leading-7 text-slate-700" />
                <div className="mt-2 text-xs text-slate-400">{item.sourceRef}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <details className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
        <summary className="cursor-pointer font-semibold text-slate-950">
          展开完整 Markdown 笔记（{output.sections.length} 节）
        </summary>
        <div className="mt-5 space-y-6">
          {output.sections.map((section) => (
            <article
              key={section.key}
              className="border-t border-slate-100 pt-5 first:border-0 first:pt-0"
            >
              <h3 className="text-lg font-semibold text-slate-950">{section.title}</h3>
              <AiText value={section.summary} className="mt-2 text-sm leading-7 text-slate-500" />
              <AiText
                value={section.markdown}
                className="mt-4 text-[15px] leading-8 text-slate-700"
              />
            </article>
          ))}
        </div>
      </details>

      <NotebookRouteResult output={output} />
    </div>
  );
}

function SlidesResult({ output }: { output: Extract<PlatformFlowOutput, { kind: 'slides' }> }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeSlide = output.slides[activeIndex] || output.slides[0];
  if (!activeSlide) return null;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-violet-700">PPT 人工验收</div>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">{output.title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setActiveIndex((index) => Math.max(0, index - 1))}
            disabled={activeIndex === 0}
            aria-label="上一页"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="font-mono text-xs text-slate-500">
            {activeIndex + 1} / {output.slides.length}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setActiveIndex((index) => Math.min(output.slides.length - 1, index + 1))}
            disabled={activeIndex >= output.slides.length - 1}
            aria-label="下一页"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      <div className="aspect-video overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_top_right,#334155_0,#0f172a_42%,#020617_100%)] text-white shadow-2xl ring-1 ring-slate-950/10">
        {activeSlide.imageDataUrl ? (
          <img
            src={activeSlide.imageDataUrl}
            alt={activeSlide.title}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full flex-col p-[5%]">
            <div className="text-[clamp(10px,1.1vw,14px)] font-semibold uppercase tracking-[0.18em] text-sky-300">
              {activeSlide.eyebrow}
            </div>
            <h3 className="mt-[3%] max-w-[82%] text-[clamp(24px,3.4vw,52px)] font-semibold leading-[1.08] tracking-tight">
              {activeSlide.title}
            </h3>
            <p className="mt-[2%] max-w-[80%] text-[clamp(12px,1.45vw,22px)] leading-relaxed text-slate-300">
              {activeSlide.summary}
            </p>
            <div className="mt-auto grid gap-[2%] sm:grid-cols-[1fr_0.72fr]">
              <ul className="space-y-[2%] text-[clamp(11px,1.2vw,18px)] leading-relaxed text-slate-100">
                {activeSlide.points.map((point) => (
                  <li key={point} className="flex gap-2">
                    <span className="mt-[0.5em] size-1.5 shrink-0 rounded-full bg-emerald-400" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              <div className="self-end rounded-xl border border-white/15 bg-white/10 p-[6%] backdrop-blur-sm">
                <div className="text-[clamp(9px,0.9vw,12px)] font-semibold uppercase tracking-wider text-emerald-300">
                  Takeaway
                </div>
                <p className="mt-2 text-[clamp(11px,1.1vw,17px)] font-medium leading-relaxed">
                  {activeSlide.callout}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {output.slides.map((slide, index) => (
          <button
            key={`${slide.title}-${index}`}
            type="button"
            onClick={() => setActiveIndex(index)}
            className={`rounded-xl border px-3 py-3 text-left text-sm transition ${
              index === activeIndex
                ? 'border-violet-300 bg-violet-50 text-violet-950'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span className="font-mono text-[11px] text-slate-400">PAGE {index + 1}</span>
            <span className="mt-1 block font-semibold">{slide.title}</span>
          </button>
        ))}
      </div>
      <details className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
        <summary className="cursor-pointer font-semibold text-slate-900">视觉方向</summary>
        <p className="mt-2 leading-6">{activeSlide.visualDirection}</p>
      </details>
    </div>
  );
}

function ReviewPlanResult({
  output,
}: {
  output: Extract<PlatformFlowOutput, { kind: 'review-plan' }>;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-slate-950 px-6 py-6 text-white">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
          <Layers3 className="size-4" />
          模拟用户复习计划
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">{output.title}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">{output.learnerSummary}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {output.priorities.map((priority) => (
            <span
              key={priority}
              className="rounded-md bg-white/10 px-2.5 py-1 text-xs text-slate-200"
            >
              {priority}
            </span>
          ))}
        </div>
      </div>
      <div className="grid gap-3">
        {output.tasks.map((task, index) => (
          <article
            key={`${task.title}-${index}`}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-xs font-semibold text-violet-600">任务 {index + 1}</div>
                <h3 className="mt-1 text-base font-semibold text-slate-950">{task.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{task.reason}</p>
              </div>
              <Badge variant="outline" className="w-fit shrink-0 rounded-md">
                <Clock3 className="size-3.5" />
                {task.minutes} 分钟
              </Badge>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl bg-slate-50 px-4 py-3">
                <div className="text-xs font-semibold text-slate-500">证据</div>
                <ul className="mt-2 space-y-1.5 text-sm leading-6 text-slate-700">
                  {task.evidence.map((evidence) => (
                    <li key={evidence}>• {evidence}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl bg-emerald-50 px-4 py-3">
                <div className="text-xs font-semibold text-emerald-700">完成信号</div>
                <p className="mt-2 text-sm leading-6 text-emerald-900">{task.completionSignal}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function PlatformFlowResultPreview({ output }: { output: PlatformFlowOutput }) {
  if (output.kind === 'image') return <ImageResult output={output} />;
  if (output.kind === 'calendar') return <CalendarResult output={output} />;
  if (output.kind === 'questions') return <QuestionResult output={output} />;
  if (output.kind === 'text') return <TextResult output={output} />;
  if (output.kind === 'explanation') return <ExplanationResult output={output} />;
  if (output.kind === 'notebook') return <NotebookResult output={output} />;
  if (output.kind === 'slides') return <SlidesResult output={output} />;
  return <ReviewPlanResult output={output} />;
}
