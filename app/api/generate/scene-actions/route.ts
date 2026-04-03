/**
 * Scene Actions Generation API
 *
 * Generates actions for a scene given its outline and content,
 * then assembles the complete Scene object.
 * This is the second half of the two-step scene generation pipeline.
 */

import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import {
  generateSceneActions,
  buildFallbackSceneActions,
  buildCompleteScene,
  buildVisionUserContent,
  type SceneGenerationContext,
  type AgentInfo,
  type CoursePersonalizationContext,
} from '@/lib/generation/generation-pipeline';
import type { SceneOutline } from '@/lib/types/generation';
import type {
  GeneratedSlideContent,
  GeneratedQuizContent,
  GeneratedInteractiveContent,
  GeneratedPBLContent,
} from '@/lib/types/generation';
import type { SpeechAction } from '@/lib/types/action';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { runWithRequestContext } from '@/lib/server/request-context';

const log = createLogger('Scene Actions API');

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      outline,
      allOutlines,
      content,
      stageId,
      agents,
      previousSpeeches: incomingPreviousSpeeches,
      userProfile,
    } = body as {
      outline: SceneOutline;
      allOutlines: SceneOutline[];
      content:
        | GeneratedSlideContent
        | GeneratedQuizContent
        | GeneratedInteractiveContent
        | GeneratedPBLContent;
      stageId: string;
      notebookName?: string;
      agents?: AgentInfo[];
      previousSpeeches?: string[];
      userProfile?: string;
      courseContext?: CoursePersonalizationContext;
    };

    // Validate required fields
    if (!outline) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'outline is required');
    }
    if (!allOutlines || allOutlines.length === 0) {
      return apiError(
        'MISSING_REQUIRED_FIELD',
        400,
        'allOutlines is required and must not be empty',
      );
    }
    if (!content) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'content is required');
    }
    if (!stageId) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'stageId is required');
    }

    const pageIndex = allOutlines.findIndex((o) => o.id === outline.id);
    const normalizedLanguage =
      outline.language ||
      (pageIndex >= 0 ? allOutlines[pageIndex]?.language : undefined) ||
      allOutlines.find((item) => item.language)?.language ||
      'zh-CN';
    const usageContext = {
      notebookId: stageId.trim(),
      notebookName: body.notebookName?.trim() || undefined,
      courseName: body.courseContext?.name?.trim() || undefined,
      sceneTitle: outline.title.trim() || undefined,
      sceneOrder: outline.order,
      sceneType: outline.type,
      operationCode: 'scene_actions_generation',
      chargeReason: '生成讲解动作',
    } as const;

    // ── Model resolution from request headers ──
    const { model: languageModel, modelInfo, modelString } = await resolveModelFromHeaders(req, {
      allowOpenAIModelOverride: true,
    });

    // Detect vision capability
    const hasVision = !!modelInfo?.capabilities?.vision;

    // AI call function (actions typically don't use vision, but kept for consistency)
    const aiCall = async (
      systemPrompt: string,
      userPrompt: string,
      images?: Array<{ id: string; src: string }>,
    ): Promise<string> => {
      if (images?.length && hasVision) {
        const result = await runWithRequestContext(
          req,
          '/api/generate/scene-actions',
          () =>
            callLLM(
              {
                model: languageModel,
                system: systemPrompt,
                messages: [
                  {
                    role: 'user' as const,
                    content: buildVisionUserContent(userPrompt, images, normalizedLanguage),
                  },
                ],
                maxOutputTokens: modelInfo?.outputWindow,
              },
              'scene-actions',
            ),
          usageContext,
        );
        return result.text;
      }
      const result = await runWithRequestContext(
        req,
        '/api/generate/scene-actions',
        () =>
          callLLM(
            {
              model: languageModel,
              system: systemPrompt,
              prompt: userPrompt,
              maxOutputTokens: modelInfo?.outputWindow,
            },
            'scene-actions',
          ),
        usageContext,
      );
      return result.text;
    };

    // ── Build cross-scene context ──
    const allTitles = allOutlines.map((o) => o.title);
    const normalizedOutline: SceneOutline = {
      ...outline,
      language: normalizedLanguage,
    };
    const ctx: SceneGenerationContext = {
      pageIndex: (pageIndex >= 0 ? pageIndex : 0) + 1,
      totalPages: allOutlines.length,
      allTitles,
      previousSpeeches: incomingPreviousSpeeches ?? [],
    };

    // ── Generate actions ──
    log.info(
      `Generating actions: "${normalizedOutline.title}" (${normalizedOutline.type}) [model=${modelString}]`,
    );

    let actions = null;
    let generationError: unknown = null;
    try {
      actions = await generateSceneActions(
        normalizedOutline,
        content,
        aiCall,
        ctx,
        agents,
        userProfile,
        body.courseContext,
      );
    } catch (error) {
      generationError = error;
      log.error(`Scene actions generation threw for: "${outline.title}"`, error);
    }

    if (!actions) {
      actions = buildFallbackSceneActions(normalizedOutline, content, agents);
      log.warn(`Falling back to default actions for: "${outline.title}"`, {
        stageId,
        outlineId: outline.id,
        outlineType: outline.type,
        error:
          generationError instanceof Error
            ? generationError.message
            : generationError
              ? String(generationError)
              : 'unknown-actions-error',
      });
    }

    log.info(`Generated ${actions.length} actions for: "${normalizedOutline.title}"`);

    // ── Build complete scene ──
    const scene = buildCompleteScene(normalizedOutline, content, actions, stageId);

    if (!scene) {
      log.error(`Failed to build scene: "${outline.title}"`);

      return apiError('GENERATION_FAILED', 500, `Failed to build scene: ${outline.title}`);
    }

    // ── Extract speeches for cross-scene coherence ──
    const outputPreviousSpeeches = (scene.actions || [])
      .filter((a): a is SpeechAction => a.type === 'speech')
      .map((a) => a.text);

    log.info(
      `Scene assembled successfully: "${outline.title}" — ${scene.actions?.length ?? 0} actions`,
    );

    return apiSuccess({
      scene,
      previousSpeeches: outputPreviousSpeeches,
      fallbackUsed: Boolean(generationError),
    });
  } catch (error) {
    log.error('Scene actions generation error:', error);
    return apiError('INTERNAL_ERROR', 500, error instanceof Error ? error.message : String(error));
  }
}
