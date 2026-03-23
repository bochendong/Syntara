import { redirect } from 'next/navigation';

/** 应用入口默认进入「我的课程」；未登录时由该页再跳转登录 */
export default function HomePage() {
  redirect('/my-courses');
}
