'use client';

function readUserIdFromPersistedAuth(): string {
  if (typeof window === 'undefined') return '';
  try {
    const raw = localStorage.getItem('openmaic-auth');
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { state?: { userId?: string } };
    return parsed?.state?.userId?.trim() || '';
  } catch {
    return '';
  }
}

export async function backendFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers || {});
  const userId = readUserIdFromPersistedAuth();
  if (userId && !headers.has('x-user-id')) {
    headers.set('x-user-id', userId);
  }
  return fetch(path, {
    credentials: 'include',
    ...init,
    headers,
  });
}

export async function backendJson<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await backendFetch(path, init);
  if (!resp.ok) {
    const ct = resp.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const data = (await resp.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error?.trim() || `请求失败: HTTP ${resp.status}`);
    }
    const text = await resp.text().catch(() => '');
    const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 240);
    throw new Error(
      snippet
        ? `请求失败: HTTP ${resp.status} — ${snippet}`
        : `请求失败: HTTP ${resp.status}（响应非 JSON，多为服务端 500 或未配置 DATABASE_URL）`,
    );
  }
  return (await resp.json()) as T;
}
