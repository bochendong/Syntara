'use client';

type DebugLogPayload = {
  hypothesisId: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp?: number;
};

export function emitDebugLog(payload: DebugLogPayload) {
  if (typeof window === 'undefined') return;
  void fetch('/api/debug-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      timestamp: payload.timestamp ?? Date.now(),
    }),
    keepalive: true,
  }).catch(() => {
    /* ignore debug logging failures */
  });
}
