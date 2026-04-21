/**
 * Stage 2: Scene content and action generation.
 *
 * Generates full scenes (slide/quiz/interactive/pbl with actions)
 * from scene outlines.
 */

import { nanoid } from 'nanoid';
import katex from 'katex';
import { MAX_VISION_IMAGES } from '@/lib/constants/generation';
import type {
  SceneOutline,
  GeneratedSlideContent,
  GeneratedQuizContent,
  GeneratedInteractiveContent,
  GeneratedPBLContent,
  ScientificModel,
  PdfImage,
  ImageMapping,
} from '@/lib/types/generation';
import type { LanguageModel } from 'ai';
import type { StageStore } from '@/lib/api/stage-api';
import { createStageAPI } from '@/lib/api/stage-api';
import { generatePBLContent } from '@/lib/pbl/generate-pbl';
import {
  buildNotebookContentDocumentFromInsert,
  prepareNotebookSemanticLayout,
  parseNotebookContentDocument,
  measureNotebookSemanticLayout,
  paginateNotebookSemanticLayout,
  renderNotebookSemanticPages,
  validateNotebookContentDocumentArchetype,
  type NotebookContentBlockPlacement,
  type NotebookContentDocument,
} from '@/lib/notebook-content';
import { markSemanticSlideContent } from '@/lib/notebook-content/semantic-slide-render';
import { buildPrompt, PROMPT_IDS } from './prompts';
import { postProcessInteractiveHtml } from './interactive-post-processor';
import { parseActionsFromStructuredOutput } from './action-parser';
import { parseJsonResponse } from './json-repair';
import {
  buildCourseContext,
  formatCoursePersonalizationForPrompt,
  formatAgentsForPrompt,
  formatSceneArchetypeContext,
  formatTeacherPersonaForPrompt,
  formatSceneContentProfileContext,
  formatSlideRewriteContext,
  formatWorkedExampleForPrompt,
  formatImageDescription,
  formatImagePlaceholder,
} from './prompt-formatters';
import {
  buildContinuationSceneOutline,
  flattenGeneratedSlideContentPages,
  spliceGeneratedOutlines,
} from './continuation-pages';
import type {
  PPTElement,
  PPTImageElement,
  PPTLineElement,
  PPTShapeElement,
  PPTTextElement,
  Slide,
  SlideBackground,
  SlideTheme,
} from '@/lib/types/slides';
import type { QuizQuestion } from '@/lib/types/stage';
import type { Action } from '@/lib/types/action';
import {
  normalizeSlideTextLayout,
  validateSlideTextLayout,
  type SlideLayoutValidationResult,
  MIN_TEXT_LINE_HEIGHT_RATIO,
  MAX_TEXT_LINE_HEIGHT_RATIO,
} from '@/lib/slide-text-layout';
import type {
  AgentInfo,
  CoursePersonalizationContext,
  SceneGenerationContext,
  GeneratedSlideData,
  AICallFn,
  GenerationResult,
  GenerationCallbacks,
} from './pipeline-types';
import { createLogger } from '@/lib/logger';
import { verbalizeSpeechActions } from '@/lib/audio/spoken-text';
const log = createLogger('Generation');
const SLIDE_LAYOUT_VIEWPORT = { width: 1000, height: 562.5 } as const;
const MAX_SLIDE_LAYOUT_RETRIES = 1;
const MAX_SEMANTIC_SLIDE_RETRIES = 1;

export interface SceneContentDiagnostics {
  pipeline: 'semantic' | 'legacy' | 'interactive' | 'quiz' | 'pbl' | 'unknown';
  failureStage?: string;
  failureReasons: string[];
  semanticRetryCount: number;
  layoutRetryCount: number;
}

function recordFailure(
  diagnostics: SceneContentDiagnostics | undefined,
  stage: string,
  reason: string,
): void {
  if (!diagnostics) return;
  diagnostics.failureStage = stage;
  diagnostics.failureReasons.push(reason);
}

function appendRewriteReason(base?: string, extra?: string): string | undefined {
  const trimmedExtra = extra?.trim();
  if (!trimmedExtra) return base;

  const trimmedBase = base?.trim();
  return trimmedBase ? `${trimmedBase}\n\n${trimmedExtra}` : trimmedExtra;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizeLineHeightStyleValue(rawValue: string, fontSizePx: number | null): string {
  const trimmed = rawValue.trim();
  const pxMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)px$/i);
  if (pxMatch) {
    const px = Number.parseFloat(pxMatch[1]);
    if (!Number.isFinite(px)) return rawValue;
    const safeFontSize = fontSizePx ?? 16;
    const clampedPx = clampNumber(
      px,
      safeFontSize * MIN_TEXT_LINE_HEIGHT_RATIO,
      safeFontSize * MAX_TEXT_LINE_HEIGHT_RATIO,
    );
    return `${Number(clampedPx.toFixed(2))}px`;
  }

  const numericMatch = trimmed.match(/^-?\d+(?:\.\d+)?$/);
  if (numericMatch) {
    const ratio = Number.parseFloat(numericMatch[0]);
    if (!Number.isFinite(ratio)) return rawValue;
    return String(
      Number(clampNumber(ratio, MIN_TEXT_LINE_HEIGHT_RATIO, MAX_TEXT_LINE_HEIGHT_RATIO).toFixed(3)),
    );
  }

  return rawValue;
}

