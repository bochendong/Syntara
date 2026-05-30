export const IMAGE_NOTEBOOK_CANVAS_WIDTH = 1000;
export const IMAGE_NOTEBOOK_CANVAS_HEIGHT = 562.5;
export const IMAGE_NOTEBOOK_PROMPT_CANVAS_WIDTH = 1600;
export const IMAGE_NOTEBOOK_PROMPT_CANVAS_HEIGHT = 900;
export const IMAGE_NOTEBOOK_PROMPT_PLAN_SCHEMA_VERSION = 1;

export const IMAGE_NOTEBOOK_MARKER_COLOR_POOL = [
  { name: 'red', hex: '#ff0000' },
  { name: 'lime', hex: '#00ff00' },
  { name: 'blue', hex: '#0048ff' },
  { name: 'cyan', hex: '#00ffff' },
  { name: 'magenta', hex: '#ff00ff' },
  { name: 'yellow', hex: '#ffff00' },
] as const;

export type ImageNotebookMarkerColorName =
  (typeof IMAGE_NOTEBOOK_MARKER_COLOR_POOL)[number]['name'];

export type ImageNotebookPromptComponentRole =
  | 'header'
  | 'opening'
  | 'setup'
  | 'definition'
  | 'formula'
  | 'example'
  | 'proof'
  | 'strategy'
  | 'pitfall'
  | 'takeaway'
  | 'visual'
  | 'question'
  | 'decoration'
  | 'other';

export type ImageNotebookPromptLayoutSlot =
  | 'top-full'
  | 'middle-left'
  | 'middle-center-left'
  | 'middle-center-right'
  | 'middle-right'
  | 'bottom-full'
  | 'free';

export interface ImageNotebookPromptComponentPlan {
  id: string;
  label: string;
  role: ImageNotebookPromptComponentRole;
  order: number;
  layoutSlot: ImageNotebookPromptLayoutSlot;
  markerColorName?: ImageNotebookMarkerColorName;
  markerColorHex?: string;
  visibleText: string[];
  formulas: string[];
  diagramPrompt?: string;
  participatesInMask: boolean;
}

export interface ImageNotebookMarkerProtocol {
  type: 'corner-square-markers';
  markerSizePx: number;
  markerCountPerComponent: 4;
  blankBackgroundPaddingPx: number;
  maxMaskableComponents: number;
  colorPool: Array<{ name: ImageNotebookMarkerColorName; hex: string }>;
  ordinaryContentForbiddenColors: string[];
}

export interface ImageNotebookPromptValidationTarget {
  maskableComponentCount: number;
  totalMarkerCount: number;
  markerCountsByColor: Record<string, number>;
  forbiddenVisibleMarks: string[];
}

export interface ImageNotebookPromptRecoveryResult {
  status: 'pending' | 'passed' | 'partial' | 'failed';
  recoveredAt?: number;
  originalMarkerImageUrl?: string;
  originalMarkerImageDimensions?: {
    width: number;
    height: number;
  };
  retrofittedMarkerOverlay?: {
    source: 'focus-geometry';
    canvasWidth: number;
    canvasHeight: number;
    markers: Array<{
      componentId: string;
      markerColorHex: string;
      x: number;
      y: number;
      size: number;
      corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    }>;
  };
  findings?: string[];
  components?: Array<{
    componentId: string;
    markerColorHex: string;
    bbox?: [number, number, number, number];
    markerPoints?: Array<{
      x: number;
      y: number;
      corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    }>;
    markerCount?: number;
  }>;
}

export type ImageNotebookStylePreset =
  | 'hand-drawn-course-notebook'
  | 'cartoon-educational'
  | 'minimal-line-art'
  | 'watercolor-explainer'
  | 'custom';

export type ImageNotebookStyleDensity = 'sparse' | 'medium' | 'dense';
export type ImageNotebookDecorationLevel = 'none' | 'light' | 'moderate';

export interface ImageNotebookStyleBrief {
  schemaVersion: 1;
  preset: ImageNotebookStylePreset;
  canvas: '16:9';
  background: string;
  writingStyle: string;
  colorMood: string;
  density: ImageNotebookStyleDensity;
  decorationLevel: ImageNotebookDecorationLevel;
  palette?: {
    label?: string;
    colors: string[];
  };
  userStylePrompt?: string;
  avoidPureMarkerColors: string[];
  ordinaryContentColorRule: string;
}

