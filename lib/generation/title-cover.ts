import { normalizeSceneOutlineContentProfile } from '@/lib/generation/content-profile';
import {
  createCircleShape,
  createLineElement,
  createTextElement,
} from '@/lib/notebook-content/slide-element-factory';
import { escapeHtml } from '@/lib/notebook-content/inline-html';
import { nanoid } from 'nanoid';
import type { Action } from '@/lib/types/action';
import type { GeneratedSlideContent, SceneOutline } from '@/lib/types/generation';
import type { PPTElement, SlideTheme } from '@/lib/types/slides';

export const TITLE_COVER_OUTLINE_ID = 'scene_title_cover';

const TITLE_COVER_MARKER = 'syntara:title-only-cover';
const TITLE_COVER_VERSION_MARKER = 'syntara-cover-v12';
const LEGACY_TITLE_COVER_VERSION_RE = /syntara-cover-v(?:[2-9]|10|11)/;
const TITLE_COVER_OPENING_ACTION_MARKER = 'syntara-title-cover-opening-v2';

function splitCoverTitleLines(title: string, language: 'zh-CN' | 'en-US'): string[] {
  const normalized = title.replace(/\s+/g, ' ').trim();
  const colonMatch = normalized.match(/^(.{2,18}[：:])\s*(.{2,})$/);
  if (colonMatch) return [colonMatch[1], colonMatch[2]];

  const compactLength = normalized.replace(/\s+/g, '').length;
  const targetLength = language === 'en-US' ? 26 : 14;
  if (compactLength <= targetLength) return [normalized];

  const punctuation = language === 'en-US' ? /[,;/-]/g : /[，、；：:]/g;
  const candidates = [...normalized.matchAll(punctuation)]
    .map((match) => match.index ?? -1)
    .filter((index) => index >= Math.floor(normalized.length * 0.35))
    .filter((index) => index <= Math.ceil(normalized.length * 0.68));
  const spaceIndex = normalized.lastIndexOf(' ', Math.ceil(normalized.length * 0.62));
  const splitIndex =
    candidates[0] ?? (spaceIndex > 3 ? spaceIndex : Math.ceil(normalized.length * 0.55));

  if (splitIndex > 3 && splitIndex < normalized.length - 3) {
    return [
      normalized.slice(0, splitIndex + 1).trim(),
      normalized.slice(splitIndex + 1).trim(),
    ].filter(Boolean);
  }

  return [normalized];
}