function sanitizeTextHtmlMetrics(html: string): string {
  if (!html) return html;

  return html.replace(/style=(['"])([\s\S]*?)\1/gi, (full, quote: string, styleText: string) => {
    const declarations = styleText
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean);

    let fontSizePx: number | null = null;
    for (const declaration of declarations) {
      const colonIndex = declaration.indexOf(':');
      if (colonIndex === -1) continue;
      const key = declaration.slice(0, colonIndex).trim().toLowerCase();
      const value = declaration.slice(colonIndex + 1).trim();
      if (key !== 'font-size') continue;
      const match = value.match(/^(-?\d+(?:\.\d+)?)px$/i);
      if (!match) continue;
      const parsed = Number.parseFloat(match[1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        fontSizePx = parsed;
      }
    }

    const normalized = declarations.map((declaration) => {
      const colonIndex = declaration.indexOf(':');
      if (colonIndex === -1) return declaration;
      const key = declaration.slice(0, colonIndex).trim();
      const lowerKey = key.toLowerCase();
      const value = declaration.slice(colonIndex + 1).trim();

      if (lowerKey === 'line-height') {
        return `${key}:${sanitizeLineHeightStyleValue(value, fontSizePx)}`;
      }

      return `${key}:${value}`;
    });

    return `style=${quote}${normalized.join(';')}${quote}`;
  });
}

function sanitizeTextMetrics<T extends { lineHeight?: number; paragraphSpace?: number }>(
  textLike: T,
): T {
  const next = { ...textLike };

  if (next.lineHeight !== undefined) {
    next.lineHeight = clampNumber(
      next.lineHeight,
      MIN_TEXT_LINE_HEIGHT_RATIO,
      MAX_TEXT_LINE_HEIGHT_RATIO,
    );
  }

  if (next.paragraphSpace !== undefined) {
    next.paragraphSpace = Math.max(0, next.paragraphSpace);
  }

  return next;
}

function formatLayoutIssueForRetry(
  issue: SlideLayoutValidationResult['issues'][number],
  language: 'zh-CN' | 'en-US',
): string {
  if (language === 'zh-CN') {
    switch (issue.code) {
      case 'viewport_overflow':
        return '元素超出画布边界';
      case 'text_box_overflow':
        return '文本框高度不足，正文放不下';
      case 'shape_text_overflow':
        return 'shape.text 内容超过背景容器高度';
      case 'contained_element_overflow':
        return '背景容器内的文字或公式超出容器边界';
      case 'detached_container_content':
        return '不要输出空背景框，再把正文或公式放在框外或框下';
      case 'invalid_text_metrics':
        return '文字样式存在非法度量，例如过小的 line-height，导致整行文字被压扁';
      case 'element_overlap':
        return '多个组件发生重叠，页面结构过于拥挤';
      default:
        return issue.message;
    }
  }

  switch (issue.code) {
    case 'viewport_overflow':
      return 'elements exceed the slide viewport';
    case 'text_box_overflow':
      return 'a text box is too short for its content';
    case 'shape_text_overflow':
      return 'shape.text content is taller than its container';
    case 'contained_element_overflow':
      return 'text or latex exceeds its containing background shape';
    case 'detached_container_content':
      return 'do not place an empty background shape above content that belongs inside it';
    case 'invalid_text_metrics':
      return 'text metrics are invalid, such as a line-height that crushes the glyphs';
    case 'element_overlap':
      return 'multiple slide components overlap each other';
    default:
      return issue.message;
  }
}

function buildLayoutRetryReason(
  validation: SlideLayoutValidationResult,
  language: 'zh-CN' | 'en-US',
): string {
  const issueSummary = validation.issues
    .slice(0, 4)
    .map((issue) => formatLayoutIssueForRetry(issue, language))
    .join(language === 'zh-CN' ? '；' : '; ');

  if (language === 'zh-CN') {
    return [
      '上一版因为版式几何校验失败，需要整页重写。',
      `- 失败原因：${issueSummary || '文字与容器的几何关系不正确。'}`,
      '- 必须保证所有文字框、公式框和 shape.text 在最终版式里完整落在各自容器内。',
      '- 卡片、说明框、提示框里的正文，优先直接写到 shape.text；如果使用独立 TextElement 或 LatexElement，它必须几何上完整位于背景 shape 内。',
      '- 不要输出空背景框，再把正文、项目符号或公式漂在框外、框下或相邻位置。',
      '- 不允许通过缩小字号来解决布局问题；如果内容过多，请改布局、增大容器、拆成多块，或减少单页信息密度。',
      '- 对于总览、分类、判定步骤、证明方法等内容，优先改成表格、要点列表、callout 或上下堆叠卡片，不要拼很多漂浮的小标签和小框。',
    ].join('\n');
  }

  return [
    'The previous version failed geometric layout validation and must be fully rewritten.',
    `- Failure summary: ${issueSummary || 'The text-to-container geometry was invalid.'}`,
    '- Every text box, latex box, and shape.text block must be fully contained by its final container.',
    '- For card, callout, or container copy, prefer shape.text. If you use a separate TextElement or LatexElement, it must be geometrically inside the background shape.',
    '- Do not output an empty background shape and place the real copy, bullets, or formulas below or outside that shape.',
    '- Do not solve layout by shrinking font sizes. If content is too dense, change the layout, enlarge the container, split the card, or reduce per-slide density.',
    '- For overviews, classifications, proof strategies, or decision flows, prefer tables, bullet lists, callouts, or vertically stacked cards instead of many floating mini-boxes.',
  ].join('\n');
}

function buildSemanticStructureRetryReason(language: 'zh-CN' | 'en-US'): string {
  if (language === 'zh-CN') {
    return [
      '请优先输出稳定的语义结构，而不是隐含复杂图形布局。',
      '- “总览 / 分类 / 判定 / 证明方法”优先用 table、bullet_list、callout、definition、theorem。',
      '- 如果一个 block 需要很多并列标签、节点或箭头，请改成表格、编号列表或拆成两块上下堆叠内容。',
      '- 不要尝试用许多漂浮的小文本块去模拟流程图、关系图或概念图。',
    ].join('\n');
  }

  return [
    'Prefer stable semantic structures instead of implying a complex diagram layout.',
    '- For overview, classification, proof strategy, or decision content, prefer table, bullet_list, callout, definition, or theorem blocks.',
    '- If a block would require many peer labels, nodes, or arrows, convert it into a table, numbered list, or two vertically stacked blocks.',
    '- Do not simulate flowcharts, relation maps, or concept maps with many floating mini text blocks.',
  ].join('\n');
}

function buildSemanticBudgetRetryReason(language: 'zh-CN' | 'en-US', reasons: string[]): string {
  const reasonText = reasons.join(language === 'zh-CN' ? '；' : '; ');
  if (language === 'zh-CN') {
    return [
      '当前语义内容超过单页信息预算，需要降低单页密度。',
      `- 预算信号：${reasonText || '当前页面内容过多。'}`,
      '- 只保留这一页最核心的 1-2 个结构，不要同时塞入很多平级分类、标签、说明和结论。',
      '- 优先输出表格、编号列表、要点卡片或 callout，不要把多个分类结果拆成很多零碎小块。',
      '- 本轮必须优先压缩同页表达（缩句、减冗余、减少平级块），不要主动拆成多页。',
    ].join('\n');
  }

  return [
    'The semantic content exceeds the per-slide information budget and must be simplified.',
    `- Budget signals: ${reasonText || 'This slide is too dense.'}`,
    '- Keep only the most important 1-2 structures for this slide instead of combining many peer classifications, labels, notes, and conclusions.',
    '- Prefer a table, numbered list, bullet card, or callout instead of many tiny fragments.',
    '- In this retry, prioritize compact single-page rewriting (shorter phrasing, fewer peer blocks) instead of proactively splitting into multiple pages.',
  ].join('\n');
}

export function buildValidatedFallbackSlideContent(
  outline: SceneOutline,
): GeneratedSlideContent | null {
  const fallback = buildSemanticFallbackSlideContent(outline);
  if (!fallback) return null;
  const normalizedElements = normalizeSlideTextLayout(fallback.elements, SLIDE_LAYOUT_VIEWPORT);
  const layoutValidation = validateSlideTextLayout(normalizedElements, SLIDE_LAYOUT_VIEWPORT);
  if (!layoutValidation.isValid) {
    log.warn(
      `Fallback slide content layout invalid for: ${outline.title}`,
      layoutValidation.issues.map((issue) => issue.message),
    );
    return null;
  }

  return {
    ...fallback,
    elements: normalizedElements,
  };
}

function buildSemanticFallbackSlideContent(outline: SceneOutline): GeneratedSlideContent | null {
  const language = outline.language || 'zh-CN';
  const fallbackDocumentBase = buildNotebookContentDocumentFromInsert({
    title: outline.title || (language === 'zh-CN' ? '未命名页面' : 'Untitled Slide'),
    description: outline.description || outline.title || '',
    keyPoints: outline.keyPoints || [],
    language,
  });
  const fallbackDocument: NotebookContentDocument = {
    ...fallbackDocumentBase,
    profile: outline.contentProfile || fallbackDocumentBase.profile,
    archetype: outline.archetype || fallbackDocumentBase.archetype,
    title: outline.title || fallbackDocumentBase.title,
  };

  const preparedLayout = prepareNotebookSemanticLayout({
    document: fallbackDocument,
    fallbackTitle: outline.title,
    rootOutlineId: outline.continuation?.rootOutlineId || outline.id,
    viewport: SLIDE_LAYOUT_VIEWPORT,
  });
  if (preparedLayout.pagination.pages.length === 0) return null;

  const renderedPages = preparedLayout.pages.map((page) => ({
    elements: page.slide.elements,
    background: page.slide.background,
    theme: page.slide.theme,
    contentDocument: page.document,
    layoutValidation: page.layoutValidation,
  }));

  const invalidPage = renderedPages.find((page) => !page.layoutValidation.isValid);
  if (invalidPage) return null;

  const [primaryPage, ...continuationPages] = renderedPages;
  return {
    elements: primaryPage.elements,
    background: primaryPage.background,
    theme: primaryPage.theme,
    remark: outline.description,
    contentDocument: primaryPage.contentDocument,
    continuationPages: continuationPages.map((page, index) => ({
      outline: buildContinuationSceneOutline(outline, index + 2, renderedPages.length),
      content: {
        elements: page.elements,
        background: page.background,
        theme: page.theme,
        remark: outline.description,
        contentDocument: page.contentDocument,
      },
    })),
  };
}

// ==================== Stage 2: Full Scenes (Two-Step) ====================

/**
 * Stage 3: Generate full scenes.
 *
 * Slide scenes may expand into multiple continuation pages. Those continuation pages
 * are materialized immediately and participate in later ordering / narration context.
 */
export async function generateFullScenes(
  sceneOutlines: SceneOutline[],
  store: StageStore,
  aiCall: AICallFn,
  callbacks?: GenerationCallbacks,
): Promise<GenerationResult<string[]>> {
  const api = createStageAPI(store);
  let outlines = [...sceneOutlines].sort((a, b) => a.order - b.order);
  let completedCount = 0;
  const sceneIds: string[] = [];

  callbacks?.onProgress?.({
    currentStage: 3,
    overallProgress: 66,
    stageProgress: 0,
    statusMessage: `正在生成 ${outlines.length} 个场景...`,
    scenesGenerated: 0,
    totalScenes: outlines.length,
  });

  for (let index = 0; index < outlines.length; index += 1) {
    const outline = outlines[index];

    try {
      log.info(`Step 3.1: Generating content for: ${outline.title}`);
      const content = await generateSceneContent(outline, aiCall);
      if (!content) {
        throw new Error(`Failed to generate content for: ${outline.title}`);
      }

      if (outline.type === 'slide' && 'elements' in content) {
        const flattened = flattenGeneratedSlideContentPages({
          content,
          effectiveOutline: outline,
        });
        let effectiveOutlines = flattened.effectiveOutlines;
        if (effectiveOutlines.length > 1) {
          const spliced = spliceGeneratedOutlines(outlines, outline.id, effectiveOutlines);
          outlines = spliced.outlines;
          effectiveOutlines = spliced.effectiveOutlines;
        }

        for (let pageIndex = 0; pageIndex < flattened.contents.length; pageIndex += 1) {
          const pageOutline = effectiveOutlines[pageIndex] || outline;
          const pageContent = flattened.contents[pageIndex];
          log.info(`Step 3.2: Generating actions for: ${pageOutline.title}`);
          const actions = await generateSceneActions(pageOutline, { ...pageContent }, aiCall);
          const sceneId = createSceneWithActions(pageOutline, { ...pageContent }, actions, api);
          if (sceneId) {
            sceneIds.push(sceneId);
          }
          completedCount += 1;
        }
      } else {
        log.info(`Step 3.2: Generating actions for: ${outline.title}`);
        const actions = await generateSceneActions(outline, content, aiCall);
        const sceneId = createSceneWithActions(outline, content, actions, api);
        if (sceneId) {
          sceneIds.push(sceneId);
        }
        completedCount += 1;
      }
    } catch (error) {
      completedCount += 1;
      callbacks?.onError?.(`Failed to generate scene ${outline.title}: ${error}`);
    }

    callbacks?.onProgress?.({
      currentStage: 3,
      overallProgress: 66 + Math.floor((completedCount / Math.max(outlines.length, 1)) * 34),
      stageProgress: Math.floor((completedCount / Math.max(outlines.length, 1)) * 100),
      statusMessage: `已完成 ${completedCount}/${outlines.length} 个场景`,
      scenesGenerated: sceneIds.length,
      totalScenes: outlines.length,
    });
  }

  return { success: true, data: sceneIds };
}

/**
 * Step 3.1: Generate content based on outline
 */
export async function generateSceneContent(
  outline: SceneOutline,
  aiCall: AICallFn,
  assignedImages?: PdfImage[],
  imageMapping?: ImageMapping,
  languageModel?: LanguageModel,
  visionEnabled?: boolean,
  generatedMediaMapping?: ImageMapping,
  agents?: AgentInfo[],
  courseContext?: CoursePersonalizationContext,
  rewriteReason?: string,
  diagnostics?: SceneContentDiagnostics,
): Promise<
  | GeneratedSlideContent
  | GeneratedQuizContent
  | GeneratedInteractiveContent
  | GeneratedPBLContent
  | null
> {
  // If outline is interactive but missing interactiveConfig, fall back to slide
  if (outline.type === 'interactive' && !outline.interactiveConfig) {
    log.warn(
      `Interactive outline "${outline.title}" missing interactiveConfig, falling back to slide`,
    );
    const fallbackOutline = { ...outline, type: 'slide' as const };
    if (diagnostics) diagnostics.pipeline = 'semantic';
    recordFailure(
      diagnostics,
      'interactive_outline_invalid',
      'interactive config missing, downgraded to slide',
    );
    return generateSlideContent(
      fallbackOutline,
      aiCall,
      assignedImages,
      imageMapping,
      visionEnabled,
      generatedMediaMapping,
      agents,
      courseContext,
      undefined,
      0,
      false,
      diagnostics,
    );
  }

  switch (outline.type) {
    case 'slide':
      return generateSlideContent(
        outline,
        aiCall,
        assignedImages,
        imageMapping,
        visionEnabled,
        generatedMediaMapping,
        agents,
        courseContext,
        rewriteReason,
        0,
        false,
        diagnostics,
      );
    case 'quiz':
      if (diagnostics) diagnostics.pipeline = 'quiz';
      return generateQuizContent(outline, aiCall, courseContext);
    case 'interactive':
      if (diagnostics) diagnostics.pipeline = 'interactive';
      return generateInteractiveContent(outline, aiCall, outline.language, courseContext);
    case 'pbl':
      if (diagnostics) diagnostics.pipeline = 'pbl';
      return generatePBLSceneContent(outline, languageModel);
    default:
      recordFailure(diagnostics, 'unknown_scene_type', `unsupported scene type: ${outline.type}`);
      return null;
  }
}

export function buildFallbackSlideContentFromOutline(outline: SceneOutline): GeneratedSlideContent {
  const lang = outline.language || 'zh-CN';
  const contentProfile = outline.contentProfile || 'general';
  const summary = normalizeText(
    outline.description || outline.keyPoints.join(' ') || outline.title,
    360,
  );
  const keyPoints = normalizeList(
    outline.keyPoints,
    summary
      ? [summary]
      : [
          lang === 'zh-CN'
            ? '根据当前大纲整理这一页的核心信息'
            : 'Summarize the main idea from the current outline',
        ],
    6,
    110,
  );
  const takeaway = normalizeList(
    [],
    lang === 'zh-CN'
      ? ['先理解这一页的核心概念与结论', '讲解时可根据上下文继续补充细节与例子']
      : [
          'Focus on the main concept and conclusion first',
          'Add examples and detail during narration if needed',
        ],
    3,
    96,
  );

  const accent =
    contentProfile === 'code' ? '#0f766e' : contentProfile === 'math' ? '#2563eb' : '#4f46e5';
  const accentSoft =
    contentProfile === 'code' ? '#ccfbf1' : contentProfile === 'math' ? '#dbeafe' : '#e0e7ff';
  const panel =
    contentProfile === 'code' ? '#ecfeff' : contentProfile === 'math' ? '#eff6ff' : '#eef2ff';
  const panelAlt =
    contentProfile === 'code' ? '#f8fafc' : contentProfile === 'math' ? '#f8fbff' : '#f8fafc';

  const elements: PPTElement[] = [
    createRectElement({
      name: 'top_accent',
      left: 0,
      top: 0,
      width: 1000,
      height: 8,
      fill: accent,
    }),
    createRectElement({
      name: 'title_marker',
      left: 44,
      top: 34,
      width: 10,
      height: 46,
      fill: accent,
    }),
    (() => {
      const titlePanel = createRectElement({
        name: 'slide_title_panel',
        left: 72,
        top: 28,
        width: 860,
        height: 56,
        fill: '#fcfcfd',
      });
      titlePanel.text = {
        content: toTextHtml(
          splitIntoLines(outline.title || (lang === 'zh-CN' ? '未命名页面' : 'Untitled Slide'), 30, 2),
          {
            fontSize: 30,
            color: '#0f172a',
            bold: true,
          },
        ),
        defaultFontName: DEFAULT_FONT,
        defaultColor: '#0f172a',
        align: 'top',
        lineHeight: 1.34,
        paragraphSpace: 6,
        type: 'title',
      };
      return titlePanel;
    })(),
    (() => {
      const summaryPanel = createRectElement({
        name: 'summary_panel',
        left: 44,
        top: 106,
        width: 912,
        height: 118,
        fill: panel,
        outlineColor: accentSoft,
      });
      summaryPanel.text = {
        content: toTextHtml(splitIntoLines(summary, 78, 2), {
          fontSize: 17,
          color: '#334155',
          lineHeight: 1.42,
        }),
        defaultFontName: DEFAULT_FONT,
        defaultColor: '#334155',
        align: 'top',
        lineHeight: 1.4,
        paragraphSpace: 6,
        type: 'content',
      };
      return summaryPanel;
    })(),
    ...buildInfoCard(
      undefined,
      keyPoints,
      { left: 44, top: 252, width: 566, height: 258 },
      {
        accent,
        accentSoft,
        panel,
        panelAlt,
        codeBg: '#172554',
      },
      'fallback_keypoints',
    ),
    ...buildInfoCard(
      undefined,
      takeaway,
      { left: 636, top: 252, width: 320, height: 258 },
      {
        accent: '#0891b2',
        accentSoft: '#bae6fd',
        panel: '#ecfeff',
        panelAlt: '#f8fafc',
        codeBg: '#0f172a',
      },
      'fallback_takeaway',
    ),
  ];

  return {
    elements,
    background: { type: 'solid', color: '#fcfcfd' },
    remark: outline.description,
  };
}

const CJK_TEXT_REGEX = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

function hasUnexpectedCjkForLanguage(value: unknown, language: 'zh-CN' | 'en-US'): boolean {
  if (language !== 'en-US') return false;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return CJK_TEXT_REGEX.test(text);
}

/**
 * Check if a string looks like an image ID (e.g., "img_1", "img_2")
 * rather than a base64 data URL or actual URL
 *
 * This function distinguishes between:
 * - Image IDs: "img_1", "img_2", etc. → returns true
 * - Base64 data URLs: "data:image/..." → returns false
 * - HTTP URLs: "http://...", "https://..." → returns false
 * - Relative paths: "/images/..." → returns false
 */
function isImageIdReference(value: string): boolean {
  if (!value) return false;
  // Exclude real URLs and paths
  if (value.startsWith('data:')) return false;
  if (value.startsWith('http://') || value.startsWith('https://')) return false;
  if (value.startsWith('/')) return false; // Relative paths
  // Match image ID format: img_1, img_2, etc.
  return /^img_\d+$/i.test(value);
}

/**
 * Check if a string looks like a generated image/video ID (e.g., "gen_img_1", "gen_img_xK8f2mQ")
 * These are placeholders for AI-generated media, not PDF-extracted images.
 */
function isGeneratedImageId(value: string): boolean {
  if (!value) return false;
  return /^gen_(img|vid)_[\w-]+$/i.test(value);
}

/**
 * Resolve image ID references in src field to actual base64 URLs
 *
 * AI generates: { type: "image", src: "img_1", ... }
 * This function replaces: { type: "image", src: "data:image/png;base64,...", ... }
 *
 * Design rationale (Plan B):
 * - Simpler: AI only needs to know one field (src)
 * - Consistent: Generated JSON structure matches final PPTImageElement
 * - Intuitive: src is the image source, first as ID then as actual URL
 * - Less prompt complexity: No need to explain imageId vs src distinction
 */
function resolveImageIds(
  elements: GeneratedSlideData['elements'],
  imageMapping?: ImageMapping,
  generatedMediaMapping?: ImageMapping,
): GeneratedSlideData['elements'] {
  return elements
    .map((el) => {
      if (el.type === 'image') {
        if (!('src' in el)) {
          log.warn(`Image element missing src, removing element`);
          return null; // Remove invalid image elements
        }
        const src = el.src as string;

        // If src is an image ID reference, replace with actual URL
        if (isImageIdReference(src)) {
          if (!imageMapping || !imageMapping[src]) {
            log.warn(`No mapping for image ID: ${src}, removing element`);
            return null; // Remove invalid image elements
          }
          log.debug(`Resolved image ID "${src}" to base64 URL`);
          return { ...el, src: imageMapping[src] };
        }

        // Generated image reference — keep as placeholder for async backfill
        if (isGeneratedImageId(src)) {
          if (generatedMediaMapping && generatedMediaMapping[src]) {
            log.debug(`Resolved generated image ID "${src}" to URL`);
            return { ...el, src: generatedMediaMapping[src] };
          }
          // Keep element with placeholder ID — frontend renders skeleton
          log.debug(`Keeping generated image placeholder: ${src}`);
          return el;
        }
      }

      if (el.type === 'video') {
        if (!('src' in el)) {
          log.warn(`Video element missing src, removing element`);
          return null;
        }
        const src = el.src as string;
        if (isGeneratedImageId(src)) {
          if (generatedMediaMapping && generatedMediaMapping[src]) {
            log.debug(`Resolved generated video ID "${src}" to URL`);
            return { ...el, src: generatedMediaMapping[src] };
          }
          // Keep element with placeholder ID — frontend renders skeleton
          log.debug(`Keeping generated video placeholder: ${src}`);
          return el;
        }
      }

      return el;
    })
    .filter((el): el is NonNullable<typeof el> => el !== null);
}

/**
 * Fix elements with missing required fields
 * Adds default values for fields that AI might not have generated correctly
 */
function fixElementDefaults(
  elements: GeneratedSlideData['elements'],
  assignedImages?: PdfImage[],
): GeneratedSlideData['elements'] {
  return elements.map((el) => {
    // Fix line elements
    if (el.type === 'line') {
      const lineEl = el as Record<string, unknown>;

      // Ensure points field exists with default values
      if (!lineEl.points || !Array.isArray(lineEl.points) || lineEl.points.length !== 2) {
        log.warn(`Line element missing points, adding defaults`);
        lineEl.points = ['', ''] as [string, string]; // Default: no markers on either end
      }

      // Ensure start/end exist
      if (!lineEl.start || !Array.isArray(lineEl.start)) {
        lineEl.start = [el.left ?? 0, el.top ?? 0];
      }
      if (!lineEl.end || !Array.isArray(lineEl.end)) {
        lineEl.end = [(el.left ?? 0) + (el.width ?? 100), (el.top ?? 0) + (el.height ?? 0)];
      }

      // Ensure style exists
      if (!lineEl.style) {
        lineEl.style = 'solid';
      }

      // Ensure color exists
      if (!lineEl.color) {
        lineEl.color = '#333333';
      }

      return lineEl as typeof el;
    }

    // Fix text elements
    if (el.type === 'text') {
      const textEl = el as Record<string, unknown>;

      if (!textEl.defaultFontName) {
        textEl.defaultFontName = 'Microsoft YaHei';
      }
      if (!textEl.defaultColor) {
        textEl.defaultColor = '#333333';
      }
      if (!textEl.content) {
        textEl.content = '';
      }

      if (typeof textEl.content === 'string') {
        textEl.content = sanitizeTextHtmlMetrics(textEl.content);
      }
      if (typeof textEl.lineHeight === 'number') {
        textEl.lineHeight = clampNumber(
          textEl.lineHeight,
          MIN_TEXT_LINE_HEIGHT_RATIO,
          MAX_TEXT_LINE_HEIGHT_RATIO,
        );
      }
      if (typeof textEl.paragraphSpace === 'number') {
        textEl.paragraphSpace = Math.max(0, textEl.paragraphSpace);
      }

      return textEl as typeof el;
    }

    // Fix image elements
    if (el.type === 'image') {
      const imageEl = el as Record<string, unknown>;

      if (imageEl.fixedRatio === undefined) {
        imageEl.fixedRatio = true;
      }

      // Correct dimensions using known aspect ratio (src is still img_id at this point)
      if (assignedImages && typeof imageEl.src === 'string') {
        const imgMeta = assignedImages.find((img) => img.id === imageEl.src);
        if (imgMeta?.width && imgMeta?.height) {
          const knownRatio = imgMeta.width / imgMeta.height;
          const curW = (el.width || 400) as number;
          const curH = (el.height || 300) as number;
          if (Math.abs(curW / curH - knownRatio) / knownRatio > 0.1) {
            // Keep width, correct height
            const newH = Math.round(curW / knownRatio);
            if (newH > 462) {
              // canvas 562.5 - margins 50×2
              const newW = Math.round(462 * knownRatio);
              imageEl.width = newW;
              imageEl.height = 462;
            } else {
              imageEl.height = newH;
            }
          }
        }
      }

      return imageEl as typeof el;
    }

    // Fix shape elements
    if (el.type === 'shape') {
      const shapeEl = el as Record<string, unknown>;

      if (!shapeEl.viewBox) {
        shapeEl.viewBox = `0 0 ${el.width ?? 100} ${el.height ?? 100}`;
      }
      if (!shapeEl.path) {
        // Default to rectangle
        const w = el.width ?? 100;
        const h = el.height ?? 100;
        shapeEl.path = `M0 0 L${w} 0 L${w} ${h} L0 ${h} Z`;
      }
      if (!shapeEl.fill) {
        shapeEl.fill = '#5b9bd5';
      }
      if (shapeEl.fixedRatio === undefined) {
        shapeEl.fixedRatio = false;
      }
      if (shapeEl.text && typeof shapeEl.text === 'object') {
        const nextText = sanitizeTextMetrics(shapeEl.text as Record<string, unknown>);
        if (typeof nextText.content === 'string') {
          nextText.content = sanitizeTextHtmlMetrics(nextText.content);
        }
        shapeEl.text = nextText;
      }

      return shapeEl as typeof el;
    }

    return el;
  });
}

/**
 * Process LaTeX elements: render latex string to HTML using KaTeX.
 * Fills in html and fixedRatio fields.
 * Elements that fail conversion are removed.
 */
function processLatexElements(
  elements: GeneratedSlideData['elements'],
): GeneratedSlideData['elements'] {
  return elements
    .map((el) => {
      if (el.type !== 'latex') return el;

      const latexStr = el.latex as string | undefined;
      if (!latexStr) {
        log.warn('Latex element missing latex string, removing');
        return null;
      }

      try {
        const html = katex.renderToString(latexStr, {
          throwOnError: false,
          displayMode: true,
          output: 'html',
        });

        return {
          ...el,
          html,
          fixedRatio: true,
        };
      } catch (err) {
        log.warn(`Failed to render latex "${latexStr}":`, err);
        return null;
      }
    })
    .filter((el): el is NonNullable<typeof el> => el !== null);
}

const RECT_PATH = 'M 0 0 L 1 0 L 1 1 L 0 1 Z';
const CIRCLE_PATH = 'M 1 0.5 A 0.5 0.5 0 1 1 0 0.5 A 0.5 0.5 0 1 1 1 0.5 Z';
const DEFAULT_FONT = 'Microsoft YaHei';

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function normalizeText(input?: string, maxLen = 240): string {
  const raw = (input || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, maxLen - 1).trimEnd()}…`;
}

function containsLatexLikeMath(text: string): boolean {
  return /\\\(|\\\[|\$\$|\$[^$\n]+?\$|\\\\\(|\\\\\[/.test(text);
}

function estimateVisualTextLength(text: string): number {
  return text
    .replace(/\\\\(?=[()[\]])/g, '\\')
    .replace(/\\\(|\\\)|\\\[|\\\]/g, '')
    .replace(/\$\$/g, '')
    .replace(/\$/g, '')
    .replace(/\\\\/g, '\\')
    .replace(/\\[a-zA-Z]+/g, 'x')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim().length;
}

function estimateWrappedLineCount(
  text: string,
  approxCharsPerLine: number,
  maxLines: number,
): number {
  const source = text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const pieces = source.length > 0 ? source : [text.trim()];

  let lineCount = 0;
  for (const piece of pieces) {
    const normalized = piece.replace(/\s+/g, ' ').trim();
    if (!normalized) continue;
    const visualLength = Math.max(1, estimateVisualTextLength(normalized));
    lineCount += Math.max(1, Math.ceil(visualLength / Math.max(approxCharsPerLine, 1)));
    if (lineCount >= maxLines) return maxLines;
  }

  return Math.max(1, lineCount);
}

function normalizeList(
  items: string[] | undefined,
  fallback: string[] = [],
  maxItems = 4,
  maxLen = 120,
): string[] {
  const base = (items || []).map((item) => normalizeText(item, maxLen)).filter(Boolean);
  const resolved = base.length > 0 ? base : fallback;
  return resolved.slice(0, maxItems);
}

function splitIntoLines(text: string, maxChars = 90, maxLines = 6): string[] {
  const normalized = text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const source = normalized.length > 0 ? normalized : [text.trim()];
  const lines: string[] = [];

  for (const piece of source) {
    let remaining = piece.replace(/\s+/g, ' ').trim();
    if (containsLatexLikeMath(remaining)) {
      lines.push(remaining);
      if (lines.length >= maxLines) break;
      continue;
    }
    while (remaining && lines.length < maxLines) {
      if (remaining.length <= maxChars) {
        lines.push(remaining);
        remaining = '';
        break;
      }
      let splitAt = remaining.lastIndexOf(' ', maxChars);
      if (splitAt < Math.floor(maxChars * 0.55)) splitAt = maxChars;
      lines.push(remaining.slice(0, splitAt).trim());
      remaining = remaining.slice(splitAt).trim();
    }
    if (lines.length >= maxLines) break;
  }

  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    if (!/[.。！？!?…]$/.test(last)) lines[maxLines - 1] = `${last}…`;
  }

  return lines;
}

function toTextHtml(
  lines: string[],
  opts?: {
    fontSize?: number;
    color?: string;
    align?: 'left' | 'center' | 'right';
    bold?: boolean;
    fontFamily?: string;
    lineHeight?: number;
  },
): string {
  const fontSize = opts?.fontSize ?? 16;
  const color = opts?.color ?? '#111827';
  const align = opts?.align ?? 'left';
  const fontWeight = opts?.bold ? '700' : '400';
  const fontFamily = opts?.fontFamily ?? DEFAULT_FONT;
  const lineHeight = opts?.lineHeight ?? 1.38;
  return lines
    .map(
      (line) =>
        `<p style="font-size:${fontSize}px;color:${color};text-align:${align};font-weight:${fontWeight};font-family:${fontFamily};line-height:${lineHeight};">${escapeHtml(line)}</p>`,
    )
    .join('');
}

function toBulletHtml(
  items: string[],
  opts?: {
    fontSize?: number;
    color?: string;
    bulletColor?: string;
    fontFamily?: string;
    lineHeight?: number;
  },
): string {
  const fontSize = opts?.fontSize ?? 16;
  const color = opts?.color ?? '#111827';
  const bulletColor = opts?.bulletColor ?? color;
  const fontFamily = opts?.fontFamily ?? DEFAULT_FONT;
  const lineHeight = opts?.lineHeight ?? 1.42;
  return items
    .map(
      (item) =>
        `<p style="font-size:${fontSize}px;color:${color};font-family:${fontFamily};line-height:${lineHeight};"><span style="color:${bulletColor};font-weight:700;">•</span> ${escapeHtml(item)}</p>`,
    )
    .join('');
}

function toCodeHtml(lines: string[]): string {
  const safeLines = lines.length > 0 ? lines : ['# code excerpt'];
  return safeLines
    .map((line) => {
      const escaped = escapeHtml(line).replace(/ /g, '&nbsp;');
      return `<p style="font-size:14px;color:#e2e8f0;font-family:Menlo, Monaco, Consolas, monospace;line-height:1.42;">${escaped || '&nbsp;'}</p>`;
    })
    .join('');
}

function createTextElement(args: {
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
  content: string;
  defaultColor?: string;
  defaultFontName?: string;
  textType?: PPTTextElement['textType'];
  fill?: string;
}): PPTTextElement {
  return {
    id: `text_${nanoid(8)}`,
    type: 'text',
    name: args.name,
    left: args.left,
    top: args.top,
    width: args.width,
    height: args.height,
    rotate: 0,
    content: args.content,
    defaultFontName: args.defaultFontName ?? DEFAULT_FONT,
    defaultColor: args.defaultColor ?? '#111827',
    textType: args.textType,
    fill: args.fill,
  };
}

function createRectElement(args: {
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fill: string;
  outlineColor?: string;
  outlineWidth?: number;
}): PPTShapeElement {
  return {
    id: `shape_${nanoid(8)}`,
    type: 'shape',
    name: args.name,
    left: args.left,
    top: args.top,
    width: args.width,
    height: args.height,
    rotate: 0,
    viewBox: [1, 1],
    path: RECT_PATH,
    fixedRatio: false,
    fill: args.fill,
    outline: args.outlineColor
      ? {
          color: args.outlineColor,
          width: args.outlineWidth ?? 1,
          style: 'solid',
        }
      : undefined,
  };
}

function createCircleElement(args: {
  name: string;
  left: number;
  top: number;
  size: number;
  fill: string;
}): PPTShapeElement {
  return {
    id: `shape_${nanoid(8)}`,
    type: 'shape',
    name: args.name,
    left: args.left,
    top: args.top,
    width: args.size,
    height: args.size,
    rotate: 0,
    viewBox: [1, 1],
    path: CIRCLE_PATH,
    fixedRatio: false,
    fill: args.fill,
  };
}

function createLineElement(args: {
  name: string;
  start: [number, number];
  end: [number, number];
  color: string;
  width?: number;
}): PPTLineElement {
  return {
    id: `line_${nanoid(8)}`,
    type: 'line',
    name: args.name,
    left: 0,
    top: 0,
    width: args.width ?? 2,
    start: args.start,
    end: args.end,
    style: 'solid',
    color: args.color,
    points: ['', ''],
  };
}

type WorkedExampleConfig = NonNullable<SceneOutline['workedExampleConfig']>;
type WorkedExampleVisualAsset = {
  src: string;
  aspectRatio: number;
  source: 'assigned' | 'generated';
};

function createImageElement(args: {
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
  src: string;
}): PPTImageElement {
  return {
    id: `image_${nanoid(8)}`,
    type: 'image',
    name: args.name,
    left: args.left,
    top: args.top,
    width: args.width,
    height: args.height,
    rotate: 0,
    fixedRatio: true,
    src: args.src,
    radius: 18,
    imageType: 'itemFigure',
    outline: {
      color: '#e5e7eb',
      width: 1,
      style: 'solid',
    },
  };
}

function getWorkedExampleLabels(
  language: 'zh-CN' | 'en-US',
  role: WorkedExampleConfig['role'],
): Record<string, string> {
  const roleLabels =
    language === 'zh-CN'
      ? {
          problem_statement: '题目展示',
          givens_and_goal: '已知与目标',
          constraints: '约束条件',
          solution_plan: '解题思路',
          walkthrough: '分步讲解',
          pitfalls: '易错点',
          summary: '总结收束',
        }
      : {
          problem_statement: 'Problem Statement',
          givens_and_goal: 'Givens and Goal',
          constraints: 'Constraints',
          solution_plan: 'Solution Plan',
          walkthrough: 'Step-by-Step Walkthrough',
          pitfalls: 'Common Pitfalls',
          summary: 'Summary',
        };

  return language === 'zh-CN'
    ? {
        stage: roleLabels[role],
        question: '题目',
        givens: '已知',
        asks: '所求',
        constraints: '约束',
        plan: '思路',
        steps: '步骤',
        pitfalls: '易错点',
        answer: '结论',
        reminder: '题目提醒',
        keyIdea: '关键点',
        correction: '提醒',
        part: '第',
        visual: '图示',
        referenceVisual: '参考图',
        generatedVisual: 'AI 图示',
      }
    : {
        stage: roleLabels[role],
        question: 'Question',
        givens: 'Given',
        asks: 'Find',
        constraints: 'Constraints',
        plan: 'Plan',
        steps: 'Steps',
        pitfalls: 'Pitfalls',
        answer: 'Answer',
        reminder: 'Problem Reminder',
        keyIdea: 'Key Idea',
        correction: 'Watch Out',
        part: 'Part',
        visual: 'Visual',
        referenceVisual: 'Reference Visual',
        generatedVisual: 'AI Visual',
      };
}

function getRolePalette(role: WorkedExampleConfig['role']): {
  accent: string;
  accentSoft: string;
  panel: string;
  panelAlt: string;
  codeBg: string;
} {
  switch (role) {
    case 'problem_statement':
      return {
        accent: '#2563eb',
        accentSoft: '#dbeafe',
        panel: '#eff6ff',
        panelAlt: '#f8fafc',
        codeBg: '#0f172a',
      };
    case 'givens_and_goal':
    case 'constraints':
      return {
        accent: '#0891b2',
        accentSoft: '#cffafe',
        panel: '#ecfeff',
        panelAlt: '#f8fafc',
        codeBg: '#0f172a',
      };
    case 'solution_plan':
      return {
        accent: '#7c3aed',
        accentSoft: '#ede9fe',
        panel: '#f5f3ff',
        panelAlt: '#faf5ff',
        codeBg: '#1f1335',
      };
    case 'pitfalls':
      return {
        accent: '#ea580c',
        accentSoft: '#ffedd5',
        panel: '#fff7ed',
        panelAlt: '#fffbeb',
        codeBg: '#431407',
      };
    case 'summary':
      return {
        accent: '#059669',
        accentSoft: '#d1fae5',
        panel: '#ecfdf5',
        panelAlt: '#f0fdf4',
        codeBg: '#052e16',
      };
    case 'walkthrough':
    default:
      return {
        accent: '#4f46e5',
        accentSoft: '#e0e7ff',
        panel: '#eef2ff',
        panelAlt: '#f8fafc',
        codeBg: '#172554',
      };
  }
}

function buildInfoCard(
  label: string | undefined,
  items: string[],
  layout: { left: number; top: number; width: number; height: number },
  palette: ReturnType<typeof getRolePalette>,
  name: string,
): PPTElement[] {
  const card = createRectElement({
    name: `${name}_card`,
    left: layout.left,
    top: layout.top,
    width: layout.width,
    height: layout.height,
    fill: palette.panelAlt,
    outlineColor: palette.accentSoft,
  });

  // Keep fallback card copy inside the shape text layer, so it remains anchored to the card.
  const labelText = (label || '').trim();
  const headingHtml = labelText
    ? toTextHtml([labelText], {
        fontSize: 16,
        color: palette.accent,
        bold: true,
        lineHeight: 1.34,
      })
    : '';
  card.text = {
    content: [
      headingHtml,
      toBulletHtml(items, {
        fontSize: 15,
        color: '#0f172a',
        bulletColor: palette.accent,
      }),
    ]
      .filter(Boolean)
      .join(''),
    defaultFontName: DEFAULT_FONT,
    defaultColor: '#0f172a',
    align: 'top',
    lineHeight: 1.4,
    paragraphSpace: 6,
    type: 'content',
  };

  return [card];
}

function alignNamedShapeRow(
  elements: PPTElement[],
  shapeNames: string[],
): PPTElement[] {
  const indices = elements
    .map((element, index) => ({ element, index }))
    .filter(
      (item): item is { element: PPTShapeElement; index: number } =>
        item.element.type === 'shape' && shapeNames.includes(item.element.name || ''),
    );
  if (indices.length < 2) return elements;

  const top = Math.min(...indices.map((item) => item.element.top));
  const height = Math.max(...indices.map((item) => item.element.height));

  return elements.map((element) => {
    if (element.type !== 'shape') return element;
    if (!shapeNames.includes(element.name || '')) return element;
    return {
      ...element,
      top,
      height,
    };
  });
}

function alignFallbackCardRows(elements: PPTElement[]): PPTElement[] {
  const rows: string[][] = [
    ['fallback_keypoints_card', 'fallback_takeaway_card'],
    ['summary_takeaways_card', 'summary_pitfalls_card'],
  ];

  return rows.reduce((acc, rowNames) => alignNamedShapeRow(acc, rowNames), elements);
}

function getAspectRatioValue(ratio?: '16:9' | '4:3' | '1:1' | '9:16' | '3:4' | '21:9'): number {
  switch (ratio) {
    case '4:3':
      return 4 / 3;
    case '1:1':
      return 1;
    case '9:16':
      return 9 / 16;
    case '3:4':
      return 3 / 4;
    case '21:9':
      return 21 / 9;
    case '16:9':
    default:
      return 16 / 9;
  }
}

function fitWithinBox(
  maxWidth: number,
  maxHeight: number,
  aspectRatio: number,
): { width: number; height: number } {
  const safeAspectRatio =
    Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : getAspectRatioValue('16:9');
  const widthFromHeight = maxHeight * safeAspectRatio;

  if (widthFromHeight <= maxWidth) {
    return {
      width: Math.round(widthFromHeight),
      height: Math.round(maxHeight),
    };
  }

  return {
    width: Math.round(maxWidth),
    height: Math.round(maxWidth / safeAspectRatio),
  };
}

function selectWorkedExampleVisualAsset(
  outline: SceneOutline,
  assignedImages?: PdfImage[],
  imageMapping?: ImageMapping,
  generatedMediaMapping?: ImageMapping,
): WorkedExampleVisualAsset | null {
  for (const image of assignedImages || []) {
    const resolvedSrc = imageMapping?.[image.id] || image.src;
    if (!resolvedSrc) continue;

    return {
      src: resolvedSrc,
      aspectRatio:
        image.width && image.height && image.height > 0 ? image.width / image.height : 4 / 3,
      source: 'assigned',
    };
  }

  const generatedImage = outline.mediaGenerations?.find((media) => media.type === 'image');
  if (!generatedImage) return null;

  return {
    src: generatedMediaMapping?.[generatedImage.elementId] || generatedImage.elementId,
    aspectRatio: getAspectRatioValue(generatedImage.aspectRatio),
    source: 'generated',
  };
}

function buildWorkedExampleVisualPanel(
  label: string,
  asset: WorkedExampleVisualAsset,
  layout: { left: number; top: number; width: number; height: number },
  palette: ReturnType<typeof getRolePalette>,
  name: string,
): PPTElement[] {
  const imageFrame = fitWithinBox(layout.width - 32, layout.height - 64, asset.aspectRatio);
  const imageLeft = layout.left + 16 + Math.round((layout.width - 32 - imageFrame.width) / 2);
  const imageTop = layout.top + 42 + Math.round((layout.height - 64 - imageFrame.height) / 2);

  return [
    createRectElement({
      name: `${name}_panel`,
      left: layout.left,
      top: layout.top,
      width: layout.width,
      height: layout.height,
      fill: '#ffffff',
      outlineColor: palette.accentSoft,
    }),
    createTextElement({
      name: `${name}_label`,
      left: layout.left + 16,
      top: layout.top + 12,
      width: layout.width - 32,
      height: 22,
      content: toTextHtml([label], {
        fontSize: 15,
        color: palette.accent,
        bold: true,
      }),
      defaultColor: palette.accent,
      textType: 'itemTitle',
    }),
    createImageElement({
      name: `${name}_image`,
      left: imageLeft,
      top: imageTop,
      width: imageFrame.width,
      height: imageFrame.height,
      src: asset.src,
    }),
  ];
}

function looksLikeRichMathNotation(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;

  return (
    /\\(begin|end|frac|sqrt|sum|int|lim|alpha|beta|gamma|theta|pi|cdot|times|left|right|pmatrix|bmatrix|matrix|cases|infty)/.test(
      normalized,
    ) ||
    /\^\{|\_\{/.test(normalized) ||
    /[∑∫√∞≈≠≤≥→←↦∀∃∈∉⊂⊆∪∩]/.test(normalized)
  );
}

function looksLikeStructuredCode(text: string): boolean {
  const normalized = text.replace(/\r/g, '');
  if (!normalized.trim()) return false;
  if (/```/.test(normalized)) return true;

  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 3) return false;

  let signalCount = 0;
  for (const line of lines.slice(0, 8)) {
    if (
      /\b(function|const|let|var|return|def|class|public|private|if|else|elif|for|while|switch|case|try|catch|import|from|print|console\.log)\b|=>|[{};]/.test(
        line,
      )
    ) {
      signalCount++;
    }
  }

  return signalCount >= 2;
}

