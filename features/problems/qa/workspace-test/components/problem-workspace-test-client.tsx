'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Code2,
  FileText,
  FlaskConical,
  History,
  ListChecks,
  Play,
  Save,
  ShieldCheck,
  Sigma,
  Terminal,
  XCircle,
} from 'lucide-react';
import { AnswerComposer } from '@/components/problem-bank/answer-composer';
import { ProblemRichText, ProblemTitleText } from '@/components/problem-bank/problem-rich-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type {
  NotebookProblemAttemptAnswer,
  NotebookProblemAttemptRecord,
  NotebookProblemAttemptResult,
  NotebookProblemGrading,
  NotebookProblemPublicContent,
} from '@/lib/problem-bank';
import type { NotebookProblemClientRecord } from '@/lib/utils/notebook-problem-api';
import { cn } from '@/lib/utils';

type WorkspaceProblem = NotebookProblemClientRecord & {
  subject: string;
  focus: string;
};

type ProblemTypeFilter = 'all' | NotebookProblemPublicContent['type'];
type DifficultyFilter = 'all' | WorkspaceProblem['difficulty'];
type CodePanel = 'code' | 'testcase' | 'result';
type CodePanelMeta = {
  value: CodePanel;
  icon: typeof Code2;
  label: string;
};

const FIXED_NOW = Date.UTC(2026, 4, 17, 12, 0, 0);

const TYPE_LABELS: Record<NotebookProblemPublicContent['type'], string> = {
  short_answer: '简答题',
  choice: '选择题',
  proof: '证明题',
  calculation: '计算题',
  code: '代码题',
  fill_blank: '填空题',
};

const DIFFICULTY_LABELS: Record<WorkspaceProblem['difficulty'], string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
};

const STATUS_LABELS: Record<WorkspaceProblem['status'], string> = {
  draft: '草稿',
  published: '已发布',
  archived: '归档',
};

const CODE_PANELS: CodePanelMeta[] = [
  { value: 'code', icon: Code2, label: 'Code' },
  { value: 'testcase', icon: FlaskConical, label: 'Testcase' },
  { value: 'result', icon: Terminal, label: 'Test Result' },
];

function makeProblem(args: {
  id: string;
  title: string;
  type: NotebookProblemPublicContent['type'];
  difficulty: WorkspaceProblem['difficulty'];
  points: number;
  subject: string;
  focus: string;
  tags: string[];
  publicContent: NotebookProblemPublicContent;
  grading: NotebookProblemGrading;
  latestAttempt?: WorkspaceProblem['latestAttempt'];
}): WorkspaceProblem {
  return {
    id: args.id,
    courseId: 'problem-workspace-test',
    notebookId: 'problem-workspace-fixtures',
    notebookName: '做题空间 UI Fixtures',
    title: args.title,
    type: args.type,
    status: 'published',
    source: 'manual',
    order: WORKSPACE_PROBLEMS_ORDER.indexOf(args.id),
    points: args.points,
    tags: args.tags,
    difficulty: args.difficulty,
    publicContent: args.publicContent,
    grading: args.grading,
    sourceMeta: { fixture: true, uiTest: 'problem-workspace' },
    createdAt: FIXED_NOW - 86_400_000,
    updatedAt: FIXED_NOW,
    latestAttempt: args.latestAttempt ?? null,
    subject: args.subject,
    focus: args.focus,
  };
}

const WORKSPACE_PROBLEMS_ORDER = [
  'choice-enzyme',
  'choice-database',
  'fill-chemistry',
  'calculation-finance',
  'short-design',
  'proof-linear',
  'code-two-sum',
  'code-risk-window',
];

