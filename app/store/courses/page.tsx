'use client';

import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ArrowRight, Compass, Library, Search, Star, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { CourseGalleryCard } from '@/components/course-gallery-card';
import { PurchaseConfirmDialog } from '@/components/courses/purchase-confirm-dialog';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/lib/store/auth';
import {
  cloneCourseFromStore,
  listCommunityStoreCourses,
  listCourses,
} from '@/lib/utils/course-storage';
import { creditsFromPriceCents, formatCreditsLabel } from '@/lib/utils/credits';
import { listStagesByCourse } from '@/lib/utils/stage-storage';
import type { CommunityCourseListItem, CourseRecord } from '@/lib/utils/database';
import { markCourseOwnedByUser } from '@/lib/utils/course-ownership';
import { toast } from 'sonner';
import { resolveCourseAvatarDisplayUrl } from '@/lib/constants/course-avatars';

function formatDate(ts: number | string) {
  return new Date(ts).toLocaleDateString();
}

function purposeLabel(p: CourseRecord['purpose']): string {
  if (p === 'research') return '科研';
  if (p === 'university') return '大学课程';
  return '日常使用';
}

function summaryCopy(item: CommunityCourseListItem) {
  if (item.purpose === 'research') return '围绕方法、案例与研究路径组织内容。';
  if (item.purpose === 'university') return '按高校课程节奏整理知识点与课堂素材。';
  return '适合持续学习与日常复习的轻量课程包。';
}

function featuredReason(item: CommunityCourseListItem) {
  if ((item.averageRating ?? 0) >= 4.5) return '本周高评分';
  if ((item.notebookCount ?? 0) >= 8) return '内容完整';
  return '编辑精选';
}

