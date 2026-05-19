import type { PPTElement } from '@/lib/types/slides';
import type { NotebookContentBlock, NotebookContentDocument } from './schema';
import { escapeHtml, renderInlineLatexToHtml } from './inline-html';
import { CONTENT_LEFT, CONTENT_WIDTH } from './layout-constants';
import {
  createCircleShape,
  createLatexElement,
  createLineElement,
  createRectShape,
  createTextElement,
} from './slide-element-factory';
import {
  ACADEMY_PAPER,
  blockSummaryLines,
  type ContentCardTone,
  createCardGroupId,
  getProfileTokens,
} from './slide-adapter.shared';
import { findFirstBlock } from './slide-adapter.classic-basic';

export type ProblemStatementParts = {
  problem: string;
  hasExplicitProblem: boolean;
  givens: string[];
  goals: string[];
  supportLines: string[];
};

export function stripProblemLabel(text: string): string {
  return text.replace(/^(题目|Problem)\s*[：:]\s*/i, '').trim();
}

export function stripProblemContextLabel(text: string): string {
  return text
    .replace(/^[•\-\s]+/, '')
    .replace(/^(已知|Given|Known|条件|Condition)\s*[：:]\s*/i, '')
    .replace(/^(目标|Goal|求解目标|证明目标|要求)\s*[：:]\s*/i, '')
    .trim();
}

export function isProblemGoalLine(line: string): boolean {
  return /^(目标|Goal|求|证明|要证明|结论|Conclusion|Show|Prove)\b|目标|要求|求出|求得|要证明|不能只写答案|结论|得到/i.test(
    line,
  );
}

export function uniqueProblemLines(lines: string[], maxItems: number): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  lines
    .map((line) => stripProblemContextLabel(line))
    .filter(Boolean)
    .forEach((line) => {
      const key = line.replace(/\s+/g, '').toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      normalized.push(line);
    });
  return normalized.slice(0, maxItems);
}

export function selectProblemStrategyLines(parts: ProblemStatementParts): string[] {
  const stepLines = uniqueProblemLines(
    parts.supportLines.filter((line) =>
      /^(?:\d+\.\s*)?(?:步骤|Step)\s*\d*|^(?:先|再|因此|所以|任取|Then|Thus|Therefore)\b/i.test(
        stripProblemContextLabel(line),
      ),
    ),
    3,
  );
  if (stepLines.length > 0) return stepLines;
  return uniqueProblemLines([...parts.goals, ...parts.givens, ...parts.supportLines], 3);
}

export function collectProblemStatementParts(args: {
  title: string;
  language: 'zh-CN' | 'en-US';
  blocks: NotebookContentBlock[];
}): ProblemStatementParts {
  const example = findFirstBlock(args.blocks, 'example');
  const paragraphs = args.blocks.filter(
    (block): block is Extract<NotebookContentBlock, { type: 'paragraph' }> =>
      block.type === 'paragraph',
  );
  const problemParagraph = paragraphs.find((block) =>
    /^(题目|Problem)\s*[：:]/i.test(block.text.trim()),
  );
  const bulletItems = args.blocks
    .filter(
      (block): block is Extract<NotebookContentBlock, { type: 'bullet_list' }> =>
        block.type === 'bullet_list',
    )
    .flatMap((block) => block.items);
  const summaryLines = args.blocks.flatMap((block) => blockSummaryLines(args.language, block));
  const problem = stripProblemLabel(example?.problem || problemParagraph?.text || '');
  const hasExplicitProblem = Boolean(example?.problem || problemParagraph);
  const rawContext = [
    ...(example?.givens || []),
    ...(example?.goal ? [example.goal] : []),
    ...bulletItems,
    ...paragraphs
      .filter((block) => block !== problemParagraph)
      .map((block) => block.text)
      .filter((line) => stripProblemLabel(line) !== problem),
  ];
  const givens: string[] = [];
  const goals: string[] = [];

  rawContext.forEach((line) => {
    const cleanLine = stripProblemContextLabel(line);
    if (!cleanLine || cleanLine === problem) return;
    if (isProblemGoalLine(line)) {
      goals.push(cleanLine);
    } else {
      givens.push(cleanLine);
    }
  });

  if (!hasExplicitProblem && givens.length === 0 && goals.length === 0) {
    summaryLines
      .filter((line) => line.trim() && line.trim() !== args.title)
      .forEach((line) => {
        if (isProblemGoalLine(line)) {
          goals.push(stripProblemContextLabel(line));
        } else {
          givens.push(stripProblemContextLabel(line));
        }
      });
  }

  return {
    problem,
    hasExplicitProblem,
    givens: uniqueProblemLines(givens, 5),
    goals: uniqueProblemLines(goals, 3),
    supportLines: uniqueProblemLines([...givens, ...goals], 6),
  };
}

