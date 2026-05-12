'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Code2,
  FileText,
  Image as ImageIcon,
  Loader2,
  Presentation,
  RefreshCw,
  Save,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getApiHeaders } from '@/lib/create/generation-headers';
import { IMAGE_PROVIDERS } from '@/lib/media/image-providers';
import type {
  ImageGenerationCostEstimate,
  ImageGenerationResult,
  ImageProviderId,
} from '@/lib/media/types';
import { useSettingsStore } from '@/lib/store/settings';
import { backendFetch } from '@/lib/utils/backend-api';
import { formatComputeCreditsLabel, formatUsdLabel } from '@/lib/utils/credits';
import { db } from '@/lib/utils/database';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'syntara:generation-quality-html:v3';
const HTML_SINGLE_PAGE_MODEL = 'gpt-5.4';
const IMAGE_ASSET_TOKEN = '__SYNTARA_GENERATED_SLIDE_IMAGE_ASSET__';
const HTML_IMAGE_SLOT_ATTR = 'data-syntara-ai-image-slot';

type HtmlPageKind = 'intro' | 'summary' | 'process' | 'table' | 'math' | 'code' | 'example';
type DensityLevel = 'light' | 'medium' | 'dense';
type QualityStatus = 'pass' | 'warn' | 'fail';

type TokenUsage = {
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
  totalTokens?: number | null;
};

type HtmlCostEstimate = {
  baseUsd: number | null;
  retailUsd: number;
  computeCredits: number;
  markupMultiplier: number | null;
  source: 'openai_pricing' | 'token_fallback';
};

type HtmlRetryReason = {
  code?: string;
  title: string;
  details?: string[];
};

type GenerateHtmlPptResponse = {
  success?: boolean;
  html?: string;
  model?: string;
  usage?: TokenUsage | null;
  costEstimate?: HtmlCostEstimate | null;
  generationAttempts?: number;
  retryReasons?: HtmlRetryReason[];
  skippedCreditCharge?: boolean;
  error?: string;
};

type GenerateSlideImageResponse = {
  success?: boolean;
  result?: ImageGenerationResult;
  costEstimate?: ImageGenerationCostEstimate | null;
  skippedCreditCharge?: boolean;
  error?: string;
};

type HtmlImageAsset = {
  sourceType: 'pending' | 'url' | 'indexeddb';
  url?: string;
  storageId?: string;
  mimeType?: string;
  size?: number;
  providerId: ImageProviderId;
  providerName: string;
  modelId: string;
  prompt: string;
  width?: number;
  height?: number;
  estimatedCostLabel?: string;
  costEstimate?: ImageGenerationCostEstimate | null;
  skippedCreditCharge?: boolean;
};

type HtmlSinglePagePreset = {
  id: string;
  kind: HtmlPageKind;
  label: string;
  version: number;
  description: string;
  prompt: string;
  requiredSignal: string;
  densityProfile: DensityProfile;
  requiredAnchors: string[];
  forbiddenAnchors?: string[];
};

type DensityProfile = {
  level: DensityLevel;
  label: string;
  textChars: { min: number; max: number };
  textBlocks: { min: number; max: number };
  contentCoverage: { min: number; max: number };
  smallTextThresholdPx: 20 | 22 | 24;
  maxSmallTextRatio: number;
  guidance: string;
};

type StoredRun = {
  id: string;
  presetId: string;
  pageKind: HtmlPageKind;
  label: string;
  createdAt: number;
  presetSignature?: string;
  prompt: string;
  model?: string;
  html: string;
  htmlLength: number;
  textNodeCount: number;
  elementCount: number;
  mathElementCount: number;
  usage?: TokenUsage | null;
  costEstimate?: HtmlCostEstimate | null;
  imageAsset?: HtmlImageAsset | null;
  generationAttempts?: number;
  retryReasons?: HtmlRetryReason[];
  skippedCreditCharge?: boolean;
  quality?: StoredQuality;
};

type StoredError = {
  presetId: string;
  pageKind: HtmlPageKind;
  label: string;
  createdAt: number;
  prompt: string;
  message: string;
};

type StoredState = {
  selectedPresetId?: string;
  promptByPreset?: Record<string, string>;
  runsByPreset?: Record<string, StoredRun>;
  errorsByPreset?: Record<string, StoredError>;
  history?: StoredRun[];
  errors?: StoredError[];
};

type PreviewStats = {
  scrollWidth: number;
  scrollHeight: number;
  slideCount: number;
  hasSlideContent: boolean;
  outOfBoundsCount: number;
  outOfBoundsSamples: string[];
  headingCount: number;
  tableCount: number;
  tableRowCount: number;
  mathCount: number;
  mspaceCount: number;
  preCount: number;
  codeCount: number;
  listItemCount: number;
  cardishCount: number;
  stepishCount: number;
  textNodeCount: number;
  visibleCharCount: number;
  maxTextLength: number;
  imageCount: number;
  largeImageCount: number;
  contentCoverageRatio: number;
  sparseLargeContainerCount: number;
  sparseLargeContainerSamples: string[];
  smallTextRatioUnder20: number;
  smallTextRatioUnder22: number;
  smallTextRatioUnder24: number;
  visibleText: string;
  scriptLikeCount: number;
  preOverflowCount: number;
};

type QualityCheck = {
  status: QualityStatus;
  label: string;
  detail: string;
};

type StoredQuality = {
  failed: number;
  warned: number;
  passed: number;
  total: number;
  outOfBoundsCount: number;
  mathCount: number;
  scrollWidth: number;
  scrollHeight: number;
  checkedAt: number;
};

const DENSITY_PROFILES = {
  light: {
    level: 'light',
    label: '轻量导入',
    textChars: { min: 80, max: 220 },
    textBlocks: { min: 6, max: 18 },
    contentCoverage: { min: 0.32, max: 0.8 },
    smallTextThresholdPx: 24,
    maxSmallTextRatio: 0.12,
    guidance: '标题醒目，正文只保留必要入口，不能空成海报，也不能塞满说明。',
  },
  medium: {
    level: 'medium',
    label: '中等信息',
    textChars: { min: 120, max: 300 },
    textBlocks: { min: 8, max: 26 },
    contentCoverage: { min: 0.4, max: 0.82 },
    smallTextThresholdPx: 22,
    maxSmallTextRatio: 0.2,
    guidance: '适合总结、流程、例题；信息可扫读，每块只讲一个点。',
  },
  dense: {
    level: 'dense',
    label: '信息密集',
    textChars: { min: 150, max: 380 },
    textBlocks: { min: 12, max: 40 },
    contentCoverage: { min: 0.44, max: 0.84 },
    smallTextThresholdPx: 20,
    maxSmallTextRatio: 0.35,
    guidance: '适合表格、代码、公式页；允许更密，但必须靠结构承载，不能靠缩小字号硬塞。',
  },
} satisfies Record<DensityLevel, DensityProfile>;

