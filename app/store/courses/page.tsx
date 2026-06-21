'use client';

import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Compass, Search, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { PurchaseConfirmDialog } from '@/components/courses/purchase-confirm-dialog';
import {
  StoreFeatureStrip,
  StoreListSection,
  type StorefrontItem,
} from '@/components/store/storefront-sections';
import { Input } from '@/components/ui/input';
import { usePersistHydrated } from '@/lib/hooks/use-persist-hydrated';
import { useAuthStore } from '@/lib/store/auth';
import {
  enrollCourseFromStore,
  listCommunityStoreCourses,
  listCourses,
} from '@/lib/utils/course-storage';
import { creditsFromPriceCents, formatPurchaseCreditsLabel } from '@/lib/utils/credits';
import { listStagesByCourse } from '@/lib/utils/stage-storage';
import type { CommunityCourseListItem, CourseRecord } from '@/lib/utils/database';
import { markCourseOwnedByUser } from '@/lib/utils/course-ownership';
import { toast } from '@/lib/notifications/client-toast';
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

function speechStatusLabel(
  item: Pick<CommunityCourseListItem, 'speechStatus' | 'speechReadyCount' | 'speechTotalCount'>,
) {
  return item.speechTotalCount ? '讲解稿就绪，可生成我的语音' : '可生成我的语音';
}

