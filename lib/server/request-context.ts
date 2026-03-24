import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextRequest } from 'next/server';
import { requireResolvedUser } from '@/lib/server/admin-auth';

export interface RequestLLMContext {
  userId?: string;
  userEmail?: string;
  userName?: string;
  route?: string;
}

const requestContextStorage = new AsyncLocalStorage<RequestLLMContext>();

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
): Promise<T> {
  void req;
  const user = await requireResolvedUser();
  return withRequestContext(
    {
      route,
      userId: user?.id,
      userEmail: user?.email,
      userName: user?.name,
    },
    callback,
  ) as Promise<T>;
}

export function getRequestContext(): RequestLLMContext | undefined {
  return requestContextStorage.getStore();
}
