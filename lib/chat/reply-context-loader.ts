export type ReplyContextIntent =
  | 'problem_tutoring'
  | 'programming_help'
  | 'proof_help'
  | 'concept_help'
  | 'course_review';

export type ReplyContextTier = 0 | 1 | 2 | 3;

export type ReplyContextMemoryKind =
  | 'course_rule'
  | 'solution_template'
  | 'concept'
  | 'worked_example'
  | 'common_mistake'
  | 'student_state'
  | 'attempt_summary'
  | 'source_excerpt';

export type ReplyContextCapsule = {
  id: string;
  kind: ReplyContextMemoryKind;
  title: string;
  text: string;
  tags: string[];
  source: 'built_in_rule_pack' | 'memory' | 'notebook_source' | 'problem_attempt';
  priority: number;
  tokenEstimate: number;
};

export type ReplyContextPlan = {
  intent: ReplyContextIntent;
  tier: ReplyContextTier;
  maxContextTokens: number;
  maxCapsules: number;
  signals: string[];
  neededContext: ReplyContextMemoryKind[];
  reasons: string[];
};

export type ReplyContextBundle = {
  plan: ReplyContextPlan;
  capsules: ReplyContextCapsule[];
  prompt: string;
  audit: {
    capsuleCount: number;
    estimatedTokens: number;
    hasCourseRules: boolean;
    hasSolutionTemplate: boolean;
    hasCommonMistake: boolean;
    withinBudget: boolean;
  };
};

type BuildReplyContextArgs = {
  message: string;
  courseCode?: string | null;
  courseName?: string | null;
  notebookName?: string | null;
  isProgrammingQuestion?: boolean;
  memoryAvailable?: boolean;
};

function compact(input: string, maxChars: number): string {
  const text = input
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}

function normalizedCourseKey(args: BuildReplyContextArgs): string {
  return [args.courseCode, args.courseName, args.notebookName]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function detectSignals(args: BuildReplyContextArgs): string[] {
  const haystack = `${normalizedCourseKey(args)}\n${args.message}`.toLowerCase();
  const signals = new Set<string>();
  if (args.isProgrammingQuestion) signals.add('programming');
  if (
    /racket|python|java(script)?|typescript|c\+\+|scheme|htdp|#reader|spd\/tags|\bdef\s+\w+\s*\(|\(@htdf|\(define\b|function signature|starter code|代码/.test(
      haystack,
    )
  ) {
    signals.add('language_or_code_context');
  }
  if (/@signature|check-expect|@template-origin|design recipe|设计/.test(haystack)) {
    signals.add('course_design_recipe');
  }
  if (
    /2-one-of|two one-of|one-of|case split|simultaneous|同时|同步|table cells|表格|遍历|traverse/.test(
      haystack,
    )
  ) {
    signals.add('case_split_or_simultaneous_traversal');
  }
  if (/2htdp\/image|overlay|circle|image/.test(haystack)) {
    signals.add('image_composition');
  }
  if (/wrap around|环绕|绕回|回到开头|longest chain|连续链/.test(haystack)) {
    signals.add('cyclic_or_wraparound_sequence');
  }
  if (/regex|\bre\b|re\.search|regular expression|正则/.test(haystack)) {
    signals.add('pattern_matching');
  }
  if (/mat102|proof|证明|epsilon|ε|集合|逻辑|命题/.test(haystack)) {
    signals.add('formal_reasoning');
  }
  if (/mat136|integral|积分|series|级数|converge|diverge|收敛|发散/.test(haystack)) {
    signals.add('quantitative_methods');
  }
  return Array.from(signals);
}

