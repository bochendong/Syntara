import { NextResponse } from 'next/server';

/** 供登录页决定是否展示 OAuth 按钮（不返回密钥） */
export async function GET() {
  const google = Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
  const github = Boolean(
    process.env.GITHUB_CLIENT_ID?.trim() && process.env.GITHUB_CLIENT_SECRET?.trim(),
  );
  return NextResponse.json({ google, github });
}