function looksLikePlaceholderWorkedExampleText(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;

  return [
    /^给定(一个|某个|若干|两个|一组)/,
    /^计算(一个|某个|两个|给定的?)/,
    /^请(写出|判断|计算|证明)/,
    /^对.+做/,
    /^继续/,
    /^根据.+(判断|说明)/,
    /^确认/,
    /^检查/,
    /^汇总/,
    /^分别计算/,
    /^Determine\b/i,
    /^Given\s+(a|an|some|two|the)\b/i,
    /^Compute\b/i,
    /^Check\b/i,
    /^Write\b/i,
    /^Apply\b/i,
    /^Continue\b/i,
    /^Based on\b/i,
  ].some((pattern) => pattern.test(normalized));
}

function looksLikeConcreteQuantitativeDetail(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;

  return (
    looksLikeRichMathNotation(normalized) ||
    (/\d/.test(normalized) && /[A-Za-z\u4e00-\u9fff]/.test(normalized)) ||
    /[\[\]{}|]/.test(normalized) ||
    /[=+\-*/]/.test(normalized) ||
    /\b([xyzabcn]|x_\d|y_\d|z_\d|a_\d|b_\d|c_\d)\b/i.test(normalized) ||
    /(矩阵|增广矩阵|方程组|主元|自由变量|row operation|pivot|free variable|matrix|equation|RREF|Gaussian)/i.test(
      normalized,
    )
  );
}

