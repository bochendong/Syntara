'use client';

import {
  BookOpen,
  CheckSquare,
  Code2,
  FileCode2,
  ListChecks,
  NotepadText,
  Type,
  type LucideIcon,
} from 'lucide-react';
import type { NotebookProblemPublicContent } from '@/lib/problem-bank';
import { cn } from '@/lib/utils';
import { highlightPython } from '@/components/problem-bank/code-answer-editor';
import { ProblemRichText } from '@/components/problem-bank/problem-rich-text';

type CodeProblemPublicContent = Extract<NotebookProblemPublicContent, { type: 'code' }>;
type CodeStatementSection = NonNullable<CodeProblemPublicContent['statementSections']>[number];
type CodeStatementKind = NonNullable<CodeStatementSection['kind']>;

const SECTION_STYLES = {
  overview: {
    icon: 'bg-blue-50 text-blue-600 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/70',
    line: 'bg-blue-100 dark:bg-blue-900/60',
    bullet: 'bg-blue-500 dark:bg-blue-400',
  },
  requirements: {
    icon: 'bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900/70',
    line: 'bg-violet-100 dark:bg-violet-900/60',
    bullet: 'bg-violet-500 dark:bg-violet-400',
  },
  interface: {
    icon: 'bg-sky-50 text-sky-600 ring-sky-100 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900/70',
    line: 'bg-sky-100 dark:bg-sky-900/60',
    bullet: 'bg-sky-500 dark:bg-sky-400',
  },
  invariants: {
    icon: 'bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/70',
    line: 'bg-emerald-100 dark:bg-emerald-900/60',
    bullet: 'bg-emerald-500 dark:bg-emerald-400',
  },
  examples: {
    icon: 'bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/70',
    line: 'bg-amber-100 dark:bg-amber-900/60',
    bullet: 'bg-amber-500 dark:bg-amber-400',
  },
  constraints: {
    icon: 'bg-teal-50 text-teal-600 ring-teal-100 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-900/70',
    line: 'bg-teal-100 dark:bg-teal-900/60',
    bullet: 'bg-teal-500 dark:bg-teal-400',
  },
  notes: {
    icon: 'bg-slate-50 text-slate-600 ring-slate-100 dark:bg-slate-900/80 dark:text-slate-300 dark:ring-slate-800',
    line: 'bg-slate-200 dark:bg-slate-800',
    bullet: 'bg-slate-500 dark:bg-slate-400',
  },
} as const satisfies Record<CodeStatementKind, { icon: string; line: string; bullet: string }>;

const SECTION_ICONS = {
  overview: Type,
  requirements: ListChecks,
  interface: FileCode2,
  invariants: CheckSquare,
  examples: Code2,
  constraints: CheckSquare,
  notes: NotepadText,
} as const satisfies Record<CodeStatementKind, LucideIcon>;

function sectionStyle(kind?: CodeStatementKind) {
  return SECTION_STYLES[kind ?? 'overview'] ?? SECTION_STYLES.overview;
}

function sectionIcon(kind?: CodeStatementKind) {
  return SECTION_ICONS[kind ?? 'overview'] ?? Type;
}

function CodeProblemStatementHeading({
  icon: Icon,
  label,
  kind,
}: {
  icon: LucideIcon;
  label: string;
  kind: CodeStatementKind;
}) {
  const styles = sectionStyle(kind);

  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md ring-1',
          styles.icon,
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <h2 className="shrink-0 text-sm font-semibold text-slate-950 dark:text-white">{label}</h2>
      <span className={cn('h-px min-w-8 flex-1', styles.line)} />
    </div>
  );
}

function CodeStatementCodeBlock({ code, language }: { code: string; language?: string }) {
  const isPython = !language || language.toLowerCase() === 'python';

  return (
    <pre className="overflow-x-auto rounded-md border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-[13px] leading-6 text-slate-800 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-100">
      <code>{isPython ? highlightPython(code) : code}</code>
    </pre>
  );
}

