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

export function buildTemplateDrivenSemanticDocument(
  outline: SceneOutline,
  language: 'zh-CN' | 'en-US',
): NotebookContentDocument | null {
  const slotOnlyTemplateChainEnabled = false;
  if (!slotOnlyTemplateChainEnabled) return null;
  if (outline.type !== 'slide') return null;
  const archetype = outline.archetype || 'concept';
  if (archetype !== 'intro' && archetype !== 'summary') return null;
  const variant = pickDeterministicTemplateVariant(outline, 3);
  return archetype === 'intro'
    ? buildIntroTemplateDocument(outline, language, variant)
    : buildSummaryTemplateDocument(outline, language, variant);
}
