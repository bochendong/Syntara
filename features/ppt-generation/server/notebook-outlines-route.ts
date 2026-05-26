import type { NextRequest } from 'next/server';
import {
  formatImageNotebookDensityPolicyForPrompt,
  getImageNotebookRequiredWorkedExampleCount,
  resolveImageNotebookDensityPolicy,
  type ImageNotebookDensityPolicy,
} from '@/lib/generation/image-notebook-quality';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import type { SceneOutline } from '@/lib/types/generation';

export const maxDuration = 300;

type OutlineStreamEvent =
  | { type: 'outline'; data: SceneOutline; index?: number }
  | { type: 'done'; outlines?: SceneOutline[] }
  | { type: 'retry'; attempt?: number; maxAttempts?: number }
  | { type: 'error'; error?: string };

type NotebookOutlinesRequestBody = {
  requirements?: { requirement?: string; language?: string; [key: string]: unknown };
  pdfText?: string;
  outlinePreferences?: {
    length?: 'minimal' | 'compact' | 'standard' | 'extended';
    includeQuizScenes?: boolean;
    workedExampleLevel?: 'none' | 'light' | 'moderate' | 'heavy';
  } | null;
  [key: string]: unknown;
};

type OutlineQualityReport = {
  passed: boolean;
  minSceneCount: number;
  maxSceneCount?: number;
  findings: string[];
  blockedPhrases: string[];
  retryCount: number;
};

