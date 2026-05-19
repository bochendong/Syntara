import { MAX_VISION_IMAGES } from '@/lib/constants/generation';
import type { ImageMapping, PdfImage, SceneOutline } from '@/lib/types/generation';
import type { NotebookContentDocument } from '@/lib/notebook-content';
import { buildPrompt, PROMPT_IDS } from './prompts';
import {
  formatCoursePersonalizationForPrompt,
  formatImageDescription,
  formatImagePlaceholder,
  formatSceneArchetypeContext,
  formatSceneContentProfileContext,
  formatSlideRewriteContext,
  formatTeacherPersonaForPrompt,
  formatWorkedExampleForPrompt,
} from './prompt-formatters';
import type { AgentInfo, CoursePersonalizationContext } from './pipeline-types';
import { coerceRuntimeSceneOutline } from './scene-outline-runtime';
import { enrichOutlineWithDeckMemory, formatDeckMemoryForPrompt } from './deck-memory';
import { buildTemplateDrivenSemanticDocument } from './semantic-slide-templates';
import { normalizeComputerScienceSceneOutline } from './cs-semantic-normalizer';
import { formatTeachingPagePlanForPrompt } from './teaching-plan';
import { formatTeachingSkillsForPrompt, type SelectedTeachingSkills } from './teaching-skills';
import { formatLayoutIntentForPrompt } from './scene-generator.template-contracts';
import {
  buildTeachingSkillSelectionForOutline,
  normalizeImageFirstHeroOutlineForSceneContent,
  type SceneContentDiagnostics,
} from './scene-generator.shared';

function buildSemanticMediaPromptContext(args: {
  outline: SceneOutline;
  language: 'zh-CN' | 'en-US';
  assignedImages?: PdfImage[];
  imageMapping?: ImageMapping;
  visionEnabled?: boolean;
}): { text: string; visionImages?: Array<{ id: string; src: string }> } {
  let text = args.language === 'zh-CN' ? '无可用图片' : 'No images available';
  let visionImages: Array<{ id: string; src: string }> | undefined;

  if (args.assignedImages && args.assignedImages.length > 0) {
    if (args.visionEnabled && args.imageMapping) {
      const withSrc = args.assignedImages.filter((img) => args.imageMapping?.[img.id]);
      const visionSlice = withSrc.slice(0, MAX_VISION_IMAGES);
      const textOnlySlice = withSrc.slice(MAX_VISION_IMAGES);
      const noSrcImages = args.assignedImages.filter((img) => !args.imageMapping?.[img.id]);
      text = [
        ...visionSlice.map((img) => formatImagePlaceholder(img, args.language)),
        ...[...textOnlySlice, ...noSrcImages].map((img) =>
          formatImageDescription(img, args.language),
        ),
      ].join('\n');
      visionImages = visionSlice.map((img) => ({
        id: img.id,
        src: args.imageMapping![img.id],
        width: img.width,
        height: img.height,
      }));
    } else {
      text = args.assignedImages
        .map((img) => formatImageDescription(img, args.language))
        .join('\n');
    }
  }

  const generatedImages = (args.outline.mediaGenerations || [])
    .filter((media) => media.type === 'image')
    .map((media) => `- ${media.elementId}: "${media.prompt}"`);
  if (generatedImages.length > 0) {
    const generatedText =
      args.language === 'zh-CN'
        ? `AI 生成图片占位符（可作为 visualSlot.source 或 visual block source）：\n${generatedImages.join('\n')}`
        : `AI-generated image placeholders (may be used as visualSlot.source or visual block source):\n${generatedImages.join('\n')}`;
    text =
      text.includes('无可用') || text.includes('No images')
        ? generatedText
        : `${text}\n\n${generatedText}`;
  }

  return { text, visionImages };
}

export interface SemanticSlideContentPromptBundle {
  promptId: typeof PROMPT_IDS.SLIDE_SEMANTIC_CONTENT;
  outline: SceneOutline;
  language: 'zh-CN' | 'en-US';
  systemPrompt?: string;
  userPrompt?: string;
  promptVariables?: Record<string, string>;
  mediaContextText: string;
  visionImages?: Array<{ id: string; src: string }>;
  skillSelection: SelectedTeachingSkills | null;
  templateDrivenDocument: NotebookContentDocument | null;
}

