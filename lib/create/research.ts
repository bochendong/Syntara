'use client';

import { useSettingsStore } from '@/lib/store/settings';
import { backendFetch } from '@/lib/utils/backend-api';
import { getNotebookGenerationTrackingHeaders } from './generation-headers';

export type WebSearchSource = {
  title: string;
  url: string;
};

export async function maybeRunWebSearch(args: {
  requirement: string;
  enabled: boolean;
  signal?: AbortSignal;
  tracking?: {
    notebookGenerationSessionId?: string | null;
    notebookGenerationTaskId?: string | null;
    testNoCharge?: boolean;
  };
  usageContext?: {
    courseId?: string;
    courseName?: string;
    operationCode?: string;
    chargeReason?: string;
  };
}): Promise<{ context?: string; sources: WebSearchSource[] }> {
  if (!args.enabled) return { context: undefined, sources: [] };

  const settings = useSettingsStore.getState();
  const apiKey =
    settings.webSearchProvidersConfig?.[settings.webSearchProviderId]?.apiKey || undefined;

  const res = await backendFetch('/api/web-search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getNotebookGenerationTrackingHeaders(args.tracking),
    },
    body: JSON.stringify({
      query: args.requirement,
      apiKey,
      usageContext: args.usageContext,
    }),
    signal: args.signal,
  });

  if (!res.ok) {
    return { context: undefined, sources: [] };
  }

  const data = await res.json();
  return {
    context: data.context || undefined,
    sources: Array.isArray(data.sources) ? data.sources.slice(0, 8) : [],
  };
}
