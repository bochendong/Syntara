import type {
  LearnProblemBankExcludedCandidate,
  LearnProblemBankMatch,
  LearnProblemBankSearchResult,
} from '@/features/learn-core/domain/types';
import type { PrismaClient } from '@/lib/server/generated-prisma';
import {
  searchProblemSourceEvidence,
  type MemoryEvidencePacket,
} from '@/lib/server/memory-source-evidence';
import { requireCourseReadAccess } from '@/lib/server/repositories/course-enrollment-repository';

type PracticeTopicProfile = {
  id: string;
  label: string;
  positive: Array<{ label: string; pattern: RegExp }>;
  excluded: Array<{ label: string; pattern: RegExp }>;
  strictRationale: string;
};

const TRUTH_TABLE_PROFILE: PracticeTopicProfile = {
  id: 'truth_table',
  label: 'truth table / truth values',
  positive: [
    { label: 'truth table', pattern: /truth\s*table|truthtable|真值表/i },
    {
      label: 'truth value',
      pattern:
        /truth\s*(value|values|statement|statements|assignment|assignments)|命题真值|真值判断/i,
    },
    {
      label: 'logical equivalence',
      pattern: /logical\s*(equivalence|statement|statements)|逻辑等价/i,
    },
    {
      label: 'compound proposition',
      pattern: /compound\s*(proposition|propositions|statement|statements)|复合命题/i,
    },
  ],
  excluded: [
    { label: 'forall', pattern: /\\forall|∀|\bforall\b|\bfor\s+all\b/i },
    { label: 'exists', pattern: /\\exists|∃|\bexists\b|\bthere\s+exists\b/i },
    { label: 'predicate', pattern: /\bpredicate|谓词/i },
    {
      label: 'quantifier',
      pattern: /\bquantifier|全称|存在|量词|任意|并非所有|不是所有|所有.*都/i,
    },
  ],
  strictRationale:
    '本轮目标是 truth table / truth values，因此只选题干或解析明确涉及真值表、真值判断、复合命题或逻辑等价的题。',
};

const QUANTIFIER_PROFILE: PracticeTopicProfile = {
  id: 'quantifier',
  label: 'quantifiers / predicates',
  positive: [
    { label: 'forall', pattern: /\\forall|∀|\bforall\b|\bfor\s+all\b|全称|任意|所有/i },
    { label: 'exists', pattern: /\\exists|∃|\bexists\b|\bthere\s+exists\b|存在/i },
    { label: 'predicate', pattern: /\bpredicate|谓词/i },
    { label: 'quantifier', pattern: /\bquantifier|量词/i },
  ],
  excluded: [{ label: 'truth table', pattern: /truth\s*table|truthtable|真值表/i }],
  strictRationale:
    '本轮目标是量词/谓词表达，因此优先选择题干明确涉及 forall、exists、predicate 或量词否定的题。',
};

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/&forall;/gi, ' forall ')
    .replace(/&exists?;/gi, ' exists ')
    .replace(/\\forall|∀/g, ' forall ')
    .replace(/\\exists|∃/g, ' exists ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferTopicProfile(query: string): PracticeTopicProfile | null {
  const normalized = normalizeSearchText(query);
  const hasTruthTable = TRUTH_TABLE_PROFILE.positive.some((item) => item.pattern.test(normalized));
  const hasQuantifier = QUANTIFIER_PROFILE.positive.some((item) => item.pattern.test(normalized));
  if (hasTruthTable && !hasQuantifier) return TRUTH_TABLE_PROFILE;
  if (hasQuantifier && !hasTruthTable) return QUANTIFIER_PROFILE;
  return null;
}

function metadataStrings(metadata: Record<string, unknown>): string[] {
  const tags = Array.isArray(metadata.tags)
    ? metadata.tags.map((tag) => (typeof tag === 'string' ? tag : '')).filter(Boolean)
    : [];
  return [
    typeof metadata.notebookName === 'string' ? metadata.notebookName : '',
    typeof metadata.problemType === 'string' ? metadata.problemType : '',
    typeof metadata.difficulty === 'string' ? metadata.difficulty : '',
    ...tags,
  ].filter(Boolean);
}

function evidenceText(match: MemoryEvidencePacket): string {
  return normalizeSearchText(
    [match.title, match.renderedText, match.originalText, ...metadataStrings(match.metadata)]
      .filter(Boolean)
      .join('\n'),
  );
}

function firstSignal(
  text: string,
  signals: PracticeTopicProfile['positive'],
): { label: string; matched: boolean } | null {
  for (const signal of signals) {
    if (signal.pattern.test(text)) return { label: signal.label, matched: true };
  }
  return null;
}