export interface ImageNotebookPromptStyleProfile {
  id: 'default-hand-drawn-notebook';
  label: string;
  baselineRules: string[];
  userStylePrompt?: string;
  styleBrief: ImageNotebookStyleBrief;
}

export interface ImageNotebookPagePromptPlan {
  schemaVersion: typeof IMAGE_NOTEBOOK_PROMPT_PLAN_SCHEMA_VERSION;
  canvas: {
    width: typeof IMAGE_NOTEBOOK_PROMPT_CANVAS_WIDTH;
    height: typeof IMAGE_NOTEBOOK_PROMPT_CANVAS_HEIGHT;
    aspectRatio: '16:9';
  };
  styleProfile: ImageNotebookPromptStyleProfile;
  componentPlans: ImageNotebookPromptComponentPlan[];
  markerProtocol: ImageNotebookMarkerProtocol;
  compiledImagePrompt: string;
  promptHash: string;
  validationTarget: ImageNotebookPromptValidationTarget;
  recoveryResult?: ImageNotebookPromptRecoveryResult;
}

export type ImageNotebookPageRole =
  | 'overview'
  | 'hook'
  | 'definition'
  | 'formula'
  | 'example'
  | 'proof'
  | 'strategy'
  | 'pitfalls'
  | 'summary';

export type ImageNotebookFocusRole =
  | 'opening'
  | 'setup'
  | 'formula'
  | 'example'
  | 'proof'
  | 'strategy'
  | 'pitfall'
  | 'takeaway'
  | 'visual';

export interface ImageNotebookCourseSpineAct {
  id: string;
  act: 'opening' | 'development' | 'practice' | 'synthesis';
  title: string;
  purpose: string;
  pages: number[];
  keyQuestion?: string;
}

export interface ImageNotebookCourseSpine {
  logline: string;
  centralQuestion: string;
  acts: ImageNotebookCourseSpineAct[];
  closingCallback: string;
}

export interface ImageNotebookPageMove {
  fromPrevious?: string;
  currentJob: string;
  toNext?: string;
  callbackToSpine?: string;
}

export interface ImageNotebookVisibleContent {
  mustShow: string[];
  formulas: string[];
  exampleSteps: string[];
  commonPitfalls: string[];
  bottomTakeaway?: string;
}

export interface ImageNotebookFocusRegion {
  id: string;
  label: string;
  role: ImageNotebookFocusRole;
  left: number;
  top: number;
  width: number;
  height: number;
  order: number;
}

export interface ImageNotebookPageBrief {
  outlineId: string;
  pageNumber: number;
  pageRole: ImageNotebookPageRole;
  title: string;
  pageMove: ImageNotebookPageMove;
  visualBrief: string;
  visibleContent: ImageNotebookVisibleContent;
  focusRegions: ImageNotebookFocusRegion[];
  componentPlans?: ImageNotebookPromptComponentPlan[];
  generationNotes?: string[];
  qaChecklist?: string[];
}

export interface ImageNotebookBriefPlan {
  courseSpine: ImageNotebookCourseSpine;
  pageBriefs: ImageNotebookPageBrief[];
}

export type ImageNotebookQaSeverity = 'info' | 'warning' | 'critical';
export type ImageNotebookQaCategory = 'visual' | 'math' | 'text' | 'layout' | 'focus';

export interface ImageNotebookQaFinding {
  category: ImageNotebookQaCategory;
  severity: ImageNotebookQaSeverity;
  message: string;
}

export interface ImageNotebookQaResult {
  passed: boolean;
  findings: ImageNotebookQaFinding[];
  mathFindings: ImageNotebookQaFinding[];
  visualFindings: ImageNotebookQaFinding[];
  regeneratePromptAddendum?: string;
  revisedFocusRegions?: ImageNotebookFocusRegion[];
}

export interface ImageNotebookGenerationAttempt {
  attempt: number;
  prompt: string;
  qa?: ImageNotebookQaResult;
}

export type ImageNotebookLengthPreference = 'minimal' | 'compact' | 'standard' | 'extended';
export type ImageNotebookWorkedExampleLevel = 'none' | 'light' | 'moderate' | 'heavy';

