'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import AOS from 'aos';
import 'aos/dist/aos.css';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Blocks,
  Bot,
  ChevronDown,
  Compass,
  FileText,
  Gem,
  GraduationCap,
  Layers,
  MessageCircle,
  Sparkles,
  Timer,
  TrendingUp,
  WandSparkles,
} from 'lucide-react';

const featureCards = [
  {
    title: '一键生成互动课堂',
    desc: '输入主题或资料后，自动生成可学习、可探索的多场景课件。',
    icon: WandSparkles,
  },
  {
    title: '课程与笔记本双层组织',
    desc: '课程负责管理学习目标，笔记本负责承载内容与持续迭代。',
    icon: Layers,
  },
  {
    title: '多智能体协同讲解',
    desc: '让不同角色 Agent 分工讲解、追问、纠错，形成更像真人课堂的体验。',
    icon: Bot,
  },
];

const steps = [
  {
    title: '01 选择主题',
    desc: '你只要输入需求、课程目标或上传素材。',
  },
  {
    title: '02 自动生成',
    desc: '系统自动构建课程结构、互动节点和课堂内容。',
  },
  {
    title: '03 进入学习',
    desc: '在课堂中持续提问、练习、复盘并沉淀到笔记本。',
  },
];

const scenes = [
  '高校课程设计与翻转课堂',
  '企业培训与内部知识传递',
  '个人深度学习与长期知识管理',
  '研讨式项目课程与组队共学',
];

