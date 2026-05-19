import type { Prisma } from '@/lib/server/generated-prisma';
import type { DbClient, RootDbClient } from '@/lib/server/repositories/types';

export type CreateOwnedNotebookData = Omit<
  Prisma.NotebookUncheckedCreateInput,
  'ownerId' | 'createdAt' | 'updatedAt'
>;

export type UpdateOwnedNotebookData = Omit<
  Prisma.NotebookUncheckedUpdateManyInput,
  'id' | 'ownerId' | 'createdAt' | 'updatedAt'
>;

export type ReplaceNotebookSceneData = Omit<Prisma.SceneCreateManyInput, 'notebookId'>;

export function listOwnedNotebooksWithSpeechActions(
  db: DbClient,
  userId: string,
  courseId?: string,
) {
  return db.notebook.findMany({
    where: {
      ownerId: userId,
      ...(courseId ? { courseId } : {}),
    },
    include: {
      _count: {
        select: { scenes: true },
      },
      scenes: {
        select: { actions: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export function findNotebookOwner(db: DbClient, notebookId: string) {
  return db.notebook.findFirst({
    where: { id: notebookId },
    select: { id: true, ownerId: true },
  });
}

export function findOwnedNotebookWithScenes(db: DbClient, userId: string, notebookId: string) {
  return db.notebook.findFirst({
    where: { id: notebookId, ownerId: userId },
    include: {
      scenes: {
        orderBy: { order: 'asc' },
      },
    },
  });
}

export function findOwnedNotebookForStoreUpdate(db: DbClient, userId: string, notebookId: string) {
  return db.notebook.findFirst({
    where: { id: notebookId, ownerId: userId },
    select: { id: true, sourceNotebookId: true },
  });
}

export function findOwnedNotebookId(db: DbClient, userId: string, notebookId: string) {
  return db.notebook.findFirst({
    where: { id: notebookId, ownerId: userId },
    select: { id: true },
  });
}

export function createOwnedNotebook(db: DbClient, userId: string, data: CreateOwnedNotebookData) {
  return db.notebook.create({
    data: {
      ownerId: userId,
      ...data,
    },
  });
}

export async function updateOwnedNotebook(
  db: DbClient,
  userId: string,
  notebookId: string,
  data: UpdateOwnedNotebookData,
) {
  const result = await db.notebook.updateMany({
    where: { id: notebookId, ownerId: userId },
    data,
  });
  if (result.count === 0) return null;
  return db.notebook.findFirst({
    where: { id: notebookId, ownerId: userId },
  });
}

export function deleteOwnedNotebook(db: DbClient, userId: string, notebookId: string) {
  return db.notebook.deleteMany({ where: { id: notebookId, ownerId: userId } });
}

export function listNotebookScenes(db: DbClient, notebookId: string) {
  return db.scene.findMany({
    where: { notebookId },
    orderBy: { order: 'asc' },
  });
}

export async function replaceOwnedNotebookScenes(
  db: RootDbClient,
  userId: string,
  notebookId: string,
  scenes: ReplaceNotebookSceneData[],
) {
  const notebook = await findOwnedNotebookId(db, userId, notebookId);
  if (!notebook) return null;

  await db.$transaction([
    db.scene.deleteMany({ where: { notebookId } }),
    db.scene.createMany({
      data: scenes.map((scene) => ({
        ...scene,
        notebookId,
      })),
    }),
    db.notebook.update({
      where: { id: notebookId },
      data: { updatedAt: new Date() },
    }),
  ]);

  return listNotebookScenes(db, notebookId);
}
