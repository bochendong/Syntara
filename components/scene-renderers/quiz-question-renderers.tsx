'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  BookOpenText,
  Check,
  CheckCircle2,
  ChevronRight,
  Code2,
  FileCode2,
  FlaskConical,
  ListChecks,
  Pencil,
  PieChart,
  ScrollText,
  Sigma,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { code } from '@streamdown/code';
import { Streamdown } from 'streamdown';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import { renderInlineMathAwareHtml } from '@/lib/math-engine';
import type { QuizQuestion } from '@/lib/types/stage';
import { SpeechButton } from '@/components/audio/speech-button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { AnswerComposer } from '@/components/problem-bank/answer-composer';
import {
  getDisplayQuestionText,
  normalizeMarkdownForHighlightedCode,
} from '@/components/scene-renderers/quiz-markdown';
import {
  getLanguageDisplayName,
  isCodeQuestion,
  isObjectiveQuestion,
  toArray,
  type AnswerValue,
  type QuestionResult,
} from '@/components/scene-renderers/quiz-view-utils';

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

export function QuizCover({
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
  if (!markdown.includes('```')) {
    return (
      <span
        className={cn(
          'whitespace-pre-wrap [&_.katex]:text-[1em] [&_.math-engine-inline]:align-baseline',
          className,
        )}
        dangerouslySetInnerHTML={{ __html: renderInlineMathAwareHtml(markdown) }}
      />
    );
  }

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
        <AnswerComposer
          value={value ?? ''}
          onChange={onChange}
          locale={locale === 'zh-CN' ? 'zh-CN' : 'en-US'}
          disabled={disabled}
          placeholder={
            isProof
              ? locale === 'zh-CN'
                ? '请写出你的证明过程...'
                : 'Write your proof here...'
              : t('quiz.inputPlaceholder')
          }
          textareaClassName={isProof ? 'min-h-[180px]' : 'min-h-[120px]'}
          footerStart={
            <SpeechButton
              size="sm"
              disabled={disabled}
              onTranscription={(text) => {
                const cur = valueRef.current ?? '';
                onChange(cur + (cur ? ' ' : '') + text);
              }}
            />
          }
          footerEnd={
            <span className="text-xs text-gray-300 dark:text-gray-600">
              {(value ?? '').length} {t('quiz.charCount')}
            </span>
          }
        />
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
  const [draftState, setDraftState] = useState(() => ({
    questionId: question.id,
    question: question.question ?? '',
    codeSnippet: question.codeSnippet ?? '',
    analysis: question.analysis ?? '',
    points: String(question.points ?? 1),
  }));
  const activeDraft = useMemo(
    () =>
      draftState.questionId === question.id
        ? draftState
        : {
            questionId: question.id,
            question: question.question ?? '',
            codeSnippet: question.codeSnippet ?? '',
            analysis: question.analysis ?? '',
            points: String(question.points ?? 1),
          },
    [draftState, question],
  );

  const handleSaveQuestionEdit = useCallback(() => {
    if (!onQuestionUpdate) return;
    const parsedPoints = Number.parseInt(activeDraft.points, 10);
    onQuestionUpdate(question.id, {
      question: activeDraft.question.trim(),
      codeSnippet: activeDraft.codeSnippet.trim() || undefined,
      analysis: activeDraft.analysis.trim() || undefined,
      points:
        Number.isFinite(parsedPoints) && parsedPoints > 0 ? parsedPoints : (question.points ?? 1),
    });
    setEditOpen(false);
  }, [onQuestionUpdate, question, activeDraft]);

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
              onClick={() => {
                setDraftState({
                  questionId: question.id,
                  question: question.question ?? '',
                  codeSnippet: question.codeSnippet ?? '',
                  analysis: question.analysis ?? '',
                  points: String(question.points ?? 1),
                });
                setEditOpen(true);
              }}
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
                value={activeDraft.question}
                onChange={(e) => setDraftState({ ...activeDraft, question: e.target.value })}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                {locale === 'zh-CN' ? '代码片段（可选）' : 'Code Snippet (optional)'}
              </p>
              <Textarea
                value={activeDraft.codeSnippet}
                onChange={(e) => setDraftState({ ...activeDraft, codeSnippet: e.target.value })}
                rows={6}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                {locale === 'zh-CN' ? '解析（可选）' : 'Analysis (optional)'}
              </p>
              <Textarea
                value={activeDraft.analysis}
                onChange={(e) => setDraftState({ ...activeDraft, analysis: e.target.value })}
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
                value={activeDraft.points}
                onChange={(e) => setDraftState({ ...activeDraft, points: e.target.value })}
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

export function renderQuestion(
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
