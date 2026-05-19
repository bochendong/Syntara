import type { ProblemSourcePackage, ProblemStructureItem } from './import.core';

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function compactSourcePackageForPrompt(sourcePackage: ProblemSourcePackage): string {
  return JSON.stringify({
    fileName: sourcePackage.fileName,
    fileType: sourcePackage.fileType,
    pageCount: sourcePackage.pageCount,
    pages: sourcePackage.sourcePages.map((page) => ({
      id: page.id,
      pageNumber: page.pageNumber,
      title: page.title,
      roleHint: page.roleHint,
      text: page.text.slice(0, 5000),
    })),
    warnings: sourcePackage.warnings,
  }).slice(0, 42000);
}

export function contextBlocksFromStem(stem: string): ProblemStructureItem['contextBlocks'] {
  const blocks: ProblemStructureItem['contextBlocks'] = [];
  if (
    /\b(?:properties|conditions|assumptions|requirements|definitions?)\b|(?:^|\n)\s*[-*]\s+\([A-Z]\d+\)/i.test(
      stem,
    )
  ) {
    blocks.push({
      kind: /definitions?/i.test(stem) ? 'definition' : 'conditions',
      title: /definitions?/i.test(stem) ? 'Definitions' : 'Conditions / requirements',
      summary: normalizeWhitespace(stem).slice(0, 600),
    });
  }
  if (/\bHint\s*:/i.test(stem)) {
    blocks.push({
      kind: 'hint',
      title: 'Hint',
      summary: normalizeWhitespace(stem.match(/\bHint\s*:[\s\S]*$/i)?.[0] || 'Hint present.'),
    });
  }
  if (/\|.+\||\btable\b|表\s*\d+/i.test(stem)) {
    blocks.push({
      kind: 'table',
      title: 'Table / data',
      summary: 'The problem references tabular data.',
    });
  }
  if (/\bdiagram\b|\bfigure\b|图\s*\d+|->|→|↦/i.test(stem)) {
    blocks.push({
      kind: 'diagram',
      title: 'Diagram / relationship',
      summary: 'The problem references a visual or relationship graph.',
    });
  }
  if (/```|\bdef\s+\w+\s*\(|\bclass\s+\w+\s*\(/i.test(stem)) {
    blocks.push({ kind: 'code', title: 'Code', summary: 'The problem includes code context.' });
  }
  return blocks;
}
