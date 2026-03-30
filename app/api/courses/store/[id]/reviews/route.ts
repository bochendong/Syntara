import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;
    const { id } = await context.params;

    const payload = reviewSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: payload.error.flatten() },
        { status: 400 },
      );
    }

    const purchase = await prisma.coursePurchase.findFirst({
      where: { buyerId: userId, sourceCourseId: id },
      select: { id: true },
    });
    if (!purchase) {
      return NextResponse.json({ error: '请先购买课程后再评分' }, { status: 403 });
    }

    const review = await prisma.courseReview.upsert({
      where: {
        courseId_reviewerId: {
          courseId: id,
          reviewerId: userId,
        },
      },
      update: {
        rating: payload.data.rating,
        comment: payload.data.comment?.trim() || null,
      },
      create: {
        courseId: id,
        reviewerId: userId,
        rating: payload.data.rating,
        comment: payload.data.comment?.trim() || null,
      },
    });

    return NextResponse.json({ review });
  });
}
