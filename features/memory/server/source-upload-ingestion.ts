import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { LanguageModel } from 'ai';
import { Prisma, type PrismaClient } from '@/lib/server/generated-prisma';
import type { NotebookProblemImportDraft, NotebookProblemPublicContent } from '@/lib/problem-bank';
import {
  createProblemImportBatch,
  markProblemImportBatchCommitted,
} from '@/lib/server/notebook-problems/import-batch-store';
import {
  createOwnedNotebook,
  refreshCourseSummaryFields,
} from '@/lib/server/repositories/notebook-repository';
import { toPrismaNullableJson } from '@/lib/server/prisma-json';
import { extractProblemDraftsFromText } from '@/features/problems/server/import';
import {
  createCourseProblemsFromDrafts,
  ensureLegacyProblemsBackfilledForCourse,
} from '@/features/problems/server/service';
import {
  planSourceMemoryIngestion,
  type SourceIngestionInput,
  type SourceMemoryArtifact,
} from '@/features/memory/server/source-ingestion';
import {
  buildSourcePacket,
  classifySourceDocumentType,
  type SourcePacket,
  type SourcePacketNotebookSection,
  type SourceStructuredNotes,
  type SourceUsageProfile,
} from '@/features/memory/server/source-packet';
import { refreshKnowledgeCache } from '@/features/memory/server/knowledge-cache';
import { routeLayeredMemoryWriteCandidates } from '@/features/memory/server/write-routing';
import type { MemoryWriteCandidate } from '@/lib/server/memory-write-router';
import { callLLM } from '@/lib/ai/llm';
import { generateImage, IMAGE_PROVIDERS } from '@/lib/media/image-providers';
import type { ImageGenerationResult, ImageProviderId } from '@/lib/media/types';
import {
  getServerImageProviders,
  resolveImageApiKey,
  resolveImageBaseUrl,
} from '@/lib/server/provider-config';

export type SourceUploadKind =
  | 'pdf'
  | 'markdown'
  | 'plain_text'
  | 'pptx'
  | 'problem_bank'
  | 'other';

export type SourceUploadNotebookCoverResult = {
  status: 'generated' | 'skipped' | 'failed';
  imagePath: string | null;
  providerId: ImageProviderId | null;
  model: string | null;
  prompt: string | null;
  reason: string | null;
};

export type SourceUploadIngestionResult = {
  source: {
    title: string;
    kind: SourceUploadKind;
    hash: string;
    rawFileHash: string | null;
    openaiFileId: string | null;
    parser: string;
    textChars: number;
    processedChars: number;
    truncated: boolean;
    courseCode: string | null;
  };
  classification: {
    documentType: SourcePacket['classification']['documentType'];
    usageProfile: SourceUsageProfile;
    usageProfileConfidence: number;
    usageProfileReasons: string[];
    allQuestionUpload: boolean;
    problemSignalCount: number;
    templateSignalCount: number;
    topic: string;
    confidence: number;
    reasons: string[];
  };
  knowledgeGraph: {
    factId: string | null;
    nodeCount: number;
    edgeCount: number;
  };
  problems: {
    extractedCount: number;
    insertedCount: number;
    duplicateCount: number;
    skippedAsDuplicate: Array<{ title: string; reason: 'same_upload' | 'existing_course' }>;
    importBatchId: string | null;
    usage: {
      inputTokens: number;
      outputTokens: number;
      cachedInputTokens: number;
      estimatedCostCredits: number | null;
    } | null;
  };
  memory: {
    writtenCount: number;
    templateCount: number;
    publicPlatformMemoryCount: number;
    publicCourseMemoryCount: number;
    publicNotebookMemoryCount: number;
    privateMemoryCount: number;
    skippedPublicNotebookMemory: boolean;
    layers: Array<{
      layer: string;
      status: 'written' | 'skipped' | 'available';
      summary: string;
    }>;
  };
  notebook: {
    id: string;
    name: string;
    created: boolean;
    coverImagePath: string | null;
    coverStatus: SourceUploadNotebookCoverResult['status'];
    sectionId: string | null;
    sectionTitle: string | null;
    sections: Array<{ id: string; title: string; summary: string | null }>;
  } | null;
  notebookCover: SourceUploadNotebookCoverResult | null;
  tokenPolicy: string[];
};

type ExistingProblemFingerprint = {
  id: string;
  title: string;
  fingerprint: string;
};

type ProblemEvidenceProfile = {
  blockCount: number;
  problemLikeBlockCount: number;
  problemDensity: number;
  explicitProblemHeadingCount: number;
  numberedProblemLineCount: number;
  assessmentSignalCount: number;
};

type CourseForSourceCover = {
  id: string;
  name: string;
  courseCode: string | null;
  language: string | null;
};

type IngestCourseSourceUploadArgs = {
  prisma: PrismaClient;
  userId: string;
  courseId: string;
  sourceTitle: string;
  sourceKind?: SourceUploadKind;
  sourceFileMime?: string | null;
  text: string;
  rawFileHash?: string | null;
  openaiFileId?: string | null;
  parser?: string | null;
  pageCount?: number | null;
  slideCount?: number | null;
  targetNotebookId?: string | null;
  language?: 'zh-CN' | 'en-US';
  usageProfile?: SourceUsageProfile;
  model?: LanguageModel;
};

const MAX_SOURCE_TEXT_CHARS = 180_000;
const MAX_PROBLEM_EXTRACTION_CHARS = 70_000;
const MAX_MARKDOWN_SECTION_CHARS = 220_000;
const SOURCE_COVER_WIDTH = 1024;
const SOURCE_COVER_HEIGHT = 1448;
const SOURCE_COVER_PUBLIC_PREFIX = '/generated-source-covers';
const SOURCE_COVER_PUBLIC_ROOT = path.join(process.cwd(), 'public', 'generated-source-covers');
const KNOWLEDGE_GRAPH_MAX_CONCEPTS = 32;
const KNOWLEDGE_GRAPH_CONCEPT_STOPWORDS = new Set([
  'of',
  'to',
  'in',
  'on',
  'as',
  'by',
  'for',
  'and',
  'the',
  'pdf',
  'article',
  'doi',
  'https',
]);

function compact(input: string | null | undefined, maxChars: number): string {
  const text = String(input || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trim()}...`;
}

function sentenceFragment(input: string | null | undefined, maxChars: number): string {
  return compact(input, maxChars).replace(/[。.!！？!?]+$/g, '');
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function normalizeSpaces(input: string): string {
  return input.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function collapseSpaces(input: string): string {
  return input.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function tokenize(input: string): string[] {
  const normalized = normalizeSpaces(input);
  const latin = normalized.match(/[a-z][a-z0-9_+\-]{1,}/g) || [];
  const han = normalized.match(/[\u3400-\u9fff]{2,}/g) || [];
  return Array.from(new Set([...latin, ...han])).slice(0, 80);
}

function stripExtension(name: string): string {
  return name.replace(/\.[a-z0-9]{1,8}$/i, '').trim();
}

function cleanTitle(input: string, fallback = '上传资料'): string {
  const title = stripExtension(input).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return compact(title || fallback, 90);
}

function isDocumentTitleLine(line: string): boolean {
  const trimmed = collapseSpaces(line);
  if (trimmed.length < 8 || trimmed.length > 120) return false;
  if (!/[A-Za-z\u3400-\u9fff]/.test(trimmed)) return false;
  if (
    /\b(?:doi|https?:\/\/|received|accepted|published|department|university|e-?mail|abstract|references|nature machine intelligence|article)\b/i.test(
      trimmed,
    )
  ) {
    return false;
  }
  if ((trimmed.match(/,/g) || []).length > 1) return false;
  if (/^\d+\s*$/.test(trimmed)) return false;
  return true;
}

function inferDocumentTitle(text: string): string | null {
  const lines = text
    .split('\n')
    .slice(0, 90)
    .map((line) => collapseSpaces(line))
    .filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!isDocumentTitleLine(line)) continue;
    const titleLines = [line];
    for (let offset = 1; offset <= 2; offset += 1) {
      const next = lines[index + offset];
      if (!next || !isDocumentTitleLine(next)) break;
      if (/\.$/.test(titleLines[titleLines.length - 1])) break;
      titleLines.push(next);
    }
    const title = titleLines.join(' ');
    const wordCount = title.split(/\s+/).length;
    if (wordCount >= 3 && wordCount <= 24) return title;
  }

  return null;
}

function sourceKindForProblemImport(kind: SourceUploadKind): 'pdf' | 'manual' {
  return kind === 'pdf' ? 'pdf' : 'manual';
}

function sourceKindForMemory(
  kind: SourceUploadKind,
): NonNullable<SourceIngestionInput['sourceKind']> {
  if (kind === 'pptx') return 'other';
  return kind;
}

function problemStem(content: NotebookProblemPublicContent): string {
  if (content.type === 'fill_blank') return content.stemTemplate;
  const common = 'stem' in content ? content.stem : '';
  if (content.type === 'choice') {
    return [common, ...content.options.map((option) => option.label)].join('\n');
  }
  if (content.type === 'code') {
    return [
      common,
      content.functionSignature || '',
      content.starterCode || '',
      content.statementSections
        ?.map((section) =>
          [section.title, section.body, section.items.join('\n'), section.code].join('\n'),
        )
        .join('\n') || '',
    ].join('\n');
  }
  return common;
}

function problemFingerprint(input: {
  title: string;
  type: string;
  publicContent: NotebookProblemPublicContent;
}): string {
  const normalized = normalizeSpaces(
    [input.type, input.title, problemStem(input.publicContent)].join('\n'),
  )
    .replace(/[^\p{Letter}\p{Number}\s_+\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return sha256(normalized.slice(0, 4000));
}

function problemSignalCount(text: string): number {
  const profile = problemEvidenceProfile(text);
  return (
    profile.explicitProblemHeadingCount +
    profile.numberedProblemLineCount +
    profile.problemLikeBlockCount +
    profile.assessmentSignalCount
  );
}

function looksLikeBibliographyLine(line: string): boolean {
  return (
    /^\s*\d{1,3}\.\s+[A-Z][A-Za-z'’.-]+,\s+[A-Z]/.test(line) ||
    /\b(?:et al\.|doi|https?:\/\/|journal|conference|preprint|nature|science|proc\.)\b/i.test(line)
  );
}

function looksLikeNumberedProblemLine(line: string): boolean {
  const trimmed = line.trim();
  if (looksLikeBibliographyLine(trimmed)) return false;
  if (/^\d{1,3}[).]\s+(?:[A-Z][A-Za-z'’.-]+,\s+[A-Z]|https?:\/\/)/.test(trimmed)) return false;
  return /^\d{1,3}[).]\s+\S/.test(trimmed) || /^[（(]?\d{1,3}[）)]\s+\S/.test(trimmed);
}

function hasPromptVerbSignal(text: string): boolean {
  return /\b(?:prove|calculate|solve|show that|write a function|what is)\b/i.test(text);
}

function hasCodeTaskSignal(text: string): boolean {
  return /\b(?:implement|write)\s+(?:a|the|this)?\s*(?:function|method|class|program|procedure|algorithm)\b/i.test(
    text,
  );
}

function problemEvidenceProfile(text: string): ProblemEvidenceProfile {
  const lines = text.split('\n');
  const explicitProblemHeadingCount = Array.from(
    text.matchAll(/^\s*(?:problem|question|exercise|q)\s*\d+[\).:\s]/gim),
  ).length;
  const numberedProblemLineCount = lines.filter(looksLikeNumberedProblemLine).length;
  const assessmentSignalCount = Array.from(
    text.matchAll(
      /答案|answer key|points?|marks?|rubric|multiple choice|选择题|简答题|证明题|计算题|编程题|题目|练习|public tests|secret tests/gi,
    ),
  ).length;
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length >= 12);
  const problemLikeBlockCount = blocks.filter((block) => {
    const firstLine = block.split('\n').find((line) => line.trim()) || block;
    if (/^\s*(?:problem|question|exercise|q)\s*\d+[\).:\s]/i.test(firstLine)) return true;
    if (looksLikeNumberedProblemLine(firstLine)) return true;
    if (/^(?:选择题|简答题|证明题|计算题|编程题|题目|练习)/.test(block)) return true;
    return hasPromptVerbSignal(block) || hasCodeTaskSignal(block);
  }).length;
  const blockCount = Math.max(blocks.length, 1);
  return {
    blockCount,
    problemLikeBlockCount,
    problemDensity: problemLikeBlockCount / blockCount,
    explicitProblemHeadingCount,
    numberedProblemLineCount,
    assessmentSignalCount,
  };
}

function templateSignalCount(text: string, artifacts: SourceMemoryArtifact[]): number {
  const textSignals = [
    /@template-origin|@signature|@htdf|@htdd|check-expect/gi,
    /\bdocstring\b|\bdoctest\b|starter code/gi,
    /representation invariants?|\bRI\b|instance attributes/gi,
  ].reduce((count, pattern) => count + Array.from(text.matchAll(pattern)).length, 0);
  return textSignals + artifacts.filter((artifact) => artifact.staticInjectionCandidate).length;
}

function looksWorthProblemExtraction(text: string, sourceKind: SourceUploadKind): boolean {
  if (sourceKind === 'problem_bank') return true;
  const profile = problemEvidenceProfile(text);
  if (profile.explicitProblemHeadingCount >= 2) return true;
  if (profile.numberedProblemLineCount >= 3 && profile.problemDensity >= 0.12) return true;
  if (profile.problemLikeBlockCount >= 3 && profile.problemDensity >= 0.12) return true;
  return profile.assessmentSignalCount >= 2 && profile.problemLikeBlockCount >= 2;
}

function classifyAllQuestionUpload(args: {
  text: string;
  sourceKind: SourceUploadKind;
  extractedCount: number;
}): boolean {
  if (args.extractedCount === 0) return false;
  if (args.sourceKind === 'problem_bank') return true;

  const profile = problemEvidenceProfile(args.text);
  return (
    args.extractedCount >= 3 &&
    (profile.problemDensity >= 0.45 ||
      (profile.assessmentSignalCount >= 2 &&
        profile.problemLikeBlockCount >= Math.max(3, Math.floor(profile.blockCount * 0.4))))
  );
}

function extractTopic(args: {
  sourceTitle: string;
  text: string;
  artifacts: SourceMemoryArtifact[];
  drafts: NotebookProblemImportDraft[];
}): string {
  const heading =
    args.text.match(/^\s{0,3}#{1,3}\s+(.+)$/m)?.[1] ||
    args.text.match(/^\s*(?:Topic|Unit|Chapter|Lecture|Module)\s*[:\-]\s*(.+)$/im)?.[1] ||
    args.text.match(/^\s*(?:主题|章节|单元|讲义)\s*[:：]\s*(.+)$/m)?.[1];
  const artifactTitle = args.artifacts.find(
    (artifact) =>
      artifact.artifactKind !== 'knowledge_source' &&
      artifact.artifactKind !== 'discarded_generic_concept',
  )?.title;
  const draftTag = args.drafts.flatMap((draft) => draft.tags)[0];
  return cleanTitle(
    heading || inferDocumentTitle(args.text) || artifactTitle || draftTag || args.sourceTitle,
  );
}

function notebookScore(
  notebook: { name: string; description: string | null; tags: string[] },
  topic: string,
  text: string,
): number {
  const notebookTokens = new Set(
    tokenize([notebook.name, notebook.description || '', notebook.tags.join(' ')].join('\n')),
  );
  const topicTokens = tokenize(`${topic}\n${text.slice(0, 1600)}`);
  let score = 0;
  for (const token of topicTokens) {
    if (notebookTokens.has(token)) score += token.length >= 4 ? 3 : 1;
  }
  if (normalizeSpaces(topic).includes(normalizeSpaces(notebook.name))) score += 8;
  if (normalizeSpaces(notebook.name).includes(normalizeSpaces(topic))) score += 8;
  return score;
}

async function resolveNotebookForSource(args: {
  prisma: PrismaClient;
  userId: string;
  courseId: string;
  topic: string;
  text: string;
  targetNotebookId?: string | null;
}): Promise<{ id: string; name: string; created: boolean }> {
  if (args.targetNotebookId?.trim()) {
    const explicit = await args.prisma.notebook.findFirst({
      where: { id: args.targetNotebookId.trim(), ownerId: args.userId, courseId: args.courseId },
      select: { id: true, name: true },
    });
    if (explicit) return { ...explicit, created: false };
  }

  const notebooks = await args.prisma.notebook.findMany({
    where: { ownerId: args.userId, courseId: args.courseId },
    select: { id: true, name: true, description: true, tags: true },
    orderBy: [{ updatedAt: 'desc' }],
    take: 80,
  });
  const scored = notebooks
    .map((notebook) => ({
      notebook,
      score: notebookScore(notebook, args.topic, args.text),
    }))
    .sort((a, b) => b.score - a.score);
  if (scored[0] && scored[0].score >= 7) {
    return { id: scored[0].notebook.id, name: scored[0].notebook.name, created: false };
  }

  const created = await createOwnedNotebook(args.prisma, args.userId, {
    courseId: args.courseId,
    name: args.topic,
    description: `由上传资料整理生成：${args.topic}`,
    tags: tokenize(args.topic).slice(0, 8),
    notebookKind: 'markdown',
    language: 'zh-CN',
  });
  return { id: created.id, name: created.name, created: true };
}

function buildSearchableMarkdown(args: {
  sourceTitle: string;
  sourceKind: SourceUploadKind;
  topic: string;
  text: string;
  courseCode: string | null;
  artifacts: SourceMemoryArtifact[];
  drafts: NotebookProblemImportDraft[];
  sourceHash: string;
}): string {
  const templateLines = args.artifacts
    .filter((artifact) => artifact.staticInjectionCandidate)
    .map((artifact) => `- ${artifact.title}: ${artifact.reasons.join(' ')}`);
  const problemLines = args.drafts
    .slice(0, 12)
    .map((draft, index) => `- ${index + 1}. ${draft.title}`);
  return compact(
    [
      `# ${args.topic}`,
      '',
      `来源：${args.sourceTitle}`,
      `类型：${args.sourceKind}`,
      args.courseCode ? `课程：${args.courseCode}` : '',
      `sourceHash：${args.sourceHash}`,
      '',
      '## 可查询摘要',
      `这份资料已作为课程知识来源写入。后续回答应优先检索本笔记本纯文本内容，再结合题库与公共记忆。`,
      '',
      templateLines.length ? '## 识别到的课程要求 / 模板信号' : '',
      ...templateLines,
      '',
      problemLines.length ? '## 同时识别到的题目线索' : '',
      ...problemLines,
      '',
      '## 原文整理',
      compact(args.text, MAX_MARKDOWN_SECTION_CHARS - 4000),
    ]
      .filter((line) => line !== '')
      .join('\n'),
    MAX_MARKDOWN_SECTION_CHARS,
  );
}

