import type { CoursePurpose } from '@/lib/utils/database';

/** 课程商城中的可一键添加到「我的课程」的模板（本地展示，创建时写入数据库） */
export type CourseStoreTemplate = {
  id: string;
  name: string;
  description: string;
  language: 'zh-CN' | 'en-US';
  tags: string[];
  purpose: CoursePurpose;
  university?: string;
  courseCode?: string;
};

export const COURSE_STORE_TEMPLATES: CourseStoreTemplate[] = [
  {
    id: 'tpl-daily-notes',
    name: '日常学习与笔记',
    description: '通用学习容器，适合自订主题、碎片知识整理与复习。',
    language: 'zh-CN',
    tags: ['日常', '笔记'],
    purpose: 'daily',
  },
  {
    id: 'tpl-uni-cs101',
    name: '大学课程 · 计算机入门',
    description: '面向大学课堂：概念讲解、例题与简短测验，可按院系与课号自行调整。',
    language: 'zh-CN',
    tags: ['大学', '计算机'],
    purpose: 'university',
    university: '示例大学',
    courseCode: 'CS101',
  },
  {
    id: 'tpl-research',
    name: '科研文献与汇报',
    description: '适合论文阅读、组会汇报与课题讨论，强调结构化输出。',
    language: 'zh-CN',
    tags: ['科研', '文献'],
    purpose: 'research',
  },
];
