import { rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from '@/lib/logger';
import { PUBLIC_GENERATED_NOTEBOOKS_ROOT } from '@/lib/server/project-paths';

const log = createLogger('NotebookArtifacts');

type CleanupGeneratedNotebookArtifactsResult =
  | { deleted: true }
  | {
      deleted: false;
      reason: 'missing' | 'invalid-id' | 'not-directory' | 'unsafe-path' | 'failed';
    };

function isSafeGeneratedNotebookId(notebookId: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{2,160}$/.test(notebookId);
}

function generatedNotebookPath(notebookId: string): string | null {
  if (!isSafeGeneratedNotebookId(notebookId)) return null;
  const target = path.resolve(PUBLIC_GENERATED_NOTEBOOKS_ROOT, notebookId);
  const rootWithSeparator = `${PUBLIC_GENERATED_NOTEBOOKS_ROOT}${path.sep}`;
  if (!target.startsWith(rootWithSeparator) || path.basename(target) !== notebookId) {
    return null;
  }
  return target;
}

export async function cleanupGeneratedNotebookArtifacts(
  notebookId: string,
): Promise<CleanupGeneratedNotebookArtifactsResult> {
  const target = generatedNotebookPath(notebookId);
  if (!target) return { deleted: false, reason: 'invalid-id' };

  try {
    const info = await stat(target);
    if (!info.isDirectory()) return { deleted: false, reason: 'not-directory' };
    await rm(target, { recursive: true, force: true });
    return { deleted: true };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { deleted: false, reason: 'missing' };
    }
    log.warn('Failed to clean generated notebook artifacts', { notebookId, error });
    return { deleted: false, reason: 'failed' };
  }
}
