/**
 * Type definitions for the generation pipeline.
 */

import type { GenerationProgress } from '@/lib/types/generation';

// ==================== Agent Info ====================

/** Lightweight agent info passed to the generation pipeline */
export interface AgentInfo {
  id: string;
  name: string;
  role: string;
  persona?: string;
}

// ==================== Cross-Page Context ====================

export interface SceneActionCourseSpineContext {
  logline?: string;
  openingHook?: string;
  centralQuestion?: string;
  recurringExample?: string;
  visualMotif?: string;
  closingCallback?: string;
  acts?: Array<{
    id?: string;
    act?: string;
    title?: string;
    purpose?: string;
    pages?: number[];
    keyQuestion?: string;
  }>;
}

export interface SceneActionContinuityContext {
  actId?: string;
  rhetoricalRole?: string;
  fromPrevious?: string;
  pageMove?: string;
  toNext?: string;
  callbackToSpine?: string;
}

export interface SceneActionFocusPlanItem {
  targetId?: string;
  label: string;
  role?: string;
  targetHint?: string;
  order?: number;
}

export interface SceneActionNarrationPolicy {
  minSpeechSegments?: number;
  preferredSpeechSegments?: string;
  maxConsecutiveSpeechWithoutFocus?: number;
  requireFocusBeforeSpeech?: boolean;
  requireSpeechAfterFocus?: boolean;
  directAddress?: boolean;
}

/** Cross-page context for maintaining speech coherence across scenes */
export interface SceneGenerationContext {
  pageIndex: number; // Current page (1-based)
  totalPages: number; // Total number of pages
  allTitles: string[]; // All page titles in order
  previousSpeeches: string[]; // Speech texts from the previous page only
  courseSpine?: SceneActionCourseSpineContext;
  continuity?: SceneActionContinuityContext;
  focusPlan?: SceneActionFocusPlanItem[];
  narrationPolicy?: SceneActionNarrationPolicy;
}

/** Course-level personalization context used by all generation stages */
export interface CoursePersonalizationContext {
  name?: string;
  description?: string;
  tags?: string[];
  purpose?: 'research' | 'university' | 'daily';
  university?: string;
  courseCode?: string;
  language?: 'zh-CN' | 'en-US';
}

// ==================== Generated Slide Data Interface ====================

/**
 * AI-generated slide data structure
 * Used to parse AI responses
 */
export interface GeneratedSlideData {
  elements: Array<{
    type: 'text' | 'image' | 'video' | 'shape' | 'chart' | 'latex' | 'line';
    left: number;
    top: number;
    width: number;
    height: number;
    [key: string]: unknown;
  }>;
  background?: {
    type: 'solid' | 'gradient';
    color?: string;
    gradient?: {
      type: 'linear' | 'radial';
      colors: Array<{ pos: number; color: string }>;
      rotate: number;
    };
  };
  remark?: string;
}

// ==================== Types ====================

export interface GenerationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface GenerationCallbacks {
  onProgress?: (progress: GenerationProgress) => void;
  onStageComplete?: (stage: 1 | 2 | 3, result: unknown) => void;
  onError?: (error: string) => void;
}

export type AICallFn = (
  systemPrompt: string,
  userPrompt: string,
  images?: Array<{ id: string; src: string }>,
) => Promise<string>;