export interface ImageNotebookDensityPolicy {
  length: ImageNotebookLengthPreference;
  label: string;
  pageRangeText: string;
  minPages: number;
  maxPages?: number;
  planningMode: string;
  contentRules: string[];
  minFocusRegions: number;
  maxFocusRegions: number;
  maxKeyPoints: number;
  maxMustShow: number;
  maxFormulas: number;
  maxExampleSteps: number;
  maxDetailedExamples?: number;
}

function compactStyleText(value: unknown, maxLength = 900): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeStylePreset(value: unknown): ImageNotebookStylePreset {
  if (
    value === 'hand-drawn-course-notebook' ||
    value === 'cartoon-educational' ||
    value === 'minimal-line-art' ||
    value === 'watercolor-explainer' ||
    value === 'custom'
  ) {
    return value;
  }
  return 'hand-drawn-course-notebook';
}

function normalizeStyleDensity(value: unknown): ImageNotebookStyleDensity {
  return value === 'sparse' || value === 'medium' || value === 'dense' ? value : 'medium';
}

function normalizeDecorationLevel(value: unknown): ImageNotebookDecorationLevel {
  return value === 'none' || value === 'light' || value === 'moderate' ? value : 'light';
}

function normalizeStylePalette(value: unknown): ImageNotebookStyleBrief['palette'] | undefined {
  const record = objectRecord(value);
  const colors = Array.isArray(record.colors)
    ? record.colors
        .map((color) => compactStyleText(color, 24))
        .filter((color) => /^#[0-9a-f]{6}$/i.test(color))
        .slice(0, 8)
    : [];
  if (!colors.length) return undefined;
  const label = compactStyleText(record.label, 80);
  return {
    ...(label ? { label } : {}),
    colors,
  };
}

export function normalizeImageNotebookStyleBrief(
  value?: unknown,
  fallbackPrompt?: string,
): ImageNotebookStyleBrief {
  const record = objectRecord(value);
  const legacyPrompt = typeof value === 'string' ? value : fallbackPrompt;
  const userStylePrompt =
    compactStyleText(record.userStylePrompt || record.prompt || legacyPrompt, 900) || undefined;
  const palette = normalizeStylePalette(record.palette);
  return {
    schemaVersion: 1,
    preset: normalizeStylePreset(record.preset),
    canvas: '16:9',
    background:
      compactStyleText(record.background, 160) ||
      'white graph-paper notebook background with faint light-gray grid',
    writingStyle:
      compactStyleText(record.writingStyle, 180) ||
      'common college-course hand-drawn marker notes with readable handwritten labels',
    colorMood:
      compactStyleText(record.colorMood, 180) ||
      'black marker text, deep teal diagrams, pale teal fills, and muted brown arrows',
    density: normalizeStyleDensity(record.density),
    decorationLevel: normalizeDecorationLevel(record.decorationLevel),
    ...(palette ? { palette } : {}),
    ...(userStylePrompt ? { userStylePrompt } : {}),
    avoidPureMarkerColors: IMAGE_NOTEBOOK_MARKER_COLOR_POOL.map((color) => color.hex),
    ordinaryContentColorRule:
      compactStyleText(record.ordinaryContentColorRule, 260) ||
      'Do not use pure marker colors in normal content; those colors are reserved for recoverable corner markers only.',
  };
}

export function formatImageNotebookStyleBriefForPrompt(
  styleBrief: ImageNotebookStyleBrief,
): string[] {
  return [
    `- Style preset: ${styleBrief.preset}.`,
    `- Canvas: ${styleBrief.canvas} full-bleed page; no centered card, outer frame, browser UI, or watermark.`,
    `- Background: ${styleBrief.background}.`,
    `- Writing style: ${styleBrief.writingStyle}.`,
    `- Color mood: ${styleBrief.colorMood}.`,
    styleBrief.palette?.colors.length
      ? `- Palette direction: ${[styleBrief.palette.label, styleBrief.palette.colors.join(', ')]
          .filter(Boolean)
          .join(' - ')}.`
      : '',
    `- Content density: ${styleBrief.density}; keep all text large, sparse, and projector-readable.`,
    `- Decorative elements: ${styleBrief.decorationLevel}; decorations are allowed only as unmarked support and must not receive corner markers.`,
    styleBrief.userStylePrompt
      ? `- User-selected art direction: ${styleBrief.userStylePrompt}.`
      : '',
    `- Marker color reservation: ${styleBrief.ordinaryContentColorRule}`,
    `- Do not use these pure colors in ordinary content: ${styleBrief.avoidPureMarkerColors.join(', ')}.`,
  ].filter(Boolean);
}

const IMAGE_NOTEBOOK_DENSITY_POLICIES: Record<
  ImageNotebookLengthPreference,
  ImageNotebookDensityPolicy
> = {
  minimal: {
    length: 'minimal',
    label: '5 页以下 overview',
    pageRangeText: '4-5 pages',
    minPages: 4,
    maxPages: 5,
    planningMode:
      'Overview deck: frame the topic, show the route map, compare the core choices, and leave details for a longer notebook.',
    contentRules: [
      'One page should carry one big idea or one decision, not a compressed full lecture.',
      'Prefer hook, route-map, comparison, method-choice, and summary pages.',
      'Use at most one complete worked example; other examples should be tiny anchors or questions.',
      'Do not include full derivations, long proof chains, dense checklists, or many boxed mini-sections.',
    ],
    minFocusRegions: 2,
    maxFocusRegions: 3,
    maxKeyPoints: 4,
    maxMustShow: 4,
    maxFormulas: 2,
    maxExampleSteps: 3,
    maxDetailedExamples: 1,
  },
  compact: {
    length: 'compact',
    label: '10 页以下 guided overview',
    pageRangeText: '6-10 pages',
    minPages: 6,
    maxPages: 10,
    planningMode:
      'Guided overview: introduce the route, teach the essential moves, include one or two worked pages, and close with transfer.',
    contentRules: [
      'Each page should still be sparse, but it can teach one concrete step in the route.',
      'Use one main worked example sequence, split across pages if needed.',
      'Avoid more than four parent regions on a page; move extra detail to another page.',
    ],
    minFocusRegions: 3,
    maxFocusRegions: 4,
    maxKeyPoints: 5,
    maxMustShow: 5,
    maxFormulas: 3,
    maxExampleSteps: 5,
    maxDetailedExamples: 2,
  },
  standard: {
    length: 'standard',
    label: '10-20 页 standard lesson',
    pageRangeText: '10-20 pages',
    minPages: 10,
    maxPages: 20,
    planningMode:
      'Standard lesson: teach the topic in sequence, with definitions, formulas, examples, pitfalls, and synthesis separated across pages.',
    contentRules: [
      'Use normal classroom pacing and split proof or example chains across pages when they get long.',
      'A page may have three to five parent regions, but should still avoid handout density.',
      'Worked examples should be complete and accurate, not squeezed into unrelated concept pages.',
    ],
    minFocusRegions: 3,
    maxFocusRegions: 5,
    maxKeyPoints: 5,
    maxMustShow: 6,
    maxFormulas: 4,
    maxExampleSteps: 6,
    maxDetailedExamples: 5,
  },
  extended: {
    length: 'extended',
    label: '20 页以上 deep walkthrough',
    pageRangeText: '20+ pages',
    minPages: 20,
    planningMode:
      'Deep walkthrough: expand the route into a full classroom sequence with slow examples, diagnostics, and transfer practice.',
    contentRules: [
      'Use the extra pages to split detail, not to make individual pages denser.',
      'Long derivations and proof chains should be spread over multiple pages with clear handoffs.',
      'Include multiple worked examples only when each has a distinct teaching job.',
    ],
    minFocusRegions: 3,
    maxFocusRegions: 5,
    maxKeyPoints: 5,
    maxMustShow: 6,
    maxFormulas: 4,
    maxExampleSteps: 7,
  },
};

function normalizeLengthPreference(value: unknown): ImageNotebookLengthPreference | undefined {
  return value === 'minimal' || value === 'compact' || value === 'standard' || value === 'extended'
    ? value
    : undefined;
}

export function resolveImageNotebookDensityPolicy(length?: unknown): ImageNotebookDensityPolicy {
  return IMAGE_NOTEBOOK_DENSITY_POLICIES[normalizeLengthPreference(length) || 'standard'];
}

export function resolveImageNotebookDensityPolicyForPageCount(
  totalPages: number | undefined,
): ImageNotebookDensityPolicy {
  if (typeof totalPages !== 'number' || !Number.isFinite(totalPages) || totalPages <= 0) {
    return IMAGE_NOTEBOOK_DENSITY_POLICIES.standard;
  }
  if (totalPages <= 5) return IMAGE_NOTEBOOK_DENSITY_POLICIES.minimal;
  if (totalPages <= 10) return IMAGE_NOTEBOOK_DENSITY_POLICIES.compact;
  if (totalPages <= 20) return IMAGE_NOTEBOOK_DENSITY_POLICIES.standard;
  return IMAGE_NOTEBOOK_DENSITY_POLICIES.extended;
}

export function getImageNotebookRequiredWorkedExampleCount(args: {
  length?: unknown;
  workedExampleLevel?: unknown;
}): number {
  const length = normalizeLengthPreference(args.length);
  const level =
    args.workedExampleLevel === 'none' ||
    args.workedExampleLevel === 'light' ||
    args.workedExampleLevel === 'moderate' ||
    args.workedExampleLevel === 'heavy'
      ? args.workedExampleLevel
      : 'moderate';

  if (level === 'none') return 0;
  if (length === 'minimal') return 1;
  if (length === 'compact') return level === 'heavy' ? 2 : 1;
  if (length === 'extended') return level === 'heavy' ? 4 : level === 'moderate' ? 2 : 1;
  return level === 'heavy' ? 3 : 1;
}

export function formatImageNotebookDensityPolicyForPrompt(
  policy: ImageNotebookDensityPolicy,
): string {
  return [
    `Length/density profile: ${policy.label} (${policy.pageRangeText}).`,
    `Teaching mode: ${policy.planningMode}`,
    `Per-page density limits: ${policy.minFocusRegions}-${policy.maxFocusRegions} broad parent regions; no more than ${policy.maxKeyPoints} keyPoints, ${policy.maxMustShow} mustShow items, ${policy.maxFormulas} formulas, and ${policy.maxExampleSteps} worked/example steps per page.`,
    policy.maxDetailedExamples != null
      ? `Complete worked-example limit for this length: at most ${policy.maxDetailedExamples}.`
      : '',
    ...policy.contentRules.map((rule) => `- ${rule}`),
  ]
    .filter(Boolean)
    .join('\n');
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function textArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const v = text(item);
    if (!v) continue;
    out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}

function studentFacingText(value: string): string {
  return value
    .replace(/先让学生看到/g, '我们先看')
    .replace(/让学生看到/g, '我们先看')
    .replace(/让学生理解/g, '我们要理解')
    .replace(/让学生知道/g, '我们要知道')
    .replace(/让学生意识到/g, '注意到')
    .replace(/让学生发现/g, '我们来发现')
    .replace(/学生需要/g, '你需要')
    .replace(/本页旨在/g, '这一页我们要')
    .replace(/教学目标[:：]?/g, '目标：')
    .replace(/本页主线[:：]?/g, '这一页的路线：')
    .replace(/可迁移动作[:：]?/g, '做题动作：')
    .replace(/讲解重点[:：]?/g, '重点：')
    .replace(/\bTeacher move\b/gi, 'Classroom move')
    .replace(/\bPage role\b/gi, 'Page')
    .replace(/\bQA checklist\b/gi, 'Check')
    .replace(/\s+/g, ' ')
    .trim();
}

function studentFacingTextArray(value: unknown, limit: number): string[] {
  return textArray(value, limit).map(studentFacingText).filter(Boolean);
}

function numberInRange(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizePageRole(value: unknown, pageNumber: number): ImageNotebookPageRole {
  const raw = text(value).toLowerCase();
  if (
    raw === 'overview' ||
    raw === 'hook' ||
    raw === 'definition' ||
    raw === 'formula' ||
    raw === 'example' ||
    raw === 'proof' ||
    raw === 'strategy' ||
    raw === 'pitfalls' ||
    raw === 'summary'
  ) {
    return raw;
  }
  if (pageNumber <= 1) return 'overview';
  return 'definition';
}

function normalizeFocusRole(value: unknown): ImageNotebookFocusRole {
  const raw = text(value).toLowerCase();
  if (
    raw === 'opening' ||
    raw === 'setup' ||
    raw === 'formula' ||
    raw === 'example' ||
    raw === 'proof' ||
    raw === 'strategy' ||
    raw === 'pitfall' ||
    raw === 'takeaway' ||
    raw === 'visual'
  ) {
    return raw;
  }
  return 'visual';
}

export function defaultImageNotebookFocusRegions(outlineId: string): ImageNotebookFocusRegion[] {
  const safeId = outlineId || 'image-page';
  return [
    {
      id: `${safeId}-focus-opening`,
      label: '标题与入口问题',
      role: 'opening',
      left: 42,
      top: 24,
      width: 916,
      height: 76,
      order: 1,
    },
    {
      id: `${safeId}-focus-setup`,
      label: '左侧定义、已知或问题设置',
      role: 'setup',
      left: 54,
      top: 118,
      width: 430,
      height: 318,
      order: 2,
    },
    {
      id: `${safeId}-focus-example`,
      label: '右侧例题、图像或证明步骤',
      role: 'example',
      left: 516,
      top: 118,
      width: 430,
      height: 318,
      order: 3,
    },
    {
      id: `${safeId}-focus-takeaway`,
      label: '底部总结与下一步',
      role: 'takeaway',
      left: 60,
      top: 464,
      width: 880,
      height: 70,
      order: 4,
    },
  ];
}

function normalizeFocusRegions(value: unknown, outlineId: string): ImageNotebookFocusRegion[] {
  if (!Array.isArray(value)) return defaultImageNotebookFocusRegions(outlineId);
  const regions = value
    .map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const width = numberInRange(record.width, 80, IMAGE_NOTEBOOK_CANVAS_WIDTH, 220);
      const height = numberInRange(record.height, 40, IMAGE_NOTEBOOK_CANVAS_HEIGHT, 92);
      const left = numberInRange(record.left, 0, IMAGE_NOTEBOOK_CANVAS_WIDTH - width, 60);
      const top = numberInRange(record.top, 0, IMAGE_NOTEBOOK_CANVAS_HEIGHT - height, 100);
      return {
        id: text(record.id, `${outlineId || 'image-page'}-focus-${index + 1}`),
        label: text(record.label, `讲解区域 ${index + 1}`),
        role: normalizeFocusRole(record.role),
        left,
        top,
        width,
        height,
        order: numberInRange(record.order, 1, 20, index + 1),
      };
    })
    .filter((item): item is ImageNotebookFocusRegion => Boolean(item))
    .sort((a, b) => a.order - b.order)
    .slice(0, 6);
  return regions.length >= 3 ? regions : defaultImageNotebookFocusRegions(outlineId);
}

