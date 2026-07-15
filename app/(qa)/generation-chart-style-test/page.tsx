'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Loader2,
  Presentation,
  RefreshCw,
  Save,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getApiHeaders } from '@/lib/create/generation-headers';
import { backendFetch } from '@/lib/utils/backend-api';
import { formatComputeCreditsLabel, formatUsdLabel } from '@/lib/utils/credits';
import { loadTestResult, saveTestResult } from '@/lib/utils/test-results';
import { cn } from '@/lib/utils';

const TEST_RESULT_ID = 'html-ppt-chart-showcase';
const TEST_RESULT_KEY = 'ab-state-v9';
const LEGACY_STORAGE_KEY = 'syntara:chart-style-ab-test:v9';
const CHART_TEST_MODEL = 'gpt-5.4';
const SLIDE_PREVIEW_WIDTH = 1600;
const SLIDE_PREVIEW_HEIGHT = 900;

const CHART_TEST_DENSITY_CONTRACT = [
  'Layout stability recipe for this 1600x900 chart slide:',
  '- Build a fixed slide stage, then reserve rows before drawing content: header row, main visual row, bottom insight row.',
  '- Use .slide-content { position:absolute; inset:64px 72px; display:grid; grid-template-rows:168px minmax(0,1fr) 88px; gap:24px; overflow:hidden; box-sizing:border-box; } or an equivalent normal-flow grid.',
  '- Header row: exact headline and at most one short context line. H1 must be 46-54px with line-height 1.06-1.12. If the headline wraps to two lines, omit the context line instead of clipping text.',
  '- Main row: put the chart and KPI rail here only. Use min-height:0 and overflow:hidden on the main grid, with 24px gaps.',
  '- Bottom row: one full-width insight strip, max 88px high. It is a normal grid row, never absolute, and the main chart must stop above it.',
  '- All semantic sections, cards, KPI rails, chart cards, and takeaway strips must be normal grid/flex children. Do not use absolute/fixed/sticky positioning for them.',
  '- Use absolute positioning only for tiny labels/dots inside a bounded chart plotting area.',
  '- If two components compete for space, keep the title, one hero visual, three supporting numbers, and one takeaway. Delete secondary panels before shrinking text.',
  '- Use box-sizing:border-box, min-width:0, min-height:0, and wrapping text. Text boxes must not rely on clipping to fit.',
].join('\n');

const CHART_TEST_DOMAIN_CONTRACT = [
  'Domain lock:',
  '- This is a product analytics/business readout, not a computer-science lesson.',
  '- Never use CS teaching widgets or labels such as Graph Trace, BFS, DFS, frontier, visited, dictionary-diagram, memory diagram, class inheritance, parent/child nodes, code trace, or algorithm trace.',
  '- Words like graph/chart/queue/code tasks are product metrics here. Treat them as analytics labels, not CS algorithms.',
].join('\n');

const BASELINE_LAYOUT_RECIPE = [
  'Baseline layout recipe:',
  '- Use a conservative business dashboard composition. Conservative means stable and readable, not empty or visually weak.',
  '- Header: left-aligned exact headline. Add a decision-context sentence only when it fits below the headline without clipping.',
  '- Main: two-column grid, about 66% / 34%. Left column is one large chart card. Right column is a compact vertical KPI rail.',
  '- Chart card internal grid: chart title/readout header, plot area, and one short interpretation line. The plot area must be visually filled by the chart, not mostly blank.',
  '- KPI rail: render no more than three numeric blocks. If supporting category data is useful, fold it into one small microbar group inside the rail, not a separate panel.',
  '- Footer: one full-width action/insight strip with a short label and one sentence.',
  '- Keep corners, borders, and fills quiet. The baseline should be clean and scannable rather than ambitious.',
].join('\n');

const BASELINE_CHART_RECIPE = [
  'Baseline chart fidelity contract:',
  '- If the prompt gives chart values, the baseline must draw a real visible chart. Do not leave a large empty plotting area.',
  '- For line/trend data, use inline SVG with a visible polyline/path connecting every data point, plus small point markers and compact axis labels.',
  '- For bar/funnel data, draw visible bars with proportional lengths and labels.',
  '- The chart should fill roughly 70%-85% of its plot card width and 55%-70% of its plot card height.',
  '- For narrow percentage ranges, use a local honest axis domain so movement is legible. For 68-76, use about 66-78.',
  '- Labels and readout text must be normal-flow children inside the chart card and must not overlap the plot.',
].join('\n');

const UPGRADED_LAYOUT_RECIPE = [
  'Upgraded chart-story layout recipe:',
  '- Use an editorial analytics composition, but keep the same reserved rows as the stability recipe.',
  '- Header: exact headline and one compact context line only. Do not put KPI badges in the header.',
  '- Main: hero-chart-first grid, about 72% / 28%. Left column is one large chart card. Right column is a compact evidence rail.',
  '- Hero chart card internal grid: chart title/readout header, plot area, and one short chart interpretation line. The interpretation line is inside the chart card, in normal flow, not a floating callout.',
  '- Evidence rail: exactly three metric tiles. Each tile may include a tiny meaning phrase, but no tile may become a paragraph. Do not create a second full chart panel.',
  '- Hero chart: show exact values, one highlighted decisive point, and at most one tiny in-plot annotation. The plotted shape must visibly encode the movement, not only place labels on a flat line.',
  '- For trend charts with a narrow value range, choose an honest local axis domain such as 66-78 so the slope is visible without exaggerating the data.',
  '- Footer: one dark or high-contrast action insight strip. It must sit below the main grid and never overlap the chart.',
  '- Use whitespace and typography to improve the story, not extra cards.',
].join('\n');

