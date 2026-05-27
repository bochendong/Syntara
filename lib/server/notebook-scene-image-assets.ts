import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  getGeneratedNotebookImagePathname,
  isGeneratedNotebookPublicPathname,
} from '@/lib/notebook-content/generated-image-src';
import { PUBLIC_GENERATED_NOTEBOOKS_ROOT } from '@/lib/server/project-paths';

const DEFAULT_MAX_INLINE_IMAGE_BYTES = 8 * 1024 * 1024;

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

function emptyStats(): InlineStats {
  return {
    inlined: 0,
    missing: 0,
    skippedTooLarge: 0,
    unresolvedRelative: 0,
  };
}

function cloneJson(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value));
}

function generatedNotebookFilePath(src: string): string | null {
  const pathname = getGeneratedNotebookImagePathname(src);
  if (!pathname) return null;
  if (!isGeneratedNotebookPublicPathname(pathname)) return null;

  const relativePath = decodeURIComponent(pathname.slice('/generated-notebooks/'.length));
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

  const extension = path.extname(filePath).toLowerCase();
  const mimeType = IMAGE_MIME_BY_EXTENSION[extension] || 'application/octet-stream';
  const bytes = await readFile(filePath);
  stats.inlined += 1;
  return `data:${mimeType};base64,${bytes.toString('base64')}`;
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