const WORKSPACE_PROBLEMS: WorkspaceProblem[] = [
  makeProblem({
    id: 'choice-enzyme',
    title: '酶动力学曲线的速率瓶颈',
    type: 'choice',
    difficulty: 'medium',
    points: 4,
    subject: '生物化学',
    focus: '单选题 · 富文本题干',
    tags: ['enzyme', 'concept'],
    publicContent: {
      type: 'choice',
      stem: '某酶促反应符合 Michaelis-Menten 模型。实验观察到当底物浓度 $[S]$ 远大于 $K_m$ 时，继续增加 $[S]$，初速度 $v_0$ 几乎不再上升。最合理的解释是：',
      selectionMode: 'single',
      options: [
        { id: 'A', label: '酶活性中心大多已经被底物占据，反应接近 $V_{max}$。' },
        { id: 'B', label: '底物浓度升高会永久抑制酶的构象变化。' },
        { id: 'C', label: '$K_m$ 会随着底物浓度升高而线性增大。' },
        { id: 'D', label: '产物浓度必然为 0，因此速率无法继续变化。' },
      ],
      explanation: '饱和区间里，速率主要受酶总量和催化常数限制。',
    },
    grading: {
      type: 'choice',
      correctOptionIds: ['A'],
      analysis: '当 $[S] \\gg K_m$，$v_0 \\approx V_{max}$。',
    },
    latestAttempt: {
      id: 'attempt-choice-enzyme-latest',
      status: 'passed',
      score: 4,
      createdAt: FIXED_NOW - 26 * 60_000,
    },
  }),
  makeProblem({
    id: 'choice-database',
    title: '数据库范式与异常识别',
    type: 'choice',
    difficulty: 'medium',
    points: 6,
    subject: '计算机 · 数据库',
    focus: '多选题 · 选项换行',
    tags: ['database', 'normalization'],
    publicContent: {
      type: 'choice',
      stem: '关系表 `Enrollment(student_id, student_name, course_id, course_name, instructor)` 中，已知 `student_id -> student_name` 且 `course_id -> course_name, instructor`。下列判断哪些成立？',
      selectionMode: 'multiple',
      options: [
        { id: 'A', label: '该表可能存在更新异常。' },
        { id: 'B', label: '`student_name` 对候选键存在部分依赖。' },
        { id: 'C', label: '把学生信息和课程信息拆到独立表可以降低冗余。' },
        { id: 'D', label: '只要增加一个自增 id，所有函数依赖问题都会自动消失。' },
      ],
      explanation: '多选题用于检查 checkbox、长选项与选中态。',
    },
    grading: {
      type: 'choice',
      correctOptionIds: ['A', 'B', 'C'],
      analysis: '自增 id 不能消除语义上的函数依赖和冗余。',
    },
  }),
  makeProblem({
    id: 'fill-chemistry',
    title: '酸碱缓冲溶液填空',
    type: 'fill_blank',
    difficulty: 'easy',
    points: 5,
    subject: '化学',
    focus: '填空题 · 多输入',
    tags: ['chemistry', 'buffer'],
    publicContent: {
      type: 'fill_blank',
      stemTemplate:
        '在 Henderson-Hasselbalch 方程中，$pH = pK_a + \\log\\frac{[A^-]}{[HA]}$。当 $[A^-] = [HA]$ 时，$pH = $ ____；若酸和共轭碱同时大量存在，该体系称为 ____ 溶液。',
      blanks: [
        { id: 'blank-1', placeholder: '第 1 空' },
        { id: 'blank-2', placeholder: '第 2 空' },
      ],
      explanation: '填空题用于看输入框组、题干中的空位和数学公式显示。',
    },
    grading: {
      type: 'fill_blank',
      blanks: [
        { id: 'blank-1', acceptedAnswers: ['pKa', 'pK_a', 'pKa值'], caseSensitive: false },
        { id: 'blank-2', acceptedAnswers: ['缓冲', 'buffer'], caseSensitive: false },
      ],
      analysis: '比值为 1 时 log 项为 0。',
    },
  }),
  makeProblem({
    id: 'calculation-finance',
    title: '债券现值与久期的快速估算',
    type: 'calculation',
    difficulty: 'hard',
    points: 12,
    subject: '金融工程',
    focus: '计算题 · 单位与公式',
    tags: ['finance', 'duration'],
    publicContent: {
      type: 'calculation',
      stem: '某零息债券 2 年后支付 1210 元，市场年化贴现率为 10%，按年复利计息。\n\n1. 计算当前价格 $P$。\n2. 简述该零息债券的 Macaulay Duration。',
      unit: '元；年',
      explanation: '计算题使用富文本答题器，可输入公式、表格和文字说明。',
    },
    grading: {
      type: 'calculation',
      referenceAnswer: 'P = 1210 / (1.1)^2 = 1000 元；Macaulay Duration = 2 年。',
      acceptedForms: ['1000', '2 年'],
      tolerance: 0.01,
      unit: '元；年',
      analysis: '零息债券全部现金流发生在到期日。',
    },
  }),
  makeProblem({
    id: 'short-design',
    title: '教育产品中的即时反馈设计',
    type: 'short_answer',
    difficulty: 'medium',
    points: 8,
    subject: '教育心理学',
    focus: '简答题 · 富文本作答',
    tags: ['learning', 'feedback'],
    publicContent: {
      type: 'short_answer',
      stem: '面向刚学完二次函数的高中生，设计一条“答错后即时反馈”。要求说明：\n- 反馈应该先指出哪个概念出错；\n- 如何避免直接给出完整答案；\n- 下一步让学生做什么。',
      explanation: '简答题用于检查富文本编辑器、公式工具栏和提交按钮位置。',
    },
    grading: {
      type: 'short_answer',
      referenceAnswer:
        '应定位误区、给一个可操作提示，并安排下一步小任务，例如回到顶点式或画图验证。',
      rubric: '概念定位 3 分；提示设计 3 分；下一步任务 2 分。',
      analysis: '即时反馈应该降低认知负荷，而不是替代学生思考。',
    },
  }),
  makeProblem({
    id: 'proof-linear',
    title: '线性代数子空间证明',
    type: 'proof',
    difficulty: 'hard',
    points: 15,
    subject: '数学 · 线性代数',
    focus: '证明题 · 长题干',
    tags: ['linear algebra', 'proof'],
    publicContent: {
      type: 'proof',
      stem: '设 $V$ 是域 $F$ 上的向量空间，$U,W$ 是 $V$ 的子空间。证明：\n\n$$U \\cap W = \\{v \\in V: v \\in U \\text{ 且 } v \\in W\\}$$\n\n也是 $V$ 的子空间。请明确写出零向量、加法封闭和数乘封闭三个步骤。',
      explanation: '证明题用于看长文本、display math 和答题器高度。',
    },
    grading: {
      type: 'proof',
      referenceProof:
        '零向量属于 U 和 W，因此属于交集。若 x,y 属于交集，则 x,y 同时属于 U,W，由子空间封闭性得 x+y 同时属于 U,W。数乘同理。',
      rubric: '零向量 3 分；加法封闭 6 分；数乘封闭 6 分。',
      analysis: '交集保留两个子空间共有的封闭性。',
    },
  }),
  makeProblem({
    id: 'code-two-sum',
    title: 'Two Sum 函数实现',
    type: 'code',
    difficulty: 'medium',
    points: 20,
    subject: '计算机 · 算法',
    focus: '代码题 · LeetCode 式布局',
    tags: ['python', 'hashmap'],
    publicContent: {
      type: 'code',
      stem: '给定整数数组 `nums` 和目标值 `target`，请返回两个不同下标，使得对应数字之和等于 `target`。\n\n约束：\n- 每组输入恰好存在一个解。\n- 同一个元素不能使用两次。\n- 返回下标顺序不限。',
      language: 'python',
      functionSignature: 'def two_sum(nums: list[int], target: int) -> list[int]:',
      starterCode:
        'def two_sum(nums: list[int], target: int) -> list[int]:\n    \"\"\"Return indices of two numbers that add up to target.\"\"\"\n    # TODO: implement\n    return []\n',
      constraints: ['2 <= len(nums) <= 10^4', '-10^9 <= nums[i], target <= 10^9'],
      publicTests: [
        {
          id: 'public-1',
          description: '基础样例',
          expression: 'two_sum([2, 7, 11, 15], 9)',
          expected: '[0, 1]',
        },
        {
          id: 'public-2',
          description: '答案不在开头',
          expression: 'two_sum([3, 2, 4], 6)',
          expected: '[1, 2]',
        },
      ],
      sampleIO: [
        {
          input: 'nums = [2,7,11,15], target = 9',
          output: '[0, 1]',
          explanation: 'nums[0] + nums[1] = 9',
        },
      ],
      secretConfigPresent: true,
      explanation: '代码题用于检查题面、代码编辑器、public tests、hidden tests 和结果面板。',
    },
    grading: {
      type: 'code',
      analysis: '哈希表记录已访问数字及其下标。',
      publishRequirementsMet: true,
    },
  }),
  makeProblem({
    id: 'code-risk-window',
    title: '连续亏损窗口检测',
    type: 'code',
    difficulty: 'hard',
    points: 25,
    subject: '金融工程 · 风控',
    focus: '代码题 · 业务函数',
    tags: ['python', 'risk'],
    publicContent: {
      type: 'code',
      stem: '给定每日收益率列表 `returns` 和阈值 `limit`，实现 `longest_loss_streak`，返回连续收益率小于 `limit` 的最长天数。\n\n例如，`returns = [0.01, -0.03, -0.04, 0.02, -0.06]` 且 `limit = -0.02` 时，最长连续亏损窗口为 2。',
      language: 'python',
      functionSignature: 'def longest_loss_streak(returns: list[float], limit: float) -> int:',
      starterCode:
        'def longest_loss_streak(returns: list[float], limit: float) -> int:\n    \"\"\"Return the longest consecutive streak where return < limit.\"\"\"\n    best = 0\n    current = 0\n    # TODO: update best and current\n    return best\n',
      constraints: ['0 <= len(returns) <= 3650', '-1.0 <= returns[i] <= 1.0'],
      publicTests: [
        {
          id: 'public-1',
          description: '普通序列',
          expression: 'longest_loss_streak([0.01, -0.03, -0.04, 0.02, -0.06], -0.02)',
          expected: '2',
        },
        {
          id: 'public-2',
          description: '没有触发阈值',
          expression: 'longest_loss_streak([0.01, 0.0, -0.01], -0.02)',
          expected: '0',
        },
      ],
      sampleIO: [],
      secretConfigPresent: true,
      explanation: '业务代码题用于看长函数名、浮点输入和风控语义。',
    },
    grading: {
      type: 'code',
      analysis: '一次扫描维护 current 和 best。',
      publishRequirementsMet: true,
    },
    latestAttempt: {
      id: 'attempt-risk-latest',
      status: 'partial',
      score: 15,
      createdAt: FIXED_NOW - 11 * 60_000,
    },
  }),
].sort((a, b) => a.order - b.order);

