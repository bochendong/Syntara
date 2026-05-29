import { nanoid } from 'nanoid';
import type { NextRequest } from 'next/server';
import { callLLM, streamLLM } from '@/lib/ai/llm';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import {
  formatImageNotebookDensityPolicyForPrompt,
  formatImageNotebookStyleBriefForPrompt,
  getImageNotebookRequiredWorkedExampleCount,
  normalizeImageNotebookStyleBrief,
  normalizeImageNotebookBriefPlan,
  resolveImageNotebookDensityPolicy,
  type ImageNotebookBriefPlan,
  type ImageNotebookDensityPolicy,
  type ImageNotebookStyleBrief,
} from '@/lib/generation/image-notebook-quality';
import { attachImageNotebookPromptPlans } from '@/lib/generation/image-notebook-prompt-plan';
import type { CoursePersonalizationContext } from '@/lib/generation/pipeline-types';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import { runWithRequestContext, type RequestLLMContext } from '@/lib/server/request-context';
import { resolveModelFromHeadersForNotebookStage } from '@/lib/server/resolve-model';
import type { SceneArchetype, SceneContinuityContext, SceneOutline } from '@/lib/types/generation';

type ImageNotebookPlanRequestBody = {
  requirements?: { requirement?: string; language?: 'zh-CN' | 'en-US'; [key: string]: unknown };
  pdfText?: string;
  researchContext?: string;
  outlinePreferences?: {
    length?: 'minimal' | 'compact' | 'standard' | 'extended';
    includeQuizScenes?: boolean;
    workedExampleLevel?: 'none' | 'light' | 'moderate' | 'heavy';
  } | null;
  notebookContext?: {
    id?: string;
    name?: string;
    courseId?: string;
    courseName?: string;
  };
  coursePurpose?: 'research' | 'university' | 'daily';
  courseContext?: CoursePersonalizationContext;
  style?: {
    label?: string;
    prompt?: string;
    palette?: string;
  };
  imageNotebookStyle?: ImageNotebookStyleBrief;
  drawingStylePrompt?: string;
};

type ImageNotebookPlanQualityReport = {
  passed: boolean;
  minPageCount: number;
  maxPageCount?: number;
  findings: string[];
  blockedPhrases: string[];
  retryCount: number;
};

type ImageNotebookPageIndexItem = {
  pageNumber: number;
  pageRole: string;
  title: string;
  archetype: SceneArchetype;
  currentJob: string;
  keyPoints: string[];
  sourceKnowledgePoints: string[];
  exactContentNeeded: string[];
};

type ImageNotebookPlanStreamEvent =
  | { type: 'status'; detail: string }
  | {
      type: 'draft';
      phase: 'blueprint' | 'batch';
      detail: string;
      text: string;
      batchIndex?: number;
      pageNumbers?: number[];
      attempt?: number;
    }
  | {
      type: 'blueprint';
      courseSpine: ImageNotebookBriefPlan['courseSpine'];
      pageIndex: ImageNotebookPageIndexItem[];
      quality: ImageNotebookPlanQualityReport;
      attempt: number;
    }
  | {
      type: 'batch-start';
      batchIndex: number;
      batchCount: number;
      pageNumbers: number[];
      startPage: number;
      endPage: number;
      attempt: number;
    }
  | {
      type: 'pages';
      batchIndex: number;
      batchCount: number;
      pageNumbers: number[];
      startPage: number;
      endPage: number;
      outlines: SceneOutline[];
      pageBriefs: ImageNotebookBriefPlan['pageBriefs'];
    }
  | { type: 'quality'; quality: ImageNotebookPlanQualityReport }
  | {
      type: 'done';
      outlines: SceneOutline[];
      plan: ImageNotebookBriefPlan;
      plannerMode: 'batched';
      planBatchCount: number;
      planQuality: ImageNotebookPlanQualityReport;
      planQualityAttempts: ImageNotebookPlanQualityReport[];
      model: string;
    }
  | { type: 'error'; error: string };

const FORBIDDEN_PLANNING_PHRASES = [
  'MAT136 是本节课材料里的具体对象',
  '本节课材料里的具体对象',
  '先解释它代表什么，再讲表示方法',
  '这一行为什么成立',
  '定义里对象范围',
  '写证明前，先把定义改写成可以逐项检查的条件',
  '例题要留下',
  '数学课开场先定位对象',
  '总结要留下可执行的证明 checklist',
  '教学目标',
  '本页主线',
  '讲解重点',
  '可迁移动作',
];

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function textArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const v = text(item);
    if (!v) continue;
    out.push(cleanPlanningText(v));
    if (out.length >= limit) break;
  }
  return out;
}

function cleanPlanningText(value: string): string {
  return value
    .replace(/\bMAT136\s+是本节课材料里的具体对象；?先解释它代表什么，再讲表示方法。?/g, '')
    .replace(/本节课材料里的具体对象；?先解释它代表什么，再讲表示方法。?/g, '')
    .replace(/这一行为什么成立：用了哪个已知、定义，还是前一行结果？?/g, '')
    .replace(/这一步为什么成立：用了哪个已知、定义，还是前一行结果？?/g, '')
    .replace(/定义里对象范围、存在条件、唯一性或包含关系分别在哪里？?/g, '')
    .replace(/写证明前，先把定义改写成可以逐项检查的条件。?/g, '')
    .replace(/例题要留下“为什么能走这一步”，不是只留下答案。?/g, '')
    .replace(/数学课开场先定位对象、条件和要判断的问题。?/g, '')
    .replace(/总结要留下可执行的证明 checklist，而不是术语表。?/gi, '')
    .replace(/总结要留下可执行的证明 checklist。?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberInRange(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, n));
}

function pageArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = objectRecord(value);
  if (Array.isArray(record.pagePlans)) return record.pagePlans;
  if (Array.isArray(record.pages)) return record.pages;
  if (Array.isArray(record.slidePlans)) return record.slidePlans;
  return [];
}

function validSceneType(value: unknown): SceneOutline['type'] {
  return value === 'quiz' || value === 'interactive' || value === 'pbl' ? value : 'slide';
}

function validArchetype(value: unknown, pageRole?: string): SceneArchetype {
  if (
    value === 'intro' ||
    value === 'concept' ||
    value === 'definition' ||
    value === 'example' ||
    value === 'bridge' ||
    value === 'summary'
  ) {
    return value;
  }
  if (pageRole === 'overview' || pageRole === 'hook') return 'intro';
  if (pageRole === 'example' || pageRole === 'proof') return 'example';
  if (pageRole === 'summary') return 'summary';
  return 'concept';
}

function validContentProfile(value: unknown): SceneOutline['contentProfile'] {
  return value === 'code' || value === 'math' || value === 'general' ? value : 'math';
}

function normalizeContinuity(
  raw: Record<string, unknown>,
  pageMove: Record<string, unknown>,
  description: string,
): SceneContinuityContext | undefined {
  const previousHandoff = cleanPlanningText(
    text(raw.previousHandoff) || text(pageMove.fromPrevious),
  );
  const currentJob = cleanPlanningText(
    text(raw.currentJob) || text(pageMove.currentJob) || description,
  );
  const nextHandoff = cleanPlanningText(text(raw.nextHandoff) || text(pageMove.toNext));
  const usesExampleIds = textArray(raw.usesExampleIds, 8);
  if (!previousHandoff && !currentJob && !nextHandoff && !usesExampleIds.length) return undefined;
  return {
    ...(usesExampleIds.length ? { usesExampleIds } : {}),
    ...(previousHandoff ? { previousHandoff } : {}),
    ...(currentJob ? { currentJob } : {}),
    ...(nextHandoff ? { nextHandoff } : {}),
  };
}

