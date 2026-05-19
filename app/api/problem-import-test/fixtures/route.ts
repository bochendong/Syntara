import { NextResponse } from 'next/server';
import { safeRoute } from '@/lib/server/json-error-response';
import { listProblemImportFixtures } from '@/lib/server/problem-import-test-fixtures';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  return safeRoute(async () => {
    const fixtures = await listProblemImportFixtures();
    return NextResponse.json({ fixtures });
  });
}