export function normalizeIntervalSnippet(value: string | undefined): string | undefined {
  return value?.replace(/[［]/g, '[').replace(/[］]/g, ']').trim();
}

export function normalizeProblemFormulaSnippet(value: string | undefined): string | undefined {
  const normalized = value
    ?.trim()
    .replace(/^\$+|\$+$/g, '')
    .replace(/^\\\(|\\\)$/g, '')
    .trim();
  return normalized || undefined;
}

export function extractProblemVisualFacts(text: string): {
  inputSet?: string;
  outputSet?: string;
  expression?: string;
} {
  const inputSet = normalizeIntervalSnippet(
    text.match(/f\s*\(\s*([［\[][^\]］]+[］\]])\s*\)/i)?.[1] ||
      text.match(/输入集合\s*[：:]\s*[（(]?\s*([［\[][^\]］]+[］\]])/i)?.[1],
  );
  const outputSet = normalizeIntervalSnippet(
    text.match(/f\s*\(\s*[［\[][^\]］]+[］\]]\s*\)\s*=\s*([［\[][^\]］]+[］\]])/i)?.[1] ||
      text.match(/像集\s*(?:为|是|=|等于|:|：)\s*([［\[][^\]］]+[］\]])/i)?.[1],
  );
  const expression = normalizeProblemFormulaSnippet(
    text.match(/f\s*\(\s*x\s*\)\s*=\s*([^\s，。,；;）)]+)/i)?.[1],
  );
  return { inputSet, outputSet, expression };
}

export function shouldUseProblemMappingVisual(text: string): boolean {
  const facts = extractProblemVisualFacts(text);
  const hasMappingFact = Boolean(facts.inputSet || facts.outputSet || facts.expression);
  const mentionsFunctionMapping =
    /(函数|映射|像集|原像|定义域|陪域|值域|function|mapping|image|preimage|domain|codomain|range)/i.test(
      text,
    );
  const isNumberTheoryProblem =
    /(丢番图|整除|质数|素数|最大公因数|公因数|裴蜀|gcd|diophantine|divisib|prime|bezout)/i.test(
      text,
    );
  const isProofOrWorkedExample =
    /(证明|任取|包含|步骤|求解|推导|先判断|双包含|subseteq|prove|show|step|derive|compute)/i.test(
      text,
    ) || /⊆|⊇/.test(text);

  return (
    hasMappingFact && mentionsFunctionMapping && !isNumberTheoryProblem && !isProofOrWorkedExample
  );
}

