#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SCRIPT_VERSION = '2026-05-29.v1';
const DEFAULT_QUEUE_ROOT = 'queue';
const DEFAULT_OUTPUT_ROOT = path.join('tmp', 'notebook-imagegen-queue');

const COURSE_TARGETS = {
  MAT102: {
    courseName: 'Introduction to Mathematical Proofs',
    courseCode: 'MAT 102',
    defaultCourseIdEnv: 'MAT102_COURSE_ID',
    preferredCourseId: 'cmpd5bird007v8ogmjuuiio03',
  },
  MAT136: {
    courseName: 'Calculus II',
    courseCode: 'MAT 136',
    defaultCourseIdEnv: 'MAT136_COURSE_ID',
    preferredCourseId: 'cmpanemia001v8ouzmhttvkrn',
  },
  CPSC107: {
    courseName: 'CPSC 107',
    courseCode: 'CPSC 107',
    defaultCourseIdEnv: 'CPSC107_COURSE_ID',
    preferredCourseId: 'cmpc9dqgv000p8ogmrsjl5co8',
  },
};

function usage() {
  return [
    'Usage: node scripts/notebooks/prepare-imagegen-queue.mjs [options]',
    '',
    'Scans queue/<course>/*.pdf and prepares a file-backed workspace for Codex-driven',
    'imagegen notebook production. This script does not call project generation APIs,',
    'does not call imagegen, and does not write to the database.',
    '',
    'Options:',
    '  --queue-root <path>      Source queue directory. Default: queue',
    '  --out <path>             Output workspace. Default: tmp/notebook-imagegen-queue',
    '  --course <key>           Limit to a course key, e.g. MAT136. Can be repeated.',
    '  --only <substring>       Limit PDFs by source path/filename substring. Can be repeated.',
    '  --render-pages           Render low-resolution source page PNGs with pdftoppm.',
    '  --force-text             Re-extract page text even if it already exists.',
    '  --help                   Show this help.',
  ].join('\n');
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readRepeatedOption(name) {
  const values = [];
  for (let index = 2; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) {
      values.push(process.argv[index + 1]);
      index += 1;
    } else if (process.argv[index].startsWith(`${name}=`)) {
      values.push(process.argv[index].slice(name.length + 1));
    }
  }
  return values.flatMap((value) =>
    String(value)
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function slugify(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function pageLabel(pageNumber) {
  return String(pageNumber).padStart(3, '0');
}

function pdfPageCount(pdfPath) {
  const output = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' });
  const match = output.match(/^Pages:\s*(\d+)/m);
  if (!match) throw new Error(`Could not read page count from ${pdfPath}`);
  return Number(match[1]);
}

function extractPageText(pdfPath, pageNumber) {
  return execFileSync('pdftotext', ['-layout', '-f', String(pageNumber), '-l', String(pageNumber), pdfPath, '-'], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  }).replace(/\f/g, '').trimEnd();
}

function renderSourcePage(pdfPath, outDir, pageNumber) {
  ensureDir(outDir);
  const prefix = path.join(outDir, `source-page-${pageLabel(pageNumber)}`);
  execFileSync('pdftoppm', [
    '-png',
    '-r',
    '120',
    '-f',
    String(pageNumber),
    '-l',
    String(pageNumber),
    pdfPath,
    prefix,
  ]);
  const rendered = `${prefix}-${pageNumber}.png`;
  const normalized = path.join(outDir, `source-page-${pageLabel(pageNumber)}.png`);
  if (fs.existsSync(rendered) && rendered !== normalized) {
    fs.renameSync(rendered, normalized);
  }
  return normalized;
}

function walkPdfQueue(queueRoot) {
  const courses = fs
    .readdirSync(queueRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const pdfs = [];
  for (const courseKey of courses) {
    const courseDir = path.join(queueRoot, courseKey);
    for (const entry of fs.readdirSync(courseDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.pdf')) continue;
      pdfs.push({
        courseKey,
        sourcePdf: path.join(courseDir, entry.name),
        fileName: entry.name,
      });
    }
  }
  return pdfs.sort((a, b) => a.sourcePdf.localeCompare(b.sourcePdf, undefined, { numeric: true }));
}

function loadExistingManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) return null;
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function listExistingNotebookFiles(outputRoot) {
  if (!fs.existsSync(outputRoot)) return [];
  const files = [];
  const stack = [outputRoot];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(file);
      } else if (entry.isFile() && entry.name === 'notebook.json') {
        files.push(file);
      }
    }
  }
  return files;
}

function previousNotebookBySource(existingManifest, outputRoot) {
  const map = new Map();
  for (const notebook of existingManifest?.notebooks || []) {
    if (notebook.sourcePdf) map.set(notebook.sourcePdf, notebook);
  }
  for (const notebookFile of listExistingNotebookFiles(outputRoot)) {
    try {
      const notebook = JSON.parse(fs.readFileSync(notebookFile, 'utf8'));
      if (notebook.sourcePdf) map.set(notebook.sourcePdf, notebook);
    } catch {
      // Ignore malformed in-progress notebook state files and fall back to manifest state.
    }
  }
  return map;
}

function buildNotebookId(courseKey, fileName) {
  const stem = fileName.replace(/\.pdf$/i, '');
  return `queue-${courseKey.toLowerCase()}-${slugify(stem)}`;
}

function buildNotebookTitle(fileName) {
  return fileName
    .replace(/\.pdf$/i, '')
    .replace(/^\d+[_\-\s]*/, '')
    .replace(/[_-]+/g, ' ')
    .trim();
}

