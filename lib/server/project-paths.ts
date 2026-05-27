import path from 'node:path';

export const PROJECT_ROOT = process.cwd();
export const TESTFILE_ROOT = path.join(PROJECT_ROOT, 'testfile');
export const PROBLEM_IMPORT_TESTFILE_ROOT = path.join(TESTFILE_ROOT, 'questionBank');
export const PUBLIC_GENERATED_NOTEBOOKS_ROOT = path.resolve(
  PROJECT_ROOT,
  'public',
  'generated-notebooks',
);
export const PUBLIC_GENERATED_NOTEBOOKS_PATH = '/generated-notebooks';
