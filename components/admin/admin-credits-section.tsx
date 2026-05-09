'use client';

import { useEffect, useMemo, useState } from 'react';
import { Coins, Gift, Loader2, Search } from 'lucide-react';
import { toast } from '@/lib/notifications/client-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { backendJson } from '@/lib/utils/backend-api';

type CreditUserRow = {
  id: string;
  email: string | null;
  name: string | null;
  creditsBalance: number;
  createdAt: string;
};

type SearchResponse = {
  success: true;
  users: CreditUserRow[];
};

type GrantResponse = {
  success: true;
  user: {
    id: string;
    email: string | null;
    name: string | null;
    balance: number;
  };
  granted: number;
};

type UnlockAllResourcesResponse = {
  success: true;
  user: {
    id: string;
    email: string | null;
    name: string | null;
  };
  unlockedLive2dCount: number;
  unlockedAvatarCharacterCount: number;
  unlockedAvatarInventoryCount: number;
};

type BackfillPreviewResponse = {
  success: true;
  targetCredits: number;
  affectedUsers: number;
  totalCreditsToGrant: number;
  previewUsers: CreditUserRow[];
};

type BackfillCommitResponse = {
  success: true;
  targetCredits: number;
  affectedUsers: number;
  totalCreditsGranted: number;
  previewAffectedUsers: number;
  previewTotalCreditsToGrant: number;
};

