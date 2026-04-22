import { CourseProblemBankView } from '@/components/problem-bank/course-problem-bank-view';

export default async function CourseProblemBankPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notebookId?: string | string[] }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const notebookId = resolvedSearchParams.notebookId;
  const initialNotebookId = typeof notebookId === 'string' ? notebookId : undefined;

  return <CourseProblemBankView courseId={id} initialNotebookId={initialNotebookId} />;
}
