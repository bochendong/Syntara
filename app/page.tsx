'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Languages,
  LogOut,
  Menu,
  Map as MapIcon,
  MessageSquareText,
  Play,
  Presentation,
  ShoppingBag,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import { SyntaraMark } from '@/components/brand/syntara-mark';
import { TalkingAvatarOverlay } from '@/components/canvas/talking-avatar-overlay';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { createNotebookHref, courseOrchestratorChatHref } from '@/lib/constants/course-chat';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useAuthStore } from '@/lib/store/auth';
import { useCurrentCourseStore } from '@/lib/store/current-course';

const HOME_IMAGES = {
  realClassroom: '/home/syntara-real-classroom-hero.png',
  classroomWorkflow: '/home/syntara-classroom-workflow.png',
  classroomQuestions: '/home/syntara-classroom-questions.png',
  classroomTrace: '/home/syntara-classroom-trace.png',
  marketplace: '/home/syntara-course-marketplace.png',
  notebookAgent: '/home/syntara-notebook-agent-chat.png',
  problemBank: '/home/syntara-course-problem-bank.png',
  reviewPlan: '/home/syntara-review-plan.png',
  mentorCompanion: '/home/syntara-mentor-companion.png',
  studio: '/home/syntara-studio-hero.png',
  classroom: '/home/syntara-classroom-scene.png',
  library: '/home/syntara-resource-library.png',
} as const;

type HomeImageSlide = {
  src: string;
  alt: string;
};

type HomeCopy = {
  nav: {
    classroom: string;
    chat: string;
    problemBank: string;
    review: string;
    mentor: string;
    store: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    body: string;
    primary: string;
    secondary: string;
    status: string;
    imageAlt: string;
  };
  headerCta: string;
  logout: string;
  workflow: Array<{
    label: string;
    title: string;
    body: string;
  }>;
  classroom: {
    label: string;
    title: string;
    body: string;
    action: string;
    imageAlt: string;
  };
  chat: {
    label: string;
    title: string;
    body: string;
    action: string;
    imageAlt: string;
  };
  problemBank: {
    label: string;
    title: string;
    body: string;
    action: string;
    imageAlt: string;
  };
  reviewPlan: {
    label: string;
    title: string;
    body: string;
    action: string;
    imageAlt: string;
  };
  mentor: {
    label: string;
    title: string;
    body: string;
    action: string;
    imageAlt: string;
    live2dLabel: string;
    live2dTitle: string;
    live2dBody: string;
  };
  store: {
    label: string;
    title: string;
    body: string;
    action: string;
    imageAlt: string;
  };
  closing: {
    title: string;
    body: string;
    action: string;
  };
};

