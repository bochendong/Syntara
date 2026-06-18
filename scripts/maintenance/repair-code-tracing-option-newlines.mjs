#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const REPAIR_VERSION = 'code-tracing-option-newline-v1';

function loadEnvLocal() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || line.trim().startsWith('#')) continue;

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] ??= value;
  }
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function argValue(name) {
  const prefix = `--${name}=`;
  const matched = process.argv.find((arg) => arg.startsWith(prefix));
  return matched ? matched.slice(prefix.length).trim() : null;
}

function cleanText(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function decodeEscapedNewlines(value) {
  return String(value ?? '')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n');
}

function formatCodeTracingOptionLabel(label) {
  const text = cleanText(decodeEscapedNewlines(label));
  if (!text.includes('\n') || text.trimStart().startsWith('```')) return text;
  return `\`\`\`python\n${text}\n\`\`\``;
}

function normalizePublicContent(publicContent) {
  if (
    !publicContent ||
    typeof publicContent !== 'object' ||
    publicContent.type !== 'choice' ||
    !Array.isArray(publicContent.options)
  ) {
    return publicContent;
  }

  return {
    ...publicContent,
    options: publicContent.options.map((option) => {
      if (!option || typeof option !== 'object' || typeof option.label !== 'string') {
        return option;
      }
      if (!option.label.includes('\\n') && !option.label.includes('\\r')) return option;
      return {
        ...option,
        label: formatCodeTracingOptionLabel(option.label),
      };
    }),
  };
}

function optionLabelsWithEscapedNewlines(publicContent) {
  if (
    !publicContent ||
    typeof publicContent !== 'object' ||
    !Array.isArray(publicContent.options)
  ) {
    return [];
  }

  return publicContent.options
    .filter((option) => typeof option?.label === 'string' && /\\[nr]/.test(option.label))
    .map((option) => ({ id: option.id, label: option.label }));
}

async function main() {
  loadEnvLocal();

  const write = hasFlag('write');
  const courseId = argValue('course-id');
  const prisma = new PrismaClient();

  try {
    const where = {
      type: 'choice',
      ...(courseId ? { courseId } : {}),
    };
    const rows = await prisma.notebookProblem.findMany({
      where,
      select: {
        id: true,
        courseId: true,
        problemNumber: true,
        title: true,
        publicContentJson: true,
        sourceMeta: true,
      },
      orderBy: [{ courseId: 'asc' }, { problemNumber: 'asc' }],
    });

    const codeTracingRows = rows.filter(
      (row) => row.sourceMeta?.sourceQuestionType === 'code_tracing',
    );
    const updates = codeTracingRows
      .map((row) => {
        const publicContentJson = normalizePublicContent(row.publicContentJson);
        const beforeLabels = optionLabelsWithEscapedNewlines(row.publicContentJson);
        const afterLabels = optionLabelsWithEscapedNewlines(publicContentJson);
        const sourceMeta =
          row.sourceMeta && typeof row.sourceMeta === 'object' && !Array.isArray(row.sourceMeta)
            ? row.sourceMeta
            : {};
        const nextSourceMeta =
          beforeLabels.length > 0
            ? {
                ...sourceMeta,
                choiceOptionEscapedNewlineRepair: REPAIR_VERSION,
                choiceOptionEscapedNewlineRepairAt:
                  sourceMeta.choiceOptionEscapedNewlineRepairAt ?? new Date().toISOString(),
              }
            : sourceMeta;
        return {
          row,
          publicContentJson,
          sourceMeta: nextSourceMeta,
          beforeLabels,
          afterLabels,
          changed:
            !sameJson(row.publicContentJson, publicContentJson) ||
            !sameJson(row.sourceMeta, nextSourceMeta),
        };
      })
      .filter((item) => item.changed);

    const preview = {
      mode: write ? 'write' : 'dry-run',
      scannedChoiceProblems: rows.length,
      scannedCodeTracingChoiceProblems: codeTracingRows.length,
      changedProblemCount: updates.length,
      changedProblems: updates.map(({ row, beforeLabels, afterLabels }) => ({
        id: row.id,
        courseId: row.courseId,
        problemNumber: row.problemNumber,
        title: row.title,
        beforeLabels,
        afterEscapedLabelCount: afterLabels.length,
      })),
    };
    console.log(JSON.stringify(preview, null, 2));

    if (!write) return;

    await prisma.$transaction(
      updates.map(({ row, publicContentJson, sourceMeta }) =>
        prisma.notebookProblem.update({
          where: { id: row.id },
          data: { publicContentJson, sourceMeta },
        }),
      ),
      { timeout: 60_000 },
    );

    const afterRows = await prisma.notebookProblem.findMany({
      where,
      select: { id: true, publicContentJson: true, sourceMeta: true },
    });
    const remaining = afterRows.filter(
      (row) =>
        row.sourceMeta?.sourceQuestionType === 'code_tracing' &&
        optionLabelsWithEscapedNewlines(row.publicContentJson).length > 0,
    );
    console.log(
      JSON.stringify(
        {
          mode: 'write-complete',
          updatedProblemCount: updates.length,
          remainingCodeTracingEscapedNewlineProblems: remaining.length,
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
  process.exitCode = 1;
});
