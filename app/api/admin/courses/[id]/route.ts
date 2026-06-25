import { apiError, apiSuccess } from '@/lib/server/api-response';
import { requireAdmin } from '@/lib/server/admin-auth';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if ('response' in admin) return admin.response;

  const prisma = getOptionalPrisma();
  if (!prisma) {
    return apiError('INTERNAL_ERROR', 503, '数据库不可用，无法删除课程');
  }

  const { id } = await context.params;

  try {
    const existing = await prisma.course.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        owner: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    if (!existing) {
      return apiError('INVALID_REQUEST', 404, '课程不存在');
    }

    await prisma.course.delete({
      where: { id },
    });

    return apiSuccess({
      deletedCourse: existing,
      deletedBy: {
        userId: admin.identity.userId,
        email: admin.identity.email ?? null,
      },
    });
  } catch (error) {
    return apiError('INTERNAL_ERROR', 500, error instanceof Error ? error.message : String(error));
  }
}
