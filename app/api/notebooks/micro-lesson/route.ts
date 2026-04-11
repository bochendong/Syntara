import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { runWithRequestContext } from '@/lib/server/request-context';
import { nanoid } from 'nanoid';
import { generateSceneOutlinesFromRequirements } from '@/lib/generation/outline-generator';
import { normalizeSceneOutlineContentProfile } from '@/lib/generation/content-profile';
import { generateFullScenes } from '@/lib/generation/scene-generator';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import type { SceneOutline, UserRequirements } from '@/lib/types/generation';
import type { Scene, Stage } from '@/lib/types/stage';
import type { StageStore } from '@/lib/api/stage-api-types';

const log = createLogger('NotebookMicroLesson');

function createInMemoryStore(stageId: string): StageStore {
  const now = Date.now();
  let state = {
    stage: {
      id: stageId,
      name: '临时微课',
      createdAt: now,
      updatedAt: now,
      language: 'zh-CN',
    } as Stage,
    scenes: [] as Scene[],
    currentSceneId: null as string | null,
    mode: 'playback' as const,
  };
  const listeners: Array<(s: typeof state, prev: typeof state) => void> = [];
  return {
    getState: () => state,
    setState: (partial: Partial<typeof state>) => {
      const prev = state;
      state = { ...state, ...partial };
      listeners.forEach((fn) => fn(state, prev));
    },
    subscribe: (listener: (s: typeof state, prev: typeof state) => void) => {
      listeners.push(listener);
      return () => {
        const idx = listeners.indexOf(listener);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },
  };
}

function fallbackOutlines(language: 'zh-CN' | 'en-US'): SceneOutline[] {
  if (language === 'en-US') {
    const outlines: SceneOutline[] = [
      {
        id: nanoid(),
        type: 'slide',
        title: 'Problem Understanding',
        description: 'Clarify inputs, outputs, constraints, and what is being asked.',
        keyPoints: [
          'Extract key constraints',
          'Define expected output',
          'Identify hidden assumptions',
        ],
        order: 1,
        language,
      },
      {
        id: nanoid(),
        type: 'slide',
        title: 'Approach and Reasoning',
        description: 'Break down the strategy and why it works.',
        keyPoints: ['Core algorithm idea', 'Step-by-step process', 'Correctness intuition'],
        order: 2,
        language,
      },
      {
        id: nanoid(),
        type: 'slide',
        title: 'Complexity and Pitfalls',
        description: 'Summarize complexity, edge cases, and common mistakes.',
        keyPoints: ['Time and space complexity', 'Edge cases', 'Common implementation errors'],
        order: 3,
        language,
      },
    ];
    return outlines.map((outline) => normalizeSceneOutlineContentProfile(outline));
  }
  const outlines: SceneOutline[] = [
    {
      id: nanoid(),
      type: 'slide',
      title: '题意拆解',
      description: '先明确输入、输出、约束和题目真正要回答的问题。',
      keyPoints: ['提取关键约束', '明确目标输出', '识别潜在隐含条件'],
      order: 1,
      language,
    },
    {
      id: nanoid(),
      type: 'slide',
      title: '思路与推导',
      description: '分步骤说明算法思路，并解释为什么这样做是正确的。',
      keyPoints: ['核心策略', '执行流程', '正确性直觉'],
      order: 2,
      language,
    },
    {
      id: nanoid(),
      type: 'slide',
      title: '复杂度与易错点',
      description: '给出复杂度结论，补充边界情况与常见错误。',
      keyPoints: ['时间/空间复杂度', '边界测试', '常见失误与修正'],
      order: 3,
      language,
    },
  ];
  return outlines.map((outline) => normalizeSceneOutlineContentProfile(outline));
}

function normalizeOutlines(outlines: SceneOutline[], language: 'zh-CN' | 'en-US'): SceneOutline[] {
  const normalized = outlines
    .filter((o) => (o.title || '').trim())
    .slice(0, 5)
    .map((o, i) => {
      const keyPoints = (o.keyPoints || [])
        .map((k) => String(k).trim())
        .filter(Boolean)
        .slice(0, 6);
      const safeKeyPoints =
        keyPoints.length >= 3
          ? keyPoints
          : [
              ...(keyPoints.length ? keyPoints : []),
              ...(language === 'en-US'
                ? ['Clarify assumptions', 'Explain core steps', 'Validate with edge cases']
                : ['澄清假设条件', '解释关键步骤', '用边界案例验证']),
            ].slice(0, 3);
      return {
        ...normalizeSceneOutlineContentProfile(o),
        id: o.id || nanoid(),
        type: 'slide',
        title: o.title.trim(),
        description: (o.description || o.title || '').trim(),
        keyPoints: safeKeyPoints,
        order: i + 1,
        language,
      } satisfies SceneOutline;
    });
  if (normalized.length >= 3) return normalized;
  return fallbackOutlines(language);
}

export async function POST(req: NextRequest) {
  return runWithRequestContext(req, '/api/notebooks/micro-lesson', async () => {
    try {
      const body = (await req.json()) as { question?: string; language?: 'zh-CN' | 'en-US' };
      const question = body?.question?.trim() || '';
      if (!question) return apiError('MISSING_REQUIRED_FIELD', 400, 'question is required');

      const { model, modelInfo, modelString } = await resolveModelFromHeaders(req, {
        allowOpenAIModelOverride: true,
      });
      const language = body.language === 'en-US' ? 'en-US' : 'zh-CN';
      const aiCall: AICallFn = async (systemPrompt, userPrompt) => {
        const result = await callLLM(
          {
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            maxOutputTokens: modelInfo?.outputWindow,
          },
          'notebook-micro-lesson',
        );
        return result.text;
      };

      const requirements: UserRequirements = {
        language,
        requirement:
          language === 'en-US'
            ? `Create a temporary in-chat lesson deck from this student problem. Keep exactly 3-5 pages. Focus on: problem understanding, algorithm idea, direct answers to sub-questions, complexity, and common pitfalls. Also include problem-type-specific explanation when relevant: for code questions explain the code line by line and trace execution; for proof questions explain proof format and proof steps; for math questions show the derivation step by step; for other subjects explain the answering framework and evidence chain.\n\nStudent problem:\n${question}`
            : `根据以下学生题目生成一个聊天内临时讲解课件，控制在 3-5 页。重点覆盖：题意理解、算法思路、逐问答案、复杂度、常见误区。同时要按题型补充讲解：代码题要逐行解释并 trace 执行过程；证明题要讲证明格式与证明步骤；数学题要分步推导；其他学科要讲清答题框架和证据链。\n\n学生题目：\n${question}`,
      };

      log.info(`Notebook micro-lesson (main pipeline) [model=${modelString}]`);
      const outlinesResult = await generateSceneOutlinesFromRequirements(
        requirements,
        undefined,
        undefined,
        aiCall,
        undefined,
        {
          imageGenerationEnabled: false,
          videoGenerationEnabled: false,
          researchContext: language === 'en-US' ? 'None' : '无',
          teacherContext: '',
        },
      );
      if (!outlinesResult.success || !outlinesResult.data) {
        return apiError(
          'GENERATION_FAILED',
          500,
          outlinesResult.error || 'Failed to generate outlines',
        );
      }

      const outlines = normalizeOutlines(outlinesResult.data, language);
      const store = createInMemoryStore(`micro_stage_${nanoid(8)}`);
      const scenesResult = await generateFullScenes(outlines, store, aiCall);
      if (!scenesResult.success) {
        return apiError(
          'GENERATION_FAILED',
          500,
          scenesResult.error || 'Failed to generate scenes',
        );
      }
      const scenes = [...store.getState().scenes].sort((a, b) => a.order - b.order);
      if (scenes.length === 0) {
        return apiError('GENERATION_FAILED', 500, 'No scenes generated');
      }
      return apiSuccess({ scenes });
    } catch (error) {
      log.error('micro-lesson route error:', error);
      return apiError(
        'INTERNAL_ERROR',
        500,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  });
}
