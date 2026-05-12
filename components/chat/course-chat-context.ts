import type {
  CourseChatContext,
  CourseChatContextNotebook,
  CourseChatContextPage,
} from '@/lib/types/chat';
import { getCourse } from '@/lib/utils/course-storage';
import { listStagesByCourse, loadStageData, type StageListItem } from '@/lib/utils/stage-storage';
import { sceneSearchText } from './chat-notebook-routing';

const MAX_NOTEBOOKS = 5;
const MAX_PAGES_PER_NOTEBOOK = 4;
const MAX_PAGE_DIGEST_LENGTH = 600;

function normalizeText(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

export function tokenizeCourseChatQuery(input: string): string[] {
  const lowered = input.toLowerCase();
  const zhTokens = lowered.match(/[\u4e00-\u9fff]{2,}/g) || [];
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

export async function buildCourseChatContext(args: {
  courseId: string;
  courseName?: string;
  question: string;
  target: CourseChatContext['target'];
}): Promise<CourseChatContext> {
  const [course, notebooks] = await Promise.all([
    getCourse(args.courseId),
    listStagesByCourse(args.courseId),
  ]);
  const tokens = tokenizeCourseChatQuery(args.question);

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
        sourceScore: metaScore + topPageScore + Math.min(pageScoreTotal, 12),
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
    target: args.target,
    notebooks: selectedNotebooks,
  };
}
