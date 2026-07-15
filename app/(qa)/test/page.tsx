import Link from 'next/link';
import {
  ArrowRight,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  FileUp,
  Lightbulb,
  ListChecks,
  MessageSquareText,
  NotebookText,
  Presentation,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  CORE_PLATFORM_TEST_SCENARIOS,
  PLATFORM_TEST_CATEGORY_LABELS,
  RECOMMENDED_PLATFORM_TEST_SCENARIOS,
  SECOND_PHASE_MEMORY_TEST_SCENARIOS,
  type PlatformTestCategory,
  type PlatformTestScenario,
} from '@/features/qa/test-center/registry';

const CATEGORY_ICONS: Record<PlatformTestCategory, typeof NotebookText> = {
  notebook: NotebookText,
  calendar: CalendarDays,
  practice: ListChecks,
  teaching: MessageSquareText,
  memory: BrainCircuit,
};

const CATEGORY_STYLES: Record<PlatformTestCategory, string> = {
  notebook: 'bg-sky-50 text-sky-700 ring-sky-200',
  calendar: 'bg-amber-50 text-amber-700 ring-amber-200',
  practice: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  teaching: 'bg-violet-50 text-violet-700 ring-violet-200',
  memory: 'bg-violet-50 text-violet-700 ring-violet-200',
};

const PHASE_STYLES = {
  first: {
    card: 'hover:border-sky-300',
    order: 'bg-sky-600',
    category: 'bg-sky-50 text-sky-700 ring-sky-200',
    step: 'bg-sky-50 text-sky-700',
  },
  second: {
    card: 'hover:border-violet-300',
    order: 'bg-violet-600',
    category: 'bg-violet-50 text-violet-700 ring-violet-200',
    step: 'bg-violet-50 text-violet-700',
  },
} as const;

