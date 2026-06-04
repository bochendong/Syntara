/**
 * Single TTS Generation API
 *
 * Generates TTS audio for a single text string and returns base64-encoded audio.
 * Called by the client in parallel for each speech action after a scene is generated.
 *
 * POST /api/generate/tts
 */

import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { generateTTS } from '@/lib/audio/tts-providers';
import { resolveTTSApiKey, resolveTTSBaseUrl } from '@/lib/server/provider-config';
import type { TTSProviderId } from '@/lib/audio/types';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
import { verbalizeNarrationText } from '@/lib/audio/spoken-text';
import { requireUserId } from '@/lib/server/api-auth';
import { prisma } from '@/lib/server/prisma';
import {
  findUserSpeechAudio,
  upsertUserSpeechAudio,
} from '@/lib/server/repositories/user-speech-audio-repository';

const log = createLogger('TTS API');

export const maxDuration = 60;

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function buildUserSpeechAudioAssetKey(args: {
  userId: string;
  actionId: string;
  providerId: string;
  voice: string;
  speed: number;
  text: string;
}): string {
  return sha256Hex(
    `${args.userId || 'anonymous'}\0${args.actionId}\0${args.providerId}\0${args.voice}\0${args.speed}\0${args.text}`,
  );
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;

    const body = await req.json();
    const { text, audioId, ttsProviderId, ttsVoice, ttsSpeed, ttsApiKey, ttsBaseUrl, persist } =
      body as {
        text: string;
        audioId: string;
        ttsProviderId: TTSProviderId;
        ttsVoice: string;
        ttsSpeed?: number;
        ttsApiKey?: string;
        ttsBaseUrl?: string;
        persist?: boolean;
      };

    // Validate required fields
    if (!text || !audioId || !ttsProviderId || !ttsVoice) {
      return apiError(
        'MISSING_REQUIRED_FIELD',
        400,
        'Missing required fields: text, audioId, ttsProviderId, ttsVoice',
      );
    }

    // Reject browser-native TTS — must be handled client-side
    if (ttsProviderId === 'browser-native-tts') {
      return apiError('INVALID_REQUEST', 400, 'browser-native-tts must be handled client-side');
    }

    const clientBaseUrl = ttsBaseUrl || undefined;
    if (clientBaseUrl && process.env.NODE_ENV === 'production') {
      const ssrfError = validateUrlForSSRF(clientBaseUrl);
      if (ssrfError) {
        return apiError('INVALID_URL', 403, ssrfError);
      }
    }

    const apiKey = clientBaseUrl
      ? ttsApiKey || ''
      : resolveTTSApiKey(ttsProviderId, ttsApiKey || undefined);
    const baseUrl = clientBaseUrl
      ? clientBaseUrl
      : resolveTTSBaseUrl(ttsProviderId, ttsBaseUrl || undefined);

    const spokenText = verbalizeNarrationText(text);
    const speed = ttsSpeed ?? 1.0;
    const shouldPersist = persist !== false;
    const assetKey = buildUserSpeechAudioAssetKey({
      userId,
      actionId: audioId,
      providerId: ttsProviderId,
      voice: ttsVoice,
      speed,
      text: spokenText,
    });

    if (shouldPersist) {
      const existingAudio = await findUserSpeechAudio(prisma, userId, assetKey);
      if (existingAudio) {
        return apiSuccess({
          audioId,
          base64: existingAudio.base64,
          format: existingAudio.format,
          visemes: existingAudio.visemes,
          mouthCues: existingAudio.mouthCues,
        });
      }
    }

    // Build TTS config
    const config = {
      providerId: ttsProviderId,
      voice: ttsVoice,
      speed,
      apiKey,
      baseUrl,
    };

    log.info(
      `Generating TTS: provider=${ttsProviderId}, voice=${ttsVoice}, audioId=${audioId}, textLen=${spokenText.length}`,
    );

    // Generate audio
    const { audio, format, visemes, mouthCues } = await generateTTS(config, spokenText);

    // Convert to base64
    const base64 = Buffer.from(audio).toString('base64');

    if (shouldPersist) {
      await upsertUserSpeechAudio(prisma, {
        userId,
        assetKey,
        actionId: audioId,
        textHash: sha256Hex(spokenText),
        voiceConfigHash: sha256Hex(`${ttsProviderId}\0${ttsVoice}\0${speed}`),
        providerId: ttsProviderId,
        voice: ttsVoice,
        speed,
        format,
        base64,
        visemes,
        mouthCues,
      });
    }

    return apiSuccess({ audioId, base64, format, visemes, mouthCues });
  } catch (error) {
    log.error('TTS generation error:', error);
    return apiError(
      'GENERATION_FAILED',
      500,
      error instanceof Error ? error.message : String(error),
    );
  }
}
