'use client';

type ProfileHeroProps = {
  title?: string;
  description?: string;
};

export function ProfileHero({
  title = '个人中心',
  description = '在这里统一管理通知样式、头像、头像框、侧栏说明、昵称、个人简介；本页下方可查看 credits 余额与 token 用量。',
}: ProfileHeroProps) {
  return (
    <section className="apple-glass rounded-[28px] p-6 md:p-8">
      <h1 className="text-balance text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
        {title}
      </h1>
      <p className="mt-3 max-w-prose text-pretty text-sm leading-relaxed text-slate-600 sm:text-base dark:text-slate-300">
        {description}
      </p>
    </section>
  );
}
