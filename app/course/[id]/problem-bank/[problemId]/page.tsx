import { CourseProblemBankView } from '@/components/problem-bank/course-problem-bank-view';
import type { CourseProblemBankInitialFilters } from '@/components/problem-bank/use-course-problem-bank-controller';

type CourseProblemPracticeSearchParams = {
  notebookId?: string | string[];
  notebookFilter?: string | string[];
  q?: string | string[];
  practice?: string | string[];
  type?: string | string[];
  difficulty?: string | string[];
  status?: string | string[];
};

function firstSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function initialFiltersFromSearchParams(
  params: CourseProblemPracticeSearchParams,
): CourseProblemBankInitialFilters {
  return {
    searchQuery: firstSearchParam(params.q),
    practiceFilter: firstSearchParam(params.practice),
    typeFilter: firstSearchParam(params.type),
    difficultyFilter: firstSearchParam(params.difficulty),
    notebookFilter: firstSearchParam(params.notebookFilter),
    statusFilter: firstSearchParam(params.status),
  };
}

export default async function CourseProblemPracticePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; problemId: string }>;
  searchParams: Promise<CourseProblemPracticeSearchParams>;
}) {
  const { id, problemId } = await params;
  const resolvedSearchParams = await searchParams;
  const notebookId = resolvedSearchParams.notebookId;
  const initialNotebookId = typeof notebookId === 'string' ? notebookId : undefined;
  const initialFilters = initialFiltersFromSearchParams(resolvedSearchParams);

  return (
    <CourseProblemBankView
      courseId={id}
      initialNotebookId={initialNotebookId}
      initialProblemId={problemId}
      initialFilters={initialFilters}
      mode="practice"
    />
  );
}
