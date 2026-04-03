'use client';

import katex from 'katex';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ProsemirrorEditor } from '@/components/slide-renderer/components/element/ProsemirrorEditor';
import { useSceneSelector } from '@/lib/contexts/scene-context';
import { useCanvasOperations } from '@/lib/hooks/use-canvas-operations';
import { useHistorySnapshot } from '@/lib/hooks/use-history-snapshot';
import { useCanvasStore } from '@/lib/store/canvas';
import type { SlideRepairChatMessage } from '@/lib/types/slide-repair';
import type { SlideContent } from '@/lib/types/stage';
import type {
  PPTElement,
  PPTChartElement,
  PPTImageElement,
  PPTLineElement,
  PPTShapeElement,
  PPTTableElement,
  PPTTextElement,
  PPTVideoElement,
  PPTAudioElement,
  PPTLatexElement,
} from '@/lib/types/slides';
import { renderHtmlWithLatex } from '@/lib/render-html-with-latex';
import { cn } from '@/lib/utils';
import { nanoid } from 'nanoid';
import { ArrowUp, ImagePlus, Loader2, PlusSquare, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

function sectionTitle(title: string, description?: string) {
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      {description ? (
        <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
      ) : null}
    </div>
  );
}

function fieldLabel(label: string) {
  return <Label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</Label>;
}

function getElementTypeLabel(type: PPTElement['type']): string {
  switch (type) {
    case 'text':
      return '文本';
    case 'shape':
      return '形状';
    case 'image':
      return '图片';
    case 'line':
      return '线条';
    case 'table':
      return '表格';
    case 'latex':
      return '公式';
    case 'video':
      return '视频';
    case 'audio':
      return '音频';
    case 'chart':
      return '图表';
    default:
      return type;
  }
}

function getElementDisplayName(element: PPTElement, index: number): string {
  const explicitName = element.name?.trim();
  if (explicitName) return explicitName;
  return `${getElementTypeLabel(element.type)} ${index + 1}`;
}

const COMMON_COLOR_SWATCHES = [
  '#0f172a',
  '#334155',
  '#64748b',
  '#ffffff',
  '#eff6ff',
  '#dbeafe',
  '#bfdbfe',
  '#93c5fd',
  '#d1fae5',
  '#86efac',
  '#fef3c7',
  '#fdba74',
  '#fecaca',
  '#f9a8d4',
  '#ddd6fe',
  '#c4b5fd',
] as const;

const COMMON_REWRITE_PROMPTS = [
  '这一页太空了，重写成更完整的证明页。',
  '保留主题，但换一种更清楚的讲法。',
  '把这一页重写得更像老师真正会上课展示的版本。',
] as const;

const FONT_FAMILY_OPTIONS = [
  'Microsoft YaHei',
  'PingFang SC',
  'Helvetica Neue',
  'Arial',
  'Georgia',
  'Times New Roman',
  'Menlo, Monaco, Consolas, monospace',
] as const;

const DEFAULT_TEXT_FONT = 'Microsoft YaHei';
const DEFAULT_TEXT_FONT_SIZE = 24;
const DEFAULT_TEXT_BOX_WIDTH = 360;
const DEFAULT_TEXT_BOX_HEIGHT = 120;
const DEFAULT_IMAGE_BOX_WIDTH = 360;
const DEFAULT_IMAGE_BOX_HEIGHT = 220;

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function plainTextToParagraphHtml(text: string): string {
  const lines = text.split('\n');
  if (lines.length === 0) return '<p>&nbsp;</p>';
  return lines.map((line) => `<p>${line ? escapeHtml(line) : '&nbsp;'}</p>`).join('');
}

function applyTypographyToHtml(
  html: string,
  typography: {
    fontFamily?: string;
    fontSizePx?: number;
  },
): string {
  if (typeof document === 'undefined') return html;

  const root = document.createElement('div');
  root.innerHTML = html || '<p></p>';

  const targets = root.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote, pre');
  if (targets.length === 0) {
    const paragraph = document.createElement('p');
    paragraph.innerHTML = html || '&nbsp;';
    root.innerHTML = '';
    root.appendChild(paragraph);
  }

  root.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote, pre').forEach((node) => {
    const element = node as HTMLElement;
    if (typography.fontFamily) {
      element.style.fontFamily = typography.fontFamily;
    }
    if (typography.fontSizePx) {
      element.style.fontSize = `${typography.fontSizePx}px`;
    }
  });

  return root.innerHTML;
}