async function appendMarkdownSections(args: {
  prisma: PrismaClient;
  courseId: string;
  notebookId: string;
  sections: Array<{
    title: string;
    markdown: string;
    summary: string;
    sourceMeta: unknown;
  }>;
}): Promise<Array<{ id: string; title: string; summary: string | null }>> {
  if (args.sections.length === 0) return [];
  const maxOrder = await args.prisma.markdownNotebookSection.aggregate({
    where: { notebookId: args.notebookId },
    _max: { order: true },
  });
  const startOrder = (maxOrder._max.order ?? -1) + 1;
  const sections: Array<{ id: string; title: string; summary: string | null }> = [];
  for (const [index, section] of args.sections.entries()) {
    const created = await args.prisma.markdownNotebookSection.create({
      data: {
        notebookId: args.notebookId,
        courseId: args.courseId,
        title: cleanTitle(section.title, '上传资料'),
        order: startOrder + index,
        markdown: section.markdown,
        summary: section.summary,
        sourceMeta: toPrismaNullableJson(section.sourceMeta),
      },
      select: { id: true, title: true, summary: true },
    });
    sections.push(created);
  }
  const sectionCount = await args.prisma.markdownNotebookSection.count({
    where: { notebookId: args.notebookId },
  });
  await args.prisma.notebook.update({
    where: { id: args.notebookId },
    data: {
      notebookKind: 'markdown',
      sectionCount,
      contentVersion: { increment: 1 },
      updatedAt: new Date(),
    },
  });
  await refreshCourseSummaryFields(args.prisma, args.courseId);
  return sections;
}

function safePathSegment(input: string, fallback: string): string {
  const value = input
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return value || fallback;
}

function imageProviderId(value: string): ImageProviderId | null {
  return value in IMAGE_PROVIDERS ? (value as ImageProviderId) : null;
}

function resolveSourceCoverImageProvider(): {
  providerId: ImageProviderId;
  apiKey: string;
  baseUrl?: string;
  model?: string;
} | null {
  const providers = getServerImageProviders();
  for (const [rawProviderId, serverConfig] of Object.entries(providers)) {
    const providerId = imageProviderId(rawProviderId);
    if (!providerId) continue;
    const apiKey = resolveImageApiKey(providerId);
    if (!apiKey) continue;
    const model = serverConfig.models?.[0] || IMAGE_PROVIDERS[providerId].models[0]?.id;
    return {
      providerId,
      apiKey,
      baseUrl: resolveImageBaseUrl(providerId) || serverConfig.baseUrl,
      model,
    };
  }
  return null;
}

function sourceCoverPrompt(args: {
  course: CourseForSourceCover;
  sourceTitle: string;
  topic: string;
  sourcePacket: SourcePacket;
}): string {
  const usageProfile = args.sourcePacket.classification.usageProfile;
  const notebookKnowledge = args.sourcePacket.structuredNotes?.notebookKnowledge;
  const courseControl = args.sourcePacket.structuredNotes?.courseControl;
  const sectionLines = (notebookKnowledge?.sections || args.sourcePacket.notebookSections)
    .slice(0, 5)
    .map((section, index) => {
      const title = 'title' in section ? section.title : `要点 ${index + 1}`;
      const summary = 'summary' in section ? section.summary : '';
      return `${index + 1}. ${compact(`${title}：${summary}`, 120)}`;
    });
  const conceptLines = (notebookKnowledge?.concepts || [])
    .slice(0, 8)
    .map((item) => `${item.label}：${compact(item.detail, 80)}`);
  const methodLines = (notebookKnowledge?.methods || [])
    .slice(0, 6)
    .map((item) => `${item.label}：${compact(item.detail, 80)}`);
  const learningPathLines = (notebookKnowledge?.learningPath || [])
    .slice(0, 5)
    .map((item, index) => `${index + 1}. ${compact(item, 100)}`);
  const takeawayLines = (notebookKnowledge?.keyTakeaways || [])
    .slice(0, 5)
    .map((item) => compact(item, 100));
  const boundaryLines = (courseControl?.boundaryWarnings || [])
    .slice(0, 4)
    .map((item) => compact(item, 90));
  const profileInstruction =
    usageProfile === 'research'
      ? '科研论文封面：突出研究问题、方法 pipeline、实验指标、证据边界和可检索关键词。'
      : usageProfile === 'daily_use'
        ? '日常资料封面：突出关键信息、用途、后续动作、时间线/清单和检索入口。'
        : '大学课程封面：突出学习目标、核心概念、课堂讲解顺序、易错边界和复习入口。';

  return compact(
    [
      '生成一张 A4 竖版中文学习笔记封面图，比例接近 1:1.414。',
      '视觉风格参考：干净白纸、手写中文标题、柔和荧光笔分区、细线框、中央概念流程图、少量小图标、底部对比表格或小结便利贴。',
      '目标：学生一眼看懂这份资料在讲什么，而不是做广告海报。',
      '文字必须以简体中文为主，可以保留必要英文术语；不要写长段英文；不要堆叠难以阅读的小字。',
      '图片结构：顶部大标题；左侧或中央放一张核心机制/知识路线图；右侧放 3-5 个关键因素或边界；底部放一个对比表格或总结卡片。',
      profileInstruction,
      '',
      `课程：${args.course.courseCode || args.course.name}`,
      `资料标题：${args.sourceTitle}`,
      `封面标题：${args.topic}`,
      `资料类型：${args.sourcePacket.classification.documentType}`,
      '',
      learningPathLines.length
        ? `学习脉络：\n${learningPathLines.join('\n')}`
        : sectionLines.length
          ? `核心脉络：\n${sectionLines.join('\n')}`
          : '',
      takeawayLines.length ? `可复述要点：\n${takeawayLines.join('\n')}` : '',
      conceptLines.length ? `核心概念：\n${conceptLines.join('\n')}` : '',
      methodLines.length ? `方法/工具：\n${methodLines.join('\n')}` : '',
      boundaryLines.length ? `边界提醒：\n${boundaryLines.join('\n')}` : '',
      '',
      '画面要求：信息清楚、层次分明、留白足够、适合做 notebook cover；不要深色背景、不要照片写实、不要品牌 logo、不要随机公式、不要虚构论文结论。',
    ]
      .filter(Boolean)
      .join('\n'),
    3800,
  );
}

function mimeExtension(mime: string | null): 'png' | 'jpg' | 'webp' {
  if (mime?.includes('jpeg') || mime?.includes('jpg')) return 'jpg';
  if (mime?.includes('webp')) return 'webp';
  return 'png';
}

async function imageResultBuffer(
  result: ImageGenerationResult,
): Promise<{ buffer: Buffer; extension: 'png' | 'jpg' | 'webp'; mimeType: string }> {
  if (result.base64) {
    const match = result.base64.match(/^data:([^;]+);base64,([\s\S]*)$/);
    const mimeType = match?.[1] || 'image/png';
    const payload = match?.[2] || result.base64;
    return {
      buffer: Buffer.from(payload, 'base64'),
      extension: mimeExtension(mimeType),
      mimeType,
    };
  }

  if (result.url) {
    const response = await fetch(result.url);
    if (!response.ok) {
      throw new Error(`Failed to download generated cover (${response.status})`);
    }
    const mimeType = response.headers.get('content-type') || 'image/png';
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      extension: mimeExtension(mimeType),
      mimeType,
    };
  }

  throw new Error('Image provider returned no image data');
}

function sourceCoverSlideJson(args: {
  sourceTitle: string;
  sourceHash: string;
  topic: string;
  imagePath: string;
  providerId: ImageProviderId;
  model: string | null;
}): Prisma.InputJsonValue {
  return {
    id: `source-cover-${args.sourceHash.slice(0, 12)}`,
    type: 'content',
    theme: {
      fontName: 'Inter',
      fontColor: '#0f172a',
      themeColors: ['#8bbf72', '#f5c84b', '#75b7d8', '#ef9bb6', '#0f172a'],
      backgroundColor: '#fffdf7',
    },
    background: { type: 'solid', color: '#fffdf7' },
    viewportSize: SOURCE_COVER_WIDTH,
    viewportRatio: SOURCE_COVER_WIDTH / SOURCE_COVER_HEIGHT,
    sourceCover: {
      kind: 'source_upload_cover',
      sourceHash: args.sourceHash,
      sourceTitle: args.sourceTitle,
      topic: args.topic,
      providerId: args.providerId,
      model: args.model,
      generatedAt: new Date().toISOString(),
    },
    elements: [
      {
        id: `source-cover-image-${args.sourceHash.slice(0, 12)}`,
        type: 'image',
        src: args.imagePath,
        x: 0,
        y: 0,
        width: SOURCE_COVER_WIDTH,
        height: SOURCE_COVER_HEIGHT,
      },
    ],
  } as Prisma.InputJsonValue;
}

async function generateNotebookCoverForSource(args: {
  prisma: PrismaClient;
  userId: string;
  course: CourseForSourceCover;
  notebookId: string;
  sourceTitle: string;
  sourceHash: string;
  topic: string;
  sourcePacket: SourcePacket;
}): Promise<SourceUploadNotebookCoverResult> {
  const provider = resolveSourceCoverImageProvider();
  if (!provider) {
    return {
      status: 'skipped',
      imagePath: null,
      providerId: null,
      model: null,
      prompt: null,
      reason: '没有配置可用的服务端图片生成 provider。',
    };
  }

  const prompt = sourceCoverPrompt({
    course: args.course,
    sourceTitle: args.sourceTitle,
    topic: args.topic,
    sourcePacket: args.sourcePacket,
  });

  try {
    const image = await generateImage(
      {
        providerId: provider.providerId,
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl,
        model: provider.model,
      },
      {
        prompt,
        negativePrompt:
          '英文长文、密密麻麻的小字、写实照片、广告海报、黑色背景、随机公式、错误化学结构、虚构实验结论、logo、水印',
        width: SOURCE_COVER_WIDTH,
        height: SOURCE_COVER_HEIGHT,
        style: 'clean handwritten Chinese A4 study poster',
      },
    );
    const rendered = await imageResultBuffer(image);
    const courseSegment = safePathSegment(args.course.id, 'course');
    const notebookSegment = safePathSegment(args.notebookId, 'notebook');
    const hashSegment = safePathSegment(args.sourceHash.slice(0, 24), 'source');
    const fileName = `${hashSegment}.${rendered.extension}`;
    const outputDir = path.join(SOURCE_COVER_PUBLIC_ROOT, courseSegment, notebookSegment);
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, fileName), rendered.buffer);
    const imagePath = `${SOURCE_COVER_PUBLIC_PREFIX}/${courseSegment}/${notebookSegment}/${fileName}`;

    await args.prisma.notebook.updateMany({
      where: {
        id: args.notebookId,
        ownerId: args.userId,
        courseId: args.course.id,
      },
      data: {
        coverImagePath: imagePath,
        coverSlideJson: toPrismaNullableJson(
          sourceCoverSlideJson({
            sourceTitle: args.sourceTitle,
            sourceHash: args.sourceHash,
            topic: args.topic,
            imagePath,
            providerId: provider.providerId,
            model: provider.model ?? null,
          }),
        ),
        contentVersion: { increment: 1 },
        updatedAt: new Date(),
      },
    });

    return {
      status: 'generated',
      imagePath,
      providerId: provider.providerId,
      model: provider.model ?? null,
      prompt,
      reason: null,
    };
  } catch (error) {
    return {
      status: 'failed',
      imagePath: null,
      providerId: provider.providerId,
      model: provider.model ?? null,
      prompt,
      reason: error instanceof Error ? error.message : '封面生成失败。',
    };
  }
}

async function loadExistingProblemFingerprints(args: {
  prisma: PrismaClient;
  courseId: string;
}): Promise<ExistingProblemFingerprint[]> {
  const rows = await args.prisma.notebookProblem.findMany({
    where: {
      OR: [{ courseId: args.courseId }, { notebook: { courseId: args.courseId } }],
    },
    select: {
      id: true,
      title: true,
      type: true,
      publicContentJson: true,
    },
    take: 5000,
  });
  return rows
    .map((row) => {
      const publicContent = row.publicContentJson as NotebookProblemPublicContent;
      try {
        return {
          id: row.id,
          title: row.title,
          fingerprint: problemFingerprint({
            title: row.title,
            type: row.type,
            publicContent,
          }),
        };
      } catch {
        return null;
      }
    })
    .filter((item): item is ExistingProblemFingerprint => Boolean(item));
}

function dedupeDrafts(args: {
  drafts: NotebookProblemImportDraft[];
  existing: ExistingProblemFingerprint[];
  sourceHash: string;
  sourceTitle: string;
}): {
  uniqueDrafts: NotebookProblemImportDraft[];
  duplicates: Array<{ title: string; reason: 'same_upload' | 'existing_course' }>;
} {
  const existingFingerprints = new Set(args.existing.map((item) => item.fingerprint));
  const seen = new Set<string>();
  const uniqueDrafts: NotebookProblemImportDraft[] = [];
  const duplicates: Array<{ title: string; reason: 'same_upload' | 'existing_course' }> = [];

  for (const draft of args.drafts) {
    const fingerprint = problemFingerprint(draft);
    if (seen.has(fingerprint)) {
      duplicates.push({ title: draft.title, reason: 'same_upload' });
      continue;
    }
    seen.add(fingerprint);
    if (existingFingerprints.has(fingerprint)) {
      duplicates.push({ title: draft.title, reason: 'existing_course' });
      continue;
    }
    uniqueDrafts.push({
      ...draft,
      sourceMeta: {
        ...draft.sourceMeta,
        uploadSourceHash: args.sourceHash,
        uploadSourceTitle: args.sourceTitle,
        dedupeFingerprint: fingerprint,
      },
    });
  }

  return { uniqueDrafts, duplicates };
}

