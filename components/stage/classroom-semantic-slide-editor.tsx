'use client';

import { useMemo, useState } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import {
  compileSyntaraMarkupToNotebookDocument,
  normalizeSyntaraMarkupLayout,
  type NotebookContentDocument,
} from '@/lib/notebook-content';
import { normalizeSemanticDocumentForRender } from '@/lib/notebook-content/semantic-slide-render';
import type { Scene } from '@/lib/types/stage';
import { cn } from '@/lib/utils';
import { SemanticScrollPage } from './semantic-scroll-page';
import { serializeNotebookDocumentToSyntaraMarkup } from './raw-view-helpers';

interface ClassroomSemanticSlideEditorProps {
  readonly currentScene: Scene;
  readonly onSaveMarkup: (markup: string, document: NotebookContentDocument) => void;
  readonly onClose: () => void;
}

function sourceFromScene(scene: Scene): string {
  const content = scene.content.type === 'slide' ? scene.content : null;
  if (!content) return '';
  if (content.syntaraMarkup?.trim()) return normalizeSyntaraMarkupLayout(content.syntaraMarkup);
  if (content.semanticDocument) {
    return normalizeSyntaraMarkupLayout(
      serializeNotebookDocumentToSyntaraMarkup(content.semanticDocument),
    );
  }
  return '';
}

export function ClassroomSemanticSlideEditor({
  currentScene,
  onSaveMarkup,
  onClose,
}: ClassroomSemanticSlideEditorProps) {
  const [draft, setDraft] = useState(() => sourceFromScene(currentScene));
  const [savedSource, setSavedSource] = useState(() => sourceFromScene(currentScene));

  const compiled = useMemo(() => {
    const trimmed = draft.trim();
    if (!trimmed) {
      return {
        document: null,
        normalizedMarkup: '',
        error: 'Syntara Markup 不能为空。',
      };
    }

    try {
      const normalizedMarkup = normalizeSyntaraMarkupLayout(trimmed);
      const document = compileSyntaraMarkupToNotebookDocument(normalizedMarkup, {
        title: currentScene.title,
        language:
          currentScene.content.type === 'slide'
            ? currentScene.content.semanticDocument?.language
            : undefined,
      });
      if (!document) {
        return {
          document: null,
          normalizedMarkup,
          error: '无法解析为有效的 Syntara Markup。请检查 \\begin{slide}、大括号和环境闭合。',
        };
      }
      return { document, normalizedMarkup, error: null };
    } catch (error) {
      return {
        document: null,
        normalizedMarkup: trimmed,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [currentScene.content, currentScene.title, draft]);

  const previewDocument = useMemo(
    () => (compiled.document ? normalizeSemanticDocumentForRender(compiled.document) : null),
    [compiled.document],
  );
  const hasChanges = draft.trim() !== savedSource.trim();

  const handleSave = () => {
    if (!compiled.document) return;
    onSaveMarkup(compiled.normalizedMarkup, compiled.document);
    setDraft(compiled.normalizedMarkup);
    setSavedSource(compiled.normalizedMarkup);
  };

  const handleReset = () => setDraft(savedSource);

  return (
    <div className="flex h-full min-h-0 gap-4 overflow-hidden bg-slate-100/80 p-4">
      <section className="flex min-h-0 w-[44%] min-w-[420px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-950">Syntara Markup</p>
            <p className="mt-0.5 text-xs text-slate-500">
              新链路：Markup → semantic document → 页面渲染
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              disabled={!hasChanges}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold',
                hasChanges
                  ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  : 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300',
              )}
            >
              <RotateCcw className="size-3.5" />
              还原
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!compiled.document}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold',
                compiled.document
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300',
              )}
            >
              <Check className="size-3.5" />
              保存并渲染
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <X className="size-3.5" />
              完成
            </button>
          </div>
        </div>

        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          spellCheck={false}
          className="min-h-0 flex-1 resize-none border-0 bg-slate-950 p-4 font-mono text-[13px] leading-6 text-slate-100 outline-none"
        />

        <div
          className={cn(
            'border-t px-4 py-2 text-xs',
            compiled.error
              ? 'border-rose-200 bg-rose-50 text-rose-700'
              : hasChanges
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700',
          )}
        >
          {compiled.error
            ? compiled.error
            : hasChanges
              ? '预览已更新，点击“保存并渲染”写回当前页。'
              : '当前源已保存。'}
        </div>
      </section>

      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <p className="text-sm font-semibold text-slate-950">实时预览</p>
          <p className="mt-0.5 text-xs text-slate-500">
            这里预览的是 semantic scroll 页面，不再进入旧 canvas 编辑链路。
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {previewDocument ? (
            <SemanticScrollPage
              document={previewDocument}
              sceneId={currentScene.id}
              title={previewDocument.title || currentScene.title}
            />
          ) : (
            <div className="flex h-full items-center justify-center px-8 text-center text-sm text-slate-500">
              修正左侧 Syntara Markup 后会恢复预览。
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
