'use client';

import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Brain,
  CircleDollarSign,
  FileText,
  FileQuestion,
  FolderInput,
  MoreHorizontal,
  Pencil,
  Presentation,
  School,
  Send,
  Star,
  Trash2,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import type { StageListItem } from '@/lib/utils/stage-storage';
import type { PPTImageElement, Slide } from '@/lib/types/slides';
import { pickStableGalleryCoverUrl } from '@/lib/constants/gallery-covers';
import { cn } from '@/lib/utils';
import { isLocalGeneratedNotebookImageSrc } from '@/lib/notebook-content/generated-image-src';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const LazyThumbnailSlide = dynamic(
  () =>
    import('@/components/slide-renderer/components/ThumbnailSlide').then(
      (mod) => mod.ThumbnailSlide,
    ),
  {
    ssr: false,
    loading: () => <div className="size-full bg-white dark:bg-slate-900/70" />,
  },
);

/** 课程画廊用弹性列；课程内笔记本在桌面页保持双列，贴近课堂工作区设计稿。 */
export const courseGalleryListGridClassName =
  'm-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-[repeat(auto-fill,minmax(min(100%,_18rem),1fr))] lg:grid-cols-[repeat(auto-fill,minmax(min(100%,_20rem),1fr))] lg:gap-5';

export const notebookAssetListGridClassName =
  'm-0 grid list-none grid-cols-1 gap-3 p-0 lg:grid-cols-2 2xl:gap-4';

function isImageUrl(src: string | null | undefined): src is string {
  const s = src?.trim();
  if (!s) return false;
  return (
    s.startsWith('/') ||
    s.startsWith('http://') ||
    s.startsWith('https://') ||
    s.startsWith('data:')
  );
}

function isSlideImageElement(element: Slide['elements'][number]): element is PPTImageElement {
  return element.type === 'image' && isImageUrl(element.src);
}

function pickSlidePreviewImageUrl(slide: Slide | undefined): string | null {
  const image = slide?.elements
    .filter(isSlideImageElement)
    .sort((a, b) => b.width * b.height - a.width * a.height)[0];
  return image?.src.trim() || null;
}

const notebookSpineClassNames = [
  'border-blue-200/80 bg-blue-100/80 dark:border-blue-400/20 dark:bg-blue-500/15',
  'border-emerald-200/80 bg-emerald-100/80 dark:border-emerald-400/20 dark:bg-emerald-500/15',
  'border-violet-200/80 bg-violet-100/80 dark:border-violet-400/20 dark:bg-violet-500/15',
  'border-amber-200/80 bg-amber-100/80 dark:border-amber-400/20 dark:bg-amber-500/15',
  'border-rose-200/80 bg-rose-100/75 dark:border-rose-400/20 dark:bg-rose-500/15',
] as const;

type NotebookPracticeProgress = {
  total: number;
  attempted: number;
  mastered?: number;
};

interface CourseGalleryCardProps {
  course: StageListItem;
  slide?: Slide;
  variant?: 'store-course' | 'owned-course' | 'notebook';
  badge?: string;
  subtitle: string;
  actionLabel: string;
  onAction: () => void;
  listIndex?: number;
  secondaryLabel?: string;
  creatorName?: string;
  courseMetaChips?: {
    school?: string;
    purposeType?: string;
    courseCode?: string;
  };
  countUnit?: string;
  moveToCourseTargets?: Array<{ id: string; name: string }>;
  onMoveToCourse?: (targetCourseId: string) => void | Promise<void>;
  coverAvatarUrl?: string;
  onEdit?: () => void;
  tags?: string[];
  parentCourseName?: string;
  schoolLine?: string;
  showNotebookCourseMeta?: boolean;
  onDelete?: () => void | Promise<void>;
  deleteDialogTitle?: string;
  deleteDialogDescription?: string;
  priceLabel?: string;
  ratingLabel?: string;
  useRatingOnCover?: boolean;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  secondaryActionDisabled?: boolean;
  tertiaryActionLabel?: string;
  onTertiaryAction?: () => void;
  tertiaryActionDisabled?: boolean;
  speechStatusLabel?: string;
  memoryCount?: number;
  onMemoryAction?: () => void;
  problemCount?: number;
  practiceProgress?: NotebookPracticeProgress;
  onProblemAction?: () => void;
}

