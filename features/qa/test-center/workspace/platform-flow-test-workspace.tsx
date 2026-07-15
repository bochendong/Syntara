'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Coins,
  FilePlus2,
  FileText,
  Image as ImageIcon,
  ListChecks,
  Loader2,
  MessageSquareText,
  Play,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { askCourseOrchestrator } from '@/lib/chat/ask-course-orchestrator';
import { scoreCourseChatText, tokenizeCourseChatQuery } from '@/lib/chat/course-chat-context';
import { COURSE_ORCHESTRATOR_ID, COURSE_ORCHESTRATOR_NAME } from '@/lib/constants/course-chat';
import type {
  ImageGenerationCostEstimate,
  ImageGenerationResult,
  StudyCoverOverlaySpec,
} from '@/lib/media/types';
import {
  answererHandoffFromLearnTurn,
  type LearnTurnClientResponse,
} from '@/features/learn-core/client-adapters';
import { learnActionToClientAction } from '@/features/learn-core/client-actions';
import {
  applyLearningCalendarDelete,
  applyLearningCalendarUpdate,
  learningActionCalendarEvents,
  mergeSyllabusEvents,
  readSyllabusEvents,
  writeSyllabusEvents,
  type SyllabusCalendarEvent,
} from '@/features/learn-core/client-calendar-actions';
import {
  buildMiniLectureDeck,
  buildMiniLecturePrompt,
} from '@/features/learn-core/client-mini-lecture';
import type { CourseChatContext, LearningAction } from '@/lib/types/chat';
import { useAuthStore } from '@/lib/store/auth';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { useSettingsStore } from '@/lib/store/settings';
import { backendFetch, backendJson } from '@/lib/utils/backend-api';
import { syncRemoteLearnConversation } from '@/lib/utils/learn-conversation-api';
import { getCourse } from '@/lib/utils/course-storage';
import {
  listCourseProblemsByIds,
  listCourseProblemSummaries,
  type NotebookProblemClientRecord,
} from '@/lib/utils/notebook-problem-api';
import {
  createTestResultKey,
  deleteSharedQuestionSourceResult,
  deleteTestResult,
  listAllLocalQuestionSourceResultsForMigration,
  listLocalTestFiles,
  listSharedQuestionSourceResults,
  listTestResults,
  loadLocalTestFile,
  saveLocalTestFile,
  saveSharedQuestionSourceResult,
  saveTestResult,
  type LocalTestFileRow,
  type TestResultRow,
} from '@/lib/utils/test-results';
import { usePersistHydrated } from '@/lib/hooks/use-persist-hydrated';
import { cn } from '@/lib/utils';
import type { PlatformTestScenario } from '@/features/qa/test-center/registry';
import { DeleteTestRunDialog } from '../components/delete-test-run-dialog';
import { PlatformFlowResultPreview } from './platform-flow-result-preview';
import type {
  CalendarTestEvent,
  CorePlatformScenarioId,
  NotebookAnswerContract,
  NotebookRouteDecision,
  NotebookStudyGuide,
  PlatformFlowInput,
  PlatformFlowOutput,
  PlatformFlowRunPayload,
  QuestionRetrievalTrace,
  QuestionTestEvaluation,
  QuestionTestItem,
} from './types';

const TOPIC_PRESETS = [
  'Linked List 与 Representation Invariant',
  'Tree / BST recursion',
  'Recursive tracing',
  'OOP 与 class design recipe',
  'Stack、Queue 与 ADT',
];

const MAT136_TOPIC_PRESETS = [
  '无穷级数的收敛判别',
  '积分判别法与比较判别法',
  '幂级数的收敛半径与收敛区间',
  '反常积分的收敛与发散',
  '泰勒级数与余项误差',
];

const MOCK_NOTEBOOK_CONTENT = {
  CSC148: `# Linked List 与 Representation Invariant

- 链表由节点组成；每个节点保存 item 和指向下一个节点的引用。
- 空链表必须被明确表示；非空链表的 first 指向首节点。
- 修改链表时，要分别检查空表、头节点、中间节点和尾节点边界。
- Representation Invariant 描述对象在每个公开操作前后都必须保持的结构条件。
- 删除节点时需要同时维护连接关系、size，以及可能变化的 first / last。`,
  MAT136: `# 无穷级数的收敛判别

- 级数是否收敛由部分和数列是否存在有限极限定义。
- 若通项极限不为 0 或不存在，则级数发散；通项趋于 0 不能推出级数收敛。
- 积分判别法要求对应函数连续、正且递减。
- 比较判别法需要明确不等式方向：证明收敛找收敛上界，证明发散找发散下界。
- 比值判别法适合含阶乘或指数的通项；极限等于 1 时没有结论。`,
} as const;

type QuestionSourceCase =
  | 'empty_no_notes'
  | 'empty_with_notes'
  | 'sufficient_bank'
  | 'partial_no_notes'
  | 'partial_with_notes';

type QuestionSourceSample = {
  id: string;
  courseCode: 'MAT136' | 'CSC148';
  sourceCase: QuestionSourceCase;
  title: string;
  topic: string;
  partialBankSize?: number;
};

const QUESTION_SOURCE_SAMPLES: QuestionSourceSample[] = [
  {
    id: 'csc148-empty-no-notes',
    courseCode: 'CSC148',
    sourceCase: 'empty_no_notes',
    title: '题库为空 · 没有笔记',
    topic: TOPIC_PRESETS[0],
  },
  {
    id: 'csc148-empty-with-notes',
    courseCode: 'CSC148',
    sourceCase: 'empty_with_notes',
    title: '题库为空 · 有 Mock 笔记',
    topic: TOPIC_PRESETS[0],
  },
  {
    id: 'csc148-sufficient-bank',
    courseCode: 'CSC148',
    sourceCase: 'sufficient_bank',
    title: '题库题量充足',
    topic: TOPIC_PRESETS[2],
  },
  {
    id: 'csc148-partial-no-notes',
    courseCode: 'CSC148',
    sourceCase: 'partial_no_notes',
    title: '题库不全 · 没有笔记',
    topic: TOPIC_PRESETS[3],
    partialBankSize: 2,
  },
  {
    id: 'csc148-partial-with-notes',
    courseCode: 'CSC148',
    sourceCase: 'partial_with_notes',
    title: '题库不全 · 有 Mock 笔记',
    topic: TOPIC_PRESETS[0],
    partialBankSize: 2,
  },
  {
    id: 'mat136-empty-no-notes',
    courseCode: 'MAT136',
    sourceCase: 'empty_no_notes',
    title: '题库为空 · 没有笔记',
    topic: MAT136_TOPIC_PRESETS[0],
  },
  {
    id: 'mat136-empty-with-notes',
    courseCode: 'MAT136',
    sourceCase: 'empty_with_notes',
    title: '题库为空 · 有 Mock 笔记',
    topic: MAT136_TOPIC_PRESETS[0],
  },
  {
    id: 'mat136-sufficient-bank',
    courseCode: 'MAT136',
    sourceCase: 'sufficient_bank',
    title: '题库题量充足',
    topic: MAT136_TOPIC_PRESETS[2],
  },
  {
    id: 'mat136-partial-no-notes',
    courseCode: 'MAT136',
    sourceCase: 'partial_no_notes',
    title: '题库不全 · 没有笔记',
    topic: MAT136_TOPIC_PRESETS[3],
    partialBankSize: 2,
  },
  {
    id: 'mat136-partial-with-notes',
    courseCode: 'MAT136',
    sourceCase: 'partial_with_notes',
    title: '题库不全 · 有 Mock 笔记',
    topic: MAT136_TOPIC_PRESETS[0],
    partialBankSize: 2,
  },
];

const CONCEPT_PRESETS = [
  '递归为什么需要基线条件',
  'Linked List 的 Representation Invariant',
  '二分查找的不变量',
  'BST 删除节点的三种情况',
  '继承、覆盖与多态',
];

type ExplanationKind = 'concept' | 'problem';
type ExplanationNoteMode = 'without_notes' | 'with_extracted_notes';

type ExplanationNotebookFixture = {
  id: string;
  title: string;
  fileName: string;
  routeKind: 'course' | 'research' | 'daily';
  sections: Array<{
    key: string;
    title: string;
    summary: string;
    markdown: string;
  }>;
};

type ExplanationTestCase = {
  id: string;
  title: string;
  description: string;
  kind: ExplanationKind;
  noteMode: ExplanationNoteMode;
  topic: string;
  notebook: ExplanationNotebookFixture | null;
};

const CSC148_RECURSION_NOTEBOOK: ExplanationNotebookFixture = {
  id: 'mock-note-csc148-recursion',
  title: 'CSC148 递归设计与跟踪笔记',
  fileName: 'CSC148_Week_04_Recursion.pdf',
  routeKind: 'course',
  sections: [
    {
      key: 'base-case',
      title: '基线条件与终止性',
      summary: '基线条件直接处理最小问题，并阻止新的递归调用。',
      markdown:
        '每一次递归调用都必须让问题朝基线条件靠近。只写基线条件还不够；递归分支的参数必须形成严格更小的问题。',
    },
    {
      key: 'recursive-contract',
      title: '递归契约',
      summary: '在符合 precondition 时，可以假设对更小输入的递归调用已正确完成契约。',
      markdown:
        '设计递归代码时不要在脑中展开全部调用。先明确函数契约，再把对更小实例的调用当成一个能直接使用的正确结果。',
    },
    {
      key: 'trace-check',
      title: '递归跟踪检查',
      summary: '跟踪时分开“向下调用”和“返回求值”两个阶段。',
      markdown:
        '每层写出当前参数、是否命中基线条件、子调用返回值以及本层的最终返回值，可避免把调用顺序与返回顺序混淆。',
    },
  ],
};

const CSC148_DATA_STRUCTURES_NOTEBOOK: ExplanationNotebookFixture = {
  id: 'mock-note-csc148-data-structures',
  title: 'CSC148 Linked List 与 BST 课程笔记',
  fileName: 'CSC148_Week_06_Data_Structures.pdf',
  routeKind: 'course',
  sections: [
    {
      key: 'linked-list-ri',
      title: 'Linked List 的 Representation Invariant',
      summary: '结构条件必须在每个公开操作前后都成立。',
      markdown:
        '空链表的 first 为 None；非空链表的 first 指向首节点。若保存 size，它必须等于从 first 可达的节点数；若保存 last，它必须是唯一 next 为 None 的尾节点。',
    },
    {
      key: 'linked-list-delete',
      title: '删除节点的四个边界',
      summary: '分别检查空表、头节点、中间节点和尾节点。',
      markdown:
        '删除不只是改一条 next，还要同步维护 first、last 和 size。验收时应用单节点链表覆盖“同时删除头和尾”的重叠边界。',
    },
    {
      key: 'bst-delete',
      title: 'BST 删除的三种情况',
      summary: '叶子、只有一个子树、同时有两个子树需分开处理。',
      markdown:
        '两个子树时，可用左子树最大值或右子树最小值替换当前项，再递归删除被搬迁的值。每次返回后都要重新检查 BST ordering invariant。',
    },
  ],
};

const MAT136_SERIES_NOTEBOOK: ExplanationNotebookFixture = {
  id: 'mock-note-mat136-series',
  title: 'MAT136 无穷级数判别法笔记',
  fileName: 'MAT136_09_Series.pdf',
  routeKind: 'course',
  sections: [
    {
      key: 'divergence-test',
      title: '通项检验只能证明发散',
      summary: '若通项极限不为 0 或不存在，级数发散；通项趋于 0 不足以证明收敛。',
      markdown: '选判别法前先计算通项极限。这是必要条件检查，不是一个双向的收敛判定。',
    },
    {
      key: 'integral-test',
      title: '积分判别法的三个前提',
      summary: '对应函数在足够大的区间上应连续、为正且单调递减。',
      markdown:
        '对 a_n = 1/(n\\ln n)，取 f(x)=1/(x\\ln x)。先验证 x\\ge 2 上的连续、正性和递减性，再计算反常积分。',
    },
    {
      key: 'comparison-direction',
      title: '比较判别法的不等式方向',
      summary: '证收敛时找收敛上界，证发散时找发散下界。',
      markdown: '必须同时写出比较对象、不等式成立的范围以及已知级数的收敛性，不能只说“大概一样”。',
    },
  ],
};

const DEFAULT_PROBLEM_EXPLANATION_INPUT = `判断级数
\\[
\\sum_{n=2}^{\\infty} \\frac{1}{n\\ln n}
\\]
是否收敛。请说明选择判别法的理由，并写出完整过程。`;

const EXPLANATION_TEST_CASES: ExplanationTestCase[] = [
  {
    id: 'concept-recursion-no-notes',
    title: '01 · 递归基线条件',
    description: '知识点 · 无笔记',
    kind: 'concept',
    noteMode: 'without_notes',
    topic: '递归为什么需要基线条件',
    notebook: null,
  },
  {
    id: 'concept-recursion-with-notes',
    title: '02 · 递归契约',
    description: '知识点 · 有模拟笔记',
    kind: 'concept',
    noteMode: 'with_extracted_notes',
    topic: '如何用递归契约设计函数',
    notebook: CSC148_RECURSION_NOTEBOOK,
  },
  {
    id: 'concept-linked-list-ri',
    title: '03 · Linked List RI',
    description: '知识点 · 有模拟笔记',
    kind: 'concept',
    noteMode: 'with_extracted_notes',
    topic: 'Linked List 的 Representation Invariant',
    notebook: CSC148_DATA_STRUCTURES_NOTEBOOK,
  },
  {
    id: 'concept-binary-search-no-notes',
    title: '04 · 二分查找不变量',
    description: '知识点 · 无笔记',
    kind: 'concept',
    noteMode: 'without_notes',
    topic: '二分查找的循环不变量如何保证正确性',
    notebook: null,
  },
  {
    id: 'concept-bst-delete',
    title: '05 · BST 删除',
    description: '知识点 · 有模拟笔记',
    kind: 'concept',
    noteMode: 'with_extracted_notes',
    topic: 'BST 删除节点的三种情况',
    notebook: CSC148_DATA_STRUCTURES_NOTEBOOK,
  },
  {
    id: 'problem-series-no-notes',
    title: '06 · 级数收敛性',
    description: '题目 · 无笔记',
    kind: 'problem',
    noteMode: 'without_notes',
    topic: DEFAULT_PROBLEM_EXPLANATION_INPUT,
    notebook: null,
  },
  {
    id: 'problem-series-with-notes',
    title: '07 · 积分判别法',
    description: '题目 · 有模拟笔记',
    kind: 'problem',
    noteMode: 'with_extracted_notes',
    topic: DEFAULT_PROBLEM_EXPLANATION_INPUT,
    notebook: MAT136_SERIES_NOTEBOOK,
  },
  {
    id: 'problem-recursive-trace',
    title: '08 · 递归跟踪',
    description: '题目 · 有模拟笔记',
    kind: 'problem',
    noteMode: 'with_extracted_notes',
    topic:
      '给定函数 `def f(n): return 1 if n == 0 else n * f(n - 1)`，请跟踪 `f(4)` 的调用与返回顺序，并说明基线条件的作用。',
    notebook: CSC148_RECURSION_NOTEBOOK,
  },
  {
    id: 'problem-linked-list-delete',
    title: '09 · 链表删除边界',
    description: '题目 · 有模拟笔记',
    kind: 'problem',
    noteMode: 'with_extracted_notes',
    topic:
      '一个 LinkedList 同时保存 first、last 和 size。请设计删除第一个值等于 target 的节点的方法，分别说明空表、头节点、中间节点、尾节点和单节点链表如何维护 RI。',
    notebook: CSC148_DATA_STRUCTURES_NOTEBOOK,
  },
  {
    id: 'problem-comparison-test-no-notes',
    title: '10 · 比较判别法',
    description: '题目 · 无笔记',
    kind: 'problem',
    noteMode: 'without_notes',
    topic:
      '判断级数 `\\sum_{n=1}^{\\infty} 1/(n^2+3n)` 是否收敛。请选择合适的比较对象，写明不等式方向和判断依据。',
    notebook: null,
  },
];

