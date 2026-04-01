'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  LayoutGrid,
  Star,
  WandSparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PurchaseConfirmDialog } from '@/components/courses/purchase-confirm-dialog';
import { Textarea } from '@/components/ui/textarea';
import { backendJson } from '@/lib/utils/backend-api';
import { resolveCourseAvatarDisplayUrl } from '@/lib/constants/course-avatars';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { useNotificationStore } from '@/lib/store/notifications';
import { listStagesByCourse } from '@/lib/utils/stage-storage';
import { creditsFromPriceCents, formatCreditsLabel } from '@/lib/utils/credits';

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

function purposeLabel(purpose: string) {
  if (purpose === 'research') return '科研内容';
  if (purpose === 'university') return '大学课程';
  return '日常学习';
}

function buildHighlights(course: StoreCourseDetailResponse['course']) {
  const notebookCount = course.notebooks.length;
  const totalScenes = course.notebooks.reduce((sum, notebook) => sum + notebook._count.scenes, 0);

  return [
    {
      title: '完整内容包',
      description: `包含 ${notebookCount} 本笔记本与 ${totalScenes} 页内容，适合直接复制后开始学习。`,
    },
    {
      title: '适合人群',
      description:
        course.purpose === 'research'
          ? '更适合案例分析、方法拆解与项目推进。'
          : course.purpose === 'university'
            ? '更贴近高校课程节奏，适合系统学习与课堂复习。'
            : '适合日常学习、知识整理与长期积累。',
    },
    {
      title: '学习反馈',
      description:
        course.reviewCount > 0
          ? `当前评分 ${course.averageRating.toFixed(1)}，已有 ${course.reviewCount} 条学习反馈。`
          : '当前还没有评论，适合成为第一批使用并留下反馈的学习者。',
    },
  ];
}

