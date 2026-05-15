'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BrainCircuit,
  CheckCircle2,
  FileJson,
  Loader2,
  Map as MapIcon,
  Play,
  RefreshCw,
  Route,
  Sparkles,
  Target,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import type { ReviewRoute, ReviewRouteNode } from '@/lib/learning/review-route-types';
import { backendJson } from '@/lib/utils/backend-api';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { loadTestResult, saveTestResult } from '@/lib/utils/test-results';
import { cn } from '@/lib/utils';

type ReviewMode = 'exam-sprint' | 'mistake-repair' | 'gentle-foundation';
type RunPhase = 'idle' | 'assessing' | 'generating' | 'success' | 'error';
type ReviewStepId = 'profile' | 'problem-bank' | 'readiness' | 'review-plan';
type CheckStatus = 'pass' | 'warn' | 'fail';
type PipelineStepState = 'ready' | 'running' | 'pass' | 'warn' | 'fail' | 'locked';

type AiProblemBankReadiness = {
  ready: boolean;
  requiredProblemCount: number;
  currentProblemCount: number;
  missingConcepts: string[];
  thinConcepts: string[];
  reasons: string[];
  teacherLine?: string;
};

type ProblemBankPayload = {
  totalProblems: number;
  attemptedProblems: number;
  masteredConcepts: string[];
  weakConcepts: string[];
  untriedConcepts: string[];
  thinConcepts: string[];
  missingConcepts: string[];
  wrongProblems: Array<{
    title: string;
    tags: string[];
    difficulty: 'easy' | 'medium' | 'hard';
    status: 'failed' | 'partial' | 'error';
  }>;
};

type ScenePayload = {
  id: string;
  title: string;
  type: string;
  order: number;
  quizQuestions: string[];
};

type GeneratePayload = {
  notebookId: string;
  notebookName: string;
  notebookDescription: string;
  weakPoints: string[];
  problemBank: ProblemBankPayload;
  scenes: ScenePayload[];
};

type Preset = {
  id: ReviewMode;
  title: string;
  description: string;
  goal: string;
  weakPoints: string;
  masteredConcepts: string;
  weakConcepts: string;
  untriedConcepts: string;
  thinConcepts: string;
  missingConcepts: string;
  customRules: string;
  intensity: number;
  includeSupportNodes: boolean;
  forceBossMix: boolean;
};

type PipelineCheck = {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
};

type ReviewFormState = {
  mode: ReviewMode;
  notebookName: string;
  goal: string;
  weakPoints: string;
  masteredConcepts: string;
  weakConcepts: string;
  untriedConcepts: string;
  thinConcepts: string;
  missingConcepts: string;
  customRules: string;
  intensity: number;
  includeSupportNodes: boolean;
  forceBossMix: boolean;
};

type SavedCustomReviewPayload = {
  mode: 'custom-review-pipeline';
  form: ReviewFormState;
  request: GeneratePayload;
  assessment: AiProblemBankReadiness | null;
  route: ReviewRoute | null;
  checks: Record<ReviewStepId, PipelineCheck[]>;
  generatedAt: number;
};

const TEST_ID = 'custom-review';
const RESULT_KEY = 'state';

const REVIEW_STEPS: Record<
  ReviewStepId,
  { order: number; title: string; subtitle: string; artifact: string }
> = {
  profile: {
    order: 1,
    title: '读取学生画像',
    subtitle: '目标、薄弱点、强度和定制规则',
    artifact: 'goal / weakPoints / customRules',
  },
  'problem-bank': {
    order: 2,
    title: '合成题库与场景',
    subtitle: '把画像转成正式 API payload',
    artifact: 'problemBank / scenes',
  },
  readiness: {
    order: 3,
    title: '题库体检',
    subtitle: '判断是否足够开复习图',
    artifact: 'readiness / missing / thin',
  },
  'review-plan': {
    order: 4,
    title: '生成复习计划',
    subtitle: '路线、关卡、Boss 和奖励验收',
    artifact: 'ReviewRoute / layers / nodes',
  },
};

const PRESETS: Record<ReviewMode, Preset> = {
  'exam-sprint': {
    id: 'exam-sprint',
    title: '考试冲刺',
    description: '更关注高频考点、综合 Boss 和限时检测。',
    goal: '48 小时内补齐期末前最容易丢分的专题，路线要短、分支清楚、Boss 综合度高。',
    weakPoints: '链式法则遇到复合函数时容易漏乘内层导数\n极限题看不出等价无穷小替换时机',
    masteredConcepts: '导数定义\n基本求导公式\n连续与间断点',
    weakConcepts: '链式法则\n隐函数求导',
    untriedConcepts: '洛必达法则\n参数方程求导',
    thinConcepts: '泰勒展开\n极值判定',
    missingConcepts: '综合应用题',
    customRules: 'Boss 关必须混合至少 3 个知识点；普通关题目数量控制在 2-3 题。',
    intensity: 5,
    includeSupportNodes: true,
    forceBossMix: true,
  },
  'mistake-repair': {
    id: 'mistake-repair',
    title: '错题修复',
    description: '把错题、薄弱概念和未尝试专题放到路线前半段。',
    goal: '围绕最近错题生成一条修复路线，先补小漏洞，再用精英关确认迁移能力。',
    weakPoints: '递推式复杂度分析总是漏掉边界条件\n链表指针更新时容易把 prev 和 curr 写反',
    masteredConcepts: 'Python 函数调用\n基础类定义\n列表遍历',
    weakConcepts: '递归复杂度\n链表删除',
    untriedConcepts: '继承方法解析顺序\n异常处理',
    thinConcepts: '二叉树遍历\n栈帧追踪',
    missingConcepts: '',
    customRules: '前两层优先安排错题概念；每个精英关都要写清楚变式来源。',
    intensity: 4,
    includeSupportNodes: true,
    forceBossMix: true,
  },
  'gentle-foundation': {
    id: 'gentle-foundation',
    title: '低压打底',
    description: '适合刚开始复习或信心不足时，增加营火和宝箱节奏。',
    goal: '不要一开始就高压，先用基础题确认安全区，再逐步接触未尝试专题。',
    weakPoints: '看到抽象定义会紧张，容易跳过题干条件\n证明题不知道第一句该从哪里写',
    masteredConcepts: '集合基本运算\n命题逻辑符号',
    weakConcepts: '等价关系\n偏序关系',
    untriedConcepts: '同余类\n商集',
    thinConcepts: '反例构造',
    missingConcepts: '综合证明',
    customRules: '第一层必须温和；每两层至少有一个恢复节奏的非做题节点。',
    intensity: 2,
    includeSupportNodes: true,
    forceBossMix: false,
  },
};

function splitLines(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/\r?\n|,|，|;/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function getModelHeaders(): Record<string, string> {
  const modelConfig = getCurrentModelConfig();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-model': modelConfig.modelString,
    'x-api-key': modelConfig.apiKey,
  };
  if (modelConfig.baseUrl) headers['x-base-url'] = modelConfig.baseUrl;
  if (modelConfig.providerType) headers['x-provider-type'] = modelConfig.providerType;
  if (modelConfig.requiresApiKey) headers['x-requires-api-key'] = 'true';
  return headers;
}

