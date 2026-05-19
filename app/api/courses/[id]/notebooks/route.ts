import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { findOwnedCourse } from '@/lib/server/repositories/course-repository';
import { updateOwnedNotebook } from '@/lib/server/repositories/notebook-repository';

const addNotebookToCourseSchema = z.object({
  notebookId: z.string().trim().min(1),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;
    const { id } = await context.params;

    const payload = addNotebookToCourseSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: payload.error.flatten() },
        { status: 400 },
      );
    }

    const course = await findOwnedCourse(prisma, userId, id);
    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    const notebook = await updateOwnedNotebook(prisma, userId, payload.data.notebookId, {
      courseId: id,
    });
    if (!notebook) {
      return NextResponse.json({ error: 'Notebook not found' }, { status: 404 });
    }

    return NextResponse.json({ notebook });
  });
}