const UPGRADED_STORY_RECIPE = [
  'Upgraded content planning contract:',
  '- Preserve four story slots in this order: decision context, chart readout, evidence rail, action insight.',
  '- Decision context: one sentence under the title, max 90 Chinese characters, explaining what decision this slide supports.',
  '- Chart readout: one sentence in the chart card, max 70 Chinese characters, explaining the movement and why it matters.',
  '- Evidence rail: three metrics only; each metric gets value + unit + one short meaning phrase, max 18 Chinese characters.',
  '- Action insight: synthesize the takeaway into a Chinese action sentence, max 48 Chinese characters. Do not merely repeat the English takeaway string.',
  '- If space is tight, shorten adjectives and labels. Do not delete the chart readout or the action insight.',
].join('\n');

type Variant = 'baseline' | 'upgraded';

type TokenUsage = {
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
  totalTokens?: number | null;
};

type HtmlCostEstimate = {
  baseUsd?: number | null;
  retailUsd?: number | null;
  computeCredits?: number | null;
  markupMultiplier?: number | null;
  source?: string;
};

type GenerateHtmlPptResponse = {
  success?: boolean;
  html?: string;
  model?: string;
  usage?: TokenUsage | null;
  costEstimate?: HtmlCostEstimate | null;
  generationAttempts?: number;
  skippedCreditCharge?: boolean;
  error?: string;
};

type HtmlMetrics = {
  htmlLength: number;
  textNodeCount: number;
  elementCount: number;
  svgCount: number;
  tableCount: number;
  mathCount: number;
  chartSignalCount: number;
  visibleCharCount: number;
};

type StoredRun = {
  id: string;
  createdAt: number;
  variant: Variant;
  prompt: string;
  model?: string;
  html: string;
  metrics: HtmlMetrics;
  usage?: TokenUsage | null;
  costEstimate?: HtmlCostEstimate | null;
  generationAttempts?: number;
  skippedCreditCharge?: boolean;
};

type StoredPair = {
  id: string;
  createdAt: number;
  topicId: string;
  topicLabel: string;
  baselinePrompt: string;
  upgradedPrompt: string;
  baseline?: StoredRun;
  upgraded?: StoredRun;
};

type StoredError = {
  createdAt: number;
  topicId: string;
  variant?: Variant;
  message: string;
};

type SavedState = {
  activeTopicId?: string;
  baselinePrompt?: string;
  upgradedPrompt?: string;
  pairs?: StoredPair[];
  errors?: StoredError[];
};

type TopicPreset = {
  id: string;
  label: string;
  topic: string;
  baselinePrompt: string;
  upgradedPrompt: string;
};

function buildBaselinePrompt(input: {
  topic: string;
  audience: string;
  content: string;
  visualNotes: string;
  layoutRecipe?: string;
}) {
  return `Create one 16:9 HTML/CSS PowerPoint-style slide.

Topic: ${input.topic}
Audience: ${input.audience}
Canvas: exactly 1600x900, no page scroll, all visible text must stay inside the slide.

${CHART_TEST_DOMAIN_CONTRACT}

${CHART_TEST_DENSITY_CONTRACT}

${input.layoutRecipe || BASELINE_LAYOUT_RECIPE}

${BASELINE_CHART_RECIPE}

Content and data:
${input.content}

Visual direction:
- Follow the layout recipe exactly.
- Keep the design clean and readable, but do not over-optimize for editorial storytelling.
- Use ordinary HTML/CSS/SVG only. Do not use external libraries.
- Avoid decorative imagery and avoid complex chart annotation.
- Conservative baseline still needs a clear, correct chart and a complete decision flow.
- Prefer deleting secondary detail over reducing spacing or overlapping panels.
${input.visualNotes}`;
}

function buildUpgradedPrompt(input: {
  topic: string;
  audience: string;
  content: string;
  visualNotes: string;
  layoutRecipe?: string;
}) {
  return `Create one 16:9 HTML/CSS PowerPoint-style slide.

Topic: ${input.topic}
Audience: ${input.audience}
Canvas: exactly 1600x900, no page scroll, all visible text must stay inside the slide.

${CHART_TEST_DOMAIN_CONTRACT}

${CHART_TEST_DENSITY_CONTRACT}

${input.layoutRecipe || UPGRADED_LAYOUT_RECIPE}

${UPGRADED_STORY_RECIPE}

Content and data:
${input.content}

Visual direction:
- Borrow the slide-deck-generator approach: handcrafted browser deck, strong typography, real data, one chart-first story.
- Make the main chart the hero visual, not a generic dashboard card.
- Use SVG or pure HTML/CSS charts, not screenshots and not external libraries.
- Use a restrained editorial analytics style: strong hierarchy, generous whitespace, tight labels, and clear annotation.
- Add axis hints, exact values, and a highlighted final or decisive data point where relevant.
- Keep visible copy concise and make the takeaway feel like an insight, not a label.
- The upgraded slide must not become a hollow pretty chart. Keep the chart readout and the metric meaning phrases visible.
- If the hero chart needs more space, remove secondary details. Never add another panel underneath or over the chart.
${input.visualNotes}`;
}

