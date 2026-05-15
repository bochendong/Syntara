export type HtmlTestStageId =
  | 'html-single-page'
  | 'html-file-page'
  | 'html-lesson'
  | 'html-notebook';

export interface HtmlTestStageDefinition {
  id: HtmlTestStageId;
  order: number;
  shortTitle: string;
  title: string;
  href: string;
  eyebrow: string;
  inputContract: string;
  proves: string;
  gate: string;
  promotes: string;
}

export interface HtmlGenerationPipelinePhase {
  id: 'source' | 'course-plan' | 'slide-outlines' | 'html-prompts' | 'html-pages' | 'qa';
  order: number;
  title: string;
  artifact: string;
  purpose: string;
  handoff: string;
}

export const HTML_TEST_PROGRESSION: HtmlTestStageDefinition[] = [
  {
    id: 'html-single-page',
    order: 1,
    shortTitle: '单页',
    title: 'HTML 单页质量测试',
    href: '/generation-html-single-page-test',
    eyebrow: 'Level 1 / Page Contract',
    inputContract: '手写 prompt、pageKind、route、density、canvasMode。',
    proves: '验证最小 HTML/CSS PPT 页面能稳定满足单页契约。',
    gate: 'exactly one .slide；无越界、无裁切、无异常滚动；数学/代码/图片占位按页面类型通过 QA。',
    promotes: '为真实文件逐页生成提供可复用的页面类型、密度和画布契约。',
  },
  {
    id: 'html-file-page',
    order: 2,
    shortTitle: '文件逐页',
    title: '文件逐页 HTML 生成测试',
    href: '/generation-html-file-test',
    eyebrow: 'Level 2 / Source Page',
    inputContract: 'testfile fixture 中的真实文件页、SceneOutline 与源材料锚点。',
    proves: '验证单页契约在真实 Markdown、PDF、PPTX 切片输入下仍然稳定。',
    gate: '每个源页必须能独立生成 HTML，并保留文件页的标题、教学角色、核心素材与 QA 状态。',
    promotes: '为整节课规划提供可信的源页切片、页型推断和真实材料压力样本。',
  },
  {
    id: 'html-lesson',
    order: 3,
    shortTitle: '整节课',
    title: 'HTML 整节课生成测试',
    href: '/generation-html-lesson-test',
    eyebrow: 'Level 3 / Lesson Plan',
    inputContract: '单个 testfile、页数档位、sourcePages 与整课规划要求。',
    proves: '验证系统能先规划整节课，再把每一页降解成可执行的单页 HTML prompt。',
    gate: 'plan 必须给出 pageCount、coursePlan、slideOutlines、slides[].htmlPrompt；每页继续通过单页 HTML QA。',
    promotes: '为整本 notebook 提供课程级容量控制、叙事弧线和逐页 prompt 结构。',
  },
  {
    id: 'html-notebook',
    order: 4,
    shortTitle: '整本笔记本',
    title: 'HTML 整本笔记本生成测试',
    href: '/generation-html-notebook-test',
    eyebrow: 'Level 4 / Notebook Plan',
    inputContract: '科目文件 notebook、跨页 sourcePackage、原文图片、页数档位。',
    proves: '验证跨章节/跨文件内容取舍、课程路线一致性、原文图分配和逐页 HTML 生成。',
    gate: 'notebook plan 先通过规划 QA；每页继承单页契约，并额外检查 sourceImageIds 与跨页结构。',
    promotes: '作为后续真实 notebook 生成链路的最高级回归测试。',
  },
];

export const HTML_GENERATION_PIPELINE: HtmlGenerationPipelinePhase[] = [
  {
    id: 'source',
    order: 1,
    title: 'Source Package',
    artifact: 'sourcePackage / sourcePages / sourceImages',
    purpose: '读取真实文件、页段、图片和解析警告，形成可规划的源材料包。',
    handoff: '交给规划器做全局知识主线、素材取舍和课程路线判断。',
  },
  {
    id: 'course-plan',
    order: 2,
    title: 'coursePlan',
    artifact: 'targetLearner / courseGoal / narrativeArc / coreQuestions',
    purpose: '先决定整节课或整本 notebook 应该怎样被教，而不是直接写页面。',
    handoff: '约束每页只能服务这条课程目标、叙事弧线和核心问题。',
  },
  {
    id: 'slide-outlines',
    order: 3,
    title: 'slideOutlines',
    artifact: 'learnerQuestion / teachingObjective / sourceAnchors / visualPlan',
    purpose: '把课程级主线拆成逐页教学问题、目标、证据锚点和视觉计划。',
    handoff: '每个 outline 一一翻译成一个可执行的 HTML 生成 prompt。',
  },
  {
    id: 'html-prompts',
    order: 4,
    title: 'slides[].htmlPrompt',
    artifact: 'pageKind / canvasMode / density / mandatoryVisibleContent',
    purpose: '把教学 outline 变成单页 HTML 生成器能执行的页面契约和容量预算。',
    handoff: '逐页调用 /api/generate/html-ppt-slide，生成自包含 HTML/CSS PPT 页面。',
  },
  {
    id: 'html-pages',
    order: 5,
    title: 'HTML Pages',
    artifact: '.slide / .slide-content / MathML / tables / source images',
    purpose: '生成真实可预览、可 QA 的 HTML/CSS 页面结果。',
    handoff: '交给 iframe/DOM QA 检查越界、裁切、滚动、图片引用和页面类型契约。',
  },
  {
    id: 'qa',
    order: 6,
    title: 'QA / Retry',
    artifact: 'planningQuality / retryReasons / previewStats / sourceImageUsage',
    purpose: '把规划失败和页面失败变成可见问题，必要时携带反馈重试。',
    handoff: '失败原因回流到规划或单页生成阶段，形成闭环。',
  },
];

export function getHtmlTestStage(stageId: HtmlTestStageId): HtmlTestStageDefinition {
  return HTML_TEST_PROGRESSION.find((stage) => stage.id === stageId) || HTML_TEST_PROGRESSION[0];
}

export function getHtmlTestNeighbors(stageId: HtmlTestStageId): {
  previous: HtmlTestStageDefinition | null;
  current: HtmlTestStageDefinition;
  next: HtmlTestStageDefinition | null;
} {
  const currentIndex = Math.max(
    0,
    HTML_TEST_PROGRESSION.findIndex((stage) => stage.id === stageId),
  );
  return {
    previous: HTML_TEST_PROGRESSION[currentIndex - 1] || null,
    current: HTML_TEST_PROGRESSION[currentIndex],
    next: HTML_TEST_PROGRESSION[currentIndex + 1] || null,
  };
}
