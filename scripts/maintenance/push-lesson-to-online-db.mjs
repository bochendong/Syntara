#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const PUBLIC_GENERATED_NOTEBOOKS_ROOT = path.resolve(ROOT, 'public', 'generated-notebooks');
const DEFAULT_SOURCE_ENV = 'DATABASE_URL';
const DEFAULT_TARGET_ENV_CANDIDATES = [
  'ONLINE_DATABASE_URL',
  'PRODUCTION_DATABASE_URL',
  'VERCEL_DATABASE_URL',
  'TARGET_DATABASE_URL',
];
const DEFAULT_MAX_BYTES = 128 * 1024 * 1024;
const ASSET_BATCH_SIZE = 50;

const IMAGE_MIME_BY_EXTENSION = {
  '.avif': 'image/avif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function usage() {
  console.log(`Usage:
  pnpm notebooks:push-lesson -- --notebook-id <id>

Options:
  --notebook-id <id>             Required. Source notebook/lesson id to copy.
  --target-course-id <id>        Target course id. Defaults to the source notebook courseId.
  --target-owner-id <id>         Target owner id. Defaults to target course owner.
  --source-env <name>            Source DB env var. Default: DATABASE_URL.
  --target-env <name>            Target DB env var. Default: first of ONLINE_DATABASE_URL,
                                 PRODUCTION_DATABASE_URL, VERCEL_DATABASE_URL, TARGET_DATABASE_URL.
  --env-file <path>              Extra env file to load. Can be repeated.
  --max-bytes <bytes>            Max image asset size to copy. Default: ${DEFAULT_MAX_BYTES}.
  --dry-run                      Inspect and report without writing target DB.
  --allow-same-database          Allow source and target URLs to be identical.
  --allow-missing-assets         Write lesson even if referenced image assets are missing.

The script copies notebook metadata, scenes, markdown sections, and referenced
/generated-notebooks image assets. It intentionally does not copy problems,
conversations, study memories, purchases, reviews, or user speech audio.`);
}

function parseArgs(argv) {
  const args = {
    envFiles: [],
    dryRun: false,
    allowSameDatabase: false,
    allowMissingAssets: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${arg}`);
      }
      index += 1;
      return value;
    };
    const readValue = (name) => {
      const prefix = `--${name}=`;
      if (arg.startsWith(prefix)) return arg.slice(prefix.length);
      return nextValue();
    };

    if (arg === '--') {
      continue;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--allow-same-database') {
      args.allowSameDatabase = true;
    } else if (arg === '--allow-missing-assets') {
      args.allowMissingAssets = true;
    } else if (arg === '--notebook-id' || arg.startsWith('--notebook-id=')) {
      args.notebookId = readValue('notebook-id');
    } else if (arg === '--target-course-id' || arg.startsWith('--target-course-id=')) {
      args.targetCourseId = readValue('target-course-id');
    } else if (arg === '--target-owner-id' || arg.startsWith('--target-owner-id=')) {
      args.targetOwnerId = readValue('target-owner-id');
    } else if (arg === '--source-env' || arg.startsWith('--source-env=')) {
      args.sourceEnv = readValue('source-env');
    } else if (arg === '--target-env' || arg.startsWith('--target-env=')) {
      args.targetEnv = readValue('target-env');
    } else if (arg === '--env-file' || arg.startsWith('--env-file=')) {
      args.envFiles.push(readValue('env-file'));
    } else if (arg === '--max-bytes' || arg.startsWith('--max-bytes=')) {
      args.maxBytes = Number(readValue('max-bytes'));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function parseEnvLine(line) {
  const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!match || match[1].startsWith('#')) return null;
  let value = match[2].trim();
  const commentIndex = value.search(/\s+#/);
  if (commentIndex >= 0) value = value.slice(0, commentIndex).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return [match[1], value];
}

function loadEnvFiles(extraFiles) {
  for (const filePath of ['.env', '.env.local', ...extraFiles]) {
    const resolved = path.resolve(ROOT, filePath);
    if (!fs.existsSync(resolved)) continue;
    for (const line of fs.readFileSync(resolved, 'utf8').split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;
      const [key, value] = parsed;
      process.env[key] ??= value;
    }
  }
}

function requiredEnv(name, label) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${label} env var ${name} is not configured.`);
  return value;
}

function chooseTargetEnv(explicitName) {
  if (explicitName) return explicitName;
  return DEFAULT_TARGET_ENV_CANDIDATES.find((name) => process.env[name]?.trim());
}

function normalizeDatabaseUrl(url) {
  return url.trim().replace(/\/+$/, '');
}

function mimeTypeForPath(filePath) {
  return (
    IMAGE_MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
  );
}

