import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { parsePDF } from '@/lib/pdf/pdf-providers';
import { parsePptxBuffer } from '@/lib/ppt/pptx-parser';
import { attachDeckMemoryToOutlines } from '@/lib/generation/deck-memory';
import { normalizeComputerScienceSceneOutline } from '@/lib/generation/cs-semantic-normalizer';
import {
  selectSlideBackgroundStyleFromDescriptions,
  type SlideBackgroundStyleId,
} from '@/lib/constants/slide-backgrounds';
import type { SceneLayoutIntent, SceneOutline, SharedExampleMemory } from '@/lib/types/generation';
import { TESTFILE_ROOT } from '@/lib/server/project-paths';
import { buildSpecializedFunctionsMathOutline } from './functions-math-outline';
import { layoutFamilyForTemplate } from './layout-family';
import {
  emptySourceImageStats,
  imageIdsForSourcePage,
  normalizeSourceImages,
} from './source-images';
import type { SourcePackageImage, SourcePackageImageStats } from './testfile-fixtures-types';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MAX_SOURCE_PAGES_PER_FIXTURE = 80;
const SUBJECT_NOTEBOOK_DIR = '科目测试';

type FixtureFileId = string;

interface FilePageChunk {
  title: string;
  text: string;
  sourceLabel: string;
}

interface SourcePackagePage {
  sourceIndex: number;
  title: string;
  summary: string;
  rawText: string;
  keyPoints: string[];
  concreteAnchor: string;
  sourceLabel: string;
  suggestedPageKind: string;
  imageIds: string[];
}

interface SourcePackage {
  fileName: string;
  fileType: 'md' | 'pdf' | 'pptx' | 'notebook';
  subject?: string;
  sourceText: string;
  sourcePages: SourcePackagePage[];
  sourceImages: SourcePackageImage[];
  imageMapping: Record<string, string>;
  imageStats?: SourcePackageImageStats;
  pageCount: number;
  parser?: string;
  warnings?: string[];
}

interface TestfileFixture {
  id: FixtureFileId;
  fileName: string;
  fileType: 'md' | 'pdf' | 'pptx' | 'notebook';
  title: string;
  description: string;
  sourceTextLength: number;
  outlines: SceneOutline[];
  sourcePackage?: SourcePackage;
}

interface SubjectNotebookFile {
  id: string;
  fileName: string;
  fileType: 'md' | 'pdf' | 'pptx';
  title: string;
  sourceTextLength: number;
  pageCount: number;
}

interface SubjectNotebookFixture extends TestfileFixture {
  subject: string;
  fileCount: number;
  sourceFiles: SubjectNotebookFile[];
}

interface LoadedSubjectSource {
  chunks: FilePageChunk[];
  sourceText: string;
  sourceImages: SourcePackageImage[];
  imageMapping: Record<string, string>;
  imageStats: SourcePackageImageStats;
  pageCount: number;
  parser?: string;
  warnings: string[];
}

type BuildOutlineFromChunkArgs = {
  fixtureId: FixtureFileId;
  fileName: string;
  chunk: FilePageChunk;
  index: number;
  sourceIndex: number;
  total: number;
  language: 'zh-CN' | 'en-US';
  disciplineStyle: NonNullable<SceneLayoutIntent['disciplineStyle']>;
  deckStyle: NonNullable<SceneLayoutIntent['deckStyle']>;
  sharedExamples?: SharedExampleMemory[];
};

const TWEET_MEMORY: SharedExampleMemory = {
  id: 'tweet_object_example',
  label: 'Tweet',
  aliases: ['Tweet', 'Tweet()', 'tweet', 't1'],
  description:
    'A running OOP example: a Tweet bundles userid, created_at, content, and likes into one object whose state and allowed operations should stay together.',
  canonicalData: [
    "['David', '2017-09-19', 'Hello, I am so cool', 0]",
    'userid, created_at, content, likes',
    "t1 = Tweet('Giovanna', date(2017, 9, 18), 'Hello')",
  ],
  malformedData: [
    "[55, 'Diane', 'Older and even cooler', '2017-09-19']",
    "{'userid': 'Jacqueline', 'content': 'Has the most dignified cat', 'likes': 12}",
  ],
  rules: [
    'A list can preserve four values but not their field names or validity rules.',
    'A dictionary can preserve names but still allows missing fields and irrelevant keys.',
    'The Tweet class should centralize field names, initialization, and operations.',
  ],
  lessonRole: 'Connect old representations, class boundaries, initialization, self, and methods.',
};

function clampText(input: string, maxLength: number): string {
  const normalized = input.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trim()}...`;
}

function clampRawText(input: string, maxLength: number): string {
  const normalized = input
    .replace(/\r\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 20).trim()}\n\n... raw source clipped`;
}

function cleanSourceText(input: string): string {
  return input
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<img\b[^>]*>/gi, ' ')
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/\bLearning Objectives?\b\s*[•:\-]*/gi, ' ')
    .replace(/^#{1,6}\s+.+$/gm, ' ')
    .replace(/^Slide\s+\d+\s*$/gim, '')
    .replace(/^Page\s+\d+\s*$/gim, '')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractCodeBlock(text: string): string {
  const fenced = text.match(/```(?:[a-zA-Z0-9_+-]+)?\n([\s\S]*?)```/);
  if (fenced?.[1]?.trim()) return fenced[1].trim();

  if (!hasProgrammingCodeSignal(text)) return '';

  const lines = text
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''))
    .filter((line) => isProgrammingCodeLine(line));
  return lines.slice(0, 14).join('\n').trim();
}

function isProgrammingCodeLine(line: string): boolean {
  return /^(>>>|\s{4,}|class\s+\w|def\s+\w|from\s+\w|import\s+\w|self\.|(?:const|let|var)\s+\w+\s*=|function\s+\w+\s*\(|return\b.*[;}]?$)/.test(
    line,
  );
}

function hasProgrammingCodeSignal(text: string): boolean {
  if (
    /```(?:python|py|js|javascript|ts|typescript|java|cpp|c\+\+|c|ruby|go|rust|swift|kotlin|scala|r|sql|html|css)?\n/i.test(
      text,
    )
  ) {
    return true;
  }
  const lines = text.split('\n');
  const codeLineCount = lines.filter((line) => isProgrammingCodeLine(line.trimEnd())).length;
  if (codeLineCount >= 2) return true;
  return /\b(?:class|def)\s+\w+\s*(?:\(|:)|\bself\.|\bconsole\.log\s*\(|\bprint\s*\(|=>|\bimport\s+\w+|\bfrom\s+\w+\s+import\b/.test(
    text,
  );
}

function extractConcreteLiterals(text: string): string[] {
  const literals = new Set<string>();
  for (const match of text.matchAll(/`([^`]{2,160})`/g)) {
    literals.add(match[1].trim());
  }
  for (const match of text.matchAll(/(\[[^\]\n]{8,180}\]|\{[^}\n]{8,180}\})/g)) {
    literals.add(match[1].trim());
  }
  return Array.from(literals).slice(0, 4);
}

