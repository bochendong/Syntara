import type { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import { runWithRequestContext } from '@/lib/server/request-context';
import {
  resolveModel,
  resolveModelFromHeadersForNotebookStage,
  type ResolvedModel,
} from '@/lib/server/resolve-model';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import { buildVisionUserContent } from '@/features/ppt-generation/domain/scene-actions';
import type { CoursePersonalizationContext } from '@/lib/generation/pipeline-types';
import type { ImageGenerationResult } from '@/lib/media/types';
import type { SceneOutline } from '@/lib/types/generation';
import {
  IMAGE_NOTEBOOK_CANVAS_HEIGHT,
  IMAGE_NOTEBOOK_CANVAS_WIDTH,
  formatImageNotebookDensityPolicyForPrompt,
  type ImageNotebookBriefPlan,
  type ImageNotebookQaFinding,
  type ImageNotebookQaResult,
  normalizeImageNotebookBriefPlan,
  normalizeImageNotebookPageBrief,
  resolveImageNotebookDensityPolicyForPageCount,
} from '@/lib/generation/image-notebook-quality';

type StageInfo = {
  id?: string;
  name?: string;
  description?: string;
  language?: 'zh-CN' | 'en-US';
  courseId?: string;
  courseName?: string;
};

type BriefRequestBody = {
  stage?: StageInfo;
  outlines?: SceneOutline[];
  courseContext?: CoursePersonalizationContext;
  language?: 'zh-CN' | 'en-US';
  sourceSummary?: string;
  researchContext?: string;
};

type QaRequestBody = {
  imageUrl?: string;
  imageResult?: ImageGenerationResult;
  pageBrief?: unknown;
  outline?: SceneOutline;
  allOutlines?: SceneOutline[];
  language?: 'zh-CN' | 'en-US';
};

async function resolveVisionQaModel(req: NextRequest): Promise<ResolvedModel> {
  const requested = await resolveModelFromHeadersForNotebookStage(req, 'content', {
    allowOpenAIModelOverride: true,
  });
  if (requested.modelInfo?.capabilities?.vision) return requested;
  return resolveModel({ modelString: 'openai:gpt-4o' }, { allowOpenAIModelOverride: true });
}

function shouldSkipCreditChargeForTestRequest(req: NextRequest): boolean {
  const testRequested = req.headers.get('x-generation-test-no-charge') === 'true';
  if (!testRequested) return false;
  return (
    process.env.NODE_ENV !== 'production' ||
    process.env.SYNTARA_ALLOW_NO_CHARGE_TEST_GENERATION === 'true'
  );
}

function compact(value: unknown, maxLength = 240): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function outlineFallbacks(outlines: SceneOutline[]) {
  return outlines.map((outline, index) => ({
    outlineId: outline.id,
    pageNumber: outline.order > 0 ? outline.order : index + 1,
    title: outline.title,
    description: outline.teachingObjective || outline.studentThinkingMove || outline.description,
    keyPoints: outline.keyPoints,
  }));
}

function buildBriefSystemPrompt(language: 'zh-CN' | 'en-US') {
  if (language === 'en-US') {
    return [
      'You are a senior teacher and visual lesson planner for image-first notebook slides.',
      'Turn a finished outline list into a strict student-facing live classroom plan for full-page generated bitmap slides.',
      'Plan what students should see and think in the moment, not what a teacher would write in a lesson-plan handout.',
      'Return JSON only. Do not include markdown fences.',
    ].join('\n');
  }
  return [
    '你是一位资深老师和整页生图课件导演。',
    '你的任务是把最终 notebook 大纲升级成可直接喂给图片模型的学生视角课堂 brief。',
    '你要规划学生此刻应该看哪里、想什么、下一步怎么来，而不是写给老师看的教案或讲义。',
    '必须输出 JSON，不要 markdown fence，不要解释文字。',
  ].join('\n');
}

function buildBriefUserPrompt(args: {
  stage: StageInfo;
  outlines: SceneOutline[];
  courseContext?: CoursePersonalizationContext;
  language: 'zh-CN' | 'en-US';
  sourceSummary?: string;
  researchContext?: string;
}) {
  const densityPolicy = resolveImageNotebookDensityPolicyForPageCount(args.outlines.length);
  const outlineRows = args.outlines
    .map((outline, index) => {
      const cfg = outline.workedExampleConfig;
      return [
        `Page ${outline.order || index + 1}: ${outline.title}`,
        `type=${outline.type}; archetype=${outline.archetype || 'unknown'}; contentProfile=${outline.contentProfile || 'unknown'}`,
        `description=${compact(outline.description, 420)}`,
        outline.teachingObjective
          ? `teachingObjective=${compact(outline.teachingObjective, 260)}`
          : '',
        outline.studentThinkingMove
          ? `studentThinkingMove=${compact(outline.studentThinkingMove, 260)}`
          : '',
        outline.keyPoints?.length ? `keyPoints=${outline.keyPoints.join(' | ')}` : '',
        cfg
          ? `workedExample=${[
              cfg.kind,
              cfg.role,
              cfg.problemStatement,
              ...(cfg.solutionPlan || []),
              ...(cfg.walkthroughSteps || []),
              cfg.finalAnswer,
            ]
              .filter(Boolean)
              .join(' | ')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');

  return [
    `Notebook: ${args.stage.name || 'Untitled notebook'}`,
    args.stage.description ? `Notebook goal: ${args.stage.description}` : '',
    `Language: ${args.language}`,
    args.courseContext
      ? `Course context: ${[
          args.courseContext.university,
          args.courseContext.courseCode,
          args.courseContext.name,
          args.courseContext.purpose,
          ...(args.courseContext.tags || []),
        ]
          .filter(Boolean)
          .join(' / ')}`
      : '',
    args.sourceSummary ? `Source summary: ${compact(args.sourceSummary, 1600)}` : '',
    args.researchContext ? `Research context: ${compact(args.researchContext, 1200)}` : '',
    `Page density policy:\n${formatImageNotebookDensityPolicyForPrompt(densityPolicy)}`,
    '',
    'Outlines:',
    outlineRows,
    '',
    'Return JSON with this exact shape:',
    `{
  "courseSpine": {
    "logline": "one sentence",
    "centralQuestion": "one question carried through the lesson",
    "acts": [{"id":"act-opening","act":"opening|development|practice|synthesis","title":"...","purpose":"...","pages":[1,2],"keyQuestion":"..."}],
    "closingCallback": "how the final page returns to the central question"
  },
  "pageBriefs": [{
    "outlineId": "must match an input outline id",
    "pageNumber": 1,
    "pageRole": "overview|hook|definition|formula|example|proof|strategy|pitfalls|summary",
    "title": "visible page title",
    "pageMove": {"fromPrevious":"...", "currentJob":"...", "toNext":"...", "callbackToSpine":"..."},
    "visualBrief": "how to draw the whole slide as a classroom board image",
    "visibleContent": {
      "mustShow": ["student-visible exact content, phrased as live classroom board text"],
      "formulas": ["exact formulas or symbolic statements to preserve"],
      "exampleSteps": ["concrete proof/example steps the student should follow, not meta-steps"],
      "commonPitfalls": ["specific mistakes phrased as what to watch for"],
      "bottomTakeaway": "one short student-facing takeaway or next question"
    },
    "focusRegions": [{"id":"focus-setup","label":"区域名","role":"opening|setup|formula|example|proof|strategy|pitfall|takeaway|visual","left":60,"top":110,"width":420,"height":140,"order":1}],
    "generationNotes": ["image-model instructions"],
    "qaChecklist": ["what must be checked after generation"]
  }]
}`,
    '',
    'Hard requirements:',
    '- Every outline must have exactly one pageBrief.',
    `- focusRegions use the 1000 x 562.5 slide coordinate system; create ${densityPolicy.minFocusRegions}-${densityPolicy.maxFocusRegions} broad parent-level regions, not tiny word boxes.`,
    '- Follow the density policy. Short notebooks are overview products, not compressed full lessons.',
    '- For proof/math pages, include exact formulas/statements and concrete proof/example steps.',
    '- First teaching pages must include an overview/hook: why this question matters before giving conclusions.',
    '- visibleContent must be student-facing board text. Write it as questions, givens, partial steps, checks, and next moves that students can read directly.',
    '- Do not put teacher-script prose into visible content; visible content is what appears on the slide.',
    '- Forbidden visible phrases include: 让学生看到, 让学生理解, 教学目标, 本页主线, 可迁移动作, 讲解重点, Page role, Teacher move, QA checklist.',
    '- visualBrief must describe a live teaching moment: one active question or worked step, generous white space, and no dense handout-style summary grid.',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function handleImageNotebookBriefsRequest(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as BriefRequestBody | null;
  if (!body || !Array.isArray(body.outlines) || body.outlines.length === 0) {
    return apiError('MISSING_REQUIRED_FIELD', 400, 'outlines is required and must not be empty');
  }
  const language = body.language || body.stage?.language || body.outlines[0]?.language || 'zh-CN';
  const stage = body.stage || {};
  const skipCreditCharge = shouldSkipCreditChargeForTestRequest(req);
  const { model, modelInfo, modelString } = await resolveModelFromHeadersForNotebookStage(
    req,
    'content',
    { allowOpenAIModelOverride: true },
  );

  const system = buildBriefSystemPrompt(language);
  const prompt = buildBriefUserPrompt({
    stage,
    outlines: body.outlines,
    courseContext: body.courseContext,
    language,
    sourceSummary: body.sourceSummary,
    researchContext: body.researchContext,
  });
  const result = await runWithRequestContext(
    req,
    '/api/generate/image-notebook-briefs',
    () =>
      callLLM(
        {
          model,
          system,
          prompt,
          maxOutputTokens: modelInfo?.outputWindow,
        },
        'image-notebook-briefs',
      ),
    {
      notebookId: stage.id,
      notebookName: stage.name,
      courseId: stage.courseId,
      courseName: stage.courseName || body.courseContext?.name,
      operationCode: skipCreditCharge ? 'generation_quality_test' : 'image_notebook_briefs',
      chargeReason: skipCreditCharge ? '生成测试页面（免积分）' : '生成图片笔记本教师备课 brief',
      skipCreditCharge,
    },
  );
  const parsed = parseJsonResponse<unknown>(result.text);
  if (!parsed) {
    return apiError(
      API_ERROR_CODES.PARSE_FAILED,
      502,
      'Image notebook brief planner returned invalid JSON',
    );
  }
  const plan: ImageNotebookBriefPlan = normalizeImageNotebookBriefPlan(
    parsed,
    outlineFallbacks(body.outlines),
    stage.name || body.courseContext?.name || 'Notebook',
  );
  return apiSuccess({ plan, model: modelString });
}

function findingArray(value: unknown, limit = 12): ImageNotebookQaFinding[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const category =
        record.category === 'math' ||
        record.category === 'text' ||
        record.category === 'layout' ||
        record.category === 'focus' ||
        record.category === 'visual'
          ? record.category
          : 'visual';
      const severity =
        record.severity === 'critical' ||
        record.severity === 'warning' ||
        record.severity === 'info'
          ? record.severity
          : 'warning';
      const message = compact(record.message, 360);
      if (!message) return null;
      return { category, severity, message };
    })
    .filter((item): item is ImageNotebookQaFinding => Boolean(item))
    .slice(0, limit);
}

function normalizeQaResult(
  value: unknown,
  pageBrief: unknown,
  outline?: SceneOutline,
): ImageNotebookQaResult {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const findings = findingArray(record.findings);
  const mathFindings = findingArray(record.mathFindings);
  const visualFindings = findingArray(record.visualFindings);
  const allFindings = [...findings, ...mathFindings, ...visualFindings];
  const parsedPassed = typeof record.passed === 'boolean' ? record.passed : false;
  const passed = parsedPassed && !allFindings.some((finding) => finding.severity === 'critical');
  const revisedFocusRegions =
    Array.isArray(record.revisedFocusRegions) && outline
      ? normalizeImageNotebookPageBrief(
          {
            ...(typeof pageBrief === 'object' && pageBrief ? pageBrief : {}),
            focusRegions: record.revisedFocusRegions,
          },
          {
            outlineId: outline.id,
            pageNumber: outline.order || 1,
            title: outline.title,
            description: outline.description,
            keyPoints: outline.keyPoints,
          },
        ).focusRegions
      : undefined;
  return {
    passed,
    findings,
    mathFindings,
    visualFindings,
    regeneratePromptAddendum: compact(record.regeneratePromptAddendum, 1200) || undefined,
    revisedFocusRegions,
  };
}

function resultToImageSrc(result?: ImageGenerationResult, imageUrl?: string): string {
  if (imageUrl?.trim()) return imageUrl.trim();
  if (result?.base64) {
    return result.base64.startsWith('data:')
      ? result.base64
      : `data:image/png;base64,${result.base64}`;
  }
  return result?.url || '';
}

async function imageSrcToVisionDataUrl(req: NextRequest, src: string): Promise<string> {
  if (!src) return '';
  if (src.startsWith('data:')) return src;
  const url = src.startsWith('/') ? new URL(src, req.url).toString() : src;
  const response = await fetch(url);
  if (!response.ok) return src;
  const contentType = response.headers.get('content-type') || 'image/png';
  const base64 = Buffer.from(await response.arrayBuffer()).toString('base64');
  return `data:${contentType};base64,${base64}`;
}

function buildQaPrompt(args: {
  pageBrief: unknown;
  outline?: SceneOutline;
  allOutlines?: SceneOutline[];
  language: 'zh-CN' | 'en-US';
}) {
  const densityPolicy = resolveImageNotebookDensityPolicyForPageCount(args.allOutlines?.length);
  return [
    'You are reviewing one generated full-page classroom notebook slide image.',
    'Inspect the image itself, not just the prompt. Return JSON only.',
    '',
    `Language expected on slide: ${args.language}`,
    args.outline
      ? `Outline: ${args.outline.title}\nPurpose: ${args.outline.description}\nKey points: ${(args.outline.keyPoints || []).join(' | ')}`
      : '',
    args.outline?.imageNotebookPrompt
      ? `Authoritative drawing prompt:\n${args.outline.imageNotebookPrompt.slice(0, 5000)}`
      : '',
    `Page density policy:\n${formatImageNotebookDensityPolicyForPrompt(densityPolicy)}`,
    `Page brief JSON:\n${JSON.stringify(args.pageBrief, null, 2).slice(0, 6000)}`,
    args.allOutlines?.length
      ? `Neighbor sequence:\n${args.allOutlines
          .slice(0, 20)
          .map((outline) => `${outline.order}. ${outline.title}`)
          .join('\n')}`
      : '',
    '',
    'Check hard requirements:',
    '- 16:9 full slide bitmap, not SVG/HTML/template/screenshot.',
    '- The generated board/background must fill the whole 16:9 image edge-to-edge. Fail if you see pillarboxing, letterboxing, obvious white side bars, a smaller centered sheet, or an outer frame around the slide.',
    '- Looks like a polished live classroom board on grid paper with readable handwritten-style text.',
    '- The slide feels like it is speaking to students in the moment, not like a teacher handout, lesson-plan overview, or after-class summary sheet.',
    '- The visible density must match the page-count policy. For 5 pages or fewer, fail cramped pages that try to teach the full lesson instead of giving an overview route.',
    '- If the drawing prompt names exact visible content such as a definition, code block, original problem, theorem, or formula, the image must show that exact content clearly enough to read.',
    '- Required formulas, symbols, proof/example steps, title, and takeaway are present and correct.',
    '- Text is not tiny, garbled, placeholder, or visually overcrowded.',
    '- Broad visual regions are identifiable for spotlight focus.',
    '- Fail the page if visible text includes teacher-planning/meta phrases such as 让学生, 教学目标, 本页主线, 可迁移动作, 讲解重点, Page role, Teacher move, QA checklist.',
    '- Fail the page if it uses many boxed mini-sections/checklists instead of 2-3 student-facing teaching regions, unless this page is explicitly a final summary.',
    '- Do not treat ordinary problem statements, givens, goals, formulas, or questions as meta language. A phrase like "求出 y 关于 x 的表达式" is valid student-facing math content.',
    '- Do not treat student prompts such as "我们已知什么？", "先判断要求的是函数还是导数？", "先问自己", or "下一步怎么来？" as meta language. Those are good live-teaching phrases.',
    '- When reporting a meta-language failure, quote the exact forbidden phrase that appears in the image. If you cannot quote one, use a layout/visual warning instead of a critical text finding.',
    '- If there is any formula/math/proof error, mark severity critical.',
    '',
    'Return JSON:',
    `{
  "passed": true,
  "findings": [{"category":"text|layout|focus|visual|math","severity":"info|warning|critical","message":"..."}],
  "mathFindings": [],
  "visualFindings": [],
  "regeneratePromptAddendum": "specific correction instructions if not passed",
  "revisedFocusRegions": [{"id":"focus-setup","label":"...","role":"setup","left":60,"top":110,"width":420,"height":140,"order":1}]
}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function handleImageNotebookQaRequest(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as QaRequestBody | null;
  if (!body) return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid request body');
  const imageSrc = resultToImageSrc(body.imageResult, body.imageUrl);
  if (!imageSrc) {
    return apiError(
      API_ERROR_CODES.MISSING_REQUIRED_FIELD,
      400,
      'imageUrl or imageResult is required',
    );
  }
  const language = body.language || body.outline?.language || 'zh-CN';
  const { model, modelInfo, modelString } = await resolveVisionQaModel(req);
  if (!modelInfo?.capabilities?.vision) {
    return apiError(
      API_ERROR_CODES.INVALID_REQUEST,
      400,
      'Image notebook QA requires a vision-capable model, and the automatic vision fallback model is unavailable.',
    );
  }
  const visionSrc = await imageSrcToVisionDataUrl(req, imageSrc);
  const prompt = buildQaPrompt({
    pageBrief: body.pageBrief,
    outline: body.outline,
    allOutlines: body.allOutlines,
    language,
  });
  const skipCreditCharge = shouldSkipCreditChargeForTestRequest(req);
  const result = await runWithRequestContext(
    req,
    '/api/generate/image-notebook-qa',
    () =>
      callLLM(
        {
          model,
          messages: [
            {
              role: 'user',
              content: buildVisionUserContent(
                prompt,
                [
                  {
                    id: 'generated-slide',
                    src: visionSrc,
                    width: body.imageResult?.width || IMAGE_NOTEBOOK_CANVAS_WIDTH,
                    height: body.imageResult?.height || IMAGE_NOTEBOOK_CANVAS_HEIGHT,
                  },
                ],
                language,
              ),
            },
          ],
          maxOutputTokens: modelInfo?.outputWindow,
        },
        'image-notebook-qa',
      ),
    {
      notebookId: body.outline?.id,
      sceneTitle: body.outline?.title,
      sceneOrder: body.outline?.order,
      sceneType: body.outline?.type,
      operationCode: skipCreditCharge ? 'generation_quality_test' : 'image_notebook_qa',
      chargeReason: skipCreditCharge ? '生成测试页面（免积分）' : '检查图片笔记本页面质量',
      skipCreditCharge,
    },
  );
  const parsed = parseJsonResponse<unknown>(result.text);
  if (!parsed) {
    return apiError(API_ERROR_CODES.PARSE_FAILED, 502, 'Image notebook QA returned invalid JSON');
  }
  const qa = normalizeQaResult(parsed, body.pageBrief, body.outline);
  return apiSuccess({ qa, model: modelString });
}
