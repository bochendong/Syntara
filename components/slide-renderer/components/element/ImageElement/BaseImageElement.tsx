'use client';

import type { PPTImageElement } from '@/lib/types/slides';
import type { CSSProperties } from 'react';
import { useState } from 'react';
import { useElementShadow } from '../hooks/useElementShadow';
import { useElementFlip } from '../hooks/useElementFlip';
import { useClipImage } from './useClipImage';
import { useFilter } from './useFilter';
import { ImageOutline } from './ImageOutline';
import { useMediaGenerationStore, isMediaPlaceholder } from '@/lib/store/media-generation';
import { useSettingsStore } from '@/lib/store/settings';
import { useStageStore } from '@/lib/store';
import { useMediaStageId } from '@/lib/contexts/media-stage-context';
import { retryMediaTask } from '@/lib/media/media-orchestrator';
import { findMediaGenerationRequestByElementId } from '@/lib/media/media-generation-requests';
import { RotateCcw, Paintbrush, ShieldAlert, ImageOff, ImageIcon } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { mediaPlaceholderUi } from '../media-placeholder-ui';
import { academyPaperBackground, academyPaperTheme } from '../academyPaperTheme';

export interface BaseImageElementProps {
  elementInfo: PPTImageElement;
}

const promptPreviewStyle: CSSProperties = {
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 4,
  overflow: 'hidden',
};

function PromptPreview({ prompt }: { prompt?: string }) {
  if (!prompt?.trim()) return null;
  return (
    <p
      className="max-w-full text-center text-[10px] font-medium leading-snug text-[#5f5661] dark:text-[#d1d1d6]"
      style={promptPreviewStyle}
    >
      {prompt.trim()}
    </p>
  );
}

/**
 * Base image element component for read-only display
 */
