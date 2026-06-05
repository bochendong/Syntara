import type { ProblemBankLearningProfile } from '@/lib/learning/problem-bank-profile';
import {
  reviewRouteSchema,
  type ReviewRoute,
  type ReviewRouteNode,
} from '@/lib/learning/review-route-types';
import type { ReviewRouteCandidateProblem } from './problem-bank-routing';

export const REVIEW_ROUTE_MODE_VALUES = ['wrong', 'comprehensive', 'ai'] as const;
export type ReviewRouteMode = (typeof REVIEW_ROUTE_MODE_VALUES)[number];
export type LocalReviewRouteMode = Exclude<ReviewRouteMode, 'ai'>;

export const MIN_WRONG_REVIEW_PROBLEMS = 5;
export const MIN_TEMPLATE_REVIEW_PROBLEMS = 5;
export const MAX_TEMPLATE_REVIEW_PROBLEMS = 10;

type TemplateNode = Pick<
  ReviewRouteNode,
  | 'id'
  | 'title'
  | 'kind'
  | 'difficulty'
  | 'questionCount'
  | 'requiresQuestion'
  | 'rewardKind'
  | 'rewardPoints'
  | 'rewardPreview'
  | 'eventOptions'
>;

export type ReviewRouteTemplate = {
  id: string;
  name: string;
  summary: string;
  bestFor: ReviewRouteMode[];
  layers: Array<{
    id: string;
    title: string;
    summary: string;
    nodes: TemplateNode[];
  }>;
};

type ReviewModeAvailability = {
  available: boolean;
  requiredProblemCount: number;
  currentProblemCount: number;
  reason: string;
};

const SUPPORT_KINDS = new Set<ReviewRouteNode['kind']>(['camp', 'treasure', 'event', 'shop']);

