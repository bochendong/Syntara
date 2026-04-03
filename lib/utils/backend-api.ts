'use client';

type PersistedAuthState = {
  state?: {
    userId?: string;
    email?: string;
    name?: string;
  };
};

function readAuthFromPersistedStore(): { userId: string; email: string; name: string } {
  if (typeof window === 'undefined') return { userId: '', email: '', name: '' };
  try {
    const raw = localStorage.getItem('synatra-auth');
    if (!raw) return { userId: '', email: '', name: '' };
    const parsed = JSON.parse(raw) as PersistedAuthState;
    return {
      userId: parsed?.state?.userId?.trim() || '',
      email: parsed?.state?.email?.trim().toLowerCase() || '',
      name: parsed?.state?.name?.trim() || '',
    };
  } catch {
    return { userId: '', email: '', name: '' };
  }
}

export async function backendFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers || {});
  const auth = readAuthFromPersistedStore();
  if (auth.userId && !headers.has('x-user-id')) {
    headers.set('x-user-id', auth.userId);
  }
  if (auth.email && !headers.has('x-user-email')) {
    headers.set('x-user-email', auth.email);
  }
  if (auth.name && !headers.has('x-user-name')) {
    headers.set('x-user-name', auth.name);
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
