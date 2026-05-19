import { NextResponse } from 'next/server';
import { safeRoute } from '@/lib/server/json-error-response';
import { buildFixtureSourcePackage } from '@/lib/server/problem-import-test-pipeline';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const { id } = await context.params;
    const result = await buildFixtureSourcePackage({
      fixtureId: id,
      includePageImages: true,
    });
    return NextResponse.json({
      fixture: result.fixture,
      fileSize: result.fileSize,
      sourcePackage: result.sourcePackage,
    });
  });
}