function shouldIncludePdf(pdf, selectedCourses, onlyFilters) {
  if (selectedCourses.size > 0 && !selectedCourses.has(pdf.courseKey)) return false;
  if (onlyFilters.length === 0) return true;
  return onlyFilters.some((filter) => pdf.sourcePdf.includes(filter) || pdf.fileName.includes(filter));
}

function prepareNotebook(pdf, options, previous) {
  const target = COURSE_TARGETS[pdf.courseKey] || {
    courseName: pdf.courseKey,
    courseCode: pdf.courseKey,
    defaultCourseIdEnv: `${pdf.courseKey}_COURSE_ID`,
    preferredCourseId: null,
  };
  const sourcePdfAbs = path.resolve(pdf.sourcePdf);
  const pageCount = pdfPageCount(sourcePdfAbs);
  const notebookId = previous?.notebookId || buildNotebookId(pdf.courseKey, pdf.fileName);
  const notebookTitle = previous?.title || buildNotebookTitle(pdf.fileName);
  const artifactDir = path.join(options.outputRoot, pdf.courseKey, notebookId);
  const textDir = path.join(artifactDir, 'source-text');
  const sourcePageDir = path.join(artifactDir, 'source-pages');
  const promptDir = path.join(artifactDir, 'prompts');
  const imageDir = path.join(artifactDir, 'generated-images');
  const narrationDir = path.join(artifactDir, 'narration');

  ensureDir(textDir);
  ensureDir(promptDir);
  ensureDir(imageDir);
  ensureDir(narrationDir);
  if (options.renderPages) ensureDir(sourcePageDir);

  const pages = [];
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const label = pageLabel(pageNumber);
    const textPath = path.join(textDir, `page-${label}.txt`);
    if (options.forceText || !fs.existsSync(textPath)) {
      fs.writeFileSync(textPath, `${extractPageText(sourcePdfAbs, pageNumber)}\n`);
    }

    let sourcePageImage = null;
    if (options.renderPages) {
      sourcePageImage = renderSourcePage(sourcePdfAbs, sourcePageDir, pageNumber);
    }

    const previousPage = previous?.pages?.find((page) => page.pageNumber === pageNumber);
    pages.push({
      pageNumber,
      sourceTextPath: path.relative(process.cwd(), textPath),
      sourcePageImagePath: sourcePageImage ? path.relative(process.cwd(), sourcePageImage) : previousPage?.sourcePageImagePath || null,
      promptPath: previousPage?.promptPath || path.relative(process.cwd(), path.join(promptDir, `page-${label}.prompt.md`)),
      generatedImagePath: previousPage?.generatedImagePath || null,
      narrationPath: previousPage?.narrationPath || path.relative(process.cwd(), path.join(narrationDir, `page-${label}.actions.json`)),
      status: {
        sourceText: 'ready',
        prompt: previousPage?.status?.prompt || 'pending',
        image: previousPage?.status?.image || 'pending',
        narration: previousPage?.status?.narration || 'pending',
        dbScene: previousPage?.status?.dbScene || 'pending',
      },
    });
  }

  const notebook = {
    courseKey: pdf.courseKey,
    courseTarget: {
      ...target,
      resolvedCourseId: process.env[target.defaultCourseIdEnv] || target.preferredCourseId || null,
    },
    notebookId,
    title: notebookTitle,
    sourcePdf: pdf.sourcePdf,
    sourcePdfAbs,
    artifactDir: path.relative(process.cwd(), artifactDir),
    pageCount,
    pages,
    status: {
      sourceRead: 'ready',
      prompts: previous?.status?.prompts || 'pending',
      images: previous?.status?.images || 'pending',
      narration: previous?.status?.narration || 'pending',
      dbWrite: previous?.status?.dbWrite || 'pending',
    },
  };

  writeJson(path.join(artifactDir, 'notebook.json'), notebook);
  return notebook;
}

function main() {
  if (hasFlag('--help')) {
    console.log(usage());
    return;
  }

  const queueRoot = path.resolve(readOption('--queue-root') || DEFAULT_QUEUE_ROOT);
  const outputRoot = path.resolve(readOption('--out') || DEFAULT_OUTPUT_ROOT);
  const selectedCourses = new Set(readRepeatedOption('--course'));
  const onlyFilters = readRepeatedOption('--only');
  const renderPages = hasFlag('--render-pages');
  const forceText = hasFlag('--force-text');

  if (!fs.existsSync(queueRoot)) throw new Error(`Queue root not found: ${queueRoot}`);
  ensureDir(outputRoot);

  const manifestPath = path.join(outputRoot, 'manifest.json');
  const existingManifest = loadExistingManifest(manifestPath);
  const previousBySource = previousNotebookBySource(existingManifest, outputRoot);
  const pdfs = walkPdfQueue(queueRoot).filter((pdf) =>
    shouldIncludePdf(pdf, selectedCourses, onlyFilters),
  );

  const notebooks = pdfs.map((pdf) =>
    prepareNotebook(
      pdf,
      {
        outputRoot,
        renderPages,
        forceText,
      },
      previousBySource.get(pdf.sourcePdf),
    ),
  );

  const manifest = {
    schemaVersion: 1,
    scriptVersion: SCRIPT_VERSION,
    generatedAt: new Date().toISOString(),
    queueRoot: path.relative(process.cwd(), queueRoot),
    outputRoot: path.relative(process.cwd(), outputRoot),
    instructions:
      'Codex automation owns prompt writing, built-in imagegen calls, image reading, narration/action authoring, QA, and final database writes.',
    courseTargets: COURSE_TARGETS,
    notebooks,
  };

  writeJson(manifestPath, manifest);
  console.log(`Prepared ${notebooks.length} notebook(s).`);
  console.log(`Manifest: ${path.relative(process.cwd(), manifestPath)}`);
}

main();
