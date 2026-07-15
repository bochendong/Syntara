import courseJson from '@/data/csc148/course.json';
import problemBankJson from '@/data/csc148/problem-bank.json';
import type {
  Csc148LocalDataset,
  Csc148LocalProblem,
  Csc148LocalSearchHit,
  Csc148LocalSection,
} from '@/lib/csc148-local/types';

function normalizeForSearch(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function tokenizeQuery(query: string): string[] {
  const normalized = normalizeForSearch(query);
  if (!normalized) return [];
  return [
    ...new Set(
      normalized
        .split(/[\s,，.。;；:：/\\|()[\]{}"'`]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2),
    ),
  ];
}

function scoreFields(tokens: string[], weightedFields: Array<[string | null | undefined, number]>) {
  if (tokens.length === 0) return 0;

  let score = 0;
  for (const [field, weight] of weightedFields) {
    if (!field) continue;
    const haystack = normalizeForSearch(field);
    for (const token of tokens) {
      if (haystack.includes(token)) score += weight;
    }
  }
  return score;
}

function scoreSection(tokens: string[], section: Csc148LocalSection, notebookName: string): number {
  return scoreFields(tokens, [
    [section.title, 8],
    [section.summary, 5],
    [notebookName, 4],
    [section.markdown, 1],
  ]);
}

function scoreProblem(tokens: string[], problem: Csc148LocalProblem): number {
  return scoreFields(tokens, [
    [problem.title, 9],
    [problem.summary, 6],
    [problem.sectionTitle, 5],
    [problem.notebookTitle, 4],
    [problem.category, 4],
    [problem.tags.join(' '), 4],
    [problem.question, 2],
    [problem.explanation, 1],
    [problem.templateCode, 1],
  ]);
}

export function getCsc148LocalDataset(): Csc148LocalDataset {
  const courseData = courseJson as Omit<Csc148LocalDataset, 'problemBank' | 'sections'>;
  const problemBank = problemBankJson as Csc148LocalDataset['problemBank'];
  const sections = courseData.notebooks.flatMap((notebook) =>
    notebook.sections.map((section) => ({ ...section, notebook })),
  );

  return {
    course: courseData.course,
    notebooks: courseData.notebooks,
    problemBank,
    sections,
  };
}

export function searchCsc148LocalDataset(query: string, limit = 12): Csc148LocalSearchHit[] {
  const dataset = getCsc148LocalDataset();
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return [];

  const sectionHits: Csc148LocalSearchHit[] = dataset.sections
    .map(({ notebook, ...section }) => ({
      kind: 'section' as const,
      id: section.id,
      score: scoreSection(tokens, section, notebook.name),
      notebook,
      section,
    }))
    .filter((hit) => hit.score > 0);

  const problemHits: Csc148LocalSearchHit[] = dataset.problemBank.problems
    .map((problem) => ({
      kind: 'problem' as const,
      id: problem.id,
      score: scoreProblem(tokens, problem),
      problem,
    }))
    .filter((hit) => hit.score > 0);

  return [...sectionHits, ...problemHits]
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);
}