function getTitleSize(lines: string[]): number {
  const maxLineLength = Math.max(...lines.map((line) => line.replace(/\s+/g, '').length));
  const totalLength = lines.join('').replace(/\s+/g, '').length;
  if (lines.length > 2 || totalLength > 44 || maxLineLength > 28) return 34;
  if (totalLength > 34 || maxLineLength > 22) return 38;
  if (totalLength > 26 || maxLineLength > 16) return 44;
  if (totalLength > 18 || maxLineLength > 11) return 50;
  return 56;
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

function hasPhilosophyTopic(value: string): boolean {
  return /哲学|思想|存在主义|荒诞|反抗|辩证|精神现象学|承认|自由|加缪|黑格尔|苏格拉底|柏拉图|亚里士多德|康德|尼采|philosophy|camus|hegel|absurd|existential|dialectic/i.test(
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
      ? 'How can a remainder become a reliable structure for reasoning?'
      : '一个余数，怎样变成可以推理的结构？';
  }
  if (hasGroupTheoryTopic(topicText)) {
    return args.language === 'en-US'
      ? 'Start with one operation, then watch a whole abstract language appear'
      : '从一个运算开始，看抽象结构怎样被定义出来。';
  }
  if (hasPhilosophyTopic(topicText)) {
    if (/萨特|存在主义|存在先于本质|自由|自欺|sartre|existential/i.test(topicText)) {
      return args.language === 'en-US'
        ? 'When you say “I had no choice,” Sartre asks whether that is a fact or a decision'
        : '当你说“我没办法”时，萨特会追问：这真的是事实，还是一次选择？';
    }
    if (/加缪|荒诞|camus|absurd/i.test(topicText)) {
      return args.language === 'en-US'
        ? 'If the world stays silent, what kind of lucidity is still possible?'
        : '当世界保持沉默，人还能怎样清醒地生活？';
    }
    if (/黑格尔|辩证|精神现象学|承认|hegel|dialectic/i.test(topicText)) {
      return args.language === 'en-US'
        ? 'Contradiction is not where thinking fails; it is where thinking begins to move'
        : '矛盾不是思想失败的地方，而是思想开始运动的地方。';
    }
    return args.language === 'en-US'
      ? 'Let one lived tension open the door before the concepts arrive'
      : '先让一个真实困惑站到面前，再让概念慢慢照亮它。';
  }

  const description = args.outline.description?.trim();
  if (description) return truncateCoverText(description, args.language === 'en-US' ? 78 : 42);

  const title = args.title.toLowerCase();
  if (hasProofMathTopic(title)) {
    return args.language === 'en-US'
      ? 'Find the structure first; the formal steps will become less mysterious'
      : '先看见结构，再让后面的推导变得可验证、可复述。';
  }
  if (/code|program|代码|程序|编程|python|javascript|数据结构/.test(title)) {
    return args.language === 'en-US'
      ? 'Before the implementation, notice the hidden state change'
      : '先看见那个隐藏的状态变化，再进入实现细节。';
  }
  return args.language === 'en-US'
    ? 'Start with the one doorway that makes the whole notebook worth opening'
    : '先抓住那个让整本笔记值得打开的入口。';
}

function resolveCoverHeroPhrase(
  outline: SceneOutline,
  title: string,
  language: 'zh-CN' | 'en-US',
): string {
  const topicText = `${title} ${outline.description || ''} ${(outline.keyPoints || []).join(' ')}`;
  if (/萨特|存在主义|存在先于本质|自由|自欺|sartre|existential/i.test(topicText)) {
    return language === 'en-US' ? 'EXISTENCE BEFORE ESSENCE' : '存在先于本质';
  }
  if (/加缪|荒诞|camus|absurd/i.test(topicText)) {
    return language === 'en-US' ? 'LIVE AFTER THE ABSURD' : '荒诞之后，仍然生活';
  }
  if (/黑格尔|辩证|精神现象学|承认|hegel|dialectic/i.test(topicText)) {
    return language === 'en-US' ? 'THINKING MOVES' : '矛盾使思想前进';
  }
  if (hasPhilosophyTopic(topicText)) {
    return language === 'en-US' ? 'BRING IDEAS BACK TO LIFE' : '把思想带回生活';
  }
  if (hasCodeTopic(topicText)) {
    return language === 'en-US' ? 'MAKE IDEAS RUN' : '让想法运行';
  }
  if (hasCongruenceTopic(topicText) || hasProofMathTopic(topicText)) {
    return language === 'en-US' ? 'SEE THE STRUCTURE' : '看见结构';
  }
  return language === 'en-US' ? 'BEGIN HERE' : '从这里开始';
}

function splitCoverHeroPhraseLines(phrase: string, language: 'zh-CN' | 'en-US'): string {
  const normalized = phrase.replace(/\s+/g, ' ').trim();
  if (language === 'en-US') {
    const words = normalized.split(' ');
    if (words.length <= 2) return escapeHtml(normalized);
    const splitAt = Math.ceil(words.length / 2);
    return `${escapeHtml(words.slice(0, splitAt).join(' '))}<br/>${escapeHtml(
      words.slice(splitAt).join(' '),
    )}`;
  }

  const punctuationSplit = normalized.split(/[，,；;]/).filter(Boolean);
  if (punctuationSplit.length >= 2) {
    return punctuationSplit.slice(0, 2).map(escapeHtml).join('<br/>');
  }
  if (normalized.length > 8) {
    const splitAt = Math.ceil(normalized.length / 2);
    return `${escapeHtml(normalized.slice(0, splitAt))}<br/>${escapeHtml(
      normalized.slice(splitAt),
    )}`;
  }
  return escapeHtml(normalized);
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
  if (/加缪|荒诞|camus|absurd/i.test(args.title)) {
    return args.language === 'en-US'
      ? ['Absurdity', 'Lucid Attention', 'Revolt']
      : ['荒诞处境', '清醒选择', '反抗实践'];
  }
  if (/黑格尔|辩证|精神现象学|承认|hegel|dialectic/i.test(args.title)) {
    return args.language === 'en-US'
      ? ['Contradiction', 'Negation', 'Recognition']
      : ['矛盾运动', '否定路径', '承认与自由'];
  }
  if (hasPhilosophyTopic(args.title)) {
    return args.language === 'en-US'
      ? ['Core Tension', 'Concept Entry', 'Lived Judgment']
      : ['核心张力', '概念入口', '生活判断'];
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

function resolveCoverPalette(outline: SceneOutline, title: string) {
  const topicText = `${title} ${outline.description || ''} ${(outline.keyPoints || []).join(' ')}`;
  if (hasCodeTopic(topicText)) {
    return {
      accent: '#38bdf8',
      accentDark: '#0369a1',
      route: ['#38bdf8', '#a78bfa', '#34d399'],
    };
  }
  if (hasCongruenceTopic(topicText) || hasProofMathTopic(topicText)) {
    return {
      accent: '#2563eb',
      accentDark: '#1d4ed8',
      route: ['#60a5fa', '#a78bfa', '#34d399'],
    };
  }
  if (hasPhilosophyTopic(topicText)) {
    return {
      accent: '#d6a84f',
      accentDark: '#9a6a16',
      route: ['#d6a84f', '#60a5fa', '#2f8065'],
    };
  }
  return {
    accent: '#d6a84f',
    accentDark: '#9a6a16',
    route: ['#d6a84f', '#60a5fa', '#2f8065'],
  };
}

function resolveCoverProfileLabel(
  outline: SceneOutline,
  title: string,
  language: 'zh-CN' | 'en-US',
): string {
  const topicText = `${title} ${outline.description || ''} ${(outline.keyPoints || []).join(' ')}`;
  const suffix = language === 'en-US' ? 'NOTEBOOK' : '自学笔记';
  if (hasCodeTopic(topicText)) return `COMPUTING / ${suffix}`;
  if (hasCongruenceTopic(topicText) || hasProofMathTopic(topicText))
    return `MATHEMATICS / ${suffix}`;
  if (hasPhilosophyTopic(topicText)) return `PHILOSOPHY / ${suffix}`;
  return language === 'en-US' ? 'SELF-STUDY NOTEBOOK' : '自学课程 / 笔记';
}

function resolveOpeningRouteItems(args: {
  title: string;
  keyPoints?: string[];
  language: 'zh-CN' | 'en-US';
}): string[] {
  const fromKeyPoints = (args.keyPoints || [])
    .map((item) => routeItemFromText(item, args.language))
    .filter(Boolean)
    .slice(0, 3);
  const fallback = fallbackCoverRouteItems({ title: args.title, language: args.language });
  return [...fromKeyPoints, ...fallback].slice(0, 3);
}

function joinRouteItems(items: string[], language: 'zh-CN' | 'en-US'): string {
  if (items.length === 0) return language === 'en-US' ? 'the main route' : '主线';
  if (language === 'en-US') {
    if (items.length === 1) return items[0];
    return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
  }
  return items.join('、');
}

function buildTitleCoverOpeningSpeech(args: {
  title: string;
  description?: string;
  keyPoints?: string[];
  language: 'zh-CN' | 'en-US';
}): string {
  const routeItems = resolveOpeningRouteItems(args);
  const routeText = joinRouteItems(routeItems, args.language);
  const topicText = `${args.title} ${args.description || ''} ${(args.keyPoints || []).join(' ')}`;

  if (args.language === 'en-US') {
    if (hasPhilosophyTopic(topicText)) {
      return `This opening page is here to create an entrance, not to summarize everything. We will later move through ${routeText}. For now, hold onto the tension: why does this idea feel like it is already touching ordinary life?`;
    }
    if (hasProofMathTopic(topicText) || hasCodeTopic(topicText)) {
      return `This opening page is here to create an entrance. We will later move through ${routeText}. First notice the central structure, then let the following pages make each step precise and usable.`;
    }
    return `This opening page is here to create an entrance for ${args.title}. We will later move through ${routeText}. Start with the reason the topic matters, then let the following pages unfold the details.`;
  }

  if (hasPhilosophyTopic(topicText)) {
    return `这一页不再做路线图，只负责把入口打开。后面会逐步展开${routeText}，但现在先抓住那个刺人的张力：这个思想为什么会碰到我们的日常生活。`;
  }
  if (hasProofMathTopic(topicText) || hasCodeTopic(topicText)) {
    return `这一页不急着铺开路线，只负责把入口打开。后面会逐步展开${routeText}，但现在先看见核心结构，再到后面的页面里把每一步变成可验证、可复述的方法。`;
  }
  return `这一页先为《${args.title}》打开入口。后面会逐步展开${routeText}，但现在先抓住它为什么值得学，细节会在后面的页面慢慢展开。`;
}

export function hasTitleCoverVersionMarker(
  elements: Array<{ type?: string; content?: string }>,
): boolean {
  return elements.some(
    (element) => element.type === 'text' && /syntara-cover-v\d+/.test(element.content || ''),
  );
}

export function hasTitleCoverOpeningAction(
  actions: Array<{ type?: string; description?: string }> | undefined,
): boolean {
  return Boolean(
    actions?.some(
      (action) =>
        action.type === 'speech' && action.description === TITLE_COVER_OPENING_ACTION_MARKER,
    ),
  );
}

export function buildTitleCoverOpeningActions(args: {
  title: string;
  description?: string;
  keyPoints?: string[];
  language?: 'zh-CN' | 'en-US';
  elements?: PPTElement[];
}): Action[] {
  const language = args.language || 'zh-CN';
  const titleTarget =
    args.elements?.find((element) => element.type === 'text' && element.textType === 'title')?.id ||
    args.elements?.find((element) => element.type === 'text')?.id;
  const actions: Action[] = [];

  if (titleTarget) {
    actions.push({
      id: `action_${nanoid(8)}`,
      type: 'spotlight',
      title: language === 'zh-CN' ? '聚焦标题页入口' : 'Focus title entrance',
      elementId: titleTarget,
      dimOpacity: 0.42,
    });
  }

  actions.push({
    id: `action_${nanoid(8)}`,
    type: 'speech',
    title: language === 'zh-CN' ? '标题页开场' : 'Title page opening',
    description: TITLE_COVER_OPENING_ACTION_MARKER,
    text: buildTitleCoverOpeningSpeech({
      title: args.title,
      description: args.description,
      keyPoints: args.keyPoints,
      language,
    }),
  });

  return actions;
}

function buildCoverBackgroundDataUri(outline: SceneOutline, title: string): string {
  const topicText = `${title} ${outline.description || ''} ${(outline.keyPoints || []).join(' ')}`;
  const palette = resolveCoverPalette(outline, title);
  const isTechnical =
    hasCodeTopic(topicText) || hasCongruenceTopic(topicText) || hasProofMathTopic(topicText);
  const softAccent = isTechnical ? '#dbeafe' : '#f7d98b';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 562"><defs><linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbfaf6"/><stop offset=".48" stop-color="#f3efe6"/><stop offset="1" stop-color="#e8f2ef"/></linearGradient><linearGradient id="ink" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1f2937"/><stop offset=".58" stop-color="#111827"/><stop offset="1" stop-color="#030712"/></linearGradient><radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${palette.accent}" stop-opacity=".34"/><stop offset=".7" stop-color="${palette.accent}" stop-opacity=".08"/><stop offset="1" stop-color="${palette.accent}" stop-opacity="0"/></radialGradient><pattern id="paperGrid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M34 0H0V34" fill="none" stroke="#64748b" stroke-width="1" opacity=".1"/></pattern><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 .065"/></feComponentTransfer></filter></defs><rect width="1000" height="562" fill="url(#paper)"/><rect width="1000" height="562" fill="url(#paperGrid)"/><circle cx="200" cy="430" r="230" fill="${softAccent}" opacity=".16"/><circle cx="602" cy="120" r="148" fill="${palette.accent}" opacity=".12"/><path d="M666 0H1000V562H718L640 344L694 184Z" fill="url(#ink)"/><path d="M640 0H720L654 562H574Z" fill="${palette.accent}" opacity=".18"/><circle cx="812" cy="252" r="178" fill="url(#glow)"/><path d="M0 502C156 464 292 482 426 516C548 548 664 530 760 492C864 452 934 456 1000 486V562H0Z" fill="#ffffff" opacity=".42"/><rect width="1000" height="562" filter="url(#grain)" opacity=".35"/></svg>`;

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
  const hasCurrentMarker = new RegExp(TITLE_COVER_VERSION_MARKER).test(text);
  const hasModularLabel = /MODULAR ARITHMETIC/.test(text);
  const hasComputingLabel = /COMPUTING/.test(text);
  const hasGenericLabel = /学习笔记|LEARNING NOTEBOOK/.test(text);
  const hasMissingCoverShapes = LEGACY_TITLE_COVER_VERSION_RE.test(text) && !hasShapeElements;
  const hasMisclassifiedModularCover = hasModularLabel && !hasCongruenceTopic(args.title);
  const hasMisclassifiedCodeCover = hasComputingLabel && !hasCodeTopic(args.title);
  const hasMisclassifiedGenericCover = hasGenericLabel && hasProofMathTopic(args.title);
  if (
    hasCurrentMarker &&
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
  const hasLegacyCoverCopy =
    /学习主线：|课程目标包括|包含：同余定义|阅读路线|自学地图|READING ROUTE|Self-study map/.test(
      text,
    );

  return (
    hasMissingCoverShapes ||
    LEGACY_TITLE_COVER_VERSION_RE.test(text) ||
    hasLegacyProfileLabel ||
    hasLegacyMathWatermark ||
    hasLegacyCodeWatermark ||
    hasLegacyGenericWatermark ||
    hasLegacyCoverCopy
  );
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
  const titleLines = splitCoverTitleLines(title, language);
  const titleSize = getTitleSize(titleLines);
  const titleLineHeight = Math.round(titleSize * 1.12);
  const titleHtml = titleLines.map((line) => escapeHtml(line)).join('<br/>');
  const subtitle = inferCoverSubtitle({ outline, title, language });
  const palette = resolveCoverPalette(outline, title);
  const profileLabel = resolveCoverProfileLabel(outline, title, language);
  const heroPhrase = splitCoverHeroPhraseLines(
    resolveCoverHeroPhrase(outline, title, language),
    language,
  );
  const theme: SlideTheme = {
    backgroundColor: '#f4f0e7',
    themeColors: ['#111827', palette.accent, '#60a5fa', '#2f8065', '#f8fafc'],
    fontColor: '#182033',
    fontName: 'Microsoft YaHei',
  };
  const elements: GeneratedSlideContent['elements'] = [
    {
      ...createTextElement({
        left: 0,
        top: 0,
        width: 1,
        height: 1,
        html: `<p>${TITLE_COVER_VERSION_MARKER}</p>`,
        color: '#ffffff',
        textType: 'footer',
      }),
      opacity: 0,
    },
    createCircleShape({
      left: 48,
      top: 84,
      size: 112,
      fill: 'rgba(255,255,255,0.42)',
    }),
    createLineElement({
      start: [78, 92],
      end: [78, 454],
      color: palette.accent,
      width: 5,
    }),
    createTextElement({
      left: 106,
      top: 78,
      width: 440,
      height: 34,
      html: `<p style="margin:0;font-size:13px;line-height:22px;letter-spacing:2px;color:${palette.accentDark};font-weight:850;">${escapeHtml(
        profileLabel,
      )}</p>`,
      color: palette.accentDark,
      textType: 'header',
    }),
    createTextElement({
      left: 106,
      top: 154,
      width: 560,
      height: 184,
      html: `<p style="margin:0;font-size:${titleSize}px;line-height:${titleLineHeight}px;color:#111827;font-weight:900;letter-spacing:0;">${titleHtml}</p>`,
      color: '#111827',
      textType: 'title',
    }),
    createLineElement({
      start: [108, 330],
      end: [188, 330],
      color: palette.accent,
      width: 4,
    }),
    createTextElement({
      left: 108,
      top: 360,
      width: 520,
      height: 96,
      html: `<p style="margin:0;font-size:21px;line-height:34px;color:#334155;font-weight:640;">${escapeHtml(
        subtitle,
      )}</p>`,
      color: '#334155',
      textType: 'subtitle',
    }),
    createTextElement({
      left: 692,
      top: 160,
      width: 270,
      height: 176,
      html: `<p style="margin:0;font-size:32px;line-height:43px;color:#f8fafc;font-weight:900;letter-spacing:0;">${heroPhrase}</p>`,
      color: '#f8fafc',
      textType: 'itemTitle',
    }),
    createLineElement({
      start: [712, 350],
      end: [890, 350],
      color: 'rgba(248,250,252,0.26)',
      width: 2,
    }),
    createLineElement({
      start: [712, 364],
      end: [800, 364],
      color: palette.accent,
      width: 5,
    }),
  ];

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
