'use client';

import type * as React from 'react';
import { ImageIcon, ListChecks, Sparkles } from 'lucide-react';
import type { NotebookGenerationQueueTask } from '@/lib/store/notebook-generation-queue';
import type { OrchestratorWorkedExampleLevel } from '@/lib/store/orchestrator-notebook-generation';
import type { ImageMapping, PdfImage, SceneOutline } from '@/lib/types/generation';
import type { Scene } from '@/lib/types/stage';
import {
  formatImageNotebookStyleBriefForPrompt,
  type ImageNotebookBriefPlan,
  type ImageNotebookPageBrief,
  type ImageNotebookQaResult,
  type ImageNotebookStyleBrief,
} from '@/lib/generation/image-notebook-quality';

const MAX_SOURCE_FILE_SIZE_MB = 50;
const MAX_SOURCE_FILE_SIZE_BYTES = MAX_SOURCE_FILE_SIZE_MB * 1024 * 1024;

type WorkspaceStep = 'input' | 'materials' | 'outline' | 'style' | 'result';
type PlanningPhase = 'course-spine' | 'page-brief';
type PlanningMockStreams = Partial<Record<PlanningPhase, string | null>>;
type PlanningMockPhaseState =
  | 'input'
  | 'connecting'
  | 'spine-loading'
  | 'index-loading'
  | 'index-first-page'
  | 'done';
type PlanningMockPhaseStates = Partial<Record<PlanningPhase, PlanningMockPhaseState>>;
type MaterialKind = '目录' | '公式' | '图片' | '代码';

const PLANNING_MOCK_STATE_LABELS: Record<PlanningMockPhaseState, string> = {
  input: '确认 input',
  connecting: '连接中',
  'spine-loading': '主线生成中',
  'index-loading': '索引生成中',
  'index-first-page': '首张索引已出',
  done: '生成结束',
};

const PLANNING_MOCK_STATE_OPTIONS: Array<{
  state: PlanningMockPhaseState;
  label: string;
  helper: string;
}> = [
  { state: 'input', label: '确认 input', helper: '只看左侧输入' },
  { state: 'connecting', label: '连接中', helper: '左右都还没有内容' },
  { state: 'spine-loading', label: '主线生成中', helper: '左侧主线生成，右侧等待索引' },
  { state: 'index-loading', label: '索引生成中', helper: '主线已出，每页条目 loading' },
  { state: 'index-first-page', label: '首张索引已出', helper: '第 1 页已出，后续继续 loading' },
  { state: 'done', label: '生成结束', helper: '显示完整结构化结果' },
];

type FormState = {
  sourceFile: File | null;
  requirement: string;
};

type MaterialRow = {
  id: string;
  title: string;
  detail: string;
  kind: MaterialKind;
  keep: boolean;
};

type ExtractedSourceItem = {
  id: string;
  title: string;
  detail: string;
  kind: '文本' | '图片' | '目标';
};

type ExtractedSourceImage = {
  id: string;
  title: string;
  url: string;
  copyCount: number;
};

type ExtractedSourcePreviewBase = {
  items: ExtractedSourceItem[];
  imageCount: number;
  imagePreviews: ExtractedSourceImage[];
  imageDuplicateCount: number;
  warnings: string[];
};

type ExtractedSourcePreview =
  | ({ status: 'idle' | 'loading' | 'ready' } & ExtractedSourcePreviewBase)
  | ({ status: 'error'; message: string } & ExtractedSourcePreviewBase);

type SourceGenerationExtract = {
  text: string;
  pdfImages: PdfImage[];
  imageMapping: ImageMapping;
};

type PreparedSourceInput = {
  preview: ExtractedSourcePreview;
  extract: SourceGenerationExtract;
  selectedImageIds: string[];
};

type OutlineRow = {
  id: string;
  title: string;
  focus: string;
};

type ImageGenerationTileStatus = 'done' | 'generating' | 'waiting';
type ImageGenerationMockPageCount = 5 | 10 | 20;

type OutlineGenerationStatus = 'idle' | 'loading' | 'ready' | 'error';

type StyleSampleStatus = 'idle' | 'loading' | 'ready' | 'error';

type StyleSample = {
  imageUrl: string;
  prompt: string;
  key: string;
  width?: number;
  height?: number;
  providerId?: string;
  modelId?: string;
  qa?: ImageNotebookQaResult;
  briefPageCount?: number;
  speechCount?: number;
  focusCount?: number;
  sceneTitle?: string;
  generatedAt: number;
};

type ImageNotebookBriefsResponse = {
  success?: boolean;
  plan?: ImageNotebookBriefPlan;
  error?: string;
};

type NotebookPageContentResponse = {
  success?: boolean;
  contentBundle?: {
    contents?: unknown[];
    effectiveOutlines?: SceneOutline[];
    imageNotebookQaByOutlineId?: Record<string, ImageNotebookQaResult>;
  };
  actionsResult?: {
    scenes?: Scene[];
    effectiveOutlines?: SceneOutline[];
    previousSpeeches?: string[];
  };
  image?: {
    imageUrl?: string;
    imagePrompt?: string;
    providerId?: string;
    modelId?: string;
  };
  error?: string;
};

const IMAGE_GENERATION_STATUS_LABELS: Record<ImageGenerationTileStatus, string> = {
  done: '已完成',
  generating: '正在生成',
  waiting: '等待中',
};

const IMAGE_GENERATION_PROCESS_FRAMES = [
  '/images/create-notebook/generation-card/generating-frame-notes.png',
  '/images/create-notebook/generation-card/generating-frame-diagram.png',
  '/images/create-notebook/generation-card/generating-frame-graph.png',
  '/images/create-notebook/generation-card/generating-frame-quiz.png',
];
const MAX_PARALLEL_IMAGE_GENERATION_TILES = 5;

function getMockImageGenerationTileStatus(index: number, total: number): ImageGenerationTileStatus {
  if (index < Math.min(total, MAX_PARALLEL_IMAGE_GENERATION_TILES)) return 'generating';
  return 'waiting';
}

function getImageGenerationTileStatus({
  index,
  total,
  mockEnabled,
  busy,
  task,
  hasGeneratedThumbnail = false,
}: {
  index: number;
  total: number;
  mockEnabled: boolean;
  busy: boolean;
  task?: NotebookGenerationQueueTask | null;
  hasGeneratedThumbnail?: boolean;
}): ImageGenerationTileStatus {
  if (mockEnabled) return getMockImageGenerationTileStatus(index, total);
  if (task?.status === 'completed') return hasGeneratedThumbnail ? 'done' : 'waiting';
  if (task?.status === 'running') {
    const progress = task.progress;
    if (progress?.stage === 'completed') return hasGeneratedThumbnail ? 'done' : 'waiting';
    if (progress?.stage === 'scene') {
      const completedCount = Math.max(0, Math.min(total, progress.completed));
      if (index < completedCount) return hasGeneratedThumbnail ? 'done' : 'generating';
      if (index < Math.min(total, completedCount + MAX_PARALLEL_IMAGE_GENERATION_TILES)) {
        return 'generating';
      }
      return 'waiting';
    }
    if (progress?.stage === 'image-prep') {
      return index < Math.min(total, MAX_PARALLEL_IMAGE_GENERATION_TILES)
        ? 'generating'
        : 'waiting';
    }
  }
  if (busy)
    return index < Math.min(total, MAX_PARALLEL_IMAGE_GENERATION_TILES) ? 'generating' : 'waiting';
  return 'waiting';
}

