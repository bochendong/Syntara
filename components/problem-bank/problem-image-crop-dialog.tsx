'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Crop, RotateCcw } from 'lucide-react';
import type { NotebookProblemImageAsset } from '@/lib/problem-bank';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

type Locale = 'zh-CN' | 'en-US';

type CropBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

type CropInteraction =
  | {
      mode: 'move';
      startClientX: number;
      startClientY: number;
      startCrop: CropBox;
    }
  | {
      mode: 'resize';
      handle: ResizeHandle;
      startClientX: number;
      startClientY: number;
      startCrop: CropBox;
    };

const FULL_CROP_BOX: CropBox = { x: 0, y: 0, width: 100, height: 100 };
const MIN_CROP_PERCENT = 5;
const MAX_IMAGE_SRC_LENGTH = 8_000_000;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeCrop(crop: CropBox): CropBox {
  const width = clamp(crop.width, MIN_CROP_PERCENT, 100);
  const height = clamp(crop.height, MIN_CROP_PERCENT, 100);
  return {
    x: clamp(crop.x, 0, 100 - width),
    y: clamp(crop.y, 0, 100 - height),
    width,
    height,
  };
}

function resizeCrop(crop: CropBox, handle: ResizeHandle, dx: number, dy: number): CropBox {
  let left = crop.x;
  let top = crop.y;
  let right = crop.x + crop.width;
  let bottom = crop.y + crop.height;

  if (handle.includes('w')) left = clamp(left + dx, 0, right - MIN_CROP_PERCENT);
  if (handle.includes('e')) right = clamp(right + dx, left + MIN_CROP_PERCENT, 100);
  if (handle.includes('n')) top = clamp(top + dy, 0, bottom - MIN_CROP_PERCENT);
  if (handle.includes('s')) bottom = clamp(bottom + dy, top + MIN_CROP_PERCENT, 100);

  return normalizeCrop({
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (!src.startsWith('data:')) image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image.'));
    image.src = src;
  });
}

async function cropImageAsset(
  image: NotebookProblemImageAsset,
  crop: CropBox,
  locale: Locale,
): Promise<NotebookProblemImageAsset> {
  const loadedImage = await loadImage(image.src);
  const naturalWidth = loadedImage.naturalWidth || loadedImage.width;
  const naturalHeight = loadedImage.naturalHeight || loadedImage.height;

  if (!naturalWidth || !naturalHeight) {
    throw new Error(locale === 'zh-CN' ? '无法读取图片尺寸。' : 'Could not read image size.');
  }

  const sourceX = Math.floor((naturalWidth * crop.x) / 100);
  const sourceY = Math.floor((naturalHeight * crop.y) / 100);
  const sourceWidth = Math.max(
    1,
    Math.min(naturalWidth - sourceX, Math.round((naturalWidth * crop.width) / 100)),
  );
  const sourceHeight = Math.max(
    1,
    Math.min(naturalHeight - sourceY, Math.round((naturalHeight * crop.height) / 100)),
  );

  const canvas = document.createElement('canvas');
  canvas.width = sourceWidth;
  canvas.height = sourceHeight;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error(locale === 'zh-CN' ? '无法创建裁剪画布。' : 'Could not create crop canvas.');
  }

  context.drawImage(
    loadedImage,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    sourceWidth,
    sourceHeight,
  );

  const src = canvas.toDataURL('image/png');
  if (src.length > MAX_IMAGE_SRC_LENGTH) {
    throw new Error(
      locale === 'zh-CN'
        ? '裁剪结果仍然太大，请缩小裁剪范围后再试。'
        : 'The cropped image is still too large. Try a smaller crop.',
    );
  }

  return {
    ...image,
    src,
    width: sourceWidth,
    height: sourceHeight,
    mimeType: 'image/png',
  };
}

const resizeHandleClassNames: Record<ResizeHandle, string> = {
  n: 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize',
  s: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-ns-resize',
  e: 'right-0 top-1/2 -translate-y-1/2 translate-x-1/2 cursor-ew-resize',
  w: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
  ne: 'right-0 top-0 -translate-y-1/2 translate-x-1/2 cursor-nesw-resize',
  nw: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize',
  se: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize',
  sw: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize',
};

function CropSlider({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
        <span>{label}</span>
        <span className="tabular-nums text-slate-500 dark:text-slate-400">
          {Math.round(value)}%
        </span>
      </div>
      <Slider
        value={[value]}
        min={0}
        max={max}
        step={1}
        onValueChange={([next]) => onChange(next)}
      />
    </label>
  );
}