function titleFromText(text: string, fallback: string): string {
  const firstHeading = text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /^#{1,4}\s+/.test(line));
  if (firstHeading) return clampText(firstHeading.replace(/^#{1,4}\s+/, ''), 80);

  const firstLine = text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !/^[-*]\s+/.test(line));
  return clampText(firstLine || fallback, 80);
}

function extractKeyPoints(text: string): string[] {
  const cleaned = cleanSourceText(text);
  const bulletPoints = cleaned
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => clampText(line.replace(/^[-*]\s+/, ''), 240));

  if (bulletPoints.length >= 3) return bulletPoints.slice(0, 5);

  const sentences = cleaned
    .split(/(?<=[.!?。！？])\s+/)
    .map((sentence) => clampText(sentence, 240))
    .filter((sentence) => sentence.length >= 24 && !/^Source:/.test(sentence));

  return [...bulletPoints, ...sentences].slice(0, 5);
}

function buildClassroomDescription(args: {
  title: string;
  keyPoints: string[];
  template: NonNullable<SceneLayoutIntent['layoutTemplate']>;
  sourceLabel: string;
}): string {
  const lead =
    args.keyPoints[0] ||
    `${args.title} should become one focused classroom slide using the source material.`;
  const support = args.keyPoints[1] || args.keyPoints[0] || '';
  const third = args.keyPoints[2] || '';
  return [lead, support, third].filter(Boolean).join('\n');
}

function compactCoverLine(input: string, maxLength = 120): string {
  const normalized = input.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  const clipped = normalized
    .slice(0, maxLength)
    .replace(/\s+\S*$/, '')
    .trim();
  return clipped.length >= 40 ? clipped : normalized.slice(0, maxLength).trim();
}

function normalizeCoverTitle(input: string): string {
  const withoutNumbering = input.replace(/^\d+(?:\.\d+)*\s+/, '').trim() || input.trim();
  const introMatch = withoutNumbering.match(/^Introduction to\s+(.+)$/i);
  return compactCoverLine(introMatch?.[1]?.trim() || withoutNumbering, 72);
}

function coverSubtitleForTopic(topic: string): string {
  if (/object|oop|class|oriented/i.test(topic)) {
    return 'Objects, custom types, and the path toward classes.';
  }
  if (/函数/.test(topic)) {
    return '围绕定义、映射与证明习惯理解函数。';
  }
  if (/function/i.test(topic)) {
    return 'Definitions, mappings, and proof habits for reasoning about functions.';
  }
  if (/victim/i.test(topic)) {
    return 'A focused overview of impact, context, and response.';
  }
  return 'A focused opening before the source pages begin.';
}

function buildCoverKeyPoints(args: { title: string; keyPoints: string[] }): string[] {
  const titleTopic = normalizeCoverTitle(args.title);
  const combined = [titleTopic, ...args.keyPoints].join(' ');
  const titleIntroMatch = titleTopic.match(/^Introduction to\s+(.+)$/i);
  const combinedIntroMatch = combined.match(
    /Introduction to\s+([A-Za-z][A-Za-z\s-]{4,80}?)(?=[.,;:，。；：]|$|\s+[\u4e00-\u9fff])/i,
  );
  const introTopic = (titleIntroMatch?.[1] || combinedIntroMatch?.[1])?.replace(/\s+/g, ' ').trim();
  const topic =
    introTopic && !titleTopic.toLowerCase().includes(introTopic.toLowerCase())
      ? `Introduction to ${introTopic}`
      : titleTopic;
  return [coverSubtitleForTopic(topic)].filter(Boolean);
}

function buildCoverDescription(args: { title: string; keyPoints: string[] }): string {
  const coverPoints = buildCoverKeyPoints(args);
  return coverPoints.join('\n');
}

function buildConcreteAnchor(args: {
  title: string;
  text: string;
  keyPoints: string[];
  template: NonNullable<SceneLayoutIntent['layoutTemplate']>;
  disciplineStyle?: NonNullable<SceneLayoutIntent['disciplineStyle']>;
}): string {
  const code = extractCodeBlock(args.text);
  if (args.template === 'code_split' && code) {
    return [`Code to explain:`, code, ...args.keyPoints.slice(0, 2)].join('\n');
  }

  const literals = extractConcreteLiterals(args.text);
  if (args.disciplineStyle === 'math') {
    if (literals.length > 0) {
      return literals.slice(0, 2).join('\n');
    }
    const formulaAnchor = extractFormulaAnchor(args.text);
    if (formulaAnchor) return formulaAnchor;
    return args.keyPoints[0] || args.title;
  }

  const anchors = [
    args.title,
    ...literals.map((literal) => `Concrete literal: ${literal}`),
    ...args.keyPoints.slice(0, Math.max(2, 4 - literals.length)),
  ]
    .map((line) => clampText(line, 170))
    .filter(Boolean);

  return anchors.slice(0, 5).join('\n');
}

function extractFormulaAnchor(text: string): string {
  const candidates = [
    ...Array.from(text.matchAll(/\$([^$\n]{6,180})\$/g), (match) => match[1]),
    ...Array.from(
      text.matchAll(
        /([A-Za-z]\s*\([^)]*\)\s*=\s*[^.\n]{4,160}|[A-Za-z]\s*:\s*[^,\n]{2,80}→[^,\n]{1,80})/g,
      ),
      (match) => match[1],
    ),
  ]
    .map((candidate) => candidate.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return candidates[0] || '';
}

