import type { SceneGenerationDiagnostics } from '@/lib/types/stage';

import { isRecord } from './page-state';
import type { GenerationErrorResult, SceneContentResponse } from './page-types';

export function parseGenerationErrorDetails(details: string | undefined): {
  error?: string;
  diagnostics?: SceneGenerationDiagnostics;
  raw: unknown;
} | null {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details) as unknown;
    if (!isRecord(parsed)) return { raw: parsed };
    return {
      error: typeof parsed.error === 'string' ? parsed.error : undefined,
      diagnostics: isRecord(parsed.diagnostics)
        ? (parsed.diagnostics as SceneGenerationDiagnostics)
        : undefined,
      raw: parsed,
    };
  } catch {
    return null;
  }
}

export function buildGenerationErrorResult(
  data: Pick<SceneContentResponse, 'error' | 'details' | 'generationDiagnostics'>,
  httpStatus: number,
  fallbackMessage: string,
): GenerationErrorResult {
  const parsedDetails = parseGenerationErrorDetails(data.details);
  return {
    message: data.error || parsedDetails?.error || fallbackMessage,
    details: data.details,
    diagnostics: data.generationDiagnostics || parsedDetails?.diagnostics,
    rawDetails: parsedDetails?.raw,
    httpStatus,
    createdAt: Date.now(),
  };
}

export function buildUnknownErrorResult(error: unknown): GenerationErrorResult {
  return {
    message: error instanceof Error ? error.message : String(error),
    createdAt: Date.now(),
  };
}
