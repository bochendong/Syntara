'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Coins, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { backendJson } from '@/lib/utils/backend-api';
import { formatCreditsUsdLabel, formatUsdLabel, usdFromCredits } from '@/lib/utils/credits';
import {
  APPROX_USD_TO_CAD,
  APPROX_USD_TO_CNY,
  formatTopUpPackPrice,
  STRIPE_TOP_UP_CHECKOUT_CURRENCY,
  TOP_UP_PACKS,
  TOP_UP_CREDITS_PER_USD,
  type TopUpCurrency,
} from '@/lib/utils/top-up';

type CreditsResponse = {
  success: true;
  balance: number;
  databaseEnabled: boolean;
};

type CheckoutSessionResponse = {
  success: true;
  url: string;
  sessionId: string;
  orderId: string;
};

type CheckoutStatusResponse = {
  success: true;
  order: {
    id: string;
    packId: string;
    packTitle: string;
    credits: number;
    currency: string;
    amountTotal: number;
    status: string;
    fulfilledAt: string | null;
  };
};

const CURRENCY_META: Record<TopUpCurrency, { note: string }> = {
  USD: { note: `全球统一锚点；Stripe Checkout 当前仅支持 ${STRIPE_TOP_UP_CHECKOUT_CURRENCY}` },
  CAD: {
    note: `Stripe Checkout 当前以 CAD 实际结算；展示锚点约为 1 USD ≈ ${APPROX_USD_TO_CAD} CAD`,
  },
  CNY: {
    note: `按 1 USD ≈ ${APPROX_USD_TO_CNY} CNY 粗略换算；Stripe Checkout 当前仅支持 ${STRIPE_TOP_UP_CHECKOUT_CURRENCY}`,
  },
};

