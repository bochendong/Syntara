import type {
  NotebookContentBlock,
  NotebookContentDocument,
  NotebookContentSlot,
} from '@/lib/notebook-content';
import type { PPTElement } from '@/lib/types/slides';

export interface SemanticSpotlightSection {
  readonly id: string;
  readonly title: string | null;
  readonly eyebrow: string | null;
  readonly blocks: NotebookContentBlock[];
  readonly blockTargets: SemanticSpotlightBlockTarget[];
  readonly text: string;
}

export interface SemanticSpotlightBlockTarget {
  readonly id: string;
  readonly sectionId: string;
  readonly title: string | null;
  readonly block: NotebookContentBlock;
  readonly text: string;
}

const SLOT_TITLE_LABELS = {
  'zh-CN': {
    context: '背景与目标',
    definition: '定义',
    theorem: '定理',
    proof: '证明过程',
    setup: '题目与目标',
    givens: '已知条件',
    goal: '求解目标',
    plan: '解题思路',
    solution: '解题过程',
    derivation: '推导过程',
    steps: '步骤',
    conclusion: '结论',
    summary: '小结',
    callout: '提示',
    left: '左侧内容',
    right: '右侧内容',
    top: '上方内容',
    middle: '中段内容',
    bottom: '下方内容',
  },
  'en-US': {
    context: 'Context',
    definition: 'Definition',
    theorem: 'Theorem',
    proof: 'Proof',
    setup: 'Problem',
    givens: 'Given',
    goal: 'Goal',
    plan: 'Plan',
    solution: 'Solution',
    derivation: 'Derivation',
    steps: 'Steps',
    conclusion: 'Conclusion',
    summary: 'Summary',
    callout: 'Note',
    left: 'Left',
    right: 'Right',
    top: 'Top',
    middle: 'Middle',
    bottom: 'Bottom',
  },
} as const;

function normalizeSlotKey(raw: string): string {
  return raw.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function isInternalSlotLabel(raw: string): boolean {
  const normalized = normalizeSlotKey(raw);
  return (
    /^slot\s*\d+$/.test(normalized) ||
    /^card\s*\d+$/.test(normalized) ||
    /^part\s*\d+/.test(normalized) ||
    /^column\s*\d+$/.test(normalized) ||
    /^row\s*\d+$/.test(normalized) ||
    /^cell\s*\d+$/.test(normalized)
  );
}

export function semanticSlotTitle(
  slot: NotebookContentSlot,
  index: number,
  language: string,
): string {
  const raw = slot.role || slot.slotId;
  const normalized = normalizeSlotKey(raw);
  const semanticSlotKey = normalized
    .replace(/^part\s+\d+\s+\d+\s+/, '')
    .replace(/^part\s+\d+\s+/, '');
  const labels = language === 'en-US' ? SLOT_TITLE_LABELS['en-US'] : SLOT_TITLE_LABELS['zh-CN'];

  if (/^card\s*\d+$/.test(semanticSlotKey)) {
    return language === 'en-US' ? `Key Point ${index + 1}` : `要点 ${index + 1}`;
  }

  if (/^row\s*\d+$/.test(semanticSlotKey)) {
    return language === 'en-US' ? `Row ${index + 1}` : `第 ${index + 1} 行`;
  }

  if (/^column\s*\d+$/.test(semanticSlotKey) || /^cell\s*\d+$/.test(semanticSlotKey)) {
    return language === 'en-US' ? `Section ${index + 1}` : `第 ${index + 1} 部分`;
  }

  const mappedTitle = labels[semanticSlotKey as keyof typeof labels];
  if (mappedTitle) return mappedTitle;

  if (semanticSlotKey && !isInternalSlotLabel(raw)) return semanticSlotKey;
  return language === 'en-US' ? `Section ${index + 1}` : `第 ${index + 1} 部分`;
}

function collectBlockText(block: NotebookContentBlock): string {
  const fragments: string[] = [];
  const visit = (value: unknown) => {
    if (typeof value === 'string') {
      fragments.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'type' || key === 'placement' || key === 'presentation') continue;
      visit(child);
    }
  };
  visit(block);
  return fragments.join(' ');
}

