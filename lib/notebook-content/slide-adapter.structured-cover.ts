import type { PPTElement, Slide } from '@/lib/types/slides';
import type { NotebookContentBlock, NotebookContentDocument } from './schema';
import { escapeHtml, renderInlineLatexToHtml } from './inline-html';
import { CONTENT_LEFT, CONTENT_WIDTH } from './layout-constants';
import { createCircleShape, createRectShape, createTextElement } from './slide-element-factory';
import {
  ACADEMY_PAPER,
  blockSummaryLines,
  createSlideFromFamilyElements,
  getProfileTokens,
  type VisualSlotWithTitle,
} from './slide-adapter.shared';
import { renderVisualPanel } from './slide-adapter.classic-basic';

export function getCoverTitleSize(title: string): number {
  const normalizedLength = title.replace(/\s+/g, '').length;
  if (normalizedLength > 34) return 34;
  if (normalizedLength > 24) return 38;
  if (normalizedLength > 16) return 42;
  return 48;
}

export function collectCoverLines(
  language: 'zh-CN' | 'en-US',
  blocks: NotebookContentBlock[],
): string[] {
  return blocks
    .flatMap((block) => blockSummaryLines(language, block))
    .map((line) => line.trim())
    .filter(Boolean);
}

export function stripCoverRoutePrefix(item: string): string {
  return item
    .replace(/^(步骤|阶段)\s*\d+\s*[：:]\s*/i, '')
    .replace(/^step\s*\d+\s*[:：]\s*/i, '')
    .replace(/^(核心要点|学习路线|课堂推进顺序|Learning Roadmap|Roadmap)\s*[：:]\s*/i, '')
    .trim();
}

export function inferSupplementalCoverRouteItem(args: {
  language: 'zh-CN' | 'en-US';
  title: string;
  lead: string;
  existingItems: string[];
}): string {
  const haystack = [args.title, args.lead, ...args.existingItems].join('\n');
  if (args.language === 'en-US') {
    if (/prime|factorization|unique decomposition/i.test(haystack)) {
      return 'Structure wrap-up - connect divisibility criteria with primes, factorization, and proof strategy.';
    }
    if (/proof|derive|criterion|theorem/i.test(haystack)) {
      return 'Proof habits - state the criterion, choose the right direction, and test edge cases.';
    }
    return 'Synthesis - close the loop by turning the main ideas into usable problem-solving moves.';
  }

  if (/唯一分解|素数无穷|质数|素数/.test(haystack)) {
    return '结构收束 - 把整除判据、质数性质与唯一分解串成可证明的知识框架。';
  }
  if (/证明|判据|定理|推导/.test(haystack)) {
    return '证明习惯 - 先写判据，再选证明方向，最后用反例或边界条件检验。';
  }
  return '综合迁移 - 把本页主线转化成后续例题和证明中可复用的操作。';
}

export function completeCoverRouteItems(args: {
  language: 'zh-CN' | 'en-US';
  title: string;
  lead: string;
  items: string[];
}): string[] {
  const normalized = args.items.map(stripCoverRoutePrefix).filter(Boolean);
  const deduped = normalized.filter(
    (item, index) => normalized.findIndex((candidate) => candidate === item) === index,
  );
  const next = [...deduped];
  while (next.length < 3) {
    const supplement = inferSupplementalCoverRouteItem({
      language: args.language,
      title: args.title,
      lead: args.lead,
      existingItems: next,
    });
    if (next.some((item) => item === supplement)) break;
    next.push(supplement);
  }
  return next.slice(0, 3);
}

export function splitCoverRouteItem(args: {
  item: string;
  index: number;
  language: 'zh-CN' | 'en-US';
}): {
  title: string;
  detail: string;
} {
  const cleaned = stripCoverRoutePrefix(args.item);
  const dashMatch = cleaned.match(/^(.{2,28}?)[\s]*[-—–][\s]*(.+)$/);
  const colonMatch = cleaned.match(/^(.{2,16}?)[：:]\s*(.+)$/);
  const match = dashMatch || colonMatch;
  if (match?.[1] && match?.[2]) {
    return {
      title: match[1].trim(),
      detail: match[2].trim(),
    };
  }
  return {
    title: args.language === 'en-US' ? `Stage ${args.index + 1}` : `阶段 ${args.index + 1}`,
    detail: cleaned,
  };
}

