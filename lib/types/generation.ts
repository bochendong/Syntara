/**
 * Generation Types - Two-Stage Content Generation System
 *
 * Stage 1: User requirements + documents → Scene Outlines (per-page)
 * Stage 2: Scene Outlines → Full Scenes (slide/quiz/interactive/pbl with actions)
 */

import type { ActionType } from './action';
import type { MediaGenerationRequest } from '@/lib/media/types';
import type {
  NotebookContentDensity,
  NotebookContentLayoutFamily,
  NotebookContentLayoutTemplate,
  NotebookContentOverflowPolicy,
  NotebookContentProfile,
  NotebookContentVisualRole,
} from '@/lib/notebook-content';

export type SceneArchetype = 'intro' | 'concept' | 'definition' | 'example' | 'bridge' | 'summary';

export interface SceneLayoutIntent {
  layoutFamily: NotebookContentLayoutFamily;
  layoutTemplate?: NotebookContentLayoutTemplate;
  density?: NotebookContentDensity;
  visualRole?: NotebookContentVisualRole;
  overflowPolicy?: NotebookContentOverflowPolicy;
  preserveFullProblemStatement?: boolean;
}

export interface SceneContinuation {
  rootOutlineId: string;
  partNumber: number;
  totalParts: number;
}

// ==================== PDF Image Types ====================

/**
 * Image extracted from PDF with metadata
 */
export interface PdfImage {
  id: string; // e.g., "img_1", "img_2"
  src: string; // base64 data URL (empty when stored in IndexedDB)
  pageNumber: number; // Page number in PDF
  description?: string; // Optional description for AI context
  storageId?: string; // Reference to IndexedDB (session_xxx_img_1)
  width?: number; // Image width (px or normalized)
  height?: number; // Image height (px or normalized)
}

/**
 * Image mapping for post-processing: image_id → base64 URL
 */
export type ImageMapping = Record<string, string>;

// ==================== Stage 1 Input ====================

export interface AudienceProfile {
  gradeLevel: string; // "K-12", "University", "Professional"
  ageRange?: string; // "6-12", "18-25"
  prerequisites?: string[]; // Required prior knowledge
  learningStyles?: ('visual' | 'auditory' | 'kinesthetic' | 'reading')[];
}

export interface StylePreferences {
  tone: 'formal' | 'casual' | 'engaging' | 'academic';
  visualStyle: 'minimalist' | 'colorful' | 'professional' | 'playful';
  interactivityLevel: 'low' | 'medium' | 'high';
  includeExamples: boolean;
  includePractice: boolean;
  language: string; // 'zh-CN', 'en-US'
}

export interface UploadedDocument {
  id: string;
  name: string; // Original filename
  type: 'pdf' | 'docx' | 'pptx' | 'txt' | 'md' | 'image' | 'other';
  size: number; // Bytes
  uploadedAt: Date;
  contentSummary?: string; // Placeholder for parsing
  extractedTopics?: string[]; // Placeholder for parsing
  pageCount?: number;
  storageRef?: string;
}

/**
 * Simplified user requirements for course generation
 * All details (topic, duration, style, etc.) should be included in the requirement text
 */
export interface UserRequirements {
  requirement: string; // Single free-form text for all user input
  language: 'zh-CN' | 'en-US'; // Course language - critical for generation
  userNickname?: string; // Student nickname for personalization
  userBio?: string; // Student background for personalization
  webSearch?: boolean; // Enable web search for richer context
}

/**
 * @deprecated Use UserRequirements instead
 * Legacy structured requirements - kept for backward compatibility
 */
export interface LegacyUserRequirements {
  topic: string;
  description?: string;
  learningObjectives: string[];
  audience: AudienceProfile;
  durationMinutes: number;
  style: StylePreferences;
  documents?: UploadedDocument[];
  additionalNotes?: string;
}

// ==================== Stage 1 Output: Scene Outlines (Simplified) ====================

/**
 * Simplified scene outline
 * Gives AI more freedom, only requiring intent description and key points
 */