export function renderProblemInfoRows(args: {
  title: string;
  items: string[];
  left: number;
  top: number;
  width: number;
  height: number;
  tokens: ReturnType<typeof getProfileTokens>;
  language: 'zh-CN' | 'en-US';
  tone: ContentCardTone;
  maxItems?: number;
}): PPTElement[] {
  const rowGap = 8;
  const availableHeight = Math.max(44, args.height - 42);
  const maxRowsByHeight = Math.max(1, Math.floor((availableHeight + rowGap) / (44 + rowGap)));
  const items = uniqueProblemLines(args.items, Math.min(args.maxItems || 4, maxRowsByHeight));
  const elements: PPTElement[] = [
    createRectShape({
      left: args.left,
      top: args.top + 5,
      width: 5,
      height: Math.min(args.height - 10, 64),
      fill: args.tone.accent,
    }),
    createTextElement({
      left: args.left + 18,
      top: args.top,
      width: args.width - 18,
      height: 34,
      html: `<p style="font-size:16px;color:${args.tokens.titleText};font-weight:780;">${escapeHtml(args.title)}</p>`,
      color: args.tokens.titleText,
      textType: 'content',
    }),
  ];

  if (items.length === 0) {
    elements.push(
      createTextElement({
        left: args.left + 18,
        top: args.top + 42,
        width: args.width - 18,
        height: 54,
        html: `<p style="font-size:14px;line-height:21px;color:#64748b;">${escapeHtml(
          args.language === 'en-US'
            ? 'Extract the usable facts from the prompt.'
            : '从题干中提取可用信息。',
        )}</p>`,
        color: '#6f6471',
        fill: ACADEMY_PAPER.cardFillSoft,
        outlineColor: ACADEMY_PAPER.border,
        textType: 'content',
      }),
    );
    return elements;
  }

  const rowHeight = Math.min(
    62,
    Math.max(44, (availableHeight - rowGap * Math.max(0, items.length - 1)) / items.length),
  );
  items.forEach((item, index) => {
    elements.push(
      createTextElement({
        left: args.left + 18,
        top: args.top + 42 + index * (rowHeight + rowGap),
        width: args.width - 18,
        height: rowHeight,
        html: `<p style="font-size:13px;line-height:19px;color:${ACADEMY_PAPER.bodyText};"><span style="color:${args.tone.accent};font-weight:800;">${index + 1}.</span> ${renderInlineLatexToHtml(item)}</p>`,
        color: ACADEMY_PAPER.bodyText,
        fill: ACADEMY_PAPER.cardFill,
        outlineColor: args.tone.border,
        textType: 'content',
      }),
    );
  });

  return elements;
}

export function renderProblemMappingVisual(args: {
  left: number;
  top: number;
  width: number;
  height: number;
  text: string;
  tokens: ReturnType<typeof getProfileTokens>;
  language: 'zh-CN' | 'en-US';
}): PPTElement[] {
  const facts = extractProblemVisualFacts(args.text);
  const groupId = createCardGroupId('problem_mapping');
  const compact = args.height < 180;
  const boxWidth = Math.min(118, Math.max(92, (args.width - 86) / 2));
  const boxHeight = compact ? 54 : 76;
  const boxTop = args.top + (compact ? 52 : Math.max(62, Math.min(84, args.height * 0.34)));
  const inputLeft = args.left + 22;
  const outputLeft = args.left + args.width - boxWidth - 22;
  const lineY = boxTop + boxHeight / 2;
  const lineStart = inputLeft + boxWidth + 12;
  const lineEnd = outputLeft - 12;
  const expression = facts.expression ? `f(x)=${facts.expression}` : 'f';
  const elements: PPTElement[] = [
    createRectShape({
      left: args.left,
      top: args.top,
      width: args.width,
      height: args.height,
      fill: ACADEMY_PAPER.cardFillSoft,
      outlineColor: ACADEMY_PAPER.blueBorder,
      groupId,
    }),
    createTextElement({
      left: args.left + 20,
      top: args.top + 18,
      width: args.width - 40,
      height: 32,
      groupId,
      html: `<p style="font-size:14px;color:${args.tokens.titleAccent};font-weight:760;">${escapeHtml(
        args.language === 'en-US' ? 'Reasoning Map' : '求解路径',
      )}</p>`,
      color: args.tokens.titleAccent,
      textType: 'content',
    }),
    createTextElement({
      left: inputLeft,
      top: boxTop,
      width: boxWidth,
      height: boxHeight,
      groupId,
      html: `<p style="font-size:12px;color:#64748b;text-align:center;">${escapeHtml(
        args.language === 'en-US' ? 'Input' : '输入',
      )}</p><p style="font-size:${compact ? 15 : 18}px;line-height:${compact ? 20 : 24}px;color:${ACADEMY_PAPER.titleText};text-align:center;font-weight:760;">${renderInlineLatexToHtml(facts.inputSet || 'A')}</p>`,
      color: ACADEMY_PAPER.titleText,
      fill: ACADEMY_PAPER.cardFill,
      outlineColor: ACADEMY_PAPER.blueBorder,
      textType: 'content',
    }),
    createTextElement({
      left: outputLeft,
      top: boxTop,
      width: boxWidth,
      height: boxHeight,
      groupId,
      html: `<p style="font-size:12px;color:#64748b;text-align:center;">${escapeHtml(
        args.language === 'en-US' ? 'Image' : '像集',
      )}</p><p style="font-size:${compact ? 15 : 18}px;line-height:${compact ? 20 : 24}px;color:${ACADEMY_PAPER.titleText};text-align:center;font-weight:760;">${renderInlineLatexToHtml(facts.outputSet || '?')}</p>`,
      color: ACADEMY_PAPER.titleText,
      fill: ACADEMY_PAPER.cardFill,
      outlineColor: 'rgba(79,174,132,0.26)',
      textType: 'content',
    }),
    createLineElement({
      start: [lineStart, lineY],
      end: [lineEnd, lineY],
      color: args.tokens.titleAccent,
      width: 2,
      groupId,
    }),
    createLineElement({
      start: [lineEnd - 9, lineY - 6],
      end: [lineEnd, lineY],
      color: args.tokens.titleAccent,
      width: 2,
      groupId,
    }),
    createLineElement({
      start: [lineEnd - 9, lineY + 6],
      end: [lineEnd, lineY],
      color: args.tokens.titleAccent,
      width: 2,
      groupId,
    }),
    createLatexElement({
      latex: expression,
      left: lineStart,
      top: lineY - (compact ? 34 : 42),
      width: Math.max(52, lineEnd - lineStart),
      height: compact ? 24 : 30,
      align: 'center',
      color: args.tokens.titleText,
      groupId,
    }),
  ];

  if (!compact) {
    elements.push(
      createTextElement({
        left: args.left + 20,
        top: args.top + args.height - 52,
        width: args.width - 40,
        height: 34,
        groupId,
        html: `<p style="font-size:12px;line-height:17px;color:#475569;text-align:center;">${escapeHtml(
          args.language === 'en-US'
            ? 'Track how the input set becomes the image set.'
            : '先看输入范围，再追踪输出范围。',
        )}</p>`,
        color: '#475569',
        textType: 'notes',
      }),
    );
  }

  return elements;
}