export default function TopUpPage() {
  const router = useRouter();
  const [currency, setCurrency] = useState<TopUpCurrency>(STRIPE_TOP_UP_CHECKOUT_CURRENCY);
  const [balance, setBalance] = useState<number | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [submittingPackId, setSubmittingPackId] = useState<string | null>(null);
  const handledCheckoutStateRef = useRef('');

  const loadBalance = useCallback(async () => {
    setLoadingBalance(true);
    try {
      const response = await backendJson<CreditsResponse>('/api/profile/credits');
      setBalance(response.balance);
    } catch {
      setBalance(null);
    } finally {
      setLoadingBalance(false);
    }
  }, []);

  const handleCheckout = useCallback(
    async (packId: string) => {
      if (currency !== STRIPE_TOP_UP_CHECKOUT_CURRENCY) {
        toast.message(`Stripe Checkout 当前仅支持 ${STRIPE_TOP_UP_CHECKOUT_CURRENCY} 结账。`);
        return;
      }

      setSubmittingPackId(packId);
      try {
        const response = await backendJson<CheckoutSessionResponse>(
          '/api/top-up/checkout-session',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              packId,
              currency,
            }),
          },
        );
        window.location.assign(response.url);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '创建 Stripe Checkout 失败。');
        setSubmittingPackId(null);
      }
    },
    [currency],
  );

  useEffect(() => {
    void loadBalance();
  }, [loadBalance]);

  useEffect(() => {
    const params =
      typeof window === 'undefined'
        ? new URLSearchParams()
        : new URLSearchParams(window.location.search);
    const checkoutState = params.get('checkout')?.trim() || '';
    const sessionId = params.get('session_id')?.trim() || '';
    const key = `${checkoutState}:${sessionId}`;

    if (!checkoutState || handledCheckoutStateRef.current === key) {
      return;
    }
    handledCheckoutStateRef.current = key;

    if (checkoutState === 'cancelled') {
      toast.message('已取消 Stripe 结账。');
      router.replace('/top-up');
      return;
    }

    if (checkoutState !== 'success' || !sessionId) {
      return;
    }

    let cancelled = false;
    const poll = async (attempt: number) => {
      try {
        const response = await backendJson<CheckoutStatusResponse>(
          `/api/top-up/checkout-status?sessionId=${encodeURIComponent(sessionId)}`,
        );
        if (cancelled) return;

        if (response.order.status === 'fulfilled') {
          await loadBalance();
          toast.success(`${response.order.credits} credits 已到账。`);
          router.replace('/top-up');
          return;
        }

        if (attempt < 5) {
          window.setTimeout(() => {
            void poll(attempt + 1);
          }, 1500);
          return;
        }

        toast.message('支付已完成，credits 通常会在几秒内到账。');
        router.replace('/top-up');
      } catch (error) {
        if (cancelled) return;
        toast.message(error instanceof Error ? error.message : '正在等待支付状态同步。');
        router.replace('/top-up');
      }
    };

    void poll(0);

    return () => {
      cancelled = true;
    };
  }, [loadBalance, router]);

  return (
    <div className="min-h-full w-full apple-mesh-bg relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.14),transparent_32%),radial-gradient(circle_at_70%_10%,rgba(59,130,246,0.12),transparent_28%),radial-gradient(circle_at_20%_80%,rgba(16,185,129,0.1),transparent_28%)]" />
        <div className="apple-wallpaper-noise absolute inset-0" />
      </div>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-12 pt-8 md:px-8">
        <section className="apple-glass rounded-[28px] p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/50 bg-amber-50/80 px-3 py-1 text-xs font-medium text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
                <Sparkles className="size-3.5" />
                积分充值
              </div>
              <h1 className="mt-4 text-4xl font-bold tracking-tight text-[#1d1d1f] dark:text-white">
                多充一点，课就能再多做几步
              </h1>
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[#5b6270] dark:text-slate-300">
                积分会在你用 AI
                的时候慢慢消耗：跟它聊天追问、生成或改一版课件、整理讲义和练习，都会算在内。
                现在积分和真实美元强绑定，按{' '}
                <span className="font-medium text-[#1d1d1f] dark:text-slate-100">{`${TOP_UP_CREDITS_PER_USD} credits = ${formatUsdLabel(1)}`}</span>{' '}
                来算；模型消耗则按 GPT 公开价上浮 50% 扣分，所以平台会保留服务毛利。
              </p>
              <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-[#5b6270] dark:text-slate-400">
                <span className="font-medium text-[#1d1d1f] dark:text-slate-200">
                  500 积分大概啥概念？
                </span>
                500 credits 现在就是 {formatUsdLabel(usdFromCredits(500))}。如果你主要在用 GPT-5.4
                mini / nano
                做日常对话、改讲义、微调课件，通常足够把主要流程跑熟一遍；更重的长文本或高质量输出会消耗更快。
              </p>
              <div className="mt-4 flex flex-wrap gap-3 text-xs">
                <div className="rounded-full border border-sky-200/70 bg-sky-50/80 px-3 py-1.5 font-medium text-sky-800 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100">
                  随堂追问、多轮对话
                </div>
                <div className="rounded-full border border-emerald-200/70 bg-emerald-50/80 px-3 py-1.5 font-medium text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100">
                  生成和修改课件
                </div>
                <div className="rounded-full border border-amber-200/70 bg-amber-50/80 px-3 py-1.5 font-medium text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
                  整理讲义与文档
                </div>
              </div>
            </div>

            <div className="grid w-full max-w-sm gap-3">
              <Card className="rounded-3xl border-white/60 bg-white/80 p-5 shadow-xl dark:border-white/10 dark:bg-slate-900/75">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Coins className="size-4" />
                  当前余额
                </div>
                <div className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-foreground">
                  {loadingBalance ? <Loader2 className="size-8 animate-spin" /> : (balance ?? '--')}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">credits</div>
                {!loadingBalance && balance != null ? (
                  <div className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                    约 {formatUsdLabel(usdFromCredits(balance))}
                  </div>
                ) : null}
              </Card>
            </div>
          </div>
        </section>

        <section>
          <Card className="rounded-[28px] border-white/60 bg-white/80 p-6 shadow-xl dark:border-white/10 dark:bg-slate-900/75">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-foreground">充值档位</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  所有档位都按固定汇率换算，不再做“多充多送”。
                </p>
              </div>

              <Tabs value={currency} onValueChange={(value) => setCurrency(value as TopUpCurrency)}>
                <TabsList className="grid w-full grid-cols-3 rounded-xl bg-slate-100/90 dark:bg-white/[0.06] md:w-[280px]">
                  <TabsTrigger value="USD">美元</TabsTrigger>
                  <TabsTrigger value="CAD">加币</TabsTrigger>
                  <TabsTrigger value="CNY">人民币</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">{CURRENCY_META[currency].note}</p>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {TOP_UP_PACKS.map((pack) => {
                const totalCredits = pack.credits;
                const displayPrice = formatTopUpPackPrice(currency, totalCredits);
                const usdPrice = usdFromCredits(totalCredits);
                const creditsPerUnit = totalCredits / usdPrice;
                const featured = pack.id === 'pro' || pack.id === 'studio';
                return (
                  <div
                    key={pack.id}
                    className={[
                      'relative overflow-hidden rounded-[24px] border p-5 transition-transform duration-200 hover:-translate-y-0.5',
                      featured
                        ? 'border-amber-300/70 bg-[linear-gradient(180deg,rgba(255,251,235,0.95)_0%,rgba(255,255,255,0.92)_100%)] shadow-[0_20px_50px_rgba(245,158,11,0.12)] dark:border-amber-400/25 dark:bg-[linear-gradient(180deg,rgba(79,52,20,0.32)_0%,rgba(15,23,42,0.82)_100%)]'
                        : 'border-slate-200/80 bg-white/75 dark:border-white/10 dark:bg-slate-950/35',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{pack.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{pack.blurb}</p>
                      </div>
                      {pack.highlight ? (
                        <div className="rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-semibold text-white">
                          {pack.highlight}
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-5 text-3xl font-semibold tracking-[-0.05em] text-foreground">
                      {displayPrice}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      约 {formatUsdLabel(usdPrice)}
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-lg font-semibold text-amber-600 dark:text-amber-300">
                        到账 {totalCredits}
                      </span>
                      <span className="text-xs text-muted-foreground">credits</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatCreditsUsdLabel(totalCredits)}
                    </p>

                    <div className="mt-4 rounded-2xl bg-black/[0.03] px-3 py-2 text-xs text-muted-foreground dark:bg-white/[0.04]">
                      每 {formatUsdLabel(1)} 固定对应 {creditsPerUnit.toFixed(0)} credits
                    </div>

                    <Button
                      type="button"
                      className="mt-5 h-10 w-full rounded-xl bg-slate-900 text-white hover:opacity-90 dark:bg-white dark:text-slate-900"
                      disabled={
                        Boolean(submittingPackId) || currency !== STRIPE_TOP_UP_CHECKOUT_CURRENCY
                      }
                      onClick={() => void handleCheckout(pack.id)}
                    >
                      {submittingPackId === pack.id ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          正在跳转结账
                        </>
                      ) : currency === STRIPE_TOP_UP_CHECKOUT_CURRENCY ? (
                        <>
                          使用 Stripe 支付
                          <ArrowRight className="size-4" />
                        </>
                      ) : (
                        `当前仅支持 ${STRIPE_TOP_UP_CHECKOUT_CURRENCY} 结账`
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          </Card>
        </section>
      </main>
    </div>
  );
}
