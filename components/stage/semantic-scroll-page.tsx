'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { NotebookContentView } from '@/components/notebook-content/notebook-content-view';
import { renderInlineMathAwareHtml } from '@/lib/math-engine';
import { useCanvasStore } from '@/lib/store/canvas';
import type { NotebookContentBlock, NotebookContentDocument } from '@/lib/notebook-content';
import {
  buildSemanticSpotlightSections,
  resolveSemanticSpotlightTarget,
  type SemanticSpotlightSection,
} from '@/lib/notebook-content/semantic-spotlight';
import type { PPTElement } from '@/lib/types/slides';
import { cn } from '@/lib/utils';

interface SemanticScrollPageProps {
  readonly document: NotebookContentDocument;
  readonly sceneId: string;
  readonly title: string;
  readonly elements?: PPTElement[];
}

type SemanticScrollSection = SemanticSpotlightSection;

interface SpotlightRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly containerWidth: number;
  readonly containerHeight: number;
}

type SemanticSectionTone =
  | 'plain'
  | 'definition'
  | 'process'
  | 'formula'
  | 'callout'
  | 'problem'
  | 'cards';

function renderInlineMathHtml(text: string): string {
  return renderInlineMathAwareHtml(text);
}

function findSemanticTarget(root: HTMLElement | null, targetId: string | null): HTMLElement | null {
  if (!root || !targetId) return null;
  const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-semantic-spotlight-id]'));
  return targets.find((target) => target.dataset.semanticSpotlightId === targetId) || null;
}

function documentForSection(
  document: NotebookContentDocument,
  blocks: NotebookContentBlock[],
): NotebookContentDocument {
  return {
    ...document,
    version: 1,
    layout: { mode: 'stack' },
    slots: undefined,
    pattern: undefined,
    blocks,
  };
}

function sectionTone(section: SemanticScrollSection): SemanticSectionTone {
  const blockTypes = new Set(section.blocks.map((block) => block.type));
  if (blockTypes.has('process_flow') || blockTypes.has('derivation_steps')) return 'process';
  if (blockTypes.has('equation') || blockTypes.has('matrix')) return 'formula';
  if (blockTypes.has('definition') || blockTypes.has('theorem')) return 'definition';
  if (blockTypes.has('callout')) return 'callout';
  if (blockTypes.has('example')) return 'problem';
  if (blockTypes.has('layout_cards') || blockTypes.has('bullet_list')) return 'cards';
  return 'plain';
}

function sectionChrome(tone: SemanticSectionTone, index: number) {
  const alternatingPlain =
    index % 2 === 0 ? 'bg-transparent' : 'bg-slate-50/55 ring-1 ring-slate-100';
  const styles = {
    plain: {
      section: cn('py-2', alternatingPlain, index % 2 === 0 ? '' : 'rounded-lg px-5'),
      label: 'text-slate-500',
      badge: 'border-slate-200 bg-slate-50 text-slate-600',
    },
    definition: {
      section: 'rounded-lg bg-blue-50/45 px-5 py-5 ring-1 ring-blue-100',
      label: 'text-blue-700',
      badge: 'border-blue-200 bg-blue-600 text-white',
    },
    process: {
      section: 'rounded-lg bg-slate-50/90 px-5 py-5 ring-1 ring-slate-200',
      label: 'text-slate-700',
      badge: 'border-slate-300 bg-slate-900 text-white',
    },
    formula: {
      section: 'rounded-lg bg-indigo-50/40 px-5 py-5 ring-1 ring-indigo-100',
      label: 'text-indigo-700',
      badge: 'border-indigo-200 bg-indigo-600 text-white',
    },
    callout: {
      section: 'rounded-lg bg-emerald-50/40 px-5 py-5 ring-1 ring-emerald-100',
      label: 'text-emerald-700',
      badge: 'border-emerald-200 bg-emerald-600 text-white',
    },
    problem: {
      section: 'rounded-lg bg-amber-50/40 px-5 py-5 ring-1 ring-amber-100',
      label: 'text-amber-700',
      badge: 'border-amber-200 bg-amber-600 text-white',
    },
    cards: {
      section: 'rounded-lg bg-slate-50/60 px-5 py-5 ring-1 ring-slate-100',
      label: 'text-blue-700',
      badge: 'border-blue-200 bg-blue-50 text-blue-700',
    },
  } satisfies Record<SemanticSectionTone, { section: string; label: string; badge: string }>;
  return styles[tone];
}

