import { renderSemanticSlideContent } from '@/lib/notebook-content/semantic-slide-render';
import {
  normalizeSyntaraMarkupLayout,
  type NotebookContentBlock,
  type NotebookContentDocument,
} from '@/lib/notebook-content';
import { validateSlideTextLayout } from '@/lib/slide-text-layout';
import { normalizeLatexSource } from '@/lib/latex-utils';
import type { SceneOutline } from '@/lib/types/generation';
import type { Scene, SceneType } from '@/lib/types/stage';
import { RAW_DATA_BASE_TYPES, serializeSceneForRawView } from '@/components/stage/stage-helpers';

export type RawSlideDataView = 'source' | 'compiled' | 'render' | 'outline' | 'narration' | 'ui';

export function getRawDataTabTypes(outlines: SceneOutline[], scenes: Scene[]): SceneType[] {
  const present = new Set<SceneType>();
  for (const outline of outlines) present.add(outline.type);
  for (const scene of scenes) present.add(scene.type);
  const extras = [...present].filter((type) => !RAW_DATA_BASE_TYPES.includes(type)).sort();
  return [...RAW_DATA_BASE_TYPES, ...extras];
}

export function getRawCurrentScene(currentScene: Scene | null | undefined, tabType: SceneType) {
  if (currentScene && currentScene.type === tabType) return currentScene;
  return null;
}

export function getRawCurrentOutline(
  outlines: SceneOutline[],
  scene: Scene | null,
  tabType: SceneType,
) {
  if (!scene) return null;
  const byOrder = outlines.find(
    (outline) => outline.type === tabType && outline.order === scene.order,
  );
  if (byOrder) return byOrder;
  return (
    outlines.find(
      (outline) =>
        outline.type === tabType &&
        outline.title.trim().toLowerCase() === scene.title.trim().toLowerCase(),
    ) || null
  );
}

export function canReflowGridScene(scene: Scene | null): boolean {
  if (!scene || scene.type !== 'slide' || scene.content.type !== 'slide') return false;
  return scene.content.semanticDocument?.layout?.mode === 'grid';
}

export function canReflowLayoutCardsScene(scene: Scene | null): boolean {
  if (!scene || scene.type !== 'slide' || scene.content.type !== 'slide') return false;
  return Boolean(
    scene.content.semanticDocument?.blocks.some((block) => block.type === 'layout_cards'),
  );
}

export function renderReflowedGridScene(scene: Scene) {
  if (!canReflowGridScene(scene) || scene.type !== 'slide' || scene.content.type !== 'slide') {
    return null;
  }
  const semanticDocument = scene.content.semanticDocument;
  if (!semanticDocument) return null;
  return renderSemanticSlideContent({
    document: semanticDocument,
    fallbackTitle: semanticDocument.title || scene.title,
    preserveCanvasId: scene.content.canvas.id,
  });
}

export function renderReflowedLayoutCardsScene(scene: Scene) {
  if (
    !canReflowLayoutCardsScene(scene) ||
    scene.type !== 'slide' ||
    scene.content.type !== 'slide'
  ) {
    return null;
  }
  const semanticDocument = scene.content.semanticDocument;
  if (!semanticDocument) return null;
  return renderSemanticSlideContent({
    document: semanticDocument,
    fallbackTitle: semanticDocument.title || scene.title,
    preserveCanvasId: scene.content.canvas.id,
  });
}

export function buildRawTypePayloadJson(args: {
  currentSceneId: string | null;
  rawDataSubTab: SceneType;
  rawSlideDataView: RawSlideDataView;
  rawCurrentOutline: SceneOutline | null;
  rawCurrentScene: Scene | null;
}): string {
  try {
    const type = args.rawDataSubTab;
    const scene = args.rawCurrentScene;
    const scenePayload = !scene
      ? null
      : type === 'slide'
        ? buildSlideRawPayload({
            scene,
            view: args.rawSlideDataView,
            outline: args.rawCurrentOutline,
            currentSceneId: args.currentSceneId,
          })
        : serializeSceneForRawView(scene);

    return JSON.stringify(
      {
        type,
        view: type === 'slide' ? args.rawSlideDataView : 'default',
        sceneId: scene?.id ?? null,
        ...(type !== 'slide' || args.rawSlideDataView === 'outline'
          ? { outline: args.rawCurrentOutline }
          : {}),
        scene: scenePayload,
      },
      null,
      2,
    );
  } catch {
    return '{"error":"serialize_failed"}';
  }
}