export function renderProblemStrategyVisual(args: {
  left: number;
  top: number;
  width: number;
  height: number;
  lines: string[];
  tokens: ReturnType<typeof getProfileTokens>;
  language: 'zh-CN' | 'en-US';
}): PPTElement[] {
  const groupId = createCardGroupId('problem_strategy');
  const items =
    args.lines.length > 0
      ? uniqueProblemLines(args.lines, 3)
      : args.language === 'en-US'
        ? [
            'Identify the target condition.',
            'Select the theorem or criterion.',
            'Compute cleanly and close the result.',
          ]
        : ['识别目标条件。', '选择对应判据或定理。', '完成计算并收束结论。'];
  const cardGap = 10;
  const headerHeight = 48;
  const cardHeight = Math.max(
    44,
    Math.floor(
      (args.height - headerHeight - cardGap * Math.max(0, items.length - 1) - 18) /
        Math.max(1, items.length),
    ),
  );
  const elements: PPTElement[] = [
    createRectShape({
      left: args.left,
      top: args.top,
      width: args.width,
      height: args.height,
      fill: ACADEMY_PAPER.cardFillSoft,
      outlineColor: ACADEMY_PAPER.blueBorder,
      groupId,
    }),
    createTextElement({
      left: args.left + 20,
      top: args.top + 18,
      width: args.width - 40,
      height: 30,
      groupId,
      html: `<p style="font-size:14px;color:${args.tokens.titleAccent};font-weight:760;">${escapeHtml(
        args.language === 'en-US' ? 'Solution Route' : '解题路线',
      )}</p>`,
      color: args.tokens.titleAccent,
      textType: 'content',
    }),
  ];

  items.forEach((item, index) => {
    const tone = args.tokens.cardPalettes[index % args.tokens.cardPalettes.length];
    elements.push(
      createTextElement({
        left: args.left + 20,
        top: args.top + headerHeight + index * (cardHeight + cardGap),
        width: args.width - 40,
        height: cardHeight,
        groupId,
        html: `<p style="margin:0;font-size:13px;line-height:18px;color:${ACADEMY_PAPER.bodyText};"><span style="color:${tone.accent};font-weight:800;">${index + 1}.</span> ${renderInlineLatexToHtml(item)}</p>`,
        color: ACADEMY_PAPER.bodyText,
        fill: ACADEMY_PAPER.cardFill,
        outlineColor: tone.border,
        textType: 'content',
      }),
    );
  });

  return elements;
}