function looksLikeQuantitativeWorkedExampleTopic(text: string): boolean {
  return /(矩阵|线性系统|方程组|消元|高斯|RREF|乘法|matrix|linear system|equation|elimination|gaussian|row reduction)/i.test(
    text,
  );
}

function shouldUseLocalWorkedExampleTemplate(outline: SceneOutline): boolean {
  const cfg = outline.workedExampleConfig;
  if (!cfg) return false;

  const textBlocks = [
    cfg.problemStatement,
    ...(cfg.givens || []),
    ...(cfg.asks || []),
    ...(cfg.constraints || []),
    ...(cfg.solutionPlan || []),
    ...(cfg.walkthroughSteps || []),
    ...(cfg.commonPitfalls || []),
    cfg.finalAnswer,
  ].filter((item): item is string => typeof item === 'string' && item.trim().length > 0);

  if (textBlocks.some((text) => looksLikeRichMathNotation(text))) {
    return false;
  }

  if (!cfg.codeSnippet?.trim() && textBlocks.some((text) => looksLikeStructuredCode(text))) {
    return false;
  }

  const topicText = [
    outline.title,
    outline.description,
    ...(outline.keyPoints || []),
    ...textBlocks,
  ].join(' ');
  const walkthroughSteps = (cfg.walkthroughSteps || []).filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0,
  );
  const quantitativeTopic =
    cfg.kind === 'math' || looksLikeQuantitativeWorkedExampleTopic(topicText);

  if (cfg.role === 'problem_statement') {
    const statement = cfg.problemStatement?.trim() || '';
    if (!statement) return false;
    if (looksLikePlaceholderWorkedExampleText(statement)) return false;
    if (quantitativeTopic && !looksLikeConcreteQuantitativeDetail(statement)) return false;
  }

  if (cfg.role === 'walkthrough') {
    if (walkthroughSteps.length === 0) return false;

    const detailedSteps = walkthroughSteps.filter(
      (step) =>
        !looksLikePlaceholderWorkedExampleText(step) &&
        (!quantitativeTopic || looksLikeConcreteQuantitativeDetail(step)),
    );

    if (detailedSteps.length < Math.min(2, walkthroughSteps.length)) {
      return false;
    }
  }

  return true;
}

function buildWorkedExampleSlideContent(
  outline: SceneOutline,
  options?: {
    assignedImages?: PdfImage[];
    imageMapping?: ImageMapping;
    generatedMediaMapping?: ImageMapping;
  },
): GeneratedSlideContent | null {
  const cfg = outline.workedExampleConfig;
  if (!cfg) return null;

  const lang = outline.language || 'zh-CN';
  const labels = getWorkedExampleLabels(lang, cfg.role);
  const palette = getRolePalette(cfg.role);

  const problemText = normalizeText(
    cfg.problemStatement || outline.description || outline.keyPoints.join(' '),
    720,
  );
  const givens = normalizeList(cfg.givens, outline.keyPoints.slice(0, 3), 4, 90);
  const asks = normalizeList(
    cfg.asks,
    [lang === 'zh-CN' ? '明确本题最终要求' : 'Clarify what must be solved or shown'],
    3,
    90,
  );
  const constraints = normalizeList(
    cfg.constraints,
    [lang === 'zh-CN' ? '关注题目中的关键条件' : 'Track the key constraints carefully'],
    4,
    90,
  );
  const solutionPlan = normalizeList(cfg.solutionPlan, outline.keyPoints, 4, 96);
  const walkthroughSteps = normalizeList(
    cfg.walkthroughSteps,
    solutionPlan.length > 0
      ? solutionPlan
      : [
          lang === 'zh-CN'
            ? '按照题目条件逐步推进'
            : 'Advance step by step from the given information',
        ],
    5,
    108,
  );
  const commonPitfalls = normalizeList(
    cfg.commonPitfalls,
    [lang === 'zh-CN' ? '不要跳步或忽略关键条件' : 'Do not skip steps or ignore key conditions'],
    4,
    100,
  );
  const finalAnswer = normalizeText(cfg.finalAnswer || outline.description, 220);
  const codeLines = cfg.codeSnippet?.trim()
    ? cfg.codeSnippet
        .replace(/\r/g, '')
        .split('\n')
        .slice(0, 11)
        .map((line) => line.replace(/\t/g, '  '))
    : [];
  const visualAsset = selectWorkedExampleVisualAsset(
    outline,
    options?.assignedImages,
    options?.imageMapping,
    options?.generatedMediaMapping,
  );

  const badgeText =
    cfg.partNumber && cfg.totalParts
      ? lang === 'zh-CN'
        ? `${labels.stage} · ${cfg.partNumber}/${cfg.totalParts}`
        : `${labels.stage} · ${labels.part} ${cfg.partNumber}/${cfg.totalParts}`
      : labels.stage;

  const elements: PPTElement[] = [
    createRectElement({
      name: 'top_accent',
      left: 0,
      top: 0,
      width: 1000,
      height: 8,
      fill: palette.accent,
    }),
    createTextElement({
      name: 'slide_title',
      left: 56,
      top: 30,
      width: 660,
      height: 52,
      content: toTextHtml(splitIntoLines(outline.title, 34, 2), {
        fontSize: 30,
        color: '#0f172a',
        bold: true,
      }),
      defaultColor: '#0f172a',
      textType: 'title',
    }),
    createRectElement({
      name: 'stage_badge_bg',
      left: 736,
      top: 36,
      width: 212,
      height: 34,
      fill: palette.accentSoft,
    }),
    createTextElement({
      name: 'stage_badge_text',
      left: 748,
      top: 43,
      width: 188,
      height: 20,
      content: toTextHtml([badgeText], {
        fontSize: 13,
        color: palette.accent,
        align: 'center',
        bold: true,
      }),
      defaultColor: palette.accent,
      textType: 'notes',
    }),
    createLineElement({
      name: 'header_rule',
      start: [56, 86],
      end: [944, 86],
      color: '#e5e7eb',
      width: 2,
    }),
  ];

  if (cfg.role === 'problem_statement') {
    const hasCode = codeLines.length > 0;
    const showVisual = !hasCode && !!visualAsset;
    const problemWidth = hasCode ? 472 : showVisual ? 544 : 896;
    const problemFontSize = hasCode ? 16 : 17;
    const problemLineHeight = 1.42;
    const problemLineEstimate = estimateWrappedLineCount(
      problemText,
      hasCode ? 38 : showVisual ? 50 : 72,
      hasCode ? 8 : 7,
    );
    const problemTextHeight = Math.max(
      hasCode ? 120 : 44,
      Math.round(problemLineEstimate * problemFontSize * problemLineHeight + 8),
    );
    const problemPanelHeight = hasCode
      ? 248
      : showVisual
        ? Math.max(148, Math.min(210, problemTextHeight + 58))
        : Math.max(118, Math.min(210, problemTextHeight + 58));
    const problemRowHeight = Math.max(problemPanelHeight, hasCode ? 248 : 0, showVisual ? 210 : 0);
    const detailCardsTop = 108 + problemRowHeight + 24;
    const cards = [
      { label: labels.givens, items: givens },
      { label: labels.asks, items: asks },
      { label: labels.constraints, items: constraints },
    ].filter((section) => section.items.length > 0);

    elements.push(
      createRectElement({
        name: 'problem_statement_panel',
        left: 52,
        top: 108,
        width: problemWidth,
        height: problemPanelHeight,
        fill: palette.panel,
        outlineColor: palette.accentSoft,
      }),
      createTextElement({
        name: 'problem_statement_label',
        left: 72,
        top: 126,
        width: problemWidth - 40,
        height: 24,
        content: toTextHtml([labels.question], {
          fontSize: 17,
          color: palette.accent,
          bold: true,
        }),
        defaultColor: palette.accent,
        textType: 'itemTitle',
      }),
      createTextElement({
        name: 'problem_statement_text',
        left: 72,
        top: 158,
        width: problemWidth - 40,
        height: problemPanelHeight - 60,
        content: toTextHtml(splitIntoLines(problemText, hasCode ? 42 : 88, hasCode ? 8 : 7), {
          fontSize: problemFontSize,
          color: '#0f172a',
          lineHeight: problemLineHeight,
        }),
        defaultColor: '#0f172a',
        textType: 'content',
      }),
    );

    if (showVisual && visualAsset) {
      elements.push(
        ...buildWorkedExampleVisualPanel(
          visualAsset.source === 'generated' ? labels.generatedVisual : labels.referenceVisual,
          visualAsset,
          { left: 620, top: 108, width: 328, height: problemRowHeight },
          palette,
          'problem_visual',
        ),
      );
    }

    if (hasCode) {
      elements.push(
        createRectElement({
          name: 'code_excerpt_panel',
          left: 544,
          top: 108,
          width: 404,
          height: 248,
          fill: palette.codeBg,
        }),
        createTextElement({
          name: 'code_excerpt_label',
          left: 562,
          top: 126,
          width: 368,
          height: 22,
          content: toTextHtml([lang === 'zh-CN' ? '代码片段' : 'Code Excerpt'], {
            fontSize: 16,
            color: '#c7d2fe',
            bold: true,
          }),
          defaultColor: '#c7d2fe',
          textType: 'itemTitle',
        }),
        createTextElement({
          name: 'code_excerpt_text',
          left: 562,
          top: 156,
          width: 368,
          height: 178,
          content: toCodeHtml(codeLines),
          defaultColor: '#e2e8f0',
          defaultFontName: 'Menlo, Monaco, Consolas, monospace',
          textType: 'content',
        }),
      );
    }

    if (cards.length > 0) {
      const widths = cards.length === 1 ? [896] : cards.length === 2 ? [436, 436] : [284, 284, 284];
      const lefts = cards.length === 1 ? [52] : cards.length === 2 ? [52, 512] : [52, 360, 668];
      cards.forEach((card, idx) => {
        elements.push(
          ...buildInfoCard(
            card.label,
            card.items,
            {
              left: lefts[idx],
              top: detailCardsTop,
              width: widths[idx],
              height: hasCode ? 130 : 162,
            },
            palette,
            `${card.label.toLowerCase().replace(/\s+/g, '_')}_${idx}`,
          ),
        );
      });
    }
  } else if (cfg.role === 'givens_and_goal' || cfg.role === 'constraints') {
    const showVisual = !!visualAsset;
    elements.push(
      createRectElement({
        name: 'problem_reminder_panel',
        left: 52,
        top: 108,
        width: showVisual ? 560 : 896,
        height: showVisual ? 94 : 82,
        fill: palette.panel,
        outlineColor: palette.accentSoft,
      }),
      createTextElement({
        name: 'problem_reminder_label',
        left: 72,
        top: 124,
        width: 180,
        height: 22,
        content: toTextHtml([labels.reminder], {
          fontSize: 16,
          color: palette.accent,
          bold: true,
        }),
        defaultColor: palette.accent,
        textType: 'itemTitle',
      }),
      createTextElement({
        name: 'problem_reminder_text',
        left: 72,
        top: 150,
        width: showVisual ? 520 : 856,
        height: showVisual ? 38 : 28,
        content: toTextHtml(
          splitIntoLines(problemText, showVisual ? 72 : 120, showVisual ? 2 : 1),
          {
            fontSize: 15,
            color: '#334155',
          },
        ),
        defaultColor: '#334155',
        textType: 'content',
      }),
    );

    if (showVisual && visualAsset) {
      elements.push(
        ...buildWorkedExampleVisualPanel(
          visualAsset.source === 'generated' ? labels.generatedVisual : labels.referenceVisual,
          visualAsset,
          { left: 636, top: 108, width: 312, height: 170 },
          palette,
          'reminder_visual',
        ),
      );
    }

    const sections =
      cfg.role === 'constraints'
        ? [
            { label: labels.givens, items: givens },
            { label: labels.constraints, items: constraints },
            { label: labels.asks, items: asks },
          ]
        : [
            { label: labels.givens, items: givens },
            { label: labels.asks, items: asks },
            { label: labels.constraints, items: constraints },
          ];
    const lefts = [52, 360, 668];
    sections.forEach((section, idx) => {
      elements.push(
        ...buildInfoCard(
          section.label,
          section.items,
          {
            left: lefts[idx],
            top: showVisual ? 228 : 216,
            width: 280,
            height: showVisual ? 264 : 276,
          },
          palette,
          `${section.label.toLowerCase().replace(/\s+/g, '_')}_${idx}`,
        ),
      );
    });
  } else if (cfg.role === 'solution_plan') {
    elements.push(
      createRectElement({
        name: 'problem_reminder_panel',
        left: 52,
        top: 108,
        width: 896,
        height: 70,
        fill: palette.panel,
        outlineColor: palette.accentSoft,
      }),
      createTextElement({
        name: 'problem_reminder_text',
        left: 72,
        top: 128,
        width: 856,
        height: 26,
        content: toTextHtml(splitIntoLines(problemText, 116, 1), {
          fontSize: 15,
          color: '#334155',
        }),
        defaultColor: '#334155',
        textType: 'content',
      }),
    );

    solutionPlan.slice(0, 4).forEach((step, idx) => {
      const top = 198 + idx * 82;
      elements.push(
        createCircleElement({
          name: `plan_step_number_${idx + 1}`,
          left: 70,
          top,
          size: 36,
          fill: palette.accent,
        }),
        createTextElement({
          name: `plan_step_number_text_${idx + 1}`,
          left: 78,
          top: top + 6,
          width: 20,
          height: 20,
          content: toTextHtml([String(idx + 1)], {
            fontSize: 16,
            color: '#ffffff',
            align: 'center',
            bold: true,
          }),
          defaultColor: '#ffffff',
          textType: 'itemNumber',
        }),
        createRectElement({
          name: `solution_plan_card_${idx + 1}`,
          left: 124,
          top: top - 6,
          width: 804,
          height: 56,
          fill: idx % 2 === 0 ? palette.panel : palette.panelAlt,
          outlineColor: palette.accentSoft,
        }),
        createTextElement({
          name: `solution_plan_text_${idx + 1}`,
          left: 146,
          top: top + 8,
          width: 760,
          height: 28,
          content: toTextHtml(splitIntoLines(step, 90, 2), {
            fontSize: 17,
            color: '#0f172a',
            lineHeight: 1.36,
          }),
          defaultColor: '#0f172a',
          textType: 'content',
        }),
      );
    });
  } else if (cfg.role === 'walkthrough') {
    const hasCode = codeLines.length > 0;
    elements.push(
      createRectElement({
        name: 'givens_goal_strip',
        left: 52,
        top: 108,
        width: 896,
        height: 70,
        fill: palette.panel,
        outlineColor: palette.accentSoft,
      }),
      createTextElement({
        name: 'givens_goal_strip_text',
        left: 72,
        top: 128,
        width: 856,
        height: 26,
        content: toTextHtml(
          [
            lang === 'zh-CN'
              ? `目标：${asks[0] || problemText}`
              : `Goal: ${asks[0] || problemText}`,
          ],
          {
            fontSize: 15,
            color: '#334155',
          },
        ),
        defaultColor: '#334155',
        textType: 'content',
      }),
    );

    if (hasCode) {
      elements.push(
        createRectElement({
          name: 'walkthrough_steps_panel',
          left: 52,
          top: 198,
          width: 392,
          height: 300,
          fill: palette.panelAlt,
          outlineColor: palette.accentSoft,
        }),
        createTextElement({
          name: 'walkthrough_steps_label',
          left: 70,
          top: 216,
          width: 356,
          height: 22,
          content: toTextHtml([labels.steps], {
            fontSize: 16,
            color: palette.accent,
            bold: true,
          }),
          defaultColor: palette.accent,
          textType: 'itemTitle',
        }),
        createTextElement({
          name: 'walkthrough_steps_text',
          left: 70,
          top: 244,
          width: 356,
          height: 230,
          content: toBulletHtml(walkthroughSteps, {
            fontSize: 15,
            color: '#0f172a',
            bulletColor: palette.accent,
          }),
          defaultColor: '#0f172a',
          textType: 'content',
        }),
        createRectElement({
          name: 'code_excerpt_panel',
          left: 468,
          top: 198,
          width: 480,
          height: 300,
          fill: palette.codeBg,
        }),
        createTextElement({
          name: 'code_excerpt_label',
          left: 488,
          top: 216,
          width: 440,
          height: 22,
          content: toTextHtml([lang === 'zh-CN' ? '当前代码' : 'Current Code'], {
            fontSize: 16,
            color: '#c7d2fe',
            bold: true,
          }),
          defaultColor: '#c7d2fe',
          textType: 'itemTitle',
        }),
        createTextElement({
          name: 'code_excerpt_text',
          left: 488,
          top: 246,
          width: 440,
          height: 226,
          content: toCodeHtml(codeLines),
          defaultColor: '#e2e8f0',
          defaultFontName: 'Menlo, Monaco, Consolas, monospace',
          textType: 'content',
        }),
      );
    } else {
      walkthroughSteps.slice(0, 4).forEach((step, idx) => {
        const top = 198 + idx * 78;
        elements.push(
          createRectElement({
            name: `walkthrough_step_card_${idx + 1}`,
            left: 64,
            top,
            width: 872,
            height: 58,
            fill: idx % 2 === 0 ? palette.panelAlt : palette.panel,
            outlineColor: palette.accentSoft,
          }),
          createTextElement({
            name: `walkthrough_step_text_${idx + 1}`,
            left: 84,
            top: top + 15,
            width: 832,
            height: 28,
            content: toTextHtml([`${lang === 'zh-CN' ? '步骤' : 'Step'} ${idx + 1}: ${step}`], {
              fontSize: 16,
              color: '#0f172a',
              lineHeight: 1.36,
            }),
            defaultColor: '#0f172a',
            textType: 'content',
          }),
        );
      });
    }
  } else if (cfg.role === 'pitfalls') {
    const leftItems = commonPitfalls.filter((_, idx) => idx % 2 === 0);
    const rightItems = commonPitfalls.filter((_, idx) => idx % 2 === 1);
    elements.push(
      ...buildInfoCard(
        labels.pitfalls,
        leftItems.length > 0 ? leftItems : commonPitfalls.slice(0, 2),
        { left: 52, top: 118, width: 428, height: 284 },
        palette,
        'pitfalls_left',
      ),
      ...buildInfoCard(
        lang === 'zh-CN' ? '纠正提醒' : 'Corrections',
        rightItems.length > 0
          ? rightItems
          : solutionPlan
              .slice(0, 2)
              .map((item) => (lang === 'zh-CN' ? `改进建议：${item}` : `Correction: ${item}`)),
        { left: 520, top: 118, width: 428, height: 284 },
        palette,
        'pitfalls_right',
      ),
      createRectElement({
        name: 'pitfalls_footer_panel',
        left: 52,
        top: 428,
        width: 896,
        height: 84,
        fill: palette.panel,
        outlineColor: palette.accentSoft,
      }),
      createTextElement({
        name: 'pitfalls_footer_text',
        left: 72,
        top: 450,
        width: 856,
        height: 40,
        content: toTextHtml(
          [
            lang === 'zh-CN'
              ? `讲题时重点提醒：${commonPitfalls[0] || '先核对条件，再推进步骤。'}`
              : `Teaching focus: ${commonPitfalls[0] || 'Check the conditions before moving to the next step.'}`,
          ],
          {
            fontSize: 16,
            color: '#7c2d12',
          },
        ),
        defaultColor: '#7c2d12',
        textType: 'notes',
      }),
    );
  } else {
    elements.push(
      createRectElement({
        name: 'final_answer_panel',
        left: 52,
        top: 114,
        width: 896,
        height: 118,
        fill: palette.panel,
        outlineColor: palette.accentSoft,
      }),
      createTextElement({
        name: 'final_answer_label',
        left: 72,
        top: 134,
        width: 140,
        height: 22,
        content: toTextHtml([labels.answer], {
          fontSize: 16,
          color: palette.accent,
          bold: true,
        }),
        defaultColor: palette.accent,
        textType: 'itemTitle',
      }),
      createTextElement({
        name: 'final_answer_text',
        left: 72,
        top: 166,
        width: 856,
        height: 44,
        content: toTextHtml(splitIntoLines(finalAnswer, 110, 2), {
          fontSize: 20,
          color: '#0f172a',
          bold: true,
          lineHeight: 1.32,
        }),
        defaultColor: '#0f172a',
        textType: 'content',
      }),
      ...buildInfoCard(
        lang === 'zh-CN' ? '关键收获' : 'Key Takeaways',
        solutionPlan.length > 0 ? solutionPlan : walkthroughSteps,
        { left: 52, top: 264, width: 428, height: 236 },
        palette,
        'summary_takeaways',
      ),
      ...buildInfoCard(
        labels.pitfalls,
        commonPitfalls,
        { left: 520, top: 264, width: 428, height: 236 },
        palette,
        'summary_pitfalls',
      ),
    );
  }

  return {
    elements: alignFallbackCardRows(elements),
    background: { type: 'solid', color: '#fcfcfd' },
    remark: outline.description,
  };
}

