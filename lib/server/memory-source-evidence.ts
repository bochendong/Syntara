import type { PrismaClient } from '@/lib/server/generated-prisma';
import type { MemorySearchProgressFilter } from '@/lib/server/memory-search-intent';

export type MemoryEvidenceSourceType =
  | 'markdown_section'
  | 'problem'
  | 'student_message'
  | 'problem_attempt';

export type MemoryEvidencePacket = {
  id: string;
  sourceType: MemoryEvidenceSourceType;
  title: string;
  originalText: string;
  renderedText: string;
  score: number;
  courseId: string | null;
  notebookId: string | null;
  sourceId: string;
  metadata: Record<string, unknown>;
};

type MarkdownSectionRow = {
  id: string;
  courseId: string | null;
  notebookId: string;
  notebookName: string | null;
  title: string;
  order: number;
  markdown: string;
  summary: string | null;
  updatedAt: Date | string;
};

type ProblemEvidenceRow = {
  id: string;
  courseId: string | null;
  notebookId: string | null;
  notebookName: string | null;
  title: string;
  type: string;
  status: string;
  tags: string[];
  difficulty: string;
  publicText: string;
  gradingText: string;
  attemptStatus: string | null;
  attemptScore: number | null;
  attemptedCount: number | bigint | null;
  passedCount: number | bigint | null;
  lastAttemptAt: Date | string | null;
  latestAnswerText: string | null;
  latestResultText: string | null;
  updatedAt: Date | string;
};

type StudentMessageRow = {
  id: string;
  conversationId: string;
  conversationTitle: string | null;
  courseId: string | null;
  notebookId: string | null;
  notebookName: string | null;
  role: string;
  plainText: string;
  createdAt: Date | string;
};