function buildSlideRawPayload(args: {
  scene: Scene;
  view: RawSlideDataView;
  outline: SceneOutline | null;
  currentSceneId: string | null;
}) {
  const { scene, view, outline, currentSceneId } = args;
  const semanticArtifacts = getSlideSemanticArtifacts(scene);

  if (view === 'source') {
    return {
      id: scene.id,
      type: scene.type,
      title: scene.title,
      order: scene.order,
      sourceFormat: semanticArtifacts.syntaraMarkup
        ? 'syntara-markup'
        : semanticArtifacts.semanticDocument
          ? 'semantic-document'
          : 'canvas-elements',
      syntaraMarkup: semanticArtifacts.syntaraMarkup,
      note: '模型输出的 Syntara Markup 源。这里应尽量保持接近生成时的块结构，不展示 canvas 坐标和 KaTeX HTML。',
    };
  }

  if (view === 'compiled') {
    return {
      id: scene.id,
      type: scene.type,
      title: scene.title,
      order: scene.order,
      sourceFormat: semanticArtifacts.syntaraMarkup
        ? 'syntara-markup'
        : semanticArtifacts.semanticDocument
          ? 'semantic-document'
          : 'canvas-elements',
      contentDocument: semanticArtifacts.semanticDocument ?? null,
      note: 'Syntara Markup 编译后的语义文档。它描述内容结构和版式意图，还不是最终画布元素。',
    };
  }

  if (view === 'render') {
    return {
      id: scene.id,
      type: scene.type,
      title: scene.title,
      order: scene.order,
      renderOutput: semanticArtifacts.renderOutput,
      note: '语义文档渲染到画布前后的摘要信息。完整元素树请看 UI 计算。',
    };
  }

  if (view === 'outline') {
    return {
      id: scene.id,
      type: scene.type,
      title: scene.title,
      order: scene.order,
      outline,
    };
  }

  if (view === 'narration') {
    return {
      id: scene.id,
      type: scene.type,
      title: scene.title,
      order: scene.order,
      actions: scene.actions || [],
    };
  }

  const serialized = serializeSceneForRawView(scene, {
    expandSlideCanvas: scene.id === currentSceneId && scene.content.type === 'slide',
  }) as Record<string, unknown>;
  const actions = Array.isArray(scene.actions) ? scene.actions : [];
  return {
    ...serialized,
    actionsSummary: {
      total: actions.length,
      speech: actions.filter((action) => action.type === 'speech').length,
      spotlight: actions.filter((action) => action.type === 'spotlight').length,
      laser: actions.filter((action) => action.type === 'laser').length,
    },
  };
}

function getSlideSemanticArtifacts(scene: Scene) {
  const content = scene.content.type === 'slide' ? scene.content : null;
  const semanticDocument = content?.semanticDocument;
  const syntaraMarkup =
    (content?.syntaraMarkup ? normalizeSyntaraMarkupLayout(content.syntaraMarkup) : null) ||
    (semanticDocument ? serializeNotebookDocumentToSyntaraMarkup(semanticDocument) : null);
  const layoutValidation = content ? validateSlideTextLayout(content.canvas.elements) : null;

  return {
    content,
    semanticDocument,
    syntaraMarkup,
    renderOutput: content
      ? {
          canvasId: content.canvas.id,
          elementCount: content.canvas.elements.length,
          background: content.canvas.background,
          theme: content.canvas.theme,
          semanticRenderVersion: content.semanticRenderVersion,
          semanticRenderMode: content.semanticRenderMode,
          layoutValidation,
        }
      : null,
  };
}

