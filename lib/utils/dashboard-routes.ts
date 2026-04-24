/**
 * 左侧栏「Dashboard」壳层：与课程/课堂内工作区分界，
 * 在此区域内固定展示 Dashboard / 充值 / 交易积分 / 商城入口 / 个人中心 / 设置。
 *
 * 当已选中某门课程（`courseId` 有值）时，`/top-up` 与 `/credits-market` 仍沿用课程工作区侧栏。
 */
export function isDashboardRoute(
  pathname: string | null | undefined,
  courseId?: string | null,
): boolean {
  if (!pathname) return false;
  const p = pathname;
  const inCourseWorkspace = Boolean(courseId?.trim());
  if (inCourseWorkspace) {
    if (p === '/top-up' || p.startsWith('/top-up/')) return false;
    if (p === '/credits-market' || p.startsWith('/credits-market/')) return false;
  }
  if (p === '/') return true;
  if (p === '/my-courses') return true;
  if (p === '/top-up' || p.startsWith('/top-up/')) return true;
  if (p === '/credits-market' || p.startsWith('/credits-market/')) return true;
  if (p === '/gamification' || p.startsWith('/gamification/')) return true;
  if (p === '/profile' || p.startsWith('/profile/')) return true;
  if (p === '/settings' || p.startsWith('/settings/')) return true;
  if (p === '/live2d' || p.startsWith('/live2d/')) return true;
  if (p === '/store/avatars' || p.startsWith('/store/avatars/')) return true;
  /** 课程商城（含详情）属于 Dashboard，不与笔记本商城 `/store` 混用 */
  if (p === '/store/courses' || p.startsWith('/store/courses/')) return true;
  if (p === '/notifications' || p.startsWith('/notifications/')) return true;
  if (p === '/agent-teams' || p.startsWith('/agent-teams/')) return true;
  return false;
}