function copyForLocale(isZh: boolean, currentCourseName: string, isLoggedIn: boolean): HomeCopy {
  if (isZh) {
    return {
      nav: {
        classroom: '课堂',
        chat: '聊天',
        problemBank: '题库',
        review: '复习',
        mentor: '导师',
        store: '商城',
      },
      headerCta: isLoggedIn ? '我的课程' : '登录体验',
      logout: '退出',
      hero: {
        eyebrow: '为课程创作者打造的 AI 教学系统',
        title: 'Syntara AI 课堂操作台',
        body: '从一份材料，到一堂会讲、会练、会陪伴的课。Syntara 把创作、授课、复习和分发，放进一个安静而漂亮的工作流。',
        primary: currentCourseName ? '继续创作' : '开始一门课',
        secondary: '观看课堂',
        status: currentCourseName
          ? `正在创作：${currentCourseName}`
          : '无需配置，先体验一间 AI 教室',
        imageAlt:
          '生成图片：参考真实课堂页面绘制的 AI 课堂画面，包含彩色阶段条、课程卡片和代码执行追踪。',
      },
      workflow: [
        {
          label: '01',
          title: '给它材料',
          body: 'PDF、课件、想法。先整理成一份可以继续生长的 notebook。',
        },
        {
          label: '02',
          title: '让它开讲',
          body: '幻灯片、讲稿和虚拟讲师同步出现，知识开始有现场感。',
        },
        {
          label: '03',
          title: '留下价值',
          body: '聊天、题库、复习路线和课程商城，把一次创作变成长期资产。',
        },
      ],
      classroom: {
        label: 'Live classroom',
        title: '不是播放课件。是一间正在发生的课堂。',
        body: '讲师在讲，代码在跑，问题在出现。每一页都像真正站上讲台。',
        action: '进入课堂',
        imageAlt: '生成图片：真实课堂风格的课程页面，展示讲解卡片、代码面板和状态快照。',
      },
      chat: {
        label: 'Notebook Agent',
        title: '每本笔记，都会长出自己的 Agent。',
        body: '它记得材料，理解上下文，也能把一个问题带回原文、题库和课堂。',
        action: '打开 Agent',
        imageAlt:
          '生成图片：参考真实聊天页绘制的笔记本 Agent 工作区，包含左侧 Agent 列表、聊天画布和右侧对象面板。',
      },
      problemBank: {
        label: 'Course problem bank',
        title: '讲过的内容，立刻变成可以练的题。',
        body: '从课堂到题库，不需要重新整理。知识点、难度、状态，全都在该在的位置。',
        action: '打开题库',
        imageAlt:
          '生成图片：参考真实课程题库绘制的题目工作台，左侧为题目列表，右侧为选择题详情和提交按钮。',
      },
      reviewPlan: {
        label: 'Review route',
        title: '复习，也可以像一次冒险。',
        body: '知识点变成路线，薄弱处变成关卡。学生知道下一步，也愿意走下去。',
        action: '进入复习路线',
        imageAlt:
          '生成图片：参考真实学生复习计划页绘制的复习路线图，包含路线进度、奖励积分、知识点标签和关卡节点。',
      },
      mentor: {
        label: 'Live2D mentor',
        title: '一个会陪你学习的导师。',
        body: '可收集，可培养，也会出现在课堂、提醒和练习反馈里。旁边的小舞台，是真的会动。',
        action: '进入导师系统',
        imageAlt: '生成图片：导师陪伴系统活动页，包含讲师收集、星愿补给、亲密度进度和导师头像池。',
        live2dLabel: '会动的 Live2D 导师预览',
        live2dTitle: '实时陪学预览',
        live2dBody: '可作为课堂讲师、通知陪伴和练习反馈角色。',
      },
      store: {
        label: 'Course marketplace',
        title: '好课，不该只停在一个人的电脑里。',
        body: '把 notebook、课堂和练习包装成课程商品，让更多人发现、购买、复用。',
        action: '浏览商城',
        imageAlt: '生成图片：参考真实课程商城绘制的首页预览，包含精选课程卡片和三列热门课程榜单。',
      },
      closing: {
        title: '一份材料进来。一间 AI 教室诞生。',
        body: '创作、上课、练习、复习、分发。所有关键步骤，优雅地连在一起。',
        action: currentCourseName ? '继续创作' : '进入我的课程',
      },
    };
  }

  return {
    nav: {
      classroom: 'Classroom',
      chat: 'Chat',
      problemBank: 'Problems',
      review: 'Review',
      mentor: 'Mentor',
      store: 'Store',
    },
    headerCta: isLoggedIn ? 'My courses' : 'Try Syntara',
    logout: 'Log out',
    hero: {
      eyebrow: 'An AI teaching system for course creators',
      title: 'Syntara AI Classroom Studio',
      body: 'From one piece of material to a class that teaches, practices, and stays with learners. Syntara turns course creation into one quiet, beautiful flow.',
      primary: currentCourseName ? 'Keep creating' : 'Start a course',
      secondary: 'Watch classroom',
      status: currentCourseName
        ? `Now creating: ${currentCourseName}`
        : 'Open an AI classroom before setup gets in the way',
      imageAlt:
        'Generated image inspired by the real classroom page, with colored progress bars, lesson cards, and a code execution trace.',
    },
    workflow: [
      {
        label: '01',
        title: 'Give it material',
        body: 'PDFs, decks, notes, or just an idea. It becomes a notebook that can keep growing.',
      },
      {
        label: '02',
        title: 'Let it teach',
        body: 'Slides, scripts, and the presenter appear together. The lesson starts to feel alive.',
      },
      {
        label: '03',
        title: 'Keep the value',
        body: 'Chat, problems, review routes, and the marketplace turn one course into a lasting asset.',
      },
    ],
    classroom: {
      label: 'Live classroom',
      title: 'Not a slide player. A classroom in motion.',
      body: 'The presenter speaks, code runs, questions arrive. Every page feels ready for the room.',
      action: 'Enter classroom',
      imageAlt:
        'Generated image of a real-classroom-style lesson page with explanation cards, a code panel, and state snapshot.',
    },
    chat: {
      label: 'Notebook Agent',
      title: 'Every notebook gets its own agent.',
      body: 'It remembers the material, understands the context, and can carry a question back to the source.',
      action: 'Open agent',
      imageAlt:
        'Generated image inspired by the real chat page, with notebook agents, a central chat canvas, and an object inspector.',
    },
    problemBank: {
      label: 'Course problem bank',
      title: 'What you teach becomes what they practice.',
      body: 'Knowledge points, difficulty, status, and answers stay organized without rebuilding the course by hand.',
      action: 'Open problem bank',
      imageAlt:
        'Generated image inspired by the real course problem bank, with a question list, selected multiple-choice problem, and submit button.',
    },
    reviewPlan: {
      label: 'Review route',
      title: 'Review can feel like an adventure.',
      body: 'Knowledge becomes a route. Weak spots become levels. Learners can see the next step and want to take it.',
      action: 'Open review route',
      imageAlt:
        'Generated image inspired by the real student review plan page, with route progress, reward points, knowledge tags, and challenge nodes.',
    },
    mentor: {
      label: 'Live2D mentor',
      title: 'A mentor that stays with the learner.',
      body: 'Collect them, build affinity, and bring them into class, reminders, and feedback. The side stage really moves.',
      action: 'Open mentor system',
      imageAlt:
        'Generated image of the mentor companion system with character collection, wish draw actions, affinity progress, and mentor avatars.',
      live2dLabel: 'Animated Live2D mentor preview',
      live2dTitle: 'Live companion preview',
      live2dBody: 'Works as a classroom presenter, reminder companion, and practice feedback role.',
    },
    store: {
      label: 'Course marketplace',
      title: 'Great courses should travel.',
      body: 'Package notebooks, classrooms, and practice into course products people can discover, buy, and reuse.',
      action: 'Browse store',
      imageAlt:
        'Generated image inspired by the real course marketplace, with featured course cards and three-column trending course lists.',
    },
    closing: {
      title: 'A piece of material goes in. An AI classroom comes out.',
      body: 'Creation, teaching, practice, review, distribution. The essential steps, connected with care.',
      action: currentCourseName ? 'Keep creating' : 'Go to my courses',
    },
  };
}

