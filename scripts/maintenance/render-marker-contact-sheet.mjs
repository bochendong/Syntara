#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;
const PAGE_WIDTH = 800;
const PAGE_HEIGHT = 450;
const GAP = 18;
const LABEL_HEIGHT = 34;

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function usage() {
  return [
    'Usage: node scripts/maintenance/render-marker-contact-sheet.mjs --notebook-id <id-or-url> [--out <png>]',
    '',
    'Renders the current stored retrofitted marker overlay for each image-notebook page.',
  ].join('\n');
}

function notebookIdFromValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const classroomMatch = raw.match(/\/classroom\/([^/?#]+)/);
  if (classroomMatch) return decodeURIComponent(classroomMatch[1]);
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      const last = url.pathname.split('/').filter(Boolean).at(-1);
      return last ? decodeURIComponent(last) : null;
    } catch {
      return null;
    }
  }
  return raw;
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function sceneElements(scene) {
  const elements = scene.content?.canvas?.elements;
  return Array.isArray(elements) ? elements : [];
}

function isFullPageImageElement(element) {
  if (!isRecord(element) || element.type !== 'image') return false;
  const name = String(element.name || '');
  const width = Number(element.width || 0);
  const height = Number(element.height || 0);
  return (
    /full_page_bitmap/i.test(name) || (width >= CANVAS_WIDTH * 0.9 && height >= CANVAS_HEIGHT * 0.9)
  );
}

async function loadImageBuffer(source) {
  if (!source || typeof source !== 'string') return null;
  if (source.startsWith('data:image/')) {
    const comma = source.indexOf(',');
    if (comma < 0) return null;
    return Buffer.from(source.slice(comma + 1), 'base64');
  }
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Failed to fetch image ${source}: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
  const clean = source.split('?')[0];
  const localPath = clean.startsWith('/')
    ? path.join(process.cwd(), 'public', clean)
    : path.resolve(process.cwd(), clean);
  if (!fs.existsSync(localPath)) return null;
  return fs.readFileSync(localPath);
}

function escapeXml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function componentLabelById(promptPlan) {
  const labels = new Map();
  const plans = Array.isArray(promptPlan?.componentPlans) ? promptPlan.componentPlans : [];
  for (const plan of plans) {
    if (!isRecord(plan) || typeof plan.id !== 'string') continue;
    labels.set(plan.id, plan.label || plan.id);
  }
  return labels;
}

function normalizedOverlayComponents(promptPlan) {
  const result = promptPlan?.recoveryResult;
  const overlay = result?.retrofittedMarkerOverlay;
  if (!isRecord(overlay) || !Array.isArray(overlay.markers)) return [];
  const labels = componentLabelById(promptPlan);
  const recoveredComponents = Array.isArray(result?.components) ? result.components : [];
  const byComponentId = new Map();

  for (const component of recoveredComponents) {
    if (!isRecord(component) || typeof component.componentId !== 'string') continue;
    const bbox = Array.isArray(component.bbox)
      ? {
          left: Number(component.bbox[0]),
          top: Number(component.bbox[1]),
          right: Number(component.bbox[2]),
          bottom: Number(component.bbox[3]),
        }
      : undefined;
    byComponentId.set(component.componentId, {
      bbox,
      componentId: component.componentId,
      label: labels.get(component.componentId) || component.componentId,
      markerColorHex: component.markerColorHex || '#ff0000',
      points: [],
    });
  }

  for (const marker of overlay.markers) {
    if (!isRecord(marker) || typeof marker.componentId !== 'string') continue;
    const existing = byComponentId.get(marker.componentId) || {
      componentId: marker.componentId,
      label: labels.get(marker.componentId) || marker.componentId,
      markerColorHex: marker.markerColorHex || '#ff0000',
      points: [],
    };
    existing.points.push(marker);
    existing.markerColorHex = existing.markerColorHex || marker.markerColorHex || '#ff0000';
    byComponentId.set(marker.componentId, existing);
  }

  return [...byComponentId.values()];
}

function overlaySvg(scene, index) {
  const promptPlan = scene.content?.imageNotebookPromptPlan;
  const components = normalizedOverlayComponents(promptPlan);
  const scaleX = PAGE_WIDTH / CANVAS_WIDTH;
  const scaleY = PAGE_HEIGHT / CANVAS_HEIGHT;
  const markerSize = 10;
  const componentLabels = components
    .map((component) => {
      const bbox = component.bbox;
      const points = Array.isArray(component.points) ? component.points : [];
      const label = escapeXml(component.label || component.componentId || '');
      const color = component.markerColorHex || '#ff0000';
      const rect =
        bbox && typeof bbox.left === 'number'
          ? `<rect x="${bbox.left * scaleX}" y="${bbox.top * scaleY}" width="${
              (bbox.right - bbox.left) * scaleX
            }" height="${(bbox.bottom - bbox.top) * scaleY}" fill="none" stroke="${color}" stroke-opacity="0.32" stroke-width="2" stroke-dasharray="6 6"/>`
          : '';
      const pointRects = points
        .map((point) => {
          const x = Number(point.x || 0) * scaleX - markerSize / 2;
          const y = Number(point.y || 0) * scaleY - markerSize / 2;
          return `<rect x="${x}" y="${y}" width="${markerSize}" height="${markerSize}" fill="${color}" stroke="#111" stroke-width="1"/>`;
        })
        .join('');
      const text =
        bbox && label
          ? `<text x="${bbox.left * scaleX + 4}" y="${Math.max(
              15,
              bbox.top * scaleY - 4,
            )}" fill="${color}" font-family="Arial" font-size="15" font-weight="700">${label}</text>`
          : '';
      return `${rect}${pointRects}${text}`;
    })
    .join('');
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${PAGE_WIDTH}" height="${LABEL_HEIGHT}" fill="rgba(255,255,255,0.78)"/>
  <text x="12" y="23" fill="#111" font-family="Arial" font-size="18" font-weight="700">#${index}</text>
  ${componentLabels}
</svg>`);
}

async function renderScene(scene, index) {
  const imageElement = sceneElements(scene).find(isFullPageImageElement);
  const imageBuffer = await loadImageBuffer(imageElement?.src);
  if (!imageBuffer) {
    throw new Error(`Scene ${scene.id || index} has no readable full-page image.`);
  }
  return sharp(imageBuffer)
    .resize(PAGE_WIDTH, PAGE_HEIGHT, { fit: 'fill' })
    .composite([{ input: overlaySvg(scene, index), left: 0, top: 0 }])
    .png()
    .toBuffer();
}

async function main() {
  loadEnvLocal();
  const notebookId = notebookIdFromValue(readOption('--notebook-id') || readOption('--notebook'));
  if (!notebookId || process.argv.includes('--help')) {
    console.log(usage());
    process.exit(notebookId ? 0 : 1);
  }
  const outPath =
    readOption('--out') ||
    path.join(os.tmpdir(), `${notebookId.replace(/[^A-Za-z0-9_-]/g, '_')}-marker-sheet.png`);
  const prisma = new PrismaClient();
  try {
    const notebook = await prisma.notebook.findUnique({
      where: { id: notebookId },
      include: { scenes: { orderBy: { order: 'asc' } } },
    });
    if (!notebook) throw new Error(`Notebook not found: ${notebookId}`);
    const pages = [];
    for (const scene of notebook.scenes) {
      pages.push(await renderScene(scene, scene.order));
    }
    const columns = 2;
    const rows = Math.ceil(pages.length / columns);
    const width = columns * PAGE_WIDTH + (columns - 1) * GAP;
    const height = rows * PAGE_HEIGHT + (rows - 1) * GAP;
    const composites = pages.map((input, index) => ({
      input,
      left: (index % columns) * (PAGE_WIDTH + GAP),
      top: Math.floor(index / columns) * (PAGE_HEIGHT + GAP),
    }));
    await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: '#f5f7fb',
      },
    })
      .composite(composites)
      .png()
      .toFile(outPath);
    console.log(JSON.stringify({ notebookId, scenes: pages.length, outPath }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
