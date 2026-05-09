import type {
  NotebookContentDisciplineStyle,
  NotebookContentLayoutFamily,
  NotebookContentLayoutTemplate,
  NotebookContentProfile,
  NotebookContentTeachingFlow,
} from '@/lib/notebook-content';
import type { CourseProfile, SourceFact } from '@/lib/generation/teaching-skills/types';

export type SubjectTeachingPackId =
  | 'computer_science'
  | 'mathematics'
  | 'humanities_social_science'
  | 'business_economics'
  | 'general';

export type TeachingRole =
  | 'concrete_hook'
  | 'failure_demo'
  | 'concept_model'
  | 'definition_boundary'
  | 'worked_example'
  | 'state_trace'
  | 'structure_invariant'
  | 'strategy_trace'
  | 'evidence_frame'
  | 'case_analysis'
  | 'comparison'
  | 'practice_check'
  | 'synthesis';

export type TeachingComponentKind =
  | 'trace'
  | 'statetable'
  | 'callstack'
  | 'memory'
  | 'linkedlist'
  | 'tree'
  | 'bst'
  | 'graph_trace'
  | 'stack'
  | 'queue'
  | 'dictionary'
  | 'invariant'
  | 'table'
  | 'derivation'
  | 'proof'
  | 'example'
  | 'case'
  | 'quote'
  | 'chart';

export interface CourseBlueprint {
  id: string;
  language: 'zh-CN' | 'en-US';
  subject: SubjectTeachingPackId;
  courseProfile?: CourseProfile;
  selectedSkillIds?: string[];
  skillSelectionReasons?: string[];
  sourceFacts?: SourceFact[];
  audience: string;
  coreQuestion: string;
  learnerProblem: string;
  throughline: string;
  coreMisconceptions: string[];
  sourceAnchors: string[];
}

export interface TeachingPagePlan {
  id: string;
  order: number;
  title: string;
  role: TeachingRole;
  pagePatternId?: string;
  selectedSkillIds?: string[];
  skillReasons?: string[];
  sourceFactIds?: string[];
  openingMove: string;
  concreteAnchor: string;
  studentThinkingMove: string;
  transferRule: string;
  requiredComponentKinds: TeachingComponentKind[];
  forbiddenPatterns: string[];
  contentProfile?: NotebookContentProfile;
  disciplineStyle?: NotebookContentDisciplineStyle;
  teachingFlow?: NotebookContentTeachingFlow;
  layoutFamily?: NotebookContentLayoutFamily;
  layoutTemplate?: NotebookContentLayoutTemplate;
}

export interface TeachingPlan {
  id: string;
  language: 'zh-CN' | 'en-US';
  blueprint: CourseBlueprint;
  pages: TeachingPagePlan[];
}

export interface TeachingPlanValidationIssue {
  path: string;
  message: string;
  severity: 'warning' | 'error';
}
