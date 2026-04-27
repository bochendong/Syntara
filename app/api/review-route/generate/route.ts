import { NextRequest } from 'next/server';
import { z } from 'zod';
import { callLLM } from '@/lib/ai/llm';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { requireUserId } from '@/lib/server/api-auth';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { runWithRequestContext } from '@/lib/server/request-context';
import { reviewRouteSchema } from '@/lib/learning/review-route-types';

type JsonObject = Record<string, unknown>;

const sceneSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  type: z.string().trim().min(1),
  order: z.number().finite(),
  quizQuestions: z.array(z.string().trim().min(1)).default([]),
});

const problemBankSchema = z
  .object({
    totalProblems: z.number().int().min(0).default(0),
    attemptedProblems: z.number().int().min(0).default(0),
    masteredConcepts: z.array(z.string().trim().min(1)).default([]),
    weakConcepts: z.array(z.string().trim().min(1)).default([]),
    untriedConcepts: z.array(z.string().trim().min(1)).default([]),
    thinConcepts: z.array(z.string().trim().min(1)).default([]),
    missingConcepts: z.array(z.string().trim().min(1)).default([]),
    wrongProblems: z
      .array(
        z.object({
          title: z.string().trim().min(1),
          tags: z.array(z.string().trim().min(1)).default([]),
          difficulty: z.enum(['easy', 'medium', 'hard']),
          status: z.enum(['pending', 'passed', 'failed', 'partial', 'error']),
        }),
      )
      .default([]),
  })
  .nullable()
  .optional();

const bodySchema = z.object({
  notebookId: z.string().trim().min(1),
  notebookName: z.string().trim().min(1),
  notebookDescription: z.string().trim().optional(),
  weakPoints: z.array(z.string().trim().min(1)).default([]),
  problemBank: problemBankSchema,
  scenes: z.array(sceneSchema).min(1).max(80),
});

function stripCodeFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function extractJsonObject(text: string): string {
  const stripped = stripCodeFences(text);
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start < 0 || end <= start) return stripped;
  return stripped.slice(start, end + 1);
}

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : null;
}

function normalizeKind(value: unknown): string {
  const text = String(value ?? '')
    .trim()
    .toLowerCase();
  if (['normal', 'elite', 'boss', 'camp', 'treasure', 'event', 'shop'].includes(text)) return text;
  if (text.includes('精英') || text.includes('elite')) return 'elite';
  if (text.includes('boss') || text.includes('首领') || text.includes('最终')) return 'boss';
  if (text.includes('营火') || text.includes('camp')) return 'camp';
  if (text.includes('宝箱') || text.includes('treasure')) return 'treasure';
  if (text.includes('事件') || text.includes('event')) return 'event';
  if (text.includes('商店') || text.includes('shop')) return 'shop';
  return 'normal';
}

function normalizeDifficulty(value: unknown, kind: string): string {
  const text = String(value ?? '')
    .trim()
    .toLowerCase();
  if (['easy', 'medium', 'hard'].includes(text)) return text;
  if (kind === 'boss' || kind === 'elite') return 'hard';
  if (text.includes('难') || text.includes('hard') || text.includes('挑战')) return 'hard';
  if (text.includes('中') || text.includes('medium') || text.includes('标准')) return 'medium';
  if (
    text.includes('易') ||
    text.includes('easy') ||
    text.includes('基础') ||
    text.includes('简单')
  ) {
    return 'easy';
  }
  return 'medium';
}

function normalizeStringArray(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeOptionalString(value: unknown, maxLength = 120): string | undefined {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, maxLength) : undefined;
}

function normalizeQuestionCount(value: unknown, kind: string): number {
  if (!['normal', 'elite', 'boss'].includes(kind)) return 0;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(numeric)) return Math.max(1, Math.min(12, Math.round(numeric)));
  if (kind === 'boss') return 5;
  if (kind === 'elite') return 4;
  return 3;
}

function defaultPassCriteria(kind: string, questionCount: number): string {
  if (!['normal', 'elite', 'boss'].includes(kind)) return '领取或完成选择后通过';
  const target = kind === 'boss' ? questionCount : Math.max(1, questionCount - 1);
  return `${questionCount} 题中至少答对 ${target} 题才算过关`;
}

