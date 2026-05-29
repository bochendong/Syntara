import { COURSE_ORCHESTRATOR_ID } from '@/lib/constants/course-chat';
import type { StageListItem } from '@/lib/utils/stage-storage';

export type TestKind =
  | 'single-page'
  | 'openmaic-legacy'
  | 'html-pipeline'
  | 'chart-showcase'
  | 'html-single-page'
  | 'file-page'
  | 'html-file-page'
  | 'html-lesson'
  | 'html-openmaic-lesson'
  | 'html-notebook'
  | 'ppt-image'
  | 'problem-import-direct-llm'
  | 'problem-image-extraction'
  | 'problem-workspace-ui'
  | 'custom-review';

export type TestSurface = 'slides' | 'chat' | 'problems' | 'review';

export const TEST_SURFACE_STORAGE_KEY = 'syntara-test-center:active-surface';
export const TEST_SURFACES = new Set<TestSurface>(['slides', 'chat', 'problems', 'review']);

export interface TestStatus {
  generatedCount: number;
  errorCount: number;
  lastUpdatedAt: number | null;
}

export interface TestEntry {
  id: TestKind;
  title: string;
  eyebrow: string;
  description: string;
  href: string;
  chips: string[];
  accentClass: string;
  icon: 'file' | 'problem' | 'presentation' | 'code' | 'review';
  deprecated?: boolean;
}

export interface SlideTestSection {
  id: string;
  title: string;
  description: string;
  entries: TestEntry[];
  deprecated?: boolean;
}

export interface ChatTestEntry {
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  href: string;
  disabled?: boolean;
  disabledText?: string;
  chips: string[];
  suggestedPrompt: string;
  icon: 'message' | 'group' | 'notebook' | 'render';
}