function detectTemplate(
  text: string,
  index: number,
  disciplineStyle: NonNullable<SceneLayoutIntent['disciplineStyle']>,
): NonNullable<SceneLayoutIntent['layoutTemplate']> {
  const lower = text.toLowerCase();
  if (hasProgrammingCodeSignal(text)) {
    if (hasComparisonMatrixSignal(text) && index % 3 === 0) return 'comparison_matrix';
    if (hasProcessStepsSignal(text) && index % 4 === 0) return 'process_steps';
    if (/terminology|concept|blueprint|attribute|术语|概念/.test(lower) && index % 2 === 0) {
      return 'three_cards';
    }
    return 'code_split';
  }
  if (disciplineStyle === 'math' || hasMathProofSignal(text)) {
    if (hasProofWalkthroughSignal(text)) {
      return 'derivation_ladder';
    }
    if (index === 0 && /introduction|intro|fundamental|概览|导入|引入/i.test(text)) {
      return 'definition_board';
    }
    if (
      /(?:example|例题|projection|投影).*(?:prove|proof|pre[-\s]?image|原像|injective|surjective|bijective|单射|满射|双射)|(?:prove|show|证明).*(?:image|pre[-\s]?image|injective|surjective|bijective|像|原像|单射|满射|双射)/i.test(
        text,
      )
    ) {
      return 'derivation_ladder';
    }
    if (hasMathComparisonSignal(text)) {
      return 'comparison_matrix';
    }
    if (hasFormulaFocusSignal(text)) {
      return 'formula_focus';
    }
    if (
      /(definition|defined|domain|codomain|range|left[-\s]?total|functional|function|mapping|map|定义|函数|映射|定义域|陪域|值域)/i.test(
        text,
      ) &&
      !hasMathComparisonSignal(text)
    ) {
      return 'definition_board';
    }
    if (hasProcessStepsSignal(text)) {
      return 'process_steps';
    }
    if (hasCardGridSignal(text)) {
      return 'definition_board';
    }
    if (
      /(definition|defined|domain|codomain|range|function|mapping|map|定义|函数|映射)/i.test(text)
    ) {
      return 'definition_board';
    }
    return index % 3 === 0
      ? 'definition_board'
      : index % 3 === 1
        ? 'formula_focus'
        : 'derivation_ladder';
  }
  if (hasComparisonMatrixSignal(text)) {
    return 'comparison_matrix';
  }
  if (/list|dict|dictionary|table|错误|对照/.test(lower)) {
    return 'pipeline_table';
  }
  if (/summary|conclusion|takeaway|future|recap|收束|总结/.test(lower)) {
    return 'two_by_one_summary';
  }
  if (hasProcessStepsSignal(text)) {
    return 'process_steps';
  }
  if (hasVisualExplanationSignal(text)) {
    return index % 2 === 0 ? 'text_image_split' : 'two_text_image';
  }
  if (/four|4 |四/.test(lower)) return 'four_columns';
  if (index % 5 === 0) return 'text_image_split';
  if (index % 5 === 1) return 'three_cards';
  if (index % 5 === 2) return 'grid_2x2';
  if (index % 5 === 3) return 'two_text_image';
  return 'pipeline_table';
}

function hasMathProofSignal(text: string): boolean {
  return /(?:proof|prove|theorem|lemma|corollary|definition|domain|codomain|range|injective|surjective|bijective|bijection|one[-\s]?to[-\s]?one|onto|composition|inverse|mapping|function from|let .+ be|suppose|therefore|hence|forall|exists|iff|∀|∃|⇒|⇔|∈|⊆|函数|映射|定义|证明|定理|推导)/i.test(
    text,
  );
}

function hasProofWalkthroughSignal(text: string): boolean {
  const withoutObjectiveHeading = text.replace(/\bLearning Objectives?\b[\s\S]*$/i, '');
  return /(?:^|\n|\.)\s*(?:proof|prove|to prove|we prove|we show|show that|suppose|therefore|hence|theorem|lemma|证明|定理|推导)\b/i.test(
    withoutObjectiveHeading,
  );
}

function hasFormulaFocusSignal(text: string): boolean {
  const formulaTokenCount = (
    text.match(
      /(?:\\[a-zA-Z]+|[∀∃⇒⇔∈⊆⊇→×]|[A-Za-z]\s*:\s*[^,\n]+?→|[A-Za-z]\s*\([^)]*\)\s*=|\{[^}\n]{4,}\})/g,
    ) || []
  ).length;
  return formulaTokenCount >= 3 || /\$[^$\n]{8,}\$/.test(text);
}

function hasComparisonMatrixSignal(text: string): boolean {
  return /(?:compare|comparison|versus|vs\.?|pros?\s+and\s+cons?|which(?:,|\s)|both|neither|two\s+forms?|three\s+forms?|two\s+types?|three\s+types?|injective|surjective|bijective|one[-\s]?to[-\s]?one|onto|image and preimage|preimages?|两种|三种|对比|比较|优缺点|矩阵|象限|是否|哪一个|分别)/i.test(
    text,
  );
}

function hasMathComparisonSignal(text: string): boolean {
  return /(?:compare|comparison|versus|vs\.?|image\s+and\s+preimage|preimages?|injective|surjective|bijective|one[-\s]?to[-\s]?one|onto|at least|at most|exactly one|counterexample|像与原像|原像|单射|满射|双射|至少|至多|恰好|反例|对比|比较|分别判断)/i.test(
    text,
  );
}

function hasProcessStepsSignal(text: string): boolean {
  return /(?:step|stage|process|workflow|path|first|second|third|finally|then|next|start from|move from|流程|阶段|步骤|先|再|最后|下一步|路径)/i.test(
    text,
  );
}

function hasCardGridSignal(text: string): boolean {
  const numberedItems = (text.match(/(?:^|\n)\s*\d+[.)]\s+/g) || []).length;
  const bullets = (text.match(/(?:^|\n)\s*[•*-]\s+/g) || []).length;
  return (
    numberedItems >= 3 ||
    bullets >= 3 ||
    /(?:four|three|四个|三个|principles|criteria|checks)/i.test(text)
  );
}

function hasVisualExplanationSignal(text: string): boolean {
  return /(?:figure|diagram|image|graph|arrows?|map|projection|visual|图|图像|箭头|示意|关系图)/i.test(
    text,
  );
}

function coverLayoutForFixture(args: {
  title: string;
  description: string;
  deckStyle: NonNullable<SceneLayoutIntent['deckStyle']>;
  disciplineStyle: NonNullable<SceneLayoutIntent['disciplineStyle']>;
}): {
  layoutTemplate: NonNullable<SceneLayoutIntent['layoutTemplate']>;
  deckStyle: NonNullable<SceneLayoutIntent['deckStyle']>;
  backgroundStyleId: SlideBackgroundStyleId;
} {
  const normalizedDeckStyle = args.deckStyle.toLowerCase();
  const title = args.title.toLowerCase();
  let layoutTemplate: NonNullable<SceneLayoutIntent['layoutTemplate']>;
  let deckStyle: NonNullable<SceneLayoutIntent['deckStyle']>;

  if (args.disciplineStyle === 'math') {
    layoutTemplate = 'image_title_overlay';
    deckStyle = 'academic';
  } else if (/function/.test(title)) {
    layoutTemplate = 'tech_hero_title';
    deckStyle = 'tech_saas';
  } else if (
    args.disciplineStyle === 'code' ||
    /object|oop|class|programming|python|software|ai|api|code/.test(title)
  ) {
    layoutTemplate = 'tech_hero_title';
    deckStyle = 'tech_saas';
  } else if (
    /victim|violence|trauma|impact|social|justice|crime|harm|人文|社会|创伤|伤害/.test(title)
  ) {
    layoutTemplate = 'cinematic_title_frame';
    deckStyle = 'dark_art';
  } else if (
    normalizedDeckStyle.includes('tech') ||
    normalizedDeckStyle.includes('saas') ||
    normalizedDeckStyle.includes('product')
  ) {
    layoutTemplate = 'tech_hero_title';
    deckStyle = 'tech_saas';
  } else if (normalizedDeckStyle.includes('dark') || normalizedDeckStyle.includes('cinematic')) {
    layoutTemplate = 'cinematic_title_frame';
    deckStyle = 'dark_art';
  } else {
    layoutTemplate = 'image_title_overlay';
    deckStyle = args.deckStyle;
  }

  const background = selectSlideBackgroundStyleFromDescriptions({
    layoutTemplate,
    deckStyle,
    disciplineStyle: args.disciplineStyle,
    title: args.title,
    description: args.description,
  });

  return {
    layoutTemplate,
    deckStyle,
    backgroundStyleId: background.id,
  };
}

