import type { NextRequest } from 'next/server';
import { normalizeComputerScienceSceneOutline } from '@/lib/generation/cs-semantic-normalizer';
import { hasCriticalImageNotebookQaFailure } from '@/lib/generation/image-notebook-quality';
import {
  buildFullPageImageSlideContent,
  buildNotebookImagePrompt,
  buildNotebookPageActionContextSeed,
  imageResultToUrl,
  NOTEBOOK_IMAGE2_MODEL_ID,
  NOTEBOOK_IMAGE2_PROVIDER_ID,
  qaFindingsText,
  sourceImagesFromMedia,
} from '@/lib/generation/notebook-page-content';
import { spliceGeneratedOutlines } from '@/lib/generation/continuation-pages';
import {
  normalizeNotebookSlideGenerationRoute,
  type SlideGenerationRoute,
} from '@/lib/generation/slide-generation-route';
import type { ImageGenerationResult } from '@/lib/media/types';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import type { ImageMapping, PdfImage, SceneOutline } from '@/lib/types/generation';
import type { Scene, SceneGenerationDiagnostics, Stage } from '@/lib/types/stage';
import { readApiErrorMessage } from '@/lib/create/api-errors';
import type { AgentInfo, CoursePersonalizationContext } from '@/lib/generation/pipeline-types';

export const maxDuration = 300;

type NotebookPageContentRequestBody = {
  outline?: SceneOutline;
  allOutlines?: SceneOutline[];
  stage?: Stage;
  stageInfo?: Pick<Stage, 'id' | 'name' | 'description' | 'language' | 'style' | 'courseId'>;
  agents?: AgentInfo[];
  courseContext?: CoursePersonalizationContext;
  pdfImages?: PdfImage[];
  imageMapping?: ImageMapping;
  slideGenerationRoute?: SlideGenerationRoute;
  imageNotebookMaxAttempts?: number;
  includeActions?: boolean;
  previousSpeeches?: string[];
  userProfile?: string;
};

type GeneratedSceneContentBundlePayload = {
  contents: unknown[];
  effectiveOutlines: SceneOutline[];
  allOutlinesForActions: SceneOutline[];
  generationDiagnostics?: SceneGenerationDiagnostics;
  imageNotebookQaByOutlineId?: Record<string, unknown>;
  contentDiagnosticsByOutlineId?: Record<string, SceneGenerationDiagnostics>;
  actionContextsByOutlineId?: Record<string, unknown>;
};

function forwardJsonHeaders(req: NextRequest): Headers {
  const headers = new Headers(req.headers);
  headers.set('Content-Type', 'application/json');
  headers.delete('host');
  headers.delete('content-length');
  headers.delete('connection');
  headers.delete('accept-encoding');
  return headers;
}

