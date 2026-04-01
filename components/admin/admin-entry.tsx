'use client';

import { useEffect, useState } from 'react';
import { Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { AdminConsole } from '@/components/admin/admin-console';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { backendJson, backendFetch } from '@/lib/utils/backend-api';

type AdminSessionResponse = {
  authenticated: boolean;
  identity?: {
    email?: string;
    name?: string;
  };
};

export function AdminEntry() {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [email, setEmail] = useState('dongbochen1218@icloud.com');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void backendJson<AdminSessionResponse>('/api/admin/session')
      .then((response) => {
        if (cancelled) return;
        setAuthenticated(Boolean(response.authenticated));
      })
      .catch(() => {
        if (!cancelled) setAuthenticated(false);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await backendFetch('/api/admin/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || '管理员登录失败');
      }
      setAuthenticated(true);
      toast.success('管理员登录成功');
    } catch (loginError) {
      const message = loginError instanceof Error ? loginError.message : String(loginError);
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-full items-center justify-center apple-mesh-bg">
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          正在检查管理员会话…
        </div>
      </div>
    );
  }

  if (authenticated) {
    return <AdminConsole />;
  }

  return (
    <div className="relative min-h-full overflow-hidden apple-mesh-bg px-4 py-10 md:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[12%] top-[10%] h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle,rgba(14,165,233,0.14)_0%,transparent_72%)]" />
        <div className="absolute right-[10%] top-[20%] h-[280px] w-[280px] rounded-full bg-[radial-gradient(circle,rgba(245,158,11,0.12)_0%,transparent_72%)]" />
      </div>

      <div className="relative mx-auto grid min-h-[calc(100dvh-5rem)] max-w-5xl items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="hidden lg:block">
          <div className="apple-glass rounded-[32px] p-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/50 bg-sky-50/80 px-3 py-1 text-xs font-medium text-sky-900 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100">
              <ShieldCheck className="size-3.5" />
              Admin Access
            </div>
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-[#1d1d1f] dark:text-white">
              管理员控制台登录
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              这里用于登录站点管理员后台。登录成功后，你可以管理模型配置、积分发放、老用户补发和其它全站级设置。
            </p>
          </div>
        </div>

        <Card className="border-white/60 bg-white/80 p-6 shadow-xl dark:border-white/10 dark:bg-slate-900/80">
          <div className="mb-6 space-y-2 text-center">
            <div className="mx-auto inline-flex size-12 items-center justify-center rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-slate-900">
              <LockKeyhole className="size-5" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">管理员登录</h2>
            <p className="text-sm text-muted-foreground">登录后进入 `/admin` 管理控制台。</p>
          </div>

          <form className="space-y-4" onSubmit={handleLogin}>
            <div className="space-y-2">
              <Label htmlFor="admin-email">管理员邮箱</Label>
              <Input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="admin-password">管理员密码</Label>
              <Input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            {error ? (
              <div className="rounded-xl border border-rose-200/60 bg-rose-50/80 px-3 py-2 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200">
                {error}
              </div>
            ) : null}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              登录管理员后台
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