function publicPathFromGeneratedUrl(value) {
  let pathname = String(value || '').trim();
  try {
    pathname = new URL(pathname).pathname;
  } catch {
    // Keep already-relative paths.
  }
  const withoutQuery = pathname.split(/[?#]/)[0];
  if (!withoutQuery.startsWith('/generated-notebooks/')) return null;
  try {
    return decodeURIComponent(withoutQuery);
  } catch {
    return withoutQuery;
  }
}

function localFilePathForPublicPath(publicPath) {
  if (!publicPath.startsWith('/generated-notebooks/')) return null;
  const relativePath = publicPath.slice('/generated-notebooks/'.length);
  const resolvedPath = path.resolve(PUBLIC_GENERATED_NOTEBOOKS_ROOT, relativePath);
  const rootWithSeparator = `${PUBLIC_GENERATED_NOTEBOOKS_ROOT}${path.sep}`;
  if (
    resolvedPath !== PUBLIC_GENERATED_NOTEBOOKS_ROOT &&
    !resolvedPath.startsWith(rootWithSeparator)
  ) {
    return null;
  }
  return resolvedPath;
}

function collectGeneratedNotebookPaths(value, paths = new Set()) {
  if (value == null) return paths;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  for (const match of text.matchAll(/\/generated-notebooks\/[^"'\\\s)]+/g)) {
    const publicPath = publicPathFromGeneratedUrl(match[0]);
    if (publicPath && /\.(png|jpe?g|webp|avif)$/i.test(publicPath)) {
      paths.add(publicPath);
    }
  }
  return paths;
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function createPrisma(url) {
  return new PrismaClient({
    datasources: { db: { url } },
    log: ['error'],
  });
}

async function ensureNotebookImageAssetTable(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "NotebookImageAsset" (
      "id" TEXT PRIMARY KEY,
      "path" TEXT NOT NULL UNIQUE,
      "mimeType" TEXT NOT NULL,
      "data" BYTEA NOT NULL,
      "sizeBytes" INTEGER NOT NULL,
      "sha256" TEXT NOT NULL,
      "source" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "NotebookImageAsset_sha256_idx" ON "NotebookImageAsset"("sha256")',
  );
}

async function readExistingTargetAssets(prisma, paths) {
  const existing = new Map();
  for (const group of chunk(paths, ASSET_BATCH_SIZE)) {
    const rows = await prisma.$queryRaw`
      SELECT "path", "sizeBytes", "sha256"
      FROM "NotebookImageAsset"
      WHERE "path" IN (${Prisma.join(group)})
    `;
    for (const row of rows) {
      existing.set(row.path, {
        sizeBytes: Number(row.sizeBytes),
        sha256: row.sha256,
      });
    }
  }
  return existing;
}

async function readSourceAssets(prisma, paths) {
  const assets = new Map();
  for (const group of chunk(paths, ASSET_BATCH_SIZE)) {
    const rows = await prisma.$queryRaw`
      SELECT "path", "mimeType", "data", "sizeBytes", "sha256"
      FROM "NotebookImageAsset"
      WHERE "path" IN (${Prisma.join(group)})
    `;
    for (const row of rows) {
      assets.set(row.path, {
        path: row.path,
        mimeType: row.mimeType,
        data: Buffer.from(row.data),
        sizeBytes: Number(row.sizeBytes),
        sha256: row.sha256,
        source: 'source-db',
      });
    }
  }
  return assets;
}

function readLocalAsset(publicPath) {
  const filePath = localFilePathForPublicPath(publicPath);
  if (!filePath || !fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) return null;
  const data = fs.readFileSync(filePath);
  return {
    path: publicPath,
    mimeType: mimeTypeForPath(filePath),
    data,
    sizeBytes: stat.size,
    sha256: crypto.createHash('sha256').update(data).digest('hex'),
    source: 'public/generated-notebooks',
  };
}

async function upsertTargetAsset(prisma, asset) {
  const id = crypto.randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "NotebookImageAsset" (
      "id",
      "path",
      "mimeType",
      "data",
      "sizeBytes",
      "sha256",
      "source",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${id},
      ${asset.path},
      ${asset.mimeType},
      ${asset.data},
      ${asset.sizeBytes},
      ${asset.sha256},
      ${asset.source},
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT ("path") DO UPDATE SET
      "mimeType" = EXCLUDED."mimeType",
      "data" = EXCLUDED."data",
      "sizeBytes" = EXCLUDED."sizeBytes",
      "sha256" = EXCLUDED."sha256",
      "source" = EXCLUDED."source",
      "updatedAt" = CURRENT_TIMESTAMP
  `;
}

function sceneCreateData(scene, notebookId) {
  return {
    id: scene.id,
    notebookId,
    title: scene.title,
    type: scene.type,
    order: scene.order,
    content: scene.content,
    actions: scene.actions,
    whiteboard: scene.whiteboard,
    createdAt: scene.createdAt,
    updatedAt: scene.updatedAt,
  };
}

function sectionCreateData(section, notebookId, courseId) {
  return {
    id: section.id,
    notebookId,
    courseId,
    title: section.title,
    order: section.order,
    markdown: section.markdown,
    summary: section.summary,
    sourceMeta: section.sourceMeta,
    createdAt: section.createdAt,
    updatedAt: section.updatedAt,
  };
}

function notebookWriteData(notebook, ownerId, courseId, sceneCount, sectionCount) {
  return {
    ownerId,
    courseId,
    name: notebook.name,
    description: notebook.description,
    tags: notebook.tags,
    avatarUrl: notebook.avatarUrl,
    language: notebook.language,
    style: notebook.style,
    notebookKind: notebook.notebookKind,
    listedInNotebookStore: notebook.listedInNotebookStore,
    notebookPriceCents: notebook.notebookPriceCents,
    storePublishedAt: notebook.storePublishedAt,
    sourceNotebookId: notebook.sourceNotebookId,
    sceneCount,
    sectionCount,
    speechReadyCount: notebook.speechReadyCount,
    speechTotalCount: notebook.speechTotalCount,
    speechStatus: notebook.speechStatus,
    coverSlideJson: notebook.coverSlideJson,
    coverImagePath: notebook.coverImagePath,
    contentVersion: notebook.contentVersion + 1,
    updatedAt: new Date(),
  };
}

async function refreshTargetCourseSummary(prisma, courseId) {
  if (!courseId) return;
  const notebookAggregate = await prisma.notebook.aggregate({
    where: { courseId },
    _count: { _all: true },
    _sum: {
      sceneCount: true,
      speechReadyCount: true,
      speechTotalCount: true,
    },
  });
  const [problemCount, publishedProblemCount] = await Promise.all([
    prisma.notebookProblem.count({
      where: { OR: [{ courseId }, { notebook: { courseId } }] },
    }),
    prisma.notebookProblem.count({
      where: {
        status: 'published',
        OR: [{ courseId }, { notebook: { courseId } }],
      },
    }),
  ]);

  await prisma.course.update({
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

async function copyLesson(args) {
  if (!args.notebookId?.trim()) {
    throw new Error('Missing required --notebook-id.');
  }
  if (args.maxBytes != null && (!Number.isFinite(args.maxBytes) || args.maxBytes <= 0)) {
    throw new Error('--max-bytes must be a positive number.');
  }

  loadEnvFiles(args.envFiles);
  const sourceEnv = args.sourceEnv || DEFAULT_SOURCE_ENV;
  const targetEnv = chooseTargetEnv(args.targetEnv);
  if (!targetEnv) {
    throw new Error(
      `No online target database is configured. Add ONLINE_DATABASE_URL to .env.local or pass --target-env. Tried: ${DEFAULT_TARGET_ENV_CANDIDATES.join(', ')}.`,
    );
  }

  const sourceUrl = requiredEnv(sourceEnv, 'Source database');
  const targetUrl = requiredEnv(targetEnv, 'Target database');
  if (
    !args.allowSameDatabase &&
    normalizeDatabaseUrl(sourceUrl) === normalizeDatabaseUrl(targetUrl)
  ) {
    throw new Error(
      `Source ${sourceEnv} and target ${targetEnv} point to the same database. Refusing to inject into itself.`,
    );
  }

  const maxBytes = args.maxBytes || DEFAULT_MAX_BYTES;
  const source = createPrisma(sourceUrl);
  const target = createPrisma(targetUrl);

  try {
    const notebook = await source.notebook.findUnique({
      where: { id: args.notebookId },
      include: {
        scenes: { orderBy: { order: 'asc' } },
        markdownSections: { orderBy: { order: 'asc' } },
      },
    });
    if (!notebook) throw new Error(`Source notebook not found: ${args.notebookId}`);

    const targetCourseId =
      args.targetCourseId === 'null' ? null : args.targetCourseId || notebook.courseId;
    const targetCourse = targetCourseId
      ? await target.course.findUnique({
          where: { id: targetCourseId },
          select: { id: true, ownerId: true },
        })
      : null;
    if (targetCourseId && !targetCourse) {
      throw new Error(
        `Target course ${targetCourseId} does not exist. Create it first or pass --target-course-id null.`,
      );
    }

    const targetOwnerId = args.targetOwnerId || targetCourse?.ownerId || notebook.ownerId;
    const targetOwner = await target.user.findUnique({
      where: { id: targetOwnerId },
      select: { id: true },
    });
    if (!targetOwner) {
      throw new Error(
        `Target owner ${targetOwnerId} does not exist. Pass --target-owner-id with a user id from the online DB.`,
      );
    }

    const referencedPaths = new Set();
    collectGeneratedNotebookPaths(notebook.avatarUrl, referencedPaths);
    collectGeneratedNotebookPaths(notebook.coverImagePath, referencedPaths);
    collectGeneratedNotebookPaths(notebook.coverSlideJson, referencedPaths);
    for (const scene of notebook.scenes) {
      collectGeneratedNotebookPaths(scene.content, referencedPaths);
      collectGeneratedNotebookPaths(scene.actions, referencedPaths);
      collectGeneratedNotebookPaths(scene.whiteboard, referencedPaths);
    }
    for (const section of notebook.markdownSections) {
      collectGeneratedNotebookPaths(section.markdown, referencedPaths);
      collectGeneratedNotebookPaths(section.sourceMeta, referencedPaths);
    }
    const assetPaths = [...referencedPaths].sort();

    await ensureNotebookImageAssetTable(target);
    const [sourceAssets, existingTargetAssets] = await Promise.all([
      readSourceAssets(source, assetPaths),
      readExistingTargetAssets(target, assetPaths),
    ]);

    const assetStats = {
      referenced: assetPaths.length,
      copied: 0,
      skippedUnchanged: 0,
      missing: 0,
      skippedTooLarge: 0,
      totalBytes: 0,
    };
    const missingPaths = [];

    for (const assetPath of assetPaths) {
      const sourceAsset = sourceAssets.get(assetPath) || readLocalAsset(assetPath);
      if (!sourceAsset) {
        assetStats.missing += 1;
        missingPaths.push(assetPath);
        continue;
      }
      if (sourceAsset.sizeBytes > maxBytes) {
        assetStats.skippedTooLarge += 1;
        continue;
      }
      const existing = existingTargetAssets.get(assetPath);
      if (
        existing &&
        existing.sha256 === sourceAsset.sha256 &&
        existing.sizeBytes === sourceAsset.sizeBytes
      ) {
        assetStats.skippedUnchanged += 1;
        continue;
      }
      assetStats.copied += 1;
      assetStats.totalBytes += sourceAsset.sizeBytes;
      if (!args.dryRun) {
        await upsertTargetAsset(target, sourceAsset);
      }
    }

    const hasAssetProblems = assetStats.missing > 0 || assetStats.skippedTooLarge > 0;
    if (hasAssetProblems && !args.dryRun && !args.allowMissingAssets) {
      throw new Error(
        `Refusing to write lesson because ${assetStats.missing} assets are missing and ${assetStats.skippedTooLarge} are too large. Re-run with --dry-run to inspect, or --allow-missing-assets to force.`,
      );
    }

    const sceneData = notebook.scenes.map((scene) => sceneCreateData(scene, notebook.id));
    const sectionData = notebook.markdownSections.map((section) =>
      sectionCreateData(section, notebook.id, targetCourseId),
    );
    const writeData = notebookWriteData(
      notebook,
      targetOwnerId,
      targetCourseId,
      sceneData.length,
      sectionData.length,
    );

    if (!args.dryRun) {
      await target.$transaction(async (tx) => {
        await tx.scene.deleteMany({ where: { notebookId: notebook.id } });
        await tx.markdownNotebookSection.deleteMany({ where: { notebookId: notebook.id } });
        await tx.notebook.upsert({
          where: { id: notebook.id },
          update: writeData,
          create: {
            id: notebook.id,
            createdAt: notebook.createdAt,
            ...writeData,
          },
        });
        if (sceneData.length) {
          await tx.scene.createMany({ data: sceneData });
        }
        if (sectionData.length) {
          await tx.markdownNotebookSection.createMany({ data: sectionData });
        }
      });
      await refreshTargetCourseSummary(target, targetCourseId);
    }

    console.log(
      JSON.stringify(
        {
          dryRun: args.dryRun,
          notebook: {
            id: notebook.id,
            name: notebook.name,
            notebookKind: notebook.notebookKind,
            sourceCourseId: notebook.courseId,
            targetCourseId,
            targetOwnerId,
            scenes: sceneData.length,
            markdownSections: sectionData.length,
          },
          assets: {
            ...assetStats,
            totalMegabytes: Math.round((assetStats.totalBytes / 1024 / 1024) * 10) / 10,
            missingPreview: missingPaths.slice(0, 10),
            allowMissingAssets: args.allowMissingAssets,
          },
          targetEnv,
        },
        null,
        2,
      ),
    );

    if (assetStats.missing > 0 || assetStats.skippedTooLarge > 0) {
      process.exitCode = 2;
    }
  } finally {
    await Promise.allSettled([source.$disconnect(), target.$disconnect()]);
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
  } else {
    await copyLesson(args);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error('');
  usage();
  process.exit(1);
}
