import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { BookOpen, SendHorizontal } from 'lucide-react';
import { AppGlobalHeader } from '@/components/app-global-header';
import { SyntaraHomeMotion } from '@/components/home/syntara-home-motion';

export const metadata: Metadata = {
  title: 'Syntara · AI 学习工作台',
  description: '围绕课程、资料、学习进度和复习计划持续协作的 AI 学习工作台。',
};

const quickActions = [
  { label: '进入学习页', href: '/learn', primary: true },
  { label: '查看我的课程', href: '/my-courses' },
  { label: '课程商城', href: '/store/courses' },
];

const footerActions = [
  { label: 'Open learning', href: '/learn', primary: true },
  { label: 'Course store', href: '/store/courses' },
  { label: 'My workspace', href: '/my-courses' },
];

const interfaceSupport = ['中文界面', 'English UI', 'Light theme', 'Dark theme'];

export default function HomePage() {
  return (
    <main data-syntara-home className="syntara-home min-h-screen bg-[#f7fbfd] text-slate-950">
      <SyntaraHomeMotion />
      <div className="fixed left-3 right-3 top-3 z-[1400] sm:left-4 sm:right-4 sm:top-4">
        <AppGlobalHeader showHomeControls />
      </div>

      <section className="syntara-hero syntara-marimba-hero relative isolate min-h-[940vh] bg-[#f3f8fb]">
        <div className="syntara-hero-stage sticky top-0 min-h-screen overflow-hidden">
          <div className="syntara-marimba-grid absolute inset-0" />
          <div className="syntara-scroll-dot syntara-scroll-dot-a" aria-hidden />
          <div className="syntara-scroll-dot syntara-scroll-dot-b" aria-hidden />
          <div className="syntara-learning-marker syntara-learning-marker-a" aria-hidden />
          <div className="syntara-learning-marker syntara-learning-marker-b" aria-hidden />

          <div className="syntara-education-layer" aria-hidden>
            <div className="syntara-edu-note syntara-edu-note-graph">
              <p className="syntara-edu-formula">f(x) = sin x / x</p>
              <div className="syntara-edu-graph">
                <span />
                <span />
                <span />
              </div>
              <p>
                Note:
                <br />
                bounded and continuous
              </p>
            </div>
            <div className="syntara-edu-note syntara-edu-note-definition">
              <p className="syntara-edu-note-title">Definition</p>
              <p>A sequence {'{a_n}'} converges to L if every epsilon keeps the tail close.</p>
            </div>
            <div className="syntara-edu-note syntara-edu-note-remember">
              <p>Remember:</p>
              <p>d/dx ln(x) = 1/x</p>
            </div>
            <div className="syntara-problem-card">
              <p className="syntara-problem-label">Q.</p>
              <p>Which of the following is the derivative of ln(x)?</p>
              <div className="syntara-choice-list">
                <span>A&nbsp;&nbsp; x</span>
                <span className="is-selected">B&nbsp;&nbsp; 1/x</span>
                <span>C&nbsp;&nbsp; ln(x)</span>
                <span>D&nbsp;&nbsp; e^x</span>
              </div>
            </div>
            <div className="syntara-edu-note syntara-edu-note-code">
              <p># Gradient descent</p>
              <p>dw = compute_grad_w()</p>
              <p>w = w - lr * dw</p>
            </div>
            <div className="syntara-edu-note syntara-edu-note-key">
              <p className="syntara-edu-note-title">Key idea</p>
              <p>
                Distance from center (a, b) to (x, y) is constant.
                <br />
                (x - a)^2 + (y - b)^2 = r^2
              </p>
            </div>
          </div>

          <div className="syntara-orbit-ring" aria-hidden />
          <p className="syntara-practice-label syntara-marimba-headline" aria-hidden>
            My learning loop
          </p>

          <div className="syntara-scroll-orb syntara-scroll-orb-a" aria-hidden>
            <span>Course</span>
            <span>context</span>
          </div>
          <div className="syntara-scroll-orb syntara-scroll-orb-b" aria-hidden>
            <span>Study</span>
            <span>memory</span>
          </div>
          <div className="syntara-scroll-orb syntara-scroll-orb-c" aria-hidden>
            <span>Next</span>
            <span>practice</span>
          </div>

          <div className="syntara-learning-state-layer" aria-hidden>
            <div className="syntara-learning-state-card syntara-learning-state-source">
              <p className="syntara-learning-state-eyebrow">Course context · 课程上下文</p>
              <p className="syntara-learning-state-title">MAT136 · Week 4 · Chain rule</p>
              <div className="syntara-learning-source-lines">
                <span>lecture notes</span>
                <span>uploaded image problem</span>
                <span>mistakes from last session</span>
              </div>
            </div>
            <div className="syntara-learning-state-card syntara-learning-state-memory">
              <p className="syntara-learning-state-eyebrow">Study memory · 学习记忆</p>
              <p className="syntara-learning-state-title">Weak spot: implicit differentiation</p>
              <div className="syntara-memory-meter">
                <span />
              </div>
              <p className="syntara-learning-state-note">
                needs one guided example before more drills
              </p>
            </div>
            <div className="syntara-learning-state-card syntara-learning-state-next">
              <p className="syntara-learning-state-eyebrow">Next practice · 下一步练习</p>
              <p className="syntara-learning-state-title">3 targeted questions ready</p>
              <p className="syntara-learning-state-note">
                the next task starts from the actual gap
              </p>
            </div>
          </div>

          <div className="syntara-laptop-showcase" aria-hidden>
            <Image
              src="/home/syntara-laptop-showcase-imagegen.png"
              alt=""
              width={1672}
              height={941}
              sizes="(max-width: 768px) 140vw, 94vw"
              className="h-auto w-full"
            />
          </div>

          <footer className="syntara-footer-screen" aria-labelledby="syntara-footer-title">
            <div className="syntara-footer-glow syntara-footer-glow-a" aria-hidden />
            <div className="syntara-footer-glow syntara-footer-glow-b" aria-hidden />
            <div className="syntara-footer-thread syntara-footer-thread-a" aria-hidden />
            <div className="syntara-footer-thread syntara-footer-thread-b" aria-hidden />

            <div className="syntara-footer-content">
              <p className="syntara-footer-kicker">Syntara learning workspace</p>
              <h2
                id="syntara-footer-title"
                className="syntara-footer-title syntara-marimba-headline"
              >
                Start your next
                <br />
                learning loop
              </h2>
              <p className="syntara-footer-copy">
                把课程资料、提问、薄弱点和下一组练习放在同一个地方。 Syntara 记得你学到哪，
                也会把下一步准备好。
              </p>

              <div className="syntara-footer-state" aria-label="Learning state summary">
                <span>Course context</span>
                <span>Study memory</span>
                <span>Next practice</span>
              </div>

              <div className="syntara-footer-support" aria-label="Interface support">
                {interfaceSupport.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>

              <div className="syntara-footer-actions" aria-label="Footer navigation">
                {footerActions.map((action) => (
                  <Link
                    key={action.href}
                    href={action.href}
                    className={
                      action.primary ? 'syntara-footer-primary' : 'syntara-footer-secondary'
                    }
                  >
                    {action.label}
                    {action.primary ? <SendHorizontal className="size-4" /> : null}
                  </Link>
                ))}
              </div>
            </div>

            <div className="syntara-footer-bottom">
              <span>© 2026 Syntara Learn</span>
              <span>Built for course learning, memory, and practice.</span>
            </div>
          </footer>

          <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#f7fbfd] to-transparent" />

          <div className="relative z-10 mx-auto flex min-h-screen max-w-[1680px] flex-col justify-center px-5 pb-20 pt-32 text-[#103832] sm:px-8 lg:px-12">
            <div className="syntara-hero-kicker mx-auto mb-10 inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold text-[#103832] backdrop-blur-sm sm:text-base">
              <BookOpen className="size-4" />
              Course learning workspace
            </div>
            <h1
              className="syntara-hero-title syntara-marimba-headline mx-auto max-w-[1280px] text-center text-[clamp(3.8rem,7.6vw,8.7rem)] font-normal leading-[0.93]"
              aria-label="Make every course feel alive, not just stored in files."
            >
              Make every{' '}
              <span className="syntara-headline-media syntara-headline-media-haru">
                <Image
                  src="/home/syntara-haru-headline-transparent.png"
                  alt=""
                  fill
                  sizes="(max-width: 768px) 56px, 84px"
                  className="object-cover"
                />
              </span>{' '}
              course
              <br />
              feel alive, not just{' '}
              <span className="syntara-headline-media syntara-headline-media-workspace">
                <Image
                  src="/home/syntara-headline-laptop-transparent.png"
                  alt=""
                  fill
                  sizes="(max-width: 768px) 92px, 148px"
                  className="object-cover"
                />
              </span>
              <br />
              stored in files.
            </h1>
            <p className="syntara-hero-copy mx-auto mt-8 max-w-3xl text-center text-base font-semibold leading-7 text-[#103832]/75 sm:text-lg">
              课程资料、图片问题、学习进度、复习计划和题库练习都在同一个学习工作台里推进。 Syntara
              先理解上下文，再和你一起决定下一步。
            </p>
            <div className="syntara-hero-actions mx-auto mt-8 flex flex-wrap justify-center gap-3">
              {quickActions.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className={
                    action.primary
                      ? 'syntara-cta-primary inline-flex h-12 items-center gap-2 rounded-full bg-slate-950 px-5 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(15,23,42,0.22)] transition hover:bg-slate-800'
                      : 'syntara-cta-secondary inline-flex h-12 items-center rounded-full border border-slate-200 bg-white/72 px-5 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur transition hover:border-slate-300 hover:bg-white'
                  }
                >
                  {action.label}
                  {action.primary ? <SendHorizontal className="size-4" /> : null}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
