import { getApiHeaders } from '@/lib/create/generation-headers';

import { HTML_SINGLE_PAGE_MODEL } from './types';

export function getHtmlSinglePageHeaders(): HeadersInit {
  const headers = new Headers(
    getApiHeaders({
      imageGenerationEnabled: false,
      modelIdOverride: HTML_SINGLE_PAGE_MODEL,
    }),
  );
  headers.set('x-generation-test-no-charge', 'true');
  return headers;
}
