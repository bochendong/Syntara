import { readFile, stat } from 'node:fs/promises';
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
  return serveGeneratedNotebookImage(request, true);
}

export async function HEAD(request: NextRequest) {
  return serveGeneratedNotebookImage(request, false);
}
