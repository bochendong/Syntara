import type { SlideBackground } from '@/lib/types/slides';

export type SlideBackgroundStyleId =
  | 'academy-watercolor'
  | 'sci-fi-data-cockpit'
  | 'deep-space-astronomy'
  | 'nature-field-notebook'
  | 'dark-tech-neural'
  | 'historical-manuscript'
  | 'magazine-courtyard'
  | 'cinematic-stage'
  | 'product-launch-dark'
  | 'academic-blueprint'
  | 'lecture-hall'
  | 'workspace-desk'
  | 'science-lab'
  | 'city-strategy'
  | 'forest-path';

export type SlideBackgroundStyleOption = {
  id: SlideBackgroundStyleId;
  label: string;
  description: string;
  src: string;
  tone: 'light' | 'dark';
  theme: SlideBackgroundThemeTokens;
};

export type SlideBackgroundThemeTokens = {
  fallbackFill: string;
  titleText: string;
  bodyText: string;
  mutedText: string;
  footerText: string;
  accent: string;
  accentSecondary: string;
  divider: string;
  badgeFill: string;
  badgeText: string;
  panelFill: string;
  panelText: string;
  panelBorder: string;
  overlayFill: string;
  leftShadeFill?: string;
  shadow: string;
};

export const SLIDE_BACKGROUND_THEME_TOKENS: Record<
  SlideBackgroundStyleId,
  SlideBackgroundThemeTokens