export default function HomePage() {
  useEffect(() => {
    AOS.init({
      duration: 900,
      easing: 'ease-out-cubic',
      once: false,
      offset: 80,
      mirror: true,
    });
  }, []);

  return (
    <div className="relative min-h-dvh scroll-smooth overflow-x-hidden apple-mesh-bg">
      <header className="sticky top-0 z-40 border-b border-white/45 bg-white/70 backdrop-blur-xl dark:border-white/10 dark:bg-[#0d0d10]/65">
        <motion.div
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 md:px-8"
        >
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#007AFF] to-[#5856D6] text-white">
              <Sparkles className="size-4" />
            </span>
            OpenMAIC
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-slate-600 dark:text-slate-300 md:flex">
            <a href="#features" className="hover:text-slate-900 dark:hover:text-white">
              功能
            </a>
            <a href="#workflow" className="hover:text-slate-900 dark:hover:text-white">
              流程
            </a>
            <a href="#scenes" className="hover:text-slate-900 dark:hover:text-white">
              场景
            </a>
            <a href="#cta" className="hover:text-slate-900 dark:hover:text-white">
              开始使用
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="apple-btn apple-btn-secondary rounded-xl px-4 py-2 text-sm font-medium"
            >
              登录
            </Link>
            <Link
              href="/register"
              className="apple-btn apple-btn-primary rounded-xl px-4 py-2 text-sm font-medium"
            >
              注册
            </Link>
          </div>
        </motion.div>
      </header>

      <main>
        <section className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-6xl items-center px-4 py-16 md:px-8">
          <div className="grid w-full items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            <motion.div initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
              <p className="mb-4 inline-flex items-center rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-medium text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                AI 互动课堂平台
              </p>
              <h1 className="text-4xl font-bold leading-tight tracking-tight text-slate-900 dark:text-white md:text-6xl">
                让每门课都变成
                <span className="bg-gradient-to-r from-[#007AFF] to-[#5856D6] bg-clip-text text-transparent">
                  {' '}
                  可互动、可持续{' '}
                </span>
                的学习空间
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-600 dark:text-slate-300 md:text-lg">
                OpenMAIC 将课程、笔记本和多智能体协同整合在一起，帮助你从内容生成到课堂互动一站式完成。
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/register"
                  className="apple-btn apple-btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold"
                >
                  免费注册
                  <ArrowRight className="size-4" />
                </Link>
                <Link
                  href="/login"
                  className="apple-btn apple-btn-secondary inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold"
                >
                  立即登录
                </Link>
              </div>
              <motion.div
                className="mt-6 inline-flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"
                animate={{ y: [0, 6, 0] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              >
                向下滚动查看完整能力
                <ChevronDown className="size-4" />
              </motion.div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.75, delay: 0.15 }}
              className="apple-glass rounded-[28px] p-6 md:p-8"
            >
              <div className="grid grid-cols-1 gap-3">
                <motion.div
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.55, delay: 0.3 }}
                  className="rounded-2xl border border-slate-200/80 bg-white/75 p-4 dark:border-white/10 dark:bg-white/5"
                >
                  <p className="text-xs text-slate-500 dark:text-slate-400">课程空间</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                    AI 导论 · 12 个笔记本
                  </p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.55, delay: 0.45 }}
                  className="rounded-2xl border border-slate-200/80 bg-white/75 p-4 dark:border-white/10 dark:bg-white/5"
                >
                  <p className="text-xs text-slate-500 dark:text-slate-400">智能体协作</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                    教学 Agent / 提问 Agent / 复盘 Agent
                  </p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.55, delay: 0.6 }}
                  className="rounded-2xl border border-slate-200/80 bg-white/75 p-4 dark:border-white/10 dark:bg-white/5"
                >
                  <p className="text-xs text-slate-500 dark:text-slate-400">学习闭环</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                    生成 → 互动 → 追问 → 复盘
                  </p>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </section>

        <section id="features" className="mx-auto min-h-screen w-full max-w-6xl px-4 py-16 md:px-8">
          <div className="mb-10" data-aos="fade-up">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white md:text-4xl">
              核心功能
            </h2>
            <p className="mt-3 text-slate-600 dark:text-slate-300">
              从生成内容到组织学习，再到协作互动，覆盖完整教学链路。
            </p>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {featureCards.map((item, idx) => {
              const Icon = item.icon;
              return (
                <article
                  key={item.title}
                  data-aos="zoom-in-up"
                  data-aos-delay={idx * 120}
                  className="apple-glass rounded-[24px] p-6 transition-transform duration-300 hover:-translate-y-1.5"
                >
                  <div className="mb-4 inline-flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#007AFF]/15 to-[#5856D6]/15 text-[#2365e7] dark:text-[#82adff]">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{item.desc}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section id="workflow" className="mx-auto min-h-screen w-full max-w-6xl px-4 py-16 md:px-8">
          <div className="mb-10" data-aos="fade-right">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white md:text-4xl">
              三步进入互动课堂
            </h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {steps.map((step, idx) => (
              <div
                key={step.title}
                data-aos="fade-up"
                data-aos-delay={idx * 100}
                className="apple-glass rounded-[24px] p-6"
              >
                <p className="text-xs font-medium text-[#007AFF] dark:text-[#82adff]">{step.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{step.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 apple-glass rounded-[24px] p-6" data-aos="fade-left">
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/75 px-3 py-1 dark:border-white/10 dark:bg-white/5">
                <FileText className="size-4" /> 课程结构自动生成
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/75 px-3 py-1 dark:border-white/10 dark:bg-white/5">
                <MessageCircle className="size-4" /> 课堂对话持续沉淀
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/75 px-3 py-1 dark:border-white/10 dark:bg-white/5">
                <Blocks className="size-4" /> 课件与互动动作联动
              </span>
            </div>
          </div>
        </section>

        <section id="scenes" className="mx-auto min-h-screen w-full max-w-6xl px-4 py-16 md:px-8">
          <h2
            className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white md:text-4xl"
            data-aos="fade-up"
          >
            适用场景
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {scenes.map((scene, idx) => (
              <div
                key={scene}
                data-aos="flip-left"
                data-aos-delay={idx * 80}
                className="apple-glass rounded-[20px] p-5"
              >
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{scene}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto min-h-screen w-full max-w-6xl px-4 py-16 md:px-8">
          <div className="apple-glass rounded-[28px] p-8 md:p-10" data-aos="zoom-in">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white md:text-4xl">
              为什么团队选择 OpenMAIC
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
                <Compass className="size-5 text-[#007AFF]" />
                <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                  把复杂课程拆解成可执行学习路径，不再“内容很多但不会用”。
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
                <GraduationCap className="size-5 text-[#007AFF]" />
                <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                  教学者能快速搭建高质量课堂，学习者能获得更强参与感。
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
                <Bot className="size-5 text-[#007AFF]" />
                <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                  多 Agent 协作让讲解、提问、复盘形成持续闭环。
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="cta" className="mx-auto min-h-screen w-full max-w-6xl px-4 py-16 md:px-8">
          <motion.div
            className="apple-glass relative flex min-h-[60vh] flex-col items-center justify-center overflow-hidden rounded-[28px] p-8 text-center md:p-12"
            initial={{ opacity: 0, y: 26 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, amount: 0.35 }}
            transition={{ duration: 0.65 }}
          >
            <motion.div
              className="pointer-events-none absolute -top-24 -left-24 size-52 rounded-full bg-[#007AFF]/20 blur-3xl"
              animate={{ x: [0, 20, -10, 0], y: [0, -10, 12, 0] }}
              transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="pointer-events-none absolute -right-24 -bottom-24 size-56 rounded-full bg-[#5856D6]/18 blur-3xl"
              animate={{ x: [0, -16, 8, 0], y: [0, 14, -8, 0] }}
              transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
            />
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white md:text-5xl">
              现在就创建你的第一门 AI 互动课程
            </h2>
            <p className="mt-4 max-w-2xl text-base text-slate-600 dark:text-slate-300">
              从注册开始，几分钟内搭建课程空间，持续沉淀属于你的学习资产。
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/register"
                className="apple-btn apple-btn-primary inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold"
              >
                立即注册
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/login"
                className="apple-btn apple-btn-secondary inline-flex items-center rounded-xl px-6 py-3 text-sm font-semibold"
              >
                我已有账号
              </Link>
            </div>
            <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2 text-xs text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                <Timer className="mx-auto mb-1 size-4 text-[#007AFF]" />
                5 分钟快速启动
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2 text-xs text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                <TrendingUp className="mx-auto mb-1 size-4 text-[#007AFF]" />
                持续积累学习资产
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2 text-xs text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                <Gem className="mx-auto mb-1 size-4 text-[#007AFF]" />
                可扩展课程模板
              </div>
            </div>
          </motion.div>
        </section>
      </main>
    </div>
  );
}
