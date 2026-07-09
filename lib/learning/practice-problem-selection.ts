import type { PracticePlan } from '@/lib/learning/course-learner-state';
import type { CourseRecord } from '@/lib/utils/database';
import type { CourseProblemClientSummary } from '@/lib/utils/notebook-problem-api';

type PracticeSelectionTopicFamily =
  | 'truth_table'
  | 'quantifier'
  | 'linked_list'
  | 'induction'
  | 'function'
  | null;

const TRUTH_TABLE_ALIASES = [
  'truth table',
  'truthtable',
  'truth value',
  'truth values',
  'truth statement',
  'truth statements',
  'logical statement',
  'logical equivalence',
  'compound proposition',
  'compound statement',
  'truth assignment',
  '真值表',
  '真值',
  '命题真值',
  '逻辑等价',
  '复合命题',
];

const QUANTIFIER_ALIASES = [
  'quantifier',
  'quantifiers',
  'forall',
  'for all',
  'exists',
  'there exists',
  'predicate',
  'predicates',
  '量词',
  '全称',
  '存在',
  '谓词',
  '任意',
  '所有',
];

const LINKED_LIST_ALIASES = [
  'linked list',
  'linkedlist',
  'node',
  'nodes',
  'next',
  'head',
  '_first',
  '_node',
  'traversal',
  'insertion',
  'deletion',
  '链表',
  '单链表',
  '双向链表',
  '节点',
  '链接',
  '指针',
  '遍历',
  '插入',
  '删除',
];

function uniquePracticeSelectionStrings(
  values: Array<string | undefined | null>,
  limit = 12,
): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = (value || '').replace(/\s+/g, ' ').trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized.slice(0, 80));
    if (output.length >= limit) break;
  }
  return output;
}

