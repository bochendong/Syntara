import type { NotebookContentBlock, NotebookContentDeckStyle } from './schema';

export type ContentCardTone = {
  fill: string;
  border: string;
  accent: string;
};
export type ProcessFlowBlock = Extract<NotebookContentBlock, { type: 'process_flow' }>;
export type LayoutCardsBlock = Extract<NotebookContentBlock, { type: 'layout_cards' }>;

export const ACADEMY_PAPER = {
  titleText: '#182033',
  bodyText: '#3f4b63',
  primary: '#4b72e8',
  purple: '#8a6fe8',
  green: '#27b889',
  gold: '#d6a84f',
  cardFill: 'rgba(255,253,248,0.86)',
  cardFillSoft: 'rgba(255,253,248,0.76)',
  formulaFill: 'rgba(248,251,255,0.74)',
  border: 'rgba(188,169,133,0.3)',
  blueBorder: 'rgba(119,148,191,0.34)',
  shadow: 'rgba(106,84,45,0.11)',
} as const;

export const CLASSIC_BUSINESS = {
  titleText: '#1f2937',
  bodyText: '#374151',
  mutedText: '#6b7280',
  border: '#d1d5db',
  subtleBorder: '#e5e7eb',
  panelFill: '#f8fafc',
  panelFillWarm: '#fff7ed',
  panelFillGreen: '#ecfdf5',
  panelFillBlue: '#eff6ff',
  blue: '#2563eb',
  red: '#dc2626',
  yellow: '#f59e0b',
  green: '#16a34a',
  teal: '#0f766e',
  shadow: 'rgba(15,23,42,0.08)',
} as const;

export type ClassicDeckStylePreset = {
  id: NotebookContentDeckStyle;
  name: string;
  background: string;
  titleText: string;
  bodyText: string;
  mutedText: string;
  border: string;
  subtleBorder: string;
  panelFill: string;
  panelFillWarm: string;
  panelFillGreen: string;
  panelFillBlue: string;
  panelFillRed: string;
  borderWarm: string;
  borderGreen: string;
  borderBlue: string;
  borderRed: string;
  blue: string;
  red: string;
  yellow: string;
  green: string;
  teal: string;
  shadow: string;
  tableFill: string;
  tableStripeFill: string;
  tableHeaderFill: string;
};