export function BaseImageElement({ elementInfo }: BaseImageElementProps) {
  const { t } = useI18n();
  const { shadowStyle } = useElementShadow(elementInfo.shadow);
  const { flipStyle } = useElementFlip(elementInfo.flipH, elementInfo.flipV);
  const { clipShape, imgPosition } = useClipImage(elementInfo);
  const { filter } = useFilter(elementInfo.filters);

  // Only subscribe to media store when inside a classroom (stageId provided via context).
  // Homepage thumbnails have no stageId context → skip store to prevent cross-course contamination.
  const stageId = useMediaStageId();
  const isPlaceholder = isMediaPlaceholder(elementInfo.src);
  const task = useMediaGenerationStore((s) => {
    if (!isPlaceholder || !stageId) return undefined;
    const t = s.tasks[elementInfo.src];
    // Only use task if it belongs to the current stage
    if (t && t.stageId !== stageId) return undefined;
    return t;
  });

  const imageGenerationEnabled = useSettingsStore((s) => s.imageGenerationEnabled);
  const placeholderPrompt = useStageStore((s) => {
    if (!isPlaceholder) return '';
    return (
      findMediaGenerationRequestByElementId(
        [...s.outlines, ...s.generatingOutlines, ...s.failedOutlines],
        elementInfo.src,
      )?.prompt || ''
    );
  });
  const prompt = task?.prompt || placeholderPrompt;
  // Resolve actual src: use objectUrl from store if available, otherwise original src
  const resolvedSrc =
    task?.status === 'done' && task.objectUrl
      ? task.objectUrl
      : isPlaceholder
        ? ''
        : elementInfo.src;
  const [failedResolvedSrc, setFailedResolvedSrc] = useState<string | null>(null);
  const showDisabled = isPlaceholder && !task && !imageGenerationEnabled;
  const showSkeleton =
    isPlaceholder && !showDisabled && !!task && task.status !== 'done' && task.status !== 'failed';
  const showError = isPlaceholder && task?.status === 'failed';
  const showIdle = isPlaceholder && !showDisabled && !showSkeleton && !showError && !resolvedSrc;
  const showMissingImage = Boolean(resolvedSrc && failedResolvedSrc === resolvedSrc);
  const isFullSlideImage =
    elementInfo.name === 'full_page_bitmap' ||
    (elementInfo.width >= 990 && elementInfo.height >= 550) ||
    (elementInfo.width >= 1500 && elementInfo.height >= 840);
  const usePaperFrame =
    !isFullSlideImage &&
    (isPlaceholder || Boolean(elementInfo.outline) || elementInfo.width <= 620);

  return (
    <div
      className="absolute"
      style={{
        top: `${elementInfo.top}px`,
        left: `${elementInfo.left}px`,
        width: `${elementInfo.width}px`,
        height: `${elementInfo.height}px`,
      }}
    >
      <div className="w-full h-full" style={{ transform: `rotate(${elementInfo.rotate}deg)` }}>
        <div
          className="w-full h-full relative"
          style={{
            background: usePaperFrame
              ? academyPaperBackground(academyPaperTheme.primary)
              : undefined,
            border: usePaperFrame ? `1px solid ${academyPaperTheme.cardBorder}` : undefined,
            borderRadius: usePaperFrame ? 18 : undefined,
            boxShadow: usePaperFrame && !shadowStyle ? academyPaperTheme.quietShadow : undefined,
            filter: shadowStyle ? `drop-shadow(${shadowStyle})` : '',
            transform: flipStyle,
          }}
        >
          <ImageOutline elementInfo={elementInfo} />

          <div
            className="w-full h-full overflow-hidden relative"
            style={{
              clipPath: clipShape.style,
              borderRadius: usePaperFrame ? 17 : undefined,
            }}
          >
            {showDisabled ? (
              <div className={`${mediaPlaceholderUi.disabledWrap} flex-col gap-2 px-3`}>
                <div className={mediaPlaceholderUi.caption}>
                  <ImageOff className="w-3 h-3 shrink-0" />
                  <span>{t('settings.mediaGenerationDisabled')}</span>
                </div>
                <PromptPreview prompt={prompt} />
              </div>
            ) : showSkeleton ? (
              <div className={mediaPlaceholderUi.skeletonWrap}>
                <style>{`
                  @keyframes img-pulse-ring { 0%, 100% { opacity: 0.15; transform: scale(0.85); } 50% { opacity: 0.35; transform: scale(1.1); } }
                `}</style>
                <div className="flex max-w-[92%] flex-col items-center gap-2 px-3 text-center">
                  <div className="relative w-12 h-12">
                    <div
                      className={mediaPlaceholderUi.pulseRing}
                      style={{
                        animation: 'img-pulse-ring 2.4s ease-in-out infinite',
                      }}
                    />
                    <Paintbrush
                      className={`${mediaPlaceholderUi.skeletonIcon} stroke-current`}
                      strokeWidth={1.5}
                    />
                  </div>
                  <PromptPreview prompt={prompt} />
                </div>
              </div>
            ) : showError ? (
              <div className={mediaPlaceholderUi.errorWrap}>
                {task?.errorCode === 'CONTENT_SENSITIVE' ? (
                  <div className={mediaPlaceholderUi.warningCaption}>
                    <ShieldAlert className="w-3 h-3 shrink-0" />
                    <span>{t('settings.mediaContentSensitive')}</span>
                  </div>
                ) : task?.errorCode === 'GENERATION_DISABLED' ? (
                  <div className={mediaPlaceholderUi.caption}>
                    <ImageOff className="w-3 h-3 shrink-0" />
                    <span>{t('settings.mediaGenerationDisabled')}</span>
                  </div>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      retryMediaTask(elementInfo.src);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className={mediaPlaceholderUi.retryBtn}
                  >
                    <RotateCcw className="w-3 h-3" />
                    {t('settings.mediaRetry')}
                  </button>
                )}
                <PromptPreview prompt={prompt} />
              </div>
            ) : showIdle ? (
              <div className={mediaPlaceholderUi.imageIdleWrap}>
                <div className="flex max-w-[92%] flex-col items-center gap-2 px-3 text-center">
                  <ImageIcon className={mediaPlaceholderUi.imageIdleIcon} strokeWidth={1.5} />
                  <PromptPreview prompt={prompt} />
                </div>
              </div>
            ) : showMissingImage ? (
              <div className="flex h-full w-full items-center justify-center bg-slate-100/80 text-slate-400 dark:bg-slate-900/70 dark:text-slate-500">
                <ImageOff className="h-5 w-5" strokeWidth={1.5} />
              </div>
            ) : resolvedSrc ? (
              <>
                <img
                  src={resolvedSrc}
                  draggable={false}
                  style={{
                    position: 'absolute',
                    top: imgPosition.top,
                    left: imgPosition.left,
                    width: imgPosition.width,
                    height: imgPosition.height,
                    filter,
                  }}
                  alt=""
                  onError={() => setFailedResolvedSrc(resolvedSrc)}
                  onDragStart={(e) => e.preventDefault()}
                />
                {elementInfo.colorMask && (
                  <div
                    className="absolute inset-0"
                    style={{ backgroundColor: elementInfo.colorMask }}
                  />
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