function formatDateTime(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AdminCreditsSection() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [unlockingAll, setUnlockingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CreditUserRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [amount, setAmount] = useState('500');
  const [note, setNote] = useState('');
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillSubmitting, setBackfillSubmitting] = useState(false);
  const [backfillPreview, setBackfillPreview] = useState<BackfillPreviewResponse | null>(null);
  const [backfillDialogOpen, setBackfillDialogOpen] = useState(false);

  const selectedUser = useMemo(
    () => results.find((item) => item.id === selectedUserId) ?? null,
    [results, selectedUserId],
  );

  useEffect(() => {
    const normalized = query.trim();
    if (!normalized) {
      setResults([]);
      setSelectedUserId('');
      setError(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void backendJson<SearchResponse>(`/api/admin/credits?query=${encodeURIComponent(normalized)}`)
        .then((response) => {
          if (cancelled) return;
          setResults(response.users);
          setSelectedUserId((current) =>
            response.users.some((item) => item.id === current) ? current : (response.users[0]?.id ?? ''),
          );
        })
        .catch((loadError) => {
          if (cancelled) return;
          setResults([]);
          setSelectedUserId('');
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const handleGrant = async () => {
    const parsedAmount = Number.parseInt(amount, 10);
    if (!selectedUserId) {
      toast.error('先搜索并选择一个用户');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error('请输入大于 0 的积分数');
      return;
    }

    setSubmitting(true);
    try {
      const response = await backendJson<GrantResponse>('/api/admin/credits', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUserId,
          amount: parsedAmount,
          note,
        }),
      });

      setResults((current) =>
        current.map((item) =>
          item.id === response.user.id
            ? { ...item, creditsBalance: response.user.balance }
            : item,
        ),
      );
      toast.success(`已为 ${response.user.email || response.user.name || '该用户'} 充值 ${response.granted} credits`);
      setNote('');
    } catch (submitError) {
      toast.error(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  const handlePreviewBackfill = async () => {
    setBackfillLoading(true);
    try {
      const response = await backendJson<BackfillPreviewResponse>('/api/admin/credits/backfill');
      setBackfillPreview(response);
      setBackfillDialogOpen(true);
    } catch (loadError) {
      toast.error(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setBackfillLoading(false);
    }
  };

  const handleUnlockAllResources = async () => {
    if (!selectedUserId) {
      toast.error('先搜索并选择一个用户');
      return;
    }

    const confirmed = window.confirm(
      '将为该用户解锁全部资源（Live2D、头像收藏、角色相关测试资源），仅用于测试。确认继续吗？',
    );
    if (!confirmed) return;

    setUnlockingAll(true);
    try {
      const response = await backendJson<UnlockAllResourcesResponse>(
        '/api/admin/gamification/unlock-all',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ userId: selectedUserId }),
        },
      );
      toast.success(
        `已完成测试解锁：Live2D ${response.unlockedLive2dCount} 个，角色头像包 ${response.unlockedAvatarCharacterCount} 个，头像收藏 ${response.unlockedAvatarInventoryCount} 个`,
      );
    } catch (unlockError) {
      toast.error(unlockError instanceof Error ? unlockError.message : String(unlockError));
    } finally {
      setUnlockingAll(false);
    }
  };

  const handleCommitBackfill = async () => {
    setBackfillSubmitting(true);
    try {
      const response = await backendJson<BackfillCommitResponse>('/api/admin/credits/backfill', {
        method: 'POST',
      });
      setResults((current) =>
        current.map((item) =>
          item.creditsBalance < response.targetCredits
            ? { ...item, creditsBalance: response.targetCredits }
            : item,
        ),
      );
      setBackfillDialogOpen(false);
      setBackfillPreview(null);
      toast.success(
        `已补发完成：${response.affectedUsers} 个用户，共发放 ${response.totalCreditsGranted} credits`,
      );
    } catch (commitError) {
      toast.error(commitError instanceof Error ? commitError.message : String(commitError));
    } finally {
      setBackfillSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-4 w-4" />
            用户积分管理
          </CardTitle>
          <CardDescription>按邮箱搜索用户，然后直接为对方补发或充值 credits。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-3">
              <Label htmlFor="credit-user-search">搜索邮箱</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="credit-user-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="输入完整邮箱或一部分，比如 alice@"
                  className="pl-9"
                />
              </div>

              {error ? (
                <Alert variant="destructive">
                  <AlertTitle>搜索失败</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <div className="rounded-xl border">
                <div className="border-b bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  {loading
                    ? '搜索中…'
                    : query.trim()
                      ? `找到 ${results.length} 个匹配用户`
                      : '输入邮箱后开始搜索'}
                </div>
                <div className="max-h-[320px] overflow-y-auto">
                  {results.length > 0 ? (
                    <div className="divide-y">
                      {results.map((user) => {
                        const active = user.id === selectedUserId;
                        return (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => setSelectedUserId(user.id)}
                            className={`flex w-full flex-col gap-1 px-3 py-3 text-left transition-colors ${
                              active ? 'bg-primary/8' : 'hover:bg-muted/40'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="truncate text-sm font-medium text-foreground">
                                {user.email || '无邮箱'}
                              </span>
                              <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                                {user.creditsBalance} credits
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {user.name?.trim() || '未设置昵称'} · 注册于 {formatDateTime(user.createdAt)}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                      {query.trim() ? '没有搜到匹配用户' : '等待输入邮箱'}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border bg-background/60 p-4">
              <div>
                <p className="text-sm font-semibold text-foreground">发放积分</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  这会直接增加用户余额，并写入积分流水。
                </p>
              </div>

              <div className="rounded-xl border bg-muted/20 p-3 text-sm">
                <div className="text-xs text-muted-foreground">当前选中</div>
                <div className="mt-1 font-medium text-foreground">
                  {selectedUser?.email || '未选择用户'}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {selectedUser
                    ? `${selectedUser.name?.trim() || '未设置昵称'} · 当前余额 ${selectedUser.creditsBalance} credits`
                    : '先在左侧搜索并点选一个用户'}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="credit-amount">充值积分</Label>
                <Input
                  id="credit-amount"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="例如 500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="credit-note">备注</Label>
                <Textarea
                  id="credit-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  placeholder="可选，比如 补偿活动、人工赠送、客服处理"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {[100, 500, 1000, 3000].map((preset) => (
                  <Button key={preset} type="button" variant="outline" size="sm" onClick={() => setAmount(String(preset))}>
                    +{preset}
                  </Button>
                ))}
              </div>

              <Button type="button" onClick={() => void handleGrant()} disabled={!selectedUserId || submitting}>
                {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Gift className="mr-2 size-4" />}
                发放积分
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleUnlockAllResources()}
                disabled={!selectedUserId || unlockingAll}
              >
                {unlockingAll ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                解锁全部资源（测试）
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>老用户补发到 500</CardTitle>
          <CardDescription>
            一次性把所有余额低于 500 credits 的现有用户补到 500。操作前会先预览影响人数和总发放量。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-muted-foreground">
            适合在你把欢迎积分从 100 提高到 500 后，统一补齐历史用户。
          </div>
          <Button type="button" variant="outline" onClick={() => void handlePreviewBackfill()} disabled={backfillLoading}>
            {backfillLoading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Coins className="mr-2 size-4" />}
            预览补发
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={backfillDialogOpen} onOpenChange={setBackfillDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认批量补发积分</AlertDialogTitle>
            <AlertDialogDescription>
              这会把所有余额低于 {backfillPreview?.targetCredits ?? 500} credits 的老用户补到目标值，并写入积分流水。
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">影响用户数</div>
                <div className="mt-1 text-2xl font-semibold text-foreground">
                  {backfillPreview?.affectedUsers ?? 0}
                </div>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">总发放积分</div>
                <div className="mt-1 text-2xl font-semibold text-foreground">
                  {backfillPreview?.totalCreditsToGrant ?? 0}
                </div>
              </div>
            </div>

            <div className="rounded-xl border">
              <div className="border-b bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                预览前 {backfillPreview?.previewUsers.length ?? 0} 个用户
              </div>
              <div className="max-h-[220px] overflow-y-auto divide-y">
                {(backfillPreview?.previewUsers ?? []).length > 0 ? (
                  (backfillPreview?.previewUsers ?? []).map((user) => (
                    <div key={user.id} className="px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">
                            {user.email || '无邮箱'}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {user.name?.trim() || '未设置昵称'}
                          </div>
                        </div>
                        <div className="shrink-0 text-right text-xs text-muted-foreground">
                          <div>当前 {user.creditsBalance}</div>
                          <div>补发 +{500 - user.creditsBalance}</div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-5 text-center text-muted-foreground">
                    没有需要补发的用户
                  </div>
                )}
              </div>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={backfillSubmitting}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={backfillSubmitting || (backfillPreview?.affectedUsers ?? 0) <= 0}
              onClick={(event) => {
                event.preventDefault();
                void handleCommitBackfill();
              }}
            >
              {backfillSubmitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              确认补发
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