function clipText(value: string, limit: number): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, limit - 1)}…`;
}

function matchMetadataValue(match: MemoryEvidencePacket, key: string): string | null {
  const value = match.metadata[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function matchTags(match: MemoryEvidencePacket): string[] {
  const tags = match.metadata.tags;
  return Array.isArray(tags)
    ? tags
        .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
        .filter(Boolean)
        .slice(0, 8)
    : [];
}

function toLearnProblemMatch(
  match: MemoryEvidencePacket,
  score: number,
  reason: string,
): LearnProblemBankMatch {
  return {
    problemId: match.sourceId,
    title: match.title,
    score,
    reason,
    excerpt: clipText(match.renderedText || match.originalText, 520),
    notebookName: matchMetadataValue(match, 'notebookName'),
    tags: matchTags(match),
    difficulty: matchMetadataValue(match, 'difficulty') || undefined,
    problemType: matchMetadataValue(match, 'problemType') || undefined,
    attemptStatus: matchMetadataValue(match, 'attemptStatus'),
    metadata: {
      ...match.metadata,
      sourceEvidenceId: match.id,
      sourceType: match.sourceType,
    },
  };
}

function toExcludedCandidate(
  match: MemoryEvidencePacket,
  reason: string,
): LearnProblemBankExcludedCandidate {
  return {
    problemId: match.sourceId,
    title: match.title,
    reason,
    excerpt: clipText(match.renderedText || match.originalText, 360),
    metadata: {
      ...match.metadata,
      sourceEvidenceId: match.id,
      sourceType: match.sourceType,
    },
  };
}

function applyTopicProfile(args: {
  matches: MemoryEvidencePacket[];
  profile: PracticeTopicProfile | null;
}): {
  accepted: LearnProblemBankMatch[];
  excluded: LearnProblemBankExcludedCandidate[];
} {
  const accepted: LearnProblemBankMatch[] = [];
  const excluded: LearnProblemBankExcludedCandidate[] = [];
  for (const match of args.matches) {
    const text = evidenceText(match);
    if (!args.profile) {
      accepted.push(
        toLearnProblemMatch(
          match,
          match.score,
          '题库全文检索命中题干、题名、章节或标签，作为本轮候选题。',
        ),
      );
      continue;
    }

    const positive = firstSignal(text, args.profile.positive);
    const blocked = firstSignal(text, args.profile.excluded);
    if (args.profile.id === 'truth_table' && blocked) {
      excluded.push(
        toExcludedCandidate(
          match,
          `题干含有「${blocked.label}」量词/谓词信号，不能归入本轮「${args.profile.label}」练习。`,
        ),
      );
      continue;
    }
    if (positive) {
      accepted.push(
        toLearnProblemMatch(
          match,
          match.score + 30,
          `命中「${positive.label}」证据，符合本轮「${args.profile.label}」练习目标。`,
        ),
      );
      continue;
    }
    if (blocked) {
      excluded.push(
        toExcludedCandidate(
          match,
          `题干核心更像「${blocked.label}」专题，按本轮「${args.profile.label}」目标排除。`,
        ),
      );
      continue;
    }
    excluded.push(
      toExcludedCandidate(match, `没有明确命中「${args.profile.label}」的题干或解析证据。`),
    );
  }
  return { accepted, excluded };
}

export async function searchLearnProblemBankForPractice(args: {
  prisma: PrismaClient;
  userId: string;
  courseId?: string | null;
  query: string;
  requestedCount?: number;
}): Promise<LearnProblemBankSearchResult> {
  const query = args.query.trim();
  const requestedCount = Math.max(1, Math.min(args.requestedCount ?? 5, 12));
  const searchedAt = new Date().toISOString();
  if (!args.courseId || !query) {
    return {
      query,
      requestedCount,
      source: 'none',
      strictTopic: null,
      matches: [],
      excluded: [],
      rationale: ['没有可搜索的课程或练习主题。'],
      gaps: ['缺少 courseId 或 query，无法执行题库检索。'],
      searchedAt,
    };
  }

  await requireCourseReadAccess(args.prisma, args.userId, args.courseId);
  const profile = inferTopicProfile(query);
  const rawMatches = await searchProblemSourceEvidence({
    prisma: args.prisma,
    query,
    courseId: args.courseId,
    viewerUserId: args.userId,
    limit: Math.max(requestedCount * 3, 12),
  });
  const { accepted, excluded } = applyTopicProfile({ matches: rawMatches, profile });
  const matches = accepted
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, requestedCount);
  const gaps: string[] = [];
  if (matches.length < requestedCount) {
    gaps.push(
      `严格命中「${profile?.label || query}」的题只有 ${matches.length} 道；没有为了凑数量混入相邻专题。`,
    );
  }
  if (rawMatches.length === 0) {
    gaps.push('题库全文检索没有召回候选题。');
  }

  return {
    query,
    requestedCount,
    source: 'problem_bank_full_text',
    strictTopic: profile?.id || null,
    matches,
    excluded: excluded.slice(0, 8),
    rationale: [
      profile?.strictRationale ||
        '本轮用题库全文检索题干、题名、章节、标签和作答记录，再按相关性与学习状态排序。',
      '作答状态只在相关候选内部重排，不能把不相关题目硬凑进练习集。',
      matches.length < requestedCount ? '严格命中不足时保留缺口提示，不自动扩展到相邻专题。' : '',
    ].filter(Boolean),
    gaps,
    searchedAt,
  };
}
