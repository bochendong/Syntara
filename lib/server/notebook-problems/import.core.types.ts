import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { NotebookProblemImportDraft } from '@/lib/problem-bank';

export const execFileAsync = promisify(execFile);

export type ImportUsageSummary = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  estimatedCostCredits: number | null;
};

export interface ProblemSourcePage {
  id: string;
  sourceIndex: number;
  pageNumber: number;
  sourceLabel: string;
  title: string;
  text: string;
  charCount: number;
  roleHint: 'cover' | 'instructions' | 'problem' | 'additional_work' | 'blank' | 'unknown';
}

export interface ProblemSourceImage {
  id: string;
  pageNumber: number;
  src?: string;
  width?: number;
  height?: number;
  description?: string;
}

export interface ProblemSourcePackage {
  fileName: string;
  fileType: 'pdf' | 'pptx' | 'md' | 'txt' | 'unknown';
  sourceText: string;
  sourcePages: ProblemSourcePage[];
  sourceImages: ProblemSourceImage[];
  pageCount: number;
  parser: string;
  warnings: string[];
  metadata: {
    sourceTextLength: number;
    imageCount: number;
    generatedAt: number;
  };
}

export interface ProblemSourceAnchor {
  pageNumber?: number;
  sourcePageId?: string;
  textQuote?: string;
  role?: string;
}

export interface ProblemStructureItem {
  index: number;
  topLevelLabel: string;
  title: string;
  problemTypeHint:
    | 'choice'
    | 'proof'
    | 'calculation'
    | 'short_answer'
    | 'code'
    | 'fill_blank'
    | 'unknown';
  pageStart?: number;
  pageEnd?: number;
  sourceAnchors: ProblemSourceAnchor[];
  subparts: Array<{
    label: string;
    prompt: string;
    points?: number;
  }>;
  contextBlocks: Array<{
    kind: 'definition' | 'conditions' | 'table' | 'diagram' | 'code' | 'data' | 'hint' | 'other';
    title: string;
    summary: string;
  }>;
  visualRefs: string[];
  confidence: number;
}

export interface ProblemStructurePlan {
  sourceSummary: string;
  nonProblemRegions: Array<{
    kind: 'cover' | 'instructions' | 'additional_work' | 'blank' | 'header_footer' | 'other';
    pageNumbers: number[];
    reason: string;
  }>;
  sharedContexts: Array<{
    id: string;
    title: string;
    pageNumbers: number[];
    summary: string;
  }>;
  topLevelProblems: ProblemStructureItem[];
  warnings: string[];
  generatedBy: 'llm' | 'heuristic';
}

export interface ProblemDraftGenerationResult {
  drafts: NotebookProblemImportDraft[];
  usage: ImportUsageSummary | null;
  warnings: string[];
}

export interface ProblemImportQualityCheck {
  id: string;
  title: string;
  status: 'pass' | 'warn' | 'fail';
  details: string[];
  draftIndexes?: number[];
}

export interface ProblemImportQualityReport {
  passed: boolean;
  blockingIssueCount: number;
  warningIssueCount: number;
  checks: ProblemImportQualityCheck[];
  summary: string;
}

export interface ProblemImportPipelineResult {
  sourcePackage: ProblemSourcePackage;
  structurePlan: ProblemStructurePlan;
  draftResult: ProblemDraftGenerationResult;
  qualityReport: ProblemImportQualityReport;
  usage: ImportUsageSummary | null;
}

export const problemStructurePlanSchema = z.object({
  sourceSummary: z.string().trim().min(1).max(4000).default('Source package analyzed.'),
  nonProblemRegions: z
    .array(
      z.object({
        kind: z
          .enum(['cover', 'instructions', 'additional_work', 'blank', 'header_footer', 'other'])
          .default('other'),
        pageNumbers: z.array(z.number().int().positive()).max(80).default([]),
        reason: z.string().trim().min(1).max(1000).default('Detected as non-problem material.'),
      }),
    )
    .max(80)
    .default([]),
  sharedContexts: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(80),
        title: z.string().trim().min(1).max(200),
        pageNumbers: z.array(z.number().int().positive()).max(80).default([]),
        summary: z.string().trim().min(1).max(2000).default('Shared context.'),
      }),
    )
    .max(40)
    .default([]),
  topLevelProblems: z
    .array(
      z.object({
        index: z.number().int().positive(),
        topLevelLabel: z.string().trim().min(1).max(80),
        title: z.string().trim().min(1).max(200),
        problemTypeHint: z
          .enum(['choice', 'proof', 'calculation', 'short_answer', 'code', 'fill_blank', 'unknown'])
          .default('unknown'),
        pageStart: z.number().int().positive().optional(),
        pageEnd: z.number().int().positive().optional(),
        sourceAnchors: z
          .array(
            z.object({
              pageNumber: z.number().int().positive().optional(),
              sourcePageId: z.string().trim().min(1).max(120).optional(),
              textQuote: z.string().trim().min(1).max(800).optional(),
              role: z.string().trim().min(1).max(80).optional(),
            }),
          )
          .max(24)
          .default([]),
        subparts: z
          .array(
            z.object({
              label: z.string().trim().min(1).max(40),
              prompt: z.string().trim().min(1).max(2000),
              points: z.number().int().min(0).max(1000).optional(),
            }),
          )
          .max(32)
          .default([]),
        contextBlocks: z
          .array(
            z.object({
              kind: z
                .enum([
                  'definition',
                  'conditions',
                  'table',
                  'diagram',
                  'code',
                  'data',
                  'hint',
                  'other',
                ])
                .default('other'),
              title: z.string().trim().min(1).max(160),
              summary: z.string().trim().min(1).max(2000),
            }),
          )
          .max(32)
          .default([]),
        visualRefs: z.array(z.string().trim().min(1).max(200)).max(24).default([]),
        confidence: z.number().min(0).max(1).default(0.6),
      }),
    )
    .max(200)
    .default([]),
  warnings: z.array(z.string().trim().min(1).max(1000)).max(80).default([]),
  generatedBy: z.enum(['llm', 'heuristic']).default('heuristic'),
});
