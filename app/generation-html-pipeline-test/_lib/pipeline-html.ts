import type { LectureTarget, LectureTargetKind } from './pipeline-types';

export function analyzeHtml(html: string): { elementCount: number; textNodeCount: number } {
  const elementCount = (html.match(/<([a-z][a-z0-9-]*)(\s|>)/gi) || []).length;
  const text = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const textNodeCount = text ? text.split(/[。！？.!?]\s+|\n+/).filter(Boolean).length : 0;
  return { elementCount, textNodeCount };
}

export function visibleTextFromHtml(html: string): string {
  return html
    .replace(/<head\b[\s\S]*?<\/head>/gi, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function compactText(value: string, maxLength = 240): string {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}…`;
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function elementKindForLectureTarget(element: Element): LectureTargetKind {
  const tagName = element.tagName.toLowerCase();
  const className =
    typeof element.getAttribute('class') === 'string' ? element.getAttribute('class') || '' : '';
  if (/^h[1-3]$/.test(tagName)) return 'title';
  if (tagName === 'pre' || tagName === 'code' || /code|trace|terminal|syntax/i.test(className)) {
    return 'code';
  }
  if (tagName === 'table' || /table|matrix|grid/i.test(className)) return 'table';
  if (
    tagName === 'img' ||
    tagName === 'svg' ||
    tagName === 'figure' ||
    /diagram|chart|visual|image|canvas|graph/i.test(className)
  ) {
    return 'visual';
  }
  if (tagName === 'p' || tagName === 'li') return 'text';
  return 'block';
}

export function lectureTargetPriority(kind: LectureTargetKind): number {
  if (kind === 'title') return 0;
  if (kind === 'code' || kind === 'table' || kind === 'visual') return 1;
  if (kind === 'block') return 2;
  return 3;
}

export function selectorLabelForElement(element: Element): string {
  const tagName = element.tagName.toLowerCase();
  const id = element.getAttribute('id');
  if (id) return `#${id}`;
  const semanticId = element.getAttribute('data-semantic-spotlight-id');
  if (semanticId) return `[data-semantic-spotlight-id="${semanticId}"]`;
  const lectureId = element.getAttribute('data-lecture-target-id');
  if (lectureId) return `[data-lecture-target-id="${lectureId}"]`;
  const classes = (element.getAttribute('class') || '')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 2);
  if (classes.length) return `${tagName}.${classes.join('.')}`;
  return tagName;
}

export function targetTextForElement(element: Element): string {
  const htmlElement = element as HTMLElement;
  const text = htmlElement.innerText || element.textContent || '';
  const ariaLabel = element.getAttribute('aria-label') || '';
  const alt = element.getAttribute('alt') || '';
  return compactText(text || ariaLabel || alt || selectorLabelForElement(element), 280);
}

export function targetLabelForElement(
  element: Element,
  kind: LectureTargetKind,
  index: number,
): string {
  const text = targetTextForElement(element);
  if (text && text !== selectorLabelForElement(element)) return compactText(text, 56);
  const kindLabel: Record<LectureTargetKind, string> = {
    title: '标题',
    text: '文本块',
    code: '代码/执行块',
    table: '表格/矩阵',
    visual: '图像/图表',
    block: '内容块',
  };
  return `${kindLabel[kind]} ${index + 1}`;
}

export function waitForIframeLoad(iframe: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve) => {
    const timeout = window.setTimeout(resolve, 1200);
    iframe.onload = () => {
      window.clearTimeout(timeout);
      resolve();
    };
  });
}

export async function extractLectureTargetsFromHtml(args: {
  html: string;
  canvasHeight: number;
}): Promise<LectureTarget[]> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-same-origin');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '1600px';
  iframe.style.height = `${args.canvasHeight}px`;
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.style.border = '0';
  iframe.srcdoc = args.html;
  document.body.appendChild(iframe);

  try {
    await waitForIframeLoad(iframe);
    const doc = iframe.contentDocument;
    if (!doc) return [];
    await doc.fonts?.ready.catch(() => undefined);
    await new Promise((resolve) => window.requestAnimationFrame(resolve));

    const candidates = Array.from(
      doc.querySelectorAll<HTMLElement>(
        [
          '[data-lecture-target-id]',
          '[data-semantic-spotlight-id]',
          'h1',
          'h2',
          'h3',
          'section',
          'article',
          'figure',
          'table',
          'pre',
          'code',
          'blockquote',
          'img',
          'svg',
          'p',
          'li',
          '[class*="card"]',
          '[class*="panel"]',
          '[class*="step"]',
          '[class*="diagram"]',
          '[class*="trace"]',
          '[class*="callout"]',
        ].join(','),
      ),
    );
    const viewportWidth = 1600;
    const viewportHeight = args.canvasHeight;
    const rawTargets = candidates
      .map((element, index) => {
        const style = doc.defaultView?.getComputedStyle(element);
        if (
          style?.display === 'none' ||
          style?.visibility === 'hidden' ||
          Number(style?.opacity || '1') <= 0.02
        ) {
          return null;
        }
        const rect = element.getBoundingClientRect();
        if (rect.width < 64 || rect.height < 22) return null;
        if (
          rect.bottom <= 0 ||
          rect.top >= viewportHeight ||
          rect.right <= 0 ||
          rect.left >= 1600
        ) {
          return null;
        }
        const kind = elementKindForLectureTarget(element);
        const areaRatio = (rect.width * rect.height) / (viewportWidth * viewportHeight);
        if (areaRatio > 0.72 && kind !== 'title') return null;
        const text = targetTextForElement(element);
        if (!text && kind !== 'visual' && kind !== 'table' && kind !== 'code') return null;
        if (text.length < 4 && kind !== 'visual' && kind !== 'table' && kind !== 'code') {
          return null;
        }
        const x = clampNumber(rect.left, 0, viewportWidth);
        const y = clampNumber(rect.top, 0, viewportHeight);
        const width = clampNumber(rect.width, 1, viewportWidth - x);
        const height = clampNumber(rect.height, 1, viewportHeight - y);
        return {
          id: `html-target-${index + 1}`,
          label: targetLabelForElement(element, kind, index),
          selector: selectorLabelForElement(element),
          kind,
          text,
          rect: { x, y, width, height },
          areaRatio,
        } satisfies LectureTarget;
      })
      .filter((target): target is LectureTarget => Boolean(target))
      .sort((a, b) => {
        const priorityDelta = lectureTargetPriority(a.kind) - lectureTargetPriority(b.kind);
        if (priorityDelta && Math.abs(a.rect.y - b.rect.y) < 80) return priorityDelta;
        return a.rect.y - b.rect.y || a.rect.x - b.rect.x || b.areaRatio - a.areaRatio;
      });

    const selected: LectureTarget[] = [];
    for (const target of rawTargets) {
      const isDuplicate = selected.some((existing) => {
        const centerX = target.rect.x + target.rect.width / 2;
        const centerY = target.rect.y + target.rect.height / 2;
        const insideExisting =
          centerX >= existing.rect.x &&
          centerX <= existing.rect.x + existing.rect.width &&
          centerY >= existing.rect.y &&
          centerY <= existing.rect.y + existing.rect.height;
        const sameLabel =
          target.label === existing.label ||
          (target.text && existing.text && target.text === existing.text);
        return insideExisting && (sameLabel || existing.areaRatio >= target.areaRatio * 1.6);
      });
      if (!isDuplicate) selected.push({ ...target, id: `html-target-${selected.length + 1}` });
      if (selected.length >= 12) break;
    }
    return selected;
  } finally {
    iframe.remove();
  }
}
