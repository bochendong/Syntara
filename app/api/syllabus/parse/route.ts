import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { safeRoute } from '@/lib/server/json-error-response';
import { runWithRequestContext } from '@/lib/server/request-context';
import { resolveOpenAIResponsesModelFromHeaders } from '@/lib/server/resolve-model';
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
  events: z.array(
    z.object({
      title: z.string().min(1),
      kind: syllabusEventKindSchema,
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      week: z.string().optional().nullable(),
      sourceColumn: z.string().optional().nullable(),
      rawText: z.string().optional().nullable(),
      confidence: z.number().min(0).max(1).optional().nullable(),
    }),
  ),
  warnings: z.array(z.string()),
});

function isPdfFile(file: File) {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

function extractJsonObject(text: string): unknown {
  return JSON.parse(text.trim());
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

        const arrayBuffer = await file.arrayBuffer();
        const pdfBuffer = Buffer.from(arrayBuffer);
        const { model, modelString } = await resolveOpenAIResponsesModelFromHeaders(request, {
          allowOpenAIModelOverride: true,
        });
        const modelId = modelString.replace(/^openai:/, '');

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
            maxRetries: 0,
          },
          'syllabus-pdf-file-extraction',
        );

        const parsed = syllabusParseSchema.parse(extractJsonObject(result.text));

        const savedAt = Date.now();
        const events = parsed.events.map((event, index) => ({
          ...event,
          id: `syllabus-${savedAt}-${index}-${randomUUID().slice(0, 8)}`,
        }));
        return NextResponse.json({
          success: true,
          parser: 'openai-responses-input-file',
          modelId,
          courseTitle: parsed.courseTitle || null,
          events,
          warnings: parsed.warnings,
        });
      }),
    {
      operationCode: 'syllabus_pdf_import',
      chargeReason: 'AI 读取 syllabus PDF',
    },
  );
}