export const TEST_ENTRIES: TestEntry[] = [
  {
    id: 'html-pipeline',
    title: 'HTML 生成管线分步测试',
    eyebrow: 'Source → coursePlan → slideOutlines',
    description:
      '独立验收 Source Package、coursePlan、slideOutlines 和 slides[].htmlPrompt，再进入整节课/整本 notebook HTML 生成。',
    href: '/generation-html-pipeline-test',
    chips: ['source package', 'coursePlan', 'slideOutlines', 'htmlPrompt gate'],
    accentClass: 'from-emerald-500 to-blue-400',
    icon: 'code',
  },
  {
    id: 'single-page',
    title: '单页生成质量测试',
    eyebrow: 'SceneOutline / Layout Template',
    description:
      '沿用原来的单页生成链路，测试 SceneOutline、layout template、语义内容渲染和 stage 结果质量。',
    href: '/generation-quality',
    chips: ['scene outline', 'layout template', 'stage render'],
    accentClass: 'from-blue-500 to-cyan-400',
    icon: 'presentation',
  },
  {
    id: 'openmaic-legacy',
    title: 'OpenMAIC-org PDF 整节课生成',
    eyebrow: 'OpenMAIC-org / PDF to classroom',
    description:
      '复刻 OpenMAIC-org 上传 PDF 直接生成完整 classroom 的老链路：parse-pdf → generate-classroom → classroom 回放。',
    href: '/generation-openmaic-test',
    chips: ['PDF upload', 'generate-classroom', 'openmaic-legacy'],
    accentClass: 'from-slate-700 to-blue-500',
    icon: 'presentation',
  },
  {
    id: 'chart-showcase',
    title: '图表样式探索测试',
    eyebrow: 'experimental / old pipeline first',
    description:
      '旧版单页链路作为主线，保留新图表叙事 prompt 仅做同主题 A/B 探索，验证哪些版式提示可以被吸收到旧线路里。',
    href: '/generation-chart-style-test',
    chips: ['old pipeline first', 'experimental prompt', 'same-topic A/B'],
    accentClass: 'from-blue-600 to-emerald-400',
    icon: 'presentation',
  },
  {
    id: 'html-single-page',
    title: 'HTML 单页质量测试',
    eyebrow: 'HTML / 页面类型 / 16:9',
    description:
      '直接让模型生成一张 16:9 HTML/CSS PPT，按介绍、总结、流程、表格、数学、代码、例题检查稳定性。',
    href: '/generation-html-single-page-test',
    chips: ['prompt to html', 'page kind QA', 'iframe preview'],
    accentClass: 'from-sky-500 to-emerald-400',
    icon: 'code',
  },
  {
    id: 'file-page',
    title: '文件逐页生成测试',
    eyebrow: 'testfile / 3 个文件 / 一页一页生成',
    description:
      '读取 testfile 里的 Markdown、PDF、PPTX，转成 SceneOutline 队列，每次只生成当前页，适合检查上下文承接和真实文件输入。',
    href: '/generation-file-test',
    chips: ['generation-file-test', 'testfile fixtures', 'saved generations'],
    accentClass: 'from-violet-500 to-amber-400',
    icon: 'file',
  },
  {
    id: 'html-file-page',
    title: '文件逐页 HTML 生成测试',
    eyebrow: 'testfile / HTML / 逐页生成',
    description:
      '读取同一批 testfile 固定样本，每次只把当前页直接生成一张 16:9 HTML/CSS PPT，用 iframe 检查真实 DOM 版式。',
    href: '/generation-html-file-test',
    chips: ['testfile fixtures', 'prompt to html', 'iframe QA'],
    accentClass: 'from-cyan-500 to-violet-500',
    icon: 'code',
  },
  {
    id: 'html-lesson',
    title: 'HTML 整节课生成测试',
    eyebrow: 'testfile / 页数档位 / 整课规划',
    description:
      '先根据 testfile 文件和页数档位规划整节课，再为每页写 HTML prompt 并一键生成整套 16:9 HTML slides。',
    href: '/generation-html-lesson-test',
    chips: ['lesson plan', 'page budget', 'prompt to html'],
    accentClass: 'from-blue-500 to-emerald-400',
    icon: 'code',
  },
  {
    id: 'html-openmaic-lesson',
    title: 'OpenMAIC 思路 HTML 整课生成',
    eyebrow: 'OpenMAIC outline → old HTML renderer',
    description:
      '新增路线：先用 OpenMAIC 式整课大纲规划教学顺序、互动/测验节点，再交给旧 HTML 单页生成器输出，不改旧 HTML 链路。',
    href: '/generation-html-openmaic-lesson-test',
    chips: ['OpenMAIC spine', 'HTML renderer', 'isolated v2'],
    accentClass: 'from-slate-700 to-emerald-400',
    icon: 'code',
  },
  {
    id: 'html-notebook',
    title: 'HTML 整本笔记本生成测试',
    eyebrow: 'testfile 科目文件 / 页数档位 / 全书规划',
    description:
      '读取 testfile/科目测试 下按科目分组的文件 notebook，先规划整本笔记本，再并行生成每页 16:9 HTML slides。',
    href: '/generation-html-notebook-test',
    chips: ['file notebook', 'subject route', 'parallel html'],
    accentClass: 'from-emerald-500 to-sky-400',
    icon: 'code',
  },
  {
    id: 'ppt-image',
    title: 'OpenAI Image2 PPT 位图生成',
    eyebrow: 'openai-image → gpt-image-2',
    description:
      '把整页 PPT 当作一张图片生成：/api/generate/image → openai-image → gpt-image-2，专门验收课堂板书式 16:9 位图 slide。',
    href: '/generation-ppt-image-test',
    chips: ['image2', 'full-slide bitmap', '16:9 PPT'],
    accentClass: 'from-indigo-600 to-sky-400',
    icon: 'presentation',
  },
  {
    id: 'problem-workspace-ui',
    title: '做题空间 UI 测试',
    eyebrow: 'Structured fixtures → answer workspace',
    description:
      '内置选择、填空、计算、简答、证明和代码题，直接检查做题空间的题面、作答区、代码区和记录面板 UI。',
    href: '/problem-workspace-test',
    chips: ['structured problems', 'answer UI', 'code workspace'],
    accentClass: 'from-sky-500 to-emerald-400',
    icon: 'problem',
  },
  {
    id: 'problem-import-direct-llm',
    title: 'PDF 导题 LLM 直读测试',
    eyebrow: 'PDF → LLM boundaries → Drafts',
    description:
      '让模型直接读取 PDF、判断题目边界并输出题库草稿，用来验证不依赖本地预切题的导入效果。',
    href: '/problem-import-test?mode=direct-llm',
    chips: ['direct pdf read', 'llm boundaries', 'latex drafts'],
    accentClass: 'from-rose-500 to-orange-400',
    icon: 'problem',
  },
  {
    id: 'problem-image-extraction',
    title: '图像题提取测试',
    eyebrow: 'sourceImages → assets.images → preview',
    description:
      '用一条含函数图像的 fixture 验证 PDF 图像能绑定到题目 publicContent.assets.images，并在题库预览里正常显示。',
    href: '/problem-image-extraction-test',
    chips: ['sourceImages', 'question image', 'visual preview'],
    accentClass: 'from-sky-500 to-emerald-400',
    icon: 'problem',
  },
  {
    id: 'custom-review',
    title: '复习计划生成分步测试',
    eyebrow: 'Profile → problemBank → readiness → route',
    description:
      '先验收学生画像、题库与场景 payload，再体检题库，最后调用正式复习路线 API 生成并验收整套复习计划。',
    href: '/custom-review-test',
    chips: ['student profile', 'problemBank gate', 'review route QA'],
    accentClass: 'from-indigo-500 to-emerald-400',
    icon: 'review',
  },
];