export const CLASSIC_DECK_STYLES = {
  classic_business: {
    id: 'classic_business',
    name: 'Classic Business',
    background: '#ffffff',
    ...CLASSIC_BUSINESS,
    panelFillRed: '#fee2e2',
    borderWarm: '#fed7aa',
    borderGreen: '#bbf7d0',
    borderBlue: '#bfdbfe',
    borderRed: '#fecaca',
    tableFill: '#ffffff',
    tableStripeFill: '#f9fafb',
    tableHeaderFill: '#e5e7eb',
  },
  academic: {
    id: 'academic',
    name: 'Academic',
    background: '#f8fbff',
    titleText: '#0f2f63',
    bodyText: '#233454',
    mutedText: '#64748b',
    border: '#c9d8ee',
    subtleBorder: '#dbe7f6',
    panelFill: '#ffffff',
    panelFillWarm: '#fff7ed',
    panelFillGreen: '#eefbf5',
    panelFillBlue: '#eef5ff',
    panelFillRed: '#fff1f2',
    borderWarm: '#fed7aa',
    borderGreen: '#bfe9d2',
    borderBlue: '#b9cff4',
    borderRed: '#fecdd3',
    blue: '#174a8b',
    red: '#b42318',
    yellow: '#d69e2e',
    green: '#28775d',
    teal: '#0f766e',
    shadow: 'rgba(15,47,99,0.08)',
    tableFill: '#ffffff',
    tableStripeFill: '#f3f7fc',
    tableHeaderFill: '#e4edf8',
  },
  magazine: {
    id: 'magazine',
    name: 'Magazine',
    background: '#fbf4ea',
    titleText: '#2b2a24',
    bodyText: '#4a4438',
    mutedText: '#746a5b',
    border: '#e1d1bd',
    subtleBorder: '#eadfce',
    panelFill: '#fffaf2',
    panelFillWarm: '#fff2df',
    panelFillGreen: '#edf4df',
    panelFillBlue: '#eff5ef',
    panelFillRed: '#f9e7df',
    borderWarm: '#e8c59a',
    borderGreen: '#c9d9af',
    borderBlue: '#cbd8c2',
    borderRed: '#ebc3ad',
    blue: '#63795a',
    red: '#b66543',
    yellow: '#d39b42',
    green: '#7b914f',
    teal: '#607f78',
    shadow: 'rgba(86,64,38,0.12)',
    tableFill: '#fffaf2',
    tableStripeFill: '#f7ead9',
    tableHeaderFill: '#eadcc8',
  },
  dark_art: {
    id: 'dark_art',
    name: 'Dark Art',
    background: '#111224',
    titleText: '#fff6d9',
    bodyText: '#e6e0f2',
    mutedText: '#b9afcf',
    border: '#463d66',
    subtleBorder: '#342c4f',
    panelFill: '#1a1a34',
    panelFillWarm: '#282036',
    panelFillGreen: '#162d2c',
    panelFillBlue: '#181f3f',
    panelFillRed: '#2a1930',
    borderWarm: '#6c4c2c',
    borderGreen: '#2e5f58',
    borderBlue: '#3c4a85',
    borderRed: '#66334e',
    blue: '#7c8cff',
    red: '#d85b8c',
    yellow: '#f5c85f',
    green: '#49c6a7',
    teal: '#6ee7d8',
    shadow: 'rgba(0,0,0,0.34)',
    tableFill: '#17172c',
    tableStripeFill: '#20203a',
    tableHeaderFill: '#29294a',
  },
  nature_documentary: {
    id: 'nature_documentary',
    name: 'Nature Documentary',
    background: '#061f1c',
    titleText: '#f4f7ea',
    bodyText: '#dce9dc',
    mutedText: '#9fb7aa',
    border: '#215147',
    subtleBorder: '#173d37',
    panelFill: '#0b2a25',
    panelFillWarm: '#24311d',
    panelFillGreen: '#0d342e',
    panelFillBlue: '#0e3138',
    panelFillRed: '#342018',
    borderWarm: '#6d6a38',
    borderGreen: '#2d6f5d',
    borderBlue: '#32636f',
    borderRed: '#744435',
    blue: '#72d1d7',
    red: '#f9735b',
    yellow: '#d7bd63',
    green: '#6ee7b7',
    teal: '#2dd4bf',
    shadow: 'rgba(0,0,0,0.28)',
    tableFill: '#0b2a25',
    tableStripeFill: '#10342e',
    tableHeaderFill: '#173f38',
  },
  tech_saas: {
    id: 'tech_saas',
    name: 'Tech / SaaS',
    background: '#f8fafc',
    titleText: '#111827',
    bodyText: '#334155',
    mutedText: '#64748b',
    border: '#d8e2ee',
    subtleBorder: '#e2e8f0',
    panelFill: '#ffffff',
    panelFillWarm: '#fff4ed',
    panelFillGreen: '#ecfdf5',
    panelFillBlue: '#eff6ff',
    panelFillRed: '#fff1f2',
    borderWarm: '#fed7aa',
    borderGreen: '#bbf7d0',
    borderBlue: '#bfdbfe',
    borderRed: '#fecdd3',
    blue: '#2563eb',
    red: '#f97316',
    yellow: '#8b5cf6',
    green: '#10b981',
    teal: '#06b6d4',
    shadow: 'rgba(15,23,42,0.10)',
    tableFill: '#ffffff',
    tableStripeFill: '#f8fafc',
    tableHeaderFill: '#eaf1fb',
  },
  product_launch: {
    id: 'product_launch',
    name: 'Product Launch',
    background: '#060606',
    titleText: '#ffffff',
    bodyText: '#f4f4f5',
    mutedText: '#a1a1aa',
    border: '#2f2f33',
    subtleBorder: '#242428',
    panelFill: '#111113',
    panelFillWarm: '#1f1711',
    panelFillGreen: '#10231c',
    panelFillBlue: '#101827',
    panelFillRed: '#241315',
    borderWarm: '#7c3f16',
    borderGreen: '#205d48',
    borderBlue: '#29466f',
    borderRed: '#7f1d1d',
    blue: '#60a5fa',
    red: '#f97316',
    yellow: '#fbbf24',
    green: '#34d399',
    teal: '#22d3ee',
    shadow: 'rgba(0,0,0,0.42)',
    tableFill: '#111113',
    tableStripeFill: '#17171a',
    tableHeaderFill: '#232326',
  },
} satisfies Record<NotebookContentDeckStyle, ClassicDeckStylePreset>;
