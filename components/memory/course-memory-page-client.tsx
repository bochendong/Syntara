'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { code } from '@streamdown/code';
import { createMathPlugin } from '@streamdown/math';
import {
  BadgeCheck,
  BookOpen,
  Brain,
  ClipboardCheck,
  Database,
  FileText,
  Layers3,
  Loader2,
  Lock,
  MessageSquareText,
  RefreshCw,
  Search,
  Share2,
  Target,
  Workflow,
} from 'lucide-react';
import { Streamdown } from 'streamdown';
import { MemoryListDetailLayout } from '@/components/memory/memory-list-detail-layout';
import { MemoryPageHeader } from '@/components/memory/memory-page-header';
import { getDefaultCoursePublicMemories } from '@/lib/learning/default-public-memories';
import {
  getLocalStudyMemoryUserId,
  loadStudyMemory,
  type NotebookMemoryItem,
  type NotebookMemorySourceReference,
  type WeakPointMemory,
} from '@/lib/learning/study-memory';
import { cn } from '@/lib/utils';
import { backendJson } from '@/lib/utils/backend-api';
import { getCourse } from '@/lib/utils/course-storage';
import type { CourseRecord } from '@/lib/utils/database';
import {
  listCourseProblemSummaries,
  type CourseProblemClientSummary,
} from '@/lib/utils/notebook-problem-api';
import { listStagesByCourse, type StageListItem } from '@/lib/utils/stage-storage';
import { listStudyMemoryRecords, type StudyMemoryApiRecord } from '@/lib/utils/study-memory-api';

type CourseMemoryPageClientProps = {
  courseId: string;
  initialTab?: CourseMemoryTab;
  pageTitle?: string;
  pageEyebrow?: string;
};

type CourseMemoryTab = 'overview' | 'templates' | 'public' | 'private' | 'search';

type PublicMemoryView = {
  id: string;
  title: string;
  text: string;
  sourceLabel: string;
  sourceReferences: NotebookMemorySourceReference[];
  notebookId?: string;
  notebookName?: string;
  updatedAt?: number;
};

type PrivateMemoryView = {
  id: string;
  title: string;
  text: string;
  sourceLabel: string;
  kindLabel: string;
  sourceReferences: NotebookMemorySourceReference[];
  notebookId?: string;
  notebookName?: string;
  updatedAt?: number;
};

type CourseFactView = {
  id: string;
  label: string;
  value: string;
  scope: string;
};

type CourseTemplateView = {
  id: string;
  title: string;
  category: string;
  sourceLabel: string;
  sourceTitle: string;
  notebookName?: string;
  summary: string;
  templateText: string;
  exampleText: string;
  sourceMemoryId: string;
  updatedAt?: number;
};

type NotebookMemoryRecordBundle = {
  notebookId: string;
  memories: StudyMemoryApiRecord[];
};

type NotebookIndexView = {
  notebook: StageListItem;
  publicCount: number;
  privateCount: number;
  weakCount: number;
  sourceCount: number;
  latestTitle?: string;
  updatedAt?: number;
};

type SourceReferenceView = {
  id: string;
  title: string;
  subtitle: string;
  why?: string;
  count: number;
};

type RecallPreviewSection = {
  id: string;
  title: string;
  subtitle: string;
  items: Array<{ id: string; title: string; text: string }>;
};

type MemorySearchIntentView = {
  kind:
    | 'concept'
    | 'problem'
    | 'unattempted_problem'
    | 'weakness_review'
    | 'learner_understanding'
    | 'learning_status'
    | 'learner_questions'
    | 'general';
  originalQuery: string;
  rewrittenQuery: string;
  progressFilter: 'unattempted' | 'wrong_or_partial' | 'attempted' | null;
  knowledgeTypes: string[];
  matchedSignals: string[];
  notes: string[];
  source?: 'ai' | 'fallback';
  plan?: {
    summary: string;
    answerMode: 'explain' | 'list_results' | 'review_weakness' | 'mixed';
    primarySources: string[];
    secondarySources: string[];
    searchQueries: string[];
    filters: {
      progress: 'unattempted' | 'wrong_or_partial' | 'attempted' | null;
      tags: string[];
      notebookHints: string[];
      courseHints: string[];
    };
  };
};

type MemorySearchFact = {
  id: string;
  namespace: string;
  key: string;
  valueJson: unknown;
  scopeType: string;
  scopeId?: string | null;
  source: string;
  validFrom: string;
};

type MemorySearchMemory = {
  id: string;
  title: string;
  text: string;
  scope: 'public' | 'private' | string;
  kind: string;
  source: string;
  targetType: 'course' | 'notebook' | string;
  notebookId?: string | null;
  courseId?: string | null;
  reason?: string | null;
};

type MemorySearchKnowledgeMatch = {
  id: string;
  sourceType: 'problem_bank' | string;
  title: string;
  text: string;
  score: number;
  metadata: {
    courseId: string | null;
    notebookId: string | null;
    problemType: string;
    difficulty: string;
    tags: string[];
    status: string;
    notebookName: string | null;
    attemptStatus: string | null;
    attemptScore: number | null;
    attemptedCount: number;
    lastAttemptAt: string | null;
  };
};

type MemorySearchSourceEvidence = {
  id: string;
  sourceType: 'markdown_section' | 'problem' | 'student_message' | 'problem_attempt' | string;
  title: string;
  originalText: string;
  renderedText: string;
  score: number;
  courseId: string | null;
  notebookId: string | null;
  sourceId: string;
  metadata: Record<string, unknown>;
};

type MemorySearchScope = {
  requestedMode: 'notebook_local' | 'course_wide' | 'auto_expand';
  effectiveMode: 'notebook_local' | 'course_wide';
  expanded: boolean;
  reason: string;
  originalTargetType: 'course' | 'notebook';
  originalTargetId: string;
  effectiveTargetType: 'course' | 'notebook';
  effectiveTargetId: string;
  courseId: string | null;
  notebookId: string | null;
  localEvidenceCount: number;
  courseEvidenceCount: number;
};

type MemorySearchLearnerAnalytics = {
  targetType: 'course' | 'notebook';
  targetId: string;
  timeScope: 'week' | 'month' | 'term' | 'all';
  since: string | null;
  until: string;
  summary: {
    questionCount: number;
    attemptCount: number;
    attemptedProblemCount: number;
    passedCount: number;
    failedCount: number;
    partialCount: number;
    privateMemoryCount: number;
    activeNotebookCount: number;
  };
  messages: Array<{
    id: string;
    notebookName: string | null;
    text: string;
    createdAt: string;
  }>;
  attempts: Array<{
    id: string;
    problemTitle: string;
    notebookName: string | null;
    status: string;
    score: number | null;
    tags: string[];
    createdAt: string;
  }>;
  privateMemories: Array<{
    id: string;
    title: string;
    text: string;
    notebookName: string | null;
    updatedAt: string;
  }>;
  weakTags: Array<{ tag: string; count: number }>;
  activeNotebooks: Array<{ notebookId: string; notebookName: string; count: number }>;
};

type MemorySearchResponse = {
  storage: 'database' | 'unavailable';
  answer: string;
  scope: MemorySearchScope;
  intent: MemorySearchIntentView;
  prompt: string;
  staticFacts: MemorySearchFact[];
  directMemories: MemorySearchMemory[];
  semanticMatches: MemorySearchMemory[];
  knowledgeMatches: MemorySearchKnowledgeMatch[];
  sourceEvidence: MemorySearchSourceEvidence[];
  learnerAnalytics: MemorySearchLearnerAnalytics | null;
  conflicts: unknown[];
  filteredStaleMemoryIds: string[];
  counts: {
    direct: number;
    semantic: number;
    knowledge: number;
    sourceEvidence: number;
    learnerAnalytics: number;
  };
  vectorUsed: boolean;
};

type MemorySearchRunState =
  | { status: 'idle'; query: string; data?: undefined; error?: undefined }
  | { status: 'loading'; query: string; data?: MemorySearchResponse; error?: undefined }
  | { status: 'success'; query: string; data: MemorySearchResponse; error?: undefined }
  | { status: 'error'; query: string; data?: MemorySearchResponse; error: string };

const markdownMath = createMathPlugin({ singleDollarTextMath: true });

function isActive(record: { status?: string | null }) {
  return record.status !== 'archived';
}

