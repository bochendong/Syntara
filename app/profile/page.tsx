import Link from 'next/link';
import { UserRound } from 'lucide-react';
import { UserProfileCard } from '@/components/user-profile';
import { Button } from '@/components/ui/button';

export default function ProfilePage() {
  return (
    <div className="relative min-h-full w-full overflow-hidden apple-mesh-bg">
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-orb-1 absolute left-[-8rem] top-[-8rem] h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(circle,rgba(0,122,255,0.08)_0%,transparent_72%)]" />
        <div className="animate-orb-2 absolute bottom-[-10rem] right-[-8rem] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,rgba(88,86,214,0.08)_0%,transparent_72%)]" />
      </div>

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pb-12 pt-8 md:px-8">
        <Button variant="ghost" size="sm" className="-ml-2 w-fit rounded-lg" asChild>
          <Link href="/my-courses">← 返回课程主页</Link>
        </Button>

        <section className="apple-glass rounded-[28px] p-6">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-700 dark:bg-sky-400/15 dark:text-sky-200">
              <UserRound className="size-5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
                个人中心
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                在这里统一管理头像、昵称、个人简介，并查看你自己的模型调用与 token 用量趋势。
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="rounded-[24px] border border-border/70 bg-card/55 p-6 shadow-sm backdrop-blur-sm dark:bg-card/45">
            <h2 className="text-lg font-semibold text-foreground">你的账户与使用数据</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              左侧栏里的“个人中心”现在会直接打开这个页面，不再弹出浮层。你可以在右侧卡片里换头像，
              调整资料，并切换到 Token 用量页签查看不同模型的累计使用情况和最近趋势。
            </p>
          </div>

          <div className="min-w-0">
            <UserProfileCard />
          </div>
        </section>
      </main>
    </div>
  );
}
