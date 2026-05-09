'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileJson,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { SceneRenderer } from '@/components/stage/scene-renderer';
import { SceneProvider } from '@/lib/contexts/scene-context';
import { getApiHeaders } from '@/lib/create/generation-headers';
import { DEFAULT_SLIDE_GENERATION_ROUTE } from '@/lib/generation/slide-generation-route';
import { markSemanticSlideContent } from '@/lib/notebook-content/semantic-slide-render';
import { useCanvasStore } from '@/lib/store/canvas';
import { useStageStore } from '@/lib/store/stage';
import type { NotebookContentBlock, NotebookContentDocument } from '@/lib/notebook-content';
import type {
  GeneratedSlideContent,
  SceneLayoutIntent,
  SceneOutline,
} from '@/lib/types/generation';
import type { Scene, SceneGenerationDiagnostics, SlideContent, Stage } from '@/lib/types/stage';
import type { PPTElement, PPTImageElement, Slide, SlideTheme } from '@/lib/types/slides';
import { backendFetch } from '@/lib/utils/backend-api';
import { resolveBuiltInHeroBackgroundSource } from '@/lib/constants/slide-backgrounds';
import { cn } from '@/lib/utils';

const QA_STAGE_ID = 'single-page-generation-quality';

function getGenerationQualityHeaders(): HeadersInit {
  const headers = new Headers(getApiHeaders({ imageGenerationEnabled: false }));
  headers.set('x-generation-test-no-charge', 'true');
  return headers;
}

const DEFAULT_OUTLINE_DESCRIPTION = [
  '本页用 Tweet 的 list/dict 表示作为失败案例，说明旧表示能存数据但守不住对象状态规则。',
  '学生应从 Tweet() 入口先判断对象需要哪些字段、哪些错误状态会被旧表示接受，再看到定义类的必要性。',
].join('\n');

const DEFAULT_TITLE = '从 Tweet() 看：旧表示为什么守不住规则';
const DEFAULT_KEY_POINTS = [
  "合法 list: ['David', '2017-09-19', 'Hello, I am so cool', 0]。",
  "错误 list: [55, 'Diane', 'Older and even cooler', '2017-09-19'] 会把 likes、userid、content、date 的位置和类型弄乱。",
  "缺少日期的 dict: {'userid': 'Jacqueline', 'content': 'Has the most dignified cat', 'likes': 12} 仍然可能被客户端传来。",
  'Tweet 需要作者、日期、内容、点赞数；客户端代码可以直接操作 list 和 dict。',
  '结论落到为什么要定义 Tweet()：字段名字、初始化和操作边界集中在类里。',
];

const LAYOUT_OPTIONS = [
  {
    value: 'image_title_overlay',
    label: 'image_title_overlay',
    hint: '图片铺满 + 左侧标题遮罩，适合杂志/自然/课程导入封面。',
  },
  {
    value: 'cinematic_title_frame',
    label: 'cinematic_title_frame',
    hint: '电影感暗色图片 + 居中标题 + 角标，适合影像/文学/艺术主题。',
  },
  {
    value: 'tech_hero_title',
    label: 'tech_hero_title',
    hint: '暗色科技背景 + 居中标题，适合 SaaS/AI/产品发布封面。',
  },
  {
    value: 'pipeline_table',
    label: 'pipeline_table',
    hint: '上方流程 + 下方对照表，适合讲“从问题到结论”。',
  },
  {
    value: 'comparison_matrix',
    label: 'comparison_matrix',
    hint: '对照表/矩阵为主，适合方案、维度、优缺点或证据比较。',
  },
  {
    value: 'process_steps',
    label: 'process_steps',
    hint: '流程图/步骤图为主，适合讲路径、阶段、决策或工作流。',
  },
  {
    value: 'visual_three_steps',
    label: 'visual_three_steps',
    hint: '解释 + 图示 + 三步卡片，适合讲判断顺序。',
  },
  {
    value: 'two_by_one_summary',
    label: 'two_by_one_summary',
    hint: '上方两栏 + 底部总结，适合收束与优缺点。',
  },
  {
    value: 'three_cards',
    label: 'three_cards',
    hint: '三张并列概念卡，适合讲清 3 个并列概念或判断维度。',
  },
  {
    value: 'text_image_split',
    label: 'text_image_split',
    hint: '左侧文本 + 右侧图片，适合用一个图支撑一个核心判断。',
  },
  {
    value: 'four_columns',
    label: 'four_columns',
    hint: '四栏并列，适合 4 个阶段、类别、原则或误区。',
  },
  {
    value: 'grid_2x2',
    label: 'grid_2x2',
    hint: '2x2 网格，适合四象限、两组对比或 4 个分组概念。',
  },
  {
    value: 'two_text_image',
    label: 'two_text_image',
    hint: '左侧上下两块文本 + 右侧图片，适合“问题/规则”或“先看/再看”。',
  },
  {
    value: 'code_split',
    label: 'code_split',
    hint: '代码 + 追踪说明，适合讲 __init__、self、状态变化。',
  },
] as const;

const DECK_STYLE_OPTIONS = [
  { value: 'classic_business', label: 'Classic Business' },
  { value: 'academic', label: 'Academic' },
  { value: 'tech_saas', label: 'Tech / SaaS' },
  { value: 'magazine', label: 'Magazine' },
  { value: 'product_launch', label: 'Product Launch' },
  { value: 'dark_art', label: 'Dark Art' },
  { value: 'nature_documentary', label: 'Nature Documentary' },
] as const;

type LayoutOptionValue = (typeof LAYOUT_OPTIONS)[number]['value'];
type DeckStyleValue = (typeof DECK_STYLE_OPTIONS)[number]['value'];
type QualityStatus = 'pass' | 'warn' | 'fail';
type TestListStatus = QualityStatus | 'pending' | 'error';
type TestStatusFilter = 'all' | TestListStatus;

const TEST_LIST_PAGE_SIZE = 8;

interface QualityPreset {
  id: string;
  label: string;
  description: string;
  title: string;
  outlineDescription: string;
  keyPoints: string[];
  language?: 'zh-CN' | 'en-US';
  layoutTemplate: LayoutOptionValue;
  deckStyle: DeckStyleValue;
  contentProfile: NonNullable<SceneOutline['contentProfile']>;
  archetype: NonNullable<SceneOutline['archetype']>;
  disciplineStyle: NonNullable<SceneLayoutIntent['disciplineStyle']>;
  teachingFlow: NonNullable<SceneLayoutIntent['teachingFlow']>;
  visualRole: NonNullable<SceneLayoutIntent['visualRole']>;
  overflowPolicy?: NonNullable<SceneLayoutIntent['overflowPolicy']>;
  preserveFullProblemStatement?: boolean;
  teachingRole: NonNullable<SceneOutline['teachingRole']>;
  teachingObjective: string;
  openingMove: string;
  concreteAnchor: string;
  studentThinkingMove: string;
  transferRule: string;
  requiredComponentKinds: NonNullable<SceneOutline['requiredComponentKinds']>;
  expectedAnchors: string[];
  mediaGenerations?: SceneOutline['mediaGenerations'];
  workedExampleConfig?: SceneOutline['workedExampleConfig'];
  sharedExamples?: SceneOutline['sharedExamples'];
  usesExampleIds?: SceneOutline['usesExampleIds'];
  continuity?: SceneOutline['continuity'];
}

interface QualityCheck {
  status: QualityStatus;
  label: string;
  detail: string;
}

interface SceneContentResponse {
  success?: boolean;
  error?: string;
  details?: string;
  content?: unknown;
  contents?: unknown[];
  effectiveOutline?: SceneOutline;
  effectiveOutlines?: SceneOutline[];
  generationDiagnostics?: SceneGenerationDiagnostics;
}

interface PromptPreviewResponse {
  success?: boolean;
  error?: string;
  details?: string;
  promptId?: string;
  slideGenerationRoute?: string;
  templateDriven?: boolean;
  effectiveOutline?: SceneOutline;
  systemPrompt?: string | null;
  userPrompt?: string | null;
  promptVariables?: Record<string, string>;
  mediaContextText?: string;
  visionImageCount?: number;
}

interface GenerationResult {
  scene: Scene;
  outline: SceneOutline;
  rawResponse: SceneContentResponse;
  generatedContentCount: number;
  createdAt: number;
}

interface PromptPreviewResult {
  response: PromptPreviewResponse;
  createdAt: number;
}

interface GenerationErrorResult {
  message: string;
  details?: string;
  diagnostics?: SceneGenerationDiagnostics;
  rawDetails?: unknown;
  httpStatus?: number;
  createdAt: number;
}

interface PresetInputState {
  title: string;
  outlineDescription: string;
  keyPointsText: string;
  layoutTemplate: LayoutOptionValue;
  deckStyle: DeckStyleValue;
  language: 'zh-CN' | 'en-US';
  updatedAt?: number;
}

type GenerationResultsByPreset = Partial<Record<string, GenerationResult>>;
type PromptPreviewsByPreset = Partial<Record<string, PromptPreviewResult>>;
type ErrorsByPreset = Partial<Record<string, GenerationErrorResult>>;
type PresetInputsByPreset = Partial<Record<string, PresetInputState>>;

interface GenerationQualitySavedState {
  selectedPresetId?: string;
  inputsByPreset?: PresetInputsByPreset;
  resultsByPreset?: GenerationResultsByPreset;
  errorsByPreset?: ErrorsByPreset;
  promptPreviewErrorsByPreset?: ErrorsByPreset;
}

const CODE_SPLIT_SNIPPET = [
  'class Tweet:',
  '    def __init__(self, who: str, when: date, what: str) -> None:',
  '        self.userid = who',
  '        self.created_at = when',
  '        self.content = what',
  '        self.likes = 0',
  '',
  "t1 = Tweet('Giovanna', date(2017, 9, 18), 'Hello')",
].join('\n');

const TWEET_SHARED_EXAMPLE: NonNullable<SceneOutline['sharedExamples']>[number] = {
  id: 'tweet_object_example',
  label: 'Tweet',
  aliases: ['Tweet', 'Tweet()', 'tweet', 't1'],
  description:
    '贯穿本组页面的 OOP 例子：一条 Tweet 需要把作者、日期、内容、点赞数作为同一对象的状态来维护。',
  canonicalData: [
    "合法 list: ['David', '2017-09-19', 'Hello, I am so cool', 0]",
    'Tweet 状态字段: userid, created_at, content, likes',
  ],
  malformedData: [
    "错误 list: [55, 'Diane', 'Older and even cooler', '2017-09-19']",
    "缺少日期的 dict: {'userid': 'Jacqueline', 'content': 'Has the most dignified cat', 'likes': 12}",
  ],
  rules: [
    'list 守不住字段名字和顺序语义。',
    'dict 守不住初始化完整性和允许操作边界。',
    'Tweet 类应该集中字段、初始化和点赞等操作。',
  ],
  lessonRole: '用同一个 Tweet 例子连接旧表示失败、类的边界和 self/初始化。',
};

