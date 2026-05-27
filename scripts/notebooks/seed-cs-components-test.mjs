#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
import { NOTEBOOK_ID, buildScenes } from './seed-cs-components-test-scenes.mjs';
import fs from 'node:fs';
import path from 'node:path';

const COURSE_ID = 'course-cs-components-test';
const COURSE_AVATAR = '/avatars/notebook-agents/avatar2.avif';
const NOTEBOOK_AVATAR = '/avatars/notebook-agents/avatar4.avif';

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
}

function buildUserId(email) {
  const normalized = String(email || '')
    .trim()
    .toLowerCase();
  if (!normalized) return 'user-anonymous';
  const safe = normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `user-${safe || 'anonymous'}`;
}

async function resolveOwner(prisma) {
  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const ownerName = process.env.OWNER_NAME?.trim() || 'CS Components Tester';

  if (ownerEmail) {
    const existing = await prisma.user.findUnique({
      where: { email: ownerEmail },
      select: { id: true, email: true, name: true },
    });
    const ownerId = existing?.id || buildUserId(ownerEmail);
    await prisma.user.upsert({
      where: { id: ownerId },
      create: {
        id: ownerId,
        email: ownerEmail,
        name: existing?.name || ownerName,
      },
      update: {
        email: ownerEmail,
        name: existing?.name || ownerName,
      },
    });
    return { id: ownerId, email: ownerEmail, name: existing?.name || ownerName };
  }

  const existingUser = await prisma.user.findFirst({
    orderBy: { updatedAt: 'desc' },
    select: { id: true, email: true, name: true },
  });
  if (existingUser) return existingUser;

  const fallbackEmail = 'cs-components@local.test';
  const fallbackId = buildUserId(fallbackEmail);
  await prisma.user.upsert({
    where: { id: fallbackId },
    create: {
      id: fallbackId,
      email: fallbackEmail,
      name: ownerName,
    },
    update: {
      email: fallbackEmail,
      name: ownerName,
    },
  });
  return { id: fallbackId, email: fallbackEmail, name: ownerName };
}

async function main() {
  loadEnvLocal();
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and configure it.');
  }

  const prisma = new PrismaClient();
  const now = new Date();
  const scenes = buildScenes();

  try {
    const owner = await resolveOwner(prisma);

    await prisma.course.upsert({
      where: { id: COURSE_ID },
      create: {
        id: COURSE_ID,
        ownerId: owner.id,
        name: 'CS Components Rendering Test',
        description:
          'A local test course for verifying code trace, memory model, call stack, linked list, tree, BST, stack, queue, dictionary, and invariant components.',
        language: 'zh-CN',
        tags: ['CS Components', 'Rendering Test', 'CSC148', 'Stack', 'Queue'],
        purpose: 'daily',
        avatarUrl: COURSE_AVATAR,
        listedInCourseStore: false,
        coursePriceCents: 0,
      },
      update: {
        ownerId: owner.id,
        name: 'CS Components Rendering Test',
        description:
          'A local test course for verifying code trace, memory model, call stack, linked list, tree, BST, stack, queue, dictionary, and invariant components.',
        language: 'zh-CN',
        tags: ['CS Components', 'Rendering Test', 'CSC148', 'Stack', 'Queue'],
        purpose: 'daily',
        avatarUrl: COURSE_AVATAR,
        listedInCourseStore: false,
        coursePriceCents: 0,
        updatedAt: now,
      },
    });

    await prisma.notebook.upsert({
      where: { id: NOTEBOOK_ID },
      create: {
        id: NOTEBOOK_ID,
        ownerId: owner.id,
        courseId: COURSE_ID,
        name: 'CS 组件渲染测试 PPT',
        description:
          '测试刚新增的 CS 专属组件：Trace、Memory、CallStack、LinkedList、Tree、BST、Stack、Queue、Dictionary、Invariant。',
        tags: [
          'Trace',
          'Memory',
          'CallStack',
          'LinkedList',
          'Tree',
          'BST',
          'Stack',
          'Queue',
          'Dictionary',
          'Invariant',
        ],
        avatarUrl: NOTEBOOK_AVATAR,
        language: 'zh-CN',
        style: 'cs-component-test',
        listedInNotebookStore: false,
        notebookPriceCents: 0,
      },
      update: {
        ownerId: owner.id,
        courseId: COURSE_ID,
        name: 'CS 组件渲染测试 PPT',
        description:
          '测试刚新增的 CS 专属组件：Trace、Memory、CallStack、LinkedList、Tree、BST、Stack、Queue、Dictionary、Invariant。',
        tags: [
          'Trace',
          'Memory',
          'CallStack',
          'LinkedList',
          'Tree',
          'BST',
          'Stack',
          'Queue',
          'Dictionary',
          'Invariant',
        ],
        avatarUrl: NOTEBOOK_AVATAR,
        language: 'zh-CN',
        style: 'cs-component-test',
        listedInNotebookStore: false,
        notebookPriceCents: 0,
        updatedAt: now,
      },
    });

    for (const scene of scenes) {
      await prisma.scene.upsert({
        where: { id: scene.id },
        create: {
          id: scene.id,
          notebookId: scene.notebookId,
          title: scene.title,
          type: scene.type,
          order: scene.order,
          content: scene.content,
          actions: scene.actions,
          whiteboard: scene.whiteboard,
        },
        update: {
          notebookId: scene.notebookId,
          title: scene.title,
          type: scene.type,
          order: scene.order,
          content: scene.content,
          actions: scene.actions,
          whiteboard: scene.whiteboard,
        },
      });
    }

    console.log('Seeded CS components test deck.');
    console.log(`Owner: ${owner.name || '-'} <${owner.email || '-'}> (${owner.id})`);
    console.log(`Course URL: /course/${COURSE_ID}`);
    console.log(`Notebook URL: /classroom/${NOTEBOOK_ID}`);
    console.log(`Scenes: ${scenes.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
