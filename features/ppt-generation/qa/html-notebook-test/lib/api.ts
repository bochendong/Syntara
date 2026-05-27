import { getApiHeaders } from '@/lib/create/generation-headers';
import { backendFetch } from '@/lib/utils/backend-api';

import { HTML_LESSON_MODEL } from './types';

export function getHtmlLessonTestHeaders(): HeadersInit {
  const headers = new Headers(
    getApiHeaders({
      imageGenerationEnabled: false,
      modelIdOverride: HTML_LESSON_MODEL,
    }),
  );
  headers.set('x-generation-test-no-charge', 'true');
  return headers;
}

export async function backendFetchWithTimeout(
  path: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await backendFetch(path, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}