const HTML_PIPELINE_TEST_IDS = new Set<TestKind>(['html-pipeline']);
const HTML_VISUAL_EXPERIMENT_TEST_IDS = new Set<TestKind>(['chart-showcase']);
const HTML_OUTPUT_REGRESSION_TEST_IDS = new Set<TestKind>([
  'html-single-page',
  'html-file-page',
  'html-lesson',
  'html-openmaic-lesson',
  'html-notebook',
]);
const PPT_IMAGE_TEST_IDS = new Set<TestKind>(['ppt-image']);
const BUILT_IN_LAYOUT_TEST_IDS = new Set<TestKind>(['single-page', 'file-page']);
const OPENMAIC_LEGACY_TEST_IDS = new Set<TestKind>(['openmaic-legacy']);

export const SLIDE_TEST_SECTIONS: SlideTestSection[] = [
  {
    id: 'html-pipeline',
    title: 'HTML 主流程分步测试',
    description:
      '先逐步验收 Source Package、coursePlan、slideOutlines 和 slides[].htmlPrompt；前一 gate 通过后，才进入后一 gate。',
    entries: TEST_ENTRIES.filter((entry) => HTML_PIPELINE_TEST_IDS.has(entry.id)),
  },
  {
    id: 'html-visual-experiment',
    title: 'HTML 视觉实验',
    description: '验证更像前端 deck 的视觉表达，重点看图表叙事、主题一致性和旧结果对比。',
    entries: TEST_ENTRIES.filter((entry) => HTML_VISUAL_EXPERIMENT_TEST_IDS.has(entry.id)),
  },
  {
    id: 'html-output-regression',
    title: 'HTML 输出回归测试',
    description:
      '这些是不同输入粒度的输出回归入口，不再当作生成逻辑的前后步骤；主流程以分步管线测试为准。',
    entries: TEST_ENTRIES.filter((entry) => HTML_OUTPUT_REGRESSION_TEST_IDS.has(entry.id)),
  },
  {
    id: 'ppt-image',
    title: 'Image2 整页 PPT 位图测试',
    description:
      '专门测试 OpenAI image endpoint 生成完整 16:9 PPT 位图，不经过 HTML/SVG/截图渲染。',
    entries: TEST_ENTRIES.filter((entry) => PPT_IMAGE_TEST_IDS.has(entry.id)),
  },
  {
    id: 'built-in-layout',
    title: '内置版式测试',
    description:
      '已弃用，仅保留作历史回归参考；主链路以 HTML 生成管线为准，不再继续扩展内置 layout template。',
    entries: TEST_ENTRIES.filter((entry) => BUILT_IN_LAYOUT_TEST_IDS.has(entry.id)),
    deprecated: true,
  },
  {
    id: 'openmaic-legacy',
    title: 'OpenMAIC-org 整节课链路',
    description: '上传 PDF 后直接走旧版 OpenMAIC classroom generation，生成整节课并打开回放页。',
    entries: TEST_ENTRIES.filter((entry) => OPENMAIC_LEGACY_TEST_IDS.has(entry.id)),
  },
];