function defaultPersonalReason(kind: string, knowledgePoints: string[]): string {
  const points = knowledgePoints.join('、') || '这个知识点';
  if (kind === 'boss') return `把「${points}」放进综合 Boss 里，确认你不是只会单点题。`;
  if (kind === 'elite') return `这里会稍微加压，看看「${points}」在变式题里稳不稳。`;
  if (['camp', 'treasure', 'event', 'shop'].includes(kind)) {
    return `这是给后续复习节奏准备的补给点，不会替代做题检测。`;
  }
  return `我把「${points}」放到这一关，是想确认这个小点已经补稳了。`;
}

function normalizeRequiresQuestion(value: unknown, kind: string): boolean {
  if (typeof value === 'boolean') return value;
  return ['normal', 'elite', 'boss'].includes(kind);
}

function normalizeRewardKind(value: unknown, kind: string): string {
  const text = String(value ?? '')
    .trim()
    .toLowerCase();
  const allowed = [
    'none',
    'run_card',
    'reward_coin',
    'card_back_shard',
    'relic_shard',
    'forgiveness',
    'card_upgrade',
    'hint_card',
    'mentor_cosmetic_shard',
    'multiplier',
  ];
  if (allowed.includes(text)) return text;
  if (text.includes('升级')) return 'card_upgrade';
  if (text.includes('豁免') || text.includes('容错')) return 'forgiveness';
  if (text.includes('提示')) return 'hint_card';
  if (text.includes('遗物')) return 'relic_shard';
  if (text.includes('卡背')) return 'card_back_shard';
  if (text.includes('装饰') || text.includes('导师')) return 'mentor_cosmetic_shard';
  if (text.includes('倍率')) return 'multiplier';
  if (text.includes('奖励币') || text.includes('coin')) return 'reward_coin';
  if (text.includes('卡')) return 'run_card';
  if (kind === 'treasure') return 'run_card';
  if (kind === 'camp') return 'forgiveness';
  if (kind === 'shop') return 'hint_card';
  return 'none';
}

function parseRewardPointsFromText(value: unknown): number | undefined {
  const text = String(value ?? '').trim();
  if (!text) return undefined;
  const match = text.match(/(?:\+|获得|奖励)?\s*(\d{1,3})\s*(?:奖励积分|积分|奖励币)/);
  if (!match) return undefined;
  const numeric = Number(match[1]);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(999, Math.round(numeric))) : undefined;
}

function defaultRewardPoints(
  kind: string,
  difficulty: string,
  questionCount: number,
  rewardKind: string,
): number {
  const baseByKind: Record<string, number> = {
    normal: 10,
    elite: 24,
    boss: 60,
    camp: 8,
    treasure: 18,
    event: 14,
    shop: 0,
  };
  const difficultyBonus = difficulty === 'hard' ? 10 : difficulty === 'medium' ? 4 : 0;
  const questionBonus = ['normal', 'elite', 'boss'].includes(kind)
    ? Math.max(0, questionCount - 2) * 2
    : 0;
  const rewardKindBonus = ['reward_coin', 'relic_shard', 'card_back_shard'].includes(rewardKind)
    ? 6
    : ['run_card', 'forgiveness', 'card_upgrade'].includes(rewardKind)
      ? 4
      : 0;
  return Math.max(
    0,
    Math.min(120, (baseByKind[kind] ?? 10) + difficultyBonus + questionBonus + rewardKindBonus),
  );
}

function normalizeRewardPoints(args: {
  value: unknown;
  rewardPreview: unknown;
  kind: string;
  difficulty: string;
  questionCount: number;
  rewardKind: string;
}): number {
  const numeric = typeof args.value === 'number' ? args.value : Number(args.value);
  if (Number.isFinite(numeric)) return Math.max(0, Math.min(999, Math.round(numeric)));
  const fromPreview = parseRewardPointsFromText(args.rewardPreview);
  if (typeof fromPreview === 'number') return fromPreview;
  return defaultRewardPoints(args.kind, args.difficulty, args.questionCount, args.rewardKind);
}

function normalizeEventOptions(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((optionValue) => {
      const option = asObject(optionValue);
      if (!option) return null;
      return {
        label: String(option.label ?? option.title ?? '事件选择'),
        effect: String(option.effect ?? option.description ?? '调整本局复习收益'),
        tradeoff:
          typeof option.tradeoff === 'string' && option.tradeoff.trim()
            ? option.tradeoff
            : undefined,
        rewardPreview:
          typeof option.rewardPreview === 'string' && option.rewardPreview.trim()
            ? option.rewardPreview
            : undefined,
      };
    })
    .filter(Boolean)
    .slice(0, 3);
}

