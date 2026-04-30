'use client';

import { useCallback, useRef, type ReactNode } from 'react';
import {
  Bold,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Pilcrow,
  Sigma,
  Subscript,
  Superscript,
  Table2,
  Type,
  Underline,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const COMMON_MATH_SYMBOLS = [
  '∈',
  '∉',
  '⊂',
  '⊆',
  '⊄',
  '∪',
  '∩',
  '∅',
  '∀',
  '∃',
  '⇒',
  '⇔',
  '≠',
  '≤',
  '≥',
  '≈',
  '∞',
  '∑',
  '√',
  'π',
] as const;

const FONT_FAMILIES = [
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Times New Roman, serif', label: 'Times' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Courier New, monospace', label: 'Mono' },
] as const;

const FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px'] as const;

type InsertRequest =
  | { kind: 'insert'; text: string }
  | { kind: 'wrap'; before: string; after: string; placeholder: string };

interface AnswerComposerProps {
  value: string;
  onChange: (value: string) => void;
  locale: 'zh-CN' | 'en-US';
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  textareaClassName?: string;
  footerStart?: ReactNode;
  footerEnd?: ReactNode;
}

function label(locale: 'zh-CN' | 'en-US', zh: string, en: string) {
  return locale === 'zh-CN' ? zh : en;
}