const QUALITY_PRESETS: QualityPreset[] = [
  {
    id: 'hero_courtyard_overlay',
    label: '图片封面',
    description: '测试整页图片 + 左侧标题遮罩的课程导入/章节封面。',
    title: '第一次打造小院就成功',
    outlineDescription:
      '本页是课程开场封面，用一个温暖庭院场景承接主题，让学生先进入“从规划到落地”的学习情境。',
    keyPoints: [
      '从规划到养护，系统梳理小院打造的关键路径。',
      '面向第一次做庭院的人，强调可执行和少踩坑。',
    ],
    layoutTemplate: 'image_title_overlay',
    deckStyle: 'magazine',
    contentProfile: 'general',
    archetype: 'intro',
    disciplineStyle: 'general',
    teachingFlow: 'standalone',
    visualRole: 'source_image',
    overflowPolicy: 'compress_first',
    teachingRole: 'concept_model',
    teachingObjective: '学生能用一个清晰入口理解本课程围绕小院打造展开。',
    openingMove: '先用庭院场景建立本节课的主题和对象。',
    concreteAnchor: '第一次打造小院：从规划到养护，少走弯路。',
    studentThinkingMove: '让学生先判断自己要解决的是空间规划、植物选择还是维护路径。',
    transferRule: '开场封面只建立主题、对象和学习入口。',
    requiredComponentKinds: ['example'],
    expectedAnchors: ['小院', '规划'],
  },
  {
    id: 'hero_cinematic_mv',
    label: '电影封面',
    description: '测试暗色电影/MV/艺术主题封面：居中标题、暗色遮罩、装饰角标。',
    title: '深度解析《太阳之子》MV',
    outlineDescription:
      '本页是影像解析章节封面，用电影感主视觉建立观看角度：画面、人物、主题如何彼此呼应。',
    keyPoints: [
      '从画面构图、叙事线索和主题隐喻三个角度进入。',
      '把学生注意力从“看到了什么”带到“为什么这样拍”。',
    ],
    layoutTemplate: 'cinematic_title_frame',
    deckStyle: 'dark_art',
    contentProfile: 'general',
    archetype: 'intro',
    disciplineStyle: 'humanities',
    teachingFlow: 'close_reading',
    visualRole: 'source_image',
    overflowPolicy: 'compress_first',
    teachingRole: 'evidence_frame',
    teachingObjective: '学生能带着明确解析角度进入影像文本。',
    openingMove: '先建立这段 MV 的观看框架。',
    concreteAnchor: '《太阳之子》MV：画面、人物、主题三条线索。',
    studentThinkingMove: '让学生先找一个画面细节，再说它可能服务什么主题。',
    transferRule: '影像解析先定观察角度，再进入证据。',
    requiredComponentKinds: ['quote'],
    expectedAnchors: ['太阳之子', 'MV'],
  },
  {
    id: 'hero_tech_subscription',
    label: '科技封面',
    description: '测试暗色科技/SaaS 封面：抽象网络背景、居中标题、短副标题。',
    title: 'Claude AI Subscription Plans',
    outlineDescription:
      'This cover opens a pricing and feature comparison deck with a clean tech/SaaS visual tone.',
    keyPoints: [
      'Complete guide to pricing, features and best value.',
      'Make the title readable over a dark abstract network background.',
    ],
    language: 'en-US',
    layoutTemplate: 'tech_hero_title',
    deckStyle: 'tech_saas',
    contentProfile: 'general',
    archetype: 'intro',
    disciplineStyle: 'general',
    teachingFlow: 'standalone',
    visualRole: 'source_image',
    overflowPolicy: 'compress_first',
    teachingRole: 'comparison',
    teachingObjective:
      'Learners enter a pricing comparison deck with the product and promise clear.',
    openingMove: 'Start from the product and what decision this deck helps make.',
    concreteAnchor: 'Claude AI subscription plans: pricing, features, and best value.',
    studentThinkingMove: 'Ask which plan dimension matters before comparing numbers.',
    transferRule:
      'A tech cover should make product, category, and decision promise immediately visible.',
    requiredComponentKinds: ['chart'],
    expectedAnchors: ['Claude AI', 'pricing'],
  },
  {
    id: 'common_project_pipeline',
    label: '通用流程表',
    description: '测试大众商务/课堂 PPT：上方阶段流程，下方输入、动作、输出对照表。',
    title: '四阶段完成一次课程项目',
    outlineDescription: [
      '本页面向普通课程项目管理，把一次项目从选题到复盘拆成四个阶段。',
      '页面应先给出横向流程，再用表格说明每个阶段的输入、主要动作和产出。',
    ].join('\n'),
    keyPoints: [
      '阶段 1：定题，明确要解决的问题和提交标准。',
      '阶段 2：收集材料，把案例、数据和参考资料放到同一工作区。',
      '阶段 3：制作初稿，先完成可讲清楚的版本，再修视觉和细节。',
      '阶段 4：演示复盘，用反馈决定下一轮修改。',
    ],
    layoutTemplate: 'pipeline_table',
    deckStyle: 'classic_business',
    contentProfile: 'general',
    archetype: 'concept',
    disciplineStyle: 'general',
    teachingFlow: 'concept_explain',
    visualRole: 'diagram',
    teachingRole: 'concept_model',
    teachingObjective: '学生能把一个项目拆成阶段、输入、动作和产出。',
    openingMove: '先把完整项目看成一条可执行流程，而不是一堆零散任务。',
    concreteAnchor: '一次课程项目：定题、收集材料、制作初稿、演示复盘。',
    studentThinkingMove: '让学生判断自己当前卡在哪个阶段，以及缺的是输入、动作还是产出。',
    transferRule: '讲流程时先画阶段，再用表格对齐每阶段的输入、动作和输出。',
    requiredComponentKinds: ['table'],
    expectedAnchors: ['定题', '初稿', '复盘'],
  },
  {
    id: 'common_comparison_matrix',
    label: '通用对照表',
    description: '测试以表格/矩阵为主体的普通 PPT：按维度比较多个方案。',
    title: '三种课程交付方案怎么选',
    outlineDescription: [
      '本页面向课程团队比较三种交付方案：手工整理、统一模板和自动生成。',
      '页面应以对照表为主体，按速度、一致性、维护成本和适用场景组织判断。',
    ].join('\n'),
    keyPoints: [
      '方案 A：手工整理，启动快，但一致性和维护成本最不稳定。',
      '方案 B：统一模板，速度中等，一致性最高，适合多人协作。',
      '方案 C：自动生成，批量效率最高，但需要明确输入规范和质检。',
      '选择规则：一次性任务看速度，长期协作看一致性，批量生产看自动化边界。',
    ],
    layoutTemplate: 'comparison_matrix',
    deckStyle: 'academic',
    contentProfile: 'general',
    archetype: 'concept',
    disciplineStyle: 'general',
    teachingFlow: 'comparison_review',
    visualRole: 'none',
    teachingRole: 'comparison',
    teachingObjective: '学生能用多个维度比较方案，而不是只凭单一偏好选择。',
    openingMove: '先把“哪个好”拆成速度、一致性、维护成本和适用场景四个维度。',
    concreteAnchor:
      '三种方案：手工整理、统一模板、自动生成；四个维度：速度、一致性、维护成本、适用场景。',
    studentThinkingMove: '让学生先选一个最重要的维度，再用表格解释选择理由。',
    transferRule: '做方案比较时，先列方案，再列维度，最后把选择规则写成一句话。',
    requiredComponentKinds: ['table'],
    expectedAnchors: ['手工整理', '统一模板', '自动生成'],
  },
  {
    id: 'common_process_flowchart',
    label: '通用流程图',
    description: '测试以流程图/步骤图为主体的普通 PPT：只画路径，不混成表格。',
    title: '从需求到发布的五步流程',
    outlineDescription: [
      '本页面向产品/课程项目说明一次需求从收集到发布的标准路径。',
      '页面应以流程图为主体，让学生看到每一步的动作和下一步进入条件。',
    ].join('\n'),
    keyPoints: [
      '收集需求：记录用户原话和出现频率。',
      '归类问题：把相似反馈合并成同一个问题。',
      '确定方案：写清楚要改什么、不改什么。',
      '制作验证：先做可测试版本，用真实场景检查。',
      '发布复盘：上线后看数据和反馈，决定下一轮。',
    ],
    layoutTemplate: 'process_steps',
    deckStyle: 'tech_saas',
    contentProfile: 'general',
    archetype: 'concept',
    disciplineStyle: 'general',
    teachingFlow: 'timeline_story',
    visualRole: 'diagram',
    teachingRole: 'concept_model',
    teachingObjective: '学生能把一个交付流程拆成有进入条件的连续步骤。',
    openingMove: '先把需求交付看成一条可检查的路径，而不是一次性完成的任务。',
    concreteAnchor: '需求路径：收集需求 → 归类问题 → 确定方案 → 制作验证 → 发布复盘。',
    studentThinkingMove: '让学生判断自己当前需求卡在哪一步，以及下一步进入条件是什么。',
    transferRule: '画流程图时，每一步都要写动作，并说明它如何进入下一步。',
    requiredComponentKinds: ['chart'],
    expectedAnchors: ['收集需求', '确定方案', '发布复盘'],
  },
  {
    id: 'common_feature_text_image',
    label: '通用左右图文',
    description: '测试最常见的左文本、右图片版式：一个核心观点配一个视觉证据。',
    title: '把用户反馈变成可执行需求',
    outlineDescription: [
      '本页讲产品迭代中如何从用户反馈提炼需求。',
      '左侧应保留短文本讲清判断，右侧用图示呈现反馈、问题、需求之间的关系。',
      '样本反馈是：“导出课程报告太慢，开会前经常来不及。”',
    ].join('\n'),
    keyPoints: [
      '样本反馈：导出课程报告太慢，开会前经常来不及。',
      '先抽问题：报告导出耗时过长，影响会前准备。',
      '再写需求：支持后台导出并在完成后提醒用户。',
      '补验收标准：10 页报告 2 分钟内完成；超时也要给完成通知。',
    ],
    layoutTemplate: 'text_image_split',
    deckStyle: 'tech_saas',
    contentProfile: 'general',
    archetype: 'concept',
    disciplineStyle: 'general',
    teachingFlow: 'concept_explain',
    visualRole: 'generated_image',
    teachingRole: 'concept_model',
    teachingObjective: '学生能从反馈、问题、需求三个层次区分产品输入。',
    openingMove: '先把用户说的话和真正要解决的问题分开。',
    concreteAnchor:
      '样本反馈：`导出课程报告太慢，开会前经常来不及`；问题：`报告导出耗时过长`；需求：`后台导出并提醒`；验收：`10 页报告 2 分钟内完成，超时也通知`。',
    studentThinkingMove: '让学生把一句用户抱怨改写成一个可执行需求。',
    transferRule: '遇到反馈时，先抽问题，再写需求，最后补验收标准。',
    requiredComponentKinds: ['example'],
    expectedAnchors: ['导出课程报告太慢', '后台导出', '验收'],
    mediaGenerations: [
      {
        type: 'image',
        elementId: 'gen_img_1',
        aspectRatio: '16:9',
        style: 'clean product workflow diagram',
        prompt:
          'A clean product workflow diagram showing a slow report export user complaint becoming a grouped problem, then a background export requirement with acceptance criteria. Minimal SaaS classroom style.',
      },
    ],
  },
  {
    id: 'common_four_principles',
    label: '通用四栏',
    description: '测试四个并列原则/卖点/检查项的普通 PPT 版式。',
    title: '一次好汇报的四个基本原则',
    outlineDescription: [
      '本页总结普通课堂和工作汇报都适用的四个原则。',
      '页面应是四栏并列，每栏只放一个原则和一句可执行说明。',
    ].join('\n'),
    keyPoints: [
      '先说结论：听众先知道你要证明什么。',
      '证据具体：用数据、案例或对比支撑判断。',
      '结构清楚：每一页只承担一个推进任务。',
      '行动明确：最后说明下一步谁做什么。',
    ],
    layoutTemplate: 'four_columns',
    deckStyle: 'classic_business',
    contentProfile: 'general',
    archetype: 'summary',
    disciplineStyle: 'general',
    teachingFlow: 'concept_explain',
    visualRole: 'none',
    teachingRole: 'synthesis',
    teachingObjective: '学生能用四个原则检查自己的汇报是否清楚。',
    openingMove: '先给出判断标准，再让学生回头检查自己的页面。',
    concreteAnchor: '结论、证据、结构、行动。',
    studentThinkingMove: '让学生挑一页自己的汇报，判断它缺的是哪一个原则。',
    transferRule: '普通汇报页先看四件事：结论、证据、结构、行动。',
    requiredComponentKinds: [],
    expectedAnchors: ['结论', '证据', '行动'],
  },
  {
    id: 'common_priority_grid',
    label: '通用 2x2',
    description: '测试 2x2 四象限版式：按两个维度组织判断。',
    title: '用 2x2 判断任务优先级',
    outlineDescription: [
      '本页用影响力和紧急度两个维度，把任务分成四类。',
      '学生要看到 2x2 不是装饰，而是把判断标准显式化。',
    ].join('\n'),
    keyPoints: [
      '高影响、高紧急：马上处理，并同步风险。',
      '高影响、低紧急：排进计划，提前准备资源。',
      '低影响、高紧急：快速处理或委托。',
      '低影响、低紧急：延后、合并或取消。',
    ],
    layoutTemplate: 'grid_2x2',
    deckStyle: 'academic',
    contentProfile: 'general',
    archetype: 'concept',
    disciplineStyle: 'general',
    teachingFlow: 'concept_explain',
    visualRole: 'none',
    teachingRole: 'concept_model',
    teachingObjective: '学生能用两个维度解释任务优先级，而不是只凭感觉排序。',
    openingMove: '把优先级从一句主观判断拆成两个维度。',
    concreteAnchor: '影响力 × 紧急度。',
    studentThinkingMove: '让学生把一个任务放进四象限，并说出放置理由。',
    transferRule: '用 2x2 时，先定义两个维度，再解释每个象限该怎么行动。',
    requiredComponentKinds: [],
    expectedAnchors: ['影响力', '紧急度', '委托'],
  },
  {
    id: 'common_problem_rule_image',
    label: '通用双文本图',
    description: '测试左侧上下两块文本、右侧图片：上面讲问题，下面给规则。',
    title: '从问题现象走到判断规则',
    outlineDescription: [
      '本页适合讲“先看现象，再抽规则”的普通教学场景。',
      '左侧上块说明问题现象，下块给出判断规则；右侧用图示把两者连接起来。',
    ].join('\n'),
    keyPoints: [
      '现象：团队反复讨论，但每次都停在个别案例上。',
      '规则：先确认共同模式，再决定是否需要流程、工具或职责调整。',
      '迁移：把零散现象归类，才能形成下次也能用的判断。',
    ],
    layoutTemplate: 'two_text_image',
    deckStyle: 'magazine',
    contentProfile: 'general',
    archetype: 'bridge',
    disciplineStyle: 'general',
    teachingFlow: 'concept_explain',
    visualRole: 'generated_image',
    teachingRole: 'synthesis',
    teachingObjective: '学生能从具体问题抽出可迁移规则。',
    openingMove: '先承认现象，再把现象背后的共同结构找出来。',
    concreteAnchor: '反复讨论个别案例 → 找共同模式 → 定规则。',
    studentThinkingMove: '让学生把一个具体抱怨改写成“现象、模式、规则”三句话。',
    transferRule: '讲问题时先分清现象和规则，再用图把迁移路径画出来。',
    requiredComponentKinds: ['example'],
    expectedAnchors: ['现象', '规则', '共同模式'],
    mediaGenerations: [
      {
        type: 'image',
        elementId: 'gen_img_1',
        aspectRatio: '16:9',
        style: 'clean reasoning diagram',
        prompt:
          'A clean reasoning diagram showing scattered cases grouped into a common pattern, then converted into a reusable rule. Warm editorial classroom style.',
      },
    ],
  },
  {
    id: 'pipeline_tweet_representation',
    label: '流程 + 对照表',
    description: '测试普通课堂最常见的“判断路径 + 证据表”页面。',
    title: DEFAULT_TITLE,
    outlineDescription: DEFAULT_OUTLINE_DESCRIPTION,
    keyPoints: DEFAULT_KEY_POINTS,
    layoutTemplate: 'pipeline_table',
    deckStyle: 'academic',
    contentProfile: 'general',
    archetype: 'concept',
    disciplineStyle: 'code',
    teachingFlow: 'comparison_review',
    visualRole: 'diagram',
    teachingRole: 'comparison',
    teachingObjective:
      '学生能从具体的 list/dict 错误状态看出旧表示守不住对象规则，并理解为什么要把边界集中到 Tweet 类里。',
    openingMove: '从 Tweet() 这个入口追问旧表示守不住哪些对象规则。',
    concreteAnchor: [
      "合法 list: ['David', '2017-09-19', 'Hello, I am so cool', 0]",
      "错误 list: [55, 'Diane', 'Older and even cooler', '2017-09-19']",
      "缺少日期的 dict: {'userid': 'Jacqueline', 'content': 'Has the most dignified cat', 'likes': 12}",
    ].join('\n'),
    studentThinkingMove:
      '先找旧表示仍会接受的错误状态，再判断哪些字段和规则应该集中到 Tweet 类里。',
    transferRule: '写类前先问：对象状态是什么、旧表示守不住什么、类要集中哪些边界。',
    requiredComponentKinds: ['table'],
    expectedAnchors: ['David', 'Diane', 'Jacqueline', 'Tweet()'],
  },
  {
    id: 'visual_three_steps_class_design',
    label: '图示 + 三步',
    description: '测试“解释、图示、三步卡片”的课堂讲授页。',
    title: '写类前的三步判断',
    outlineDescription: [
      '本页把写类前的思考拆成三个判断：先确认对象，再列状态，最后定边界。',
      '学生要看到类不是术语表，而是一套把字段、初始化和操作放在一起维护的设计。',
    ].join('\n'),
    keyPoints: [
      '先问：Tweet 是不是一个需要长期维护状态的对象。',
      '再列状态：userid、created_at、content、likes 必须一起移动。',
      '最后定边界：初始化、读取/修改、点赞操作由 Tweet 集中管理。',
      '用类当蓝图：每个实例按同一结构保存自己的属性值。',
    ],
    layoutTemplate: 'visual_three_steps',
    deckStyle: 'tech_saas',
    contentProfile: 'general',
    archetype: 'concept',
    disciplineStyle: 'code',
    teachingFlow: 'concept_explain',
    visualRole: 'generated_image',
    teachingRole: 'concept_model',
    teachingObjective: '学生能把“写类”转化成对象、状态、边界三个可执行判断。',
    openingMove: '先不写代码，先把 Tweet() 当作一个需要被维护的对象入口。',
    concreteAnchor:
      'Tweet 至少有 userid、created_at、content、likes 四个状态；这些状态不能散落在多个 list、dict 或临时变量里。',
    studentThinkingMove:
      '让学生按“对象是什么、状态有哪些、边界在哪里”的顺序重新组织刚才的失败案例。',
    transferRule: '遇到类设计题，先做三步判断：对象、状态、边界。',
    requiredComponentKinds: ['example'],
    expectedAnchors: ['userid', 'created_at', 'content', 'likes'],
    mediaGenerations: [
      {
        type: 'image',
        elementId: 'gen_img_1',
        aspectRatio: '16:9',
        style: 'clean classroom diagram',
        prompt:
          'A clean lecture slide diagram showing a Tweet object blueprint connected to four fields: userid, created_at, content, likes, then arrows to initialization and allowed operations. Minimal, readable, academic tech style.',
      },
    ],
  },
  {
    id: 'summary_two_by_one',
    label: '两栏 + 总结',
    description: '测试收束页：上方两组要点，底部一句可迁移结论。',
    title: '收束：下次写类前，先问哪三个问题？',
    outlineDescription: [
      '本页收束 Tweet 例子，把旧表示失败和类的职责并排放在一起。',
      '学生最后带走的不是术语，而是下一次写类前可重复使用的检查链。',
    ].join('\n'),
    keyPoints: [
      '旧表示的问题：位置、字段名、缺失字段和非法操作都可能被客户端代码绕过。',
      '类的职责：集中字段名字、初始化逻辑、允许的读写和对象操作。',
      '迁移结论：先问对象，再问旧表示会不会失守，最后再写类。',
    ],
    layoutTemplate: 'two_by_one_summary',
    deckStyle: 'classic_business',
    contentProfile: 'general',
    archetype: 'summary',
    disciplineStyle: 'code',
    teachingFlow: 'comparison_review',
    visualRole: 'none',
    teachingRole: 'synthesis',
    teachingObjective: '学生能把 Tweet 例子的判断顺序迁移到下一道类设计题。',
    openingMove: '回到 Tweet()：这节课最后要留下的是一条写类前的检查链。',
    concreteAnchor: 'list/dict 会接受错误状态；Tweet 类应该集中字段、初始化和操作边界。',
    studentThinkingMove: '让学生把“旧表示失守”和“类集中边界”分别归纳成两组短要点。',
    transferRule: '下次写类前先问：对象是什么、旧表示哪里失守、类要集中什么边界。',
    requiredComponentKinds: [],
    expectedAnchors: ['Tweet()', 'list', 'dict'],
  },
  {
    id: 'three_cards_core_terms',
    label: '三张概念卡',
    description: '测试最普通的概念辨析页：三张卡片并列，不靠长段落。',
    title: '类、实例、属性：先分清三件事',
    outlineDescription: [
      '本页用三张概念卡区分类、实例、属性，帮助学生把后面的 self 和点号访问放到正确位置。',
      '每张卡只讲一个概念，并用 Tweet 的例子落地。',
    ].join('\n'),
    keyPoints: [
      '类：给对象规定字段和操作，是创建 Tweet 对象的蓝图。',
      '实例：按蓝图创建出来的具体对象，例如 t1 这一条推文。',
      '属性：挂在实例上的状态，例如 t1.userid 和 t1.likes。',
    ],
    layoutTemplate: 'three_cards',
    deckStyle: 'magazine',
    contentProfile: 'general',
    archetype: 'definition',
    disciplineStyle: 'code',
    teachingFlow: 'definition_to_example',
    visualRole: 'none',
    teachingRole: 'concept_model',
    teachingObjective: '学生能区分类、实例和属性，并能把 Tweet 例子对应到三者。',
    openingMove: '先把三个词分开，后面看到 self 和点号时就不会混在一起。',
    concreteAnchor: 'Tweet 是类，t1 是实例，t1.userid / t1.likes 是属性。',
    studentThinkingMove: '让学生把每个术语都配一个 Tweet 例子，而不是背定义。',
    transferRule: '读面向对象代码时，先标出类、实例、属性三类东西。',
    requiredComponentKinds: ['example'],
    expectedAnchors: ['Tweet', 't1', 'userid'],
  },
  {
    id: 'text_image_object_blueprint',
    label: '文本 + 图片',
    description: '测试左文右图：一个核心判断配一张对象蓝图。',
    title: '把 Tweet 当作一个要维护的对象',
    outlineDescription: [
      '本页不急着进入代码，而是先把 Tweet 看成一个需要长期维护的对象。',
      '学生要通过右侧对象蓝图看到 userid、created_at、content、likes 不是四个散开的变量，而是同一条推文的状态。',
    ].join('\n'),
    keyPoints: [
      'Tweet 的四个字段描述同一条推文，应该一起保存和移动。',
      '如果字段散落在 list、dict 或临时变量里，客户端代码就容易绕过顺序、类型和缺失字段规则。',
      '类的价值是把字段名字、初始化入口和允许的操作放到同一个对象边界里。',
    ],
    layoutTemplate: 'text_image_split',
    deckStyle: 'academic',
    contentProfile: 'general',
    archetype: 'concept',
    disciplineStyle: 'code',
    teachingFlow: 'concept_explain',
    visualRole: 'generated_image',
    teachingRole: 'concept_model',
    teachingObjective: '学生能把 Tweet 从一组字段提升为一个有状态边界的对象。',
    openingMove: '先看对象蓝图，再问哪些状态必须被同一个对象维护。',
    concreteAnchor: 'Tweet 有 userid、created_at、content、likes 四个字段；它们属于同一条推文。',
    studentThinkingMove: '让学生指出图中的字段为什么不该散落到多个 list、dict 或临时变量里。',
    transferRule: '看到多个字段长期一起出现时，先判断它们是不是同一个对象的状态。',
    requiredComponentKinds: ['example'],
    expectedAnchors: ['Tweet', 'userid', 'likes'],
    mediaGenerations: [
      {
        type: 'image',
        elementId: 'gen_img_1',
        aspectRatio: '16:9',
        style: 'clean academic object diagram',
        prompt:
          'A clean academic diagram of a Tweet object as one container with fields userid, created_at, content, likes connected inside the same boundary. Minimal tech classroom style.',
      },
    ],
  },
  {
    id: 'four_columns_invalid_states',
    label: '四栏并列',
    description: '测试四栏：4 个并列错误状态或检查点。',
    title: '旧表示会放进来的四类错误状态',
    outlineDescription: [
      '本页把 list/dict 旧表示会接受的问题拆成四类并列检查点。',
      '学生要看到这些问题不是语法错误，而是对象规则没有被集中维护。',
    ].join('\n'),
    keyPoints: [
      '顺序错误：list 仍能保存四个值，但位置含义可能全乱。',
      '类型错误：likes、userid、date 的类型可以被客户端随手传错。',
      '字段缺失：dict 少了 created_at 仍可能被传到后续代码。',
      '多余操作：客户端可以直接加无关 key 或绕过点赞规则。',
    ],
    layoutTemplate: 'four_columns',
    deckStyle: 'classic_business',
    contentProfile: 'general',
    archetype: 'concept',
    disciplineStyle: 'code',
    teachingFlow: 'comparison_review',
    visualRole: 'none',
    teachingRole: 'comparison',
    teachingObjective: '学生能把旧表示接受的错误状态分成四类，并说出类要集中哪些边界。',
    openingMove: '把旧表示的失败拆成四类，看它到底守不住哪些规则。',
    concreteAnchor:
      "错误 list: [55, 'Diane', 'Older and even cooler', '2017-09-19']；缺少日期的 dict 仍可能被传来。",
    studentThinkingMove: '让学生把每个错误归到顺序、类型、缺失或越界操作中的一类。',
    transferRule: '评估旧表示时，分别查顺序、类型、缺失字段和越界操作。',
    requiredComponentKinds: ['example'],
    expectedAnchors: ['list', 'dict', 'created_at'],
  },
  {
    id: 'grid_2x2_design_checks',
    label: '2x2 网格',
    description: '测试 2x2 网格：四个设计检查点分组展示。',
    title: '写类前的 2x2 检查',
    outlineDescription: [
      '本页用 2x2 网格组织写类前的四个检查点。',
      '学生要从“数据是否属于同一对象”和“操作是否需要被统一管理”两个方向判断是否该定义类。',
    ].join('\n'),
    keyPoints: [
      '同一对象：userid、created_at、content、likes 是否描述同一条 tweet。',
      '长期状态：这些值是否会在对象生命周期里反复被读取或修改。',
      '统一入口：创建时是否需要统一初始化字段。',
      '统一操作：点赞、读取内容、修改状态是否应该有共同边界。',
    ],
    layoutTemplate: 'grid_2x2',
    deckStyle: 'tech_saas',
    contentProfile: 'general',
    archetype: 'concept',
    disciplineStyle: 'code',
    teachingFlow: 'concept_explain',
    visualRole: 'none',
    teachingRole: 'concept_model',
    teachingObjective: '学生能用四个检查点判断一组数据是否应该收进类里。',
    openingMove: '把“该不该写类”拆成四个检查点，而不是先背定义。',
    concreteAnchor: 'Tweet 的字段一起描述同一条推文，并且点赞、读取和初始化都围绕它发生。',
    studentThinkingMove: '让学生逐格判断 Tweet 是否满足这个检查点，并给出一句理由。',
    transferRule: '写类前用四格检查：同一对象、长期状态、统一入口、统一操作。',
    requiredComponentKinds: ['example'],
    expectedAnchors: ['userid', 'likes', 'Tweet'],
  },
  {
    id: 'two_text_image_problem_rule',
    label: '两块文本 + 图片',
    description: '测试左侧上下两块文本、右侧图片的“问题/规则”讲授页。',
    title: '从旧表示问题走到类的边界',
    outlineDescription: [
      '本页左侧上半块讲旧表示的问题，下半块讲 Tweet 类要集中的规则。',
      '右侧图片把 list/dict 散落字段和 Tweet 对象边界放在一张图里对照。',
    ].join('\n'),
    keyPoints: [
      '问题：list 和 dict 让客户端直接操作字段，顺序、缺失和无关 key 都可能混进来。',
      '规则：Tweet 类把 userid、created_at、content、likes 的初始化和允许操作集中起来。',
      '学生要看清：类不是多写一层包装，而是把对象边界固定下来。',
    ],
    layoutTemplate: 'two_text_image',
    deckStyle: 'academic',
    contentProfile: 'general',
    archetype: 'bridge',
    disciplineStyle: 'code',
    teachingFlow: 'comparison_review',
    visualRole: 'generated_image',
    teachingRole: 'comparison',
    teachingObjective: '学生能从旧表示的问题过渡到类要提供的对象边界。',
    openingMove: '左边先分清问题和规则，右边用对象边界图把两者连起来。',
    concreteAnchor: '旧表示直接暴露字段；Tweet 类集中字段、初始化和点赞操作。',
    studentThinkingMove: '让学生分别指出旧表示放任了什么、类应该收紧什么。',
    transferRule: '从旧表示过渡到类时，先写出“问题”和“规则”两块。',
    requiredComponentKinds: ['example'],
    expectedAnchors: ['list', 'dict', 'Tweet'],
    mediaGenerations: [
      {
        type: 'image',
        elementId: 'gen_img_1',
        aspectRatio: '16:9',
        style: 'clean comparison diagram',
        prompt:
          'A clean classroom comparison diagram: left side scattered list and dict fields, right side a Tweet object boundary containing userid, created_at, content, likes and allowed operations. Minimal academic style.',
      },
    ],
  },
  {
    id: 'code_split_init_trace',
    label: '代码 + 状态追踪',
    description: '测试代码讲解页：左侧代码，右侧追踪 self 和属性变化。',
    title: '从 __init__ 追踪 self 的属性变化',
    outlineDescription: [
      '本页从 __init__ 的真实代码出发，追踪 self 如何接住参数并写入实例属性。',
      '学生要关注当前行读了哪些值、对象内部新增了哪些属性，而不是只看最终答案。',
    ].join('\n'),
    keyPoints: [
      `代码片段：\n${CODE_SPLIT_SNIPPET}`,
      '执行 Tweet(...) 时，Python 创建一个新对象，并把它作为 self 传进 __init__。',
      'who、when、what 是参数；self.userid、self.created_at、self.content、self.likes 是实例属性。',
      '执行结束后，变量 t1 引用这个已经带有四个属性的 Tweet 对象。',
    ],
    layoutTemplate: 'code_split',
    deckStyle: 'tech_saas',
    contentProfile: 'code',
    archetype: 'example',
    disciplineStyle: 'code',
    teachingFlow: 'code_walkthrough',
    visualRole: 'none',
    overflowPolicy: 'preserve_then_paginate',
    preserveFullProblemStatement: true,
    teachingRole: 'state_trace',
    teachingObjective: '学生能按执行顺序解释 self、参数和实例属性之间的关系。',
    openingMove: '从入口 Tweet(...) 开始，不先看结论，只追踪当前行发生了什么。',
    concreteAnchor: CODE_SPLIT_SNIPPET,
    studentThinkingMove: '让学生逐行说出：当前行读了哪个参数，写入了 self 上的哪个属性。',
    transferRule: '追踪 __init__ 时，永远把 self 看成“正在被初始化的那个新对象”。',
    requiredComponentKinds: ['trace'],
    expectedAnchors: ['__init__', 'self.userid', 'Giovanna'],
    workedExampleConfig: {
      kind: 'code',
      role: 'walkthrough',
      exampleId: 'tweet-init-trace',
      codeSnippet: CODE_SPLIT_SNIPPET,
      walkthroughSteps: [
        '创建 Tweet 新对象，并把它绑定到 self。',
        '把 who 写入 self.userid。',
        '把 when 写入 self.created_at。',
        '把 what 写入 self.content，并把 likes 初始化为 0。',
      ],
      finalAnswer: 't1 引用一个已经拥有 userid、created_at、content、likes 的 Tweet 对象。',
    },
  },
];