export function normalizePracticeSelectionText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\\forall|&forall;|∀/g, ' forall ')
    .replace(/\\exists|&exist;|&exists;|∃/g, ' exists ')
    .replace(/([\u4e00-\u9fff])([a-z0-9])/gi, '$1 $2')
    .replace(/([a-z0-9])([\u4e00-\u9fff])/gi, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactPracticeSelectionText(value: string): string {
  return normalizePracticeSelectionText(value).replace(/[^a-z0-9]+/g, '');
}

function hasAnyPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function textHasTruthTableSignal(text: string): boolean {
  const compact = compactPracticeSelectionText(text);
  return (
    hasAnyPattern(text, [
      /truth\s*table|truthtable|真值表/,
      /truth\s*(value|values|statement|statements|assignment|assignments)/,
      /logical\s*(statement|statements|equivalence)|逻辑等价/,
      /compound\s*(proposition|propositions|statement|statements)|复合命题/,
      /命题真值|真值判断/,
    ]) || compact.includes('truthtable')
  );
}

function textHasQuantifierSignal(text: string): boolean {
  return hasAnyPattern(text, [
    /quantifier|forall|for\s+all|exists|there\s+exists|predicate/,
    /全称|存在|量词|谓词|任意|并非所有|不是所有|所有.*都/,
  ]);
}

function practiceSelectionTopicFamily(terms: string[]): PracticeSelectionTopicFamily {
  const text = normalizePracticeSelectionText(terms.join(' '));
  const hasTruthIntent =
    textHasTruthTableSignal(text) ||
    (/\btruth\b/.test(text) && /\btable\b/.test(text)) ||
    compactPracticeSelectionText(text).includes('truthtable');
  const hasQuantifierIntent = textHasQuantifierSignal(text);
  if (hasTruthIntent && !hasQuantifierIntent) return 'truth_table';
  if (hasQuantifierIntent && !hasTruthIntent) return 'quantifier';
  if (/linked\s*list|linkedlist|链表/.test(text)) return 'linked_list';
  if (/induction|归纳/.test(text)) return 'induction';
  if (/function|函数|inject|surject|bijection|单射|满射|双射/.test(text)) return 'function';
  return null;
}

function practiceProblemHaystack(problem: CourseProblemClientSummary): string {
  return normalizePracticeSelectionText(
    [problem.title, problem.notebookName || '', ...problem.tags].filter(Boolean).join(' '),
  );
}

function problemHasTruthTableEvidence(problem: CourseProblemClientSummary): boolean {
  return textHasTruthTableSignal(practiceProblemHaystack(problem));
}

function problemHasQuantifierEvidence(problem: CourseProblemClientSummary): boolean {
  return textHasQuantifierSignal(practiceProblemHaystack(problem));
}

function practiceProblemFamilyScore(problem: CourseProblemClientSummary, terms: string[]): number {
  const family = practiceSelectionTopicFamily(terms);
  if (family === 'truth_table') {
    if (problemHasQuantifierEvidence(problem)) return -40;
    if (problemHasTruthTableEvidence(problem)) return 30;
    return -10;
  }
  if (family === 'quantifier') {
    if (problemHasQuantifierEvidence(problem)) return 30;
    if (problemHasTruthTableEvidence(problem)) return -18;
    return -8;
  }
  return 0;
}

function practiceProblemContentScore(problem: CourseProblemClientSummary, terms: string[]): number {
  const titleText = normalizePracticeSelectionText(problem.title);
  const notebookText = normalizePracticeSelectionText(problem.notebookName || '');
  const tagTexts = problem.tags.map(normalizePracticeSelectionText);
  const text = practiceProblemSearchText(problem);
  const compactTitle = compactPracticeSelectionText(titleText);
  const compactNotebook = compactPracticeSelectionText(notebookText);
  const compactTags = problem.tags.map(compactPracticeSelectionText);
  const compactText = compactPracticeSelectionText(text);
  const isLinkedListRequest = terms.some((term) =>
    /linked\s*list|linkedlist|链表/.test(normalizePracticeSelectionText(term)),
  );
  let score = practiceProblemFamilyScore(problem, terms);
  for (const term of terms) {
    const normalized = normalizePracticeSelectionText(term);
    const compact = compactPracticeSelectionText(normalized);
    if (normalized && titleText.includes(normalized)) score += 24;
    if (normalized && notebookText.includes(normalized)) score += 12;
    if (normalized && tagTexts.some((tag) => tag.includes(normalized))) score += 7;
    if (normalized && text.includes(normalized)) score += 4;
    if (compact && compactTitle.includes(compact)) score += 18;
    if (compact && compactNotebook.includes(compact)) score += 10;
    if (compact && compactTags.some((tag) => tag.includes(compact))) score += 5;
    if (compact && compactText.includes(compact)) score += 2;
  }
  if (isLinkedListRequest && /链表|linked\s*list|linkedlist/.test(`${titleText} ${notebookText}`)) {
    score += 18;
  }
  if (
    isLinkedListRequest &&
    !/链表|linked\s*list|linkedlist/.test(`${titleText} ${notebookText}`)
  ) {
    score -= 12;
  }
  return score;
}

export function practiceSelectionTerms(args: {
  prompt?: string;
  preferredConcepts?: string[];
  course?: CourseRecord | null;
}): string[] {
  const topicText = normalizePracticeSelectionText(
    [args.prompt || '', ...(args.preferredConcepts || [])].join(' '),
  );
  const promptTerms = topicText
    .split(/[\s,，、:：;；/|]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
  const explicitTerms = [...(args.preferredConcepts || []), ...promptTerms];
  const rawTerms = uniquePracticeSelectionStrings(
    [...explicitTerms, ...(explicitTerms.length ? [] : args.course?.tags || [])],
    16,
  );
  const expanded = new Set<string>();
  for (const term of rawTerms) {
    const normalized = normalizePracticeSelectionText(term);
    if (!normalized) continue;
    expanded.add(normalized);
    const compact = compactPracticeSelectionText(normalized);
    if (compact) expanded.add(compact);
  }
  if (
    textHasTruthTableSignal(topicText) ||
    (/\btruth\b/.test(topicText) && /\btable\b/.test(topicText))
  ) {
    TRUTH_TABLE_ALIASES.forEach((item) => expanded.add(item));
  }
  if (textHasQuantifierSignal(topicText)) {
    QUANTIFIER_ALIASES.forEach((item) => expanded.add(item));
  }
  if (/linked\s*list|linkedlist|链表/.test(topicText)) {
    LINKED_LIST_ALIASES.forEach((item) => expanded.add(item));
  }
  return Array.from(expanded)
    .filter((term) => term.length >= 2)
    .slice(0, 28);
}

export function practiceProblemSearchText(problem: CourseProblemClientSummary): string {
  return practiceProblemHaystack(problem);
}

export function practiceProblemMatchScore(
  problem: CourseProblemClientSummary,
  terms: string[],
): number {
  const contentScore = practiceProblemContentScore(problem, terms);
  if (terms.length && contentScore <= 0) return contentScore;
  let score = contentScore;
  const status = problem.latestAttempt?.status;
  if (status === 'failed' || status === 'partial' || status === 'error') score += 8;
  if (!status) score += 3;
  if (status === 'passed') score -= 4;
  if (problem.status === 'published') score += 1;
  return score;
}

export function practiceProblemReason(
  problem: CourseProblemClientSummary,
  terms: string[],
): string {
  const family = practiceSelectionTopicFamily(terms);
  if (family === 'truth_table' && problemHasTruthTableEvidence(problem)) {
    return '命中「真值表/真值判断」主题，可以直接检验当前复习点。';
  }
  if (family === 'quantifier' && problemHasQuantifierEvidence(problem)) {
    return '命中「量词/谓词表达」主题，可以直接检验当前复习点。';
  }
  const titleText = normalizePracticeSelectionText(problem.title);
  const notebookText = normalizePracticeSelectionText(problem.notebookName || '');
  const tagTexts = problem.tags.map(normalizePracticeSelectionText);
  const compactTags = problem.tags.map(compactPracticeSelectionText);
  const matchedTerm = terms.find((term) => {
    const normalized = normalizePracticeSelectionText(term);
    const compact = compactPracticeSelectionText(term);
    return (
      (normalized && tagTexts.some((tag) => tag.includes(normalized))) ||
      (compact && compactTags.some((tag) => tag.includes(compact)))
    );
  });
  const titleMatch = terms.find((term) => {
    const normalized = normalizePracticeSelectionText(term);
    const compact = compactPracticeSelectionText(term);
    return (
      (normalized && titleText.includes(normalized)) ||
      (compact && compactPracticeSelectionText(problem.title).includes(compact))
    );
  });
  if (titleMatch) return `题目标题命中「${titleMatch}」，可以直接检验当前复习点。`;
  const notebookMatch = terms.find((term) => {
    const normalized = normalizePracticeSelectionText(term);
    const compact = compactPracticeSelectionText(term);
    return (
      (normalized && notebookText.includes(normalized)) ||
      (compact && compactPracticeSelectionText(problem.notebookName || '').includes(compact))
    );
  });
  if (notebookMatch) return `来自命中「${notebookMatch}」的题库章节，适合补这个专题。`;
  if (matchedTerm) return `命中题库标签「${matchedTerm}」，适合作为这轮目标练习。`;
  if (problem.latestAttempt?.status && problem.latestAttempt.status !== 'passed') {
    return '最近作答还不稳定，适合优先回炉。';
  }
  return '用于补齐这轮题库练习的覆盖面。';
}

function practiceProblemTypeLabel(type: CourseProblemClientSummary['type']): string {
  switch (type) {
    case 'choice':
      return '选择判断';
    case 'proof':
      return '证明表达';
    case 'calculation':
      return '计算推导';
    case 'fill_blank':
      return '填空';
    case 'code':
      return '代码';
    case 'short_answer':
    default:
      return '简答';
  }
}

function practiceProblemDifficultyLabel(
  difficulty: CourseProblemClientSummary['difficulty'],
): string {
  switch (difficulty) {
    case 'easy':
      return '基础';
    case 'hard':
      return '挑战';
    case 'medium':
    default:
      return '中等';
  }
}

export function practicePlanTopicFocusLine(topicText: string, primaryConcept: string): string {
  if (/链表|linked\s*list|linkedlist|head|next|node/.test(topicText)) {
    return '这组题会从节点引用、head/next 遍历推进到插入删除的边界情况。';
  }
  if (/truth\s*table|truthtable|真值表|truth value|truth statement|命题真值/.test(topicText)) {
    return '这组题会练 truth statements、truth values 和真值表/逻辑等价判断；量词题会留给量词专题。';
  }
  if (/量词|quantifier|predicate|谓词|forall|exists/.test(topicText)) {
    return '这组题会覆盖量词含义、否定变形和谓词公式表达，避免只背模板。';
  }
  if (/induction|归纳/.test(topicText)) {
    return '这组题会覆盖归纳假设、归纳步和边界条件，适合检查证明结构。';
  }
  if (/function|函数|inject|surject|bijection|单射|满射|双射/.test(topicText)) {
    return '这组题会覆盖函数定义、单射/满射判断和证明表达。';
  }
  return `先做直接命中「${primaryConcept}」的题，再用相邻标签题补齐覆盖面。`;
}

export function selectedProblemPracticeRationale(args: {
  primaryConcept: string;
  selectedProblems: CourseProblemClientSummary[];
  terms: string[];
}): string[] {
  const topicText = normalizePracticeSelectionText(
    [
      args.primaryConcept,
      ...args.terms,
      ...args.selectedProblems.flatMap((problem) => [
        problem.title,
        problem.notebookName || '',
        ...problem.tags,
      ]),
    ].join(' '),
  );
  const family = practiceSelectionTopicFamily(args.terms);
  const typeLabels = uniquePracticeSelectionStrings(
    args.selectedProblems.map((problem) => practiceProblemTypeLabel(problem.type)),
    4,
  );
  const difficultyLabels = uniquePracticeSelectionStrings(
    args.selectedProblems.map((problem) => practiceProblemDifficultyLabel(problem.difficulty)),
    3,
  );
  const needsReviewCount = args.selectedProblems.filter((problem) => {
    const status = problem.latestAttempt?.status;
    return !status || status === 'failed' || status === 'partial' || status === 'error';
  }).length;
  return uniquePracticeSelectionStrings(
    [
      `优先选择题库里命中「${args.primaryConcept}」及相关标签/标题的题。`,
      family === 'truth_table' ? '这次不会为了凑数量混入只命中量词/forall 的题。' : '',
      practicePlanTopicFocusLine(topicText, args.primaryConcept),
      typeLabels.length
        ? `题型覆盖 ${typeLabels.join('、')}${
            difficultyLabels.length ? `，难度包含 ${difficultyLabels.join('、')}` : ''
          }。`
        : '',
      needsReviewCount > 0
        ? `其中 ${needsReviewCount} 道是未做或最近没有完全通过的题，适合优先查漏。`
        : '这组题按题库覆盖面排序，适合直接进入做题页。',
    ],
    4,
  );
}

export function isPracticeProblemSelectionRelevant(
  problem: CourseProblemClientSummary,
  terms: string[],
): boolean {
  return !terms.length || practiceProblemContentScore(problem, terms) > 0;
}
