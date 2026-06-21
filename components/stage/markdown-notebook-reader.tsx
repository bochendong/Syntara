'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BookOpen, FileText } from 'lucide-react';
import { MessageResponse } from '@/components/ai-elements/message';
import type { Scene, Stage as StageData } from '@/lib/types/stage';

type MarkdownNotebookReaderProps = {
  stage: StageData;
  scenes: Scene[];
  currentSceneId: string | null;
  onSelectScene: (sceneId: string) => void;
  headerActions?: ReactNode;
};

export function MarkdownNotebookReader({
  stage,
  scenes,
  currentSceneId,
  onSelectScene,
  headerActions,
}: MarkdownNotebookReaderProps) {
  const sections = useMemo(
    () => scenes.filter((scene) => scene.content.type === 'markdown'),
    [scenes],
  );
  const fallbackActiveSectionId =
    currentSceneId && sections.some((scene) => scene.id === currentSceneId)
      ? currentSceneId
      : sections[0]?.id || null;
  const [scrollActiveSectionId, setScrollActiveSectionId] = useState<string | null>(
    fallbackActiveSectionId,
  );
  const activeSectionId =
    scrollActiveSectionId && sections.some((section) => section.id === scrollActiveSectionId)
      ? scrollActiveSectionId
      : fallbackActiveSectionId;
  const activeSectionIdRef = useRef<string | null>(activeSectionId);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const navItemRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());
  const scrollRafRef = useRef<number | null>(null);
  const courseHref = stage.courseId
    ? `/course/${encodeURIComponent(stage.courseId)}`
    : '/my-courses';
  const sectionAnchors = useMemo(
    () =>
      sections.map((section, index) => ({
        sceneId: section.id,
        domId: `markdown-${String(section.id || index).replace(/[^a-zA-Z0-9_-]/g, '-')}`,
        title: section.title || `纯文本 ${index + 1}`,
        summary: section.content.type === 'markdown' ? section.content.summary : undefined,
      })),
    [sections],
  );

  const setActiveSection = useCallback(
    (sceneId: string | null) => {
      if (!sceneId || activeSectionIdRef.current === sceneId) return;
      activeSectionIdRef.current = sceneId;
      setScrollActiveSectionId(sceneId);
      onSelectScene(sceneId);
    },
    [onSelectScene],
  );

  const syncActiveSectionFromScroll = useCallback(() => {
    const scrollRoot = scrollContainerRef.current;
    if (!scrollRoot || sections.length === 0) return;

    const rootRect = scrollRoot.getBoundingClientRect();
    const probeY = rootRect.top + Math.min(152, rootRect.height * 0.24);
    let nextSectionId = sections[0]?.id ?? null;

    for (const section of sections) {
      const sectionNode = sectionRefs.current.get(section.id);
      if (!sectionNode) continue;
      const sectionRect = sectionNode.getBoundingClientRect();
      if (sectionRect.top <= probeY) {
        nextSectionId = section.id;
      } else {
        break;
      }
    }

    setActiveSection(nextSectionId);
  }, [sections, setActiveSection]);

  const scheduleScrollSync = useCallback(() => {
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      syncActiveSectionFromScroll();
    });
  }, [syncActiveSectionFromScroll]);

  useEffect(() => {
    activeSectionIdRef.current = activeSectionId;
  }, [activeSectionId]);

  useEffect(() => {
    const scrollRoot = scrollContainerRef.current;
    if (!scrollRoot) return;

    scrollRoot.addEventListener('scroll', scheduleScrollSync, { passive: true });
    window.addEventListener('resize', scheduleScrollSync);
    const initialSyncTimer = window.setTimeout(scheduleScrollSync, 0);

    return () => {
      scrollRoot.removeEventListener('scroll', scheduleScrollSync);
      window.removeEventListener('resize', scheduleScrollSync);
      window.clearTimeout(initialSyncTimer);
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [scheduleScrollSync]);

  useEffect(() => {
    const activeNavItem = activeSectionId ? navItemRefs.current.get(activeSectionId) : null;
    activeNavItem?.scrollIntoView({ block: 'nearest' });
  }, [activeSectionId]);

  return (
    <div className="flex min-h-0 flex-1 bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <aside className="hidden w-[280px] shrink-0 border-r border-slate-200 bg-white/88 p-4 lg:flex lg:flex-col dark:border-white/10 dark:bg-white/[0.04]">
        <Link
          href={courseHref}
          className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
        >
          <BookOpen className="size-3.5" />
          返回课程
        </Link>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300">
            纯文本笔记
          </p>
          <h1 className="mt-1 line-clamp-2 text-lg font-semibold">{stage.name}</h1>
          {stage.description ? (
            <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {stage.description}
            </p>
          ) : null}
        </div>
        <nav
          aria-label="纯文本章节目录"
          className="mt-5 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1"
        >
          {sectionAnchors.map((section, index) => {
            const active = section.sceneId === activeSectionId;
            return (
              <a
                key={section.sceneId}
                ref={(node) => {
                  if (node) {
                    navItemRefs.current.set(section.sceneId, node);
                  } else {
                    navItemRefs.current.delete(section.sceneId);
                  }
                }}
                href={`#${section.domId}`}
                aria-current={active ? 'location' : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  setActiveSection(section.sceneId);
                  sectionRefs.current
                    .get(section.sceneId)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  window.history.replaceState(null, '', `#${section.domId}`);
                }}
                className={[
                  'relative flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-all',
                  active
                    ? 'border-blue-300 bg-blue-50 text-blue-950 shadow-sm ring-1 ring-blue-200/70 dark:border-blue-400/50 dark:bg-blue-400/12 dark:text-blue-50 dark:ring-blue-400/20'
                    : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 dark:text-slate-300 dark:hover:border-white/10 dark:hover:bg-white/[0.06]',
                ].join(' ')}
              >
                {active ? (
                  <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-blue-600 dark:bg-blue-300" />
                ) : null}
                <span
                  className={[
                    'mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold shadow-sm ring-1',
                    active
                      ? 'bg-blue-600 text-white ring-blue-600 dark:bg-blue-300 dark:text-slate-950 dark:ring-blue-300'
                      : 'bg-white text-slate-500 ring-slate-900/[0.06] dark:bg-black/20 dark:text-slate-300 dark:ring-white/10',
                  ].join(' ')}
                >
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{section.title}</span>
                  {section.summary ? (
                    <span className="mt-1 line-clamp-2 text-[11px] leading-4 opacity-75">
                      {section.summary}
                    </span>
                  ) : null}
                </span>
              </a>
            );
          })}
        </nav>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 items-center justify-between gap-3 border-b border-slate-200 bg-white/88 px-5 py-3 dark:border-white/10 dark:bg-white/[0.04]">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {sections.length} 段纯文本内容
            </p>
            <h2 className="truncate text-base font-semibold">{stage.name}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">{headerActions}</div>
        </div>
        <div
          ref={scrollContainerRef}
          className="min-h-0 flex-1 scroll-smooth overflow-auto bg-slate-100/60 px-4 py-6 sm:px-8 lg:px-12 dark:bg-slate-950"
        >
          {sections.length > 0 ? (
            <article className="mx-auto flex max-w-4xl flex-col gap-8 pb-16">
              {sections.map((section, index) => {
                if (section.content.type !== 'markdown') return null;
                const anchor = sectionAnchors[index];
                return (
                  <section
                    key={section.id}
                    id={anchor.domId}
                    ref={(node) => {
                      if (node) {
                        sectionRefs.current.set(section.id, node);
                      } else {
                        sectionRefs.current.delete(section.id);
                      }
                    }}
                    className="scroll-mt-6 overflow-hidden rounded-lg border border-slate-300/85 border-t-4 border-t-blue-500/80 bg-white shadow-[0_16px_36px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/[0.04] dark:border-white/12 dark:border-t-blue-300/80 dark:bg-white/[0.045] dark:ring-white/[0.05]"
                  >
                    <header className="border-b border-slate-200 bg-slate-100/80 px-5 py-4 dark:border-white/10 dark:bg-white/[0.05] sm:px-7">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="mt-0.5 inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md bg-slate-950 px-2 text-xs font-bold text-white dark:bg-white dark:text-slate-950">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                            章节
                          </p>
                          <h3 className="mt-1 text-lg font-semibold leading-7 text-slate-950 dark:text-white">
                            {anchor.title}
                          </h3>
                          {anchor.summary ? (
                            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                              {anchor.summary}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </header>
                    <div className="px-5 py-6 sm:px-7 sm:py-7">
                      <MessageResponse className="text-[15px] leading-8 text-slate-800 dark:text-slate-100 [&_a]:text-blue-600 [&_a]:underline-offset-4 hover:[&_a]:underline dark:[&_a]:text-blue-300 [&_[data-streamdown=image-wrapper]]:my-7 [&_[data-streamdown=image-wrapper]]:block [&_[data-streamdown=image-wrapper]]:w-full [&_[data-streamdown=image]]:mx-auto [&_[data-streamdown=image]]:max-h-[520px] [&_[data-streamdown=image]]:w-full [&_[data-streamdown=image]]:max-w-3xl [&_[data-streamdown=image]]:border [&_[data-streamdown=image]]:border-slate-200 [&_[data-streamdown=image]]:bg-white [&_[data-streamdown=image]]:object-contain [&_[data-streamdown=image]]:shadow-sm dark:[&_[data-streamdown=image]]:border-white/10 dark:[&_[data-streamdown=image]]:bg-slate-900">
                        {section.content.markdown}
                      </MessageResponse>
                    </div>
                  </section>
                );
              })}
            </article>
          ) : (
            <div className="mx-auto flex min-h-[360px] max-w-3xl items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white/80 text-center text-sm text-slate-500 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-400">
              <div>
                <FileText className="mx-auto mb-3 size-8 opacity-60" />
                这个纯文本笔记本还没有内容。
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
