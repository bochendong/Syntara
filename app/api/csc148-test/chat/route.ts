import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { callLLM } from '@/lib/ai/llm';
import { buildCsc148LocalAgentRun } from '@/lib/csc148-local/agent';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import { requireUserId } from '@/lib/server/api-auth';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { runWithRequestContext } from '@/lib/server/request-context';
import {
  estimateOpenAITextUsageRetailCostCredits,
  estimateOpenAITextUsageRetailCostUsd,
} from '@/lib/utils/openai-pricing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const requestSchema = z.object({
  message: z.string().trim().min(1).max(6000),
});

function safeToken(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;

    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, '请输入有效的 CSC148 测试问题。');
    }

    const scaffold = buildCsc148LocalAgentRun(parsed.data.message);
    const { model, modelInfo, modelString, providerId } = await resolveModelFromHeaders(request, {
      allowOpenAIModelOverride: true,
    });
    const result = await runWithRequestContext(
      request,
      '/api/csc148-test/chat',
      () =>
        callLLM(
          {
            model,
            prompt: scaffold.prompt,
            maxOutputTokens: Math.min(modelInfo?.outputWindow || 4000, 4000),
            maxRetries: 0,
          },
          'csc148-end-to-end-test',
        ),
      {
        courseId: 'csc148-local-course',
        courseName: 'CSC148',
        operationCode: 'csc148_end_to_end_test',
        chargeReason: 'CSC148 完整学习闭环 AI 问答测试',
        serviceLabel: 'CSC148 end-to-end QA',
      },
    );

    const run = {
      ...scaffold,
      dataFlow: scaffold.dataFlow.map((step) =>
        step.id === 'reply'
          ? {
              ...step,
              input: `assembled prompt → ${modelString}`,
              output: 'paid AI response → browser IndexedDB',
              detail: '正式系统模型生成回复；浏览器收到结果后保存完整输入、输出、token 和费用。',
            }
          : step,
      ),
      assistantReply: result.text,
    };
    const usage = {
      inputTokens: safeToken(result.usage.inputTokens),
      outputTokens: safeToken(result.usage.outputTokens),
      cachedInputTokens: safeToken(result.usage.cachedInputTokens),
      totalTokens: safeToken(result.usage.totalTokens),
    };
    const pricingArgs = {
      providerId,
      modelString,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cachedInputTokens: usage.cachedInputTokens,
    };
    const costEstimate = {
      retailUsd: estimateOpenAITextUsageRetailCostUsd(pricingArgs),
      computeCredits: estimateOpenAITextUsageRetailCostCredits(pricingArgs),
    };
    const savedAt = Date.now();
    const resultKey = `run-${savedAt}-${randomUUID()}`;
    const summary = {
      generatedCount: 1,
      errorCount: 0,
      lastUpdatedAt: savedAt,
      provider: providerId,
      model: modelString,
      costUsd: costEstimate.retailUsd,
      ...usage,
    };
    const payload = {
      kind: 'csc148-ai-chat',
      scenarioId: 'end-to-end-learning-loop',
      input: parsed.data.message,
      output: result.text,
      provider: providerId,
      model: modelString,
      costUsd: costEstimate.retailUsd,
      costEstimate,
      usage,
      run,
      savedAt,
    };
    return apiSuccess({
      run,
      model: modelString,
      usage,
      costEstimate,
      resultKey,
      summary,
      payload,
    });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      error instanceof Error ? error.message : 'CSC148 AI 测试运行失败。',
    );
  }
}