function shouldUseSemanticSlideGeneration(
  outline: SceneOutline,
  assignedImages?: PdfImage[],
): boolean {
  if (assignedImages && assignedImages.length > 0) return false;
  if (outline.mediaGenerations && outline.mediaGenerations.length > 0) return false;
  return true;
}

function extractNotebookContentDocumentFromResponse(
  response: string,
): NotebookContentDocument | null {
  const parsed = parseJsonResponse<unknown>(response);
  if (!parsed || typeof parsed !== 'object') return null;

  const direct = parseNotebookContentDocument(parsed);
  if (direct) return direct;

  const wrapped = parseNotebookContentDocument(
    (parsed as { contentDocument?: unknown }).contentDocument,
  );
  return wrapped;
}

function normalizeColumnLayoutBlocks(document: NotebookContentDocument): NotebookContentDocument {
  const nextBlocks = document.blocks.flatMap<NotebookContentDocument['blocks'][number]>((block) => {
    if (block.type !== 'process_flow' || block.context.length === 0) {
      return [block];
    }

    const layoutCards: NotebookContentDocument['blocks'][number] = {
      type: 'layout_cards',
      columns: block.context.length === 4 ? 4 : block.context.length >= 3 ? 3 : 2,
      items: block.context.map((item) => ({
        title: item.label,
        text: item.text,
        tone: item.tone,
      })),
      templateId: block.templateId,
      titleTone: block.titleTone,
      cardTitle: document.language === 'en-US' ? 'Context Cards' : '关键信息卡',
      placement: block.placement,
    };

    return [
      layoutCards,
      {
        ...block,
        context: [],
      },
    ];
  });

  return {
    ...document,
    blocks: nextBlocks,
  };
}

function normalizeGridPlacementHints(document: NotebookContentDocument): NotebookContentDocument {
  if (document.layout.mode !== 'grid') return document;
  const maxRows = document.layout.rows ?? 3;
  const maxCols = document.layout.columns;

  const normalizedBlocks = document.blocks.map((block, index) => {
    const placement = block.placement;
    if (!placement) {
      return { ...block, placement: { order: index } };
    }

    const rowSpan = Math.max(1, Math.min(maxRows, placement.rowSpan ?? 1));
    const colSpan = Math.max(1, Math.min(maxCols, placement.colSpan ?? 1));
    const keepExplicitAnchor = rowSpan > 1 || colSpan > 1;
    const nextPlacement: NotebookContentBlockPlacement = {
      order: typeof placement.order === 'number' ? placement.order : index,
      rowSpan,
      colSpan,
    };
    if (keepExplicitAnchor) {
      nextPlacement.row = placement.row;
      nextPlacement.col = placement.col;
    }

    return {
      ...block,
      placement: nextPlacement,
    };
  });

  return {
    ...document,
    blocks: normalizedBlocks,
  };
}

