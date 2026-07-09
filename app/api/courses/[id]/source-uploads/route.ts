import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { listCourseSourceUploads } from '@/features/memory/server/source-upload-library';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { id } = await context.params;
    const url = new URL(request.url);
    const includeTextSections = url.searchParams.get('includeText') !== '0';

    const uploads = await listCourseSourceUploads({
      prisma,
      userId: auth.userId,
      courseId: id,
      includeTextSections,
    }).catch((error) => {
      const message = error instanceof Error ? error.message : 'List source uploads failed';
      if (message === 'Course not found') {
        return NextResponse.json({ error: message }, { status: 404 });
      }
      throw error;
    });

    if (uploads instanceof NextResponse) return uploads;
    return NextResponse.json({ storage: 'database', uploads });
  });
}
