import type { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import { runWithRequestContext } from '@/lib/server/request-context';
import { resolveModelFromHeadersForNotebookStage } from '@/lib/server/resolve-model';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import type { CoursePersonalizationContext } from '@/lib/generation/pipeline-types';
import type { SceneOutline } from '@/lib/types/generation';
import {
  formatImageNotebookDensityPolicyForPrompt,
  type ImageNotebookBriefPlan,
  normalizeImageNotebookBriefPlan,
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
    "componentPlans": [{
      "id": "component-header",
      "label": "组件标题",
      "role": "header|opening|setup|definition|formula|example|proof|strategy|pitfall|takeaway|visual|question|decoration|other",
      "layoutSlot": "top-full|middle-left|middle-center-left|middle-center-right|middle-right|bottom-full|free",
      "visibleText": ["这个组件里学生真正看见的文字"],
      "formulas": ["这个组件必须准确照写的公式"],
      "diagramPrompt": "这个组件里的图、曲线、表格、代码轨迹或装饰说明",
      "participatesInMask": true
    }],
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
    '- componentPlans must describe the real visible learning components for marker recovery; do not assign marker colors.',
    '- Use at most 6 participatesInMask=true components per page. Decorative sketches must use participatesInMask=false.',
    '- Each participatesInMask=true component must be compact, self-contained, and not split across far-apart islands.',
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
