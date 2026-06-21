'use client';

import {
  AlertTriangle,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  FileText,
  Play,
  RefreshCcw,
  Target,
  UploadCloud,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ProgressMock = {
  id: string;
  title: string;
  reason: string;
  selection: string;
  confirmLabel: string;
  confirmed?: boolean;
  writeMode?: 'progress' | 'planning_scope';
  dismiss?: boolean;
};

type SyllabusMockEvent = {
  id: string;
  date: string;
  kind: string;
  title: string;
  meta: string[];
};

type PracticePlanMock = {
  id: string;
  title: string;
  mode: 'quiz' | 'practice';
  estimatedMinutes: number;
  problemCount: number;
  targetConcepts: string[];
  difficultyMix: {
    easy: number;
    medium: number;
    hard: number;
  };
};

type ImageCardTone = 'amber' | 'sky' | 'emerald' | 'violet' | 'rose' | 'slate';
type ImageCardImage = 'progress' | 'scope' | 'quiz' | 'practice' | 'calendar' | 'danger';
type ImageCardTheme = 'current' | 'minimal' | 'sci-fi' | 'terminal';

const imageCardThemeOptions: {
  id: ImageCardTheme;
  label: string;
  description: string;
}[] = [
  {
    id: 'current',
    label: '当前',
    description: '卡通插画',
  },
  {
    id: 'minimal',
    label: '极简',
    description: '白纸网格',
  },
  {
    id: 'sci-fi',
    label: '轻科幻',
    description: '浅色 HUD',
  },
  {
    id: 'terminal',
    label: '伴学终端',
    description: '柔和终端',
  },
];

const notebookOptions = [
  '01 - Python 入门：表达式、变量与类型',
  '02 - 条件分支：if、布尔逻辑与调试',
  '03 - 循环：range、for、while 与嵌套循环',
  '04 - 函数：参数、返回值与测试',
];

const progressMocks: ProgressMock[] = [
  {
    id: 'progress',
    title: '确认学习进度',
    reason: '请选择你现在在这门课里的位置。确认后，我会把它写入学习记忆。',
    selection: '03 - 循环：range、for、while 与嵌套循环',
    confirmLabel: '确认更新',
    dismiss: true,
  },
  {
    id: 'review',
    title: '确认复习范围',
    reason: '请选择这次复习覆盖到哪里。确认后，我会按这个范围更新学习记忆并生成复习安排。',
    selection: '02 - 条件分支：if、布尔逻辑与调试',
    confirmLabel: '确认并继续',
    writeMode: 'planning_scope',
    dismiss: true,
  },
  {
    id: 'quiz',
    title: '确认题目范围',
    reason: '请选择这次刷题/测验覆盖到哪里。确认后，我会按这个范围生成题目计划。',
    selection: '04 - 函数：参数、返回值与测试',
    confirmLabel: '确认并继续',
    writeMode: 'planning_scope',
  },
  {
    id: 'confirmed',
    title: '学习进度已更新',
    reason: '已确认本次范围：正在学习《03 - 循环：range、for、while 与嵌套循环》。',
    selection: '03 - 循环：range、for、while 与嵌套循环',
    confirmLabel: '已确认',
    confirmed: true,
  },
];

const syllabusEvents: SyllabusMockEvent[] = [
  {
    id: 'assignment-1',
    date: '2026-06-23',
    kind: '作业',
    title: 'Problem Set 3 due',
    meta: ['Week 3', 'Assignments', '置信度 91%'],
  },
  {
    id: 'exam-1',
    date: '2026-06-28',
    kind: '考试',
    title: 'Midterm review checkpoint',
    meta: ['Week 4', 'Exams', '置信度 86%'],
  },
  {
    id: 'progress-1',
    date: '2026-07-02',
    kind: '进度',
    title: 'Loops and functions coverage',
    meta: ['Week 5', 'Schedule', '置信度 78%'],
  },
];

const practicePlanMocks: PracticePlanMock[] = [
  {
    id: 'quiz-plan',
    title: 'CSC 108 掌握度小测',
    mode: 'quiz',
    estimatedMinutes: 30,
    problemCount: 10,
    targetConcepts: ['CSC108', 'Python', 'Markdown', 'Loop', '字符串'],
    difficultyMix: {
      easy: 4,
      medium: 4,
      hard: 2,
    },
  },
  {
    id: 'practice-plan',
    title: '循环与函数刷题计划',
    mode: 'practice',
    estimatedMinutes: 45,
    problemCount: 12,
    targetConcepts: ['for loop', 'while loop', 'nested loop', 'helper function', 'edge cases'],
    difficultyMix: {
      easy: 3,
      medium: 6,
      hard: 3,
    },
  },
];

const imageCardImageSrcs: Record<ImageCardTheme, Record<ImageCardImage, string>> = {
  current: {
    progress: '/images/learn-confirmations/card-progress-neutral.png',
    scope: '/images/learn-confirmations/card-scope-neutral.png',
    quiz: '/images/learn-confirmations/card-quiz-neutral.png',
    practice: '/images/learn-confirmations/card-practice-neutral.png',
    calendar: '/images/learn-confirmations/card-calendar-neutral.png',
    danger: '/images/learn-confirmations/card-danger-neutral.png',
  },
  minimal: {
    progress: '/images/learn-confirmations/card-progress-minimal.png',
    scope: '/images/learn-confirmations/card-scope-minimal.png',
    quiz: '/images/learn-confirmations/card-quiz-minimal.png',
    practice: '/images/learn-confirmations/card-practice-minimal.png',
    calendar: '/images/learn-confirmations/card-calendar-minimal.png',
    danger: '/images/learn-confirmations/card-danger-minimal.png',
  },
  'sci-fi': {
    progress: '/images/learn-confirmations/card-progress-sci-fi.png',
    scope: '/images/learn-confirmations/card-scope-sci-fi.png',
    quiz: '/images/learn-confirmations/card-quiz-sci-fi.png',
    practice: '/images/learn-confirmations/card-practice-sci-fi.png',
    calendar: '/images/learn-confirmations/card-calendar-sci-fi.png',
    danger: '/images/learn-confirmations/card-danger-sci-fi.png',
  },
  terminal: {
    progress: '/images/learn-confirmations/card-progress-terminal.png',
    scope: '/images/learn-confirmations/card-scope-terminal.png',
    quiz: '/images/learn-confirmations/card-quiz-terminal.png',
    practice: '/images/learn-confirmations/card-practice-terminal.png',
    calendar: '/images/learn-confirmations/card-calendar-terminal.png',
    danger: '/images/learn-confirmations/card-danger-terminal.png',
  },
};

const imageCardToneClassNames: Record<
  ImageCardTone,
  {
    frame: string;
    media: string;
    label: string;
    title: string;
    description: string;
  }
> = {
  amber: {
    frame:
      'border-amber-200/80 bg-[#fffdf7] shadow-[0_18px_50px_rgba(120,79,18,0.08)] dark:border-amber-300/20 dark:bg-amber-400/10',
    media:
      'bg-white/72 text-amber-700 ring-amber-100 dark:bg-slate-950/70 dark:text-amber-200 dark:ring-amber-300/20',
    label: 'text-amber-900/70 dark:text-amber-100/70',
    title: 'text-amber-950 dark:text-amber-50',
    description: 'text-amber-950/70 dark:text-amber-100/85',
  },
  sky: {
    frame:
      'border-sky-200/80 bg-white shadow-[0_18px_48px_rgba(14,116,144,0.08)] dark:border-sky-300/20 dark:bg-slate-950',
    media:
      'bg-white/74 text-sky-700 ring-sky-100 dark:bg-slate-950/72 dark:text-sky-200 dark:ring-sky-300/20',
    label: 'text-sky-950/65 dark:text-sky-100/70',
    title: 'text-sky-950 dark:text-sky-50',
    description: 'text-sky-950/70 dark:text-sky-100/78',
  },
  emerald: {
    frame:
      'border-emerald-200/80 bg-white shadow-[0_18px_48px_rgba(21,128,61,0.08)] dark:border-emerald-300/20 dark:bg-slate-950',
    media:
      'bg-white/74 text-emerald-700 ring-emerald-100 dark:bg-slate-950/72 dark:text-emerald-200 dark:ring-emerald-300/20',
    label: 'text-emerald-950/65 dark:text-emerald-100/70',
    title: 'text-emerald-950 dark:text-emerald-50',
    description: 'text-emerald-950/70 dark:text-emerald-100/78',
  },
  violet: {
    frame:
      'border-violet-200/80 bg-white shadow-[0_18px_48px_rgba(109,40,217,0.08)] dark:border-violet-300/20 dark:bg-slate-950',
    media:
      'bg-white/74 text-violet-700 ring-violet-100 dark:bg-slate-950/72 dark:text-violet-200 dark:ring-violet-300/20',
    label: 'text-violet-950/65 dark:text-violet-100/70',
    title: 'text-violet-950 dark:text-violet-50',
    description: 'text-violet-950/70 dark:text-violet-100/78',
  },
  rose: {
    frame:
      'border-red-200/80 bg-white shadow-[0_18px_50px_rgba(127,29,29,0.08)] dark:border-red-300/20 dark:bg-slate-950',
    media:
      'bg-white/74 text-red-700 ring-red-100 dark:bg-slate-950/72 dark:text-red-200 dark:ring-red-300/20',
    label: 'text-red-950/65 dark:text-red-100/70',
    title: 'text-red-950 dark:text-red-50',
    description: 'text-red-950/70 dark:text-red-100/78',
  },
  slate: {
    frame:
      'border-slate-200/80 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-slate-950',
    media:
      'bg-white/74 text-slate-700 ring-slate-100 dark:bg-slate-950/72 dark:text-slate-200 dark:ring-white/10',
    label: 'text-slate-950/60 dark:text-slate-100/70',
    title: 'text-slate-950 dark:text-slate-50',
    description: 'text-slate-700 dark:text-slate-300',
  },
};

function ImageCard({
  theme,
  tone,
  image,
  eyebrow,
  title,
  description,
  icon: Icon,
  meta,
  children,
  className,
}: {
  theme: ImageCardTheme;
  tone: ImageCardTone;
  image: ImageCardImage;
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  meta?: string;
  children: ReactNode;
  className?: string;
}) {
  const toneClassNames = imageCardToneClassNames[tone];

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[18px] border text-sm shadow-sm transition-shadow',
        toneClassNames.frame,
        className,
      )}
    >
      <div
        className="absolute inset-0 bg-cover bg-no-repeat"
        style={{
          backgroundImage: `url(${imageCardImageSrcs[theme][image]})`,
          backgroundPosition: 'center',
        }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.9)_0%,rgba(255,255,255,0.72)_48%,rgba(255,255,255,0.26)_100%)] dark:bg-[linear-gradient(90deg,rgba(2,6,23,0.84)_0%,rgba(2,6,23,0.64)_48%,rgba(2,6,23,0.32)_100%)]"
        aria-hidden="true"
      />
      <div className="relative flex min-w-0 flex-col gap-2.5 px-3.5 py-2.5">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className={cn(
              'mt-0.5 grid size-8 shrink-0 place-items-center rounded-[11px] ring-1',
              toneClassNames.media,
            )}
          >
            <Icon className="size-3.5" strokeWidth={1.9} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  className={cn(
                    'text-[10px] font-semibold uppercase tracking-[0.12em]',
                    toneClassNames.label,
                  )}
                >
                  {eyebrow}
                </p>
                <p
                  className={cn(
                    'mt-0.5 line-clamp-1 text-sm font-semibold leading-5',
                    toneClassNames.title,
                  )}
                >
                  {title}
                </p>
              </div>
              {meta ? (
                <span className="shrink-0 rounded-full bg-white/76 px-2.5 py-1 text-[11px] font-semibold text-slate-800 shadow-sm ring-1 ring-black/5 dark:bg-white/10 dark:text-slate-100 dark:ring-white/10">
                  {meta}
                </span>
              ) : null}
            </div>
            <p className={cn('mt-1 line-clamp-1 text-xs leading-5', toneClassNames.description)}>
              {description}
            </p>
          </div>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}

