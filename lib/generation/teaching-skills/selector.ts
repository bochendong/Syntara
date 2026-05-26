import type { CoursePersonalizationContext } from '@/lib/generation/pipeline-types';
import type { SubjectTeachingPackId } from '@/lib/generation/teaching-plan/types';
import { getTeachingSkillById, TEACHING_SKILL_REGISTRY } from './registry';
import type {
  CourseProfile,
  SelectedTeachingSkills,
  SourceFact,
  TeachingSkill,
  TeachingSkillContext,
  TeachingSkillSelectionReason,
} from './types';

function compactText(parts: Array<string | undefined | null>, limit = 24_000): string {
  return parts
    .filter((part): part is string => Boolean(part?.trim()))
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function addFact(facts: SourceFact[], fact: Omit<SourceFact, 'id'>): void {
  const text = fact.text.replace(/\s+/g, ' ').trim();
  if (!text) return;
  const signature = `${fact.kind}:${fact.label}:${text}`.toLowerCase();
  if (
    facts.some(
      (candidate) =>
        `${candidate.kind}:${candidate.label}:${candidate.text}`.toLowerCase() === signature,
    )
  ) {
    return;
  }
  facts.push({
    ...fact,
    id: `fact_${facts.length + 1}`,
    text,
  });
}

function matchAllUnique(text: string, pattern: RegExp, limit: number): string[] {
  const matches: string[] = [];
  for (const match of text.matchAll(pattern)) {
    const value = (match[0] || '').replace(/\s+/g, ' ').trim();
    if (value && !matches.includes(value)) matches.push(value);
    if (matches.length >= limit) break;
  }
  return matches;
}

export function extractSourceFacts(sourceText: string, language: 'zh-CN' | 'en-US'): SourceFact[] {
  const facts: SourceFact[] = [];
  const text = sourceText.slice(0, 32_000);
  const mathLike = hasStrongMathSignal(text);
  const codeLike = hasStrongCodeSignal(text);

  for (const snippet of matchAllUnique(
    text,
    /\b[A-Z][A-Za-z_][A-Za-z0-9_]*\s*\([^()\n]{0,180}\)/g,
    4,
  )) {
    const label = snippet.match(/\b[A-Z][A-Za-z_][A-Za-z0-9_]*/)?.[0] || 'Object';
    addFact(facts, { kind: 'object', label, text: snippet });
  }

  for (const snippet of matchAllUnique(
    text,
    /\[[^\]\n]*(?:'[^']*'|"[^"]*"|\d)[^\]\n]{0,220}\]/g,
    3,
  )) {
    addFact(facts, {
      kind: 'data',
      label: language === 'zh-CN' ? '旧表示样例' : 'old representation sample',
      text: snippet,
    });
  }

  for (const snippet of matchAllUnique(
    text,
    /(?:^|\n)\s*(?:class|def|for|while|if|return|self\.)[^\n]{0,180}/gim,
    6,
  )) {
    addFact(facts, {
      kind: 'code',
      label: language === 'zh-CN' ? '代码片段' : 'code snippet',
      text: snippet,
    });
  }

  const assignment = text.match(
    /\b[A-Za-z_][A-Za-z0-9_]*\s*=\s*(?:[A-Z][A-Za-z_][A-Za-z0-9_]*\([^)\n]{0,160}\)|\[[^\]\n]{0,180}\]|\{[^}\n]{0,180}\})/,
  )?.[0];
  if (assignment) {
    addFact(facts, {
      kind: 'problem',
      label: language === 'zh-CN' ? '表示任务' : 'representation task',
      text: assignment,
    });
  }

  const namedObject = text.match(/\b[A-Z][A-Za-z_][A-Za-z0-9_]{2,}\b/)?.[0];
  if (
    namedObject &&
    (!mathLike || codeLike) &&
    !isLikelyCourseMetadataToken(namedObject) &&
    !facts.some((fact) => fact.text.toLowerCase().includes(namedObject.toLowerCase()))
  ) {
    addFact(facts, {
      kind: 'term',
      label: namedObject,
      text:
        language === 'zh-CN'
          ? `${namedObject} 是本节课材料里的具体对象；先解释它代表什么，再讲表示方法。`
          : `${namedObject} is the concrete object in the source material; explain what it represents before teaching the representation.`,
    });
  }

  if (facts.length === 0) {
    addFact(facts, {
      kind: 'problem',
      label: language === 'zh-CN' ? '本节课问题' : 'lesson problem',
      text:
        language === 'zh-CN'
          ? '根据资料中的第一个实质知识点、公式、例题或方法组织教学。'
          : 'Organize the lesson around the first substantive knowledge point, formula, example, or method in the source material.',
    });
  }

  return facts.slice(0, 8);
}