const INITIAL_ATTEMPTS: Record<string, NotebookProblemAttemptRecord[]> = {
  'choice-enzyme': [
    {
      id: 'attempt-choice-enzyme-latest',
      problemId: 'choice-enzyme',
      userId: 'ui-test-user',
      kind: 'answer',
      status: 'passed',
      score: 4,
      answer: { selectedOptionIds: ['A'] },
      result: {
        correct: true,
        earnedPoints: 4,
        feedback: '选择正确。饱和区间里继续增加底物不会显著提高速率。',
        publicCases: [],
      },
      createdAt: FIXED_NOW - 26 * 60_000,
      updatedAt: FIXED_NOW - 26 * 60_000,
    },
  ],
  'code-risk-window': [
    {
      id: 'attempt-risk-latest',
      problemId: 'code-risk-window',
      userId: 'ui-test-user',
      kind: 'run',
      status: 'partial',
      score: 15,
      answer: {
        code: 'def longest_loss_streak(returns: list[float], limit: float) -> int:\n    best = 0\n    current = 0\n    for value in returns:\n        if value < limit:\n            current += 1\n        else:\n            current = 0\n        best = max(best, current)\n    return best\n',
      },
      result: {
        correct: false,
        earnedPoints: 15,
        feedback: 'Public tests 通过，hidden 边界还需要检查空列表和阈值等号。',
        publicCases: [
          {
            id: 'public-1',
            description: '普通序列',
            passed: true,
            actual: '2',
          },
          {
            id: 'public-2',
            description: '没有触发阈值',
            passed: true,
            actual: '0',
          },
        ],
        secretSummary: {
          total: 3,
          passed: 1,
          failed: 2,
          failureSummary: '等于 limit 的收益率不应计入亏损窗口。',
        },
      },
      createdAt: FIXED_NOW - 11 * 60_000,
      updatedAt: FIXED_NOW - 11 * 60_000,
    },
  ],
};

function initialTextAnswers() {
  return Object.fromEntries(
    WORKSPACE_PROBLEMS.filter((problem) =>
      ['short_answer', 'proof', 'calculation'].includes(problem.type),
    ).map((problem) => [problem.id, '']),
  );
}

