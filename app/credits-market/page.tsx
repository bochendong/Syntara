import Link from 'next/link';
import { ArrowRightLeft, Cpu, ShoppingBag, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function CreditsMarketPage() {
  return (
    <div className="min-h-full w-full apple-mesh-bg">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pb-12 pt-8 md:px-8">
        <section className="apple-glass rounded-[28px] p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-300/50 bg-fuchsia-50/80 px-3 py-1 text-xs font-medium text-fuchsia-900 dark:border-fuchsia-400/20 dark:bg-fuchsia-400/10 dark:text-fuchsia-100">
            <Sparkles className="size-3.5" />
            Credits Marketplace
          </div>
          <h1 className="mt-4 flex items-center gap-3 text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
            <ArrowRightLeft className="size-9 text-fuchsia-600 dark:text-fuchsia-300" />
            积分交易市场
          </h1>
          <p className="mt-3 max-w-3xl text-[15px] leading-7 text-slate-600 dark:text-slate-300">
            这里未来会支持用户之间出售或购买自己的算力积分、购买积分。当前版本先预留页面与入口，
            后续会补上挂单、成交、价格发现与风控机制。
          </p>
          <div className="mt-6 flex gap-3">
            <Button asChild className="rounded-full">
              <Link href="/top-up">返回充值与转换</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/notifications">查看通知中心</Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <Card className="rounded-[24px] p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Cpu className="size-5 text-sky-600" />
              算力积分市场
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              未来支持出售闲置算力积分，或者向其他用户购买更多 AI 使用预算。
            </p>
            <div className="mt-4 rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
              功能开发中，敬请期待。
            </div>
          </Card>

          <Card className="rounded-[24px] p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <ShoppingBag className="size-5 text-emerald-600" />
              购买积分市场
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              未来支持购买课程/内容消费预算，也可以把未使用的购买积分转给其他用户。
            </p>
            <div className="mt-4 rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
              功能开发中，敬请期待。
            </div>
          </Card>
        </section>
      </main>
    </div>
  );
}
