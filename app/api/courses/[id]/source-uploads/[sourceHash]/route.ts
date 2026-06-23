import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { deleteCourseSourceUpload } from '@/features/memory/server/source-upload-library';

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; sourceHash: string }> },
) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { id, sourceHash } = await context.params;

    const result = await deleteCourseSourceUpload({
      prisma,
      userId: auth.userId,
      courseId: id,
      sourceHash,
    }).catch((error) => {
      const message = error instanceof Error ? error.message : 'Delete source upload failed';
      if (message === 'Course not found' || message === 'Source upload not found') {
        return NextResponse.json({ error: message }, { status: 404 });
      }
      throw error;
    });

    if (result instanceof NextResponse) return result;
    return NextResponse.json({ ok: true, result });
  });
}