function SemanticSpotlightOverlay({
  scrollRootRef,
  sections,
  elements,
  sceneId,
  language,
}: {
  readonly scrollRootRef: RefObject<HTMLElement | null>;
  readonly sections: readonly SemanticScrollSection[];
  readonly elements: readonly PPTElement[];
  readonly sceneId: string;
  readonly language: string;
}) {
  const spotlightElementId = useCanvasStore.use.spotlightElementId();
  const spotlightOptions = useCanvasStore.use.spotlightOptions();
  const containerRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  const trackingFrameRef = useRef<number | null>(null);

  const targetId = useMemo(
    () => resolveSemanticSpotlightTarget(spotlightElementId, elements, sections),
    [spotlightElementId, elements, sections],
  );

  const getTarget = useCallback(
    () => findSemanticTarget(scrollRootRef.current, targetId),
    [scrollRootRef, targetId],
  );

  const measure = useCallback(() => {
    const container = containerRef.current;
    const scrollRoot = scrollRootRef.current;
    const target = getTarget();
    if (!spotlightElementId || !container || !scrollRoot || !target) {
      setRect(null);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const scrollRootRect = scrollRoot.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    if (containerRect.width === 0 || containerRect.height === 0 || targetRect.height === 0) {
      setRect(null);
      return;
    }

    const visibleLeft = Math.max(targetRect.left, scrollRootRect.left);
    const visibleTop = Math.max(targetRect.top, scrollRootRect.top);
    const visibleRight = Math.min(targetRect.right, scrollRootRect.right);
    const visibleBottom = Math.min(targetRect.bottom, scrollRootRect.bottom);

    if (visibleRight <= visibleLeft || visibleBottom <= visibleTop) {
      setRect(null);
      return;
    }

    setRect({
      x: visibleLeft - containerRect.left,
      y: visibleTop - containerRect.top,
      width: visibleRight - visibleLeft,
      height: visibleBottom - visibleTop,
      containerWidth: containerRect.width,
      containerHeight: containerRect.height,
    });
  }, [getTarget, scrollRootRef, spotlightElementId]);

  const trackMeasureForScrollAnimation = useCallback(() => {
    if (trackingFrameRef.current !== null) {
      window.cancelAnimationFrame(trackingFrameRef.current);
      trackingFrameRef.current = null;
    }

    const startedAt = performance.now();
    const tick = () => {
      measure();
      if (performance.now() - startedAt < 700) {
        trackingFrameRef.current = window.requestAnimationFrame(tick);
      } else {
        trackingFrameRef.current = null;
      }
    };
    trackingFrameRef.current = window.requestAnimationFrame(tick);
  }, [measure]);

  useEffect(() => {
    const target = getTarget();
    if (!spotlightElementId || !target) return;
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    trackMeasureForScrollAnimation();
    return () => {
      if (trackingFrameRef.current !== null) {
        window.cancelAnimationFrame(trackingFrameRef.current);
        trackingFrameRef.current = null;
      }
    };
  }, [getTarget, spotlightElementId, targetId, trackMeasureForScrollAnimation]);

  useLayoutEffect(() => {
    const scrollRoot = scrollRootRef.current;
    const target = getTarget();
    const container = containerRef.current;
    const frame = window.requestAnimationFrame(measure);

    scrollRoot?.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (resizeObserver) {
      if (target) resizeObserver.observe(target);
      if (container) resizeObserver.observe(container);
    }

    return () => {
      window.cancelAnimationFrame(frame);
      if (trackingFrameRef.current !== null) {
        window.cancelAnimationFrame(trackingFrameRef.current);
        trackingFrameRef.current = null;
      }
      scrollRoot?.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      resizeObserver?.disconnect();
    };
  }, [getTarget, measure, scrollRootRef, targetId]);

  const active = Boolean(spotlightElementId && spotlightOptions && rect);
  const dimness = spotlightOptions?.dimness ?? 0.55;
  const maskId = `semantic-spotlight-mask-${sceneId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const pad = 14;
  const label = language === 'en-US' ? 'Now explaining' : '正在讲解';

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
      <AnimatePresence mode="wait">
        {active && rect ? (
          <motion.div
            key={`semantic-spotlight-${spotlightElementId}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0"
          >
            <svg
              width="100%"
              height="100%"
              viewBox={`0 0 ${rect.containerWidth} ${rect.containerHeight}`}
              preserveAspectRatio="none"
              className="absolute inset-0"
            >
              <defs>
                <mask id={maskId}>
                  <rect width={rect.containerWidth} height={rect.containerHeight} fill="white" />
                  <motion.rect
                    fill="black"
                    initial={{
                      x: rect.x - pad * 2,
                      y: rect.y - pad * 2,
                      width: rect.width + pad * 4,
                      height: rect.height + pad * 4,
                      rx: 16,
                    }}
                    animate={{
                      x: Math.max(8, rect.x - pad),
                      y: Math.max(8, rect.y - pad),
                      width: Math.min(rect.containerWidth - 16, rect.width + pad * 2),
                      height: Math.min(rect.containerHeight - 16, rect.height + pad * 2),
                      rx: 12,
                    }}
                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  />
                </mask>
              </defs>
              <rect
                width={rect.containerWidth}
                height={rect.containerHeight}
                fill={`rgba(15,23,42,${dimness})`}
                mask={`url(#${maskId})`}
              />
              <motion.rect
                initial={{
                  x: rect.x - pad * 1.4,
                  y: rect.y - pad * 1.4,
                  width: rect.width + pad * 2.8,
                  height: rect.height + pad * 2.8,
                  opacity: 0,
                  rx: 14,
                }}
                animate={{
                  x: Math.max(8, rect.x - pad),
                  y: Math.max(8, rect.y - pad),
                  width: Math.min(rect.containerWidth - 16, rect.width + pad * 2),
                  height: Math.min(rect.containerHeight - 16, rect.height + pad * 2),
                  opacity: 1,
                  rx: 12,
                }}
                fill="none"
                stroke="rgba(255,255,255,0.88)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              />
            </svg>
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, delay: 0.08 }}
              className="absolute rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-slate-900 shadow-lg ring-1 ring-slate-200/70"
              style={{
                left: Math.max(12, Math.min(rect.x, rect.containerWidth - 104)),
                top: Math.max(12, rect.y - 42),
              }}
            >
              {label}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function SemanticScrollPage({
  document,
  sceneId,
  title,
  elements = [],
}: SemanticScrollPageProps) {
  const sections = useMemo(() => buildSemanticSpotlightSections(document), [document]);
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const titleHtml = useMemo(
    () => renderInlineMathHtml(document.title || title),
    [document.title, title],
  );

  return (
    <div className="relative h-full w-full overflow-hidden bg-white text-slate-950">
      <article
        ref={scrollRootRef}
        data-semantic-scroll-root="true"
        data-semantic-scroll-scene-id={sceneId}
        className="h-full w-full overflow-y-auto"
      >
        <div className="mx-auto min-h-full w-full max-w-[980px] px-6 py-8 sm:px-10 sm:py-10 lg:px-12">
          <header
            data-semantic-scroll-target="true"
            data-semantic-spotlight-id="header"
            className="scroll-mt-8 pb-7"
          >
            <p className="mb-3 inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
              {document.profile === 'math' ? 'MATHEMATICS' : document.profile.toUpperCase()}
            </p>
            <h1
              className="max-w-[820px] text-[34px] font-semibold leading-tight text-slate-950 sm:text-[42px]"
              dangerouslySetInnerHTML={{ __html: titleHtml }}
            />
          </header>

          <div className="space-y-7 py-8">
            {sections.map((section, index) => {
              const sectionDocument = documentForSection(document, section.blocks);
              const sectionTitleHtml = section.title ? renderInlineMathHtml(section.title) : null;
              const tone = sectionTone(section);
              const chrome = sectionChrome(tone, index);
              return (
                <section
                  key={section.id}
                  data-semantic-scroll-target="true"
                  data-semantic-scroll-index={index}
                  data-semantic-spotlight-id={section.id}
                  className={cn(
                    'scroll-mt-8 break-words',
                    index > 0 && tone === 'plain' ? 'pt-2' : '',
                    chrome.section,
                  )}
                >
                  {sectionTitleHtml ? (
                    <div className="mb-4 flex items-start gap-3">
                      <span
                        className={cn(
                          'mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-2 text-xs font-semibold',
                          chrome.badge,
                        )}
                      >
                        {section.eyebrow || index + 1}
                      </span>
                      <h2
                        className={cn('min-w-0 text-xl font-semibold leading-snug', chrome.label)}
                        dangerouslySetInnerHTML={{ __html: sectionTitleHtml }}
                      />
                    </div>
                  ) : null}
                  {section.blockTargets.length > 0 ? (
                    <div className="space-y-3">
                      {section.blockTargets.map((target) => (
                        <div
                          key={target.id}
                          data-semantic-scroll-target="true"
                          data-semantic-spotlight-id={target.id}
                          className="scroll-mt-8"
                        >
                          <NotebookContentView
                            document={documentForSection(document, [target.block])}
                            className={cn(
                              'text-[15px] leading-7 text-slate-800',
                              '[&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden',
                              '[&_.math-engine-display]:overflow-x-auto [&_.math-engine-display]:overflow-y-hidden',
                            )}
                          />
                        </div>
                      ))}
                    </div>
                  ) : section.blocks.length > 0 ? (
                    <NotebookContentView
                      document={sectionDocument}
                      className={cn(
                        'text-[15px] leading-7 text-slate-800',
                        '[&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden',
                        '[&_.math-engine-display]:overflow-x-auto [&_.math-engine-display]:overflow-y-hidden',
                      )}
                    />
                  ) : null}
                </section>
              );
            })}
          </div>
        </div>
      </article>
      <SemanticSpotlightOverlay
        scrollRootRef={scrollRootRef}
        sections={sections}
        elements={elements}
        sceneId={sceneId}
        language={document.language}
      />
    </div>
  );
}
