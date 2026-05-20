'use client';

import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Brain,
  CheckCircle2,
  CircleDollarSign,
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
import { ThumbnailSlide } from '@/components/slide-renderer/components/ThumbnailSlide';
import type { StageListItem } from '@/lib/utils/stage-storage';
import type { PPTImageElement, Slide } from '@/lib/types/slides';
import { pickStableGalleryCoverUrl } from '@/lib/constants/gallery-covers';
import { cn } from '@/lib/utils';
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

/**
 * 课程/笔记本画廊列表：`auto-fill` 保留空列轨，少量卡片不会像 `auto-fit` 那样被 1fr 拉满整行；
 * `minmax(min(100%,20rem),1fr)` 在宽度不足时自动减列，避免三列硬挤成细条。
 */
export const courseGalleryListGridClassName =
  'm-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,_20rem),1fr))] gap-5 p-0';

export const notebookAssetListGridClassName =
  'm-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,_32rem),1fr))] gap-4 p-0';

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

const notebookCardBackgroundUrls = [
  '/covers/notebook-card-bg-blue.jpg',
  '/covers/notebook-card-bg-emerald.jpg',
  '/covers/notebook-card-bg-violet.jpg',
  '/covers/notebook-card-bg-amber.jpg',
  '/covers/notebook-card-bg-rose.jpg',
] as const;

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
  problemCount?: number;
}