export function buildCourseProfile(args: {
  language: 'zh-CN' | 'en-US';
  requirement: string;
  courseContext?: CoursePersonalizationContext;
  sourceFacts?: SourceFact[];
}): CourseProfile {
  const { courseContext } = args;
  const requirementCourseCode = args.requirement.match(/\b[A-Z]{2,5}\s*\d{2,4}[A-Z]?\b/)?.[0];
  const courseCode = courseContext?.courseCode || requirementCourseCode;
  const tags = (courseContext?.tags || []).filter(Boolean);
  const sourceExamples = (args.sourceFacts || [])
    .filter((fact) => fact.kind === 'object' || fact.kind === 'data' || fact.kind === 'case')
    .map((fact) => fact.label)
    .slice(0, 4);

  return {
    courseCode,
    courseName: courseContext?.name,
    university: courseContext?.university,
    purpose: courseContext?.purpose,
    language: courseContext?.language || args.language,
    tags,
    sourceExamples,
    level:
      courseCode && /\b(?:CSC|CS)\s*1\d{2}/i.test(courseCode)
        ? 'first-year / early university'
        : courseCode && /\b(?:CSC|CS)\s*2\d{2}/i.test(courseCode)
          ? 'early-second-year'
          : undefined,
  };
}

function addSkill(
  selected: Map<string, TeachingSkillSelectionReason>,
  skillId: string,
  reason: string,
): void {
  if (!getTeachingSkillById(skillId)) return;
  if (!selected.has(skillId)) selected.set(skillId, { skillId, reason });
}

function scoreSkill(skill: TeachingSkill, text: string): number {
  return skill.triggers.reduce((sum, pattern) => sum + (pattern.test(text) ? 1 : 0), 0);
}

function preferredDisciplineSkill(hint?: SubjectTeachingPackId | string): string | undefined {
  if (hint === 'computer_science') return 'discipline.cs';
  if (hint === 'mathematics') return 'discipline.math';
  if (hint === 'humanities_social_science') return 'discipline.humanities-social';
  if (hint === 'business_economics') return 'discipline.business-economics';
  return undefined;
}

function hasStrongMathSignal(text: string): boolean {
  return /(数学|证明|定理|命题|引理|推论|定义域|陪域|值域|像|原像|单射|满射|双射|集合|微分|微分方程|导数|积分|斜率场|欧拉|初值|通解|特解|凹凸性|∀|∃|∈|⊆|⇒|⇔|proof|prove|theorem|proposition|lemma|domain|codomain|range|preimage|injective|surjective|bijective|differential equation|dy\/dx|derivative|integral|slope field|euler|initial value|particular solution|general solution|concavity|logarithmic|exponential)/i.test(
    text,
  );
}

function hasMathCourseSignal(text: string): boolean {
  return /\bMAT\s*\d{2,4}[A-Z]?\b|calculus|mathematical sciences|微积分|微分方程|斜率场|导数|积分|dy\/dx|differential equation|slope field|initial value|antiderivative/i.test(
    text,
  );
}

