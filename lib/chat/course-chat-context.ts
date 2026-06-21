import type {
  CourseChatContext,
  CourseChatContextNotebook,
  CourseChatContextPage,
} from '@/lib/types/chat';
import type { Scene } from '@/lib/types/stage';
import {
  getLocalStudyMemoryUserId,
  listNotebookPrivateMemories,
  type NotebookMemoryItem,
} from '@/lib/learning/study-memory';
import { getCourse } from '@/lib/utils/course-storage';
import {
  listStagesByCourse,
  loadStageData,
  MOCK_COURSE_CHAT_ID,
  type StageListItem,
} from '@/lib/utils/stage-storage';

const MAX_NOTEBOOKS = 5;
const MAX_PAGES_PER_NOTEBOOK = 4;
const MAX_PAGE_DIGEST_LENGTH = 600;
const MAX_PRIVATE_MEMORIES_PER_NOTEBOOK = 3;
const COURSE_META_TIMEOUT_MS = 1200;

function normalizeText(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function stripHtmlTags(input: string): string {
  return input
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sceneSearchText(scene: Scene): string {
  const title = scene.title || '';
  if (scene.content.type === 'markdown') {
    return `${title} ${scene.content.summary || ''} ${scene.content.markdown}`.trim();
  }
  if (scene.content.type !== 'slide') return title;
  const elements = scene.content.canvas.elements || [];
  const textBits = elements
    .filter((el) => el.type === 'text')
    .map((el) => {
      const content = (el as { content?: unknown }).content;
      return typeof content === 'string' ? stripHtmlTags(content) : '';
    })
    .filter(Boolean)
    .join(' ');
  return `${title} ${textBits}`.trim();
}

export function tokenizeCourseChatQuery(input: string): string[] {
  const lowered = input.toLowerCase();
  const zhChunks = lowered.match(/[\u4e00-\u9fff]{2,}/g) || [];
  const zhStopTokens = new Set([
    '一下',
    '一个',
    '这个',
    '那个',
    '我们',
    '你们',
    '他们',
    '为什么',
    '怎么',
    '如何',
    '说明',
    '解释',
    '必要',
  ]);
  const zhTokens = zhChunks.flatMap((chunk) => {
    const tokens: string[] = [chunk];
    for (const size of [2, 3, 4]) {
      for (let index = 0; index <= chunk.length - size; index++) {
        const token = chunk.slice(index, index + size);
        if (!zhStopTokens.has(token)) tokens.push(token);
      }
    }
    return tokens;
  });
  const latinTokens = lowered.match(/[a-z0-9][a-z0-9-]{1,}/g) || [];
  return Array.from(new Set([...zhTokens, ...latinTokens]));
}

export function scoreCourseChatText(tokens: string[], haystack: string): number {
  if (!tokens.length || !haystack.trim()) return 0;
  const normalized = haystack.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (!normalized.includes(token)) continue;
    score += token.length >= 6 ? 4 : token.length >= 4 ? 3 : 2;
  }
  return score;
}

function scoreNotebookMeta(tokens: string[], notebook: StageListItem): number {
  return scoreCourseChatText(
    tokens,
    [notebook.name, notebook.description || '', ...(notebook.tags || [])].join(' '),
  );
}

function scorePrivateMemory(tokens: string[], memory: NotebookMemoryItem): number {
  const text = [memory.title, memory.text, memory.reason || '', memory.question || ''].join(' ');
  const relevance = scoreCourseChatText(tokens, text);
  const recencyAgeDays = Math.max(
    0,
    (Date.now() - (memory.updatedAt || memory.createdAt)) / 86_400_000,
  );
  const recency = Math.max(0, 3 - recencyAgeDays / 14);
  return relevance + recency;
}

async function getCourseForChatContext(courseId: string) {
  if (courseId === MOCK_COURSE_CHAT_ID) return undefined;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      getCourse(courseId),
      new Promise<undefined>((resolve) => {
        timeoutId = setTimeout(() => resolve(undefined), COURSE_META_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return undefined;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function buildCourseChatContext(args: {
  courseId: string;
  courseName?: string;
  question: string;
  target: CourseChatContext['target'];
  learner?: CourseChatContext['learner'];
}): Promise<CourseChatContext> {
  const [course, notebooks] = await Promise.all([
    getCourseForChatContext(args.courseId),
    listStagesByCourse(args.courseId),
  ]);
  const tokens = tokenizeCourseChatQuery(args.question);
  const userId = getLocalStudyMemoryUserId();

  const hydrated = await Promise.all(
    notebooks.map(async (notebook): Promise<CourseChatContextNotebook> => {
      const data = await loadStageData(notebook.id).catch(() => null);
      const pages: CourseChatContextPage[] = (data?.scenes || [])
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((scene) => {
          const digest = normalizeText(sceneSearchText(scene)).slice(0, MAX_PAGE_DIGEST_LENGTH);
          return {
            id: scene.id,
            order: scene.order + 1,
            title: scene.title || '未命名页面',
            digest,
            sourceScore: scoreCourseChatText(tokens, `${scene.title} ${digest}`),
          };
        });

      const metaScore = scoreNotebookMeta(tokens, notebook);
      const privateMemories = listNotebookPrivateMemories({
        userId,
        stageId: notebook.id,
        limit: 8,
      })
        .map((memory) => ({
          memory,
          score: scorePrivateMemory(tokens, memory),
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || b.memory.updatedAt - a.memory.updatedAt)
        .slice(0, MAX_PRIVATE_MEMORIES_PER_NOTEBOOK)
        .map(({ memory, score }) => ({
          id: memory.id,
          title: memory.title,
          text: memory.text.slice(0, 600),
          reason: memory.reason,
          question: memory.question,
          sourceScore: score,
          sourceReferences: (memory.sourceReferences || []).slice(0, 4).map((reference) => ({
            order: reference.order,
            title: reference.title,
            why: reference.why,
          })),
        }));
      const topPageScore = pages.reduce((best, page) => Math.max(best, page.sourceScore), 0);
      const pageScoreTotal = pages.reduce((total, page) => total + page.sourceScore, 0);
      const selectedPages = pages
        .slice()
        .sort((a, b) => b.sourceScore - a.sourceScore || a.order - b.order)
        .slice(0, MAX_PAGES_PER_NOTEBOOK)
        .sort((a, b) => a.order - b.order);

      return {
        id: notebook.id,
        name: notebook.name,
        description: notebook.description || undefined,
        tags: notebook.tags || [],
        updatedAt: notebook.updatedAt,
        pages: selectedPages,
        privateMemories,
        sourceScore:
          metaScore +
          topPageScore +
          Math.min(pageScoreTotal, 12) +
          Math.min(
            privateMemories.reduce((total, memory) => total + memory.sourceScore, 0),
            6,
          ),
      };
    }),
  );

  const selectedNotebooks = hydrated
    .sort((a, b) => b.sourceScore - a.sourceScore || (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, MAX_NOTEBOOKS);

  return {
    course: {
      id: args.courseId,
      name: course?.name || args.courseName?.trim() || '当前课程',
      description: course?.description || undefined,
      language: course?.language,
      purpose: course?.purpose,
      tags: course?.tags || [],
      university: course?.university,
      courseCode: course?.courseCode,
    },
    learner: args.learner,
    target: args.target,
    notebooks: selectedNotebooks,
  };
}
