'use client';

import { useEffect, useState } from 'react';
import type { StageListItem } from '@/lib/utils/stage-storage';
import { updateStageStoreMeta } from '@/lib/utils/stage-storage';
import {
  NOTEBOOK_AGENT_AVATAR_PRESET_URLS,
  resolveNotebookAgentAvatarDisplayUrl,
} from '@/lib/constants/notebook-agent-avatars';
import { creditsFromPriceCents, priceCentsFromCredits } from '@/lib/utils/credits';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function EditNotebookForm({
  notebook,
  className,
  onSuccess,
}: {
  notebook: StageListItem;
  className?: string;
  onSuccess: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [priceCredits, setPriceCredits] = useState('0');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const purchaseLocked = Boolean(notebook.sourceNotebookId);

  useEffect(() => {
    setName(notebook.name);
    setDescription(notebook.description ?? '');
    setAvatarUrl(notebook.avatarUrl?.trim() || NOTEBOOK_AGENT_AVATAR_PRESET_URLS[0] || '');
    setPriceCredits(String(creditsFromPriceCents(notebook.notebookPriceCents ?? 0)));
    setError(null);
  }, [notebook]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('请填写笔记本名称');
      return;
    }
    setSubmitting(true);
    try {
      const notebookPriceCents = priceCentsFromCredits(
        Math.max(0, Number.parseInt(priceCredits || '0', 10) || 0),
      );
      await updateStageStoreMeta(notebook.id, {
        name: trimmedName,
        description: description.trim(),
        avatarUrl,
        ...(purchaseLocked ? {} : { notebookPriceCents }),
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-5', className)}>
      <div>
        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
          笔记本名称 <span className="text-red-500">*</span>
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-violet-500/0 transition-[box-shadow,border-color] focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 dark:border-white/15 dark:bg-white/5 dark:text-white"
          placeholder="例如：群论导论"
          maxLength={200}
        />
      </div>

      <div>
        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">笔记本描述</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-violet-500/0 transition-[box-shadow,border-color] focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 dark:border-white/15 dark:bg-white/5 dark:text-white"
          placeholder="简要说明内容范围、适合人群…"
          maxLength={3000}
        />
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-white/15 dark:bg-white/[0.04]">
        <div className="flex items-center gap-3">
          <img
            src={resolveNotebookAgentAvatarDisplayUrl(notebook.id, avatarUrl)}
            alt=""
            className="size-14 rounded-2xl border border-slate-200/80 bg-white object-cover shadow-sm dark:border-white/15 dark:bg-slate-900"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">笔记本头像</p>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              会显示在课程卡片、聊天联系人与课堂入口。
            </p>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-7">
          {NOTEBOOK_AGENT_AVATAR_PRESET_URLS.slice(0, 28).map((url) => {
            const active = avatarUrl === url;
            return (
              <button
                key={url}
                type="button"
                onClick={() => setAvatarUrl(url)}
                className={cn(
                  'overflow-hidden rounded-2xl border-2 bg-white transition-all dark:bg-slate-900',
                  active
                    ? 'border-violet-500 ring-2 ring-violet-200 dark:ring-violet-500/30'
                    : 'border-transparent hover:border-slate-200 dark:hover:border-white/15',
                )}
                aria-label="选择笔记本头像"
              >
                <img src={url} alt="" className="aspect-square w-full object-cover" />
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">笔记本价格</label>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            value={priceCredits}
            onChange={(e) => setPriceCredits(e.target.value.replace(/[^\d]/g, ''))}
            disabled={purchaseLocked}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-violet-500/0 transition-[box-shadow,border-color] focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-white"
            placeholder="0"
            inputMode="numeric"
          />
          <span className="shrink-0 text-sm text-slate-500 dark:text-slate-400">积分</span>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          设为 0 表示免费。按 100 credits = 1 USD 换算；发布到笔记本商城时使用该价格。
        </p>
        {purchaseLocked ? (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-200/90">
            购买得到的副本不可单独改价；名称、描述与头像仍可本地调整。
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={submitting}
        className="h-11 w-full rounded-xl bg-slate-900 text-white hover:opacity-90 dark:bg-white dark:text-slate-900"
      >
        {submitting ? '保存中…' : '保存更改'}
      </Button>
    </form>
  );
}
