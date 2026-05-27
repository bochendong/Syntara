'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  LockKeyhole,
  Loader2,
  PlayCircle,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import {
  clampNumber,
  inferExpectedCourseRouteFromFixture,
  sourcePagesFromFixture,
  sourceTextPreview,
  statusClassName,
  statusIcon,
} from '../lib/pipeline-core';
import type {
  LectureTargetRect,
  PipelineCheck,
  PipelineStepState,
  TestfileFixture,
} from '../lib/pipeline-core';

export function StepStatusIcon({ state }: { state: PipelineStepState }) {
  if (state === 'locked') return <LockKeyhole className="size-4" />;
  if (state === 'running') return <Loader2 className="size-4 animate-spin" />;
  if (state === 'pass') return <CheckCircle2 className="size-4" />;
  if (state === 'warn') return <AlertTriangle className="size-4" />;
  if (state === 'fail') return <XCircle className="size-4" />;
  return <PlayCircle className="size-4" />;
}

export function PagerControls({
  index,
  total,
  onPrevious,
  onNext,
  unit = '页',
}: {
  index: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  unit?: string;
}) {
  const isFirst = index <= 0;
  const isLast = index >= total - 1;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={isFirst || total <= 0}
        onClick={onPrevious}
        className="h-9 rounded-lg"
      >
        <ChevronUp className="size-4" />
        上一{unit}
      </Button>
      <div className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
        {total > 0 ? `${index + 1} / ${total}` : `0 / 0`}
      </div>
      <Button
        type="button"
        variant="outline"
        disabled={isLast || total <= 0}
        onClick={onNext}
        className="h-9 rounded-lg"
      >
        <ChevronDown className="size-4" />
        下一{unit}
      </Button>
    </div>
  );
}