function textWindowByKeywords(args: {
  text: string;
  keywords: RegExp[];
  fallbackRatio: number;
  maxChars: number;
}): string {
  const lowerBound = Math.floor(args.text.length * args.fallbackRatio);
  const matches = args.keywords
    .map((keyword) => {
      const flags = keyword.flags.includes('g') ? keyword.flags : `${keyword.flags}g`;
      const matcher = new RegExp(keyword.source, flags);
      for (const match of args.text.matchAll(matcher)) {
        const index = match.index ?? -1;
        if (index >= Math.max(0, lowerBound - args.maxChars)) return index;
      }
      return -1;
    })
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);
  const center = matches[0] ?? lowerBound;
  const start = Math.max(0, center - Math.floor(args.maxChars * 0.25));
  return compact(args.text.slice(start, start + args.maxChars), args.maxChars);
}

function buildSynthesisSourceSample(text: string): string {
  const windows = [
    ['开头/摘要', compact(text.slice(0, 7000), 7000)],
    [
      '方法附近',
      textWindowByKeywords({
        text,
        keywords: [/method/i, /approach/i, /framework/i, /pipeline/i, /model/i],
        fallbackRatio: 0.28,
        maxChars: 5000,
      }),
    ],
    [
      '实验/结果附近',
      textWindowByKeywords({
        text,
        keywords: [/experiment/i, /evaluation/i, /result/i, /dataset/i, /metric/i],
        fallbackRatio: 0.56,
        maxChars: 5000,
      }),
    ],
    [
      '讨论/局限附近',
      textWindowByKeywords({
        text,
        keywords: [/discussion/i, /limitation/i, /conclusion/i, /future work/i],
        fallbackRatio: 0.76,
        maxChars: 5000,
      }),
    ],
  ];
  const seen = new Set<string>();
  return windows
    .map(([label, value]) => {
      const body = String(value || '').trim();
      const key = body.slice(0, 200);
      if (!body || seen.has(key)) return '';
      seen.add(key);
      return `## ${label}\n${body}`;
    })
    .filter(Boolean)
    .join('\n\n---\n\n');
}

function extractJsonObject(text: string): unknown | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringArray(value: unknown, maxItems: number): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => (typeof item === 'string' ? cleanTitle(item) : ''))
        .filter((item) => item.length >= 2)
        .slice(0, maxItems)
    : [];
}

function markdownContainsTable(markdown: string): boolean {
  return /\|[^\n]+\|\n\|[\s:|-]+\|/m.test(markdown);
}

function markdownHasRhythmBlock(markdown: string): boolean {
  return /(?:^|\n)(?:>\s+|- |\d+\. |###\s+)/.test(markdown);
}

function enrichSynthesizedMarkdown(args: {
  markdown: string;
  summary: string;
  sourceTitle: string;
  usageProfile: SourceUsageProfile;
}): string {
  if (markdownHasRhythmBlock(args.markdown)) return args.markdown;
  const bullets =
    args.usageProfile === 'daily_use'
      ? [
          '- 这份资料是什么。',
          '- 哪些信息之后需要快速查到。',
          '- 有没有明确待办、决定、截止时间或后续追踪。',
        ]
      : args.usageProfile === 'university_course'
        ? [
            '- 它属于课程里的哪一个单元。',
            '- 学生需要掌握哪些概念、方法或模板。',
            '- 这份资料怎样转化成讲解、练习、复习或考试准备。',
          ]
        : [
            '- 这段材料要解决的核心问题是什么。',
            '- 作者用了什么表示、方法或评估接口。',
            '- 哪些结论是论文明确支持的，哪些只是边界或局限。',
          ];
  const learningBlock = [`> 阅读抓手：${args.summary}`, '', '### 先抓这三件事', ...bullets].join(
    '\n',
  );
  const [firstParagraph, ...rest] = args.markdown.split(/\n{2,}/);
  return [firstParagraph, learningBlock, ...rest].filter(Boolean).join('\n\n');
}

function normalizeSynthesizedSection(args: {
  value: unknown;
  index: number;
  sourceTitle: string;
  sourceHash: string;
  usageProfile: SourceUsageProfile;
}): SourcePacketNotebookSection | null {
  const record = asRecord(args.value);
  if (!record) return null;
  const key = typeof record.key === 'string' ? cleanTitle(record.key).toLowerCase() : '';
  const title = typeof record.title === 'string' ? cleanTitle(record.title) : '';
  const summary = typeof record.summary === 'string' ? compact(record.summary, 220) : '';
  const rawMarkdown = typeof record.markdown === 'string' ? compact(record.markdown, 7_500) : '';
  const markdown = enrichSynthesizedMarkdown({
    markdown: rawMarkdown,
    summary,
    sourceTitle: args.sourceTitle,
    usageProfile: args.usageProfile,
  });
  if (!title || !summary || markdown.length < 160 || !/[\u3400-\u9fff]/.test(markdown)) {
    return null;
  }
  return {
    key: key || `synthesized-${args.index + 1}`,
    title,
    summary,
    markdown: markdownContainsTable(markdown)
      ? markdown
      : `${markdown}\n\n| 项目 | 内容 |\n| --- | --- |\n| 来源 | ${args.sourceTitle} |\n| 入库状态 | 已整理为中文课程笔记 |\n`,
    sourceRefs: [
      {
        sourceHash: args.sourceHash,
        sourceTitle: args.sourceTitle,
        note: `synthesized-note-${args.index + 1}`,
      },
    ],
  };
}

function usageProfileLabel(profile: SourceUsageProfile): string {
  if (profile === 'research') return '科研资料链路';
  if (profile === 'university_course') return '大学课程链路';
  return '日常使用链路';
}

function synthesisSectionPlan(profile: SourceUsageProfile): string {
  if (profile === 'daily_use') {
    return '一页摘要、关键信息、待办/决定/风险、时间线与上下文、原文索引与追踪';
  }
  if (profile === 'university_course') {
    return '课程位置与学习目标、核心概念与先修关系、课堂讲解脉络、例题/作业/考试接口、复习清单与易错点';
  }
  return '资料总览、背景与问题、方法框架、实验与结论、局限与课程关联';
}

function synthesisMemoryRequirement(profile: SourceUsageProfile): string {
  if (profile === 'daily_use') {
    return 'publicMemoryText 要是 500-900 中文字的日常资料索引：资料是什么、关键日期/人物/对象、待办与追踪入口；不要写成课程知识或科研综述。privateUpdatePolicy 要说明日常资料默认不自动写课程公共记忆；涉及个人偏好、长期计划或待办时，应进入私有/个人上下文，必要时等待用户确认。';
  }
  if (profile === 'university_course') {
    return 'publicMemoryText 要是 800-1200 中文字的课程控制记忆：课程单元定位、学习目标、先修关系、核心概念、作业/考试/模板线索、后续教学动作；不要写成论文综述。privateUpdatePolicy 要说明课程资料上传没有学习者作答时不写私有记忆。';
  }
  return 'publicMemoryText 要是 800-1400 中文字的公共记忆摘要：资料用途、核心知识、检索入口、教学边界。privateUpdatePolicy 要说明本次是否写私有记忆；课程资料上传没有学习者答题行为时，应明确“不写入私有记忆”。';
}

async function synthesizeSourcePacketWithModel(args: {
  model?: LanguageModel;
  sourcePacket: SourcePacket;
  sourceTitle: string;
  sourceHash: string;
  topic: string;
  text: string;
  language: 'zh-CN' | 'en-US';
}): Promise<SourcePacket> {
  if (!args.model || args.sourcePacket.classification.allQuestionUpload) return args.sourcePacket;
  if (
    args.sourcePacket.classification.documentType !== 'paper' &&
    args.sourcePacket.classification.documentType !== 'lecture_notes' &&
    args.sourcePacket.classification.documentType !== 'mixed' &&
    args.sourcePacket.classification.documentType !== 'unknown'
  ) {
    return args.sourcePacket;
  }

  const sample = buildSynthesisSourceSample(args.text);
  if (sample.length < 500) return args.sourcePacket;
  const outputLanguage = args.language === 'en-US' ? 'English' : 'Simplified Chinese';
  const usageProfile = args.sourcePacket.classification.usageProfile;
  const sectionPlan = synthesisSectionPlan(usageProfile);
  const prompt = [
    `资料标题：${args.sourceTitle}`,
    `主题：${args.topic}`,
    `资料类型：${args.sourcePacket.classification.documentType}`,
    `使用链路：${usageProfileLabel(usageProfile)} (${usageProfile})`,
    '',
    '请基于下面抽样原文，输出严格 JSON，不要 Markdown fence，不要额外解释。',
    'JSON schema:',
    `{
  "topic": "string",
  "publicMemoryText": "string",
  "privateUpdatePolicy": "string",
  "sections": [
    {"key": "overview", "title": "string", "summary": "string", "markdown": "string"}
  ],
  "graph": {"concepts": ["string"], "methods": ["string"]}
}`,
    '',
    `要求：`,
    `- 输出语言：${outputLanguage}。本平台默认中文；除专有名词外，不要整段英文。`,
    `- sections 必须正好 5 个，按这个脉络：${sectionPlan}。`,
    '- 每个 markdown 是一份学生可读笔记，不要长篇摘抄原文；每段控制在 450-800 中文字左右。',
    '- 笔记要有节奏，不要只有表格。每个 section 必须混合：2-4 个讲解段落、1 个引用式提醒块（> 阅读抓手/不要误读/课程用法）、1 个短列表或步骤列表、最多 1 个 Markdown table。',
    '- Markdown table 只用于“对比/证据/边界”的结构锚点；不要连续输出多个表格，不要把正文都塞进表格。',
    '- 优先用短标题分隔非表格块，例如：### 先抓主线、### 不要误读、### 课堂怎么用。',
    '- 可以保留英文术语，但必须给中文解释，例如 diffusion model（扩散模型）。',
    '- 不确定的内容写“原文未明确”，不要编造。',
    `- ${synthesisMemoryRequirement(usageProfile)}`,
    usageProfile === 'daily_use'
      ? '- graph.concepts 只保留真正可检索对象，例如人、项目、地点、日期节点、行动主题；不要放 pdf、article、of 等噪声。'
      : '- graph.concepts 只保留真正课程概念，不要放 pdf、article、of 等噪声。',
    '- graph.methods 只保留方法/流程名。',
    '',
    '抽样原文：',
    sample,
  ].join('\n');

  try {
    const result = await callLLM(
      {
        model: args.model,
        system:
          'You are a course source ingestion synthesizer. Produce compact, faithful, varied study notes with paragraphs, callouts, lists, and at most one table per section. Return valid JSON only.',
        prompt,
        temperature: 0.2,
        maxOutputTokens: 5200,
      },
      'course-source-upload-synthesis',
      {
        retries: 1,
        validate: (text) => Boolean(extractJsonObject(text)),
      },
      { enabled: false },
    );
    const parsed = asRecord(extractJsonObject(result.text));
    if (!parsed) return args.sourcePacket;
    const rawSections = Array.isArray(parsed.sections) ? parsed.sections : [];
    const sections = rawSections
      .map((section, index) =>
        normalizeSynthesizedSection({
          value: section,
          index,
          sourceTitle: args.sourceTitle,
          sourceHash: args.sourceHash,
          usageProfile,
        }),
      )
      .filter((section): section is SourcePacketNotebookSection => Boolean(section))
      .slice(0, 5);
    if (sections.length !== 5) return args.sourcePacket;
    const graphRecord = asRecord(parsed.graph);
    const publicSummary =
      typeof parsed.publicMemoryText === 'string' ? compact(parsed.publicMemoryText, 3_600) : '';
    const privateUpdatePolicy =
      typeof parsed.privateUpdatePolicy === 'string'
        ? compact(parsed.privateUpdatePolicy, 600)
        : '本次上传是课程资料入库，没有学习者答题、薄弱点或下一步教学动作，因此不写入私有记忆。';
    const topic =
      typeof parsed.topic === 'string' ? cleanTitle(parsed.topic, args.topic) : args.topic;
    return {
      ...args.sourcePacket,
      classification: {
        ...args.sourcePacket.classification,
        topic,
      },
      notebookSections: sections,
      graph: {
        ...args.sourcePacket.graph,
        concepts: stringArray(graphRecord?.concepts, 24),
        methods: stringArray(graphRecord?.methods, 16),
        sourceRefs: args.sourcePacket.graph.sourceRefs,
      },
      memory: {
        ...args.sourcePacket.memory,
        publicSummary,
        privateUpdatePolicy,
      },
    };
  } catch {
    return args.sourcePacket;
  }
}

function stripMarkdownForMemory(input: string): string {
  return compact(
    input
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/^\s*[-*]\s+/gm, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\n{2,}/g, '\n')
      .trim(),
    2_400,
  );
}

function sourceMemoryConceptLine(sourcePacket: SourcePacket): string {
  return sourcePacket.graph.concepts.length
    ? `可检索概念：${sourcePacket.graph.concepts.slice(0, 14).join('；')}。`
    : '';
}

function sourceMemoryMethodLine(sourcePacket: SourcePacket): string {
  return sourcePacket.graph.methods.length
    ? `方法/流程线索：${sourcePacket.graph.methods.slice(0, 10).join('；')}。`
    : '';
}

function sourceMemoryBoundary(sourcePacket: SourcePacket): string {
  if (sourcePacket.classification.usageProfile === 'daily_use') {
    return '使用边界：这是日常资料索引，不是课程公共规则、答题模板或科研结论；涉及个人安排、偏好和待办时，应优先进入私有上下文并按需回查原文。';
  }
  if (sourcePacket.classification.usageProfile === 'university_course') {
    return '教学边界：这是大学课程资料，应服务课程单元定位、课堂讲解、作业/考试准备和课程模板；完整原文仍应通过 notebook sections/RAG 精确回查。';
  }
  return sourcePacket.classification.documentType === 'paper'
    ? '教学边界：这是论文型资料，不是题库；回答时应解释论文贡献、方法、实验与局限，不要自动伪造题目。'
    : '教学边界：回答时优先检索资料对应的 notebook sections；如果需要练习题，应由单独题目流程生成或导入。';
}