function ScenarioCard({
  scenario,
  phase,
}: {
  scenario: PlatformTestScenario;
  phase?: keyof typeof PHASE_STYLES;
}) {
  const CategoryIcon = CATEGORY_ICONS[scenario.category];
  const phaseStyle = phase ? PHASE_STYLES[phase] : null;

  return (
    <Card
      className={`gap-0 overflow-hidden rounded-2xl border-slate-200 py-0 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${phaseStyle?.card ?? 'hover:border-slate-300'}`}
    >
      <CardHeader className="border-b border-slate-100 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-4">
            <div
              className={`flex size-11 shrink-0 items-center justify-center rounded-xl font-mono text-sm font-semibold text-white ${phaseStyle?.order ?? 'bg-slate-950'}`}
            >
              {String(scenario.order).padStart(2, '0')}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={`rounded-md border-0 ring-1 ${phaseStyle?.category ?? CATEGORY_STYLES[scenario.category]}`}
                >
                  <CategoryIcon className="size-3.5" />
                  {PLATFORM_TEST_CATEGORY_LABELS[scenario.category]}
                </Badge>
                {scenario.recommended ? (
                  <Badge variant="outline" className="rounded-md border-dashed text-slate-500">
                    建议补充
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="rounded-md">
                    核心流程
                  </Badge>
                )}
              </div>
              <CardTitle className="mt-3 text-lg leading-7 tracking-normal text-slate-950">
                {scenario.title}
              </CardTitle>
              <CardDescription className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-600">
                {scenario.summary}
              </CardDescription>
            </div>
          </div>

          <Button asChild variant="outline" className="shrink-0 rounded-lg">
            <Link href={`/test/${scenario.id}`}>
              查看流程
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="px-5 py-4 sm:px-6">
        <ol className="grid gap-2 lg:grid-cols-4" aria-label={`${scenario.title}测试步骤`}>
          {scenario.steps.map((step, index) => (
            <li key={step.title} className="flex min-w-0 items-center gap-2 text-sm text-slate-600">
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold ${phaseStyle?.step ?? 'bg-slate-100 text-slate-600'}`}
              >
                {index + 1}
              </span>
              <span className="truncate font-medium">{step.title}</span>
              {index < scenario.steps.length - 1 ? (
                <ArrowRight className="ml-auto hidden size-3.5 shrink-0 text-slate-300 lg:block" />
              ) : null}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

export default function PlatformTestsPage() {
  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-8 sm:px-6 lg:py-10">
        <header className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-8 px-6 py-8 lg:grid-cols-[1fr_320px] lg:px-9 lg:py-10">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                <span className="flex size-7 items-center justify-center rounded-lg bg-slate-950 text-white">
                  <ShieldCheck className="size-4" />
                </span>
                Syntara 平台流程 QA
              </div>
              <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
                按真实学习旅程测试，而不是按技术模块测试
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
                旧测试入口已从测试中心下线。新的每一项都是一条完整平台流程，进入后可查看前置条件、操作步骤、预期产物和通过标准。
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Badge variant="secondary" className="rounded-md px-2.5 py-1">
                  <FileUp className="size-3.5" />
                  文件输入
                </Badge>
                <Badge variant="secondary" className="rounded-md px-2.5 py-1">
                  <Presentation className="size-3.5" />
                  教学输出
                </Badge>
                <Badge variant="secondary" className="rounded-md px-2.5 py-1">
                  <BrainCircuit className="size-3.5" />
                  个性化记忆
                </Badge>
                <Badge variant="secondary" className="rounded-md px-2.5 py-1">
                  <CheckCircle2 className="size-3.5" />
                  可验收证据
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 self-start">
              <div className="rounded-2xl bg-sky-600 p-5 text-white">
                <div className="font-mono text-3xl font-semibold">
                  {CORE_PLATFORM_TEST_SCENARIOS.length}
                </div>
                <div className="mt-1 text-sm text-sky-100">第一阶段核心流程</div>
              </div>
              <div className="rounded-2xl bg-violet-600 p-5 text-white">
                <div className="font-mono text-3xl font-semibold">
                  {SECOND_PHASE_MEMORY_TEST_SCENARIOS.length}
                </div>
                <div className="mt-1 text-sm text-violet-100">第二阶段记忆测试</div>
              </div>
              <div className="col-span-2 rounded-2xl bg-slate-50 p-5 ring-1 ring-inset ring-slate-200">
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  <Sparkles className="size-4 text-violet-500" />
                  统一验收结构
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  输入可控、过程可见、产物可核对、副作用可追踪。
                </p>
              </div>
            </div>
          </div>
        </header>

        <section aria-labelledby="core-flow-title">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-sky-700">
                <ListChecks className="size-4" />
                第一阶段测试范围
              </div>
              <h2 id="core-flow-title" className="mt-1 text-2xl font-semibold tracking-tight">
                {CORE_PLATFORM_TEST_SCENARIOS.length} 条第一阶段核心平台流程
              </h2>
            </div>
            <p className="text-sm text-slate-500">按文件 → 计划 → 练习 → 讲解 → 记忆组织</p>
          </div>
          <div className="grid gap-4">
            {CORE_PLATFORM_TEST_SCENARIOS.map((scenario) => (
              <ScenarioCard key={scenario.id} scenario={scenario} phase="first" />
            ))}
          </div>
        </section>

        <section aria-labelledby="phase-two-memory-title">
          <div className="mb-4 rounded-2xl border border-violet-200 bg-violet-50 px-5 py-4 sm:px-6">
            <div className="flex gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                <BrainCircuit className="size-4" />
              </span>
              <div>
                <div className="text-sm font-semibold text-violet-700">第二阶段测试范围</div>
                <h2
                  id="phase-two-memory-title"
                  className="mt-1 text-lg font-semibold text-violet-950"
                >
                  {SECOND_PHASE_MEMORY_TEST_SCENARIOS.length} 条独立的记忆与 AI 个性化测试
                </h2>
                <p className="mt-1 text-sm leading-6 text-violet-800">
                  四个人物基线保持只读；每条测试独立选择人物并创建一次性本地副本，测试之间和重跑之间不会互相污染。
                </p>
              </div>
            </div>
          </div>
          <div className="grid gap-4">
            {SECOND_PHASE_MEMORY_TEST_SCENARIOS.map((scenario) => (
              <ScenarioCard key={scenario.id} scenario={scenario} phase="second" />
            ))}
          </div>
        </section>

        <section aria-labelledby="recommended-flow-title" className="pb-6">
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 sm:px-6">
            <div className="flex gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                <Lightbulb className="size-4" />
              </span>
              <div>
                <h2 id="recommended-flow-title" className="text-lg font-semibold text-amber-950">
                  我建议另外补 6 条发布前回归
                </h2>
                <p className="mt-1 text-sm leading-6 text-amber-800">
                  上面的核心与记忆测试证明功能“能跑”；下面 6
                  条主要证明真实环境中的异常、隔离、证据和跨模块状态“不会跑偏”。
                </p>
              </div>
            </div>
          </div>
          <div className="grid gap-4">
            {RECOMMENDED_PLATFORM_TEST_SCENARIOS.map((scenario) => (
              <ScenarioCard key={scenario.id} scenario={scenario} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