export function GateCheckList({ checks }: { checks: PipelineCheck[] }) {
  const failed = checks.filter((check) => check.status === 'fail').length;
  const warned = checks.filter((check) => check.status === 'warn').length;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-slate-600">Gate checks</span>
        <span
          className={cn(
            'rounded-md border px-2 py-0.5 font-semibold',
            failed
              ? 'border-red-200 bg-red-50 text-red-700'
              : warned
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700',
          )}
        >
          {failed ? `${failed} fail` : warned ? `${warned} warn` : 'pass'}
        </span>
      </div>
      <div className="mt-3 grid gap-2">
        {checks.map((check) => {
          const Icon = statusIcon(check.status);
          return (
            <div
              key={check.id}
              className={cn('rounded-xl border px-3 py-2 text-sm', statusClassName(check.status))}
            >
              <div className="flex items-center gap-2 font-semibold">
                <Icon className="size-4" />
                {check.title}
              </div>
              <p className="mt-1 text-xs leading-5 opacity-90">{check.detail}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ScaledHtmlPreview({
  title,
  html,
  canvasWidth = 1600,
  canvasHeight = 900,
  overlayRect,
  overlayLabel,
  overlayTone = 'spotlight',
}: {
  title: string;
  html: string;
  canvasWidth?: number;
  canvasHeight?: number;
  overlayRect?: LectureTargetRect | null;
  overlayLabel?: string;
  overlayTone?: 'spotlight' | 'laser';
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rawMaskId = useId();
  const [containerWidth, setContainerWidth] = useState(0);
  const scale = containerWidth > 0 ? containerWidth / canvasWidth : 0;
  const previewHeight = scale > 0 ? Math.round(canvasHeight * scale) : 0;
  const maskId = `html-preview-mask-${rawMaskId.replace(/:/g, '')}`;
  const scaledOverlay = overlayRect
    ? {
        x: clampNumber((overlayRect.x - 10) * scale, 0, Math.max(0, containerWidth - 1)),
        y: clampNumber((overlayRect.y - 10) * scale, 0, Math.max(0, previewHeight - 1)),
        width: clampNumber(
          (overlayRect.width + 20) * scale,
          1,
          Math.max(1, containerWidth - Math.max(0, (overlayRect.x - 10) * scale)),
        ),
        height: clampNumber(
          (overlayRect.height + 20) * scale,
          1,
          Math.max(1, previewHeight - Math.max(0, (overlayRect.y - 10) * scale)),
        ),
      }
    : null;

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    let animationFrame = window.requestAnimationFrame(() => {
      setContainerWidth(Math.floor(node.clientWidth));
    });
    const observer = new ResizeObserver((entries) => {
      const nextWidth = Math.floor(entries[0]?.contentRect.width || node.clientWidth);
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        setContainerWidth(nextWidth);
      });
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-950"
      style={{
        aspectRatio: containerWidth > 0 ? undefined : `${canvasWidth} / ${canvasHeight}`,
        height: previewHeight || undefined,
      }}
    >
      {scale > 0 ? (
        <iframe
          title={title}
          srcDoc={html}
          className="absolute left-0 top-0 border-0 bg-white"
          sandbox="allow-scripts"
          style={{
            width: canvasWidth,
            height: canvasHeight,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        />
      ) : null}
      {scale > 0 && scaledOverlay ? (
        <svg
          className="pointer-events-none absolute inset-0 z-10"
          width={containerWidth}
          height={previewHeight}
          viewBox={`0 0 ${containerWidth} ${previewHeight}`}
          preserveAspectRatio="none"
        >
          <defs>
            <mask id={maskId}>
              <rect x="0" y="0" width={containerWidth} height={previewHeight} fill="white" />
              <rect
                x={scaledOverlay.x}
                y={scaledOverlay.y}
                width={scaledOverlay.width}
                height={scaledOverlay.height}
                rx="10"
                fill="black"
              />
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width={containerWidth}
            height={previewHeight}
            fill={overlayTone === 'laser' ? 'rgba(15,23,42,0.48)' : 'rgba(15,23,42,0.58)'}
            mask={`url(#${maskId})`}
          />
          <rect
            x={scaledOverlay.x}
            y={scaledOverlay.y}
            width={scaledOverlay.width}
            height={scaledOverlay.height}
            rx="10"
            fill="none"
            stroke={overlayTone === 'laser' ? '#60a5fa' : '#f8fafc'}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          {overlayLabel ? (
            <g>
              <rect
                x={scaledOverlay.x}
                y={Math.max(4, scaledOverlay.y - 26)}
                width={Math.min(
                  containerWidth - scaledOverlay.x,
                  Math.max(130, overlayLabel.length * 8),
                )}
                height="22"
                rx="6"
                fill={overlayTone === 'laser' ? '#2563eb' : '#0f172a'}
              />
              <text
                x={scaledOverlay.x + 8}
                y={Math.max(19, scaledOverlay.y - 11)}
                fill="white"
                fontSize="12"
                fontWeight="700"
              >
                {overlayLabel}
              </text>
            </g>
          ) : null}
        </svg>
      ) : null}
    </div>
  );
}

export function SourceEvidencePanel({ fixture }: { fixture: TestfileFixture | null }) {
  const fixtureId = fixture?.id || '';
  const [sourcePageSelection, setSourcePageSelection] = useState({ fixtureId: '', index: 0 });
  const activeSourcePageIndex =
    sourcePageSelection.fixtureId === fixtureId ? sourcePageSelection.index : 0;
  const updateActiveSourcePageIndex = useCallback(
    (getNextIndex: (currentIndex: number) => number) => {
      setSourcePageSelection((previous) => {
        const currentIndex = previous.fixtureId === fixtureId ? previous.index : 0;
        return { fixtureId, index: getNextIndex(currentIndex) };
      });
    },
    [fixtureId],
  );

  if (!fixture) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        还没有 source fixture。
      </div>
    );
  }

  const pages = sourcePagesFromFixture(fixture);
  const sourcePackage = fixture.sourcePackage;
  const sourceImages = sourcePackage?.sourceImages || [];
  const imageStats = sourcePackage?.imageStats;
  const rawImageCount = imageStats?.rawCount ?? sourceImages.length;
  const filteredSmallImageCount = imageStats?.filteredSmallCount || 0;
  const filteredLargeImageCount = imageStats?.filteredLargeCount || 0;
  const filteredLimitImageCount = imageStats?.filteredLimitCount || 0;
  const dedupedImageCount = imageStats?.dedupedCount || 0;
  const filteredImageCount =
    filteredSmallImageCount + filteredLargeImageCount + filteredLimitImageCount + dedupedImageCount;
  const sourceFiles = fixture.sourceFiles || [];
  const warnings = sourcePackage?.warnings || [];
  const sourceText = sourceTextPreview(fixture);
  const expectedRoute = inferExpectedCourseRouteFromFixture(fixture);
  const boundedSourcePageIndex = pages.length
    ? Math.min(activeSourcePageIndex, pages.length - 1)
    : 0;
  const activeSourcePage = pages[boundedSourcePageIndex] || null;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-6">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs text-slate-500">sourcePages</div>
          <div className="mt-1 text-lg font-semibold text-slate-950">
            {pages.length}/{sourcePackage?.pageCount || pages.length}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs text-slate-500">sourceText</div>
          <div className="mt-1 text-lg font-semibold text-slate-950">
            {(sourcePackage?.sourceText?.length || fixture.sourceTextLength || 0).toLocaleString()}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs text-slate-500">sourceFiles</div>
          <div className="mt-1 text-lg font-semibold text-slate-950">{sourceFiles.length}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs text-slate-500">sourceImages</div>
          <div className="mt-1 text-lg font-semibold text-slate-950">
            {sourceImages.length}/{rawImageCount}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">过滤 {filteredImageCount}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs text-slate-500">route hint</div>
          <div className="mt-1 text-sm font-semibold text-slate-950">{expectedRoute.label}</div>
          <div
            className="mt-0.5 truncate text-[11px] text-slate-500"
            title={expectedRoute.evidence}
          >
            {expectedRoute.route}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs text-slate-500">warnings</div>
          <div
            className={cn(
              'mt-1 text-lg font-semibold',
              warnings.length ? 'text-amber-700' : 'text-slate-950',
            )}
          >
            {warnings.length}
          </div>
        </div>
      </div>

      {sourceFiles.length ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs font-semibold text-slate-500">Notebook source files</div>
          <div className="mt-2 grid gap-2">
            {sourceFiles.map((file) => (
              <div
                key={file.id}
                className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600 sm:grid-cols-[1fr_auto_auto]"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold text-slate-900">{file.title}</div>
                  <div className="truncate">{file.fileName}</div>
                </div>
                <div>{file.fileType}</div>
                <div>{file.pageCount} 页/段</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {warnings.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          <div className="font-semibold">Source warnings</div>
          <ul className="mt-2 grid gap-1">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-slate-500">逐页/逐段解析预览</div>
            {activeSourcePage ? (
              <div className="mt-1 text-sm font-semibold text-slate-950">
                {activeSourcePage.sourceLabel || `Source ${activeSourcePage.sourceIndex}`} ·{' '}
                {activeSourcePage.title}
              </div>
            ) : null}
          </div>
          <Badge variant="outline" className="rounded-md">
            {pages.length ? `${boundedSourcePageIndex + 1}/${pages.length}` : '0 段'}
          </Badge>
        </div>
        <div className="mt-3">
          {activeSourcePage ? (
            <div
              key={`${activeSourcePage.sourceLabel}-${activeSourcePage.sourceIndex}`}
              className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs leading-5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-white px-2 py-0.5 font-semibold text-slate-500">
                  {activeSourcePage.sourceLabel || `Source ${activeSourcePage.sourceIndex}`}
                </span>
                <span className="font-semibold text-slate-950">{activeSourcePage.title}</span>
                <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                  {activeSourcePage.suggestedPageKind}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-700">{activeSourcePage.summary}</p>
              {activeSourcePage.keyPoints?.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {activeSourcePage.keyPoints.slice(0, 5).map((point) => (
                    <span
                      key={point}
                      className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-slate-600"
                    >
                      {point}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="mt-2 rounded-md border border-slate-200 bg-white p-2 font-mono text-[11px] text-slate-600">
                {activeSourcePage.concreteAnchor || '缺少 concreteAnchor'}
              </div>
              <details className="mt-2 rounded-md border border-slate-200 bg-white">
                <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-semibold text-slate-600">
                  查看这一页/这一段的原始 source
                </summary>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap border-t border-slate-100 p-2 font-mono text-[11px] leading-5 text-slate-700">
                  {activeSourcePage.rawText || '当前 sourcePage 没有 rawText；请检查 fixture API。'}
                </pre>
              </details>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              当前 source 没有可预览的 sourcePages。
            </div>
          )}
        </div>
        <div className="mt-3">
          <PagerControls
            index={boundedSourcePageIndex}
            total={pages.length}
            unit="段"
            onPrevious={() => updateActiveSourcePageIndex((index) => Math.max(0, index - 1))}
            onNext={() =>
              updateActiveSourcePageIndex((index) => Math.min(pages.length - 1, index + 1))
            }
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold text-slate-500">源文件图片/页面视觉预览</div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-md">
              {sourceImages.length} 张可用
            </Badge>
            {filteredImageCount ? (
              <Badge
                variant="outline"
                className="rounded-md border-amber-200 bg-amber-50 text-amber-800"
              >
                已过滤 {filteredImageCount} 张
              </Badge>
            ) : null}
          </div>
        </div>
        {imageStats ? (
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
            <span>原始 {rawImageCount}</span>
            <span>可用 {sourceImages.length}</span>
            <span>过小 {filteredSmallImageCount}</span>
            <span>过大 {filteredLargeImageCount}</span>
            <span>重复 {dedupedImageCount}</span>
            <span>超出上限 {filteredLimitImageCount}</span>
          </div>
        ) : null}
        <div className="mt-3 grid max-h-[420px] gap-3 overflow-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
          {sourceImages.length ? (
            sourceImages.map((image) => (
              <div
                key={image.id}
                className="overflow-hidden rounded-lg border border-slate-100 bg-slate-50 text-xs leading-5 text-slate-600"
              >
                {image.src ? (
                  <div className="aspect-video w-full overflow-hidden bg-white">
                    <img
                      src={image.src}
                      alt={image.description || `${image.id} source image`}
                      className="size-full object-contain"
                    />
                  </div>
                ) : null}
                <div className="px-3 py-2">
                  <div className="font-semibold text-slate-950">
                    {image.id} · page {image.pageNumber}
                  </div>
                  <div>{image.description || '无图片描述'}</div>
                  {image.width && image.height ? (
                    <div className="text-slate-500">
                      {image.width}×{image.height}
                      {image.byteLength ? ` · ${Math.round(image.byteLength / 1024)} KB` : ''}
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              {rawImageCount
                ? `原始 source 解析到 ${rawImageCount} 张图片，但没有达到可复用教学素材阈值；请看上方逐页/逐段解析预览和下方完整文本预览。`
                : '当前 source 没有可复用原文图片；请看上方逐页/逐段解析预览和下方完整文本预览。'}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold text-slate-500">完整源文件文本预览</div>
          <Badge variant="outline" className="rounded-md">
            sourceText
          </Badge>
        </div>
        <Textarea
          readOnly
          value={sourceText || '当前 fixture 没有暴露 sourcePackage.sourceText。'}
          className="mt-3 min-h-[360px] resize-y rounded-xl font-mono text-xs leading-5"
        />
      </div>
    </div>
  );
}

export function TextList({
  items,
  empty,
  ordered = false,
}: {
  items: string[];
  empty: string;
  ordered?: boolean;
}) {
  if (!items.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 p-3 text-sm text-slate-500">
        {empty}
      </div>
    );
  }
  const ListTag = ordered ? 'ol' : 'ul';
  return (
    <ListTag className="grid gap-2">
      {items.map((item, index) => (
        <li
          key={`${item}-${index}`}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700"
        >
          <span className="mr-2 font-semibold text-slate-950">
            {ordered ? String(index + 1).padStart(2, '0') : '•'}
          </span>
          {item}
        </li>
      ))}
    </ListTag>
  );
}