function normalizeWorkedExample(value: unknown): SceneOutline['workedExampleConfig'] | undefined {
  const record = objectRecord(value);
  const problemStatement = cleanPlanningText(text(record.problemStatement));
  const solutionPlan = textArray(record.solutionPlan, 8);
  const walkthroughSteps = textArray(record.walkthroughSteps, 12);
  if (!problemStatement && solutionPlan.length < 2 && walkthroughSteps.length < 2) return undefined;
  const role =
    record.role === 'problem_statement' ||
    record.role === 'givens_and_goal' ||
    record.role === 'constraints' ||
    record.role === 'solution_plan' ||
    record.role === 'walkthrough' ||
    record.role === 'pitfalls' ||
    record.role === 'summary'
      ? record.role
      : 'walkthrough';
  const kind =
    record.kind === 'code' ||
    record.kind === 'proof' ||
    record.kind === 'math' ||
    record.kind === 'case_analysis' ||
    record.kind === 'general'
      ? record.kind
      : 'math';
  return {
    kind,
    role,
    exampleId: text(record.exampleId) || undefined,
    partNumber: typeof record.partNumber === 'number' ? record.partNumber : undefined,
    totalParts: typeof record.totalParts === 'number' ? record.totalParts : undefined,
    problemStatement,
    givens: textArray(record.givens, 8),
    asks: textArray(record.asks, 6),
    constraints: textArray(record.constraints, 6),
    solutionPlan,
    walkthroughSteps,
    commonPitfalls: textArray(record.commonPitfalls, 8),
    finalAnswer: cleanPlanningText(text(record.finalAnswer)) || undefined,
    codeSnippet: text(record.codeSnippet) || undefined,
  };
}

function normalizeFullPlan(
  parsed: unknown,
  args: {
    language: 'zh-CN' | 'en-US';
    notebookTitle: string;
  },
): { outlines: SceneOutline[]; plan: ImageNotebookBriefPlan } {
  const record = objectRecord(parsed);
  const rawPages = pageArray(record);
  const outlines = rawPages.map((item, index): SceneOutline => {
    const page = objectRecord(item);
    const rawOutline = objectRecord(page.outline || page.sceneOutline);
    const rawBrief = objectRecord(page.brief || page.imageNotebookBrief || page.pageBrief);
    const visible = objectRecord(rawBrief.visibleContent);
    const pageMove = objectRecord(rawBrief.pageMove || rawOutline.pageMove);
    const pageNumber = numberInRange(
      page.pageNumber || rawOutline.order || rawBrief.pageNumber,
      1,
      200,
      index + 1,
    );
    const id =
      cleanPlanningText(text(rawOutline.id || page.outlineId)) || `image-plan-${nanoid(8)}`;
    const pageRole = text(rawBrief.pageRole || rawOutline.pageRole);
    const title =
      cleanPlanningText(text(rawOutline.title || rawBrief.title || page.title)) ||
      `${args.notebookTitle} ${index + 1}`;
    const keyPoints =
      textArray(rawOutline.keyPoints, 6).length > 0
        ? textArray(rawOutline.keyPoints, 6)
        : textArray(visible.mustShow, 6);
    const description =
      cleanPlanningText(text(rawOutline.description)) ||
      cleanPlanningText(text(pageMove.currentJob)) ||
      keyPoints[0] ||
      title;
    const continuity = normalizeContinuity(
      objectRecord(rawOutline.continuity),
      pageMove,
      description,
    );
    return {
      id,
      type: validSceneType(rawOutline.type),
      contentProfile: validContentProfile(rawOutline.contentProfile),
      archetype: validArchetype(rawOutline.archetype, pageRole),
      title,
      description,
      keyPoints: keyPoints.length ? keyPoints : [description],
      teachingObjective: cleanPlanningText(text(rawOutline.teachingObjective)) || undefined,
      studentThinkingMove: cleanPlanningText(text(rawOutline.studentThinkingMove)) || undefined,
      sharedExamples: Array.isArray(rawOutline.sharedExamples)
        ? (rawOutline.sharedExamples as SceneOutline['sharedExamples'])
        : undefined,
      imageNotebookPrompt: text(
        page.imagePrompt || page.drawingPrompt || rawOutline.imageNotebookPrompt,
      )
        ? text(page.imagePrompt || page.drawingPrompt || rawOutline.imageNotebookPrompt)
        : undefined,
      usesExampleIds: textArray(rawOutline.usesExampleIds, 8),
      continuity,
      estimatedDuration:
        typeof rawOutline.estimatedDuration === 'number' ? rawOutline.estimatedDuration : undefined,
      order: pageNumber,
      language: args.language,
      workedExampleConfig: normalizeWorkedExample(rawOutline.workedExampleConfig),
    };
  });
  const fallbacks = outlines.map((outline) => ({
    outlineId: outline.id,
    pageNumber: outline.order,
    title: outline.title,
    description: outline.teachingObjective || outline.studentThinkingMove || outline.description,
    keyPoints: outline.keyPoints,
  }));
  const pageBriefs = rawPages.map((item, index) => {
    const page = objectRecord(item);
    const rawBrief = objectRecord(page.brief || page.imageNotebookBrief || page.pageBrief);
    const outline = outlines[index];
    return {
      ...rawBrief,
      outlineId: outline?.id,
      pageNumber: outline?.order || index + 1,
      title: cleanPlanningText(text(rawBrief.title)) || outline?.title,
    };
  });
  const plan = normalizeImageNotebookBriefPlan(
    {
      courseSpine: record.courseSpine,
      pageBriefs,
    },
    fallbacks,
    args.notebookTitle,
  );
  return {
    outlines: outlines.map((outline) => ({
      ...outline,
      imageNotebookCourseSpine: plan.courseSpine,
      imageNotebookBrief: plan.pageBriefs.find((brief) => brief.outlineId === outline.id),
    })),
    plan,
  };
}

function explicitPageMinimum(requirement: string): number {
  const explicit =
    requirement.match(/至少\s*(\d+)\s*页/) ||
    requirement.match(/不少于\s*(\d+)\s*页/) ||
    requirement.match(/(\d+)\s*页以上/) ||
    requirement.match(/at least\s*(\d+)\s*(?:pages|slides|scenes)/i);
  return explicit ? Number(explicit[1]) : 0;
}

function explicitPageMaximum(requirement: string): number | undefined {
  const exclusive =
    requirement.match(/(?:少于|小于|低于)\s*(\d+)\s*页/) ||
    requirement.match(/(?:less than|under)\s*(\d+)\s*(?:pages|slides|scenes)/i);
  if (exclusive) return Math.max(1, Number(exclusive[1]) - 1);

  const inclusive =
    requirement.match(/(?:不超过|最多|至多)\s*(\d+)\s*页/) ||
    requirement.match(/(\d+)\s*页(?:以下|以内|之内)/) ||
    requirement.match(/(?:up to|no more than|at most)\s*(\d+)\s*(?:pages|slides|scenes)/i);
  return inclusive ? Number(inclusive[1]) : undefined;
}

function inferPageCountBounds(body: ImageNotebookPlanRequestBody): {
  min: number;
  max?: number;
  policy: ImageNotebookDensityPolicy;
} {
  const requirement = body.requirements?.requirement || '';
  const policy = resolveImageNotebookDensityPolicy(body.outlinePreferences?.length);
  const hasLengthPreference = Boolean(body.outlinePreferences?.length);
  const isDifferentialEquation =
    /微分方程|differential equation|dy\/dx|slope field|斜率场|Euler|欧拉|FTC|初值/.test(
      [requirement, body.pdfText || ''].join('\n'),
    );
  const explicitMin = explicitPageMinimum(requirement);
  const explicitMax = explicitPageMaximum(requirement);
  const min = Math.max(
    explicitMin || 0,
    hasLengthPreference ? policy.minPages : 0,
    !hasLengthPreference && isDifferentialEquation ? 12 : 0,
  );
  let max = explicitMax ?? (hasLengthPreference ? policy.maxPages : undefined);
  if (max != null && min > max) max = undefined;
  return { min, max, policy };
}

function inferMinPageCount(body: ImageNotebookPlanRequestBody): number {
  return inferPageCountBounds(body).min;
}

function pageCountRequirementText(body: ImageNotebookPlanRequestBody): string {
  const bounds = inferPageCountBounds(body);
  if (bounds.min > 0 && bounds.max != null) {
    return `Generate ${bounds.min}-${bounds.max} pages. Do not exceed ${bounds.max} pages for this length profile.`;
  }
  if (bounds.min > 0) return `Generate at least ${bounds.min} pages.`;
  if (bounds.max != null) return `Generate no more than ${bounds.max} pages.`;
  return '';
}