function extractFontSizeFromHtml(html: string, fallback = DEFAULT_TEXT_FONT_SIZE): number {
  if (typeof document === 'undefined') return fallback;

  const root = document.createElement('div');
  root.innerHTML = html;
  const firstTextBlock = root.querySelector('p, li, h1, h2, h3, h4, h5, h6, blockquote, pre');
  const rawSize = firstTextBlock instanceof HTMLElement ? firstTextBlock.style.fontSize : '';
  const parsed = Number.parseInt(rawSize || '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeMeasuredHtml(root: HTMLElement, paragraphSpacePx: number) {
  const paragraphs = Array.from(root.querySelectorAll('p'));
  paragraphs.forEach((paragraph, index) => {
    const paragraphNode = paragraph as HTMLElement;
    paragraphNode.style.margin = '0';
    paragraphNode.style.marginBottom = index < paragraphs.length - 1 ? `${paragraphSpacePx}px` : '0';
  });

  root.querySelectorAll('ol, ul').forEach((listNode) => {
    const list = listNode as HTMLElement;
    list.style.margin = '0';
  });
}

function measureTextElementContentBox(element: PPTTextElement) {
  if (typeof document === 'undefined') {
    return {
      width: element.width,
      height: element.height,
    };
  }

  const measurementRoot = document.createElement('div');
  measurementRoot.style.position = 'absolute';
  measurementRoot.style.left = '-100000px';
  measurementRoot.style.top = '0';
  measurementRoot.style.visibility = 'hidden';
  measurementRoot.style.pointerEvents = 'none';
  measurementRoot.style.boxSizing = 'border-box';
  measurementRoot.style.padding = '10px';
  measurementRoot.style.width = element.vertical ? 'auto' : `${element.width}px`;
  measurementRoot.style.height = element.vertical ? `${element.height}px` : 'auto';
  measurementRoot.style.lineHeight = `${element.lineHeight ?? 1.5}`;
  measurementRoot.style.letterSpacing = `${element.wordSpace || 0}px`;
  measurementRoot.style.color = element.defaultColor;
  measurementRoot.style.fontFamily = element.defaultFontName;
  measurementRoot.style.writingMode = element.vertical ? 'vertical-rl' : 'horizontal-tb';
  measurementRoot.style.wordBreak = 'break-word';

  const renderedRoot = document.createElement('div');
  renderedRoot.innerHTML = renderHtmlWithLatex(element.content || '<p>&nbsp;</p>');
  normalizeMeasuredHtml(renderedRoot, element.paragraphSpace ?? 5);

  measurementRoot.appendChild(renderedRoot);
  document.body.appendChild(measurementRoot);

  const measured = {
    width: Math.max(40, Math.ceil(measurementRoot.scrollWidth)),
    height: Math.max(40, Math.ceil(measurementRoot.scrollHeight)),
  };

  document.body.removeChild(measurementRoot);
  return measured;
}

function buildAutoSizedTextProps(
  element: PPTTextElement,
  overrides: Partial<PPTTextElement>,
): Partial<PPTTextElement> {
  const nextElement = { ...element, ...overrides };
  const measured = measureTextElementContentBox(nextElement);

  return nextElement.vertical
    ? { ...overrides, width: measured.width }
    : { ...overrides, height: measured.height };
}

function renderLatexElementHtml(latex: string) {
  try {
    return katex.renderToString(latex, {
      throwOnError: false,
      displayMode: true,
      output: 'html',
    });
  } catch {
    return undefined;
  }
}

function fitSizeWithinBox(
  naturalWidth: number,
  naturalHeight: number,
  maxWidth: number,
  maxHeight: number,
) {
  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return { width: maxWidth, height: maxHeight };
  }

  const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight, 1);
  return {
    width: Math.max(120, Math.round(naturalWidth * scale)),
    height: Math.max(90, Math.round(naturalHeight * scale)),
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('读取图片失败'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

function measureImageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth || DEFAULT_IMAGE_BOX_WIDTH,
        height: image.naturalHeight || DEFAULT_IMAGE_BOX_HEIGHT,
      });
    };
    image.onerror = () => reject(new Error('无法加载图片，请检查地址或文件内容'));
    image.src = src;
  });
}

function colorInput(value: string | undefined, onChange: (next: string) => void) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value && /^#([0-9a-f]{3}){1,2}$/i.test(value) ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded-md border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-white/[0.04]"
        />
        <Input value={value || ''} onChange={(e) => onChange(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2">
        {COMMON_COLOR_SWATCHES.map((color) => {
          const isActive = value?.toLowerCase() === color.toLowerCase();
          return (
            <button
              key={color}
              type="button"
              onClick={() => onChange(color)}
              className={cn(
                'h-6 w-6 rounded-full border transition-all',
                isActive
                  ? 'scale-110 border-slate-900 shadow-[0_0_0_2px_rgba(15,23,42,0.12)] dark:border-white'
                  : 'border-slate-200 hover:scale-105 dark:border-white/10',
              )}
              style={{ backgroundColor: color }}
              title={color}
              aria-label={`使用颜色 ${color}`}
            />
          );
        })}
      </div>
    </div>
  );
}

type ManualInspectorTab = 'add' | 'position' | 'text';

const MANUAL_INSPECTOR_TABS: { id: ManualInspectorTab; label: string }[] = [
  { id: 'add', label: '添加组件' },
  { id: 'position', label: '调整位置' },
  { id: 'text', label: '调整文本' },
];

interface SlideElementInspectorProps {
  readonly className?: string;
  /** 由顶栏「AI 重写 / 编辑当前页」切换，侧栏内不再使用 Tab 切换 */
  readonly sidebarPanel: 'ai' | 'manual';
  readonly repairDraft: string;
  readonly onRepairDraftChange: (value: string) => void;
  readonly repairConversation: SlideRepairChatMessage[];
  readonly onSendRepairMessage: () => void;
  readonly repairPending: boolean;
  readonly repairInputFocusNonce?: number;
  readonly onClose?: () => void;
}