function ProgressConfirmationMock({ mock, theme }: { mock: ProgressMock; theme: ImageCardTheme }) {
  const title = mock.confirmed
    ? mock.writeMode === 'planning_scope'
      ? '计划范围已确认'
      : '学习进度已更新'
    : mock.title;

  return (
    <ImageCard
      theme={theme}
      tone={mock.confirmed ? 'emerald' : mock.writeMode === 'planning_scope' ? 'violet' : 'amber'}
      image={mock.writeMode === 'planning_scope' ? 'scope' : 'progress'}
      eyebrow={mock.confirmed ? 'Confirmed' : 'Progress checkpoint'}
      title={title}
      description={mock.reason}
      icon={mock.confirmed ? CheckCircle2 : Target}
      meta={mock.confirmed ? '已写入' : '待确认'}
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={mock.selection}
          disabled={mock.confirmed}
          onChange={() => undefined}
          className="h-8 min-w-0 flex-1 rounded-[10px] border border-amber-200 bg-white px-2.5 text-xs text-foreground shadow-sm outline-none transition disabled:cursor-not-allowed disabled:opacity-70 dark:border-amber-300/20 dark:bg-slate-950/70"
          aria-label={mock.title}
        >
          <option value="">选择学习进度</option>
          <option value="还没开始">还没开始</option>
          {notebookOptions.map((notebook, index) => (
            <option key={notebook} value={notebook}>
              正在学习 {index + 1}. {notebook}
            </option>
          ))}
          <option value="已经学完整门课">已经学完整门课</option>
        </select>
        <Button
          type="button"
          disabled={mock.confirmed}
          className="h-8 rounded-[10px] bg-slate-950 px-3 text-xs text-white shadow-sm hover:bg-slate-800 disabled:bg-slate-300 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
        >
          {mock.confirmed ? '已确认' : mock.confirmLabel}
        </Button>
        {mock.dismiss && !mock.confirmed ? (
          <Button type="button" variant="ghost" className="h-8 rounded-[10px] px-3 text-xs">
            稍后再说
          </Button>
        ) : null}
      </div>
    </ImageCard>
  );
}