function stylePromptFromBody(body: ImageNotebookPlanRequestBody): string | undefined {
  return (
    [body.style?.label, body.style?.prompt, body.style?.palette, body.drawingStylePrompt]
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .join('\n')
      .trim() || undefined
  );
}

function styleBriefFromBody(body: ImageNotebookPlanRequestBody): ImageNotebookStyleBrief {
  return normalizeImageNotebookStyleBrief(body.imageNotebookStyle, stylePromptFromBody(body));
}

function combinedPlanText(outlines: SceneOutline[], plan: ImageNotebookBriefPlan): string {
  return [
    ...outlines.flatMap((outline) => [
      outline.title,
      outline.description,
      outline.teachingObjective,
      outline.studentThinkingMove,
      ...(outline.keyPoints || []),
      outline.continuity?.previousHandoff,
      outline.continuity?.currentJob,
      outline.continuity?.nextHandoff,
      outline.workedExampleConfig?.problemStatement,
      ...(outline.workedExampleConfig?.solutionPlan || []),
      ...(outline.workedExampleConfig?.walkthroughSteps || []),
      outline.workedExampleConfig?.finalAnswer,
    ]),
    plan.courseSpine.logline,
    plan.courseSpine.centralQuestion,
    plan.courseSpine.closingCallback,
    ...plan.pageBriefs.flatMap((brief) => [
      brief.title,
      brief.pageMove.fromPrevious,
      brief.pageMove.currentJob,
      brief.pageMove.toNext,
      brief.pageMove.callbackToSpine,
      brief.visualBrief,
      ...(brief.visibleContent.mustShow || []),
      ...(brief.visibleContent.formulas || []),
      ...(brief.visibleContent.exampleSteps || []),
      ...(brief.visibleContent.commonPitfalls || []),
      brief.visibleContent.bottomTakeaway,
    ]),
  ]
    .filter(Boolean)
    .join('\n');
}

function hasWorkedExampleDetails(outline: SceneOutline): boolean {
  const cfg = outline.workedExampleConfig;
  return Boolean(
    cfg?.problemStatement &&
    ((cfg.walkthroughSteps?.length || 0) >= 2 || (cfg.solutionPlan?.length || 0) >= 2),
  );
}

