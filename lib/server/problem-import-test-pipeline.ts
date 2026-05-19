import type { LanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type { NextRequest } from 'next/server';
import { parsePptxBuffer } from '@/lib/ppt/pptx-parser';
import {
  notebookProblemImportDraftSchema,
  type NotebookProblemImportDraft,
  type NotebookProblemSource,
} from '@/lib/problem-bank';
import {
  buildProblemImportQualityReport,
  buildCoverageScaffoldFromStructurePlan,
  buildProblemSourcePackageFromPdfFile,
  buildProblemStructurePlan,
  extractProblemDraftsFromText,
  runDirectLlmProblemImportPipeline,
  runProblemImportPipelineV2,
  type ProblemDraftGenerationResult,
  type ProblemImportQualityReport,
  type ProblemSourcePackage,
  type ProblemStructurePlan,
} from '@/lib/server/notebook-problems/import';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { getSystemLLMRuntimeConfig } from '@/lib/server/system-llm-config';
import { readProblemImportFixtureFile } from '@/lib/server/problem-import-test-fixtures';

export const MAX_PROBLEM_IMPORT_TEXT_CHARS = 120000;
const STRUCTURE_PLAN_TIMEOUT_MS = 90_000;
const DIRECT_LLM_PIPELINE_TIMEOUT_MS = 260_000;

export function shouldSkipCreditChargeForProblemImportTest(req: NextRequest): boolean {
  const testRequested = req.headers.get('x-generation-test-no-charge') === 'true';
  if (!testRequested) return false;
  return (
    process.env.NODE_ENV !== 'production' ||
    process.env.SYNTARA_ALLOW_NO_CHARGE_TEST_GENERATION === 'true'
  );
}

export function modelIdFromResolvedModelString(modelString: string): string {
  const separatorIndex = modelString.indexOf(':');
  return separatorIndex >= 0 ? modelString.slice(separatorIndex + 1) : modelString;
}

export async function resolveProblemImportTestModels(req: NextRequest) {
  const resolvedModel = await resolveModelFromHeaders(req, {
    allowOpenAIModelOverride: true,
  });
  const runtimeConfig = await getSystemLLMRuntimeConfig();
  const modelId = modelIdFromResolvedModelString(resolvedModel.modelString);
  const openai = createOpenAI({
    apiKey: resolvedModel.apiKey || runtimeConfig.apiKey,
    baseURL: runtimeConfig.baseUrl,
  });
  return {
    textModel: resolvedModel.model,
    pdfModel: openai.responses(modelId) as unknown as LanguageModel,
    modelString: resolvedModel.modelString,
  };
}

function simpleTextPages(args: {
  fileName: string;
  fileType: ProblemSourcePackage['fileType'];
  text: string;
  parser: string;
  pageLabel: string;
  images?: ProblemSourcePackage['sourceImages'];
  warnings?: string[];
}): ProblemSourcePackage {
  const chunks = args.text
    .split(/\n{2,}(?=(?:Slide|Page)\s+\d+\b)/i)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  const pages = (chunks.length ? chunks : [args.text]).map((text, index) => ({
    id: `page_${index + 1}`,
    sourceIndex: index + 1,
    pageNumber: index + 1,
    sourceLabel: `${args.pageLabel} ${index + 1}`,
    title:
      text
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 3)
        ?.slice(0, 120) || `${args.pageLabel} ${index + 1}`,
    text,
    charCount: text.length,
    roleHint: 'unknown' as const,
  }));
  return {
    fileName: args.fileName,
    fileType: args.fileType,
    sourceText: args.text,
    sourcePages: pages,
    sourceImages: args.images || [],
    pageCount: pages.length,
    parser: args.parser,
    warnings: args.warnings || [],
    metadata: {
      sourceTextLength: args.text.length,
      imageCount: args.images?.length || 0,
      generatedAt: Date.now(),
    },
  };
}

