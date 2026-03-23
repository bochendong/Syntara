import { create } from 'zustand';

export type CurrentCoursePayload = {
  id: string;
  name: string;
  avatarUrl?: string;
};

type CurrentCourseState = {
  id: string | null;
  name: string;
  avatarUrl: string | null;
  setCurrentCourse: (course: CurrentCoursePayload | null) => void;
  clearCurrentCourse: () => void;
};

/**
 * 进入某门课程后的「当前课程」上下文（课程详情、该课程下创建笔记本、课堂等页面应同步）。
 * 侧栏顶部可展示课程头像与名称；离开课程相关路由时应 clear。
 */
export const useCurrentCourseStore = create<CurrentCourseState>((set) => ({
  id: null,
  name: '',
  avatarUrl: null,
  setCurrentCourse: (course) => {
    if (!course?.id?.trim()) {
      set({ id: null, name: '', avatarUrl: null });
      return;
    }
    set({
      id: course.id.trim(),
      name: course.name.trim() || '未命名课程',
      avatarUrl: course.avatarUrl?.trim() || null,
    });
  },
  clearCurrentCourse: () => set({ id: null, name: '', avatarUrl: null }),
}));
