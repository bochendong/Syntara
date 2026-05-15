'use client';

import dynamic from 'next/dynamic';
import type { NotificationBarStageId } from '@/lib/notifications/notification-bar-stage-ids';
import { cn } from '@/lib/utils';

export type { NotificationBarStageId } from '@/lib/notifications/notification-bar-stage-ids';
export {
  NOTIFICATION_BAR_STAGE_OPTIONS,
  isValidNotificationBarStageId,
} from '@/lib/notifications/notification-bar-stage-ids';

const layer = 'pointer-events-none absolute inset-0 z-0 min-h-[6rem] w-full opacity-[0.88]';

const PrismStageBackground = dynamic(
  () =>
    import('@/components/gamification/prism-stage-background').then(
      (mod) => mod.PrismStageBackground,
    ),
  { ssr: false },
) as typeof import('@/components/gamification/prism-stage-background').PrismStageBackground;
const LightPillarStageBackground = dynamic(
  () =>
    import('@/components/gamification/light-pillar-stage-background').then(
      (mod) => mod.LightPillarStageBackground,
    ),
  { ssr: false },
) as typeof import('@/components/gamification/light-pillar-stage-background').LightPillarStageBackground;
const PixelSnowStageBackground = dynamic(
  () =>
    import('@/components/gamification/pixel-snow-stage-background').then(
      (mod) => mod.PixelSnowStageBackground,
    ),
  { ssr: false },
) as typeof import('@/components/gamification/pixel-snow-stage-background').PixelSnowStageBackground;
const FloatingLinesStageBackground = dynamic(
  () =>
    import('@/components/gamification/floating-lines-stage-background').then(
      (mod) => mod.FloatingLinesStageBackground,
    ),
  { ssr: false },
) as typeof import('@/components/gamification/floating-lines-stage-background').FloatingLinesStageBackground;
const LightRaysStageBackground = dynamic(
  () =>
    import('@/components/gamification/light-rays-stage-background').then(
      (mod) => mod.LightRaysStageBackground,
    ),
  { ssr: false },
) as typeof import('@/components/gamification/light-rays-stage-background').LightRaysStageBackground;
const SoftAuroraStageBackground = dynamic(
  () =>
    import('@/components/gamification/soft-aurora-stage-background').then(
      (mod) => mod.SoftAuroraStageBackground,
    ),
  { ssr: false },
) as typeof import('@/components/gamification/soft-aurora-stage-background').SoftAuroraStageBackground;
const ParticlesStageBackground = dynamic(
  () =>
    import('@/components/gamification/particles-stage-background').then(
      (mod) => mod.ParticlesStageBackground,
    ),
  { ssr: false },
) as typeof import('@/components/gamification/particles-stage-background').ParticlesStageBackground;
const EvilEyeStageBackground = dynamic(
  () =>
    import('@/components/gamification/evil-eye-stage-background').then(
      (mod) => mod.EvilEyeStageBackground,
    ),
  { ssr: false },
) as typeof import('@/components/gamification/evil-eye-stage-background').EvilEyeStageBackground;
const ColorBendsStageBackground = dynamic(
  () =>
    import('@/components/gamification/color-bends-stage-background').then(
      (mod) => mod.ColorBendsStageBackground,
    ),
  { ssr: false },
) as typeof import('@/components/gamification/color-bends-stage-background').ColorBendsStageBackground;
const PlasmaWaveStageBackground = dynamic(
  () =>
    import('@/components/gamification/plasma-wave-stage-background').then(
      (mod) => mod.PlasmaWaveStageBackground,
    ),
  { ssr: false },
) as typeof import('@/components/gamification/plasma-wave-stage-background').PlasmaWaveStageBackground;
const ThreadsStageBackground = dynamic(
  () =>
    import('@/components/gamification/threads-stage-background').then(
      (mod) => mod.ThreadsStageBackground,
    ),
  { ssr: false },
) as typeof import('@/components/gamification/threads-stage-background').ThreadsStageBackground;
const HyperspeedStageBackground = dynamic(
  () =>
    import('@/components/gamification/hyperspeed-stage-background').then(
      (mod) => mod.HyperspeedStageBackground,
    ),
  { ssr: false },
) as typeof import('@/components/gamification/hyperspeed-stage-background').HyperspeedStageBackground;
const PrismaticBurstStageBackground = dynamic(
  () =>
    import('@/components/gamification/prismatic-burst-stage-background').then(
      (mod) => mod.PrismaticBurstStageBackground,
    ),
  { ssr: false },
) as typeof import('@/components/gamification/prismatic-burst-stage-background').PrismaticBurstStageBackground;
const LineWavesStageBackground = dynamic(
  () =>
    import('@/components/gamification/line-waves-stage-background').then(
      (mod) => mod.LineWavesStageBackground,
    ),
  { ssr: false },
) as typeof import('@/components/gamification/line-waves-stage-background').LineWavesStageBackground;

type NotificationBarStageBackgroundProps = {
  id: NotificationBarStageId;
  className?: string;
};

/**
 * 与补给站 `live2d-companion-hub` 中可选舞台动效一一对应；用于通知弹层/个人中心预览，默认关闭鼠标交互以减轻顶栏与设置页压力。
 */
