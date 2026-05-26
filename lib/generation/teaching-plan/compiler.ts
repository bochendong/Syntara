import type { SceneOutline, UserRequirements } from '@/lib/types/generation';
import type { CoursePersonalizationContext } from '../pipeline-types';
import type { TeachingComponentKind, TeachingPagePlan, TeachingPlan } from './types';
import { buildTeachingPlanForOutlines } from './builder';
import {
  formatTeachingSkillsForPrompt,
  getTeachingSkillById,
  type SelectedTeachingSkills,
} from '../teaching-skills';
import { formatTeachingRoleSpecForPrompt, getTeachingRoleSpec } from './role-specs';

function extractAnchorLabel(anchor: string, fallback: string, language: 'zh-CN' | 'en-US'): string {
  const constructorName = anchor.match(/\b[A-Z][A-Za-z_][A-Za-z0-9_]*(?=\s*\()/)?.[0];
  if (constructorName) return constructorName;
  const quoted = anchor.match(/`([^`]{2,40})`|'([^']{2,40})'|"([^"]{2,40})"/)?.[1];
  if (quoted) return quoted;
  const sourceTerm = fallback.match(/\b[A-Z][A-Za-z_][A-Za-z0-9_]{2,}\b/)?.[0];
  if (sourceTerm) return sourceTerm;
  const capitalizedTerm = anchor.match(/\b[A-Z][A-Za-z_][A-Za-z0-9_]{2,}\b/)?.[0];
  if (capitalizedTerm) return capitalizedTerm;
  return fallback || (language === 'zh-CN' ? '今天的例子' : "today's example");
}

function teachingPlanSkillSelection(teachingPlan: TeachingPlan): SelectedTeachingSkills | null {
  const skillIds = teachingPlan.blueprint.selectedSkillIds || [];
  const skills = skillIds
    .map((id) => getTeachingSkillById(id))
    .filter((skill): skill is NonNullable<ReturnType<typeof getTeachingSkillById>> =>
      Boolean(skill),
    );
  if (skills.length === 0) return null;
  return {
    skills,
    skillIds: skills.map((skill) => skill.id),
    reasons: (teachingPlan.blueprint.skillSelectionReasons || []).map((reason) => {
      const [skillId, ...rest] = reason.split(':');
      return {
        skillId: skillId.trim(),
        reason: rest.join(':').trim() || reason,
      };
    }),
    courseProfile: teachingPlan.blueprint.courseProfile || {},
    sourceFacts: teachingPlan.blueprint.sourceFacts || [],
  };
}

function courseContextToText(courseContext?: CoursePersonalizationContext): string {
  if (!courseContext) return '';
  return [
    courseContext.name,
    courseContext.description,
    courseContext.tags?.join(', '),
    courseContext.purpose,
    courseContext.university,
    courseContext.courseCode,
  ]
    .filter(Boolean)
    .join('\n');
}

function sameMeaning(a?: string, b?: string): boolean {
  const normalize = (value?: string) =>
    (value || '')
      .replace(/\s+/g, '')
      .replace(/[。.!！?？,，;；:：]/g, '')
      .toLowerCase();
  return normalize(a).length > 8 && normalize(a) === normalize(b);
}

function isComputerScienceOpeningIntro(
  teachingPlan: TeachingPlan,
  pagePlan: TeachingPagePlan,
  outline: SceneOutline,
): boolean {
  return (
    teachingPlan.blueprint.subject === 'computer_science' &&
    pagePlan.order === 1 &&
    outline.type === 'slide' &&
    pagePlan.role === 'concrete_hook'
  );
}

function buildComputerScienceIntroOutlineCopy(
  teachingPlan: TeachingPlan,
  pagePlan: TeachingPagePlan,
): Pick<SceneOutline, 'title' | 'description' | 'keyPoints' | 'contentProfile'> {
  const zh = teachingPlan.language === 'zh-CN';
  const anchor = pagePlan.concreteAnchor || teachingPlan.blueprint.sourceAnchors[0] || '';
  const exampleLabel = extractAnchorLabel(
    anchor,
    teachingPlan.blueprint.courseProfile?.sourceExamples?.[0] || '',
    teachingPlan.language,
  );
  return {
    title: zh ? `先认识今天的例子：${exampleLabel}` : `First meet the example: ${exampleLabel}`,
    description: zh
      ? `先把 ${exampleLabel} 当成一个要被程序维护的具体对象：它有哪些状态必须一起保存，哪些操作以后会读写这些状态？`
      : `Treat ${exampleLabel} as a concrete object the program must maintain: which state belongs together, and which operations will read or update it?`,
    keyPoints: zh
      ? [
          `入口：${anchor || pagePlan.concreteAnchor || exampleLabel}`,
          `${exampleLabel} 需要被当成一个有状态的对象，而不是一串零散值。`,
          '先列出必须一起保存的信息，再问旧表示法能不能保护这些信息。',
          '下一步再决定：字段叫什么、谁能修改、怎样初始化才合法。',
        ]
      : [
          `Entry point: ${anchor || pagePlan.concreteAnchor || exampleLabel}`,
          `${exampleLabel} should be treated as stateful object, not loose values.`,
          'First list the information that must stay together, then ask whether the old representation protects it.',
          'Next decide field names, allowed updates, and legal initialization.',
        ],
    contentProfile: 'general',
  };
}

const FORBIDDEN_STUDENT_FACING_PATTERNS = [
  /\[(?:Table|Chart|Formula|Quote)\]/i,
  /\\(?:texttt|len|_\_)|exttt\{|\\endrows|\\endslide|<\/?beginrow/i,
  /本页用于|引出|建立本课主线|进一步指出|本页明确|强调|学习者将|教学目标|课程目标|核心问题|讲解目标/i,
  /本节课材料里的具体对象|先解释它代表什么|这一步为什么成立|这一行为什么成立/i,
  /例题要留下|总结要留下|写证明前|数学课开场先定位/i,
  /通过对比.+说明|通过.+说明/i,
  /this page is used to|introduce the motivation|establish the main line|learners will|learning objective/i,
];

function sanitizeStudentFacingPoint(point: string): string {
  return point
    .replace(/\[(?:Table|Chart|Formula|Quote)\]\s*/gi, '')
    .replace(/\\texttt\{([^{}]+)\}/g, '`$1`')
    .replace(/\\len\(([^)]+)\)/g, 'len($1)')
    .replace(/\\_/g, '_')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\s+/g, ' ')
    .trim();
}

function isForbiddenStudentFacingPoint(point: string, outline: SceneOutline): boolean {
  const sanitized = sanitizeStudentFacingPoint(point);
  if (!sanitized) return true;
  if (sameMeaning(sanitized, outline.description)) return true;
  return FORBIDDEN_STUDENT_FACING_PATTERNS.some(
    (pattern) => pattern.test(point) || pattern.test(sanitized),
  );
}

function studentFacingDescription(outline: SceneOutline, pagePlan: TeachingPagePlan): string {
  const description = outline.description?.trim();
  const isMeta =
    /本页用于|引出|建立本课主线|进一步指出|本页明确|学习者将|教学目标|introduce the motivation|this page is used to/i.test(
      description || '',
    );
  if (description && !isMeta) return description;
  return pagePlan.openingMove;
}

function mergeKeyPoints(outline: SceneOutline, pagePlan: TeachingPagePlan): string[] {
  const original = (outline.keyPoints || [])
    .filter((point) => point?.trim())
    .filter((point) => !isForbiddenStudentFacingPoint(point, outline))
    .filter((point) => !sameMeaning(point, outline.description))
    .filter((point) => !sameMeaning(point, pagePlan.openingMove))
    .filter((point) => !sameMeaning(point, pagePlan.transferRule))
    .map(sanitizeStudentFacingPoint);

  const planPoints =
    original.length >= 3
      ? []
      : [pagePlan.concreteAnchor].filter(Boolean).map(sanitizeStudentFacingPoint);
  const merged = [...original, ...planPoints].filter((point, index, arr) => {
    const normalized = point.replace(/\s+/g, '').toLowerCase();
    return (
      normalized.length > 0 &&
      arr.findIndex((candidate) => candidate.replace(/\s+/g, '').toLowerCase() === normalized) ===
        index
    );
  });
  return merged.slice(0, Math.max(3, Math.min(6, merged.length)));
}

function formatComponentKindForPrompt(
  kind: TeachingComponentKind,
  language: 'zh-CN' | 'en-US',
): string {
  const zhLabels: Record<TeachingComponentKind, string> = {
    trace: '执行追踪组件',
    statetable: '状态表',
    callstack: '调用栈图',
    memory: '内存/对象图',
    linkedlist: '链表结构图',
    tree: '树结构图',
    bst: '二叉搜索树图',
    graph_trace: '图搜索追踪',
    stack: '栈结构图',
    queue: '队列结构图',
    dictionary: '字典/映射图',
    invariant: '不变式检查面板',
    table: '对照表',
    derivation: '推导步骤',
    proof: '证明结构',
    example: '具体案例或样本（用自然语言、callout、table 或 cards 表达）',
    case: '案例材料（用自然语言、callout、table 或 cards 表达）',
    quote: '引用材料',
    chart: '图表或数据视觉',
  };
  const enLabels: Record<TeachingComponentKind, string> = {
    trace: 'execution trace component',
    statetable: 'state table',
    callstack: 'call-stack diagram',
    memory: 'memory/object diagram',
    linkedlist: 'linked-list diagram',
    tree: 'tree diagram',
    bst: 'binary-search-tree diagram',
    graph_trace: 'graph traversal trace',
    stack: 'stack diagram',
    queue: 'queue diagram',
    dictionary: 'dictionary/map diagram',
    invariant: 'invariant check panel',
    table: 'comparison table',
    derivation: 'derivation steps',
    proof: 'proof structure',
    example: 'concrete case or sample, expressed as natural prose, callout, table, or cards',
    case: 'case material, expressed as natural prose, callout, table, or cards',
    quote: 'source quote',
    chart: 'chart or data visual',
  };
  return language === 'zh-CN' ? zhLabels[kind] : enLabels[kind];
}

function formatComponentKindsForPrompt(
  kinds: TeachingComponentKind[],
  language: 'zh-CN' | 'en-US',
): string {
  if (kinds.length === 0) return language === 'zh-CN' ? '无特殊组件' : 'none';
  return kinds.map((kind) => formatComponentKindForPrompt(kind, language)).join('；');
}

export function attachTeachingPlanToOutlines(
  outlines: SceneOutline[],
  teachingPlan: TeachingPlan,
): SceneOutline[] {
  return outlines.map((outline, index) => {
    const pagePlan =
      teachingPlan.pages[index] || teachingPlan.pages.find((page) => page.order === outline.order);
    if (!pagePlan) return outline;
    const csIntro = isComputerScienceOpeningIntro(teachingPlan, pagePlan, outline)
      ? buildComputerScienceIntroOutlineCopy(teachingPlan, pagePlan)
      : undefined;

    return {
      ...outline,
      ...(csIntro || {}),
      archetype: csIntro ? 'intro' : outline.archetype,
      teachingPlanId: teachingPlan.id,
      teachingPagePlan: pagePlan,
      teachingRole: pagePlan.role,
      studentThinkingMove: pagePlan.studentThinkingMove,
      requiredComponentKinds: csIntro ? ['table'] : pagePlan.requiredComponentKinds,
      forbiddenPatterns: pagePlan.forbiddenPatterns,
      selectedSkillIds: pagePlan.selectedSkillIds,
      skillReasons: pagePlan.skillReasons,
      sourceFactIds: pagePlan.sourceFactIds,
      pagePatternId: pagePlan.pagePatternId,
      contentProfile: csIntro?.contentProfile || outline.contentProfile || pagePlan.contentProfile,
      description: csIntro?.description || studentFacingDescription(outline, pagePlan),
      keyPoints: csIntro?.keyPoints || mergeKeyPoints(outline, pagePlan),
      layoutIntent:
        outline.type === 'slide'
          ? {
              ...outline.layoutIntent,
              layoutFamily: csIntro
                ? 'comparison'
                : outline.layoutIntent?.layoutFamily || pagePlan.layoutFamily || 'concept_cards',
              layoutTemplate: csIntro
                ? 'pipeline_table'
                : outline.layoutIntent?.layoutTemplate || pagePlan.layoutTemplate,
              disciplineStyle:
                outline.layoutIntent?.disciplineStyle || pagePlan.disciplineStyle || 'general',
              teachingFlow: csIntro
                ? 'comparison_review'
                : outline.layoutIntent?.teachingFlow || pagePlan.teachingFlow || 'concept_explain',
              density: outline.layoutIntent?.density || 'standard',
              visualRole: outline.layoutIntent?.visualRole || 'none',
              overflowPolicy: csIntro
                ? 'compress_first'
                : outline.layoutIntent?.overflowPolicy ||
                  (pagePlan.requiredComponentKinds.length > 0
                    ? 'preserve_then_paginate'
                    : 'compress_first'),
              preserveFullProblemStatement:
                outline.layoutIntent?.preserveFullProblemStatement ||
                pagePlan.role === 'worked_example',
            }
          : outline.layoutIntent,
    };
  });
}

export function compileTeachingPlanToOutlines(teachingPlan: TeachingPlan): SceneOutline[] {
  return teachingPlan.pages.map((page) => ({
    id: page.id,
    type: page.role === 'practice_check' ? 'quiz' : 'slide',
    contentProfile: page.contentProfile,
    archetype:
      page.role === 'synthesis'
        ? 'summary'
        : page.role === 'concrete_hook'
          ? 'intro'
          : page.role === 'worked_example' || page.role === 'state_trace'
            ? 'example'
            : page.role === 'comparison'
              ? 'bridge'
              : 'concept',
    layoutIntent:
      page.role === 'practice_check'
        ? undefined
        : {
            layoutFamily: page.layoutFamily || 'concept_cards',
            layoutTemplate: page.layoutTemplate,
            disciplineStyle: page.disciplineStyle || 'general',
            teachingFlow: page.teachingFlow || 'concept_explain',
            density: 'standard',
            visualRole: 'none',
            overflowPolicy:
              page.requiredComponentKinds.length > 0 ? 'preserve_then_paginate' : 'compress_first',
            preserveFullProblemStatement: page.role === 'worked_example',
          },
    title: page.title,
    description: page.openingMove,
    keyPoints: [page.concreteAnchor, page.studentThinkingMove, page.transferRule],
    teachingObjective: page.studentThinkingMove,
    order: page.order,
    language: teachingPlan.language,
    teachingPlanId: teachingPlan.id,
    teachingPagePlan: page,
    teachingRole: page.role,
    studentThinkingMove: page.studentThinkingMove,
    requiredComponentKinds: page.requiredComponentKinds,
    forbiddenPatterns: page.forbiddenPatterns,
    selectedSkillIds: page.selectedSkillIds,
    skillReasons: page.skillReasons,
    sourceFactIds: page.sourceFactIds,
    pagePatternId: page.pagePatternId,
    quizConfig:
      page.role === 'practice_check'
        ? {
            questionCount: 1,
            difficulty: 'medium',
            questionTypes: ['short_answer'],
          }
        : undefined,
  }));
}

export function attachGeneratedTeachingPlan(args: {
  requirements: UserRequirements;
  outlines: SceneOutline[];
  pdfText?: string;
  researchContext?: string;
  courseContext?: CoursePersonalizationContext;
  disciplineHint?: string;
}): SceneOutline[] {
  const teachingPlan = buildTeachingPlanForOutlines({
    requirements: args.requirements,
    outlines: args.outlines,
    pdfText: args.pdfText,
    researchContext: args.researchContext,
    courseContextText: courseContextToText(args.courseContext),
    courseContext: args.courseContext,
    disciplineHint: args.disciplineHint,
  });
  return attachTeachingPlanToOutlines(args.outlines, teachingPlan);
}

export function formatTeachingPlanForOutlinePrompt(args: {
  teachingPlan: TeachingPlan;
  language: 'zh-CN' | 'en-US';
}): string {
  const { teachingPlan, language } = args;
  const blueprint = teachingPlan.blueprint;
  const skillSelection = teachingPlanSkillSelection(teachingPlan);
  const skillGuidance = skillSelection
    ? formatTeachingSkillsForPrompt({
        selection: skillSelection,
        stage: 'outline',
        language,
      })
    : '';
  if (language === 'zh-CN') {
    const roleSequence = teachingPlan.pages
      .map(
        (page) => `${page.order}. ${page.role}：${getTeachingRoleSpec(page.role).intent[language]}`,
      )
      .join('\n');
    return [
      '## Teaching Plan IR（生成输入）',
      `- 学科包：${blueprint.subject}`,
      `- 已选 skills：${blueprint.selectedSkillIds?.join(', ') || 'none'}`,
      `- 核心问题：${blueprint.coreQuestion}`,
      `- 学生真实困难：${blueprint.learnerProblem}`,
      `- 课程主线：${blueprint.throughline}`,
      `- 具体素材锚点：${blueprint.sourceAnchors.join('；')}`,
      roleSequence ? `- 推荐页面角色顺序：\n${roleSequence}` : '',
      skillGuidance ? `\n${skillGuidance}` : '',
      '',
      '生成每页大纲时：',
      '- 先判断这一页的 teachingRole，再让 role 决定内容形态。',
      '- 每页只承担一个清晰教学功能：开场、失败现场、概念边界、状态追踪、练习或迁移总结。',
      '- 用具体对象、例子、问题、材料或数据承载这个 role，让页面像课堂讲解而不是教案摘要。',
      '- 每页保留一个学生可迁移的思考动作；动作形式由 role 决定。',
    ].join('\n');
  }
  const roleSequence = teachingPlan.pages
    .map(
      (page) => `${page.order}. ${page.role}: ${getTeachingRoleSpec(page.role).intent[language]}`,
    )
    .join('\n');
  return [
    '## Teaching Plan IR (generation input)',
    `- Subject pack: ${blueprint.subject}`,
    `- Selected skills: ${blueprint.selectedSkillIds?.join(', ') || 'none'}`,
    `- Core question: ${blueprint.coreQuestion}`,
    `- Learner problem: ${blueprint.learnerProblem}`,
    `- Lesson throughline: ${blueprint.throughline}`,
    `- Concrete source anchors: ${blueprint.sourceAnchors.join('; ')}`,
    roleSequence ? `- Recommended page-role sequence:\n${roleSequence}` : '',
    skillGuidance ? `\n${skillGuidance}` : '',
    '',
    'When generating each outline:',
    '- Decide the teachingRole first and let that role determine the content shape.',
    '- Each page has one clear teaching job: hook, failure demo, concept boundary, state trace, practice, transfer summary, etc.',
    '- Write classroom-facing teaching content grounded in a concrete object, example, problem, source, or data point.',
    '- Include one transferable student thinking move, with a form that follows the role.',
  ].join('\n');
}

export function formatTeachingPagePlanForPrompt(
  pagePlan: TeachingPagePlan | undefined,
  language: 'zh-CN' | 'en-US',
): string {
  if (!pagePlan) return '';
  const isImageFirstHero =
    pagePlan.layoutTemplate === 'image_title_overlay' ||
    pagePlan.layoutTemplate === 'cinematic_title_frame' ||
    pagePlan.layoutTemplate === 'tech_hero_title';
  if (isImageFirstHero) {
    if (language === 'zh-CN') {
      return [
        '## Teaching Page Plan（页面输入）',
        `- 页面角色：image-first cover`,
        `- pagePatternId：${pagePlan.pagePatternId || pagePlan.role}`,
        `- 课堂导入：${pagePlan.openingMove}`,
        `- 具体入口：${pagePlan.concreteAnchor}`,
        `- 学生思考动作：${pagePlan.studentThinkingMove}`,
        `- 迁移规则：${pagePlan.transferRule}`,
        '- 组件要求：不要执行正文教学组件；这类 cover 页只需要主视觉、标题和一句短副标题/元信息。',
        '',
        '这一页只负责建立主题、气氛和观看入口。不要因为页面角色或上游 suggested components 输出 quote、table、chart、cards、process 或长段讲稿。',
      ].join('\n');
    }
    return [
      '## Teaching Page Plan (page input)',
      `- Page role: image-first cover`,
      `- pagePatternId: ${pagePlan.pagePatternId || pagePlan.role}`,
      `- Classroom opening: ${pagePlan.openingMove}`,
      `- Concrete anchor: ${pagePlan.concreteAnchor}`,
      `- Student thinking move: ${pagePlan.studentThinkingMove}`,
      `- Transfer rule: ${pagePlan.transferRule}`,
      '- Component requirement: do not execute body teaching components; this cover page only needs a visual, title, and one short subtitle/meta line.',
      '',
      'This page only establishes topic, mood, and entry point. Do not output quote, table, chart, cards, process, or long lecture prose because of the upstream role or suggested components.',
    ].join('\n');
  }
  const roleSpecLines = formatTeachingRoleSpecForPrompt(pagePlan.role, language);
  if (language === 'zh-CN') {
    return [
      '## Teaching Page Plan（页面输入）',
      `- 页面角色：${pagePlan.role}`,
      `- pagePatternId：${pagePlan.pagePatternId || pagePlan.role}`,
      ...roleSpecLines,
      `- 已选 skills：${pagePlan.selectedSkillIds?.join(', ') || 'none'}`,
      `- skill 选择原因：${pagePlan.skillReasons?.join('；') || 'none'}`,
      `- 课堂导入：${pagePlan.openingMove}`,
      `- 具体入口（学生可见内容必须使用这里的具体名词、样本、代码或数据）：${pagePlan.concreteAnchor}`,
      `- 学生思考动作：${pagePlan.studentThinkingMove}`,
      `- 迁移规则：${pagePlan.transferRule}`,
      `- role 建议组件：${formatComponentKindsForPrompt(pagePlan.requiredComponentKinds, language)}`,
      '',
      '这一页内容应直接执行上面的 page plan：开头或核心块要用到具体入口里的事实，再用学生思考动作组织内容，用迁移规则收束。',
      '注意：建议组件是语义目标，不是可见正文标签；不要把组件名当作普通文字写进学生可见内容。',
    ].join('\n');
  }
  return [
    '## Teaching Page Plan (page input)',
    `- Page role: ${pagePlan.role}`,
    `- pagePatternId: ${pagePlan.pagePatternId || pagePlan.role}`,
    ...roleSpecLines,
    `- Selected skills: ${pagePlan.selectedSkillIds?.join(', ') || 'none'}`,
    `- Skill reasons: ${pagePlan.skillReasons?.join('; ') || 'none'}`,
    `- Classroom opening: ${pagePlan.openingMove}`,
    `- Concrete anchor (student-visible content must use the concrete names, sample, code, or data here): ${pagePlan.concreteAnchor}`,
    `- Student thinking move: ${pagePlan.studentThinkingMove}`,
    `- Transfer rule: ${pagePlan.transferRule}`,
    `- Role-suggested components: ${formatComponentKindsForPrompt(pagePlan.requiredComponentKinds, language)}`,
    '',
    'This page should execute the page plan above: the opening or core block must use the concrete anchor facts, then organize content around the student thinking move, and close with the transfer rule.',
    'Component suggestions are semantic goals, not visible labels; do not write component names as student-facing prose.',
  ].join('\n');
}
