import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { readFile, readdir, stat } from 'node:fs/promises';
import { PROBLEM_IMPORT_TESTFILE_ROOT } from '@/lib/server/project-paths';
export { PROBLEM_IMPORT_TESTFILE_ROOT } from '@/lib/server/project-paths';

export type ProblemImportFixtureKind = 'choice' | 'long-form' | 'code' | 'material';
export type ProblemImportFixtureFileType = 'pdf' | 'pptx' | 'md' | 'txt';

export type ProblemImportFixture = {
  id: string;
  fileName: string;
  title: string;
  description: string;
  kind: ProblemImportFixtureKind;
  fileType: ProblemImportFixtureFileType;
};

export type ListedProblemImportFixture = ProblemImportFixture & {
  fileSize: number;
  exists: boolean;
  updatedAt: number | null;
};

type InternalProblemImportFixture = ListedProblemImportFixture & {
  filePath: string;
};

function fileTypeFromName(fileName: string): ProblemImportFixtureFileType | null {
  if (/\.pdf$/i.test(fileName)) return 'pdf';
  if (/\.pptx$/i.test(fileName)) return 'pptx';
  if (/\.md$/i.test(fileName)) return 'md';
  if (/\.txt$/i.test(fileName)) return 'txt';
  return null;
}

function stableIdFromRelativePath(relativePath: string): string {
  const extensionless = relativePath.replace(/\.[^.]+$/, '');
  const slug =
    extensionless
      .toLowerCase()
      .replace(/\\/g, '/')
      .split('/')
      .join('-')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'fixture';
  const hash = createHash('sha1').update(relativePath).digest('hex').slice(0, 8);
  return `${slug}-${hash}`;
}

function fixtureTitleFromFileName(fileName: string): string {
  return (
    path
      .basename(fileName)
      .replace(/\.[^.]+$/, '')
      .replace(/[+_-]+/g, ' ')
      .trim() || fileName
  );
}

function fixtureKindFromFileName(fileName: string): ProblemImportFixtureKind {
  if (/(^|[^a-z0-9])(?:mc|multiple[-_\s]?choice|choice|选择)(?=[^a-z0-9]|$)/i.test(fileName)) {
    return 'choice';
  }
  if (/\.(?:md|txt)$/i.test(fileName) && /\b(?:code|cs|oop|program)\b/i.test(fileName)) {
    return 'code';
  }
  return 'long-form';
}

function fixtureDescriptionFromFile(fileName: string, kind: ProblemImportFixtureKind): string {
  const kindLabel =
    kind === 'choice'
      ? '选择题'
      : kind === 'code'
        ? '代码/概念题'
        : kind === 'material'
          ? '材料抽题'
          : '大题/题集';
  return `从 questionBank 扫描到的${kindLabel}测试文件：${fileName}`;
}

async function scanProblemImportFixtureFiles(
  directory = PROBLEM_IMPORT_TESTFILE_ROOT,
  prefix = '',
): Promise<InternalProblemImportFixture[]> {
  let entries: Dirent<string>[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const nested = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith('.'))
      .map(async (entry) => {
        const relativePath = path.posix.join(prefix, entry.name);
        const filePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          return scanProblemImportFixtureFiles(filePath, relativePath);
        }
        if (!entry.isFile()) return [];
        const fileType = fileTypeFromName(entry.name);
        if (!fileType) return [];
        const fileStat = await stat(filePath);
        const kind = fixtureKindFromFileName(relativePath);
        return [
          {
            id: stableIdFromRelativePath(relativePath),
            fileName: relativePath,
            title: fixtureTitleFromFileName(entry.name),
            description: fixtureDescriptionFromFile(relativePath, kind),
            kind,
            fileType,
            fileSize: fileStat.size,
            exists: true,
            updatedAt: fileStat.mtimeMs,
            filePath,
          },
        ];
      }),
  );

  return nested
    .flat()
    .sort((a, b) => a.fileName.localeCompare(b.fileName, 'zh-CN', { numeric: true }));
}

export async function listProblemImportFixtures(): Promise<ListedProblemImportFixture[]> {
  const fixtures = await scanProblemImportFixtureFiles();
  return fixtures.map(({ filePath: _filePath, ...fixture }) => fixture);
}

export async function getProblemImportFixture(
  id: string,
): Promise<ListedProblemImportFixture | null> {
  return (await listProblemImportFixtures()).find((fixture) => fixture.id === id) || null;
}

export function problemImportFixturePath(fileName: string): string {
  return path.join(PROBLEM_IMPORT_TESTFILE_ROOT, fileName);
}

export async function readProblemImportFixtureFile(id: string) {
  const fixtures = await scanProblemImportFixtureFiles();
  const matchedFixture = fixtures.find((fixture) => fixture.id === id);
  if (!matchedFixture) return null;
  const { filePath, ...fixture } = matchedFixture;
  const [buffer, fileStat] = await Promise.all([readFile(filePath), stat(filePath)]);
  return { fixture, filePath, buffer, fileStat };
}
