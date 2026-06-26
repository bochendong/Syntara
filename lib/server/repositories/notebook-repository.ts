import { Prisma } from '@/lib/server/generated-prisma';
import { summarizeSpeechScriptReadinessFromScenes } from '@/lib/audio/speech-readiness-summary';
import type { DbClient, RootDbClient } from '@/lib/server/repositories/types';
import { findCourseAccessRole } from '@/lib/server/repositories/course-enrollment-repository';
import type { Action } from '@/lib/types/action';

export type CreateOwnedNotebookData = Omit<
  Prisma.NotebookUncheckedCreateInput,
  'ownerId' | 'createdAt' | 'updatedAt'
>;

export type UpdateOwnedNotebookData = Omit<
  Prisma.NotebookUncheckedUpdateManyInput,
  'id' | 'ownerId' | 'createdAt' | 'updatedAt'
>;

export type ReplaceNotebookSceneData = Omit<Prisma.SceneCreateManyInput, 'notebookId'>;

export type ReplaceMarkdownNotebookSectionData = Omit<
  Prisma.MarkdownNotebookSectionCreateManyInput,
  'notebookId' | 'courseId'
>;

type ReplaceMarkdownNotebookSectionOptions = {
  preserveScenes?: boolean;
  notebookKind?: 'image' | 'markdown';
};

type NotebookSceneMetadataInput = Pick<ReplaceNotebookSceneData, 'content' | 'actions' | 'order'>;

