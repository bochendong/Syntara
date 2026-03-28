import NextAuth from 'next-auth';
import { authOptions } from '@/lib/server/auth';

const handler = NextAuth(authOptions);

/** 未配置 OAuth 时仍须允许 /api/auth/session、csrf 等，否则全站 SessionProvider 会 500（本地演示登录不依赖 OAuth）。 */
export async function GET(request: Request) {
  return handler(request);
}

export async function POST(request: Request) {
  return handler(request);
}