function sourceMemorySectionDigest(args: {
  sections: Array<{ id: string; title: string; summary: string | null }>;
  sourcePacket: SourcePacket;
  maxExcerptChars?: number;
}): string[] {
  return args.sourcePacket.notebookSections.slice(0, 6).map((section, index) => {
    const persisted = args.sections.find((item) => item.title === section.title);
    const summary = persisted?.summary || section.summary;
    const excerpt = stripMarkdownForMemory(section.markdown)
      .replace(new RegExp(`^${section.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'i'), '')
      .trim();
    return compact(
      `${index + 1}. ${section.title}: ${summary || '资料段落'}${
        excerpt ? `\n${compact(excerpt, args.maxExcerptChars ?? 360)}` : ''
      }`,
      560,
    );
  });
}

function markdownCell(value: string | null | undefined): string {
  return compact(value || '无', 260)
    .replace(/\|/g, '\\|')
    .replace(/\n+/g, '<br>');
}

function markdownList(items: string[], fallback = '无'): string {
  const cleaned = items.map((item) => compact(item, 220)).filter((item) => item.trim());
  if (cleaned.length === 0) return `- ${fallback}`;
  return cleaned.map((item) => `- ${item}`).join('\n');
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function structuredMemorySectionQuestion(section: { title: string; role: string }): string {
  if (section.role === 'overview') return '这份资料的核心主张是什么？';
  if (section.role === 'background') return '为什么需要这个研究问题？';
  if (section.role === 'method') return '作者用了什么方法链路？';
  if (section.role === 'experiment') return '哪些实验/指标支撑结论？';
  if (section.role === 'limitation') return '哪些结论不能外推？';
  if (section.role === 'learning_objectives') return '学生学完应该会什么？';
  if (section.role === 'concepts_prerequisites') return '先修和核心概念是什么？';
  if (section.role === 'teaching_flow') return '课堂应该按什么顺序讲？';
  if (section.role === 'assessment_practice') return '作业、考试或练习怎么连接？';
  if (section.role === 'review_diagnosis') return '复习时应优先查哪里？';
  if (section.role === 'actions_decisions') return '有哪些决定、待办或下一步？';
  if (section.role === 'timeline_context') return '时间线和上下文是什么？';
  if (section.role === 'key_information') return '哪些信息需要直接查询？';
  return `什么时候查「${section.title}」？`;
}

function structuredMemorySectionNavigationTable(notes: SourceStructuredNotes): string[] {
  const sections = notes.notebookKnowledge.sections.slice(0, 8);
  if (sections.length === 0) return ['无结构化 section。'];
  return [
    '| Section | 它回答的问题 | 关键内容 | 证据入口 |',
    '| --- | --- | --- | --- |',
    ...sections.map(
      (section) =>
        `| ${markdownCell(section.title)} | ${markdownCell(structuredMemorySectionQuestion(section))} | ${markdownCell(section.summary)} | ${markdownCell(section.evidenceRefs.join('；') || '回到 notebook/RAG')} |`,
    ),
  ];
}

function structuredMemoryItemTable(
  items: Array<{ label: string; detail: string; evidenceRefs?: string[] }>,
  emptyText: string,
  itemKind: 'concept' | 'method',
): string[] {
  const candidateRows = items.slice(0, 10);
  const evidencedRows = candidateRows.filter((item) => item.evidenceRefs?.length);
  const rows = evidencedRows.length > 0 ? evidencedRows : candidateRows;
  if (rows.length === 0) return [emptyText];
  const headers =
    itemKind === 'concept'
      ? ['概念', '解释/重要性', '证据入口']
      : ['方法/工具', '作用/怎么用', '证据入口'];
  return [
    `| ${headers.map(markdownCell).join(' | ')} |`,
    '| --- | --- | --- |',
    ...rows.map(
      (item) =>
        `| ${markdownCell(item.label)} | ${markdownCell(item.detail)} | ${markdownCell(item.evidenceRefs?.join('；') || '回到对应 section/RAG')} |`,
    ),
  ];
}

function buildStructuredCourseMemoryText(args: {
  sourceTitle: string;
  topic: string;
  sections: Array<{ id: string; title: string; summary: string | null }>;
  sourcePacket: SourcePacket;
  templateTitles: string[];
  notebookId: string | null;
  notes: SourceStructuredNotes;
}): string {
  const control = args.notes.courseControl;
  const knowledge = args.notes.notebookKnowledge;
  const placementRows = control?.placement.slice(0, 8) || [];
  const graphRows = control?.graphLinks.slice(0, 6) || [];

  return compact(
    [
      `# 课程控制层：${cleanTitle(args.sourceTitle)}`,
      '',
      '| 字段 | 结构化值 |',
      '| --- | --- |',
      `| 主题 | ${markdownCell(args.topic)} |`,
      `| 使用链路 | ${markdownCell(usageProfileLabel(args.sourcePacket.classification.usageProfile))} |`,
      `| 资料类型 | ${markdownCell(args.sourcePacket.classification.documentType)} |`,
      `| 控制组件 | ${markdownCell(control?.componentType || 'course_control_card')} |`,
      `| 对应 Notebook | ${markdownCell(args.notebookId || 'N/A')} |`,
      `| 可查询 Sections | ${markdownCell(args.sections.map((section) => section.title).join('；') || '无')} |`,
      `| 模板/答题契约 | ${markdownCell(args.templateTitles.join('；') || '未识别到静态课程模板')} |`,
      '',
      '## 控制摘要',
      control?.summary || knowledge.summary,
      '',
      '## 课程定位',
      placementRows.length
        ? [
            '| 维度 | 控制值 |',
            '| --- | --- |',
            ...placementRows.map(
              (item) => `| ${markdownCell(item.label)} | ${markdownCell(item.detail)} |`,
            ),
          ].join('\n')
        : '无额外课程定位。',
      '',
      '## 何时使用',
      markdownList(control?.useWhen || [], '没有可升级为课程控制层的使用场景。'),
      '',
      '## 不要用于',
      markdownList(control?.doNotUseWhen || [], '无额外限制；仍需回到原文证据核对。'),
      '',
      '## 教学动作',
      markdownList(control?.teachingMoves || [], '先检索 notebook/RAG，再组织回答。'),
      '',
      '## 图谱连接',
      graphRows.length
        ? [
            '| 关系 | 节点/触发词 |',
            '| --- | --- |',
            ...graphRows.map(
              (row) => `| ${markdownCell(row.kind)} | ${markdownCell(row.items.join('；'))} |`,
            ),
          ].join('\n')
        : '无图谱连接。',
      '',
      '## 证据边界',
      markdownList(control?.boundaryWarnings || [sourceMemoryBoundary(args.sourcePacket)]),
      '',
      '## 与笔记本知识层的关系',
      '课程控制层只负责“什么时候召回、怎么安排教学、哪些边界不能越过”；逐段讲解、引用原文、生成笔记内容时，应转到笔记本知识层和 RAG。',
    ]
      .filter((line) => String(line).trim())
      .join('\n'),
    5_600,
  );
}

function buildStructuredNotebookMemoryText(args: {
  sourceTitle: string;
  topic: string;
  sections: Array<{ id: string; title: string; summary: string | null }>;
  sourcePacket: SourcePacket;
  templateTitles: string[];
  notes: SourceStructuredNotes;
}): string {
  const knowledge = args.notes.notebookKnowledge;
  const control = args.notes.courseControl;
  const learningPath = knowledge.learningPath?.length
    ? knowledge.learningPath
    : knowledge.sections.slice(0, 6).map((section) => `${section.title}：${section.summary}`);
  const keyTakeaways = knowledge.keyTakeaways?.length
    ? knowledge.keyTakeaways
    : knowledge.sections.slice(0, 5).map((section) => `${section.title}：${section.summary}`);
  const answerStrategy = knowledge.answerStrategy?.length
    ? knowledge.answerStrategy
    : [
        '问资料主线时，先读笔记本摘要和学习脉络。',
        '问概念定义或方法作用时，先查概念/方法入口，再回到对应 section。',
        '问原文引用、数值、表格或实验细节时，必须转到 notebook section/RAG。',
      ];

  return compact(
    [
      `# 笔记本知识层：${cleanTitle(args.sourceTitle)}`,
      '',
      '| 字段 | 结构化值 |',
      '| --- | --- |',
      `| 主题 | ${markdownCell(args.topic)} |`,
      `| 使用链路 | ${markdownCell(usageProfileLabel(args.sourcePacket.classification.usageProfile))} |`,
      `| 资料类型 | ${markdownCell(args.sourcePacket.classification.documentType)} |`,
      `| 知识组件 | ${markdownCell(knowledge.componentType)} |`,
      `| Section 数量 | ${markdownCell(String(args.sections.length))} |`,
      `| 模板/答题契约 | ${markdownCell(args.templateTitles.join('；') || '无')} |`,
      '',
      '## 笔记本摘要',
      knowledge.summary,
      '',
      '## 学习脉络',
      markdownList(learningPath, '无学习脉络。'),
      '',
      '## Section 导航',
      structuredMemorySectionNavigationTable(args.notes).join('\n'),
      '',
      '## 可直接复述的要点',
      markdownList(keyTakeaways, '无可复述要点。'),
      '',
      '## 概念入口',
      structuredMemoryItemTable(knowledge.concepts, '无结构化概念入口。', 'concept').join('\n'),
      '',
      '## 方法/工具入口',
      structuredMemoryItemTable(knowledge.methods, '无结构化方法入口。', 'method').join('\n'),
      '',
      '## 检索触发词',
      markdownList(knowledge.retrievalTriggers.slice(0, 12), '无检索触发词。'),
      '',
      '## 查询/回答路径',
      markdownList(answerStrategy),
      '',
      '## 边界',
      markdownList(control?.boundaryWarnings || [sourceMemoryBoundary(args.sourcePacket)]),
    ]
      .filter((line) => String(line).trim())
      .join('\n'),
    6_400,
  );
}

function structuredSectionRole(args: {
  key: string;
  title: string;
  usageProfile: SourceUsageProfile;
}): string {
  const text = `${args.key} ${args.title}`.toLowerCase();
  if (args.usageProfile === 'research') {
    if (/background|术语|背景/.test(text)) return 'background';
    if (/method|方法|流程/.test(text)) return 'method';
    if (/result|experiment|实验|结论/.test(text)) return 'experiment';
    if (/limit|局限|关联/.test(text)) return 'limitation';
    return 'overview';
  }
  if (args.usageProfile === 'university_course') {
    if (/目标|position|objective/.test(text)) return 'learning_objectives';
    if (/概念|先修|concept/.test(text)) return 'concepts_prerequisites';
    if (/讲解|flow|课堂/.test(text)) return 'teaching_flow';
    if (/作业|考试|assessment|practice/.test(text)) return 'assessment_practice';
    return 'review_diagnosis';
  }
  if (/待办|decision|risk|决定|风险/.test(text)) return 'actions_decisions';
  if (/时间|timeline|context/.test(text)) return 'timeline_context';
  if (/信息|key-info/.test(text)) return 'key_information';
  if (/索引|追踪|source/.test(text)) return 'source_tracking';
  return 'summary';
}

type StructuredItemSource = {
  sectionKey: string;
  sectionTitle: string;
  text: string;
};

function normalizedSearchText(input: string): string {
  return input.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function sourcePacketStructuredItemSources(sourcePacket: SourcePacket): StructuredItemSource[] {
  return sourcePacket.notebookSections.map((section) => ({
    sectionKey: section.key,
    sectionTitle: section.title,
    text: stripMarkdownForMemory([section.title, section.markdown, section.summary].join('\n')),
  }));
}

function sourceTextFragments(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/(?<=[。！？.!?])\s*|\n+/)
        .map((fragment) => collapseSpaces(fragment.replace(/^[-*]\s+/, '')))
        .filter((fragment) => fragment.length >= 28 && fragment.length <= 260),
    ),
  );
}

function sourceFragmentMatchesLabel(fragment: string, label: string): boolean {
  const normalizedFragment = normalizedSearchText(fragment);
  const normalizedLabel = normalizedSearchText(label);
  if (!normalizedLabel) return false;
  if (normalizedFragment.includes(normalizedLabel)) return true;
  const latinTokens = normalizedLabel.match(/[a-z][a-z0-9_+\-]{2,}/g) || [];
  if (latinTokens.length > 0) {
    return latinTokens.every((token) => normalizedFragment.includes(token));
  }
  const hanTokens = normalizedLabel.match(/[\u3400-\u9fff]{2,}/g) || [];
  if (hanTokens.length > 0 && hanTokens.every((token) => normalizedFragment.includes(token))) {
    return true;
  }
  const hanChars = normalizedLabel.replace(/[^\u3400-\u9fff]/g, '');
  if (hanChars.length < 4) return false;
  const bigrams = Array.from({ length: hanChars.length - 1 }, (_, index) =>
    hanChars.slice(index, index + 2),
  );
  const hits = bigrams.filter((token) => normalizedFragment.includes(token)).length;
  return hits >= Math.min(3, Math.max(2, Math.ceil(bigrams.length * 0.45)));
}

function structuredItemSourcePreference(
  sectionTitle: string,
  itemKind: 'concept' | 'method',
): number {
  const title = normalizedSearchText(sectionTitle);
  if (itemKind === 'method') {
    if (/方法|框架|method|pipeline|流程/.test(title)) return 10;
    if (/实验|结论|result|experiment|评估/.test(title)) return 5;
    if (/总览|overview/.test(title)) return 1;
    return 0;
  }
  if (/背景|问题|术语|concept|background/.test(title)) return 8;
  if (/总览|overview/.test(title)) return 5;
  if (/方法|框架|method/.test(title)) return 3;
  return 0;
}

