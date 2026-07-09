'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  AlertCircle,
  ArrowRightLeft,
  BookOpen,
  CheckCircle2,
  CheckSquare,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Code2,
  Ellipsis,
  ExternalLink,
  FileUp,
  Gauge,
  Globe2,
  ImagePlus,
  Loader2,
  Maximize2,
  Play,
  Save,
  Search,
  Sparkles,
  SlidersHorizontal,
  Terminal,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { toast } from '@/lib/notifications/client-toast';
import { cn } from '@/lib/utils';
import {
  getLocalizedProblemContent,
  getLocalizedProblemTitle,
  type NotebookProblemAttemptAnswer,
  type NotebookProblemAttemptRecord,
  type NotebookProblemPublicContent,
} from '@/lib/problem-bank';
import { Button } from '@/components/ui/button';
import { MessageResponse } from '@/components/ai-elements/message';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AnswerComposer, AnswerComposerToolbar } from '@/components/problem-bank/answer-composer';
import { ProblemDraftForm } from '@/components/problem-bank/problem-draft-form';
import { ProblemLanguageToggle } from '@/components/problem-bank/problem-language-toggle';
import { CodeAnswerEditor, highlightPython } from '@/components/problem-bank/code-answer-editor';
import { CodeProblemStatement } from '@/components/problem-bank/code-problem-statement';
import {
  ProblemImageAssets,
  ProblemRichText,
  ProblemTitleText,
} from '@/components/problem-bank/problem-rich-text';
import { problemDraftToPatch } from '@/lib/problem-bank/editor';
import { Input } from '@/components/ui/input';
import {
  AnswerFeedbackSummaryBadge,
  AnswerPreviewPanel,
  AttemptHistoryPanel,
  ChoiceAnswerPreviewPanel,
  FilterRuleRow,
  FormulaReferencePanel,
  PROBLEM_BANK_EMERALD_ACTION_BUTTON_CLASS,
  PROBLEM_BANK_EMERALD_OUTLINE_BUTTON_CLASS,
  PROBLEM_BANK_LIST_GRID_CLASS,
  PROBLEM_BANK_PRIMARY_BUTTON_CLASS,
  PhotoAnswerUploader,
  ProblemDraftPreviewPanel,
  ProblemMetaChip,
  answerComposerPlaceholder,
  difficultyDotClassName,
  difficultyDots,
  difficultyLabel,
  difficultyTextClassName,
  formatProblemNumber,
  latestScoreLabel,
  practiceStateClassName,
  practiceStateLabel,
  problemMetaChips,
  problemTypeVisual,
  renderProblemContentStem,
  supportsPhotoAnswer,
  typeLabel,
  weakTopicBarClass,
  type AnswerPanelTab,
  type PracticeFilter,
  type ProblemInfoTab,
} from '@/components/problem-bank/course-problem-bank-helpers';
import {
  useCourseProblemBankController,
  type CourseCodeRunResult,
  type CourseCodeRunTarget,
  type CourseProblemBankInitialFilters,
  type CourseProblemPracticeAttemptResolvedEvent,
} from '@/components/problem-bank/use-course-problem-bank-controller';
import { CourseProblemImportDialog } from '@/components/problem-bank/course-problem-import-dialog';
import { ProblemAiHelpButton } from '@/components/problem-bank/problem-ai-help-drawer';
import type { NotebookProblemClientRecord } from '@/lib/utils/notebook-problem-api';

type PracticePaneId = 'left' | 'right';
type CodePracticeTab = 'testcase' | 'secret' | 'code' | 'output';
type PracticeAiHelpTab = 'ai-help';
type PracticePanelTab = ProblemInfoTab | AnswerPanelTab | CodePracticeTab | PracticeAiHelpTab;
type PracticePaneTabs = Record<PracticePaneId, PracticePanelTab[]>;
type PracticePaneActive = Record<PracticePaneId, PracticePanelTab>;
type CodeProblemPublicContent = Extract<NotebookProblemPublicContent, { type: 'code' }>;
type CodeProblemTestCase = CodeProblemPublicContent['publicTests'][number];
type CodeTestFile = {
  fileName: string;
  code: string;
};

export type CourseProblemPracticeHeaderState = {
  problemId: string;
  problem: NotebookProblemClientRecord;
  problemTitle: string;
  problemContent: NotebookProblemPublicContent | null;
  currentAnswer: NotebookProblemAttemptAnswer | null;
  latestAttempt: NotebookProblemAttemptRecord | null;
  progressLabel: string;
  progressCurrent: number;
  progressTotal: number;
  notebookLabel: string | null;
  difficultyLabel: string;
  difficultyClassName: string;
  previousLabel: string;
  previousTitle: string;
  previousDisabled: boolean;
  nextLabel: string;
  nextTitle: string;
  nextDisabled: boolean;
  onPrevious: (() => void) | null;
  onNext: (() => void) | null;
};

const FORMULA_PRACTICE_TAB = 'formula' satisfies PracticePanelTab;
const AI_HELP_PRACTICE_TAB = 'ai-help' satisfies PracticeAiHelpTab;
const PROBLEM_INFO_TABS = [
  'description',
  FORMULA_PRACTICE_TAB,
  'edit',
] as const satisfies readonly ProblemInfoTab[];
const ANSWER_PANE_TABS = [
  'answer',
  'preview',
  'solution',
  'history',
] as const satisfies readonly AnswerPanelTab[];
const CODE_PRACTICE_TABS: CodePracticeTab[] = ['testcase', 'secret', 'code', 'output'];
const PRACTICE_TAB_DRAG_TYPE = 'application/x-openmaic-practice-tab';
const DEFAULT_PRACTICE_PANE_TABS: PracticePaneTabs = {
  left: ['description', FORMULA_PRACTICE_TAB, 'edit'],
  right: ['answer', 'preview', 'solution', 'history'],
};

type PracticeAiHelpState = {
  problemId: string;
  title: string;
  answer: string;
  status: 'loading' | 'ready' | 'error';
  error?: string;
};

type PracticeAiHelpController = {
  state: PracticeAiHelpState | null;
  hasHelp: boolean;
  active: boolean;
  onActiveChange: (active: boolean) => void;
};

const practiceAiHelpMarkdownClassName = cn(
  'max-w-none text-sm leading-7 text-slate-800 dark:text-slate-100',
  '[&_p]:my-3 [&_ul]:my-3 [&_ol]:my-3 [&_li]:my-1',
  '[&_h1]:mb-3 [&_h1]:mt-5 [&_h1]:text-xl [&_h1]:font-semibold',
  '[&_h2]:mb-3 [&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-semibold',
  '[&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-semibold',
  '[&_code]:rounded [&_code]:bg-white [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono dark:[&_code]:bg-slate-900',
  '[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-slate-200 [&_pre]:bg-white [&_pre]:p-3 dark:[&_pre]:border-slate-800 dark:[&_pre]:bg-slate-950',
);

function isProblemInfoPracticeTab(tab: PracticePanelTab): tab is ProblemInfoTab {
  return (PROBLEM_INFO_TABS as readonly string[]).includes(tab);
}

function isAnswerPracticeTab(tab: PracticePanelTab): tab is AnswerPanelTab {
  return (ANSWER_PANE_TABS as readonly string[]).includes(tab);
}

function isCodePracticeTab(tab: PracticePanelTab): tab is CodePracticeTab {
  return (CODE_PRACTICE_TABS as readonly string[]).includes(tab);
}

function normalizePracticePaneTabs(
  tabs: PracticePaneTabs,
  supportsFormulaTab: boolean,
  canEditProblems: boolean,
  supportsPreviewTab: boolean,
  codeTabs: CodePracticeTab[],
  hideEditTab = false,
  hideSolutionTab = false,
  supportsAiHelpTab = false,
): PracticePaneTabs {
  const nextTabs: PracticePaneTabs = {
    left: [...tabs.left],
    right: [...tabs.right],
  };

  const removeTab = (tab: PracticePanelTab) => {
    nextTabs.left = nextTabs.left.filter((item) => item !== tab);
    nextTabs.right = nextTabs.right.filter((item) => item !== tab);
  };

  const hasTab = (tab: PracticePanelTab) =>
    nextTabs.left.includes(tab) || nextTabs.right.includes(tab);

  const ensureLeftTabAfter = (tab: PracticePanelTab, anchor: PracticePanelTab) => {
    if (hasTab(tab)) return;
    const anchorIndex = nextTabs.left.indexOf(anchor);
    nextTabs.left =
      anchorIndex >= 0
        ? [...nextTabs.left.slice(0, anchorIndex + 1), tab, ...nextTabs.left.slice(anchorIndex + 1)]
        : [...nextTabs.left, tab];
  };

  const ensureRightTabAfter = (tab: PracticePanelTab, anchor: PracticePanelTab) => {
    if (hasTab(tab)) return;
    const anchorIndex = nextTabs.right.indexOf(anchor);
    nextTabs.right =
      anchorIndex >= 0
        ? [
            ...nextTabs.right.slice(0, anchorIndex + 1),
            tab,
            ...nextTabs.right.slice(anchorIndex + 1),
          ]
        : [...nextTabs.right, tab];
  };

  if (supportsFormulaTab) {
    ensureLeftTabAfter(FORMULA_PRACTICE_TAB, 'description');
  } else {
    removeTab(FORMULA_PRACTICE_TAB);
  }

  if (canEditProblems && !hideEditTab) {
    ensureLeftTabAfter('edit', hasTab(FORMULA_PRACTICE_TAB) ? FORMULA_PRACTICE_TAB : 'description');
  } else {
    removeTab('edit');
  }

  if (hideSolutionTab) {
    removeTab('solution');
  }

  if (supportsPreviewTab) {
    ensureRightTabAfter('preview', 'answer');
  } else {
    removeTab('preview');
  }

  if (codeTabs.length > 0) {
    removeTab('answer');
    CODE_PRACTICE_TABS.forEach((tab) => {
      if (!codeTabs.includes(tab)) removeTab(tab);
    });
    const missingCodeTestTabs = codeTabs.filter(
      (tab) => tab !== 'code' && tab !== 'output' && !hasTab(tab),
    );
    missingCodeTestTabs.forEach((tab) => {
      ensureLeftTabAfter(tab, tab === 'secret' ? 'testcase' : 'description');
    });
    const missingCodeActionTabs = codeTabs.filter(
      (tab) => (tab === 'code' || tab === 'output') && !hasTab(tab),
    );
    if (missingCodeActionTabs.length > 0) {
      nextTabs.right = [...missingCodeActionTabs, ...nextTabs.right];
    }
  } else {
    CODE_PRACTICE_TABS.forEach(removeTab);
    if (!hasTab('answer')) {
      nextTabs.right = ['answer', ...nextTabs.right];
    }
  }

  if (supportsAiHelpTab) {
    ensureRightTabAfter(AI_HELP_PRACTICE_TAB, codeTabs.includes('code') ? 'code' : 'answer');
  } else {
    removeTab(AI_HELP_PRACTICE_TAB);
  }

  if (nextTabs.left.length === 0) {
    nextTabs.left = ['description'];
    nextTabs.right = nextTabs.right.filter((tab) => tab !== 'description');
  }
  if (nextTabs.right.length === 0) {
    const fallbackRightTab = codeTabs.includes('code') ? 'code' : 'answer';
    nextTabs.right = [fallbackRightTab];
    nextTabs.left = nextTabs.left.filter((tab) => tab !== fallbackRightTab);
  }
  return nextTabs;
}

function normalizePracticePaneActive(
  active: PracticePaneActive,
  tabs: PracticePaneTabs,
): PracticePaneActive {
  return {
    left: tabs.left.includes(active.left) ? active.left : (tabs.left[0] ?? 'description'),
    right: tabs.right.includes(active.right) ? active.right : (tabs.right[0] ?? 'answer'),
  };
}

function extractExecBody(expression: string) {
  const match = expression.match(/exec\(("(?:(?:\\.)|[^"\\])*")\s*,/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as string;
  } catch {
    return null;
  }
}