function buildProblemBank(args: {
  masteredConcepts: string[];
  weakConcepts: string[];
  untriedConcepts: string[];
  thinConcepts: string[];
  missingConcepts: string[];
}): ProblemBankPayload {
  const totalProblems =
    args.masteredConcepts.length * 3 +
    args.weakConcepts.length * 3 +
    args.untriedConcepts.length * 2 +
    args.thinConcepts.length;
  const attemptedProblems = args.masteredConcepts.length * 3 + args.weakConcepts.length;

  return {
    totalProblems,
    attemptedProblems,
    masteredConcepts: args.masteredConcepts,
    weakConcepts: args.weakConcepts,
    untriedConcepts: args.untriedConcepts,
    thinConcepts: args.thinConcepts,
    missingConcepts: args.missingConcepts,
    wrongProblems: args.weakConcepts.slice(0, 8).map((concept, index) => ({
      title: `${concept} 错因回看 ${index + 1}`,
      tags: [concept],
      difficulty: index % 2 === 0 ? 'medium' : 'hard',
      status: index % 3 === 0 ? 'partial' : 'failed',
    })),
  };
}

function buildScenes(concepts: string[], problemBank: ProblemBankPayload): ScenePayload[] {
  const allConcepts = concepts.length > 0 ? concepts : ['综合复习'];
  return allConcepts.slice(0, 12).map((concept, index) => {
    const isMissing = problemBank.missingConcepts.includes(concept);
    const isThin = problemBank.thinConcepts.includes(concept);
    const isWeak = problemBank.weakConcepts.includes(concept);
    return {
      id: `custom-review-scene-${index + 1}`,
      title: concept,
      type: isWeak ? 'quiz' : 'lesson',
      order: index + 1,
      quizQuestions: isMissing
        ? []
        : [
            `解释「${concept}」最容易混淆的条件，并给出一个反例或边界例子。`,
            isThin
              ? `用一道新题检查「${concept}」是否只会套公式。`
              : `完成一道「${concept}」的迁移题，并说明关键步骤。`,
          ],
    };
  });
}

function routeMetrics(route: ReviewRoute | null) {
  if (!route) {
    return {
      layerCount: 0,
      nodeCount: 0,
      questionNodeCount: 0,
      supportNodeCount: 0,
      rewardPoints: 0,
    };
  }
  const nodes = route.layers.flatMap((layer) => layer.nodes);
  return {
    layerCount: route.layers.length,
    nodeCount: nodes.length,
    questionNodeCount: nodes.filter((node) => node.requiresQuestion).length,
    supportNodeCount: nodes.filter((node) => !node.requiresQuestion).length,
    rewardPoints: nodes.reduce((sum, node) => sum + (node.rewardPoints || 0), 0),
  };
}

function makeCheck(
  id: string,
  label: string,
  passed: boolean,
  detail: string,
  warnOnly = false,
): PipelineCheck {
  return {
    id,
    label,
    status: passed ? 'pass' : warnOnly ? 'warn' : 'fail',
    detail,
  };
}

function hasBlockingFailure(checks: PipelineCheck[]): boolean {
  return checks.some((check) => check.status === 'fail');
}

function checksToStepState(checks: PipelineCheck[]): PipelineStepState {
  if (checks.some((check) => check.status === 'fail')) return 'fail';
  if (checks.some((check) => check.status === 'warn')) return 'warn';
  return 'pass';
}

function formatSavedAt(value: string | number): string {
  return new Date(value).toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusClassName(status: CheckStatus): string {
  if (status === 'pass') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'warn') return 'border-amber-200 bg-amber-50 text-amber-900';
  return 'border-red-200 bg-red-50 text-red-800';
}

function stateBadgeClassName(state: PipelineStepState): string {
  if (state === 'pass') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (state === 'warn') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (state === 'fail') return 'border-red-200 bg-red-50 text-red-700';
  if (state === 'running') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (state === 'locked') return 'border-slate-200 bg-slate-100 text-slate-500';
  return 'border-slate-200 bg-white text-slate-600';
}

function stateLabel(state: PipelineStepState): string {
  if (state === 'pass') return 'pass';
  if (state === 'warn') return 'warn';
  if (state === 'fail') return 'fail';
  if (state === 'running') return 'running';
  if (state === 'locked') return 'locked';
  return 'ready';
}

function collectRouteNodes(route: ReviewRoute | null): ReviewRouteNode[] {
  return route?.layers.flatMap((layer) => layer.nodes) || [];
}

function containsForbiddenStudyTask(text: string): boolean {
  return /(看课|听课|阅读讲义|学习视频|视频学习|watch\s+video|read\s+lecture)/i.test(text);
}

function evaluateProfile(form: ReviewFormState): PipelineCheck[] {
  const weakPoints = splitLines(form.weakPoints);
  const knownConcepts = [
    ...splitLines(form.masteredConcepts),
    ...splitLines(form.weakConcepts),
    ...splitLines(form.untriedConcepts),
    ...splitLines(form.thinConcepts),
    ...splitLines(form.missingConcepts),
  ];
  return [
    makeCheck(
      'profile-notebook',
      'Notebook 名称可用',
      form.notebookName.trim().length >= 4,
      form.notebookName.trim() || 'Notebook 名称为空。',
    ),
    makeCheck(
      'profile-goal',
      '复习目标具体',
      form.goal.trim().length >= 24,
      `goal=${form.goal.trim().length} 字符。`,
    ),
    makeCheck(
      'profile-weak-points',
      '学生薄弱点已描述',
      weakPoints.length >= 1,
      weakPoints.length ? `${weakPoints.length} 条薄弱点。` : '还没有薄弱点。',
    ),
    makeCheck(
      'profile-concepts',
      '知识点画像足够',
      new Set(knownConcepts).size >= 5,
      `画像知识点 ${new Set(knownConcepts).size} 个。`,
    ),
    makeCheck(
      'profile-custom-rules',
      '定制规则可见',
      form.customRules.trim().length >= 10,
      form.customRules.trim() || '没有额外测试规则。',
      true,
    ),
  ];
}

function evaluateProblemBank(payload: GeneratePayload): PipelineCheck[] {
  const concepts = new Set([
    ...payload.problemBank.masteredConcepts,
    ...payload.problemBank.weakConcepts,
    ...payload.problemBank.untriedConcepts,
    ...payload.problemBank.thinConcepts,
    ...payload.problemBank.missingConcepts,
  ]);
  const sceneConcepts = new Set(payload.scenes.map((scene) => scene.title));
  const scenesWithoutQuestions = payload.scenes.filter((scene) => scene.quizQuestions.length === 0);
  return [
    makeCheck(
      'bank-problem-count',
      '题库题量足够触发体检',
      payload.problemBank.totalProblems >= 8,
      `totalProblems=${payload.problemBank.totalProblems}。`,
    ),
    makeCheck(
      'bank-concepts',
      '题库画像覆盖多个概念',
      concepts.size >= 5,
      `problemBank concepts=${concepts.size}。`,
    ),
    makeCheck(
      'bank-wrong-problems',
      '错题信号已合成',
      payload.problemBank.wrongProblems.length >= 1,
      `wrongProblems=${payload.problemBank.wrongProblems.length}。`,
    ),
    makeCheck(
      'bank-scenes',
      'scenes 可供正式 API 使用',
      payload.scenes.length >= 5,
      `scenes=${payload.scenes.length}。`,
    ),
    makeCheck(
      'bank-scene-coverage',
      'scenes 覆盖画像知识点',
      sceneConcepts.size >= Math.min(5, concepts.size),
      `scene titles=${sceneConcepts.size}，concepts=${concepts.size}。`,
    ),
    makeCheck(
      'bank-missing-visible',
      '缺题场景被显式暴露',
      scenesWithoutQuestions.length === payload.problemBank.missingConcepts.length,
      `无题 scene=${scenesWithoutQuestions.length}，missingConcepts=${payload.problemBank.missingConcepts.length}。`,
      true,
    ),
  ];
}

