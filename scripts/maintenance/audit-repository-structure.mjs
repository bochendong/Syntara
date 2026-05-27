#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
    return [key, value];
  }),
);

const failThreshold = Number(args.get('threshold') || 2000);
const warnThreshold = Number(args.get('warn') || 1800);

const sourceExtensions = new Set(['.cjs', '.js', '.jsx', '.mjs', '.ts', '.tsx']);
const excludedDirectories = new Set([
  '.git',
  '.next',
  '.pnpm-store',
  'coverage',
  'dist',
  'node_modules',
  'OpenMAIC-org',
  'outputs',
  'public',
  'queue',
  'temp',
  'tmp',
]);

const watchedLargeDirectories = [
  'public/generated-notebooks',
  'OpenMAIC-org',
  '.next',
  'node_modules',
  '.pnpm-store',
  'outputs',
  'queue',
  'tmp',
];

function isSourceFile(filePath) {
  if (filePath.endsWith('.d.ts')) {
    return false;
  }
  return sourceExtensions.has(path.extname(filePath));
}

function countLines(filePath) {
  const text = readFileSync(filePath, 'utf8');
  if (text.length === 0) {
    return 0;
  }
  return text.split('\n').length;
}

function walkFiles(directory, visitor) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (excludedDirectories.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, visitor);
      continue;
    }

    if (entry.isFile()) {
      visitor(fullPath);
    }
  }
}

function findFilesUnder(directory, matcher) {
  const start = path.join(root, directory);
  const results = [];
  if (!existsSync(start)) {
    return results;
  }

  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && matcher(fullPath)) {
        results.push(path.relative(root, fullPath));
      }
    }
  };

  walk(start);
  return results.sort();
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) {
    return 'unknown';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function duSize(targetPath) {
  try {
    const output = execFileSync('du', ['-sk', targetPath], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const kilobytes = Number(output.trim().split(/\s+/)[0]);
    return kilobytes * 1024;
  } catch {
    try {
      return statSync(path.join(root, targetPath)).size;
    } catch {
      return Number.NaN;
    }
  }
}

function gitTrackedCount(targetPath) {
  try {
    const output = execFileSync('git', ['ls-files', '--', targetPath], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!output) {
      return 0;
    }
    return output.split('\n').length;
  } catch {
    return null;
  }
}

const sourceLineCounts = [];
walkFiles(root, (filePath) => {
  if (!isSourceFile(filePath)) {
    return;
  }
  sourceLineCounts.push({
    file: path.relative(root, filePath),
    lines: countLines(filePath),
  });
});

sourceLineCounts.sort((a, b) => b.lines - a.lines || a.file.localeCompare(b.file));

const failingFiles = sourceLineCounts.filter((item) => item.lines > failThreshold);
const warningFiles = sourceLineCounts.filter(
  (item) => item.lines > warnThreshold && item.lines <= failThreshold,
);
const largestFiles = sourceLineCounts.slice(0, 15);

const pageFiles = findFilesUnder('app', (filePath) => path.basename(filePath) === 'page.tsx');
const routeFiles = findFilesUnder('app/api', (filePath) => path.basename(filePath) === 'route.ts');
const qaPagesOutsideGroup = pageFiles.filter((file) => {
  const lower = file.toLowerCase();
  return (
    !file.startsWith('app/(qa)/') &&
    file !== 'app/test/page.tsx' &&
    (lower.includes('/test') || lower.includes('-test'))
  );
});

console.log('Repository structure audit');
console.log(`Root: ${root}`);
console.log(`Source line thresholds: warn > ${warnThreshold}, fail > ${failThreshold}`);
console.log('');

console.log('Largest source files');
for (const item of largestFiles) {
  const marker = item.lines > failThreshold ? 'FAIL' : item.lines > warnThreshold ? 'WARN' : 'OK';
  console.log(`  ${marker.padEnd(4)} ${String(item.lines).padStart(5)} ${item.file}`);
}
console.log('');

console.log('Route surface');
console.log(`  Pages: ${pageFiles.length}`);
console.log(`  API route handlers: ${routeFiles.length}`);
console.log(`  QA/test pages outside app/(qa): ${qaPagesOutsideGroup.length}`);
for (const file of qaPagesOutsideGroup.slice(0, 20)) {
  console.log(`    ${file}`);
}
if (qaPagesOutsideGroup.length > 20) {
  console.log(`    ...and ${qaPagesOutsideGroup.length - 20} more`);
}
console.log('');

console.log('Large generated or local-only directories');
for (const directory of watchedLargeDirectories) {
  if (!existsSync(path.join(root, directory))) {
    continue;
  }
  const trackedCount = gitTrackedCount(directory);
  const trackedLabel = trackedCount === null ? 'tracked: unknown' : `tracked: ${trackedCount}`;
  console.log(`  ${formatBytes(duSize(directory)).padStart(8)} ${directory} (${trackedLabel})`);
}
console.log('');

if (warningFiles.length > 0) {
  console.log(`Warnings: ${warningFiles.length} source files are above ${warnThreshold} lines.`);
}

if (failingFiles.length > 0) {
  console.error(`Failures: ${failingFiles.length} source files are above ${failThreshold} lines.`);
  process.exitCode = 1;
}