function ToolButton({
  title,
  disabled,
  onClick,
  children,
}: {
  title: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          aria-label={title}
          onClick={onClick}
          className="text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  );
}

export function AnswerComposer({
  value,
  onChange,
  locale,
  disabled,
  placeholder,
  className,
  textareaClassName,
  footerStart,
  footerEnd,
}: AnswerComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const applyEdit = useCallback(
    (request: InsertRequest) => {
      if (disabled) return;

      const textarea = textareaRef.current;
      const start = textarea?.selectionStart ?? value.length;
      const end = textarea?.selectionEnd ?? value.length;
      const selectedText = value.slice(start, end);
      const inserted =
        request.kind === 'insert'
          ? request.text
          : `${request.before}${selectedText || request.placeholder}${request.after}`;
      const nextValue = `${value.slice(0, start)}${inserted}${value.slice(end)}`;

      onChange(nextValue);
      requestAnimationFrame(() => {
        textarea?.focus();
        if (!textarea) return;
        if (request.kind === 'wrap' && !selectedText) {
          const selectionStart = start + request.before.length;
          const selectionEnd = selectionStart + request.placeholder.length;
          textarea.setSelectionRange(selectionStart, selectionEnd);
          return;
        }
        const nextCursor = start + inserted.length;
        textarea.setSelectionRange(nextCursor, nextCursor);
      });
    },
    [disabled, onChange, value],
  );

  const wrapSelection = useCallback(
    (before: string, after: string, placeholderText: string) => {
      applyEdit({ kind: 'wrap', before, after, placeholder: placeholderText });
    },
    [applyEdit],
  );

  const insertTable = useCallback(() => {
    applyEdit({
      kind: 'insert',
      text:
        '\n| ' +
        label(locale, '项目', 'Item') +
        ' | ' +
        label(locale, '说明', 'Notes') +
        ' |\n| --- | --- |\n|  |  |\n|  |  |\n',
    });
  }, [applyEdit, locale]);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs transition-colors focus-within:border-sky-300 focus-within:ring-2 focus-within:ring-sky-100 dark:border-slate-700 dark:bg-slate-950/40 dark:focus-within:border-sky-700 dark:focus-within:ring-sky-950/60',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50/80 px-2 py-2 dark:border-slate-800 dark:bg-slate-900/60">
        <Select
          disabled={disabled}
          onValueChange={(fontFamily) =>
            wrapSelection(
              `<span style="font-family: ${fontFamily};">`,
              '</span>',
              label(locale, '文字', 'text'),
            )
          }
        >
          <SelectTrigger size="sm" className="h-8 w-[108px] bg-white dark:bg-slate-950">
            <Type className="size-3.5" />
            <SelectValue placeholder={label(locale, '字体', 'Font')} />
          </SelectTrigger>
          <SelectContent>
            {FONT_FAMILIES.map((font) => (
              <SelectItem key={font.value} value={font.value}>
                {font.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          disabled={disabled}
          onValueChange={(fontSize) =>
            wrapSelection(
              `<span style="font-size: ${fontSize};">`,
              '</span>',
              label(locale, '文字', 'text'),
            )
          }
        >
          <SelectTrigger size="sm" className="h-8 w-[92px] bg-white dark:bg-slate-950">
            <SelectValue placeholder={label(locale, '字号', 'Size')} />
          </SelectTrigger>
          <SelectContent>
            {FONT_SIZES.map((size) => (
              <SelectItem key={size} value={size}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" />

        <ToolButton
          title={label(locale, '加粗', 'Bold')}
          disabled={disabled}
          onClick={() => wrapSelection('**', '**', label(locale, '重点', 'important'))}
        >
          <Bold className="size-4" />
        </ToolButton>
        <ToolButton
          title={label(locale, '斜体', 'Italic')}
          disabled={disabled}
          onClick={() => wrapSelection('*', '*', label(locale, '强调', 'emphasis'))}
        >
          <Italic className="size-4" />
        </ToolButton>
        <ToolButton
          title={label(locale, '下划线', 'Underline')}
          disabled={disabled}
          onClick={() => wrapSelection('<u>', '</u>', label(locale, '文字', 'text'))}
        >
          <Underline className="size-4" />
        </ToolButton>
        <ToolButton
          title={label(locale, '标题', 'Heading')}
          disabled={disabled}
          onClick={() => wrapSelection('\n## ', '\n', label(locale, '小标题', 'Heading'))}
        >
          <Heading2 className="size-4" />
        </ToolButton>
        <ToolButton
          title={label(locale, '无序列表', 'Bullet list')}
          disabled={disabled}
          onClick={() => applyEdit({ kind: 'insert', text: '\n- ' })}
        >
          <List className="size-4" />
        </ToolButton>
        <ToolButton
          title={label(locale, '有序列表', 'Numbered list')}
          disabled={disabled}
          onClick={() => applyEdit({ kind: 'insert', text: '\n1. ' })}
        >
          <ListOrdered className="size-4" />
        </ToolButton>
        <ToolButton
          title={label(locale, '插入表格', 'Insert table')}
          disabled={disabled}
          onClick={insertTable}
        >
          <Table2 className="size-4" />
        </ToolButton>
        <ToolButton
          title={label(locale, '行内公式', 'Inline formula')}
          disabled={disabled}
          onClick={() => wrapSelection('$', '$', 'x')}
        >
          <Sigma className="size-4" />
        </ToolButton>
        <ToolButton
          title={label(locale, '上标', 'Superscript')}
          disabled={disabled}
          onClick={() => wrapSelection('<sup>', '</sup>', '2')}
        >
          <Superscript className="size-4" />
        </ToolButton>
        <ToolButton
          title={label(locale, '下标', 'Subscript')}
          disabled={disabled}
          onClick={() => wrapSelection('<sub>', '</sub>', 'n')}
        >
          <Subscript className="size-4" />
        </ToolButton>
        <ToolButton
          title={label(locale, '段落', 'Paragraph')}
          disabled={disabled}
          onClick={() => applyEdit({ kind: 'insert', text: '\n\n' })}
        >
          <Pilcrow className="size-4" />
        </ToolButton>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-100 bg-white px-2 py-2 dark:border-slate-800 dark:bg-slate-950/30">
        {COMMON_MATH_SYMBOLS.map((symbol) => (
          <button
            key={symbol}
            type="button"
            disabled={disabled}
            onClick={() => applyEdit({ kind: 'insert', text: symbol })}
            className="h-7 min-w-7 rounded-md border border-slate-200 bg-slate-50 px-2 text-sm font-medium text-slate-700 transition-colors hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 disabled:pointer-events-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-sky-700 dark:hover:bg-sky-950/60 dark:hover:text-sky-200"
          >
            {symbol}
          </button>
        ))}
      </div>

      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(
          'min-h-[160px] resize-y rounded-none border-0 bg-transparent px-3 py-3 shadow-none focus-visible:border-transparent focus-visible:ring-0',
          textareaClassName,
        )}
      />

      {(footerStart || footerEnd) && (
        <div className="flex min-h-10 items-center justify-between gap-3 border-t border-slate-100 px-3 py-2 dark:border-slate-800">
          <div className="min-w-0">{footerStart}</div>
          <div className="ml-auto shrink-0">{footerEnd}</div>
        </div>
      )}
    </div>
  );
}