function structuredItemEvidence(args: {
  label: string;
  itemKind: 'concept' | 'method';
  sources: StructuredItemSource[];
}): { detail: string | null; evidenceRefs: string[] } {
  const labelPattern = new RegExp(escapeRegExp(args.label), 'i');
  let best: {
    detail: string;
    evidenceRefs: string[];
    score: number;
  } | null = null;
  for (const source of args.sources) {
    const fragments = sourceTextFragments(source.text);
    const sourceScore = structuredItemSourcePreference(source.sectionTitle, args.itemKind);
    for (const fragment of fragments) {
      const exact = labelPattern.test(fragment);
      const fuzzy = exact || sourceFragmentMatchesLabel(fragment, args.label);
      if (!fuzzy) continue;
      const cleaned = compact(fragment.replace(/^#{1,6}\s+/, ''), 220);
      if (cleaned.length < Math.min(42, args.label.length + 12)) continue;
      const score =
        (exact ? 24 : 12) +
        sourceScore +
        Math.min(8, Math.floor(cleaned.length / 36)) -
        (/^(?:来源|文档类型|课程|sourceHash)[：:]/.test(cleaned) ? 12 : 0);
      if (!best || score > best.score) {
        best = {
          detail: cleaned,
          evidenceRefs: [source.sectionTitle],
          score,
        };
      }
    }
  }
  return best
    ? { detail: best.detail, evidenceRefs: best.evidenceRefs }
    : { detail: null, evidenceRefs: [] };
}

function structuredItemFallbackDetail(args: {
  label: string;
  itemKind: 'concept' | 'method';
  usageProfile: SourceUsageProfile;
}): string {
  if (args.itemKind === 'method') {
    if (args.usageProfile === 'research') {
      return `${args.label} 是这份论文的方法/工具线索；讲解时要说明它在 pipeline 的哪个环节出现、输入输出是什么、它支撑了哪类实验或评估。`;
    }
    if (args.usageProfile === 'university_course') {
      return `${args.label} 是课程中的方法或流程入口；讲解时应配合例子说明步骤、适用条件和常见误用。`;
    }
    return `${args.label} 是资料中的流程或行动入口；使用时应追踪它对应的对象、负责人、时间和下一步动作。`;
  }

  if (args.usageProfile === 'research') {
    return `${args.label} 是这份论文的核心检索概念；回答时要回到原文 section/RAG，说明它和研究问题、方法框架或实验指标的关系。`;
  }
  if (args.usageProfile === 'university_course') {
    return `${args.label} 是课程学习概念；讲解时应补上定义、先修关系、课堂例子和作业/考试接口。`;
  }
  return `${args.label} 是日常资料中的检索对象；回答时应回到原文确认它对应的人、事、时间或后续动作。`;
}

function structuredItems(args: {
  values: string[];
  sourcePacket: SourcePacket;
  usageProfile: SourceUsageProfile;
  itemKind: 'concept' | 'method';
}): Array<{
  label: string;
  detail: string;
  evidenceRefs?: string[];
}> {
  const sources = sourcePacketStructuredItemSources(args.sourcePacket);
  const blocked = new Set(
    [
      args.sourcePacket.source.title,
      args.sourcePacket.classification.topic,
      cleanTitle(args.sourcePacket.source.title),
      cleanTitle(args.sourcePacket.classification.topic),
    ]
      .map(normalizedSearchText)
      .filter(Boolean),
  );
  const filteredValues = args.values.filter((value) => {
    const normalized = normalizedSearchText(value);
    if (!normalized) return false;
    if (args.itemKind === 'concept' && blocked.has(normalized)) return false;
    if (args.itemKind === 'concept' && /^\d{4}$/.test(value.trim())) return false;
    return true;
  });
  const values = filteredValues.length >= 4 ? filteredValues : args.values;
  return values.slice(0, 10).map((value) => {
    const evidence = structuredItemEvidence({
      label: value,
      itemKind: args.itemKind,
      sources,
    });
    return {
      label: value,
      detail:
        evidence.detail ||
        structuredItemFallbackDetail({
          label: value,
          itemKind: args.itemKind,
          usageProfile: args.usageProfile,
        }),
      evidenceRefs: evidence.evidenceRefs,
    };
  });
}

function sourceRetrievalTriggers(args: {
  topic: string;
  sourcePacket: SourcePacket;
  usageProfile: SourceUsageProfile;
}): string[] {
  const base = [
    args.topic,
    ...args.sourcePacket.graph.concepts.slice(0, 6),
    ...args.sourcePacket.graph.methods.slice(0, 4),
  ]
    .map((item) => cleanTitle(item))
    .filter(Boolean);
  const contextual =
    args.usageProfile === 'research'
      ? ['论文贡献', '方法 pipeline', '实验指标', '局限边界', '相关 work 对比']
      : args.usageProfile === 'university_course'
        ? ['课程目标', '先修概念', '课堂讲解', '作业考试', '复习易错点']
        : ['关键信息', '待办事项', '决定记录', '截止时间', '后续追踪'];
  return Array.from(new Set([...base, ...contextual])).slice(0, 14);
}

type StructuredControlItem = {
  label: string;
  detail: string;
  evidenceRefs?: string[];
};

type StructuredControlSection = {
  title: string;
  role: string;
  summary: string;
  evidenceRefs: string[];
};

function sourceControlSectionSummary(
  sections: StructuredControlSection[],
  role: string,
  fallback = '',
): string {
  return sections.find((section) => section.role === role)?.summary || fallback;
}

function structuredControlItemLabels(items: StructuredControlItem[], max = 4): string {
  return items
    .slice(0, max)
    .map((item) => item.label)
    .filter(Boolean)
    .join('、');
}

function structuredControlMethodLine(methods: StructuredControlItem[], fallback: string): string {
  const method = methods[0];
  if (!method) return fallback;
  return `${method.label}：${compact(method.detail, 150)}`;
}

function sourceSpecificControlSummary(args: {
  topic: string;
  usageProfile: SourceUsageProfile;
  sections: StructuredControlSection[];
  concepts: StructuredControlItem[];
  methods: StructuredControlItem[];
}): string {
  const overview = sourceControlSectionSummary(args.sections, 'overview', args.topic);
  const method = sourceControlSectionSummary(args.sections, 'method');
  const experiment = sourceControlSectionSummary(args.sections, 'experiment');
  const conceptLine = structuredControlItemLabels(args.concepts, 5);
  const methodLine = structuredControlItemLabels(args.methods, 4);
  if (args.usageProfile === 'research') {
    return compact(
      [
        `这篇资料讲「${args.topic}」：${overview}`,
        method ? `方法主线是 ${method}` : '',
        experiment ? `证据主线是 ${experiment}` : '',
        conceptLine ? `课程召回时把它定位到这些概念：${conceptLine}。` : '',
        methodLine ? `方法入口包括：${methodLine}。` : '',
      ]
        .filter(Boolean)
        .join(' '),
      720,
    );
  }
  if (args.usageProfile === 'university_course') {
    return compact(
      [
        `这份资料补充课程单元「${args.topic}」：${overview}`,
        method ? `课堂讲解应围绕 ${method}` : '',
        conceptLine ? `先修/核心概念是 ${conceptLine}。` : '',
      ]
        .filter(Boolean)
        .join(' '),
      620,
    );
  }
  return compact(`这份资料是「${args.topic}」的个人检索入口：${overview}`, 520);
}

function sourceSpecificPlacement(args: {
  topic: string;
  usageProfile: SourceUsageProfile;
  sections: StructuredControlSection[];
  concepts: StructuredControlItem[];
  methods: StructuredControlItem[];
  templateTitles: string[];
}): Array<{ label: string; detail: string }> {
  const overview = sourceControlSectionSummary(args.sections, 'overview', args.topic);
  const method = sourceControlSectionSummary(args.sections, 'method');
  const limitation = sourceControlSectionSummary(args.sections, 'limitation');
  const conceptLine = structuredControlItemLabels(args.concepts, 6) || args.topic;
  const methodLine = structuredControlMethodLine(args.methods, method || '回到方法 section');
  const rows = [
    { label: args.usageProfile === 'research' ? '资料主张' : '课程单元', detail: overview },
    { label: '核心概念入口', detail: conceptLine },
    { label: '方法入口', detail: methodLine },
  ];
  if (limitation) rows.push({ label: '证据边界', detail: limitation });
  if (args.templateTitles.length > 0) {
    rows.push({ label: '模板线索', detail: args.templateTitles.join('；') });
  }
  return rows;
}

function sourceSpecificUseWhen(args: {
  topic: string;
  usageProfile: SourceUsageProfile;
  concepts: StructuredControlItem[];
  methods: StructuredControlItem[];
  sections: StructuredControlSection[];
}): string[] {
  const conceptLine = structuredControlItemLabels(args.concepts, 4);
  const methodLine = structuredControlItemLabels(args.methods, 3);
  const experiment = sourceControlSectionSummary(args.sections, 'experiment');
  if (args.usageProfile === 'research') {
    return [
      conceptLine
        ? `学生问 ${conceptLine} 与「${args.topic}」的关系时，用它做资料入口。`
        : `学生问「${args.topic}」这篇资料在讲什么时，用它做资料入口。`,
      methodLine
        ? `需要解释 ${methodLine} 的工作流、输入输出或评估接口时召回。`
        : '需要解释论文方法链路时召回。',
      experiment
        ? `讨论实验指标、结果主张或 baseline 时，先召回这份资料再回到对应 section/RAG。`
        : '讨论论文证据、指标或结果主张时召回。',
      '需要对比 SMILES/图结构/图像表征等路线时，把它作为“图像表征路线”的案例。',
    ];
  }
  if (args.usageProfile === 'university_course') {
    return [
      conceptLine ? `讲到 ${conceptLine} 时召回这份资料。` : `讲到「${args.topic}」单元时召回。`,
      methodLine
        ? `需要把 ${methodLine} 转成课堂步骤、例子或复习题时使用。`
        : '需要把资料转成课堂讲解或复习清单时使用。',
      '跨 notebook 搜索同一课程资料来源时使用。',
    ];
  }
  return ['用户问这份资料里的关键信息时使用。', '用户追踪日期、决定、待办或后续动作时使用。'];
}

function sourceSpecificDoNotUseWhen(args: {
  topic: string;
  usageProfile: SourceUsageProfile;
  concepts: StructuredControlItem[];
  sections: StructuredControlSection[];
}): string[] {
  const conceptLine = structuredControlItemLabels(args.concepts, 3);
  const limitation = sourceControlSectionSummary(args.sections, 'limitation');
  if (args.usageProfile === 'research') {
    return [
      `问题不涉及「${args.topic}」${conceptLine ? `、${conceptLine}` : ''} 或相邻研究路线时，不要强行召回。`,
      '用户要逐字引用、具体数值、表格结果或实验设置时，必须转到 notebook section/RAG，不只用课程控制层。',
      limitation
        ? `不要越过论文边界：${compact(limitation, 180)}`
        : '不要把作者 claim 外推成湿实验验证、真实活性、3D 构象或合成路线结论。',
    ];
  }
  return [
    `问题不属于「${args.topic}」或本课程单元时不要召回。`,
    '需要逐字引用或精确页内证据时，必须回到 notebook/RAG。',
  ];
}

function sourceSpecificTeachingMoves(args: {
  topic: string;
  usageProfile: SourceUsageProfile;
  sections: StructuredControlSection[];
  concepts: StructuredControlItem[];
  methods: StructuredControlItem[];
}): string[] {
  const overview = sourceControlSectionSummary(args.sections, 'overview', args.topic);
  const background = sourceControlSectionSummary(args.sections, 'background');
  const method = sourceControlSectionSummary(args.sections, 'method');
  const experiment = sourceControlSectionSummary(args.sections, 'experiment');
  const limitation = sourceControlSectionSummary(args.sections, 'limitation');
  const conceptLine = structuredControlItemLabels(args.concepts, 4);
  const methodLine = structuredControlItemLabels(args.methods, 4);
  if (args.usageProfile === 'research') {
    return [
      `先用一句话定主线：${compact(overview, 180)}`,
      background
        ? `再解释问题背景：${compact(background, 180)}`
        : conceptLine
          ? `再把核心概念摆出来：${conceptLine}。`
          : '再解释论文要解决的研究缺口。',
      method
        ? `接着讲方法链路：${compact(method, 200)}`
        : `接着讲方法入口：${methodLine || '回到方法 section'}。`,
      experiment ? `然后讲证据：${compact(experiment, 180)}` : '然后讲实验指标、结果和 baseline。',
      limitation ? `最后讲边界：${compact(limitation, 180)}` : '最后讲不能外推的地方。',
    ];
  }
  return [
    `先定位课程单元：${compact(overview, 180)}`,
    conceptLine ? `再补先修和核心概念：${conceptLine}。` : '再补先修和核心概念。',
    method ? `接着转成课堂步骤：${compact(method, 180)}` : '接着转成课堂步骤或例题。',
    '最后生成复习提醒，并标出需要回到原文/RAG 的证据点。',
  ];
}

function sourceSpecificNotebookSummary(args: {
  topic: string;
  usageProfile: SourceUsageProfile;
  sections: StructuredControlSection[];
  concepts: StructuredControlItem[];
  methods: StructuredControlItem[];
}): string {
  const overview = sourceControlSectionSummary(args.sections, 'overview', args.topic);
  const background =
    sourceControlSectionSummary(args.sections, 'background') ||
    sourceControlSectionSummary(args.sections, 'learning_objectives');
  const method =
    sourceControlSectionSummary(args.sections, 'method') ||
    sourceControlSectionSummary(args.sections, 'teaching_flow') ||
    sourceControlSectionSummary(args.sections, 'actions_decisions');
  const experiment =
    sourceControlSectionSummary(args.sections, 'experiment') ||
    sourceControlSectionSummary(args.sections, 'assessment_practice') ||
    sourceControlSectionSummary(args.sections, 'review_diagnosis');
  const limitation = sourceControlSectionSummary(args.sections, 'limitation');
  const conceptLine = structuredControlItemLabels(args.concepts, 5);
  const methodLine = structuredControlItemLabels(args.methods, 4);

  if (args.usageProfile === 'research') {
    return compact(
      [
        `这本笔记围绕「${args.topic}」做论文精读：${overview}`,
        background ? `先读研究动机：${sentenceFragment(background, 180)}。` : '',
        method ? `主体读方法链路：${sentenceFragment(method, 220)}。` : '',
        experiment ? `证据部分看：${sentenceFragment(experiment, 180)}。` : '',
        limitation ? `最后收束边界：${sentenceFragment(limitation, 160)}。` : '',
        conceptLine ? `检索时优先从 ${conceptLine} 进入。` : '',
        methodLine ? `方法/工具入口是 ${methodLine}。` : '',
      ]
        .filter(Boolean)
        .join(' '),
      780,
    );
  }

  if (args.usageProfile === 'university_course') {
    return compact(
      [
        `这本笔记把「${args.topic}」整理成可学习的课程材料：${overview}`,
        conceptLine ? `先抓 ${conceptLine}。` : '',
        method ? `讲解顺序围绕 ${sentenceFragment(method, 200)}。` : '',
        experiment ? `练习或评估时回到 ${sentenceFragment(experiment, 160)}。` : '',
      ]
        .filter(Boolean)
        .join(' '),
      680,
    );
  }

  return compact(
    [
      `这本笔记是「${args.topic}」的个人资料索引：${overview}`,
      method ? `查动作或流程时看 ${sentenceFragment(method, 180)}。` : '',
      conceptLine ? `检索入口包括 ${conceptLine}。` : '',
    ]
      .filter(Boolean)
      .join(' '),
    560,
  );
}

function sourceSpecificNotebookLearningPath(args: {
  topic: string;
  usageProfile: SourceUsageProfile;
  sections: StructuredControlSection[];
  concepts: StructuredControlItem[];
  methods: StructuredControlItem[];
}): string[] {
  const sectionByRole = (role: string) => args.sections.find((section) => section.role === role);
  const orderedRoles =
    args.usageProfile === 'research'
      ? ['overview', 'background', 'method', 'experiment', 'limitation']
      : args.usageProfile === 'university_course'
        ? [
            'learning_objectives',
            'concepts_prerequisites',
            'teaching_flow',
            'assessment_practice',
            'review_diagnosis',
          ]
        : [
            'summary',
            'key_information',
            'timeline_context',
            'actions_decisions',
            'source_tracking',
          ];
  const usedTitles = new Set<string>();
  const path = orderedRoles
    .map((role) => sectionByRole(role))
    .filter((section): section is StructuredControlSection => Boolean(section))
    .map((section) => {
      usedTitles.add(section.title);
      return `${section.title}：${compact(section.summary, 180)}`;
    });

  for (const section of args.sections) {
    if (path.length >= 6) break;
    if (usedTitles.has(section.title)) continue;
    usedTitles.add(section.title);
    path.push(`${section.title}：${compact(section.summary, 180)}`);
  }

  if (path.length === 0) {
    path.push(`${args.topic}：先读笔记本摘要，再回到 RAG 查原文证据。`);
  }
  return path.slice(0, 6);
}

function sourceSpecificNotebookTakeaways(args: {
  topic: string;
  usageProfile: SourceUsageProfile;
  sections: StructuredControlSection[];
  concepts: StructuredControlItem[];
  methods: StructuredControlItem[];
}): string[] {
  const overview =
    sourceControlSectionSummary(args.sections, 'overview') ||
    sourceControlSectionSummary(args.sections, 'learning_objectives') ||
    sourceControlSectionSummary(args.sections, 'summary');
  const method =
    sourceControlSectionSummary(args.sections, 'method') ||
    sourceControlSectionSummary(args.sections, 'teaching_flow') ||
    sourceControlSectionSummary(args.sections, 'actions_decisions');
  const experiment =
    sourceControlSectionSummary(args.sections, 'experiment') ||
    sourceControlSectionSummary(args.sections, 'assessment_practice') ||
    sourceControlSectionSummary(args.sections, 'review_diagnosis');
  const limitation = sourceControlSectionSummary(args.sections, 'limitation');
  const conceptLine = structuredControlItemLabels(args.concepts, 4);
  const methodLine = structuredControlItemLabels(args.methods, 4);
  const takeaways =
    args.usageProfile === 'research'
      ? [
          overview ? `主张：${compact(overview, 180)}` : `主题：${args.topic}`,
          method ? `方法：${compact(method, 180)}` : methodLine ? `方法入口：${methodLine}` : '',
          experiment ? `证据：${compact(experiment, 180)}` : '',
          conceptLine ? `概念：${conceptLine}` : '',
          limitation ? `边界：${compact(limitation, 180)}` : '',
        ]
      : args.usageProfile === 'university_course'
        ? [
            overview ? `课程位置：${compact(overview, 180)}` : `课程单元：${args.topic}`,
            conceptLine ? `先修/核心概念：${conceptLine}` : '',
            method ? `讲解主线：${compact(method, 180)}` : '',
            limitation ? `易错边界：${compact(limitation, 180)}` : '',
          ]
        : [
            overview ? `关键信息：${compact(overview, 180)}` : `资料主题：${args.topic}`,
            method ? `行动/流程：${compact(method, 180)}` : '',
            conceptLine ? `检索入口：${conceptLine}` : '',
          ];
  return takeaways.filter(Boolean).slice(0, 6);
}

function sourceSpecificNotebookAnswerStrategy(args: {
  topic: string;
  usageProfile: SourceUsageProfile;
  concepts: StructuredControlItem[];
  methods: StructuredControlItem[];
}): string[] {
  const conceptLine = structuredControlItemLabels(args.concepts, 4);
  const methodLine = structuredControlItemLabels(args.methods, 4);
  if (args.usageProfile === 'research') {
    return [
      `问「${args.topic}」讲什么时，先用笔记本摘要和学习脉络回答主线。`,
      conceptLine
        ? `问 ${conceptLine} 的定义、作用或关系时，先查概念入口，再回到对应 section。`
        : '问核心概念时，先查概念入口，再回到对应 section。',
      methodLine
        ? `问 ${methodLine} 的工作流时，先查方法/工具入口，再转到方法或实验 section。`
        : '问方法链路时，先查方法/工具入口，再转到方法或实验 section。',
      '问原文引用、精确数值、表格结果或 baseline 细节时，必须使用 notebook section/RAG，不只用这条记忆。',
    ];
  }
  if (args.usageProfile === 'university_course') {
    return [
      `问「${args.topic}」怎么学时，先读学习脉络，再进入对应 section。`,
      conceptLine
        ? `问 ${conceptLine} 时，先查概念入口，再配合课堂例子解释。`
        : '问概念时，先查概念入口，再配合课堂例子解释。',
      '问作业、考试或复习时，先查 Section 导航里的考核/复习入口，再回到原文证据。',
    ];
  }
  return [
    `问「${args.topic}」相关事项时，先用笔记本摘要定位。`,
    '问具体决定、待办、时间或责任人时，转到对应 section/RAG 核对。',
  ];
}

function buildStructuredSourceNotes(args: {
  sourceTitle: string;
  topic: string;
  sourcePacket: SourcePacket;
  sections: Array<{ id: string; title: string; summary: string | null }>;
  templateTitles: string[];
}): SourceStructuredNotes {
  const usageProfile = args.sourcePacket.classification.usageProfile;
  const sectionCards = args.sections.slice(0, 8).map((section, index) => {
    const packetSection = args.sourcePacket.notebookSections[index];
    return {
      title: section.title,
      role: structuredSectionRole({
        key: packetSection?.key || section.title,
        title: section.title,
        usageProfile,
      }),
      summary: section.summary || packetSection?.summary || '资料段落',
      evidenceRefs: [section.id],
    };
  });
  const retrievalTriggers = sourceRetrievalTriggers({
    topic: args.topic,
    sourcePacket: args.sourcePacket,
    usageProfile,
  });
  const conceptItems = structuredItems({
    values: args.sourcePacket.graph.concepts,
    sourcePacket: args.sourcePacket,
    usageProfile,
    itemKind: 'concept',
  });
  const methodItems = structuredItems({
    values: args.sourcePacket.graph.methods,
    sourcePacket: args.sourcePacket,
    usageProfile,
    itemKind: 'method',
  });
  const controlSummary = sourceSpecificControlSummary({
    topic: args.topic,
    usageProfile,
    sections: sectionCards,
    concepts: conceptItems,
    methods: methodItems,
  });
  const controlPlacement = sourceSpecificPlacement({
    topic: args.topic,
    usageProfile,
    sections: sectionCards,
    concepts: conceptItems,
    methods: methodItems,
    templateTitles: args.templateTitles,
  });
  const controlUseWhen = sourceSpecificUseWhen({
    topic: args.topic,
    usageProfile,
    concepts: conceptItems,
    methods: methodItems,
    sections: sectionCards,
  });
  const controlDoNotUseWhen = sourceSpecificDoNotUseWhen({
    topic: args.topic,
    usageProfile,
    concepts: conceptItems,
    sections: sectionCards,
  });
  const controlTeachingMoves = sourceSpecificTeachingMoves({
    topic: args.topic,
    usageProfile,
    sections: sectionCards,
    concepts: conceptItems,
    methods: methodItems,
  });
  const notebookSummary = sourceSpecificNotebookSummary({
    topic: args.topic,
    usageProfile,
    sections: sectionCards,
    concepts: conceptItems,
    methods: methodItems,
  });
  const notebookLearningPath = sourceSpecificNotebookLearningPath({
    topic: args.topic,
    usageProfile,
    sections: sectionCards,
    concepts: conceptItems,
    methods: methodItems,
  });
  const notebookKeyTakeaways = sourceSpecificNotebookTakeaways({
    topic: args.topic,
    usageProfile,
    sections: sectionCards,
    concepts: conceptItems,
    methods: methodItems,
  });
  const notebookAnswerStrategy = sourceSpecificNotebookAnswerStrategy({
    topic: args.topic,
    usageProfile,
    concepts: conceptItems,
    methods: methodItems,
  });

  if (usageProfile === 'university_course') {
    return {
      version: 1,
      usageProfile,
      notebookKnowledge: {
        componentType: 'course_learning_card',
        title: `课程学习卡：${cleanTitle(args.sourceTitle)}`,
        subtitle: 'Notebook Knowledge Layer',
        summary: notebookSummary,
        learningPath: notebookLearningPath,
        keyTakeaways: notebookKeyTakeaways,
        answerStrategy: notebookAnswerStrategy,
        sections: sectionCards,
        concepts: conceptItems,
        methods: methodItems,
        retrievalTriggers,
      },
      courseControl: {
        componentType: 'course_control_card',
        title: `课程控制卡：${cleanTitle(args.sourceTitle)}`,
        summary: controlSummary,
        placement: controlPlacement,
        useWhen: controlUseWhen,
        doNotUseWhen: controlDoNotUseWhen,
        teachingMoves: controlTeachingMoves,
        boundaryWarnings: [sourceMemoryBoundary(args.sourcePacket)],
        graphLinks: [
          { kind: 'depends_on', items: conceptItems.slice(0, 6).map((item) => item.label) },
          { kind: 'opens_question', items: retrievalTriggers.slice(0, 5) },
        ],
      },
    };
  }

  if (usageProfile === 'daily_use') {
    return {
      version: 1,
      usageProfile,
      notebookKnowledge: {
        componentType: 'daily_index_card',
        title: `日常资料卡：${cleanTitle(args.sourceTitle)}`,
        subtitle: 'Personal Source Index',
        summary: notebookSummary,
        learningPath: notebookLearningPath,
        keyTakeaways: notebookKeyTakeaways,
        answerStrategy: notebookAnswerStrategy,
        sections: sectionCards,
        concepts: conceptItems,
        methods: methodItems,
        retrievalTriggers,
      },
      courseControl: {
        componentType: 'daily_private_card',
        title: `个人追踪卡：${cleanTitle(args.sourceTitle)}`,
        summary: controlSummary,
        placement: [
          ...controlPlacement,
          { label: '公共课程层', detail: '跳过，避免污染课程公共规则。' },
        ],
        useWhen: controlUseWhen,
        doNotUseWhen: ['课程答题模板', '课程知识图谱公共规则', '科研结论引用'],
        teachingMoves: controlTeachingMoves,
        boundaryWarnings: [sourceMemoryBoundary(args.sourcePacket)],
        graphLinks: [{ kind: 'opens_question', items: retrievalTriggers.slice(0, 5) }],
      },
    };
  }

  return {
    version: 1,
    usageProfile,
    notebookKnowledge: {
      componentType: 'research_evidence_card',
      title: `论文精读卡：${cleanTitle(args.sourceTitle)}`,
      subtitle: 'Paper Evidence Card',
      summary: notebookSummary,
      learningPath: notebookLearningPath,
      keyTakeaways: notebookKeyTakeaways,
      answerStrategy: notebookAnswerStrategy,
      sections: sectionCards,
      concepts: conceptItems,
      methods: methodItems,
      retrievalTriggers,
    },
    courseControl: {
      componentType: 'research_control_card',
      title: `研究控制卡：${cleanTitle(args.sourceTitle)}`,
      summary: controlSummary,
      placement: controlPlacement,
      useWhen: controlUseWhen,
      doNotUseWhen: controlDoNotUseWhen,
      teachingMoves: controlTeachingMoves,
      boundaryWarnings: [sourceMemoryBoundary(args.sourcePacket)],
      graphLinks: [
        { kind: 'complements', items: conceptItems.slice(0, 5).map((item) => item.label) },
        { kind: 'opens_question', items: retrievalTriggers.slice(0, 5) },
      ],
    },
  };
}

function buildCourseKnowledgeMemoryText(args: {
  sourceTitle: string;
  topic: string;
  sections: Array<{ id: string; title: string; summary: string | null }>;
  sourcePacket: SourcePacket;
  templateTitles: string[];
  notebookId: string | null;
}): string {
  if (args.sourcePacket.structuredNotes) {
    return buildStructuredCourseMemoryText({
      ...args,
      notes: args.sourcePacket.structuredNotes,
    });
  }

  if (args.sourcePacket.classification.usageProfile === 'university_course') {
    const digest = sourceMemorySectionDigest({
      sections: args.sections,
      sourcePacket: args.sourcePacket,
      maxExcerptChars: 180,
    }).join('\n');
    const templateLine = args.templateTitles.length
      ? `课程模板/答题契约：${args.templateTitles.join('；')}。后续答题、批改和讲解要优先遵守这些本地要求。`
      : '本次没有识别出可静态注入的课程模板；普通知识点保留在 notebook/RAG 中检索。';
    const conceptLine = sourceMemoryConceptLine(args.sourcePacket);
    const methodLine = sourceMemoryMethodLine(args.sourcePacket);
    return compact(
      [
        `大学课程链路 - 课程控制层：课程新增资料《${args.sourceTitle}》，主题为「${args.topic}」。这条记忆用于同一课程内的教学控制、跨 notebook 检索和复习规划，不是论文综述。`,
        `资料类型判定：${args.sourcePacket.classification.documentType}；链路判定：${usageProfileLabel(args.sourcePacket.classification.usageProfile)}，置信度 ${args.sourcePacket.classification.usageProfileConfidence.toFixed(2)}。`,
        '',
        '课程层应该记住的不是全文，而是：这份资料属于哪个课程单元、它新增哪些学习目标、需要哪些先修概念、和作业/考试/模板有什么关系。',
        '',
        '课程组织线索：',
        digest,
        '',
        templateLine,
        args.sections.length
          ? `对应 notebook ${args.notebookId || 'N/A'} 中有 ${args.sections.length} 个可查询 section。逐段讲解、引用原文、生成复习材料时，应跳到 notebook 层/RAG。`
          : '',
        conceptLine,
        methodLine,
        sourceMemoryBoundary(args.sourcePacket),
      ]
        .filter((line) => line.trim())
        .join('\n'),
      2_800,
    );
  }

  if (args.sourcePacket.classification.usageProfile === 'daily_use') {
    return compact(
      [
        `日常使用链路 - 课程层跳过说明：上传资料《${args.sourceTitle}》主题为「${args.topic}」，但它被判定为日常使用资料，不应升级成课程公共规则。`,
        '如需在当前课程空间中检索，应使用 notebook/RAG；如需记录个人待办、偏好或长期计划，应写入私有记忆而不是课程控制层。',
        sourceMemoryBoundary(args.sourcePacket),
      ].join('\n'),
      1_200,
    );
  }

  const publicSummary = args.sourcePacket.memory?.publicSummary
    ? compact(args.sourcePacket.memory.publicSummary, 1_450)
    : sourceMemorySectionDigest({
        sections: args.sections,
        sourcePacket: args.sourcePacket,
        maxExcerptChars: 180,
      }).join('\n');
  const conceptLine = sourceMemoryConceptLine(args.sourcePacket);
  const methodLine = sourceMemoryMethodLine(args.sourcePacket);
  const templateLine = args.templateTitles.length
    ? `同时识别到课程模板/要求：${args.templateTitles.join('；')}。`
    : '';
  const sectionTitles = args.sections.map((section) => section.title).join('；');

  return compact(
    [
      `课程层记忆：课程新增资料《${args.sourceTitle}》，主题为「${args.topic}」。这条记忆用于同一课程内的跨笔记本问答、检索路由和课程知识地图更新；不要把它当作当前 notebook 的章节笔记原文。`,
      `资料类型判定：${args.sourcePacket.classification.documentType}，置信度 ${args.sourcePacket.classification.confidence.toFixed(2)}。`,
      '',
      '它给课程增加的知识范围：',
      publicSummary,
      '',
      args.sections.length
        ? `对应笔记本 ${args.notebookId || 'N/A'} 中有 ${args.sections.length} 个可查询 section：${sectionTitles}。需要逐段讲解或引用原文时，应跳到笔记本层/RAG，而不是只用这条课程层摘要。`
        : '',
      conceptLine,
      methodLine,
      templateLine,
      sourceMemoryBoundary(args.sourcePacket),
    ]
      .filter((line) => line.trim())
      .join('\n'),
    2_800,
  );
}

function buildNotebookKnowledgeMemoryText(args: {
  sourceTitle: string;
  topic: string;
  sections: Array<{ id: string; title: string; summary: string | null }>;
  sourcePacket: SourcePacket;
  templateTitles: string[];
}): string {
  if (args.sourcePacket.structuredNotes) {
    return buildStructuredNotebookMemoryText({
      ...args,
      notes: args.sourcePacket.structuredNotes,
    });
  }

  if (args.sourcePacket.classification.usageProfile === 'university_course') {
    const sectionDigest = sourceMemorySectionDigest({
      sections: args.sections,
      sourcePacket: args.sourcePacket,
      maxExcerptChars: 360,
    });
    const conceptLine = sourceMemoryConceptLine(args.sourcePacket);
    const methodLine = sourceMemoryMethodLine(args.sourcePacket);
    const templateLine = args.templateTitles.length
      ? `本 notebook 带有课程模板/要求线索：${args.templateTitles.join('；')}。`
      : '';

    return compact(
      [
        `大学课程链路 - 笔记本知识层：本 notebook 是资料《${args.sourceTitle}》的课程学习入口，主题为「${args.topic}」。它用于当前 notebook 内的课堂讲解、复习、例题定位和原文回查。`,
        `资料类型判定：${args.sourcePacket.classification.documentType}；链路判定：${usageProfileLabel(args.sourcePacket.classification.usageProfile)}，置信度 ${args.sourcePacket.classification.usageProfileConfidence.toFixed(2)}。`,
        args.sections.length
          ? `可查询纯文本已写入 ${args.sections.length} 个 Markdown sections：${args.sections.map((section) => section.title).join('；')}。`
          : '可查询纯文本已写入本笔记本。',
        '',
        '本 notebook 的课程学习脉络：',
        ...sectionDigest,
        '',
        '回答当前 notebook 的问题时，优先按“课程位置 -> 核心概念 -> 课堂讲解 -> 题目/考试接口 -> 复习易错点”的顺序组织。不要把它写成科研论文综述。',
        conceptLine,
        methodLine,
        templateLine,
        sourceMemoryBoundary(args.sourcePacket),
      ]
        .filter((line) => line.trim())
        .join('\n'),
      3_400,
    );
  }

  if (args.sourcePacket.classification.usageProfile === 'daily_use') {
    const sectionDigest = sourceMemorySectionDigest({
      sections: args.sections,
      sourcePacket: args.sourcePacket,
      maxExcerptChars: 300,
    });
    return compact(
      [
        `日常使用链路 - 笔记本索引层：本 notebook 是资料《${args.sourceTitle}》的个人/日常资料入口，主题为「${args.topic}」。它用于快速查找摘要、关键信息、待办、决定、时间线和原文证据。`,
        `资料类型判定：${args.sourcePacket.classification.documentType}；链路判定：${usageProfileLabel(args.sourcePacket.classification.usageProfile)}，置信度 ${args.sourcePacket.classification.usageProfileConfidence.toFixed(2)}。`,
        args.sections.length
          ? `可查询纯文本已写入 ${args.sections.length} 个 Markdown sections：${args.sections.map((section) => section.title).join('；')}。`
          : '可查询纯文本已写入本笔记本。',
        '',
        '本 notebook 的日常检索入口：',
        ...sectionDigest,
        '',
        '回答时优先帮用户回忆事实、整理行动项、定位截止时间和后续追踪；不要把它提升为课程知识图谱的教学规则。',
        sourceMemoryBoundary(args.sourcePacket),
      ]
        .filter((line) => line.trim())
        .join('\n'),
      2_800,
    );
  }

  const sectionDigest = sourceMemorySectionDigest({
    sections: args.sections,
    sourcePacket: args.sourcePacket,
    maxExcerptChars: 420,
  });
  const conceptLine = sourceMemoryConceptLine(args.sourcePacket);
  const methodLine = sourceMemoryMethodLine(args.sourcePacket);
  const templateLine = args.templateTitles.length
    ? `本笔记本还带有课程模板/要求线索：${args.templateTitles.join('；')}。`
    : '';

  return compact(
    [
      `笔记本层记忆：本 notebook 是资料《${args.sourceTitle}》的局部学习入口，主题为「${args.topic}」。这条记忆用于当前 notebook 内的章节导航、局部讲解、回到原文段落和课堂问答；不要把它当作整门课的全局规则。`,
      `资料类型判定：${args.sourcePacket.classification.documentType}，置信度 ${args.sourcePacket.classification.confidence.toFixed(2)}。`,
      args.sections.length
        ? `可查询纯文本已写入 ${args.sections.length} 个 Markdown sections：${args.sections.map((section) => section.title).join('；')}。`
        : '可查询纯文本已写入本笔记本。',
      '',
      '本 notebook 的章节导航：',
      ...sectionDigest,
      conceptLine,
      methodLine,
      templateLine,
      `${sourceMemoryBoundary(args.sourcePacket)} 当前 notebook 层回答时，应优先使用这些 section 的纯文本笔记和原始证据。`,
    ]
      .filter((line) => line.trim())
      .join('\n'),
    3_400,
  );
}

function buildNotebookSummaryCandidate(args: {
  notebookId: string;
  sourceTitle: string;
  topic: string;
  sections: Array<{ id: string; title: string; summary: string | null }>;
  sourceKind: SourceUploadKind;
  sourceHash: string;
  sourcePacket: SourcePacket;
  artifacts: SourceMemoryArtifact[];
}): MemoryWriteCandidate {
  const templateTitles = args.artifacts
    .filter((artifact) => artifact.staticInjectionCandidate)
    .map((artifact) => artifact.title)
    .slice(0, 8);
  return {
    trigger: 'source_import',
    contentType: 'notebook_requirement',
    targetType: 'notebook',
    targetId: args.notebookId,
    privacy: 'public',
    source: 'source-upload-ingestion',
    sourceRef: {
      sourceTitle: args.sourceTitle,
      sourceKind: args.sourceKind,
      sourceHash: args.sourceHash,
      sectionIds: args.sections.map((section) => section.id),
      documentType: args.sourcePacket.classification.documentType,
    },
    studyMemory: {
      targetType: 'notebook',
      targetId: args.notebookId,
      scope: 'public',
      kind: 'source_summary',
      title: `资料索引：${cleanTitle(args.sourceTitle)}`,
      text: buildNotebookKnowledgeMemoryText({
        sourceTitle: args.sourceTitle,
        topic: args.topic,
        sections: args.sections,
        sourcePacket: args.sourcePacket,
        templateTitles,
      }),
      reason:
        '上传资料不是全题目文件，需要给笔记本聊天和后续生成提供稳定的公共检索入口与课程知识摘要。',
      sourceReferences: [
        {
          order: 1,
          title: args.sourceTitle,
          why: 'Uploaded source organized into searchable notebook content and public course memory.',
          sourceKind: args.sourceKind,
          sourceHash: args.sourceHash,
          sectionIds: args.sections.map((section) => section.id),
          documentType: args.sourcePacket.classification.documentType,
        },
      ],
    },
  };
}

function buildDailyPrivateSourceCandidate(args: {
  notebookId: string;
  sourceTitle: string;
  topic: string;
  sections: Array<{ id: string; title: string; summary: string | null }>;
  sourceKind: SourceUploadKind;
  sourceHash: string;
  sourcePacket: SourcePacket;
}): MemoryWriteCandidate {
  const sectionLine = args.sections.length
    ? `相关 section：${args.sections.map((section) => section.title).join('；')}。`
    : '';
  return {
    trigger: 'source_import',
    contentType: 'learning_pattern',
    targetType: 'notebook',
    targetId: args.notebookId,
    privacy: 'private',
    source: 'source-upload-ingestion',
    sourceRef: {
      sourceTitle: args.sourceTitle,
      sourceKind: args.sourceKind,
      sourceHash: args.sourceHash,
      sectionIds: args.sections.map((section) => section.id),
      documentType: args.sourcePacket.classification.documentType,
      usageProfile: args.sourcePacket.classification.usageProfile,
    },
    studyMemory: {
      targetType: 'notebook',
      targetId: args.notebookId,
      scope: 'private',
      kind: 'daily_source_private_index',
      title: `个人资料索引：${cleanTitle(args.sourceTitle)}`,
      text: compact(
        [
          `日常资料私有索引：用户上传了《${args.sourceTitle}》，主题为「${args.topic}」。这条记忆只用于帮助用户个人回忆资料、待办、决定、时间线和后续追踪；不要作为课程公共知识或答题模板注入。`,
          sectionLine,
          args.sourcePacket.memory?.privateUpdatePolicy ||
            '如资料中包含长期偏好、固定计划或明确待办，后续应在用户确认或交互中继续写入更具体的私有记忆；本条只记录资料入口。',
        ]
          .filter((line) => line.trim())
          .join('\n'),
        1_600,
      ),
      reason: '日常资料不应污染课程公共记忆，但需要给用户自己的后续查询和行动追踪保留入口。',
      sourceReferences: [
        {
          order: 1,
          title: args.sourceTitle,
          why: 'Daily-use source organized into private notebook context.',
          sourceKind: args.sourceKind,
          sourceHash: args.sourceHash,
          sectionIds: args.sections.map((section) => section.id),
          documentType: args.sourcePacket.classification.documentType,
          usageProfile: args.sourcePacket.classification.usageProfile,
        },
      ],
    },
  };
}

function buildCourseSummaryCandidate(args: {
  courseId: string;
  sourceTitle: string;
  topic: string;
  sections: Array<{ id: string; title: string; summary: string | null }>;
  sourceKind: SourceUploadKind;
  sourceHash: string;
  sourcePacket: SourcePacket;
  artifacts: SourceMemoryArtifact[];
  notebookId: string | null;
}): MemoryWriteCandidate {
  const templateTitles = args.artifacts
    .filter((artifact) => artifact.staticInjectionCandidate)
    .map((artifact) => artifact.title)
    .slice(0, 8);
  return {
    trigger: 'source_import',
    contentType: 'course_requirement',
    targetType: 'course',
    targetId: args.courseId,
    privacy: 'public',
    source: 'source-upload-ingestion',
    sourceRef: {
      sourceTitle: args.sourceTitle,
      sourceKind: args.sourceKind,
      sourceHash: args.sourceHash,
      notebookId: args.notebookId,
      sectionIds: args.sections.map((section) => section.id),
      documentType: args.sourcePacket.classification.documentType,
    },
    studyMemory: {
      targetType: 'course',
      targetId: args.courseId,
      scope: 'public',
      kind: 'source_course_knowledge',
      title: `课程资料：${cleanTitle(args.sourceTitle)}`,
      text: buildCourseKnowledgeMemoryText({
        sourceTitle: args.sourceTitle,
        topic: args.topic,
        sections: args.sections,
        sourcePacket: args.sourcePacket,
        templateTitles,
        notebookId: args.notebookId,
      }),
      reason:
        '上传资料补充了课程级知识，需要在同一门课的其他笔记本/课堂问答中也能作为公共课程记忆被召回。',
      sourceReferences: [
        {
          order: 1,
          title: args.sourceTitle,
          why: 'Uploaded source promoted to course-level public memory for cross-notebook recall.',
          sourceKind: args.sourceKind,
          sourceHash: args.sourceHash,
          notebookId: args.notebookId,
          sectionIds: args.sections.map((section) => section.id),
          documentType: args.sourcePacket.classification.documentType,
        },
      ],
    },
  };
}

function conceptCandidates(args: {
  topic: string;
  text: string;
  artifacts: SourceMemoryArtifact[];
  drafts: NotebookProblemImportDraft[];
}): string[] {
  const headings = Array.from(args.text.matchAll(/^\s{0,3}#{1,3}\s+(.+)$/gm)).map((match) =>
    cleanTitle(match[1]),
  );
  const tags = args.drafts.flatMap((draft) => draft.tags);
  const artifactTags = args.artifacts
    .filter((artifact) => artifact.artifactKind !== 'discarded_generic_concept')
    .flatMap((artifact) => artifact.tags);
  const codeSignals = Array.from(args.text.matchAll(/\b(?:class|def)\s+([A-Za-z_]\w*)/g)).map(
    (match) => match[1],
  );
  return Array.from(
    new Set(
      [args.topic, ...headings, ...tags, ...artifactTags, ...codeSignals]
        .map((item) => cleanTitle(item))
        .filter((item) => item.length >= 2),
    ),
  ).slice(0, KNOWLEDGE_GRAPH_MAX_CONCEPTS);
}

function normalizeKnowledgeConcepts(concepts: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const concept of concepts) {
    const item = cleanTitle(concept);
    const key = item.toLowerCase();
    if (item.length < 2 || KNOWLEDGE_GRAPH_CONCEPT_STOPWORDS.has(key) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(item);
  }
  return normalized.slice(0, KNOWLEDGE_GRAPH_MAX_CONCEPTS);
}

function buildLayeredMemoryStatuses(args: {
  usageProfile: SourceUsageProfile;
  notebookSectionCount: number;
  notebookCover: SourceUploadNotebookCoverResult | null;
  allQuestionUpload: boolean;
  publicPlatformMemoryCount: number;
  publicCourseMemoryCount: number;
  publicNotebookMemoryCount: number;
  privateMemoryCount: number;
  privateUpdatePolicy?: string;
  knowledgeGraphFactId: string | null;
  insertedProblemCount: number;
  extractedProblemCount: number;
  templateCount: number;
}): SourceUploadIngestionResult['memory']['layers'] {
  return [
    {
      layer: 'notebook_text',
      status: args.notebookSectionCount > 0 ? 'written' : 'skipped',
      summary:
        args.notebookSectionCount > 0
          ? `已写入 ${args.notebookSectionCount} 个中文 Markdown 笔记 section。`
          : args.allQuestionUpload
            ? '全题目文件不写 notebook。'
            : '本次没有生成 notebook section。',
    },
    {
      layer: 'notebook_cover',
      status: args.notebookCover?.status === 'generated' ? 'written' : 'skipped',
      summary:
        args.notebookCover?.status === 'generated'
          ? `已生成 A4 学习封面：${args.notebookCover.imagePath}`
          : args.allQuestionUpload
            ? '全题目文件不生成 notebook 封面。'
            : args.notebookCover?.status === 'failed'
              ? `封面生成失败，但入库继续完成：${args.notebookCover.reason || '未知错误'}`
              : args.notebookCover?.reason || '本次没有生成 notebook 封面。',
    },
    {
      layer: 'long_term_platform_memory',
      status: args.publicPlatformMemoryCount > 0 ? 'written' : 'skipped',
      summary:
        args.publicPlatformMemoryCount > 0
          ? `已写入 ${args.publicPlatformMemoryCount} 条平台级公共记忆。`
          : '本次上传没有跨课程平台偏好或全局规则，因此不写平台级记忆。',
    },
    {
      layer: 'long_term_course_memory',
      status: args.publicCourseMemoryCount > 0 ? 'written' : 'skipped',
      summary:
        args.publicCourseMemoryCount > 0
          ? args.usageProfile === 'university_course'
            ? `已写入 ${args.publicCourseMemoryCount} 条大学课程控制记忆。`
            : `已写入 ${args.publicCourseMemoryCount} 条课程级公共记忆。`
          : args.allQuestionUpload
            ? '全题目文件不写课程级资料记忆。'
            : args.usageProfile === 'daily_use'
              ? '日常资料不升级为课程控制层，避免污染课程公共规则。'
              : '没有可写入的课程级公共记忆。',
    },
    {
      layer: 'long_term_notebook_memory',
      status: args.publicNotebookMemoryCount > 0 ? 'written' : 'skipped',
      summary:
        args.publicNotebookMemoryCount > 0
          ? `已写入 ${args.publicNotebookMemoryCount} 条笔记本公共记忆。`
          : '没有可写入的公共记忆。',
    },
    {
      layer: 'long_term_private_memory',
      status: args.privateMemoryCount > 0 ? 'written' : 'skipped',
      summary:
        args.privateMemoryCount > 0
          ? args.usageProfile === 'daily_use'
            ? `已写入 ${args.privateMemoryCount} 条日常资料私有索引。`
            : `已写入 ${args.privateMemoryCount} 条学习者私有记忆。`
          : args.privateUpdatePolicy ||
            '课程资料上传没有学习者作答、薄弱点或下一步教学动作，因此不写入私有记忆。',
    },
    {
      layer: 'knowledge_graph',
      status: args.knowledgeGraphFactId ? 'written' : 'skipped',
      summary: args.knowledgeGraphFactId
        ? '已写入课程级 knowledge_graph fact，连接 source、topic、notebook sections、concepts 和 methods。'
        : '没有写入知识图谱 fact。',
    },
    {
      layer: 'knowledge_base_rag',
      status: 'written',
      summary:
        '已写入知识缓存/RAG 入口；长原文证据保留在 notebook sections 与 source index 中按需检索。',
    },
    {
      layer: 'problem_bank',
      status: args.insertedProblemCount > 0 ? 'written' : 'skipped',
      summary:
        args.insertedProblemCount > 0
          ? `识别 ${args.extractedProblemCount} 题，新增 ${args.insertedProblemCount} 题。`
          : args.extractedProblemCount > 0
            ? `识别 ${args.extractedProblemCount} 题，但没有新增题。`
            : '本资料判定不是题库，未生成题目。',
    },
    {
      layer: 'template_library',
      status: args.templateCount > 0 ? 'written' : 'skipped',
      summary:
        args.templateCount > 0
          ? `已写入 ${args.templateCount} 条课程模板/要求。`
          : '未识别到课程模板或答题契约。',
    },
  ];
}

function buildKnowledgeGraphValue(args: {
  courseId: string;
  courseCode: string | null;
  sourceTitle: string;
  sourceKind: SourceUploadKind;
  sourceHash: string;
  sourcePacket: SourcePacket;
  topic: string;
  text: string;
  artifacts: SourceMemoryArtifact[];
  drafts: NotebookProblemImportDraft[];
  insertedProblemCount: number;
  duplicateProblemCount: number;
  allQuestionUpload: boolean;
  notebookId?: string | null;
  sections?: Array<{ id: string; title: string; summary: string | null }>;
  notebookCover?: SourceUploadNotebookCoverResult | null;
}) {
  const concepts = normalizeKnowledgeConcepts([
    ...conceptCandidates(args),
    ...args.sourcePacket.graph.concepts,
  ]);
  const methods = args.sourcePacket.graph.methods.slice(0, 18);
  const sourceNodeId = `source:${args.sourceHash.slice(0, 16)}`;
  const topicNodeId = `topic:${sha256(args.topic).slice(0, 16)}`;
  const notebookNodeId = args.notebookId ? `notebook:${args.notebookId}` : null;
  const nodes = [
    {
      id: sourceNodeId,
      label: args.sourceTitle,
      type: 'source',
      documentType: args.sourcePacket.classification.documentType,
      usageProfile: args.sourcePacket.classification.usageProfile,
      weight: 1,
    },
    { id: topicNodeId, label: args.topic, type: 'topic', weight: 1 },
    ...(notebookNodeId
      ? [{ id: notebookNodeId, label: 'Notebook', type: 'notebook', weight: 1 }]
      : []),
    ...(args.sections || []).map((section) => ({
      id: `section:${section.id}`,
      label: section.title,
      type: 'notebook_section',
      weight: 1,
    })),
    ...concepts.map((concept) => ({
      id: `concept:${sha256(concept).slice(0, 16)}`,
      label: concept,
      type: 'concept',
      weight: 1,
    })),
    ...methods.map((method) => ({
      id: `method:${sha256(method).slice(0, 16)}`,
      label: method,
      type: 'method',
      weight: 1,
    })),
    ...args.artifacts
      .filter((artifact) => artifact.staticInjectionCandidate)
      .map((artifact) => ({
        id: `template:${artifact.id}`,
        label: artifact.title,
        type: 'template',
        weight: 1,
      })),
  ];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = [
    { from: sourceNodeId, to: topicNodeId, kind: 'covers', weight: 1 },
    ...(notebookNodeId
      ? [{ from: sourceNodeId, to: notebookNodeId, kind: 'organized_as', weight: 1 }]
      : []),
    ...(args.sections || []).map((section) => ({
      from: notebookNodeId || sourceNodeId,
      to: `section:${section.id}`,
      kind: notebookNodeId ? 'contains_section' : 'derived_section',
      weight: 1,
    })),
    ...concepts.map((concept) => ({
      from: topicNodeId,
      to: `concept:${sha256(concept).slice(0, 16)}`,
      kind: 'includes',
      weight: 1,
    })),
    ...methods.map((method) => ({
      from: sourceNodeId,
      to: `method:${sha256(method).slice(0, 16)}`,
      kind: 'uses_method',
      weight: 1,
    })),
    ...args.artifacts
      .filter((artifact) => artifact.staticInjectionCandidate)
      .map((artifact) => ({
        from: sourceNodeId,
        to: `template:${artifact.id}`,
        kind: 'defines_template',
        weight: 1,
      })),
  ].filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to));

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    courseId: args.courseId,
    courseCode: args.courseCode,
    source: {
      title: args.sourceTitle,
      kind: args.sourceKind,
      hash: args.sourceHash,
      rawFileHash: args.sourcePacket.source.rawFileHash,
      openaiFileId: args.sourcePacket.source.openaiFileId,
      parser: args.sourcePacket.source.parser,
    },
    topic: args.topic,
    documentType: args.sourcePacket.classification.documentType,
    usageProfile: args.sourcePacket.classification.usageProfile,
    usageProfileConfidence: args.sourcePacket.classification.usageProfileConfidence,
    usageProfileReasons: args.sourcePacket.classification.usageProfileReasons,
    classificationConfidence: args.sourcePacket.classification.confidence,
    classificationReasons: args.sourcePacket.classification.reasons,
    structuredNotes: args.sourcePacket.structuredNotes ?? null,
    cover: args.notebookCover
      ? {
          status: args.notebookCover.status,
          imagePath: args.notebookCover.imagePath,
          providerId: args.notebookCover.providerId,
          model: args.notebookCover.model,
          reason: args.notebookCover.reason,
        }
      : null,
    allQuestionUpload: args.allQuestionUpload,
    notebookId: args.notebookId ?? null,
    sectionIds: (args.sections || []).map((section) => section.id),
    stats: {
      extractedProblemCount: args.drafts.length,
      insertedProblemCount: args.insertedProblemCount,
      duplicateProblemCount: args.duplicateProblemCount,
      templateArtifactCount: args.artifacts.filter((artifact) => artifact.staticInjectionCandidate)
        .length,
    },
    nodes,
    edges,
  };
}

