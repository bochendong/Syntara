/**
 * OpenAI TTS smoke test (same endpoint as in-app openai-tts).
 *
 * Usage:
 *   pnpm test:tts-gen
 *   pnpm exec dotenv -e .env.local -- node scripts/smoke/test-openai-tts.mjs [voice] [text]
 *
 * Env: TTS_OPENAI_API_KEY or OPENAI_API_KEY; optional TTS_OPENAI_BASE_URL
 * Output: temp/tts-openai-<voice>-<timestamp>.mp3
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');
const tempDir = path.join(root, 'temp');

const apiKey = process.env.TTS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
const baseUrl = (process.env.TTS_OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const voice = process.argv[2] || 'alloy';
const text = process.argv[3] || '你好，这是一次语音合成测试。Hello, this is a text-to-speech test.';

async function main() {
  if (!apiKey) {
    console.error('Missing API key: set TTS_OPENAI_API_KEY or OPENAI_API_KEY in .env.local');
    process.exit(1);
  }

  fs.mkdirSync(tempDir, { recursive: true });

  const res = await fetch(`${baseUrl}/audio/speech`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      input: text,
      voice,
      speed: 1.0,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('OpenAI TTS API error:', res.status, errText);
    process.exit(1);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const safeVoice = voice.replace(/[^a-z0-9.-]/gi, '_');
  const out = path.join(tempDir, `tts-openai-${safeVoice}-${Date.now()}.mp3`);
  fs.writeFileSync(out, buf);
  console.log('Saved:', out, `(${buf.length} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
