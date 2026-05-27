import {
  HTML_SLIDE_REQUEST_TIMEOUT_MS,
  type FixturesResponse,
  type GenerateHtmlPptResponse,
  type GenerationErrorResult,
  type LessonPlanResponse,
} from './types';

export function buildErrorResult(
  data: FixturesResponse | LessonPlanResponse | GenerateHtmlPptResponse,
  status: number,
  fallback: string,
): GenerationErrorResult {
  return {
    message: data.error || fallback,
    details: data.details,
    httpStatus: status,
    createdAt: Date.now(),
  };
}

export function buildUnknownErrorResult(error: unknown): GenerationErrorResult {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return {
      message: 'HTML 生成请求超时',
      details: `单页生成超过 ${Math.round(HTML_SLIDE_REQUEST_TIMEOUT_MS / 1000)} 秒没有返回，已跳过这一页并继续后续队列。`,
      createdAt: Date.now(),
    };
  }
  return {
    message: error instanceof Error ? error.message : String(error),
    createdAt: Date.now(),
  };
}
