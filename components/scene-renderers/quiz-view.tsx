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
  Flame,
  Gift,
  Heart,
  ShieldCheck,
  WandSparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { backendJson } from '@/lib/utils/backend-api';
import { notifyCreditsBalancesChanged } from '@/lib/utils/credits-balance-events';
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
import { useSettingsStore } from '@/lib/store/settings';
import { useNotificationStore } from '@/lib/store/notifications';
import {
  clearQuestionProgress,
  getQuestionProgress,
  setQuestionProgress,
} from '@/lib/utils/quiz-question-progress';
import { code } from '@streamdown/code';
import { Streamdown } from 'streamdown';
import type { GamificationEventResponse } from '@/lib/types/gamification';
import { toast } from 'sonner';
import {
  LEARNING_CARD_DEFINITIONS,
  MENTOR_LEARNING_CARD_PRIORITY,
  buildQuestionHint,
  buildRubricPeek,
  createLearningRunState,
  drawLearningCard,
  pickWrongOptionToHide,
  summarizeLearningRun,
  type LearningCardDefinition,
  type LearningCardId,
  type LearningRunState,
  type LearningRunSummary,
} from '@/lib/learning/quiz-roguelike';
import {
  buildMistakeMemoryLine,
  buildStudyCompanionNotification,
  getLearningRunStats,
  recordQuizMemory,
} from '@/lib/learning/study-memory';
import { TalkingAvatarOverlay } from '@/components/canvas/talking-avatar-overlay';
import type { Live2DPresenterModelId } from '@/lib/live2d/presenter-models';
import { LIVE2D_PRESENTER_MODELS } from '@/lib/live2d/presenter-models';
import { LIVE2D_PRESENTER_PERSONAS } from '@/lib/live2d/presenter-personas';

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
  readonly onAttemptFinished?: (results?: QuestionResult[]) => void;
  readonly battleHeader?: ReactNode;
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
  if (
    /^package\s+\w+/.test(first) ||
    /^public\s+class\b/.test(first) ||
    /^import\s+java\./.test(first)
  )
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
    out = out.replace(
      /;\s+(?=(?:public|private|protected|static|final|class|interface|enum|import|package)\b)/g,
      ';\n',
    );
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
    return (
      looksLikeCodeLine(line) ||
      (/^\s*import\s+\w+/.test(line) && (/[=.]/.test(line) || /\s/.test(line)))
    );
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
  hiddenOptionValues = [],
}: {
  question: QuizQuestion;
  index: number;
  value?: string | string[];
  onChange: (value: string | string[]) => void;
  disabled?: boolean;
  result?: QuestionResult;
  multiSelect: boolean;
  onQuestionUpdate?: (questionId: string, patch: Partial<QuizQuestion>) => void;
  hiddenOptionValues?: string[];
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
        {question.options
          ?.filter((opt) => isReview || !hiddenOptionValues.includes(opt.value))
          .map((opt) => {
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
                  <RichText
                    content={opt.label}
                    languageHint={question.language}
                    className="text-inherit"
                  />
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
                <p className="text-xs text-sky-600/80 dark:text-sky-400/80">{result.aiComment}</p>
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
              <RichText
                content={referenceContent}
                languageHint={question.language}
                className="leading-6"
              />
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
      points:
        Number.isFinite(parsedPoints) && parsedPoints > 0 ? parsedPoints : (question.points ?? 1),
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
              !isReview && 'bg-sky-100 dark:bg-sky-900/50 text-sky-600 dark:text-sky-400',
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
          {isReview && result.status === 'correct' && (
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
          )}
          {isReview && result.status === 'incorrect' && (
            <XCircle className="w-6 h-6 text-red-400" />
          )}
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
              {locale === 'zh-CN'
                ? '保存后会立即更新当前题目展示与作答。'
                : 'Changes apply immediately to this quiz view.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                {locale === 'zh-CN' ? '题干' : 'Question'}
              </p>
              <Textarea
                value={draftQuestion}
                onChange={(e) => setDraftQuestion(e.target.value)}
                rows={3}
              />
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
              <p className="text-xs text-muted-foreground">
                {locale === 'zh-CN' ? '解析（可选）' : 'Analysis (optional)'}
              </p>
              <Textarea
                value={draftAnalysis}
                onChange={(e) => setDraftAnalysis(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                {locale === 'zh-CN' ? '分值' : 'Points'}
              </p>
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

function GamificationRewardBanner({ reward }: { reward: GamificationEventResponse | null }) {
  if (!reward || (!reward.rewardedPurchaseCredits && !reward.rewardedAffinity)) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-amber-200/70 bg-gradient-to-r from-amber-50 via-white to-rose-50 p-4 dark:border-amber-500/20 dark:from-amber-950/20 dark:via-slate-900 dark:to-rose-950/20"
    >
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 size-4 text-amber-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {reward.characterName} 把这次进度帮你记下来了
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {reward.rewardedPurchaseCredits > 0
              ? `+${reward.rewardedPurchaseCredits} 购买积分`
              : '已记录'}
            {reward.rewardedAffinity > 0 ? ` · +${reward.rewardedAffinity} 亲密度` : ''}
          </p>
        </div>
        <div className="rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-amber-700 shadow-sm dark:bg-slate-900/80 dark:text-amber-200">
          Lv{reward.affinityLevel}
        </div>
      </div>
    </motion.div>
  );
}

function learningCardRarityClass(rarity: LearningCardDefinition['rarity']): string {
  switch (rarity) {
    case 'rare':
      return 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100';
    case 'advanced':
      return 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800 dark:border-fuchsia-400/25 dark:bg-fuchsia-400/10 dark:text-fuchsia-100';
    default:
      return 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100';
  }
}

function getCompanionStatusLine(args: {
  modelId: Live2DPresenterModelId;
  phase: Phase;
  answeredCount: number;
  totalCount: number;
  currentQuestion?: QuizQuestion;
  run: LearningRunState | null;
  summary?: LearningRunSummary | null;
}): string {
  const persona = LIVE2D_PRESENTER_PERSONAS[args.modelId];
  if (args.summary) {
    return `这局答对 ${args.summary.correctCount} 题，最高连胜 ${args.summary.longestStreak}。解析看完后，我们再把下一关接上。`;
  }
  if (args.phase === 'not_started') return '准备好了就开始这一关，我会在旁边帮你盯住节奏。';
  if (args.phase === 'grading') return '我正在帮你整理这轮答案，先别急着切走。';
  if (args.phase === 'reviewing') return '结果已经出来了，先看错因，再决定要不要重试。';
  if (args.run?.usedCards.length) {
    const lastCard = args.run.usedCards[args.run.usedCards.length - 1];
    const card = lastCard ? LEARNING_CARD_DEFINITIONS[lastCard] : null;
    if (card) return card.teacherLine;
  }
  if (args.currentQuestion) {
    return `第 ${Math.min(args.answeredCount + 1, args.totalCount)} 题我在旁边看着。先稳住题干，再动手。`;
  }
  return persona.bondLine;
}

function LearningCompanionPanel({
  run,
  currentQuestion,
  summary,
  modelId,
  phase,
  answeredCount,
  totalCount,
  onUseCard,
  fullHeight = false,
}: {
  run: LearningRunState | null;
  currentQuestion?: QuizQuestion;
  summary?: LearningRunSummary | null;
  modelId: Live2DPresenterModelId;
  phase: Phase;
  answeredCount: number;
  totalCount: number;
  onUseCard: (cardId: LearningCardId) => void;
  fullHeight?: boolean;
}) {
  const model = LIVE2D_PRESENTER_MODELS[modelId];
  const persona = LIVE2D_PRESENTER_PERSONAS[modelId];
  const priorityCards = MENTOR_LEARNING_CARD_PRIORITY[modelId]
    .slice(0, 4)
    .map((cardId) => LEARNING_CARD_DEFINITIONS[cardId])
    .filter(Boolean);
  const usableCards = run?.hand.filter((cardId) => !run.usedCards.includes(cardId)) ?? [];
  const usedCards = run?.hand.filter((cardId) => run.usedCards.includes(cardId)) ?? [];
  const companionLine = getCompanionStatusLine({
    modelId,
    phase,
    answeredCount,
    totalCount,
    currentQuestion,
    run,
    summary,
  });
  return (
    <aside
      className={cn(
        'flex h-full min-h-[560px] flex-col overflow-hidden border border-rose-100/80 bg-white/90 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-950/85 lg:min-h-0',
        fullHeight ? 'rounded-none border-y-0 border-r-0' : 'rounded-3xl',
      )}
    >
      <div className="relative h-64 shrink-0 overflow-hidden border-b border-rose-100 bg-[radial-gradient(circle_at_50%_20%,rgba(251,207,232,0.72),transparent_45%),linear-gradient(180deg,#fff7fb,#eff6ff)] dark:border-white/10 dark:bg-[radial-gradient(circle_at_50%_20%,rgba(244,114,182,0.2),transparent_45%),linear-gradient(180deg,#0f172a,#020617)]">
        <div className="absolute left-4 top-4 z-10 rounded-full border border-white/70 bg-white/80 px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-950/70 dark:text-slate-100">
          {model.badgeLabel} · 导师陪伴
        </div>
        <TalkingAvatarOverlay
          speaking={phase === 'grading'}
          speechText={companionLine}
          cadence={phase === 'answering' ? 'active' : phase === 'grading' ? 'fallback' : 'pause'}
          layout="card"
          cardFraming="half"
          modelIdOverride={modelId}
          showBadge={false}
          showStatusDot={false}
          className="absolute inset-x-0 bottom-0 h-full"
        />
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="rounded-2xl border border-rose-100 bg-rose-50/80 p-3 text-sm leading-6 text-rose-900 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-100">
          <div className="mb-1 flex items-center gap-2 text-xs font-black opacity-70">
            <Heart className="h-3.5 w-3.5" />
            导师提示
          </div>
          {companionLine}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/5">
            <p className="text-[11px] font-black text-slate-500 dark:text-slate-400">本局进度</p>
            <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">
              {answeredCount}/{totalCount}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/5">
            <p className="text-[11px] font-black text-slate-500 dark:text-slate-400">
              {summary ? '结算倍率' : '豁免次数'}
            </p>
            <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">
              {summary ? `x${summary.finalMultiplier}` : run ? run.mistakeShield : 0}
            </p>
          </div>
        </div>

        {summary ? (
          <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
            <Gift className="h-3.5 w-3.5" />
            预览奖励 {summary.rewardPreview}
          </div>
        ) : null}

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-black text-slate-500 dark:text-slate-400">
              <WandSparkles className="h-3.5 w-3.5" />
              导师卡组
            </p>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-white/10 dark:text-slate-400">
              {persona.personalityTags[2] ?? '陪伴型'}
            </span>
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {priorityCards.map((card) => (
              <span
                key={card.id}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[10px] font-bold',
                  learningCardRarityClass(card.rarity),
                )}
              >
                {card.name}
              </span>
            ))}
          </div>
          <div className="grid gap-2">
            {usableCards.map((cardId) => {
              const card = LEARNING_CARD_DEFINITIONS[cardId];
              const disabled =
                !currentQuestion ||
                (card.effect === 'eliminateOption' && !isObjectiveQuestion(currentQuestion)) ||
                (card.effect === 'rubricPeek' && !isTextQuestion(currentQuestion));
              return (
                <button
                  key={cardId}
                  type="button"
                  disabled={disabled || phase !== 'answering'}
                  onClick={() => onUseCard(cardId)}
                  title={card.description}
                  className={cn(
                    'rounded-2xl border p-3 text-left text-xs transition-all',
                    disabled || phase !== 'answering'
                      ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500'
                      : 'border-rose-200 bg-white text-slate-700 shadow-sm hover:-translate-y-0.5 hover:border-rose-300 hover:text-rose-700 dark:border-rose-500/20 dark:bg-slate-950 dark:text-slate-200 dark:hover:text-rose-200',
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-black">{card.name}</span>
                    <span
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[10px] font-bold',
                        learningCardRarityClass(card.rarity),
                      )}
                    >
                      {card.rarity}
                    </span>
                  </span>
                  <span className="mt-1 block leading-5 opacity-75">{card.description}</span>
                </button>
              );
            })}
            {usableCards.length === 0 ? (
              <span className="rounded-2xl border border-dashed border-slate-200 px-3 py-3 text-xs leading-5 text-slate-400 dark:border-slate-700">
                本局手牌已用完，先靠自己打完这一关。
              </span>
            ) : null}
          </div>
        </div>

        {usedCards.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-black text-slate-500 dark:text-slate-400">已使用</p>
            <div className="flex flex-wrap gap-1.5">
              {usedCards.map((cardId) => {
                const card = LEARNING_CARD_DEFINITIONS[cardId];
                return (
                  <span
                    key={cardId}
                    className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400"
                  >
                    {card.name}
                  </span>
                );
              })}
            </div>
          </div>
        ) : null}

        {!run ? (
          <div className="rounded-2xl border border-dashed border-slate-200 p-3 text-xs leading-5 text-slate-500 dark:border-white/10 dark:text-slate-400">
            开始答题后，这里会显示本局手牌、导师提示和临时遗物效果。
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function LearningAssistPanels({
  question,
  run,
}: {
  question: QuizQuestion;
  run: LearningRunState | null;
}) {
  if (!run) return null;
  const hint = run.hints[question.id];
  const rubric = run.rubricPeeks[question.id];
  if (!hint && !rubric) return null;
  return (
    <div className="space-y-2">
      {hint ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/20 dark:bg-rose-950/20 dark:text-rose-100">
          <span className="font-semibold">撒娇提示：</span>
          {hint}
        </div>
      ) : null}
      {rubric ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:border-sky-500/20 dark:bg-sky-950/20 dark:text-sky-100">
          <span className="font-semibold">偷看一眼：</span>
          {rubric}
        </div>
      ) : null}
    </div>
  );
}

function LearningRunSummaryBanner({
  summary,
  unlockedCards,
}: {
  summary: LearningRunSummary | null;
  unlockedCards: LearningCardDefinition[];
}) {
  if (!summary) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-rose-200/70 bg-gradient-to-r from-rose-50 via-white to-sky-50 p-4 dark:border-rose-500/20 dark:from-rose-950/20 dark:via-slate-900 dark:to-sky-950/20"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-slate-950">
          <Flame className="h-3.5 w-3.5 text-orange-300" />
          最终倍率 x{summary.finalMultiplier}
        </div>
        <div className="flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-100">
          <ShieldCheck className="h-3.5 w-3.5" />
          豁免 {summary.forgivenMistakes} 次
        </div>
        <div className="flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:bg-amber-400/15 dark:text-amber-100">
          <Gift className="h-3.5 w-3.5" />
          局内奖励预览 {summary.rewardPreview}
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">
        这局的临时卡牌已经结算啦；局外解锁会保留到你的卡池里，下一局能抽到更强的牌。
      </p>
      {unlockedCards.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {unlockedCards.map((card) => (
            <span
              key={card.id}
              className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-xs font-semibold text-fuchsia-700 dark:border-fuchsia-400/20 dark:bg-fuchsia-400/10 dark:text-fuchsia-100"
            >
              新解锁：{card.name}
            </span>
          ))}
        </div>
      ) : null}
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
  hiddenOptionValues: string[] = [],
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
        hiddenOptionValues={hiddenOptionValues}
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
  battleHeader,
  onHubPrevQuestion,
  hubPrevDisabled = false,
  onHubNextQuestion,
  hubNextDisabled = false,
}: QuizViewProps) {
  const { t, locale } = useI18n();
  const stageId = useStageStore((s) => s.stage?.id ?? '');
  const userId = useAuthStore((s) => (s.userId?.trim() ? s.userId : 'user-anonymous'));
  const live2dPresenterModelId = useSettingsStore((s) => s.live2dPresenterModelId);
  const enqueueBanner = useNotificationStore((s) => s.enqueueBanner);

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
  const [gamificationReward, setGamificationReward] = useState<GamificationEventResponse | null>(
    null,
  );
  const [learningRun, setLearningRun] = useState<LearningRunState | null>(null);
  const [learningRunSummary, setLearningRunSummary] = useState<LearningRunSummary | null>(null);
  const [newlyUnlockedCards, setNewlyUnlockedCards] = useState<LearningCardDefinition[]>([]);
  const useBattleShell = Boolean(battleHeader);

  const effectiveQuestions = useMemo(
    () => questions.map((q) => ({ ...q, ...(questionEdits[q.id] ?? {}) })),
    [questions, questionEdits],
  );

  const handleQuestionUpdate = useCallback((questionId: string, patch: Partial<QuizQuestion>) => {
    setQuestionEdits((prev) => ({
      ...prev,
      [questionId]: { ...(prev[questionId] ?? {}), ...patch },
    }));
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

  const startLearningRun = useCallback(() => {
    const stats = getLearningRunStats(userId, stageId || sceneId);
    setLearningRun(
      createLearningRunState({ sceneId, userId, stats, mentorId: live2dPresenterModelId }),
    );
    setLearningRunSummary(null);
    setNewlyUnlockedCards([]);
  }, [live2dPresenterModelId, sceneId, stageId, userId]);

  const handleStartQuiz = useCallback(() => {
    setAnsweringQuestionIndex(0);
    startLearningRun();
    setPhase('answering');
  }, [startLearningRun]);

  useEffect(() => {
    if (phase === 'answering' && !learningRun) {
      startLearningRun();
    }
  }, [phase, learningRun, startLearningRun]);

  const handleSubmit = useCallback(() => {
    setPhase('grading');
    clearAnswersCache();
  }, [clearAnswersCache]);

  useEffect(() => {
    if (phase !== 'answering' || !learningRun || effectiveQuestions.length <= 1) return;
    const milestones = [
      Math.ceil(effectiveQuestions.length / 3),
      Math.ceil((effectiveQuestions.length * 2) / 3),
    ].filter((value, index, values) => value > 0 && values.indexOf(value) === index);
    const nextMilestone = milestones.find(
      (value) => answeredCount >= value && !learningRun.milestoneDraws.includes(value),
    );
    if (!nextMilestone) return;
    const cardId = drawLearningCard({
      sceneId,
      userId,
      stats: getLearningRunStats(userId, stageId || sceneId),
      drawIndex: learningRun.milestoneDraws.length + 1,
      excludeIds: learningRun.hand,
      mentorId: live2dPresenterModelId,
    });
    setLearningRun((prev) =>
      prev
        ? {
            ...prev,
            hand: [...prev.hand, cardId],
            milestoneDraws: [...prev.milestoneDraws, nextMilestone],
          }
        : prev,
    );
    toast.success(`宝箱掉落：${LEARNING_CARD_DEFINITIONS[cardId].name}`);
  }, [
    answeredCount,
    effectiveQuestions.length,
    learningRun,
    live2dPresenterModelId,
    phase,
    sceneId,
    stageId,
    userId,
  ]);

  const handleUseLearningCard = useCallback(
    (cardId: LearningCardId) => {
      const card = LEARNING_CARD_DEFINITIONS[cardId];
      const currentQuestion = effectiveQuestions[answeringQuestionIndex];
      if (!card || !currentQuestion) return;

      setLearningRun((prev) => {
        if (!prev || prev.usedCards.includes(cardId)) return prev;
        const next: LearningRunState = {
          ...prev,
          usedCards: [...prev.usedCards, cardId],
          eliminatedOptions: { ...prev.eliminatedOptions },
          hints: { ...prev.hints },
          rubricPeeks: { ...prev.rubricPeeks },
        };

        switch (card.effect) {
          case 'hint':
            next.hints[currentQuestion.id] = buildQuestionHint(currentQuestion);
            break;
          case 'mistakeShield':
            next.mistakeShield += 1;
            break;
          case 'eliminateOption': {
            const hidden = pickWrongOptionToHide(
              currentQuestion,
              `${sceneId}:${currentQuestion.id}:${cardId}`,
            );
            if (hidden) {
              next.eliminatedOptions[currentQuestion.id] = [
                ...(next.eliminatedOptions[currentQuestion.id] ?? []),
                hidden,
              ];
            }
            break;
          }
          case 'nextCorrectBonus':
            next.nextCorrectBonus += 0.1;
            break;
          case 'preserveMultiplier':
            next.preserveMultiplier = true;
            break;
          case 'comboDouble':
            next.comboDoubleQuestions = Math.max(next.comboDoubleQuestions, 3);
            break;
          case 'mistakeRadar':
            next.mistakeRadar = true;
            break;
          case 'rubricPeek':
            next.rubricPeeks[currentQuestion.id] = buildRubricPeek(currentQuestion);
            break;
          case 'bossBonus':
            next.bossBonus = true;
            break;
          default:
            break;
        }
        return next;
      });
      toast.success(`${card.name}：${card.teacherLine}`);
    },
    [answeringQuestionIndex, effectiveQuestions, sceneId],
  );

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
      const runForSummary = learningRun;
      if (runForSummary) {
        const previousStats = getLearningRunStats(userId, stageId || sceneId);
        const summary = summarizeLearningRun({
          results: ordered,
          previousStats,
          run: runForSummary,
        });
        const memory = recordQuizMemory({
          userId,
          stageId: stageId || sceneId,
          sceneId,
          questions: effectiveQuestions,
          results: ordered,
          mistakeRadar: runForSummary.mistakeRadar,
        });
        setLearningRunSummary(summary);
        setNewlyUnlockedCards(summary.unlockedCards);
        if (memory.newWeakPoints.length > 0) {
          const weakPoint = memory.newWeakPoints[0];
          enqueueBanner(
            buildStudyCompanionNotification({
              id: `mistake-memory:${weakPoint.id}:${Date.now()}`,
              sourceKind: 'mistake_review',
              title: '我帮你记下来了',
              body: buildMistakeMemoryLine(weakPoint),
              sourceLabel: '错题记忆',
              details: [
                { key: 'weakPoint', label: '卡点', value: weakPoint.title },
                { key: 'reason', label: '复习线索', value: weakPoint.reason },
              ],
            }),
          );
        } else if (summary.correctCount > 0) {
          enqueueBanner(
            buildStudyCompanionNotification({
              id: `study-run:${sceneId}:${Date.now()}`,
              sourceKind: 'study_nudge',
              title: '这局手感我收到了',
              body: `这局答对 ${summary.correctCount} 题，最高连胜 ${summary.longestStreak}。你刚才的推进我有好好记着，下一关继续陪你。`,
              sourceLabel: '做题陪伴',
            }),
          );
        }
      }
      setResults(ordered);
      setPhase('reviewing');
    })();

    return () => {
      cancelled = true;
    };
  }, [
    phase,
    effectiveQuestions,
    answers,
    locale,
    learningRun,
    userId,
    stageId,
    sceneId,
    enqueueBanner,
  ]);

  const persistDoneRef = useRef(false);

  useEffect(() => {
    if (singleQuestionMode && initialSnapshot?.phase === 'reviewing') {
      persistDoneRef.current = true;
    }
  }, [singleQuestionMode, initialSnapshot]);

  const rewardEventDoneRef = useRef(false);
  const attemptFinishedDoneRef = useRef(false);

  useEffect(() => {
    if (initialSnapshot?.phase === 'reviewing') {
      rewardEventDoneRef.current = true;
    }
  }, [initialSnapshot]);

  useEffect(() => {
    if (phase !== 'reviewing') {
      persistDoneRef.current = false;
      rewardEventDoneRef.current = false;
      attemptFinishedDoneRef.current = false;
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== 'reviewing' || results.length === 0 || attemptFinishedDoneRef.current) return;
    attemptFinishedDoneRef.current = true;
    onAttemptFinished?.(results);
  }, [phase, results, onAttemptFinished]);

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
  }, [phase, singleQuestionMode, effectiveQuestions, results, answers, sceneId, stageId, userId]);

  const handleRetry = useCallback(() => {
    if (singleQuestionMode && effectiveQuestions.length === 1 && stageId) {
      clearQuestionProgress(stageId, userId, sceneId, effectiveQuestions[0].id);
    }
    setAnsweringQuestionIndex(0);
    setPhase(singleQuestionMode ? 'answering' : 'not_started');
    setAnswers({});
    setResults([]);
    setGamificationReward(null);
    setLearningRun(null);
    setLearningRunSummary(null);
    setNewlyUnlockedCards([]);
    clearAnswersCache();
    onAttemptFinished?.([]);
  }, [
    clearAnswersCache,
    singleQuestionMode,
    effectiveQuestions,
    stageId,
    userId,
    sceneId,
    onAttemptFinished,
  ]);

  useEffect(() => {
    if (phase !== 'reviewing' || rewardEventDoneRef.current || results.length === 0) {
      return;
    }
    rewardEventDoneRef.current = true;

    let cancelled = false;

    (async () => {
      try {
        const correctCount = results.filter((result) => result.status === 'correct').length;
        const accuracyPercent =
          effectiveQuestions.length > 0
            ? Math.round((correctCount / effectiveQuestions.length) * 100)
            : 0;

        let payload:
          | {
              type: 'quiz_completed';
              sceneId: string;
              sceneTitle?: string;
              referenceKey: string;
              questionCount: number;
              correctCount: number;
              accuracyPercent: number;
            }
          | {
              type: 'review_completed';
              sceneId: string;
              sceneTitle?: string;
              referenceKey: string;
              hadPreviousIncorrect: boolean;
            };

        if (singleQuestionMode && effectiveQuestions.length === 1) {
          const question = effectiveQuestions[0];
          const previous = getQuestionProgress(stageId, userId, sceneId, question.id);
          const current = results.find((item) => item.questionId === question.id);
          const referenceKey = `${sceneId}:${question.id}`;

          if (previous?.status === 'incorrect' && current?.status === 'correct') {
            payload = {
              type: 'review_completed',
              sceneId,
              sceneTitle: question.question,
              referenceKey,
              hadPreviousIncorrect: true,
            };
          } else {
            payload = {
              type: 'quiz_completed',
              sceneId,
              sceneTitle: question.question,
              referenceKey,
              questionCount: 1,
              correctCount,
              accuracyPercent,
            };
          }
        } else {
          payload = {
            type: 'quiz_completed',
            sceneId,
            referenceKey: sceneId,
            questionCount: effectiveQuestions.length,
            correctCount,
            accuracyPercent,
          };
        }

        const reward = await backendJson<GamificationEventResponse>('/api/gamification/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (cancelled) return;
        notifyCreditsBalancesChanged();
        setGamificationReward(reward);
        if (reward.rewardedPurchaseCredits > 0 || reward.rewardedAffinity > 0) {
          toast.success(
            [
              reward.rewardedPurchaseCredits > 0
                ? `+${reward.rewardedPurchaseCredits} 购买积分`
                : '',
              reward.rewardedAffinity > 0 ? `+${reward.rewardedAffinity} 亲密度` : '',
            ]
              .filter(Boolean)
              .join(' · '),
          );
        }
      } catch {
        // Reward settlement should never block quiz review.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [phase, results, effectiveQuestions, sceneId, singleQuestionMode, stageId, userId]);

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
            className="flex-1 min-h-0"
          >
            {useBattleShell ? (
              <div className="h-full min-h-0 bg-gradient-to-br from-rose-50/45 via-white to-sky-50/55 dark:from-rose-950/10 dark:via-slate-900 dark:to-sky-950/15">
                <div className="grid h-full min-h-0 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
                  <div className="flex min-h-0 flex-col gap-3 p-3 md:p-4">
                    {battleHeader ? <div className="shrink-0">{battleHeader}</div> : null}
                    <div className="min-h-0 flex-1 overflow-hidden rounded-3xl border border-gray-100 bg-white/95 shadow-sm dark:border-white/10 dark:bg-slate-900/85">
                      <QuizCover
                        questionCount={effectiveQuestions.length}
                        totalPoints={totalPoints}
                        onStart={handleStartQuiz}
                      />
                    </div>
                  </div>
                  <LearningCompanionPanel
                    run={learningRun}
                    currentQuestion={effectiveQuestions[0]}
                    summary={learningRunSummary}
                    modelId={live2dPresenterModelId}
                    phase={phase}
                    answeredCount={answeredCount}
                    totalCount={effectiveQuestions.length}
                    onUseCard={handleUseLearningCard}
                    fullHeight
                  />
                </div>
              </div>
            ) : (
              <QuizCover
                questionCount={effectiveQuestions.length}
                totalPoints={totalPoints}
                onStart={handleStartQuiz}
              />
            )}
          </motion.div>
        )}

        {phase === 'answering' && (
          <motion.div
            key="answering"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 min-h-0"
          >
            <div
              className={cn(
                'h-full min-h-0 bg-gradient-to-br from-rose-50/45 via-white to-sky-50/55 dark:from-rose-950/10 dark:via-slate-900 dark:to-sky-950/15',
                useBattleShell ? 'p-0' : 'p-4',
              )}
            >
              <div
                className={cn(
                  'grid h-full min-h-0 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]',
                  useBattleShell ? 'gap-0' : 'gap-4',
                )}
              >
                <div
                  className={cn('flex min-h-0 flex-col gap-3', useBattleShell ? 'p-3 md:p-4' : '')}
                >
                  {battleHeader ? <div className="shrink-0">{battleHeader}</div> : null}
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white/95 shadow-sm dark:border-white/10 dark:bg-slate-900/85">
                    <div className="flex shrink-0 items-center justify-between border-b border-gray-100 bg-white/80 px-6 py-3 backdrop-blur dark:border-gray-700 dark:bg-gray-900/80">
                      <div className="flex items-center gap-2">
                        <PieChart className="h-4 w-4 text-sky-500" />
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                          {t('quiz.answering')}
                        </span>
                        <span className="ml-1 text-xs text-gray-400">
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
                                : 'text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-900/30',
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
                                : 'text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-900/30',
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
                            'rounded-lg px-4 py-1.5 text-xs font-medium transition-all',
                            allAnswered
                              ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-sm hover:shadow-md hover:shadow-sky-200/50 active:scale-[0.97] dark:hover:shadow-sky-900/50'
                              : 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500',
                          )}
                        >
                          {t('quiz.submitAnswers')}
                        </button>
                      </div>
                    </div>
                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
                      {(effectiveQuestions.length > 1
                        ? [
                            {
                              question: effectiveQuestions[answeringQuestionIndex],
                              index: answeringQuestionIndex,
                            },
                          ]
                        : effectiveQuestions.map((question, index) => ({ question, index }))
                      ).map(({ question, index }) => (
                        <div key={question.id} className="space-y-3">
                          <LearningAssistPanels question={question} run={learningRun} />
                          {renderQuestion(
                            question,
                            index,
                            getEffectiveAnswer(question, answers[question.id]),
                            (value) => handleSetAnswer(question.id, value),
                            undefined,
                            locale,
                            handleQuestionUpdate,
                            learningRun?.eliminatedOptions[question.id] ?? [],
                          )}
                        </div>
                      ))}
                    </div>
                    {effectiveQuestions.length > 1 && (
                      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-100 bg-white/90 px-6 py-3 backdrop-blur dark:border-gray-700 dark:bg-gray-900/90">
                        <button
                          type="button"
                          disabled={answeringQuestionIndex <= 0}
                          onClick={() => setAnsweringQuestionIndex((i) => Math.max(0, i - 1))}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                            answeringQuestionIndex <= 0
                              ? 'cursor-not-allowed text-gray-300 dark:text-gray-600'
                              : 'text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-900/30',
                          )}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          {t('quiz.prevQuestion')}
                        </button>
                        <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
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
                              ? 'cursor-not-allowed text-gray-300 dark:text-gray-600'
                              : 'text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-900/30',
                          )}
                        >
                          {t('quiz.nextQuestion')}
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <LearningCompanionPanel
                  run={learningRun}
                  currentQuestion={effectiveQuestions[answeringQuestionIndex]}
                  summary={learningRunSummary}
                  modelId={live2dPresenterModelId}
                  phase={phase}
                  answeredCount={answeredCount}
                  totalCount={effectiveQuestions.length}
                  onUseCard={handleUseLearningCard}
                  fullHeight={useBattleShell}
                />
              </div>
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
            className="flex-1 min-h-0"
          >
            <div
              className={cn(
                'h-full min-h-0 bg-gradient-to-br from-rose-50/45 via-white to-sky-50/55 dark:from-rose-950/10 dark:via-slate-900 dark:to-sky-950/15',
                useBattleShell ? 'p-0' : 'p-4',
              )}
            >
              <div
                className={cn(
                  'grid h-full min-h-0 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]',
                  useBattleShell ? 'gap-0' : 'gap-4',
                )}
              >
                <div
                  className={cn('flex min-h-0 flex-col gap-3', useBattleShell ? 'p-3 md:p-4' : '')}
                >
                  {battleHeader ? <div className="shrink-0">{battleHeader}</div> : null}
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white/95 shadow-sm dark:border-white/10 dark:bg-slate-900/85">
                    <div className="flex shrink-0 items-center justify-between border-b border-gray-100 bg-white/80 px-6 py-3 backdrop-blur dark:border-gray-700 dark:bg-gray-900/80">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
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
                                : 'text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-900/30',
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
                                : 'text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-900/30',
                            )}
                          >
                            {t('quiz.nextQuestion')}
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={handleRetry}
                          className="flex items-center gap-1.5 text-xs text-gray-500 transition-colors hover:text-sky-600 dark:text-gray-400 dark:hover:text-sky-400"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          {t('quiz.retry')}
                        </button>
                      </div>
                    </div>
                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
                      {!(singleQuestionMode && effectiveQuestions.length === 1) && (
                        <ScoreBanner score={earnedScore} total={totalPoints} results={results} />
                      )}
                      <LearningRunSummaryBanner
                        summary={learningRunSummary}
                        unlockedCards={newlyUnlockedCards}
                      />
                      <GamificationRewardBanner reward={gamificationReward} />
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
                  </div>
                </div>
                <LearningCompanionPanel
                  run={learningRun}
                  currentQuestion={effectiveQuestions[0]}
                  summary={learningRunSummary}
                  modelId={live2dPresenterModelId}
                  phase={phase}
                  answeredCount={effectiveQuestions.length}
                  totalCount={effectiveQuestions.length}
                  onUseCard={handleUseLearningCard}
                  fullHeight={useBattleShell}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