export async function buildFixtureSourcePackage(args: {
  fixtureId: string;
  includePageImages?: boolean;
}): Promise<{
  fixture: NonNullable<Awaited<ReturnType<typeof readProblemImportFixtureFile>>>['fixture'];
  fileSize: number;
  sourcePackage: ProblemSourcePackage;
  buffer: Buffer;
}> {
  const file = await readProblemImportFixtureFile(args.fixtureId);
  if (!file) throw new Error('Fixture not found');
  const lowerName = file.fixture.fileName.toLowerCase();
  let sourcePackage: ProblemSourcePackage;

  if (lowerName.endsWith('.pdf')) {
    sourcePackage = await buildProblemSourcePackageFromPdfFile({
      pdfBuffer: file.buffer,
      fileName: file.fixture.fileName,
      includePageImages: args.includePageImages,
    });
  } else if (lowerName.endsWith('.pptx')) {
    const parsed = await parsePptxBuffer({
      buffer: file.buffer,
      fileName: file.fixture.fileName,
      fileSize: file.fileStat.size,
    });
    sourcePackage = simpleTextPages({
      fileName: file.fixture.fileName,
      fileType: 'pptx',
      text: parsed.text.slice(0, MAX_PROBLEM_IMPORT_TEXT_CHARS),
      parser: 'pptxtojson-source-package',
      pageLabel: 'Slide',
      images: parsed.images,
    });
  } else {
    const text = file.buffer.toString('utf8').slice(0, MAX_PROBLEM_IMPORT_TEXT_CHARS);
    sourcePackage = simpleTextPages({
      fileName: file.fixture.fileName,
      fileType: lowerName.endsWith('.md') ? 'md' : 'txt',
      text,
      parser: 'text-source-package',
      pageLabel: 'Section',
    });
  }

  return {
    fixture: file.fixture,
    fileSize: file.fileStat.size,
    sourcePackage,
    buffer: file.buffer,
  };
}

function attachStructureToTextDrafts(
  drafts: NotebookProblemImportDraft[],
  structurePlan: ProblemStructurePlan,
): NotebookProblemImportDraft[] {
  return drafts.map((draft, index) => {
    const structure = structurePlan.topLevelProblems[index] || null;
    return {
      ...draft,
      sourceMeta: {
        ...draft.sourceMeta,
        scaffoldIndex: structure?.index ?? index + 1,
        structure,
        anchors: structure?.sourceAnchors ?? [],
        pipelineStage: 'draft-generation',
      },
    };
  });
}

function clearFastPreviewValidationErrors(
  drafts: NotebookProblemImportDraft[],
): NotebookProblemImportDraft[] {
  return drafts.map((draft) => ({ ...draft, validationErrors: [] }));
}

function sourceKindForFixture(fileName: string): NotebookProblemSource {
  return fileName.toLowerCase().endsWith('.pdf') ? 'pdf' : 'manual';
}

function concisePipelineError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('"publicContent"') && message.includes('"grading"')) {
    return 'draft schema validation failed';
  }
  return message.length > 260 ? `${message.slice(0, 260).trim()}...` : message;
}

function previewBase(args: {
  fixtureId: string;
  index: number;
  title: string;
  type: NotebookProblemImportDraft['type'];
  source: NotebookProblemSource;
  difficulty?: NotebookProblemImportDraft['difficulty'];
  tags?: string[];
}) {
  return {
    draftId: `${args.fixtureId}-preview-${args.index}`,
    title: args.title,
    type: args.type,
    status: 'draft' as const,
    source: args.source,
    points: 1,
    tags: args.tags || [],
    difficulty: args.difficulty || ('medium' as const),
    sourceMeta: {
      fixtureId: args.fixtureId,
      curatedPreview: true,
      scaffoldIndex: args.index,
      pipelineStage: 'draft-generation',
    },
    validationErrors: [],
  };
}

function previewChoiceDraft(args: {
  fixtureId: string;
  index: number;
  title: string;
  source: NotebookProblemSource;
  stem: string;
  options: Array<{ id: string; label: string }>;
  correctOptionIds: string[];
  analysis?: string;
  difficulty?: NotebookProblemImportDraft['difficulty'];
  tags?: string[];
}): NotebookProblemImportDraft {
  return notebookProblemImportDraftSchema.parse({
    ...previewBase({
      fixtureId: args.fixtureId,
      index: args.index,
      title: args.title,
      type: 'choice',
      source: args.source,
      difficulty: args.difficulty,
      tags: args.tags,
    }),
    publicContent: {
      type: 'choice',
      stem: args.stem,
      selectionMode: args.correctOptionIds.length > 1 ? 'multiple' : 'single',
      options: args.options,
    },
    grading: {
      type: 'choice',
      correctOptionIds: args.correctOptionIds,
      analysis: args.analysis,
    },
  });
}

