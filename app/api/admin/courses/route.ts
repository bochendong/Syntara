import type { Prisma } from '@prisma/client';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { requireAdmin } from '@/lib/server/admin-auth';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';

function normalizeSearch(raw: string | null): string {
  return raw?.trim() || '';
}

function normalizeTake(raw: string | null): number {
  const parsed = Number.parseInt(raw || '', 10);
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(Math.max(parsed, 1), 200);
}

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if ('response' in admin) return admin.response;

  const prisma = getOptionalPrisma();
  if (!prisma) {
    return apiError('INTERNAL_ERROR', 503, '数据库不可用，无法读取课程列表');
  }

  const { searchParams } = new URL(request.url);
  const query = normalizeSearch(searchParams.get('query'));
  const take = normalizeTake(searchParams.get('take'));

  const where: Prisma.CourseWhereInput = query
    ? {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { courseCode: { contains: query, mode: 'insensitive' } },
          { university: { contains: query, mode: 'insensitive' } },
          { owner: { email: { contains: query, mode: 'insensitive' } } },
          { owner: { name: { contains: query, mode: 'insensitive' } } },
        ],
      }
    : {};

  try {
    const [courses, totalCount] = await Promise.all([
      prisma.course.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        take,
        select: {
          id: true,
          ownerId: true,
          name: true,
          description: true,
          purpose: true,
          university: true,
          courseCode: true,
          avatarUrl: true,
          listedInCourseStore: true,
          coursePriceCents: true,
          storePublishedAt: true,
          sourceCourseId: true,
          notebookCount: true,
          sceneCount: true,
          problemCount: true,
          publishedProblemCount: true,
          speechReadyCount: true,
          speechTotalCount: true,
          createdAt: true,
          updatedAt: true,
          owner: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          _count: {
            select: {
              notebooks: true,
              notebookPages: true,
              markdownSections: true,
              problems: true,
              enrollments: true,
              sourcePurchases: true,
              reviews: true,
              conversations: true,
              studyMemories: true,
            },
          },
        },
      }),
      prisma.course.count({ where }),
    ]);

    return apiSuccess({
      totalCount,
      courses: courses.map((course) => ({
        id: course.id,
        ownerId: course.ownerId,
        name: course.name,
        description: course.description,
        purpose: course.purpose,
        university: course.university,
        courseCode: course.courseCode,
        avatarUrl: course.avatarUrl,
        listedInCourseStore: course.listedInCourseStore,
        coursePriceCents: course.coursePriceCents,
        storePublishedAt: course.storePublishedAt,
        sourceCourseId: course.sourceCourseId,
        notebookCount: course.notebookCount,
        sceneCount: course.sceneCount,
        problemCount: course.problemCount,
        publishedProblemCount: course.publishedProblemCount,
        speechReadyCount: course.speechReadyCount,
        speechTotalCount: course.speechTotalCount,
        createdAt: course.createdAt,
        updatedAt: course.updatedAt,
        owner: course.owner,
        counts: course._count,
      })),
    });
  } catch (error) {
    return apiError('INTERNAL_ERROR', 500, error instanceof Error ? error.message : String(error));
  }
}
