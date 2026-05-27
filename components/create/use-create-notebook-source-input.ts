'use client';

import { type DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useDraftCache } from '@/lib/hooks/use-draft-cache';
import { getPdfSourceFileSignature, type PdfSourceSelection } from '@/lib/pdf/page-selection';
import type { ImageMapping, PdfImage } from '@/lib/types/generation';
import {
  parseMarkdownLikeGenerationInput,
  parsePdfLikeGenerationPreview,
  parsePptxLikeGenerationPreview,
} from '@/lib/create/source-input';
import {
  MAX_SOURCE_FILE_SIZE_BYTES,
  buildExtractedTextItems,
  buildImagePreviews,
  buildMaterialRows,
  buildRequirementPreview,
  isMarkdownSourceFile,
  isPdfSourceFile,
  isPptxSourceFile,
  type ExtractedSourceItem,
  type ExtractedSourcePreview,
  type FormState,
  type MaterialRow,
  type PreparedSourceInput,
  type SourceGenerationExtract,
  type WorkspaceStep,
} from './create-notebook-workspace-model';

type ParsedSourcePreview = {
  text: string;
  imageCount: number;
  imagePreviews: ExtractedSourcePreview['imagePreviews'];
  imageDuplicateCount: number;
  pdfImages: PdfImage[];
  imageMapping: ImageMapping;
  warnings: string[];
};

type UseCreateNotebookSourceInputArgs = {
  activeStep: WorkspaceStep;
  busy: boolean;
  language: 'zh-CN' | 'en-US';
  fileTooLargeMessage: string;
  onError: (message: string | null) => void;
  onSourceChanged: () => void;
};

const EMPTY_SOURCE_EXTRACT: SourceGenerationExtract = {
  text: '',
  pdfImages: [],
  imageMapping: {},
};

const EMPTY_SOURCE_PREVIEW: ExtractedSourcePreview = {
  status: 'idle',
  items: [],
  imageCount: 0,
  imagePreviews: [],
  imageDuplicateCount: 0,
  warnings: [],
};

function buildReadySourcePreview(parsed: ParsedSourcePreview): ExtractedSourcePreview {
  const textItems = buildExtractedTextItems(parsed.text);
  const imageItem: ExtractedSourceItem[] =
    parsed.imageCount > 0
      ? [
          {
            id: 'images',
            title: '提取到的图片',
            detail: `系统将保留 ${parsed.imageCount} 张图片或图形区域作为生成依据。`,
            kind: '图片',
          },
        ]
      : [];

  return {
    status: 'ready',
    items:
      textItems.length > 0
        ? [...textItems, ...imageItem].slice(0, 5)
        : [
            {
              id: 'empty-text',
              title: '未提取到可读正文',
              detail: '这个文件可能以图片扫描为主，后续会尽量保留可用页面图像和文件信息。',
              kind: '文本',
            },
            ...imageItem,
          ],
    imageCount: parsed.imageCount,
    imagePreviews: parsed.imagePreviews,
    imageDuplicateCount: parsed.imageDuplicateCount,
    warnings: parsed.warnings,
  };
}

function buildErrorSourcePreview(message: string): ExtractedSourcePreview {
  return {
    status: 'error',
    items: [],
    imageCount: 0,
    imagePreviews: [],
    imageDuplicateCount: 0,
    warnings: [],
    message,
  };
}