const variantConfig = {
  'store-course': {
    article:
      'store-merch-card group min-h-[33rem] rounded-[32px] border-white/70 bg-white/78 dark:border-white/12 dark:bg-[rgba(20,24,31,0.85)]',
    media: 'h-[254px]',
    mediaOverlay:
      'from-slate-950/0 via-slate-950/12 to-slate-950/52 dark:from-slate-950/8 dark:via-slate-950/18 dark:to-slate-950/62',
    title: 'text-[1.55rem] font-semibold tracking-[-0.03em]',
    desc: 'line-clamp-4 min-h-[6.8rem] text-[14px] leading-7 text-slate-600 dark:text-slate-300',
    body: 'px-6 pb-6 pt-5',
    metaTone: 'text-slate-500 dark:text-slate-400',
    pillTone:
      'border-slate-200/80 bg-white/82 text-slate-600 dark:border-white/12 dark:bg-white/6 dark:text-slate-300',
  },
  'owned-course': {
    article:
      'store-merch-card group min-h-[30rem] rounded-[30px] border-slate-200/80 bg-[linear-gradient(180deg,rgba(252,253,255,0.95),rgba(244,247,252,0.92))] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(22,26,35,0.92),rgba(16,20,28,0.94))]',
    media: 'h-[220px]',
    mediaOverlay:
      'from-slate-950/0 via-slate-950/8 to-slate-950/42 dark:from-slate-950/10 dark:via-slate-950/16 dark:to-slate-950/55',
    title: 'text-[1.35rem] font-semibold tracking-[-0.025em]',
    desc: 'line-clamp-4 min-h-[6.2rem] text-[13.5px] leading-7 text-slate-600 dark:text-slate-300',
    body: 'px-5 pb-5 pt-4',
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
  problemCount,
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
  const preferredCoverUrl = isImageUrl(coverAvatarUrl) ? coverAvatarUrl.trim() : galleryCoverUrl;
  const slidePreviewImageUrl = pickSlidePreviewImageUrl(slide);

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
    const statusLabel = course.sourceNotebookId
      ? '已购副本'
      : course.listedInNotebookStore
        ? '已发布'
        : '草稿';
    const statusClassName = course.sourceNotebookId
      ? 'border-sky-200/80 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-200'
      : course.listedInNotebookStore
        ? 'border-emerald-200/80 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-200'
        : 'border-amber-200/80 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200';
    const compactPriceLabel = priceLabel?.trim() || '免费';
    const formattedMemoryCount =
      typeof memoryCount === 'number' && memoryCount > 0 ? memoryCount : 0;
    const formattedProblemCount =
      typeof problemCount === 'number' && problemCount > 0 ? problemCount : 0;
    const shouldUseSlidePreviewImage = Boolean(
      slidePreviewImageUrl && failedSlidePreviewUrl !== slidePreviewImageUrl,
    );
    const hasMoveActions = Boolean(moveToCourseTargets?.length && onMoveToCourse);
    const hasPublishAction = Boolean(onSecondaryAction && secondaryActionLabel);
    const hasOverflowActions = hasPublishAction || hasMoveActions || Boolean(onDelete);
    const notebookCardBackgroundUrl =
      notebookCardBackgroundUrls[(listIndex ?? 0) % notebookCardBackgroundUrls.length];
    const notebookMetaParts = [
      creatorName?.trim() ? `创作者 · ${creatorName.trim()}` : null,
      subtitle,
      `${course.sceneCount} ${countUnit}`,
    ].filter(Boolean);

    return (
      <article
        className={cn(
          'apple-glass group relative flex h-full min-h-[12rem] min-w-0 overflow-hidden rounded-xl border border-slate-200/85 bg-white/90 shadow-[0_14px_34px_rgba(15,23,42,0.07)] transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-200/80 hover:bg-white/95 hover:shadow-[0_20px_48px_rgba(15,23,42,0.11)] dark:border-white/10 dark:bg-white/[0.06] dark:hover:border-white/18 dark:hover:bg-white/[0.08]',
        )}
        style={{
          backgroundImage: `linear-gradient(90deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.28) 18%, rgba(255,255,255,0.76) 54%, rgba(255,255,255,0.88) 100%), url(${notebookCardBackgroundUrl})`,
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover',
        }}
      >
        <div className="flex w-full min-w-0 flex-col gap-3 p-3 pl-12 sm:flex-row sm:items-center">
          <div
            ref={thumbRef}
            className="relative h-[8rem] w-full shrink-0 overflow-hidden rounded-lg border border-slate-200/85 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/70 sm:w-[11.25rem] lg:w-[12rem]"
          >
            {shouldUseSlidePreviewImage && slidePreviewImageUrl ? (
              <img
                src={slidePreviewImageUrl}
                alt=""
                className="absolute inset-0 size-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.03]"
                onError={() => setFailedSlidePreviewUrl(slidePreviewImageUrl)}
              />
            ) : slide && thumbWidth > 0 ? (
              <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-white">
                <ThumbnailSlide
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
                className="absolute inset-0 size-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.03]"
                onError={() => setCoverImgSrc(galleryCoverUrl)}
              />
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/14 via-transparent to-white/10" />
          </div>

          <div className="flex min-w-0 flex-1 flex-col py-0.5">
            <div className="flex min-w-0 items-start gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-[15px] font-semibold leading-5 tracking-normal text-slate-950 dark:text-white">
                  {course.name}
                </h3>
                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {notebookMetaParts.map((part, index) => (
                    <span key={`${part}-${index}`} className="truncate">
                      {part}
                    </span>
                  ))}
                  {parentCourseName?.trim() ? (
                    <span className="truncate">{`所属课程 · ${parentCourseName.trim()}`}</span>
                  ) : null}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {onEdit ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="size-8 rounded-lg border border-slate-200/80 bg-white/70 text-slate-500 shadow-sm hover:bg-white hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
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
                        className="size-8 rounded-lg border border-slate-200/80 bg-white/70 text-slate-500 shadow-sm hover:bg-white hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
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

            <p className="mt-2 line-clamp-1 text-[12px] leading-5 text-slate-600 dark:text-slate-300">
              {description}
            </p>

            <div className="mt-3 flex min-w-0 flex-wrap items-center rounded-lg border border-slate-200/80 bg-white/72 px-2 py-1.5 text-[10px] shadow-inner dark:border-white/10 dark:bg-white/[0.045]">
              <span className="mr-2 flex min-w-[4.5rem] items-center gap-1.5 border-r border-slate-200/70 pr-2 dark:border-white/10">
                <Brain className="size-3.5 text-blue-500" strokeWidth={1.8} />
                <span className="text-slate-500 dark:text-slate-400">记忆</span>
                <strong className="font-semibold text-blue-600 dark:text-blue-300">
                  {formattedMemoryCount}
                </strong>
              </span>
              <span className="mr-2 flex min-w-[5rem] items-center gap-1.5 border-r border-slate-200/70 pr-2 dark:border-white/10">
                <Presentation className="size-3.5 text-emerald-600" strokeWidth={1.8} />
                <span className="text-slate-500 dark:text-slate-400">Slides</span>
                <strong className="font-semibold text-emerald-700 dark:text-emerald-300">
                  {course.sceneCount}
                </strong>
              </span>
              <span className="mr-2 flex min-w-[4.5rem] items-center gap-1.5 border-r border-slate-200/70 pr-2 dark:border-white/10">
                <FileQuestion className="size-3.5 text-violet-600" strokeWidth={1.8} />
                <span className="text-slate-500 dark:text-slate-400">题库</span>
                <strong className="font-semibold text-violet-700 dark:text-violet-300">
                  {formattedProblemCount}
                </strong>
              </span>
              <span
                className={cn(
                  'mr-1.5 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-semibold',
                  statusClassName,
                )}
              >
                {course.listedInNotebookStore ? (
                  <CheckCircle2 className="size-3" strokeWidth={2} />
                ) : (
                  <Send className="size-3" strokeWidth={2} />
                )}
                {statusLabel}
              </span>
              <span className="ml-auto inline-flex items-center gap-1 rounded-md border border-emerald-200/80 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-200">
                <CircleDollarSign className="size-3" strokeWidth={2} />
                {compactPriceLabel}
              </span>
              {speechStatusLabel?.trim() ? (
                <span className="ml-1.5 inline-flex max-w-[8rem] truncate rounded-md border border-slate-200/80 bg-white/70 px-2 py-0.5 font-medium text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                  {speechStatusLabel.trim()}
                </span>
              ) : null}
            </div>

            <div className="mt-auto flex min-w-0 items-center gap-3 pt-3">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAction();
                }}
                className="store-cta-primary h-8 min-w-[6.5rem] rounded-lg px-4 text-sm font-semibold"
              >
                {actionLabel.replace('笔记本', '')}
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
                    'store-cta-secondary h-8 min-w-[5.75rem] rounded-lg px-4 text-sm font-semibold',
                    tertiaryActionDisabled && 'cursor-not-allowed opacity-55',
                  )}
                >
                  {tertiaryActionLabel}
                </button>
              ) : null}
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
          {slide && thumbWidth > 0 ? (
            <ThumbnailSlide
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

        <div className="absolute inset-x-4 top-4 z-10 flex items-start justify-between gap-3">
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

        <div className="absolute inset-x-5 bottom-5 z-10 flex items-end justify-between gap-3">
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
              'flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/70 bg-white/92 shadow-[0_12px_30px_rgba(15,23,42,0.08)] dark:border-white/12 dark:bg-white/8',
              coverAvatarUrl?.trim() && 'ring-1 ring-slate-200/80 dark:ring-white/12',
            )}
          >
            {coverAvatarUrl?.trim() ? (
              <img
                src={coverAvatarUrl.trim()}
                alt=""
                className="size-full object-cover object-center"
              />
            ) : (
              <BookOpen className="size-5 text-slate-500 dark:text-slate-300" strokeWidth={1.7} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            {creatorName?.trim() ||
            secondaryLabel?.trim() ||
            speechStatusLabel?.trim() ? (
              <div
                className={cn(
                  'flex min-w-0 items-center gap-2',
                  creatorName?.trim() || secondaryLabel?.trim()
                    ? 'justify-between'
                    : 'justify-end',
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
                (creatorName?.trim() ||
                  secondaryLabel?.trim() ||
                  speechStatusLabel?.trim()) &&
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
          <div className="mt-4 flex flex-wrap gap-2">
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

        <div className="mt-auto flex gap-2 pt-6">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAction();
            }}
            className={cn(
              'store-cta-primary rounded-full px-5 py-3 text-sm font-semibold',
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
                'store-cta-secondary shrink-0 rounded-full px-4 py-3 text-sm font-semibold',
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
                'store-cta-secondary shrink-0 rounded-full px-4 py-3 text-sm font-semibold',
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
