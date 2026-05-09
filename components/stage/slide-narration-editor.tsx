'use client';

import { useEffect, useMemo, useState } from 'react';
import { nanoid } from 'nanoid';
import { Plus, Save, Trash2, Volume2 } from 'lucide-react';
import { toast } from '@/lib/notifications/client-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ThumbnailSlide } from '@/components/slide-renderer/components/ThumbnailSlide';
import type { Action, SpeechAction } from '@/lib/types/action';
import type { Scene } from '@/lib/types/stage';
import { verbalizeNarrationText } from '@/lib/audio/spoken-text';

type DraftSpeechSegment = {
  id: string;
  text: string;
};

function summarizeNonSpeechActions(actions: Action[]): string[] {
  const counts = new Map<string, number>();
  for (const action of actions) {
    if (action.type === 'speech') continue;
    counts.set(action.type, (counts.get(action.type) || 0) + 1);
  }

  const labels: Record<string, string> = {
    spotlight: '聚焦',
    laser: '激光笔',
    discussion: '讨论',
    play_video: '视频播放',
    wb_open: '白板打开',
    wb_close: '白板关闭',
    wb_clear: '白板清空',
    wb_draw_text: '白板文字',
    wb_draw_shape: '白板图形',
    wb_draw_chart: '白板图表',
    wb_draw_latex: '白板公式',
    wb_draw_table: '白板表格',
    wb_draw_line: '白板线条',
    wb_delete: '白板删除',
  };

  return Array.from(counts.entries()).map(
    ([type, count]) => `${labels[type] || type} ${count} 个`,
  );
}