function summarizeBlocks(blocks: readonly NotebookContentBlock[], title?: string | null): string {
  return [title || '', ...blocks.map(collectBlockText)].join(' ').replace(/\s+/g, ' ').trim();
}

function blockTitle(block: NotebookContentBlock): string | null {
  if ('cardTitle' in block && block.cardTitle) return block.cardTitle;
  switch (block.type) {
    case 'heading':
      return block.text;
    case 'definition':
    case 'theorem':
    case 'example':
    case 'process_flow':
    case 'layout_cards':
    case 'code_walkthrough':
    case 'visual':
      return block.title || null;
    case 'derivation_steps':
      return block.title || null;
    case 'equation':
    case 'matrix':
    case 'table':
    case 'code_block':
    case 'chem_formula':
    case 'chem_equation':
      return block.caption || null;
    case 'callout':
      return block.title || null;
    case 'paragraph':
    case 'bullet_list':
      return null;
    default:
      return null;
  }
}

function buildBlockTarget(
  block: NotebookContentBlock,
  sectionId: string,
  blockIndex: number,
): SemanticSpotlightBlockTarget {
  const title = blockTitle(block);
  return {
    id: `${sectionId}-block-${blockIndex}`,
    sectionId,
    title,
    block,
    text: summarizeBlocks([block], title),
  };
}

export function buildSemanticSpotlightSections(
  document: NotebookContentDocument,
): SemanticSpotlightSection[] {
  if (document.slots?.length) {
    return document.slots
      .map((slot, index): SemanticSpotlightSection => {
        const title = semanticSlotTitle(slot, index, document.language);
        const blocks = slot.blocks as NotebookContentBlock[];
        const id = `slot-${slot.slotId || index}`;
        return {
          id,
          title,
          eyebrow: null,
          blocks,
          blockTargets: blocks.map((block, blockIndex) => buildBlockTarget(block, id, blockIndex)),
          text: summarizeBlocks(blocks, title),
        };
      })
      .filter((section) => section.blocks.length > 0);
  }

  const sections: SemanticSpotlightSection[] = [];
  let currentTitle: string | null = null;
  let currentBlocks: NotebookContentBlock[] = [];

  const pushCurrent = () => {
    if (!currentTitle && currentBlocks.length === 0) return;
    const id = `block-section-${sections.length}`;
    sections.push({
      id,
      title: currentTitle,
      eyebrow: null,
      blocks: currentBlocks,
      blockTargets: currentBlocks.map((block, blockIndex) =>
        buildBlockTarget(block, id, blockIndex),
      ),
      text: summarizeBlocks(currentBlocks, currentTitle),
    });
    currentTitle = null;
    currentBlocks = [];
  };

  for (const block of document.blocks) {
    if (block.type === 'heading') {
      pushCurrent();
      currentTitle = block.text;
      continue;
    }
    currentBlocks.push(block);
  }
  pushCurrent();

  if (sections.length > 0) return sections;

  return document.blocks.map((block, index) => ({
    id: `block-${index}`,
    title: null,
    eyebrow: null,
    blocks: [block],
    blockTargets: [buildBlockTarget(block, `block-${index}`, 0)],
    text: collectBlockText(block),
  }));
}

export function flattenSemanticSpotlightTargets(
  sections: readonly SemanticSpotlightSection[],
): SemanticSpotlightBlockTarget[] {
  return sections.flatMap((section) => section.blockTargets);
}

export function semanticSpotlightTargetIds(document: NotebookContentDocument): Set<string> {
  const sections = buildSemanticSpotlightSections(document);
  return new Set([
    'header',
    ...sections.map((section) => section.id),
    ...flattenSemanticSpotlightTargets(sections).map((target) => target.id),
  ]);
}