function buildContextPlan(args: BuildReplyContextArgs, signals: string[]): ReplyContextPlan {
  const signalSet = new Set(signals);
  const neededContext = new Set<ReplyContextMemoryKind>();
  const reasons: string[] = [];
  let intent: ReplyContextIntent = args.isProgrammingQuestion ? 'programming_help' : 'concept_help';
  let tier: ReplyContextTier = args.isProgrammingQuestion ? 1 : 0;
  let maxContextTokens = args.isProgrammingQuestion ? 1600 : 900;
  let maxCapsules = args.isProgrammingQuestion ? 4 : 3;

  if (signalSet.has('language_or_code_context') || signalSet.has('course_design_recipe')) {
    intent = 'problem_tutoring';
    tier = 2;
    maxContextTokens = 2200;
    maxCapsules = 4;
    neededContext.add('course_rule');
    neededContext.add('solution_template');
    neededContext.add('common_mistake');
    reasons.push('Programming questions with course-format signals need retrieved course rules.');
  }
  if (signalSet.has('case_split_or_simultaneous_traversal')) {
    neededContext.add('solution_template');
    neededContext.add('common_mistake');
    tier = Math.max(tier, 2) as ReplyContextTier;
    reasons.push(
      'Case-split or simultaneous-traversal questions need a template-level explanation.',
    );
  }
  if (signalSet.has('image_composition')) {
    neededContext.add('worked_example');
    neededContext.add('common_mistake');
    tier = Math.max(tier, 1) as ReplyContextTier;
    reasons.push('Composition questions need ordering and visual-result checks.');
  }
  if (signalSet.has('cyclic_or_wraparound_sequence')) {
    neededContext.add('solution_template');
    neededContext.add('common_mistake');
    tier = Math.max(tier, 1) as ReplyContextTier;
    reasons.push('Cyclic sequence questions need boundary and double-counting checks.');
  }
  if (signalSet.has('pattern_matching')) {
    neededContext.add('solution_template');
    reasons.push('Pattern-matching questions benefit from a construction template.');
  }
  if (signalSet.has('formal_reasoning')) {
    intent = 'proof_help';
    neededContext.add('course_rule');
    neededContext.add('common_mistake');
    tier = Math.max(tier, 1) as ReplyContextTier;
    reasons.push('Formal reasoning questions need rigor and existence checks.');
  }
  if (signalSet.has('quantitative_methods')) {
    neededContext.add('concept');
    neededContext.add('worked_example');
    tier = Math.max(tier, 1) as ReplyContextTier;
    reasons.push(
      'Quantitative questions usually need the relevant concept/theorem and a worked example.',
    );
  }
  void args.memoryAvailable;

  return {
    intent,
    tier,
    maxContextTokens,
    maxCapsules,
    signals,
    neededContext: Array.from(neededContext),
    reasons,
  };
}

function builtInCapsulesForSignals(_signals: string[]): ReplyContextCapsule[] {
  return [];
}

function selectCapsules(plan: ReplyContextPlan, capsules: ReplyContextCapsule[]) {
  const selected: ReplyContextCapsule[] = [];
  let total = 0;
  for (const item of capsules.sort((a, b) => b.priority - a.priority)) {
    if (selected.length >= plan.maxCapsules) break;
    if (total + item.tokenEstimate > plan.maxContextTokens) continue;
    selected.push(item);
    total += item.tokenEstimate;
  }
  return selected;
}

function formatCapsules(capsules: ReplyContextCapsule[]): string {
  if (capsules.length === 0) return 'none';
  return capsules
    .map(
      (item, index) =>
        `${index + 1}. ${item.title}: ${compact(item.text.replace(/\n/g, ' '), 520)}`,
    )
    .join('\n');
}

export function buildReplyContextBundle(args: BuildReplyContextArgs): ReplyContextBundle {
  const signals = detectSignals(args);
  const plan = buildContextPlan(args, signals);
  const capsules = selectCapsules(plan, builtInCapsulesForSignals(signals));
  const estimatedTokens = capsules.reduce((total, item) => total + item.tokenEstimate, 0);
  const prompt = formatCapsules(capsules);

  return {
    plan,
    capsules,
    prompt,
    audit: {
      capsuleCount: capsules.length,
      estimatedTokens,
      hasCourseRules: capsules.some((item) => item.kind === 'course_rule'),
      hasSolutionTemplate: capsules.some((item) => item.kind === 'solution_template'),
      hasCommonMistake: capsules.some((item) => item.kind === 'common_mistake'),
      withinBudget: estimatedTokens <= plan.maxContextTokens,
    },
  };
}
