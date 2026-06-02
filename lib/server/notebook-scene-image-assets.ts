import { readFile, stat } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import {
  getGeneratedNotebookImagePathname,
  isGeneratedNotebookPublicPathname,
} from '@/lib/notebook-content/generated-image-src';
import { PUBLIC_GENERATED_NOTEBOOKS_ROOT } from '@/lib/server/project-paths';
import type { DbClient } from '@/lib/server/repositories/types';

const DEFAULT_MAX_INLINE_IMAGE_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_DATABASE_IMAGE_BYTES = 64 * 1024 * 1024;

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  '.avif': 'image/avif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

type InlineStats = {
  inlined: number;
  missing: number;
  skippedTooLarge: number;
  unresolvedRelative: number;
};

export type InlineLocalGeneratedNotebookImagesResult = {
  content: unknown;
  stats: InlineStats;
};

type PersistStats = {
  persisted: number;
  missing: number;
  skippedTooLarge: number;
  unresolvedRelative: number;
};

export type PersistLocalGeneratedNotebookImagesResult = {
  content: unknown;
  stats: PersistStats;
};

export type NotebookImageAssetRow = {
  path: string;
  mimeType: string;
  data: Uint8Array;
  sizeBytes: number;
  sha256: string;
  updatedAt: Date;
};

export type NotebookImageAssetMetadataRow = Omit<NotebookImageAssetRow, 'data'>;

let ensureNotebookImageAssetTablePromise: Promise<void> | null = null;

function emptyStats(): InlineStats {
  return {
    inlined: 0,
    missing: 0,
    skippedTooLarge: 0,
    unresolvedRelative: 0,
  };
}

function emptyPersistStats(): PersistStats {
  return {
    persisted: 0,
    missing: 0,
    skippedTooLarge: 0,
    unresolvedRelative: 0,
  };
}

function cloneJson(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value));
}

export function generatedNotebookPublicPathname(src: string): string | null {
  const pathname = getGeneratedNotebookImagePathname(src);
  if (!pathname) return null;
  if (!isGeneratedNotebookPublicPathname(pathname)) return null;
  return decodeURIComponent(pathname);
}

export function generatedNotebookFilePath(src: string): string | null {
  const pathname = generatedNotebookPublicPathname(src);
  if (!pathname) return null;

  const relativePath = pathname.slice('/generated-notebooks/'.length);
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

function imageMimeTypeForPath(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  return IMAGE_MIME_BY_EXTENSION[extension] || 'application/octet-stream';
}

async function localImageToDataUrl(
  src: string,
  stats: InlineStats,
  maxBytes: number,
): Promise<string | null> {
  const filePath = generatedNotebookFilePath(src);
  if (!filePath) {
    stats.unresolvedRelative += 1;
    return null;
  }

  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat?.isFile()) {
    stats.missing += 1;
    return null;
  }
  if (fileStat.size > maxBytes) {
    stats.skippedTooLarge += 1;
    return null;
  }

  const mimeType = imageMimeTypeForPath(filePath);
  const bytes = await readFile(filePath);
  stats.inlined += 1;
  return `data:${mimeType};base64,${bytes.toString('base64')}`;
}