function hasStrongCodeSignal(text: string): boolean {
  return /(编程|程序|代码|python|java|javascript|typescript|oop|链表|二叉树|bst|dfs|bfs|栈|队列|字典|哈希|算法|数据结构|complexity|invariant|console\.log|self\.|\bdef\s+[A-Za-z_][A-Za-z0-9_]*\s*\(|\bclass\s+[A-Za-z_][A-Za-z0-9_]*(?:\s*[:({]|\s+extends\s)|return\s+[^.!?。！？]{1,80};|\bfor\s*\(|\bwhile\s*\()/i.test(
    text,
  );
}

function isLikelyCourseMetadataToken(value: string): boolean {
  return /^(Python|Java|TypeScript|JavaScript|HTML|CSS|JSON|PDF|PPTX|Markdown|OOP|API|HTTP|CSC|CS|MAT|UTSG|UTM|UTSC|UofT|WEEK|Speed|Education|Calculus)$/i.test(
    value,
  );
}

const CODE_ONLY_SKILL_IDS = new Set([
  'topic.oop.object-model',
  'topic.syntax.execution-trace',
  'topic.ds.structures',
  'topic.alg.graph-frontier',
  'component.memory',
  'component.trace',
  'component.graph-trace',
]);

export function selectTeachingSkills(context: TeachingSkillContext): SelectedTeachingSkills {
  const sourceFacts = context.sourceFacts?.length
    ? context.sourceFacts
    : extractSourceFacts(context.sourceText, context.language);
  const courseProfile = context.courseProfile || {
    language: context.language,
    sourceExamples: sourceFacts.map((fact) => fact.label).slice(0, 4),
  };
  const text = compactText([
    context.requirement,
    context.sourceText,
    courseProfile.courseCode,
    courseProfile.courseName,
    courseProfile.tags?.join(' '),
    courseProfile.purpose,
  ]).toLowerCase();
  const selected = new Map<string, TeachingSkillSelectionReason>();
  const mathLike = hasStrongMathSignal(text);
  const mathCourseLike = hasMathCourseSignal(text);
  const codeLike = hasStrongCodeSignal(text);

  addSkill(selected, 'pedagogy.example-first', 'baseline teaching style');
  addSkill(selected, 'pedagogy.problem-solving', 'baseline transfer/checklist style');

  const hinted = preferredDisciplineSkill(context.disciplineHint);
  if (hinted) addSkill(selected, hinted, `discipline hint: ${context.disciplineHint}`);

  if (courseProfile.purpose === 'research') {
    addSkill(selected, 'purpose.research', 'course purpose is research');
  }

  const scored = TEACHING_SKILL_REGISTRY.map((skill) => ({
    skill,
    score: scoreSkill(skill, text),
  }))
    .filter((item) => item.score > 0)
    .filter(
      (item) =>
        !(
          item.skill.id === 'discipline.cs' &&
          (mathCourseLike || (mathLike && !codeLike)) &&
          hinted !== 'discipline.cs'
        ) &&
        !(
          (mathCourseLike || (mathLike && !codeLike)) &&
          hinted !== 'discipline.cs' &&
          CODE_ONLY_SKILL_IDS.has(item.skill.id)
        ),
    )
    .sort((a, b) => b.score - a.score || b.skill.priority - a.skill.priority);

  for (const item of scored) {
    addSkill(selected, item.skill.id, `matched ${item.score} trigger(s) in course material`);
  }

  if ((mathCourseLike || (mathLike && !codeLike)) && hinted !== 'discipline.cs') {
    selected.delete('discipline.cs');
    for (const skillId of CODE_ONLY_SKILL_IDS) selected.delete(skillId);
    addSkill(selected, 'discipline.math', 'math course signals override programming-like noise');
  }

  if (![...selected.keys()].some((id) => id.startsWith('discipline.'))) {
    addSkill(selected, 'discipline.cs', 'defaulted from programming-like source');
    if (!/(code|python|class|函数|代码|程序|对象|循环|算法)/i.test(text)) {
      selected.delete('discipline.cs');
    }
  }

  if (![...selected.keys()].some((id) => id.startsWith('discipline.'))) {
    addSkill(selected, 'pedagogy.example-first', 'general teaching fallback');
  }

  for (const reason of [...selected.values()]) {
    const skill = getTeachingSkillById(reason.skillId);
    if (!skill) continue;
    for (const implied of skill.impliedSkillIds || []) {
      addSkill(selected, implied, `implied by ${skill.id}`);
    }
  }

  const skills = [...selected.keys()]
    .map((id) => getTeachingSkillById(id))
    .filter((skill): skill is TeachingSkill => Boolean(skill))
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));

  return {
    skills,
    skillIds: skills.map((skill) => skill.id),
    reasons: skills
      .map((skill) => selected.get(skill.id))
      .filter((reason): reason is TeachingSkillSelectionReason => Boolean(reason)),
    courseProfile,
    sourceFacts,
  };
}

export function subjectFromTeachingSkills(
  selection: SelectedTeachingSkills,
): SubjectTeachingPackId {
  const preferred = selection.skills.find(
    (skill) => skill.kind === 'discipline' && skill.preferredSubject,
  )?.preferredSubject;
  return preferred || 'general';
}