function normalizePromptComponentRole(value: unknown): ImageNotebookPromptComponentRole {
  const raw = text(value).toLowerCase();
  if (
    raw === 'header' ||
    raw === 'opening' ||
    raw === 'setup' ||
    raw === 'definition' ||
    raw === 'formula' ||
    raw === 'example' ||
    raw === 'proof' ||
    raw === 'strategy' ||
    raw === 'pitfall' ||
    raw === 'takeaway' ||
    raw === 'visual' ||
    raw === 'question' ||
    raw === 'decoration' ||
    raw === 'other'
  ) {
    return raw;
  }
  return 'other';
}

function normalizePromptLayoutSlot(value: unknown, index: number): ImageNotebookPromptLayoutSlot {
  const raw = text(value).toLowerCase();
  if (
    raw === 'top-full' ||
    raw === 'middle-left' ||
    raw === 'middle-center-left' ||
    raw === 'middle-center-right' ||
    raw === 'middle-right' ||
    raw === 'bottom-full' ||
    raw === 'free'
  ) {
    return raw;
  }
  if (index === 0) return 'top-full';
  if (index === 5) return 'bottom-full';
  return (['middle-left', 'middle-center-left', 'middle-center-right', 'middle-right'][
    (index - 1) % 4
  ] || 'free') as ImageNotebookPromptLayoutSlot;
}

