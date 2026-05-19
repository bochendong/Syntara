import {
  buildHtmlSlideDensityContract,
  buildHtmlSlideStructuredContext,
} from '@/features/ppt-generation/html-slide-contracts';
export {
  hasBuiltInCoverImage,
  hasCoverTitleCardShell,
  hasCoverVisualBackground,
  hasExternalCoverAsset,
  hasForbiddenCoverVisibleText,
} from '@/features/ppt-generation/html-slide-quality';
import { analyzeHtml } from './pipeline-html';
import { backendFetchWithTimeout, getPipelineHeaders } from './pipeline-network';
import { getSlideCanvasHeight, getSlideCanvasMode } from './pipeline-format';
import { HTML_SLIDE_REQUEST_TIMEOUT_MS } from './pipeline-types';
import type {
  GenerateHtmlPptResponse,
  HtmlPageError,
  HtmlPageResult,
  LessonPlan,
  LessonSlidePlan,
  SourcePackageImage,
  SourcePackagePage,
  TestfileFixture,
} from './pipeline-types';

export function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

export async function requestHtmlSlide(args: {
  fixture: TestfileFixture | null;
  plan: LessonPlan;
  slide: LessonSlidePlan;
}): Promise<{ result?: HtmlPageResult; error?: HtmlPageError }> {
  const startedAt = Date.now();
  try {
    const assignedSourceImages = assignedSourceImagesForSlide(args.fixture, args.slide);
    const canvasMode = getSlideCanvasMode(args.slide);
    const canvasHeight = getSlideCanvasHeight(args.slide);
    const htmlPrompt = [
      args.slide.htmlPrompt,
      '',
      buildStructuredSlideContext(args.slide, args.plan),
    ]
      .filter(Boolean)
      .join('\n');
    const response = await backendFetchWithTimeout(
      '/api/generate/html-ppt-slide',
      {
        method: 'POST',
        headers: getPipelineHeaders(),
        body: JSON.stringify({
          prompt: htmlPrompt,
          pageKind: args.slide.pageKind,
          lessonPlan: args.plan,
          slidePlan: args.slide,
          canvasMode,
          canvasHeight,
          courseRoute: args.slide.courseRoute,
          csRoute: args.slide.csRoute,
          mathRoute: args.slide.mathRoute,
          codeRoute:
            args.slide.csRoute === 'memory-diagram'
              ? 'memory-trace'
              : args.slide.csRoute === 'execution-trace'
                ? 'execution-trace'
                : undefined,
          densityContract: buildDensityContract(args.slide),
          assignedSourceImages,
        }),
      },
      HTML_SLIDE_REQUEST_TIMEOUT_MS,
    );
    const data = (await response.json().catch(() => ({}))) as GenerateHtmlPptResponse;
    if (!response.ok || data.success === false || !data.html) {
      return {
        error: {
          slideId: args.slide.id,
          slideTitle: args.slide.title,
          order: args.slide.order,
          message: data.error || `HTML 生成失败：HTTP ${response.status}`,
          details: data.details,
          httpStatus: response.status,
          createdAt: Date.now(),
        },
      };
    }
    const stats = analyzeHtml(data.html);
    return {
      result: {
        slideId: args.slide.id,
        slideTitle: args.slide.title,
        order: args.slide.order,
        html: data.html,
        htmlLength: data.html.length,
        elementCount: stats.elementCount,
        textNodeCount: stats.textNodeCount,
        durationMs: Date.now() - startedAt,
        canvasMode,
        canvasHeight,
        usage: data.usage || null,
        costEstimate: data.costEstimate || null,
        generationAttempts: data.generationAttempts,
        retryReasons: data.retryReasons,
        sourceImageUsage: data.sourceImageUsage,
        createdAt: Date.now(),
      },
    };
  } catch (caught) {
    return {
      error: {
        slideId: args.slide.id,
        slideTitle: args.slide.title,
        order: args.slide.order,
        message:
          caught instanceof DOMException && caught.name === 'AbortError'
            ? 'HTML 生成请求超时'
            : caught instanceof Error
              ? caught.message
              : String(caught),
        details:
          caught instanceof DOMException && caught.name === 'AbortError'
            ? `单页生成超过 ${Math.round(HTML_SLIDE_REQUEST_TIMEOUT_MS / 1000)} 秒。`
            : undefined,
        createdAt: Date.now(),
      },
    };
  }
}

export function buildDensityContract(slide: LessonSlidePlan): string {
  return buildHtmlSlideDensityContract(slide, { includeCoverVisualContract: true });
}

export function buildStructuredSlideContext(slide: LessonSlidePlan, plan: LessonPlan): string {
  return buildHtmlSlideStructuredContext(slide, plan, {
    heading: '--- Pipeline slide contract ---',
    includeCoverVisualContract: true,
  });
}

export function assignedSourceImagesForSlide(
  fixture: TestfileFixture | null,
  slide: LessonSlidePlan,
): SourcePackageImage[] {
  const ids = new Set(slide.sourceImageIds || []);
  if (!ids.size) return [];
  return (fixture?.sourcePackage?.sourceImages || []).filter((image) => ids.has(image.id));
}

export function sourcePagesFromFixture(fixture: TestfileFixture): SourcePackagePage[] {
  if (fixture.sourcePackage?.sourcePages?.length) return fixture.sourcePackage.sourcePages;
  return fixture.outlines.map((outline, index) => ({
    sourceIndex: index + 1,
    sourceLabel: `SceneOutline ${index + 1}`,
    title: outline.title,
    summary: outline.description,
    rawText: [outline.title, outline.description, ...(outline.keyPoints || [])].join('\n'),
    keyPoints: outline.keyPoints || [],
    concreteAnchor: outline.teachingPagePlan?.concreteAnchor || outline.description,
    suggestedPageKind: outline.archetype || 'auto',
    imageIds: [],
  }));
}

export function sourceTextFromFixture(fixture: TestfileFixture | null): string {
  if (!fixture) return '';
  return fixture.sourcePackage?.sourceText || '';
}

export function sourceTextPreview(fixture: TestfileFixture | null, maxLength = 6000): string {
  const text = sourceTextFromFixture(fixture).trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}\n\n... 已截断预览，完整 sourceText 长度 ${text.length} 字符。`;
}
