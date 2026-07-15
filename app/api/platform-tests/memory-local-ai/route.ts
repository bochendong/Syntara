import { NextRequest, NextResponse } from 'next/server';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { safeRoute } from '@/lib/server/json-error-response';
import { proxyFetch } from '@/lib/server/proxy-fetch';

export const runtime = 'nodejs';

const evidenceSchema = z.object({
  id: z.string().trim().min(1).max(240),
  layer: z.enum(['profile', 'exact_fact', 'working_memory', 'public_memory', 'private_memory']),
  title: z.string().trim().min(1).max(240),
  content: z.string().trim().min(1).max(12_000),
});

const generateSchema = z.object({
  action: z.literal('generate'),
  userId: z
    .string()
    .trim()
    .regex(/^memory-test-[a-z0-9_-]{1,80}$/i),
  task: z.enum(['questions', 'explanation', 'review_plan', 'next_action']),
  context: z.object({
    instruction: z.string().trim().min(1).max(4_000),
    evidence: z.array(evidenceSchema).min(1).max(80),
  }),
});

function buildGeneratedMemoryTaskSchema(
  task: z.infer<typeof generateSchema>['task'],
  evidenceIds: string[],
) {
  const evidenceIdSchema = z.enum(evidenceIds as [string, ...string[]]);
  const itemSchema = z.object({
    title: z.string().trim().min(1).max(200),
    content: z.string().trim().min(1).max(8_000),
    evidenceIds: z.array(evidenceIdSchema).min(1).max(12),
    difficulty: z.enum(['easy', 'medium', 'hard']).nullable(),
    minutes: z.number().int().min(1).max(240).nullable(),
  });
  const itemsSchema =
    task === 'questions' || task === 'review_plan'
      ? z.array(itemSchema).length(3)
      : task === 'explanation'
        ? z.array(itemSchema).min(2).max(4)
        : z.array(itemSchema).min(1).max(3);

  return z.object({
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(2_000),
    items: itemsSchema,
    adaptations: z.array(z.string().trim().min(1).max(1_000)).min(1).max(12),
    uncertainty: z.array(z.string().trim().min(1).max(1_000)).max(8),
  });
}

function resolveEnvironmentModel(request: NextRequest): string {
  const configuredDefault = process.env.DEFAULT_MODEL?.trim() || 'gpt-4o-mini';
  const requested = request.headers.get('x-model')?.trim();
  if (!requested) return configuredDefault;

  const match = requested.match(/^(?:openai[:/])?([a-z0-9][a-z0-9._-]{0,100})$/i);
  return match?.[1] || configuredDefault;
}

function taskOutputContract(task: z.infer<typeof generateSchema>['task']) {
  if (task === 'questions') {
    return '输出恰好 3 个 items，每项是一道完整、递进且可作答的题，difficulty 必填，minutes 可为 null。';
  }
  if (task === 'explanation') {
    return '输出 2-4 个 items，按用户偏好的讲解顺序组织；difficulty 为 null，minutes 可为 null。';
  }
  if (task === 'review_plan') {
    return '输出恰好 3 个按三天顺序执行的 items，minutes 必填；必须读取日历和学习时长偏好。';
  }
  return '输出 1-3 个 items，第一项必须是当前最值得做的具体动作，并给出可观察完成信号。';
}

export async function POST(request: NextRequest) {
  return safeRoute(async () => {
    const parsed = generateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: '本地记忆 AI 测试请求无效。', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: '未配置 OPENAI_API_KEY，无法执行本地记忆 AI 校验。' },
        { status: 503 },
      );
    }

    const input = parsed.data;
    const evidenceText = input.context.evidence
      .map(
        (item, index) =>
          `${index + 1}. [${item.id}] (${item.layer}) ${item.title}\n${item.content}`,
      )
      .join('\n\n');
    const evidenceIds = input.context.evidence.map((item) => item.id);
    const outputSchema = buildGeneratedMemoryTaskSchema(input.task, evidenceIds);
    const modelId = resolveEnvironmentModel(request);
    const openai = createOpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1',
      fetch: proxyFetch as typeof fetch,
    });
    const generated = await generateText({
      model: openai.chat(modelId),
      system: [
        '你是一个证据约束的个性化教学代理。',
        '用户记忆由浏览器本地沙盒随请求提供；你不能访问任何数据库。',
        '只能使用 prompt 中的证据进行个性化。',
        '每个 item 必须引用至少一个真实 evidenceId；不得编造 ID。',
        '不要机械复述记忆，要把记忆转成教学动作。',
        taskOutputContract(input.task),
      ].join('\n'),
      prompt: [
        `本地模拟用户：${input.userId}`,
        `任务：${input.task}`,
        input.context.instruction,
        '## 浏览器本地证据',
        evidenceText,
      ].join('\n\n'),
      output: Output.object({ schema: outputSchema }),
      maxOutputTokens: 8_000,
      maxRetries: 0,
    });
    const output = generated.output as z.infer<typeof outputSchema>;
    const knownEvidenceIds = new Set(evidenceIds);
    const evidenceChecks = output.items.map((item) => {
      const unknownIds = item.evidenceIds.filter((id) => !knownEvidenceIds.has(id));
      return {
        title: item.title,
        passed: unknownIds.length === 0,
        citedIds: item.evidenceIds,
        unknownIds,
      };
    });
    return NextResponse.json({
      action: input.action,
      task: input.task,
      model: `openai:${modelId}`,
      usage: generated.usage,
      context: {
        instruction: input.context.instruction,
        evidence: input.context.evidence,
        recall: null,
      },
      output,
      evidenceChecks,
      passedMachineCheck: evidenceChecks.every((check) => check.passed),
      persistence: 'none',
    });
  });
}