async function writeKnowledgeGraphFact(args: {
  prisma: PrismaClient;
  userId: string;
  courseId: string;
  sourceHash: string;
  value: unknown;
}): Promise<string | null> {
  const [result] = await routeLayeredMemoryWriteCandidates({
    prisma: args.prisma,
    userId: args.userId,
    candidates: [
      {
        trigger: 'source_import',
        contentType: 'current_fact',
        scopeType: 'course',
        scopeId: args.courseId,
        source: 'source-upload-ingestion',
        fact: {
          namespace: 'knowledge_graph',
          key: `source:${args.sourceHash}`,
          valueJson: args.value,
          confidence: 0.86,
        },
      },
    ],
  });
  return result?.fact?.id ?? null;
}

export async function ingestCourseSourceUpload(
  args: IngestCourseSourceUploadArgs,
): Promise<SourceUploadIngestionResult> {
  const course = await args.prisma.course.findFirst({
    where: { id: args.courseId, ownerId: args.userId },
    select: { id: true, name: true, courseCode: true, language: true },
  });
  if (!course) throw new Error('Course not found');

  const rawText = args.text.trim();
  if (!rawText) throw new Error('Uploaded source text is empty');
  const processedText = compact(rawText, MAX_SOURCE_TEXT_CHARS);
  const sourceKind = args.sourceKind || 'plain_text';
  const sourceHash =
    args.rawFileHash?.trim() || sha256([args.sourceTitle, sourceKind, processedText].join('\n\n'));
  const memoryPlan = planSourceMemoryIngestion({
    targetType: 'course',
    targetId: args.courseId,
    courseCode: course.courseCode || undefined,
    sourceTitle: args.sourceTitle,
    sourceKind: sourceKindForMemory(sourceKind),
    sourceHash,
    text: processedText,
    audience: 'creator',
  });

  await ensureLegacyProblemsBackfilledForCourse(args.userId, args.courseId);

  const problemSignals = problemSignalCount(processedText);
  const preliminaryDocumentType = classifySourceDocumentType({
    sourceTitle: args.sourceTitle,
    sourceKind,
    text: processedText,
    problemSignalCount: problemSignals,
  });
  const shouldExtractProblems =
    sourceKind === 'problem_bank' ||
    (preliminaryDocumentType !== 'paper' &&
      preliminaryDocumentType !== 'template_policy' &&
      looksWorthProblemExtraction(processedText, sourceKind));
  const problemExtraction = shouldExtractProblems
    ? await extractProblemDraftsFromText({
        text: compact(processedText, MAX_PROBLEM_EXTRACTION_CHARS),
        source: sourceKindForProblemImport(sourceKind),
        language: args.language || 'zh-CN',
        model: args.model,
      })
    : { drafts: [] as NotebookProblemImportDraft[], usage: null };

  const existingFingerprints = problemExtraction.drafts.length
    ? await loadExistingProblemFingerprints({ prisma: args.prisma, courseId: args.courseId })
    : [];
  const deduped = dedupeDrafts({
    drafts: problemExtraction.drafts,
    existing: existingFingerprints,
    sourceHash,
    sourceTitle: args.sourceTitle,
  });
  const allQuestionUpload =
    sourceKind === 'problem_bank' ||
    classifyAllQuestionUpload({
      text: processedText,
      sourceKind,
      extractedCount: problemExtraction.drafts.length,
    });
  let topic = extractTopic({
    sourceTitle: args.sourceTitle,
    text: processedText,
    artifacts: memoryPlan.artifacts,
    drafts: problemExtraction.drafts,
  });
  let sourcePacket = buildSourcePacket({
    sourceTitle: args.sourceTitle,
    sourceKind,
    sourceFileMime: args.sourceFileMime,
    sourceHash,
    rawFileHash: args.rawFileHash,
    openaiFileId: args.openaiFileId,
    parser: args.parser,
    pageCount: args.pageCount,
    slideCount: args.slideCount,
    courseCode: memoryPlan.courseCode,
    topic,
    text: processedText,
    allQuestionUpload,
    problemExtractionEligible: shouldExtractProblems,
    problemSignalCount: problemSignals,
    usageProfile: args.usageProfile,
    artifacts: memoryPlan.artifacts,
    drafts: problemExtraction.drafts,
  });
  sourcePacket = await synthesizeSourcePacketWithModel({
    model: args.model,
    sourcePacket,
    sourceTitle: args.sourceTitle,
    sourceHash,
    topic,
    text: processedText,
    language: args.language || 'zh-CN',
  });
  topic = sourcePacket.classification.topic || topic;

  let importBatchId: string | null = null;
  let insertedProblemCount = 0;
  if (problemExtraction.drafts.length > 0) {
    const sourceTaggedDrafts = problemExtraction.drafts.map((draft) => ({
      ...draft,
      sourceMeta: {
        ...draft.sourceMeta,
        uploadSourceHash: sourceHash,
        uploadSourceTitle: args.sourceTitle,
      },
    }));
    const importBatch = await createProblemImportBatch({
      prisma: args.prisma,
      userId: args.userId,
      targetType: 'course',
      courseId: args.courseId,
      notebookId: null,
      source: sourceKindForProblemImport(sourceKind),
      sourceText: processedText,
      sourceFileName: args.sourceTitle,
      sourceFileMime: args.sourceFileMime,
      draftSnapshot: sourceTaggedDrafts,
      draftCount: problemExtraction.drafts.length,
      usage: problemExtraction.usage,
      warnings: deduped.duplicates.map((item) => `Skipped duplicate: ${item.title}`),
    });
    importBatchId = importBatch.id;
    if (deduped.uniqueDrafts.length > 0) {
      await createCourseProblemsFromDrafts({
        userId: args.userId,
        courseId: args.courseId,
        drafts: deduped.uniqueDrafts,
        importBatchId,
      });
      insertedProblemCount = deduped.uniqueDrafts.length;
    }
    await markProblemImportBatchCommitted({
      prisma: args.prisma,
      userId: args.userId,
      batchId: importBatch.id,
      committedCount: insertedProblemCount,
    });
  }

  let notebook: SourceUploadIngestionResult['notebook'] = null;
  let notebookCover: SourceUploadNotebookCoverResult | null = null;
  if (!allQuestionUpload) {
    const resolvedNotebook = await resolveNotebookForSource({
      prisma: args.prisma,
      userId: args.userId,
      courseId: args.courseId,
      topic,
      text: processedText,
      targetNotebookId: args.targetNotebookId,
    });
    const packetSections =
      sourcePacket.notebookSections.length > 0
        ? sourcePacket.notebookSections
        : [
            {
              key: 'source-text',
              title: cleanTitle(args.sourceTitle, '上传资料'),
              summary: compact(`上传资料 ${args.sourceTitle}，主题 ${topic}。`, 900),
              markdown: buildSearchableMarkdown({
                sourceTitle: args.sourceTitle,
                sourceKind,
                topic,
                text: processedText,
                courseCode: memoryPlan.courseCode,
                artifacts: memoryPlan.artifacts,
                drafts: problemExtraction.drafts,
                sourceHash,
              }),
              sourceRefs: [],
            },
          ];
    const sections = await appendMarkdownSections({
      prisma: args.prisma,
      courseId: args.courseId,
      notebookId: resolvedNotebook.id,
      sections: packetSections.map((section) => ({
        title: section.title,
        markdown: section.markdown,
        summary: section.summary,
        sourceMeta: {
          sourceTitle: args.sourceTitle,
          sourceKind,
          sourceFileMime: args.sourceFileMime,
          sourceHash,
          rawFileHash: args.rawFileHash ?? null,
          openaiFileId: args.openaiFileId ?? null,
          parser: args.parser ?? null,
          pageCount: args.pageCount ?? null,
          slideCount: args.slideCount ?? null,
          sourcePacketVersion: sourcePacket.version,
          documentType: sourcePacket.classification.documentType,
          usageProfile: sourcePacket.classification.usageProfile,
          usageProfileConfidence: sourcePacket.classification.usageProfileConfidence,
          usageProfileReasons: sourcePacket.classification.usageProfileReasons,
          classificationConfidence: sourcePacket.classification.confidence,
          packetSectionKey: section.key,
          sourceRefs: section.sourceRefs,
          problemDraftCount: problemExtraction.drafts.length,
        },
      })),
    });
    notebook = {
      id: resolvedNotebook.id,
      name: resolvedNotebook.name,
      created: resolvedNotebook.created,
      coverImagePath: null,
      coverStatus: 'skipped',
      sectionId: sections[0]?.id ?? null,
      sectionTitle: sections[0]?.title ?? null,
      sections,
    };
  }

  if (notebook && !allQuestionUpload) {
    const templateTitles = memoryPlan.artifacts
      .filter((artifact) => artifact.staticInjectionCandidate)
      .map((artifact) => artifact.title)
      .slice(0, 8);
    sourcePacket = {
      ...sourcePacket,
      structuredNotes: buildStructuredSourceNotes({
        sourceTitle: args.sourceTitle,
        topic,
        sourcePacket,
        sections: notebook.sections,
        templateTitles,
      }),
    };
  }

  if (notebook && !allQuestionUpload) {
    notebookCover = await generateNotebookCoverForSource({
      prisma: args.prisma,
      userId: args.userId,
      course,
      notebookId: notebook.id,
      sourceTitle: args.sourceTitle,
      sourceHash,
      topic,
      sourcePacket,
    });
    notebook = {
      ...notebook,
      coverImagePath: notebookCover.imagePath,
      coverStatus: notebookCover.status,
    };
  }

  const templateCandidates = memoryPlan.writeCandidates.filter(
    (candidate) => candidate.contentType === 'course_requirement',
  );
  const courseSummaryCandidate =
    notebook && !allQuestionUpload && sourcePacket.classification.usageProfile !== 'daily_use'
      ? buildCourseSummaryCandidate({
          courseId: args.courseId,
          sourceTitle: args.sourceTitle,
          topic,
          sections: notebook.sections,
          sourceKind,
          sourceHash,
          sourcePacket,
          artifacts: memoryPlan.artifacts,
          notebookId: notebook.id,
        })
      : null;
  const notebookSummaryCandidate =
    notebook && !allQuestionUpload
      ? buildNotebookSummaryCandidate({
          notebookId: notebook.id,
          sourceTitle: args.sourceTitle,
          topic,
          sections: notebook.sections,
          sourceKind,
          sourceHash,
          sourcePacket,
          artifacts: memoryPlan.artifacts,
        })
      : null;
  const dailyPrivateCandidate =
    notebook && !allQuestionUpload && sourcePacket.classification.usageProfile === 'daily_use'
      ? buildDailyPrivateSourceCandidate({
          notebookId: notebook.id,
          sourceTitle: args.sourceTitle,
          topic,
          sections: notebook.sections,
          sourceKind,
          sourceHash,
          sourcePacket,
        })
      : null;
  const memoryResults = await routeLayeredMemoryWriteCandidates({
    prisma: args.prisma,
    userId: args.userId,
    candidates: [
      ...templateCandidates,
      ...(courseSummaryCandidate ? [courseSummaryCandidate] : []),
      ...(notebookSummaryCandidate ? [notebookSummaryCandidate] : []),
      ...(dailyPrivateCandidate ? [dailyPrivateCandidate] : []),
    ],
  });

  const graphValue = buildKnowledgeGraphValue({
    courseId: args.courseId,
    courseCode: course.courseCode,
    sourceTitle: args.sourceTitle,
    sourceKind,
    sourceHash,
    sourcePacket,
    topic,
    text: processedText,
    artifacts: memoryPlan.artifacts,
    drafts: problemExtraction.drafts,
    insertedProblemCount,
    duplicateProblemCount: deduped.duplicates.length,
    allQuestionUpload,
    notebookId: notebook?.id,
    sections: notebook?.sections,
    notebookCover,
  });
  const knowledgeGraphFactId = await writeKnowledgeGraphFact({
    prisma: args.prisma,
    userId: args.userId,
    courseId: args.courseId,
    sourceHash,
    value: graphValue,
  });

  await refreshKnowledgeCache({
    prisma: args.prisma,
    ownerId: args.userId,
    target: {
      targetType: 'course',
      targetId: args.courseId,
      courseId: args.courseId,
      notebookId: null,
      targetOwnerId: args.userId,
      accessRole: 'owner',
    },
    query: topic,
    entries: [
      {
        sourceType: notebook?.sectionId ? 'markdown_section' : 'problem_bank',
        sourceId: notebook?.sectionId || `source:${sourceHash}`,
        title: args.sourceTitle,
        previewText: compact(processedText, 1200),
        metadata: {
          sourceHash,
          rawFileHash: args.rawFileHash ?? null,
          openaiFileId: args.openaiFileId ?? null,
          sourceKind,
          documentType: sourcePacket.classification.documentType,
          usageProfile: sourcePacket.classification.usageProfile,
          usageProfileConfidence: sourcePacket.classification.usageProfileConfidence,
          classificationConfidence: sourcePacket.classification.confidence,
          topic,
          notebookId: notebook?.id ?? null,
          coverImagePath: notebookCover?.imagePath ?? null,
          coverStatus: notebookCover?.status ?? null,
          sectionId: notebook?.sectionId ?? null,
          sectionIds: notebook?.sections.map((section) => section.id) ?? [],
        },
        score: 24,
      },
    ],
  });

  const graph = graphValue as { nodes: unknown[]; edges: unknown[] };
  const writtenMemoryCount = memoryResults.filter(
    (result) => result.executed && result.memory,
  ).length;
  const templateCount = memoryResults.filter(
    (result) => result.executed && result.memory?.kind === 'course_template',
  ).length;
  const publicPlatformMemoryCount = memoryResults.filter(
    (result) =>
      result.executed &&
      result.memory?.targetType === 'platform' &&
      result.memory?.scope === 'public',
  ).length;
  const publicCourseMemoryCount = memoryResults.filter(
    (result) =>
      result.executed &&
      result.memory?.targetType === 'course' &&
      result.memory?.scope === 'public',
  ).length;
  const publicNotebookMemoryCount = memoryResults.filter(
    (result) =>
      result.executed &&
      result.memory?.targetType === 'notebook' &&
      result.memory?.scope === 'public',
  ).length;
  const privateMemoryCount = memoryResults.filter(
    (result) => result.executed && result.memory?.scope === 'private',
  ).length;
  const layeredMemoryStatuses = buildLayeredMemoryStatuses({
    usageProfile: sourcePacket.classification.usageProfile,
    notebookSectionCount: notebook?.sections.length ?? 0,
    notebookCover,
    allQuestionUpload,
    publicPlatformMemoryCount,
    publicCourseMemoryCount,
    publicNotebookMemoryCount,
    privateMemoryCount,
    privateUpdatePolicy: sourcePacket.memory?.privateUpdatePolicy,
    knowledgeGraphFactId,
    insertedProblemCount,
    extractedProblemCount: problemExtraction.drafts.length,
    templateCount,
  });

  return {
    source: {
      title: args.sourceTitle,
      kind: sourceKind,
      hash: sourceHash,
      rawFileHash: args.rawFileHash ?? null,
      openaiFileId: args.openaiFileId ?? null,
      parser: args.parser ?? 'text',
      textChars: rawText.length,
      processedChars: processedText.length,
      truncated: processedText.length < rawText.length,
      courseCode: memoryPlan.courseCode,
    },
    classification: {
      documentType: sourcePacket.classification.documentType,
      usageProfile: sourcePacket.classification.usageProfile,
      usageProfileConfidence: sourcePacket.classification.usageProfileConfidence,
      usageProfileReasons: sourcePacket.classification.usageProfileReasons,
      allQuestionUpload,
      problemSignalCount: problemSignals,
      templateSignalCount: templateSignalCount(processedText, memoryPlan.artifacts),
      topic,
      confidence: sourcePacket.classification.confidence,
      reasons: sourcePacket.classification.reasons,
    },
    knowledgeGraph: {
      factId: knowledgeGraphFactId,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
    },
    problems: {
      extractedCount: problemExtraction.drafts.length,
      insertedCount: insertedProblemCount,
      duplicateCount: deduped.duplicates.length,
      skippedAsDuplicate: deduped.duplicates,
      importBatchId,
      usage: problemExtraction.usage,
    },
    memory: {
      writtenCount: writtenMemoryCount,
      templateCount,
      publicPlatformMemoryCount,
      publicCourseMemoryCount,
      publicNotebookMemoryCount,
      privateMemoryCount,
      skippedPublicNotebookMemory: allQuestionUpload,
      layers: layeredMemoryStatuses,
    },
    notebook,
    notebookCover,
    tokenPolicy: memoryPlan.tokenPolicy,
  };
}
