import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import {
  listCoursePurchasesForSources,
  listCourseReviewRatings,
  listPublicStoreCoursesForUser,
} from '@/lib/server/repositories/store-repository';

function ownerDisplayName(owner: { name: string | null; email: string | null }): string {
  const n = owner.name?.trim();
  if (n) return n;
  const e = owner.email?.trim();
  if (e) {
    const local = e.split('@')[0]?.trim();
    return local || e;
  }
  return '匿名创作者';
}

function speechStatus(total: number, ready: number): 'no_speech' | 'ready' | 'pending' {
  if (total <= 0) return 'no_speech';
  return ready >= total ? 'ready' : 'pending';
}

export async function GET() {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;

    const rows = await listPublicStoreCoursesForUser(prisma, userId);

    const courseIds = rows.map((row) => row.id);
    const [reviews, purchases] = await Promise.all([
      listCourseReviewRatings(prisma, courseIds),
      listCoursePurchasesForSources(prisma, userId, courseIds),
    ]);

    const reviewMap = new Map<string, { sum: number; count: number }>();
    for (const review of reviews) {
      const current = reviewMap.get(review.courseId) ?? { sum: 0, count: 0 };
      current.sum += review.rating;
      current.count += 1;
      reviewMap.set(review.courseId, current);
    }
    const purchasedSet = new Set(purchases.map((purchase) => purchase.sourceCourseId));

    const courses = rows.map((row) => {
      const { owner, _count, notebooks, ...course } = row;
      const reviewStats = reviewMap.get(row.id);
      const speechReadyCount = notebooks.reduce(
        (sum, notebook) => sum + (notebook.speechReadyCount ?? 0),
        0,
      );
      const speechTotalCount = notebooks.reduce(
        (sum, notebook) => sum + (notebook.speechTotalCount ?? 0),
        0,
      );
      return {
        ...course,
        ownerName: ownerDisplayName(owner),
        notebookCount: course.notebookCount || _count.notebooks,
        speechReadyCount,
        speechTotalCount,
        speechStatus: speechStatus(speechTotalCount, speechReadyCount),
        averageRating: reviewStats ? reviewStats.sum / reviewStats.count : 0,
        reviewCount: reviewStats?.count ?? 0,
        purchased: purchasedSet.has(row.id),
      };
    });

    return NextResponse.json({ courses });
  });
}
