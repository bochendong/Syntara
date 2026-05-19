export const SLIDE_GENERATION_ROUTES = ['html-ppt', 'syntara-semantic', 'openmaic-legacy'] as const;

export type SlideGenerationRoute = (typeof SLIDE_GENERATION_ROUTES)[number];

export const DEFAULT_SLIDE_GENERATION_ROUTE: SlideGenerationRoute = 'syntara-semantic';
export const DEFAULT_NOTEBOOK_SLIDE_GENERATION_ROUTE: SlideGenerationRoute = 'html-ppt';

// The OpenMAIC option maps to the tracked fixed-canvas element pipeline in scene-generator.ts.
// It intentionally does not read code from the gitignored OpenMAIC-org directory at runtime.
export const SLIDE_GENERATION_ROUTE_LABELS: Record<SlideGenerationRoute, string> = {
  'html-ppt': '旧版 HTML PPT',
  'syntara-semantic': 'Syntara 语义页（当前）',
  'openmaic-legacy': 'OpenMAIC 旧版 Canvas',
};

export const SLIDE_GENERATION_ROUTE_DESCRIPTIONS: Record<SlideGenerationRoute, string> = {
  'html-ppt': '使用旧版 HTML/CSS PPT 生成器，生成整页课件并以内嵌 iframe 播放。',
  'syntara-semantic': '使用 Syntara Markup / 长页语义结构，适合网页阅读和公式内容。',
  'openmaic-legacy': '使用旧版固定画布元素生成链路，便于对照历史 OpenMAIC 效果。',
};

const SLIDE_GENERATION_ROUTE_SET = new Set<string>(SLIDE_GENERATION_ROUTES);

export function normalizeSlideGenerationRoute(value: unknown): SlideGenerationRoute {
  if (typeof value === 'string' && SLIDE_GENERATION_ROUTE_SET.has(value)) {
    return value as SlideGenerationRoute;
  }
  return DEFAULT_SLIDE_GENERATION_ROUTE;
}

export function normalizeNotebookSlideGenerationRoute(value: unknown): SlideGenerationRoute {
  if (typeof value === 'string' && SLIDE_GENERATION_ROUTE_SET.has(value)) {
    const route = value as SlideGenerationRoute;
    return route === 'openmaic-legacy' ? DEFAULT_SLIDE_GENERATION_ROUTE : route;
  }
  return DEFAULT_SLIDE_GENERATION_ROUTE;
}