const SYNTARA_TEXT_MATH_PATTERN =
  /(\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;

function normalizeSyntaraMathText(value: string): string {
  const normalized = value.replace(/\\\\(?=[A-Za-z])/g, '\\');
  const displayMatch = normalized.match(/^\$\$([\s\S]+)\$\$$/);
  if (displayMatch?.[1]) return `$$${normalizeLatexSource(displayMatch[1])}$$`;
  const inlineMatch = normalized.match(/^\$([^$\n]+)\$$/);
  if (inlineMatch?.[1]) return `$${normalizeLatexSource(inlineMatch[1])}$`;
  const bracketMatch = normalized.match(/^\\\[([\s\S]+)\\\]$/);
  if (bracketMatch?.[1]) return `\\[${normalizeLatexSource(bracketMatch[1])}\\]`;
  const parenMatch = normalized.match(/^\\\(([\s\S]+)\\\)$/);
  if (parenMatch?.[1]) return `\\(${normalizeLatexSource(parenMatch[1])}\\)`;
  return normalized;
}

function escapeSyntaraPlainText(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('{', '\\{').replaceAll('}', '\\}');
}

function escapeSyntaraText(value: string | undefined): string {
  const raw = value || '';
  if (!raw) return '';

  let output = '';
  let lastIndex = 0;
  raw.replace(SYNTARA_TEXT_MATH_PATTERN, (match, _unused, offset) => {
    const index = typeof offset === 'number' ? offset : 0;
    output += escapeSyntaraPlainText(raw.slice(lastIndex, index));
    output += normalizeSyntaraMathText(match);
    lastIndex = index + match.length;
    return match;
  });
  output += escapeSyntaraPlainText(raw.slice(lastIndex));
  return output;
}

function blockToSyntaraMarkup(block: NotebookContentBlock, indent: string): string {
  switch (block.type) {
    case 'heading':
      return `${indent}\\heading{${escapeSyntaraText(block.text)}}`;
    case 'paragraph':
      return `${indent}\\text{${escapeSyntaraText(block.text)}}`;
    case 'bullet_list':
      return block.items.map((item) => `${indent}\\bullet{${escapeSyntaraText(item)}}`).join('\n');
    case 'definition':
      return `${indent}\\definition{${escapeSyntaraText(block.title || 'Definition')}}{${escapeSyntaraText(block.text)}}`;
    case 'theorem':
      return `${indent}\\theorem{${escapeSyntaraText(block.title || 'Theorem')}}{${escapeSyntaraText(block.text)}}`;
    case 'equation':
      return `${indent}\\formula{${block.latex}}`;
    case 'matrix':
      return `${indent}\\formula{\\begin{${block.brackets}}\n${block.rows
        .map((row) => row.join(' & '))
        .join(' \\\\\n')}\n\\end{${block.brackets}}}`;
    case 'derivation_steps':
      return [
        `${indent}\\begin{derivation}${block.title ? `[title={${escapeSyntaraText(block.title)}}]` : ''}`,
        ...block.steps.map(
          (step) =>
            `${indent}  \\step{${escapeSyntaraText(step.explanation || '')}}{${step.expression}}`,
        ),
        `${indent}\\end{derivation}`,
      ].join('\n');
    case 'code_block':
      return `${indent}\\code[lang=${block.language || 'text'}]{${block.code}}`;
    case 'code_walkthrough':
      return `${indent}\\code[lang=${block.language || 'text'}]{${block.code}}`;
    case 'table':
      return `${indent}\\table${
        block.headers?.length ? `[headers={${block.headers.map(escapeSyntaraText).join('|')}}]` : ''
      }{${block.rows.map((row) => row.map(escapeSyntaraText).join('|')).join(' \\\\ ')}}`;
    case 'callout':
      return `${indent}\\callout{${escapeSyntaraText(block.title || block.tone)}}{${escapeSyntaraText(block.text)}}`;
    case 'example':
      return `${indent}\\example{${escapeSyntaraText(block.title || 'Example')}}{${escapeSyntaraText(block.problem)}}`;
    case 'process_flow':
      return [
        `${indent}\\begin{process}${block.title ? `[title={${escapeSyntaraText(block.title)}}]` : ''}`,
        ...block.steps.map(
          (step) =>
            `${indent}  \\step{${escapeSyntaraText(step.title)}}{${escapeSyntaraText(step.detail)}}`,
        ),
        `${indent}\\end{process}`,
      ].join('\n');
    case 'visual':
      return `${indent}\\image[source=${block.source}${
        block.caption ? `,caption={${escapeSyntaraText(block.caption)}}` : ''
      }]`;
    case 'layout_cards':
      return block.items
        .map(
          (item) =>
            `${indent}\\begin{block}[title={${escapeSyntaraText(item.title)}}]\n${indent}  ${escapeSyntaraText(item.text)}\n${indent}\\end{block}`,
        )
        .join('\n');
    case 'chem_formula':
      return `${indent}\\formula{${block.formula}}`;
    case 'chem_equation':
      return `${indent}\\formula{${block.equation}}`;
    default:
      return `${indent}\\text{${escapeSyntaraText(JSON.stringify(block))}}`;
  }
}

export function serializeNotebookDocumentToSyntaraMarkup(
  document: NotebookContentDocument,
): string {
  const attrs = [
    document.title ? `title={${escapeSyntaraText(document.title)}}` : null,
    document.layoutTemplate ? `template=${document.layoutTemplate}` : null,
    document.density ? `density=${document.density}` : null,
    document.profile ? `profile=${document.profile}` : null,
    document.language ? `language=${document.language}` : null,
  ].filter(Boolean);
  const body =
    document.slots && document.slots.length > 0
      ? slotsToSyntaraMarkup(document)
      : document.blocks.map((block) => blockToSyntaraMarkup(block, '  ')).join('\n');

  return [`\\begin{slide}${attrs.length ? `[${attrs.join(',')}]` : ''}`, body, '\\end{slide}']
    .filter(Boolean)
    .join('\n');
}

function slotsToSyntaraMarkup(document: NotebookContentDocument): string {
  const slots = document.slots || [];
  const byId = new Map(slots.map((slot) => [slot.slotId, slot]));
  const twoColumnSlots = ['left', 'right'].map((slotId) => byId.get(slotId));
  if (document.layoutTemplate === 'two_column' && twoColumnSlots.every(Boolean)) {
    return [
      '  \\begin{columns}',
      ...twoColumnSlots.map((slot) =>
        [
          `    \\begin{column}[name=${slot?.slotId}]`,
          ...(slot?.blocks || []).map((block) => blockToSyntaraMarkup(block, '      ')),
          '    \\end{column}',
        ].join('\n'),
      ),
      '  \\end{columns}',
    ].join('\n');
  }

  const cardIds =
    document.layoutTemplate === 'four_grid'
      ? ['card_1', 'card_2', 'card_3', 'card_4']
      : ['card_1', 'card_2', 'card_3'];
  const cardSlots = cardIds.map((slotId) => byId.get(slotId));
  if (
    (document.layoutTemplate === 'three_cards' || document.layoutTemplate === 'four_grid') &&
    cardSlots.every(Boolean)
  ) {
    return [
      '  \\begin{grid}',
      ...cardSlots.map((slot) =>
        [
          `    \\begin{cell}[name=${slot?.slotId}]`,
          ...(slot?.blocks || []).map((block) => blockToSyntaraMarkup(block, '      ')),
          '    \\end{cell}',
        ].join('\n'),
      ),
      '  \\end{grid}',
    ].join('\n');
  }

  return slots
    .map((slot) =>
      [
        `  \\begin{block}[slot=${slot.slotId}]`,
        ...slot.blocks.map((block) => blockToSyntaraMarkup(block, '    ')),
        '  \\end{block}',
      ].join('\n'),
    )
    .join('\n');
}