function normalizeMarkerColorName(value: unknown): ImageNotebookMarkerColorName | undefined {
  const raw = text(value).toLowerCase();
  return IMAGE_NOTEBOOK_MARKER_COLOR_POOL.some((color) => color.name === raw)
    ? (raw as ImageNotebookMarkerColorName)
    : undefined;
}

function normalizePromptComponentPlans(
  value: unknown,
  outlineId: string,
): ImageNotebookPromptComponentPlan[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const components = value
    .map((item, index): ImageNotebookPromptComponentPlan | null => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const role = normalizePromptComponentRole(record.role);
      const label = text(record.label || record.title || record.name, `学习组件 ${index + 1}`);
      const visibleText = [
        ...studentFacingTextArray(record.visibleText, 8),
        ...studentFacingTextArray(record.content, 8),
      ].slice(0, 8);
      const formulas = studentFacingTextArray(record.formulas, 6);
      const markerColorName = normalizeMarkerColorName(
        record.markerColorName || record.markerColor,
      );
      const participatesInMask =
        record.participatesInMask === false || role === 'decoration' ? false : true;
      return {
        id: text(record.id, `${outlineId || 'image-page'}-component-${index + 1}`),
        label: studentFacingText(label),
        role,
        order: numberInRange(record.order, 1, 30, index + 1),
        layoutSlot: normalizePromptLayoutSlot(record.layoutSlot, index),
        ...(markerColorName ? { markerColorName } : {}),
        ...(typeof record.markerColorHex === 'string' && record.markerColorHex.trim()
          ? { markerColorHex: record.markerColorHex.trim() }
          : {}),
        visibleText,
        formulas,
        diagramPrompt:
          studentFacingText(text(record.diagramPrompt || record.visualPrompt)) || undefined,
        participatesInMask,
      };
    })
    .filter((item): item is ImageNotebookPromptComponentPlan => Boolean(item))
    .sort((a, b) => a.order - b.order)
    .slice(0, 8);
  return components.length ? components : undefined;
}

