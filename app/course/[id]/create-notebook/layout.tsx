import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '创建笔记本 · Syntara',
  description: '在课程工作区中创建笔记本，并使用右侧栏调整生成设置。',
};

export default function CourseCreateNotebookLayout({ children }: { children: React.ReactNode }) {
  return children;
}
