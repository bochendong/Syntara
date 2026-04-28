'use client';

import { spliceGeneratedOutlines } from '@/lib/generation/continuation-pages';
import {
  buildBudgetedGenerationMedia,
  SAFE_GENERATION_REQUEST_BYTES,
} from '@/lib/generation/request-payload-budget';
import type { AgentInfo, CoursePersonalizationContext } from '@/lib/generation/pipeline-types';
import type { SlideGenerationRoute } from '@/lib/generation/slide-generation-route';
import type { ImageMapping, PdfImage, SceneOutline } from '@/lib/types/generation';
import type { Scene, Stage } from '@/lib/types/stage';
import { backendFetch } from '@/lib/utils/backend-api';
import { buildPayloadTooLargeMessage, readApiErrorMessage } from './api-errors';
import { getApiHeaders } from './generation-headers';

export type GeneratedSceneContentBundle = {
  contents: unknown[];
  effectiveOutlines: SceneOutline[];
  allOutlinesForActions: SceneOutline[];
};

export type SceneContentJobResult =
  | { success: true; bundle: GeneratedSceneContentBundle }
  | { success: false; error: string };

export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : fallback;
}

export function createLinkedAbortController(parent?: AbortSignal): AbortController {
  const controller = new AbortController();
  if (!parent) return controller;
  if (parent.aborted) {
    controller.abort();
  } else {
    parent.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller;
}

export async function generateSceneContentBundle(args: {
  outline: SceneOutline;
  allOutlines: SceneOutline[];
  stage: Stage;
  agents: AgentInfo[];
  courseContext?: CoursePersonalizationContext;
  signal?: AbortSignal;
  pdfImages?: PdfImage[];
  imageMapping?: ImageMapping;
  slideGenerationRoute?: SlideGenerationRoute | null;
  getHeaders?: () => HeadersInit;
}): Promise<GeneratedSceneContentBundle> {
  const suggestedIds = args.outline.suggestedImageIds || [];
  const filteredPdfImages =
    suggestedIds.length > 0
      ? (args.pdfImages || []).filter((image) => suggestedIds.includes(image.id))
      : undefined;
  const basePayload = {
    outline: args.outline,
    allOutlines: args.allOutlines,
    stageInfo: {
      name: args.stage.name,
      description: args.stage.description,
      language: args.stage.language,
      style: args.stage.style,
    },
    stageId: args.stage.id,
    agents: args.agents,
    courseContext: args.courseContext,
    slideGenerationRoute: args.slideGenerationRoute,
  };
  const budgetedMedia = buildBudgetedGenerationMedia({
    basePayload,
    pdfImages: filteredPdfImages,
    imageMapping: args.imageMapping,
    preferredImageIds: suggestedIds,
    maxRequestBytes: SAFE_GENERATION_REQUEST_BYTES,
  });

  const headers = (args.getHeaders ?? (() => getApiHeaders()))();
  const sendSceneContentRequest = (payload: Record<string, unknown>) =>
    backendFetch('/api/generate/scene-content', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: args.signal,
    });

  const primaryPayload = {
    ...basePayload,
    ...(budgetedMedia.pdfImages ? { pdfImages: budgetedMedia.pdfImages } : {}),
    ...(budgetedMedia.imageMapping ? { imageMapping: budgetedMedia.imageMapping } : {}),
  };
  const fallbackPayload = {
    ...basePayload,
    ...(budgetedMedia.pdfImages ? { pdfImages: budgetedMedia.pdfImages } : {}),
  };

  let contentResp = await sendSceneContentRequest(primaryPayload);
  if (contentResp.status === 413 && budgetedMedia.imageMapping) {
    console.warn(
      '[NotebookGeneration] Scene payload still too large, retrying without vision images',
      {
        outlineId: args.outline.id,
        outlineTitle: args.outline.title,
      },
    );
    contentResp = await sendSceneContentRequest(fallbackPayload);
  }

  if (!contentResp.ok) {
    const responseLanguage: 'zh-CN' | 'en-US' = args.stage.language === 'en-US' ? 'en-US' : 'zh-CN';
    const fallback =
      contentResp.status === 413
        ? buildPayloadTooLargeMessage(responseLanguage, 'scene')
        : responseLanguage === 'en-US'
          ? 'Scene content generation failed'
          : '页面内容生成失败';
    const message = await readApiErrorMessage(contentResp, fallback);
    throw new Error(message || fallback);
  }

  const contentData = await contentResp.json();
  if (!contentData?.success || !contentData?.content) {
    throw new Error(contentData?.error || '页面内容生成失败');
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
  };
}

export async function generateSceneActionsFromContent(args: {
  bundle: GeneratedSceneContentBundle;
  outline: SceneOutline;
  stage: Stage;
  agents: AgentInfo[];
  previousSpeeches: string[];
  userProfile?: string;
  courseContext?: CoursePersonalizationContext;
  signal?: AbortSignal;
  getHeaders?: () => HeadersInit;
}): Promise<{ scenes: Scene[]; effectiveOutlines: SceneOutline[]; previousSpeeches: string[] }> {
  const { contents, effectiveOutlines, allOutlinesForActions } = args.bundle;

  const scenes: Scene[] = [];
  let previousSpeeches = args.previousSpeeches;

  for (let pageIndex = 0; pageIndex < contents.length; pageIndex += 1) {
    const pageOutline = effectiveOutlines[pageIndex] || args.outline;
    const actionsResp = await backendFetch('/api/generate/scene-actions', {
      method: 'POST',
      headers: (args.getHeaders ?? (() => getApiHeaders()))(),
      body: JSON.stringify({
        outline: pageOutline,
        allOutlines: allOutlinesForActions,
        content: contents[pageIndex],
        stageId: args.stage.id,
        notebookName: args.stage.name,
        agents: args.agents,
        previousSpeeches,
        userProfile: args.userProfile,
        courseContext: args.courseContext,
      }),
      signal: args.signal,
    });

    if (!actionsResp.ok) {
      const data = await actionsResp.json().catch(() => ({ error: '页面讲解生成失败' }));
      throw new Error(data.error || '页面讲解生成失败');
    }

    const actionsData = await actionsResp.json();
    if (!actionsData?.success || !actionsData?.scene) {
      throw new Error(actionsData?.error || '页面讲解生成失败');
    }

    scenes.push(actionsData.scene as Scene);
    previousSpeeches = Array.isArray(actionsData.previousSpeeches)
      ? actionsData.previousSpeeches
      : previousSpeeches;
  }

  return {
    scenes,
    effectiveOutlines,
    previousSpeeches,
  };
}