const DEFAULT_PRACTICE_HISTORY = `- 当前主题的基础题：最近 3 题错 2 题，定义会说但应用不稳定
- 当前主题的综合题：最近一次部分正确，推理中间缺少关键依据
- 先修知识：5 题对 4 题，掌握较稳定`;

const DEFAULT_SCHEDULE = `- 2026-07-13：当前课程小测，覆盖本次测试主题
- 今天可用 45 分钟
- 明天可用 90 分钟`;

const DEFAULT_QUESTION_HISTORY = `- 问：这个知识点的定义和适用条件有什么区别？
  答：能复述定义，但仍会把必要条件和充分条件混在一起
- 问：解题时第一步应该检查什么？
  答：知道要找已知条件，但还不能稳定连接到结论`;

const DEFAULT_MEMORY = `- 已掌握：当前主题的基础定义
- 薄弱点：把定义应用到综合题
- 原因：只记住结论，没有显式写出每一步依据
- 下一步教学动作：先做一次证据标注，再完成一道综合题`;
const DEFAULT_CALENDAR_INSTRUCTION = '下周三晚上添加 45 分钟当前课程主题复习';

const NOTEBOOK_OVERVIEW_IMAGE_PROVIDER_ID = 'openai-image' as const;
const NOTEBOOK_OVERVIEW_IMAGE_MODEL_ID = 'gpt-image-2';

type CoverUsageProfile = 'auto' | 'university_course' | 'research' | 'daily_use';

type SyllabusParseResponse = {
  success?: boolean;
  modelId?: string;
  events?: Array<{
    id?: string;
    title: string;
    date: string;
    kind: CalendarTestEvent['kind'];
    rawText?: string | null;
  }>;
  warnings?: string[];
  error?: string;
};

type SourceMarkdownNotebookResponse = {
  storage: 'none';
  preview: {
    source: {
      title: string;
      hash: string;
      openaiFileId: string | null;
      aiSynthesisInput: 'openai_file_id' | 'extracted_text' | 'not_used';
    };
    classification: {
      documentType: string;
      usageProfile: string;
      topic: string;
      courseCode: string | null;
    };
    title: string;
    routing: NotebookRouteDecision;
    studyGuide: NotebookStudyGuide;
    sections: Array<{ key: string; title: string; summary: string; markdown: string }>;
    answerContract: NotebookAnswerContract | null;
  };
};

type SourceCoverPromptResponse = {
  storage: 'none';
  preview: {
    source: {
      title: string;
      hash: string;
      openaiFileId: string | null;
      aiSynthesisInput: 'openai_file_id' | 'extracted_text' | 'not_used';
    };
    classification: {
      documentType: string;
      usageProfile: string;
      topic: string;
    };
    prompt: string;
    coverSpec: StudyCoverOverlaySpec;
    summary: string;
    sections: Array<{ title: string; summary: string }>;
  };
};

type ImageGenerationResponse = {
  result: ImageGenerationResult;
  costEstimate?: ImageGenerationCostEstimate;
};

type FixtureResponse = {
  fixture: {
    resultKey: string;
    attemptedProblemIds: string[];
    attemptCount: number;
    memoryIds: string[];
    memoryCount: number;
    availableProblemCount: number;
  };
};

type TeachingReviewPlanResponse = {
  decision: {
    targetConcepts: string[];
    evidence: {
      items: Array<{ id: string; title: string; excerpt?: string; reason: string }>;
    };
    output: {
      summary: string;
      scheduleSummary: string | null;
      estimatedMinutes: number;
      tasks: Array<{
        id: string;
        title: string;
        concepts: string[];
        minutes: number;
        reason: string;
        evidenceIds: string[];
        problemIds: string[];
      }>;
      questionCandidates: Array<{
        problemId: string;
        title: string;
        type: string;
        difficulty: string;
        tags: string[];
        reason: string;
        evidenceIds: string[];
      }>;
      rationale: string[];
      evidenceGaps: string[];
    };
  };
};

type QuestionSourceResponse = {
  sourceCase: QuestionSourceCase;
  courseCode: 'MAT136' | 'CSC148';
  courseName: string;
  topic: string;
  requestedCount: number;
  localBank: {
    totalCount: number;
    candidateCount: number;
    source: string;
    sourceExportedAt: string | null;
  };
  notebookProvided: boolean;
  decision: {
    route: 'select_only' | 'generate_only' | 'mixed';
    reasoning: string[];
    trace: QuestionRetrievalTrace;
  };
  questions: QuestionTestItem[];
  counts: {
    rawSelectedExisting: number;
    validSelectedExisting: number;
    invalidSelectedExisting: number;
    generated: number;
    returned: number;
  };
  evaluation: QuestionTestEvaluation;
  model: string;
  usage?: PlatformFlowRunPayload['usage'];
};

function payloadFromRow(
  row: TestResultRow<PlatformFlowRunPayload> | null,
): PlatformFlowRunPayload | null {
  return row?.payload?.kind === 'platform-flow-run' ? row.payload : null;
}

function buildExplanationTestContext(args: { testCase: ExplanationTestCase; query: string }): {
  courseContext: CourseChatContext;
  sourceNotebook: Extract<PlatformFlowOutput, { kind: 'explanation' }>['sourceNotebook'];
  contextPages: Extract<PlatformFlowOutput, { kind: 'explanation' }>['contextPages'];
} {
  const target: CourseChatContext['target'] = {
    kind: 'orchestrator',
    id: COURSE_ORCHESTRATOR_ID,
    name: COURSE_ORCHESTRATOR_NAME,
    role: 'teacher',
  };

  if (args.testCase.noteMode === 'without_notes') {
    return {
      courseContext: {
        course: {
          id: 'platform-test-explanation-without-notes',
          name: '无笔记讲解测试',
          purpose: 'university',
          tags: ['platform-test', 'without-notes'],
        },
        target,
        notebooks: [],
        layeredMemory: {
          storage: 'unavailable',
          prompt:
            '测试条件：没有提供笔记、题库、学习记忆或课程私域规则。只能依据一般知识回答，并明确这一证据边界。',
          counts: { direct: 0, semantic: 0, knowledge: 0, sourceEvidence: 0 },
        },
      },
      sourceNotebook: null,
      contextPages: [],
    };
  }

  const notebook = args.testCase.notebook;
  if (!notebook) throw new Error('这条测试没有配置模拟笔记提取结果。');

  const tokens = tokenizeCourseChatQuery(args.query);
  const selectedSections = notebook.sections
    .map((section, index) => {
      const digest = [section.summary, section.markdown].filter(Boolean).join('\n\n').trim();
      return {
        section,
        index,
        digest,
        sourceScore: scoreCourseChatText(tokens, `${section.title} ${digest}`),
      };
    })
    .sort((a, b) => b.sourceScore - a.sourceScore || a.index - b.index)
    .slice(0, 8)
    .sort((a, b) => a.index - b.index);
  const routeKind = notebook.routeKind;
  const sourceNotebook = {
    runId: notebook.id,
    title: notebook.title,
    fileName: notebook.fileName,
    routeKind,
    sectionCount: notebook.sections.length,
    sourceType: 'mock_extraction' as const,
  };
  const contextPages = selectedSections.map(({ section, digest, sourceScore }) => ({
    id: section.key,
    title: section.title,
    summary: section.summary,
    characterCount: Math.min(digest.length, 5_000),
    sourceScore,
  }));
  const purpose =
    routeKind === 'research' ? 'research' : routeKind === 'daily' ? 'daily' : 'university';

  return {
    courseContext: {
      course: {
        id: 'platform-test-explanation-with-extracted-notes',
        name: notebook.title,
        purpose,
        tags: ['platform-test', 'mock-extracted-notebook', routeKind],
      },
      target,
      notebooks: [
        {
          id: sourceNotebook.runId,
          name: sourceNotebook.title,
          description: `来自当前固定测试的模拟笔记提取：${sourceNotebook.fileName || '未知源文件'}`,
          tags: [routeKind, 'mock-extracted-notebook'],
          pages: selectedSections.map(({ section, index, digest, sourceScore }) => ({
            id: `${sourceNotebook.runId}-${section.key}`,
            order: index + 1,
            title: section.title,
            digest: digest.slice(0, 5_000),
            sourceScore,
          })),
          privateMemories: [],
          sourceScore: selectedSections.reduce((total, section) => total + section.sourceScore, 0),
        },
      ],
      layeredMemory: {
        storage: 'unavailable',
        prompt:
          '测试条件：只允许使用 courseContext.notebooks 中当前页面展示的模拟“笔记提取”结果；没有额外课程数据库、题库或学习记忆。若笔记不足，必须说明缺口后再补充一般知识。',
        counts: {
          direct: selectedSections.length,
          semantic: 0,
          knowledge: 0,
          sourceEvidence: selectedSections.length,
        },
      },
    },
    sourceNotebook,
    contextPages,
  };
}

function isFileScenario(id: CorePlatformScenarioId): boolean {
  return [
    'notebook-overview-image',
    'notebook-summary-content',
    'calendar-natural-language-crud',
  ].includes(id);
}

function isQuestionScenario(id: CorePlatformScenarioId): boolean {
  return id === 'question-source-routing';
}