const PAGE_PRESETS: HtmlSinglePagePreset[] = [
  {
    id: 'intro-course',
    kind: 'intro',
    label: '介绍页',
    version: 6,
    description: '测试开场介绍页：不是 landing hero，而是一张能直接放进课件的导入页。',
    requiredSignal: '清晰标题 + 一句定位 + 3-4 个入口块',
    densityProfile: DENSITY_PROFILES.light,
    requiredAnchors: ['导数', '瞬时速度', '平均速度', '切线斜率'],
    forbiddenAnchors: ['AI Tutor', 'Evaluation Lab', 'rubric', '题库'],
    prompt: `生成一张 16:9 HTML/CSS PPT 风格的「介绍页」。

主题：用瞬时速度引出导数
受众：刚开始学习微积分的高中或大一学生
目的：作为一节导入课，让学生先理解「为什么需要导数」
内容：
- 标题：为什么要学习导数？
- 一句短定位：导数帮助我们描述「正在变化的那一刻」
- 三个入口模块：平均速度、瞬时速度、切线斜率
- 每个入口模块只能包含：模块标题 + 1 句不超过 18 个中文字的解释
- 加一个很短的「今天会解决」横条：生活情境、核心问题、关键概念各 1 个短标签
- 底部只放一句引导问题：如果时间间隔越来越小，平均速度会靠近什么？
- 系统会提供一张 AI 配图；把它作为右侧或中部主视觉，文字模块围绕图片组织
- 不要给三个入口模块再添加底部说明、项目符号、长解释、第二层小标题、CSS 小图标或 CSS 手绘大图
- 总可见文字控制在 130-200 个中文字符之间，文本节点控制在 9-18 个
- 除少量装饰标签外，主要可读中文文字字号不要低于 24px

风格：中文课堂课件页，白底，蓝色和绿色点缀，真实文字，可编辑 HTML/CSS，使用提供的 AI 配图，不要再用 CSS 自己画复杂插图。`,
  },
  {
    id: 'summary-outcomes',
    kind: 'summary',
    label: '总结页',
    version: 6,
    description: '测试总结页：几条 takeaway 和一个收束判断，不能变成长段落。',
    requiredSignal: '3-4 条 takeaway + 收束结论',
    densityProfile: DENSITY_PROFILES.medium,
    requiredAnchors: ['本周质量总结', '81%', '68%', '数学讲解', '代码追踪', '表格'],
    forbiddenAnchors: ['AI Tutor', 'Evaluation Lab', '链式法则', '二分查找', '盈亏平衡'],
    prompt: `生成一张 16:9 HTML/CSS PPT 风格的「总结页」。

主题：rubric 约束生成一周后，质量有哪些提升
受众：产品团队和学习运营团队
内容：
- 标题：本周质量总结
- 页面只能包含：标题区、一个小型核心指标、3 条 takeaway、一个收束判断条
- 结论 1：数学讲解更短，也更容易检查
- 结论 2：代码追踪页更能保留变量状态变化
- 结论 3：表格密集页面仍然需要限制行数
- 核心指标：首次可用率 81%，上周为 68%
- 收束判断：继续按页面类型约束生成，而不是依赖装饰性 layout template
- 不要添加额外的“对产品和学习运营的含义”、下一步建议、三角度分析、右侧说明面板或第 4 条 takeaway
- 每条 takeaway 只允许：短标题 + 一句不超过 22 个中文字的解释
- 总可见文字控制在 160-260 个中文字符之间，文本块控制在 10-22 个
- 除少量 eyebrow/编号标签外，所有可读文字字号不要低于 22px，takeaway 正文建议不低于 24px
- takeaway 必须是短卡片或紧凑横条，高度建议 120-170px；如果只有两行文字，不要拉伸成大空白卡片

风格：面向团队复盘的课堂总结页，短卡片，一个突出指标，不要长段落，不要 dashboard 化。`,
  },
  {
    id: 'process-pipeline',
    kind: 'process',
    label: '流程页',
    version: 6,
    description: '测试流程页：需要 4-5 步清晰路径，能看出方向和每步产物。',
    requiredSignal: '4-5 步流程 + 输出/检查点',
    densityProfile: {
      ...DENSITY_PROFILES.medium,
      label: '流程信息',
      textChars: { min: 120, max: 320 },
      textBlocks: { min: 8, max: 32 },
      guidance: '适合流程页；每步允许标题、动作和输出，但不能膨胀成讲义。',
    },
    requiredAnchors: ['PDF', '题库', '逐题', '选择题', '保存前'],
    forbiddenAnchors: ['链式法则', '二分查找', '盈亏平衡', 'AI Tutor'],
    prompt: `生成一张 16:9 HTML/CSS PPT 风格的「流程页」。

主题：从上传 PDF 到可用题库
受众：工程团队和教研 QA
内容：
- 标题：PDF 到题库的生成流程
- 页面只能包含：标题区、5 个流程步骤、一个风险提示条
- 第 1 步：模型直接读取原始 PDF
- 第 2 步：逐题抽取，并保留表格、公式和题干结构
- 第 3 步：分类题型：选择题、简答题、证明题、代码题
- 第 4 步：只有选择题缺答案时，才让模型补答案
- 第 5 步：保存前检查「学生能不能做这道题」
- 加一个风险提示：表格和图示必须显式保留
- 主流程区必须紧跟标题区，不能在标题和流程之间留大片空白
- 5 个步骤必须形成一个清楚的横向或弯折流程轨道，占据页面中部主要视觉区域
- 如果横向排列 5 个步骤，slide-content 内宽约 1472px，5 张卡片 + 4 个连接器总宽必须小于等于 1440px
- 横向流程建议每张步骤卡 220-235px、连接器 28-40px；不要写 260px 70px 260px 这种总宽超过内宽的固定列
- 每个流程步骤只允许：步骤编号 + 短标题 + 动作短句 + 输出/检查点短句
- 步骤标题字号不低于 30px，步骤正文不低于 24px；只有编号、标签、eyebrow 可以更小
- 不要把流程页做成表格页、dashboard 或多区域说明页
- 总可见文字控制在 190-300 个中文字符之间，步骤卡片不要拉伸成大空白卡
- 不要使用负 margin、负 top/left/right/bottom 或 transform translate 来居中箭头/装饰

风格：横向流程，步骤标签紧凑，每一步有输出或检查点，产品界面感但不要花哨。`,
  },
  {
    id: 'table-eval',
    kind: 'table',
    label: '表格页',
    version: 4,
    description: '测试表格页：必须生成真实 table，行列紧凑且可读。',
    requiredSignal: '真实 HTML table + 3-6 行',
    densityProfile: DENSITY_PROFILES.dense,
    requiredAnchors: ['页面类型', '必须结构', '主要失败', 'QA 信号', '介绍页', '代码页'],
    forbiddenAnchors: ['AI Tutor', 'Evaluation Lab', '链式法则', '盈亏平衡'],
    prompt: `生成一张 16:9 HTML/CSS PPT 风格的「表格页」。

主题：页面类型稳定性矩阵
受众：生成质量 QA 团队
内容：
- 标题：哪些页面类型已经稳定？
- 页面只能包含：标题区、一个真实 HTML table、一句短阅读规则
- 必须包含一个可编辑的真实 HTML table，不要用 div 假表格
- 表头列：页面类型、必须结构、主要失败、QA 信号
- 表格行：
  - 介绍页 | 标题 + 3 个入口 | 变成营销 hero | 没有巨大首屏
  - 总结页 | 3-4 条结论 | 变成长段落 | 文本块长度受控
  - 流程页 | 4-5 个步骤 | 只剩表格 | 方向和产物清晰
  - 数学页 | MathML 公式 | 公式变纯文本 | math 元素数量达标
  - 代码页 | 代码 + trace | 只有代码堆叠 | 状态步骤存在
- 表格下方加一句短阅读规则。
- 表格只能包含表头 + 5 行正文，不能额外加指标卡、图例、说明面板或第二张表
- 单元格文字要短，行高紧凑，表格整体必须完整落在 1600×900 内

风格：干净的 QA 矩阵，高可读性，行高紧凑，正文最多 5 行。`,
  },
  {
    id: 'math-chain-rule',
    kind: 'math',
    label: '数学页',
    version: 4,
    description: '测试数学页：直接生成 HTML + MathML，公式不能靠纯文本糊过去。',
    requiredSignal: '3-7 个 MathML + 无 mspace + 一屏可读',
    densityProfile: DENSITY_PROFILES.dense,
    requiredAnchors: ['链式法则', '复合函数', '内层导数', 'sin'],
    forbiddenAnchors: ['AI Tutor', 'Evaluation Lab', '题库', '盈亏平衡'],
    prompt: `生成一张 16:9 HTML/CSS PPT 风格的「数学页」。

主题：链式法则：从复合函数到导数
受众：大一微积分学生
内容：
- 标题：一眼看懂链式法则
- 页面只能包含：标题区、核心公式区、三行推导、一个例题、一个提醒
- 起点公式：y = f(g(x))
- 用原生 MathML 展示核心公式：dy/dx = f'(g(x)) · g'(x)
- 恰好包含三行紧凑推导：
  1. 先识别外层函数 f
  2. 再识别内层函数 g
  3. 最后乘以内层导数 g'(x)
- 加一个例题：y = sin(x^2)，导数 y' = 2x cos(x^2)
- 加一个提醒：不要漏掉内层导数
- 最多 7 个 MathML 公式块，不要使用 <mspace>
- 所有主要公式必须是真实 MathML，不要用纯文本或 TeX 字符串假装公式
- 公式卡片最多 3 个，三行推导必须紧凑，不能让公式区撑出画布

风格：清爽课堂页，白底，蓝色强调，公式卡片，用原生 MathML，不要图片。`,
  },
  {
    id: 'code-trace',
    kind: 'code',
    label: '代码页',
    version: 4,
    description: '测试代码页：代码块和状态追踪要同时存在，不能只有一坨代码。',
    requiredSignal: 'pre/code + 3-5 个状态追踪步骤',
    densityProfile: DENSITY_PROFILES.dense,
    requiredAnchors: ['binary_search', 'target', 'lo', 'hi', 'mid', 'return 3'],
    forbiddenAnchors: ['AI Tutor', 'Evaluation Lab', '链式法则', '盈亏平衡'],
    prompt: `生成一张 16:9 HTML/CSS PPT 风格的「代码追踪页」。

主题：追踪二分查找的状态变化
受众：CS1 入门学生
内容：
- 标题：二分查找追踪：target = 7
- 页面只能包含：标题区、左侧代码块、右侧 3 步 trace、最终返回结果
- 包含下面这段可编辑 Python 代码块：
def binary_search(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        if nums[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1
- 输入：nums = [1, 3, 5, 7, 9]，target = 7
- 用 trace 表格或状态卡片展示 3 步：lo、hi、mid、nums[mid]、decision
- 高亮最终返回下标 3
- 代码必须完整但不要重复解释；trace 只展示 3 步，不要扩写成教程或算法讲义
- 代码字体建议 20-24px，不能横向溢出；状态区文字不低于 22px

风格：左侧代码、右侧状态追踪；等宽字体清晰可读，不要横向溢出。`,
  },
  {
    id: 'worked-example',
    kind: 'example',
    label: '例题页',
    version: 4,
    description: '测试例题页：题目、已知、步骤和答案必须完整可做。',
    requiredSignal: '题目 + 已知 + 3-4 步 + 答案/检查',
    densityProfile: DENSITY_PROFILES.medium,
    requiredAnchors: ['盈亏平衡', '1200', '42', '18', '50'],
    forbiddenAnchors: ['AI Tutor', 'Evaluation Lab', '链式法则', '二分查找'],
    prompt: `生成一张 16:9 HTML/CSS PPT 风格的「例题页」。

主题：盈亏平衡分析例题
受众：商科入门学生
内容：
- 标题：例题：盈亏平衡销量
- 页面只能包含：题目区、已知条件区、3 个求解步骤、最终答案/检查
- 题目：一个手作工作坊固定成本为 1200 元，每件套装的可变成本为 18 元，售价为 42 元。至少卖出多少件才能盈亏平衡？
- 已知条件：固定成本 = 1200，售价 = 42，可变成本 = 18
- 公式：盈亏平衡销量 = 固定成本 / (售价 - 可变成本)
- 展示 3 个求解步骤：
  1. 单件贡献毛利 = 42 - 18 = 24
  2. 盈亏平衡销量 = 1200 / 24 = 50
  3. 检查：50 件刚好覆盖固定成本
- 最终答案：50 件套装
- 不要额外添加第二道题、背景故事、营销说明、多个公式区或无关图表
- 题目必须完整可做；已知条件、步骤、答案要彼此对应，不能只给方法总结
- 总可见文字控制在 170-300 个中文字符之间，所有关键数字必须可见

风格：课堂例题页，有清晰的已知条件区、分步求解区和高亮最终答案。`,
  },
];

const DEFAULT_PRESET = PAGE_PRESETS[0];

function emptyStats(): PreviewStats {
  return {
    scrollWidth: 0,
    scrollHeight: 0,
    slideCount: 0,
    hasSlideContent: false,
    outOfBoundsCount: 0,
    outOfBoundsSamples: [],
    headingCount: 0,
    tableCount: 0,
    tableRowCount: 0,
    mathCount: 0,
    mspaceCount: 0,
    preCount: 0,
    codeCount: 0,
    listItemCount: 0,
    cardishCount: 0,
    stepishCount: 0,
    textNodeCount: 0,
    visibleCharCount: 0,
    maxTextLength: 0,
    imageCount: 0,
    largeImageCount: 0,
    contentCoverageRatio: 0,
    sparseLargeContainerCount: 0,
    sparseLargeContainerSamples: [],
    smallTextRatioUnder20: 0,
    smallTextRatioUnder22: 0,
    smallTextRatioUnder24: 0,
    visibleText: '',
    scriptLikeCount: 0,
    preOverflowCount: 0,
  };
}

function readStoredState(): StoredState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredState;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function isLegacyEnglishPrompt(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /Create one 16:9 HTML\/CSS PowerPoint-style/i.test(value) &&
    /\bTopic:\b|\bAudience:\b|\bContent:\b/i.test(value)
  );
}

function isDeprecatedDefaultPrompt(value: unknown): value is string {
  return typeof value === 'string' && /AI 导师评估实验室/.test(value);
}

function isDeprecatedIntroPrompt(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /主题：用瞬时速度引出导数/.test(value) &&
    (!/CSS 小图标/.test(value) ||
      !/主要可读中文文字字号不要低于 24px/.test(value) ||
      /加一个「今天会解决」小横条/.test(value) ||
      /简单 CSS 小图示/.test(value) ||
      /不要图片素材/.test(value))
  );
}

function isDeprecatedSummaryPrompt(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /主题：rubric 约束生成一周后/.test(value) &&
    (!/页面只能包含/.test(value) ||
      !/不要 dashboard 化/.test(value) ||
      !/总可见文字控制在 160-260/.test(value) ||
      !/所有可读文字字号不要低于 22px/.test(value) ||
      !/不要拉伸成大空白卡片/.test(value))
  );
}

function isDeprecatedProcessPrompt(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /主题：从上传 PDF 到可用题库/.test(value) &&
    (!/页面只能包含：标题区、5 个流程步骤、一个风险提示条/.test(value) ||
      !/不要把流程页做成表格页/.test(value) ||
      !/主流程区必须紧跟标题区/.test(value) ||
      !/slide-content 内宽约 1472px/.test(value) ||
      !/步骤标题字号不低于 30px/.test(value) ||
      !/不要使用负 margin/.test(value) ||
      !/总可见文字控制在 190-300/.test(value))
  );
}

function isDeprecatedTablePrompt(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /主题：页面类型稳定性矩阵/.test(value) &&
    (!/页面只能包含：标题区、一个真实 HTML table、一句短阅读规则/.test(value) ||
      !/表格只能包含表头 \+ 5 行正文/.test(value) ||
      !/不要用 div 假表格/.test(value))
  );
}

function isDeprecatedMathPrompt(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /主题：链式法则：从复合函数到导数/.test(value) &&
    (!/页面只能包含：标题区、核心公式区、三行推导、一个例题、一个提醒/.test(value) ||
      !/所有主要公式必须是真实 MathML/.test(value) ||
      !/公式卡片最多 3 个/.test(value))
  );
}

function isDeprecatedCodePrompt(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /主题：追踪二分查找的状态变化/.test(value) &&
    (!/页面只能包含：标题区、左侧代码块、右侧 3 步 trace、最终返回结果/.test(value) ||
      !/trace 只展示 3 步/.test(value) ||
      !/代码字体建议 20-24px/.test(value))
  );
}

