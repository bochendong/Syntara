import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import type {
  SendNotebookMessageRequest,
  SendNotebookMessageResponse,
  NotebookMessagePlan,
} from '@/lib/types/notebook-message';
import { searchWithTavily, formatSearchResultsAsContext } from '@/lib/web-search/tavily';
import { resolveWebSearchApiKey } from '@/lib/server/provider-config';
import type { CoursePurpose } from '@/lib/utils/database';
import { runWithRequestContext } from '@/lib/server/request-context';

const log = createLogger('NotebookSendMessage');

export const maxDuration = 180;

function stripCodeFences(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return cleaned.trim();
}

function sanitizePlan(raw: unknown): NotebookMessagePlan {
  const parsed = (raw || {}) as Partial<NotebookMessagePlan>;
  const references = Array.isArray(parsed.references)
    ? parsed.references
        .map((x) => ({
          order: Number((x as { order?: number }).order || 0),
          title: String((x as { title?: string }).title || ''),
          why: String((x as { why?: string }).why || ''),
        }))
        .filter((x) => x.order > 0 && x.title)
        .slice(0, 6)
    : [];

  const ops = parsed.operations || { insert: [], update: [], delete: [] };
  const insert = Array.isArray(ops.insert)
    ? ops.insert
        .map((x) => ({
          afterOrder: Number((x as { afterOrder?: number }).afterOrder || 0),
          type: ((x as { type?: 'slide' | 'quiz' }).type === 'quiz'
            ? 'quiz'
            : 'slide') as 'slide' | 'quiz',
          title: String((x as { title?: string }).title || '').trim(),
          description: String((x as { description?: string }).description || '').trim(),
          keyPoints: Array.isArray((x as { keyPoints?: string[] }).keyPoints)
            ? (x as { keyPoints: string[] }).keyPoints.map((k) => String(k).trim()).filter(Boolean).slice(0, 6)
            : [],
        }))
        .filter((x) => x.afterOrder >= 0 && x.title)
        .slice(0, 4)
    : [];
  const update = Array.isArray(ops.update)
    ? ops.update
        .map((x) => ({
          order: Number((x as { order?: number }).order || 0),
          title: (x as { title?: string }).title?.trim() || undefined,
          appendKnowledge: (x as { appendKnowledge?: string }).appendKnowledge?.trim() || undefined,
        }))
        .filter((x) => x.order > 0 && (x.title || x.appendKnowledge))
        .slice(0, 8)
    : [];
  const del = Array.isArray(ops.delete)
    ? ops.delete
        .map((x) => ({
          order: Number((x as { order?: number }).order || 0),
          reason: String((x as { reason?: string }).reason || '').trim(),
        }))
        .filter((x) => x.order > 0)
        .slice(0, 8)
    : [];

  return {
    answer: String(parsed.answer || '').trim(),
    references,
    knowledgeGap: Boolean(parsed.knowledgeGap),
    operations: {
      insert,
      update,
      delete: del,
    },
  };
}

function buildPurposePolicy(purpose: CoursePurpose | undefined) {
  if (purpose === 'research') {
    return [
      'Audience is research-oriented.',
      'Use concise and rigorous language.',
      'Prefer conceptual explanation, methods, and evidence.',
      'Avoid introducing quiz unless explicitly requested.',
    ].join('\n');
  }
  if (purpose === 'daily') {
    return [
      'Audience is daily-life learner.',
      'Use conversational, friendly, slightly humorous tone.',
      'Avoid quiz unless explicitly requested.',
    ].join('\n');
  }
  return [
    'Audience is university students.',
    'Homework/exam/quiz questions are common and should be supported.',
    'Prefer in-syllabus knowledge and prerequisites.',
    'If prerequisite is missing, mark knowledgeGap=true and suggest incremental insert operations.',
  ].join('\n');
}

