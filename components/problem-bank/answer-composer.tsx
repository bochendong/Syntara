'use client';

import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import {
  Bold,
  Braces,
  Italic,
  List,
  ListOrdered,
  SquareFunction,
  Table2,
  Underline,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  MATH_SYMBOL_GROUPS,
  TABLE_PICKER_ROWS,
  TABLE_PICKER_COLS,
  FORMULA_EXAMPLES,
  FORMULA_SCRIPT_SNIPPETS,
  DEFAULT_FORMULA_LATEX,
  TEXT_FORMAT_COMMANDS,
  MATH_SLOT_ORDER,
  label,
  mathTemplateLabel,
  mathSlotLabel,
  defaultActiveMathSlot,
  nestedLatexForTemplate,
  valueToEditorHtml,
  editorToValue,
  rangeBelongsToEditor,
  closestElementWithAttribute,
  moveRangeOutOfInlineMath,
  mathContextFromElement,
  mathContextFromRange,
  sameMathContext,
  preserveActiveMathSlot,
  mathSlotValuesFromElement,
  textFormatsFromRange,
  sameTextFormats,
  rangeAtEditorEnd,
  closestScriptElement,
  closestTextFormatElement,
  createTextFormatCaretElement,
  cleanupFormatCaretText,
  rangeIsAtEndOfElement,
  moveCaretAfterNodeWithText,
  exitScriptPlaceholderAfterInput,
  createTableElement,
  createMathLatexElement,
  createMathTemplateElement,
  updateMathElement,
  markSelectedMath,
  fragmentFromHtml,
  escapeHtml,
  renderEditableMathHtml,
} from './answer-composer.helpers';
import type {
  ActiveTextFormats,
  AnswerComposerController,
  AnswerComposerProps,
  AnswerToolPanel,
  InsertRequest,
  MathSlotRole,
  MathTemplateKind,
  SelectedMathContext,
} from './answer-composer.helpers';