> = {
  'academy-watercolor': {
    fallbackFill: '#f7f2ff',
    titleText: '#182033',
    bodyText: '#334155',
    mutedText: '#64748b',
    footerText: 'rgba(24,32,51,.62)',
    accent: '#4b72e8',
    accentSecondary: '#8a6fe8',
    divider: 'rgba(75,114,232,.72)',
    badgeFill: 'rgba(75,114,232,.86)',
    badgeText: '#ffffff',
    panelFill: 'rgba(255,253,248,.86)',
    panelText: '#182033',
    panelBorder: 'rgba(119,148,191,.32)',
    overlayFill: 'rgba(255,255,255,.34)',
    leftShadeFill: 'rgba(255,255,255,.42)',
    shadow: 'rgba(106,84,45,.13)',
  },
  'sci-fi-data-cockpit': {
    fallbackFill: '#eaf7ff',
    titleText: '#102033',
    bodyText: '#334155',
    mutedText: '#64748b',
    footerText: 'rgba(15,23,42,.58)',
    accent: '#0284c7',
    accentSecondary: '#14b8a6',
    divider: 'rgba(2,132,199,.72)',
    badgeFill: 'rgba(2,132,199,.86)',
    badgeText: '#ffffff',
    panelFill: 'rgba(245,251,255,.82)',
    panelText: '#102033',
    panelBorder: 'rgba(14,165,233,.28)',
    overlayFill: 'rgba(238,250,255,.28)',
    leftShadeFill: 'rgba(255,255,255,.38)',
    shadow: 'rgba(8,47,73,.14)',
  },
  'deep-space-astronomy': {
    fallbackFill: '#101827',
    titleText: '#f8fafc',
    bodyText: 'rgba(226,232,240,.86)',
    mutedText: 'rgba(203,213,225,.68)',
    footerText: 'rgba(226,232,240,.62)',
    accent: '#fbbf24',
    accentSecondary: '#60a5fa',
    divider: 'rgba(251,191,36,.72)',
    badgeFill: 'rgba(96,165,250,.82)',
    badgeText: '#ffffff',
    panelFill: 'rgba(15,23,42,.62)',
    panelText: '#f8fafc',
    panelBorder: 'rgba(148,163,184,.32)',
    overlayFill: 'rgba(8,13,28,.38)',
    leftShadeFill: 'rgba(2,6,23,.42)',
    shadow: 'rgba(2,6,23,.36)',
  },
  'nature-field-notebook': {
    fallbackFill: '#eff7ec',
    titleText: '#153c2b',
    bodyText: '#365142',
    mutedText: '#63766a',
    footerText: 'rgba(21,60,43,.58)',
    accent: '#2f855a',
    accentSecondary: '#b7791f',
    divider: 'rgba(47,133,90,.68)',
    badgeFill: 'rgba(47,133,90,.84)',
    badgeText: '#ffffff',
    panelFill: 'rgba(255,253,244,.84)',
    panelText: '#153c2b',
    panelBorder: 'rgba(83,121,91,.3)',
    overlayFill: 'rgba(250,255,244,.28)',
    leftShadeFill: 'rgba(255,255,246,.36)',
    shadow: 'rgba(43,74,47,.15)',
  },
  'dark-tech-neural': {
    fallbackFill: '#07111f',
    titleText: '#f8fafc',
    bodyText: 'rgba(226,232,240,.86)',
    mutedText: 'rgba(148,163,184,.72)',
    footerText: 'rgba(226,232,240,.6)',
    accent: '#22d3ee',
    accentSecondary: '#a78bfa',
    divider: 'rgba(34,211,238,.72)',
    badgeFill: 'rgba(34,211,238,.18)',
    badgeText: '#cffafe',
    panelFill: 'rgba(15,23,42,.66)',
    panelText: '#f8fafc',
    panelBorder: 'rgba(34,211,238,.28)',
    overlayFill: 'rgba(2,6,23,.54)',
    leftShadeFill: 'rgba(2,6,23,.5)',
    shadow: 'rgba(0,0,0,.42)',
  },
  'historical-manuscript': {
    fallbackFill: '#f4ead8',
    titleText: '#33251c',
    bodyText: '#5a4636',
    mutedText: '#826f5e',
    footerText: 'rgba(51,37,28,.58)',
    accent: '#b45309',
    accentSecondary: '#7c2d12',
    divider: 'rgba(180,83,9,.7)',
    badgeFill: 'rgba(124,45,18,.84)',
    badgeText: '#fff7ed',
    panelFill: 'rgba(255,248,235,.82)',
    panelText: '#33251c',
    panelBorder: 'rgba(146,91,42,.3)',
    overlayFill: 'rgba(255,248,235,.34)',
    leftShadeFill: 'rgba(255,246,226,.42)',
    shadow: 'rgba(86,54,24,.17)',
  },
  'magazine-courtyard': {
    fallbackFill: '#102a26',
    titleText: '#ffffff',
    bodyText: 'rgba(248,250,252,.86)',
    mutedText: 'rgba(226,232,240,.72)',
    footerText: 'rgba(248,250,252,.68)',
    accent: '#e85c3a',
    accentSecondary: '#f3b15f',
    divider: 'rgba(232,92,58,.92)',
    badgeFill: 'rgba(232,92,58,.86)',
    badgeText: '#ffffff',
    panelFill: 'rgba(255,255,255,.78)',
    panelText: '#17251f',
    panelBorder: 'rgba(255,255,255,.3)',
    overlayFill: 'rgba(4,18,16,.26)',
    leftShadeFill: 'rgba(2,12,10,.28)',
    shadow: 'rgba(0,0,0,.26)',
  },
  'cinematic-stage': {
    fallbackFill: '#130d23',
    titleText: '#d6a84f',
    bodyText: 'rgba(248,250,252,.84)',
    mutedText: 'rgba(203,213,225,.7)',
    footerText: 'rgba(248,250,252,.62)',
    accent: '#d6a84f',
    accentSecondary: '#b91c1c',
    divider: 'rgba(214,168,79,.62)',
    badgeFill: 'rgba(214,168,79,.18)',
    badgeText: '#fef3c7',
    panelFill: 'rgba(14,12,28,.68)',
    panelText: '#f8fafc',
    panelBorder: 'rgba(214,168,79,.34)',
    overlayFill: 'rgba(5,5,15,.58)',
    leftShadeFill: 'rgba(5,5,15,.16)',
    shadow: 'rgba(0,0,0,.42)',
  },
  'product-launch-dark': {
    fallbackFill: '#080a12',
    titleText: '#ffffff',
    bodyText: 'rgba(248,250,252,.84)',
    mutedText: 'rgba(203,213,225,.66)',
    footerText: 'rgba(248,250,252,.58)',
    accent: '#f97316',
    accentSecondary: '#38bdf8',
    divider: 'rgba(249,115,22,.72)',
    badgeFill: 'rgba(249,115,22,.88)',
    badgeText: '#ffffff',
    panelFill: 'rgba(15,23,42,.66)',
    panelText: '#f8fafc',
    panelBorder: 'rgba(249,115,22,.32)',
    overlayFill: 'rgba(4,10,28,.44)',
    leftShadeFill: 'rgba(2,6,23,.3)',
    shadow: 'rgba(0,0,0,.42)',
  },
  'academic-blueprint': {
    fallbackFill: '#eef5ff',
    titleText: '#17365d',
    bodyText: '#38516f',
    mutedText: '#64748b',
    footerText: 'rgba(23,54,93,.58)',
    accent: '#2563eb',
    accentSecondary: '#0f766e',
    divider: 'rgba(37,99,235,.72)',
    badgeFill: 'rgba(37,99,235,.86)',
    badgeText: '#ffffff',
    panelFill: 'rgba(248,251,255,.84)',
    panelText: '#17365d',
    panelBorder: 'rgba(37,99,235,.24)',
    overlayFill: 'rgba(248,251,255,.34)',
    leftShadeFill: 'rgba(255,255,255,.42)',
    shadow: 'rgba(23,54,93,.14)',
  },
  'lecture-hall': {
    fallbackFill: '#f2dfc3',
    titleText: '#14213d',
    bodyText: '#30415f',
    mutedText: '#6b7280',
    footerText: 'rgba(20,33,61,.58)',
    accent: '#d65a31',
    accentSecondary: '#2f5f8f',
    divider: 'rgba(214,90,49,.78)',
    badgeFill: 'rgba(214,90,49,.88)',
    badgeText: '#ffffff',
    panelFill: 'rgba(255,250,242,.82)',
    panelText: '#14213d',
    panelBorder: 'rgba(143,104,62,.26)',
    overlayFill: 'rgba(255,245,232,.3)',
    leftShadeFill: 'rgba(255,250,242,.54)',
    shadow: 'rgba(95,65,35,.16)',
  },
  'workspace-desk': {
    fallbackFill: '#f7f4ef',
    titleText: '#1f2937',
    bodyText: '#475569',
    mutedText: '#64748b',
    footerText: 'rgba(31,41,55,.58)',
    accent: '#2563eb',
    accentSecondary: '#0f766e',
    divider: 'rgba(37,99,235,.72)',
    badgeFill: 'rgba(37,99,235,.86)',
    badgeText: '#ffffff',
    panelFill: 'rgba(255,255,255,.82)',
    panelText: '#1f2937',
    panelBorder: 'rgba(148,163,184,.3)',
    overlayFill: 'rgba(255,255,255,.24)',
    leftShadeFill: 'rgba(255,255,255,.46)',
    shadow: 'rgba(15,23,42,.12)',
  },
  'science-lab': {
    fallbackFill: '#eaf6ff',
    titleText: '#123a5a',
    bodyText: '#34546f',
    mutedText: '#64748b',
    footerText: 'rgba(18,58,90,.56)',
    accent: '#0284c7',
    accentSecondary: '#14b8a6',
    divider: 'rgba(2,132,199,.72)',
    badgeFill: 'rgba(2,132,199,.86)',
    badgeText: '#ffffff',
    panelFill: 'rgba(244,250,255,.82)',
    panelText: '#123a5a',
    panelBorder: 'rgba(14,165,233,.26)',
    overlayFill: 'rgba(239,248,255,.28)',
    leftShadeFill: 'rgba(255,255,255,.44)',
    shadow: 'rgba(12,74,110,.14)',
  },
  'city-strategy': {
    fallbackFill: '#070b12',
    titleText: '#ffffff',
    bodyText: 'rgba(226,232,240,.86)',
    mutedText: 'rgba(148,163,184,.7)',
    footerText: 'rgba(226,232,240,.62)',
    accent: '#f59e0b',
    accentSecondary: '#60a5fa',
    divider: 'rgba(245,158,11,.74)',
    badgeFill: 'rgba(245,158,11,.86)',
    badgeText: '#111827',
    panelFill: 'rgba(15,23,42,.64)',
    panelText: '#f8fafc',
    panelBorder: 'rgba(245,158,11,.3)',
    overlayFill: 'rgba(2,6,23,.42)',
    leftShadeFill: 'rgba(2,6,23,.54)',
    shadow: 'rgba(0,0,0,.44)',
  },
  'forest-path': {
    fallbackFill: '#e7f4dc',
    titleText: '#113a2c',
    bodyText: '#2d4f3e',
    mutedText: '#60796a',
    footerText: 'rgba(17,58,44,.56)',
    accent: '#23825b',
    accentSecondary: '#d6a84f',
    divider: 'rgba(35,130,91,.7)',
    badgeFill: 'rgba(35,130,91,.86)',
    badgeText: '#ffffff',
    panelFill: 'rgba(250,255,245,.78)',
    panelText: '#113a2c',
    panelBorder: 'rgba(55,116,83,.28)',
    overlayFill: 'rgba(247,255,238,.2)',
    leftShadeFill: 'rgba(250,255,245,.5)',
    shadow: 'rgba(24,72,42,.16)',
  },
};

