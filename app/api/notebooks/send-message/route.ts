import { NextRequest } from 'next/server';
import { parse as parsePartialJson, Allow } from 'partial-json';
import { jsonrepair } from 'jsonrepair';
import { callLLM, streamLLM } from '@/lib/ai/llm';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import type {
  SendNotebookMessageRequest,
  SendNotebookMessageResponse,
  NotebookMessagePlan,
  SendNotebookMessageStreamEvent,
} from '@/lib/types/notebook-message';
import { searchWithTavily, formatSearchResultsAsContext } from '@/lib/web-search/tavily';
import { resolveWebSearchApiKey } from '@/lib/server/provider-config';
import { assertUserHasCredits, chargeCreditsForWebSearch } from '@/lib/server/credits';
import type { CoursePurpose } from '@/lib/utils/database';
import { getRequestContext, runWithRequestContext } from '@/lib/server/request-context';
import {
  buildNotebookContentDocumentFromInsert,
  buildNotebookContentDocumentFromText,
  parseNotebookContentDocument,
  renderNotebookContentToMarkdown,
} from '@/lib/notebook-content';

const log = createLogger('NotebookSendMessage');

export const maxDuration = 180;

function stripCodeFences(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return cleaned.trim();
}

function parseNotebookJsonLike(text: string): unknown {
  const cleaned = stripCodeFences(text);
  try {
    return JSON.parse(jsonrepair(cleaned));
  } catch {
    return parsePartialJson(
      cleaned,
      Allow.OBJ | Allow.ARR | Allow.STR | Allow.NUM | Allow.BOOL | Allow.NULL,
    );
  }
}

function getPartialAnswer(text: string): string {
  try {
    const parsed = parseNotebookJsonLike(text) as { answer?: unknown };
    return typeof parsed?.answer === 'string' ? parsed.answer : '';
  } catch {
    return '';
  }
}

