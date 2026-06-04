import crypto from 'node:crypto';
import type { DbClient } from '@/lib/server/repositories/types';

export type UserSpeechAudioRow = {
  id: string;
  userId: string;
  assetKey: string;
  actionId: string;
  textHash: string;
  voiceConfigHash: string;
  providerId: string;
  voice: string;
  speed: number;
  format: string;
  base64: string;
  visemes: unknown;
  mouthCues: unknown;
  createdAt: Date;
  updatedAt: Date;
};

let ensureUserSpeechAudioTablePromise: Promise<void> | null = null;

export async function ensureUserSpeechAudioTable(db: DbClient): Promise<void> {
  ensureUserSpeechAudioTablePromise ??= (async () => {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "UserSpeechAudio" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "assetKey" TEXT NOT NULL,
        "actionId" TEXT NOT NULL,
        "textHash" TEXT NOT NULL,
        "voiceConfigHash" TEXT NOT NULL,
        "providerId" TEXT NOT NULL,
        "voice" TEXT NOT NULL,
        "speed" DOUBLE PRECISION NOT NULL DEFAULT 1,
        "format" TEXT NOT NULL,
        "base64" TEXT NOT NULL,
        "visemes" JSONB,
        "mouthCues" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "UserSpeechAudio_userId_assetKey_key" UNIQUE ("userId", "assetKey")
      )
    `);
    await db.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "UserSpeechAudio_userId_updatedAt_idx" ON "UserSpeechAudio"("userId", "updatedAt" DESC)',
    );
    await db.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "UserSpeechAudio_userId_actionId_idx" ON "UserSpeechAudio"("userId", "actionId")',
    );
  })();
  await ensureUserSpeechAudioTablePromise;
}

export async function findUserSpeechAudio(
  db: DbClient,
  userId: string,
  assetKey: string,
): Promise<UserSpeechAudioRow | null> {
  await ensureUserSpeechAudioTable(db);
  const rows = await db.$queryRaw<UserSpeechAudioRow[]>`
    SELECT
      "id",
      "userId",
      "assetKey",
      "actionId",
      "textHash",
      "voiceConfigHash",
      "providerId",
      "voice",
      "speed",
      "format",
      "base64",
      "visemes",
      "mouthCues",
      "createdAt",
      "updatedAt"
    FROM "UserSpeechAudio"
    WHERE "userId" = ${userId} AND "assetKey" = ${assetKey}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function upsertUserSpeechAudio(
  db: DbClient,
  args: {
    userId: string;
    assetKey: string;
    actionId: string;
    textHash: string;
    voiceConfigHash: string;
    providerId: string;
    voice: string;
    speed: number;
    format: string;
    base64: string;
    visemes?: unknown;
    mouthCues?: unknown;
  },
): Promise<UserSpeechAudioRow> {
  await ensureUserSpeechAudioTable(db);
  const id = crypto.randomUUID();
  const rows = await db.$queryRawUnsafe<UserSpeechAudioRow[]>(
    `
      INSERT INTO "UserSpeechAudio" (
        "id",
        "userId",
        "assetKey",
        "actionId",
        "textHash",
        "voiceConfigHash",
        "providerId",
        "voice",
        "speed",
        "format",
        "base64",
        "visemes",
        "mouthCues",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        CAST($12 AS JSONB),
        CAST($13 AS JSONB),
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("userId", "assetKey") DO UPDATE SET
        "format" = EXCLUDED."format",
        "base64" = EXCLUDED."base64",
        "visemes" = EXCLUDED."visemes",
        "mouthCues" = EXCLUDED."mouthCues",
        "updatedAt" = CURRENT_TIMESTAMP
      RETURNING
        "id",
        "userId",
        "assetKey",
        "actionId",
        "textHash",
        "voiceConfigHash",
        "providerId",
        "voice",
        "speed",
        "format",
        "base64",
        "visemes",
        "mouthCues",
        "createdAt",
        "updatedAt"
    `,
    id,
    args.userId,
    args.assetKey,
    args.actionId,
    args.textHash,
    args.voiceConfigHash,
    args.providerId,
    args.voice,
    args.speed,
    args.format,
    args.base64,
    args.visemes == null ? null : JSON.stringify(args.visemes),
    args.mouthCues == null ? null : JSON.stringify(args.mouthCues),
  );
  return rows[0];
}
