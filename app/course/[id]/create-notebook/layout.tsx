import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '创建笔记本 · Syntara',
  description: '在课程工作区中按步骤确认素材、大纲、样张并创建笔记本。',
};

export default function CourseCreateNotebookLayout({ children }: { children: React.ReactNode }) {
  return children;
}
