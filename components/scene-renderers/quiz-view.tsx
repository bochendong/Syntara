'use client';

import { useState, useMemo, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  PieChart,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Check,
  BookOpenText,
  Loader2,
  Sparkles,
  Code2,
  FileCode2,
  FlaskConical,
  Sigma,
  ScrollText,
  ListChecks,
  Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { createLogger } from '@/lib/logger';
import type { QuizCodeReport, QuizQuestion } from '@/lib/types/stage';
import { useDraftCache } from '@/lib/hooks/use-draft-cache';
import { SpeechButton } from '@/components/audio/speech-button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useStageStore } from '@/lib/store';
import { useAuthStore } from '@/lib/store/auth';
import { clearQuestionProgress, setQuestionProgress } from '@/lib/utils/quiz-question-progress';
import { code } from '@streamdown/code';
import { Streamdown } from 'streamdown';

const log = createLogger('QuizView');

type Phase = 'not_started' | 'answering' | 'grading' | 'reviewing';
type AnswerValue = string | string[];

export interface QuestionResult {
  questionId: string;
  correct: boolean | null;
  status: 'correct' | 'incorrect';
  earned: number;
  aiComment?: string;
  codeReport?: QuizCodeReport;
}

export interface QuizViewProps {
  readonly questions: QuizQuestion[];
  readonly sceneId: string;
  readonly singleQuestionMode?: boolean;
  readonly initialSnapshot?: {
    phase: 'answering' | 'reviewing';
    answers: Record<string, AnswerValue>;
    results: QuestionResult[];
  };
  readonly onAttemptFinished?: () => void;
  /** 课程测验中心等单题场景：顶栏在列表中上一题 / 下一题 */
  readonly onHubPrevQuestion?: () => void;
  readonly hubPrevDisabled?: boolean;
  readonly onHubNextQuestion?: () => void;
  readonly hubNextDisabled?: boolean;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function toArray(v: AnswerValue | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function isObjectiveQuestion(q: QuizQuestion): boolean {
  return (
    q.type === 'single' ||
    q.type === 'multiple' ||
    q.type === 'multiple_choice' ||
    (q.type === 'code_tracing' && (q.options?.length ?? 0) > 0)
  );
}

function isTextQuestion(q: QuizQuestion): boolean {
  return q.type === 'short_answer' || q.type === 'proof' || q.type === 'code_tracing';
}

function isCodeQuestion(q: QuizQuestion): boolean {
  return q.type === 'code';
}

function getEffectiveAnswer(
  q: QuizQuestion,
  answer: AnswerValue | undefined,
): AnswerValue | undefined {
  if (answer != null) return answer;
  if (isCodeQuestion(q) && q.starterCode) return q.starterCode;
  return answer;
}

function getEffectiveTextAnswer(q: QuizQuestion, answer: AnswerValue | undefined): string {
  const effective = getEffectiveAnswer(q, answer);
  if (Array.isArray(effective)) return effective.join(', ');
  return effective ?? '';
}

function getQuestionTypeLabel(
  question: QuizQuestion,
  t: (key: string) => string,
  locale: string,
): string {
  switch (question.type) {
    case 'single':
      return t('quiz.singleChoice');
    case 'multiple':
      return t('quiz.multipleChoice');
    case 'multiple_choice':
      return locale === 'zh-CN' ? '选择题' : 'Selection';
    case 'short_answer':
      return t('quiz.shortAnswer');
    case 'proof':
      return locale === 'zh-CN' ? '证明题' : 'Proof';
    case 'code_tracing':
      return locale === 'zh-CN' ? '代码追踪' : 'Code tracing';
    case 'code':
      return locale === 'zh-CN' ? '代码题' : 'Coding';
    default:
      return t('quiz.shortAnswer');
  }
}

function getQuestionIcon(question: QuizQuestion) {
  switch (question.type) {
    case 'proof':
      return <ScrollText className="w-3.5 h-3.5" />;
    case 'code_tracing':
      return <Sigma className="w-3.5 h-3.5" />;
    case 'code':
      return <Code2 className="w-3.5 h-3.5" />;
    default:
      return <ListChecks className="w-3.5 h-3.5" />;
  }
}

function getLanguageDisplayName(language?: string): string {
  const normalized = (language ?? 'python').trim().toLowerCase();
  switch (normalized) {
    case 'c++':
    case 'cpp':
    case 'cc':
      return 'C++';
    case 'c':
      return 'C';
    case 'c#':
    case 'csharp':
      return 'C#';
    case 'javascript':
    case 'js':
      return 'JavaScript';
    case 'typescript':
    case 'ts':
      return 'TypeScript';
    case 'python':
    case 'py':
      return 'Python';
    case 'java':
      return 'Java';
    case 'racket':
      return 'Racket';
    case 'go':
      return 'Go';
    case 'rust':
      return 'Rust';
    default:
      return language?.trim() || 'Code';
  }
}

function buildTextRubric(question: QuizQuestion): string | undefined {
  const parts = [
    question.commentPrompt,
    typeof question.answer === 'string' ? `参考答案：${question.answer}` : undefined,
    question.proof ? `参考证明：${question.proof}` : undefined,
    question.analysis ? `解析：${question.analysis}` : undefined,
    question.explanation ? `补充说明：${question.explanation}` : undefined,
    question.codeSnippet ? `相关代码：\n${question.codeSnippet}` : undefined,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join('\n\n') : undefined;
}

function gradeObjectiveQuestions(
  questions: QuizQuestion[],
  answers: Record<string, AnswerValue>,
): QuestionResult[] {
  return questions.filter(isObjectiveQuestion).map((q) => {
    const pts = q.points ?? 1;
    const userAnswer = toArray(answers[q.id]);
    const correctAnswer = toArray(q.answer);
    const correct = arraysEqual(userAnswer, correctAnswer);
    return {
      questionId: q.id,
      correct,
      status: correct ? 'correct' : 'incorrect',
      earned: correct ? pts : 0,
    };
  });
}

async function gradeTextQuestion(
  question: QuizQuestion,
  userAnswer: string,
  language: string,
): Promise<QuestionResult> {
  const pts = question.points ?? 1;
  try {
    const modelConfig = getCurrentModelConfig();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-model': modelConfig.modelString,
      'x-api-key': modelConfig.apiKey,
    };
    if (modelConfig.baseUrl) headers['x-base-url'] = modelConfig.baseUrl;
    if (modelConfig.providerType) headers['x-provider-type'] = modelConfig.providerType;
    if (modelConfig.requiresApiKey) headers['x-requires-api-key'] = 'true';

    const res = await fetch('/api/quiz-grade', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        question: question.question,
        userAnswer,
        points: pts,
        commentPrompt: buildTextRubric(question),
        language,
        questionType: question.type,
        referenceAnswer: typeof question.answer === 'string' ? question.answer : undefined,
        proof: question.proof,
        analysis: question.analysis,
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { score: number; comment: string };
    const earned = Math.max(0, Math.min(pts, data.score));
    return {
      questionId: question.id,
      correct: earned >= pts * 0.8,
      status: earned >= pts * 0.8 ? 'correct' : 'incorrect',
      earned,
      aiComment: data.comment,
    };
  } catch (error) {
    log.error('[quiz-view] AI grading failed', question.id, error);
    return {
      questionId: question.id,
      correct: null,
      status: 'incorrect',
      earned: Math.round(pts * 0.5),
      aiComment:
        language === 'zh-CN'
          ? '评分服务暂时不可用，已给予基础分。'
          : 'Grading service unavailable. Base score given.',
    };
  }
}

async function gradeCodeQuestion(
  question: QuizQuestion,
  userCode: string,
  language: string,
): Promise<QuestionResult> {
  const pts = question.points ?? 1;
  try {
    const res = await fetch('/api/quiz-code-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questionId: question.id,
        userCode,
        starterCode: question.starterCode,
        language: question.language || 'python',
        testCases: question.testCases ?? [],
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { report: QuizCodeReport };
    const report = data.report;
    const passed = report.totalCount > 0 && report.passedCount === report.totalCount;
    return {
      questionId: question.id,
      correct: passed,
      status: passed ? 'correct' : 'incorrect',
      earned: passed ? pts : 0,
      aiComment:
        language === 'zh-CN'
          ? `通过 ${report.passedCount}/${report.totalCount} 个测试用例。`
          : `Passed ${report.passedCount}/${report.totalCount} test cases.`,
      codeReport: report,
    };
  } catch (error) {
    log.error('[quiz-view] Code grading failed', question.id, error);
    return {
      questionId: question.id,
      correct: false,
      status: 'incorrect',
      earned: 0,
      aiComment:
        language === 'zh-CN'
          ? '代码运行服务暂时不可用，请稍后重试。'
          : 'Code runner unavailable. Please try again later.',
      codeReport: {
        passedCount: 0,
        totalCount: question.testCases?.length ?? 0,
        cases: [],
      },
    };
  }
}

function QuizCover({
  questionCount,
  totalPoints,
  onStart,
}: {
  questionCount: number;
  totalPoints: number;
  onStart: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-4 relative overflow-hidden">
      <div className="absolute top-0 right-0 p-6 opacity-[0.03]">
        <PieChart className="w-52 h-52 text-sky-500" />
      </div>
      <div className="absolute bottom-0 left-0 p-6 opacity-[0.02]">
        <BookOpenText className="w-40 h-40 text-sky-500 rotate-12" />
      </div>

      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        className="w-16 h-16 bg-gradient-to-br from-sky-100 to-blue-50 dark:from-sky-900/50 dark:to-blue-950/30 rounded-2xl flex items-center justify-center shadow-lg shadow-sky-100 dark:shadow-sky-900/30 ring-1 ring-sky-200/50 dark:ring-sky-700/50"
      >
        <PieChart className="w-8 h-8 text-sky-500" />
      </motion.div>

      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="text-center z-10"
      >
        <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">{t('quiz.title')}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('quiz.subtitle')}</p>
      </motion.div>

      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="flex gap-5 text-sm z-10"
      >
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
          <div className="w-7 h-7 rounded-lg bg-sky-50 dark:bg-sky-900/30 flex items-center justify-center">
            <BookOpenText className="w-3.5 h-3.5 text-sky-500" />
          </div>
          <span>
            {questionCount} {t('quiz.questionsCount')}
          </span>
        </div>
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
          <div className="w-7 h-7 rounded-lg bg-sky-50 dark:bg-sky-900/30 flex items-center justify-center">
            <PieChart className="w-3.5 h-3.5 text-sky-500" />
          </div>
          <span>
            {t('quiz.totalPrefix')} {totalPoints} {t('quiz.pointsSuffix')}
          </span>
        </div>
      </motion.div>

      <motion.button
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onStart}
        className="mt-1 px-8 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-full font-medium shadow-lg shadow-sky-200/50 dark:shadow-sky-900/50 hover:shadow-sky-300/50 transition-shadow z-10 flex items-center gap-2"
      >
        {t('quiz.startQuiz')}
        <ChevronRight className="w-4 h-4" />
      </motion.button>
    </div>
  );
}

function CodeBlock({ title, code }: { title: string; code?: string }) {
  if (!code?.trim()) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-950/95 overflow-hidden dark:border-slate-700">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 text-[11px] font-medium uppercase tracking-wide text-slate-300">
        <span>{title}</span>
        <FileCode2 className="w-3.5 h-3.5" />
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-xs leading-6 text-slate-100">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function mapHintToShikiLang(hint?: string | null): string {
  const h = (hint ?? '').trim().toLowerCase();
  if (!h) return 'plaintext';
  if (h === 'cpp' || h === 'c++' || h === 'cc') return 'cpp';
  if (h === 'c') return 'c';
  if (h === 'py' || h === 'python') return 'python';
  if (h === 'java') return 'java';
  if (h === 'racket') return 'racket';
  if (h === 'js' || h === 'javascript') return 'javascript';
  if (h === 'ts' || h === 'typescript') return 'typescript';
  if (h === 'go') return 'go';
  if (h === 'rust' || h === 'rs') return 'rust';
  if (h === 'cs' || h === 'csharp' || h === 'c#') return 'csharp';
  return /^[a-z0-9#+-]{1,24}$/i.test(h) ? h : 'plaintext';
}

function guessShikiLanguageFromLines(lines: string[]): string {
  const first = lines.map((l) => l.trim()).find(Boolean) ?? '';
  if (/^#include\s*[<"]/.test(first)) return 'cpp';
  if (/^#lang\s+racket\b/i.test(first) || /^\(\s*define\b/.test(first)) return 'racket';
  if (/^package\s+\w+/.test(first) || /^public\s+class\b/.test(first) || /^import\s+java\./.test(first))
    return 'java';
  if (/^using\s+namespace\b|^int\s+main\s*\(/.test(first)) return 'cpp';
  if (/^def\s+\w+\s*\(|^from\s+\S+\s+import\b|^import\s+\w+/.test(first)) return 'python';
  return 'plaintext';
}

function expandSmushedStatements(code: string, languageHint?: string): string {
  const l = (languageHint ?? '').trim().toLowerCase();
  let out = code;
  if (l === 'python' || l === 'py' || (!l && /\bimport\s+\w+\b/.test(out))) {
    out = out.replace(/\b(import\s+[\w.]+)\s+(?=[a-zA-Z_][\w.]*\s*=)/g, '$1\n');
    out = out.replace(/(?<=.)\s+(?=\bimport\b\s)/g, '\n');
    out = out.replace(/(?<=.)\s+(?=\bfrom\s+\S+\s+import\b)/g, '\n');
    out = out.replace(/(?<=.)\s+(?=\bdef\b\s)/g, '\n');
    out = out.replace(/(?<=.)\s+(?=\bclass\b\s)/g, '\n');
  }
  if (l === 'java' || l === 'jav') {
    out = out.replace(/;\s+(?=(?:public|private|protected|static|final|class|interface|enum|import|package)\b)/g, ';\n');
  }
  return out;
}

function looksLikeCodeLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  return (
    /^\s*(\d+[.)]\s+)?(import\s|from\s+\S+\s+import\b|def\s|class\s|#include\s|using\s+namespace\b|namespace\s|public\s+(class|static|void|int)\b|private\s|protected\s|package\s+|#lang\b|\(\s*define\b|fun\s|fn\s|val\s|let\s|struct\s|enum\s|impl\s|\/\/|\/\*|\*\/)/.test(
      t,
    ) ||
    (/(?:[{}();]|\breturn\b|\bif\b|\bfor\b|\bwhile\b)/.test(t) && /[=;{}\[\]]/.test(t))
  );
}

function isProbablyCodeParagraph(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const nonEmpty = t.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (nonEmpty.length === 0) return false;
  if (nonEmpty.some((line) => /[\u3000-\u303f\u4e00-\u9fff]/.test(line))) {
    return false;
  }
  if (nonEmpty.length === 1) {
    const line = nonEmpty[0];
    if (/[\u4e00-\u9fff]/.test(line)) return false;
    return looksLikeCodeLine(line) || (/^\s*import\s+\w+/.test(line) && (/[=.]/.test(line) || /\s/.test(line)));
  }
  const hits = nonEmpty.filter(looksLikeCodeLine).length;
  return hits >= Math.ceil(nonEmpty.length * 0.55);
}

function fenceStandaloneCodeParagraphs(markdown: string, languageHint?: string): string {
  if (!markdown.trim() || markdown.includes('```')) return markdown;
  return markdown
    .split(/\n\n+/)
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed || trimmed.startsWith('```')) return part;
      if (!isProbablyCodeParagraph(trimmed)) return part;
      const lines = trimmed.split(/\r?\n/);
      const lang =
        languageHint?.trim() !== ''
          ? mapHintToShikiLang(languageHint)
          : guessShikiLanguageFromLines(lines);
      const body = expandSmushedStatements(trimmed, languageHint);
      return `\`\`\`${lang}\n${body}\n\`\`\``;
    })
    .join('\n\n');
}

function fenceTrailingCodeAfterProse(block: string, languageHint?: string): string {
  if (!block.trim() || block.includes('```')) return block;
  const anchor =
    /\b(?:import\s+[\w.]+|from\s+\S+\s+import\b|def\s+\w+\s*\(|class\s+\w+|#include\s*[<"]|public\s+class\b|package\s+\w+|\(\s*define\b|#lang\s+\w+)/;
  const m = anchor.exec(block);
  if (!m || m.index === 0) return block;
  const prose = block.slice(0, m.index).trimEnd();
  if (prose.length < 2) return block;
  let codePart = block.slice(m.index).trim();
  codePart = expandSmushedStatements(codePart, languageHint);
  const lang =
    languageHint?.trim() !== ''
      ? mapHintToShikiLang(languageHint)
      : guessShikiLanguageFromLines(codePart.split(/\r?\n/));
  return `${prose}\n\n\`\`\`${lang}\n${codePart}\n\`\`\``;
}

function normalizeMarkdownForHighlightedCode(content: string, languageHint?: string): string {
  let md = content;
  md = fenceTrailingCodeAfterProse(md, languageHint);
  md = fenceStandaloneCodeParagraphs(md, languageHint);
  return md;
}

function getDisplayQuestionText(question: QuizQuestion): string {
  const raw = question.question?.trim() ?? '';
  if (!raw || !question.codeSnippet?.trim()) return raw;

  // If the question body accidentally embeds the same code already provided by `codeSnippet`,
  // keep only the natural-language stem and let CodeBlock render the code once.
  const snippetFirstLine = question.codeSnippet
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (snippetFirstLine) {
    const exactIdx = raw.indexOf(snippetFirstLine);
    if (exactIdx > 0) return raw.slice(0, exactIdx).trim();
  }

  const inlineCodeAnchor =
    /\b(?:python|java|javascript|typescript|cpp|c\+\+|go|rust|racket|code)\b\s+(?=(?:def|class|function|import|from|public|const|let|var|for|if|while|print)\b)/i;
  const m = inlineCodeAnchor.exec(raw);
  if (m && m.index > 0) return raw.slice(0, m.index).trim();

  return raw;
}

function RichText({
  content,
  className,
  languageHint,
}: {
  content?: string;
  className?: string;
  languageHint?: string;
}) {
  if (!content?.trim()) return null;
  const markdown = normalizeMarkdownForHighlightedCode(content, languageHint);
  return (
    <Streamdown
      mode="static"
      plugins={{ code }}
      className={cn(
        '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:whitespace-pre-wrap',
        className,
      )}
    >
      {markdown}
    </Streamdown>
  );
}

function ChoiceQuestion({
  question,
  index,
  value,
  onChange,
  disabled,
  result,
  multiSelect,
  onQuestionUpdate,
}: {
  question: QuizQuestion;
  index: number;
  value?: string | string[];
  onChange: (value: string | string[]) => void;
  disabled?: boolean;
  result?: QuestionResult;
  multiSelect: boolean;
  onQuestionUpdate?: (questionId: string, patch: Partial<QuizQuestion>) => void;
}) {
  const { t } = useI18n();
  const selected = toArray(value);
  const isReview = !!result;

  const toggle = (optValue: string) => {
    if (disabled) return;
    if (!multiSelect) {
      onChange(optValue);
      return;
    }
    if (selected.includes(optValue)) {
      onChange(selected.filter((v) => v !== optValue));
    } else {
      onChange([...selected, optValue]);
    }
  };

  return (
    <QuestionCard
      question={question}
      index={index}
      result={result}
      onQuestionUpdate={onQuestionUpdate}
    >
      {question.codeSnippet && (
        <div className="mb-3">
          <CodeBlock
            title={question.type === 'code_tracing' ? 'Code' : 'Snippet'}
            code={question.codeSnippet}
          />
        </div>
      )}
      {!isReview && multiSelect && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
          {t('quiz.multipleChoiceHint')}
        </p>
      )}
      <div className="grid gap-2">
        {question.options?.map((opt) => {
          const isSelected = selected.includes(opt.value);
          const isCorrectOpt = isReview && toArray(question.answer).includes(opt.value);
          const isWrong = isReview && isSelected && !isCorrectOpt;
          return (
            <button
              key={opt.value}
              disabled={disabled}
              onClick={() => toggle(opt.value)}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all text-sm',
                !isReview &&
                  !isSelected &&
                  'border-gray-200 dark:border-gray-600 hover:border-sky-200 dark:hover:border-sky-700 hover:bg-sky-50/50 dark:hover:bg-sky-900/30',
                !isReview &&
                  isSelected &&
                  'border-sky-400 bg-sky-50 dark:bg-sky-900/30 ring-1 ring-sky-200 dark:ring-sky-700',
                isReview &&
                  isCorrectOpt &&
                  'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/30',
                isReview && isWrong && 'border-red-300 bg-red-50 dark:bg-red-900/30',
                isReview &&
                  !isCorrectOpt &&
                  !isSelected &&
                  'border-gray-100 dark:border-gray-700 opacity-60',
              )}
            >
              <span
                className={cn(
                  'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 transition-colors',
                  !isReview &&
                    !isSelected &&
                    'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
                  !isReview && isSelected && 'bg-sky-500 text-white',
                  isReview && isCorrectOpt && 'bg-emerald-500 text-white',
                  isReview && isWrong && 'bg-red-400 text-white',
                  isReview &&
                    !isCorrectOpt &&
                    !isSelected &&
                    'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500',
                )}
              >
                {!isReview && multiSelect && isSelected ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  opt.value
                )}
              </span>
              <span
                className={cn(
                  'flex-1',
                  isReview && !isCorrectOpt && !isSelected && 'text-gray-400 dark:text-gray-500',
                )}
              >
                <RichText content={opt.label} languageHint={question.language} className="text-inherit" />
              </span>
              {isReview && isCorrectOpt && (
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
              )}
              {isReview && isWrong && <XCircle className="w-5 h-5 text-red-400 shrink-0" />}
            </button>
          );
        })}
      </div>
    </QuestionCard>
  );
}

function TextQuestion({
  question,
  index,
  value,
  onChange,
  disabled,
  result,
  locale,
  onQuestionUpdate,
}: {
  question: QuizQuestion;
  index: number;
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  result?: QuestionResult;
  locale: string;
  onQuestionUpdate?: (questionId: string, patch: Partial<QuizQuestion>) => void;
}) {
  const { t } = useI18n();
  const isReview = !!result;
  const valueRef = useRef(value);
  const isProof = question.type === 'proof';
  const referenceTitle = isProof
    ? locale === 'zh-CN'
      ? '参考证明'
      : 'Reference proof'
    : locale === 'zh-CN'
      ? '参考答案'
      : 'Reference answer';
  const referenceContent =
    question.proof ||
    (typeof question.answer === 'string' ? question.answer : undefined) ||
    question.explanation;

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  return (
    <QuestionCard
      question={question}
      index={index}
      result={result}
      onQuestionUpdate={onQuestionUpdate}
    >
      {question.codeSnippet && (
        <div className="mb-3">
          <CodeBlock
            title={locale === 'zh-CN' ? '相关代码' : 'Related code'}
            code={question.codeSnippet}
          />
        </div>
      )}
      {!isReview ? (
        <div className="relative">
          <Textarea
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder={
              isProof
                ? locale === 'zh-CN'
                  ? '请写出你的证明过程...'
                  : 'Write your proof here...'
                : t('quiz.inputPlaceholder')
            }
            className={cn('w-full pb-10 rounded-xl', isProof ? 'min-h-[180px]' : 'min-h-[120px]')}
          />
          <SpeechButton
            size="sm"
            disabled={disabled}
            className="absolute bottom-3 left-3"
            onTranscription={(text) => {
              const cur = valueRef.current ?? '';
              onChange(cur + (cur ? ' ' : '') + text);
            }}
          />
          <span className="absolute bottom-3 right-3 text-xs text-gray-300 dark:text-gray-600">
            {(value ?? '').length} {t('quiz.charCount')}
          </span>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{t('quiz.yourAnswer')}</p>
            {value || (
              <span className="text-gray-400 dark:text-gray-500 italic">
                {t('quiz.notAnswered')}
              </span>
            )}
          </div>
          {result.aiComment && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-sky-50 dark:bg-sky-900/30 border border-sky-100 dark:border-sky-800">
              <Sparkles className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-sky-600 dark:text-sky-400 mb-0.5">
                  {t('quiz.aiComment')}
                </p>
                <p className="text-xs text-sky-600/80 dark:text-sky-400/80">
                  {result.aiComment}
                </p>
              </div>
              <span className="ml-auto text-xs font-bold text-sky-600 dark:text-sky-400 shrink-0">
                {result.earned}/{question.points ?? 1}
                {t('quiz.pointsSuffix')}
              </span>
            </div>
          )}
          {referenceContent && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-200">
              <p className="text-xs font-medium mb-1">{referenceTitle}</p>
              <RichText content={referenceContent} languageHint={question.language} className="leading-6" />
            </div>
          )}
        </div>
      )}
    </QuestionCard>
  );
}