export default function StoreCourseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : '';
  const currentCourseId = useCurrentCourseStore((s) => s.id);
  const refreshNotifications = useNotificationStore((s) => s.refreshNotifications);
  const [data, setData] = useState<StoreCourseDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [ownedNotebookMap, setOwnedNotebookMap] = useState<Record<string, string>>({});
  const [coursePurchaseOpen, setCoursePurchaseOpen] = useState(false);
  const [buyingNotebookId, setBuyingNotebookId] = useState<string | null>(null);
  const [pendingNotebookPurchase, setPendingNotebookPurchase] = useState<StoreNotebook | null>(
    null,
  );

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const next = await backendJson<StoreCourseDetailResponse>(`/api/courses/store/${id}`);
      setData(next);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!currentCourseId) {
      setOwnedNotebookMap({});
      return;
    }

    let cancelled = false;
    void (async () => {
      const notebooks = await listStagesByCourse(currentCourseId);
      if (cancelled) return;

      const nextMap: Record<string, string> = {};
      for (const notebook of notebooks) {
        const sourceNotebookId = notebook.sourceNotebookId?.trim();
        if (!sourceNotebookId) continue;
        nextMap[sourceNotebookId] = notebook.id;
      }
      setOwnedNotebookMap(nextMap);
    })();

    return () => {
      cancelled = true;
    };
  }, [currentCourseId]);

  const priceLabel = useMemo(() => {
    return formatCreditsLabel(creditsFromPriceCents(data?.course.coursePriceCents ?? 0));
  }, [data]);

  const totalScenes = useMemo(
    () => data?.course.notebooks.reduce((sum, notebook) => sum + notebook._count.scenes, 0) ?? 0,
    [data],
  );

  const highlights = useMemo(() => (data ? buildHighlights(data.course) : []), [data]);

  const handleBuy = async (): Promise<boolean> => {
    if (!id) return false;
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
      await refreshNotifications({ silent: true });
      toast.success(`已购买并复制课程「${response.course.name}」`);
      router.push(`/course/${response.course.id}`);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '购买失败');
      return false;
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

  const handleBuyNotebook = async (notebookId: string): Promise<boolean> => {
    setBuyingNotebookId(notebookId);
    try {
      const response = await backendJson<{ notebook: { id: string; name: string } }>(
        '/api/notebooks/clone',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceNotebookId: notebookId }),
        },
      );
      await refreshNotifications({ silent: true });
      toast.success(`已购买笔记本「${response.notebook.name}」`);
      router.push(`/classroom/${response.notebook.id}`);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '购买笔记本失败');
      return false;
    } finally {
      setBuyingNotebookId(null);
    }
  };

  if (loading || !data) {
    return (
      <div className="store-shell flex min-h-full items-center justify-center text-muted-foreground">
        加载课程详情…
      </div>
    );
  }

  const { course, reviews } = data;

  return (
    <div className="store-shell store-grid min-h-full w-full overflow-hidden">
      <main className="relative z-10 mx-auto w-full max-w-[92rem] px-4 pb-20 pt-8 md:px-8 lg:px-10">
        <Button variant="ghost" size="sm" className="-ml-2 mb-4 rounded-full px-4" asChild>
          <Link href="/store/courses">
            <ArrowLeft className="size-4" />
            返回课程商城
          </Link>
        </Button>

        <section className="store-hero-panel overflow-hidden rounded-[40px] px-6 py-8 md:px-10 md:py-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.72fr)] lg:items-start">
            <div className="max-w-3xl">
              <div className="flex flex-wrap gap-2">
                <span className="store-chip text-xs">{purposeLabel(course.purpose)}</span>
                {course.university?.trim() ? (
                  <span className="store-chip text-xs">{course.university.trim()}</span>
                ) : null}
                {course.courseCode?.trim() ? (
                  <span className="store-chip text-xs">{course.courseCode.trim()}</span>
                ) : null}
              </div>
              <h1 className="mt-5 text-4xl font-semibold tracking-[-0.05em] text-slate-950 md:text-6xl dark:text-white">
                {course.name}
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600 md:text-lg dark:text-slate-300">
                {course.description || '这门课程暂时没有补充描述。'}
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <span className="store-chip text-sm">{`创作者 · ${course.ownerName}`}</span>
                <span className="store-chip text-sm">
                  <Star className="size-4 fill-current" />
                  {`${course.averageRating.toFixed(1)} · ${course.reviewCount} 条评论`}
                </span>
                <span className="store-chip text-sm">
                  <LayoutGrid className="size-4" />
                  {`${course.notebooks.length} 本笔记本 · ${totalScenes} 页`}
                </span>
              </div>
            </div>

            <aside className="store-sticky-buy">
              <div className="store-section-panel rounded-[32px] p-6">
                <div className="flex items-center gap-4">
                  <img
                    src={resolveCourseAvatarDisplayUrl(course.id, course.avatarUrl)}
                    alt=""
                    className="size-18 h-[72px] w-[72px] rounded-[22px] border border-white/75 object-cover shadow-[0_16px_36px_rgba(15,23,42,0.1)] dark:border-white/12"
                  />
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">课程价格</p>
                    <p className="mt-1 text-3xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-white">
                      {priceLabel}
                    </p>
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  <button
                    type="button"
                    className="store-cta-primary w-full rounded-full px-5 py-3 text-sm font-semibold"
                    disabled={buying || course.purchased}
                    onClick={() => setCoursePurchaseOpen(true)}
                  >
                    {course.purchased ? '已购买' : buying ? '购买中…' : '购买整门课程'}
                  </button>
                  {course.purchased && course.clonedCourseId ? (
                    <button
                      type="button"
                      className="store-cta-secondary w-full rounded-full px-5 py-3 text-sm font-semibold"
                      onClick={() => router.push(`/course/${course.clonedCourseId}`)}
                    >
                      打开我的副本
                    </button>
                  ) : null}
                </div>

                <div className="mt-6 space-y-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                  <p>购买后会把整门课程和全部笔记本复制到你的个人空间。</p>
                  <p>如果只想先试一部分内容，也可以在下方按单本 notebook 购买。</p>
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section className="mt-14">
          <div className="mb-6">
            <p className="text-sm font-medium tracking-[0.16em] text-slate-500 uppercase dark:text-slate-400">
              Why It&apos;s Worth It
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-white">
              课程亮点
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {highlights.map((highlight) => (
              <div key={highlight.title} className="store-section-panel rounded-[30px] p-6">
                <p className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
                  <WandSparkles className="size-4" />
                  亮点
                </p>
                <h3 className="mt-3 text-2xl font-semibold tracking-[-0.035em] text-slate-950 dark:text-white">
                  {highlight.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                  {highlight.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-14 grid gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]">
          <div className="store-section-panel rounded-[34px] p-6 md:p-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm font-medium tracking-[0.16em] text-slate-500 uppercase dark:text-slate-400">
                  Course Contents
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-white">
                  课程内容总览
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="store-chip text-xs">{`${course.notebooks.length} 本笔记本`}</span>
                <span className="store-chip text-xs">{`${totalScenes} 页内容`}</span>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {course.notebooks.map((notebook, index) => {
                const ownedNotebookId = ownedNotebookMap[notebook.id] ?? null;
                const notebookAlreadyOwned = Boolean(notebook.purchased || ownedNotebookId);
                return (
                  <div
                    key={notebook.id}
                    className="rounded-[28px] border border-white/75 bg-white/70 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-white/5"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="flex gap-4">
                        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                          <BookOpen className="size-5" />
                        </div>
                        <div>
                          <p className="text-xs font-medium tracking-[0.16em] text-slate-400 uppercase dark:text-slate-500">
                            {`Notebook ${String(index + 1).padStart(2, '0')}`}
                          </p>
                          <h3 className="mt-1 text-xl font-semibold tracking-[-0.025em] text-slate-950 dark:text-white">
                            {notebook.name}
                          </h3>
                          <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">
                            {notebook.description || '该笔记本暂无描述。'}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <span className="store-chip text-xs">{`${notebook._count.scenes} 页`}</span>
                            <span className="store-chip text-xs">
                              {`单本价格 ${formatCreditsLabel(creditsFromPriceCents(notebook.notebookPriceCents))}`}
                            </span>
                            {notebook.tags.slice(0, 3).map((tag) => (
                              <span key={tag} className="store-chip text-xs">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {notebook.listedInNotebookStore && !course.purchased ? (
                        notebookAlreadyOwned ? (
                          <Button size="sm" variant="outline" className="rounded-full" disabled>
                            已拥有
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-full"
                            disabled={buyingNotebookId === notebook.id}
                            onClick={() => setPendingNotebookPurchase(notebook)}
                          >
                            {buyingNotebookId === notebook.id ? '购买中…' : '购买单本'}
                          </Button>
                        )
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-5">
            <div className="store-section-panel rounded-[34px] p-6">
              <p className="text-sm font-medium tracking-[0.16em] text-slate-500 uppercase dark:text-slate-400">
                Snapshot
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-slate-950 dark:text-white">
                这门课程适合什么场景？
              </h2>
              <div className="mt-5 space-y-4 text-sm leading-7 text-slate-600 dark:text-slate-300">
                <div className="flex gap-3">
                  <CheckCircle2 className="mt-1 size-4 shrink-0 text-sky-500" />
                  <p>如果你想直接复制一整套结构化内容，这是最省时的购买方式。</p>
                </div>
                <div className="flex gap-3">
                  <CheckCircle2 className="mt-1 size-4 shrink-0 text-sky-500" />
                  <p>购买后可以按自己的课堂节奏继续修改、扩展与重新组织笔记本。</p>
                </div>
                <div className="flex gap-3">
                  <CheckCircle2 className="mt-1 size-4 shrink-0 text-sky-500" />
                  <p>若只需要局部内容，可以先浏览下方单本购买入口，逐步拼出自己的课程包。</p>
                </div>
              </div>
            </div>

            <div className="store-section-panel rounded-[34px] p-6">
              <p className="text-sm font-medium tracking-[0.16em] text-slate-500 uppercase dark:text-slate-400">
                Reviews
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-slate-950 dark:text-white">
                学习者评价
              </h2>

              {course.purchased ? (
                <div className="mt-5 space-y-4">
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
                    className="rounded-[24px] border-white/70 bg-white/78 dark:border-white/10 dark:bg-white/5"
                    placeholder="写下你的学习体验、课堂质量、例题是否完整等。"
                  />
                  <button
                    type="button"
                    className="store-cta-primary rounded-full px-5 py-3 text-sm font-semibold"
                    disabled={submitting}
                    onClick={() => void handleReview()}
                  >
                    {submitting ? '提交中…' : '提交评论'}
                  </button>
                </div>
              ) : (
                <p className="mt-4 text-sm leading-7 text-slate-600 dark:text-slate-300">
                  购买课程后可以打分和评论。
                </p>
              )}

              <div className="mt-6 space-y-4">
                {reviews.length === 0 ? (
                  <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">
                    还没有评论，欢迎成为第一位评价者。
                  </p>
                ) : (
                  reviews.map((review) => (
                    <div
                      key={review.id}
                      className="rounded-[26px] border border-white/70 bg-white/72 p-4 dark:border-white/10 dark:bg-white/5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-slate-950 dark:text-white">
                          {review.reviewerName}
                        </p>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {new Date(review.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-amber-500">{'★'.repeat(review.rating)}</p>
                      {review.comment ? (
                        <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">
                          {review.comment}
                        </p>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-14">
          <div className="store-section-panel flex flex-col gap-6 rounded-[36px] px-6 py-7 md:flex-row md:items-center md:justify-between md:px-8">
            <div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Next step</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950 dark:text-white">
                想继续挑选别的课程？返回商城继续逛专题货架。
              </h2>
            </div>
            <button
              type="button"
              onClick={() => router.push('/store/courses')}
              className="store-cta-primary inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold"
            >
              返回课程商城
              <ArrowRight className="size-4" />
            </button>
          </div>
        </section>

        <PurchaseConfirmDialog
          open={coursePurchaseOpen}
          onOpenChange={setCoursePurchaseOpen}
          itemTypeLabel="课程"
          itemName={course.name}
          creditsCost={creditsFromPriceCents(course.coursePriceCents)}
          countSummary={`将复制 ${course.notebooks.length} 本笔记本，共 ${totalScenes} 页内容到你的个人空间。`}
          note="确认后会立即扣除对应 credits，并生成你自己的课程副本。"
          busy={buying}
          confirmLabel="确认购买课程"
          onConfirm={handleBuy}
        />
        <PurchaseConfirmDialog
          open={Boolean(pendingNotebookPurchase)}
          onOpenChange={(open) => {
            if (!open) setPendingNotebookPurchase(null);
          }}
          itemTypeLabel="笔记本"
          itemName={pendingNotebookPurchase?.name ?? ''}
          creditsCost={creditsFromPriceCents(pendingNotebookPurchase?.notebookPriceCents ?? 0)}
          countSummary={
            pendingNotebookPurchase
              ? `将复制这本笔记本到你的空间，包含 ${pendingNotebookPurchase._count.scenes} 页内容。`
              : undefined
          }
          note="确认后会立即扣除对应 credits，并生成你自己的笔记本副本。"
          busy={buyingNotebookId != null}
          confirmLabel="确认购买笔记本"
          onConfirm={() =>
            pendingNotebookPurchase ? handleBuyNotebook(pendingNotebookPurchase.id) : false
          }
        />
      </main>
    </div>
  );
}