function evaluateAssessment(
  assessment: AiProblemBankReadiness | null,
  payload: GeneratePayload,
): PipelineCheck[] {
  if (!assessment) {
    return [
      makeCheck('assessment-present', '题库体检已返回', false, '还没有调用题库体检接口。', true),
    ];
  }
  const mentionedConcepts = new Set([...assessment.missingConcepts, ...assessment.thinConcepts]);
  const expectedThinOrMissing = new Set([
    ...payload.problemBank.missingConcepts,
    ...payload.problemBank.thinConcepts,
  ]);
  const overlap = Array.from(mentionedConcepts).filter((concept) =>
    expectedThinOrMissing.has(concept),
  );
  return [
    makeCheck(
      'assessment-present',
      '题库体检已返回',
      true,
      assessment.teacherLine || '已返回 assessment。',
    ),
    makeCheck(
      'assessment-counts',
      '题量判断有上下限',
      assessment.requiredProblemCount >= assessment.currentProblemCount ||
        assessment.currentProblemCount >= payload.problemBank.totalProblems,
      `current=${assessment.currentProblemCount}，required=${assessment.requiredProblemCount}。`,
      true,
    ),
    makeCheck(
      'assessment-explained',
      'ready=false 时原因可见',
      assessment.ready || assessment.reasons.length > 0,
      assessment.ready ? '题库已判定 ready。' : `reasons=${assessment.reasons.length}。`,
    ),
    makeCheck(
      'assessment-thin-missing',
      '薄弱/缺题信号被识别',
      expectedThinOrMissing.size === 0 || overlap.length > 0,
      expectedThinOrMissing.size
        ? `识别 ${overlap.length}/${expectedThinOrMissing.size} 个薄弱/缺题信号。`
        : '当前画像没有薄弱/缺题信号。',
      true,
    ),
  ];
}

function evaluateReviewPlan(
  route: ReviewRoute | null,
  payload: GeneratePayload,
  form: ReviewFormState,
): PipelineCheck[] {
  if (!route) {
    return [makeCheck('review-plan-present', '复习计划已生成', false, '还没有生成路线。')];
  }
  const nodes = collectRouteNodes(route);
  const firstLayerKinds = route.layers[0]?.nodes.map((node) => node.kind) || [];
  const lastLayer = route.layers[route.layers.length - 1];
  const finalBossOnly =
    lastLayer?.nodes.length === 1 &&
    lastLayer.nodes[0]?.kind === 'boss' &&
    lastLayer.nodes[0].requiresQuestion;
  const questionNodes = nodes.filter((node) => node.requiresQuestion);
  const supportNodes = nodes.filter((node) => !node.requiresQuestion);
  const rewardlessNodes = nodes.filter((node) => node.rewardPoints <= 0 && node.kind !== 'shop');
  const genericQuestionTitles = questionNodes.filter((node) =>
    /(检测|小测|练习)$/.test(node.title),
  );
  const forbiddenTasks = nodes.filter((node) =>
    containsForbiddenStudyTask([node.title, node.questionStyle, node.checkGoal].join(' ')),
  );
  const targetConcepts = new Set([
    ...payload.problemBank.weakConcepts,
    ...payload.problemBank.untriedConcepts,
    ...payload.problemBank.thinConcepts,
    ...payload.problemBank.missingConcepts,
  ]);
  const plannedConcepts = new Set(route.knowledgePoints);
  nodes.forEach((node) => node.knowledgePoints.forEach((point) => plannedConcepts.add(point)));
  const coveredTargets = Array.from(targetConcepts).filter((point) => plannedConcepts.has(point));
  const personalizedNodes = questionNodes.filter((node) =>
    /(weak_point|wrong_problem|untried_concept|thin_bank|mastered_review|boss_mix)/.test(
      node.sourceSignals.join(' '),
    ),
  );
  return [
    makeCheck(
      'review-plan-present',
      '复习计划已生成',
      true,
      `${route.layers.length} 层，${nodes.length} 个节点。`,
    ),
    makeCheck(
      'review-plan-layers',
      '层数符合复习图节奏',
      route.layers.length >= 4 && route.layers.length <= 7,
      `layers=${route.layers.length}。`,
    ),
    makeCheck(
      'review-plan-first-layer',
      '第一层没有补给节点',
      firstLayerKinds.every((kind) => kind === 'normal' || kind === 'elite'),
      `firstLayer=${firstLayerKinds.join(', ') || '空'}。`,
    ),
    makeCheck(
      'review-plan-final-boss',
      '最后一层单 Boss 汇聚',
      finalBossOnly,
      lastLayer
        ? `lastLayerNodes=${lastLayer.nodes.map((node) => node.kind).join(', ')}。`
        : '缺少最后一层。',
    ),
    makeCheck(
      'review-plan-question-nodes',
      '做题关卡占主线',
      questionNodes.length >= Math.max(4, Math.ceil(nodes.length * 0.55)),
      `questionNodes=${questionNodes.length}/${nodes.length}。`,
    ),
    makeCheck(
      'review-plan-support-nodes',
      '补给节点符合定制要求',
      !form.includeSupportNodes || supportNodes.length >= 1,
      form.includeSupportNodes
        ? `supportNodes=${supportNodes.length}。`
        : '当前设置不要求补给节点。',
      !form.includeSupportNodes,
    ),
    makeCheck(
      'review-plan-target-coverage',
      '覆盖薄弱/未尝试/缺题信号',
      targetConcepts.size === 0 || coveredTargets.length >= Math.min(targetConcepts.size, 4),
      `coveredTargets=${coveredTargets.length}/${targetConcepts.size}。`,
    ),
    makeCheck(
      'review-plan-personalized',
      '题目节点带学生画像信号',
      personalizedNodes.length >= Math.max(2, Math.ceil(questionNodes.length * 0.5)),
      `personalizedQuestionNodes=${personalizedNodes.length}/${questionNodes.length}。`,
    ),
    makeCheck(
      'review-plan-rewards',
      '节点奖励已结构化',
      rewardlessNodes.length === 0,
      rewardlessNodes.length
        ? `${rewardlessNodes.length} 个非商店节点没有奖励积分。`
        : '奖励积分完整。',
    ),
    makeCheck(
      'review-plan-no-study-task',
      '没有看课/阅读类任务',
      forbiddenTasks.length === 0,
      forbiddenTasks.length
        ? `${forbiddenTasks.length} 个节点疑似安排了看课/阅读。`
        : '全部是做题或补给节点。',
    ),
    makeCheck(
      'review-plan-title-quality',
      '关卡名不是泛泛“检测/练习”',
      genericQuestionTitles.length === 0,
      genericQuestionTitles.length
        ? `${genericQuestionTitles.length} 个关卡名过泛。`
        : '关卡标题有游戏化表达。',
      true,
    ),
  ];
}

function nodeKindLabel(kind: ReviewRouteNode['kind']): string {
  const labels: Record<ReviewRouteNode['kind'], string> = {
    normal: '普通关',
    elite: '精英关',
    boss: 'Boss',
    camp: '营火',
    treasure: '宝箱',
    event: '事件',
    shop: '商店',
  };
  return labels[kind];
}

function nodeKindClassName(kind: ReviewRouteNode['kind']): string {
  if (kind === 'boss') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (kind === 'elite') return 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700';
  if (kind === 'camp') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (kind === 'treasure') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (kind === 'event') return 'border-sky-200 bg-sky-50 text-sky-700';
  if (kind === 'shop') return 'border-violet-200 bg-violet-50 text-violet-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function compactJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function GateCheckList({ checks }: { checks: PipelineCheck[] }) {
  return (
    <div className="grid gap-3">
      {checks.map((check) => {
        const Icon = check.status === 'pass' ? CheckCircle2 : AlertTriangle;
        return (
          <div
            key={check.id}
            className={cn('rounded-xl border p-3 text-sm leading-6', statusClassName(check.status))}
          >
            <div className="flex items-center gap-2 font-semibold">
              <Icon className="size-4 shrink-0" />
              {check.label}
            </div>
            <div className="mt-1 text-sm opacity-90">{check.detail}</div>
          </div>
        );
      })}
    </div>
  );
}