function notebookStreamEvent(event: SendNotebookMessageStreamEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

function sanitizePlan(raw: unknown, language: 'zh-CN' | 'en-US' = 'zh-CN'): NotebookMessagePlan {
  const parsed = (raw || {}) as Partial<NotebookMessagePlan>;
  const answerDocument = parseNotebookContentDocument(
    (parsed as { answerDocument?: unknown }).answerDocument,
  );
  const answer = String(parsed.answer || '').trim();
  const fallbackAnswer = language === 'en-US' ? 'No content available yet.' : '暂无内容。';
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
          type: ((x as { type?: 'slide' | 'quiz' }).type === 'quiz' ? 'quiz' : 'slide') as
            | 'slide'
            | 'quiz',
          title: String((x as { title?: string }).title || '').trim(),
          description: String((x as { description?: string }).description || '').trim(),
          keyPoints: Array.isArray((x as { keyPoints?: string[] }).keyPoints)
            ? (x as { keyPoints: string[] }).keyPoints
                .map((k) => String(k).trim())
                .filter(Boolean)
                .slice(0, 6)
            : [],
          contentDocument: parseNotebookContentDocument(
            (x as { contentDocument?: unknown }).contentDocument,
          ),
        }))
        .filter((x) => x.afterOrder >= 0 && x.title)
        .slice(0, 4)
        .map((x) => ({
          ...x,
          contentDocument:
            x.contentDocument ||
            buildNotebookContentDocumentFromInsert({
              title: x.title,
              description: x.description,
              keyPoints: x.keyPoints,
              language,
            }),
        }))
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
    answer:
      answer || (answerDocument ? renderNotebookContentToMarkdown(answerDocument) : fallbackAnswer),
    answerDocument:
      answerDocument ||
      buildNotebookContentDocumentFromText({
        text: answer || fallbackAnswer,
        language,
      }),
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
    'If a durable prerequisite gap is exposed, mark knowledgeGap=true and suggest a sparse private-memory note.',
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
      const usageContext = {
        notebookId: body.notebook.id.trim(),
        notebookName: body.notebook.name?.trim() || undefined,
        courseName: body.course?.name?.trim() || undefined,
        operationCode: 'notebook_chat',
        chargeReason: '笔记本助手对话',
      } as const;

      const allowWrite = body.options?.allowWrite !== false;
      const purpose = body.course?.purpose;
      const purposePolicy = buildPurposePolicy(purpose);
      const { model, modelString } = await resolveModelFromHeaders(req, {
        allowOpenAIModelOverride: true,
      });

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
            await assertUserHasCredits(getRequestContext()?.userId);
            const ws = await searchWithTavily({ query: q, apiKey });
            webSearchContext = formatSearchResultsAsContext(ws);
            webSearchUsed = true;
            await chargeCreditsForWebSearch({
              userId: getRequestContext()?.userId,
              route: '/api/notebooks/send-message',
              query: q,
              source: 'notebook-prerequisite-search',
              notebookId: body.notebook.id,
              notebookName: body.notebook.name,
              courseName: body.course?.name,
              operationCode: 'notebook_prerequisite_search',
              chargeReason: '笔记本助手补充前置知识检索',
              serviceLabel: 'Tavily Web Search',
            });
          }
        } catch (e) {
          log.warn('Prerequisite web search failed:', e);
        }
      }

      const systemPrompt = `You are a patient notebook copilot and teacher.
Return ONLY strict JSON that matches the requested schema. No markdown fences. No prose outside JSON.

Your job:
- Answer like a strong instructor, not a terse search snippet.
- Ground the answer in existing notebook pages whenever possible.
- If the notebook lacks prerequisite or reference material, say so clearly. Only set knowledgeGap=true when this is a durable learning gap worth remembering privately.
- Operations are candidate private-memory notes for the client. They are NOT slide/page writes and should be sparse.
- Be encouraging, calm, and specific. Never patronize.
- Prioritize accuracy over confidence. If the notebook does not support a claim, do not pretend it does.`;
      const conversationContext = (body.conversation || [])
        .slice(-12)
        .map((m, idx) => {
          const role = m.role === 'assistant' ? 'assistant' : 'user';
          const content = String(m.content || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 800);
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
- reference units (image notebooks use pages; markdown notebooks use sections):
${body.notebook.scenes
  .map((s) => `  - unit ${s.order} | ${s.type} | ${s.title} | ${s.knowledgeDigest}`)
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

Background private-memory permission:
${
  allowWrite
    ? 'enabled'
    : 'disabled (you may still return the best sparse memory candidate, but the caller may ignore it)'
}

Output schema:
{
  "answer": "string",
  "answerDocument": {
    "version": 1,
    "language": "zh-CN" | "en-US",
    "profile": "general" | "math" | "code",
    "title": "optional",
    "blocks": [
      { "type": "paragraph", "text": "string" }
    ]
  },
  "references": [{"order": 1, "title": "string", "why": "string"}],
  "knowledgeGap": true|false,
  "operations": {
    "insert": [{
      "afterOrder": 1,
      "type": "slide"|"quiz",
      "title": "string",
      "description": "string",
      "keyPoints": ["..."],
      "contentDocument": {
        "version": 1,
        "language": "zh-CN" | "en-US",
        "profile": "general" | "math" | "code",
        "title": "optional",
        "blocks": [{ "type": "paragraph", "text": "string" }]
      }
    }],
    "update": [{"order": 1, "title": "optional", "appendKnowledge": "optional"}],
    "delete": [{"order": 1, "reason": "string"}]
  }
}

Rules:
- default to a teacher-style explanation that is complete enough for the student to keep learning on their own.
- for substantive questions, prefer this flow: direct answer -> intuition/background -> step-by-step explanation -> example/application -> common pitfall or next step.
- do NOT be stingy. Only keep it very short if the user explicitly asks for brevity or the question is trivial.
- references must point only to existing notebook pages/sections that actually support the answer.
- do not update memory for greetings, thanks, simple follow-ups, or ordinary questions that do not reveal a durable learning gap.
- if the notebook is missing prerequisite/reference content and that gap is useful for future learning, set knowledgeGap=true and explain the gap plainly.
- when there is a durable gap, propose the smallest useful insert/update candidate as a private-memory note. Return operations even if background private-memory permission is disabled.
- never request a full PPT rewrite; operations are memory candidates, not slide/page mutations.
- answerDocument should be the structured version of the answer for rendering in chat.
- choose profile='math' for formula / proof / matrix-heavy content, profile='code' for programming explanations, and profile='general' otherwise.
- in answer text and paragraph text, write inline math as $O(2^n)$ and standalone formulas as $$T(n)=2T(n-1)+O(1)$$. Never write formulas as [ T(n)=... ] or ((O(2^n))).
- when the answer or inserted slide contains formulas, derivation steps, code, tables, worked examples, or chemistry expressions, use structured blocks instead of hiding them inside plain paragraph text.
- supported block types for answerDocument/contentDocument are:
  - {"type":"heading","level":1-4,"text":"..."}
  - {"type":"paragraph","text":"..."}
  - {"type":"bullet_list","items":["..."]}
  - {"type":"equation","latex":"...","display":true}
  - {"type":"matrix","rows":[["a","b"],["c","d"]],"brackets":"bmatrix","label":"optional","caption":"optional"}
  - {"type":"derivation_steps","title":"optional","steps":[{"expression":"...","format":"latex"|"text"|"chem","explanation":"optional"}]}
  - {"type":"code_block","language":"python","code":"...","caption":"optional"}
  - {"type":"code_walkthrough","title":"optional","language":"python","code":"...","caption":"optional","steps":[{"title":"optional","focus":"optional","explanation":"..."}],"output":"optional"}
  - {"type":"table","headers":["..."],"rows":[["..."]],"caption":"optional"}
  - {"type":"callout","tone":"info"|"success"|"warning"|"danger"|"tip","title":"optional","text":"..."}
  - {"type":"example","title":"optional","problem":"...","givens":["..."],"goal":"optional","steps":["..."],"answer":"optional","pitfalls":["..."]}
  - {"type":"chem_formula","formula":"...","caption":"optional"}
  - {"type":"chem_equation","equation":"...","caption":"optional"}
`;

      log.info(`Notebook send-message [model=${modelString}]`);
      const wantsStream =
        req.nextUrl.searchParams.get('stream') === '1' ||
        req.headers.get('accept')?.includes('text/event-stream');

      if (wantsStream) {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const heartbeat = setInterval(() => {
              controller.enqueue(new TextEncoder().encode(`:heartbeat\n\n`));
            }, 15_000);

            void (async () => {
              let raw = '';
              let emittedAnswerLength = 0;
              let emittedStructureStatus = false;
              try {
                const llm = await runWithRequestContext(
                  req,
                  '/api/notebooks/send-message',
                  () =>
                    streamLLM(
                      {
                        model,
                        system: systemPrompt,
                        prompt: userPrompt,
                        abortSignal: req.signal,
                      },
                      'notebook-send-message-stream',
                    ),
                  usageContext,
                );

                for await (const chunk of llm.textStream) {
                  if (req.signal.aborted) break;
                  raw += chunk;

                  const answer = getPartialAnswer(raw);
                  if (answer.length > emittedAnswerLength) {
                    controller.enqueue(
                      notebookStreamEvent({
                        type: 'answer_delta',
                        data: { content: answer.slice(emittedAnswerLength) },
                      }),
                    );
                    emittedAnswerLength = answer.length;
                  }

                  if (
                    !emittedStructureStatus &&
                    emittedAnswerLength > 0 &&
                    /"answerDocument"|"references"|"operations"/u.test(raw)
                  ) {
                    controller.enqueue(
                      notebookStreamEvent({
                        type: 'status',
                        data: { message: '正在整理结构化答案…' },
                      }),
                    );
                    emittedStructureStatus = true;
                  }
                }

                if (req.signal.aborted) return;

                let parsedRaw: unknown;
                try {
                  parsedRaw = parseNotebookJsonLike(raw);
                } catch (error) {
                  log.warn(
                    'Failed to parse streamed notebook result, using partial answer:',
                    error,
                  );
                  const fallbackAnswer =
                    getPartialAnswer(raw).trim() ||
                    (body.course?.language === 'en-US'
                      ? 'I drafted the answer, but the structured formatting step failed. Please ask again if you want a cleaner version.'
                      : '我已经生成了回答，但结构化整理失败了。你可以继续追问，我会直接接着讲。');
                  parsedRaw = { answer: fallbackAnswer };
                }

                const plan = sanitizePlan(parsedRaw, body.course?.language || 'zh-CN');
                const response: SendNotebookMessageResponse = {
                  ...plan,
                  webSearchUsed,
                  prerequisiteHints: webSearchUsed ? ['used_web_search_for_prerequisites'] : [],
                };
                controller.enqueue(notebookStreamEvent({ type: 'final', data: response }));
              } catch (error) {
                if (!req.signal.aborted) {
                  controller.enqueue(
                    notebookStreamEvent({
                      type: 'error',
                      data: {
                        message:
                          error instanceof Error ? error.message : 'Failed to stream response',
                      },
                    }),
                  );
                }
              } finally {
                clearInterval(heartbeat);
                controller.close();
              }
            })();
          },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        });
      }

      const llm = await runWithRequestContext(
        req,
        '/api/notebooks/send-message',
        () =>
          callLLM(
            {
              model,
              system: systemPrompt,
              prompt: userPrompt,
            },
            'notebook-send-message',
          ),
        usageContext,
      );

      let parsedRaw: unknown;
      try {
        parsedRaw = parseNotebookJsonLike(llm.text);
      } catch (error) {
        log.warn('Failed to parse notebook result, using raw answer fallback:', error);
        const fallbackAnswer = getPartialAnswer(llm.text).trim();
        parsedRaw = {
          answer:
            fallbackAnswer ||
            (body.course?.language === 'en-US'
              ? 'I drafted the answer, but the structured formatting step failed. Please ask again if you want a cleaner version.'
              : '我已经生成了回答，但结构化整理失败了。你可以继续追问，我会直接接着讲。'),
        };
      }

      const plan = sanitizePlan(parsedRaw, body.course?.language || 'zh-CN');
      const response: SendNotebookMessageResponse = {
        ...plan,
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