export function normalizeImageNotebookPageBrief(
  value: unknown,
  fallback: {
    outlineId: string;
    pageNumber: number;
    title: string;
    description?: string;
    keyPoints?: string[];
  },
): ImageNotebookPageBrief {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const visible =
    record.visibleContent && typeof record.visibleContent === 'object'
      ? (record.visibleContent as Record<string, unknown>)
      : {};
  const pageMove =
    record.pageMove && typeof record.pageMove === 'object'
      ? (record.pageMove as Record<string, unknown>)
      : {};
  return {
    outlineId: text(record.outlineId, fallback.outlineId),
    pageNumber: numberInRange(record.pageNumber, 1, 200, fallback.pageNumber),
    pageRole: normalizePageRole(record.pageRole, fallback.pageNumber),
    title: text(record.title, fallback.title),
    pageMove: {
      fromPrevious: text(pageMove.fromPrevious) || undefined,
      currentJob: text(pageMove.currentJob, fallback.description || fallback.title),
      toNext: text(pageMove.toNext) || undefined,
      callbackToSpine: text(pageMove.callbackToSpine) || undefined,
    },
    visualBrief: text(
      studentFacingText(text(record.visualBrief)),
      `把「${fallback.title}」画成一张清楚的课堂板书图，先给入口问题，再展开核心判断。`,
    ),
    visibleContent: {
      mustShow: studentFacingTextArray(visible.mustShow, 8).length
        ? studentFacingTextArray(visible.mustShow, 8)
        : (fallback.keyPoints || []).slice(0, 5).map(studentFacingText).filter(Boolean),
      formulas: studentFacingTextArray(visible.formulas, 6),
      exampleSteps: studentFacingTextArray(visible.exampleSteps, 8),
      commonPitfalls: studentFacingTextArray(visible.commonPitfalls, 5),
      bottomTakeaway: studentFacingText(text(visible.bottomTakeaway)) || undefined,
    },
    focusRegions: normalizeFocusRegions(record.focusRegions, fallback.outlineId),
    componentPlans: normalizePromptComponentPlans(
      record.componentPlans || record.components || record.learningComponents,
      fallback.outlineId,
    ),
    generationNotes: textArray(record.generationNotes, 6),
    qaChecklist: textArray(record.qaChecklist, 8),
  };
}