export function SlideElementInspector({
  className,
  sidebarPanel,
  repairDraft,
  onRepairDraftChange,
  repairConversation,
  onSendRepairMessage,
  repairPending,
  repairInputFocusNonce = 0,
  onClose,
}: SlideElementInspectorProps) {
  const elements = useSceneSelector<SlideContent, PPTElement[]>((content) => content.canvas.elements);
  const activeElementIdList = useCanvasStore.use.activeElementIdList();
  const viewportSize = useCanvasStore.use.viewportSize();
  const viewportRatio = useCanvasStore.use.viewportRatio();
  const { addElement, updateElement, deleteElement } = useCanvasOperations();
  const { addHistorySnapshot } = useHistorySnapshot();
  const repairInputRef = useRef<HTMLTextAreaElement | null>(null);
  const repairConversationRef = useRef<HTMLDivElement | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const prevSidebarPanelRef = useRef(sidebarPanel);
  const [newTextContent, setNewTextContent] = useState('请输入文本');
  const [newTextFontFamily, setNewTextFontFamily] = useState<string>(DEFAULT_TEXT_FONT);
  const [newTextFontSize, setNewTextFontSize] = useState<number>(DEFAULT_TEXT_FONT_SIZE);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [addingImage, setAddingImage] = useState(false);
  const [manualTab, setManualTab] = useState<ManualInspectorTab>('add');

  const selectedElements = useMemo(
    () => elements.filter((element) => activeElementIdList.includes(element.id)),
    [elements, activeElementIdList],
  );
  const selectedElement = selectedElements.length === 1 ? selectedElements[0] : null;
  const hasSelection = selectedElements.length > 0;

  useEffect(() => {
    if (!repairInputFocusNonce || sidebarPanel !== 'ai') return;
    repairInputRef.current?.focus();
    repairInputRef.current?.select();
  }, [repairInputFocusNonce, sidebarPanel]);

  useEffect(() => {
    const prev = prevSidebarPanelRef.current;
    prevSidebarPanelRef.current = sidebarPanel;
    if (prev === 'ai' && sidebarPanel === 'manual') setManualTab('add');
  }, [sidebarPanel]);

  useEffect(() => {
    const container = repairConversationRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth',
    });
  }, [repairConversation]);

  const updateCurrentElement = useCallback(
    (props: Partial<PPTElement>, addSnapshot = false) => {
      if (!selectedElement) return;
      updateElement({ id: selectedElement.id, props });
      if (addSnapshot) void addHistorySnapshot();
    },
    [selectedElement, updateElement, addHistorySnapshot],
  );

  const updateNumberProp = useCallback(
    (prop: 'left' | 'top' | 'width' | 'height' | 'rotate', rawValue: string) => {
      const next = Number(rawValue);
      if (!Number.isFinite(next)) return;
      updateCurrentElement({ [prop]: next } as Partial<PPTElement>);
    },
    [updateCurrentElement],
  );

  const handleDeleteSelected = useCallback(() => {
    if (!hasSelection) return;
    deleteElement();
  }, [deleteElement, hasSelection]);

  const getNextInsertPosition = useCallback(
    (width: number, height: number) => {
      const viewportWidth = viewportSize;
      const viewportHeight = viewportSize * viewportRatio;
      const maxLeft = Math.max(0, viewportWidth - width);
      const maxTop = Math.max(0, viewportHeight - height);

      if (selectedElement) {
        return {
          left: Math.min(maxLeft, selectedElement.left + 24),
          top: Math.min(maxTop, selectedElement.top + 24),
        };
      }

      const offsetSeed = elements.length % 5;
      return {
        left: Math.max(0, Math.round((viewportWidth - width) / 2) + offsetSeed * 12),
        top: Math.max(48, Math.round((viewportHeight - height) / 2) - 40 + offsetSeed * 12),
      };
    },
    [elements.length, selectedElement, viewportRatio, viewportSize],
  );

  const getNextElementName = useCallback(
    (type: PPTElement['type']) => {
      const count = elements.filter((element) => element.type === type).length + 1;
      return `${getElementTypeLabel(type)} ${count}`;
    },
    [elements],
  );

  const handleAddTextElement = useCallback(() => {
    const trimmedContent = newTextContent.trim() || '请输入文本';
    const fontSize = Number.isFinite(newTextFontSize) ? Math.max(12, newTextFontSize) : 24;
    const contentHtml = applyTypographyToHtml(
      plainTextToParagraphHtml(trimmedContent),
      { fontSizePx: fontSize, fontFamily: newTextFontFamily },
    );
    const { left, top } = getNextInsertPosition(DEFAULT_TEXT_BOX_WIDTH, DEFAULT_TEXT_BOX_HEIGHT);

    const nextTextElement: PPTTextElement = {
      id: `text_${nanoid(8)}`,
      type: 'text',
      name: getNextElementName('text'),
      left,
      top,
      width: DEFAULT_TEXT_BOX_WIDTH,
      height: DEFAULT_TEXT_BOX_HEIGHT,
      rotate: 0,
      content: contentHtml,
      defaultFontName: newTextFontFamily,
      defaultColor: '#0f172a',
      textType: 'content',
      fill: 'transparent',
      lineHeight: 1.5,
      paragraphSpace: 5,
    };

    addElement({
      ...nextTextElement,
      ...buildAutoSizedTextProps(nextTextElement, {}),
    });
    void addHistorySnapshot();
  }, [
    addElement,
    addHistorySnapshot,
    getNextElementName,
    getNextInsertPosition,
    newTextContent,
    newTextFontFamily,
    newTextFontSize,
  ]);

  const insertImageElement = useCallback(
    async (src: string) => {
      setAddingImage(true);
      try {
        const viewportWidth = viewportSize;
        const viewportHeight = viewportSize * viewportRatio;
        const naturalSize = await measureImageSize(src);
        const fittedSize = fitSizeWithinBox(
          naturalSize.width,
          naturalSize.height,
          Math.min(DEFAULT_IMAGE_BOX_WIDTH, Math.round(viewportWidth * 0.48)),
          Math.min(DEFAULT_IMAGE_BOX_HEIGHT, Math.round(viewportHeight * 0.42)),
        );
        const { left, top } = getNextInsertPosition(fittedSize.width, fittedSize.height);

        addElement({
          id: `image_${nanoid(8)}`,
          type: 'image',
          name: getNextElementName('image'),
          left,
          top,
          width: fittedSize.width,
          height: fittedSize.height,
          rotate: 0,
          fixedRatio: true,
          src,
          imageType: 'itemFigure',
          radius: 16,
        });
        void addHistorySnapshot();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '添加图片失败');
      } finally {
        setAddingImage(false);
      }
    },
    [
      addElement,
      addHistorySnapshot,
      getNextElementName,
      getNextInsertPosition,
      viewportRatio,
      viewportSize,
    ],
  );

  const handleAddImageFromUrl = useCallback(async () => {
    const src = newImageUrl.trim();
    if (!src) {
      toast.error('请先输入图片地址');
      return;
    }
    await insertImageElement(src);
    setNewImageUrl('');
  }, [insertImageElement, newImageUrl]);

  const handleImageFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        const src = await readFileAsDataUrl(file);
        await insertImageElement(src);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '添加图片失败');
      } finally {
        event.target.value = '';
      }
    },
    [insertImageElement],
  );

  const renderCommonGeometry = (element: PPTElement) => (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        {fieldLabel('X')}
        <Input
          type="number"
          value={element.left}
          onChange={(e) => updateNumberProp('left', e.target.value)}
          onBlur={() => void addHistorySnapshot()}
        />
      </div>
      <div className="space-y-1.5">
        {fieldLabel('Y')}
        <Input
          type="number"
          value={element.top}
          onChange={(e) => updateNumberProp('top', e.target.value)}
          onBlur={() => void addHistorySnapshot()}
        />
      </div>
      <div className="space-y-1.5">
        {fieldLabel('宽度')}
        <Input
          type="number"
          value={element.width}
          onChange={(e) => updateNumberProp('width', e.target.value)}
          onBlur={() => void addHistorySnapshot()}
        />
      </div>
      {'height' in element ? (
        <div className="space-y-1.5">
          {fieldLabel('高度')}
          <Input
            type="number"
            value={element.height}
            onChange={(e) => updateNumberProp('height', e.target.value)}
            onBlur={() => void addHistorySnapshot()}
          />
        </div>
      ) : (
        <div className="space-y-1.5">
          {fieldLabel('高度')}
          <div className="flex h-9 items-center rounded-md border border-dashed border-slate-200 px-3 text-xs text-slate-400 dark:border-white/10 dark:text-slate-500">
            由线段端点决定
          </div>
        </div>
      )}
      {'rotate' in element ? (
        <div className="space-y-1.5">
          {fieldLabel('旋转')}
          <Input
            type="number"
            value={element.rotate}
            onChange={(e) => updateNumberProp('rotate', e.target.value)}
            onBlur={() => void addHistorySnapshot()}
          />
        </div>
      ) : null}
      <div className="space-y-1.5">
        {fieldLabel('名称')}
        <Input
          value={element.name || ''}
          onChange={(e) => updateCurrentElement({ name: e.target.value })}
          onBlur={() => void addHistorySnapshot()}
          placeholder="给这个组件起个名字"
        />
      </div>
    </div>
  );

  const renderTextEditor = (element: PPTTextElement) => (
    <div className="space-y-3">
      {sectionTitle('文本内容', '左侧画布只负责预览和选中，文本内容统一在右侧编辑。')}
      <div className="rounded-xl border border-slate-200 bg-white/80 p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
        <ProsemirrorEditor
          elementId={`${element.id}__inspector`}
          defaultColor={element.defaultColor}
          defaultFontName={element.defaultFontName}
          value={element.content}
          editable
          inspectorSurface
          onUpdate={({ value, ignore }) => {
            updateCurrentElement(buildAutoSizedTextProps(element, { content: value }));
            if (!ignore) void addHistorySnapshot();
          }}
          onBlur={() => void addHistorySnapshot()}
        />
      </div>
      <div className="space-y-1.5">
        {fieldLabel('默认字体')}
        <select
          value={element.defaultFontName || DEFAULT_TEXT_FONT}
          onChange={(e) =>
            updateCurrentElement(
              buildAutoSizedTextProps(element, {
                defaultFontName: e.target.value,
                content: applyTypographyToHtml(element.content, { fontFamily: e.target.value }),
              }),
              true,
            )
          }
          className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm dark:border-white/10 dark:bg-white/[0.04]"
        >
          {FONT_FAMILY_OPTIONS.map((fontFamily) => (
            <option key={fontFamily} value={fontFamily}>
              {fontFamily}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        {fieldLabel('字号')}
        <Input
          type="number"
          min={12}
          max={96}
          value={extractFontSizeFromHtml(element.content)}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (!Number.isFinite(next)) return;
            updateCurrentElement(
              buildAutoSizedTextProps(element, {
                content: applyTypographyToHtml(element.content, { fontSizePx: next }),
              }),
            );
          }}
          onBlur={() => void addHistorySnapshot()}
        />
      </div>
      <div className="space-y-1.5">
        {fieldLabel('默认文字颜色')}
        {colorInput(element.defaultColor, (next) => updateCurrentElement({ defaultColor: next }))}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          {fieldLabel('背景填充')}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              'h-8 shrink-0 rounded-lg px-2.5 text-xs font-medium',
              (!element.fill || element.fill === 'transparent') &&
                'border-[#007AFF]/40 bg-[rgba(0,122,255,0.08)] text-[#007AFF] dark:border-[#0A84FF]/45 dark:bg-[rgba(10,132,255,0.15)] dark:text-[#0A84FF]',
            )}
            onClick={() => {
              updateCurrentElement({ fill: 'transparent' });
              void addHistorySnapshot();
            }}
          >
            无填充
          </Button>
        </div>
        {colorInput(element.fill, (next) => updateCurrentElement({ fill: next }))}
      </div>
    </div>
  );

  const renderShapeEditor = (element: PPTShapeElement) => {
    const text = element.text;
    return (
      <div className="space-y-3">
        {sectionTitle('形状内容', '可以编辑形状本身的填充色，也可以修改形状里的文字。')}
        <div className="space-y-1.5">
          {fieldLabel('填充颜色')}
          {colorInput(element.fill, (next) => updateCurrentElement({ fill: next }))}
        </div>
        <div className="space-y-1.5">
          {fieldLabel('不透明度')}
          <Input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={element.opacity ?? 1}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (!Number.isFinite(next)) return;
              updateCurrentElement({ opacity: next });
            }}
            onBlur={() => void addHistorySnapshot()}
          />
        </div>
        {text ? (
          <>
            <div className="rounded-xl border border-slate-200 bg-white/80 p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
              <ProsemirrorEditor
                elementId={`${element.id}__shape_inspector`}
                defaultColor={text.defaultColor}
                defaultFontName={text.defaultFontName}
                value={text.content}
                editable
                inspectorSurface
                onUpdate={({ value, ignore }) => {
                  updateCurrentElement({
                    text: {
                      ...text,
                      content: value,
                    },
                  });
                  if (!ignore) void addHistorySnapshot();
                }}
                onBlur={() => void addHistorySnapshot()}
              />
            </div>
            <div className="space-y-1.5">
              {fieldLabel('默认字体')}
              <select
                value={text.defaultFontName || DEFAULT_TEXT_FONT}
                onChange={(e) =>
                  updateCurrentElement(
                    {
                      text: {
                        ...text,
                        defaultFontName: e.target.value,
                        content: applyTypographyToHtml(text.content, {
                          fontFamily: e.target.value,
                        }),
                      },
                    },
                    true,
                  )
                }
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm dark:border-white/10 dark:bg-white/[0.04]"
              >
                {FONT_FAMILY_OPTIONS.map((fontFamily) => (
                  <option key={fontFamily} value={fontFamily}>
                    {fontFamily}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              {fieldLabel('字号')}
              <Input
                type="number"
                min={12}
                max={96}
                value={extractFontSizeFromHtml(text.content)}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  if (!Number.isFinite(next)) return;
                  updateCurrentElement({
                    text: {
                      ...text,
                      content: applyTypographyToHtml(text.content, { fontSizePx: next }),
                    },
                  });
                }}
                onBlur={() => void addHistorySnapshot()}
              />
            </div>
            <div className="space-y-1.5">
              {fieldLabel('文字垂直对齐')}
              <select
                value={text.align}
                onChange={(e) =>
                  updateCurrentElement({
                    text: {
                      ...text,
                      align: e.target.value as NonNullable<PPTShapeElement['text']>['align'],
                    },
                  }, true)
                }
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm dark:border-white/10 dark:bg-white/[0.04]"
              >
                <option value="top">顶部</option>
                <option value="middle">中部</option>
                <option value="bottom">底部</option>
              </select>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() =>
              updateCurrentElement(
                {
                  text: {
                    content: '<p>请输入形状说明</p>',
                    defaultFontName: 'Arial',
                    defaultColor: '#111827',
                    align: 'middle',
                  },
                },
                true,
              )
            }
            className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-800 dark:border-white/15 dark:text-slate-300 dark:hover:border-white/25 dark:hover:text-white"
          >
            为形状添加文字
          </button>
        )}
      </div>
    );
  };

  const renderLatexEditor = (element: PPTLatexElement) => (
    <div className="space-y-3">
      {sectionTitle('公式内容', '这里直接编辑 LaTeX，左侧公式会同步刷新。')}
      <Textarea
        value={element.latex}
        onChange={(e) =>
          updateCurrentElement({
            latex: e.target.value,
            html: renderLatexElementHtml(e.target.value),
            fixedRatio: true,
          })
        }
        onBlur={() => void addHistorySnapshot()}
        className="min-h-[140px] font-mono text-sm"
      />
      <div className="space-y-1.5">
        {fieldLabel('对齐方式')}
        <select
          value={element.align || 'center'}
          onChange={(e) =>
            updateCurrentElement(
              { align: e.target.value as PPTLatexElement['align'] },
              true,
            )
          }
          className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm dark:border-white/10 dark:bg-white/[0.04]"
        >
          <option value="left">左对齐</option>
          <option value="center">居中</option>
          <option value="right">右对齐</option>
        </select>
      </div>
    </div>
  );

  const renderTableEditor = (element: PPTTableElement) => (
    <div className="space-y-3">
      {sectionTitle('表格内容', '可以逐格改表格文本，适合修正标题、数字或术语。')}
      <div className="space-y-2">
        {element.data.map((row, rowIndex) => (
          <div key={`row-${rowIndex}`} className="grid grid-cols-1 gap-2">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              第 {rowIndex + 1} 行
            </div>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>
              {row.map((cell, colIndex) => (
                <Input
                  key={cell.id}
                  value={cell.text}
                  onChange={(e) => {
                    const nextData = element.data.map((currentRow, currentRowIndex) =>
                      currentRow.map((currentCell, currentColIndex) =>
                        currentRowIndex === rowIndex && currentColIndex === colIndex
                          ? { ...currentCell, text: e.target.value }
                          : currentCell,
                      ),
                    );
                    updateCurrentElement({ data: nextData });
                  }}
                  onBlur={() => void addHistorySnapshot()}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderChartEditor = (element: PPTChartElement) => (
    <div className="space-y-3">
      {sectionTitle('图表设置', '可以直接调整图表容器背景，让图表卡片更容易和页面区块区分。')}
      <div className="space-y-1.5">
        {fieldLabel('背景填充')}
        {colorInput(element.fill, (next) => updateCurrentElement({ fill: next }))}
      </div>
      <div className="space-y-1.5">
        {fieldLabel('文字颜色')}
        {colorInput(element.textColor, (next) => updateCurrentElement({ textColor: next }))}
      </div>
      <div className="space-y-1.5">
        {fieldLabel('网格线颜色')}
        {colorInput(element.lineColor, (next) => updateCurrentElement({ lineColor: next }))}
      </div>
    </div>
  );

  const renderImageEditor = (element: PPTImageElement) => (
    <div className="space-y-3">
      {sectionTitle('图片设置')}
      <div className="space-y-1.5">
        {fieldLabel('图片地址')}
        <Textarea
          value={element.src}
          onChange={(e) => updateCurrentElement({ src: e.target.value })}
          onBlur={() => void addHistorySnapshot()}
          className="min-h-[88px] text-xs"
        />
      </div>
      <div className="space-y-1.5">
        {fieldLabel('圆角')}
        <Input
          type="number"
          value={element.radius ?? 0}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (!Number.isFinite(next)) return;
            updateCurrentElement({ radius: next });
          }}
          onBlur={() => void addHistorySnapshot()}
        />
      </div>
      <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-white/10">
        <div>
          <div className="text-sm font-medium text-slate-800 dark:text-slate-100">锁定宽高比</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">缩放时保持原图比例</div>
        </div>
        <Switch
          checked={element.fixedRatio}
          onCheckedChange={(checked) => updateCurrentElement({ fixedRatio: checked }, true)}
        />
      </div>
    </div>
  );

  const renderLineEditor = (element: PPTLineElement) => (
    <div className="space-y-3">
      {sectionTitle('线条设置')}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          {fieldLabel('起点 X')}
          <Input
            type="number"
            value={element.start[0]}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (!Number.isFinite(next)) return;
              updateCurrentElement({ start: [next, element.start[1]] });
            }}
            onBlur={() => void addHistorySnapshot()}
          />
        </div>
        <div className="space-y-1.5">
          {fieldLabel('起点 Y')}
          <Input
            type="number"
            value={element.start[1]}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (!Number.isFinite(next)) return;
              updateCurrentElement({ start: [element.start[0], next] });
            }}
            onBlur={() => void addHistorySnapshot()}
          />
        </div>
        <div className="space-y-1.5">
          {fieldLabel('终点 X')}
          <Input
            type="number"
            value={element.end[0]}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (!Number.isFinite(next)) return;
              updateCurrentElement({ end: [next, element.end[1]] });
            }}
            onBlur={() => void addHistorySnapshot()}
          />
        </div>
        <div className="space-y-1.5">
          {fieldLabel('终点 Y')}
          <Input
            type="number"
            value={element.end[1]}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (!Number.isFinite(next)) return;
              updateCurrentElement({ end: [element.end[0], next] });
            }}
            onBlur={() => void addHistorySnapshot()}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        {fieldLabel('线条颜色')}
        {colorInput(element.color, (next) => updateCurrentElement({ color: next }))}
      </div>
      <div className="space-y-1.5">
        {fieldLabel('线条样式')}
        <select
          value={element.style}
          onChange={(e) =>
            updateCurrentElement({ style: e.target.value as PPTLineElement['style'] }, true)
          }
          className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm dark:border-white/10 dark:bg-white/[0.04]"
        >
          <option value="solid">实线</option>
          <option value="dashed">虚线</option>
          <option value="dotted">点线</option>
        </select>
      </div>
    </div>
  );

  const renderVideoEditor = (element: PPTVideoElement) => (
    <div className="space-y-3">
      {sectionTitle('视频设置')}
      <div className="space-y-1.5">
        {fieldLabel('视频地址')}
        <Textarea
          value={element.src}
          onChange={(e) => updateCurrentElement({ src: e.target.value })}
          onBlur={() => void addHistorySnapshot()}
          className="min-h-[88px] text-xs"
        />
      </div>
      <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-white/10">
        <div>
          <div className="text-sm font-medium text-slate-800 dark:text-slate-100">自动播放</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">进入这页后自动播放视频</div>
        </div>
        <Switch
          checked={element.autoplay}
          onCheckedChange={(checked) => updateCurrentElement({ autoplay: checked }, true)}
        />
      </div>
    </div>
  );

  const renderAudioEditor = (element: PPTAudioElement) => (
    <div className="space-y-3">
      {sectionTitle('音频设置')}
      <div className="space-y-1.5">
        {fieldLabel('音频地址')}
        <Textarea
          value={element.src}
          onChange={(e) => updateCurrentElement({ src: e.target.value })}
          onBlur={() => void addHistorySnapshot()}
          className="min-h-[88px] text-xs"
        />
      </div>
      <div className="grid grid-cols-1 gap-2">
        <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-white/10">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-100">自动播放</span>
          <Switch
            checked={element.autoplay}
            onCheckedChange={(checked) => updateCurrentElement({ autoplay: checked }, true)}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-white/10">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-100">循环播放</span>
          <Switch
            checked={element.loop}
            onCheckedChange={(checked) => updateCurrentElement({ loop: checked }, true)}
          />
        </div>
      </div>
    </div>
  );

  const renderElementEditor = (element: PPTElement) => {
    switch (element.type) {
      case 'text':
        return renderTextEditor(element);
      case 'shape':
        return renderShapeEditor(element);
      case 'latex':
        return renderLatexEditor(element);
      case 'table':
        return renderTableEditor(element);
      case 'chart':
        return renderChartEditor(element);
      case 'image':
        return renderImageEditor(element);
      case 'line':
        return renderLineEditor(element);
      case 'video':
        return renderVideoEditor(element);
      case 'audio':
        return renderAudioEditor(element);
      default:
        return (
          <div className="rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500 dark:border-white/15 dark:text-slate-400">
            这个组件类型暂时还没有专用编辑器，当前可以先调整基础几何属性。
          </div>
        );
    }
  };

  return (
    <aside
      aria-label={sidebarPanel === 'ai' ? 'AI 重写侧栏' : '手动编辑侧栏'}
      className={cn(
        'flex h-full min-h-0 w-[360px] shrink-0 flex-col border-l border-slate-900/[0.08] bg-white/76 backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#0f1115]/78 xl:w-[400px]',
        className,
      )}
    >
      {sidebarPanel === 'manual' ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-900/[0.06] px-3 py-2 dark:border-white/[0.06]">
          <div
            role="tablist"
            aria-label="手动编辑分区"
            className="grid min-w-0 flex-1 grid-cols-3 gap-0.5 rounded-xl bg-slate-100/90 p-[3px] dark:bg-white/[0.06]"
          >
            {MANUAL_INSPECTOR_TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={manualTab === id}
                onClick={() => setManualTab(id)}
                className={cn(
                  'min-w-0 truncate rounded-[10px] px-1.5 py-1.5 text-center text-[11px] font-semibold leading-tight transition-all',
                  manualTab === id
                    ? 'bg-[rgba(0,122,255,0.12)] text-[#007AFF] shadow-sm dark:bg-[rgba(10,132,255,0.18)] dark:text-[#0A84FF]'
                    : 'text-slate-600 hover:bg-black/[0.04] dark:text-slate-400 dark:hover:bg-white/[0.06]',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-[10px] p-1.5 text-slate-500 transition-colors hover:bg-slate-900/[0.06] hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.08] dark:hover:text-slate-100"
              aria-label="关闭编辑"
            >
              <X className="size-4" strokeWidth={2} />
            </button>
          ) : null}
        </div>
      ) : onClose ? (
        <div className="flex justify-end border-b border-slate-900/[0.06] px-4 py-2 dark:border-white/[0.06]">
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-[10px] p-1.5 text-slate-500 transition-colors hover:bg-slate-900/[0.06] hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.08] dark:hover:text-slate-100"
            aria-label="关闭编辑"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-6 px-4 py-4">
          {sidebarPanel === 'ai' ? (
            <div className="space-y-3">
              {sectionTitle(
                'AI 重写对话',
                '像聊天一样告诉 AI 为什么这页需要重写；它会按主生成流程重写当前页，并把你的要求带进去。',
              )}
              <div className="rounded-[24px] border border-sky-200/80 bg-[linear-gradient(180deg,rgba(240,249,255,0.95)_0%,rgba(255,255,255,0.92)_100%)] p-3 shadow-[0_18px_40px_rgba(56,189,248,0.12)] dark:border-sky-500/20 dark:bg-[linear-gradient(180deg,rgba(12,20,32,0.94)_0%,rgba(15,23,42,0.84)_100%)]">
                <div
                  ref={repairConversationRef}
                  className="max-h-[360px] space-y-3 overflow-y-auto rounded-2xl border border-white/70 bg-white/75 p-3 dark:border-white/10 dark:bg-slate-950/30"
                >
                  {repairConversation.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-sky-200 bg-sky-50/80 px-4 py-4 text-sm leading-6 text-slate-600 dark:border-sky-500/20 dark:bg-sky-950/20 dark:text-slate-300">
                      你可以直接说：
                      <div className="mt-2 space-y-1 text-[13px] text-slate-500 dark:text-slate-400">
                        <div>“这一页太空了，帮我重写得更完整一点”</div>
                        <div>“保留主题，但讲法换得更像课堂证明页”</div>
                        <div>“这一页不够像老师上课会展示的版本，重写一下结构”</div>
                      </div>
                    </div>
                  ) : null}

                  {repairConversation.map((message) => {
                    const isAssistant = message.role === 'assistant';
                    return (
                      <div
                        key={message.id}
                        className={cn('flex', isAssistant ? 'justify-start' : 'justify-end')}
                      >
                        <div
                          className={cn(
                            'max-w-[85%] rounded-[20px] px-4 py-3 text-sm leading-6 shadow-sm',
                            isAssistant
                              ? message.status === 'error'
                                ? 'border border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100'
                                : 'border border-sky-200 bg-white text-slate-700 dark:border-sky-500/20 dark:bg-slate-900/80 dark:text-slate-100'
                              : 'bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950',
                          )}
                        >
                          <div className="mb-1 flex items-center gap-2 text-[11px] font-medium opacity-70">
                            <span>{isAssistant ? 'AI 重写' : '你'}</span>
                            {message.status === 'pending' ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : null}
                          </div>
                          <p className="whitespace-pre-wrap break-words">{message.content}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {COMMON_REWRITE_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => onRepairDraftChange(prompt)}
                      className="rounded-full border border-sky-200 bg-white/80 px-3 py-1.5 text-[11px] font-medium text-slate-600 transition-colors hover:border-sky-300 hover:text-slate-900 dark:border-sky-500/20 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:text-white"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>

                <div className="mt-3 rounded-2xl border border-sky-200/80 bg-white/85 p-3 dark:border-sky-500/20 dark:bg-slate-950/40">
                  <Textarea
                    ref={repairInputRef}
                    value={repairDraft}
                    onChange={(e) => onRepairDraftChange(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !repairPending) {
                        e.preventDefault();
                        onSendRepairMessage();
                      }
                    }}
                    placeholder="像聊天一样发一句，例如：这页太空了，按更完整的证明页重写。"
                    className="min-h-[108px] border-sky-200 bg-white/90 text-sm dark:border-sky-500/20 dark:bg-slate-950/40"
                  />
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                      `Cmd/Ctrl + Enter` 发送。留空时，会按默认主生成流程重写当前页。
                    </p>
                    <Button
                      type="button"
                      onClick={onSendRepairMessage}
                      disabled={repairPending}
                      className="shrink-0 rounded-full px-4"
                    >
                      {repairPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <ArrowUp className="size-4" />
                      )}
                      {repairPending ? 'AI 正在重写' : '发送并重写'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {manualTab === 'add' ? (
                <section className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                        <PlusSquare className="size-4" />
                        添加文本
                      </div>
                      <Textarea
                        value={newTextContent}
                        onChange={(e) => setNewTextContent(e.target.value)}
                        className="min-h-[88px]"
                        placeholder="输入新文本组件的默认内容"
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          {fieldLabel('字体')}
                          <select
                            value={newTextFontFamily}
                            onChange={(e) => setNewTextFontFamily(e.target.value)}
                            className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm dark:border-white/10 dark:bg-white/[0.04]"
                          >
                            {FONT_FAMILY_OPTIONS.map((fontFamily) => (
                              <option key={fontFamily} value={fontFamily}>
                                {fontFamily}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          {fieldLabel('字号')}
                          <Input
                            type="number"
                            min={12}
                            max={96}
                            value={newTextFontSize}
                            onChange={(e) => {
                              const next = Number(e.target.value);
                              if (!Number.isFinite(next)) return;
                              setNewTextFontSize(next);
                            }}
                          />
                        </div>
                      </div>
                      <Button type="button" variant="outline" onClick={handleAddTextElement}>
                        <PlusSquare className="size-4" />
                        添加文本组件
                      </Button>
                    </div>
                  </div>

                  <div
                    className="flex items-center gap-3 py-0.5"
                    role="separator"
                    aria-orientation="horizontal"
                  >
                    <div className="h-px flex-1 bg-slate-200/90 dark:bg-white/12" />
                    <span className="shrink-0 text-[11px] font-medium text-slate-400 dark:text-slate-500">
                      或
                    </span>
                    <div className="h-px flex-1 bg-slate-200/90 dark:bg-white/12" />
                  </div>

                  <div className="space-y-3 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                      <ImagePlus className="size-4" />
                      添加图片
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => imageFileInputRef.current?.click()}
                        disabled={addingImage}
                      >
                        <Upload className="size-4" />
                        {addingImage ? '处理中…' : '上传本地图片'}
                      </Button>
                      <input
                        ref={imageFileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageFileChange}
                      />
                    </div>
                    <div className="space-y-1.5">
                      {fieldLabel('图片地址')}
                      <Input
                        value={newImageUrl}
                        onChange={(e) => setNewImageUrl(e.target.value)}
                        placeholder="https://example.com/image.png"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleAddImageFromUrl()}
                      disabled={addingImage}
                    >
                      <ImagePlus className="size-4" />
                      {addingImage ? '处理中…' : '通过地址添加图片'}
                    </Button>
                  </div>
                </section>
              ) : null}

              {manualTab === 'position' ? (
                <section className="space-y-4">
                  {sectionTitle(
                    '调整位置',
                    '在左侧画布选中一个组件后，可在此修改坐标、宽高、旋转与层级；多选时仅支持批量删除。',
                  )}
                  {selectedElement ? (
                    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {getElementDisplayName(
                              selectedElement,
                              elements.findIndex((item) => item.id === selectedElement.id),
                            )}
                          </h3>
                          <Badge variant="outline" className="text-[10px]">
                            {getElementTypeLabel(selectedElement.type)}
                          </Badge>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={handleDeleteSelected}
                            className="ml-auto"
                          >
                            <Trash2 className="size-4" />
                            删除
                          </Button>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          改动会同步到左侧画布；也可在画布上按 Delete 删除选中项。
                        </p>
                      </div>
                      {renderCommonGeometry(selectedElement)}
                    </div>
                  ) : selectedElements.length > 1 ? (
                    <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                      <p>
                        当前选中了 {selectedElements.length} 个组件。位置与内容编辑需单选；可先批量删除或再在画布上点选其中一个。
                      </p>
                      <Button type="button" variant="destructive" size="sm" onClick={handleDeleteSelected}>
                        <Trash2 className="size-4" />
                        删除所选组件
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-sm leading-6 text-slate-500 dark:border-white/15 dark:text-slate-400">
                      尚未选中组件。请在左侧幻灯片上点击标题、正文、图片等元素，再在此区调整位置与尺寸。
                    </div>
                  )}
                </section>
              ) : null}

              {manualTab === 'text' ? (
                <section className="space-y-4">
                  {selectedElement ? (
                    <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
                      {renderElementEditor(selectedElement)}
                    </div>
                  ) : selectedElements.length > 1 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-sm leading-6 text-slate-500 dark:border-white/15 dark:text-slate-400">
                      多选状态下无法编辑具体内容。请在画布上单选一个组件后再使用本区。
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-sm leading-6 text-slate-500 dark:border-white/15 dark:text-slate-400">
                      选中单个组件后，本区会出现对应的文字与属性编辑项。
                    </div>
                  )}
                </section>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