function assessFullPlanQuality(
  outlines: SceneOutline[],
  plan: ImageNotebookBriefPlan,
  body: ImageNotebookPlanRequestBody,
  retryCount: number,
): ImageNotebookPlanQualityReport {
  const findings: string[] = [];
  const blockedPhrases: string[] = [];
  const pageBounds = inferPageCountBounds(body);
  const { min: minPageCount, max: maxPageCount, policy } = pageBounds;
  const combined = combinedPlanText(outlines, plan);
  if (minPageCount > 0 && outlines.length < minPageCount) {
    findings.push(`页数不足：生成 ${outlines.length} 页，但要求至少 ${minPageCount} 页。`);
  }
  if (maxPageCount != null && outlines.length > maxPageCount) {
    findings.push(
      `页数超过档位：${policy.label} 应控制在 ${policy.pageRangeText}，目前生成 ${outlines.length} 页。`,
    );
  }
  for (const phrase of FORBIDDEN_PLANNING_PHRASES) {
    if (combined.includes(phrase)) blockedPhrases.push(phrase);
  }
  if (blockedPhrases.length) {
    findings.push(`出现禁用模板句：${Array.from(new Set(blockedPhrases)).join('、')}。`);
  }
  if (/\bderek\b|[#&]{2,}|[!]{2,}/i.test(combined)) {
    findings.push('疑似 PDF 公式提取噪声进入页面规划字段。');
  }
  const firstBrief = plan.pageBriefs[0];
  if (firstBrief && !/overview|hook/.test(firstBrief.pageRole)) {
    findings.push('第一页不是 overview/hook，容易变成直接讲义页。');
  }
  const last = outlines[outlines.length - 1];
  if (last && !/总结|回顾|checklist|检查|下一节|钩子|summary|recap/i.test(last.title)) {
    findings.push('最后一页不是总结/迁移/下节课钩子。');
  }
  const requiredExamples = getImageNotebookRequiredWorkedExampleCount({
    length: body.outlinePreferences?.length,
    workedExampleLevel: body.outlinePreferences?.workedExampleLevel,
  });
  const detailedExamples = outlines.filter(
    (outline) => outline.archetype === 'example' && hasWorkedExampleDetails(outline),
  );
  if (detailedExamples.length < requiredExamples) {
    findings.push(
      `完整例题不足：需要至少 ${requiredExamples} 组带题目和步骤的 workedExampleConfig，目前 ${detailedExamples.length} 组。`,
    );
  }
  if (policy.maxDetailedExamples != null && detailedExamples.length > policy.maxDetailedExamples) {
    findings.push(
      `完整例题过多：${policy.label} 最多 ${policy.maxDetailedExamples} 组完整例题，目前 ${detailedExamples.length} 组，容易把 overview 压成密集讲义。`,
    );
  }
  const overLimitSourceComponents = outlines.filter((outline) => {
    const sourceComponents = outline.imageNotebookBrief?.componentPlans || [];
    const maskable = sourceComponents.filter(
      (component) => component.participatesInMask !== false && component.role !== 'decoration',
    );
    return maskable.length > 6;
  });
  if (overLimitSourceComponents.length) {
    findings.push(
      `有 ${overLimitSourceComponents.length} 页原始组件计划超过 6 个可遮罩组件；必须合并组件或拆页，不能静默丢 marker。`,
    );
  }
  const missingPromptPlans = outlines.filter(
    (outline) => !outline.imageNotebookPromptPlan?.compiledImagePrompt,
  );
  if (missingPromptPlans.length) {
    findings.push(`有 ${missingPromptPlans.length} 页缺少 prompt-plan 编译结果。`);
  }
  const weakComponentPlans = outlines.filter((outline) => {
    const components = outline.imageNotebookPromptPlan?.componentPlans || [];
    const maskable = components.filter((component) => component.participatesInMask);
    return (
      maskable.length === 0 ||
      maskable.length > 6 ||
      maskable.some(
        (component) =>
          !component.label.trim() ||
          (!component.visibleText.length && !component.formulas.length && !component.diagramPrompt),
      )
    );
  });
  if (weakComponentPlans.length) {
    findings.push(
      `有 ${weakComponentPlans.length} 页组件计划不合规：需要 1-6 个带内容的可遮罩学习组件。`,
    );
  }
  const missingBriefs = outlines.filter(
    (outline) => !plan.pageBriefs.some((brief) => brief.outlineId === outline.id),
  );
  if (missingBriefs.length) {
    findings.push(`有 ${missingBriefs.length} 页缺少 imageNotebookBrief。`);
  }
  const weakFocus = plan.pageBriefs.filter(
    (brief) =>
      brief.focusRegions.length < policy.minFocusRegions ||
      brief.focusRegions.length > policy.maxFocusRegions,
  );
  if (weakFocus.length) {
    findings.push(
      `有 ${weakFocus.length} 页 focusRegions 数量不符合 ${policy.label} 的 ${policy.minFocusRegions}-${policy.maxFocusRegions} 个父级区域范围。`,
    );
  }
  const denseBriefs = plan.pageBriefs.filter(
    (brief) =>
      brief.visibleContent.mustShow.length > policy.maxMustShow ||
      brief.visibleContent.formulas.length > policy.maxFormulas ||
      brief.visibleContent.exampleSteps.length > policy.maxExampleSteps,
  );
  if (denseBriefs.length) {
    findings.push(
      `有 ${denseBriefs.length} 页 visibleContent 超过 ${policy.label} 密度上限：每页最多 ${policy.maxMustShow} 条 mustShow、${policy.maxFormulas} 条公式、${policy.maxExampleSteps} 条例题/证明步骤。`,
    );
  }
  return {
    passed: findings.length === 0,
    minPageCount,
    ...(maxPageCount != null ? { maxPageCount } : {}),
    findings,
    blockedPhrases: Array.from(new Set(blockedPhrases)),
    retryCount,
  };
}

function buildSystemPrompt(language: 'zh-CN' | 'en-US'): string {
  if (language === 'en-US') {
    return [
      'You are a senior teacher and full-page generated notebook planner.',
      'Generate the complete page-level plan first, then derive compatibility outlines from that same plan.',
      'The output will directly drive image generation, focus masks, and narration.',
      'Return JSON only. Do not include markdown fences.',
    ].join('\n');
  }
  return [
    '你是一位资深老师、课堂板书导演和整页生图 notebook 规划器。',
    '不要先写松散目录；请一次性生成整本逐页页面规划，再从同一份规划派生兼容旧系统的大纲字段。',
    '这些规划会直接进入整页图片生成、遮罩区域和讲解稿，所以每页必须像真实课堂推进，而不是教案摘要。',
    '必须输出 JSON，不要 markdown fence，不要解释文字。',
  ].join('\n');
}

function buildUserPrompt(args: {
  body: ImageNotebookPlanRequestBody;
  language: 'zh-CN' | 'en-US';
  retryFindings?: string[];
  previousTitles?: string[];
}): string {
  const requirement = args.body.requirements?.requirement || '';
  const pageCountRequirement = pageCountRequirementText(args.body);
  const densityPolicy = inferPageCountBounds(args.body).policy;
  const styleBrief = styleBriefFromBody(args.body);
  const courseContext = args.body.courseContext
    ? [
        args.body.courseContext.university,
        args.body.courseContext.courseCode,
        args.body.courseContext.name,
        args.body.courseContext.purpose,
        ...(args.body.courseContext.tags || []),
      ]
        .filter(Boolean)
        .join(' / ')
    : '';
  return [
    `Language: ${args.language}`,
    args.body.notebookContext?.name ? `Notebook: ${args.body.notebookContext.name}` : '',
    courseContext ? `Course context: ${courseContext}` : '',
    `Requirement:\n${requirement}`,
    args.body.pdfText ? `Source text excerpt:\n${args.body.pdfText.slice(0, 8000)}` : '',
    args.body.researchContext
      ? `Research context:\n${args.body.researchContext.slice(0, 2400)}`
      : '',
    `Page style brief for planner context:\n${formatImageNotebookStyleBriefForPrompt(styleBrief).join('\n')}`,
    `Page count and density policy:\n${formatImageNotebookDensityPolicyForPrompt(densityPolicy)}`,
    args.retryFindings?.length
      ? `Previous plan failed QA. Fix all issues:\n${args.retryFindings.map((item) => `- ${item}`).join('\n')}`
      : '',
    args.previousTitles?.length
      ? `Previous titles, for reference only:\n${args.previousTitles
          .map((title, index) => `${index + 1}. ${title}`)
          .join('\n')}`
      : '',
    '',
    'Return JSON with this exact shape:',
    `{
  "courseSpine": {
    "logline": "整课一句话主线",
    "centralQuestion": "贯穿整课的学生问题",
    "acts": [{"id":"act-opening","act":"opening|development|practice|synthesis","title":"...","purpose":"...","pages":[1,2],"keyQuestion":"..."}],
    "closingCallback": "最后如何回到 centralQuestion，并留下下一节钩子"
  },
  "pagePlans": [{
    "outline": {
      "id": "stable-page-id",
      "type": "slide",
      "contentProfile": "math|code|general",
      "archetype": "intro|concept|definition|example|bridge|summary",
      "title": "页面标题",
      "description": "本页课堂目的，用学生视角写",
      "keyPoints": ["学生可见核心内容，不是老师教案；数量必须符合当前密度档位"],
      "teachingObjective": "本页学生学会做什么",
      "studentThinkingMove": "学生先看什么、怎么判断",
      "continuity": {"previousHandoff":"...", "currentJob":"...", "nextHandoff":"..."},
      "workedExampleConfig": {
        "kind": "math|proof|general",
        "role": "walkthrough",
        "problemStatement": "完整题目",
        "givens": ["..."],
        "asks": ["..."],
        "solutionPlan": ["2-4 条策略"],
        "walkthroughSteps": ["3-7 条连续步骤"],
        "commonPitfalls": ["1-3 条易错点"],
        "finalAnswer": "..."
      }
    },
    "brief": {
      "pageRole": "overview|hook|definition|formula|example|proof|strategy|pitfalls|summary",
      "title": "图片上的标题",
      "pageMove": {"fromPrevious":"...", "currentJob":"...", "toNext":"...", "callbackToSpine":"..."},
      "visualBrief": "整页生图说明：网格纸、手写板书、分区、具体图像和教学意图",
      "visibleContent": {
        "mustShow": ["必须出现在图上的学生可见文本；数量必须符合当前密度档位"],
        "formulas": ["必须准确照写的公式；数量必须符合当前密度档位"],
        "exampleSteps": ["例题/证明连续步骤；数量必须符合当前密度档位"],
        "commonPitfalls": ["0-3 条图上可以提示的易错点"],
        "bottomTakeaway": "底部收束或下一页问题"
      },
      "focusRegions": [{"id":"focus-setup","label":"大区域名","role":"opening|setup|formula|example|proof|strategy|pitfall|takeaway|visual","left":60,"top":110,"width":420,"height":140,"order":1}],
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
      "generationNotes": ["0-3 条给图片模型的注意事项"],
      "qaChecklist": ["0-3 条生成后必须检查什么"]
    }
  }]
}`,
    '',
    'Hard requirements:',
    pageCountRequirement ? `- ${pageCountRequirement}` : '',
    '- Page 1 must be an overview/hook page, not a title-only cover and not a full solution page.',
    '- Do not add a separate decorative cover. The first page is a real overview that frames the student problem.',
    '- Every page must have one pagePlans item with both outline and brief.',
    '- Do not write the final image prompt. The system will compile the final prompt deterministically from brief.componentPlans.',
    '- brief.componentPlans must contain the visual learning components, not marker colors. Marker colors are assigned by code.',
    '- Use at most 6 participatesInMask=true learning components per page. Extra decorative elements must use participatesInMask=false.',
    '- Keep every string compact. Prefer short classroom board phrases over paragraphs.',
    '- Follow the page-count density profile exactly. Short notebooks are overview products, not compressed full lessons.',
    '- brief.visibleContent is exactly what the image should show. It must be student-facing board content, not planning labels.',
    '- For math pages, formulas must be exact and exampleSteps must include enough intermediate steps for class teaching.',
    `- focusRegions must contain ${densityPolicy.minFocusRegions}-${densityPolicy.maxFocusRegions} broad parent-level regions in a 1000 x 562.5 coordinate system.`,
    '- componentPlans must be compact, self-contained, and not split one learning component into multiple far-apart islands.',
    '- Do not use these phrases anywhere: MAT136 是本节课材料里的具体对象, 这一行为什么成立, 定义里对象范围, 写证明前，先把定义改写成可以逐项检查的条件, 例题要留下, 总结要留下可执行的证明 checklist, 教学目标, 本页主线, 讲解重点, 可迁移动作.',
    '- Do not copy PDF extraction noise such as derek, ###, &&, or repeated punctuation.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function buildBlueprintPrompt(args: {
  body: ImageNotebookPlanRequestBody;
  language: 'zh-CN' | 'en-US';
  retryFindings?: string[];
}): string {
  const requirement = args.body.requirements?.requirement || '';
  const pageCountRequirement = pageCountRequirementText(args.body);
  const densityPolicy = inferPageCountBounds(args.body).policy;
  const styleBrief = styleBriefFromBody(args.body);
  const courseContext = args.body.courseContext
    ? [
        args.body.courseContext.university,
        args.body.courseContext.courseCode,
        args.body.courseContext.name,
        args.body.courseContext.purpose,
        ...(args.body.courseContext.tags || []),
      ]
        .filter(Boolean)
        .join(' / ')
    : '';
  return [
    `Language: ${args.language}`,
    args.body.notebookContext?.name ? `Notebook: ${args.body.notebookContext.name}` : '',
    courseContext ? `Course context: ${courseContext}` : '',
    `Requirement:\n${requirement}`,
    args.body.pdfText ? `Source text excerpt:\n${args.body.pdfText.slice(0, 8000)}` : '',
    args.body.researchContext
      ? `Research context:\n${args.body.researchContext.slice(0, 2400)}`
      : '',
    `Page style brief for planner context:\n${formatImageNotebookStyleBriefForPrompt(styleBrief).join('\n')}`,
    `Page count and density policy:\n${formatImageNotebookDensityPolicyForPrompt(densityPolicy)}`,
    args.retryFindings?.length
      ? `Previous blueprint failed QA. Fix all issues:\n${args.retryFindings.map((item) => `- ${item}`).join('\n')}`
      : '',
    '',
    'Return JSON only with this exact compact shape:',
    `{
  "courseSpine": {
    "logline": "整课一句话主线",
    "centralQuestion": "贯穿整课的学生问题",
    "acts": [{"id":"act-opening","act":"opening|development|practice|synthesis","title":"...","purpose":"...","pages":[1,2],"keyQuestion":"..."}],
    "closingCallback": "最后如何回到 centralQuestion，并留下下一节钩子"
  },
  "pageIndex": [{
    "pageNumber": 1,
    "pageRole": "overview|hook|definition|formula|example|proof|strategy|pitfalls|summary",
    "archetype": "intro|concept|definition|example|bridge|summary",
    "title": "页面标题",
    "currentJob": "这一页课堂上完成什么",
    "sourceKnowledgePoints": ["这一页覆盖源文件里的哪些知识点、定义、公式、题目、代码或图示"],
    "exactContentNeeded": ["后续画图 prompt 必须逐字保留的内容类型，例如完整定义、完整代码、原题、公式"],
    "keyPoints": ["少量页面内容锚点"]
  }]
}`,
    '',
    'Hard requirements:',
    pageCountRequirement ? `- pageIndex must satisfy: ${pageCountRequirement}` : '',
    '- Page 1 must be overview or hook, not a title-only cover and not a solved example.',
    '- Include a logical teacher flow appropriate to the length profile. For 5 pages or fewer, use hook/why -> route map -> core choice/comparison -> one light anchor example if needed -> summary/hook.',
    '- For 10+ page notebooks, expand definitions, examples, proofs, pitfalls, and practice by splitting them across pages instead of making any one page dense.',
    '- Do not include detailed focusRegions or drawing layout here. This is only the compact page plan.',
    '- For every page, say which source-file knowledge points it covers. Do not use vague labels like "a derivative problem"; name the exact definition, theorem, code block, formula, original problem, or figure type needed later.',
    '- Do not use these phrases anywhere: MAT136 是本节课材料里的具体对象, 这一行为什么成立, 定义里对象范围, 写证明前，先把定义改写成可以逐项检查的条件, 例题要留下, 总结要留下可执行的证明 checklist, 教学目标, 本页主线, 讲解重点, 可迁移动作.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function normalizePageIndexItem(value: unknown, index: number): ImageNotebookPageIndexItem {
  const record = objectRecord(value);
  const pageRole = cleanPlanningText(text(record.pageRole, index === 0 ? 'overview' : 'concept'));
  const title = cleanPlanningText(text(record.title, `第 ${index + 1} 页`));
  const currentJob = cleanPlanningText(text(record.currentJob, title));
  return {
    pageNumber: numberInRange(record.pageNumber, 1, 200, index + 1),
    pageRole,
    title,
    archetype: validArchetype(record.archetype, pageRole),
    currentJob,
    keyPoints: textArray(record.keyPoints, 5),
    sourceKnowledgePoints: textArray(record.sourceKnowledgePoints, 6),
    exactContentNeeded: textArray(record.exactContentNeeded, 6),
  };
}

function normalizeBlueprint(
  parsed: unknown,
  body: ImageNotebookPlanRequestBody,
  notebookTitle: string,
): { courseSpine: ImageNotebookBriefPlan['courseSpine']; pageIndex: ImageNotebookPageIndexItem[] } {
  const record = objectRecord(parsed);
  const rawPageIndex = Array.isArray(record.pageIndex) ? record.pageIndex : pageArray(record);
  const pageIndex = rawPageIndex
    .map((item, index) => normalizePageIndexItem(item, index))
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .map((item, index) => ({ ...item, pageNumber: index + 1 }));
  const fallbackBriefs = pageIndex.map((item) => ({
    outlineId: `page-${item.pageNumber}`,
    pageNumber: item.pageNumber,
    title: item.title,
    description: item.currentJob,
    keyPoints: item.keyPoints,
  }));
  const plan = normalizeImageNotebookBriefPlan(
    { courseSpine: record.courseSpine, pageBriefs: [] },
    fallbackBriefs,
    notebookTitle,
  );
  return {
    courseSpine: plan.courseSpine,
    pageIndex:
      pageIndex.length > 0
        ? pageIndex
        : [
            {
              pageNumber: 1,
              pageRole: 'overview',
              title: notebookTitle,
              archetype: 'intro',
              currentJob: body.requirements?.requirement || notebookTitle,
              keyPoints: [body.requirements?.requirement || notebookTitle],
              sourceKnowledgePoints: [body.requirements?.requirement || notebookTitle],
              exactContentNeeded: ['本页需要从源文件保留的定义、公式、代码或题目原文。'],
            },
          ],
  };
}

function assessBlueprintQuality(
  blueprint: {
    courseSpine: ImageNotebookBriefPlan['courseSpine'];
    pageIndex: ImageNotebookPageIndexItem[];
  },
  body: ImageNotebookPlanRequestBody,
  retryCount: number,
): ImageNotebookPlanQualityReport {
  const findings: string[] = [];
  const blockedPhrases: string[] = [];
  const pageBounds = inferPageCountBounds(body);
  const { min: minPageCount, max: maxPageCount, policy } = pageBounds;
  const combined = [
    blueprint.courseSpine.logline,
    blueprint.courseSpine.centralQuestion,
    blueprint.courseSpine.closingCallback,
    ...blueprint.pageIndex.flatMap((page) => [
      page.title,
      page.pageRole,
      page.currentJob,
      ...page.sourceKnowledgePoints,
      ...page.exactContentNeeded,
      ...page.keyPoints,
    ]),
  ].join('\n');
  if (minPageCount > 0 && blueprint.pageIndex.length < minPageCount) {
    findings.push(
      `页数不足：生成 ${blueprint.pageIndex.length} 页，但要求至少 ${minPageCount} 页。`,
    );
  }
  if (maxPageCount != null && blueprint.pageIndex.length > maxPageCount) {
    findings.push(
      `页数超过档位：${policy.label} 应控制在 ${policy.pageRangeText}，目前生成 ${blueprint.pageIndex.length} 页。`,
    );
  }
  const first = blueprint.pageIndex[0];
  if (first && !/overview|hook/.test(first.pageRole)) {
    findings.push('第一页不是 overview/hook。');
  }
  const last = blueprint.pageIndex[blueprint.pageIndex.length - 1];
  if (last && !/总结|回顾|checklist|检查|下一节|钩子|summary|recap/i.test(last.title)) {
    findings.push('最后一页不是总结/迁移/下节课钩子。');
  }
  for (const phrase of FORBIDDEN_PLANNING_PHRASES) {
    if (combined.includes(phrase)) blockedPhrases.push(phrase);
  }
  if (blockedPhrases.length) {
    findings.push(`出现禁用模板句：${Array.from(new Set(blockedPhrases)).join('、')}。`);
  }
  const denseIndexPages = blueprint.pageIndex.filter(
    (page) => page.keyPoints.length > policy.maxKeyPoints,
  );
  if (denseIndexPages.length) {
    findings.push(
      `页面索引过密：有 ${denseIndexPages.length} 页超过 ${policy.label} 的 keyPoints 上限 ${policy.maxKeyPoints} 条。`,
    );
  }
  const weakSourceCoverage = blueprint.pageIndex.filter(
    (page) => page.sourceKnowledgePoints.length === 0 || page.exactContentNeeded.length === 0,
  );
  if (weakSourceCoverage.length) {
    findings.push(
      `有 ${weakSourceCoverage.length} 页没有说明对应源文件知识点或需要保留的精确内容，后续画图 prompt 会变空泛。`,
    );
  }
  if (policy.length === 'minimal') {
    const detailPages = blueprint.pageIndex.filter((page) =>
      /example|proof|formula/i.test(page.pageRole),
    );
    if (detailPages.length > 2) {
      findings.push(
        '5 页以下应是 overview：example/proof/formula 细讲页过多，应该改成路线图、选择边界和总结迁移。',
      );
    }
  }
  return {
    passed: findings.length === 0,
    minPageCount,
    ...(maxPageCount != null ? { maxPageCount } : {}),
    findings,
    blockedPhrases: Array.from(new Set(blockedPhrases)),
    retryCount,
  };
}

function buildBatchPrompt(args: {
  body: ImageNotebookPlanRequestBody;
  language: 'zh-CN' | 'en-US';
  courseSpine: ImageNotebookBriefPlan['courseSpine'];
  pageIndex: ImageNotebookPageIndexItem[];
  batch: ImageNotebookPageIndexItem[];
  retryReason?: string;
}): string {
  const densityPolicy = inferPageCountBounds(args.body).policy;
  const styleBrief = styleBriefFromBody(args.body);
  return [
    `Language: ${args.language}`,
    `Requirement:\n${args.body.requirements?.requirement || ''}`,
    `Page style brief for planner context:\n${formatImageNotebookStyleBriefForPrompt(styleBrief).join('\n')}`,
    `Page count and density policy:\n${formatImageNotebookDensityPolicyForPrompt(densityPolicy)}`,
    `CourseSpine:\n${JSON.stringify(args.courseSpine, null, 2)}`,
    `Full page index:\n${args.pageIndex
      .map((page) =>
        [
          `${page.pageNumber}. [${page.pageRole}] ${page.title} — ${page.currentJob}`,
          page.sourceKnowledgePoints.length
            ? `Source knowledge: ${page.sourceKnowledgePoints.join(' | ')}`
            : '',
          page.exactContentNeeded.length
            ? `Exact content needed: ${page.exactContentNeeded.join(' | ')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
      )
      .join('\n')}`,
    `Generate detailed pagePlans only for these pages:\n${args.batch
      .map(
        (page) =>
          `${page.pageNumber}. [${page.pageRole}/${page.archetype}] ${page.title}\nJob: ${page.currentJob}\nSource knowledge: ${page.sourceKnowledgePoints.join(' | ')}\nExact content needed: ${page.exactContentNeeded.join(' | ')}\nAnchors: ${page.keyPoints.join(' | ')}`,
      )
      .join('\n\n')}`,
    args.retryReason ? `Previous batch response was rejected: ${args.retryReason}` : '',
    args.body.pdfText
      ? `Source text excerpt for exact visible content:\n${args.body.pdfText.slice(0, 12000)}`
      : '',
    '',
    'Return JSON only:',
    `{
  "pagePlans": [{
    "pageNumber": 1,
    "outline": {
      "id": "page-1-stable-id",
      "type": "slide",
      "contentProfile": "math|code|general",
      "archetype": "intro|concept|definition|example|bridge|summary",
      "title": "页面标题",
      "description": "本页课堂目的，用学生视角写",
      "keyPoints": ["学生可见核心内容；数量必须符合当前密度档位"],
      "teachingObjective": "本页学生学会做什么",
      "studentThinkingMove": "学生先看什么、怎么判断",
      "continuity": {"previousHandoff":"...", "currentJob":"...", "nextHandoff":"..."},
      "workedExampleConfig": {
        "kind": "math|proof|general",
        "role": "walkthrough",
        "problemStatement": "完整题目",
        "givens": ["..."],
        "asks": ["..."],
        "solutionPlan": ["2-4 条策略"],
        "walkthroughSteps": ["3-7 条连续步骤"],
        "commonPitfalls": ["1-3 条易错点"],
        "finalAnswer": "..."
      }
    },
    "brief": {
      "pageRole": "overview|hook|definition|formula|example|proof|strategy|pitfalls|summary",
      "title": "图片上的标题",
      "pageMove": {"fromPrevious":"...", "currentJob":"...", "toNext":"...", "callbackToSpine":"..."},
      "visualBrief": "整页生图说明：网格纸、手写板书、分区、具体图像和教学意图",
      "visibleContent": {
        "mustShow": ["必须出现在图上的学生可见文本"],
        "formulas": ["必须准确照写的公式"],
        "exampleSteps": ["例题/证明连续步骤"],
        "commonPitfalls": ["0-3 条图上可以提示的易错点"],
        "bottomTakeaway": "底部收束或下一页问题"
      },
      "focusRegions": [{"id":"focus-setup","label":"大区域名","role":"opening|setup|formula|example|proof|strategy|pitfall|takeaway|visual","left":60,"top":110,"width":420,"height":140,"order":1}],
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
      "generationNotes": ["0-3 条给图片模型的注意事项"],
      "qaChecklist": ["0-3 条生成后必须检查什么"]
    }
  }]
}`,
    '',
    'Hard requirements:',
    '- Return exactly the requested pageNumbers, no extra pages.',
    '- This step writes structured page components, not the final image prompt. The system will compile the final prompt deterministically.',
    '- brief.componentPlans must describe the real visible learning components. If the page has a definition, include the complete definition text. If it has code, include the complete code block. If it has a problem, include the original problem statement. If it has a formula/theorem, write the exact formula/theorem.',
    '- Do not assign marker colors. The code assigns marker colors later.',
    '- Use at most 6 participatesInMask=true components. Mark decorative/support elements as participatesInMask=false.',
    '- Never say vague things like "draw a derivative problem", "show a theorem", or "include some code". Name the exact content to draw.',
    '- Follow the density policy. If a short notebook cannot hold a detail, summarize the decision and hand off instead of adding more tiny text.',
    '- For example/proof/formula pages, include exact formulas and non-skipped steps in outline.workedExampleConfig and brief.componentPlans.',
    '- Write like a live classroom board plan, not a teacher handout.',
    '- Do not use forbidden meta labels: 教学目标, 本页主线, 讲解重点, 可迁移动作.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function generateBatchedPlan(args: {
  req: NextRequest;
  body: ImageNotebookPlanRequestBody;
  language: 'zh-CN' | 'en-US';
  model: Parameters<typeof callLLM>[0]['model'];
  outputWindow?: number;
  system: string;
  skipCreditCharge: boolean;
  onEvent?: (event: ImageNotebookPlanStreamEvent) => void | Promise<void>;
}): Promise<{
  outlines: SceneOutline[];
  plan: ImageNotebookBriefPlan;
  reports: ImageNotebookPlanQualityReport[];
  batchCount: number;
}> {
  const notebookTitle =
    args.body.notebookContext?.name || args.body.courseContext?.name || 'Notebook';
  const reports: ImageNotebookPlanQualityReport[] = [];
  let blueprint:
    | {
        courseSpine: ImageNotebookBriefPlan['courseSpine'];
        pageIndex: ImageNotebookPageIndexItem[];
      }
    | undefined;
  let retryFindings: string[] | undefined;

  for (let attempt = 0; attempt <= 1; attempt += 1) {
    const retryReasonSummary = retryFindings?.slice(0, 2).join('；');
    await args.onEvent?.({
      type: 'status',
      detail:
        attempt === 0
          ? '正在生成整课主线和页面索引…'
          : retryReasonSummary
            ? `正在按质量反馈重试整课主线和页面索引：${retryReasonSummary}`
            : '正在按质量反馈重试整课主线和页面索引…',
    });
    const prompt = buildBlueprintPrompt({
      body: args.body,
      language: args.language,
      retryFindings,
    });
    const resultText = await runStreamingPlanText({
      req: args.req,
      model: args.model,
      system: args.system,
      prompt,
      maxOutputTokens: Math.min(args.outputWindow || 6000, 6000),
      source: 'image-notebook-plan-blueprint',
      usageContext: {
        notebookId: args.body.notebookContext?.id,
        notebookName: args.body.notebookContext?.name,
        courseId: args.body.notebookContext?.courseId,
        courseName: args.body.notebookContext?.courseName || args.body.courseContext?.name,
        operationCode: args.skipCreditCharge
          ? 'generation_quality_test'
          : 'image_notebook_plan_blueprint',
        chargeReason: args.skipCreditCharge
          ? '生成测试页面（免积分）'
          : '生成图片笔记本整课主线与页面索引',
        skipCreditCharge: args.skipCreditCharge,
      },
      onDraft: (text) =>
        args.onEvent?.({
          type: 'draft',
          phase: 'blueprint',
          detail:
            attempt === 0
              ? '正在接收整课主线和页面索引草稿…'
              : retryReasonSummary
                ? `正在接收重试后的整课主线和页面索引草稿：${retryReasonSummary}`
                : '正在接收重试后的整课主线和页面索引草稿…',
          text,
          attempt,
        }),
    });
    const parsed = parseJsonResponse<unknown>(resultText);
    blueprint = normalizeBlueprint(parsed, args.body, notebookTitle);
    const report = assessBlueprintQuality(blueprint, args.body, attempt);
    reports.push(report);
    await args.onEvent?.({
      type: 'blueprint',
      courseSpine: blueprint.courseSpine,
      pageIndex: blueprint.pageIndex,
      quality: report,
      attempt,
    });
    if (report.passed || attempt >= 1) break;
    retryFindings = report.findings;
  }

  if (!blueprint) {
    throw new Error('没有生成可用整课页面索引');
  }
  const activeBlueprint = blueprint;

  const batchSize = 4;
  const batches: ImageNotebookPageIndexItem[][] = [];
  for (let start = 0; start < activeBlueprint.pageIndex.length; start += batchSize) {
    batches.push(activeBlueprint.pageIndex.slice(start, start + batchSize));
  }
  const generateBatch = async (
    batch: ImageNotebookPageIndexItem[],
    batchIndex: number,
  ): Promise<unknown[]> => {
    let pagePlans: unknown[] = [];
    let retryReason: string | undefined;
    for (let attempt = 0; attempt <= 1; attempt += 1) {
      await args.onEvent?.({
        type: 'batch-start',
        batchIndex,
        batchCount: batches.length,
        pageNumbers: batch.map((page) => page.pageNumber),
        startPage: batch[0]?.pageNumber || 0,
        endPage: batch[batch.length - 1]?.pageNumber || 0,
        attempt,
      });
      const prompt = buildBatchPrompt({
        body: args.body,
        language: args.language,
        courseSpine: activeBlueprint.courseSpine,
        pageIndex: activeBlueprint.pageIndex,
        batch,
        retryReason,
      });
      const resultText = await runStreamingPlanText({
        req: args.req,
        model: args.model,
        system: args.system,
        prompt,
        maxOutputTokens: Math.min(args.outputWindow || 7000, 7000),
        source: 'image-notebook-plan-page-batch',
        usageContext: {
          notebookId: args.body.notebookContext?.id,
          notebookName: args.body.notebookContext?.name,
          courseId: args.body.notebookContext?.courseId,
          courseName: args.body.notebookContext?.courseName || args.body.courseContext?.name,
          operationCode: args.skipCreditCharge
            ? 'generation_quality_test'
            : 'image_notebook_plan_batch',
          chargeReason: args.skipCreditCharge
            ? '生成测试页面（免积分）'
            : `生成图片笔记本第 ${batch[0]?.pageNumber}-${batch[batch.length - 1]?.pageNumber} 页画图 prompt`,
          skipCreditCharge: args.skipCreditCharge,
        },
        onDraft: (text) =>
          args.onEvent?.({
            type: 'draft',
            phase: 'batch',
            detail:
              attempt === 0
                ? `正在接收第 ${batch[0]?.pageNumber}-${batch[batch.length - 1]?.pageNumber} 页画图 prompt 草稿…`
                : `正在接收第 ${batch[0]?.pageNumber}-${batch[batch.length - 1]?.pageNumber} 页重试草稿…`,
            text,
            batchIndex,
            pageNumbers: batch.map((page) => page.pageNumber),
            attempt,
          }),
      });
      pagePlans = pageArray(parseJsonResponse<unknown>(resultText));
      if (pagePlans.length >= batch.length) break;
      retryReason = `expected ${batch.length} pagePlans, got ${pagePlans.length}. Return valid JSON with a pagePlans array only.`;
    }
    if (pagePlans.length < batch.length) {
      throw new Error(
        `第 ${batch[0]?.pageNumber}-${batch[batch.length - 1]?.pageNumber} 页规划为空或不完整`,
      );
    }
    const acceptedPagePlans = pagePlans.slice(0, batch.length);
    const normalizedBatch = normalizeFullPlan(
      {
        courseSpine: activeBlueprint.courseSpine,
        pagePlans: acceptedPagePlans,
      },
      {
        language: args.language,
        notebookTitle,
      },
    );
    const batchOutlines = attachImageNotebookPromptPlans(normalizedBatch.outlines, {
      notebookTitle,
      notebookGoal: args.body.notebookContext?.name || args.body.courseContext?.description,
      language: args.language,
      stylePrompt: stylePromptFromBody(args.body),
      styleBrief: styleBriefFromBody(args.body),
    });
    await args.onEvent?.({
      type: 'pages',
      batchIndex,
      batchCount: batches.length,
      pageNumbers: batch.map((page) => page.pageNumber),
      startPage: batch[0]?.pageNumber || 0,
      endPage: batch[batch.length - 1]?.pageNumber || 0,
      outlines: batchOutlines,
      pageBriefs: normalizedBatch.plan.pageBriefs,
    });
    return acceptedPagePlans;
  };
  const batchResults: unknown[][] = new Array(batches.length);
  let nextBatchIndex = 0;
  const workerCount = Math.min(2, batches.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextBatchIndex < batches.length) {
        const index = nextBatchIndex;
        nextBatchIndex += 1;
        batchResults[index] = await generateBatch(batches[index] || [], index);
      }
    }),
  );
  const rawPagePlans = batchResults.flat();

  const normalized = normalizeFullPlan(
    {
      courseSpine: activeBlueprint.courseSpine,
      pagePlans: rawPagePlans,
    },
    {
      language: args.language,
      notebookTitle,
    },
  );
  const promptReadyOutlines = attachImageNotebookPromptPlans(normalized.outlines, {
    notebookTitle,
    notebookGoal: args.body.notebookContext?.name || args.body.courseContext?.description,
    language: args.language,
    stylePrompt: stylePromptFromBody(args.body),
    styleBrief: styleBriefFromBody(args.body),
  });
  const finalReport = assessFullPlanQuality(promptReadyOutlines, normalized.plan, args.body, 0);
  reports.push(finalReport);
  await args.onEvent?.({ type: 'quality', quality: finalReport });
  return {
    outlines: promptReadyOutlines,
    plan: normalized.plan,
    reports,
    batchCount: Math.ceil(activeBlueprint.pageIndex.length / batchSize),
  };
}

function encodeSseEvent(event: ImageNotebookPlanStreamEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

async function runStreamingPlanText(args: {
  req: NextRequest;
  model: Parameters<typeof callLLM>[0]['model'];
  system: string;
  prompt: string;
  maxOutputTokens: number;
  source: string;
  usageContext: Partial<RequestLLMContext>;
  onDraft?: (text: string) => void | Promise<void>;
}): Promise<string> {
  const result = await runWithRequestContext(
    args.req,
    '/api/generate/image-notebook-plan',
    () =>
      streamLLM(
        {
          model: args.model,
          system: args.system,
          prompt: args.prompt,
          maxOutputTokens: args.maxOutputTokens,
          abortSignal: args.req.signal,
        },
        args.source,
      ),
    args.usageContext,
  );

  let fullText = '';
  let lastSentLength = 0;
  let lastSentAt = 0;
  for await (const chunk of result.textStream) {
    if (args.req.signal.aborted) break;
    fullText += chunk;
    const now = Date.now();
    if (fullText.length - lastSentLength >= 96 || now - lastSentAt >= 350) {
      lastSentLength = fullText.length;
      lastSentAt = now;
      await args.onDraft?.(fullText);
    }
  }
  if (fullText.trim()) {
    await args.onDraft?.(fullText);
    return fullText;
  }

  const fallback = await runWithRequestContext(
    args.req,
    '/api/generate/image-notebook-plan',
    () =>
      callLLM(
        {
          model: args.model,
          system: args.system,
          prompt: args.prompt,
          maxOutputTokens: args.maxOutputTokens,
        },
        `${args.source}-fallback`,
        { retries: 1 },
      ),
    args.usageContext,
  );
  await args.onDraft?.(fallback.text);
  return fallback.text;
}

export async function handleImageNotebookPlanStreamRequest(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as ImageNotebookPlanRequestBody | null;
    if (!body?.requirements?.requirement?.trim()) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'requirements.requirement is required',
      );
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let heartbeat: ReturnType<typeof setInterval> | undefined;
        const send = (event: ImageNotebookPlanStreamEvent) => {
          controller.enqueue(encodeSseEvent(event));
        };

        try {
          heartbeat = setInterval(() => {
            controller.enqueue(new TextEncoder().encode(': heartbeat\n\n'));
          }, 15000);
          const language = body.requirements?.language || body.courseContext?.language || 'zh-CN';
          const { model, modelInfo, modelString } = await resolveModelFromHeadersForNotebookStage(
            req,
            'outlines',
            { allowOpenAIModelOverride: true },
          );
          const skipCreditCharge =
            req.headers.get('x-generation-test-no-charge') === 'true' &&
            (process.env.NODE_ENV !== 'production' ||
              process.env.SYNTARA_ALLOW_NO_CHARGE_TEST_GENERATION === 'true');
          send({ type: 'status', detail: '正在启动整本页面规划流…' });
          const batched = await generateBatchedPlan({
            req,
            body,
            language,
            model,
            outputWindow: modelInfo?.outputWindow,
            system: buildSystemPrompt(language),
            skipCreditCharge,
            onEvent: send,
          });
          send({
            type: 'done',
            outlines: batched.outlines,
            plan: batched.plan,
            model: modelString,
            plannerMode: 'batched',
            planBatchCount: batched.batchCount,
            planQuality: batched.reports[batched.reports.length - 1],
            planQualityAttempts: batched.reports,
          });
        } catch (error) {
          send({
            type: 'error',
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          if (heartbeat) clearInterval(heartbeat);
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function handleImageNotebookPlanRequest(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as ImageNotebookPlanRequestBody | null;
    if (!body?.requirements?.requirement?.trim()) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'requirements.requirement is required',
      );
    }
    const language = body.requirements.language || body.courseContext?.language || 'zh-CN';
    const { model, modelInfo, modelString } = await resolveModelFromHeadersForNotebookStage(
      req,
      'outlines',
      { allowOpenAIModelOverride: true },
    );
    const skipCreditCharge =
      req.headers.get('x-generation-test-no-charge') === 'true' &&
      (process.env.NODE_ENV !== 'production' ||
        process.env.SYNTARA_ALLOW_NO_CHARGE_TEST_GENERATION === 'true');
    const system = buildSystemPrompt(language);
    if (req.headers.get('x-image-notebook-plan-mode') !== 'single') {
      const batched = await generateBatchedPlan({
        req,
        body,
        language,
        model,
        outputWindow: modelInfo?.outputWindow,
        system,
        skipCreditCharge,
      });
      return apiSuccess({
        outlines: batched.outlines,
        plan: batched.plan,
        model: modelString,
        plannerMode: 'batched',
        planBatchCount: batched.batchCount,
        planQuality: batched.reports[batched.reports.length - 1],
        planQualityAttempts: batched.reports,
      });
    }

    const reports: ImageNotebookPlanQualityReport[] = [];
    let finalOutlines: SceneOutline[] = [];
    let finalPlan: ImageNotebookBriefPlan | undefined;
    let retryFindings: string[] | undefined;
    let previousTitles: string[] | undefined;
    const maxRetries = 1;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const prompt = buildUserPrompt({ body, language, retryFindings, previousTitles });
      const result = await runWithRequestContext(
        req,
        '/api/generate/image-notebook-plan',
        () =>
          callLLM(
            {
              model,
              system,
              prompt,
              maxOutputTokens: Math.min(modelInfo?.outputWindow || 16000, 16000),
            },
            'image-notebook-plan',
          ),
        {
          notebookId: body.notebookContext?.id,
          notebookName: body.notebookContext?.name,
          courseId: body.notebookContext?.courseId,
          courseName: body.notebookContext?.courseName || body.courseContext?.name,
          operationCode: skipCreditCharge ? 'generation_quality_test' : 'image_notebook_plan',
          chargeReason: skipCreditCharge ? '生成测试页面（免积分）' : '生成图片笔记本整本页面规划',
          skipCreditCharge,
        },
      );
      const parsed = parseJsonResponse<unknown>(result.text);
      if (!parsed) {
        retryFindings = ['模型返回的整本页面规划不是有效 JSON。'];
        reports.push({
          passed: false,
          minPageCount: inferMinPageCount(body),
          findings: retryFindings,
          blockedPhrases: [],
          retryCount: attempt,
        });
        continue;
      }
      const normalized = normalizeFullPlan(parsed, {
        language,
        notebookTitle: body.notebookContext?.name || body.courseContext?.name || 'Notebook',
      });
      const notebookTitle = body.notebookContext?.name || body.courseContext?.name || 'Notebook';
      const promptReadyOutlines = attachImageNotebookPromptPlans(normalized.outlines, {
        notebookTitle,
        notebookGoal: body.notebookContext?.name || body.courseContext?.description,
        language,
        stylePrompt: stylePromptFromBody(body),
        styleBrief: styleBriefFromBody(body),
      });
      const report = assessFullPlanQuality(promptReadyOutlines, normalized.plan, body, attempt);
      reports.push(report);
      finalOutlines = promptReadyOutlines;
      finalPlan = normalized.plan;
      if (report.passed || attempt >= maxRetries) break;
      retryFindings = report.findings;
      previousTitles = normalized.outlines.map((outline) => outline.title);
    }

    if (!finalOutlines.length || !finalPlan) {
      return apiError(API_ERROR_CODES.GENERATION_FAILED, 502, '没有生成可用整本页面规划');
    }

    return apiSuccess({
      outlines: finalOutlines,
      plan: finalPlan,
      model: modelString,
      planQuality: reports[reports.length - 1],
      planQualityAttempts: reports,
    });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function handleImageNotebookPromptPlanRequest(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as ImageNotebookPlanRequestBody | null;
    if (!body?.requirements?.requirement?.trim()) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'requirements.requirement is required',
      );
    }
    const language = body.requirements.language || body.courseContext?.language || 'zh-CN';
    const { model, modelInfo, modelString } = await resolveModelFromHeadersForNotebookStage(
      req,
      'outlines',
      { allowOpenAIModelOverride: true },
    );
    const skipCreditCharge =
      req.headers.get('x-generation-test-no-charge') === 'true' &&
      (process.env.NODE_ENV !== 'production' ||
        process.env.SYNTARA_ALLOW_NO_CHARGE_TEST_GENERATION === 'true');
    const batched = await generateBatchedPlan({
      req,
      body,
      language,
      model,
      outputWindow: modelInfo?.outputWindow,
      system: buildSystemPrompt(language),
      skipCreditCharge,
    });
    const quality = batched.reports[batched.reports.length - 1];
    const styleBrief = styleBriefFromBody(body);
    return apiSuccess({
      courseSpine: batched.plan.courseSpine,
      imageNotebookStyle: styleBrief,
      pages: batched.outlines.map((outline) => ({
        pageNumber: outline.order,
        title: outline.title,
        outline,
        promptPlan: outline.imageNotebookPromptPlan,
        compiledImagePrompt:
          outline.imageNotebookPromptPlan?.compiledImagePrompt || outline.imageNotebookPrompt || '',
        quality,
      })),
      plan: batched.plan,
      outlines: batched.outlines,
      model: modelString,
      plannerMode: 'prompt-plan',
      planBatchCount: batched.batchCount,
      quality,
      planQualityAttempts: batched.reports,
    });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      error instanceof Error ? error.message : String(error),
    );
  }
}
