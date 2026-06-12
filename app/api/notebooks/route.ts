import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { toPrismaNullableJson } from '@/lib/server/prisma-json';
import { findOwnedCourse } from '@/lib/server/repositories/course-repository';
import {
  createOwnedNotebook,
  findNotebookOwner,
  findReadableNotebook,
  listReadableNotebooks,
  replaceOwnedMarkdownNotebookSections,
  updateOwnedNotebook,
} from '@/lib/server/repositories/notebook-repository';

const markdownSectionSchema = z.object({
  id: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).max(200),
  order: z.number().int().min(0),
  markdown: z.string().trim().min(1).max(250000),
  summary: z.string().trim().max(2000).optional(),
  sourceMeta: z.unknown().optional(),
});

const createNotebookSchema = z.object({
  /** 客户端生成（如 nanoid）的笔记本 id；不传则使用数据库默认 cuid */
  id: z.string().trim().min(8).max(64).optional(),
  courseId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(3000).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(16).default([]),
  avatarUrl: z.string().trim().max(2048).optional(),
  language: z.string().trim().max(24).optional(),
  style: z.string().trim().max(80).optional(),
  notebookKind: z.enum(['image', 'markdown']).default('image'),
  markdownSections: z.array(markdownSectionSchema).max(300).optional(),
  listedInNotebookStore: z.boolean().optional(),
  notebookPriceCents: z.number().int().min(0).max(100000000).optional(),
});

export async function GET(request: Request) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;

    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('courseId')?.trim();

    const notebooks = await listReadableNotebooks(prisma, userId, courseId);
    return NextResponse.json({ notebooks });
  });
}

export async function POST(request: Request) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;

    const rawBody = await request.json();
    const payload = createNotebookSchema.safeParse(rawBody);
    if (!payload.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: payload.error.flatten() },
        { status: 400 },
      );
    }

    const { id: clientId, markdownSections, ...rest } = payload.data;
    const hasExplicitNotebookKind =
      Boolean(rawBody) &&
      typeof rawBody === 'object' &&
      !Array.isArray(rawBody) &&
      Object.prototype.hasOwnProperty.call(rawBody, 'notebookKind');
    const notebookKind =
      !hasExplicitNotebookKind && markdownSections?.length ? 'markdown' : rest.notebookKind;

    if (rest.courseId) {
      const ownCourse = await findOwnedCourse(prisma, userId, rest.courseId);
      if (!ownCourse) {
        return NextResponse.json({ error: 'Course not found' }, { status: 404 });
      }
    }

    if (clientId) {
      const existing = await findNotebookOwner(prisma, clientId);
      if (existing) {
        if (existing.ownerId !== userId) {
          return NextResponse.json({ error: 'Notebook id already in use' }, { status: 409 });
        }
        let notebook = await updateOwnedNotebook(prisma, userId, clientId, {
          ...rest,
          notebookKind,
        });
        if (!notebook) {
          return NextResponse.json({ error: 'Notebook not found' }, { status: 404 });
        }
        if (markdownSections) {
          const sections = await replaceOwnedMarkdownNotebookSections(
            prisma,
            userId,
            clientId,
            markdownSections.map((section) => ({
              id: section.id,
              title: section.title,
              order: section.order,
              markdown: section.markdown,
              summary: section.summary,
              sourceMeta: toPrismaNullableJson(section.sourceMeta),
            })),
            {
              preserveScenes: notebookKind !== 'markdown',
              notebookKind,
            },
          );
          if (!sections) {
            return NextResponse.json({ error: 'Notebook not found' }, { status: 404 });
          }
          notebook = await findReadableNotebook(prisma, userId, clientId);
        }
        return NextResponse.json({ notebook });
      }
    }

    const notebook = await createOwnedNotebook(prisma, userId, {
      ...(clientId ? { id: clientId } : {}),
      ...rest,
      notebookKind,
    });
    if (markdownSections) {
      const sections = await replaceOwnedMarkdownNotebookSections(
        prisma,
        userId,
        notebook.id,
        markdownSections.map((section) => ({
          id: section.id,
          title: section.title,
          order: section.order,
          markdown: section.markdown,
          summary: section.summary,
          sourceMeta: toPrismaNullableJson(section.sourceMeta),
        })),
        {
          preserveScenes: notebookKind !== 'markdown',
          notebookKind,
        },
      );
      if (!sections) {
        return NextResponse.json({ error: 'Notebook not found' }, { status: 404 });
      }
      const refreshed = await findReadableNotebook(prisma, userId, notebook.id);
      return NextResponse.json({ notebook: refreshed }, { status: 201 });
    }

    return NextResponse.json({ notebook }, { status: 201 });
  });
}
