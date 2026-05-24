'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Crop, ImagePlus, Plus, Trash2 } from 'lucide-react';
import {
  notebookProblemImportDraftSchema,
  type NotebookProblemImageAsset,
  type NotebookProblemImportDraft,
  type NotebookProblemType,
} from '@/lib/problem-bank';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ProblemImageCropDialog } from '@/components/problem-bank/problem-image-crop-dialog';

type Locale = 'zh-CN' | 'en-US';

const MAX_PROBLEM_IMAGE_COUNT = 8;
const MAX_PROBLEM_IMAGE_BYTES = 4 * 1024 * 1024;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Failed to read image file.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

function imageAssetsFromPublicContent(
  publicContent: Record<string, unknown>,
): NotebookProblemImageAsset[] {
  const assets =
    publicContent.assets && typeof publicContent.assets === 'object'
      ? (publicContent.assets as Record<string, unknown>)
      : {};
  return Array.isArray(assets.images)
    ? (assets.images.filter(
        (image) =>
          image &&
          typeof image === 'object' &&
          typeof (image as { src?: unknown }).src === 'string',
      ) as NotebookProblemImageAsset[])
    : [];
}

function formatDraftValidationErrors(input: unknown): string[] {
  const parsed = notebookProblemImportDraftSchema.safeParse(input);
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'draft';
    if (issue.message === 'Invalid input') {
      return `字段 ${path} 结构不符合当前题型 schema`;
    }
    return `字段 ${path}: ${issue.message}`;
  });
}

function buildDefaultTypeState(type: NotebookProblemType, locale: Locale, stemHint = '') {
  const defaultStem =
    stemHint || (locale === 'zh-CN' ? '请在此输入题目内容。' : 'Enter the problem statement here.');

  switch (type) {
    case 'short_answer':
      return {
        publicContent: {
          type,
          stem: defaultStem,
        },
        grading: {
          type,
        },
        secretJudge: undefined,
      };
    case 'proof':
      return {
        publicContent: {
          type,
          stem: defaultStem,
        },
        grading: {
          type,
        },
        secretJudge: undefined,
      };
    case 'calculation':
      return {
        publicContent: {
          type,
          stem: defaultStem,
        },
        grading: {
          type,
          acceptedForms: [],
        },
        secretJudge: undefined,
      };
    case 'choice':
      return {
        publicContent: {
          type,
          stem: defaultStem,
          selectionMode: 'single' as const,
          options: [
            {
              id: 'A',
              label: locale === 'zh-CN' ? '选项 A' : 'Option A',
            },
            {
              id: 'B',
              label: locale === 'zh-CN' ? '选项 B' : 'Option B',
            },
          ],
        },
        grading: {
          type,
          correctOptionIds: ['A'],
        },
        secretJudge: undefined,
      };
    case 'fill_blank':
      return {
        publicContent: {
          type,
          stemTemplate:
            locale === 'zh-CN'
              ? `${defaultStem}\n例如：设 A = ____，则 |A| = ____。`
              : `${defaultStem}\nExample: Let A = ____, then |A| = ____.`,
          blanks: [
            {
              id: 'blank_1',
              placeholder: locale === 'zh-CN' ? '第 1 空' : 'Blank 1',
            },
          ],
        },
        grading: {
          type,
          blanks: [
            {
              id: 'blank_1',
              acceptedAnswers: [locale === 'zh-CN' ? '答案' : 'Answer'],
              caseSensitive: false,
            },
          ],
        },
        secretJudge: undefined,
      };
    case 'code':
      return {
        publicContent: {
          type,
          stem: defaultStem,
          language: 'python' as const,
          starterCode: 'def solve():\n    pass\n',
          functionSignature: 'def solve():',
          constraints: [],
          publicTests: [
            {
              id: 'public-1',
              description: locale === 'zh-CN' ? '公开样例 1' : 'Public test 1',
              expression: 'solve()',
              expected: 'TODO',
            },
          ],
          sampleIO: [],
          secretConfigPresent: false,
        },
        grading: {
          type,
          publishRequirementsMet: false,
        },
        secretJudge: {
          language: 'python' as const,
          secretTests: [],
          timeoutMs: 5000,
        },
      };
  }
}

function extractStemHint(draft: Record<string, unknown>): string {
  const publicContent =
    draft.publicContent && typeof draft.publicContent === 'object'
      ? (draft.publicContent as Record<string, unknown>)
      : null;
  if (!publicContent) return '';
  if (typeof publicContent.stem === 'string') return publicContent.stem;
  if (typeof publicContent.stemTemplate === 'string') return publicContent.stemTemplate;
  return '';
}

function cloneDraft(draft: NotebookProblemImportDraft) {
  return JSON.parse(JSON.stringify(draft)) as Record<string, unknown>;
}

