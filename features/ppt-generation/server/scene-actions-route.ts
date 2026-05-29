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
  type SceneActionContinuityContext,
  type SceneActionCourseSpineContext,
  type SceneActionFocusPlanItem,
  type SceneActionNarrationPolicy,
  type AgentInfo,
  type CoursePersonalizationContext,
  type SceneOutline,
  type GeneratedSlideContent,
  type GeneratedQuizContent,
  type GeneratedInteractiveContent,
  type GeneratedPBLContent,
} from '@/features/ppt-generation/domain/scene-actions';
import type { Action, SpeechAction } from '@/lib/types/action';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromHeadersForNotebookStage } from '@/lib/server/resolve-model';
import { runWithRequestContext } from '@/lib/server/request-context';
import { semanticSpotlightTargetIds } from '@/lib/notebook-content/semantic-spotlight';

const log = createLogger('Scene Actions API');

export const maxDuration = 60;

type SceneActionContextPayload = {
  courseSpine?: SceneActionCourseSpineContext;
  continuity?: SceneActionContinuityContext;
  focusPlan?: SceneActionFocusPlanItem[];
  narrationPolicy?: SceneActionNarrationPolicy;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function actionTargetIdsForContent(
  content:
    | GeneratedSlideContent
    | GeneratedQuizContent
    | GeneratedInteractiveContent
    | GeneratedPBLContent,
): Set<string> {
  const ids = new Set<string>();
  if ('elements' in content) {
    for (const element of content.elements || []) ids.add(element.id);
    if (content.contentDocument) {
      for (const id of semanticSpotlightTargetIds(content.contentDocument)) ids.add(id);
    }
  }
  return ids;
}

function buildLectureActionDiagnostics(args: {
  actions: Action[];
  content:
    | GeneratedSlideContent
    | GeneratedQuizContent
    | GeneratedInteractiveContent
    | GeneratedPBLContent;
  actionContext?: SceneActionContextPayload;
}) {
  const targetIds = actionTargetIdsForContent(args.content);
  const speechCount = args.actions.filter((action) => action.type === 'speech').length;
  const focusActions = args.actions.filter(
    (action) => action.type === 'spotlight' || action.type === 'laser',
  );
  const plannedFocusIds = new Set(
    (args.actionContext?.focusPlan || []).map((target) => target.targetId).filter(Boolean),
  );
  const unresolvedFocusElementIds = focusActions
    .map((action) => action.elementId)
    .filter((id) => targetIds.size > 0 && (!id || !targetIds.has(id)));
  const focusOutsidePlanIds = focusActions
    .map((action) => action.elementId)
    .filter((id) => plannedFocusIds.size > 0 && !plannedFocusIds.has(id));
  let maxConsecutiveSpeech = 0;
  let currentConsecutiveSpeech = 0;
  let focusWithoutFollowingSpeech = 0;

  for (let index = 0; index < args.actions.length; index += 1) {
    const action = args.actions[index];
    if (action.type === 'speech') {
      currentConsecutiveSpeech += 1;
      maxConsecutiveSpeech = Math.max(maxConsecutiveSpeech, currentConsecutiveSpeech);
      continue;
    }
    if (action.type === 'spotlight' || action.type === 'laser') {
      currentConsecutiveSpeech = 0;
      const nextSpeech = args.actions
        .slice(index + 1, index + 4)
        .some((item) => item.type === 'speech');
      if (!nextSpeech) focusWithoutFollowingSpeech += 1;
    }
  }

  const policy = args.actionContext?.narrationPolicy;
  const warnings: string[] = [];
  if (policy?.minSpeechSegments && speechCount < policy.minSpeechSegments) {
    warnings.push(`speech action 数量 ${speechCount} 低于本页建议下限 ${policy.minSpeechSegments}`);
  }
  if ((args.actionContext?.focusPlan?.length || targetIds.size) && focusActions.length === 0) {
    warnings.push('本页有可聚焦目标，但没有 spotlight/laser action');
  }
  if (unresolvedFocusElementIds.length) {
    warnings.push(`有 ${unresolvedFocusElementIds.length} 个 focus action 找不到目标元素`);
  }
  if (focusOutsidePlanIds.length) {
    warnings.push(`有 ${focusOutsidePlanIds.length} 个 focus action 没有使用本页 focusPlan 目标`);
  }
  if (
    policy?.maxConsecutiveSpeechWithoutFocus &&
    maxConsecutiveSpeech > policy.maxConsecutiveSpeechWithoutFocus
  ) {
    warnings.push(
      `连续 speech 数量 ${maxConsecutiveSpeech} 超过建议上限 ${policy.maxConsecutiveSpeechWithoutFocus}`,
    );
  }
  if (policy?.requireSpeechAfterFocus && focusWithoutFollowingSpeech > 0) {
    warnings.push(`${focusWithoutFollowingSpeech} 个 focus action 后面没有紧跟讲解`);
  }

  return {
    speechCount,
    focusCount: focusActions.length,
    focusTargetCount: targetIds.size,
    unresolvedFocusElementIds,
    focusOutsidePlanIds,
    maxConsecutiveSpeech,
    focusWithoutFollowingSpeech,
    warnings,
  };
}

function sanitizeSpeechForTts(text: string): string {
  return text
    .replace(/([A-Za-z0-9]+)_\{([^}]+)\}/g, '$1 下标 $2')
    .replace(/([A-Za-z0-9]+)_([A-Za-z0-9]+)/g, '$1 下标 $2')
    .replace(/([A-Za-z0-9]+)\^\{([^}]+)\}/g, '$1 的 $2 次方')
    .replace(/([A-Za-z0-9]+)\^2/g, '$1 的平方')
    .replace(/([A-Za-z0-9]+)\^3/g, '$1 的三次方')
    .replace(/([A-Za-z0-9]+)\^([A-Za-z0-9]+)/g, '$1 的 $2 次方')
    .replace(/√\s*([A-Za-z0-9]+)/g, '根号 $1')
    .replace(/∫/g, '积分')
    .replace(/π/g, '派')
    .replace(/θ/g, 'theta')
    .replace(/Δ/g, 'delta')
    .replace(/\bdx\b/g, 'd x')
    .replace(/\bdu\b/g, 'd u')
    .replace(/\bdy\b/g, 'd y')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeSpeechActions(actions: Action[]): Action[] {
  return actions.map((action) =>
    action.type === 'speech' ? { ...action, text: sanitizeSpeechForTts(action.text) } : action,
  );
}

