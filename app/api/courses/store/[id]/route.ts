import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';

function ownerDisplayName(owner: { name: string | null; email: string | null }): string {
  const n = owner.name?.trim();
  if (n) return n;
  const e = owner.email?.trim();
  if (e) return e.split('@')[0] || e;
  return '用户';
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;
    const { id } = await context.params;

    const course = await prisma.course.findFirst({
      where: {
        id,
        listedInCourseStore: true,
        ownerId: { not: userId },
      },
      include: {
        owner: { select: { name: true, email: true } },
        notebooks: {
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            name: true,
            description: true,
            tags: true,
            avatarUrl: true,
            listedInNotebookStore: true,
            notebookPriceCents: true,
            updatedAt: true,
            createdAt: true,
            _count: { select: { scenes: true } },
          },
        },
      },
    });

    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    const [reviews, purchase] = await Promise.all([
      prisma.courseReview.findMany({
        where: { courseId: course.id },
        orderBy: { updatedAt: 'desc' },
        include: {
          reviewer: { select: { name: true, email: true, image: true } },
        },
      }),
      prisma.coursePurchase.findFirst({
        where: { buyerId: userId, sourceCourseId: course.id },
        select: { id: true, clonedCourseId: true },
      }),
    ]);
    const notebookPurchases = await prisma.notebookPurchase.findMany({
      where: {
        buyerId: userId,
        sourceNotebookId: { in: course.notebooks.map((notebook) => notebook.id) },
      },
      select: { sourceNotebookId: true, clonedNotebookId: true },
    });
    const notebookPurchaseMap = new Map(
      notebookPurchases.map(
        (purchase) => [purchase.sourceNotebookId, purchase.clonedNotebookId] as const,
      ),
    );

    const ratingSum = reviews.reduce((sum, review) => sum + review.rating, 0);
    return NextResponse.json({
      course: {
        ...course,
        notebooks: course.notebooks.map((notebook) => ({
          ...notebook,
          purchased: notebookPurchaseMap.has(notebook.id),
          clonedNotebookId: notebookPurchaseMap.get(notebook.id) ?? null,
        })),
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