function PracticePlanMockCard({ plan, theme }: { plan: PracticePlanMock; theme: ImageCardTheme }) {
  return (
    <ImageCard
      theme={theme}
      tone={plan.mode === 'quiz' ? 'sky' : 'emerald'}
      image={plan.mode === 'quiz' ? 'quiz' : 'practice'}
      eyebrow={plan.mode === 'quiz' ? 'Quiz card' : 'Practice card'}
      title={plan.title}
      description={`${plan.mode === 'quiz' ? '课程测验' : '刷题计划'} · ${
        plan.estimatedMinutes
      } 分钟 · ${plan.problemCount} 题`}
      icon={BookOpenCheck}
      meta="可开始"
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {plan.targetConcepts.slice(0, 3).map((concept) => (
            <span
              key={concept}
              className="rounded-[9px] border border-sky-200/80 bg-sky-50/70 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:border-sky-300/20 dark:bg-sky-400/10 dark:text-sky-200"
            >
              {concept}
            </span>
          ))}
          {plan.targetConcepts.length > 3 ? (
            <span className="rounded-[9px] bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-white/10 dark:text-slate-300">
              +{plan.targetConcepts.length - 3}
            </span>
          ) : null}
          <span className="rounded-[9px] bg-slate-50 px-2 py-0.5 text-[11px] text-muted-foreground dark:bg-white/5">
            基础 <span className="font-semibold text-foreground">{plan.difficultyMix.easy}</span>
            <span className="mx-1 text-slate-300">/</span>
            中等 <span className="font-semibold text-foreground">{plan.difficultyMix.medium}</span>
            <span className="mx-1 text-slate-300">/</span>
            挑战 <span className="font-semibold text-foreground">{plan.difficultyMix.hard}</span>
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            className="h-8 gap-1.5 rounded-[10px] bg-slate-950 px-3 text-xs text-white shadow-sm hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            <Play className="size-3.5" />
            开始
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-8 gap-1.5 rounded-[10px] border-slate-200 bg-white px-3 text-xs shadow-sm dark:border-white/10 dark:bg-white/5"
          >
            <RefreshCcw className="size-3.5" />
            换一组
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-8 gap-1.5 rounded-[10px] px-3 text-xs text-muted-foreground"
          >
            <Target className="size-3.5" />
            降低难度
          </Button>
        </div>
      </div>
    </ImageCard>
  );
}

