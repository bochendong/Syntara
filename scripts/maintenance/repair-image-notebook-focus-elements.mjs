#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';

const SCRIPT_NAME = 'repair-image-notebook-focus-elements.mjs';
const SCRIPT_VERSION = '2026-05-29.v2';
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;
const HOTSPOT_PATH = 'M 0 0 L 200 0 L 200 200 L 0 200 Z';
const GENERATED_FOCUS_PREFIX = 'lecture-focus-generated:';
const MARKER_MATCHERS = [
  { name: 'red', hex: '#ff0000', match: (r, g, b) => r > 180 && g < 85 && b < 85 },
  { name: 'lime', hex: '#00ff00', match: (r, g, b) => g > 170 && r < 90 && b < 95 },
  { name: 'blue', hex: '#0048ff', match: (r, g, b) => b > 145 && r < 90 && g < 140 },
  { name: 'cyan', hex: '#00ffff', match: (r, g, b) => g > 165 && b > 165 && r < 95 },
  { name: 'magenta', hex: '#ff00ff', match: (r, g, b) => r > 170 && b > 130 && g < 95 },
  { name: 'yellow', hex: '#ffff00', match: (r, g, b) => r > 170 && g > 170 && b < 110 },
];

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

function usage() {
  return [
    `Usage: node scripts/maintenance/${SCRIPT_NAME} --notebook-id <id-or-classroom-url> [--write] [--force]`,
    '',
    'Examples:',
    `  node scripts/maintenance/${SCRIPT_NAME} --notebook-id tIuImmCBQd`,
    `  node scripts/maintenance/${SCRIPT_NAME} --notebook-id http://localhost:3000/classroom/tIuImmCBQd --write`,
    '',
    'Defaults to dry-run. Add --write to mutate the remote DATABASE_URL from .env.local.',
    'Use --force to remove previously generated focus shapes and rebuild them from actions.',
    'By default it also removes visible pure-color corner markers from full-page notebook images.',
  ].join('\n');
}