export function renderProblemReasoningRail(args: {
  top: number;
  tokens: ReturnType<typeof getProfileTokens>;
  language: 'zh-CN' | 'en-US';
  activeIndex: number;
}): PPTElement[] {
  const steps =
    args.language === 'en-US' ? ['Read', 'Translate', 'Conclude'] : ['读题', '转化', '结论'];
  const left = CONTENT_LEFT + 42;
  const width = CONTENT_WIDTH - 84;
  const y = args.top + 23;
  const segment = width / Math.max(1, steps.length - 1);
  const elements: PPTElement[] = [
    createLineElement({
      start: [left, y],
      end: [left + width, y],
      color: '#dbeafe',
      width: 2,
    }),
  ];

  steps.forEach((step, index) => {
    const x = left + index * segment;
    const active = index <= args.activeIndex;
    elements.push(
      createCircleShape({
        left: x - 10,
        top: y - 10,
        size: 20,
        fill: active ? args.tokens.titleAccent : '#dbeafe',
      }),
      createTextElement({
        left: x - 58,
        top: y + 14,
        width: 116,
        height: 28,
        html: `<p style="font-size:12px;color:${active ? args.tokens.titleAccent : '#64748b'};text-align:center;font-weight:720;">${escapeHtml(step)}</p>`,
        color: active ? args.tokens.titleAccent : '#64748b',
        textType: 'notes',
      }),
    );
  });

  return elements;
}

