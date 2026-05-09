type SceneContentDiagnosticsPayload = {
  pipeline?: string;
  slideGenerationRoute?: string;
  failureStage?: string;
  failureReasons?: string[];
  semanticRetryCount?: number;
  layoutRetryCount?: number;
  contentFallbackUsed?: boolean;
  fallbackKind?: string;
};

function summarizeSceneContentDiagnostics(details: string | undefined): string | null {
  if (!details?.trim()) return null;
  try {
    const parsed = JSON.parse(details) as {
      diagnostics?: SceneContentDiagnosticsPayload;
    };
    const diagnostics = parsed?.diagnostics;
    if (!diagnostics) return null;

    const reasons = Array.isArray(diagnostics.failureReasons)
      ? diagnostics.failureReasons.filter((item) => typeof item === 'string' && item.trim())
      : [];

    const parts: string[] = [];
    if (diagnostics.pipeline) parts.push(`pipeline=${diagnostics.pipeline}`);
    if (diagnostics.slideGenerationRoute) parts.push(`route=${diagnostics.slideGenerationRoute}`);
    if (diagnostics.failureStage) parts.push(`stage=${diagnostics.failureStage}`);
    if (reasons.length > 0) parts.push(`reason=${reasons.slice(0, 2).join(' | ')}`);
    if (diagnostics.contentFallbackUsed) {
      parts.push(`fallback=${diagnostics.fallbackKind || 'true'}`);
    }
    if (Number.isFinite(diagnostics.semanticRetryCount)) {
      parts.push(`semanticRetries=${diagnostics.semanticRetryCount}`);
    }
    if (Number.isFinite(diagnostics.layoutRetryCount) && diagnostics.layoutRetryCount! > 0) {
      parts.push(`layoutRetries=${diagnostics.layoutRetryCount}`);
    }

    return parts.length > 0 ? parts.join('; ') : null;
  } catch {
    return null;
  }
}

function extractFailureStageFromMessage(message: string): string | null {
  const stageMatch = message.match(/stage=([a-zA-Z0-9_:-]+)/);
  return stageMatch?.[1] || null;
}

export function buildShortFailureReason(message: string): string {
  const stage = extractFailureStageFromMessage(message);
  if (stage) return stage;
  const compact = message.replace(/\s+/g, ' ').trim();
  return compact.length > 64 ? `${compact.slice(0, 64)}...` : compact;
}

export async function readApiErrorMessage(response: Response, fallback: string): Promise<string> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
      details?: string;
    } | null;
    const diagnosticsSummary = summarizeSceneContentDiagnostics(data?.details);
    const baseMessage = data?.message?.trim() || data?.error?.trim() || '';
    if (baseMessage && diagnosticsSummary) return `${baseMessage} (${diagnosticsSummary})`;
    if (baseMessage) return baseMessage;
    if (diagnosticsSummary) return `${fallback} (${diagnosticsSummary})`;
  }

  const text = await response.text().catch(() => '');
  return text.trim() || fallback;
}

export function buildPayloadTooLargeMessage(
  language: 'zh-CN' | 'en-US',
  stage: 'outline' | 'scene',
): string {
  if (language === 'en-US') {
    return stage === 'outline'
      ? 'Outline generation payload is still too large for the current deployment platform. Keep fewer pages or switch image-heavy pages to screenshots.'
      : 'Slide generation payload is still too large for the current deployment platform. Keep fewer image-heavy pages or switch them to screenshots.';
  }

  return stage === 'outline'
    ? '当前大纲生成请求体仍然过大，请继续减少保留页面，或把重图片页改成整页截图。'
    : '当前页面生成请求体仍然过大，请继续减少重图片页面，或把它们改成整页截图。';
}