export const SLIDE_TEST_ENTRIES = SLIDE_TEST_SECTIONS.flatMap((section) => section.entries);
export const PROBLEM_IMPORT_TEST_ENTRIES = TEST_ENTRIES.filter(
  (entry) =>
    entry.id.startsWith('problem-import-') ||
    entry.id === 'problem-image-extraction' ||
    entry.id === 'problem-workspace-ui',
).sort((left, right) => Number(left.deprecated || false) - Number(right.deprecated || false));
export const REVIEW_TEST_ENTRIES = TEST_ENTRIES.filter((entry) => entry.id === 'custom-review');

export function problemMetricLabels(entry: TestEntry): { generated: string; error: string } {
  if (entry.id === 'problem-workspace-ui') {
    return { generated: '题目', error: 'UI风险' };
  }
  if (entry.id === 'problem-image-extraction') {
    return { generated: '图像题', error: 'fail' };
  }
  return { generated: '草稿', error: '待修正' };
}

export function readStoredTestSurface(): TestSurface {
  if (typeof window === 'undefined') return 'slides';
  try {
    const queryValue = new URLSearchParams(window.location.search).get('surface');
    if (TEST_SURFACES.has(queryValue as TestSurface)) return queryValue as TestSurface;
    const value = window.localStorage.getItem(TEST_SURFACE_STORAGE_KEY);
    return TEST_SURFACES.has(value as TestSurface) ? (value as TestSurface) : 'slides';
  } catch {
    return 'slides';
  }
}

export function buildChatTestEntries(args: {
  courseId: string | null;
  courseName: string;
  firstNotebook: StageListItem | null;
  notebookCount: number;
}): ChatTestEntry[] {
  const hasCourse = Boolean(args.courseId?.trim());
  const orchestratorPrivateHref = `/chat?agent=${encodeURIComponent(COURSE_ORCHESTRATOR_ID)}`;
  const notebookHref = args.firstNotebook
    ? `/chat?notebook=${encodeURIComponent(args.firstNotebook.id)}`
    : orchestratorPrivateHref;

  return [
    {
      id: 'orchestrator-private',
      title: '课程总控私聊',
      eyebrow: args.courseName || 'Course Orchestrator',
      description: '验证总控能读取当前课程与笔记本页面摘要，直接回答并引用具体来源。',
      href: orchestratorPrivateHref,
      disabled: !hasCourse,
      disabledText: '先进入一门课程',
      chips: ['courseContext', 'citation', 'direct answer'],
      suggestedPrompt: '请根据这门课的笔记，解释一个我现在最应该复习的核心概念，并标明来源。',
      icon: 'message',
    },
    {
      id: 'orchestrator-group',
      title: '总控自动调度',
      eyebrow: `${args.notebookCount || 0} notebooks`,
      description: '验证单笔记本会转发给对应笔记本，多笔记本才由总控自动创建或复用群聊。',
      href: orchestratorPrivateHref,
      disabled: !hasCourse,
      disabledText: '先进入一门课程',
      chips: ['route decision', 'single handoff', 'group only when multi'],
      suggestedPrompt: '综合比较这门课里最相关的几个笔记本，把它们串成一条复习路线。',
      icon: 'group',
    },
    {
      id: 'notebook-direct',
      title: '笔记本直聊',
      eyebrow: args.firstNotebook?.name || 'Notebook QA',
      description: '验证笔记本问答仍优先显示结构化 answerDocument，fallback 文本支持富文本。',
      href: notebookHref,
      disabled: !args.firstNotebook,
      disabledText: hasCourse ? '当前课程暂无笔记本' : '先进入一门课程',
      chips: ['answerDocument', 'fallback markdown', 'references'],
      suggestedPrompt: '请总结这个笔记本的前三页，并给我一个带公式或代码块的例子。',
      icon: 'notebook',
    },
    {
      id: 'rich-rendering',
      title: 'Markdown / 公式渲染',
      eyebrow: 'Streamdown',
      description: '验证 Agent 气泡能正确渲染列表、代码块、行内/块级公式。',
      href: orchestratorPrivateHref,
      disabled: !hasCourse,
      disabledText: '先进入一门课程',
      chips: ['markdown', 'latex', 'code block'],
      suggestedPrompt:
        '用 Markdown 列表、一个 TypeScript 代码块和一个 LaTeX 公式解释这节课的一个知识点。',
      icon: 'render',
    },
  ];
}

export const EMPTY_TEST_STATUS: TestStatus = {
  generatedCount: 0,
  errorCount: 0,
  lastUpdatedAt: null,
};
