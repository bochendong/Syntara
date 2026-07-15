import type { Metadata } from 'next';
import { Csc148EndToEndPageClient } from '@/features/qa/test-center/csc148/csc148-end-to-end-page-client';
import { getCsc148LocalDataset, searchCsc148LocalDataset } from '@/lib/csc148-local/data';

export const metadata: Metadata = {
  title: 'CSC148 完整学习闭环测试',
};

export default async function Csc148EndToEndTestPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  const dataset = getCsc148LocalDataset();
  const initialHits = searchCsc148LocalDataset('linked list representation invariant tree', 10);
  const initialMode =
    mode === 'course' || mode === 'problems' || mode === 'results' ? mode : 'chat';

  return (
    <Csc148EndToEndPageClient
      dataset={dataset}
      initialHits={initialHits}
      initialMode={initialMode}
    />
  );
}