const variantConfig = {
  'store-course': {
    article:
      'store-merch-card group min-h-[27.5rem] rounded-[24px] border-white/70 bg-white/78 sm:min-h-[33rem] sm:rounded-[32px] dark:border-white/12 dark:bg-[rgba(20,24,31,0.85)]',
    media: 'h-[176px] min-[420px]:h-[198px] sm:h-[254px]',
    mediaOverlay:
      'from-slate-950/0 via-slate-950/12 to-slate-950/52 dark:from-slate-950/8 dark:via-slate-950/18 dark:to-slate-950/62',
    title: 'text-[1.25rem] font-semibold tracking-[-0.03em] sm:text-[1.55rem]',
    desc: 'line-clamp-3 min-h-[4.75rem] text-[13px] leading-6 text-slate-600 sm:line-clamp-4 sm:min-h-[6.8rem] sm:text-[14px] sm:leading-7 dark:text-slate-300',
    body: 'px-4 pb-4 pt-4 sm:px-6 sm:pb-6 sm:pt-5',
    metaTone: 'text-slate-500 dark:text-slate-400',
    pillTone:
      'border-slate-200/80 bg-white/82 text-slate-600 dark:border-white/12 dark:bg-white/6 dark:text-slate-300',
  },
  'owned-course': {
    article:
      'store-merch-card group min-h-[25.5rem] rounded-[24px] border-slate-200/80 bg-[linear-gradient(180deg,rgba(252,253,255,0.95),rgba(244,247,252,0.92))] sm:min-h-[30rem] sm:rounded-[30px] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(22,26,35,0.92),rgba(16,20,28,0.94))]',
    media: 'h-[168px] min-[420px]:h-[190px] sm:h-[220px]',
    mediaOverlay:
      'from-slate-950/0 via-slate-950/8 to-slate-950/42 dark:from-slate-950/10 dark:via-slate-950/16 dark:to-slate-950/55',
    title: 'text-[1.18rem] font-semibold tracking-[-0.025em] sm:text-[1.35rem]',
    desc: 'line-clamp-3 min-h-[4.5rem] text-[13px] leading-6 text-slate-600 sm:line-clamp-4 sm:min-h-[6.2rem] sm:text-[13.5px] sm:leading-7 dark:text-slate-300',
    body: 'px-4 pb-4 pt-4 sm:px-5 sm:pb-5 sm:pt-4',
    metaTone: 'text-slate-500 dark:text-slate-400',
    pillTone:
      'border-slate-200/85 bg-white/88 text-slate-600 dark:border-white/12 dark:bg-white/6 dark:text-slate-300',
  },
  notebook: {
    article:
      'store-merch-card group min-h-[29rem] rounded-[30px] border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(246,248,251,0.95))] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(22,25,34,0.94),rgba(16,20,28,0.97))]',
    media: 'h-[214px]',
    mediaOverlay:
      'from-slate-950/0 via-slate-950/10 to-slate-950/44 dark:from-slate-950/12 dark:via-slate-950/18 dark:to-slate-950/58',
    title: 'text-[1.28rem] font-semibold tracking-[-0.025em]',
    desc: 'line-clamp-4 min-h-[5.8rem] text-[13.5px] leading-7 text-slate-600 dark:text-slate-300',
    body: 'px-5 pb-5 pt-4',
    metaTone: 'text-slate-500 dark:text-slate-400',
    pillTone:
      'border-slate-200/85 bg-white/86 text-slate-600 dark:border-white/12 dark:bg-white/6 dark:text-slate-300',
  },
} as const;

