'use client';

import Link from 'next/link';
import { useCallback, useMemo, useRef, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Blocks,
  Bot,
  Compass,
  FileText,
  Gem,
  GraduationCap,
  Layers,
  MessageCircle,
  Timer,
  TrendingUp,
  WandSparkles,
} from 'lucide-react';
import { useAuthStore } from '@/lib/store/auth';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { useI18n } from '@/lib/hooks/use-i18n';
import { SyntaraMark } from '@/components/brand/syntara-mark';

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.7,
      delay,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  }),
};

const glassCardClass =
  'border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045)_0%,rgba(255,255,255,0.02)_100%)] shadow-[0_20px_50px_rgba(0,0,0,0.22)] backdrop-blur-xl';

function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.24 }}
      custom={delay}
      variants={fadeUp}
    >
      {children}
    </motion.div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { locale, setLocale } = useI18n();
  const isZh = locale === 'zh-CN';

  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const authMode = useAuthStore((s) => s.authMode);
  const logout = useAuthStore((s) => s.logout);
  const currentCourseName = useCurrentCourseStore((s) => s.name);

  const platformRef = useRef<HTMLElement | null>(null);
  const workflowRef = useRef<HTMLElement | null>(null);
  const experienceRef = useRef<HTMLElement | null>(null);
  const ctaRef = useRef<HTMLElement | null>(null);

  const copy = useMemo(
    () =>
      isZh
        ? {
            brand: 'Syntara',
            brandTag: 'Course, notebook, classroom',
            nav: {
              platform: '平台能力',
              workflow: '学习流',
              experience: '使用体验',
              launch: isLoggedIn ? '进入课程' : '开始体验',
            },
            hero: {
              badge: 'Course · Notebook · Agent · Memory',
              titleTop: '让课程、Notebook 与 Agent',
              titleBottom: '协作在同一个学习系统里',
              description:
                'Syntara 把课程入口、Notebook 生成、AI 讲解、Agent 互动与复习回路放进一条连续工作流里，让知识不仅能展示，也能练习、追问与长期记住。',
              primaryCta: isLoggedIn ? '进入我的课程' : '立即登录',
              secondaryCta: '查看平台能力',
              chips: ['Course Space', 'Notebook Studio', 'Agent Classroom', 'Memory Loop'],
              miniNote: '克制、清晰、连贯。',
            },
            stats: [
              { value: 'Course Space', label: '课程、目标与学习入口统一管理' },
              { value: 'Notebook AI', label: '从资料到章节、例题与课堂内容' },
              { value: 'Review Loop', label: '练习、复习、追踪再次回流' },
            ],
            sectionTitle: {
              platform: '首页先讲清楚系统能做什么',
              workflow: '从进入课程到形成记忆，一路连贯',
              experience: '少一点表演，多一点秩序',
              cta: '让首页先把产品气质讲出来',
            },
            sectionDesc: {
              platform:
                '首页不再像功能墙，而是先解释课程、Notebook、Agent 与复习闭环之间的关系。用户一上来就知道这个系统如何组织学习。',
              workflow:
                '用户看到的不是很多入口，而是一条从课程开始，到生成内容、互动学习、再回到复习的完整路径。',
              experience:
                '更深的背景、更稳的层级和更克制的动效，让页面更像长期可用的平台门面，而不是一次性的宣传页。',
              cta: '如果首页是平台的第一节课，它应该先让用户理解系统，再让用户愿意进入。',
            },
            features: [
              {
                icon: GraduationCap,
                title: '课程总控台',
                description:
                  '课程是入口与上下文。班级、笔记本、课堂与后续学习动作都围绕课程组织，而不是散落成孤立页面。',
              },
              {
                icon: FileText,
                title: 'Notebook 生成工作区',
                description:
                  '从 PDF、主题或要求出发，持续生成和细化知识结构，把大纲、内容、例题、练习与讲解沉淀成可复用资产。',
              },
              {
                icon: Bot,
                title: 'Agent 驱动课堂',
                description:
                  '不是一个挂件式聊天框，而是让 AI 讲解、追问、课堂互动与多角色讨论直接嵌在学习流程里。',
              },
              {
                icon: TrendingUp,
                title: '记忆与复习闭环',
                description:
                  '把例题、测验、错题、复习节奏和长期追踪接到学习主线上，让平台价值从一次使用变成持续回访。',
              },
            ],
            workflow: [
              {
                step: '01',
                title: '进入课程空间',
                description:
                  '从课程视角开始，而不是从工具菜单开始。首页 CTA 会把用户自然导向真正的学习工作区。',
              },
              {
                step: '02',
                title: '生成并展开 Notebook',
                description:
                  '系统把课程目标、上传资料和教学意图组织成结构化 Notebook，承接章节、讲题、练习与后续迭代。',
              },
              {
                step: '03',
                title: '通过 Agent 持续互动',
                description:
                  '课堂讲解、追问、讨论和白板式展示都可以持续发生，AI 像协作者，而不是悬浮在边上的按钮。',
              },
              {
                step: '04',
                title: '回到复习与记忆',
                description:
                  '通过题目讲解、测验、复盘和记忆追踪，让每次学习都能回流到长期掌握，而不是停在一次性生成。',
              },
            ],
            experienceCards: [
              {
                icon: Compass,
                title: '像产品，而不是宣传页',
                description: '减少噪音和堆砌感，让标题、节奏与排版本身成为可信度。',
              },
              {
                icon: Blocks,
                title: '像系统，而不是单点功能',
                description:
                  '课程、Notebook、Agent 和复习统一成一个完整故事，而不是四个分开的卖点。',
              },
              {
                icon: Gem,
                title: '像工作流，而不是导航页',
                description: '每个区块都指向下一步动作，页面更像真实入口，而不是静态海报。',
              },
            ],
            story: {
              badge: 'Live learning system',
              title: '课程、讲解、提问与复习保持同一语境',
              desc: '首页先告诉用户这不是单点工具，而是一套能持续组织学习的系统。',
              rails: [
                '课程上下文已进入',
                'Notebook 结构持续生成',
                'Agent 正在讲解与追问',
                '复习回路等待回收知识点',
              ],
            },
            footer: {
              primary: isLoggedIn ? '继续进入课程' : '开始登录体验',
              secondary: isLoggedIn ? '退出当前账号' : '先看学习流',
              note:
                isLoggedIn && currentCourseName
                  ? `当前课程：${currentCourseName}`
                  : '首页先传达秩序感，而不是炫技感。',
            },
          }
        : {
            brand: 'Syntara',
            brandTag: 'Course, notebook, classroom',
            nav: {
              platform: 'Platform',
              workflow: 'Workflow',
              experience: 'Experience',
              launch: isLoggedIn ? 'Courses' : 'Launch',
            },
            hero: {
              badge: 'Course · Notebook · Agent · Memory',
              titleTop: 'Bring courses, notebooks, and agents',
              titleBottom: 'into one learning system',
              description:
                'Syntara brings course context, notebook generation, AI teaching, agent interaction, and review loops into one continuous workflow, so knowledge can be explained, practiced, questioned, and remembered.',
              primaryCta: isLoggedIn ? 'Enter my courses' : 'Sign in now',
              secondaryCta: 'Explore the platform',
              chips: ['Course Space', 'Notebook Studio', 'Agent Classroom', 'Memory Loop'],
              miniNote: 'Calm, clear, and deliberate.',
            },
            stats: [
              { value: 'Course Space', label: 'One context for classes, goals, and entry points' },
              { value: 'Notebook AI', label: 'From source material to structured teaching assets' },
              { value: 'Review Loop', label: 'Practice, review, and feedback flow back in' },
            ],
            sectionTitle: {
              platform: 'The homepage should first explain what the system does',
              workflow: 'A continuous path from entry to retention',
              experience: 'Less performance, more order',
              cta: 'Let the homepage carry the product tone',
            },
            sectionDesc: {
              platform:
                'The homepage should not feel like a feature wall. It should explain how courses, notebooks, agents, and review work together as one learning system.',
              workflow:
                'What users see is not a collection of pages, but a path from course entry to generated content, live interaction, and long-term review.',
              experience:
                'A deeper background, steadier hierarchy, and restrained motion make the page feel like a long-term platform surface instead of a short-lived campaign.',
              cta: 'If the homepage is the first lesson, it should explain the system before asking users to click.',
            },
            features: [
              {
                icon: GraduationCap,
                title: 'Course command center',
                description:
                  'Courses provide the entry point and the context. Classrooms, notebooks, and follow-up learning actions stay organized around that frame.',
              },
              {
                icon: FileText,
                title: 'Notebook generation workspace',
                description:
                  'Start from PDFs, topics, or teaching goals and continuously turn them into structured notebooks with chapters, examples, exercises, and explanations.',
              },
              {
                icon: Bot,
                title: 'Agent-driven classroom',
                description:
                  'AI is not a detached chat widget. Teaching, questioning, discussion, and whiteboard-style interaction all happen inside the learning flow.',
              },
              {
                icon: TrendingUp,
                title: 'Memory and review loop',
                description:
                  'Examples, quizzes, review pacing, and progress tracking bring learning back over time instead of ending after a single generation.',
              },
            ],
            workflow: [
              {
                step: '01',
                title: 'Enter the course space',
                description:
                  'Users start from a course-aware context instead of a tool menu, so the next action is immediately clearer.',
              },
              {
                step: '02',
                title: 'Generate and refine notebooks',
                description:
                  'The system turns goals and source material into structured notebooks that can expand into chapters, worked examples, and practice.',
              },
              {
                step: '03',
                title: 'Keep learning with agents',
                description:
                  'Explanations, questions, multi-agent discussion, and classroom interaction make AI feel like a collaborator inside the workflow.',
              },
              {
                step: '04',
                title: 'Return through review and memory',
                description:
                  'Quizzes, review loops, and memory tracking close the loop so learning remains useful beyond a single session.',
              },
            ],
            experienceCards: [
              {
                icon: Compass,
                title: 'It feels like a product, not a campaign',
                description:
                  'Less noise and less decoration let spacing, hierarchy, and pacing do more of the work.',
              },
              {
                icon: Blocks,
                title: 'It feels like a system, not a feature',
                description:
                  'Courses, notebooks, agents, and review appear as one connected story instead of isolated abilities.',
              },
              {
                icon: Gem,
                title: 'It feels like a workflow, not a nav page',
                description:
                  'Each section points toward the next action, so the page behaves like an entry flow instead of a poster.',
              },
            ],
            story: {
              badge: 'Live learning system',
              title: 'Course context, explanation, questions, and review stay in one frame',
              desc: 'The homepage should say this is a learning system, not a one-off AI tool.',
              rails: [
                'Course context is active',
                'Notebook structure is being generated',
                'Agents are explaining and responding',
                'Review loop is ready to catch the knowledge',
              ],
            },
            footer: {
              primary: isLoggedIn ? 'Continue to courses' : 'Start with sign in',
              secondary: isLoggedIn ? 'Sign out' : 'See the workflow first',
              note:
                isLoggedIn && currentCourseName
                  ? `Current course: ${currentCourseName}`
                  : 'The homepage now leads with clarity instead of spectacle.',
            },
          },
    [currentCourseName, isLoggedIn, isZh],
  );

  const scrollToSection = useCallback((section: 'platform' | 'workflow' | 'experience' | 'cta') => {
    const refMap = {
      platform: platformRef,
      workflow: workflowRef,
      experience: experienceRef,
      cta: ctaRef,
    };
    refMap[section].current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handlePrimaryAction = useCallback(() => {
    router.push(isLoggedIn ? '/my-courses' : '/login');
  }, [isLoggedIn, router]);

  const handleSecondaryAction = useCallback(() => {
    scrollToSection(isLoggedIn ? 'workflow' : 'platform');
  }, [isLoggedIn, scrollToSection]);

  const handleFooterSecondary = useCallback(() => {
    if (!isLoggedIn) {
      scrollToSection('workflow');
      return;
    }

    if (authMode === 'oauth') {
      void signOut({ callbackUrl: '/' });
      return;
    }

    logout();
    router.push('/');
  }, [authMode, isLoggedIn, logout, router, scrollToSection]);

  const navItems = useMemo(
    () => [
      { label: copy.nav.platform, onClick: () => scrollToSection('platform') },
      { label: copy.nav.workflow, onClick: () => scrollToSection('workflow') },
      { label: copy.nav.experience, onClick: () => scrollToSection('experience') },
      { label: copy.nav.launch, onClick: handlePrimaryAction },
    ],
    [
      copy.nav.experience,
      copy.nav.launch,
      copy.nav.platform,
      copy.nav.workflow,
      handlePrimaryAction,
      scrollToSection,
    ],
  );

  return (
    <div
      className="relative min-h-dvh overflow-x-hidden scroll-smooth text-white"
      style={{
        background: `
          radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.08), transparent 34%),
          radial-gradient(circle at 80% 18%, rgba(255, 255, 255, 0.04), transparent 24%),
          linear-gradient(180deg, #090909 0%, #0c0c0d 45%, #101113 100%)
        `,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(9,9,9,0.08) 0%, rgba(9,9,9,0.42) 55%, rgba(9,9,9,0.78) 100%)',
        }}
      />
      <div className="pointer-events-none absolute -right-20 -top-24 z-0 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0.02)_55%,transparent_74%)] blur-[44px]" />
      <div className="pointer-events-none absolute -bottom-24 -left-20 z-0 h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0.01)_60%,transparent_76%)] blur-[46px]" />

      <div className="relative z-10">
        <header className="sticky top-0 z-40 border-b border-white/8 bg-[#0b0b0c]/70 backdrop-blur-xl">
          <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 md:px-8">
            <Link href="/" className="flex min-w-0 items-center gap-2">
              <SyntaraMark />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold tracking-tight text-white">
                  {copy.brand}
                </p>
                <p className="truncate text-[11px] text-white/45">{copy.brandTag}</p>
              </div>
            </Link>

            <nav className="hidden items-center gap-1 md:flex">
              {navItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.onClick}
                  className="rounded-full px-3 py-2 text-sm text-white/62 transition hover:bg-white/5 hover:text-white"
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="flex items-center gap-2">
              <div className="hidden items-center rounded-full border border-white/10 bg-white/[0.03] p-1 md:flex">
                {(['zh-CN', 'en-US'] as const).map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setLocale(code)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      locale === code
                        ? 'bg-white text-[#0c0c0d]'
                        : 'text-white/58 hover:bg-white/6 hover:text-white'
                    }`}
                  >
                    {code === 'zh-CN' ? '中文' : 'EN'}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={handlePrimaryAction}
                className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-2 text-sm font-medium text-white transition hover:border-white/22 hover:bg-white/[0.08]"
              >
                {isLoggedIn ? copy.nav.launch : copy.hero.primaryCta}
              </button>
            </div>
          </div>
        </header>

        <main>
          <section className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-7xl items-center px-4 py-16 md:px-8">
            <div className="grid w-full items-center gap-10 lg:grid-cols-[1.08fr_0.92fr]">
              <div>
                <motion.div initial="hidden" animate="visible" custom={0} variants={fadeUp}>
                  <div className="mb-3 inline-flex rounded-full border border-white/12 bg-white/[0.045] px-3 py-1 text-[11px] uppercase tracking-[0.26em] text-white/72">
                    {copy.hero.badge}
                  </div>
                </motion.div>

                <motion.h1
                  initial="hidden"
                  animate="visible"
                  custom={0.08}
                  variants={fadeUp}
                  className="max-w-5xl text-[2.9rem] leading-[1.02] font-bold tracking-[-0.06em] text-white sm:text-[4.2rem] md:text-[5.5rem]"
                >
                  <span className="block">{copy.hero.titleTop}</span>
                  <span className="block text-white/72">{copy.hero.titleBottom}</span>
                </motion.h1>

                <motion.p
                  initial="hidden"
                  animate="visible"
                  custom={0.16}
                  variants={fadeUp}
                  className="mt-5 max-w-3xl text-base leading-8 text-white/76 md:text-[1.12rem]"
                >
                  {copy.hero.description}
                </motion.p>

                <motion.p
                  initial="hidden"
                  animate="visible"
                  custom={0.22}
                  variants={fadeUp}
                  className="mt-3 text-sm tracking-[0.18em] text-white/42"
                >
                  {copy.hero.miniNote}
                </motion.p>

                <motion.div
                  initial="hidden"
                  animate="visible"
                  custom={0.28}
                  variants={fadeUp}
                  className="mt-8 flex flex-col gap-3 sm:flex-row"
                >
                  <button
                    type="button"
                    onClick={handlePrimaryAction}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[#f4f4f5] px-6 py-3 text-sm font-semibold text-[#0b0b0c] shadow-[0_10px_30px_rgba(255,255,255,0.08)] transition hover:bg-white"
                  >
                    {copy.hero.primaryCta}
                    <ArrowRight className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleSecondaryAction}
                    className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-white/86 transition hover:border-white/22 hover:bg-white/[0.05]"
                  >
                    {copy.hero.secondaryCta}
                  </button>
                </motion.div>

                <motion.div
                  initial="hidden"
                  animate="visible"
                  custom={0.34}
                  variants={fadeUp}
                  className="mt-6 flex flex-wrap gap-2"
                >
                  {copy.hero.chips.map((chip) => (
                    <span
                      key={chip}
                      className="rounded-full border border-white/8 bg-transparent px-3 py-1.5 text-xs text-white/66"
                    >
                      {chip}
                    </span>
                  ))}
                </motion.div>

                <div className="mt-6 grid gap-3 md:grid-cols-3">
                  {copy.stats.map((stat, index) => (
                    <motion.div
                      key={stat.value}
                      initial="hidden"
                      animate="visible"
                      custom={0.4 + index * 0.06}
                      variants={fadeUp}
                      className={`${glassCardClass} rounded-[26px] p-4`}
                    >
                      <p className="text-[1.02rem] font-semibold text-white">{stat.value}</p>
                      <p className="mt-1.5 text-sm leading-6 text-white/62">{stat.label}</p>
                    </motion.div>
                  ))}
                </div>
              </div>

              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.75, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
                className={`${glassCardClass} relative overflow-hidden rounded-[32px] p-6 md:p-8`}
              >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(124,92,255,0.22),transparent_32%)]" />
                <div className="relative z-10">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/18 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/72">
                    <WandSparkles className="size-3.5" />
                    {copy.story.badge}
                  </div>
                  <h2 className="mt-4 max-w-xl text-3xl font-bold tracking-[-0.04em] text-white md:text-[2.35rem]">
                    {copy.story.title}
                  </h2>
                  <p className="mt-3 max-w-xl text-sm leading-7 text-white/68 md:text-[0.98rem]">
                    {copy.story.desc}
                  </p>

                  <div className="mt-6 space-y-3">
                    {copy.story.rails.map((rail, index) => (
                      <motion.div
                        key={rail}
                        initial={{ opacity: 0, x: 18 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.55, delay: 0.28 + index * 0.08 }}
                        className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4"
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-2xl ${
                              index === 0
                                ? 'bg-[linear-gradient(135deg,rgba(124,92,255,0.26)_0%,rgba(39,215,255,0.16)_100%)]'
                                : index === 1
                                  ? 'bg-[linear-gradient(135deg,rgba(138,179,255,0.24)_0%,rgba(124,92,255,0.14)_100%)]'
                                  : index === 2
                                    ? 'bg-[linear-gradient(135deg,rgba(39,215,255,0.24)_0%,rgba(39,215,255,0.1)_100%)]'
                                    : 'bg-[linear-gradient(135deg,rgba(255,136,219,0.22)_0%,rgba(124,92,255,0.14)_100%)]'
                            }`}
                          >
                            {index === 0 ? (
                              <GraduationCap className="size-4 text-white" />
                            ) : index === 1 ? (
                              <Layers className="size-4 text-white" />
                            ) : index === 2 ? (
                              <MessageCircle className="size-4 text-white" />
                            ) : (
                              <Timer className="size-4 text-white" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white">{rail}</p>
                            <p className="mt-1 text-xs leading-5 text-white/52">
                              {index === 0
                                ? isZh
                                  ? '课程先建立语境，再承接后续动作。'
                                  : 'Course context frames everything that follows.'
                                : index === 1
                                  ? isZh
                                    ? 'Notebook 不是文件夹，而是持续展开的工作区。'
                                    : 'A notebook is a living workspace, not just a file.'
                                  : index === 2
                                    ? isZh
                                      ? '课堂中的 AI 像协作者，而不是旁观者。'
                                      : 'AI behaves like a collaborator inside the classroom.'
                                    : isZh
                                      ? '复习把知识再次带回系统。'
                                      : 'Review brings knowledge back into the system.'}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </div>
          </section>

          <section ref={platformRef} id="platform" className="scroll-mt-28 px-4 py-6 md:px-8">
            <div className="mx-auto max-w-7xl">
              <Reveal className="mb-6 max-w-3xl">
                <p className="mb-2 text-[11px] uppercase tracking-[0.28em] text-[#8ab3ff]">
                  Platform framing
                </p>
                <h2 className="text-[2rem] font-bold tracking-[-0.05em] text-white md:text-[3.15rem]">
                  {copy.sectionTitle.platform}
                </h2>
                <p className="mt-3 text-base leading-8 text-white/72">
                  {copy.sectionDesc.platform}
                </p>
              </Reveal>

              <div className="grid gap-4 md:grid-cols-2">
                {copy.features.map((feature, index) => {
                  const Icon = feature.icon;
                  return (
                    <Reveal key={feature.title} delay={index * 0.08}>
                      <div
                        className={`${glassCardClass} h-full rounded-[32px] p-6 transition duration-300 hover:-translate-y-1.5 hover:border-[#8ca3ff]/30 hover:bg-[#11162a]/80`}
                      >
                        <div className="inline-flex size-12 items-center justify-center rounded-[18px] border border-white/8 bg-[linear-gradient(135deg,rgba(124,92,255,0.22)_0%,rgba(39,215,255,0.14)_100%)]">
                          <Icon className="size-5 text-white" />
                        </div>
                        <h3 className="mt-4 text-xl font-semibold text-white">{feature.title}</h3>
                        <p className="mt-3 text-sm leading-7 text-white/68">
                          {feature.description}
                        </p>
                      </div>
                    </Reveal>
                  );
                })}
              </div>
            </div>
          </section>

          <section ref={workflowRef} id="workflow" className="scroll-mt-28 px-4 py-16 md:px-8">
            <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[0.95fr_1.05fr] md:gap-10">
              <Reveal className="md:sticky md:top-28 md:self-start">
                <p className="mb-2 text-[11px] uppercase tracking-[0.28em] text-[#78f0ff]">
                  Learning workflow
                </p>
                <h2 className="text-[2rem] font-bold tracking-[-0.05em] text-white md:text-[3.15rem]">
                  {copy.sectionTitle.workflow}
                </h2>
                <p className="mt-3 max-w-xl text-base leading-8 text-white/72">
                  {copy.sectionDesc.workflow}
                </p>
              </Reveal>

              <div className="relative pl-4 md:pl-8">
                <div className="absolute left-2 top-2 bottom-2 w-px bg-[linear-gradient(180deg,rgba(124,92,255,0.8)_0%,rgba(39,215,255,0)_100%)] md:left-4" />
                <div className="space-y-4">
                  {copy.workflow.map((item, index) => (
                    <Reveal key={item.step} delay={index * 0.08}>
                      <div
                        className={`${glassCardClass} relative rounded-[30px] p-6 ${
                          index % 2 === 0 ? 'md:ml-0' : 'md:ml-12'
                        }`}
                      >
                        <div className="flex gap-4">
                          <div className="relative w-6 shrink-0">
                            <div className="absolute left-[-19px] top-1 h-4 w-4 rounded-full bg-[linear-gradient(135deg,#7c5cff_0%,#27d7ff_100%)] shadow-[0_0_20px_rgba(124,92,255,0.55)] md:left-[-27px]" />
                          </div>
                          <div>
                            <p className="text-xs tracking-[0.24em] text-[#7fb7ff]">
                              STEP {item.step}
                            </p>
                            <h3 className="mt-2 text-xl font-semibold text-white">{item.title}</h3>
                            <p className="mt-3 text-sm leading-7 text-white/68">
                              {item.description}
                            </p>
                          </div>
                        </div>
                      </div>
                    </Reveal>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section ref={experienceRef} id="experience" className="scroll-mt-28 px-4 py-6 md:px-8">
            <div className="mx-auto max-w-7xl">
              <Reveal className="max-w-3xl">
                <p className="mb-2 text-[11px] uppercase tracking-[0.28em] text-[#ff88db]">
                  Product experience
                </p>
                <h2 className="text-[2rem] font-bold tracking-[-0.05em] text-white md:text-[3.15rem]">
                  {copy.sectionTitle.experience}
                </h2>
                <p className="mt-3 text-base leading-8 text-white/72">
                  {copy.sectionDesc.experience}
                </p>
              </Reveal>

              <div className="mt-6 grid gap-4 md:grid-cols-[0.92fr_1.08fr]">
                <Reveal>
                  <div
                    className={`${glassCardClass} relative min-h-[320px] overflow-hidden rounded-[34px] p-7`}
                  >
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(124,92,255,0.26),transparent_32%)]" />
                    <div className="relative z-10">
                      <div className="flex items-center gap-3">
                        <div className="inline-flex size-11 items-center justify-center rounded-[16px] bg-[linear-gradient(135deg,rgba(124,92,255,0.24)_0%,rgba(39,215,255,0.18)_100%)]">
                          <WandSparkles className="size-5 text-white" />
                        </div>
                        <p className="text-sm text-white/72">Home as product narrative</p>
                      </div>

                      <h3 className="mt-6 text-[1.8rem] font-bold leading-tight tracking-[-0.04em] text-white md:text-[2.3rem]">
                        “{copy.sectionTitle.cta}”
                      </h3>

                      <div className="my-6 h-px bg-white/8" />

                      <div className="space-y-3">
                        {copy.hero.chips.slice(0, 3).map((chip, index) => (
                          <div key={chip} className="flex items-center gap-3 text-white/82">
                            <div
                              className={`inline-flex size-9 items-center justify-center rounded-2xl ${
                                index === 0
                                  ? 'bg-[#8ca3ff]/18 text-[#8ca3ff]'
                                  : index === 1
                                    ? 'bg-[#66f7ff]/16 text-[#66f7ff]'
                                    : 'bg-[#f48eff]/16 text-[#f48eff]'
                              }`}
                            >
                              {index === 0 ? (
                                <GraduationCap className="size-4" />
                              ) : index === 1 ? (
                                <FileText className="size-4" />
                              ) : (
                                <Bot className="size-4" />
                              )}
                            </div>
                            <span className="text-sm">{chip}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </Reveal>

                <div className="space-y-4">
                  {copy.experienceCards.map((card, index) => {
                    const Icon = card.icon;
                    return (
                      <Reveal key={card.title} delay={index * 0.08}>
                        <div
                          className={`${glassCardClass} rounded-[30px] p-6 transition duration-300 hover:translate-x-1.5`}
                        >
                          <div className="flex gap-4">
                            <div className="flex min-w-14 flex-col items-center gap-2 pt-0.5">
                              <span className="text-[1.35rem] font-bold text-[#8ab3ff]">
                                0{index + 1}
                              </span>
                              <div className="inline-flex size-10 items-center justify-center rounded-2xl bg-white/[0.05] text-white/80">
                                <Icon className="size-4" />
                              </div>
                            </div>
                            <div>
                              <h3 className="text-lg font-semibold text-white">{card.title}</h3>
                              <p className="mt-3 text-sm leading-7 text-white/68">
                                {card.description}
                              </p>
                            </div>
                          </div>
                        </div>
                      </Reveal>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          <section ref={ctaRef} id="cta" className="scroll-mt-28 px-4 py-16 md:px-8">
            <div className="mx-auto max-w-7xl">
              <Reveal>
                <div className="relative overflow-hidden rounded-[34px] border border-white/10 bg-[linear-gradient(135deg,rgba(19,24,36,0.94)_0%,rgba(13,16,30,0.84)_45%,rgba(19,13,38,0.88)_100%)] p-7 shadow-[0_20px_50px_rgba(0,0,0,0.22)] backdrop-blur-xl md:p-10">
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(39,215,255,0.18),transparent_28%)]" />
                  <div className="relative z-10 grid gap-6 md:grid-cols-[1.2fr_0.8fr] md:items-center">
                    <div>
                      <h2 className="text-[2rem] font-bold tracking-[-0.05em] text-white md:text-[3rem]">
                        {copy.sectionTitle.cta}
                      </h2>
                      <p className="mt-3 max-w-3xl text-base leading-8 text-white/72">
                        {copy.sectionDesc.cta}
                      </p>
                      <p className="mt-5 text-sm tracking-[0.02em] text-[#66f7ff]/88">
                        {copy.footer.note}
                      </p>
                    </div>
                    <div className="flex flex-col gap-3">
                      <button
                        type="button"
                        onClick={handlePrimaryAction}
                        className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#7c5cff_0%,#21d4fd_100%)] px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110"
                      >
                        {copy.footer.primary}
                      </button>
                      <button
                        type="button"
                        onClick={handleFooterSecondary}
                        className="inline-flex items-center justify-center rounded-full border border-white/18 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/34 hover:bg-white/[0.05]"
                      >
                        {copy.footer.secondary}
                      </button>
                    </div>
                  </div>
                </div>
              </Reveal>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
