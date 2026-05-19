import { NextRequest } from 'next/server';
import { z } from 'zod';
import { callLLM } from '@/lib/ai/llm';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { requireUserId } from '@/lib/server/api-auth';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { runWithRequestContext } from '@/lib/server/request-context';

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

const candidateProblemSchema = z.object({
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

const bodySchema = z.object({
  notebookId: z.string().trim().min(1),
  notebookName: z.string().trim().min(1),
  notebookDescription: z.string().trim().optional(),
  problemBank: problemBankSchema,
  scenes: z.array(sceneSchema).min(1).max(80),
  privateMemory: z.array(privateMemorySchema).default([]),
  candidateProblems: z.array(candidateProblemSchema).default([]),
  reviewHistory: z.array(reviewHistorySchema).default([]),
  selectedProblemIds: z.array(z.string().trim().min(1)).default([]),
});

const assessmentSchema = z.object({
  ready: z.boolean(),
  requiredProblemCount: z.number().int().min(0),
  currentProblemCount: z.number().int().min(0),
  missingConcepts: z.array(z.string().trim().min(1)).default([]),
  thinConcepts: z.array(z.string().trim().min(1)).default([]),
  reasons: z.array(z.string().trim().min(1)).default([]),
  teacherLine: z.string().trim().min(1),
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

function normalizeStringArray(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeAssessmentPayload(value: unknown, fallbackCurrentProblemCount: number): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const payload = value as Record<string, unknown>;
  const currentProblemCount =
    typeof payload.currentProblemCount === 'number'
      ? Math.max(0, Math.floor(payload.currentProblemCount))
      : fallbackCurrentProblemCount;
  const requiredProblemCount =
    typeof payload.requiredProblemCount === 'number'
      ? Math.max(0, Math.floor(payload.requiredProblemCount))
      : Math.max(8, currentProblemCount + 4);
  const missingConcepts = normalizeStringArray(payload.missingConcepts, 12);
  const thinConcepts = normalizeStringArray(payload.thinConcepts, 12);
  const reasons = normalizeStringArray(payload.reasons, 8);
  const ready =
    typeof payload.ready === 'boolean'
      ? payload.ready
      : reasons.length === 0 && missingConcepts.length === 0 && currentProblemCount >= 8;

  return {
    ...payload,
    ready,
    requiredProblemCount,
    currentProblemCount,
    missingConcepts,
    thinConcepts,
    reasons: reasons.length > 0 ? reasons : ready ? [] : ['AI 判断题库暂时不足以生成复习地图'],
    teacherLine: String(
      payload.teacherLine ??
        (ready
          ? '题库够啦，今天的复习路线我可以帮你排得很稳。'
          : '题库这里还差一点点，我先帮你标出来，补好我们再开图，好不好？'),
    ),
  };
}

function isValidAssessmentText(text: string): boolean {
  try {
    return assessmentSchema.safeParse(
      normalizeAssessmentPayload(JSON.parse(extractJsonObject(text)), 0),
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

  const auth = await requireUserId();
  if ('response' in auth) return auth.response;

  const body = parsedBody.data;
  const { model } = await resolveModelFromHeaders(req);
  const sceneLines = body.scenes
    .map((scene) => {
      const questions = scene.quizQuestions.slice(0, 5).map((question) => `      - ${question}`);
      return [
        `- [${scene.order}] ${scene.title} (${scene.type})`,
        questions.length > 0 ? questions.join('\n') : '      - 暂无现成题目',
      ].join('\n');
    })
    .join('\n');
  const problemBank = body.problemBank;
  const privateMemoryLines =
    body.privateMemory.length > 0
      ? body.privateMemory
          .slice(0, 16)
          .map(
            (item) =>
              `- ${item.concept} [${item.status}/${item.severity}] ${item.note}${
                item.relatedProblemIds.length ? `；关联题 ${item.relatedProblemIds.join(', ')}` : ''
              }`,
          )
          .join('\n')
      : '暂无 notebook 私人记忆。';
  const candidateProblemLines =
    body.candidateProblems.length > 0
      ? body.candidateProblems
          .slice(0, 24)
          .map(
            (problem) =>
              `- ${problem.id}: ${problem.title} (${problem.type}/${problem.difficulty}/${problem.status}) concepts=${problem.concepts.join('、') || '暂无'}${
                typeof problem.score === 'number' ? ` score=${problem.score}` : ''
              }${problem.preview ? `；${problem.preview}` : ''}`,
          )
          .join('\n')
      : '暂无候选题。';
  const reviewHistoryLines =
    body.reviewHistory.length > 0
      ? body.reviewHistory
          .slice(0, 12)
          .map(
            (item) =>
              `- ${item.title} [${item.status}] covered=${item.coveredConcepts.join('、') || '暂无'} failed=${item.failedConcepts.join('、') || '暂无'} problems=${item.problemIds.join(', ') || '暂无'}`,
          )
          .join('\n')
      : '暂无历史复习记录。';
  const currentProblemCount = problemBank?.totalProblems ?? 0;
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

  const system = `你是学习平台的 AI 题库体检老师。用户点击“开始复习”之后，你要判断当前题库是否足够生成一张全部由做题关卡组成的复习路线图。

判断原则：
1. 如果题库题量明显不足、关键专题没有题、或某些专题只有极少题，ready=false。
2. 如果可以用现有题库覆盖 notebook 的主要知识点，并安排普通/精英/Boss 做题节点，ready=true。
3. 不要因为学生有错题或薄弱点就判不足；错题和薄弱点本来就应该进入复习路线。
4. 不要因为 notebook 私人记忆为空、历史复习记录为空、或用户是 cold start 就判题库不足；这只能说明个性化信号少，不能说明题库少。
5. 如果“题量偏薄概念=暂无”“疑似缺题概念=暂无”，且候选题能覆盖主要薄弱/未尝试概念，不能凭空发明 thinConcepts 或 missingConcepts。
6. 输出语气是可爱的学习导师，温柔提醒；不绑定性别，不要恋爱承诺、占有或成人化表达。
7. 必须只输出 JSON，不要 markdown，不要解释。`;

  const prompt = `请判断这个 notebook 的题库是否足够生成复习路线图。

Notebook: ${body.notebookName}
Description: ${body.notebookDescription || '无'}

Notebook 内容与现有课程题目：
${sceneLines}

题库与学生掌握状态：
${problemBankLines}

Notebook 私人记忆：
${privateMemoryLines}

候选题库题目：
${candidateProblemLines}

历史复习记录：
${reviewHistoryLines}

请输出 JSON：
{
  "ready": true,
  "requiredProblemCount": 12,
  "currentProblemCount": ${currentProblemCount},
  "missingConcepts": [],
  "thinConcepts": [],
  "reasons": [],
  "teacherLine": "一句可爱的导师提示"
}

要求：
- ready=false 时，reasons 要具体说明为什么不能生成路线。
- missingConcepts 写完全没有题的专题。
- thinConcepts 写题量明显偏薄、不够支撑复习关卡的专题。
- 如果输入里的题量偏薄概念和疑似缺题概念都是“暂无”，不要因为没有私人记忆或历史记录而把专题写进 thinConcepts/missingConcepts。
- requiredProblemCount 是你建议的最低题量，不要机械套公式，要结合 notebook 范围判断。`;

  try {
    const result = await runWithRequestContext(req, '/api/review-route/assess-problem-bank', () =>
      callLLM(
        {
          model,
          system,
          prompt,
        },
        'review-route-assess-problem-bank',
        { retries: 1, validate: isValidAssessmentText },
      ),
    );

    const assessment = assessmentSchema.parse(
      normalizeAssessmentPayload(JSON.parse(extractJsonObject(result.text)), currentProblemCount),
    );
    return apiSuccess({ assessment });
  } catch (error) {
    console.error('[review-route/assess-problem-bank] failed', error);
    return apiError(
      'GENERATION_FAILED',
      502,
      error instanceof Error ? `题库体检失败：${error.message}` : '题库体检失败，请稍后再试',
    );
  }
}