function normalize(input: string): string {
  return input.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function queryTerms(query: string): string[] {
  const normalized = normalize(query);
  const latin = normalized.match(/[a-z0-9_+\-]{2,}/g) || [];
  const singleMathVariables = (normalized.match(/\b[uvxytn]\b/g) || []).filter(Boolean);
  const han = normalized.match(/[\u3400-\u9fff]{2,}/g) || [];
  const segmentedHan: string[] = [];
  const segmenter =
    typeof Intl !== 'undefined' && 'Segmenter' in Intl
      ? new Intl.Segmenter('zh', { granularity: 'word' })
      : null;
  if (segmenter) {
    for (const segment of segmenter.segment(normalized)) {
      const text = segment.segment.trim();
      if (!text) continue;
      if (/^[\u3400-\u9fff]$/u.test(text)) {
        const start = Math.max(0, segment.index - 4);
        const end = Math.min(normalized.length, segment.index + text.length + 4);
        const nearby = normalized.slice(start, end);
        if (/\b[uvxytn]\b/u.test(nearby)) segmentedHan.push(text);
        continue;
      }
      if (!segment.isWordLike) continue;
      if (/^[a-z0-9_+\-]{2,}$/u.test(text)) {
        segmentedHan.push(text);
        continue;
      }
      if (/^[\u3400-\u9fff]{2,}$/u.test(text)) {
        segmentedHan.push(text);
      }
    }
  }
  const compactHan = han.flatMap((term) => {
    if (segmenter) return [term];
    if (term.length <= 4) return [term];
    const windows: string[] = [];
    for (const size of [2, 3, 4]) {
      for (let i = 0; i <= term.length - size; i += 1) {
        windows.push(term.slice(i, i + size));
      }
    }
    return [term, ...windows];
  });
  return unique([...latin, ...singleMathVariables, ...compactHan, ...segmentedHan]).slice(0, 48);
}

function compact(input: string | null | undefined, maxChars: number): string {
  const text = String(input || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}

function jsonFromText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function stringifyJson(value: unknown, maxChars = 1400): string {
  if (value == null) return '';
  if (typeof value === 'string') return compact(value, maxChars);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return compact(JSON.stringify(value, null, 2), maxChars);
  } catch {
    return compact(String(value), maxChars);
  }
}

function stringField(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function includesTerm(text: string, term: string): boolean {
  if (/^[uvxytn]$/u.test(term)) {
    return new RegExp(`(^|[^a-z0-9])${term}([^a-z0-9]|$)`, 'u').test(text);
  }
  return text.includes(term);
}

function scoreText(args: {
  terms: string[];
  title: string;
  primaryText: string;
  secondaryText?: string | null;
  notebookName?: string | null;
  tags?: string[];
  progressBoost?: number;
}): number {
  const title = normalize(args.title);
  const primary = normalize(args.primaryText);
  const secondary = normalize(args.secondaryText || '');
  const notebookName = normalize(args.notebookName || '');
  const tags = (args.tags || []).map(normalize);
  let score = args.progressBoost || 0;

  for (const term of args.terms) {
    if (tags.some((tag) => tag === term || includesTerm(tag, term) || term.includes(tag))) {
      score += 14;
    }
    if (includesTerm(title, term)) score += 12;
    if (includesTerm(notebookName, term)) score += 5;
    if (includesTerm(primary, term)) score += 5;
    if (includesTerm(secondary, term)) score += 2;
  }

  if (args.terms.length > 0 && score <= (args.progressBoost || 0)) return 0;
  return score;
}

function specificAnchorTerms(terms: string[]): string[] {
  return terms.filter((term) => {
    if (/[\u3400-\u9fff]/.test(term)) return term.length >= 3;
    return term.length >= 4;
  });
}

function containsSpecificAnchor(anchors: string[], ...texts: Array<string | null | undefined>) {
  if (anchors.length === 0) return false;
  const haystack = normalize(texts.filter(Boolean).join('\n'));
  return anchors.some((anchor) => haystack.includes(anchor));
}

function attemptedCount(row: Pick<ProblemEvidenceRow, 'attemptedCount'>): number {
  return Number(row.attemptedCount ?? 0);
}

function matchesProgressFilter(
  row: Pick<ProblemEvidenceRow, 'attemptedCount' | 'attemptStatus'>,
  progressFilter?: MemorySearchProgressFilter | null,
): boolean {
  if (!progressFilter) return true;
  if (progressFilter === 'unattempted') return attemptedCount(row) === 0;
  if (progressFilter === 'attempted') return attemptedCount(row) > 0;
  return row.attemptStatus === 'failed' || row.attemptStatus === 'partial';
}

function progressBoost(
  row: Pick<ProblemEvidenceRow, 'attemptedCount' | 'attemptStatus'>,
  progressFilter?: MemorySearchProgressFilter | null,
): number {
  if (!progressFilter) return 0;
  if (progressFilter === 'unattempted') return attemptedCount(row) === 0 ? 14 : 0;
  if (progressFilter === 'attempted') return attemptedCount(row) > 0 ? 9 : 0;
  if (row.attemptStatus === 'failed') return 14;
  if (row.attemptStatus === 'partial') return 10;
  return 0;
}

function renderProblemPublicContent(rawText: string): string {
  const parsed = jsonFromText(rawText);
  if (!parsed || typeof parsed !== 'object') return compact(String(parsed || rawText), 6000);
  const content = parsed as Record<string, unknown>;
  const lines: string[] = [];
  const stem = stringField(content, ['stem', 'stemTemplate', 'statement', 'question', 'prompt']);
  if (stem) lines.push(`题干：\n${stem}`);

  if (content.type === 'choice' && Array.isArray(content.options)) {
    const options = content.options
      .map((option) => {
        if (!option || typeof option !== 'object') return '';
        const raw = option as Record<string, unknown>;
        const id = typeof raw.id === 'string' ? raw.id.trim() : '';
        const label = typeof raw.label === 'string' ? raw.label.trim() : '';
        return label ? `${id ? `${id}. ` : ''}${label}` : '';
      })
      .filter(Boolean);
    if (options.length > 0) {
      const mode = content.selectionMode === 'multiple' ? '多选' : '单选';
      lines.push(`选择方式：${mode}`);
      lines.push(`选项：\n${options.join('\n')}`);
    }
  }

  if (content.type === 'fill_blank' && Array.isArray(content.blanks)) {
    const blanks = content.blanks
      .map((blank) => {
        if (!blank || typeof blank !== 'object') return '';
        const raw = blank as Record<string, unknown>;
        const id = typeof raw.id === 'string' ? raw.id.trim() : '';
        const placeholder = typeof raw.placeholder === 'string' ? raw.placeholder.trim() : '';
        return [id, placeholder ? `(${placeholder})` : ''].filter(Boolean).join(' ');
      })
      .filter(Boolean);
    if (blanks.length > 0) lines.push(`空格：${blanks.join('、')}`);
  }

  if (content.type === 'calculation' && typeof content.unit === 'string' && content.unit.trim()) {
    lines.push(`单位：${content.unit.trim()}`);
  }

  if (content.type === 'code') {
    const functionSignature = stringField(content, ['functionSignature']);
    if (functionSignature) lines.push(`函数签名：${functionSignature}`);
    if (Array.isArray(content.constraints) && content.constraints.length > 0) {
      lines.push(`约束：\n${content.constraints.map((item) => String(item)).join('\n')}`);
    }
    if (Array.isArray(content.sampleIO) && content.sampleIO.length > 0) {
      const samples = content.sampleIO
        .map((sample, index) => {
          if (!sample || typeof sample !== 'object') return '';
          const raw = sample as Record<string, unknown>;
          const input = stringifyJson(raw.input, 600);
          const output = stringifyJson(raw.output, 600);
          const explanation =
            typeof raw.explanation === 'string' && raw.explanation.trim()
              ? `\n说明：${raw.explanation.trim()}`
              : '';
          return `样例 ${index + 1}\n输入：${input}\n输出：${output}${explanation}`;
        })
        .filter(Boolean);
      if (samples.length > 0) lines.push(`样例：\n${samples.join('\n\n')}`);
    }
    const starterCode = stringField(content, ['starterCode']);
    if (starterCode) lines.push(`起始代码：\n${compact(starterCode, 2400)}`);
  }

  if (content.assets && typeof content.assets === 'object') {
    const assets = content.assets as Record<string, unknown>;
    if (Array.isArray(assets.images) && assets.images.length > 0) {
      const images = assets.images
        .map((image, index) => {
          if (!image || typeof image !== 'object') return '';
          const raw = image as Record<string, unknown>;
          const alt = typeof raw.alt === 'string' ? raw.alt.trim() : '';
          const caption = typeof raw.caption === 'string' ? raw.caption.trim() : '';
          const page = Number(raw.pageNumber);
          return [`图像 ${index + 1}`, Number.isFinite(page) ? `页 ${page}` : '', alt, caption]
            .filter(Boolean)
            .join(' / ');
        })
        .filter(Boolean);
      if (images.length > 0) lines.push(`图像：\n${images.join('\n')}`);
    }
  }

  const explanation = stringField(content, ['explanation']);
  if (explanation) lines.push(`公开说明：\n${explanation}`);

  return compact(lines.join('\n\n') || stringifyJson(content, 6000), 6000);
}

function renderAnswerJson(rawText: string | null): string {
  if (!rawText) return '';
  const parsed = jsonFromText(rawText);
  if (!parsed || typeof parsed !== 'object') return stringifyJson(parsed, 1200);
  const answer = parsed as Record<string, unknown>;
  const lines: string[] = [];
  const text = stringField(answer, ['text', 'answer', 'content']);
  if (text) lines.push(text);
  if (Array.isArray(answer.selectedOptionIds) && answer.selectedOptionIds.length > 0) {
    lines.push(`选择：${answer.selectedOptionIds.map((item) => String(item)).join('、')}`);
  }
  return compact(lines.join('\n') || stringifyJson(answer, 1200), 1200);
}

function renderResultJson(rawText: string | null): string {
  if (!rawText) return '';
  const parsed = jsonFromText(rawText);
  if (!parsed || typeof parsed !== 'object') return stringifyJson(parsed, 1200);
  const result = parsed as Record<string, unknown>;
  const lines: string[] = [];
  for (const key of ['feedback', 'message', 'analysis', 'explanation', 'reason']) {
    const value = result[key];
    if (typeof value === 'string' && value.trim()) lines.push(value.trim());
  }
  return compact(lines.join('\n') || stringifyJson(result, 1200), 1200);
}

function metadataDate(value: Date | string | null): string | null {
  return value ? new Date(value).toISOString() : null;
}

function dedupeEvidence(packets: MemoryEvidencePacket[]): MemoryEvidencePacket[] {
  const seen = new Set<string>();
  const result: MemoryEvidencePacket[] = [];
  for (const packet of packets) {
    const key = `${packet.sourceType}:${packet.sourceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(packet);
  }
  return result;
}

export async function searchMarkdownSourceEvidence(args: {
  prisma: PrismaClient;
  query: string;
  notebookId?: string | null;
  courseId?: string | null;
  limit?: number;
}): Promise<MemoryEvidencePacket[]> {
  const terms = queryTerms(args.query);
  if (terms.length === 0 || (!args.notebookId && !args.courseId)) return [];

  const rows = await args.prisma.$queryRawUnsafe<MarkdownSectionRow[]>(
    `
      SELECT
        s."id",
        s."courseId",
        s."notebookId",
        n."name" AS "notebookName",
        s."title",
        s."order",
        s."markdown",
        s."summary",
        s."updatedAt"
      FROM "MarkdownNotebookSection" s
      INNER JOIN "Notebook" n ON n."id" = s."notebookId"
      WHERE
        ($1::text IS NOT NULL AND s."notebookId" = $1)
        OR ($2::text IS NOT NULL AND (s."courseId" = $2 OR n."courseId" = $2))
      ORDER BY s."order" ASC, s."updatedAt" DESC
      LIMIT 500
    `,
    args.notebookId || null,
    args.courseId || null,
  );

  const limit = Math.max(1, Math.min(args.limit ?? 5, 16));
  const anchors = specificAnchorTerms(terms);
  const scored = rows
    .map((row, index) => {
      const sameNotebook = Boolean(args.notebookId && row.notebookId === args.notebookId);
      return {
        row,
        index,
        sameNotebook,
        score:
          scoreText({
            terms,
            title: row.title,
            primaryText: row.markdown,
            secondaryText: row.summary,
            notebookName: row.notebookName,
          }) + (sameNotebook ? 60 : 0),
      };
    })
    .filter((item) => item.score > 0);
  const anchored = scored.filter((item) =>
    containsSpecificAnchor(
      anchors,
      item.row.title,
      item.row.summary,
      item.row.markdown,
      item.row.notebookName,
    ),
  );
  return (anchored.length > 0 ? anchored : scored)
    .sort((a, b) => {
      if (a.sameNotebook && b.sameNotebook && Math.abs(a.score - b.score) <= 15) {
        return a.row.order - b.row.order || b.score - a.score || a.index - b.index;
      }
      return (
        b.score - a.score ||
        Number(b.sameNotebook) - Number(a.sameNotebook) ||
        a.row.order - b.row.order ||
        a.index - b.index
      );
    })
    .slice(0, limit)
    .map(({ row, score }) => ({
      id: `markdown_section:${row.id}`,
      sourceType: 'markdown_section',
      title: row.title,
      originalText: compact(row.markdown, 7000),
      renderedText: compact(row.markdown, 7000),
      score,
      courseId: row.courseId,
      notebookId: row.notebookId,
      sourceId: row.id,
      metadata: {
        notebookName: row.notebookName,
        order: row.order,
        summary: row.summary,
        updatedAt: metadataDate(row.updatedAt),
      },
    }));
}

export async function searchProblemSourceEvidence(args: {
  prisma: PrismaClient;
  query: string;
  notebookId?: string | null;
  courseId?: string | null;
  viewerUserId?: string | null;
  progressFilter?: MemorySearchProgressFilter | null;
  limit?: number;
}): Promise<MemoryEvidencePacket[]> {
  const terms = queryTerms(args.query);
  if ((terms.length === 0 && !args.progressFilter) || (!args.notebookId && !args.courseId)) {
    return [];
  }

  const rows = await args.prisma.$queryRawUnsafe<ProblemEvidenceRow[]>(
    `
      SELECT
        p."id",
        p."courseId",
        p."notebookId",
        n."name" AS "notebookName",
        p."title",
        p."type"::text AS "type",
        p."status"::text AS "status",
        p."tags",
        p."difficulty"::text AS "difficulty",
        p."publicContentJson"::text AS "publicText",
        p."gradingJson"::text AS "gradingText",
        progress."status"::text AS "attemptStatus",
        progress."score" AS "attemptScore",
        COALESCE(progress."attemptedCount", 0)::int AS "attemptedCount",
        COALESCE(progress."passedCount", 0)::int AS "passedCount",
        progress."lastAttemptAt" AS "lastAttemptAt",
        latest."answerJson"::text AS "latestAnswerText",
        latest."resultJson"::text AS "latestResultText",
        p."updatedAt"
      FROM "NotebookProblem" p
      LEFT JOIN "Notebook" n ON n."id" = p."notebookId"
      LEFT JOIN "NotebookProblemProgress" progress
        ON progress."problemId" = p."id"
        AND ($3::text IS NOT NULL AND progress."userId" = $3)
      LEFT JOIN "NotebookProblemAttempt" latest
        ON latest."id" = progress."latestAttemptId"
      WHERE p."status" <> 'archived'
        AND (
          ($1::text IS NOT NULL AND p."notebookId" = $1)
          OR ($2::text IS NOT NULL AND (p."courseId" = $2 OR n."courseId" = $2))
        )
        AND (
          $4::text IS NULL
          OR ($4::text = 'unattempted' AND COALESCE(progress."attemptedCount", 0) = 0)
          OR ($4::text = 'attempted' AND COALESCE(progress."attemptedCount", 0) > 0)
          OR ($4::text = 'wrong_or_partial' AND progress."status"::text IN ('failed', 'partial'))
        )
      ORDER BY COALESCE(progress."lastAttemptAt", p."updatedAt") DESC, p."updatedAt" DESC
      LIMIT 500
    `,
    args.notebookId || null,
    args.courseId || null,
    args.viewerUserId || null,
    args.progressFilter || null,
  );

  const limit = Math.max(1, Math.min(args.limit ?? 5, 16));
  const anchors = specificAnchorTerms(terms);
  const scored = rows
    .map((row, index) => {
      const renderedProblem = renderProblemPublicContent(row.publicText);
      const sameNotebook = Boolean(args.notebookId && row.notebookId === args.notebookId);
      return {
        row,
        index,
        renderedProblem,
        score:
          scoreText({
            terms,
            title: row.title,
            primaryText: renderedProblem,
            secondaryText: row.gradingText,
            notebookName: row.notebookName,
            tags: row.tags,
            progressBoost: progressBoost(row, args.progressFilter),
          }) + (sameNotebook ? 40 : 0),
      };
    })
    .filter((item) => item.score > 0 && matchesProgressFilter(item.row, args.progressFilter));
  const anchored = scored.filter((item) =>
    containsSpecificAnchor(
      anchors,
      item.row.title,
      item.row.notebookName,
      item.row.tags.join('\n'),
      item.renderedProblem,
    ),
  );
  return (anchored.length > 0 ? anchored : scored)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ row, score, renderedProblem }) => ({
      id: `problem:${row.id}`,
      sourceType: 'problem',
      title: row.title,
      originalText: renderedProblem,
      renderedText: renderedProblem,
      score,
      courseId: row.courseId,
      notebookId: row.notebookId,
      sourceId: row.id,
      metadata: {
        notebookName: row.notebookName,
        problemType: row.type,
        status: row.status,
        tags: row.tags,
        difficulty: row.difficulty,
        attemptStatus: row.attemptStatus,
        attemptScore: row.attemptScore,
        attemptedCount: attemptedCount(row),
        passedCount: Number(row.passedCount ?? 0),
        lastAttemptAt: metadataDate(row.lastAttemptAt),
        latestAnswerText: row.latestAnswerText,
        latestResultText: row.latestResultText,
        updatedAt: metadataDate(row.updatedAt),
      },
    }));
}

export async function searchStudentMessageEvidence(args: {
  prisma: PrismaClient;
  query: string;
  userId: string;
  notebookId?: string | null;
  courseId?: string | null;
  limit?: number;
}): Promise<MemoryEvidencePacket[]> {
  const terms = queryTerms(args.query);
  if (terms.length === 0 || (!args.notebookId && !args.courseId)) return [];

  const rows = await args.prisma.$queryRawUnsafe<StudentMessageRow[]>(
    `
      SELECT
        m."id",
        m."conversationId",
        c."title" AS "conversationTitle",
        c."courseId",
        c."notebookId",
        n."name" AS "notebookName",
        m."role",
        m."plainText",
        m."createdAt"
      FROM "Message" m
      INNER JOIN "Conversation" c ON c."id" = m."conversationId"
      LEFT JOIN "Notebook" n ON n."id" = c."notebookId"
      WHERE m."ownerId" = $1
        AND m."role" IN ('user', 'assistant')
        AND m."plainText" IS NOT NULL
        AND length(trim(m."plainText")) > 0
        AND (
          ($2::text IS NOT NULL AND c."notebookId" = $2)
          OR ($3::text IS NOT NULL AND (c."courseId" = $3 OR n."courseId" = $3))
        )
      ORDER BY m."createdAt" DESC
      LIMIT 300
    `,
    args.userId,
    args.notebookId || null,
    args.courseId || null,
  );

  const limit = Math.max(1, Math.min(args.limit ?? 5, 16));
  const anchors = specificAnchorTerms(terms);
  const scored = rows
    .map((row, index) => ({
      row,
      index,
      score: scoreText({
        terms,
        title: row.conversationTitle || row.notebookName || '学生提问',
        primaryText: row.plainText,
        notebookName: row.notebookName,
      }),
    }))
    .filter((item) => item.score > 0);
  const anchored = scored.filter((item) =>
    containsSpecificAnchor(
      anchors,
      item.row.plainText,
      item.row.conversationTitle,
      item.row.notebookName,
    ),
  );
  return (anchored.length > 0 ? anchored : scored)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ row, score }) => {
      const roleLabel = row.role === 'assistant' ? '助手回复' : '学生消息';
      const renderedText = `${roleLabel}: ${compact(row.plainText, 1800)}`;
      return {
        id: `student_message:${row.id}`,
        sourceType: 'student_message',
        title: `${row.conversationTitle || row.notebookName || '历史对话'} · ${roleLabel}`,
        originalText: compact(row.plainText, 1800),
        renderedText,
        score,
        courseId: row.courseId,
        notebookId: row.notebookId,
        sourceId: row.id,
        metadata: {
          conversationId: row.conversationId,
          conversationTitle: row.conversationTitle,
          notebookName: row.notebookName,
          role: row.role,
          createdAt: metadataDate(row.createdAt),
        },
      };
    });
}

export async function searchProblemAttemptEvidence(args: {
  prisma: PrismaClient;
  query: string;
  userId: string;
  notebookId?: string | null;
  courseId?: string | null;
  progressFilter?: MemorySearchProgressFilter | null;
  limit?: number;
}): Promise<MemoryEvidencePacket[]> {
  const baseMatches = await searchProblemSourceEvidence({
    prisma: args.prisma,
    query: args.query,
    notebookId: args.notebookId,
    courseId: args.courseId,
    viewerUserId: args.userId,
    progressFilter: args.progressFilter || 'attempted',
    limit: Math.max(args.limit ?? 5, 8),
  });

  return baseMatches
    .filter((packet) => Number(packet.metadata.attemptedCount || 0) > 0)
    .slice(0, Math.max(1, Math.min(args.limit ?? 5, 16)))
    .map((packet) => {
      const answer = renderAnswerJson(
        typeof packet.metadata.latestAnswerText === 'string'
          ? (packet.metadata.latestAnswerText as string)
          : null,
      );
      const result = renderResultJson(
        typeof packet.metadata.latestResultText === 'string'
          ? (packet.metadata.latestResultText as string)
          : null,
      );
      const learnerLines = [
        packet.originalText,
        answer ? `学生最近答案：\n${answer}` : '',
        result ? `最近反馈：\n${result}` : '',
      ].filter(Boolean);
      return {
        ...packet,
        id: `problem_attempt:${packet.sourceId}`,
        sourceType: 'problem_attempt' as const,
        originalText: compact(learnerLines.join('\n\n'), 7000),
        renderedText: compact(learnerLines.join('\n\n'), 7000),
      };
    });
}

export function mergeEvidencePackets(...groups: MemoryEvidencePacket[][]): MemoryEvidencePacket[] {
  return dedupeEvidence(groups.flat()).sort((a, b) => b.score - a.score);
}