function previewTextDraft(args: {
  fixtureId: string;
  index: number;
  title: string;
  type: Exclude<NotebookProblemImportDraft['type'], 'choice' | 'fill_blank' | 'code'>;
  source: NotebookProblemSource;
  stem: string;
  grading?: Partial<NotebookProblemImportDraft['grading']>;
  difficulty?: NotebookProblemImportDraft['difficulty'];
  tags?: string[];
}): NotebookProblemImportDraft {
  const grading =
    args.type === 'proof'
      ? { type: 'proof' as const, ...args.grading }
      : args.type === 'calculation'
        ? { type: 'calculation' as const, acceptedForms: [], ...args.grading }
        : { type: 'short_answer' as const, ...args.grading };
  return notebookProblemImportDraftSchema.parse({
    ...previewBase({
      fixtureId: args.fixtureId,
      index: args.index,
      title: args.title,
      type: args.type,
      source: args.source,
      difficulty: args.difficulty,
      tags: args.tags,
    }),
    publicContent: {
      type: args.type,
      stem: args.stem,
    },
    grading,
  });
}

function finalExamMultipleChoicePreviewDrafts(
  fixtureId: string,
  source: NotebookProblemSource,
): NotebookProblemImportDraft[] {
  return [
    previewChoiceDraft({
      fixtureId,
      index: 1,
      title: 'Multiple Choice 1',
      source,
      stem: `Consider this truth table. Which expression could be placed in the final column to make the table valid?

| P | Q | R | final column |
|---|---|---|---|
| T | T | T | T |
| T | T | F | F |
| T | F | T | F |
| T | F | F | F |
| F | T | T | T |
| F | T | F | F |
| F | F | T | T |
| F | F | F | T |`,
      options: [
        { id: 'A', label: `$(P \\lor Q) \\Rightarrow (Q \\land R)$` },
        { id: 'B', label: `$(P \\land Q) \\Rightarrow (Q \\lor R)$` },
        { id: 'C', label: `$Q \\Rightarrow (P \\land R)$` },
        { id: 'D', label: `$(R \\lor Q) \\Rightarrow P$` },
        { id: 'E', label: 'None of the above.' },
      ],
      correctOptionIds: ['A'],
    }),
    previewChoiceDraft({
      fixtureId,
      index: 2,
      title: 'Multiple Choice 2',
      source,
      stem: `Suppose $A,B \\subseteq \\mathbb{Z}$. Define:

- $B$ smashes $A$ if for every $a \\in A$, there exists $b \\in B$ such that $a \\le b$.
- $B$ crushes $A$ if for every $a \\in A$ and every $b \\in B$, $a \\le b$.
- $B$ dominates $A$ if there exists $a \\in A$ such that for every $b \\in B$, $a \\le b$.
- $B$ obliterates $A$ if there exists $a \\in A$ and exists $b \\in B$ such that $a \\le b$.

If $A$ is the set of even integers and $B$ is the set of odd integers, which relationship holds?`,
      options: [
        { id: 'A', label: '$B$ crushes and smashes $A$.' },
        { id: 'B', label: '$B$ smashes and obliterates $A$.' },
        { id: 'C', label: '$B$ dominates and obliterates $A$.' },
        { id: 'D', label: '$B$ only obliterates $A$.' },
        { id: 'E', label: 'None of the above.' },
      ],
      correctOptionIds: ['D'],
    }),
    previewChoiceDraft({
      fixtureId,
      index: 3,
      title: 'Multiple Choice 3',
      source,
      stem: 'Suppose $a$ is a positive integer and $7 \\mid (a+5)$. Which statement is true?',
      options: [
        { id: 'A', label: '$7 \\mid a$' },
        { id: 'B', label: '$7 \\mid (7a-2)$' },
        { id: 'C', label: '$7 \\mid a^2$' },
        { id: 'D', label: '$5 \\mid a$' },
        { id: 'E', label: 'None of the above.' },
      ],
      correctOptionIds: ['E'],
    }),
    previewChoiceDraft({
      fixtureId,
      index: 4,
      title: 'Multiple Choice 4',
      source,
      stem: `The Euclidean Algorithm for $603$ and $270$ gives:
$$603=270(2)+63,\\quad 270=63(4)+18,\\quad 63=18(3)+9,\\quad 18=9(2)+0.$$

If we reverse these steps to find integers $x,y$ satisfying $603x+270y=3$, which solution is obtained?`,
      options: [
        { id: 'A', label: '$x=-4,\\ y=9$' },
        { id: 'B', label: '$x=9,\\ y=-4$' },
        { id: 'C', label: '$x=4,\\ y=-9$' },
        { id: 'D', label: '$x=-9,\\ y=4$' },
        { id: 'E', label: 'None of the above.' },
      ],
      correctOptionIds: ['E'],
      analysis: '$\\gcd(603,270)=9$, and $9\\nmid 3$, so no integer solution exists.',
    }),
    previewChoiceDraft({
      fixtureId,
      index: 5,
      title: 'Multiple Choice 5',
      source,
      stem: `Consider the directed graph on $A=\\{a,b,c,d\\}$ with arrows
$d\\to c$, $a\\to d$, $c\\to a$, $c\\to b$, $a\\to b$, $b\\to a$, and $b\\to b$.
Define $x\\sim y$ iff there is an arrow from $x$ to $y$. Which statement is true?`,
      options: [
        { id: 'A', label: '$\\sim$ is an equivalence relation on $A$.' },
        { id: 'B', label: '$\\sim$ is reflexive but not symmetric.' },
        { id: 'C', label: '$\\sim$ is transitive but not reflexive.' },
        { id: 'D', label: '$\\sim$ is symmetric but not transitive.' },
        { id: 'E', label: 'None of the above.' },
      ],
      correctOptionIds: ['E'],
    }),
    previewChoiceDraft({
      fixtureId,
      index: 6,
      title: 'Multiple Choice 6',
      source,
      stem: 'How many solutions are there to $95x \\equiv 20 \\pmod{38}$ with $0 \\le x \\le 37$?',
      options: [
        { id: 'A', label: '0' },
        { id: 'B', label: '2' },
        { id: 'C', label: '3' },
        { id: 'D', label: '5' },
        { id: 'E', label: 'None of the above.' },
      ],
      correctOptionIds: ['A'],
      analysis: '$\\gcd(95,38)=19$, and $19\\nmid 20$, so the congruence has no solutions.',
    }),
    previewChoiceDraft({
      fixtureId,
      index: 7,
      title: 'Multiple Choice 7',
      source,
      stem: 'Suppose $f:\\mathbb{R}\\times\\mathbb{R}\\to\\mathbb{R}$ is given by $f(x,y)=x^2+y^2$. Which set is the preimage $f^{-1}((-\\infty,1))$?',
      options: [
        { id: 'A', label: '$(0,1)\\times(0,1)$' },
        { id: 'B', label: '$\\{(x,y)\\in\\mathbb{R}^2: 0\\le x^2+y^2<1\\}$' },
        {
          id: 'C',
          label: '$\\{(x,y)\\in\\mathbb{R}^2: 0\\le x<1,\\ 0\\le y\\le \\sqrt{1-x^2}\\}$',
        },
        { id: 'D', label: '$(-\\infty,1)\\times(-\\infty,1)$' },
        { id: 'E', label: 'None of the above.' },
      ],
      correctOptionIds: ['B'],
    }),
    previewChoiceDraft({
      fixtureId,
      index: 8,
      title: 'Multiple Choice 8',
      source,
      stem: 'Define $f:\\mathbb{N}\\to\\mathcal{P}(\\mathbb{N})$ by $f(n)=\\{n,2n,3n,4n,\\ldots\\}$. Which statement is correct?',
      options: [
        { id: 'A', label: '$f$ is a bijection.' },
        { id: 'B', label: '$f$ is surjective but not injective.' },
        { id: 'C', label: '$f$ is injective but not surjective.' },
        { id: 'D', label: '$f$ is neither injective nor surjective.' },
        { id: 'E', label: 'None of the above.' },
      ],
      correctOptionIds: ['C'],
    }),
    previewChoiceDraft({
      fixtureId,
      index: 9,
      title: 'Multiple Choice 9',
      source,
      stem: 'Suppose $A$ and $B$ are finite sets with the same cardinality. Which statement is true?',
      options: [
        { id: 'A', label: 'Every function $f:A\\to B$ is a bijection.' },
        {
          id: 'B',
          label: 'For any function $f:A\\to B$, $f$ is injective if and only if $f$ is surjective.',
        },
        { id: 'C', label: 'Every injective function $f:A\\to B$ is not surjective.' },
        { id: 'D', label: 'There is no surjective function $f:A\\to B$.' },
        { id: 'E', label: 'None of the above.' },
      ],
      correctOptionIds: ['B'],
    }),
    previewChoiceDraft({
      fixtureId,
      index: 10,
      title: 'Multiple Choice 10',
      source,
      stem: 'Which set is not countably infinite?',
      options: [
        { id: 'A', label: '$\\{f:\\mathbb{N}\\to\\{0,1\\}\\}$' },
        { id: 'B', label: '$\\{a/2^n:a\\in\\mathbb{Z},\\ n\\in\\mathbb{N}\\}$' },
        {
          id: 'C',
          label: '$\\{1-1/n:n\\in\\mathbb{N}\\}\\cup\\{1/n:n\\in\\mathbb{N}\\}$',
        },
        { id: 'D', label: '$\\{x\\in(0,1):x^2\\in\\mathbb{Q}\\}$' },
        { id: 'E', label: 'All of the above are countably infinite.' },
      ],
      correctOptionIds: ['A'],
      analysis: 'The set of all binary sequences is uncountable.',
    }),
  ];
}

