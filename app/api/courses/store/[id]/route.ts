import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
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

function speechStatus(total: number, ready: number): 'no_speech' | 'ready' | 'pending' {
  if (total <= 0) return 'no_speech';
  return ready >= total ? 'ready' : 'pending';
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
    const courseSpeechReadyCount = course.notebooks.reduce(
      (sum, notebook) => sum + (notebook.speechReadyCount ?? 0),
      0,
    );
    const courseSpeechTotalCount = course.notebooks.reduce(
      (sum, notebook) => sum + (notebook.speechTotalCount ?? 0),
      0,
    );
    return NextResponse.json({
      course: {
        ...course,
        notebooks: course.notebooks.map((notebook) => {
          return {
            ...notebook,
            _count: { scenes: notebook.sceneCount ?? 0 },
            speechReadyCount: notebook.speechReadyCount ?? 0,
            speechTotalCount: notebook.speechTotalCount ?? 0,
            speechStatus: notebook.speechStatus ?? 'no_speech',
            purchased: notebookPurchaseMap.has(notebook.id),
            clonedNotebookId: notebookPurchaseMap.get(notebook.id) ?? null,
          };
        }),
        speechReadyCount: courseSpeechReadyCount,
        speechTotalCount: courseSpeechTotalCount,
        speechStatus: speechStatus(courseSpeechTotalCount, courseSpeechReadyCount),
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
