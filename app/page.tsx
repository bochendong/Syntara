'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  BookOpen,
  Bot,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Languages,
  MessagesSquare,
  MessageSquareText,
  Pause,
  Play,
  Presentation,
  Search,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';
import { Conversation, ConversationContent } from '@/components/ai-elements/conversation';
import { Message, MessageContent } from '@/components/ai-elements/message';
import { SyntaraMark } from '@/components/brand/syntara-mark';
import { TalkingAvatarOverlay } from '@/components/canvas/talking-avatar-overlay';
import { CourseGalleryCard } from '@/components/course-gallery-card';
import { ThumbnailSlide } from '@/components/slide-renderer/components/ThumbnailSlide';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/hooks/use-i18n';
import { resolveCourseOrchestratorAvatar } from '@/lib/constants/course-chat';
import { resolveNotebookAgentAvatarDisplayUrl } from '@/lib/constants/notebook-agent-avatars';
import { useAuthStore } from '@/lib/store/auth';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import type { PPTShapeElement, PPTTextElement, Slide } from '@/lib/types/slides';
import { USER_AVATAR } from '@/lib/types/roundtable';
import type { StageListItem } from '@/lib/utils/stage-storage';

const BASE_THEME = {
  backgroundColor: '#f8fafc',
  themeColors: ['#2563eb', '#0f172a', '#f59e0b', '#14b8a6'],
  fontColor: '#0f172a',
  fontName: 'Microsoft YaHei',
};

const RECT_PATH = 'M 0 0 L 200 0 L 200 200 L 0 200 Z';
const PAGE_IDS = ['overview', 'classroom', 'chat', 'store'] as const;

type IntroPageCopy = {
  nav: string;
  badge: string;
  title: string;
  description: string;
  primary: string;
  secondary: string;
  points: [string, string, string];
};

type ClassroomPageCopy = {
  nav: string;
  badge: string;
  title: string;
  description: string;
  speech: string;
  primary: string;
  secondary: string;
};

type ChatPageCopy = {
  nav: string;
  badge: string;
  title: string;
  description: string;
  prompt: string;
};

type StorePageCopy = {
  nav: string;
  badge: string;
  title: string;
  description: string;
  stat: string;
  action: string;
};

type HomePageCopy = {
  brandLine: string;
  headerCta: string;
  currentCourse: string;
  pages: [IntroPageCopy, ClassroomPageCopy, ChatPageCopy, StorePageCopy];
  chatMessages: Array<{
    role: 'user' | 'assistant';
    text: string;
  }>;
};

type ChatSidebarItem = {
  id: string;
  title: string;
  subtitle?: string;
  icon: 'agent' | 'group' | 'notebook';
  avatarSrc?: string;
  active?: boolean;
  busy?: boolean;
};

function createTextElement(args: {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  content: string;
  defaultColor?: string;
  textType?: PPTTextElement['textType'];
  fill?: string;
}): PPTTextElement {
  return {
    id: args.id,
    type: 'text',
    left: args.left,
    top: args.top,
    width: args.width,
    height: args.height,
    rotate: 0,
    content: args.content,
    defaultFontName: 'Microsoft YaHei',
    defaultColor: args.defaultColor ?? '#0f172a',
    textType: args.textType,
    lineHeight: 1.35,
    fill: args.fill,
  };
}

function createRectElement(args: {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fill: string;
  opacity?: number;
}): PPTShapeElement {
  return {
    id: args.id,
    type: 'shape',
    left: args.left,
    top: args.top,
    width: args.width,
    height: args.height,
    rotate: 0,
    viewBox: [200, 200],
    path: RECT_PATH,
    fixedRatio: false,
    fill: args.fill,
    opacity: args.opacity,
  };
}

function buildNotebookSlide(args: {
  id: string;
  kicker: string;
  title: string;
  subtitle: string;
  accent: string;
  note: string;
  bulletA: string;
  bulletB: string;
}): Slide {
  return {
    id: args.id,
    viewportSize: 1000,
    viewportRatio: 0.5625,
    theme: BASE_THEME,
    background: {
      type: 'gradient',
      gradient: {
        type: 'linear',
        rotate: 135,
        colors: [
          { pos: 0, color: '#fffaf0' },
          { pos: 55, color: '#eef4ff' },
          { pos: 100, color: '#f8fafc' },
        ],
      },
    },
    elements: [
      createRectElement({
        id: `${args.id}-panel-dark`,
        left: 560,
        top: 86,
        width: 270,
        height: 126,
        fill: '#0f172a',
      }),
      createRectElement({
        id: `${args.id}-panel-accent`,
        left: 626,
        top: 256,
        width: 250,
        height: 136,
        fill: args.accent,
      }),
      createRectElement({
        id: `${args.id}-panel-soft`,
        left: 728,
        top: 122,
        width: 168,
        height: 90,
        fill: '#ffffff',
        opacity: 0.92,
      }),
      createTextElement({
        id: `${args.id}-kicker`,
        left: 72,
        top: 72,
        width: 320,
        height: 30,
        defaultColor: '#2563eb',
        content: `<p style="font-size:16px;font-weight:700;color:#2563eb;">${args.kicker}</p>`,
      }),
      createTextElement({
        id: `${args.id}-title`,
        left: 72,
        top: 106,
        width: 446,
        height: 110,
        textType: 'title',
        content: `<p style="font-size:34px;font-weight:800;color:#0f172a;">${args.title}</p><p style="font-size:19px;color:#475569;">${args.subtitle}</p>`,
      }),
      createTextElement({
        id: `${args.id}-bullets`,
        left: 72,
        top: 252,
        width: 440,
        height: 130,
        textType: 'content',
        content: `<p style="font-size:18px;color:#0f172a;">1. ${args.bulletA}</p><p style="font-size:18px;color:#0f172a;">2. ${args.bulletB}</p><p style="font-size:18px;color:#0f172a;">3. 课堂、问答、练习连续展开</p>`,
      }),
      createTextElement({
        id: `${args.id}-note-dark`,
        left: 586,
        top: 112,
        width: 210,
        height: 72,
        defaultColor: '#f8fafc',
        content: `<p style="font-size:26px;font-weight:700;color:#f8fafc;">Notebook</p><p style="font-size:14px;color:#cbd5e1;">生成讲解页、例题页、练习页</p>`,
      }),
      createTextElement({
        id: `${args.id}-note-accent`,
        left: 652,
        top: 286,
        width: 194,
        height: 76,
        defaultColor: '#0f172a',
        content: `<p style="font-size:24px;font-weight:700;color:#0f172a;">${args.note}</p><p style="font-size:14px;color:#334155;">课堂演示中的真实组件</p>`,
      }),
    ],
  };
}

