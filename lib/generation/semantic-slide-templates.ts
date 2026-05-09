import type { SceneOutline } from '@/lib/types/generation';
import {
  parseNotebookContentDocument,
  type NotebookContentBlockPlacement,
  type NotebookContentDocument,
} from '@/lib/notebook-content';

export function normalizeColumnLayoutBlocks(
  document: NotebookContentDocument,
): NotebookContentDocument {
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

export function normalizeGridPlacementHints(
  document: NotebookContentDocument,
): NotebookContentDocument {
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
  maxSteps = 4,
): Array<{ title: string; detail: string }> {
  const sliced = points.slice(0, maxSteps);
  const enriched =
    sliced.length >= 2
      ? sliced
      : language === 'en-US'
        ? ['Introduce the concept scope.', 'Summarize how to apply it.']
        : ['明确概念边界。', '总结如何应用。'];
  return enriched.map((item, index) => ({
    title:
      item.split(/[：:]/)[0]?.trim() ||
      (language === 'en-US' ? `Step ${index + 1}` : `步骤 ${index + 1}`),
    detail: item.split(/[：:]/).slice(1).join('：').trim() || item,
  }));
}

function buildProcessStepsTemplateDocument(
  outline: SceneOutline,
  language: 'zh-CN' | 'en-US',
): NotebookContentDocument | null {
  if (outline.layoutIntent?.layoutTemplate !== 'process_steps') return null;
  const points = normalizeKeyPointsForTemplate(outline, language);
  const steps = toTemplateFlowSteps(points, language, 5);
  const candidate: unknown = {
    version: 1,
    language,
    profile: outline.contentProfile || 'general',
    archetype: outline.archetype || 'concept',
    layout: { mode: 'stack' },
    layoutFamily: outline.layoutIntent?.layoutFamily || 'timeline',
    layoutTemplate: 'process_steps',
    density: outline.layoutIntent?.density || 'standard',
    deckStyle: outline.layoutIntent?.deckStyle,
    disciplineStyle: outline.layoutIntent?.disciplineStyle || 'general',
    teachingFlow: outline.layoutIntent?.teachingFlow || 'timeline_story',
    visualRole: outline.layoutIntent?.visualRole || 'diagram',
    title: outline.title,
    blocks: [
      {
        type: 'process_flow',
        title: outline.teachingPagePlan?.concreteAnchor || outline.title,
        orientation: 'horizontal',
        steps,
      },
    ],
  };

  return parseNotebookContentDocument(candidate);
}

function splitTemplatePoint(
  item: string,
  fallbackTitle: string,
): { title: string; detail: string } {
  const normalized = item.replace(/\s+/g, ' ').trim();
  const fullWidthColon = normalized.indexOf('：');
  const mathLike = /[=∈∃∀⊆⊇×→←↔\\{}^]|[A-Za-z]\([^)]*\)/.test(normalized);
  const asciiColon = mathLike ? -1 : normalized.search(/:\s+/);
  const splitIndex = fullWidthColon > 0 ? fullWidthColon : asciiColon > 0 ? asciiColon : -1;
  if (splitIndex > 0) {
    const title = normalized.slice(0, splitIndex).trim();
    const detail = normalized.slice(splitIndex + 1).trim();
    if (title && detail) return { title: compactCoverText(title, fallbackTitle, 42), detail };
  }
  return {
    title: compactCoverText(normalized || fallbackTitle, fallbackTitle, 42),
    detail: normalized,
  };
}