function GeneratedSceneImage({
  src,
  alt,
  priority = false,
}: {
  src: string;
  alt: string;
  priority?: boolean;
}) {
  return (
    <figure className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_16px_42px_rgba(24,24,27,0.1)] sm:rounded-[28px] sm:shadow-[0_28px_80px_rgba(24,24,27,0.12)]">
      <img
        src={src}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        className="aspect-[16/9] h-full w-full object-cover"
      />
    </figure>
  );
}

function ClassroomImageCarousel({ slides, label }: { slides: HomeImageSlide[]; label: string }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeSlide = slides[activeIndex] ?? slides[0];

  const selectSlide = useCallback((index: number) => {
    setActiveIndex(index);
  }, []);

  return (
    <figure
      className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_16px_42px_rgba(24,24,27,0.1)] sm:rounded-[28px] sm:shadow-[0_28px_80px_rgba(24,24,27,0.12)]"
      aria-label={label}
    >
      <div className="relative aspect-[16/9] w-full">
        {activeSlide ? (
          <img
            key={activeSlide.src}
            src={activeSlide.src}
            alt={activeSlide.alt}
            loading="eager"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}
      </div>

      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-zinc-200 bg-white/85 px-2.5 py-1.5 shadow-sm backdrop-blur sm:bottom-4 sm:gap-2 sm:px-3 sm:py-2">
        {slides.map((slide, index) => (
          <button
            key={slide.src}
            type="button"
            className={`h-2.5 rounded-full transition-all ${
              index === activeIndex ? 'w-7 bg-zinc-950' : 'w-2.5 bg-zinc-300 hover:bg-zinc-500'
            }`}
            aria-label={`${label} ${index + 1}`}
            aria-current={index === activeIndex ? 'true' : undefined}
            onClick={() => selectSlide(index)}
          />
        ))}
      </div>
    </figure>
  );
}