function getQualityPreset(id: string): QualityPreset {
  return QUALITY_PRESETS.find((preset) => preset.id === id) || QUALITY_PRESETS[0];
}

const PRESET_GROUP_ORDER = ['背景封面', '通用版式', 'Tweet 课堂', '代码追踪'] as const;

function getPresetGroupLabel(preset: QualityPreset): (typeof PRESET_GROUP_ORDER)[number] {
  if (
    preset.layoutTemplate === 'image_title_overlay' ||
    preset.layoutTemplate === 'cinematic_title_frame' ||
    preset.layoutTemplate === 'tech_hero_title'
  ) {
    return '背景封面';
  }
  if (preset.layoutTemplate === 'code_split') return '代码追踪';
  if (preset.id.startsWith('common_')) return '通用版式';
  return 'Tweet 课堂';
}

function getPresetGroupDescription(group: (typeof PRESET_GROUP_ORDER)[number]): string {
  switch (group) {
    case '背景封面':
      return '图片主视觉、章节导入和封面页。';
    case '通用版式':
      return '不依赖 Tweet 主题的普通课堂/商务 PPT 页面。';
    case '代码追踪':
      return '允许承载代码和状态变化的讲解页。';
    case 'Tweet 课堂':
    default:
      return '用 Tweet/OOP 例子压测真实课堂生成。';
  }
}

const GENERATION_QUALITY_STORAGE_KEY = 'syntara:generation-quality:v2';
const LAYOUT_OPTION_VALUES = new Set<string>(LAYOUT_OPTIONS.map((option) => option.value));
const DECK_STYLE_VALUES = new Set<string>(DECK_STYLE_OPTIONS.map((option) => option.value));
const QUALITY_PRESET_IDS = new Set<string>(QUALITY_PRESETS.map((preset) => preset.id));

