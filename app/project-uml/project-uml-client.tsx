'use client';

import { useEffect, useMemo, useState } from 'react';
import mermaid from 'mermaid';

type MarkdownBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'diagram'; code: string };

function parseProjectUmlMarkdown(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = markdown.split(/\r?\n/);
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      index += 1;
      continue;
    }

    if (line.trim() === '```mermaid') {
      const diagramLines: string[] = [];
      index += 1;
      while (index < lines.length && lines[index].trim() !== '```') {
        diagramLines.push(lines[index]);
        index += 1;
      }
      blocks.push({ type: 'diagram', code: diagramLines.join('\n') });
      index += 1;
      continue;
    }

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const paragraphLines = [line.trim()];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].startsWith('#') &&
      lines[index].trim() !== '```mermaid'
    ) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraphLines.join(' ') });
  }

  return blocks;
}

export function ProjectUmlClient({ markdown }: { markdown: string }) {
  const blocks = useMemo(() => parseProjectUmlMarkdown(markdown), [markdown]);
  const [mermaidError, setMermaidError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (cancelled) return;
        setMermaidError(null);
        mermaid.initialize({
          startOnLoad: false,
          theme: 'neutral',
          securityLevel: 'strict',
          flowchart: { htmlLabels: true },
        });
        await mermaid.run({ querySelector: '.project-uml-mermaid' });
      } catch (error) {
        if (!cancelled) {
          const diagramCount = document.querySelectorAll('.project-uml-mermaid').length;
          const renderedCount = document.querySelectorAll(
            'svg[id^="mermaid"], .project-uml-mermaid svg',
          ).length;
          if (renderedCount < diagramCount) {
            setMermaidError(error instanceof Error ? error.message : String(error));
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [blocks]);

  return (
    <main className="min-h-dvh bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300">
            Syntara UML
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">Project UML Diagrams</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            Rendered from docs/project-uml.md. If Mermaid cannot load, the raw diagram source stays
            visible for inspection.
          </p>
          {mermaidError ? (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
              Mermaid failed to load: {mermaidError}
            </p>
          ) : null}
        </header>

        <section className="flex flex-col gap-5">
          {blocks.map((block, index) => {
            if (block.type === 'heading') {
              const HeadingTag = block.level === 1 ? 'h1' : block.level === 2 ? 'h2' : 'h3';
              return (
                <HeadingTag
                  key={`${block.type}-${index}`}
                  className="mt-3 scroll-m-6 text-xl font-semibold tracking-normal first:mt-0"
                >
                  {block.text}
                </HeadingTag>
              );
            }

            if (block.type === 'paragraph') {
              return (
                <p
                  key={`${block.type}-${index}`}
                  className="max-w-4xl text-sm leading-6 text-slate-600 dark:text-slate-300"
                >
                  {block.text}
                </p>
              );
            }

            return (
              <div
                key={`${block.type}-${index}`}
                className="overflow-auto rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]"
              >
                <pre className="project-uml-mermaid min-w-[720px] text-center text-sm">
                  {block.code}
                </pre>
              </div>
            );
          })}
        </section>
      </div>
    </main>
  );
}