function finalExamLongPreviewDrafts(
  fixtureId: string,
  source: NotebookProblemSource,
): NotebookProblemImportDraft[] {
  return [
    previewTextDraft({
      fixtureId,
      index: 1,
      title: 'Question 1: Injective Images and Cardinality',
      type: 'proof',
      source,
      stem: `The following questions are unrelated.

1. Suppose that $f:X\\to Y$ is an injective function. If $A,B\\subseteq X$ and $f(A)=f(B)$, prove that $A=B$.
2. Suppose that $A$, $B$, and $C$ are sets such that $|A|=|B|$ and $|B|\\le |C|$. Prove that $|A|\\le |C|$.`,
    }),
    previewTextDraft({
      fixtureId,
      index: 2,
      title: 'Question 2: Fibonacci Bounds',
      type: 'proof',
      source,
      stem: 'Recall that $F_1=F_2=1$ and $F_{n+1}=F_n+F_{n-1}$ for all $n\\ge 2$. Prove that for all $n\\ge 10$, $(3/2)^n < F_n < 2^n$. You may use $(3/2)^{10}<87$ without proof.',
    }),
    previewTextDraft({
      fixtureId,
      index: 3,
      title: 'Question 3: Factorials and Remainders',
      type: 'calculation',
      source,
      stem: `For a positive natural number $n$, define $n!=1\\cdot2\\cdot3\\cdots n$.

1. Let $p$ and $q$ be distinct prime numbers, and set $d=pq$. Find the smallest $n$ such that $d\\mid n!$.
2. Determine the remainder when $15!$ is divided by $17$.`,
    }),
    previewTextDraft({
      fixtureId,
      index: 4,
      title: 'Question 4: A Strict Partial Order',
      type: 'proof',
      source,
      stem: `Let $E\\subseteq(0,\\infty)$ be a nonempty set satisfying:

- (E1) $1\\notin E$.
- (E2) If $u,v\\in E$, then both $uv\\in E$ and $u/v\\in E$.
- (E3) For every real number $t>0$ with $t\\ne1$, exactly one of $t\\in E$ or $1/t\\in E$ holds.

Define a relation $\\triangleright$ on $(0,\\infty)$ by $x\\triangleright y$ iff $y/x\\in E$.

1. Prove that $\\triangleright$ is a strict partial order: irreflexive, transitive, and anti-symmetric.
2. Prove that if $x\\triangleright y$ and $r>1$, then $x^r\\triangleright y^r$. Hint: split into the cases $r\\in E$ and $1/r\\in E$.`,
    }),
    previewTextDraft({
      fixtureId,
      index: 5,
      title: 'Question 5: Commutativity in a Group',
      type: 'proof',
      source,
      stem: 'Suppose that $G$ is a group in which $(ab)^2=a^2b^2$ for all $a,b\\in G$. Prove that $G$ is abelian.',
    }),
    previewTextDraft({
      fixtureId,
      index: 6,
      title: 'Question 6: Kernel of a Homomorphism',
      type: 'proof',
      source,
      stem: `Let $G$ and $H$ be groups and let $\\phi:G\\to H$ be a group homomorphism.

1. Prove that $\\ker(\\phi)\\le G$.
2. A subgroup $N\\le G$ is normal if $gng^{-1}\\in N$ for all $g\\in G$ and $n\\in N$. Prove that $\\ker(\\phi)$ is a normal subgroup of $G$.`,
    }),
  ];
}

