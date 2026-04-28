import { normalizeSceneOutlineContentProfile } from '@/lib/generation/content-profile';
import {
  createLineElement,
  createRectShape,
  createTextElement,
} from '@/lib/notebook-content/slide-element-factory';
import { escapeHtml } from '@/lib/notebook-content/inline-html';
import type { GeneratedSlideContent, SceneOutline } from '@/lib/types/generation';
import type { SlideTheme } from '@/lib/types/slides';

export const TITLE_COVER_OUTLINE_ID = 'scene_title_cover';

const TITLE_COVER_MARKER = 'syntara:title-only-cover';

function getTitleSize(title: string): number {
  const compactLength = title.replace(/\s+/g, '').length;
  if (compactLength > 34) return 36;
  if (compactLength > 26) return 40;
  if (compactLength > 18) return 45;
  return 52;
}

function escapeSyntaraOption(value: string): string {
  return value.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
}

function resolveCoverTitle(args: {
  title?: string;
  firstOutline?: SceneOutline;
  language: 'zh-CN' | 'en-US';
}): string {
  const fromStage = args.title?.trim();
  if (fromStage) return fromStage;

  const fromOutline = args.firstOutline?.title?.trim();
  if (fromOutline) return fromOutline;

  return args.language === 'en-US' ? 'Untitled Lesson' : '未命名课程';
}

function truncateCoverText(value: string, maxLength: number): string {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function inferCoverSubtitle(args: {
  outline: SceneOutline;
  title: string;
  language: 'zh-CN' | 'en-US';
}): string {
  const description = args.outline.description?.trim();
  if (description) return truncateCoverText(description, args.language === 'en-US' ? 78 : 42);

  const title = args.title.toLowerCase();
  if (/mat|proof|证明|函数|映射|linear|algebra|calculus|math/.test(title)) {
    return args.language === 'en-US'
      ? 'A proof-oriented path through concepts, examples, and precise notation'
      : '从概念框架、例题走读到证明语言的学习路径';
  }
  if (/code|program|算法|编程|python|javascript|数据结构/.test(title)) {
    return args.language === 'en-US'
      ? 'A structured route from core ideas to executable reasoning'
      : '从核心概念到可执行思维的结构化路线';
  }
  return args.language === 'en-US'
    ? 'A focused learning notebook with concepts, methods, and takeaways'
    : '围绕核心概念、方法与总结的学习笔记';
}

function fallbackCoverRouteItems(args: { title: string; language: 'zh-CN' | 'en-US' }): string[] {
  const title = args.title.toLowerCase();
  if (/mat|proof|证明|函数|映射|linear|algebra|calculus|math/.test(title)) {
    return args.language === 'en-US'
      ? ['Concept Map', 'Worked Reasoning', 'Proof Language']
      : ['概念框架', '例题推导', '证明语言'];
  }
  if (/code|program|算法|编程|python|javascript|数据结构/.test(title)) {
    return args.language === 'en-US'
      ? ['Core Idea', 'Trace the Logic', 'Implementation Notes']
      : ['核心概念', '逻辑追踪', '实现要点'];
  }
  return args.language === 'en-US'
    ? ['Core Concepts', 'Method Walkthrough', 'Key Takeaways']
    : ['核心概念', '方法走读', '关键总结'];
}

function routeItemFromText(value: string, language: 'zh-CN' | 'en-US'): string {
  const normalized = value
    .replace(/^[\d一二三四五六七八九十]+[.)、．]\s*/, '')
    .replace(/^(掌握|理解|明确|进入|学会|能够|learn|understand|master|identify)\s*/i, '')
    .trim();
  const clipped = normalized.split(/[。.!！?？；;]/)[0] || normalized;
  return truncateCoverText(clipped, language === 'en-US' ? 28 : 14);
}

function resolveCoverRouteItems(outline: SceneOutline, title: string): string[] {
  const language = outline.language || 'zh-CN';
  const fromOutline = (outline.keyPoints || [])
    .map((item) => routeItemFromText(item, language))
    .filter(Boolean)
    .slice(0, 3);
  const fallback = fallbackCoverRouteItems({ title, language });
  return [...fromOutline, ...fallback].slice(0, 3);
}

function resolveCoverWatermarks(outline: SceneOutline, title: string) {
  const lowerTitle = title.toLowerCase();
  if (
    outline.contentProfile === 'code' ||
    /code|program|算法|编程|python|javascript|数据结构/.test(lowerTitle)
  ) {
    return [
      { html: 'input &rarr; state', color: 'rgba(37,99,235,0.18)' },
      { html: 'if / then', color: 'rgba(124,58,237,0.16)' },
      { html: 'output()', color: 'rgba(22,163,74,0.16)' },
    ];
  }

  if (
    outline.contentProfile === 'math' ||
    /mat|proof|证明|函数|映射|linear|algebra|calculus|math/.test(lowerTitle)
  ) {
    return [
      { html: 'f: A &rarr; B', color: 'rgba(37,99,235,0.18)' },
      { html: '&forall;x &isin; A', color: 'rgba(124,58,237,0.16)' },
      { html: 'Im(f) &sube; B', color: 'rgba(22,163,74,0.16)' },
    ];
  }

  return [
    { html: 'concept', color: 'rgba(37,99,235,0.18)' },
    { html: 'method', color: 'rgba(124,58,237,0.16)' },
    { html: 'takeaway', color: 'rgba(22,163,74,0.16)' },
  ];
}