function normalizeReviewRoutePayload(value: unknown): unknown {
  const route = asObject(value);
  if (!route) return value;

  const routeKnowledgePoints = normalizeStringArray(route.knowledgePoints, 24);
  const layers = Array.isArray(route.layers)
    ? route.layers.map((layerValue, layerIndex) => {
        const layer = asObject(layerValue);
        if (!layer) return layerValue;
        const nodes = Array.isArray(layer.nodes)
          ? layer.nodes.map((nodeValue, nodeIndex) => {
              const node = asObject(nodeValue);
              if (!node) return nodeValue;
              const kind = normalizeKind(node.kind);
              const knowledgePoints = normalizeStringArray(node.knowledgePoints, 6);
              const normalizedKnowledgePoints =
                knowledgePoints.length > 0
                  ? knowledgePoints
                  : routeKnowledgePoints.slice(0, 1).length > 0
                    ? routeKnowledgePoints.slice(0, 1)
                    : ['综合复习'];
              const questionCount = normalizeQuestionCount(node.questionCount, kind);
              const difficulty = normalizeDifficulty(node.difficulty, kind);
              const rewardKind = normalizeRewardKind(node.rewardKind, kind);
              const rewardPoints = normalizeRewardPoints({
                value: node.rewardPoints,
                rewardPreview: node.rewardPreview,
                kind,
                difficulty,
                questionCount,
                rewardKind,
              });
              return {
                ...node,
                id: String(node.id ?? `node-${layerIndex + 1}-${nodeIndex + 1}`),
                title: String(node.title ?? `第 ${layerIndex + 1}-${nodeIndex + 1} 关`),
                kind,
                knowledgePoints: normalizedKnowledgePoints,
                questionStyle: String(
                  node.questionStyle ??
                    (['normal', 'elite', 'boss'].includes(kind)
                      ? '用小测题完成本关检测'
                      : '局内补给节点，不替代关键检测题'),
                ),
                checkGoal: String(
                  node.checkGoal ??
                    (['normal', 'elite', 'boss'].includes(kind)
                      ? '检查这个知识点是否掌握稳定'
                      : '调整本局节奏，帮助学生更稳定地完成后续检测'),
                ),
                difficulty,
                personalReason:
                  normalizeOptionalString(node.personalReason, 160) ??
                  defaultPersonalReason(kind, normalizedKnowledgePoints),
                passCriteria:
                  normalizeOptionalString(node.passCriteria, 120) ??
                  defaultPassCriteria(kind, questionCount),
                questionCount,
                sourceSignals: normalizeStringArray(node.sourceSignals, 6),
                requiresQuestion: normalizeRequiresQuestion(node.requiresQuestion, kind),
                rewardKind,
                rewardPoints,
                rewardPreview:
                  typeof node.rewardPreview === 'string' && node.rewardPreview.trim()
                    ? node.rewardPreview
                    : undefined,
                eventOptions: normalizeEventOptions(node.eventOptions),
              };
            })
          : [];
        return {
          ...layer,
          id: String(layer.id ?? `layer-${layerIndex + 1}`),
          title: String(layer.title ?? `第 ${layerIndex + 1} 层`),
          summary: String(layer.summary ?? '完成这一层的题目检测'),
          nodes,
        };
      })
    : route.layers;

  return {
    ...route,
    knowledgePoints:
      routeKnowledgePoints.length > 0 ? routeKnowledgePoints : ['综合复习', '错题回顾'],
    layers,
  };
}