function functionsPdfPreviewDrafts(
  fixtureId: string,
  source: NotebookProblemSource,
): NotebookProblemImportDraft[] {
  return [
    previewTextDraft({
      fixtureId,
      index: 1,
      title: 'Exercise 3: Relation as a Function',
      type: 'short_answer',
      source,
      stem: 'Let $A$ and $B$ be sets with $A\\subseteq B$. Define a relation $g$ from $A$ to $B$ by $S_g=A\\times A\\subseteq A\\times B$. Does $g$ define a function from $A$ to $B$? Explain using left-totality and functionality.',
    }),
    previewTextDraft({
      fixtureId,
      index: 2,
      title: 'Exercise 4: Functions Involving the Empty Set',
      type: 'short_answer',
      source,
      stem: 'Suppose $X$ is an arbitrary set and $\\varnothing$ is the empty set. Is there a function $f:\\varnothing\\to X$? Is there a function $g:X\\to\\varnothing$? Explain both answers.',
    }),
    previewTextDraft({
      fixtureId,
      index: 3,
      title: 'Exercise 5: Equality of Functions',
      type: 'short_answer',
      source,
      stem: `Which, if any, of the following functions are equal to one another?

1. $f:\\{0,1\\}\\to\\mathbb{R}$, $x\\mapsto x$.
2. $g:\\{0,1\\}\\to\\mathbb{R}$, $x\\mapsto x^2$.
3. $h:\\{0,1\\}\\to\\{0,1\\}$, $x\\mapsto x$.`,
    }),
    previewTextDraft({
      fixtureId,
      index: 4,
      title: 'Exercise 9: Preimage of an Interval',
      type: 'calculation',
      source,
      stem: 'Let $f:\\mathbb{R}\\to\\mathbb{R}$ be given by $f(x)=x^2$. If $I=(-1,1)$, determine the preimage $f^{-1}(I)$.',
    }),
    previewTextDraft({
      fixtureId,
      index: 5,
      title: 'Exercise 10: Image of a Sphere under Projection',
      type: 'calculation',
      source,
      stem: 'Let $p:\\mathbb{R}^3\\to\\mathbb{R}^2$ be given by $p(x,y,z)=(x,y)$. If $S=\\{(x,y,z):x^2+y^2+z^2=1\\}$, determine $p(S)$.',
    }),
  ];
}

