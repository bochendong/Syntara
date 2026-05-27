import type { ReviewRoute, ReviewRouteNode } from '@/lib/learning/review-route-types';

import { REVIEW_SCENARIOS } from './fixtures';
import { isAiSupplementProblem, splitLines } from './logic';
import type {
  AiProblemBankReadiness,
  GeneratePayload,
  PipelineCheck,
  PipelineStepState,
  PrivateMemoryPayload,
  ReviewFormState,
  ReviewHistoryPayload,
} from './types';

export function makeCheck(
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

export function hasBlockingFailure(checks: PipelineCheck[]): boolean {
  return checks.some((check) => check.status === 'fail');
}

export function checksToStepState(checks: PipelineCheck[]): PipelineStepState {
  if (checks.some((check) => check.status === 'fail')) return 'fail';
  if (checks.some((check) => check.status === 'warn')) return 'warn';
  return 'pass';
}

export function collectRouteNodes(route: ReviewRoute | null): ReviewRouteNode[] {
  return route?.layers.flatMap((layer) => layer.nodes) || [];
}

export function containsForbiddenStudyTask(text: string): boolean {
  return /(看课|听课|阅读讲义|学习视频|视频学习|watch\s+video|read\s+lecture)/i.test(text);
}

export function evaluateProfile(
  form: ReviewFormState,
  privateMemory: PrivateMemoryPayload[] = [],
  reviewHistory: ReviewHistoryPayload[] = [],
): PipelineCheck[] {
  const scenario = REVIEW_SCENARIOS[form.scenarioId] || REVIEW_SCENARIOS['known-memory'];
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
    makeCheck(
      'profile-private-memory',
      scenario.memoryMode === 'none' ? 'Cold start 无私人记忆' : 'Notebook 私人记忆已注入',
      scenario.memoryMode === 'none'
        ? privateMemory.length === 0
        : privateMemory.some((item) => item.status === 'open'),
      scenario.memoryMode === 'none'
        ? `privateMemory=${privateMemory.length}，按“${scenario.title}”场景允许为空。`
        : `open memory=${privateMemory.filter((item) => item.status === 'open').length}，reviewed=${
            privateMemory.filter((item) => item.status === 'reviewed').length
          }。`,
    ),
    makeCheck(
      'profile-review-history',
      scenario.memoryMode === 'none' ? 'Cold start 无历史记录' : '历史复习记录已注入',
      scenario.memoryMode === 'none' ? reviewHistory.length === 0 : reviewHistory.length >= 1,
      scenario.memoryMode === 'none'
        ? `history=${reviewHistory.length}，按“${scenario.title}”场景允许为空。`
        : `history=${reviewHistory.length} 轮。`,
      true,
    ),
  ];
}

export function evaluateProblemBank(payload: GeneratePayload): PipelineCheck[] {
  const concepts = new Set([
    ...payload.problemBank.masteredConcepts,
    ...payload.problemBank.weakConcepts,
    ...payload.problemBank.untriedConcepts,
    ...payload.problemBank.thinConcepts,
    ...payload.problemBank.missingConcepts,
  ]);
  const sceneConcepts = new Set(payload.scenes.map((scene) => scene.title));
  const scenesWithoutQuestions = payload.scenes.filter((scene) => scene.quizQuestions.length === 0);
  const candidateConcepts = new Set(
    payload.candidateProblems.flatMap((problem) => problem.concepts),
  );
  const selectedWrongProblems = payload.candidateProblems.filter((problem) =>
    ['failed', 'partial', 'error'].includes(problem.status),
  );
  const selectedSupplementProblems = payload.candidateProblems.filter(isAiSupplementProblem);
  const hasRepairSignal =
    selectedWrongProblems.length >= 2 || selectedSupplementProblems.length >= 1;
  const selectedTypes = new Set(payload.candidateProblems.map((problem) => problem.type));
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
      '错题/补题信号已合成',
      payload.problemBank.wrongProblems.length >= 1 || selectedSupplementProblems.length >= 1,
      `wrongProblems=${payload.problemBank.wrongProblems.length}，aiSupplement=${selectedSupplementProblems.length}。`,
      true,
    ),
    makeCheck(
      'bank-candidate-problems',
      '候选题已从结构化题目中选出',
      payload.candidateProblems.length >= 6,
      `selectedCandidates=${payload.candidateProblems.length}，types=${Array.from(selectedTypes).join('/') || 'none'}。`,
    ),
    makeCheck(
      'bank-candidate-coverage',
      '候选题覆盖画像概念',
      Array.from(candidateConcepts).filter((concept) => concepts.has(concept)).length >=
        Math.min(4, concepts.size),
      `candidateConcepts=${Array.from(candidateConcepts).filter((concept) => concepts.has(concept)).length}/${concepts.size}。`,
    ),
    makeCheck(
      'bank-candidate-wrong',
      '候选题包含错题或 AI 补题',
      hasRepairSignal,
      `selectedWrong=${selectedWrongProblems.length}，aiSupplement=${selectedSupplementProblems.length}。`,
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

export function evaluateAssessment(
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

export function evaluateReviewPlan(
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
  const candidateProblemIds = new Set(payload.candidateProblems.map((problem) => problem.id));
  const referencedProblemIds = Array.from(
    new Set(questionNodes.flatMap((node) => node.problemIds || [])),
  ).filter((problemId) => candidateProblemIds.has(problemId));
  const openMemoryConcepts = new Set(
    payload.privateMemory.filter((item) => item.status === 'open').map((item) => item.concept),
  );
  const coveredMemoryConcepts = Array.from(openMemoryConcepts).filter((point) =>
    plannedConcepts.has(point),
  );
  const failedHistoryConcepts = new Set(
    payload.reviewHistory.flatMap((item) => item.failedConcepts),
  );
  const coveredHistoryRepairs = Array.from(failedHistoryConcepts).filter((point) =>
    plannedConcepts.has(point),
  );
  const personalizedNodes = questionNodes.filter((node) =>
    /(private_memory|review_history|candidate_problem|weak_point|wrong_problem|untried_concept|thin_bank|mastered_review|boss_mix)/.test(
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
      'review-plan-candidate-problem-ids',
      '题目节点引用候选题',
      payload.candidateProblems.length === 0 ||
        referencedProblemIds.length >= Math.min(3, payload.candidateProblems.length),
      `referencedProblemIds=${referencedProblemIds.length}/${payload.candidateProblems.length}。`,
    ),
    makeCheck(
      'review-plan-private-memory',
      '覆盖 open 私人记忆',
      openMemoryConcepts.size === 0 ||
        coveredMemoryConcepts.length >= Math.min(openMemoryConcepts.size, 2),
      `coveredOpenMemory=${coveredMemoryConcepts.length}/${openMemoryConcepts.size}。`,
    ),
    makeCheck(
      'review-plan-history-repair',
      '覆盖历史复习失败点',
      failedHistoryConcepts.size === 0 ||
        coveredHistoryRepairs.length >= Math.min(failedHistoryConcepts.size, 2),
      `coveredFailedHistory=${coveredHistoryRepairs.length}/${failedHistoryConcepts.size}。`,
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