export interface SceneOutline {
  id: string;
  type: 'slide' | 'quiz' | 'interactive' | 'pbl';
  contentProfile?: NotebookContentProfile;
  archetype?: SceneArchetype;
  layoutIntent?: SceneLayoutIntent;
  continuation?: SceneContinuation;
  title: string;
  description: string; // 1-2 sentences describing the purpose
  keyPoints: string[]; // 3-5 core key points
  teachingObjective?: string;
  estimatedDuration?: number; // seconds
  order: number;
  language?: 'zh-CN' | 'en-US'; // Generation language (inherited from requirements)
  // Suggested image IDs (from PDF-extracted images)
  suggestedImageIds?: string[]; // e.g., ["img_1", "img_3"]
  // AI-generated media requests (when PDF images are insufficient)
  mediaGenerations?: MediaGenerationRequest[]; // e.g., [{ type: 'image', prompt: '...', elementId: 'gen_img_1' }]
  // Worked-example / teacher-led problem explanation metadata for slide scenes
  workedExampleConfig?: {
    kind: 'code' | 'proof' | 'math' | 'case_analysis' | 'general';
    role:
      | 'problem_statement'
      | 'givens_and_goal'
      | 'constraints'
      | 'solution_plan'
      | 'walkthrough'
      | 'pitfalls'
      | 'summary';
    exampleId?: string; // Shared ID across multiple scenes in the same example sequence
    partNumber?: number; // Current part number if the example spans multiple slides
    totalParts?: number; // Total parts in the example sequence
    problemStatement?: string; // Full or summarized problem statement for display
    givens?: string[]; // Known conditions / inputs / premises
    asks?: string[]; // What students need to find / prove / explain
    constraints?: string[]; // Constraints, assumptions, or scope limits
    solutionPlan?: string[]; // High-level strategy before detailed steps
    walkthroughSteps?: string[]; // Step-by-step solving or proof flow
    commonPitfalls?: string[]; // Frequent mistakes or misconceptions
    finalAnswer?: string; // Concise conclusion / answer if appropriate
    codeSnippet?: string; // Optional code excerpt for code walkthrough slides
  };
  // Quiz-specific config
  quizConfig?: {
    questionCount: number;
    difficulty: 'easy' | 'medium' | 'hard';
    questionTypes: (
      | 'single'
      | 'multiple'
      | 'multiple_choice'
      | 'text'
      | 'short_answer'
      | 'proof'
      | 'code_tracing'
      | 'code'
    )[];
  };
  // Interactive-specific config
  interactiveConfig?: {
    conceptName: string;
    conceptOverview: string;
    designIdea: string;
    subject?: string;
  };
  // PBL-specific config
  pblConfig?: {
    projectTopic: string;
    projectDescription: string;
    targetSkills: string[];
    issueCount?: number;
    language: 'zh-CN' | 'en-US';
  };
}

// ==================== Stage 3 Output: Generated Content ====================

import type { PPTElement, SlideBackground, SlideTheme } from './slides';
import type { QuizQuestion } from './stage';
import type { NotebookContentDocument } from '@/lib/notebook-content';

export interface GeneratedSlidePageContent {
  elements: PPTElement[];
  background?: SlideBackground;
  theme?: SlideTheme;
  remark?: string;
  contentDocument?: NotebookContentDocument;
}

export interface GeneratedSlideContinuationPage {
  outline: SceneOutline;
  content: GeneratedSlidePageContent;
}

/**
 * AI-generated slide content
 */
export interface GeneratedSlideContent extends GeneratedSlidePageContent {
  continuationPages?: GeneratedSlideContinuationPage[];
}

/**
 * AI-generated quiz content
 */
export interface GeneratedQuizContent {
  questions: QuizQuestion[];
}

// ==================== PBL Generation Types ====================

import type { PBLProjectConfig } from '@/lib/pbl/types';

/**
 * AI-generated PBL content
 */
export interface GeneratedPBLContent {
  projectConfig: PBLProjectConfig;
}

// ==================== Interactive Generation Types ====================

/**
 * Scientific model output from scientific modeling stage
 */
export interface ScientificModel {
  core_formulas: string[];
  mechanism: string[];
  constraints: string[];
  forbidden_errors: string[];
}

/**
 * AI-generated interactive content
 */
export interface GeneratedInteractiveContent {
  html: string;
  scientificModel?: ScientificModel;
}

// ==================== Legacy Types (for compatibility) ====================

export interface SuggestedSlideElement {
  type: 'text' | 'image' | 'shape' | 'chart' | 'latex' | 'line';
  purpose: 'title' | 'subtitle' | 'content' | 'example' | 'diagram' | 'formula' | 'highlight';
  contentHint: string;
  position?: 'top' | 'center' | 'bottom' | 'left' | 'right';
  chartType?: 'bar' | 'line' | 'pie' | 'radar';
  textOutline?: string[];
}

export interface SuggestedQuizQuestion {
  type:
    | 'single'
    | 'multiple'
    | 'multiple_choice'
    | 'short_answer'
    | 'proof'
    | 'code_tracing'
    | 'code';
  questionOutline: string;
  suggestedOptions?: string[];
  targetConceptId?: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface SuggestedAction {
  type: ActionType;
  description: string;
  timing?: 'start' | 'middle' | 'end' | 'after-content';
}

// ==================== Generation Session ====================

export interface GenerationProgress {
  currentStage: 1 | 2 | 3;
  overallProgress: number; // 0-100
  stageProgress: number; // 0-100
  statusMessage: string;
  scenesGenerated: number;
  totalScenes: number;
  errors?: string[];
}

export interface GenerationSession {
  id: string;
  requirements: UserRequirements;
  sceneOutlines?: SceneOutline[];
  progress: GenerationProgress;
  startedAt: Date;
  completedAt?: Date;
  generatedStageId?: string;
}
