'use client';

import { useEffect, useRef, useState } from 'react';
import { BookOpen, FolderInput, Network, Pencil, School, Trash2 } from 'lucide-react';
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

/** 对齐 notebook-agent-sidebar `notebookCardStyles.notebookCardSx` + `NotebookCard.js` 布局 */

interface CourseGalleryCardProps {
  course: StageListItem;
  slide?: Slide;
  /** 封面左上角标签；不传则不显示 */
  badge?: string;
  subtitle: string;
  actionLabel: string;
  onAction: () => void;
  /** 与 NotebookCard 右上角 `#01` 一致；不传则右侧显示 subtitle（如日期） */
  listIndex?: number;
  /** 标题下第二行说明，默认「互动课件」 */
  secondaryLabel?: string;
  /** 与 sceneCount 搭配，默认「节」 */
  countUnit?: string;
  /** 可移动到的其他课程（不含当前课程）；有数据时显示封面右上角「移动」 */
  moveToCourseTargets?: Array<{ id: string; name: string }>;
  onMoveToCourse?: (targetCourseId: string) => void | Promise<void>;
  /** 标题左侧 48×48 区域显示的头像（如课程）；笔记本卡片不传则显示书本图标 */
  coverAvatarUrl?: string;
  /** 课程卡片等：标题行右侧「编辑」 */
  onEdit?: () => void;
  /** 课程/笔记本元数据标签（如商城展示所属课程标签） */
  tags?: string[];
  /** 所属课程名称（笔记本卡片：哪门课） */
  parentCourseName?: string;
  /** 学校 · 课号等（大学课程用途） */
  schoolLine?: string;
  /** 为 true 时才展示「课程 / 学校」两行（如商城跨课程浏览）；课程内列表不必展示 */
  showNotebookCourseMeta?: boolean;
  /** 传入时在卡片上显示删除入口（商城等场景勿传） */
  onDelete?: () => void | Promise<void>;
  deleteDialogTitle?: string;
  /** 删除确认说明；有 onDelete 时建议传入具体文案 */
  deleteDialogDescription?: string;
  priceLabel?: string;
  ratingLabel?: string;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

export function CourseGalleryCard({
  course,
  slide,
  badge,
  subtitle,
  actionLabel,
  onAction,
  listIndex,
  secondaryLabel = '互动课件',
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
  secondaryActionLabel,
  onSecondaryAction,
}: CourseGalleryCardProps) {
  const thumbRef = useRef<HTMLDivElement>(null);
  const [thumbWidth, setThumbWidth] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  /** 头像 URL 失效时回退到稳定本地封面，避免封面区只剩灰底 */
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

  const rightTopLabel =
    listIndex !== undefined ? `#${String(listIndex + 1).padStart(2, '0')}` : subtitle;

  const showCoverBadge = Boolean(badge?.trim());

  /** 无课件缩略图时使用专用封面图（非头像素材），按 id 稳定映射 */
  const galleryCoverUrl = pickStableGalleryCoverUrl(course.id);
  const preferredCoverUrl = isImageUrl(coverAvatarUrl) ? coverAvatarUrl.trim() : galleryCoverUrl;

  useEffect(() => {
    setCoverImgSrc(null);
  }, [course.id, preferredCoverUrl]);

  const resolvedCoverUrl = coverImgSrc ?? preferredCoverUrl;

  return (
    <article
      className={cn(
        'apple-glass relative flex h-full cursor-pointer flex-col overflow-hidden rounded-[24px]',
        'border border-white/45 dark:border-white/10',
        'shadow-[0_18px_48px_rgba(15,23,42,0.1),0_8px_18px_rgba(15,23,42,0.05)]',
        'dark:shadow-[0_24px_64px_rgba(0,0,0,0.34),0_10px_24px_rgba(0,0,0,0.18)]',
      )}
    >
      {/* 封面区 — NotebookCard CardMedia h:188 + 渐变遮罩 */}
      <div
        ref={thumbRef}
        className="relative h-[188px] w-full shrink-0 overflow-hidden bg-slate-200/60 dark:bg-slate-900/60"
      >
        <div className="pointer-events-none absolute inset-0">
          {slide && thumbWidth > 0 ? (
            <ThumbnailSlide
              slide={slide}
              size={thumbWidth}
              viewportSize={slide.viewportSize ?? 1000}
              viewportRatio={slide.viewportRatio ?? 0.5625}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- public/covers 与头像图
            <img
              src={resolvedCoverUrl}
              alt=""
              className="absolute inset-0 size-full object-cover object-center"
              onError={() => setCoverImgSrc(galleryCoverUrl)}
            />
          )}
        </div>
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/[0.03] via-black/[0.07] to-black/[0.32] dark:from-black/10 dark:via-black/20 dark:to-black/[0.46]"
          aria-hidden
        />
        <div
          className={cn(
            'pointer-events-auto absolute left-3.5 right-3.5 top-3.5 z-10 flex items-center gap-2',
            showCoverBadge ? 'justify-between' : 'justify-end',
          )}
        >
          {showCoverBadge ? (
            <span
              className={cn(
                'max-w-[40%] truncate rounded-md border border-white/70 bg-white/75 px-2.5 py-0.5 text-[11px] font-medium text-slate-700 backdrop-blur-md dark:border-white/15 dark:bg-black/30 dark:text-slate-100 sm:max-w-[55%]',
              )}
            >
              {badge?.trim()}
            </span>
          ) : null}
          <div className="flex shrink-0 items-center gap-1">
            {moveToCourseTargets && moveToCourseTargets.length > 0 && onMoveToCourse ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-7 rounded-md border border-white/65 bg-white/75 text-slate-700 backdrop-blur-md hover:bg-white/90 hover:text-slate-900 dark:border-white/15 dark:bg-black/30 dark:text-slate-100 dark:hover:bg-black/45 dark:hover:text-white"
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
                  {moveToCourseTargets.map((t) => (
                    <DropdownMenuItem
                      key={t.id}
                      className="cursor-pointer text-sm"
                      onSelect={() => {
                        void onMoveToCourse(t.id);
                      }}
                    >
                      <span className="truncate">{t.name}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <span
              className={cn(
                'shrink-0 rounded-md border border-white/65 bg-white/75 px-2.5 py-0.5 text-[11px] text-slate-700 backdrop-blur-sm dark:border-white/15 dark:bg-black/30 dark:text-slate-100',
              )}
            >
              {rightTopLabel}
            </span>
          </div>
        </div>
      </div>

      {/* 正文 — NotebookCard CardContent */}
      <div className="relative flex min-h-0 flex-1 flex-col px-5 pb-5 pt-4">
        <div
          className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent dark:via-white/18"
          aria-hidden
        />
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-3 pr-1">
            <div
              className={cn(
                'size-12 shrink-0 overflow-hidden rounded-xl border border-slate-200/80 bg-white/65 shadow-[0_10px_24px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-white/5',
                coverAvatarUrl?.trim()
                  ? 'ring-1 ring-slate-200/80 dark:ring-white/10'
                  : 'flex items-center justify-center',
              )}
              aria-hidden={coverAvatarUrl?.trim() ? undefined : true}
            >
              {coverAvatarUrl?.trim() ? (
                // eslint-disable-next-line @next/next/no-img-element -- 课程/笔记本头像
                <img
                  src={coverAvatarUrl.trim()}
                  alt=""
                  className="size-full object-cover object-center"
                />
              ) : (
                <BookOpen className="size-6 text-slate-500 dark:text-slate-300" strokeWidth={1.5} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-lg font-bold leading-tight tracking-tight text-slate-900 dark:text-white">
                {course.name}
              </h3>
              {showNotebookCourseMeta && (parentCourseName?.trim() || schoolLine?.trim()) ? (
                <div className="mt-1 space-y-0.5">
                  {parentCourseName?.trim() ? (
                    <p
                      className="truncate text-[12px] leading-snug text-slate-500 dark:text-slate-400"
                      title={parentCourseName.trim()}
                    >
                      <span className="text-slate-400 dark:text-slate-500">课程</span>{' '}
                      <span className="font-medium text-slate-700 dark:text-slate-200">
                        {parentCourseName.trim()}
                      </span>
                    </p>
                  ) : null}
                  {schoolLine?.trim() ? (
                    <p
                      className="truncate text-[12px] leading-snug text-slate-500 dark:text-slate-400"
                      title={schoolLine.trim()}
                    >
                      <span className="text-slate-400 dark:text-slate-500">学校</span>{' '}
                      <span className="font-medium text-slate-700 dark:text-slate-200">
                        {schoolLine.trim()}
                      </span>
                    </p>
                  ) : null}
                </div>
              ) : null}
              <p
                className={cn(
                  'text-[13px] text-slate-500 dark:text-slate-400',
                  showNotebookCourseMeta && (parentCourseName?.trim() || schoolLine?.trim())
                    ? 'mt-1.5'
                    : 'mt-1',
                )}
              >
                {secondaryLabel}
              </p>
            </div>
          </div>
          {onEdit || onDelete ? (
            <div className="flex shrink-0 items-center gap-0.5">
              {onEdit ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-8 shrink-0 rounded-lg text-slate-500 hover:bg-slate-900/5 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
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
                  className="size-8 shrink-0 rounded-lg text-red-500/80 hover:bg-red-500/10 hover:text-red-600 dark:text-red-300/90 dark:hover:bg-red-500/15 dark:hover:text-red-200"
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

        <p
          className="line-clamp-3 min-h-[4.875rem] text-[13px] leading-[1.8] text-slate-600 dark:text-slate-300"
          title={description}
        >
          {description}
        </p>

        {tags && tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.slice(0, 8).map((tag, i) => (
              <span
                key={`${i}-${tag}`}
                className="rounded-full border border-violet-200/80 bg-violet-50/85 px-2 py-0.5 text-[10.5px] font-medium text-violet-700 dark:border-violet-500/30 dark:bg-violet-950/35 dark:text-violet-200"
              >
                {tag}
              </span>
            ))}
            {tags.length > 8 ? (
              <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10.5px] text-slate-500 dark:border-white/15 dark:text-slate-400">
                +{tags.length - 8}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1 rounded-md border border-slate-200/90 bg-white/80 px-2 py-0.5 text-[11px] text-slate-600 dark:border-white/12 dark:bg-white/5 dark:text-slate-300">
            <School className="size-3.5 shrink-0 opacity-80" strokeWidth={1.75} />
            {course.sceneCount} {countUnit}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border border-slate-200/80 bg-transparent px-2 py-0.5 text-[11px] text-slate-500 dark:border-white/10 dark:text-slate-400">
            <Network className="size-3.5 shrink-0 opacity-75" strokeWidth={1.75} />
            Syntara
          </span>
          {priceLabel ? (
            <span className="inline-flex items-center rounded-md border border-emerald-200/90 bg-emerald-50/80 px-2 py-0.5 text-[11px] text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-950/30 dark:text-emerald-200">
              {priceLabel}
            </span>
          ) : null}
          {ratingLabel ? (
            <span className="inline-flex items-center rounded-md border border-amber-200/90 bg-amber-50/80 px-2 py-0.5 text-[11px] text-amber-700 dark:border-amber-500/25 dark:bg-amber-950/30 dark:text-amber-200">
              {ratingLabel}
            </span>
          ) : null}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAction();
            }}
            className={cn(
              'apple-btn apple-btn-primary rounded-full py-2.5 text-sm font-semibold',
              onSecondaryAction && secondaryActionLabel ? 'flex-1' : 'w-full',
            )}
          >
            {actionLabel}
          </button>
          {onSecondaryAction && secondaryActionLabel ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSecondaryAction();
              }}
              className="apple-btn apple-btn-secondary shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold"
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