function isDeprecatedExamplePrompt(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /主题：盈亏平衡分析例题/.test(value) &&
    (!/页面只能包含：题目区、已知条件区、3 个求解步骤、最终答案\/检查/.test(value) ||
      !/不要额外添加第二道题/.test(value) ||
      !/总可见文字控制在 170-300/.test(value))
  );
}

function shouldReplaceCachedPrompt(value: unknown): value is string {
  return (
    isLegacyEnglishPrompt(value) ||
    isDeprecatedDefaultPrompt(value) ||
    isDeprecatedIntroPrompt(value) ||
    isDeprecatedSummaryPrompt(value) ||
    isDeprecatedProcessPrompt(value) ||
    isDeprecatedTablePrompt(value) ||
    isDeprecatedMathPrompt(value) ||
    isDeprecatedCodePrompt(value) ||
    isDeprecatedExamplePrompt(value)
  );
}

function sanitizePromptByPreset(
  savedPromptByPreset: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    PAGE_PRESETS.map((preset) => {
      const savedPrompt = savedPromptByPreset[preset.id];
      return [preset.id, shouldReplaceCachedPrompt(savedPrompt) ? preset.prompt : savedPrompt];
    }).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

function sanitizeRunsByPreset(
  savedRunsByPreset: StoredState['runsByPreset'],
): Record<string, StoredRun> {
  return Object.fromEntries(
    Object.entries(savedRunsByPreset || {}).filter((entry): entry is [string, StoredRun] => {
      const run = entry[1];
      return Boolean(run && !shouldReplaceCachedPrompt(run.prompt));
    }),
  );
}

function sanitizeErrorsByPreset(
  savedErrorsByPreset: StoredState['errorsByPreset'],
): Record<string, StoredError> {
  return Object.fromEntries(
    Object.entries(savedErrorsByPreset || {}).filter((entry): entry is [string, StoredError] => {
      const error = entry[1];
      return Boolean(error && !shouldReplaceCachedPrompt(error.prompt));
    }),
  );
}

function hasDeprecatedRunValues(values: Record<string, StoredRun>): boolean {
  return Object.values(values).some((run) => shouldReplaceCachedPrompt(run.prompt));
}

function hasDeprecatedErrorValues(values: Record<string, StoredError>): boolean {
  return Object.values(values).some((error) => shouldReplaceCachedPrompt(error.prompt));
}

function normalizeAnchorText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

function getMissingAnchors(text: string, anchors: string[]): string[] {
  const normalizedText = normalizeAnchorText(text);
  return anchors.filter((anchor) => !normalizedText.includes(normalizeAnchorText(anchor)));
}

function getFoundAnchors(text: string, anchors: string[] | undefined): string[] {
  if (!anchors || anchors.length === 0) return [];
  const normalizedText = normalizeAnchorText(text);
  return anchors.filter((anchor) => normalizedText.includes(normalizeAnchorText(anchor)));
}

function hasMeaningfulBoxClass(element: Element): boolean {
  const classNames =
    typeof element.className === 'string' ? element.className : element.getAttribute('class') || '';
  const ignoredParts =
    /\b(title|label|value|text|note|body|head|sub|icon|list|grid|wrap|content|row|col|accent|main|compare|desc|index|tag)\b/;
  const boxParts =
    /\b(card|tile|panel|metric|takeaway|summary|callout|stat|module|feature|entry|block|box)\b/;

  return classNames
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .some((token) => boxParts.test(token.replace(/[-_]/g, ' ')) && !ignoredParts.test(token));
}

function hasStepContainerClass(element: Element): boolean {
  const classNames =
    typeof element.className === 'string' ? element.className : element.getAttribute('class') || '';
  const tokens = classNames.toLowerCase().split(/\s+/).filter(Boolean);
  const stepContainerPattern =
    /^(?:step|phase|stage|trace|state|flow-step|flow-node|flow-item|process-step|process-node|process-item)$/;
  const compoundStepContainerPattern =
    /^(?:step|phase|stage|trace|state|flow|process)[-_](?:card|item|node|block|row)$/;

  return tokens.some(
    (token) =>
      stepContainerPattern.test(token) ||
      compoundStepContainerPattern.test(token) ||
      /\b(?:step|phase|stage|trace|state)[-_](?:card|item|node|block|row)\b/.test(token),
  );
}

function hashText(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function getPresetSignature(preset: HtmlSinglePagePreset): string {
  return hashText(
    JSON.stringify({
      id: preset.id,
      version: preset.version,
      prompt: preset.prompt,
      model: HTML_SINGLE_PAGE_MODEL,
      densityProfile: preset.densityProfile,
      requiredAnchors: preset.requiredAnchors,
      forbiddenAnchors: preset.forbiddenAnchors || [],
      illustrationMode: preset.kind === 'intro' ? 'ai-illustration-slot-v1' : 'none',
      imageGenerationMode: preset.kind === 'intro' ? 'deferred-placeholder-v1' : 'none',
    }),
  );
}

function isRunExpired(run: StoredRun | undefined, preset: HtmlSinglePagePreset): boolean {
  return Boolean(run && run.presetSignature !== getPresetSignature(preset));
}

function writeStoredState(next: StoredState) {
  if (typeof window === 'undefined') return;
  const runsByPreset = next.runsByPreset || {};
  const errorsByPreset = next.errorsByPreset || {};
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      selectedPresetId: next.selectedPresetId,
      promptByPreset: next.promptByPreset || {},
      runsByPreset,
      errorsByPreset,
      history: Object.values(runsByPreset)
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(0, 20),
      errors: Object.values(errorsByPreset)
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(0, 20),
    }),
  );
}

