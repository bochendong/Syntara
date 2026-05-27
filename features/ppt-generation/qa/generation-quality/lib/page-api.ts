import { getApiHeaders } from '@/lib/create/generation-headers';

export function getGenerationQualityHeaders(options?: {
  allowLegacyCanvas?: boolean;
}): HeadersInit {
  const headers = new Headers(getApiHeaders({ imageGenerationEnabled: false }));
  headers.set('x-generation-test-no-charge', 'true');
  if (options?.allowLegacyCanvas) {
    headers.set('x-allow-legacy-canvas', 'true');
  }
  return headers;
}