export const REVIEW_ROUTE_TEMPLATES: ReviewRouteTemplate[] = [
  {
    id: 'five-step-climb',
    name: '五阶小登顶',
    summary: '最短路线，先稳基础，再打一场小 Boss。',
    bestFor: ['wrong', 'comprehensive'],
    layers: [
      {
        id: 'layer-1',
        title: '起手层',
        summary: '先用低压题把手感找回来。',
        nodes: [
          questionNode('node-1-a', '入口火花', 'normal', 'easy', 1, 14),
          questionNode('node-1-b', '基础岔路', 'normal', 'easy', 1, 14),
        ],
      },
      {
        id: 'layer-2',
        title: '校准层',
        summary: '把一个关键小点重新校准。',
        nodes: [questionNode('node-2-a', '关键转轴', 'normal', 'medium', 1, 18)],
      },
      {
        id: 'layer-3',
        title: '补给层',
        summary: '给后面的难题留一点容错。',
        nodes: [supportNode('node-3-a', '粉笔营火', 'camp', 'easy', 'forgiveness', 10)],
      },
      {
        id: 'layer-4',
        title: '加压层',
        summary: '进入更综合的题目。',
        nodes: [questionNode('node-4-a', '变式栈桥', 'elite', 'medium', 1, 30)],
      },
      {
        id: 'layer-5',
        title: '首领层',
        summary: '最后用两题收束本轮复习。',
        nodes: [questionNode('node-5-boss', '终点回声', 'boss', 'hard', 2, 78)],
      },
    ],
  },
  {
    id: 'wrong-ring',
    name: '错题回炉环',
    summary: '适合错题复盘，前面分散捡错点，后面合并。',
    bestFor: ['wrong'],
    layers: [
      {
        id: 'layer-1',
        title: '拆错层',
        summary: '先把错题拆成两个入口。',
        nodes: [
          questionNode('node-1-a', '旧坑左线', 'normal', 'easy', 1, 14),
          questionNode('node-1-b', '旧坑右线', 'normal', 'easy', 1, 14),
        ],
      },
      {
        id: 'layer-2',
        title: '回温层',
        summary: '错题复盘后给一点整理空间。',
        nodes: [supportNode('node-2-a', '订正营火', 'camp', 'easy', 'card_upgrade', 12)],
      },
      {
        id: 'layer-3',
        title: '重打层',
        summary: '用两题确认错因已经处理掉。',
        nodes: [questionNode('node-3-a', '错因回马枪', 'elite', 'medium', 2, 34)],
      },
      {
        id: 'layer-4',
        title: '首领层',
        summary: '把错题相关概念合成一关。',
        nodes: [questionNode('node-4-boss', '回炉守门人', 'boss', 'hard', 2, 80)],
      },
    ],
  },
  {
    id: 'concept-sweep',
    name: '专题扫图',
    summary: '适合全面复习，尽量让不同专题都有出现。',
    bestFor: ['comprehensive', 'ai'],
    layers: [
      {
        id: 'layer-1',
        title: '铺底层',
        summary: '从两个基础专题起步。',
        nodes: [
          questionNode('node-1-a', '符号起跑线', 'normal', 'easy', 1, 14),
          questionNode('node-1-b', '概念试金石', 'normal', 'easy', 1, 14),
        ],
      },
      {
        id: 'layer-2',
        title: '扩面层',
        summary: '补上另一个常见专题。',
        nodes: [questionNode('node-2-a', '横向扫描', 'normal', 'medium', 2, 20)],
      },
      {
        id: 'layer-3',
        title: '奖励层',
        summary: '中段给一次奖励或卡牌。',
        nodes: [supportNode('node-3-a', '题感宝箱', 'treasure', 'medium', 'run_card', 22)],
      },
      {
        id: 'layer-4',
        title: '综合层',
        summary: '把多个专题放在同一个压力点。',
        nodes: [questionNode('node-4-a', '综合齿轮', 'elite', 'medium', 2, 36)],
      },
      {
        id: 'layer-5',
        title: '首领层',
        summary: '最后检查本轮覆盖面。',
        nodes: [questionNode('node-5-boss', '全景守门', 'boss', 'hard', 2, 82)],
      },
    ],
  },
  {
    id: 'thin-bank-bridge',
    name: '薄弱桥',
    summary: '适合题量偏薄或未尝试专题，先补覆盖，再收束。',
    bestFor: ['comprehensive', 'ai'],
    layers: [
      {
        id: 'layer-1',
        title: '桥头层',
        summary: '用简单题确认入口。',
        nodes: [questionNode('node-1-a', '桥头小试', 'normal', 'easy', 2, 16)],
      },
      {
        id: 'layer-2',
        title: '拓展层',
        summary: '换一个专题或题型。',
        nodes: [
          questionNode('node-2-a', '窄桥左栏', 'normal', 'medium', 1, 18),
          questionNode('node-2-b', '窄桥右栏', 'normal', 'medium', 1, 18),
        ],
      },
      {
        id: 'layer-3',
        title: '选择层',
        summary: '用一次事件调整收益。',
        nodes: [
          supportNode('node-3-a', '手感事件', 'event', 'medium', 'multiplier', 18, [
            {
              label: '冲一题难题',
              effect: '下一题答对获得更高奖励',
              tradeoff: '答错会失去当前倍率',
              rewardPreview: '倍率 +0.2',
            },
            {
              label: '稳住节奏',
              effect: '保留容错进入下一关',
              tradeoff: '本层奖励较少',
              rewardPreview: '稳定推进',
            },
          ]),
        ],
      },
      {
        id: 'layer-4',
        title: '压轴层',
        summary: '用综合题收束。',
        nodes: [questionNode('node-4-boss', '桥尾压轴', 'boss', 'hard', 3, 86)],
      },
    ],
  },
  {
    id: 'easy-medium-hard',
    name: '三段变速',
    summary: '明显从易到难，适合想快速看状态。',
    bestFor: ['wrong', 'comprehensive', 'ai'],
    layers: [
      {
        id: 'layer-1',
        title: '低速层',
        summary: '用基础题开局。',
        nodes: [questionNode('node-1-a', '低速热身', 'normal', 'easy', 2, 16)],
      },
      {
        id: 'layer-2',
        title: '中速层',
        summary: '进入标准难度。',
        nodes: [questionNode('node-2-a', '中速弯道', 'normal', 'medium', 2, 22)],
      },
      {
        id: 'layer-3',
        title: '补给层',
        summary: '在冲刺前拿一次补给。',
        nodes: [supportNode('node-3-a', '短休营火', 'camp', 'medium', 'forgiveness', 12)],
      },
      {
        id: 'layer-4',
        title: '高速层',
        summary: '进入高压题。',
        nodes: [questionNode('node-4-a', '高速压线', 'elite', 'hard', 2, 40)],
      },
      {
        id: 'layer-5',
        title: '首领层',
        summary: '最后冲关。',
        nodes: [questionNode('node-5-boss', '终局加速带', 'boss', 'hard', 2, 84)],
      },
    ],
  },
  {
    id: 'fork-and-merge',
    name: '分岔合流',
    summary: '前半段给两个方向，后半段合流到综合题。',
    bestFor: ['comprehensive', 'ai'],
    layers: [
      {
        id: 'layer-1',
        title: '双入口层',
        summary: '两个基础方向同时打开。',
        nodes: [
          questionNode('node-1-a', '左手入口', 'normal', 'easy', 1, 14),
          questionNode('node-1-b', '右手入口', 'normal', 'easy', 1, 14),
        ],
      },
      {
        id: 'layer-2',
        title: '推进层',
        summary: '把其中一条线推进到中等难度。',
        nodes: [questionNode('node-2-a', '合流前哨', 'normal', 'medium', 2, 22)],
      },
      {
        id: 'layer-3',
        title: '商店层',
        summary: '给提示或容错资源。',
        nodes: [supportNode('node-3-a', '小小商店', 'shop', 'medium', 'hint_card', 6)],
      },
      {
        id: 'layer-4',
        title: '合流层',
        summary: '用精英关合并两个方向。',
        nodes: [questionNode('node-4-a', '合流闸门', 'elite', 'hard', 2, 40)],
      },
      {
        id: 'layer-5',
        title: '首领层',
        summary: '最终合题。',
        nodes: [questionNode('node-5-boss', '汇点首领', 'boss', 'hard', 2, 84)],
      },
    ],
  },
  {
    id: 'wrong-first-boss',
    name: '错题先行',
    summary: '把错题放在前面，后面逐步提高综合度。',
    bestFor: ['wrong', 'ai'],
    layers: [
      {
        id: 'layer-1',
        title: '错题入口',
        summary: '先碰最需要订正的题。',
        nodes: [questionNode('node-1-a', '旧错第一刀', 'normal', 'easy', 2, 16)],
      },
      {
        id: 'layer-2',
        title: '变式层',
        summary: '马上用变式确认不是记答案。',
        nodes: [questionNode('node-2-a', '变式折返', 'elite', 'medium', 2, 34)],
      },
      {
        id: 'layer-3',
        title: '奖励层',
        summary: '变式后给一点奖励。',
        nodes: [supportNode('node-3-a', '订正宝箱', 'treasure', 'medium', 'reward_coin', 24)],
      },
      {
        id: 'layer-4',
        title: '首领层',
        summary: '用综合题看错因有没有真的消失。',
        nodes: [questionNode('node-4-boss', '旧错终审', 'boss', 'hard', 2, 86)],
      },
    ],
  },
  {
    id: 'wide-net',
    name: '宽网抽样',
    summary: '抽样更多专题，每个专题题量较轻。',
    bestFor: ['comprehensive'],
    layers: [
      {
        id: 'layer-1',
        title: '宽网一层',
        summary: '先拉开覆盖面。',
        nodes: [
          questionNode('node-1-a', '第一网眼', 'normal', 'easy', 1, 14),
          questionNode('node-1-b', '第二网眼', 'normal', 'easy', 1, 14),
          questionNode('node-1-c', '第三网眼', 'normal', 'easy', 1, 14),
        ],
      },
      {
        id: 'layer-2',
        title: '宽网二层',
        summary: '继续补不同专题。',
        nodes: [
          questionNode('node-2-a', '第四网眼', 'normal', 'medium', 1, 18),
          questionNode('node-2-b', '第五网眼', 'normal', 'medium', 1, 18),
        ],
      },
      {
        id: 'layer-3',
        title: '整理层',
        summary: '中间整理一下。',
        nodes: [supportNode('node-3-a', '网结营火', 'camp', 'medium', 'card_upgrade', 12)],
      },
      {
        id: 'layer-4',
        title: '首领层',
        summary: '用综合题把宽网收紧。',
        nodes: [questionNode('node-4-boss', '宽网收束', 'boss', 'hard', 3, 88)],
      },
    ],
  },
  {
    id: 'boss-ladder',
    name: '首领阶梯',
    summary: '题量稍多，适合题库充足时完整打一轮。',
    bestFor: ['comprehensive', 'ai'],
    layers: [
      {
        id: 'layer-1',
        title: '一级阶梯',
        summary: '基础入口。',
        nodes: [questionNode('node-1-a', '第一阶', 'normal', 'easy', 2, 16)],
      },
      {
        id: 'layer-2',
        title: '二级阶梯',
        summary: '标准题推进。',
        nodes: [questionNode('node-2-a', '第二阶', 'normal', 'medium', 2, 22)],
      },
      {
        id: 'layer-3',
        title: '奖励阶梯',
        summary: '拿一份局内资源。',
        nodes: [supportNode('node-3-a', '阶间宝箱', 'treasure', 'medium', 'relic_shard', 26)],
      },
      {
        id: 'layer-4',
        title: '三级阶梯',
        summary: '难题前的精英关。',
        nodes: [questionNode('node-4-a', '第三阶', 'elite', 'hard', 2, 40)],
      },
      {
        id: 'layer-5',
        title: '首领层',
        summary: '三题终局。',
        nodes: [questionNode('node-5-boss', '阶顶首领', 'boss', 'hard', 3, 92)],
      },
    ],
  },
  {
    id: 'ai-focus-sprint',
    name: '针对冲刺',
    summary: '给 AI 选题使用，短路线但强调薄弱点命中。',
    bestFor: ['ai', 'wrong'],
    layers: [
      {
        id: 'layer-1',
        title: '命中层',
        summary: '先命中最值得复习的点。',
        nodes: [questionNode('node-1-a', '靶心第一响', 'normal', 'easy', 2, 16)],
      },
      {
        id: 'layer-2',
        title: '追问层',
        summary: '换角度继续追问。',
        nodes: [
          questionNode('node-2-a', '左侧追问', 'normal', 'medium', 1, 18),
          questionNode('node-2-b', '右侧追问', 'normal', 'medium', 1, 18),
        ],
      },
      {
        id: 'layer-3',
        title: '选择层',
        summary: '允许根据手感选择冲刺方式。',
        nodes: [
          supportNode('node-3-a', '冲刺事件', 'event', 'medium', 'multiplier', 18, [
            {
              label: '挑战更难变式',
              effect: '下一关答对时奖励更高',
              tradeoff: '答错失去本轮倍率',
              rewardPreview: '倍率 +0.2',
            },
            {
              label: '保守推进',
              effect: '保留容错进入 Boss',
              tradeoff: '奖励较低',
              rewardPreview: '获得提示卡',
            },
          ]),
        ],
      },
      {
        id: 'layer-4',
        title: '首领层',
        summary: '把 AI 选出的薄弱点合成最终关。',
        nodes: [questionNode('node-4-boss', '靶心首领', 'boss', 'hard', 3, 90)],
      },
    ],
  },
];

