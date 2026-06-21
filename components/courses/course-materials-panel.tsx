'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileText, HardDrive, Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from '@/lib/notifications/client-toast';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  COURSE_MATERIAL_SPACE_LIMIT_BYTES,
  addCourseMaterials,
  deleteCourseMaterial,
  getCourseMaterialBlob,
  listCourseMaterials,
  type CourseMaterialListItem,
} from '@/lib/utils/course-material-storage';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 10 ? 1 : 2)} MB`;
}

function formatMaterialDate(ts: number): string {
  return new Date(ts).toLocaleDateString();
}

export function CourseMaterialsPanel({
  courseId,
  className,
}: {
  courseId: string;
  className?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [materials, setMaterials] = useState<CourseMaterialListItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const usedBytes = useMemo(() => materials.reduce((sum, item) => sum + item.size, 0), [materials]);
  const usagePercent = Math.min(100, (usedBytes / COURSE_MATERIAL_SPACE_LIMIT_BYTES) * 100);
  const remainingBytes = Math.max(0, COURSE_MATERIAL_SPACE_LIMIT_BYTES - usedBytes);

  const refreshMaterials = async () => {
    const next = await listCourseMaterials(courseId);
    setMaterials(next);
    setLoaded(true);
  };

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const next = await listCourseMaterials(courseId);
        if (!alive) return;
        setMaterials(next);
      } catch (error) {
        if (alive) {
          toast.error(error instanceof Error ? error.message : '读取课程资料失败');
        }
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [courseId]);

  const handlePickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const selected = Array.from(files);
    setBusy(true);
    try {
      const added = await addCourseMaterials(courseId, selected);
      await refreshMaterials();
      if (added.length > 0) {
        toast.success(`已上传 ${added.length} 个资料`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '上传资料失败');
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownload = async (material: CourseMaterialListItem) => {
    try {
      const blob = await getCourseMaterialBlob(material.id);
      if (!blob) {
        toast.error('未找到该资料文件');
        return;
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = material.name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '下载资料失败');
    }
  };

  const handleDelete = async (material: CourseMaterialListItem) => {
    if (!window.confirm(`删除资料「${material.name}」？此操作只会移除课程空间中的副本。`)) {
      return;
    }
    setBusy(true);
    try {
      await deleteCourseMaterial(material.id);
      await refreshMaterials();
      toast.success('已删除资料');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除资料失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className={cn('rounded-2xl p-4 apple-glass sm:p-5 md:rounded-[28px] md:p-6', className)}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => void handlePickFiles(event.target.files)}
      />
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <HardDrive className="size-4 text-slate-500 dark:text-slate-300" strokeWidth={1.8} />
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">课程资料</h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            上传到这里的资料会保存在当前课程空间中；每门课最多 20MB。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full shrink-0 rounded-xl border-slate-200 bg-white/80 md:w-auto dark:border-white/20 dark:bg-white/5"
          disabled={busy || remainingBytes <= 0}
          onClick={() => fileInputRef.current?.click()}
        >
          {busy ? (
            <Loader2 className="mr-1.5 size-4 animate-spin" />
          ) : (
            <Upload className="mr-1.5 size-4" strokeWidth={1.8} />
          )}
          上传资料
        </Button>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>
            已用 {formatBytes(usedBytes)} / {formatBytes(COURSE_MATERIAL_SPACE_LIMIT_BYTES)}
          </span>
          <span>剩余 {formatBytes(remainingBytes)}</span>
        </div>
        <Progress value={usagePercent} className="h-2 bg-slate-900/10 dark:bg-white/10" />
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/70 bg-white/45 dark:border-white/10 dark:bg-white/[0.035]">
        {!loaded ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-slate-400" />
          </div>
        ) : materials.length === 0 ? (
          <div className="flex min-h-24 flex-col items-center justify-center px-4 py-6 text-center">
            <FileText className="mb-2 size-6 text-slate-400" strokeWidth={1.7} />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-200">还没有上传资料</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              PDF、PPTX、Markdown 或其它课程文件都可以先放在这里。
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-200/70 dark:divide-white/10">
            {materials.map((material) => (
              <li key={material.id} className="flex min-w-0 items-center gap-3 px-3 py-3 md:px-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-900/[0.04] text-slate-500 ring-1 ring-slate-900/[0.06] dark:bg-white/[0.06] dark:text-slate-300 dark:ring-white/10">
                  <FileText className="size-4" strokeWidth={1.8} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                    {material.name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                    {formatBytes(material.size)} · {formatMaterialDate(material.createdAt)}
                    {material.mimeType ? ` · ${material.mimeType}` : ''}
                  </p>
                  {material.tags.length > 0 ? (
                    <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
                      {material.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex max-w-full items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-300/20 dark:bg-emerald-500/10 dark:text-emerald-100"
                        >
                          <span className="truncate">{tag}</span>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    title="下载资料"
                    onClick={() => void handleDownload(material)}
                  >
                    <Download className="size-4" strokeWidth={1.8} />
                    <span className="sr-only">下载资料</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-lg text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-300"
                    title="删除资料"
                    disabled={busy}
                    onClick={() => void handleDelete(material)}
                  >
                    <Trash2 className="size-4" strokeWidth={1.8} />
                    <span className="sr-only">删除资料</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
