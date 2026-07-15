import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

export type PublicApiPrincipal = {
  userId: string;
  keyId: string;
};

type PublicApiCredential = PublicApiPrincipal & { token: string };

export type PublicApiErrorCode =
  | 'unauthorized'
  | 'invalid_request'
  | 'unsupported_media_type'
  | 'not_found'
  | 'confirmation_required'
  | 'ambiguous_target'
  | 'upstream_error'
  | 'generation_failed'
  | 'internal_error';

function credentialsFromEnvironment(): PublicApiCredential[] {
  const credentials: PublicApiCredential[] = [];
  const raw = process.env.SYNTARA_PUBLIC_API_KEYS?.trim();

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        for (const [index, value] of parsed.entries()) {
          if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
          const record = value as Record<string, unknown>;
          const token = typeof record.token === 'string' ? record.token.trim() : '';
          const userId = typeof record.userId === 'string' ? record.userId.trim() : '';
          const keyId =
            typeof record.keyId === 'string' && record.keyId.trim()
              ? record.keyId.trim()
              : `key-${index + 1}`;
          if (token && userId) credentials.push({ token, userId, keyId });
        }
      } else if (parsed && typeof parsed === 'object') {
        for (const [token, value] of Object.entries(parsed as Record<string, unknown>)) {
          const userId =
            typeof value === 'string'
              ? value.trim()
              : value && typeof value === 'object' && !Array.isArray(value)
                ? String((value as Record<string, unknown>).userId || '').trim()
                : '';
          const keyId =
            value && typeof value === 'object' && !Array.isArray(value)
              ? String((value as Record<string, unknown>).keyId || '').trim()
              : '';
          if (token.trim() && userId) {
            credentials.push({ token: token.trim(), userId, keyId: keyId || 'configured-key' });
          }
        }
      }
    } catch {
      // The caller receives a normal unauthorized response. Do not expose env contents.
    }
  }

  const singleToken = process.env.SYNTARA_PUBLIC_API_KEY?.trim();
  const singleUserId = process.env.SYNTARA_PUBLIC_API_USER_ID?.trim();
  if (singleToken && singleUserId) {
    credentials.push({
      token: singleToken,
      userId: singleUserId,
      keyId: process.env.SYNTARA_PUBLIC_API_KEY_ID?.trim() || 'default',
    });
  }

  return credentials;
}

function secureTokenEqual(left: string, right: string): boolean {
  const leftHash = createHash('sha256').update(left).digest();
  const rightHash = createHash('sha256').update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

export function publicApiRequestId(request: NextRequest): string {
  return request.headers.get('x-request-id')?.trim().slice(0, 120) || `req_${randomUUID()}`;
}

export function authenticatePublicApi(request: NextRequest): PublicApiPrincipal | null {
  const authorization = request.headers.get('authorization')?.trim() || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (!token) return null;

  const credential = credentialsFromEnvironment().find((item) =>
    secureTokenEqual(item.token, token),
  );
  return credential ? { userId: credential.userId, keyId: credential.keyId } : null;
}

export function publicApiSuccess<T>(
  requestId: string,
  data: T,
  options: { status?: number; headers?: HeadersInit } = {},
): NextResponse {
  return NextResponse.json(
    {
      success: true,
      request_id: requestId,
      data,
    },
    {
      status: options.status || 200,
      headers: {
        'cache-control': 'no-store',
        'x-request-id': requestId,
        ...options.headers,
      },
    },
  );
}

export function publicApiError(
  requestId: string,
  status: number,
  code: PublicApiErrorCode,
  message: string,
  details?: unknown,
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      request_id: requestId,
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
      },
    },
    {
      status,
      headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
    },
  );
}

export function requirePublicApi(
  request: NextRequest,
  requestId: string,
): PublicApiPrincipal | NextResponse {
  const principal = authenticatePublicApi(request);
  if (principal) return principal;
  return publicApiError(
    requestId,
    401,
    'unauthorized',
    'Provide a valid API key as Authorization: Bearer <token>.',
  );
}

export async function normalizeUpstreamApiError(
  response: Response,
  requestId: string,
  fallbackMessage: string,
): Promise<NextResponse> {
  const payload = (await response
    .clone()
    .json()
    .catch(() => null)) as Record<string, unknown> | null;
  const nestedError =
    payload?.error && typeof payload.error === 'object' && !Array.isArray(payload.error)
      ? (payload.error as Record<string, unknown>)
      : null;
  const message =
    (typeof payload?.error === 'string' && payload.error) ||
    (typeof nestedError?.message === 'string' && nestedError.message) ||
    fallbackMessage;
  return publicApiError(
    requestId,
    response.status >= 400 ? response.status : 502,
    'upstream_error',
    message,
    payload?.details,
  );
}
