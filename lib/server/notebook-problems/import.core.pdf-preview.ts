import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ProblemSourcePage } from './import.core.types';
import { execFileAsync } from './import.core.types';
import {
  normalizeWhitespace,
  TOP_LEVEL_QUESTION_START_PATTERN,
  TOP_LEVEL_QUESTION_START_RE,
} from './import.core.text';

export function detectSourcePageRole(
  text: string,
  pageNumber: number,
): ProblemSourcePage['roleHint'] {
  const normalized = normalizeWhitespace(text).toLowerCase();
  if (!normalized) return 'unknown';
  if (
    /\b(?:exam instructions?|academic integrity|scantron|student number|signature|duration\s*-|aids:)\b/i.test(
      normalized,
    )
  ) {
    return 'instructions';
  }
  if (/\bpage intentionally left blank\b|\bintentionally left blank\b/i.test(normalized)) {
    return 'blank';
  }
  if (
    /\badditional work\b|\bwill not be marked\b|\bextra space is needed for solutions\b/i.test(
      normalized,
    )
  ) {
    return 'additional_work';
  }
  if (
    pageNumber === 1 &&
    normalized.length < 1600 &&
    !TOP_LEVEL_QUESTION_START_RE.test(text.trim())
  ) {
    return 'cover';
  }
  if (new RegExp(TOP_LEVEL_QUESTION_START_PATTERN, 'i').test(text)) return 'problem';
  return 'unknown';
}

export function titleFromSourceText(text: string, fallback: string): string {
  const firstMeaningfulLine =
    text
      .split('\n')
      .map((line) => normalizeWhitespace(line))
      .find((line) => line.length >= 4 && !/^page\s+\d+$/i.test(line)) || '';
  return (firstMeaningfulLine || fallback).slice(0, 120);
}

export function pngDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24) return null;
  if (buffer.toString('ascii', 1, 4) !== 'PNG') return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

export async function renderPdfPagePreviewWithPdftoppm(args: {
  pdfBuffer: Buffer;
  pageNumber: number;
  width: number;
}): Promise<{ src: string; width?: number; height?: number }> {
  const workDir = await mkdtemp(path.join(tmpdir(), 'problem-import-preview-'));
  try {
    const pdfPath = path.join(workDir, 'source.pdf');
    const outputPrefix = path.join(workDir, `page-${args.pageNumber}`);
    await writeFile(pdfPath, args.pdfBuffer);
    await execFileAsync(
      'pdftoppm',
      [
        '-f',
        String(args.pageNumber),
        '-singlefile',
        '-png',
        '-scale-to-x',
        String(args.width),
        '-scale-to-y',
        '-1',
        pdfPath,
        outputPrefix,
      ],
      { timeout: 8000, maxBuffer: 1024 * 1024 },
    );
    const png = await readFile(`${outputPrefix}.png`);
    const dimensions = pngDimensions(png);
    return {
      src: `data:image/png;base64,${png.toString('base64')}`,
      width: dimensions?.width,
      height: dimensions?.height,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