function ToolButton({
  title,
  disabled,
  active = false,
  onClick,
  children,
}: {
  title: string;
  disabled?: boolean;
  active?: boolean;
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
          aria-pressed={active}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClick}
          className={cn(
            'text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white',
            active &&
              'bg-slate-200 text-slate-950 shadow-inner hover:bg-slate-200 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-800',
          )}
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
  showToolbar = true,
  showToolbarPanels = true,
  controller,
  footerStart,
  footerEnd,
}: AnswerComposerProps) {
  const internalController = useAnswerComposerController({ value, onChange, disabled });
  const activeController = controller ?? internalController;
  const editorRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editorToValue(editor) === value) return;

    editor.innerHTML = valueToEditorHtml(value);
  }, [value]);

  const handleInput = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    exitScriptPlaceholderAfterInput(editor);
    cleanupFormatCaretText(editor);
    activeController.captureSelection();
    onChange(editorToValue(editor));
  }, [activeController, onChange]);

  const moveOutOfScriptWithSpace = useCallback(() => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return false;

    const range = selection.getRangeAt(0);
    if (!range.collapsed || !rangeBelongsToEditor(range, editor)) return false;

    const scriptElement = closestScriptElement(range.endContainer, editor);
    if (!scriptElement || !rangeIsAtEndOfElement(range, scriptElement)) return false;

    const nextRange = moveCaretAfterNodeWithText(scriptElement, ' ');
    if (!nextRange) return false;

    activeController.captureSelection();
    onChange(editorToValue(editor));
    return true;
  }, [activeController, onChange]);

  const handleBeforeInput = useCallback(
    (event: FormEvent<HTMLDivElement>) => {
      const nativeEvent = event.nativeEvent as InputEvent;
      if (nativeEvent.inputType !== 'insertText' || nativeEvent.data !== ' ') return;
      if (!moveOutOfScriptWithSpace()) return;

      event.preventDefault();
    },
    [moveOutOfScriptWithSpace],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== ' ' && event.key !== 'Spacebar' && event.code !== 'Space') return;
      if (!moveOutOfScriptWithSpace()) return;

      event.preventDefault();
    },
    [moveOutOfScriptWithSpace],
  );

  const handleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const editor = editorRef.current;
      if (!editor) return;

      const mathElement = closestElementWithAttribute(
        event.target as Node,
        editor,
        'data-answer-math-template',
      );
      if (!mathElement) return;

      event.preventDefault();
      activeController.selectMathElement(mathElement);
    },
    [activeController],
  );

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      const nextTarget = event.relatedTarget as HTMLElement | null;
      if (
        activeController.shouldSkipEditorBlur() ||
        nextTarget?.closest('[data-answer-math-panel="true"]')
      ) {
        return;
      }

      activeController.captureSelection();
    },
    [activeController],
  );

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs transition-colors focus-within:border-sky-300 focus-within:ring-2 focus-within:ring-sky-100 dark:border-slate-700 dark:bg-slate-950/40 dark:focus-within:border-sky-700 dark:focus-within:ring-sky-950/60',
        className,
      )}
    >
      {showToolbar ? (
        <AnswerComposerToolbar
          controller={activeController}
          locale={locale}
          disabled={disabled}
          className="rounded-none border-0"
          showPanels={showToolbarPanels}
        />
      ) : null}

      <div
        ref={editorRef}
        id={activeController.editorId}
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        aria-disabled={disabled || undefined}
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onBeforeInput={handleBeforeInput}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onClick={handleClick}
        onBlur={handleBlur}
        onKeyUp={activeController.captureSelection}
        onMouseUp={activeController.captureSelection}
        className={cn(
          'min-h-[160px] overflow-y-auto whitespace-pre-wrap break-words px-3 py-3 text-sm leading-7 outline-none empty:before:pointer-events-none empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)] [&_em]:italic [&_strong]:font-semibold [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_td]:min-w-20 [&_td]:border [&_td]:border-slate-300 [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top [&_td]:outline-none [&_th]:min-w-20 [&_th]:border [&_th]:border-slate-300 [&_th]:px-2 [&_th]:py-1.5 [&_[data-answer-cell]]:min-h-6 [&_[data-answer-cell]]:outline-none [&_[data-answer-cell]:focus]:bg-sky-50 dark:[&_td]:border-slate-700 dark:[&_th]:border-slate-700 dark:[&_[data-answer-cell]:focus]:bg-sky-950/40',
          '[&_[data-answer-math-template]]:mx-1 [&_[data-answer-math-template]]:inline-flex [&_[data-answer-math-template]]:cursor-pointer [&_[data-answer-math-template]]:items-center [&_[data-answer-math-template]]:align-middle [&_[data-answer-math-template]]:rounded-md [&_[data-answer-math-template]]:border [&_[data-answer-math-template]]:border-transparent [&_[data-answer-math-template]]:px-1 [&_[data-answer-math-template]]:py-0.5 [&_[data-answer-math-template]]:outline-none [&_[data-answer-math-template]_.katex]:text-[1.08em] [&_[data-answer-math-selected=true]]:border-sky-300 [&_[data-answer-math-selected=true]]:bg-sky-50 dark:[&_[data-answer-math-selected=true]]:border-sky-700 dark:[&_[data-answer-math-selected=true]]:bg-sky-950/50',
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

export function useAnswerComposerController({
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}): AnswerComposerController {
  const editorId = useId();
  const lastRangeRef = useRef<Range | null>(null);
  const selectedMathRef = useRef<SelectedMathContext | null>(null);
  const skipEditorBlurRef = useRef(false);
  const [selectedMath, setSelectedMath] = useState<SelectedMathContext | null>(null);
  const [activeToolPanel, setActiveToolPanel] = useState<AnswerToolPanel | null>(null);
  const [activeTextFormats, setActiveTextFormats] = useState<ActiveTextFormats>({
    bold: false,
    italic: false,
    underline: false,
  });

  const commitSelectedMath = useCallback((nextSelectedMath: SelectedMathContext | null) => {
    selectedMathRef.current = nextSelectedMath;
    setSelectedMath((current) =>
      sameMathContext(current, nextSelectedMath) ? current : nextSelectedMath,
    );
  }, []);

  const captureSelection = useCallback(() => {
    if (typeof document === 'undefined') return;

    const editor = document.getElementById(editorId) as HTMLElement | null;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;

    const range = selection.getRangeAt(0);
    if (!rangeBelongsToEditor(range, editor)) return;
    lastRangeRef.current = range.cloneRange();
    const nextSelectedMath = preserveActiveMathSlot(
      mathContextFromRange(range, editor),
      selectedMathRef.current,
    );
    markSelectedMath(editor, nextSelectedMath?.id ?? null);
    commitSelectedMath(nextSelectedMath);
    const nextTextFormats = textFormatsFromRange(range, editor);
    setActiveTextFormats((current) =>
      sameTextFormats(current, nextTextFormats) ? current : nextTextFormats,
    );
  }, [commitSelectedMath, editorId]);

  const selectMathElement = useCallback(
    (element: HTMLElement, activeSlot: MathSlotRole | null = null) => {
      if (typeof document === 'undefined' || disabled) return;

      const editor = document.getElementById(editorId) as HTMLElement | null;
      if (!editor || !editor.contains(element)) return;

      const range = document.createRange();
      range.selectNode(element);

      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      const nextRange = document.createRange();
      nextRange.setStartAfter(element);
      nextRange.collapse(true);
      lastRangeRef.current = nextRange.cloneRange();

      const template = element.getAttribute('data-answer-math-template') as MathTemplateKind | null;
      const nextSelectedMath = mathContextFromElement(
        element,
        activeSlot ?? (template ? defaultActiveMathSlot(template) : null),
      );
      markSelectedMath(editor, nextSelectedMath?.id ?? null);
      editor.focus();
      commitSelectedMath(nextSelectedMath);
      setActiveTextFormats(textFormatsFromRange(range, editor));
    },
    [commitSelectedMath, disabled, editorId],
  );

  const focusMathSlot = useCallback(
    (slot: MathSlotRole) => {
      const currentSelectedMath = selectedMathRef.current ?? selectedMath;
      if (typeof document === 'undefined' || disabled || !currentSelectedMath) return;

      const editor = document.getElementById(editorId) as HTMLElement | null;
      if (!editor) return;

      const mathElement = editor.querySelector(
        `[data-answer-math-id="${currentSelectedMath.id}"]`,
      ) as HTMLElement | null;
      if (!mathElement) return;

      markSelectedMath(editor, currentSelectedMath.id);
      const nextSelectedMath = mathContextFromElement(mathElement, slot);
      commitSelectedMath(nextSelectedMath);
    },
    [commitSelectedMath, disabled, editorId, selectedMath],
  );

  const updateMathSlot = useCallback(
    (slot: MathSlotRole, value: string) => {
      const currentSelectedMath = selectedMathRef.current ?? selectedMath;
      if (typeof document === 'undefined' || disabled || !currentSelectedMath) return;

      const editor = document.getElementById(editorId) as HTMLElement | null;
      if (!editor) return;

      const mathElement = editor.querySelector(
        `[data-answer-math-id="${currentSelectedMath.id}"]`,
      ) as HTMLElement | null;
      if (!mathElement) return;

      const values = {
        ...mathSlotValuesFromElement(mathElement, currentSelectedMath.template),
        [slot]: value,
      };

      updateMathElement(mathElement, currentSelectedMath.template, values);
      markSelectedMath(editor, currentSelectedMath.id);

      const nextSelectedMath = mathContextFromElement(mathElement, slot);
      commitSelectedMath(nextSelectedMath);
      onChange(editorToValue(editor));
    },
    [commitSelectedMath, disabled, editorId, onChange, selectedMath],
  );

  const beginMathPanelInteraction = useCallback(() => {
    skipEditorBlurRef.current = true;
    window.setTimeout(() => {
      skipEditorBlurRef.current = false;
    }, 200);
  }, []);

  const shouldSkipEditorBlur = useCallback(() => skipEditorBlurRef.current, []);

  const applyEdit = useCallback(
    (request: InsertRequest) => {
      if (disabled) return;

      const editor =
        typeof document === 'undefined'
          ? null
          : (document.getElementById(editorId) as HTMLElement | null);
      if (!editor) return;

      editor.focus();
      const selection = window.getSelection();
      const activeSelectedMath = selectedMathRef.current ?? selectedMath;

      if (
        request.kind === 'mathTemplate' &&
        activeSelectedMath?.activeSlot &&
        activeSelectedMath.activeSlot !== 'variable'
      ) {
        const mathElement = editor.querySelector(
          `[data-answer-math-id="${activeSelectedMath.id}"]`,
        ) as HTMLElement | null;
        if (mathElement) {
          const values = mathSlotValuesFromElement(mathElement, activeSelectedMath.template);
          const inheritedBody = activeSelectedMath.activeSlot === 'body' ? values.body : '';
          const nextValues = {
            ...values,
            [activeSelectedMath.activeSlot]: nestedLatexForTemplate(
              request.template,
              inheritedBody,
            ),
          };

          updateMathElement(mathElement, activeSelectedMath.template, nextValues);
          markSelectedMath(editor, activeSelectedMath.id);

          const nextSelectedMath = mathContextFromElement(
            mathElement,
            activeSelectedMath.activeSlot,
          );
          commitSelectedMath(nextSelectedMath);
          onChange(editorToValue(editor));
          return;
        }
      }

      const currentRange =
        selection?.rangeCount && rangeBelongsToEditor(selection.getRangeAt(0), editor)
          ? selection.getRangeAt(0).cloneRange()
          : lastRangeRef.current && rangeBelongsToEditor(lastRangeRef.current, editor)
            ? lastRangeRef.current.cloneRange()
            : rangeAtEditorEnd(editor);
      const shouldMoveRangeOut =
        request.kind === 'table' ||
        request.kind === 'mathTemplate' ||
        request.kind === 'mathLatex' ||
        (request.kind !== 'format' && request.placement === 'block');
      const range = shouldMoveRangeOut
        ? moveRangeOutOfInlineMath(editor, currentRange)
        : currentRange;
      const selectedText = range.toString();

      if (request.kind === 'mathLatex' && !request.latex.trim()) return;

      if (request.kind === 'format') {
        if (range.collapsed) {
          const activeFormatElement = closestTextFormatElement(
            range.endContainer,
            editor,
            request.format,
          );
          const nextRange = document.createRange();

          if (activeFormatElement) {
            nextRange.setStartAfter(activeFormatElement);
            nextRange.collapse(true);
          } else {
            const { element, textNode } = createTextFormatCaretElement(request.format);
            range.insertNode(element);
            nextRange.setStart(textNode, textNode.length);
            nextRange.collapse(true);
          }

          selection?.removeAllRanges();
          selection?.addRange(nextRange);
          lastRangeRef.current = nextRange.cloneRange();
          commitSelectedMath(mathContextFromRange(nextRange, editor));
          setActiveTextFormats(textFormatsFromRange(nextRange, editor));
          onChange(editorToValue(editor));
          requestAnimationFrame(() => {
            editor.focus();
          });
          return;
        }

        selection?.removeAllRanges();
        selection?.addRange(range);
        document.execCommand('styleWithCSS', false, 'false');
        document.execCommand(TEXT_FORMAT_COMMANDS[request.format]);

        const nextRange = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : range;
        lastRangeRef.current = nextRange.cloneRange();
        commitSelectedMath(mathContextFromRange(nextRange, editor));
        setActiveTextFormats(textFormatsFromRange(nextRange, editor));
        onChange(editorToValue(editor));
        requestAnimationFrame(() => {
          editor.focus();
        });
        return;
      }

      range.deleteContents();

      const setCollapsedRangeAfter = (node: Node) => {
        const nextRange = document.createRange();
        nextRange.setStartAfter(node);
        nextRange.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(nextRange);
        lastRangeRef.current = nextRange.cloneRange();
        markSelectedMath(editor, null);
        commitSelectedMath(mathContextFromRange(nextRange, editor));
        setActiveTextFormats(textFormatsFromRange(nextRange, editor));
      };

      if (request.kind === 'table') {
        const before = document.createElement('br');
        const table = createTableElement(request.rows, request.cols);
        const after = document.createElement('br');
        const fragment = document.createDocumentFragment();
        fragment.append(before, table, after);
        range.insertNode(fragment);

        const firstCell = table.querySelector('[data-answer-cell]');
        if (firstCell) {
          const cellRange = document.createRange();
          cellRange.selectNodeContents(firstCell);
          cellRange.collapse(true);
          selection?.removeAllRanges();
          selection?.addRange(cellRange);
          lastRangeRef.current = cellRange.cloneRange();
          commitSelectedMath(mathContextFromRange(cellRange, editor));
          setActiveTextFormats(textFormatsFromRange(cellRange, editor));
        } else {
          setCollapsedRangeAfter(after);
        }
      } else if (request.kind === 'mathTemplate') {
        const { element } = createMathTemplateElement(request.template, selectedText);
        const spacer = document.createTextNode(' ');
        const fragment = document.createDocumentFragment();
        fragment.append(element, spacer);
        range.insertNode(fragment);

        const nextRange = document.createRange();
        nextRange.setStartAfter(element);
        nextRange.collapse(true);
        const selectedRange = document.createRange();
        selectedRange.selectNode(element);
        selection?.removeAllRanges();
        selection?.addRange(selectedRange);
        lastRangeRef.current = nextRange.cloneRange();
        markSelectedMath(editor, element.getAttribute('data-answer-math-id'));
        commitSelectedMath(
          mathContextFromElement(element, defaultActiveMathSlot(request.template)),
        );
        setActiveTextFormats(textFormatsFromRange(nextRange, editor));
      } else if (request.kind === 'mathLatex') {
        const element = createMathLatexElement(request.latex);
        const spacer = document.createTextNode(' ');
        const fragment = document.createDocumentFragment();
        fragment.append(element, spacer);
        range.insertNode(fragment);
        setCollapsedRangeAfter(spacer);
      } else if (request.kind === 'insert') {
        const inserted =
          request.mode === 'html'
            ? fragmentFromHtml(request.text)
            : document.createTextNode(request.text);
        const lastNode = inserted instanceof DocumentFragment ? inserted.lastChild : inserted;
        range.insertNode(inserted);
        if (lastNode) setCollapsedRangeAfter(lastNode);
      } else if (request.mode === 'html') {
        const marker = `answer-selection-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const fragment = fragmentFromHtml(
          `${request.before}<span data-answer-selection="${marker}">${escapeHtml(
            selectedText || request.placeholder,
          )}</span>${request.after}`,
        );
        range.insertNode(fragment);
        const markerNode = editor.querySelector(`[data-answer-selection="${marker}"]`);
        if (markerNode) {
          markerNode.removeAttribute('data-answer-selection');
          if (request.autoExit === 'script' && !selectedText) {
            markerNode.setAttribute('data-answer-script-placeholder', 'true');
          }
          const nextRange = document.createRange();
          if (selectedText) {
            nextRange.setStartAfter(markerNode);
            nextRange.collapse(true);
          } else {
            nextRange.selectNodeContents(markerNode);
          }
          selection?.removeAllRanges();
          selection?.addRange(nextRange);
          lastRangeRef.current = nextRange.cloneRange();
          commitSelectedMath(mathContextFromRange(nextRange, editor));
          setActiveTextFormats(textFormatsFromRange(nextRange, editor));
        }
      } else {
        const insertedText = `${request.before}${selectedText || request.placeholder}${request.after}`;
        const textNode = document.createTextNode(insertedText);
        range.insertNode(textNode);
        const nextRange = document.createRange();
        if (selectedText) {
          nextRange.setStartAfter(textNode);
        } else {
          const selectionStart = request.before.length;
          const selectionEnd = selectionStart + request.placeholder.length;
          nextRange.setStart(textNode, selectionStart);
          nextRange.setEnd(textNode, selectionEnd);
        }
        selection?.removeAllRanges();
        selection?.addRange(nextRange);
        lastRangeRef.current = nextRange.cloneRange();
        commitSelectedMath(mathContextFromRange(nextRange, editor));
        setActiveTextFormats(textFormatsFromRange(nextRange, editor));
      }

      onChange(editorToValue(editor));
      requestAnimationFrame(() => {
        editor.focus();
      });
    },
    [commitSelectedMath, disabled, editorId, onChange, selectedMath],
  );

  const toggleToolPanel = useCallback((panel: AnswerToolPanel) => {
    setActiveToolPanel((current) => (current === panel ? null : panel));
  }, []);

  const closeToolPanel = useCallback(() => {
    setActiveToolPanel(null);
  }, []);

  return {
    editorId,
    selectedMath,
    activeToolPanel,
    activeTextFormats,
    applyEdit,
    captureSelection,
    focusMathSlot,
    selectMathElement,
    updateMathSlot,
    beginMathPanelInteraction,
    shouldSkipEditorBlur,
    toggleToolPanel,
    closeToolPanel,
  };
}

export function AnswerComposerToolbar({
  controller,
  locale,
  disabled,
  className,
  fillPanels = false,
  showControls = true,
  showPanels = true,
}: {
  controller: AnswerComposerController;
  locale: 'zh-CN' | 'en-US';
  disabled?: boolean;
  className?: string;
  fillPanels?: boolean;
  showControls?: boolean;
  showPanels?: boolean;
}) {
  const [hoveredTableSize, setHoveredTableSize] = useState({ rows: 3, cols: 3 });
  const [formulaLatex, setFormulaLatex] = useState(DEFAULT_FORMULA_LATEX);
  const formulaInputRef = useRef<HTMLTextAreaElement | null>(null);
  const formulaInputId = `${controller.editorId}-formula-latex-input`;
  const tablePickerOpen = showPanels && controller.activeToolPanel === 'table';
  const formulaPickerOpen =
    showPanels &&
    (controller.activeToolPanel === 'formula' ||
      (!showControls && controller.activeToolPanel === null));
  const symbolPickerOpen = showPanels && controller.activeToolPanel === 'symbols';
  const activeMathSlotLabel = controller.selectedMath?.activeSlot
    ? mathSlotLabel(controller.selectedMath.activeSlot, locale)
    : label(locale, '未选择槽位', 'No slot selected');

  const insertTable = useCallback(
    (rows: number, cols: number) => {
      controller.applyEdit({ kind: 'table', rows, cols });
      controller.closeToolPanel();
    },
    [controller],
  );

  const insertFormulaLatex = useCallback(() => {
    const latex = formulaLatex.trim();
    if (!latex) return;

    controller.applyEdit({ kind: 'mathLatex', latex });
    if (showControls) {
      controller.closeToolPanel();
    }
  }, [controller, formulaLatex, showControls]);

  const insertFormulaSnippet = useCallback(
    (snippet: string) => {
      const input = formulaInputRef.current;
      const start = input?.selectionStart ?? formulaLatex.length;
      const end = input?.selectionEnd ?? formulaLatex.length;
      const nextLatex = `${formulaLatex.slice(0, start)}${snippet}${formulaLatex.slice(end)}`;
      const nextCaret = start + snippet.length;

      setFormulaLatex(nextLatex);
      requestAnimationFrame(() => {
        input?.focus();
        input?.setSelectionRange(nextCaret, nextCaret);
      });
    },
    [formulaLatex],
  );

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700',
        fillPanels && 'flex h-full min-h-0 flex-col',
        className,
      )}
    >
      {showControls ? (
        <div className="flex shrink-0 flex-nowrap items-center gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50/80 px-2 py-2 dark:border-slate-800 dark:bg-slate-900/60">
          <ToolButton
            title={label(locale, '加粗', 'Bold')}
            disabled={disabled}
            active={controller.activeTextFormats.bold}
            onClick={() => controller.applyEdit({ kind: 'format', format: 'bold' })}
          >
            <Bold className="size-4" />
          </ToolButton>
          <ToolButton
            title={label(locale, '斜体', 'Italic')}
            disabled={disabled}
            active={controller.activeTextFormats.italic}
            onClick={() => controller.applyEdit({ kind: 'format', format: 'italic' })}
          >
            <Italic className="size-4" />
          </ToolButton>
          <ToolButton
            title={label(locale, '下划线', 'Underline')}
            disabled={disabled}
            active={controller.activeTextFormats.underline}
            onClick={() => controller.applyEdit({ kind: 'format', format: 'underline' })}
          >
            <Underline className="size-4" />
          </ToolButton>
          <ToolButton
            title={label(locale, '无序列表', 'Bullet list')}
            disabled={disabled}
            onClick={() =>
              controller.applyEdit({ kind: 'insert', text: '\n- ', placement: 'block' })
            }
          >
            <List className="size-4" />
          </ToolButton>
          <ToolButton
            title={label(locale, '有序列表', 'Numbered list')}
            disabled={disabled}
            onClick={() =>
              controller.applyEdit({ kind: 'insert', text: '\n1. ', placement: 'block' })
            }
          >
            <ListOrdered className="size-4" />
          </ToolButton>
          <ToolButton
            title={label(locale, '插入表格', 'Insert table')}
            disabled={disabled}
            onClick={() => controller.toggleToolPanel('table')}
          >
            <Table2 className="size-4" />
          </ToolButton>
          <ToolButton
            title={label(locale, '公式输入', 'Formula input')}
            disabled={disabled}
            onClick={() => controller.toggleToolPanel('formula')}
          >
            <SquareFunction className="size-4" />
          </ToolButton>
          <ToolButton
            title={label(locale, '符号表', 'Symbol palette')}
            disabled={disabled}
            onClick={() => controller.toggleToolPanel('symbols')}
          >
            <Braces className="size-4" />
          </ToolButton>
        </div>
      ) : null}

      {showPanels && showControls && controller.selectedMath ? (
        <div
          data-answer-math-panel="true"
          onMouseDownCapture={controller.beginMathPanelInteraction}
          className="shrink-0 border-b border-slate-100 bg-white px-2 py-2 dark:border-slate-800 dark:bg-slate-950/40"
        >
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {label(locale, '已选公式', 'Selected formula')}
            </span>
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800 dark:bg-sky-900/50 dark:text-sky-200">
              {mathTemplateLabel(controller.selectedMath.template, locale)}
            </span>
          </div>
          <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
            <span className="text-amber-700 dark:text-amber-300">
              {label(locale, '当前正在编辑：', 'Editing: ')}
            </span>
            <span className="font-semibold">{activeMathSlotLabel}</span>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {MATH_SLOT_ORDER.filter((slot) => controller.selectedMath?.slots.includes(slot)).map(
              (slot) => {
                const slotInputId = `${controller.editorId}-${slot}-math-slot`;

                return (
                  <label
                    key={slot}
                    htmlFor={slotInputId}
                    onClick={(event) => {
                      event.stopPropagation();
                      controller.focusMathSlot(slot);
                      requestAnimationFrame(() => {
                        document.getElementById(slotInputId)?.focus();
                      });
                    }}
                    className={cn(
                      'cursor-text rounded-lg border px-2.5 py-2 transition-colors',
                      controller.selectedMath?.activeSlot === slot
                        ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/50'
                        : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900',
                    )}
                  >
                    <span className="mb-1 flex items-center justify-between gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      <span>{mathSlotLabel(slot, locale)}</span>
                      {controller.selectedMath?.activeSlot === slot ? (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 dark:bg-amber-900 dark:text-amber-100">
                          {label(locale, '当前', 'Active')}
                        </span>
                      ) : null}
                    </span>
                    <textarea
                      id={slotInputId}
                      aria-label={mathSlotLabel(slot, locale)}
                      disabled={disabled}
                      value={controller.selectedMath?.values[slot] ?? ''}
                      onFocus={() => controller.focusMathSlot(slot)}
                      onChange={(event) => controller.updateMathSlot(slot, event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                      spellCheck={false}
                      autoCapitalize="off"
                      autoComplete="off"
                      rows={slot === 'body' ? 2 : 1}
                      className="min-h-10 w-full resize-none rounded-md border border-slate-200 bg-white px-2 py-2 font-mono text-sm leading-5 text-slate-900 outline-none transition-colors focus:border-amber-400 focus:ring-2 focus:ring-amber-100 disabled:pointer-events-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-amber-600 dark:focus:ring-amber-950/60"
                    />
                  </label>
                );
              },
            )}
          </div>
          <div className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-slate-900">
            <div className="mb-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              LaTeX
            </div>
            <code className="block break-all font-mono text-[11px] leading-5 text-slate-700 dark:text-slate-200">
              {controller.selectedMath.latex}
            </code>
          </div>
          <p className="mt-2 px-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
            {locale === 'zh-CN'
              ? '直接改槽位文字；要嵌套公式，先点目标槽位，再点上方“公式输入”。'
              : 'Edit a slot directly. To nest a formula, choose a target slot, then open Formula input.'}
          </p>
        </div>
      ) : null}

      {tablePickerOpen ? (
        <div className="shrink-0 border-b border-slate-100 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-950/40">
          <div className="mb-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{label(locale, '选择表格大小', 'Choose table size')}</span>
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {hoveredTableSize.rows} × {hoveredTableSize.cols}
            </span>
          </div>
          <div className="grid w-max grid-cols-6 gap-1">
            {Array.from({ length: TABLE_PICKER_ROWS }).flatMap((_, rowIndex) =>
              Array.from({ length: TABLE_PICKER_COLS }).map((__, colIndex) => {
                const rows = rowIndex + 1;
                const cols = colIndex + 1;
                const selected = rows <= hoveredTableSize.rows && cols <= hoveredTableSize.cols;
                return (
                  <button
                    key={`${rows}-${cols}`}
                    type="button"
                    disabled={disabled}
                    aria-label={`${rows} × ${cols}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setHoveredTableSize({ rows, cols })}
                    onFocus={() => setHoveredTableSize({ rows, cols })}
                    onClick={() => insertTable(rows, cols)}
                    className={cn(
                      'size-5 rounded-[3px] border transition-colors disabled:pointer-events-none disabled:opacity-50',
                      selected
                        ? 'border-sky-400 bg-sky-100 dark:border-sky-500 dark:bg-sky-950/70'
                        : 'border-slate-200 bg-slate-50 hover:border-sky-300 dark:border-slate-700 dark:bg-slate-900',
                    )}
                  />
                );
              }),
            )}
          </div>
        </div>
      ) : null}

      {formulaPickerOpen ? (
        <div
          data-answer-math-panel="true"
          onMouseDownCapture={controller.beginMathPanelInteraction}
          className={cn(
            'space-y-3 border-b border-slate-100 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-950/40',
            fillPanels && 'min-h-0 flex-1 overflow-y-auto',
          )}
        >
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {label(locale, '公式输入', 'Formula input')}
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {locale === 'zh-CN'
                ? '直接输入 LaTeX，不需要写前后的 $。点“插入公式”后会插入到答案当前光标位置。'
                : 'Type LaTeX without surrounding $. Insert places it at the current answer cursor.'}
            </p>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor={formulaInputId}
              className="text-xs font-medium text-slate-600 dark:text-slate-300"
            >
              LaTeX
            </label>
            <textarea
              id={formulaInputId}
              ref={formulaInputRef}
              aria-label="LaTeX"
              value={formulaLatex}
              disabled={disabled}
              onChange={(event) => setFormulaLatex(event.target.value)}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              rows={4}
              className="w-full resize-none rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-mono text-xs leading-5 text-slate-900 outline-none transition-colors focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:pointer-events-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-sky-700 dark:focus:ring-sky-950/60"
            />
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-900/70">
            <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              {label(locale, '预览', 'Preview')}
            </div>
            <div
              className="min-h-10 break-words text-sm text-slate-900 dark:text-slate-100 [&_.katex]:text-[1.08em]"
              dangerouslySetInnerHTML={{
                __html: formulaLatex.trim()
                  ? renderEditableMathHtml(formulaLatex)
                  : `<span class="text-slate-400">${label(locale, '输入公式后显示预览', 'Preview appears as you type')}</span>`,
              }}
            />
          </div>

          <Button
            type="button"
            disabled={disabled || !formulaLatex.trim()}
            onClick={insertFormulaLatex}
            className="w-full"
          >
            {label(locale, '插入公式', 'Insert formula')}
          </Button>

          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {label(locale, '上下标', 'Superscript & subscript')}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FORMULA_SCRIPT_SNIPPETS.map((snippet) => (
                <button
                  key={snippet}
                  type="button"
                  disabled={disabled}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insertFormulaSnippet(snippet)}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-700 transition-colors hover:border-sky-300 hover:bg-sky-50 disabled:pointer-events-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-sky-700 dark:hover:bg-sky-950/60"
                >
                  {snippet}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {label(locale, '常用写法', 'Common examples')}
            </div>
            <div className="grid gap-1.5">
              {FORMULA_EXAMPLES.map((example) => (
                <button
                  key={example.latex}
                  type="button"
                  disabled={disabled}
                  onClick={() => setFormulaLatex(example.latex)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-left transition-colors hover:border-sky-300 hover:bg-sky-50 disabled:pointer-events-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-sky-700 dark:hover:bg-sky-950/60"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="shrink-0 text-xs font-medium text-slate-600 dark:text-slate-300">
                      {locale === 'zh-CN' ? example.zh : example.en}
                    </span>
                    <span
                      className="min-w-0 flex-1 text-right text-sm text-slate-900 dark:text-slate-100 [&_.katex]:text-[1.05em]"
                      aria-hidden="true"
                      dangerouslySetInnerHTML={{
                        __html: renderEditableMathHtml(example.latex),
                      }}
                    />
                  </span>
                  <code className="mt-1.5 block whitespace-normal break-all rounded-md bg-white px-2 py-1 font-mono text-[11px] leading-4 text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                    {example.latex}
                  </code>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {symbolPickerOpen ? (
        <div
          className={cn(
            'space-y-3 overflow-y-auto border-b border-slate-100 bg-white px-2 py-2 dark:border-slate-800 dark:bg-slate-950/30',
            fillPanels ? 'min-h-0 flex-1' : 'max-h-[360px]',
          )}
        >
          {MATH_SYMBOL_GROUPS.map((group) => (
            <div key={group.zh} className="space-y-1">
              <p className="px-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {locale === 'zh-CN' ? group.zh : group.en}
              </p>
              <div className="flex flex-wrap gap-1">
                {group.symbols.map((symbol) => (
                  <button
                    key={`${group.zh}-${symbol}`}
                    type="button"
                    disabled={disabled}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => controller.applyEdit({ kind: 'insert', text: symbol })}
                    className="h-7 min-w-7 rounded-md border border-slate-200 bg-slate-50 px-2 text-sm font-medium text-slate-700 transition-colors hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 disabled:pointer-events-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-sky-700 dark:hover:bg-sky-950/60 dark:hover:text-sky-200"
                  >
                    {symbol}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {showPanels &&
      !showControls &&
      !controller.selectedMath &&
      !tablePickerOpen &&
      !formulaPickerOpen &&
      !symbolPickerOpen ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-8 text-center text-xs leading-5 text-slate-500 dark:text-slate-400">
          {locale === 'zh-CN'
            ? '从输入栏上方选择符号表、公式输入或表格。'
            : 'Choose symbols, formula input, or tables from the toolbar above the answer box.'}
        </div>
      ) : null}
    </div>
  );
}