function pickDeterministicTemplateVariant(outline: SceneOutline, variantCount: number): number {
  if (variantCount <= 1) return 0;
  const seed = `${outline.id}:${outline.title}:${outline.order}:${outline.archetype || ''}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % variantCount;
}

function normalizeKeyPointsForTemplate(
  outline: SceneOutline,
  language: 'zh-CN' | 'en-US',
): string[] {
  const compact = (outline.keyPoints || []).map((item) => item.trim()).filter(Boolean);
  if (compact.length > 0) return compact.slice(0, 6);
  return language === 'en-US'
    ? ['Review the key idea and explain why it matters.', 'State one practical takeaway.']
    : ['回顾本页关键概念并说明意义。', '给出一条可直接应用的结论。'];
}

function toTemplateFlowSteps(
  points: string[],
  language: 'zh-CN' | 'en-US',
): Array<{ title: string; detail: string }> {
  const sliced = points.slice(0, 4);
  const enriched =
    sliced.length >= 2
      ? sliced
      : language === 'en-US'
        ? ['Introduce the concept scope.', 'Summarize how to apply it.']
        : ['明确概念边界。', '总结如何应用。'];
  return enriched.map((item, index) => ({
    title: language === 'en-US' ? `Step ${index + 1}` : `步骤 ${index + 1}`,
    detail: item,
  }));
}

function buildIntroTemplateDocument(
  outline: SceneOutline,
  language: 'zh-CN' | 'en-US',
  variant: number,
): NotebookContentDocument | null {
  const points = normalizeKeyPointsForTemplate(outline, language);
  const objective =
    outline.teachingObjective?.trim() ||
    (language === 'en-US'
      ? 'Clarify the lesson scope, key objective, and study path.'
      : '明确本节范围、学习目标与推进路径。');

  const titlePalette = [
    { text: '#0f172a', bg: '#eff6ff', border: '#bfdbfe' },
    { text: '#312e81', bg: '#eef2ff', border: '#c7d2fe' },
    { text: '#065f46', bg: '#ecfdf5', border: '#a7f3d0' },
  ][variant] || { text: '#0f172a', bg: '#eff6ff', border: '#bfdbfe' };

  const candidate: unknown =
    variant === 0
      ? {
          version: 1,
          language,
          profile: outline.contentProfile || 'general',
          archetype: 'intro',
          layout: { mode: 'stack' },
          pattern: 'auto',
          title: outline.title,
          titleTextColor: titlePalette.text,
          titleBackgroundColor: titlePalette.bg,
          titleBorderColor: titlePalette.border,
          blocks: [
            {
              type: 'paragraph',
              text: outline.description,
              templateId: 'infoCard',
              cardTitle: language === 'en-US' ? 'Why This Unit' : '本单元定位',
              titleTone: 'accent',
            },
            {
              type: 'bullet_list',
              items: points,
              templateId: 'accentCard',
              cardTitle: language === 'en-US' ? 'Learning Roadmap' : '学习路线',
              titleTone: 'accent',
            },
            {
              type: 'callout',
              tone: 'tip',
              title: language === 'en-US' ? 'Target' : '学习目标',
              text: objective,
              templateId: 'successCard',
            },
          ],
        }
      : variant === 1
        ? {
            version: 1,
            language,
            profile: outline.contentProfile || 'general',
            archetype: 'intro',
            layout: { mode: 'grid', columns: 2, rows: 2 },
            pattern: 'multi_column_cards',
            title: outline.title,
            titleTextColor: titlePalette.text,
            titleBackgroundColor: titlePalette.bg,
            titleBorderColor: titlePalette.border,
            blocks: [
              {
                type: 'paragraph',
                text: outline.description,
                templateId: 'infoCard',
                cardTitle: language === 'en-US' ? 'Scope' : '主题范围',
                titleTone: 'accent',
                placement: { row: 1, col: 1, order: 0 },
              },
              {
                type: 'bullet_list',
                items: points.slice(0, 3),
                templateId: 'accentCard',
                cardTitle: language === 'en-US' ? 'Core Points' : '核心要点',
                titleTone: 'accent',
                placement: { row: 1, col: 2, order: 1 },
              },
              {
                type: 'process_flow',
                orientation: 'horizontal',
                context: [],
                steps: toTemplateFlowSteps(points, language),
                summary: language === 'en-US' ? 'Follow this sequence in class.' : '按此顺序推进课堂讲解。',
                templateId: 'warningCard',
                cardTitle: language === 'en-US' ? 'Class Flow' : '课堂推进顺序',
                titleTone: 'accent',
                placement: { row: 2, col: 1, colSpan: 2, order: 2 },
              },
            ],
          }
        : {
            version: 1,
            language,
            profile: outline.contentProfile || 'general',
            archetype: 'intro',
            layout: { mode: 'stack' },
            pattern: 'flow_vertical',
            title: outline.title,
            titleTextColor: titlePalette.text,
            titleBackgroundColor: titlePalette.bg,
            titleBorderColor: titlePalette.border,
            blocks: [
              {
                type: 'process_flow',
                orientation: 'vertical',
                context: [
                  {
                    label: language === 'en-US' ? 'Unit Goal' : '单元目标',
                    text: objective,
                    tone: 'info',
                  },
                ],
                steps: toTemplateFlowSteps(points, language),
                summary:
                  language === 'en-US'
                    ? 'Keep definitions, reasoning path, and takeaways connected.'
                    : '保持定义、推理路径与结论回收的一致性。',
                templateId: 'accentCard',
                cardTitle: language === 'en-US' ? 'How We Will Learn' : '本节学习节奏',
                titleTone: 'accent',
              },
            ],
          };

  return parseNotebookContentDocument(candidate);
}

function buildSummaryTemplateDocument(
  outline: SceneOutline,
  language: 'zh-CN' | 'en-US',
  variant: number,
): NotebookContentDocument | null {
  const points = normalizeKeyPointsForTemplate(outline, language);
  const objective =
    outline.teachingObjective?.trim() ||
    (language === 'en-US'
      ? 'Connect key conclusions and provide a practical review checklist.'
      : '回收关键结论并形成可执行的复习清单。');

  const titlePalette = [
    { text: '#0f172a', bg: '#eff6ff', border: '#bfdbfe' },
    { text: '#7c2d12', bg: '#fff7ed', border: '#fdba74' },
    { text: '#1e1b4b', bg: '#eef2ff', border: '#c7d2fe' },
  ][variant] || { text: '#0f172a', bg: '#eff6ff', border: '#bfdbfe' };

  const candidate: unknown =
    variant === 0
      ? {
          version: 1,
          language,
          profile: outline.contentProfile || 'general',
          archetype: 'summary',
          layout: { mode: 'grid', columns: 2, rows: 2 },
          pattern: 'multi_column_cards',
          title: outline.title,
          titleTextColor: titlePalette.text,
          titleBackgroundColor: titlePalette.bg,
          titleBorderColor: titlePalette.border,
          blocks: [
            {
              type: 'bullet_list',
              items: points.slice(0, 3),
              templateId: 'successCard',
              cardTitle: language === 'en-US' ? 'Key Conclusions' : '核心结论',
              titleTone: 'accent',
              placement: { row: 1, col: 1, order: 0 },
            },
            {
              type: 'callout',
              tone: 'tip',
              title: language === 'en-US' ? 'Review Target' : '复习目标',
              text: objective,
              templateId: 'warningCard',
              placement: { row: 1, col: 2, order: 1 },
            },
            {
              type: 'process_flow',
              orientation: 'vertical',
              context: [],
              steps: toTemplateFlowSteps(points, language),
              summary: language === 'en-US' ? 'Use this as your final review path.' : '将此流程作为期末回顾路径。',
              templateId: 'accentCard',
              cardTitle: language === 'en-US' ? 'Review Sequence' : '复习顺序',
              titleTone: 'accent',
              placement: { row: 2, col: 1, colSpan: 2, order: 2 },
            },
          ],
        }
      : variant === 1
        ? {
            version: 1,
            language,
            profile: outline.contentProfile || 'general',
            archetype: 'summary',
            layout: { mode: 'stack' },
            pattern: 'symmetric_split',
            title: outline.title,
            titleTextColor: titlePalette.text,
            titleBackgroundColor: titlePalette.bg,
            titleBorderColor: titlePalette.border,
            blocks: [
              {
                type: 'paragraph',
                text: outline.description,
                templateId: 'infoCard',
                cardTitle: language === 'en-US' ? 'Summary Snapshot' : '总结导读',
                titleTone: 'accent',
              },
              {
                type: 'bullet_list',
                items: points,
                templateId: 'successCard',
                cardTitle: language === 'en-US' ? 'What To Remember' : '必须记住',
                titleTone: 'accent',
              },
              {
                type: 'callout',
                tone: 'info',
                text: objective,
                templateId: 'accentCard',
                title: language === 'en-US' ? 'Next Step' : '下一步行动',
              },
            ],
          }
        : {
            version: 1,
            language,
            profile: outline.contentProfile || 'general',
            archetype: 'summary',
            layout: { mode: 'stack' },
            pattern: 'flow_horizontal',
            title: outline.title,
            titleTextColor: titlePalette.text,
            titleBackgroundColor: titlePalette.bg,
            titleBorderColor: titlePalette.border,
            blocks: [
              {
                type: 'process_flow',
                orientation: 'horizontal',
                context: [
                  {
                    label: language === 'en-US' ? 'Review Goal' : '复习目标',
                    text: objective,
                    tone: 'success',
                  },
                ],
                steps: toTemplateFlowSteps(points, language),
                summary:
                  language === 'en-US'
                    ? 'Rehearse this chain once to consolidate the chapter.'
                    : '按这个链路复述一遍即可完成章节回收。',
                templateId: 'warningCard',
                cardTitle: language === 'en-US' ? 'Final Checklist' : '期末回顾清单',
                titleTone: 'accent',
              },
            ],
          };

  return parseNotebookContentDocument(candidate);
}

function buildTemplateDrivenSemanticDocument(
  outline: SceneOutline,
  language: 'zh-CN' | 'en-US',
): NotebookContentDocument | null {
  if (outline.type !== 'slide') return null;
  const archetype = outline.archetype || 'concept';
  if (archetype !== 'intro' && archetype !== 'summary') return null;
  const variant = pickDeterministicTemplateVariant(outline, 3);
  return archetype === 'intro'
    ? buildIntroTemplateDocument(outline, language, variant)
    : buildSummaryTemplateDocument(outline, language, variant);
}

async function generateSemanticSlideContent(
  outline: SceneOutline,
  aiCall: AICallFn,
  agents?: AgentInfo[],
  courseContext?: CoursePersonalizationContext,
  rewriteReason?: string,
  semanticRetryCount = 0,
  budgetRewriteAttempted = false,
  diagnostics?: SceneContentDiagnostics,
): Promise<GeneratedSlideContent | null> {
  const lang = outline.language || 'zh-CN';
  const templateDrivenDocument = buildTemplateDrivenSemanticDocument(outline, lang);
  if (templateDrivenDocument) {
    log.info(
      `[SemanticTemplate] Using ${outline.archetype || 'concept'} template chain for: ${outline.title}`,
    );
  }
  const teacherContext = formatTeacherPersonaForPrompt(agents, lang);
  const coursePersonalization = formatCoursePersonalizationForPrompt(courseContext, lang);
  const contentProfileContext = formatSceneContentProfileContext(outline, lang);
  const archetypeContext = formatSceneArchetypeContext(outline, lang);
  const workedExampleContext = formatWorkedExampleForPrompt(outline.workedExampleConfig, lang);
  const rewriteContext = formatSlideRewriteContext(rewriteReason, lang);
  let normalizedDocument: NotebookContentDocument | null = templateDrivenDocument;
  if (!normalizedDocument) {
    const prompts = buildPrompt(PROMPT_IDS.SLIDE_SEMANTIC_CONTENT, {
      language: lang,
      title: outline.title,
      description: outline.description,
      keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
      contentProfileContext,
      archetypeContext,
      teacherContext,
      coursePersonalization,
      workedExampleContext,
      rewriteContext,
    });
    if (!prompts) return null;
    const response = await aiCall(prompts.system, prompts.user);
    const contentDocumentRaw = extractNotebookContentDocumentFromResponse(response);
    normalizedDocument = contentDocumentRaw
      ? {
          ...contentDocumentRaw,
          language: lang,
          profile:
            contentDocumentRaw.profile === 'general' && outline.contentProfile
              ? outline.contentProfile
              : contentDocumentRaw.profile,
          archetype: outline.archetype || contentDocumentRaw.archetype || 'concept',
        }
      : null;
  }
  if (!normalizedDocument) {
    log.warn(`Semantic slide content parse failed for: ${outline.title}`);
    diagnostics && (diagnostics.semanticRetryCount = Math.max(diagnostics.semanticRetryCount, semanticRetryCount + 1));
    recordFailure(diagnostics, 'semantic_parse', 'semantic document parse failed');
    if (semanticRetryCount < MAX_SEMANTIC_SLIDE_RETRIES) {
      return generateSemanticSlideContent(
        outline,
        aiCall,
        agents,
        courseContext,
        appendRewriteReason(rewriteReason, buildSemanticStructureRetryReason(lang)),
        semanticRetryCount + 1,
        budgetRewriteAttempted,
        diagnostics,
      );
    }
    return null;
  }
  normalizedDocument = normalizeColumnLayoutBlocks(normalizedDocument);
  normalizedDocument = normalizeGridPlacementHints(normalizedDocument);
  if (hasUnexpectedCjkForLanguage(normalizedDocument, lang)) {
    log.warn(`Semantic slide content language mismatch for: ${outline.title}`);
    recordFailure(diagnostics, 'semantic_language', 'language mismatch in semantic document');
    return null;
  }

  const archetypeValidation = validateNotebookContentDocumentArchetype(normalizedDocument);
  if (!archetypeValidation.isValid) {
    log.warn(
      `Semantic slide content archetype mismatch for: ${outline.title}`,
      archetypeValidation.reasons,
    );
    diagnostics && (diagnostics.semanticRetryCount = Math.max(diagnostics.semanticRetryCount, semanticRetryCount + 1));
    recordFailure(
      diagnostics,
      'semantic_archetype',
      `archetype mismatch: ${archetypeValidation.reasons.join(', ')}`,
    );
    if (semanticRetryCount < MAX_SEMANTIC_SLIDE_RETRIES) {
      return generateSemanticSlideContent(
        outline,
        aiCall,
        agents,
        courseContext,
        appendRewriteReason(rewriteReason, archetypeValidation.reasons.join('\n')),
        semanticRetryCount + 1,
        budgetRewriteAttempted,
        diagnostics,
      );
    }
    log.error(`Semantic slide content rejected after archetype retries: ${outline.title}`);
    return null;
  }

  const contentBudget = measureNotebookSemanticLayout(normalizedDocument);
  if (!contentBudget.fits && !budgetRewriteAttempted) {
    log.info(`[Budget] budget_rewrite_once for: ${outline.title}`);
    diagnostics && (diagnostics.semanticRetryCount = Math.max(diagnostics.semanticRetryCount, semanticRetryCount + 1));
    return generateSemanticSlideContent(
      outline,
      aiCall,
      agents,
      courseContext,
      appendRewriteReason(rewriteReason, buildSemanticBudgetRetryReason(lang, contentBudget.reasons)),
      semanticRetryCount + 1,
      true,
      diagnostics,
    );
  }
  log.info(
    `[Budget] ${contentBudget.fits ? 'budget_check_pass' : 'budget_fallback_paginate'} for: ${outline.title}`,
  );
  const paginationResult = paginateNotebookSemanticLayout({
    document: normalizedDocument,
    rootOutlineId: outline.continuation?.rootOutlineId || outline.id,
  });
  const paginationReasons = [
    ...contentBudget.reasons,
    ...paginationResult.reasons,
    ...paginationResult.unpageableBlockTypes.map((type) => `unpageable_block:${type}`),
  ];
  if (paginationResult.wasSplit) {
    log.info(`[Budget] budget_fallback_paginate for: ${outline.title}`);
  }

  if (paginationResult.unpageableBlockTypes.length > 0 || paginationResult.pages.length === 0) {
    log.warn(`Semantic slide content pagination failed for: ${outline.title}`, paginationReasons);
    diagnostics && (diagnostics.semanticRetryCount = Math.max(diagnostics.semanticRetryCount, semanticRetryCount + 1));
    recordFailure(
      diagnostics,
      'semantic_pagination',
      `pagination failed: ${paginationReasons.join(', ') || 'unknown'}`,
    );
    if (semanticRetryCount < MAX_SEMANTIC_SLIDE_RETRIES) {
      return generateSemanticSlideContent(
        outline,
        aiCall,
        agents,
        courseContext,
        appendRewriteReason(rewriteReason, buildSemanticBudgetRetryReason(lang, paginationReasons)),
        semanticRetryCount + 1,
        true,
        diagnostics,
      );
    }
    log.error(`Semantic slide content rejected after pagination retries: ${outline.title}`);
    return null;
  }

  const renderedPages = renderNotebookSemanticPages({
    pageDocuments: paginationResult.pages,
    fallbackTitle: outline.title,
    viewport: SLIDE_LAYOUT_VIEWPORT,
  }).map((page) => ({
    elements: page.slide.elements,
    background: page.slide.background,
    theme: page.slide.theme,
    contentDocument: page.document,
    layoutValidation: page.layoutValidation,
  }));

  const invalidPage = renderedPages.find((page) => !page.layoutValidation.isValid);
  if (invalidPage) {
    log.warn(
      `Semantic slide content layout invalid but allowed: ${outline.title}`,
      invalidPage.layoutValidation.issues.map((issue) => issue.message),
    );
    // User-requested behavior: do not block generation on layout overlap/overflow.
    // Keep the slide for inspection even when layout validation reports issues.
  }

  const [primaryPage, ...continuationPages] = renderedPages;
  return {
    elements: primaryPage.elements,
    background: primaryPage.background,
    theme: primaryPage.theme,
    remark: outline.description,
    contentDocument: primaryPage.contentDocument,
    continuationPages: continuationPages.map((page, index) => ({
      outline: buildContinuationSceneOutline(outline, index + 2, renderedPages.length),
      content: {
        elements: page.elements,
        background: page.background,
        theme: page.theme,
        remark: outline.description,
        contentDocument: page.contentDocument,
      },
    })),
  };
}

/**
 * Generate slide content
 */
async function generateSlideContent(
  outline: SceneOutline,
  aiCall: AICallFn,
  assignedImages?: PdfImage[],
  imageMapping?: ImageMapping,
  visionEnabled?: boolean,
  generatedMediaMapping?: ImageMapping,
  agents?: AgentInfo[],
  courseContext?: CoursePersonalizationContext,
  rewriteReason?: string,
  layoutRetryCount = 0,
  skipSemanticPipeline = false,
  diagnostics?: SceneContentDiagnostics,
): Promise<GeneratedSlideContent | null> {
  const lang = outline.language || 'zh-CN';
  const useLegacyElementPipeline = false;

  if (!useLegacyElementPipeline) {
    if (diagnostics) diagnostics.pipeline = 'semantic';
    const semanticContent = await generateSemanticSlideContent(
      outline,
      aiCall,
      agents,
      courseContext,
      rewriteReason,
      0,
      false,
      diagnostics,
    );
    if (semanticContent) {
      log.info(`Using semantic slide content pipeline for: ${outline.title}`);
      return semanticContent;
    }
    log.error(`Semantic slide content failed with fallback disabled: ${outline.title}`);
    recordFailure(diagnostics, 'slide_semantic_failed', 'semantic pipeline returned null');
    return null;
  }

  if (outline.workedExampleConfig && shouldUseLocalWorkedExampleTemplate(outline)) {
    const localTemplate = buildWorkedExampleSlideContent(outline, {
      assignedImages,
      imageMapping,
      generatedMediaMapping,
    });
    if (localTemplate) {
      const normalizedElements = normalizeSlideTextLayout(
        localTemplate.elements,
        SLIDE_LAYOUT_VIEWPORT,
      );
      const layoutValidation = validateSlideTextLayout(normalizedElements, SLIDE_LAYOUT_VIEWPORT);

      if (!layoutValidation.isValid) {
        log.warn(
          `Local worked-example template layout invalid, falling back to AI generation: ${outline.title}`,
          layoutValidation.issues.map((issue) => issue.message),
        );
      } else {
        log.info(`Using local worked-example template for: ${outline.title}`);
        return {
          ...localTemplate,
          elements: normalizedElements,
        };
      }
    }
  }

  if (!skipSemanticPipeline && shouldUseSemanticSlideGeneration(outline, assignedImages)) {
    if (diagnostics) diagnostics.pipeline = 'semantic';
    const semanticContent = await generateSemanticSlideContent(
      outline,
      aiCall,
      agents,
      courseContext,
      rewriteReason,
      0,
      false,
      diagnostics,
    );
    if (semanticContent) {
      log.info(`Using semantic slide content pipeline for: ${outline.title}`);
      return semanticContent;
    }
    log.warn(
      `Semantic slide content generation failed, falling back to legacy element prompt: ${outline.title}`,
    );
    recordFailure(diagnostics, 'slide_semantic_failed', 'semantic pipeline returned null');
  }

  if (outline.workedExampleConfig) {
    log.info(
      `Falling back to AI worked-example rendering for notation-rich scene: ${outline.title}`,
    );
  }

  // Build assigned images description for the prompt
  let assignedImagesText =
    lang === 'zh-CN'
      ? '无可用图片，禁止插入任何 image 元素'
      : 'No images are available. Do not create any image element.';
  let visionImages: Array<{ id: string; src: string }> | undefined;

  if (assignedImages && assignedImages.length > 0) {
    if (visionEnabled && imageMapping) {
      // Vision mode: split into vision images and text-only
      const withSrc = assignedImages.filter((img) => imageMapping[img.id]);
      const visionSlice = withSrc.slice(0, MAX_VISION_IMAGES);
      const textOnlySlice = withSrc.slice(MAX_VISION_IMAGES);
      const noSrcImages = assignedImages.filter((img) => !imageMapping[img.id]);

      const visionDescriptions = visionSlice.map((img) => formatImagePlaceholder(img, lang));
      const textDescriptions = [...textOnlySlice, ...noSrcImages].map((img) =>
        formatImageDescription(img, lang),
      );
      assignedImagesText = [...visionDescriptions, ...textDescriptions].join('\n');

      visionImages = visionSlice.map((img) => ({
        id: img.id,
        src: imageMapping[img.id],
        width: img.width,
        height: img.height,
      }));
    } else {
      assignedImagesText = assignedImages
        .map((img) => formatImageDescription(img, lang))
        .join('\n');
    }
  }

  // Add generated media placeholders info (images + videos)
  if (outline.mediaGenerations && outline.mediaGenerations.length > 0) {
    const genImgDescs = outline.mediaGenerations
      .filter((mg) => mg.type === 'image')
      .map((mg) => `- ${mg.elementId}: "${mg.prompt}" (aspect ratio: ${mg.aspectRatio || '16:9'})`)
      .join('\n');
    const genVidDescs = outline.mediaGenerations
      .filter((mg) => mg.type === 'video')
      .map((mg) => `- ${mg.elementId}: "${mg.prompt}" (aspect ratio: ${mg.aspectRatio || '16:9'})`)
      .join('\n');

    const mediaParts: string[] = [];
    if (genImgDescs) {
      mediaParts.push(`AI-Generated Images (use these IDs as image element src):\n${genImgDescs}`);
    }
    if (genVidDescs) {
      mediaParts.push(`AI-Generated Videos (use these IDs as video element src):\n${genVidDescs}`);
    }

    if (mediaParts.length > 0) {
      const mediaText = mediaParts.join('\n\n');
      if (assignedImagesText.includes('禁止插入') || assignedImagesText.includes('No images')) {
        assignedImagesText = mediaText;
      } else {
        assignedImagesText += `\n\n${mediaText}`;
      }
    }
  }

  // Canvas dimensions (matching viewportSize and viewportRatio)
  const canvasWidth = 1000;
  const canvasHeight = 562.5;

  const teacherContext = formatTeacherPersonaForPrompt(agents, lang);
  const coursePersonalization = formatCoursePersonalizationForPrompt(courseContext, lang);
  const contentProfileContext = formatSceneContentProfileContext(outline, lang);
  const workedExampleContext = formatWorkedExampleForPrompt(outline.workedExampleConfig, lang);
  const rewriteContext = formatSlideRewriteContext(rewriteReason, lang);

  const prompts = buildPrompt(PROMPT_IDS.SLIDE_CONTENT, {
    language: lang,
    title: outline.title,
    description: outline.description,
    keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
    elements:
      lang === 'zh-CN' ? '（根据要点自动生成）' : '(Generate automatically from the key points)',
    assignedImages: assignedImagesText,
    canvas_width: canvasWidth,
    canvas_height: canvasHeight,
    contentProfileContext,
    teacherContext,
    coursePersonalization,
    workedExampleContext,
    rewriteContext,
  });

  if (!prompts) {
    return null;
  }

  log.debug(`Generating slide content for: ${outline.title}`);
  if (assignedImages && assignedImages.length > 0) {
    log.debug(`Assigned images: ${assignedImages.map((img) => img.id).join(', ')}`);
  }
  if (visionImages && visionImages.length > 0) {
    log.debug(`Vision images: ${visionImages.map((img) => img.id).join(', ')}`);
  }

  const response = await aiCall(prompts.system, prompts.user, visionImages);
  const generatedData = parseJsonResponse<GeneratedSlideData>(response);

  if (!generatedData || !generatedData.elements || !Array.isArray(generatedData.elements)) {
    log.error(`Failed to parse AI response for: ${outline.title}`);
    if (diagnostics) diagnostics.pipeline = 'legacy';
    recordFailure(diagnostics, 'legacy_parse', 'legacy element JSON parse failed');
    return null;
  }
  if (hasUnexpectedCjkForLanguage(generatedData, lang)) {
    log.warn(`Slide content language mismatch for: ${outline.title}`);
    if (diagnostics) diagnostics.pipeline = 'legacy';
    recordFailure(diagnostics, 'legacy_language', 'legacy generated language mismatch');
    return null;
  }

  log.debug(`Got ${generatedData.elements.length} elements for: ${outline.title}`);

  // Debug: Log image elements before resolution
  const imageElements = generatedData.elements.filter((el) => el.type === 'image');
  if (imageElements.length > 0) {
    log.debug(
      `Image elements before resolution:`,
      imageElements.map((el) => ({
        type: el.type,
        src:
          (el as Record<string, unknown>).src &&
          String((el as Record<string, unknown>).src).substring(0, 50),
      })),
    );
    log.debug(`imageMapping keys:`, imageMapping ? Object.keys(imageMapping).length : '0 keys');
  }

  // Fix elements with missing required fields + aspect ratio correction (while src is still img_id)
  const fixedElements = fixElementDefaults(generatedData.elements, assignedImages);
  log.debug(`After element fixing: ${fixedElements.length} elements`);

  // Process LaTeX elements: render latex string → HTML via KaTeX
  const latexProcessedElements = processLatexElements(fixedElements);
  log.debug(`After LaTeX processing: ${latexProcessedElements.length} elements`);

  // Resolve image_id references to actual URLs
  const resolvedElements = resolveImageIds(
    latexProcessedElements,
    imageMapping,
    generatedMediaMapping,
  );
  log.debug(`After image resolution: ${resolvedElements.length} elements`);

  // Process elements, assign unique IDs
  const processedElements: PPTElement[] = resolvedElements.map((el) => ({
    ...el,
    id: `${el.type}_${nanoid(8)}`,
    rotate: 0,
  })) as PPTElement[];
  const normalizedElements = normalizeSlideTextLayout(processedElements, SLIDE_LAYOUT_VIEWPORT);
  const layoutValidation = validateSlideTextLayout(normalizedElements, SLIDE_LAYOUT_VIEWPORT);
  if (!layoutValidation.isValid) {
    log.warn(
      `Generated slide layout invalid for: ${outline.title}`,
      layoutValidation.issues.map((issue) => issue.message),
    );

    diagnostics && (diagnostics.layoutRetryCount = Math.max(diagnostics.layoutRetryCount, layoutRetryCount + 1));
    if (diagnostics) diagnostics.pipeline = 'legacy';
    recordFailure(
      diagnostics,
      'legacy_layout',
      layoutValidation.issues.map((issue) => issue.code).join(', '),
    );
    if (layoutRetryCount < MAX_SLIDE_LAYOUT_RETRIES) {
      return generateSlideContent(
        outline,
        aiCall,
        assignedImages,
        imageMapping,
        visionEnabled,
        generatedMediaMapping,
        agents,
        courseContext,
        appendRewriteReason(rewriteReason, buildLayoutRetryReason(layoutValidation, lang)),
        layoutRetryCount + 1,
        true,
        diagnostics,
      );
    }

    log.error(`Slide layout validation failed after retry for: ${outline.title}`);
    log.error(`Legacy slide content failed with fallback disabled: ${outline.title}`);
    return null;
  }

  // Process background
  let background: SlideBackground | undefined;
  if (generatedData.background) {
    if (generatedData.background.type === 'solid' && generatedData.background.color) {
      background = { type: 'solid', color: generatedData.background.color };
    } else if (generatedData.background.type === 'gradient' && generatedData.background.gradient) {
      background = {
        type: 'gradient',
        gradient: generatedData.background.gradient,
      };
    }
  }

  return {
    elements: normalizedElements,
    background,
    remark: generatedData.remark || outline.description,
  };
}

/**
 * Generate quiz content
 */
async function generateQuizContent(
  outline: SceneOutline,
  aiCall: AICallFn,
  courseContext?: CoursePersonalizationContext,
): Promise<GeneratedQuizContent | null> {
  const lang = outline.language || 'zh-CN';
  const quizConfig = outline.quizConfig || {
    questionCount: 3,
    difficulty: 'medium',
    questionTypes: ['single'],
  };

  const prompts = buildPrompt(PROMPT_IDS.QUIZ_CONTENT, {
    language: lang,
    title: outline.title,
    description: outline.description,
    keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
    questionCount: quizConfig.questionCount,
    difficulty: quizConfig.difficulty,
    questionTypes: quizConfig.questionTypes.join(', '),
    coursePersonalization: formatCoursePersonalizationForPrompt(courseContext, lang),
  });

  if (!prompts) {
    return null;
  }

  log.debug(`Generating quiz content for: ${outline.title}`);
  const response = await aiCall(prompts.system, prompts.user);
  const generatedQuestions = parseJsonResponse<QuizQuestion[]>(response);

  if (!generatedQuestions || !Array.isArray(generatedQuestions)) {
    log.error(`Failed to parse AI response for: ${outline.title}`);
    return null;
  }
  if (hasUnexpectedCjkForLanguage(generatedQuestions, lang)) {
    log.warn(`Quiz content language mismatch for: ${outline.title}`);
    return null;
  }

  log.debug(`Got ${generatedQuestions.length} questions for: ${outline.title}`);

  // Ensure each question has an ID and normalize options format
  const questions: QuizQuestion[] = generatedQuestions.map((q) => {
    const normalizedType = normalizeQuizQuestionType(q.type);
    const hasOptions =
      normalizedType !== 'short_answer' && normalizedType !== 'proof' && normalizedType !== 'code';
    const normalizedOptions = hasOptions ? normalizeQuizOptions(q.options) : undefined;
    return {
      ...q,
      type: normalizedType,
      id: q.id || `q_${nanoid(8)}`,
      language: q.type === 'code' || q.language === 'python' ? 'python' : undefined,
      options: normalizedOptions,
      answer: normalizeQuestionAnswer(
        q as unknown as Record<string, unknown>,
        normalizedType,
        normalizedOptions,
      ),
      correctAnswer: normalizeCorrectAnswer(
        q as unknown as Record<string, unknown>,
        normalizedType,
        normalizedOptions,
      ),
      hasAnswer: resolveQuestionHasAnswer(
        q as unknown as Record<string, unknown>,
        normalizedType,
        normalizedOptions,
      ),
      testCases: normalizeQuizTestCases((q as { testCases?: unknown[] }).testCases),
    };
  });

  return { questions };
}

/**
 * Normalize quiz options from AI response.
 * AI may generate plain strings ["OptionA", "OptionB"] or QuizOption objects.
 * This normalizes to QuizOption[] format: { value: "A", label: "OptionA" }
 */
function normalizeQuizOptions(
  options: unknown[] | undefined,
): { value: string; label: string }[] | undefined {
  if (!options || !Array.isArray(options)) return undefined;

  return options.map((opt, index) => {
    const letter = String.fromCharCode(65 + index); // A, B, C, D...

    if (typeof opt === 'string') {
      return { value: letter, label: opt };
    }

    if (typeof opt === 'object' && opt !== null) {
      const obj = opt as Record<string, unknown>;
      return {
        value: typeof obj.value === 'string' ? obj.value : letter,
        label: typeof obj.label === 'string' ? obj.label : String(obj.value || obj.text || letter),
      };
    }

    return { value: letter, label: String(opt) };
  });
}

/**
 * Normalize question type aliases from generators and imported data.
 */
function normalizeQuizQuestionType(type: unknown): QuizQuestion['type'] {
  const raw = typeof type === 'string' ? type : 'single';
  if (raw === 'text') return 'short_answer';
  if (raw === 'multiple_choice') return 'multiple_choice';
  if (raw === 'proof') return 'proof';
  if (raw === 'code_tracing') return 'code_tracing';
  if (raw === 'code') return 'code';
  if (raw === 'short_answer') return 'short_answer';
  if (raw === 'multiple') return 'multiple';
  return 'single';
}

/**
 * Normalize quiz answer from AI response.
 * Objective questions normalize to option letters, while text/code questions keep free text.
 */
function normalizeQuestionAnswer(
  question: Record<string, unknown>,
  type: QuizQuestion['type'],
  options?: { value: string; label: string }[],
): string | string[] | undefined {
  const raw = question.answer ?? question.correctAnswer ?? question.correct_answer;
  if (raw == null) return undefined;

  if (type === 'short_answer' || type === 'proof') {
    if (Array.isArray(raw)) {
      return raw.map(String).join('\n');
    }
    return String(raw);
  }

  if (type === 'code') {
    return typeof raw === 'string' ? raw : undefined;
  }

  if (type === 'code_tracing' && (!options || options.length === 0)) {
    if (Array.isArray(raw)) {
      return raw.map(String).join('\n');
    }
    return String(raw);
  }

  const normalized = normalizeChoiceAnswerValues(raw, options);
  if (!normalized) return undefined;

  if (type === 'single' || type === 'multiple_choice') {
    return normalized[0];
  }
  return normalized;
}

function normalizeCorrectAnswer(
  question: Record<string, unknown>,
  type: QuizQuestion['type'],
  options?: { value: string; label: string }[],
): string | string[] | undefined {
  const raw = question.correctAnswer ?? question.answer ?? question.correct_answer;
  if (raw == null) return undefined;

  if (type === 'short_answer' || type === 'proof' || type === 'code') {
    if (Array.isArray(raw)) return raw.map(String).join('\n');
    return String(raw);
  }

  if (type === 'code_tracing' && (!options || options.length === 0)) {
    if (Array.isArray(raw)) return raw.map(String).join('\n');
    return String(raw);
  }

  const normalized = normalizeChoiceAnswerValues(raw, options);
  if (!normalized) return undefined;
  if (type === 'single' || type === 'multiple_choice') return normalized[0];
  return normalized;
}

function normalizeChoiceAnswerValues(
  raw: unknown,
  options?: { value: string; label: string }[],
): string[] | undefined {
  const list = Array.isArray(raw) ? raw : [raw];
  const normalized = list
    .map((entry) => normalizeChoiceAnswerValue(entry, options))
    .filter((value): value is string => Boolean(value));

  return normalized.length > 0 ? Array.from(new Set(normalized)) : undefined;
}

function normalizeChoiceAnswerValue(
  raw: unknown,
  options?: { value: string; label: string }[],
): string | null {
  const optionValues = options?.map((opt) => String(opt.value).toUpperCase()) ?? [];
  const optionLabels = options?.map((opt) => opt.label.trim()) ?? [];

  if (typeof raw === 'number' && Number.isInteger(raw)) {
    return optionValues[raw] ?? null;
  }

  const text = String(raw).trim();
  if (!text) return null;

  const upper = text.toUpperCase();
  if (upper.length === 1 && optionValues.includes(upper)) {
    return upper;
  }

  const directIndex = optionLabels.findIndex((label) => label === text);
  if (directIndex >= 0) {
    return optionValues[directIndex] ?? null;
  }

  const prefixedIndex = optionLabels.findIndex(
    (label, idx) => `${optionValues[idx]}. ${label}` === text,
  );
  if (prefixedIndex >= 0) {
    return optionValues[prefixedIndex] ?? null;
  }

  const letterMatch = upper.match(/\b([A-Z])\b/);
  if (letterMatch && optionValues.includes(letterMatch[1])) {
    return letterMatch[1];
  }

  return null;
}

function resolveQuestionHasAnswer(
  question: Record<string, unknown>,
  type: QuizQuestion['type'],
  options?: { value: string; label: string }[],
): boolean {
  if (typeof question.hasAnswer === 'boolean') return question.hasAnswer;
  if (type === 'short_answer' || type === 'proof') return false;
  if (type === 'code') return true;
  if (type === 'code_tracing') return !!options?.length;
  return true;
}

function normalizeQuizTestCases(
  testCases: unknown[] | undefined,
): QuizQuestion['testCases'] | undefined {
  if (!Array.isArray(testCases) || testCases.length === 0) return undefined;

  return testCases
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;
      const obj = item as Record<string, unknown>;
      const expression =
        typeof obj.expression === 'string'
          ? obj.expression
          : typeof obj.input === 'string'
            ? obj.input
            : undefined;
      const expected =
        typeof obj.expected === 'string'
          ? obj.expected
          : obj.output != null
            ? JSON.stringify(obj.output)
            : undefined;

      if (!expression || !expected) return null;

      return {
        id: typeof obj.id === 'string' ? obj.id : `case_${index + 1}`,
        description: typeof obj.description === 'string' ? obj.description : undefined,
        expression,
        expected,
        hidden: Boolean(obj.hidden),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

/**
 * Generate interactive page content
 * Two AI calls + post-processing:
 * 1. Scientific modeling -> ScientificModel (with fallback)
 * 2. HTML generation with constraints -> post-processed HTML
 */
async function generateInteractiveContent(
  outline: SceneOutline,
  aiCall: AICallFn,
  language: 'zh-CN' | 'en-US' = 'zh-CN',
  courseContext?: CoursePersonalizationContext,
): Promise<GeneratedInteractiveContent | null> {
  const config = outline.interactiveConfig!;

  // Step 1: Scientific modeling (with fallback on failure)
  let scientificModel: ScientificModel | undefined;
  try {
    const modelPrompts = buildPrompt(PROMPT_IDS.INTERACTIVE_SCIENTIFIC_MODEL, {
      language,
      subject: config.subject || '',
      conceptName: config.conceptName,
      conceptOverview: config.conceptOverview,
      keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
      designIdea: config.designIdea,
      coursePersonalization: formatCoursePersonalizationForPrompt(courseContext, language),
    });

    if (modelPrompts) {
      log.info(`Step 1: Scientific modeling for: ${outline.title}`);
      const modelResponse = await aiCall(modelPrompts.system, modelPrompts.user);
      const parsed = parseJsonResponse<ScientificModel>(modelResponse);
      if (parsed && parsed.core_formulas) {
        scientificModel = parsed;
        log.info(
          `Scientific model: ${parsed.core_formulas.length} formulas, ${parsed.constraints?.length || 0} constraints`,
        );
      }
    }
  } catch (error) {
    log.warn(`Scientific modeling failed, continuing without: ${error}`);
  }

  // Format scientific constraints for HTML generation prompt
  let scientificConstraints = 'No specific scientific constraints available.';
  if (scientificModel) {
    const lines: string[] = [];
    if (scientificModel.core_formulas?.length) {
      lines.push(`Core Formulas: ${scientificModel.core_formulas.join('; ')}`);
    }
    if (scientificModel.mechanism?.length) {
      lines.push(`Mechanisms: ${scientificModel.mechanism.join('; ')}`);
    }
    if (scientificModel.constraints?.length) {
      lines.push(`Must Obey: ${scientificModel.constraints.join('; ')}`);
    }
    if (scientificModel.forbidden_errors?.length) {
      lines.push(`Forbidden Errors: ${scientificModel.forbidden_errors.join('; ')}`);
    }
    scientificConstraints = lines.join('\n');
  }

  // Step 2: HTML generation
  const htmlPrompts = buildPrompt(PROMPT_IDS.INTERACTIVE_HTML, {
    conceptName: config.conceptName,
    subject: config.subject || '',
    conceptOverview: config.conceptOverview,
    keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
    scientificConstraints,
    designIdea: config.designIdea,
    language,
    coursePersonalization: formatCoursePersonalizationForPrompt(courseContext, language),
  });

  if (!htmlPrompts) {
    log.error(`Failed to build HTML prompt for: ${outline.title}`);
    return null;
  }

  log.info(`Step 2: Generating HTML for: ${outline.title}`);
  const htmlResponse = await aiCall(htmlPrompts.system, htmlPrompts.user);
  // Extract HTML from response
  const rawHtml = extractHtml(htmlResponse);
  if (!rawHtml) {
    log.error(`Failed to extract HTML from response for: ${outline.title}`);
    return null;
  }

  // Step 3: Post-process HTML (LaTeX delimiter conversion + KaTeX injection)
  const processedHtml = postProcessInteractiveHtml(rawHtml);
  if (hasUnexpectedCjkForLanguage(processedHtml, language)) {
    log.warn(`Interactive content language mismatch for: ${outline.title}`);
    return null;
  }
  log.info(`Post-processed HTML (${processedHtml.length} chars) for: ${outline.title}`);

  return {
    html: processedHtml,
    scientificModel,
  };
}

/**
 * Generate PBL project content
 * Uses the agentic loop from lib/pbl/generate-pbl.ts
 */
async function generatePBLSceneContent(
  outline: SceneOutline,
  languageModel?: LanguageModel,
): Promise<GeneratedPBLContent | null> {
  if (!languageModel) {
    log.error('LanguageModel required for PBL generation');
    return null;
  }

  const pblConfig = outline.pblConfig;
  if (!pblConfig) {
    log.error(`PBL outline "${outline.title}" missing pblConfig`);
    return null;
  }

  log.info(`Generating PBL content for: ${outline.title}`);

  try {
    const projectConfig = await generatePBLContent(
      {
        projectTopic: pblConfig.projectTopic,
        projectDescription: pblConfig.projectDescription,
        targetSkills: pblConfig.targetSkills,
        issueCount: pblConfig.issueCount,
        language: pblConfig.language,
      },
      languageModel,
      {
        onProgress: (msg) => log.info(`${msg}`),
      },
    );
    log.info(
      `PBL generated: ${projectConfig.agents.length} agents, ${projectConfig.issueboard.issues.length} issues`,
    );

    return { projectConfig };
  } catch (error) {
    log.error(`Failed:`, error);
    return null;
  }
}

/**
 * Extract HTML document from AI response.
 * Tries to find <!DOCTYPE html>...</html> first, then falls back to code block extraction.
 */
function extractHtml(response: string): string | null {
  // Strategy 1: Find complete HTML document
  const doctypeStart = response.indexOf('<!DOCTYPE html>');
  const htmlTagStart = response.indexOf('<html');
  const start = doctypeStart !== -1 ? doctypeStart : htmlTagStart;

  if (start !== -1) {
    const htmlEnd = response.lastIndexOf('</html>');
    if (htmlEnd !== -1) {
      return response.substring(start, htmlEnd + 7);
    }
  }

  // Strategy 2: Extract from code block
  const codeBlockMatch = response.match(/```(?:html)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    const content = codeBlockMatch[1].trim();
    if (content.includes('<html') || content.includes('<!DOCTYPE')) {
      return content;
    }
  }

  // Strategy 3: If response itself looks like HTML
  const trimmed = response.trim();
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    return trimmed;
  }

  log.error('Could not extract HTML from response');
  log.error('Response preview:', response.substring(0, 200));
  return null;
}

