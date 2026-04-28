'use client';

import { useMemo } from 'react';
import { NotebookContentView } from '@/components/notebook-content/notebook-content-view';
import { renderInlineMathAwareHtml } from '@/lib/math-engine';
import type {
  NotebookContentBlock,
  NotebookContentDocument,
  NotebookContentSlot,
} from '@/lib/notebook-content';
import { cn } from '@/lib/utils';

interface SemanticScrollPageProps {
  readonly document: NotebookContentDocument;
  readonly sceneId: string;
  readonly title: string;
}

interface SemanticScrollSection {
  readonly id: string;
  readonly title: string | null;
  readonly eyebrow: string | null;
  readonly blocks: NotebookContentBlock[];
}

type SemanticSectionTone =
  | 'plain'
  | 'definition'
  | 'process'
  | 'formula'
  | 'callout'
  | 'problem'
  | 'cards';

function renderInlineMathHtml(text: string): string {
  return renderInlineMathAwareHtml(text);
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

function slotTitle(slot: NotebookContentSlot, index: number, language: string): string {
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

function buildBlockSections(document: NotebookContentDocument): SemanticScrollSection[] {
  if (document.slots?.length) {
    return document.slots
      .map((slot, index): SemanticScrollSection => {
        const title = slotTitle(slot, index, document.language);
        return {
          id: `slot-${slot.slotId || index}`,
          title,
          eyebrow: null,
          blocks: slot.blocks as NotebookContentBlock[],
        };
      })
      .filter((section) => section.blocks.length > 0);
  }

  const sections: SemanticScrollSection[] = [];
  let currentTitle: string | null = null;
  let currentBlocks: NotebookContentBlock[] = [];

  const pushCurrent = () => {
    if (!currentTitle && currentBlocks.length === 0) return;
    sections.push({
      id: `block-section-${sections.length}`,
      title: currentTitle,
      eyebrow: null,
      blocks: currentBlocks,
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
  }));
}

function documentForSection(
  document: NotebookContentDocument,
  blocks: NotebookContentBlock[],
): NotebookContentDocument {
  return {
    ...document,
    version: 1,
    layout: { mode: 'stack' },
    slots: undefined,
    pattern: undefined,
    blocks,
  };
}

function sectionTone(section: SemanticScrollSection): SemanticSectionTone {
  const blockTypes = new Set(section.blocks.map((block) => block.type));
  if (blockTypes.has('process_flow') || blockTypes.has('derivation_steps')) return 'process';
  if (blockTypes.has('equation') || blockTypes.has('matrix')) return 'formula';
  if (blockTypes.has('definition') || blockTypes.has('theorem')) return 'definition';
  if (blockTypes.has('callout')) return 'callout';
  if (blockTypes.has('example')) return 'problem';
  if (blockTypes.has('layout_cards') || blockTypes.has('bullet_list')) return 'cards';
  return 'plain';
}

function sectionChrome(tone: SemanticSectionTone, index: number) {
  const alternatingPlain =
    index % 2 === 0 ? 'bg-transparent' : 'bg-slate-50/55 ring-1 ring-slate-100';
  const styles = {
    plain: {
      section: cn('py-2', alternatingPlain, index % 2 === 0 ? '' : 'rounded-lg px-5'),
      label: 'text-slate-500',
      badge: 'border-slate-200 bg-slate-50 text-slate-600',
    },
    definition: {
      section: 'rounded-lg bg-blue-50/45 px-5 py-5 ring-1 ring-blue-100',
      label: 'text-blue-700',
      badge: 'border-blue-200 bg-blue-600 text-white',
    },
    process: {
      section: 'rounded-lg bg-slate-50/90 px-5 py-5 ring-1 ring-slate-200',
      label: 'text-slate-700',
      badge: 'border-slate-300 bg-slate-900 text-white',
    },
    formula: {
      section: 'rounded-lg bg-indigo-50/40 px-5 py-5 ring-1 ring-indigo-100',
      label: 'text-indigo-700',
      badge: 'border-indigo-200 bg-indigo-600 text-white',
    },
    callout: {
      section: 'rounded-lg bg-emerald-50/40 px-5 py-5 ring-1 ring-emerald-100',
      label: 'text-emerald-700',
      badge: 'border-emerald-200 bg-emerald-600 text-white',
    },
    problem: {
      section: 'rounded-lg bg-amber-50/40 px-5 py-5 ring-1 ring-amber-100',
      label: 'text-amber-700',
      badge: 'border-amber-200 bg-amber-600 text-white',
    },
    cards: {
      section: 'rounded-lg bg-slate-50/60 px-5 py-5 ring-1 ring-slate-100',
      label: 'text-blue-700',
      badge: 'border-blue-200 bg-blue-50 text-blue-700',
    },
  } satisfies Record<SemanticSectionTone, { section: string; label: string; badge: string }>;
  return styles[tone];
}

export function SemanticScrollPage({ document, sceneId, title }: SemanticScrollPageProps) {
  const sections = useMemo(() => buildBlockSections(document), [document]);
  const titleHtml = useMemo(
    () => renderInlineMathHtml(document.title || title),
    [document.title, title],
  );

  return (
    <article
      data-semantic-scroll-root="true"
      data-semantic-scroll-scene-id={sceneId}
      className="h-full w-full overflow-y-auto bg-white text-slate-950"
    >
      <div className="mx-auto min-h-full w-full max-w-[980px] px-6 py-8 sm:px-10 sm:py-10 lg:px-12">
        <header data-semantic-scroll-target="true" className="scroll-mt-8 pb-7">
          <p className="mb-3 inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
            {document.profile === 'math' ? 'MATHEMATICS' : document.profile.toUpperCase()}
          </p>
          <h1
            className="max-w-[820px] text-[34px] font-semibold leading-tight text-slate-950 sm:text-[42px]"
            dangerouslySetInnerHTML={{ __html: titleHtml }}
          />
        </header>

        <div className="space-y-7 py-8">
          {sections.map((section, index) => {
            const sectionDocument = documentForSection(document, section.blocks);
            const sectionTitleHtml = section.title ? renderInlineMathHtml(section.title) : null;
            const tone = sectionTone(section);
            const chrome = sectionChrome(tone, index);
            return (
              <section
                key={section.id}
                data-semantic-scroll-target="true"
                data-semantic-scroll-index={index}
                className={cn(
                  'scroll-mt-8 break-words',
                  index > 0 && tone === 'plain' ? 'pt-2' : '',
                  chrome.section,
                )}
              >
                {sectionTitleHtml ? (
                  <div className="mb-4 flex items-start gap-3">
                    <span
                      className={cn(
                        'mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-2 text-xs font-semibold',
                        chrome.badge,
                      )}
                    >
                      {section.eyebrow || index + 1}
                    </span>
                    <h2
                      className={cn('min-w-0 text-xl font-semibold leading-snug', chrome.label)}
                      dangerouslySetInnerHTML={{ __html: sectionTitleHtml }}
                    />
                  </div>
                ) : null}
                {section.blocks.length > 0 ? (
                  <NotebookContentView
                    document={sectionDocument}
                    className={cn(
                      'text-[15px] leading-7 text-slate-800',
                      '[&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden',
                      '[&_.math-engine-display]:overflow-x-auto [&_.math-engine-display]:overflow-y-hidden',
                    )}
                  />
                ) : null}
              </section>
            );
          })}
        </div>
      </div>
    </article>
  );
}