export function SlideNarrationEditor({
  scene,
  sceneIndex,
  totalScenes,
  language,
  canGoPrev,
  canGoNext,
  onGoPrev,
  onGoNext,
  onSaveActions,
}: {
  scene: Scene;
  sceneIndex: number;
  totalScenes: number;
  language?: string;
  canGoPrev: boolean;
  canGoNext: boolean;
  onGoPrev: () => void;
  onGoNext: () => void;
  onSaveActions: (nextActions: Action[]) => void;
}) {
  const speechActions = useMemo(
    () => (scene.actions || []).filter((action): action is SpeechAction => action.type === 'speech'),
    [scene.actions],
  );
  const nonSpeechSummary = useMemo(
    () => summarizeNonSpeechActions(scene.actions || []),
    [scene.actions],
  );

  const sourceSegments = useMemo<DraftSpeechSegment[]>(
    () => speechActions.map((action) => ({ id: action.id, text: action.text || '' })),
    [speechActions],
  );
  const [segments, setSegments] = useState<DraftSpeechSegment[]>(sourceSegments);
  const [previewing, setPreviewing] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle');

  useEffect(() => {
    setSegments(sourceSegments);
    setSaveState('idle');
  }, [scene.id, sourceSegments]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const sourceSignature = JSON.stringify(sourceSegments);
  const draftSignature = JSON.stringify(segments);
  const dirty = sourceSignature !== draftSignature;

  const previewText = segments
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join('\n\n');

  const updateSegment = (id: string, text: string) => {
    setSegments((prev) => prev.map((segment) => (segment.id === id ? { ...segment, text } : segment)));
    setSaveState('idle');
  };

  const addSegment = () => {
    setSegments((prev) => [...prev, { id: `speech_${nanoid(8)}`, text: '' }]);
    setSaveState('idle');
  };

  const removeSegment = (id: string) => {
    setSegments((prev) => prev.filter((segment) => segment.id !== id));
    setSaveState('idle');
  };

  const handlePreview = () => {
    if (!previewText.trim()) {
      toast.message('当前还没有可试听的讲解内容');
      return;
    }
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      toast.error('当前浏览器不支持试听');
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(verbalizeNarrationText(previewText));
    utterance.lang = language === 'en-US' ? 'en-US' : 'zh-CN';
    utterance.rate = 1;
    utterance.onend = () => setPreviewing(false);
    utterance.onerror = () => setPreviewing(false);
    setPreviewing(true);
    window.speechSynthesis.speak(utterance);
  };

  const handleSave = () => {
    const existingIds = new Set(speechActions.map((action) => action.id));
    const draftById = new Map(segments.map((segment) => [segment.id, segment] as const));

    const nextActions: Action[] = [];
    for (const action of scene.actions || []) {
      if (action.type !== 'speech') {
        nextActions.push(action);
        continue;
      }
      const draft = draftById.get(action.id);
      if (!draft) continue;
      const nextText = draft.text.trim();
      if (!nextText) continue;
      nextActions.push({ ...action, text: nextText });
    }

    for (const segment of segments) {
      if (existingIds.has(segment.id)) continue;
      const nextText = segment.text.trim();
      if (!nextText) continue;
      nextActions.push({
        id: segment.id,
        type: 'speech',
        text: nextText,
      });
    }

    onSaveActions(nextActions);
    setSaveState('saved');
    toast.success('当前页讲解已保存');
  };

  if (scene.type !== 'slide' || scene.content.type !== 'slide') {
    return null;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-5">
      <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(320px,0.95fr)_minmax(420px,1.05fr)]">
        <div className="min-h-0 rounded-2xl border border-slate-900/[0.08] bg-white/80 p-4 shadow-sm dark:border-white/[0.08] dark:bg-black/20">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">当前页面预览</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                第 {sceneIndex + 1} / {totalScenes} 页
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={onGoPrev} disabled={!canGoPrev}>
                上一页
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={onGoNext} disabled={!canGoNext}>
                下一页
              </Button>
            </div>
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-white dark:border-white/10 dark:bg-slate-950">
            <ThumbnailSlide
              slide={scene.content.canvas}
              size={640}
              viewportSize={scene.content.canvas.viewportSize ?? 1000}
              viewportRatio={scene.content.canvas.viewportRatio ?? 0.5625}
            />
          </div>
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{scene.title}</p>
            {nonSpeechSummary.length > 0 ? (
              <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">
                这一页还保留了这些非讲解动作，当前不会改动：{nonSpeechSummary.join('，')}
              </p>
            ) : (
              <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">
                这一页目前只有讲解稿，没有额外的聚焦或讨论动作。
              </p>
            )}
          </div>
        </div>

        <div className="min-h-0 rounded-2xl border border-slate-900/[0.08] bg-white/80 p-4 shadow-sm dark:border-white/[0.08] dark:bg-black/20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">讲解稿</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                这里只编辑当前页的 `speech` 内容。新增段落会追加到本页讲解末尾。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={handlePreview} disabled={previewing}>
                <Volume2 className="mr-1.5 size-4" />
                {previewing ? '试听中…' : '试听'}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={addSegment}>
                <Plus className="mr-1.5 size-4" />
                新增段落
              </Button>
              <Button type="button" size="sm" onClick={handleSave} disabled={!dirty}>
                <Save className="mr-1.5 size-4" />
                保存讲解
              </Button>
            </div>
          </div>

          <div className="mt-4 flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
            {segments.length > 0 ? (
              segments.map((segment, index) => (
                <div
                  key={segment.id}
                  className="rounded-2xl border border-slate-200/80 bg-white/90 p-3 dark:border-white/10 dark:bg-slate-950/40"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      讲解段落 {index + 1}
                    </p>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8 text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400"
                      onClick={() => removeSegment(segment.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <Textarea
                    value={segment.text}
                    onChange={(e) => updateSegment(segment.id, e.target.value)}
                    placeholder="输入这段讲解词。建议一段聚焦一个知识点。"
                    className="min-h-[140px] resize-y border-slate-200/80 bg-white/90 text-sm leading-6 dark:border-white/10 dark:bg-slate-950/50"
                  />
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300/80 bg-slate-50/80 px-4 py-8 text-center dark:border-white/12 dark:bg-white/[0.03]">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">当前页还没有讲解稿</p>
                <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                  你可以先添加一个讲解段落，再保存到本页 actions 中。
                </p>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-200/80 pt-3 text-xs dark:border-white/10">
            <span className="text-slate-500 dark:text-slate-400">
              {saveState === 'saved'
                ? '已保存。下次播放本页时会使用新的讲解稿。'
                : dirty
                  ? '你有未保存的讲解修改。'
                  : '当前讲解已与页面同步。'}
            </span>
            {previewing ? (
              <button
                type="button"
                className="text-slate-500 underline decoration-dotted underline-offset-4 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                onClick={() => {
                  if (typeof window !== 'undefined' && window.speechSynthesis) {
                    window.speechSynthesis.cancel();
                  }
                  setPreviewing(false);
                }}
              >
                停止试听
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
