import { NextRequest, NextResponse } from 'next/server';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import { jsonrepair } from 'jsonrepair';
import { safeRoute } from '@/lib/server/json-error-response';
import { runWithRequestContext } from '@/lib/server/request-context';
import { getSystemLLMRuntimeConfig } from '@/lib/server/system-llm-config';
import { callLLM } from '@/lib/ai/llm';

export const runtime = 'nodejs';

const MAX_SYLLABUS_PDF_BYTES = 20 * 1024 * 1024;

const syllabusEventKindSchema = z.enum([
  'assignment',
  'exam',
  'progress',
  'tutorial',
  'holiday',
  'other',
]);

const syllabusParseSchema = z.object({
  courseTitle: z.string().optional().nullable(),
  events: z
    .array(
      z.object({
        title: z.string().min(1).max(160),
        kind: syllabusEventKindSchema,
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        week: z.string().optional().nullable(),
        sourceColumn: z.string().optional().nullable(),
        rawText: z.string().optional().nullable(),
        confidence: z.number().min(0).max(1).optional().nullable(),
      }),
    )
    .max(120),
  warnings: z.array(z.string().max(240)).optional().default([]),
});

function isPdfFile(file: File) {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  const jsonText = start >= 0 && end > start ? candidate.slice(start, end + 1) : candidate;
  return JSON.parse(jsonrepair(jsonText));
}

function responseWarningForEventCount(count: number) {
  if (count === 0) {
    return '没有识别到可写入日历的作业、考试或课程进度。';
  }
  if (count < 3) {
    return `只识别到 ${count} 个事项，建议补充关键日期或重新上传更清晰的 syllabus。`;
  }
  return null;
}

function syllabusExtractionPrompt(args: {
  fileName: string;
  courseName?: string;
  courseDescription?: string;
}) {
  return `Read the attached syllabus PDF directly as a file input. Extract all student-relevant dated calendar items into strict JSON.

Context:
- Course name: ${args.courseName || 'unknown'}
- Course description: ${args.courseDescription || 'unknown'}
- File name: ${args.fileName}

Important rules:
- Preserve the table structure. Do not read the PDF as a single flat paragraph.
- For weekly schedule tables, combine the week beginning date with each column day when a cell only implies the weekday.
- If a cell contains an explicit date like "Tue 2 Jun", use that exact date.
- If the PDF title or header gives a year/term, use that year. Do not default to the current year when the PDF has its own year.
- Extract due dates, tests/exams/quizzes, assignments, tutorial activities, school progress/lecture topics, holidays, make-up days, and breaks.
- Use kind:
  - assignment: homework, WeBWorK, assignment, lab, project, due/deadline
  - exam: test, exam, quiz, midterm, final, make-up test
  - progress: lecture topics, weekly course progress, readings, modules, sections
  - tutorial: tutorial, two-stage activity, workshop
  - holiday: break, holiday, campus closed, no class due to holiday
  - other: only when nothing else fits
- Keep titles short and student-facing. Include coverage when listed, e.g. "Test 1 - Coverage: Weeks 1-4".
- Return JSON only. No Markdown.

JSON shape:
{
  "courseTitle": "string or null",
  "events": [
    {
      "title": "short title",
      "kind": "assignment|exam|progress|tutorial|holiday|other",
      "date": "YYYY-MM-DD",
      "week": "week label if available",
      "sourceColumn": "table column or section name",
      "rawText": "cell text used",
      "confidence": 0.0
    }
  ],
  "warnings": ["short warning if extraction is uncertain"]
}`;
}

export async function POST(request: NextRequest) {
  return runWithRequestContext(
    request,
    '/api/syllabus/parse',
    () =>
      safeRoute(async () => {
        const formData = await request.formData();
        const file = formData.get('pdf');
        if (!(file instanceof File)) {
          return NextResponse.json({ error: '请上传 syllabus PDF 文件。' }, { status: 400 });
        }
        if (!isPdfFile(file)) {
          return NextResponse.json({ error: '当前 AI 解析入口只支持 PDF。' }, { status: 400 });
        }
        if (file.size > MAX_SYLLABUS_PDF_BYTES) {
          return NextResponse.json(
            { error: 'PDF 文件太大，请上传 20MB 以内的 syllabus。' },
            { status: 400 },
          );
        }

        const config = await getSystemLLMRuntimeConfig();
        if (!config.apiKey) {
          return NextResponse.json(
            { error: '系统 OpenAI API Key 尚未配置，无法用 AI 读取 PDF。' },
            { status: 500 },
          );
        }

        const arrayBuffer = await file.arrayBuffer();
        const pdfBuffer = Buffer.from(arrayBuffer);
        const openai = createOpenAI({
          apiKey: config.apiKey,
          baseURL: config.baseUrl,
        });
        const model = openai.responses(config.modelId) as unknown as LanguageModel;

        const result = await callLLM(
          {
            model,
            system:
              'You are a careful university syllabus calendar extraction engine. Return only valid JSON matching the requested schema.',
            maxOutputTokens: 12000,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: syllabusExtractionPrompt({
                      fileName: file.name,
                      courseName: String(formData.get('courseName') || ''),
                      courseDescription: String(formData.get('courseDescription') || ''),
                    }),
                  },
                  {
                    type: 'file',
                    data: pdfBuffer,
                    mediaType: 'application/pdf',
                    filename: file.name,
                  },
                ],
              },
            ],
          },
          'syllabus-pdf-file-extraction',
          {
            retries: 1,
            validate: (text) => {
              try {
                const parsed = syllabusParseSchema.safeParse(extractJsonObject(text));
                return parsed.success;
              } catch {
                return false;
              }
            },
          },
        );

        const parsed = syllabusParseSchema.parse(extractJsonObject(result.text));
        const countWarning = responseWarningForEventCount(parsed.events.length);
        const warnings = [...parsed.warnings];
        if (countWarning && !warnings.includes(countWarning)) warnings.unshift(countWarning);

        return NextResponse.json({
          success: true,
          parser: 'openai-responses-input-file',
          modelId: config.modelId,
          courseTitle: parsed.courseTitle || null,
          events: parsed.events,
          warnings,
        });
      }),
    {
      operationCode: 'syllabus_pdf_import',
      chargeReason: 'AI 读取 syllabus PDF',
    },
  );
}
