export type ProblemConceptTagInput = {
  courseId?: string | null;
  courseCode?: string | null;
  courseName?: string | null;
  notebookId?: string | null;
  notebookName?: string | null;
  title?: string | null;
  type?: string | null;
  tags?: string[] | null;
  difficulty?: string | null;
  publicContent?: unknown;
  sourceMeta?: unknown;
};

export function normalizeProblemConceptTags(input: ProblemConceptTagInput): string[];

export function problemConceptTopics(input: ProblemConceptTagInput, fallback?: string): string[];