function formatTime(value: string | number): string {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function runCost(row: TestResultRow<PlatformFlowRunPayload>): number {
  const payload = payloadFromRow(row);
  if (typeof payload?.costUsd === 'number') return payload.costUsd;
  return typeof row.summary?.costUsd === 'number' ? row.summary.costUsd : 0;
}

function imageResultUrl(result: ImageGenerationResult): string {
  if (result.url) return result.url;
  if (!result.base64) return '';
  return result.base64.startsWith('data:')
    ? result.base64
    : `data:image/png;base64,${result.base64}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function outputKindLabel(output: PlatformFlowOutput): string {
  if (output.kind === 'image') return '图片';
  if (output.kind === 'calendar') return '日历';
  if (output.kind === 'questions') return `${output.questions.length} 道题`;
  if (output.kind === 'slides') return 'PPT';
  if (output.kind === 'review-plan') return '复习计划';
  if (output.kind === 'notebook') return '结构化笔记';
  return '文字讲解';
}

function scenarioActionLabel(id: CorePlatformScenarioId): string {
  if (id === 'notebook-overview-image') return '生成 Cheat Sheet';
  if (id === 'notebook-summary-content') return '生成 Markdown 笔记';
  if (id === 'calendar-natural-language-crud') return '执行日历操作';
  if (isQuestionScenario(id)) return '运行题源路由';
  if (id === 'concept-ppt-explanation') return '生成 2 页 PPT';
  if (id === 'memory-review-plan') return '生成复习计划';
  return '生成讲解';
}

function inputSummary(payload: PlatformFlowRunPayload): string {
  if (payload.output.kind === 'questions') {
    const sourceCaseLabel = {
      empty_no_notes: '题库空 · 无笔记',
      empty_with_notes: '题库空 · 有笔记',
      sufficient_bank: '题库充足',
      partial_no_notes: '题库不全 · 无笔记',
      partial_with_notes: '题库不全 · 有笔记',
    }[payload.input.questionSourceCase || payload.output.sourceCase || 'sufficient_bank'];
    return `${payload.input.problemBankCourseCode || payload.output.courseCode || '课程'} · ${sourceCaseLabel} · ${payload.input.topic || payload.output.topic}`;
  }
  return (
    payload.input.fileName || payload.input.topic || payload.input.instruction || '未命名测试运行'
  );
}

export function PlatformFlowTestWorkspace({
  scenario,
}: {
  scenario: PlatformTestScenario & { id: CorePlatformScenarioId };
}) {
  const settingsHydrated = usePersistHydrated(useSettingsStore);
  const authHydrated = usePersistHydrated(useAuthStore);
  const courseHydrated = usePersistHydrated(useCurrentCourseStore);

  if (!settingsHydrated || !authHydrated || !courseHydrated) {
    return <PlatformFlowWorkspaceHydrating scenario={scenario} />;
  }

  return <PlatformFlowTestWorkspaceContent scenario={scenario} />;
}

function PlatformFlowWorkspaceHydrating({
  scenario,
}: {
  scenario: PlatformTestScenario & { id: CorePlatformScenarioId };
}) {
  return (
    <main className="min-h-screen bg-[#f5f6f8] text-slate-950">
      <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">
        <header className="mb-4 rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <Button asChild variant="ghost" size="sm" className="-ml-3 mb-2 text-slate-500">
                <Link href="/test">
                  <ArrowLeft className="size-4" />
                  返回测试列表
                </Link>
              </Button>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="rounded-md bg-sky-600 font-mono text-white hover:bg-sky-600">
                  第一阶段 · 流程 {String(scenario.order).padStart(2, '0')}
                </Badge>
                <Badge variant="secondary" className="rounded-md">
                  人工验收
                </Badge>
                <Badge variant="outline" className="rounded-md bg-white">
                  初始化上下文
                </Badge>
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                {scenario.title}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{scenario.summary}</p>
            </div>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="h-fit overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-4">
              <div className="h-5 w-24 rounded bg-slate-100" />
              <div className="mt-2 h-4 w-36 rounded bg-slate-100" />
            </div>
            <div className="space-y-3 p-3">
              <div className="h-16 rounded-xl bg-slate-100" />
              <div className="h-16 rounded-xl bg-slate-100" />
              <div className="h-16 rounded-xl bg-slate-100" />
            </div>
          </aside>

          <section className="min-w-0 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                <Loader2 className="size-4 animate-spin text-violet-600" />
                正在恢复本地测试上下文
              </div>
              <div className="mt-4 space-y-3">
                <div className="h-10 rounded-xl bg-slate-100" />
                <div className="h-24 rounded-xl bg-slate-100" />
              </div>
            </div>
            <div className="min-h-[560px] rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="h-5 w-28 rounded bg-slate-100" />
              <div className="mt-6 flex min-h-[440px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
                等待浏览器本地设置和课程上下文完成恢复
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function PlatformFlowTestWorkspaceContent({
  scenario,
}: {
  scenario: PlatformTestScenario & { id: CorePlatformScenarioId };
}) {
  const [questionSourceCase, setQuestionSourceCase] =
    useState<QuestionSourceCase>('sufficient_bank');
  const [selectedQuestionSampleId, setSelectedQuestionSampleId] =
    useState('csc148-sufficient-bank');
  const [selectedExplanationTestId, setSelectedExplanationTestId] = useState(
    EXPLANATION_TEST_CASES[0]!.id,
  );
  const selectedExplanationTestCase =
    EXPLANATION_TEST_CASES.find((testCase) => testCase.id === selectedExplanationTestId) ||
    EXPLANATION_TEST_CASES[0]!;
  const explanationKind = selectedExplanationTestCase.kind;
  const explanationNoteMode = selectedExplanationTestCase.noteMode;
  const questionScenarioHasNotes =
    questionSourceCase === 'empty_with_notes' || questionSourceCase === 'partial_with_notes';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const providerId = useSettingsStore((state) => state.providerId);
  const modelId = useSettingsStore((state) => state.modelId);
  const pdfProviderId = useSettingsStore((state) => state.pdfProviderId);
  const pdfProvidersConfig = useSettingsStore((state) => state.pdfProvidersConfig);
  const imageProvidersConfig = useSettingsStore((state) => state.imageProvidersConfig);
  const courseId = useCurrentCourseStore((state) => state.id);
  const courseName = useCurrentCourseStore((state) => state.name);
  const courseAvatarUrl = useCurrentCourseStore((state) => state.avatarUrl);
  const userId = useAuthStore((state) => state.userId);
  const calendarUserId = userId || 'anonymous';
  const [runs, setRuns] = useState<TestResultRow<PlatformFlowRunPayload>[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [localFiles, setLocalFiles] = useState<LocalTestFileRow[]>([]);
  const [queueTestFiles, setQueueTestFiles] = useState<string[]>([]);
  const [queueTestFilePath, setQueueTestFilePath] = useState('');
  const [topic, setTopic] = useState(
    scenario.id === 'concept-ppt-explanation'
      ? '二分查找的不变量'
      : scenario.id === 'concept-text-explanation'
        ? EXPLANATION_TEST_CASES[0]!.topic
        : scenario.id === 'question-source-routing'
          ? TOPIC_PRESETS[2]
          : TOPIC_PRESETS[0],
  );
  const [instruction, setInstruction] = useState(
    scenario.id === 'calendar-natural-language-crud' ? DEFAULT_CALENDAR_INSTRUCTION : '',
  );
  const [practiceHistory, setPracticeHistory] = useState(DEFAULT_PRACTICE_HISTORY);
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE);
  const [problemBankCourseCode, setProblemBankCourseCode] = useState<'MAT136' | 'CSC148'>('CSC148');
  const [requestedQuestionCount, setRequestedQuestionCount] = useState(5);
  const [partialBankSize, setPartialBankSize] = useState(2);
  const [mockNotebookContent, setMockNotebookContent] = useState('');
  const [questionHistory, setQuestionHistory] = useState(DEFAULT_QUESTION_HISTORY);
  const [memory, setMemory] = useState(DEFAULT_MEMORY);
  const [coverTitle, setCoverTitle] = useState('');
  const [coverCourseLabel, setCoverCourseLabel] = useState('');
  const [coverUsageProfile, setCoverUsageProfile] = useState<CoverUsageProfile>('auto');
  const [coverFocus, setCoverFocus] = useState('');
  const [courseTopicPresets, setCourseTopicPresets] = useState<string[]>([]);
  const [courseLanguage, setCourseLanguage] = useState<'zh-CN' | 'en-US'>('zh-CN');
  const [calendarEvents, setCalendarEvents] = useState<CalendarTestEvent[]>([]);
  const [liveOutput, setLiveOutput] = useState<PlatformFlowOutput | null>(null);
  const [running, setRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingFiles, setLoadingFiles] = useState(isFileScenario(scenario.id));
  const [phase, setPhase] = useState('');
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);
  const [pendingDeleteRun, setPendingDeleteRun] =
    useState<TestResultRow<PlatformFlowRunPayload> | null>(null);

  const loadRuns = useCallback(
    async (signal?: AbortSignal) => {
      try {
        let rows: TestResultRow<PlatformFlowRunPayload>[];
        if (scenario.id === 'question-source-routing') {
          rows = await listSharedQuestionSourceResults<PlatformFlowRunPayload>({ signal });
          const sharedResultKeys = new Set(rows.map((row) => row.resultKey));
          const localRows =
            await listAllLocalQuestionSourceResultsForMigration<PlatformFlowRunPayload>();
          const localRowsToMigrate = localRows.filter(
            (row) =>
              row.payload?.kind === 'platform-flow-run' && !sharedResultKeys.has(row.resultKey),
          );
          if (localRowsToMigrate.length) {
            await Promise.all(
              localRowsToMigrate.map((row) =>
                saveSharedQuestionSourceResult({
                  testId: 'question-source-routing',
                  resultKey: row.resultKey,
                  status: row.status,
                  title: row.title || undefined,
                  summary: row.summary || undefined,
                  payload: row.payload!,
                }),
              ),
            );
            rows = await listSharedQuestionSourceResults<PlatformFlowRunPayload>({ signal });
          }
        } else {
          rows = await listTestResults<PlatformFlowRunPayload>({
            ...(scenario.id === 'concept-text-explanation'
              ? { testIds: ['concept-text-explanation', 'problem-explanation'] }
              : { testId: scenario.id }),
            includePayload: true,
            limit: 80,
            signal,
          });
        }
        const flowRows = rows.filter((row) => row.payload?.kind === 'platform-flow-run');
        setRuns(flowRows);
        setSelectedRunId((current) => current || flowRows[0]?.id || null);
        setCalendarEvents((current) => {
          if (current.length) return current;
          const restored = payloadFromRow(flowRows[0] || null)?.output;
          return restored?.kind === 'calendar' ? restored.events : current;
        });
      } catch (loadError) {
        if (signal?.aborted) return;
        setError(loadError instanceof Error ? loadError.message : '历史结果读取失败。');
      } finally {
        if (!signal?.aborted) setLoadingHistory(false);
      }
    },
    [scenario.id],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadRuns(controller.signal);
    return () => controller.abort();
  }, [loadRuns]);

  const loadFiles = useCallback(
    async (signal?: AbortSignal) => {
      if (!isFileScenario(scenario.id)) return;
      try {
        const files = await listLocalTestFiles({ testId: scenario.id, limit: 40, signal });
        setLocalFiles(files);
      } catch (loadError) {
        if (signal?.aborted) return;
        setError(loadError instanceof Error ? loadError.message : '本地文件历史读取失败。');
      } finally {
        if (!signal?.aborted) setLoadingFiles(false);
      }
    },
    [scenario.id],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadFiles(controller.signal);
    return () => controller.abort();
  }, [loadFiles]);

  useEffect(() => {
    if (scenario.id !== 'notebook-overview-image') return;
    const controller = new AbortController();
    void backendJson<{ files: string[] }>('/api/platform-tests/source-files', {
      signal: controller.signal,
    })
      .then(({ files }) => {
        setQueueTestFiles(files);
        setQueueTestFilePath(
          (current) => current || files.find((file) => /MAT136\/09_Series\.pdf$/i.test(file)) || '',
        );
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : 'queue 测试文件读取失败。');
        }
      });
    return () => controller.abort();
  }, [scenario.id]);

  useEffect(() => {
    if (
      !courseId ||
      isFileScenario(scenario.id) ||
      isQuestionScenario(scenario.id) ||
      scenario.id === 'concept-text-explanation'
    )
      return;
    let cancelled = false;
    void listCourseProblemSummaries(courseId, { lean: true })
      .then((problems) => {
        if (cancelled) return;
        const candidates = problems.flatMap((problem) => problem.tags);
        const presets = Array.from(
          new Set(candidates.map((item) => item.trim()).filter((item) => item.length >= 2)),
        ).slice(0, 8);
        setCourseTopicPresets(presets);
        if (presets.length) {
          setTopic((current) =>
            [...TOPIC_PRESETS, ...CONCEPT_PRESETS, courseName].includes(current)
              ? presets[0]
              : current,
          );
        } else if (courseName) {
          setTopic((current) =>
            [...TOPIC_PRESETS, ...CONCEPT_PRESETS].includes(current) ? courseName : current,
          );
        }
      })
      .catch(() => setCourseTopicPresets([]));
    return () => {
      cancelled = true;
    };
  }, [courseId, courseName, scenario.id]);

  useEffect(() => {
    if (
      !courseName ||
      isFileScenario(scenario.id) ||
      isQuestionScenario(scenario.id) ||
      scenario.id === 'concept-text-explanation'
    )
      return;
    setTopic((current) =>
      [...TOPIC_PRESETS, ...CONCEPT_PRESETS].includes(current) ? courseName : current,
    );
  }, [courseName, scenario.id]);

  useEffect(() => {
    if (scenario.id !== 'calendar-natural-language-crud' || !courseName) return;
    setInstruction((current) =>
      current === DEFAULT_CALENDAR_INSTRUCTION
        ? `下周三晚上添加 45 分钟「${courseName}」复习`
        : current,
    );
  }, [courseName, scenario.id]);

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    void getCourse(courseId).then((course) => {
      if (!cancelled && course) setCourseLanguage(course.language === 'en-US' ? 'en-US' : 'zh-CN');
    });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  useEffect(() => {
    if (scenario.id !== 'calendar-natural-language-crud' || !courseId) return;
    const productionEvents = readSyllabusEvents(calendarUserId, courseId);
    if (productionEvents.length) {
      setCalendarEvents(
        productionEvents.map((event) => ({
          id: event.id,
          title: event.title,
          date: event.date,
          kind: event.kind,
          rawText: event.rawText,
        })),
      );
    }
  }, [calendarUserId, courseId, scenario.id]);

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) || null,
    [runs, selectedRunId],
  );
  const selectedPayload = payloadFromRow(selectedRun);
  const pendingDeletePayload = payloadFromRow(pendingDeleteRun);
  const visibleOutput = liveOutput || selectedPayload?.output || null;
  const totalCost = useMemo(() => runs.reduce((sum, run) => sum + runCost(run), 0), [runs]);
  const fileRuns = useMemo(
    () => runs.filter((run) => Boolean(payloadFromRow(run)?.input.fileName)),
    [runs],
  );
  const questionResultSummary = useMemo(() => {
    const seenSamples = new Set<string>();
    const items = runs.flatMap((row) => {
      const payload = payloadFromRow(row);
      if (payload?.output.kind !== 'questions') return [];
      const sampleKey = [
        payload.input.problemBankCourseCode || payload.output.courseCode,
        payload.input.questionSourceCase || payload.output.sourceCase,
      ].join(':');
      if (seenSamples.has(sampleKey)) return [];
      seenSamples.add(sampleKey);
      return [{ row, payload, output: payload.output }];
    });
    return {
      items,
      passed: items.filter((item) => item.output.evaluation?.passed).length,
      needsReview: items.filter((item) => item.output.evaluation?.passed === false).length,
    };
  }, [runs]);

  const chooseRun = (row: TestResultRow<PlatformFlowRunPayload>) => {
    setSelectedRunId(row.id);
    setLiveOutput(null);
    const payload = payloadFromRow(row);
    if (payload?.output.kind === 'calendar') setCalendarEvents(payload.output.events);
    if (payload?.output.kind === 'explanation') {
      const explanationOutput = payload.output;
      setTopic(explanationOutput.title);
      const savedTestCase = EXPLANATION_TEST_CASES.find(
        (testCase) => testCase.id === payload.input.explanationTestId,
      );
      const matchingTestCase =
        savedTestCase ||
        EXPLANATION_TEST_CASES.find(
          (testCase) =>
            testCase.kind === explanationOutput.explanationKind &&
            testCase.noteMode === explanationOutput.noteMode &&
            testCase.topic === explanationOutput.title,
        );
      if (matchingTestCase) setSelectedExplanationTestId(matchingTestCase.id);
    }
    if (payload?.output.kind === 'questions') {
      const sample = QUESTION_SOURCE_SAMPLES.find(
        (item) =>
          item.courseCode === payload.input.problemBankCourseCode &&
          item.sourceCase === payload.input.questionSourceCase,
      );
      if (sample) setSelectedQuestionSampleId(sample.id);
      if (payload.input.problemBankCourseCode) {
        setProblemBankCourseCode(payload.input.problemBankCourseCode);
      }
      if (payload.input.questionSourceCase) setQuestionSourceCase(payload.input.questionSourceCase);
      if (payload.input.requestedQuestionCount) {
        setRequestedQuestionCount(payload.input.requestedQuestionCount);
      }
      setPartialBankSize(payload.input.partialBankSize ?? 2);
      setMockNotebookContent(payload.input.mockNotebookContent ?? '');
      setTopic(payload.input.topic || payload.output.topic);
    }
  };

  const chooseRunAndReveal = (row: TestResultRow<PlatformFlowRunPayload>) => {
    chooseRun(row);
    window.setTimeout(() => {
      document
        .getElementById('platform-flow-result-details')
        ?.scrollIntoView({ behavior: 'auto', block: 'start' });
    }, 0);
  };

  const deleteRun = async () => {
    const row = pendingDeleteRun;
    if (!row || deletingRunId || running) return;

    setDeletingRunId(row.id);
    setError('');
    try {
      if (scenario.id === 'question-source-routing') {
        if (row.canDelete === false) throw new Error('只能删除自己创建的共享测试结果。');
        await deleteSharedQuestionSourceResult({
          testId: 'question-source-routing',
          resultKey: row.resultKey,
        });
      } else {
        await deleteTestResult({ testId: row.testId, resultKey: row.resultKey });
      }
      const remainingRuns = runs.filter((run) => run.id !== row.id);
      setRuns(remainingRuns);
      if (selectedRunId === row.id) {
        setSelectedRunId(remainingRuns[0]?.id || null);
        setLiveOutput(null);
      }
      setPendingDeleteRun(null);
      setSaveMessage('已删除这条生成历史。');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '生成历史删除失败。');
    } finally {
      setDeletingRunId(null);
    }
  };

  const chooseLocalFile = async (row: LocalTestFileRow) => {
    setError('');
    try {
      const file = await loadLocalTestFile(row.id);
      if (!file) throw new Error('本地文件不存在，可能已被浏览器清理。');
      setSelectedFile(file);
      setSelectedFileId(row.id);
      setSelectedRunId(null);
      setLiveOutput(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '本地文件恢复失败。');
    }
  };

  const chooseNewFile = async (file: File | null) => {
    setSelectedFile(file);
    setSelectedFileId(null);
    setLiveOutput(null);
    setSelectedRunId(null);
    setError('');
    if (!file) return;
    try {
      const saved = await saveLocalTestFile({ testId: scenario.id, file });
      setSelectedFileId(saved.id);
      await loadFiles();
      setSaveMessage('上传文件已保存到当前浏览器本地库。');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '上传文件本地保存失败。');
    }
  };

  const chooseQueueTestFile = async () => {
    if (!queueTestFilePath) return;
    setError('');
    try {
      const response = await backendFetch(
        `/api/platform-tests/source-files?file=${encodeURIComponent(queueTestFilePath)}`,
        { cache: 'no-store' },
      );
      if (!response.ok) throw new Error(`queue 测试文件读取失败（${response.status}）。`);
      const blob = await response.blob();
      const fileName = queueTestFilePath.split('/').pop() || 'queue-test-file';
      const file = new File([blob], fileName, {
        type: response.headers.get('content-type') || blob.type || 'application/octet-stream',
      });
      await chooseNewFile(file);
      setSaveMessage(`已从 queue 载入 ${queueTestFilePath}，文件只保存在浏览器本地测试库。`);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'queue 测试文件载入失败。');
    }
  };

  const prepareImageRegeneration = async () => {
    if (scenario.id !== 'notebook-overview-image' || !selectedPayload) return;
    const input = selectedPayload.input;
    if (!input.fileName) {
      setError('这条历史记录没有原文件信息，无法重新生成。');
      return;
    }

    setError('');
    setCoverTitle(
      input.coverTitle ||
        (selectedPayload.output.kind === 'image' ? selectedPayload.output.title : ''),
    );
    setCoverCourseLabel(input.coverCourseLabel || '');
    setCoverUsageProfile(input.coverUsageProfile || 'auto');
    setCoverFocus(input.coverFocus || '');

    const sourceFileRow = localFiles.find(
      (row) =>
        row.fileName === input.fileName &&
        (typeof input.fileSize !== 'number' || row.fileSize === input.fileSize),
    );
    if (!sourceFileRow) {
      setSelectedFile(null);
      setSelectedFileId(null);
      setSaveMessage('已恢复历史 Cheat Sheet 参数；旧记录没有本地原文件，请重新选择该文件。');
      fileInputRef.current?.click();
      return;
    }

    try {
      const file = await loadLocalTestFile(sourceFileRow.id);
      if (!file) throw new Error('本地原文件已经被浏览器清理。');
      setSelectedFile(file);
      setSelectedFileId(sourceFileRow.id);
      setSelectedRunId(null);
      setLiveOutput(null);
      setSaveMessage('已恢复历史文件和 Cheat Sheet 参数；确认输入后点击“生成 Cheat Sheet”。');
    } catch (loadError) {
      setSelectedFile(null);
      setSelectedFileId(null);
      setError(loadError instanceof Error ? loadError.message : '历史原文件恢复失败。');
    }
  };

  const modelHeaders = (): Record<string, string> =>
    providerId === 'openai' && modelId ? { 'x-model': `openai:${modelId}` } : {};

  const persistRun = async (args: {
    resultKey: string;
    input: PlatformFlowInput;
    output: PlatformFlowOutput;
    model?: string;
    usage?: PlatformFlowRunPayload['usage'];
    costEstimate?: PlatformFlowRunPayload['costEstimate'];
    summaryMetadata?: Record<string, unknown>;
  }) => {
    const savedAt = Date.now();
    const payload: PlatformFlowRunPayload = {
      kind: 'platform-flow-run',
      scenarioId: scenario.id,
      input: args.input,
      output: args.output,
      model: args.model,
      usage: args.usage,
      costUsd: args.costEstimate?.retailUsd ?? null,
      costEstimate: args.costEstimate,
      savedAt,
    };
    const generatedCount =
      args.output.kind === 'questions'
        ? args.output.questions.length
        : args.output.kind === 'calendar'
          ? args.output.events.length
          : args.output.kind === 'slides'
            ? args.output.slides.length
            : args.output.kind === 'review-plan'
              ? args.output.tasks.length
              : 1;
    const saveArgs = {
      resultKey: args.resultKey,
      status: 'completed',
      title: `${scenario.title} · ${args.input.fileName || args.input.topic || '新运行'}`,
      summary: {
        generatedCount,
        errorCount: 0,
        lastUpdatedAt: savedAt,
        model: args.model,
        outputKind: args.output.kind,
        costUsd: args.costEstimate?.retailUsd ?? null,
        ...args.summaryMetadata,
      },
      payload,
    };
    const savedRow =
      scenario.id === 'question-source-routing'
        ? await saveSharedQuestionSourceResult({
            ...saveArgs,
            testId: 'question-source-routing',
          })
        : await saveTestResult({ ...saveArgs, testId: scenario.id });
    setLiveOutput(args.output);
    if (args.output.kind === 'calendar') setCalendarEvents(args.output.events);
    await loadRuns();
    if (savedRow?.id) setSelectedRunId(savedRow.id);
    setSaveMessage(
      scenario.id === 'question-source-routing'
        ? '结果已保存为平台共享历史，所有登录用户看到相同结果。'
        : '结果已保存在当前浏览器本地库，可反复切换查看。',
    );
  };

  const sourceKindForFile = (file: File) => {
    const lowerName = file.name.toLowerCase();
    const mime = (file.type || '').toLowerCase();
    if (mime === 'application/pdf' || lowerName.endsWith('.pdf')) return 'pdf';
    if (lowerName.endsWith('.pptx')) return 'pptx';
    if (mime.includes('markdown') || /\.md(?:own)?$/.test(lowerName)) return 'markdown';
    if (
      lowerName.includes('problem') ||
      lowerName.includes('question') ||
      lowerName.includes('题')
    ) {
      return 'problem_bank';
    }
    if (mime.startsWith('text/') || /\.(txt|csv|json)$/.test(lowerName)) return 'plain_text';
    return 'other';
  };

  const runSourceIngestFlow = async () => {
    if (!selectedFile) throw new Error('请先在左侧上传一个文件。');
    const sourceKind = sourceKindForFile(selectedFile);
    const maxSize = ['plain_text', 'markdown', 'problem_bank'].includes(sourceKind)
      ? 4 * 1024 * 1024
      : 18 * 1024 * 1024;
    if (selectedFile.size > maxSize) {
      throw new Error(`文件超过主链路限制：${Math.round(maxSize / 1024 / 1024)} MB。`);
    }

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('sourceTitle', selectedFile.name);
    formData.append('sourceKind', sourceKind);
    formData.append('language', courseLanguage);
    formData.append('pdfProviderId', pdfProviderId);
    const pdfConfig = pdfProvidersConfig[pdfProviderId];
    if (pdfConfig?.apiKey) formData.append('pdfApiKey', pdfConfig.apiKey);
    if (pdfConfig?.baseUrl) formData.append('pdfBaseUrl', pdfConfig.baseUrl);

    if (scenario.id === 'notebook-overview-image') {
      const coverInput = {
        coverTitle: coverTitle.trim(),
        coverCourseLabel: coverCourseLabel.trim(),
        coverUsageProfile,
        coverFocus: coverFocus.trim(),
      };
      const resultKey = createTestResultKey('run');
      formData.append('outputMode', 'cover_prompt');
      if (coverInput.coverTitle) formData.append('coverTitle', coverInput.coverTitle);
      if (coverInput.coverCourseLabel) {
        formData.append('coverCourseLabel', coverInput.coverCourseLabel);
      }
      if (coverInput.coverUsageProfile !== 'auto') {
        formData.append('usageProfile', coverInput.coverUsageProfile);
      }
      if (coverInput.coverFocus) formData.append('coverFocus', coverInput.coverFocus);
      setPhase(
        selectedFile.size > 8 * 1024 * 1024
          ? '正在通过 OpenAI Files/Uploads 读取文件并准备 Cheat Sheet 内容；不会创建笔记本…'
          : '正在读取文件并准备 Cheat Sheet 内容；不会创建笔记本…',
      );
      let promptResponse: SourceCoverPromptResponse;
      try {
        promptResponse = await backendJson<SourceCoverPromptResponse>(
          `/api/courses/${encodeURIComponent(courseId || 'detached-cover-preview')}/source-ingest`,
          { method: 'POST', headers: modelHeaders(), body: formData },
        );
      } catch (promptError) {
        throw new Error(`文件分析失败：${errorMessage(promptError)}`);
      }
      const preview = promptResponse.preview;
      const promptData = {
        title: preview.classification.topic || preview.source.title,
        summary: [
          preview.summary,
          `AI 内容输入：${preview.source.aiSynthesisInput === 'openai_file_id' ? 'OpenAI Files file_id' : '解析文本'}`,
          '本次文本模型与图片模型都只调用一次；没有缓存复用、结果重写或确定性覆盖层。',
        ]
          .filter(Boolean)
          .join(' '),
        prompt: preview.prompt,
        coverSpec: preview.coverSpec,
        sections: preview.sections.map((section) => section.title),
      };

      const imageConfig = imageProvidersConfig[NOTEBOOK_OVERVIEW_IMAGE_PROVIDER_ID];
      setPhase('正在调用正式 /api/generate/image 图片生成链路…');
      let imageResponse: ImageGenerationResponse;
      try {
        imageResponse = await backendJson<ImageGenerationResponse>('/api/generate/image', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-image-provider': NOTEBOOK_OVERVIEW_IMAGE_PROVIDER_ID,
            'x-image-model': NOTEBOOK_OVERVIEW_IMAGE_MODEL_ID,
            ...(imageConfig?.apiKey ? { 'x-api-key': imageConfig.apiKey } : {}),
            ...(imageConfig?.baseUrl ? { 'x-base-url': imageConfig.baseUrl } : {}),
          },
          body: JSON.stringify({
            prompt: promptData.prompt,
            negativePrompt:
              '乱码、伪汉字、无意义文字、无关公式、写实照片、广告海报、黑色背景、logo、水印',
            width: 1024,
            height: 1448,
            style: 'detailed A4 portrait Chinese study cheat sheet',
            quality: 'medium',
          }),
        });
      } catch (imageError) {
        throw new Error(`图片生成失败：${errorMessage(imageError)}`);
      }
      const imageUrl = imageResultUrl(imageResponse.result);
      if (!imageUrl) throw new Error('图片生成成功，但没有返回可保存的图片数据。');
      await persistRun({
        resultKey,
        input: {
          fileName: selectedFile.name,
          fileType: selectedFile.type,
          fileSize: selectedFile.size,
          ...coverInput,
        },
        output: {
          kind: 'image',
          title: promptData.title,
          summary: `${promptData.summary.replace(/(?:\s*图片已通过正式图片接口生成。)+$/g, '')} 图片已通过正式图片接口生成。`,
          imagePrompt: promptData.prompt,
          coverSpec: promptData.coverSpec,
          imageUrl,
          width: imageResponse.result.width || 1024,
          height: imageResponse.result.height || 1448,
          sections: promptData.sections,
        },
        model: `${NOTEBOOK_OVERVIEW_IMAGE_PROVIDER_ID}:${imageResponse.result.usage?.modelId || NOTEBOOK_OVERVIEW_IMAGE_MODEL_ID}`,
        usage: imageResponse.result.usage,
        costEstimate: imageResponse.costEstimate,
        summaryMetadata: { coverPromptVersion: 6 },
      });
      return;
    }

    formData.append('outputMode', 'notebook_content');
    if (coverUsageProfile !== 'auto') {
      formData.append('usageProfile', coverUsageProfile);
    }
    setPhase(
      selectedFile.size > 8 * 1024 * 1024
        ? '正在上传原始文件、自动路由，并创建一次后台结构化生成任务；页面会轮询同一个任务直到完成…'
        : '正在自动路由，并创建一次后台结构化生成任务；页面会轮询同一个任务直到完成…',
    );
    const response = await backendJson<SourceMarkdownNotebookResponse>(
      `/api/courses/${encodeURIComponent(courseId || 'local-preview')}/source-ingest`,
      { method: 'POST', headers: modelHeaders(), body: formData },
    );
    const preview = response.preview;
    const model = `${providerId}:${modelId}`;
    const resultKey = createTestResultKey('run');
    await persistRun({
      resultKey,
      input: {
        fileName: selectedFile.name,
        fileType: selectedFile.type,
        fileSize: selectedFile.size,
        coverUsageProfile,
      },
      output: {
        kind: 'notebook',
        title: preview.title || preview.source.title,
        routing: preview.routing,
        studyGuide: preview.studyGuide,
        sections: preview.sections,
        answerContract: preview.answerContract,
      },
      model,
    });
  };

  const parseCalendarFile = async () => {
    if (!courseId) throw new Error('请先进入一门课程；测试日历必须使用当前课程上下文。');
    if (!selectedFile) throw new Error('请先在左侧上传 syllabus PDF。');
    if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
      throw new Error('日历文件解析目前使用正式 PDF 输入，请上传 syllabus PDF。');
    }
    setPhase('AI 正在读取 syllabus 并提取日期…');
    const resultKey = createTestResultKey('run');
    const formData = new FormData();
    formData.append('pdf', selectedFile);
    formData.append('courseName', courseName || '当前课程');
    const response = await backendJson<SyllabusParseResponse>('/api/syllabus/parse', {
      method: 'POST',
      body: formData,
    });
    const parsedEvents: SyllabusCalendarEvent[] = (response.events || []).map((event, index) => ({
      id: event.id || `syllabus-${Date.now()}-${index}`,
      title: event.title,
      date: event.date,
      kind: event.kind,
      rawText: event.rawText,
      sourceName: selectedFile.name,
      origin: 'syllabus',
      sourceRef: { type: 'syllabus', id: selectedFile.name },
      createdAt: Date.now(),
    }));
    const committedEvents = mergeSyllabusEvents(
      readSyllabusEvents(calendarUserId, courseId),
      parsedEvents,
    );
    writeSyllabusEvents(calendarUserId, courseId, committedEvents);
    const events: CalendarTestEvent[] = committedEvents.map((event) => ({
      id: event.id,
      title: event.title,
      date: event.date,
      kind: event.kind,
      rawText: event.rawText,
    }));
    const output: PlatformFlowOutput = {
      kind: 'calendar',
      events,
      changeSummary: `从 ${selectedFile.name} 提取 ${parsedEvents.length} 个事项，并按主链路写入当前课程日历。`,
      warnings: response.warnings,
    };
    await persistRun({
      resultKey,
      input: {
        fileName: selectedFile.name,
        fileType: selectedFile.type,
        fileSize: selectedFile.size,
      },
      output,
      model: response.modelId,
    });
    setSaveMessage('日历提取结果已保存。现在可以继续测试自然语言添加、修改和删除。');
  };

  const productionCalendarEvents = (): SyllabusCalendarEvent[] =>
    calendarEvents.map((event) => ({
      ...event,
      sourceName: event.rawText ? 'Syllabus AI 解析' : '平台测试',
      origin: event.id.startsWith('learning-action-event') ? 'ai_plan' : 'syllabus',
      createdAt: Date.now(),
    }));

  const runCalendarMutation = async () => {
    if (!courseId) throw new Error('请先进入一门课程；日历动作必须使用当前课程上下文。');
    const currentEvents = productionCalendarEvents();
    setPhase('正在调用正式 /api/learn/turn 路由…');
    const turn = await backendJson<LearnTurnClientResponse>('/api/learn/turn', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...modelHeaders() },
      body: JSON.stringify({
        question: instruction,
        courseId,
        courseName,
        hasSyllabus: currentEvents.length > 0,
        progressKnown: false,
        calendarEvents: currentEvents,
      }),
    });
    const rawAction = [...(turn.proposals || []), ...(turn.directCalls || [])].find((action) =>
      ['calendar.propose_add', 'calendar.propose_update', 'calendar.propose_delete'].includes(
        action.kind,
      ),
    );
    if (!rawAction) {
      throw new Error(
        `正式学习路由没有返回日历增删改动作：${turn.replyText || turn.reason || '无原因'}`,
      );
    }
    const action = learnActionToClientAction({
      action: rawAction,
      id: `platform-test-${createTestResultKey('action')}`,
      defaultConfirmation: 'required',
    }) as LearningAction;
    let events: SyllabusCalendarEvent[];
    let changeSummary = action.summary || action.label;
    if (action.kind === 'calendar.propose_add') {
      const added = learningActionCalendarEvents(action);
      events = mergeSyllabusEvents(currentEvents, added);
      changeSummary = `正式学习动作已添加 ${added.length} 个日程：${added.map((item) => item.title).join('、')}`;
    } else if (action.kind === 'calendar.propose_update') {
      const updated = applyLearningCalendarUpdate({ events: currentEvents, action });
      if (!updated) throw new Error('正式日历执行器没有命中唯一可修改事项。');
      events = updated.events;
      changeSummary = `正式学习动作已修改：${updated.updated.title}（${updated.updated.date}）`;
    } else {
      const deleted = applyLearningCalendarDelete({ events: currentEvents, action });
      if (!deleted) throw new Error('正式日历执行器没有命中唯一可删除事项。');
      events = deleted.events;
      changeSummary = `正式学习动作已删除：${deleted.deleted.title}`;
    }
    writeSyllabusEvents(calendarUserId, courseId, events);

    const output: PlatformFlowOutput = {
      kind: 'calendar',
      events: events.map((event) => ({
        id: event.id,
        title: event.title,
        date: event.date,
        kind: event.kind,
        rawText: event.rawText,
      })),
      changeSummary,
    };
    await persistRun({
      resultKey: createTestResultKey('run'),
      input: { instruction, currentEvents: calendarEvents },
      output,
      model: `${providerId}:${modelId}`,
    });
  };

  const scheduleEventsFromFixtureText = (value: string) =>
    value
      .split('\n')
      .map((line, index) => {
        const dateKey = (offset: number) => {
          const date = new Date();
          date.setDate(date.getDate() + offset);
          const month = `${date.getMonth() + 1}`.padStart(2, '0');
          const day = `${date.getDate()}`.padStart(2, '0');
          return `${date.getFullYear()}-${month}-${day}`;
        };
        const date =
          line.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1] ||
          (/今天/.test(line) ? dateKey(0) : /明天/.test(line) ? dateKey(1) : undefined);
        if (!date) return null;
        const title = line
          .replace(/^\s*[-*]\s*/, '')
          .replace(date, '')
          .replace(/^\s*[：:]\s*/, '')
          .trim();
        return {
          id: `platform-test-schedule-${index}-${date}`,
          title: title || `学习安排 ${index + 1}`,
          date,
          kind: /考试|小测|quiz|test|exam/i.test(line) ? ('exam' as const) : ('progress' as const),
          sourceName: '平台测试模拟日程',
          notes: line,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const problemQuestionText = (problem: NotebookProblemClientRecord): string => {
    const content = problem.publicContent as unknown as Record<string, unknown>;
    const main = [content.stem, content.prompt, content.question, content.text].find(
      (value) => typeof value === 'string' && value.trim(),
    ) as string | undefined;
    const options = Array.isArray(content.options)
      ? content.options
          .map((option) => {
            if (!option || typeof option !== 'object') return '';
            const record = option as Record<string, unknown>;
            return `${String(record.label || record.id || '')} ${String(record.text || '')}`.trim();
          })
          .filter(Boolean)
          .join('\n')
      : '';
    return [main || problem.title, options].filter(Boolean).join('\n\n');
  };

  const runQuestionSourceFlow = async (
    sampleOverride?: QuestionSourceSample,
    progressLabel?: string,
  ) => {
    const activeSourceCase = sampleOverride?.sourceCase ?? questionSourceCase;
    const activeCourseCode = sampleOverride?.courseCode ?? problemBankCourseCode;
    const activeTopic = sampleOverride?.topic ?? topic;
    const activePartialBankSize = sampleOverride?.partialBankSize ?? partialBankSize;
    const hasNotes =
      activeSourceCase === 'empty_with_notes' || activeSourceCase === 'partial_with_notes';
    const activeNotebookContent = hasNotes
      ? sampleOverride
        ? MOCK_NOTEBOOK_CONTENT[activeCourseCode]
        : mockNotebookContent
      : '';
    const resultKey = createTestResultKey('run');
    const effectivePartialBankSize = activeSourceCase.startsWith('partial_')
      ? Math.min(activePartialBankSize, Math.max(0, requestedQuestionCount - 1))
      : undefined;
    setPhase(
      sampleOverride
        ? `${progressLabel ? `${progressLabel} · ` : ''}${activeCourseCode} · ${sampleOverride.title}：正在生成检索词、执行 RAG 并验收…`
        : '正在让 AI 生成检索词、执行本地 RAG，并逐题验证候选结果…',
    );
    const response = await backendJson<QuestionSourceResponse>(
      '/api/platform-tests/question-source',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...modelHeaders() },
        signal: AbortSignal.timeout(180_000),
        body: JSON.stringify({
          courseCode: activeCourseCode,
          sourceCase: activeSourceCase,
          topic: activeTopic,
          requestedCount: requestedQuestionCount,
          partialBankSize: effectivePartialBankSize,
          notebookContent: activeNotebookContent,
        }),
      },
    );
    await persistRun({
      resultKey,
      input: {
        topic: activeTopic,
        questionSourceCase: activeSourceCase,
        problemBankCourseCode: activeCourseCode,
        requestedQuestionCount,
        partialBankSize: effectivePartialBankSize,
        mockNotebookContent: hasNotes ? activeNotebookContent : undefined,
      },
      output: {
        kind: 'questions',
        topic: activeTopic,
        selectionSummary: [
          `AI 规划了 ${response.decision.trace.initialQueries.length} 组初始检索词，执行 ${response.decision.trace.rounds.length} 轮 RAG 验收。`,
          response.decision.trace.finalStopReason,
          `请求 ${response.requestedCount} 题；返回 ${response.counts.returned} 题，其中本地题库 ${response.counts.validSelectedExisting} 题、AI 生成 ${response.counts.generated} 题。`,
          response.counts.invalidSelectedExisting
            ? `Agent 返回了 ${response.counts.invalidSelectedExisting} 个不存在的题库 ID；页面未替它伪造题目。`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
        questions: response.questions,
        requestedCount: response.requestedCount,
        sourceCase: response.sourceCase,
        courseCode: response.courseCode,
        route: response.decision.route,
        localBankTotal: response.localBank.totalCount,
        candidateCount: response.localBank.candidateCount,
        existingCount: response.counts.validSelectedExisting,
        generatedCount: response.counts.generated,
        invalidExistingCount: response.counts.invalidSelectedExisting,
        decisionTrace: response.decision.trace,
        evaluation: response.evaluation,
      },
      model: response.model,
      usage: response.usage,
      summaryMetadata: {
        sourceCase: response.sourceCase,
        courseCode: response.courseCode,
        requestedCount: response.requestedCount,
        returnedCount: response.counts.returned,
        route: response.decision.route,
        evaluationPassed: response.evaluation.passed,
        invalidFormatCount: response.questions.filter(
          (question) => question.formatValidation?.valid === false,
        ).length,
      },
    });
  };

  const runReviewPlan = async () => {
    if (!courseId) throw new Error('请先进入一门有题库的课程；正式选题器只读取当前课程题库。');
    const resultKey = createTestResultKey('run');
    const needsPracticeFixture = scenario.id === 'memory-review-plan';
    let fixture: FixtureResponse['fixture'] | null = null;
    if (needsPracticeFixture) {
      setPhase('正在把模拟输入写成正式刷题/记忆记录…');
      if (scenario.id === 'memory-review-plan') {
        const now = Date.now();
        const conversationSaved = await syncRemoteLearnConversation({
          courseId,
          sessionId: `platform-test-${resultKey}`,
          title: `[平台测试] 问答记录 · ${topic}`,
          messages: [
            {
              id: `platform-test-question-${resultKey}`,
              role: 'user',
              text: questionHistory,
              createdAt: now,
            },
            {
              id: `platform-test-answer-${resultKey}`,
              role: 'assistant',
              text: `这是一条正式 Conversation/Message 记录，用于复习计划回查。\n\n${questionHistory}`,
              createdAt: now + 1,
            },
          ],
        });
        if (!conversationSaved) throw new Error('模拟问答没有写入正式课程对话记录。');
      }
      const fixtureResponse = await backendJson<FixtureResponse>('/api/platform-tests/fixtures', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          courseId,
          topic,
          resultKey,
          practiceHistory,
          memory: scenario.id === 'memory-review-plan' ? memory : undefined,
        }),
      });
      fixture = fixtureResponse.fixture;
    }

    setPhase('正在调用正式证据化复习计划服务…');
    const scheduleEvents =
      scenario.id === 'memory-review-plan' ? scheduleEventsFromFixtureText(schedule) : [];
    const response = await backendJson<TeachingReviewPlanResponse>('/api/teaching/review-plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        targetType: 'course',
        targetId: courseId,
        query: `围绕「${topic}」制定复习安排，并从真实题库选择 5 道测试题`,
        scheduleEvents,
        constraints: { questionCount: 5, totalMinutes: 45, maxTasks: 4 },
      }),
    });
    const plan = response.decision.output;
    const problems = await listCourseProblemsByIds(
      courseId,
      plan.questionCandidates.map((candidate) => candidate.problemId),
    );
    const questions = plan.questionCandidates.map((candidate) => {
      const problem = problems.find((item) => item.id === candidate.problemId);
      return {
        id: candidate.problemId,
        title: candidate.title,
        type: candidate.type,
        difficulty: candidate.difficulty,
        question: problem ? problemQuestionText(problem) : candidate.title,
        summary: candidate.tags.join('、'),
        sectionTitle: problem?.notebookName || null,
        reason: candidate.reason,
      };
    });

    const input: PlatformFlowInput = {
      topic,
      mockPracticeHistory: needsPracticeFixture ? practiceHistory : undefined,
      mockSchedule: scheduleEvents.length ? schedule : undefined,
      mockQuestionHistory: scenario.id === 'memory-review-plan' ? questionHistory : undefined,
      mockMemory: scenario.id === 'memory-review-plan' ? memory : undefined,
    };
    if (scenario.id !== 'memory-review-plan') {
      await persistRun({
        resultKey,
        input,
        output: {
          kind: 'questions',
          topic,
          selectionSummary: [
            ...plan.rationale,
            fixture
              ? `测试输入层创建了 ${fixture.attemptCount} 条正式作答记录和 ${fixture.memoryCount} 条正式学习记忆。`
              : '',
            questions.length < 5
              ? `当前课程正式题库只能返回 ${questions.length} 道，测试不会从本地样例凑数。`
              : '',
          ]
            .filter(Boolean)
            .join('\n'),
          questions,
        },
        model: 'production:teaching-review-plan',
      });
      return;
    }

    const evidenceById = new Map(
      (response.decision.evidence.items || []).map((item) => [item.id, item] as const),
    );
    await persistRun({
      resultKey,
      input,
      output: {
        kind: 'review-plan',
        title: `围绕「${topic}」的证据化复习计划`,
        learnerSummary: [plan.summary, plan.scheduleSummary, ...plan.rationale]
          .filter(Boolean)
          .join('\n'),
        priorities: response.decision.targetConcepts.slice(0, 6),
        tasks: plan.tasks.map((task) => ({
          title: task.title,
          minutes: task.minutes,
          reason: task.reason,
          evidence: task.evidenceIds.map((id) => {
            const item = evidenceById.get(id);
            return item ? `${item.title}：${item.excerpt || item.reason}` : id;
          }),
          completionSignal: task.problemIds.length
            ? `完成并复盘题目：${task.problemIds.join('、')}`
            : `能独立说明：${task.concepts.join('、')}`,
        })),
      },
      model: 'production:teaching-review-plan',
    });
  };

  const runExplanation = async () => {
    if (scenario.id === 'concept-text-explanation') {
      const controlledContext = buildExplanationTestContext({
        testCase: selectedExplanationTestCase,
        query: topic,
      });
      const evidenceBoundary =
        explanationNoteMode === 'with_extracted_notes'
          ? '优先依据页面上完整展示的模拟提取笔记；每个来自笔记的关键结论要标注对应章节。笔记不足时，必须先说明缺口，再把补充内容标为一般知识。'
          : '本次没有任何笔记上下文。只能依据一般知识讲解，并在结尾明确写出“本次未使用课程笔记”。';
      const question =
        explanationKind === 'concept'
          ? `请对下面的知识点做一份可独立学习的文字讲解：

${topic}

要求：
1. 先用一句话说明学生到底要理解什么，再给直觉模型。
2. 给出准确的定义、成立条件或适用边界；不要只给类比。
3. 给一个能逐步检查的例子。
4. 说明至少一个常见误区及其纠正方法。
5. 最后给一个轻量自检问题，但不要擅自创建练习记录。
6. ${evidenceBoundary}`
          : `请完整讲解下面这道题：

${topic}

要求：
1. 先准确重述题意，列出已知、目标和容易漏掉的条件。
2. 说明选择这个方法的触发信号、为什么适用，以及为什么不优先选其他方法。
3. 给出逐步解答；每一步说明目的和依据，不能跳过关键变形或推理。
4. 给出最终结论，并说明如何检查答案。
5. 列出这道题最常见的错误写法。
6. ${evidenceBoundary}`;

      setPhase(
        explanationNoteMode === 'with_extracted_notes'
          ? '正在把页面展示的模拟笔记提取结果交给正式课程总控讲解器…'
          : '正在以无笔记受控上下文调用正式课程总控讲解器…',
      );
      const result = await askCourseOrchestrator({
        courseId: controlledContext.courseContext.course.id,
        courseName: controlledContext.courseContext.course.name,
        orchestratorAvatarUrl: courseAvatarUrl,
        question,
        courseContext: controlledContext.courseContext,
      });
      if (!result.answer.trim()) throw new Error('正式课程总控没有返回可展示的讲解。');
      const resultKey = createTestResultKey('run');
      await persistRun({
        resultKey,
        input: {
          topic,
          explanationTestId: selectedExplanationTestCase.id,
          explanationKind,
          explanationNoteMode,
          sourceNotebookRunId: controlledContext.sourceNotebook?.runId,
          mockNotebookContent: selectedExplanationTestCase.notebook
            ? selectedExplanationTestCase.notebook.sections
                .map(
                  (section) => `## ${section.title}\n\n${section.summary}\n\n${section.markdown}`,
                )
                .join('\n\n')
            : undefined,
        },
        output: {
          kind: 'explanation',
          explanationKind,
          noteMode: explanationNoteMode,
          title: topic,
          markdown: result.answer,
          sourceNotebook: controlledContext.sourceNotebook,
          contextPages: controlledContext.contextPages,
        },
        model: `${providerId}:${modelId}`,
        summaryMetadata: {
          explanationTestId: selectedExplanationTestCase.id,
          explanationKind,
          explanationNoteMode,
          sourceNotebookRunId: controlledContext.sourceNotebook?.runId || null,
          contextPageCount: controlledContext.contextPages.length,
        },
      });
      return;
    }

    if (!courseId) throw new Error('请先进入一门课程；正式 PPT 讲解链路需要当前课程。');
    const question = `请讲解知识点「${topic}」，并准备一个临时迷你课堂。`;
    setPhase('正在调用正式学习回合路由…');
    const turn = await backendJson<LearnTurnClientResponse>('/api/learn/turn', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...modelHeaders() },
      body: JSON.stringify({
        question,
        courseId,
        courseName,
        hasSyllabus: false,
        progressKnown: false,
      }),
    });
    setPhase('正在调用正式课程总控讲解器…');
    const result = await askCourseOrchestrator({
      courseId,
      courseName,
      orchestratorAvatarUrl: courseAvatarUrl,
      question,
      answererHandoff: answererHandoffFromLearnTurn(turn),
    });
    if (!result.answer.trim()) throw new Error('正式课程总控没有返回可展示的讲解。');
    const resultKey = createTestResultKey('run');
    const lecturePrompt = buildMiniLecturePrompt({
      question,
      answer: result.answer,
      course: { name: courseName || '当前课程' },
    });
    if (!lecturePrompt) throw new Error('正式迷你课堂生成器判定这次回答不适合生成 PPT。');
    const deck = buildMiniLectureDeck(lecturePrompt);
    await persistRun({
      resultKey,
      input: { topic },
      output: {
        kind: 'slides',
        title: deck.title,
        slides: deck.pages.map((page, index) => ({
          title: page.title,
          eyebrow: `第 ${index + 1} 页 · 正式迷你课堂`,
          summary: page.regions[0]?.script || deck.sourceAnswer,
          points: page.regions.map((region) => `${region.label}：${region.script}`),
          callout: page.regions.at(-1)?.script || deck.sourceAnswer,
          visualDirection:
            '使用 /learn 正式迷你课堂的 SVG、四角 marker、spotlight 与 speech actions。',
          imageDataUrl: page.imageDataUrl,
        })),
      },
      model: `${providerId}:${modelId}`,
    });
  };

  const runCurrentFlow = async () => {
    if (running) return;
    setRunning(true);
    setError('');
    setSaveMessage('');
    setPhase('正在准备测试…');
    try {
      if (scenario.id === 'notebook-overview-image' || scenario.id === 'notebook-summary-content') {
        await runSourceIngestFlow();
      } else if (scenario.id === 'calendar-natural-language-crud') {
        await runCalendarMutation();
      } else if (isQuestionScenario(scenario.id)) {
        await runQuestionSourceFlow();
      } else if (scenario.id === 'memory-review-plan') {
        await runReviewPlan();
      } else {
        await runExplanation();
      }
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : '测试运行失败。');
    } finally {
      setRunning(false);
      setPhase('');
    }
  };

  const parseCalendar = async () => {
    if (running) return;
    setRunning(true);
    setError('');
    setSaveMessage('');
    try {
      await parseCalendarFile();
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : '日历文件解析失败。');
    } finally {
      setRunning(false);
      setPhase('');
    }
  };

  const selectedQuestionSourceSample =
    QUESTION_SOURCE_SAMPLES.find((sample) => sample.id === selectedQuestionSampleId) ??
    QUESTION_SOURCE_SAMPLES[2]!;

  const remainingQuestionSourceSamples = QUESTION_SOURCE_SAMPLES.filter(
    (sample) =>
      !runs.some((row) => {
        const payload = payloadFromRow(row);
        return (
          payload?.output.kind === 'questions' &&
          payload.input.problemBankCourseCode === sample.courseCode &&
          payload.input.questionSourceCase === sample.sourceCase
        );
      }),
  );

  const selectQuestionSourceSample = (sample: QuestionSourceSample) => {
    const hasNotes =
      sample.sourceCase === 'empty_with_notes' || sample.sourceCase === 'partial_with_notes';
    setSelectedQuestionSampleId(sample.id);
    setQuestionSourceCase(sample.sourceCase);
    setProblemBankCourseCode(sample.courseCode);
    setTopic(sample.topic);
    setPartialBankSize(sample.partialBankSize ?? 2);
    setMockNotebookContent(hasNotes ? MOCK_NOTEBOOK_CONTENT[sample.courseCode] : '');
    setLiveOutput(null);
    setSelectedRunId(null);
  };

  const runRemainingQuestionSourceTests = async () => {
    if (running || !remainingQuestionSourceSamples.length) return;
    const samples = [...remainingQuestionSourceSamples];
    const failures: string[] = [];
    setRunning(true);
    setError('');
    setSaveMessage('');
    try {
      for (const [index, sample] of samples.entries()) {
        const progress = `${index + 1}/${samples.length}`;
        const hasNotes =
          sample.sourceCase === 'empty_with_notes' || sample.sourceCase === 'partial_with_notes';
        setBatchProgress(progress);
        setSelectedQuestionSampleId(sample.id);
        setQuestionSourceCase(sample.sourceCase);
        setProblemBankCourseCode(sample.courseCode);
        setTopic(sample.topic);
        setPartialBankSize(sample.partialBankSize ?? 2);
        setMockNotebookContent(hasNotes ? MOCK_NOTEBOOK_CONTENT[sample.courseCode] : '');
        setLiveOutput(null);
        setSelectedRunId(null);
        setPhase(`${progress} · ${sample.courseCode} · ${sample.title}`);
        try {
          await runQuestionSourceFlow(sample, progress);
        } catch (batchError) {
          const message = errorMessage(batchError);
          failures.push(`${sample.courseCode} · ${sample.title}：${message}`);
          const requestedCount = requestedQuestionCount;
          await persistRun({
            resultKey: createTestResultKey('run'),
            input: {
              topic: sample.topic,
              questionSourceCase: sample.sourceCase,
              problemBankCourseCode: sample.courseCode,
              requestedQuestionCount: requestedCount,
              partialBankSize: sample.partialBankSize,
              mockNotebookContent: hasNotes ? MOCK_NOTEBOOK_CONTENT[sample.courseCode] : undefined,
            },
            output: {
              kind: 'questions',
              topic: sample.topic,
              selectionSummary: `测试请求失败：${message}`,
              questions: [],
              requestedCount,
              sourceCase: sample.sourceCase,
              courseCode: sample.courseCode,
              existingCount: 0,
              generatedCount: 0,
              invalidExistingCount: 0,
              evaluation: {
                passed: false,
                checks: [
                  {
                    id: 'requested_count',
                    label: '返回题量符合请求',
                    passed: false,
                    detail: `请求 ${requestedCount} 题，但测试请求失败，没有返回题目。`,
                  },
                  {
                    id: 'question_format',
                    label: '题目符合正式数据格式',
                    passed: false,
                    detail: `未获得可校验的题目：${message}`,
                  },
                  {
                    id: 'source_provenance',
                    label: '题源与补题依据可追溯',
                    passed: false,
                    detail: '请求失败，无法完成题源检查。',
                  },
                ],
              },
            },
            summaryMetadata: {
              sourceCase: sample.sourceCase,
              courseCode: sample.courseCode,
              requestedCount,
              returnedCount: 0,
              evaluationPassed: false,
              testError: message,
            },
          });
        }
      }
      setSaveMessage(
        failures.length
          ? `剩余 ${samples.length} 个测试已跑完，其中 ${failures.length} 个需要检查。`
          : `剩余 ${samples.length} 个测试已全部生成并保存。`,
      );
      if (failures.length) setError(failures.join('\n'));
    } finally {
      setBatchProgress('');
      setPhase('');
      setRunning(false);
    }
  };

  const selectExplanationTestCase = (testCase: ExplanationTestCase) => {
    setSelectedExplanationTestId(testCase.id);
    setTopic(testCase.topic);
    setLiveOutput(null);
    setSelectedRunId(null);
    setError('');
  };

  const sidebarPresets = courseTopicPresets.length
    ? courseTopicPresets
    : courseName
      ? [courseName]
      : scenario.id === 'concept-ppt-explanation'
        ? CONCEPT_PRESETS
        : TOPIC_PRESETS;

  return (
    <main className="min-h-screen bg-[#f5f6f8] text-slate-950">
      <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">
        <header className="mb-4 rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <Button asChild variant="ghost" size="sm" className="-ml-3 mb-2 text-slate-500">
                <Link href="/test">
                  <ArrowLeft className="size-4" />
                  返回测试列表
                </Link>
              </Button>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="rounded-md bg-sky-600 font-mono text-white hover:bg-sky-600">
                  第一阶段 · 流程 {String(scenario.order).padStart(2, '0')}
                </Badge>
                <Badge variant="secondary" className="rounded-md">
                  人工验收
                </Badge>
                <Badge
                  variant="outline"
                  className="rounded-md border-emerald-200 bg-emerald-50 text-emerald-800"
                >
                  生产链路
                </Badge>
                <Badge variant="outline" className="max-w-[280px] truncate rounded-md bg-white">
                  {scenario.id === 'notebook-overview-image' ||
                  scenario.id === 'notebook-summary-content'
                    ? scenario.id === 'notebook-overview-image'
                      ? '独立 Cheat Sheet 测试 · 不绑定课程'
                      : '独立 Markdown 测试 · 不写课程'
                    : isQuestionScenario(scenario.id)
                      ? `本地题库：${problemBankCourseCode} · 平台共享测试历史`
                      : scenario.id === 'concept-text-explanation'
                        ? '受控讲解上下文 · 结果仅存浏览器本地'
                        : `当前课程：${courseName || '未选择'}`}
                </Badge>
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                {scenario.title}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{scenario.summary}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="rounded-md bg-white font-mono">
                {loadingHistory ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Archive className="size-3.5" />
                )}
                {loadingHistory ? '读取共享历史…' : `${runs.length} runs`}
              </Badge>
              <Badge variant="outline" className="rounded-md bg-white font-mono">
                <Coins className="size-3.5" />
                {runs.some((run) => {
                  const payload = payloadFromRow(run);
                  return (
                    typeof payload?.costUsd === 'number' || typeof run.summary?.costUsd === 'number'
                  );
                })
                  ? `$${totalCost.toFixed(4)}`
                  : '费用见正式用量日志'}
              </Badge>
              <Badge variant="outline" className="rounded-md bg-white">
                {isQuestionScenario(scenario.id) ? '自动检查题量、格式与题源' : '不自动判定通过'}
              </Badge>
            </div>
          </div>
        </header>

        {isQuestionScenario(scenario.id) && loadingHistory ? (
          <section className="mb-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-5 text-sm text-slate-600 shadow-sm sm:px-6">
            <Loader2 className="size-5 animate-spin text-violet-600" />
            正在读取平台共享测试历史，所有用户会看到同一份结果…
          </section>
        ) : null}

        {isQuestionScenario(scenario.id) &&
        !loadingHistory &&
        questionResultSummary.items.length ? (
          <section
            data-testid="question-source-results-summary"
            className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-950 px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <div className="flex items-center gap-2 text-base font-semibold">
                  <ListChecks className="size-5 text-emerald-300" />
                  全部测试结果
                </div>
                <p className="mt-1 text-sm text-slate-300">
                  所有登录用户读取同一份平台历史；点击任意一项会直接打开完整题目和检查详情。
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge className="rounded-md bg-white text-slate-950 hover:bg-white">
                  已保存 {questionResultSummary.items.length} / {QUESTION_SOURCE_SAMPLES.length}
                </Badge>
                <Badge className="rounded-md bg-emerald-500 text-white hover:bg-emerald-500">
                  通过 {questionResultSummary.passed}
                </Badge>
                {questionResultSummary.needsReview ? (
                  <Badge className="rounded-md bg-rose-500 text-white hover:bg-rose-500">
                    需检查 {questionResultSummary.needsReview}
                  </Badge>
                ) : null}
              </div>
            </div>
            <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
              {questionResultSummary.items.map(({ row, payload, output }) => {
                const passed = output.evaluation?.passed === true;
                const needsReview = output.evaluation?.passed === false;
                return (
                  <button
                    key={row.id}
                    type="button"
                    data-testid={`question-source-result-${row.id}`}
                    onClick={() => chooseRunAndReveal(row)}
                    className={cn(
                      'group rounded-xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm',
                      selectedRun?.id === row.id && !liveOutput
                        ? 'border-violet-300 bg-violet-50 ring-1 ring-violet-100'
                        : needsReview
                          ? 'border-rose-200 bg-rose-50/50 hover:border-rose-300'
                          : 'border-slate-200 bg-white hover:border-slate-300',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="line-clamp-2 text-sm font-semibold leading-5 text-slate-950">
                          {inputSummary(payload)}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span>
                            返回 {output.questions.length} /{' '}
                            {output.requestedCount ?? output.questions.length} 题
                          </span>
                          <span>{formatTime(row.updatedAt)}</span>
                        </div>
                      </div>
                      <span
                        className={cn(
                          'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold',
                          passed ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800',
                        )}
                      >
                        {passed ? (
                          <CheckCircle2 className="size-3.5" />
                        ) : (
                          <XCircle className="size-3.5" />
                        )}
                        {passed ? '通过' : '需检查'}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-1 text-xs font-medium text-violet-700">
                      查看完整结果
                      <ChevronRight className="size-3.5 transition group-hover:translate-x-0.5" />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="h-fit overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]">
            <div className="border-b border-slate-200 px-4 py-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-950">
                    {isFileScenario(scenario.id)
                      ? '上传过的文件'
                      : scenario.id === 'concept-text-explanation'
                        ? '10 个固定测试'
                        : '测试样本'}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {isFileScenario(scenario.id)
                      ? '选择历史文件或新上传'
                      : isQuestionScenario(scenario.id)
                        ? '选择完整条件后直接运行'
                        : scenario.id === 'concept-text-explanation'
                          ? '知识点 5 个 · 题目 5 个'
                          : '切换主题后重新生成'}
                  </div>
                </div>
                {isFileScenario(scenario.id) ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <FilePlus2 className="size-4" />
                    新上传
                  </Button>
                ) : null}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={
                  scenario.id === 'calendar-natural-language-crud'
                    ? '.pdf,application/pdf'
                    : '.pdf,.pptx,.md,.txt,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation'
                }
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  void chooseNewFile(file);
                  event.target.value = '';
                }}
              />
            </div>

            <div className="max-h-[calc(100vh-160px)] overflow-auto p-3">
              {isFileScenario(scenario.id) ? (
                <div className="space-y-2">
                  {selectedFile && !selectedFileId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRunId(null);
                        setLiveOutput(null);
                      }}
                      className="w-full rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-left"
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-sky-700 ring-1 ring-sky-200">
                          <Upload className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-sky-950">
                            {selectedFile.name}
                          </div>
                          <div className="mt-1 text-xs text-sky-700">
                            待运行 · {(selectedFile.size / 1024).toFixed(1)} KB
                          </div>
                        </div>
                      </div>
                    </button>
                  ) : null}
                  {loadingFiles ? (
                    <div className="flex items-center gap-2 px-2 py-6 text-sm text-slate-500">
                      <Loader2 className="size-4 animate-spin" /> 恢复文件历史…
                    </div>
                  ) : localFiles.length ? (
                    localFiles.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => void chooseLocalFile(row)}
                        className={cn(
                          'w-full rounded-xl border px-3 py-3 text-left transition',
                          selectedFileId === row.id && !selectedRunId
                            ? 'border-sky-300 bg-sky-50'
                            : 'border-slate-200 bg-white hover:bg-slate-50',
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                            <Upload className="size-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-slate-900">
                              {row.fileName}
                            </div>
                            <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                              <span>{(row.fileSize / 1024).toFixed(1)} KB</span>
                              <span>{formatTime(row.uploadedAt)}</span>
                            </div>
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 px-3 py-8 text-center text-sm leading-6 text-slate-500">
                      还没有保存到本地的上传文件。
                    </div>
                  )}
                  {!loadingHistory && fileRuns.length ? (
                    <div className="border-t border-slate-200 pt-3">
                      <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        生成历史
                      </div>
                      <div className="space-y-2">
                        {fileRuns.map((row) => {
                          const payload = payloadFromRow(row);
                          if (!payload) return null;
                          return (
                            <div
                              key={row.id}
                              className={cn(
                                'flex w-full items-stretch rounded-xl border text-left transition',
                                selectedRun?.id === row.id && !liveOutput
                                  ? 'border-slate-400 bg-slate-100'
                                  : 'border-slate-200 bg-white hover:bg-slate-50',
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => chooseRun(row)}
                                className="min-w-0 flex-1 px-3 py-3 text-left"
                              >
                                <div className="flex items-start gap-3">
                                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                                    <FileText className="size-4" />
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-semibold text-slate-900">
                                      {payload.input.fileName}
                                    </div>
                                    <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                                      <span>{outputKindLabel(payload.output)}</span>
                                      <span>{formatTime(row.updatedAt)}</span>
                                    </div>
                                  </div>
                                </div>
                              </button>
                              <button
                                type="button"
                                aria-label={`删除 ${payload.input.fileName} 的生成历史`}
                                title="删除生成历史"
                                onClick={() => setPendingDeleteRun(row)}
                                disabled={running || deletingRunId === row.id}
                                className="flex w-10 shrink-0 items-center justify-center rounded-r-xl text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {deletingRunId === row.id ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <Trash2 className="size-4" />
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    {scenario.id === 'concept-text-explanation'
                      ? EXPLANATION_TEST_CASES.map((testCase) => (
                          <button
                            key={testCase.id}
                            type="button"
                            onClick={() => selectExplanationTestCase(testCase)}
                            className={cn(
                              'w-full rounded-xl border px-3 py-3 text-left transition',
                              selectedExplanationTestId === testCase.id
                                ? 'border-violet-300 bg-violet-50 text-violet-950 ring-1 ring-violet-100'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                            )}
                          >
                            <div className="text-sm font-semibold leading-5">{testCase.title}</div>
                            <div className="mt-1 flex items-center justify-between gap-2 text-xs leading-5 text-slate-500">
                              <span>{testCase.description}</span>
                              {testCase.notebook ? (
                                <Badge
                                  variant="outline"
                                  className="shrink-0 rounded-md bg-white px-1.5 py-0 text-[10px] text-violet-700"
                                >
                                  {testCase.notebook.sections.length} 节知识
                                </Badge>
                              ) : null}
                            </div>
                          </button>
                        ))
                      : isQuestionScenario(scenario.id)
                        ? QUESTION_SOURCE_SAMPLES.map((sample) => (
                            <button
                              key={sample.id}
                              type="button"
                              data-testid={`question-source-sample-${sample.id}`}
                              onClick={() => selectQuestionSourceSample(sample)}
                              className={cn(
                                'w-full rounded-xl border px-3 py-3 text-left transition',
                                selectedQuestionSampleId === sample.id
                                  ? 'border-violet-200 bg-violet-50 text-violet-950'
                                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                              )}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-semibold leading-5">
                                  {sample.title}
                                </span>
                                <Badge
                                  variant="outline"
                                  className="shrink-0 rounded-md bg-white font-mono text-[10px]"
                                >
                                  {sample.courseCode}
                                </Badge>
                              </div>
                              <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                                {sample.topic}
                              </div>
                            </button>
                          ))
                        : sidebarPresets.map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => {
                                setTopic(preset);
                                setLiveOutput(null);
                                setSelectedRunId(null);
                              }}
                              className={cn(
                                'w-full rounded-xl border px-3 py-3 text-left text-sm font-medium leading-5 transition',
                                topic === preset
                                  ? 'border-violet-200 bg-violet-50 text-violet-950'
                                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                              )}
                            >
                              {preset}
                            </button>
                          ))}
                  </div>
                  <div className="border-t border-slate-200 pt-3">
                    <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      历史结果
                    </div>
                    <div className="space-y-2">
                      {runs.slice(0, 20).map((row) => {
                        const payload = payloadFromRow(row);
                        if (!payload) return null;
                        const questionEvaluation =
                          payload.output.kind === 'questions' ? payload.output.evaluation : null;
                        return (
                          <div
                            key={row.id}
                            className={cn(
                              'flex w-full items-stretch rounded-xl border text-left transition',
                              selectedRun?.id === row.id && !liveOutput
                                ? 'border-slate-400 bg-slate-100'
                                : 'border-slate-200 bg-white hover:bg-slate-50',
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => chooseRunAndReveal(row)}
                              className="min-w-0 flex-1 px-3 py-3 text-left"
                            >
                              <div className="line-clamp-2 text-sm font-semibold leading-5 text-slate-900">
                                {inputSummary(payload)}
                              </div>
                              <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                                <span className="flex min-w-0 items-center gap-1.5">
                                  <span>{outputKindLabel(payload.output)}</span>
                                  {questionEvaluation ? (
                                    <span
                                      className={cn(
                                        'rounded px-1.5 py-0.5 font-semibold',
                                        questionEvaluation.passed
                                          ? 'bg-emerald-100 text-emerald-700'
                                          : 'bg-rose-100 text-rose-700',
                                      )}
                                    >
                                      {questionEvaluation.passed ? '通过' : '需检查'}
                                    </span>
                                  ) : null}
                                </span>
                                <span>{formatTime(row.updatedAt)}</span>
                              </div>
                            </button>
                            {row.storage !== 'shared' || row.canDelete ? (
                              <button
                                type="button"
                                aria-label={`删除 ${inputSummary(payload)} 的历史结果`}
                                title="删除历史结果"
                                onClick={() => setPendingDeleteRun(row)}
                                disabled={running || deletingRunId === row.id}
                                className="flex w-10 shrink-0 items-center justify-center rounded-r-xl text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {deletingRunId === row.id ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <Trash2 className="size-4" />
                                )}
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </aside>

          <section className="min-w-0 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                <Sparkles className="size-4 text-violet-600" />
                本次测试输入
              </div>

              <div className="mt-4 grid gap-4">
                {scenario.id === 'memory-review-plan' ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                    该独立记忆测试仍会创建正式课程问答与学习记忆；题源路由测试不会进入这里。
                  </div>
                ) : null}
                {scenario.id === 'notebook-overview-image' ||
                scenario.id === 'notebook-summary-content' ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                      <div className="space-y-2">
                        <Label>当前文件</Label>
                        <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                          {selectedFile?.name || '请从左侧新上传或选择历史文件'}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="size-4" /> 选择文件
                      </Button>
                    </div>
                    {scenario.id === 'notebook-overview-image' ? (
                      <>
                        <div className="grid gap-3 rounded-xl border border-violet-200 bg-violet-50/70 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
                          <div className="space-y-2">
                            <Label>queue 测试文件</Label>
                            <Select value={queueTestFilePath} onValueChange={setQueueTestFilePath}>
                              <SelectTrigger className="bg-white">
                                <SelectValue placeholder="选择仓库 queue 中的测试文件" />
                              </SelectTrigger>
                              <SelectContent>
                                {queueTestFiles.map((filePath) => (
                                  <SelectItem key={filePath} value={filePath}>
                                    {filePath}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => void chooseQueueTestFile()}
                            disabled={!queueTestFilePath || running}
                          >
                            <Archive className="size-4" /> 从 queue 载入
                          </Button>
                        </div>
                        <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="cover-title">Cheat Sheet 标题（可选）</Label>
                            <Input
                              id="cover-title"
                              value={coverTitle}
                              onChange={(event) => setCoverTitle(event.target.value)}
                              placeholder="例如：09 Series"
                              maxLength={120}
                            />
                            <p className="text-xs leading-5 text-slate-500">
                              留空时才从文件内容自动提取。
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="cover-course">课程 / 项目（可选）</Label>
                            <Input
                              id="cover-course"
                              value={coverCourseLabel}
                              onChange={(event) => setCoverCourseLabel(event.target.value)}
                              placeholder="例如：MAT 136"
                              maxLength={80}
                            />
                            <p className="text-xs leading-5 text-slate-500">
                              不会默认使用当前页面课程，避免串课。
                            </p>
                          </div>
                          <div className="space-y-2 sm:col-span-2">
                            <Label>资料用途</Label>
                            <Select
                              value={coverUsageProfile}
                              onValueChange={(value) =>
                                setCoverUsageProfile(value as CoverUsageProfile)
                              }
                            >
                              <SelectTrigger className="bg-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="auto">自动识别</SelectItem>
                                <SelectItem value="university_course">大学课程 / 讲义</SelectItem>
                                <SelectItem value="research">科研论文</SelectItem>
                                <SelectItem value="daily_use">日常资料</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor="cover-focus">必须出现在图中的核心短语（可选）</Label>
                            <Textarea
                              id="cover-focus"
                              value={coverFocus}
                              onChange={(event) => setCoverFocus(event.target.value)}
                              placeholder={
                                '每行一个，建议 3-8 个。例如：\n发散判别法\n积分判别法\n比较法\n比值判别法'
                              }
                              maxLength={1200}
                              className="min-h-28 resize-y bg-white"
                            />
                            <p className="text-xs leading-5 text-slate-500">
                              填写后会作为内容重点直接交给图片模型，不再由程序叠字或修正结果。
                            </p>
                          </div>
                        </div>
                        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-800">
                          手动填写的字段优先于 AI 分析。流程只读取文件、准备 Cheat Sheet
                          结构，并调用正式 /api/generate/image；不会创建 Notebook、MarkdownSection
                          或课程记忆。图片与运行历史只保存到浏览器本地库。
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                          <Label>生成路径</Label>
                          <Select
                            value={coverUsageProfile}
                            onValueChange={(value) =>
                              setCoverUsageProfile(value as CoverUsageProfile)
                            }
                          >
                            <SelectTrigger className="bg-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="auto">AI 自动路由（测试路由能力）</SelectItem>
                              <SelectItem value="university_course">课程型笔记</SelectItem>
                              <SelectItem value="research">研究型论文笔记</SelectItem>
                              <SelectItem value="daily_use">日常资料索引</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs leading-5 text-slate-500">
                            自动路由会先让 AI
                            根据原文件给出分类和证据，再调用对应生成器；手动选择用于单独验收某条路径。
                          </p>
                        </div>
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
                          原始文件通过 OpenAI Files API 直接交给正式结构化生成链路；不会创建
                          Notebook、MarkdownSection、课程记忆或题库数据。为避免长请求断线，OpenAI
                          会临时保留后台响应供轮询；平台侧完成结果和运行历史只保存在浏览器本地库。
                        </div>
                      </>
                    )}
                  </>
                ) : null}

                {scenario.id === 'calendar-natural-language-crud' ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                      <div className="space-y-2">
                        <Label>Syllabus PDF</Label>
                        <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                          {selectedFile?.name || '尚未选择 PDF'}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void parseCalendar()}
                        disabled={!selectedFile || running}
                      >
                        {running ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <CalendarDays className="size-4" />
                        )}
                        解析文件生成日历
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="calendar-instruction">自然语言日历操作</Label>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          id="calendar-instruction"
                          value={instruction}
                          onChange={(event) => setInstruction(event.target.value)}
                          placeholder="例如：删除 Test 1，或把周三复习改到周四晚上"
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          onClick={() => void runCurrentFlow()}
                          disabled={running || !instruction.trim()}
                        >
                          {running ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Play className="size-4" />
                          )}
                          执行添加 / 修改 / 删除
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          `下周三晚上添加 45 分钟「${courseName || '当前课程'}」复习`,
                          '把刚才的复习改到周四晚上 7 点',
                          '删除刚才创建的复习日程',
                        ].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setInstruction(preset)}
                            className="rounded-md bg-slate-100 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-200"
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : null}

                {isQuestionScenario(scenario.id) ? (
                  <>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
                      使用仓库内的 MAT136（177 题）或 CSC148（302 题）脱敏题库快照。题库、Mock
                      笔记和 AI
                      补题不会写入课程业务数据；测试结果会写入平台共享历史，所有登录用户一致可见。每次运行先由
                      AI 生成检索词，再做本地混合 RAG；候选题由 AI
                      逐题验收，不合格时会改写检索词并重试，完整轨迹随结果保存。
                    </div>
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                      <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-violet-950">
                            {selectedQuestionSourceSample.title}
                          </span>
                          <Badge variant="outline" className="rounded-md bg-white font-mono">
                            {selectedQuestionSourceSample.courseCode}
                          </Badge>
                          <Badge variant="outline" className="rounded-md bg-white">
                            {questionScenarioHasNotes ? '含 Mock 笔记' : '无笔记'}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-violet-900">{topic}</p>
                        <p className="mt-1 text-xs leading-5 text-violet-700">
                          {questionSourceCase === 'sufficient_bank'
                            ? '使用完整本地题库。'
                            : questionSourceCase.startsWith('empty_')
                              ? '模拟候选题库为空。'
                              : `模拟现有 ${Math.min(partialBankSize, Math.max(0, requestedQuestionCount - 1))} 题，其余缺口交给路由补足。`}
                          {questionScenarioHasNotes
                            ? ' Mock 笔记已随样本带入。'
                            : ' 不提供 Mock 笔记。'}
                        </p>
                      </div>
                      <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                        <Label>请求题量</Label>
                        <Select
                          value={String(requestedQuestionCount)}
                          onValueChange={(value) => {
                            setRequestedQuestionCount(Number(value));
                            setLiveOutput(null);
                            setSelectedRunId(null);
                          }}
                        >
                          <SelectTrigger className="bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 12 }, (_, index) => index + 1).map((count) => (
                              <SelectItem key={count} value={String(count)}>
                                {count} 道
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs leading-5 text-slate-500">
                          其余测试条件由左侧样本固定。
                        </p>
                      </div>
                    </div>
                  </>
                ) : null}

                {scenario.id === 'concept-text-explanation' ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
                      左侧 10 条是完整、固定的测试样本，不需要再用下拉菜单组装条件。
                      “无笔记”不会读取当前课程资料或记忆；“有模拟笔记”只注入本页完整展示的提取知识。
                    </div>

                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <Badge className="rounded-md bg-slate-950 text-white hover:bg-slate-950">
                        {explanationKind === 'concept' ? '知识点讲解' : '题目讲解'}
                      </Badge>
                      <Badge
                        className={cn(
                          'rounded-md',
                          explanationNoteMode === 'with_extracted_notes'
                            ? 'bg-violet-600 text-white hover:bg-violet-600'
                            : 'bg-amber-500 text-white hover:bg-amber-500',
                        )}
                      >
                        {explanationNoteMode === 'with_extracted_notes'
                          ? '有模拟笔记提取'
                          : '无笔记 · 仅一般知识'}
                      </Badge>
                      <span className="text-sm font-semibold text-slate-800">
                        {selectedExplanationTestCase.title}
                      </span>
                    </div>

                    {selectedExplanationTestCase.notebook ? (
                      <section className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/60 p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-violet-950">
                              模拟笔记提取到的知识
                            </div>
                            <div className="mt-1 text-xs leading-5 text-violet-700">
                              {selectedExplanationTestCase.notebook.title} ·{' '}
                              {selectedExplanationTestCase.notebook.fileName}
                            </div>
                          </div>
                          <Badge variant="outline" className="w-fit rounded-md bg-white">
                            {selectedExplanationTestCase.notebook.sections.length} 个提取章节
                          </Badge>
                        </div>
                        <div className="grid gap-3 xl:grid-cols-3">
                          {selectedExplanationTestCase.notebook.sections.map((section, index) => (
                            <article
                              key={section.key}
                              className="rounded-xl border border-violet-100 bg-white p-4"
                            >
                              <div className="flex items-start gap-2">
                                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-violet-100 font-mono text-[11px] font-semibold text-violet-700">
                                  {index + 1}
                                </span>
                                <div className="font-semibold leading-6 text-slate-950">
                                  {section.title}
                                </div>
                              </div>
                              <p className="mt-3 text-sm font-medium leading-6 text-violet-900">
                                {section.summary}
                              </p>
                              <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-slate-600">
                                {section.markdown}
                              </p>
                            </article>
                          ))}
                        </div>
                      </section>
                    ) : (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                        这条测试不注入任何笔记知识，可用于检查讲解是否诚实标注“仅依据一般知识”。
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor={`${scenario.id}-topic`}>
                        {explanationKind === 'problem' ? '完整题面' : '知识点'}
                      </Label>
                      <Textarea
                        id={`${scenario.id}-topic`}
                        value={topic}
                        onChange={(event) => setTopic(event.target.value)}
                        className={cn(
                          'resize-y',
                          explanationKind === 'problem' ? 'min-h-48 font-mono text-sm' : 'min-h-24',
                        )}
                        placeholder={
                          explanationKind === 'problem'
                            ? '粘贴完整题面；不要只写一个无法定位的题目标题。'
                            : '输入要讲解的知识点'
                        }
                      />
                      <p className="text-xs leading-5 text-slate-500">
                        {explanationKind === 'problem'
                          ? '题目讲解会检查题意重述、方法选择、逐步解答、最终结论和答案检查。'
                          : '知识点讲解会检查直觉、准确表述、条件边界、例子、误区和自检。'}
                      </p>
                    </div>
                  </div>
                ) : null}

                {scenario.id === 'concept-ppt-explanation' ? (
                  <div className="space-y-2">
                    <Label htmlFor={`${scenario.id}-topic`}>知识点</Label>
                    <Textarea
                      id={`${scenario.id}-topic`}
                      value={topic}
                      onChange={(event) => setTopic(event.target.value)}
                      className="min-h-24 resize-y"
                    />
                  </div>
                ) : null}

                {scenario.id === 'memory-review-plan' ? (
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="memory-practice">模拟刷题记录</Label>
                      <Textarea
                        id="memory-practice"
                        value={practiceHistory}
                        onChange={(event) => setPracticeHistory(event.target.value)}
                        className="min-h-32 resize-y bg-slate-50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="memory-questions">模拟问答记录</Label>
                      <Textarea
                        id="memory-questions"
                        value={questionHistory}
                        onChange={(event) => setQuestionHistory(event.target.value)}
                        className="min-h-32 resize-y bg-slate-50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="memory-facts">模拟学习记忆</Label>
                      <Textarea
                        id="memory-facts"
                        value={memory}
                        onChange={(event) => setMemory(event.target.value)}
                        className="min-h-32 resize-y bg-slate-50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="memory-schedule">可用时间 / 日程</Label>
                      <Textarea
                        id="memory-schedule"
                        value={schedule}
                        onChange={(event) => setSchedule(event.target.value)}
                        className="min-h-32 resize-y bg-slate-50"
                      />
                    </div>
                  </div>
                ) : null}

                {scenario.id !== 'calendar-natural-language-crud' ? (
                  <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm text-slate-500">
                      {phase ||
                        saveMessage ||
                        (scenario.id === 'notebook-overview-image'
                          ? `文本模型：${providerId}:${modelId} · 图片模型：${NOTEBOOK_OVERVIEW_IMAGE_PROVIDER_ID}:${NOTEBOOK_OVERVIEW_IMAGE_MODEL_ID}`
                          : `当前模型：${providerId}:${modelId}`)}
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      {isQuestionScenario(scenario.id) ? (
                        <Button
                          type="button"
                          size="lg"
                          variant="outline"
                          data-testid="question-source-run-remaining"
                          onClick={() => void runRemainingQuestionSourceTests()}
                          disabled={running || !remainingQuestionSourceSamples.length}
                          className="rounded-xl"
                        >
                          {running && batchProgress ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <ListChecks className="size-4" />
                          )}
                          {running && batchProgress
                            ? `批量测试 ${batchProgress}`
                            : remainingQuestionSourceSamples.length
                              ? `运行剩余 ${remainingQuestionSourceSamples.length} 个测试`
                              : '10 个测试已全部保存'}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="lg"
                        data-testid={
                          isQuestionScenario(scenario.id) ? 'question-source-run' : undefined
                        }
                        onClick={() => void runCurrentFlow()}
                        disabled={
                          running ||
                          (isFileScenario(scenario.id) && !selectedFile) ||
                          (scenario.id === 'concept-text-explanation' &&
                            explanationNoteMode === 'with_extracted_notes' &&
                            !selectedExplanationTestCase.notebook)
                        }
                        className="rounded-xl bg-slate-950 hover:bg-slate-800"
                      >
                        {running ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Sparkles className="size-4" />
                        )}
                        {running ? '生成中' : scenarioActionLabel(scenario.id)}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">{phase || saveMessage}</div>
                )}

                {error ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
                    {error}
                  </div>
                ) : null}
              </div>
            </div>

            <div
              id="platform-flow-result-details"
              className="min-h-[560px] scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
            >
              <div className="mb-5 flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                    {visibleOutput?.kind === 'image' ? (
                      <ImageIcon className="size-4 text-violet-600" />
                    ) : visibleOutput?.kind === 'calendar' ? (
                      <CalendarDays className="size-4 text-sky-600" />
                    ) : visibleOutput?.kind === 'text' || visibleOutput?.kind === 'explanation' ? (
                      <MessageSquareText className="size-4 text-emerald-600" />
                    ) : (
                      <BookOpenCheck className="size-4 text-violet-600" />
                    )}
                    生成结果
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {isQuestionScenario(scenario.id)
                      ? '页面会自动检查题量、正式题目格式与题源；题目内容质量仍需人眼复核。'
                      : '结果只供人眼检查，页面不会自动给出通过或失败结论。'}
                  </p>
                </div>
                {selectedRun && !liveOutput ? (
                  <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-slate-500">
                    {scenario.id === 'notebook-overview-image' &&
                    selectedPayload?.output.kind === 'image' &&
                    selectedRun &&
                    !liveOutput ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void prepareImageRegeneration()}
                        disabled={running}
                        title="恢复原文件和当时的输入；确认后再次生成，会产生新的图片费用"
                      >
                        <RefreshCw className="size-3.5" />
                        重新生成
                      </Button>
                    ) : null}
                    {selectedRun ? (
                      <>
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="size-3" /> {formatTime(selectedRun.updatedAt)}
                        </span>
                        <span className="font-mono">${runCost(selectedRun).toFixed(4)}</span>
                        <ChevronRight className="size-4" />
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {running && !visibleOutput ? (
                <div className="flex min-h-[440px] flex-col items-center justify-center gap-4 text-center">
                  <Loader2 className="size-10 animate-spin text-violet-600" />
                  <div>
                    <div className="font-semibold text-slate-900">{phase || 'AI 正在生成结果'}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      完成后会立即保存，不需要再次付费生成。
                    </div>
                  </div>
                </div>
              ) : visibleOutput ? (
                <PlatformFlowResultPreview output={visibleOutput} />
              ) : (
                <div className="flex min-h-[440px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-8 text-center">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
                    <Sparkles className="size-5" />
                  </span>
                  <div>
                    <div className="font-semibold text-slate-900">还没有可检查的结果</div>
                    <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                      从左侧选择样本或上传文件，设置本次输入后开始生成；以前的付费结果也可以从左侧重新打开。
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
      <DeleteTestRunDialog
        open={Boolean(pendingDeleteRun)}
        runLabel={
          pendingDeletePayload
            ? inputSummary(pendingDeletePayload)
            : pendingDeleteRun?.title || '未命名运行'
        }
        deleting={Boolean(deletingRunId)}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteRun(null);
        }}
        onConfirm={deleteRun}
      />
    </main>
  );
}
