import { NextResponse } from 'next/server';
import { requireServerSession } from '@/lib/server/auth';

export async function GET() {
  const session = await requireServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email ?? null,
    image: session.user.image ?? null,
  });
}
