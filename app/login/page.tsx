'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Github, Sparkles, WandSparkles } from 'lucide-react';
import { motion } from 'motion/react';
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
      <div className="flex min-h-[100dvh] items-center justify-center apple-mesh-bg">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <div className="size-8 rounded-full border-2 border-[#007AFF] border-t-transparent animate-spin" />
        </motion.div>
      </div>
    );
  }

  if (status === 'authenticated') {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center apple-mesh-bg">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-sm text-[#86868b]"
        >
          正在进入我的课程…
        </motion.p>
      </div>
    );
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden apple-mesh-bg">
      {/* Animated gradient orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-orb-1 absolute -top-32 -left-32 h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(0,122,255,0.15)_0%,transparent_70%)]" />
        <div className="animate-orb-2 absolute -bottom-40 -right-40 h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,rgba(88,86,214,0.12)_0%,transparent_70%)]" />
        <div className="animate-orb-3 absolute top-1/3 right-1/4 h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,rgba(255,55,95,0.08)_0%,transparent_70%)]" />
      </div>

      <main className="relative z-10 mx-auto grid min-h-[100dvh] w-full max-w-6xl items-center gap-8 px-4 py-16 md:px-8 lg:grid-cols-[1.05fr_0.95fr]">
        <motion.section
          initial={{ opacity: 0, x: -28 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7 }}
          className="hidden lg:block"
        >
          <div className="apple-glass relative overflow-hidden rounded-[32px] p-8">
            <motion.div
              className="pointer-events-none absolute -top-16 -left-16 size-44 rounded-full bg-[#007AFF]/20 blur-3xl"
              animate={{ x: [0, 12, -8, 0], y: [0, -6, 10, 0] }}
              transition={{ duration: 7.5, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="pointer-events-none absolute -right-20 -bottom-20 size-52 rounded-full bg-[#5856D6]/15 blur-3xl"
              animate={{ x: [0, -10, 8, 0], y: [0, 10, -8, 0] }}
              transition={{ duration: 8.2, repeat: Infinity, ease: 'easeInOut' }}
            />
            <div className="relative">
              <p className="mb-3 inline-flex items-center gap-1 rounded-full border border-white/60 bg-white/75 px-3 py-1 text-xs text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-slate-300">
                <Sparkles className="size-3.5" /> Welcome back
              </p>
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                登录后继续你的
                <span className="bg-gradient-to-r from-[#007AFF] to-[#5856D6] bg-clip-text text-transparent">
                  {' '}
                  AI 互动课堂
                </span>
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                在课程空间里继续生成内容、组织笔记本并与多智能体进行对话式学习。
              </p>
              <div className="mt-6 space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
                <p className="inline-flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-[#007AFF]" /> 课程与笔记本统一管理
                </p>
                <p className="inline-flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-[#007AFF]" /> 连续对话沉淀为知识资产
                </p>
                <p className="inline-flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-[#007AFF]" /> 多 Agent 协同讲解与追问
                </p>
              </div>
            </div>
          </div>
        </motion.section>
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="w-full max-w-md"
        >
          <div className="apple-glass rounded-[28px] border border-white/45 p-8 shadow-[0_18px_50px_rgba(30,41,59,0.12)] dark:border-white/12 dark:shadow-[0_20px_56px_rgba(0,0,0,0.45)]">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="mb-6 space-y-2 text-center"
            >
              <h1 className="text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-white">
                登录 OpenMAIC
              </h1>
              <p className="text-sm text-[#86868b] dark:text-[#a1a1a6]">
                使用 Google 或 GitHub 账号登录；登录后默认进入「我的课程」，也可从侧栏前往商城。
              </p>
              <p className="text-xs text-[#8e8e93] dark:text-[#8f8f98]">
                还没有账号？
                <Link href="/register" className="ml-1 font-medium text-[#007AFF] hover:underline">
                  去注册
                </Link>
                <span className="mx-1">·</span>
                <Link href="/" className="font-medium text-[#007AFF] hover:underline">
                  返回首页
                </Link>
              </p>
            </motion.div>

            {showLocalLoggedIn ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-2xl border border-emerald-200/70 bg-emerald-50/80 p-4 text-center dark:border-emerald-400/30 dark:bg-emerald-400/10"
              >
                <p className="text-sm text-emerald-700 dark:text-emerald-300">
                  当前已登录（本地演示）：{currentName || '用户'}
                </p>
                <button
                  type="button"
                  onClick={() => router.push('/my-courses')}
                  className="apple-btn apple-btn-primary mt-3 w-full rounded-xl px-4 py-2.5 text-sm"
                >
                  前往我的课程
                </button>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="space-y-6"
              >
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
                      className="apple-btn apple-btn-secondary flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium disabled:opacity-60"
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
                        className="apple-btn flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1d1d1f] text-sm font-medium text-white shadow-sm transition hover:bg-[#2d2d2f] disabled:opacity-60 dark:bg-white dark:text-[#1d1d1f] dark:hover:bg-[#f5f5f7]"
                      >
                        <Github className="size-5" strokeWidth={1.75} />
                        使用 GitHub 登录
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-amber-200/80 bg-amber-50/60 px-4 py-3 text-left text-xs text-amber-900 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100">
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
                    <div className="absolute inset-x-0 top-1/2 h-px bg-black/[0.06] dark:bg-white/[0.08]" />
                    <span className="apple-glass relative rounded-full px-4 py-0.5 text-xs text-[#86868b]">
                      或使用本地演示（不验证邮箱）
                    </span>
                  </div>
                ) : null}

                <form className="space-y-4" onSubmit={onSubmitLocal}>
                  <div className="space-y-1.5">
                    <label htmlFor="login-name" className="text-xs font-medium text-[#86868b]">
                      昵称
                    </label>
                    <input
                      id="login-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="例如：Dongpo"
                      autoComplete="nickname"
                      className="apple-input h-11 w-full px-3.5 text-sm text-[#1d1d1f] placeholder-[#c7c7cc] outline-none dark:text-white dark:placeholder-[#48484a]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="login-email" className="text-xs font-medium text-[#86868b]">
                      邮箱
                    </label>
                    <input
                      id="login-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                      className="apple-input h-11 w-full px-3.5 text-sm text-[#1d1d1f] placeholder-[#c7c7cc] outline-none dark:text-white dark:placeholder-[#48484a]"
                    />
                  </div>
                  {error ? (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs text-rose-600 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-200"
                    >
                      {error}
                    </motion.p>
                  ) : null}
                  <button
                    type="submit"
                    className="apple-btn apple-btn-primary h-11 w-full rounded-xl text-sm"
                  >
                    {hasOauth ? '本地演示登录' : '登录并进入我的课程'}
                  </button>
                </form>
                <div className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200/70 bg-white/60 px-3 py-2 text-[11px] text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                  <WandSparkles className="size-3.5" />
                  登录后即可继续上次课程进度
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      </main>
    </div>
  );
}