const PROMPT_PRESETS: TopicPreset[] = [
  {
    id: 'learning-health',
    label: '学习健康图表',
    topic: 'AI Tutor Learning Health Dashboard',
    baselinePrompt: buildBaselinePrompt({
      topic: 'AI Tutor Learning Health Dashboard',
      audience: 'product, curriculum, and learning operations leads',
      content: `- Headline: Learning health is improving, but practice depth is uneven
- Decision context: overall learning health is rising, but practice depth and feedback speed still need attention
- Main KPI: Mastery rate 76%, +6.2 pts vs last month
- Supporting KPIs: active learners 12,840; avg help-to-solve time 4.8 min; review queue 69 items
- Main chart: 7-day mastery trend with exact values 68, 69, 71, 72, 73, 75, 76
- Chart readout: mastery rose from 68% to 76%, with the strongest lift at the end of the week
- Takeaway: growth is strongest where feedback loops are shorter`,
      visualNotes: '- Use blue as the main accent and green only for positive change.',
      layoutRecipe: [
        BASELINE_LAYOUT_RECIPE,
        'Topic-specific fit:',
        '- Draw the main trend as a real visible inline SVG line chart, using y-axis 66% to 78%.',
        '- Connect all seven values 68, 69, 71, 72, 73, 75, 76 with a blue polyline and visible point markers.',
        '- The right KPI rail has exactly three blocks: active learners, avg help-to-solve time, and review queue.',
        '- Do not create a queue-mix card, category breakdown, or any fourth rail block.',
        '- The line chart card should occupy the left column, include one short chart readout under the plot, and leave at least 24px of clear space above the footer strip.',
      ].join('\n'),
    }),
    upgradedPrompt: buildUpgradedPrompt({
      topic: 'AI Tutor Learning Health Dashboard',
      audience: 'product, curriculum, and learning operations leads',
      content: `- Headline: Learning health is improving, but practice depth is uneven
- Decision context: overall learning health is rising, but uneven practice depth means the team should inspect feedback speed and backlog pressure
- Main KPI: Mastery rate 76%, +6.2 pts vs last month
- Supporting KPIs: active learners 12,840; avg help-to-solve time 4.8 min; review queue 69 items
- Main chart: 7-day mastery trend with exact values 68, 69, 71, 72, 73, 75, 76
- Chart readout: mastery rose from 68% to 76%, and the final two days show the strongest lift
- Metric meanings: active learners show sample scale; help-to-solve time shows feedback speed; review queue shows remaining friction
- Action insight: prioritize shortening help-to-solve and review loops so growth becomes deeper practice`,
      visualNotes:
        '- Avoid card clutter. Let the trend line carry the story, but keep one compact explanation of why the trend matters.',
      layoutRecipe: [
        UPGRADED_LAYOUT_RECIPE,
        'Topic-specific fit:',
        '- The hero trend line is the only large chart. It should use the full left column and stop above the footer.',
        '- The chart card must include a short readout sentence about 68% to 76% and the final two-day lift.',
        '- Use a local y-axis range around 66% to 78% so the 68 to 76 movement is visibly readable.',
        '- The right evidence rail has exactly three blocks: mastery rate, active learners, and feedback/backlog combined in one compact block.',
        '- Do not create a queue-mix card, category breakdown, or a fourth rail block.',
        '- The footer action insight should be in Chinese and should explain the next operational move, not just repeat the English takeaway.',
      ].join('\n'),
    }),
  },
  {
    id: 'cohort-funnel',
    label: '漏斗转化',
    topic: 'From Upload to Study Session',
    baselinePrompt: buildBaselinePrompt({
      topic: 'From Upload to Study Session',
      audience: 'education product and growth team',
      content: `- Headline: The biggest drop happens before first practice
- Funnel values: Upload PDF 100%, Extract concepts 82%, Generate notebook 71%, Start practice 46%, Finish review 31%
- Supporting side metric for the KPI rail: median generation time 2m 14s, p90 4m 40s
- Diagnosis: activation depends on the first practice prompt`,
      visualNotes: '- A basic funnel or horizontal bar chart is enough for the baseline.',
      layoutRecipe: [
        BASELINE_LAYOUT_RECIPE,
        'Topic-specific fit:',
        '- Left chart card is one horizontal funnel/bar sequence with five stages.',
        '- Right KPI rail contains only the generation time pair and the diagnosis summary.',
      ].join('\n'),
    }),
    upgradedPrompt: buildUpgradedPrompt({
      topic: 'From Upload to Study Session',
      audience: 'education product and growth team',
      content: `- Headline: The biggest drop happens before first practice
- Decision context: the team needs to know where the onboarding path loses learners before study begins
- Funnel values: Upload PDF 100%, Extract concepts 82%, Generate notebook 71%, Start practice 46%, Finish review 31%
- Supporting side metric for the evidence rail: median generation time 2m 14s, p90 4m 40s
- Chart readout: the largest drop is from generated notebook 71% to start practice 46%
- Diagnosis: activation depends on the first practice prompt
- Action insight: move the first practice prompt earlier and make it feel immediately useful`,
      visualNotes:
        '- Make the funnel the hero visual and visually isolate the drop from Generate notebook to Start practice.',
      layoutRecipe: [
        UPGRADED_LAYOUT_RECIPE,
        'Topic-specific fit:',
        '- Hero visual is one large horizontal funnel. Highlight only the drop from Generate notebook to Start practice.',
        '- The chart card must include one readout sentence naming the 71% to 46% drop.',
        '- Evidence rail contains the median/p90 time pair and one short diagnosis note.',
        '- Do not create extra step cards below the funnel. Put the next move only in the footer strip.',
      ].join('\n'),
    }),
  },
  {
    id: 'small-multiples',
    label: '小倍数图',
    topic: 'Three learning loops behave differently',
    baselinePrompt: buildBaselinePrompt({
      topic: 'Three learning loops behave differently',
      audience: 'curriculum operations leads',
      content: `- Headline: Feedback speed changes learning behavior
- Decision context: compare learning loops to decide where faster feedback changes practice behavior
- Small multiple line chart values:
  1. Algebra hints: 62, 65, 69, 73, 78
  2. Proof grading: 54, 55, 56, 58, 61
  3. Coding practice: 48, 52, 59, 66, 74
- Chart readout: Coding practice improves fastest after immediate feedback ships
- Action insight: reuse the immediate-feedback pattern in slower loops before adding new content`,
      visualNotes: '- A simple 3-column layout is enough for the baseline.',
      layoutRecipe: [
        'Baseline layout recipe:',
        '- Header: exact headline plus one short context sentence.',
        '- Main: three equal chart cards in one row. Each card contains one compact line chart with the same y-axis scale.',
        '- Footer: one full-width comparison strip.',
        '- Do not add a side rail, KPI card stack, or second row of cards.',
      ].join('\n'),
    }),
    upgradedPrompt: buildUpgradedPrompt({
      topic: 'Three learning loops behave differently',
      audience: 'curriculum operations leads',
      content: `- Headline: Feedback speed changes learning behavior
- Small multiple line chart values:
  1. Algebra hints: 62, 65, 69, 73, 78
  2. Proof grading: 54, 55, 56, 58, 61
  3. Coding practice: 48, 52, 59, 66, 74
- Comparison sentence: Coding practice improves fastest after immediate feedback ships`,
      visualNotes:
        '- Use aligned small multiples with identical scale and call out the fastest-improving series.',
      layoutRecipe: [
        'Upgraded small-multiple chart-story layout recipe:',
        '- Header: exact headline, one compact context line, and no KPI badge.',
        '- Main: three equal chart cards in one row, aligned to a shared y-axis scale and identical plot size.',
        '- Each chart card gets only one tiny label and the same scale; put the comparison readout in the footer, not a fourth card.',
        '- Use one visual emphasis on Coding practice, but do not add floating callout boxes.',
        '- Footer: one full-width takeaway strip below the three charts.',
        '- Do not add sidebars, extra metrics, or a second row.',
      ].join('\n'),
    }),
  },
];

