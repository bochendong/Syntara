import type { CoursePurpose } from '@/lib/utils/database';
import type {
  SubjectTeachingPackId,
  TeachingComponentKind,
  TeachingRole,
} from '@/lib/generation/teaching-plan/types';

export type TeachingSkillStage = 'outline' | 'semantic' | 'narration';

export type TeachingSkillKind =
  | 'discipline'
  | 'topic'
  | 'pedagogy'
  | 'component'
  | 'purpose';

export interface CourseProfile {
  courseCode?: string;
  courseName?: string;
  university?: string;
  level?: string;
  language?: 'zh-CN' | 'en-US';
  purpose?: CoursePurpose;
  tags?: string[];
  sourceExamples?: string[];
}

export interface SourceFact {
  id: string;
  kind: 'object' | 'code' | 'data' | 'problem' | 'term' | 'case';
  label: string;
  text: string;
}

export interface TeachingSkillContext {
  language: 'zh-CN' | 'en-US';
  requirement: string;
  sourceText: string;
  disciplineHint?: SubjectTeachingPackId | string;
  courseProfile?: CourseProfile;
  sourceFacts?: SourceFact[];
}

export interface TeachingSkill {
  id: string;
  kind: TeachingSkillKind;
  label: Record<'zh-CN' | 'en-US', string>;
  priority: number;
  triggers: RegExp[];
  impliedSkillIds?: string[];
  preferredSubject?: SubjectTeachingPackId;
  preferredTeachingRoles?: TeachingRole[];
  preferredComponentKinds?: TeachingComponentKind[];
  forbiddenPatterns?: string[];
  outlineGuidance: Record<'zh-CN' | 'en-US', string[]>;
  semanticGuidance: Record<'zh-CN' | 'en-US', string[]>;
  narrationGuidance?: Record<'zh-CN' | 'en-US', string[]>;
}

export interface TeachingSkillSelectionReason {
  skillId: string;
  reason: string;
}

export interface SelectedTeachingSkills {
  skills: TeachingSkill[];
  skillIds: string[];
  reasons: TeachingSkillSelectionReason[];
  courseProfile: CourseProfile;
  sourceFacts: SourceFact[];
}
