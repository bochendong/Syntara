import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  issueAdminSessionCookie,
  requireAdmin,
  validateAdminLogin,
} from '@/lib/server/admin-auth';

export async function GET() {
  const admin = await requireAdmin();
  if ('response' in admin) {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }

  return NextResponse.json({
    authenticated: true,
    identity: admin.identity,
  });
}

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: '请求体不是有效 JSON' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() || '';
  const password = body.password?.trim() || '';
  if (!validateAdminLogin(email, password)) {
    return NextResponse.json({ error: '管理员邮箱或密码错误' }, { status: 401 });
  }

  const token = issueAdminSessionCookie(email);
  if (!token) {
    return NextResponse.json(
      { error: '管理员登录尚未配置，请设置 ADMIN_LOGIN_EMAIL 和 ADMIN_LOGIN_PASSWORD' },
      { status: 503 },
    );
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 14,
  });
  return response;
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);
  return NextResponse.json({ success: true });
}