function StepButton({
  id,
  active,
  state,
  failCount,
  warnCount,
  onClick,
}: {
  id: ReviewStepId;
  active: boolean;
  state: PipelineStepState;
  failCount: number;
  warnCount: number;
  onClick: () => void;
}) {
  const step = REVIEW_STEPS[id];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-2xl border p-4 text-left transition',
        active
          ? 'border-indigo-300 bg-indigo-50 shadow-sm'
          : 'border-slate-200 bg-white hover:bg-slate-50',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
              active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600',
            )}
          >
            {step.order}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-950">{step.title}</div>
            <div className="mt-0.5 text-xs leading-5 text-slate-500">{step.subtitle}</div>
          </div>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-md border px-2 py-0.5 text-xs font-semibold',
            stateBadgeClassName(state),
          )}
        >
          {stateLabel(state)}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium text-slate-500">
        <span className="rounded-md bg-slate-100 px-2 py-1">{step.artifact}</span>
        <span className="rounded-md bg-slate-100 px-2 py-1">{failCount} fail</span>
        <span className="rounded-md bg-slate-100 px-2 py-1">{warnCount} warn</span>
      </div>
    </button>
  );
}

function StepShell({
  id,
  state,
  actionLabel,
  actionDisabled,
  onAction,
  children,
}: {
  id: ReviewStepId;
  state: PipelineStepState;
  actionLabel?: string;
  actionDisabled?: boolean;
  onAction?: () => void;
  children: ReactNode;
}) {
  const step = REVIEW_STEPS[id];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
              {step.order}
            </span>
            <div>
              <h2 className="text-xl font-semibold tracking-normal">{step.title}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">{step.subtitle}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <Badge variant="outline" className="rounded-md">
            {step.artifact}
          </Badge>
          <span
            className={cn(
              'rounded-md border px-2.5 py-1 text-xs font-semibold',
              stateBadgeClassName(state),
            )}
          >
            {stateLabel(state)}
          </span>
          {actionLabel && onAction ? (
            <Button type="button" onClick={onAction} disabled={actionDisabled}>
              {state === 'running' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              {actionLabel}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function CustomReviewTestPage() {
  const [mode, setMode] = useState<ReviewMode>('exam-sprint');
  const [notebookName, setNotebookName] = useState('定制化复习测试 Notebook');
  const [goal, setGoal] = useState(PRESETS['exam-sprint'].goal);
  const [weakPoints, setWeakPoints] = useState(PRESETS['exam-sprint'].weakPoints);
  const [masteredConcepts, setMasteredConcepts] = useState(PRESETS['exam-sprint'].masteredConcepts);
  const [weakConcepts, setWeakConcepts] = useState(PRESETS['exam-sprint'].weakConcepts);
  const [untriedConcepts, setUntriedConcepts] = useState(PRESETS['exam-sprint'].untriedConcepts);
  const [thinConcepts, setThinConcepts] = useState(PRESETS['exam-sprint'].thinConcepts);
  const [missingConcepts, setMissingConcepts] = useState(PRESETS['exam-sprint'].missingConcepts);
  const [customRules, setCustomRules] = useState(PRESETS['exam-sprint'].customRules);
  const [intensity, setIntensity] = useState(PRESETS['exam-sprint'].intensity);
  const [includeSupportNodes, setIncludeSupportNodes] = useState(
    PRESETS['exam-sprint'].includeSupportNodes,
  );
  const [forceBossMix, setForceBossMix] = useState(PRESETS['exam-sprint'].forceBossMix);
  const [selectedStepId, setSelectedStepId] = useState<ReviewStepId>('profile');
  const [phase, setPhase] = useState<RunPhase>('idle');
  const [saveMessage, setSaveMessage] = useState('');
  const [isLoadingSavedResult, setIsLoadingSavedResult] = useState(true);
  const [assessment, setAssessment] = useState<AiProblemBankReadiness | null>(null);
  const [route, setRoute] = useState<ReviewRoute | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const activePreset = PRESETS[mode];
  const problemBank = useMemo(
    () =>
      buildProblemBank({
        masteredConcepts: splitLines(masteredConcepts),
        weakConcepts: splitLines(weakConcepts),
        untriedConcepts: splitLines(untriedConcepts),
        thinConcepts: splitLines(thinConcepts),
        missingConcepts: splitLines(missingConcepts),
      }),
    [masteredConcepts, missingConcepts, thinConcepts, untriedConcepts, weakConcepts],
  );
  const allConcepts = useMemo(
    () =>
      Array.from(
        new Set([
          ...problemBank.weakConcepts,
          ...problemBank.untriedConcepts,
          ...problemBank.thinConcepts,
          ...problemBank.masteredConcepts,
          ...problemBank.missingConcepts,
        ]),
      ).slice(0, 24),
    [problemBank],
  );
  const scenes = useMemo(() => buildScenes(allConcepts, problemBank), [allConcepts, problemBank]);
  const payload = useMemo<GeneratePayload>(
    () => ({
      notebookId: `custom-review-test-${mode}`,
      notebookName,
      notebookDescription: [
        `定制化复习目标：${goal}`,
        `复习模式：${activePreset.title}`,
        `强度：${intensity}/5`,
        includeSupportNodes
          ? '需要营火、宝箱、事件或商店节点调节节奏。'
          : '尽量减少非做题节点，把路线压缩成纯检测链路。',
        forceBossMix ? '最终 Boss 必须是多知识点综合题。' : '最终 Boss 可以偏基础综合。',
        customRules ? `额外规则：${customRules}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      weakPoints: splitLines(weakPoints),
      problemBank,
      scenes,
    }),
    [
      activePreset.title,
      customRules,
      forceBossMix,
      goal,
      includeSupportNodes,
      intensity,
      mode,
      notebookName,
      problemBank,
      scenes,
      weakPoints,
    ],
  );
  const metrics = useMemo(() => routeMetrics(route), [route]);
  const formState = useMemo<ReviewFormState>(
    () => ({
      mode,
      notebookName,
      goal,
      weakPoints,
      masteredConcepts,
      weakConcepts,
      untriedConcepts,
      thinConcepts,
      missingConcepts,
      customRules,
      intensity,
      includeSupportNodes,
      forceBossMix,
    }),
    [
      customRules,
      forceBossMix,
      goal,
      includeSupportNodes,
      intensity,
      masteredConcepts,
      missingConcepts,
      mode,
      notebookName,
      thinConcepts,
      untriedConcepts,
      weakConcepts,
      weakPoints,
    ],
  );
  const profileChecks = useMemo(() => evaluateProfile(formState), [formState]);
  const problemBankChecks = useMemo(() => evaluateProblemBank(payload), [payload]);
  const assessmentChecks = useMemo(
    () => evaluateAssessment(assessment, payload),
    [assessment, payload],
  );
  const routeChecks = useMemo(
    () => evaluateReviewPlan(route, payload, formState),
    [formState, payload, route],
  );
  const profilePassed = !hasBlockingFailure(profileChecks);
  const problemBankPassed = profilePassed && !hasBlockingFailure(problemBankChecks);
  const assessmentStarted = Boolean(assessment) || phase === 'assessing';
  const routeStarted = Boolean(route) || phase === 'generating';
  const stepStates: Record<ReviewStepId, PipelineStepState> = {
    profile: checksToStepState(profileChecks),
    'problem-bank': !profilePassed ? 'locked' : checksToStepState(problemBankChecks),
    readiness:
      phase === 'assessing'
        ? 'running'
        : !problemBankPassed
          ? 'locked'
          : assessmentStarted
            ? checksToStepState(assessmentChecks)
            : 'ready',
    'review-plan':
      phase === 'generating'
        ? 'running'
        : !problemBankPassed
          ? 'locked'
          : routeStarted
            ? checksToStepState(routeChecks)
            : 'ready',
  };
  const readinessPercent = useMemo(() => {
    if (!assessment) return 0;
    if (assessment.requiredProblemCount <= 0) return 100;
    return Math.min(
      100,
      Math.round((assessment.currentProblemCount / assessment.requiredProblemCount) * 100),
    );
  }, [assessment]);

  const applyFormState = useCallback((form: ReviewFormState) => {
    setMode(form.mode);
    setNotebookName(form.notebookName);
    setGoal(form.goal);
    setWeakPoints(form.weakPoints);
    setMasteredConcepts(form.masteredConcepts);
    setWeakConcepts(form.weakConcepts);
    setUntriedConcepts(form.untriedConcepts);
    setThinConcepts(form.thinConcepts);
    setMissingConcepts(form.missingConcepts);
    setCustomRules(form.customRules);
    setIntensity(form.intensity);
    setIncludeSupportNodes(form.includeSupportNodes);
    setForceBossMix(form.forceBossMix);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadTestResult<SavedCustomReviewPayload>({
      testId: TEST_ID,
      resultKey: RESULT_KEY,
    })
      .then((row) => {
        if (cancelled) return;
        const saved = row?.payload;
        if (saved?.mode === 'custom-review-pipeline' && saved.form) {
          applyFormState(saved.form);
          setAssessment(saved.assessment || null);
          setRoute(saved.route || null);
          setPhase(saved.route ? 'success' : 'idle');
          setSelectedStepId(
            saved.route ? 'review-plan' : saved.assessment ? 'readiness' : 'profile',
          );
          setSaveMessage(
            `已恢复 ${formatSavedAt(row?.updatedAt || Date.now())} 保存的复习计划测试结果。`,
          );
          return;
        }
        setSaveMessage('');
      })
      .catch(() => {
        if (!cancelled) setSaveMessage('');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSavedResult(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applyFormState]);

  const persistPipelineResult = useCallback(
    async (args: {
      status: 'generated' | 'failed' | 'assessed';
      title: string;
      nextAssessment: AiProblemBankReadiness | null;
      nextRoute: ReviewRoute | null;
      error?: string;
    }) => {
      const checks: Record<ReviewStepId, PipelineCheck[]> = {
        profile: evaluateProfile(formState),
        'problem-bank': evaluateProblemBank(payload),
        readiness: evaluateAssessment(args.nextAssessment, payload),
        'review-plan': evaluateReviewPlan(args.nextRoute, payload, formState),
      };
      const visibleChecks = [
        ...checks.profile,
        ...checks['problem-bank'],
        ...(args.nextAssessment ? checks.readiness : []),
        ...(args.nextRoute || args.error ? checks['review-plan'] : []),
      ];
      const nextMetrics = routeMetrics(args.nextRoute);
      const errorCount =
        visibleChecks.filter((check) => check.status === 'fail').length + (args.error ? 1 : 0);
      const payloadToSave: SavedCustomReviewPayload = {
        mode: 'custom-review-pipeline',
        form: formState,
        request: payload,
        assessment: args.nextAssessment,
        route: args.nextRoute,
        checks,
        generatedAt: Date.now(),
      };
      try {
        await saveTestResult({
          testId: TEST_ID,
          resultKey: RESULT_KEY,
          status: args.status,
          title: args.title,
          summary: {
            generatedCount: nextMetrics.nodeCount,
            errorCount,
            layerCount: nextMetrics.layerCount,
            questionNodeCount: nextMetrics.questionNodeCount,
            supportNodeCount: nextMetrics.supportNodeCount,
            readiness: args.nextAssessment?.ready ?? null,
            currentProblemCount:
              args.nextAssessment?.currentProblemCount ?? payload.problemBank.totalProblems,
            lastUpdatedAt: Date.now(),
          },
          payload: payloadToSave,
        });
      } catch {
        // DATABASE_URL is optional in local-first mode, so saving QA state is best-effort.
      }
    },
    [formState, payload],
  );

  const applyPreset = useCallback((presetId: ReviewMode) => {
    const preset = PRESETS[presetId];
    setMode(presetId);
    setGoal(preset.goal);
    setWeakPoints(preset.weakPoints);
    setMasteredConcepts(preset.masteredConcepts);
    setWeakConcepts(preset.weakConcepts);
    setUntriedConcepts(preset.untriedConcepts);
    setThinConcepts(preset.thinConcepts);
    setMissingConcepts(preset.missingConcepts);
    setCustomRules(preset.customRules);
    setIntensity(preset.intensity);
    setIncludeSupportNodes(preset.includeSupportNodes);
    setForceBossMix(preset.forceBossMix);
    setAssessment(null);
    setRoute(null);
    setErrorMessage('');
    setSaveMessage('');
    setSelectedStepId('profile');
    setPhase('idle');
  }, []);

  const handleAssess = useCallback(async () => {
    if (!problemBankPassed) {
      setSelectedStepId(!profilePassed ? 'profile' : 'problem-bank');
      return;
    }
    setPhase('assessing');
    setSelectedStepId('readiness');
    setErrorMessage('');
    setAssessment(null);
    setRoute(null);
    setSaveMessage('');
    try {
      const response = await backendJson<{ assessment: AiProblemBankReadiness }>(
        '/api/review-route/assess-problem-bank',
        {
          method: 'POST',
          headers: getModelHeaders(),
          body: JSON.stringify({
            notebookId: payload.notebookId,
            notebookName: payload.notebookName,
            notebookDescription: payload.notebookDescription,
            problemBank: payload.problemBank,
            scenes: payload.scenes,
          }),
        },
      );
      setAssessment(response.assessment);
      setPhase('idle');
      await persistPipelineResult({
        status: 'assessed',
        title: `${payload.notebookName} · 题库体检`,
        nextAssessment: response.assessment,
        nextRoute: null,
      });
      setSaveMessage(
        `题库体检已保存：${response.assessment.ready ? '可开图' : '需要补题/偏薄说明已返回'}。`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '题库体检失败';
      setErrorMessage(message);
      setPhase('error');
      await persistPipelineResult({
        status: 'failed',
        title: `${payload.notebookName} · 题库体检失败`,
        nextAssessment: null,
        nextRoute: null,
        error: message,
      });
    }
  }, [payload, persistPipelineResult, problemBankPassed, profilePassed]);

  const handleGenerate = useCallback(async () => {
    if (!problemBankPassed) {
      setSelectedStepId(!profilePassed ? 'profile' : 'problem-bank');
      return;
    }
    setPhase('generating');
    setSelectedStepId('review-plan');
    setErrorMessage('');
    setRoute(null);
    setSaveMessage('');
    try {
      const response = await backendJson<{ route: ReviewRoute }>('/api/review-route/generate', {
        method: 'POST',
        headers: getModelHeaders(),
        body: JSON.stringify(payload),
      });
      const nextRoute = response.route;
      setRoute(nextRoute);
      setPhase('success');
      const nextMetrics = routeMetrics(nextRoute);
      await persistPipelineResult({
        status: 'generated',
        title: nextRoute.title,
        nextAssessment: assessment,
        nextRoute,
      });
      setSaveMessage(
        `复习计划已保存：${nextMetrics.layerCount} 层，${nextMetrics.nodeCount} 个节点。`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '复习路线生成失败';
      setErrorMessage(message);
      setPhase('error');
      await persistPipelineResult({
        status: 'failed',
        title: `${payload.notebookName} · 路线生成失败`,
        nextAssessment: assessment,
        nextRoute: null,
        error: message,
      });
    }
  }, [assessment, payload, persistPipelineResult, problemBankPassed, profilePassed]);

  const isRunning = phase === 'assessing' || phase === 'generating';
  const checksByStep: Record<ReviewStepId, PipelineCheck[]> = {
    profile: profileChecks,
    'problem-bank': problemBankChecks,
    readiness: assessmentStarted ? assessmentChecks : [],
    'review-plan': routeStarted ? routeChecks : [],
  };

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">
        <header className="grid gap-5 border-b border-slate-200 pb-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="max-w-3xl">
            <Link
              href="/test"
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
            >
              <ArrowLeft className="size-4" />
              返回测试中心
            </Link>
            <div className="mt-4 flex items-center gap-2 text-sm font-medium text-slate-500">
              <span className="flex size-6 items-center justify-center rounded-md bg-gradient-to-br from-sky-500 via-indigo-500 to-emerald-400 text-[11px] font-semibold text-white shadow-sm">
                R
              </span>
              Custom Review QA
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal">定制化复习测试</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              手动构造学生目标、薄弱点和题库画像，复用正式复习路线
              API，检查个性化输入是否能影响关卡、题量、奖励和 Boss 结构。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <Badge variant="secondary" className="rounded-md">
              {activePreset.title}
            </Badge>
            <Badge variant={assessment?.ready ? 'secondary' : 'outline'} className="rounded-md">
              {assessment ? (assessment.ready ? '题库可开图' : '题库需补题') : '未体检'}
            </Badge>
            <Badge variant={route ? 'secondary' : 'outline'} className="rounded-md">
              {route ? `${metrics.nodeCount} 节点` : '未生成'}
            </Badge>
          </div>
        </header>

        <section className="grid gap-5 xl:grid-cols-[360px_1fr]">
          <aside className="grid h-fit gap-3">
            {(['profile', 'problem-bank', 'readiness', 'review-plan'] as ReviewStepId[]).map(
              (stepId) => {
                const checks = checksByStep[stepId];
                return (
                  <StepButton
                    key={stepId}
                    id={stepId}
                    active={selectedStepId === stepId}
                    state={stepStates[stepId]}
                    failCount={checks.filter((check) => check.status === 'fail').length}
                    warnCount={checks.filter((check) => check.status === 'warn').length}
                    onClick={() => setSelectedStepId(stepId)}
                  />
                );
              },
            )}

            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600 shadow-sm">
              {isLoadingSavedResult ? (
                <div className="flex items-center gap-2 text-slate-500">
                  <Loader2 className="size-4 animate-spin" />
                  正在恢复保存结果
                </div>
              ) : saveMessage ? (
                <div className="text-emerald-700">{saveMessage}</div>
              ) : (
                <div>运行题库体检或生成复习计划后，结果会保存到测试结果表，刷新还能继续看。</div>
              )}
            </div>
          </aside>

          <div className="grid gap-4">
            {errorMessage ? (
              <div className="flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-700">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            ) : null}

            {selectedStepId === 'profile' ? (
              <StepShell id="profile" state={stepStates.profile}>
                <div className="grid gap-5">
                  <GateCheckList checks={profileChecks} />
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="pipeline-review-mode">预设模式</Label>
                      <Select
                        value={mode}
                        onValueChange={(value) => applyPreset(value as ReviewMode)}
                      >
                        <SelectTrigger id="pipeline-review-mode" className="w-full bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.values(PRESETS).map((preset) => (
                            <SelectItem key={preset.id} value={preset.id}>
                              {preset.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs leading-5 text-slate-500">{activePreset.description}</p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="pipeline-notebook-name">Notebook 名称</Label>
                      <Input
                        id="pipeline-notebook-name"
                        value={notebookName}
                        onChange={(event) => setNotebookName(event.target.value)}
                      />
                    </div>
                    <div className="grid gap-2 lg:col-span-2">
                      <Label htmlFor="pipeline-review-goal">学生目标</Label>
                      <Textarea
                        id="pipeline-review-goal"
                        value={goal}
                        onChange={(event) => setGoal(event.target.value)}
                        className="min-h-24"
                      />
                    </div>
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="pipeline-review-intensity">复习强度</Label>
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                          {intensity}/5
                        </span>
                      </div>
                      <Slider
                        id="pipeline-review-intensity"
                        value={[intensity]}
                        min={1}
                        max={5}
                        step={1}
                        onValueChange={(value) => setIntensity(value[0] ?? 3)}
                      />
                    </div>
                    <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <label className="flex items-start gap-3 text-sm leading-5 text-slate-600">
                        <Checkbox
                          checked={includeSupportNodes}
                          onCheckedChange={(value) => setIncludeSupportNodes(value === true)}
                          className="mt-0.5"
                        />
                        <span>
                          <span className="font-semibold text-slate-900">保留补给节点</span>
                          <span className="block text-xs text-slate-500">
                            要求营火、宝箱、事件或商店参与节奏测试。
                          </span>
                        </span>
                      </label>
                      <label className="flex items-start gap-3 text-sm leading-5 text-slate-600">
                        <Checkbox
                          checked={forceBossMix}
                          onCheckedChange={(value) => setForceBossMix(value === true)}
                          className="mt-0.5"
                        />
                        <span>
                          <span className="font-semibold text-slate-900">强制综合 Boss</span>
                          <span className="block text-xs text-slate-500">
                            在描述中声明最终 Boss 必须混合多个知识点。
                          </span>
                        </span>
                      </label>
                    </div>
                    <div className="grid gap-2 lg:col-span-2">
                      <Label htmlFor="pipeline-weak-points">学生已记录薄弱点</Label>
                      <Textarea
                        id="pipeline-weak-points"
                        value={weakPoints}
                        onChange={(event) => setWeakPoints(event.target.value)}
                        className="min-h-24"
                      />
                    </div>
                    <div className="grid gap-2 lg:col-span-2">
                      <Label htmlFor="pipeline-custom-rules">额外测试规则</Label>
                      <Textarea
                        id="pipeline-custom-rules"
                        value={customRules}
                        onChange={(event) => setCustomRules(event.target.value)}
                        className="min-h-20"
                      />
                    </div>
                  </div>
                </div>
              </StepShell>
            ) : null}

            {selectedStepId === 'problem-bank' ? (
              <StepShell id="problem-bank" state={stepStates['problem-bank']}>
                <div className="grid gap-5">
                  <GateCheckList checks={problemBankChecks} />
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      ['题库题量', problemBank.totalProblems],
                      ['画像知识点', allConcepts.length],
                      ['scenes', scenes.length],
                      ['错题信号', problemBank.wrongProblems.length],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                      >
                        <div className="text-xs font-medium text-slate-500">{label}</div>
                        <div className="mt-1 text-2xl font-semibold tracking-normal">{value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <h3 className="text-sm font-semibold text-slate-950">知识点画像</h3>
                      <div className="mt-3 grid gap-2 text-sm leading-6">
                        {[
                          ['已掌握', problemBank.masteredConcepts],
                          ['薄弱', problemBank.weakConcepts],
                          ['未尝试', problemBank.untriedConcepts],
                          ['题量偏薄', problemBank.thinConcepts],
                          ['缺题', problemBank.missingConcepts],
                        ].map(([label, items]) => (
                          <div key={label as string} className="rounded-lg bg-slate-50 p-3">
                            <div className="text-xs font-semibold text-slate-500">
                              {label as string}
                            </div>
                            <div className="mt-1 text-slate-700">
                              {(items as string[]).join('、') || '暂无'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <h3 className="text-sm font-semibold text-slate-950">场景切片</h3>
                      <div className="mt-3 grid gap-2">
                        {scenes.slice(0, 8).map((scene) => (
                          <div
                            key={scene.id}
                            className="rounded-lg border border-slate-100 bg-slate-50 p-3"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-slate-900">
                                {scene.order}. {scene.title}
                              </span>
                              <Badge variant="outline" className="rounded-md">
                                {scene.quizQuestions.length} 题
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs leading-5 text-slate-500">
                              {scene.quizQuestions[0] || '缺题专题：正式生成时需要标注先补题。'}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                      查看正式 API Payload
                    </summary>
                    <pre className="mt-3 max-h-[360px] overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-100">
                      {compactJson(payload)}
                    </pre>
                  </details>
                </div>
              </StepShell>
            ) : null}

            {selectedStepId === 'readiness' ? (
              <StepShell
                id="readiness"
                state={stepStates.readiness}
                actionLabel={assessment ? '重新体检题库' : '体检题库'}
                actionDisabled={isRunning || !problemBankPassed}
                onAction={() => void handleAssess()}
              >
                <div className="grid gap-5">
                  {assessmentStarted ? (
                    <GateCheckList checks={assessmentChecks} />
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                      先确认 Step 2
                      通过，然后点击“体检题库”。这一步只判断题库是否够开图，不直接生成复习路线。
                    </div>
                  )}

                  {assessment ? (
                    <section className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            {assessment.ready ? (
                              <CheckCircle2 className="size-5 text-emerald-600" />
                            ) : (
                              <AlertTriangle className="size-5 text-amber-600" />
                            )}
                            <h3 className="text-base font-semibold tracking-normal">
                              题库体检结果
                            </h3>
                          </div>
                          <p className="mt-1 text-sm leading-6 text-slate-600">
                            {assessment.teacherLine || 'AI 已返回题库体检结果。'}
                          </p>
                        </div>
                        <Badge
                          variant={assessment.ready ? 'secondary' : 'outline'}
                          className="rounded-md"
                        >
                          {assessment.currentProblemCount}/{assessment.requiredProblemCount} 题
                        </Badge>
                      </div>

                      <div className="mt-4">
                        <Progress value={readinessPercent} />
                      </div>
                      <div className="mt-4 grid gap-3 lg:grid-cols-3">
                        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <div className="text-xs font-medium text-slate-500">缺题专题</div>
                          <p className="mt-1 text-sm leading-6 text-slate-700">
                            {assessment.missingConcepts.join('、') || '暂无'}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <div className="text-xs font-medium text-slate-500">偏薄专题</div>
                          <p className="mt-1 text-sm leading-6 text-slate-700">
                            {assessment.thinConcepts.join('、') || '暂无'}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <div className="text-xs font-medium text-slate-500">原因</div>
                          <p className="mt-1 text-sm leading-6 text-slate-700">
                            {assessment.reasons.join('；') || '可以进入路线生成'}
                          </p>
                        </div>
                      </div>
                    </section>
                  ) : null}
                </div>
              </StepShell>
            ) : null}

            {selectedStepId === 'review-plan' ? (
              <StepShell
                id="review-plan"
                state={stepStates['review-plan']}
                actionLabel={route ? '重新生成复习计划' : '生成复习计划'}
                actionDisabled={isRunning || !problemBankPassed}
                onAction={() => void handleGenerate()}
              >
                <div className="grid gap-5">
                  {routeStarted ? (
                    <GateCheckList checks={routeChecks} />
                  ) : (
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm leading-6 text-indigo-900">
                      Step 1 和 Step 2 通过后，可以直接生成复习计划；Step 3
                      的题库体检会作为旁路证据保留。
                    </div>
                  )}

                  {route ? (
                    <section className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold tracking-normal">{route.title}</h3>
                          <p className="mt-1 text-sm leading-6 text-slate-600">
                            {route.teacherLine}
                          </p>
                          <p className="mt-2 text-xs leading-5 text-slate-500">
                            {route.coverageContract}
                          </p>
                        </div>
                        <Badge variant="secondary" className="rounded-md">
                          {metrics.layerCount} 层 · {metrics.questionNodeCount} 做题关 · +
                          {metrics.rewardPoints}
                        </Badge>
                      </div>

                      <div className="mt-4 grid gap-3">
                        {route.layers.map((layer, layerIndex) => (
                          <div key={layer.id} className="grid gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="rounded-md">
                                第 {layerIndex + 1} 层
                              </Badge>
                              <h4 className="text-sm font-semibold tracking-normal">
                                {layer.title}
                              </h4>
                              <span className="text-xs text-slate-500">{layer.summary}</span>
                            </div>
                            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                              {layer.nodes.map((node) => (
                                <div
                                  key={node.id}
                                  className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <h5 className="min-w-0 text-sm font-semibold tracking-normal text-slate-950">
                                      {node.title}
                                    </h5>
                                    <span
                                      className={cn(
                                        'rounded-md border px-2 py-0.5 text-xs font-semibold',
                                        nodeKindClassName(node.kind),
                                      )}
                                    >
                                      {nodeKindLabel(node.kind)}
                                    </span>
                                  </div>
                                  <p className="mt-2 text-xs leading-5 text-slate-600">
                                    {node.personalReason || node.checkGoal}
                                  </p>
                                  <div className="mt-3 flex flex-wrap gap-1.5">
                                    {node.knowledgePoints.slice(0, 4).map((point) => (
                                      <Badge
                                        key={point}
                                        variant="outline"
                                        className="rounded-md bg-white"
                                      >
                                        {point}
                                      </Badge>
                                    ))}
                                  </div>
                                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                                    <div>
                                      <div className="text-slate-400">题量</div>
                                      <div className="font-semibold text-slate-900">
                                        {node.questionCount}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-slate-400">难度</div>
                                      <div className="font-semibold text-slate-900">
                                        {node.difficulty}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-slate-400">奖励</div>
                                      <div className="font-semibold text-slate-900">
                                        +{node.rewardPoints}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                      查看 route JSON
                    </summary>
                    <pre className="mt-3 max-h-[420px] overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-100">
                      {compactJson(route || { waiting: '点击生成复习计划后显示 ReviewRoute。' })}
                    </pre>
                  </details>
                </div>
              </StepShell>
            ) : null}
          </div>
        </section>

        <section className="hidden">
          <div className="grid gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <BrainCircuit className="size-5 text-slate-500" />
                <h2 className="text-base font-semibold tracking-normal">测试画像</h2>
              </div>

              <div className="mt-4 grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="review-mode">预设模式</Label>
                  <Select value={mode} onValueChange={(value) => applyPreset(value as ReviewMode)}>
                    <SelectTrigger id="review-mode" className="w-full bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(PRESETS).map((preset) => (
                        <SelectItem key={preset.id} value={preset.id}>
                          {preset.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs leading-5 text-slate-500">{activePreset.description}</p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="notebook-name">Notebook 名称</Label>
                  <Input
                    id="notebook-name"
                    value={notebookName}
                    onChange={(event) => setNotebookName(event.target.value)}
                    placeholder="输入测试 notebook 名称"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="review-goal">学生目标</Label>
                  <Textarea
                    id="review-goal"
                    value={goal}
                    onChange={(event) => setGoal(event.target.value)}
                    className="min-h-24"
                  />
                </div>

                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="review-intensity">复习强度</Label>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                      {intensity}/5
                    </span>
                  </div>
                  <Slider
                    id="review-intensity"
                    value={[intensity]}
                    min={1}
                    max={5}
                    step={1}
                    onValueChange={(value) => setIntensity(value[0] ?? 3)}
                  />
                </div>

                <div className="grid gap-3 rounded-md border border-slate-100 bg-slate-50 p-3">
                  <label className="flex items-start gap-3 text-sm leading-5 text-slate-600">
                    <Checkbox
                      checked={includeSupportNodes}
                      onCheckedChange={(value) => setIncludeSupportNodes(value === true)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-semibold text-slate-900">保留补给节点</span>
                      <span className="block text-xs text-slate-500">
                        在 prompt 中要求营火、宝箱、事件或商店参与节奏测试。
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-3 text-sm leading-5 text-slate-600">
                    <Checkbox
                      checked={forceBossMix}
                      onCheckedChange={(value) => setForceBossMix(value === true)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-semibold text-slate-900">强制综合 Boss</span>
                      <span className="block text-xs text-slate-500">
                        在描述中声明最终 Boss 必须混合多个知识点。
                      </span>
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <Target className="size-5 text-slate-500" />
                <h2 className="text-base font-semibold tracking-normal">知识点画像</h2>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                每行一个知识点。测试页会据此合成 problemBank 和 scenes payload。
              </p>

              <div className="mt-4 grid gap-3">
                {[
                  ['已掌握', masteredConcepts, setMasteredConcepts],
                  ['薄弱', weakConcepts, setWeakConcepts],
                  ['未尝试', untriedConcepts, setUntriedConcepts],
                  ['题量偏薄', thinConcepts, setThinConcepts],
                  ['缺题', missingConcepts, setMissingConcepts],
                ].map(([label, value, setter]) => (
                  <div key={label as string} className="grid gap-1.5">
                    <Label>{label as string}</Label>
                    <Textarea
                      value={value as string}
                      onChange={(event) => (setter as (next: string) => void)(event.target.value)}
                      className="min-h-20"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <Sparkles className="size-5 text-slate-500" />
                <h2 className="text-base font-semibold tracking-normal">个性化约束</h2>
              </div>
              <div className="mt-4 grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="weak-points">学生已记录薄弱点</Label>
                  <Textarea
                    id="weak-points"
                    value={weakPoints}
                    onChange={(event) => setWeakPoints(event.target.value)}
                    className="min-h-24"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="custom-rules">额外测试规则</Label>
                  <Textarea
                    id="custom-rules"
                    value={customRules}
                    onChange={(event) => setCustomRules(event.target.value)}
                    className="min-h-20"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <Route className="size-5 text-slate-500" />
                    <h2 className="text-base font-semibold tracking-normal">运行控制</h2>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    先体检题库可以单独检查 readiness；直接生成会绕过体检，适合观察路线 prompt
                    对定制输入的响应。
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAssess}
                    disabled={isRunning}
                  >
                    {phase === 'assessing' ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RefreshCw className="size-4" />
                    )}
                    体检题库
                  </Button>
                  <Button type="button" onClick={handleGenerate} disabled={isRunning}>
                    {phase === 'generating' ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Play className="size-4" />
                    )}
                    生成路线
                  </Button>
                </div>
              </div>

              {errorMessage ? (
                <div className="mt-4 flex gap-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-700">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              ) : null}

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
                  <div className="text-xs font-medium text-slate-500">题库题量</div>
                  <div className="mt-1 text-2xl font-semibold tracking-normal">
                    {problemBank.totalProblems}
                  </div>
                </div>
                <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
                  <div className="text-xs font-medium text-slate-500">知识点</div>
                  <div className="mt-1 text-2xl font-semibold tracking-normal">
                    {allConcepts.length}
                  </div>
                </div>
                <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
                  <div className="text-xs font-medium text-slate-500">路线节点</div>
                  <div className="mt-1 text-2xl font-semibold tracking-normal">
                    {metrics.nodeCount}
                  </div>
                </div>
                <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
                  <div className="text-xs font-medium text-slate-500">奖励积分</div>
                  <div className="mt-1 text-2xl font-semibold tracking-normal">
                    {metrics.rewardPoints}
                  </div>
                </div>
              </div>
            </div>

            {assessment ? (
              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      {assessment.ready ? (
                        <CheckCircle2 className="size-5 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="size-5 text-amber-600" />
                      )}
                      <h2 className="text-base font-semibold tracking-normal">题库体检结果</h2>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {assessment.teacherLine || 'AI 已返回题库体检结果。'}
                    </p>
                  </div>
                  <Badge
                    variant={assessment.ready ? 'secondary' : 'outline'}
                    className="rounded-md"
                  >
                    {assessment.currentProblemCount}/{assessment.requiredProblemCount} 题
                  </Badge>
                </div>

                <div className="mt-4">
                  <Progress value={readinessPercent} />
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-3">
                  <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
                    <div className="text-xs font-medium text-slate-500">缺题专题</div>
                    <p className="mt-1 text-sm leading-6 text-slate-700">
                      {assessment.missingConcepts.join('、') || '暂无'}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
                    <div className="text-xs font-medium text-slate-500">偏薄专题</div>
                    <p className="mt-1 text-sm leading-6 text-slate-700">
                      {assessment.thinConcepts.join('、') || '暂无'}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
                    <div className="text-xs font-medium text-slate-500">原因</div>
                    <p className="mt-1 text-sm leading-6 text-slate-700">
                      {assessment.reasons.join('；') || '可以进入路线生成'}
                    </p>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <MapIcon className="size-5 text-slate-500" />
                  <h2 className="text-base font-semibold tracking-normal">路线预览</h2>
                </div>
                {route ? (
                  <Badge variant="secondary" className="rounded-md">
                    {metrics.layerCount} 层 · {metrics.questionNodeCount} 做题关
                  </Badge>
                ) : null}
              </div>

              {route ? (
                <div className="mt-4 grid gap-4">
                  <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
                    <h3 className="text-lg font-semibold tracking-normal">{route.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{route.teacherLine}</p>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      {route.coverageContract}
                    </p>
                  </div>

                  <div className="grid gap-3">
                    {route.layers.map((layer, layerIndex) => (
                      <div key={layer.id} className="grid gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="rounded-md">
                            第 {layerIndex + 1} 层
                          </Badge>
                          <h3 className="text-sm font-semibold tracking-normal">{layer.title}</h3>
                          <span className="text-xs text-slate-500">{layer.summary}</span>
                        </div>
                        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {layer.nodes.map((node) => (
                            <div
                              key={node.id}
                              className="rounded-md border border-slate-200 bg-white p-3 shadow-sm"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <h4 className="min-w-0 text-sm font-semibold tracking-normal text-slate-950">
                                  {node.title}
                                </h4>
                                <span
                                  className={cn(
                                    'rounded-md border px-2 py-0.5 text-xs font-semibold',
                                    nodeKindClassName(node.kind),
                                  )}
                                >
                                  {nodeKindLabel(node.kind)}
                                </span>
                              </div>
                              <p className="mt-2 text-xs leading-5 text-slate-600">
                                {node.personalReason || node.checkGoal}
                              </p>
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                {node.knowledgePoints.slice(0, 4).map((point) => (
                                  <Badge key={point} variant="outline" className="rounded-md">
                                    {point}
                                  </Badge>
                                ))}
                              </div>
                              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                                <div>
                                  <div className="text-slate-400">题量</div>
                                  <div className="font-semibold text-slate-900">
                                    {node.questionCount}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-slate-400">难度</div>
                                  <div className="font-semibold text-slate-900">
                                    {node.difficulty}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-slate-400">奖励</div>
                                  <div className="font-semibold text-slate-900">
                                    +{node.rewardPoints}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm leading-6 text-slate-500">
                  点击“生成路线”后，这里会展示 AI 返回的复习地图结构。
                </div>
              )}
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <FileJson className="size-5 text-slate-500" />
                <h2 className="text-base font-semibold tracking-normal">请求 Payload</h2>
              </div>
              <pre className="mt-4 max-h-[420px] overflow-auto rounded-md border border-slate-100 bg-slate-950 p-4 text-xs leading-5 text-slate-100">
                {compactJson(payload)}
              </pre>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