function EventRow({ event }: { event: SyllabusMockEvent }) {
  return (
    <div className="flex items-center gap-2 rounded-[11px] border border-border/70 bg-background/86 px-2 py-1 shadow-sm">
      <span className="shrink-0 rounded-[9px] bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
        {event.date.slice(5)}
      </span>
      <span className="shrink-0 rounded-[9px] bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-200">
        {event.kind}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground">{event.title}</p>
        <p className="truncate text-[10px] text-muted-foreground">{event.meta.join(' · ')}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7 shrink-0 rounded-[9px] text-muted-foreground hover:text-destructive"
        aria-label="移除事项"
        title="移除事项"
      >
        <X className="size-3" />
      </Button>
    </div>
  );
}

function SyllabusConfirmMock({
  mode,
  empty,
  theme,
}: {
  mode: 'merge' | 'replace';
  empty?: boolean;
  theme: ImageCardTheme;
}) {
  const effectiveEvents = empty ? [] : syllabusEvents;
  const visibleEvents = effectiveEvents.slice(0, 1);
  const hiddenEventCount = Math.max(0, effectiveEvents.length - visibleEvents.length);

  return (
    <ImageCard
      theme={theme}
      tone={mode === 'replace' ? 'slate' : 'violet'}
      image="calendar"
      eyebrow="Syllabus preview"
      title={mode === 'replace' ? '确认保存课程日程' : '确认添加课程日程'}
      description="先读取 syllabus，再检查、修改或移除事项；确认后才会写入日历。"
      icon={CalendarDays}
      meta={mode === 'replace' ? '替换模式' : '合并模式'}
      className="rounded-[18px]"
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="flex min-w-0 items-center gap-2 rounded-[10px] border border-border/70 bg-background/80 px-2 py-1">
            <FileText className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.8} />
            <span className="truncate text-[11px] font-semibold text-foreground">syllabus.pdf</span>
          </span>
          <span className="rounded-[10px] bg-muted px-2 py-1 text-[11px] text-muted-foreground">
            {mode === 'replace' ? '替换当前日程' : '合并到当前日程'}
          </span>
          <span className="rounded-[10px] bg-muted px-2 py-1 text-[11px] text-muted-foreground">
            {effectiveEvents.length ? `${effectiveEvents.length} 个待确认事项` : '未生成预览'}
          </span>
          <Button type="button" variant="outline" className="h-7 rounded-[9px] px-2 text-[11px]">
            更换
          </Button>
          <Button type="button" variant="ghost" className="h-7 rounded-[9px] px-2 text-[11px]">
            添加
          </Button>
        </div>

        {effectiveEvents.length ? (
          <div className="space-y-1.5">
            {visibleEvents.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
            <p className="text-[11px] text-muted-foreground">
              {hiddenEventCount
                ? `另有 ${hiddenEventCount} 个事项会在确认前展开。`
                : `${effectiveEvents.length} 个有效事项会被写入日历。`}
            </p>
          </div>
        ) : (
          <div className="flex min-h-10 items-center gap-2 rounded-[11px] border border-dashed border-border bg-muted/20 px-2.5 py-2">
            <UploadCloud className="size-4 shrink-0 text-muted-foreground" />
            <p className="text-[11px] text-muted-foreground">
              选择 syllabus 文件，或描述计划生成预览。
            </p>
          </div>
        )}

        <div className="flex justify-end gap-1.5">
          <Button type="button" variant="outline" className="h-8 rounded-[10px] px-3 text-xs">
            取消
          </Button>
          <Button
            type="button"
            className="h-8 rounded-[10px] px-3 text-xs"
            disabled={!effectiveEvents.length}
          >
            {mode === 'replace' ? '确认保存' : '确认添加'}
          </Button>
        </div>
      </div>
    </ImageCard>
  );
}