function sanitizePythonIdentifier(value: string | undefined, fallback: string) {
  const normalized = (value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const safe = normalized || fallback;
  const prefixed = /^[a-z_]/.test(safe) ? safe : `case_${safe}`;
  return prefixed.startsWith('test_') ? prefixed : `test_${prefixed}`;
}

function pythonLiteral(value: unknown): string {
  if (value === null) return 'None';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'None';
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(pythonLiteral).join(', ')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .map(([key, item]) => `${pythonLiteral(key)}: ${pythonLiteral(item)}`)
      .join(', ')}}`;
  }
  return 'None';
}

function formatExpectedForPython(expected: string) {
  try {
    return pythonLiteral(JSON.parse(expected));
  } catch {
    return expected.trim() || 'None';
  }
}

function indentPythonBlock(source: string, spaces = 8) {
  const prefix = ' '.repeat(spaces);
  return source
    .trim()
    .split(/\r?\n/)
    .map((line) => (line.trim() ? `${prefix}${line}` : ''))
    .join('\n');
}

function codeTestMethodSource(testCase: CodeProblemTestCase, index: number) {
  const methodName = sanitizePythonIdentifier(
    testCase.id || testCase.description,
    `case_${index + 1}`,
  );
  const recoveredBody = extractExecBody(testCase.expression);
  const body =
    recoveredBody?.trim() ||
    `self.assertEqual(${testCase.expression.trim()}, ${formatExpectedForPython(testCase.expected)})`;

  return [`    def ${methodName}(self):`, indentPythonBlock(body)].join('\n');
}

function buildCodeTestFile(
  testCases: CodeProblemTestCase[],
  fileName: string,
  className: 'PublicTests' | 'SecretTests',
) {
  if (testCases.length === 0) {
    return [`# ${fileName}`, '', '# No tests available.'].join('\n');
  }

  return [
    `# ${fileName}`,
    'import unittest',
    'from submission import *',
    '',
    '',
    `class ${className}(unittest.TestCase):`,
    testCases.map(codeTestMethodSource).join('\n\n'),
    '',
    '',
    'if __name__ == "__main__":',
    '    unittest.main()',
  ].join('\n');
}

function buildCodeTestFiles(
  content: CodeProblemPublicContent,
  secretTests?: CodeProblemTestCase[],
) {
  return {
    publicFile: {
      fileName: 'public_tests.py',
      code: buildCodeTestFile(content.publicTests, 'public_tests.py', 'PublicTests'),
    },
    secretFile: secretTests?.length
      ? {
          fileName: 'secret_tests.py',
          code: buildCodeTestFile(secretTests, 'secret_tests.py', 'SecretTests'),
        }
      : undefined,
  };
}

function CodeTestcasePanel({ file, locale }: { file?: CodeTestFile; locale: 'zh-CN' | 'en-US' }) {
  const lineNumbers = file
    ? Array.from({ length: Math.max(1, file.code.split('\n').length) }, (_, index) => index + 1)
    : [];

  return (
    <div className="min-h-0 flex-1 overflow-hidden bg-white dark:bg-slate-950">
      {file ? (
        <div className="flex h-full min-h-0 flex-col">
          <div className="grid min-h-0 flex-1 grid-cols-[3.25rem_minmax(0,1fr)] overflow-auto bg-white font-mono text-[13px] leading-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
            <pre className="select-none border-r border-slate-200 bg-slate-50 px-3 py-4 text-right text-slate-400 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-500">
              {lineNumbers.join('\n')}
            </pre>
            <pre className="min-w-max whitespace-pre px-4 py-4">
              <code>{highlightPython(file.code)}</code>
            </pre>
          </div>
        </div>
      ) : (
        <div className="flex min-h-[220px] items-center justify-center px-4 text-center text-sm text-slate-400">
          {locale === 'zh-CN' ? '暂无测试用例。' : 'No test cases yet.'}
        </div>
      )}
    </div>
  );
}

function SolutionCodeBlock({ code, language }: { code: string; language?: string }) {
  const isPython = !language || language.toLowerCase() === 'python';

  return (
    <pre
      className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-[13px] leading-6 text-slate-900 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-100"
      style={{ tabSize: 4 }}
    >
      <code className="block min-w-max whitespace-pre">
        {isPython ? highlightPython(code) : code}
      </code>
    </pre>
  );
}

const CODE_OPTION_LANGUAGE_ALIASES: Record<string, string> = {
  c: 'c',
  'c++': 'cpp',
  cpp: 'cpp',
  css: 'css',
  html: 'html',
  java: 'java',
  javascript: 'javascript',
  js: 'javascript',
  py: 'python',
  python: 'python',
  racket: 'racket',
  scheme: 'scheme',
  sql: 'sql',
  ts: 'typescript',
  typescript: 'typescript',
};

function looksLikeCodeLine(line: string): boolean {
  return /^(?:class|def|elif|else|for|from|if|import|return|while)\b|[=(){}\[\]:;]|^\s{2,}\S/.test(
    line,
  );
}

function parseCodeChoiceLabel(label: string): { code: string; language?: string } | null {
  const trimmed = label.trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/^```([A-Za-z0-9+#-]*)\s*\n([\s\S]*?)\n?```$/);
  if (fenced) {
    return {
      language: CODE_OPTION_LANGUAGE_ALIASES[fenced[1]?.toLowerCase() ?? ''] ?? fenced[1],
      code: fenced[2].trim(),
    };
  }

  const lines = trimmed.split(/\r?\n/).map((line) => line.replace(/\s+$/g, ''));
  const firstLine = lines[0]?.trim().replace(/:$/, '').toLowerCase() ?? '';
  const language = CODE_OPTION_LANGUAGE_ALIASES[firstLine];
  if (language && lines.length > 1) {
    const code = lines.slice(1).join('\n').trim();
    return code ? { language, code } : null;
  }

  if (lines.length > 1 && lines.some(looksLikeCodeLine)) {
    return { code: trimmed };
  }

  return null;
}