export function normalizeImageNotebookBriefPlan(
  value: unknown,
  fallbacks: Array<{
    outlineId: string;
    pageNumber: number;
    title: string;
    description?: string;
    keyPoints?: string[];
  }>,
  notebookTitle: string,
): ImageNotebookBriefPlan {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const rawSpine =
    record.courseSpine && typeof record.courseSpine === 'object'
      ? (record.courseSpine as Record<string, unknown>)
      : {};
  const rawBriefs = Array.isArray(record.pageBriefs) ? record.pageBriefs : [];
  const pageBriefs = fallbacks.map((fallback) => {
    const raw = rawBriefs.find((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
      const candidate = item as Record<string, unknown>;
      return text(candidate.outlineId) === fallback.outlineId;
    });
    return normalizeImageNotebookPageBrief(raw, fallback);
  });
  const acts = Array.isArray(rawSpine.acts)
    ? rawSpine.acts
        .map((item, index): ImageNotebookCourseSpineAct | null => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
          const act = item as Record<string, unknown>;
          return {
            id: text(act.id, `act-${index + 1}`),
            act:
              act.act === 'opening' ||
              act.act === 'development' ||
              act.act === 'practice' ||
              act.act === 'synthesis'
                ? act.act
                : index === 0
                  ? 'opening'
                  : 'development',
            title: text(act.title, notebookTitle),
            purpose: text(act.purpose, notebookTitle),
            pages: Array.isArray(act.pages)
              ? act.pages
                  .map((page) => Number(page))
                  .filter((page) => Number.isFinite(page) && page > 0)
                  .slice(0, 60)
              : pageBriefs.map((brief) => brief.pageNumber),
            keyQuestion: text(act.keyQuestion) || undefined,
          } satisfies ImageNotebookCourseSpineAct;
        })
        .filter((item): item is ImageNotebookCourseSpineAct => Boolean(item))
    : [];
  return {
    courseSpine: {
      logline: text(rawSpine.logline, notebookTitle),
      centralQuestion: text(rawSpine.centralQuestion, notebookTitle),
      acts:
        acts.length > 0
          ? acts
          : [
              {
                id: 'act-main',
                act: 'development',
                title: notebookTitle,
                purpose: '沿着 notebook 页面顺序建立可迁移的判断方法。',
                pages: pageBriefs.map((brief) => brief.pageNumber),
                keyQuestion: pageBriefs[0]?.pageMove.currentJob,
              },
            ],
      closingCallback: text(rawSpine.closingCallback, '回到本节主问题，整理成可执行检查表。'),
    },
    pageBriefs,
  };
}

