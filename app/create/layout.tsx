import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '创建笔记本 · OpenMAIC',
  description: '在某一门课程下描述学习需求并生成互动笔记本。',
};

export default function CreateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