const CLASSROOM_PLAYLIST = [
  {
    id: 'intro',
    label: '01',
    speechText: '今天我们先把线性系统写成矩阵形式，再一步步进入消元与解的判断。',
    slide: buildNotebookSlide({
      id: 'home-classroom-slide-1',
      kicker: 'AI Classroom',
      title: '矩阵与线性系统',
      subtitle: '从 Ax = b 到 RREF，再走到矩阵运算与乘法',
      accent: '#fbbf24',
      note: 'RREF',
      bulletA: '先把线性系统写成增广矩阵',
      bulletB: '再用高斯消元判断解的情况',
    }),
  },
  {
    id: 'elimination',
    label: '02',
    speechText: '接着我们把方程组写成增广矩阵，用行变换一步一步把结构化简出来。',
    slide: buildNotebookSlide({
      id: 'home-classroom-slide-2',
      kicker: 'Worked Example',
      title: '高斯消元法',
      subtitle: '通过初等行变换把系统化到更容易判断的形式',
      accent: '#60a5fa',
      note: 'Elim',
      bulletA: '逐步消去主元下方的系数',
      bulletB: '保留中间矩阵，方便课堂讲解',
    }),
  },
  {
    id: 'solutions',
    label: '03',
    speechText: '最后我们根据化简后的结果，区分唯一解、无穷多解和无解。',
    slide: buildNotebookSlide({
      id: 'home-classroom-slide-3',
      kicker: 'Solution Types',
      title: '如何判断解的情况',
      subtitle: '从化简后的矩阵直接读出系统是唯一解、无穷多解还是无解',
      accent: '#34d399',
      note: 'Solve',
      bulletA: '看是否出现矛盾行',
      bulletB: '看是否存在自由变量',
    }),
  },
] as const;

const STORE_SLIDES: Slide[] = [
  buildNotebookSlide({
    id: 'catalog-slide-1',
    kicker: 'University Course',
    title: '线性代数导学',
    subtitle: '概念、例题、课堂讲解完整联动',
    accent: '#60a5fa',
    note: 'Ax=b',
    bulletA: '概念页和例题页交替推进',
    bulletB: '适合课程化讲授和复习',
  }),
  buildNotebookSlide({
    id: 'catalog-slide-2',
    kicker: 'Paper Reading',
    title: '论文讲读课堂模板',
    subtitle: '把研究阅读变成可讲、可问、可卖的内容',
    accent: '#34d399',
    note: 'MAP',
    bulletA: '章节拆分、公式梳理、问题引导',
    bulletB: '适合 seminar 和 lab meeting',
  }),
  buildNotebookSlide({
    id: 'catalog-slide-3',
    kicker: 'Code Sprint',
    title: 'Python 数据分析',
    subtitle: '代码、图表、聊天协作放在一个课堂流里',
    accent: '#f472b6',
    note: 'Code',
    bulletA: '讲代码时还能同步答疑',
    bulletB: '也适合拿去做商城资源',
  }),
  buildNotebookSlide({
    id: 'catalog-slide-4',
    kicker: 'Exam Prep',
    title: '高数冲刺模板',
    subtitle: '重点知识、典型题、错因复盘一套走完',
    accent: '#f59e0b',
    note: 'Quiz',
    bulletA: '适合短周期冲刺复习',
    bulletB: '适合售卖可复用讲义包',
  }),
];

