import { NextResponse, type NextRequest } from 'next/server';

const CLASSROOM_TASK_HISTORY_PATH = /^\/classroom\/([^/]+)\/tasks(?:\/.*)?$/;

export function middleware(request: NextRequest) {
  const match = request.nextUrl.pathname.match(CLASSROOM_TASK_HISTORY_PATH);
  if (!match?.[1]) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/classroom/${match[1]}`;
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/classroom/:id/tasks/:path*'],
};
