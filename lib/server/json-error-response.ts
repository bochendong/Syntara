import { NextResponse } from 'next/server';

/** 将未捕获异常转为 JSON，避免 Next 开发模式返回 HTML 导致前端只能看到「请求失败」 */
export function jsonErrorFromUnknown(err: unknown, status = 500): NextResponse {
  console.error('[api]', err);
  let message = '服务器内部错误';
  if (err instanceof Error) {
    message = err.message;
    if (/P1001|P1017|P2024|Can't reach database|ECONNREFUSED|ENOTFOUND|Server has closed the connection/i.test(message)) {
      message =
        '无法连接数据库：请确认 PostgreSQL 已运行，.env.local 中 DATABASE_URL 正确，并在项目根目录执行 pnpm db:push。';
    }
  }
  return NextResponse.json({ error: message }, { status });
}

export async function safeRoute(
  fn: () => Promise<Response | NextResponse | undefined>,
): Promise<Response> {
  try {
    const out = await fn();
    if (out == null) {
      return NextResponse.json({ error: '内部错误：路由未返回响应' }, { status: 500 });
    }
    return out;
  } catch (err) {
    return jsonErrorFromUnknown(err);
  }
}