function buildCoverKeyPoints(firstOutline: SceneOutline | undefined, language: 'zh-CN' | 'en-US') {
  const points = (firstOutline?.keyPoints || [])
    .map((item) => routeItemFromText(item, language))
    .filter(Boolean);
  if (points.length >= 3) return points.slice(0, 3);
  const fallback = fallbackCoverRouteItems({
    title: firstOutline?.title || '',
    language,
  });
  return [...points, ...fallback].slice(0, 3);
}

function shouldSkipCoverInsert(outlines: SceneOutline[]): boolean {
  const first = outlines[0];
  if (!first) return false;
  return isTitleCoverOutline(first);
}

function demoteOldCoverIntent(outline: SceneOutline): SceneOutline {
  const intent = outline.layoutIntent;
  const isOldCover =
    intent?.layoutFamily === 'cover' ||
    intent?.layoutTemplate === 'cover_hero' ||
    outline.archetype === 'intro';

  if (!isOldCover) return outline;

  const template = (outline.keyPoints?.length || 0) >= 3 ? 'three_cards' : 'title_content';
  return {
    ...outline,
    layoutIntent: {
      ...(intent || {}),
      layoutFamily: 'concept_cards',
      layoutTemplate: template,
      density: intent?.density === 'light' ? 'standard' : intent?.density,
    },
  };
}

export function isTitleCoverOutline(outline: SceneOutline | undefined | null): boolean {
  if (!outline) return false;
  return (
    outline.id === TITLE_COVER_OUTLINE_ID ||
    outline.teachingObjective === TITLE_COVER_MARKER ||
    (outline.layoutIntent?.layoutFamily === 'cover' &&
      outline.layoutIntent?.layoutTemplate === 'cover_hero' &&
      outline.keyPoints.length === 0 &&
      outline.description.trim() === '')
  );
}

export function ensureTitleCoverOutline(
  outlines: SceneOutline[],
  args: {
    title?: string;
    language?: 'zh-CN' | 'en-US';
  } = {},
): SceneOutline[] {
  if (!outlines.length) return outlines;
  if (shouldSkipCoverInsert(outlines)) {
    return outlines.map((outline, index) =>
      normalizeSceneOutlineContentProfile({
        ...outline,
        order: index + 1,
      }),
    );
  }

  const firstOutline = outlines[0];
  const language = args.language || firstOutline?.language || 'zh-CN';
  const coverTitle = resolveCoverTitle({
    title: args.title,
    firstOutline,
    language,
  });

  const cover = normalizeSceneOutlineContentProfile({
    id: TITLE_COVER_OUTLINE_ID,
    type: 'slide',
    contentProfile: outlines[0]?.contentProfile || 'general',
    archetype: 'intro',
    layoutIntent: {
      layoutFamily: 'cover',
      layoutTemplate: 'cover_hero',
      disciplineStyle: outlines[0]?.layoutIntent?.disciplineStyle || 'general',
      teachingFlow: 'standalone',
      density: 'light',
      visualRole: 'none',
      overflowPolicy: 'compress_first',
      preserveFullProblemStatement: false,
    },
    title: coverTitle,
    description: firstOutline?.description
      ? truncateCoverText(firstOutline.description, language === 'en-US' ? 78 : 42)
      : '',
    keyPoints: buildCoverKeyPoints(firstOutline, language),
    teachingObjective: TITLE_COVER_MARKER,
    estimatedDuration: 20,
    order: 1,
    language,
  });

  const shifted = outlines.map((outline, index) =>
    normalizeSceneOutlineContentProfile({
      ...demoteOldCoverIntent(outline),
      order: index + 2,
      language: outline.language || language,
    }),
  );

  return [cover, ...shifted];
}

