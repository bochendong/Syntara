import { normalizeSceneOutlineContentProfile } from '@/lib/generation/content-profile';
import {
  createCircleShape,
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

function getPositiveTopicSignals(value: string): string {
  return value
    .replace(/不包含[:：][\s\S]*/g, ' ')
    .replace(/不包括[:：][\s\S]*/g, ' ')
    .replace(/\b(excluding|does not include|not included|do not include)\b[\s\S]*/gi, ' ')
    .trim();
}

function hasCongruenceTopic(value: string): boolean {
  return /同余|模运算|模\s*\d+|模数|余数|congruence|modular|modulo|mod\s+\d+/i.test(
    getPositiveTopicSignals(value),
  );
}

function hasProofMathTopic(value: string): boolean {
  return /mat|proof|证明|函数|映射|linear|algebra|calculus|math|同余|模运算|整除|线性|丢番图|素数|整数|数论|最大公约数|gcd|方程/.test(
    getPositiveTopicSignals(value),
  );
}

function hasGroupTheoryTopic(value: string): boolean {
  return /群论|群的|群公理|阿贝尔|对称群|二面体|子群|循环群|group theory|abelian|symmetric group|dihedral|subgroup|cyclic group/i.test(
    getPositiveTopicSignals(value),
  );
}

function hasCodeTopic(value: string): boolean {
  return /code|program|代码|程序|编程|python|javascript|typescript|数据结构/i.test(
    getPositiveTopicSignals(value),
  );
}

function inferTitleCoverContentProfile(value: string): NonNullable<SceneOutline['contentProfile']> {
  if (hasCodeTopic(value)) return 'code';
  if (hasCongruenceTopic(value) || hasProofMathTopic(value)) return 'math';
  return 'general';
}

function inferCoverSubtitle(args: {
  outline: SceneOutline;
  title: string;
  language: 'zh-CN' | 'en-US';
}): string {
  const topicText = `${args.title} ${args.outline.description || ''} ${
    args.outline.keyPoints?.join(' ') || ''
  }`;
  if (hasCongruenceTopic(topicText)) {
    return args.language === 'en-US'
      ? 'Understand congruence through remainders, modular rules, and proof-ready examples'
      : '从余数视角理解同余定义、模运算规则与证明中的可检验步骤';
  }
  if (hasGroupTheoryTopic(topicText)) {
    return args.language === 'en-US'
      ? 'Build the first language of abstract algebra through definitions, axioms, and examples'
      : '从群的定义、公理检验到典型例子，建立抽象代数的第一套语言';
  }

  const description = args.outline.description?.trim();
  if (description) return truncateCoverText(description, args.language === 'en-US' ? 78 : 42);

  const title = args.title.toLowerCase();
  if (hasProofMathTopic(title)) {
    return args.language === 'en-US'
      ? 'A proof-oriented path through concepts, examples, and precise notation'
      : '从概念框架、例题走读到证明语言的学习路径';
  }
  if (/code|program|代码|程序|编程|python|javascript|数据结构/.test(title)) {
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
  if (hasCongruenceTopic(args.title)) {
    return args.language === 'en-US'
      ? ['Congruence Definition', 'Modular Rules', 'Proof Examples']
      : ['同余定义', '模运算规则', '证明与例题'];
  }
  if (hasGroupTheoryTopic(args.title)) {
    return args.language === 'en-US'
      ? ['Group Axioms', 'Core Examples', 'Subgroups & Order']
      : ['群的定义', '典型例子', '子群与阶'];
  }
  if (hasProofMathTopic(title)) {
    return args.language === 'en-US'
      ? ['Concept Map', 'Worked Reasoning', 'Proof Language']
      : ['概念框架', '例题推导', '证明语言'];
  }
  if (/code|program|代码|程序|编程|python|javascript|数据结构/.test(title)) {
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
    .replace(
      /^(掌握|理解|明确|进入|学会|能够|学习主线|课程目标|学习目标|强调|重点|learn|understand|master|identify)\s*[：:，,、-]?\s*/i,
      '',
    )
    .trim();
  const clipped = normalized.split(/[。.!！?？；;]/)[0] || normalized;
  return truncateCoverText(clipped, language === 'en-US' ? 24 : 10);
}

function resolveCoverRouteItems(outline: SceneOutline, title: string): string[] {
  const language = outline.language || 'zh-CN';
  const topicText = `${title} ${outline.description || ''} ${(outline.keyPoints || []).join(' ')}`;
  if (hasCongruenceTopic(topicText)) {
    return fallbackCoverRouteItems({ title: topicText, language });
  }
  if (hasGroupTheoryTopic(topicText)) {
    return fallbackCoverRouteItems({ title: topicText, language });
  }

  const fromOutline = (outline.keyPoints || [])
    .map((item) => routeItemFromText(item, language))
    .filter(Boolean)
    .slice(0, 3);
  const fallback = fallbackCoverRouteItems({ title, language });
  return [...fromOutline, ...fallback].slice(0, 3);
}

function resolveCoverWatermarks(outline: SceneOutline, title: string) {
  const lowerTitle = title.toLowerCase();
  const topicText = `${title} ${outline.description || ''} ${(outline.keyPoints || []).join(' ')}`;
  if (hasCongruenceTopic(topicText)) {
    return [
      { html: 'a &equiv; b (mod n)', color: 'rgba(37,99,235,0.62)' },
      { html: 'a = b + kn', color: 'rgba(124,58,237,0.56)' },
      { html: '[a]<sub>n</sub>', color: 'rgba(22,163,74,0.56)' },
    ];
  }

  if (
    outline.contentProfile === 'code' ||
    /code|program|代码|程序|编程|python|javascript|数据结构/.test(lowerTitle)
  ) {
    return [
      { html: 'input &rarr; state', color: 'rgba(37,99,235,0.54)' },
      { html: 'if / then', color: 'rgba(124,58,237,0.5)' },
      { html: 'output()', color: 'rgba(22,163,74,0.5)' },
    ];
  }

  if (
    outline.contentProfile === 'math' ||
    /mat|proof|证明|函数|映射|linear|algebra|calculus|math/.test(lowerTitle)
  ) {
    return [
      { html: 'f: A &rarr; B', color: 'rgba(37,99,235,0.54)' },
      { html: '&forall;x &isin; A', color: 'rgba(124,58,237,0.5)' },
      { html: 'Im(f) &sube; B', color: 'rgba(22,163,74,0.5)' },
    ];
  }

  return [
    { html: 'concept', color: 'rgba(37,99,235,0.54)' },
    { html: 'method', color: 'rgba(124,58,237,0.5)' },
    { html: 'takeaway', color: 'rgba(22,163,74,0.5)' },
  ];
}

function buildCoverBackgroundDataUri(outline: SceneOutline, title: string): string {
  const topicText = `${title} ${outline.description || ''} ${(outline.keyPoints || []).join(' ')}`;
  const isCongruence = hasCongruenceTopic(topicText);
  const svg = isCongruence
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 562"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7fbff"/><stop offset=".54" stop-color="#eef6ff"/><stop offset="1" stop-color="#fffaf0"/></linearGradient><pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#dbeafe" stroke-width="1" opacity=".55"/></pattern><radialGradient id="ring" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffffff" stop-opacity=".94"/><stop offset=".64" stop-color="#dbeafe" stop-opacity=".52"/><stop offset="1" stop-color="#bfdbfe" stop-opacity=".08"/></radialGradient></defs><rect width="1000" height="562" fill="url(#bg)"/><rect width="1000" height="562" fill="url(#grid)" opacity=".42"/><circle cx="764" cy="278" r="168" fill="url(#ring)" stroke="#bfdbfe" stroke-width="2" opacity=".82"/><circle cx="764" cy="278" r="112" fill="none" stroke="#c4b5fd" stroke-width="2" stroke-dasharray="10 12" opacity=".68"/><circle cx="764" cy="278" r="52" fill="#ffffff" opacity=".68"/><path d="M764 110v56M764 390v56M596 278h56M876 278h56M645 159l40 40M843 357l40 40M883 159l-40 40M685 357l-40 40" stroke="#93c5fd" stroke-width="4" stroke-linecap="round" opacity=".48"/><path d="M0 0h1000v88H0z" fill="#eaf3ff" opacity=".64"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 562"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f8fbff"/><stop offset=".56" stop-color="#f4f7ff"/><stop offset="1" stop-color="#fffaf0"/></linearGradient><pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#e2e8f0" stroke-width="1" opacity=".55"/></pattern></defs><rect width="1000" height="562" fill="url(#bg)"/><rect width="1000" height="562" fill="url(#grid)" opacity=".34"/><circle cx="792" cy="264" r="180" fill="#dbeafe" opacity=".36"/><circle cx="865" cy="170" r="92" fill="#fef3c7" opacity=".42"/><path d="M0 0h1000v88H0z" fill="#eaf3ff" opacity=".58"/></svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function buildTitleCoverSlideContentFromParts(args: {
  title: string;
  description?: string;
  keyPoints?: string[];
  language?: 'zh-CN' | 'en-US';
  contentProfile?: SceneOutline['contentProfile'];
}): GeneratedSlideContent {
  const language = args.language || 'zh-CN';
  const topicText = `${args.title} ${args.description || ''} ${(args.keyPoints || []).join(' ')}`;
  return buildTitleCoverSlideContent({
    id: TITLE_COVER_OUTLINE_ID,
    type: 'slide',
    contentProfile: args.contentProfile || inferTitleCoverContentProfile(topicText),
    archetype: 'intro',
    layoutIntent: {
      layoutFamily: 'cover',
      layoutTemplate: 'cover_hero',
      disciplineStyle: 'general',
      teachingFlow: 'standalone',
      density: 'light',
      visualRole: 'none',
      overflowPolicy: 'compress_first',
      preserveFullProblemStatement: false,
    },
    title: args.title,
    description: args.description || '',
    keyPoints: args.keyPoints || [],
    teachingObjective: TITLE_COVER_MARKER,
    estimatedDuration: 20,
    order: 1,
    language,
  });
}

export function shouldUpgradeLegacyTitleCoverContent(args: {
  title: string;
  elements: Array<{ type?: string; content?: string }>;
}): boolean {
  const hasShapeElements = args.elements.some((element) => element.type === 'shape');
  const text = args.elements
    .filter((element) => element.type === 'text')
    .map((element) => element.content || '')
    .join(' ');
  const hasV7Marker = /syntara-cover-v7/.test(text);
  const hasModularLabel = /MODULAR ARITHMETIC/.test(text);
  const hasComputingLabel = /COMPUTING/.test(text);
  const hasGenericLabel = /学习笔记|LEARNING NOTEBOOK/.test(text);
  const hasMissingCoverShapes = /syntara-cover-v[2-7]/.test(text) && !hasShapeElements;
  const hasMisclassifiedModularCover = hasModularLabel && !hasCongruenceTopic(args.title);
  const hasMisclassifiedCodeCover = hasComputingLabel && !hasCodeTopic(args.title);
  const hasMisclassifiedGenericCover = hasGenericLabel && hasProofMathTopic(args.title);
  if (
    hasV7Marker &&
    !hasMissingCoverShapes &&
    !hasMisclassifiedModularCover &&
    !hasMisclassifiedCodeCover &&
    !hasMisclassifiedGenericCover
  ) {
    return false;
  }

  const hasLegacyProfileLabel = /MATHEMATICS|CODE NOTEBOOK|LEARNING NOTEBOOK/.test(text);
  const hasLegacyMathWatermark = /f:\s*A|Im\(f\)|&forall;|&sube;|a\s*&equiv;\s*b/.test(text);
  const hasLegacyCodeWatermark = /input\s*&rarr;\s*state|if\s*\/\s*then|output\(\)/.test(text);
  const hasLegacyGenericWatermark = />\s*(concept|method|takeaway)\s*</i.test(text);
  const hasLegacyCoverCopy = /学习主线：|课程目标包括|包含：同余定义/.test(text);

  return (
    hasMissingCoverShapes ||
    /syntara-cover-v6/.test(text) ||
    /syntara-cover-v5/.test(text) ||
    /syntara-cover-v4/.test(text) ||
    /syntara-cover-v3/.test(text) ||
    /syntara-cover-v2/.test(text) ||
    hasLegacyProfileLabel ||
    hasLegacyMathWatermark ||
    hasLegacyCodeWatermark ||
    hasLegacyGenericWatermark ||
    hasLegacyCoverCopy
  );
}

function buildModuloClockElements(): GeneratedSlideContent['elements'] {
  const centerX = 760;
  const centerY = 284;
  const radius = 146;
  const ticks = Array.from({ length: 7 }, (_, index) => {
    const angle = -Math.PI / 2 + (index / 7) * Math.PI * 2;
    return {
      value: String(index),
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    };
  });

  const elements: GeneratedSlideContent['elements'] = [
    createCircleShape({ left: 602, top: 126, size: 316, fill: 'rgba(219,234,254,0.78)' }),
    createCircleShape({ left: 640, top: 164, size: 240, fill: 'rgba(255,255,255,0.92)' }),
    createCircleShape({ left: 724, top: 248, size: 72, fill: 'rgba(37,99,235,0.1)' }),
    createLineElement({
      start: [centerX, centerY],
      end: [centerX + 102, centerY - 36],
      color: 'rgba(37,99,235,0.62)',
      width: 4,
    }),
    createLineElement({
      start: [centerX, centerY],
      end: [centerX - 54, centerY + 76],
      color: 'rgba(124,58,237,0.48)',
      width: 4,
    }),
    createTextElement({
      left: 690,
      top: 266,
      width: 140,
      height: 40,
      html: '<p style="margin:0;font-size:24px;line-height:34px;color:#1d4ed8;font-family:Georgia,serif;font-weight:800;text-align:center;">mod 7</p>',
      color: '#1d4ed8',
      textType: 'itemTitle',
    }),
  ];

  ticks.forEach((tick) => {
    elements.push(
      createCircleShape({
        left: tick.x - 22,
        top: tick.y - 22,
        size: 44,
        fill: 'rgba(255,255,255,0.95)',
      }),
      createTextElement({
        left: tick.x - 18,
        top: tick.y - 16,
        width: 36,
        height: 32,
        html: `<p style="margin:0;font-size:18px;line-height:24px;color:#334155;font-weight:800;text-align:center;">${tick.value}</p>`,
        color: '#334155',
        textType: 'itemTitle',
      }),
    );
  });

  return elements;
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
  const topicText = `${title} ${outline.description || ''} ${(outline.keyPoints || []).join(' ')}`;
  const isCongruenceCover = hasCongruenceTopic(topicText);
  const watermarks =
    !isCongruenceCover && outline.contentProfile === 'code'
      ? resolveCoverWatermarks(outline, title)
      : [];
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
      height: 88,
      fill: '#e6f0ff',
    }),
    createRectShape({
      left: 0,
      top: 456,
      width: 1000,
      height: 106,
      fill: 'rgba(229,240,255,0.82)',
    }),
    createCircleShape({
      left: -96,
      top: 342,
      size: 270,
      fill: 'rgba(191,219,254,0.42)',
    }),
    createCircleShape({
      left: 482,
      top: -94,
      size: 270,
      fill: 'rgba(254,243,199,0.48)',
    }),
  ];

  if (isCongruenceCover) {
    elements.push(...buildModuloClockElements());
  } else if (watermarks.length > 0) {
    elements.push(
      createRectShape({
        left: 724,
        top: 112,
        width: 188,
        height: 328,
        fill: 'rgba(255,255,255,0.82)',
        outlineColor: 'rgba(96,115,145,0.24)',
      }),
    );
    for (let i = 0; i < 6; i += 1) {
      elements.push(
        createLineElement({
          start: [744, 146 + i * 44],
          end: [888, 146 + i * 44],
          color: 'rgba(148,163,184,0.18)',
          width: 1,
        }),
      );
    }
  }

  elements.push(
    createTextElement({
      left: 92,
      top: 54,
      width: 320,
      height: 42,
      html: `<p style="margin:0;font-size:14px;line-height:22px;letter-spacing:3px;color:#2563eb;font-weight:850;">${escapeHtml(
        isCongruenceCover ? 'MODULAR ARITHMETIC' : profileLabel,
      )}</p>`,
      color: '#2563eb',
      textType: 'header',
    }),
    {
      ...createTextElement({
        left: 0,
        top: 0,
        width: 1,
        height: 1,
        html: '<p>syntara-cover-v7</p>',
        color: '#ffffff',
        textType: 'footer',
      }),
      opacity: 0,
    },
    createTextElement({
      left: 92,
      top: 154,
      width: 540,
      height: 136,
      html: `<p style="margin:0;font-size:${titleSize}px;line-height:${Math.round(
        titleSize * 1.12,
      )}px;color:#111827;font-weight:880;letter-spacing:0;">${escapeHtml(title)}</p>`,
      color: '#111827',
      textType: 'title',
    }),
    createTextElement({
      left: 94,
      top: 314,
      width: isCongruenceCover ? 360 : 520,
      height: 72,
      html: `<p style="margin:0;font-size:18px;line-height:27px;color:#475569;font-weight:520;">${escapeHtml(
        subtitle,
      )}</p>`,
      color: '#475569',
      textType: 'subtitle',
    }),
  );

  if (!isCongruenceCover) {
    elements.push(
      ...watermarks.map((watermark, index) => ({
        ...createTextElement({
          left: 760,
          top: 120 + index * 90,
          width: 154,
          height: 64,
          html: `<p style="margin:0;font-size:${
            index === 0 ? 22 : 21
          }px;line-height:28px;color:${watermark.color};font-family:Georgia,serif;font-weight:700;">${
            watermark.html
          }</p>`,
          color: '#2563eb',
          textType: 'notes',
          fill: 'rgba(255,255,255,0.76)',
          outlineColor: 'rgba(96,115,145,0.18)',
        }),
        opacity: 0.9,
      })),
    );
  }

  routeItems.forEach((item, index) => {
    const colors = [
      { accent: '#1d4ed8', fill: 'rgba(219,234,254,0.88)' },
      { accent: '#6d28d9', fill: 'rgba(237,233,254,0.88)' },
      { accent: '#15803d', fill: 'rgba(220,252,231,0.88)' },
    ];
    const tone = colors[index % colors.length];
    const left = 92 + index * 180;
    elements.push(
      createRectShape({
        left,
        top: 414,
        width: 160,
        height: 56,
        fill: tone.fill,
        outlineColor: 'rgba(96,115,145,0.26)',
      }),
      createTextElement({
        left,
        top: 429,
        width: 160,
        height: 28,
        html: `<p style="margin:0;font-size:15px;line-height:22px;color:${tone.accent};font-weight:850;text-align:center;">${escapeHtml(
          item,
        )}</p>`,
        color: tone.accent,
        textType: 'itemTitle',
      }),
    );
  });

  return {
    elements,
    background: {
      type: 'image',
      image: {
        src: buildCoverBackgroundDataUri(outline, title),
        size: 'cover',
      },
    },
    theme,
    remark: title,
    syntaraMarkup: `\\begin{slide}[title={${escapeSyntaraOption(
      title,
    )}},template=cover_hero,density=light,profile=${outline.contentProfile || 'general'},language=${
      outline.language || 'zh-CN'
    }]\n\\end{slide}`,
  };
}
