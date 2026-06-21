import { createHash } from 'node:crypto';
import type { LanguageModel } from 'ai';
import type { PrismaClient } from '@/lib/server/generated-prisma';
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
import { refreshKnowledgeCache } from '@/features/memory/server/knowledge-cache';
import { routeLayeredMemoryWriteCandidates } from '@/features/memory/server/write-routing';
import type { MemoryWriteCandidate } from '@/lib/server/memory-write-router';

export type SourceUploadKind =
  | 'pdf'
  | 'markdown'
  | 'plain_text'
  | 'pptx'
  | 'problem_bank'
  | 'other';

export type SourceUploadIngestionResult = {
  source: {
    title: string;
    kind: SourceUploadKind;
    hash: string;
    textChars: number;
    processedChars: number;
    truncated: boolean;
    courseCode: string | null;
  };
  classification: {
    allQuestionUpload: boolean;
    problemSignalCount: number;
    templateSignalCount: number;
    topic: string;
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
    publicNotebookMemoryCount: number;
    skippedPublicNotebookMemory: boolean;
  };
  notebook: {
    id: string;
    name: string;
    created: boolean;
    sectionId: string | null;
    sectionTitle: string | null;
  } | null;
  tokenPolicy: string[];
};

type ExistingProblemFingerprint = {
  id: string;
  title: string;
  fingerprint: string;
};

type IngestCourseSourceUploadArgs = {
  prisma: PrismaClient;
  userId: string;
  courseId: string;
  sourceTitle: string;
  sourceKind?: SourceUploadKind;
  sourceFileMime?: string | null;
  text: string;
  targetNotebookId?: string | null;
  language?: 'zh-CN' | 'en-US';
  model?: LanguageModel;
};

const MAX_SOURCE_TEXT_CHARS = 180_000;
const MAX_PROBLEM_EXTRACTION_CHARS = 70_000;
const MAX_MARKDOWN_SECTION_CHARS = 220_000;
const KNOWLEDGE_GRAPH_MAX_CONCEPTS = 32;

