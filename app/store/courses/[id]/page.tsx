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
import { toast } from '@/lib/notifications/client-toast';
import { Button } from '@/components/ui/button';
import { PurchaseConfirmDialog } from '@/components/courses/purchase-confirm-dialog';
import { Textarea } from '@/components/ui/textarea';
import { backendJson } from '@/lib/utils/backend-api';
import { resolveCourseAvatarDisplayUrl } from '@/lib/constants/course-avatars';
import { useNotificationStore } from '@/lib/store/notifications';
import { creditsFromPriceCents, formatPurchaseCreditsLabel } from '@/lib/utils/credits';
import { notifyCreditsBalancesChanged } from '@/lib/utils/credits-balance-events';

type StoreNotebook = {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  avatarUrl: string | null;
  listedInNotebookStore: boolean;
  notebookPriceCents: number;
  updatedAt: string;
  createdAt: string;
  speechReadyCount?: number;
  speechTotalCount?: number;
  speechStatus?: 'no_speech' | 'ready' | 'pending';
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
    speechReadyCount?: number;
    speechTotalCount?: number;
    speechStatus?: 'no_speech' | 'ready' | 'pending';
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
      description: `包含 ${notebookCount} 本笔记本与 ${totalScenes} 页内容，加入后可持续看到创建者更新。`,
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
    {
      title: '语音状态',
      description: '课程共享讲解稿文本；音频会按你的个人音色设置生成，不受创建者设置影响。',
    },
  ];
}

function speechStatusLabel(
  item: Pick<
    StoreCourseDetailResponse['course'],
    'speechStatus' | 'speechReadyCount' | 'speechTotalCount'
  >,
) {
  return item.speechTotalCount ? '讲解稿就绪，可生成我的语音' : '可生成我的语音';
}

