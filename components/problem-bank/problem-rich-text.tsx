'use client';

import {
  renderHtmlWithLatex,
  renderPlainTitleWithOptionalLatex,
} from '@/lib/render-html-with-latex';
import { cn } from '@/lib/utils';

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function textToHtml(text: string): string {
  const html = text
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br/>')}</p>`)
    .join('');
  return renderHtmlWithLatex(html);
}

export function ProblemRichText({ content, className }: { content?: string; className?: string }) {
  if (!content?.trim()) return null;
  return (
    <div
      className={cn(
        'prose prose-slate max-w-none text-sm leading-7 dark:prose-invert [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-0 [&_.katex-display]:my-3',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: textToHtml(content) }}
    />
  );
}

export function ProblemTitleText({ content, className }: { content?: string; className?: string }) {
  if (!content?.trim()) return null;
  return (
    <span
      className={cn(
        'inline [&_.katex]:text-[1em] [&_.katex]:leading-none [&_.math-engine-inline]:align-baseline',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: renderPlainTitleWithOptionalLatex(content) }}
    />
  );
}
