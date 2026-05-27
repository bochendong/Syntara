'use client';

import { useCallback, useRef, useState } from 'react';
import {
  PALETTES,
  STYLE_OPTIONS,
  type OutlineRow,
  type StyleSample,
  type StyleSampleStatus,
} from './create-notebook-workspace-model';

type UseCreateNotebookStyleStateArgs = {
  outlinePlanKey: string;
  selectedOutline?: OutlineRow;
  drawingLanguage: 'zh-CN' | 'en-US';
  onStyleChanged: () => void;
  onCustomStyleSelected: () => void;
};

export function useCreateNotebookStyleState({
  outlinePlanKey,
  selectedOutline,
  drawingLanguage,
  onStyleChanged,
  onCustomStyleSelected,
}: UseCreateNotebookStyleStateArgs) {
  const styleSampleAbortRef = useRef<AbortController | null>(null);
  const [selectedStyleId, setSelectedStyleId] = useState(STYLE_OPTIONS[0]?.id ?? 'board');
  const [customStylePrompt, setCustomStylePrompt] = useState(STYLE_OPTIONS[0]?.prompt ?? '');
  const [selectedPaletteId, setSelectedPaletteId] = useState(PALETTES[0]?.id ?? 'blue-teal');
  const [styleSampleStatus, setStyleSampleStatus] = useState<StyleSampleStatus>('idle');
  const [styleSample, setStyleSample] = useState<StyleSample | null>(null);
  const [styleSampleError, setStyleSampleError] = useState('');

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
  const currentStyleSampleKey = [
    outlinePlanKey,
    selectedOutline?.id || '',
    selectedOutline?.title || '',
    selectedOutline?.focus || '',
    selectedStyleId,
    drawingStylePrompt,
    selectedPaletteId,
    drawingLanguage,
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

  const abortStyleSampleRequest = useCallback(() => {
    styleSampleAbortRef.current?.abort();
    styleSampleAbortRef.current = null;
  }, []);

  const selectDrawingStyle = useCallback(
    (style: (typeof STYLE_OPTIONS)[number]) => {
      setSelectedStyleId(style.id);
      setCustomStylePrompt(style.prompt);
      onStyleChanged();
      if (style.id === 'custom') {
        onCustomStyleSelected();
      }
    },
    [onCustomStyleSelected, onStyleChanged],
  );

  const resetStyleSample = useCallback(() => {
    abortStyleSampleRequest();
    setStyleSample(null);
    setStyleSampleStatus('idle');
    setStyleSampleError('');
  }, [abortStyleSampleRequest]);

  const resetStyleState = useCallback(() => {
    setCustomStylePrompt(STYLE_OPTIONS[0]?.prompt ?? '');
    resetStyleSample();
  }, [resetStyleSample]);

  return {
    styleSampleAbortRef,
    selectedStyleId,
    selectedStyle,
    customStylePrompt,
    setCustomStylePrompt,
    selectedPaletteId,
    setSelectedPaletteId,
    selectedPalette,
    drawingStylePrompt,
    hasCustomDrawingStyle,
    currentStyleSampleKey,
    styleSampleStatus,
    setStyleSampleStatus,
    styleSample,
    setStyleSample,
    styleSampleError,
    setStyleSampleError,
    styleSampleIsCurrent,
    styleSampleIsStale,
    styleSampleQualityPassed,
    selectDrawingStyle,
    abortStyleSampleRequest,
    resetStyleSample,
    resetStyleState,
  };
}