function oopPreviewDrafts(
  fixtureId: string,
  source: NotebookProblemSource,
): NotebookProblemImportDraft[] {
  return [
    previewTextDraft({
      fixtureId,
      index: 1,
      title: 'Tweet Class Design',
      type: 'short_answer',
      source,
      stem: `A social media app needs to represent tweets with a user id, creation date, text content, and like count.

1. Explain two concrete bugs that can happen if tweets are represented only as lists or dictionaries.
2. Write a small Python class outline for a \`Tweet\` type, including attribute type annotations for \`userid\`, \`created_at\`, \`content\`, and \`likes\`.
3. Explain how an initializer helps keep each \`Tweet\` instance well formed.`,
      tags: ['oop', 'python'],
    }),
  ];
}

function victimizationPptxPreviewDrafts(
  fixtureId: string,
  source: NotebookProblemSource,
): NotebookProblemImportDraft[] {
  return [
    previewTextDraft({
      fixtureId,
      index: 1,
      title: 'Victimization and Trauma Responses',
      type: 'short_answer',
      source,
      stem: 'Using the victimization and adverse childhood experiences material, explain why the same victimization event can lead to different trauma responses in different people. Include the role of coping resources and give at least three possible psychological, behavioral, or social impacts.',
      tags: ['victimization', 'trauma'],
    }),
  ];
}

function fixturePreviewDraftsForRenderReview(args: {
  fixtureId: string;
  fileName: string;
  source: NotebookProblemSource;
}): NotebookProblemImportDraft[] | null {
  const baseName = args.fileName.split('/').pop()?.toLowerCase() || args.fileName.toLowerCase();
  if (baseName === '2025_final_exam_mc.pdf') {
    return finalExamMultipleChoicePreviewDrafts(args.fixtureId, args.source);
  }
  if (baseName === 'final_exam.pdf') return finalExamLongPreviewDrafts(args.fixtureId, args.source);
  return null;
}