export default function StoreCourseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : '';
  const refreshNotifications = useNotificationStore((s) => s.refreshNotifications);
  const [data, setData] = useState<StoreCourseDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [coursePurchaseOpen, setCoursePurchaseOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      setLoadError('课程不存在');
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const next = await backendJson<StoreCourseDetailResponse>(`/api/courses/store/${id}`);
      setData(next);
    } catch (error) {
      setData(null);
      setLoadError(error instanceof Error ? error.message : '课程详情加载失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const priceLabel = useMemo(() => {
    return formatPurchaseCreditsLabel(creditsFromPriceCents(data?.course.coursePriceCents ?? 0));
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
      notifyCreditsBalancesChanged();
      toast.success(`已加入课程「${response.course.name}」`);
      router.push(`/learn?courseId=${encodeURIComponent(response.course.id)}`);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加入失败');
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

  if (loading) {
    return (
      <div className="store-shell flex min-h-full items-center justify-center text-muted-foreground">
        加载课程详情…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="store-shell flex min-h-full items-center justify-center px-4">
        <div className="w-full max-w-md rounded-[28px] border border-slate-200/75 bg-white/80 p-6 text-center shadow-[0_18px_46px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/6">
          <h1 className="text-xl font-semibold text-slate-950 dark:text-white">课程详情不可用</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
            {loadError || '这门课程可能未上架，或你已经拥有它。'}
          </p>
          <div className="mt-5 flex flex-col gap-2 min-[420px]:flex-row min-[420px]:justify-center">
            <Button variant="outline" onClick={() => router.push('/store/courses')}>
              返回课程商城
            </Button>
            {id ? (
              <Button onClick={() => router.push(`/learn?courseId=${encodeURIComponent(id)}`)}>
                进入课程学习
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const { course, reviews } = data;

  return (
    <div className="store-shell store-grid min-h-full w-full overflow-hidden">
      <main className="relative z-10 mx-auto w-full max-w-[92rem] px-3 pb-16 pt-4 sm:px-4 sm:pt-6 md:px-8 md:pb-20 lg:px-10 lg:pt-8">
        <Button variant="ghost" size="sm" className="-ml-2 mb-4 rounded-full px-4" asChild>
          <Link href="/store/courses">
            <ArrowLeft className="size-4" />
            返回课程商城
          </Link>
        </Button>

        <section className="store-hero-panel overflow-hidden px-4 py-6 sm:rounded-[40px] sm:px-6 sm:py-8 md:px-10 md:py-10">
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.72fr)] xl:items-start">
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
              <h1 className="mt-5 text-3xl font-semibold text-slate-950 sm:text-4xl md:text-6xl dark:text-white">
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
                <span className="store-chip text-sm">{speechStatusLabel(course)}</span>
              </div>
            </div>

            <aside className="store-sticky-buy">
              <div className="store-section-panel p-5 sm:rounded-[32px] sm:p-6">
                <div className="flex items-center gap-4">
                  <img
                    src={resolveCourseAvatarDisplayUrl(course.id, course.avatarUrl)}
                    alt=""
                    className="size-18 h-[72px] w-[72px] rounded-[22px] border border-white/75 object-cover shadow-[0_16px_36px_rgba(15,23,42,0.1)] dark:border-white/12"
                  />
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">课程价格</p>
                    <p className="mt-1 text-3xl font-semibold text-slate-950 dark:text-white">
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
                    {course.purchased ? '已加入' : buying ? '加入中…' : '加入课程'}
                  </button>
                  {course.purchased ? (
                    <button
                      type="button"
                      className="store-cta-secondary w-full rounded-full px-5 py-3 text-sm font-semibold"
                      onClick={() =>
                        router.push(`/learn?courseId=${encodeURIComponent(course.id)}`)
                      }
                    >
                      进入学习
                    </button>
                  ) : null}
                </div>

                <div className="mt-6 space-y-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                  <p>加入后会持续读取创建者维护的同一份课程内容。</p>
                  <p>你的做题记录、私有记忆和个人语音会单独保存。</p>
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section className="mt-10 sm:mt-14">
          <div className="mb-6">
            <p className="text-sm font-medium tracking-[0.16em] text-slate-500 uppercase dark:text-slate-400">
              Why It&apos;s Worth It
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950 sm:text-3xl dark:text-white">
              课程亮点
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {highlights.map((highlight) => (
              <div
                key={highlight.title}
                className="store-section-panel p-5 sm:rounded-[30px] sm:p-6"
              >
                <p className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
                  <WandSparkles className="size-4" />
                  亮点
                </p>
                <h3 className="mt-3 text-xl font-semibold text-slate-950 sm:text-2xl dark:text-white">
                  {highlight.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                  {highlight.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10 grid gap-5 sm:mt-14 xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]">
          <div className="store-section-panel p-5 sm:rounded-[34px] md:p-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm font-medium tracking-[0.16em] text-slate-500 uppercase dark:text-slate-400">
                  Course Contents
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950 sm:text-3xl dark:text-white">
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
                return (
                  <div
                    key={notebook.id}
                    className="rounded-[28px] border border-white/75 bg-white/70 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-white/5"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="flex min-w-0 flex-col gap-3 min-[420px]:flex-row min-[420px]:gap-4">
                        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                          <BookOpen className="size-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium tracking-[0.16em] text-slate-400 uppercase dark:text-slate-500">
                            {`Notebook ${String(index + 1).padStart(2, '0')}`}
                          </p>
                          <h3 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">
                            {notebook.name}
                          </h3>
                          <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">
                            {notebook.description || '该笔记本暂无描述。'}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <span className="store-chip text-xs">{`${notebook._count.scenes} 页`}</span>
                            <span className="store-chip text-xs">
                              {`单本价格 ${formatPurchaseCreditsLabel(
                                creditsFromPriceCents(notebook.notebookPriceCents),
                              )}`}
                            </span>
                            <span className="store-chip text-xs">
                              {speechStatusLabel(notebook)}
                            </span>
                            {notebook.tags.slice(0, 3).map((tag) => (
                              <span key={tag} className="store-chip text-xs">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {course.purchased ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full rounded-full md:w-auto"
                          onClick={() => router.push(`/classroom/${notebook.id}`)}
                        >
                          打开
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-5">
            <div className="store-section-panel p-5 sm:rounded-[34px] sm:p-6">
              <p className="text-sm font-medium tracking-[0.16em] text-slate-500 uppercase dark:text-slate-400">
                Snapshot
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
                这门课程适合什么场景？
              </h2>
              <div className="mt-5 space-y-4 text-sm leading-7 text-slate-600 dark:text-slate-300">
                <div className="flex gap-3">
                  <CheckCircle2 className="mt-1 size-4 shrink-0 text-sky-500" />
                  <p>如果你想直接跟随一整套结构化内容，这是最省时的加入方式。</p>
                </div>
                <div className="flex gap-3">
                  <CheckCircle2 className="mt-1 size-4 shrink-0 text-sky-500" />
                  <p>加入后内容会跟随创建者更新，你的学习记录会保留在自己的账号下。</p>
                </div>
                <div className="flex gap-3">
                  <CheckCircle2 className="mt-1 size-4 shrink-0 text-sky-500" />
                  <p>课堂语音会按你的个人音色生成，创建者不需要提前附带音频。</p>
                </div>
              </div>
            </div>

            <div className="store-section-panel p-5 sm:rounded-[34px] sm:p-6">
              <p className="text-sm font-medium tracking-[0.16em] text-slate-500 uppercase dark:text-slate-400">
                Reviews
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
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
                    className="store-cta-primary rounded-full px-5 py-3 text-sm font-semibold min-[420px]:w-auto"
                    disabled={submitting}
                    onClick={() => void handleReview()}
                  >
                    {submitting ? '提交中…' : '提交评论'}
                  </button>
                </div>
              ) : (
                <p className="mt-4 text-sm leading-7 text-slate-600 dark:text-slate-300">
                  加入课程后可以打分和评论。
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
                      <div className="flex flex-col gap-1 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between min-[420px]:gap-3">
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
          <div className="store-section-panel flex flex-col gap-6 px-5 py-6 sm:rounded-[36px] md:flex-row md:items-center md:justify-between md:px-8 md:py-7">
            <div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Next step</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
                想继续挑选别的课程？返回商城继续逛专题货架。
              </h2>
            </div>
            <button
              type="button"
              onClick={() => router.push('/store/courses')}
              className="store-cta-primary inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold md:w-auto"
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
          accountType="PURCHASE"
          countSummary={`将加入 ${course.notebooks.length} 本笔记本，共 ${totalScenes} 页共享内容。`}
          note="确认后会立即扣除对应购买积分；课程内容由创建者维护，做题记录和语音缓存属于你自己。"
          busy={buying}
          confirmLabel="确认加入课程"
          onConfirm={handleBuy}
        />
      </main>
    </div>
  );
}