function compact(input: string | null | undefined, maxChars: number): string {
  const text = String(input || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trim()}...`;
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function normalizeSpaces(input: string): string {
  return input.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
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
  const patterns = [
    /^\s*(?:problem|question|exercise|q)\s*\d+[\).:\s]/gim,
    /^\s*\d{1,3}[\).]\s+\S/gm,
    /^\s*[（(]?\d{1,3}[）)]\s+\S/gm,
    /(?:选择题|简答题|证明题|计算题|编程题|题目|练习)\s*\d*/g,
    /\b(?:prove|calculate|solve|show that|write a function|implement|what is)\b/gi,
    /\bdef\s+[A-Za-z_]\w*\s*\(/g,
  ];
  return patterns.reduce((count, pattern) => count + Array.from(text.matchAll(pattern)).length, 0);
}

function templateSignalCount(text: string, artifacts: SourceMemoryArtifact[]): number {
  const textSignals = [
    /@template-origin|@signature|@htdf|@htdd|check-expect/gi,
    /\bdocstring\b|\bdoctest\b|starter code/gi,
    /representation invariants?|\bRI\b|instance attributes/gi,
  ].reduce((count, pattern) => count + Array.from(text.matchAll(pattern)).length, 0);
  return textSignals + artifacts.filter((artifact) => artifact.staticInjectionCandidate).length;
}

function looksWorthProblemExtraction(text: string): boolean {
  if (problemSignalCount(text) >= 2) return true;
  return /答案|answer|points?|marks?|rubric|multiple choice|选择|填空|证明|计算|public tests|secret tests/i.test(
    text,
  );
}

function classifyAllQuestionUpload(args: {
  text: string;
  sourceKind: SourceUploadKind;
  extractedCount: number;
  problemSignals: number;
}): boolean {
  if (args.extractedCount === 0) return false;
  if (args.sourceKind === 'problem_bank') return true;

  const blocks = args.text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length >= 12);
  const blockCount = Math.max(blocks.length, 1);
  const problemLikeBlocks = blocks.filter(
    (block) =>
      /^\s*(?:problem|question|exercise|q)\s*\d+[\).:\s]/i.test(block) ||
      /^\s*\d{1,3}[\).]\s+\S/.test(block) ||
      /^(?:选择题|简答题|证明题|计算题|编程题|题目|练习)/.test(block) ||
      /\b(?:prove|calculate|solve|show that|write a function|implement)\b/i.test(block),
  ).length;
  const problemDensity = problemLikeBlocks / blockCount;
  return (
    args.extractedCount >= 3 &&
    (problemDensity >= 0.45 || args.problemSignals >= Math.max(6, Math.floor(blockCount * 0.7)))
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
    (artifact) => artifact.artifactKind !== 'knowledge_source',
  )?.title;
  const draftTag = args.drafts.flatMap((draft) => draft.tags)[0];
  return cleanTitle(heading || artifactTitle || draftTag || args.sourceTitle);
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

async function appendMarkdownSection(args: {
  prisma: PrismaClient;
  courseId: string;
  notebookId: string;
  sourceTitle: string;
  markdown: string;
  summary: string;
  sourceMeta: unknown;
}): Promise<{ id: string; title: string }> {
  const maxOrder = await args.prisma.markdownNotebookSection.aggregate({
    where: { notebookId: args.notebookId },
    _max: { order: true },
  });
  const order = (maxOrder._max.order ?? -1) + 1;
  const section = await args.prisma.markdownNotebookSection.create({
    data: {
      notebookId: args.notebookId,
      courseId: args.courseId,
      title: cleanTitle(args.sourceTitle, '上传资料'),
      order,
      markdown: args.markdown,
      summary: args.summary,
      sourceMeta: toPrismaNullableJson(args.sourceMeta),
    },
    select: { id: true, title: true },
  });
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
  return section;
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
        dedupeFingerprint: fingerprint,
      },
    });
  }

  return { uniqueDrafts, duplicates };
}

function buildNotebookSummaryCandidate(args: {
  notebookId: string;
  sourceTitle: string;
  topic: string;
  sectionId: string | null;
  sourceKind: SourceUploadKind;
  sourceHash: string;
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
      sectionId: args.sectionId,
    },
    studyMemory: {
      targetType: 'notebook',
      targetId: args.notebookId,
      scope: 'public',
      kind: 'source_summary',
      title: `资料索引：${cleanTitle(args.sourceTitle)}`,
      text: [
        `本笔记本新增资料《${args.sourceTitle}》，主题为「${args.topic}」。`,
        args.sectionId
          ? `可查询纯文本已写入 Markdown section：${args.sectionId}。`
          : '可查询纯文本已写入本笔记本。',
        templateTitles.length
          ? `同时识别到课程模板/要求：${templateTitles.join('；')}。`
          : '本条公共记忆只记录资料入口和检索边界；原文内容保留在笔记本纯文本与知识索引中。',
      ].join('\n'),
      reason: '上传资料不是全题目文件，需要给笔记本聊天和后续生成提供一个稳定的公共检索入口。',
      sourceReferences: [
        {
          order: 1,
          title: args.sourceTitle,
          why: 'Uploaded source organized into searchable text notebook content.',
          sourceKind: args.sourceKind,
          sourceHash: args.sourceHash,
          sectionId: args.sectionId,
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
  const artifactTags = args.artifacts.flatMap((artifact) => artifact.tags);
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

function buildKnowledgeGraphValue(args: {
  courseId: string;
  courseCode: string | null;
  sourceTitle: string;
  sourceKind: SourceUploadKind;
  sourceHash: string;
  topic: string;
  text: string;
  artifacts: SourceMemoryArtifact[];
  drafts: NotebookProblemImportDraft[];
  insertedProblemCount: number;
  duplicateProblemCount: number;
  allQuestionUpload: boolean;
  notebookId?: string | null;
  sectionId?: string | null;
}) {
  const concepts = conceptCandidates(args);
  const sourceNodeId = `source:${args.sourceHash.slice(0, 16)}`;
  const topicNodeId = `topic:${sha256(args.topic).slice(0, 16)}`;
  const nodes = [
    { id: sourceNodeId, label: args.sourceTitle, type: 'source', weight: 1 },
    { id: topicNodeId, label: args.topic, type: 'topic', weight: 1 },
    ...concepts.map((concept) => ({
      id: `concept:${sha256(concept).slice(0, 16)}`,
      label: concept,
      type: 'concept',
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
    ...concepts.map((concept) => ({
      from: topicNodeId,
      to: `concept:${sha256(concept).slice(0, 16)}`,
      kind: 'includes',
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
    },
    topic: args.topic,
    allQuestionUpload: args.allQuestionUpload,
    notebookId: args.notebookId ?? null,
    sectionId: args.sectionId ?? null,
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
  const sourceHash = sha256([args.sourceTitle, sourceKind, processedText].join('\n\n'));
  const memoryPlan = planSourceMemoryIngestion({
    targetType: 'course',
    targetId: args.courseId,
    courseCode: course.courseCode || undefined,
    sourceTitle: args.sourceTitle,
    sourceKind: sourceKindForMemory(sourceKind),
    text: processedText,
    audience: 'creator',
  });

  await ensureLegacyProblemsBackfilledForCourse(args.userId, args.courseId);

  const shouldExtractProblems = looksWorthProblemExtraction(processedText);
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
  });
  const problemSignals = problemSignalCount(processedText);
  const allQuestionUpload = classifyAllQuestionUpload({
    text: processedText,
    sourceKind,
    extractedCount: problemExtraction.drafts.length,
    problemSignals,
  });
  const topic = extractTopic({
    sourceTitle: args.sourceTitle,
    text: processedText,
    artifacts: memoryPlan.artifacts,
    drafts: problemExtraction.drafts,
  });

  let importBatchId: string | null = null;
  let insertedProblemCount = 0;
  if (problemExtraction.drafts.length > 0) {
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
      draftSnapshot: problemExtraction.drafts,
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
  if (!allQuestionUpload) {
    const resolvedNotebook = await resolveNotebookForSource({
      prisma: args.prisma,
      userId: args.userId,
      courseId: args.courseId,
      topic,
      text: processedText,
      targetNotebookId: args.targetNotebookId,
    });
    const markdown = buildSearchableMarkdown({
      sourceTitle: args.sourceTitle,
      sourceKind,
      topic,
      text: processedText,
      courseCode: memoryPlan.courseCode,
      artifacts: memoryPlan.artifacts,
      drafts: problemExtraction.drafts,
      sourceHash,
    });
    const section = await appendMarkdownSection({
      prisma: args.prisma,
      courseId: args.courseId,
      notebookId: resolvedNotebook.id,
      sourceTitle: args.sourceTitle,
      markdown,
      summary: compact(`上传资料 ${args.sourceTitle}，主题 ${topic}。`, 900),
      sourceMeta: {
        sourceTitle: args.sourceTitle,
        sourceKind,
        sourceFileMime: args.sourceFileMime,
        sourceHash,
        problemDraftCount: problemExtraction.drafts.length,
      },
    });
    notebook = {
      id: resolvedNotebook.id,
      name: resolvedNotebook.name,
      created: resolvedNotebook.created,
      sectionId: section.id,
      sectionTitle: section.title,
    };
  }

  const templateCandidates = memoryPlan.writeCandidates.filter(
    (candidate) => candidate.contentType === 'course_requirement',
  );
  const notebookSummaryCandidate =
    notebook && !allQuestionUpload
      ? buildNotebookSummaryCandidate({
          notebookId: notebook.id,
          sourceTitle: args.sourceTitle,
          topic,
          sectionId: notebook.sectionId,
          sourceKind,
          sourceHash,
          artifacts: memoryPlan.artifacts,
        })
      : null;
  const memoryResults = await routeLayeredMemoryWriteCandidates({
    prisma: args.prisma,
    userId: args.userId,
    candidates: [
      ...templateCandidates,
      ...(notebookSummaryCandidate ? [notebookSummaryCandidate] : []),
    ],
  });

  const graphValue = buildKnowledgeGraphValue({
    courseId: args.courseId,
    courseCode: course.courseCode,
    sourceTitle: args.sourceTitle,
    sourceKind,
    sourceHash,
    topic,
    text: processedText,
    artifacts: memoryPlan.artifacts,
    drafts: problemExtraction.drafts,
    insertedProblemCount,
    duplicateProblemCount: deduped.duplicates.length,
    allQuestionUpload,
    notebookId: notebook?.id,
    sectionId: notebook?.sectionId,
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
          sourceKind,
          topic,
          notebookId: notebook?.id ?? null,
          sectionId: notebook?.sectionId ?? null,
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
  const publicNotebookMemoryCount = memoryResults.filter(
    (result) => result.executed && result.memory?.targetType === 'notebook',
  ).length;

  return {
    source: {
      title: args.sourceTitle,
      kind: sourceKind,
      hash: sourceHash,
      textChars: rawText.length,
      processedChars: processedText.length,
      truncated: processedText.length < rawText.length,
      courseCode: memoryPlan.courseCode,
    },
    classification: {
      allQuestionUpload,
      problemSignalCount: problemSignals,
      templateSignalCount: templateSignalCount(processedText, memoryPlan.artifacts),
      topic,
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
      publicNotebookMemoryCount,
      skippedPublicNotebookMemory: allQuestionUpload,
    },
    notebook,
    tokenPolicy: memoryPlan.tokenPolicy,
  };
}