export const DEFAULT_SLIDE_BACKGROUND_STYLE_ID: SlideBackgroundStyleId = 'academy-watercolor';

export const SLIDE_BACKGROUND_STYLE_OPTIONS: SlideBackgroundStyleOption[] = [
  {
    id: 'academy-watercolor',
    label: '学园水彩',
    description:
      '明亮的文具、笔记本和星象边框，适合通用 classroom lecture、课程导入、复习、学习路线、学生友好的知识地图。',
    src: '/slide-backgrounds/academy-watercolor.png',
    tone: 'light',
    theme: SLIDE_BACKGROUND_THEME_TOKENS['academy-watercolor'],
  },
  {
    id: 'sci-fi-data-cockpit',
    label: '科幻数据舱',
    description:
      '浅色数据舱、悬浮面板和仪表盘，适合 algorithm workflow、engineering systems、AI、物理实验和数据流程课，不用于普通数学函数证明课。',
    src: '/slide-backgrounds/sci-fi-data-cockpit.png',
    tone: 'light',
    theme: SLIDE_BACKGROUND_THEME_TOKENS['sci-fi-data-cockpit'],
  },
  {
    id: 'deep-space-astronomy',
    label: '星际宇宙',
    description:
      '深色星云、天文仪器和宇宙探索感，适合 astronomy、physics、space science、抽象科学探索、宏观问题和发现式封面。',
    src: '/slide-backgrounds/deep-space-astronomy.png',
    tone: 'light',
    theme: SLIDE_BACKGROUND_THEME_TOKENS['deep-space-astronomy'],
  },
  {
    id: 'nature-field-notebook',
    label: '自然生态',
    description:
      '植物标本、野外笔记和自然观察，适合 biology、geography、ecology、environment、climate、自然、生态、地理和环保主题。',
    src: '/slide-backgrounds/nature-field-notebook.png',
    tone: 'light',
    theme: SLIDE_BACKGROUND_THEME_TOKENS['nature-field-notebook'],
  },
  {
    id: 'dark-tech-neural',
    label: '暗色神经网络',
    description:
      '深色电路、神经网络和数字系统光效，适合 programming、object-oriented programming、OOP、class、software architecture、code、API、AI systems 和技术感强的章节。',
    src: '/slide-backgrounds/dark-tech-neural.png',
    tone: 'dark',
    theme: SLIDE_BACKGROUND_THEME_TOKENS['dark-tech-neural'],
  },
  {
    id: 'historical-manuscript',
    label: '历史手稿',
    description:
      '羊皮纸、旧书、档案和指南针，适合 history、humanities、social science、victimization、impact、violence、trauma、justice、crime、case study、历史、人文、社会、创伤和伤害主题。',
    src: '/slide-backgrounds/historical-manuscript.png',
    tone: 'light',
    theme: SLIDE_BACKGROUND_THEME_TOKENS['historical-manuscript'],
  },
  {
    id: 'magazine-courtyard',
    label: '庭院杂志',
    description:
      '暖色庭院、人物生活场景和杂志摄影感，适合 story、community、culture、place、life、narrative opening、故事导入、社区、文化和生活方式封面。',
    src: '/slide-backgrounds/magazine-courtyard-photo.png',
    tone: 'dark',
    theme: SLIDE_BACKGROUND_THEME_TOKENS['magazine-courtyard'],
  },
  {
    id: 'cinematic-stage',
    label: '电影暗场',
    description:
      '暗色舞台、金色光晕、剧院边框和电影感构图，适合 film、movie、music video、MV、literature、art analysis、cinematic、影视、文学、艺术解析。',
    src: '/slide-backgrounds/cinematic-stage-photo.png',
    tone: 'dark',
    theme: SLIDE_BACKGROUND_THEME_TOKENS['cinematic-stage'],
  },
  {
    id: 'product-launch-dark',
    label: '黑金发布',
    description:
      '黑金高对比科技网络、橙色价格高光和发布会气质，适合 product launch、SaaS、pricing、subscription plans、business plan、商业方案、产品发布、订阅和定价。',
    src: '/slide-backgrounds/product-launch-dark-photo.png',
    tone: 'dark',
    theme: SLIDE_BACKGROUND_THEME_TOKENS['product-launch-dark'],
  },
  {
    id: 'academic-blueprint',
    label: '学术蓝图',
    description:
      '蓝白网格、研究报告、结构化版式和轻量数据线，适合 mathematics、functions、proof、theorem、definition、mapping、research、paper、methodology、comparison table、academic、数学函数、证明、定理、定义、映射、论文、研究、方法和学术商务课件。',
    src: '/slide-backgrounds/academic-blueprint-photo.png',
    tone: 'light',
    theme: SLIDE_BACKGROUND_THEME_TOKENS['academic-blueprint'],
  },
  {
    id: 'lecture-hall',
    label: '现代阶梯教室',
    description:
      '温暖木色阶梯教室、黑板区域和真实课堂氛围，适合 classroom、course chapter、lecture、teaching、ordinary academic talk、课堂导入、课程章节和学术讲授。',
    src: '/slide-backgrounds/lecture-hall-photo.png',
    tone: 'light',
    theme: SLIDE_BACKGROUND_THEME_TOKENS['lecture-hall'],
  },
  {
    id: 'workspace-desk',
    label: '明亮工作台',
    description:
      '日光办公桌、笔记本、便签和留白墙面，适合 project、collaboration、feedback、requirements、workflow、productivity、office、项目、协作、反馈、需求和效率主题。',
    src: '/slide-backgrounds/workspace-desk-photo.png',
    tone: 'light',
    theme: SLIDE_BACKGROUND_THEME_TOKENS['workspace-desk'],
  },
  {
    id: 'science-lab',
    label: '现代实验室',
    description:
      '冷色显微镜、实验台和研究设备，适合 science、medicine、biology、chemistry、experiment、laboratory、research、科学、医学、生物、化学和实验课程。',
    src: '/slide-backgrounds/science-lab-photo.png',
    tone: 'light',
    theme: SLIDE_BACKGROUND_THEME_TOKENS['science-lab'],
  },
  {
    id: 'city-strategy',
    label: '城市战略夜景',
    description:
      '高层会议室、城市夜景和战略汇报感，适合 strategy、consulting、management、policy、market、planning、business analysis、战略、咨询、管理、政策和商业规划。',
    src: '/slide-backgrounds/city-strategy-photo.png',
    tone: 'dark',
    theme: SLIDE_BACKGROUND_THEME_TOKENS['city-strategy'],
  },
  {
    id: 'forest-path',
    label: '森林路径',
    description:
      '晨光森林小路、自然留白和安静反思感，适合 nature、geography、environment、health、reflection、wellbeing、自然、地理、环保、健康和反思主题。',
    src: '/slide-backgrounds/forest-path-photo.png',
    tone: 'light',
    theme: SLIDE_BACKGROUND_THEME_TOKENS['forest-path'],
  },
];