function readOptions(name) {
  const values = [];
  for (let index = 2; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) {
      values.push(process.argv[index + 1]);
    }
  }
  return values;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function notebookIdFromValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const classroomMatch = raw.match(/\/classroom\/([^/?#]+)/);
  if (classroomMatch) return decodeURIComponent(classroomMatch[1]);
  const notebookMatch = raw.match(/\/notebooks?\/([^/?#]+)/);
  if (notebookMatch) return decodeURIComponent(notebookMatch[1]);
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      const last = url.pathname.split('/').filter(Boolean).at(-1);
      return last ? decodeURIComponent(last) : null;
    } catch {
      return null;
    }
  }
  return raw.replace(/^['"]|['"]$/g, '');
}

function parseNotebookIds() {
  const explicit = [...readOptions('--notebook-id'), ...readOptions('--notebook')];
  const positional = process.argv.slice(2).filter((arg, index, all) => {
    if (arg.startsWith('--')) return false;
    const previous = all[index - 1];
    return previous !== '--notebook-id' && previous !== '--notebook';
  });
  const ids = [...explicit, ...positional]
    .flatMap((value) => String(value).split(','))
    .map(notebookIdFromValue)
    .filter(Boolean);
  return [...new Set(ids)];
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function sceneElements(scene) {
  const elements = scene.content?.canvas?.elements;
  return Array.isArray(elements) ? elements : [];
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function componentCenter(component) {
  return {
    x: component.minX + component.width / 2,
    y: component.minY + component.height / 2,
  };
}

function markerImageElement(elements) {
  return elements.find((element) => {
    if (!isRecord(element) || element.type !== 'image') return false;
    const name = String(element.name || '');
    const width = Number(element.width || 0);
    const height = Number(element.height || 0);
    return (
      /full_page_bitmap/i.test(name) ||
      (width >= CANVAS_WIDTH * 0.9 && height >= CANVAS_HEIGHT * 0.9)
    );
  });
}

function actionTargetId(action) {
  if (!isRecord(action)) return null;
  for (const key of ['elementId', 'targetElementId', 'targetId', 'focusTargetId']) {
    if (typeof action[key] === 'string' && action[key].trim()) return action[key].trim();
  }
  return null;
}

function orderedActionTargetIds(actions) {
  if (!Array.isArray(actions)) return [];
  const seen = new Set();
  const ids = [];
  for (const action of actions) {
    const id = actionTargetId(action);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function isRepairableFocusTargetId(id, promptPlanFocusIds = new Set()) {
  return (
    promptPlanFocusIds.has(id) ||
    /^focus[-_:]/i.test(id) ||
    /lecture-focus-generated|semantic-hit-map/i.test(id)
  );
}

function isGeneratedFocusElement(element) {
  if (!isRecord(element)) return false;
  return /lecture-focus-generated|semantic-hit-map/i.test(
    `${element.id || ''} ${element.name || ''}`,
  );
}

function sourceToBuffer(imageSrc) {
  const src = String(imageSrc || '').trim();
  if (!src) return null;
  if (src.startsWith('data:')) {
    const [, base64] = src.split(',');
    return base64 ? Buffer.from(base64, 'base64') : null;
  }
  if (/^[A-Za-z0-9+/=\s]+$/.test(src) && src.length > 200) {
    return Buffer.from(src, 'base64');
  }
  return null;
}

async function decodeRawImage(imageSrc) {
  const input = sourceToBuffer(imageSrc);
  if (!input) return null;
  const { data, info } = await sharp(input)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    data,
    width: info.width,
    height: info.height,
  };
}

function componentsForColor(raw, matcher) {
  const mask = new Uint8Array(raw.width * raw.height);
  for (let i = 0, p = 0; i < raw.data.length; i += 3, p += 1) {
    if (matcher.match(raw.data[i] || 0, raw.data[i + 1] || 0, raw.data[i + 2] || 0)) {
      mask[p] = 1;
    }
  }

  const seen = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  const components = [];

  for (let y = 0; y < raw.height; y += 1) {
    for (let x = 0; x < raw.width; x += 1) {
      const idx = y * raw.width + x;
      if (!mask[idx] || seen[idx]) continue;

      let head = 0;
      let tail = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let area = 0;
      queue[tail] = idx;
      tail += 1;
      seen[idx] = 1;

      while (head < tail) {
        const cur = queue[head] || 0;
        head += 1;
        const cx = cur % raw.width;
        const cy = Math.floor(cur / raw.width);
        area += 1;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || nx >= raw.width || ny < 0 || ny >= raw.height) continue;
            const ni = ny * raw.width + nx;
            if (!mask[ni] || seen[ni]) continue;
            seen[ni] = 1;
            queue[tail] = ni;
            tail += 1;
          }
        }
      }

      const width = maxX - minX + 1;
      const height = maxY - minY + 1;
      if (area >= 18 && width >= 4 && height >= 4) {
        components.push({ minX, minY, maxX, maxY, width, height, area });
      }
    }
  }

  return components;
}

function isStrictCornerMarker(component) {
  const aspect = component.width / Math.max(1, component.height);
  const fillRatio = component.area / Math.max(1, component.width * component.height);
  return (
    component.width >= 10 &&
    component.height >= 10 &&
    component.width <= 30 &&
    component.height <= 30 &&
    aspect >= 0.55 &&
    aspect <= 1.8 &&
    fillRatio >= 0.55
  );
}

function cornerScore(corner, nx, ny) {
  if (corner === 'top-left') return nx + ny;
  if (corner === 'top-right') return 1 - nx + ny;
  if (corner === 'bottom-left') return nx + (1 - ny);
  return 1 - nx + (1 - ny);
}

function selectCornerHitsFromComponents(components) {
  if (components.length < 4) return [];
  const centers = components.map(componentCenter);
  const left = Math.min(...centers.map((center) => center.x));
  const top = Math.min(...centers.map((center) => center.y));
  const right = Math.max(...centers.map((center) => center.x));
  const bottom = Math.max(...centers.map((center) => center.y));
  const width = right - left;
  const height = bottom - top;
  if (width < 32 || height < 32) return [];

  const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
  const candidatesByCorner = corners.map((corner) =>
    components
      .map((component) => {
        const center = componentCenter(component);
        const nx = (center.x - left) / Math.max(1, width);
        const ny = (center.y - top) / Math.max(1, height);
        return {
          corner,
          component,
          score: cornerScore(corner, nx, ny),
        };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, Math.min(8, components.length)),
  );

  let bestHits = [];
  let bestScore = Number.POSITIVE_INFINITY;
  const used = new Set();
  const current = [];

  const search = (cornerIndex, score) => {
    if (score >= bestScore) return;
    if (cornerIndex >= corners.length) {
      bestHits = current.slice();
      bestScore = score;
      return;
    }

    for (const candidate of candidatesByCorner[cornerIndex] || []) {
      if (used.has(candidate.component)) continue;
      used.add(candidate.component);
      current.push({ corner: candidate.corner, component: candidate.component });
      search(cornerIndex + 1, score + candidate.score);
      current.pop();
      used.delete(candidate.component);
    }
  };

  search(0, 0);
  return bestHits.length === 4 ? bestHits : [];
}

function bboxFromComponents(components) {
  if (!components.length) return null;
  const left = Math.min(...components.map((component) => component.minX));
  const top = Math.min(...components.map((component) => component.minY));
  const right = Math.max(...components.map((component) => component.maxX));
  const bottom = Math.max(...components.map((component) => component.maxY));
  return [left, top, right, bottom];
}

function markerBboxToCanvasRect(bbox, raw) {
  const scaleX = CANVAS_WIDTH / raw.width;
  const scaleY = CANVAS_HEIGHT / raw.height;
  const left = bbox[0] * scaleX;
  const top = bbox[1] * scaleY;
  const right = bbox[2] * scaleX;
  const bottom = bbox[3] * scaleY;
  return clampRect({
    left: round1(left),
    top: round1(top),
    width: round1(right - left),
    height: round1(bottom - top),
  });
}

function median(values, fallback = 248) {
  if (!values.length) return fallback;
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] || fallback;
}

function isAnyMarkerPixel(r, g, b) {
  return MARKER_MATCHERS.some((matcher) => matcher.match(r, g, b));
}

async function cleanMarkerImage(raw, markerComponents) {
  const out = Buffer.from(raw.data);

  for (const component of markerComponents) {
    const pad = 6;
    const x1 = Math.max(0, Math.floor(component.minX - pad));
    const y1 = Math.max(0, Math.floor(component.minY - pad));
    const x2 = Math.min(raw.width - 1, Math.ceil(component.maxX + pad));
    const y2 = Math.min(raw.height - 1, Math.ceil(component.maxY + pad));
    const samplePad = 22;
    const rs = [];
    const gs = [];
    const bs = [];

    for (
      let y = Math.max(0, y1 - samplePad);
      y <= Math.min(raw.height - 1, y2 + samplePad);
      y += 1
    ) {
      for (
        let x = Math.max(0, x1 - samplePad);
        x <= Math.min(raw.width - 1, x2 + samplePad);
        x += 1
      ) {
        if (x >= x1 && x <= x2 && y >= y1 && y <= y2) continue;
        const i = (y * raw.width + x) * 3;
        const r = raw.data[i] || 0;
        const g = raw.data[i + 1] || 0;
        const b = raw.data[i + 2] || 0;
        if (isAnyMarkerPixel(r, g, b)) continue;
        rs.push(r);
        gs.push(g);
        bs.push(b);
      }
    }

    const r = median(rs);
    const g = median(gs);
    const b = median(bs);
    for (let y = y1; y <= y2; y += 1) {
      for (let x = x1; x <= x2; x += 1) {
        const i = (y * raw.width + x) * 3;
        out[i] = r;
        out[i + 1] = g;
        out[i + 2] = b;
      }
    }
  }

  const cleanBuffer = await sharp(out, {
    raw: { width: raw.width, height: raw.height, channels: 3 },
  })
    .png()
    .toBuffer();
  return `data:image/png;base64,${cleanBuffer.toString('base64')}`;
}

async function analyzeAndCleanMarkers(imageSrc, options) {
  if (options.cleanMarkers === false && options.markerFocus === false) return null;
  const raw = await decodeRawImage(imageSrc);
  if (!raw) return null;

  const markerComponentsByColor = [];
  const cleanComponents = [];

  for (const matcher of MARKER_MATCHERS) {
    const strictComponents = componentsForColor(raw, matcher).filter(isStrictCornerMarker);
    if (strictComponents.length > 0) {
      markerComponentsByColor.push({ matcher, components: strictComponents });
      cleanComponents.push(...strictComponents);
    }
  }

  const recoveredRects = markerComponentsByColor
    .map(({ matcher, components }) => {
      const hits = selectCornerHitsFromComponents(components);
      const bbox = hits.length === 4 ? bboxFromComponents(hits.map((hit) => hit.component)) : null;
      return bbox
        ? {
            color: matcher.name,
            markerCount: components.length,
            rect: markerBboxToCanvasRect(bbox, raw),
          }
        : null;
    })
    .filter(Boolean);

  return {
    rawSize: { width: raw.width, height: raw.height },
    markerCount: cleanComponents.length,
    colorCounts: Object.fromEntries(
      markerComponentsByColor.map(({ matcher, components }) => [matcher.name, components.length]),
    ),
    recoveredRects,
    cleanedImageSrc:
      options.cleanMarkers !== false && cleanComponents.length > 0
        ? await cleanMarkerImage(raw, cleanComponents)
        : null,
  };
}

function clampRect(rect) {
  const left = Math.max(0, Math.min(CANVAS_WIDTH - 20, rect.left));
  const top = Math.max(0, Math.min(CANVAS_HEIGHT - 20, rect.top));
  const width = Math.max(20, Math.min(CANVAS_WIDTH - left, rect.width));
  const height = Math.max(20, Math.min(CANVAS_HEIGHT - top, rect.height));
  return { left, top, width, height };
}

function classifyTargetSlot(id) {
  const haystack = id.toLowerCase();
  if (/header|title|top|opening/.test(haystack)) return 'header';
  if (/bottom|takeaway|next|closing|footer/.test(haystack)) return 'bottom';
  return 'middle';
}

function promptPlanFocusRects(content) {
  const plan = content?.imageNotebookPromptPlan;
  if (!isRecord(plan) || !Array.isArray(plan.componentPlans)) return new Map();
  const recoveredComponents = Array.isArray(plan.recoveryResult?.components)
    ? plan.recoveryResult.components
    : [];
  const recoveredById = new Map(
    recoveredComponents
      .filter((component) => isRecord(component) && Array.isArray(component.bbox))
      .map((component) => [String(component.componentId), component]),
  );
  const viewportSize = Number(content?.canvas?.viewportSize || CANVAS_WIDTH);
  const viewportRatio = Number(content?.canvas?.viewportRatio || CANVAS_HEIGHT / CANVAS_WIDTH);
  const canvasHeight = viewportSize * viewportRatio;
  const scaleX = viewportSize / CANVAS_WIDTH;
  const scaleY = canvasHeight / CANVAS_HEIGHT;

  return new Map(
    plan.componentPlans
      .filter((component) => isRecord(component) && component.participatesInMask !== false)
      .flatMap((component) => {
        const id = String(component.id || '');
        const recovered = recoveredById.get(id);
        const bbox = recovered?.bbox;
        if (!id || !Array.isArray(bbox) || bbox.length < 4) return [];
        return [
          [
            id,
            {
              label: String(component.label || id),
              rect: clampRect({
                left: Number(bbox[0]) * scaleX,
                top: Number(bbox[1]) * scaleY,
                width: (Number(bbox[2]) - Number(bbox[0])) * scaleX,
                height: (Number(bbox[3]) - Number(bbox[1])) * scaleY,
              }),
            },
          ],
        ];
      }),
  );
}

function labelForTargetId(id, promptPlanRects = new Map()) {
  const promptLabel = promptPlanRects.get(id)?.label;
  if (promptLabel) return promptLabel;
  const lower = id.toLowerCase();
  if (/header|title|top|opening/.test(lower)) return '页面标题与入口';
  if (/left|concept|main-anchor/.test(lower)) return '左侧概念或主问题';
  if (/right|support|evidence/.test(lower)) return '右侧例子或图示';
  if (/grid|table|compare/.test(lower)) return '中间对比或结构区';
  if (/problem|setup|hook/.test(lower)) return '问题设定';
  if (/example|case/.test(lower)) return '例子展开';
  if (/quiz|check/.test(lower)) return '检查问题';
  if (/pitfall|mistake/.test(lower)) return '易错点';
  if (/bottom|takeaway|next|closing|footer/.test(lower)) return '本页收束与转场';
  return id.replace(/^focus[-_:]?/i, '').replace(/[-_]+/g, ' ') || '讲解区域';
}

function middleGridRects(count, hasHeader, hasBottom) {
  if (count <= 0) return [];
  const top = hasHeader ? 120 : 72;
  const bottom = hasBottom ? 444 : 520;
  const height = Math.max(100, bottom - top);

  if (count === 1) return [clampRect({ left: 60, top, width: 880, height })];
  if (count === 2) {
    return [
      clampRect({ left: 60, top, width: 410, height }),
      clampRect({ left: 530, top, width: 410, height }),
    ];
  }
  if (count === 3) {
    const lowerTop = top + 118;
    return [
      clampRect({ left: 60, top, width: 880, height: 96 }),
      clampRect({ left: 60, top: lowerTop, width: 410, height: bottom - lowerTop }),
      clampRect({ left: 530, top: lowerTop, width: 410, height: bottom - lowerTop }),
    ];
  }

  const columns = 2;
  const rows = Math.ceil(count / columns);
  const gapX = 40;
  const gapY = 16;
  const cellWidth = (880 - gapX) / columns;
  const cellHeight = (height - gapY * (rows - 1)) / rows;
  return Array.from({ length: count }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return clampRect({
      left: 60 + column * (cellWidth + gapX),
      top: top + row * (cellHeight + gapY),
      width: cellWidth,
      height: cellHeight,
    });
  });
}

function targetRects(targetIds, markerRects = [], promptPlanRects = new Map()) {
  const headerIds = targetIds.filter((id) => classifyTargetSlot(id) === 'header');
  const bottomIds = targetIds.filter((id) => classifyTargetSlot(id) === 'bottom');
  const middleIds = targetIds.filter((id) => classifyTargetSlot(id) === 'middle');
  const rects = new Map();
  targetIds.forEach((id, index) => {
    const recovered = promptPlanRects.get(id)?.rect || markerRects[index]?.rect;
    if (recovered) rects.set(id, recovered);
  });

  headerIds.forEach((id, index) => {
    if (rects.has(id)) return;
    rects.set(
      id,
      clampRect({
        left: 40,
        top: 24 + index * 44,
        width: 920,
        height: Math.max(36, 84 - index * 12),
      }),
    );
  });

  bottomIds.forEach((id, index) => {
    if (rects.has(id)) return;
    rects.set(
      id,
      clampRect({
        left: 60,
        top: 462 - index * 50,
        width: 880,
        height: 76,
      }),
    );
  });

  const middleRects = middleGridRects(middleIds.length, headerIds.length > 0, bottomIds.length > 0);
  middleIds.forEach((id, index) => {
    if (rects.has(id)) return;
    rects.set(id, middleRects[index]);
  });

  return rects;
}

function makeFocusShape(id, rect, promptPlanRects = new Map()) {
  const label = labelForTargetId(id, promptPlanRects);
  return {
    id,
    name: `${GENERATED_FOCUS_PREFIX} ${label}`,
    label,
    type: 'shape',
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    rotate: 0,
    lock: true,
    viewBox: [200, 200],
    path: HOTSPOT_PATH,
    fixedRatio: false,
    fill: '#ffffff',
    opacity: 0,
    outline: { color: '#ffffff', width: 0, style: 'solid' },
  };
}

async function repairSceneContent(scene, options) {
  if (scene.type !== 'slide') return { changed: false, reason: 'not a slide' };
  if (!scene.content?.canvas || !Array.isArray(scene.content.canvas.elements)) {
    return { changed: false, reason: 'missing slide canvas elements' };
  }

  const originalElements = sceneElements(scene);
  const imageElement = markerImageElement(originalElements);
  if (!imageElement) {
    return { changed: false, reason: 'no full-page bitmap detected' };
  }
  const markerAnalysis = await analyzeAndCleanMarkers(imageElement.src, options);
  const imageWasCleaned = Boolean(markerAnalysis?.cleanedImageSrc);
  const elementsWithCleanedImage = imageWasCleaned
    ? originalElements.map((element) =>
        element?.id === imageElement.id
          ? {
              ...element,
              src: markerAnalysis.cleanedImageSrc,
              name: element.name
                ? `${element.name}: markers cleaned`
                : 'full_page_bitmap_markers_cleaned',
            }
          : element,
      )
    : originalElements;

  const baseElements = options.force
    ? elementsWithCleanedImage.filter((element) => !isGeneratedFocusElement(element))
    : elementsWithCleanedImage.slice();
  const existingIds = new Set(baseElements.map((element) => element?.id).filter(Boolean));
  const promptPlanRects = promptPlanFocusRects(scene.content);
  const promptPlanFocusIds = new Set(promptPlanRects.keys());
  const actionTargetIds = orderedActionTargetIds(scene.actions);
  const repairableTargets = actionTargetIds.filter((id) =>
    isRepairableFocusTargetId(id, promptPlanFocusIds),
  );
  const missingTargetIds = repairableTargets.filter((id) => !existingIds.has(id));
  const idsToAdd = options.force ? repairableTargets : missingTargetIds;

  if (idsToAdd.length === 0) {
    return {
      changed:
        imageWasCleaned || (options.force && baseElements.length !== originalElements.length),
      reason: 'no missing repairable focus targets',
      actionTargetIds,
      missingTargetIds,
      addedFocusIds: [],
      cleanedMarkerCount: markerAnalysis?.markerCount || 0,
      recoveredFocusCount: markerAnalysis?.recoveredRects?.length || 0,
      content: {
        ...scene.content,
        canvas: { ...scene.content.canvas, elements: baseElements },
        __generationDiagnostics: {
          ...(isRecord(scene.content.__generationDiagnostics)
            ? scene.content.__generationDiagnostics
            : {}),
          ...(imageWasCleaned
            ? {
                imageNotebookFocusRepair: {
                  script: SCRIPT_NAME,
                  version: SCRIPT_VERSION,
                  repairedAt: new Date().toISOString(),
                  force: options.force,
                  actionTargetIds,
                  missingTargetIds,
                  addedFocusIds: [],
                  cleanedMarkerCount: markerAnalysis?.markerCount || 0,
                  markerColorCounts: markerAnalysis?.colorCounts || {},
                  recoveredFocusCount: markerAnalysis?.recoveredRects?.length || 0,
                },
              }
            : {}),
        },
      },
    };
  }

  const rects = targetRects(idsToAdd, markerAnalysis?.recoveredRects || [], promptPlanRects);
  const focusShapes = idsToAdd.map((id) => makeFocusShape(id, rects.get(id), promptPlanRects));
  const content = {
    ...scene.content,
    canvas: {
      ...scene.content.canvas,
      elements: [...baseElements, ...focusShapes],
    },
    __generationDiagnostics: {
      ...(isRecord(scene.content.__generationDiagnostics)
        ? scene.content.__generationDiagnostics
        : {}),
      imageNotebookFocusRepair: {
        script: SCRIPT_NAME,
        version: SCRIPT_VERSION,
        repairedAt: new Date().toISOString(),
        force: options.force,
        actionTargetIds,
        missingTargetIds,
        addedFocusIds: focusShapes.map((shape) => shape.id),
        cleanedMarkerCount: markerAnalysis?.markerCount || 0,
        markerColorCounts: markerAnalysis?.colorCounts || {},
        recoveredFocusCount: markerAnalysis?.recoveredRects?.length || 0,
        recoveredFocusColors: (markerAnalysis?.recoveredRects || []).map((rect) => rect.color),
      },
    },
  };

  return {
    changed: true,
    actionTargetIds,
    missingTargetIds,
    addedFocusIds: focusShapes.map((shape) => shape.id),
    cleanedMarkerCount: markerAnalysis?.markerCount || 0,
    recoveredFocusCount: markerAnalysis?.recoveredRects?.length || 0,
    content,
  };
}

async function repairNotebook(prisma, notebookId, options) {
  const notebook = await prisma.notebook.findUnique({
    where: { id: notebookId },
    select: { id: true, name: true, courseId: true },
  });
  if (!notebook) {
    return { notebookId, found: false, scenes: [], changed: 0 };
  }

  const scenes = await prisma.scene.findMany({
    where: { notebookId },
    orderBy: { order: 'asc' },
  });
  const results = [];
  let changed = 0;

  for (const scene of scenes) {
    const result = await repairSceneContent(scene, options);
    results.push({
      sceneId: scene.id,
      order: scene.order,
      title: scene.title,
      changed: result.changed,
      reason: result.reason,
      missingTargetIds: result.missingTargetIds || [],
      addedFocusIds: result.addedFocusIds || [],
      cleanedMarkerCount: result.cleanedMarkerCount || 0,
      recoveredFocusCount: result.recoveredFocusCount || 0,
    });

    if (result.changed) {
      changed += 1;
      if (options.write) {
        await prisma.scene.update({
          where: { id: scene.id },
          data: { content: result.content },
        });
      }
    }
  }

  return { notebook, found: true, scenes: results, changed };
}

function printResult(result, options) {
  if (!result.found) {
    console.log(`Notebook ${result.notebookId}: not found`);
    return;
  }

  console.log(
    `Notebook ${result.notebook.id} (${result.notebook.name}) - ${options.write ? 'write' : 'dry-run'}: ${result.changed} scene(s) ${options.write ? 'updated' : 'would change'}`,
  );
  for (const scene of result.scenes) {
    const marker = scene.changed ? 'fix' : 'skip';
    const detail = scene.changed
      ? `missing=${scene.missingTargetIds.join(', ') || 'none'} added=${scene.addedFocusIds.join(', ') || 'none'} cleanedMarkers=${scene.cleanedMarkerCount} recoveredFocus=${scene.recoveredFocusCount}`
      : scene.reason || 'already ok';
    console.log(`  [${marker}] #${scene.order} ${scene.title}: ${detail}`);
  }
}

async function main() {
  loadEnvLocal();
  const notebookIds = parseNotebookIds();
  const options = {
    write: hasFlag('--write'),
    force: hasFlag('--force'),
    cleanMarkers: !hasFlag('--no-clean-markers'),
    markerFocus: !hasFlag('--no-marker-focus'),
  };

  if (hasFlag('--help') || notebookIds.length === 0) {
    console.log(usage());
    process.exitCode = notebookIds.length === 0 ? 1 : 0;
    return;
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing. Set it in .env.local or the current shell.');
  }

  const prisma = new PrismaClient();
  try {
    for (const notebookId of notebookIds) {
      const result = await repairNotebook(prisma, notebookId, options);
      printResult(result, options);
    }
    if (!options.write) {
      console.log('');
      console.log('Dry-run only. Re-run with --write to update the remote database.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