function questionNode(
  id: string,
  title: string,
  kind: Extract<ReviewRouteNode['kind'], 'normal' | 'elite' | 'boss'>,
  difficulty: ReviewRouteNode['difficulty'],
  questionCount: number,
  rewardPoints: number,
): TemplateNode {
  return {
    id,
    title,
    kind,
    difficulty,
    questionCount,
    requiresQuestion: true,
    rewardKind: 'none',
    rewardPoints,
    rewardPreview: `通关 +${rewardPoints} 奖励积分`,
    eventOptions: [],
  };
}

function supportNode(
  id: string,
  title: string,
  kind: Extract<ReviewRouteNode['kind'], 'camp' | 'treasure' | 'event' | 'shop'>,
  difficulty: ReviewRouteNode['difficulty'],
  rewardKind: ReviewRouteNode['rewardKind'],
  rewardPoints: number,
  eventOptions: ReviewRouteNode['eventOptions'] = [],
): TemplateNode {
  return {
    id,
    title,
    kind,
    difficulty,
    questionCount: 0,
    requiresQuestion: false,
    rewardKind,
    rewardPoints,
    rewardPreview: `通关 +${rewardPoints} 奖励积分`,
    eventOptions,
  };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededNumber(seed: string): number {
  return hashString(seed) / 0xffffffff;
}

function seededShuffle<T>(items: T[], seed: string): T[] {
  return items
    .map((item, index) => ({ item, rank: seededNumber(`${seed}:${index}`) }))
    .sort((left, right) => left.rank - right.rank)
    .map(({ item }) => item);
}

function difficultyRank(value: ReviewRouteNode['difficulty']): number {
  if (value === 'hard') return 2;
  if (value === 'medium') return 1;
  return 0;
}

function isWrongCandidate(problem: ReviewRouteCandidateProblem): boolean {
  return problem.status === 'failed' || problem.status === 'partial' || problem.status === 'error';
}

function normalizeConcept(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 40);
}