export async function POST(req: NextRequest) {
  return runWithRequestContext(req, '/api/notebooks/send-message', async () => {
    try {
      const body = (await req.json()) as SendNotebookMessageRequest;
      if (!body?.message?.trim()) {
        return apiError('MISSING_REQUIRED_FIELD', 400, 'message is required');
      }
      if (!body?.notebook?.id || !Array.isArray(body?.notebook?.scenes)) {
        return apiError(
          'MISSING_REQUIRED_FIELD',
          400,
          'notebook.id and notebook.scenes are required',
        );
      }

      const allowWrite = body.options?.allowWrite !== false;
      const purpose = body.course?.purpose;
      const purposePolicy = buildPurposePolicy(purpose);
      const { model, modelString } = await resolveModelFromHeaders(req);

      let webSearchContext = '';
      let webSearchUsed = false;
      const mayNeedPrerequisiteSearch =
        purpose === 'university' &&
        /作业|考试|quiz|homework|exam|期末|期中|习题/i.test(body.message);
      if (body.options?.preferWebSearch && mayNeedPrerequisiteSearch) {
        try {
          const apiKey = resolveWebSearchApiKey(body.options.webSearchApiKey);
          if (apiKey) {
            const q = `${body.course?.name || body.notebook.name} ${body.message} prerequisite syllabus`;
            const ws = await searchWithTavily({ query: q, apiKey });
            webSearchContext = formatSearchResultsAsContext(ws);
            webSearchUsed = true;
          }
        } catch (e) {
          log.warn('Prerequisite web search failed:', e);
        }
      }

      const systemPrompt =
        'You are a notebook copilot. Return ONLY strict JSON. No markdown, no prose outside JSON.';
      const conversationContext = (body.conversation || [])
        .slice(-12)
        .map((m, idx) => {
          const role = m.role === 'assistant' ? 'assistant' : 'user';
          const content = String(m.content || '').replace(/\s+/g, ' ').trim().slice(0, 800);
          return `  ${idx + 1}. [${role}] ${content}`;
        })
        .join('\n');
      const attachmentContext = (body.attachments || [])
        .slice(-6)
        .map((a, idx) => {
          const line1 = `  ${idx + 1}. ${a.name} (${a.mimeType}, ${a.size} bytes)`;
          const line2 = a.textExcerpt
            ? `     excerpt: ${String(a.textExcerpt).replace(/\s+/g, ' ').trim().slice(0, 800)}`
            : '     excerpt: N/A';
          return `${line1}\n${line2}`;
        })
        .join('\n');
      const userPrompt = `User message:
${body.message}

Notebook:
- id: ${body.notebook.id}
- name: ${body.notebook.name}
- description: ${body.notebook.description || 'N/A'}
- scenes:
${body.notebook.scenes
  .map((s) => `  - page ${s.order} | ${s.type} | ${s.title} | ${s.knowledgeDigest}`)
  .join('\n')}

Course:
- purpose: ${body.course?.purpose || 'daily'}
- language: ${body.course?.language || 'zh-CN'}
- name: ${body.course?.name || ''}
- tags: ${(body.course?.tags || []).join(', ')}
- university: ${body.course?.university || ''}
- courseCode: ${body.course?.courseCode || ''}

Policy by purpose:
${purposePolicy}

Web search context (optional):
${webSearchContext || 'N/A'}

Conversation context (recent turns, optional):
${conversationContext || 'N/A'}

Attachments (optional):
${attachmentContext || 'N/A'}

Write permission:
${allowWrite ? 'allowed' : 'disallowed'}

Output schema:
{
  "answer": "string",
  "references": [{"order": 1, "title": "string", "why": "string"}],
  "knowledgeGap": true|false,
  "operations": {
    "insert": [{"afterOrder": 1, "type": "slide"|"quiz", "title": "string", "description": "string", "keyPoints": ["..."]}],
    "update": [{"order": 1, "title": "optional", "appendKnowledge": "optional"}],
    "delete": [{"order": 1, "reason": "string"}]
  }
}

Rules:
- references must point to existing pages when answering.
- if knowledge is missing, set knowledgeGap=true.
- if write is disallowed, operations must all be empty arrays.
- never request full PPT rewrite; only incremental insert/update/delete.
- keep answer short and practical.
`;

      log.info(`Notebook send-message [model=${modelString}]`);
      const llm = await callLLM(
        {
          model,
          system: systemPrompt,
          prompt: userPrompt,
        },
        'notebook-send-message',
      );

      let parsedRaw: unknown;
      try {
        parsedRaw = JSON.parse(stripCodeFences(llm.text));
      } catch {
        return apiError('PARSE_FAILED', 500, 'Failed to parse notebook send-message result');
      }

      const plan = sanitizePlan(parsedRaw);
      const response: SendNotebookMessageResponse = {
        ...plan,
        operations: allowWrite
          ? plan.operations
          : {
              insert: [],
              update: [],
              delete: [],
            },
        webSearchUsed,
        prerequisiteHints: webSearchUsed ? ['used_web_search_for_prerequisites'] : [],
      };
      return apiSuccess(response);
    } catch (error) {
      log.error('send-message route error:', error);
      return apiError(
        'INTERNAL_ERROR',
        500,
        error instanceof Error ? error.message : String(error),
      );
    }
  });
}