const FORBIDDEN_OUTLINE_PHRASES = [
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

const PDF_TEXT_NOISE_PATTERN = /\bderek\b|[#&]{2,}|[!]{2,}/i;

function outlineText(outline: SceneOutline): string {
  return [
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
  ]
    .filter(Boolean)
    .join('\n');
}

function requestRequirement(body: NotebookOutlinesRequestBody): string {
  return body.requirements?.requirement?.trim() || '';
}

function isDifferentialEquationRequest(body: NotebookOutlinesRequestBody): boolean {
  const text = [requestRequirement(body), body.pdfText || ''].join('\n');
  return /微分方程|differential equation|dy\/dx|slope field|斜率场|Euler|欧拉|FTC|初值/.test(text);
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

function inferSceneCountBounds(body: NotebookOutlinesRequestBody): {
  min: number;
  max?: number;
  policy: ImageNotebookDensityPolicy;
} {
  const requirement = requestRequirement(body);
  const policy = resolveImageNotebookDensityPolicy(body.outlinePreferences?.length);
  const hasLengthPreference = Boolean(body.outlinePreferences?.length);
  const min = Math.max(
    explicitPageMinimum(requirement),
    hasLengthPreference ? policy.minPages : 0,
    !hasLengthPreference && isDifferentialEquationRequest(body) ? 12 : 0,
  );
  let max = explicitPageMaximum(requirement) ?? (hasLengthPreference ? policy.maxPages : undefined);
  if (max != null && min > max) max = undefined;
  return { min, max, policy };
}

function countOccurrences(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value.replace(/\s+/g, '').trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function hasWorkedExampleDetails(outline: SceneOutline): boolean {
  const cfg = outline.workedExampleConfig;
  return Boolean(
    cfg?.problemStatement &&
    ((cfg.walkthroughSteps?.length || 0) >= 2 || (cfg.solutionPlan?.length || 0) >= 2),
  );
}

function assessOutlineQuality(
  outlines: SceneOutline[],
  body: NotebookOutlinesRequestBody,
  retryCount: number,
): OutlineQualityReport {
  const findings: string[] = [];
  const blockedPhrases: string[] = [];
  const sceneBounds = inferSceneCountBounds(body);
  const { min: minSceneCount, max: maxSceneCount, policy } = sceneBounds;
  const combined = outlines.map(outlineText).join('\n');

  if (minSceneCount > 0 && outlines.length < minSceneCount) {
    findings.push(`页数不足：生成 ${outlines.length} 页，但要求至少 ${minSceneCount} 页。`);
  }
  if (maxSceneCount != null && outlines.length > maxSceneCount) {
    findings.push(
      `页数超过档位：${policy.label} 应控制在 ${policy.pageRangeText}，目前生成 ${outlines.length} 页。`,
    );
  }

  for (const phrase of FORBIDDEN_OUTLINE_PHRASES) {
    if (combined.includes(phrase)) blockedPhrases.push(phrase);
  }
  if (blockedPhrases.length) {
    findings.push(`出现禁用模板句：${Array.from(new Set(blockedPhrases)).join('、')}。`);
  }

  if (PDF_TEXT_NOISE_PATTERN.test(combined)) {
    findings.push('疑似 PDF 公式提取噪声进入大纲字段，例如 derek、#、&、!!。');
  }

  const repeatedThinkingMoves = Array.from(
    countOccurrences(outlines.map((outline) => outline.studentThinkingMove || '')).entries(),
  ).filter(([, count]) => count >= 3);
  if (repeatedThinkingMoves.length) {
    findings.push('studentThinkingMove 重复过多，说明页面没有按具体教学动作区分。');
  }

  const first = outlines[0];
  if (
    first &&
    !/为什么|困惑|只知道|变化率|反推|where do we start|why/i.test(
      `${first.title}\n${first.description}\n${(first.keyPoints || []).join('\n')}`,
    )
  ) {
    findings.push('第一页不像学生视角 hook：缺少“为什么只知道变化率不够”的具体困惑。');
  }

  const last = outlines[outlines.length - 1];
  if (last && !/总结|回顾|checklist|检查|下一节|钩子|summary|recap/i.test(last.title)) {
    findings.push('最后一页不是总结/迁移/下节课钩子。');
  }

  const exampleLike = outlines.filter(
    (outline) =>
      outline.archetype === 'example' || /例题|walkthrough|应用|演示|检查/.test(outline.title),
  );
  const detailedExamples = exampleLike.filter(hasWorkedExampleDetails);
  const requiredExamples = getImageNotebookRequiredWorkedExampleCount({
    length: body.outlinePreferences?.length,
    workedExampleLevel: body.outlinePreferences?.workedExampleLevel,
  });
  if (detailedExamples.length < requiredExamples) {
    findings.push(
      `完整例题不足：需要至少 ${requiredExamples} 组带题目和步骤的 workedExampleConfig，目前 ${detailedExamples.length} 组。`,
    );
  }
  if (policy.maxDetailedExamples != null && detailedExamples.length > policy.maxDetailedExamples) {
    findings.push(
      `完整例题过多：${policy.label} 最多 ${policy.maxDetailedExamples} 组完整例题，目前 ${detailedExamples.length} 组。`,
    );
  }
  const overlyDenseOutlines = outlines.filter((outline) => {
    const steps =
      (outline.workedExampleConfig?.solutionPlan?.length || 0) +
      (outline.workedExampleConfig?.walkthroughSteps?.length || 0);
    return (outline.keyPoints || []).length > policy.maxKeyPoints || steps > policy.maxExampleSteps;
  });
  if (overlyDenseOutlines.length) {
    findings.push(
      `有 ${overlyDenseOutlines.length} 页超过 ${policy.label} 的单页密度上限，应拆页或改成 overview。`,
    );
  }

  if (isDifferentialEquationRequest(body)) {
    const requiredTopics: Array<[string, RegExp]> = [
      ['积分/反导', /积分|反导|antiderivative/i],
      ['常数 C/通解', /常数\s*C|通解|constant C/i],
      ['初值', /初值|initial condition|y\(3\)\s*=\s*5/i],
      ['FTC/链式法则检查积分表达式', /FTC|基本定理|链式法则|积分表达式/i],
      ['斜率场', /斜率场|slope field/i],
      ['Euler 方法', /Euler|欧拉/i],
    ];
    const missingTopics = requiredTopics
      .filter(([, pattern]) => !pattern.test(combined))
      .map(([label]) => label);
    if (missingTopics.length) {
      findings.push(`微分方程主线缺失：${missingTopics.join('、')}。`);
    }
    const slopeIndex = outlines.findIndex((outline) =>
      /斜率场|slope field/i.test(outlineText(outline)),
    );
    const integralIndex = outlines.findIndex((outline) =>
      /积分|反导|常数\s*C|通解/i.test(outlineText(outline)),
    );
    if (slopeIndex >= 0 && integralIndex >= 0 && slopeIndex < integralIndex) {
      findings.push('教学顺序错误：斜率场出现在“积分反推函数/常数 C”之前。');
    }
  }

  return {
    passed: findings.length === 0,
    minSceneCount,
    ...(maxSceneCount != null ? { maxSceneCount } : {}),
    findings,
    blockedPhrases: Array.from(new Set(blockedPhrases)),
    retryCount,
  };
}

function differentialEquationSkeleton(): string {
  return [
    '固定页序建议（如果资料是微分方程入门，必须覆盖这些页面，不要少于 12 页）：',
    '1. Hook：只知道 dy/dx 时，我们缺什么？不要解题。',
    '2. 从 dy/dx 到 y：为什么要对两边积分？',
    '3. 通解与常数 C：为什么同一个导数对应一族函数？',
    '4. 初值怎么选出唯一函数：y(3)=5 的代入意义。',
    '5. 完整例题：dy/dx=2x, y(3)=5，分步写出 dx、积分、C、最终检查。',
    '6. FTC 检查：给出积分表达式时，怎样对变上限积分求导？',
    '7. 积分表达式选择题 1：看上限、被积函数、常数项，判断是否满足微分方程。',
    '8. 积分表达式选择题 2：用链式法则处理复合上限，避免只看外形。',
    '9. 斜率场入口：每个点的小线段告诉我们什么？',
    '10. 斜率场匹配方程：看只依赖 x、只依赖 y、还是依赖 x 和 y。',
    '11. Euler 方法：从当前点沿切线走一步，为什么会近似？',
    '12. Euler 高估/低估：用 concavity 判断，并总结下一节课会继续问什么。',
  ].join('\n');
}

function buildQualityContract(body: NotebookOutlinesRequestBody): string {
  const { min: minSceneCount, max: maxSceneCount, policy } = inferSceneCountBounds(body);
  const lines = [
    '',
    '---',
    '## Notebook Outline Quality Gate（必须遵守）',
    minSceneCount > 0 && maxSceneCount != null
      ? `- 输出 ${minSceneCount}-${maxSceneCount} 页，不能超过 ${maxSceneCount} 页。`
      : minSceneCount > 0
        ? `- 输出不少于 ${minSceneCount} 页。`
        : '',
    `- 篇幅/密度策略：${formatImageNotebookDensityPolicyForPrompt(policy)}`,
    '- 每页字段必须是学生可见/可听的课堂内容，不要把 Teaching Plan IR、课程容器信息或内部评价句塞进 keyPoints。',
    `- 禁止出现这些模板句或其近似改写：${FORBIDDEN_OUTLINE_PHRASES.join('；')}。`,
    '- 不要把 course code、campus、导师、日期、免责声明、页眉页脚当作页面要点。',
    '- 例题页必须有 workedExampleConfig，并至少包含 problemStatement、givens/asks、solutionPlan 或 walkthroughSteps。',
    '- 不要复制 PDF 提取乱码；公式不清楚时，用可靠的文字描述题型，等图片/视觉 QA 再确认公式。',
    '- studentThinkingMove 必须按本页具体内容改写，不能多页重复同一句。',
    isDifferentialEquationRequest(body) ? differentialEquationSkeleton() : '',
  ];
  return lines.filter(Boolean).join('\n');
}

function buildRetryRequirement(args: {
  originalRequirement: string;
  outlines: SceneOutline[];
  report: OutlineQualityReport;
  attempt: number;
  body: NotebookOutlinesRequestBody;
}): string {
  const previousTitles = args.outlines
    .map((outline, index) => `${index + 1}. ${outline.title}`)
    .join('\n');
  return [
    args.originalRequirement,
    buildQualityContract(args.body),
    '',
    `---\n## 上一次大纲 QA 未通过（第 ${args.attempt} 次）`,
    ...args.report.findings.map((finding) => `- ${finding}`),
    '',
    '请重新生成一份完整替换版 JSON 大纲，不要只补充缺失页。',
    '保留正确主题，但必须修复以上问题。',
    '上一版标题仅供参考，不要照抄其错误：',
    previousTitles,
  ].join('\n');
}

function sanitizeOutlineText(value: string | undefined): string | undefined {
  const cleaned = (value || '')
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
  return cleaned || undefined;
}

function sanitizeContinuity(outline: SceneOutline): SceneOutline['continuity'] {
  const continuity = outline.continuity;
  if (!continuity) return undefined;
  const cleaned = {
    ...continuity,
    previousHandoff: sanitizeOutlineText(continuity.previousHandoff),
    currentJob: sanitizeOutlineText(continuity.currentJob),
    nextHandoff: sanitizeOutlineText(continuity.nextHandoff),
  };
  const hasUsefulText =
    Boolean(cleaned.previousHandoff) || Boolean(cleaned.currentJob) || Boolean(cleaned.nextHandoff);
  const hasExamples = Boolean(cleaned.usesExampleIds?.length);
  return hasUsefulText || hasExamples ? cleaned : undefined;
}

function sanitizeOutlines(outlines: SceneOutline[]): SceneOutline[] {
  const usedThinkingMoves = new Map<string, number>();
  return outlines.map((outline, index) => {
    const keyPoints = (outline.keyPoints || [])
      .map(sanitizeOutlineText)
      .filter((point): point is string => Boolean(point))
      .filter((point, pointIndex, arr) => arr.indexOf(point) === pointIndex)
      .slice(0, 5);
    let studentThinkingMove = sanitizeOutlineText(outline.studentThinkingMove);
    const normalizedMove = (studentThinkingMove || '').replace(/\s+/g, '');
    const seenCount = normalizedMove ? usedThinkingMoves.get(normalizedMove) || 0 : 0;
    if (normalizedMove && seenCount >= 1) {
      studentThinkingMove = keyPoints[0]
        ? `先看「${keyPoints[0].slice(0, 34)}」，这一页要判断它服务于哪个目标。`
        : `第 ${index + 1} 页先判断已知、目标和下一步动作。`;
    }
    if (normalizedMove) usedThinkingMoves.set(normalizedMove, seenCount + 1);
    return {
      ...outline,
      description: sanitizeOutlineText(outline.description) || outline.description,
      teachingObjective:
        sanitizeOutlineText(outline.teachingObjective) || outline.teachingObjective,
      studentThinkingMove,
      keyPoints: keyPoints.length ? keyPoints : outline.keyPoints,
      continuity: sanitizeContinuity(outline),
    };
  });
}

function forwardJsonHeaders(req: NextRequest): Headers {
  const headers = new Headers(req.headers);
  headers.set('Content-Type', 'application/json');
  headers.delete('host');
  headers.delete('content-length');
  headers.delete('connection');
  headers.delete('accept-encoding');
  return headers;
}

async function parseOutlineStream(response: Response): Promise<{
  outlines: SceneOutline[];
  incrementalOutlines: SceneOutline[];
  retries: Array<{ attempt?: number; maxAttempts?: number }>;
  events: OutlineStreamEvent[];
}> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('无法读取大纲生成流');

  const decoder = new TextDecoder();
  let buffer = '';
  let finalOutlines: SceneOutline[] = [];
  let incrementalOutlines: SceneOutline[] = [];
  const retries: Array<{ attempt?: number; maxAttempts?: number }> = [];
  const events: OutlineStreamEvent[] = [];

  const consumeLine = (line: string) => {
    if (!line.startsWith('data: ')) return;
    const event = JSON.parse(line.slice(6)) as OutlineStreamEvent;
    events.push(event);
    if (event.type === 'retry') {
      retries.push({ attempt: event.attempt, maxAttempts: event.maxAttempts });
      incrementalOutlines = [];
      return;
    }
    if (event.type === 'outline') {
      incrementalOutlines.push(event.data);
      return;
    }
    if (event.type === 'done') {
      finalOutlines = event.outlines?.length ? event.outlines : incrementalOutlines;
      return;
    }
    if (event.type === 'error') {
      throw new Error(event.error || '大纲生成失败');
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) consumeLine(line);
    }
    if (done) break;
  }
  if (buffer.trim()) consumeLine(buffer.trim());

  return {
    outlines: finalOutlines.length ? finalOutlines : incrementalOutlines,
    incrementalOutlines,
    retries,
    events,
  };
}

async function generateOutlinesViaStream(
  req: NextRequest,
  body: NotebookOutlinesRequestBody,
): Promise<{
  outlines: SceneOutline[];
  incrementalOutlines: SceneOutline[];
  retries: Array<{ attempt?: number; maxAttempts?: number }>;
  events: OutlineStreamEvent[];
}> {
  const upstreamResponse = await fetch(new URL('/api/generate/scene-outlines-stream', req.url), {
    method: 'POST',
    headers: forwardJsonHeaders(req),
    body: JSON.stringify(body),
  });

  if (!upstreamResponse.ok) {
    const text = await upstreamResponse.text().catch(() => '');
    throw new Error(text.trim() || '大纲生成失败');
  }

  return parseOutlineStream(upstreamResponse);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid request body');
    }
    const requestRecord = body as NotebookOutlinesRequestBody;
    if (!requestRecord.requirements?.requirement?.trim()) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'requirements.requirement is required',
      );
    }

    const originalRequirement = requestRequirement(requestRecord);
    let attemptBody: NotebookOutlinesRequestBody = {
      ...requestRecord,
      requirements: {
        ...requestRecord.requirements,
        requirement: `${originalRequirement}\n${buildQualityContract(requestRecord)}`,
      },
    };
    const reports: OutlineQualityReport[] = [];
    let parsed: Awaited<ReturnType<typeof generateOutlinesViaStream>> | undefined;
    const maxQualityRetries = 2;

    for (let attempt = 0; attempt <= maxQualityRetries; attempt += 1) {
      parsed = await generateOutlinesViaStream(req, attemptBody);
      const sanitized = sanitizeOutlines(parsed.outlines);
      const report = assessOutlineQuality(sanitized, requestRecord, attempt);
      reports.push(report);
      parsed = { ...parsed, outlines: sanitized };
      if (report.passed || attempt >= maxQualityRetries) break;
      attemptBody = {
        ...requestRecord,
        requirements: {
          ...requestRecord.requirements,
          requirement: buildRetryRequirement({
            originalRequirement,
            outlines: sanitized,
            report,
            attempt: attempt + 1,
            body: requestRecord,
          }),
        },
      };
    }

    if (!parsed?.outlines.length) {
      return apiError(API_ERROR_CODES.GENERATION_FAILED, 502, '没有生成可用大纲');
    }
    const finalReport = reports[reports.length - 1];

    return apiSuccess({
      outlines: parsed.outlines,
      incrementalOutlines: parsed.incrementalOutlines,
      retries: parsed.retries,
      eventCount: parsed.events.length,
      upstreamRoute: '/api/generate/scene-outlines-stream',
      promptPreview: requestRecord.requirements?.requirement || '',
      language: requestRecord.requirements?.language || parsed.outlines[0]?.language || 'zh-CN',
      sourceTextChars: typeof requestRecord.pdfText === 'string' ? requestRecord.pdfText.length : 0,
      outlinePreferences: requestRecord.outlinePreferences,
      outlineQuality: finalReport,
      outlineQualityAttempts: reports,
    });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      error instanceof Error ? error.message : String(error),
    );
  }
}