function uniqueStrings(values: string[], maxItems: number): string[] {
  return Array.from(new Set(values.map(normalizeConcept).filter(Boolean))).slice(0, maxItems);
}

function primaryConcept(problem: ReviewRouteCandidateProblem): string {
  return normalizeConcept(problem.concepts[0] || problem.tags[0] || problem.title || '综合复习');
}

export function parseReviewRouteMode(value: string | null | undefined): ReviewRouteMode {
  return REVIEW_ROUTE_MODE_VALUES.includes(value as ReviewRouteMode)
    ? (value as ReviewRouteMode)
    : 'comprehensive';
}

export function getReviewRouteTemplateQuestionCount(template: ReviewRouteTemplate): number {
  return template.layers.reduce(
    (sum, layer) =>
      sum +
      layer.nodes.reduce(
        (nodeSum, node) => nodeSum + (node.requiresQuestion ? node.questionCount : 0),
        0,
      ),
    0,
  );
}

export function getReviewModeAvailability(args: {
  mode: ReviewRouteMode;
  profile: ProblemBankLearningProfile | null;
}): ReviewModeAvailability {
  const currentProblemCount =
    args.mode === 'wrong'
      ? (args.profile?.wrongProblems.length ?? 0)
      : (args.profile?.totalProblems ?? 0);
  const requiredProblemCount =
    args.mode === 'wrong' ? MIN_WRONG_REVIEW_PROBLEMS : MIN_TEMPLATE_REVIEW_PROBLEMS;

  if (!args.profile) {
    return {
      available: false,
      requiredProblemCount,
      currentProblemCount: 0,
      reason: '正在读取题库状态',
    };
  }
  if (currentProblemCount < requiredProblemCount) {
    return {
      available: false,
      requiredProblemCount,
      currentProblemCount,
      reason:
        args.mode === 'wrong'
          ? `错题不足 ${requiredProblemCount} 道，当前 ${currentProblemCount} 道`
          : `题库不足 ${requiredProblemCount} 道，当前 ${currentProblemCount} 道`,
    };
  }
  return {
    available: true,
    requiredProblemCount,
    currentProblemCount,
    reason: '可用',
  };
}

