'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileUp,
  HardDrive,
  Layers3,
  Loader2,
  MessageSquareText,
  PencilLine,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  UserRound,
  UserRoundPlus,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  buildLocalMemoryEvidence,
  disposeLocalMemoryTestScenarioRun,
  ensureLocalMemoryTestUserCohort,
  LOCAL_PROBLEM_WRITEBACK_CASES,
  LOCAL_MEMORY_TEST_USER_FIXTURES,
  prepareLocalMemoryTestScenarioRun,
  queryLocalMemoryTest,
  runLocalMemoryTestAction,
  type LocalMemoryMutationResponse,
  type LocalMemoryLearnerProfile,
  type LocalProblemWritebackCase,
  type LocalMemoryTestSnapshot,
} from '@/features/qa/test-center/memory/local-memory-test-store';
import {
  SECOND_PHASE_MEMORY_TEST_SCENARIOS,
  type MemoryPhaseTwoGroup,
  type MemoryPhaseTwoTestScenario,
} from '@/features/qa/test-center/registry';
import { backendJson } from '@/lib/utils/backend-api';

type Snapshot = LocalMemoryTestSnapshot;
type MutationResponse = LocalMemoryMutationResponse;

type AiTask = 'questions' | 'explanation' | 'review_plan' | 'next_action';

type AiResponse = {
  action: 'generate';
  task: AiTask;
  model: string;
  usage: unknown;
  context: {
    instruction: string;
    evidence: Array<{ id: string; layer: string; title: string; content: string }>;
    recall: unknown;
  };
  output: {
    title: string;
    summary: string;
    items: Array<{
      title: string;
      content: string;
      evidenceIds: string[];
      difficulty: string | null;
      minutes: number | null;
    }>;
    adaptations: string[];
    uncertainty: string[];
  };
  evidenceChecks: Array<{
    title: string;
    passed: boolean;
    citedIds: string[];
    unknownIds: string[];
  }>;
  passedMachineCheck: boolean;
};

const AI_API = '/api/platform-tests/memory-local-ai';
const CHECK_STORAGE_KEY = 'syntara-memory-phase2-manual-checks';
const COHORT_SCENARIO_ID = 'memory-simulated-user';

const GROUP_LABELS: Record<MemoryPhaseTwoGroup, string> = {
  setup: '测试准备',
  write: '记忆写入',
  manage: '查询、修改与删除',
  ai: 'AI 使用记忆',
};

const AI_TASK_BY_SCENARIO: Record<string, AiTask> = {
  'memory-ai-question-generation': 'questions',
  'memory-ai-explanation': 'explanation',
  'memory-ai-review-plan': 'review_plan',
  'memory-ai-next-action': 'next_action',
};

const AI_TASK_LABELS: Record<AiTask, string> = {
  questions: '基于记忆生成三道递进题',
  explanation: '基于记忆进行个性化讲解',
  review_plan: '基于记忆制定三天复习计划',
  next_action: '基于记忆推荐下一学习动作',
};

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function JsonBlock({ value, maxHeight = 'max-h-72' }: { value: unknown; maxHeight?: string }) {
  return (
    <pre
      className={`${maxHeight} overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-200`}
    >
      {pretty(value)}
    </pre>
  );
}

function CountCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
      <div className="font-mono text-xl font-semibold text-slate-950">{value}</div>
      <div className="mt-1 text-[11px] leading-4 text-slate-500">{label}</div>
    </div>
  );
}

function SnapshotCounts({ snapshot }: { snapshot: Snapshot }) {
  return (
    <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
      <CountCard label="长期/教学记忆" value={snapshot.counts.studyMemories} />
      <CountCard label="当前结构化事实" value={snapshot.counts.activeFacts} />
      <CountCard label="事实变更事件" value={snapshot.counts.factEvents} />
      <CountCard label="本地上传资料" value={snapshot.counts.materials} />
      <CountCard label="测试题目" value={snapshot.counts.problems} />
      <CountCard label="作答记录" value={snapshot.counts.attempts} />
      <CountCard label="测试对话" value={snapshot.counts.conversations} />
      <CountCard label="日历事项" value={snapshot.counts.calendarEvents} />
    </section>
  );
}

function exactFactValue(snapshot: Snapshot, namespace: string, key: string) {
  return snapshot.facts.find((fact) => fact.namespace === namespace && fact.key === key)?.valueJson;
}

function learnerProfileFromSnapshot(snapshot: Snapshot): LocalMemoryLearnerProfile | null {
  const value = exactFactValue(snapshot, 'profile', 'learner_level');
  if (!value || typeof value !== 'object') return null;
  const profile = value as Partial<LocalMemoryLearnerProfile>;
  if (
    typeof profile.levelId !== 'string' ||
    typeof profile.levelLabel !== 'string' ||
    typeof profile.masteryPercent !== 'number' ||
    !Array.isArray(profile.mastered) ||
    !Array.isArray(profile.weaknesses) ||
    typeof profile.nextTeachingMove !== 'string'
  ) {
    return null;
  }
  return profile as LocalMemoryLearnerProfile;
}

type UsageSummary = {
  usageTier: 'new' | 'light' | 'active' | 'heavy';
  usageLabel: string;
  accountAgeDays: number;
  activeDays: number;
  studySessions: number;
  problemCount: number;
  attemptCount: number;
  conversationCount: number;
  materialCount: number;
  calendarEventCount: number;
  reviewCount: number;
  durablePrivateMemoryCount: number;
  messageCount: number;
  passedAttempts: number;
  lastActiveAt: string;
};

function usageSummaryFromSnapshot(snapshot: Snapshot): UsageSummary | null {
  const value = exactFactValue(snapshot, 'usage', 'activity_summary');
  if (!value || typeof value !== 'object') return null;
  const usage = value as Partial<UsageSummary>;
  if (
    typeof usage.usageLabel !== 'string' ||
    typeof usage.accountAgeDays !== 'number' ||
    typeof usage.activeDays !== 'number' ||
    typeof usage.studySessions !== 'number' ||
    typeof usage.messageCount !== 'number' ||
    typeof usage.reviewCount !== 'number'
  ) {
    return null;
  }
  return usage as UsageSummary;
}

