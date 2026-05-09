import type { TeachingPagePlan } from '@/lib/generation/teaching-plan/types';
import { formatTeachingRoleSpecForPrompt } from '@/lib/generation/teaching-plan/role-specs';
import type { SelectedTeachingSkills, TeachingSkillStage } from './types';

function stageGuidance(
  selection: SelectedTeachingSkills,
  stage: TeachingSkillStage,
  language: 'zh-CN' | 'en-US',
): string[] {
  return selection.skills.flatMap((skill) => {
    if (stage === 'outline') return skill.outlineGuidance[language] || [];
    if (stage === 'semantic') return skill.semanticGuidance[language] || [];
    return skill.narrationGuidance?.[language] || skill.semanticGuidance[language] || [];
  });
}

function formatCourseProfile(
  selection: SelectedTeachingSkills,
  language: 'zh-CN' | 'en-US',
): string[] {
  const profile = selection.courseProfile;
  const values = [
    profile.courseCode && `courseCode=${profile.courseCode}`,
    profile.courseName && `courseName=${profile.courseName}`,
    profile.university && `university=${profile.university}`,
    profile.level && `level=${profile.level}`,
    profile.purpose && `purpose=${profile.purpose}`,
    profile.tags?.length ? `tags=${profile.tags.join(', ')}` : undefined,
  ].filter(Boolean);
  if (values.length === 0) return [];
  return [
    language === 'zh-CN'
      ? `课程画像只用于调节难度和语境，不得变成课程专属 prompt：${values.join('；')}`
      : `Course profile tunes level and context only; it must not become a course-specific prompt: ${values.join('; ')}`,
  ];
}

function formatSourceFacts(
  selection: SelectedTeachingSkills,
  language: 'zh-CN' | 'en-US',
): string[] {
  if (selection.sourceFacts.length === 0) return [];
  const title =
    language === 'zh-CN'
      ? '素材事实（必须从这里取例子，不要写死课程特例）'
      : 'Source facts (use these examples; do not hard-code course-specific cases)';
  return [
    title,
    ...selection.sourceFacts
      .slice(0, 6)
      .map((fact) => `- ${fact.id} [${fact.kind}/${fact.label}]: ${fact.text}`),
  ];
}

export function formatTeachingSkillsForPrompt(args: {
  selection: SelectedTeachingSkills;
  stage: TeachingSkillStage;
  language: 'zh-CN' | 'en-US';
  pagePlan?: TeachingPagePlan;
}): string {
  const { selection, stage, language, pagePlan } = args;
  const guidance = stageGuidance(selection, stage, language);
  const title =
    language === 'zh-CN'
      ? `## Teaching Skills（${stage} 阶段硬约束）`
      : `## Teaching Skills (${stage} hard constraints)`;
  const loaded =
    language === 'zh-CN'
      ? `已加载 skills：${selection.skillIds.join(', ')}`
      : `Loaded skills: ${selection.skillIds.join(', ')}`;
  const reasons = selection.reasons
    .slice(0, 8)
    .map((reason) => `- ${reason.skillId}: ${reason.reason}`);
  const profile = formatCourseProfile(selection, language);
  const facts = formatSourceFacts(selection, language);
  const page =
    pagePlan && language === 'zh-CN'
      ? [
          '当前页必须执行的 PagePlan：',
          `- pagePatternId: ${pagePlan.pagePatternId || pagePlan.role}`,
          `- role: ${pagePlan.role}`,
          ...formatTeachingRoleSpecForPrompt(pagePlan.role, language),
          `- concreteAnchor: ${pagePlan.concreteAnchor}`,
          `- studentThinkingMove: ${pagePlan.studentThinkingMove}`,
          `- roleSelectedComponentKinds: ${pagePlan.requiredComponentKinds.join(', ') || 'none'}`,
        ]
      : pagePlan
        ? [
            'Current PagePlan to execute:',
            `- pagePatternId: ${pagePlan.pagePatternId || pagePlan.role}`,
            `- role: ${pagePlan.role}`,
            ...formatTeachingRoleSpecForPrompt(pagePlan.role, language),
            `- concreteAnchor: ${pagePlan.concreteAnchor}`,
            `- studentThinkingMove: ${pagePlan.studentThinkingMove}`,
            `- roleSelectedComponentKinds: ${pagePlan.requiredComponentKinds.join(', ') || 'none'}`,
          ]
        : [];

  const globalRules =
    language === 'zh-CN'
      ? [
          '全局禁止：不要创建 CSC148 OOP 等课程专属 prompt；课程名只能影响难度、语境和术语。',
          '所有具体例子必须来自用户需求、材料、source facts 或当前页 PagePlan。',
          '不要把每页都套成同一个固定模板；当前页 role 决定讲法、组件和信息密度。',
          '禁止 `[Table]` 占位、`\\texttt{}` 泄漏、重复题目、重复导入、教案口吻。',
        ]
      : [
          'Global ban: do not create course-specific prompts such as CSC148 OOP; course names only tune level, context, and terminology.',
          'Every concrete example must come from the user requirement, source material, source facts, or the current PagePlan.',
          'Do not force every page into the same fixed template; the current page role decides teaching shape, components, and density.',
          'Never leak `[Table]`, `\\texttt{}`, duplicate problem statements, duplicate intros, or lesson-plan prose.',
        ];

  return [
    title,
    loaded,
    '',
    ...(reasons.length
      ? [language === 'zh-CN' ? '选择原因：' : 'Selection reasons:', ...reasons, '']
      : []),
    ...profile,
    ...(profile.length ? [''] : []),
    ...facts,
    ...(facts.length ? [''] : []),
    ...page,
    ...(page.length ? [''] : []),
    language === 'zh-CN' ? '技能规则：' : 'Skill rules:',
    ...guidance.map((item) => `- ${item}`),
    '',
    ...globalRules.map((item) => `- ${item}`),
  ].join('\n');
}
