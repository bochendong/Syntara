export type Csc148LocalSection = {
  id: string;
  title: string;
  order: number;
  markdown: string;
  summary?: string;
  sourceMeta?: Record<string, unknown>;
};

export type Csc148LocalNotebook = {
  id: string;
  order: string;
  topicKey: string;
  name: string;
  description: string;
  tags: string[];
  coverImagePath: string | null;
  imagePaths: string[];
  sourceUrls: string[];
  sections: Csc148LocalSection[];
};

export type Csc148LocalCourse = {
  id: string;
  code: string;
  name: string;
  language: string;
  source: string;
  snapshotVersion: string;
  notebookCount: number;
  sectionCount: number;
  assetCount: number;
};

export type Csc148LocalProblemType = 'choice' | 'code_tracing' | 'short_answer' | 'code';

export type Csc148LocalProblem = {
  id: string;
  sourceId: string | null;
  order: number;
  title: string;
  category: string | null;
  sectionTitle: string | null;
  notebookId: string | null;
  notebookTitle: string | null;
  type: Csc148LocalProblemType;
  rawQuestionType: string | null;
  difficulty: string;
  language: string;
  questionNumber: string | null;
  summary: string | null;
  tags: string[];
  question: string;
  description: string | null;
  options: string[];
  correctAnswer: string | null;
  explanation: string | null;
  answer: string | null;
  proof: string | null;
  functionName: string | null;
  templateCode: string | null;
  testCode: string | null;
  publicTestCode: string | null;
  secretTestCode: string | null;
  solutionCode: string | null;
  codeAnswer: string | null;
  publicTests: unknown;
  secretTests: unknown;
  blanks: unknown;
  sourceMeta: Record<string, unknown>;
};

export type Csc148ProblemBankStats = {
  total: number;
  byType: Record<string, number>;
  byDifficulty: Record<string, number>;
  byNotebook: Record<string, number>;
  byCategory: Record<string, number>;
  sourceStats: Record<string, unknown> | null;
  missingUploadedAssets: string[];
};

export type Csc148LocalProblemBank = {
  course: string;
  normalizedCourseCode: string;
  sourceApi: string;
  sourceFile: string;
  stats: Csc148ProblemBankStats;
  problems: Csc148LocalProblem[];
};

export type Csc148LocalDataset = {
  course: Csc148LocalCourse;
  notebooks: Csc148LocalNotebook[];
  problemBank: Csc148LocalProblemBank;
  sections: Array<Csc148LocalSection & { notebook: Csc148LocalNotebook }>;
};

export type Csc148LocalSearchHit =
  | {
      kind: 'section';
      id: string;
      score: number;
      notebook: Csc148LocalNotebook;
      section: Csc148LocalSection;
    }
  | {
      kind: 'problem';
      id: string;
      score: number;
      problem: Csc148LocalProblem;
    };

export type Csc148LocalAgentDataFlowStep = {
  id: string;
  label: string;
  input: string;
  output: string;
  detail: string;
};

export type Csc148LocalAgentPromptPart = {
  role: 'system' | 'developer' | 'user';
  title: string;
  content: string;
};

export type Csc148LocalAgentRun = {
  userMessage: string;
  prompt: string;
  promptParts: Csc148LocalAgentPromptPart[];
  dataFlow: Csc148LocalAgentDataFlowStep[];
  hits: Csc148LocalSearchHit[];
  selectedSections: Extract<Csc148LocalSearchHit, { kind: 'section' }>[];
  selectedProblems: Extract<Csc148LocalSearchHit, { kind: 'problem' }>[];
  assistantReply: string;
};
