'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Star } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { backendJson } from '@/lib/utils/backend-api';
import { resolveCourseAvatarDisplayUrl } from '@/lib/constants/course-avatars';

type StoreNotebook = {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  avatarUrl: string | null;
  listedInNotebookStore: boolean;
  notebookPriceCents: number;
  purchased: boolean;
  clonedNotebookId: string | null;
  updatedAt: string;
  createdAt: string;
  _count: { scenes: number };
};

type StoreCourseDetailResponse = {
  course: {
    id: string;
    name: string;
    description: string | null;
    tags: string[];
    language: string;
    purpose: string;
    university: string | null;
    courseCode: string | null;
    avatarUrl: string | null;
    coursePriceCents: number;
    ownerName: string;
    averageRating: number;
    reviewCount: number;
    purchased: boolean;
    clonedCourseId: string | null;
    notebooks: StoreNotebook[];
  };
  reviews: Array<{
    id: string;
    rating: number;
    comment: string | null;
    reviewerName: string;
    reviewerAvatarUrl: string | null;
    updatedAt: string;
  }>;
};

export default function StoreCourseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : '';
  const [data, setData] = useState<StoreCourseDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const next = await backendJson<StoreCourseDetailResponse>(`/api/courses/store/${id}`);
      setData(next);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  const priceLabel = useMemo(() => {
    const cents = data?.course.coursePriceCents ?? 0;
    return `¥${(cents / 100).toFixed(2)}`;
  }, [data]);

  const handleBuy = async () => {
    if (!id) return;
    setBuying(true);
    try {
      const response = await backendJson<{ course: { id: string; name: string } }>(
        '/api/courses/clone',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceCourseId: id }),
        },
      );
      toast.success(`已购买并复制课程「${response.course.name}」`);
      router.push(`/course/${response.course.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '购买失败');
    } finally {
      setBuying(false);
    }
  };

  const handleReview = async () => {
    if (!id) return;
    setSubmitting(true);
    try {
      await backendJson(`/api/courses/store/${id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment }),
      });
      toast.success('评价已提交');
      setComment('');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '提交评价失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBuyNotebook = async (notebookId: string) => {
    try {
      const response = await backendJson<{ notebook: { id: string; name: string } }>(
        '/api/notebooks/clone',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceNotebookId: notebookId }),
        },
      );
      toast.success(`已购买笔记本「${response.notebook.name}」`);
      router.push(`/classroom/${response.notebook.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '购买笔记本失败');
    }
  };

  if (loading || !data) {
    return (
      <div className="flex min-h-full items-center justify-center text-muted-foreground">
        加载课程详情…
      </div>
    );
  }

  const { course, reviews } = data;

  return (
    <div className="relative min-h-full w-full overflow-hidden apple-mesh-bg">
      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-12 pt-8 md:px-8">
        <Button variant="ghost" size="sm" className="-ml-2 mb-4 rounded-lg" asChild>
          <Link href="/store/courses">← 返回课程商城</Link>
        </Button>

        <section className="apple-glass mb-6 rounded-[28px] p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 gap-4">
              <img
                src={resolveCourseAvatarDisplayUrl(course.id, course.avatarUrl)}
                alt=""
                className="size-20 rounded-2xl border border-slate-200/80 object-cover dark:border-white/15"
              />
              <div className="min-w-0">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
                  {course.name}
                </h1>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {course.description || '这门课程暂时没有补充描述。'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-slate-200/80 bg-white/70 px-2.5 py-1 dark:border-white/15 dark:bg-white/5">
                    创作者 · {course.ownerName}
                  </span>
                  <span className="rounded-full border border-emerald-200/80 bg-emerald-50/80 px-2.5 py-1 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-950/30 dark:text-emerald-200">
                    {priceLabel}
                  </span>
                  <span className="rounded-full border border-amber-200/80 bg-amber-50/80 px-2.5 py-1 text-amber-700 dark:border-amber-500/25 dark:bg-amber-950/30 dark:text-amber-200">
                    ★ {course.averageRating.toFixed(1)} · {course.reviewCount} 条评论
                  </span>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <Button
                className="rounded-xl"
                disabled={buying || course.purchased}
                onClick={() => void handleBuy()}
              >
                {course.purchased ? '已购买' : buying ? '购买中…' : '购买课程'}
              </Button>
              {course.purchased && course.clonedCourseId ? (
                <Button variant="outline" className="rounded-xl" asChild>
                  <Link href={`/course/${course.clonedCourseId}`}>打开我的副本</Link>
                </Button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="rounded-[24px] border border-border/70 bg-card/55 p-6 backdrop-blur-sm">
            <h2 className="text-lg font-semibold">包含的笔记本</h2>
            <div className="mt-4 space-y-3">
              {course.notebooks.map((notebook) => (
                <div
                  key={notebook.id}
                  className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">{notebook.name}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {notebook.description || '该笔记本暂无描述。'}
                      </p>
                    </div>
                    <span className="rounded-full border border-slate-200/80 px-2.5 py-1 text-xs dark:border-white/10">
                      {notebook._count.scenes} 页
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-muted-foreground">
                      单本价格 ¥{(notebook.notebookPriceCents / 100).toFixed(2)}
                    </div>
                    {notebook.listedInNotebookStore && !course.purchased ? (
                      notebook.purchased && notebook.clonedNotebookId ? (
                        <Button size="sm" variant="outline" className="rounded-xl" asChild>
                          <Link href={`/classroom/${notebook.clonedNotebookId}`}>打开已购副本</Link>
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-xl"
                          onClick={() => void handleBuyNotebook(notebook.id)}
                        >
                          购买单本
                        </Button>
                      )
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-border/70 bg-card/55 p-6 backdrop-blur-sm">
            <h2 className="text-lg font-semibold">评分与评论</h2>
            {course.purchased ? (
              <div className="mt-4 space-y-3">
                <div className="flex gap-2">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <button key={index} type="button" onClick={() => setRating(index + 1)}>
                      <Star
                        className={
                          index < rating
                            ? 'size-5 fill-amber-400 text-amber-400'
                            : 'size-5 text-slate-300'
                        }
                      />
                    </button>
                  ))}
                </div>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={4}
                  placeholder="写下你的学习体验、课堂质量、例题是否完整等。"
                />
                <Button
                  className="rounded-xl"
                  disabled={submitting}
                  onClick={() => void handleReview()}
                >
                  {submitting ? '提交中…' : '提交评论'}
                </Button>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">购买课程后可以打分和评论。</p>
            )}

            <div className="mt-6 space-y-4">
              {reviews.length === 0 ? (
                <p className="text-sm text-muted-foreground">还没有评论，欢迎成为第一位评价者。</p>
              ) : (
                reviews.map((review) => (
                  <div
                    key={review.id}
                    className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{review.reviewerName}</p>
                      <span className="text-xs text-muted-foreground">
                        {new Date(review.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-amber-500">{'★'.repeat(review.rating)}</p>
                    {review.comment ? (
                      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                        {review.comment}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
