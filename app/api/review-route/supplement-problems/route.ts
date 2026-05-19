import { NextRequest } from 'next/server';
import { z } from 'zod';
import { callLLM } from '@/lib/ai/llm';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { requireUserId } from '@/lib/server/api-auth';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { runWithRequestContext } from '@/lib/server/request-context';

const problemTypeSchema = z.enum([
  'choice',
  'short_answer',
  'proof',
  'calculation',
  'code',
  'fill_blank',
]);
const problemDifficultySchema = z.enum(['easy', 'medium', 'hard']);
type ProblemType = z.infer<typeof problemTypeSchema>;
type ProblemDifficulty = z.infer<typeof problemDifficultySchema>;

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

const privateMemorySchema = z.object({
  id: z.string().trim().min(1),
  concept: z.string().trim().min(1),
  note: z.string().trim().min(1),
  status: z.enum(['open', 'reviewed']),
  severity: z.enum(['low', 'medium', 'high']).default('medium'),
  source: z.string().trim().min(1).optional(),
  relatedProblemIds: z.array(z.string().trim().min(1)).default([]),
});

const existingProblemSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  type: z.string().trim().min(1),
  concepts: z.array(z.string().trim().min(1)).default([]),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  status: z.enum(['unattempted', 'passed', 'failed', 'partial', 'error']),
  score: z.number().nullable().optional(),
  tags: z.array(z.string().trim().min(1)).default([]),
  preview: z.string().trim().min(1).optional(),
});

const reviewHistorySchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  status: z.enum(['completed', 'failed', 'partial', 'skipped']),
  coveredConcepts: z.array(z.string().trim().min(1)).default([]),
  failedConcepts: z.array(z.string().trim().min(1)).default([]),
  problemIds: z.array(z.string().trim().min(1)).default([]),
});

const assessmentSchema = z
  .object({
    ready: z.boolean(),
    requiredProblemCount: z.number().int().min(0),
    currentProblemCount: z.number().int().min(0),
    missingConcepts: z.array(z.string().trim().min(1)).default([]),
    thinConcepts: z.array(z.string().trim().min(1)).default([]),
    reasons: z.array(z.string().trim().min(1)).default([]),
    teacherLine: z.string().trim().min(1).optional(),
  })
  .nullable()
  .optional();

const bodySchema = z.object({
  notebookId: z.string().trim().min(1),
  notebookName: z.string().trim().min(1),
  notebookDescription: z.string().trim().optional(),
  problemBank: problemBankSchema,
  scenes: z.array(sceneSchema).min(1).max(80),
  privateMemory: z.array(privateMemorySchema).default([]),
  candidateProblems: z.array(existingProblemSchema).default([]),
  reviewHistory: z.array(reviewHistorySchema).default([]),
  selectedProblemIds: z.array(z.string().trim().min(1)).default([]),
  assessment: assessmentSchema,
  requiredProblemCount: z.number().int().min(1).max(80),
  targetCount: z.number().int().min(1).max(20),
});

const generatedProblemSchema = z.object({
  id: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1),
  type: z.string().trim().min(1),
  concepts: z.array(z.string().trim().min(1)).min(1).max(6),
  difficulty: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)).default([]),
  preview: z.string().trim().min(1).optional(),
  stem: z.string().trim().min(1).optional(),
  answer: z.string().trim().min(1).optional(),
  options: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        label: z.string().trim().min(1),
      }),
    )
    .optional(),
  testCases: z
    .array(
      z.object({
        input: z.string().trim().min(1),
        expectedOutput: z.string().trim().min(1),
        hidden: z.boolean().default(false),
      }),
    )
    .optional(),
});

type CandidateProblem = Omit<z.infer<typeof generatedProblemSchema>, 'id' | 'preview'> & {
  id: string;
  type: ProblemType;
  difficulty: ProblemDifficulty;
  preview: string;
  status: 'unattempted';
  score: null;
};

