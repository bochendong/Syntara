'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  FolderInput,
  Pencil,
  School,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react';
import { ThumbnailSlide } from '@/components/slide-renderer/components/ThumbnailSlide';
import type { StageListItem } from '@/lib/utils/stage-storage';
import type { Slide } from '@/lib/types/slides';
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
  speechStatusLabel?: string;
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
  speechStatusLabel,
}: CourseGalleryCardProps) {
  const cfg = variantConfig[variant];
  const thumbRef = useRef<HTMLDivElement>(null);
  const [thumbWidth, setThumbWidth] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [coverImgSrc, setCoverImgSrc] = useState<string | null>(null);

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

  useEffect(() => {
    setCoverImgSrc(null);
  }, [course.id, preferredCoverUrl]);

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
  const universityCourseCodeLabel =
    isUniversityCourse && (courseMetaChips?.school?.trim() || courseMetaChips?.courseCode?.trim())
      ? [courseMetaChips?.school?.trim(), courseMetaChips?.courseCode?.trim()]
          .filter(Boolean)
          .join(' ')
      : null;
  const coverKickerLabel =
    universityCourseCodeLabel ??
    (variant === 'store-course'
      ? 'Featured Course'
      : variant === 'owned-course'
        ? 'My Library'
        : 'Notebook Library');

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
            <p className="truncate text-[12px] font-medium tracking-[0.12em] text-white/78 uppercase">
              {coverKickerLabel}
            </p>
            <h3 className={cn('mt-1 truncate text-white', cfg.title)}>{course.name}</h3>
          </div>
          <div className="hidden rounded-full border border-white/18 bg-white/10 p-2 text-white backdrop-blur-md md:block">
            <ArrowRight className="size-4" />
          </div>
        </div>
      </div>

      <div className={cn('relative flex min-h-0 flex-1 flex-col', cfg.body)}>
        <div className="mb-4 flex items-start gap-3">
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
            <p className={cn('truncate text-xs', cfg.metaTone)}>{subtitle}</p>
            {creatorName?.trim() ? (
              <p className="mt-1 truncate text-sm font-medium text-slate-900 dark:text-white">
                {`创作者 · ${creatorName.trim()}`}
              </p>
            ) : secondaryLabel?.trim() ? (
              <p className="mt-1 truncate text-sm font-medium text-slate-900 dark:text-white">
                {secondaryLabel.trim()}
              </p>
            ) : null}
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

        <div className="mt-4 space-y-3">
          {tags && tags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
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

          <div className="flex flex-wrap gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px]',
                cfg.pillTone,
              )}
            >
              <School className="size-3.5 opacity-75" />
              {course.sceneCount} {countUnit}
            </span>
            {courseMetaChips?.school?.trim() ? (
              <span className={cn('store-chip text-[11px]', cfg.pillTone)}>
                {courseMetaChips.school.trim()}
              </span>
            ) : null}
            {courseMetaChips?.purposeType?.trim() ? (
              <span className={cn('store-chip text-[11px]', cfg.pillTone)}>
                <Sparkles className="size-3.5" />
                {courseMetaChips.purposeType.trim()}
              </span>
            ) : null}
            {courseMetaChips?.courseCode?.trim() ? (
              <span className={cn('store-chip text-[11px]', cfg.pillTone)}>
                {courseMetaChips.courseCode.trim()}
              </span>
            ) : null}
            {speechStatusLabel?.trim() ? (
              <span className={cn('store-chip text-[11px]', cfg.pillTone)}>
                {speechStatusLabel.trim()}
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-auto flex gap-2 pt-6">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAction();
            }}
            className={cn(
              'store-cta-primary rounded-full px-5 py-3 text-sm font-semibold',
              onSecondaryAction && secondaryActionLabel ? 'flex-1' : 'w-full',
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
