#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const PUBLIC_GENERATED_NOTEBOOKS_ROOT = path.resolve(ROOT, 'public', 'generated-notebooks');
const DEFAULT_MAX_BYTES = 128 * 1024 * 1024;

const IMAGE_MIME_BY_EXTENSION = {
  '.avif': 'image/avif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function loadEnvLocal() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || match[1].startsWith('#')) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] ??= value;
  }
}

function argValue(name) {
  const prefix = `--${name}=`;
  const matched = process.argv.find((arg) => arg.startsWith(prefix));
  return matched ? matched.slice(prefix.length).trim() : null;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function mimeTypeForPath(filePath) {
  return (
    IMAGE_MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
  );
}

function publicPathFromGeneratedUrl(value) {
  let pathname = value.trim();
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

function collectGeneratedNotebookPathsFromJson(value) {
  const text = JSON.stringify(value ?? {});
  const matches = [...text.matchAll(/\/generated-notebooks\/[^"'\\\s)]+/g)];
  return matches
    .map((match) => publicPathFromGeneratedUrl(match[0]))
    .filter((item) => item && /\.(png|jpe?g|webp|avif)$/i.test(item));
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

async function upsertAsset(prisma, publicPath, filePath, fileStat) {
  const bytes = fs.readFileSync(filePath);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const mimeType = mimeTypeForPath(filePath);
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
      ${publicPath},
      ${mimeType},
      ${bytes},
      ${fileStat.size},
      ${sha256},
      ${'public/generated-notebooks'},
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

loadEnvLocal();

if (!process.env.DATABASE_URL?.trim()) {
  throw new Error('DATABASE_URL is not configured. Add it to .env.local first.');
}

const notebookId = argValue('notebook-id');
const maxBytes = Number(argValue('max-bytes') || DEFAULT_MAX_BYTES);
const dryRun = hasFlag('dry-run');
const prisma = new PrismaClient();

try {
  await ensureNotebookImageAssetTable(prisma);
  const notebooks = await prisma.notebook.findMany({
    ...(notebookId ? { where: { id: notebookId } } : {}),
    include: { scenes: true, markdownSections: true },
  });
  const references = new Map();
  for (const notebook of notebooks) {
    for (const scene of notebook.scenes) {
      const paths = collectGeneratedNotebookPathsFromJson({
        content: scene.content,
        actions: scene.actions,
        whiteboard: scene.whiteboard,
      });
      for (const publicPath of paths) {
        const entry = references.get(publicPath) ?? {
          path: publicPath,
          notebookIds: new Set(),
          sceneIds: new Set(),
        };
        entry.notebookIds.add(notebook.id);
        entry.sceneIds.add(scene.id);
        references.set(publicPath, entry);
      }
    }
    for (const section of notebook.markdownSections) {
      const paths = collectGeneratedNotebookPathsFromJson({
        markdown: section.markdown,
        sourceMeta: section.sourceMeta,
      });
      for (const publicPath of paths) {
        const entry = references.get(publicPath) ?? {
          path: publicPath,
          notebookIds: new Set(),
          sceneIds: new Set(),
        };
        entry.notebookIds.add(notebook.id);
        references.set(publicPath, entry);
      }
    }
  }

  const stats = {
    referenced: references.size,
    imported: 0,
    missingLocalFile: 0,
    skippedTooLarge: 0,
    unsafePath: 0,
    totalBytes: 0,
  };

  let processed = 0;
  for (const reference of references.values()) {
    processed += 1;
    const filePath = localFilePathForPublicPath(reference.path);
    if (!filePath) {
      stats.unsafePath += 1;
      continue;
    }
    const fileStat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
    if (!fileStat?.isFile()) {
      stats.missingLocalFile += 1;
      continue;
    }
    if (fileStat.size > maxBytes) {
      stats.skippedTooLarge += 1;
      continue;
    }
    if (!dryRun) await upsertAsset(prisma, reference.path, filePath, fileStat);
    stats.imported += 1;
    stats.totalBytes += fileStat.size;
    if (processed % 25 === 0) {
      console.log(`Imported ${stats.imported}/${stats.referenced} referenced assets...`);
    }
  }

  const rows = dryRun
    ? []
    : await prisma.$queryRaw`
        SELECT COUNT(*)::int AS count, COALESCE(SUM("sizeBytes"), 0)::bigint AS bytes
        FROM "NotebookImageAsset"
      `;

  console.log(
    JSON.stringify(
      {
        notebookFilter: notebookId || null,
        dryRun,
        ...stats,
        totalMegabytes: Math.round((stats.totalBytes / 1024 / 1024) * 10) / 10,
        table: dryRun
          ? null
          : {
              count: Number(rows[0]?.count ?? 0),
              megabytes: Math.round((Number(rows[0]?.bytes ?? 0) / 1024 / 1024) * 10) / 10,
            },
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