function WorkflowBand({ items }: { items: HomeCopy['workflow'] }) {
  return (
    <section className="border-y border-zinc-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-0 px-4 py-0 sm:px-6 md:grid-cols-3 lg:px-8">
        {items.map((item) => (
          <article
            key={item.label}
            className="border-zinc-200 py-6 md:border-r md:px-5 md:py-7 last:md:border-r-0 lg:px-8 lg:py-8"
          >
            <div className="mb-4 flex items-center gap-3">
              <span className="font-mono text-sm text-zinc-400">{item.label}</span>
              <span className="h-px flex-1 bg-zinc-200" />
            </div>
            <h2 className="text-xl font-semibold text-zinc-950 sm:text-2xl">{item.title}</h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-zinc-600">{item.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function CapabilitySection({
  icon: Icon,
  label,
  title,
  body,
  action,
  onAction,
  children,
  reverse = false,
}: {
  icon: LucideIcon;
  label: string;
  title: string;
  body: string;
  action: string;
  onAction: () => void;
  children: ReactNode;
  reverse?: boolean;
}) {
  return (
    <section className="mx-auto grid max-w-7xl items-center gap-6 px-4 py-10 sm:gap-8 sm:px-6 sm:py-12 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:py-14 lg:grid-cols-2 lg:gap-10 lg:px-8 lg:py-20">
      <div className={reverse ? 'md:order-2' : undefined}>
        <div className="mb-4 inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 sm:mb-5">
          <Icon className="size-4 text-[#2f6fed]" />
          {label}
        </div>
        <h2 className="max-w-xl text-3xl font-semibold text-zinc-950 sm:text-4xl lg:text-5xl">
          {title}
        </h2>
        <p className="mt-4 max-w-xl text-base leading-7 text-zinc-600 sm:mt-5 sm:leading-8">
          {body}
        </p>
        <Button
          type="button"
          size="lg"
          className="mt-6 rounded-lg bg-zinc-950 px-4 text-white hover:bg-zinc-800 sm:mt-7"
          onClick={onAction}
        >
          {action}
          <ArrowRight className="size-4" />
        </Button>
      </div>
      <div className={reverse ? 'md:order-1' : undefined}>{children}</div>
    </section>
  );
}

function MentorCompanionVisual({
  imageSrc,
  imageAlt,
  live2dLabel,
  live2dTitle,
  live2dBody,
}: {
  imageSrc: string;
  imageAlt: string;
  live2dLabel: string;
  live2dTitle: string;
  live2dBody: string;
}) {
  const live2dStageRef = useRef<HTMLElement | null>(null);
  const [shouldMountLive2D, setShouldMountLive2D] = useState(false);

  useEffect(() => {
    if (shouldMountLive2D) return;
    const stage = live2dStageRef.current;
    if (!stage) return;

    if (!('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShouldMountLive2D(true);
          observer.disconnect();
        }
      },
      { rootMargin: '360px 0px' },
    );
    observer.observe(stage);
    return () => observer.disconnect();
  }, [shouldMountLive2D]);

  return (
    <div className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_200px] xl:grid-cols-[minmax(0,1fr)_220px]">
      <GeneratedSceneImage src={imageSrc} alt={imageAlt} />

      <aside
        ref={live2dStageRef}
        aria-label={live2dLabel}
        className="relative min-h-[220px] overflow-hidden rounded-2xl border border-violet-200/50 bg-[radial-gradient(circle_at_50%_10%,rgba(167,139,250,0.38),transparent_48%),linear-gradient(180deg,#18111f_0%,#0b1020_100%)] shadow-[0_16px_42px_rgba(24,24,27,0.14)] sm:min-h-[260px] sm:rounded-[28px] lg:min-h-[300px] lg:shadow-[0_28px_80px_rgba(24,24,27,0.18)]"
      >
        <div className="absolute inset-x-3 top-3 z-20 rounded-2xl border border-white/14 bg-white/10 px-3 py-2.5 text-white shadow-lg backdrop-blur sm:inset-x-4 sm:top-4 sm:px-4 sm:py-3">
          <p className="text-xs font-semibold text-violet-100/80">Live2D mentor</p>
          <p className="mt-1 text-sm font-semibold">{live2dTitle}</p>
        </div>
        <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:36px_36px]" />
        <div className="absolute inset-x-0 bottom-0 top-16 z-10 sm:top-20">
          {shouldMountLive2D ? (
            <TalkingAvatarOverlay
              layout="card"
              speaking={false}
              cadence="idle"
              modelIdOverride="hiyori"
              cardFraming="stage"
              showBadge={false}
              showStatusDot={false}
              className="h-full w-full"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center px-5 text-center text-violet-50/75">
              <div className="rounded-2xl border border-white/12 bg-white/10 px-4 py-4 shadow-lg backdrop-blur sm:py-5">
                <Sparkles className="mx-auto mb-3 size-6 text-violet-200" />
                <p className="text-sm font-semibold">{live2dTitle}</p>
                <p className="mt-2 text-xs leading-5 text-violet-50/65">{live2dBody}</p>
              </div>
            </div>
          )}
        </div>
        <div className="absolute inset-x-3 bottom-3 z-20 rounded-2xl border border-white/12 bg-black/28 px-3 py-2.5 text-xs leading-5 text-violet-50/82 backdrop-blur sm:inset-x-4 sm:bottom-4 sm:px-4 sm:py-3">
          {live2dBody}
        </div>
      </aside>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { locale, setLocale } = useI18n();
  const isZh = locale === 'zh-CN';
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  const authMode = useAuthStore((state) => state.authMode);
  const logout = useAuthStore((state) => state.logout);
  const currentCourseId = useCurrentCourseStore((state) => state.id);
  const currentCourseName = useCurrentCourseStore((state) => state.name);
  const copy = useMemo(
    () => copyForLocale(isZh, currentCourseName, isLoggedIn),
    [currentCourseName, isLoggedIn, isZh],
  );
  const heroSlides = useMemo<HomeImageSlide[]>(
    () => [
      {
        src: HOME_IMAGES.realClassroom,
        alt: copy.hero.imageAlt,
      },
      {
        src: HOME_IMAGES.classroomWorkflow,
        alt: isZh
          ? '生成图片：四阶段课程项目课堂页，包含阶段卡片、流程箭头和结构化产出表格。'
          : 'Generated classroom image showing a four-stage course project workflow with cards, arrows, and a structured output table.',
      },
      {
        src: HOME_IMAGES.classroomQuestions,
        alt: isZh
          ? '生成图片：写类前的三步判断课堂页，包含对象、状态和边界检查。'
          : 'Generated classroom image showing three pre-class-writing questions for object, state, and boundaries.',
      },
      {
        src: HOME_IMAGES.classroomTrace,
        alt: isZh
          ? '生成图片：执行追踪课堂页，包含代码高亮、步骤控制和状态快照。'
          : 'Generated classroom image showing an execution trace lesson with highlighted code, step controls, and a state snapshot.',
      },
    ],
    [copy.hero.imageAlt, isZh],
  );

  const goToCoursesOrLogin = useCallback(() => {
    router.push(isLoggedIn ? '/my-courses' : '/login');
  }, [isLoggedIn, router]);

  const goToCreate = useCallback(() => {
    if (!isLoggedIn) {
      router.push('/login');
      return;
    }
    router.push(createNotebookHref(currentCourseId));
  }, [currentCourseId, isLoggedIn, router]);

  const goToClassroom = useCallback(() => {
    if (!isLoggedIn) {
      router.push('/login');
      return;
    }
    router.push(
      currentCourseId ? `/classroom/${encodeURIComponent(currentCourseId)}` : '/my-courses',
    );
  }, [currentCourseId, isLoggedIn, router]);

  const goToChat = useCallback(() => {
    router.push(isLoggedIn ? courseOrchestratorChatHref() : '/login');
  }, [isLoggedIn, router]);

  const goToProblemBank = useCallback(() => {
    if (!isLoggedIn) {
      router.push('/login');
      return;
    }
    router.push(
      currentCourseId
        ? `/course/${encodeURIComponent(currentCourseId)}/problem-bank`
        : '/my-courses',
    );
  }, [currentCourseId, isLoggedIn, router]);

  const goToReviewPlan = useCallback(() => {
    if (!isLoggedIn) {
      router.push('/login');
      return;
    }
    router.push(currentCourseId ? `/course/${encodeURIComponent(currentCourseId)}` : '/my-courses');
  }, [currentCourseId, isLoggedIn, router]);

  const goToMentor = useCallback(() => {
    router.push(isLoggedIn ? '/live2d' : '/login');
  }, [isLoggedIn, router]);

  const goToStore = useCallback(() => {
    router.push(isLoggedIn ? '/store/courses' : '/login');
  }, [isLoggedIn, router]);

  const handleLogout = useCallback(async () => {
    logout();
    if (authMode === 'oauth') {
      await signOut({ callbackUrl: '/' });
      return;
    }
    router.push('/');
  }, [authMode, logout, router]);

  const navItems: Array<{ label: string; action: () => void; icon: LucideIcon }> = [
    { label: copy.nav.classroom, action: goToClassroom, icon: Presentation },
    { label: copy.nav.chat, action: goToChat, icon: MessageSquareText },
    { label: copy.nav.problemBank, action: goToProblemBank, icon: ClipboardList },
    { label: copy.nav.review, action: goToReviewPlan, icon: MapIcon },
    { label: copy.nav.mentor, action: goToMentor, icon: Sparkles },
    { label: copy.nav.store, action: goToStore, icon: ShoppingBag },
  ];

  return (
    <main className="min-h-dvh bg-[#f3f4f1] text-zinc-950">
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-[#f3f4f1]/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-6 lg:px-8">
          <button
            type="button"
            className="flex min-w-0 shrink items-center gap-2 sm:gap-3"
            onClick={() => router.push('/')}
          >
            <SyntaraMark className="rounded-lg" />
            <div className="min-w-0 text-left">
              <p className="text-sm font-semibold text-zinc-950">Syntara</p>
              <p className="hidden text-xs text-zinc-500 sm:block">{copy.hero.eyebrow}</p>
            </div>
          </button>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Homepage">
            {navItems.map((item) => (
              <button
                key={item.label}
                type="button"
                className="whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-white hover:text-zinc-950"
                onClick={item.action}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className="rounded-lg border-zinc-200 bg-white lg:hidden"
                  aria-label={isZh ? '打开导航菜单' : 'Open navigation menu'}
                >
                  <Menu className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 rounded-xl border-zinc-200 bg-white p-1.5 shadow-xl"
              >
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <DropdownMenuItem
                      key={item.label}
                      className="rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-700"
                      onSelect={() => item.action()}
                    >
                      <Icon className="size-4 text-[#2f6fed]" />
                      {item.label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="rounded-lg border-zinc-200 bg-white"
              onClick={() => setLocale(isZh ? 'en-US' : 'zh-CN')}
            >
              <Languages className="size-4" />
              <span className="sr-only">{isZh ? 'Switch to English' : '切换到中文'}</span>
            </Button>
            <Button
              type="button"
              size="sm"
              className="rounded-lg bg-zinc-950 px-2 text-white hover:bg-zinc-800 min-[380px]:px-2.5"
              aria-label={copy.headerCta}
              onClick={goToCoursesOrLogin}
            >
              <BookOpen className="size-4 min-[380px]:hidden" />
              <span className="hidden min-[380px]:inline">{copy.headerCta}</span>
              <ChevronRight className="hidden size-4 min-[380px]:block" />
            </Button>
            {isLoggedIn ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-lg"
                onClick={handleLogout}
              >
                <LogOut className="size-4" />
                <span className="sr-only">{copy.logout}</span>
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-zinc-200 bg-[linear-gradient(180deg,#f3f4f1_0%,#ffffff_100%)]">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(24,24,27,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(24,24,27,0.05)_1px,transparent_1px)] bg-[size:48px_48px]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-5 px-4 py-7 sm:gap-7 sm:px-6 sm:py-10 md:grid-cols-[0.46fr_0.54fr] lg:min-h-[70dvh] lg:grid-cols-[0.42fr_0.58fr] lg:gap-10 lg:px-8">
          <div className="max-w-xl">
            <Badge
              variant="outline"
              className="mb-4 border-zinc-300 bg-white text-zinc-700 sm:mb-5"
            >
              <Sparkles className="size-3.5 text-[#f5b044]" />
              {copy.hero.eyebrow}
            </Badge>
            <h1 className="text-4xl font-semibold text-zinc-950 sm:text-5xl lg:text-6xl xl:text-7xl">
              {copy.hero.title}
            </h1>
            <p className="mt-5 text-base leading-7 text-zinc-600 sm:text-lg sm:leading-8 lg:mt-6">
              {copy.hero.body}
            </p>
            <div className="mt-7 flex flex-col gap-3 min-[360px]:flex-row min-[360px]:flex-wrap min-[360px]:items-center lg:mt-8">
              <Button
                type="button"
                size="lg"
                className="w-full rounded-lg bg-zinc-950 px-4 text-white hover:bg-zinc-800 min-[360px]:w-auto"
                onClick={goToCreate}
              >
                <WandSparkles className="size-4" />
                {copy.hero.primary}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="w-full rounded-lg border-zinc-300 bg-white px-4 min-[360px]:w-auto"
                onClick={goToClassroom}
              >
                <Play className="size-4" />
                {copy.hero.secondary}
              </Button>
            </div>
            <div className="mt-6 flex max-w-md items-center gap-3 border-l-2 border-[#2f6fed] bg-white px-4 py-3 text-sm text-zinc-600 lg:mt-7">
              <CheckCircle2 className="size-4 shrink-0 text-[#10b981]" />
              <span className="min-w-0">{copy.hero.status}</span>
            </div>
          </div>

          <ClassroomImageCarousel
            slides={heroSlides}
            label={isZh ? '课堂画面轮播' : 'Classroom image carousel'}
          />
        </div>
      </section>

      <WorkflowBand items={copy.workflow} />

      <CapabilitySection
        icon={Presentation}
        label={copy.classroom.label}
        title={copy.classroom.title}
        body={copy.classroom.body}
        action={copy.classroom.action}
        onAction={goToClassroom}
      >
        <GeneratedSceneImage src={HOME_IMAGES.classroomTrace} alt={copy.classroom.imageAlt} />
      </CapabilitySection>

      <CapabilitySection
        icon={MessageSquareText}
        label={copy.chat.label}
        title={copy.chat.title}
        body={copy.chat.body}
        action={copy.chat.action}
        onAction={goToChat}
        reverse
      >
        <GeneratedSceneImage src={HOME_IMAGES.notebookAgent} alt={copy.chat.imageAlt} />
      </CapabilitySection>

      <CapabilitySection
        icon={ClipboardList}
        label={copy.problemBank.label}
        title={copy.problemBank.title}
        body={copy.problemBank.body}
        action={copy.problemBank.action}
        onAction={goToProblemBank}
      >
        <GeneratedSceneImage src={HOME_IMAGES.problemBank} alt={copy.problemBank.imageAlt} />
      </CapabilitySection>

      <CapabilitySection
        icon={MapIcon}
        label={copy.reviewPlan.label}
        title={copy.reviewPlan.title}
        body={copy.reviewPlan.body}
        action={copy.reviewPlan.action}
        onAction={goToReviewPlan}
        reverse
      >
        <GeneratedSceneImage src={HOME_IMAGES.reviewPlan} alt={copy.reviewPlan.imageAlt} />
      </CapabilitySection>

      <CapabilitySection
        icon={Sparkles}
        label={copy.mentor.label}
        title={copy.mentor.title}
        body={copy.mentor.body}
        action={copy.mentor.action}
        onAction={goToMentor}
      >
        <MentorCompanionVisual
          imageSrc={HOME_IMAGES.mentorCompanion}
          imageAlt={copy.mentor.imageAlt}
          live2dLabel={copy.mentor.live2dLabel}
          live2dTitle={copy.mentor.live2dTitle}
          live2dBody={copy.mentor.live2dBody}
        />
      </CapabilitySection>

      <CapabilitySection
        icon={ShoppingBag}
        label={copy.store.label}
        title={copy.store.title}
        body={copy.store.body}
        action={copy.store.action}
        onAction={goToStore}
      >
        <GeneratedSceneImage src={HOME_IMAGES.marketplace} alt={copy.store.imageAlt} />
      </CapabilitySection>

      <section className="border-t border-zinc-200 bg-zinc-950 text-white">
        <div className="mx-auto grid max-w-7xl gap-7 px-4 py-10 sm:px-6 sm:py-12 lg:grid-cols-[1fr_auto] lg:gap-8 lg:px-8 lg:py-14">
          <div>
            <h2 className="max-w-3xl text-3xl font-semibold sm:text-4xl">{copy.closing.title}</h2>
            <p className="mt-4 max-w-2xl text-base leading-8 text-zinc-400">{copy.closing.body}</p>
          </div>
          <div className="flex items-center">
            <Button
              type="button"
              size="lg"
              className="w-full rounded-lg bg-white px-4 text-zinc-950 hover:bg-zinc-200 sm:w-auto"
              onClick={goToCreate}
            >
              <BookOpen className="size-4" />
              {copy.closing.action}
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