export function selectReviewRouteTemplate(args: {
  mode: ReviewRouteMode;
  availableProblemCount: number;
  seed?: string | number;
}): ReviewRouteTemplate {
  const maxQuestions = Math.min(
    MAX_TEMPLATE_REVIEW_PROBLEMS,
    Math.max(0, args.availableProblemCount),
  );
  const preferred = REVIEW_ROUTE_TEMPLATES.filter((template) =>
    template.bestFor.includes(args.mode),
  );
  const pool = (preferred.length > 0 ? preferred : REVIEW_ROUTE_TEMPLATES).filter((template) => {
    const count = getReviewRouteTemplateQuestionCount(template);
    return count >= MIN_TEMPLATE_REVIEW_PROBLEMS && count <= maxQuestions;
  });
  const candidates = pool.length > 0 ? pool : REVIEW_ROUTE_TEMPLATES;
  const seed = `${args.mode}:${args.availableProblemCount}:${args.seed ?? Date.now()}`;
  return seededShuffle(candidates, seed)[0];
}

function selectSpreadProblems(args: {
  problems: ReviewRouteCandidateProblem[];
  count: number;
  seed: string;
  mode: LocalReviewRouteMode;
  profile: ProblemBankLearningProfile | null;
}): ReviewRouteCandidateProblem[] {
  const buckets = new Map<string, ReviewRouteCandidateProblem[]>();
  args.problems.forEach((problem) => {
    const concept = primaryConcept(problem);
    buckets.set(concept, [...(buckets.get(concept) ?? []), problem]);
  });

  const weakConcepts = new Set(args.profile?.weakConcepts ?? []);
  const untriedConcepts = new Set(args.profile?.untriedConcepts ?? []);
  const thinConcepts = new Set(args.profile?.thinConcepts ?? []);
  const bucketKeys = seededShuffle(Array.from(buckets.keys()), `${args.seed}:bucket`).sort(
    (left, right) => {
      const score = (concept: string) =>
        (weakConcepts.has(concept) ? 4 : 0) +
        (untriedConcepts.has(concept) ? 3 : 0) +
        (thinConcepts.has(concept) ? 2 : 0);
      return score(right) - score(left);
    },
  );

  const sortedBuckets = new Map<string, ReviewRouteCandidateProblem[]>();
  bucketKeys.forEach((key) => {
    const bucket = seededShuffle(buckets.get(key) ?? [], `${args.seed}:problem:${key}`).sort(
      (left, right) => {
        const wrongBias =
          args.mode === 'wrong'
            ? Number(isWrongCandidate(right)) - Number(isWrongCandidate(left))
            : 0;
        return (
          wrongBias ||
          (right.score ?? 0) - (left.score ?? 0) ||
          difficultyRank(left.difficulty) - difficultyRank(right.difficulty)
        );
      },
    );
    sortedBuckets.set(key, bucket);
  });

  const selected: ReviewRouteCandidateProblem[] = [];
  const selectedIds = new Set<string>();
  let cursor = 0;
  while (selected.length < args.count && bucketKeys.length > 0) {
    const key = bucketKeys[cursor % bucketKeys.length];
    const bucket = sortedBuckets.get(key) ?? [];
    const next = bucket.shift();
    if (next && !selectedIds.has(next.id)) {
      selected.push(next);
      selectedIds.add(next.id);
    }
    if (bucket.length === 0) {
      const keyIndex = bucketKeys.indexOf(key);
      if (keyIndex >= 0) bucketKeys.splice(keyIndex, 1);
      cursor = Math.max(0, cursor - 1);
    }
    cursor += 1;
  }

  if (selected.length < args.count) {
    args.problems.forEach((problem) => {
      if (selected.length >= args.count || selectedIds.has(problem.id)) return;
      selected.push(problem);
      selectedIds.add(problem.id);
    });
  }

  return selected
    .slice(0, args.count)
    .sort(
      (left, right) =>
        difficultyRank(left.difficulty) - difficultyRank(right.difficulty) ||
        (right.score ?? 0) - (left.score ?? 0),
    );
}

