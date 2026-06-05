import { readFile, stat } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import {
  findNotebookImageAsset,
  findNotebookImageAssetMetadata,
  generatedNotebookFilePath,
  generatedNotebookPublicPathname,
} from '@/lib/server/notebook-scene-image-assets';
import { getPrismaSafely } from '@/lib/server/prisma-safe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  '.avif': 'image/avif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function imageMimeTypeForPath(filePath: string): string {
  return (
    IMAGE_MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
  );
}

function generatedNotebookPathnameFromRequest(request: NextRequest): string | null {
  try {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    return generatedNotebookPublicPathname(pathname);
  } catch {
    return null;
  }
}

function imageResponse(
  body: Uint8Array | null,
  headers: Record<string, string>,
  status = 200,
): Response {
  const responseBody = body ? toArrayBuffer(body) : null;
  return new Response(responseBody, {
    status,
    headers: {
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=0',
      ...headers,
    },
  });
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function databaseUrlFingerprint(): string | null {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) return null;
  return crypto.createHash('sha256').update(value.replace(/\/+$/, '')).digest('hex').slice(0, 12);
}

function sanitizeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const databaseUrl = process.env.DATABASE_URL?.trim();
  let sanitized = message;
  if (databaseUrl) {
    sanitized = sanitized.replaceAll(databaseUrl, '[DATABASE_URL]');
    try {
      const parsed = new URL(databaseUrl);
      if (parsed.password) sanitized = sanitized.replaceAll(parsed.password, '[password]');
    } catch {
      // Keep the generic message when DATABASE_URL is not parseable.
    }
  }
  return sanitized.slice(0, 500);
}

async function localImageResponse(publicPathname: string, includeBody: boolean) {
  const filePath = generatedNotebookFilePath(publicPathname);
  if (!filePath) return null;

  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) return null;

  const bytes = includeBody ? new Uint8Array(await readFile(filePath)) : null;
  return imageResponse(bytes, {
    'Content-Length': String(info.size),
    'Content-Type': imageMimeTypeForPath(filePath),
    'Last-Modified': info.mtime.toUTCString(),
  });
}

async function databaseImageResponse(publicPathname: string, includeBody: boolean) {
  const prisma = getPrismaSafely();
  if (!prisma) return null;

  if (includeBody) {
    const asset = await findNotebookImageAsset(prisma, publicPathname).catch(() => null);
    if (!asset) return null;

    return imageResponse(new Uint8Array(asset.data), {
      'Content-Length': String(asset.sizeBytes),
      'Content-Type': asset.mimeType,
      ETag: `"${asset.sha256}"`,
      'Last-Modified': asset.updatedAt.toUTCString(),
    });
  }

  const asset = await findNotebookImageAssetMetadata(prisma, publicPathname).catch(() => null);
  if (!asset) return null;

  return imageResponse(null, {
    'Content-Length': String(asset.sizeBytes),
    'Content-Type': asset.mimeType,
    ETag: `"${asset.sha256}"`,
    'Last-Modified': asset.updatedAt.toUTCString(),
  });
}

async function debugGeneratedNotebookImage(request: NextRequest) {
  const publicPathname = generatedNotebookPathnameFromRequest(request);
  if (!publicPathname) {
    return NextResponse.json({ error: 'Invalid generated notebook asset path' }, { status: 400 });
  }

  const filePath = generatedNotebookFilePath(publicPathname);
  const localInfo = filePath ? await stat(filePath).catch(() => null) : null;
  const prisma = getPrismaSafely();
  const database = {
    configured: Boolean(process.env.DATABASE_URL?.trim()),
    fingerprint: databaseUrlFingerprint(),
    clientAvailable: Boolean(prisma),
    found: false,
    sizeBytes: null as number | null,
    updatedAt: null as string | null,
    error: null as null | {
      name: string;
      code?: string;
      message: string;
    },
  };

  if (prisma) {
    try {
      const asset = await findNotebookImageAssetMetadata(prisma, publicPathname);
      database.found = Boolean(asset);
      database.sizeBytes = asset?.sizeBytes ?? null;
      database.updatedAt = asset?.updatedAt.toISOString() ?? null;
    } catch (error) {
      database.error = {
        name: error instanceof Error ? error.name : 'UnknownError',
        code:
          typeof error === 'object' && error && 'code' in error
            ? String((error as { code?: unknown }).code)
            : undefined,
        message: sanitizeErrorMessage(error),
      };
    }
  }

  return NextResponse.json({
    publicPathname,
    deployment: {
      environment: process.env.VERCEL_ENV ?? null,
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    },
    local: {
      checked: Boolean(filePath),
      found: Boolean(localInfo?.isFile()),
      sizeBytes: localInfo?.isFile() ? localInfo.size : null,
    },
    database,
  });
}

async function serveGeneratedNotebookImage(request: NextRequest, includeBody: boolean) {
  const publicPathname = generatedNotebookPathnameFromRequest(request);
  if (!publicPathname) {
    return NextResponse.json({ error: 'Invalid generated notebook asset path' }, { status: 400 });
  }

  return (
    (await localImageResponse(publicPathname, includeBody)) ||
    (await databaseImageResponse(publicPathname, includeBody)) ||
    NextResponse.json({ error: 'Generated notebook asset not found' }, { status: 404 })
  );
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.has('debug')) {
    return debugGeneratedNotebookImage(request);
  }
  return serveGeneratedNotebookImage(request, true);
}

export async function HEAD(request: NextRequest) {
  return serveGeneratedNotebookImage(request, false);
}
