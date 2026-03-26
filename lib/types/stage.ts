// Stage and Scene data types
import type { Slide } from '@/lib/types/slides';
import type { Action } from '@/lib/types/action';
import type { PBLProjectConfig } from '@/lib/pbl/types';

export type SceneType = 'slide' | 'quiz' | 'interactive' | 'pbl';

export type StageMode = 'autonomous' | 'playback';

export type Whiteboard = Omit<Slide, 'theme' | 'turningMode' | 'sectionTag' | 'type'>;

/**
 * Stage — 某一门课程（Course）下的一个「笔记本」/ 互动课件空间
 */
export interface Stage {
  id: string;
  /** 所属课程 ID（IndexedDB Course） */
  courseId?: string;
  /** 笔记本头像，如 `/avatars/notebook-agents/xxx.avif` */
  avatarUrl?: string;
  name: string;
  description?: string;
  /** 笔记本标签，用于课程内快速检索/识别 */
  tags?: string[];
  createdAt: number;
  updatedAt: number;
  // Stage metadata
  language?: string;
  style?: string;
  // Whiteboard data
  whiteboard?: Whiteboard[];
}

/**
 * Scene - Represents a single page/scene in the course
 */
export interface Scene {
  id: string;
  stageId: string; // ID of the parent stage (for data integrity checks)
  type: SceneType;
  title: string;
  order: number; // Display order

  // Type-specific content
  content: SceneContent;

  // Actions to execute during playback
  actions?: Action[];

  // Whiteboards to explain deeply
  whiteboards?: Slide[];

  // Multi-agent discussion configuration
  multiAgent?: {
    enabled: boolean; // Enable multi-agent for this scene
    agentIds: string[]; // Which agents to include (from registry)
    directorPrompt?: string; // Optional custom director instructions
  };

  // Metadata
  createdAt?: number;
  updatedAt?: number;
}

/**
 * Scene content based on type
 */
export type SceneContent = SlideContent | QuizContent | InteractiveContent | PBLContent;

/**
 * Slide content - PPTist Canvas data
 */
export interface SlideContent {
  type: 'slide';
  // PPTist slide data structure
  canvas: Slide;
}

/**
 * Quiz content - React component props/data
 */
export interface QuizContent {
  type: 'quiz';
  questions: QuizQuestion[];
}

export interface QuizOption {
  label: string; // Display text
  value: string; // Selection key: "A", "B", "C", "D"
}

export type QuizQuestionType =
  | 'single'
  | 'multiple'
  | 'multiple_choice'
  | 'short_answer'
  | 'proof'
  | 'code_tracing'
  | 'code';

export interface QuizTestCase {
  id?: string;
  description?: string;
  expression: string; // Python expression to evaluate, e.g. solve([1,2,3])
  expected: string; // JSON / Python literal string, e.g. "[0, 1]"
  hidden?: boolean;
}

export interface QuizCodeCaseResult {
  id: string;
  description?: string;
  expression: string;
  expected: string;
  actual?: string;
  passed: boolean;
  hidden?: boolean;
  error?: string;
}

export interface QuizCodeReport {
  passedCount: number;
  totalCount: number;
  cases: QuizCodeCaseResult[];
}

export interface QuizQuestion {
  id: string;
  type: QuizQuestionType;
  question: string;
  options?: QuizOption[];
  answer?: string | string[]; // Choice answers or reference answer text
  correctAnswer?: string | string[]; // Original answer format from generators / imported data
  analysis?: string; // Explanation shown after grading
  explanation?: string; // Additional explanation / rationale
  commentPrompt?: string; // Grading guidance for text questions
  hasAnswer?: boolean; // Whether auto-grading is possible
  points?: number; // Points per question (default 1)
  proof?: string; // Reference proof for proof questions
  codeSnippet?: string; // Shared code snippet for code tracing
  starterCode?: string; // Starter code for code questions
  language?: 'python';
  testCases?: QuizTestCase[];
}

/**
 * Interactive content - Interactive web page (iframe)
 */
export interface InteractiveContent {
  type: 'interactive';
  url: string; // URL of the interactive page
  // Optional: embedded HTML content
  html?: string;
}

/**
 * PBL content - Project-based learning
 */
export interface PBLContent {
  type: 'pbl';
  projectConfig: PBLProjectConfig;
}

// Re-export generation types for convenience
export type {
  UserRequirements,
  SceneOutline,
  GenerationSession,
  GenerationProgress,
  UploadedDocument,
} from './generation';