function normalizeDraftForValidation(rawDraft: Record<string, unknown>) {
  const draft = JSON.parse(JSON.stringify(rawDraft)) as Record<string, unknown>;
  draft.tags = Array.isArray(draft.tags)
    ? draft.tags
        .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
        .filter((tag) => tag.length > 0)
    : [];

  const type = typeof draft.type === 'string' ? draft.type : 'short_answer';
  const publicContent =
    draft.publicContent && typeof draft.publicContent === 'object'
      ? ({ ...(draft.publicContent as Record<string, unknown>), type } as Record<string, unknown>)
      : { type };
  const grading =
    draft.grading && typeof draft.grading === 'object'
      ? ({ ...(draft.grading as Record<string, unknown>), type } as Record<string, unknown>)
      : { type };

  if (type === 'choice') {
    const options = Array.isArray(publicContent.options)
      ? publicContent.options
          .map((option) => {
            const row =
              option && typeof option === 'object' ? (option as Record<string, unknown>) : {};
            return {
              id: typeof row.id === 'string' ? row.id.trim() : '',
              label: typeof row.label === 'string' ? row.label.trim() : '',
            };
          })
          .filter((option) => option.id && option.label)
      : [];
    publicContent.options = options;
    grading.correctOptionIds = Array.isArray(grading.correctOptionIds)
      ? (grading.correctOptionIds as unknown[])
          .map((id) => (typeof id === 'string' ? id.trim() : ''))
          .filter((id) => options.some((option) => option.id === id))
      : [];
  }

  if (type === 'fill_blank') {
    const blanks = Array.isArray(publicContent.blanks)
      ? publicContent.blanks
          .map((blank) => {
            const row =
              blank && typeof blank === 'object' ? (blank as Record<string, unknown>) : {};
            return {
              id: typeof row.id === 'string' ? row.id.trim() : '',
              placeholder: typeof row.placeholder === 'string' ? row.placeholder.trim() : undefined,
            };
          })
          .filter((blank) => blank.id)
      : [];
    publicContent.blanks = blanks;
    grading.blanks = Array.isArray(grading.blanks)
      ? (grading.blanks as unknown[])
          .map((blank) => {
            const row =
              blank && typeof blank === 'object' ? (blank as Record<string, unknown>) : {};
            return {
              id: typeof row.id === 'string' ? row.id.trim() : '',
              acceptedAnswers: Array.isArray(row.acceptedAnswers)
                ? row.acceptedAnswers
                    .map((answer) => (typeof answer === 'string' ? answer.trim() : ''))
                    .filter((answer) => answer.length > 0)
                : [],
              caseSensitive: Boolean(row.caseSensitive),
            };
          })
          .filter((blank) => blank.id && blank.acceptedAnswers.length > 0)
      : [];
  }

  if (type === 'calculation') {
    grading.acceptedForms = Array.isArray(grading.acceptedForms)
      ? (grading.acceptedForms as unknown[])
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter((item) => item.length > 0)
      : [];
  }

  if (type === 'code') {
    publicContent.constraints = Array.isArray(publicContent.constraints)
      ? (publicContent.constraints as unknown[])
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter((item) => item.length > 0)
      : [];
    publicContent.publicTests = Array.isArray(publicContent.publicTests)
      ? publicContent.publicTests
          .map((test) => {
            const row = test && typeof test === 'object' ? (test as Record<string, unknown>) : {};
            return {
              id: typeof row.id === 'string' ? row.id.trim() : '',
              description: typeof row.description === 'string' ? row.description.trim() : undefined,
              expression: typeof row.expression === 'string' ? row.expression.trim() : '',
              expected: typeof row.expected === 'string' ? row.expected.trim() : '',
            };
          })
          .filter((test) => test.id && test.expression && test.expected)
      : [];

    const secretJudge =
      draft.secretJudge && typeof draft.secretJudge === 'object'
        ? ({ ...(draft.secretJudge as Record<string, unknown>) } as Record<string, unknown>)
        : { language: 'python', secretTests: [], timeoutMs: 5000 };
    secretJudge.secretTests = Array.isArray(secretJudge.secretTests)
      ? (secretJudge.secretTests as unknown[])
          .map((test) => {
            const row = test && typeof test === 'object' ? (test as Record<string, unknown>) : {};
            return {
              id: typeof row.id === 'string' ? row.id.trim() : '',
              description: typeof row.description === 'string' ? row.description.trim() : undefined,
              expression: typeof row.expression === 'string' ? row.expression.trim() : '',
              expected: typeof row.expected === 'string' ? row.expected.trim() : '',
            };
          })
          .filter((test) => test.id && test.expression && test.expected)
      : [];
    secretJudge.timeoutMs =
      typeof secretJudge.timeoutMs === 'number' && Number.isFinite(secretJudge.timeoutMs)
        ? secretJudge.timeoutMs
        : 5000;
    const secretTests = Array.isArray(secretJudge.secretTests)
      ? (secretJudge.secretTests as unknown[])
      : [];
    draft.secretJudge = secretJudge;
    publicContent.secretConfigPresent = secretTests.length > 0;
    grading.publishRequirementsMet =
      typeof publicContent.functionSignature === 'string' &&
      publicContent.functionSignature.trim().length > 0 &&
      Array.isArray(publicContent.publicTests) &&
      publicContent.publicTests.length > 0 &&
      secretTests.length > 0;
  } else {
    delete draft.secretJudge;
  }

  draft.publicContent = publicContent;
  draft.grading = grading;
  draft.validationErrors = formatDraftValidationErrors(draft);
  return draft;
}

function labelForType(type: NotebookProblemType, locale: Locale) {
  const zh = {
    short_answer: '简答题',
    choice: '选择题',
    proof: '证明题',
    calculation: '计算题',
    code: '代码题',
    fill_blank: '填空题',
  } as const;
  const en = {
    short_answer: 'Short answer',
    choice: 'Choice',
    proof: 'Proof',
    calculation: 'Calculation',
    code: 'Code',
    fill_blank: 'Fill blank',
  } as const;
  return locale === 'zh-CN' ? zh[type] : en[type];
}

