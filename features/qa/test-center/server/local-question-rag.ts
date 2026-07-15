import fs from 'node:fs/promises';
import path from 'node:path';
import OpenAI from 'openai';
import { proxyFetch } from '@/lib/server/proxy-fetch';
import { getSystemLLMRuntimeConfig } from '@/lib/server/system-llm-config';

export const LOCAL_QUESTION_EMBEDDING_MODEL = 'text-embedding-3-small';
export const LOCAL_QUESTION_EMBEDDING_DIMENSIONS = 512;

export type LocalProblem = {
  id: string;
  title: string;
  notebookId: string | null;
  notebookTitle: string | null;
  type: string;
  difficulty: string;
  tags: string[];
  question: string;
  publicContent?: unknown;
};

export type LocalProblemBank = {
  schemaVersion: number;
  courseCode: 'MAT136' | 'CSC148';
  courseName: string;
  source: string;
  sourceExportedAt: string | null;
  problemCount: number;
  problems: LocalProblem[];
};

export type RagQuery = {
  query: string;
  purpose: string;
  targetConcepts: string[];
  desiredTypes: string[];
  exclusions: string[];
};

export type RagCandidate = {
  problem: LocalProblem;
  hybridScore: number;
  semanticScore: number;
  lexicalScore: number;
  matchedQuery: string;
};

type IndexedProblem = {
  problem: LocalProblem;
  document: string;
  embedding: number[];
};

let embeddingClientPromise: Promise<OpenAI> | null = null;
const indexCache = new Map<string, Promise<IndexedProblem[]>>();

async function embeddingClient(): Promise<OpenAI> {
  if (!embeddingClientPromise) {
    embeddingClientPromise = getSystemLLMRuntimeConfig().then((config) => {
      if (!config.apiKey) throw new Error('系统 OpenAI API Key 尚未配置，无法执行题库 RAG。');
      return new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
        fetch: proxyFetch as typeof fetch,
        timeout: 60_000,
        maxRetries: 0,
      });
    });
  }
  return embeddingClientPromise;
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const client = await embeddingClient();
  const output: number[][] = [];
  for (let start = 0; start < texts.length; start += 96) {
    const batch = texts.slice(start, start + 96);
    const response = await client.embeddings.create({
      model: LOCAL_QUESTION_EMBEDDING_MODEL,
      dimensions: LOCAL_QUESTION_EMBEDDING_DIMENSIONS,
      input: batch,
    });
    const ordered = [...response.data].sort((a, b) => a.index - b.index);
    if (ordered.length !== batch.length) {
      throw new Error(
        `题库 embedding 返回数量不完整：期望 ${batch.length}，实际 ${ordered.length}。`,
      );
    }
    output.push(...ordered.map((item) => item.embedding));
  }
  return output;
}

export async function loadLocalProblemBank(
  courseCode: 'MAT136' | 'CSC148',
): Promise<LocalProblemBank> {
  const filePath = path.join(
    process.cwd(),
    'data',
    'platform-tests',
    'problem-banks',
    `${courseCode.toLowerCase()}.json`,
  );
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as LocalProblemBank;
}

function problemDocument(problem: LocalProblem): string {
  return [
    `Title: ${problem.title}`,
    `Notebook: ${problem.notebookTitle || 'unknown'}`,
    `Type: ${problem.type}`,
    `Difficulty: ${problem.difficulty}`,
    `Tags: ${problem.tags.join(', ')}`,
    `Question: ${problem.question.slice(0, 1_600)}`,
  ].join('\n');
}

async function indexedBank(bank: LocalProblemBank): Promise<IndexedProblem[]> {
  const cacheKey = `${bank.courseCode}:${bank.problemCount}:${bank.sourceExportedAt || 'unknown'}`;
  const cached = indexCache.get(cacheKey);
  if (cached) return cached;
  const building = (async () => {
    const documents = bank.problems.map(problemDocument);
    const embeddings = await embedTexts(documents);
    return bank.problems.map((problem, index) => ({
      problem,
      document: documents[index],
      embedding: embeddings[index],
    }));
  })();
  indexCache.set(cacheKey, building);
  try {
    return await building;
  } catch (error) {
    indexCache.delete(cacheKey);
    throw error;
  }
}

function tokens(value: string): string[] {
  return Array.from(
    new Set(
      value
        .normalize('NFKC')
        .toLowerCase()
        .match(/[a-z0-9_+\-]{2,}|[\u3400-\u9fff]{2,12}/g) || [],
    ),
  );
}

function lexicalScore(problem: LocalProblem, query: RagQuery): number {
  const queryTokens = tokens(
    [query.query, ...query.targetConcepts, ...query.desiredTypes].join(' '),
  );
  if (!queryTokens.length) return 0;
  const title = problem.title.toLowerCase();
  const notebook = String(problem.notebookTitle || '').toLowerCase();
  const tags = problem.tags.join(' ').toLowerCase();
  const question = problem.question.toLowerCase();
  const matched = queryTokens.reduce((score, token) => {
    const fieldScore =
      (title.includes(token) ? 1 : 0) +
      (tags.includes(token) ? 0.85 : 0) +
      (notebook.includes(token) ? 0.65 : 0) +
      (question.includes(token) ? 0.25 : 0);
    return score + Math.min(1, fieldScore);
  }, 0);
  const exclusionText = query.exclusions.join(' ').toLowerCase();
  const excluded = tokens(exclusionText).some(
    (token) => title.includes(token) || tags.includes(token) || notebook.includes(token),
  );
  return excluded ? 0 : Math.min(1, matched / queryTokens.length);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function hybridRetrieve(args: {
  bank: LocalProblemBank;
  availableProblemIds?: Set<string>;
  queries: RagQuery[];
  excludeProblemIds?: Set<string>;
  limit: number;
}): Promise<RagCandidate[]> {
  const index = await indexedBank(args.bank);
  const queryTexts = args.queries.map((query) =>
    [
      query.query,
      `Purpose: ${query.purpose}`,
      `Concepts: ${query.targetConcepts.join(', ')}`,
      `Types: ${query.desiredTypes.join(', ')}`,
    ].join('\n'),
  );
  const queryEmbeddings = await embedTexts(queryTexts);
  const bestByProblem = new Map<string, RagCandidate>();

  for (const [queryIndex, query] of args.queries.entries()) {
    const queryEmbedding = queryEmbeddings[queryIndex];
    for (const item of index) {
      if (args.availableProblemIds && !args.availableProblemIds.has(item.problem.id)) continue;
      if (args.excludeProblemIds?.has(item.problem.id)) continue;
      const semantic = cosineSimilarity(item.embedding, queryEmbedding);
      const lexical = lexicalScore(item.problem, query);
      const hybrid = semantic * 0.72 + lexical * 0.28;
      const existing = bestByProblem.get(item.problem.id);
      if (!existing || hybrid > existing.hybridScore) {
        bestByProblem.set(item.problem.id, {
          problem: item.problem,
          hybridScore: hybrid,
          semanticScore: semantic,
          lexicalScore: lexical,
          matchedQuery: query.query,
        });
      }
    }
  }

  return [...bestByProblem.values()]
    .sort((a, b) => b.hybridScore - a.hybridScore || a.problem.title.localeCompare(b.problem.title))
    .slice(0, args.limit);
}