export default function CourseStorePage() {
  const router = useRouter();
  const authHydrated = usePersistHydrated(useAuthStore);
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
    if (!authHydrated || !isLoggedIn) return;
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
  }, [authHydrated, isLoggedIn]);

  useEffect(() => {
    if (!authHydrated) return;
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }
    void load();
  }, [authHydrated, isLoggedIn, router, load]);

  const handleEnrollCommunityCourse = async (item: CommunityCourseListItem): Promise<boolean> => {
    setAddingId(`c:${item.id}`);
    try {
      const course = await enrollCourseFromStore(item.id);
      if (userId) markCourseOwnedByUser(userId, course.id);
      toast.success(`已加入课程「${course.name}」`);
      await load();
      router.push(`/learn?courseId=${encodeURIComponent(course.id)}`);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加入失败');
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
        .slice(0, 9),
    [filteredCommunity],
  );

  const purposeShelves = useMemo(() => {
    const groups: Array<{ title: string; subtitle: string; items: CommunityCourseListItem[] }> = [
      {
        title: '大学课程',
        subtitle: '更贴近课堂结构，适合系统学习。',
        items: filteredCommunity.filter((item) => item.purpose === 'university').slice(0, 9),
      },
      {
        title: '科研 / 方法论',
        subtitle: '适合项目推进、研究设计与案例拆解。',
        items: filteredCommunity.filter((item) => item.purpose === 'research').slice(0, 9),
      },
      {
        title: '日常学习',
        subtitle: '适合复习、整理和持续积累。',
        items: filteredCommunity.filter((item) => item.purpose === 'daily').slice(0, 9),
      },
    ];
    return groups.filter((group) => group.items.length > 0);
  }, [filteredCommunity]);

  const toCommunityStorefrontItem = useCallback(
    (item: CommunityCourseListItem): StorefrontItem => {
      const openCourse = () => router.push(`/store/courses/${item.id}`);
      const busy = addingId === `c:${item.id}`;
      const priceLabel = formatPurchaseCreditsLabel(creditsFromPriceCents(item.coursePriceCents));

      return {
        id: item.id,
        title: item.name,
        subtitle: `创作者 · ${item.ownerName}`,
        description: `${summaryCopy(item)} ${item.description || ''}`.trim(),
        eyebrow: featuredReason(item),
        badge: purposeLabel(item.purpose),
        courseCode: item.courseCode?.trim() || undefined,
        artworkUrl: resolveCourseAvatarDisplayUrl(item.id, item.avatarUrl),
        metadata: [
          item.university?.trim() || purposeLabel(item.purpose),
          `${item.notebookCount} 个笔记本`,
          `★ ${(item.averageRating ?? 0).toFixed(1)} · ${item.reviewCount ?? 0} 条`,
          speechStatusLabel(item),
        ].filter(Boolean) as string[],
        openLabel: '查看课程',
        onOpen: openCourse,
        primaryActionLabel: busy ? '加入中…' : item.purchased ? '已加入' : priceLabel,
        primaryActionDisabled: item.purchased || busy,
        onPrimaryAction: item.purchased ? openCourse : () => setPendingPurchaseCourse(item),
      };
    },
    [addingId, router],
  );

  const toOwnedStorefrontItem = useCallback(
    ({
      course,
      notebookCount,
    }: {
      course: CourseRecord;
      notebookCount: number;
    }): StorefrontItem => {
      const joined = course.accessRole === 'enrolled';
      return {
        id: course.id,
        title: course.name,
        subtitle:
          course.description ||
          (joined
            ? '创建者维护的共享课程，学习记录会单独保存。'
            : '你可以继续扩充笔记本、组织课堂与发布内容。'),
        description:
          course.description ||
          (joined
            ? '创建者维护的共享课程，学习记录会单独保存。'
            : '你可以继续扩充笔记本、组织课堂与发布内容。'),
        eyebrow: joined ? 'Joined Course' : 'Your Library',
        badge: purposeLabel(course.purpose),
        courseCode: course.courseCode?.trim() || undefined,
        artworkUrl: resolveCourseAvatarDisplayUrl(course.id, course.avatarUrl),
        metadata: [
          `创作者 · ${joined ? course.sourceOwnerName?.trim() || '创作者' : creatorDisplay}`,
          `${notebookCount} 个笔记本`,
          course.university?.trim() || `更新于 ${formatDate(course.updatedAt)}`,
        ].filter(Boolean) as string[],
        primaryActionLabel: joined ? '进入学习' : '课程 Studio',
        onPrimaryAction: () =>
          router.push(
            joined
              ? `/learn?courseId=${encodeURIComponent(course.id)}`
              : `/creator/courses/${encodeURIComponent(course.id)}`,
          ),
      };
    },
    [creatorDisplay, router],
  );

  const featuredItems = useMemo(() => {
    const candidates = featuredCourse
      ? [featuredCourse, ...recentCourses.filter((item) => item.id !== featuredCourse.id)]
      : recentCourses;
    return candidates.slice(0, 2).map(toCommunityStorefrontItem);
  }, [featuredCourse, recentCourses, toCommunityStorefrontItem]);

  const communityListItems = useMemo(() => {
    const source = searchActive ? filteredCommunity : recentCourses;
    return source.slice(0, 9).map(toCommunityStorefrontItem);
  }, [filteredCommunity, recentCourses, searchActive, toCommunityStorefrontItem]);

  const ownedCourseItems = useMemo(
    () => filteredMine.map(toOwnedStorefrontItem),
    [filteredMine, toOwnedStorefrontItem],
  );

  if (!authHydrated || !isLoggedIn) return null;

  return (
    <div className="store-shell store-grid min-h-full w-full overflow-hidden">
      <main className="relative z-10 mx-auto w-full max-w-[92rem] px-3 pb-16 pt-4 sm:px-4 sm:pt-6 md:px-8 md:pb-20 lg:px-10 lg:pt-8">
        <section className="store-hero-panel relative overflow-hidden px-4 py-6 sm:rounded-[40px] sm:px-6 sm:py-8 md:px-10 md:py-10">
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[34rem] bg-[radial-gradient(circle_at_center,rgba(11,132,255,0.14),transparent_62%)] xl:block" />
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(330px,0.85fr)] xl:items-end">
            <div className="max-w-3xl">
              <p className="text-sm font-medium tracking-[0.22em] text-slate-500 uppercase dark:text-slate-400">
                Syntara 课程商城
              </p>
              <h1 className="mt-4 max-w-4xl text-3xl font-semibold text-slate-950 sm:text-4xl md:text-6xl dark:text-white">
                选一门课，从零散资料变成可开课、可自学的一套内容。
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600 md:text-lg dark:text-slate-300">
                每门课以笔记本与课件组织完整学习路径。社区内容由创作者维护并可定价；加入后，
                你会持续看到创建者更新的共享内容，做题记录和私有记忆则只属于你。
              </p>
              <div className="mt-6 max-w-2xl">
                <div className="store-section-panel flex min-w-0 items-center gap-3 px-4 py-3 sm:rounded-[24px]">
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
              <div className="mt-6 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    if (featuredCourse) {
                      router.push(`/store/courses/${featuredCourse.id}`);
                    }
                  }}
                  className="store-cta-primary rounded-full px-5 py-3 text-sm font-semibold min-[420px]:w-auto"
                >
                  查看精选课程
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/my-courses')}
                  className="store-cta-secondary rounded-full px-5 py-3 text-sm font-semibold min-[420px]:w-auto"
                >
                  前往我的课程
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1 xl:gap-4">
              <div className="store-section-panel p-4 sm:rounded-[28px] sm:p-5">
                <p className="text-sm text-slate-500 dark:text-slate-400">社区课程</p>
                <p className="mt-2 text-3xl font-semibold text-slate-950 dark:text-white">
                  {searchActive ? filteredCommunity.length : community.length}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  已发布上架、可供浏览与加入的课程数量；列表会随创作者更新与评分变化。
                </p>
              </div>
              <div className="store-section-panel p-4 sm:rounded-[28px] sm:p-5">
                <p className="text-sm text-slate-500 dark:text-slate-400">我的课程</p>
                <p className="mt-2 text-3xl font-semibold text-slate-950 dark:text-white">
                  {searchActive ? filteredMine.length : mine.length}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  自建或已加入的课程总数；在此统一管理学习入口。
                </p>
              </div>
              <div className="store-section-panel p-4 sm:rounded-[28px] sm:p-5">
                <p className="text-sm text-slate-500 dark:text-slate-400">怎么逛</p>
                <p className="mt-2 flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white">
                  <Compass className="size-4" />
                  按场景与用途
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  下滑可见精选、新上架与大学 / 科研 / 日常等专题货架，按需点进详情再决定加入。
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-10">
          {loading ? (
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="h-52 animate-pulse rounded-[26px] bg-white/70 dark:bg-white/6" />
              <div className="h-52 animate-pulse rounded-[26px] bg-white/70 dark:bg-white/6" />
            </div>
          ) : featuredItems.length > 0 ? (
            <StoreFeatureStrip items={featuredItems} />
          ) : (
            <div className="rounded-[22px] border border-slate-200/75 bg-white/70 p-8 text-center dark:border-white/10 dark:bg-white/6">
              <p className="text-base font-semibold text-slate-950 dark:text-white">
                {searchActive ? '没有找到匹配的社区课程' : '社区课程还在上架中'}
              </p>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                {searchActive
                  ? `没有课程匹配“${searchQuery.trim()}”。可以试试课程名、学校、创作者、课号或标签。`
                  : '暂无社区课程。请其他用户在课程页「编辑课程」中开启「在课程商城展示」，或稍后再来查看。'}
              </p>
            </div>
          )}
        </section>

        {loading ? (
          <section className="mt-12 border-t border-slate-200/75 pt-6 dark:border-white/10">
            <div className="mb-5 h-9 w-48 animate-pulse rounded-full bg-white/70 dark:bg-white/6" />
            <div className="grid gap-x-8 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 9 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-[6.25rem] animate-pulse border-t border-slate-200/75 py-3.5 dark:border-white/10"
                >
                  <div className="h-full rounded-2xl bg-white/70 dark:bg-white/6" />
                </div>
              ))}
            </div>
          </section>
        ) : (
          <StoreListSection
            className="mt-12"
            eyebrow={searchActive ? 'Matched Courses' : 'New & Trending'}
            title={searchActive ? '所有匹配课程' : '新上架与热门课程'}
            subtitle={
              searchActive
                ? '按 App Store 式榜单展示匹配项，先扫标题、来源和价格，再点进详情。'
                : '把更多课程压缩成可快速浏览的三列榜单，避免整页都被大封面卡占满。'
            }
            items={communityListItems}
            emptyTitle={searchActive ? '没有找到匹配的社区课程' : '社区课程还在上架中'}
            emptyDescription={
              searchActive
                ? `没有课程匹配“${searchQuery.trim()}”。可以试试课程名、学校、创作者、课号或标签。`
                : '暂无社区课程。请其他用户在课程页「编辑课程」中开启「在课程商城展示」，或稍后再来查看。'
            }
          />
        )}

        {!searchActive
          ? purposeShelves.map((shelf) => (
              <StoreListSection
                key={shelf.title}
                className="mt-12"
                eyebrow="Browse by Intent"
                title={shelf.title}
                subtitle={shelf.subtitle}
                items={shelf.items.map(toCommunityStorefrontItem)}
              />
            ))
          : null}

        {loading ? null : (
          <StoreListSection
            className="mt-12"
            eyebrow="Your Library"
            title="我已有的课程"
            subtitle="已加入或自建课程集中展示，创建者内容会持续更新。"
            actionLabel="前往我的课程"
            onAction={() => router.push('/my-courses')}
            items={ownedCourseItems}
            emptyTitle={searchActive ? '你的课程里没有匹配结果' : '你的课程库还是空的'}
            emptyDescription={
              searchActive
                ? `你已有的课程里没有匹配“${searchQuery.trim()}”的结果。`
                : '暂无课程。请前往「我的课程」新建课程，或从上方社区课程中加入一门共享课程。'
            }
          />
        )}

        <PurchaseConfirmDialog
          open={Boolean(pendingPurchaseCourse)}
          onOpenChange={(open) => {
            if (!open) setPendingPurchaseCourse(null);
          }}
          itemTypeLabel="课程"
          itemName={pendingPurchaseCourse?.name ?? ''}
          creditsCost={creditsFromPriceCents(pendingPurchaseCourse?.coursePriceCents ?? 0)}
          accountType="PURCHASE"
          countSummary={
            pendingPurchaseCourse
              ? `将加入这门共享课程，包含 ${pendingPurchaseCourse.notebookCount} 本笔记本。`
              : undefined
          }
          note="确认后会立即扣除对应购买积分，并把课程加入你的课程库；内容由创建者维护，语音由你按自己的音色生成。"
          busy={pendingPurchaseCourse ? addingId === `c:${pendingPurchaseCourse.id}` : false}
          confirmLabel="确认加入课程"
          onConfirm={() =>
            pendingPurchaseCourse ? handleEnrollCommunityCourse(pendingPurchaseCourse) : false
          }
        />
      </main>
    </div>
  );
}