function getGeneratedPageThumbnailUrl(
  task: NotebookGenerationQueueTask | null | undefined,
  index: number,
): string {
  const pageNumber = index + 1;
  return task?.generatedPageThumbnails?.[pageNumber] || '';
}

function imageGenerationGridClassName(): string {
  return 'grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2';
}

function imageGenerationTilePaddingClassName(): string {
  return 'p-2';
}

function imageGenerationTitleClassName(): string {
  return 'text-[11px]';
}

function imageGenerationFocusClassName(): string {
  return 'text-[9px] leading-snug';
}

function ImageGenerationCardProcessPreview({
  index,
  status,
}: {
  index: number;
  status: ImageGenerationTileStatus;
}) {
  if (status === 'done') return null;

  if (status === 'waiting') {
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,#f8fafc_0%,#ffffff_48%,#f1f5f9_100%)]" />
        <div className="absolute left-6 right-6 top-7 aspect-video rounded-md border border-dashed border-slate-200 bg-white/55 shadow-inner">
          <div className="flex h-full flex-col justify-center gap-1.5 px-4">
            {[58, 78, 42].map((width, lineIndex) => (
              <span
                key={lineIndex}
                className="h-1 rounded-full bg-slate-200/70"
                style={{ width: `${width}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const frameOffsetSeconds = index * 0.42;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,#dbeafe_0%,#ffffff_42%,#bfdbfe_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(37,99,235,0.06)_1px,transparent_1px),linear-gradient(180deg,rgba(37,99,235,0.06)_1px,transparent_1px)] bg-[size:18px_18px]" />
      <div className="absolute inset-1 overflow-hidden rounded-lg border border-white/85 bg-white shadow-sm shadow-blue-950/12">
        {IMAGE_GENERATION_PROCESS_FRAMES.map((src, frameIndex) => (
          <img
            key={src}
            src={src}
            alt=""
            className="generation-process-frame absolute inset-0 size-full object-cover"
            style={{
              animationDelay: `${-(frameIndex * 1.4 + frameOffsetSeconds)}s`,
            }}
          />
        ))}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(219,234,254,0.18)_46%,rgba(15,23,42,0.42)_100%)]" />
      </div>
      <div className="generation-process-sweep absolute -inset-y-8 -left-1/2 w-1/2 rotate-12 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.58)_50%,transparent_100%)]" />
    </div>
  );
}

type ImageNotebookPlanQualityReport = {
  passed: boolean;
  minPageCount?: number;
  maxPageCount?: number;
  findings?: string[];
  blockedPhrases?: string[];
  retryCount?: number;
};

type ImageNotebookPageIndexPreview = {
  pageNumber: number;
  pageRole: string;
  title: string;
  archetype?: string;
  currentJob?: string;
  keyPoints?: string[];
  sourceKnowledgePoints?: string[];
  exactContentNeeded?: string[];
};

type PagePlanningPreview = {
  id: string;
  pageNumber: number;
  title: string;
  pageRole?: string;
  fromPrevious?: string;
  currentJob: string;
  toNext?: string;
  visualBrief?: string;
  mustShow: string[];
  formulas: string[];
  exampleSteps: string[];
  commonPitfalls: string[];
  bottomTakeaway?: string;
  drawingPrompt?: string;
  markerComponents: string[];
  markerCount: number;
  promptHash?: string;
  focusRegions: string[];
  focusCount: number;
  batchLabel?: string;
  status: 'indexed' | 'planned';
};

type ImageNotebookPlanStreamEvent =
  | { type: 'status'; detail: string }
  | {
      type: 'draft';
      phase: 'blueprint' | 'batch';
      detail?: string;
      text?: string;
      batchIndex?: number;
      pageNumbers?: number[];
      attempt?: number;
    }
  | {
      type: 'blueprint';
      courseSpine?: ImageNotebookBriefPlan['courseSpine'];
      pageIndex?: ImageNotebookPageIndexPreview[];
      quality?: ImageNotebookPlanQualityReport;
      attempt?: number;
    }
  | {
      type: 'batch-start';
      batchIndex?: number;
      batchCount?: number;
      pageNumbers?: number[];
      startPage?: number;
      endPage?: number;
      attempt?: number;
    }
  | {
      type: 'pages';
      batchIndex?: number;
      batchCount?: number;
      pageNumbers?: number[];
      startPage?: number;
      endPage?: number;
      outlines?: SceneOutline[];
      pageBriefs?: ImageNotebookPageBrief[];
    }
  | { type: 'quality'; quality?: ImageNotebookPlanQualityReport }
  | {
      type: 'done';
      outlines?: SceneOutline[];
      plan?: ImageNotebookBriefPlan;
      plannerMode?: string;
      planBatchCount?: number;
      planQuality?: ImageNotebookPlanQualityReport;
      planQualityAttempts?: ImageNotebookPlanQualityReport[];
      model?: string;
    }
  | { type: 'error'; error?: string };

type WorkspaceProgressStep = {
  id: string;
  activeSteps: WorkspaceStep[];
  planningPhase?: PlanningPhase;
  planningPhases?: PlanningPhase[];
  label: string;
  icon: React.ElementType;
};

const WORKSPACE_PROGRESS_STEPS: WorkspaceProgressStep[] = [
  { id: 'input', activeSteps: ['input', 'materials'], label: '输入', icon: Sparkles },
  {
    id: 'planning',
    activeSteps: ['outline'],
    planningPhases: ['course-spine', 'page-brief'],
    label: '规划+prompt',
    icon: ListChecks,
  },
  { id: 'result', activeSteps: ['style', 'result'], label: '生图', icon: ImageIcon },
];

const PLANNING_PHASE_ORDER: PlanningPhase[] = ['course-spine', 'page-brief'];

function getWorkspaceProgressIndex(
  activeStep: WorkspaceStep,
  planningPhase: PlanningPhase,
): number {
  const index = WORKSPACE_PROGRESS_STEPS.findIndex((step) => {
    if (!step.activeSteps.includes(activeStep)) return false;
    if (activeStep === 'outline') {
      return (step.planningPhases || (step.planningPhase ? [step.planningPhase] : [])).includes(
        planningPhase,
      );
    }
    return !step.planningPhase;
  });
  return Math.max(index, 0);
}

function getWorkspaceProgressLabel(
  activeStep: WorkspaceStep,
  planningPhase: PlanningPhase,
): string {
  const step = WORKSPACE_PROGRESS_STEPS.find((item) => {
    if (!item.activeSteps.includes(activeStep)) return false;
    if (activeStep === 'outline') {
      return (item.planningPhases || (item.planningPhase ? [item.planningPhase] : [])).includes(
        planningPhase,
      );
    }
    return !item.planningPhase;
  });
  return step?.label ?? WORKSPACE_PROGRESS_STEPS[0]?.label ?? '输入';
}

const STYLE_OPTIONS = [
  {
    id: 'board',
    label: '手绘笔记',
    prompt:
      '高质感纸面手绘笔记：16:9 满画布铺开浅米白网格纸/横线纸，边缘有轻微纸张纤维和自然阴影；用深蓝/黑色手写笔画主内容，少量荧光笔只标关键公式、代码行或结论。构图像一页认真整理的课堂活页笔记：大标题、一个核心问题、一个主要推导/图解区域，留白充足，文字大而清楚。不要做网页卡片、PPT 模板、居中白框或密密麻麻的总结页。',
  },
  {
    id: 'clean',
    label: '卡通插画',
    prompt:
      '精致教育卡通图解：柔和浅色背景，圆润但干净的插画物件，少量有表情的学习道具或小角色只用于解释概念，不抢占知识内容。每页像一张高质量科普插画海报：上方一句学生视角问题，中间用 1 个主视觉隐喻解释知识点，下方配少量手写标注或公式。色彩明亮但克制，线条清爽，避免幼稚贴纸感、拥挤漫画格、随机装饰和不可读小字。',
  },
  {
    id: 'diagram',
    label: '极简线稿',
    prompt:
      '极简蓝图线稿：浅灰白纸面或淡蓝网格背景，使用细黑线/蓝线绘制结构图、流程箭头、坐标轴或代码执行轨迹，只用一种高饱和强调色标出当前步骤。画面像设计师画的教学解释图：一个中心图形贯穿全页，旁边最多 3 个短注释气泡，公式/代码保持大字号。避免空洞图标堆叠、企业流程图、过度留白导致内容太薄，也不要生成普通 HTML 卡片。',
  },
  {
    id: 'exam',
    label: '水彩图解',
    prompt:
      '水彩课堂图解：温和纸纹背景，使用浅蓝、薄荷绿、淡琥珀等透明水彩块面承托知识区域，再用深色墨线写公式、代码和箭头。整体像一本高级学习杂志里的手绘讲义：一个柔和主视觉、一个清楚例子/推导、少量高亮结论。水彩只做氛围和层次，不能降低文字对比度；避免模糊、脏色、过度装饰、照片感背景和小字号密集段落。',
  },
  {
    id: 'custom',
    label: '自定义',
    prompt: '',
  },
];

const PALETTES = [
  { id: 'blue-teal', label: '蓝绿', colors: ['#1d4ed8', '#0f766e', '#f8fafc'] },
  { id: 'ink-amber', label: '墨色琥珀', colors: ['#111827', '#d97706', '#f9fafb'] },
  { id: 'slate-cyan', label: '石板青', colors: ['#334155', '#0891b2', '#f1f5f9'] },
];

function stylePresetForOption(styleId: string): ImageNotebookStyleBrief['preset'] {
  if (styleId === 'clean') return 'cartoon-educational';
  if (styleId === 'diagram') return 'minimal-line-art';
  if (styleId === 'exam') return 'watercolor-explainer';
  if (styleId === 'custom') return 'custom';
  return 'hand-drawn-course-notebook';
}

function decorationLevelForStyle(
  styleId: string,
): ImageNotebookStyleBrief['decorationLevel'] {
  if (styleId === 'clean' || styleId === 'exam') return 'moderate';
  if (styleId === 'diagram') return 'light';
  if (styleId === 'custom') return 'light';
  return 'light';
}

function buildImageNotebookStyleBrief(args: {
  style: (typeof STYLE_OPTIONS)[number];
  customStylePrompt?: string;
  palette: (typeof PALETTES)[number];
  density?: ImageNotebookStyleBrief['density'];
}): ImageNotebookStyleBrief {
  const stylePrompt = compactPromptText(args.customStylePrompt || args.style.prompt, 900);
  return {
    schemaVersion: 1,
    preset: stylePresetForOption(args.style.id),
    canvas: '16:9',
    background:
      args.style.id === 'exam'
        ? 'warm textured paper with faint hand-drawn guide lines'
        : args.style.id === 'diagram'
          ? 'white or very pale blueprint grid background'
          : 'white graph-paper notebook background with faint light-gray grid',
    writingStyle:
      args.style.id === 'diagram'
        ? 'minimal hand-drawn line annotations with large formula/code labels'
        : 'common college-course hand-drawn marker notes with readable handwritten labels',
    colorMood:
      args.palette.id === 'ink-amber'
        ? 'black ink, muted amber accents, and soft gray support marks'
        : args.palette.id === 'slate-cyan'
          ? 'slate ink, muted cyan accents, and pale blue-gray fills'
          : 'black marker text, deep teal diagrams, pale teal fills, and muted brown arrows',
    density: args.density || 'medium',
    decorationLevel: decorationLevelForStyle(args.style.id),
    palette: {
      label: args.palette.label,
      colors: args.palette.colors,
    },
    ...(stylePrompt ? { userStylePrompt: stylePrompt } : {}),
    avoidPureMarkerColors: ['#ff0000', '#00ff00', '#0048ff', '#00ffff', '#ff00ff', '#ffff00'],
    ordinaryContentColorRule:
      'Do not use pure marker colors in normal content; reserve them only for recoverable corner markers.',
  };
}

function formatImageNotebookStyleBriefPreview(styleBrief: ImageNotebookStyleBrief): string {
  return formatImageNotebookStyleBriefForPrompt(styleBrief).join('\n');
}

const NOTEBOOK_IMAGE2_PROVIDER_ID = 'openai-image';
const NOTEBOOK_IMAGE2_MODEL_ID = 'gpt-image-2';

const IMAGE_FIRST_NOTEBOOK_STYLE_SPEC = [
  'Drawing style baseline:',
  '- Follow the selected drawing / illustration style first. The style may be cartoon, watercolor, line art, notebook handwriting, or another user-specified art direction.',
  '- Make this look like a finished educational illustration or illustrated notebook page for students, not a teacher handout, lesson plan, or frontend template.',
  '- Use a full-bleed 16:9 canvas whose background or illustration touches all four image edges.',
  '- Do not draw a centered paper/card/slide inside a larger canvas. No pillarboxing, letterboxing, white side bars, or outer frame.',
  '- Keep normal classroom padding for content, but never leave blank vertical columns on the left or right edges.',
  '- Use visual treatment consistent with the chosen art direction for titles, diagrams, highlights, characters, objects, and annotations.',
  '- The page should feel like one clear learning idea captured as a single bitmap image.',
  '- Keep a consistent course notebook feel: friendly, careful, readable, sparse, and projector-safe.',
  '- Use student-facing phrasing such as "我们先看", "你会先判断什么", "下一步怎么来"; avoid teacher-planning phrasing.',
  '- Never write visible meta labels like "让学生看到", "教学目标", "本页主线", "可迁移动作", "Teacher move", "Page role", or "QA checklist".',
  '- Avoid flat vector UI cards, generic corporate deck templates, stock-photo layouts, glossy gradients, browser chrome, app UI, and placeholder blocks.',
  '- Do not make an HTML/CSS-looking dashboard; do not put UI panels inside other panels.',
  '- Keep all formulas, code, and labels large enough to read at thumbnail size. Prefer 2-3 clear teaching regions over dense handout notes.',
].join('\n');

function normalizeExtractedText(text: string): string {
  return text
    .replace(/\u0000/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildExtractedTextItems(text: string, fallbackTitle = '正文片段'): ExtractedSourceItem[] {
  const normalized = normalizeExtractedText(text);
  if (!normalized) return [];
  const paragraphs = normalized
    .split(/\n{2,}|(?<=。|！|？)\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 8);
  const snippets = (paragraphs.length ? paragraphs : [normalized]).slice(0, 4);
  return snippets.map((snippet, index) => ({
    id: `text-${index}`,
    title: snippets.length === 1 ? fallbackTitle : `${fallbackTitle} ${index + 1}`,
    detail: snippet.length > 180 ? `${snippet.slice(0, 179).trimEnd()}…` : snippet,
    kind: '文本',
  }));
}

function buildRequirementPreview(requirement: string): ExtractedSourcePreview {
  const items = buildExtractedTextItems(requirement, '生成目标');
  return {
    status: 'ready',
    items:
      items.length > 0
        ? items.map((item) => ({ ...item, kind: '目标' as const }))
        : [
            {
              id: 'empty-requirement',
              title: '生成目标',
              detail: '尚未填写明确目标，将使用默认图片 notebook 生成要求。',
              kind: '目标',
            },
          ],
    imageCount: 0,
    imagePreviews: [],
    imageDuplicateCount: 0,
    warnings: [],
  };
}

function fingerprintImageUrl(url: string): string {
  let hash = 5381;
  for (let i = 0; i < url.length; i += 1) {
    hash = (hash * 33) ^ url.charCodeAt(i);
  }
  return `${url.length}:${hash >>> 0}:${url.slice(0, 48)}:${url.slice(-48)}`;
}

function buildImagePreviews(
  images: Array<{ id: string; src?: string; pageNumber?: number; description?: string }>,
  imageMapping: Record<string, string>,
): { imagePreviews: ExtractedSourceImage[]; duplicateCount: number } {
  const previewByFingerprint = new Map<
    string,
    {
      image: ExtractedSourceImage;
      pageNumbers: Set<number>;
    }
  >();
  let imageWithUrlCount = 0;

  images.forEach((image, index) => {
    const url = imageMapping[image.id] || image.src || '';
    if (!url) return;
    imageWithUrlCount += 1;

    const pageNumber = image.pageNumber || undefined;
    const isVisualRegion =
      image.id.startsWith('region_') || /visual region|图形区域/i.test(image.description || '');
    const regionIndex = image.id.match(/region_p\d+_(\d+)/)?.[1];
    const fingerprint = fingerprintImageUrl(url);
    const existing = previewByFingerprint.get(fingerprint);
    if (existing) {
      existing.image.copyCount += 1;
      if (pageNumber) existing.pageNumbers.add(pageNumber);
      return;
    }

    previewByFingerprint.set(fingerprint, {
      image: {
        id: image.id,
        title: pageNumber
          ? isVisualRegion
            ? `第 ${pageNumber} 页 · 图形 ${regionIndex || index + 1}`
            : `第 ${pageNumber} 页 · 图片`
          : `图片 ${index + 1}`,
        url,
        copyCount: 1,
      },
      pageNumbers: new Set(pageNumber ? [pageNumber] : []),
    });
  });

  const imagePreviews = Array.from(previewByFingerprint.values()).map((entry, index) => {
    const pages = Array.from(entry.pageNumbers).sort((a, b) => a - b);
    const titleKind = entry.image.title.includes('图形') ? '图形' : '图片';
    const baseTitle =
      pages.length > 1
        ? `第 ${pages[0]} 页等 ${pages.length} 页 · ${titleKind}`
        : entry.image.title.includes('·')
          ? entry.image.title
          : pages[0]
            ? `第 ${pages[0]} 页`
            : `图片 ${index + 1}`;
    return {
      ...entry.image,
      title: entry.image.copyCount > 1 ? `${baseTitle} · ${entry.image.copyCount} 处` : baseTitle,
    };
  });

  return {
    imagePreviews,
    duplicateCount: Math.max(0, imageWithUrlCount - imagePreviews.length),
  };
}

function isPdfSourceFile(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  const lower = file.name.toLowerCase();
  return mime === 'application/pdf' || lower.endsWith('.pdf');
}

function isMarkdownSourceFile(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  const lower = file.name.toLowerCase();
  return mime === 'text/markdown' || mime === 'text/x-markdown' || lower.endsWith('.md');
}

function isPptxSourceFile(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  const lower = file.name.toLowerCase();
  return (
    mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    lower.endsWith('.pptx')
  );
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(index === 0 ? 0 : value >= 10 ? 1 : 2)} ${units[index]}`;
}

function fileKindLabel(file: File | null): string {
  if (!file) return '文字需求';
  if (isPdfSourceFile(file)) return 'PDF';
  if (isPptxSourceFile(file)) return 'PPTX';
  if (isMarkdownSourceFile(file)) return 'Markdown';
  return '文档';
}

function buildMaterialRows(file: File | null, requirement: string): MaterialRow[] {
  const topic = requirement.trim() || file?.name.replace(/\.[^.]+$/, '') || '课堂主题';
  if (!file) {
    return [
      {
        id: 'text-requirement',
        title: '用户需求',
        detail: topic.length > 52 ? `${topic.slice(0, 52)}...` : topic,
        kind: '目录',
        keep: true,
      },
      {
        id: 'teacher-goal',
        title: '教学目标',
        detail: '围绕输入主题生成页面规划、画图 prompt 和整页图片 notebook。',
        kind: '图片',
        keep: true,
      },
    ];
  }

  const baseName = file.name.replace(/\.[^.]+$/, '');
  if (isMarkdownSourceFile(file)) {
    return [
      {
        id: 'md-body',
        title: '正文结构',
        detail: `${baseName} 的标题层级与段落内容`,
        kind: '目录',
        keep: true,
      },
      {
        id: 'md-code',
        title: '代码与公式',
        detail: '保留 Markdown 中的代码块、公式和列表结构',
        kind: '代码',
        keep: true,
      },
      {
        id: 'md-summary',
        title: '教学节奏',
        detail: '根据正文自动拆分 notebook 页面和讲解节奏',
        kind: '公式',
        keep: true,
      },
    ];
  }

  if (isPptxSourceFile(file)) {
    return [
      {
        id: 'pptx-slides',
        title: '原始页结构',
        detail: `${baseName} 的每页文字、备注和页面顺序`,
        kind: '目录',
        keep: true,
      },
      {
        id: 'pptx-images',
        title: '原资料图片',
        detail: '提取已有配图作为 image-ppt 的视觉参考',
        kind: '图片',
        keep: true,
      },
      {
        id: 'pptx-notes',
        title: '演讲者备注',
        detail: '将备注转成讲解动作和课堂口播线索',
        kind: '代码',
        keep: true,
      },
    ];
  }

  return [
    {
      id: 'pdf-pages',
      title: '页面文本',
      detail: `${baseName} 的主要正文与页码顺序`,
      kind: '目录',
      keep: true,
    },
    {
      id: 'pdf-formulas',
      title: '公式与图表',
      detail: '从正文中识别公式、图表和视觉结构作为页面规划依据',
      kind: '公式',
      keep: true,
    },
    {
      id: 'pdf-images',
      title: '页面图片',
      detail: '保留 PDF 中可提取的图片与自动裁出的图形区域',
      kind: '图片',
      keep: true,
    },
    {
      id: 'pdf-code',
      title: '代码片段',
      detail: '如果存在代码或伪代码，将作为单独讲解对象',
      kind: '代码',
      keep: true,
    },
  ];
}

function outlineLengthLabel(value: string): string {
  if (value === 'minimal') return '极简';
  if (value === 'compact') return '简短';
  if (value === 'extended') return '深入';
  return '中等';
}

function outlineLengthStrategyText(value: string): string {
  if (value === 'minimal') {
    return '5 页以下按 overview 生成：只讲清问题版图、路线选择和最后收束，不把完整课堂压进每页。';
  }
  if (value === 'compact') {
    return '10 页以下按 guided overview 生成：保留核心定义/方法和 1-2 个例题页，细节拆页，不做密集讲义。';
  }
  if (value === 'extended') {
    return '20 页以上按 deep walkthrough 生成：用更多页慢讲例题、证明、误区和迁移，但单页仍保持稀疏。';
  }
  return '10-20 页按 standard lesson 生成：定义、公式、例题、误区和总结分开推进，避免单页过载。';
}

function workedExampleLevelLabel(value: OrchestratorWorkedExampleLevel): string {
  if (value === 'none') return '无';
  if (value === 'light') return '少量';
  if (value === 'heavy') return '丰富';
  return '中等';
}

function compactPromptText(value: string | undefined, maxLength = 420): string {
  const text = (value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function studentFacingOutlineText(value: string | undefined): string {
  return (value || '')
    .replace(/先让学生看到/g, '我们先看')
    .replace(/让学生看到/g, '我们先看')
    .replace(/让学生理解/g, '我们要理解')
    .replace(/让学生知道/g, '我们要知道')
    .replace(/让学生意识到/g, '注意到')
    .replace(/让学生发现/g, '我们来发现')
    .replace(/学生需要/g, '你需要')
    .replace(/本页用于/g, '这一页我们用来')
    .replace(/本页旨在/g, '这一页我们要')
    .replace(/教学目标[:：]?/g, '目标：')
    .replace(/本页主线[:：]?/g, '这一页的路线：')
    .replace(/可迁移动作[:：]?/g, '做题动作：')
    .replace(/讲解重点[:：]?/g, '重点：')
    .replace(/建立本课主线/g, '看清这节课要解决的问题')
    .replace(/引出([^，。；;]*)动机/g, '先问为什么需要$1')
    .replace(
      /下一步是由哪个定义、假设或已证结论推出的？/g,
      '这一行为什么成立：用了哪个已知、定义，还是前一行结果？',
    )
    .replace(/\blet students see\b/gi, 'we first look at')
    .replace(/\bstudents should understand\b/gi, 'we need to understand')
    .replace(/\bthis page is used to\b/gi, 'on this page we')
    .replace(/\bthis page aims to\b/gi, 'on this page we')
    .replace(/\bteaching objective\b/gi, 'goal')
    .replace(/\blesson spine\b/gi, 'lesson question')
    .replace(/\blecture focus\b/gi, 'focus')
    .replace(/\btransferable action\b/gi, 'move to reuse')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildStyleSamplePrompt(args: {
  outline: OutlineRow;
  outlineIndex: number;
  totalOutlines: number;
  sourceFileName?: string;
  requirement: string;
  language: string;
  style: (typeof STYLE_OPTIONS)[number];
  customStylePrompt?: string;
  styleBrief?: ImageNotebookStyleBrief;
  palette: (typeof PALETTES)[number];
  sourceImages: ExtractedSourceImage[];
  includeQuizScenes: boolean;
  workedExampleLevel: OrchestratorWorkedExampleLevel;
}): string {
  const sourceHints = args.sourceImages
    .slice(0, 8)
    .map((image, index) => `${index + 1}. ${image.title}`)
    .join('\n');

  return [
    'Create one polished 16:9 classroom image-notebook page as a single bitmap image.',
    'This is the real style sample for an image-first notebook generator, not a UI mockup.',
    'The page must look like the final generated notebook page that a teacher can approve before full generation.',
    'Use the selected drawing style as the primary visual direction while keeping the page readable, sparse, and projector-safe.',
    '',
    IMAGE_FIRST_NOTEBOOK_STYLE_SPEC,
    '',
    `Visible text language: ${args.language}`,
    `Source file: ${args.sourceFileName || 'text-only requirement'}`,
    args.requirement ? `Teacher requirement: ${compactPromptText(args.requirement, 360)}` : '',
    `Quality-check page: ${args.outlineIndex + 1} of ${args.totalOutlines}`,
    `Page title: ${compactPromptText(args.outline.title, 160)}`,
    `Teaching focus: ${compactPromptText(args.outline.focus, 520)}`,
    'Planning-context labels above are NOT visible notebook-page headings. Do not copy labels like Teaching focus, Teacher requirement, or Source file onto the image.',
    '',
    `Drawing / illustration style preset: ${args.style.label}`,
    `Drawing style prompt: ${compactPromptText(args.customStylePrompt || args.style.prompt, 620)}`,
    args.styleBrief
      ? `Structured page style brief:\n${formatImageNotebookStyleBriefPreview(args.styleBrief)}`
      : '',
    `Color direction: ${args.palette.label}; use these colors as the core palette: ${args.palette.colors.join(', ')}`,
    `Worked examples: ${workedExampleLevelLabel(args.workedExampleLevel)}`,
    `Quiz/review pages enabled: ${args.includeQuizScenes ? 'yes' : 'no'}`,
    sourceHints ? `Useful extracted visual hints:\n${sourceHints}` : '',
    '',
    'Design requirements:',
    '- The image must be a single full-canvas 16:9 slide. The notebook/grid-paper background must reach the exact left, right, top, and bottom image edges.',
    '- Do not render a smaller white sheet, poster, card, or slide centered inside the image; no internal white side margins or black/white bars.',
    '- Use a strong handwritten-style title, one live question/setup area, and one clear visual or worked-example area.',
    '- The board should feel like the teacher is saying "look here first, now try this next", not like a complete after-class summary sheet.',
    '- Avoid overview grids, checklist-heavy layouts, and many boxed mini-sections. Do not draw more than 3 main parent regions unless the page is explicitly a summary.',
    '- Visible headings should be student-facing: "我们已知什么？", "先判断什么？", "下一步怎么来？", "试一试".',
    '- Do not write teacher-planning labels or sentences on the page: "让学生看到", "让学生理解", "教学目标", "本页主线", "可迁移动作", "讲解重点", "Page role", "Teacher move", "QA checklist".',
    '- Keep text large, sparse, and readable on a projector; avoid dense paragraphs and tiny labels.',
    '- If math, code, or diagrams appear, make them central and legible instead of decorative.',
    '- For math pages, show the problem, method choice, main formula/derivation, and final answer as separate hand-drawn regions.',
    '- For CS pages, show the concept/data shape, code or trace, and result/state as separate hand-drawn regions.',
    '- Use the selected palette, but keep enough contrast for classroom reading.',
    '- Do not include browser chrome, app UI, placeholder blocks, watermarks, logos, stock-photo clutter, plain corporate cards, or meta text about AI.',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildOutlineFocus(outline: SceneOutline): string {
  const lines = [
    outline.teachingObjective,
    outline.studentThinkingMove,
    outline.description,
    ...(outline.keyPoints || []).slice(0, 4),
  ]
    .map((item) => studentFacingOutlineText(item))
    .filter((item): item is string => Boolean(item));
  const uniqueLines = Array.from(new Set(lines));
  return uniqueLines.join('；') || '从本页标题出发，先提出一个学生要回答的问题。';
}

function sceneOutlinesToRows(outlines: SceneOutline[]): OutlineRow[] {
  return outlines.map((outline, index) => ({
    id: outline.id || `outline-${index + 1}`,
    title: outline.title?.trim() || `第 ${index + 1} 页`,
    focus: buildOutlineFocus(outline),
  }));
}

function outlineRowsToSceneOutlines(
  rows: OutlineRow[],
  language: 'zh-CN' | 'en-US',
): SceneOutline[] {
  return rows.map((row, index) => {
    const focusLines = row.focus
      .split(/\n|；|;|。|\./)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 5);
    return {
      id: row.id || `outline-${index + 1}`,
      type: 'slide',
      archetype: index === 0 ? 'intro' : index === rows.length - 1 ? 'summary' : 'concept',
      title: row.title.trim() || `第 ${index + 1} 页`,
      description: row.focus.trim() || '围绕本页标题组织一段清楚的课堂讲解。',
      keyPoints: focusLines.length ? focusLines : [row.focus.trim() || row.title.trim()],
      teachingObjective: row.focus.trim() || `讲清 ${row.title.trim() || `第 ${index + 1} 页`}`,
      studentThinkingMove: '先识别本页要解决的问题，再跟着例子、定义或证明步骤推进。',
      order: index + 1,
      language,
    };
  });
}

function attachImageNotebookPlanToOutlines(
  outlines: SceneOutline[],
  plan: ImageNotebookBriefPlan,
): SceneOutline[] {
  const briefByOutlineId = new Map(plan.pageBriefs.map((brief) => [brief.outlineId, brief]));
  return outlines.map((outline) => ({
    ...outline,
    imageNotebookCourseSpine: plan.courseSpine,
    imageNotebookBrief: briefByOutlineId.get(outline.id),
  }));
}

function pagePlanningPreviewsFromBlueprint(
  pageIndex: ImageNotebookPageIndexPreview[] | undefined,
): PagePlanningPreview[] {
  return (pageIndex || []).map((page, index) => ({
    id: `indexed-page-${page.pageNumber || index + 1}`,
    pageNumber: page.pageNumber || index + 1,
    title: page.title?.trim() || `第 ${index + 1} 页`,
    pageRole: page.pageRole,
    currentJob:
      page.currentJob?.trim() ||
      page.keyPoints?.filter(Boolean).slice(0, 3).join('；') ||
      '等待画图 prompt…',
    mustShow:
      page.sourceKnowledgePoints?.filter(Boolean).slice(0, 4) ||
      page.keyPoints?.filter(Boolean).slice(0, 4) ||
      [],
    formulas: [],
    exampleSteps:
      page.exactContentNeeded?.filter(Boolean).slice(0, 3) ||
      page.keyPoints?.filter(Boolean).slice(0, 3) ||
      [],
    commonPitfalls: [],
    markerComponents: [],
    markerCount: 0,
    focusRegions: [],
    focusCount: 0,
    status: 'indexed',
  }));
}

function pagePlanningPreviewsFromOutlines(
  outlines: SceneOutline[] | undefined,
  pageBriefs?: ImageNotebookPageBrief[],
  batchLabel?: string,
): PagePlanningPreview[] {
  const briefByOutlineId = new Map((pageBriefs || []).map((brief) => [brief.outlineId, brief]));
  return (outlines || []).map((outline, index) => {
    const brief = outline.imageNotebookBrief || briefByOutlineId.get(outline.id);
    const pageNumber = outline.order || brief?.pageNumber || index + 1;
    return {
      id: outline.id || `planned-page-${pageNumber}`,
      pageNumber,
      title: outline.title?.trim() || brief?.title || `第 ${pageNumber} 页`,
      pageRole: brief?.pageRole,
      currentJob:
        brief?.pageMove.currentJob ||
        outline.continuity?.currentJob ||
        outline.studentThinkingMove ||
        outline.description ||
        '页面详细规划已生成。',
      fromPrevious: brief?.pageMove.fromPrevious,
      toNext: brief?.pageMove.toNext,
      visualBrief: brief?.visualBrief,
      mustShow:
        brief?.visibleContent.mustShow?.filter(Boolean).slice(0, 6) ||
        outline.keyPoints?.filter(Boolean).slice(0, 4) ||
        [],
      formulas: brief?.visibleContent.formulas?.filter(Boolean).slice(0, 4) || [],
      exampleSteps:
        brief?.visibleContent.exampleSteps?.filter(Boolean).slice(0, 5) ||
        outline.workedExampleConfig?.walkthroughSteps?.filter(Boolean).slice(0, 5) ||
        [],
      commonPitfalls: brief?.visibleContent.commonPitfalls?.filter(Boolean).slice(0, 4) || [],
      bottomTakeaway: brief?.visibleContent.bottomTakeaway,
      drawingPrompt: outline.imageNotebookPrompt,
      markerComponents:
        outline.imageNotebookPromptPlan?.componentPlans
          ?.filter((component) => component.participatesInMask)
          .map((component) =>
            [component.markerColorName || 'marker', component.markerColorHex || '', component.label]
              .filter(Boolean)
              .join(' · '),
          )
          .slice(0, 6) || [],
      markerCount: outline.imageNotebookPromptPlan?.validationTarget.totalMarkerCount || 0,
      promptHash: outline.imageNotebookPromptPlan?.promptHash,
      focusRegions:
        brief?.focusRegions
          ?.slice()
          .sort((a, b) => a.order - b.order)
          .map((region) => region.label)
          .filter(Boolean)
          .slice(0, 6) || [],
      focusCount: brief?.focusRegions?.length || 0,
      batchLabel,
      status: 'planned',
    };
  });
}

function mergePagePlanningPreviews(
  current: PagePlanningPreview[],
  incoming: PagePlanningPreview[],
): PagePlanningPreview[] {
  const byKey = new Map<string, PagePlanningPreview>();
  for (const page of current) byKey.set(String(page.pageNumber || page.id), page);
  for (const page of incoming) {
    byKey.set(String(page.pageNumber || page.id), {
      ...byKey.get(String(page.pageNumber || page.id)),
      ...page,
    });
  }
  return Array.from(byKey.values()).sort((a, b) => a.pageNumber - b.pageNumber);
}

const MOCK_PLANNING_PAGES: PagePlanningPreview[] = [
  {
    id: 'mock-page-1',
    pageNumber: 1,
    title: '为什么证明不能只靠举例？',
    pageRole: 'hook',
    currentJob: '用一个“看起来对”的命题开场，让学生意识到例子只能支持直觉，不能替代证明。',
    mustShow: [
      '命题：任意偶数 n 的平方仍然是偶数',
      '举例：2^2=4，4^2=16，6^2=36',
      '核心问题：这些例子为什么还不是证明？',
    ],
    formulas: ['n = 2, 4, 6', 'n^2 = 4, 16, 36'],
    exampleSteps: ['先承认例子有帮助', '再指出例子没有覆盖所有偶数', '提出需要一般性理由'],
    commonPitfalls: ['把多个例子当成证明', '没有说明“任意”的范围', '直接把结论重复一遍'],
    focusRegions: [],
    focusCount: 0,
    markerComponents: [],
    markerCount: 0,
    bottomTakeaway: '例子帮助我们猜，但证明要覆盖所有情况。',
    status: 'indexed',
  },
  {
    id: 'mock-page-2',
    pageNumber: 2,
    title: '把命题拆成已知和目标',
    pageRole: 'definition',
    currentJob: '把“n 是偶数”和“n^2 是偶数”翻译成定义，让页面只处理一个核心动作。',
    mustShow: [
      '定义：如果 n 是偶数，那么存在整数 k，使得 n = 2k',
      '已知：n 是偶数',
      '要证：n^2 是偶数',
      '目标形式：n^2 = 2m，其中 m 是整数',
    ],
    formulas: ['n = 2k, k ∈ Z', 'n^2 = 2m, m ∈ Z'],
    exampleSteps: ['把已知翻译成 n=2k', '把目标翻译成 2×整数', '提醒变量必须说明是整数'],
    commonPitfalls: ['忘记写 k ∈ Z', '没有把目标改写成定义形式', '把 n 的一个例子当作一般 n'],
    focusRegions: [],
    focusCount: 0,
    markerComponents: [],
    markerCount: 0,
    bottomTakeaway: '定义不是装饰，它告诉我们下一步该把式子变成什么形状。',
    status: 'indexed',
  },
  {
    id: 'mock-page-3',
    pageNumber: 3,
    title: '用定义完成推导',
    pageRole: 'worked-example',
    currentJob: '完整写出偶数平方仍为偶数的证明，保留每一步的理由。',
    mustShow: ['题目：若 n 是偶数，证明 n^2 是偶数', '已知：n = 2k', '目标：n^2 = 2m'],
    formulas: ['n = 2k', 'n^2 = (2k)^2 = 4k^2 = 2(2k^2)'],
    exampleSteps: [
      '先把“偶数”翻译成 n = 2k',
      '平方并整理成 2 x 整数',
      '说明 2k^2 是整数',
      '回到定义完成证明',
    ],
    commonPitfalls: ['忘记说明 k 是整数', '只算到 4k^2 就停', '没有回扣偶数定义'],
    focusRegions: [],
    focusCount: 0,
    markerComponents: [],
    markerCount: 0,
    bottomTakeaway: '每一步都要回答：我现在用了哪个定义？',
    status: 'planned',
  },
  {
    id: 'mock-page-4',
    pageNumber: 4,
    title: '把证明迁移到下一题',
    pageRole: 'wrap-up',
    currentJob: '把刚才的证明压成检查表，并给一个相邻题让学生判断第一步。',
    mustShow: [
      '检查表：1. 找定义 2. 翻译已知 3. 改写目标 4. 回扣定义',
      '迁移题：若 a 和 b 都是偶数，证明 a+b 是偶数',
      '第一步提示：a=2r, b=2s，其中 r,s ∈ Z',
    ],
    formulas: ['a = 2r', 'b = 2s', 'a + b = 2(r+s)'],
    exampleSteps: ['让学生先写定义翻译', '再判断目标形式', '最后口头说明 r+s 是整数'],
    commonPitfalls: ['只写结论不写整数来源', '把 a+b=2r+2s 停在那里', '没有说明 r+s ∈ Z'],
    focusRegions: [],
    focusCount: 0,
    markerComponents: [],
    markerCount: 0,
    bottomTakeaway: '迁移时先找定义，不要先背证明模板。',
    status: 'planned',
  },
];

const MOCK_COURSE_SPINE = {
  logline: '用“偶数平方仍为偶数”这条证明，展示证明为什么要从定义出发，而不是堆例子。',
  centralQuestion: '当命题看起来已经很明显时，我们怎样写出覆盖所有情况的证明？',
  closingCallback: '回到开场问题：例子建立直觉，定义负责把直觉写成覆盖所有情况的证明。',
  acts: [
    {
      id: 'mock-act-opening',
      act: 'opening',
      title: '从例子不够开始',
      purpose: '让学生看到例子只能支持猜想，不能替代证明。',
      pages: [1],
      keyQuestion: '这些例子为什么还不是证明？',
    },
    {
      id: 'mock-act-development',
      act: 'development',
      title: '把定义变成证明动作',
      purpose: '把“偶数”的定义翻译成可操作的代数形式。',
      pages: [2, 3],
      keyQuestion: '目标形式到底要被改写成什么样？',
    },
    {
      id: 'mock-act-practice',
      act: 'practice',
      title: '迁移到相邻命题',
      purpose: '用检查表巩固证明起步方式，并避免模板化背诵。',
      pages: [4],
      keyQuestion: '下一题第一步也应该先找哪个定义？',
    },
  ],
} satisfies ImageNotebookBriefPlan['courseSpine'];

function buildMockPlanningRows(): OutlineRow[] {
  return Array.from({ length: 20 }, (_item, index) => {
    const page = MOCK_PLANNING_PAGES[index % MOCK_PLANNING_PAGES.length];
    const cycle = Math.floor(index / MOCK_PLANNING_PAGES.length);
    return {
      id: `${page.id}-${index + 1}`,
      title: cycle === 0 ? page.title : `${page.title} · ${cycle + 1}`,
      focus: page.currentJob,
    };
  });
}

function buildRuntimeImageGenerationRows(task: NotebookGenerationQueueTask | null): OutlineRow[] {
  const progress = task?.progress;
  const total =
    progress && 'total' in progress && typeof progress.total === 'number'
      ? progress.total
      : (task?.plannedPages?.length ?? 0);
  if (!task || total <= 0) return [];
  return Array.from({ length: total }, (_item, index) => ({
    id: `${task.id}-runtime-image-${index + 1}`,
    title: task.plannedPages?.[index]?.title || `第 ${String(index + 1).padStart(2, '0')} 页`,
    focus: task.plannedPages?.[index]?.focus || '等待当前页面规划内容。',
  }));
}

function buildNeutralImageGenerationRows(count: number, offset = 0): OutlineRow[] {
  return Array.from({ length: count }, (_item, index) => {
    const pageNumber = offset + index + 1;
    return {
      id: `neutral-image-generation-${pageNumber}`,
      title: `第 ${String(pageNumber).padStart(2, '0')} 页`,
      focus: '等待当前页面规划内容。',
    };
  });
}

function takeImageGenerationRowsWithFallback(rows: OutlineRow[], count: number): OutlineRow[] {
  if (rows.length >= count) return rows.slice(0, count);
  const fallbackRows = buildNeutralImageGenerationRows(count - rows.length, rows.length);
  return [...rows, ...fallbackRows].slice(0, count);
}

function buildMockPlanningPagesForPhase(phase: PlanningPhase): PagePlanningPreview[] {
  return MOCK_PLANNING_PAGES.map((page) => {
    if (phase === 'course-spine') {
      return {
        ...page,
        formulas: [],
        exampleSteps: page.exampleSteps.slice(0, 2),
        commonPitfalls: [],
        focusRegions: [],
        focusCount: 0,
        status: 'indexed',
      };
    }
    return {
      ...page,
      focusRegions: [],
      focusCount: 0,
      status: 'planned',
    };
  });
}

function pickMockPlanningPage(
  phase: PlanningPhase,
  pages: PagePlanningPreview[],
): PagePlanningPreview {
  const preferredPageNumber = phase === 'page-brief' ? 1 : 1;
  const fallback = MOCK_PLANNING_PAGES[0];
  if (!fallback) throw new Error('Mock planning pages are not configured');
  return pages.find((page) => page.pageNumber === preferredPageNumber) || pages[0] || fallback;
}

function buildPlanningPhaseMockText(phase: PlanningPhase, page: PagePlanningPreview): string {
  if (phase === 'course-spine') {
    return [
      '[mock stream] 页面规划',
      '',
      'status: 正在生成整课主线和页面索引草稿',
      '',
      'courseSpine:',
      `logline: ${MOCK_COURSE_SPINE.logline}`,
      `centralQuestion: ${MOCK_COURSE_SPINE.centralQuestion}`,
      '',
      'pageIndex:',
      ...MOCK_PLANNING_PAGES.map(
        (item) =>
          `${String(item.pageNumber).padStart(2, '0')}. ${item.title}\n   role: ${item.pageRole}\n   currentJob: ${item.currentJob}`,
      ),
      '',
      'qualityCheck: 4 页 overview，最后一页包含迁移题；下一步按每批 4 页并行生成画图 prompt。',
    ].join('\n');
  }

  return [
    '[mock stream] 画图 prompt',
    '',
    'status: 正在生成第 1-4 页画图 prompt 草稿',
    'batch: 1/1',
    'threadPages: 1, 2, 3, 4',
    '',
    ...MOCK_PLANNING_PAGES.flatMap((item) => [
      `page ${item.pageNumber}: ${item.title}`,
      `content: ${item.currentJob}`,
      `mustInclude: ${item.mustShow.join('；')}`,
      item.formulas.length ? `exactFormulas: ${item.formulas.join('；')}` : '',
      item.exampleSteps.length ? `exactSteps: ${item.exampleSteps.join('；')}` : '',
      item.commonPitfalls.length ? `avoid: ${item.commonPitfalls.join('；')}` : '',
      `visualDirection: ${page.pageNumber === item.pageNumber ? '当前选中页，优先展示完整 prompt 细节。' : '保持同一套手绘学习页风格。'}`,
      '',
    ]),
    'done: 第 1-4 页画图 prompt 完成；可以进入图片生成，生图阶段一次最多 5 页同时跑，按页序保存。',
  ].join('\n');
}

async function readImageNotebookPlanStream(
  response: Response,
  onEvent: (event: ImageNotebookPlanStreamEvent) => void,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('无法读取页面规划流');
  const decoder = new TextDecoder();
  let buffer = '';

  const consumeLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(':')) return;
    if (!trimmed.startsWith('data: ')) return;
    const event = JSON.parse(trimmed.slice(6)) as ImageNotebookPlanStreamEvent;
    onEvent(event);
    if (event.type === 'error') {
      throw new Error(event.error || '页面规划生成失败');
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) consumeLine(line);
      }
      if (done) break;
    }
    if (buffer.trim()) consumeLine(buffer);
  } finally {
    reader.releaseLock();
  }
}

function getFullPageImageUrlFromContent(content: unknown): string {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return '';
  const elements = (content as { elements?: unknown }).elements;
  if (!Array.isArray(elements)) return '';
  const fullPageImage = elements.find((element) => {
    if (!element || typeof element !== 'object' || Array.isArray(element)) return false;
    const record = element as { name?: unknown; type?: unknown };
    return record.name === 'full_page_bitmap' && record.type === 'image';
  }) as { src?: unknown } | undefined;
  return typeof fullPageImage?.src === 'string' ? fullPageImage.src : '';
}

function actionCount(scene: Scene | undefined, type: 'speech' | 'focus'): number {
  if (!scene?.actions?.length) return 0;
  if (type === 'speech') return scene.actions.filter((action) => action.type === 'speech').length;
  return scene.actions.filter((action) => action.type === 'spotlight' || action.type === 'laser')
    .length;
}

function filterSelectedSourceMedia(args: {
  pdfImages: PdfImage[];
  imageMapping: ImageMapping;
  selectedImageIds?: string[];
}): { pdfImages: PdfImage[]; imageMapping: ImageMapping } {
  if (!args.selectedImageIds) {
    return {
      pdfImages: args.pdfImages,
      imageMapping: args.imageMapping,
    };
  }
  const selected = new Set(args.selectedImageIds);
  const pdfImages = args.pdfImages.filter((image) => selected.has(image.id));
  const imageMapping = Object.fromEntries(
    Object.entries(args.imageMapping).filter(([id]) => selected.has(id)),
  );
  return { pdfImages, imageMapping };
}

export {
  MAX_SOURCE_FILE_SIZE_MB,
  MAX_SOURCE_FILE_SIZE_BYTES,
  PLANNING_MOCK_STATE_LABELS,
  PLANNING_MOCK_STATE_OPTIONS,
  IMAGE_GENERATION_STATUS_LABELS,
  WORKSPACE_PROGRESS_STEPS,
  PLANNING_PHASE_ORDER,
  STYLE_OPTIONS,
  PALETTES,
  NOTEBOOK_IMAGE2_PROVIDER_ID,
  NOTEBOOK_IMAGE2_MODEL_ID,
  MOCK_COURSE_SPINE,
  getImageGenerationTileStatus,
  getGeneratedPageThumbnailUrl,
  imageGenerationGridClassName,
  imageGenerationTilePaddingClassName,
  imageGenerationTitleClassName,
  imageGenerationFocusClassName,
  ImageGenerationCardProcessPreview,
  getWorkspaceProgressIndex,
  getWorkspaceProgressLabel,
  buildExtractedTextItems,
  buildRequirementPreview,
  buildImagePreviews,
  isPdfSourceFile,
  isMarkdownSourceFile,
  isPptxSourceFile,
  formatFileSize,
  fileKindLabel,
  buildMaterialRows,
  outlineLengthLabel,
  outlineLengthStrategyText,
  workedExampleLevelLabel,
  buildImageNotebookStyleBrief,
  formatImageNotebookStyleBriefPreview,
  buildStyleSamplePrompt,
  sceneOutlinesToRows,
  outlineRowsToSceneOutlines,
  attachImageNotebookPlanToOutlines,
  pagePlanningPreviewsFromBlueprint,
  pagePlanningPreviewsFromOutlines,
  mergePagePlanningPreviews,
  buildMockPlanningRows,
  buildRuntimeImageGenerationRows,
  takeImageGenerationRowsWithFallback,
  buildMockPlanningPagesForPhase,
  pickMockPlanningPage,
  buildPlanningPhaseMockText,
  readImageNotebookPlanStream,
  getFullPageImageUrlFromContent,
  actionCount,
  filterSelectedSourceMedia,
};

export type {
  WorkspaceStep,
  PlanningPhase,
  PlanningMockStreams,
  PlanningMockPhaseState,
  PlanningMockPhaseStates,
  FormState,
  MaterialRow,
  ExtractedSourceItem,
  ExtractedSourceImage,
  ExtractedSourcePreview,
  SourceGenerationExtract,
  PreparedSourceInput,
  OutlineRow,
  ImageGenerationMockPageCount,
  OutlineGenerationStatus,
  StyleSampleStatus,
  StyleSample,
  ImageNotebookBriefsResponse,
  NotebookPageContentResponse,
  ImageNotebookPlanQualityReport,
  PagePlanningPreview,
  WorkspaceProgressStep,
};
