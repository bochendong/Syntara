import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  ExternalLink,
  FileInput,
  Flag,
  Lightbulb,
  Play,
  Quote,
  Settings2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PlatformTestRunArchive } from '@/features/qa/test-center/components/platform-test-run-archive';
import {
  PLATFORM_TEST_CATEGORY_LABELS,
  PLATFORM_TEST_SCENARIOS,
  getPlatformTestScenario,
  isMemoryPhaseTwoScenario,
} from '@/features/qa/test-center/registry';
import { PlatformFlowTestWorkspace } from '@/features/qa/test-center/workspace/platform-flow-test-workspace';
import { isCorePlatformScenarioId } from '@/features/qa/test-center/workspace/types';
import { MemoryLifecycleTestWorkspace } from '@/features/qa/test-center/memory/memory-lifecycle-test-workspace';

export function generateStaticParams() {
  return PLATFORM_TEST_SCENARIOS.filter(
    (scenario) => scenario.id !== 'end-to-end-learning-loop',
  ).map((scenario) => ({ scenarioId: scenario.id }));
}

export default async function PlatformTestScenarioPage({
  params,
}: {
  params: Promise<{ scenarioId: string }>;
}) {
  const { scenarioId } = await params;
  if (scenarioId === 'memory-lifecycle-personalization') {
    redirect('/test/memory-simulated-user');
  }
  const scenario = getPlatformTestScenario(scenarioId);
  if (!scenario) notFound();

  if (isCorePlatformScenarioId(scenario.id)) {
    return <PlatformFlowTestWorkspace scenario={{ ...scenario, id: scenario.id }} />;
  }

  if (isMemoryPhaseTwoScenario(scenario.id)) {
    return <MemoryLifecycleTestWorkspace activeScenarioId={scenario.id} />;
  }

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8 sm:px-6 lg:py-10">
        <div>
          <Button asChild variant="ghost" className="-ml-3 rounded-lg text-slate-600">
            <Link href="/test">
              <ArrowLeft className="size-4" />
              返回流程列表
            </Link>
          </Button>
        </div>

        <header className="rounded-3xl border border-slate-200 bg-white px-6 py-7 shadow-sm sm:px-8 sm:py-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="rounded-md bg-slate-950 font-mono text-white hover:bg-slate-950">
                  流程 {String(scenario.order).padStart(2, '0')}
                </Badge>
                <Badge variant="secondary" className="rounded-md">
                  {PLATFORM_TEST_CATEGORY_LABELS[scenario.category]}
                </Badge>
                <Badge variant="outline" className="rounded-md">
                  {scenario.recommended ? '建议补充' : '核心流程'}
                </Badge>
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                {scenario.title}
              </h1>
              <p className="mt-3 text-base leading-7 text-slate-600">{scenario.summary}</p>
            </div>

            <Button
              asChild
              size="lg"
              className="shrink-0 rounded-xl bg-slate-950 hover:bg-slate-800"
            >
              <Link href={scenario.entryHref}>
                <Play className="size-4" />
                {scenario.entryLabel}
                <ExternalLink className="size-4" />
              </Link>
            </Button>
          </div>
        </header>

        {scenario.recommendationReason ? (
          <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-950">
            <Lightbulb className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div>
              <div className="font-semibold">为什么需要这条测试</div>
              <p className="mt-1 text-sm leading-6 text-amber-800">
                {scenario.recommendationReason}
              </p>
            </div>
          </div>
        ) : null}

        <section className="grid gap-5 lg:grid-cols-3" aria-label="测试准备">
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base tracking-normal">
                <Settings2 className="size-4 text-slate-500" />
                前置条件
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm leading-6 text-slate-600">
                {scenario.setup.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <CircleDot className="mt-1.5 size-3 shrink-0 text-slate-400" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base tracking-normal">
                <FileInput className="size-4 text-sky-600" />
                测试输入
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm leading-6 text-slate-600">
                {scenario.inputs.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <ArrowRight className="mt-1.5 size-3 shrink-0 text-sky-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base tracking-normal">
                <Flag className="size-4 text-emerald-600" />
                预期产物
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm leading-6 text-slate-600">
                {scenario.outputs.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <CheckCircle2 className="mt-1.5 size-3.5 shrink-0 text-emerald-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>

        {scenario.prompts?.length ? (
          <section className="rounded-2xl border border-violet-200 bg-violet-50 px-5 py-5 sm:px-6">
            <div className="flex items-center gap-2 font-semibold text-violet-950">
              <Quote className="size-4" />
              建议测试话术
            </div>
            <div className="mt-3 grid gap-2">
              {scenario.prompts.map((prompt) => (
                <blockquote
                  key={prompt}
                  className="rounded-xl border border-violet-100 bg-white px-4 py-3 text-sm leading-6 text-slate-700"
                >
                  {prompt}
                </blockquote>
              ))}
            </div>
          </section>
        ) : null}

        <section aria-labelledby="test-steps-title">
          <div className="mb-4">
            <div className="text-sm font-semibold text-sky-700">操作顺序</div>
            <h2 id="test-steps-title" className="mt-1 text-2xl font-semibold tracking-tight">
              测试流程与留证
            </h2>
          </div>

          <ol className="grid gap-4 lg:grid-cols-4">
            {scenario.steps.map((step, index) => (
              <li key={step.title} className="relative">
                <Card className="h-full rounded-2xl border-slate-200 shadow-sm">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <span className="flex size-8 items-center justify-center rounded-lg bg-slate-950 font-mono text-xs font-semibold text-white">
                        {index + 1}
                      </span>
                      {index < scenario.steps.length - 1 ? (
                        <ArrowRight className="hidden size-4 text-slate-300 lg:block" />
                      ) : (
                        <CheckCircle2 className="size-4 text-emerald-500" />
                      )}
                    </div>
                    <CardTitle className="mt-2 text-base tracking-normal">{step.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm leading-6">
                    <p className="text-slate-600">{step.action}</p>
                    <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-600 ring-1 ring-inset ring-slate-100">
                      <span className="font-semibold text-slate-800">留证：</span>
                      {step.evidence}
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        <section
          className="rounded-3xl bg-slate-950 px-6 py-7 text-white sm:px-8"
          aria-labelledby="pass-criteria-title"
        >
          <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
            <div>
              <div className="text-sm font-semibold text-emerald-300">最终判定</div>
              <h2 id="pass-criteria-title" className="mt-1 text-2xl font-semibold tracking-tight">
                通过标准
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                四项全部满足才算流程通过；发现副作用或数据不一致时直接判失败。
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {scenario.passCriteria.map((criterion) => (
                <li
                  key={criterion}
                  className="flex gap-3 rounded-xl bg-white/5 px-4 py-3 text-sm leading-6 text-slate-200 ring-1 ring-inset ring-white/10"
                >
                  <CheckCircle2 className="mt-1 size-4 shrink-0 text-emerald-400" />
                  <span>{criterion}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <PlatformTestRunArchive
          testId={scenario.id}
          title={scenario.title}
          defaultPrompt={scenario.prompts?.[0] || scenario.summary}
        />
      </div>
    </main>
  );
}