function splitMarkdownIntoChunks(markdown: string): FilePageChunk[] {
  const lines = markdown.split('\n');
  const chunks: FilePageChunk[] = [];
  let currentTitle = 'Opening';
  let currentLines: string[] = [];

  const flush = () => {
    const text = currentLines.join('\n').trim();
    if (!text) return;
    chunks.push({
      title: currentTitle,
      text,
      sourceLabel: currentTitle,
    });
  };

  for (const line of lines) {
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading && currentLines.length > 0) {
      flush();
      currentTitle = heading[2].trim();
      currentLines = [line];
      continue;
    }
    if (heading) currentTitle = heading[2].trim();
    currentLines.push(line);
  }
  flush();
  return chunks;
}

function buildCoverOutline(args: {
  fixtureId: FixtureFileId;
  title: string;
  chunks: FilePageChunk[];
  total: number;
  language: 'zh-CN' | 'en-US';
  disciplineStyle: NonNullable<SceneLayoutIntent['disciplineStyle']>;
  deckStyle: NonNullable<SceneLayoutIntent['deckStyle']>;
}): SceneOutline {
  const firstChunk = args.chunks[0];
  const extractedCoverTitle = clampText(
    normalizeCoverTitle(
      firstChunk?.title && firstChunk.title !== 'Opening' ? firstChunk.title : args.title,
    ),
    90,
  );
  const coverTitle =
    args.fixtureId === 'functions-pdf' && args.language === 'zh-CN' ? '函数' : extractedCoverTitle;
  const sourceKeyPoints = firstChunk ? extractKeyPoints(firstChunk.text) : [];
  const keyPoints = buildCoverKeyPoints({ title: coverTitle, keyPoints: sourceKeyPoints });
  const description = buildCoverDescription({ title: coverTitle, keyPoints: sourceKeyPoints });
  const coverLayout = coverLayoutForFixture({
    title: coverTitle,
    description: [description, ...keyPoints].join('\n'),
    deckStyle: args.deckStyle,
    disciplineStyle: args.disciplineStyle,
  });
  const template = coverLayout.layoutTemplate;
  const layoutIntent: SceneLayoutIntent = {
    layoutFamily: 'cover',
    layoutTemplate: template,
    disciplineStyle: args.disciplineStyle,
    teachingFlow: 'standalone',
    density: 'light',
    deckStyle: coverLayout.deckStyle,
    visualRole: 'source_image',
    backgroundStyleId: coverLayout.backgroundStyleId,
    overflowPolicy: 'compress_first',
    preserveFullProblemStatement: false,
  };

  const outline: SceneOutline = {
    id: `${args.fixtureId}-cover`,
    type: 'slide',
    contentProfile: 'general',
    archetype: 'intro',
    layoutIntent,
    title: coverTitle,
    description,
    keyPoints,
    teachingObjective:
      args.language === 'zh-CN'
        ? '学生应带着本文件的核心问题进入这节微课。'
        : 'Students should enter the file-level mini lesson with the central topic.',
    teachingPlanId: `${args.fixtureId}-file-page-test`,
    teachingRole: 'concrete_hook',
    teachingPagePlan: {
      id: `${args.fixtureId}-cover-plan`,
      order: 1,
      title: coverTitle,
      role: 'concrete_hook',
      openingMove:
        args.language === 'zh-CN'
          ? '用中心主题和它的重要性打开这节文件级微课。'
          : 'Open the file-level mini lesson with the central topic and why it matters.',
      concreteAnchor: [coverTitle, ...keyPoints].join('\n'),
      studentThinkingMove:
        args.language === 'zh-CN'
          ? '让学生先定位这份材料要回答的主问题。'
          : 'Orient students to the main question this source file will answer.',
      transferRule:
        args.total > 1
          ? args.language === 'zh-CN'
            ? '封面后交给第一个源页面继续展开。'
            : 'Hand off to the first source page after the cover.'
          : args.language === 'zh-CN'
            ? '封面保持简洁，不在这里展开完整讲解。'
            : 'Keep the cover concise and do not start a full explanation here.',
      requiredComponentKinds: ['example'],
      forbiddenPatterns: [],
      contentProfile: 'general',
      disciplineStyle: args.disciplineStyle,
      teachingFlow: layoutIntent.teachingFlow,
      layoutFamily: layoutIntent.layoutFamily,
      layoutTemplate: template,
    },
    studentThinkingMove:
      args.language === 'zh-CN'
        ? '让学生先定位这份材料要回答的主问题。'
        : 'Orient students to the main question this source file will answer.',
    requiredComponentKinds: ['example'],
    order: 0,
    language: args.language,
  };

  return normalizeComputerScienceSceneOutline(outline);
}

function splitPptxTextIntoChunks(text: string): FilePageChunk[] {
  return text
    .split(/\n\n(?=Slide \d+)/)
    .map((chunk, index) => {
      const match = chunk.match(/^Slide\s+(\d+)/);
      return {
        title: titleFromText(chunk.replace(/^Slide\s+\d+/, '').trim(), `Slide ${index + 1}`),
        text: chunk.trim(),
        sourceLabel: match ? `Slide ${match[1]}` : `Slide ${index + 1}`,
      };
    })
    .filter((chunk) => chunk.text.length > 0);
}

async function splitPdfIntoChunks(buffer: Buffer): Promise<FilePageChunk[]> {
  const { getDocumentProxy, extractText } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: false });
  const pageTexts = Array.isArray(text) ? text : [];
  return pageTexts
    .map((pageText, index) => ({
      title: titleFromText(pageText, `Page ${index + 1}`),
      text: [`Page ${index + 1}`, pageText].join('\n').trim(),
      sourceLabel: `Page ${index + 1}`,
    }))
    .filter((chunk) => chunk.text.length > 0);
}

