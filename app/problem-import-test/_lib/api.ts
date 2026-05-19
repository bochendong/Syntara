import { getApiHeaders } from '@/lib/create/generation-headers';

import { PDF_LLM_TEST_MODEL } from './types';

export function getProblemImportTestHeaders(): HeadersInit {
  const headers = new Headers(
    getApiHeaders({
      imageGenerationEnabled: false,
      modelIdOverride: PDF_LLM_TEST_MODEL,
    }),
  );
  headers.set('x-generation-test-no-charge', 'true');
  return headers;
}