export function buildTitleCoverSlideContent(outline: SceneOutline): GeneratedSlideContent {
  const language = outline.language || 'zh-CN';
  const title = outline.title.trim() || (language === 'en-US' ? 'Untitled Lesson' : '未命名课程');
  const titleSize = getTitleSize(title);
  const subtitle = inferCoverSubtitle({ outline, title, language });
  const routeItems = resolveCoverRouteItems(outline, title);
  const watermarks = resolveCoverWatermarks(outline, title);
  const profileLabel =
    outline.contentProfile === 'math'
      ? 'MATHEMATICS'
      : outline.contentProfile === 'code'
        ? 'COMPUTING'
        : language === 'en-US'
          ? 'LEARNING NOTEBOOK'
          : '学习笔记';
  const theme: SlideTheme = {
    backgroundColor: '#f8fbff',
    themeColors: ['#2563eb', '#7c3aed', '#16a34a', '#d6a84f', '#111827'],
    fontColor: '#182033',
    fontName: 'Microsoft YaHei',
  };
  const elements: GeneratedSlideContent['elements'] = [
    createRectShape({
      left: 0,
      top: 0,
      width: 1000,
      height: 562,
      fill: '#f8fbff',
    }),
    createRectShape({
      left: 0,
      top: 0,
      width: 1000,
      height: 86,
      fill: 'rgba(230,239,255,0.72)',
    }),
    createRectShape({
      left: 744,
      top: 84,
      width: 170,
      height: 350,
      fill: 'rgba(255,255,255,0.62)',
      outlineColor: 'rgba(148,163,184,0.24)',
    }),
    createLineElement({ start: [92, 345], end: [668, 345], color: '#d8e4ff', width: 2 }),
    createLineElement({ start: [92, 352], end: [515, 352], color: '#efe2ff', width: 1 }),
  ];

  for (let i = 0; i < 6; i += 1) {
    elements.push(
      createLineElement({
        start: [744, 122 + i * 44],
        end: [914, 122 + i * 44],
        color: 'rgba(148,163,184,0.18)',
        width: 1,
      }),
    );
  }

  elements.push(
    createTextElement({
      left: 92,
      top: 66,
      width: 240,
      height: 28,
      html: `<p style="margin:0;font-size:13px;letter-spacing:3px;color:#2563eb;font-weight:800;">${escapeHtml(
        profileLabel,
      )}</p>`,
      color: '#2563eb',
      textType: 'header',
    }),
    ...watermarks.map((watermark, index) => ({
      ...createTextElement({
        left: 760,
        top: 124 + index * 82,
        width: 138,
        height: 54,
        html: `<p style="margin:0;font-size:${
          index === 0 ? 24 : 22
        }px;line-height:32px;color:${watermark.color};font-family:Georgia,serif;">${
          watermark.html
        }</p>`,
        color: '#2563eb',
        textType: 'notes',
      }),
      opacity: 0.9,
    })),
    createTextElement({
      left: 92,
      top: 154,
      width: 610,
      height: 132,
      html: `<p style="margin:0;font-size:${titleSize}px;line-height:${Math.round(
        titleSize * 1.14,
      )}px;color:#111827;font-weight:880;letter-spacing:0;">${escapeHtml(title)}</p>`,
      color: '#111827',
      textType: 'title',
    }),
    createTextElement({
      left: 94,
      top: 292,
      width: 590,
      height: 52,
      html: `<p style="margin:0;font-size:18px;line-height:27px;color:#475569;font-weight:520;">${escapeHtml(
        subtitle,
      )}</p>`,
      color: '#475569',
      textType: 'subtitle',
    }),
  );

  routeItems.forEach((item, index) => {
    const colors = [
      { accent: '#2563eb', fill: 'rgba(219,234,254,0.72)' },
      { accent: '#7c3aed', fill: 'rgba(237,233,254,0.72)' },
      { accent: '#16a34a', fill: 'rgba(220,252,231,0.72)' },
    ];
    const tone = colors[index % colors.length];
    const left = 92 + index * 196;
    elements.push(
      createRectShape({
        left,
        top: 392,
        width: 176,
        height: 62,
        fill: tone.fill,
        outlineColor: 'rgba(148,163,184,0.22)',
      }),
      createTextElement({
        left: left + 18,
        top: 406,
        width: 140,
        height: 36,
        html: `<p style="margin:0;font-size:15px;line-height:21px;color:${tone.accent};font-weight:780;">${escapeHtml(
          item,
        )}</p>`,
        color: tone.accent,
        textType: 'itemTitle',
      }),
    );
  });

  elements.push(
    createTextElement({
      left: 92,
      top: 494,
      width: 560,
      height: 26,
      html: `<p style="margin:0;font-size:12px;line-height:18px;color:#64748b;font-weight:620;">${escapeHtml(
        language === 'en-US' ? 'Concepts · Examples · Takeaways' : '概念梳理 · 例题走读 · 方法总结',
      )}</p>`,
      color: '#64748b',
      textType: 'footer',
    }),
  );

  return {
    elements,
    background: { type: 'solid', color: '#f8fbff' },
    theme,
    remark: title,
    syntaraMarkup: `\\begin{slide}[title={${escapeSyntaraOption(
      title,
    )}},template=cover_hero,density=light,profile=${outline.contentProfile || 'general'},language=${
      outline.language || 'zh-CN'
    }]\n\\end{slide}`,
  };
}
