import type { NotebookProblemImportDraft } from '@/lib/problem-bank';
import type { SourceMemoryArtifact } from '@/features/memory/server/source-ingestion';
import type { SourceUploadKind } from '@/features/memory/server/source-upload-ingestion';

export type SourcePacketDocumentType =
  | 'paper'
  | 'lecture_notes'
  | 'problem_bank'
  | 'template_policy'
  | 'mixed'
  | 'unknown';

export type SourceUsageProfile = 'research' | 'university_course' | 'daily_use';

export type SourcePacketEvidenceRef = {
  sourceHash: string;
  sourceTitle: string;
  pageNumber?: number;
  sectionTitle?: string;
  note?: string;
};

export type SourcePacketNotebookSection = {
  key: string;
  title: string;
  summary: string;
  markdown: string;
  sourceRefs: SourcePacketEvidenceRef[];
};

export type SourceStructuredNoteItem = {
  label: string;
  detail: string;
  evidenceRefs?: string[];
};

export type SourceCheatSheet = {
  definition: string;
  methods: Array<{
    name: string;
    trigger: string;
    rule: string;
    boundary: string;
  }>;
  keyPoints: Array<{
    title: string;
    detail: string;
  }>;
  learningSteps: string[];
  keywords: string[];
};

export type SourceAnswerContractRule = {
  category:
    | 'solution_format'
    | 'method_choice'
    | 'notation'
    | 'proof_style'
    | 'grading'
    | 'forbidden_move'
    | 'private_setting';
  rule: string;
  when: string;
  example: string;
  evidence: string;
};

/**
 * Course-local answer preferences extracted from the original source file.
 * Generic subject knowledge must stay in notebook sections/RAG instead.
 */
export type SourceAnswerContract = {
  shouldPersist: boolean;
  title: string;
  courseCode: string | null;
  summary: string;
  rules: SourceAnswerContractRule[];
};

export type SourceStructuredNotebookKnowledge = {
  componentType: 'research_evidence_card' | 'course_learning_card' | 'daily_index_card';
  title: string;
  subtitle: string;
  summary: string;
  learningPath?: string[];
  keyTakeaways?: string[];
  answerStrategy?: string[];
  sections: Array<{
    title: string;
    role: string;
    summary: string;
    evidenceRefs: string[];
  }>;
  concepts: SourceStructuredNoteItem[];
  methods: SourceStructuredNoteItem[];
  retrievalTriggers: string[];
};

export type SourceStructuredCourseControl = {
  componentType: 'research_control_card' | 'course_control_card' | 'daily_private_card';
  title: string;
  summary: string;
  placement: SourceStructuredNoteItem[];
  useWhen: string[];
  doNotUseWhen: string[];
  teachingMoves: string[];
  boundaryWarnings: string[];
  graphLinks: Array<{
    kind: 'complements' | 'competes_with' | 'depends_on' | 'opens_question';
    items: string[];
  }>;
};

export type SourceStructuredNotes = {
  version: 1;
  usageProfile: SourceUsageProfile;
  notebookKnowledge: SourceStructuredNotebookKnowledge;
  courseControl: SourceStructuredCourseControl | null;
};

export type SourcePacket = {
  version: 1;
  source: {
    title: string;
    kind: SourceUploadKind;
    fileMime: string | null;
    hash: string;
    rawFileHash: string | null;
    openaiFileId: string | null;
    parser: string;
    pageCount: number | null;
    slideCount: number | null;
  };
  classification: {
    documentType: SourcePacketDocumentType;
    usageProfile: SourceUsageProfile;
    usageProfileConfidence: number;
    usageProfileReasons: string[];
    topic: string;
    allQuestionUpload: boolean;
    problemExtractionEligible: boolean;
    confidence: number;
    reasons: string[];
  };
  notebookSections: SourcePacketNotebookSection[];
  graph: {
    concepts: string[];
    methods: string[];
    sourceRefs: SourcePacketEvidenceRef[];
  };
  structuredNotes?: SourceStructuredNotes;
  cheatSheet?: SourceCheatSheet;
  answerContract?: SourceAnswerContract;
  memory?: {
    publicSummary?: string;
    privateUpdatePolicy?: string;
    layeredPlan?: Array<{
      layer: string;
      status: 'written' | 'skipped' | 'available';
      summary: string;
    }>;
  };
};

export type SourcePacketBuildArgs = {
  sourceTitle: string;
  sourceKind: SourceUploadKind;
  sourceFileMime?: string | null;
  sourceHash: string;
  rawFileHash?: string | null;
  openaiFileId?: string | null;
  parser?: string | null;
  pageCount?: number | null;
  slideCount?: number | null;
  courseCode?: string | null;
  topic: string;
  text: string;
  allQuestionUpload: boolean;
  problemExtractionEligible: boolean;
  problemSignalCount: number;
  usageProfile?: SourceUsageProfile;
  artifacts: SourceMemoryArtifact[];
  drafts: NotebookProblemImportDraft[];
};