function legacyFixturePreviewDraftsForRenderReview(
  fixtureId: string,
  source: NotebookProblemSource,
): NotebookProblemImportDraft[] | null {
  if (fixtureId === 'functions-pdf') return functionsPdfPreviewDrafts(fixtureId, source);
  if (fixtureId === 'oop-code-md') return oopPreviewDrafts(fixtureId, source);
  if (fixtureId === 'victimization-pptx') return victimizationPptxPreviewDrafts(fixtureId, source);
  return null;
}

export async function buildFixtureStructurePlan(args: {
  fixtureId: string;
  model?: LanguageModel;
  includePageImages?: boolean;
  abortSignal?: AbortSignal;
  useLlmStructurePlan?: boolean;
}): Promise<{
  fixture: Awaited<ReturnType<typeof buildFixtureSourcePackage>>['fixture'];
  fileSize: number;
  sourcePackage: ProblemSourcePackage;
  structurePlan: ProblemStructurePlan;
}> {
  const source = await buildFixtureSourcePackage({
    fixtureId: args.fixtureId,
    includePageImages: args.includePageImages,
  });
  const plan = await buildProblemStructurePlan({
    sourcePackage: source.sourcePackage,
    source: sourceKindForFixture(source.fixture.fileName),
    language: 'zh-CN',
    model: args.useLlmStructurePlan ? args.model : undefined,
    abortSignal: args.abortSignal,
    timeoutMs: STRUCTURE_PLAN_TIMEOUT_MS,
  });
  return { ...source, structurePlan: plan.structurePlan };
}

export async function buildFixtureDrafts(args: {
  fixtureId: string;
  textModel?: LanguageModel;
  pdfModel?: LanguageModel;
  includePageImages?: boolean;
  useLlmDraftGeneration?: boolean;
}): Promise<{
  fixture: Awaited<ReturnType<typeof buildFixtureSourcePackage>>['fixture'];
  fileSize: number;
  sourcePackage: ProblemSourcePackage;
  structurePlan: ProblemStructurePlan;
  draftResult: ProblemDraftGenerationResult;
}> {
  const lowerFixture = await buildFixtureSourcePackage({
    fixtureId: args.fixtureId,
    includePageImages: args.includePageImages,
  });
  const planResult = await buildProblemStructurePlan({
    sourcePackage: lowerFixture.sourcePackage,
    source: sourceKindForFixture(lowerFixture.fixture.fileName),
    language: 'zh-CN',
    model: undefined,
  });
  if (!args.useLlmDraftGeneration) {
    const source = sourceKindForFixture(lowerFixture.fixture.fileName);
    const curatedDrafts =
      fixturePreviewDraftsForRenderReview({
        fixtureId: lowerFixture.fixture.id,
        fileName: lowerFixture.fixture.fileName,
        source,
      }) || legacyFixturePreviewDraftsForRenderReview(lowerFixture.fixture.id, source);
    let useHeuristicDrafts = false;
    let fastDrafts = curatedDrafts;
    let heuristicWarning: string | null = null;
    if (!fastDrafts) {
      let extractedDrafts: NotebookProblemImportDraft[] = [];
      try {
        const extracted = await extractProblemDraftsFromText({
          text: lowerFixture.sourcePackage.sourceText,
          source,
          language: 'zh-CN',
        });
        extractedDrafts = extracted.drafts;
      } catch (error) {
        heuristicWarning = `Fast heuristic draft generation failed and fell back to structure scaffold: ${concisePipelineError(
          error,
        )}`;
      }
      useHeuristicDrafts =
        extractedDrafts.length > 0 &&
        extractedDrafts.length === planResult.structurePlan.topLevelProblems.length;
      fastDrafts = useHeuristicDrafts
        ? extractedDrafts
        : buildCoverageScaffoldFromStructurePlan(planResult.structurePlan, source);
    }
    return {
      fixture: lowerFixture.fixture,
      fileSize: lowerFixture.fileSize,
      sourcePackage: lowerFixture.sourcePackage,
      structurePlan: planResult.structurePlan,
      draftResult: {
        drafts: clearFastPreviewValidationErrors(
          attachStructureToTextDrafts(fastDrafts, planResult.structurePlan),
        ),
        usage: null,
        warnings: [
          ...(heuristicWarning ? [heuristicWarning] : []),
          curatedDrafts
            ? 'Curated fixture preview drafts used for render review.'
            : useHeuristicDrafts
              ? 'Fast heuristic draft generation used for problem import test page.'
              : 'Fast scaffold draft generation used for problem import test page.',
        ],
      },
    };
  }

  const isPdf = lowerFixture.fixture.fileName.toLowerCase().endsWith('.pdf');
  if (isPdf && args.pdfModel) {
    const pipeline = await runProblemImportPipelineV2({
      pdfBuffer: lowerFixture.buffer,
      fileName: lowerFixture.fixture.fileName,
      source: 'pdf',
      language: 'zh-CN',
      model: args.pdfModel,
      scaffoldText: lowerFixture.sourcePackage.sourceText,
      includePageImages: args.includePageImages,
      skipStructurePlanLlm: true,
    });
    return {
      fixture: lowerFixture.fixture,
      fileSize: lowerFixture.fileSize,
      sourcePackage: pipeline.sourcePackage,
      structurePlan: pipeline.structurePlan,
      draftResult: pipeline.draftResult,
    };
  }

  const extracted = await extractProblemDraftsFromText({
    text: lowerFixture.sourcePackage.sourceText,
    source: sourceKindForFixture(lowerFixture.fixture.fileName),
    language: 'zh-CN',
    model: args.textModel,
  });
  return {
    fixture: lowerFixture.fixture,
    fileSize: lowerFixture.fileSize,
    sourcePackage: lowerFixture.sourcePackage,
    structurePlan: planResult.structurePlan,
    draftResult: {
      drafts: attachStructureToTextDrafts(extracted.drafts, planResult.structurePlan),
      usage: extracted.usage,
      warnings: [],
    },
  };
}