const DEFAULT_THEME: SlideTheme = {
  backgroundColor: '#ffffff',
  themeColors: ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#64748b'],
  fontColor: '#111827',
  fontName: 'Microsoft YaHei',
  outline: { color: '#2563eb', width: 2, style: 'solid' },
  shadow: { h: 0, v: 4, blur: 16, color: 'rgba(15, 23, 42, 0.18)' },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isLayoutOptionValue(value: unknown): value is LayoutOptionValue {
  return typeof value === 'string' && LAYOUT_OPTION_VALUES.has(value);
}

function isDeckStyleValue(value: unknown): value is DeckStyleValue {
  return typeof value === 'string' && DECK_STYLE_VALUES.has(value);
}

function isLanguageValue(value: unknown): value is 'zh-CN' | 'en-US' {
  return value === 'zh-CN' || value === 'en-US';
}

function isGeneratedSlideContent(value: unknown): value is GeneratedSlideContent {
  return isRecord(value) && Array.isArray(value.elements);
}

function inferLanguageFromTextParts(parts: readonly string[]): 'zh-CN' | 'en-US' | null {
  const text = parts.join('\n').trim();
  if (!text) return null;
  const cjkCount = text.match(/[\u3400-\u9fff]/g)?.length || 0;
  const latinWordCount = text.match(/[A-Za-z][A-Za-z'-]{2,}/g)?.length || 0;

  if (cjkCount >= 6 && cjkCount >= latinWordCount * 0.7) return 'zh-CN';
  if (latinWordCount >= 8 && cjkCount === 0) return 'en-US';
  if (latinWordCount >= 14 && latinWordCount > cjkCount * 2) return 'en-US';
  return null;
}

function inferPresetLanguage(preset: QualityPreset): 'zh-CN' | 'en-US' | null {
  return inferLanguageFromTextParts([
    preset.title,
    preset.outlineDescription,
    ...preset.keyPoints,
    preset.teachingObjective,
    preset.openingMove,
    preset.concreteAnchor,
  ]);
}

function inferInputLanguage(args: {
  title: string;
  outlineDescription: string;
  keyPointsText: string;
}): 'zh-CN' | 'en-US' | null {
  return inferLanguageFromTextParts([args.title, args.outlineDescription, args.keyPointsText]);
}

function buildDefaultPresetInput(preset: QualityPreset): PresetInputState {
  return {
    title: preset.title,
    outlineDescription: preset.outlineDescription,
    keyPointsText: preset.keyPoints.join('\n'),
    layoutTemplate: preset.layoutTemplate,
    deckStyle: preset.deckStyle,
    language: preset.language || inferPresetLanguage(preset) || 'zh-CN',
  };
}

function normalizePresetInput(value: unknown, preset: QualityPreset): PresetInputState {
  const defaults = buildDefaultPresetInput(preset);
  if (!isRecord(value)) return defaults;
  const title = typeof value.title === 'string' ? value.title : defaults.title;
  const outlineDescription =
    typeof value.outlineDescription === 'string'
      ? value.outlineDescription
      : defaults.outlineDescription;
  const keyPointsText =
    typeof value.keyPointsText === 'string' ? value.keyPointsText : defaults.keyPointsText;
  const storedLanguage = isLanguageValue(value.language) ? value.language : defaults.language;
  return {
    title,
    outlineDescription,
    keyPointsText,
    layoutTemplate: isLayoutOptionValue(value.layoutTemplate)
      ? value.layoutTemplate
      : defaults.layoutTemplate,
    deckStyle: isDeckStyleValue(value.deckStyle) ? value.deckStyle : defaults.deckStyle,
    language:
      inferInputLanguage({ title, outlineDescription, keyPointsText }) ||
      preset.language ||
      storedLanguage,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : undefined,
  };
}

function sanitizeInputsByPreset(value: unknown): PresetInputsByPreset {
  if (!isRecord(value)) return {};
  const output: PresetInputsByPreset = {};
  Object.entries(value).forEach(([presetId, input]) => {
    if (!QUALITY_PRESET_IDS.has(presetId)) return;
    output[presetId] = normalizePresetInput(input, getQualityPreset(presetId));
  });
  return output;
}

function isGenerationResult(value: unknown): value is GenerationResult {
  return (
    isRecord(value) &&
    isRecord(value.scene) &&
    isRecord(value.outline) &&
    isRecord(value.rawResponse) &&
    typeof value.generatedContentCount === 'number' &&
    typeof value.createdAt === 'number'
  );
}

function compactGenerationResultForStorage(result: GenerationResult): GenerationResult {
  return {
    ...result,
    rawResponse: {
      success: result.rawResponse.success,
      error: result.rawResponse.error,
      details: result.rawResponse.details,
      effectiveOutline: result.rawResponse.effectiveOutline,
      generationDiagnostics: result.rawResponse.generationDiagnostics,
    },
  };
}

function sanitizeResultsByPreset(value: unknown): GenerationResultsByPreset {
  if (!isRecord(value)) return {};
  const output: GenerationResultsByPreset = {};
  Object.entries(value).forEach(([presetId, result]) => {
    if (!QUALITY_PRESET_IDS.has(presetId) || !isGenerationResult(result)) return;
    output[presetId] = result;
  });
  return output;
}

function isGenerationErrorResult(value: unknown): value is GenerationErrorResult {
  return (
    isRecord(value) && typeof value.message === 'string' && typeof value.createdAt === 'number'
  );
}

function sanitizeErrorsByPreset(value: unknown): ErrorsByPreset {
  if (!isRecord(value)) return {};
  const output: ErrorsByPreset = {};
  Object.entries(value).forEach(([presetId, error]) => {
    if (!QUALITY_PRESET_IDS.has(presetId) || !isGenerationErrorResult(error)) return;
    output[presetId] = error;
  });
  return output;
}

function readGenerationQualitySavedState(): GenerationQualitySavedState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(GENERATION_QUALITY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;
    return {
      selectedPresetId:
        typeof parsed.selectedPresetId === 'string' &&
        QUALITY_PRESET_IDS.has(parsed.selectedPresetId)
          ? parsed.selectedPresetId
          : undefined,
      inputsByPreset: sanitizeInputsByPreset(parsed.inputsByPreset),
      resultsByPreset: sanitizeResultsByPreset(parsed.resultsByPreset),
      errorsByPreset: sanitizeErrorsByPreset(parsed.errorsByPreset),
      promptPreviewErrorsByPreset: sanitizeErrorsByPreset(parsed.promptPreviewErrorsByPreset),
    };
  } catch {
    return null;
  }
}

function writeGenerationQualitySavedState(state: GenerationQualitySavedState): void {
  if (typeof window === 'undefined') return;
  try {
    const compactResults: GenerationResultsByPreset = {};
    Object.entries(state.resultsByPreset || {}).forEach(([presetId, result]) => {
      if (!result) return;
      compactResults[presetId] = compactGenerationResultForStorage(result);
    });
    window.localStorage.setItem(
      GENERATION_QUALITY_STORAGE_KEY,
      JSON.stringify({
        selectedPresetId: state.selectedPresetId,
        inputsByPreset: state.inputsByPreset || {},
        resultsByPreset: compactResults,
        errorsByPreset: state.errorsByPreset || {},
        promptPreviewErrorsByPreset: state.promptPreviewErrorsByPreset || {},
      }),
    );
  } catch {
    // localStorage can fail under private browsing or quota pressure; the QA page still works in memory.
  }
}

function presetInputMatches(a: PresetInputState | undefined, b: PresetInputState): boolean {
  if (!a) return false;
  return (
    a.title === b.title &&
    a.outlineDescription === b.outlineDescription &&
    a.keyPointsText === b.keyPointsText &&
    a.layoutTemplate === b.layoutTemplate &&
    a.deckStyle === b.deckStyle &&
    a.language === b.language
  );
}

function parseGenerationErrorDetails(details: string | undefined): {
  error?: string;
  diagnostics?: SceneGenerationDiagnostics;
  raw: unknown;
} | null {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details) as unknown;
    if (!isRecord(parsed)) return { raw: parsed };
    return {
      error: typeof parsed.error === 'string' ? parsed.error : undefined,
      diagnostics: isRecord(parsed.diagnostics)
        ? (parsed.diagnostics as SceneGenerationDiagnostics)
        : undefined,
      raw: parsed,
    };
  } catch {
    return null;
  }
}

function buildGenerationErrorResult(
  data: Pick<SceneContentResponse, 'error' | 'details' | 'generationDiagnostics'>,
  httpStatus: number,
  fallbackMessage: string,
): GenerationErrorResult {
  const parsedDetails = parseGenerationErrorDetails(data.details);
  return {
    message: data.error || parsedDetails?.error || fallbackMessage,
    details: data.details,
    diagnostics: data.generationDiagnostics || parsedDetails?.diagnostics,
    rawDetails: parsedDetails?.raw,
    httpStatus,
    createdAt: Date.now(),
  };
}

function buildUnknownErrorResult(error: unknown): GenerationErrorResult {
  return {
    message: error instanceof Error ? error.message : String(error),
    createdAt: Date.now(),
  };
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isGeneratedImagePlaceholder(src: string | undefined): boolean {
  return Boolean(src && /^gen_img_[\w-]+$/i.test(src));
}

function buildQaDiagramDataUri(args: {
  outline: SceneOutline;
  elementId: string;
  width: number;
  height: number;
}): string {
  const template = args.outline.layoutIntent?.layoutTemplate;
  if (
    template === 'image_title_overlay' ||
    template === 'cinematic_title_frame' ||
    template === 'tech_hero_title'
  ) {
    return resolveBuiltInHeroBackgroundSource({
      layoutTemplate: template,
      deckStyle: args.outline.layoutIntent?.deckStyle,
      disciplineStyle: args.outline.layoutIntent?.disciplineStyle,
      title: args.outline.title,
      description: args.outline.description,
    });
  }
  const title = escapeSvgText(args.outline.title || 'Tweet object');
  const fields = ['userid', 'created_at', 'content', 'likes'];
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="${Math.max(1, Math.round(args.width))}" height="${Math.max(1, Math.round(args.height))}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#eef6ff"/>
      <stop offset="1" stop-color="#fff7ed"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#0f172a" flood-opacity="0.12"/>
    </filter>
  </defs>
  <rect width="640" height="360" rx="28" fill="url(#bg)"/>
  <text x="42" y="54" fill="#0f172a" font-family="Arial, sans-serif" font-size="24" font-weight="800">${title}</text>
  <rect x="52" y="92" width="210" height="146" rx="18" fill="#ffffff" stroke="#bfdbfe" filter="url(#shadow)"/>
  <text x="157" y="132" text-anchor="middle" fill="#1d4ed8" font-family="Menlo, monospace" font-size="28" font-weight="800">Tweet()</text>
  <text x="157" y="166" text-anchor="middle" fill="#475569" font-family="Arial, sans-serif" font-size="16">one object entrance</text>
  <path d="M278 165 C330 165 324 165 376 165" stroke="#64748b" stroke-width="5" fill="none" marker-end="url(#arrow)"/>
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,6 L9,3 z" fill="#64748b"/>
    </marker>
  </defs>
  ${fields
    .map((field, index) => {
      const y = 86 + index * 56;
      const color = ['#2563eb', '#10b981', '#f97316', '#8b5cf6'][index];
      return `<rect x="388" y="${y}" width="200" height="38" rx="12" fill="#ffffff" stroke="${color}" stroke-opacity="0.38"/><circle cx="414" cy="${y + 19}" r="6" fill="${color}"/><text x="434" y="${y + 25}" fill="#0f172a" font-family="Menlo, monospace" font-size="17" font-weight="700">${field}</text>`;
    })
    .join('')}
  <text x="52" y="304" fill="#475569" font-family="Arial, sans-serif" font-size="16">QA visual preview for ${escapeSvgText(args.elementId)}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function materializeQaMediaPlaceholders(
  elements: PPTElement[],
  outline: SceneOutline,
): PPTElement[] {
  return elements.map((element) => {
    if (element.type !== 'image' || !isGeneratedImagePlaceholder(element.src)) return element;
    const imageElement = element as PPTImageElement;
    return {
      ...imageElement,
      src: buildQaDiagramDataUri({
        outline,
        elementId: imageElement.src,
        width: imageElement.width,
        height: imageElement.height,
      }),
    };
  });
}

function layoutFamilyForTemplate(template: LayoutOptionValue): SceneLayoutIntent['layoutFamily'] {
  switch (template) {
    case 'image_title_overlay':
    case 'cinematic_title_frame':
    case 'tech_hero_title':
      return 'cover';
    case 'pipeline_table':
    case 'comparison_matrix':
      return 'comparison';
    case 'process_steps':
      return 'timeline';
    case 'visual_three_steps':
      return 'visual_split';
    case 'text_image_split':
      return 'visual_split';
    case 'two_text_image':
      return 'visual_split';
    case 'two_by_one_summary':
      return 'summary';
    case 'three_cards':
      return 'concept_cards';
    case 'four_columns':
      return 'concept_cards';
    case 'grid_2x2':
      return 'concept_cards';
    case 'code_split':
      return 'code_walkthrough';
  }
}

function buildOutline(args: {
  presetId: string;
  title: string;
  description: string;
  keyPoints: string[];
  layoutTemplate: LayoutOptionValue;
  deckStyle: DeckStyleValue;
  language: 'zh-CN' | 'en-US';
  id?: string;
}): SceneOutline {
  const preset = getQualityPreset(args.presetId);
  const outlineText = [args.title, args.description, ...args.keyPoints, preset.concreteAnchor]
    .join('\n')
    .trim();
  const usesTweetMemory = /\bTweet\b|Tweet\(\)|\buserid\b|\bcreated_at\b/.test(outlineText);
  const layoutIntent: SceneLayoutIntent = {
    layoutFamily: layoutFamilyForTemplate(args.layoutTemplate),
    layoutTemplate: args.layoutTemplate,
    disciplineStyle: preset.disciplineStyle,
    teachingFlow: preset.teachingFlow,
    density: 'standard',
    deckStyle: args.deckStyle,
    visualRole: preset.visualRole,
    overflowPolicy: preset.overflowPolicy || 'compress_first',
    preserveFullProblemStatement: preset.preserveFullProblemStatement || false,
  };

  return {
    id: args.id || 'qa-outline-preview',
    type: 'slide',
    contentProfile: preset.contentProfile,
    archetype: preset.archetype,
    layoutIntent,
    title: args.title.trim() || preset.title,
    description: args.description.trim(),
    keyPoints: args.keyPoints.length > 0 ? args.keyPoints : preset.keyPoints,
    teachingObjective: preset.teachingObjective,
    teachingPlanId: 'qa-teaching-plan',
    teachingRole: preset.teachingRole,
    teachingPagePlan: {
      id: `${args.id || 'qa-outline-preview'}-page-plan`,
      order: 1,
      title: args.title.trim() || preset.title,
      role: preset.teachingRole,
      openingMove: preset.openingMove,
      concreteAnchor: preset.concreteAnchor,
      studentThinkingMove: preset.studentThinkingMove,
      transferRule: preset.transferRule,
      requiredComponentKinds: [...preset.requiredComponentKinds],
      forbiddenPatterns: [],
      contentProfile: preset.contentProfile,
      disciplineStyle: preset.disciplineStyle,
      teachingFlow: preset.teachingFlow,
      layoutFamily: layoutIntent.layoutFamily,
      layoutTemplate: args.layoutTemplate,
    },
    studentThinkingMove: preset.studentThinkingMove,
    requiredComponentKinds: [...preset.requiredComponentKinds],
    sharedExamples:
      preset.sharedExamples || usesTweetMemory
        ? preset.sharedExamples || [TWEET_SHARED_EXAMPLE]
        : undefined,
    usesExampleIds:
      preset.usesExampleIds || usesTweetMemory
        ? preset.usesExampleIds || [TWEET_SHARED_EXAMPLE.id]
        : undefined,
    continuity:
      preset.continuity || usesTweetMemory
        ? preset.continuity || {
            usesExampleIds: [TWEET_SHARED_EXAMPLE.id],
            previousHandoff: '前面已经用 list/dict 的错误状态说明旧表示守不住 Tweet 的对象规则。',
            currentJob: preset.studentThinkingMove,
            nextHandoff: preset.transferRule,
          }
        : undefined,
    mediaGenerations: preset.mediaGenerations ? [...preset.mediaGenerations] : undefined,
    workedExampleConfig: preset.workedExampleConfig,
    order: 0,
    language: args.language,
  };
}

function buildStage(language: 'zh-CN' | 'en-US', deckStyle: DeckStyleValue, now = 0): Stage {
  return {
    id: QA_STAGE_ID,
    name: language === 'zh-CN' ? '单页生成质量测试' : 'Single Page Generation QA',
    description:
      language === 'zh-CN'
        ? '只调用一次 scene-content 的单页生成质检页面'
        : 'One scene-content call for focused slide generation QA',
    language,
    style: `single-page-quality-test; deckStyle=${deckStyle}`,
    createdAt: now,
    updatedAt: now,
  };
}

function buildQualityAllOutlines(current: SceneOutline): SceneOutline[] {
  const usesTweetMemory = current.usesExampleIds?.includes(TWEET_SHARED_EXAMPLE.id);
  if (!usesTweetMemory) return [current];

  const sharedFields = {
    type: 'slide' as const,
    contentProfile: current.contentProfile,
    layoutIntent: current.layoutIntent,
    teachingPlanId: current.teachingPlanId,
    teachingRole: current.teachingRole,
    requiredComponentKinds: current.requiredComponentKinds,
    sharedExamples: current.sharedExamples,
    usesExampleIds: [TWEET_SHARED_EXAMPLE.id],
    language: current.language,
  };

  const previous: SceneOutline = {
    ...sharedFields,
    id: `${current.id}-memory-prev`,
    archetype: 'concept',
    title: '旧表示为什么失败',
    description:
      '前一页比较 list 和 dict 表示 Tweet 时，已经暴露了位置顺序、字段缺失和操作边界的问题。',
    keyPoints: [
      "list 示例 ['David', '2017-09-19', 'Hello, I am so cool', 0] 只能靠位置猜语义。",
      "错误 list [55, 'Diane', 'Older and even cooler', '2017-09-19'] 仍可能被客户端接收。",
      '缺少日期的 dict 说明字段名还不等于完整初始化边界。',
    ],
    teachingObjective: '让学生看到旧表示守不住 Tweet 的对象规则。',
    teachingPagePlan: {
      id: `${current.id}-memory-prev-plan`,
      order: 0,
      title: '旧表示为什么失败',
      role: 'failure_demo',
      openingMove: '先看 list/dict 会接受哪些 Tweet 错误状态。',
      concreteAnchor:
        TWEET_SHARED_EXAMPLE.malformedData?.join('\n') || TWEET_SHARED_EXAMPLE.description,
      studentThinkingMove: '找出旧表示仍然允许的结构错误和规则错误。',
      transferRule: '旧表示的问题会推动我们把字段和操作边界集中到 Tweet 类。',
      requiredComponentKinds: ['table'],
      forbiddenPatterns: [],
      contentProfile: current.contentProfile,
      disciplineStyle: current.layoutIntent?.disciplineStyle,
      teachingFlow: current.layoutIntent?.teachingFlow,
      layoutFamily: current.layoutIntent?.layoutFamily,
      layoutTemplate: current.layoutIntent?.layoutTemplate,
    },
    order: current.order - 1,
  };

  const next: SceneOutline = {
    ...sharedFields,
    id: `${current.id}-memory-next`,
    archetype: 'example',
    title: '__init__、self 和点号访问',
    description:
      '下一页会把 Tweet 的对象边界落到代码上：用 __init__ 写入字段，用 self 保存状态，再用点号访问属性。',
    keyPoints: [
      'Tweet(...) 创建一个具体实例。',
      'self.userid、self.created_at、self.content、self.likes 写入同一个对象。',
      '点号访问依赖对象已经拥有对应属性。',
    ],
    teachingObjective: '把 Tweet 的设计边界迁移到 __init__ 和 self 的执行模型。',
    teachingPagePlan: {
      id: `${current.id}-memory-next-plan`,
      order: 2,
      title: '__init__、self 和点号访问',
      role: 'state_trace',
      openingMove: '把 Tweet 设计放进 __init__ 的执行过程里看。',
      concreteAnchor: CODE_SPLIT_SNIPPET,
      studentThinkingMove: '追踪每一行如何把值写进同一个 Tweet 实例。',
      transferRule: '属性访问成功的前提是对象已经在初始化中拥有对应字段。',
      requiredComponentKinds: ['trace'],
      forbiddenPatterns: [],
      contentProfile: current.contentProfile,
      disciplineStyle: current.layoutIntent?.disciplineStyle,
      teachingFlow: current.layoutIntent?.teachingFlow,
      layoutFamily: current.layoutIntent?.layoutFamily,
      layoutTemplate: 'code_split',
    },
    order: current.order + 1,
  };

  return [previous, current, next];
}

function buildSceneFromGeneratedContent(args: {
  content: GeneratedSlideContent;
  outline: SceneOutline;
  diagnostics?: SceneGenerationDiagnostics;
}): Scene {
  const slide: Slide = {
    id: `qa-slide-${Date.now()}`,
    viewportSize: 1000,
    viewportRatio: 0.5625,
    theme: args.content.theme || DEFAULT_THEME,
    elements: materializeQaMediaPlaceholders(args.content.elements, args.outline),
    background: args.content.background,
  };

  const renderedContent = markSemanticSlideContent({
    type: 'slide',
    canvas: slide,
    syntaraMarkup: args.content.syntaraMarkup,
    semanticDocument: args.content.contentDocument,
  });
  const slideContent: SlideContent =
    renderedContent.type === 'slide'
      ? {
          ...renderedContent,
          canvas: {
            ...renderedContent.canvas,
            elements: materializeQaMediaPlaceholders(renderedContent.canvas.elements, args.outline),
          },
        }
      : renderedContent;

  const now = Date.now();
  return {
    id: `qa-scene-${now}`,
    stageId: QA_STAGE_ID,
    type: 'slide',
    title: args.outline.title,
    order: args.outline.order,
    content: slideContent,
    actions: [],
    generationDiagnostics: args.diagnostics,
    createdAt: now,
    updatedAt: now,
  };
}

function blockTypes(document: NotebookContentDocument | undefined): string[] {
  return (document?.blocks || []).map((block) => block.type);
}

function rowsForBlock(block: NotebookContentBlock): number {
  if (block.type !== 'table' && block.type !== 'state_table') return 0;
  return Array.isArray(block.rows) ? block.rows.length : 0;
}

function processStepCount(block: NotebookContentBlock): number {
  if (block.type !== 'process_flow') return 0;
  return Array.isArray(block.steps) ? block.steps.length : 0;
}

function layoutCardCount(block: NotebookContentBlock): number {
  if (block.type !== 'layout_cards') return 0;
  return Array.isArray(block.items) ? block.items.length : 0;
}

function collectText(value: unknown, output: string[] = []): string[] {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) output.push(trimmed);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectText(item, output));
    return output;
  }
  if (isRecord(value)) {
    Object.values(value).forEach((item) => collectText(item, output));
  }
  return output;
}

