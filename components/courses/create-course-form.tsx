'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CoursePurpose, CourseRecord } from '@/lib/utils/database';
import { createCourse, updateCourse } from '@/lib/utils/course-storage';
import { useAuthStore } from '@/lib/store/auth';
import { markCourseOwnedByUser } from '@/lib/utils/course-ownership';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function parseTags(raw: string): string[] {
  return raw
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 非「教什么知识点」：学习阶段、人群、场景、形式与目标。
 */
export const COURSE_META_TAGS: string[] = [
  '入门',
  '零基础',
  '进阶',
  '期末冲刺',
  '考研备考',
  '考证',
  '自学',
  '在职学习',
  '转行',
  '兴趣向',
  '工作应用',
  '科研向',
  '短期突击',
  '长线系统',
  '重理论',
  '重实战',
  '刷题',
  '做项目',
  '读论文',
  '毕设季',
  '面试准备',
  '组会预读',
  '复盘巩固',
  '语言考试',
];

/** 学科 / 技能方向（知识点类） */
export const COURSE_TOPIC_TAGS: string[] = [
  '算法',
  '数据结构',
  '操作系统',
  '计算机网络',
  '数据库',
  'Python',
  'Java',
  'C++',
  '前端',
  '后端',
  '机器学习',
  '深度学习',
  '数据分析',
  '编程入门',
  '网络安全',
  '大语言模型',
  '计算机视觉',
  'NLP',
  '高等数学',
  '线性代数',
  '概率统计',
  '物理学',
  '化学',
  '生物学',
  '考研',
  '期末考试',
  '面试',
  '英语',
  '日语',
  '论文写作',
  '科研方法',
  '经济学',
  '金融学',
  '心理学',
  '法学',
  '历史学',
  '项目管理',
  '产品设计',
  '笔记整理',
  '临床医学',
  '艺术设计',
  '建筑',
];

/** 输入联想：元信息 + 知识点（去重） */
export const COMMON_COURSE_TAGS: string[] = Array.from(
  new Set([...COURSE_META_TAGS, ...COURSE_TOPIC_TAGS]),
);

const SUGGEST_LIMIT = 8;

function tagsBeforeLastComma(raw: string): string[] {
  const last = Math.max(raw.lastIndexOf(','), raw.lastIndexOf('，'));
  const head = last === -1 ? '' : raw.slice(0, last + 1);
  return parseTags(head);
}

function currentTagToken(raw: string): string {
  const last = Math.max(raw.lastIndexOf(','), raw.lastIndexOf('，'));
  return (last === -1 ? raw : raw.slice(last + 1)).trim();
}

function applyTagSuggestion(prev: string, suggestion: string): string {
  const completed = tagsBeforeLastComma(prev);
  if (completed.includes(suggestion)) return prev;
  const next = [...completed, suggestion];
  return `${next.join(', ')}, `;
}

function filterTagSuggestions(raw: string): string[] {
  const tokenRaw = currentTagToken(raw);
  const tokenLower = tokenRaw.toLowerCase();
  const existing = new Set(parseTags(raw));
  return COMMON_COURSE_TAGS.filter((t) => {
    if (existing.has(t)) return false;
    if (!tokenRaw) return true;
    return t.includes(tokenRaw) || t.toLowerCase().includes(tokenLower);
  }).slice(0, SUGGEST_LIMIT);
}

export const PURPOSE_OPTIONS: { value: CoursePurpose; label: string }[] = [
  { value: 'research', label: '科研' },
  { value: 'university', label: '大学课程' },
  { value: 'daily', label: '日常使用' },
];

export function CreateCourseForm({
  onSuccess,
  className,
  editCourse,
}: {
  onSuccess: (courseId: string) => void;
  className?: string;
  /** 传入时为编辑模式，提交后更新该课程 */
  editCourse?: CourseRecord;
}) {
  const userId = useAuthStore((s) => s.userId);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState<'zh-CN' | 'en-US'>('zh-CN');
  const [tagsRaw, setTagsRaw] = useState('');
  const [purpose, setPurpose] = useState<CoursePurpose>('daily');
  const [university, setUniversity] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editCourse) return;
    setName(editCourse.name);
    setDescription(editCourse.description ?? '');
    setLanguage(editCourse.language);
    setTagsRaw(editCourse.tags.join(', '));
    setPurpose(editCourse.purpose);
    setUniversity(editCourse.university ?? '');
    setCourseCode(editCourse.courseCode ?? '');
    setError(null);
  }, [editCourse]);

  const tagInputRef = useRef<HTMLInputElement>(null);
  const tagFieldRef = useRef<HTMLDivElement>(null);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const [tagActive, setTagActive] = useState(0);

  const tagSuggestions = useMemo(() => filterTagSuggestions(tagsRaw), [tagsRaw]);
  const existingTagSet = useMemo(() => new Set(parseTags(tagsRaw)), [tagsRaw]);
  const quickMetaTags = useMemo(
    () => COURSE_META_TAGS.filter((t) => !existingTagSet.has(t)).slice(0, 12),
    [existingTagSet],
  );
  const quickTopicTags = useMemo(
    () => COURSE_TOPIC_TAGS.filter((t) => !existingTagSet.has(t)).slice(0, 12),
    [existingTagSet],
  );

  useEffect(() => {
    setTagActive((i) => {
      if (tagSuggestions.length === 0) return 0;
      return Math.min(i, tagSuggestions.length - 1);
    });
  }, [tagSuggestions.length]);

  useEffect(() => {
    const onPointerDown = (ev: PointerEvent) => {
      if (!tagFieldRef.current?.contains(ev.target as Node)) setTagMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const pickTag = useCallback((tag: string) => {
    setTagsRaw((p) => applyTagSuggestion(p, tag));
    queueMicrotask(() => tagInputRef.current?.focus());
  }, []);

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (tagSuggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setTagMenuOpen(true);
      setTagActive((i) => (i + 1) % tagSuggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setTagMenuOpen(true);
      setTagActive((i) => (i - 1 + tagSuggestions.length) % tagSuggestions.length);
    } else if (e.key === 'Enter' && tagMenuOpen) {
      const t = tagSuggestions[tagActive];
      if (t) {
        e.preventDefault();
        pickTag(t);
      }
    } else if (e.key === 'Escape') {
      setTagMenuOpen(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('请填写课程名称');
      return;
    }
    setSubmitting(true);
    try {
      if (editCourse) {
        await updateCourse(editCourse.id, {
          name: trimmedName,
          description: description.trim(),
          language,
          tags: parseTags(tagsRaw),
          purpose,
          university: purpose === 'university' ? university : undefined,
          courseCode: purpose === 'university' ? courseCode : undefined,
        });
        onSuccess(editCourse.id);
      } else {
        const course = await createCourse({
          name: trimmedName,
          description: description.trim(),
          language,
          tags: parseTags(tagsRaw),
          purpose,
          university: purpose === 'university' ? university : undefined,
          courseCode: purpose === 'university' ? courseCode : undefined,
        });
        if (userId) markCourseOwnedByUser(userId, course.id);
        onSuccess(course.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : editCourse ? '保存失败' : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-5', className)}>
      <div>
        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
          课程名称 <span className="text-red-500">*</span>
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-violet-500/0 transition-[box-shadow,border-color] focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 dark:border-white/15 dark:bg-white/5 dark:text-white"
          placeholder="例如：算法设计"
          maxLength={120}
        />
      </div>

      <div>
        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">课程描述</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-violet-500/0 transition-[box-shadow,border-color] focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 dark:border-white/15 dark:bg-white/5 dark:text-white"
          placeholder="简要说明这门课学什么、面向谁…"
          maxLength={2000}
        />
      </div>

      <div>
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">语言</span>
        <div className="mt-2 flex gap-2">
          {(
            [
              { v: 'zh-CN' as const, l: '中文' },
              { v: 'en-US' as const, l: 'English' },
            ] as const
          ).map(({ v, l }) => (
            <button
              key={v}
              type="button"
              onClick={() => setLanguage(v)}
              className={cn(
                'rounded-xl border px-3 py-1.5 text-sm transition-colors',
                language === v
                  ? 'border-violet-500 bg-violet-500/10 text-violet-800 dark:text-violet-200'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/5',
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div ref={tagFieldRef} className="relative">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-200" htmlFor="course-tags-input">
          Tag
        </label>
        <input
          ref={tagInputRef}
          id="course-tags-input"
          type="text"
          autoComplete="off"
          value={tagsRaw}
          onChange={(e) => {
            setTagsRaw(e.target.value);
            setTagMenuOpen(true);
          }}
          onFocus={() => tagSuggestions.length > 0 && setTagMenuOpen(true)}
          onKeyDown={handleTagKeyDown}
          role="combobox"
          aria-expanded={tagMenuOpen && tagSuggestions.length > 0}
          aria-controls="course-tags-suggestions"
          aria-autocomplete="list"
          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-violet-500/0 transition-[box-shadow,border-color] focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 dark:border-white/15 dark:bg-white/5 dark:text-white"
          placeholder="可混用：阶段（入门）、场景（在职）、方向（Python）等，逗号分隔"
        />
        {tagMenuOpen && tagSuggestions.length > 0 ? (
          <ul
            id="course-tags-suggestions"
            role="listbox"
            className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg dark:border-white/15 dark:bg-slate-900"
          >
            {tagSuggestions.map((t, idx) => (
              <li key={t} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={idx === tagActive}
                  className={cn(
                    'flex w-full px-3 py-2 text-left transition-colors',
                    idx === tagActive
                      ? 'bg-violet-500/15 text-violet-900 dark:bg-violet-500/20 dark:text-violet-100'
                      : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5',
                  )}
                  onMouseEnter={() => setTagActive(idx)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickTag(t)}
                >
                  {t}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {quickMetaTags.length > 0 ? (
          <div className="mt-2">
            <p className="mb-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              阶段与场景
            </p>
            <div className="flex flex-wrap gap-1.5">
              {quickMetaTags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => pickTag(t)}
                  className="rounded-lg border border-slate-200/90 bg-slate-50/80 px-2 py-0.5 text-[11px] text-slate-600 transition-colors hover:border-violet-300 hover:bg-violet-50/80 hover:text-violet-900 dark:border-white/15 dark:bg-white/5 dark:text-slate-300 dark:hover:border-violet-500/40 dark:hover:bg-violet-950/40 dark:hover:text-violet-200"
                >
                  + {t}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {quickTopicTags.length > 0 ? (
          <div className="mt-2">
            <p className="mb-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              内容与方向
            </p>
            <div className="flex flex-wrap gap-1.5">
              {quickTopicTags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => pickTag(t)}
                  className="rounded-lg border border-slate-200/90 bg-slate-50/80 px-2 py-0.5 text-[11px] text-slate-600 transition-colors hover:border-violet-300 hover:bg-violet-50/80 hover:text-violet-900 dark:border-white/15 dark:bg-white/5 dark:text-slate-300 dark:hover:border-violet-500/40 dark:hover:bg-violet-950/40 dark:hover:text-violet-200"
                >
                  + {t}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div>
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">用途</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {PURPOSE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPurpose(opt.value)}
              className={cn(
                'rounded-xl border px-3 py-1.5 text-sm transition-colors',
                purpose === opt.value
                  ? 'border-violet-500 bg-violet-500/10 text-violet-800 dark:text-violet-200'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/5',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {purpose === 'university' && (
        <div className="space-y-4 rounded-xl border border-dashed border-slate-200 p-4 dark:border-white/15">
          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              学校 / 大学
            </label>
            <input
              value={university}
              onChange={(e) => setUniversity(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 dark:border-white/15 dark:bg-white/5 dark:text-white"
              placeholder="选填"
              maxLength={120}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">课号</label>
            <input
              value={courseCode}
              onChange={(e) => setCourseCode(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 dark:border-white/15 dark:bg-white/5 dark:text-white"
              placeholder="选填，例如 CSC373"
              maxLength={40}
            />
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      <Button
        type="submit"
        disabled={submitting}
        className="h-11 w-full rounded-xl bg-slate-900 text-white hover:opacity-90 dark:bg-white dark:text-slate-900"
      >
        {submitting ? (editCourse ? '保存中…' : '创建中…') : editCourse ? '保存更改' : '创建课程'}
      </Button>
    </form>
  );
}