/**
 * Step 3.2: Generate Actions based on content and script
 */
export async function generateSceneActions(
  outline: SceneOutline,
  content:
    | GeneratedSlideContent
    | GeneratedQuizContent
    | GeneratedInteractiveContent
    | GeneratedPBLContent,
  aiCall: AICallFn,
  ctx?: SceneGenerationContext,
  agents?: AgentInfo[],
  userProfile?: string,
  coursePersonalization?: CoursePersonalizationContext,
): Promise<Action[]> {
  const agentsText = formatAgentsForPrompt(agents);
  const lang = outline.language || 'zh-CN';
  const personalizationText = formatCoursePersonalizationForPrompt(coursePersonalization, lang);
  const mergedCourseContext = [buildCourseContext(ctx), personalizationText]
    .filter(Boolean)
    .join('\n\n');
  const finalizeActions = (actions: Action[], elements: PPTElement[] = []) =>
    verbalizeSpeechActions(processActions(actions, elements, agents), lang);

  if (outline.type === 'slide' && 'elements' in content) {
    // Format element list for AI to select from
    const elementsText = formatElementsForPrompt(content.elements);
    const workedExampleContext = formatWorkedExampleForPrompt(outline.workedExampleConfig, lang);

    const prompts = buildPrompt(PROMPT_IDS.SLIDE_ACTIONS, {
      language: lang,
      title: outline.title,
      keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
      description: outline.description,
      elements: elementsText,
      courseContext: mergedCourseContext,
      agents: agentsText,
      userProfile: userProfile || '',
      workedExampleContext,
    });

    if (!prompts) {
      return verbalizeSpeechActions(generateDefaultSlideActions(outline, content.elements), lang);
    }

    const response = await aiCall(prompts.system, prompts.user);
    const actions = parseActionsFromStructuredOutput(response, outline.type);

    if (actions.length > 0) {
      if (hasUnexpectedCjkForLanguage(actions, lang)) {
        log.warn(`Slide actions language mismatch for: ${outline.title}`);
        return verbalizeSpeechActions(generateDefaultSlideActions(outline, content.elements), lang);
      }
      // Validate and fill in Action IDs
      return finalizeActions(actions, content.elements);
    }

    return verbalizeSpeechActions(generateDefaultSlideActions(outline, content.elements), lang);
  }

  if (outline.type === 'quiz' && 'questions' in content) {
    // Format question list for AI reference
    const questionsText = formatQuestionsForPrompt(content.questions);

    const prompts = buildPrompt(PROMPT_IDS.QUIZ_ACTIONS, {
      language: lang,
      title: outline.title,
      keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
      description: outline.description,
      questions: questionsText,
      courseContext: mergedCourseContext,
      agents: agentsText,
    });

    if (!prompts) {
      return verbalizeSpeechActions(generateDefaultQuizActions(outline), lang);
    }

    const response = await aiCall(prompts.system, prompts.user);
    const actions = parseActionsFromStructuredOutput(response, outline.type);

    if (actions.length > 0) {
      if (hasUnexpectedCjkForLanguage(actions, lang)) {
        log.warn(`Quiz actions language mismatch for: ${outline.title}`);
        return verbalizeSpeechActions(generateDefaultQuizActions(outline), lang);
      }
      return finalizeActions(actions);
    }

    return verbalizeSpeechActions(generateDefaultQuizActions(outline), lang);
  }

  if (outline.type === 'interactive' && 'html' in content) {
    const config = outline.interactiveConfig;
    const agentsText = formatAgentsForPrompt(agents);
    const prompts = buildPrompt(PROMPT_IDS.INTERACTIVE_ACTIONS, {
      language: lang,
      title: outline.title,
      keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
      description: outline.description,
      conceptName: config?.conceptName || outline.title,
      designIdea: config?.designIdea || '',
      courseContext: mergedCourseContext,
      agents: agentsText,
    });

    if (!prompts) {
      return verbalizeSpeechActions(generateDefaultInteractiveActions(outline), lang);
    }

    const response = await aiCall(prompts.system, prompts.user);
    const actions = parseActionsFromStructuredOutput(response, outline.type);

    if (actions.length > 0) {
      if (hasUnexpectedCjkForLanguage(actions, lang)) {
        log.warn(`Interactive actions language mismatch for: ${outline.title}`);
        return verbalizeSpeechActions(generateDefaultInteractiveActions(outline), lang);
      }
      return finalizeActions(actions);
    }

    return verbalizeSpeechActions(generateDefaultInteractiveActions(outline), lang);
  }

  if (outline.type === 'pbl' && 'projectConfig' in content) {
    const pblConfig = outline.pblConfig;
    const agentsText = formatAgentsForPrompt(agents);
    const prompts = buildPrompt(PROMPT_IDS.PBL_ACTIONS, {
      language: lang,
      title: outline.title,
      keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
      description: outline.description,
      projectTopic: pblConfig?.projectTopic || outline.title,
      projectDescription: pblConfig?.projectDescription || outline.description,
      courseContext: mergedCourseContext,
      agents: agentsText,
    });

    if (!prompts) {
      return verbalizeSpeechActions(generateDefaultPBLActions(outline), lang);
    }

    const response = await aiCall(prompts.system, prompts.user);
    const actions = parseActionsFromStructuredOutput(response, outline.type);

    if (actions.length > 0) {
      return finalizeActions(actions);
    }

    return verbalizeSpeechActions(generateDefaultPBLActions(outline), lang);
  }

  return [];
}

