import { getApiHeaders } from '@/lib/create/generation-headers';

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