export function renderCoverRouteStrip(args: {
  title: string;
  lead: string;
  items: string[];
  language: 'zh-CN' | 'en-US';
  tokens: ReturnType<typeof getProfileTokens>;
}): PPTElement[] {
  const normalizedItems = completeCoverRouteItems({
    language: args.language,
    title: args.title,
    lead: args.lead,
    items:
      args.items.length > 0
        ? args.items
        : args.language === 'en-US'
          ? ['Define precisely', 'Work examples', 'Synthesize the proof habit']
          : ['明确核心定义', '进入例题推导', '收束证明方法'],
  });
  const labelTop = 354;
  const top = 384;
  const left = CONTENT_LEFT + 6;
  const width = CONTENT_WIDTH - 12;
  const gap = 18;
  const segmentWidth = (width - gap * (normalizedItems.length - 1)) / normalizedItems.length;
  const cardHeight = 120;

  const elements: PPTElement[] = [
    createTextElement({
      left,
      top: labelTop,
      width: 220,
      height: 24,
      html: `<p style="font-size:15px;line-height:20px;color:${args.tokens.titleAccent};font-weight:800;">${escapeHtml(
        args.language === 'en-US' ? 'Learning Roadmap' : '学习路线',
      )}</p>`,
      color: args.tokens.titleAccent,
      textType: 'notes',
    }),
  ];

  normalizedItems.forEach((item, index) => {
    const x = left + index * (segmentWidth + gap);
    const accent = args.tokens.cardPalettes[index % args.tokens.cardPalettes.length].accent;
    const parsed = splitCoverRouteItem({ item, index, language: args.language });
    elements.push(
      createRectShape({
        left: x,
        top,
        width: segmentWidth,
        height: cardHeight,
        fill: 'rgba(255,253,248,0.82)',
        outlineColor: 'rgba(119,148,191,0.28)',
      }),
      createCircleShape({
        left: x + 18,
        top: top + 18,
        size: 28,
        fill: accent,
      }),
      createTextElement({
        left: x + 26,
        top: top + 23,
        width: 12,
        height: 18,
        html: `<p style="font-size:12px;line-height:16px;color:#ffffff;text-align:center;font-weight:820;">${index + 1}</p>`,
        color: '#ffffff',
        textType: 'notes',
      }),
      createTextElement({
        left: x + 58,
        top: top + 18,
        width: segmentWidth - 76,
        height: 24,
        html: `<p style="font-size:14px;line-height:19px;color:${accent};font-weight:820;">${renderInlineLatexToHtml(
          parsed.title,
        )}</p>`,
        color: accent,
        textType: 'content',
      }),
      createTextElement({
        left: x + 18,
        top: top + 54,
        width: segmentWidth - 36,
        height: 54,
        html: `<p style="font-size:12px;line-height:17px;color:${ACADEMY_PAPER.bodyText};">${renderInlineLatexToHtml(
          parsed.detail,
        )}</p>`,
        color: ACADEMY_PAPER.bodyText,
        textType: 'content',
      }),
    );
  });

  return elements;
}

export function renderCoverHeroSlide(args: {
  document: NotebookContentDocument;
  fallbackTitle: string;
  language: 'zh-CN' | 'en-US';
  tokens: ReturnType<typeof getProfileTokens>;
  blocks: NotebookContentBlock[];
  visual?: VisualSlotWithTitle | null;
}): Slide {
  const title = args.document.title || args.fallbackTitle;
  const titleSize = getCoverTitleSize(title);
  const lines = collectCoverLines(args.language, args.blocks);
  const lead = lines[0] || args.document.title || args.fallbackTitle;
  const routeItems = lines
    .slice(1)
    .map((line) =>
      line.replace(
        /^(明确课程主题|学习主线|强调证明意识|主题范围|核心要点|课堂推进顺序)[：:]\s*/,
        '',
      ),
    )
    .filter(Boolean);
  const hasVisual = Boolean(args.visual?.source);
  const elements: PPTElement[] = [
    createTextElement({
      left: CONTENT_LEFT,
      top: 72,
      width: CONTENT_WIDTH,
      height: 118,
      html: `<p style="font-size:${titleSize}px;line-height:${Math.round(titleSize * 1.12)}px;color:${args.tokens.titleText};font-weight:840;">${renderInlineLatexToHtml(title)}</p>`,
      color: args.tokens.titleText,
      textType: 'title',
    }),
    createRectShape({
      left: CONTENT_LEFT,
      top: 198,
      width: 120,
      height: 5,
      fill: args.tokens.titleAccent,
    }),
    createTextElement({
      left: CONTENT_LEFT,
      top: 232,
      width: hasVisual ? 510 : 720,
      height: 112,
      html: `<p style="font-size:17px;line-height:26px;color:${ACADEMY_PAPER.bodyText};">${renderInlineLatexToHtml(lead)}</p>`,
      color: ACADEMY_PAPER.bodyText,
      textType: 'subtitle',
    }),
    ...renderCoverRouteStrip({
      title,
      lead,
      items: routeItems,
      language: args.language,
      tokens: args.tokens,
    }),
  ];

  if (hasVisual) {
    elements.push(
      ...renderVisualPanel({
        visual: args.visual || null,
        blocks: args.blocks,
        language: args.language,
        left: 626,
        top: 218,
        width: 288,
        height: 212,
        tokens: args.tokens,
      }),
    );
  }

  return createSlideFromFamilyElements({ elements, tokens: args.tokens, backgroundIndex: 0 });
}