function buildOutlineFromChunk(args: BuildOutlineFromChunkArgs): SceneOutline {
  const specialized =
    process.env.SYNTARA_USE_FUNCTIONS_SPECIALIZED_FIXTURE === 'true'
      ? buildSpecializedFunctionsMathOutline(args)
      : null;
  if (specialized) return specialized;

  const template = detectTemplate(args.chunk.text, args.sourceIndex, args.disciplineStyle);
  const keyPoints = extractKeyPoints(args.chunk.text);
  const contentProfile =
    template === 'code_split' ? 'code' : args.disciplineStyle === 'math' ? 'math' : 'general';
  const teachingFlow =
    template === 'code_split'
      ? 'code_walkthrough'
      : contentProfile === 'math' && template === 'comparison_matrix'
        ? 'comparison_review'
        : contentProfile === 'math' && template === 'derivation_ladder'
          ? 'proof_walkthrough'
          : contentProfile === 'math'
            ? 'definition_to_example'
            : 'concept_explain';
  const teachingRole =
    template === 'code_split'
      ? 'state_trace'
      : template === 'pipeline_table' || template === 'comparison_matrix'
        ? 'comparison'
        : contentProfile === 'math' && template === 'derivation_ladder'
          ? 'worked_example'
          : contentProfile === 'math'
            ? 'definition_boundary'
            : 'concept_model';
  const requiredComponentKinds =
    template === 'code_split'
      ? (['trace'] as const)
      : template === 'pipeline_table' || template === 'comparison_matrix'
        ? (['table'] as const)
        : template === 'process_steps'
          ? (['chart'] as const)
          : contentProfile === 'math' && template === 'derivation_ladder'
            ? (['derivation'] as const)
            : (['example'] as const);
  const visualRole =
    template === 'visual_three_steps' ||
    template === 'text_image_split' ||
    template === 'two_text_image'
      ? 'generated_image'
      : template === 'process_steps' || template === 'pipeline_table'
        ? 'diagram'
        : 'none';
  const layoutIntent: SceneLayoutIntent = {
    layoutFamily: layoutFamilyForTemplate(template),
    layoutTemplate: template,
    disciplineStyle: args.disciplineStyle,
    teachingFlow,
    density: 'standard',
    deckStyle: args.deckStyle,
    visualRole,
    overflowPolicy: 'compress_first',
    preserveFullProblemStatement: template === 'code_split',
  };

  const title = clampText(args.chunk.title || `${args.fileName} ${args.chunk.sourceLabel}`, 90);
  const description = buildClassroomDescription({
    title,
    keyPoints,
    template,
    sourceLabel: `${args.fileName} / ${args.chunk.sourceLabel}`,
  });
  const concreteAnchor = buildConcreteAnchor({
    title,
    text: args.chunk.text,
    keyPoints,
    template,
    disciplineStyle: args.disciplineStyle,
  });
  const outline: SceneOutline = {
    id: `${args.fixtureId}-page-${args.index + 1}`,
    type: 'slide',
    contentProfile,
    archetype:
      template === 'two_by_one_summary'
        ? 'summary'
        : template === 'code_split'
          ? 'example'
          : template === 'comparison_matrix'
            ? 'concept'
            : template === 'process_steps'
              ? 'concept'
              : contentProfile === 'math' && template === 'definition_board'
                ? 'definition'
                : contentProfile === 'math' && template === 'derivation_ladder'
                  ? 'example'
                  : 'concept',
    layoutIntent,
    title,
    description,
    keyPoints: keyPoints.length > 0 ? keyPoints : [concreteAnchor],
    teachingObjective:
      'Students should understand this page’s specific idea and see how it connects to the surrounding pages.',
    teachingPlanId: `${args.fixtureId}-file-page-test`,
    teachingRole,
    teachingPagePlan: {
      id: `${args.fixtureId}-page-${args.index + 1}-plan`,
      order: args.index + 1,
      title,
      role: teachingRole,
      openingMove:
        template === 'code_split'
          ? 'Start from the concrete code and ask what changes during execution.'
          : contentProfile === 'math'
            ? 'Start from the exact definition, claim, or example in the source and make the proof move explicit.'
            : 'Start from the concrete idea and turn it into a classroom explanation.',
      concreteAnchor,
      studentThinkingMove:
        template === 'code_split'
          ? 'Trace the concrete code or execution detail.'
          : contentProfile === 'math'
            ? 'Identify the definition being used and the proof step students should learn to recognize.'
            : 'Extract the one teaching move this page should make for students.',
      transferRule:
        args.index + 1 < args.total
          ? `This page should hand off to the next page, not close the whole lesson.`
          : `This page can close the file-level mini lesson.`,
      requiredComponentKinds: [...requiredComponentKinds],
      forbiddenPatterns: [],
      contentProfile,
      disciplineStyle: args.disciplineStyle,
      teachingFlow: layoutIntent.teachingFlow,
      layoutFamily: layoutIntent.layoutFamily,
      layoutTemplate: template,
    },
    studentThinkingMove:
      template === 'code_split'
        ? 'Trace the concrete code or execution detail.'
        : contentProfile === 'math'
          ? 'Identify the definition being used and the proof step students should learn to recognize.'
          : 'Extract the one teaching move this page should make for students.',
    requiredComponentKinds: [...requiredComponentKinds],
    sharedExamples: args.sharedExamples,
    usesExampleIds: args.sharedExamples?.some((example) =>
      [example.label, ...(example.aliases || [])].some((alias) => args.chunk.text.includes(alias)),
    )
      ? args.sharedExamples.map((example) => example.id)
      : undefined,
    mediaGenerations:
      visualRole === 'generated_image'
        ? [
            {
              type: 'image',
              elementId: `gen_img_${args.index + 1}`,
              aspectRatio: '16:9',
              style: 'clean classroom diagram',
              prompt: `A clean lecture diagram for: ${title}. Use the concrete source topic, minimal labels, readable classroom style.`,
            },
          ]
        : undefined,
    order: args.index,
    language: args.language,
  };

  return normalizeComputerScienceSceneOutline(outline);
}