const SLIDE_BACKGROUND_STYLE_IDS = new Set(
  SLIDE_BACKGROUND_STYLE_OPTIONS.map((option) => option.id),
);

export function isValidSlideBackgroundStyleId(value: unknown): value is SlideBackgroundStyleId {
  return (
    typeof value === 'string' && SLIDE_BACKGROUND_STYLE_IDS.has(value as SlideBackgroundStyleId)
  );
}

export function getSlideBackgroundStyleOption(
  id: SlideBackgroundStyleId,
): SlideBackgroundStyleOption {
  return (
    SLIDE_BACKGROUND_STYLE_OPTIONS.find((option) => option.id === id) ??
    SLIDE_BACKGROUND_STYLE_OPTIONS[0]
  );
}

export function getSlideBackgroundThemeTokens(
  id: SlideBackgroundStyleId,
): SlideBackgroundThemeTokens {
  return getSlideBackgroundStyleOption(id).theme;
}

function normalizeSlideBackgroundSource(src: string): string {
  return src.split('?')[0].split('#')[0];
}

export function findSlideBackgroundStyleBySource(
  src: string | undefined,
): SlideBackgroundStyleOption | null {
  if (!src) return null;
  const normalized = normalizeSlideBackgroundSource(src);
  return (
    SLIDE_BACKGROUND_STYLE_OPTIONS.find((option) => {
      const optionSrc = normalizeSlideBackgroundSource(option.src);
      return normalized === optionSrc || normalized.endsWith(optionSrc);
    }) ?? null
  );
}