function ClassroomPlaybackShowcase({
  items,
  className,
}: {
  items: readonly {
    id: string;
    label: string;
    speechText: string;
    slide: Slide;
  }[];
  className?: string;
}) {
  const { locale } = useI18n();
  const presenterCaption = locale === 'zh-CN' ? '虚拟讲师' : 'Virtual presenter';
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [frameWidth, setFrameWidth] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      setFrameWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!playing || items.length <= 1) return;

    const timer = window.setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length);
    }, 3400);

    return () => window.clearTimeout(timer);
  }, [currentIndex, items.length, playing]);

  const currentItem = items[currentIndex] ?? items[0];
  if (!currentItem) return null;

  return (
    <div className={`grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem] ${className ?? ''}`}>
      <div className="relative overflow-hidden rounded-[32px] border border-white/15 bg-white/10 p-3 shadow-[0_28px_90px_rgba(0,0,0,0.24)] backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between gap-3 rounded-[22px] border border-white/10 bg-black/14 px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
              Live Lesson
            </p>
            <p className="mt-1 text-sm font-medium text-white">
              {`Slide ${currentItem.label} / ${String(items.length).padStart(2, '0')}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous slide"
              className="inline-flex size-9 items-center justify-center rounded-full border border-white/12 bg-white/8 text-white/80 transition hover:bg-white/14 hover:text-white"
              onClick={() => setCurrentIndex((prev) => (prev - 1 + items.length) % items.length)}
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label={playing ? 'Pause slide playback' : 'Play slide playback'}
              className="inline-flex size-10 items-center justify-center rounded-full bg-white text-slate-950 transition hover:bg-white/90"
              onClick={() => setPlaying((prev) => !prev)}
            >
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            </button>
            <button
              type="button"
              aria-label="Next slide"
              className="inline-flex size-9 items-center justify-center rounded-full border border-white/12 bg-white/8 text-white/80 transition hover:bg-white/14 hover:text-white"
              onClick={() => setCurrentIndex((prev) => (prev + 1) % items.length)}
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>

        <div
          ref={frameRef}
          className="relative overflow-hidden rounded-[26px]"
          style={{ aspectRatio: '16 / 9' }}
        >
          {frameWidth > 0 ? (
            <ThumbnailSlide
              slide={currentItem.slide}
              size={frameWidth}
              viewportSize={currentItem.slide.viewportSize}
              viewportRatio={currentItem.slide.viewportRatio}
            />
          ) : null}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-slate-950/24 to-transparent" />
        </div>

        <div className="mt-3 space-y-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <motion.div
              key={`${currentItem.id}-${playing ? 'playing' : 'paused'}`}
              initial={{ width: playing ? '0%' : `${((currentIndex + 1) / items.length) * 100}%` }}
              animate={{
                width: playing ? '100%' : `${((currentIndex + 1) / items.length) * 100}%`,
              }}
              transition={playing ? { duration: 3.4, ease: 'linear' } : { duration: 0.2 }}
              className="h-full rounded-full bg-white"
            />
          </div>
          <div className="rounded-[22px] border border-white/10 bg-slate-950/60 px-4 py-3 text-left text-white">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">Lecture Script</p>
            <p className="mt-2 text-sm font-medium leading-7 text-white/88">
              {currentItem.speechText}
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[32px] border border-white/15 bg-white/8 p-3 shadow-[0_28px_90px_rgba(0,0,0,0.22)] backdrop-blur-xl">
        <div className="flex h-full min-h-[26rem] flex-col overflow-hidden rounded-[24px] bg-[linear-gradient(180deg,rgba(9,12,18,0.7)_0%,rgba(11,17,26,0.94)_100%)]">
          <TalkingAvatarOverlay
            speaking={playing}
            cadence={playing ? 'active' : 'idle'}
            speechText={currentItem.speechText}
            layout="sidebar"
          />
          <div className="border-t border-white/8 px-4 py-4 text-white/78">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42">
              {presenterCaption}
            </p>
            <p className="mt-2 text-sm leading-7">{currentItem.speechText}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({
  page,
  badge,
  title,
  description,
}: {
  page: string;
  badge: string;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.28em] text-white/55">
          {page}
        </span>
        <Badge
          variant="outline"
          className="rounded-full border-white/20 bg-white/10 px-3 py-1 text-white/85 backdrop-blur"
        >
          <Sparkles className="size-3.5" />
          {badge}
        </Badge>
      </div>
      <div className="space-y-3">
        <h2 className="max-w-xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
          {title}
        </h2>
        {description ? (
          <p className="max-w-xl text-base leading-8 text-white/72 md:text-lg">{description}</p>
        ) : null}
      </div>
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
  const currentCourseAvatarUrl = useCurrentCourseStore((state) => state.avatarUrl);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Array<HTMLElement | null>>([]);
  const [activePage, setActivePage] = useState(0);
  const courseAgentAvatar = useMemo(
    () => resolveCourseOrchestratorAvatar(currentCourseId, currentCourseAvatarUrl),
    [currentCourseAvatarUrl, currentCourseId],
  );

  const copy = useMemo<HomePageCopy>(
    () =>
      isZh
        ? {
            brandLine: '幻灯片 · 虚拟讲师 · 聊天 · 商城',
            headerCta: isLoggedIn ? '我的课程' : '登录体验',
            currentCourse: currentCourseName
              ? `当前课程：${currentCourseName}`
              : '支持本地优先快速体验',
            pages: [
              {
                nav: '总览',
                badge: 'AI 教学工作流',
                title: '一套内容，直接变成可讲、可问、可售卖的 AI 课堂',
                description:
                  '从生成课件到进入课堂，再到课后答疑和资源分发，Syntara 把完整教学链路放进同一个产品里。',
                primary: '立即体验',
                secondary: '查看课堂',
                points: [
                  '课件、Notebook 与讲解同屏展开',
                  '围绕当前内容继续追问、改写和补题',
                  '把课程沉淀成模板、资源和可分发内容',
                ],
              },
              {
                nav: '课堂',
                badge: '真实课堂现场',
                title: '真实课件正在播放，旁边就是正在讲解的 2D 讲师。',
                description: '',
                speech: '今天我们从线性系统出发，把它整理成矩阵，再一步步走到 RREF 与解的判断。',
                primary: '进入课堂',
                secondary: '继续看聊天',
              },
              {
                nav: '聊天',
                badge: '持续追问',
                title: '讲完之后，继续问下去',
                description:
                  '课堂不是终点。你可以围绕当前 notebook 继续追问概念、补例题、改讲稿、生成练习，把学习自然往下推进。',
                prompt: '把这节课继续往下推进：补一个完整例题，再加两个练习',
              },
              {
                nav: '商城',
                badge: '课程模板与资源',
                title: '把课程沉淀成可复用的资源库',
                description:
                  '模板、课件和 notebook 可以持续沉淀、复用、分发，甚至直接进入商城，让内容不只服务一堂课。',
                stat: '128+ 模板、课件与资源',
                action: '浏览资源',
              },
            ],
            chatMessages: [
              {
                role: 'user' as const,
                text: '这节矩阵课讲完以后，我想继续往下追问和补题。',
              },
              {
                role: 'assistant' as const,
                text: '可以，聊天页会承接课堂后的继续学习，比如补例题、改讲稿、加练习。',
              },
              {
                role: 'user' as const,
                text: '那我能不能直接让它把某一页的例题再讲细一点？',
              },
              {
                role: 'assistant' as const,
                text: '可以，你可以针对当前 notebook、当前课堂页，继续要求补步骤、补解释、补练习。',
              },
              {
                role: 'user' as const,
                text: '那我还能顺着这节课继续生成测验和讨论题吗？',
              },
              {
                role: 'assistant' as const,
                text: '可以，聊天会围绕当前课堂继续往下生成练习、讨论和补充材料。',
              },
            ],
          }
        : {
            brandLine: 'Slides · Presenter · Chat · Marketplace',
            headerCta: isLoggedIn ? 'My courses' : 'Sign in',
            currentCourse: currentCourseName
              ? `Current course: ${currentCourseName}`
              : 'Works in fast local-first mode',
            pages: [
              {
                nav: 'Overview',
                badge: 'AI teaching workflow',
                title:
                  'Turn one body of content into an AI classroom that can teach, answer, and scale',
                description:
                  'From lesson generation to live teaching, follow-up chat, and content distribution, Syntara brings the full teaching workflow into one product.',
                primary: 'Start now',
                secondary: 'View classroom',
                points: [
                  'Slides, notebook content, and explanation stay on one screen',
                  'Chat keeps the lesson going with rewrites, examples, and practice',
                  'Courses can become reusable templates, assets, and distributable content',
                ],
              },
              {
                nav: 'Classroom',
                badge: 'Live classroom',
                title:
                  'A real lesson is already playing, with the 2D presenter teaching right beside it.',
                description: '',
                speech:
                  'We start from the linear system, rewrite it as a matrix, then move step by step toward RREF and solution classification.',
                primary: 'Enter classroom',
                secondary: 'See chat',
              },
              {
                nav: 'Chat',
                badge: 'Follow-up chat',
                title: 'When the lesson ends, the conversation keeps going',
                description:
                  'The classroom is not the finish line. Learners can keep asking about concepts, request more examples, rewrite explanations, and generate practice around the current notebook.',
                prompt:
                  'Keep this lesson going: add one full worked example and two follow-up exercises',
              },
              {
                nav: 'Store',
                badge: 'Marketplace resources',
                title: 'Turn lessons into a reusable library of resources',
                description:
                  'Templates, lesson decks, and notebooks can be reused, shared, and even sold so the value of a course extends far beyond a single session.',
                stat: '128+ templates, decks, and assets',
                action: 'Browse resources',
              },
            ],
            chatMessages: [
              {
                role: 'user' as const,
                text: 'After the matrix lesson ends, I want to keep asking follow-up questions and add more exercises.',
              },
              {
                role: 'assistant' as const,
                text: 'That is exactly what the chat surface is for: extending the lesson with examples, rewrites, and practice.',
              },
              {
                role: 'user' as const,
                text: 'Can I ask it to rewrite one notebook page and explain the steps more slowly?',
              },
              {
                role: 'assistant' as const,
                text: 'Yes. The chat can stay grounded in the current notebook and keep deepening the same lesson.',
              },
              {
                role: 'user' as const,
                text: 'Can I also generate quizzes and discussion prompts from the same lesson?',
              },
              {
                role: 'assistant' as const,
                text: 'Yes. The chat can keep extending the same lesson with quizzes, prompts, and supporting material.',
              },
            ],
          },
    [currentCourseName, isLoggedIn, isZh],
  );

  const storeCards = useMemo<StageListItem[]>(
    () => [
      {
        id: 'catalog-1',
        name: isZh ? '线性代数导学模板' : 'Linear Algebra Starter',
        description: isZh
          ? '概念页、例题页、课堂页完整打包。'
          : 'A reusable pack for concepts, worked examples, and classroom slides.',
        sceneCount: 18,
        tags: isZh
          ? ['大学课程', '矩阵', '例题密集']
          : ['University', 'Matrices', 'Worked examples'],
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'catalog-2',
        name: isZh ? '论文讲读课堂模板' : 'Paper Reading Deck',
        description: isZh
          ? '适合 seminar 和 lab meeting。'
          : 'Great for seminar and lab meeting walkthroughs.',
        sceneCount: 12,
        tags: isZh ? ['科研', '讨论', '论文'] : ['Research', 'Discussion', 'Paper'],
        createdAt: 2,
        updatedAt: 2,
      },
      {
        id: 'catalog-3',
        name: isZh ? 'Python 数据分析课件' : 'Python Analytics Pack',
        description: isZh
          ? '代码、图表、练习在一个课堂流里。'
          : 'Code, charts, and exercises in one classroom flow.',
        sceneCount: 15,
        tags: isZh ? ['编程', '图表', '课堂'] : ['Programming', 'Charts', 'Classroom'],
        createdAt: 3,
        updatedAt: 3,
      },
      {
        id: 'catalog-4',
        name: isZh ? '高数冲刺模板' : 'Calculus Sprint Deck',
        description: isZh
          ? '冲刺复习、讲题和测验结合。'
          : 'Exam sprint lessons with walkthroughs and quizzes.',
        sceneCount: 10,
        tags: isZh ? ['考试', '冲刺', '习题'] : ['Exam', 'Sprint', 'Practice'],
        createdAt: 4,
        updatedAt: 4,
      },
      {
        id: 'catalog-5',
        name: isZh ? '概率图模型速览' : 'Probabilistic Models Briefing',
        description: isZh
          ? '研究阅读和课堂讲解两用。'
          : 'Useful for both research reading and teaching.',
        sceneCount: 14,
        tags: isZh ? ['科研', '公式', '讲解'] : ['Research', 'Equations', 'Teaching'],
        createdAt: 5,
        updatedAt: 5,
      },
      {
        id: 'catalog-6',
        name: isZh ? '机器学习导学卡包' : 'ML Intro Collection',
        description: isZh
          ? '适合上新课、卖模板、做演示。'
          : 'Useful for new lessons, templates, and demos.',
        sceneCount: 20,
        tags: isZh ? ['机器学习', '商城', '模板'] : ['ML', 'Marketplace', 'Template'],
        createdAt: 6,
        updatedAt: 6,
      },
    ],
    [isZh],
  );

  const chatSidebarSections = useMemo<Array<{ title: string; items: ChatSidebarItem[] }>>(
    () => [
      {
        title: isZh ? '课程 Agent' : 'Course Agent',
        items: [
          {
            id: 'course-agent',
            title: currentCourseName || (isZh ? '矩阵与线性系统' : 'Matrices and Linear Systems'),
            subtitle: isZh ? '课程总控' : 'Course orchestrator',
            icon: 'agent',
            avatarSrc: courseAgentAvatar,
            active: true,
            busy: true,
          },
        ],
      },
      {
        title: isZh ? '群聊' : 'Group Chat',
        items: [
          {
            id: 'group-chat',
            title: isZh ? '群聊' : 'Group chat',
            subtitle: isZh ? '课程内协作会话' : 'Shared course discussion',
            icon: 'group',
          },
        ],
      },
      {
        title: isZh ? '笔记本' : 'Notebooks',
        items: [
          {
            id: 'nb-1',
            title: isZh ? '矩阵与线性系统入门' : 'Matrices and Linear Systems',
            subtitle: isZh
              ? '当前对话围绕这本 notebook 展开'
              : 'Current conversation is grounded here',
            icon: 'notebook',
            avatarSrc: resolveNotebookAgentAvatarDisplayUrl('home-chat-nb-1'),
          },
          {
            id: 'nb-2',
            title: isZh ? '高斯消元完整例题' : 'Gaussian Elimination Walkthrough',
            subtitle: isZh ? '最近追问：补完整步骤' : 'Recent request: add full steps',
            icon: 'notebook',
            avatarSrc: resolveNotebookAgentAvatarDisplayUrl('home-chat-nb-2'),
          },
          {
            id: 'nb-3',
            title: isZh ? '矩阵乘法练习包' : 'Matrix Multiplication Practice',
            subtitle: isZh ? '最近追问：再生成两题' : 'Recent request: generate two more exercises',
            icon: 'notebook',
            avatarSrc: resolveNotebookAgentAvatarDisplayUrl('home-chat-nb-3'),
          },
        ],
      },
    ],
    [courseAgentAvatar, currentCourseName, isZh],
  );

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const handleScroll = () => {
      const nextIndex = Math.round(scroller.scrollTop / Math.max(scroller.clientHeight, 1));
      setActivePage(Math.max(0, Math.min(PAGE_IDS.length - 1, nextIndex)));
    };

    handleScroll();
    scroller.addEventListener('scroll', handleScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLogout = useCallback(async () => {
    logout();
    if (authMode === 'oauth') {
      await signOut({ callbackUrl: '/' });
      return;
    }
    router.push('/');
  }, [authMode, logout, router]);

  const goToMyCoursesOrLogin = useCallback(() => {
    router.push(isLoggedIn ? '/my-courses' : '/login');
  }, [isLoggedIn, router]);

  const goToChat = useCallback(() => {
    router.push(isLoggedIn ? '/chat' : '/login');
  }, [isLoggedIn, router]);

  const goToStore = useCallback(() => {
    router.push(isLoggedIn ? '/store' : '/login');
  }, [isLoggedIn, router]);

  const scrollToPage = useCallback((index: number) => {
    sectionRefs.current[index]?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, []);

  return (
    <div className="relative h-[100dvh] overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-12%] top-[-10%] h-[30rem] w-[30rem] rounded-full bg-sky-500/18 blur-3xl" />
        <div className="absolute right-[-10%] top-[12%] h-[28rem] w-[28rem] rounded-full bg-amber-400/16 blur-3xl" />
        <div className="absolute bottom-[-14%] left-[22%] h-[32rem] w-[32rem] rounded-full bg-fuchsia-500/14 blur-3xl" />
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-40">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 pt-4 md:px-8 md:pt-6">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-white/12 bg-white/10 px-4 py-2 backdrop-blur-xl">
            <SyntaraMark />
            <div>
              <p className="text-sm font-semibold tracking-tight text-white">Syntara</p>
              <p className="text-[11px] text-white/55">{copy.brandLine}</p>
            </div>
          </div>

          <div className="pointer-events-auto flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full border-white/16 bg-white/10 text-white hover:bg-white/16 hover:text-white"
              onClick={() => setLocale(isZh ? 'en-US' : 'zh-CN')}
            >
              <Languages className="size-4" />
              {isZh ? 'English' : '中文'}
            </Button>
            <Button
              type="button"
              size="sm"
              className="rounded-full bg-white text-slate-950 hover:bg-white/90"
              onClick={goToMyCoursesOrLogin}
            >
              {copy.headerCta}
            </Button>
            {isLoggedIn ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="rounded-full text-white/80 hover:bg-white/12 hover:text-white"
                onClick={handleLogout}
              >
                {isZh ? '退出' : 'Log out'}
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="pointer-events-none absolute right-4 top-1/2 z-40 hidden -translate-y-1/2 lg:flex">
        <div className="pointer-events-auto rounded-[26px] border border-white/10 bg-black/20 p-2 backdrop-blur-xl">
          {copy.pages.map((page, index) => (
            <button
              key={PAGE_IDS[index]}
              type="button"
              onClick={() => scrollToPage(index)}
              className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-all ${
                activePage === index
                  ? 'bg-white text-slate-950'
                  : 'text-white/68 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="text-[11px] font-semibold tabular-nums">{`0${index + 1}`}</span>
              <span className="text-sm font-medium">{page.nav}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-5 left-1/2 z-40 -translate-x-1/2">
        {activePage < PAGE_IDS.length - 1 ? (
          <button
            type="button"
            onClick={() => scrollToPage(activePage + 1)}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/10 px-4 py-2 text-sm text-white/80 backdrop-blur-xl transition hover:bg-white/16 hover:text-white"
          >
            <ChevronDown className="size-4" />
            {copy.pages[activePage + 1].nav}
          </button>
        ) : null}
      </div>

      <div
        ref={scrollerRef}
        className="relative z-10 h-full snap-y snap-mandatory overflow-y-auto scroll-smooth"
      >
        <section
          ref={(node) => {
            sectionRefs.current[0] = node;
          }}
          className="relative h-[100dvh] snap-start overflow-hidden"
        >
          <div className="mx-auto grid h-full max-w-7xl items-center gap-10 px-4 pb-12 pt-28 md:px-8 md:pt-32 lg:grid-cols-[0.42fr_0.58fr]">
            <motion.div
              initial={{ opacity: 0, x: -120 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ root: scrollerRef, amount: 0.5 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-8"
            >
              <SectionLabel
                page="01"
                badge={copy.pages[0].badge}
                title={copy.pages[0].title}
                description={copy.pages[0].description}
              />

              <div className="space-y-4">
                <div className="rounded-[28px] border border-white/14 bg-white/8 p-5 text-white/78 backdrop-blur-xl">
                  <p className="text-sm leading-8">{copy.currentCourse}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    size="lg"
                    className="rounded-full bg-white px-5 text-slate-950 hover:bg-white/90"
                    onClick={goToMyCoursesOrLogin}
                  >
                    {copy.pages[0].primary}
                    <ArrowRight className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    variant="outline"
                    className="rounded-full border-white/16 bg-white/8 px-5 text-white hover:bg-white/14 hover:text-white"
                    onClick={() => scrollToPage(1)}
                  >
                    {copy.pages[0].secondary}
                  </Button>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 140, scale: 0.97 }}
              whileInView={{ opacity: 1, x: 0, scale: 1 }}
              viewport={{ root: scrollerRef, amount: 0.45 }}
              transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="space-y-4">
                <div className="rounded-[36px] border border-white/12 bg-white/8 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.28)] backdrop-blur-2xl">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/45">
                        {isZh ? '为什么是 Syntara' : 'Why Syntara'}
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-white md:text-3xl">
                        {isZh
                          ? '从备课到分发，一套工作流顺着走完'
                          : 'One workflow, from lesson prep to reusable distribution'}
                      </p>
                    </div>
                    <Badge className="rounded-full bg-white text-slate-950">
                      {isZh ? '课堂 · 聊天 · 商城' : 'Classroom · Chat · Store'}
                    </Badge>
                  </div>
                  <div className="mt-6 grid gap-4 md:grid-cols-3">
                    <div className="rounded-[24px] border border-white/10 bg-slate-950/45 p-4">
                      <div className="mb-3 inline-flex rounded-2xl bg-sky-400/14 p-3 text-sky-200">
                        <Presentation className="size-5" />
                      </div>
                      <p className="text-sm font-semibold text-white">{copy.pages[1].nav}</p>
                      <p className="mt-2 text-sm leading-7 text-white/68">
                        {copy.pages[0].points[0]}
                      </p>
                    </div>
                    <div className="rounded-[24px] border border-white/10 bg-slate-950/45 p-4">
                      <div className="mb-3 inline-flex rounded-2xl bg-emerald-400/14 p-3 text-emerald-200">
                        <MessageSquareText className="size-5" />
                      </div>
                      <p className="text-sm font-semibold text-white">{copy.pages[2].nav}</p>
                      <p className="mt-2 text-sm leading-7 text-white/68">
                        {copy.pages[0].points[1]}
                      </p>
                    </div>
                    <div className="rounded-[24px] border border-white/10 bg-slate-950/45 p-4">
                      <div className="mb-3 inline-flex rounded-2xl bg-amber-300/16 p-3 text-amber-100">
                        <ShoppingBag className="size-5" />
                      </div>
                      <p className="text-sm font-semibold text-white">{copy.pages[3].nav}</p>
                      <p className="mt-2 text-sm leading-7 text-white/68">
                        {copy.pages[0].points[2]}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
                  <div className="rounded-[28px] border border-white/10 bg-white/6 p-5 backdrop-blur-xl">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">
                      {isZh ? '完整链路' : 'One continuous workflow'}
                    </p>
                    <p className="mt-3 text-base leading-8 text-white/72">
                      {isZh
                        ? '内容生成、课堂讲解、课后追问和资源沉淀不是四个割裂的工具，而是一条连续工作流。'
                        : 'Lesson generation, live teaching, follow-up chat, and resource reuse are not separate tools here. They form one continuous workflow.'}
                    </p>
                  </div>
                  <div className="rounded-[28px] border border-white/10 bg-white/6 p-5 backdrop-blur-xl">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">
                      {isZh ? '使用感受' : 'How it feels'}
                    </p>
                    <p className="mt-3 text-base leading-8 text-white/72">
                      {isZh
                        ? '你不是在多个页面里拼功能，而是在一套连贯体验里备课、讲课、追问和分发内容。'
                        : 'Instead of stitching together separate pages, people move through one coherent experience for preparing, teaching, questioning, and distributing content.'}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section
          ref={(node) => {
            sectionRefs.current[1] = node;
          }}
          className="relative h-[100dvh] snap-start overflow-hidden"
        >
          <div className="mx-auto grid h-full max-w-7xl items-center gap-10 px-4 pb-12 pt-28 md:px-8 md:pt-32 lg:grid-cols-[0.26fr_0.74fr]">
            <motion.div
              initial={{ opacity: 0, x: -120 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ root: scrollerRef, amount: 0.5 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-8"
            >
              <SectionLabel
                page="02"
                badge={copy.pages[1].badge}
                title={copy.pages[1].title}
                description={copy.pages[1].description}
              />

              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  size="lg"
                  className="rounded-full bg-white px-5 text-slate-950 hover:bg-white/90"
                  onClick={goToMyCoursesOrLogin}
                >
                  {copy.pages[1].primary}
                  <ArrowRight className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  className="rounded-full border-white/16 bg-white/8 px-5 text-white hover:bg-white/14 hover:text-white"
                  onClick={() => scrollToPage(2)}
                >
                  {copy.pages[1].secondary}
                </Button>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 140, scale: 0.97 }}
              whileInView={{ opacity: 1, x: 0, scale: 1 }}
              viewport={{ root: scrollerRef, amount: 0.45 }}
              transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
            >
              <ClassroomPlaybackShowcase items={CLASSROOM_PLAYLIST} />
            </motion.div>
          </div>
        </section>

        <section
          ref={(node) => {
            sectionRefs.current[2] = node;
          }}
          className="relative h-[100dvh] snap-start overflow-hidden bg-[linear-gradient(180deg,rgba(9,12,18,0.92)_0%,rgba(12,18,28,0.98)_100%)]"
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute left-[8%] top-[14%] h-72 w-72 rounded-full bg-cyan-400/12 blur-3xl" />
            <div className="absolute right-[8%] bottom-[10%] h-80 w-80 rounded-full bg-emerald-400/10 blur-3xl" />
          </div>
          <div className="relative mx-auto grid h-full max-w-7xl items-center gap-10 px-4 pb-12 pt-28 md:px-8 md:pt-32 lg:grid-cols-[0.36fr_0.64fr]">
            <motion.div
              initial={{ opacity: 0, x: -120 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ root: scrollerRef, amount: 0.5 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-8"
            >
              <SectionLabel
                page="03"
                badge={copy.pages[2].badge}
                title={copy.pages[2].title}
                description={copy.pages[2].description}
              />

              <div className="rounded-[28px] border border-white/10 bg-white/6 p-5 text-sm leading-8 text-white/72 backdrop-blur-xl">
                {isZh
                  ? '课堂结束以后，继续学习、继续追问、继续改写应该发生在这里。所以这一屏不是聊天介绍，而是聊天界面本身。'
                  : 'Follow-up questions, rewrites, and continued learning should happen here. That is why this page shows the actual chat surface rather than a chat explanation card.'}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 140 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ root: scrollerRef, amount: 0.45 }}
              transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
              className="min-h-0"
            >
              <div className="grid min-h-[58dvh] overflow-hidden rounded-[34px] border border-white/10 bg-white/7 shadow-[0_30px_100px_rgba(0,0,0,0.32)] backdrop-blur-2xl lg:grid-cols-[17rem_minmax(0,1fr)]">
                <aside className="border-b border-white/10 bg-black/18 lg:border-b-0 lg:border-r lg:border-white/10">
                  <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                    <button
                      type="button"
                      className="inline-flex size-8 items-center justify-center rounded-[10px] border border-white/10 bg-white/6 text-white/72"
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                    <div className="relative min-w-0 flex-1">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-white/35" />
                      <Input
                        readOnly
                        value=""
                        placeholder={isZh ? '搜索联系人…' : 'Search contacts…'}
                        className="h-8 border-white/10 bg-white/8 pl-8 text-white placeholder:text-white/35"
                      />
                    </div>
                  </div>

                  <div className="space-y-4 px-2 py-3">
                    {chatSidebarSections.map((section) => (
                      <div key={section.title}>
                        <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-white/40">
                          {section.title}
                        </p>
                        <div className="space-y-1">
                          {section.items.map((item) => (
                            <div
                              key={item.id}
                              className={`flex items-center gap-3 rounded-[12px] px-2 py-2 transition ${
                                item.active
                                  ? 'bg-violet-500/18 text-white'
                                  : 'text-white/82 hover:bg-white/8'
                              }`}
                            >
                              {item.avatarSrc ? (
                                <img
                                  src={item.avatarSrc}
                                  alt=""
                                  className="size-9 shrink-0 rounded-xl object-cover ring-1 ring-white/10"
                                />
                              ) : (
                                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/8">
                                  {item.icon === 'agent' ? (
                                    <Bot className="size-4" />
                                  ) : item.icon === 'group' ? (
                                    <MessagesSquare className="size-4" />
                                  ) : (
                                    <BookOpen className="size-4" />
                                  )}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{item.title}</p>
                                {item.subtitle ? (
                                  <p className="truncate text-[10px] text-white/45">
                                    {item.subtitle}
                                  </p>
                                ) : null}
                              </div>
                              {item.busy ? (
                                <span className="size-2.5 shrink-0 rounded-full bg-amber-400" />
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </aside>

                <div className="flex min-h-0 flex-col">
                  <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={courseAgentAvatar}
                        alt=""
                        className="size-10 rounded-2xl object-cover ring-1 ring-white/10"
                      />
                      <div>
                        <p className="text-sm font-semibold text-white">Notebook Copilot</p>
                        <p className="text-xs text-white/48">
                          {isZh ? '真实聊天页结构预览' : 'Real chat surface structure preview'}
                        </p>
                      </div>
                    </div>
                    <Badge className="rounded-full bg-white text-slate-950">
                      {copy.pages[2].nav}
                    </Badge>
                  </div>

                  <div className="h-[58dvh] min-h-[360px] overflow-hidden">
                    <Conversation className="h-full">
                      <ConversationContent className="gap-5 px-5 py-6">
                        {copy.chatMessages.map((message, index) => {
                          const isUser = message.role === 'user';
                          const avatarSrc = isUser ? USER_AVATAR : courseAgentAvatar;
                          return (
                            <div
                              key={`${message.role}-${index}`}
                              className={`flex items-start gap-3 ${isUser ? 'justify-end' : ''}`}
                            >
                              {!isUser ? (
                                <img
                                  src={avatarSrc}
                                  alt=""
                                  className="mt-1 size-9 shrink-0 rounded-2xl object-cover ring-1 ring-white/10"
                                />
                              ) : null}
                              <Message from={message.role}>
                                <MessageContent className="max-w-[min(100%,40rem)]">
                                  <p className="leading-7">{message.text}</p>
                                </MessageContent>
                              </Message>
                              {isUser ? (
                                <img
                                  src={avatarSrc}
                                  alt=""
                                  className="mt-1 size-9 shrink-0 rounded-full object-cover ring-1 ring-white/10"
                                />
                              ) : null}
                            </div>
                          );
                        })}
                      </ConversationContent>
                    </Conversation>
                  </div>

                  <div className="border-t border-white/10 px-5 py-4">
                    <div className="flex gap-3">
                      <Input
                        readOnly
                        value={copy.pages[2].prompt}
                        className="border-white/10 bg-white/8 text-white placeholder:text-white/35"
                      />
                      <Button
                        type="button"
                        className="shrink-0 rounded-full bg-white px-5 text-slate-950 hover:bg-white/90"
                        onClick={goToChat}
                      >
                        {copy.pages[2].nav}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section
          ref={(node) => {
            sectionRefs.current[3] = node;
          }}
          className="relative h-[100dvh] snap-start overflow-hidden bg-[linear-gradient(180deg,rgba(255,248,240,0.98)_0%,rgba(248,250,255,0.96)_100%)] text-slate-950"
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute left-[10%] top-[8%] h-72 w-72 rounded-full bg-amber-200/45 blur-3xl" />
            <div className="absolute right-[6%] bottom-[4%] h-80 w-80 rounded-full bg-sky-200/38 blur-3xl" />
          </div>
          <div className="relative mx-auto grid h-full max-w-7xl items-center gap-10 px-4 pb-12 pt-28 md:px-8 md:pt-32 lg:grid-cols-[0.3fr_0.7fr]">
            <motion.div
              initial={{ opacity: 0, x: -120 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ root: scrollerRef, amount: 0.5 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-8"
            >
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                    04
                  </span>
                  <Badge
                    variant="outline"
                    className="rounded-full border-slate-300 bg-white/80 px-3 py-1 text-slate-700"
                  >
                    <ShoppingBag className="size-3.5" />
                    {copy.pages[3].badge}
                  </Badge>
                </div>
                <div className="space-y-3">
                  <h2 className="max-w-md text-4xl font-semibold tracking-tight text-slate-950 md:text-6xl">
                    {copy.pages[3].title}
                  </h2>
                  <p className="max-w-md text-base leading-8 text-slate-600 md:text-lg">
                    {copy.pages[3].description}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <span className="rounded-full border border-slate-200 bg-white/85 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm">
                  {copy.pages[3].stat}
                </span>
                <Button
                  type="button"
                  size="lg"
                  className="rounded-full bg-slate-950 px-5 text-white hover:bg-slate-900"
                  onClick={goToStore}
                >
                  {copy.pages[3].action}
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 140, scale: 0.98 }}
              whileInView={{ opacity: 1, x: 0, scale: 1 }}
              viewport={{ root: scrollerRef, amount: 0.42 }}
              transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
              className="min-h-0"
            >
              <div className="rounded-[34px] border border-slate-200/80 bg-white/82 p-3 shadow-[0_26px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl">
                <div className="mb-3 flex items-center justify-between gap-4 px-2 pt-1">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">
                      {isZh ? '商城资源橱窗' : 'Marketplace shelf'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {isZh ? '真实卡片组件 + mock data' : 'Real cards with mock data'}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="rounded-full border-slate-200 bg-white text-slate-700"
                  >
                    <Presentation className="size-3.5" />
                    {copy.pages[3].nav}
                  </Badge>
                </div>
                <div className="max-h-[68dvh] overflow-y-auto px-1 pb-1">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {storeCards.map((card, index) => (
                      <CourseGalleryCard
                        key={card.id}
                        listIndex={index}
                        badge="Mock Data"
                        subtitle={isZh ? '商城预览' : 'Store preview'}
                        course={card}
                        slide={STORE_SLIDES[index % STORE_SLIDES.length]}
                        tags={card.tags}
                        secondaryLabel={isZh ? '互动课件' : 'Interactive notebook'}
                        actionLabel={copy.pages[3].action}
                        onAction={goToStore}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>
      </div>
    </div>
  );
}

