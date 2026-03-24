import type { NextAuthOptions } from 'next-auth';
import { getServerSession } from 'next-auth';
import GitHubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { isDatabaseAvailable, getOptionalPrisma } from '@/lib/server/prisma-safe';

function buildProviders() {
  const providers = [];

  const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (googleClientId && googleClientSecret) {
    providers.push(
      GoogleProvider({
        clientId: googleClientId,
        clientSecret: googleClientSecret,
      }),
    );
  }

  const githubClientId = process.env.GITHUB_CLIENT_ID?.trim();
  const githubClientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();
  if (githubClientId && githubClientSecret) {
    providers.push(
      GitHubProvider({
        clientId: githubClientId,
        clientSecret: githubClientSecret,
      }),
    );
  }

  return providers;
}

const prismaClient = getOptionalPrisma();

export const authOptions: NextAuthOptions = {
  ...(isDatabaseAvailable() && prismaClient ? { adapter: PrismaAdapter(prismaClient) } : {}),
  secret: process.env.NEXTAUTH_SECRET,
  providers: buildProviders(),
  session: {
    strategy: isDatabaseAvailable() ? 'database' : 'jwt',
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = (user as { role?: 'USER' | 'ADMIN' }).role || 'USER';
      }
      return session;
    },
  },
};

export async function requireServerSession() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return null;
    }
    return session;
  } catch (e) {
    // 数据库不可用时 NextAuth + PrismaAdapter 可能抛错；交给 x-user-id 等降级路径
    console.error('[auth] getServerSession failed', e);
    return null;
  }
}
