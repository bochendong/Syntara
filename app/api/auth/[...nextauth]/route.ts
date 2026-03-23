import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/server/auth';

const handler = NextAuth(authOptions);

function ensureProvidersConfigured() {
  if (authOptions.providers.length > 0) return null;
  return NextResponse.json(
    {
      error:
        'No OAuth provider configured. Set GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET or GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET.',
    },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  const err = ensureProvidersConfigured();
  if (err) return err;
  return handler(request);
}

export async function POST(request: Request) {
  const err = ensureProvidersConfigured();
  if (err) return err;
  return handler(request);
}