export function formatImageNotebookBriefForPrompt(brief: ImageNotebookPageBrief): string {
  const lines = [
    `Page role: ${brief.pageRole}`,
    'Student-facing live board rule: write what the learner should see now, not teacher planning notes.',
    'Forbidden visible labels: 让学生看到, 教学目标, 本页主线, 可迁移动作, 讲解重点, Teacher move, Page role, QA checklist.',
    `Previous page bridge, for planning only: ${
      brief.pageMove.fromPrevious || 'start this page cleanly'
    }`,
    `Current classroom job, for planning only: ${brief.pageMove.currentJob}`,
    `Transition to next page, for planning only: ${
      brief.pageMove.toNext || 'close with the next question'
    }`,
    '',
    'Exact student-visible board content to preserve:',
    ...brief.visibleContent.mustShow.map((item, index) => `${index + 1}. ${item}`),
    brief.visibleContent.formulas.length
      ? `Formulas / symbols that must be written exactly: ${brief.visibleContent.formulas.join('; ')}`
      : '',
    brief.visibleContent.exampleSteps.length
      ? `Worked-example / proof steps: ${brief.visibleContent.exampleSteps.join(' -> ')}`
      : '',
    brief.visibleContent.commonPitfalls.length
      ? `Common pitfalls to show or warn about: ${brief.visibleContent.commonPitfalls.join('; ')}`
      : '',
    brief.visibleContent.bottomTakeaway
      ? `Bottom takeaway: ${brief.visibleContent.bottomTakeaway}`
      : '',
    '',
    `Visual brief: ${brief.visualBrief}`,
    brief.focusRegions.length
      ? `Broad regions to visually support: ${brief.focusRegions
          .map((region) => `${region.order}. ${region.label}`)
          .join('; ')}`
      : '',
    brief.generationNotes?.length
      ? `Extra generation notes: ${brief.generationNotes.join('; ')}`
      : '',
    brief.qaChecklist?.length ? `QA checklist: ${brief.qaChecklist.join('; ')}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}