export function ProblemDraftForm({
  draft,
  locale,
  onSave,
  saveLabel,
  onDraftChange,
}: {
  draft: NotebookProblemImportDraft;
  locale: Locale;
  onSave: (draft: NotebookProblemImportDraft) => void | Promise<void>;
  saveLabel?: string;
  onDraftChange?: (draft: NotebookProblemImportDraft) => void;
}) {
  const [workingDraft, setWorkingDraft] = useState<Record<string, unknown>>(() =>
    cloneDraft(draft),
  );
  const [saveErrors, setSaveErrors] = useState<string[]>([]);
  const [imageAssetError, setImageAssetError] = useState<string | null>(null);
  const [croppingImageIndex, setCroppingImageIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const normalizedDraft = useMemo(() => normalizeDraftForValidation(workingDraft), [workingDraft]);
  const liveErrors = useMemo(
    () => (Array.isArray(normalizedDraft.validationErrors) ? normalizedDraft.validationErrors : []),
    [normalizedDraft.validationErrors],
  );

  useEffect(() => {
    if (!onDraftChange) return;
    const parsed = notebookProblemImportDraftSchema.safeParse(normalizedDraft);
    if (parsed.success) onDraftChange(parsed.data);
  }, [normalizedDraft, onDraftChange]);

  const publicContent =
    workingDraft.publicContent && typeof workingDraft.publicContent === 'object'
      ? (workingDraft.publicContent as Record<string, unknown>)
      : {};
  const imageAssets = imageAssetsFromPublicContent(publicContent);
  const croppingImage =
    croppingImageIndex == null ? null : (imageAssets[croppingImageIndex] ?? null);
  const grading =
    workingDraft.grading && typeof workingDraft.grading === 'object'
      ? (workingDraft.grading as Record<string, unknown>)
      : {};
  const secretJudge =
    workingDraft.secretJudge && typeof workingDraft.secretJudge === 'object'
      ? (workingDraft.secretJudge as Record<string, unknown>)
      : null;

  const updateRoot = (field: string, value: unknown) => {
    setWorkingDraft((prev) => ({ ...prev, [field]: value }));
  };

  const updatePublicContent = (field: string, value: unknown) => {
    setWorkingDraft((prev) => ({
      ...prev,
      publicContent: {
        ...(prev.publicContent && typeof prev.publicContent === 'object'
          ? (prev.publicContent as Record<string, unknown>)
          : {}),
        [field]: value,
      },
    }));
  };

  const updateImageAssets = (images: NotebookProblemImageAsset[]) => {
    setWorkingDraft((prev) => {
      const prevPublicContent =
        prev.publicContent && typeof prev.publicContent === 'object'
          ? (prev.publicContent as Record<string, unknown>)
          : {};
      const prevAssets =
        prevPublicContent.assets && typeof prevPublicContent.assets === 'object'
          ? (prevPublicContent.assets as Record<string, unknown>)
          : {};
      return {
        ...prev,
        publicContent: {
          ...prevPublicContent,
          assets: {
            ...prevAssets,
            images,
          },
        },
      };
    });
  };

  const updateGrading = (field: string, value: unknown) => {
    setWorkingDraft((prev) => ({
      ...prev,
      grading: {
        ...(prev.grading && typeof prev.grading === 'object'
          ? (prev.grading as Record<string, unknown>)
          : {}),
        [field]: value,
      },
    }));
  };

  const updateSecretJudge = (field: string, value: unknown) => {
    setWorkingDraft((prev) => ({
      ...prev,
      secretJudge: {
        ...(prev.secretJudge && typeof prev.secretJudge === 'object'
          ? (prev.secretJudge as Record<string, unknown>)
          : { language: 'python', secretTests: [], timeoutMs: 5000 }),
        [field]: value,
      },
    }));
  };

  const applyCroppedImage = (nextImage: NotebookProblemImageAsset) => {
    if (croppingImageIndex == null) return;
    updateImageAssets(
      imageAssets.map((image, index) => (index === croppingImageIndex ? nextImage : image)),
    );
    setCroppingImageIndex(null);
    setImageAssetError(null);
  };

  const currentType = (workingDraft.type as NotebookProblemType) || 'short_answer';

  const handleTypeChange = (nextType: NotebookProblemType) => {
    const defaults = buildDefaultTypeState(nextType, locale, extractStemHint(workingDraft));
    const existingAssets =
      publicContent.assets && typeof publicContent.assets === 'object'
        ? { assets: publicContent.assets }
        : {};
    setWorkingDraft((prev) => ({
      ...prev,
      type: nextType,
      publicContent: {
        ...defaults.publicContent,
        ...existingAssets,
      },
      grading: defaults.grading,
      secretJudge: defaults.secretJudge,
    }));
  };

  const handleSave = async () => {
    const parsed = notebookProblemImportDraftSchema.safeParse(normalizedDraft);
    if (!parsed.success) {
      setSaveErrors(formatDraftValidationErrors(normalizedDraft));
      return;
    }
    setSaveErrors([]);
    setSaving(true);
    try {
      await onSave(parsed.data);
    } finally {
      setSaving(false);
    }
  };

  const handleAddImage = async (files: FileList | null) => {
    const file = Array.from(files || []).find((item) => item.type.startsWith('image/'));
    if (!file) {
      setImageAssetError(locale === 'zh-CN' ? '请选择图片文件。' : 'Choose an image file.');
      return;
    }
    if (imageAssets.length >= MAX_PROBLEM_IMAGE_COUNT) {
      setImageAssetError(
        locale === 'zh-CN'
          ? `每道题最多 ${MAX_PROBLEM_IMAGE_COUNT} 张图片。`
          : `Each problem can have up to ${MAX_PROBLEM_IMAGE_COUNT} images.`,
      );
      return;
    }
    if (file.size > MAX_PROBLEM_IMAGE_BYTES) {
      setImageAssetError(
        locale === 'zh-CN'
          ? `${file.name} 超过 4 MB，先压缩一下再上传。`
          : `${file.name} is larger than 4 MB. Compress it before uploading.`,
      );
      return;
    }

    try {
      const src = await readFileAsDataUrl(file);
      const name = file.name.trim() || (locale === 'zh-CN' ? '题目图片' : 'Problem image');
      updateImageAssets([
        ...imageAssets,
        {
          id: `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
          src,
          alt: name,
          caption: name,
          mimeType: file.type || 'image/*',
          role: 'question',
        },
      ]);
      setImageAssetError(null);
    } catch (error) {
      setImageAssetError(error instanceof Error ? error.message : 'Failed to read image file.');
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
            {locale === 'zh-CN' ? '手动题目编辑器' : 'Manual problem editor'}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {locale === 'zh-CN'
              ? '通过表单填写题目，不需要手改 JSON。'
              : 'Fill out the problem with form fields instead of editing JSON.'}
          </p>
        </div>
        <Button type="button" onClick={handleSave} disabled={saving} className="ml-auto shrink-0">
          {saveLabel || (locale === 'zh-CN' ? '保存表单草稿' : 'Save form draft')}
        </Button>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
          {locale === 'zh-CN' ? '题目标题' : 'Title'}
        </label>
        <Input
          value={typeof workingDraft.title === 'string' ? workingDraft.title : ''}
          onChange={(event) => updateRoot('title', event.target.value)}
        />
      </div>

      {currentType === 'short_answer' ||
      currentType === 'proof' ||
      currentType === 'calculation' ||
      currentType === 'code' ||
      currentType === 'choice' ? (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
            {locale === 'zh-CN' ? '题面' : 'Problem statement'}
          </label>
          <Textarea
            className="min-h-[140px]"
            value={typeof publicContent.stem === 'string' ? publicContent.stem : ''}
            onChange={(event) => updatePublicContent('stem', event.target.value)}
          />
        </div>
      ) : null}

      {currentType === 'fill_blank' ? (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
            {locale === 'zh-CN' ? '题面模板' : 'Stem template'}
          </label>
          <Textarea
            className="min-h-[140px]"
            value={typeof publicContent.stemTemplate === 'string' ? publicContent.stemTemplate : ''}
            onChange={(event) => updatePublicContent('stemTemplate', event.target.value)}
          />
        </div>
      ) : null}

      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-900/40">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {locale === 'zh-CN' ? '题目图片' : 'Problem images'}
            </label>
            <p className="mt-0.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
              {locale === 'zh-CN'
                ? '用于题面里的图表、原题截图或补充条件。'
                : 'Use this for diagrams, source screenshots, or visual context.'}
            </p>
          </div>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              void handleAddImage(event.target.files);
              event.target.value = '';
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => imageInputRef.current?.click()}
            disabled={imageAssets.length >= MAX_PROBLEM_IMAGE_COUNT}
          >
            <ImagePlus className="mr-2 h-4 w-4" />
            {locale === 'zh-CN' ? '添加图片' : 'Add image'}
          </Button>
        </div>

        {imageAssetError ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
            {imageAssetError}
          </p>
        ) : null}

        {imageAssets.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {imageAssets.map((image, index) => (
              <div
                key={`${image.id}-${index}`}
                className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950"
              >
                <button
                  type="button"
                  className="group relative flex min-h-[160px] w-full items-center justify-center bg-slate-100 p-2 text-left transition hover:bg-slate-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:bg-slate-900 dark:hover:bg-slate-800"
                  onClick={() => setCroppingImageIndex(index)}
                  aria-label={
                    locale === 'zh-CN'
                      ? `裁剪图片 ${image.caption || image.alt || image.id}`
                      : `Crop image ${image.caption || image.alt || image.id}`
                  }
                >
                  <img
                    src={image.src}
                    alt={image.alt || image.caption || image.id}
                    className="max-h-[260px] w-full rounded-md object-contain"
                  />
                  <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-slate-950/75 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-visible:opacity-100">
                    <Crop className="h-3.5 w-3.5" />
                    {locale === 'zh-CN' ? '裁剪' : 'Crop'}
                  </span>
                </button>
                <div className="space-y-2 p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      value={image.caption || ''}
                      onChange={(event) => {
                        const value = event.target.value.trim();
                        updateImageAssets(
                          imageAssets.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, caption: value || undefined } : row,
                          ),
                        );
                      }}
                      placeholder={locale === 'zh-CN' ? '图片说明' : 'Caption'}
                    />
                    <Input
                      value={image.alt || ''}
                      onChange={(event) => {
                        const value = event.target.value.trim();
                        updateImageAssets(
                          imageAssets.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, alt: value || undefined } : row,
                          ),
                        );
                      }}
                      placeholder={locale === 'zh-CN' ? '替代文本' : 'Alt text'}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="min-w-0 truncate">
                      {image.sourceImageId ||
                        image.mimeType ||
                        (locale === 'zh-CN' ? '手动添加' : 'Manually added')}
                      {image.pageNumber ? ` · page ${image.pageNumber}` : ''}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-300 dark:hover:bg-rose-950/30"
                      onClick={() =>
                        updateImageAssets(imageAssets.filter((_, rowIndex) => rowIndex !== index))
                      }
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      {locale === 'zh-CN' ? '删除' : 'Remove'}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-slate-200 bg-white/70 px-3 py-4 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-400">
            {locale === 'zh-CN'
              ? '这道题目前没有绑定图片。'
              : 'No images are attached to this problem.'}
          </p>
        )}
      </div>

      {currentType === 'choice' ? (
        <>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {locale === 'zh-CN' ? '选择模式' : 'Selection mode'}
            </label>
            <select
              value={publicContent.selectionMode === 'multiple' ? 'multiple' : 'single'}
              onChange={(event) => updatePublicContent('selectionMode', event.target.value)}
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="single">{locale === 'zh-CN' ? '单选' : 'Single'}</option>
              <option value="multiple">{locale === 'zh-CN' ? '多选' : 'Multiple'}</option>
            </select>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {locale === 'zh-CN' ? '选项' : 'Options'}
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const options = Array.isArray(publicContent.options)
                    ? ([...(publicContent.options as Array<Record<string, unknown>>)] as Array<
                        Record<string, unknown>
                      >)
                    : [];
                  const nextId = String.fromCharCode(65 + options.length);
                  updatePublicContent('options', [
                    ...options,
                    {
                      id: nextId,
                      label: locale === 'zh-CN' ? `选项 ${nextId}` : `Option ${nextId}`,
                    },
                  ]);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                {locale === 'zh-CN' ? '添加选项' : 'Add option'}
              </Button>
            </div>
            {Array.isArray(publicContent.options)
              ? (publicContent.options as Array<Record<string, unknown>>).map((option, index) => {
                  const correctOptionIds = Array.isArray(grading.correctOptionIds)
                    ? (grading.correctOptionIds as string[])
                    : [];
                  return (
                    <div
                      key={`${String(option.id || index)}`}
                      className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-[90px_1fr_auto_auto] dark:border-slate-700"
                    >
                      <Input
                        value={typeof option.id === 'string' ? option.id : ''}
                        onChange={(event) => {
                          const nextId = event.target.value;
                          const oldId = typeof option.id === 'string' ? option.id : '';
                          updatePublicContent(
                            'options',
                            (publicContent.options as Array<Record<string, unknown>>).map(
                              (row, rowIndex) =>
                                rowIndex === index ? { ...row, id: nextId } : row,
                            ),
                          );
                          updateGrading(
                            'correctOptionIds',
                            correctOptionIds.map((id) => (id === oldId ? nextId : id)),
                          );
                        }}
                        placeholder="A"
                      />
                      <Input
                        value={typeof option.label === 'string' ? option.label : ''}
                        onChange={(event) =>
                          updatePublicContent(
                            'options',
                            (publicContent.options as Array<Record<string, unknown>>).map(
                              (row, rowIndex) =>
                                rowIndex === index ? { ...row, label: event.target.value } : row,
                            ),
                          )
                        }
                      />
                      <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <input
                          type={publicContent.selectionMode === 'multiple' ? 'checkbox' : 'radio'}
                          name={`correct-option-${draft.draftId}`}
                          checked={correctOptionIds.includes(String(option.id || ''))}
                          onChange={(event) => {
                            const optionId = String(option.id || '');
                            if (publicContent.selectionMode === 'multiple') {
                              updateGrading(
                                'correctOptionIds',
                                event.target.checked
                                  ? [...correctOptionIds, optionId]
                                  : correctOptionIds.filter((id) => id !== optionId),
                              );
                            } else {
                              updateGrading('correctOptionIds', [optionId]);
                            }
                          }}
                        />
                        {locale === 'zh-CN' ? '正确答案' : 'Correct'}
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const optionId = String(option.id || '');
                          updatePublicContent(
                            'options',
                            (publicContent.options as Array<Record<string, unknown>>).filter(
                              (_, rowIndex) => rowIndex !== index,
                            ),
                          );
                          updateGrading(
                            'correctOptionIds',
                            correctOptionIds.filter((id) => id !== optionId),
                          );
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })
              : null}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {locale === 'zh-CN' ? '解析' : 'Analysis'}
            </label>
            <Textarea
              value={typeof grading.analysis === 'string' ? grading.analysis : ''}
              onChange={(event) => updateGrading('analysis', event.target.value)}
            />
          </div>
        </>
      ) : null}

      {currentType === 'short_answer' ? (
        <>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {locale === 'zh-CN' ? '参考答案' : 'Reference answer'}
            </label>
            <Textarea
              value={typeof grading.referenceAnswer === 'string' ? grading.referenceAnswer : ''}
              onChange={(event) => updateGrading('referenceAnswer', event.target.value)}
            />
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {locale === 'zh-CN' ? '评分规则' : 'Rubric'}
              </label>
              <Textarea
                value={typeof grading.rubric === 'string' ? grading.rubric : ''}
                onChange={(event) => updateGrading('rubric', event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {locale === 'zh-CN' ? '解析' : 'Analysis'}
              </label>
              <Textarea
                value={typeof grading.analysis === 'string' ? grading.analysis : ''}
                onChange={(event) => updateGrading('analysis', event.target.value)}
              />
            </div>
          </div>
        </>
      ) : null}

      {currentType === 'proof' ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {locale === 'zh-CN' ? '参考证明' : 'Reference proof'}
            </label>
            <Textarea
              value={typeof grading.referenceProof === 'string' ? grading.referenceProof : ''}
              onChange={(event) => updateGrading('referenceProof', event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {locale === 'zh-CN' ? '评分规则 / 解析' : 'Rubric / analysis'}
            </label>
            <Textarea
              value={`${typeof grading.rubric === 'string' ? grading.rubric : ''}${
                grading.analysis ? `\n\n${String(grading.analysis)}` : ''
              }`}
              onChange={(event) => {
                const value = event.target.value;
                updateGrading('rubric', value);
                updateGrading('analysis', value);
              }}
            />
          </div>
        </div>
      ) : null}

      {currentType === 'calculation' ? (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {locale === 'zh-CN' ? '参考答案' : 'Reference answer'}
              </label>
              <Input
                value={typeof grading.referenceAnswer === 'string' ? grading.referenceAnswer : ''}
                onChange={(event) => updateGrading('referenceAnswer', event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {locale === 'zh-CN' ? '单位' : 'Unit'}
              </label>
              <Input
                value={typeof publicContent.unit === 'string' ? publicContent.unit : ''}
                onChange={(event) => {
                  updatePublicContent('unit', event.target.value);
                  updateGrading('unit', event.target.value);
                }}
              />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {locale === 'zh-CN' ? '可接受形式（每行一个）' : 'Accepted forms (one per line)'}
              </label>
              <Textarea
                value={
                  Array.isArray(grading.acceptedForms)
                    ? (grading.acceptedForms as string[]).join('\n')
                    : ''
                }
                onChange={(event) =>
                  updateGrading(
                    'acceptedForms',
                    event.target.value
                      .split('\n')
                      .map((item) => item.trim())
                      .filter(Boolean),
                  )
                }
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {locale === 'zh-CN' ? '容差（可选）' : 'Tolerance (optional)'}
              </label>
              <Input
                type="number"
                step="any"
                value={typeof grading.tolerance === 'number' ? String(grading.tolerance) : ''}
                onChange={(event) =>
                  updateGrading(
                    'tolerance',
                    event.target.value === '' ? undefined : Number(event.target.value),
                  )
                }
              />
            </div>
          </div>
        </>
      ) : null}

      {currentType === 'fill_blank' ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {locale === 'zh-CN' ? '填空项' : 'Blanks'}
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const blanks = Array.isArray(publicContent.blanks)
                  ? ([...(publicContent.blanks as Array<Record<string, unknown>>)] as Array<
                      Record<string, unknown>
                    >)
                  : [];
                const gradingBlanks = Array.isArray(grading.blanks)
                  ? ([...(grading.blanks as Array<Record<string, unknown>>)] as Array<
                      Record<string, unknown>
                    >)
                  : [];
                const nextId = `blank_${blanks.length + 1}`;
                updatePublicContent('blanks', [
                  ...blanks,
                  {
                    id: nextId,
                    placeholder:
                      locale === 'zh-CN'
                        ? `第 ${blanks.length + 1} 空`
                        : `Blank ${blanks.length + 1}`,
                  },
                ]);
                updateGrading('blanks', [
                  ...gradingBlanks,
                  {
                    id: nextId,
                    acceptedAnswers: [locale === 'zh-CN' ? '答案' : 'Answer'],
                    caseSensitive: false,
                  },
                ]);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              {locale === 'zh-CN' ? '添加填空' : 'Add blank'}
            </Button>
          </div>
          {Array.isArray(publicContent.blanks)
            ? (publicContent.blanks as Array<Record<string, unknown>>).map((blank, index) => {
                const gradingBlanks = Array.isArray(grading.blanks)
                  ? (grading.blanks as Array<Record<string, unknown>>)
                  : [];
                const gradingBlank = gradingBlanks[index] || {};
                const blankId = String(blank.id || `blank_${index + 1}`);
                return (
                  <div
                    key={blankId}
                    className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-[120px_1fr_1fr_auto] dark:border-slate-700"
                  >
                    <Input
                      value={blankId}
                      onChange={(event) => {
                        const nextId = event.target.value;
                        updatePublicContent(
                          'blanks',
                          (publicContent.blanks as Array<Record<string, unknown>>).map(
                            (row, rowIndex) => (rowIndex === index ? { ...row, id: nextId } : row),
                          ),
                        );
                        updateGrading(
                          'blanks',
                          gradingBlanks.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, id: nextId } : row,
                          ),
                        );
                      }}
                    />
                    <Input
                      value={typeof blank.placeholder === 'string' ? blank.placeholder : ''}
                      onChange={(event) =>
                        updatePublicContent(
                          'blanks',
                          (publicContent.blanks as Array<Record<string, unknown>>).map(
                            (row, rowIndex) =>
                              rowIndex === index
                                ? { ...row, placeholder: event.target.value }
                                : row,
                          ),
                        )
                      }
                      placeholder={locale === 'zh-CN' ? '占位提示' : 'Placeholder'}
                    />
                    <Input
                      value={
                        Array.isArray(gradingBlank.acceptedAnswers)
                          ? (gradingBlank.acceptedAnswers as string[]).join(', ')
                          : ''
                      }
                      onChange={(event) =>
                        updateGrading(
                          'blanks',
                          gradingBlanks.map((row, rowIndex) =>
                            rowIndex === index
                              ? {
                                  ...row,
                                  acceptedAnswers: event.target.value
                                    .split(',')
                                    .map((item) => item.trim())
                                    .filter(Boolean),
                                }
                              : row,
                          ),
                        )
                      }
                      placeholder={locale === 'zh-CN' ? '可接受答案，逗号分隔' : 'Accepted answers'}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        updatePublicContent(
                          'blanks',
                          (publicContent.blanks as Array<Record<string, unknown>>).filter(
                            (_, rowIndex) => rowIndex !== index,
                          ),
                        );
                        updateGrading(
                          'blanks',
                          gradingBlanks.filter((_, rowIndex) => rowIndex !== index),
                        );
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })
            : null}
        </div>
      ) : null}

      {currentType === 'code' ? (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Python
              </label>
              <Input value="python" disabled />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {locale === 'zh-CN' ? '函数签名' : 'Function signature'}
              </label>
              <Input
                value={
                  typeof publicContent.functionSignature === 'string'
                    ? publicContent.functionSignature
                    : ''
                }
                onChange={(event) => updatePublicContent('functionSignature', event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {locale === 'zh-CN' ? '起始代码' : 'Starter code'}
            </label>
            <Textarea
              className="min-h-[180px] font-mono text-xs"
              value={typeof publicContent.starterCode === 'string' ? publicContent.starterCode : ''}
              onChange={(event) => updatePublicContent('starterCode', event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {locale === 'zh-CN' ? '约束（每行一个）' : 'Constraints (one per line)'}
            </label>
            <Textarea
              value={
                Array.isArray(publicContent.constraints)
                  ? (publicContent.constraints as string[]).join('\n')
                  : ''
              }
              onChange={(event) =>
                updatePublicContent(
                  'constraints',
                  event.target.value
                    .split('\n')
                    .map((item) => item.trim())
                    .filter(Boolean),
                )
              }
            />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {locale === 'zh-CN' ? '公开测试' : 'Public tests'}
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const tests = Array.isArray(publicContent.publicTests)
                    ? ([...(publicContent.publicTests as Array<Record<string, unknown>>)] as Array<
                        Record<string, unknown>
                      >)
                    : [];
                  updatePublicContent('publicTests', [
                    ...tests,
                    {
                      id: `public-${tests.length + 1}`,
                      description:
                        locale === 'zh-CN'
                          ? `公开测试 ${tests.length + 1}`
                          : `Public test ${tests.length + 1}`,
                      expression: 'solve()',
                      expected: 'TODO',
                    },
                  ]);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                {locale === 'zh-CN' ? '添加公开测试' : 'Add public test'}
              </Button>
            </div>
            {Array.isArray(publicContent.publicTests)
              ? (publicContent.publicTests as Array<Record<string, unknown>>).map((test, index) => (
                  <div
                    key={String(test.id || index)}
                    className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-2 dark:border-slate-700"
                  >
                    <Input
                      value={typeof test.id === 'string' ? test.id : ''}
                      onChange={(event) =>
                        updatePublicContent(
                          'publicTests',
                          (publicContent.publicTests as Array<Record<string, unknown>>).map(
                            (row, rowIndex) =>
                              rowIndex === index ? { ...row, id: event.target.value } : row,
                          ),
                        )
                      }
                      placeholder="public-1"
                    />
                    <Input
                      value={typeof test.description === 'string' ? test.description : ''}
                      onChange={(event) =>
                        updatePublicContent(
                          'publicTests',
                          (publicContent.publicTests as Array<Record<string, unknown>>).map(
                            (row, rowIndex) =>
                              rowIndex === index
                                ? { ...row, description: event.target.value }
                                : row,
                          ),
                        )
                      }
                      placeholder={locale === 'zh-CN' ? '描述' : 'Description'}
                    />
                    <Input
                      value={typeof test.expression === 'string' ? test.expression : ''}
                      onChange={(event) =>
                        updatePublicContent(
                          'publicTests',
                          (publicContent.publicTests as Array<Record<string, unknown>>).map(
                            (row, rowIndex) =>
                              rowIndex === index ? { ...row, expression: event.target.value } : row,
                          ),
                        )
                      }
                      placeholder="solve()"
                    />
                    <div className="flex gap-2">
                      <Input
                        value={typeof test.expected === 'string' ? test.expected : ''}
                        onChange={(event) =>
                          updatePublicContent(
                            'publicTests',
                            (publicContent.publicTests as Array<Record<string, unknown>>).map(
                              (row, rowIndex) =>
                                rowIndex === index ? { ...row, expected: event.target.value } : row,
                            ),
                          )
                        }
                        placeholder={locale === 'zh-CN' ? '期望输出' : 'Expected'}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          updatePublicContent(
                            'publicTests',
                            (publicContent.publicTests as Array<Record<string, unknown>>).filter(
                              (_, rowIndex) => rowIndex !== index,
                            ),
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              : null}
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {locale === 'zh-CN' ? '隐藏测试' : 'Secret tests'}
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const tests =
                    secretJudge && Array.isArray(secretJudge.secretTests)
                      ? ([...(secretJudge.secretTests as Array<Record<string, unknown>>)] as Array<
                          Record<string, unknown>
                        >)
                      : [];
                  updateSecretJudge('secretTests', [
                    ...tests,
                    {
                      id: `secret-${tests.length + 1}`,
                      description:
                        locale === 'zh-CN'
                          ? `隐藏测试 ${tests.length + 1}`
                          : `Secret test ${tests.length + 1}`,
                      expression: 'solve()',
                      expected: 'TODO',
                    },
                  ]);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                {locale === 'zh-CN' ? '添加隐藏测试' : 'Add secret test'}
              </Button>
            </div>
            {secretJudge && Array.isArray(secretJudge.secretTests)
              ? (secretJudge.secretTests as Array<Record<string, unknown>>).map((test, index) => (
                  <div
                    key={String(test.id || index)}
                    className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-2 dark:border-slate-700"
                  >
                    <Input
                      value={typeof test.id === 'string' ? test.id : ''}
                      onChange={(event) =>
                        updateSecretJudge(
                          'secretTests',
                          (secretJudge.secretTests as Array<Record<string, unknown>>).map(
                            (row, rowIndex) =>
                              rowIndex === index ? { ...row, id: event.target.value } : row,
                          ),
                        )
                      }
                      placeholder="secret-1"
                    />
                    <Input
                      value={typeof test.description === 'string' ? test.description : ''}
                      onChange={(event) =>
                        updateSecretJudge(
                          'secretTests',
                          (secretJudge.secretTests as Array<Record<string, unknown>>).map(
                            (row, rowIndex) =>
                              rowIndex === index
                                ? { ...row, description: event.target.value }
                                : row,
                          ),
                        )
                      }
                      placeholder={locale === 'zh-CN' ? '描述' : 'Description'}
                    />
                    <Input
                      value={typeof test.expression === 'string' ? test.expression : ''}
                      onChange={(event) =>
                        updateSecretJudge(
                          'secretTests',
                          (secretJudge.secretTests as Array<Record<string, unknown>>).map(
                            (row, rowIndex) =>
                              rowIndex === index ? { ...row, expression: event.target.value } : row,
                          ),
                        )
                      }
                      placeholder="solve()"
                    />
                    <div className="flex gap-2">
                      <Input
                        value={typeof test.expected === 'string' ? test.expected : ''}
                        onChange={(event) =>
                          updateSecretJudge(
                            'secretTests',
                            (secretJudge.secretTests as Array<Record<string, unknown>>).map(
                              (row, rowIndex) =>
                                rowIndex === index ? { ...row, expected: event.target.value } : row,
                            ),
                          )
                        }
                        placeholder={locale === 'zh-CN' ? '期望输出' : 'Expected'}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          updateSecretJudge(
                            'secretTests',
                            (secretJudge.secretTests as Array<Record<string, unknown>>).filter(
                              (_, rowIndex) => rowIndex !== index,
                            ),
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              : null}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {locale === 'zh-CN' ? '运行超时（毫秒）' : 'Timeout (ms)'}
            </label>
            <Input
              type="number"
              min={1}
              max={20000}
              value={
                secretJudge && typeof secretJudge.timeoutMs === 'number'
                  ? String(secretJudge.timeoutMs)
                  : '5000'
              }
              onChange={(event) =>
                updateSecretJudge('timeoutMs', Number(event.target.value || 5000))
              }
            />
          </div>
        </>
      ) : null}

      {liveErrors.length > 0 || saveErrors.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
          <div className="font-medium">{locale === 'zh-CN' ? '待修正字段' : 'Fields to fix'}</div>
          <div className="mt-2 space-y-1">
            {(saveErrors.length > 0 ? saveErrors : liveErrors).map((error, index) => (
              <p key={`${draft.draftId}-editor-error-${index}`}>{error}</p>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200">
          {locale === 'zh-CN'
            ? '当前表单已通过 schema 校验，保存后可直接写入题库。'
            : 'The current form passes schema validation and can be committed after saving.'}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/40">
        <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
          {locale === 'zh-CN' ? '题目设置' : 'Problem settings'}
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {locale === 'zh-CN' ? '题型' : 'Type'}
            </label>
            <select
              value={currentType}
              onChange={(event) => handleTypeChange(event.target.value as NotebookProblemType)}
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              {(
                [
                  'short_answer',
                  'choice',
                  'proof',
                  'calculation',
                  'fill_blank',
                  'code',
                ] as NotebookProblemType[]
              ).map((type) => (
                <option key={type} value={type}>
                  {labelForType(type, locale)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {locale === 'zh-CN' ? '状态' : 'Status'}
            </label>
            <select
              value={typeof workingDraft.status === 'string' ? workingDraft.status : 'draft'}
              onChange={(event) => updateRoot('status', event.target.value)}
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="draft">{locale === 'zh-CN' ? '草稿' : 'Draft'}</option>
              <option value="published">{locale === 'zh-CN' ? '已发布' : 'Published'}</option>
              <option value="archived">{locale === 'zh-CN' ? '已归档' : 'Archived'}</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {locale === 'zh-CN' ? '难度' : 'Difficulty'}
            </label>
            <select
              value={
                typeof workingDraft.difficulty === 'string' ? workingDraft.difficulty : 'medium'
              }
              onChange={(event) => updateRoot('difficulty', event.target.value)}
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="easy">{locale === 'zh-CN' ? '简单' : 'Easy'}</option>
              <option value="medium">{locale === 'zh-CN' ? '中等' : 'Medium'}</option>
              <option value="hard">{locale === 'zh-CN' ? '困难' : 'Hard'}</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {locale === 'zh-CN' ? '分值' : 'Points'}
            </label>
            <Input
              type="number"
              min={0}
              value={typeof workingDraft.points === 'number' ? String(workingDraft.points) : '1'}
              onChange={(event) => updateRoot('points', Number(event.target.value || 0))}
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {locale === 'zh-CN' ? '标签' : 'Tags'}
            </label>
            <Input
              value={
                Array.isArray(workingDraft.tags) ? (workingDraft.tags as string[]).join(', ') : ''
              }
              onChange={(event) =>
                updateRoot(
                  'tags',
                  event.target.value
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean),
                )
              }
              placeholder={locale === 'zh-CN' ? '用逗号分隔，例如 集合, 证明' : 'Comma separated'}
            />
          </div>
        </div>
      </div>

      <ProblemImageCropDialog
        image={croppingImage}
        open={croppingImage != null}
        locale={locale}
        onOpenChange={(open) => {
          if (!open) setCroppingImageIndex(null);
        }}
        onApply={applyCroppedImage}
      />
    </div>
  );
}