function maxElementBounds(elements: PPTElement[]) {
  return elements.reduce(
    (acc, element) => {
      const record = element as unknown as Record<string, unknown>;
      const left = typeof record.left === 'number' ? record.left : 0;
      const top = typeof record.top === 'number' ? record.top : 0;
      const width = typeof record.width === 'number' ? record.width : 0;
      const height = typeof record.height === 'number' ? record.height : 0;
      return {
        right: Math.max(acc.right, left + width),
        bottom: Math.max(acc.bottom, top + height),
      };
    },
    { right: 0, bottom: 0 },
  );
}

function evaluateResult(args: {
  scene: Scene | null;
  expectedTemplate: LayoutOptionValue;
  expectedDeckStyle: DeckStyleValue;
  expectedAnchors: string[];
  generatedContentCount: number;
  generationDiagnostics?: SceneGenerationDiagnostics;
}): QualityCheck[] {
  if (!args.scene || args.scene.type !== 'slide' || args.scene.content.type !== 'slide') {
    return [
      {
        status: 'warn',
        label: '等待生成',
        detail: '生成一页后这里会显示结构和渲染质检。',
      },
    ];
  }

  const content = args.scene.content;
  const document = content.semanticDocument;
  const types = new Set(blockTypes(document));
  const blocks = document?.blocks || [];
  const processSteps = Math.max(0, ...blocks.map(processStepCount));
  const tableRows = Math.max(0, ...blocks.map(rowsForBlock));
  const cardCount = Math.max(0, ...blocks.map(layoutCardCount));
  const cardColumns = Math.max(
    0,
    ...blocks.map((block) => (block.type === 'layout_cards' ? block.columns : 0)),
  );
  const hasVisual = Boolean(document?.visualSlot || types.has('visual'));
  const textItems = collectText(document);
  const longestText = textItems.reduce((max, item) => Math.max(max, item.length), 0);
  const serializedDocument = document ? JSON.stringify(document) : '';
  const bounds = maxElementBounds(content.canvas.elements);
  const checks: QualityCheck[] = [];

  checks.push({
    status: args.generatedContentCount === 1 ? 'pass' : 'fail',
    label: '只生成一页',
    detail:
      args.generatedContentCount === 1
        ? '这次请求没有被拆成 continuation pages。'
        : `接口返回了 ${args.generatedContentCount} 页，需要回到生成契约或预算策略里处理。`,
  });

  checks.push({
    status: args.generationDiagnostics?.contentFallbackUsed ? 'warn' : 'pass',
    label: '没有退回本地 fallback',
    detail: args.generationDiagnostics?.contentFallbackUsed
      ? `主生成链路没有通过，使用了 ${args.generationDiagnostics.fallbackKind || 'fallback'}；这类结果只能当错误样本看。`
      : '结果来自正式语义生成链路，没有靠本地 fallback 补页面。',
  });

  const retryCount =
    (args.generationDiagnostics?.semanticRetryCount || 0) +
    (args.generationDiagnostics?.layoutRetryCount || 0);
  const retryReasons = uniqueNonEmpty(args.generationDiagnostics?.failureReasons || []);
  checks.push({
    status: retryCount === 0 ? 'pass' : 'warn',
    label: '重试过程可解释',
    detail:
      retryCount === 0
        ? '模型第一次输出就通过结构、预算和渲染校验。'
        : `生成过程中修复过 ${retryCount} 次：${retryReasons
            .slice(0, 2)
            .map(readableFailureReason)
            .join(' / ')}`,
  });

  const codePageCanScroll = args.expectedTemplate === 'code_split';
  checks.push({
    status: content.webRenderMode === 'slide' || codePageCanScroll ? 'pass' : 'fail',
    label: '固定 16:9 slide 渲染',
    detail:
      content.webRenderMode === 'slide'
        ? '课堂会走固定画布 renderer，而不是长页滚动。'
        : codePageCanScroll
          ? `当前 webRenderMode=${content.webRenderMode || 'undefined'}；代码追踪页允许在保留代码完整性时有限滚动或分页。`
          : `当前 webRenderMode=${content.webRenderMode || 'undefined'}，这类测试页应该是一屏 PPT。`,
  });

  checks.push({
    status: document?.layoutTemplate === args.expectedTemplate ? 'pass' : 'fail',
    label: '版式契约',
    detail:
      document?.layoutTemplate === args.expectedTemplate
        ? `使用了 ${args.expectedTemplate}。`
        : `期望 ${args.expectedTemplate}，实际 ${document?.layoutTemplate || '未声明'}。`,
  });

  checks.push({
    status:
      document?.deckStyle === args.expectedDeckStyle ||
      (!document?.deckStyle && args.expectedDeckStyle === 'classic_business')
        ? 'pass'
        : 'warn',
    label: '视觉母版',
    detail:
      document?.deckStyle === args.expectedDeckStyle
        ? `语义文档声明了 deckStyle=${args.expectedDeckStyle}。`
        : `当前 deckStyle=${document?.deckStyle || '默认 classic_business'}；如果你正在测试特定风格，这里应该对齐。`,
  });

  if (args.expectedTemplate === 'pipeline_table') {
    checks.push({
      status: types.has('process_flow') && types.has('table') ? 'pass' : 'fail',
      label: 'pipeline_table 结构',
      detail: `需要 process_flow + table；当前 blocks=${Array.from(types).join(', ') || 'none'}。`,
    });
    checks.push({
      status:
        processSteps > 0 && processSteps <= 4 && tableRows >= 3 && tableRows <= 6 ? 'pass' : 'warn',
      label: '流程和表格预算',
      detail: `流程 ${processSteps || 0} 步，表格 ${tableRows || 0} 行；普通 PPT 最好是 3-4 步、3-6 行。`,
    });
  }

  if (args.expectedTemplate === 'comparison_matrix') {
    checks.push({
      status: types.has('table') ? 'pass' : 'fail',
      label: 'comparison_matrix 结构',
      detail: `需要以 table 作为主体；当前 blocks=${Array.from(types).join(', ') || 'none'}。`,
    });
    checks.push({
      status: tableRows >= 3 && tableRows <= 6 ? 'pass' : 'warn',
      label: '表格预算',
      detail: `表格 ${tableRows || 0} 行；对照矩阵最好是 3-6 行，保留扫读空间。`,
    });
  }

  if (args.expectedTemplate === 'process_steps') {
    checks.push({
      status: types.has('process_flow') ? 'pass' : 'fail',
      label: 'process_steps 结构',
      detail: `需要 process_flow 作为主体；当前 blocks=${Array.from(types).join(', ') || 'none'}。`,
    });
    checks.push({
      status: processSteps >= 3 && processSteps <= 5 ? 'pass' : 'warn',
      label: '流程步骤预算',
      detail: `流程 ${processSteps || 0} 步；流程图最好是 3-5 步，每步一句可执行动作。`,
    });
  }

  if (
    args.expectedTemplate === 'image_title_overlay' ||
    args.expectedTemplate === 'cinematic_title_frame' ||
    args.expectedTemplate === 'tech_hero_title'
  ) {
    const nonVisualBlocks = blocks.filter((block) => block.type !== 'visual');
    const heavyBlocks = blocks.filter((block) =>
      ['table', 'process_flow', 'layout_cards', 'code_block', 'code_trace'].includes(block.type),
    );
    checks.push({
      status: hasVisual ? 'pass' : 'fail',
      label: 'hero 主视觉',
      detail: `需要整页 visual 作为背景；当前 visual=${hasVisual ? 'yes' : 'no'}。`,
    });
    checks.push({
      status: nonVisualBlocks.length <= 3 && heavyBlocks.length === 0 ? 'pass' : 'fail',
      label: 'hero 内容密度',
      detail: `封面页只应有短副标题/元信息；当前非 visual blocks=${nonVisualBlocks.length}，重结构 blocks=${heavyBlocks.length}。`,
    });
  }

  if (args.expectedTemplate === 'visual_three_steps') {
    const hasThreeStepStructure =
      (types.has('layout_cards') && cardCount === 3) ||
      (types.has('process_flow') && processSteps === 3);
    checks.push({
      status: types.has('visual') && hasThreeStepStructure ? 'pass' : 'fail',
      label: 'visual_three_steps 结构',
      detail: `需要 visual + 正好 3 个 cards/process steps；当前 blocks=${Array.from(types).join(', ') || 'none'}。`,
    });
    checks.push({
      status: hasThreeStepStructure ? 'pass' : 'warn',
      label: '三步结构',
      detail: `当前 layout_cards=${cardCount || 0} 项，process_flow=${processSteps || 0} 步；这个模板最好正好三步。`,
    });
  }

  if (args.expectedTemplate === 'two_by_one_summary') {
    const textishCount = blocks.filter((block) =>
      ['paragraph', 'bullet_list', 'callout', 'definition', 'theorem'].includes(block.type),
    ).length;
    checks.push({
      status:
        textishCount >= 3 || (types.has('layout_cards') && textishCount >= 1) ? 'pass' : 'fail',
      label: 'two_by_one_summary 结构',
      detail: `需要两组要点 + 底部 summary/callout；当前 textish blocks=${textishCount}，blocks=${Array.from(types).join(', ') || 'none'}。`,
    });
  }

  if (args.expectedTemplate === 'three_cards') {
    checks.push({
      status: types.has('layout_cards') && cardCount === 3 ? 'pass' : 'fail',
      label: 'three_cards 结构',
      detail: `需要正好 3 张概念卡；当前 layout_cards=${cardCount || 0}，blocks=${Array.from(types).join(', ') || 'none'}。`,
    });
  }

  if (args.expectedTemplate === 'text_image_split') {
    const textishCount = blocks.filter((block) =>
      ['paragraph', 'bullet_list', 'callout', 'definition', 'theorem'].includes(block.type),
    ).length;
    checks.push({
      status: hasVisual && textishCount >= 1 ? 'pass' : 'fail',
      label: 'text_image_split 结构',
      detail: `需要左侧文本 + 右侧 visual；当前 textish=${textishCount}，visual=${hasVisual ? 'yes' : 'no'}。`,
    });
  }

  if (args.expectedTemplate === 'four_columns') {
    checks.push({
      status: types.has('layout_cards') && cardColumns === 4 && cardCount === 4 ? 'pass' : 'fail',
      label: 'four_columns 结构',
      detail: `需要 columns=4 且正好 4 张卡；当前 columns=${cardColumns || 0}，cards=${cardCount || 0}。`,
    });
  }

  if (args.expectedTemplate === 'grid_2x2') {
    checks.push({
      status: types.has('layout_cards') && cardColumns === 2 && cardCount === 4 ? 'pass' : 'fail',
      label: 'grid_2x2 结构',
      detail: `需要 columns=2 且正好 4 张卡；当前 columns=${cardColumns || 0}，cards=${cardCount || 0}。`,
    });
  }

  if (args.expectedTemplate === 'two_text_image') {
    const textishCount = blocks.filter((block) =>
      ['paragraph', 'bullet_list', 'callout', 'definition', 'theorem'].includes(block.type),
    ).length;
    const twoCards = types.has('layout_cards') && cardCount === 2;
    checks.push({
      status: hasVisual && (textishCount >= 2 || twoCards) ? 'pass' : 'fail',
      label: 'two_text_image 结构',
      detail: `需要两块文本 + 右侧 visual；当前 textish=${textishCount}，cards=${cardCount || 0}，visual=${hasVisual ? 'yes' : 'no'}。`,
    });
  }

  if (args.expectedTemplate === 'code_split') {
    const hasCode =
      types.has('code_block') || types.has('code_walkthrough') || types.has('code_trace');
    const hasTrace =
      types.has('code_walkthrough') ||
      types.has('code_trace') ||
      types.has('state_table') ||
      types.has('memory_diagram') ||
      types.has('call_stack');
    checks.push({
      status: hasCode && hasTrace ? 'pass' : 'fail',
      label: 'code_split 结构',
      detail: `需要代码块 + 执行/状态追踪；当前 blocks=${Array.from(types).join(', ') || 'none'}。`,
    });
  }

  checks.push({
    status: longestText <= 180 ? 'pass' : longestText <= 260 ? 'warn' : 'fail',
    label: '文本密度',
    detail:
      longestText <= 180
        ? '最长文本块足够短，适合课堂扫读。'
        : `最长文本约 ${longestText} 字符；这会开始变成讲稿或网页段落。`,
  });

  checks.push({
    status: /\\(?:text|bullet|example|card|step|table|begin|end)\b/.test(serializedDocument)
      ? 'fail'
      : 'pass',
    label: '无标记泄漏',
    detail: /\\(?:text|bullet|example|card|step|table|begin|end)\b/.test(serializedDocument)
      ? '语义文档里仍然残留 Syntara/LaTeX 命令，renderer 会把它当正文显示。'
      : '没有发现会直接露给学生的结构命令。',
  });

  const matchedAnchorCount = args.expectedAnchors.filter((anchor) =>
    serializedDocument.includes(anchor),
  ).length;
  const requiredAnchorCount = Math.min(2, args.expectedAnchors.length);
  checks.push({
    status: matchedAnchorCount >= requiredAnchorCount ? 'pass' : 'warn',
    label: '使用输入事实',
    detail:
      args.expectedAnchors.length > 0
        ? `命中 ${matchedAnchorCount}/${args.expectedAnchors.length} 个样本锚点：${args.expectedAnchors.join('、')}。`
        : '检查是否保留了 outline 里的具体事实，而不是泛泛讲概念。',
  });

  checks.push({
    status: bounds.right <= 1005 && bounds.bottom <= 570 ? 'pass' : 'fail',
    label: '画布边界',
    detail:
      bounds.right <= 1005 && bounds.bottom <= 570
        ? '生成的元素几何边界没有明显越出 16:9 画布。'
        : `元素边界到 right=${Math.round(bounds.right)}, bottom=${Math.round(bounds.bottom)}，可能有溢出。`,
  });

  checks.push({
    status: content.canvas.elements.length >= 4 ? 'pass' : 'warn',
    label: '可视结构',
    detail: `当前画布元素 ${content.canvas.elements.length} 个；过少通常意味着版式没有被充分渲染出来。`,
  });

  return checks;
}