function isValidReviewRouteText(text: string): boolean {
  try {
    return reviewRouteSchema.safeParse(
      normalizeReviewRoutePayload(JSON.parse(extractJsonObject(text))),
    ).success;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const parsedBody = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsedBody.success) {
    return apiError('INVALID_REQUEST', 400, parsedBody.error.message);
  }

  const body = parsedBody.data;
  const auth = await requireUserId();
  if ('response' in auth) return auth.response;

  const { model } = await resolveModelFromHeaders(req);
  const sceneLines = body.scenes
    .map((scene) => {
      const questions = scene.quizQuestions.slice(0, 6).map((question) => `      - ${question}`);
      return [
        `- [${scene.order}] ${scene.title} (${scene.type})`,
        questions.length > 0 ? questions.join('\n') : '      - 暂无现成题目，请按知识点设计检测题',
      ].join('\n');
    })
    .join('\n');
  const problemBank = body.problemBank;
  const problemBankLines = problemBank
    ? [
        `题库总题量：${problemBank.totalProblems}`,
        `已作答题量：${problemBank.attemptedProblems}`,
        `已掌握概念：${problemBank.masteredConcepts.slice(0, 12).join('、') || '暂无'}`,
        `错题/薄弱概念：${problemBank.weakConcepts.slice(0, 12).join('、') || '暂无'}`,
        `题库有题但未尝试：${problemBank.untriedConcepts.slice(0, 12).join('、') || '暂无'}`,
        `题量偏薄概念：${problemBank.thinConcepts.slice(0, 12).join('、') || '暂无'}`,
        `疑似缺题概念：${problemBank.missingConcepts.slice(0, 12).join('、') || '暂无'}`,
        `最近错题：${
          problemBank.wrongProblems
            .slice(0, 8)
            .map((problem) => `${problem.title}(${problem.tags.join('/') || problem.difficulty})`)
            .join('；') || '暂无'
        }`,
      ].join('\n')
    : '暂未读取到题库画像。';

  const system = `你是一个学习平台的 AI 复习路线图设计师。你要生成“杀戮尖塔式”的复习地图。复习主线必须靠做题检测，不允许安排看课、阅读课程、听讲或视频学习；但地图中可以穿插营火、宝箱、事件、商店这类局内趣味节点，让路线有补给、选择和奖励节奏。

规则：
1. 地图看起来必须有很多分支，每层 2-4 个节点，所有分支最后必须汇聚到同一个最终 Boss。
2. 但是每条分支路径都必须通过 normal/elite/boss 题目节点覆盖完整知识点集合；趣味节点只能提供补给、奖励或选择，不能替代核心检测。
3. 节点 kind 可以是 normal、elite、boss、camp、treasure、event、shop。
4. normal/elite/boss 必须 requiresQuestion=true；camp/treasure/event/shop 通常 requiresQuestion=false。
5. 营火：整理错题、恢复一次容错、升级一张局内卡。宝箱：获得局内卡、奖励币、卡背碎片、遗物碎片。事件：二选一，例如“现在做一题高难题换双倍奖励”或“跳过一题但失去倍率”。商店：用奖励币换提示卡、豁免卡、导师装饰碎片。
6. 题目节点必须像游戏关卡，不要写“XX检测”这种泛泛标题；用“导数链式反应”“极限小疙瘩清理战”“可导性分岔口”这种短标题。
7. 每个节点必须说明为什么给这个学生这一关、做几题、通过标准、通关后获得多少奖励积分；这些字段要能被地图详情面板直接展示。
8. 第一层只能安排 normal 或 elite 题目节点；营火、商店、宝箱、事件都不能出现在第一层，优先在完成 1-2 层后出现。
9. 最后一层必须只有 1 个 boss 节点，不能把商店、营火、宝箱、事件和 Boss 放在同一层。
10. 输出语气是可爱的学习导师，有陪伴感但克制；不绑定性别，不说恋爱承诺，不成人化。
11. 必须只输出 JSON，不要 markdown，不要解释。`;

  const prompt = `请为这个 notebook 生成复习路线图。

Notebook: ${body.notebookName}
Description: ${body.notebookDescription || '无'}
用户已记录薄弱点：
${body.weakPoints.length > 0 ? body.weakPoints.map((item) => `- ${item}`).join('\n') : '- 暂无'}

Notebook 内容与现有题目：
${sceneLines}

题库与学生掌握状态：
${problemBankLines}

请输出这个 JSON 结构：
{
  "title": "复习路线图标题",
  "teacherLine": "一句可爱的导师陪伴提示",
  "coverageContract": "说明每条分支都会复习完所有知识点",
  "knowledgePoints": ["知识点1", "知识点2"],
  "layers": [
    {
      "id": "layer-1",
      "title": "阶段名",
      "summary": "阶段说明",
      "nodes": [
        {
          "id": "node-1-a",
          "title": "节点名",
          "kind": "normal",
          "knowledgePoints": ["本节点检测的知识点"],
          "questionStyle": "题型/做题方式",
          "checkGoal": "要检验学生哪里会、哪里不会",
          "difficulty": "easy",
          "personalReason": "昨天你在这个知识点停过一次，我想先确认这里已经稳住。",
          "passCriteria": "3 题中至少答对 2 题才算过关",
          "questionCount": 3,
          "sourceSignals": ["weak_point", "wrong_problem"],
          "requiresQuestion": true,
          "rewardKind": "none",
          "rewardPoints": 16,
          "rewardPreview": "通关 +16 奖励积分，倍率 +0.1",
          "eventOptions": []
        },
        {
          "id": "node-1-b",
          "title": "粉笔营火",
          "kind": "camp",
          "knowledgePoints": ["本节点关联的知识点"],
          "questionStyle": "整理错题、恢复一次容错、升级一张局内卡",
          "checkGoal": "帮助学生稳定后续题目表现",
          "difficulty": "easy",
          "personalReason": "前面做完两层后给你整理节奏，顺手把错题小疙瘩揉开。",
          "passCriteria": "领取营火效果后通过",
          "questionCount": 0,
          "sourceSignals": ["recovery"],
          "requiresQuestion": false,
          "rewardKind": "forgiveness",
          "rewardPoints": 10,
          "rewardPreview": "通关 +10 奖励积分，恢复一次答错豁免",
          "eventOptions": []
        },
        {
          "id": "node-2-c",
          "title": "心跳事件",
          "kind": "event",
          "knowledgePoints": ["本节点关联的知识点"],
          "questionStyle": "二选一事件",
          "checkGoal": "让学生在风险和收益之间做选择",
          "difficulty": "medium",
          "personalReason": "这里让你选一次风险和收益，看看今天手感要稳一点还是冲一波。",
          "passCriteria": "完成一次选择后通过",
          "questionCount": 0,
          "sourceSignals": ["choice"],
          "requiresQuestion": false,
          "rewardKind": "multiplier",
          "rewardPoints": 18,
          "rewardPreview": "通关 +18 奖励积分，根据选择调整倍率",
          "eventOptions": [
            {
              "label": "现在做一题高难题",
              "effect": "下一题答对获得双倍奖励",
              "tradeoff": "答错会失去当前倍率",
              "rewardPreview": "双倍奖励"
            },
            {
              "label": "跳过一题",
              "effect": "立刻前进到下一关",
              "tradeoff": "失去当前倍率",
              "rewardPreview": "保住节奏"
            }
          ]
        }
      ]
    }
  ]
}

要求：
- knowledgePoints 总数 6-16 个。
- layers 4-7 层。
- 第一层偏基础，最后一层必须只有 1 个 boss；所有路线都要在这个 Boss 汇聚。
- normal/elite/boss 是做题复习节点；camp/treasure/event/shop 是趣味节点，但不要出现“看课”“学习视频”“阅读讲义”。
- 每 2 层至少安排 1 个趣味节点；不要连续两层只有趣味节点。
- 第一层不要出现 camp/treasure/shop/event；营火、宝箱、商店优先放在第 3 层之后。事件也不要替代第一层基础检测。
- 最后一层只能有 boss，不能混入商店、营火、宝箱、事件或普通题。
- normal/elite/boss 的 title 禁止使用“检测”“小测”“练习”这类泛标题，必须像关卡名。
- normal/elite/boss 的 personalReason 必须引用错题、薄弱、未尝试、题量偏薄、已掌握巩固中的至少一种学生画像信号。
- normal/elite/boss 的 questionCount 必须是 2-5，boss 必须是 4-6；passCriteria 必须明确几题答对几题。
- 每个节点必须提供 rewardPoints 整数，并在 rewardPreview 里写清楚“通关 +X 奖励积分”。建议 normal 12-22、elite 28-42、boss 70-100、camp/event 8-22、treasure 18-40、shop 0-10。
- sourceSignals 使用英文短标签，例如 wrong_problem、weak_point、untried_concept、thin_bank、mastered_review、boss_mix、reward。
- 事件节点必须给 2 个 eventOptions；商店节点 rewardKind 优先 hint_card/forgiveness/mentor_cosmetic_shard；宝箱节点 rewardKind 优先 run_card/reward_coin/card_back_shard/relic_shard；营火节点 rewardKind 优先 forgiveness/card_upgrade。
- 路线图要优先安排错题概念、未尝试概念和题量偏薄概念；已掌握概念可以作为 boss 综合题或低频巩固。
- 如果题库缺少某专题题目，请在节点的 questionStyle 里标注“需要先补题入题库”，不要假装题库已经足够。`;

  try {
    const result = await runWithRequestContext(req, '/api/review-route/generate', () =>
      callLLM(
        {
          model,
          system,
          prompt,
        },
        'review-route-generate',
        { retries: 1, validate: isValidReviewRouteText },
      ),
    );

    const route = reviewRouteSchema.parse(
      normalizeReviewRoutePayload(JSON.parse(extractJsonObject(result.text))),
    );
    return apiSuccess({ route });
  } catch (error) {
    console.error('[review-route/generate] failed', error);
    return apiError(
      'GENERATION_FAILED',
      502,
      error instanceof Error
        ? `复习路线图生成失败：${error.message}`
        : '复习路线图生成失败，请稍后再试',
    );
  }
}