function applyImageNotebookFocusDefaults(
  actions: Action[],
  actionContext?: SceneActionContextPayload,
): Action[] {
  const plannedFocusIds = new Set(
    (actionContext?.focusPlan || []).map((target) => target.targetId).filter(Boolean),
  );
  if (plannedFocusIds.size === 0) return actions;

  return actions.map((action) => {
    if (action.type !== 'spotlight' || !plannedFocusIds.has(action.elementId)) return action;
    return {
      ...action,
      dimOpacity: 0.76,
    };
  });
}

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
      actionContext?: SceneActionContextPayload;
    };
    const actionContext = isRecord(body.actionContext)
      ? (body.actionContext as SceneActionContextPayload)
      : undefined;

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
    const {
      model: languageModel,
      modelInfo,
      modelString,
    } = await resolveModelFromHeadersForNotebookStage(req, 'actions', {
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
      courseSpine: actionContext?.courseSpine,
      continuity: actionContext?.continuity,
      focusPlan: actionContext?.focusPlan,
      narrationPolicy: actionContext?.narrationPolicy,
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

    actions = applyImageNotebookFocusDefaults(sanitizeSpeechActions(actions), actionContext);
    log.info(`Generated ${actions.length} actions for: "${normalizedOutline.title}"`);

    // ── Build complete scene ──
    const scene = buildCompleteScene(normalizedOutline, content, actions, stageId);

    if (!scene) {
      log.error(`Failed to build scene: "${outline.title}"`);

      return apiError('GENERATION_FAILED', 500, `Failed to build scene: ${outline.title}`);
    }

    scene.generationDiagnostics = {
      ...scene.generationDiagnostics,
      lectureActionDiagnostics: buildLectureActionDiagnostics({
        actions,
        content,
        actionContext,
      }),
    };

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