function emptySavedState(): Required<SavedState> {
  const preset = PROMPT_PRESETS[0];
  return {
    activeTopicId: preset.id,
    baselinePrompt: preset.baselinePrompt,
    upgradedPrompt: preset.upgradedPrompt,
    pairs: [],
    errors: [],
  };
}

function hashText(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function stripHtmlForText(html: string): string {
  return html
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' chart ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function analyzeHtml(html: string): HtmlMetrics {
  const visibleText = stripHtmlForText(html);
  return {
    htmlLength: html.length,
    textNodeCount: visibleText ? visibleText.split(/[。.!?！？]|\s{2,}/).filter(Boolean).length : 0,
    elementCount: html.match(/<[a-z][\w:-]*(?:\s|>)/gi)?.length || 0,
    svgCount: html.match(/<svg(?:\s|>)/gi)?.length || 0,
    tableCount: html.match(/<table(?:\s|>)/gi)?.length || 0,
    mathCount: html.match(/<math(?:\s|>)/gi)?.length || 0,
    chartSignalCount:
      html.match(/\b(chart|graph|axis|trend|bar|line|funnel|sparkline|kpi|metric)\b/gi)?.length ||
      0,
    visibleCharCount: visibleText.length,
  };
}

function readLocalSavedState(): Required<SavedState> {
  if (typeof window === 'undefined') return emptySavedState();
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return emptySavedState();
    const parsed = JSON.parse(raw) as SavedState;
    const fallback = emptySavedState();
    return {
      activeTopicId:
        typeof parsed.activeTopicId === 'string' ? parsed.activeTopicId : fallback.activeTopicId,
      baselinePrompt:
        typeof parsed.baselinePrompt === 'string' ? parsed.baselinePrompt : fallback.baselinePrompt,
      upgradedPrompt:
        typeof parsed.upgradedPrompt === 'string' ? parsed.upgradedPrompt : fallback.upgradedPrompt,
      pairs: Array.isArray(parsed.pairs) ? parsed.pairs : [],
      errors: Array.isArray(parsed.errors) ? parsed.errors : [],
    };
  } catch {
    return emptySavedState();
  }
}

function writeLocalSavedState(state: SavedState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    LEGACY_STORAGE_KEY,
    JSON.stringify({
      activeTopicId: state.activeTopicId,
      baselinePrompt: state.baselinePrompt,
      upgradedPrompt: state.upgradedPrompt,
      pairs: (state.pairs || []).slice(0, 10),
      errors: (state.errors || []).slice(0, 20),
    }),
  );
}

function summarizeSavedState(state: SavedState) {
  const pairs = state.pairs || [];
  const errors = state.errors || [];
  const generatedRuns = pairs.reduce(
    (count, pair) => count + (pair.baseline ? 1 : 0) + (pair.upgraded ? 1 : 0),
    0,
  );
  const timestamps = [
    ...pairs.map((pair) => pair.createdAt),
    ...errors.map((error) => error.createdAt),
  ];
  return {
    generatedCount: generatedRuns,
    pairCount: pairs.length,
    errorCount: errors.length,
    lastUpdatedAt: timestamps.length > 0 ? Math.max(...timestamps) : null,
  };
}