export function useCreateNotebookSourceInput({
  activeStep,
  busy,
  language,
  fileTooLargeMessage,
  onError,
  onSourceChanged,
}: UseCreateNotebookSourceInputArgs) {
  const sourceDragDepthRef = useRef(0);
  const [form, setForm] = useState<FormState>({ sourceFile: null, requirement: '' });
  const [materials, setMaterials] = useState<MaterialRow[]>(() => buildMaterialRows(null, ''));
  const [sourceDragActive, setSourceDragActive] = useState(false);
  const [sourcePageSelection, setSourcePageSelection] = useState<PdfSourceSelection | null>(null);
  const [sourcePreview, setSourcePreview] = useState<ExtractedSourcePreview>(EMPTY_SOURCE_PREVIEW);
  const [sourceExtract, setSourceExtract] = useState<SourceGenerationExtract>(EMPTY_SOURCE_EXTRACT);
  const [selectedSourceImageIds, setSelectedSourceImageIds] = useState<string[]>([]);

  const { cachedValue: cachedRequirement, updateCache: updateRequirementCache } =
    useDraftCache<string>({ key: 'requirementDraft' });

  useEffect(() => {
    if (!cachedRequirement) return;
    setForm((prev) => ({ ...prev, requirement: cachedRequirement }));
  }, [cachedRequirement]);

  useEffect(() => {
    setMaterials((current) => {
      const next = buildMaterialRows(form.sourceFile, form.requirement);
      const keepById = new Map(current.map((item) => [item.id, item.keep]));
      return next.map((item) => ({ ...item, keep: keepById.get(item.id) ?? item.keep }));
    });
  }, [form.sourceFile, form.requirement]);

  useEffect(() => {
    const file = form.sourceFile;
    if (!file || !isPdfSourceFile(file)) {
      setSourcePageSelection(null);
      return;
    }
    const signature = getPdfSourceFileSignature(file);
    setSourcePageSelection((current) => (current?.fileSignature === signature ? current : null));
  }, [form.sourceFile]);

  const parseSourceFile = useCallback(
    async (file: File, signal: AbortSignal): Promise<ParsedSourcePreview> => {
      if (isMarkdownSourceFile(file)) {
        const parsed = await parseMarkdownLikeGenerationInput({ file });
        return {
          text: parsed.pdfText,
          imageCount: 0,
          imagePreviews: [],
          imageDuplicateCount: 0,
          pdfImages: [],
          imageMapping: {},
          warnings: parsed.truncationWarnings,
        };
      }

      if (isPptxSourceFile(file)) {
        const parsed = await parsePptxLikeGenerationPreview({
          pptxFile: file,
          signal,
        });
        const imagePreviewResult = buildImagePreviews(parsed.pdfImages, parsed.imageMapping);
        return {
          text: parsed.pdfText,
          imageCount: parsed.pdfImages.length,
          imagePreviews: imagePreviewResult.imagePreviews,
          imageDuplicateCount: imagePreviewResult.duplicateCount,
          pdfImages: parsed.pdfImages,
          imageMapping: parsed.imageMapping,
          warnings: parsed.truncationWarnings,
        };
      }

      const parsed = await parsePdfLikeGenerationPreview({
        pdfFile: file,
        language,
        sourcePageSelection: sourcePageSelection ?? undefined,
        imageLimit: null,
        includeVisualRegionImages: true,
        signal,
      });
      const imagePreviewResult = buildImagePreviews(parsed.pdfImages, parsed.imageMapping);
      return {
        text: parsed.pdfText,
        imageCount: parsed.pdfImages.length,
        imagePreviews: imagePreviewResult.imagePreviews,
        imageDuplicateCount: imagePreviewResult.duplicateCount,
        pdfImages: parsed.pdfImages,
        imageMapping: parsed.imageMapping,
        warnings: parsed.truncationWarnings,
      };
    },
    [language, sourcePageSelection],
  );

  const commitParsedSourceInput = useCallback((parsed: ParsedSourcePreview) => {
    const selectedImageIds = parsed.imagePreviews.map((image) => image.id);
    const extract = {
      text: parsed.text,
      pdfImages: parsed.pdfImages,
      imageMapping: parsed.imageMapping,
    };
    const preview = buildReadySourcePreview(parsed);

    setSelectedSourceImageIds(selectedImageIds);
    setSourceExtract(extract);
    setSourcePreview(preview);
    return { preview, extract, selectedImageIds };
  }, []);

  useEffect(() => {
    if (activeStep !== 'materials') return;

    const file = form.sourceFile;
    if (!file) {
      setSourcePreview(buildRequirementPreview(form.requirement));
      setSourceExtract({ text: form.requirement, pdfImages: [], imageMapping: {} });
      setSelectedSourceImageIds([]);
      return;
    }

    const abortController = new AbortController();
    setSelectedSourceImageIds([]);
    setSourcePreview({
      status: 'loading',
      items: [],
      imageCount: 0,
      imagePreviews: [],
      imageDuplicateCount: 0,
      warnings: [],
    });

    void parseSourceFile(file, abortController.signal)
      .then((parsed) => {
        if (abortController.signal.aborted) return;
        commitParsedSourceInput(parsed);
      })
      .catch((err) => {
        if (abortController.signal.aborted) return;
        setSelectedSourceImageIds([]);
        setSourceExtract(EMPTY_SOURCE_EXTRACT);
        setSourcePreview(
          buildErrorSourcePreview(err instanceof Error ? err.message : '素材解析失败'),
        );
      });

    return () => abortController.abort();
  }, [activeStep, commitParsedSourceInput, form.sourceFile, form.requirement, parseSourceFile]);

  const updateRequirement = useCallback(
    (value: string) => {
      onSourceChanged();
      setForm((prev) => ({ ...prev, requirement: value }));
      updateRequirementCache(value);
    },
    [onSourceChanged, updateRequirementCache],
  );

  const handleFileSelect = useCallback(
    (file: File) => {
      if (!isPdfSourceFile(file) && !isMarkdownSourceFile(file) && !isPptxSourceFile(file)) {
        onError('目前只支持 PDF、PPTX 或 Markdown（.md）文件。');
        return;
      }
      if (file.size > MAX_SOURCE_FILE_SIZE_BYTES) {
        onError(fileTooLargeMessage);
        return;
      }
      onError(null);
      onSourceChanged();
      setForm((prev) => ({ ...prev, sourceFile: file }));
    },
    [fileTooLargeMessage, onError, onSourceChanged],
  );

  const clearSourceFile = useCallback(() => {
    onSourceChanged();
    setForm((prev) => ({ ...prev, sourceFile: null }));
  }, [onSourceChanged]);

  const handleSourceInputDragEnter = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (busy) return;
      sourceDragDepthRef.current += 1;
      setSourceDragActive(true);
    },
    [busy],
  );

  const handleSourceInputDragOver = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (busy) return;
      event.dataTransfer.dropEffect = 'copy';
      setSourceDragActive(true);
    },
    [busy],
  );

  const handleSourceInputDragLeave = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    sourceDragDepthRef.current = Math.max(0, sourceDragDepthRef.current - 1);
    if (sourceDragDepthRef.current === 0) setSourceDragActive(false);
  }, []);

  const handleSourceInputDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      sourceDragDepthRef.current = 0;
      setSourceDragActive(false);
      if (busy) return;
      const file = event.dataTransfer.files?.[0];
      if (file) handleFileSelect(file);
    },
    [busy, handleFileSelect],
  );

  const prepareSourceInputForPlanning = useCallback(
    async (signal?: AbortSignal): Promise<PreparedSourceInput> => {
      const file = form.sourceFile;
      if (!file) {
        const preview = buildRequirementPreview(form.requirement);
        const extract = { text: form.requirement, pdfImages: [], imageMapping: {} };
        setSourcePreview(preview);
        setSourceExtract(extract);
        setSelectedSourceImageIds([]);
        return { preview, extract, selectedImageIds: [] };
      }

      const parserSignal = signal ?? new AbortController().signal;
      setSelectedSourceImageIds([]);
      setSourcePreview({
        status: 'loading',
        items: [],
        imageCount: 0,
        imagePreviews: [],
        imageDuplicateCount: 0,
        warnings: [],
      });

      try {
        const parsed = await parseSourceFile(file, parserSignal);
        if (parserSignal.aborted) throw new Error('输入读取已取消');
        return commitParsedSourceInput(parsed);
      } catch (err) {
        setSelectedSourceImageIds([]);
        setSourceExtract(EMPTY_SOURCE_EXTRACT);
        setSourcePreview(
          buildErrorSourcePreview(err instanceof Error ? err.message : '输入读取失败'),
        );
        throw err;
      }
    },
    [commitParsedSourceInput, form.requirement, form.sourceFile, parseSourceFile],
  );

  const setSourceImageSelection = useCallback((imageId: string, keep: boolean) => {
    setSelectedSourceImageIds((current) => {
      if (keep) {
        return current.includes(imageId) ? current : [...current, imageId];
      }
      return current.filter((id) => id !== imageId);
    });
  }, []);

  const setAllSourceImagesSelected = useCallback(
    (keep: boolean) => {
      setSelectedSourceImageIds(keep ? sourcePreview.imagePreviews.map((image) => image.id) : []);
    },
    [sourcePreview.imagePreviews],
  );

  const setMaterialKeep = useCallback(
    (itemId: string, keep: boolean) => {
      setMaterials((rows) => rows.map((row) => (row.id === itemId ? { ...row, keep } : row)));
      if (
        (itemId === 'pdf-images' || itemId === 'pptx-images') &&
        sourcePreview.imagePreviews.length > 0
      ) {
        setAllSourceImagesSelected(keep);
      }
    },
    [setAllSourceImagesSelected, sourcePreview.imagePreviews.length],
  );

  useEffect(() => {
    if (sourcePreview.imagePreviews.length === 0) return;
    const keepImages = selectedSourceImageIds.length > 0;
    setMaterials((rows) =>
      rows.map((row) =>
        row.id === 'pdf-images' || row.id === 'pptx-images' ? { ...row, keep: keepImages } : row,
      ),
    );
  }, [selectedSourceImageIds.length, sourcePreview.imagePreviews.length]);

  const resetSourceInput = useCallback(() => {
    setForm({ sourceFile: null, requirement: '' });
    updateRequirementCache('');
    setMaterials(buildMaterialRows(null, ''));
    setSourcePageSelection(null);
    setSourcePreview(EMPTY_SOURCE_PREVIEW);
    setSourceExtract(EMPTY_SOURCE_EXTRACT);
    setSelectedSourceImageIds([]);
    sourceDragDepthRef.current = 0;
    setSourceDragActive(false);
  }, [updateRequirementCache]);

  return {
    form,
    materials,
    sourceDragActive,
    sourcePageSelection,
    sourcePreview,
    sourceExtract,
    selectedSourceImageIds,
    setSourcePageSelection,
    updateRequirement,
    handleFileSelect,
    handleSourceInputDragEnter,
    handleSourceInputDragOver,
    handleSourceInputDragLeave,
    handleSourceInputDrop,
    clearSourceFile,
    prepareSourceInputForPlanning,
    setSourceImageSelection,
    setAllSourceImagesSelected,
    setMaterialKeep,
    resetSourceInput,
  };
}