function cleanText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/[{}\\_$^]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function elementSearchText(element: PPTElement): string {
  const parts: string[] = [];
  if (element.name) parts.push(element.name);
  if (element.type === 'text') parts.push(element.content);
  if (element.type === 'shape') {
    const shapeName =
      'shapeName' in element && typeof element.shapeName === 'string' ? element.shapeName : '';
    parts.push(element.text?.content || '', shapeName);
  }
  if (element.type === 'latex') parts.push(element.latex);
  if (element.type === 'chart') parts.push(element.chartType);
  if (element.type === 'image') parts.push('image visual diagram');
  return parts.join(' ');
}

function scoreTextMatch(needleText: string, haystackText: string): number {
  const needle = cleanText(needleText);
  const haystack = cleanText(haystackText);
  if (!needle || !haystack) return 0;
  if (haystack.includes(needle) || needle.includes(haystack)) return Math.min(30, needle.length);

  const terms = needle.split(/\s+/).filter((term) => term.length >= 2);
  if (terms.length === 0) return 0;
  return terms.reduce((score, term) => score + (haystack.includes(term) ? term.length : 0), 0);
}

export function resolveSemanticSpotlightTargetForText(
  text: string,
  sections: readonly SemanticSpotlightSection[],
): string | null {
  const blockTargets = flattenSemanticSpotlightTargets(sections);
  const bestBlock = blockTargets
    .map((target) => ({
      id: target.id,
      score: scoreTextMatch(text, `${target.title || ''} ${target.text}`),
    }))
    .sort((a, b) => b.score - a.score)[0];

  if (bestBlock && bestBlock.score >= 8) return bestBlock.id;

  const bestSection = sections
    .map((section) => ({
      id: section.id,
      score: scoreTextMatch(text, `${section.title || ''} ${section.text}`),
    }))
    .sort((a, b) => b.score - a.score)[0];

  return bestSection && bestSection.score >= 8 ? bestSection.id : null;
}

export function resolveSemanticSpotlightTarget(
  spotlightElementId: string,
  elements: readonly PPTElement[],
  sections: readonly SemanticSpotlightSection[],
): string | null {
  if (!spotlightElementId) return null;
  if (spotlightElementId === 'header') return 'header';
  if (sections.some((section) => section.id === spotlightElementId)) return spotlightElementId;
  const blockTargets = flattenSemanticSpotlightTargets(sections);
  if (blockTargets.some((target) => target.id === spotlightElementId)) return spotlightElementId;

  const candidates = elements
    .filter((element) => element.type !== 'line' && element.type !== 'audio')
    .sort((a, b) => a.top - b.top || a.left - b.left);
  const elementIndex = candidates.findIndex((element) => element.id === spotlightElementId);
  const element = elementIndex >= 0 ? candidates[elementIndex] : null;

  if (element) {
    const sourceText = elementSearchText(element);
    const bestBlock = blockTargets
      .map((target) => ({
        id: target.id,
        score: scoreTextMatch(sourceText, `${target.title || ''} ${target.text}`),
      }))
      .sort((a, b) => b.score - a.score)[0];

    if (bestBlock && bestBlock.score >= 4) return bestBlock.id;

    const bestSection = sections
      .map((section) => ({
        id: section.id,
        score: scoreTextMatch(sourceText, `${section.title || ''} ${section.text}`),
      }))
      .sort((a, b) => b.score - a.score)[0];

    if (bestSection && bestSection.score >= 4) return bestSection.id;
  }

  if (elementIndex <= 0) {
    return elementIndex === 0 ? 'header' : sections[0]?.id || 'header';
  }

  const sectionIndex = Math.min(elementIndex - 1, Math.max(0, sections.length - 1));
  return sections[sectionIndex]?.id || 'header';
}
