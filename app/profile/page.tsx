import { ProfileHero, ProfileUsageCard, NotificationCenterUsageCard } from '@/components/user-profile';

export default function ProfilePage() {
  return (
    <div className="relative min-h-full w-full overflow-hidden apple-mesh-bg">
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-orb-1 absolute left-[-8rem] top-[-8rem] h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(circle,rgba(0,122,255,0.08)_0%,transparent_72%)]" />
        <div className="animate-orb-2 absolute bottom-[-10rem] right-[-8rem] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,rgba(88,86,214,0.08)_0%,transparent_72%)]" />
      </div>

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pb-12 pt-8 md:px-8">
        <ProfileHero />

        <section className="flex min-w-0 flex-col gap-6">
          <ProfileUsageCard />
          <NotificationCenterUsageCard />
        </section>
      </main>
    </div>
  );
}
