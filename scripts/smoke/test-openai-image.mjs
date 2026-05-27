/**
 * One-off image generation test: calls OpenAI Images API (GPT Image / same shape as in-app openai-image).
 *
 * Usage:
 *   pnpm test:image-gen
 *   pnpm exec dotenv -e .env.local -- node scripts/smoke/test-openai-image.mjs [model] [prompt]
 *
 * Env: IMAGE_OPENAI_IMAGE_API_KEY or OPENAI_API_KEY; optional IMAGE_OPENAI_IMAGE_BASE_URL
 * Output: temp/image-<model>-<timestamp>.png
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');
const tempDir = path.join(root, 'temp');

const apiKey = process.env.IMAGE_OPENAI_IMAGE_API_KEY || process.env.OPENAI_API_KEY;
const baseUrl = (process.env.IMAGE_OPENAI_IMAGE_BASE_URL || 'https://api.openai.com/v1').replace(
  /\/$/,
  '',
);
const model = process.argv[2] || 'gpt-image-2';
const prompt =
  process.argv[3] ||
  'A minimal flat icon: single blue circle on white background, centered, no text';

async function main() {
  if (!apiKey) {
    console.error(
      'Missing API key: set IMAGE_OPENAI_IMAGE_API_KEY or OPENAI_API_KEY in .env.local',
    );
    process.exit(1);
  }

  fs.mkdirSync(tempDir, { recursive: true });

  const res = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size: '1024x1024',
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error('OpenAI Images API error:', res.status, text);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.error('Invalid JSON:', text.slice(0, 500));
    process.exit(1);
  }

  const b64 = data.data?.[0]?.b64_json;
  if (!b64) {
    console.error('No b64_json in response:', JSON.stringify(data, null, 2));
    process.exit(1);
  }

  const safeModel = model.replace(/[^a-z0-9.-]/gi, '_');
  const out = path.join(tempDir, `image-${safeModel}-${Date.now()}.png`);
  fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  console.log('Saved:', out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
