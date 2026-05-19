import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { summarizeSpeechReadinessFromScenes } from '@/lib/audio/speech-readiness-summary';
import type { Action } from '@/lib/types/action';
import {
  findCoursePurchase,
  findPublicStoreCourseDetail,
  listCourseReviewsWithReviewer,
  listNotebookPurchasesForSources,
} from '@/lib/server/repositories/store-repository';

function ownerDisplayName(owner: { name: string | null; email: string | null }): string {
  const n = owner.name?.trim();
  if (n) return n;
  const e = owner.email?.trim();
  if (e) return e.split('@')[0] || e;
  return '匿名创作者';
}

function summarizeActions(scenes: Array<{ actions: unknown }>) {
  return summarizeSpeechReadinessFromScenes(
    scenes.map((scene) => ({
      actions: (scene.actions as unknown as Action[] | undefined) ?? undefined,
    })),
  );
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;
    const { id } = await context.params;

    const course = await findPublicStoreCourseDetail(prisma, userId, id);

    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    const [reviews, purchase] = await Promise.all([
      listCourseReviewsWithReviewer(prisma, course.id),
      findCoursePurchase(prisma, userId, course.id),
    ]);
    const notebookPurchases = await listNotebookPurchasesForSources(
      prisma,
      userId,
      course.notebooks.map((notebook) => notebook.id),
    );
    const notebookPurchaseMap = new Map(
      notebookPurchases.map(
        (purchase) => [purchase.sourceNotebookId, purchase.clonedNotebookId] as const,
      ),
    );

    const ratingSum = reviews.reduce((sum, review) => sum + review.rating, 0);
    const courseSpeech = summarizeActions(course.notebooks.flatMap((notebook) => notebook.scenes));
    return NextResponse.json({
      course: {
        ...course,
        notebooks: course.notebooks.map((notebook) => {
          const speech = summarizeActions(notebook.scenes);
          return {
            ...notebook,
            speechReadyCount: speech.ready,
            speechTotalCount: speech.total,
            speechStatus: speech.status,
            purchased: notebookPurchaseMap.has(notebook.id),
            clonedNotebookId: notebookPurchaseMap.get(notebook.id) ?? null,
          };
        }),
        speechReadyCount: courseSpeech.ready,
        speechTotalCount: courseSpeech.total,
        speechStatus: courseSpeech.status,
        ownerName: ownerDisplayName(course.owner),
        averageRating: reviews.length > 0 ? ratingSum / reviews.length : 0,
        reviewCount: reviews.length,
        purchased: Boolean(purchase),
        clonedCourseId: purchase?.clonedCourseId ?? null,
      },
      reviews: reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt,
        reviewerName: ownerDisplayName(review.reviewer),
        reviewerAvatarUrl: review.reviewer.image,
      })),
    });
  });
}