function formatLocalDate(value: number | string | undefined) {
  if (value === undefined) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function SourceHistoryPreview({ snapshot }: { snapshot: Snapshot }) {
  const recentProblems = [...snapshot.sources.problems]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 6);
  const recentAttempts = [...snapshot.sources.attempts]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 6);
  const recentConversations = [...snapshot.sources.conversations]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 4);
  const recentMaterials = snapshot.sources.materials.slice(0, 4);
  const calendarFacts = snapshot.facts
    .filter((fact) => fact.namespace === 'calendar')
    .slice(0, 4)
    .map((fact) => ({
      key: fact.key,
      value: fact.valueJson as {
        title?: string;
        startAt?: string;
        status?: string;
      },
    }));

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-slate-950">最近题目与作答</h4>
          <Badge variant="outline">
            {snapshot.counts.problems} 题 · {snapshot.counts.attempts} 次
          </Badge>
        </div>
        <div className="mt-3 space-y-2">
          {recentProblems.map((problem) => (
            <div key={problem.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-900">{problem.title}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {problem.concept} · {problem.difficulty} · {formatLocalDate(problem.createdAt)}
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className={
                    problem.latestStatus === 'passed'
                      ? 'bg-emerald-100 text-emerald-800'
                      : problem.latestStatus === 'partial'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800'
                  }
                >
                  {problem.attemptCount} 次 · {problem.latestStatus || '无作答'}
                </Badge>
              </div>
            </div>
          ))}
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold text-slate-500">
            查看最近 6 条逐次作答记录
          </summary>
          <div className="mt-2 space-y-2">
            {recentAttempts.map((attempt) => (
              <div
                key={attempt.id}
                className="rounded-xl bg-white p-3 text-xs leading-5 text-slate-600"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-slate-900">
                    {attempt.problemTitle}
                  </span>
                  <span className="font-mono">
                    {attempt.status} · {attempt.score}/2
                  </span>
                </div>
                <p className="mt-1">{attempt.feedback}</p>
              </div>
            ))}
          </div>
        </details>
      </div>

      <div className="space-y-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-slate-950">聊天记录</h4>
            <Badge variant="outline">{snapshot.counts.conversations} 段</Badge>
          </div>
          <div className="mt-3 space-y-2">
            {recentConversations.length ? (
              recentConversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className="rounded-xl border border-slate-200 bg-white p-3"
                >
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-slate-900">{conversation.title}</span>
                    <span className="text-xs text-slate-400">
                      {conversation.messageCount} 条消息
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                    {conversation.lastUserMessage}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">还没有聊天记录。</p>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-slate-950">上传资料</h4>
              <Badge variant="outline">{snapshot.counts.materials} 份</Badge>
            </div>
            <div className="mt-3 space-y-2 text-xs text-slate-600">
              {recentMaterials.length ? (
                recentMaterials.map((material) => (
                  <div key={material.id} className="truncate rounded-lg bg-white px-3 py-2">
                    {material.name}
                  </div>
                ))
              ) : (
                <p>尚未上传资料。</p>
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-slate-950">日历记忆</h4>
              <Badge variant="outline">{snapshot.counts.calendarEvents} 项</Badge>
            </div>
            <div className="mt-3 space-y-2 text-xs text-slate-600">
              {calendarFacts.length ? (
                calendarFacts.map((fact) => (
                  <div key={fact.key} className="rounded-lg bg-white px-3 py-2">
                    <div className="font-medium text-slate-900">{fact.value.title || fact.key}</div>
                    <div className="mt-0.5 text-slate-400">
                      {formatLocalDate(fact.value.startAt)} · {fact.value.status || 'planned'}
                    </div>
                  </div>
                ))
              ) : (
                <p>尚未创建日历事项。</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MutationEvidence({ mutation }: { mutation: MutationResponse | null }) {
  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">本次临时运行的 before / after</CardTitle>
      </CardHeader>
      <CardContent>
        {mutation ? (
          <JsonBlock
            value={{
              action: mutation.action,
              delta: mutation.delta,
              result: mutation.result,
              before: mutation.before?.counts,
              after: mutation.after?.counts,
            }}
          />
        ) : (
          <p className="text-sm text-slate-500">
            每次运行都从人物基线创建一次性副本，再读取 before / after / delta；副本随后销毁。
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StudyMemoryList({
  memories,
  onDelete,
}: {
  memories: Snapshot['studyMemories'];
  onDelete?: (memoryId: string) => void;
}) {
  if (!memories.length) {
    return <p className="text-sm text-slate-500">当前没有匹配的 StudyMemory。</p>;
  }

  return (
    <div className="space-y-3">
      {memories.map((memory) => (
        <article key={memory.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold text-slate-950">{memory.title}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                <Badge variant="secondary">{memory.kind}</Badge>
                <Badge variant="outline">{memory.source}</Badge>
                <Badge variant="outline">{memory.scope}</Badge>
              </div>
            </div>
            {onDelete ? (
              <Button
                size="icon"
                variant="ghost"
                aria-label="删除记忆"
                onClick={() => onDelete(memory.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            ) : null}
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{memory.text}</p>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-medium text-slate-500">
              查看 memoryId 与来源引用
            </summary>
            <div className="mt-2">
              <JsonBlock
                value={{ id: memory.id, sourceReferences: memory.sourceReferences }}
                maxHeight="max-h-48"
              />
            </div>
          </details>
        </article>
      ))}
    </div>
  );
}

function TestSteps({
  steps,
}: {
  steps: Array<{ title: string; action: string; evidence: string }>;
}) {
  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">本条包含 {steps.length} 个小测试</CardTitle>
          <Badge variant="outline">逐条人工核对</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 lg:grid-cols-2">
        {steps.map((step, index) => (
          <article
            id={`memory-subtest-${index + 1}`}
            key={step.title}
            className="scroll-mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4"
          >
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-slate-950 font-mono text-[11px] font-semibold text-white">
                {index + 1}
              </span>
              <h2 className="font-semibold text-slate-950">{step.title}</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">{step.action}</p>
            <p className="mt-2 text-xs leading-5 text-emerald-700">验收证据：{step.evidence}</p>
          </article>
        ))}
      </CardContent>
    </Card>
  );
}

function CurrentTestSidebar({ scenario }: { scenario: MemoryPhaseTwoTestScenario }) {
  const testNumber = String(scenario.order - 7).padStart(2, '0');

  return (
    <nav
      aria-label={`${scenario.shortTitle}的小测试`}
      className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
    >
      <div className="border-b border-slate-100 px-2 pb-3 pt-1">
        <div className="flex items-center justify-between gap-2">
          <Badge className="bg-slate-950 font-mono hover:bg-slate-950">测试 {testNumber}</Badge>
          <span className="text-[11px] font-semibold text-slate-400">
            {scenario.steps.length} 条小测试
          </span>
        </div>
        <div className="mt-3 text-sm font-semibold leading-5 text-slate-950">
          {scenario.shortTitle}
        </div>
        <div className="mt-1 text-xs text-slate-500">{GROUP_LABELS[scenario.phaseTwoGroup]}</div>
      </div>

      <ol className="mt-3 space-y-2">
        {scenario.steps.map((step, index) => (
          <li key={step.title}>
            <a
              href={`#memory-subtest-${index + 1}`}
              className="group flex gap-3 rounded-xl border border-transparent px-3 py-3 transition hover:border-slate-200 hover:bg-slate-50"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 font-mono text-xs font-semibold text-slate-600 group-hover:bg-slate-950 group-hover:text-white">
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-5 text-slate-800">
                  {step.title}
                </span>
                <span className="mt-1 block text-[11px] leading-4 text-slate-500">
                  {step.action}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ol>

      <Button asChild variant="outline" className="mt-3 w-full justify-between rounded-xl">
        <Link href="/test#phase-two-memory-title">
          查看全部 11 条测试
          <ChevronRight className="size-4" />
        </Link>
      </Button>
    </nav>
  );
}

function ProblemWritebackCaseSidebar({
  selectedCaseId,
  disabled,
  onSelect,
}: {
  selectedCaseId: string;
  disabled: boolean;
  onSelect: (testCase: LocalProblemWritebackCase) => void;
}) {
  return (
    <nav
      className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
      aria-label="做题记忆写回测试"
    >
      <div className="px-2 pb-2 pt-1">
        <div className="flex items-center justify-between gap-2">
          <Badge className="bg-slate-950 hover:bg-slate-950">测试 02</Badge>
          <span className="text-[11px] font-semibold text-slate-400">
            {LOCAL_PROBLEM_WRITEBACK_CASES.length} 个独立测试
          </span>
        </div>
        <div className="mt-3 text-sm font-semibold text-slate-950">选择一个做题场景</div>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          每项都从对应人物的只读基线单独开始，互不继承测试结果。
        </p>
      </div>

      <div className="mt-1 max-h-[calc(100vh-300px)] space-y-2 overflow-y-auto pr-1">
        {LOCAL_PROBLEM_WRITEBACK_CASES.map((testCase, index) => {
          const selected = selectedCaseId === testCase.id;
          return (
            <button
              key={testCase.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(testCase)}
              className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                selected
                  ? 'border-slate-950 bg-slate-950 text-white'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              } disabled:cursor-wait disabled:opacity-60`}
            >
              <span className="flex items-start gap-3">
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-semibold ${
                    selected ? 'bg-white text-slate-950' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-5">{testCase.title}</span>
                  <span
                    className={`mt-1 block text-[11px] leading-4 ${selected ? 'text-slate-300' : 'text-slate-500'}`}
                  >
                    {testCase.relationLabel}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <Button asChild variant="outline" className="mt-3 w-full justify-between rounded-xl">
        <Link href="/test#phase-two-memory-title">
          查看全部 11 条测试
          <ChevronRight className="size-4" />
        </Link>
      </Button>
    </nav>
  );
}

function changedStudyMemories(mutation: MutationResponse | null) {
  if (!mutation) return [];
  const beforeById = new Map(mutation.before.studyMemories.map((memory) => [memory.id, memory]));
  return mutation.after.studyMemories
    .map((memory) => {
      const before = beforeById.get(memory.id);
      if (!before) return { change: '新增' as const, memory };
      const changed =
        before.title !== memory.title ||
        before.text !== memory.text ||
        before.kind !== memory.kind ||
        before.status !== memory.status ||
        before.updatedAt !== memory.updatedAt ||
        JSON.stringify(before.sourceReferences) !== JSON.stringify(memory.sourceReferences);
      return changed ? { change: '更新' as const, memory } : null;
    })
    .filter(
      (item): item is { change: '新增' | '更新'; memory: Snapshot['studyMemories'][number] } =>
        Boolean(item),
    );
}

export function MemoryLifecycleTestWorkspace({ activeScenarioId }: { activeScenarioId: string }) {
  const activeScenario =
    SECOND_PHASE_MEMORY_TEST_SCENARIOS.find((scenario) => scenario.id === activeScenarioId) ||
    SECOND_PHASE_MEMORY_TEST_SCENARIOS[0];
  const activeScenarioIndex = SECOND_PHASE_MEMORY_TEST_SCENARIOS.findIndex(
    (scenario) => scenario.id === activeScenario.id,
  );
  const previousScenario = SECOND_PHASE_MEMORY_TEST_SCENARIOS[activeScenarioIndex - 1] || null;
  const nextScenario = SECOND_PHASE_MEMORY_TEST_SCENARIOS[activeScenarioIndex + 1] || null;
  const activeTestNumber = String(activeScenarioIndex + 1).padStart(2, '0');
  const activeAiTask = AI_TASK_BY_SCENARIO[activeScenario.id];

  const [personaSelections, setPersonaSelections] = useState<Record<string, string>>({});
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [cohortSnapshots, setCohortSnapshots] = useState<Snapshot[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [lastMutation, setLastMutation] = useState<MutationResponse | null>(null);
  const [query, setQuery] = useState('我目前在递归上掌握了什么、薄弱在哪里，今晚应该复习什么？');
  const [queryResult, setQueryResult] = useState<unknown>(null);
  const [aiRuns, setAiRuns] = useState<AiResponse[]>([]);
  const [factNamespace, setFactNamespace] = useState('preference');
  const [factKey, setFactKey] = useState('language');
  const [factValue, setFactValue] = useState('"zh-CN"');
  const [calendarStartsAt, setCalendarStartsAt] = useState('2026-07-16T20:00');
  const [manualChecks, setManualChecks] = useState<Record<string, boolean>>({});
  const [selectedProblemCaseId, setSelectedProblemCaseId] = useState(
    LOCAL_PROBLEM_WRITEBACK_CASES[0].id,
  );
  const selectedProblemCase =
    LOCAL_PROBLEM_WRITEBACK_CASES.find((item) => item.id === selectedProblemCaseId) ||
    LOCAL_PROBLEM_WRITEBACK_CASES[0];
  const selectedFixtureUserId =
    activeScenario.id === 'memory-problem-writeback'
      ? selectedProblemCase.fixtureUserId
      : personaSelections[activeScenario.id] || LOCAL_MEMORY_TEST_USER_FIXTURES[0].userId;
  const selectedFixture =
    LOCAL_MEMORY_TEST_USER_FIXTURES.find((fixture) => fixture.userId === selectedFixtureUserId) ||
    LOCAL_MEMORY_TEST_USER_FIXTURES[0];

  useEffect(() => {
    try {
      const savedChecks = localStorage.getItem(CHECK_STORAGE_KEY);
      if (savedChecks) setManualChecks(JSON.parse(savedChecks) as Record<string, boolean>);
    } catch {
      // Keep the manual test UI usable when local history is malformed.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setBusy('prepare_run');
    setError('');
    setSnapshot(null);
    setLastMutation(null);
    setQueryResult(null);
    if (activeAiTask) {
      setAiRuns((current) => current.filter((runItem) => runItem.task !== activeAiTask));
    }
    void (async () => {
      const snapshots = await ensureLocalMemoryTestUserCohort();
      if (cancelled) return;
      setCohortSnapshots(snapshots);
      if (activeScenario.id === COHORT_SCENARIO_ID) {
        const selected =
          snapshots.find((item) => item.user.id === selectedFixtureUserId) || snapshots[0] || null;
        if (selected) setSnapshot(selected);
        return;
      }

      const runSnapshot = await prepareLocalMemoryTestScenarioRun({
        scenarioId: activeScenario.id,
        fixtureUserId: selectedFixtureUserId,
      });
      try {
        if (cancelled) return;
        setSnapshot(runSnapshot);
      } finally {
        await disposeLocalMemoryTestScenarioRun(runSnapshot.user.id);
      }
    })()
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (!cancelled) setBusy(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeAiTask, activeScenario.id, selectedFixtureUserId, selectedProblemCaseId]);

  const latestAi = activeAiTask
    ? aiRuns.find((runItem) => runItem.task === activeAiTask) || null
    : null;
  const relatedMemories = useMemo(() => {
    if (!snapshot) return [];
    const references = (memory: Snapshot['studyMemories'][number]) =>
      JSON.stringify(memory.sourceReferences || {}).toLowerCase();
    if (activeScenario.id === 'memory-problem-writeback') {
      return snapshot.studyMemories.filter((memory) => references(memory).includes('problem'));
    }
    if (activeScenario.id === 'memory-source-upload-writeback') {
      return snapshot.studyMemories.filter((memory) =>
        references(memory).includes('uploaded_material'),
      );
    }
    if (activeScenario.id === 'memory-question-writeback') {
      return snapshot.studyMemories.filter((memory) => {
        const value = references(memory);
        return value.includes('conversation') || value.includes('message');
      });
    }
    return snapshot.studyMemories;
  }, [activeScenario.id, snapshot]);

  async function run(label: string, operation: () => Promise<void>) {
    setBusy(label);
    setError('');
    try {
      await operation();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  }

  async function prepareDisposableRun() {
    return prepareLocalMemoryTestScenarioRun({
      scenarioId: activeScenario.id,
      fixtureUserId: selectedFixtureUserId,
    });
  }

  async function mutate(
    action: string,
    extra: Record<string, unknown> | ((prepared: Snapshot) => Record<string, unknown>) = {},
  ) {
    await run(action, async () => {
      const prepared = await prepareDisposableRun();
      try {
        const resolvedExtra = typeof extra === 'function' ? extra(prepared) : extra;
        const response = await runLocalMemoryTestAction({
          action,
          userId: prepared.user.id,
          ...resolvedExtra,
        });
        setSnapshot(response.snapshot);
        setLastMutation(response);
      } finally {
        await disposeLocalMemoryTestScenarioRun(prepared.user.id);
      }
    });
  }

  async function reloadScenario() {
    await run('prepare_run', async () => {
      const snapshots = await ensureLocalMemoryTestUserCohort();
      setCohortSnapshots(snapshots);
      setLastMutation(null);
      setQueryResult(null);
      if (activeScenario.id === COHORT_SCENARIO_ID) {
        const baseline =
          snapshots.find((item) => item.user.id === selectedFixtureUserId) || snapshots[0];
        if (baseline) setSnapshot(baseline);
        return;
      }
      const prepared = await prepareDisposableRun();
      try {
        setSnapshot(prepared);
      } finally {
        await disposeLocalMemoryTestScenarioRun(prepared.user.id);
      }
    });
  }

  async function runQuery() {
    await run('query', async () => {
      const prepared = await prepareDisposableRun();
      try {
        setQueryResult(await queryLocalMemoryTest(prepared.user.id, query));
        setSnapshot(prepared);
      } finally {
        await disposeLocalMemoryTestScenarioRun(prepared.user.id);
      }
    });
  }

  async function generate(task: AiTask) {
    await run(`generate:${task}`, async () => {
      const prepared = await prepareDisposableRun();
      try {
        const localContext = await buildLocalMemoryEvidence(prepared.user.id);
        const response = await backendJson<AiResponse>(AI_API, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-generation-test-no-charge': 'true',
          },
          body: JSON.stringify({
            action: 'generate',
            userId: prepared.user.id,
            task,
            context: {
              instruction: localContext.instruction,
              evidence: localContext.evidence,
            },
          }),
        });
        setAiRuns([response, ...aiRuns].slice(0, 20));
        setSnapshot(localContext.snapshot);
      } finally {
        await disposeLocalMemoryTestScenarioRun(prepared.user.id);
      }
    });
  }

  function toggleManualCheck(label: string, checked: boolean) {
    const key = `${activeScenario.id}:${label}`;
    const next = { ...manualChecks, [key]: checked };
    setManualChecks(next);
    localStorage.setItem(CHECK_STORAGE_KEY, JSON.stringify(next));
  }

  function selectCohortUser(selectedSnapshot: Snapshot) {
    setPersonaSelections((current) => ({
      ...current,
      [activeScenario.id]: selectedSnapshot.user.id,
    }));
    setLastMutation(null);
    setQueryResult(null);
  }

  function selectProblemWritebackCase(testCase: LocalProblemWritebackCase) {
    setSelectedProblemCaseId(testCase.id);
    setLastMutation(null);
    setQueryResult(null);
    setError('');
  }

  async function reloadCohort() {
    await reloadScenario();
  }

  function renderCohortSelector() {
    return (
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader className="px-4 pb-2 pt-4">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">选择测试用户</CardTitle>
            <Badge variant="outline">4 个水平</Badge>
          </div>
          <p className="text-xs leading-5 text-slate-500">
            {activeScenario.id === COHORT_SCENARIO_ID
              ? '选择后只查看该用户的只读基线。'
              : '每次运行都会从所选人物基线创建一次性副本。'}
          </p>
        </CardHeader>
        <CardContent className="space-y-1.5 px-3 pb-3">
          {LOCAL_MEMORY_TEST_USER_FIXTURES.map((fixture) => {
            const userSnapshot = cohortSnapshots.find((item) => item.user.id === fixture.userId);
            const profile = userSnapshot ? learnerProfileFromSnapshot(userSnapshot) : null;
            const usage = userSnapshot ? usageSummaryFromSnapshot(userSnapshot) : null;
            const selected = selectedFixtureUserId === fixture.userId;
            return (
              <label
                key={fixture.userId}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition ${
                  selected
                    ? 'border-slate-950 bg-slate-950 text-white'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="memory-cohort-user"
                  checked={selected}
                  disabled={!userSnapshot || busy !== null}
                  onChange={() => userSnapshot && selectCohortUser(userSnapshot)}
                  className="mt-0.5 size-4"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{fixture.name}</span>
                    <span
                      className={`font-mono text-xs ${selected ? 'text-slate-300' : 'text-slate-400'}`}
                    >
                      {profile?.masteryPercent ?? '--'}%
                    </span>
                  </span>
                  <span
                    className={`mt-1 block text-xs ${selected ? 'text-slate-300' : 'text-slate-500'}`}
                  >
                    {usage?.usageLabel || fixture.usageProfile.usageLabel} ·{' '}
                    {profile?.levelLabel || fixture.learnerProfile.levelLabel}
                  </span>
                  <span
                    className={`mt-1 block font-mono text-[10px] ${selected ? 'text-slate-400' : 'text-slate-400'}`}
                  >
                    {userSnapshot?.counts.problems ?? fixture.usageProfile.problemCount} 题 /{' '}
                    {userSnapshot?.counts.attempts ?? fixture.usageProfile.attemptCount} 作答 /{' '}
                    {userSnapshot?.counts.conversations ?? fixture.usageProfile.conversationCount}{' '}
                    对话
                  </span>
                </span>
              </label>
            );
          })}
          <Button
            variant="outline"
            size="sm"
            className="mt-2 w-full rounded-xl"
            onClick={reloadCohort}
            disabled={busy !== null}
          >
            {busy === 'prepare_run' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {activeScenario.id === COHORT_SCENARIO_ID
              ? '重新读取四个人物基线'
              : '从人物基线重置本测试'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  function renderCohortComparison() {
    const userSnapshot = cohortSnapshots.find((item) => item.user.id === selectedFixtureUserId);
    const profile = userSnapshot ? learnerProfileFromSnapshot(userSnapshot) : null;
    const preference = userSnapshot
      ? exactFactValue(userSnapshot, 'preference', 'explanation_style')
      : null;
    const habit = userSnapshot ? exactFactValue(userSnapshot, 'habit', 'study_session') : null;
    const usage = userSnapshot ? usageSummaryFromSnapshot(userSnapshot) : null;
    const memories = userSnapshot?.studyMemories || [];
    const privateLongTermCount = memories.filter(
      (memory) => memory.scope === 'private' && memory.kind !== 'working_state',
    ).length;
    const publicMemoryCount = memories.filter((memory) => memory.scope === 'public').length;
    const archivedMemoryCount = memories.filter((memory) => memory.status === 'archived').length;
    const recentMemories = [...memories].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12);
    const accuracy = userSnapshot?.counts.attempts
      ? Math.round(((usage?.passedAttempts || 0) / userSnapshot.counts.attempts) * 100)
      : 0;

    return (
      <section className="space-y-4">
        <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-slate-950">
              {userSnapshot?.user.name || selectedFixture.name}的只读人物基线
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              第一条测试只负责加载和查看人物，不会改变其他测试选择，也不会修改人物记忆。
            </p>
          </div>
          <Badge variant="outline" className="w-fit">
            {usage?.usageLabel || selectedFixture.usageProfile.usageLabel} ·{' '}
            {profile?.levelLabel || selectedFixture.learnerProfile.levelLabel}
          </Badge>
        </div>

        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-xl">
                    {userSnapshot?.user.name || selectedFixture.name}
                  </CardTitle>
                  <Badge className="bg-slate-950 hover:bg-slate-950">
                    {profile?.levelLabel || selectedFixture.learnerProfile.levelLabel}
                  </Badge>
                  <Badge variant="outline">
                    {usage?.usageLabel || selectedFixture.usageProfile.usageLabel}
                  </Badge>
                </div>
                <div className="mt-2 font-mono text-[11px] text-slate-400">
                  {selectedFixture.userId}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-3xl font-semibold text-slate-950">
                  {profile?.masteryPercent ?? '--'}%
                </div>
                <div className="text-[10px] text-slate-400">模拟掌握度</div>
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-500"
                style={{ width: `${profile?.masteryPercent ?? 0}%` }}
              />
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {profile?.summary || '正在读取本地用户信息。'}
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-emerald-50 p-4">
                <div className="text-xs font-semibold text-emerald-700">已掌握</div>
                <ul className="mt-2 space-y-1 text-sm leading-5 text-emerald-950">
                  {(profile?.mastered || []).map((item) => (
                    <li key={item}>· {item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl bg-rose-50 p-4">
                <div className="text-xs font-semibold text-rose-700">当前薄弱点</div>
                <ul className="mt-2 space-y-1 text-sm leading-5 text-rose-950">
                  {(profile?.weaknesses || []).map((item) => (
                    <li key={item}>· {item}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="rounded-xl bg-sky-50 p-4 text-sm leading-6 text-sky-950">
              <span className="font-semibold text-sky-700">下一教学动作：</span>
              {profile?.nextTeachingMove || '等待本地学习状态。'}
            </div>

            <div>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-950">平台使用历史</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    以下数字来自这个用户实际生成的本地题目、作答、对话、资料和事实记录。
                  </p>
                </div>
                <span className="text-xs text-slate-400">
                  最近活跃 {formatLocalDate(usage?.lastActiveAt)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6">
                <CountCard label="注册天数" value={usage?.accountAgeDays || 0} />
                <CountCard label="活跃天数" value={usage?.activeDays || 0} />
                <CountCard label="学习会话" value={usage?.studySessions || 0} />
                <CountCard label="题目" value={userSnapshot?.counts.problems || 0} />
                <CountCard label="逐次作答" value={userSnapshot?.counts.attempts || 0} />
                <CountCard label="通过率 %" value={accuracy} />
                <CountCard label="聊天" value={userSnapshot?.counts.conversations || 0} />
                <CountCard label="聊天消息" value={usage?.messageCount || 0} />
                <CountCard label="上传资料" value={userSnapshot?.counts.materials || 0} />
                <CountCard label="日历事项" value={userSnapshot?.counts.calendarEvents || 0} />
                <CountCard label="错题复习" value={usage?.reviewCount || 0} />
                <CountCard label="事实变更" value={userSnapshot?.counts.factEvents || 0} />
              </div>
            </div>

            {userSnapshot ? <SourceHistoryPreview snapshot={userSnapshot} /> : null}

            <div>
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-slate-950">从来源记录提炼出的分层记忆</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  一次作答不会机械生成一条长期记忆；系统保留原始业务记录，再把跨多次证据稳定出现的掌握、薄弱点和教学动作提炼出来。
                </p>
              </div>
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                <CountCard label="当前短期状态" value={userSnapshot?.workingMemory ? 1 : 0} />
                <CountCard label="私有长期记忆" value={privateLongTermCount} />
                <CountCard label="共有课程记忆" value={publicMemoryCount} />
                <CountCard label="精确当前事实" value={userSnapshot?.counts.activeFacts || 0} />
                <CountCard
                  label="原始来源记录"
                  value={
                    (userSnapshot?.counts.problems || 0) +
                    (userSnapshot?.counts.attempts || 0) +
                    (userSnapshot?.counts.conversations || 0) +
                    (userSnapshot?.counts.materials || 0)
                  }
                />
                <CountCard label="已归档记忆" value={archivedMemoryCount} />
              </div>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h4 className="text-xs font-semibold text-slate-700">最近更新的 12 条记忆</h4>
                <span className="text-xs text-slate-400">共 {memories.length} 条</span>
              </div>
              <StudyMemoryList memories={recentMemories} />
              {memories.length > recentMemories.length ? (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-500">
                    展开全部 {memories.length} 条记忆
                  </summary>
                  <div className="mt-3">
                    <StudyMemoryList
                      memories={[...memories].sort((a, b) => b.updatedAt - a.updatedAt)}
                    />
                  </div>
                </details>
              ) : null}
            </div>
            <details>
              <summary className="cursor-pointer text-xs font-semibold text-slate-500">
                查看全部精确事实、讲解偏好与学习习惯 JSON
              </summary>
              <div className="mt-2">
                <JsonBlock
                  value={{ facts: userSnapshot?.facts || [], preference, habit }}
                  maxHeight="max-h-80"
                />
              </div>
            </details>
          </CardContent>
        </Card>
      </section>
    );
  }

  function renderManualCriteria() {
    return (
      <Card className="rounded-2xl border-emerald-200 bg-emerald-50/40 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">本条测试的人工通过标准</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {activeScenario.passCriteria.map((label) => {
            const key = `${activeScenario.id}:${label}`;
            return (
              <label
                key={label}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm leading-6"
              >
                <input
                  type="checkbox"
                  className="mt-1 size-4"
                  checked={Boolean(manualChecks[key])}
                  onChange={(event) => toggleManualCheck(label, event.target.checked)}
                />
                <span>{label}</span>
              </label>
            );
          })}
          <p className="text-xs leading-5 text-emerald-700">
            勾选状态只记录人工验收，不会替代本地存储结果或机器 evidenceId 校验。
          </p>
        </CardContent>
      </Card>
    );
  }

  function renderUserSidebar() {
    const activeProfile = snapshot ? learnerProfileFromSnapshot(snapshot) : null;
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 font-semibold text-slate-950">
          <UserRound className="size-4" /> 本次测试临时用户
        </div>
        {snapshot ? (
          <div className="mt-3 space-y-3">
            <div>
              <div className="text-base font-semibold">{selectedFixture.name}</div>
              <div className="mt-1 break-all font-mono text-[11px] text-slate-500">
                基线：{selectedFixture.userId}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {activeProfile ? (
                  <Badge className="bg-slate-950 text-[10px] hover:bg-slate-950">
                    {activeProfile.levelLabel} · {activeProfile.masteryPercent}%
                  </Badge>
                ) : null}
                <Badge variant="outline" className="text-[10px] text-amber-700">
                  一次性副本 · 不回写基线
                </Badge>
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              <div className="font-mono text-[10px] text-slate-400">
                临时运行：{snapshot.user.id}
              </div>
              <div className="font-semibold text-slate-900">
                {snapshot.course.courseCode} · {snapshot.course.name}
              </div>
              <div className="mt-1">笔记本：{snapshot.notebook.name}</div>
              <div className="mt-1 break-all font-mono text-[10px]">{snapshot.course.id}</div>
              <div className="break-all font-mono text-[10px]">{snapshot.notebook.id}</div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-violet-50 px-2 py-2">
                <div className="font-mono font-semibold text-violet-800">
                  {snapshot.counts.studyMemories}
                </div>
                <div className="text-[10px] text-violet-600">记忆</div>
              </div>
              <div className="rounded-lg bg-sky-50 px-2 py-2">
                <div className="font-mono font-semibold text-sky-800">
                  {snapshot.counts.activeFacts}
                </div>
                <div className="text-[10px] text-sky-600">事实</div>
              </div>
              <div className="rounded-lg bg-emerald-50 px-2 py-2">
                <div className="font-mono font-semibold text-emerald-800">
                  {snapshot.counts.factEvents}
                </div>
                <div className="text-[10px] text-emerald-600">事件</div>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={reloadScenario}
              disabled={busy !== null}
            >
              <RefreshCw className="size-3.5" /> 从人物基线重新开始
            </Button>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" /> 正在从人物基线准备临时副本
          </div>
        )}
      </div>
    );
  }

  function renderProblemWritebackTest() {
    const changedMemories = changedStudyMemories(lastMutation);
    const result = lastMutation?.result as
      | {
          testCaseId?: string;
          fixtureUserId?: string;
          reusedProblem?: boolean;
          problem?: {
            id?: string;
            title?: string;
            prompt?: string;
            questionType?: string;
          };
          attempts?: Array<{
            id?: string;
            status?: 'ungraded' | 'failed' | 'partial' | 'passed';
            score?: number;
            maxScore?: number;
            answerPreview?: string;
            selectedOptionIds?: string[];
            submissionContext?: string;
            gradingSource?: 'platform_objective' | 'platform_ai' | 'not_graded';
            gradingReliable?: boolean;
            feedback?: string;
          }>;
          workingMemory?: unknown;
          longTermMemory?: { id?: string } | null;
          longTermChange?: 'created' | 'revised' | 'skipped';
          gradingReliable?: boolean;
        }
      | undefined;
    const writeTargetUserId = lastMutation?.after.user.id || snapshot?.user.id || '';
    const ownershipMatches = Boolean(
      lastMutation &&
      result?.fixtureUserId === selectedFixture.userId &&
      lastMutation.before.user.id === writeTargetUserId &&
      lastMutation.after.user.id === writeTargetUserId,
    );
    const expectsNoMemory = selectedProblemCase.writeMode === 'no_memory';
    const resultMemoryFound =
      result?.gradingReliable === false
        ? expectsNoMemory &&
          changedMemories.length === 0 &&
          !result?.workingMemory &&
          !result?.longTermMemory
        : result?.longTermMemory?.id
          ? lastMutation?.after.studyMemories.some(
              (memory) => memory.id === result.longTermMemory?.id,
            )
          : (selectedProblemCase.writeMode === 'working_only' &&
              changedMemories.some(({ memory }) => memory.kind === 'working_state')) ||
            (selectedProblemCase.writeMode === 'no_memory' &&
              changedMemories.length === 0 &&
              !result?.workingMemory &&
              !result?.longTermMemory);
    const expectedLongTermChange = (() => {
      if (result?.gradingReliable === false) {
        return expectsNoMemory && result.longTermChange === 'skipped';
      }
      if (selectedProblemCase.writeMode === 'create_long_term') {
        return result?.longTermChange === 'created';
      }
      if (
        selectedProblemCase.writeMode === 'revise_long_term' ||
        selectedProblemCase.writeMode === 'strengthen_long_term'
      ) {
        return result?.longTermChange === 'revised';
      }
      return result?.longTermChange === 'skipped';
    })();
    const gradingGatePassed = Boolean(
      result &&
      (result.gradingReliable !== false ||
        (changedMemories.length === 0 && !result.workingMemory && !result.longTermMemory)),
    );
    const allResultChecksPass =
      ownershipMatches && gradingGatePassed && resultMemoryFound && expectedLongTermChange;
    const visibleQuestion = result?.problem?.prompt || selectedProblemCase.questionPrompt;
    const visibleQuestionType = result?.problem?.questionType || selectedProblemCase.questionType;
    const visibleAttempts = result?.attempts?.length
      ? result.attempts.map((attempt, index) => ({
          id: attempt.id,
          status: attempt.status || 'ungraded',
          score: attempt.score,
          maxScore: attempt.maxScore || selectedProblemCase.points,
          answer:
            attempt.answerPreview ||
            (attempt.selectedOptionIds?.length
              ? `选择：${attempt.selectedOptionIds.join('、')}`
              : '[没有提交答案]'),
          selectedOptionIds: attempt.selectedOptionIds || [],
          submissionContext: attempt.submissionContext,
          gradingSource: attempt.gradingSource,
          gradingReliable: attempt.gradingReliable === true,
          feedback: attempt.feedback || '',
          previewIndex: index,
        }))
      : selectedProblemCase.attempts.map((attempt, index) => ({
          id: undefined,
          status: 'ungraded' as const,
          score: undefined,
          maxScore: selectedProblemCase.points,
          answer:
            attempt.answer ||
            (attempt.selectedOptionIds?.length
              ? `选择：${attempt.selectedOptionIds.join('、')}`
              : '[没有提交答案]'),
          selectedOptionIds: attempt.selectedOptionIds || [],
          submissionContext: attempt.submissionContext,
          gradingSource: undefined,
          gradingReliable: false,
          feedback: '运行测试后由平台判题，此处不预设正误或分数。',
          previewIndex: index,
        }));

    return (
      <section className="space-y-5">
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-slate-950 hover:bg-slate-950">{selectedFixture.name}</Badge>
                  <Badge variant="outline">{selectedProblemCase.relationLabel}</Badge>
                  <Badge variant="outline">{selectedProblemCase.chapter}</Badge>
                </div>
                <CardTitle className="mt-3 text-xl">{selectedProblemCase.title}</CardTitle>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {selectedProblemCase.description}
                </p>
              </div>
              <Button
                className="shrink-0 bg-slate-950 hover:bg-slate-800"
                onClick={() =>
                  mutate('record_problem_attempts', {
                    testCaseId: selectedProblemCase.id,
                  })
                }
                disabled={busy !== null}
              >
                {busy === 'record_problem_attempts' ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                {busy === 'record_problem_attempts' ? '平台判题中' : '运行这个测试'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl bg-slate-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{visibleQuestionType}</Badge>
                <Badge variant="outline">{selectedProblemCase.difficulty}</Badge>
                <span className="text-xs text-slate-500">{selectedProblemCase.concept}</span>
              </div>
              <div className="mt-3 text-xs font-semibold text-slate-500">用户做的题目</div>
              <div className="mt-1 font-semibold text-slate-950">
                {selectedProblemCase.problemTitle}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {visibleQuestion}
              </p>
              {selectedProblemCase.options?.length ? (
                <div className="mt-3 grid gap-2">
                  {selectedProblemCase.options.map((option) => (
                    <div
                      key={option.id}
                      className="flex gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-5 text-slate-700"
                    >
                      <span className="font-mono font-semibold text-slate-950">{option.id}</span>
                      <span>{option.text}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-600">
                满分 {selectedProblemCase.points} 分 · 运行时判题 ·{' '}
                {selectedProblemCase.options?.length ? '平台选项判题' : '平台 AI 评分'}
              </div>
              <details className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                <summary className="cursor-pointer text-xs font-semibold text-slate-600">
                  查看判题参考与评分 rubric（人工验收用）
                </summary>
                <div className="mt-3 space-y-3 text-xs leading-5 text-slate-600">
                  <div>
                    <div className="font-semibold text-slate-900">参考答案</div>
                    <div className="mt-1 whitespace-pre-wrap">
                      {Array.isArray(selectedProblemCase.referenceAnswer)
                        ? selectedProblemCase.referenceAnswer.join('、')
                        : selectedProblemCase.referenceAnswer}
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">评分 rubric</div>
                    <div className="mt-1 whitespace-pre-wrap">{selectedProblemCase.rubric}</div>
                  </div>
                  <div className="rounded-md bg-slate-50 px-3 py-2">
                    这里展示的是平台判题依据，不是预先写入用户提交的正误或分数。
                  </div>
                </div>
              </details>
              {result?.problem?.id ? (
                <div className="mt-2 break-all font-mono text-[10px] text-slate-400">
                  problemId: {result.problem.id}
                </div>
              ) : null}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-slate-500">用户提交的答案</h3>
                <Badge variant="outline">{visibleAttempts.length} 次提交</Badge>
              </div>
              <div className="space-y-3">
                {visibleAttempts.map((attempt, index) => (
                  <article
                    key={attempt.id || `${selectedProblemCase.id}-${attempt.previewIndex}`}
                    className="rounded-xl border border-slate-200 bg-white p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex size-6 items-center justify-center rounded-md bg-slate-100 font-mono text-xs font-semibold text-slate-600">
                          {index + 1}
                        </span>
                        <Badge
                          className={
                            attempt.status === 'passed'
                              ? 'bg-emerald-600 hover:bg-emerald-600'
                              : attempt.status === 'partial'
                                ? 'bg-amber-500 hover:bg-amber-500'
                                : attempt.status === 'failed'
                                  ? 'bg-rose-600 hover:bg-rose-600'
                                  : 'bg-slate-500 hover:bg-slate-500'
                          }
                        >
                          {attempt.status === 'ungraded'
                            ? attempt.id
                              ? '未判题'
                              : '待平台判题'
                            : `${attempt.status} · ${attempt.score}/${attempt.maxScore}`}
                        </Badge>
                      </div>
                      {attempt.id ? (
                        <span className="font-mono text-[10px] text-slate-400">
                          attemptId: {attempt.id}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">运行后生成 attemptId</span>
                      )}
                    </div>
                    <div className="mt-3 rounded-lg bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-100 whitespace-pre-wrap">
                      {attempt.answer}
                    </div>
                    {attempt.selectedOptionIds.length ? (
                      <div className="mt-2 text-xs font-medium text-slate-700">
                        提交选项：{attempt.selectedOptionIds.join('、')}
                      </div>
                    ) : null}
                    {attempt.submissionContext ? (
                      <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                        {attempt.submissionContext}
                      </div>
                    ) : null}
                    <div className="mt-2 text-xs leading-5 text-slate-500">
                      {attempt.gradingSource === 'platform_ai'
                        ? 'AI 评分'
                        : attempt.gradingSource === 'platform_objective'
                          ? '选项判题'
                          : '判题状态'}
                      ：{attempt.feedback}
                    </div>
                    {attempt.id && !attempt.gradingReliable ? (
                      <div className="mt-2 text-xs font-medium text-rose-700">
                        判题结果不可信：只保留 attempt，不允许写入学习记忆。
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-sky-50 p-4">
              <div className="text-xs font-semibold text-sky-700">预期记忆变化</div>
              <p className="mt-2 text-sm leading-6 text-sky-950">
                {selectedProblemCase.expectedMemoryChange}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">本次实际新增或更新的记忆</CardTitle>
                <p className="mt-1 text-xs text-slate-500">
                  这里只比较本次运行的 before / after，不展示该人物原有的全部记忆。
                </p>
              </div>
              {lastMutation ? (
                <Badge variant="outline">{changedMemories.length} 条变化</Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {!lastMutation ? (
              <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                点击“运行这个测试”后，这里只显示真正发生变化的记忆。
              </div>
            ) : changedMemories.length ? (
              <div className="space-y-4">
                {changedMemories.map(({ change, memory }) => (
                  <div key={memory.id}>
                    <div className="mb-2 flex items-center gap-2">
                      <Badge
                        className={
                          change === '新增'
                            ? 'bg-emerald-600 hover:bg-emerald-600'
                            : 'bg-amber-500 hover:bg-amber-500'
                        }
                      >
                        {change}
                      </Badge>
                      <span className="font-mono text-[11px] text-slate-400">{memory.id}</span>
                    </div>
                    <StudyMemoryList memories={[memory]} />
                  </div>
                ))}
              </div>
            ) : expectsNoMemory ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-5 text-sm leading-6 text-emerald-900">
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="size-4" /> 0 条记忆变化，符合预期
                </div>
                <p className="mt-1">
                  题目和超时 attempt
                  已保留为业务记录，但没有答案内容，系统没有猜测掌握、薄弱点或下一教学动作。
                </p>
              </div>
            ) : result?.gradingReliable === false ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm leading-6 text-amber-950">
                <div className="font-semibold">评分没有返回可信结果，已阻止记忆写入</div>
                <p className="mt-1">
                  attempt 已作为业务记录保留，但本场景预期的学习记忆没有生成；请恢复评分服务后重跑。
                </p>
              </div>
            ) : (
              <div className="rounded-xl bg-rose-50 px-4 py-5 text-sm text-rose-900">
                本次没有产生预期的记忆变化，测试不通过。
              </div>
            )}
          </CardContent>
        </Card>

        {lastMutation ? (
          <Card
            className={`rounded-2xl shadow-sm ${allResultChecksPass ? 'border-emerald-200 bg-emerald-50/40' : 'border-rose-200 bg-rose-50/40'}`}
          >
            <CardHeader>
              <CardTitle className="text-base">写入用户归属确认</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-white p-3">
                  <div className="text-[11px] text-slate-400">模拟人物</div>
                  <div className="mt-1 font-semibold text-slate-950">{selectedFixture.name}</div>
                  <div className="mt-1 break-all font-mono text-[10px] text-slate-500">
                    基线：{selectedFixture.userId}
                  </div>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <div className="text-[11px] text-slate-400">本次实际写入 userId</div>
                  <div className="mt-1 break-all font-mono text-xs text-slate-800">
                    {writeTargetUserId}
                  </div>
                  <Badge variant="outline" className="mt-2 text-[10px] text-amber-700">
                    一次性本地副本
                  </Badge>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <div className="text-[11px] text-slate-400">来源记录</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">
                    {result?.reusedProblem ? '复用已有 problemId' : '创建新 problemId'}
                  </div>
                  <div className="mt-1 break-all font-mono text-[10px] text-slate-500">
                    {result?.problem?.id || '—'} · {result?.attempts?.length || 0} attempts
                  </div>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div
                  className={`flex items-center gap-2 rounded-xl border bg-white px-3 py-3 text-sm ${ownershipMatches ? 'border-emerald-200 text-emerald-900' : 'border-rose-200 text-rose-900'}`}
                >
                  {ownershipMatches ? (
                    <CheckCircle2 className="size-4 shrink-0" />
                  ) : (
                    <XCircle className="size-4 shrink-0" />
                  )}
                  before / after userId {ownershipMatches ? '一致' : '不一致'}
                </div>
                <div
                  className={`flex items-center gap-2 rounded-xl border bg-white px-3 py-3 text-sm ${gradingGatePassed ? 'border-emerald-200 text-emerald-900' : 'border-rose-200 text-rose-900'}`}
                >
                  {gradingGatePassed ? (
                    <CheckCircle2 className="size-4 shrink-0" />
                  ) : (
                    <XCircle className="size-4 shrink-0" />
                  )}
                  判题安全门：{result?.gradingReliable === false ? '已拦截' : '可信'}
                </div>
                <div
                  className={`flex items-center gap-2 rounded-xl border bg-white px-3 py-3 text-sm ${resultMemoryFound ? 'border-emerald-200 text-emerald-900' : 'border-rose-200 text-rose-900'}`}
                >
                  {resultMemoryFound ? (
                    <CheckCircle2 className="size-4 shrink-0" />
                  ) : (
                    <XCircle className="size-4 shrink-0" />
                  )}
                  记忆结果符合本场景：{resultMemoryFound ? '是' : '否'}
                </div>
                <div
                  className={`flex items-center gap-2 rounded-xl border bg-white px-3 py-3 text-sm ${expectedLongTermChange ? 'border-emerald-200 text-emerald-900' : 'border-rose-200 text-rose-900'}`}
                >
                  {expectedLongTermChange ? (
                    <CheckCircle2 className="size-4 shrink-0" />
                  ) : (
                    <XCircle className="size-4 shrink-0" />
                  )}
                  长期写入策略符合场景：{expectedLongTermChange ? '是' : '否'}
                </div>
              </div>
              <p
                className={`text-xs leading-5 ${allResultChecksPass ? 'text-emerald-800' : 'text-rose-800'}`}
              >
                测试写入发生在该人物的一次性本地副本中；读取 after
                证据后副本立即销毁，人物基线不会被污染。
              </p>
            </CardContent>
          </Card>
        ) : null}
      </section>
    );
  }

  function renderWriteTest() {
    if (activeScenario.id === 'memory-problem-writeback') {
      return renderProblemWritebackTest();
    }
    const config = {
      'memory-source-upload-writeback': {
        action: 'record_source_upload',
        label: '上传 CSC148 测试资料',
        description: '在一次性副本中模拟 IndexedDB 资料与课程契约写入，取回结果后立即清理。',
        icon: FileUp,
      },
      'memory-question-writeback': {
        action: 'record_question',
        label: '创建知识点提问与诊断',
        description: '在一次性副本中模拟会话与学习诊断写入，不改变人物基线。',
        icon: MessageSquareText,
      },
    }[activeScenario.id];

    if (!config) return null;
    const ActionIcon = config.icon;
    return (
      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-5">
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">运行一次性模拟行为</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-slate-600">{config.description}</p>
              <Button
                className="mt-4 bg-slate-950 hover:bg-slate-800"
                onClick={() => mutate(config.action)}
                disabled={busy !== null}
              >
                {busy === config.action ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ActionIcon className="size-4" />
                )}
                {config.label}
              </Button>
            </CardContent>
          </Card>
          <MutationEvidence mutation={lastMutation} />
        </div>
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">本条测试相关记忆与来源</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <StudyMemoryList memories={relatedMemories} />
            {activeScenario.id === 'memory-problem-writeback' ? (
              <JsonBlock value={snapshot?.sources.problems || []} maxHeight="max-h-44" />
            ) : null}
            {activeScenario.id === 'memory-question-writeback' ? (
              <JsonBlock value={snapshot?.sources.conversations || []} maxHeight="max-h-44" />
            ) : null}
            {activeScenario.id === 'memory-source-upload-writeback' ? (
              <JsonBlock value={snapshot?.sources.materials || []} maxHeight="max-h-44" />
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  function renderStructuredFacts() {
    if (!snapshot) return null;
    return (
      <div className="space-y-5">
        <section className="grid gap-5 xl:grid-cols-2">
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">个人资料、语言、讲解与学习习惯</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-slate-600">
                一次写入姓名、专业、语言、讲解顺序与 35 分钟学习习惯，随后可逐条查看和修改。
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => mutate('seed_preferences')}
                disabled={busy !== null}
              >
                <UserRoundPlus className="size-4" /> 写入模拟用户资料与偏好
              </Button>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarDays className="size-4" /> 日历作为特殊记忆
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="calendar-start">复习开始时间</Label>
                <Input
                  id="calendar-start"
                  type="datetime-local"
                  value={calendarStartsAt}
                  onChange={(event) => setCalendarStartsAt(event.target.value)}
                />
              </div>
              <Button
                variant="outline"
                disabled={busy !== null}
                onClick={() =>
                  mutate('upsert_calendar_roundtrip', {
                    eventId: 'recursion-review',
                    startsAt: new Date(calendarStartsAt).toISOString(),
                    durationMinutes: 35,
                  })
                }
              >
                <CalendarDays className="size-4" />
                创建并修改同一日历记忆
              </Button>
              <p className="text-xs leading-5 text-slate-500">
                一次临时运行中先创建再修改同一 event key；重跑仍从人物基线开始。
              </p>
            </CardContent>
          </Card>
        </section>

        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PencilLine className="size-4" /> 单条事实新增或覆盖
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 lg:grid-cols-[180px_220px_1fr_auto] lg:items-end">
            <div className="space-y-2">
              <Label>namespace</Label>
              <Input
                value={factNamespace}
                onChange={(event) => setFactNamespace(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>key</Label>
              <Input value={factKey} onChange={(event) => setFactKey(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>JSON value</Label>
              <Input value={factValue} onChange={(event) => setFactValue(event.target.value)} />
            </div>
            <Button
              disabled={busy !== null}
              onClick={() => {
                try {
                  void mutate('upsert_fact', {
                    namespace: factNamespace,
                    key: factKey,
                    valueJson: JSON.parse(factValue),
                    contentType: factNamespace === 'profile' ? 'profile' : 'preference',
                  });
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : 'JSON 无效');
                }
              }}
            >
              写入 / 覆盖
            </Button>
          </CardContent>
        </Card>

        <section className="grid gap-5 xl:grid-cols-2">
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">当前结构化事实</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {snapshot.facts.length ? (
                snapshot.facts.map((fact) => (
                  <article key={fact.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-mono text-sm font-semibold">
                          {fact.namespace}:{fact.key}
                        </div>
                        <div className="mt-1 break-all text-xs text-slate-500">{fact.id}</div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="删除事实"
                        onClick={() =>
                          mutate('delete_memory', (prepared) => ({
                            layer: 'structured_fact',
                            memoryId:
                              prepared.facts.find(
                                (item) =>
                                  item.namespace === fact.namespace && item.key === fact.key,
                              )?.id || '',
                          }))
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <div className="mt-3">
                      <JsonBlock value={fact.valueJson} maxHeight="max-h-40" />
                    </div>
                  </article>
                ))
              ) : (
                <p className="text-sm text-slate-500">尚无结构化事实。</p>
              )}
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">事实事件账本</CardTitle>
            </CardHeader>
            <CardContent>
              <JsonBlock value={snapshot.factEvents} maxHeight="max-h-[520px]" />
            </CardContent>
          </Card>
        </section>
        <MutationEvidence mutation={lastMutation} />
      </div>
    );
  }

  function renderQueryTest() {
    return (
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers3 className="size-4" /> 分层记忆查询
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} />
            <Button onClick={runQuery} disabled={busy !== null}>
              {busy === 'query' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              运行查询
            </Button>
          </div>
          <p className="text-xs leading-5 text-slate-500">
            每次从当前人物基线准备查询证据；不会读取其他测试的结果，也不会访问服务端向量库或数据库。
          </p>
          {queryResult ? <JsonBlock value={queryResult} maxHeight="max-h-[620px]" /> : null}
        </CardContent>
      </Card>
    );
  }

  function renderDeleteTest() {
    if (!snapshot) return null;
    return (
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">本次临时副本中的可删除来源</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {snapshot.sources.problems.map((source) => (
              <div key={source.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                <div className="font-medium">题目 · {source.title}</div>
                <div className="mt-1 break-all text-xs text-slate-500">
                  {source.attemptCount} 次作答 · {source.id}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() =>
                    mutate('delete_source', (prepared) => ({
                      sourceType: 'problem',
                      sourceId:
                        prepared.sources.problems.find((item) => item.title === source.title)?.id ||
                        prepared.sources.problems[0]?.id ||
                        '',
                    }))
                  }
                >
                  <Trash2 className="size-4" /> 删除题目并清理记忆
                </Button>
              </div>
            ))}
            {snapshot.sources.conversations.map((source) => (
              <div key={source.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                <div className="font-medium">对话 · {source.title || '无标题'}</div>
                <div className="mt-1 break-all text-xs text-slate-500">
                  {source.messageCount} 条消息 · {source.id}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() =>
                    mutate('delete_source', (prepared) => ({
                      sourceType: 'conversation',
                      sourceId:
                        prepared.sources.conversations.find((item) => item.title === source.title)
                          ?.id ||
                        prepared.sources.conversations[0]?.id ||
                        '',
                    }))
                  }
                >
                  <Trash2 className="size-4" /> 删除聊天并清理记忆
                </Button>
              </div>
            ))}
            {snapshot.sources.materials.map((source) => (
              <div key={source.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                <div className="font-medium">资料 · {source.name}</div>
                <div className="mt-1 break-all text-xs text-slate-500">IndexedDB · {source.id}</div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() =>
                    mutate('delete_source', (prepared) => ({
                      sourceType: 'uploaded_material',
                      sourceId:
                        prepared.sources.materials.find((item) => item.name === source.name)?.id ||
                        prepared.sources.materials[0]?.id ||
                        '',
                    }))
                  }
                >
                  <Trash2 className="size-4" /> 删除资料并清理记忆
                </Button>
              </div>
            ))}
            {!snapshot.sources.problems.length &&
            !snapshot.sources.conversations.length &&
            !snapshot.sources.materials.length ? (
              <p className="text-sm leading-6 text-slate-500">
                临时删除测试数据尚未准备好，请点击“从人物基线重置本测试”。
              </p>
            ) : null}
          </CardContent>
        </Card>
        <div className="space-y-5">
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">删除后仍存在的记忆</CardTitle>
            </CardHeader>
            <CardContent>
              <StudyMemoryList
                memories={snapshot.studyMemories}
                onDelete={(memoryId) => {
                  const displayed = snapshot.studyMemories.find((item) => item.id === memoryId);
                  void mutate('delete_memory', (prepared) => ({
                    layer: 'study_memory',
                    memoryId:
                      prepared.studyMemories.find(
                        (item) =>
                          item.title === displayed?.title &&
                          item.kind === displayed?.kind &&
                          item.scope === displayed?.scope,
                      )?.id || '',
                  }));
                }}
              />
            </CardContent>
          </Card>
          <MutationEvidence mutation={lastMutation} />
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
            删除结果只存在于本次页面快照；临时副本已经销毁，不会影响人物基线或其他测试。
          </p>
        </div>
      </div>
    );
  }

  function renderAiTest() {
    if (!activeAiTask) return null;
    return (
      <Card className="rounded-2xl border-violet-200 bg-violet-50/40 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BrainCircuit className="size-4 text-violet-600" /> {AI_TASK_LABELS[activeAiTask]}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-col gap-3 rounded-xl border border-violet-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-6 text-slate-600">
              模型只接收下方展示的浏览器本地证据；生成接口不读取或写入数据库，只校验返回的
              evidenceId。
            </p>
            <Button onClick={() => generate(activeAiTask)} disabled={busy !== null}>
              {busy === `generate:${activeAiTask}` ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              运行本条 AI 测试
            </Button>
          </div>

          {latestAi ? (
            <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold">实际送入模型的证据</h3>
                  <Badge variant={latestAi.passedMachineCheck ? 'secondary' : 'destructive'}>
                    {latestAi.passedMachineCheck ? 'evidenceId 全部有效' : '存在未知 evidenceId'}
                  </Badge>
                </div>
                {latestAi.context.evidence.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-xl border border-violet-200 bg-white p-3 text-sm"
                  >
                    <div className="break-all font-mono text-xs text-violet-700">{item.id}</div>
                    <div className="mt-1 font-semibold">{item.title}</div>
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">
                      {item.content}
                    </p>
                  </article>
                ))}
              </div>
              <div className="space-y-3">
                <div>
                  <div className="text-xs font-medium text-violet-700">
                    {latestAi.task} · {latestAi.model}
                  </div>
                  <h3 className="mt-1 text-xl font-semibold">{latestAi.output.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{latestAi.output.summary}</p>
                </div>
                {latestAi.output.items.map((item) => (
                  <article
                    key={`${latestAi.task}-${item.title}`}
                    className="rounded-xl border border-violet-200 bg-white p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold">{item.title}</h4>
                      {item.difficulty ? <Badge variant="outline">{item.difficulty}</Badge> : null}
                      {item.minutes ? <Badge variant="outline">{item.minutes} 分钟</Badge> : null}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {item.content}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {item.evidenceIds.map((id) => (
                        <Badge key={id} variant="secondary" className="font-mono text-[10px]">
                          {id}
                        </Badge>
                      ))}
                    </div>
                  </article>
                ))}
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-slate-600">
                    查看适配说明、缺口与机器校验
                  </summary>
                  <div className="mt-2">
                    <JsonBlock
                      value={{
                        adaptations: latestAi.output.adaptations,
                        uncertainty: latestAi.output.uncertainty,
                        evidenceChecks: latestAi.evidenceChecks,
                        usage: latestAi.usage,
                      }}
                    />
                  </div>
                </details>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              尚未运行本条 AI 测试。本条会自行从人物基线准备所需证据，不依赖其他测试。
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <div className="mx-auto max-w-[1580px] px-4 py-6 sm:px-6">
        <header className="mb-5 rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-7">
          <Button asChild variant="ghost" className="-ml-3 rounded-lg text-slate-600">
            <Link href="/test#phase-two-memory-title">
              <ArrowLeft className="size-4" /> 返回第二阶段测试列表
            </Link>
          </Button>
          <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-4xl">
              <div className="flex flex-wrap gap-2">
                <Badge className="rounded-md bg-violet-600 hover:bg-violet-600">第二阶段</Badge>
                <Badge variant="outline" className="font-mono">
                  测试 {activeTestNumber} / {SECOND_PHASE_MEMORY_TEST_SCENARIOS.length}
                </Badge>
                <Badge variant="outline">{GROUP_LABELS[activeScenario.phaseTwoGroup]}</Badge>
                <Badge variant="outline">只读人物 · 一次性测试副本</Badge>
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                {activeScenario.title}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                {activeScenario.summary}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {previousScenario ? (
                <Button asChild variant="outline" className="rounded-xl">
                  <Link href={`/test/${previousScenario.id}`}>
                    <ChevronLeft className="size-4" /> 上一条
                  </Link>
                </Button>
              ) : null}
              {nextScenario ? (
                <Button asChild className="rounded-xl bg-slate-950 hover:bg-slate-800">
                  <Link href={`/test/${nextScenario.id}`}>
                    下一条 <ChevronRight className="size-4" />
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </header>

        <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-4 lg:sticky lg:top-5">
            {activeScenario.id === COHORT_SCENARIO_ID ? (
              renderCohortSelector()
            ) : activeScenario.id === 'memory-problem-writeback' ? (
              <ProblemWritebackCaseSidebar
                selectedCaseId={selectedProblemCase.id}
                disabled={busy !== null}
                onSelect={selectProblemWritebackCase}
              />
            ) : (
              <>
                <CurrentTestSidebar scenario={activeScenario} />
                {renderCohortSelector()}
                {renderUserSidebar()}
              </>
            )}
          </aside>

          <div className="min-w-0 space-y-5">
            {activeScenario.id !== COHORT_SCENARIO_ID &&
            activeScenario.id !== 'memory-problem-writeback' ? (
              <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-slate-950 hover:bg-slate-950">测试内容</Badge>
                    <Badge variant="outline">{activeScenario.steps.length} 个小测试</Badge>
                  </div>
                  <span className="text-xs text-slate-400">左侧目录仅属于当前测试</span>
                </div>
                <div className="mt-4 grid gap-3 xl:grid-cols-3">
                  <div className="rounded-xl bg-slate-50 p-4">
                    <div className="text-xs font-semibold text-slate-500">测试前置</div>
                    <ul className="mt-2 space-y-1.5 text-sm leading-5 text-slate-700">
                      {activeScenario.setup.map((item) => (
                        <li key={item}>· {item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-xl bg-sky-50 p-4">
                    <div className="text-xs font-semibold text-sky-700">本条输入</div>
                    <ul className="mt-2 space-y-1.5 text-sm leading-5 text-sky-950">
                      {activeScenario.inputs.map((item) => (
                        <li key={item}>· {item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-xl bg-emerald-50 p-4">
                    <div className="text-xs font-semibold text-emerald-700">预期输出</div>
                    <ul className="mt-2 space-y-1.5 text-sm leading-5 text-emerald-950">
                      {activeScenario.outputs.map((item) => (
                        <li key={item}>· {item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            ) : null}

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
                {error}
              </div>
            ) : null}

            {activeScenario.id !== COHORT_SCENARIO_ID &&
            activeScenario.id !== 'memory-problem-writeback' ? (
              <TestSteps steps={activeScenario.steps} />
            ) : null}

            {activeScenario.id === COHORT_SCENARIO_ID ? (
              <>
                {renderCohortComparison()}
                {renderManualCriteria()}
              </>
            ) : !snapshot ? (
              <Card className="rounded-2xl border-amber-200 bg-amber-50 shadow-sm">
                <CardContent className="flex items-start gap-3 py-5 text-sm leading-6 text-amber-900">
                  <HardDrive className="mt-1 size-4 shrink-0" />
                  <p>
                    请先在左侧创建或加载本地模拟用户。用户建立后，本条测试的本地操作区和结果证据才会显示。
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {activeScenario.id !== 'memory-problem-writeback' ? (
                  <SnapshotCounts snapshot={snapshot} />
                ) : null}

                {renderWriteTest()}
                {activeScenario.id === 'memory-structured-facts-calendar'
                  ? renderStructuredFacts()
                  : null}
                {activeScenario.id === 'memory-layered-query' ? renderQueryTest() : null}
                {activeScenario.id === 'memory-source-cascade-delete' ? renderDeleteTest() : null}
                {activeScenario.phaseTwoGroup === 'ai' ? renderAiTest() : null}

                {activeScenario.id !== 'memory-problem-writeback' ? renderManualCriteria() : null}
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
