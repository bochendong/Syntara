import { CourseProblemBankView } from '@/components/problem-bank/course-problem-bank-view';

export default async function CourseProblemPracticePage({
  params,
}: {
  params: Promise<{ id: string; problemId: string }>;
}) {
  const { id, problemId } = await params;

  return <CourseProblemBankView courseId={id} initialProblemId={problemId} mode="practice" />;
}