function DangerConfirmMock({ theme }: { theme: ImageCardTheme }) {
  return (
    <ImageCard
      theme={theme}
      tone="rose"
      image="danger"
      eyebrow="Danger confirm"
      title="删除确认"
      description="删除前需要二次确认。这个样式用于替代测试路径里的原生确认框，方便统一调间距、按钮和危险色。"
      icon={AlertTriangle}
      meta="危险操作"
    >
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" className="h-8 rounded-[10px] px-3 text-xs">
          取消
        </Button>
        <Button type="button" variant="destructive" className="h-8 rounded-[10px] px-3 text-xs">
          确认删除
        </Button>
      </div>
    </ImageCard>
  );
}

function SuccessConfirmMock({ theme }: { theme: ImageCardTheme }) {
  return (
    <ImageCard
      theme={theme}
      tone="slate"
      image="calendar"
      eyebrow="Done state"
      title="完成确认"
      description="操作成功后的轻量确认状态，用于对比危险确认和学习范围确认的视觉权重。"
      icon={CheckCircle2}
      meta="已完成"
    >
      <div className="flex justify-end">
        <Button type="button" className="h-8 rounded-[10px] px-3 text-xs">
          知道了
        </Button>
      </div>
    </ImageCard>
  );
}

export function LearnConfirmationsTestPage() {
  const [activeTheme, setActiveTheme] = useState<ImageCardTheme>('sci-fi');

  return (
    <main className="min-h-[calc(100dvh-6rem)] overflow-y-auto bg-slate-50 px-5 py-5 text-foreground dark:bg-slate-950 lg:pr-44 xl:pr-52">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="rounded-[22px] border border-slate-200/80 bg-white px-5 py-4 shadow-[0_14px_36px_rgba(15,23,42,0.055)] dark:border-white/10 dark:bg-slate-950">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Learn UI Lab
              </p>
              <h1 className="mt-1 text-base font-semibold text-slate-950 dark:text-slate-50">
                确认框测试页面
              </h1>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                静态展示学习页测试过程中会出现的确认卡片和确认面板。
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-muted-foreground dark:border-white/10 dark:bg-white/5">
                <CalendarDays className="size-3.5" />
                所有状态已展开
              </div>
              <div className="flex flex-wrap items-center gap-1 rounded-full border border-slate-200 bg-white/90 p-1 shadow-sm dark:border-white/10 dark:bg-white/5">
                {imageCardThemeOptions.map((option) => {
                  const selected = activeTheme === option.id;

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setActiveTheme(option.id)}
                      aria-pressed={selected}
                      title={option.description}
                      className={cn(
                        'h-8 rounded-full px-3 text-[11px] font-medium transition',
                        selected
                          ? 'bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950'
                          : 'text-muted-foreground hover:bg-slate-100 hover:text-foreground dark:hover:bg-white/10',
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-2">
          {progressMocks.map((mock) => (
            <ProgressConfirmationMock key={mock.id} mock={mock} theme={activeTheme} />
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          {practicePlanMocks.map((plan) => (
            <PracticePlanMockCard key={plan.id} plan={plan} theme={activeTheme} />
          ))}
        </section>

        <section className="grid gap-5">
          <SyllabusConfirmMock mode="merge" theme={activeTheme} />
          <SyllabusConfirmMock mode="replace" empty theme={activeTheme} />
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <DangerConfirmMock theme={activeTheme} />
          <SuccessConfirmMock theme={activeTheme} />
        </section>
      </div>
    </main>
  );
}