const MAX_SECTION_CHARS = 42_000;
const MAX_EXCERPT_CHARS = 9_000;
const MAX_RAW_EXCERPT_CHARS = 24_000;
const CONCEPT_STOPWORDS = new Set([
  'of',
  'to',
  'in',
  'on',
  'as',
  'by',
  'for',
  'and',
  'the',
  'pdf',
  'article',
  'doi',
  'https',
]);

function compact(input: string | null | undefined, maxChars: number): string {
  const text = String(input || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

function collapse(input: string): string {
  return input.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function stripExtension(name: string): string {
  return name.replace(/\.[a-z0-9]{1,8}$/i, '').trim();
}

function cleanTitle(input: string, fallback = 'Uploaded source'): string {
  const title = stripExtension(input).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return compact(title || fallback, 96);
}

function sourceRef(args: SourcePacketBuildArgs, note: string): SourcePacketEvidenceRef {
  return {
    sourceHash: args.sourceHash,
    sourceTitle: args.sourceTitle,
    note,
  };
}

function paragraphBlocks(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length >= 24);
}

function headingLines(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => {
          if (/^#{1,4}\s+\S/.test(line)) return true;
          if (
            /^(?:abstract|introduction|background|method|methods|approach|experiment|experiments|results|discussion|conclusion|limitations|references)\b/i.test(
              line,
            )
          ) {
            return true;
          }
          if (/^(?:摘要|引言|背景|方法|实验|结果|讨论|结论|局限|参考文献)\b/.test(line)) {
            return true;
          }
          return false;
        })
        .map((line) => line.replace(/^#{1,4}\s+/, '').replace(/[:：]\s*$/, ''))
        .filter((line) => line.length >= 2 && line.length <= 120),
    ),
  ).slice(0, 24);
}

function matchingExcerpt(text: string, patterns: RegExp[], fallbackStart = 0): string {
  const startFloor = Math.max(0, Math.min(text.length, fallbackStart));
  const windowFromPattern = patterns
    .map((pattern) => {
      const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
      const matcher = new RegExp(pattern.source, flags);
      let best: number | null = null;
      for (const match of text.matchAll(matcher)) {
        const index = match.index ?? -1;
        if (index < startFloor) continue;
        best = index;
        break;
      }
      return best;
    })
    .filter((index): index is number => index !== null)
    .sort((a, b) => a - b)[0];
  if (windowFromPattern !== undefined) {
    const excerptStart = Math.max(0, windowFromPattern - 500);
    return compact(text.slice(excerptStart, excerptStart + MAX_EXCERPT_CHARS), MAX_EXCERPT_CHARS);
  }

  const blocks = paragraphBlocks(text);
  const matches = blocks.filter((block) => {
    if (block.length > MAX_EXCERPT_CHARS * 1.5) return false;
    return patterns.some((pattern) => pattern.test(block));
  });
  if (matches.length > 0) {
    return compact(matches.slice(0, 8).join('\n\n'), MAX_EXCERPT_CHARS);
  }
  const start = Math.max(0, fallbackStart);
  return compact(text.slice(start, start + MAX_EXCERPT_CHARS), MAX_EXCERPT_CHARS);
}

const NUMERIC_EVIDENCE_LINE_PATTERN =
  /\b(?:supplementary\s+table|table\s+\d|model\s+name|data\s+format|target\s+value|valid|unique|novelty|fid|fcd|logp|qed|mw|tpsa|hbd|hba|dragonfly|diffumol|digress|sketchmol|mae|mean\s+absolute\s+error)\b/i;

function looksLikeNumericEvidenceLine(line: string): boolean {
  const normalized = collapse(line);
  if (normalized.length < 3 || normalized.length > 650) return false;
  const numericCount = normalized.match(/[-+]?\d+(?:\.\d+)?/g)?.length || 0;
  const hasEvidenceKeyword = NUMERIC_EVIDENCE_LINE_PATTERN.test(normalized);
  const hasColumnSeparator = /\||\t| {2,}/.test(line);
  if (hasEvidenceKeyword && (numericCount > 0 || /table|model\s+name|target\s+value/i.test(line))) {
    return true;
  }
  return numericCount >= 3 && hasColumnSeparator;
}

function extractNumericEvidenceBlocks(text: string): string[] {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const anchorIndexes = lines
    .map((line, index) => (looksLikeNumericEvidenceLine(line) ? index : -1))
    .filter((index) => index >= 0);
  if (anchorIndexes.length === 0) return [];

  const ranges: Array<[number, number]> = [];
  for (const index of anchorIndexes) {
    const start = Math.max(0, index - 2);
    const end = Math.min(lines.length, index + 9);
    const last = ranges[ranges.length - 1];
    if (last && start <= last[1] + 1) {
      last[1] = Math.max(last[1], end);
    } else {
      ranges.push([start, end]);
    }
  }

  const seen = new Set<string>();
  const blocks: string[] = [];
  for (const [start, end] of ranges) {
    const block = lines.slice(start, end).join('\n').trim();
    if (!block) continue;
    const key = collapse(block).toLowerCase().slice(0, 500);
    if (seen.has(key)) continue;
    seen.add(key);
    blocks.push(compact(block, 4_000));
    if (blocks.join('\n\n').length >= 12_000) break;
  }
  return blocks.slice(0, 8);
}

function lectureNoteSignalCount(sourceTitle: string, text: string): number {
  const haystack = `${sourceTitle}\n${text.slice(0, 90_000)}`.toLowerCase();
  return [
    /\b(?:lecture|slides?|lesson|course|class|week\s*\d+|module|unit|chapter|tutorial|worksheet)\b/.test(
      haystack,
    ),
    /\b(?:mat|csc|cpsc|sta|phy|chem|bio|eco)\s*-?\s*\d{3}\b/.test(haystack),
    /\b(?:divergence|integral|comparison|ratio)\s+test\b/.test(haystack),
    /(?:讲义|课程|课件|章节|单元|课堂|定义|定理|例题|判别法|练习)/.test(haystack),
    /^(?:slide|page)\s+\d+/im.test(text),
    /^#{1,3}\s+\S/m.test(text),
  ].filter(Boolean).length;
}

function inferDocumentType(args: SourcePacketBuildArgs): {
  documentType: SourcePacketDocumentType;
  confidence: number;
  reasons: string[];
} {
  if (args.allQuestionUpload || args.sourceKind === 'problem_bank') {
    return {
      documentType: 'problem_bank',
      confidence: 0.92,
      reasons: ['The upload is explicitly or statistically dominated by exercises.'],
    };
  }

  const haystack = `${args.sourceTitle}\n${args.text.slice(0, 90_000)}`.toLowerCase();
  const paperSignals = [
    /\babstract\b/.test(haystack),
    /\bintroduction\b/.test(haystack),
    /\b(?:method|methodology|approach)\b/.test(haystack),
    /\b(?:experiment|evaluation|results)\b/.test(haystack),
    /\b(?:references|bibliography)\b/.test(haystack),
    /\b(?:doi|arxiv|preprint|conference|journal)\b/.test(haystack),
  ].filter(Boolean).length;
  if (paperSignals >= 3) {
    return {
      documentType: 'paper',
      confidence: Math.min(0.96, 0.58 + paperSignals * 0.06),
      reasons: [`Research-paper signals detected: ${paperSignals}.`],
    };
  }

  const templateSignals = args.artifacts.filter((artifact) => artifact.staticInjectionCandidate);
  if (templateSignals.length > 0 && args.text.length < 80_000) {
    return {
      documentType: 'template_policy',
      confidence: 0.82,
      reasons: ['Course-specific template or answer-contract signals were detected.'],
    };
  }

  const lectureSignals = lectureNoteSignalCount(args.sourceTitle, args.text);
  if (lectureSignals >= 2) {
    return {
      documentType: 'lecture_notes',
      confidence: 0.78,
      reasons: [`Lecture-note signals detected: ${lectureSignals}.`],
    };
  }

  if (
    args.problemExtractionEligible ||
    args.problemSignalCount >= 4 ||
    templateSignals.length > 0
  ) {
    return {
      documentType: 'mixed',
      confidence: 0.66,
      reasons: [
        'The upload contains some assessment or template signals but is not all questions.',
      ],
    };
  }

  return {
    documentType: 'unknown',
    confidence: 0.56,
    reasons: [
      'No strong paper, lecture, question-bank, or template-policy signature was detected.',
    ],
  };
}

function inferUsageProfile(
  args: SourcePacketBuildArgs,
  documentType: SourcePacketDocumentType,
): {
  usageProfile: SourceUsageProfile;
  confidence: number;
  reasons: string[];
} {
  if (args.usageProfile) {
    return {
      usageProfile: args.usageProfile,
      confidence: 0.95,
      reasons: ['Explicit upload usage profile was provided.'],
    };
  }

  const haystack = `${args.sourceTitle}\n${args.text.slice(0, 90_000)}`.toLowerCase();
  const courseSignals = [
    Boolean(args.courseCode),
    /\b(?:course|syllabus|lecture|assignment|homework|exam|quiz|module|unit|chapter|rubric|tutorial|worksheet|problem set|pset)\b/.test(
      haystack,
    ),
    /(?:课程|课堂|讲义|作业|考试|测验|章节|单元|评分标准|复习|预习|知识点|例题)/.test(haystack),
    args.artifacts.some((artifact) => artifact.staticInjectionCandidate),
    args.problemSignalCount >= 3 || args.drafts.length > 0,
  ].filter(Boolean).length;
  const dailySignals = [
    /\b(?:meeting|todo|to-do|agenda|memo|minutes|schedule|calendar|invoice|receipt|contract|itinerary|journal|diary|plan|roadmap|shopping|contact|follow[- ]?up|decision log)\b/.test(
      haystack,
    ),
    /(?:会议|纪要|待办|清单|日程|行程|账单|发票|收据|合同|计划|备忘|联系人|跟进|决定|个人|生活|项目记录|周报|日报)/.test(
      haystack,
    ),
  ].filter(Boolean).length;

  if (documentType === 'paper') {
    return {
      usageProfile: 'research',
      confidence: 0.9,
      reasons: ['Research-paper structure should use the research reading chain.'],
    };
  }

  if (
    args.allQuestionUpload ||
    documentType === 'problem_bank' ||
    documentType === 'template_policy' ||
    documentType === 'lecture_notes'
  ) {
    return {
      usageProfile: 'university_course',
      confidence: 0.84,
      reasons: [`${documentType} documents should use the university-course chain.`],
    };
  }

  if (courseSignals >= 2) {
    return {
      usageProfile: 'university_course',
      confidence: Math.min(0.88, 0.62 + courseSignals * 0.07),
      reasons: [`Course-use signals detected: ${courseSignals}.`],
    };
  }

  if (dailySignals > 0 && courseSignals === 0) {
    return {
      usageProfile: 'daily_use',
      confidence: Math.min(0.86, 0.68 + dailySignals * 0.08),
      reasons: [`Daily-use signals detected: ${dailySignals}.`],
    };
  }

  if (documentType === 'mixed' && courseSignals > 0) {
    return {
      usageProfile: 'university_course',
      confidence: 0.7,
      reasons: ['Mixed source has assessment or classroom signals.'],
    };
  }

  return {
    usageProfile: args.courseCode ? 'university_course' : 'daily_use',
    confidence: args.courseCode ? 0.64 : 0.62,
    reasons: [
      args.courseCode
        ? 'No strong research signal; course context defaults to the university-course chain.'
        : 'No strong research or course signal; defaulting to the daily-use chain.',
    ],
  };
}

function keywordConcepts(
  args: SourcePacketBuildArgs,
  documentType: SourcePacketDocumentType,
): string[] {
  const candidates = new Set<string>();
  const title = cleanTitle(args.topic || args.sourceTitle);
  candidates.add(title);
  for (const heading of headingLines(args.text)) candidates.add(cleanTitle(heading));
  for (const artifact of args.artifacts) {
    if (artifact.artifactKind !== 'discarded_generic_concept') {
      for (const tag of artifact.tags) candidates.add(cleanTitle(tag));
    }
  }
  for (const draft of args.drafts.slice(0, 12)) {
    for (const tag of draft.tags) candidates.add(cleanTitle(tag));
  }

  const technicalPhrases = Array.from(
    args.text.matchAll(
      /\b(?:molecular generation|molecule image|molecular image|SMILES|graph representation|diffusion model|transformer|autoencoder|evaluation metric|representation invariant|docstring|HtDF|HtDD|template-origin|starter code)\b/gi,
    ),
  ).map((match) => match[0]);
  for (const phrase of technicalPhrases) candidates.add(cleanTitle(phrase));

  if (documentType === 'paper') {
    candidates.add('Research question');
    candidates.add('Method pipeline');
    candidates.add('Experimental evidence');
    candidates.add('Limitations');
  }

  return Array.from(candidates)
    .map((item) => collapse(item))
    .filter((item, index, all) => {
      if (item.length < 2) return false;
      if (CONCEPT_STOPWORDS.has(item.toLowerCase())) return false;
      return all.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index;
    })
    .slice(0, 36);
}

function methodCandidates(text: string): string[] {
  const methods = new Set<string>();
  const stopWords = new Set(['of', 'to', 'in', 'on', 'as', 'by', 'for', 'and', 'the', 'with']);
  const classOrFunction = Array.from(text.matchAll(/\b(?:class|def)\s+([A-Za-z_]\w*)/g)).map(
    (match) => match[1],
  );
  for (const item of classOrFunction) {
    const normalized = item.toLowerCase();
    if (item.length < 4 || stopWords.has(normalized)) continue;
    methods.add(item);
  }
  const phrases = Array.from(
    text.matchAll(
      /\b(?:pipeline|framework|algorithm|architecture|encoder|decoder|generator|classifier|diffusion|retrieval|ranking|evaluation)\b/gi,
    ),
  ).map((match) => match[0]);
  for (const item of phrases) {
    const title = cleanTitle(item);
    if (title.length < 4 || stopWords.has(title.toLowerCase())) continue;
    methods.add(title);
  }
  return Array.from(methods).slice(0, 18);
}

function markdownSection(args: {
  key: string;
  title: string;
  summary: string;
  body: string[];
  sourceRefs: SourcePacketEvidenceRef[];
}): SourcePacketNotebookSection {
  return {
    key: args.key,
    title: args.title,
    summary: args.summary,
    markdown: compact(
      [`# ${args.title}`, '', ...args.body.filter((line) => line.trim())].join('\n'),
      MAX_SECTION_CHARS,
    ),
    sourceRefs: args.sourceRefs,
  };
}

function buildNumericEvidenceSection(
  args: SourcePacketBuildArgs,
  refs: SourcePacketEvidenceRef[],
): SourcePacketNotebookSection | null {
  const blocks = extractNumericEvidenceBlocks(args.text);
  if (blocks.length === 0) return null;

  const topic = cleanTitle(args.topic || args.sourceTitle);
  return markdownSection({
    key: 'paper-numeric-evidence',
    title: `${topic} - 表格与数值证据`,
    summary: '保留论文原文中的表格、模型名、指标和 benchmark 数字，供后续精确问答检索。',
    sourceRefs: refs,
    body: [
      `来源：${args.sourceTitle}`,
      '',
      '## 原文表格/数值线索',
      ...blocks.flatMap((block, index) => [
        '',
        `### Evidence block ${index + 1}`,
        '```text',
        block,
        '```',
      ]),
    ],
  });
}

function buildPaperSections(args: SourcePacketBuildArgs): SourcePacketNotebookSection[] {
  const sourceTitle = cleanTitle(args.sourceTitle);
  const topic = cleanTitle(args.topic || sourceTitle);
  const overview = matchingExcerpt(args.text, [/abstract/i, /research question/i], 0);
  const background = matchingExcerpt(
    args.text,
    [/background/i, /introduction/i, /related work/i],
    0,
  );
  const method = matchingExcerpt(
    args.text,
    [/method/i, /approach/i, /pipeline/i, /model/i],
    Math.floor(args.text.length * 0.25),
  );
  const experiments = matchingExcerpt(
    args.text,
    [/experiment/i, /evaluation/i, /result/i, /dataset/i],
    Math.floor(args.text.length * 0.55),
  );
  const conclusion = matchingExcerpt(
    args.text,
    [/limitation/i, /discussion/i, /conclusion/i, /future work/i],
    Math.floor(args.text.length * 0.75),
  );
  const refs = [sourceRef(args, 'paper-source')];
  const numericEvidence = buildNumericEvidenceSection(args, refs);

  const sections: SourcePacketNotebookSection[] = [
    markdownSection({
      key: 'paper-overview',
      title: `${topic} - 资料总览`,
      summary: '论文阅读地图：研究问题、资料定位、证据边界。',
      sourceRefs: refs,
      body: [
        `来源：${args.sourceTitle}`,
        `文档类型：research paper`,
        args.usageProfile === 'university_course' && args.courseCode
          ? `课程：${args.courseCode}`
          : '',
        '',
        '## 这份资料解决什么问题',
        overview,
        '',
        '## 查询提示',
        `后续如果学生问「${sourceTitle} 讲了什么」或 Sketch Molecule 中的 molecule image generation，应优先检索本资料和原文证据。`,
      ],
    }),
    markdownSection({
      key: 'paper-background',
      title: `${topic} - 背景与术语`,
      summary: '提取论文涉及的背景概念和可检索术语。',
      sourceRefs: refs,
      body: [
        '## 关键术语',
        ...keywordConcepts(args, 'paper')
          .slice(0, 16)
          .map((concept) => `- ${concept}`),
        '',
        '## 原文依据',
        background,
      ],
    }),
    markdownSection({
      key: 'paper-method',
      title: `${topic} - 方法与流程`,
      summary: '整理输入、表示、模型流程和输出。',
      sourceRefs: refs,
      body: [
        '## 方法线索',
        ...methodCandidates(args.text)
          .slice(0, 12)
          .map((item) => `- ${item}`),
        '',
        '## 原文依据',
        method,
      ],
    }),
    markdownSection({
      key: 'paper-results',
      title: `${topic} - 实验与结论`,
      summary: '整理数据、指标、结果和作者主张。',
      sourceRefs: refs,
      body: ['## 原文依据', experiments],
    }),
    ...(numericEvidence ? [numericEvidence] : []),
    markdownSection({
      key: 'paper-limits-evidence',
      title: `${topic} - 局限与证据边界`,
      summary: '记录局限、假设和后续检索入口。',
      sourceRefs: refs,
      body: [
        '## 局限与后续问题',
        conclusion,
        '',
        '## 使用边界',
        '这份资料是论文型知识来源，不是题库。不要基于它自动伪造题目；需要练习题时应由单独的生成练习流程创建，并标注为 generated_from_source。',
      ],
    }),
  ];
  return sections;
}

function buildUniversityCourseSections(args: SourcePacketBuildArgs): SourcePacketNotebookSection[] {
  const sourceTitle = cleanTitle(args.sourceTitle);
  const topic = cleanTitle(args.topic || sourceTitle);
  const refs = [sourceRef(args, 'university-course-source')];
  const overview = matchingExcerpt(
    args.text,
    [
      /learning objectives?/i,
      /course outline/i,
      /syllabus/i,
      /module/i,
      /unit/i,
      /目标|课程|单元|讲义|章节|教学/i,
    ],
    0,
  );
  const conceptEvidence = matchingExcerpt(
    args.text,
    [/concept/i, /definition/i, /theorem/i, /principle/i, /知识点|概念|定义|定理|方法/i],
    Math.floor(args.text.length * 0.15),
  );
  const teachingFlow = matchingExcerpt(
    args.text,
    [/lecture/i, /example/i, /tutorial/i, /worked example/i, /课堂|例题|讲解|推导|步骤/i],
    Math.floor(args.text.length * 0.3),
  );
  const assessment = matchingExcerpt(
    args.text,
    [
      /assignment/i,
      /homework/i,
      /exam/i,
      /quiz/i,
      /rubric/i,
      /problem set/i,
      /作业|考试|测验|评分|题目|练习/i,
    ],
    Math.floor(args.text.length * 0.5),
  );
  const review = matchingExcerpt(
    args.text,
    [/review/i, /summary/i, /common mistakes?/i, /practice/i, /复习|总结|易错|练习|提醒/i],
    Math.floor(args.text.length * 0.7),
  );
  const concepts = keywordConcepts(args, 'lecture_notes').slice(0, 18);

  return [
    markdownSection({
      key: 'course-position-objectives',
      title: `${topic} - 课程位置与学习目标`,
      summary: '把资料放回课程结构中：本节要学什么、为什么要学、和哪一单元相关。',
      sourceRefs: refs,
      body: [
        `来源：${args.sourceTitle}`,
        args.courseCode ? `课程：${args.courseCode}` : '',
        '',
        '## 先定位',
        overview,
        '',
        '> 学习抓手：先回答“这份资料服务哪一个课程单元”，再决定要讲概念、方法、例题还是考试要求。',
      ],
    }),
    markdownSection({
      key: 'course-concepts-prerequisites',
      title: `${topic} - 核心概念与先修关系`,
      summary: '整理课程知识点、先修关系和术语入口。',
      sourceRefs: refs,
      body: [
        '## 这节课会反复用到的词',
        ...concepts.map((concept) => `- ${concept}`),
        '',
        '## 原文依据',
        conceptEvidence,
      ],
    }),
    markdownSection({
      key: 'course-teaching-flow',
      title: `${topic} - 课堂讲解脉络`,
      summary: '把原资料改写成课堂可讲的顺序，而不是论文式综述。',
      sourceRefs: refs,
      body: [
        '## 讲解顺序',
        '1. 先说明任务或问题场景。',
        '2. 再引入必要概念和方法条件。',
        '3. 接着用例题、代码、推导或图示落地。',
        '4. 最后指出学生容易误解的位置。',
        '',
        '## 原文依据',
        teachingFlow,
      ],
    }),
    markdownSection({
      key: 'course-assessment-practice',
      title: `${topic} - 例题、作业与考试接口`,
      summary: '提取题目、作业、评分、模板与考试相关线索。',
      sourceRefs: refs,
      body: [
        '## 题目与考核线索',
        assessment,
        '',
        '| 课堂使用 | 处理方式 |',
        '| --- | --- |',
        '| 原文自带题目 | 进入题库抽取与去重流程 |',
        '| 课程答题格式 | 进入模板库/课程记忆 |',
        '| 普通说明文字 | 保留在 notebook/RAG 中按需检索 |',
      ],
    }),
    markdownSection({
      key: 'course-review-misconceptions',
      title: `${topic} - 复习清单与易错点`,
      summary: '给后续复习、诊断和下一步教学动作留下入口。',
      sourceRefs: refs,
      body: [
        '## 复习时检查',
        '- 学生是否能说清本节资料服务的课程目标。',
        '- 学生是否能区分定义、方法条件、例题套路和答题格式。',
        '- 如果学生做错，先定位是概念缺口、方法选择错误、计算/代码细节，还是没有遵守课程模板。',
        '',
        '## 原文依据',
        review,
      ],
    }),
  ];
}

function buildDailyUseSections(args: SourcePacketBuildArgs): SourcePacketNotebookSection[] {
  const sourceTitle = cleanTitle(args.sourceTitle);
  const topic = cleanTitle(args.topic || sourceTitle);
  const refs = [sourceRef(args, 'daily-use-source')];
  const overview = matchingExcerpt(args.text, [/summary/i, /overview/i, /背景|摘要|概览|说明/i], 0);
  const importantInfo = matchingExcerpt(
    args.text,
    [
      /date/i,
      /deadline/i,
      /owner/i,
      /contact/i,
      /amount/i,
      /address/i,
      /时间|日期|截止|负责人|联系人|金额|地址/i,
    ],
    Math.floor(args.text.length * 0.15),
  );
  const actions = matchingExcerpt(
    args.text,
    [
      /todo/i,
      /to-do/i,
      /action item/i,
      /decision/i,
      /follow[- ]?up/i,
      /待办|行动项|决定|跟进|风险/i,
    ],
    Math.floor(args.text.length * 0.35),
  );
  const timeline = matchingExcerpt(
    args.text,
    [/timeline/i, /schedule/i, /agenda/i, /milestone/i, /日程|行程|时间线|议程|节点/i],
    Math.floor(args.text.length * 0.5),
  );
  const rawIndex = compact(args.text, MAX_RAW_EXCERPT_CHARS);

  return [
    markdownSection({
      key: 'daily-summary',
      title: `${topic} - 一页摘要`,
      summary: '把日常资料先压缩成能快速回忆的摘要。',
      sourceRefs: refs,
      body: [
        `来源：${args.sourceTitle}`,
        '',
        '## 这份资料是什么',
        overview,
        '',
        '> 使用边界：这是日常资料索引，不应作为课程知识或答题模板自动注入课堂回答。',
      ],
    }),
    markdownSection({
      key: 'daily-key-info',
      title: `${topic} - 关键信息`,
      summary: '记录人、时间、地点、金额、对象和重要名词。',
      sourceRefs: refs,
      body: [
        '## 需要快速查到的信息',
        importantInfo,
        '',
        '| 信息类型 | 检索提示 |',
        '| --- | --- |',
        '| 人/组织 | 联系人、负责人、相关方 |',
        '| 时间 | 日期、截止时间、会议时间、行程节点 |',
        '| 对象 | 文件、项目、物品、合同、账单或任务 |',
      ],
    }),
    markdownSection({
      key: 'daily-actions-decisions',
      title: `${topic} - 待办、决定与风险`,
      summary: '把可执行事项和需要继续跟进的地方单独放出来。',
      sourceRefs: refs,
      body: [
        '## 行动入口',
        actions,
        '',
        '## 使用方式',
        '- 如果用户问“接下来做什么”，优先查这一节。',
        '- 如果资料只是存档，没有明确行动项，不要编造待办。',
        '- 如果涉及个人安排，默认只作为个人/私有上下文使用。',
      ],
    }),
    markdownSection({
      key: 'daily-timeline',
      title: `${topic} - 时间线与上下文`,
      summary: '整理资料中的顺序、节点和前后关系。',
      sourceRefs: refs,
      body: ['## 时间与顺序', timeline],
    }),
    markdownSection({
      key: 'daily-source-index',
      title: `${topic} - 原文索引与追踪`,
      summary: '保留原文检索入口，方便之后精确回查。',
      sourceRefs: refs,
      body: [
        '## 后续追踪',
        '- 查事实时回到原文/RAG，不只依赖摘要。',
        '- 查待办时先确认是否有明确责任人和截止时间。',
        '- 查个人偏好或长期计划时，可以再由用户确认后写入私有记忆。',
        '',
        '## 原文整理',
        rawIndex,
      ],
    }),
  ];
}

function buildHeadingBasedSections(args: SourcePacketBuildArgs): SourcePacketNotebookSection[] {
  const lines = args.text.split('\n');
  const chunks: Array<{ title: string; body: string[] }> = [];
  let current: { title: string; body: string[] } | null = null;
  for (const line of lines) {
    const heading = line.match(/^\s{0,3}#{1,3}\s+(.+?)\s*$/)?.[1];
    if (heading) {
      if (current) chunks.push(current);
      current = { title: cleanTitle(heading), body: [] };
      continue;
    }
    if (current) current.body.push(line);
  }
  if (current) chunks.push(current);

  return chunks
    .filter((chunk) => chunk.body.join('\n').trim().length >= 80)
    .slice(0, 8)
    .map((chunk, index) =>
      markdownSection({
        key: `heading-${index + 1}`,
        title: chunk.title,
        summary: compact(chunk.body.join(' '), 240),
        sourceRefs: [sourceRef(args, `heading-${index + 1}`)],
        body: [
          `来源：${args.sourceTitle}`,
          args.courseCode ? `课程：${args.courseCode}` : '',
          '',
          compact(chunk.body.join('\n'), MAX_SECTION_CHARS - 1000),
        ],
      }),
    );
}

function buildGenericSections(args: SourcePacketBuildArgs): SourcePacketNotebookSection[] {
  const topic = cleanTitle(args.topic || args.sourceTitle);
  const refs = [sourceRef(args, 'generic-source')];
  const concepts = keywordConcepts(args, 'unknown').slice(0, 18);
  return [
    markdownSection({
      key: 'source-overview',
      title: `${topic} - 资料总览`,
      summary: '上传资料的主题、来源和检索入口。',
      sourceRefs: refs,
      body: [
        `来源：${args.sourceTitle}`,
        args.courseCode ? `课程：${args.courseCode}` : '',
        `资料类型：${args.sourceKind}`,
        '',
        '## 主题',
        topic,
        '',
        concepts.length ? '## 可检索概念' : '',
        ...concepts.map((concept) => `- ${concept}`),
      ],
    }),
    markdownSection({
      key: 'source-text',
      title: `${topic} - 原文整理`,
      summary: '整理后的可检索原文片段。',
      sourceRefs: refs,
      body: [compact(args.text, MAX_RAW_EXCERPT_CHARS)],
    }),
  ];
}

function buildTemplatePolicySections(args: SourcePacketBuildArgs): SourcePacketNotebookSection[] {
  const topic = cleanTitle(args.topic || args.sourceTitle);
  const templateArtifacts = args.artifacts.filter((artifact) => artifact.staticInjectionCandidate);
  return [
    markdownSection({
      key: 'template-policy',
      title: `${topic} - 课程要求与模板`,
      summary: '整理上传资料中识别到的课程答题要求。',
      sourceRefs: [sourceRef(args, 'template-policy')],
      body: [
        `来源：${args.sourceTitle}`,
        args.courseCode ? `课程：${args.courseCode}` : '',
        '',
        '## 识别到的要求',
        ...templateArtifacts.flatMap((artifact) => [
          `### ${artifact.title}`,
          artifact.text,
          '',
          '识别理由：',
          ...artifact.reasons.map((reason) => `- ${reason}`),
          '',
        ]),
        '## 原文片段',
        compact(args.text, MAX_RAW_EXCERPT_CHARS),
      ],
    }),
  ];
}

function buildNotebookSections(
  args: SourcePacketBuildArgs,
  documentType: SourcePacketDocumentType,
  usageProfile: SourceUsageProfile,
): SourcePacketNotebookSection[] {
  if (args.allQuestionUpload || documentType === 'problem_bank') return [];
  if (usageProfile === 'research' && documentType === 'paper') return buildPaperSections(args);
  if (documentType === 'template_policy') return buildTemplatePolicySections(args);
  if (usageProfile === 'university_course') return buildUniversityCourseSections(args);
  if (usageProfile === 'daily_use') return buildDailyUseSections(args);
  const headingSections = buildHeadingBasedSections(args);
  if (headingSections.length >= 2) return headingSections;
  return buildGenericSections(args);
}

export function classifySourceDocumentType(args: {
  sourceTitle: string;
  sourceKind: SourceUploadKind;
  text: string;
  problemSignalCount: number;
}): SourcePacketDocumentType {
  if (args.sourceKind === 'problem_bank') return 'problem_bank';
  const haystack = `${args.sourceTitle}\n${args.text.slice(0, 90_000)}`.toLowerCase();
  const paperSignals = [
    /\babstract\b/.test(haystack),
    /\bintroduction\b/.test(haystack),
    /\b(?:method|methodology|approach)\b/.test(haystack),
    /\b(?:experiment|evaluation|results)\b/.test(haystack),
    /\b(?:references|bibliography)\b/.test(haystack),
    /\b(?:doi|arxiv|preprint|conference|journal)\b/.test(haystack),
  ].filter(Boolean).length;
  if (paperSignals >= 3) return 'paper';
  if (
    /@template-origin|@signature|@htdf|@htdd|check-expect|\bdocstring\b|\bdoctest\b|representation invariants?/i.test(
      args.text,
    )
  ) {
    return 'template_policy';
  }
  if (args.problemSignalCount >= 6) return 'mixed';
  if (lectureNoteSignalCount(args.sourceTitle, args.text) >= 2) {
    return 'lecture_notes';
  }
  return 'unknown';
}

export function buildSourcePacket(args: SourcePacketBuildArgs): SourcePacket {
  const inferred = inferDocumentType(args);
  const usage = inferUsageProfile(args, inferred.documentType);
  const notebookSections = buildNotebookSections(args, inferred.documentType, usage.usageProfile);
  const concepts = keywordConcepts(args, inferred.documentType);
  const methods = methodCandidates(args.text);
  const refs = [sourceRef(args, inferred.documentType)];

  return {
    version: 1,
    source: {
      title: args.sourceTitle,
      kind: args.sourceKind,
      fileMime: args.sourceFileMime || null,
      hash: args.sourceHash,
      rawFileHash: args.rawFileHash || null,
      openaiFileId: args.openaiFileId || null,
      parser: args.parser || 'text',
      pageCount: args.pageCount ?? null,
      slideCount: args.slideCount ?? null,
    },
    classification: {
      documentType: inferred.documentType,
      usageProfile: usage.usageProfile,
      usageProfileConfidence: usage.confidence,
      usageProfileReasons: usage.reasons,
      topic: args.topic,
      allQuestionUpload: args.allQuestionUpload,
      problemExtractionEligible: args.problemExtractionEligible,
      confidence: inferred.confidence,
      reasons: inferred.reasons,
    },
    notebookSections,
    graph: {
      concepts,
      methods,
      sourceRefs: refs,
    },
  };
}