export default function CourseStorePage() {
  const router = useRouter();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const userId = useAuthStore((s) => s.userId);
  const creatorDisplay = useAuthStore(() => '你');
  const [mine, setMine] = useState<Array<{ course: CourseRecord; notebookCount: number }>>([]);
  const [community, setCommunity] = useState<CommunityCourseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [pendingPurchaseCourse, setPendingPurchaseCourse] =
    useState<CommunityCourseListItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const load = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const [courses, communityRows] = await Promise.all([
        listCourses(),
        listCommunityStoreCourses().catch(() => [] as CommunityCourseListItem[]),
      ]);
      const withCounts = await Promise.all(
        courses.map(async (course) => {
          const notebookCount = (await listStagesByCourse(course.id)).length;
          return { course, notebookCount };
        }),
      );
      setMine(withCounts);
      setCommunity(communityRows);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }
    void load();
  }, [isLoggedIn, router, load]);

  const handleCloneCommunityCourse = async (item: CommunityCourseListItem): Promise<boolean> => {
    setAddingId(`c:${item.id}`);
    try {
      const course = await cloneCourseFromStore(item.id);
      if (userId) markCourseOwnedByUser(userId, course.id);
      toast.success(`已复制课程「${course.name}」到我的课程`);
      await load();
      router.push(`/course/${course.id}`);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '复制失败');
      return false;
    } finally {
      setAddingId(null);
    }
  };

  const normalizedSearch = deferredSearchQuery.trim().toLowerCase();
  const searchActive = normalizedSearch.length > 0;

  const filteredCommunity = useMemo(() => {
    if (!searchActive) return community;
    return community.filter((item) => {
      const haystacks = [
        item.name,
        item.description ?? '',
        item.ownerName,
        item.university ?? '',
        item.courseCode ?? '',
        purposeLabel(item.purpose),
        summaryCopy(item),
        item.tags.join(' '),
      ];
      return haystacks.some((value) => value.toLowerCase().includes(normalizedSearch));
    });
  }, [community, normalizedSearch, searchActive]);

  const filteredMine = useMemo(() => {
    if (!searchActive) return mine;
    return mine.filter(({ course }) => {
      const haystacks = [
        course.name,
        course.description ?? '',
        course.university ?? '',
        course.courseCode ?? '',
        purposeLabel(course.purpose),
        course.tags.join(' '),
      ];
      return haystacks.some((value) => value.toLowerCase().includes(normalizedSearch));
    });
  }, [mine, normalizedSearch, searchActive]);

  const featuredCourse = useMemo(() => {
    if (filteredCommunity.length === 0) return null;
    return [...filteredCommunity].sort((a, b) => {
      const scoreA =
        (a.averageRating ?? 0) * 4 +
        (a.reviewCount ?? 0) * 0.3 +
        (a.notebookCount ?? 0) * 0.2 +
        (a.purchased ? -4 : 0);
      const scoreB =
        (b.averageRating ?? 0) * 4 +
        (b.reviewCount ?? 0) * 0.3 +
        (b.notebookCount ?? 0) * 0.2 +
        (b.purchased ? -4 : 0);
      return scoreB - scoreA;
    })[0];
  }, [filteredCommunity]);

  const recentCourses = useMemo(
    () =>
      [...filteredCommunity]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 6),
    [filteredCommunity],
  );

  const purposeShelves = useMemo(() => {
    const groups: Array<{ title: string; subtitle: string; items: CommunityCourseListItem[] }> = [
      {
        title: '大学课程',
        subtitle: '更贴近课堂结构，适合系统学习。',
        items: filteredCommunity.filter((item) => item.purpose === 'university').slice(0, 3),
      },
      {
        title: '科研 / 方法论',
        subtitle: '适合项目推进、研究设计与案例拆解。',
        items: filteredCommunity.filter((item) => item.purpose === 'research').slice(0, 3),
      },
      {
        title: '日常学习',
        subtitle: '适合复习、整理和持续积累。',
        items: filteredCommunity.filter((item) => item.purpose === 'daily').slice(0, 3),
      },
    ];
    return groups.filter((group) => group.items.length > 0);
  }, [filteredCommunity]);

  if (!isLoggedIn) return null;

  return (
    <div className="store-shell store-grid min-h-full w-full overflow-hidden">
      <main className="relative z-10 mx-auto w-full max-w-[92rem] px-4 pb-20 pt-8 md:px-8 lg:px-10">
        <section className="store-hero-panel relative overflow-hidden rounded-[40px] px-6 py-8 md:px-10 md:py-10">
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[34rem] bg-[radial-gradient(circle_at_center,rgba(11,132,255,0.14),transparent_62%)] lg:block" />
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(330px,0.85fr)] lg:items-end">
            <div className="max-w-3xl">
              <p className="text-sm font-medium tracking-[0.22em] text-slate-500 uppercase dark:text-slate-400">
                Syntara 课程商城
              </p>
              <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.045em] text-slate-950 md:text-6xl dark:text-white">
                选一门课，从零散资料变成可开课、可自学的一套内容。
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600 md:text-lg dark:text-slate-300">
                每门课以笔记本与课件组织完整学习路径。社区内容由创作者维护并可定价；购买或复制后，
                整套课程会进入你的空间，便于继续编辑、补充与发布。
              </p>
              <div className="mt-6 max-w-2xl">
                <div className="store-section-panel flex items-center gap-3 rounded-[24px] px-4 py-3">
                  <Search className="size-4 shrink-0 text-slate-400 dark:text-slate-500" />
                  <Input
                    value={searchQuery}
                    onChange={(e) =>
                      startTransition(() => {
                        setSearchQuery(e.target.value);
                      })
                    }
                    placeholder="搜索课程名、创作者、学校、课号或标签"
                    className="h-auto border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-900/5 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-white/10 dark:hover:text-slate-200"
                      aria-label="清空搜索"
                    >
                      <X className="size-4" />
                    </button>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="store-chip text-xs">
                    {searchActive
                      ? `找到 ${filteredCommunity.length} 门社区课程`
                      : `共 ${community.length} 门社区课程`}
                  </span>
                  <span className="store-chip text-xs">
                    {searchActive
                      ? `我的课程匹配 ${filteredMine.length} 门`
                      : `我的课程 ${mine.length} 门`}
                  </span>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (featuredCourse) {
                      router.push(`/store/courses/${featuredCourse.id}`);
                    }
                  }}
                  className="store-cta-primary rounded-full px-5 py-3 text-sm font-semibold"
                >
                  查看精选课程
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/my-courses')}
                  className="store-cta-secondary rounded-full px-5 py-3 text-sm font-semibold"
                >
                  前往我的课程
                </button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-1">
              <div className="store-section-panel rounded-[28px] p-5">
                <p className="text-sm text-slate-500 dark:text-slate-400">社区课程</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-white">
                  {searchActive ? filteredCommunity.length : community.length}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  已发布上架、可供浏览与购买的课程数量；列表会随创作者更新与评分变化。
                </p>
              </div>
              <div className="store-section-panel rounded-[28px] p-5">
                <p className="text-sm text-slate-500 dark:text-slate-400">我的课程</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-white">
                  {searchActive ? filteredMine.length : mine.length}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  自建或已购入的课程总数；在此统一管理笔记本与课程内容。
                </p>
              </div>
              <div className="store-section-panel rounded-[28px] p-5">
                <p className="text-sm text-slate-500 dark:text-slate-400">怎么逛</p>
                <p className="mt-2 flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white">
                  <Compass className="size-4" />
                  按场景与用途
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  下滑可见精选、新上架与大学 / 科研 / 日常等专题货架，按需点进详情再决定购买。
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-12">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium tracking-[0.16em] text-slate-500 uppercase dark:text-slate-400">
                {searchActive ? 'Search Result Spotlight' : 'Editor&apos;s Pick'}
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-white">
                {searchActive ? '搜索结果中的推荐课程' : '编辑精选'}
              </h2>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <div className="h-[34rem] animate-pulse rounded-[34px] bg-white/70 dark:bg-white/6" />
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-1">
                <div className="h-[16.5rem] animate-pulse rounded-[30px] bg-white/70 dark:bg-white/6" />
                <div className="h-[16.5rem] animate-pulse rounded-[30px] bg-white/70 dark:bg-white/6" />
              </div>
            </div>
          ) : featuredCourse ? (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <div className="store-hero-panel rounded-[36px] p-5 md:p-6">
                <CourseGalleryCard
                  variant="store-course"
                  course={{
                    id: featuredCourse.id,
                    name: featuredCourse.name,
                    description:
                      `${summaryCopy(featuredCourse)} ${featuredCourse.description || ''}`.trim(),
                    sceneCount: featuredCourse.notebookCount,
                    createdAt:
                      typeof featuredCourse.createdAt === 'number'
                        ? featuredCourse.createdAt
                        : new Date(featuredCourse.createdAt).getTime(),
                    updatedAt:
                      typeof featuredCourse.updatedAt === 'number'
                        ? featuredCourse.updatedAt
                        : new Date(featuredCourse.updatedAt).getTime(),
                  }}
                  badge={featuredReason(featuredCourse)}
                  subtitle={`更新于 ${formatDate(featuredCourse.updatedAt)}`}
                  creatorName={featuredCourse.ownerName}
                  actionLabel="查看课程"
                  onAction={() => router.push(`/store/courses/${featuredCourse.id}`)}
                  tags={featuredCourse.tags}
                  courseMetaChips={{
                    school: featuredCourse.university?.trim() || undefined,
                    purposeType: purposeLabel(featuredCourse.purpose),
                    courseCode: featuredCourse.courseCode?.trim() || undefined,
                  }}
                  countUnit="个笔记本"
                  priceLabel={formatCreditsLabel(
                    creditsFromPriceCents(featuredCourse.coursePriceCents),
                  )}
                  ratingLabel={`★ ${(featuredCourse.averageRating ?? 0).toFixed(1)} · ${featuredCourse.reviewCount ?? 0} 条`}
                  secondaryActionLabel={
                    addingId === `c:${featuredCourse.id}`
                      ? '购买中…'
                      : featuredCourse.purchased
                        ? '已拥有'
                        : '立即购买'
                  }
                  onSecondaryAction={
                    featuredCourse.purchased || addingId === `c:${featuredCourse.id}`
                      ? undefined
                      : () => setPendingPurchaseCourse(featuredCourse)
                  }
                  coverAvatarUrl={resolveCourseAvatarDisplayUrl(
                    featuredCourse.id,
                    featuredCourse.avatarUrl,
                  )}
                />
              </div>

              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-1">
                {recentCourses
                  .filter((item) => item.id !== featuredCourse.id)
                  .slice(0, 2)
                  .map((item) => (
                    <div key={item.id} className="store-section-panel rounded-[30px] p-5">
                      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                        {featuredReason(item)}
                      </p>
                      <h3 className="mt-3 text-2xl font-semibold tracking-[-0.035em] text-slate-950 dark:text-white">
                        {item.name}
                      </h3>
                      <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                        {summaryCopy(item)}
                      </p>
                      <div className="mt-5 flex flex-wrap gap-2">
                        <span className="store-chip text-xs">{purposeLabel(item.purpose)}</span>
                        <span className="store-chip text-xs">{item.notebookCount} 个笔记本</span>
                        <span className="store-chip text-xs">
                          {formatCreditsLabel(creditsFromPriceCents(item.coursePriceCents))}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => router.push(`/store/courses/${item.id}`)}
                        className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-sky-600 transition-colors hover:text-sky-700 dark:text-sky-300 dark:hover:text-sky-200"
                      >
                        查看详情
                        <ArrowRight className="size-4" />
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            <div className="store-section-panel rounded-[32px] p-10 text-center">
              <p className="text-lg font-semibold text-slate-950 dark:text-white">
                {searchActive ? '没有找到匹配的社区课程' : '社区课程还在上架中'}
              </p>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">
                {searchActive
                  ? `没有课程匹配“${searchQuery.trim()}”。可以试试课程名、学校、创作者、课号或标签。`
                  : '暂无社区课程。请其他用户在课程页「编辑课程」中开启「在课程商城展示」，或稍后再来查看。'}
              </p>
            </div>
          )}
        </section>

        <section className="mt-14">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium tracking-[0.16em] text-slate-500 uppercase dark:text-slate-400">
                {searchActive ? 'Matched Courses' : 'New & Trending'}
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-white">
                {searchActive ? '所有匹配课程' : '新上架与热门课程'}
              </h2>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-[31rem] animate-pulse rounded-[32px] bg-white/70 dark:bg-white/6"
                />
              ))}
            </div>
          ) : filteredCommunity.length === 0 ? null : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {recentCourses.slice(0, 6).map((item) => (
                <CourseGalleryCard
                  key={item.id}
                  variant="store-course"
                  course={{
                    id: item.id,
                    name: item.name,
                    description: `${summaryCopy(item)} ${item.description || ''}`.trim(),
                    sceneCount: item.notebookCount,
                    createdAt:
                      typeof item.createdAt === 'number'
                        ? item.createdAt
                        : new Date(item.createdAt).getTime(),
                    updatedAt:
                      typeof item.updatedAt === 'number'
                        ? item.updatedAt
                        : new Date(item.updatedAt).getTime(),
                  }}
                  tags={item.tags.length > 0 ? item.tags : undefined}
                  badge={featuredReason(item)}
                  subtitle={`更新于 ${formatDate(item.updatedAt)}`}
                  creatorName={item.ownerName}
                  courseMetaChips={{
                    school: item.university?.trim() || undefined,
                    purposeType: purposeLabel(item.purpose),
                    courseCode: item.courseCode?.trim() || undefined,
                  }}
                  countUnit="个笔记本"
                  priceLabel={formatCreditsLabel(creditsFromPriceCents(item.coursePriceCents))}
                  ratingLabel={`★ ${(item.averageRating ?? 0).toFixed(1)} · ${item.reviewCount ?? 0} 条`}
                  actionLabel="查看详情"
                  onAction={() => router.push(`/store/courses/${item.id}`)}
                  secondaryActionLabel={
                    addingId === `c:${item.id}` ? '购买中…' : item.purchased ? '已拥有' : '购买'
                  }
                  onSecondaryAction={
                    item.purchased || addingId === `c:${item.id}`
                      ? undefined
                      : () => setPendingPurchaseCourse(item)
                  }
                  coverAvatarUrl={resolveCourseAvatarDisplayUrl(item.id, item.avatarUrl)}
                />
              ))}
            </div>
          )}
        </section>

        {!searchActive
          ? purposeShelves.map((shelf) => (
              <section key={shelf.title} className="mt-14">
                <div className="mb-6 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium tracking-[0.16em] text-slate-500 uppercase dark:text-slate-400">
                      Browse by Intent
                    </p>
                    <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-white">
                      {shelf.title}
                    </h2>
                    <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">
                      {shelf.subtitle}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                  {shelf.items.map((item) => (
                    <CourseGalleryCard
                      key={item.id}
                      variant="store-course"
                      course={{
                        id: item.id,
                        name: item.name,
                        description: `${summaryCopy(item)} ${item.description || ''}`.trim(),
                        sceneCount: item.notebookCount,
                        createdAt:
                          typeof item.createdAt === 'number'
                            ? item.createdAt
                            : new Date(item.createdAt).getTime(),
                        updatedAt:
                          typeof item.updatedAt === 'number'
                            ? item.updatedAt
                            : new Date(item.updatedAt).getTime(),
                      }}
                      tags={item.tags.length > 0 ? item.tags : undefined}
                      badge={purposeLabel(item.purpose)}
                      subtitle={`更新于 ${formatDate(item.updatedAt)}`}
                      creatorName={item.ownerName}
                      courseMetaChips={{
                        school: item.university?.trim() || undefined,
                        purposeType: purposeLabel(item.purpose),
                        courseCode: item.courseCode?.trim() || undefined,
                      }}
                      countUnit="个笔记本"
                      priceLabel={formatCreditsLabel(creditsFromPriceCents(item.coursePriceCents))}
                      ratingLabel={`★ ${(item.averageRating ?? 0).toFixed(1)} · ${item.reviewCount ?? 0} 条`}
                      actionLabel="查看详情"
                      onAction={() => router.push(`/store/courses/${item.id}`)}
                      secondaryActionLabel={
                        addingId === `c:${item.id}` ? '购买中…' : item.purchased ? '已拥有' : '购买'
                      }
                      onSecondaryAction={
                        item.purchased || addingId === `c:${item.id}`
                          ? undefined
                          : () => setPendingPurchaseCourse(item)
                      }
                      coverAvatarUrl={resolveCourseAvatarDisplayUrl(item.id, item.avatarUrl)}
                    />
                  ))}
                </div>
              </section>
            ))
          : null}

        <section className="mt-14">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium tracking-[0.16em] text-slate-500 uppercase dark:text-slate-400">
                Your Library
              </p>
              <h2 className="mt-2 flex items-center gap-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-white">
                <Library className="size-7" />
                我已有的课程
              </h2>
              <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">
                已购买或自建课程集中展示，方便继续编辑、补充和扩展。
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push('/my-courses')}
              className="hidden rounded-full border border-slate-200 bg-white/70 px-4 py-2 text-sm font-medium text-slate-700 backdrop-blur-sm md:block dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
            >
              前往我的课程
            </button>
          </div>

          {loading ? null : filteredMine.length === 0 ? (
            <div className="store-section-panel rounded-[32px] p-10 text-center">
              <p className="text-lg font-semibold text-slate-950 dark:text-white">
                {searchActive ? '你的课程里没有匹配结果' : '你的课程库还是空的'}
              </p>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">
                {searchActive
                  ? `你已有的课程里没有匹配“${searchQuery.trim()}”的结果。`
                  : '暂无课程。请前往「我的课程」新建课程，或从上方社区课程中购买并复制到自己的空间。'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredMine.map(({ course, notebookCount }) => (
                <CourseGalleryCard
                  key={course.id}
                  variant="owned-course"
                  course={{
                    id: course.id,
                    name: course.name,
                    description:
                      course.description || '你可以继续在此课程下扩充笔记本、组织课堂与发布内容。',
                    sceneCount: notebookCount,
                    createdAt: course.createdAt,
                    updatedAt: course.updatedAt,
                  }}
                  tags={course.tags.length > 0 ? course.tags : undefined}
                  badge={purposeLabel(course.purpose)}
                  subtitle={`更新于 ${formatDate(course.updatedAt)}`}
                  creatorName={creatorDisplay}
                  courseMetaChips={{
                    school: course.university?.trim() || undefined,
                    courseCode: course.courseCode?.trim() || undefined,
                  }}
                  countUnit="个笔记本"
                  actionLabel="进入课程"
                  onAction={() => router.push(`/course/${course.id}`)}
                  coverAvatarUrl={resolveCourseAvatarDisplayUrl(course.id, course.avatarUrl)}
                />
              ))}
            </div>
          )}
        </section>

        {featuredCourse && !searchActive ? (
          <section className="mt-14">
            <div className="store-section-panel flex flex-col gap-6 rounded-[36px] px-6 py-7 md:flex-row md:items-center md:justify-between md:px-8">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
                  <Star className="size-4" />
                  课程详情页已同步升级
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950 dark:text-white">
                  继续查看课程详情，像浏览产品发布页一样了解完整内容。
                </h2>
              </div>
              <button
                type="button"
                onClick={() => router.push(`/store/courses/${featuredCourse.id}`)}
                className="store-cta-primary rounded-full px-5 py-3 text-sm font-semibold"
              >
                打开精选课程
              </button>
            </div>
          </section>
        ) : null}

        <PurchaseConfirmDialog
          open={Boolean(pendingPurchaseCourse)}
          onOpenChange={(open) => {
            if (!open) setPendingPurchaseCourse(null);
          }}
          itemTypeLabel="课程"
          itemName={pendingPurchaseCourse?.name ?? ''}
          creditsCost={creditsFromPriceCents(pendingPurchaseCourse?.coursePriceCents ?? 0)}
          countSummary={
            pendingPurchaseCourse
              ? `将复制整门课程到你的个人空间，包含 ${pendingPurchaseCourse.notebookCount} 本笔记本。`
              : undefined
          }
          note="确认后会立即扣除对应 credits，并把整门课程复制到你的课程库。"
          busy={pendingPurchaseCourse ? addingId === `c:${pendingPurchaseCourse.id}` : false}
          confirmLabel="确认购买课程"
          onConfirm={() =>
            pendingPurchaseCourse ? handleCloneCommunityCourse(pendingPurchaseCourse) : false
          }
        />
      </main>
    </div>
  );
}