export function ProblemImageCropDialog({
  image,
  open,
  locale,
  onOpenChange,
  onApply,
}: {
  image: NotebookProblemImageAsset | null;
  open: boolean;
  locale: Locale;
  onOpenChange: (open: boolean) => void;
  onApply: (image: NotebookProblemImageAsset) => void;
}) {
  const [crop, setCrop] = useState<CropBox>(FULL_CROP_BOX);
  const [interaction, setInteraction] = useState<CropInteraction | null>(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imageWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setCrop(FULL_CROP_BOX);
    setInteraction(null);
    setError(null);
  }, [image?.id, image?.src, open]);

  useEffect(() => {
    if (!interaction) return;

    const handlePointerMove = (event: PointerEvent) => {
      const rect = imageWrapRef.current?.getBoundingClientRect();
      if (!rect?.width || !rect.height) return;

      const dx = ((event.clientX - interaction.startClientX) / rect.width) * 100;
      const dy = ((event.clientY - interaction.startClientY) / rect.height) * 100;

      if (interaction.mode === 'move') {
        setCrop(
          normalizeCrop({
            ...interaction.startCrop,
            x: interaction.startCrop.x + dx,
            y: interaction.startCrop.y + dy,
          }),
        );
        return;
      }

      setCrop(resizeCrop(interaction.startCrop, interaction.handle, dx, dy));
    };

    const handlePointerUp = () => setInteraction(null);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [interaction]);

  const title = image?.caption || image?.alt || image?.sourceImageId || image?.id || '';
  const cropStyle = useMemo(
    () => ({
      left: `${crop.x}%`,
      top: `${crop.y}%`,
      width: `${crop.width}%`,
      height: `${crop.height}%`,
    }),
    [crop],
  );

  const setCropField = (field: keyof CropBox, value: number) => {
    setCrop((prev) => normalizeCrop({ ...prev, [field]: value }));
  };

  const beginMove = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    setInteraction({
      mode: 'move',
      startClientX: event.clientX,
      startClientY: event.clientY,
      startCrop: crop,
    });
  };

  const beginResize = (handle: ResizeHandle) => (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setInteraction({
      mode: 'resize',
      handle,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startCrop: crop,
    });
  };

  const handleApply = async () => {
    if (!image) return;
    setApplying(true);
    setError(null);
    try {
      const croppedImage = await cropImageAsset(image, crop, locale);
      onApply(croppedImage);
      onOpenChange(false);
    } catch (cropError) {
      setError(cropError instanceof Error ? cropError.message : 'Failed to crop image.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[min(96vw,1100px)] gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-200 px-5 py-4 pr-14 text-left dark:border-slate-800">
          <DialogTitle>{locale === 'zh-CN' ? '裁剪图片' : 'Crop image'}</DialogTitle>
          <DialogDescription className="truncate">{title}</DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 gap-4 overflow-y-auto p-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="flex min-h-[320px] items-center justify-center overflow-auto rounded-lg bg-slate-950 p-3">
            {image ? (
              <div ref={imageWrapRef} className="relative inline-block max-w-full overflow-hidden">
                <img
                  src={image.src}
                  alt={image.alt || image.caption || image.id}
                  draggable={false}
                  className="block max-h-[58vh] max-w-full select-none rounded-md object-contain"
                />
                <div
                  className={cn(
                    'absolute border-2 border-sky-400 bg-sky-400/10 shadow-[0_0_0_9999px_rgba(15,23,42,0.58)]',
                    interaction ? 'cursor-grabbing' : 'cursor-grab',
                  )}
                  style={cropStyle}
                  onPointerDown={beginMove}
                >
                  <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                    {Array.from({ length: 9 }).map((_, index) => (
                      <span
                        key={index}
                        className="border border-white/30 first:border-l-0 [&:nth-child(-n+3)]:border-t-0 [&:nth-child(3n)]:border-r-0 [&:nth-child(n+7)]:border-b-0"
                      />
                    ))}
                  </div>
                  {(Object.keys(resizeHandleClassNames) as ResizeHandle[]).map((handle) => (
                    <button
                      key={handle}
                      type="button"
                      aria-label={locale === 'zh-CN' ? '调整裁剪范围' : 'Resize crop area'}
                      className={cn(
                        'absolute z-10 h-4 w-4 rounded-full border-2 border-white bg-sky-500 shadow-sm',
                        resizeHandleClassNames[handle],
                      )}
                      onPointerDown={beginResize(handle)}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-5 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
            <div className="space-y-4">
              <CropSlider
                label={locale === 'zh-CN' ? '左' : 'Left'}
                value={crop.x}
                max={100 - crop.width}
                onChange={(value) => setCropField('x', value)}
              />
              <CropSlider
                label={locale === 'zh-CN' ? '上' : 'Top'}
                value={crop.y}
                max={100 - crop.height}
                onChange={(value) => setCropField('y', value)}
              />
              <CropSlider
                label={locale === 'zh-CN' ? '宽' : 'Width'}
                value={crop.width}
                max={100 - crop.x}
                onChange={(value) => setCropField('width', value)}
              />
              <CropSlider
                label={locale === 'zh-CN' ? '高' : 'Height'}
                value={crop.height}
                max={100 - crop.y}
                onChange={(value) => setCropField('height', value)}
              />
            </div>

            {error ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                {error}
              </p>
            ) : null}

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCrop(FULL_CROP_BOX);
                  setError(null);
                }}
                disabled={applying}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                {locale === 'zh-CN' ? '重置' : 'Reset'}
              </Button>
              <Button type="button" onClick={handleApply} disabled={!image || applying}>
                <Crop className="mr-2 h-4 w-4" />
                {applying
                  ? locale === 'zh-CN'
                    ? '处理中...'
                    : 'Applying...'
                  : locale === 'zh-CN'
                    ? '应用裁剪'
                    : 'Apply crop'}
              </Button>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