function getQuestionTemplateNodes(template: ReviewRouteTemplate): TemplateNode[] {
  return template.layers.flatMap((layer) =>
    layer.nodes.filter((node) => node.requiresQuestion && node.questionCount > 0),
  );
}

function buildProblemSignals(args: {
  mode: LocalReviewRouteMode;
  problems: ReviewRouteCandidateProblem[];
  profile: ProblemBankLearningProfile | null;
  isBoss: boolean;
}): string[] {
  const concepts = new Set(args.problems.flatMap((problem) => problem.concepts));
  const weak = new Set(args.profile?.weakConcepts ?? []);
  const untried = new Set(args.profile?.untriedConcepts ?? []);
  const thin = new Set(args.profile?.thinConcepts ?? []);
  const mastered = new Set(args.profile?.masteredConcepts ?? []);
  const signals = new Set<string>();
  signals.add('candidate_problem');
  if (args.mode === 'wrong' || args.problems.some(isWrongCandidate)) signals.add('wrong_problem');
  if (args.problems.some((problem) => problem.status === 'unattempted'))
    signals.add('untried_concept');
  concepts.forEach((concept) => {
    if (weak.has(concept)) signals.add('weak_point');
    if (untried.has(concept)) signals.add('untried_concept');
    if (thin.has(concept)) signals.add('thin_bank');
    if (mastered.has(concept)) signals.add('mastered_review');
  });
  if (args.isBoss) signals.add('boss_mix');
  return Array.from(signals).slice(0, 6);
}

function nodeConcepts(args: {
  problems: ReviewRouteCandidateProblem[];
  fallbackConcepts: string[];
}): string[] {
  const concepts = uniqueStrings(
    args.problems.flatMap((problem) => problem.concepts),
    4,
  );
  return concepts.length > 0 ? concepts : args.fallbackConcepts.slice(0, 2);
}

function questionStyle(problems: ReviewRouteCandidateProblem[]): string {
  const typeLabels = uniqueStrings(
    problems.map((problem) => {
      if (problem.type === 'choice') return '选择题';
      if (problem.type === 'calculation') return '计算题';
      if (problem.type === 'proof') return '证明题';
      if (problem.type === 'code') return '代码题';
      if (problem.type === 'fill_blank') return '填空题';
      return '简答题';
    }),
    3,
  );
  return `${problems.length} 道${typeLabels.join('、') || '题库'}题，按从易到难的顺序推进`;
}

function passCriteria(kind: ReviewRouteNode['kind'], count: number): string {
  if (!['normal', 'elite', 'boss'].includes(kind)) return '领取或完成选择后通过';
  const required = kind === 'boss' ? count : Math.max(1, count - 1);
  return `${count} 题中至少答对 ${required} 题才算过关`;
}

function personalReason(args: {
  mode: LocalReviewRouteMode;
  node: TemplateNode;
  problems: ReviewRouteCandidateProblem[];
  concepts: string[];
}): string {
  const points = args.concepts.join('、') || '这个知识点';
  if (args.mode === 'wrong') {
    return `这关来自你已经做错或半对过的题，我把「${points}」分散到不同节点，避免只重做同一种问法。`;
  }
  if (args.problems.some((problem) => problem.status === 'unattempted')) {
    return `这里包含未尝试题，我想确认「${points}」不是只看过、还没真正做稳。`;
  }
  if (args.node.kind === 'boss') {
    return `最后把「${points}」合在一起，检查本轮复习能不能从单点走到综合。`;
  }
  return `这关从题库里抽到「${points}」，用来补齐本轮全面复习的覆盖面。`;
}

