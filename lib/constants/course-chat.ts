import { pickStableCourseAvatarUrl, resolveCourseAvatarDisplayUrl } from '@/lib/constants/course-avatars';

export const COURSE_ORCHESTRATOR_ID = 'course-orchestrator';
export const COURSE_ORCHESTRATOR_NAME = '课程总控Agent';

/** 与聊天页总控底部 Tabs 的 value 一致，用于 `?composer=` 深链 */
export type CourseOrchestratorComposerTab = 'send-message' | 'generate-notebook';

/** 进入聊天页并打开课程总控；可选指定底部「发送消息 / 生成笔记本」Tab */
export function courseOrchestratorChatHref(composer?: CourseOrchestratorComposerTab): string {
  const q = new URLSearchParams();
  q.set('agent', COURSE_ORCHESTRATOR_ID);
  if (composer) q.set('composer', composer);
  return `/chat?${q.toString()}`;
}

/** 无课程上下文时的占位（与历史 assist 解耦，仍为稳定本地图） */
export const COURSE_ORCHESTRATOR_AVATAR = pickStableCourseAvatarUrl('course-orchestrator-legacy-fallback');

/** 课程总控在 UI 中使用的头像：优先课程已保存的 `avatarUrl`，否则按课程 id 稳定映射。 */
export function resolveCourseOrchestratorAvatar(
  courseId: string | null | undefined,
  courseAvatarUrl: string | null | undefined,
): string {
  return resolveCourseAvatarDisplayUrl(courseId, courseAvatarUrl);
}