function uniqueTemplateLines(lines: string[]): string[] {
  const seen = new Set<string>();
  return lines.filter((line) => {
    const normalized = line.replace(/\s+/g, ' ').trim();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function normalizeTeachingRuleForSlide(outline: SceneOutline, language: 'zh-CN' | 'en-US'): string {
  const raw =
    outline.studentThinkingMove ||
    outline.teachingPagePlan?.studentThinkingMove ||
    outline.teachingPagePlan?.transferRule ||
    '';
  const normalized = raw.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return language === 'en-US'
      ? 'Compare one criterion at a time before drawing a conclusion.'
      : '先逐项比较同一维度，再回到结论。';
  }
  if (language === 'zh-CN') {
    return normalized
      .replace(/^让学生/, '先')
      .replace(/^要求学生/, '先')
      .replace(/本页/g, '这里')
      .replace(/下一步要验证什么条件/, '下一步验证哪个条件');
  }
  return normalized
    .replace(/^Students should\s+/i, '')
    .replace(/^Have students\s+/i, '')
    .replace(/^Learners should\s+/i, '');
}

function buildComparisonMatrixTemplateDocument(
  outline: SceneOutline,
  language: 'zh-CN' | 'en-US',
): NotebookContentDocument | null {
  if (outline.layoutIntent?.layoutTemplate !== 'comparison_matrix') return null;
  const anchor = outline.teachingPagePlan?.concreteAnchor?.trim();
  const points = normalizeKeyPointsForTemplate(outline, language);
  const rowsSource = uniqueTemplateLines(points).slice(0, 3);
  while (rowsSource.length < 3) {
    rowsSource.push(
      language === 'en-US'
        ? `Key point ${rowsSource.length + 1}: ${outline.title}`
        : `要点 ${rowsSource.length + 1}：${outline.title}`,
    );
  }

  const rows = rowsSource.map((item, index) => {
    const split = splitTemplatePoint(
      item,
      language === 'en-US' ? `Item ${index + 1}` : `对象 ${index + 1}`,
    );
    return [
      split.title,
      split.detail,
      index === 0
        ? language === 'en-US'
          ? 'Use the definition directly.'
          : '直接套用定义。'
        : language === 'en-US'
          ? 'Compare on the same criterion.'
          : '按同一条件比较。',
    ];
  });
  const effectiveHeaders =
    language === 'en-US'
      ? ['Object', 'Evidence / definition', 'How to use it']
      : ['对象', '依据 / 定义', '如何使用'];

  const candidate: unknown = {
    version: 1,
    language,
    profile: outline.contentProfile || 'general',
    archetype: outline.archetype || 'concept',
    layout: { mode: 'stack' },
    layoutFamily: 'comparison',
    layoutTemplate: 'comparison_matrix',
    density: outline.layoutIntent?.density || 'standard',
    deckStyle: outline.layoutIntent?.deckStyle,
    disciplineStyle: outline.layoutIntent?.disciplineStyle || 'general',
    teachingFlow: outline.layoutIntent?.teachingFlow || 'comparison_review',
    visualRole: outline.layoutIntent?.visualRole || 'none',
    title: outline.title,
    blocks: [
      {
        type: 'table',
        caption: anchor || outline.teachingPagePlan?.studentThinkingMove || outline.description,
        headers: effectiveHeaders,
        rows,
      },
      {
        type: 'callout',
        tone: 'tip',
        title: language === 'en-US' ? 'Reading rule' : '阅读规则',
        text: normalizeTeachingRuleForSlide(outline, language),
      },
    ],
  };

  return parseNotebookContentDocument(candidate);
}

function buildGridCardsTemplateDocument(
  outline: SceneOutline,
  language: 'zh-CN' | 'en-US',
): NotebookContentDocument | null {
  const template = outline.layoutIntent?.layoutTemplate;
  if (template !== 'grid_2x2' && template !== 'three_cards') return null;
  const anchor = outline.teachingPagePlan?.concreteAnchor?.trim();
  const points = uniqueTemplateLines([
    anchor || '',
    ...normalizeKeyPointsForTemplate(outline, language),
  ]).slice(0, template === 'grid_2x2' ? 4 : 3);
  while (points.length < (template === 'grid_2x2' ? 4 : 3)) {
    points.push(
      language === 'en-US'
        ? `Key point ${points.length + 1}: ${outline.title}`
        : `要点 ${points.length + 1}：${outline.title}`,
    );
  }

  const candidate: unknown = {
    version: 1,
    language,
    profile: outline.contentProfile || 'general',
    archetype: outline.archetype || 'concept',
    layout: { mode: 'stack' },
    layoutFamily: 'concept_cards',
    layoutTemplate: template,
    density: outline.layoutIntent?.density || 'standard',
    deckStyle: outline.layoutIntent?.deckStyle,
    disciplineStyle: outline.layoutIntent?.disciplineStyle || 'general',
    teachingFlow: outline.layoutIntent?.teachingFlow || 'concept_explain',
    visualRole: outline.layoutIntent?.visualRole || 'none',
    title: outline.title,
    blocks: [
      {
        type: 'layout_cards',
        columns: template === 'grid_2x2' ? 2 : 3,
        items: points.map((point, index) => {
          const split = splitTemplatePoint(
            point,
            language === 'en-US' ? `Point ${index + 1}` : `要点 ${index + 1}`,
          );
          return {
            title: split.title,
            text: split.detail,
            tone:
              index === 0 ? 'info' : index === 1 ? 'success' : index === 2 ? 'warning' : 'neutral',
          };
        }),
      },
    ],
  };

  return parseNotebookContentDocument(candidate);
}

function buildFunctionsMathTemplateDocument(
  outline: SceneOutline,
  language: 'zh-CN' | 'en-US',
): NotebookContentDocument | null {
  const zh = language === 'zh-CN';
  const concreteAnchor = outline.teachingPagePlan?.concreteAnchor?.trim();
  if (outline.pagePatternId === 'math_functions_opening') {
    const candidate: unknown = {
      version: 1,
      language,
      profile: 'math',
      archetype: 'intro',
      layout: { mode: 'stack' },
      layoutFamily: 'timeline',
      layoutTemplate: 'process_steps',
      density: outline.layoutIntent?.density || 'standard',
      deckStyle: outline.layoutIntent?.deckStyle || 'academic',
      disciplineStyle: 'math',
      teachingFlow: 'definition_to_example',
      visualRole: 'none',
      title: outline.title,
      blocks: [
        {
          type: 'process_flow',
          title:
            concreteAnchor ||
            (zh ? '函数把每个输入对应到唯一输出。' : 'A function assigns each input one output.'),
          orientation: 'vertical',
          steps: zh
            ? [
                {
                  title: '点名数据',
                  detail: '$f: A \\to B$ 说明定义域、陪域和规则方向。',
                },
                {
                  title: '检查输出',
                  detail: '每个 $a\\in A$ 都要有且只有一个输出。',
                },
                {
                  title: '继续使用',
                  detail: '再讨论图像、像、原像和值域，概念才不会混。',
                },
              ]
            : [
                {
                  title: 'Name the data',
                  detail: '$f: A \\to B$ gives domain, codomain, and rule.',
                },
                {
                  title: 'Check outputs',
                  detail: 'Each $a\\in A$ gets exactly one value.',
                },
                {
                  title: 'Use next',
                  detail: 'Then study graph, image, preimage, and range.',
                },
              ],
        },
      ],
    };

    return parseNotebookContentDocument(candidate);
  }

  if (outline.pagePatternId === 'math_function_definition') {
    const candidate: unknown = {
      version: 1,
      language,
      profile: 'math',
      archetype: 'definition',
      layout: { mode: 'stack' },
      layoutFamily: 'formula_focus',
      layoutTemplate: 'formula_focus',
      density: outline.layoutIntent?.density || 'standard',
      deckStyle: outline.layoutIntent?.deckStyle || 'academic',
      disciplineStyle: 'math',
      teachingFlow: 'definition_to_example',
      visualRole: 'none',
      title: outline.title,
      blocks: [
        {
          type: 'definition',
          title: zh ? '函数的数据' : 'Function data',
          text: zh
            ? '一个函数由定义域 $A$、陪域 $B$ 和把每个输入唯一送到输出的规则组成。'
            : 'A function consists of a domain $A$, a codomain $B$, and a rule assigning each input exactly one output.',
        },
        {
          type: 'equation',
          latex: '\\Gamma(f)=\\{(a,f(a)) : a\\in A\\}\\subseteq A\\times B',
          display: true,
          caption:
            concreteAnchor ||
            (zh ? '把函数看作一种关系时的图像' : 'Graph of a function as a relation'),
        },
        {
          type: 'bullet_list',
          cardTitle: zh ? '函数判定' : 'Definition test',
          titleTone: 'accent',
          items: zh
            ? [
                '存在性：每个 $a\\in A$ 都必须有输出。',
                '唯一性：同一个输入不能配到两个不同输出。',
                '陪域是允许输出的空间，值域是实际出现的输出。',
              ]
            : [
                'Left-total: every $a\\in A$ has an output.',
                'Functional: no input is paired with two different outputs.',
                'Codomain is allowed output space; range is actual outputs.',
              ],
        },
      ],
    };

    return parseNotebookContentDocument(candidate);
  }

  return null;
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
                summary:
                  language === 'en-US'
                    ? 'Follow this sequence in class.'
                    : '按此顺序推进课堂讲解。',
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
              summary:
                language === 'en-US'
                  ? 'Use this as your final review path.'
                  : '将此流程作为期末回顾路径。',
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

function isImageFirstCoverTemplate(template: string | undefined): boolean {
  return (
    template === 'image_title_overlay' ||
    template === 'cinematic_title_frame' ||
    template === 'tech_hero_title'
  );
}

function compactCoverText(input: string | undefined, fallback: string, maxLength: number): string {
  const normalized = (input || fallback).replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  const clipped = normalized
    .slice(0, maxLength)
    .replace(/\s+\S*$/, '')
    .trim();
  return clipped.length >= 24 ? clipped : normalized.slice(0, maxLength).trim();
}

const COVER_STUDENT_TEXT_PLACEHOLDER_PATTERN =
  /本页是|本页面|this cover|this page|主视觉|封面图片|封面主视觉|背景图|cover image|main image|background image|hero image|visual related|readable over|visual tone|abstract network background/i;

function pickCoverStudentText(
  candidates: Array<string | undefined>,
  fallback: string,
  maxLength: number,
): string {
  const selected = candidates
    .map((candidate) => candidate?.replace(/\s+/g, ' ').trim())
    .find((candidate): candidate is string =>
      Boolean(candidate && !COVER_STUDENT_TEXT_PLACEHOLDER_PATTERN.test(candidate)),
    );
  return compactCoverText(selected, fallback, maxLength);
}

function buildImageFirstCoverTemplateDocument(
  outline: SceneOutline,
  language: 'zh-CN' | 'en-US',
): NotebookContentDocument | null {
  const template = outline.layoutIntent?.layoutTemplate;
  if (!isImageFirstCoverTemplate(template)) return null;

  const points = (outline.keyPoints || []).map((point) => point.trim()).filter(Boolean);
  const firstPoint = points[0];
  const subtitle = pickCoverStudentText(
    [firstPoint, outline.teachingPagePlan?.studentThinkingMove, outline.description],
    language === 'en-US'
      ? 'A focused opening for the pages that follow.'
      : '为后续页面建立清晰入口。',
    128,
  );

  const candidate: unknown = {
    version: 1,
    language,
    profile: outline.contentProfile || 'general',
    archetype: outline.archetype || 'intro',
    layout: { mode: 'stack' },
    layoutFamily: 'cover',
    layoutTemplate: template,
    density: outline.layoutIntent?.density || 'light',
    deckStyle: outline.layoutIntent?.deckStyle,
    disciplineStyle: outline.layoutIntent?.disciplineStyle,
    teachingFlow: outline.layoutIntent?.teachingFlow || 'standalone',
    visualRole: 'source_image',
    title: outline.title,
    visualSlot: {
      source: 'built_in_hero_background',
      alt: outline.title,
      role: 'source_image',
      fit: 'cover',
      emphasis: 'primary',
    },
    blocks: [
      {
        type: 'visual',
        source: 'built_in_hero_background',
        role: 'source_image',
        fit: 'cover',
        emphasis: 'primary',
      },
      {
        type: 'paragraph',
        text: subtitle,
      },
    ],
  };

  return parseNotebookContentDocument(candidate);
}

export function buildTemplateDrivenSemanticDocument(
  outline: SceneOutline,
  language: 'zh-CN' | 'en-US',
): NotebookContentDocument | null {
  if (outline.type !== 'slide') return null;
  const functionsMathTemplatesEnabled =
    typeof process !== 'undefined' && process.env.SYNTARA_USE_FUNCTIONS_MATH_TEMPLATE === 'true';
  const functionsMath = functionsMathTemplatesEnabled
    ? buildFunctionsMathTemplateDocument(outline, language)
    : null;
  if (functionsMath) return functionsMath;
  const imageFirstCover = buildImageFirstCoverTemplateDocument(outline, language);
  if (imageFirstCover) return imageFirstCover;
  const comparisonMatrix = buildComparisonMatrixTemplateDocument(outline, language);
  if (comparisonMatrix) return comparisonMatrix;
  const gridCards = buildGridCardsTemplateDocument(outline, language);
  if (gridCards) return gridCards;
  const processSteps = buildProcessStepsTemplateDocument(outline, language);
  if (processSteps) return processSteps;

  const slotOnlyTemplateChainEnabled = false;
  if (!slotOnlyTemplateChainEnabled) return null;
  const archetype = outline.archetype || 'concept';
  if (archetype !== 'intro' && archetype !== 'summary') return null;
  const variant = pickDeterministicTemplateVariant(outline, 3);
  return archetype === 'intro'
    ? buildIntroTemplateDocument(outline, language, variant)
    : buildSummaryTemplateDocument(outline, language, variant);
}