const llmResponseSchema = z.object({
  teacherLine: z.string().trim().min(1).optional(),
  problems: z.array(generatedProblemSchema).min(1).max(20),
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

function parsePossiblyLooseJson(text: string): unknown {
  const json = extractJsonObject(text);
  try {
    return JSON.parse(json);
  } catch {
    return JSON.parse(json.replace(/\\(?!["\\/bfnrtu])/g, '\\\\'));
  }
}

function normalizeStringArray(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item ?? '').trim())
        .filter(Boolean)
        .slice(0, maxItems),
    ),
  );
}

function slugify(value: string): string {
  const ascii = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return ascii || `p${Math.abs(hashString(value))}`;
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}

function uniqueProblemId(
  problem: z.infer<typeof generatedProblemSchema>,
  index: number,
  usedIds: Set<string>,
): string {
  const rawId = problem.id?.trim() || `ai-supplement-${slugify(problem.title)}-${index + 1}`;
  const baseId = rawId.startsWith('ai-supplement-') ? rawId : `ai-supplement-${slugify(rawId)}`;
  let id = baseId;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);
  return id;
}

function normalizeProblemType(value: unknown): ProblemType {
  const text = String(value ?? '')
    .trim()
    .toLowerCase();
  if (problemTypeSchema.safeParse(text).success) return text as ProblemType;
  if (text.includes('choice') || text.includes('select') || text.includes('选择')) return 'choice';
  if (text.includes('fill') || text.includes('blank') || text.includes('填空')) return 'fill_blank';
  if (text.includes('proof') || text.includes('证明')) return 'proof';
  if (text.includes('code') || text.includes('program') || text.includes('代码')) return 'code';
  if (text.includes('short') || text.includes('answer') || text.includes('简答'))
    return 'short_answer';
  return 'calculation';
}

function normalizeDifficulty(value: unknown): ProblemDifficulty {
  const text = String(value ?? '')
    .trim()
    .toLowerCase();
  if (problemDifficultySchema.safeParse(text).success) return text as ProblemDifficulty;
  if (text.includes('easy') || text.includes('简单') || text.includes('基础')) return 'easy';
  if (
    text.includes('hard') ||
    text.includes('困难') ||
    text.includes('难') ||
    text.includes('挑战')
  )
    return 'hard';
  return 'medium';
}

function normalizeProblems(
  rawProblems: z.infer<typeof generatedProblemSchema>[],
  targetCount: number,
  existingIds: Set<string>,
  coverageConcepts: string[],
): CandidateProblem[] {
  const problems = rawProblems.slice(0, targetCount).map((problem, index) => {
    const id = uniqueProblemId(problem, index, existingIds);
    const tags = Array.from(new Set([...problem.tags, 'ai_supplement']));
    const preview = problem.preview?.trim() || problem.stem?.trim() || problem.title;
    return {
      ...problem,
      id,
      title: problem.title.trim(),
      type: normalizeProblemType(problem.type),
      concepts: normalizeStringArray(problem.concepts, 6),
      difficulty: normalizeDifficulty(problem.difficulty),
      tags,
      preview,
      status: 'unattempted' as const,
      score: null,
    };
  });
  const coveredConcepts = new Set(problems.flatMap((problem) => problem.concepts));
  coverageConcepts.forEach((concept, index) => {
    if (coveredConcepts.has(concept) || problems.length === 0) return;
    const problem = problems[index % problems.length];
    problem.concepts = Array.from(new Set([...problem.concepts, concept]));
    coveredConcepts.add(concept);
  });
  return problems;
}

function parseSupplementText(
  text: string,
  targetCount: number,
  existingIds: Set<string>,
  coverageConcepts: string[],
): { teacherLine?: string; problems: CandidateProblem[] } {
  const parsed = llmResponseSchema.safeParse(parsePossiblyLooseJson(text));
  if (!parsed.success) {
    throw new Error(parsed.error.message);
  }
  if (parsed.data.problems.length < targetCount) {
    throw new Error(`AI only returned ${parsed.data.problems.length}/${targetCount} problems.`);
  }
  return {
    teacherLine: parsed.data.teacherLine,
    problems: normalizeProblems(parsed.data.problems, targetCount, existingIds, coverageConcepts),
  };
}

function isValidSupplementText(text: string, targetCount: number): boolean {
  try {
    const parsed = llmResponseSchema.safeParse(parsePossiblyLooseJson(text));
    return parsed.success && parsed.data.problems.length >= targetCount;
  } catch {
    return false;
  }
}

function summarizeProblems(problems: z.infer<typeof existingProblemSchema>[]): string {
  if (problems.length === 0) return '暂无候选题。';
  return problems
    .slice(0, 30)
    .map(
      (problem) =>
        `- ${problem.id}: ${problem.title} (${problem.type}/${problem.difficulty}/${problem.status}) concepts=${problem.concepts.join('、') || '暂无'}${problem.preview ? `；${problem.preview}` : ''}`,
    )
    .join('\n');
}

function summarizeScenes(scenes: z.infer<typeof sceneSchema>[]): string {
  return scenes
    .slice(0, 24)
    .map((scene) => {
      const questions = scene.quizQuestions.slice(0, 3).join('；') || '暂无现成题目';
      return `- [${scene.order}] ${scene.title} (${scene.type})：${questions}`;
    })
    .join('\n');
}

export async function POST(req: NextRequest) {
  const parsedBody = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsedBody.success) {
    return apiError('INVALID_REQUEST', 400, parsedBody.error.message);
  }

  const auth = await requireUserId();
  if ('response' in auth) return auth.response;

  const body = parsedBody.data;
  const { model } = await resolveModelFromHeaders(req);
  const problemBank = body.problemBank;
  const currentProblemCount = problemBank?.totalProblems ?? body.candidateProblems.length;
  const targetCount = body.targetCount;
  const existingIds = new Set(body.candidateProblems.map((problem) => problem.id));
  const targetConcepts = Array.from(
    new Set([
      ...(body.assessment?.missingConcepts || []),
      ...(body.assessment?.thinConcepts || []),
      ...(problemBank?.missingConcepts || []),
      ...(problemBank?.thinConcepts || []),
      ...(problemBank?.weakConcepts || []),
      ...(problemBank?.untriedConcepts || []),
      ...body.privateMemory.filter((item) => item.status === 'open').map((item) => item.concept),
      ...body.reviewHistory.flatMap((item) => item.failedConcepts),
    ]),
  ).slice(0, 16);

  const privateMemoryLines =
    body.privateMemory.length > 0
      ? body.privateMemory
          .slice(0, 12)
          .map(
            (item) =>
              `- ${item.concept} [${item.status}/${item.severity}] ${item.note}${
                item.relatedProblemIds.length ? `；关联题 ${item.relatedProblemIds.join(', ')}` : ''
              }`,
          )
          .join('\n')
      : '暂无 notebook 私人记忆。';
  const reviewHistoryLines =
    body.reviewHistory.length > 0
      ? body.reviewHistory
          .slice(0, 10)
          .map(
            (item) =>
              `- ${item.title} [${item.status}] covered=${item.coveredConcepts.join('、') || '暂无'} failed=${item.failedConcepts.join('、') || '暂无'} problems=${item.problemIds.join(', ') || '暂无'}`,
          )
          .join('\n')
      : '暂无历史复习记录。';
  const problemBankLines = problemBank
    ? [
        `当前题量：${currentProblemCount}`,
        `目标题量：${body.requiredProblemCount}`,
        `本次必须补题：${targetCount}`,
        `已掌握概念：${problemBank.masteredConcepts.join('、') || '暂无'}`,
        `薄弱概念：${problemBank.weakConcepts.join('、') || '暂无'}`,
        `未尝试概念：${problemBank.untriedConcepts.join('、') || '暂无'}`,
        `题量偏薄概念：${problemBank.thinConcepts.join('、') || '暂无'}`,
        `缺题概念：${problemBank.missingConcepts.join('、') || '暂无'}`,
      ].join('\n')
    : `当前题量：${currentProblemCount}\n目标题量：${body.requiredProblemCount}\n本次必须补题：${targetCount}`;

  const system = `你是学习平台的 AI 出题老师。你不批改答案，只在复习计划管线发现题库不足时补题。

规则：
1. 必须生成 exactly ${targetCount} 道新题；差 6 道就补 6 道，不多不少。
2. 新题要优先覆盖缺题、题量偏薄、薄弱、未尝试、私人记忆 open、上一轮失败概念。
3. 题型可以混合 choice / fill_blank / calculation / short_answer / proof / code。
4. 如果生成 code 题，必须提供 testCases，至少 2 个 public case 和 1 个 hidden case。
5. 不要复用已有题目的 id、标题或题干。
6. 输出语气是可爱的学习导师，温柔但清楚；不要恋爱、占有或成人化表达。
7. 题干、预览、答案用纯文本表达数学式，不要使用 LaTeX 反斜杠。
8. 必须只输出 JSON，不要 markdown，不要解释。`;

  const prompt = `请为这个 notebook 补齐复习题库。

Notebook: ${body.notebookName}
Description:
${body.notebookDescription || '无'}

题库缺口：
${problemBankLines}

需要优先覆盖的概念：
${targetConcepts.join('、') || '综合复习'}

Notebook 私人记忆：
${privateMemoryLines}

历史复习记录：
${reviewHistoryLines}

现有候选题，不能重复：
${summarizeProblems(body.candidateProblems)}

Notebook 场景切片：
${summarizeScenes(body.scenes)}

请输出 JSON：
{
  "teacherLine": "一句补题完成后的导师提示",
  "problems": [
    {
      "id": "ai-supplement-short-id",
      "title": "题目标题",
      "type": "calculation",
      "concepts": ["知识点"],
      "difficulty": "medium",
      "tags": ["ai_supplement"],
      "preview": "一句话题干预览",
      "stem": "完整题干",
      "answer": "参考答案或评分要点",
      "options": [{"id":"A","label":"选项内容"}],
      "testCases": [{"input":"函数输入","expectedOutput":"期望输出","hidden":false}]
    }
  ]
}

硬性要求：
- problems.length 必须等于 ${targetCount}。
- 每道题 concepts 至少 1 个，且尽量直接使用上方概念原文。
- 非 choice 题不要输出 options。
- 非 code 题不要输出 testCases。
- code 题的 preview/stem 必须说明函数签名和测试目标。
- 所有字符串里不要写 \\sin、\\frac、\\prime 这类未转义反斜杠；用 sin(x)、dy/dx、f'(x) 这样的纯文本。`;

  try {
    const result = await runWithRequestContext(req, '/api/review-route/supplement-problems', () =>
      callLLM(
        {
          model,
          system,
          prompt,
          maxOutputTokens: Math.max(2200, targetCount * 520),
        },
        'review-route-supplement-problems',
        {
          retries: 1,
          validate: (text) => isValidSupplementText(text, targetCount),
        },
      ),
    );

    const supplement = parseSupplementText(result.text, targetCount, existingIds, targetConcepts);
    return apiSuccess({
      problems: supplement.problems,
      teacherLine:
        supplement.teacherLine ||
        `我补了 ${targetCount} 道题，现在题库可以继续进入复习路线测试啦。`,
      requiredProblemCount: body.requiredProblemCount,
      currentProblemCount,
      deficit: targetCount,
    });
  } catch (error) {
    console.error('[review-route/supplement-problems] failed', error);
    return apiError(
      'GENERATION_FAILED',
      502,
      error instanceof Error ? `AI 补题失败：${error.message}` : 'AI 补题失败，请稍后再试',
    );
  }
}