function buildFixture(args: {
  id: FixtureFileId;
  fileName: string;
  fileType: TestfileFixture['fileType'];
  title: string;
  description: string;
  chunks: FilePageChunk[];
  language: 'zh-CN' | 'en-US';
  disciplineStyle: NonNullable<SceneLayoutIntent['disciplineStyle']>;
  deckStyle: NonNullable<SceneLayoutIntent['deckStyle']>;
  sharedExamples?: SharedExampleMemory[];
  subject?: string;
  sourceText?: string;
  sourceImages?: SourcePackageImage[];
  imageMapping?: Record<string, string>;
  sourceImageStats?: SourcePackageImageStats;
  parser?: string;
  sourceWarnings?: string[];
}): TestfileFixture {
  const selectedChunks = args.chunks.slice(0, MAX_SOURCE_PAGES_PER_FIXTURE);
  const sourceWarnings = [
    ...(args.chunks.length > selectedChunks.length
      ? [
          `sourcePages 已读取前 ${selectedChunks.length}/${args.chunks.length} 段；如需测试更长文件，请提高 MAX_SOURCE_PAGES_PER_FIXTURE。`,
        ]
      : []),
    ...(args.sourceWarnings || []),
  ];
  const total = selectedChunks.length + 1;
  const coverOutline = buildCoverOutline({
    fixtureId: args.id,
    title: args.title,
    chunks: selectedChunks,
    total,
    language: args.language,
    disciplineStyle: args.disciplineStyle,
    deckStyle: args.deckStyle,
  });
  const sourceOutlines = selectedChunks.map((chunk, sourceIndex) =>
    buildOutlineFromChunk({
      fixtureId: args.id,
      fileName: args.fileName,
      chunk,
      index: sourceIndex + 1,
      sourceIndex,
      total,
      language: args.language,
      disciplineStyle: args.disciplineStyle,
      deckStyle: args.deckStyle,
      sharedExamples: args.sharedExamples,
    }),
  );
  const outlines = [coverOutline, ...sourceOutlines];
  const attachedOutlines = attachDeckMemoryToOutlines(outlines);
  const sourceImages = args.sourceImages || [];
  const sourceImageStats =
    args.sourceImageStats || emptySourceImageStats(sourceImages.length, sourceImages.length);
  const sourcePages: SourcePackagePage[] = selectedChunks.map((chunk, sourceIndex) => {
    const outline = sourceOutlines[sourceIndex];
    const keyPoints = outline?.keyPoints?.length ? outline.keyPoints : extractKeyPoints(chunk.text);
    const suggestedPageKind = outline ? inferSourcePageKind(outline, sourceIndex + 1) : 'summary';
    const imageIds = imageIdsForSourcePage(sourceImages, chunk.sourceLabel, sourceIndex);
    const imageAnchor = imageIds.length ? `\n可复用原文图片：${imageIds.join(', ')}` : '';
    return {
      sourceIndex: sourceIndex + 1,
      title: outline?.title || chunk.title,
      summary: outline?.description || clampText(cleanSourceText(chunk.text), 420),
      rawText: clampRawText(chunk.text, 3000),
      keyPoints,
      concreteAnchor: [
        buildConcreteAnchor({
          title: chunk.title,
          text: chunk.text,
          keyPoints,
          template: outline?.layoutIntent?.layoutTemplate || 'three_cards',
          disciplineStyle: args.disciplineStyle,
        }),
        imageAnchor,
      ]
        .filter(Boolean)
        .join('\n')
        .trim(),
      sourceLabel: chunk.sourceLabel,
      suggestedPageKind,
      imageIds,
    };
  });
  const sourcePackage: SourcePackage = {
    fileName: args.fileName,
    fileType: args.fileType,
    subject: args.subject,
    sourceText: args.sourceText || args.chunks.map((chunk) => chunk.text).join('\n\n'),
    sourcePages,
    sourceImages,
    imageMapping:
      args.imageMapping || Object.fromEntries(sourceImages.map((img) => [img.id, img.src])),
    imageStats: sourceImageStats,
    pageCount: args.chunks.length,
    parser: args.parser,
    warnings: sourceWarnings,
  };

  return {
    id: args.id,
    fileName: args.fileName,
    fileType: args.fileType,
    title: args.title,
    description: args.description,
    sourceTextLength: args.chunks.reduce((sum, chunk) => sum + chunk.text.length, 0),
    outlines: attachedOutlines,
    sourcePackage,
  };
}