function analyzeHtml(html: string) {
  return {
    htmlLength: html.length,
    textNodeCount: html
      .replace(/<style\b[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '\n')
      .split('\n')
      .map((part) => part.trim())
      .filter(Boolean).length,
    elementCount: html.match(/<[a-z][\w:-]*(?:\s|>)/gi)?.length || 0,
    mathElementCount: html.match(/<math(?:\s|>)/gi)?.length || 0,
  };
}

function getHtmlSinglePageHeaders(): HeadersInit {
  const headers = new Headers(
    getApiHeaders({
      imageGenerationEnabled: false,
      modelIdOverride: HTML_SINGLE_PAGE_MODEL,
    }),
  );
  headers.set('x-generation-test-no-charge', 'true');
  return headers;
}

function toSafeInt(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.max(0, Math.round(value));
}

function getUsageTotal(usage: TokenUsage | null | undefined): number {
  const inputTokens = toSafeInt(usage?.inputTokens);
  const outputTokens = toSafeInt(usage?.outputTokens);
  return toSafeInt(usage?.totalTokens ?? inputTokens + outputTokens);
}

function formatUsageLabel(usage: TokenUsage | null | undefined): string | null {
  const inputTokens = toSafeInt(usage?.inputTokens);
  const outputTokens = toSafeInt(usage?.outputTokens);
  const totalTokens = getUsageTotal(usage);
  if (inputTokens <= 0 && outputTokens <= 0 && totalTokens <= 0) return null;
  return `${totalTokens.toLocaleString()} tokens · 输入 ${inputTokens.toLocaleString()} / 输出 ${outputTokens.toLocaleString()}`;
}

function formatCostLabel(run: StoredRun): string {
  if (run.costEstimate) {
    const sourceLabel =
      run.costEstimate.source === 'token_fallback' ? '按 token 兜底估算' : 'OpenAI 定价估算';
    return `${formatComputeCreditsLabel(run.costEstimate.computeCredits)} · ${formatUsdLabel(run.costEstimate.retailUsd)} · ${sourceLabel}`;
  }
  const usageLabel = formatUsageLabel(run.usage);
  return usageLabel ? `${usageLabel} · 费用待估算` : '费用未知';
}

function formatImageCostLabel(costEstimate: ImageGenerationCostEstimate | null | undefined) {
  if (!costEstimate) return '图片费用待估算';
  return `${formatComputeCreditsLabel(costEstimate.computeCredits)} · ${formatUsdLabel(costEstimate.retailUsd)} · OpenAI 图片定价估算`;
}

function getEstimatedImageCostLabel(providerId: ImageProviderId, modelId: string): string {
  if (providerId === 'openai-image') {
    if (modelId.includes('mini')) return '预计约 3-10 算力积分 · $0.02-$0.08';
    if (modelId.includes('gpt-image-2')) return '预计约 10-35 算力积分 · $0.09-$0.35';
    return '预计约 10-35 算力积分 · $0.09-$0.33';
  }
  return '预计按当前图片服务计费；本测试请求不扣本地积分';
}

function formatTime(value: number): string {
  return new Date(value).toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function getRangeStatus(value: number, min: number, max: number): QualityStatus {
  if (value >= min && value <= max) return 'pass';
  const looseMin = min * 0.75;
  const looseMax = max * 1.25;
  return value >= looseMin && value <= looseMax ? 'warn' : 'fail';
}

function describeRange(value: number, min: number, max: number, unit = ''): string {
  return `当前 ${Math.round(value)}${unit}，目标 ${Math.round(min)}-${Math.round(max)}${unit}`;
}

function getSmallTextRatio(
  stats: PreviewStats,
  thresholdPx: DensityProfile['smallTextThresholdPx'],
) {
  if (thresholdPx === 20) return stats.smallTextRatioUnder20;
  if (thresholdPx === 22) return stats.smallTextRatioUnder22;
  return stats.smallTextRatioUnder24;
}

function shouldUseGeneratedIllustration(preset: HtmlSinglePagePreset): boolean {
  return preset.kind === 'intro';
}

function buildSlideIllustrationPrompt(preset: HtmlSinglePagePreset, slidePrompt: string): string {
  if (preset.kind === 'intro') {
    return [
      'Create one standalone inset illustration asset.',
      'Subject: an abstract dashboard gauge with a needle, no numerals, blending into a smooth mathematical curve with a single tangent line.',
      'Meaning: motion becoming an instantaneous rate of change.',
      'Style: premium clean object illustration, subtle dimensional depth, white and pale blue background, blue and emerald accents, crisp but calm.',
      'Composition: one coherent object/scene only, centered, with generous clean negative space.',
      'Hard constraints: no readable text, no letters, no words, no numbers, no formulas, no labels, no axis labels, no watermark.',
      'Hard constraints: no presentation page, no slide, no poster, no infographic, no UI screenshot, no cards, no panels, no title area, no caption strip.',
    ].join('\n');
  }

  return [
    `Create one standalone inset educational illustration asset for this page type: ${preset.label}.`,
    'The image is not a presentation page, not a background, and not a screenshot.',
    'Style: clean premium educational illustration, white and light blue background, blue and emerald accents.',
    'Hard constraints: no readable text, no letters, no numbers, no labels, no UI screenshot, no full page layout, no title area, no captions.',
    `Concept only, do not render any text from this context: ${slidePrompt.slice(0, 300)}`,
  ].join('\n');
}

function resultToImageUrl(result: ImageGenerationResult): string {
  if (result.url) return result.url;
  if (!result.base64) return '';
  return result.base64.startsWith('data:')
    ? result.base64
    : `data:image/png;base64,${result.base64}`;
}

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildImagePlaceholderDataUrl(asset: HtmlImageAsset, isGenerating: boolean): string {
  const title = isGenerating ? '正在生成 AI 插图...' : '点击生成 AI 插图';
  const description =
    asset.providerId === 'openai-image' ? '无文字仪表盘 + 曲线 + 切线插图' : '教学主题插图素材';
  const estimate =
    asset.estimatedCostLabel || getEstimatedImageCostLabel(asset.providerId, asset.modelId);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720" viewBox="0 0 960 720">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f8fcff"/>
      <stop offset="1" stop-color="#eefaf6"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#2f7ee6"/>
      <stop offset="1" stop-color="#22b88a"/>
    </linearGradient>
  </defs>
  <rect width="960" height="720" rx="44" fill="url(#bg)"/>
  <rect x="58" y="58" width="844" height="604" rx="36" fill="#ffffff" stroke="#d9e9f6" stroke-width="3"/>
  <circle cx="480" cy="282" r="92" fill="#edf7ff" stroke="#d7e9f7" stroke-width="3"/>
  <path d="M405 300a84 84 0 0 1 150 0" fill="none" stroke="url(#accent)" stroke-width="22" stroke-linecap="round"/>
  <path d="M480 300l72-44" stroke="#163b5a" stroke-width="10" stroke-linecap="round"/>
  <circle cx="480" cy="300" r="18" fill="#ffffff" stroke="#163b5a" stroke-width="7"/>
  <path d="M280 440c92-96 172-98 252 0s152 88 214-10" fill="none" stroke="#2f7ee6" stroke-width="10" stroke-linecap="round"/>
  <path d="M610 394l116-58" stroke="#22b88a" stroke-width="8" stroke-linecap="round"/>
  <text x="480" y="510" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="#153047">${escapeXmlText(title)}</text>
  <text x="480" y="568" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" fill="#48657d">${escapeXmlText(description)}</text>
  <text x="480" y="612" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#6b7f92">${escapeXmlText(estimate)}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function base64ImageToBlob(base64: string): Blob {
  const match = base64.match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
  const mimeType = match?.[1] || 'image/png';
  const raw = match?.[2] || base64;
  const binary = window.atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

async function persistImageResultToAsset({
  result,
  prompt,
  preset,
  providerId,
  modelId,
  costEstimate,
  skippedCreditCharge,
}: {
  result: ImageGenerationResult;
  prompt: string;
  preset: HtmlSinglePagePreset;
  providerId: ImageProviderId;
  modelId: string;
  costEstimate?: ImageGenerationCostEstimate | null;
  skippedCreditCharge?: boolean;
}): Promise<HtmlImageAsset> {
  const providerName = IMAGE_PROVIDERS[providerId]?.name || providerId;
  if (result.url) {
    return {
      sourceType: 'url',
      url: result.url,
      providerId,
      providerName,
      modelId,
      prompt,
      width: result.width,
      height: result.height,
      costEstimate: costEstimate ?? null,
      skippedCreditCharge,
    };
  }

  if (!result.base64) {
    throw new Error('图片生成成功，但响应里没有可持久化的 URL 或 base64 数据。');
  }

  const blob = base64ImageToBlob(result.base64);
  const storageId = `generation-html-single-page-test:${preset.id}:${Date.now()}`;
  await db.mediaFiles.put({
    id: storageId,
    stageId: 'generation-html-single-page-test',
    type: 'image',
    blob,
    mimeType: blob.type || 'image/png',
    size: blob.size,
    prompt,
    params: JSON.stringify({
      providerId,
      modelId,
      aspectRatio: '4:3',
      source: 'html-single-page-test',
    }),
    createdAt: Date.now(),
  });

  return {
    sourceType: 'indexeddb',
    storageId,
    mimeType: blob.type || 'image/png',
    size: blob.size,
    providerId,
    providerName,
    modelId,
    prompt,
    width: result.width,
    height: result.height,
    costEstimate: costEstimate ?? null,
    skippedCreditCharge,
  };
}

function buildPendingImageAsset({
  providerId,
  modelId,
  prompt,
}: {
  providerId: ImageProviderId;
  modelId: string;
  prompt: string;
}): HtmlImageAsset {
  const providerName = IMAGE_PROVIDERS[providerId]?.name || providerId;
  return {
    sourceType: 'pending',
    providerId,
    providerName,
    modelId,
    prompt,
    estimatedCostLabel: getEstimatedImageCostLabel(providerId, modelId),
    width: 960,
    height: 720,
    costEstimate: null,
    skippedCreditCharge: true,
  };
}

async function resolveImageAssetUrl(
  asset: HtmlImageAsset | null | undefined,
  isGenerating: boolean,
): Promise<string> {
  if (!asset) return '';
  if (asset.sourceType === 'pending') return buildImagePlaceholderDataUrl(asset, isGenerating);
  if (asset.sourceType === 'url') return asset.url || '';
  if (!asset.storageId) return '';
  const record = await db.mediaFiles.get(asset.storageId);
  if (!record?.blob) return '';
  return URL.createObjectURL(record.blob);
}

function markImageSlotHtml(html: string): string {
  if (!html.includes(IMAGE_ASSET_TOKEN)) return html;
  return html.replace(/<img\b([^>]*?)>/gi, (match, attrs: string) => {
    if (!attrs.includes(IMAGE_ASSET_TOKEN) || attrs.includes(HTML_IMAGE_SLOT_ATTR)) return match;
    return `<img ${HTML_IMAGE_SLOT_ATTR}="true" title="点击生成 AI 插图"${attrs}>`;
  });
}

function injectImageAssetIntoHtml(html: string, imageUrl: string): string {
  if (!imageUrl) return html;
  return html.split(IMAGE_ASSET_TOKEN).join(imageUrl);
}

function buildDensityContract(profile: DensityProfile): string {
  return [
    `密度档：${profile.label}（${profile.level}）`,
    `可见中文字数/等价字符：${profile.textChars.min}-${profile.textChars.max}`,
    `可见文本节点/块数：${profile.textBlocks.min}-${profile.textBlocks.max}`,
    `主要内容覆盖画布面积：${formatPercent(profile.contentCoverage.min)}-${formatPercent(profile.contentCoverage.max)}`,
    `正文可读字号：低于 ${profile.smallTextThresholdPx}px 的文字占比不超过 ${formatPercent(profile.maxSmallTextRatio)}`,
    '大卡片/大面板约束：面积超过画布 8% 的容器不能只有顶部少量文字；要么压缩高度，要么填入真实结构、图示、列表或步骤。',
    `密度说明：${profile.guidance}`,
  ].join('\n');
}

function statusIcon(status: QualityStatus) {
  if (status === 'pass') return <CheckCircle2 className="size-4 text-emerald-600" />;
  if (status === 'warn') return <AlertTriangle className="size-4 text-amber-600" />;
  return <XCircle className="size-4 text-red-600" />;
}

function summarizeChecks(checks: QualityCheck[]) {
  const failed = checks.filter((check) => check.status === 'fail').length;
  const warned = checks.filter((check) => check.status === 'warn').length;
  return { total: checks.length, failed, warned, passed: checks.length - failed - warned };
}

function buildQualityChecks(preset: HtmlSinglePagePreset, stats: PreviewStats): QualityCheck[] {
  const { kind } = preset;
  const density = preset.densityProfile;
  const smallTextRatio = getSmallTextRatio(stats, density.smallTextThresholdPx);
  const checks: QualityCheck[] = [
    {
      status: stats.slideCount === 1 && stats.hasSlideContent ? 'pass' : 'fail',
      label: 'HTML PPT 结构',
      detail: `需要 exactly one .slide + .slide-content；当前 slide=${stats.slideCount}，content=${stats.hasSlideContent ? '有' : '缺'}。`,
    },
    {
      status: stats.scrollWidth <= 1601 && stats.scrollHeight <= 901 ? 'pass' : 'fail',
      label: '16:9 一屏',
      detail: `iframe scroll=${stats.scrollWidth || '-'} x ${stats.scrollHeight || '-'}，目标是 1600 x 900 且无滚动。`,
    },
    {
      status: stats.outOfBoundsCount === 0 ? 'pass' : 'fail',
      label: '无越界元素',
      detail:
        stats.outOfBoundsCount === 0
          ? '所有可见元素都在 1600 x 900 内。'
          : `发现 ${stats.outOfBoundsCount} 个越界元素：${stats.outOfBoundsSamples.join(' / ')}`,
    },
    {
      status: stats.scriptLikeCount === 0 ? 'pass' : 'fail',
      label: '静态可编辑 HTML',
      detail:
        stats.scriptLikeCount === 0
          ? '没有 script/iframe/form/object/embed 等不适合 PPT 导入的节点。'
          : `发现 ${stats.scriptLikeCount} 个不应出现的动态/嵌入节点。`,
    },
    {
      status: stats.maxTextLength <= 220 ? 'pass' : stats.maxTextLength <= 320 ? 'warn' : 'fail',
      label: '文本块预算',
      detail: `最长文本块 ${stats.maxTextLength} 字符；HTML 单页不能变成网页长文。`,
    },
    {
      status: getRangeStatus(stats.visibleCharCount, density.textChars.min, density.textChars.max),
      label: '内容密度：字数',
      detail: `${describeRange(stats.visibleCharCount, density.textChars.min, density.textChars.max, ' 字符')}；${density.guidance}`,
    },
    {
      status: getRangeStatus(stats.textNodeCount, density.textBlocks.min, density.textBlocks.max),
      label: '内容密度：块数',
      detail: `${describeRange(stats.textNodeCount, density.textBlocks.min, density.textBlocks.max, ' 块')}；文本节点过少会空，过多会碎。`,
    },
    {
      status: getRangeStatus(
        stats.contentCoverageRatio,
        density.contentCoverage.min,
        density.contentCoverage.max,
      ),
      label: '内容密度：版面覆盖',
      detail: `主要内容覆盖 ${formatPercent(stats.contentCoverageRatio)}，目标 ${formatPercent(density.contentCoverage.min)}-${formatPercent(density.contentCoverage.max)}；太低像空白页，太高容易挤压。`,
    },
    {
      status:
        smallTextRatio <= density.maxSmallTextRatio
          ? 'pass'
          : smallTextRatio <= density.maxSmallTextRatio + 0.15
            ? 'warn'
            : 'fail',
      label: '内容密度：可读字号',
      detail: `低于 ${density.smallTextThresholdPx}px 的文字占 ${formatPercent(smallTextRatio)}，上限 ${formatPercent(density.maxSmallTextRatio)}；不要靠缩小字号硬塞内容。`,
    },
    {
      status: stats.sparseLargeContainerCount === 0 ? 'pass' : 'fail',
      label: '内容密度：空大容器',
      detail:
        stats.sparseLargeContainerCount === 0
          ? '没有发现用巨大空卡片制造版面覆盖的情况。'
          : `发现 ${stats.sparseLargeContainerCount} 个大容器信息不足：${stats.sparseLargeContainerSamples.join(' / ')}。`,
    },
  ];

  if (shouldUseGeneratedIllustration(preset)) {
    checks.push({
      status: stats.imageCount === 1 && stats.largeImageCount >= 1 ? 'pass' : 'fail',
      label: 'AI 插图区',
      detail:
        stats.imageCount === 1 && stats.largeImageCount >= 1
          ? '已使用 1 张 AI 插图，并放在明确的页面插图区内。'
          : `需要 exactly one 页面内插图；当前 img=${stats.imageCount}，大插图=${stats.largeImageCount}。`,
    });
  }

  const missingAnchors = getMissingAnchors(stats.visibleText, preset.requiredAnchors);
  checks.push({
    status: missingAnchors.length === 0 ? 'pass' : 'fail',
    label: 'Prompt 贴合度',
    detail:
      missingAnchors.length === 0
        ? `已覆盖关键锚点：${preset.requiredAnchors.join(' / ')}。`
        : `缺少关键锚点：${missingAnchors.join(' / ')}。`,
  });

  const foundForbiddenAnchors = getFoundAnchors(stats.visibleText, preset.forbiddenAnchors);
  if (preset.forbiddenAnchors && preset.forbiddenAnchors.length > 0) {
    checks.push({
      status: foundForbiddenAnchors.length === 0 ? 'pass' : 'fail',
      label: '无旧主题污染',
      detail:
        foundForbiddenAnchors.length === 0
          ? '没有发现旧主题或其他页面类型的关键词。'
          : `发现不应出现的关键词：${foundForbiddenAnchors.join(' / ')}。`,
    });
  }

  if (kind !== 'math') {
    checks.push({
      status: stats.mathCount === 0 ? 'pass' : 'fail',
      label: '页面类型不跑偏',
      detail:
        stats.mathCount === 0
          ? '非数学页没有混入 MathML 公式。'
          : `当前是 ${kind} 页，却出现 ${stats.mathCount} 个 MathML；这通常意味着模型混入了无关公式或题目。`,
    });
  }

  if (kind === 'intro') {
    const hasIntroTitle = stats.headingCount >= 1 || stats.visibleText.includes('为什么要学习导数');
    checks.push({
      status: hasIntroTitle && stats.cardishCount + stats.listItemCount >= 3 ? 'pass' : 'warn',
      label: '介绍页结构',
      detail: `需要标题 + 3-4 个入口块；当前 heading=${stats.headingCount}，主标题=${hasIntroTitle ? '有' : '缺'}，block/list=${stats.cardishCount + stats.listItemCount}。`,
    });
  }

  if (kind === 'summary') {
    const summarySignals = stats.cardishCount + stats.listItemCount;
    checks.push({
      status: summarySignals >= 3 && summarySignals <= 8 ? 'pass' : 'fail',
      label: '总结页结构',
      detail: `需要 3-4 条 takeaway，结构块不能膨胀；当前 card/list 信号=${summarySignals}。`,
    });
  }

  if (kind === 'process') {
    const stepSignals = Math.max(stats.stepishCount, stats.listItemCount);
    checks.push({
      status: stepSignals >= 4 && stepSignals <= 6 ? 'pass' : 'fail',
      label: '流程页结构',
      detail: `需要 4-5 个可见步骤容器，最多允许 1 个辅助节点；当前 step 容器=${stats.stepishCount}，list item=${stats.listItemCount}。`,
    });
  }

  if (kind === 'table') {
    checks.push({
      status: stats.tableCount >= 1 ? 'pass' : 'fail',
      label: '表格页结构',
      detail: `需要真实 HTML table；当前 table=${stats.tableCount}。`,
    });
    checks.push({
      status: stats.tableRowCount >= 4 && stats.tableRowCount <= 7 ? 'pass' : 'warn',
      label: '表格行预算',
      detail: `当前 table rows=${stats.tableRowCount}；目标含表头约 4-7 行。`,
    });
  }

  if (kind === 'math') {
    checks.push({
      status: stats.mathCount >= 3 ? 'pass' : 'fail',
      label: 'MathML 公式',
      detail: `数学页需要真实 <math>，当前 math=${stats.mathCount}。`,
    });
    checks.push({
      status: stats.mspaceCount === 0 ? 'pass' : 'fail',
      label: '无 mspace 撑版',
      detail:
        stats.mspaceCount === 0
          ? '没有发现 <mspace>。'
          : `发现 ${stats.mspaceCount} 个 <mspace>，容易导致公式空白和溢出。`,
    });
  }

  if (kind === 'code') {
    checks.push({
      status: stats.preCount > 0 || stats.codeCount > 0 ? 'pass' : 'fail',
      label: '代码块',
      detail: `需要 editable pre/code；当前 pre=${stats.preCount}，code=${stats.codeCount}。`,
    });
    checks.push({
      status: stats.stepishCount >= 3 || stats.tableRowCount >= 4 ? 'pass' : 'fail',
      label: '状态追踪',
      detail: `代码页需要 3-5 个 trace/state 步骤；当前 step=${stats.stepishCount}，table rows=${stats.tableRowCount}。`,
    });
    checks.push({
      status: stats.preOverflowCount === 0 ? 'pass' : 'warn',
      label: '代码不横向撑破',
      detail:
        stats.preOverflowCount === 0
          ? '代码块没有明显内部横向溢出。'
          : `发现 ${stats.preOverflowCount} 个 pre/code 内部横向溢出。`,
    });
  }

  if (kind === 'example') {
    checks.push({
      status: stats.stepishCount >= 3 || stats.listItemCount >= 3 ? 'pass' : 'fail',
      label: '例题步骤',
      detail: `例题页需要 3-4 步求解链；当前 step=${stats.stepishCount}，list item=${stats.listItemCount}。`,
    });
    checks.push({
      status: stats.cardishCount >= 2 || stats.tableCount >= 1 ? 'pass' : 'warn',
      label: '题面与答案分区',
      detail: `需要题目/已知/步骤/答案分区；当前 card=${stats.cardishCount}，table=${stats.tableCount}。`,
    });
  }

  return checks;
}

function buildRegenerationFeedback(stats: PreviewStats, checks: QualityCheck[]): string | null {
  if (stats.slideCount <= 0 && stats.scrollWidth <= 0 && stats.scrollHeight <= 0) return null;

  const failedOrWarned = checks.filter((check) => check.status !== 'pass');
  if (failedOrWarned.length === 0) return null;

  const lines = [...failedOrWarned.slice(0, 8).map((check) => `- ${check.label}：${check.detail}`)];

  if (stats.outOfBoundsCount > 0) {
    lines.push(
      '- 重新生成时必须移除所有出界 DOM 元素。不要用负 top/left/right/bottom、负 margin、超大背景块或出界装饰圆形。',
      '- 背景装饰请改成 .slide 的 CSS background/radial-gradient，或保证装饰元素完整落在 1600×900 画布内部。',
    );
  }

  if (stats.scrollWidth > 1601 || stats.scrollHeight > 901) {
    lines.push('- 页面不能依赖滚动或裁切；如果内容太多，减少文字、卡片高度、表格行数或公式数量。');
  }

  if (failedOrWarned.some((check) => check.label.startsWith('内容密度'))) {
    lines.push(
      '- 重新生成时请按本页密度目标调整内容量：太空就增加具体卡片/步骤/数值，太挤就删掉次要说明、减少卡片或缩短句子。',
      '- 不要通过缩小字号解决密度问题；优先减少文字、合并区域、改成表格或更紧凑的结构。',
      '- 面积很大的卡片/面板必须有足够内容填充；如果只是标题加两行字，请缩短容器高度，或加入真实图示、列表、时间线、步骤或检查点。',
    );
  }

  return lines.join('\n');
}

function buildStoredQuality(
  summary: ReturnType<typeof summarizeChecks>,
  stats: PreviewStats,
): StoredQuality {
  return {
    ...summary,
    outOfBoundsCount: stats.outOfBoundsCount,
    mathCount: stats.mathCount,
    scrollWidth: stats.scrollWidth,
    scrollHeight: stats.scrollHeight,
    checkedAt: Date.now(),
  };
}

function hasQualityProblem(quality: StoredQuality | undefined): boolean {
  return Boolean(quality && (quality.failed > 0 || quality.warned > 0));
}

function hasPendingImageAsset(run: StoredRun | null | undefined): boolean {
  return run?.imageAsset?.sourceType === 'pending';
}

function getRetryCount(run: StoredRun): number {
  return Math.max(0, (run.generationAttempts || 1) - 1);
}

function isSameStoredQuality(left: StoredQuality | undefined, right: StoredQuality): boolean {
  return Boolean(
    left &&
    left.failed === right.failed &&
    left.warned === right.warned &&
    left.passed === right.passed &&
    left.total === right.total &&
    left.outOfBoundsCount === right.outOfBoundsCount &&
    left.mathCount === right.mathCount &&
    left.scrollWidth === right.scrollWidth &&
    left.scrollHeight === right.scrollHeight,
  );
}

export default function GenerationHtmlSinglePageTestPage() {
  const imageProviderId = useSettingsStore((state) => state.imageProviderId);
  const imageModelId = useSettingsStore((state) => state.imageModelId);
  const imageProvidersConfig = useSettingsStore((state) => state.imageProvidersConfig);

  const [selectedPresetId, setSelectedPresetId] = useState(DEFAULT_PRESET.id);
  const [prompt, setPrompt] = useState(DEFAULT_PRESET.prompt);
  const [promptByPreset, setPromptByPreset] = useState<Record<string, string>>({});
  const [runsByPreset, setRunsByPreset] = useState<Record<string, StoredRun>>({});
  const [errorsByPreset, setErrorsByPreset] = useState<Record<string, StoredError>>({});
  const [isHydrated, setIsHydrated] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingImageAsset, setIsGeneratingImageAsset] = useState(false);
  const [generationStage, setGenerationStage] = useState<'idle' | 'image' | 'html'>('idle');
  const [previewStats, setPreviewStats] = useState<PreviewStats>(emptyStats);
  const [previewScale, setPreviewScale] = useState(1);
  const [resolvedPreviewHtml, setResolvedPreviewHtml] = useState('');
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const qaTimerRef = useRef<number | null>(null);

  const selectedPreset = useMemo(
    () => PAGE_PRESETS.find((preset) => preset.id === selectedPresetId) || PAGE_PRESETS[0],
    [selectedPresetId],
  );
  const result = runsByPreset[selectedPresetId] || null;
  const error = errorsByPreset[selectedPresetId] || null;
  const selectedImageProvider = IMAGE_PROVIDERS[imageProviderId];
  const selectedImageModelId =
    imageModelId || selectedImageProvider?.models[0]?.id || 'doubao-seedream-5-0-260128';
  const selectedUsesIllustration = shouldUseGeneratedIllustration(selectedPreset);
  const selectedResultExpired = isRunExpired(result || undefined, selectedPreset);
  const selectedImagePending = hasPendingImageAsset(result);
  const qualityChecks = useMemo(
    () =>
      result && !selectedResultExpired ? buildQualityChecks(selectedPreset, previewStats) : [],
    [previewStats, result, selectedPreset, selectedResultExpired],
  );
  const checkSummary = useMemo(() => summarizeChecks(qualityChecks), [qualityChecks]);
  const selectedHasQualityProblem =
    Boolean(result) &&
    qualityChecks.length > 0 &&
    (checkSummary.failed > 0 || checkSummary.warned > 0);
  const regenerationFeedback = useMemo(
    () =>
      result
        ? [
            selectedResultExpired ? '- 当前结果使用的是旧版 preset/prompt，必须重新生成。' : null,
            buildRegenerationFeedback(previewStats, qualityChecks),
          ]
            .filter(Boolean)
            .join('\n') || null
        : null,
    [previewStats, qualityChecks, result, selectedResultExpired],
  );
  const history = useMemo(
    () => Object.values(runsByPreset).sort((left, right) => right.createdAt - left.createdAt),
    [runsByPreset],
  );

  useEffect(() => {
    const saved = readStoredState();
    const savedPresetId =
      saved.selectedPresetId && PAGE_PRESETS.some((preset) => preset.id === saved.selectedPresetId)
        ? saved.selectedPresetId
        : DEFAULT_PRESET.id;
    const savedPromptByPreset = sanitizePromptByPreset(saved.promptByPreset || {});
    const savedPreset =
      PAGE_PRESETS.find((preset) => preset.id === savedPresetId) || DEFAULT_PRESET;
    setSelectedPresetId(savedPresetId);
    setPromptByPreset(savedPromptByPreset);
    setPrompt(savedPromptByPreset[savedPresetId] || savedPreset.prompt);
    setRunsByPreset(sanitizeRunsByPreset(saved.runsByPreset));
    setErrorsByPreset(sanitizeErrorsByPreset(saved.errorsByPreset));
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    writeStoredState({
      selectedPresetId,
      promptByPreset,
      runsByPreset,
      errorsByPreset,
    });
  }, [errorsByPreset, isHydrated, promptByPreset, runsByPreset, selectedPresetId]);

  useEffect(() => {
    if (!isHydrated) return;
    if (shouldReplaceCachedPrompt(prompt)) {
      setPrompt(selectedPreset.prompt);
      setPromptByPreset((previous) => ({
        ...previous,
        [selectedPreset.id]: selectedPreset.prompt,
      }));
      return;
    }

    setPromptByPreset((previous) => {
      if (previous[selectedPresetId] === prompt) return previous;
      return { ...previous, [selectedPresetId]: prompt };
    });
  }, [isHydrated, prompt, selectedPreset.id, selectedPreset.prompt, selectedPresetId]);

  useEffect(() => {
    if (!isHydrated) return;
    if (hasDeprecatedRunValues(runsByPreset)) {
      setRunsByPreset((previous) => sanitizeRunsByPreset(previous));
    }
    if (hasDeprecatedErrorValues(errorsByPreset)) {
      setErrorsByPreset((previous) => sanitizeErrorsByPreset(previous));
    }
  }, [errorsByPreset, isHydrated, runsByPreset]);

  useEffect(() => {
    let isCancelled = false;
    let objectUrl = '';

    if (!result) {
      setResolvedPreviewHtml('');
      return () => {};
    }

    const resolve = async () => {
      try {
        const imageUrl = await resolveImageAssetUrl(result.imageAsset, isGeneratingImageAsset);
        if (isCancelled) {
          if (imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
          return;
        }
        objectUrl = imageUrl.startsWith('blob:') ? imageUrl : '';
        setResolvedPreviewHtml(injectImageAssetIntoHtml(result.html, imageUrl));
      } catch {
        if (!isCancelled) setResolvedPreviewHtml(result.html);
      }
    };

    void resolve();

    return () => {
      isCancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [isGeneratingImageAsset, result]);

  useEffect(() => {
    if (
      !isHydrated ||
      !result ||
      selectedResultExpired ||
      qualityChecks.length === 0 ||
      previewStats.slideCount <= 0
    ) {
      return;
    }

    const nextQuality = buildStoredQuality(checkSummary, previewStats);
    if (isSameStoredQuality(result.quality, nextQuality)) return;

    setRunsByPreset((previous) => {
      const current = previous[selectedPresetId];
      if (!current || current.id !== result.id) return previous;
      return {
        ...previous,
        [selectedPresetId]: {
          ...current,
          quality: nextQuality,
        },
      };
    });
  }, [
    checkSummary,
    isHydrated,
    previewStats,
    qualityChecks.length,
    result,
    selectedPresetId,
    selectedResultExpired,
  ]);

  useEffect(() => {
    const element = previewFrameRef.current;
    if (!element) return;

    const updateScale = () => {
      const rect = element.getBoundingClientRect();
      const nextScale = Math.min(rect.width / 1600, rect.height / 900);
      setPreviewScale(Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1);
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const applyPreset = useCallback(
    (presetId: string) => {
      const preset = PAGE_PRESETS.find((item) => item.id === presetId) || PAGE_PRESETS[0];
      setSelectedPresetId(preset.id);
      setPrompt(promptByPreset[preset.id] || preset.prompt);
      setPreviewStats(emptyStats());
    },
    [promptByPreset],
  );

  const inspectPreviewLayout = useCallback(() => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    const win = doc?.defaultView;
    if (!doc?.documentElement || !doc.body || !win) {
      setPreviewStats(emptyStats());
      return;
    }

    const root = doc.documentElement;
    const body = doc.body;
    const allElements = Array.from(body.querySelectorAll('*'));
    const textLengths: number[] = [];
    let visibleCharCount = 0;
    let fontCharCount = 0;
    let smallTextCharCountUnder20 = 0;
    let smallTextCharCountUnder22 = 0;
    let smallTextCharCountUnder24 = 0;
    const walker = doc.createTreeWalker(body, win.NodeFilter.SHOW_TEXT);
    let current = walker.nextNode();
    while (current) {
      const text = current.textContent?.replace(/\s+/g, ' ').trim() || '';
      if (text) {
        const charCount = text.replace(/\s/g, '').length;
        textLengths.push(text.length);
        visibleCharCount += charCount;

        const parentElement = current.parentElement;
        const fontSize = parentElement
          ? Number.parseFloat(win.getComputedStyle(parentElement).fontSize)
          : Number.NaN;
        if (Number.isFinite(fontSize)) {
          fontCharCount += charCount;
          if (fontSize < 20) smallTextCharCountUnder20 += charCount;
          if (fontSize < 22) smallTextCharCountUnder22 += charCount;
          if (fontSize < 24) smallTextCharCountUnder24 += charCount;
        }
      }
      current = walker.nextNode();
    }

    const outOfBoundsElements = allElements.filter((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      return rect.left < -1 || rect.top < -1 || rect.right > 1601 || rect.bottom > 901;
    });
    const outOfBoundsSamples = outOfBoundsElements.slice(0, 5).map((element) => {
      const rect = element.getBoundingClientRect();
      const className =
        typeof element.className === 'string'
          ? element.className
          : element.getAttribute('class') || '';
      const label = [element.tagName.toLowerCase(), className ? `.${className}` : '']
        .join('')
        .trim();
      return `${label} ${Math.round(rect.left)},${Math.round(rect.top)}-${Math.round(rect.right)},${Math.round(rect.bottom)}`;
    });
    const classText = (element: Element) =>
      `${element.getAttribute('class') || ''} ${element.getAttribute('aria-label') || ''}`.toLowerCase();
    const cardishCount = allElements.filter((element) => hasMeaningfulBoxClass(element)).length;
    const stepishCount = allElements.filter((element) => hasStepContainerClass(element)).length;
    const preOverflowCount = Array.from(body.querySelectorAll('pre, code')).filter((element) => {
      const htmlElement = element as HTMLElement;
      return htmlElement.scrollWidth > htmlElement.clientWidth + 2;
    }).length;
    const images = Array.from(body.querySelectorAll('img'));
    const largeImageCount = images.filter((element) => {
      const rect = element.getBoundingClientRect();
      const slot = element.closest('figure, .visual-slot, .image-frame');
      const slotRect = slot?.getBoundingClientRect();
      const imageAreaRatio = (rect.width * rect.height) / (1600 * 900);
      const slotAreaRatio = slotRect ? (slotRect.width * slotRect.height) / (1600 * 900) : 0;
      return (
        (rect.width >= 200 && rect.height >= 140 && imageAreaRatio >= 0.04) ||
        (slotAreaRatio >= 0.06 && rect.width > 0 && rect.height > 0)
      );
    }).length;
    const contentRects = allElements
      .filter((element) => {
        if (element.matches('.slide, .slide-content, style')) return false;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const hasMeaningfulText = Boolean(element.textContent?.replace(/\s+/g, '').trim());
        return (
          hasMeaningfulText ||
          element.matches('table,thead,tbody,tr,th,td,pre,code,math,svg,img,figure,article,section')
        );
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: Math.max(0, rect.left),
          top: Math.max(0, rect.top),
          right: Math.min(1600, rect.right),
          bottom: Math.min(900, rect.bottom),
        };
      })
      .filter((rect) => rect.right > rect.left && rect.bottom > rect.top);
    const contentCoverageRatio =
      contentRects.length > 0
        ? ((Math.max(...contentRects.map((rect) => rect.right)) -
            Math.min(...contentRects.map((rect) => rect.left))) *
            (Math.max(...contentRects.map((rect) => rect.bottom)) -
              Math.min(...contentRects.map((rect) => rect.top)))) /
          (1600 * 900)
        : 0;
    const getElementLabel = (element: Element) => {
      const className =
        typeof element.className === 'string'
          ? element.className
          : element.getAttribute('class') || '';
      return [element.tagName.toLowerCase(), className ? `.${className}` : ''].join('').trim();
    };
    const getTextBounds = (element: Element) => {
      const textWalker = doc.createTreeWalker(element, win.NodeFilter.SHOW_TEXT);
      let textNode = textWalker.nextNode();
      const rects: Array<{ left: number; top: number; right: number; bottom: number }> = [];
      while (textNode) {
        const text = textNode.textContent?.replace(/\s+/g, '').trim() || '';
        if (text) {
          const range = doc.createRange();
          range.selectNodeContents(textNode);
          Array.from(range.getClientRects()).forEach((rect) => {
            if (rect.width > 0 && rect.height > 0) {
              rects.push({
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
              });
            }
          });
          range.detach();
        }
        textNode = textWalker.nextNode();
      }
      if (rects.length === 0) return null;
      return {
        left: Math.min(...rects.map((rect) => rect.left)),
        top: Math.min(...rects.map((rect) => rect.top)),
        right: Math.max(...rects.map((rect) => rect.right)),
        bottom: Math.max(...rects.map((rect) => rect.bottom)),
      };
    };
    const isVisualContainer = (element: Element) => {
      if (element.matches('.slide, .slide-content, style, table, thead, tbody, tr, th, td')) {
        return false;
      }
      const tagName = element.tagName.toLowerCase();
      if (!['div', 'article', 'section', 'aside', 'li'].includes(tagName)) return false;
      const classes = classText(element);
      if (/\b(slide|slide-content|grid|layout|wrapper|content|main|row|columns?)\b/.test(classes)) {
        return false;
      }
      const style = win.getComputedStyle(element);
      const hasContainerClass = hasMeaningfulBoxClass(element);
      const hasVisibleBox =
        style.borderStyle !== 'none' ||
        Number.parseFloat(style.borderRadius) >= 8 ||
        style.boxShadow !== 'none' ||
        !['transparent', 'rgba(0, 0, 0, 0)'].includes(style.backgroundColor);
      return hasContainerClass || hasVisibleBox;
    };
    const largeVisualContainers = allElements.filter((element) => {
      if (!isVisualContainer(element)) return false;
      const rect = element.getBoundingClientRect();
      const areaRatio = (rect.width * rect.height) / (1600 * 900);
      return areaRatio >= 0.08 && Boolean(element.textContent?.replace(/\s+/g, '').trim());
    });
    const sparseLargeContainers = largeVisualContainers.filter((element) => {
      const rect = element.getBoundingClientRect();
      const hasLargeVisualChild = largeVisualContainers.some((other) => {
        if (other === element || !element.contains(other)) return false;
        const otherRect = other.getBoundingClientRect();
        return (otherRect.width * otherRect.height) / (1600 * 900) >= 0.06;
      });
      if (hasLargeVisualChild) return false;
      if (element.querySelector('img')) return false;

      const textChars = element.textContent?.replace(/\s+/g, '').length || 0;
      const textBounds = getTextBounds(element);
      const textHeightRatio = textBounds ? (textBounds.bottom - textBounds.top) / rect.height : 0;
      const classes = classText(element);
      if (/\b(question|bar|strip)\b/.test(classes) && textChars >= 15 && textHeightRatio >= 0.25) {
        return false;
      }
      if (textChars >= 12 && textHeightRatio >= 0.5) return false;
      return textChars < 30 || textHeightRatio < 0.35;
    });
    const sparseLargeContainerSamples = sparseLargeContainers.slice(0, 5).map((element) => {
      const rect = element.getBoundingClientRect();
      const textChars = element.textContent?.replace(/\s+/g, '').length || 0;
      const textBounds = getTextBounds(element);
      const textHeightRatio = textBounds ? (textBounds.bottom - textBounds.top) / rect.height : 0;
      return `${getElementLabel(element)} ${formatPercent((rect.width * rect.height) / (1600 * 900))}面积 / ${textChars}字 / ${formatPercent(textHeightRatio)}文字高度`;
    });

    setPreviewStats({
      scrollWidth: Math.ceil(Math.max(root.scrollWidth, body.scrollWidth)),
      scrollHeight: Math.ceil(Math.max(root.scrollHeight, body.scrollHeight)),
      slideCount: doc.querySelectorAll('.slide').length,
      hasSlideContent: Boolean(doc.querySelector('.slide-content')),
      outOfBoundsCount: outOfBoundsElements.length,
      outOfBoundsSamples,
      headingCount: doc.querySelectorAll('h1,h2,h3').length,
      tableCount: doc.querySelectorAll('table').length,
      tableRowCount: doc.querySelectorAll('table tr').length,
      mathCount: doc.querySelectorAll('math').length,
      mspaceCount: doc.querySelectorAll('mspace').length,
      preCount: doc.querySelectorAll('pre').length,
      codeCount: doc.querySelectorAll('code').length,
      listItemCount: doc.querySelectorAll('li').length,
      cardishCount,
      stepishCount,
      textNodeCount: textLengths.length,
      visibleCharCount,
      maxTextLength: Math.max(0, ...textLengths),
      imageCount: images.length,
      largeImageCount,
      contentCoverageRatio,
      sparseLargeContainerCount: sparseLargeContainers.length,
      sparseLargeContainerSamples,
      smallTextRatioUnder20: fontCharCount > 0 ? smallTextCharCountUnder20 / fontCharCount : 0,
      smallTextRatioUnder22: fontCharCount > 0 ? smallTextCharCountUnder22 / fontCharCount : 0,
      smallTextRatioUnder24: fontCharCount > 0 ? smallTextCharCountUnder24 / fontCharCount : 0,
      visibleText: body.innerText || '',
      scriptLikeCount: doc.querySelectorAll('script,iframe,form,object,embed').length,
      preOverflowCount,
    });
  }, []);

  const schedulePreviewInspection = useCallback(() => {
    if (qaTimerRef.current != null) window.clearTimeout(qaTimerRef.current);
    qaTimerRef.current = window.setTimeout(() => {
      qaTimerRef.current = null;
      inspectPreviewLayout();
    }, 100);
  }, [inspectPreviewLayout]);

  useEffect(() => {
    if (!result) return;
    const timers = [160, 500, 1000].map((delay) => window.setTimeout(inspectPreviewLayout, delay));
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      if (qaTimerRef.current != null) {
        window.clearTimeout(qaTimerRef.current);
        qaTimerRef.current = null;
      }
    };
  }, [inspectPreviewLayout, result]);

  const handleGenerate = useCallback(async () => {
    const trimmedPrompt = (promptTextareaRef.current?.value ?? prompt).trim();
    if (!trimmedPrompt || isGenerating) return;

    setIsGenerating(true);
    setGenerationStage('html');
    setPreviewStats(emptyStats());
    setErrorsByPreset((previous) => {
      const next = { ...previous };
      delete next[selectedPreset.id];
      return next;
    });

    try {
      const imagePrompt = shouldUseGeneratedIllustration(selectedPreset)
        ? buildSlideIllustrationPrompt(selectedPreset, trimmedPrompt)
        : '';
      const imageAsset: HtmlImageAsset | null = shouldUseGeneratedIllustration(selectedPreset)
        ? buildPendingImageAsset({
            providerId: imageProviderId,
            modelId: selectedImageModelId,
            prompt: imagePrompt,
          })
        : null;
      const response = await backendFetch('/api/generate/html-ppt-slide', {
        method: 'POST',
        headers: getHtmlSinglePageHeaders(),
        body: JSON.stringify({
          prompt: trimmedPrompt,
          pageKind: selectedPreset.kind,
          densityContract: buildDensityContract(selectedPreset.densityProfile),
          qualityFeedback: regenerationFeedback || undefined,
          imageAsset: imageAsset
            ? {
                src: IMAGE_ASSET_TOKEN,
                alt: `${selectedPreset.label} AI 插图`,
                description: imageAsset.prompt,
                aspectRatio: '4:3',
              }
            : undefined,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as GenerateHtmlPptResponse;
      if (!response.ok || data.success === false || !data.html) {
        throw new Error(data.error || `HTML 单页生成失败：HTTP ${response.status}`);
      }

      const html = imageAsset ? markImageSlotHtml(data.html) : data.html;
      const run: StoredRun = {
        id: `${Date.now()}`,
        presetId: selectedPreset.id,
        pageKind: selectedPreset.kind,
        label: selectedPreset.label,
        createdAt: Date.now(),
        presetSignature: getPresetSignature(selectedPreset),
        prompt: trimmedPrompt,
        model: data.model,
        html,
        usage: data.usage ?? null,
        costEstimate: data.costEstimate ?? null,
        imageAsset,
        generationAttempts: data.generationAttempts,
        retryReasons: data.retryReasons || [],
        skippedCreditCharge: data.skippedCreditCharge,
        ...analyzeHtml(html),
      };
      setRunsByPreset((previous) => ({ ...previous, [selectedPreset.id]: run }));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setErrorsByPreset((previous) => ({
        ...previous,
        [selectedPreset.id]: {
          presetId: selectedPreset.id,
          pageKind: selectedPreset.kind,
          label: selectedPreset.label,
          createdAt: Date.now(),
          prompt: trimmedPrompt,
          message,
        },
      }));
    } finally {
      setIsGenerating(false);
      setGenerationStage('idle');
    }
  }, [
    imageProviderId,
    isGenerating,
    prompt,
    regenerationFeedback,
    selectedImageModelId,
    selectedPreset,
  ]);

  const handleGenerateImageForCurrentRun = useCallback(async () => {
    const currentRun = runsByPreset[selectedPresetId];
    const pendingAsset = currentRun?.imageAsset;
    if (!currentRun || !pendingAsset || pendingAsset.sourceType !== 'pending') return;
    if (isGeneratingImageAsset) return;

    setIsGeneratingImageAsset(true);
    setGenerationStage('image');
    setErrorsByPreset((previous) => {
      const next = { ...previous };
      delete next[selectedPreset.id];
      return next;
    });

    try {
      const imageResponse = await backendFetch('/api/generate/image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-image-provider': pendingAsset.providerId,
          'x-image-model': pendingAsset.modelId,
          'x-api-key': imageProvidersConfig[pendingAsset.providerId]?.apiKey || '',
          'x-base-url': imageProvidersConfig[pendingAsset.providerId]?.baseUrl || '',
          'x-generation-test-no-charge': 'true',
        },
        body: JSON.stringify({
          prompt: pendingAsset.prompt,
          negativePrompt:
            'text, letters, words, numbers, formulas, labels, axis labels, caption, title, watermark, logo, UI screenshot, complete presentation slide, infographic cards, panels',
          aspectRatio: '4:3',
          notebookContext: {
            name: 'HTML 单页质量测试',
            sceneTitle: selectedPreset.label,
            sceneType: 'generation-html-single-page-test',
          },
        }),
      });
      const imageData = (await imageResponse
        .json()
        .catch(() => ({}))) as GenerateSlideImageResponse;
      if (!imageResponse.ok || !imageData.success || !imageData.result) {
        throw new Error(imageData.error || `AI 插图生成失败：HTTP ${imageResponse.status}`);
      }
      if (!resultToImageUrl(imageData.result)) {
        throw new Error('AI 插图生成成功，但响应里没有可展示的图片数据。');
      }

      const nextAsset = await persistImageResultToAsset({
        result: imageData.result,
        prompt: pendingAsset.prompt,
        preset: selectedPreset,
        providerId: pendingAsset.providerId,
        modelId: imageData.result.usage?.modelId || pendingAsset.modelId,
        costEstimate: imageData.costEstimate,
        skippedCreditCharge: imageData.skippedCreditCharge,
      });

      setRunsByPreset((previous) => {
        const existing = previous[selectedPresetId];
        if (!existing || existing.id !== currentRun.id) return previous;
        return {
          ...previous,
          [selectedPresetId]: {
            ...existing,
            imageAsset: nextAsset,
          },
        };
      });
      setPreviewStats(emptyStats());
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setErrorsByPreset((previous) => ({
        ...previous,
        [selectedPreset.id]: {
          presetId: selectedPreset.id,
          pageKind: selectedPreset.kind,
          label: selectedPreset.label,
          createdAt: Date.now(),
          prompt: currentRun.prompt,
          message,
        },
      }));
    } finally {
      setIsGeneratingImageAsset(false);
      setGenerationStage('idle');
    }
  }, [
    imageProvidersConfig,
    isGeneratingImageAsset,
    runsByPreset,
    selectedPreset,
    selectedPresetId,
  ]);

  const attachImageSlotClickHandler = useCallback(() => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    const currentRun = runsByPreset[selectedPresetId];
    const isPending = currentRun?.imageAsset?.sourceType === 'pending';
    if (!doc || !isPending) return;

    const slotImage = doc.querySelector(
      `img[${HTML_IMAGE_SLOT_ATTR}="true"]`,
    ) as HTMLElement | null;
    if (!slotImage) return;
    const clickTarget = (slotImage.closest('figure') as HTMLElement | null) || slotImage;
    clickTarget.style.cursor = isGeneratingImageAsset ? 'wait' : 'pointer';
    clickTarget.setAttribute(
      'title',
      isGeneratingImageAsset ? '正在生成 AI 插图' : '点击生成 AI 插图',
    );
    clickTarget.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      void handleGenerateImageForCurrentRun();
    };
  }, [handleGenerateImageForCurrentRun, isGeneratingImageAsset, runsByPreset, selectedPresetId]);

  const clearAll = useCallback(() => {
    setRunsByPreset({});
    setErrorsByPreset({});
    setPreviewStats(emptyStats());
  }, []);

  const currentUsageLabel = useMemo(() => formatUsageLabel(result?.usage), [result?.usage]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-5 px-6 py-6">
        <div className="flex items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/test">
              <ArrowLeft className="size-4" />
              返回所有测试
            </Link>
          </Button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant="outline">HTML 单页</Badge>
            <Badge variant="secondary">
              已保存 {Object.keys(runsByPreset).length}/{PAGE_PRESETS.length}
            </Badge>
            {Object.keys(errorsByPreset).length > 0 ? (
              <Badge variant="destructive">失败 {Object.keys(errorsByPreset).length}</Badge>
            ) : null}
          </div>
        </div>

        <header className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                <Presentation className="size-4" />
                HTML Single Page QA
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-normal">HTML 单页质量测试</h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
                现在这一页直接测试 HTML 生成单页，不走 SceneOutline / layoutTemplate。
                每个样本只指定页面类型和内容目标，用真实 iframe 检查 16:9、结构和类型稳定性。
              </p>
            </div>
            <Badge variant="outline" className="w-fit">
              默认模型 {HTML_SINGLE_PAGE_MODEL}
            </Badge>
          </div>
        </header>

        <section className="grid gap-5 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
          <aside className="flex flex-col gap-4 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)]">
            <div className="min-h-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">页面类型测试</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    不选 layout template，只看 HTML 单页在不同教学页面类型下是否稳定。
                  </p>
                </div>
                <Badge variant="outline">{PAGE_PRESETS.length} tests</Badge>
              </div>

              <div className="space-y-2">
                {PAGE_PRESETS.map((preset, index) => {
                  const saved = runsByPreset[preset.id];
                  const savedError = errorsByPreset[preset.id];
                  const isSelected = preset.id === selectedPresetId;
                  const savedExpired = isRunExpired(saved, preset);
                  const hasLiveQuality = isSelected && saved && qualityChecks.length > 0;
                  const hasSavedQualityProblem = hasLiveQuality
                    ? checkSummary.failed > 0 || checkSummary.warned > 0
                    : hasQualityProblem(saved?.quality);
                  const savedImagePending = hasPendingImageAsset(saved);
                  const statusLabel = saved
                    ? savedExpired
                      ? '过期'
                      : hasSavedQualityProblem
                        ? '待修正'
                        : savedImagePending
                          ? '待生成图'
                          : '通过'
                    : savedError
                      ? '失败'
                      : '待测';
                  const statusVariant = saved
                    ? savedExpired || hasSavedQualityProblem
                      ? 'destructive'
                      : savedImagePending
                        ? 'outline'
                        : 'secondary'
                    : savedError
                      ? 'destructive'
                      : 'outline';
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset.id)}
                      className={cn(
                        'block w-full rounded-xl border px-3 py-3 text-left transition',
                        isSelected
                          ? 'border-blue-500 bg-blue-50 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={cn(
                            'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                            isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500',
                          )}
                        >
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-950">{preset.label}</span>
                            <Badge variant="outline">{preset.densityProfile.label}</Badge>
                            <Badge variant={statusVariant}>{statusLabel}</Badge>
                          </div>
                          <div className="mt-1 text-xs leading-5 text-slate-500">
                            {preset.requiredSignal}
                          </div>
                          {saved ? (
                            <div className="mt-1 text-[11px] text-slate-400">
                              {formatTime(saved.createdAt)} · {saved.mathElementCount} math ·{' '}
                              {saved.elementCount} elements
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {history.length > 0 ? (
              <Button type="button" variant="outline" size="sm" onClick={clearAll}>
                <Trash2 className="size-4" />
                清空本页 HTML 历史
              </Button>
            ) : null}
          </aside>

          <div className="flex min-w-0 flex-col gap-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{selectedPreset.label}</Badge>
                    <Badge variant="outline">{selectedPreset.kind}</Badge>
                    <Badge
                      variant={
                        result
                          ? selectedResultExpired || selectedHasQualityProblem
                            ? 'destructive'
                            : selectedImagePending
                              ? 'outline'
                              : 'default'
                          : error
                            ? 'destructive'
                            : 'outline'
                      }
                    >
                      {result
                        ? selectedResultExpired
                          ? '过期'
                          : selectedHasQualityProblem
                            ? '待修正'
                            : selectedImagePending
                              ? '待生成图'
                              : '通过'
                        : error
                          ? '生成失败'
                          : '未生成'}
                    </Badge>
                    {result && !selectedResultExpired ? (
                      <Badge
                        variant={
                          checkSummary.failed > 0
                            ? 'destructive'
                            : checkSummary.warned > 0
                              ? 'secondary'
                              : 'outline'
                        }
                      >
                        QA {checkSummary.passed}/{checkSummary.total}
                      </Badge>
                    ) : null}
                  </div>
                  <h2 className="mt-3 text-xl font-semibold tracking-normal">
                    {selectedPreset.description}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    目标信号：{selectedPreset.requiredSignal}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    密度目标：{selectedPreset.densityProfile.label} ·{' '}
                    {selectedPreset.densityProfile.textChars.min}-
                    {selectedPreset.densityProfile.textChars.max} 字符 · 覆盖{' '}
                    {formatPercent(selectedPreset.densityProfile.contentCoverage.min)}-
                    {formatPercent(selectedPreset.densityProfile.contentCoverage.max)}
                  </p>
                  {selectedUsesIllustration ? (
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      插图策略：HTML 先放可点击占位图，用户确认后再生成 4:3 AI 教学插图并持久化。
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  disabled={isGenerating || isGeneratingImageAsset || !prompt.trim()}
                  onClick={() => void handleGenerate()}
                >
                  {isGenerating || isGeneratingImageAsset ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  {isGenerating
                    ? generationStage === 'image'
                      ? '生成 AI 插图...'
                      : '生成 HTML...'
                    : isGeneratingImageAsset
                      ? '生成 AI 插图...'
                      : regenerationFeedback
                        ? '带 QA 反馈重生成'
                        : '生成 HTML 单页'}
                </Button>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                <label className="block text-xs font-medium text-slate-600">
                  Prompt
                  <Textarea
                    ref={promptTextareaRef}
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    className="mt-1 min-h-[270px] resize-y rounded-xl font-mono text-xs leading-5"
                  />
                </label>

                <div className="space-y-3 text-sm">
                  <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-3 text-xs leading-5 text-blue-950">
                    <div className="font-semibold">HTML 生成契约</div>
                    <div className="mt-1">
                      固定 1600×900；一张 .slide；不用 layout template；所有内容是 DOM 和 CSS；
                      数学用 MathML，代码用 pre/code。
                    </div>
                    {selectedUsesIllustration ? (
                      <div className="mt-2 rounded-lg border border-blue-100 bg-white/70 px-2 py-1.5">
                        本页会先生成带占位图的 HTML。占位图会显示图片内容说明和预估费用，
                        点击占位图后才真正调用图片模型。
                      </div>
                    ) : null}
                    <div className="mt-2 whitespace-pre-line border-t border-blue-100 pt-2">
                      {buildDensityContract(selectedPreset.densityProfile)}
                    </div>
                  </div>
                  {regenerationFeedback ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-900">
                      <div className="font-semibold">下次生成会携带 QA 失败详情</div>
                      <div className="mt-1">
                        当前结果存在质检问题，点击生成会把越界/滚动等失败原因一并发给模型修复。
                      </div>
                    </div>
                  ) : null}
                  {result ? (
                    <>
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <div className="text-xs text-slate-500">本次生成模型</div>
                        <div className="font-semibold">
                          {result.model || '未知'}
                          {selectedResultExpired ? (
                            <span className="ml-2 text-xs font-medium text-red-600">旧结果</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <div className="text-xs text-slate-500">费用</div>
                        <div className="font-semibold">{formatCostLabel(result)}</div>
                      </div>
                      {result.imageAsset ? (
                        <div
                          className={cn(
                            'rounded-xl px-3 py-2',
                            result.imageAsset.sourceType === 'pending'
                              ? 'border border-blue-100 bg-blue-50'
                              : 'bg-slate-50',
                          )}
                        >
                          <div className="flex items-center gap-1 text-xs text-slate-500">
                            <ImageIcon className="size-3.5" />
                            AI 插图
                          </div>
                          <div className="mt-1 font-semibold">
                            {result.imageAsset.providerName} · {result.imageAsset.modelId}
                          </div>
                          <div className="mt-1 text-xs leading-5 text-slate-500">
                            {result.imageAsset.sourceType === 'pending'
                              ? `待生成 · 点击预览里的图片占位图后生成 · ${result.imageAsset.estimatedCostLabel || getEstimatedImageCostLabel(result.imageAsset.providerId, result.imageAsset.modelId)}`
                              : `4:3 插图素材 · ${formatImageCostLabel(result.imageAsset.costEstimate)}${
                                  result.imageAsset.sourceType === 'indexeddb'
                                    ? ' · 已存 IndexedDB'
                                    : ''
                                }`}
                          </div>
                          {result.imageAsset.sourceType === 'pending' ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="mt-2 w-full border-blue-200 bg-white"
                              disabled={isGeneratingImageAsset}
                              onClick={() => void handleGenerateImageForCurrentRun()}
                            >
                              {isGeneratingImageAsset ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <ImageIcon className="size-4" />
                              )}
                              {isGeneratingImageAsset ? '正在生成插图' : '生成这张插图'}
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                      {currentUsageLabel ? (
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <div className="text-xs text-slate-500">用量</div>
                          <div className="font-semibold">{currentUsageLabel}</div>
                        </div>
                      ) : null}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <div className="text-slate-500">元素</div>
                          <div className="font-semibold">{result.elementCount}</div>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <div className="text-slate-500">MathML</div>
                          <div className="font-semibold">{result.mathElementCount}</div>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <div className="text-slate-500">可见字符</div>
                          <div className="font-semibold">{previewStats.visibleCharCount}</div>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <div className="text-slate-500">覆盖</div>
                          <div className="font-semibold">
                            {formatPercent(previewStats.contentCoverageRatio)}
                          </div>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <div className="text-slate-500">图片</div>
                          <div className="font-semibold">{previewStats.imageCount}</div>
                        </div>
                      </div>
                      {getRetryCount(result) > 0 ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                          <div className="font-semibold">自动重试 {getRetryCount(result)} 次</div>
                          {result.retryReasons && result.retryReasons.length > 0 ? (
                            <div className="mt-1 space-y-1">
                              {result.retryReasons.map((reason, reasonIndex) => (
                                <div key={`${reason.code || reason.title}-${reasonIndex}`}>
                                  <div className="font-medium">
                                    {reasonIndex + 1}. {reason.title}
                                  </div>
                                  {reason.details && reason.details.length > 0 ? (
                                    <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                                      {reason.details.slice(0, 3).map((detail, detailIndex) => (
                                        <li key={`${detail}-${detailIndex}`}>{detail}</li>
                                      ))}
                                    </ul>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-1">
                              后端进行了自动重试，但这条旧记录没有保存具体原因；重新生成后会记录原因。
                            </div>
                          )}
                        </div>
                      ) : null}
                      {result.skippedCreditCharge ? (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-900">
                          <Save className="mr-1 inline size-3.5" />
                          测试请求跳过本地积分扣费，仅展示估算费用。
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  {error ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm leading-6 text-red-800">
                      {error.message}
                    </div>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={isGenerating}
                    onClick={() => {
                      setPrompt(selectedPreset.prompt);
                      setPromptByPreset((previous) => ({
                        ...previous,
                        [selectedPreset.id]: selectedPreset.prompt,
                      }));
                    }}
                  >
                    <RefreshCw className="size-4" />
                    重置当前 prompt
                  </Button>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">HTML 单页预览</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    真实 iframe 1600×900。生成后会自动检查滚动、越界、结构和页面类型信号。
                  </p>
                </div>
                {result ? <Badge variant="outline">{formatTime(result.createdAt)}</Badge> : null}
              </div>

              <div className="rounded-2xl bg-slate-100 p-4">
                <div
                  ref={previewFrameRef}
                  className="relative mx-auto aspect-video w-full max-w-[1120px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
                >
                  {isGenerating ? (
                    <div className="flex size-full flex-col items-center justify-center gap-3 text-sm text-slate-500">
                      <Loader2 className="size-8 animate-spin text-blue-700" />
                      {generationStage === 'image' ? '正在生成页面插图' : '正在生成 HTML 单页'}
                    </div>
                  ) : result ? (
                    <iframe
                      ref={iframeRef}
                      title="Generated HTML single page preview"
                      srcDoc={resolvedPreviewHtml || result.html}
                      className="absolute left-0 top-0 border-0"
                      style={{
                        width: 1600,
                        height: 900,
                        transform: `scale(${previewScale})`,
                        transformOrigin: 'top left',
                      }}
                      onLoad={() => {
                        schedulePreviewInspection();
                        attachImageSlotClickHandler();
                      }}
                    />
                  ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-3 text-slate-400">
                      <Presentation className="size-10" />
                      <div className="text-sm font-medium">生成一页后在这里预览</div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">本地质检</h2>
                  {result ? (
                    <Badge
                      variant={
                        checkSummary.failed > 0
                          ? 'destructive'
                          : checkSummary.warned > 0
                            ? 'secondary'
                            : 'outline'
                      }
                    >
                      {checkSummary.passed}/{checkSummary.total}
                    </Badge>
                  ) : null}
                </div>
                {qualityChecks.length > 0 ? (
                  <div className="max-h-[420px] space-y-2 overflow-auto pr-1">
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
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center text-sm text-slate-400">
                    还没有生成结果。
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <Code2 className="size-4 text-slate-500" />
                  <h2 className="text-sm font-semibold">HTML 源码</h2>
                </div>
                <pre className="max-h-[420px] overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-100">
                  {result?.html || '等待 HTML 生成结果...'}
                </pre>
              </div>
            </section>

            {history.length > 0 ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <FileText className="size-4 text-slate-500" />
                  <h2 className="text-sm font-semibold">最近生成</h2>
                </div>
                <div className="grid gap-2">
                  {history.slice(0, 8).map((run) => (
                    <button
                      key={run.id}
                      type="button"
                      onClick={() => {
                        applyPreset(run.presetId);
                        setPrompt(run.prompt);
                        setPreviewStats(emptyStats());
                      }}
                      className="flex flex-col gap-1 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-left text-sm transition hover:border-blue-200 hover:bg-white sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-900">
                          {run.label} · {run.model || 'unknown'} · {run.elementCount} elements
                        </div>
                        <div className="mt-0.5 truncate text-xs text-slate-500">
                          {formatCostLabel(run)}
                        </div>
                      </div>
                      <div className="shrink-0 text-xs text-slate-500">
                        {formatTime(run.createdAt)}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
