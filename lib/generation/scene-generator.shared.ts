import type { GeneratedSlidePageContent, SceneOutline } from '@/lib/types/generation';
import { renderSemanticSlideContent } from '@/lib/notebook-content/semantic-slide-render';
import type { CoursePersonalizationContext } from './pipeline-types';
import type { SlideGenerationRoute } from './slide-generation-route';
import {
  getTeachingSkillById,
  selectTeachingSkills,
  type CourseProfile,
  type SelectedTeachingSkills,
  type SourceFact,
  type TeachingSkill,
  type TeachingSkillSelectionReason,
} from './teaching-skills';

function isImageFirstHeroLayoutTemplate(template: string | undefined): boolean {
  return (
    template === 'image_title_overlay' ||
    template === 'cinematic_title_frame' ||
    template === 'tech_hero_title'
  );
}

export function normalizeImageFirstHeroOutlineForSceneContent(outline: SceneOutline): SceneOutline {
  const template = outline.layoutIntent?.layoutTemplate || outline.teachingPagePlan?.layoutTemplate;
  if (!isImageFirstHeroLayoutTemplate(template)) return outline;

  const teachingPagePlan = outline.teachingPagePlan
    ? {
        ...outline.teachingPagePlan,
        requiredComponentKinds: [],
        selectedSkillIds: [],
        skillReasons: [],
      }
    : undefined;

  return {
    ...outline,
    requiredComponentKinds: [],
    selectedSkillIds: [],
    skillReasons: [],
    teachingPagePlan,
  };
}

export function shouldSuppressContinuationPages(outline: SceneOutline): boolean {
  return outline.type === 'slide' && outline.archetype === 'summary' && !outline.continuation;
}

export function materializeSemanticGeneratedSlidePageContent(
  content: GeneratedSlidePageContent,
  fallbackTitle: string,
): GeneratedSlidePageContent {
  if (!content.contentDocument) return content;

  const rendered = renderSemanticSlideContent({
    document: content.contentDocument,
    fallbackTitle,
  });

  return {
    ...content,
    elements: rendered.canvas.elements,
    background: rendered.canvas.background,
    theme: rendered.canvas.theme,
  };
}

export interface SceneContentDiagnostics {
  pipeline: 'semantic' | 'legacy' | 'interactive' | 'quiz' | 'pbl' | 'unknown';
  slideGenerationRoute?: SlideGenerationRoute;
  selectedSkillIds?: string[];
  skillSelectionReasons?: string[];
  failureStage?: string;
  failureReasons: string[];
  semanticFailureReasons?: string[];
  skillValidationFailures?: string[];
  semanticRetryCount: number;
  layoutRetryCount: number;
  contentFallbackUsed?: boolean;
  fallbackKind?: string;
}

export function recordFailure(
  diagnostics: SceneContentDiagnostics | undefined,
  stage: string,
  reason: string,
): void {
  if (!diagnostics) return;
  diagnostics.failureStage = stage;
  diagnostics.failureReasons.push(reason);
  if (stage.includes('semantic') || stage.includes('teaching')) {
    diagnostics.semanticFailureReasons = diagnostics.semanticFailureReasons || [];
    diagnostics.semanticFailureReasons.push(`${stage}: ${reason}`);
  }
}

export function recordContentFallback(
  diagnostics: SceneContentDiagnostics | undefined,
  fallbackKind: string,
): void {
  if (!diagnostics) return;
  diagnostics.contentFallbackUsed = true;
  diagnostics.fallbackKind = fallbackKind;
}

function parseSkillSelectionReasons(reasons: string[] | undefined): TeachingSkillSelectionReason[] {
  return (reasons || []).map((reason) => {
    const [skillId, ...rest] = reason.split(':');
    return {
      skillId: skillId.trim(),
      reason: rest.join(':').trim() || reason,
    };
  });
}

function courseContextToSkillProfile(
  courseContext: CoursePersonalizationContext | undefined,
  language: 'zh-CN' | 'en-US',
): CourseProfile {
  const tags = (courseContext?.tags || []).filter(Boolean);
  return {
    courseCode: courseContext?.courseCode,
    courseName: courseContext?.name,
    university: courseContext?.university,
    purpose: courseContext?.purpose,
    tags,
    language: courseContext?.language || language,
    level:
      courseContext?.courseCode && /\b(?:CSC|CS)\s*1\d{2}/i.test(courseContext.courseCode)
        ? 'first-year / early university'
        : courseContext?.courseCode && /\b(?:CSC|CS)\s*2\d{2}/i.test(courseContext.courseCode)
          ? 'early-second-year'
          : undefined,
  };
}

function sourceFactsFromOutline(outline: SceneOutline): SourceFact[] {
  const anchor = outline.teachingPagePlan?.concreteAnchor || outline.description || outline.title;
  return anchor?.trim()
    ? [
        {
          id: 'page_anchor',
          kind: 'problem',
          label: outline.language === 'en-US' ? 'page anchor' : '页面具体入口',
          text: anchor.trim(),
        },
      ]
    : [];
}

export function buildTeachingSkillSelectionForOutline(args: {
  outline: SceneOutline;
  courseContext?: CoursePersonalizationContext;
}): SelectedTeachingSkills | null {
  const language = args.outline.language || 'zh-CN';
  const courseProfile = courseContextToSkillProfile(args.courseContext, language);
  const sourceFacts = sourceFactsFromOutline(args.outline);
  const skillIds =
    args.outline.selectedSkillIds || args.outline.teachingPagePlan?.selectedSkillIds || [];
  const skills = skillIds
    .map((skillId) => getTeachingSkillById(skillId))
    .filter((skill): skill is TeachingSkill => Boolean(skill));
  if (skills.length > 0) {
    const reasons = parseSkillSelectionReasons(
      args.outline.skillReasons || args.outline.teachingPagePlan?.skillReasons,
    );
    return {
      skills,
      skillIds: skills.map((skill) => skill.id),
      reasons: reasons.length
        ? reasons
        : skills.map((skill) => ({
            skillId: skill.id,
            reason: 'selected upstream by TeachingPlan',
          })),
      courseProfile,
      sourceFacts,
    };
  }

  const disciplineHint =
    args.outline.contentProfile === 'math' || args.outline.layoutIntent?.disciplineStyle === 'math'
      ? 'mathematics'
      : args.outline.contentProfile === 'code' ||
          args.outline.layoutIntent?.disciplineStyle === 'code'
        ? 'computer_science'
        : undefined;

  if (!disciplineHint && !args.outline.teachingPagePlan) return null;

  return selectTeachingSkills({
    language,
    requirement: args.outline.title,
    sourceText: [
      args.outline.title,
      args.outline.description,
      ...(args.outline.keyPoints || []),
      args.outline.teachingPagePlan?.concreteAnchor,
      args.outline.teachingRole,
      args.outline.layoutIntent?.layoutTemplate,
      args.outline.layoutIntent?.teachingFlow,
    ]
      .filter(Boolean)
      .join('\n'),
    disciplineHint,
    courseProfile,
    sourceFacts,
  });
}

export function recordTeachingSkillValidationFailures(
  diagnostics: SceneContentDiagnostics | undefined,
  reasons: string[],
): void {
  if (!diagnostics || reasons.length === 0) return;
  diagnostics.skillValidationFailures = diagnostics.skillValidationFailures || [];
  diagnostics.skillValidationFailures.push(...reasons);
}