type NotebookSceneMetadataSummary = {
  sceneCount: number;
  speechReadyCount: number;
  speechTotalCount: number;
  speechStatus: string;
  coverSlideJson: Prisma.InputJsonValue | null;
  coverImagePath: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isPreviewableImageSrc(src: unknown): src is string {
  const value = typeof src === 'string' ? src.trim() : '';
  return value.startsWith('/') || value.startsWith('http://') || value.startsWith('https://');
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function imageArea(image: Record<string, unknown>): number {
  return toFiniteNumber(image.width, 0) * toFiniteNumber(image.height, 0);
}

function findCoverSlideJson(
  scenes: NotebookSceneMetadataInput[],
): Pick<NotebookSceneMetadataSummary, 'coverSlideJson' | 'coverImagePath'> {
  const orderedScenes = [...scenes].sort((a, b) => Number(a.order) - Number(b.order));

  for (const scene of orderedScenes) {
    const content = scene.content as unknown;
    if (!isRecord(content) || content.type !== 'slide') continue;
    if (!isRecord(content.canvas)) continue;

    const canvas = content.canvas;
    const elements = Array.isArray(canvas.elements) ? canvas.elements : [];
    const image = elements
      .filter(isRecord)
      .filter((element) => element.type === 'image' && isPreviewableImageSrc(element.src))
      .sort((a, b) => imageArea(b) - imageArea(a))[0];
    if (!image) continue;

    return {
      coverSlideJson: {
        id: typeof canvas.id === 'string' ? canvas.id : 'cover-preview',
        type: 'content',
        theme: {
          fontName: 'Inter',
          fontColor: '#0f172a',
          themeColors: ['#0f766e', '#334155', '#a16207', '#0f172a'],
          backgroundColor: '#ffffff',
        },
        background: { type: 'solid', color: '#ffffff' },
        viewportSize: toFiniteNumber(canvas.viewportSize, 1000),
        viewportRatio: toFiniteNumber(canvas.viewportRatio, 1.777777777777778),
        elements: [image],
      } as Prisma.InputJsonValue,
      coverImagePath: typeof image.src === 'string' ? image.src : null,
    };
  }

  return { coverSlideJson: null, coverImagePath: null };
}

export function summarizeNotebookScenesForMetadata(
  scenes: NotebookSceneMetadataInput[],
): NotebookSceneMetadataSummary {
  const speech = summarizeSpeechScriptReadinessFromScenes(
    scenes.map((scene) => ({
      actions: (Array.isArray(scene.actions) ? scene.actions : undefined) as Action[] | undefined,
    })),
  );
  const cover = findCoverSlideJson(scenes);
  return {
    sceneCount: scenes.length,
    speechReadyCount: speech.ready,
    speechTotalCount: speech.total,
    speechStatus: speech.status,
    ...cover,
  };
}

export async function refreshCourseSummaryFields(db: DbClient, courseId: string) {
  const notebookAggregate = await db.notebook.aggregate({
    where: { courseId },
    _count: { _all: true },
    _sum: {
      sceneCount: true,
      speechReadyCount: true,
      speechTotalCount: true,
    },
  });
  const [problemCount, publishedProblemCount] = await Promise.all([
    db.notebookProblem.count({
      where: { OR: [{ courseId }, { notebook: { courseId } }] },
    }),
    db.notebookProblem.count({
      where: {
        status: 'published',
        OR: [{ courseId }, { notebook: { courseId } }],
      },
    }),
  ]);

  await db.course.updateMany({
    where: { id: courseId },
    data: {
      notebookCount: notebookAggregate._count._all,
      sceneCount: notebookAggregate._sum.sceneCount ?? 0,
      problemCount,
      publishedProblemCount,
      speechReadyCount: notebookAggregate._sum.speechReadyCount ?? 0,
      speechTotalCount: notebookAggregate._sum.speechTotalCount ?? 0,
    },
  });
}

const notebookListSelect = {
  id: true,
  ownerId: true,
  courseId: true,
  name: true,
  description: true,
  tags: true,
  avatarUrl: true,
  language: true,
  style: true,
  notebookKind: true,
  listedInNotebookStore: true,
  notebookPriceCents: true,
  storePublishedAt: true,
  sourceNotebookId: true,
  sceneCount: true,
  sectionCount: true,
  problemCount: true,
  publishedProblemCount: true,
  speechReadyCount: true,
  speechTotalCount: true,
  speechStatus: true,
  contentVersion: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.NotebookSelect;

export function listOwnedNotebooks(db: DbClient, userId: string, courseId?: string) {
  return db.notebook.findMany({
    where: {
      ownerId: userId,
      ...(courseId ? { courseId } : {}),
    },
    select: notebookListSelect,
    orderBy: { updatedAt: 'desc' },
  });
}

export async function listReadableNotebooks(db: DbClient, userId: string, courseId?: string) {
  if (!courseId) return listOwnedNotebooks(db, userId);
  const accessRole = await findCourseAccessRole(db, userId, courseId);
  if (!accessRole) return [];
  return db.notebook.findMany({
    where: { courseId },
    select: notebookListSelect,
    orderBy: { updatedAt: 'desc' },
  });
}

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

export async function listReadableNotebooksWithSpeechActions(
  db: DbClient,
  userId: string,
  courseId?: string,
) {
  if (!courseId) return listOwnedNotebooksWithSpeechActions(db, userId);
  const accessRole = await findCourseAccessRole(db, userId, courseId);
  if (!accessRole) return [];
  return db.notebook.findMany({
    where: { courseId },
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

export async function findReadableNotebook(db: DbClient, userId: string, notebookId: string) {
  const notebook = await db.notebook.findUnique({
    where: { id: notebookId },
  });
  if (!notebook) return null;
  if (notebook.ownerId === userId) return notebook;
  if (!notebook.courseId) return null;
  const accessRole = await findCourseAccessRole(db, userId, notebook.courseId);
  return accessRole ? notebook : null;
}

export async function findReadableNotebookWithMarkdownSections(
  db: DbClient,
  userId: string,
  notebookId: string,
) {
  const notebook = await db.notebook.findUnique({
    where: { id: notebookId },
    include: {
      markdownSections: {
        orderBy: { order: 'asc' },
      },
    },
  });
  if (!notebook) return null;
  if (notebook.ownerId === userId) return notebook;
  if (!notebook.courseId) return null;
  const accessRole = await findCourseAccessRole(db, userId, notebook.courseId);
  return accessRole ? notebook : null;
}

export async function findReadableNotebookWithScenes(
  db: DbClient,
  userId: string,
  notebookId: string,
) {
  const notebook = await db.notebook.findUnique({
    where: { id: notebookId },
    include: {
      course: { select: { id: true } },
      scenes: {
        orderBy: { order: 'asc' },
      },
      markdownSections: {
        orderBy: { order: 'asc' },
      },
    },
  });
  if (!notebook) return null;
  if (notebook.ownerId === userId) return notebook;
  if (!notebook.courseId) return null;
  const accessRole = await findCourseAccessRole(db, userId, notebook.courseId);
  return accessRole ? notebook : null;
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
    select: { id: true, courseId: true },
  });
}

export async function findReadableNotebookId(db: DbClient, userId: string, notebookId: string) {
  const notebook = await db.notebook.findUnique({
    where: { id: notebookId },
    select: { id: true, ownerId: true, courseId: true },
  });
  if (!notebook) return null;
  if (notebook.ownerId === userId) return { id: notebook.id };
  if (!notebook.courseId) return null;
  const accessRole = await findCourseAccessRole(db, userId, notebook.courseId);
  return accessRole ? { id: notebook.id } : null;
}

export async function createOwnedNotebook(
  db: DbClient,
  userId: string,
  data: CreateOwnedNotebookData,
) {
  const notebook = await db.notebook.create({
    data: {
      ownerId: userId,
      ...data,
    },
  });
  if (notebook.courseId) {
    await refreshCourseSummaryFields(db, notebook.courseId);
  }
  return notebook;
}

export async function updateOwnedNotebook(
  db: DbClient,
  userId: string,
  notebookId: string,
  data: UpdateOwnedNotebookData,
) {
  const current = await db.notebook.findFirst({
    where: { id: notebookId, ownerId: userId },
    select: { courseId: true },
  });
  if (!current) return null;
  const result = await db.notebook.updateMany({
    where: { id: notebookId, ownerId: userId },
    data,
  });
  if (result.count === 0) return null;
  const updated = await db.notebook.findFirst({
    where: { id: notebookId, ownerId: userId },
  });
  const courseIds = Array.from(
    new Set(
      [current.courseId, updated?.courseId].filter((value): value is string => Boolean(value)),
    ),
  );
  for (const courseId of courseIds) {
    await refreshCourseSummaryFields(db, courseId);
  }
  return updated;
}

export async function deleteOwnedNotebook(db: RootDbClient, userId: string, notebookId: string) {
  const notebook = await db.notebook.findFirst({
    where: { id: notebookId, ownerId: userId },
    select: { id: true, courseId: true },
  });
  if (!notebook) return null;

  await db.$transaction(async (tx) => {
    await tx.conversation.deleteMany({
      where: {
        ownerId: userId,
        OR: [{ notebookId }, { kind: 'notebook', targetId: notebookId }],
      },
    });
    await tx.notebook.deleteMany({ where: { id: notebookId, ownerId: userId } });
    if (notebook.courseId) {
      await refreshCourseSummaryFields(tx, notebook.courseId);
    }
  });
  return { id: notebook.id };
}

export function listNotebookScenes(db: DbClient, notebookId: string) {
  return db.scene.findMany({
    where: { notebookId },
    orderBy: { order: 'asc' },
  });
}

export function listMarkdownNotebookSections(db: DbClient, notebookId: string) {
  return db.markdownNotebookSection.findMany({
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

  const summary = summarizeNotebookScenesForMetadata(scenes);

  await db.$transaction(async (tx) => {
    await tx.scene.deleteMany({ where: { notebookId } });
    await tx.scene.createMany({
      data: scenes.map((scene) => ({
        ...scene,
        notebookId,
      })),
    });
    await tx.notebook.update({
      where: { id: notebookId },
      data: {
        notebookKind: 'image',
        sceneCount: summary.sceneCount,
        speechReadyCount: summary.speechReadyCount,
        speechTotalCount: summary.speechTotalCount,
        speechStatus: summary.speechStatus,
        coverSlideJson: summary.coverSlideJson ?? Prisma.DbNull,
        coverImagePath: summary.coverImagePath,
        contentVersion: { increment: 1 },
        updatedAt: new Date(),
      },
    });
    if (notebook.courseId) {
      await refreshCourseSummaryFields(tx, notebook.courseId);
    }
  });

  return listNotebookScenes(db, notebookId);
}

export async function replaceOwnedMarkdownNotebookSections(
  db: RootDbClient,
  userId: string,
  notebookId: string,
  sections: ReplaceMarkdownNotebookSectionData[],
  options: ReplaceMarkdownNotebookSectionOptions = {},
) {
  const notebook = await findOwnedNotebookId(db, userId, notebookId);
  if (!notebook) return null;

  await db.$transaction(async (tx) => {
    if (!options.preserveScenes) {
      await tx.scene.deleteMany({ where: { notebookId } });
    }
    await tx.markdownNotebookSection.deleteMany({ where: { notebookId } });
    if (sections.length > 0) {
      await tx.markdownNotebookSection.createMany({
        data: sections.map((section) => ({
          ...section,
          notebookId,
          courseId: notebook.courseId,
        })),
      });
    }
    await tx.notebook.update({
      where: { id: notebookId },
      data: {
        notebookKind: options.notebookKind ?? 'markdown',
        ...(options.preserveScenes ? {} : { sceneCount: sections.length }),
        sectionCount: sections.length,
        ...(options.preserveScenes
          ? {}
          : {
              speechReadyCount: 0,
              speechTotalCount: 0,
              speechStatus: 'no_speech',
              coverSlideJson: Prisma.DbNull,
              coverImagePath: null,
            }),
        contentVersion: { increment: 1 },
        updatedAt: new Date(),
      },
    });
    if (notebook.courseId) {
      await refreshCourseSummaryFields(tx, notebook.courseId);
    }
  });

  return listMarkdownNotebookSections(db, notebookId);
}