function initialCodeAnswers() {
  return Object.fromEntries(
    WORKSPACE_PROBLEMS.filter((problem) => problem.publicContent.type === 'code').map((problem) => [
      problem.id,
      problem.publicContent.type === 'code' ? problem.publicContent.starterCode || '' : '',
    ]),
  );
}

function latestAttemptFor(
  attemptsByProblem: Record<string, NotebookProblemAttemptRecord[]>,
  problem: WorkspaceProblem,
) {
  return attemptsByProblem[problem.id]?.[0] ?? problem.latestAttempt ?? null;
}

function statusTone(status?: string | null) {
  if (status === 'passed')
    return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-200';
  if (status === 'partial')
    return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-200';
  if (status === 'failed' || status === 'error')
    return 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/25 dark:text-rose-200';
  return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';
}

function attemptStatusLabel(status: NotebookProblemAttemptRecord['status']) {
  const labels: Record<NotebookProblemAttemptRecord['status'], string> = {
    pending: '进行中',
    passed: '通过',
    failed: '失败',
    partial: '部分通过',
    error: '错误',
  };
  return labels[status];
}

function formatTime(value: number) {
  return new Date(value).toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function compareChoice(problem: WorkspaceProblem, selected: string[]) {
  if (problem.grading.type !== 'choice') return false;
  const correct = [...problem.grading.correctOptionIds].sort().join('|');
  return [...selected].sort().join('|') === correct;
}

function compareFillBlank(problem: WorkspaceProblem, blanks: Record<string, string>) {
  if (problem.grading.type !== 'fill_blank') return { total: 0, passed: 0 };
  const total = problem.grading.blanks.length;
  const passed = problem.grading.blanks.filter((blank) => {
    const value = (blanks[blank.id] || '').trim();
    return blank.acceptedAnswers.some((answer) =>
      blank.caseSensitive ? answer === value : answer.toLowerCase() === value.toLowerCase(),
    );
  }).length;
  return { total, passed };
}

function textLooksSubstantial(value: string) {
  const stripped = value.replace(/<[^>]+>/g, '').trim();
  return stripped.length >= 24;
}

function codeLooksImplemented(value: string) {
  return /\breturn\b/.test(value) && !/TODO: implement\s*\n\s*return\s+\[\]/.test(value);
}

function buildAttempt(args: {
  problem: WorkspaceProblem;
  kind: NotebookProblemAttemptRecord['kind'];
  answer: NotebookProblemAttemptAnswer;
  status: NotebookProblemAttemptRecord['status'];
  score: number;
  result: NotebookProblemAttemptResult;
}): NotebookProblemAttemptRecord {
  const createdAt = Date.now();
  return {
    id: `attempt-${args.problem.id}-${createdAt}`,
    problemId: args.problem.id,
    userId: 'ui-test-user',
    kind: args.kind,
    status: args.status,
    score: args.score,
    answer: args.answer,
    result: args.result,
    createdAt,
    updatedAt: createdAt,
  };
}

export default function ProblemWorkspaceTestClient() {
  const [selectedProblemId, setSelectedProblemId] = useState(WORKSPACE_PROBLEMS[0]?.id || '');
  const [typeFilter, setTypeFilter] = useState<ProblemTypeFilter>('all');
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>('all');
  const [choiceAnswer, setChoiceAnswer] = useState<Record<string, string[]>>({
    'choice-enzyme': ['A'],
  });
  const [blankAnswer, setBlankAnswer] = useState<Record<string, Record<string, string>>>({});
  const [textAnswer, setTextAnswer] =
    useState<Record<string, string[] | string>>(initialTextAnswers);
  const [codeAnswer, setCodeAnswer] = useState<Record<string, string>>(initialCodeAnswers);
  const [attemptsByProblem, setAttemptsByProblem] =
    useState<Record<string, NotebookProblemAttemptRecord[]>>(INITIAL_ATTEMPTS);
  const [codePanel, setCodePanel] = useState<CodePanel>('code');

  const filteredProblems = useMemo(
    () =>
      WORKSPACE_PROBLEMS.filter((problem) => {
        if (typeFilter !== 'all' && problem.type !== typeFilter) return false;
        if (difficultyFilter !== 'all' && problem.difficulty !== difficultyFilter) return false;
        return true;
      }),
    [difficultyFilter, typeFilter],
  );

  const selectedProblem =
    filteredProblems.find((problem) => problem.id === selectedProblemId) ||
    WORKSPACE_PROBLEMS.find((problem) => problem.id === selectedProblemId) ||
    filteredProblems[0] ||
    WORKSPACE_PROBLEMS[0];

  const selectedAttempts = selectedProblem ? attemptsByProblem[selectedProblem.id] || [] : [];
  const latestAttempt = selectedProblem
    ? latestAttemptFor(attemptsByProblem, selectedProblem)
    : null;

  const typeCounts = useMemo(
    () =>
      WORKSPACE_PROBLEMS.reduce<Record<string, number>>((acc, problem) => {
        acc[problem.type] = (acc[problem.type] || 0) + 1;
        return acc;
      }, {}),
    [],
  );

  function addAttempt(attempt: NotebookProblemAttemptRecord) {
    setAttemptsByProblem((current) => ({
      ...current,
      [attempt.problemId]: [attempt, ...(current[attempt.problemId] || [])],
    }));
  }

  function handleSubmit(problem: WorkspaceProblem) {
    if (problem.publicContent.type === 'choice') {
      const selected = choiceAnswer[problem.id] || [];
      const passed = compareChoice(problem, selected);
      addAttempt(
        buildAttempt({
          problem,
          kind: 'answer',
          answer: { selectedOptionIds: selected },
          status: passed ? 'passed' : selected.length ? 'failed' : 'partial',
          score: passed ? problem.points : 0,
          result: {
            correct: passed,
            earnedPoints: passed ? problem.points : 0,
            feedback: passed ? '选项正确。' : '当前选择还不完整，可以继续调整。',
            publicCases: [],
          },
        }),
      );
      return;
    }

    if (problem.publicContent.type === 'fill_blank') {
      const blanks = blankAnswer[problem.id] || {};
      const { total, passed } = compareFillBlank(problem, blanks);
      const score = total ? Math.round((problem.points * passed) / total) : 0;
      addAttempt(
        buildAttempt({
          problem,
          kind: 'answer',
          answer: { blanks },
          status: passed === total ? 'passed' : passed > 0 ? 'partial' : 'failed',
          score,
          result: {
            correct: passed === total,
            earnedPoints: score,
            feedback: `填空命中 ${passed}/${total}。`,
            publicCases: [],
          },
        }),
      );
      return;
    }

    if (problem.publicContent.type === 'code') {
      const code = codeAnswer[problem.id] || '';
      const implemented = codeLooksImplemented(code);
      addAttempt(
        buildCodeAttempt({
          problem,
          code,
          kind: 'submit',
          includeSecret: true,
          implemented,
        }),
      );
      setCodePanel('result');
      return;
    }

    const value = String(textAnswer[problem.id] || '');
    const substantial = textLooksSubstantial(value);
    addAttempt(
      buildAttempt({
        problem,
        kind: 'answer',
        answer: { text: value },
        status: substantial ? 'partial' : 'failed',
        score: substantial ? Math.max(1, Math.round(problem.points * 0.65)) : 0,
        result: {
          correct: null,
          earnedPoints: substantial ? Math.max(1, Math.round(problem.points * 0.65)) : 0,
          feedback: substantial
            ? 'UI 测试模拟反馈：答案长度和结构看起来可以继续评分。'
            : 'UI 测试模拟反馈：答案内容较少。',
          publicCases: [],
        },
      }),
    );
  }

  function handleRunCode(problem: WorkspaceProblem) {
    if (problem.publicContent.type !== 'code') return;
    const code = codeAnswer[problem.id] || '';
    addAttempt(
      buildCodeAttempt({
        problem,
        code,
        kind: 'run',
        includeSecret: false,
        implemented: codeLooksImplemented(code),
      }),
    );
    setCodePanel('result');
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-[1800px] flex-col">
        <header className="border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <Link
                href="/test?surface=problems"
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              >
                <ArrowLeft className="size-4" />
                返回测试中心
              </Link>
              <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
                <BookOpen className="size-4 text-sky-500" />
                Problem Workspace UI
              </div>
              <h1 className="mt-1 text-2xl font-semibold tracking-normal">做题空间 UI 测试</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="rounded-md">
                {WORKSPACE_PROBLEMS.length} 道结构化题目
              </Badge>
              <Badge variant="outline" className="rounded-md">
                {typeCounts.code || 0} 道代码题
              </Badge>
              <Badge variant="outline" className="rounded-md">
                本地模拟作答
              </Badge>
            </div>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[360px_1fr]">
          <aside className="flex min-h-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
            <div className="border-b border-slate-200 p-4 dark:border-slate-800">
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value as ProblemTypeFilter)}
                  className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="all">全部题型</option>
                  {Object.entries(TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <select
                  value={difficultyFilter}
                  onChange={(event) => setDifficultyFilter(event.target.value as DifficultyFilter)}
                  className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="all">全部难度</option>
                  {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="space-y-2">
                {filteredProblems.map((problem) => {
                  const attempt = latestAttemptFor(attemptsByProblem, problem);
                  const active = problem.id === selectedProblem?.id;
                  return (
                    <button
                      key={problem.id}
                      type="button"
                      onClick={() => {
                        setSelectedProblemId(problem.id);
                        setCodePanel(problem.type === 'code' ? 'code' : 'result');
                      }}
                      className={cn(
                        'block w-full rounded-lg border p-3 text-left transition',
                        active
                          ? 'border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/30'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700',
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <ProblemTitleText
                            content={problem.title}
                            className="block truncate text-sm font-semibold"
                          />
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {TYPE_LABELS[problem.type]} · {DIFFICULTY_LABELS[problem.difficulty]} ·{' '}
                            {problem.subject}
                          </div>
                        </div>
                        <ChevronRight className="mt-0.5 size-4 shrink-0 text-slate-400" />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <Badge variant="secondary" className="rounded-md">
                          {problem.points} 分
                        </Badge>
                        <Badge variant="outline" className="rounded-md">
                          {problem.focus}
                        </Badge>
                        {attempt?.status ? (
                          <Badge className={cn('rounded-md border', statusTone(attempt.status))}>
                            {attemptStatusLabel(attempt.status)}
                          </Badge>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          {selectedProblem ? (
            selectedProblem.publicContent.type === 'code' ? (
              <CodeWorkspace
                problem={selectedProblem}
                code={codeAnswer[selectedProblem.id] || ''}
                onCodeChange={(nextCode) =>
                  setCodeAnswer((current) => ({ ...current, [selectedProblem.id]: nextCode }))
                }
                attempts={selectedAttempts}
                latestAttempt={latestAttempt}
                panel={codePanel}
                onPanelChange={setCodePanel}
                onRun={() => handleRunCode(selectedProblem)}
                onSubmit={() => handleSubmit(selectedProblem)}
              />
            ) : (
              <ProblemWorkspace
                problem={selectedProblem}
                latestAttempt={latestAttempt}
                attempts={selectedAttempts}
                choiceAnswer={choiceAnswer[selectedProblem.id] || []}
                onChoiceAnswerChange={(nextValue) =>
                  setChoiceAnswer((current) => ({ ...current, [selectedProblem.id]: nextValue }))
                }
                blankAnswer={blankAnswer[selectedProblem.id] || {}}
                onBlankAnswerChange={(nextValue) =>
                  setBlankAnswer((current) => ({ ...current, [selectedProblem.id]: nextValue }))
                }
                textAnswer={String(textAnswer[selectedProblem.id] || '')}
                onTextAnswerChange={(nextValue) =>
                  setTextAnswer((current) => ({ ...current, [selectedProblem.id]: nextValue }))
                }
                onSubmit={() => handleSubmit(selectedProblem)}
              />
            )
          ) : (
            <div className="flex items-center justify-center text-sm text-slate-500">
              当前筛选下没有题目。
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function ProblemWorkspace(props: {
  problem: WorkspaceProblem;
  latestAttempt: NotebookProblemAttemptRecord | WorkspaceProblem['latestAttempt'] | null;
  attempts: NotebookProblemAttemptRecord[];
  choiceAnswer: string[];
  onChoiceAnswerChange: (value: string[]) => void;
  blankAnswer: Record<string, string>;
  onBlankAnswerChange: (value: Record<string, string>) => void;
  textAnswer: string;
  onTextAnswerChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <section className="min-w-0 overflow-y-auto p-5">
      <div className="mx-auto grid max-w-7xl gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <ProblemHeader problem={props.problem} latestAttempt={props.latestAttempt} />
            <div className="mt-5">
              <ProblemRichText
                content={problemStem(props.problem)}
                className="text-base leading-8 text-slate-700 dark:text-slate-200"
              />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold tracking-normal">作答区</h2>
                <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {props.problem.focus}
                </div>
              </div>
              <Button type="button" onClick={props.onSubmit}>
                <Save className="size-4" />
                提交答案
              </Button>
            </div>

            <AnswerSurface
              problem={props.problem}
              choiceAnswer={props.choiceAnswer}
              onChoiceAnswerChange={props.onChoiceAnswerChange}
              blankAnswer={props.blankAnswer}
              onBlankAnswerChange={props.onBlankAnswerChange}
              textAnswer={props.textAnswer}
              onTextAnswerChange={props.onTextAnswerChange}
            />
          </div>
        </div>

        <aside className="space-y-4">
          <ReferencePanel problem={props.problem} />
          <AttemptsPanel attempts={props.attempts} fallbackAttempt={props.latestAttempt} />
        </aside>
      </div>
    </section>
  );
}

function ProblemHeader({
  problem,
  latestAttempt,
}: {
  problem: WorkspaceProblem;
  latestAttempt: NotebookProblemAttemptRecord | WorkspaceProblem['latestAttempt'] | null;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="rounded-md">
            {TYPE_LABELS[problem.type]}
          </Badge>
          <Badge variant="secondary" className="rounded-md">
            {DIFFICULTY_LABELS[problem.difficulty]}
          </Badge>
          <Badge variant="outline" className="rounded-md">
            {problem.points} 分
          </Badge>
          <Badge variant="outline" className="rounded-md">
            {problem.subject}
          </Badge>
          <Badge variant="outline" className="rounded-md">
            {STATUS_LABELS[problem.status]}
          </Badge>
          {latestAttempt?.status ? (
            <Badge className={cn('rounded-md border', statusTone(latestAttempt.status))}>
              最近 {attemptStatusLabel(latestAttempt.status)}
            </Badge>
          ) : null}
        </div>
        <h2 className="mt-3 text-2xl font-semibold tracking-normal">
          <ProblemTitleText content={problem.title} />
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-slate-500">来源</div>
          <div className="mt-0.5 font-semibold">UI fixture</div>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-slate-500">标签</div>
          <div className="mt-0.5 font-semibold">{problem.tags.slice(0, 2).join(' / ')}</div>
        </div>
      </div>
    </div>
  );
}

function AnswerSurface(props: {
  problem: WorkspaceProblem;
  choiceAnswer: string[];
  onChoiceAnswerChange: (value: string[]) => void;
  blankAnswer: Record<string, string>;
  onBlankAnswerChange: (value: Record<string, string>) => void;
  textAnswer: string;
  onTextAnswerChange: (value: string) => void;
}) {
  const content = props.problem.publicContent;
  if (content.type === 'choice') {
    const multi = content.selectionMode === 'multiple';
    return (
      <div className="grid gap-3">
        {content.options.map((option) => {
          const selected = props.choiceAnswer.includes(option.id);
          return (
            <label
              key={option.id}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border p-4 text-sm transition',
                selected
                  ? 'border-sky-300 bg-sky-50 dark:border-sky-700 dark:bg-sky-950/30'
                  : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950',
              )}
            >
              <input
                type={multi ? 'checkbox' : 'radio'}
                className="mt-1"
                checked={selected}
                onChange={(event) => {
                  if (multi) {
                    props.onChoiceAnswerChange(
                      event.target.checked
                        ? Array.from(new Set([...props.choiceAnswer, option.id]))
                        : props.choiceAnswer.filter((id) => id !== option.id),
                    );
                  } else {
                    props.onChoiceAnswerChange([option.id]);
                  }
                }}
              />
              <div className="min-w-0">
                <span className="font-semibold">{option.id}.</span>{' '}
                <ProblemRichText
                  content={option.label}
                  className="inline-block align-middle [&_.katex-display]:inline-block [&_p]:inline"
                />
              </div>
            </label>
          );
        })}
      </div>
    );
  }

  if (content.type === 'fill_blank') {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {content.blanks.map((blank) => (
          <label key={blank.id} className="grid gap-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {blank.placeholder || blank.id}
            </span>
            <Input
              value={props.blankAnswer[blank.id] || ''}
              onChange={(event) =>
                props.onBlankAnswerChange({
                  ...props.blankAnswer,
                  [blank.id]: event.target.value,
                })
              }
              placeholder="输入答案"
            />
          </label>
        ))}
      </div>
    );
  }

  return (
    <AnswerComposer
      value={props.textAnswer}
      onChange={props.onTextAnswerChange}
      locale="zh-CN"
      textareaClassName="min-h-[260px]"
      placeholder="在这里输入你的答案..."
    />
  );
}

function CodeWorkspace(props: {
  problem: WorkspaceProblem;
  code: string;
  onCodeChange: (value: string) => void;
  attempts: NotebookProblemAttemptRecord[];
  latestAttempt: NotebookProblemAttemptRecord | WorkspaceProblem['latestAttempt'] | null;
  panel: CodePanel;
  onPanelChange: (panel: CodePanel) => void;
  onRun: () => void;
  onSubmit: () => void;
}) {
  const content = props.problem.publicContent.type === 'code' ? props.problem.publicContent : null;
  if (!content) return null;
  const lineNumbers = Array.from(
    { length: Math.max(12, props.code.split('\n').length) },
    (_, index) => index + 1,
  ).join('\n');

  return (
    <section className="grid min-h-0 bg-white dark:bg-slate-950 xl:grid-cols-[minmax(420px,0.95fr)_minmax(520px,1fr)]">
      <div className="min-h-0 overflow-y-auto border-b border-slate-200 dark:border-slate-800 xl:border-r xl:border-b-0">
        <div className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-slate-200 bg-white px-5 text-sm font-semibold dark:border-slate-800 dark:bg-slate-950">
          <FileText className="size-4 text-blue-500" />
          Description
        </div>
        <div className="px-7 py-6">
          <ProblemHeader problem={props.problem} latestAttempt={props.latestAttempt} />
          <div className="mt-6">
            <ProblemRichText content={content.stem} className="text-base leading-8" />
          </div>

          {content.sampleIO.length ? (
            <div className="mt-8 space-y-3">
              <h3 className="text-base font-semibold tracking-normal">Examples</h3>
              {content.sampleIO.map((sample, index) => (
                <div
                  key={`${sample.input}-${index}`}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  <div>
                    <span className="font-semibold">Input:</span> {sample.input}
                  </div>
                  <div className="mt-1">
                    <span className="font-semibold">Output:</span> {sample.output}
                  </div>
                  {sample.explanation ? (
                    <div className="mt-1 whitespace-pre-wrap text-slate-500">
                      <span className="font-semibold">Explanation:</span> {sample.explanation}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {content.constraints.length ? (
            <div className="mt-8">
              <h3 className="text-base font-semibold tracking-normal">Constraints</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {content.constraints.map((constraint) => (
                  <li key={constraint}>{constraint}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-col bg-white dark:bg-slate-950">
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-1">
            {CODE_PANELS.map((panel) => {
              const IconComponent = panel.icon;
              const active = props.panel === panel.value;
              return (
                <button
                  key={panel.value}
                  type="button"
                  onClick={() => props.onPanelChange(panel.value)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition',
                    active
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100',
                  )}
                >
                  <IconComponent className="size-4" />
                  {panel.label}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={props.onRun}>
              <Play className="size-4" />
              Run
            </Button>
            <Button type="button" onClick={props.onSubmit}>
              <ShieldCheck className="size-4" />
              Submit
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {props.panel === 'code' ? (
            <div className="grid min-h-[640px] grid-cols-[58px_1fr] font-mono text-sm leading-6">
              <pre className="select-none border-r border-slate-200 bg-slate-50 px-4 py-4 text-right text-slate-400 dark:border-slate-800 dark:bg-slate-900">
                {lineNumbers}
              </pre>
              <Textarea
                value={props.code}
                onChange={(event) => props.onCodeChange(event.target.value)}
                spellCheck={false}
                className="min-h-[640px] resize-none rounded-none border-0 bg-white px-4 py-4 font-mono text-sm leading-6 shadow-none focus-visible:ring-0 dark:bg-slate-950"
              />
            </div>
          ) : null}

          {props.panel === 'testcase' ? (
            <div className="grid gap-4 p-5">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-3 flex items-center gap-2 font-semibold">
                  <ListChecks className="size-4 text-emerald-600" />
                  Public Tests
                </div>
                <div className="grid gap-3">
                  {content.publicTests.map((testCase, index) => (
                    <div
                      key={testCase.id}
                      className="rounded-md border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-950"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="rounded-md">
                          Case {index + 1}
                        </Badge>
                        <span className="font-semibold">{testCase.description}</span>
                      </div>
                      <div className="mt-2 rounded-md bg-slate-50 p-2 font-mono text-xs dark:bg-slate-900">
                        {testCase.expression} =&gt; {testCase.expected}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-2 font-semibold">
                  <ShieldCheck className="size-4 text-slate-500" />
                  Hidden Tests
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  {content.secretConfigPresent
                    ? '提交时会展示隐藏测试汇总，不暴露表达式。'
                    : '当前题目没有隐藏测试配置。'}
                </p>
              </div>
            </div>
          ) : null}

          {props.panel === 'result' ? (
            <div className="p-5">
              <AttemptsPanel attempts={props.attempts} fallbackAttempt={props.latestAttempt} />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ReferencePanel({ problem }: { problem: WorkspaceProblem }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Sigma className="size-4 text-slate-500" />
        题目结构
      </div>
      <div className="grid gap-2 text-sm">
        <MetaRow label="题型" value={TYPE_LABELS[problem.type]} />
        <MetaRow label="专业" value={problem.subject} />
        <MetaRow label="分值" value={`${problem.points} 分`} />
        <MetaRow label="难度" value={DIFFICULTY_LABELS[problem.difficulty]} />
      </div>
      {problem.publicContent.explanation ? (
        <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm leading-6 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
          {problem.publicContent.explanation}
        </div>
      ) : null}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-900">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function AttemptsPanel({
  attempts,
  fallbackAttempt,
}: {
  attempts: NotebookProblemAttemptRecord[];
  fallbackAttempt: NotebookProblemAttemptRecord | WorkspaceProblem['latestAttempt'] | null;
}) {
  const rows =
    attempts.length > 0
      ? attempts
      : fallbackAttempt
        ? [
            {
              id: fallbackAttempt.id,
              problemId: 'fallback',
              userId: 'ui-test-user',
              kind: 'answer' as const,
              status: fallbackAttempt.status,
              score: fallbackAttempt.score,
              answer: {},
              result: {
                earnedPoints: fallbackAttempt.score ?? undefined,
                feedback: '列表中的最近结果摘要。',
                publicCases: [],
              },
              createdAt: fallbackAttempt.createdAt,
              updatedAt: fallbackAttempt.createdAt,
            },
          ]
        : [];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <History className="size-4 text-slate-500" />
        作答记录
      </div>
      {rows.length ? (
        <div className="space-y-3">
          {rows.map((attempt) => (
            <div
              key={attempt.id}
              className={cn('rounded-lg border p-3 text-sm leading-6', statusTone(attempt.status))}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold">
                  {attempt.kind === 'run'
                    ? 'Public Run'
                    : attempt.kind === 'submit'
                      ? 'Submit'
                      : 'Answer'}
                </div>
                <Badge className={cn('rounded-md border', statusTone(attempt.status))}>
                  {attemptStatusLabel(attempt.status)}
                </Badge>
              </div>
              <div className="mt-1 text-xs opacity-75">{formatTime(attempt.createdAt)}</div>
              {typeof attempt.score === 'number' ? (
                <div className="mt-2 text-sm font-semibold">得分 {attempt.score}</div>
              ) : null}
              {attempt.result?.feedback ? (
                <p className="mt-2 whitespace-pre-wrap">{attempt.result.feedback}</p>
              ) : null}
              {attempt.result?.publicCases?.length ? (
                <div className="mt-3 grid gap-2">
                  {attempt.result.publicCases.map((testCase) => (
                    <div
                      key={testCase.id}
                      className="rounded-md border border-white/60 bg-white/70 px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-200"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{testCase.description || testCase.id}</span>
                        {testCase.passed ? (
                          <CheckCircle2 className="size-4 text-emerald-600" />
                        ) : (
                          <XCircle className="size-4 text-rose-600" />
                        )}
                      </div>
                      {testCase.actual ? (
                        <div className="mt-1">Actual: {testCase.actual}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {attempt.result?.secretSummary ? (
                <div className="mt-3 rounded-md border border-white/60 bg-white/70 px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-200">
                  Hidden: {attempt.result.secretSummary.passed}/{attempt.result.secretSummary.total}{' '}
                  passed
                  {attempt.result.secretSummary.failureSummary ? (
                    <div className="mt-1">{attempt.result.secretSummary.failureSummary}</div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          暂无作答记录。
        </div>
      )}
    </div>
  );
}

function buildCodeAttempt(args: {
  problem: WorkspaceProblem;
  code: string;
  kind: 'run' | 'submit';
  includeSecret: boolean;
  implemented: boolean;
}) {
  const content = args.problem.publicContent.type === 'code' ? args.problem.publicContent : null;
  const publicCases =
    content?.publicTests.map((testCase, index) => ({
      id: testCase.id,
      description: testCase.description,
      passed: args.implemented || index === 0,
      actual: args.implemented ? testCase.expected : index === 0 ? testCase.expected : '[]',
      error: args.implemented || index === 0 ? undefined : 'Wrong answer',
    })) || [];
  const publicPassed = publicCases.filter((testCase) => testCase.passed).length;
  const allPublicPassed = publicCases.length > 0 && publicPassed === publicCases.length;
  const status = allPublicPassed ? 'passed' : publicPassed > 0 ? 'partial' : 'failed';
  const score = Math.round(
    args.problem.points *
      (args.includeSecret ? (allPublicPassed ? 0.82 : 0.35) : publicPassed / publicCases.length),
  );
  return buildAttempt({
    problem: args.problem,
    kind: args.kind,
    answer: { code: args.code },
    status,
    score,
    result: {
      correct: args.includeSecret ? allPublicPassed && args.implemented : allPublicPassed,
      earnedPoints: score,
      feedback: allPublicPassed
        ? args.includeSecret
          ? 'Public tests 通过，hidden tests 已生成汇总。'
          : 'Public tests 通过。'
        : '至少一个 public test 未通过。',
      publicCases,
      secretSummary: args.includeSecret
        ? {
            total: 3,
            passed: args.implemented ? 2 : 0,
            failed: args.implemented ? 1 : 3,
            failureSummary: args.implemented ? '仍需检查极端边界。' : '基础实现尚未完成。',
          }
        : undefined,
    },
  });
}

function problemStem(problem: WorkspaceProblem) {
  const content = problem.publicContent;
  if ('stem' in content) return content.stem;
  if ('stemTemplate' in content) return content.stemTemplate;
  return problem.title;
}