export function renderProblemStatementTemplate(args: {
  title: string;
  blocks: NotebookContentBlock[];
  language: 'zh-CN' | 'en-US';
  tokens: ReturnType<typeof getProfileTokens>;
  cardPalettes: readonly ContentCardTone[];
  bodyTop: number;
  bodyHeight: number;
  continuation?: NotebookContentDocument['continuation'];
}): PPTElement[] {
  const parts = collectProblemStatementParts({
    title: args.title,
    language: args.language,
    blocks: args.blocks,
  });
  const allText = [
    args.title,
    parts.problem,
    ...parts.givens,
    ...parts.goals,
    ...parts.supportLines,
  ].join('\n');
  const elements: PPTElement[] = [];
  const activeIndex = args.continuation
    ? Math.min(2, Math.max(0, args.continuation.partNumber - 1))
    : 0;
  const railHeight = parts.hasExplicitProblem ? 58 : 0;
  const railTop = args.bodyTop + args.bodyHeight - railHeight;

  if (parts.hasExplicitProblem) {
    const problemFontSize =
      parts.problem.length > 980
        ? 14
        : parts.problem.length > 700
          ? 15
          : parts.problem.length > 460
            ? 16
            : 18;
    const problemHeight = parts.problem.length > 760 ? 192 : parts.problem.length > 420 ? 166 : 142;
    const lowerTop = args.bodyTop + problemHeight + 18;
    const lowerHeight = Math.max(132, railTop - lowerTop - 14);
    const infoWidth = 510;
    const visualLeft = CONTENT_LEFT + infoWidth + 24;
    const infoItems = uniqueProblemLines([...parts.givens, ...parts.goals], 5);

    elements.push(
      createTextElement({
        left: CONTENT_LEFT,
        top: args.bodyTop,
        width: CONTENT_WIDTH,
        height: problemHeight,
        html: `<p style="font-size:15px;line-height:22px;color:${args.tokens.titleAccent};font-weight:780;">${escapeHtml(
          args.language === 'en-US' ? 'Problem' : '题目',
        )}</p><p style="font-size:${problemFontSize}px;line-height:${Math.round(problemFontSize * 1.5)}px;color:${ACADEMY_PAPER.bodyText};">${renderInlineLatexToHtml(parts.problem)}</p>`,
        color: ACADEMY_PAPER.bodyText,
        fill: ACADEMY_PAPER.cardFill,
        outlineColor: ACADEMY_PAPER.blueBorder,
        textType: 'content',
      }),
      ...renderProblemInfoRows({
        title: args.language === 'en-US' ? 'Known / Goal' : '已知与目标',
        items: infoItems,
        left: CONTENT_LEFT,
        top: lowerTop,
        width: infoWidth,
        height: lowerHeight,
        tokens: args.tokens,
        language: args.language,
        tone: args.cardPalettes[0],
        maxItems: 4,
      }),
      ...(shouldUseProblemMappingVisual(allText)
        ? renderProblemMappingVisual({
            left: visualLeft,
            top: lowerTop,
            width: CONTENT_LEFT + CONTENT_WIDTH - visualLeft,
            height: lowerHeight,
            text: allText,
            tokens: args.tokens,
            language: args.language,
          })
        : renderProblemStrategyVisual({
            left: visualLeft,
            top: lowerTop,
            width: CONTENT_LEFT + CONTENT_WIDTH - visualLeft,
            height: lowerHeight,
            lines: selectProblemStrategyLines(parts),
            tokens: args.tokens,
            language: args.language,
          })),
      ...renderProblemReasoningRail({
        top: railTop,
        tokens: args.tokens,
        language: args.language,
        activeIndex,
      }),
    );
    return elements;
  }

  const continuationLines = uniqueProblemLines(
    [...parts.goals, ...parts.givens, ...parts.supportLines],
    5,
  );
  const roleText = continuationLines.join('\n');
  const isConclusion = /结论|Conclusion|得到|therefore/i.test(roleText);
  const hasGoal = parts.goals.length > 0 || /目标|Goal|证明|Prove/i.test(roleText);
  const hasStepLikeLine =
    /步骤|Step|判定|检查|回代|放大|计算|代入|推导|求解|整除|gcd|derive|compute|check/i.test(
      roleText,
    );
  const headerTitle =
    args.language === 'en-US'
      ? isConclusion
        ? 'Conclusion'
        : hasGoal
          ? 'Proof Target'
          : hasStepLikeLine
            ? 'Solution Step'
            : 'Known Conditions'
      : isConclusion
        ? '结论收束'
        : hasGoal
          ? '证明目标'
          : hasStepLikeLine
            ? '解题步骤'
            : '已知条件';
  const headerSubtitle =
    continuationLines[0] ||
    (args.language === 'en-US' ? 'Continue the worked-example reasoning.' : '继续推进例题讲解。');
  const panelTop = args.bodyTop + 92;
  const panelHeight = Math.max(162, railTop - panelTop - 16);
  const infoWidth = 532;
  const visualLeft = CONTENT_LEFT + infoWidth + 24;

  elements.push(
    createTextElement({
      left: CONTENT_LEFT,
      top: args.bodyTop,
      width: CONTENT_WIDTH,
      height: 72,
      html: `<p style="font-size:17px;line-height:24px;color:${args.tokens.titleText};font-weight:780;">${escapeHtml(headerTitle)}</p><p style="font-size:15px;line-height:22px;color:${ACADEMY_PAPER.bodyText};">${renderInlineLatexToHtml(headerSubtitle)}</p>`,
      color: ACADEMY_PAPER.bodyText,
      fill: ACADEMY_PAPER.cardFill,
      outlineColor: ACADEMY_PAPER.blueBorder,
      textType: 'content',
    }),
    ...renderProblemInfoRows({
      title: args.language === 'en-US' ? 'Use These Facts' : '本页要用的信息',
      items: continuationLines,
      left: CONTENT_LEFT,
      top: panelTop,
      width: infoWidth,
      height: panelHeight,
      tokens: args.tokens,
      language: args.language,
      tone: isConclusion ? args.cardPalettes[2] : args.cardPalettes[0],
      maxItems: 4,
    }),
    ...(shouldUseProblemMappingVisual(allText)
      ? renderProblemMappingVisual({
          left: visualLeft,
          top: panelTop,
          width: CONTENT_LEFT + CONTENT_WIDTH - visualLeft,
          height: panelHeight,
          text: allText,
          tokens: args.tokens,
          language: args.language,
        })
      : renderProblemStrategyVisual({
          left: visualLeft,
          top: panelTop,
          width: CONTENT_LEFT + CONTENT_WIDTH - visualLeft,
          height: panelHeight,
          lines: selectProblemStrategyLines(parts),
          tokens: args.tokens,
          language: args.language,
        })),
  );

  return elements;
}