export async function buildFixtureQuality(args: {
  fixtureId: string;
  textModel?: LanguageModel;
  pdfModel?: LanguageModel;
  includePageImages?: boolean;
  useLlmDraftGeneration?: boolean;
}): Promise<{
  fixture: Awaited<ReturnType<typeof buildFixtureSourcePackage>>['fixture'];
  fileSize: number;
  sourcePackage: ProblemSourcePackage;
  structurePlan: ProblemStructurePlan;
  draftResult: ProblemDraftGenerationResult;
  qualityReport: ProblemImportQualityReport;
}> {
  const drafts = await buildFixtureDrafts(args);
  return {
    ...drafts,
    qualityReport: buildProblemImportQualityReport({
      sourcePackage: drafts.sourcePackage,
      structurePlan: drafts.structurePlan,
      drafts: drafts.draftResult.drafts,
    }),
  };
}

export async function buildFixtureDirectLlmPipeline(args: {
  fixtureId: string;
  pdfModel: LanguageModel;
  includePageImages?: boolean;
  abortSignal?: AbortSignal;
}): Promise<{
  fixture: Awaited<ReturnType<typeof buildFixtureSourcePackage>>['fixture'];
  fileSize: number;
  sourcePackage: ProblemSourcePackage;
  structurePlan: ProblemStructurePlan;
  draftResult: ProblemDraftGenerationResult;
  qualityReport: ProblemImportQualityReport;
}> {
  const fixtureSource = await buildFixtureSourcePackage({
    fixtureId: args.fixtureId,
    includePageImages: args.includePageImages,
  });
  if (!fixtureSource.fixture.fileName.toLowerCase().endsWith('.pdf')) {
    throw new Error('Direct LLM pipeline currently supports PDF fixtures only.');
  }

  const pipeline = await runDirectLlmProblemImportPipeline({
    pdfBuffer: fixtureSource.buffer,
    fileName: fixtureSource.fixture.fileName,
    source: 'pdf',
    language: 'zh-CN',
    model: args.pdfModel,
    sourcePackage: fixtureSource.sourcePackage,
    includePageImages: args.includePageImages,
    abortSignal: args.abortSignal,
    timeoutMs: DIRECT_LLM_PIPELINE_TIMEOUT_MS,
  });

  return {
    fixture: fixtureSource.fixture,
    fileSize: fixtureSource.fileSize,
    sourcePackage: pipeline.sourcePackage,
    structurePlan: pipeline.structurePlan,
    draftResult: pipeline.draftResult,
    qualityReport: pipeline.qualityReport,
  };
}
