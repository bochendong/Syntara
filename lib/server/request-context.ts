import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { requireServerSession } from '@/lib/server/auth';
import { ensureUserForApi } from '@/lib/server/ensure-user';
import { requireResolvedUser } from '@/lib/server/admin-auth';

export interface RequestLLMContext {
  userId?: string;
  userEmail?: string;
  userName?: string;
  route?: string;
  notebookId?: string;
  notebookName?: string;
  courseId?: string;
  courseName?: string;
  sceneId?: string;
  sceneTitle?: string;
  sceneOrder?: number;
  sceneType?: string;
  operationCode?: string;
  chargeReason?: string;
  serviceLabel?: string;
}

const requestContextStorage = new AsyncLocalStorage<RequestLLMContext>();
const log = createLogger('RequestContext');

export function withRequestContext<T>(
  context: RequestLLMContext,
  callback: () => T | Promise<T>,
): T | Promise<T> {
  return requestContextStorage.run(context, callback);
}

export async function runWithRequestContext<T>(
  req: NextRequest,
  route: string,
  callback: () => Promise<T>,
  extraContext?: Partial<RequestLLMContext>,
): Promise<T> {
  let authSource: 'header' | 'session' | 'fallback' | 'none' = 'none';
  let user = null as { id?: string; email?: string; name?: string } | null;

  const headerUserId = req.headers.get('x-user-id')?.trim();
  if (headerUserId) {
    const headerUserEmail = req.headers.get('x-user-email')?.trim() || undefined;
    const headerUserName = req.headers.get('x-user-name')?.trim() || undefined;
    await ensureUserForApi({
      userId: headerUserId,
      email: headerUserEmail,
      name: headerUserName,
    });
    user = {
      id: headerUserId,
      email: headerUserEmail,
      name: headerUserName,
    };
    authSource = 'header';
  } else {
    const session = await requireServerSession();
    const sessionUserId = session?.user?.id?.trim();
    if (sessionUserId) {
      await ensureUserForApi({
        userId: sessionUserId,
        email: session?.user?.email,
        name: session?.user?.name,
      });
      user = {
        id: sessionUserId,
        email: session?.user?.email?.trim() || undefined,
        name: session?.user?.name?.trim() || undefined,
      };
      authSource = 'session';
    } else {
      user = await requireResolvedUser();
      authSource = user?.id ? 'fallback' : 'none';
    }
  }

  if (route.startsWith('/api/generate/') || !user?.id) {
    log.info('Resolved request user', {
      route,
      authSource,
      userId: user?.id ?? null,
      userEmail: user?.email ?? null,
    });
  }

  return withRequestContext(
    {
      route,
      userId: user?.id,
      userEmail: user?.email,
      userName: user?.name,
      ...extraContext,
    },
    callback,
  ) as Promise<T>;
}

export function getRequestContext(): RequestLLMContext | undefined {
  return requestContextStorage.getStore();
}
