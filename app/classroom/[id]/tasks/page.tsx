import { redirect } from 'next/navigation';

type ClassroomTaskHistoryPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ClassroomTaskHistoryPage({ params }: ClassroomTaskHistoryPageProps) {
  const { id } = await params;
  redirect(`/classroom/${encodeURIComponent(id)}`);
}
