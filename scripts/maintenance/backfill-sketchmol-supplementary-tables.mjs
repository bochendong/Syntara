#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

const DEFAULT_COURSE_ID = 'cmqoac1vb00498o0uludsvrhd';
const DEFAULT_NOTEBOOK_ID = 'cmqoix8bm00cn8o0u502q9u1a';
const SOURCE_HASH = '80a2e5f13f19c7b33d144f97a2ad20ee1bf413a4f09375b44085a6d51c7b9be7';
const SOURCE_TITLE = 'Bochen_Paper 2_Molecule_Image_MolecularGeneration.pdf';
const SECTION_TITLE = 'SketchMol Supplementary Tables - Exact Benchmark Data';
const SECTION_SUMMARY =
  'Exact Supplementary Table 1 and 2 benchmark data for SketchMol, DIFFUMOL, DiGress, and DRAGONFLY; DRAGONFLY appears in the property-constrained MAE table.';

const MARKDOWN = `# ${SECTION_TITLE}

来源：${SOURCE_TITLE}，Supplementary Table 1（PDF 第 29 页）和 Supplementary Table 2（PDF 第 30 页）。

## Supplementary Table 1: molecule generation metrics

| Model Name | Data Format | Valid ↑ | Unique ↑ | Novelty ↑ | FID ↓ | FCD ↓ | LogP ↓ | QED ↓ | MW ↓ | TPSA ↓ |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| DIFFUMOL | Sequence | 0.94 | 1.00 | 0.97 | 12.55 | 3.42 | 0.25 | 0.07 | 51.64 | 12.52 |
| DiGress | Graph | 0.78 | 1.00 | 1.00 | 9.29 | 3.85 | 0.27 | 0.03 | 17.41 | 3.91 |
| SketchMol | Image | 0.90 | 1.00 | 1.00 | 4.92 | 3.84 | 0.22 | 0.01 | 14.07 | 2.10 |

## Supplementary Table 2: property-constrained generation MAE

| Target property | SketchMol MAE | DRAGONFLY MAE |
| --- | ---: | ---: |
| LogP | 0.69 ± 0.51 | 0.27 ± 0.34 |
| QED | 0.08 ± 0.06 | - |
| MW | 22.48 ± 16.70 | 8.17 ± 10.69 |
| TPSA | 12.00 ± 9.78 | 4.58 ± 6.53 |
| HBD | 0.24 ± 0.42 | 0.03 ± 0.20 |
| HBA | 0.80 ± 0.71 | 0.31 ± 0.58 |
| RB | 0.77 ± 0.76 | 0.41 ± 0.79 |

## Reading note: cross-table relationship

回答规则：如果学生问 “SketchMol vs DIFFUMOL vs DiGress vs DRAGONFLY”，不要只看 Supplementary Table 1。即使学生说“一个表格”，也不要把两张不同指标表强行合并成一张。应先给出 Supplementary Table 1 中 DIFFUMOL、DiGress、SketchMol 的 molecule generation metrics；再说明 DRAGONFLY 没有出现在这张表里，但在 Supplementary Table 2 中有 property-constrained generation MAE，并把 SketchMol vs DRAGONFLY 的 MAE 表列出来。

| 对象 | 原文表格 | 可比较的数据 |
| --- | --- | --- |
| DIFFUMOL | Supplementary Table 1 | Sequence；Valid 0.94；Unique 1.00；Novelty 0.97；FID 12.55；FCD 3.42；LogP 0.25；QED 0.07；MW 51.64；TPSA 12.52 |
| DiGress | Supplementary Table 1 | Graph；Valid 0.78；Unique 1.00；Novelty 1.00；FID 9.29；FCD 3.85；LogP 0.27；QED 0.03；MW 17.41；TPSA 3.91 |
| SketchMol | Supplementary Table 1 and 2 | Image；Valid 0.90；Unique 1.00；Novelty 1.00；FID 4.92；FCD 3.84；LogP 0.22；QED 0.01；MW 14.07；TPSA 2.10；property-constrained MAE: LogP 0.69 ± 0.51；QED 0.08 ± 0.06；MW 22.48 ± 16.70；TPSA 12.00 ± 9.78；HBD 0.24 ± 0.42；HBA 0.80 ± 0.71；RB 0.77 ± 0.76 |
| DRAGONFLY | Supplementary Table 2 | Property-constrained generation MAE only: LogP 0.27 ± 0.34；QED unavailable；MW 8.17 ± 10.69；TPSA 4.58 ± 6.53；HBD 0.03 ± 0.20；HBA 0.31 ± 0.58；RB 0.41 ± 0.79 |

## Retrieval hints

- Use this section when the student asks for SketchMol vs DIFFUMOL vs DiGress vs DRAGONFLY, benchmark tables, Valid/Unique/Novelty/FID/FCD, or property-constrained generation MAE.
- Do not infer missing DRAGONFLY QED from other rows; the source table marks DRAGONFLY QED as unavailable.
`;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('export ')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function parseArgs(argv) {
  const args = {
    write: false,
    courseId: DEFAULT_COURSE_ID,
    notebookId: DEFAULT_NOTEBOOK_ID,
  };
  for (const arg of argv) {
    if (arg === '--write') {
      args.write = true;
    } else if (arg.startsWith('--course-id=')) {
      args.courseId = arg.slice('--course-id='.length).trim();
    } else if (arg.startsWith('--notebook-id=')) {
      args.notebookId = arg.slice('--notebook-id='.length).trim();
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage:
  node scripts/maintenance/backfill-sketchmol-supplementary-tables.mjs [--write] [--course-id=<id>] [--notebook-id=<id>]

Default is dry-run. The default target is the Moleclue Design SketchMol notebook.`);
      process.exit(0);
    }
  }
  return args;
}

async function main() {
  loadEnvFile(path.join(ROOT, '.env'));
  loadEnvFile(path.join(ROOT, '.env.local'));

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured. Add it to .env.local or the shell env.');
  }

  const args = parseArgs(process.argv.slice(2));
  const require = createRequire(import.meta.url);
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const notebook = await prisma.notebook.findUnique({
      where: { id: args.notebookId },
      include: {
        markdownSections: {
          select: { id: true, title: true, order: true },
          orderBy: { order: 'asc' },
        },
      },
    });
    if (!notebook) {
      throw new Error(`Notebook not found: ${args.notebookId}`);
    }
    if (notebook.courseId !== args.courseId) {
      throw new Error(
        `Notebook ${args.notebookId} belongs to course ${notebook.courseId}, not ${args.courseId}.`,
      );
    }

    const existing = notebook.markdownSections.find((section) => section.title === SECTION_TITLE);
    const nextOrder =
      notebook.markdownSections.reduce((max, section) => Math.max(max, section.order), -1) + 1;
    const sourceMeta = {
      sourceKind: 'pdf',
      sourceTitle: SOURCE_TITLE,
      sourceHash: SOURCE_HASH,
      parser: 'manual-pdf-table-backfill',
      sourceRefs: [
        {
          pageNumber: 29,
          sectionTitle: 'Supplementary Table 1',
          note: 'Exact molecule generation metrics.',
        },
        {
          pageNumber: 30,
          sectionTitle: 'Supplementary Table 2',
          note: 'Exact property-constrained generation MAE metrics.',
        },
      ],
    };

    const plan = {
      mode: args.write ? 'write' : 'dry-run',
      courseId: args.courseId,
      notebookId: args.notebookId,
      action: existing ? 'update-section' : 'create-section',
      existingSectionId: existing?.id || null,
      order: existing?.order ?? nextOrder,
      title: SECTION_TITLE,
    };
    console.log(JSON.stringify(plan, null, 2));
    if (!args.write) return;

    if (existing) {
      await prisma.markdownNotebookSection.update({
        where: { id: existing.id },
        data: {
          markdown: MARKDOWN,
          summary: SECTION_SUMMARY,
          sourceMeta,
        },
      });
    } else {
      await prisma.markdownNotebookSection.create({
        data: {
          notebookId: args.notebookId,
          courseId: args.courseId,
          title: SECTION_TITLE,
          order: nextOrder,
          markdown: MARKDOWN,
          summary: SECTION_SUMMARY,
          sourceMeta,
        },
      });
    }

    const sectionCount = await prisma.markdownNotebookSection.count({
      where: { notebookId: args.notebookId },
    });
    await prisma.notebook.update({
      where: { id: args.notebookId },
      data: {
        sectionCount,
        contentVersion: { increment: 1 },
      },
    });

    console.log(
      JSON.stringify(
        {
          status: 'ok',
          notebookId: args.notebookId,
          sectionCount,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