export async function ensureNotebookImageAssetTable(db: DbClient): Promise<void> {
  ensureNotebookImageAssetTablePromise ??= (async () => {
    await db.$executeRawUnsafe(`
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
    await db.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "NotebookImageAsset_sha256_idx" ON "NotebookImageAsset"("sha256")',
    );
  })();
  await ensureNotebookImageAssetTablePromise;
}

export async function findNotebookImageAsset(
  db: DbClient,
  publicPathname: string,
): Promise<NotebookImageAssetRow | null> {
  await ensureNotebookImageAssetTable(db);
  const rows = await db.$queryRaw<
    NotebookImageAssetRow[]
  >`SELECT "path", "mimeType", "data", "sizeBytes", "sha256", "updatedAt" FROM "NotebookImageAsset" WHERE "path" = ${publicPathname} LIMIT 1`;
  return rows[0] ?? null;
}

export async function findNotebookImageAssetMetadata(
  db: DbClient,
  publicPathname: string,
): Promise<NotebookImageAssetMetadataRow | null> {
  await ensureNotebookImageAssetTable(db);
  const rows = await db.$queryRaw<
    NotebookImageAssetMetadataRow[]
  >`SELECT "path", "mimeType", "sizeBytes", "sha256", "updatedAt" FROM "NotebookImageAsset" WHERE "path" = ${publicPathname} LIMIT 1`;
  return rows[0] ?? null;
}

async function persistLocalImageAsset(
  db: DbClient,
  src: string,
  stats: PersistStats,
  maxBytes: number,
): Promise<void> {
  const publicPathname = generatedNotebookPublicPathname(src);
  const filePath = generatedNotebookFilePath(src);
  if (!publicPathname || !filePath) {
    stats.unresolvedRelative += 1;
    return;
  }

  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat?.isFile()) {
    stats.missing += 1;
    return;
  }
  if (fileStat.size > maxBytes) {
    stats.skippedTooLarge += 1;
    return;
  }

  const bytes = await readFile(filePath);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const mimeType = imageMimeTypeForPath(filePath);
  const id = crypto.randomUUID();

  await db.$executeRaw`
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
      ${publicPathname},
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
  stats.persisted += 1;
}

async function inlineValue(value: unknown, stats: InlineStats, maxBytes: number): Promise<void> {
  if (!value || typeof value !== 'object') return;

  if (Array.isArray(value)) {
    for (const item of value) {
      await inlineValue(item, stats, maxBytes);
    }
    return;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.src === 'string') {
    const dataUrl = await localImageToDataUrl(record.src, stats, maxBytes);
    if (dataUrl) {
      record.src = dataUrl;
    }
  }

  for (const [key, nested] of Object.entries(record)) {
    if (key === 'src') continue;
    await inlineValue(nested, stats, maxBytes);
  }
}

async function persistValue(
  db: DbClient,
  value: unknown,
  stats: PersistStats,
  maxBytes: number,
  seen: Set<string>,
): Promise<void> {
  if (!value || typeof value !== 'object') return;

  if (Array.isArray(value)) {
    for (const item of value) {
      await persistValue(db, item, stats, maxBytes, seen);
    }
    return;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.src === 'string') {
    const publicPathname = generatedNotebookPublicPathname(record.src);
    if (publicPathname && !seen.has(publicPathname)) {
      seen.add(publicPathname);
      await persistLocalImageAsset(db, record.src, stats, maxBytes);
    } else if (!publicPathname) {
      stats.unresolvedRelative += 1;
    }
  }

  for (const [key, nested] of Object.entries(record)) {
    if (key === 'src') continue;
    await persistValue(db, nested, stats, maxBytes, seen);
  }
}

export async function inlineLocalGeneratedNotebookImages(
  content: unknown,
  options?: { maxBytes?: number },
): Promise<InlineLocalGeneratedNotebookImagesResult> {
  const clonedContent = cloneJson(content);
  const stats = emptyStats();
  await inlineValue(clonedContent, stats, options?.maxBytes ?? DEFAULT_MAX_INLINE_IMAGE_BYTES);
  return {
    content: clonedContent,
    stats,
  };
}

export async function persistLocalGeneratedNotebookImages(
  db: DbClient,
  content: unknown,
  options?: { maxBytes?: number },
): Promise<PersistLocalGeneratedNotebookImagesResult> {
  const clonedContent = cloneJson(content);
  const stats = emptyPersistStats();
  await ensureNotebookImageAssetTable(db);
  await persistValue(
    db,
    clonedContent,
    stats,
    options?.maxBytes ?? DEFAULT_MAX_DATABASE_IMAGE_BYTES,
    new Set(),
  );
  return {
    content: clonedContent,
    stats,
  };
}
