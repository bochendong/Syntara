'use client';

import { useEffect } from 'react';

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function easeInOut(value: number) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function progressBetween(value: number, start: number, end: number) {
  return clamp01((value - start) / (end - start));
}

function getOrbitPosition(angleDegrees: number, radius: number) {
  const angle = (angleDegrees * Math.PI) / 180;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

function getHomeMotionState(rawProgress: number) {
  const progress = clamp01(rawProgress);
  const secondScreenProgress = 0.66;
  const firstToSecond = easeInOut(progressBetween(progress, 0.12, 0.4));
  const secondToThird = easeInOut(progressBetween(progress, 0.56, 0.74));
  const footerProgress = easeInOut(progressBetween(progress, 0.955, 1));
  const heroOpacity = 1 - easeInOut(progressBetween(progress, 0.1, 0.3));
  const secondReveal = easeInOut(progressBetween(progress, 0.24, 0.4));
  const orbitSpin = (progress - 0.48) * 500;
  const screenOne = 1 - firstToSecond;
  const screenTwo = firstToSecond * (1 - secondToThird);
  const screenThree = secondToThird;
  const secondContentOpacity = screenTwo * secondReveal * (1 - screenThree);
  const laptopOpacity = screenThree * (1 - footerProgress);
  const footerReveal = easeInOut(progressBetween(progress, 0.966, 0.995));
  const visualProgress =
    secondScreenProgress * firstToSecond + (1 - secondScreenProgress) * secondToThird;

  return {
    rawProgress: progress,
    visualProgress,
    screenOne,
    screenTwo,
    screenThree,
    footerProgress,
    footerReveal,
    secondContentOpacity,
    laptopOpacity,
    heroOpacity,
    secondReveal,
    orbitSpin,
    firstToSecond,
    secondToThird,
    orbPresence: Math.max(screenOne * 0.78, screenTwo * 0.94),
  };
}

export function SyntaraHomeMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-syntara-home]');
    if (!root) return;

    const updatePointer = (event: PointerEvent) => {
      const x = event.clientX / Math.max(window.innerWidth, 1) - 0.5;
      const y = event.clientY / Math.max(window.innerHeight, 1) - 0.5;
      root.style.setProperty('--home-mx', x.toFixed(3));
      root.style.setProperty('--home-my', y.toFixed(3));
    };

    const updateScroll = () => {
      const hero = root.querySelector<HTMLElement>('.syntara-marimba-hero');
      const scrollRange = Math.max(
        (hero?.offsetHeight ?? window.innerHeight * 2.3) - window.innerHeight,
        1,
      );
      const state = getHomeMotionState(window.scrollY / scrollRange);
      const orbitRadius = Math.min(window.innerWidth * 0.22, 310, window.innerHeight * 0.29);
      const topOrb = getOrbitPosition(-74 + state.orbitSpin, orbitRadius);
      const leftOrb = getOrbitPosition(152 + state.orbitSpin, orbitRadius);
      const rightOrb = getOrbitPosition(28 + state.orbitSpin, orbitRadius);

      root.style.setProperty('--home-raw-scroll', state.rawProgress.toFixed(3));
      root.style.setProperty('--home-scroll', state.visualProgress.toFixed(3));
      root.style.setProperty('--home-screen-one', state.screenOne.toFixed(3));
      root.style.setProperty('--home-screen-two', state.screenTwo.toFixed(3));
      root.style.setProperty('--home-screen-three', state.screenThree.toFixed(3));
      root.style.setProperty('--home-footer-progress', state.footerProgress.toFixed(3));
      root.style.setProperty('--home-footer-reveal', state.footerReveal.toFixed(3));
      root.style.setProperty(
        '--home-second-content-opacity',
        state.secondContentOpacity.toFixed(3),
      );
      root.style.setProperty('--home-laptop-opacity', state.laptopOpacity.toFixed(3));
      root.style.setProperty('--home-hero-opacity', state.heroOpacity.toFixed(3));
      root.style.setProperty('--home-second-reveal', state.secondReveal.toFixed(3));
      root.style.setProperty('--home-orbit-spin', state.orbitSpin.toFixed(3));
      root.style.setProperty('--home-orb-a-x', `${topOrb.x.toFixed(1)}px`);
      root.style.setProperty('--home-orb-a-y', `${topOrb.y.toFixed(1)}px`);
      root.style.setProperty('--home-orb-b-x', `${leftOrb.x.toFixed(1)}px`);
      root.style.setProperty('--home-orb-b-y', `${leftOrb.y.toFixed(1)}px`);
      root.style.setProperty('--home-orb-c-x', `${rightOrb.x.toFixed(1)}px`);
      root.style.setProperty('--home-orb-c-y', `${rightOrb.y.toFixed(1)}px`);
      root.style.setProperty('--home-first-to-second', state.firstToSecond.toFixed(3));
      root.style.setProperty('--home-second-to-third', state.secondToThird.toFixed(3));
      root.style.setProperty('--home-orb-presence', state.orbPresence.toFixed(3));
      root.classList.toggle('is-home-footer-active', state.footerProgress > 0.58);
    };

    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.16 },
    );

    root.querySelectorAll('[data-home-reveal]').forEach((element) => {
      revealObserver.observe(element);
    });

    const scrollSyncTimer = window.setInterval(updateScroll, 80);

    window.addEventListener('pointermove', updatePointer, { passive: true });
    window.addEventListener('scroll', updateScroll, { passive: true });
    window.addEventListener('resize', updateScroll, { passive: true });
    updateScroll();

    return () => {
      window.clearInterval(scrollSyncTimer);
      window.removeEventListener('pointermove', updatePointer);
      window.removeEventListener('scroll', updateScroll);
      window.removeEventListener('resize', updateScroll);
      revealObserver.disconnect();
    };
  }, []);

  return null;
}