export function NotificationBarStageBackground({
  id,
  className,
}: NotificationBarStageBackgroundProps) {
  const c = cn(layer, className);

  switch (id) {
    case 'prism':
      return (
        <PrismStageBackground
          className={c}
          timeScale={0.5}
          height={3.5}
          baseWidth={5.5}
          scale={3.6}
          hueShift={0}
          colorFrequency={1}
          noise={0}
          glow={1}
          bloom={1}
        />
      );
    case 'light-pillar':
      return (
        <LightPillarStageBackground
          className={c}
          topColor="#7C4DFF"
          bottomColor="#F7A8FF"
          intensity={1}
          rotationSpeed={0.3}
          glowAmount={0.002}
          pillarWidth={3}
          pillarHeight={0.4}
          noiseIntensity={0.5}
          pillarRotation={25}
          interactive={false}
          mixBlendMode="screen"
          quality="high"
        />
      );
    case 'pixel-snow':
      return (
        <PixelSnowStageBackground
          className={c}
          color="#ffffff"
          flakeSize={0.01}
          minFlakeSize={1.25}
          pixelResolution={200}
          speed={1.25}
          density={0.3}
          direction={125}
          brightness={1}
          depthFade={8}
          farPlane={20}
          gamma={0.4545}
          variant="square"
        />
      );
    case 'floating-lines':
      return (
        <FloatingLinesStageBackground
          className={c}
          interactive={false}
          animationSpeed={1}
          gradientStart="#e945f5"
          gradientMid="#6f6f6f"
          gradientEnd="#6a6a6a"
          mixBlendMode="screen"
        />
      );
    case 'light-rays':
      return (
        <LightRaysStageBackground
          className={c}
          raysOrigin="top-center"
          raysColor="#ffffff"
          raysSpeed={1}
          lightSpread={0.5}
          rayLength={3}
          followMouse={false}
          mouseInfluence={0}
          noiseAmount={0}
          distortion={0}
          pulsating={false}
          fadeDistance={1}
          saturation={1}
        />
      );
    case 'soft-aurora':
      return (
        <SoftAuroraStageBackground
          className={c}
          speed={0.45}
          scale={1.4}
          brightness={0.78}
          color1="#e8eef7"
          color2="#8b5cf6"
          noiseFrequency={2.2}
          bandSpread={0.95}
          enableMouseInteraction={false}
        />
      );
    case 'particles':
      return (
        <ParticlesStageBackground
          className={c}
          particleColors={['#c7d2fe', '#e0e7ff', '#f1f5f9', '#ffffff']}
          particleCount={240}
          particleSpread={7.5}
          speed={0.16}
          particleBaseSize={32}
          moveParticlesOnHover={false}
          sizeRandomness={0.75}
          cameraDistance={20}
          disableRotation={false}
          pixelRatio={1.4}
        />
      );
    case 'evil-eye':
      return (
        <EvilEyeStageBackground
          className={c}
          eyeColor="#FF6F37"
          intensity={1.5}
          pupilSize={0.6}
          irisWidth={0.25}
          glowIntensity={0.35}
          scale={0.8}
          noiseScale={1}
          pupilFollow={0}
          flameSpeed={1}
          backgroundColor="#120F17"
        />
      );
    case 'color-bends':
      return (
        <ColorBendsStageBackground
          className={c}
          colors={['#ff5c7a', '#8a5cff', '#7dd3fc']}
          rotation={90}
          speed={0.2}
          scale={1.15}
          frequency={0.95}
          warpStrength={1}
          mouseInfluence={0}
          noise={0.12}
          parallax={0.4}
          iterations={1}
          intensity={1.5}
          bandWidth={5}
          transparent
          autoRotate={0}
        />
      );
    case 'plasma-wave':
      return (
        <PlasmaWaveStageBackground
          className={c}
          colors={['#A855F7', '#38bdf8']}
          speed1={0.05}
          speed2={0.05}
          focalLength={0.8}
          bend1={1}
          bend2={0.5}
          dir2={1}
          rotationDeg={0}
        />
      );
    case 'threads':
      return (
        <ThreadsStageBackground
          className={c}
          color={[0.92, 0.95, 1]}
          amplitude={0.9}
          distance={0.08}
          enableMouseInteraction={false}
        />
      );
    case 'hyperspeed':
      return <HyperspeedStageBackground className={c} />;
    case 'prismatic-burst':
      return <PrismaticBurstStageBackground className={c} />;
    case 'line-waves':
      return <LineWavesStageBackground className={c} />;
    case 'solid-black':
      return (
        <div
          className={cn(
            'pointer-events-none absolute inset-0 z-0 min-h-[6rem] w-full bg-black',
            className,
          )}
          aria-hidden
        />
      );
    case 'solid-mist':
      return (
        <div
          className={cn(
            'pointer-events-none absolute inset-0 z-0 min-h-[6rem] w-full bg-[#f3f6fb]',
            className,
          )}
          aria-hidden
        />
      );
    case 'solid-cloud':
      return (
        <div
          className={cn(
            'pointer-events-none absolute inset-0 z-0 min-h-[6rem] w-full bg-[#def7ff]',
            className,
          )}
          aria-hidden
        />
      );
    case 'solid-blush':
      return (
        <div
          className={cn(
            'pointer-events-none absolute inset-0 z-0 min-h-[6rem] w-full bg-[#fff0f5]',
            className,
          )}
          aria-hidden
        />
      );
    case 'solid-sage':
      return (
        <div
          className={cn(
            'pointer-events-none absolute inset-0 z-0 min-h-[6rem] w-full bg-[#e8f8ef]',
            className,
          )}
          aria-hidden
        />
      );
    case 'solid-lilac':
      return (
        <div
          className={cn(
            'pointer-events-none absolute inset-0 z-0 min-h-[6rem] w-full bg-[#f2edff]',
            className,
          )}
          aria-hidden
        />
      );
  }
}