function SolutionChoiceOptions({
  options,
  locale,
}: {
  options: Array<{ id: string; label: string }>;
  locale: 'zh-CN' | 'en-US';
}) {
  return (
    <div className="space-y-2">
      {options.map((option) => {
        const parsedCode = parseCodeChoiceLabel(option.label);

        return (
          <div
            key={option.id}
            className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-sm shadow-sm dark:border-emerald-500/30 dark:bg-emerald-500/10"
          >
            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-100">
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-emerald-600 px-2 font-mono text-xs font-bold text-white shadow-sm shadow-emerald-950/10">
                {option.id}
              </span>
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span className="text-xs font-semibold">
                {locale === 'zh-CN' ? '正确选项' : 'Correct option'}
              </span>
            </div>
            {parsedCode ? (
              <div className="mt-3 space-y-2">
                {parsedCode.language ? (
                  <span className="inline-flex rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                    {parsedCode.language}
                  </span>
                ) : null}
                <SolutionCodeBlock code={parsedCode.code} language={parsedCode.language} />
              </div>
            ) : (
              <ProblemRichText
                content={option.label}
                className="mt-3 text-slate-800 dark:text-slate-100 [&_.problem-rich-code-block]:my-0 [&_.problem-rich-code-block]:max-w-full"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function CodeAnswerWorkspace({
  value,
  onChange,
  disabled,
  locale,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  locale: 'zh-CN' | 'en-US';
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white dark:bg-slate-950">
      <div className="min-h-0 flex-1 overflow-hidden">
        <CodeAnswerEditor
          value={value}
          onChange={onChange}
          disabled={disabled}
          locale={locale}
          className="h-full min-h-0 rounded-none border-0 shadow-none focus-within:ring-0"
          placeholder={
            locale === 'zh-CN' ? '在这里编写代码并提交。' : 'Write code here and submit.'
          }
        />
      </div>
    </div>
  );
}

function CodeRunOutputPanel({
  result,
  running,
  locale,
}: {
  result?: CourseCodeRunResult;
  running: boolean;
  locale: 'zh-CN' | 'en-US';
}) {
  const attempt = result?.attempt;
  const outputResult = attempt?.result;
  const runTarget = result?.target ?? outputResult?.runTarget ?? 'public';
  const caseResults = outputResult?.caseResults ?? outputResult?.publicCases ?? [];
  const testSummary =
    runTarget === 'secret'
      ? (outputResult?.secretSummary ?? null)
      : (outputResult?.publicSummary ?? null);
  const testSummaryLabel =
    runTarget === 'secret'
      ? locale === 'zh-CN'
        ? '隐藏测试'
        : 'Secret tests'
      : locale === 'zh-CN'
        ? '公开测试'
        : 'Public tests';
  const error = result?.error;
  const status = attempt?.status ?? (error ? 'error' : null);
  const allPassed = status === 'passed';
  const statusLabel = running
    ? locale === 'zh-CN'
      ? '正在运行'
      : 'Running'
    : status === 'passed'
      ? runTarget === 'code'
        ? locale === 'zh-CN'
          ? '运行完成'
          : 'Finished'
        : locale === 'zh-CN'
          ? '测试通过'
          : 'Passed'
      : status
        ? locale === 'zh-CN'
          ? runTarget === 'code'
            ? '运行出错'
            : '测试未通过'
          : 'Failed'
        : locale === 'zh-CN'
          ? '等待运行'
          : 'Ready';
  const scriptStdout = outputResult?.stdout ?? '';
  const scriptError = outputResult?.error ?? '';
  const hasScriptOutput = Boolean(scriptStdout || scriptError);
  const feedback =
    error ||
    scriptError ||
    (locale === 'zh-CN'
      ? outputResult?.feedback
          ?.replaceAll('Public tests', '公开测试')
          .replaceAll('Secret tests', '隐藏测试')
      : outputResult?.feedback) ||
    (locale === 'zh-CN' ? '点击运行查看运行结果。' : 'Run code to see output.');

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-white dark:bg-slate-950">
      <div className="flex min-h-full flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <span
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-xs font-semibold ring-1',
              running
                ? 'bg-sky-50 text-sky-700 ring-sky-100 dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-500/20'
                : allPassed
                  ? 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/20'
                  : status
                    ? 'bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-500/20'
                    : 'bg-slate-50 text-slate-500 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800',
            )}
          >
            {running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : allPassed ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : status ? (
              <AlertCircle className="h-3.5 w-3.5" />
            ) : (
              <Terminal className="h-3.5 w-3.5" />
            )}
            {statusLabel}
          </span>
          {testSummary ? (
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {testSummaryLabel}: {testSummary.passed}/{testSummary.total}
            </span>
          ) : null}
          {result?.ranAt ? (
            <span className="ml-auto text-xs text-slate-400">
              {new Date(result.ranAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
          ) : null}
        </div>

        <div className="border-b border-slate-100 px-4 py-3 text-sm leading-6 text-slate-700 dark:border-slate-800 dark:text-slate-200">
          {feedback}
        </div>

        {hasScriptOutput ? (
          <div className="space-y-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            {scriptStdout ? (
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {locale === 'zh-CN' ? '标准输出' : 'stdout'}
                </p>
                <pre className="overflow-auto rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs leading-5 text-slate-800 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-100">
                  {scriptStdout}
                </pre>
              </div>
            ) : null}
            {scriptError ? (
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-rose-400">
                  {locale === 'zh-CN' ? '错误' : 'error'}
                </p>
                <pre className="overflow-auto rounded-md border border-rose-100 bg-rose-50 px-3 py-2 font-mono text-xs leading-5 text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-100">
                  {scriptError}
                </pre>
              </div>
            ) : null}
          </div>
        ) : null}

        {caseResults.length > 0 ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {caseResults.map((testCase, index) => {
              const hasDetails = Boolean(testCase.stdout || testCase.error || testCase.actual);
              return (
                <section key={`${testCase.id}-${index}`} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'inline-flex size-5 items-center justify-center rounded-full',
                        testCase.passed
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200'
                          : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200',
                      )}
                    >
                      {testCase.passed ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <X className="h-3.5 w-3.5" />
                      )}
                    </span>
                    <h3 className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {testCase.description || testCase.id || `case_${index + 1}`}
                    </h3>
                  </div>

                  {hasDetails ? (
                    <div className="mt-3 space-y-2">
                      {testCase.stdout ? (
                        <div>
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                            {locale === 'zh-CN' ? '标准输出' : 'stdout'}
                          </p>
                          <pre className="overflow-auto rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs leading-5 text-slate-800 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-100">
                            {testCase.stdout}
                          </pre>
                        </div>
                      ) : null}
                      {testCase.error ? (
                        <div>
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-rose-400">
                            {locale === 'zh-CN' ? '错误' : 'error'}
                          </p>
                          <pre className="overflow-auto rounded-md border border-rose-100 bg-rose-50 px-3 py-2 font-mono text-xs leading-5 text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-100">
                            {testCase.error}
                          </pre>
                        </div>
                      ) : null}
                      {testCase.actual ? (
                        <div>
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                            {locale === 'zh-CN' ? '实际输出' : 'actual'}
                          </p>
                          <pre className="overflow-auto rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-xs leading-5 text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
                            {testCase.actual}
                          </pre>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-400">
                      {locale === 'zh-CN' ? '没有额外输出。' : 'No additional output.'}
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-[220px] flex-1 items-center justify-center px-4 text-center text-sm text-slate-400">
            {running ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {locale === 'zh-CN' ? '正在运行代码…' : 'Running code...'}
              </>
            ) : runTarget === 'code' && status === 'passed' ? (
              <span>
                {locale === 'zh-CN'
                  ? '代码运行完成，没有标准输出。'
                  : 'Code finished with no stdout.'}
              </span>
            ) : (
              <span>
                {locale === 'zh-CN' ? '点击运行查看运行结果。' : 'Run code to see output.'}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function CourseProblemBankView({
  courseId,
  initialNotebookId,
  initialProblemId,
  initialFilters,
  mode = 'bank',
  practiceBackLabel,
  practiceHeaderPlacement = 'internal',
  practiceProblemIds,
  initialPracticeAnswers,
  onPracticeBack,
  onPracticeProblemChange,
  onPracticeAnswerDraftChange,
  onPracticeAttemptResolved,
  onPracticeHeaderStateChange,
  practiceAiHelp,
}: {
  courseId: string;
  initialNotebookId?: string;
  initialProblemId?: string;
  initialFilters?: CourseProblemBankInitialFilters;
  mode?: 'bank' | 'practice';
  practiceBackLabel?: string;
  practiceHeaderPlacement?: 'internal' | 'external';
  practiceProblemIds?: string[];
  initialPracticeAnswers?: Record<string, NotebookProblemAttemptAnswer | null | undefined>;
  onPracticeBack?: () => void;
  onPracticeProblemChange?: (problemId: string) => void;
  onPracticeAnswerDraftChange?: (
    problemId: string,
    answer: NotebookProblemAttemptAnswer | null,
  ) => void;
  onPracticeAttemptResolved?: (event: CourseProblemPracticeAttemptResolvedEvent) => void;
  onPracticeHeaderStateChange?: (state: CourseProblemPracticeHeaderState | null) => void;
  practiceAiHelp?: PracticeAiHelpController;
}) {
  const view = useCourseProblemBankController({
    courseId,
    initialNotebookId,
    initialProblemId,
    initialFilters,
    initialPracticeAnswers,
    practiceProblemIds,
    mode,
    onPracticeAttemptResolved,
  });
  const {
    activeBankFilterCount,
    bankStats,
    blankAnswers,
    canEditProblems,
    choiceAnswers,
    codeAnswers,
    codeRunResults,
    courseHasTranslations,
    courseName,
    currentNotebookProblemPosition,
    currentProblemPage,
    deletingProblem,
    difficultyFilter,
    difficultyFilterOptions,
    filteredProblems,
    handleAddPhotoAnswerFiles,
    handleDeleteProblem,
    handleEditingDraftChange,
    handleProblemInfoTabChange,
    handleRemovePhotoAnswer,
    handleRunCodeAnswer,
    handleSaveAssignment,
    handleSubmitInlineAnswer,
    handleUpdateProblem,
    insertFormulaIntoAnswer,
    isPracticeMode,
    loading,
    locale,
    moveDialogOpen,
    moveNotebookId,
    navigateToPracticeProblem,
    nextPracticeIsChapterJump,
    nextPracticeTarget,
    notebookFilter,
    notebookFilterOptions,
    notebooks,
    pageEndIndex,
    pageStartIndex,
    paginatedProblems,
    photoAnswers,
    practiceFilter,
    practiceFilterOptions,
    practiceNavigationProblemCount,
    previousPracticeIsChapterJump,
    previousPracticeTarget,
    problemLanguage,
    problemPageCount,
    problems,
    router,
    runningCode,
    runningCodeTarget,
    savingAssignment,
    searchQuery,
    selectedAnswerMode,
    selectedAnswerController,
    selectedAnswerFeedback,
    selectedProblem,
    selectedProblemAttempts,
    selectedProblemAttemptsLoading,
    selectedProblemContent,
    selectedProblemEditDraft,
    selectedProblemHasTranslation,
    selectedProblemId,
    selectedProblemNotebook,
    selectedProblemNotebookLabel,
    selectedProblemPoints,
    selectedProblemSolutionSections,
    selectedProblemTitle,
    selectedTextAnswerValue,
    setAnswerFeedbackByProblemId,
    setAnswerModes,
    setAnswerPanelTab,
    setBlankAnswers,
    setChoiceAnswers,
    setCodeAnswers,
    setDifficultyFilter,
    setImportMode,
    setImportOpen,
    setMoveDialogOpen,
    setMoveNotebookId,
    setNotebookFilter,
    setPracticeFilter,
    setProblemLanguage,
    setProblemPage,
    setSearchQuery,
    setSelectedProblemId,
    setSelectedTextAnswer,
    setStatusFilter,
    setTypeFilter,
    showSidebarAnswerTools,
    statusFilter,
    statusFilterOptions,
    submittingAnswer,
    textAnswers,
    typeFilter,
    typeFilterOptions,
    visibleProblemPreviewDraft,
  } = view;
  const [practicePaneTabs, setPracticePaneTabs] = useState<PracticePaneTabs>(() => ({
    left: [...DEFAULT_PRACTICE_PANE_TABS.left],
    right: [...DEFAULT_PRACTICE_PANE_TABS.right],
  }));
  const [practicePaneActive, setPracticePaneActive] = useState<PracticePaneActive>({
    left: 'description',
    right: 'answer',
  });
  const [draggingPracticeTab, setDraggingPracticeTab] = useState<PracticePanelTab | null>(null);
  const selectedProblemSupportsFormulaTab =
    !selectedProblem || supportsPhotoAnswer(selectedProblem);
  const editingProblemPaneSelected =
    canEditProblems && (practicePaneActive.left === 'edit' || practicePaneActive.right === 'edit');
  const selectedProblemSupportsPreviewTab =
    editingProblemPaneSelected ||
    !selectedProblem ||
    (selectedProblem.type !== 'choice' &&
      selectedProblem.type !== 'fill_blank' &&
      selectedProblem.type !== 'code');
  const selectedProblemCurrentAnswer: NotebookProblemAttemptAnswer | null = useMemo(() => {
    if (!selectedProblem) return null;
    if (selectedProblem.type === 'choice') {
      return { selectedOptionIds: choiceAnswers[selectedProblem.id] ?? [] };
    }
    if (selectedProblem.type === 'fill_blank') {
      return { blanks: blankAnswers[selectedProblem.id] ?? {} };
    }
    if (selectedProblem.type === 'code') {
      return {
        code:
          codeAnswers[selectedProblem.id] ??
          (selectedProblemContent?.type === 'code' ? selectedProblemContent.starterCode : '') ??
          '',
      };
    }
    return { text: textAnswers[selectedProblem.id] ?? '' };
  }, [blankAnswers, choiceAnswers, codeAnswers, selectedProblem, selectedProblemContent, textAnswers]);
  const latestPracticeDraftSignatureRef = useRef('');

  useEffect(() => {
    if (!isPracticeMode || !selectedProblemId) return;
    onPracticeProblemChange?.(selectedProblemId);
  }, [isPracticeMode, onPracticeProblemChange, selectedProblemId]);

  useEffect(() => {
    if (!isPracticeMode || !selectedProblem?.id) return;
    const signature = `${selectedProblem.id}:${JSON.stringify(selectedProblemCurrentAnswer ?? null)}`;
    if (latestPracticeDraftSignatureRef.current === signature) return;
    latestPracticeDraftSignatureRef.current = signature;
    onPracticeAnswerDraftChange?.(selectedProblem.id, selectedProblemCurrentAnswer);
  }, [
    isPracticeMode,
    onPracticeAnswerDraftChange,
    selectedProblem?.id,
    selectedProblemCurrentAnswer,
  ]);
  const selectedProblemLatestDetailedAttempt = selectedProblemAttempts[0] ?? null;
  const selectedProblemCodeTabs: CodePracticeTab[] =
    selectedProblem?.type === 'code' && selectedProblemContent?.type === 'code'
      ? canEditProblems && (selectedProblem.secretJudge?.secretTests?.length ?? 0) > 0
        ? ['testcase', 'secret', 'code', 'output']
        : ['testcase', 'code', 'output']
      : [];
  const visiblePracticePaneTabs = normalizePracticePaneTabs(
    practicePaneTabs,
    selectedProblemSupportsFormulaTab,
    canEditProblems,
    selectedProblemSupportsPreviewTab,
    selectedProblemCodeTabs,
    practiceHeaderPlacement === 'external',
    practiceHeaderPlacement === 'external',
    Boolean(practiceAiHelp),
  );
  const normalizedPracticePaneActive = normalizePracticePaneActive(
    practicePaneActive,
    visiblePracticePaneTabs,
  );
  const visiblePracticePaneActive: PracticePaneActive =
    practiceAiHelp?.active && visiblePracticePaneTabs.right.includes(AI_HELP_PRACTICE_TAB)
      ? { ...normalizedPracticePaneActive, right: AI_HELP_PRACTICE_TAB }
      : normalizedPracticePaneActive;
  const visiblePracticePanelTabs = new Set([
    ...visiblePracticePaneTabs.left,
    ...visiblePracticePaneTabs.right,
  ]);
  const visibleDraggingPracticeTab =
    draggingPracticeTab && visiblePracticePanelTabs.has(draggingPracticeTab)
      ? draggingPracticeTab
      : null;
  const problemEditPaneActive =
    canEditProblems &&
    (visiblePracticePaneActive.left === 'edit' || visiblePracticePaneActive.right === 'edit');
  const reviewPracticeProblemIds = Array.from(new Set(practiceProblemIds ?? []));
  const isReviewPracticeMode = isPracticeMode && reviewPracticeProblemIds.length > 0;
  const reviewPracticeProblems = isReviewPracticeMode
    ? reviewPracticeProblemIds
        .map((problemId) => problems.find((problem) => problem.id === problemId))
        .filter((problem): problem is (typeof problems)[number] => Boolean(problem))
    : [];
  const reviewPracticeIndex =
    isReviewPracticeMode && selectedProblem
      ? reviewPracticeProblems.findIndex((problem) => problem.id === selectedProblem.id)
      : -1;
  const headerPreviousPracticeTarget =
    isReviewPracticeMode && reviewPracticeIndex > 0
      ? reviewPracticeProblems[reviewPracticeIndex - 1]
      : isReviewPracticeMode
        ? null
        : previousPracticeTarget;
  const headerNextPracticeTarget =
    isReviewPracticeMode && reviewPracticeIndex >= 0
      ? (reviewPracticeProblems[reviewPracticeIndex + 1] ?? null)
      : isReviewPracticeMode
        ? null
        : nextPracticeTarget;
  const practiceHeaderProgressCurrent =
    isReviewPracticeMode && reviewPracticeIndex >= 0
      ? reviewPracticeIndex + 1
      : currentNotebookProblemPosition > 0
        ? currentNotebookProblemPosition
        : 0;
  const practiceHeaderProgressTotal = isReviewPracticeMode
    ? reviewPracticeProblems.length
    : practiceNavigationProblemCount;
  const handlePracticeTargetChange = useCallback(
    (problem: (typeof problems)[number]) => {
      if (isReviewPracticeMode) {
        setSelectedProblemId(problem.id);
        return;
      }
      navigateToPracticeProblem(problem);
    },
    [isReviewPracticeMode, navigateToPracticeProblem, setSelectedProblemId],
  );
  const practiceHeaderProgressLabel = (() => {
    if (isReviewPracticeMode) {
      return reviewPracticeIndex >= 0
        ? `${reviewPracticeIndex + 1}/${reviewPracticeProblems.length}`
        : '1/1';
    }
    if (currentNotebookProblemPosition > 0) {
      return `${currentNotebookProblemPosition}/${practiceNavigationProblemCount}`;
    }
    return locale === 'zh-CN' ? '未归类' : 'Unassigned';
  })();
  const previousPracticeHeaderLabel =
    !isReviewPracticeMode && previousPracticeIsChapterJump
      ? locale === 'zh-CN'
        ? '上一章'
        : 'Prev chapter'
      : locale === 'zh-CN'
        ? '上一题'
        : 'Prev';
  const nextPracticeHeaderLabel =
    !isReviewPracticeMode && nextPracticeIsChapterJump
      ? locale === 'zh-CN'
        ? '下一章'
        : 'Next chapter'
      : locale === 'zh-CN'
        ? '下一题'
        : 'Next';
  const practiceHeaderState = useMemo<CourseProblemPracticeHeaderState | null>(() => {
    if (!isPracticeMode || !selectedProblem) return null;
    return {
      problemId: selectedProblem.id,
      problem: selectedProblem,
      problemTitle: selectedProblemTitle,
      problemContent: selectedProblemContent,
      currentAnswer: selectedProblemCurrentAnswer,
      latestAttempt: selectedProblemLatestDetailedAttempt,
      progressLabel: practiceHeaderProgressLabel,
      progressCurrent: practiceHeaderProgressCurrent,
      progressTotal: practiceHeaderProgressTotal,
      notebookLabel: selectedProblemNotebookLabel || null,
      difficultyLabel: difficultyLabel(selectedProblem.difficulty, locale),
      difficultyClassName: difficultyTextClassName(selectedProblem.difficulty),
      previousLabel: previousPracticeHeaderLabel,
      previousTitle: headerPreviousPracticeTarget
        ? headerPreviousPracticeTarget.title
        : locale === 'zh-CN'
          ? '没有上一题'
          : 'No previous problem',
      previousDisabled: !headerPreviousPracticeTarget,
      nextLabel: nextPracticeHeaderLabel,
      nextTitle: headerNextPracticeTarget
        ? headerNextPracticeTarget.title
        : locale === 'zh-CN'
          ? '没有下一题'
          : 'No next problem',
      nextDisabled: !headerNextPracticeTarget,
      onPrevious: headerPreviousPracticeTarget
        ? () => handlePracticeTargetChange(headerPreviousPracticeTarget)
        : null,
      onNext: headerNextPracticeTarget
        ? () => handlePracticeTargetChange(headerNextPracticeTarget)
        : null,
    };
  }, [
    handlePracticeTargetChange,
    headerNextPracticeTarget,
    headerPreviousPracticeTarget,
    isPracticeMode,
    locale,
    nextPracticeHeaderLabel,
    practiceHeaderProgressCurrent,
    practiceHeaderProgressLabel,
    practiceHeaderProgressTotal,
    previousPracticeHeaderLabel,
    selectedProblem,
    selectedProblemContent,
    selectedProblemCurrentAnswer,
    selectedProblemLatestDetailedAttempt,
    selectedProblemNotebookLabel,
    selectedProblemTitle,
  ]);

  useEffect(() => {
    if (!onPracticeHeaderStateChange) return;
    onPracticeHeaderStateChange(practiceHeaderState);
    return () => {
      onPracticeHeaderStateChange(null);
    };
  }, [onPracticeHeaderStateChange, practiceHeaderState]);

  const handleSubmitAndShowHistory = async () => {
    const submitted = await handleSubmitInlineAnswer();
    if (!submitted) return;
    setPracticePaneActive((prev) => {
      if (visiblePracticePaneTabs.right.includes('history')) {
        return { ...prev, right: 'history' };
      }
      if (visiblePracticePaneTabs.left.includes('history')) {
        return { ...prev, left: 'history' };
      }
      return prev;
    });
  };
  const handleRunCodeAndShowOutput = async (pane: PracticePaneId, target: CourseCodeRunTarget) => {
    const ran = await handleRunCodeAnswer(target);
    if (!ran || !visiblePracticePanelTabs.has('output')) return;
    setPracticePaneActive((prev) => ({
      ...prev,
      [pane]: 'output',
    }));
  };
  const practiceTabLabel = (tab: PracticePanelTab) => {
    switch (tab) {
      case 'description':
        return locale === 'zh-CN' ? '题目描述' : 'Description';
      case 'formula':
        return locale === 'zh-CN' ? '公式表' : 'Formula';
      case 'edit':
        return locale === 'zh-CN' ? '编辑题目' : 'Edit';
      case 'testcase':
        return locale === 'zh-CN' ? '测试用例' : 'Testcase';
      case 'secret':
        return locale === 'zh-CN' ? '隐藏测试' : 'Secret Test';
      case 'code':
        return locale === 'zh-CN' ? '代码' : 'Code';
      case 'output':
        return locale === 'zh-CN' ? '运行结果' : 'Output';
      case 'answer':
        return locale === 'zh-CN' ? '作答' : 'Answer';
      case 'preview':
        return problemEditPaneActive
          ? locale === 'zh-CN'
            ? '预览题目'
            : 'Problem preview'
          : locale === 'zh-CN'
            ? '预览'
            : 'Preview';
      case 'solution':
        return locale === 'zh-CN' ? '题解' : 'Solution';
      case 'history':
        return locale === 'zh-CN' ? '提交历史' : 'History';
      case AI_HELP_PRACTICE_TAB:
        return locale === 'zh-CN' ? 'AI 解答' : 'AI answer';
      default:
        return tab;
    }
  };
  const practiceTabMeta = (tab: PracticePanelTab) => {
    const label = practiceTabLabel(tab);
    switch (tab) {
      case 'description':
        return {
          label,
          Icon: Type,
          iconClassName: 'text-sky-600 dark:text-sky-300',
        };
      case 'formula':
        return {
          label,
          Icon: BookOpen,
          iconClassName: 'text-indigo-500 dark:text-indigo-300',
        };
      case 'edit':
        return {
          label,
          Icon: SlidersHorizontal,
          iconClassName: 'text-violet-500 dark:text-violet-300',
        };
      case 'testcase':
        return {
          label,
          Icon: CheckSquare,
          iconClassName: 'text-emerald-600 dark:text-emerald-300',
        };
      case 'secret':
        return {
          label,
          Icon: CheckSquare,
          iconClassName: 'text-amber-500 dark:text-amber-300',
        };
      case 'code':
        return {
          label,
          Icon: Code2,
          iconClassName: 'text-cyan-600 dark:text-cyan-300',
        };
      case 'answer':
        return {
          label,
          Icon: CheckSquare,
          iconClassName: 'text-emerald-600 dark:text-emerald-300',
        };
      case 'preview':
        return {
          label,
          Icon: Maximize2,
          iconClassName: 'text-blue-500 dark:text-blue-300',
        };
      case 'solution':
        return {
          label,
          Icon: Sparkles,
          iconClassName: 'text-fuchsia-500 dark:text-fuchsia-300',
        };
      case 'history':
        return {
          label,
          Icon: ChevronUp,
          iconClassName: 'text-slate-500 dark:text-slate-300',
        };
      case AI_HELP_PRACTICE_TAB:
        return {
          label,
          Icon: Sparkles,
          iconClassName: 'text-sky-600 dark:text-sky-300',
        };
      case 'output':
        return {
          label,
          Icon: Terminal,
          iconClassName: 'text-slate-500 dark:text-slate-300',
        };
      default:
        return {
          label,
          Icon: Type,
          iconClassName: 'text-slate-400',
        };
    }
  };
  const practiceTabUnderlineClassName = (tab: PracticePanelTab) => {
    switch (tab) {
      case 'description':
        return 'after:bg-sky-500';
      case 'formula':
        return 'after:bg-indigo-500';
      case 'edit':
        return 'after:bg-violet-500';
      case 'testcase':
      case 'answer':
        return 'after:bg-emerald-500';
      case 'secret':
        return 'after:bg-amber-500';
      case 'code':
        return 'after:bg-cyan-500';
      case 'output':
      case 'history':
        return 'after:bg-slate-500';
      case 'preview':
        return 'after:bg-blue-500';
      case AI_HELP_PRACTICE_TAB:
        return 'after:bg-sky-500';
      case 'solution':
        return 'after:bg-fuchsia-500';
      default:
        return 'after:bg-slate-400';
    }
  };
  const handlePracticePaneTabSelect = (pane: PracticePaneId, tab: PracticePanelTab) => {
    if (!visiblePracticePanelTabs.has(tab)) return;
    setPracticePaneActive((prev) => ({ ...prev, [pane]: tab }));
    if (tab === AI_HELP_PRACTICE_TAB) {
      practiceAiHelp?.onActiveChange(true);
      return;
    }
    if (pane === 'right') {
      practiceAiHelp?.onActiveChange(false);
    }
    if (isProblemInfoPracticeTab(tab)) {
      handleProblemInfoTabChange(tab);
      return;
    }
    if (isAnswerPracticeTab(tab)) {
      setAnswerPanelTab(tab);
    }
  };
  const handlePracticeTabDragStart =
    (tab: PracticePanelTab) => (event: DragEvent<HTMLButtonElement>) => {
      setDraggingPracticeTab(tab);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(PRACTICE_TAB_DRAG_TYPE, tab);
    };
  const handlePracticeTabDrop =
    (targetPane: PracticePaneId) => (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const tab = event.dataTransfer.getData(PRACTICE_TAB_DRAG_TYPE) as PracticePanelTab;
      if (!tab || !visiblePracticePanelTabs.has(tab)) return;
      const sourcePane = visiblePracticePaneTabs.left.includes(tab) ? 'left' : 'right';
      if (sourcePane !== targetPane && visiblePracticePaneTabs[sourcePane].length <= 1) {
        setDraggingPracticeTab(null);
        return;
      }
      const nextTabs: PracticePaneTabs = {
        left: visiblePracticePaneTabs.left.filter((item) => item !== tab),
        right: visiblePracticePaneTabs.right.filter((item) => item !== tab),
      };
      nextTabs[targetPane] = [...nextTabs[targetPane], tab];
      setPracticePaneTabs(nextTabs);
      setPracticePaneActive((prev) => ({
        ...prev,
        [sourcePane]: nextTabs[sourcePane][0] ?? prev[sourcePane],
        [targetPane]: tab,
      }));
      if (isProblemInfoPracticeTab(tab)) {
        handleProblemInfoTabChange(tab);
      } else if (isAnswerPracticeTab(tab)) {
        setAnswerPanelTab(tab);
      }
      setDraggingPracticeTab(null);
    };
  const practicePaneHeaderClassName = (pane: PracticePaneId) =>
    cn(
      'flex min-h-11 shrink-0 items-center gap-3 overflow-x-auto border-b border-slate-200 px-3 sm:gap-4 sm:px-4 dark:border-slate-800',
      visibleDraggingPracticeTab &&
        !visiblePracticePaneTabs[pane].includes(visibleDraggingPracticeTab) &&
        'bg-sky-50/70 dark:bg-sky-500/10',
    );
  const practiceTabClassName = (tab: PracticePanelTab, active: boolean) =>
    cn(
      'relative flex h-full cursor-grab items-center gap-2 whitespace-nowrap text-sm font-semibold transition active:cursor-grabbing',
      active
        ? cn(
            'text-slate-950 dark:text-white after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full',
            practiceTabUnderlineClassName(tab),
          )
        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100',
    );
  const renderPracticePaneHeader = (pane: PracticePaneId) => {
    const activeTab = visiblePracticePaneActive[pane];
    const activeCodeRunTarget: CourseCodeRunTarget | null =
      activeTab === 'code'
        ? 'code'
        : activeTab === 'testcase'
          ? 'public'
          : activeTab === 'secret'
            ? 'secret'
            : null;
    const activeCodeRunLabel =
      activeCodeRunTarget === 'secret'
        ? locale === 'zh-CN'
          ? '运行隐藏测试'
          : 'Run secret tests'
        : activeCodeRunTarget === 'public'
          ? locale === 'zh-CN'
            ? '运行测试'
            : 'Run tests'
          : locale === 'zh-CN'
            ? '运行'
            : 'Run';
    return (
      <div
        className={practicePaneHeaderClassName(pane)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handlePracticeTabDrop(pane)}
      >
        {visiblePracticePaneTabs[pane].map((tab) =>
          (() => {
            const { Icon, iconClassName, label } = practiceTabMeta(tab);
            return (
              <button
                key={tab}
                type="button"
                draggable={tab !== AI_HELP_PRACTICE_TAB}
                onDragStart={handlePracticeTabDragStart(tab)}
                onDragEnd={() => setDraggingPracticeTab(null)}
                onClick={() => handlePracticePaneTabSelect(pane, tab)}
                className={practiceTabClassName(tab, activeTab === tab)}
              >
                <Icon className={cn('h-4 w-4', iconClassName)} />
                {label}
              </button>
            );
          })(),
        )}
        {selectedProblemHasTranslation && isProblemInfoPracticeTab(activeTab) ? (
          <div className="ml-auto">
            <ProblemLanguageToggle
              value={problemLanguage}
              locale={locale}
              onChange={setProblemLanguage}
            />
          </div>
        ) : null}
        {activeTab === 'answer' || activeCodeRunTarget ? (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {activeCodeRunTarget ? (
              <Button
                type="button"
                onClick={() => handleRunCodeAndShowOutput(pane, activeCodeRunTarget)}
                disabled={runningCode || submittingAnswer}
                className={cn(
                  'h-8 shrink-0 rounded-md px-3 text-xs font-semibold',
                  PROBLEM_BANK_EMERALD_OUTLINE_BUTTON_CLASS,
                )}
              >
                {runningCode && runningCodeTarget === activeCodeRunTarget ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                )}
                {activeCodeRunLabel}
              </Button>
            ) : null}
            {activeTab === 'answer' || activeTab === 'code' ? (
              <Button
                onClick={handleSubmitAndShowHistory}
                disabled={submittingAnswer || runningCode}
                className={cn(
                  'h-8 shrink-0 rounded-md px-3 text-xs font-semibold',
                  PROBLEM_BANK_EMERALD_ACTION_BUTTON_CLASS,
                )}
              >
                {submittingAnswer ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                )}
                {locale === 'zh-CN' ? '提交答案' : 'Submit'}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };
  const renderProblemInfoPaneContent = (tab: ProblemInfoTab) => {
    if (!selectedProblem) return null;
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 text-[15px] leading-8 text-slate-800 sm:px-5 sm:py-5 dark:text-slate-200">
        {tab === 'description' ? (
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col">
            <div className="pb-8 sm:pb-10">
              <h1
                className="mb-4 border-b border-slate-200 pb-3 text-base font-semibold leading-7 text-slate-950 dark:border-slate-800 dark:text-white"
                title={selectedProblemTitle}
              >
                <ProblemTitleText content={selectedProblemTitle} />
              </h1>
              {selectedProblemContent?.type === 'code' ? (
                <CodeProblemStatement content={selectedProblemContent} locale={locale} />
              ) : selectedProblemContent && renderProblemContentStem(selectedProblemContent) ? (
                <ProblemRichText content={renderProblemContentStem(selectedProblemContent)} />
              ) : (
                <p>{locale === 'zh-CN' ? '暂无题面。' : 'No stem available.'}</p>
              )}
              <ProblemImageAssets
                content={selectedProblemContent}
                className="mt-6 sm:grid-cols-1 [&_figure]:rounded-lg [&_figure]:bg-white [&_img]:max-h-[360px]"
              />
            </div>
            <div className="mt-auto flex flex-wrap gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
              {problemMetaChips(selectedProblem, locale).map((chip) => (
                <ProblemMetaChip
                  key={chip.key}
                  label={chip.label}
                  Icon={chip.Icon}
                  className={chip.className}
                />
              ))}
            </div>
          </div>
        ) : tab === 'formula' ? (
          <FormulaReferencePanel locale={locale} onInsert={insertFormulaIntoAnswer} />
        ) : canEditProblems && selectedProblemEditDraft ? (
          <ProblemDraftForm
            key={`${selectedProblemEditDraft.draftId}-${selectedProblem.updatedAt}`}
            draft={selectedProblemEditDraft}
            locale={locale}
            saveLabel={locale === 'zh-CN' ? '保存题目' : 'Save problem'}
            onDraftChange={handleEditingDraftChange}
            onSave={async (nextDraft) => {
              await handleUpdateProblem(problemDraftToPatch(nextDraft));
              toast.success(locale === 'zh-CN' ? '题目已更新' : 'Problem updated');
            }}
          />
        ) : null}
      </div>
    );
  };
  const renderAnswerPaneContent = (tab: AnswerPanelTab) => {
    if (!selectedProblem) return null;
    const codeAnswerActive =
      tab === 'answer' &&
      selectedProblem.type === 'code' &&
      selectedProblemContent?.type === 'code';
    return (
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col',
          codeAnswerActive ? 'overflow-hidden p-0' : 'overflow-y-auto p-3 sm:p-4',
        )}
      >
        {tab === 'answer' ? (
          <div className={cn('flex flex-col', codeAnswerActive ? 'min-h-0 flex-1' : 'min-h-full')}>
            {selectedProblem.type === 'choice' && selectedProblemContent?.type === 'choice' ? (
              <div className="space-y-2">
                {selectedProblemContent.options.map((option) => {
                  const selected = choiceAnswers[selectedProblem.id] ?? [];
                  const multi = selectedProblemContent.selectionMode === 'multiple';
                  const correctOptionIds = selectedAnswerFeedback?.correctOptionIds ?? [];
                  const hasAnswerFeedback = Boolean(selectedAnswerFeedback);
                  const isCorrectOption = correctOptionIds.includes(option.id);
                  const isWrongSelected =
                    hasAnswerFeedback && selected.includes(option.id) && !isCorrectOption;
                  return (
                    <label
                      key={option.id}
                      className={cn(
                        'flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3 text-[15px] transition dark:border-slate-700',
                        hasAnswerFeedback && isCorrectOption
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-500/50 dark:bg-emerald-500/10 dark:text-emerald-50'
                          : isWrongSelected
                            ? 'border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-500/50 dark:bg-rose-500/10 dark:text-rose-50'
                            : selected.includes(option.id)
                              ? 'border-sky-300 bg-sky-50 text-slate-950 dark:border-sky-500/50 dark:bg-sky-500/10 dark:text-white'
                              : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-900/70',
                      )}
                    >
                      <input
                        className="mt-1 size-4 accent-sky-600"
                        type={multi ? 'checkbox' : 'radio'}
                        checked={selected.includes(option.id)}
                        onChange={(event) => {
                          setChoiceAnswers((prev) => {
                            const current = prev[selectedProblem.id] ?? [];
                            const next = multi
                              ? event.target.checked
                                ? [...current, option.id]
                                : current.filter((item) => item !== option.id)
                              : [option.id];
                            return {
                              ...prev,
                              [selectedProblem.id]: Array.from(new Set(next)),
                            };
                          });
                          setAnswerFeedbackByProblemId((prev) => {
                            if (!prev[selectedProblem.id]) return prev;
                            const next = { ...prev };
                            delete next[selectedProblem.id];
                            return next;
                          });
                        }}
                      />
                      <div className="flex min-w-0 flex-1 items-start gap-1.5">
                        <span className="mt-0.5 shrink-0 font-medium">{option.id}.</span>
                        <ProblemRichText
                          content={option.label}
                          className="min-w-0 flex-1 [&_.problem-rich-code-block]:my-0 [&_.problem-rich-code-block]:max-w-full"
                        />
                      </div>
                      {hasAnswerFeedback && isCorrectOption ? (
                        <CheckCircle2 className="ml-auto mt-1 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
                      ) : isWrongSelected ? (
                        <X className="ml-auto mt-1 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-300" />
                      ) : null}
                    </label>
                  );
                })}
              </div>
            ) : selectedProblem.type === 'fill_blank' &&
              selectedProblemContent?.type === 'fill_blank' ? (
              <div className="space-y-2">
                {selectedProblemContent.blanks.map((blank) => (
                  <div key={blank.id}>
                    <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
                      {blank.id}
                    </label>
                    <Input
                      value={blankAnswers[selectedProblem.id]?.[blank.id] ?? ''}
                      placeholder={
                        blank.placeholder ||
                        (locale === 'zh-CN' ? '请输入答案' : 'Type your answer')
                      }
                      onChange={(event) =>
                        setBlankAnswers((prev) => ({
                          ...prev,
                          [selectedProblem.id]: {
                            ...(prev[selectedProblem.id] ?? {}),
                            [blank.id]: event.target.value,
                          },
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            ) : selectedProblem.type === 'code' && selectedProblemContent?.type === 'code' ? (
              <CodeAnswerWorkspace
                value={codeAnswers[selectedProblem.id] ?? selectedProblemContent.starterCode ?? ''}
                onChange={(value) =>
                  setCodeAnswers((prev) => ({
                    ...prev,
                    [selectedProblem.id]: value,
                  }))
                }
                disabled={submittingAnswer}
                locale={locale}
              />
            ) : supportsPhotoAnswer(selectedProblem) && selectedAnswerMode === 'photo' ? (
              <PhotoAnswerUploader
                inputId={`photo-answer-${selectedProblem.id}`}
                photos={photoAnswers[selectedProblem.id] ?? []}
                disabled={submittingAnswer}
                locale={locale}
                onAddFiles={handleAddPhotoAnswerFiles}
                onRemovePhoto={handleRemovePhotoAnswer}
              />
            ) : (
              <AnswerComposer
                value={textAnswers[selectedProblem.id] ?? ''}
                onChange={setSelectedTextAnswer}
                controller={selectedAnswerController}
                showToolbar={false}
                showToolbarPanels={!showSidebarAnswerTools}
                locale={locale}
                className="flex min-h-[300px] flex-1 flex-col sm:min-h-[360px]"
                textareaClassName="flex-1"
                placeholder={answerComposerPlaceholder(locale)}
              />
            )}
            {supportsPhotoAnswer(selectedProblem) ? (
              <div className="mt-3 flex w-full flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={cn(
                    'h-8 gap-1.5 rounded-md px-3 text-xs font-semibold',
                    selectedAnswerMode === 'text'
                      ? PROBLEM_BANK_EMERALD_ACTION_BUTTON_CLASS
                      : PROBLEM_BANK_EMERALD_OUTLINE_BUTTON_CLASS,
                  )}
                  onClick={() =>
                    setAnswerModes((prev) => ({
                      ...prev,
                      [selectedProblem.id]: 'text',
                    }))
                  }
                >
                  <Type className="h-4 w-4" />
                  {locale === 'zh-CN' ? '文字输入' : 'Text'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={cn(
                    'h-8 gap-1.5 rounded-md px-3 text-xs font-semibold',
                    selectedAnswerMode === 'photo'
                      ? PROBLEM_BANK_EMERALD_ACTION_BUTTON_CLASS
                      : PROBLEM_BANK_EMERALD_OUTLINE_BUTTON_CLASS,
                  )}
                  onClick={() =>
                    setAnswerModes((prev) => ({
                      ...prev,
                      [selectedProblem.id]: 'photo',
                    }))
                  }
                >
                  <ImagePlus className="h-4 w-4" />
                  {locale === 'zh-CN' ? '照片上传' : 'Photos'}
                </Button>
                {selectedAnswerFeedback ? (
                  <AnswerFeedbackSummaryBadge
                    feedback={selectedAnswerFeedback}
                    points={selectedProblemPoints}
                    locale={locale}
                    className="ml-auto max-w-[min(21rem,100%)]"
                  />
                ) : null}
              </div>
            ) : null}
            {selectedAnswerFeedback && !supportsPhotoAnswer(selectedProblem) ? (
              <AnswerFeedbackSummaryBadge
                feedback={selectedAnswerFeedback}
                points={selectedProblemPoints}
                locale={locale}
                className="mt-3"
              />
            ) : null}
          </div>
        ) : tab === 'preview' && problemEditPaneActive ? (
          visibleProblemPreviewDraft ? (
            <ProblemDraftPreviewPanel draft={visibleProblemPreviewDraft} locale={locale} />
          ) : (
            <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
              {locale === 'zh-CN' ? '暂无可预览的题目。' : 'No problem preview available.'}
            </div>
          )
        ) : tab === 'preview' ? (
          <div className="flex min-h-full flex-col">
            {selectedProblem.type === 'choice' && selectedProblemContent?.type === 'choice' ? (
              <ChoiceAnswerPreviewPanel
                content={selectedProblemContent}
                selectedOptionIds={
                  choiceAnswers[selectedProblem.id] ??
                  selectedAnswerFeedback?.selectedOptionIds ??
                  []
                }
                feedback={selectedAnswerFeedback}
                locale={locale}
              />
            ) : selectedProblem.type === 'fill_blank' &&
              selectedProblem.publicContent.type === 'fill_blank' ? (
              <div className="space-y-2">
                {selectedProblem.publicContent.blanks.map((blank) => (
                  <div
                    key={blank.id}
                    className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-sm dark:border-slate-700 dark:bg-slate-900/60"
                  >
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {blank.id}
                    </p>
                    <p className="mt-1 text-slate-800 dark:text-slate-100">
                      {blankAnswers[selectedProblem.id]?.[blank.id]?.trim() ||
                        (locale === 'zh-CN' ? '未填写' : 'Empty')}
                    </p>
                  </div>
                ))}
              </div>
            ) : selectedProblem.type === 'code' && selectedProblem.publicContent.type === 'code' ? (
              <pre className="min-h-[180px] overflow-x-auto rounded-lg border border-slate-200 bg-slate-950 p-4 text-xs leading-6 text-slate-50 dark:border-slate-700">
                {codeAnswers[selectedProblem.id] ??
                  selectedProblem.publicContent.starterCode ??
                  (locale === 'zh-CN' ? '还没有代码。' : 'No code yet.')}
              </pre>
            ) : supportsPhotoAnswer(selectedProblem) && selectedAnswerMode === 'photo' ? (
              (photoAnswers[selectedProblem.id] ?? []).length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {(photoAnswers[selectedProblem.id] ?? []).map((photo) => (
                    <figure
                      key={photo.id}
                      className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60"
                    >
                      <img
                        src={photo.dataUrl}
                        alt={photo.name}
                        className="max-h-72 w-full object-contain"
                      />
                      <figcaption className="border-t border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                        {photo.name}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
                  {locale === 'zh-CN' ? '还没有上传照片。' : 'No photos uploaded yet.'}
                </div>
              )
            ) : (
              <AnswerPreviewPanel
                value={selectedTextAnswerValue}
                placeholder={answerComposerPlaceholder(locale)}
              />
            )}
          </div>
        ) : tab === 'history' ? (
          <AttemptHistoryPanel
            attempts={selectedProblemAttempts}
            loading={selectedProblemAttemptsLoading}
            points={selectedProblem.points}
            locale={locale}
          />
        ) : selectedProblemSolutionSections.length > 0 ? (
          <div className="space-y-4">
            {selectedProblemSolutionSections.map((section, index) => (
              <section key={`${section.title}-${index}`}>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {section.title}
                </p>
                {section.contentKind === 'choice-options' && section.options?.length ? (
                  <SolutionChoiceOptions options={section.options} locale={locale} />
                ) : section.contentKind === 'code' ? (
                  <SolutionCodeBlock code={section.content} language={section.language} />
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-sm leading-6 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                    <ProblemRichText content={section.content} />
                  </div>
                )}
              </section>
            ))}
          </div>
        ) : (
          <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
            {locale === 'zh-CN' ? '这道题还没有题解。' : 'No solution has been added yet.'}
          </div>
        )}
      </div>
    );
  };
  const renderCodePracticePaneContent = (tab: CodePracticeTab) => {
    if (
      !selectedProblem ||
      selectedProblem.type !== 'code' ||
      selectedProblemContent?.type !== 'code'
    ) {
      return null;
    }
    if (tab === 'output') {
      return (
        <CodeRunOutputPanel
          result={codeRunResults[selectedProblem.id]}
          running={runningCode}
          locale={locale}
        />
      );
    }
    if (tab === 'code') {
      return (
        <CodeAnswerWorkspace
          value={codeAnswers[selectedProblem.id] ?? selectedProblemContent.starterCode ?? ''}
          onChange={(value) =>
            setCodeAnswers((prev) => ({
              ...prev,
              [selectedProblem.id]: value,
            }))
          }
          disabled={submittingAnswer || runningCode}
          locale={locale}
        />
      );
    }

    const testFiles = buildCodeTestFiles(
      selectedProblemContent,
      canEditProblems ? selectedProblem.secretJudge?.secretTests : undefined,
    );
    return (
      <CodeTestcasePanel
        file={tab === 'secret' ? testFiles.secretFile : testFiles.publicFile}
        locale={locale}
      />
    );
  };
  const renderPracticeAiHelpPaneContent = () => {
    const state = practiceAiHelp?.state;
    const waitingForSavedHelp = practiceAiHelp?.hasHelp && !state;
    return (
      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col">
          {state?.status === 'loading' || waitingForSavedHelp ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-500 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin text-sky-500" />
                {waitingForSavedHelp
                  ? locale === 'zh-CN'
                    ? '正在读取已保存题解…'
                    : 'Loading saved answer...'
                  : locale === 'zh-CN'
                    ? '正在读取题目、作答和课程记忆…'
                    : 'Reading the problem, answer, and course memory...'}
              </div>
            </div>
          ) : state?.answer ? (
            <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/70 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
              <MessageResponse className={practiceAiHelpMarkdownClassName} mode="static">
                {state.answer}
              </MessageResponse>
              {state.status === 'error' ? (
                <p className="mt-4 text-xs text-rose-600 dark:text-rose-300">
                  {state.error ||
                    (locale === 'zh-CN' ? '题解生成失败' : 'Failed to generate answer')}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex min-h-[180px] flex-1 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
              {locale === 'zh-CN'
                ? '点击弹窗顶部的 AI 解答生成讲解。'
                : 'Click AI answer in the popup header to generate an explanation.'}
            </div>
          )}
        </div>
      </div>
    );
  };
  const renderPracticePaneContent = (tab: PracticePanelTab) =>
    tab === AI_HELP_PRACTICE_TAB
      ? renderPracticeAiHelpPaneContent()
      : isProblemInfoPracticeTab(tab)
      ? renderProblemInfoPaneContent(tab)
      : isCodePracticeTab(tab)
        ? renderCodePracticePaneContent(tab)
        : renderAnswerPaneContent(tab);

  return (
    <div
      className={cn(
        'flex h-full min-h-0 w-full',
        isPracticeMode
          ? cn(
              'gap-2 bg-[#f5f5f5] p-2 dark:bg-slate-950',
              practiceHeaderPlacement === 'external' && 'pt-1',
            )
          : 'gap-2 p-2 sm:gap-3 sm:p-3',
      )}
    >
      {!isPracticeMode ? (
        <>
          <div className="order-1 flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/92 shadow-[0_16px_40px_rgba(15,23,42,0.05)] dark:border-slate-800 dark:bg-slate-950/55">
            <div className="border-b border-slate-200 px-3 py-3 dark:border-slate-800 sm:px-4 sm:py-2">
              <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center md:gap-3">
                <span className="min-w-0 truncate text-sm font-semibold text-sky-600 dark:text-sky-300">
                  {courseName || (locale === 'zh-CN' ? '课程空间' : 'Course workspace')}
                </span>

                <label className="relative w-full md:ml-auto md:w-[320px] md:max-w-[45%] md:shrink-0">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={
                      locale === 'zh-CN'
                        ? '搜索题号、题目、知识点、来源'
                        : 'Search numbers, problems, topics, sources'
                    }
                    className="h-9 pl-9"
                  />
                </label>

                <div className="flex w-full shrink-0 items-center justify-between gap-2 md:w-auto md:justify-start">
                  {courseHasTranslations ? (
                    <ProblemLanguageToggle
                      value={problemLanguage}
                      locale={locale}
                      onChange={setProblemLanguage}
                    />
                  ) : null}
                  <span className="text-xs font-medium text-slate-400">
                    {filteredProblems.length}/{problems.length}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 gap-2 border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <SlidersHorizontal className="h-4 w-4 text-sky-600 dark:text-sky-300" />
                        {locale === 'zh-CN' ? '筛选' : 'Filters'}
                        {activeBankFilterCount > 0 ? (
                          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-sky-600 px-1.5 text-[11px] font-bold text-white dark:bg-sky-400 dark:text-slate-950">
                            {activeBankFilterCount}
                          </span>
                        ) : null}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      sideOffset={8}
                      className="w-[620px] max-w-[calc(100vw-1.5rem)] p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                            {locale === 'zh-CN' ? '筛选题目' : 'Filter problems'}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            {filteredProblems.length}/{problems.length}
                          </p>
                        </div>
                        {activeBankFilterCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setPracticeFilter('all');
                              setTypeFilter('all');
                              setDifficultyFilter('all');
                              setNotebookFilter('all');
                              setStatusFilter('all');
                            }}
                            className="rounded-full px-2 py-1 text-[11px] font-semibold text-sky-700 transition hover:bg-sky-50 dark:text-sky-200 dark:hover:bg-sky-500/10"
                          >
                            {locale === 'zh-CN' ? '清空' : 'Clear'}
                          </button>
                        ) : null}
                      </div>

                      <div className="mt-3 space-y-2">
                        <FilterRuleRow
                          icon={CheckSquare}
                          label={locale === 'zh-CN' ? '练习状态' : 'Status'}
                          value={practiceFilter}
                          options={practiceFilterOptions}
                          locale={locale}
                          onChange={(value) => setPracticeFilter(value as PracticeFilter)}
                          onClear={() => setPracticeFilter('all')}
                        />
                        <FilterRuleRow
                          icon={Gauge}
                          label={locale === 'zh-CN' ? '难度' : 'Difficulty'}
                          value={difficultyFilter}
                          options={difficultyFilterOptions}
                          locale={locale}
                          onChange={(value) =>
                            setDifficultyFilter(value as typeof difficultyFilter)
                          }
                          onClear={() => setDifficultyFilter('all')}
                        />
                        <FilterRuleRow
                          icon={BookOpen}
                          label={locale === 'zh-CN' ? '笔记本' : 'Notebook'}
                          value={notebookFilter}
                          options={notebookFilterOptions}
                          locale={locale}
                          onChange={setNotebookFilter}
                          onClear={() => setNotebookFilter('all')}
                        />
                        <FilterRuleRow
                          icon={Type}
                          label={locale === 'zh-CN' ? '题型' : 'Type'}
                          value={typeFilter}
                          options={typeFilterOptions}
                          locale={locale}
                          onChange={(value) => setTypeFilter(value as typeof typeFilter)}
                          onClear={() => setTypeFilter('all')}
                        />
                        <FilterRuleRow
                          icon={Globe2}
                          label={locale === 'zh-CN' ? '发布状态' : 'Publish state'}
                          value={statusFilter}
                          options={statusFilterOptions}
                          locale={locale}
                          onChange={(value) => setStatusFilter(value as typeof statusFilter)}
                          onClear={() => setStatusFilter('all')}
                        />
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              {canEditProblems ? (
                <div className="mt-3 grid grid-cols-2 gap-2 xl:hidden">
                  <button
                    type="button"
                    onClick={() => {
                      setImportMode('pdf');
                      setImportOpen(true);
                    }}
                    className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-center text-xs font-semibold text-slate-700 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200 dark:hover:border-sky-500/30 dark:hover:bg-sky-500/10"
                  >
                    <FileUp className="mx-auto mb-1 h-4 w-4 text-sky-600 dark:text-sky-300" />
                    {locale === 'zh-CN' ? '导入题目' : 'Import'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setImportMode('web');
                      setImportOpen(true);
                    }}
                    className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-center text-xs font-semibold text-slate-700 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200 dark:hover:border-sky-500/30 dark:hover:bg-sky-500/10"
                  >
                    <Sparkles className="mx-auto mb-1 h-4 w-4 text-sky-600 dark:text-sky-300" />
                    {locale === 'zh-CN' ? '智能生成' : 'Generate'}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              {loading ? (
                <div className="flex items-center justify-center py-16 text-sm text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {locale === 'zh-CN' ? '正在加载课程题库...' : 'Loading course problem bank...'}
                </div>
              ) : filteredProblems.length === 0 ? (
                <div className="m-4 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
                  {locale === 'zh-CN' ? '当前筛选下没有题目。' : 'No problems match this filter.'}
                </div>
              ) : (
                <>
                  <div className="space-y-2 p-3 lg:hidden">
                    {paginatedProblems.map((problem) => {
                      const selected = selectedProblemId === problem.id;
                      const typeVisual = problemTypeVisual(problem.type);
                      const ProblemTypeIcon = typeVisual.Icon;
                      const localizedContent = getLocalizedProblemContent(
                        problem.publicContent,
                        problemLanguage,
                      );
                      const localizedTitle = getLocalizedProblemTitle(problem, problemLanguage);
                      return (
                        <div
                          key={problem.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => navigateToPracticeProblem(problem)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              navigateToPracticeProblem(problem);
                            }
                          }}
                          className={cn(
                            'rounded-xl border p-3 text-sm shadow-sm transition',
                            selected
                              ? 'border-sky-200 bg-sky-50/90 dark:border-sky-500/30 dark:bg-sky-500/10'
                              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:bg-slate-900/60',
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                  {formatProblemNumber(problem)}
                                </span>
                                <span
                                  className={cn(
                                    'inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold',
                                    practiceStateClassName(problem),
                                  )}
                                >
                                  {practiceStateLabel(problem, locale)}
                                </span>
                                <span
                                  className={cn(
                                    'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold',
                                    typeVisual.className,
                                  )}
                                >
                                  <ProblemTypeIcon className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate">
                                    {typeLabel(problem.type, locale)}
                                  </span>
                                </span>
                              </div>
                              <ProblemTitleText
                                content={localizedTitle}
                                className="mt-2 line-clamp-2 font-semibold leading-5 text-slate-950 dark:text-white"
                              />
                              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                                <ProblemTitleText
                                  content={renderProblemContentStem(localizedContent)}
                                  className="font-normal"
                                  forceInlineMath
                                />
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <Button
                                type="button"
                                size="sm"
                                className={cn(
                                  'h-8 px-2.5 text-xs',
                                  PROBLEM_BANK_PRIMARY_BUTTON_CLASS,
                                )}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  navigateToPracticeProblem(problem);
                                }}
                              >
                                {locale === 'zh-CN' ? '练习' : 'Practice'}
                              </Button>
                              {canEditProblems ? (
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="icon-sm"
                                  disabled={deletingProblem}
                                  aria-label={
                                    locale === 'zh-CN'
                                      ? `删除题目「${localizedTitle}」`
                                      : `Delete "${localizedTitle}"`
                                  }
                                  title={locale === 'zh-CN' ? '删除题目' : 'Delete problem'}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void handleDeleteProblem(problem);
                                  }}
                                >
                                  {deletingProblem ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </Button>
                              ) : null}
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                            <div className="min-w-0">
                              <div className="text-[11px] font-medium text-slate-400">
                                {locale === 'zh-CN' ? '来源' : 'Source'}
                              </div>
                              <div className="truncate font-medium text-slate-700 dark:text-slate-200">
                                {problem.notebookName ||
                                  (locale === 'zh-CN' ? '未归类' : 'Unassigned')}
                              </div>
                            </div>
                            <div>
                              <div className="text-[11px] font-medium text-slate-400">
                                {locale === 'zh-CN' ? '难度 / 得分' : 'Level / Score'}
                              </div>
                              <div className="font-medium text-slate-700 dark:text-slate-200">
                                {difficultyLabel(problem.difficulty, locale)} ·{' '}
                                {latestScoreLabel(problem, locale)}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
                      <span>
                        {locale === 'zh-CN'
                          ? `显示 ${pageStartIndex + 1}-${pageEndIndex} / ${filteredProblems.length} 道`
                          : `Showing ${pageStartIndex + 1}-${pageEndIndex} of ${filteredProblems.length}`}
                      </span>
                      <div className="flex items-center justify-between gap-2 min-[420px]:justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 px-2 text-xs"
                          disabled={currentProblemPage <= 1}
                          onClick={() => setProblemPage((current) => Math.max(1, current - 1))}
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                          {locale === 'zh-CN' ? '上一页' : 'Prev'}
                        </Button>
                        <span className="min-w-[4rem] text-center font-medium text-slate-600 dark:text-slate-300">
                          {currentProblemPage} / {problemPageCount}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 px-2 text-xs"
                          disabled={currentProblemPage >= problemPageCount}
                          onClick={() =>
                            setProblemPage((current) => Math.min(problemPageCount, current + 1))
                          }
                        >
                          {locale === 'zh-CN' ? '下一页' : 'Next'}
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="hidden min-w-[820px] lg:block">
                    <div
                      className={cn(
                        PROBLEM_BANK_LIST_GRID_CLASS,
                        'border-b border-slate-200 bg-slate-50/80 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400',
                      )}
                    >
                      <span>{locale === 'zh-CN' ? '题号' : 'No.'}</span>
                      <span>{locale === 'zh-CN' ? '状态' : 'State'}</span>
                      <span>{locale === 'zh-CN' ? '题目' : 'Problem'}</span>
                      <span>{locale === 'zh-CN' ? '来源' : 'Source'}</span>
                      <span>{locale === 'zh-CN' ? '题型' : 'Type'}</span>
                      <span>{locale === 'zh-CN' ? '难度' : 'Level'}</span>
                      <span>{locale === 'zh-CN' ? '最近得分' : 'Score'}</span>
                      <span>{locale === 'zh-CN' ? '操作' : 'Action'}</span>
                    </div>
                    {paginatedProblems.map((problem) => {
                      const selected = selectedProblemId === problem.id;
                      const typeVisual = problemTypeVisual(problem.type);
                      const ProblemTypeIcon = typeVisual.Icon;
                      const localizedContent = getLocalizedProblemContent(
                        problem.publicContent,
                        problemLanguage,
                      );
                      const localizedTitle = getLocalizedProblemTitle(problem, problemLanguage);
                      return (
                        <div
                          key={problem.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => navigateToPracticeProblem(problem)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              navigateToPracticeProblem(problem);
                            }
                          }}
                          className={cn(
                            PROBLEM_BANK_LIST_GRID_CLASS,
                            'items-center border-b border-slate-100 px-4 py-3 text-sm transition dark:border-slate-800/80',
                            selected
                              ? 'bg-sky-50/80 dark:bg-sky-500/10'
                              : 'bg-white hover:bg-slate-50/80 dark:bg-slate-950/25 dark:hover:bg-slate-900/50',
                          )}
                        >
                          <div>
                            <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                              {formatProblemNumber(problem)}
                            </span>
                          </div>
                          <div>
                            <span
                              className={cn(
                                'inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold',
                                practiceStateClassName(problem),
                              )}
                            >
                              {practiceStateLabel(problem, locale)}
                            </span>
                          </div>
                          <div className="min-w-0 pr-4">
                            <ProblemTitleText
                              content={localizedTitle}
                              className="line-clamp-1 font-semibold text-slate-950 dark:text-white"
                            />
                            <p className="mt-1 min-w-0 truncate text-xs text-slate-500 dark:text-slate-400">
                              <ProblemTitleText
                                content={renderProblemContentStem(localizedContent)}
                                className="font-normal"
                                forceInlineMath
                              />
                            </p>
                          </div>
                          <div className="min-w-0 pr-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="line-clamp-2">
                              {problem.notebookName ||
                                (locale === 'zh-CN' ? '未归类' : 'Unassigned')}
                            </span>
                          </div>
                          <div className="min-w-0 pr-2">
                            <span
                              className={cn(
                                'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold',
                                typeVisual.className,
                              )}
                            >
                              <ProblemTypeIcon className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{typeLabel(problem.type, locale)}</span>
                            </span>
                          </div>
                          <div title={difficultyLabel(problem.difficulty, locale)}>
                            <div className="flex items-center gap-1">
                              {difficultyDots(problem).map((active, index) => (
                                <span
                                  key={index}
                                  className={cn(
                                    'size-1.5 rounded-full',
                                    difficultyDotClassName(problem.difficulty, active),
                                  )}
                                />
                              ))}
                            </div>
                            <div
                              className={cn(
                                'mt-0.5 text-[10px] font-semibold',
                                difficultyTextClassName(problem.difficulty),
                              )}
                            >
                              {difficultyLabel(problem.difficulty, locale)}
                            </div>
                          </div>
                          <div className="text-xs font-medium text-slate-700 dark:text-slate-200">
                            {latestScoreLabel(problem, locale)}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              className={cn(
                                'h-8 px-2.5 text-xs',
                                PROBLEM_BANK_PRIMARY_BUTTON_CLASS,
                              )}
                              onClick={(event) => {
                                event.stopPropagation();
                                navigateToPracticeProblem(problem);
                              }}
                            >
                              {locale === 'zh-CN' ? '练习' : 'Practice'}
                            </Button>
                            {canEditProblems ? (
                              <Button
                                type="button"
                                variant="destructive"
                                size="icon-sm"
                                disabled={deletingProblem}
                                aria-label={
                                  locale === 'zh-CN'
                                    ? `删除题目「${localizedTitle}」`
                                    : `Delete "${localizedTitle}"`
                                }
                                title={locale === 'zh-CN' ? '删除题目' : 'Delete problem'}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleDeleteProblem(problem);
                                }}
                              >
                                {deletingProblem ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-400">
                      <span>
                        {locale === 'zh-CN'
                          ? `显示 ${pageStartIndex + 1}-${pageEndIndex} / ${filteredProblems.length} 道`
                          : `Showing ${pageStartIndex + 1}-${pageEndIndex} of ${filteredProblems.length}`}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 px-2 text-xs"
                          disabled={currentProblemPage <= 1}
                          onClick={() => setProblemPage((current) => Math.max(1, current - 1))}
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                          {locale === 'zh-CN' ? '上一页' : 'Prev'}
                        </Button>
                        <span className="min-w-[5rem] text-center font-medium text-slate-600 dark:text-slate-300">
                          {locale === 'zh-CN'
                            ? `${currentProblemPage} / ${problemPageCount} 页`
                            : `Page ${currentProblemPage} / ${problemPageCount}`}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 px-2 text-xs"
                          disabled={currentProblemPage >= problemPageCount}
                          onClick={() =>
                            setProblemPage((current) => Math.min(problemPageCount, current + 1))
                          }
                        >
                          {locale === 'zh-CN' ? '下一页' : 'Next'}
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <aside className="order-2 hidden h-full w-[270px] shrink-0 flex-col gap-3 overflow-hidden xl:flex">
            <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)] dark:border-slate-800 dark:bg-slate-950/60">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {locale === 'zh-CN' ? '掌握概览' : 'Mastery overview'}
                </p>
                <AlertCircle className="h-3.5 w-3.5 text-slate-400" />
              </div>
              <div className="mt-4 flex items-center gap-4">
                <div
                  className="grid size-[88px] shrink-0 place-items-center rounded-full"
                  style={{
                    background: `conic-gradient(#22c55e 0deg ${
                      (bankStats.mastered / Math.max(1, bankStats.total)) * 360
                    }deg, #f59e0b ${(bankStats.mastered / Math.max(1, bankStats.total)) * 360}deg ${
                      ((bankStats.mastered + bankStats.review) / Math.max(1, bankStats.total)) * 360
                    }deg, #ef4444 ${
                      ((bankStats.mastered + bankStats.review) / Math.max(1, bankStats.total)) * 360
                    }deg ${
                      ((bankStats.mastered + bankStats.review + bankStats.wrong) /
                        Math.max(1, bankStats.total)) *
                      360
                    }deg, #e2e8f0 ${
                      ((bankStats.mastered + bankStats.review + bankStats.wrong) /
                        Math.max(1, bankStats.total)) *
                      360
                    }deg 360deg)`,
                  }}
                >
                  <div className="grid size-[62px] place-items-center rounded-full bg-white text-center shadow-inner dark:bg-slate-950">
                    <span className="text-xl font-bold leading-none text-slate-950 dark:text-white">
                      {bankStats.masteryPercent}%
                    </span>
                    <span className="-mt-2 text-[10px] font-medium text-slate-400">
                      {locale === 'zh-CN' ? '总体掌握' : 'mastered'}
                    </span>
                  </div>
                </div>
                <dl className="min-w-0 flex-1 space-y-2 text-xs">
                  {[
                    {
                      label: locale === 'zh-CN' ? '掌握良好' : 'Mastered',
                      count: bankStats.mastered,
                      className: 'bg-emerald-500',
                    },
                    {
                      label: locale === 'zh-CN' ? '待复习' : 'To review',
                      count: bankStats.review,
                      className: 'bg-amber-500',
                    },
                    {
                      label: locale === 'zh-CN' ? '错题' : 'Wrong',
                      count: bankStats.wrong,
                      className: 'bg-rose-500',
                    },
                    {
                      label: locale === 'zh-CN' ? '未练习' : 'Untried',
                      count: bankStats.unattempted,
                      className: 'bg-slate-300',
                    },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between gap-2">
                      <dt className="flex min-w-0 items-center gap-2 text-slate-500 dark:text-slate-400">
                        <span className={cn('size-2 rounded-full', item.className)} />
                        <span className="truncate">{item.label}</span>
                      </dt>
                      <dd className="font-semibold text-slate-800 dark:text-slate-100">
                        {item.count}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center text-xs dark:border-slate-800">
                <div>
                  <div className="font-semibold text-sky-600 dark:text-sky-300">
                    {bankStats.attempted}/{bankStats.total || 0}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {locale === 'zh-CN' ? '已练习' : 'Practiced'}
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-sky-600 dark:text-sky-300">
                    {bankStats.coveredNotebookCount}/{Math.max(1, bankStats.notebookCount)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {locale === 'zh-CN' ? '题库覆盖' : 'Coverage'}
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-sky-600 dark:text-sky-300">
                    {bankStats.masteredTopicCount}/{bankStats.topicCount || 0}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {locale === 'zh-CN' ? '知识点' : 'Concepts'}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)] dark:border-slate-800 dark:bg-slate-950/60">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {locale === 'zh-CN' ? '做题最少章节 TOP5' : 'Least practiced chapters TOP5'}
              </p>
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                {locale === 'zh-CN'
                  ? '按已做题目数量升序统计'
                  : 'Sorted by attempted problem count'}
              </p>
              <div className="mt-4 space-y-3">
                {bankStats.weakTopics.length > 0 ? (
                  bankStats.weakTopics.map((item, index) => (
                    <div key={item.topic} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate font-medium text-slate-700 dark:text-slate-200">
                          {item.topic}
                        </span>
                        <span className="shrink-0 font-semibold text-slate-500 dark:text-slate-400">
                          {locale === 'zh-CN' ? `已做 ${item.count} 题` : `${item.count} done`}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className={cn('h-full rounded-full', weakTopicBarClass(index))}
                          style={{ width: `${item.percent}%` }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2 text-xs leading-5 text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                    {locale === 'zh-CN' ? '暂无章节刷题数据。' : 'No chapter practice data yet.'}
                  </p>
                )}
              </div>
            </div>

            {canEditProblems ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setImportMode('pdf');
                    setImportOpen(true);
                  }}
                  className="rounded-2xl border border-slate-200 bg-white/95 p-3 text-center text-xs font-semibold text-slate-700 shadow-[0_16px_40px_rgba(15,23,42,0.05)] transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200 dark:hover:border-sky-500/30 dark:hover:bg-sky-500/10"
                >
                  <FileUp className="mx-auto mb-2 h-5 w-5 text-sky-600 dark:text-sky-300" />
                  <span>{locale === 'zh-CN' ? '导入题目' : 'Import'}</span>
                  <span className="mt-1 block text-[10px] font-normal text-slate-400">
                    {locale === 'zh-CN' ? 'PDF / LaTeX / 文本' : 'PDF / LaTeX / text'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImportMode('web');
                    setImportOpen(true);
                  }}
                  className="rounded-2xl border border-slate-200 bg-white/95 p-3 text-center text-xs font-semibold text-slate-700 shadow-[0_16px_40px_rgba(15,23,42,0.05)] transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200 dark:hover:border-sky-500/30 dark:hover:bg-sky-500/10"
                >
                  <Sparkles className="mx-auto mb-2 h-5 w-5 text-sky-600 dark:text-sky-300" />
                  <span>{locale === 'zh-CN' ? '智能生成' : 'Generate'}</span>
                  <span className="mt-1 block text-[10px] font-normal text-slate-400">
                    {locale === 'zh-CN' ? '按知识点出题' : 'By concepts'}
                  </span>
                </button>
              </div>
            ) : null}
          </aside>
        </>
      ) : null}

      {isPracticeMode ? (
        <div className="order-1 flex min-h-0 min-w-0 flex-1 flex-col">
          {!selectedProblem ? (
            <div className="flex h-full w-full items-center justify-center rounded-2xl border border-slate-200 bg-white/80 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {locale === 'zh-CN' ? '正在加载题目...' : 'Loading problem...'}
                </>
              ) : (
                <>{locale === 'zh-CN' ? '没有找到这道题。' : 'Problem not found.'}</>
              )}
            </div>
          ) : (
            <>
              {practiceHeaderPlacement === 'internal' ? (
                <div className="mb-2 flex min-h-11 shrink-0 flex-col gap-2 rounded-lg border border-slate-200 bg-white px-2 py-2 shadow-sm shadow-slate-950/[0.03] sm:flex-row sm:items-center sm:justify-between sm:px-3 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 rounded-md px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
                    onClick={() => {
                      if (onPracticeBack) {
                        onPracticeBack();
                        return;
                      }
                      router.push(`/course/${encodeURIComponent(courseId)}`);
                    }}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    {practiceBackLabel ?? (locale === 'zh-CN' ? '课程空间' : 'Course')}
                  </Button>
                  <span className="hidden rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500 sm:inline-flex dark:bg-slate-900 dark:text-slate-400">
                    {isReviewPracticeMode && reviewPracticeIndex >= 0
                      ? `${reviewPracticeIndex + 1}/${reviewPracticeProblems.length}`
                      : currentNotebookProblemPosition > 0
                        ? `${currentNotebookProblemPosition}/${practiceNavigationProblemCount}`
                        : locale === 'zh-CN'
                          ? '未归类'
                          : 'Unassigned'}
                  </span>
                  {selectedProblemNotebookLabel ? (
                    <span
                      className="flex min-w-0 max-w-full items-center gap-1.5 rounded bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700 ring-1 ring-sky-100 sm:max-w-[min(18rem,42vw)] dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-500/20"
                      title={selectedProblemNotebookLabel}
                    >
                      <BookOpen className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{selectedProblemNotebookLabel}</span>
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      'hidden shrink-0 rounded px-2 py-1 text-[11px] font-semibold md:inline-flex',
                      difficultyTextClassName(selectedProblem.difficulty),
                    )}
                  >
                    {difficultyLabel(selectedProblem.difficulty, locale)}
                  </span>
                </div>

                <div className="flex shrink-0 flex-wrap items-center justify-between gap-1.5 sm:justify-end">
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-md px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
                      disabled={!headerPreviousPracticeTarget}
                      onClick={() => {
                        if (!headerPreviousPracticeTarget) return;
                        handlePracticeTargetChange(headerPreviousPracticeTarget);
                      }}
                      title={
                        headerPreviousPracticeTarget
                          ? headerPreviousPracticeTarget.title
                          : locale === 'zh-CN'
                            ? '没有上一题'
                            : 'No previous problem'
                      }
                    >
                      <ChevronLeft className="mr-1 h-4 w-4" />
                      {!isReviewPracticeMode && previousPracticeIsChapterJump
                        ? locale === 'zh-CN'
                          ? '上一章'
                          : 'Prev chapter'
                        : locale === 'zh-CN'
                          ? '上一题'
                          : 'Prev'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-md px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
                      disabled={!headerNextPracticeTarget}
                      onClick={() => {
                        if (!headerNextPracticeTarget) return;
                        handlePracticeTargetChange(headerNextPracticeTarget);
                      }}
                      title={
                        headerNextPracticeTarget
                          ? headerNextPracticeTarget.title
                          : locale === 'zh-CN'
                            ? '没有下一题'
                            : 'No next problem'
                      }
                    >
                      {!isReviewPracticeMode && nextPracticeIsChapterJump
                        ? locale === 'zh-CN'
                          ? '下一章'
                          : 'Next chapter'
                        : locale === 'zh-CN'
                          ? '下一题'
                          : 'Next'}
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                    <ProblemAiHelpButton
                      courseId={courseId}
                      problem={selectedProblem}
                      problemTitle={selectedProblemTitle}
                      problemContent={selectedProblemContent}
                      notebook={selectedProblemNotebook}
                      notebookLabel={selectedProblemNotebookLabel}
                      locale={locale}
                      currentAnswer={selectedProblemCurrentAnswer}
                      latestAttempt={selectedProblemLatestDetailedAttempt}
                    />
                    {canEditProblems || selectedProblem.notebookId ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 rounded-md text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900"
                            aria-label={locale === 'zh-CN' ? '更多操作' : 'More actions'}
                          >
                            <Ellipsis className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          {canEditProblems ? (
                            <DropdownMenuItem onClick={() => setMoveDialogOpen(true)}>
                              <ArrowRightLeft className="h-4 w-4" />
                              {locale === 'zh-CN' ? '移动到其他笔记本' : 'Move to notebook'}
                            </DropdownMenuItem>
                          ) : null}
                          {selectedProblem.notebookId ? (
                            <DropdownMenuItem
                              onClick={() =>
                                router.push(`/classroom/${selectedProblem.notebookId}`)
                              }
                            >
                              <ExternalLink className="h-4 w-4" />
                              {locale === 'zh-CN' ? '打开对应笔记本' : 'Open notebook'}
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </>
                  {canEditProblems ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="h-8 rounded-md px-2 text-xs font-semibold"
                      title={locale === 'zh-CN' ? '删除题目' : 'Delete problem'}
                      aria-label={locale === 'zh-CN' ? '删除题目' : 'Delete problem'}
                      disabled={deletingProblem}
                      onClick={() => {
                        void handleDeleteProblem();
                      }}
                    >
                      {deletingProblem ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      <span className="hidden sm:inline">
                        {locale === 'zh-CN' ? '删除题目' : 'Delete'}
                      </span>
                    </Button>
                  ) : null}
                </div>
                </div>
              ) : null}

              <div className="grid min-h-0 flex-1 gap-2 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(24rem,1fr)] lg:overflow-hidden">
                <section className="flex min-h-[min(34rem,72dvh)] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white lg:min-h-0 dark:border-slate-800 dark:bg-slate-950">
                  {renderPracticePaneHeader('left')}
                  {renderPracticePaneContent(visiblePracticePaneActive.left)}
                </section>

                <section className="flex min-h-[min(34rem,72dvh)] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white lg:min-h-0 dark:border-slate-800 dark:bg-slate-950">
                  {renderPracticePaneHeader('right')}
                  {renderPracticePaneContent(visiblePracticePaneActive.right)}
                </section>
              </div>

              {canEditProblems ? (
                <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
                  <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-md overflow-y-auto rounded-2xl p-4 sm:w-full sm:p-6">
                    <DialogHeader>
                      <DialogTitle>
                        {locale === 'zh-CN' ? '移动题目归属' : 'Move problem'}
                      </DialogTitle>
                      <DialogDescription>
                        {locale === 'zh-CN'
                          ? '选择要将当前题目归属到的笔记本。'
                          : 'Choose the notebook to reassign this problem.'}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                      <select
                        value={moveNotebookId}
                        onChange={(event) => setMoveNotebookId(event.target.value)}
                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                      >
                        <option value="__unassigned__">
                          {locale === 'zh-CN' ? '未归类题目' : 'Unassigned'}
                        </option>
                        {notebooks.map((notebook) => (
                          <option key={notebook.id} value={notebook.id}>
                            {notebook.name}
                          </option>
                        ))}
                      </select>
                      <div className="flex justify-end">
                        <Button
                          onClick={handleSaveAssignment}
                          disabled={savingAssignment}
                          className={cn(
                            'w-full min-[420px]:w-auto',
                            PROBLEM_BANK_PRIMARY_BUTTON_CLASS,
                          )}
                        >
                          {savingAssignment ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="mr-2 h-4 w-4" />
                          )}
                          {locale === 'zh-CN' ? '确认移动' : 'Move'}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {showSidebarAnswerTools ? (
        <div className="order-3 flex h-full w-[280px] shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/90 2xl:w-[300px] dark:border-slate-800 dark:bg-slate-950/50">
          <div className="min-h-0 flex-1 overflow-hidden p-2">
            <AnswerComposerToolbar
              controller={selectedAnswerController}
              locale={locale}
              fillPanels
              showControls={false}
              className="bg-white dark:bg-slate-950/40"
            />
          </div>
        </div>
      ) : null}

      {canEditProblems ? <CourseProblemImportDialog view={view} /> : null}
    </div>
  );
}