function supportQuestionStyle(kind: ReviewRouteNode['kind']): string {
  if (kind === 'camp') return '整理错题、恢复一次容错、升级一张局内卡';
  if (kind === 'treasure') return '领取局内卡、奖励币或碎片';
  if (kind === 'shop') return '用奖励币换提示卡、豁免卡或装饰碎片';
  return '二选一事件，调整后续复习收益';
}

function supportCheckGoal(kind: ReviewRouteNode['kind']): string {
  if (kind === 'camp') return '帮助学生整理前面题目的错因，并保留后续容错';
  if (kind === 'treasure') return '给后续关卡提供一点奖励和正反馈';
  if (kind === 'shop') return '让学生用已有奖励换更稳的通关资源';
  return '让学生在稳妥推进和挑战收益之间做一次选择';
}

function supportPersonalReason(kind: ReviewRouteNode['kind']): string {
  if (kind === 'camp') return '前面已经做过一组题，这里短暂停一下，把手感和错因整理清楚。';
  if (kind === 'treasure') return '中段给一点奖励，让后面的难题不只是硬扛。';
  if (kind === 'shop') return '后段开始变难，给一次换提示或容错的机会。';
  return '这里给你一次选择：今天状态好就冲一题，想稳一点也可以保住节奏。';
}

function defaultEventOptions(node: TemplateNode): ReviewRouteNode['eventOptions'] {
  if (node.eventOptions.length > 0) return node.eventOptions;
  if (node.kind !== 'event') return [];
  return [
    {
      label: '现在冲一题难题',
      effect: '下一题答对获得更高奖励',
      tradeoff: '答错会失去当前倍率',
      rewardPreview: '倍率 +0.2',
    },
    {
      label: '稳住节奏',
      effect: '保留容错进入下一关',
      tradeoff: '本层奖励较少',
      rewardPreview: '稳定推进',
    },
  ];
}

function modeTitle(mode: LocalReviewRouteMode): string {
  return mode === 'wrong' ? '错题回炉' : '全面复习';
}

function modeTeacherLine(mode: LocalReviewRouteMode, count: number): string {
  return mode === 'wrong'
    ? `我从错题里抽了 ${count} 道，尽量拆到不同专题，后面的关会更难一点。`
    : `我从题库里抽了 ${count} 道，尽量让不同专题都露面，再把难题放到后面。`;
}

function eligibleProblemsForMode(
  mode: LocalReviewRouteMode,
  problems: ReviewRouteCandidateProblem[],
): ReviewRouteCandidateProblem[] {
  return mode === 'wrong' ? problems.filter(isWrongCandidate) : problems;
}

