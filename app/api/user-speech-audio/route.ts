import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { findUserSpeechAudio } from '@/lib/server/repositories/user-speech-audio-repository';

export async function GET(request: Request) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;

    const url = new URL(request.url);
    const assetKey = url.searchParams.get('key')?.trim();
    if (!assetKey) {
      return NextResponse.json({ error: 'Missing key' }, { status: 400 });
    }

    const audio = await findUserSpeechAudio(prisma, auth.userId, assetKey);
    if (!audio) {
      return NextResponse.json({ audio: null });
    }

    return NextResponse.json({
      audio: {
        format: audio.format,
        base64: audio.base64,
        visemes: audio.visemes,
        mouthCues: audio.mouthCues,
      },
    });
  });
}
