import path from 'node:path';

export const PROJECT_ROOT = process.cwd();
export const PUBLIC_GENERATED_NOTEBOOKS_ROOT = path.resolve(
  PROJECT_ROOT,
  'public',
  'generated-notebooks',
);
export const PUBLIC_GENERATED_NOTEBOOKS_PATH = '/generated-notebooks';
export const TESTFILE_ROOT = path.join(PROJECT_ROOT, 'testfile');

export function generatedNotebookDir(notebookId) {
  return path.join(PUBLIC_GENERATED_NOTEBOOKS_ROOT, notebookId);
}

export function generatedNotebookPublicPath(notebookId) {
  return `${PUBLIC_GENERATED_NOTEBOOKS_PATH}/${notebookId}`;
}