function formatTime(value?: number): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function compactText(input: string, maxLength: number): string {
  const text = input
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[#>*|`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function splitMarkdownSections(markdown: string): Array<{ heading: string; body: string }> {
  const headingMatches = [...markdown.matchAll(/^#{2,4}\s+(.+?)\s*$/gm)];
  if (headingMatches.length === 0) return [{ heading: '全文', body: markdown }];

  return headingMatches.map((match, index) => {
    const start = (match.index || 0) + match[0].length;
    const end = headingMatches[index + 1]?.index ?? markdown.length;
    return {
      heading: match[1].trim(),
      body: markdown.slice(start, end).trim(),
    };
  });
}

function sectionBody(sections: Array<{ heading: string; body: string }>, labels: string[]): string {
  const normalizedLabels = labels.map((label) => label.toLowerCase());
  const section = sections.find((item) => {
    const heading = item.heading.toLowerCase();
    return normalizedLabels.some((label) => heading.includes(label));
  });
  return section?.body.trim() || '';
}

function inferTemplateCategory(memory: PublicMemoryView): string {
  const text = `${memory.title}\n${memory.text}`.toLowerCase();
  if (/课程|course/.test(memory.title)) return '课程总模板';
  if (/证明|proof|induction|contradiction|lemma/.test(text)) return '证明模板';
  if (/essay|thesis|quote|close reading|论文|短文|论点/.test(text)) return 'Essay 模板';
  if (/计算|求值|integral|derivative|formula|substitution|simplify/.test(text)) {
    return '计算模板';
  }
  if (/trace|diagram|memory model|state table|求值顺序|画图/.test(text)) {
    return 'Trace / Diagram 模板';
  }
  if (
    /@template|htdf|htdd|racket|function|helper|recursion|fold|map|filter|代码|programming|cpsc|csc/.test(
      text,
    )
  ) {
    return 'Programming / Design 模板';
  }
  if (/case|analysis|compare|对比|案例/.test(text)) return 'Case Analysis 模板';
  return 'Concept Explanation 模板';
}

function cleanedMemoryTitle(title: string): string {
  return title
    .replace(/公共记忆/g, '')
    .replace(/共有记忆/g, '')
    .replace(/课程/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasGenerativeRecursionSignal(text: string): boolean {
  return /generative recursion|\bgenrec\b|generated next|generated problem|next-problems|next states/.test(
    text,
  );
}

function inferTemplateTitle(memory: PublicMemoryView, explicitTitle?: string): string {
  const rawTitle = explicitTitle?.trim() || cleanedMemoryTitle(memory.title);
  const title = memory.title.toLowerCase();
  const text = `${memory.title}\n${memory.text}`.toLowerCase();
  if (explicitTitle) return rawTitle;
  if (/课程|course/.test(memory.title)) return '课程答题总模板';
  if (/abstract functions|abstract|filter|map|build-list|fold/.test(title)) {
    return 'Abstract Function 选择模板';
  }
  if (/tail recursion|accumulator|worklist/.test(title)) {
    return 'Accumulator / Worklist 模板';
  }
  if (/mutual reference|trees|listofnode|tree/.test(title)) return 'Mutual Reference 模板';
  if (/two one-of|2-one-of/.test(title)) return 'Two One-of Cross-product 模板';
  if (/encapsulated|local/.test(title)) return 'Encapsulated Local Helper 模板';
  if (hasGenerativeRecursionSignal(title)) return 'Generative Recursion 模板';
  if (/recursion\/bst|bst/.test(title)) return 'BST Structural Recursion 模板';
  if (/reference\/self-reference|self-reference/.test(title)) {
    return 'Reference / Self-reference 模板';
  }
  if (/racket/.test(title)) return 'Racket 求值与表达式模板';
  if (/htdf|htdd/.test(title) || /htdf\/htdd/.test(text)) return 'HtDF / HtDD 设计配方模板';
  if (/abstract functions|filter|map|build-list|fold/.test(text)) {
    return 'Abstract Function 选择模板';
  }
  if (/tail recursion|accumulator|worklist/.test(text)) {
    return 'Accumulator / Worklist 模板';
  }
  if (/mutual reference|listofnode|tree|trees/.test(text)) return 'Mutual Reference 模板';
  if (/two one-of|2-one-of/.test(text)) return 'Two One-of Cross-product 模板';
  if (/encapsulated|local/.test(text)) return 'Encapsulated Local Helper 模板';
  if (hasGenerativeRecursionSignal(text)) return 'Generative Recursion 模板';
  if (/bst/.test(text)) return 'BST Structural Recursion 模板';
  if (/reference|self-reference/.test(text)) return 'Reference / Self-reference 模板';
  if (/racket/.test(text)) return 'Racket 求值与表达式模板';
  return rawTitle ? `${rawTitle} 模板` : '课程解题模板';
}

function markdownLines(lines: string[]): string {
  return lines.join('\n');
}

function defaultTemplateText(title: string, category: string): string {
  if (title.includes('课程答题总模板')) {
    return markdownLines([
      '1. 判断题型：代码设计、求值、证明、计算、essay、trace，还是概念解释。',
      '2. 选择 1-3 个课程模板，而不是只检索相似文字。',
      '3. 检查本课程限制：已学工具、格式、命名、禁止事项。',
      '4. 按模板输出答案：先给可提交/可检查结果，再解释关键理由。',
      '5. 最后用课程验收清单检查一次。',
    ]);
  }

  if (title.includes('HtDF') || title.includes('HtDD')) {
    return markdownLines([
      '```racket',
      '(@htdf function-name)',
      '(@signature InputType -> OutputType)',
      ';; purpose statement',
      '(check-expect (function-name example-input) expected-output)',
      '',
      '; (define (function-name x) stub-value) ;stub',
      '',
      '(@template-origin <main-template-origin>)',
      '',
      '(define (function-name x)',
      '  ...)',
      '```',
    ]);
  }

  if (title.includes('Abstract Function')) {
    return markdownLines([
      '```racket',
      '(@template-origin use-abstract-fn)',
      '',
      '(define (function-name data)',
      '  (filter predicate data)) ; keep elements',
      '',
      '(define (function-name data)',
      '  (map transformer data)) ; transform each element',
      '',
      '(define (function-name n)',
      '  (build-list n builder)) ; generate from indices',
      '',
      '(define (function-name data)',
      '  (foldr combiner base data)) ; combine into one result',
      '',
      ';; compose more than one abstract function',
      '(@template-origin use-abstract-fn fn-composition)',
      '',
      '(define (function-name data)',
      '  (foldr combiner base',
      '         (map transformer',
      '              (filter predicate data))))',
      '```',
    ]);
  }

  if (title.includes('Accumulator') || title.includes('Worklist')) {
    return markdownLines([
      '```racket',
      '(@template-origin (listof X) accumulator)',
      '',
      '(define (function-name lox0)',
      '  (local [(define (fn-for-lox lox acc)',
      '            ;; acc is ...',
      '            (cond [(empty? lox) acc]',
      '                  [else',
      '                   (fn-for-lox (rest lox)',
      '                               (... (first lox) acc))]))]',
      '    (fn-for-lox lox0 initial-acc)))',
      '```',
    ]);
  }

  if (title.includes('Mutual Reference')) {
    return markdownLines([
      '```racket',
      '(@template-origin Node ListOfNode)',
      '',
      '(define (fn-for--node n)',
      '  (... (node-label n)',
      '       (fn-for--lon (node-children n))))',
      '',
      '(define (fn-for--lon lon)',
      '  (cond [(empty? lon) (...)]',
      '        [else',
      '         (... (fn-for--node (first lon))',
      '              (fn-for--lon (rest lon)))]))',
      '```',
    ]);
  }

  if (title.includes('Two One-of')) {
    return markdownLines([
      '1. 先列出两个 one-of 输入的 cross-product table。',
      '2. 为每个格子写结果。',
      '3. 合并结果相同的格子。',
      '4. 把合并后的格子翻译成 cond 分支。',
      '5. 不要在这个模板里自动加入 local 或 encapsulated。',
      '',
      '|        | B case 1 | B case 2 |',
      '| ------ | -------- | -------- |',
      '| A case 1 | result | result |',
      '| A case 2 | result | result |',
    ]);
  }

  if (title.includes('Encapsulated')) {
    return markdownLines([
      '1. 公开函数保留完整 HtDF 设计，只暴露一个入口。',
      '2. local 中放只服务当前公开函数的 helper。',
      '3. hidden helper 使用课程命名习惯，例如 `function-name--data` 或 `fn-for--data`。',
      '4. 只有题目/source/template 要求封装模板时，`@template-origin` 才加 `encapsulated`。',
      '5. 普通 short local helper 不自动等于 encapsulated template。',
      '',
      '```racket',
      '(@template-origin MainTemplate encapsulated)',
      '',
      '(define (function-name x0)',
      '  (local [(define (function-name--x x)',
      '            ...)]',
      '    (function-name--x x0)))',
      '```',
    ]);
  }

  if (title.includes('Generative Recursion')) {
    return markdownLines([
      '```racket',
      '(@htdf function-name)',
      '',
      '(@template-origin genrec)',
      ';; Termination argument',
      ';; Base Case: <condition that stops recursion>',
      ';; reduction step: <how the recursive problem gets smaller>',
      ';; argument: <why repeated reduction eventually reaches the base case>',
      '',
      '(define (function-name problem)',
      '  (cond [(base-case? problem) (... problem)]',
      '        [else',
      '         (... (function-name (smaller/generated-problem problem)))]))',
      '```',
      '',
      '纯 generative recursion 的重点是递归输入由规则生成，并且必须写 termination argument；failure-result search 还需要 try-catch local result pattern。',
    ]);
  }

  if (title.includes('BST')) {
    return markdownLines([
      '```racket',
      '(define (fn-for-bst t key)',
      '  (cond [(false? t) (...)]',
      '        [(= key (node-key t)) (... t)]',
      '        [(< key (node-key t))',
      '         (fn-for-bst (node-left t) key)]',
      '        [else',
      '         (fn-for-bst (node-right t) key)]))',
      '```',
    ]);
  }

  if (title.includes('Reference / Self-reference')) {
    return markdownLines([
      '先写/读取 HTDD，再从数据定义推模板：',
      '',
      '```racket',
      ';; Y is ...',
      ';; template rule: depends on Y data definition',
      '',
      '(define (fn-for-y y)',
      '  ...)',
      '',
      '(define-struct x (primitive-field y-field))',
      ';; X is (make-x Primitive Y)',
      ';; template rules: compound, ref',
      '',
      '(define (fn-for-x x)',
      '  (... (x-primitive-field x)',
      '       (fn-for-y (x-y-field x))))',
      '',
      ';; ListOfX is one of:',
      ';; - empty',
      ';; - (cons X ListOfX)',
      ';; template rules: one-of, ref, self-ref',
      '',
      '(define (fn-for-lox lox)',
      '  (cond [(empty? lox) (...)]',
      '        [else',
      '         (... (fn-for-x (first lox))',
      '              (fn-for-lox (rest lox)))]))',
      '```',
    ]);
  }

  if (title.includes('Racket')) {
    return markdownLines([
      '1. 找 operator。',
      '2. 找 operands。',
      '3. 按 DrRacket 规则先把需要求值的 operand 化成 value。',
      '4. 应用 operator。',
      '5. 对 if/cond，只继续被选中的 branch。',
    ]);
  }

  if (category === '证明模板') {
    return markdownLines([
      '1. Claim：明确要证明什么。',
      '2. Given：列出已知条件和定义。',
      '3. Strategy：选择直接证明、反证、归纳或分情况。',
      '4. Steps：每一步引用定义、定理或前一步结果。',
      '5. Conclusion：回扣原命题。',
    ]);
  }

  if (category === '计算模板') {
    return markdownLines([
      '1. Identify：识别题型和可用公式。',
      '2. Set up：写出代入前的表达式。',
      '3. Substitute：代入已知量。',
      '4. Simplify：逐步化简。',
      '5. Check：检查单位、定义域、符号或边界条件。',
    ]);
  }

  if (category === 'Essay 模板') {
    return markdownLines([
      '1. Thesis：一句话回答题目。',
      '2. Evidence：引用文本、案例或课程概念。',
      '3. Analysis：解释证据为什么支持 thesis。',
      '4. Counterpoint：必要时处理反例或限制。',
      '5. Closing：回到题目，不另起新话题。',
    ]);
  }

  return markdownLines([
    '1. Definition：先给准确概念。',
    '2. Intuition：用一句话解释它在解决什么问题。',
    '3. Example：给一个短例子。',
    '4. Non-example：指出一个容易混淆但不属于它的情况。',
    '5. Check：给学生一个判断问题。',
  ]);
}

function defaultExampleText(title: string, category: string): string {
  if (title.includes('课程答题总模板')) {
    return '学生问“这个函数怎么设计”时，先识别为代码设计题，再选择 HtDF + 对应数据模板；如果题目来自第 07 章，再检查是否应该用 `use-abstract-fn`。';
  }

  if (title.includes('HtDF') || title.includes('HtDD')) {
    return markdownLines([
      '```racket',
      '(@htdf double)',
      '(@signature Number -> Number)',
      ';; produce n doubled',
      '(check-expect (double 3) 6)',
      '',
      '; (define (double n) 0) ;stub',
      '',
      '(@template-origin Number)',
      '',
      '(define (double n)',
      '  (* 2 n))',
      '```',
    ]);
  }

  if (title.includes('Abstract Function')) {
    return markdownLines([
      '```racket',
      '(@template-origin use-abstract-fn)',
      '',
      '(define (positives lon)',
      '  (filter positive? lon))',
      '```',
      '',
      '函数组合例子：',
      '',
      '```racket',
      '(@template-origin use-abstract-fn fn-composition)',
      '',
      '(define (sum-positive-doubles lon)',
      '  (foldr + 0',
      '         (map (lambda (n) (* 2 n))',
      '              (filter positive? lon))))',
      '```',
    ]);
  }

  if (title.includes('Accumulator') || title.includes('Worklist')) {
    return markdownLines([
      '```racket',
      '(define (sum lon0)',
      '  (local [(define (sum--lon lon acc)',
      '            ;; acc is the sum of numbers already seen',
      '            (cond [(empty? lon) acc]',
      '                  [else',
      '                   (sum--lon (rest lon)',
      '                              (+ (first lon) acc))]))]',
      '    (sum--lon lon0 0)))',
      '```',
    ]);
  }

  if (title.includes('Mutual Reference')) {
    return markdownLines([
      '```racket',
      '(define (count--node n)',
      '  (+ 1 (count--lon (node-children n))))',
      '',
      '(define (count--lon lon)',
      '  (cond [(empty? lon) 0]',
      '        [else',
      '         (+ (count--node (first lon))',
      '            (count--lon (rest lon)))]))',
      '```',
    ]);
  }

  if (title.includes('Two One-of')) {
    return '如果两个输入都是 one-of，先画表：行是第一个输入的 cases，列是第二个输入的 cases。比如 traffic-light + traffic-light，可以先填 3x3 表，再把结果相同的格子合并成 cond 分支。';
  }

  if (title.includes('Encapsulated')) {
    return markdownLines([
      '```racket',
      '(@template-origin Node ListOfNode encapsulated)',
      '',
      '(define (count-nodes n0)',
      '  (local [(define (count-nodes--node n)',
      '            (+ 1 (count-nodes--lon (node-children n))))',
      '',
      '          (define (count-nodes--lon lon)',
      '            (cond [(empty? lon) 0]',
      '                  [else',
      '                   (+ (count-nodes--node (first lon))',
      '                      (count-nodes--lon (rest lon)))]))]',
      '    (count-nodes--node n0)))',
      '```',
    ]);
  }

  if (title.includes('Generative Recursion')) {
    return markdownLines([
      '```racket',
      '(@htdf escher-square)',
      '',
      '(@template-origin genrec)',
      ';; Termination argument',
      ';; Base Case: l <= CUTOFF',
      ';; reduction step: l / 2',
      ';; argument: since CUTOFF > 0, repeatedly dividing by 2 will',
      ';;           eventually be <= CUTOFF',
      '',
      '(define (escher-square l)',
      '  (local [(define (draw-piece l)',
      '            (above (beside (one-quarter l)',
      '                           (rotate 90 (one-quarter l)))',
      '                   (beside (rotate 90 (one-quarter l))',
      '                           (one-quarter l))))]',
      '    (cond [(<= l CUTOFF) (draw-piece l)]',
      '          [else',
      '           (overlay (escher-square (/ l 2))',
      '                    (draw-piece l))])))',
      '```',
    ]);
  }

  if (title.includes('BST')) {
    return '查找 key=7 时，如果当前节点 key=10，只需要去 left subtree；不用同时搜索左右两边，因为 BST invariant 已经排除了右边。';
  }

  if (title.includes('Reference / Self-reference')) {
    return markdownLines([
      '来自第 03 本原文的 `Gift` / `Package` 和 `ListOfGift` 例子：',
      '',
      '```racket',
      '(define-struct gift (name price))',
      ';; Gift is (make-gift String Number)',
      '',
      '(define-struct package (label content))',
      ';; Package is (make-package String Gift)',
      '',
      '(define (fn-for-package p)',
      '  (... (package-label p)',
      '       (fn-for-gift (package-content p))))',
      '',
      ';; ListOfGift is one of:',
      ';; - empty',
      ';; - (cons Gift ListOfGift)',
      '',
      '(define (fn-for-log log)',
      '  (cond [(empty? log) (...)]',
      '        [else',
      '         (... (fn-for-gift (first log))',
      '              (fn-for-log (rest log)))]))',
      '```',
      '',
      '`Package.content` 是 `Gift`，所以是 reference/helper call；`ListOfGift.rest` 还是 `ListOfGift`，所以是 self-reference/recursive call。',
    ]);
  }

  if (title.includes('Racket')) {
    return '例：`(+ (* 2 3) 4)` 先算 `(* 2 3)` 得到 `6`，再算 `(+ 6 4)` 得到 `10`。';
  }

  if (category === '证明模板') {
    return '证明“两个偶数之和是偶数”：设 `a=2m`，`b=2n`，则 `a+b=2(m+n)`，所以仍然是偶数。';
  }

  if (category === '计算模板') {
    return '积分计算题先识别可用公式，再写 setup，例如 `∫2x dx = x^2 + C`，最后检查求导是否回到 `2x`。';
  }

  if (category === 'Essay 模板') {
    return '题目问某段文本如何表现 alienation：先给 thesis，再引用一个短句，分析 diction 或 image 如何支持 thesis。';
  }

  return '解释 recursion 时，可以先定义“函数调用自己处理更小问题”，再用 ListOf 的 empty/cons 例子说明。';
}

function templateSectionText(
  sections: Array<{ heading: string; body: string }>,
  labels: string[],
): string {
  return sectionBody(sections, labels).trim();
}

function buildTemplateView(
  memory: PublicMemoryView,
  index: number,
  explicit?: { title: string; body: string },
): CourseTemplateView {
  const sourceText = explicit?.body || memory.text;
  const sections = splitMarkdownSections(sourceText);
  const core = sectionBody(sections, ['核心概念', '解题步骤', 'steps', 'procedure', '课程主线']);
  const summarySource = core || sourceText;
  const title = inferTemplateTitle(memory, explicit?.title);
  const category = inferTemplateCategory(memory);
  const templateText =
    templateSectionText(sections, [
      '可套用模板',
      '模板骨架',
      '模板',
      'template',
      'output contract',
    ]) || defaultTemplateText(title, category);
  const exampleText =
    templateSectionText(sections, ['例子', '示例', 'example']) ||
    defaultExampleText(title, category);

  return {
    id: `${memory.id}:template:${index}`,
    title,
    category,
    sourceLabel: memory.sourceLabel,
    sourceTitle: memory.title,
    notebookName: memory.notebookName,
    summary: summarySource.trim(),
    templateText,
    exampleText,
    sourceMemoryId: memory.id,
    updatedAt: memory.updatedAt,
  };
}

function explicitTemplateBlocks(memory: PublicMemoryView): Array<{ title: string; body: string }> {
  return splitMarkdownSections(memory.text)
    .map((section) => {
      const match = section.heading.match(/^(?:template|模板)\s*[:：-]?\s*(.+)?$/i);
      if (!match) return null;
      return {
        title: match[1]?.trim() || cleanedMemoryTitle(memory.title),
        body: section.body,
      };
    })
    .filter((block): block is { title: string; body: string } => Boolean(block));
}

function inferredTemplateBlocks(memory: PublicMemoryView): Array<{ title: string; body: string }> {
  const text = `${memory.title}\n${memory.text}`.toLowerCase();
  if (/two one-of|2-one-of/.test(text) && /encapsulated|local/.test(text)) {
    return [
      {
        title: 'Two One-of Cross-product 模板',
        body: memory.text,
      },
      {
        title: 'Encapsulated Local Helper 模板',
        body: memory.text,
      },
    ];
  }
  if (hasGenerativeRecursionSignal(text)) {
    return [
      {
        title: 'Generative Recursion 模板',
        body: memory.text,
      },
    ];
  }
  return [];
}

function collectCourseTemplates(memories: PublicMemoryView[]): CourseTemplateView[] {
  const templates = memories.flatMap((memory) => {
    const explicitBlocks = explicitTemplateBlocks(memory);
    if (explicitBlocks.length > 0) {
      return explicitBlocks.map((block, index) => buildTemplateView(memory, index, block));
    }
    const inferredBlocks = inferredTemplateBlocks(memory);
    if (inferredBlocks.length > 0) {
      return inferredBlocks.map((block, index) => buildTemplateView(memory, index, block));
    }
    return [buildTemplateView(memory, 0)];
  });

  return templates.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function courseTemplateDedupeKey(template: CourseTemplateView): string {
  return `${template.category.trim().toLowerCase()}::${template.title.trim().toLowerCase()}`;
}

function courseTemplateMergeScore(template: CourseTemplateView): number {
  const sourceText = `${template.sourceTitle} ${template.notebookName || ''}`.toLowerCase();
  let score = template.templateText.length + template.exampleText.length;

  if (template.sourceLabel === '课程模板库') score += 20_000;
  if (template.sourceTitle.includes('手工总结模板')) score += 10_000;

  if (template.title.includes('Generative Recursion')) {
    if (/search|generative recursion|backtracking/.test(sourceText)) score += 4_000;
    if (/htdf|htdd/.test(sourceText)) score -= 1_000;
  }

  return score;
}

function mergeDuplicateCourseTemplates(templates: CourseTemplateView[]): CourseTemplateView[] {
  const groups = new Map<string, CourseTemplateView[]>();
  const orderedKeys: string[] = [];

  for (const template of templates) {
    const key = courseTemplateDedupeKey(template);
    const group = groups.get(key);
    if (group) {
      group.push(template);
    } else {
      groups.set(key, [template]);
      orderedKeys.push(key);
    }
  }

  return orderedKeys.map((key) => {
    const group = groups.get(key) || [];
    if (group.length <= 1) return group[0];

    const sortedGroup = [...group].sort((a, b) => {
      const scoreDelta = courseTemplateMergeScore(b) - courseTemplateMergeScore(a);
      if (scoreDelta !== 0) return scoreDelta;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
    const primary = sortedGroup[0];
    const sourceTitles = Array.from(new Set(group.map((item) => item.sourceTitle).filter(Boolean)));
    const sourceNote = sourceTitles.length > 1 ? `合并来源：${sourceTitles.join('、')}` : undefined;

    return {
      ...primary,
      sourceTitle: sourceTitles.length > 1 ? '多个来源' : primary.sourceTitle,
      summary:
        sourceNote && !primary.summary.includes(sourceNote)
          ? `${primary.summary.trim()}\n\n${sourceNote}`
          : primary.summary,
      updatedAt: Math.max(...group.map((item) => item.updatedAt || 0)) || primary.updatedAt,
    };
  });
}

function isCpscGraphTemplateCourse(course: CourseRecord, notebooks: StageListItem[]): boolean {
  const haystack = [
    course.name,
    course.courseCode,
    course.description,
    ...(course.tags || []),
    ...notebooks.flatMap((notebook) => [
      notebook.name,
      notebook.description,
      ...(notebook.tags || []),
    ]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return /\bcpsc\s*10[789]\b|\bcpsc\s*110\b|\bcpsc107\b|\bcpsc110\b|htdf|htdd|@template-origin|racket/.test(
    haystack,
  );
}

function manualCpscGraphTemplates(
  course: CourseRecord | null | undefined,
  notebooks: StageListItem[],
): CourseTemplateView[] {
  if (!course || !isCpscGraphTemplateCourse(course, notebooks)) return [];

  const base = {
    category: 'Programming / Design 模板',
    sourceLabel: '课程模板库',
    sourceTitle: 'Graph traversal 手工总结模板',
    sourceMemoryId: 'manual:cpsc-graph-templates',
  };

  return [
    {
      ...base,
      id: 'manual:cpsc-structural-try-catch-encapsulated',
      title: 'Structural Try-Catch / Encapsulated 模板',
      sourceTitle: 'Local/Encapsulated try-catch 手工总结模板',
      summary:
        '结构化互递归 search：公开函数封装 Person/ListOfPerson helper；单个节点失败后进入 children list；list helper 用 local try 保存第一次尝试，失败才继续 rest。',
      templateText: markdownLines([
        '什么时候这样写：题目给的是 structural tree / family / nested data，不是 graph genrec；函数要返回一个真实答案或 `false`，并且 list-of helper 要一个个尝试，某个分支成功就立刻返回。',
        '',
        '这不是 JS/Python 的 exception try/catch；`try` 只是 local variable，用来保存第一次 recursive attempt 的结果。',
        '',
        '```racket',
        '(@template-origin Person ListOfPerson try-catch encapsulated)',
        '',
        '(define (find n0 p0)',
        '  (local [(define (find--person n p)',
        '            (if (string=? (person-name p) n)',
        '                (person-age p)',
        '                (find--lop n (person-kids p))))',
        '',
        '          (define (find--lop n lop)',
        '            (cond [(empty? lop) false]',
        '                  [else',
        '                   (local [(define try',
        '                             (find--person n (first lop)))]',
        '                     (if (not (false? try))',
        '                         try',
        '                         (find--lop n (rest lop))))]))]',
        '    (find--person n0 p0)))',
        '```',
        '',
        '删减规则：如果失败结果不是 `false`，就把 `false?` 和 empty case 改成题面指定的 failure value；如果 helper 不被封装在一个公开入口里，就不要写 `encapsulated`。',
      ]),
      exampleText: markdownLines([
        '例子：在 family tree 里按名字找年龄。',
        '',
        '```racket',
        ';; Person has name, age, and kids',
        ';; ListOfPerson is one of:',
        ';; - empty',
        ';; - (cons Person ListOfPerson)',
        '',
        ';; find--person : String Person -> Natural or false',
        ';; find--lop    : String ListOfPerson -> Natural or false',
        '',
        ';; find--person 先检查当前 person。',
        ';; 如果当前 person 不是目标，就交给 find--lop 搜索 kids。',
        ';; find--lop 对 first child 做一次 try。',
        ';; try 成功就返回；try 是 false 才继续 rest。',
        '```',
        '',
        '检查 `@template-origin`：`Person ListOfPerson` 来自互相递归数据模板；`try-catch` 来自 first-success/failure-result 搜索；`encapsulated` 来自 helper pair 被藏在公开 `find` 里面。',
      ]),
    },
    {
      ...base,
      id: 'manual:cpsc-graph-normal-recursion',
      title: 'Graph Natural Recursion / No Worklist 模板',
      summary:
        'Graph natural recursion：用课程源模板的 fn-for-node / fn-for-lonn；generate-node 把 node number 生成 Node，递归不是 tail position。',
      templateText: markdownLines([
        '什么时候这样写：题目给 Map / Node / generate-node 这类 opaque graph 数据，并要求使用 normal/natural recursion 模板，而不是 tail-recursive worklist。',
        '',
        '```racket',
        '(@template-origin genrec arb-tree accumulator)',
        '',
        '#;',
        '(define (fn-for-graph/nr map num0)',
        '  (local [(define (fn-for-node n)',
        '            (local [(define num (node-number n))',
        '                    (define nexts (node-nexts n))]',
        '              (cond [(...) (...)] ;stop cycles',
        '                  [else',
        '                   (fn-for-lonn nexts)])))',
        '',
        '          (define (fn-for-lonn lonn)',
        '            (cond [(empty? lonn) (...)]',
        '                  [else',
        '                   (... (first lonn)',
        '                        (fn-for-node (generate-node map (first lonn)))',
        '                        (fn-for-lonn (rest lonn)))]))]',
        '',
        '    (fn-for-? ...num0)))',
        '```',
        '',
        '课程约束：如果题目给了这个模板，不要改 local function 名 `fn-for-node` / `fn-for-lonn`，也不要改参数名；可以按题意加额外参数，例如 visited、path、ans。',
      ]),
      exampleText: markdownLines([
        '普通递归版本常见用途：对当前 node 递归处理 nexts，recursive result 回来后还要 combine，所以不是 tail recursion。',
        '',
        '```racket',
        '(define (fn-for-lonn lonn visited ans)',
        '  (cond [(empty? lonn) ans]',
        '        [else',
        '         (... (first lonn)',
        '              (fn-for-node (generate-node map (first lonn)) visited ans)',
        '              (fn-for-lonn (rest lonn) visited ans))]))',
        '```',
        '',
        '如果题目要求 tail recursion 或 worklist，就不要用这个 nr 模板，改用 `fn-for-graph/tr`。',
      ]),
    },
    {
      ...base,
      id: 'manual:cpsc-graph-tail-recursion',
      title: 'Graph Worklist / Tail Recursion 模板',
      summary:
        'Tail-recursive graph traversal：课程源模板用 nn-wl 表示 node number worklist；需要 path 时加 path-wl 这类 tandem worklist。',
      templateText: markdownLines([
        '什么时候这样写：题目明确要求 tail recursion，或要求使用 source 中的 `fn-for-graph/tr` 模板。worklist 命名按课程源材料写成 `nn-wl`、`path-wl`、`state-wl` 这类 `-wl` 名字。',
        '',
        '```racket',
        '(@template-origin genrec arb-tree accumulator)',
        '',
        '#;',
        '(define (fn-for-graph/tr map num0)',
        '  ;; nn-wl is (listof Natural); node number worklist',
        '  ;; fn-for-node adds the unvisited direct subs of n',
        '  ;; fn-for-lonn takes node numbers off one at a time to call fn-for-node',
        '  (local [(define (fn-for-node n nn-wl)',
        '            (local [(define num (node-number n))',
        '                    (define nexts (node-nexts n))]',
        '              (cond [(...) (...)] ;stop cycles',
        '                    [else',
        '                     (fn-for-lonn (append nexts nn-wl))])))',
        '',
        '          (define (fn-for-lonn nn-wl visited)',
        '            (cond [(empty? nn-wl) (...)]',
        '                  [else',
        '                   (fn-for-node (generate-node map (first nn-wl))',
        '                                (rest nn-wl))]))]',
        '',
        '    (fn-for-? ...num0)))',
        '```',
        '',
        '课程约束：必须保留 local function 名 `fn-for-node` / `fn-for-lonn` 和原参数名；可以加参数，例如 `visited`、`path-wl`、`ans`。如果加 tandem worklist，名字写 `path-wl` 这类 `-wl`。',
      ]),
      exampleText: markdownLines([
        '带 tandem worklists 的常见写法，注意全都用 `-wl` 命名：',
        '',
        '```racket',
        '(@template-origin genrec arb-tree accumulator)',
        '',
        ';; state-wl is (listof Natural); primary worklist',
        ';; path-wl is (listof (listof String)); tandem worklist',
        ';; INVARIANT: state-wl and path-wl always have the same length',
        '',
        '(define (fn-for-state state path visited state-wl path-wl ans)',
        '  (local [(define neighbours (node-nexts (generate-node map state)))',
        '          (define npath (append path (list state)))]',
        '    (if (member? state visited)',
        '        (fn-for-lonn state-wl path-wl visited ans)',
        '        (fn-for-lonn (append neighbours state-wl)',
        '                     (append (make-list (length neighbours) npath) path-wl)',
        '                     (cons state visited)',
        '                     (update-ans state ans)))))',
        '```',
        '',
        '如果题目规定 helper 必须叫 `fn-for-node` / `fn-for-lonn`，示例里的 `fn-for-state` 要改回题面模板名。',
      ]),
    },
    {
      ...base,
      id: 'manual:cpsc-graph-map',
      title: 'Graph + map / Generated Neighbors 模板',
      summary:
        'Graph traversal 中用 map 批量生成邻居、边结构或 tandem worklist 元素时，主模板除了 genrec/accumulator，还要标记 use-abstract-fn。',
      templateText: markdownLines([
        '什么时候这样写：graph step 里用 `map` 生成 next nodes / next states / path copies，而这个 `map` 是主算法的一部分。',
        '',
        '```racket',
        '(@template-origin genrec arb-tree accumulator use-abstract-fn)',
        '',
        '(define (traverse-graph start graph)',
        '  ;; nn-wl is (listof Natural); node number worklist',
        '  ;; path-wl is (listof Path), tandem with nn-wl',
        '  (local [(define (fn-for-node n path nn-wl path-wl visited rsf)',
        '            (local [(define next-names (node-nexts n))',
        '                    (define next-paths',
        '                      (map (lambda (name) (cons name path))',
        '                           next-names))]',
        '              (fn-for-lonn (append next-names nn-wl)',
        '                           (append next-paths path-wl)',
        '                           visited',
        '                           rsf)))',
        '',
        '          (define (fn-for-lonn nn-wl path-wl visited rsf)',
        '            (cond [(empty? nn-wl) rsf]',
        '                  [else',
        '                   (fn-for-node (generate-node graph (first nn-wl))',
        '                                (first path-wl)',
        '                                (rest nn-wl)',
        '                                (rest path-wl)',
        '                                visited',
        '                                rsf)]))]',
        '    (fn-for-lonn (list start)',
        '                 (list empty)',
        '                 empty',
        '                 initial-rsf)))',
        '```',
        '',
        '如果 `map` 只藏在老师给的 primitive/helper 里，比如 `get-room` 内部把 raw edge data 变成 Stairs，通常不把 `use-abstract-fn` 写进你主函数的 `@template-origin`。',
      ]),
      exampleText: markdownLines([
        '典型 `map` 位置有两个：',
        '',
        '```racket',
        ';; 1. primitive/generator 内部：通常不算主函数 template-origin',
        '(make-room (first entry)',
        '           (map (lambda (args)',
        '                  (make-stairs ...))',
        '                (second entry)))',
        '',
        ';; 2. 主 traversal 内部生成 tandem path-wl：要加 use-abstract-fn',
        '(define next-paths',
        '  (map (lambda (name) (cons name path)) next-names))',
        '```',
      ]),
    },
  ];
}

function sourceReferencesFromApi(record: StudyMemoryApiRecord): NotebookMemorySourceReference[] {
  if (!Array.isArray(record.sourceReferences)) return [];
  const references: NotebookMemorySourceReference[] = [];

  for (const source of record.sourceReferences) {
    if (!source || typeof source !== 'object') continue;
    const raw = source as Record<string, unknown>;
    const order = Number(raw.order);
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (!Number.isFinite(order) || !title) continue;
    references.push({
      notebookId: typeof raw.notebookId === 'string' ? raw.notebookId : undefined,
      notebookName: typeof raw.notebookName === 'string' ? raw.notebookName : undefined,
      order,
      title,
      why: typeof raw.why === 'string' ? raw.why : undefined,
    });
  }

  return references;
}

function apiMemorySourceLabel(record: StudyMemoryApiRecord): string {
  if (record.source === 'notebook_generation') return '数据库生成记忆';
  if (record.source === 'manual_queue_rewrite') return '数据库课程重写';
  if (record.source === 'manual') return '数据库手动记忆';
  return '数据库记忆';
}

function memoryKindLabel(memory: NotebookMemoryItem): string {
  if (memory.kind === 'mistake') return '错题';
  if (memory.kind === 'preference') return '偏好';
  if (memory.kind === 'reflection') return '反思';
  if (memory.kind === 'manual') return '手动';
  return '知识缺口';
}

function apiMemoryKindLabel(record: StudyMemoryApiRecord): string {
  if (record.kind === 'mistake') return '错题';
  if (record.kind === 'preference') return '偏好';
  if (record.kind === 'reflection') return '反思';
  if (record.kind === 'manual') return '手动';
  return record.kind || '记忆';
}

function localPrivateSourceLabel(memory: NotebookMemoryItem): string {
  if (memory.source === 'notebook_generation') return '生成记忆';
  if (memory.source === 'manual') return '手动记忆';
  if (memory.source === 'quiz') return '题库记忆';
  return '聊天记忆';
}

function apiPublicMemory(record: StudyMemoryApiRecord): PublicMemoryView {
  return {
    id: `db:${record.id}`,
    title: record.title,
    text: record.text,
    sourceLabel: apiMemorySourceLabel(record),
    sourceReferences: sourceReferencesFromApi(record),
    updatedAt: Date.parse(record.updatedAt),
  };
}

function defaultPublicMemory(memory: NotebookMemoryItem): PublicMemoryView {
  return {
    id: `default:${memory.id}`,
    title: memory.title,
    text: memory.text,
    sourceLabel: '默认课程记忆',
    sourceReferences: memory.sourceReferences || [],
    updatedAt: memory.updatedAt,
  };
}

function notebookPublicMemory(
  notebook: StageListItem,
  memory: NotebookMemoryItem,
): PublicMemoryView {
  return {
    id: `notebook:${notebook.id}:${memory.id}`,
    title: memory.title,
    text: memory.text,
    sourceLabel: '笔记本公共记忆',
    sourceReferences: (memory.sourceReferences || []).map((source) => ({
      ...source,
      notebookId: source.notebookId || notebook.id,
      notebookName: source.notebookName || notebook.name,
    })),
    notebookId: notebook.id,
    notebookName: notebook.name,
    updatedAt: memory.updatedAt,
  };
}

function notebookApiPublicMemory(
  notebook: StageListItem,
  record: StudyMemoryApiRecord,
): PublicMemoryView {
  return {
    id: `db-notebook:${notebook.id}:${record.id}`,
    title: record.title,
    text: record.text,
    sourceLabel: apiMemorySourceLabel(record),
    sourceReferences: sourceReferencesFromApi(record).map((source) => ({
      ...source,
      notebookId: source.notebookId || notebook.id,
      notebookName: source.notebookName || notebook.name,
    })),
    notebookId: notebook.id,
    notebookName: notebook.name,
    updatedAt: Date.parse(record.updatedAt),
  };
}

function apiPrivateMemory(record: StudyMemoryApiRecord): PrivateMemoryView {
  return {
    id: `db:${record.id}`,
    title: record.title,
    text: record.text,
    sourceLabel: '数据库课程私有记忆',
    kindLabel: apiMemoryKindLabel(record),
    sourceReferences: sourceReferencesFromApi(record),
    updatedAt: Date.parse(record.updatedAt),
  };
}

function notebookApiPrivateMemory(
  notebook: StageListItem,
  record: StudyMemoryApiRecord,
): PrivateMemoryView {
  return {
    id: `db-notebook-private:${notebook.id}:${record.id}`,
    title: record.title,
    text: record.text,
    sourceLabel: '数据库笔记本私有记忆',
    kindLabel: apiMemoryKindLabel(record),
    sourceReferences: sourceReferencesFromApi(record),
    notebookId: notebook.id,
    notebookName: notebook.name,
    updatedAt: Date.parse(record.updatedAt),
  };
}

function notebookPrivateMemory(
  notebook: StageListItem,
  memory: NotebookMemoryItem,
): PrivateMemoryView {
  return {
    id: `private:${notebook.id}:${memory.id}`,
    title: memory.title,
    text: memory.text,
    sourceLabel: localPrivateSourceLabel(memory),
    kindLabel: memoryKindLabel(memory),
    sourceReferences: memory.sourceReferences || [],
    notebookId: notebook.id,
    notebookName: notebook.name,
    updatedAt: memory.updatedAt,
  };
}

function weakPointMemory(notebook: StageListItem, point: WeakPointMemory): PrivateMemoryView {
  return {
    id: `weak:${notebook.id}:${point.id}`,
    title: point.title,
    text: point.reason,
    sourceLabel: '待复习弱点',
    kindLabel: '弱点',
    sourceReferences: [],
    notebookId: notebook.id,
    notebookName: notebook.name,
    updatedAt: point.reviewedAt || point.createdAt,
  };
}

function purposeLabel(purpose: CourseRecord['purpose']): string {
  if (purpose === 'research') return '科研';
  if (purpose === 'university') return '大学课程';
  return '日常使用';
}

function languageLabel(language: CourseRecord['language']): string {
  return language === 'zh-CN' ? '中文' : 'English';
}

function buildCourseFacts(args: {
  course: CourseRecord;
  notebooks: StageListItem[];
  dbAvailable: boolean;
  publicMemoryCount: number;
  privateMemoryCount: number;
}): CourseFactView[] {
  return [
    {
      id: 'course:name',
      label: '课程名称',
      value: args.course.name,
      scope: 'course',
    },
    {
      id: 'course:language',
      label: '默认语言',
      value: languageLabel(args.course.language),
      scope: 'course',
    },
    {
      id: 'course:purpose',
      label: '使用场景',
      value: purposeLabel(args.course.purpose),
      scope: 'course',
    },
    {
      id: 'course:notebooks',
      label: '笔记本数量',
      value: String(args.notebooks.length),
      scope: 'course',
    },
    {
      id: 'course:problem-bank',
      label: '题库规模',
      value: String(args.course.problemCount || 0),
      scope: 'knowledge',
    },
    {
      id: 'course:memory-store',
      label: '记忆来源',
      value: args.dbAvailable ? '数据库 + 本地' : '本地默认',
      scope: 'storage',
    },
    {
      id: 'course:public-memory',
      label: '公共记忆',
      value: String(args.publicMemoryCount),
      scope: 'public',
    },
    {
      id: 'course:private-memory',
      label: '私有信号',
      value: String(args.privateMemoryCount),
      scope: 'private',
    },
  ].filter((fact) => fact.value.trim().length > 0);
}

function buildCoursePublicMarkdown(args: {
  courseName: string;
  courseMemories: PublicMemoryView[];
  notebookMemories: PublicMemoryView[];
}): string {
  const lines = [`# ${args.courseName} 课程记忆`, '', '> 这是课程层面的公共知识地图。', ''];

  if (args.courseMemories.length > 0) {
    lines.push('## 课程公共记忆', '');
    for (const memory of args.courseMemories) {
      const meta = [memory.sourceLabel, formatTime(memory.updatedAt)].filter(Boolean);
      lines.push(`### ${memory.title}`, '');
      if (meta.length > 0) lines.push(`> ${meta.join(' · ')}`, '');
      lines.push(memory.text.trim(), '');
    }
  }

  if (args.courseMemories.length === 0 && args.notebookMemories.length > 0) {
    lines.push('## 暂无课程级公共记忆', '', '- 下方会以卡片形式显示各笔记本贡献的公共记忆入口。');
  }

  if (args.courseMemories.length === 0 && args.notebookMemories.length === 0) {
    lines.push('## 暂无公共记忆', '', '- 课程或笔记本写入公共记忆后，会在这里汇总。');
  }

  return lines.join('\n').trim();
}

function collectKnowledgeSources(args: {
  course: CourseRecord;
  notebooks: StageListItem[];
  memories: PublicMemoryView[];
}): SourceReferenceView[] {
  const sourceMap = new Map<string, SourceReferenceView>();

  const addSource = (source: Omit<SourceReferenceView, 'count'>, increment = 1) => {
    const existing = sourceMap.get(source.id);
    sourceMap.set(source.id, {
      ...source,
      count: (existing?.count || 0) + increment,
      why: existing?.why || source.why,
    });
  };

  for (const memory of args.memories) {
    for (const source of memory.sourceReferences) {
      const notebookName = source.notebookName || memory.notebookName || '笔记本';
      const sourceTitle = source.order ? `第 ${source.order} 页 · ${source.title}` : source.title;
      addSource({
        id: `${source.notebookId || memory.notebookId || 'course'}:${source.order}:${source.title}`,
        title: sourceTitle,
        subtitle: notebookName,
        why: source.why,
      });
    }
  }

  const totalScenes = args.notebooks.reduce((sum, notebook) => sum + (notebook.sceneCount || 0), 0);
  if (totalScenes > 0) {
    addSource(
      {
        id: 'derived:notebook-scenes',
        title: '笔记本页面',
        subtitle: `${args.notebooks.length} 本笔记本 · ${totalScenes} 页`,
      },
      totalScenes,
    );
  }

  if ((args.course.problemCount || 0) > 0) {
    addSource(
      {
        id: 'derived:problem-bank',
        title: '课程题库',
        subtitle: `${args.course.publishedProblemCount || 0} 已发布 / ${args.course.problemCount || 0} 总题`,
      },
      args.course.problemCount || 1,
    );
  }

  return Array.from(sourceMap.values()).sort((a, b) => b.count - a.count);
}

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledValues<T>(values: T[], seed: number): T[] {
  const random = seededRandom(seed || Date.now());
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function shuffledProblemSuggestionTitles(
  problems: CourseProblemClientSummary[],
  seed: number,
): string[] {
  const published = problems.filter((problem) => problem.status === 'published');
  const generated = published.filter((problem) => problem.tags.includes('AI生成练习'));
  const source = generated.length > 0 ? generated : published;
  return shuffledValues(source, seed)
    .map((problem) => problem.title.trim())
    .filter(Boolean);
}

function MarkdownDocument({ markdown }: { markdown: string }) {
  return (
    <div className="rounded-[20px] border border-slate-200/85 bg-white/92 p-4 shadow-sm dark:border-white/10 dark:bg-black/18 md:p-5">
      <div className="mb-4 flex min-w-0 items-center justify-between gap-3 border-b border-slate-200/80 pb-3 dark:border-white/10">
        <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-bold uppercase tracking-normal text-white dark:bg-white dark:text-slate-950">
          Markdown
        </span>
        <span className="truncate text-[11px] font-semibold text-slate-400 dark:text-slate-500">
          course-memory.md
        </span>
      </div>
      <Streamdown
        mode="static"
        plugins={{ code, math: markdownMath }}
        className={cn(
          'text-sm leading-7 text-slate-700 dark:text-slate-200',
          '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
          '[&_h1]:mb-4 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:leading-tight [&_h1]:text-slate-950 dark:[&_h1]:text-white',
          '[&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:border-b [&_h2]:border-slate-200 [&_h2]:pb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-900 dark:[&_h2]:border-white/10 dark:[&_h2]:text-white',
          '[&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-slate-900 dark:[&_h3]:text-slate-100',
          '[&_p]:my-3 [&_p]:text-slate-600 dark:[&_p]:text-slate-300',
          '[&_blockquote]:my-4 [&_blockquote]:rounded-2xl [&_blockquote]:border-l-4 [&_blockquote]:border-emerald-400 [&_blockquote]:bg-emerald-50/70 [&_blockquote]:px-4 [&_blockquote]:py-3 [&_blockquote]:text-sm [&_blockquote]:text-emerald-900 dark:[&_blockquote]:bg-emerald-500/10 dark:[&_blockquote]:text-emerald-100',
          '[&_ul]:my-3 [&_ul]:grid [&_ul]:gap-1.5 [&_ul]:pl-5 [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-slate-950 dark:[&_strong]:text-white',
          '[&_table]:my-4 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:rounded-xl [&_table]:border [&_table]:border-slate-200 [&_table]:text-left dark:[&_table]:border-white/10',
          '[&_thead]:bg-slate-50 dark:[&_thead]:bg-white/8 [&_th]:whitespace-nowrap [&_th]:border-b [&_th]:border-slate-200 [&_th]:px-3 [&_th]:py-2 [&_th]:text-xs [&_th]:font-semibold [&_th]:text-slate-700 dark:[&_th]:border-white/10 dark:[&_th]:text-slate-200',
          '[&_td]:border-b [&_td]:border-slate-100 [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_td]:text-xs [&_td]:leading-5 dark:[&_td]:border-white/8',
        )}
      >
        {markdown}
      </Streamdown>
    </div>
  );
}

function Panel({
  actions,
  children,
  icon: Icon,
  subtitle,
  title,
}: {
  actions?: ReactNode;
  children: ReactNode;
  icon: typeof Brain;
  subtitle?: string;
  title: string;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-[22px] border border-slate-200/80 bg-white/90 shadow-[0_18px_58px_rgba(15,23,42,0.07)] dark:border-white/10 dark:bg-white/[0.06]">
      <div className="flex min-w-0 items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-4 dark:border-white/10">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-100">
            <Icon className="size-5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">{title}</h2>
            {subtitle ? (
              <p className="mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="p-3 md:p-4">{children}</div>
    </section>
  );
}

function EmptyState({ children }: { children: string }) {
  return (
    <div className="flex min-h-[9rem] items-center justify-center rounded-2xl border border-dashed border-slate-200/90 bg-white/56 px-5 text-center text-sm text-slate-500 dark:border-white/12 dark:bg-white/[0.035] dark:text-slate-400">
      {children}
    </div>
  );
}

function CourseFactsPanel({ facts }: { facts: CourseFactView[] }) {
  return (
    <Panel icon={BadgeCheck} subtitle="当前课程召回的稳定基线。" title="结构事实">
      <div className="grid gap-2 sm:grid-cols-2">
        {facts.map((fact) => (
          <article
            key={fact.id}
            className="rounded-2xl border border-cyan-100 bg-cyan-50/60 p-3 dark:border-cyan-300/14 dark:bg-cyan-400/8"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold text-cyan-700 dark:text-cyan-100">{fact.label}</p>
              <span className="rounded-full bg-white/75 px-2 py-0.5 text-[10px] font-bold text-cyan-700 dark:bg-white/10 dark:text-cyan-100">
                {fact.scope}
              </span>
            </div>
            <p className="mt-2 line-clamp-2 text-sm font-semibold text-slate-950 dark:text-white">
              {fact.value}
            </p>
          </article>
        ))}
      </div>
    </Panel>
  );
}

function MetricStrip({
  metrics,
}: {
  metrics: Array<{ label: string; value: string | number; hint: string }>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="rounded-2xl border border-slate-200/85 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-white/[0.045]"
        >
          <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{metric.label}</p>
          <p className="mt-2 truncate text-2xl font-semibold tabular-nums text-slate-950 dark:text-white">
            {metric.value}
          </p>
          <p className="mt-1 truncate text-[10px] font-medium text-slate-400 dark:text-slate-500">
            {metric.hint}
          </p>
        </div>
      ))}
    </div>
  );
}

function PublicMemoryList({
  memories,
  titlePrefix,
}: {
  memories: PublicMemoryView[];
  titlePrefix?: string;
}) {
  if (memories.length === 0) {
    return <EmptyState>暂无公共记忆。</EmptyState>;
  }

  return (
    <div className="grid gap-2.5">
      {memories.slice(0, 12).map((memory) => (
        <article
          key={memory.id}
          className="rounded-2xl border border-slate-200/85 bg-white/82 p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.045]"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-300/14 dark:text-emerald-100">
              {memory.sourceLabel}
            </span>
            {memory.notebookName ? (
              <span className="max-w-full truncate rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                {memory.notebookName}
              </span>
            ) : null}
            {formatTime(memory.updatedAt) ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                {formatTime(memory.updatedAt)}
              </span>
            ) : null}
          </div>
          <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-slate-950 dark:text-white">
            {titlePrefix ? `${titlePrefix}${memory.title}` : memory.title}
          </h3>
          <p className="mt-1.5 line-clamp-3 text-xs leading-5 text-slate-600 dark:text-slate-300">
            {compactText(memory.text, 260)}
          </p>
        </article>
      ))}
    </div>
  );
}

function NotebookMemoryAgentDirectory({ memories }: { memories: PublicMemoryView[] }) {
  if (memories.length === 0) {
    return null;
  }

  return (
    <section className="border-t border-slate-200/80 pt-4 dark:border-white/10">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-blue-200/80 bg-blue-50 text-blue-600 shadow-sm dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-200">
          <BookOpen className="size-4" strokeWidth={1.7} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-950 dark:text-white">笔记本记忆入口</h2>
          <p className="mt-0.5 line-clamp-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            每张卡片代表一个 notebook agent 贡献的课程公共记忆。
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {memories.slice(0, 12).map((memory) => {
          const title = memory.notebookName || memory.title || 'Notebook';
          const initial = title.trim().slice(0, 1).toUpperCase() || 'N';
          return (
            <article
              key={memory.id}
              className="rounded-2xl border border-slate-200/85 bg-white/82 p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.045]"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-sm font-bold text-slate-600 dark:bg-white/10 dark:text-slate-200">
                  {initial}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className="max-w-full truncate rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-300/14 dark:text-emerald-100">
                      {memory.notebookName || '笔记本'}
                    </span>
                    {formatTime(memory.updatedAt) ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                        {formatTime(memory.updatedAt)}
                      </span>
                    ) : null}
                  </div>
                  <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-slate-950 dark:text-white">
                    {memory.title}
                  </h3>
                  <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
                    {compactText(memory.text, 180)}
                  </p>
                </div>
              </div>
              {memory.notebookId ? (
                <Link
                  href={`/classroom/${encodeURIComponent(memory.notebookId)}/memory`}
                  className="mt-3 inline-flex h-8 items-center justify-center rounded-xl border border-slate-200/85 bg-slate-50 px-3 text-xs font-bold text-slate-600 transition-colors hover:border-blue-200 hover:text-blue-700 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-200"
                >
                  进入记忆页
                </Link>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function TemplateMarkdownBlock({ markdown, title }: { markdown: string; title: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/88 p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.045]">
      <p className="text-[11px] font-bold uppercase tracking-normal text-blue-700 dark:text-blue-100">
        {title}
      </p>
      <Streamdown
        mode="static"
        plugins={{ code, math: markdownMath }}
        className={cn(
          'mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200',
          '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
          '[&_p]:my-2 [&_ol]:my-2 [&_ol]:grid [&_ol]:gap-1.5 [&_ol]:pl-5',
          '[&_ul]:my-2 [&_ul]:grid [&_ul]:gap-1.5 [&_ul]:pl-5 [&_li]:pl-1',
          '[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-slate-200 [&_pre]:bg-white [&_pre]:p-3 [&_pre]:text-xs dark:[&_pre]:border-white/10 dark:[&_pre]:bg-black/22',
          '[&_code]:font-mono [&_code]:text-[0.92em]',
          '[&_:not(pre)>code]:rounded-md [&_:not(pre)>code]:bg-slate-100 [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 dark:[&_:not(pre)>code]:bg-white/10',
        )}
      >
        {markdown}
      </Streamdown>
    </div>
  );
}

function TemplateRegistryPanel({ templates }: { templates: CourseTemplateView[] }) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>();

  return (
    <MemoryListDetailLayout<CourseTemplateView>
      detailClassName="min-h-0 overflow-y-auto pr-1 lg:h-full"
      emptyMessage="暂无可识别的课程模板。"
      eyebrow="模板记忆"
      items={templates}
      layoutClassName="lg:h-[calc(100dvh-7rem)] lg:max-h-[calc(100dvh-7rem)] xl:!grid-cols-[minmax(18rem,0.56fr)_minmax(0,1.44fr)]"
      listClassName="lg:h-full lg:!max-h-none"
      maxItems={18}
      onSelectItem={(templateId) => setSelectedTemplateId(templateId)}
      selectedItemId={selectedTemplateId}
      title="解题模板库"
      renderItemMeta={(template) => (
        <>
          <span className="max-w-full truncate rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-300/14 dark:text-emerald-100">
            {template.category}
          </span>
          <span className="max-w-full truncate rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
            {template.sourceTitle}
          </span>
          {formatTime(template.updatedAt) ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
              {formatTime(template.updatedAt)}
            </span>
          ) : null}
        </>
      )}
      renderDetail={(selectedTemplate) =>
        selectedTemplate ? (
          <Panel
            icon={ClipboardCheck}
            subtitle={[selectedTemplate.sourceLabel, selectedTemplate.notebookName]
              .filter(Boolean)
              .join(' · ')}
            title={selectedTemplate.title}
          >
            <div className="grid gap-3">
              <div className="rounded-2xl border border-slate-200/80 bg-white/82 p-3 dark:border-white/10 dark:bg-white/[0.045]">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-300/14 dark:text-emerald-100">
                    {selectedTemplate.category}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                    {selectedTemplate.sourceTitle}
                  </span>
                  {formatTime(selectedTemplate.updatedAt) ? (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                      {formatTime(selectedTemplate.updatedAt)}
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-200">
                  {selectedTemplate.summary}
                </div>
              </div>
              <TemplateMarkdownBlock markdown={selectedTemplate.templateText} title="模板" />
              <TemplateMarkdownBlock markdown={selectedTemplate.exampleText} title="例子" />
            </div>
          </Panel>
        ) : null
      }
    />
  );
}

function NotebookIndexPanel({ items }: { items: NotebookIndexView[] }) {
  return (
    <Panel icon={BookOpen} subtitle="每本笔记本贡献的课程记忆入口。" title="笔记本记忆索引">
      {items.length > 0 ? (
        <div className="grid gap-2.5">
          {items.slice(0, 10).map((item) => (
            <article
              key={item.notebook.id}
              className="rounded-2xl border border-slate-200/85 bg-white/82 p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.045]"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-slate-950 dark:text-white">
                    {item.notebook.name}
                  </h3>
                  <p className="mt-1 line-clamp-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {item.latestTitle || item.notebook.description || '暂无近期记忆摘要'}
                  </p>
                </div>
                <Link
                  href={`/classroom/${encodeURIComponent(item.notebook.id)}/memory`}
                  className="shrink-0 rounded-xl border border-slate-200/85 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-600 transition-colors hover:border-blue-200 hover:text-blue-700 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-200"
                >
                  进入
                </Link>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-1.5 text-center text-[10px] font-bold text-slate-500 dark:text-slate-300">
                {[
                  ['共有', item.publicCount],
                  ['私有', item.privateCount],
                  ['弱点', item.weakCount],
                  ['来源', item.sourceCount],
                ].map(([label, value]) => (
                  <span key={label} className="rounded-xl bg-slate-100 px-2 py-1 dark:bg-white/10">
                    {label} {value}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState>这门课还没有可索引的笔记本。</EmptyState>
      )}
    </Panel>
  );
}

function KnowledgeSourcesPanel({ sources }: { sources: SourceReferenceView[] }) {
  return (
    <Panel icon={Database} subtitle="课程召回可用的来源入口。" title="知识来源">
      {sources.length > 0 ? (
        <div className="grid gap-2.5">
          {sources.slice(0, 10).map((source) => (
            <article
              key={source.id}
              className="rounded-2xl border border-slate-200/85 bg-white/82 p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.045]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-slate-950 dark:text-white">
                    {source.title}
                  </h3>
                  <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {source.subtitle}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                  {source.count}
                </span>
              </div>
              {source.why ? (
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
                  {source.why}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState>暂无来源索引。</EmptyState>
      )}
    </Panel>
  );
}

function PrivateMemoryPanel({ memories }: { memories: PrivateMemoryView[] }) {
  const weakCount = memories.filter((memory) => memory.kindLabel === '弱点').length;
  return (
    <Panel
      icon={Lock}
      subtitle={`${weakCount} 个待复习弱点，${Math.max(0, memories.length - weakCount)} 条私有记忆。`}
      title="我的学习状态"
    >
      {memories.length > 0 ? (
        <div className="grid gap-2.5">
          {memories.slice(0, 16).map((memory) => (
            <article
              key={memory.id}
              className="rounded-2xl border border-slate-200/85 bg-white/82 p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.045]"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-bold',
                    memory.kindLabel === '弱点'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-300/14 dark:text-amber-100'
                      : 'bg-violet-100 text-violet-700 dark:bg-violet-300/14 dark:text-violet-100',
                  )}
                >
                  {memory.kindLabel}
                </span>
                <span className="max-w-full truncate rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                  {memory.sourceLabel}
                </span>
                {memory.notebookName ? (
                  <span className="max-w-full truncate rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                    {memory.notebookName}
                  </span>
                ) : null}
              </div>
              <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-slate-950 dark:text-white">
                {memory.title}
              </h3>
              <p className="mt-1.5 line-clamp-3 text-xs leading-5 text-slate-600 dark:text-slate-300">
                {memory.text}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState>暂无课程私有记忆。聊天、错题或复习产生的卡点会汇总到这里。</EmptyState>
      )}
    </Panel>
  );
}

function RecallPreviewPanel({ sections }: { sections: RecallPreviewSection[] }) {
  return (
    <Panel
      icon={MessageSquareText}
      subtitle="按聊天召回优先级展示当前可用上下文。"
      title="召回预览"
    >
      <div className="grid gap-3">
        {sections.map((section) => (
          <article
            key={section.id}
            className="rounded-2xl border border-slate-200/85 bg-white/82 p-3 dark:border-white/10 dark:bg-white/[0.045]"
          >
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-950 dark:text-white">
                  {section.title}
                </h3>
                <p className="mt-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {section.subtitle}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                {section.items.length}
              </span>
            </div>
            {section.items.length > 0 ? (
              <div className="mt-3 grid gap-1.5">
                {section.items.slice(0, 3).map((item) => (
                  <div key={item.id} className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/5">
                    <p className="line-clamp-1 text-xs font-semibold text-slate-800 dark:text-slate-100">
                      {item.title}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                      {item.text}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </Panel>
  );
}

function intentKindLabel(kind: MemorySearchIntentView['kind']): string {
  if (kind === 'concept') return '知识点/概念';
  if (kind === 'problem') return '题目搜索';
  if (kind === 'unattempted_problem') return '未做题目';
  if (kind === 'weakness_review') return '错题/薄弱点';
  if (kind === 'learner_understanding') return '学生理解状态';
  if (kind === 'learning_status') return '学习情况';
  if (kind === 'learner_questions') return '提问历史';
  return '通用检索';
}

function sourceEvidenceLabel(sourceType: MemorySearchSourceEvidence['sourceType']): string {
  if (sourceType === 'markdown_section') return '概念原文';
  if (sourceType === 'problem') return '题目原文';
  if (sourceType === 'student_message') return '学生提问';
  if (sourceType === 'problem_attempt') return '做题记录';
  return '来源原文';
}

function progressFilterLabel(filter: MemorySearchIntentView['progressFilter']): string {
  if (filter === 'unattempted') return '只看未尝试';
  if (filter === 'wrong_or_partial') return '只看错题/半对';
  if (filter === 'attempted') return '只看已尝试';
  return '不限制作答进度';
}

function attemptStatusLabel(match: MemorySearchKnowledgeMatch): string {
  if (!match.metadata.attemptedCount) return '未尝试';
  if (match.metadata.attemptStatus === 'passed') return '已通过';
  if (match.metadata.attemptStatus === 'failed') return '做错';
  if (match.metadata.attemptStatus === 'partial') return '半对';
  if (match.metadata.attemptStatus === 'error') return '批改异常';
  return '已尝试';
}

function learnerAnalyticsTimeScopeLabel(scope: MemorySearchLearnerAnalytics['timeScope']): string {
  if (scope === 'week') return '最近 7 天';
  if (scope === 'month') return '最近 30 天';
  if (scope === 'term') return '本课程周期';
  return '全部记录';
}

function memorySearchScopeLabel(scope: MemorySearchScope): string {
  if (scope.expanded) return '已扩大到整门课';
  if (scope.effectiveMode === 'course_wide') return '整门课';
  return '当前笔记本';
}

function CourseMemorySearchPanel({
  fixedSuggestions,
  problemSuggestions,
  query,
  searchRun,
  onQueryChange,
  onSearch,
}: {
  fixedSuggestions: string[];
  problemSuggestions: string[];
  query: string;
  searchRun: MemorySearchRunState;
  onQueryChange: (value: string) => void;
  onSearch: (value?: string) => void;
}) {
  const [suggestionPage, setSuggestionPage] = useState(0);
  const [suggestionSeed] = useState(() => Date.now());
  const hasQuery = query.trim().length > 0;
  const data = searchRun.data;
  const isLoading = searchRun.status === 'loading';
  const suggestions = useMemo(() => {
    const suggestionPool = Array.from(
      new Set([...fixedSuggestions, ...problemSuggestions].filter(Boolean)),
    );
    return shuffledValues(suggestionPool, suggestionSeed + suggestionPage * 9973).slice(0, 9);
  }, [fixedSuggestions, problemSuggestions, suggestionPage, suggestionSeed]);
  const hasSuggestionPool = fixedSuggestions.length > 0 || problemSuggestions.length > 0;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="min-w-0 overflow-hidden rounded-[22px] border border-slate-200/80 bg-white/90 shadow-[0_18px_58px_rgba(15,23,42,0.07)] dark:border-white/10 dark:bg-white/[0.06]">
        <div className="border-b border-slate-200/80 p-4 dark:border-white/10">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-400/12 dark:text-blue-100">
              <Search className="size-5" strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-950 dark:text-white">
                AI/RAG 自然语言搜索
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                聊天 AI 会用这条链路搜索概念原文、题目原文、学习情况和学生历史。
              </p>
            </div>
          </div>
          <div className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row">
            <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-2xl border border-slate-200/85 bg-slate-50/88 px-3 text-sm shadow-inner dark:border-white/10 dark:bg-black/18">
              <Search className="size-4 shrink-0 text-slate-400" strokeWidth={1.9} />
              <input
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onSearch();
                }}
                placeholder="例如：分部积分选 u、没做的黎曼积分题目、这周学生学习情况、整学期问过什么"
                className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
              />
            </label>
            <button
              type="button"
              disabled={!hasQuery || isLoading}
              onClick={() => onSearch()}
              className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-white dark:text-slate-950 dark:hover:bg-blue-100 dark:disabled:bg-white/20 dark:disabled:text-white/50"
            >
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              运行搜索
            </button>
          </div>
        </div>

        <div className="grid gap-3 p-3 md:p-4">
          {searchRun.status === 'error' ? (
            <EmptyState>{searchRun.error}</EmptyState>
          ) : isLoading && !data ? (
            <div className="flex min-h-32 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-8 text-sm font-semibold text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
              <Loader2 className="mr-2 size-4 animate-spin" />
              正在搜索课程记忆和题库索引。
            </div>
          ) : data ? (
            <article className="rounded-[22px] border border-slate-200/85 bg-white/86 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.05] md:p-5">
              <div className="mb-4 flex min-w-0 items-center justify-between gap-3 border-b border-slate-200/75 pb-3 dark:border-white/10">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-400/12 dark:text-blue-100">
                    <MessageSquareText className="size-4" strokeWidth={1.9} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-950 dark:text-white">
                      AI 回复
                    </h3>
                    <p className="mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
                      已按课程范围、结构事实优先级和题库进度过滤整理。
                    </p>
                  </div>
                </div>
                {isLoading ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-slate-400" />
                ) : null}
              </div>
              <Streamdown
                mode="static"
                plugins={{ code, math: markdownMath }}
                className={cn(
                  'text-sm leading-7 text-slate-700 dark:text-slate-200',
                  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
                  '[&_p]:my-3 [&_p]:text-slate-700 dark:[&_p]:text-slate-200',
                  '[&_ol]:my-3 [&_ol]:grid [&_ol]:gap-2 [&_ol]:pl-5',
                  '[&_ul]:my-3 [&_ul]:grid [&_ul]:gap-1.5 [&_ul]:pl-5',
                  '[&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-slate-950 dark:[&_strong]:text-white',
                )}
              >
                {data.answer}
              </Streamdown>
              <details className="mt-5 rounded-2xl border border-slate-200/80 bg-slate-50/72 px-3 py-2 text-xs text-slate-600 dark:border-white/10 dark:bg-black/16 dark:text-slate-300">
                <summary className="cursor-pointer select-none font-semibold text-slate-700 dark:text-slate-200">
                  召回依据
                </summary>
                <div className="mt-3 grid gap-3">
                  <div className="flex min-w-0 flex-wrap gap-1.5">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-400/12 dark:text-emerald-100">
                      {data.intent.source === 'ai' ? 'AI 搜索计划' : '降级通用检索'}
                    </span>
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 dark:bg-blue-400/12 dark:text-blue-100">
                      {intentKindLabel(data.intent.kind)}
                    </span>
                    <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[11px] font-bold text-cyan-700 dark:bg-cyan-400/12 dark:text-cyan-100">
                      {memorySearchScopeLabel(data.scope)}
                    </span>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                      {progressFilterLabel(data.intent.progressFilter)}
                    </span>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                      结构事实 {data.staticFacts.length}
                    </span>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                      记忆 {data.counts.direct + data.counts.semantic}
                    </span>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                      题库 {data.counts.knowledge}
                    </span>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                      原文 {data.counts.sourceEvidence}
                    </span>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                      学习分析 {data.counts.learnerAnalytics}
                    </span>
                  </div>
                  {data.intent.plan?.summary ? (
                    <p className="rounded-xl bg-white px-3 py-2 text-[11px] leading-5 text-slate-500 dark:bg-white/[0.06] dark:text-slate-300">
                      {data.intent.plan.summary}
                    </p>
                  ) : null}
                  {data.learnerAnalytics ? (
                    <div className="rounded-xl bg-white px-3 py-2 text-[11px] leading-5 text-slate-500 dark:bg-white/[0.06] dark:text-slate-300">
                      <p className="font-semibold text-slate-700 dark:text-slate-200">
                        学习分析：{learnerAnalyticsTimeScopeLabel(data.learnerAnalytics.timeScope)}
                      </p>
                      <p className="mt-0.5">
                        提问 {data.learnerAnalytics.summary.questionCount} · 做题{' '}
                        {data.learnerAnalytics.summary.attemptCount} · 错/半对{' '}
                        {data.learnerAnalytics.summary.failedCount +
                          data.learnerAnalytics.summary.partialCount}{' '}
                        · 私有记忆 {data.learnerAnalytics.summary.privateMemoryCount}
                      </p>
                    </div>
                  ) : null}
                  {data.knowledgeMatches.length > 0 ? (
                    <div className="grid gap-1.5">
                      {data.knowledgeMatches.slice(0, 4).map((match) => (
                        <div
                          key={match.id}
                          className="rounded-xl bg-white px-3 py-2 dark:bg-white/[0.06]"
                        >
                          <p className="line-clamp-1 font-semibold text-slate-800 dark:text-slate-100">
                            {match.title}
                          </p>
                          <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400">
                            {[match.metadata.notebookName, attemptStatusLabel(match)]
                              .filter(Boolean)
                              .join(' / ')}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {data.sourceEvidence.length > 0 ? (
                    <div className="grid gap-1.5">
                      {data.sourceEvidence.slice(0, 5).map((evidence) => (
                        <div
                          key={evidence.id}
                          className="rounded-xl bg-white px-3 py-2 dark:bg-white/[0.06]"
                        >
                          <p className="line-clamp-1 font-semibold text-slate-800 dark:text-slate-100">
                            {evidence.title}
                          </p>
                          <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400">
                            {sourceEvidenceLabel(evidence.sourceType)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </details>
            </article>
          ) : hasQuery ? (
            <EmptyState>输入后点击运行搜索，查看 AI 整理后的搜索答案。</EmptyState>
          ) : (
            <EmptyState>
              输入一句自然语言问题，例如“某个知识点概念”“某道题目”“没做的黎曼积分题目”。
            </EmptyState>
          )}
        </div>
      </section>

      <aside className="grid content-start gap-4">
        <Panel
          icon={MessageSquareText}
          subtitle="概念、题目和学习状态都可以搜。"
          title="AI 搜索样例"
        >
          <div className="grid gap-2">
            <button
              type="button"
              disabled={!hasSuggestionPool}
              onClick={() => setSuggestionPage((current) => current + 1)}
              className="inline-flex min-h-9 items-center justify-end gap-1.5 rounded-2xl border border-slate-200/85 bg-white/82 px-3 py-2 text-right text-xs font-bold leading-5 text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50/50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/10 dark:bg-white/[0.045] dark:text-slate-200 dark:hover:bg-blue-400/10"
            >
              <RefreshCw className="size-3.5" strokeWidth={1.9} />
              换一批
            </button>
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => {
                  onQueryChange(suggestion);
                  onSearch(suggestion);
                }}
                className="rounded-2xl border border-slate-200/85 bg-white/82 px-3 py-2 text-left text-xs font-semibold leading-5 text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50/50 hover:text-blue-700 dark:border-white/10 dark:bg-white/[0.045] dark:text-slate-200 dark:hover:bg-blue-400/10"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </Panel>
        {data ? (
          <Panel icon={Database} subtitle="只显示轻量摘要。" title="本次搜索">
            <div className="grid gap-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
              <p>意图：{intentKindLabel(data.intent.kind)}</p>
              <p>范围：{memorySearchScopeLabel(data.scope)}</p>
              <p>进度：{progressFilterLabel(data.intent.progressFilter)}</p>
              <p>题库命中：{data.counts.knowledge}</p>
              <p>原文证据：{data.counts.sourceEvidence}</p>
              <p>学习分析：{data.counts.learnerAnalytics}</p>
              {data.learnerAnalytics ? (
                <p>范围：{learnerAnalyticsTimeScopeLabel(data.learnerAnalytics.timeScope)}</p>
              ) : null}
            </div>
          </Panel>
        ) : null}
      </aside>
    </div>
  );
}

function TabButton({
  active,
  children,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  icon: typeof Brain;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors',
        active
          ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
          : 'border-slate-200/85 bg-white/86 text-slate-700 hover:border-blue-200 hover:text-blue-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200 dark:hover:bg-white/[0.1]',
      )}
    >
      <Icon className="size-3.5" strokeWidth={1.9} />
      {children}
    </button>
  );
}

export function CourseMemoryPageClient({
  courseId,
  initialTab = 'overview',
  pageTitle = '课程记忆',
  pageEyebrow = '课程记忆',
}: CourseMemoryPageClientProps) {
  const [course, setCourse] = useState<CourseRecord | null | undefined>(undefined);
  const [notebooks, setNotebooks] = useState<StageListItem[]>([]);
  const [courseProblemSummaries, setCourseProblemSummaries] = useState<
    CourseProblemClientSummary[]
  >([]);
  const [dbMemories, setDbMemories] = useState<StudyMemoryApiRecord[]>([]);
  const [dbNotebookMemories, setDbNotebookMemories] = useState<NotebookMemoryRecordBundle[]>([]);
  const [dbAvailable, setDbAvailable] = useState(false);
  const [activeTab, setActiveTab] = useState<CourseMemoryTab>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestionBatchSeed] = useState(() => Date.now());
  const [searchRun, setSearchRun] = useState<MemorySearchRunState>({
    status: 'idle',
    query: '',
  });

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [loadedCourse, loadedNotebooks, loadedProblemSummaries, loadedMemories] =
        await Promise.all([
          getCourse(courseId),
          listStagesByCourse(courseId).catch(() => []),
          listCourseProblemSummaries(courseId).catch(() => []),
          listStudyMemoryRecords({ targetType: 'course', targetId: courseId })
            .then((memories) => ({ ok: true, memories }))
            .catch(() => ({ ok: false, memories: [] as StudyMemoryApiRecord[] })),
        ]);
      const loadedNotebookMemories =
        loadedMemories.ok && loadedNotebooks.length > 0
          ? await Promise.all(
              loadedNotebooks.map((notebook) =>
                listStudyMemoryRecords({ targetType: 'notebook', targetId: notebook.id })
                  .then((memories) => ({ notebookId: notebook.id, memories }))
                  .catch(() => ({ notebookId: notebook.id, memories: [] })),
              ),
            )
          : [];
      if (!alive) return;
      setCourse(loadedCourse ?? null);
      setNotebooks(loadedNotebooks);
      setCourseProblemSummaries(loadedProblemSummaries);
      setDbMemories(loadedMemories.memories);
      setDbNotebookMemories(loadedNotebookMemories);
      setDbAvailable(loadedMemories.ok);
    })();
    return () => {
      alive = false;
    };
  }, [courseId]);

  const runMemorySearch = useCallback(
    async (nextQuery?: string) => {
      const query = (nextQuery ?? searchQuery).trim();
      if (!query) return;
      setSearchQuery(query);
      setSearchRun((current) => ({
        status: 'loading',
        query,
        data: current.query === query ? current.data : undefined,
      }));

      try {
        const data = await backendJson<MemorySearchResponse>('/api/memory/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetType: 'course',
            targetId: courseId,
            query,
          }),
        });
        setSearchRun({ status: 'success', query, data });
      } catch (error) {
        setSearchRun({
          status: 'error',
          query,
          error: error instanceof Error ? error.message : '搜索失败，请稍后再试。',
        });
      }
    },
    [courseId, searchQuery],
  );

  const userId = getLocalStudyMemoryUserId();
  const notebookProfiles = useMemo(
    () =>
      notebooks.map((notebook) => ({
        notebook,
        profile: loadStudyMemory(userId, notebook.id),
      })),
    [notebooks, userId],
  );

  const notebooksById = useMemo(
    () => new Map(notebooks.map((notebook) => [notebook.id, notebook] as const)),
    [notebooks],
  );
  const dbPublicMemories = useMemo(
    () => dbMemories.filter((memory) => memory.scope === 'public' && isActive(memory)),
    [dbMemories],
  );
  const dbNotebookPublicMemories = useMemo(
    () =>
      dbNotebookMemories.flatMap(({ notebookId, memories }) => {
        const notebook = notebooksById.get(notebookId);
        if (!notebook) return [];
        return memories
          .filter((memory) => memory.scope === 'public' && isActive(memory))
          .map((memory) => notebookApiPublicMemory(notebook, memory));
      }),
    [dbNotebookMemories, notebooksById],
  );
  const coursePublicMemories = useMemo(() => {
    if (!course) return [];
    if (dbPublicMemories.length > 0) return dbPublicMemories.map(apiPublicMemory);
    return getDefaultCoursePublicMemories(course).map(defaultPublicMemory);
  }, [course, dbPublicMemories]);
  const notebookPublicMemories = useMemo(
    () =>
      [
        ...dbNotebookPublicMemories,
        ...notebookProfiles.flatMap(({ notebook, profile }) =>
          profile.publicMemories
            .filter(isActive)
            .map((memory) => notebookPublicMemory(notebook, memory)),
        ),
      ].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    [dbNotebookPublicMemories, notebookProfiles],
  );
  const courseTemplates = useMemo(
    () =>
      mergeDuplicateCourseTemplates([
        ...manualCpscGraphTemplates(course, notebooks),
        ...collectCourseTemplates([...coursePublicMemories, ...notebookPublicMemories]),
      ]),
    [course, coursePublicMemories, notebookPublicMemories, notebooks],
  );
  const privateMemories = useMemo(() => {
    const dbPrivate = dbMemories
      .filter((memory) => memory.scope === 'private' && isActive(memory))
      .map(apiPrivateMemory);
    const dbNotebookPrivate = dbNotebookMemories.flatMap(({ notebookId, memories }) => {
      const notebook = notebooksById.get(notebookId);
      if (!notebook) return [];
      return memories
        .filter((memory) => memory.scope === 'private' && isActive(memory))
        .map((memory) => notebookApiPrivateMemory(notebook, memory));
    });
    const notebookPrivate = notebookProfiles.flatMap(({ notebook, profile }) => [
      ...profile.privateMemories
        .filter(isActive)
        .map((memory) => notebookPrivateMemory(notebook, memory)),
      ...profile.weakPoints
        .filter((point) => point.status === 'open')
        .map((point) => weakPointMemory(notebook, point)),
    ]);
    return [...dbPrivate, ...dbNotebookPrivate, ...notebookPrivate].sort(
      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
    );
  }, [dbMemories, dbNotebookMemories, notebookProfiles, notebooksById]);

  const notebookIndex = useMemo<NotebookIndexView[]>(
    () =>
      notebooks
        .map((notebook) => {
          const dbBundle = dbNotebookMemories.find((bundle) => bundle.notebookId === notebook.id);
          const dbNotebookPublic = (dbBundle?.memories || []).filter(
            (memory) => memory.scope === 'public' && isActive(memory),
          );
          const dbNotebookPrivate = (dbBundle?.memories || []).filter(
            (memory) => memory.scope === 'private' && isActive(memory),
          );
          const localProfile = notebookProfiles.find((item) => item.notebook.id === notebook.id);
          const localPublic = localProfile?.profile.publicMemories.filter(isActive) || [];
          const localPrivate = localProfile?.profile.privateMemories.filter(isActive) || [];
          const localWeak =
            localProfile?.profile.weakPoints.filter((point) => point.status === 'open') || [];
          const relatedPublic = notebookPublicMemories.filter(
            (memory) => memory.notebookId === notebook.id,
          );
          const latest = [...relatedPublic].sort(
            (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
          )[0];

          return {
            notebook,
            publicCount: dbNotebookPublic.length + localPublic.length,
            privateCount: dbNotebookPrivate.length + localPrivate.length,
            weakCount: localWeak.length,
            sourceCount: relatedPublic.reduce(
              (sum, memory) => sum + memory.sourceReferences.length,
              0,
            ),
            latestTitle: latest?.title,
            updatedAt: Math.max(notebook.updatedAt || 0, latest?.updatedAt || 0),
          };
        })
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    [dbNotebookMemories, notebookProfiles, notebookPublicMemories, notebooks],
  );

  const knowledgeSources = useMemo(
    () =>
      course
        ? collectKnowledgeSources({
            course,
            notebooks,
            memories: [...coursePublicMemories, ...notebookPublicMemories],
          })
        : [],
    [course, coursePublicMemories, notebookPublicMemories, notebooks],
  );
  const courseFacts = useMemo(
    () =>
      course
        ? buildCourseFacts({
            course,
            notebooks,
            dbAvailable,
            publicMemoryCount: coursePublicMemories.length + notebookPublicMemories.length,
            privateMemoryCount: privateMemories.length,
          })
        : [],
    [
      course,
      coursePublicMemories.length,
      dbAvailable,
      notebookPublicMemories.length,
      notebooks,
      privateMemories.length,
    ],
  );
  const publicMarkdown = useMemo(
    () =>
      buildCoursePublicMarkdown({
        courseName: course?.name || '课程',
        courseMemories: coursePublicMemories,
        notebookMemories: notebookPublicMemories,
      }),
    [course?.name, coursePublicMemories, notebookPublicMemories],
  );
  const recallPreviewSections = useMemo<RecallPreviewSection[]>(
    () => [
      {
        id: 'facts',
        title: '静态事实',
        subtitle: '课程级当前值',
        items: courseFacts.slice(0, 4).map((fact) => ({
          id: fact.id,
          title: fact.label,
          text: fact.value,
        })),
      },
      {
        id: 'direct',
        title: '解题模板',
        subtitle: '公共记忆抽取',
        items: courseTemplates.slice(0, 3).map((template) => ({
          id: template.id,
          title: template.title,
          text: compactText(template.summary, 120),
        })),
      },
      {
        id: 'semantic',
        title: '笔记本发现',
        subtitle: '公共记忆索引',
        items: notebookPublicMemories.slice(0, 3).map((memory) => ({
          id: memory.id,
          title: memory.notebookName ? `${memory.notebookName}：${memory.title}` : memory.title,
          text: compactText(memory.text, 120),
        })),
      },
      {
        id: 'private',
        title: '私有信号',
        subtitle: '学习状态',
        items: privateMemories.slice(0, 3).map((memory) => ({
          id: memory.id,
          title: memory.title,
          text: compactText(memory.text, 120),
        })),
      },
    ],
    [courseFacts, courseTemplates, notebookPublicMemories, privateMemories],
  );
  const fixedSearchSuggestions = useMemo(() => {
    const firstNotebook = notebookIndex[0]?.notebook.name;
    const firstPublicTitle = coursePublicMemories[0]?.title;
    const weakTitle = privateMemories.find((memory) => memory.kindLabel === '弱点')?.title;
    const suggestions = [
      'Riemann sum 是什么',
      'FTC I 和 FTC II 的区别',
      'u-substitution 的核心想法',
      '幂级数收敛半径怎么判断',
      '分部积分选 u 的原文在哪里',
      '分部积分选 u 学生掌握得怎么样',
      '积分换元的薄弱点在哪里',
      '这周学生的学习情况怎么样',
      '整学期学生问过什么问题',
      '最近学生主要卡在哪些知识点',
      '这门课有哪些解题模板',
      '证明题应该套哪个模板',
      '计算题应该按什么步骤写',
      '本月错题集中在哪些标签',
      '做错的题',
      '做错的积分题目',
      '没做的黎曼积分题目',
      '找一道关于极限定义的题目',
      course?.name ? `${course.name} 里最重要的课程要求是什么` : '',
      firstPublicTitle ? `${firstPublicTitle} 这个规则会影响哪些回答` : '',
      firstNotebook ? `${firstNotebook} 里的核心概念` : '',
      weakTitle ? `${weakTitle} 相关的错题和复习建议` : '',
    ];
    return Array.from(new Set(suggestions.filter(Boolean)));
  }, [course, coursePublicMemories, notebookIndex, privateMemories]);
  const problemSearchSuggestions = useMemo(
    () => shuffledProblemSuggestionTitles(courseProblemSummaries, suggestionBatchSeed),
    [courseProblemSummaries, suggestionBatchSeed],
  );

  if (course === undefined) {
    return (
      <main className="min-h-full bg-[#f3f6fb] text-slate-950 dark:bg-[#0e1117] dark:text-white">
        <div className="mx-auto flex w-full max-w-[92rem] flex-col gap-4 px-3 py-4 md:px-5 lg:px-6">
          <MemoryPageHeader
            title={pageTitle}
            subtitle="正在读取课程公共记忆、笔记本索引和私有学习状态。"
            eyebrow={pageEyebrow}
            backHref="/my-courses"
            backLabel="返回我的课程"
            icon={Brain}
          />
          <div className="flex min-h-[20rem] items-center justify-center">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/80 px-5 py-4 text-sm font-medium text-slate-500 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-300">
              <Loader2 className="size-4 animate-spin text-[#007AFF]" />
              正在读取课程记忆…
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!course) {
    return (
      <main className="min-h-full bg-[#f3f6fb] text-slate-950 dark:bg-[#0e1117] dark:text-white">
        <div className="mx-auto flex w-full max-w-[86rem] flex-col gap-4 px-3 py-4 md:px-5 lg:px-6">
          <MemoryPageHeader
            title={pageTitle}
            subtitle="该课程可能已删除，或当前环境暂时无法加载它。"
            eyebrow={pageEyebrow}
            backHref="/my-courses"
            backLabel="返回我的课程"
            icon={Brain}
          />
          <div className="flex min-h-[20rem] items-center justify-center">
            <div className="max-w-md rounded-3xl border border-slate-200/80 bg-white/86 p-7 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/[0.06]">
              <BookOpen className="mx-auto size-10 text-slate-400" strokeWidth={1.5} />
              <h2 className="mt-4 text-lg font-semibold text-slate-950 dark:text-white">
                未找到课程
              </h2>
              <Link
                href="/my-courses"
                className="mt-5 inline-flex h-9 items-center justify-center rounded-xl bg-[#007AFF] px-4 text-sm font-semibold text-white"
              >
                返回我的课程
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const weakPointCount = privateMemories.filter((memory) => memory.kindLabel === '弱点').length;
  const latestMemoryAt = Math.max(
    course.updatedAt || 0,
    ...coursePublicMemories.map((memory) => memory.updatedAt || 0),
    ...notebookPublicMemories.map((memory) => memory.updatedAt || 0),
    ...privateMemories.map((memory) => memory.updatedAt || 0),
  );
  const metrics = [
    { label: '结构事实', value: courseFacts.length, hint: 'current' },
    { label: '解题模板', value: courseTemplates.length, hint: 'templates' },
    { label: '课程公共', value: coursePublicMemories.length, hint: 'course' },
    { label: '笔记本索引', value: notebookIndex.length, hint: 'notebooks' },
    { label: '知识来源', value: knowledgeSources.length, hint: 'sources' },
    { label: '我的弱点', value: weakPointCount, hint: 'private' },
    { label: '最近更新', value: formatTime(latestMemoryAt) || '暂无', hint: 'memory' },
  ];

  return (
    <main className="min-h-full bg-[#f3f6fb] text-slate-950 dark:bg-[#0e1117] dark:text-white">
      <div className="mx-auto flex w-full max-w-[92rem] flex-col gap-4 px-3 py-4 md:px-5 lg:px-6">
        <MemoryPageHeader
          title={pageTitle}
          subtitle={[course.name, course.courseCode].filter(Boolean).join(' · ')}
          eyebrow={pageEyebrow}
          backHref={`/course/${encodeURIComponent(course.id)}`}
          backLabel="返回课程"
          icon={Brain}
          actions={
            <>
              <Link
                href={
                  pageTitle === '模版库'
                    ? `/course/${encodeURIComponent(course.id)}/memory`
                    : `/course/${encodeURIComponent(course.id)}/memory/templates`
                }
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200/85 bg-white/82 px-3 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:border-blue-200 hover:text-blue-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200 dark:hover:bg-white/[0.1]"
              >
                <Workflow className="size-3.5" strokeWidth={1.8} />
                {pageTitle === '模版库' ? '课程记忆' : '模版库'}
              </Link>
              <span className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200/85 bg-white/82 px-3 text-xs font-semibold text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200">
                <Database className="size-3.5" strokeWidth={1.8} />
                {dbAvailable ? '数据库已连接' : '本地默认记忆'}
              </span>
            </>
          }
        />

        <section className="rounded-[24px] border border-white/80 bg-white/90 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/[0.03] dark:border-white/10 dark:bg-white/[0.065] md:p-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(34rem,0.9fr)]">
            <div className="flex min-w-0 gap-4">
              <div className="flex size-20 shrink-0 items-center justify-center rounded-3xl border border-blue-200/80 bg-blue-50 text-blue-600 shadow-sm dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-200">
                <Brain className="size-8" strokeWidth={1.6} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span>当前课程</span>
                  {course.courseCode ? <span>{course.courseCode}</span> : null}
                  <span>{purposeLabel(course.purpose)}</span>
                </div>
                <h1 className="mt-2 line-clamp-2 text-2xl font-semibold leading-tight tracking-normal text-slate-950 dark:text-white md:text-3xl">
                  {pageTitle === '模版库' ? `${course.name} 模版库` : `${course.name} 记忆控制台`}
                </h1>
                {course.description ? (
                  <p className="mt-2 line-clamp-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {course.description}
                  </p>
                ) : null}
              </div>
            </div>
            <MetricStrip metrics={metrics} />
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <TabButton
            active={activeTab === 'overview'}
            icon={Layers3}
            onClick={() => setActiveTab('overview')}
          >
            总览
          </TabButton>
          <TabButton
            active={activeTab === 'public'}
            icon={Share2}
            onClick={() => setActiveTab('public')}
          >
            公共记忆
          </TabButton>
          <TabButton
            active={activeTab === 'templates'}
            icon={Workflow}
            onClick={() => setActiveTab('templates')}
          >
            模版库
          </TabButton>
          <TabButton
            active={activeTab === 'private'}
            icon={Lock}
            onClick={() => setActiveTab('private')}
          >
            我的学习状态
          </TabButton>
          <TabButton
            active={activeTab === 'search'}
            icon={Search}
            onClick={() => setActiveTab('search')}
          >
            搜索
          </TabButton>
        </div>

        {activeTab === 'overview' ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.24fr)_minmax(24rem,0.76fr)]">
            <div className="grid content-start gap-4">
              <CourseFactsPanel facts={courseFacts} />
              <RecallPreviewPanel sections={recallPreviewSections} />
              <TemplateRegistryPanel templates={courseTemplates} />
              <Panel icon={Share2} subtitle="课程层公共知识与老师约束。" title="课程公共记忆">
                <PublicMemoryList memories={coursePublicMemories} />
              </Panel>
            </div>
            <div className="grid content-start gap-4">
              <NotebookIndexPanel items={notebookIndex} />
              <KnowledgeSourcesPanel sources={knowledgeSources} />
              <PrivateMemoryPanel memories={privateMemories} />
            </div>
          </div>
        ) : null}

        {activeTab === 'templates' ? <TemplateRegistryPanel templates={courseTemplates} /> : null}

        {activeTab === 'public' ? (
          <div className="grid gap-4">
            <Panel icon={FileText} subtitle="课程层公共记忆与笔记本入口。" title="课程公共描述">
              <div className="space-y-4">
                <MarkdownDocument markdown={publicMarkdown} />
                <NotebookMemoryAgentDirectory memories={notebookPublicMemories} />
              </div>
            </Panel>
            <Panel icon={Share2} subtitle="课程级稳定公共记忆。" title="课程公共记忆">
              <PublicMemoryList memories={coursePublicMemories} />
            </Panel>
            <KnowledgeSourcesPanel sources={knowledgeSources} />
          </div>
        ) : null}

        {activeTab === 'private' ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <PrivateMemoryPanel memories={privateMemories} />
            <div className="grid content-start gap-4">
              <Panel icon={Target} subtitle="按课程聚合的复习压力点。" title="待复习弱点">
                {privateMemories.some((memory) => memory.kindLabel === '弱点') ? (
                  <div className="grid gap-2.5">
                    {privateMemories
                      .filter((memory) => memory.kindLabel === '弱点')
                      .slice(0, 12)
                      .map((memory) => (
                        <article
                          key={memory.id}
                          className="rounded-2xl border border-amber-100 bg-amber-50/70 p-3 dark:border-amber-300/14 dark:bg-amber-400/8"
                        >
                          <p className="text-sm font-semibold text-slate-950 dark:text-white">
                            {memory.title}
                          </p>
                          <p className="mt-1 line-clamp-3 text-xs leading-5 text-slate-600 dark:text-slate-300">
                            {memory.text}
                          </p>
                          {memory.notebookName ? (
                            <p className="mt-2 text-[10px] font-bold text-amber-700 dark:text-amber-100">
                              {memory.notebookName}
                            </p>
                          ) : null}
                        </article>
                      ))}
                  </div>
                ) : (
                  <EmptyState>暂无待复习弱点。</EmptyState>
                )}
              </Panel>
              <RecallPreviewPanel sections={recallPreviewSections} />
            </div>
          </div>
        ) : null}

        {activeTab === 'search' ? (
          <CourseMemorySearchPanel
            fixedSuggestions={fixedSearchSuggestions}
            problemSuggestions={problemSearchSuggestions}
            query={searchQuery}
            searchRun={searchRun}
            onQueryChange={setSearchQuery}
            onSearch={runMemorySearch}
          />
        ) : null}
      </div>
    </main>
  );
}