function inferSourcePageKind(outline: SceneOutline, pageIndex: number): string {
  const text = [
    outline.title,
    outline.description,
    outline.archetype,
    outline.contentProfile,
    outline.layoutIntent?.layoutTemplate,
    outline.layoutIntent?.disciplineStyle,
    ...(outline.keyPoints || []),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  if (pageIndex === 0 || /cover|封面/.test(text)) return 'cover';
  if (/code|trace|class|object|python|代码|追踪|对象|属性/.test(text)) return 'code';
  if (/math|formula|proof|derivation|function|equation|函数|公式|证明|推导|定理/.test(text)) {
    return 'math';
  }
  if (/table|matrix|compare|comparison|表格|对比/.test(text)) return 'table';
  if (/process|timeline|step|流程|步骤/.test(text)) return 'process';
  if (/example|problem|例子|例题|题目/.test(text)) return 'example';
  if (/summary|takeaway|总结|回顾/.test(text)) return 'summary';
  return 'intro';
}

function stableIdFromName(prefix: string, name: string): string {
  const hash = createHash('sha1').update(name).digest('hex').slice(0, 16) || 'item';
  return `${prefix}-${hash}`;
}

function fileTypeFromName(fileName: string): SubjectNotebookFile['fileType'] | null {
  if (/\.md$/i.test(fileName)) return 'md';
  if (/\.pdf$/i.test(fileName)) return 'pdf';
  if (/\.pptx$/i.test(fileName)) return 'pptx';
  return null;
}

function subjectDisciplineStyle(
  subject: string,
): NonNullable<SceneLayoutIntent['disciplineStyle']> {
  if (/数学|math|algebra|calculus|probability|statistics/i.test(subject)) return 'math';
  if (/计算机|computer|cs|program|code|oop|data/i.test(subject)) return 'code';
  return 'general';
}

function subjectDeckStyle(subject: string): NonNullable<SceneLayoutIntent['deckStyle']> {
  if (/计算机|computer|cs|program|code|oop|data/i.test(subject)) return 'tech_saas';
  return 'academic';
}

function subjectNotebookTitle(subject: string, fileTitle?: string): string {
  if (fileTitle) return `${subject} · ${fileTitle}`;
  if (/数学/.test(subject)) return '数学课程笔记本';
  if (/计算机/.test(subject)) return '计算机课程笔记本';
  if (/社会学/.test(subject)) return '社会学课程笔记本';
  if (/论文/.test(subject)) return '论文精读笔记本';
  return `${subject}课程笔记本`;
}

function subjectNotebookDescription(subject: string, files: SubjectNotebookFile[]): string {
  const fileList = files.map((file) => file.fileName).join('、');
  return [
    `按科目目录中的单个文件生成 HTML 整本笔记本测试，科目：${subject}。`,
    `来源文件 ${files.length} 个：${fileList || '无'}。`,
    '规划阶段需要先分配整本 notebook 的页面容量，再为每页写 HTML 生成 prompt。',
  ].join('\n');
}

async function loadSubjectSourceMaterial(args: {
  filePath: string;
  fileName: string;
  fileType: SubjectNotebookFile['fileType'];
  fastTextOnly?: boolean;
}): Promise<LoadedSubjectSource> {
  if (args.fileType === 'md') {
    const sourceText = await readFile(args.filePath, 'utf8');
    const chunks = splitMarkdownIntoChunks(sourceText);
    return {
      chunks,
      sourceText,
      sourceImages: [],
      imageMapping: {},
      imageStats: emptySourceImageStats(),
      pageCount: chunks.length,
      parser: 'markdown',
      warnings: [],
    };
  }

  const buffer = await readFile(args.filePath);
  if (args.fileType === 'pdf') {
    const chunks = await splitPdfIntoChunks(buffer);
    const warnings: string[] = [];
    let sourceText = chunks.map((chunk) => chunk.text).join('\n\n');
    let sourceImages: SourcePackageImage[] = [];
    let imageMapping: Record<string, string> = {};
    let imageStats = emptySourceImageStats();
    let pageCount = chunks.length;
    let parser = 'unpdf-text';
    if (args.fastTextOnly) {
      warnings.push('快速测试模式：跳过 PDF 图片抽取，只保留文本 source package。');
      return {
        chunks,
        sourceText,
        sourceImages,
        imageMapping,
        imageStats,
        pageCount,
        parser,
        warnings,
      };
    }
    try {
      const parsed = await parsePDF({ providerId: 'unpdf' }, buffer);
      sourceText = parsed.text || sourceText;
      pageCount = parsed.metadata?.pageCount || pageCount;
      parser = parsed.metadata?.parser || 'unpdf';
      const normalized = normalizeSourceImages(parsed.metadata?.pdfImages || [], args.fileName);
      sourceImages = normalized.sourceImages;
      imageMapping = normalized.imageMapping;
      imageStats = normalized.imageStats;
      warnings.push(...normalized.warnings);
      if (parsed.metadata?.pdfImages?.length && sourceImages.length === 0) {
        warnings.push('PDF 解析到了图片，但都因为大小或格式限制未进入 HTML notebook 测试。');
      }
    } catch (error) {
      warnings.push(
        `PDF 图片解析失败，已降级为文本源材料：${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return {
      chunks,
      sourceText,
      sourceImages,
      imageMapping,
      imageStats,
      pageCount,
      parser,
      warnings,
    };
  }

  const parsed = await parsePptxBuffer({
    buffer,
    fileName: args.fileName,
    fileSize: buffer.byteLength,
  });
  const normalized = normalizeSourceImages(
    parsed.metadata.pdfImages || parsed.images || [],
    args.fileName,
  );
  return {
    chunks: splitPptxTextIntoChunks(parsed.text),
    sourceText: parsed.text,
    sourceImages: normalized.sourceImages,
    imageMapping: normalized.imageMapping,
    imageStats: normalized.imageStats,
    pageCount: parsed.metadata.slideCount,
    parser: 'pptxtojson',
    warnings: normalized.warnings,
  };
}

function cloneNotebookOutline(args: {
  outline: SceneOutline;
  file: SubjectNotebookFile;
  order: number;
}): SceneOutline {
  const sourceLabel = `${args.file.fileName} · ${args.outline.title}`;
  return normalizeComputerScienceSceneOutline({
    ...args.outline,
    id: `${args.file.id}-${args.outline.id}`,
    title: args.outline.title,
    description: [`来源文件：${args.file.fileName}`, args.outline.description]
      .filter(Boolean)
      .join('\n'),
    order: args.order,
    teachingPagePlan: args.outline.teachingPagePlan
      ? {
          ...args.outline.teachingPagePlan,
          id: `${args.file.id}-${args.outline.teachingPagePlan.id}`,
          order: args.order + 1,
          concreteAnchor: [
            `来源文件：${args.file.fileName}`,
            args.outline.teachingPagePlan.concreteAnchor,
          ]
            .filter(Boolean)
            .join('\n'),
        }
      : undefined,
    studentThinkingMove:
      args.outline.studentThinkingMove ||
      `先定位这一页来自 ${sourceLabel}，再看它在整本 notebook 中承担的作用。`,
  });
}

async function loadSubjectNotebookFixtures(
  options: {
    subject?: string;
    fileName?: string;
    fastTextOnly?: boolean;
  } = {},
): Promise<SubjectNotebookFixture[]> {
  const subjectRoot = path.join(TESTFILE_ROOT, SUBJECT_NOTEBOOK_DIR);
  const entries = await readdir(subjectRoot, { withFileTypes: true });
  const subjectDirs = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .filter((subject) => !options.subject || subject === options.subject)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));

  const notebooksBySubject = await Promise.all(
    subjectDirs.map(async (subject): Promise<SubjectNotebookFixture[]> => {
      const subjectPath = path.join(subjectRoot, subject);
      const fileNames = (await readdir(subjectPath))
        .filter((fileName) => !fileName.startsWith('.') && fileTypeFromName(fileName))
        .filter((fileName) => !options.fileName || fileName === options.fileName)
        .sort((a, b) => a.localeCompare(b, 'zh-CN'));
      if (fileNames.length === 0) return [];

      const disciplineStyle = subjectDisciplineStyle(subject);
      const deckStyle = subjectDeckStyle(subject);

      const notebooks = await Promise.all(
        fileNames.map(async (fileName) => {
          const fileType = fileTypeFromName(fileName);
          if (!fileType) return null;
          const source = await loadSubjectSourceMaterial({
            filePath: path.join(subjectPath, fileName),
            fileName,
            fileType,
            fastTextOnly: options.fastTextOnly,
          });
          const title = fileName.replace(/\.[^.]+$/, '');
          const notebookId = stableIdFromName('subject-notebook', `${subject}/${fileName}`);
          const fileId = `${notebookId}-source`;
          const fixture = buildFixture({
            id: fileId,
            fileName,
            fileType,
            title,
            description: `${subject} notebook source file: ${fileName}`,
            chunks: source.chunks,
            language: 'zh-CN',
            disciplineStyle,
            deckStyle,
            sharedExamples: disciplineStyle === 'code' ? [TWEET_MEMORY] : undefined,
            subject,
            sourceText: source.sourceText,
            sourceImages: source.sourceImages,
            imageMapping: source.imageMapping,
            sourceImageStats: source.imageStats,
            parser: source.parser,
            sourceWarnings: source.warnings,
          });

          const file: SubjectNotebookFile = {
            id: fileId,
            fileName,
            fileType,
            title,
            sourceTextLength: fixture.sourceTextLength,
            pageCount: source.pageCount || Math.max(0, fixture.outlines.length - 1),
          };
          const coverChunks: FilePageChunk[] = fixture.outlines.slice(1, 3).map((outline) => ({
            title: outline.title,
            text: [outline.description, ...(outline.keyPoints || [])].join('\n'),
            sourceLabel: outline.title,
          }));
          const notebookTitle = subjectNotebookTitle(subject, title);
          const coverOutline = buildCoverOutline({
            fixtureId: notebookId,
            title: notebookTitle,
            chunks: coverChunks,
            total: file.pageCount + 1,
            language: 'zh-CN',
            disciplineStyle,
            deckStyle,
          });

          const sourceOutlines = fixture.outlines.slice(1).map((outline, outlineIndex) =>
            cloneNotebookOutline({
              outline,
              file,
              order: outlineIndex + 1,
            }),
          );

          const notebook: SubjectNotebookFixture = {
            id: notebookId,
            subject,
            fileName: `${subject}/${fileName}`,
            fileType: 'notebook' as const,
            title: notebookTitle,
            description: subjectNotebookDescription(subject, [file]),
            fileCount: 1,
            sourceFiles: [file],
            sourceTextLength: file.sourceTextLength,
            outlines: attachDeckMemoryToOutlines([coverOutline, ...sourceOutlines]),
            sourcePackage: {
              ...(fixture.sourcePackage || {
                fileName,
                fileType,
                subject,
                sourceText: source.sourceText,
                sourcePages: [],
                sourceImages: source.sourceImages,
                imageMapping: source.imageMapping,
                imageStats: source.imageStats,
                pageCount: source.pageCount,
                parser: source.parser,
                warnings: source.warnings,
              }),
              fileName: `${subject}/${fileName}`,
              fileType: 'notebook' as const,
              subject,
            },
          };
          return notebook;
        }),
      );

      return notebooks.filter((notebook): notebook is SubjectNotebookFixture => notebook !== null);
    }),
  );

  return notebooksBySubject.flat();
}

async function loadFixtures(): Promise<TestfileFixture[]> {
  const testFiles = await readdir(TESTFILE_ROOT);
  const functionsPdfFileName =
    testFiles.find((fileName) => /\.pdf$/i.test(fileName) && /function/i.test(fileName)) ||
    '04_Functions.pdf';
  const readFirstExisting = async (
    candidates: string[],
  ): Promise<{ fileName: string; filePath: string; buffer: Buffer } | null> => {
    for (const fileName of candidates) {
      const filePath = path.join(TESTFILE_ROOT, fileName);
      try {
        return { fileName, filePath, buffer: await readFile(filePath) };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    return null;
  };

  const fixtures: TestfileFixture[] = [];

  const oopMarkdownPath = path.join(TESTFILE_ROOT, 'oop.md');
  try {
    const oopMarkdown = await readFile(oopMarkdownPath, 'utf8');
    fixtures.push(
      buildFixture({
        id: 'oop-md',
        fileName: 'oop.md',
        fileType: 'md',
        title: 'OOP Markdown',
        description: 'Markdown source about Python OOP, Tweet, attributes, self, and methods.',
        chunks: splitMarkdownIntoChunks(oopMarkdown),
        language: 'en-US',
        disciplineStyle: 'code',
        deckStyle: 'tech_saas',
        sharedExamples: [TWEET_MEMORY],
      }),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const oopPdf = await readFirstExisting([
      '科目测试/计算机/02-OOP-1.pdf',
      '科目测试/计算机/02 - Inheritance I.pdf',
      '科目测试/计算机/Linked Lists_I.pdf',
    ]);
    if (oopPdf) {
      fixtures.push(
        buildFixture({
          id: 'oop-pdf',
          fileName: oopPdf.fileName,
          fileType: 'pdf',
          title: 'OOP PDF',
          description:
            'PDF source about object-oriented programming; fallback used because root testfile/oop.md is not present.',
          chunks: await splitPdfIntoChunks(oopPdf.buffer),
          language: 'en-US',
          disciplineStyle: 'code',
          deckStyle: 'tech_saas',
          sharedExamples: [TWEET_MEMORY],
        }),
      );
    }
  }

  const functionsPdf = await readFirstExisting([
    functionsPdfFileName,
    '科目测试/数学/04Relations.pdf',
    '科目测试/数学/11GroupTheory.pdf',
    '科目测试/数学/Week_11_Markov Chain.pdf',
    'GraphTest/2023-test2-mat133.pdf',
  ]);
  if (functionsPdf) {
    fixtures.push(
      buildFixture({
        id: 'functions-pdf',
        fileName: functionsPdf.fileName,
        fileType: 'pdf',
        title: /function/i.test(functionsPdf.fileName) ? 'Functions PDF' : 'Math PDF',
        description:
          'PDF source for a mathematics course; each generated slide uses one parsed PDF page.',
        chunks: await splitPdfIntoChunks(functionsPdf.buffer),
        language: 'zh-CN',
        disciplineStyle: 'math',
        deckStyle: 'academic',
      }),
    );
  }

  const victimizationPptx = await readFirstExisting([
    '3. Impacts of victimization.pptx',
    '科目测试/社会学/3. Impacts of victimization.pptx',
    '科目测试/社会学/1. victims overview.pptx',
  ]);
  if (victimizationPptx) {
    const victimizationParsed = await parsePptxBuffer({
      buffer: victimizationPptx.buffer,
      fileName: victimizationPptx.fileName,
      fileSize: victimizationPptx.buffer.byteLength,
    });
    fixtures.push(
      buildFixture({
        id: 'victimization-pptx',
        fileName: victimizationPptx.fileName,
        fileType: 'pptx',
        title: 'Victimization PPTX',
        description:
          'PowerPoint source about impacts of victimization; each generated slide uses one parsed source slide.',
        chunks: splitPptxTextIntoChunks(victimizationParsed.text),
        language: 'en-US',
        disciplineStyle: 'general',
        deckStyle: 'academic',
      }),
    );
  }

  if (fixtures.length === 0) {
    throw new Error('No usable testfile fixtures found under testfile/.');
  }

  return fixtures;
}

export async function GET(req: NextRequest) {
  try {
    if (req.nextUrl.searchParams.get('mode') === 'subject-notebooks') {
      const notebooks = await loadSubjectNotebookFixtures({
        subject: req.nextUrl.searchParams.get('subject') || undefined,
        fileName: req.nextUrl.searchParams.get('fileName') || undefined,
        fastTextOnly: req.nextUrl.searchParams.get('fast') === '1',
      });
      const response = apiSuccess({ notebooks });
      response.headers.set('Cache-Control', 'no-store, max-age=0');
      return response;
    }

    const fixtures = await loadFixtures();
    const response = apiSuccess({ fixtures });
    response.headers.set('Cache-Control', 'no-store, max-age=0');
    return response;
  } catch (error) {
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to load testfile fixtures',
      error instanceof Error ? error.message : String(error),
    );
  }
}
