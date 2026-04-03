import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { MouthCue } from '@/lib/types/action';
import { createLogger } from '@/lib/logger';
import { normalizeRhubarbMouthCues } from './mouth-cues';

const log = createLogger('RhubarbLipSync');

function inferInputExtension(format: string): string {
  switch (format.toLowerCase()) {
    case 'mpeg':
      return 'mp3';
    case 'wave':
      return 'wav';
    default:
      return format.toLowerCase();
  }
}

async function runCommand(
  command: string,
  args: string[],
  options: { input?: Uint8Array } = {},
): Promise<Buffer> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdoutChunks));
        return;
      }

      reject(
        new Error(
          `${command} exited with code ${code}: ${Buffer.concat(stderrChunks).toString('utf8')}`,
        ),
      );
    });

    if (options.input) {
      child.stdin.write(Buffer.from(options.input));
    }
    child.stdin.end();
  });
}

async function convertAudioToPcm16Khz(audio: Uint8Array, format: string): Promise<Buffer> {
  const ext = inferInputExtension(format);
  const tempDir = path.join(os.tmpdir(), `synatra-rhubarb-${randomUUID()}`);
  const inputPath = path.join(tempDir, `input.${ext}`);

  await fs.mkdir(tempDir, { recursive: true });
  try {
    await fs.writeFile(inputPath, audio);
    return await runCommand('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      inputPath,
      '-ac',
      '1',
      '-ar',
      '16000',
      '-f',
      's16le',
      'pipe:1',
    ]);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function analyzeMouthCuesFromAudio(
  audio: Uint8Array,
  format: string,
  dialogText?: string,
): Promise<MouthCue[] | undefined> {
  try {
    const pcm = await convertAudioToPcm16Khz(audio, format);
    const { Rhubarb } = await import('rhubarb-lip-sync-wasm');
    const pcmBuffer = Buffer.from(pcm) as Buffer<ArrayBuffer>;
    const result = await Rhubarb.getLipSync(pcmBuffer, {
      dialogText,
    });
    return normalizeRhubarbMouthCues(result.mouthCues);
  } catch (error) {
    log.warn('Failed to analyze Rhubarb mouth cues:', error);
    return undefined;
  }
}