function imageGenerationHeaders(req: NextRequest): Headers {
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  headers.set('x-image-provider', NOTEBOOK_IMAGE2_PROVIDER_ID);
  headers.set('x-image-model', NOTEBOOK_IMAGE2_MODEL_ID);
  headers.set(
    'x-api-key',
    req.headers.get('x-image-api-key') || req.headers.get('x-api-key') || '',
  );
  headers.set('x-base-url', req.headers.get('x-image-base-url') || '');

  for (const name of [
    'x-user-id',
    'x-user-email',
    'x-user-name',
    'x-notebook-generation-session-id',
    'x-notebook-generation-task-id',
    'x-generation-test-no-charge',
  ]) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function stageFromBody(body: NotebookPageContentRequestBody): Stage {
  const raw = body.stage || body.stageInfo;
  return {
    id: raw?.id || 'notebook-page-content-test',
    courseId: raw?.courseId,
    name: raw?.name || 'Notebook page content test',
    description: raw?.description || '',
    language: raw?.language === 'en-US' ? 'en-US' : 'zh-CN',
    style: raw?.style,
    createdAt: body.stage?.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
}

async function postInternalJson<T>(
  req: NextRequest,
  path: string,
  payload: unknown,
  headers = forwardJsonHeaders(req),
): Promise<T> {
  const response = await fetch(new URL(path, req.url), {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const message = await readApiErrorMessage(response, `${path} failed`);
    throw new Error(message || `${path} failed`);
  }
  return (await response.json()) as T;
}

function diagnosticsByOutline(
  diagnostics: unknown,
  effectiveOutlines: SceneOutline[],
): Record<string, SceneGenerationDiagnostics> | undefined {
  if (!diagnostics || typeof diagnostics !== 'object' || Array.isArray(diagnostics)) {
    return undefined;
  }
  return Object.fromEntries(
    effectiveOutlines.map((outline) => [
      outline.id,
      {
        ...(diagnostics as SceneGenerationDiagnostics),
        outlineId: outline.id,
        outlineTitle: outline.title,
      },
    ]),
  );
}

async function generateImageNotebookContentBundle(args: {
  req: NextRequest;
  body: NotebookPageContentRequestBody;
  outline: SceneOutline;
  allOutlines: SceneOutline[];
  stage: Stage;
}): Promise<{
  bundle: GeneratedSceneContentBundlePayload;
  imageUrl: string;
  imageResult?: ImageGenerationResult;
  imagePrompt: string;
  imageGenerationAttempts: Array<{ attempt: number; prompt: string; qa?: unknown }>;
}> {
  const assignedSourceImages = sourceImagesFromMedia({
    pdfImages: args.body.pdfImages,
    imageMapping: args.body.imageMapping,
  });
  const baseImagePrompt = buildNotebookImagePrompt({
    outline: args.outline,
    allOutlines: args.allOutlines,
    stage: args.stage,
    assignedSourceImages,
  });
  let imagePrompt = baseImagePrompt;
  let imageUrl = '';
  let imageResult: ImageGenerationResult | undefined;
  let qaResult: unknown;
  let pageBrief = args.outline.imageNotebookBrief;
  const imageGenerationAttempts: Array<{ attempt: number; prompt: string; qa?: unknown }> = [];
  const maxAttempts = Math.max(1, Math.min(3, args.body.imageNotebookMaxAttempts ?? 3));

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const imageData = await postInternalJson<{
      success?: boolean;
      result?: ImageGenerationResult;
      error?: string;
    }>(
      args.req,
      '/api/generate/image',
      {
        prompt: imagePrompt,
        aspectRatio: '16:9',
        notebookContext: {
          id: args.stage.id,
          name: args.stage.name,
          courseId: args.stage.courseId,
          sceneId: args.outline.id,
          sceneTitle: args.outline.title,
          sceneOrder: args.outline.order,
          sceneType: args.outline.type,
        },
      },
      imageGenerationHeaders(args.req),
    );
    imageResult = imageData.result;
    imageUrl = imageResultToUrl(imageResult);
    if (!imageData.success || !imageResult || !imageUrl) {
      throw new Error(imageData.error || 'PPT 图片页生成失败：响应里没有可展示的图片');
    }

    const qaData = await postInternalJson<{
      success?: boolean;
      qa?: unknown;
      error?: string;
    }>(args.req, '/api/generate/image-notebook-qa', {
      imageResult,
      imageUrl,
      pageBrief,
      outline: args.outline,
      allOutlines: args.allOutlines,
      language: args.outline.language || args.stage.language || 'zh-CN',
    });
    if (!qaData.success || !qaData.qa) {
      throw new Error(qaData.error || '图片页 QA 失败：响应里没有 QA 结果');
    }
    qaResult = qaData.qa;
    imageGenerationAttempts.push({ attempt, prompt: imagePrompt, qa: qaResult });

    const normalizedQa = qaResult as {
      passed?: boolean;
      revisedFocusRegions?: unknown[];
      regeneratePromptAddendum?: string;
    };
    if (
      Array.isArray(normalizedQa.revisedFocusRegions) &&
      normalizedQa.revisedFocusRegions.length
    ) {
      pageBrief = pageBrief
        ? {
            ...pageBrief,
            focusRegions: normalizedQa.revisedFocusRegions as typeof pageBrief.focusRegions,
          }
        : pageBrief;
    }
    if (normalizedQa.passed) break;

    const findings = qaFindingsText(qaResult as Parameters<typeof qaFindingsText>[0]);
    if (
      attempt >= maxAttempts ||
      hasCriticalImageNotebookQaFailure(qaResult as Parameters<typeof qaFindingsText>[0])
    ) {
      throw new Error(
        [
          '图片页 QA 未通过，未写入 notebook。',
          findings,
          normalizedQa.regeneratePromptAddendum
            ? `重画建议：${normalizedQa.regeneratePromptAddendum}`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
      );
    }

    imagePrompt = [
      baseImagePrompt,
      '',
      `Regenerate attempt ${attempt + 1}: fix these QA failures exactly.`,
      findings,
      normalizedQa.regeneratePromptAddendum || '',
      'Do not change correct formulas or titles while fixing the failures.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  const effectiveOutline: SceneOutline = {
    ...args.outline,
    imageNotebookBrief: pageBrief,
    type: 'slide',
  };
  const allOutlinesForActions = args.allOutlines.map((outline) =>
    outline.id === effectiveOutline.id ? effectiveOutline : outline,
  );
  const imageContent = buildFullPageImageSlideContent({
    imageUrl,
    prompt: imagePrompt,
    outline: effectiveOutline,
    stage: args.stage,
  });
  const diagnostics: SceneGenerationDiagnostics = {
    pipeline: 'image',
    slideGenerationRoute: 'image-ppt',
    generatedAt: Date.now(),
  };
  const bundle: GeneratedSceneContentBundlePayload = {
    contents: [imageContent],
    effectiveOutlines: [effectiveOutline],
    allOutlinesForActions,
    generationDiagnostics: diagnostics,
    imageNotebookQaByOutlineId: qaResult ? { [effectiveOutline.id]: qaResult } : undefined,
    contentDiagnosticsByOutlineId: {
      [effectiveOutline.id]: {
        ...diagnostics,
        outlineId: effectiveOutline.id,
        outlineTitle: effectiveOutline.title,
      },
    },
    actionContextsByOutlineId: {
      [effectiveOutline.id]: buildNotebookPageActionContextSeed({
        outline: effectiveOutline,
        allOutlines: allOutlinesForActions,
        stage: args.stage,
        content: imageContent,
      }),
    },
  };
  return { bundle, imageUrl, imageResult, imagePrompt, imageGenerationAttempts };
}

async function generateStandardContentBundle(args: {
  req: NextRequest;
  body: NotebookPageContentRequestBody;
  outline: SceneOutline;
  allOutlines: SceneOutline[];
  stage: Stage;
  slideGenerationRoute: SlideGenerationRoute;
}): Promise<GeneratedSceneContentBundlePayload> {
  const contentData = await postInternalJson<{
    success?: boolean;
    content?: unknown;
    contents?: unknown[];
    effectiveOutline?: SceneOutline;
    effectiveOutlines?: SceneOutline[];
    generationDiagnostics?: SceneGenerationDiagnostics;
    generationDiagnosticsByOutlineId?: Record<string, SceneGenerationDiagnostics>;
    error?: string;
  }>(args.req, '/api/generate/scene-content', {
    outline: args.outline,
    allOutlines: args.allOutlines,
    stageInfo: {
      name: args.stage.name,
      description: args.stage.description,
      language: args.stage.language,
      style: args.stage.style,
    },
    stageId: args.stage.id,
    agents: args.body.agents || [],
    courseContext: args.body.courseContext,
    pdfImages: args.body.pdfImages,
    imageMapping: args.body.imageMapping,
    slideGenerationRoute: args.slideGenerationRoute,
  });
  if (!contentData.success || !contentData.content) {
    throw new Error(contentData.error || '页面内容生成失败');
  }

  const contents = Array.isArray(contentData.contents)
    ? contentData.contents
    : [contentData.content];
  let effectiveOutlines = Array.isArray(contentData.effectiveOutlines)
    ? contentData.effectiveOutlines
    : [contentData.effectiveOutline || args.outline];
  const allOutlinesForActions =
    effectiveOutlines.length > 1
      ? (() => {
          const spliced = spliceGeneratedOutlines(
            args.allOutlines,
            args.outline.id,
            effectiveOutlines,
          );
          effectiveOutlines = spliced.effectiveOutlines;
          return spliced.outlines;
        })()
      : args.allOutlines;

  return {
    contents,
    effectiveOutlines,
    allOutlinesForActions,
    generationDiagnostics: contentData.generationDiagnostics,
    contentDiagnosticsByOutlineId:
      contentData.generationDiagnosticsByOutlineId ||
      diagnosticsByOutline(contentData.generationDiagnostics, effectiveOutlines),
    actionContextsByOutlineId: Object.fromEntries(
      effectiveOutlines.map((outline, index) => [
        outline.id,
        buildNotebookPageActionContextSeed({
          outline,
          allOutlines: allOutlinesForActions,
          stage: args.stage,
          content: contents[index],
        }),
      ]),
    ),
  };
}

async function generateActionsForBundle(args: {
  req: NextRequest;
  body: NotebookPageContentRequestBody;
  bundle: GeneratedSceneContentBundlePayload;
  stage: Stage;
}): Promise<{ scenes: Scene[]; effectiveOutlines: SceneOutline[]; previousSpeeches: string[] }> {
  const scenes: Scene[] = [];
  let previousSpeeches = args.body.previousSpeeches || [];
  for (let index = 0; index < args.bundle.effectiveOutlines.length; index += 1) {
    const outline = args.bundle.effectiveOutlines[index];
    const actionsData = await postInternalJson<{
      success?: boolean;
      scene?: Scene;
      previousSpeeches?: string[];
      error?: string;
    }>(args.req, '/api/generate/scene-actions', {
      outline,
      allOutlines: args.bundle.allOutlinesForActions,
      content: args.bundle.contents[index],
      stageId: args.stage.id,
      notebookName: args.stage.name,
      agents: args.body.agents || [],
      previousSpeeches,
      userProfile: args.body.userProfile,
      courseContext: args.body.courseContext,
      actionContext: args.bundle.actionContextsByOutlineId?.[outline.id],
    });
    if (!actionsData.success || !actionsData.scene) {
      throw new Error(actionsData.error || '讲解动作生成失败');
    }
    scenes.push(actionsData.scene);
    previousSpeeches = actionsData.previousSpeeches || previousSpeeches;
  }
  return {
    scenes,
    effectiveOutlines: args.bundle.effectiveOutlines,
    previousSpeeches,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as NotebookPageContentRequestBody | null;
    if (!body || !body.outline) {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'outline is required');
    }
    if (!Array.isArray(body.allOutlines) || body.allOutlines.length === 0) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'allOutlines is required and must not be empty',
      );
    }

    const stage = stageFromBody(body);
    const language = stage.language === 'en-US' ? 'en-US' : 'zh-CN';
    const outline = normalizeComputerScienceSceneOutline({
      ...body.outline,
      language: body.outline.language || language,
    });
    const allOutlines = body.allOutlines.map((candidate) =>
      normalizeComputerScienceSceneOutline({
        ...candidate,
        language: candidate.language || outline.language || language,
      }),
    );
    const slideGenerationRoute = normalizeNotebookSlideGenerationRoute(body.slideGenerationRoute);

    const imageResult =
      slideGenerationRoute === 'image-ppt'
        ? await generateImageNotebookContentBundle({
            req,
            body,
            outline,
            allOutlines,
            stage,
          })
        : undefined;
    const bundle =
      imageResult?.bundle ||
      (await generateStandardContentBundle({
        req,
        body,
        outline,
        allOutlines,
        stage,
        slideGenerationRoute,
      }));
    const actionsResult = body.includeActions
      ? await generateActionsForBundle({ req, body, bundle, stage })
      : undefined;

    return apiSuccess({
      contentBundle: bundle,
      actionsResult,
      slideGenerationRoute,
      image: imageResult && {
        imageUrl: imageResult.imageUrl,
        imageResult: imageResult.imageResult,
        imagePrompt: imageResult.imagePrompt,
        imageGenerationAttempts: imageResult.imageGenerationAttempts,
        providerId: NOTEBOOK_IMAGE2_PROVIDER_ID,
        modelId: NOTEBOOK_IMAGE2_MODEL_ID,
      },
    });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      error instanceof Error ? error.message : String(error),
    );
  }
}