function CodeStatementItems({ items, kind }: { items: string[]; kind: CodeStatementKind }) {
  if (items.length === 0) return null;
  const styles = sectionStyle(kind);

  return (
    <ul className="space-y-2 text-sm leading-7 text-slate-700 dark:text-slate-200">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="flex items-start gap-3">
          <span className={cn('mt-3 h-1.5 w-1.5 shrink-0 rounded-full', styles.bullet)} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function CodeStatementSection({ section }: { section: CodeStatementSection }) {
  const kind = section.kind ?? 'overview';
  const Icon = sectionIcon(kind);

  return (
    <section className="space-y-4">
      <CodeProblemStatementHeading icon={Icon} label={section.title} kind={kind} />
      <div className="space-y-3 border-l border-slate-200 pl-4 dark:border-slate-800">
        {section.body ? (
          <div className="text-[15px] leading-7">
            <ProblemRichText content={section.body} />
          </div>
        ) : null}
        <CodeStatementItems items={section.items ?? []} kind={kind} />
        {section.code ? (
          <CodeStatementCodeBlock code={section.code} language={section.codeLanguage} />
        ) : null}
      </div>
    </section>
  );
}

function LegacyDescriptionSection({ stem, locale }: { stem: string; locale: 'zh-CN' | 'en-US' }) {
  return (
    <section className="space-y-4">
      <CodeProblemStatementHeading
        icon={Type}
        label={locale === 'zh-CN' ? '描述' : 'Description'}
        kind="overview"
      />
      <div className="border-l border-blue-100 pl-4 text-[15px] leading-7 dark:border-blue-900/60">
        <ProblemRichText content={stem} />
      </div>
    </section>
  );
}

function CodeSamplesSection({
  samples,
  locale,
}: {
  samples: CodeProblemPublicContent['sampleIO'];
  locale: 'zh-CN' | 'en-US';
}) {
  if (samples.length === 0) return null;

  return (
    <section className="space-y-4">
      <CodeProblemStatementHeading
        icon={Code2}
        label={locale === 'zh-CN' ? '示例' : 'Examples'}
        kind="examples"
      />
      <div className="space-y-4">
        {samples.map((sample, index) => (
          <div key={`${sample.input}-${index}`} className="space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-amber-50 px-2 font-mono text-xs font-semibold text-amber-700 ring-1 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/70">
                {index + 1}
              </span>
              <h3 className="text-sm font-semibold text-slate-950 dark:text-white">
                {locale === 'zh-CN' ? `示例 ${index + 1}:` : `Example ${index + 1}:`}
              </h3>
            </div>
            <pre className="overflow-x-auto rounded-md border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-[13px] leading-7 text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
              <code>
                <span className="font-semibold text-blue-700 dark:text-blue-300">
                  {locale === 'zh-CN' ? '输入:' : 'Input:'}
                </span>{' '}
                <span>{sample.input}</span>
                {'\n'}
                <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                  {locale === 'zh-CN' ? '输出:' : 'Output:'}
                </span>{' '}
                <span>{sample.output}</span>
                {sample.explanation ? (
                  <>
                    {'\n'}
                    <span className="font-semibold text-amber-700 dark:text-amber-300">
                      {locale === 'zh-CN' ? '解释:' : 'Explanation:'}
                    </span>{' '}
                    <span>{sample.explanation}</span>
                  </>
                ) : null}
              </code>
            </pre>
          </div>
        ))}
      </div>
    </section>
  );
}

function CodeConstraintsSection({
  constraints,
  locale,
}: {
  constraints: CodeProblemPublicContent['constraints'];
  locale: 'zh-CN' | 'en-US';
}) {
  if (constraints.length === 0) return null;

  return (
    <section className="space-y-4">
      <CodeProblemStatementHeading
        icon={CheckSquare}
        label={locale === 'zh-CN' ? '约束' : 'Constraints'}
        kind="constraints"
      />
      <ul className="space-y-2 text-sm leading-7 text-slate-700 dark:text-slate-200">
        {constraints.map((constraint, index) => (
          <li key={`${constraint}-${index}`} className="flex items-start gap-3">
            <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500 dark:bg-teal-400" />
            <code className="inline-block rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[13px] leading-6 text-slate-800 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-100">
              {constraint}
            </code>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StarterCodeNote({
  description,
  locale,
}: {
  description?: string;
  locale: 'zh-CN' | 'en-US';
}) {
  if (!description) return null;

  return (
    <div className="rounded-md border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm leading-6 text-slate-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-slate-200">
      <div className="mb-1 flex items-center gap-2 font-semibold text-sky-800 dark:text-sky-200">
        <BookOpen className="h-3.5 w-3.5" />
        <span>{locale === 'zh-CN' ? '起始代码' : 'Starter code'}</span>
      </div>
      <p>{description}</p>
    </div>
  );
}

export function CodeProblemStatement({
  content,
  locale,
}: {
  content: CodeProblemPublicContent;
  locale: 'zh-CN' | 'en-US';
}) {
  const samples = content.sampleIO ?? [];
  const constraints = content.constraints ?? [];
  const sections = content.statementSections ?? [];

  return (
    <div className="space-y-8">
      {sections.length > 0 ? (
        sections.map((section) => <CodeStatementSection key={section.id} section={section} />)
      ) : (
        <LegacyDescriptionSection stem={content.stem} locale={locale} />
      )}
      <CodeSamplesSection samples={samples} locale={locale} />
      <CodeConstraintsSection constraints={constraints} locale={locale} />
      <StarterCodeNote description={content.starterCodeDescription} locale={locale} />
    </div>
  );
}
