import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { assertUserHasCredits, chargeCreditsForWebSearch } from '@/lib/server/credits';
import { safeRoute } from '@/lib/server/json-error-response';
import { resolveWebSearchApiKey } from '@/lib/server/provider-config';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { runWithRequestContext } from '@/lib/server/request-context';
import { type NotebookProblemImportDraft } from '@/lib/problem-bank';
import { extractProblemDraftsFromText } from '@/lib/server/notebook-problems/import';
import { ensureLegacyProblemsBackfilledForCourse } from '@/lib/server/notebook-problems/service';
import { estimateWebSearchRetailCostCredits } from '@/lib/utils/openai-pricing';
import { formatSearchResultsAsContext, searchWithTavily } from '@/lib/web-search/tavily';

const previewSchema = z
  .object({
    source: z.enum(['chat', 'pdf', 'manual', 'web']).default('manual'),
    text: z.string().trim().max(120000).default(''),
    searchQuery: z.string().trim().max(400).optional(),
    webSearchApiKey: z.string().trim().max(200).optional(),
    language: z.enum(['zh-CN', 'en-US']).default('zh-CN'),
  })
  .superRefine((value, ctx) => {
    if (value.source === 'web') {
      if (!value.searchQuery?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['searchQuery'],
          message: 'searchQuery is required for web imports',
        });
      }
      return;
    }
    if (!value.text.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['text'],
        message: 'text is required for non-web imports',
      });
    }
  });

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function extractDraftText(draft: NotebookProblemImportDraft): string {
  const stem =
    'stem' in draft.publicContent
      ? draft.publicContent.stem
      : 'stemTemplate' in draft.publicContent
        ? draft.publicContent.stemTemplate
        : '';
  return [draft.title, stem, draft.tags.join(' ')].filter(Boolean).join(' ');
}

function suggestNotebookAssignments(
  drafts: NotebookProblemImportDraft[],
  notebooks: Array<{ id: string; name: string; description: string | null; tags: string[] }>,
): NotebookProblemImportDraft[] {
  if (notebooks.length === 0) return drafts;

  const notebookProfiles = notebooks.map((notebook) => {
    const haystack = [notebook.name, notebook.description || '', notebook.tags.join(' ')]
      .filter(Boolean)
      .join(' ');
    const tokens = new Set(tokenize(haystack));
    return { ...notebook, haystack: haystack.toLowerCase(), tokens };
  });

  return drafts.map((draft) => {
    if (draft.notebookId) return draft;
    const draftText = extractDraftText(draft);
    const draftTokens = tokenize(draftText);
    let bestMatch: { id: string; score: number } | null = null;

    for (const notebook of notebookProfiles) {
      let score = 0;
      for (const token of draftTokens) {
        if (notebook.tokens.has(token)) score += token.length >= 4 ? 3 : 1;
        if (token.length >= 4 && notebook.haystack.includes(token)) score += 1;
      }
      if (draft.title && notebook.haystack.includes(draft.title.toLowerCase())) {
        score += 8;
      }
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { id: notebook.id, score };
      }
    }

    return {
      ...draft,
      notebookId: bestMatch && bestMatch.score >= 4 ? bestMatch.id : null,
      sourceMeta: {
        ...draft.sourceMeta,
        assignmentScore: bestMatch?.score ?? 0,
      },
    };
  });
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { id } = await context.params;

    const course = await prisma.course.findFirst({
      where: { id, ownerId: auth.userId },
      select: { id: true },
    });
    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    await ensureLegacyProblemsBackfilledForCourse(auth.userId, id);

    const payload = previewSchema.safeParse(await req.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: payload.error.flatten() },
        { status: 400 },
      );
    }

    const notebooks = await prisma.notebook.findMany({
      where: { ownerId: auth.userId, courseId: id },
      select: {
        id: true,
        name: true,
        description: true,
        tags: true,
      },
      orderBy: [{ updatedAt: 'desc' }],
    });

    const { model } = await resolveModelFromHeaders(req, {
      allowOpenAIModelOverride: true,
    });

    let importText = payload.data.text;
    let webSearch: {
      query: string;
      sourceCount: number;
      estimatedCostCredits: number;
      sources: Array<{ title: string; url: string }>;
    } | null = null;

    if (payload.data.source === 'web') {
      const query = payload.data.searchQuery?.trim() || '';
      const apiKey = resolveWebSearchApiKey(payload.data.webSearchApiKey);
      if (!apiKey) {
        return NextResponse.json(
          {
            error:
              payload.data.language === 'zh-CN'
                ? '未配置联网搜索 API Key，请先在设置里启用 Tavily。'
                : 'Web search API key is not configured. Please configure Tavily in settings first.',
          },
          { status: 400 },
        );
      }

      await assertUserHasCredits(auth.userId);
      const searchResult = await runWithRequestContext(
        req,
        '/api/courses/problems/import-web',
        () =>
          searchWithTavily({
            query,
            apiKey,
            maxResults: 6,
          }),
      );
      await chargeCreditsForWebSearch({
        userId: auth.userId,
        route: '/api/courses/problems/import-preview',
        query,
        source: 'course-problem-bank-import-web-search',
        courseId: id,
        operationCode: 'course_problem_bank_import_web_search',
        chargeReason: '课程题库联网搜索',
        serviceLabel: 'Tavily Web Search',
      });

      importText = [
        payload.data.language === 'zh-CN'
          ? `课程/搜题关键词：${query}`
          : `Course / search query: ${query}`,
        '',
        formatSearchResultsAsContext(searchResult),
      ]
        .filter(Boolean)
        .join('\n');

      webSearch = {
        query,
        sourceCount: searchResult.sources.length,
        estimatedCostCredits: estimateWebSearchRetailCostCredits(1),
        sources: searchResult.sources.map((source) => ({
          title: source.title,
          url: source.url,
        })),
      };
    }

    const result = await runWithRequestContext(
      req,
      '/api/courses/problems/import-preview',
      async () => {
        const extracted = await extractProblemDraftsFromText({
          text: importText,
          source: payload.data.source,
          language: payload.data.language,
          model,
        });
        return {
          ...extracted,
          drafts: suggestNotebookAssignments(extracted.drafts, notebooks).map((draft) => ({
            ...draft,
            sourceMeta: {
              ...draft.sourceMeta,
              suggestedNotebookId: draft.notebookId ?? null,
              courseId: id,
              webSearchQuery: webSearch?.query ?? draft.sourceMeta.webSearchQuery,
              webSearchSources: webSearch?.sources ?? draft.sourceMeta.webSearchSources,
            },
          })),
        };
      },
    );

    return NextResponse.json({
      ...result,
      notebooks: notebooks.map((notebook) => ({
        id: notebook.id,
        name: notebook.name,
      })),
      webSearch,
    });
  });
}