export function buildTemplateReviewRoute(args: {
  mode: LocalReviewRouteMode;
  notebookName: string;
  candidateProblems: ReviewRouteCandidateProblem[];
  profile: ProblemBankLearningProfile | null;
  expectedConcepts: string[];
  seed?: string | number;
  template?: ReviewRouteTemplate;
}): ReviewRoute {
  const eligibleProblems = eligibleProblemsForMode(args.mode, args.candidateProblems);
  const minimum = args.mode === 'wrong' ? MIN_WRONG_REVIEW_PROBLEMS : MIN_TEMPLATE_REVIEW_PROBLEMS;
  if (eligibleProblems.length < minimum) {
    throw new Error(
      args.mode === 'wrong'
        ? `错题不足 ${minimum} 道，当前只有 ${eligibleProblems.length} 道`
        : `题库不足 ${minimum} 道，当前只有 ${eligibleProblems.length} 道`,
    );
  }

  const template =
    args.template ??
    selectReviewRouteTemplate({
      mode: args.mode,
      availableProblemCount: eligibleProblems.length,
      seed: args.seed,
    });
  const targetQuestionCount = getReviewRouteTemplateQuestionCount(template);
  const selectedProblems = selectSpreadProblems({
    problems: eligibleProblems,
    count: targetQuestionCount,
    seed: `${args.notebookName}:${args.mode}:${template.id}:${args.seed ?? Date.now()}`,
    mode: args.mode,
    profile: args.profile,
  });
  const routeConcepts = uniqueStrings(
    [
      ...selectedProblems.flatMap((problem) => problem.concepts),
      ...(args.mode === 'comprehensive' ? args.expectedConcepts : []),
      ...(args.profile?.weakConcepts ?? []),
      ...(args.profile?.untriedConcepts ?? []),
      ...(args.profile?.thinConcepts ?? []),
    ],
    16,
  );
  const fallbackConcepts = routeConcepts.length > 0 ? routeConcepts : ['综合复习'];

  const assignments = new Map<string, ReviewRouteCandidateProblem[]>();
  const questionNodes = getQuestionTemplateNodes(template);
  let problemIndex = 0;
  questionNodes.forEach((node) => {
    assignments.set(
      node.id,
      selectedProblems.slice(problemIndex, problemIndex + node.questionCount),
    );
    problemIndex += node.questionCount;
  });

  const route: ReviewRoute = {
    title: `${modeTitle(args.mode)} · ${template.name}`,
    teacherLine: modeTeacherLine(args.mode, selectedProblems.length),
    coverageContract: `本路线使用「${template.name}」模板，共 ${selectedProblems.length} 道题；前段更基础，后段更综合，并尽量让不同专题分散出现。`,
    knowledgePoints: fallbackConcepts,
    layers: template.layers.map((layer) => ({
      id: layer.id,
      title: layer.title,
      summary: layer.summary,
      nodes: layer.nodes.map((node) => {
        const assigned = assignments.get(node.id) ?? [];
        const concepts = nodeConcepts({ problems: assigned, fallbackConcepts });
        const isQuestion = node.requiresQuestion && !SUPPORT_KINDS.has(node.kind);
        if (!isQuestion) {
          return {
            id: node.id,
            title: node.title,
            kind: node.kind,
            knowledgePoints: concepts.slice(0, 3),
            questionStyle: supportQuestionStyle(node.kind),
            checkGoal: supportCheckGoal(node.kind),
            difficulty: node.difficulty,
            personalReason: supportPersonalReason(node.kind),
            passCriteria: '领取或完成选择后通过',
            questionCount: 0,
            problemIds: [],
            sourceSignals: node.kind === 'event' ? ['choice'] : ['reward'],
            requiresQuestion: false,
            rewardKind: node.rewardKind,
            rewardPoints: node.rewardPoints,
            rewardPreview: node.rewardPreview,
            eventOptions: defaultEventOptions(node),
          };
        }

        return {
          id: node.id,
          title: node.title,
          kind: node.kind,
          knowledgePoints: concepts,
          questionStyle: questionStyle(assigned),
          checkGoal: `确认 ${concepts.join('、')} 是否已经能独立完成题目`,
          difficulty: node.difficulty,
          personalReason: personalReason({
            mode: args.mode,
            node,
            problems: assigned,
            concepts,
          }),
          passCriteria: passCriteria(node.kind, assigned.length),
          questionCount: assigned.length,
          problemIds: assigned.map((problem) => problem.id),
          sourceSignals: buildProblemSignals({
            mode: args.mode,
            problems: assigned,
            profile: args.profile,
            isBoss: node.kind === 'boss',
          }),
          requiresQuestion: true,
          rewardKind: node.rewardKind,
          rewardPoints: node.rewardPoints,
          rewardPreview: node.rewardPreview,
          eventOptions: [],
        };
      }),
    })),
  };

  return reviewRouteSchema.parse(route);
}

export function describeReviewRouteTemplateForAi(template: ReviewRouteTemplate): string {
  const lines = [
    `模板ID：${template.id}`,
    `模板名：${template.name}`,
    `说明：${template.summary}`,
    `总题量：${getReviewRouteTemplateQuestionCount(template)} 道`,
    '必须严格使用下面的层数、节点 id、节点 kind、difficulty、questionCount 和 requiresQuestion；只允许改 title、knowledgePoints、questionStyle、checkGoal、personalReason、problemIds、sourceSignals、rewardPreview 的具体文字。',
  ];
  template.layers.forEach((layer) => {
    lines.push(`- ${layer.id} / ${layer.title}: ${layer.summary}`);
    layer.nodes.forEach((node) => {
      lines.push(
        `  - ${node.id}: kind=${node.kind}, difficulty=${node.difficulty}, questionCount=${node.questionCount}, requiresQuestion=${node.requiresQuestion}, rewardKind=${node.rewardKind}, rewardPoints=${node.rewardPoints}`,
      );
    });
  });
  return lines.join('\n');
}