function CodeQuestion({
  question,
  index,
  value,
  onChange,
  disabled,
  result,
  locale,
  onQuestionUpdate,
}: {
  question: QuizQuestion;
  index: number;
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  result?: QuestionResult;
  locale: string;
  onQuestionUpdate?: (questionId: string, patch: Partial<QuizQuestion>) => void;
}) {
  const isReview = !!result;
  const currentCode = value ?? question.starterCode ?? '';
  const noCasesLabel = locale === 'zh-CN' ? '暂无测试用例' : 'No test cases';
  const testsTitle = locale === 'zh-CN' ? '测试用例' : 'Test cases';
  const resultTitle = locale === 'zh-CN' ? '运行结果' : 'Run result';
  const editorTitle = locale === 'zh-CN' ? '代码编辑器' : 'Editor';
  const languageDisplayName = getLanguageDisplayName(question.language);

  return (
    <QuestionCard
      question={question}
      index={index}
      result={result}
      onQuestionUpdate={onQuestionUpdate}
    >
      <Tabs defaultValue={isReview ? 'result' : 'editor'} className="gap-3">
        <TabsList variant="line" className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="editor">{editorTitle}</TabsTrigger>
          <TabsTrigger value="tests">{testsTitle}</TabsTrigger>
          {isReview && <TabsTrigger value="result">{resultTitle}</TabsTrigger>}
        </TabsList>

        <TabsContent value="editor" className="space-y-3">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                <Code2 className="w-3.5 h-3.5" />
                {languageDisplayName}
              </div>
              {question.testCases?.length ? (
                <Badge variant="outline">
                  {question.testCases.length} {locale === 'zh-CN' ? '个测试' : 'tests'}
                </Badge>
              ) : null}
            </div>
            <Textarea
              value={currentCode}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled}
              placeholder={
                locale === 'zh-CN'
                  ? `# 在这里编写你的 ${languageDisplayName} 代码`
                  : `# Write your ${languageDisplayName} solution here`
              }
              className="min-h-[320px] rounded-none border-0 shadow-none resize-y font-mono text-[13px] leading-6"
            />
          </div>
          {question.explanation && (
            <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
              {question.explanation}
            </div>
          )}
        </TabsContent>

        <TabsContent value="tests">
          <div className="space-y-2">
            {question.testCases?.length ? (
              question.testCases.map((testCase, idx) => (
                <div
                  key={testCase.id || `${question.id}-case-${idx}`}
                  className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/50 p-3"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <FlaskConical className="w-3.5 h-3.5 text-sky-500" />
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                      {testCase.description ||
                        (locale === 'zh-CN' ? `测试 ${idx + 1}` : `Case ${idx + 1}`)}
                    </p>
                    {testCase.hidden && (
                      <Badge variant="outline">{locale === 'zh-CN' ? '隐藏测试' : 'Hidden'}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                    {testCase.expression}
                  </p>
                  {!testCase.hidden && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {locale === 'zh-CN' ? '期望输出：' : 'Expected: '}
                      <span className="font-mono">{testCase.expected}</span>
                    </p>
                  )}
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-4 text-sm text-gray-500 dark:text-gray-400">
                {noCasesLabel}
              </div>
            )}
          </div>
        </TabsContent>

        {isReview && (
          <TabsContent value="result">
            <div className="space-y-2">
              {result.aiComment && (
                <div className="rounded-xl border border-sky-100 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 px-3 py-2 text-sm text-sky-700 dark:text-sky-300">
                  {result.aiComment}
                </div>
              )}
              {result.codeReport?.cases?.length ? (
                result.codeReport.cases.map((testCase) => (
                  <div
                    key={testCase.id}
                    className={cn(
                      'rounded-xl border p-3',
                      testCase.passed
                        ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-900/20'
                        : 'border-red-200 bg-red-50/70 dark:border-red-800 dark:bg-red-900/20',
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                          {testCase.description ||
                            (locale === 'zh-CN' ? `测试 ${testCase.id}` : `Case ${testCase.id}`)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1">
                          {testCase.hidden
                            ? locale === 'zh-CN'
                              ? '隐藏测试'
                              : 'Hidden case'
                            : testCase.expression}
                        </p>
                      </div>
                      {testCase.passed ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-500 shrink-0" />
                      )}
                    </div>
                    {!testCase.hidden && (
                      <div className="mt-2 text-xs text-gray-600 dark:text-gray-300 space-y-1">
                        <p>
                          {locale === 'zh-CN' ? '期望：' : 'Expected: '}
                          <span className="font-mono">{testCase.expected}</span>
                        </p>
                        <p>
                          {locale === 'zh-CN' ? '实际：' : 'Actual: '}
                          <span className="font-mono">{testCase.actual ?? '-'}</span>
                        </p>
                      </div>
                    )}
                    {testCase.error && (
                      <p className="mt-2 text-xs text-red-600 dark:text-red-300 whitespace-pre-wrap">
                        {testCase.error}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-4 text-sm text-gray-500 dark:text-gray-400">
                  {noCasesLabel}
                </div>
              )}
            </div>
          </TabsContent>
        )}
      </Tabs>
    </QuestionCard>
  );
}

function QuestionCard({
  question,
  index,
  result,
  children,
  onQuestionUpdate,
}: {
  question: QuizQuestion;
  index: number;
  result?: QuestionResult;
  children: ReactNode;
  onQuestionUpdate?: (questionId: string, patch: Partial<QuizQuestion>) => void;
}) {
  const { t, locale } = useI18n();
  const isReview = !!result;
  const pts = question.points ?? 1;
  const [editOpen, setEditOpen] = useState(false);
  const [draftQuestion, setDraftQuestion] = useState(question.question ?? '');
  const [draftCodeSnippet, setDraftCodeSnippet] = useState(question.codeSnippet ?? '');
  const [draftAnalysis, setDraftAnalysis] = useState(question.analysis ?? '');
  const [draftPoints, setDraftPoints] = useState(String(question.points ?? 1));

  useEffect(() => {
    if (!editOpen) {
      setDraftQuestion(question.question ?? '');
      setDraftCodeSnippet(question.codeSnippet ?? '');
      setDraftAnalysis(question.analysis ?? '');
      setDraftPoints(String(question.points ?? 1));
    }
  }, [editOpen, question]);

  const handleSaveQuestionEdit = useCallback(() => {
    if (!onQuestionUpdate) return;
    const parsedPoints = Number.parseInt(draftPoints, 10);
    onQuestionUpdate(question.id, {
      question: draftQuestion.trim(),
      codeSnippet: draftCodeSnippet.trim() || undefined,
      analysis: draftAnalysis.trim() || undefined,
      points: Number.isFinite(parsedPoints) && parsedPoints > 0 ? parsedPoints : question.points ?? 1,
    });
    setEditOpen(false);
  }, [onQuestionUpdate, question, draftQuestion, draftCodeSnippet, draftAnalysis, draftPoints]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={cn(
        'bg-white dark:bg-gray-800 rounded-2xl border p-5 relative overflow-hidden',
        !isReview && 'border-gray-150 dark:border-gray-700 shadow-sm',
        isReview &&
          result.status === 'correct' &&
          'border-emerald-200 dark:border-emerald-800 shadow-sm shadow-emerald-50 dark:shadow-emerald-900/20',
        isReview &&
          result.status === 'incorrect' &&
          'border-red-200 dark:border-red-800 shadow-sm shadow-red-50 dark:shadow-red-900/20',
      )}
    >
      <div
        className={cn(
          'absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl',
          !isReview && 'bg-sky-400',
          isReview && result.status === 'correct' && 'bg-emerald-400',
          isReview && result.status === 'incorrect' && 'bg-red-400',
        )}
      />

      <div className="flex items-start justify-between mb-3">
        <div className="flex flex-1 w-full items-start gap-3 min-w-0">
          <span
            className={cn(
              'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0',
              !isReview &&
                'bg-sky-100 dark:bg-sky-900/50 text-sky-600 dark:text-sky-400',
              isReview &&
                result.status === 'correct' &&
                'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400',
              isReview &&
                result.status === 'incorrect' &&
                'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400',
            )}
          >
            {index + 1}
          </span>
          <div className="min-w-0 w-full">
            <RichText
              content={getDisplayQuestionText(question)}
              languageHint={question.language}
              className="text-sm font-medium text-gray-800 dark:text-gray-100 leading-relaxed"
            />
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
              <Badge variant="outline" className="gap-1">
                {getQuestionIcon(question)}
                {getQuestionTypeLabel(question, t, locale)}
              </Badge>
              <span>
                {pts} {t('quiz.pointsSuffix')}
              </span>
              {isCodeQuestion(question) && (
                <span>
                  {locale === 'zh-CN'
                    ? `${getLanguageDisplayName(question.language)} 跑测`
                    : `${getLanguageDisplayName(question.language)} judge`}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="shrink-0 ml-2 flex items-center gap-1">
          {!isReview && onQuestionUpdate && (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-sky-50 hover:text-sky-600 dark:text-gray-400 dark:hover:bg-sky-900/30 dark:hover:text-sky-400"
            >
              <Pencil className="h-3.5 w-3.5" />
              {locale === 'zh-CN' ? '编辑' : 'Edit'}
            </button>
          )}
          {isReview && result.status === 'correct' && <CheckCircle2 className="w-6 h-6 text-emerald-500" />}
          {isReview && result.status === 'incorrect' && <XCircle className="w-6 h-6 text-red-400" />}
        </div>
      </div>

      {children}

      {isReview && question.analysis && (
        <div className="mt-3 p-3 rounded-lg bg-blue-50/70 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
          <span className="font-medium">{t('quiz.analysis')}</span>
          <RichText content={question.analysis} languageHint={question.language} className="mt-1" />
        </div>
      )}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{locale === 'zh-CN' ? '编辑题目' : 'Edit Question'}</DialogTitle>
            <DialogDescription>
              {locale === 'zh-CN' ? '保存后会立即更新当前题目展示与作答。' : 'Changes apply immediately to this quiz view.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">{locale === 'zh-CN' ? '题干' : 'Question'}</p>
              <Textarea value={draftQuestion} onChange={(e) => setDraftQuestion(e.target.value)} rows={3} />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                {locale === 'zh-CN' ? '代码片段（可选）' : 'Code Snippet (optional)'}
              </p>
              <Textarea
                value={draftCodeSnippet}
                onChange={(e) => setDraftCodeSnippet(e.target.value)}
                rows={6}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">{locale === 'zh-CN' ? '解析（可选）' : 'Analysis (optional)'}</p>
              <Textarea value={draftAnalysis} onChange={(e) => setDraftAnalysis(e.target.value)} rows={3} />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">{locale === 'zh-CN' ? '分值' : 'Points'}</p>
              <input
                type="number"
                min={1}
                step={1}
                value={draftPoints}
                onChange={(e) => setDraftPoints(e.target.value)}
                className="h-9 w-28 rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setEditOpen(false)}
              className="inline-flex h-9 items-center rounded-md border border-input px-3 text-sm"
            >
              {locale === 'zh-CN' ? '取消' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={handleSaveQuestionEdit}
              className="inline-flex h-9 items-center rounded-md bg-sky-600 px-3 text-sm text-white hover:bg-sky-700"
            >
              {locale === 'zh-CN' ? '保存' : 'Save'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

function ScoreBanner({
  score,
  total,
  results,
}: {
  score: number;
  total: number;
  results: QuestionResult[];
}) {
  const { t } = useI18n();
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const correctCount = results.filter((r) => r.status === 'correct').length;
  const incorrectCount = results.filter((r) => r.status === 'incorrect').length;
  const color = pct >= 80 ? 'emerald' : pct >= 60 ? 'amber' : 'red';
  const colorMap = {
    emerald: {
      bg: 'from-emerald-500 to-teal-500',
      shadow: 'shadow-emerald-200/50 dark:shadow-emerald-900/50',
      text: t('quiz.excellent'),
    },
    amber: {
      bg: 'from-amber-500 to-yellow-500',
      shadow: 'shadow-amber-200/50 dark:shadow-amber-900/50',
      text: t('quiz.keepGoing'),
    },
    red: {
      bg: 'from-red-500 to-rose-500',
      shadow: 'shadow-red-200/50 dark:shadow-red-900/50',
      text: t('quiz.needsReview'),
    },
  };
  const c = colorMap[color];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn('rounded-2xl p-6 bg-gradient-to-r text-white shadow-lg', c.bg, c.shadow)}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white/80 text-sm font-medium">{c.text}</p>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-4xl font-black">{score}</span>
            <span className="text-white/60 text-lg">/ {total}</span>
          </div>
          <div className="flex gap-3 mt-3 text-xs">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> {correctCount} {t('quiz.correct')}
            </span>
            <span className="flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5" /> {incorrectCount} {t('quiz.incorrect')}
            </span>
          </div>
        </div>
        <div className="relative w-20 h-20">
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
            <circle
              cx="40"
              cy="40"
              r="34"
              fill="none"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="6"
            />
            <motion.circle
              cx="40"
              cy="40"
              r="34"
              fill="none"
              stroke="white"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 34}`}
              initial={{ strokeDashoffset: 2 * Math.PI * 34 }}
              animate={{ strokeDashoffset: 2 * Math.PI * 34 * (1 - pct / 100) }}
              transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-black">{pct}%</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function renderQuestion(
  question: QuizQuestion,
  index: number,
  answer: AnswerValue | undefined,
  handleSetAnswer: (value: AnswerValue) => void,
  result: QuestionResult | undefined,
  locale: string,
  onQuestionUpdate?: (questionId: string, patch: Partial<QuizQuestion>) => void,
) {
  if (isCodeQuestion(question)) {
    return (
      <CodeQuestion
        key={question.id}
        question={question}
        index={index}
        value={typeof answer === 'string' ? answer : undefined}
        onChange={(value) => handleSetAnswer(value)}
        disabled={!!result}
        result={result}
        locale={locale}
        onQuestionUpdate={onQuestionUpdate}
      />
    );
  }

  if (isObjectiveQuestion(question)) {
    return (
      <ChoiceQuestion
        key={question.id}
        question={question}
        index={index}
        value={answer}
        onChange={(value) => handleSetAnswer(value)}
        disabled={!!result}
        result={result}
        multiSelect={question.type === 'multiple'}
        onQuestionUpdate={onQuestionUpdate}
      />
    );
  }

  return (
    <TextQuestion
      key={question.id}
      question={question}
      index={index}
      value={typeof answer === 'string' ? answer : undefined}
      onChange={(value) => handleSetAnswer(value)}
      disabled={!!result}
      result={result}
      locale={locale}
      onQuestionUpdate={onQuestionUpdate}
    />
  );
}

export function QuizView({
  questions,
  sceneId,
  singleQuestionMode = false,
  initialSnapshot,
  onAttemptFinished,
  onHubPrevQuestion,
  hubPrevDisabled = false,
  onHubNextQuestion,
  hubNextDisabled = false,
}: QuizViewProps) {
  const { t, locale } = useI18n();
  const stageId = useStageStore((s) => s.stage?.id ?? '');
  const userId = useAuthStore((s) => (s.userId?.trim() ? s.userId : 'user-anonymous'));

  const initialPhase: Phase = useMemo(() => {
    if (initialSnapshot?.phase === 'reviewing') return 'reviewing';
    if (initialSnapshot?.phase === 'answering') return 'answering';
    return singleQuestionMode ? 'answering' : 'not_started';
  }, [initialSnapshot, singleQuestionMode]);

  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(
    () => initialSnapshot?.answers ?? {},
  );
  const [results, setResults] = useState<QuestionResult[]>(() => initialSnapshot?.results ?? []);
  const [answeringQuestionIndex, setAnsweringQuestionIndex] = useState(0);
  const [questionEdits, setQuestionEdits] = useState<Record<string, Partial<QuizQuestion>>>({});

  const effectiveQuestions = useMemo(
    () => questions.map((q) => ({ ...q, ...(questionEdits[q.id] ?? {}) })),
    [questions, questionEdits],
  );

  const handleQuestionUpdate = useCallback((questionId: string, patch: Partial<QuizQuestion>) => {
    setQuestionEdits((prev) => ({ ...prev, [questionId]: { ...(prev[questionId] ?? {}), ...patch } }));
  }, []);

  useEffect(() => {
    setQuestionEdits({});
  }, [questions]);

  const draftKey =
    singleQuestionMode && questions[0]
      ? `quizDraft:${sceneId}:q:${questions[0].id}`
      : `quizDraft:${sceneId}`;

  const {
    cachedValue: cachedAnswers,
    updateCache: updateAnswersCache,
    clearCache: clearAnswersCache,
  } = useDraftCache<Record<string, AnswerValue>>({ key: draftKey });

  const [prevCachedAnswers, setPrevCachedAnswers] = useState(cachedAnswers);
  if (!initialSnapshot && cachedAnswers !== prevCachedAnswers) {
    setPrevCachedAnswers(cachedAnswers);
    if (cachedAnswers && Object.keys(cachedAnswers).length > 0 && phase === 'not_started') {
      setAnswers(cachedAnswers);
      setPhase('answering');
    }
  }

  const totalPoints = useMemo(
    () => effectiveQuestions.reduce((sum, q) => sum + (q.points ?? 1), 0),
    [effectiveQuestions],
  );

  const answeredCount = useMemo(
    () =>
      effectiveQuestions.filter((question) => {
        const answer = getEffectiveAnswer(question, answers[question.id]);
        if (Array.isArray(answer)) return answer.length > 0;
        return typeof answer === 'string' && answer.trim().length > 0;
      }).length,
    [effectiveQuestions, answers],
  );

  const allAnswered = answeredCount === effectiveQuestions.length;

  useEffect(() => {
    if (effectiveQuestions.length === 0) return;
    setAnsweringQuestionIndex((idx) => Math.max(0, Math.min(idx, effectiveQuestions.length - 1)));
  }, [effectiveQuestions.length]);

  const handleSetAnswer = useCallback(
    (questionId: string, value: AnswerValue) => {
      setAnswers((prev) => {
        const next = { ...prev, [questionId]: value };
        updateAnswersCache(next);
        return next;
      });
    },
    [updateAnswersCache],
  );

  const handleSubmit = useCallback(() => {
    setPhase('grading');
    clearAnswersCache();
  }, [clearAnswersCache]);

  useEffect(() => {
    if (phase !== 'grading') return;
    let cancelled = false;

    (async () => {
      const objectiveResults = gradeObjectiveQuestions(effectiveQuestions, answers);
      const textResults = await Promise.all(
        effectiveQuestions
          .filter((question) => isTextQuestion(question) && !isObjectiveQuestion(question))
          .map((question) =>
            gradeTextQuestion(
              question,
              getEffectiveTextAnswer(question, answers[question.id]),
              locale,
            ),
          ),
      );
      const codeResults = await Promise.all(
        effectiveQuestions
          .filter(isCodeQuestion)
          .map((question) =>
            gradeCodeQuestion(
              question,
              getEffectiveTextAnswer(question, answers[question.id]),
              locale,
            ),
          ),
      );

      if (cancelled) return;

      const allResultsMap = new Map<string, QuestionResult>();
      [...objectiveResults, ...textResults, ...codeResults].forEach((result) => {
        allResultsMap.set(result.questionId, result);
      });
      const ordered = effectiveQuestions
        .map((question) => allResultsMap.get(question.id))
        .filter(Boolean) as QuestionResult[];
      setResults(ordered);
      setPhase('reviewing');
    })();

    return () => {
      cancelled = true;
    };
  }, [phase, effectiveQuestions, answers, locale]);

  const persistDoneRef = useRef(false);

  useEffect(() => {
    if (singleQuestionMode && initialSnapshot?.phase === 'reviewing') {
      persistDoneRef.current = true;
    }
  }, [singleQuestionMode, initialSnapshot]);

  useEffect(() => {
    if (phase !== 'reviewing') persistDoneRef.current = false;
  }, [phase]);

  useEffect(() => {
    if (
      phase !== 'reviewing' ||
      !singleQuestionMode ||
      effectiveQuestions.length !== 1 ||
      !stageId ||
      persistDoneRef.current
    ) {
      return;
    }
    const question = effectiveQuestions[0];
    const result = results.find((entry) => entry.questionId === question.id);
    if (!result) return;
    persistDoneRef.current = true;
    setQuestionProgress(stageId, userId, sceneId, question.id, {
      status: result.status,
      updatedAt: Date.now(),
      userAnswer:
        (getEffectiveAnswer(question, answers[question.id]) as AnswerValue | undefined) ?? null,
      result: {
        questionId: result.questionId,
        correct: result.correct,
        status: result.status,
        earned: result.earned,
        aiComment: result.aiComment,
        codeReport: result.codeReport,
      },
    });
    onAttemptFinished?.();
  }, [
    phase,
    singleQuestionMode,
    effectiveQuestions,
    results,
    answers,
    sceneId,
    stageId,
    userId,
    onAttemptFinished,
  ]);

  const handleRetry = useCallback(() => {
    if (singleQuestionMode && effectiveQuestions.length === 1 && stageId) {
      clearQuestionProgress(stageId, userId, sceneId, effectiveQuestions[0].id);
    }
    setAnsweringQuestionIndex(0);
    setPhase(singleQuestionMode ? 'answering' : 'not_started');
    setAnswers({});
    setResults([]);
    clearAnswersCache();
    onAttemptFinished?.();
  }, [
    clearAnswersCache,
    singleQuestionMode,
    effectiveQuestions,
    stageId,
    userId,
    sceneId,
    onAttemptFinished,
  ]);

  const earnedScore = useMemo(
    () => results.reduce((sum, result) => sum + result.earned, 0),
    [results],
  );
  const resultMap = useMemo(() => {
    const map: Record<string, QuestionResult> = {};
    results.forEach((result) => {
      map[result.questionId] = result;
    });
    return map;
  }, [results]);

  return (
    <div className="w-full h-full bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-900 overflow-hidden flex flex-col">
      <AnimatePresence mode="wait">
        {phase === 'not_started' && (
          <motion.div
            key="cover"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1"
          >
            <QuizCover
              questionCount={effectiveQuestions.length}
              totalPoints={totalPoints}
              onStart={() => {
                setAnsweringQuestionIndex(0);
                setPhase('answering');
              }}
            />
          </motion.div>
        )}

        {phase === 'answering' && (
          <motion.div
            key="answering"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 flex flex-col min-h-0"
          >
            <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 dark:border-gray-700 bg-white/80 dark:bg-gray-900/80 backdrop-blur shrink-0">
              <div className="flex items-center gap-2">
                <PieChart className="w-4 h-4 text-sky-500" />
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  {t('quiz.answering')}
                </span>
                <span className="text-xs text-gray-400 ml-1">
                  {effectiveQuestions.length > 1
                    ? locale === 'zh-CN'
                      ? `第 ${answeringQuestionIndex + 1} / ${effectiveQuestions.length} 题 · 已答 ${answeredCount}`
                      : `Q${answeringQuestionIndex + 1}/${effectiveQuestions.length} · ${answeredCount} answered`
                    : `${answeredCount} / ${effectiveQuestions.length}`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {onHubPrevQuestion && (
                  <button
                    type="button"
                    onClick={onHubPrevQuestion}
                    disabled={hubPrevDisabled}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                      hubPrevDisabled
                        ? 'cursor-not-allowed text-gray-300 dark:text-gray-600'
                        : 'text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/30',
                    )}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {t('quiz.prevQuestion')}
                  </button>
                )}
                {onHubNextQuestion && (
                  <button
                    type="button"
                    onClick={onHubNextQuestion}
                    disabled={hubNextDisabled}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                      hubNextDisabled
                        ? 'cursor-not-allowed text-gray-300 dark:text-gray-600'
                        : 'text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/30',
                    )}
                  >
                    {t('quiz.nextQuestion')}
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={handleSubmit}
                  disabled={!allAnswered}
                  className={cn(
                    'px-4 py-1.5 rounded-lg text-xs font-medium transition-all',
                    allAnswered
                      ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-sm hover:shadow-md hover:shadow-sky-200/50 dark:hover:shadow-sky-900/50 active:scale-[0.97]'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed',
                  )}
                >
                  {t('quiz.submitAnswers')}
                </button>
              </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
                {(effectiveQuestions.length > 1
                  ? [{ question: effectiveQuestions[answeringQuestionIndex], index: answeringQuestionIndex }]
                  : effectiveQuestions.map((question, index) => ({ question, index }))
                ).map(({ question, index }) =>
                  renderQuestion(
                    question,
                    index,
                    getEffectiveAnswer(question, answers[question.id]),
                    (value) => handleSetAnswer(question.id, value),
                    undefined,
                    locale,
                    handleQuestionUpdate,
                  ),
                )}
              </div>
              {effectiveQuestions.length > 1 && (
                <div className="shrink-0 flex items-center justify-between gap-3 px-6 py-3 border-t border-gray-100 dark:border-gray-700 bg-white/90 dark:bg-gray-900/90 backdrop-blur">
                  <button
                    type="button"
                    disabled={answeringQuestionIndex <= 0}
                    onClick={() => setAnsweringQuestionIndex((i) => Math.max(0, i - 1))}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                      answeringQuestionIndex <= 0
                        ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                        : 'text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/30',
                    )}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    {t('quiz.prevQuestion')}
                  </button>
                  <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                    {answeringQuestionIndex + 1} / {effectiveQuestions.length}
                  </span>
                  <button
                    type="button"
                    disabled={answeringQuestionIndex >= effectiveQuestions.length - 1}
                    onClick={() =>
                      setAnsweringQuestionIndex((i) =>
                        Math.min(effectiveQuestions.length - 1, i + 1),
                      )
                    }
                    className={cn(
                      'inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                      answeringQuestionIndex >= effectiveQuestions.length - 1
                        ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                        : 'text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/30',
                    )}
                  >
                    {t('quiz.nextQuestion')}
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {phase === 'grading' && (
          <motion.div
            key="grading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col items-center justify-center gap-5"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
            >
              <Loader2 className="w-10 h-10 text-sky-500" />
            </motion.div>
            <div className="text-center">
              <p className="text-base font-semibold text-gray-700 dark:text-gray-200">
                {t('quiz.aiGrading')}
              </p>
              <p className="text-sm text-gray-400 mt-1">{t('quiz.aiGradingWait')}</p>
            </div>
            <div className="flex gap-1 mt-2">
              {[0, 1, 2].map((idx) => (
                <motion.div
                  key={idx}
                  className="w-2 h-2 rounded-full bg-sky-400"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ repeat: Infinity, duration: 1.2, delay: idx * 0.2 }}
                />
              ))}
            </div>
          </motion.div>
        )}

        {phase === 'reviewing' && (
          <motion.div
            key="reviewing"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex-1 flex flex-col min-h-0"
          >
            <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 dark:border-gray-700 bg-white/80 dark:bg-gray-900/80 backdrop-blur shrink-0">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  {t('quiz.quizReport')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {onHubPrevQuestion && (
                  <button
                    type="button"
                    onClick={onHubPrevQuestion}
                    disabled={hubPrevDisabled}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                      hubPrevDisabled
                        ? 'cursor-not-allowed text-gray-300 dark:text-gray-600'
                        : 'text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/30',
                    )}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {t('quiz.prevQuestion')}
                  </button>
                )}
                {onHubNextQuestion && (
                  <button
                    type="button"
                    onClick={onHubNextQuestion}
                    disabled={hubNextDisabled}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                      hubNextDisabled
                        ? 'cursor-not-allowed text-gray-300 dark:text-gray-600'
                        : 'text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/30',
                    )}
                  >
                    {t('quiz.nextQuestion')}
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={handleRetry}
                  className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {t('quiz.retry')}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {!(singleQuestionMode && effectiveQuestions.length === 1) && (
                <ScoreBanner score={earnedScore} total={totalPoints} results={results} />
              )}
              {effectiveQuestions.map((question, index) =>
                renderQuestion(
                  question,
                  index,
                  getEffectiveAnswer(question, answers[question.id]),
                  () => {},
                  resultMap[question.id],
                  locale,
                  handleQuestionUpdate,
                ),
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
