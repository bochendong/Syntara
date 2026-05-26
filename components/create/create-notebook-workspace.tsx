'use client';

import { type DragEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  BotOff,
  CheckCircle2,
  ChevronDown,
  Copy,
  FileText,
  FileUp,
  Globe2,
  ImageIcon,
  ListChecks,
  Loader2,
  PencilLine,
  PlayCircle,
  Plus,
  RefreshCcw,
  Search,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { PdfPageSelectionDialog } from '@/components/create/pdf-page-selection-dialog';
import { SpeechButton } from '@/components/audio/speech-button';
import { useDraftCache } from '@/lib/hooks/use-draft-cache';
import { useI18n } from '@/lib/hooks/use-i18n';
import { buildStudyCompanionNotification } from '@/lib/learning/study-memory';
import { createLogger } from '@/lib/logger';
import { toast } from '@/lib/notifications/client-toast';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import {
  useOrchestratorNotebookGenStore,
  type OrchestratorWorkedExampleLevel,
} from '@/lib/store/orchestrator-notebook-generation';
import {
  useNotebookGenerationQueueStore,
  type NotebookGenerationQueueTask,
} from '@/lib/store/notebook-generation-queue';
import { useNotificationStore } from '@/lib/store/notifications';
import { useSettingsStore } from '@/lib/store/settings';
import { useUserProfileStore } from '@/lib/store/user-profile';
import { cn } from '@/lib/utils';
import type { ImageMapping, PdfImage, SceneOutline } from '@/lib/types/generation';
import {
  PDF_PAGE_SELECTION_MAX_BYTES,
  getPdfSourceFileSignature,
  type PdfSourceSelection,
} from '@/lib/pdf/page-selection';
import { getApiHeaders } from '@/lib/create/generation-headers';
import { readApiErrorMessage } from '@/lib/create/api-errors';
import { backendFetch } from '@/lib/utils/backend-api';
import {
  buildBudgetedGenerationMedia,
  SAFE_GENERATION_REQUEST_BYTES,
} from '@/lib/generation/request-payload-budget';
import type {
  ImageNotebookBriefPlan,
  ImageNotebookPageBrief,
  ImageNotebookQaResult,
} from '@/lib/generation/image-notebook-quality';
import {
  parseMarkdownLikeGenerationInput,
  parsePdfLikeGenerationPreview,
  parsePptxLikeGenerationPreview,
} from '@/lib/create/source-input';
import type { Scene, Stage } from '@/lib/types/stage';

const log = createLogger('CreateNotebookWorkspace');

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
}: {
  index: number;
  total: number;
  mockEnabled: boolean;
  busy: boolean;
  task?: NotebookGenerationQueueTask | null;
}): ImageGenerationTileStatus {
  if (mockEnabled) return getMockImageGenerationTileStatus(index, total);
  if (task?.status === 'completed') return 'done';
  if (task?.status === 'running') {
    const progress = task.progress;
    if (progress?.stage === 'completed') return 'done';
    if (progress?.stage === 'scene') {
      const completedCount = Math.max(0, Math.min(total, progress.completed));
      if (index < completedCount) return 'done';
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
    label: '规划',
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
      '纸面手绘笔记风格：自然手写线条，蓝黑墨水和少量荧光笔标注，轻微纸张纹理，像学生认真整理的课堂笔记。',
  },
  {
    id: 'clean',
    label: '卡通插画',
    prompt:
      '卡通教育插画风格：圆润角色和物件，柔和边线，明亮但克制的色块，用轻量漫画感把抽象概念画成可理解的场景。',
  },
  {
    id: 'diagram',
    label: '极简线稿',
    prompt:
      '极简线稿风格：干净单线条，少量重点色，图标化结构和清晰箭头，留白充分，像精心绘制的概念解释图。',
  },
  {
    id: 'exam',
    label: '水彩图解',
    prompt:
      '水彩图解风格：柔和纸纹、水彩晕染块面、轻盈层次，用温和色彩突出关键公式、图形和例子，整体像插画学习页。',
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
  '- Keep a consistent MAT 136 / Syntara notebook feel: friendly, careful, readable, sparse, and projector-safe.',
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
    'Match the approved image-generated notebook examples: warm grid paper, hand-drawn teacher board, marker accents, and large readable teaching content.',
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

function StepProgress({
  activeStep,
  planningPhase,
  streamingPhases = [],
  completedPhases = [],
  onStepSelect,
  className,
}: {
  activeStep: WorkspaceStep;
  planningPhase: PlanningPhase;
  streamingPhases?: PlanningPhase[];
  completedPhases?: PlanningPhase[];
  onStepSelect?: (step: WorkspaceProgressStep) => void;
  className?: string;
}) {
  const activeIndex = getWorkspaceProgressIndex(activeStep, planningPhase);
  return (
    <ol
      className={cn(
        'grid grid-cols-1 gap-2 rounded-2xl border border-slate-900/[0.07] bg-white/85 p-2 shadow-sm shadow-slate-950/[0.03] sm:grid-cols-3 lg:relative lg:flex lg:flex-col lg:items-start lg:gap-14 lg:border-0 lg:bg-transparent lg:p-0 lg:pl-1 lg:shadow-none lg:before:absolute lg:before:bottom-12 lg:before:left-5 lg:before:top-12 lg:before:border-l lg:before:border-dashed lg:before:border-slate-300/70 dark:border-white/[0.08] dark:bg-white/[0.04] dark:lg:bg-transparent dark:lg:before:border-white/15',
        className,
      )}
    >
      {WORKSPACE_PROGRESS_STEPS.map((step, index) => {
        const Icon = step.icon;
        const phases = step.planningPhases || (step.planningPhase ? [step.planningPhase] : []);
        const phaseComplete = phases.length
          ? phases.every((phase) => completedPhases.includes(phase))
          : false;
        const complete = index < activeIndex || phaseComplete;
        const active = index === activeIndex;
        const isStreaming = phases.some((phase) => streamingPhases.includes(phase));
        const content = (
          <>
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-lg lg:size-10 lg:rounded-full lg:shadow-sm',
                active
                  ? 'bg-white/15 text-white lg:bg-slate-950 lg:text-white lg:shadow-slate-950/20 dark:bg-slate-950/10 dark:text-slate-950 dark:lg:bg-white dark:lg:text-slate-950'
                  : complete
                    ? 'bg-teal-600 text-white'
                    : 'bg-white text-slate-500 ring-1 ring-slate-900/[0.06] dark:bg-white/[0.08] dark:text-slate-300',
              )}
            >
              {isStreaming ? (
                <Loader2 className="size-4 animate-spin" />
              ) : complete ? (
                <CheckCircle2 className="size-4" />
              ) : (
                <Icon className="size-4" />
              )}
            </span>
            <span className="min-w-0 lg:text-left">
              <span className="block text-[11px] leading-none opacity-70">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="mt-1 block truncate font-semibold lg:whitespace-normal lg:text-[12px] lg:leading-tight lg:text-clip">
                {step.label}
              </span>
            </span>
          </>
        );
        return (
          <li key={step.id} className="min-w-0 lg:w-full">
            <button
              type="button"
              className={cn(
                'relative z-10 flex h-12 w-full min-w-0 items-center gap-2 rounded-xl px-3 text-left text-xs transition-colors lg:h-auto lg:min-h-0 lg:w-auto lg:flex-row lg:justify-start lg:gap-3 lg:rounded-[22px] lg:px-0 lg:py-0 lg:text-left',
                active
                  ? 'bg-slate-950 text-white shadow-sm lg:bg-transparent lg:text-slate-950 lg:shadow-none dark:bg-white dark:text-slate-950 dark:lg:bg-transparent dark:lg:text-white'
                  : complete
                    ? 'bg-teal-50 text-teal-800 hover:bg-teal-100/80 lg:bg-transparent lg:text-teal-700 dark:bg-teal-500/10 dark:text-teal-200 dark:hover:bg-teal-500/15 dark:lg:bg-transparent'
                    : 'text-muted-foreground hover:bg-slate-100/70 lg:hover:bg-white/60 dark:hover:bg-white/[0.05] dark:lg:hover:bg-white/[0.06]',
              )}
              onClick={() => onStepSelect?.(step)}
            >
              {content}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function FieldShell({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-foreground">{label}</Label>
      {children}
      {hint ? <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function buildCourseSpineWriterText(
  courseSpine: ImageNotebookBriefPlan['courseSpine'] | null | undefined,
): string {
  if (!courseSpine) return '';

  const lines = [
    'courseSpine',
    '',
    `logline: ${courseSpine.logline || '等待写入…'}`,
    `centralQuestion: ${courseSpine.centralQuestion || '等待写入…'}`,
    '',
    'acts:',
  ];

  courseSpine.acts.forEach((act, index) => {
    lines.push(
      `${index + 1}. ${act.title || act.act}`,
      `   purpose: ${act.purpose || '等待写入…'}`,
      `   pages: ${act.pages.length ? act.pages.join(', ') : '待定'}`,
      act.keyQuestion ? `   keyQuestion: ${act.keyQuestion}` : '',
    );
  });

  lines.push('', `closingCallback: ${courseSpine.closingCallback || '等待写入…'}`);
  return lines.filter((line) => line !== '').join('\n');
}

function buildPlanningWriterText(page: PagePlanningPreview): string {
  const lines: string[] = [
    `第 ${String(page.pageNumber).padStart(2, '0')} 页｜${page.title}`,
    '',
    `教学动作：${page.currentJob}`,
  ];

  const appendList = (title: string, items: string[]) => {
    if (!items.length) return;
    lines.push('', `${title}：`);
    items.forEach((item, index) => lines.push(`${index + 1}. ${item}`));
  };

  appendList('页面上要真正写出来', page.mustShow);
  appendList('公式 / 符号', page.formulas);
  appendList('例题或证明步骤', page.exampleSteps);
  appendList('父级聚焦区域', page.focusRegions);
  appendList('易错点', page.commonPitfalls);

  if (page.bottomTakeaway) {
    lines.push('', `底部收束：${page.bottomTakeaway}`);
  }
  if (page.fromPrevious) {
    lines.push('', `承接上一页：${page.fromPrevious}`);
  }
  if (page.toNext) {
    lines.push(`引到下一页：${page.toNext}`);
  }
  if (page.visualBrief) {
    lines.push(`视觉意图：${page.visualBrief}`);
  }

  return lines.join('\n');
}

function AnimatedTypewriterBlock({
  text,
  active,
  revision,
}: {
  text: string;
  active?: boolean;
  revision: number;
}) {
  if (!active) return <>{text}</>;
  return <AnimatedTypewriterBlockInner key={`${revision}-${text}`} text={text} />;
}

function AnimatedTypewriterBlockInner({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState('');

  useEffect(() => {
    let length = 0;
    const intervalId = window.setInterval(() => {
      length = Math.min(text.length, length + 8);
      setDisplayed(text.slice(0, length));
      if (length >= text.length) {
        window.clearInterval(intervalId);
      }
    }, 20);

    return () => window.clearInterval(intervalId);
  }, [text]);

  return (
    <>
      {displayed}
      {displayed.length < text.length ? (
        <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-full bg-blue-500 align-[-2px]" />
      ) : null}
    </>
  );
}

function compactPlanningItems(items?: string[]): string[] {
  return (items || []).map((item) => item.trim()).filter(Boolean);
}

function StructuredOutputSection({ label, items }: { label: string; items?: string[] }) {
  const list = compactPlanningItems(items);
  if (!list.length) return null;

  return (
    <div className="rounded-lg border border-slate-900/[0.06] bg-white/70 p-3 dark:border-white/[0.08] dark:bg-white/[0.04]">
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
      <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
        {list.map((item, index) => (
          <li key={`${label}-${index}`} className="flex gap-2">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-slate-400" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function getPlanningLoadingLabel(state?: PlanningMockPhaseState) {
  if (state === 'connecting') return '连接中';
  if (state === 'spine-loading') return '主线生成中';
  if (state === 'index-loading') return '索引生成中';
  if (state === 'index-first-page') return '索引生成中';
  return '生成中';
}

function PlanningLoadingBadge({ label = '生成中' }: { label?: string }) {
  return (
    <span className="inline-flex h-8 items-center rounded-lg border border-blue-500/20 bg-blue-50 px-2.5 text-xs font-medium text-blue-700 dark:border-blue-300/20 dark:bg-blue-300/[0.08] dark:text-blue-200">
      <Loader2 className="mr-1 size-3 animate-spin" />
      {label}
    </span>
  );
}

function SkeletonLine({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'block h-3 animate-pulse rounded-full bg-slate-200 dark:bg-white/[0.08]',
        className,
      )}
    />
  );
}

function PageIndexResultCard({
  page,
  action,
  loading,
  loadingLabel,
}: {
  page: PagePlanningPreview;
  action?: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-900/[0.07] bg-white p-3 shadow-sm shadow-slate-950/[0.02] dark:border-white/[0.08] dark:bg-white/[0.05]">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-xs font-semibold text-white dark:bg-white dark:text-slate-950">
          {String(page.pageNumber).padStart(2, '0')}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex flex-wrap items-center gap-2">
              {loading ? (
                <SkeletonLine className="h-4 w-52 max-w-full" />
              ) : (
                <h3 className="text-sm font-semibold leading-snug text-slate-950 dark:text-slate-50">
                  {page.title}
                </h3>
              )}
              {!loading && page.pageRole ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-white/[0.08] dark:text-slate-300">
                  {page.pageRole}
                </span>
              ) : null}
            </div>
            {loading ? (
              <div className="shrink-0">
                <PlanningLoadingBadge label={loadingLabel} />
              </div>
            ) : action ? (
              <div className="shrink-0">{action}</div>
            ) : null}
          </div>
          {loading ? (
            <div className="mt-2 space-y-2">
              <SkeletonLine className="w-full" />
              <SkeletonLine className="w-2/3" />
            </div>
          ) : (
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {page.currentJob}
            </p>
          )}
        </div>
      </div>
      {loading ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <SkeletonLine className="h-5 w-28" />
          <SkeletonLine className="h-5 w-36" />
          <SkeletonLine className="h-5 w-24" />
        </div>
      ) : compactPlanningItems(page.mustShow).length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {compactPlanningItems(page.mustShow).map((item, index) => (
            <span
              key={`${page.id}-must-${index}`}
              className="rounded-full bg-blue-50 px-2 py-1 text-[11px] leading-none text-blue-800 dark:bg-blue-400/10 dark:text-blue-200"
            >
              {item}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PageIndexLoadingPanel({ label }: { label?: string }) {
  return (
    <div className="h-full rounded-xl border border-blue-500/20 bg-blue-50/45 p-4 shadow-sm shadow-blue-950/[0.03] dark:border-blue-300/20 dark:bg-blue-300/[0.08]">
      <div className="flex items-center justify-between gap-3">
        <SkeletonLine className="h-4 w-40" />
        <PlanningLoadingBadge label={label} />
      </div>
      <div className="mt-5 space-y-3">
        <SkeletonLine className="h-4 w-3/4" />
        <SkeletonLine className="w-full" />
        <SkeletonLine className="w-5/6" />
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-900/[0.06] bg-white/70 p-3 dark:border-white/[0.08] dark:bg-white/[0.04]">
          <SkeletonLine className="h-3.5 w-24" />
          <SkeletonLine className="mt-3 w-full" />
          <SkeletonLine className="mt-2 w-2/3" />
        </div>
        <div className="rounded-lg border border-slate-900/[0.06] bg-white/70 p-3 dark:border-white/[0.08] dark:bg-white/[0.04]">
          <SkeletonLine className="h-3.5 w-28" />
          <SkeletonLine className="mt-3 w-5/6" />
          <SkeletonLine className="mt-2 w-1/2" />
        </div>
      </div>
    </div>
  );
}

function PagePromptResultCard({
  page,
  className,
  loading,
}: {
  page: PagePlanningPreview;
  className?: string;
  loading?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-900/[0.07] bg-white p-4 shadow-sm shadow-slate-950/[0.02] dark:border-white/[0.08] dark:bg-white/[0.05]',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {loading ? (
          <div className="min-w-0 flex-1 pt-1">
            <SkeletonLine className="h-4 w-64 max-w-full" />
          </div>
        ) : (
          <h3 className="min-w-0 flex-1 text-sm font-semibold leading-snug text-slate-950 dark:text-slate-50">
            {page.title}
          </h3>
        )}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-slate-950 px-2 py-1 text-[11px] font-semibold text-white dark:bg-white dark:text-slate-950">
              第 {String(page.pageNumber).padStart(2, '0')} 页
            </span>
            {!loading && page.pageRole ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-white/[0.08] dark:text-slate-300">
                {page.pageRole}
              </span>
            ) : null}
          </div>
          {!loading && page.batchLabel ? (
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200">
              {page.batchLabel}
            </span>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-3 dark:bg-black/20">
          <div className="space-y-2">
            <SkeletonLine className="w-full" />
            <SkeletonLine className="w-3/4" />
          </div>
        </div>
      ) : (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700 dark:bg-black/20 dark:text-slate-200">
          {page.currentJob}
        </p>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {loading ? (
          <>
            {['必须写出', '公式 / 符号', '完整步骤', '避免'].map((label) => (
              <div
                key={label}
                className="rounded-lg border border-slate-900/[0.06] bg-white/70 p-3 dark:border-white/[0.08] dark:bg-white/[0.04]"
              >
                <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
                <div className="mt-3 space-y-2">
                  <SkeletonLine className="w-full" />
                  <SkeletonLine className="w-2/3" />
                </div>
              </div>
            ))}
          </>
        ) : (
          <>
            <StructuredOutputSection label="必须写出" items={page.mustShow} />
            <StructuredOutputSection label="公式 / 符号" items={page.formulas} />
            <StructuredOutputSection label="完整步骤" items={page.exampleSteps} />
            <StructuredOutputSection label="避免" items={page.commonPitfalls} />
          </>
        )}
      </div>

      {!loading && page.bottomTakeaway ? (
        <div className="mt-3 rounded-lg border border-amber-400/20 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
          <span className="font-semibold">收束：</span>
          {page.bottomTakeaway}
        </div>
      ) : null}
    </div>
  );
}

function CourseSpineSummaryPanel({
  courseSpine,
  action,
  loading,
  loadingLabel,
}: {
  courseSpine?: ImageNotebookBriefPlan['courseSpine'] | null;
  action?: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
}) {
  return (
    <div className="h-full overflow-y-auto rounded-xl border border-slate-900/[0.07] bg-white p-4 shadow-sm shadow-slate-950/[0.02] dark:border-white/[0.08] dark:bg-white/[0.05]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold text-muted-foreground">整课主线</p>
        {loading ? (
          <div className="shrink-0">
            <PlanningLoadingBadge label={loadingLabel} />
          </div>
        ) : action ? (
          <div className="shrink-0">{action}</div>
        ) : null}
      </div>
      {loading ? (
        <div className="mt-3 space-y-3">
          <div className="space-y-2">
            <SkeletonLine className="h-4 w-full" />
            <SkeletonLine className="h-4 w-5/6" />
          </div>
          <div className="space-y-2">
            <SkeletonLine className="w-full" />
            <SkeletonLine className="w-3/4" />
          </div>
          <div className="mt-4 rounded-lg bg-slate-50 px-3 py-4 dark:bg-black/20">
            <SkeletonLine className="h-3.5 w-2/3" />
            <SkeletonLine className="mt-3 w-full" />
            <SkeletonLine className="mt-2 w-1/2" />
          </div>
        </div>
      ) : (
        <>
          <h3 className="mt-2 text-base font-semibold leading-snug text-slate-950 dark:text-slate-50">
            {courseSpine?.logline || '页面规划已完成'}
          </h3>
          {courseSpine?.centralQuestion ? (
            <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
              {courseSpine.centralQuestion}
            </p>
          ) : null}
        </>
      )}
      {!loading && courseSpine?.acts?.length ? (
        <div className="mt-4 grid gap-2">
          {courseSpine.acts.map((act, index) => (
            <div
              key={`${act.act || act.title}-${index}`}
              className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-black/20"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {act.title || act.act}
                </p>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-500 dark:bg-white/[0.08] dark:text-slate-300">
                  {act.pages.length ? `页 ${act.pages.join(', ')}` : '页待定'}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {act.purpose}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StructuredPlanningOutput({
  phase,
  pages,
  courseSpine,
  selectedPage,
  onPageSelect,
  action,
  loadingState,
}: {
  phase: PlanningPhase;
  pages: PagePlanningPreview[];
  courseSpine?: ImageNotebookBriefPlan['courseSpine'] | null;
  selectedPage?: PagePlanningPreview;
  onPageSelect?: (pageId: string) => void;
  action?: ReactNode;
  loadingState?: PlanningMockPhaseState;
}) {
  const isLoading = Boolean(loadingState && loadingState !== 'input' && loadingState !== 'done');
  const spineLoading = loadingState === 'connecting' || loadingState === 'spine-loading';
  const loadingLabel = getPlanningLoadingLabel(loadingState);
  const pageIndexLoadingLabel = loadingState === 'spine-loading' ? '等待索引生成中' : loadingLabel;
  const showPageIndexLoadingCards =
    loadingState === 'index-loading' || loadingState === 'index-first-page';
  const visibleGeneratedIndexCount = loadingState === 'index-first-page' ? 1 : 0;
  const sortedPages = pages
    .slice()
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .filter((page) => page.title || page.currentJob);
  const selectedPageIndex = Math.max(
    0,
    sortedPages.findIndex((page) => page.id === selectedPage?.id),
  );
  const currentPage = sortedPages[selectedPageIndex] || selectedPage || sortedPages[0];

  if (phase === 'course-spine') {
    return (
      <div className="grid min-h-0 flex-1 gap-4 bg-white/80 p-4 lg:grid-cols-[0.34fr_0.66fr] dark:bg-black/30">
        <section className="min-h-0">
          <CourseSpineSummaryPanel
            courseSpine={courseSpine}
            action={action}
            loading={spineLoading}
            loadingLabel={loadingLabel}
          />
        </section>
        <section className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {showPageIndexLoadingCards ? (
              <div className="grid gap-2">
                {sortedPages.map((page, index) => (
                  <PageIndexResultCard
                    key={page.id}
                    page={page}
                    action={action}
                    loading={index >= visibleGeneratedIndexCount}
                    loadingLabel="索引生成中"
                  />
                ))}
              </div>
            ) : isLoading ? (
              <PageIndexLoadingPanel label={pageIndexLoadingLabel} />
            ) : (
              <div className="grid gap-2">
                {sortedPages.map((page) => (
                  <PageIndexResultCard key={page.id} page={page} action={action} />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    );
  }

  if (!currentPage) {
    return <div className="min-h-0 flex-1 bg-white/80 dark:bg-black/30" />;
  }

  const goToPage = (direction: -1 | 1) => {
    const nextPage = sortedPages[selectedPageIndex + direction];
    if (nextPage) onPageSelect?.(nextPage.id);
  };

  return (
    <div className="grid min-h-0 flex-1 gap-4 bg-white/80 p-4 lg:grid-cols-[0.34fr_0.66fr] dark:bg-black/30">
      <section className="min-h-0">
        <CourseSpineSummaryPanel
          courseSpine={courseSpine}
          action={action}
          loading={spineLoading}
          loadingLabel={loadingLabel}
        />
      </section>
      <section className="flex min-h-0 flex-col">
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
          <p className="text-xs font-medium text-muted-foreground">
            第 {selectedPageIndex + 1} / {sortedPages.length} 页
          </p>
          <div className="flex items-center gap-2">
            {isLoading ? <PlanningLoadingBadge label={loadingLabel} /> : action}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-lg px-2.5 text-xs"
              disabled={selectedPageIndex <= 0}
              onClick={() => goToPage(-1)}
            >
              <ArrowLeft className="mr-1 size-3.5" />
              上一页
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-lg px-2.5 text-xs"
              disabled={selectedPageIndex >= sortedPages.length - 1}
              onClick={() => goToPage(1)}
            >
              下一页
              <ArrowRight className="ml-1 size-3.5" />
            </Button>
          </div>
        </div>
        <PagePromptResultCard
          page={currentPage}
          loading={isLoading}
          className="min-h-0 flex-1 overflow-y-auto border-blue-500/25 bg-blue-50/55 dark:border-blue-300/20 dark:bg-blue-300/[0.08]"
        />
      </section>
    </div>
  );
}

function PlanningStreamBox({
  page,
  mockText,
  stepText,
  structured,
  loadingState,
  phase = 'course-spine',
  pages = [],
  courseSpine,
  selectedPage,
  onPageSelect,
  active,
  revision,
  action,
}: {
  page?: PagePlanningPreview;
  mockText?: string;
  stepText?: string;
  structured?: boolean;
  loadingState?: PlanningMockPhaseState;
  phase?: PlanningPhase;
  pages?: PagePlanningPreview[];
  courseSpine?: ImageNotebookBriefPlan['courseSpine'] | null;
  selectedPage?: PagePlanningPreview;
  onPageSelect?: (pageId: string) => void;
  active?: boolean;
  revision: number;
  action?: ReactNode;
}) {
  const isStepStream = mockText !== undefined || stepText !== undefined;
  const text = isStepStream
    ? (stepText ?? mockText ?? '')
    : page
      ? buildPlanningWriterText(page)
      : '';
  const showStructured = Boolean(structured || loadingState);

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden rounded-xl border transition-colors',
        active
          ? 'border-blue-500/30 bg-blue-50/80 shadow-sm shadow-blue-950/[0.04] dark:border-blue-300/25 dark:bg-blue-300/[0.08]'
          : 'border-slate-900/[0.06] bg-slate-50/80 dark:border-white/[0.08] dark:bg-white/[0.04]',
      )}
    >
      {!showStructured ? (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-900/[0.06] px-4 py-3 dark:border-white/[0.08]">
          <p className="text-xs font-semibold text-muted-foreground">
            {isStepStream ? '当前阶段模型输出' : '当前页规划'}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {action}
            {active ? (
              <span className="inline-flex items-center rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white">
                <Loader2 className="mr-1 size-3 animate-spin" />
                正在接收
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      {showStructured ? (
        <StructuredPlanningOutput
          phase={phase}
          pages={pages}
          courseSpine={courseSpine}
          selectedPage={selectedPage}
          onPageSelect={onPageSelect}
          action={action}
          loadingState={loadingState}
        />
      ) : (
        <pre className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap bg-white/80 p-5 font-mono text-sm leading-7 text-slate-950 dark:bg-black/30 dark:text-slate-100">
          {isStepStream ? (
            <>
              {text}
              {active ? (
                <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-full bg-blue-500 align-[-2px]" />
              ) : null}
            </>
          ) : (
            <AnimatedTypewriterBlock text={text} active={active} revision={revision} />
          )}
        </pre>
      )}
    </div>
  );
}

function PromptPreviewPanel({
  title,
  description,
  value,
  onCopy,
  minHeight = 'min-h-[220px]',
}: {
  title: string;
  description: string;
  value: string;
  onCopy: () => void;
  minHeight?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-900/[0.07] bg-slate-50/70 p-3 dark:border-white/[0.08] dark:bg-white/[0.04]">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 rounded-lg"
          disabled={!value}
          onClick={onCopy}
        >
          <Copy className="mr-1.5 size-3.5" />
          复制
        </Button>
      </div>
      <Textarea
        readOnly
        value={value}
        className={cn(
          minHeight,
          'resize-y rounded-lg bg-white/90 font-mono text-xs leading-relaxed dark:bg-black/30',
        )}
      />
    </div>
  );
}

type PipelineInputSection = {
  title: string;
  lines: string[];
};

function parsePipelineInputSections(value: string): PipelineInputSection[] {
  return value
    .split(/\n\s*\n/g)
    .map((block) =>
      block
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    )
    .filter((lines) => lines.length > 0)
    .map((lines) => {
      const first = lines[0] || '';
      if (first.endsWith('：') || first.endsWith(':')) {
        return {
          title: first.replace(/[：:]$/, ''),
          lines: lines.slice(1),
        };
      }
      return {
        title: first,
        lines: lines.slice(1),
      };
    });
}

function mergePipelineInputSourceSections(
  sections: PipelineInputSection[],
): PipelineInputSection[] {
  const merged: PipelineInputSection[] = [];
  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index];
    const next = sections[index + 1];
    if (section?.title.includes('用户输入') && next?.title.includes('来源流')) {
      merged.push({
        title: '输入与来源',
        lines: [
          `用户输入：${section.lines.join('；') || '等待输入…'}`,
          `来源流：${next.lines.join('；') || '等待来源…'}`,
        ],
      });
      index += 1;
      continue;
    }
    merged.push(section);
  }
  return merged;
}

function PipelineSectionIcon({ title, className }: { title: string; className?: string }) {
  if (title.includes('用户') || title.includes('输入')) return <Sparkles className={className} />;
  if (title.includes('来源') || title.includes('文件')) return <FileUp className={className} />;
  if (title.includes('任务') || title.includes('规划')) return <ListChecks className={className} />;
  if (title.includes('约束') || title.includes('必须'))
    return <CheckCircle2 className={className} />;
  if (title.includes('风格')) return <Wand2 className={className} />;
  return <FileText className={className} />;
}

function PipelineLine({ line }: { line: string }) {
  const match = line.match(/^([^：:]{2,12})[：:](.+)$/);
  if (match) {
    return (
      <div className="rounded-lg bg-slate-50/80 px-3 py-2 text-xs leading-relaxed dark:bg-white/[0.04]">
        <span className="font-semibold text-slate-700 dark:text-slate-200">{match[1]}：</span>
        <span className="text-slate-600 dark:text-slate-300">{match[2].trim()}</span>
      </div>
    );
  }
  return (
    <div className="flex gap-2 rounded-lg bg-slate-50/70 px-3 py-2 text-xs leading-relaxed text-slate-600 dark:bg-white/[0.04] dark:text-slate-300">
      <span className="mt-[0.45em] size-1.5 shrink-0 rounded-full bg-blue-500/60" />
      <span>{line.replace(/^\d+\.\s*/, '')}</span>
    </div>
  );
}

function PipelineTextPanel({ value, active }: { value: string; active?: boolean }) {
  const sections = mergePipelineInputSourceSections(parsePipelineInputSections(value));
  const [selectedSectionIndex, setSelectedSectionIndex] = useState(0);
  const visibleSectionIndex = Math.min(selectedSectionIndex, Math.max(sections.length - 1, 0));
  const selectedSection = sections[visibleSectionIndex] ?? sections[0];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-900/[0.07] bg-white/88 shadow-sm shadow-slate-950/[0.03] dark:border-white/[0.08] dark:bg-black/20">
      <div className="flex min-h-0 flex-1 flex-col bg-slate-50/70 p-4 dark:bg-black/25">
        {sections.length > 0 ? (
          <>
            <div className="mb-3 flex shrink-0 gap-2 overflow-x-auto pb-1">
              {sections.map((section, index) => {
                const selected = index === visibleSectionIndex;
                return (
                  <button
                    key={`${section.title}-${index}`}
                    type="button"
                    className={cn(
                      'inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-xs font-medium transition',
                      selected
                        ? 'border-slate-950 bg-slate-950 text-white shadow-sm dark:border-white dark:bg-white dark:text-slate-950'
                        : 'border-slate-900/[0.07] bg-white/80 text-slate-600 hover:border-blue-300 hover:text-slate-950 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-300 dark:hover:text-white',
                    )}
                    onClick={() => setSelectedSectionIndex(index)}
                  >
                    <PipelineSectionIcon title={section.title} className="size-3.5" />
                    <span>{section.title}</span>
                  </button>
                );
              })}
            </div>
            <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-900/[0.06] bg-white/92 p-4 shadow-sm shadow-slate-950/[0.03] dark:border-white/[0.08] dark:bg-white/[0.04]">
              <div className="mb-4 flex shrink-0 items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-600/10 dark:bg-blue-300/[0.08] dark:text-blue-200">
                    <PipelineSectionIcon
                      title={selectedSection?.title ?? ''}
                      className="size-4.5"
                    />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold">{selectedSection?.title}</h3>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-white/[0.08] dark:text-slate-300">
                        {visibleSectionIndex + 1} / {sections.length}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      选择上方标签查看当前生成输入的不同部分。
                    </p>
                  </div>
                </div>
                {active ? (
                  <span className="inline-flex shrink-0 items-center rounded-full bg-blue-600 px-2.5 py-1 text-[10px] font-medium text-white">
                    <Loader2 className="mr-1 size-3 animate-spin" />
                    生成中
                  </span>
                ) : null}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <div
                  className={cn(
                    'grid gap-2',
                    selectedSection?.title === '输入与来源' && 'sm:grid-cols-2',
                    (selectedSection?.lines.length ?? 0) > 4 && 'xl:grid-cols-2',
                  )}
                >
                  {selectedSection?.lines.length ? (
                    selectedSection.lines.map((line, lineIndex) => (
                      <PipelineLine key={`${selectedSection.title}-${lineIndex}`} line={line} />
                    ))
                  ) : (
                    <p className="rounded-lg bg-slate-50/80 px-3 py-2 text-xs text-muted-foreground dark:bg-white/[0.04]">
                      等待输入…
                    </p>
                  )}
                </div>
              </div>
            </section>
          </>
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-900/[0.08] bg-white/70 text-sm text-muted-foreground dark:border-white/[0.08] dark:bg-white/[0.04]">
            等待输入…
          </div>
        )}
      </div>
    </div>
  );
}

export function CreateNotebookWorkspace({ courseId }: { courseId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stylePromptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const sourceDragDepthRef = useRef(0);
  const outlineAbortRef = useRef<AbortController | null>(null);
  const styleSampleAbortRef = useRef<AbortController | null>(null);
  const planningRevealTimeoutRef = useRef<number | null>(null);
  const planningMockStreamTimersRef = useRef<number[]>([]);
  const [activeStep, setActiveStep] = useState<WorkspaceStep>('input');
  const [form, setForm] = useState<FormState>({ sourceFile: null, requirement: '' });
  const [materials, setMaterials] = useState<MaterialRow[]>(() => buildMaterialRows(null, ''));
  const [outlineRows, setOutlineRows] = useState<OutlineRow[]>([]);
  const [selectedOutlineId, setSelectedOutlineId] = useState('');
  const [outlineGenerationStatus, setOutlineGenerationStatus] =
    useState<OutlineGenerationStatus>('idle');
  const [outlineGenerationMessage, setOutlineGenerationMessage] =
    useState('输入后会直接生成一版规划与画图 prompt。');
  const [planningCourseSpine, setPlanningCourseSpine] = useState<
    ImageNotebookBriefPlan['courseSpine'] | null
  >(null);
  const [planningPages, setPlanningPages] = useState<PagePlanningPreview[]>([]);
  const [confirmedImageNotebookPlan, setConfirmedImageNotebookPlan] = useState<{
    outlines: SceneOutline[];
    plan: ImageNotebookBriefPlan;
  } | null>(null);
  const [planningLiveDraft, setPlanningLiveDraft] = useState<{
    phase: 'blueprint' | 'batch';
    detail: string;
    text: string;
  } | null>(null);
  const [, setPlanningStreamEvents] = useState<string[]>([]);
  const [_planningQuality, setPlanningQuality] = useState<ImageNotebookPlanQualityReport | null>(
    null,
  );
  const [planningPhase, setPlanningPhase] = useState<PlanningPhase>('course-spine');
  const [planningMockStreams, setPlanningMockStreams] = useState<PlanningMockStreams>({});
  const [planningMockPhaseStates, setPlanningMockPhaseStates] = useState<PlanningMockPhaseStates>(
    {},
  );
  const [planningRealPhaseStates, setPlanningRealPhaseStates] = useState<PlanningMockPhaseStates>(
    {},
  );
  const [planningMockStreamingPhases, setPlanningMockStreamingPhases] = useState<PlanningPhase[]>(
    [],
  );
  const [imageGenerationMockPageCount, setImageGenerationMockPageCount] =
    useState<ImageGenerationMockPageCount | null>(null);
  const [activeGenerationTaskId, setActiveGenerationTaskId] = useState<string | null>(null);
  const [currentPlanningPageNumbers, setCurrentPlanningPageNumbers] = useState<number[]>([]);
  const [revealingPlanningPageNumbers, setRevealingPlanningPageNumbers] = useState<number[]>([]);
  const [planningRevealRevision, setPlanningRevealRevision] = useState(0);
  const [selectedStyleId, setSelectedStyleId] = useState(STYLE_OPTIONS[0]?.id ?? 'board');
  const [customStylePrompt, setCustomStylePrompt] = useState(STYLE_OPTIONS[0]?.prompt ?? '');
  const [selectedPaletteId, setSelectedPaletteId] = useState(PALETTES[0]?.id ?? 'blue-teal');
  const [styleSampleStatus, setStyleSampleStatus] = useState<StyleSampleStatus>('idle');
  const [styleSample, setStyleSample] = useState<StyleSample | null>(null);
  const [styleSampleError, setStyleSampleError] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sourceDragActive, setSourceDragActive] = useState(false);
  const [pageSelectionDialogOpen, setPageSelectionDialogOpen] = useState(false);
  const [sourcePageSelection, setSourcePageSelection] = useState<PdfSourceSelection | null>(null);
  const [sourcePreview, setSourcePreview] = useState<ExtractedSourcePreview>({
    status: 'idle',
    items: [],
    imageCount: 0,
    imagePreviews: [],
    imageDuplicateCount: 0,
    warnings: [],
  });
  const [sourceExtract, setSourceExtract] = useState<SourceGenerationExtract>({
    text: '',
    pdfImages: [],
    imageMapping: {},
  });
  const [selectedSourceImageIds, setSelectedSourceImageIds] = useState<string[]>([]);

  const { cachedValue: cachedRequirement, updateCache: updateRequirementCache } =
    useDraftCache<string>({ key: 'requirementDraft' });
  const [prevCachedRequirement, setPrevCachedRequirement] = useState(cachedRequirement);

  const currentModelId = useSettingsStore((s) => s.modelId);
  const generationTasks = useNotebookGenerationQueueStore((s) => s.tasks);
  const enqueueNotebookGeneration = useNotebookGenerationQueueStore((s) => s.enqueue);
  const enqueueCompanionBanner = useNotificationStore((s) => s.enqueueBanner);
  const notebookModelMode = useOrchestratorNotebookGenStore((s) => s.notebookModelMode);
  const modelIdOverride = useOrchestratorNotebookGenStore((s) => s.modelIdOverride);
  const notebookStageModelOverrides = useOrchestratorNotebookGenStore(
    (s) => s.notebookStageModelOverrides,
  );
  const language = useOrchestratorNotebookGenStore((s) => s.language);
  const setLanguage = useOrchestratorNotebookGenStore((s) => s.setLanguage);
  const setGenerateSlides = useOrchestratorNotebookGenStore((s) => s.setGenerateSlides);
  const outlineLength = useOrchestratorNotebookGenStore((s) => s.outlineLength);
  const setOutlineLength = useOrchestratorNotebookGenStore((s) => s.setOutlineLength);
  const workedExampleLevel = useOrchestratorNotebookGenStore((s) => s.workedExampleLevel);
  const setWorkedExampleLevel = useOrchestratorNotebookGenStore((s) => s.setWorkedExampleLevel);
  const includeQuizScenes = useOrchestratorNotebookGenStore((s) => s.includeQuizScenes);
  const setIncludeQuizScenes = useOrchestratorNotebookGenStore((s) => s.setIncludeQuizScenes);
  const setUseAiImages = useOrchestratorNotebookGenStore((s) => s.setUseAiImages);

  const clearPlanningMockStreamTimers = useCallback(() => {
    planningMockStreamTimersRef.current.forEach((timerId) => window.clearInterval(timerId));
    planningMockStreamTimersRef.current = [];
  }, []);

  useEffect(() => {
    useMediaGenerationStore.getState().revokeObjectUrls();
    useMediaGenerationStore.setState({ tasks: {} });
  }, []);

  useEffect(() => {
    setGenerateSlides(true);
    setUseAiImages(true);
  }, [setGenerateSlides, setUseAiImages]);

  useEffect(() => {
    return () => {
      outlineAbortRef.current?.abort();
      styleSampleAbortRef.current?.abort();
      clearPlanningMockStreamTimers();
      if (planningRevealTimeoutRef.current != null) {
        window.clearTimeout(planningRevealTimeoutRef.current);
      }
    };
  }, [clearPlanningMockStreamTimers]);

  if (cachedRequirement !== prevCachedRequirement) {
    setPrevCachedRequirement(cachedRequirement);
    if (cachedRequirement) {
      setForm((prev) => ({ ...prev, requirement: cachedRequirement }));
    }
  }

  useEffect(() => {
    setMaterials((current) => {
      const next = buildMaterialRows(form.sourceFile, form.requirement);
      const keepById = new Map(current.map((item) => [item.id, item.keep]));
      return next.map((item) => ({ ...item, keep: keepById.get(item.id) ?? item.keep }));
    });
  }, [form.sourceFile, form.requirement]);

  useEffect(() => {
    const file = form.sourceFile;
    if (!file || !isPdfSourceFile(file)) {
      setSourcePageSelection(null);
      return;
    }
    const signature = getPdfSourceFileSignature(file);
    setSourcePageSelection((current) => (current?.fileSignature === signature ? current : null));
  }, [form.sourceFile]);

  useEffect(() => {
    if (activeStep !== 'materials') return;

    const file = form.sourceFile;
    if (!file) {
      setSourcePreview(buildRequirementPreview(form.requirement));
      setSourceExtract({ text: form.requirement, pdfImages: [], imageMapping: {} });
      setSelectedSourceImageIds([]);
      return;
    }

    const abortController = new AbortController();
    setSelectedSourceImageIds([]);
    setSourcePreview({
      status: 'loading',
      items: [],
      imageCount: 0,
      imagePreviews: [],
      imageDuplicateCount: 0,
      warnings: [],
    });

    const parse = async () => {
      if (isMarkdownSourceFile(file)) {
        const parsed = await parseMarkdownLikeGenerationInput({ file });
        return {
          text: parsed.pdfText,
          imageCount: 0,
          imagePreviews: [],
          imageDuplicateCount: 0,
          pdfImages: [],
          imageMapping: {},
          warnings: parsed.truncationWarnings,
        };
      }
      if (isPptxSourceFile(file)) {
        const parsed = await parsePptxLikeGenerationPreview({
          pptxFile: file,
          signal: abortController.signal,
        });
        const imagePreviewResult = buildImagePreviews(parsed.pdfImages, parsed.imageMapping);
        return {
          text: parsed.pdfText,
          imageCount: parsed.pdfImages.length,
          imagePreviews: imagePreviewResult.imagePreviews,
          imageDuplicateCount: imagePreviewResult.duplicateCount,
          pdfImages: parsed.pdfImages,
          imageMapping: parsed.imageMapping,
          warnings: parsed.truncationWarnings,
        };
      }
      const parsed = await parsePdfLikeGenerationPreview({
        pdfFile: file,
        language,
        sourcePageSelection: sourcePageSelection ?? undefined,
        imageLimit: null,
        includeVisualRegionImages: true,
        signal: abortController.signal,
      });
      const imagePreviewResult = buildImagePreviews(parsed.pdfImages, parsed.imageMapping);
      return {
        text: parsed.pdfText,
        imageCount: parsed.pdfImages.length,
        imagePreviews: imagePreviewResult.imagePreviews,
        imageDuplicateCount: imagePreviewResult.duplicateCount,
        pdfImages: parsed.pdfImages,
        imageMapping: parsed.imageMapping,
        warnings: parsed.truncationWarnings,
      };
    };

    void parse()
      .then((parsed) => {
        if (abortController.signal.aborted) return;
        setSelectedSourceImageIds(parsed.imagePreviews.map((image) => image.id));
        setSourceExtract({
          text: parsed.text,
          pdfImages: parsed.pdfImages,
          imageMapping: parsed.imageMapping,
        });
        const textItems = buildExtractedTextItems(parsed.text);
        const imageItem: ExtractedSourceItem[] =
          parsed.imageCount > 0
            ? [
                {
                  id: 'images',
                  title: '提取到的图片',
                  detail: `系统将保留 ${parsed.imageCount} 张图片或图形区域作为生成依据。`,
                  kind: '图片',
                },
              ]
            : [];
        setSourcePreview({
          status: 'ready',
          items:
            textItems.length > 0
              ? [...textItems, ...imageItem].slice(0, 5)
              : [
                  {
                    id: 'empty-text',
                    title: '未提取到可读正文',
                    detail: '这个文件可能以图片扫描为主，后续会尽量保留可用页面图像和文件信息。',
                    kind: '文本',
                  },
                  ...imageItem,
                ],
          imageCount: parsed.imageCount,
          imagePreviews: parsed.imagePreviews,
          imageDuplicateCount: parsed.imageDuplicateCount,
          warnings: parsed.warnings,
        });
      })
      .catch((err) => {
        if (abortController.signal.aborted) return;
        setSelectedSourceImageIds([]);
        setSourceExtract({ text: '', pdfImages: [], imageMapping: {} });
        setSourcePreview({
          status: 'error',
          items: [],
          imageCount: 0,
          imagePreviews: [],
          imageDuplicateCount: 0,
          warnings: [],
          message: err instanceof Error ? err.message : '素材解析失败',
        });
      });

    return () => abortController.abort();
  }, [activeStep, form.sourceFile, form.requirement, language, sourcePageSelection]);

  const outlineIsLoading = outlineGenerationStatus === 'loading';
  const selectedStyle =
    STYLE_OPTIONS.find((style) => style.id === selectedStyleId) ?? STYLE_OPTIONS[0];
  const selectedStylePrompt = selectedStyle?.prompt ?? '';
  const drawingStylePrompt =
    customStylePrompt.trim() ||
    selectedStylePrompt ||
    '自定义绘画风格：根据用户输入的主题选择清晰、可读、适合教学的画面美术风格。';
  const hasCustomDrawingStyle =
    selectedStyleId === 'custom' ||
    (Boolean(customStylePrompt.trim()) && customStylePrompt.trim() !== selectedStylePrompt);
  const selectedPalette =
    PALETTES.find((palette) => palette.id === selectedPaletteId) ?? PALETTES[0];
  const selectedOutline = outlineRows.find((row) => row.id === selectedOutlineId) ?? outlineRows[0];
  const selectedOutlineIndex = Math.max(
    0,
    outlineRows.findIndex((row) => row.id === selectedOutline?.id),
  );
  const planningByPageNumber = new Map(planningPages.map((page) => [page.pageNumber, page]));
  const planningListPages =
    outlineRows.length > 0
      ? outlineRows.map((row, index) => {
          const pageNumber = index + 1;
          const planned = planningByPageNumber.get(pageNumber);
          return {
            ...(planned || {
              id: row.id,
              pageNumber,
              title: row.title,
              currentJob: row.focus || '等待页面规划写入…',
              mustShow: [],
              formulas: [],
              exampleSteps: [],
              commonPitfalls: [],
              focusRegions: [],
              focusCount: 0,
              status: outlineIsLoading ? 'indexed' : 'planned',
            }),
            id: row.id,
            title: row.title || planned?.title || `第 ${pageNumber} 页`,
            currentJob: planned?.currentJob || row.focus || '等待页面规划写入…',
          } as PagePlanningPreview;
        })
      : planningPages;
  const selectedPlanningPage =
    planningByPageNumber.get(selectedOutlineIndex + 1) ||
    (selectedOutline
      ? ({
          id: selectedOutline.id,
          pageNumber: selectedOutlineIndex + 1,
          title: selectedOutline.title,
          currentJob: selectedOutline.focus || '等待页面规划写入…',
          mustShow: [],
          formulas: [],
          exampleSteps: [],
          commonPitfalls: [],
          focusRegions: [],
          focusCount: 0,
          status: outlineIsLoading ? 'indexed' : 'planned',
        } as PagePlanningPreview)
      : undefined);
  const currentPlanningPageSet = new Set(currentPlanningPageNumbers);
  const revealingPlanningPageSet = new Set(revealingPlanningPageNumbers);
  const selectedPlanningIsWriting =
    Boolean(selectedPlanningPage) &&
    ((outlineIsLoading && currentPlanningPageSet.has(selectedPlanningPage?.pageNumber || -1)) ||
      revealingPlanningPageSet.has(selectedPlanningPage?.pageNumber || -1));
  const selectedPlanningMockValue = planningMockStreams[planningPhase];
  const selectedPlanningMockHasState = Object.prototype.hasOwnProperty.call(
    planningMockStreams,
    planningPhase,
  );
  const selectedPlanningMockPhaseState = planningMockPhaseStates[planningPhase];
  const selectedPlanningRealPhaseState = planningRealPhaseStates[planningPhase];
  const selectedPlanningEffectivePhaseState =
    selectedPlanningMockPhaseState ?? selectedPlanningRealPhaseState;
  const selectedPlanningMockText =
    typeof selectedPlanningMockValue === 'string' ? selectedPlanningMockValue : undefined;
  const selectedPlanningMockIsConfirmingInput =
    selectedPlanningMockHasState &&
    (selectedPlanningMockValue === null || selectedPlanningMockPhaseState === 'input');
  const selectedPlanningMockIsLoadingState = Boolean(
    selectedPlanningMockPhaseState &&
    selectedPlanningMockPhaseState !== 'input' &&
    selectedPlanningMockPhaseState !== 'done',
  );
  const selectedPlanningMockIsStreaming = planningMockStreamingPhases.includes(planningPhase);
  const hasPlanningMockStreams = Object.keys(planningMockStreams).length > 0;
  const selectedPlanningRealIsLoadingState = Boolean(
    !hasPlanningMockStreams &&
    outlineIsLoading &&
    selectedPlanningRealPhaseState &&
    selectedPlanningRealPhaseState !== 'input' &&
    selectedPlanningRealPhaseState !== 'done',
  );
  const planningLiveDraftText = planningLiveDraft
    ? `${planningLiveDraft.detail}\n\n${planningLiveDraft.text}`
    : undefined;
  const selectedPlanningStepText = hasPlanningMockStreams
    ? selectedPlanningMockText
    : planningLiveDraftText
      ? planningLiveDraftText
      : planningPhase === 'course-spine'
        ? planningCourseSpine
          ? buildCourseSpineWriterText(planningCourseSpine)
          : undefined
        : selectedPlanningPage
          ? buildPlanningWriterText(selectedPlanningPage)
          : undefined;
  const hasSelectedPlanningStepText = selectedPlanningStepText !== undefined;
  const selectedPlanningStepIsWriting = hasPlanningMockStreams
    ? selectedPlanningMockIsStreaming
    : planningLiveDraftText
      ? outlineIsLoading
      : planningPhase === 'course-spine'
        ? outlineIsLoading && !planningCourseSpine
        : selectedPlanningIsWriting;
  const planningMockCompletedPhases = PLANNING_PHASE_ORDER.filter(
    (phase) =>
      typeof planningMockStreams[phase] === 'string' &&
      !planningMockStreamingPhases.includes(phase),
  );
  const realPlanningCompletedPhases = hasPlanningMockStreams
    ? []
    : PLANNING_PHASE_ORDER.filter((phase) => {
        if (phase === 'course-spine') return Boolean(planningCourseSpine || planningPages.length);
        if (phase === 'page-brief') {
          return planningPages.some((page) => page.status === 'planned');
        }
        return false;
      });
  const completedPlanningPhases = hasPlanningMockStreams
    ? planningMockCompletedPhases
    : realPlanningCompletedPhases;
  const realPlanningStreamingPhases = !hasPlanningMockStreams
    ? PLANNING_PHASE_ORDER.filter((phase) => {
        const state = planningRealPhaseStates[phase];
        return outlineIsLoading && Boolean(state && state !== 'input' && state !== 'done');
      })
    : [];
  const displayedPlanningStreamingPhases = hasPlanningMockStreams
    ? planningMockStreamingPhases
    : realPlanningStreamingPhases;
  const selectedPlanningStructuredOutput =
    Boolean(selectedPlanningStepText?.trim()) &&
    !selectedPlanningStepIsWriting &&
    completedPlanningPhases.includes(planningPhase);
  const selectedPlanningStructuredLoading = hasPlanningMockStreams
    ? selectedPlanningMockIsLoadingState && !selectedPlanningMockIsConfirmingInput
    : selectedPlanningRealIsLoadingState;
  const selectedPlanningStructuredLoadingState = selectedPlanningStructuredLoading
    ? selectedPlanningMockPhaseState || selectedPlanningRealPhaseState
    : undefined;
  const showPlanningInputOnly = selectedPlanningMockIsConfirmingInput;
  const showPlanningOutputPanel = Boolean(
    !showPlanningInputOnly &&
    (hasSelectedPlanningStepText ||
      selectedPlanningStepIsWriting ||
      selectedPlanningStructuredOutput ||
      selectedPlanningStructuredLoading),
  );
  const hidePlanningInputPanel =
    showPlanningOutputPanel &&
    (selectedPlanningStructuredOutput || selectedPlanningStructuredLoading);
  const structuredPlanningCourseSpine = hasPlanningMockStreams
    ? MOCK_COURSE_SPINE
    : planningCourseSpine;
  const keptMaterials = materials.filter((item) => item.keep);
  const selectedSourceImageIdSet = new Set(selectedSourceImageIds);
  const selectedSourceImages = sourcePreview.imagePreviews.filter((image) =>
    selectedSourceImageIdSet.has(image.id),
  );
  const hasSelectableSourceImages = sourcePreview.imagePreviews.length > 0;
  const missingSourceImagePreviewCount = Math.max(
    0,
    sourcePreview.imageCount -
      sourcePreview.imagePreviews.length -
      sourcePreview.imageDuplicateCount,
  );
  const hasInput = Boolean(form.requirement.trim() || form.sourceFile);
  const activeStepIndex = getWorkspaceProgressIndex(activeStep, planningPhase);
  const activeStepLabel = getWorkspaceProgressLabel(activeStep, planningPhase);
  const outlineNeedsInitialGeneration =
    activeStep === 'outline' &&
    planningPhase === 'course-spine' &&
    !outlineIsLoading &&
    !hasPlanningMockStreams &&
    !planningCourseSpine &&
    planningPages.length === 0 &&
    outlineRows.length === 0;
  const outlineNextDisabled =
    activeStep === 'outline'
      ? outlineNeedsInitialGeneration
        ? false
        : outlineGenerationStatus !== 'ready' || outlineRows.length === 0
      : false;
  const outlinePlanKey = outlineRows
    .map((row, index) => `${index + 1}:${row.id}:${row.title}:${row.focus}`)
    .join('||');
  const currentStyleSampleKey = [
    outlinePlanKey,
    selectedOutline?.id || '',
    selectedOutline?.title || '',
    selectedOutline?.focus || '',
    selectedStyleId,
    drawingStylePrompt,
    selectedPaletteId,
    language,
  ].join('|');
  const styleSampleIsCurrent =
    styleSampleStatus === 'ready' &&
    Boolean(styleSample?.imageUrl) &&
    styleSample?.key === currentStyleSampleKey;
  const styleSampleIsStale =
    styleSampleStatus === 'ready' && Boolean(styleSample?.imageUrl) && !styleSampleIsCurrent;
  const styleSampleQualityPassed =
    styleSampleIsCurrent &&
    Boolean(styleSample?.qa?.passed) &&
    (styleSample?.speechCount ?? 0) > 0 &&
    (styleSample?.focusCount ?? 0) > 0;

  const startPlanningReveal = (pageNumbers: number[]) => {
    const normalized = Array.from(
      new Set(pageNumbers.filter((pageNumber) => Number.isFinite(pageNumber) && pageNumber > 0)),
    );
    if (planningRevealTimeoutRef.current != null) {
      window.clearTimeout(planningRevealTimeoutRef.current);
      planningRevealTimeoutRef.current = null;
    }
    if (normalized.length === 0) {
      setRevealingPlanningPageNumbers([]);
      return;
    }
    setRevealingPlanningPageNumbers(normalized);
    setPlanningRevealRevision((revision) => revision + 1);
    planningRevealTimeoutRef.current = window.setTimeout(() => {
      setRevealingPlanningPageNumbers([]);
      planningRevealTimeoutRef.current = null;
    }, 9000);
  };

  const selectPlanningPhase = (phase: PlanningPhase) => {
    setError(null);
    setActiveStep('outline');
    setPlanningPhase(phase);

    if (!hasPlanningMockStreams) {
      setCurrentPlanningPageNumbers([]);
      return;
    }

    const mockPages = buildMockPlanningPagesForPhase(phase);
    const page = pickMockPlanningPage(phase, mockPages);
    setOutlineGenerationStatus('ready');
    setOutlineGenerationMessage(
      `Mock：正在查看 ${getWorkspaceProgressLabel('outline', phase)} 的并行 stream。`,
    );
    setOutlineRows(buildMockPlanningRows());
    setPlanningPages(mockPages);
    setSelectedOutlineId(page.id);
    setCurrentPlanningPageNumbers([]);
    setPlanningRevealRevision((revision) => revision + 1);
    startPlanningReveal([page.pageNumber]);
  };

  const selectProgressStep = (step: WorkspaceProgressStep) => {
    setError(null);
    if (step.id === 'input') {
      setActiveStep('input');
      return;
    }
    if (step.planningPhase || step.planningPhases?.length) {
      selectPlanningPhase(
        step.planningPhase || planningPhase || step.planningPhases?.[0] || 'course-spine',
      );
      return;
    }
    if (step.id === 'result') {
      const hasExistingGenerationTask = activeGenerationTaskId
        ? generationTasks.some(
            (task) =>
              task.id === activeGenerationTaskId &&
              task.status !== 'failed' &&
              task.status !== 'cancelled',
          )
        : generationTasks.some(
            (task) =>
              task.courseId === courseId &&
              task.generateSlides &&
              (task.status === 'queued' || task.status === 'running'),
          );
      if (
        !hasExistingGenerationTask &&
        outlineGenerationStatus === 'ready' &&
        outlineRows.length > 0
      ) {
        void handleGenerate();
        return;
      }
      setActiveStep('result');
    }
  };

  const clearPlanningMockOverride = () => {
    clearPlanningMockStreamTimers();
    setPlanningMockStreams({});
    setPlanningMockPhaseStates({});
    setPlanningMockStreamingPhases([]);
  };

  const setPlanningMockPhaseState = (phase: PlanningPhase, state: PlanningMockPhaseState) => {
    clearPlanningMockStreamTimers();

    const mockPages = buildMockPlanningPagesForPhase(phase);
    const page = pickMockPlanningPage(phase, mockPages);
    const isLoadingState = state !== 'input' && state !== 'done';
    const mockText =
      state === 'input' ? null : state === 'done' ? buildPlanningPhaseMockText(phase, page) : '';

    setError(null);
    setActiveStep('outline');
    setPlanningPhase(phase);
    setOutlineGenerationStatus('ready');
    setOutlineGenerationMessage(
      `Mock：${getWorkspaceProgressLabel('outline', phase)} · ${PLANNING_MOCK_STATE_LABELS[state]}。`,
    );
    setOutlineRows(buildMockPlanningRows());
    setPlanningPages(mockPages);
    setSelectedOutlineId(page.id);
    setCurrentPlanningPageNumbers([]);
    setRevealingPlanningPageNumbers([]);
    setPlanningMockStreams({ [phase]: mockText });
    setPlanningMockPhaseStates({ [phase]: state });
    setPlanningMockStreamingPhases(isLoadingState ? [phase] : []);
    setPlanningRevealRevision((revision) => revision + 1);
  };

  const startParallelPlanningMockStreams = (initialPhase: PlanningPhase = planningPhase) => {
    clearPlanningMockStreamTimers();

    const initialMockPages = buildMockPlanningPagesForPhase(initialPhase);
    const initialPage = pickMockPlanningPage(initialPhase, initialMockPages);
    const initialStreams = Object.fromEntries(
      PLANNING_PHASE_ORDER.map((phase) => [phase, '']),
    ) as PlanningMockStreams;
    setError(null);
    setActiveStep('outline');
    setPlanningPhase(initialPhase);
    setOutlineGenerationStatus('ready');
    setOutlineGenerationMessage('Mock：页面规划和画图 prompt 正在同一条链路里写入。');
    setOutlineRows(buildMockPlanningRows());
    setPlanningPages(initialMockPages);
    setSelectedOutlineId(initialPage.id);
    setCurrentPlanningPageNumbers([]);
    setPlanningMockStreams(initialStreams);
    setPlanningMockPhaseStates({});
    setPlanningMockStreamingPhases([...PLANNING_PHASE_ORDER]);
    setPlanningRevealRevision((revision) => revision + 1);
    startPlanningReveal([initialPage.pageNumber]);

    PLANNING_PHASE_ORDER.forEach((phase, phaseIndex) => {
      const mockPages = buildMockPlanningPagesForPhase(phase);
      const page = pickMockPlanningPage(phase, mockPages);
      const fullText = buildPlanningPhaseMockText(phase, page);
      let length = 0;
      const chunkSize = phase === 'course-spine' ? 12 : 16;
      const intervalMs = 38 + phaseIndex * 8;
      const timerId = window.setInterval(() => {
        length = Math.min(fullText.length, length + chunkSize);
        setPlanningMockStreams((current) => ({
          ...current,
          [phase]: fullText.slice(0, length),
        }));
        if (length >= fullText.length) {
          window.clearInterval(timerId);
          planningMockStreamTimersRef.current = planningMockStreamTimersRef.current.filter(
            (id) => id !== timerId,
          );
          setPlanningMockStreamingPhases((current) =>
            current.filter((streamingPhase) => streamingPhase !== phase),
          );
        }
      }, intervalMs);
      planningMockStreamTimersRef.current.push(timerId);
    });
  };

  const generateStyleSample = useCallback(async () => {
    if (!selectedOutline) {
      setError('请先生成并选择一页规划，再跑单页质检。');
      return;
    }

    styleSampleAbortRef.current?.abort();
    const abortController = new AbortController();
    styleSampleAbortRef.current = abortController;

    const prompt = buildStyleSamplePrompt({
      outline: selectedOutline,
      outlineIndex: selectedOutlineIndex,
      totalOutlines: Math.max(outlineRows.length, 1),
      sourceFileName: form.sourceFile?.name,
      requirement: form.requirement,
      language,
      style: selectedStyle,
      customStylePrompt: drawingStylePrompt,
      palette: selectedPalette,
      sourceImages: selectedSourceImages,
      includeQuizScenes,
      workedExampleLevel,
    });

    setError(null);
    setStyleSampleError('');
    setStyleSampleStatus('loading');

    try {
      const baseHeaders = getApiHeaders({
        imageGenerationEnabled: true,
        modelIdOverride,
        notebookStageModelOverrides,
        notebookModelMode,
        testNoCharge: true,
      });
      const qualityCheckStage: Stage = {
        id: `create-notebook-image-quality-check-${courseId || 'draft'}`,
        courseId,
        name: form.sourceFile?.name
          ? `图片 notebook 质检：${form.sourceFile.name}`
          : '图片 notebook 质检',
        description: [
          `绘画风格：${selectedStyle.label}。`,
          `绘画风格 prompt：${drawingStylePrompt}`,
          `配色：${selectedPalette.label}，核心色 ${selectedPalette.colors.join(' / ')}。`,
          form.requirement.trim() || '根据当前输入创建一套中文图片笔记本。',
        ]
          .filter(Boolean)
          .join('\n'),
        language,
        style: [
          selectedStyle.label,
          hasCustomDrawingStyle && selectedStyleId !== 'custom' ? '自定义' : '',
          selectedPalette.label,
        ]
          .filter(Boolean)
          .join(' · '),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const courseContext = {
        name: qualityCheckStage.name,
        description: qualityCheckStage.description,
        tags: ['image-ppt', selectedStyle.label, selectedPalette.label],
        purpose: 'university' as const,
        language,
      };
      const baseOutlines = outlineRowsToSceneOutlines(outlineRows, language);
      const briefResponse = await backendFetch('/api/generate/image-notebook-briefs', {
        method: 'POST',
        headers: baseHeaders,
        body: JSON.stringify({
          stage: qualityCheckStage,
          outlines: baseOutlines,
          courseContext,
          language,
          sourceSummary: [prompt, sourceExtract.text].filter(Boolean).join('\n\n').slice(0, 12000),
        }),
        signal: abortController.signal,
      });
      const briefData = (await briefResponse
        .json()
        .catch(() => ({}))) as ImageNotebookBriefsResponse;
      if (!briefResponse.ok || !briefData.success || !briefData.plan) {
        throw new Error(briefData.error || `教师 brief 生成失败：HTTP ${briefResponse.status}`);
      }

      const plannedOutlines = attachImageNotebookPlanToOutlines(baseOutlines, briefData.plan);
      const qualityCheckOutline =
        plannedOutlines.find((outline) => outline.id === selectedOutline.id) || plannedOutlines[0];
      if (!qualityCheckOutline) {
        throw new Error('没有可用于单页质检的页面。');
      }
      const selectedMedia = filterSelectedSourceMedia({
        pdfImages: sourceExtract.pdfImages,
        imageMapping: sourceExtract.imageMapping,
        selectedImageIds: hasSelectableSourceImages ? selectedSourceImageIds : undefined,
      });
      const pageContentResponse = await backendFetch('/api/generate/notebook-page-content', {
        method: 'POST',
        headers: baseHeaders,
        body: JSON.stringify({
          outline: qualityCheckOutline,
          allOutlines: plannedOutlines,
          stage: qualityCheckStage,
          agents: [],
          courseContext,
          pdfImages: selectedMedia.pdfImages,
          imageMapping: selectedMedia.imageMapping,
          slideGenerationRoute: 'image-ppt',
          imageNotebookMaxAttempts: 1,
          includeActions: true,
        }),
        signal: abortController.signal,
      });
      const pageContentData = (await pageContentResponse
        .json()
        .catch(() => ({}))) as NotebookPageContentResponse;
      if (!pageContentResponse.ok || !pageContentData.success || !pageContentData.contentBundle) {
        throw new Error(
          pageContentData.error || `单页内容生成失败：HTTP ${pageContentResponse.status}`,
        );
      }
      const contentBundle = pageContentData.contentBundle;
      const imageUrl =
        pageContentData.image?.imageUrl ||
        getFullPageImageUrlFromContent(contentBundle.contents?.[0]);
      if (!imageUrl) {
        throw new Error('单页质检生成成功，但响应里没有可展示的整页图片。');
      }
      const qualityCheckScene = pageContentData.actionsResult?.scenes?.[0];
      const effectiveOutline =
        pageContentData.actionsResult?.effectiveOutlines?.[0] ||
        contentBundle.effectiveOutlines?.[0] ||
        qualityCheckOutline;
      const qa =
        contentBundle.imageNotebookQaByOutlineId?.[effectiveOutline.id] ||
        contentBundle.imageNotebookQaByOutlineId?.[qualityCheckOutline.id] ||
        Object.values(contentBundle.imageNotebookQaByOutlineId || {})[0];

      setStyleSample({
        imageUrl,
        prompt: String(
          pageContentData.image?.imagePrompt ||
            (contentBundle.contents?.[0] as { remark?: unknown } | undefined)?.remark ||
            prompt,
        ),
        key: currentStyleSampleKey,
        width: 1000,
        height: 562.5,
        providerId: pageContentData.image?.providerId || NOTEBOOK_IMAGE2_PROVIDER_ID,
        modelId: pageContentData.image?.modelId || NOTEBOOK_IMAGE2_MODEL_ID,
        qa,
        briefPageCount: briefData.plan.pageBriefs.length,
        speechCount: actionCount(qualityCheckScene, 'speech'),
        focusCount: actionCount(qualityCheckScene, 'focus'),
        sceneTitle: effectiveOutline.title,
        generatedAt: Date.now(),
      });
      setStyleSampleStatus('ready');
    } catch (err) {
      if (abortController.signal.aborted) return;
      const message = err instanceof Error ? err.message : '单页质检生成失败';
      log.error('Style sample generation failed:', err);
      setStyleSampleError(message);
      setStyleSampleStatus('error');
      setError(message);
    } finally {
      if (styleSampleAbortRef.current === abortController) {
        styleSampleAbortRef.current = null;
      }
    }
  }, [
    courseId,
    currentStyleSampleKey,
    drawingStylePrompt,
    form.requirement,
    hasCustomDrawingStyle,
    form.sourceFile?.name,
    includeQuizScenes,
    language,
    modelIdOverride,
    notebookModelMode,
    notebookStageModelOverrides,
    outlineRows,
    selectedOutline,
    selectedOutlineIndex,
    selectedPalette,
    selectedSourceImages,
    selectedStyle,
    selectedStyleId,
    sourceExtract.imageMapping,
    sourceExtract.pdfImages,
    sourceExtract.text,
    selectedSourceImageIds,
    hasSelectableSourceImages,
    workedExampleLevel,
  ]);

  const selectDrawingStyle = (style: (typeof STYLE_OPTIONS)[number]) => {
    setSelectedStyleId(style.id);
    setCustomStylePrompt(style.prompt);
    setConfirmedImageNotebookPlan(null);
    if (style.id === 'custom') {
      window.setTimeout(() => stylePromptTextareaRef.current?.focus(), 0);
    }
  };

  useEffect(() => {
    if (activeStep !== 'style') return;
    if (!selectedOutline) return;
    if (styleSampleStatus !== 'idle') return;
    if (styleSample?.imageUrl) return;
    void generateStyleSample();
  }, [activeStep, generateStyleSample, selectedOutline, styleSample?.imageUrl, styleSampleStatus]);

  const updateRequirement = (value: string) => {
    setConfirmedImageNotebookPlan(null);
    setForm((prev) => ({ ...prev, requirement: value }));
    updateRequirementCache(value);
  };

  const setSourceImageSelection = (imageId: string, keep: boolean) => {
    setSelectedSourceImageIds((current) => {
      if (keep) {
        return current.includes(imageId) ? current : [...current, imageId];
      }
      return current.filter((id) => id !== imageId);
    });
  };

  const setAllSourceImagesSelected = (keep: boolean) => {
    setSelectedSourceImageIds(keep ? sourcePreview.imagePreviews.map((image) => image.id) : []);
  };

  const setMaterialKeep = (itemId: string, keep: boolean) => {
    setMaterials((rows) => rows.map((row) => (row.id === itemId ? { ...row, keep } : row)));
    if ((itemId === 'pdf-images' || itemId === 'pptx-images') && hasSelectableSourceImages) {
      setAllSourceImagesSelected(keep);
    }
  };

  useEffect(() => {
    if (!hasSelectableSourceImages) return;
    const keepImages = selectedSourceImageIds.length > 0;
    setMaterials((rows) =>
      rows.map((row) =>
        row.id === 'pdf-images' || row.id === 'pptx-images' ? { ...row, keep: keepImages } : row,
      ),
    );
  }, [hasSelectableSourceImages, selectedSourceImageIds.length]);

  const openSettings = () => {
    router.push('/settings');
  };

  const showSetupToast = (icon: React.ReactNode, title: string, desc: string) => {
    toast.custom(
      (id) => (
        <div
          className="flex w-[356px] cursor-pointer items-start gap-3 rounded-xl border border-amber-200/60 bg-white p-4 shadow-lg shadow-amber-500/10 dark:border-amber-800/40 dark:bg-slate-900"
          onClick={() => {
            toast.dismiss(id);
            openSettings();
          }}
        >
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 ring-1 ring-amber-200/50 dark:bg-amber-900/40 dark:ring-amber-800/30">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight text-amber-900 dark:text-amber-200">
              {title}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-700/80 dark:text-amber-400/70">
              {desc}
            </p>
          </div>
        </div>
      ),
      { duration: 4000 },
    );
  };

  const handleFileSelect = (file: File) => {
    if (!isPdfSourceFile(file) && !isMarkdownSourceFile(file) && !isPptxSourceFile(file)) {
      setError('目前只支持 PDF、PPTX 或 Markdown（.md）文件。');
      return;
    }
    if (file.size > MAX_SOURCE_FILE_SIZE_BYTES) {
      setError(t('upload.fileTooLarge'));
      return;
    }
    setError(null);
    setConfirmedImageNotebookPlan(null);
    setForm((prev) => ({ ...prev, sourceFile: file }));
  };

  const handleSourceInputDragEnter = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    sourceDragDepthRef.current += 1;
    setSourceDragActive(true);
  };

  const handleSourceInputDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    event.dataTransfer.dropEffect = 'copy';
    setSourceDragActive(true);
  };

  const handleSourceInputDragLeave = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    sourceDragDepthRef.current = Math.max(0, sourceDragDepthRef.current - 1);
    if (sourceDragDepthRef.current === 0) setSourceDragActive(false);
  };

  const handleSourceInputDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    sourceDragDepthRef.current = 0;
    setSourceDragActive(false);
    if (busy) return;
    const file = event.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const prepareSourceInputForPlanning = async (
    signal?: AbortSignal,
  ): Promise<PreparedSourceInput> => {
    const file = form.sourceFile;
    if (!file) {
      const preview = buildRequirementPreview(form.requirement);
      const extract = { text: form.requirement, pdfImages: [], imageMapping: {} };
      setSourcePreview(preview);
      setSourceExtract(extract);
      setSelectedSourceImageIds([]);
      return { preview, extract, selectedImageIds: [] };
    }

    const parserSignal = signal ?? new AbortController().signal;
    setSelectedSourceImageIds([]);
    setSourcePreview({
      status: 'loading',
      items: [],
      imageCount: 0,
      imagePreviews: [],
      imageDuplicateCount: 0,
      warnings: [],
    });

    try {
      const parsed = await (async () => {
        if (isMarkdownSourceFile(file)) {
          const markdown = await parseMarkdownLikeGenerationInput({ file });
          return {
            text: markdown.pdfText,
            imageCount: 0,
            imagePreviews: [],
            imageDuplicateCount: 0,
            pdfImages: [],
            imageMapping: {},
            warnings: markdown.truncationWarnings,
          };
        }
        if (isPptxSourceFile(file)) {
          const pptx = await parsePptxLikeGenerationPreview({
            pptxFile: file,
            signal: parserSignal,
          });
          const imagePreviewResult = buildImagePreviews(pptx.pdfImages, pptx.imageMapping);
          return {
            text: pptx.pdfText,
            imageCount: pptx.pdfImages.length,
            imagePreviews: imagePreviewResult.imagePreviews,
            imageDuplicateCount: imagePreviewResult.duplicateCount,
            pdfImages: pptx.pdfImages,
            imageMapping: pptx.imageMapping,
            warnings: pptx.truncationWarnings,
          };
        }
        const pdf = await parsePdfLikeGenerationPreview({
          pdfFile: file,
          language,
          sourcePageSelection: sourcePageSelection ?? undefined,
          imageLimit: null,
          includeVisualRegionImages: true,
          signal: parserSignal,
        });
        const imagePreviewResult = buildImagePreviews(pdf.pdfImages, pdf.imageMapping);
        return {
          text: pdf.pdfText,
          imageCount: pdf.pdfImages.length,
          imagePreviews: imagePreviewResult.imagePreviews,
          imageDuplicateCount: imagePreviewResult.duplicateCount,
          pdfImages: pdf.pdfImages,
          imageMapping: pdf.imageMapping,
          warnings: pdf.truncationWarnings,
        };
      })();

      if (parserSignal.aborted) throw new Error('输入读取已取消');

      const selectedImageIds = parsed.imagePreviews.map((image) => image.id);
      const extract = {
        text: parsed.text,
        pdfImages: parsed.pdfImages,
        imageMapping: parsed.imageMapping,
      };
      const textItems = buildExtractedTextItems(parsed.text);
      const imageItem: ExtractedSourceItem[] =
        parsed.imageCount > 0
          ? [
              {
                id: 'images',
                title: '提取到的图片',
                detail: `系统将保留 ${parsed.imageCount} 张图片或图形区域作为生成依据。`,
                kind: '图片',
              },
            ]
          : [];
      const preview: ExtractedSourcePreview = {
        status: 'ready',
        items:
          textItems.length > 0
            ? [...textItems, ...imageItem].slice(0, 5)
            : [
                {
                  id: 'empty-text',
                  title: '未提取到可读正文',
                  detail: '这个文件可能以图片扫描为主，后续会尽量保留可用页面图像和文件信息。',
                  kind: '文本',
                },
                ...imageItem,
              ],
        imageCount: parsed.imageCount,
        imagePreviews: parsed.imagePreviews,
        imageDuplicateCount: parsed.imageDuplicateCount,
        warnings: parsed.warnings,
      };
      setSelectedSourceImageIds(selectedImageIds);
      setSourceExtract(extract);
      setSourcePreview(preview);
      return { preview, extract, selectedImageIds };
    } catch (err) {
      setSelectedSourceImageIds([]);
      setSourceExtract({ text: '', pdfImages: [], imageMapping: {} });
      setSourcePreview({
        status: 'error',
        items: [],
        imageCount: 0,
        imagePreviews: [],
        imageDuplicateCount: 0,
        warnings: [],
        message: err instanceof Error ? err.message : '输入读取失败',
      });
      throw err;
    }
  };

  const buildConfirmedRequirement = () => {
    const requirement = form.requirement.trim();
    const lines = [
      requirement || (form.sourceFile ? '请根据上传资料创建一套完整的图片 notebook。' : ''),
      '',
      '用户已确认以下生成方案：',
      `- 输出形式：整页图片 notebook，每页先由图像模型生成 16:9 课堂板书位图，再进入课堂播放。`,
      `- 绘画风格：${selectedStyle.label}。`,
      `- 绘画风格 prompt：${drawingStylePrompt}`,
      '- 画面基准：16:9 满画布、无白边/外框/居中卡片；保持课堂可读性，标题和公式/代码足够大；画面美术优先服从上面的绘画风格。',
      `- 色彩方向：${selectedPalette.label}。`,
      `- 篇幅档位：${outlineLengthLabel(outlineLength)}。`,
      `- 篇幅策略：${outlineLengthStrategyText(outlineLength)}`,
      `- 例题数量：${workedExampleLevelLabel(workedExampleLevel)}。`,
      `- 是否包含测验页：${includeQuizScenes ? '包含' : '不包含'}。`,
      styleSample?.qa
        ? `- 单页质量检查：QA ${styleSample.qa.passed ? '通过' : '未通过'}，speech ${
            styleSample.speechCount ?? 0
          } 段，focus ${styleSample.focusCount ?? 0} 个。`
        : '- 单页质量检查：尚未记录。',
      '',
      '本轮输入来源：',
      ...keptMaterials.map((item, index) => `${index + 1}. ${item.title}：${item.detail}`),
      ...(hasSelectableSourceImages
        ? [
            `图片保留：${selectedSourceImages.length}/${sourcePreview.imagePreviews.length} 张缩略图会进入生成依据。`,
            selectedSourceImages.length > 0
              ? `保留图片：${selectedSourceImages.map((image) => image.title).join('、')}`
              : '保留图片：无。',
          ]
        : []),
      '',
      '用户确认的页面规划顺序：',
      ...outlineRows.map((row, index) => `${index + 1}. ${row.title}：${row.focus}`),
    ];
    return lines.filter(Boolean).join('\n');
  };

  const buildOutlineGenerationRequirement = (sourceInput?: PreparedSourceInput) => {
    const requirement = form.requirement.trim();
    const preview = sourceInput?.preview ?? sourcePreview;
    const selectedIds = sourceInput?.selectedImageIds ?? selectedSourceImageIds;
    const selectedImageIdSet = new Set(selectedIds);
    const previewImages = preview.imagePreviews || [];
    const selectedImages = previewImages.filter((image) => selectedImageIdSet.has(image.id));
    const hasPreviewImages = previewImages.length > 0;
    const sourceItems = preview.items.slice(0, 5);
    const keptPdfPages =
      form.sourceFile && sourcePageSelection?.type === 'pdf'
        ? sourcePageSelection.pages
            .filter((page) => page.keep)
            .map((page) => page.pageNumber)
            .sort((a, b) => a - b)
        : [];
    const sourceFlowLines = form.sourceFile
      ? [
          `文件：${form.sourceFile.name}（${fileKindLabel(form.sourceFile)}，${formatFileSize(form.sourceFile.size)}）`,
          keptPdfPages.length ? `选中页码：${keptPdfPages.join(', ')}` : '',
          sourceItems.length
            ? '已解析内容：'
            : preview.status === 'loading'
              ? '已解析内容：正在读取文件流。'
              : '已解析内容：暂未得到可展示片段，继续使用文件文本流进入规划。',
          ...sourceItems.map(
            (item, index) => `${index + 1}. ${item.title}（${item.kind}）：${item.detail}`,
          ),
          hasPreviewImages
            ? `图片/图形区域：保留 ${selectedImages.length}/${previewImages.length} 张，供后续画图 prompt 和图片生成参考。`
            : '',
          preview.warnings.length ? `读取提示：${preview.warnings.slice(0, 2).join('；')}` : '',
          preview.status === 'error' ? `读取错误：${preview.message}` : '',
        ].filter(Boolean)
      : ['无上传文件，仅基于用户主题/问题生成。'];
    const lines = [
      '用户输入：',
      requirement ||
        (form.sourceFile ? '未填写额外文字需求；根据上传参考资料生成。' : '未填写明确主题。'),
      '',
      '来源流：',
      ...sourceFlowLines,
      '',
      '页面规划任务：',
      '根据当前输入直接生成一版可编辑页面规划，不需要单独确认素材；文件内容和文字需求都作为输入流进入规划。',
      '只决定整课主线、页面数量、每页涉及的知识点和教学动作；不要在这里写完整绘画 prompt。',
      '输出目标是整页图片 notebook，但本阶段只做页面规划。',
      `篇幅档位：${outlineLengthLabel(outlineLength)}。`,
      `篇幅策略：${outlineLengthStrategyText(outlineLength)}`,
      `例题数量：${workedExampleLevelLabel(workedExampleLevel)}。`,
      `测验页：${includeQuizScenes ? '可以包含轻量测验页' : '不要单独生成测验页'}。`,
      '',
      '教学约束：',
      '页面规划 AI 的任务只跟知识点和教学推进有关：不要把课号、校区、week/日期、作者/导师、页眉页脚、免责声明、logo/水印当作页面内容。',
      '第 1 页必须是学生视角的 overview / hook：用第一个真实知识点、公式、例题或方法提出“我们为什么要解决这个问题”，但不要从课程身份或来源信息开始，也不要写成教师路线图。',
      '第 2 页进入第一个实质讲解动作：定义边界、公式使用、例题走读、代码走读或证明走读。',
      '每页只安排一个清楚教学动作，避免把完整课堂压进单页。',
      '最后一页做总结、迁移练习或下一节课钩子。',
      '',
      '后续交接：',
      '页面规划会继续传给画图 prompt 线程；下一步再补全每页定义、公式、代码、题目原文、例题步骤和视觉要求。',
      `绘画风格只作为后续方向记录：${selectedStyle.label}。`,
    ];
    return lines.join('\n');
  };

  const generateOutlineForReview = async () => {
    if (!currentModelId) {
      showSetupToast(
        <BotOff className="size-4.5 text-amber-600 dark:text-amber-400" />,
        t('settings.modelNotConfigured'),
        t('settings.setupNeeded'),
      );
      openSettings();
      return;
    }

    if (!hasInput) {
      setError('请先输入想听的主题/问题，或上传一份参考资料。');
      setActiveStep('input');
      return;
    }

    setError(null);
    setActiveStep('outline');
    setOutlineGenerationStatus('loading');
    setOutlineGenerationMessage(
      form.sourceFile ? '正在读取参考资料并生成规划与 prompt…' : '正在根据主题生成规划与 prompt…',
    );
    setOutlineRows([]);
    setSelectedOutlineId('');
    setPlanningCourseSpine(null);
    setPlanningPages([]);
    setConfirmedImageNotebookPlan(null);
    setPlanningLiveDraft(null);
    setPlanningStreamEvents([]);
    setPlanningQuality(null);
    setPlanningPhase('course-spine');
    clearPlanningMockStreamTimers();
    setPlanningMockStreams({});
    setPlanningMockPhaseStates({});
    setPlanningMockStreamingPhases([]);
    setPlanningRealPhaseStates({ 'course-spine': 'connecting' });
    setCurrentPlanningPageNumbers([]);
    setRevealingPlanningPageNumbers([]);
    setPlanningRevealRevision(0);
    if (planningRevealTimeoutRef.current != null) {
      window.clearTimeout(planningRevealTimeoutRef.current);
      planningRevealTimeoutRef.current = null;
    }
    styleSampleAbortRef.current?.abort();
    setStyleSample(null);
    setStyleSampleStatus('idle');
    setStyleSampleError('');

    outlineAbortRef.current?.abort();
    const abortController = new AbortController();
    outlineAbortRef.current = abortController;

    try {
      const preparedSource = await prepareSourceInputForPlanning(abortController.signal);
      if (abortController.signal.aborted) return;
      const userProfile = useUserProfileStore.getState();
      const selectedMedia = filterSelectedSourceMedia({
        pdfImages: preparedSource.extract.pdfImages,
        imageMapping: preparedSource.extract.imageMapping,
        selectedImageIds:
          preparedSource.preview.imagePreviews.length > 0
            ? preparedSource.selectedImageIds
            : undefined,
      });
      const basePayload = {
        requirements: {
          requirement: buildOutlineGenerationRequirement(preparedSource),
          language,
          userNickname: userProfile.nickname || undefined,
          userBio: userProfile.bio || undefined,
          webSearch: false,
        },
        pdfText: preparedSource.extract.text,
        agents: [],
        coursePurpose: 'university',
        notebookContext: {
          courseId,
        },
        outlinePreferences: {
          length: outlineLength,
          includeQuizScenes,
          workedExampleLevel,
        },
      };
      const budgetedMedia = buildBudgetedGenerationMedia({
        basePayload,
        pdfImages: selectedMedia.pdfImages,
        imageMapping: selectedMedia.imageMapping,
        preferredImageIds: selectedSourceImageIds,
        maxRequestBytes: SAFE_GENERATION_REQUEST_BYTES,
      });
      const payload = {
        ...basePayload,
        ...(budgetedMedia.pdfImages ? { pdfImages: budgetedMedia.pdfImages } : {}),
        ...(budgetedMedia.imageMapping ? { imageMapping: budgetedMedia.imageMapping } : {}),
      };

      const headers = new Headers(
        getApiHeaders({
          imageGenerationEnabled: true,
          modelIdOverride,
          notebookStageModelOverrides,
          notebookModelMode,
          testNoCharge: true,
        }),
      );
      headers.set('Accept', 'text/event-stream');

      setOutlineGenerationMessage('正在生成整课主线和页面索引…');
      setPlanningStreamEvents(['启动整本页面规划流']);
      const response = await backendFetch('/api/generate/image-notebook-plan-stream', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const message = await readApiErrorMessage(response, '页面规划生成失败');
        throw new Error(message);
      }

      let streamedOutlines: SceneOutline[] = [];
      let expectedPlanningPageCount = 0;
      const mergeStreamedOutlines = (incoming: SceneOutline[]) => {
        const next = [...streamedOutlines];
        for (const outline of incoming) {
          const index = Math.max(0, (outline.order || next.length + 1) - 1);
          next[index] = outline;
        }
        streamedOutlines = next.filter(Boolean);
        return streamedOutlines;
      };
      const appendStreamEvent = (message: string) => {
        setPlanningStreamEvents((events) => [message, ...events].slice(0, 8));
      };

      await readImageNotebookPlanStream(response, (event) => {
        if (abortController.signal.aborted) return;
        if (event.type === 'status') {
          setOutlineGenerationMessage(event.detail);
          if (!planningCourseSpine && !planningPages.length) {
            setPlanningRealPhaseStates((current) => ({
              ...current,
              'course-spine': 'spine-loading',
            }));
          }
          appendStreamEvent(event.detail);
          return;
        }
        if (event.type === 'draft') {
          const detail =
            event.detail ||
            (event.phase === 'batch' ? '正在接收画图 prompt 草稿…' : '正在接收页面规划草稿…');
          setPlanningLiveDraft({
            phase: event.phase,
            detail,
            text: event.text || '',
          });
          setOutlineGenerationMessage(detail);
          setPlanningPhase(event.phase === 'batch' ? 'page-brief' : 'course-spine');
          setPlanningRealPhaseStates((current) => ({
            ...current,
            [event.phase === 'batch' ? 'page-brief' : 'course-spine']:
              event.phase === 'batch' ? 'index-loading' : 'spine-loading',
          }));
          appendStreamEvent(detail);
          return;
        }
        if (event.type === 'blueprint') {
          setPlanningLiveDraft(null);
          if (event.courseSpine) setPlanningCourseSpine(event.courseSpine);
          if (event.quality) setPlanningQuality(event.quality);
          const previews = pagePlanningPreviewsFromBlueprint(event.pageIndex);
          expectedPlanningPageCount = previews.length;
          setPlanningPages(previews);
          setPlanningRealPhaseStates((current) => ({
            ...current,
            'course-spine': 'done',
            'page-brief': previews.length > 0 ? 'connecting' : current['page-brief'],
          }));
          const rows = (event.pageIndex || []).map((page, index) => ({
            id: `outline-${page.pageNumber || index + 1}`,
            title: page.title?.trim() || `第 ${index + 1} 页`,
            focus:
              page.currentJob?.trim() ||
              page.keyPoints?.filter(Boolean).slice(0, 4).join('；') ||
              '等待详细页面规划…',
          }));
          if (rows.length > 0) {
            setOutlineRows(rows);
            setSelectedOutlineId((current) => current || rows[0]?.id || '');
            setOutlineGenerationMessage(
              `已生成 ${rows.length} 页页面规划，正在每批 4 页并行生成画图 prompt…`,
            );
            appendStreamEvent(`页面规划完成：${rows.length} 页`);
          }
          return;
        }
        if (event.type === 'batch-start') {
          setPlanningLiveDraft(null);
          setPlanningPhase('page-brief');
          const pageNumbers =
            event.pageNumbers?.filter((pageNumber) => Number.isFinite(pageNumber)) ||
            (event.startPage && event.endPage
              ? Array.from(
                  { length: Math.max(0, event.endPage - event.startPage + 1) },
                  (_, index) => event.startPage! + index,
                )
              : []);
          setCurrentPlanningPageNumbers(pageNumbers);
          setPlanningRealPhaseStates((current) => ({
            ...current,
            'course-spine': 'done',
            'page-brief': 'index-loading',
          }));
          const label =
            event.startPage && event.endPage
              ? `第 ${event.startPage}-${event.endPage} 页`
              : `第 ${(event.batchIndex ?? 0) + 1} 批`;
          const detail =
            event.attempt && event.attempt > 0
              ? `正在重试${label}画图 prompt…`
              : `正在生成${label}画图 prompt…`;
          setOutlineGenerationMessage(detail);
          appendStreamEvent(detail);
          return;
        }
        if (event.type === 'pages') {
          setPlanningLiveDraft(null);
          const incomingPageNumbers = Array.from(
            new Set(
              (
                event.pageNumbers ||
                event.outlines
                  ?.map((outline, index) => outline.order || (event.startPage || 1) + index)
                  .filter(Boolean) ||
                []
              ).filter((pageNumber) => Number.isFinite(pageNumber)),
            ),
          );
          const batchLabel =
            event.startPage && event.endPage
              ? `第 ${event.startPage}-${event.endPage} 页`
              : undefined;
          const merged = mergeStreamedOutlines(event.outlines || []);
          const completedPageCount = merged.length;
          const incomingRows = sceneOutlinesToRows(event.outlines || []);
          setOutlineRows((current) => {
            const next = current.length ? [...current] : sceneOutlinesToRows(merged);
            incomingRows.forEach((row, index) => {
              const order = Math.max(
                0,
                (event.outlines?.[index]?.order || (event.startPage || 1) + index) - 1,
              );
              next[order] = row;
            });
            return next.filter(Boolean);
          });
          setSelectedOutlineId((current) => {
            if (current && incomingRows.some((row) => row.id === current)) return current;
            return current || incomingRows[0]?.id || '';
          });
          setPlanningPages((pages) =>
            mergePagePlanningPreviews(
              pages,
              pagePlanningPreviewsFromOutlines(event.outlines, event.pageBriefs, batchLabel),
            ),
          );
          setPlanningRealPhaseStates((current) => ({
            ...current,
            'course-spine': 'done',
            'page-brief':
              expectedPlanningPageCount > 0 && completedPageCount >= expectedPlanningPageCount
                ? 'done'
                : completedPageCount > 0
                  ? 'index-first-page'
                  : 'index-loading',
          }));
          startPlanningReveal(incomingPageNumbers);
          const detail = `${batchLabel || '一批页面'}画图 prompt 完成`;
          setOutlineGenerationMessage(detail);
          appendStreamEvent(detail);
          return;
        }
        if (event.type === 'quality') {
          setPlanningLiveDraft(null);
          if (event.quality) setPlanningQuality(event.quality);
          setPlanningRealPhaseStates((current) => ({
            ...current,
            'course-spine': current['course-spine'] || 'done',
            'page-brief': 'done',
          }));
          appendStreamEvent(
            event.quality?.passed
              ? '页面规划和画图 prompt 检查通过'
              : '页面规划和画图 prompt 需要检查',
          );
          return;
        }
        if (event.type === 'done') {
          setPlanningLiveDraft(null);
          streamedOutlines = event.outlines?.length ? event.outlines : streamedOutlines;
          if (event.plan?.courseSpine) setPlanningCourseSpine(event.plan.courseSpine);
          if (event.planQuality) setPlanningQuality(event.planQuality);
          setPlanningRealPhaseStates({
            'course-spine': 'done',
            'page-brief': 'done',
          });
          if (event.plan && streamedOutlines.length) {
            setConfirmedImageNotebookPlan({
              outlines: streamedOutlines,
              plan: event.plan,
            });
          }
          setCurrentPlanningPageNumbers([]);
          setRevealingPlanningPageNumbers([]);
          if (planningRevealTimeoutRef.current != null) {
            window.clearTimeout(planningRevealTimeoutRef.current);
            planningRevealTimeoutRef.current = null;
          }
          setPlanningPages(
            pagePlanningPreviewsFromOutlines(streamedOutlines, event.plan?.pageBriefs, '最终规划'),
          );
          appendStreamEvent(
            `页面规划和画图 prompt 完成：${event.outlines?.length || streamedOutlines.length} 页`,
          );
        }
      });

      if (!streamedOutlines.length) {
        throw new Error('没有生成可用页面规划');
      }
      const rows = sceneOutlinesToRows(streamedOutlines);
      if (rows.length === 0) {
        throw new Error('没有生成可用页面规划');
      }
      setOutlineRows(rows);
      setSelectedOutlineId(rows[0]?.id || '');
      setOutlineGenerationStatus('ready');
      setCurrentPlanningPageNumbers([]);
      setRevealingPlanningPageNumbers([]);
      setPlanningLiveDraft(null);
      setPlanningRealPhaseStates({
        'course-spine': 'done',
        'page-brief': 'done',
      });
      setOutlineGenerationMessage(
        `已生成 ${rows.length} 页页面规划和画图 prompt，可以并行生成图片。`,
      );
    } catch (err) {
      if (abortController.signal.aborted) return;
      log.error('Outline review generation failed:', err);
      const message = err instanceof Error ? err.message : '页面规划生成失败';
      setOutlineGenerationStatus('error');
      setCurrentPlanningPageNumbers([]);
      setPlanningLiveDraft(null);
      setPlanningRealPhaseStates({});
      setOutlineGenerationMessage(message);
      setError(message);
    } finally {
      if (outlineAbortRef.current === abortController) {
        outlineAbortRef.current = null;
      }
    }
  };

  const handleGenerate = async (forcedSelection?: PdfSourceSelection) => {
    if (!currentModelId) {
      showSetupToast(
        <BotOff className="size-4.5 text-amber-600 dark:text-amber-400" />,
        t('settings.modelNotConfigured'),
        t('settings.setupNeeded'),
      );
      openSettings();
      return;
    }

    if (!hasInput) {
      setError('请先输入想听的主题/问题，或上传一份参考资料。');
      setActiveStep('input');
      return;
    }

    const cid = courseId.trim();
    if (!cid) {
      setError('请先从「我的课程」进入某一门课程，再创建笔记本。');
      return;
    }

    const effectiveSelection = (() => {
      const sourceFile = form.sourceFile;
      if (!sourceFile || !isPdfSourceFile(sourceFile)) return undefined;
      const signature = getPdfSourceFileSignature(sourceFile);
      const candidate = forcedSelection ?? sourcePageSelection ?? undefined;
      return candidate?.fileSignature === signature ? candidate : undefined;
    })();

    if (
      form.sourceFile &&
      isPdfSourceFile(form.sourceFile) &&
      form.sourceFile.size > PDF_PAGE_SELECTION_MAX_BYTES &&
      !effectiveSelection
    ) {
      setPageSelectionDialogOpen(true);
      return;
    }

    setError(null);
    setBusy(true);
    setActiveStep('result');

    try {
      const userProfile = useUserProfileStore.getState();
      const generationTask = enqueueNotebookGeneration(
        {
          courseId: cid,
          requirement: buildConfirmedRequirement(),
          notebookModelMode,
          modelIdOverride,
          notebookStageModelOverrides,
          language,
          webSearch: false,
          generateSlides: true,
          slideGenerationRoute: 'image-ppt',
          sourceFile: form.sourceFile,
          sourcePageSelection: effectiveSelection,
          sourceImageIds: hasSelectableSourceImages ? selectedSourceImageIds : undefined,
          confirmedImageNotebookOutlines:
            confirmedImageNotebookPlan?.outlines ||
            (outlineGenerationStatus === 'ready' && outlineRows.length > 0
              ? outlineRowsToSceneOutlines(outlineRows, language)
              : undefined),
          confirmedImageNotebookPlan: confirmedImageNotebookPlan?.plan,
          userNickname: userProfile.nickname || undefined,
          userBio: userProfile.bio || undefined,
          imageGenerationEnabledOverride: true,
          outlinePreferences: {
            length: outlineLength,
            includeQuizScenes,
            workedExampleLevel,
          },
        },
        {
          onProgress: (_task, progress) => {
            if (progress.stage === 'notebook-ready') {
              window.dispatchEvent(
                new CustomEvent('synatra-notebook-list-updated', {
                  detail: { courseId: cid, notebookId: progress.notebookId },
                }),
              );
            }
          },
          onCompleted: (_task, result) => {
            window.dispatchEvent(
              new CustomEvent('synatra-notebook-list-updated', {
                detail: { courseId: cid, notebookId: result.stage.id },
              }),
            );
            enqueueCompanionBanner(
              buildStudyCompanionNotification({
                id: `notebook-ready:${result.stage.id}`,
                sourceKind: 'notebook_ready',
                title: '笔记本生成好了',
                body:
                  result.scenes.length > 0
                    ? `笔记本「${result.stage.name}」已创建完成，共 ${result.scenes.length} 页。`
                    : `笔记本「${result.stage.name}」已加入仓库。`,
                amountLabel: '生成好了',
                sourceLabel: '笔记本生成',
                details: [
                  { key: 'notebook', label: '笔记本', value: result.stage.name },
                  { key: 'pages', label: '页面数', value: String(result.scenes.length) },
                ],
              }),
            );
          },
          onFailed: (_task, message) => {
            toast.error(`笔记本生成失败：${message}`);
          },
          onCancelled: () => {
            toast.info('已取消笔记本生成任务');
          },
        },
      );
      setActiveGenerationTaskId(generationTask.id);
      toast.success('已加入生成队列');
    } catch (err) {
      log.error('Error preparing generation:', err);
      setError(err instanceof Error ? err.message : t('upload.generateFailed'));
    } finally {
      setBusy(false);
    }
  };

  const goNext = () => {
    if (activeStep === 'input') {
      if (!hasInput) {
        setError('请先输入想听的主题/问题，或上传一份参考资料。');
        return;
      }
      void generateOutlineForReview();
    } else if (activeStep === 'materials') {
      void generateOutlineForReview();
    } else if (activeStep === 'outline') {
      if (outlineNeedsInitialGeneration) {
        void generateOutlineForReview();
        return;
      }
      if (outlineGenerationStatus === 'loading') {
        setError('页面规划和画图 prompt 还在生成中，完成后再并行生成图片。');
        return;
      }
      if (outlineGenerationStatus !== 'ready' || outlineRows.length === 0) {
        setError('请先生成并确认页面规划。');
        return;
      }
      void handleGenerate();
    } else if (activeStep === 'style') {
      if (!styleSampleQualityPassed) {
        setError('请先在当前生成方案下跑通单页质量检查。');
        return;
      }
      void handleGenerate();
    }
  };

  const goBack = () => {
    if (activeStep === 'materials') setActiveStep('input');
    if (activeStep === 'outline') {
      setActiveStep('input');
    }
    if (activeStep === 'style') {
      setPlanningPhase('page-brief');
      setActiveStep('outline');
    }
    if (activeStep === 'result') setActiveStep('outline');
  };

  const addOutlineRow = () => {
    const id = `custom-${Date.now()}`;
    setConfirmedImageNotebookPlan(null);
    setOutlineRows((rows) => [
      ...rows,
      { id, title: '新增页面', focus: '补充一个需要单独讲清楚的知识点。' },
    ]);
    setSelectedOutlineId(id);
  };

  const confirmedGenerationPromptPreview = outlineRows.length ? buildConfirmedRequirement() : '';
  const planningInputPageLines = planningListPages.length
    ? planningListPages.map((page) =>
        [
          `${String(page.pageNumber).padStart(2, '0')}. ${page.title}`,
          `   role: ${page.pageRole || 'pending'}`,
          `   currentJob: ${page.currentJob}`,
        ].join('\n'),
      )
    : outlineRows.map((row, index) =>
        [`${String(index + 1).padStart(2, '0')}. ${row.title}`, `   focus: ${row.focus}`].join(
          '\n',
        ),
      );
  const planningPromptBatchNumbers =
    currentPlanningPageNumbers.length > 0
      ? currentPlanningPageNumbers
      : planningListPages.length > 0
        ? planningListPages.map((page) => page.pageNumber).slice(0, 4)
        : outlineRows.map((_row, index) => index + 1).slice(0, 4);
  const planningInputPreview =
    planningPhase === 'course-spine'
      ? buildOutlineGenerationRequirement()
      : [
          '画图 prompt 生成输入',
          '',
          '并行策略：每个 thread 负责 4 页，根据页面规划生成完整画图 prompt。',
          planningPromptBatchNumbers.length
            ? `当前批次页码：${planningPromptBatchNumbers.join(', ')}`
            : '当前批次页码：等待页面规划。',
          '',
          `绘画风格：${selectedStyle.label}`,
          `绘画风格 prompt：${drawingStylePrompt}`,
          `篇幅档位：${outlineLengthLabel(outlineLength)}`,
          '',
          '页面规划输入：',
          ...(planningInputPageLines.length ? planningInputPageLines : ['等待页面规划输出…']),
          '',
          '画图 prompt 必须写清：定义全文、公式全文、代码全文、题目原文、例题步骤和必须避免的误区。',
        ].join('\n');
  const activeGenerationTask =
    (activeGenerationTaskId
      ? generationTasks.find((task) => task.id === activeGenerationTaskId)
      : undefined) ||
    [...generationTasks]
      .reverse()
      .find(
        (task) =>
          task.courseId === courseId &&
          task.generateSlides &&
          ['queued', 'running'].includes(task.status),
      ) ||
    null;
  const runtimeImageGenerationRows = buildRuntimeImageGenerationRows(activeGenerationTask);
  const plannedImageGenerationRows =
    outlineRows.length > 0 ? outlineRows : runtimeImageGenerationRows;
  const imageGenerationGridRows = imageGenerationMockPageCount
    ? takeImageGenerationRowsWithFallback(plannedImageGenerationRows, imageGenerationMockPageCount)
    : plannedImageGenerationRows;
  const canStartImageGenerationFromResult =
    !activeGenerationTask &&
    outlineGenerationStatus === 'ready' &&
    outlineRows.length > 0 &&
    imageGenerationMockPageCount === null;
  const currentPilotImagePromptPreview = selectedOutline
    ? buildStyleSamplePrompt({
        outline: selectedOutline,
        outlineIndex: selectedOutlineIndex,
        totalOutlines: Math.max(outlineRows.length, 1),
        sourceFileName: form.sourceFile?.name,
        requirement: form.requirement,
        language,
        style: selectedStyle,
        customStylePrompt: drawingStylePrompt,
        palette: selectedPalette,
        sourceImages: selectedSourceImages,
        includeQuizScenes,
        workedExampleLevel,
      })
    : '';
  const visiblePilotImagePrompt = styleSample?.prompt || currentPilotImagePromptPreview;
  const copyPrompt = async (value: string, label: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label}已复制`);
    } catch (err) {
      log.error('Copy prompt failed:', err);
      toast.error(`${label}复制失败`);
    }
  };
  const drawingStylePromptCharacterCount = customStylePrompt.trim().length;

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <PdfPageSelectionDialog
        open={pageSelectionDialogOpen}
        file={form.sourceFile}
        language={language}
        onOpenChange={setPageSelectionDialogOpen}
        onConfirm={(selection) => {
          setSourcePageSelection(selection);
          setPageSelectionDialogOpen(false);
          void handleGenerate(selection);
        }}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden lg:flex-row lg:gap-7">
        <aside className="shrink-0 lg:flex lg:w-[118px] lg:items-center lg:justify-center">
          <StepProgress
            activeStep={activeStep}
            planningPhase={planningPhase}
            streamingPhases={displayedPlanningStreamingPhases}
            completedPhases={completedPlanningPhases}
            onStepSelect={selectProgressStep}
            className="lg:w-[96px]"
          />
        </aside>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden lg:overflow-visible">
          <div className="min-h-0 flex-1 overflow-hidden lg:overflow-visible">
            {activeStep === 'input' ? (
              <div className="grid h-full min-h-0 gap-7 overflow-y-auto pb-2 pr-1 overscroll-contain lg:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)] lg:overflow-visible lg:pb-0 lg:pr-0">
                <section className="flex min-h-0 flex-col gap-3 lg:pl-6">
                  <div
                    className={cn(
                      'relative flex min-h-0 flex-1 flex-col overflow-visible rounded-[28px] border border-sky-100/90 bg-white/[0.92] p-5 shadow-[0_22px_80px_rgba(15,23,42,0.10)] ring-1 ring-white/80 transition-all lg:pl-12 dark:border-white/[0.08] dark:bg-white/[0.04] dark:ring-white/[0.04]',
                      sourceDragActive &&
                        'border-blue-500/55 bg-blue-50/70 ring-4 ring-blue-500/10 dark:border-cyan-300/50 dark:bg-blue-500/15',
                    )}
                    onDragEnter={handleSourceInputDragEnter}
                    onDragLeave={handleSourceInputDragLeave}
                    onDragOver={handleSourceInputDragOver}
                    onDrop={handleSourceInputDrop}
                  >
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute bottom-0 left-0 top-0 hidden w-4 rounded-l-[28px] border-r border-slate-900/[0.045] bg-gradient-to-r from-slate-100/50 via-white/55 to-transparent lg:block"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute -left-[18px] top-14 hidden h-[190px] w-[44px] lg:block"
                    >
                      {[0, 1, 2, 3].map((ring) => (
                        <span
                          key={ring}
                          className="absolute left-0 h-2 w-[44px] rounded-full border border-slate-400/55 bg-gradient-to-r from-slate-500/75 via-white to-slate-200 shadow-[0_2px_5px_rgba(15,23,42,0.18)]"
                          style={{ top: `${ring * 46}px` }}
                        >
                          <span className="absolute left-[5px] top-1/2 h-px w-8 -translate-y-1/2 rounded-full bg-white/80" />
                        </span>
                      ))}
                    </div>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute -left-2 bottom-[72px] hidden h-14 w-7 rotate-[20deg] rounded-full border-2 border-slate-300/80 border-r-slate-400/75 shadow-[0_2px_6px_rgba(15,23,42,0.14)] lg:block"
                    >
                      <span className="absolute left-1.5 top-1.5 h-11 w-4 rounded-full border-2 border-slate-300/75 border-r-slate-400/65" />
                    </span>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute left-12 right-8 top-[82px] hidden h-px bg-slate-900/[0.075] lg:block"
                    />
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="flex size-11 items-center justify-center rounded-[14px] bg-slate-950 text-white shadow-sm shadow-slate-950/20 dark:bg-white dark:text-slate-950">
                          <Sparkles className="size-4" />
                        </span>
                        <Label className="text-[17px] font-semibold">主题或问题</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <SpeechButton
                          size="md"
                          disabled={busy}
                          onTranscription={(text) => {
                            const next = form.requirement + (form.requirement ? ' ' : '') + text;
                            updateRequirement(next);
                          }}
                        />
                      </div>
                    </div>
                    <Textarea
                      value={form.requirement}
                      onChange={(event) => updateRequirement(event.target.value)}
                      placeholder="例如：讲一下 loop，生成 5 页以下 overview；或者讲清黎曼积分的直观含义、定义和一个轻量例题。"
                      className="mt-6 min-h-[300px] flex-1 resize-none rounded-none border-0 bg-transparent px-0 py-2 text-[16px] leading-10 shadow-none placeholder:text-slate-500/[0.72] focus-visible:ring-0 lg:mb-[104px] dark:bg-transparent"
                      disabled={busy}
                      style={{
                        backgroundImage:
                          'linear-gradient(to bottom, transparent 38px, rgba(100, 116, 139, 0.18) 39px, rgba(100, 116, 139, 0.18) 40px, transparent 40px)',
                        backgroundSize: '100% 40px',
                      }}
                    />

                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept=".pdf,.pptx,.md,text/markdown,text/x-markdown,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) handleFileSelect(file);
                        event.target.value = '';
                      }}
                    />
                    <div
                      className={cn(
                        'mt-5 flex items-center justify-between gap-3 rounded-[22px] border border-dashed px-5 py-4 transition-colors lg:absolute lg:bottom-5 lg:left-12 lg:right-5 lg:mt-0',
                        sourceDragActive
                          ? 'border-blue-500/45 bg-white/95 shadow-sm shadow-blue-900/[0.04] dark:bg-blue-500/10'
                          : form.sourceFile
                            ? 'border-teal-500/30 bg-white/85 shadow-sm shadow-teal-900/[0.03] dark:bg-teal-500/10'
                            : 'border-slate-900/[0.08] bg-white/70 hover:border-blue-400/45 hover:bg-white/95 dark:border-white/[0.08] dark:bg-white/[0.04] dark:hover:bg-blue-500/10',
                      )}
                    >
                      <button
                        type="button"
                        className="group flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={busy}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <span className="flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-blue-600 text-white shadow-sm shadow-blue-900/20">
                          {form.sourceFile ? (
                            <FileText className="size-4" />
                          ) : (
                            <FileUp className="size-4" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[15px] font-semibold">
                            {form.sourceFile ? form.sourceFile.name : '上传参考资料（可选）'}
                          </span>
                          <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                            {form.sourceFile
                              ? `${fileKindLabel(form.sourceFile)} · ${formatFileSize(form.sourceFile.size)}`
                              : `PDF / PPTX / Markdown，不超过 ${MAX_SOURCE_FILE_SIZE_MB}MB。`}
                          </span>
                        </span>
                      </button>
                      {form.sourceFile ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="移除源文件"
                          className="size-8 shrink-0 rounded-lg text-muted-foreground hover:text-rose-600"
                          disabled={busy}
                          onClick={() => {
                            setConfirmedImageNotebookPlan(null);
                            setForm((prev) => ({ ...prev, sourceFile: null }));
                          }}
                        >
                          <X className="size-4" />
                        </Button>
                      ) : (
                        <span className="hidden flex-wrap justify-end gap-1.5 sm:flex">
                          {['PDF', 'PPTX', 'Markdown'].map((kind) => (
                            <span
                              key={kind}
                              className="rounded-full border border-slate-900/[0.06] bg-white/80 px-2.5 py-1 text-[11px] font-medium text-slate-600 shadow-sm backdrop-blur dark:border-white/[0.08] dark:bg-white/[0.08] dark:text-slate-300"
                            >
                              {kind}
                            </span>
                          ))}
                        </span>
                      )}
                      <span className="sr-only">文件只作为补充，不是生成 notebook 的必填项。</span>
                    </div>
                  </div>
                </section>

                <section className="flex min-h-0 flex-col gap-3">
                  <div className="flex min-h-0 flex-1 flex-col rounded-[28px] border border-blue-200/80 bg-[#f5f9ff]/[0.92] p-5 shadow-[0_22px_80px_rgba(37,99,235,0.10)] ring-1 ring-white/80 dark:border-white/[0.08] dark:bg-white/[0.04] dark:ring-white/[0.04]">
                    <div className="flex min-h-0 flex-1 flex-col">
                      <div className="mb-5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="flex size-12 items-center justify-center rounded-full bg-blue-600/10 text-blue-700 shadow-sm shadow-blue-900/[0.04] ring-1 ring-blue-600/10 dark:text-blue-200">
                            <Wand2 className="size-4" />
                          </span>
                          <div>
                            <Label className="text-[17px] font-semibold">绘画风格</Label>
                            <p className="mt-0.5 text-xs text-muted-foreground">画面美术</p>
                          </div>
                        </div>
                        <span className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-900/[0.06] bg-white/75 px-3 py-2 text-xs font-medium text-slate-600 shadow-sm dark:bg-white/[0.08] dark:text-slate-300">
                          <PencilLine className="size-3.5" />
                          {selectedStyleId === 'custom'
                            ? '自定义'
                            : hasCustomDrawingStyle
                              ? `${selectedStyle.label} + 自定义`
                              : selectedStyle.label}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                        {STYLE_OPTIONS.map((style) => {
                          const selected = selectedStyleId === style.id;
                          return (
                            <button
                              key={style.id}
                              type="button"
                              disabled={busy}
                              className={cn(
                                'relative min-h-12 rounded-2xl border px-2.5 py-2 text-center text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                                selected
                                  ? 'border-blue-500/50 bg-blue-500/10 text-blue-950 shadow-sm shadow-blue-950/[0.05] dark:text-blue-100'
                                  : 'border-slate-900/[0.06] bg-white/[0.76] shadow-sm shadow-slate-950/[0.035] hover:border-blue-400/35 hover:bg-white dark:border-white/[0.08] dark:bg-black/20 dark:hover:bg-blue-500/10',
                              )}
                              onClick={() => selectDrawingStyle(style)}
                            >
                              {style.label}
                              {selected ? (
                                <span className="absolute -bottom-3 left-1/2 h-1 w-7 -translate-x-1/2 rounded-full bg-blue-600" />
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                      <div className="relative mt-6 flex min-h-[220px] flex-1">
                        <Textarea
                          ref={stylePromptTextareaRef}
                          value={customStylePrompt}
                          onChange={(event) => {
                            setCustomStylePrompt(event.target.value);
                            setConfirmedImageNotebookPlan(null);
                          }}
                          placeholder="也可以直接输入绘画风格，例如：像可汗学院黑板手绘、Notability 手写笔记、水彩示意图、极简线稿、漫画分镜感..."
                          className="h-full min-h-[220px] flex-1 resize-none rounded-[18px] border border-blue-400/45 bg-white/[0.86] px-5 py-5 pb-12 text-sm leading-7 shadow-[inset_0_1px_5px_rgba(15,23,42,0.04)] placeholder:text-muted-foreground/55 focus-visible:border-blue-500/70 focus-visible:ring-blue-500/20 dark:border-white/[0.08] dark:bg-black/20"
                          disabled={busy}
                          style={{
                            backgroundImage:
                              'linear-gradient(to bottom, transparent 27px, rgba(15, 23, 42, 0.035) 28px)',
                            backgroundSize: '100% 28px',
                          }}
                        />
                        <span className="pointer-events-none absolute bottom-4 right-11 text-xs text-slate-500">
                          {drawingStylePromptCharacterCount} / 300
                        </span>
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute bottom-4 right-4 h-5 w-5 text-blue-500/75"
                        >
                          <span className="absolute bottom-0 right-0 h-px w-3 rotate-[-45deg] rounded-full bg-current" />
                          <span className="absolute bottom-1.5 right-0 h-px w-4 rotate-[-45deg] rounded-full bg-current" />
                          <span className="absolute bottom-3 right-0 h-px w-5 rotate-[-45deg] rounded-full bg-current" />
                        </span>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 border-t border-dashed border-blue-200/80 pt-5 sm:grid-cols-2 dark:border-white/[0.08]">
                      <div className="rounded-[20px] bg-white/[0.66] px-4 py-3.5 shadow-sm shadow-blue-950/[0.025] dark:bg-black/20">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="flex size-6 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-600/10 dark:bg-white/[0.08] dark:text-blue-200">
                            <Globe2 className="size-3.5" />
                          </span>
                          <Label className="text-xs font-semibold">课程语言</Label>
                        </div>
                        <Select
                          value={language}
                          onValueChange={(value) => setLanguage(value as 'zh-CN' | 'en-US')}
                        >
                          <SelectTrigger className="h-11 w-full rounded-xl bg-white text-base shadow-sm dark:bg-black/20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="zh-CN">中文</SelectItem>
                            <SelectItem value="en-US">English</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="rounded-[20px] bg-white/[0.66] px-4 py-3.5 shadow-sm shadow-blue-950/[0.025] dark:bg-black/20">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="flex size-6 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-600/10 dark:bg-white/[0.08] dark:text-blue-200">
                            <FileText className="size-3.5" />
                          </span>
                          <Label className="text-xs font-semibold">页数范围</Label>
                        </div>
                        <Select
                          value={outlineLength}
                          onValueChange={(value) => setOutlineLength(value as typeof outlineLength)}
                        >
                          <SelectTrigger className="h-11 w-full rounded-xl bg-white text-base shadow-sm dark:bg-black/20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="minimal">极简（5 页以下）</SelectItem>
                            <SelectItem value="compact">简短（10 页以下）</SelectItem>
                            <SelectItem value="standard">中等（10-20 页）</SelectItem>
                            <SelectItem value="extended">深入（20 页以上）</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            ) : null}

            {activeStep === 'materials' ? (
              <div className="grid h-full min-h-0 gap-5 overflow-y-auto pr-1 overscroll-contain lg:grid-cols-[0.95fr_1.05fr] lg:overflow-hidden lg:pr-0">
                <section className="min-h-0">
                  <div className="max-h-full overflow-y-auto rounded-xl border border-slate-900/[0.07] bg-white p-4 shadow-sm shadow-slate-950/[0.03] overscroll-contain dark:border-white/[0.08] dark:bg-white/[0.04]">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">提取结果</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {sourcePreview.status === 'loading'
                            ? '正在读取文件内容…'
                            : sourcePreview.status === 'ready'
                              ? `${sourcePreview.items.length} 个片段可预览`
                              : sourcePreview.status === 'error'
                                ? '解析遇到问题'
                                : '等待素材输入'}
                        </p>
                      </div>
                      {sourcePreview.status === 'loading' ? (
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      ) : null}
                    </div>

                    {sourcePreview.status === 'error' ? (
                      <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
                        {sourcePreview.message}
                      </div>
                    ) : null}

                    {sourcePreview.status === 'loading' ? (
                      <div className="mt-3 space-y-2">
                        {[0, 1, 2].map((item) => (
                          <div
                            key={item}
                            className="h-[68px] animate-pulse rounded-lg bg-slate-100 dark:bg-white/[0.06]"
                          />
                        ))}
                      </div>
                    ) : null}

                    {sourcePreview.status === 'ready' ? (
                      <div className="mt-3 space-y-2">
                        {sourcePreview.items.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-lg border border-slate-900/[0.06] bg-slate-50/80 p-3 dark:border-white/[0.08] dark:bg-white/[0.04]"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold">{item.title}</span>
                              <span
                                className={cn(
                                  'rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                                  item.kind === '图片'
                                    ? 'bg-teal-500/10 text-teal-700 dark:text-teal-200'
                                    : item.kind === '目标'
                                      ? 'bg-violet-500/10 text-violet-700 dark:text-violet-200'
                                      : 'bg-blue-500/10 text-blue-700 dark:text-blue-200',
                                )}
                              >
                                {item.kind}
                              </span>
                            </div>
                            <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                              {item.kind === '图片' && hasSelectableSourceImages
                                ? `已选择 ${selectedSourceImages.length} / ${sourcePreview.imagePreviews.length} 张图片作为生成依据。`
                                : item.detail}
                            </p>
                            {item.kind === '图片' && sourcePreview.imagePreviews.length > 0 ? (
                              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                <div className="space-y-0.5">
                                  <span className="block text-[11px] font-medium text-muted-foreground">
                                    点选缩略图决定是否保留
                                  </span>
                                  <span className="block text-[11px] leading-relaxed text-muted-foreground">
                                    这里会展示 PDF
                                    中可独立抽出的图片，以及页面里自动裁出的图形区域。
                                  </span>
                                  {sourcePreview.imageDuplicateCount > 0 ? (
                                    <span className="block text-[11px] text-teal-700 dark:text-teal-200">
                                      已合并 {sourcePreview.imageDuplicateCount} 张重复图片
                                    </span>
                                  ) : null}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 rounded-lg px-2 text-xs"
                                    onClick={() => setAllSourceImagesSelected(true)}
                                  >
                                    全选
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 rounded-lg px-2 text-xs"
                                    onClick={() => setAllSourceImagesSelected(false)}
                                  >
                                    清空
                                  </Button>
                                </div>
                              </div>
                            ) : null}
                            {item.kind === '图片' && sourcePreview.imagePreviews.length > 0 ? (
                              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                {sourcePreview.imagePreviews.map((image) => {
                                  const selected = selectedSourceImageIdSet.has(image.id);
                                  return (
                                    <div
                                      key={image.id}
                                      role="button"
                                      tabIndex={0}
                                      aria-pressed={selected}
                                      onClick={(event) => {
                                        if ((event.target as HTMLElement).closest('button')) return;
                                        setSourceImageSelection(image.id, !selected);
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key !== 'Enter' && event.key !== ' ') return;
                                        event.preventDefault();
                                        setSourceImageSelection(image.id, !selected);
                                      }}
                                      className={cn(
                                        'relative cursor-pointer overflow-hidden rounded-lg border bg-white transition dark:bg-white/[0.05]',
                                        selected
                                          ? 'border-blue-500 shadow-sm shadow-blue-500/15'
                                          : 'border-slate-900/[0.06] opacity-55 dark:border-white/[0.08]',
                                      )}
                                    >
                                      <Checkbox
                                        checked={selected}
                                        onCheckedChange={(checked) =>
                                          setSourceImageSelection(image.id, checked === true)
                                        }
                                        aria-label={`保留${image.title}`}
                                        className="absolute left-2 top-2 z-10 bg-white/90 shadow-sm"
                                      />
                                      <div className="aspect-[4/3] bg-slate-50 dark:bg-slate-900">
                                        <img
                                          src={image.url}
                                          alt={image.title}
                                          className="h-full w-full object-contain"
                                        />
                                      </div>
                                      <div className="truncate px-2 py-1.5 text-[10px] font-medium text-muted-foreground">
                                        {image.title}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
                            {item.kind === '图片' &&
                            missingSourceImagePreviewCount > 0 &&
                            sourcePreview.imagePreviews.length > 0 ? (
                              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                                还有 {missingSourceImagePreviewCount}{' '}
                                张图片未生成缩略图，不会进入本次图片依据。
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {sourcePreview.warnings.length > 0 ? (
                      <div className="mt-3 space-y-1">
                        {sourcePreview.warnings.slice(0, 2).map((warning) => (
                          <p key={warning} className="text-[11px] leading-relaxed text-amber-700">
                            {warning}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className="min-h-0">
                  <div className="max-h-full overflow-y-auto rounded-xl border border-slate-900/[0.06] bg-white/80 p-4 overscroll-contain dark:border-white/[0.08] dark:bg-black/20">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">素材清单</p>
                        <p className="text-xs text-muted-foreground">
                          {keptMaterials.length}/{materials.length} 项将写入生成要求
                        </p>
                      </div>
                      <Search className="size-4 text-muted-foreground" />
                    </div>
                    <div className="space-y-2">
                      {materials.map((item) => (
                        <label
                          key={item.id}
                          className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-900/[0.06] bg-slate-50/70 p-3 dark:border-white/[0.08] dark:bg-white/[0.04]"
                        >
                          <Checkbox
                            checked={item.keep}
                            onCheckedChange={(checked) =>
                              setMaterialKeep(item.id, checked === true)
                            }
                            className="mt-0.5"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{item.title}</span>
                              <span className="rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-200">
                                {item.kind}
                              </span>
                            </div>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                              {(item.id === 'pdf-images' || item.id === 'pptx-images') &&
                              hasSelectableSourceImages
                                ? `已保留 ${selectedSourceImages.length}/${sourcePreview.imagePreviews.length} 张图片`
                                : item.id === 'pdf-formulas'
                                  ? '从正文中识别公式、图表和视觉结构作为页面规划依据'
                                  : item.detail}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </section>
              </div>
            ) : null}

            {activeStep === 'outline' ? (
              <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pr-1 overscroll-contain lg:overflow-hidden lg:pr-0">
                <div className="flex shrink-0 items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">
                      {outlineIsLoading ? '正在生成规划与 prompt' : '审查 notebook 生成结构'}
                    </h2>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {outlineGenerationMessage}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    {canStartImageGenerationFromResult ? (
                      <Button
                        type="button"
                        size="sm"
                        className="h-9 rounded-lg"
                        disabled={busy}
                        onClick={() => void handleGenerate()}
                      >
                        {busy ? (
                          <Loader2 className="mr-1.5 size-4 animate-spin" />
                        ) : (
                          <Sparkles className="mr-1.5 size-4" />
                        )}
                        开始并行生图
                      </Button>
                    ) : null}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-lg"
                        >
                          <ListChecks className="mr-1.5 size-3.5" />
                          生成状态
                          {selectedPlanningEffectivePhaseState ? (
                            <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-white/[0.08] dark:text-slate-300">
                              {PLANNING_MOCK_STATE_LABELS[selectedPlanningEffectivePhaseState]}
                            </span>
                          ) : null}
                          {selectedPlanningMockPhaseState ? (
                            <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-400/10 dark:text-amber-200">
                              Mock
                            </span>
                          ) : null}
                          <ChevronDown className="ml-1 size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-64">
                        <DropdownMenuLabel>规划与 prompt 链路状态</DropdownMenuLabel>
                        <div className="px-2 pb-2 text-[11px] leading-relaxed text-muted-foreground">
                          真实：
                          {selectedPlanningRealPhaseState
                            ? PLANNING_MOCK_STATE_LABELS[selectedPlanningRealPhaseState]
                            : '未开始'}
                        </div>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={!hasPlanningMockStreams}
                          onSelect={clearPlanningMockOverride}
                        >
                          <RefreshCcw className="size-3.5" />
                          跟随真实链路
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {PLANNING_MOCK_STATE_OPTIONS.map((option) => {
                          const active = selectedPlanningMockPhaseState === option.state;
                          const Icon =
                            option.state === 'input'
                              ? FileText
                              : option.state === 'done'
                                ? CheckCircle2
                                : Loader2;
                          return (
                            <DropdownMenuItem
                              key={option.state}
                              className={cn(
                                'items-start gap-2 py-2',
                                active && 'bg-blue-50 text-blue-700 dark:bg-blue-300/[0.08]',
                              )}
                              onSelect={() =>
                                setPlanningMockPhaseState(planningPhase, option.state)
                              }
                            >
                              <Icon className="mt-0.5 size-3.5" />
                              <span className="min-w-0 flex-1">
                                <span className="block text-xs font-medium">{option.label}</span>
                                <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                                  {option.helper}
                                </span>
                              </span>
                              {active ? <CheckCircle2 className="mt-0.5 size-3.5" /> : null}
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg"
                      disabled={outlineIsLoading}
                      onClick={addOutlineRow}
                    >
                      <Plus className="mr-1.5 size-3.5" />
                      新增页面
                    </Button>
                  </div>
                </div>

                {outlineGenerationStatus === 'error' && outlineRows.length === 0 ? (
                  <div className="rounded-xl border border-amber-500/25 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
                    {outlineGenerationMessage}
                  </div>
                ) : null}

                <div
                  className={cn(
                    'grid min-h-0 flex-1 gap-4 overflow-y-auto overscroll-contain lg:overflow-hidden',
                    hidePlanningInputPanel || showPlanningInputOnly || !showPlanningOutputPanel
                      ? 'lg:grid-cols-1'
                      : 'lg:grid-cols-[0.42fr_0.58fr]',
                  )}
                >
                  {!hidePlanningInputPanel ? (
                    <section className="min-h-[300px] lg:min-h-0">
                      <PipelineTextPanel
                        value={planningInputPreview}
                        active={outlineIsLoading && planningPhase === 'course-spine'}
                      />
                    </section>
                  ) : null}

                  {showPlanningOutputPanel ? (
                    <section className="min-h-[360px] lg:min-h-0">
                      <PlanningStreamBox
                        page={selectedPlanningPage}
                        stepText={selectedPlanningStepText}
                        structured={selectedPlanningStructuredOutput}
                        loadingState={selectedPlanningStructuredLoadingState}
                        phase={planningPhase}
                        pages={planningListPages}
                        courseSpine={structuredPlanningCourseSpine}
                        selectedPage={selectedPlanningPage}
                        onPageSelect={setSelectedOutlineId}
                        active={
                          hasSelectedPlanningStepText
                            ? selectedPlanningStepIsWriting
                            : selectedPlanningIsWriting
                        }
                        revision={planningRevealRevision}
                        action={
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-lg px-2.5 text-xs"
                            disabled={outlineIsLoading}
                            onClick={() => void generateOutlineForReview()}
                          >
                            {outlineIsLoading ? (
                              <Loader2 className="mr-1 size-3 animate-spin" />
                            ) : (
                              <RefreshCcw className="mr-1 size-3" />
                            )}
                            重新生成
                          </Button>
                        }
                      />
                    </section>
                  ) : null}
                </div>
              </div>
            ) : null}

            {activeStep === 'style' ? (
              <div className="grid h-full min-h-0 gap-5 overflow-y-auto pr-1 overscroll-contain lg:grid-cols-[0.82fr_1.18fr] lg:overflow-hidden lg:pr-0">
                <section className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      单页质检
                    </p>
                    <h2 className="mt-1 text-xl font-semibold">先跑一页真实质量检查</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      左侧选择风格和质检页，右侧跑正式 image-ppt 链路的一页质量检查。
                    </p>
                  </div>

                  <FieldShell label="质检页">
                    <div className="grid gap-2">
                      {outlineRows.map((row, index) => (
                        <button
                          key={row.id}
                          type="button"
                          className={cn(
                            'rounded-xl border p-3 text-left transition-colors',
                            selectedOutline?.id === row.id
                              ? 'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950'
                              : 'border-slate-900/[0.06] bg-white/80 hover:border-slate-400/30 dark:border-white/[0.08] dark:bg-black/20',
                          )}
                          onClick={() => setSelectedOutlineId(row.id)}
                        >
                          <span className="block text-[11px] opacity-60">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <span className="mt-1 block truncate text-sm font-semibold">
                            {row.title}
                          </span>
                        </button>
                      ))}
                    </div>
                  </FieldShell>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                    <FieldShell label="绘画风格">
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-5">
                        {STYLE_OPTIONS.map((style) => (
                          <button
                            key={style.id}
                            type="button"
                            className={cn(
                              'rounded-lg border px-2.5 py-2 text-center text-xs font-semibold transition-colors',
                              selectedStyleId === style.id
                                ? 'border-blue-500/35 bg-blue-500/10'
                                : 'border-slate-900/[0.06] bg-white/80 hover:border-blue-400/25 dark:border-white/[0.08] dark:bg-black/20',
                            )}
                            onClick={() => selectDrawingStyle(style)}
                          >
                            {style.label}
                          </button>
                        ))}
                      </div>
                      <Textarea
                        ref={stylePromptTextareaRef}
                        value={customStylePrompt}
                        onChange={(event) => {
                          setCustomStylePrompt(event.target.value);
                          setConfirmedImageNotebookPlan(null);
                        }}
                        placeholder="补充具体画风，例如：黑板粉笔、Notability 手写、水彩、极简线稿、漫画分镜..."
                        className="mt-3 min-h-[76px] resize-none rounded-lg bg-white/80 text-xs dark:bg-black/20"
                        disabled={busy}
                      />
                    </FieldShell>

                    <FieldShell label="色彩方向">
                      <div className="grid gap-2">
                        {PALETTES.map((palette) => (
                          <button
                            key={palette.id}
                            type="button"
                            className={cn(
                              'flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors',
                              selectedPaletteId === palette.id
                                ? 'border-teal-500/35 bg-teal-500/10'
                                : 'border-slate-900/[0.06] bg-white/80 hover:border-teal-400/25 dark:border-white/[0.08] dark:bg-black/20',
                            )}
                            onClick={() => setSelectedPaletteId(palette.id)}
                          >
                            <span className="text-sm font-semibold">{palette.label}</span>
                            <span className="flex gap-1.5">
                              {palette.colors.map((color) => (
                                <span
                                  key={color}
                                  className="size-5 rounded-full border border-black/10"
                                  style={{ backgroundColor: color }}
                                />
                              ))}
                            </span>
                          </button>
                        ))}
                      </div>
                    </FieldShell>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-900/[0.06] bg-white/80 px-3 py-3 dark:border-white/[0.08] dark:bg-black/20">
                      <div>
                        <Label className="text-xs font-semibold">整页图片生成</Label>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">image-ppt 已启用</p>
                      </div>
                      <span className="flex size-7 items-center justify-center rounded-full bg-teal-500/10 text-teal-700 dark:text-teal-200">
                        <CheckCircle2 className="size-4" />
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-900/[0.06] bg-white/80 px-3 py-3 dark:border-white/[0.08] dark:bg-black/20">
                      <div>
                        <Label className="text-xs font-semibold">测验页</Label>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">生成练习和复习题</p>
                      </div>
                      <Switch
                        checked={includeQuizScenes}
                        onCheckedChange={setIncludeQuizScenes}
                        aria-label="测验页"
                      />
                    </div>
                  </div>

                  <FieldShell label="例题数量">
                    <Select
                      value={workedExampleLevel}
                      onValueChange={(value) =>
                        setWorkedExampleLevel(value as OrchestratorWorkedExampleLevel)
                      }
                    >
                      <SelectTrigger className="h-10 rounded-lg bg-white/80 dark:bg-black/20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">无</SelectItem>
                        <SelectItem value="light">少量</SelectItem>
                        <SelectItem value="moderate">中等</SelectItem>
                        <SelectItem value="heavy">丰富</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldShell>

                  <PromptPreviewPanel
                    title="整本生成控制输入"
                    description="点「确认全量生成」时，队列会把这段文字作为整本笔记本的生成要求传入后端。"
                    value={confirmedGenerationPromptPreview}
                    minHeight="min-h-[260px]"
                    onCopy={() =>
                      void copyPrompt(confirmedGenerationPromptPreview, '整本生成控制输入')
                    }
                  />

                  <PromptPreviewPanel
                    title="当前页图片 prompt"
                    description="用于当前选中页的 image-ppt 单页质检；通过后这里会显示已记录的图片 prompt。"
                    value={visiblePilotImagePrompt}
                    minHeight="min-h-[220px]"
                    onCopy={() => void copyPrompt(visiblePilotImagePrompt, '当前页图片 prompt')}
                  />
                </section>

                <section className="flex min-h-0 flex-col rounded-xl border border-slate-900/[0.07] bg-white/88 shadow-sm shadow-slate-950/[0.03] dark:border-white/[0.08] dark:bg-black/20">
                  <div className="flex items-start justify-between gap-3 border-b border-slate-900/[0.06] px-4 py-3 dark:border-white/[0.08]">
                    <div>
                      <p className="text-sm font-semibold">单页质量检查</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Teacher Planner → 整页生图 → Vision QA → 讲解动作，只真实生成当前这一页。
                      </p>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium',
                        styleSampleStatus === 'loading'
                          ? 'bg-blue-500/10 text-blue-700 dark:text-blue-200'
                          : styleSampleQualityPassed
                            ? 'bg-teal-500/10 text-teal-700 dark:text-teal-200'
                            : styleSampleIsCurrent
                              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-200'
                              : styleSampleStatus === 'error'
                                ? 'bg-destructive/10 text-destructive'
                                : 'bg-slate-100 text-slate-600 dark:bg-white/[0.08] dark:text-slate-300',
                      )}
                    >
                      {styleSampleStatus === 'loading'
                        ? '生成中'
                        : styleSampleQualityPassed
                          ? '已通过'
                          : styleSampleIsCurrent
                            ? '需复查'
                            : styleSampleIsStale
                              ? '需重画'
                              : styleSampleStatus === 'error'
                                ? '生成失败'
                                : '等待生成'}
                    </span>
                  </div>

                  <div className="flex min-h-0 flex-1 items-center justify-center p-4">
                    {styleSampleStatus === 'loading' ? (
                      <div className="flex min-h-[320px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-blue-500/25 bg-blue-500/5 text-center">
                        <Loader2 className="size-7 animate-spin text-blue-600" />
                        <p className="mt-3 text-sm font-semibold">正在生成单页质检</p>
                        <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                          这一步最多只做 1 次真实图片调用，并同步检查 QA、遮罩和讲解稿。
                        </p>
                      </div>
                    ) : styleSample?.imageUrl ? (
                      <div className="w-full">
                        <div
                          className={cn(
                            'relative overflow-hidden rounded-xl border border-slate-900/[0.08] bg-slate-950 shadow-sm dark:border-white/[0.08]',
                            styleSampleIsStale && 'opacity-60',
                          )}
                        >
                          <img
                            src={styleSample.imageUrl}
                            alt="image-ppt 单页质量检查"
                            className="aspect-video h-full w-full object-contain"
                          />
                          {styleSampleIsStale ? (
                            <div className="absolute inset-x-0 bottom-0 bg-slate-950/80 px-4 py-2 text-xs font-medium text-white">
                              当前页面规划、风格或质检页已变化，请重跑质检后再确认全量生成。
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          {styleSample.qa ? (
                            <span
                              className={cn(
                                'rounded-full px-2 py-0.5 font-medium',
                                styleSample.qa.passed
                                  ? 'bg-teal-500/10 text-teal-700 dark:text-teal-200'
                                  : 'bg-destructive/10 text-destructive',
                              )}
                            >
                              QA {styleSample.qa.passed ? '通过' : '未通过'}
                            </span>
                          ) : null}
                          {styleSample.speechCount !== undefined ? (
                            <span>speech {styleSample.speechCount}</span>
                          ) : null}
                          {styleSample.focusCount !== undefined ? (
                            <span>focus {styleSample.focusCount}</span>
                          ) : null}
                          {styleSample.briefPageCount ? (
                            <span>brief {styleSample.briefPageCount} 页</span>
                          ) : null}
                          {styleSample.width && styleSample.height ? (
                            <span>
                              {styleSample.width} × {styleSample.height}
                            </span>
                          ) : null}
                          {styleSample.modelId ? <span>{styleSample.modelId}</span> : null}
                          <span>{new Date(styleSample.generatedAt).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    ) : styleSampleStatus === 'error' ? (
                      <div className="flex min-h-[320px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-destructive/25 bg-destructive/5 p-6 text-center">
                        <BotOff className="size-7 text-destructive" />
                        <p className="mt-3 text-sm font-semibold">单页质检没有通过</p>
                        <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                          {styleSampleError ||
                            '检查 image provider、vision 模型和 API key 后可以重试。'}
                        </p>
                      </div>
                    ) : (
                      <div className="flex min-h-[320px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-900/[0.08] bg-slate-50/70 text-center dark:border-white/[0.08] dark:bg-white/[0.04]">
                        <ImageIcon className="size-7 text-muted-foreground" />
                        <p className="mt-3 text-sm font-semibold">准备生成单页质检</p>
                        <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                          这一步不会用前端占位图，会跑正式生成链路，但只真实生成一页。
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 border-t border-slate-900/[0.06] px-4 py-3 dark:border-white/[0.08]">
                    <Button
                      type="button"
                      variant={styleSample?.imageUrl ? 'outline' : 'default'}
                      className="h-9 rounded-lg"
                      disabled={styleSampleStatus === 'loading' || !selectedOutline}
                      onClick={() => void generateStyleSample()}
                    >
                      {styleSampleStatus === 'loading' ? (
                        <Loader2 className="mr-1.5 size-4 animate-spin" />
                      ) : (
                        <RefreshCcw className="mr-1.5 size-4" />
                      )}
                      {styleSample?.imageUrl ? '重跑质检' : '生成质量检查'}
                    </Button>
                    <Button
                      type="button"
                      className="h-9 rounded-lg"
                      disabled={!styleSampleQualityPassed || busy}
                      onClick={() => void handleGenerate()}
                    >
                      {busy ? (
                        <Loader2 className="mr-1.5 size-4 animate-spin" />
                      ) : (
                        <Sparkles className="mr-1.5 size-4" />
                      )}
                      确认全量生成
                    </Button>
                  </div>
                </section>
              </div>
            ) : null}

            {activeStep === 'result' ? (
              <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pr-1 overscroll-contain">
                <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      生成与结果
                    </p>
                    <h2 className="mt-1 text-xl font-semibold">逐页并行生成图片</h2>
                    <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
                      一次最多 5 页同时生成，按页序保存；每个格子对应一张 16:9 幻灯片。
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant={imageGenerationMockPageCount ? 'default' : 'outline'}
                          size="sm"
                          className="h-9 rounded-lg"
                        >
                          <PlayCircle className="mr-1.5 size-4" />
                          {imageGenerationMockPageCount
                            ? `${imageGenerationMockPageCount} 页 mock`
                            : '生图 mock'}
                          <ChevronDown className="ml-1.5 size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuLabel>生图 mock 档位</DropdownMenuLabel>
                        {[5, 10, 20].map((pageCount) => (
                          <DropdownMenuItem
                            key={pageCount}
                            onSelect={() =>
                              setImageGenerationMockPageCount(
                                pageCount as ImageGenerationMockPageCount,
                              )
                            }
                          >
                            <span className="flex min-w-0 flex-1 items-center">
                              {pageCount} 页 mock
                            </span>
                            {imageGenerationMockPageCount === pageCount ? (
                              <CheckCircle2 className="size-4 text-blue-600" />
                            ) : null}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => setImageGenerationMockPageCount(null)}>
                          关闭 mock
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button type="button" variant="outline" size="sm" className="h-9 rounded-lg">
                      <RefreshCcw className="mr-1.5 size-4" />
                      重画选中页
                    </Button>
                    <Button type="button" size="sm" className="h-9 rounded-lg" asChild>
                      <Link href={`/course/${encodeURIComponent(courseId)}`}>
                        <PlayCircle className="mr-1.5 size-4" />
                        进入课堂
                      </Link>
                    </Button>
                  </div>
                </div>

                <section className="min-h-0 flex-1 rounded-xl border border-slate-900/[0.06] bg-white/82 p-4 shadow-sm shadow-slate-950/[0.03] dark:border-white/[0.08] dark:bg-black/20">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">幻灯片生图网格</p>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:bg-white/[0.08] dark:text-slate-300">
                      共 {imageGenerationGridRows.length} 页
                    </span>
                  </div>

                  {imageGenerationGridRows.length > 0 ? (
                    <div className={imageGenerationGridClassName()}>
                      {imageGenerationGridRows.map((row, index) => {
                        const status = getImageGenerationTileStatus({
                          index,
                          total: imageGenerationGridRows.length,
                          mockEnabled: imageGenerationMockPageCount !== null,
                          busy,
                          task: activeGenerationTask,
                        });
                        const statusLabel = IMAGE_GENERATION_STATUS_LABELS[status];
                        const thumbnailUrl =
                          status === 'done'
                            ? getGeneratedPageThumbnailUrl(activeGenerationTask, index)
                            : '';
                        const hasGeneratedThumbnail = Boolean(thumbnailUrl);
                        return (
                          <article
                            key={row.id}
                            className={cn(
                              'relative aspect-video overflow-hidden rounded-xl border border-slate-900/[0.06] shadow-sm shadow-slate-950/[0.03] dark:border-white/[0.08]',
                              imageGenerationTilePaddingClassName(),
                              status === 'done' && 'text-white',
                              hasGeneratedThumbnail && 'bg-white',
                              status === 'generating' && 'bg-blue-50 text-blue-950',
                              status === 'waiting' && 'bg-slate-50 text-slate-500',
                            )}
                            style={
                              status === 'done' && !hasGeneratedThumbnail
                                ? {
                                    background: `linear-gradient(135deg, ${selectedPalette.colors[0]} 0%, #111827 62%, ${selectedPalette.colors[1]} 100%)`,
                                  }
                                : undefined
                            }
                          >
                            {hasGeneratedThumbnail ? (
                              <>
                                <img
                                  src={thumbnailUrl}
                                  alt={`第 ${index + 1} 页生成缩略图`}
                                  className="absolute inset-0 size-full object-cover"
                                />
                                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.18)_0%,rgba(15,23,42,0)_42%,rgba(15,23,42,0.1)_100%)]" />
                              </>
                            ) : null}
                            <ImageGenerationCardProcessPreview index={index} status={status} />
                            <div className="relative z-10 flex h-full flex-col justify-between">
                              <div className="flex items-center justify-between gap-2 text-[10px] font-medium">
                                <span
                                  className={cn(
                                    'rounded-full px-2 py-0.5',
                                    status === 'done' &&
                                      (hasGeneratedThumbnail
                                        ? 'bg-slate-950/55 text-white shadow-sm backdrop-blur'
                                        : 'bg-white/18 text-white'),
                                    status === 'generating' && 'bg-blue-600 text-white',
                                    status === 'waiting' && 'bg-white text-slate-500',
                                  )}
                                >
                                  第 {String(index + 1).padStart(2, '0')} 页
                                </span>
                                <span
                                  className={cn(
                                    'inline-flex items-center rounded-full px-2 py-0.5',
                                    status === 'done' &&
                                      (hasGeneratedThumbnail
                                        ? 'bg-teal-500/85 text-white shadow-sm backdrop-blur'
                                        : 'bg-teal-400/20 text-white'),
                                    status === 'generating' && 'bg-white text-blue-700',
                                    status === 'waiting' && 'bg-white text-slate-500',
                                  )}
                                >
                                  {status === 'done' ? (
                                    <CheckCircle2 className="mr-1 size-3" />
                                  ) : status === 'generating' ? (
                                    <Loader2 className="mr-1 size-3 animate-spin" />
                                  ) : (
                                    <ImageIcon className="mr-1 size-3" />
                                  )}
                                  {statusLabel}
                                </span>
                              </div>
                              {status === 'generating' || hasGeneratedThumbnail ? null : (
                                <div>
                                  <h3
                                    className={cn(
                                      'line-clamp-2 font-semibold',
                                      imageGenerationTitleClassName(),
                                      status === 'waiting' && 'text-slate-500',
                                    )}
                                  >
                                    {row.title}
                                  </h3>
                                  <p
                                    className={cn(
                                      'mt-1 line-clamp-2',
                                      imageGenerationFocusClassName(),
                                      status === 'done' && 'text-white/75',
                                      status === 'waiting' && 'text-slate-400',
                                    )}
                                  >
                                    {row.focus}
                                  </p>
                                </div>
                              )}
                            </div>
                            {status === 'generating' ? (
                              <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent_0%,rgba(59,130,246,0.13)_45%,transparent_70%)]" />
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-900/[0.08] bg-slate-50/70 p-6 text-center dark:border-white/[0.08] dark:bg-white/[0.04]">
                      <ImageIcon className="size-7 text-muted-foreground" />
                      <p className="mt-3 text-sm font-semibold">还没有可生成的页面</p>
                      <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                        完成规划后这里会按页数显示生图网格；也可以点击「生图 mock」预览状态。
                      </p>
                    </div>
                  )}
                </section>
              </div>
            ) : null}
          </div>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3"
              >
                <p className="text-sm text-destructive">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="relative z-[20] flex w-full shrink-0 items-center justify-between gap-3 rounded-[22px] border border-white/75 bg-white/[0.82] px-4 py-3 shadow-[0_18px_50px_rgba(15,23,42,0.09)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-slate-950/85">
            <Button
              type="button"
              variant="ghost"
              className="h-9 rounded-xl"
              disabled={activeStep === 'input' || busy}
              onClick={goBack}
            >
              <ArrowLeft className="mr-1.5 size-4" />
              上一步
            </Button>
            <div className="hidden min-w-0 flex-1 text-center text-xs text-muted-foreground sm:block">
              第 {activeStepIndex + 1} 步 / {WORKSPACE_PROGRESS_STEPS.length} · {activeStepLabel}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {activeStep === 'materials' ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-xl px-4"
                  disabled={outlineIsLoading}
                  onClick={() => startParallelPlanningMockStreams('course-spine')}
                >
                  <PlayCircle className="mr-1.5 size-4" />
                  当前流水线 mock
                </Button>
              ) : null}
              {activeStep !== 'result' ? (
                <Button
                  type="button"
                  className="h-11 rounded-2xl bg-gradient-to-r from-violet-500 to-blue-500 px-5 text-white shadow-sm shadow-violet-500/20 hover:from-violet-600 hover:to-blue-600"
                  disabled={
                    (activeStep === 'input' && !hasInput) ||
                    busy ||
                    outlineNextDisabled ||
                    (activeStep === 'style' && !styleSampleQualityPassed)
                  }
                  onClick={goNext}
                >
                  {activeStep === 'style' ? (
                    busy || styleSampleStatus === 'loading' ? (
                      <Loader2 className="mr-1.5 size-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-1.5 size-4" />
                    )
                  ) : ((activeStep === 'input' || activeStep === 'materials') &&
                      outlineIsLoading) ||
                    (activeStep === 'outline' && outlineIsLoading) ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 size-4" />
                  )}
                  {activeStep === 'style'
                    ? styleSampleQualityPassed
                      ? '确认全量生成'
                      : styleSampleStatus === 'loading'
                        ? '质检生成中'
                        : '先跑质量检查'
                    : activeStep === 'input' || activeStep === 'materials'
                      ? '生成规划与 prompt'
                      : activeStep === 'outline'
                        ? outlineIsLoading
                          ? '规划与 prompt 生成中'
                          : outlineNeedsInitialGeneration
                            ? '开始生成规划与 prompt'
                            : '并行生成图片'
                        : '下一步'}
                  <ArrowRight className="ml-2 size-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-lg px-4"
                  onClick={() => {
                    setForm({ sourceFile: null, requirement: '' });
                    updateRequirementCache('');
                    setCustomStylePrompt(STYLE_OPTIONS[0]?.prompt ?? '');
                    setMaterials(buildMaterialRows(null, ''));
                    setOutlineRows([]);
                    setSelectedOutlineId('');
                    setOutlineGenerationStatus('idle');
                    setOutlineGenerationMessage('输入后会直接生成一版规划与画图 prompt。');
                    setPlanningCourseSpine(null);
                    setPlanningPages([]);
                    setConfirmedImageNotebookPlan(null);
                    setPlanningLiveDraft(null);
                    setPlanningStreamEvents([]);
                    setPlanningQuality(null);
                    setPlanningRealPhaseStates({});
                    setPlanningMockStreams({});
                    setPlanningMockPhaseStates({});
                    setPlanningMockStreamingPhases([]);
                    setCurrentPlanningPageNumbers([]);
                    styleSampleAbortRef.current?.abort();
                    setStyleSample(null);
                    setStyleSampleStatus('idle');
                    setStyleSampleError('');
                    setActiveStep('input');
                  }}
                >
                  再创建一本
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