function statusIcon(status: QualityStatus) {
  if (status === 'pass') return <CheckCircle2 className="size-4 text-emerald-600" />;
  if (status === 'warn') return <AlertTriangle className="size-4 text-amber-600" />;
  return <XCircle className="size-4 text-red-600" />;
}

function statusBadgeVariant(status: QualityStatus): 'default' | 'secondary' | 'destructive' {
  if (status === 'fail') return 'destructive';
  if (status === 'warn') return 'secondary';
  return 'default';
}

function testStatusLabel(status: TestListStatus): string {
  if (status === 'pass') return '通过';
  if (status === 'warn') return '警告';
  if (status === 'fail') return '失败';
  if (status === 'error') return '错误';
  return '待测';
}

function testStatusBadgeVariant(
  status: TestListStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'pass') return 'default';
  if (status === 'warn') return 'secondary';
  if (status === 'fail' || status === 'error') return 'destructive';
  return 'outline';
}

function readableFailureReason(reason: string): string {
  if (/markup command leaked/i.test(reason)) {
    return '结构命令泄漏到学生可见文本里。通常是模型把 `\\bullet`、`\\text`、`\\example` 这类命令写进了 card/step/table cell 的正文。';
  }
  if (/two_by_one_summary/i.test(reason)) {
    return 'two_by_one_summary 缺少模板要求的三块结构：左栏要点、右栏要点、底部 summary/callout。';
  }
  if (/image_title_overlay|cinematic_title_frame|tech_hero_title/i.test(reason)) {
    return 'image-first hero 页需要一张 visual 和极短副标题/元信息，不能输出表格、流程、卡片或长讲稿。';
  }
  if (/three_cards/i.test(reason)) {
    return 'three_cards 没有产出正好 3 张 cards，或卡片正文太长。';
  }
  if (/text_image_split/i.test(reason)) {
    return 'text_image_split 缺少左侧短文本或右侧 visual。';
  }
  if (/four_columns/i.test(reason)) {
    return 'four_columns 需要 columns=4 且正好 4 张短卡片。';
  }
  if (/grid_2x2/i.test(reason)) {
    return 'grid_2x2 需要 columns=2 且正好 4 张卡片。';
  }
  if (/two_text_image/i.test(reason)) {
    return 'two_text_image 缺少两块短文本或右侧 visual。';
  }
  if (/code_split/i.test(reason) || /state trace page requires/i.test(reason)) {
    return '代码追踪页没有同时产出代码和状态追踪结构，可能退化成了普通段落或 bullet list。';
  }
  if (/pipeline_table/i.test(reason)) {
    return 'pipeline_table 缺少 process/table，或流程步数、表格行数不符合模板输入契约。';
  }
  if (/comparison_matrix/i.test(reason)) {
    return 'comparison_matrix 缺少 table，或表格行数/维度没有按对照矩阵组织。';
  }
  if (/process_steps/i.test(reason)) {
    return 'process_steps 缺少 process_flow，或流程步骤数量不适合一屏 PPT。';
  }
  if (/missing concrete anchor/i.test(reason)) {
    return '生成结果没有使用 PagePlan 的具体入口。模型可能泛泛讲概念，没有把样本、代码或数据放进页面。';
  }
  if (/requires height|overflow|layout/i.test(reason)) {
    return '渲染几何检查失败。语义结构可能对了，但某个文本框、流程卡或表格内容超过了 renderer 预算。';
  }
  if (/budget exceeded/i.test(reason)) {
    return '内容预算超了。模型把一页写成讲稿或长网页，需要压缩或拆成更明确的结构。';
  }
  if (/semantic pipeline returned null/i.test(reason)) {
    return '语义生成多次重试后仍没有通过校验，所以后端拒绝返回半成品。';
  }
  return reason;
}

function uniqueNonEmpty(items: readonly (string | undefined)[]): string[] {
  return Array.from(new Set(items.map((item) => item?.trim()).filter(Boolean) as string[]));
}

