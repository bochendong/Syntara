import type { GeneratedSlideContent } from '@/lib/types/generation';
import type { SlideTheme } from '@/lib/types/slides';

import { QUALITY_PRESETS } from './page-presets';
import { getQualityPreset } from './page-preset-groups';
import {
  DECK_STYLE_OPTIONS,
  LAYOUT_OPTIONS,
  type DeckStyleValue,
  type ErrorsByPreset,
  type GenerationErrorResult,
  type GenerationQualitySavedState,
  type GenerationResult,
  type GenerationResultsByPreset,
  type LayoutOptionValue,
  type PresetInputsByPreset,
  type PresetInputState,
  type QualityPreset,
} from './page-types';

export const GENERATION_QUALITY_STORAGE_KEY = 'syntara:generation-quality:v2';
export const LAYOUT_OPTION_VALUES = new Set<string>(LAYOUT_OPTIONS.map((option) => option.value));
export const DECK_STYLE_VALUES = new Set<string>(DECK_STYLE_OPTIONS.map((option) => option.value));
export const QUALITY_PRESET_IDS = new Set<string>(QUALITY_PRESETS.map((preset) => preset.id));

export const DEFAULT_THEME: SlideTheme = {
  backgroundColor: '#ffffff',
  themeColors: ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#64748b'],
  fontColor: '#111827',
  fontName: 'Microsoft YaHei',
  outline: { color: '#2563eb', width: 2, style: 'solid' },
  shadow: { h: 0, v: 4, blur: 16, color: 'rgba(15, 23, 42, 0.18)' },
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function isLayoutOptionValue(value: unknown): value is LayoutOptionValue {
  return typeof value === 'string' && LAYOUT_OPTION_VALUES.has(value);
}

export function isDeckStyleValue(value: unknown): value is DeckStyleValue {
  return typeof value === 'string' && DECK_STYLE_VALUES.has(value);
}

export function isLanguageValue(value: unknown): value is 'zh-CN' | 'en-US' {
  return value === 'zh-CN' || value === 'en-US';
}

export function isGeneratedSlideContent(value: unknown): value is GeneratedSlideContent {
  return isRecord(value) && Array.isArray(value.elements);
}

export function inferLanguageFromTextParts(parts: readonly string[]): 'zh-CN' | 'en-US' | null {
  const text = parts.join('\n').trim();
  if (!text) return null;
  const cjkCount = text.match(/[\u3400-\u9fff]/g)?.length || 0;
  const latinWordCount = text.match(/[A-Za-z][A-Za-z'-]{2,}/g)?.length || 0;

  if (cjkCount >= 6 && cjkCount >= latinWordCount * 0.7) return 'zh-CN';
  if (latinWordCount >= 8 && cjkCount === 0) return 'en-US';
  if (latinWordCount >= 14 && latinWordCount > cjkCount * 2) return 'en-US';
  return null;
}

export function inferPresetLanguage(preset: QualityPreset): 'zh-CN' | 'en-US' | null {
  return inferLanguageFromTextParts([
    preset.title,
    preset.outlineDescription,
    ...preset.keyPoints,
    preset.teachingObjective,
    preset.openingMove,
    preset.concreteAnchor,
  ]);
}

export function inferInputLanguage(args: {
  title: string;
  outlineDescription: string;
  keyPointsText: string;
}): 'zh-CN' | 'en-US' | null {
  return inferLanguageFromTextParts([args.title, args.outlineDescription, args.keyPointsText]);
}

export function buildDefaultPresetInput(preset: QualityPreset): PresetInputState {
  return {
    title: preset.title,
    outlineDescription: preset.outlineDescription,
    keyPointsText: preset.keyPoints.join('\n'),
    layoutTemplate: preset.layoutTemplate,
    deckStyle: preset.deckStyle,
    language: preset.language || inferPresetLanguage(preset) || 'zh-CN',
  };
}

export function normalizePresetInput(value: unknown, preset: QualityPreset): PresetInputState {
  const defaults = buildDefaultPresetInput(preset);
  if (!isRecord(value)) return defaults;
  const title = typeof value.title === 'string' ? value.title : defaults.title;
  const outlineDescription =
    typeof value.outlineDescription === 'string'
      ? value.outlineDescription
      : defaults.outlineDescription;
  const keyPointsText =
    typeof value.keyPointsText === 'string' ? value.keyPointsText : defaults.keyPointsText;
  const storedLanguage = isLanguageValue(value.language) ? value.language : defaults.language;
  return {
    title,
    outlineDescription,
    keyPointsText,
    layoutTemplate: isLayoutOptionValue(value.layoutTemplate)
      ? value.layoutTemplate
      : defaults.layoutTemplate,
    deckStyle: isDeckStyleValue(value.deckStyle) ? value.deckStyle : defaults.deckStyle,
    language:
      inferInputLanguage({ title, outlineDescription, keyPointsText }) ||
      preset.language ||
      storedLanguage,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : undefined,
  };
}

export function sanitizeInputsByPreset(value: unknown): PresetInputsByPreset {
  if (!isRecord(value)) return {};
  const output: PresetInputsByPreset = {};
  Object.entries(value).forEach(([presetId, input]) => {
    if (!QUALITY_PRESET_IDS.has(presetId)) return;
    output[presetId] = normalizePresetInput(input, getQualityPreset(presetId));
  });
  return output;
}

export function isGenerationResult(value: unknown): value is GenerationResult {
  return (
    isRecord(value) &&
    isRecord(value.scene) &&
    isRecord(value.outline) &&
    isRecord(value.rawResponse) &&
    typeof value.generatedContentCount === 'number' &&
    typeof value.createdAt === 'number'
  );
}

export function compactGenerationResultForStorage(result: GenerationResult): GenerationResult {
  return {
    ...result,
    rawResponse: {
      success: result.rawResponse.success,
      error: result.rawResponse.error,
      details: result.rawResponse.details,
      effectiveOutline: result.rawResponse.effectiveOutline,
      generationDiagnostics: result.rawResponse.generationDiagnostics,
    },
  };
}

export function sanitizeResultsByPreset(value: unknown): GenerationResultsByPreset {
  if (!isRecord(value)) return {};
  const output: GenerationResultsByPreset = {};
  Object.entries(value).forEach(([presetId, result]) => {
    if (!QUALITY_PRESET_IDS.has(presetId) || !isGenerationResult(result)) return;
    output[presetId] = result;
  });
  return output;
}

export function isGenerationErrorResult(value: unknown): value is GenerationErrorResult {
  return (
    isRecord(value) && typeof value.message === 'string' && typeof value.createdAt === 'number'
  );
}

export function sanitizeErrorsByPreset(value: unknown): ErrorsByPreset {
  if (!isRecord(value)) return {};
  const output: ErrorsByPreset = {};
  Object.entries(value).forEach(([presetId, error]) => {
    if (!QUALITY_PRESET_IDS.has(presetId) || !isGenerationErrorResult(error)) return;
    output[presetId] = error;
  });
  return output;
}

export function readGenerationQualitySavedState(
  storageKey = GENERATION_QUALITY_STORAGE_KEY,
): GenerationQualitySavedState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;
    return {
      selectedPresetId:
        typeof parsed.selectedPresetId === 'string' &&
        QUALITY_PRESET_IDS.has(parsed.selectedPresetId)
          ? parsed.selectedPresetId
          : undefined,
      inputsByPreset: sanitizeInputsByPreset(parsed.inputsByPreset),
      resultsByPreset: sanitizeResultsByPreset(parsed.resultsByPreset),
      errorsByPreset: sanitizeErrorsByPreset(parsed.errorsByPreset),
      promptPreviewErrorsByPreset: sanitizeErrorsByPreset(parsed.promptPreviewErrorsByPreset),
    };
  } catch {
    return null;
  }
}

export function writeGenerationQualitySavedState(
  state: GenerationQualitySavedState,
  storageKey = GENERATION_QUALITY_STORAGE_KEY,
): void {
  if (typeof window === 'undefined') return;
  try {
    const compactResults: GenerationResultsByPreset = {};
    Object.entries(state.resultsByPreset || {}).forEach(([presetId, result]) => {
      if (!result) return;
      compactResults[presetId] = compactGenerationResultForStorage(result);
    });
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        selectedPresetId: state.selectedPresetId,
        inputsByPreset: state.inputsByPreset || {},
        resultsByPreset: compactResults,
        errorsByPreset: state.errorsByPreset || {},
        promptPreviewErrorsByPreset: state.promptPreviewErrorsByPreset || {},
      }),
    );
  } catch {
    // localStorage can fail under private browsing or quota pressure; the QA page still works in memory.
  }
}

export function presetInputMatches(a: PresetInputState | undefined, b: PresetInputState): boolean {
  if (!a) return false;
  return (
    a.title === b.title &&
    a.outlineDescription === b.outlineDescription &&
    a.keyPointsText === b.keyPointsText &&
    a.layoutTemplate === b.layoutTemplate &&
    a.deckStyle === b.deckStyle &&
    a.language === b.language
  );
}