export function CourseGalleryCard({
  course,
  slide,
  variant = 'store-course',
  badge,
  subtitle,
  actionLabel,
  onAction,
  listIndex,
  secondaryLabel = '互动课件',
  creatorName,
  courseMetaChips,
  countUnit = '节',
  moveToCourseTargets,
  onMoveToCourse,
  coverAvatarUrl,
  onEdit,
  tags,
  parentCourseName,
  schoolLine,
  showNotebookCourseMeta,
  onDelete,
  deleteDialogTitle = '确定删除？',
  deleteDialogDescription = '此操作不可恢复。',
  priceLabel,
  ratingLabel,
  useRatingOnCover = false,
  secondaryActionLabel,
  onSecondaryAction,
  secondaryActionDisabled = false,
  tertiaryActionLabel,
  onTertiaryAction,
  tertiaryActionDisabled = false,
  speechStatusLabel,
  memoryCount,
  onMemoryAction,
  problemCount,
  practiceProgress,
  onProblemAction,
}: CourseGalleryCardProps) {
  const cfg = variantConfig[variant];
  const thumbRef = useRef<HTMLDivElement>(null);
  const [thumbWidth, setThumbWidth] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [coverImgSrc, setCoverImgSrc] = useState<string | null>(null);
  const [failedSlidePreviewUrl, setFailedSlidePreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const el = thumbRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setThumbWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const description =
    course.description?.trim() ||
    (course.name.length > 120 ? `${course.name.slice(0, 120)}…` : course.name);
  const showRatingOnCover = Boolean(ratingLabel?.trim()) || useRatingOnCover;
  const galleryCoverUrl = pickStableGalleryCoverUrl(course.id);
  const safeCoverAvatarUrl =
    isImageUrl(coverAvatarUrl) && !isLocalGeneratedNotebookImageSrc(coverAvatarUrl)
      ? coverAvatarUrl.trim()
      : null;
  const preferredCoverUrl = safeCoverAvatarUrl ?? galleryCoverUrl;
  const slidePreviewImageUrl = pickSlidePreviewImageUrl(slide);
  const shouldRenderSlideThumbnail = Boolean(slide && thumbWidth > 0);

  useEffect(() => {
    setCoverImgSrc(null);
  }, [course.id, preferredCoverUrl]);

  useEffect(() => {
    setFailedSlidePreviewUrl(null);
  }, [course.id, slidePreviewImageUrl]);

  const resolvedCoverUrl = coverImgSrc ?? preferredCoverUrl;
  const coverRightLabel =
    listIndex !== undefined
      ? `#${String(listIndex + 1).padStart(2, '0')}`
      : showRatingOnCover
        ? ratingLabel?.trim() || '暂无评分'
        : subtitle;

  const isUniversityCourse =
    Boolean(courseMetaChips?.purposeType?.includes('大学')) ||
    Boolean(courseMetaChips?.purposeType?.toLowerCase().includes('university'));
  const inferredCourseCodeFromName = (() => {
    const m = course.name.match(/\b[A-Za-z]{2,}\s?-?\d{2,}[A-Za-z0-9-]*\b/);
    return m?.[0]?.replace(/\s+/g, '') || null;
  })();
  const universitySchoolLine = isUniversityCourse
    ? courseMetaChips?.school?.trim() || undefined
    : undefined;
  const universityCodeLine = isUniversityCourse
    ? courseMetaChips?.courseCode?.trim() || inferredCourseCodeFromName || undefined
    : undefined;
  const showUniversityKicker =
    isUniversityCourse && Boolean(universitySchoolLine || universityCodeLine);
  const defaultCoverKicker =
    variant === 'store-course'
      ? 'Featured Course'
      : variant === 'owned-course'
        ? 'My Library'
        : 'Notebook Library';

  if (variant === 'notebook') {
    const isMarkdownNotebook = course.notebookKind === 'markdown';
    const notebookContentCount = isMarkdownNotebook
      ? Math.max(0, Math.floor(course.sectionCount ?? course.sceneCount ?? 0))
      : Math.max(0, Math.floor(course.sceneCount ?? 0));
    const ContentCountIcon = isMarkdownNotebook ? FileText : Presentation;
    const contentCountLabel = isMarkdownNotebook ? '笔记' : '课件';
    const contentCountTone = isMarkdownNotebook
      ? 'text-sky-700 dark:text-sky-300'
      : 'text-emerald-700 dark:text-emerald-300';
    const compactActionLabel = isMarkdownNotebook
      ? '阅读'
      : actionLabel.replace('笔记本', '') || actionLabel;
    const compactPriceLabel = priceLabel?.trim() || '免费';
    const priceInlineClassName =
      compactPriceLabel === '免费'
        ? 'bg-emerald-50/70 text-emerald-700 ring-1 ring-emerald-100/80 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-400/20'
        : 'bg-amber-50/70 text-amber-700 ring-1 ring-amber-100/80 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/20';
    const formattedMemoryCount =
      typeof memoryCount === 'number' && memoryCount > 0 ? memoryCount : 0;
    const formattedProblemCount =
      typeof problemCount === 'number' && problemCount > 0 ? problemCount : 0;
    const practiceTotal = Math.max(0, Math.floor(practiceProgress?.total ?? 0));
    const practiceAttempted = Math.min(
      practiceTotal,
      Math.max(0, Math.floor(practiceProgress?.attempted ?? 0)),
    );
    const practiceMastered = Math.min(
      practiceTotal,
      Math.max(0, Math.floor(practiceProgress?.mastered ?? 0)),
    );
    const practicePercent =
      practiceTotal > 0 ? Math.round((practiceAttempted / practiceTotal) * 100) : 0;
    const masteryPercent =
      practiceTotal > 0 ? Math.round((practiceMastered / practiceTotal) * 100) : 0;
    const practiceProgressClassName =
      practicePercent >= 80
        ? 'bg-emerald-500'
        : practicePercent >= 40
          ? 'bg-blue-500'
          : practicePercent > 0
            ? 'bg-amber-500'
            : 'bg-slate-300 dark:bg-white/20';
    const practiceProgressTitle =
      practiceTotal > 0
        ? `已做 ${practiceAttempted}/${practiceTotal}，掌握 ${practiceMastered}/${practiceTotal}（${masteryPercent}%）`
        : '暂无题目';
    const shouldUseSlidePreviewImage = Boolean(
      slidePreviewImageUrl && failedSlidePreviewUrl !== slidePreviewImageUrl,
    );
    const hasMoveActions = Boolean(moveToCourseTargets?.length && onMoveToCourse);
    const hasPublishAction = Boolean(onSecondaryAction && secondaryActionLabel);
    const hasOverflowActions = hasPublishAction || hasMoveActions || Boolean(onDelete);
    const notebookSpineClassName = isMarkdownNotebook
      ? 'border-slate-300/80 bg-slate-100/95 dark:border-white/15 dark:bg-white/10'
      : notebookSpineClassNames[(listIndex ?? 0) % notebookSpineClassNames.length];
    const notebookMetaParts = [
      creatorName?.trim() ? `创作者 · ${creatorName.trim()}` : null,
      subtitle,
      isMarkdownNotebook
        ? `${notebookContentCount} 节笔记`
        : `${notebookContentCount} ${countUnit}`,
    ].filter(Boolean);
    const showPracticeProgress = !isMarkdownNotebook || practiceTotal > 0;

    return (
      <article
        className={cn(
          'group relative flex h-full min-h-[10.75rem] min-w-0 overflow-hidden rounded-2xl border border-slate-200/85 bg-white/92 shadow-[0_14px_34px_rgba(15,23,42,0.07)] ring-1 ring-slate-900/[0.02] transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-200/80 hover:bg-white hover:shadow-[0_20px_48px_rgba(15,23,42,0.11)] dark:border-white/10 dark:bg-white/[0.065] dark:ring-white/[0.02] dark:hover:border-white/18 dark:hover:bg-white/[0.085]',
          isMarkdownNotebook &&
            'min-h-[11.5rem] border-slate-200 bg-[linear-gradient(135deg,rgba(255,255,255,0.97),rgba(248,250,252,0.96)_54%,rgba(236,253,245,0.5))] hover:border-sky-200/90 dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(21,25,33,0.96),rgba(16,20,28,0.97)_58%,rgba(8,47,73,0.38))]',
        )}
      >
        <div
          className={cn(
            'pointer-events-none absolute inset-y-0 left-0 w-7 border-r',
            notebookSpineClassName,
          )}
          aria-hidden
        >
          {isMarkdownNotebook ? (
            <>
              <span className="absolute inset-x-1.5 top-4 h-px bg-slate-300/80 dark:bg-white/18" />
              <span className="absolute inset-x-1.5 top-8 h-px bg-slate-300/70 dark:bg-white/14" />
              <span className="absolute inset-x-1.5 top-12 h-px bg-slate-300/60 dark:bg-white/12" />
            </>
          ) : (
            <>
              <span className="absolute left-1.5 top-4 size-2 rounded-full bg-white/95 shadow-sm dark:bg-white/55" />
              <span className="absolute left-1.5 top-10 size-2 rounded-full bg-white/95 shadow-sm dark:bg-white/55" />
              <span className="absolute bottom-10 left-1.5 size-2 rounded-full bg-white/95 shadow-sm dark:bg-white/55" />
              <span className="absolute bottom-4 left-1.5 size-2 rounded-full bg-white/95 shadow-sm dark:bg-white/55" />
            </>
          )}
        </div>

        <div className="flex w-full min-w-0 flex-col gap-2.5 p-2.5 pl-9 sm:flex-row sm:items-center">
          <div className="flex w-full shrink-0 flex-col gap-1.5 sm:w-[36%] sm:min-w-[5.5rem] 2xl:min-w-[6.5rem]">
            <div
              ref={thumbRef}
              className={cn(
                'relative h-[6.75rem] w-full overflow-hidden rounded-xl border border-slate-200/85 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/70',
                isMarkdownNotebook &&
                  'border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(248,250,252,0.98))] shadow-[0_10px_24px_rgba(15,23,42,0.06)] dark:border-white/12 dark:bg-[linear-gradient(180deg,rgba(30,41,59,0.72),rgba(15,23,42,0.86))]',
              )}
            >
              {isMarkdownNotebook ? (
                <div
                  className="absolute inset-0 flex flex-col justify-between px-3 py-2.5"
                  aria-label="纯笔记预览"
                >
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-sky-50 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-sky-700 ring-1 ring-sky-100 dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-400/20">
                      <FileText className="size-2.5 shrink-0" strokeWidth={2} />
                      <span className="truncate">纯笔记</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-slate-600 dark:bg-white/10 dark:text-slate-200">
                      {notebookContentCount} 节
                    </span>
                  </div>
                  <div className="space-y-1.5" aria-hidden>
                    <span className="block h-1.5 w-[82%] rounded-full bg-slate-300/80 dark:bg-white/24" />
                    <span className="block h-1.5 w-[94%] rounded-full bg-slate-200/95 dark:bg-white/16" />
                    <span className="block h-1.5 w-[72%] rounded-full bg-slate-200/95 dark:bg-white/16" />
                    <span className="block h-1.5 w-[88%] rounded-full bg-slate-200/80 dark:bg-white/12" />
                  </div>
                  <div className="flex min-w-0 items-center justify-between gap-2 border-t border-slate-200/80 pt-1.5 text-[9px] font-medium leading-none text-slate-500 dark:border-white/10 dark:text-slate-300">
                    <span className="truncate">文本阅读</span>
                    <span className="shrink-0">无图</span>
                  </div>
                </div>
              ) : shouldUseSlidePreviewImage && slidePreviewImageUrl ? (
                <img
                  src={slidePreviewImageUrl}
                  alt=""
                  className="absolute inset-0 size-full object-contain object-center transition-transform duration-500 group-hover:scale-[1.03]"
                  onError={() => setFailedSlidePreviewUrl(slidePreviewImageUrl)}
                />
              ) : shouldRenderSlideThumbnail && slide ? (
                <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-white">
                  <LazyThumbnailSlide
                    slide={slide}
                    size={thumbWidth}
                    viewportSize={slide.viewportSize ?? 1000}
                    viewportRatio={slide.viewportRatio ?? 0.5625}
                  />
                </div>
              ) : (
                <img
                  src={resolvedCoverUrl}
                  alt=""
                  className="absolute inset-0 size-full object-contain object-center transition-transform duration-500 group-hover:scale-[1.03]"
                  onError={() => setCoverImgSrc(galleryCoverUrl)}
                />
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/14 via-transparent to-white/10" />
            </div>
            {showPracticeProgress ? (
              <div
                className="min-w-0 rounded-lg border border-slate-200/80 bg-slate-50/80 px-2 py-1.5 dark:border-white/10 dark:bg-white/[0.04]"
                aria-label={practiceProgressTitle}
                data-notebook-practice-progress
                title={practiceProgressTitle}
              >
                <div className="mb-1 flex min-w-0 items-center justify-between gap-2 text-[9px] font-medium leading-none">
                  <span className="truncate text-slate-500 dark:text-slate-400">做题进度</span>
                  <span className="shrink-0 tabular-nums text-slate-700 dark:text-slate-200">
                    {practiceTotal > 0 ? `${practiceAttempted}/${practiceTotal}` : '暂无题'}
                  </span>
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10"
                  aria-hidden
                >
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      practiceProgressClassName,
                    )}
                    style={{ width: `${practicePercent}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-white/75 px-2 py-1.5 text-[9px] font-medium leading-none text-slate-500 dark:border-white/10 dark:bg-white/[0.045] dark:text-slate-300">
                <span className="inline-flex min-w-0 items-center gap-1">
                  <FileText
                    className="size-3 shrink-0 text-sky-600 dark:text-sky-300"
                    strokeWidth={1.8}
                  />
                  <span className="truncate">笔记目录</span>
                </span>
                <span className="shrink-0 tabular-nums text-slate-700 dark:text-slate-100">
                  {notebookContentCount} 节
                </span>
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-1 self-stretch py-0.5">
            <div className="flex min-h-full min-w-0 flex-1 flex-col">
              <div className="flex min-w-0 items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="line-clamp-2 text-[13px] font-semibold leading-4 tracking-normal text-slate-950 dark:text-white 2xl:text-[14px] 2xl:leading-5">
                    {course.name}
                  </h3>
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] font-medium leading-3.5 text-slate-500 dark:text-slate-400">
                    {notebookMetaParts.map((part, index) => (
                      <span key={`${part}-${index}`} className="truncate">
                        {part}
                      </span>
                    ))}
                    {parentCourseName?.trim() ? (
                      <span className="truncate">{`所属课程 · ${parentCourseName.trim()}`}</span>
                    ) : null}
                    <span
                      className={cn(
                        'inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none',
                        priceInlineClassName,
                      )}
                    >
                      <CircleDollarSign className="size-2.5 shrink-0" strokeWidth={2} />
                      {compactPriceLabel}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {onEdit ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="size-7 rounded-lg border border-slate-200/80 bg-white/80 text-slate-500 shadow-sm hover:bg-white hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                      aria-label="编辑"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit();
                      }}
                    >
                      <Pencil className="size-3.5" strokeWidth={2} />
                    </Button>
                  ) : null}
                  {hasOverflowActions ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="size-7 rounded-lg border border-slate-200/80 bg-white/80 text-slate-500 shadow-sm hover:bg-white hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                          aria-label="更多操作"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="size-3.5" strokeWidth={2} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="max-w-[min(100vw-2rem,280px)]">
                        {hasPublishAction ? (
                          <DropdownMenuItem
                            disabled={secondaryActionDisabled}
                            className="cursor-pointer text-sm"
                            onSelect={() => {
                              if (secondaryActionDisabled) return;
                              onSecondaryAction?.();
                            }}
                          >
                            <Send className="size-4" strokeWidth={1.8} />
                            {secondaryActionLabel}
                          </DropdownMenuItem>
                        ) : null}
                        {hasPublishAction && (hasMoveActions || onDelete) ? (
                          <DropdownMenuSeparator />
                        ) : null}
                        {moveToCourseTargets && moveToCourseTargets.length > 0 && onMoveToCourse ? (
                          <>
                            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                              移动到其他课程
                            </DropdownMenuLabel>
                            {moveToCourseTargets.map((target) => (
                              <DropdownMenuItem
                                key={target.id}
                                className="cursor-pointer text-sm"
                                onSelect={() => {
                                  void onMoveToCourse(target.id);
                                }}
                              >
                                <FolderInput className="size-4" strokeWidth={1.8} />
                                <span className="truncate">{target.name}</span>
                              </DropdownMenuItem>
                            ))}
                          </>
                        ) : null}
                        {hasMoveActions && onDelete ? <DropdownMenuSeparator /> : null}
                        {onDelete ? (
                          <DropdownMenuItem
                            className="cursor-pointer text-sm text-red-600 focus:text-red-600 dark:text-red-300 dark:focus:text-red-200"
                            onSelect={() => setDeleteOpen(true)}
                          >
                            <Trash2 className="size-4" strokeWidth={1.8} />
                            删除
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              </div>

              <p
                className={cn(
                  'mt-1.5 text-[10px] leading-4 text-slate-600 dark:text-slate-300 2xl:text-[11px]',
                  isMarkdownNotebook ? 'line-clamp-2' : 'line-clamp-1',
                )}
              >
                {description}
              </p>

              <div className="mt-1.5 min-w-0 rounded-lg border border-slate-200/80 bg-slate-50/70 px-1.5 py-1.5 text-[9px] dark:border-white/10 dark:bg-white/[0.045]">
                <div className="grid min-w-0 grid-cols-3 overflow-hidden rounded-md border border-slate-200/75 bg-white/70 dark:border-white/10 dark:bg-white/[0.04]">
                  {onMemoryAction ? (
                    <button
                      type="button"
                      className="flex min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-1 text-center transition-colors hover:bg-blue-50/80 dark:hover:bg-blue-500/10"
                      title="查看记忆"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMemoryAction();
                      }}
                    >
                      <span className="flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-300">
                        <Brain className="size-3" strokeWidth={1.8} />
                        {formattedMemoryCount}
                      </span>
                      <span className="text-[8px] leading-none text-slate-500 dark:text-slate-400">
                        记忆
                      </span>
                    </button>
                  ) : (
                    <span className="flex min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-1 text-center">
                      <span className="flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-300">
                        <Brain className="size-3" strokeWidth={1.8} />
                        {formattedMemoryCount}
                      </span>
                      <span className="text-[8px] leading-none text-slate-500 dark:text-slate-400">
                        记忆
                      </span>
                    </span>
                  )}
                  <span className="flex min-w-0 flex-col items-center justify-center gap-0.5 border-x border-slate-200/75 px-1 py-1 text-center dark:border-white/10">
                    <span className={cn('flex items-center gap-1 font-semibold', contentCountTone)}>
                      <ContentCountIcon className="size-3" strokeWidth={1.8} />
                      {notebookContentCount}
                    </span>
                    <span className="text-[8px] leading-none text-slate-500 dark:text-slate-400">
                      {contentCountLabel}
                    </span>
                  </span>
                  {onProblemAction ? (
                    <button
                      type="button"
                      className="flex min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-1 text-center transition-colors hover:bg-violet-50/80 dark:hover:bg-violet-500/10"
                      title="查看题库"
                      onClick={(e) => {
                        e.stopPropagation();
                        onProblemAction();
                      }}
                    >
                      <span className="flex items-center gap-1 font-semibold text-violet-700 dark:text-violet-300">
                        <FileQuestion className="size-3" strokeWidth={1.8} />
                        {formattedProblemCount}
                      </span>
                      <span className="text-[8px] leading-none text-slate-500 dark:text-slate-400">
                        题库
                      </span>
                    </button>
                  ) : (
                    <span className="flex min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-1 text-center">
                      <span className="flex items-center gap-1 font-semibold text-violet-700 dark:text-violet-300">
                        <FileQuestion className="size-3" strokeWidth={1.8} />
                        {formattedProblemCount}
                      </span>
                      <span className="text-[8px] leading-none text-slate-500 dark:text-slate-400">
                        题库
                      </span>
                    </span>
                  )}
                </div>
                {speechStatusLabel?.trim() ? (
                  <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1">
                    <span className="inline-flex max-w-full truncate rounded-md border border-slate-200/80 bg-white/70 px-1.5 py-0.5 font-medium text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                      {speechStatusLabel.trim()}
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="mt-auto grid min-w-0 grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction();
                  }}
                  className="store-cta-primary h-8 min-w-0 rounded-lg px-2 text-xs font-semibold"
                >
                  {compactActionLabel}
                </button>
                {onTertiaryAction && tertiaryActionLabel ? (
                  <button
                    type="button"
                    disabled={tertiaryActionDisabled}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (tertiaryActionDisabled) return;
                      onTertiaryAction();
                    }}
                    className={cn(
                      'store-cta-secondary h-8 min-w-0 rounded-lg px-2 text-xs font-semibold',
                      tertiaryActionDisabled && 'cursor-not-allowed opacity-55',
                    )}
                  >
                    {tertiaryActionLabel}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {onDelete ? (
          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogContent className="border-slate-200 dark:border-white/10">
              <AlertDialogHeader>
                <AlertDialogTitle>{deleteDialogTitle}</AlertDialogTitle>
                <AlertDialogDescription>{deleteDialogDescription}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel type="button">取消</AlertDialogCancel>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deleteBusy}
                  className="sm:min-w-[72px]"
                  onClick={async (e) => {
                    e.stopPropagation();
                    setDeleteBusy(true);
                    try {
                      await onDelete();
                      setDeleteOpen(false);
                    } finally {
                      setDeleteBusy(false);
                    }
                  }}
                >
                  {deleteBusy ? '…' : '删除'}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </article>
    );
  }

  return (
    <article
      className={cn(
        'apple-glass relative flex h-full min-w-0 w-full max-w-full flex-col overflow-hidden border shadow-[0_20px_60px_rgba(15,23,42,0.08)] transition-all duration-500 ease-out hover:-translate-y-1.5 hover:shadow-[0_26px_80px_rgba(15,23,42,0.12)] dark:shadow-[0_24px_70px_rgba(0,0,0,0.28)] dark:hover:shadow-[0_30px_90px_rgba(0,0,0,0.38)]',
        cfg.article,
      )}
    >
      <div ref={thumbRef} className={cn('relative w-full shrink-0 overflow-hidden', cfg.media)}>
        <div className="absolute inset-0">
          {slidePreviewImageUrl && failedSlidePreviewUrl !== slidePreviewImageUrl ? (
            <img
              src={slidePreviewImageUrl}
              alt=""
              className="absolute inset-0 size-full object-cover object-center transition-transform duration-700 group-hover:scale-[1.03]"
              onError={() => setFailedSlidePreviewUrl(slidePreviewImageUrl)}
            />
          ) : shouldRenderSlideThumbnail && slide ? (
            <LazyThumbnailSlide
              slide={slide}
              size={thumbWidth}
              viewportSize={slide.viewportSize ?? 1000}
              viewportRatio={slide.viewportRatio ?? 0.5625}
            />
          ) : (
            <img
              src={resolvedCoverUrl}
              alt=""
              className="absolute inset-0 size-full object-cover object-center transition-transform duration-700 group-hover:scale-[1.03]"
              onError={() => setCoverImgSrc(galleryCoverUrl)}
            />
          )}
        </div>
        <div
          className={cn('pointer-events-none absolute inset-0 bg-gradient-to-b', cfg.mediaOverlay)}
          aria-hidden
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/25 to-transparent dark:from-black/35" />

        <div className="absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-3 sm:inset-x-4 sm:top-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {badge ? (
              <span className="store-chip max-w-[11rem] truncate text-[11px] font-medium">
                {badge}
              </span>
            ) : null}
            {priceLabel ? (
              <span className="store-chip store-chip-success text-[11px] font-semibold">
                {priceLabel}
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {moveToCourseTargets && moveToCourseTargets.length > 0 && onMoveToCourse ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="rounded-full border border-white/60 bg-white/82 text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.08)] backdrop-blur-md hover:bg-white hover:text-slate-950 dark:border-white/14 dark:bg-black/30 dark:text-white dark:hover:bg-black/45"
                    aria-label="移动到其他课程"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <FolderInput className="size-3.5" strokeWidth={2} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-w-[min(100vw-2rem,280px)]">
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    移动到其他课程
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {moveToCourseTargets.map((target) => (
                    <DropdownMenuItem
                      key={target.id}
                      className="cursor-pointer text-sm"
                      onSelect={() => {
                        void onMoveToCourse(target.id);
                      }}
                    >
                      <span className="truncate">{target.name}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <span
              className={cn(
                'rounded-full border px-3 py-1 text-[11px] font-medium shadow-[0_8px_20px_rgba(15,23,42,0.08)] backdrop-blur-md',
                showRatingOnCover
                  ? 'border-amber-200/80 bg-white/88 text-amber-700 dark:border-amber-400/20 dark:bg-black/35 dark:text-amber-200'
                  : 'border-white/65 bg-white/82 text-slate-700 dark:border-white/14 dark:bg-black/30 dark:text-slate-100',
              )}
            >
              {showRatingOnCover ? (
                <span className="inline-flex items-center gap-1">
                  <Star className="size-3 fill-current" />
                  {coverRightLabel}
                </span>
              ) : (
                coverRightLabel
              )}
            </span>
          </div>
        </div>

        <div className="absolute inset-x-4 bottom-4 z-10 flex items-end justify-between gap-3 sm:inset-x-5 sm:bottom-5">
          <div className="min-w-0">
            {showUniversityKicker ? (
              <p className="min-w-0 truncate text-[12px] font-medium text-white/80">
                {universitySchoolLine && universityCodeLine ? (
                  <>
                    <span className="text-white/90">{universitySchoolLine}</span>
                    <span className="mx-1.5 text-white/50" aria-hidden>
                      ·
                    </span>
                    <span className="tracking-[0.12em] text-white/78 uppercase">
                      {universityCodeLine}
                    </span>
                  </>
                ) : universityCodeLine ? (
                  <span className="tracking-[0.12em] text-white/78 uppercase">
                    {universityCodeLine}
                  </span>
                ) : (
                  <span className="text-white/90">{universitySchoolLine}</span>
                )}
              </p>
            ) : (
              <p className="truncate text-[12px] font-medium tracking-[0.12em] text-white/78 uppercase">
                {defaultCoverKicker}
              </p>
            )}
            <h3 className={cn('mt-1 truncate text-white', cfg.title)}>{course.name}</h3>
          </div>
        </div>
      </div>

      <div className={cn('relative flex min-h-0 flex-1 flex-col', cfg.body)}>
        <div className="mb-4 flex items-center gap-3">
          <div
            className={cn(
              'flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/70 bg-white/92 shadow-[0_12px_30px_rgba(15,23,42,0.08)] sm:size-12 sm:rounded-2xl dark:border-white/12 dark:bg-white/8',
              safeCoverAvatarUrl && 'ring-1 ring-slate-200/80 dark:ring-white/12',
            )}
          >
            {safeCoverAvatarUrl ? (
              <img
                src={safeCoverAvatarUrl}
                alt=""
                className="size-full object-cover object-center"
              />
            ) : (
              <BookOpen className="size-5 text-slate-500 dark:text-slate-300" strokeWidth={1.7} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            {creatorName?.trim() || secondaryLabel?.trim() || speechStatusLabel?.trim() ? (
              <div
                className={cn(
                  'flex min-w-0 items-center gap-2',
                  creatorName?.trim() || secondaryLabel?.trim() ? 'justify-between' : 'justify-end',
                )}
              >
                {creatorName?.trim() ? (
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 dark:text-white">
                    {`创作者 · ${creatorName.trim()}`}
                  </p>
                ) : secondaryLabel?.trim() ? (
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 dark:text-white">
                    {secondaryLabel.trim()}
                  </p>
                ) : null}
                {speechStatusLabel?.trim() ? (
                  <span
                    className={cn(
                      'store-chip max-w-[min(100%,11rem)] shrink-0 truncate text-[11px]',
                      cfg.pillTone,
                    )}
                  >
                    {speechStatusLabel.trim()}
                  </span>
                ) : null}
              </div>
            ) : null}
            <div
              className={cn(
                'flex min-w-0 items-center justify-between gap-2',
                (creatorName?.trim() || secondaryLabel?.trim() || speechStatusLabel?.trim()) &&
                  'mt-1',
              )}
            >
              <p className={cn('min-w-0 flex-1 truncate text-xs', cfg.metaTone)}>{subtitle}</p>
              <span
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px]',
                  cfg.pillTone,
                )}
              >
                <School className="size-3.5 opacity-75" />
                {course.sceneCount} {countUnit}
              </span>
            </div>
            {showNotebookCourseMeta && (parentCourseName?.trim() || schoolLine?.trim()) ? (
              <div className="mt-1 space-y-0.5">
                {parentCourseName?.trim() ? (
                  <p
                    className={cn('truncate text-xs', cfg.metaTone)}
                  >{`所属课程 · ${parentCourseName.trim()}`}</p>
                ) : null}
                {schoolLine?.trim() ? (
                  <p className={cn('truncate text-xs', cfg.metaTone)}>{schoolLine.trim()}</p>
                ) : null}
              </div>
            ) : null}
          </div>
          {onEdit || onDelete ? (
            <div className="flex shrink-0 items-center gap-1">
              {onEdit ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="rounded-full text-slate-500 hover:bg-slate-900/5 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                  aria-label="编辑"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                >
                  <Pencil className="size-4" strokeWidth={2} />
                </Button>
              ) : null}
              {onDelete ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="rounded-full text-red-500/80 hover:bg-red-500/10 hover:text-red-600 dark:text-red-300/90 dark:hover:bg-red-500/15 dark:hover:text-red-200"
                  aria-label="删除"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteOpen(true);
                  }}
                >
                  <Trash2 className="size-4" strokeWidth={2} />
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        <p className={cfg.desc} title={description}>
          {description}
        </p>

        {tags && tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2 sm:mt-4">
            {tags.slice(0, 4).map((tag, index) => (
              <span
                key={`${tag}-${index}`}
                className="store-chip store-chip-soft max-w-full truncate text-[11px]"
              >
                {tag}
              </span>
            ))}
            {tags.length > 4 ? (
              <span className="store-chip text-[11px]">+{tags.length - 4}</span>
            ) : null}
          </div>
        ) : null}

        <div className="mt-auto flex flex-col gap-2 pt-5 min-[420px]:flex-row sm:pt-6">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAction();
            }}
            className={cn(
              'store-cta-primary rounded-full px-4 py-2.5 text-sm font-semibold sm:px-5 sm:py-3',
              (onSecondaryAction && secondaryActionLabel) ||
                (onTertiaryAction && tertiaryActionLabel)
                ? 'flex-1'
                : 'w-full',
            )}
          >
            {actionLabel}
          </button>
          {onSecondaryAction && secondaryActionLabel ? (
            <button
              type="button"
              disabled={secondaryActionDisabled}
              onClick={(e) => {
                e.stopPropagation();
                if (secondaryActionDisabled) return;
                onSecondaryAction();
              }}
              className={cn(
                'store-cta-secondary w-full shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold min-[420px]:w-auto sm:py-3',
                secondaryActionDisabled && 'cursor-not-allowed opacity-55',
              )}
            >
              {secondaryActionLabel}
            </button>
          ) : null}
          {onTertiaryAction && tertiaryActionLabel ? (
            <button
              type="button"
              disabled={tertiaryActionDisabled}
              onClick={(e) => {
                e.stopPropagation();
                if (tertiaryActionDisabled) return;
                onTertiaryAction();
              }}
              className={cn(
                'store-cta-secondary w-full shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold min-[420px]:w-auto sm:py-3',
                tertiaryActionDisabled && 'cursor-not-allowed opacity-55',
              )}
            >
              {tertiaryActionLabel}
            </button>
          ) : null}
        </div>
      </div>

      {onDelete ? (
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent className="border-slate-200 dark:border-white/10">
            <AlertDialogHeader>
              <AlertDialogTitle>{deleteDialogTitle}</AlertDialogTitle>
              <AlertDialogDescription>{deleteDialogDescription}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">取消</AlertDialogCancel>
              <Button
                type="button"
                variant="destructive"
                disabled={deleteBusy}
                className="sm:min-w-[72px]"
                onClick={async (e) => {
                  e.stopPropagation();
                  setDeleteBusy(true);
                  try {
                    await onDelete();
                    setDeleteOpen(false);
                  } finally {
                    setDeleteBusy(false);
                  }
                }}
              >
                {deleteBusy ? '…' : '删除'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </article>
  );
}