function formatTime(value: number | string | null | undefined): string {
  if (!value) return '暂无';
  const timestamp = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(timestamp)) return '暂无';
  return new Date(timestamp).toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toSafeInt(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function formatUsageLabel(usage: TokenUsage | null | undefined): string | null {
  const inputTokens = toSafeInt(usage?.inputTokens);
  const outputTokens = toSafeInt(usage?.outputTokens);
  const totalTokens = toSafeInt(usage?.totalTokens ?? inputTokens + outputTokens);
  if (inputTokens <= 0 && outputTokens <= 0 && totalTokens <= 0) return null;
  return `${totalTokens.toLocaleString()} tokens`;
}

function formatCostLabel(costEstimate: HtmlCostEstimate | null | undefined): string {
  if (!costEstimate) return '费用待估算';
  const credits = toSafeInt(costEstimate.computeCredits);
  const usd = typeof costEstimate.retailUsd === 'number' ? costEstimate.retailUsd : 0;
  return `${formatComputeCreditsLabel(credits)} · ${formatUsdLabel(usd)}`;
}

function getChartTestHeaders(): HeadersInit {
  const headers = new Headers(
    getApiHeaders({
      imageGenerationEnabled: false,
      modelIdOverride: CHART_TEST_MODEL,
    }),
  );
  headers.set('x-generation-test-no-charge', 'true');
  return headers;
}

function metricRows(upgradedMetrics: HtmlMetrics | null, baselineMetrics: HtmlMetrics | null) {
  return [
    { label: 'HTML 长度', key: 'htmlLength' },
    { label: '可见字符', key: 'visibleCharCount' },
    { label: '元素数', key: 'elementCount' },
    { label: 'SVG', key: 'svgCount' },
    { label: 'Table', key: 'tableCount' },
    { label: 'MathML', key: 'mathCount' },
    { label: '图表信号', key: 'chartSignalCount' },
  ].map((row) => ({
    label: row.label,
    upgradedValue: upgradedMetrics?.[row.key as keyof HtmlMetrics] ?? 0,
    baselineValue: baselineMetrics?.[row.key as keyof HtmlMetrics] ?? 0,
  }));
}

function ScaledSlidePreview({ html, title }: { html: string; title: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.35);

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;

    const updateScale = () => {
      const rect = element.getBoundingClientRect();
      const nextScale = Math.min(
        rect.width / SLIDE_PREVIEW_WIDTH,
        rect.height / SLIDE_PREVIEW_HEIGHT,
      );
      setScale(Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 0.35);
    };

    updateScale();
    const animationFrame = window.requestAnimationFrame(updateScale);
    const observer = new ResizeObserver(updateScale);
    observer.observe(element);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, [html]);

  return (
    <div
      ref={frameRef}
      className="relative aspect-video w-full max-w-full overflow-hidden rounded-md border border-slate-200 bg-white"
    >
      <iframe
        key={hashText(html)}
        title={title}
        srcDoc={html}
        className="absolute left-0 top-0 border-0 bg-white"
        style={{
          width: SLIDE_PREVIEW_WIDTH,
          height: SLIDE_PREVIEW_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      />
    </div>
  );
}

function EmptyPreview({
  icon,
  title,
  description,
}: {
  icon: 'baseline' | 'upgraded';
  title: string;
  description: string;
}) {
  return (
    <div className="aspect-video w-full max-w-full overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="flex size-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-slate-500">
        <BarChart3
          className={cn('size-10', icon === 'upgraded' ? 'text-blue-300' : 'text-slate-300')}
        />
        <div>
          <div className="font-medium text-slate-600">{title}</div>
          <div className="mt-1 text-xs text-slate-400">{description}</div>
        </div>
      </div>
    </div>
  );
}

export default function GenerationChartStyleTestPage() {
  const [activeTopicId, setActiveTopicId] = useState(PROMPT_PRESETS[0].id);
  const activePreset =
    PROMPT_PRESETS.find((preset) => preset.id === activeTopicId) || PROMPT_PRESETS[0];
  const [baselinePrompt, setBaselinePrompt] = useState(activePreset.baselinePrompt);
  const [upgradedPrompt, setUpgradedPrompt] = useState(activePreset.upgradedPrompt);
  const [isGenerating, setIsGenerating] = useState<Variant | 'pair' | null>(null);
  const [error, setError] = useState('');
  const [dbStatus, setDbStatus] = useState<'loading' | 'ready' | 'fallback'>('loading');
  const [dbMessage, setDbMessage] = useState('正在读取 A/B 测试缓存');
  const [pairs, setPairs] = useState<StoredPair[]>([]);
  const [errors, setErrors] = useState<StoredError[]>([]);
  const [activePair, setActivePair] = useState<StoredPair | null>(null);

  const currentPair = activePair;
  const baselineRun = currentPair?.baseline || null;
  const upgradedRun = currentPair?.upgraded || null;
  const comparisonRows = useMemo(
    () => metricRows(upgradedRun?.metrics || null, baselineRun?.metrics || null),
    [baselineRun?.metrics, upgradedRun?.metrics],
  );
  const baselineUsage = formatUsageLabel(baselineRun?.usage);
  const upgradedUsage = formatUsageLabel(upgradedRun?.usage);

  const persistState = useCallback(async (next: SavedState) => {
    writeLocalSavedState(next);
    try {
      await saveTestResult({
        testId: TEST_RESULT_ID,
        resultKey: TEST_RESULT_KEY,
        status: 'saved',
        title: '图表叙事 PPT A/B 视觉测试',
        summary: summarizeSavedState(next),
        payload: next,
      });
      setDbStatus('ready');
      setDbMessage('已保存到浏览器本地测试库，可在测试中心统计');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setDbStatus('fallback');
      setDbMessage(`浏览器本地测试库保存失败，已保留页面缓存：${message}`);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const local = readLocalSavedState();
      try {
        const row = await loadTestResult<SavedState>({
          testId: TEST_RESULT_ID,
          resultKey: TEST_RESULT_KEY,
        });
        if (cancelled) return;
        const payload = row?.payload || local;
        const nextState = {
          ...emptySavedState(),
          ...payload,
          pairs: Array.isArray(payload.pairs) ? payload.pairs : [],
          errors: Array.isArray(payload.errors) ? payload.errors : [],
        };
        setActiveTopicId(nextState.activeTopicId);
        setBaselinePrompt(nextState.baselinePrompt);
        setUpgradedPrompt(nextState.upgradedPrompt);
        setPairs(nextState.pairs);
        setErrors(nextState.errors);
        setActivePair(nextState.pairs[0] || null);
        setDbStatus('ready');
        setDbMessage('已读取 A/B 测试缓存');
      } catch (caught) {
        if (cancelled) return;
        setActiveTopicId(local.activeTopicId);
        setBaselinePrompt(local.baselinePrompt);
        setUpgradedPrompt(local.upgradedPrompt);
        setPairs(local.pairs);
        setErrors(local.errors);
        setActivePair(local.pairs[0] || null);
        const message = caught instanceof Error ? caught.message : String(caught);
        setDbStatus('fallback');
        setDbMessage(`浏览器本地测试库读取失败，已使用页面缓存：${message}`);
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  const savePageState = useCallback(
    async (nextPairs: StoredPair[], nextErrors: StoredError[] = errors) => {
      await persistState({
        activeTopicId,
        baselinePrompt,
        upgradedPrompt,
        pairs: nextPairs,
        errors: nextErrors,
      });
    },
    [activeTopicId, baselinePrompt, errors, persistState, upgradedPrompt],
  );

  const selectPreset = useCallback(
    (preset: TopicPreset) => {
      setActiveTopicId(preset.id);
      setBaselinePrompt(preset.baselinePrompt);
      setUpgradedPrompt(preset.upgradedPrompt);
      setError('');
      const matchedPair = pairs.find((pair) => pair.topicId === preset.id) || null;
      setActivePair(matchedPair);
      void persistState({
        activeTopicId: preset.id,
        baselinePrompt: preset.baselinePrompt,
        upgradedPrompt: preset.upgradedPrompt,
        pairs,
        errors,
      });
    },
    [errors, pairs, persistState],
  );

  const generateRun = useCallback(async (variant: Variant, prompt: string): Promise<StoredRun> => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) throw new Error('Prompt 不能为空');

    const response = await backendFetch('/api/generate/html-ppt-slide', {
      method: 'POST',
      headers: getChartTestHeaders(),
      body: JSON.stringify({
        prompt: trimmedPrompt,
        courseRoute: 'business',
        pageKind: 'analysis',
        densityContract: CHART_TEST_DENSITY_CONTRACT,
        qualityFeedback:
          'Previous chart test outputs failed in three ways: some versions clipped/overlapped layout, later versions became too thin and lost content planning, and one baseline rendered a weak/empty trend plot. Use the prompt layout recipe: reserve a taller header/main/footer grid first, keep one hero visual plus a compact rail, draw a real visible chart for any supplied chart values, and preserve decision context, chart readout, evidence rail, and action insight without adding extra panels.',
      }),
    });
    const data = (await response.json().catch(() => ({}))) as GenerateHtmlPptResponse;
    if (!response.ok || !data.success || !data.html) {
      throw new Error(data.error || `图表 PPT 生成失败：HTTP ${response.status}`);
    }

    return {
      id: `${variant}-${Date.now()}`,
      createdAt: Date.now(),
      variant,
      prompt: trimmedPrompt,
      model: data.model,
      html: data.html,
      metrics: analyzeHtml(data.html),
      usage: data.usage ?? null,
      costEstimate: data.costEstimate ?? null,
      generationAttempts: data.generationAttempts,
      skippedCreditCharge: data.skippedCreditCharge,
    };
  }, []);

  const upsertPair = useCallback(
    async (nextPair: StoredPair, nextErrors: StoredError[] = errors) => {
      const nextPairs = [nextPair, ...pairs.filter((pair) => pair.id !== nextPair.id)].slice(0, 10);
      setPairs(nextPairs);
      setActivePair(nextPair);
      await persistState({
        activeTopicId,
        baselinePrompt,
        upgradedPrompt,
        pairs: nextPairs,
        errors: nextErrors,
      });
    },
    [activeTopicId, baselinePrompt, errors, pairs, persistState, upgradedPrompt],
  );

  const handleGeneratePair = useCallback(async () => {
    if (isGenerating) return;
    setError('');
    const pairId = `${activeTopicId}-${Date.now()}`;
    let nextPair: StoredPair = {
      id: pairId,
      createdAt: Date.now(),
      topicId: activeTopicId,
      topicLabel: activePreset.topic,
      baselinePrompt,
      upgradedPrompt,
    };
    setActivePair(nextPair);

    try {
      setIsGenerating('baseline');
      const baseline = await generateRun('baseline', baselinePrompt);
      nextPair = { ...nextPair, baseline, createdAt: Date.now() };
      setActivePair(nextPair);

      setIsGenerating('upgraded');
      const upgraded = await generateRun('upgraded', upgradedPrompt);
      nextPair = { ...nextPair, upgraded, createdAt: Date.now() };
      await upsertPair(nextPair);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      const nextErrors = [
        { createdAt: Date.now(), topicId: activeTopicId, message },
        ...errors,
      ].slice(0, 20);
      setError(message);
      setErrors(nextErrors);
      await upsertPair(nextPair, nextErrors);
    } finally {
      setIsGenerating(null);
    }
  }, [
    activePreset.topic,
    activeTopicId,
    baselinePrompt,
    errors,
    generateRun,
    isGenerating,
    upgradedPrompt,
    upsertPair,
  ]);

  const handleGenerateOne = useCallback(
    async (variant: Variant) => {
      if (isGenerating) return;
      setError('');
      const existing =
        activePair && activePair.topicId === activeTopicId
          ? activePair
          : {
              id: `${activeTopicId}-${Date.now()}`,
              createdAt: Date.now(),
              topicId: activeTopicId,
              topicLabel: activePreset.topic,
              baselinePrompt,
              upgradedPrompt,
            };

      try {
        setIsGenerating(variant);
        const run = await generateRun(
          variant,
          variant === 'baseline' ? baselinePrompt : upgradedPrompt,
        );
        const nextPair = {
          ...existing,
          baselinePrompt,
          upgradedPrompt,
          createdAt: Date.now(),
          [variant]: run,
        };
        await upsertPair(nextPair);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        const nextErrors = [
          { createdAt: Date.now(), topicId: activeTopicId, variant, message },
          ...errors,
        ].slice(0, 20);
        setError(message);
        setErrors(nextErrors);
        await savePageState(pairs, nextErrors);
      } finally {
        setIsGenerating(null);
      }
    },
    [
      activePair,
      activePreset.topic,
      activeTopicId,
      baselinePrompt,
      errors,
      generateRun,
      isGenerating,
      pairs,
      savePageState,
      upgradedPrompt,
      upsertPair,
    ],
  );

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-950">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4 px-5 py-5">
        <div className="flex w-full min-w-0 items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/test?surface=slides">
              <ArrowLeft className="size-4" />
              返回所有测试
            </Link>
          </Button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant="outline">主题 {activePreset.label}</Badge>
            <Badge variant={pairs.length > 0 ? 'secondary' : 'outline'}>
              A/B 记录 {pairs.length}
            </Badge>
            {errors.length > 0 ? <Badge variant="destructive">失败 {errors.length}</Badge> : null}
          </div>
        </div>

        <header className="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                <BarChart3 className="size-4" />
                Chart Story A/B QA
              </div>
              <div className="mt-1 flex flex-wrap items-end gap-x-4 gap-y-2">
                <h1 className="text-2xl font-semibold tracking-normal">图表样式探索测试</h1>
                <p className="max-w-4xl text-sm leading-6 text-slate-600">
                  旧版单页链路作为主线，新图表叙事 prompt 只作为同主题实验对照。
                </p>
              </div>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2 xl:justify-end">
              <Badge variant="default" className="w-fit">
                旧线路为主
              </Badge>
              <Badge variant="secondary" className="w-fit">
                默认模型 {CHART_TEST_MODEL}
              </Badge>
              <Badge
                variant={
                  dbStatus === 'ready'
                    ? 'outline'
                    : dbStatus === 'loading'
                      ? 'secondary'
                      : 'destructive'
                }
                className="max-w-2xl justify-start whitespace-normal rounded-md text-left"
              >
                <Save className="size-3.5" />
                {dbMessage}
              </Badge>
            </div>
          </div>
        </header>

        <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 shadow-sm">
          当前结论：旧线路继续作为默认生成路径；右侧新版 prompt 只用于探索可吸收的图表表达技巧，
          不作为替换方案。
        </section>

        <section className="w-full min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                旧线路主线 + 新 prompt 实验
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                左侧是主线基线，右侧只验证新提示词能否产生可吸收的图表表达。
              </p>
            </div>
            <Button
              type="button"
              onClick={() => void handleGeneratePair()}
              disabled={Boolean(isGenerating)}
            >
              {isGenerating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <BarChart3 className="size-4" />
              )}
              {isGenerating ? '生成中' : '生成基线与实验版'}
            </Button>
          </div>

          <div className="mt-4 grid w-full min-w-0 gap-4 2xl:grid-cols-2">
            <div className="min-w-0 max-w-full rounded-lg border border-slate-200 bg-slate-100 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">旧版基线 prompt</h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {baselineRun
                      ? `${baselineRun.model || 'unknown'} · ${formatTime(baselineRun.createdAt)}`
                      : '等待生成'}
                  </p>
                </div>
                <Badge variant="outline">old prompt</Badge>
              </div>
              {isGenerating === 'baseline' ? (
                <div className="aspect-video w-full max-w-full overflow-hidden rounded-md border border-slate-200 bg-white">
                  <div className="flex size-full flex-col items-center justify-center gap-3 text-sm text-slate-500">
                    <Loader2 className="size-8 animate-spin text-slate-500" />
                    正在生成旧版基线
                  </div>
                </div>
              ) : baselineRun ? (
                <ScaledSlidePreview html={baselineRun.html} title="baseline prompt slide" />
              ) : (
                <EmptyPreview
                  icon="baseline"
                  title="还没有旧版基线 slide"
                  description="点击生成两张，或只生成旧版。"
                />
              )}
            </div>

            <div className="min-w-0 max-w-full rounded-lg border border-blue-200 bg-blue-50/60 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">新图表叙事 prompt</h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {upgradedRun
                      ? `${upgradedRun.model || 'unknown'} · ${formatTime(upgradedRun.createdAt)}`
                      : '等待生成'}
                  </p>
                </div>
                <Badge variant="secondary">experiment</Badge>
              </div>
              {isGenerating === 'upgraded' ? (
                <div className="aspect-video w-full max-w-full overflow-hidden rounded-md border border-slate-200 bg-white">
                  <div className="flex size-full flex-col items-center justify-center gap-3 text-sm text-slate-500">
                    <Loader2 className="size-8 animate-spin text-blue-700" />
                    正在生成新图表叙事版
                  </div>
                </div>
              ) : upgradedRun ? (
                <ScaledSlidePreview html={upgradedRun.html} title="upgraded chart story slide" />
              ) : (
                <EmptyPreview
                  icon="upgraded"
                  title="还没有新图表叙事 slide"
                  description="点击生成两张，或只生成新版。"
                />
              )}
            </div>
          </div>
        </section>

        <section className="grid w-full min-w-0 gap-4 xl:grid-cols-2">
          <div className="w-full min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Presentation className="size-4 text-slate-500" />
                旧版基线 prompt
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleGenerateOne('baseline')}
                disabled={Boolean(isGenerating)}
              >
                {isGenerating === 'baseline' ? <Loader2 className="size-4 animate-spin" /> : null}
                只生成旧版
              </Button>
            </div>
            <Textarea
              value={baselinePrompt}
              onChange={(event) => setBaselinePrompt(event.target.value)}
              className="mt-3 min-h-[300px] w-full min-w-0 max-w-full resize-y rounded-lg border-slate-200 font-mono text-xs leading-5"
            />
          </div>

          <div className="w-full min-w-0 overflow-hidden rounded-xl border border-blue-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <BarChart3 className="size-4 text-blue-700" />
                新图表叙事 prompt
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleGenerateOne('upgraded')}
                disabled={Boolean(isGenerating)}
              >
                {isGenerating === 'upgraded' ? <Loader2 className="size-4 animate-spin" /> : null}
                只生成新版
              </Button>
            </div>
            <Textarea
              value={upgradedPrompt}
              onChange={(event) => setUpgradedPrompt(event.target.value)}
              className="mt-3 min-h-[300px] w-full min-w-0 max-w-full resize-y rounded-lg border-blue-200 font-mono text-xs leading-5"
            />
          </div>
        </section>

        <section className="grid w-full min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="w-full min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">量化对比</h2>
                <p className="mt-1 text-xs text-slate-500">
                  指标只做辅助，最终还是看同主题两张 slide 的叙事和视觉质量。
                </p>
              </div>
            </div>
            <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">指标</th>
                    <th className="px-3 py-2 text-right font-medium">新版</th>
                    <th className="px-3 py-2 text-right font-medium">旧版</th>
                    <th className="px-3 py-2 text-right font-medium">变化</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {comparisonRows.map((row) => {
                    const delta = row.upgradedValue - row.baselineValue;
                    return (
                      <tr key={row.label}>
                        <td className="px-3 py-2 text-slate-600">{row.label}</td>
                        <td className="px-3 py-2 text-right font-medium text-slate-900">
                          {row.upgradedValue.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-slate-900">
                          {row.baselineValue.toLocaleString()}
                        </td>
                        <td
                          className={cn(
                            'px-3 py-2 text-right font-semibold',
                            delta > 0
                              ? 'text-emerald-700'
                              : delta < 0
                                ? 'text-rose-700'
                                : 'text-slate-500',
                          )}
                        >
                          {delta > 0 ? '+' : ''}
                          {delta.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {error ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-700">
                <AlertTriangle className="mr-1 inline size-4" />
                {error}
              </div>
            ) : null}
          </div>

          <aside className="grid w-full min-w-0 gap-4">
            <section className="w-full min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">主题预设</h2>
              <div className="mt-3 grid gap-2">
                {PROMPT_PRESETS.map((preset) => (
                  <Button
                    key={preset.id}
                    type="button"
                    variant={preset.id === activeTopicId ? 'default' : 'outline'}
                    className="justify-start"
                    onClick={() => selectPreset(preset)}
                    disabled={Boolean(isGenerating)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                className="mt-3 w-full"
                onClick={() => selectPreset(activePreset)}
                disabled={Boolean(isGenerating)}
              >
                <RefreshCw className="size-4" />
                恢复当前主题默认 prompt
              </Button>
            </section>

            {currentPair ? (
              <section className="w-full min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Save className="size-4 text-emerald-600" />
                  当前 A/B 摘要
                </div>
                <div className="mt-3 grid gap-2 text-sm">
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="text-xs text-slate-500">主题</div>
                    <div className="mt-0.5 font-medium text-slate-900">
                      {currentPair.topicLabel}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="text-xs text-slate-500">旧版费用</div>
                    <div className="mt-0.5 font-medium text-slate-900">
                      {formatCostLabel(baselineRun?.costEstimate)}
                    </div>
                    {baselineUsage ? (
                      <div className="mt-0.5 text-xs text-slate-500">{baselineUsage}</div>
                    ) : null}
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="text-xs text-slate-500">新版费用</div>
                    <div className="mt-0.5 font-medium text-slate-900">
                      {formatCostLabel(upgradedRun?.costEstimate)}
                    </div>
                    {upgradedUsage ? (
                      <div className="mt-0.5 text-xs text-slate-500">{upgradedUsage}</div>
                    ) : null}
                  </div>
                  {baselineRun?.skippedCreditCharge || upgradedRun?.skippedCreditCharge ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800">
                      <CheckCircle2 className="mr-1 inline size-3.5" />
                      测试页跳过本地积分扣费。
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}

            {pairs.length > 0 ? (
              <section className="w-full min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-900">最近 A/B 记录</h2>
                <div className="mt-3 grid gap-2">
                  {pairs.slice(0, 5).map((pair) => (
                    <button
                      key={pair.id}
                      type="button"
                      aria-pressed={currentPair?.id === pair.id}
                      onClick={() => {
                        setActiveTopicId(pair.topicId);
                        setBaselinePrompt(pair.baselinePrompt);
                        setUpgradedPrompt(pair.upgradedPrompt);
                        setActivePair(pair);
                        setError('');
                      }}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-left text-sm transition',
                        currentPair?.id === pair.id
                          ? 'border-blue-300 bg-blue-50 ring-1 ring-blue-200'
                          : 'border-transparent bg-slate-50 hover:border-slate-200 hover:bg-white',
                      )}
                    >
                      <div className="truncate font-medium text-slate-900">{pair.topicLabel}</div>
                      <div className="mt-0.5 truncate text-xs text-slate-500">
                        {formatTime(pair.createdAt)} · 旧版 {pair.baseline ? '已生成' : '缺失'} ·
                        新版 {pair.upgraded ? '已生成' : '缺失'}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </aside>
        </section>
      </div>
    </main>
  );
}