export function buildFallbackSceneActions(
  outline: SceneOutline,
  content:
    | GeneratedSlideContent
    | GeneratedQuizContent
    | GeneratedInteractiveContent
    | GeneratedPBLContent,
  agents?: AgentInfo[],
): Action[] {
  const lang = outline.language || 'zh-CN';
  if (outline.type === 'slide' && 'elements' in content) {
    return verbalizeSpeechActions(generateDefaultSlideActions(outline, content.elements), lang);
  }

  if (outline.type === 'quiz' && 'questions' in content) {
    return verbalizeSpeechActions(generateDefaultQuizActions(outline), lang);
  }

  if (outline.type === 'interactive' && 'html' in content) {
    return verbalizeSpeechActions(generateDefaultInteractiveActions(outline), lang);
  }

  if (outline.type === 'pbl' && 'projectConfig' in content) {
    return verbalizeSpeechActions(generateDefaultPBLActions(outline), lang);
  }

  return verbalizeSpeechActions(processActions([], [], agents), lang);
}

/**
 * Generate default PBL Actions (fallback)
 */
function generateDefaultPBLActions(outline: SceneOutline): Action[] {
  const lang = outline.language || 'zh-CN';
  return [
    {
      id: `action_${nanoid(8)}`,
      type: 'speech',
      title: lang === 'zh-CN' ? 'PBL 项目介绍' : 'PBL project introduction',
      text:
        lang === 'zh-CN'
          ? '现在让我们开始一个项目式学习活动。请选择你的角色，查看任务看板，开始协作完成项目。'
          : 'Let us begin a project-based learning activity. Choose your role, review the task board, and start collaborating on the project.',
    },
  ];
}

/**
 * Format element list for AI to select elementId
 */
function formatElementsForPrompt(elements: PPTElement[]): string {
  return elements
    .map((el) => {
      let summary = '';
      const nameHint = el.name ? `name: "${el.name}", ` : '';
      if (el.type === 'text' && 'content' in el) {
        // Extract text content summary (strip HTML tags)
        const textContent = ((el.content as string) || '').replace(/<[^>]*>/g, '').substring(0, 50);
        summary = `Content summary: "${textContent}${textContent.length >= 50 ? '...' : ''}"`;
      } else if (el.type === 'chart' && 'chartType' in el) {
        summary = `Chart type: ${el.chartType}`;
      } else if (el.type === 'image') {
        summary = 'Image element';
      } else if (el.type === 'shape' && 'shapeName' in el) {
        summary = `Shape: ${el.shapeName || 'unknown'}`;
      } else if (el.type === 'latex' && 'latex' in el) {
        summary = `Formula: ${((el.latex as string) || '').substring(0, 30)}`;
      } else {
        summary = `${el.type} element`;
      }
      return `- id: "${el.id}", type: "${el.type}", ${nameHint}${summary}`;
    })
    .join('\n');
}

/**
 * Format question list for AI reference
 */
function formatQuestionsForPrompt(questions: QuizQuestion[]): string {
  return questions
    .map((q, i) => {
      const optionsText = q.options ? `Options: ${q.options.join(', ')}` : '';
      return `Q${i + 1} (${q.type}): ${q.question}\n${optionsText}`;
    })
    .join('\n\n');
}

/**
 * Process and validate Actions
 */
function processActions(actions: Action[], elements: PPTElement[], agents?: AgentInfo[]): Action[] {
  const elementIds = new Set(elements.map((el) => el.id));
  const agentIds = new Set(agents?.map((a) => a.id) || []);
  const studentAgents = agents?.filter((a) => a.role === 'student') || [];
  const nonTeacherAgents = agents?.filter((a) => a.role !== 'teacher') || [];

  return actions.map((action) => {
    // Ensure each action has an ID
    const processedAction: Action = {
      ...action,
      id: action.id || `action_${nanoid(8)}`,
    };

    // Validate spotlight elementId
    if (processedAction.type === 'spotlight') {
      const spotlightAction = processedAction;
      if (!spotlightAction.elementId || !elementIds.has(spotlightAction.elementId)) {
        // If elementId is invalid, try selecting the first element
        if (elements.length > 0) {
          spotlightAction.elementId = elements[0].id;
          log.warn(
            `Invalid elementId, falling back to first element: ${spotlightAction.elementId}`,
          );
        }
      }
    }

    // Validate/fill discussion agentId
    if (processedAction.type === 'discussion' && agents && agents.length > 0) {
      if (processedAction.agentId && agentIds.has(processedAction.agentId)) {
        // agentId valid — keep it
      } else {
        // agentId missing or invalid — pick a random student, or non-teacher, or skip
        const pool = studentAgents.length > 0 ? studentAgents : nonTeacherAgents;
        if (pool.length > 0) {
          const picked = pool[Math.floor(Math.random() * pool.length)];
          log.warn(
            `Discussion agentId "${processedAction.agentId || '(none)'}" invalid, assigned: ${picked.id} (${picked.name})`,
          );
          processedAction.agentId = picked.id;
        }
      }
    }

    return processedAction;
  });
}

/**
 * Generate default slide Actions (fallback)
 */
function generateDefaultSlideActions(outline: SceneOutline, elements: PPTElement[]): Action[] {
  if (outline.workedExampleConfig) {
    const cfg = outline.workedExampleConfig;
    const lang = outline.language || 'zh-CN';
    const role = cfg.role;
    const spotlightTarget =
      elements.find((el) => el.name === 'problem_statement_text') ||
      elements.find((el) => el.name === 'walkthrough_steps_text') ||
      elements.find((el) => el.name === 'final_answer_text') ||
      elements.find((el) => el.name?.includes('solution_plan_text')) ||
      elements.find((el) => el.type === 'text');

    const speechByRole =
      lang === 'zh-CN'
        ? {
            problem_statement: `先把题目读清楚。${cfg.problemStatement || outline.description || '这一页先明确题目本身。'}${cfg.asks?.length ? `本题真正要完成的是：${cfg.asks.join('；')}。` : ''}${cfg.constraints?.length ? `同时别忽略这些条件：${cfg.constraints.slice(0, 2).join('；')}。` : ''}`,
            givens_and_goal: `这一步先拆已知和目标。${cfg.givens?.length ? `已知信息包括：${cfg.givens.join('；')}。` : ''}${cfg.asks?.length ? `我们要解决的是：${cfg.asks.join('；')}。` : ''}`,
            constraints: `先把限制条件看清楚。${cfg.constraints?.length ? `关键约束有：${cfg.constraints.join('；')}。` : ''}这些条件会直接决定后面能不能用对方法。`,
            solution_plan: `先不要急着展开细节，我们先看解题路线。${cfg.solutionPlan?.length ? cfg.solutionPlan.join('；') + '。' : outline.description || '这一页先建立整体思路。'}`,
            walkthrough: `现在进入正式推演。${cfg.walkthroughSteps?.length ? cfg.walkthroughSteps.join('；') + '。' : outline.keyPoints.join('；') + '。'}每一步都要对应题目条件，不能跳步。`,
            pitfalls: `这里最容易出错。${cfg.commonPitfalls?.length ? `常见误区包括：${cfg.commonPitfalls.join('；')}。` : ''}讲题时要特别提醒学生这些地方为什么会错。`,
            summary: `最后做一个收束。${cfg.finalAnswer ? `结论可以概括为：${cfg.finalAnswer}。` : ''}${cfg.commonPitfalls?.length ? `同时记住这些易错点：${cfg.commonPitfalls.slice(0, 2).join('；')}。` : ''}`,
          }
        : {
            problem_statement: `Let us first make the problem itself clear. ${cfg.problemStatement || outline.description || 'This page is about understanding the question before solving it.'}${cfg.asks?.length ? ` The core task is: ${cfg.asks.join('; ')}.` : ''}${cfg.constraints?.length ? ` Keep these constraints in mind: ${cfg.constraints.slice(0, 2).join('; ')}.` : ''}`,
            givens_and_goal: `This step separates the givens from the goal. ${cfg.givens?.length ? `We know: ${cfg.givens.join('; ')}.` : ''}${cfg.asks?.length ? `We need to determine: ${cfg.asks.join('; ')}.` : ''}`,
            constraints: `Before solving, make the constraints explicit. ${cfg.constraints?.length ? `Key conditions are: ${cfg.constraints.join('; ')}.` : ''} These conditions shape the method we can use.`,
            solution_plan: `Before diving into details, let us map out the strategy. ${cfg.solutionPlan?.length ? cfg.solutionPlan.join('; ') + '.' : outline.description || 'This page sets up the overall approach.'}`,
            walkthrough: `Now we move through the solution step by step. ${cfg.walkthroughSteps?.length ? cfg.walkthroughSteps.join('; ') + '.' : outline.keyPoints.join('; ') + '.'} Each step should be justified by the problem conditions.`,
            pitfalls: `This is where students commonly go wrong. ${cfg.commonPitfalls?.length ? `Typical pitfalls include: ${cfg.commonPitfalls.join('; ')}.` : ''} It is worth pausing to explain why these mistakes happen.`,
            summary: `Let us close the example cleanly. ${cfg.finalAnswer ? `The conclusion is: ${cfg.finalAnswer}.` : ''}${cfg.commonPitfalls?.length ? ` Also remember these pitfalls: ${cfg.commonPitfalls.slice(0, 2).join('; ')}.` : ''}`,
          };

    const actions: Action[] = [];
    if (spotlightTarget) {
      actions.push({
        id: `action_${nanoid(8)}`,
        type: 'spotlight',
        title: lang === 'zh-CN' ? '聚焦讲题核心区域' : 'Focus worked-example area',
        elementId: spotlightTarget.id,
      });
    }
    actions.push({
      id: `action_${nanoid(8)}`,
      type: 'speech',
      title: lang === 'zh-CN' ? '例题讲解' : 'Worked example explanation',
      text: speechByRole[role],
    });
    return actions;
  }

  const actions: Action[] = [];
  const lang = outline.language || 'zh-CN';

  // Add spotlight for text elements
  const textElements = elements.filter((el) => el.type === 'text');
  if (textElements.length > 0) {
    actions.push({
      id: `action_${nanoid(8)}`,
      type: 'spotlight',
      title: lang === 'zh-CN' ? '聚焦重点' : 'Focus key point',
      elementId: textElements[0].id,
    });
  }

  // Add opening speech based on key points
  const speechText = outline.keyPoints?.length
    ? lang === 'zh-CN'
      ? outline.keyPoints.join('。') + '。'
      : `${outline.keyPoints.join('. ')}.`
    : outline.description || outline.title;
  actions.push({
    id: `action_${nanoid(8)}`,
    type: 'speech',
    title: lang === 'zh-CN' ? '场景讲解' : 'Scene explanation',
    text: speechText,
  });

  return actions;
}

/**
 * Generate default quiz Actions (fallback)
 */
function generateDefaultQuizActions(outline: SceneOutline): Action[] {
  const lang = outline.language || 'zh-CN';
  return [
    {
      id: `action_${nanoid(8)}`,
      type: 'speech',
      title: lang === 'zh-CN' ? '测验引导' : 'Quiz introduction',
      text:
        lang === 'zh-CN'
          ? '现在让我们来做一个小测验，检验一下学习成果。'
          : 'Let us do a short quiz to check what we have learned.',
    },
  ];
}

/**
 * Generate default interactive Actions (fallback)
 */
function generateDefaultInteractiveActions(outline: SceneOutline): Action[] {
  const lang = outline.language || 'zh-CN';
  return [
    {
      id: `action_${nanoid(8)}`,
      type: 'speech',
      title: lang === 'zh-CN' ? '交互引导' : 'Interactive introduction',
      text:
        lang === 'zh-CN'
          ? '现在让我们通过交互式可视化来探索这个概念。请尝试操作页面中的元素，观察变化。'
          : 'Let us explore this concept through an interactive visualization. Try manipulating the on-screen elements and observe what changes.',
    },
  ];
}

/**
 * Create a complete scene with Actions
 */
export function createSceneWithActions(
  outline: SceneOutline,
  content:
    | GeneratedSlideContent
    | GeneratedQuizContent
    | GeneratedInteractiveContent
    | GeneratedPBLContent,
  actions: Action[],
  api: ReturnType<typeof createStageAPI>,
): string | null {
  if (outline.type === 'slide' && 'elements' in content) {
    // Build complete Slide object
    const defaultTheme: SlideTheme = {
      backgroundColor: '#ffffff',
      themeColors: ['#5b9bd5', '#ed7d31', '#a5a5a5', '#ffc000', '#4472c4'],
      fontColor: '#333333',
      fontName: 'Microsoft YaHei',
      outline: { color: '#d14424', width: 2, style: 'solid' },
      shadow: { h: 0, v: 0, blur: 10, color: '#000000' },
    };

    const slide: Slide = {
      id: nanoid(),
      viewportSize: 1000,
      viewportRatio: 0.5625,
      theme: content.theme || defaultTheme,
      elements: normalizeSlideTextLayout(content.elements),
      background: content.background,
    };

    const sceneResult = api.scene.create({
      type: 'slide',
      title: outline.title,
      order: outline.order,
      content: markSemanticSlideContent({
        type: 'slide',
        canvas: slide,
        semanticDocument: content.contentDocument,
      }),
      actions,
    });

    return sceneResult.success ? (sceneResult.data ?? null) : null;
  }

  if (outline.type === 'quiz' && 'questions' in content) {
    const sceneResult = api.scene.create({
      type: 'quiz',
      title: outline.title,
      order: outline.order,
      content: {
        type: 'quiz',
        questions: content.questions,
      },
      actions,
    });

    return sceneResult.success ? (sceneResult.data ?? null) : null;
  }

  if (outline.type === 'interactive' && 'html' in content) {
    const sceneResult = api.scene.create({
      type: 'interactive',
      title: outline.title,
      order: outline.order,
      content: {
        type: 'interactive',
        url: '',
        html: content.html,
      },
      actions,
    });

    return sceneResult.success ? (sceneResult.data ?? null) : null;
  }

  if (outline.type === 'pbl' && 'projectConfig' in content) {
    const sceneResult = api.scene.create({
      type: 'pbl',
      title: outline.title,
      order: outline.order,
      content: {
        type: 'pbl',
        projectConfig: content.projectConfig,
      },
      actions,
    });

    return sceneResult.success ? (sceneResult.data ?? null) : null;
  }

  return null;
}
