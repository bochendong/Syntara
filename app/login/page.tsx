'use client';

import { FormEvent, useEffect, useState } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Github } from 'lucide-react';
import { useAuthStore } from '@/lib/store/auth';

type OauthConfig = { google: boolean; github: boolean };

export default function LoginPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const login = useAuthStore((s) => s.login);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const currentName = useAuthStore((s) => s.name);
  const authMode = useAuthStore((s) => s.authMode);

  const [oauth, setOauth] = useState<OauthConfig | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [oauthBusy, setOauthBusy] = useState<'google' | 'github' | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/auth/oauth-config');
        const j = (await r.json()) as OauthConfig;
        if (alive) setOauth(j);
      } catch {
        if (alive) setOauth({ google: false, github: false });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (status === 'authenticated' && session?.user) {
      router.replace('/my-courses');
    }
  }, [status, session, router]);

  const onSubmitLocal = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const finalName = name.trim();
    const finalEmail = email.trim().toLowerCase();
    if (!finalName) {
      setError('请输入昵称');
      return;
    }
    if (!finalEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(finalEmail)) {
      setError('请输入有效邮箱');
      return;
    }
    login({ name: finalName, email: finalEmail });
    router.push('/my-courses');
  };

  const hasOauth = Boolean(oauth && (oauth.google || oauth.github));
  const showLocalLoggedIn = isLoggedIn && authMode === 'local' && status !== 'authenticated';

  if (status === 'loading' || oauth === null) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[linear-gradient(180deg,#f5f7fb_0%,#eef2f7_100%)] dark:bg-[linear-gradient(180deg,#0f1115_0%,#151922_100%)]">
        <p className="text-sm text-slate-500 dark:text-slate-400">加载中…</p>
      </div>
    );
  }

  if (status === 'authenticated') {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[linear-gradient(180deg,#f5f7fb_0%,#eef2f7_100%)] dark:bg-[linear-gradient(180deg,#0f1115_0%,#151922_100%)]">
        <p className="text-sm text-slate-500 dark:text-slate-400">正在进入我的课程…</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[radial-gradient(circle_at_20%_10%,rgba(140,197,255,0.35),transparent_45%),radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.7),transparent_40%),linear-gradient(180deg,#f5f7fb_0%,#eef2f7_100%)] dark:bg-[radial-gradient(circle_at_20%_10%,rgba(62,92,140,0.45),transparent_45%),linear-gradient(180deg,#0f1115_0%,#151922_100%)]">
      <main className="mx-auto flex w-full max-w-6xl items-center justify-center px-4 py-16 md:px-8">
        <div className="w-full max-w-md rounded-[28px] border border-white/70 bg-white/75 p-8 backdrop-blur-2xl shadow-[0_30px_80px_rgba(15,23,42,0.14)] dark:border-white/10 dark:bg-black/35">
          <div className="mb-6 space-y-2 text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
              登录 OpenMAIC
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-300">
              使用 Google 或 GitHub 账号登录；登录后默认进入「我的课程」，也可从侧栏前往商城。
            </p>
          </div>

          {showLocalLoggedIn ? (
            <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/80 p-4 text-center dark:border-emerald-400/30 dark:bg-emerald-400/10">
              <p className="text-sm text-emerald-700 dark:text-emerald-300">
                当前已登录（本地演示）：{currentName || '用户'}
              </p>
              <button
                type="button"
                onClick={() => router.push('/my-courses')}
                className="mt-3 w-full rounded-xl bg-slate-900 px-4 py-2 text-sm text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-slate-900"
              >
                前往我的课程
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {hasOauth && oauth ? (
                <div className="space-y-3">
                  {oauth.google ? (
                    <button
                      type="button"
                      disabled={oauthBusy !== null}
                      onClick={() => {
                        setOauthBusy('google');
                        void signIn('google', { callbackUrl: '/my-courses' });
                      }}
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-60 dark:border-white/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
                    >
                      <span className="text-base font-semibold text-[#4285F4]">G</span>
                      使用 Google 登录
                    </button>
                  ) : null}
                  {oauth.github ? (
                    <button
                      type="button"
                      disabled={oauthBusy !== null}
                      onClick={() => {
                        setOauthBusy('github');
                        void signIn('github', { callbackUrl: '/my-courses' });
                      }}
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-900 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60 dark:border-white/15 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                    >
                      <Github className="size-5" strokeWidth={1.75} />
                      使用 GitHub 登录
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-left text-xs text-amber-900 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100">
                  <p className="font-medium">尚未配置第三方登录</p>
                  <p className="mt-1 text-amber-800/90 dark:text-amber-200/90">
                    在 <code className="rounded bg-black/5 px-1 dark:bg-white/10">.env.local</code>{' '}
                    中设置 <code className="rounded bg-black/5 px-1 dark:bg-white/10">GOOGLE_CLIENT_ID</code> /{' '}
                    <code className="rounded bg-black/5 px-1 dark:bg-white/10">GITHUB_CLIENT_ID</code>{' '}
                    及对应 Secret，并配置{' '}
                    <code className="rounded bg-black/5 px-1 dark:bg-white/10">NEXTAUTH_URL</code>、
                    <code className="rounded bg-black/5 px-1 dark:bg-white/10">NEXTAUTH_SECRET</code>
                    后重启开发服务。
                  </p>
                </div>
              )}

              {hasOauth ? (
                <div className="relative flex items-center justify-center py-1">
                  <div className="absolute inset-x-0 top-1/2 h-px bg-slate-200 dark:bg-white/10" />
                  <span className="relative bg-white/75 px-3 text-xs text-slate-400 dark:bg-black/35 dark:text-slate-500">
                    或使用本地演示（不验证邮箱）
                  </span>
                </div>
              ) : null}

              <form className="space-y-4" onSubmit={onSubmitLocal}>
                <div className="space-y-1.5">
                  <label htmlFor="login-name" className="text-xs text-slate-500 dark:text-slate-300">
                    昵称
                  </label>
                  <input
                    id="login-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例如：Dongpo"
                    autoComplete="nickname"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white/80 px-3 text-sm outline-none transition focus:border-slate-400 dark:border-white/15 dark:bg-white/5 dark:text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="login-email" className="text-xs text-slate-500 dark:text-slate-300">
                    邮箱
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white/80 px-3 text-sm outline-none transition focus:border-slate-400 dark:border-white/15 dark:bg-white/5 dark:text-white"
                  />
                </div>
                {error ? (
                  <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-200">
                    {error}
                  </p>
                ) : null}
                <button
                  type="submit"
                  className="h-11 w-full rounded-xl bg-slate-900 text-sm text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-slate-900"
                >
                  {hasOauth ? '本地演示登录' : '登录并进入我的课程'}
                </button>
              </form>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