export function buildSemanticSlideContentPromptBundle(args: {
  outline: SceneOutline;
  allOutlines?: SceneOutline[];
  assignedImages?: PdfImage[];
  imageMapping?: ImageMapping;
  visionEnabled?: boolean;
  agents?: AgentInfo[];
  courseContext?: CoursePersonalizationContext;
  rewriteReason?: string;
  diagnostics?: SceneContentDiagnostics;
}): SemanticSlideContentPromptBundle | null {
  let outline = normalizeImageFirstHeroOutlineForSceneContent(
    normalizeComputerScienceSceneOutline(coerceRuntimeSceneOutline(args.outline)),
  );
  outline = normalizeImageFirstHeroOutlineForSceneContent(
    normalizeComputerScienceSceneOutline(enrichOutlineWithDeckMemory(outline, args.allOutlines)),
  );
  const lang = outline.language || 'zh-CN';
  const templateDrivenDocument =
    outline.contentProfile === 'math' &&
    outline.layoutIntent?.layoutTemplate === 'comparison_matrix'
      ? null
      : buildTemplateDrivenSemanticDocument(outline, lang);
  const teacherContext = formatTeacherPersonaForPrompt(args.agents, lang);
  const coursePersonalization = formatCoursePersonalizationForPrompt(args.courseContext, lang);
  const contentProfileContext = formatSceneContentProfileContext(outline, lang);
  const archetypeContext = formatSceneArchetypeContext(outline, lang);
  const workedExampleContext = formatWorkedExampleForPrompt(outline.workedExampleConfig, lang);
  const layoutIntentContext = formatLayoutIntentForPrompt(outline, lang);
  const deckContext = formatDeckMemoryForPrompt({
    outline,
    allOutlines: args.allOutlines,
    language: lang,
  });
  const skillSelection = buildTeachingSkillSelectionForOutline({
    outline,
    courseContext: args.courseContext,
  });
  if (args.diagnostics && skillSelection) {
    args.diagnostics.selectedSkillIds =
      args.diagnostics.selectedSkillIds || skillSelection.skillIds;
    args.diagnostics.skillSelectionReasons =
      args.diagnostics.skillSelectionReasons ||
      skillSelection.reasons.map((reason) => `${reason.skillId}: ${reason.reason}`);
  }
  const teachingPagePlanGuidance = formatTeachingPagePlanForPrompt(outline.teachingPagePlan, lang);
  const teachingSkillGuidance = skillSelection
    ? formatTeachingSkillsForPrompt({
        selection: skillSelection,
        stage: 'semantic',
        language: lang,
        pagePlan: outline.teachingPagePlan,
      })
    : '';
  const mediaContext = buildSemanticMediaPromptContext({
    outline,
    language: lang,
    assignedImages: args.assignedImages,
    imageMapping: args.imageMapping,
    visionEnabled: args.visionEnabled,
  });
  const rewriteContext = formatSlideRewriteContext(args.rewriteReason, lang);
  const promptVariables = {
    language: lang,
    title: outline.title,
    description: outline.description,
    keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
    contentProfileContext,
    archetypeContext,
    layoutIntentContext,
    deckContext,
    assignedImages: mediaContext.text,
    teacherContext,
    coursePersonalization,
    workedExampleContext,
    rewriteContext,
    purposeGuidance: '',
    disciplineGuidance: [teachingPagePlanGuidance, teachingSkillGuidance]
      .filter(Boolean)
      .join('\n\n'),
  };

  if (templateDrivenDocument) {
    return {
      promptId: PROMPT_IDS.SLIDE_SEMANTIC_CONTENT,
      outline,
      language: lang,
      promptVariables,
      mediaContextText: mediaContext.text,
      visionImages: mediaContext.visionImages,
      skillSelection,
      templateDrivenDocument,
    };
  }

  const prompts = buildPrompt(PROMPT_IDS.SLIDE_SEMANTIC_CONTENT, promptVariables);
  if (!prompts) return null;

  return {
    promptId: PROMPT_IDS.SLIDE_SEMANTIC_CONTENT,
    outline,
    language: lang,
    systemPrompt: prompts.system,
    userPrompt: prompts.user,
    promptVariables,
    mediaContextText: mediaContext.text,
    visionImages: mediaContext.visionImages,
    skillSelection,
    templateDrivenDocument: null,
  };
}