function GenerationErrorPanel({
  title,
  error,
}: {
  readonly title: string;
  readonly error: GenerationErrorResult;
}) {
  const diagnostics = error.diagnostics;
  const reasons = uniqueNonEmpty([
    ...(diagnostics?.failureReasons || []),
    ...(diagnostics?.semanticFailureReasons || []),
    ...(diagnostics?.skillValidationFailures || []),
  ]);
  const stage = diagnostics?.failureStage || 'unknown';
  const retryLabel =
    diagnostics?.semanticRetryCount || diagnostics?.layoutRetryCount
      ? `semantic retry ${diagnostics.semanticRetryCount || 0} / layout retry ${diagnostics.layoutRetryCount || 0}`
      : 'no retry data';

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-900">
      <div className="flex flex-wrap items-center gap-2">
        <XCircle className="size-4 text-red-600" />
        <span className="font-semibold">{title}</span>
        {error.httpStatus ? <Badge variant="destructive">HTTP {error.httpStatus}</Badge> : null}
        {diagnostics?.pipeline ? <Badge variant="outline">{diagnostics.pipeline}</Badge> : null}
        <Badge variant="outline">{stage}</Badge>
      </div>
      <p className="mt-2 leading-6">{error.message}</p>

      {diagnostics ? (
        <div className="mt-3 grid gap-2 rounded-lg border border-red-100 bg-white/70 p-3 text-xs leading-5 text-slate-700 sm:grid-cols-2">
          <div>
            <div className="font-semibold text-slate-900">失败层级</div>
            <div>{stage}</div>
          </div>
          <div>
            <div className="font-semibold text-slate-900">重试情况</div>
            <div>{retryLabel}</div>
          </div>
          <div>
            <div className="font-semibold text-slate-900">route</div>
            <div>{diagnostics.slideGenerationRoute || 'unknown'}</div>
          </div>
          <div>
            <div className="font-semibold text-slate-900">fallback</div>
            <div>
              {diagnostics.contentFallbackUsed
                ? diagnostics.fallbackKind || 'used'
                : '未使用，失败会暴露出来'}
            </div>
          </div>
        </div>
      ) : null}

      {reasons.length > 0 ? (
        <div className="mt-3 space-y-2">
          <div className="text-xs font-semibold text-red-950">我会优先看的错误</div>
          {reasons.slice(0, 8).map((reason, index) => {
            const readable = readableFailureReason(reason);
            return (
              <div key={`${reason}-${index}`} className="rounded-lg bg-white/75 p-2">
                <div className="text-xs leading-5 text-slate-800">{readable}</div>
                {readable !== reason ? (
                  <code className="mt-1 block break-words rounded bg-slate-100 px-2 py-1 text-[11px] leading-4 text-slate-500">
                    {reason}
                  </code>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {error.details && !diagnostics ? (
        <code className="mt-3 block whitespace-pre-wrap break-words rounded bg-white/75 px-2 py-1 text-xs leading-5 text-slate-600">
          {error.details}
        </code>
      ) : null}
    </div>
  );
}

function SingleScenePreview({ scene }: { readonly scene: Scene }) {
  useEffect(() => {
    const stage = buildStage('zh-CN', 'classic_business');
    const viewportSize =
      scene.content.type === 'slide' ? (scene.content.canvas.viewportSize ?? 1000) : 1000;
    const viewportRatio =
      scene.content.type === 'slide' ? (scene.content.canvas.viewportRatio ?? 0.5625) : 0.5625;
    useStageStore.setState({
      stage,
      scenes: [scene],
      currentSceneId: scene.id,
      outlines: [],
      mode: 'playback',
      generationStatus: 'completed',
    });
    useCanvasStore.setState({
      viewportSize,
      viewportRatio,
      canvasPercentage: 100,
      canvasDragged: false,
      activeElementIdList: [],
      handleElementId: '',
      spotlightElementId: '',
      spotlightOptions: null,
      highlightedElementIds: [],
      highlightOptions: null,
      laserElementId: '',
      laserOptions: null,
      semanticStepTarget: null,
      zoomTarget: null,
    });
  }, [scene]);

  return (
    <SceneProvider>
      <SceneRenderer scene={scene} mode="playback" />
    </SceneProvider>
  );
}

function PromptReadonlyBlock({
  label,
  value,
  placeholder,
  minHeightClassName,
}: {
  readonly label: string;
  readonly value?: string | null;
  readonly placeholder: string;
  readonly minHeightClassName: string;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      <Textarea
        readOnly
        className={cn(
          'mt-2 resize-y rounded-xl bg-slate-50 font-mono text-[13px] leading-6 text-slate-800 shadow-inner',
          minHeightClassName,
        )}
        placeholder={placeholder}
        value={value || ''}
      />
    </label>
  );
}

export default function GenerationQualityPage() {
  const initialPreset = QUALITY_PRESETS[0];
  const [selectedPresetId, setSelectedPresetId] = useState(initialPreset.id);
  const [outlineDescription, setOutlineDescription] = useState(initialPreset.outlineDescription);
  const [keyPointsText, setKeyPointsText] = useState(initialPreset.keyPoints.join('\n'));
  const [title, setTitle] = useState(initialPreset.title);
  const [layoutTemplate, setLayoutTemplate] = useState<LayoutOptionValue>(
    initialPreset.layoutTemplate,
  );
  const [deckStyle, setDeckStyle] = useState<DeckStyleValue>(initialPreset.deckStyle);
  const [language, setLanguage] = useState<'zh-CN' | 'en-US'>('zh-CN');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPreviewingPrompt, setIsPreviewingPrompt] = useState(false);
  const [errorsByPreset, setErrorsByPreset] = useState<ErrorsByPreset>({});
  const [promptPreviewErrorsByPreset, setPromptPreviewErrorsByPreset] = useState<ErrorsByPreset>(
    {},
  );
  const [resultsByPreset, setResultsByPreset] = useState<GenerationResultsByPreset>({});
  const [promptPreviewsByPreset, setPromptPreviewsByPreset] = useState<PromptPreviewsByPreset>({});
  const [inputsByPreset, setInputsByPreset] = useState<PresetInputsByPreset>({});
  const [isStorageHydrated, setIsStorageHydrated] = useState(false);
  const [testSearch, setTestSearch] = useState('');
  const [testStatusFilter, setTestStatusFilter] = useState<TestStatusFilter>('all');
  const [testGroupFilter, setTestGroupFilter] = useState<
    'all' | (typeof PRESET_GROUP_ORDER)[number]
  >('all');
  const [testPage, setTestPage] = useState(1);

  const applyPresetInput = useCallback((presetId: string, input: PresetInputState) => {
    setSelectedPresetId(presetId);
    setOutlineDescription(input.outlineDescription);
    setKeyPointsText(input.keyPointsText);
    setTitle(input.title);
    setLayoutTemplate(input.layoutTemplate);
    setDeckStyle(input.deckStyle);
    setLanguage(input.language);
  }, []);

  useEffect(() => {
    const savedState = readGenerationQualitySavedState();
    if (!savedState) {
      setIsStorageHydrated(true);
      return;
    }

    const restoredInputs = savedState.inputsByPreset || {};
    const presetId = savedState.selectedPresetId || initialPreset.id;
    const restoredInput =
      restoredInputs[presetId] || buildDefaultPresetInput(getQualityPreset(presetId));

    setInputsByPreset(restoredInputs);
    setResultsByPreset(savedState.resultsByPreset || {});
    setErrorsByPreset(savedState.errorsByPreset || {});
    setPromptPreviewErrorsByPreset(savedState.promptPreviewErrorsByPreset || {});
    applyPresetInput(presetId, restoredInput);
    setIsStorageHydrated(true);
  }, [applyPresetInput, initialPreset.id]);

  useEffect(() => {
    if (!isStorageHydrated) return;
    const nextInput: PresetInputState = {
      title,
      outlineDescription,
      keyPointsText,
      layoutTemplate,
      deckStyle,
      language,
      updatedAt: Date.now(),
    };
    setInputsByPreset((previous) => {
      if (presetInputMatches(previous[selectedPresetId], nextInput)) return previous;
      return {
        ...previous,
        [selectedPresetId]: nextInput,
      };
    });
  }, [
    deckStyle,
    isStorageHydrated,
    keyPointsText,
    language,
    layoutTemplate,
    outlineDescription,
    selectedPresetId,
    title,
  ]);

  useEffect(() => {
    if (!isStorageHydrated) return;
    writeGenerationQualitySavedState({
      selectedPresetId,
      inputsByPreset,
      resultsByPreset,
      errorsByPreset,
      promptPreviewErrorsByPreset,
    });
  }, [
    errorsByPreset,
    inputsByPreset,
    isStorageHydrated,
    promptPreviewErrorsByPreset,
    resultsByPreset,
    selectedPresetId,
  ]);

  const selectedPreset = useMemo(() => getQualityPreset(selectedPresetId), [selectedPresetId]);
  const result = resultsByPreset[selectedPresetId] || null;
  const promptPreview = promptPreviewsByPreset[selectedPresetId] || null;
  const error = errorsByPreset[selectedPresetId] || null;
  const promptPreviewError = promptPreviewErrorsByPreset[selectedPresetId] || null;
  const selectedPresetIndex = useMemo(
    () =>
      Math.max(
        0,
        QUALITY_PRESETS.findIndex((preset) => preset.id === selectedPresetId),
      ),
    [selectedPresetId],
  );
  const selectedPresetGroup = useMemo(() => getPresetGroupLabel(selectedPreset), [selectedPreset]);
  const previousPreset =
    QUALITY_PRESETS[(selectedPresetIndex - 1 + QUALITY_PRESETS.length) % QUALITY_PRESETS.length];
  const nextPreset = QUALITY_PRESETS[(selectedPresetIndex + 1) % QUALITY_PRESETS.length];
  const presetGroups = useMemo(
    () =>
      PRESET_GROUP_ORDER.map((group) => ({
        group,
        description: getPresetGroupDescription(group),
        presets: QUALITY_PRESETS.filter((preset) => getPresetGroupLabel(preset) === group),
      })).filter((group) => group.presets.length > 0),
    [],
  );
  const generatedPresetCount = useMemo(
    () => QUALITY_PRESETS.filter((preset) => resultsByPreset[preset.id]).length,
    [resultsByPreset],
  );
  const nextUngeneratedPreset = useMemo(() => {
    if (generatedPresetCount >= QUALITY_PRESETS.length) return null;
    for (let offset = 1; offset <= QUALITY_PRESETS.length; offset += 1) {
      const candidate = QUALITY_PRESETS[(selectedPresetIndex + offset) % QUALITY_PRESETS.length];
      if (!resultsByPreset[candidate.id]) return candidate;
    }
    return null;
  }, [generatedPresetCount, resultsByPreset, selectedPresetIndex]);
  const hasAnySavedResult =
    generatedPresetCount > 0 ||
    Object.keys(promptPreviewsByPreset).length > 0 ||
    Object.keys(errorsByPreset).length > 0 ||
    Object.keys(promptPreviewErrorsByPreset).length > 0;
  const hasCurrentSavedResult = Boolean(result || promptPreview || error || promptPreviewError);

  const applyPreset = useCallback(
    (presetId: string) => {
      const currentInput: PresetInputState = {
        title,
        outlineDescription,
        keyPointsText,
        layoutTemplate,
        deckStyle,
        language,
        updatedAt: Date.now(),
      };
      setInputsByPreset((previous) =>
        presetInputMatches(previous[selectedPresetId], currentInput)
          ? previous
          : {
              ...previous,
              [selectedPresetId]: currentInput,
            },
      );
      const preset = getQualityPreset(presetId);
      applyPresetInput(preset.id, normalizePresetInput(inputsByPreset[preset.id], preset));
    },
    [
      applyPresetInput,
      deckStyle,
      inputsByPreset,
      keyPointsText,
      language,
      layoutTemplate,
      outlineDescription,
      selectedPresetId,
      title,
    ],
  );

  const resetCurrentPresetInput = useCallback(() => {
    const preset = getQualityPreset(selectedPresetId);
    const defaultInput = buildDefaultPresetInput(preset);
    setInputsByPreset((previous) => {
      const next = { ...previous };
      delete next[preset.id];
      return next;
    });
    applyPresetInput(preset.id, defaultInput);
  }, [applyPresetInput, selectedPresetId]);

  const goToPresetOffset = useCallback(
    (offset: number) => {
      const nextIndex =
        (selectedPresetIndex + offset + QUALITY_PRESETS.length) % QUALITY_PRESETS.length;
      applyPreset(QUALITY_PRESETS[nextIndex].id);
    },
    [applyPreset, selectedPresetIndex],
  );

  const goToNextUngeneratedPreset = useCallback(() => {
    if (!nextUngeneratedPreset) return;
    applyPreset(nextUngeneratedPreset.id);
  }, [applyPreset, nextUngeneratedPreset]);

  const clearCurrentPresetResult = useCallback(() => {
    setResultsByPreset((previous) => {
      const next = { ...previous };
      delete next[selectedPresetId];
      return next;
    });
    setPromptPreviewsByPreset((previous) => {
      const next = { ...previous };
      delete next[selectedPresetId];
      return next;
    });
    setErrorsByPreset((previous) => {
      const next = { ...previous };
      delete next[selectedPresetId];
      return next;
    });
    setPromptPreviewErrorsByPreset((previous) => {
      const next = { ...previous };
      delete next[selectedPresetId];
      return next;
    });
  }, [selectedPresetId]);

  const clearAllPresetResults = useCallback(() => {
    setResultsByPreset({});
    setPromptPreviewsByPreset({});
    setErrorsByPreset({});
    setPromptPreviewErrorsByPreset({});
  }, []);

  const outlineKeyPoints = useMemo(
    () =>
      keyPointsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    [keyPointsText],
  );

  const outlinePreview = useMemo(
    () =>
      buildOutline({
        presetId: selectedPreset.id,
        title,
        description: outlineDescription,
        keyPoints: outlineKeyPoints,
        layoutTemplate,
        deckStyle,
        language,
      }),
    [
      deckStyle,
      language,
      layoutTemplate,
      outlineDescription,
      outlineKeyPoints,
      selectedPreset.id,
      title,
    ],
  );

  const qualityChecks = useMemo(
    () =>
      evaluateResult({
        scene: result?.scene || null,
        expectedTemplate: layoutTemplate,
        expectedDeckStyle: deckStyle,
        expectedAnchors: selectedPreset.expectedAnchors,
        generatedContentCount: result?.generatedContentCount || 0,
        generationDiagnostics: result?.rawResponse.generationDiagnostics,
      }),
    [deckStyle, layoutTemplate, result, selectedPreset.expectedAnchors],
  );

  const checkSummary = useMemo(() => {
    const total = qualityChecks.length;
    const failed = qualityChecks.filter((check) => check.status === 'fail').length;
    const warned = qualityChecks.filter((check) => check.status === 'warn').length;
    return { total, failed, warned, passed: total - failed - warned };
  }, [qualityChecks]);

  const testListItems = useMemo(
    () =>
      QUALITY_PRESETS.map((preset, index) => {
        const savedResult = resultsByPreset[preset.id];
        const savedError = errorsByPreset[preset.id];
        const savedPrompt = promptPreviewsByPreset[preset.id];
        const sortTime =
          savedResult?.createdAt || savedError?.createdAt || savedPrompt?.createdAt || 0;
        const group = getPresetGroupLabel(preset);
        let status: TestListStatus = 'pending';
        let passed = 0;
        let total = 0;
        let failed = 0;
        let warned = 0;

        if (savedResult) {
          const expectedTemplate = isLayoutOptionValue(
            savedResult.outline.layoutIntent?.layoutTemplate,
          )
            ? savedResult.outline.layoutIntent.layoutTemplate
            : preset.layoutTemplate;
          const outlineDeckStyle = savedResult.outline.layoutIntent?.deckStyle;
          const expectedDeckStyle =
            typeof outlineDeckStyle === 'string' && DECK_STYLE_VALUES.has(outlineDeckStyle)
              ? (outlineDeckStyle as DeckStyleValue)
              : preset.deckStyle;
          const checks = evaluateResult({
            scene: savedResult.scene,
            expectedTemplate,
            expectedDeckStyle,
            expectedAnchors: preset.expectedAnchors,
            generatedContentCount: savedResult.generatedContentCount,
            generationDiagnostics: savedResult.rawResponse.generationDiagnostics,
          });
          total = checks.length;
          failed = checks.filter((check) => check.status === 'fail').length;
          warned = checks.filter((check) => check.status === 'warn').length;
          passed = total - failed - warned;
          status = failed > 0 ? 'fail' : warned > 0 ? 'warn' : 'pass';
        } else if (savedError) {
          status = 'error';
        }

        return {
          preset,
          index,
          group,
          status,
          passed,
          total,
          failed,
          warned,
          hasPromptPreview: Boolean(savedPrompt),
          sortTime,
        };
      }),
    [errorsByPreset, promptPreviewsByPreset, resultsByPreset],
  );

  const sortedTestListItems = useMemo(() => {
    return [...testListItems].sort((left, right) => {
      if (left.sortTime !== right.sortTime) return right.sortTime - left.sortTime;
      return left.index - right.index;
    });
  }, [testListItems]);

  const filteredTestListItems = useMemo(() => {
    const query = testSearch.trim().toLowerCase();
    return sortedTestListItems.filter((item) => {
      if (testGroupFilter !== 'all' && item.group !== testGroupFilter) return false;
      if (testStatusFilter !== 'all' && item.status !== testStatusFilter) return false;
      if (!query) return true;
      return [
        item.preset.label,
        item.preset.id,
        item.preset.description,
        item.preset.layoutTemplate,
        item.preset.deckStyle,
      ]
        .join('\n')
        .toLowerCase()
        .includes(query);
    });
  }, [sortedTestListItems, testGroupFilter, testSearch, testStatusFilter]);

  const testPageCount = Math.max(1, Math.ceil(filteredTestListItems.length / TEST_LIST_PAGE_SIZE));
  const safeTestPage = Math.min(testPage, testPageCount);
  const visibleTestListItems = filteredTestListItems.slice(
    (safeTestPage - 1) * TEST_LIST_PAGE_SIZE,
    safeTestPage * TEST_LIST_PAGE_SIZE,
  );

  useEffect(() => {
    setTestPage(1);
  }, [testGroupFilter, testSearch, testStatusFilter]);

  const rawJson = useMemo(() => {
    if (!result) return '';
    return JSON.stringify(
      {
        effectiveOutline: result.outline,
        semanticDocument:
          result.scene.content.type === 'slide' ? result.scene.content.semanticDocument : null,
        webRenderMode:
          result.scene.content.type === 'slide' ? result.scene.content.webRenderMode : null,
        generationDiagnostics: result.rawResponse.generationDiagnostics,
      },
      null,
      2,
    );
  }, [result]);

  const buildSceneContentPayload = useCallback(
    (outline: SceneOutline, stage: Stage) => ({
      outline,
      allOutlines: buildQualityAllOutlines(outline),
      stageInfo: {
        name: stage.name,
        description: stage.description,
        language: stage.language,
        style: stage.style,
      },
      stageId: stage.id,
      agents: [],
      slideGenerationRoute: DEFAULT_SLIDE_GENERATION_ROUTE,
    }),
    [],
  );

  const handlePreviewPrompt = useCallback(async () => {
    const now = Date.now();
    const activePresetId = selectedPreset.id;
    const effectiveLanguage =
      inferInputLanguage({ title, outlineDescription, keyPointsText }) || language;
    if (effectiveLanguage !== language) setLanguage(effectiveLanguage);
    const outline = buildOutline({
      presetId: activePresetId,
      title,
      description: outlineDescription,
      keyPoints: outlineKeyPoints,
      layoutTemplate,
      deckStyle,
      language: effectiveLanguage,
      id: `qa-outline-${now}`,
    });
    const stage = buildStage(effectiveLanguage, deckStyle, now);
    setIsPreviewingPrompt(true);
    setPromptPreviewErrorsByPreset((previous) => {
      const next = { ...previous };
      delete next[activePresetId];
      return next;
    });

    try {
      const response = await backendFetch('/api/generate/scene-content/prompt-preview', {
        method: 'POST',
        headers: getApiHeaders({ imageGenerationEnabled: false }),
        body: JSON.stringify(buildSceneContentPayload(outline, stage)),
      });
      const data = (await response.json().catch(() => ({}))) as PromptPreviewResponse;
      if (!response.ok || data.success === false) {
        setPromptPreviewErrorsByPreset((previous) => ({
          ...previous,
          [activePresetId]: buildGenerationErrorResult(
            data,
            response.status,
            `Prompt 预览失败：HTTP ${response.status}`,
          ),
        }));
        return;
      }
      setPromptPreviewsByPreset((previous) => ({
        ...previous,
        [activePresetId]: { response: data, createdAt: Date.now() },
      }));
    } catch (err) {
      setPromptPreviewErrorsByPreset((previous) => ({
        ...previous,
        [activePresetId]: buildUnknownErrorResult(err),
      }));
    } finally {
      setIsPreviewingPrompt(false);
    }
  }, [
    buildSceneContentPayload,
    deckStyle,
    keyPointsText,
    language,
    layoutTemplate,
    outlineDescription,
    outlineKeyPoints,
    selectedPreset.id,
    title,
  ]);

  const handleGenerate = useCallback(async () => {
    const now = Date.now();
    const activePresetId = selectedPreset.id;
    const effectiveLanguage =
      inferInputLanguage({ title, outlineDescription, keyPointsText }) || language;
    if (effectiveLanguage !== language) setLanguage(effectiveLanguage);
    const outline = buildOutline({
      presetId: activePresetId,
      title,
      description: outlineDescription,
      keyPoints: outlineKeyPoints,
      layoutTemplate,
      deckStyle,
      language: effectiveLanguage,
      id: `qa-outline-${now}`,
    });
    const stage = buildStage(effectiveLanguage, deckStyle, now);
    setIsGenerating(true);
    setErrorsByPreset((previous) => {
      const next = { ...previous };
      delete next[activePresetId];
      return next;
    });

    try {
      const response = await backendFetch('/api/generate/scene-content', {
        method: 'POST',
        headers: getGenerationQualityHeaders(),
        body: JSON.stringify(buildSceneContentPayload(outline, stage)),
      });

      const data = (await response.json().catch(() => ({}))) as SceneContentResponse;
      if (!response.ok || data.success === false) {
        setErrorsByPreset((previous) => ({
          ...previous,
          [activePresetId]: buildGenerationErrorResult(
            data,
            response.status,
            `生成失败：HTTP ${response.status}`,
          ),
        }));
        return;
      }

      const contents =
        Array.isArray(data.contents) && data.contents.length > 0
          ? data.contents
          : data.content
            ? [data.content]
            : [];
      const firstContent = contents[0];
      if (!isGeneratedSlideContent(firstContent)) {
        throw new Error('接口没有返回可渲染的 slide content。');
      }

      const effectiveOutline = data.effectiveOutline || outline;
      const scene = buildSceneFromGeneratedContent({
        content: firstContent,
        outline: effectiveOutline,
        diagnostics: data.generationDiagnostics,
      });

      setResultsByPreset((previous) => ({
        ...previous,
        [activePresetId]: {
          scene,
          outline: effectiveOutline,
          rawResponse: data,
          generatedContentCount: contents.length,
          createdAt: Date.now(),
        },
      }));
    } catch (err) {
      setErrorsByPreset((previous) => ({
        ...previous,
        [activePresetId]: buildUnknownErrorResult(err),
      }));
    } finally {
      setIsGenerating(false);
    }
  }, [
    buildSceneContentPayload,
    deckStyle,
    keyPointsText,
    language,
    layoutTemplate,
    outlineDescription,
    outlineKeyPoints,
    selectedPreset.id,
    title,
  ]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-6 px-6 py-6">
        <div>
          <Link
            href="/generation-tests"
            className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-700"
          >
            <ChevronLeft className="size-4" />
            返回所有测试
          </Link>
        </div>

        <section className="grid gap-5 xl:grid-cols-[minmax(320px,3fr)_minmax(0,7fr)]">
          <aside className="flex flex-col gap-4 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)]">
            <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">测试列表</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    按最近生成时间排序；每页 {TEST_LIST_PAGE_SIZE}{' '}
                    条，支持按名称、版式、状态和分组筛选。
                  </p>
                </div>
                <Badge variant="outline">
                  {filteredTestListItems.length}/{QUALITY_PRESETS.length}
                </Badge>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-600">
                  搜索
                  <Input
                    className="mt-1"
                    placeholder="名称、ID、版式..."
                    value={testSearch}
                    onChange={(event) => setTestSearch(event.target.value)}
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs font-medium text-slate-600">
                    状态
                    <Select
                      value={testStatusFilter}
                      onValueChange={(value) => setTestStatusFilter(value as TestStatusFilter)}
                    >
                      <SelectTrigger className="mt-1 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部</SelectItem>
                        <SelectItem value="pending">待测</SelectItem>
                        <SelectItem value="pass">通过</SelectItem>
                        <SelectItem value="warn">警告</SelectItem>
                        <SelectItem value="fail">失败</SelectItem>
                        <SelectItem value="error">错误</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>

                  <label className="block text-xs font-medium text-slate-600">
                    分组
                    <Select
                      value={testGroupFilter}
                      onValueChange={(value) =>
                        setTestGroupFilter(value as 'all' | (typeof PRESET_GROUP_ORDER)[number])
                      }
                    >
                      <SelectTrigger className="mt-1 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部</SelectItem>
                        {presetGroups.map((group) => (
                          <SelectItem key={group.group} value={group.group}>
                            {group.group}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                </div>
              </div>

              <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {visibleTestListItems.length > 0 ? (
                  visibleTestListItems.map((item) => {
                    const isSelected = item.preset.id === selectedPresetId;
                    return (
                      <button
                        key={item.preset.id}
                        type="button"
                        onClick={() => applyPreset(item.preset.id)}
                        className={cn(
                          'block w-full rounded-xl border px-3 py-2 text-left transition',
                          isSelected
                            ? 'border-blue-500 bg-blue-50 shadow-sm'
                            : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                                  isSelected
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-100 text-slate-500',
                                )}
                              >
                                {item.index + 1}
                              </span>
                              <span className="truncate text-sm font-semibold text-slate-900">
                                {item.preset.label}
                              </span>
                            </div>
                            <div className="mt-1 truncate text-[11px] text-slate-500">
                              {item.group} · {item.preset.layoutTemplate}
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <Badge variant={testStatusBadgeVariant(item.status)}>
                              {item.total > 0 ? `通过 ${item.passed}/${item.total}` : '未计分'}
                            </Badge>
                            <span className="text-[11px] text-slate-400">
                              {testStatusLabel(item.status)}
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                          <span>
                            {item.sortTime
                              ? `最近 ${new Date(item.sortTime).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })}`
                              : '未生成'}
                          </span>
                          {item.warned > 0 ? <span>· warn {item.warned}</span> : null}
                          {item.failed > 0 ? <span>· fail {item.failed}</span> : null}
                          {item.hasPromptPreview ? <span>· prompt</span> : null}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-400">
                    没有匹配的测试。
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={safeTestPage <= 1}
                  onClick={() => setTestPage((page) => Math.max(1, page - 1))}
                >
                  <ChevronLeft className="size-4" />
                  上一页
                </Button>
                <div className="text-center text-xs text-slate-500">
                  {safeTestPage}/{testPageCount} · {filteredTestListItems.length} tests
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={safeTestPage >= testPageCount}
                  onClick={() => setTestPage((page) => Math.min(testPageCount, page + 1))}
                >
                  下一页
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </aside>

          <div className="flex min-w-0 flex-col gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      {selectedPresetIndex + 1}/{QUALITY_PRESETS.length}
                    </Badge>
                    <Badge variant="outline">{selectedPresetGroup}</Badge>
                    <Badge variant={result ? 'default' : error ? 'destructive' : 'outline'}>
                      {result ? '已生成' : error ? '生成失败' : '未生成'}
                    </Badge>
                    <Badge
                      variant={statusBadgeVariant(
                        checkSummary.failed ? 'fail' : checkSummary.warned ? 'warn' : 'pass',
                      )}
                    >
                      当前 {checkSummary.passed}/{checkSummary.total}
                    </Badge>
                  </div>
                  <h2 className="mt-3 text-lg font-semibold tracking-normal text-slate-950">
                    {selectedPreset.label}
                  </h2>
                  <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">
                    {selectedPreset.description}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => goToPresetOffset(-1)}
                  >
                    <ChevronLeft className="size-4" />
                    上一个
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => goToPresetOffset(1)}
                  >
                    下一个
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="mb-4 grid gap-3 border-y border-slate-100 py-3 text-xs leading-5 text-slate-600 sm:grid-cols-4">
                <div>
                  <div className="font-semibold text-slate-800">当前版式</div>
                  <div>
                    {selectedPreset.layoutTemplate} / {selectedPreset.deckStyle}
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-slate-800">教学角色</div>
                  <div>{selectedPreset.teachingRole}</div>
                </div>
                <div>
                  <div className="font-semibold text-slate-800">上一种</div>
                  <button
                    type="button"
                    className="text-left text-blue-700 hover:underline"
                    onClick={() => goToPresetOffset(-1)}
                  >
                    {previousPreset.label}
                  </button>
                </div>
                <div>
                  <div className="font-semibold text-slate-800">下一种</div>
                  <button
                    type="button"
                    className="text-left text-blue-700 hover:underline"
                    onClick={() => goToPresetOffset(1)}
                  >
                    {nextPreset.label}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.32fr)]">
                <div className="space-y-3">
                  <label className="block text-xs font-medium text-slate-600">
                    outline.title
                    <Input
                      className="mt-1"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </label>

                  <label className="block text-xs font-medium text-slate-600">
                    outline.description
                    <Textarea
                      className="mt-1 min-h-[120px] resize-y font-mono text-[13px] leading-6"
                      value={outlineDescription}
                      onChange={(event) => setOutlineDescription(event.target.value)}
                    />
                  </label>

                  <label className="block text-xs font-medium text-slate-600">
                    outline.keyPoints（一行一条）
                    <Textarea
                      className="mt-1 min-h-[110px] resize-y font-mono text-[13px] leading-6"
                      value={keyPointsText}
                      onChange={(event) => setKeyPointsText(event.target.value)}
                    />
                  </label>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                    <label className="block text-xs font-medium text-slate-600">
                      layoutTemplate
                      <Select
                        value={layoutTemplate}
                        onValueChange={(value) => setLayoutTemplate(value as LayoutOptionValue)}
                      >
                        <SelectTrigger className="mt-1 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LAYOUT_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>

                    <label className="block text-xs font-medium text-slate-600">
                      deckStyle
                      <Select
                        value={deckStyle}
                        onValueChange={(value) => setDeckStyle(value as DeckStyleValue)}
                      >
                        <SelectTrigger className="mt-1 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DECK_STYLE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                  </div>

                  <label className="block text-xs font-medium text-slate-600">
                    language
                    <Select
                      value={language}
                      onValueChange={(value) => setLanguage(value as 'zh-CN' | 'en-US')}
                    >
                      <SelectTrigger className="mt-1 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="zh-CN">zh-CN</SelectItem>
                        <SelectItem value="en-US">en-US</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>

                  <div className="border-l-2 border-blue-200 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900">
                    <div className="font-semibold">当前模板意图</div>
                    <div>
                      {LAYOUT_OPTIONS.find((option) => option.value === layoutTemplate)?.hint}
                    </div>
                  </div>

                  <Button
                    type="button"
                    className="w-full"
                    disabled={isGenerating || !outlineDescription.trim()}
                    onClick={handleGenerate}
                  >
                    {isGenerating ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    {isGenerating ? '正在生成一页...' : '生成并质检'}
                  </Button>

                  <Button
                    type="button"
                    className="w-full"
                    variant="outline"
                    disabled={isPreviewingPrompt || !outlineDescription.trim()}
                    onClick={handlePreviewPrompt}
                  >
                    {isPreviewingPrompt ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <FileJson className="size-4" />
                    )}
                    {isPreviewingPrompt ? '正在组装 Prompt...' : '查看完整 Prompt'}
                  </Button>

                  <Button
                    type="button"
                    className="w-full"
                    variant="outline"
                    disabled={!nextUngeneratedPreset || isGenerating || isPreviewingPrompt}
                    onClick={goToNextUngeneratedPreset}
                  >
                    下一个未生成
                    <ChevronRight className="size-4" />
                  </Button>

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!hasCurrentSavedResult || isGenerating || isPreviewingPrompt}
                      onClick={clearCurrentPresetResult}
                    >
                      <XCircle className="size-4" />
                      清当前
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!hasAnySavedResult || isGenerating || isPreviewingPrompt}
                      onClick={clearAllPresetResults}
                    >
                      <XCircle className="size-4" />
                      清全部
                    </Button>
                  </div>

                  <Button
                    type="button"
                    className="w-full"
                    variant="outline"
                    size="sm"
                    onClick={resetCurrentPresetInput}
                  >
                    <RefreshCw className="size-4" />
                    重置输入
                  </Button>
                </div>
              </div>

              {error ? (
                <div className="mt-4">
                  <GenerationErrorPanel title="生成失败" error={error} />
                </div>
              ) : null}

              {promptPreviewError ? (
                <div className="mt-4">
                  <GenerationErrorPanel title="Prompt 预览失败" error={promptPreviewError} />
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">渲染预览</h2>
                  <p className="text-xs text-slate-500">
                    这里复用课堂 slide renderer；如果结果是长页或半成品，会在预览和质检里同时暴露。
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={isGenerating || !outlineDescription.trim()}
                    onClick={handleGenerate}
                  >
                    {isGenerating ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    {isGenerating ? '生成中...' : '生成'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => goToPresetOffset(-1)}
                  >
                    <ChevronLeft className="size-4" />
                    上一个
                  </Button>
                  <Badge variant="outline">
                    {selectedPresetIndex + 1}/{QUALITY_PRESETS.length}
                  </Badge>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => goToPresetOffset(1)}
                  >
                    下一个
                    <ChevronRight className="size-4" />
                  </Button>
                  {result ? (
                    <Badge variant="outline">
                      {new Date(result.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </Badge>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl bg-slate-100 p-4">
                <div className="mx-auto aspect-video w-full max-w-[1040px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                  {result ? (
                    <SingleScenePreview key={result.scene.id} scene={result.scene} />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
                      <Sparkles className="size-8" />
                      <div className="text-sm font-medium">生成一页后在这里预览</div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <ClipboardList className="size-4 text-slate-500" />
                <h2 className="text-sm font-semibold">发送给 scene-content 的 payload</h2>
              </div>
              <pre className="max-h-[240px] overflow-auto rounded-xl bg-slate-950 p-3 text-xs leading-5 text-slate-100">
                {JSON.stringify(
                  {
                    outline: outlinePreview,
                    stageInfo: buildStage(language, deckStyle),
                    slideGenerationRoute: DEFAULT_SLIDE_GENERATION_ROUTE,
                  },
                  null,
                  2,
                )}
              </pre>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">本地质检</h2>
                  <Badge
                    variant={statusBadgeVariant(
                      checkSummary.failed ? 'fail' : checkSummary.warned ? 'warn' : 'pass',
                    )}
                  >
                    {checkSummary.passed}/{checkSummary.total}
                  </Badge>
                </div>
                <div className="max-h-[360px] space-y-2 overflow-auto pr-1">
                  {qualityChecks.map((check) => (
                    <div
                      key={`${check.label}-${check.detail}`}
                      className={cn(
                        'rounded-xl border px-3 py-2',
                        check.status === 'pass' && 'border-emerald-100 bg-emerald-50/60',
                        check.status === 'warn' && 'border-amber-100 bg-amber-50/70',
                        check.status === 'fail' && 'border-red-100 bg-red-50/70',
                      )}
                    >
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        {statusIcon(check.status)}
                        {check.label}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-600">{check.detail}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <FileJson className="size-4 text-slate-500" />
                  <h2 className="text-sm font-semibold">生成结果 JSON</h2>
                </div>
                {rawJson ? (
                  <pre className="max-h-[360px] overflow-auto rounded-xl bg-slate-950 p-3 text-xs leading-5 text-slate-100">
                    {rawJson}
                  </pre>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center text-sm text-slate-400">
                    还没有生成结果。
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-sm font-semibold">完整模型 Prompt</h2>
                  <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
                    后端复用正式 scene-content prompt builder 组装；这里只预览，不调用模型。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {promptPreview ? (
                    <>
                      <Badge variant="outline">
                        {new Date(promptPreview.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </Badge>
                      <Badge variant="outline">{promptPreview.response.promptId || 'prompt'}</Badge>
                      <Badge variant="outline">
                        route:{' '}
                        {promptPreview.response.slideGenerationRoute ||
                          DEFAULT_SLIDE_GENERATION_ROUTE}
                      </Badge>
                      <Badge
                        variant={promptPreview.response.templateDriven ? 'secondary' : 'outline'}
                      >
                        {promptPreview.response.templateDriven ? 'template driven' : 'model prompt'}
                      </Badge>
                    </>
                  ) : (
                    <Badge variant="outline">等待预览</Badge>
                  )}
                </div>
              </div>

              <div className="grid gap-4 2xl:grid-cols-2">
                <PromptReadonlyBlock
                  label="System Prompt"
                  value={promptPreview?.response.systemPrompt}
                  placeholder="点击“查看完整 Prompt”后，这里显示最终 system prompt。"
                  minHeightClassName="min-h-[300px] max-h-[420px]"
                />
                <PromptReadonlyBlock
                  label="User Prompt"
                  value={promptPreview?.response.userPrompt}
                  placeholder="点击“查看完整 Prompt”后，这里显示最终 user prompt。"
                  minHeightClassName="min-h-[300px] max-h-[420px]"
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