export function resolveSlideBackgroundThemeForSource(
  src: string | undefined,
): SlideBackgroundThemeTokens | null {
  return findSlideBackgroundStyleBySource(src)?.theme ?? null;
}

export function slideBackgroundStyleCosmeticKey(id: SlideBackgroundStyleId): string {
  return `slide-background:${id}`;
}

export function getSlideBackgroundForStyle(id: SlideBackgroundStyleId): SlideBackground {
  const option = getSlideBackgroundStyleOption(id);
  return {
    type: 'image',
    image: {
      src: option.src,
      size: 'cover',
    },
  };
}

function normalizeBackgroundIntent(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

const BACKGROUND_SELECTION_STOPWORDS = new Set([
  'and',
  'the',
  'for',
  'with',
  'from',
  'this',
  'that',
  'into',
  'about',
  'course',
  'cover',
  'slide',
  'theme',
  'topic',
  'style',
  'chapter',
  'lecture',
  '适合',
  '主题',
  '课程',
  '封面',
  '导入',
  '章节',
  '背景',
  '版式',
  '内容',
  '和',
  '与',
]);

function normalizeSelectionLatinToken(token: string): string {
  const cleaned = token.toLowerCase().replace(/^[-_]+|[-_]+$/g, '');
  if (cleaned.length <= 4) return cleaned;
  if (cleaned.endsWith('ies')) return `${cleaned.slice(0, -3)}y`;
  if (cleaned.endsWith('es')) return cleaned.slice(0, -2);
  if (cleaned.endsWith('s')) return cleaned.slice(0, -1);
  return cleaned;
}

function extractCjkNgrams(input: string): string[] {
  const tokens: string[] = [];
  for (const match of input.matchAll(/[\u3400-\u9fff]{2,}/g)) {
    const chunk = match[0];
    for (let size = 2; size <= Math.min(4, chunk.length); size += 1) {
      for (let index = 0; index <= chunk.length - size; index += 1) {
        tokens.push(chunk.slice(index, index + size));
      }
    }
  }
  return tokens;
}

function extractBackgroundSelectionTokens(input: string): Set<string> {
  const normalized = input.toLowerCase();
  const latinTokens = [...normalized.matchAll(/[a-z0-9][a-z0-9_-]{1,}/g)]
    .map((match) => normalizeSelectionLatinToken(match[0]))
    .filter((token) => token.length >= 2 && !BACKGROUND_SELECTION_STOPWORDS.has(token));
  const cjkTokens = extractCjkNgrams(normalized).filter(
    (token) => !BACKGROUND_SELECTION_STOPWORDS.has(token),
  );
  return new Set([...latinTokens, ...cjkTokens]);
}

function formatBackgroundTemplateIntentText(args: {
  layoutTemplate?: string;
  deckStyle?: string;
  disciplineStyle?: string;
}): string {
  const template = normalizeBackgroundIntent(args.layoutTemplate);
  const templateIntent =
    template === 'tech_hero_title'
      ? 'technology digital network product system'
      : template === 'cinematic_title_frame'
        ? 'cinematic dark dramatic art film stage'
        : template === 'image_title_overlay'
          ? 'classroom lecture course opening'
          : '';

  return [args.deckStyle, args.disciplineStyle, args.layoutTemplate, templateIntent]
    .filter(Boolean)
    .join('\n');
}

function scoreBackgroundStyleByDescription(inputText: string, option: SlideBackgroundStyleOption) {
  const inputTokens = extractBackgroundSelectionTokens(inputText);
  const descriptionText = `${option.label}\n${option.description}`;
  const descriptionTokens = extractBackgroundSelectionTokens(descriptionText);
  let score = 0;

  for (const token of inputTokens) {
    if (!descriptionTokens.has(token)) continue;
    score += token.length >= 5 ? 3 : 1;
  }

  const normalizedInput = inputText.toLowerCase();
  const descriptionPhrases = option.description
    .toLowerCase()
    .split(/[，。、；;,.、/]+|\s+and\s+|\s+or\s+/)
    .map((phrase) => phrase.trim())
    .filter((phrase) => phrase.length >= 4 && !BACKGROUND_SELECTION_STOPWORDS.has(phrase));

  for (const phrase of descriptionPhrases) {
    if (normalizedInput.includes(phrase)) score += 4;
  }

  return score;
}

export function selectSlideBackgroundStyleFromDescriptions(args: {
  layoutTemplate?: string;
  deckStyle?: string;
  disciplineStyle?: string;
  title?: string;
  description?: string;
}): SlideBackgroundStyleOption {
  const contentText = [args.title, args.description].filter(Boolean).join('\n');
  const intentText = formatBackgroundTemplateIntentText(args);
  let best = getSlideBackgroundStyleOption(DEFAULT_SLIDE_BACKGROUND_STYLE_ID);
  let bestScore = -1;

  for (const option of SLIDE_BACKGROUND_STYLE_OPTIONS) {
    const score =
      scoreBackgroundStyleByDescription(contentText, option) * 3 +
      scoreBackgroundStyleByDescription(intentText, option);
    if (score > bestScore) {
      best = option;
      bestScore = score;
    }
  }

  if (bestScore <= 0) return getSlideBackgroundStyleOption(DEFAULT_SLIDE_BACKGROUND_STYLE_ID);
  return best;
}

export function resolveBuiltInHeroBackgroundStyle(args: {
  layoutTemplate?: string;
  deckStyle?: string;
  disciplineStyle?: string;
  title?: string;
  description?: string;
}): SlideBackgroundStyleOption {
  return selectSlideBackgroundStyleFromDescriptions(args);
}

export function resolveBuiltInHeroBackgroundSource(args: {
  layoutTemplate?: string;
  deckStyle?: string;
  disciplineStyle?: string;
  title?: string;
  description?: string;
}): string {
  return resolveBuiltInHeroBackgroundStyle(args).src;
}

export function resolveBuiltInHeroBackgroundTheme(args: {
  layoutTemplate?: string;
  deckStyle?: string;
  disciplineStyle?: string;
  title?: string;
  description?: string;
}): SlideBackgroundThemeTokens {
  return resolveBuiltInHeroBackgroundStyle(args).theme;
}

export function shouldApplyProfileSlideBackground(
  background: SlideBackground | undefined,
): boolean {
  if (!background) return true;
  if (background.respectProfileStyle === false) return false;
  return background.type !== 'image';
}

export function resolveEffectiveSlideBackground(
  background: SlideBackground | undefined,
  styleId: SlideBackgroundStyleId,
): SlideBackground {
  if (background && !shouldApplyProfileSlideBackground(background)) return background;
  return getSlideBackgroundForStyle(styleId);
}
