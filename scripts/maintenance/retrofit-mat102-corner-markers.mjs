#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const SCRIPT_NAME = 'retrofit-mat102-corner-markers.mjs';
const SCRIPT_VERSION = '2026-05-29.v2';
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;
const PROMPT_CANVAS_WIDTH = 1600;
const PROMPT_CANVAS_HEIGHT = 900;
const MARKER_SIZE_CANVAS = 10;
const DEFAULT_COURSE_ID = 'cmpd5bird007v8ogmjuuiio03';
const DEFAULT_NOTEBOOK_IDS = [
  'nb-mat102-zh-sets-and-propositional-logic-20260519',
  'nb-mat102-zh-logic-quantifiers-implications-20260519',
  'nb-mat102-zh-relations-equivalence-orders-20260519',
  'nb-mat102-zh-functions-i-20260519',
];
const MARKER_COLORS = [
  { name: 'red', hex: '#ff0000' },
  { name: 'lime', hex: '#00ff00' },
  { name: 'blue', hex: '#0048ff' },
  { name: 'cyan', hex: '#00ffff' },
  { name: 'magenta', hex: '#ff00ff' },
  { name: 'yellow', hex: '#ffff00' },
];

const REGION_BLUEPRINTS = [
  { key: 'title', label: '标题与本页位置', role: 'header', layoutSlot: 'top-full' },
  { key: 'main', label: '核心定义与第一组内容', role: 'definition', layoutSlot: 'middle-left' },
  { key: 'worked', label: '例题、图像与方法推进', role: 'example', layoutSlot: 'middle-right' },
  { key: 'takeaway', label: '底部总结与下一步', role: 'takeaway', layoutSlot: 'bottom-full' },
];

const MANUAL_PAGE_REGION_BOUNDS = {
  'nb-mat102-zh-sets-and-propositional-logic-20260519': {
    1: [
      [15, 8, 765, 105],
      [18, 118, 650, 165],
      [20, 270, 580, 455],
      [40, 470, 960, 550],
    ],
    2: [
      [150, 14, 815, 76],
      [18, 88, 965, 395],
      [665, 88, 965, 395],
      [20, 462, 970, 545],
    ],
    3: [
      [185, 16, 760, 78],
      [15, 94, 350, 418],
      [365, 94, 965, 418],
      [28, 468, 960, 542],
    ],
    4: [
      [260, 16, 705, 82],
      [18, 92, 640, 418],
      [658, 92, 960, 418],
      [20, 472, 960, 545],
    ],
    5: [
      [220, 14, 760, 80],
      [16, 86, 420, 418],
      [438, 86, 965, 418],
      [20, 468, 970, 545],
    ],
    6: [
      [315, 18, 690, 82],
      [18, 94, 632, 420],
      [650, 94, 960, 420],
      [22, 468, 960, 545],
    ],
    7: [
      [315, 16, 685, 82],
      [18, 90, 650, 420],
      [665, 90, 960, 420],
      [25, 468, 960, 545],
    ],
    8: [
      [245, 15, 760, 80],
      [20, 88, 472, 428],
      [488, 88, 960, 428],
      [25, 468, 960, 545],
    ],
    9: [
      [260, 14, 780, 80],
      [25, 88, 330, 420],
      [345, 88, 960, 420],
      [28, 468, 960, 545],
    ],
    10: [
      [215, 16, 785, 82],
      [14, 88, 360, 420],
      [380, 88, 970, 420],
      [24, 472, 965, 545],
    ],
    11: [
      [160, 14, 840, 82],
      [20, 88, 650, 420],
      [670, 88, 960, 420],
      [25, 468, 960, 545],
    ],
    12: [
      [185, 14, 820, 82],
      [20, 88, 620, 390],
      [638, 88, 965, 430],
      [25, 392, 960, 545],
    ],
  },
  'nb-mat102-zh-logic-quantifiers-implications-20260519': {
    0: [
      [30, 15, 780, 120],
      [25, 140, 520, 430],
      [525, 140, 955, 430],
      [60, 385, 940, 515],
    ],
    1: [
      [120, 15, 820, 75],
      [20, 85, 470, 375],
      [490, 85, 960, 375],
      [25, 470, 960, 545],
    ],
    2: [
      [190, 15, 835, 80],
      [20, 90, 390, 410],
      [410, 90, 960, 410],
      [25, 470, 960, 545],
    ],
    3: [
      [170, 15, 780, 80],
      [18, 90, 500, 410],
      [520, 90, 965, 410],
      [24, 470, 960, 545],
    ],
    4: [
      [180, 15, 780, 80],
      [22, 90, 540, 415],
      [560, 90, 965, 415],
      [25, 470, 960, 545],
    ],
    5: [
      [185, 15, 810, 80],
      [18, 95, 400, 420],
      [420, 92, 965, 420],
      [25, 470, 960, 545],
    ],
    6: [
      [260, 15, 725, 80],
      [15, 90, 500, 405],
      [520, 90, 965, 405],
      [25, 470, 960, 545],
    ],
    7: [
      [220, 15, 800, 80],
      [25, 95, 430, 420],
      [450, 95, 965, 420],
      [25, 470, 960, 545],
    ],
    8: [
      [200, 15, 820, 85],
      [110, 85, 850, 190],
      [25, 215, 965, 420],
      [25, 470, 960, 545],
    ],
    9: [
      [180, 15, 800, 80],
      [20, 90, 470, 415],
      [490, 90, 965, 415],
      [25, 470, 960, 545],
    ],
    10: [
      [210, 15, 790, 80],
      [20, 90, 510, 415],
      [530, 90, 965, 415],
      [25, 470, 960, 545],
    ],
    11: [
      [185, 15, 830, 80],
      [18, 90, 620, 410],
      [640, 90, 965, 420],
      [25, 470, 960, 545],
    ],
  },
  'nb-mat102-zh-relations-equivalence-orders-20260519': {
    0: [
      [120, 15, 760, 85],
      [20, 95, 460, 410],
      [480, 95, 960, 410],
      [25, 470, 960, 545],
    ],
    1: [
      [140, 15, 850, 75],
      [20, 90, 470, 410],
      [490, 90, 960, 410],
      [25, 470, 960, 545],
    ],
    2: [
      [160, 15, 830, 80],
      [20, 90, 420, 410],
      [440, 90, 960, 410],
      [25, 470, 960, 545],
    ],
    3: [
      [190, 15, 780, 80],
      [20, 95, 460, 415],
      [480, 95, 960, 415],
      [25, 470, 960, 545],
    ],
    4: [
      [120, 15, 850, 80],
      [20, 90, 650, 420],
      [670, 90, 960, 420],
      [25, 470, 960, 545],
    ],
    5: [
      [140, 15, 845, 80],
      [20, 90, 620, 420],
      [640, 90, 960, 420],
      [25, 470, 960, 545],
    ],
    6: [
      [170, 15, 760, 80],
      [20, 90, 665, 420],
      [685, 90, 960, 420],
      [25, 470, 960, 545],
    ],
    7: [
      [180, 15, 760, 80],
      [20, 90, 420, 420],
      [440, 90, 960, 420],
      [25, 470, 960, 545],
    ],
    8: [
      [260, 15, 720, 80],
      [20, 90, 500, 420],
      [520, 90, 965, 420],
      [25, 470, 960, 545],
    ],
    9: [
      [230, 15, 760, 80],
      [20, 90, 500, 420],
      [520, 90, 965, 420],
      [25, 470, 960, 545],
    ],
    10: [
      [210, 15, 800, 80],
      [20, 90, 500, 420],
      [520, 90, 965, 420],
      [25, 470, 960, 545],
    ],
    11: [
      [150, 15, 860, 80],
      [20, 90, 390, 420],
      [410, 90, 965, 420],
      [25, 470, 960, 545],
    ],
    12: [
      [130, 15, 780, 80],
      [15, 90, 420, 435],
      [440, 90, 960, 435],
      [25, 468, 960, 545],
    ],
  },
  'nb-mat102-zh-functions-i-20260519': {
    0: [
      [140, 15, 760, 85],
      [20, 90, 520, 420],
      [540, 90, 965, 420],
      [25, 470, 960, 545],
    ],
    1: [
      [140, 15, 830, 80],
      [20, 90, 410, 420],
      [430, 90, 960, 420],
      [25, 470, 960, 545],
    ],
    2: [
      [150, 15, 860, 80],
      [20, 90, 640, 390],
      [660, 90, 960, 390],
      [25, 465, 960, 545],
    ],
    3: [
      [120, 15, 800, 80],
      [20, 90, 480, 420],
      [500, 90, 960, 420],
      [25, 470, 960, 545],
    ],
    4: [
      [280, 15, 720, 80],
      [20, 90, 650, 420],
      [670, 90, 965, 420],
      [25, 470, 960, 545],
    ],
    5: [
      [280, 15, 720, 80],
      [20, 90, 650, 420],
      [670, 90, 965, 420],
      [25, 470, 960, 545],
    ],
    6: [
      [140, 15, 830, 80],
      [20, 90, 600, 420],
      [620, 90, 960, 420],
      [25, 470, 960, 545],
    ],
    7: [
      [140, 15, 820, 80],
      [20, 90, 600, 420],
      [620, 90, 965, 420],
      [25, 470, 960, 545],
    ],
    8: [
      [165, 15, 850, 80],
      [20, 90, 640, 420],
      [660, 90, 960, 420],
      [25, 470, 960, 545],
    ],
    9: [
      [160, 15, 860, 80],
      [20, 90, 500, 420],
      [520, 90, 965, 420],
      [25, 470, 960, 545],
    ],
    10: [
      [120, 15, 870, 80],
      [20, 90, 640, 420],
      [660, 90, 960, 420],
      [25, 470, 960, 545],
    ],
    11: [
      [120, 15, 860, 80],
      [20, 90, 640, 420],
      [660, 90, 965, 420],
      [25, 470, 960, 545],
    ],
  },
};

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
    `Usage: node scripts/maintenance/${SCRIPT_NAME} [--write] [--force] [--all-mat102] [--course-id <id>] [--notebook-id <id-or-url>]`,
    '',
    'Retrofits the legacy MAT102 image notebooks with stored corner-marker metadata.',
    'It does not regenerate images. It uses the existing semantic-hit-map focus geometry,',
    'writes imageNotebookPromptPlan.recoveryResult.retrofittedMarkerOverlay, and keeps',
    'or repairs spotlight/speech actions so lecture clicks target marker-tracked regions.',
    '',
    'Defaults to the current MAT102 database course and the first four legacy notebooks.',
  ].join('\n');
}

function readOptions(name) {
  const values = [];
  for (let index = 2; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1])
      values.push(process.argv[index + 1]);
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
  return [...readOptions('--notebook-id'), ...readOptions('--notebook')]
    .flatMap((value) => String(value).split(','))
    .map(notebookIdFromValue)
    .filter(Boolean);
}

function parseCourseIds() {
  return [...readOptions('--course-id'), ...readOptions('--course')]
    .flatMap((value) => String(value).split(','))
    .map((value) => value.trim())
    .filter(Boolean);
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function compact(text, max = 140) {
  const value = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return value.length <= max ? value : `${value.slice(0, max - 1)}...`;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function pageLabel(order) {
  return String(order + 1).padStart(2, '0');
}

function sceneElements(scene) {
  const elements = scene.content?.canvas?.elements;
  return Array.isArray(elements) ? elements : [];
}

function isFullPageImageElement(element) {
  if (!isRecord(element) || element.type !== 'image') return false;
  const width = Number(element.width || 0);
  const height = Number(element.height || 0);
  return width >= CANVAS_WIDTH * 0.9 && height >= CANVAS_HEIGHT * 0.9;
}

function isGeometryElement(element) {
  return (
    isRecord(element) &&
    typeof element.left === 'number' &&
    typeof element.top === 'number' &&
    typeof element.width === 'number' &&
    typeof element.height === 'number'
  );
}

function isSemanticMarkerRegion(element) {
  return (
    isGeometryElement(element) &&
    /semantic-hit-map/i.test(`${element.id || ''} ${element.name || ''}`)
  );
}

function labelForRegion(element) {
  const name = String(element.name || '');
  return compact(name.replace(/^(semantic-hit-map|manual-page-region):\s*/i, '') || element.id);
}

function rectForElement(element) {
  const left = clamp(Number(element.left || 0), 0, CANVAS_WIDTH - 1);
  const top = clamp(Number(element.top || 0), 0, CANVAS_HEIGHT - 1);
  const right = clamp(left + Math.max(1, Number(element.width || 1)), left + 1, CANVAS_WIDTH);
  const bottom = clamp(top + Math.max(1, Number(element.height || 1)), top + 1, CANVAS_HEIGHT);
  return {
    left: round1(left),
    top: round1(top),
    right: round1(right),
    bottom: round1(bottom),
    width: round1(right - left),
    height: round1(bottom - top),
  };
}

function layoutSlotForRect(rect) {
  if (rect.top <= 96) return 'top-full';
  if (rect.bottom >= CANVAS_HEIGHT - 96) return 'bottom-full';
  const centerX = rect.left + rect.width / 2;
  if (rect.width >= CANVAS_WIDTH * 0.68) return 'middle-center-left';
  if (centerX < CANVAS_WIDTH * 0.3) return 'middle-left';
  if (centerX < CANVAS_WIDTH * 0.48) return 'middle-center-left';
  if (centerX < CANVAS_WIDTH * 0.7) return 'middle-center-right';
  return 'middle-right';
}

function roleForRegion(element, label) {
  const haystack = `${element.id || ''} ${element.name || ''} ${label}`;
  if (/title|header|bridge|承接|标题|开场|入口/i.test(haystack)) return 'header';
  if (/formula|equation|公式|表达式/i.test(haystack)) return 'formula';
  if (/example|worked|例|步骤/i.test(haystack)) return 'example';
  if (/proof|证明/i.test(haystack)) return 'proof';
  if (/pitfall|error|误区|提醒|错误/i.test(haystack)) return 'pitfall';
  if (/question|hook|问题|追问|钩子/i.test(haystack)) return 'question';
  if (/takeaway|summary|bottom|总结|收束|迁移/i.test(haystack)) return 'takeaway';
  if (/graph|diagram|visual|图|曲线|区域/i.test(haystack)) return 'visual';
  if (/method|strategy|方法|策略/i.test(haystack)) return 'strategy';
  return 'setup';
}

function markerPointsForRect(rect) {
  const half = MARKER_SIZE_CANVAS / 2;
  return [
    {
      corner: 'top-left',
      x: clamp(rect.left, half, CANVAS_WIDTH - half),
      y: clamp(rect.top, half, CANVAS_HEIGHT - half),
    },
    {
      corner: 'top-right',
      x: clamp(rect.right, half, CANVAS_WIDTH - half),
      y: clamp(rect.top, half, CANVAS_HEIGHT - half),
    },
    {
      corner: 'bottom-left',
      x: clamp(rect.left, half, CANVAS_WIDTH - half),
      y: clamp(rect.bottom, half, CANVAS_HEIGHT - half),
    },
    {
      corner: 'bottom-right',
      x: clamp(rect.right, half, CANVAS_WIDTH - half),
      y: clamp(rect.bottom, half, CANVAS_HEIGHT - half),
    },
  ].map((point) => ({ ...point, x: round1(point.x), y: round1(point.y) }));
}

function chooseMarkerRegions(elements) {
  return elements
    .filter(isSemanticMarkerRegion)
    .slice()
    .sort(
      (a, b) =>
        Number(a.top || 0) - Number(b.top || 0) || Number(a.left || 0) - Number(b.left || 0),
    )
    .slice(0, MARKER_COLORS.length);
}

function rectForBounds(bounds) {
  const [left, top, right, bottom] = bounds;
  return {
    left: clamp(Number(left), 0, CANVAS_WIDTH - 1),
    top: clamp(Number(top), 0, CANVAS_HEIGHT - 1),
    right: clamp(Number(right), 1, CANVAS_WIDTH),
    bottom: clamp(Number(bottom), 1, CANVAS_HEIGHT),
  };
}

function manualMarkerRegionsForScene(scene) {
  const sceneBounds = MANUAL_PAGE_REGION_BOUNDS[scene.notebookId]?.[scene.order];
  if (!Array.isArray(sceneBounds) || sceneBounds.length === 0) return [];
  return sceneBounds.map((bounds, index) => {
    const blueprint = REGION_BLUEPRINTS[index] || {
      key: `region-${index + 1}`,
      label: `页面区域 ${index + 1}`,
      role: 'other',
      layoutSlot: 'free',
    };
    const rect = rectForBounds(bounds);
    return {
      id: `${scene.id}-manual-${blueprint.key}`,
      name: `manual-page-region: ${blueprint.label}`,
      type: 'shape',
      left: round1(rect.left),
      top: round1(rect.top),
      width: round1(Math.max(1, rect.right - rect.left)),
      height: round1(Math.max(1, rect.bottom - rect.top)),
      promptRole: blueprint.role,
      promptLayoutSlot: blueprint.layoutSlot,
      manualPageRegion: true,
    };
  });
}

function buildMarkerProtocol() {
  return {
    type: 'corner-square-markers',
    markerSizePx: 16,
    markerCountPerComponent: 4,
    blankBackgroundPaddingPx: 30,
    maxMaskableComponents: 6,
    colorPool: MARKER_COLORS,
    ordinaryContentForbiddenColors: MARKER_COLORS.map((color) => color.hex),
  };
}

function buildStyleProfile() {
  return {
    id: 'default-hand-drawn-notebook',
    label: 'Legacy MAT102 retrofit',
    baselineRules: [
      'This prompt plan was retrofitted from saved MAT102 focus geometry; no image generation was run.',
    ],
    styleBrief: {
      schemaVersion: 1,
      preset: 'hand-drawn-course-notebook',
      canvas: '16:9',
      background: 'Existing saved full-page bitmap',
      writingStyle: 'Existing saved handwritten course-notebook page',
      colorMood: 'Existing saved palette',
      density: 'medium',
      decorationLevel: 'light',
      avoidPureMarkerColors: MARKER_COLORS.map((color) => color.hex),
      ordinaryContentColorRule: 'Pure marker colors are reserved for marker overlays only.',
    },
  };
}

function buildPromptPlan(scene, markerRegions, existingPlan) {
  const componentPlans = markerRegions.map((element, index) => {
    const rect = rectForElement(element);
    const label = labelForRegion(element);
    const color = MARKER_COLORS[index];
    return {
      id: String(element.id),
      label,
      role: element.promptRole || roleForRegion(element, label),
      order: index + 1,
      layoutSlot: element.promptLayoutSlot || layoutSlotForRect(rect),
      markerColorName: color.name,
      markerColorHex: color.hex,
      visibleText: [label],
      formulas: [],
      diagramPrompt: '',
      participatesInMask: element.participatesInMask !== false,
    };
  });

  const markerCountsByColor = {};
  for (const component of componentPlans) markerCountsByColor[component.markerColorHex] = 4;

  const overlayMarkers = [];
  const components = markerRegions.map((element, index) => {
    const rect = rectForElement(element);
    const color = MARKER_COLORS[index];
    const markerPoints = markerPointsForRect(rect);
    markerPoints.forEach((point) => {
      overlayMarkers.push({
        componentId: String(element.id),
        markerColorHex: color.hex,
        x: point.x,
        y: point.y,
        size: MARKER_SIZE_CANVAS,
        corner: point.corner,
      });
    });
    return {
      componentId: String(element.id),
      markerColorHex: color.hex,
      bbox: [rect.left, rect.top, rect.right, rect.bottom],
      markerPoints,
      markerCount: 4,
    };
  });

  const promptHash = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        sceneId: scene.id,
        title: scene.title,
        components: components.map((component) => ({
          id: component.componentId,
          bbox: component.bbox,
          color: component.markerColorHex,
        })),
      }),
    )
    .digest('hex');

  return {
    ...(isRecord(existingPlan) ? existingPlan : {}),
    schemaVersion: 1,
    canvas: {
      width: PROMPT_CANVAS_WIDTH,
      height: PROMPT_CANVAS_HEIGHT,
      aspectRatio: '16:9',
    },
    styleProfile: existingPlan?.styleProfile || buildStyleProfile(),
    componentPlans,
    markerProtocol: existingPlan?.markerProtocol || buildMarkerProtocol(),
    compiledImagePrompt:
      existingPlan?.compiledImagePrompt ||
      'Legacy MAT102 marker retrofit: no image generation prompt was used. Corner markers were deterministically overlaid from page-specific visual region geometry.',
    promptHash,
    validationTarget: {
      maskableComponentCount: componentPlans.length,
      totalMarkerCount: componentPlans.length * 4,
      markerCountsByColor,
      forbiddenVisibleMarks: [
        'No colored connecting lines',
        'No colored component borders',
        'No extra pure-color marker-like squares',
      ],
    },
    recoveryResult: {
      status: 'passed',
      recoveredAt: Date.now(),
      retrofittedMarkerOverlay: {
        source: 'focus-geometry',
        canvasWidth: CANVAS_WIDTH,
        canvasHeight: CANVAS_HEIGHT,
        markers: overlayMarkers,
      },
      findings: [
        markerRegions.every((region) => region.manualPageRegion)
          ? 'Retrofitted corner markers from page-specific MAT102 visual region geometry; no image regeneration was run.'
          : 'Retrofitted corner markers from existing MAT102 semantic-hit-map geometry; no image regeneration was run.',
      ],
      components,
    },
  };
}

function actionTargetId(action) {
  if (!isRecord(action)) return null;
  for (const key of ['elementId', 'targetElementId', 'targetId', 'focusTargetId']) {
    if (typeof action[key] === 'string' && action[key].trim()) return action[key].trim();
  }
  return null;
}

function centerOf(element) {
  const rect = rectForElement(element);
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function containsPoint(element, point) {
  const rect = rectForElement(element);
  return (
    point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
  );
}

function overlapArea(a, b) {
  const ar = rectForElement(a);
  const br = rectForElement(b);
  const x = Math.max(0, Math.min(ar.right, br.right) - Math.max(ar.left, br.left));
  const y = Math.max(0, Math.min(ar.bottom, br.bottom) - Math.max(ar.top, br.top));
  return x * y;
}

function distanceSquared(a, b) {
  const ac = centerOf(a);
  const bc = centerOf(b);
  return (ac.x - bc.x) ** 2 + (ac.y - bc.y) ** 2;
}

function bestMarkerRegionForElement(target, markerRegions) {
  const point = centerOf(target);
  const containing = markerRegions.filter((region) => containsPoint(region, point));
  if (containing.length) {
    return containing.sort(
      (a, b) =>
        rectForElement(a).width * rectForElement(a).height -
        rectForElement(b).width * rectForElement(b).height,
    )[0];
  }
  const withOverlap = markerRegions
    .map((region) => ({ region, overlap: overlapArea(target, region) }))
    .filter((item) => item.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap);
  if (withOverlap.length) return withOverlap[0].region;
  return markerRegions
    .slice()
    .sort((a, b) => distanceSquared(target, a) - distanceSquared(target, b))[0];
}

function remapActionsToMarkerRegions(actions, elements, markerRegions) {
  if (!Array.isArray(actions)) return { actions: [], remapped: 0 };
  const markerIds = new Set(markerRegions.map((region) => String(region.id)));
  const elementsById = new Map(
    elements.filter(isGeometryElement).map((element) => [String(element.id), element]),
  );
  let remapped = 0;
  const nextActions = actions.map((action) => {
    if (!isRecord(action) || (action.type !== 'spotlight' && action.type !== 'laser')) {
      return action;
    }
    const id = actionTargetId(action);
    if (!id || markerIds.has(id)) return action;
    const target = elementsById.get(id);
    if (!target) return action;
    const mapped = bestMarkerRegionForElement(target, markerRegions);
    if (!mapped || String(mapped.id) === id) return action;
    remapped += 1;
    return { ...action, elementId: String(mapped.id) };
  });
  return { actions: nextActions, remapped };
}

function remapActionsSequentially(actions, markerRegions) {
  if (!Array.isArray(actions)) return { actions: [], remapped: 0 };
  let focusIndex = 0;
  let remapped = 0;
  const nextActions = actions.map((action) => {
    if (!isRecord(action) || (action.type !== 'spotlight' && action.type !== 'laser')) {
      return action;
    }
    const region = markerRegions[Math.min(focusIndex, markerRegions.length - 1)];
    focusIndex += 1;
    if (!region) return action;
    const nextId = String(region.id);
    const currentId = actionTargetId(action);
    if (currentId !== nextId) remapped += 1;
    return {
      ...action,
      elementId: nextId,
      targetId: nextId,
      title: labelForRegion(region),
      description: `遮罩聚焦逐页校准区域：${labelForRegion(region)}。`,
    };
  });
  return { actions: nextActions, remapped };
}

function fallbackSpeech(scene, notebook, region, index, markerRegions) {
  const label = labelForRegion(region);
  const nextRegion = markerRegions[index + 1] ? labelForRegion(markerRegions[index + 1]) : null;
  const notebookName = notebook?.name || 'MAT102';
  if (index === 0) {
    return `这一页《${scene.title}》先放回 ${notebookName} 的路线里看。先看标题区域，确认这页要解决的数学对象和证明动作。`;
  }
  if (nextRegion) {
    return `现在看${label}。这里不要只读文字，要问它在支持哪一步判断；看完这一块，再自然过渡到${nextRegion}。`;
  }
  return `最后用${label}收束本页：把结论压成一句可执行的检查动作，准备带到下一页继续用。`;
}

function buildFallbackActions(scene, notebook, markerRegions) {
  return markerRegions.flatMap((region, index) => [
    {
      id: `${scene.id}-spotlight-retrofit-${String(index + 1).padStart(2, '0')}`,
      type: 'spotlight',
      title: labelForRegion(region),
      elementId: String(region.id),
      dimOpacity: 0.62,
    },
    {
      id: `${scene.id}-speech-retrofit-${String(index + 1).padStart(2, '0')}`,
      type: 'speech',
      title: `讲解：${labelForRegion(region)}`,
      text: fallbackSpeech(scene, notebook, region, index, markerRegions),
    },
  ]);
}

function repairActions(scene, notebook, elements, markerRegions) {
  const markerIds = new Set(markerRegions.map((region) => String(region.id)));
  const remappedActions = markerRegions.every((region) => region.manualPageRegion)
    ? remapActionsSequentially(scene.actions, markerRegions)
    : remapActionsToMarkerRegions(scene.actions, elements, markerRegions);
  const { actions, remapped } = remappedActions;
  const focusCount = actions.filter((action) => {
    if (!isRecord(action) || (action.type !== 'spotlight' && action.type !== 'laser')) return false;
    const targetId = actionTargetId(action);
    return Boolean(targetId && markerIds.has(targetId));
  }).length;
  const speechCount = actions.filter(
    (action) => isRecord(action) && action.type === 'speech',
  ).length;
  if (focusCount > 0 && speechCount > 0) {
    return { actions, remapped, fallbackGenerated: false };
  }
  return {
    actions: buildFallbackActions(scene, notebook, markerRegions),
    remapped: 0,
    fallbackGenerated: true,
  };
}

function hasStoredMarkers(content) {
  const recovery = content?.imageNotebookPromptPlan?.recoveryResult;
  return Boolean(
    recovery?.originalMarkerImageUrl || recovery?.retrofittedMarkerOverlay?.markers?.length,
  );
}

function adaptScene(scene, notebook, options) {
  const content = scene.content;
  if (!isRecord(content) || content.type !== 'slide') {
    return { changed: false, reason: 'not-slide' };
  }
  const elements = sceneElements(scene);
  if (!elements.some(isFullPageImageElement)) {
    return { changed: false, reason: 'no-full-page-image' };
  }
  if (!options.force && hasStoredMarkers(content)) {
    return { changed: false, reason: 'already-has-marker-overlay' };
  }
  const markerRegions = manualMarkerRegionsForScene(scene);
  if (!markerRegions.length) markerRegions.push(...chooseMarkerRegions(elements));
  if (!markerRegions.length) return { changed: false, reason: 'no-semantic-hit-map' };

  const promptPlan = buildPromptPlan(scene, markerRegions, content.imageNotebookPromptPlan);
  const repaired = repairActions(scene, notebook, elements, markerRegions);
  return {
    changed: true,
    content: { ...content, imageNotebookPromptPlan: promptPlan },
    actions: repaired.actions,
    markerCount: markerRegions.length * 4,
    componentCount: markerRegions.length,
    remapped: repaired.remapped,
    fallbackGenerated: repaired.fallbackGenerated,
  };
}

function firstFourOrderByName(notebook) {
  const match = String(notebook.name || '').match(/^0?([1-4])\s*-/);
  return match ? Number(match[1]) : 99;
}

async function findTargetNotebooks(prisma, options) {
  if (options.notebookIds.length) {
    return prisma.notebook.findMany({
      where: { id: { in: options.notebookIds } },
      orderBy: [{ name: 'asc' }],
      select: notebookSelect(),
    });
  }

  const courseIds = options.courseIds.length ? options.courseIds : [DEFAULT_COURSE_ID];
  const notebooks = await prisma.notebook.findMany({
    where: options.allMat102
      ? {
          OR: [
            { id: { startsWith: 'nb-mat102' } },
            { tags: { has: 'MAT102' } },
            { courseId: { in: courseIds } },
            { course: { courseCode: { contains: 'MAT 102', mode: 'insensitive' } } },
            { course: { courseCode: { contains: 'MAT102', mode: 'insensitive' } } },
          ],
        }
      : {
          OR: [{ id: { in: DEFAULT_NOTEBOOK_IDS } }, { courseId: { in: courseIds } }],
        },
    orderBy: [{ name: 'asc' }],
    select: notebookSelect(),
  });

  if (options.allMat102) return notebooks;
  const byId = new Map(notebooks.map((notebook) => [notebook.id, notebook]));
  const exact = DEFAULT_NOTEBOOK_IDS.map((id) => byId.get(id)).filter(Boolean);
  if (exact.length === DEFAULT_NOTEBOOK_IDS.length) return exact;
  return notebooks
    .filter((notebook) => firstFourOrderByName(notebook) !== 99)
    .sort((a, b) => firstFourOrderByName(a) - firstFourOrderByName(b));
}

function notebookSelect() {
  return {
    id: true,
    name: true,
    courseId: true,
    scenes: {
      orderBy: { order: 'asc' },
      select: {
        id: true,
        notebookId: true,
        order: true,
        title: true,
        content: true,
        actions: true,
      },
    },
  };
}

async function main() {
  loadEnvLocal();
  if (hasFlag('--help')) {
    console.log(usage());
    return;
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing. Set it in .env.local or the current shell.');
  }

  const options = {
    write: hasFlag('--write'),
    force: hasFlag('--force'),
    allMat102: hasFlag('--all-mat102'),
    notebookIds: parseNotebookIds(),
    courseIds: parseCourseIds(),
  };

  const prisma = new PrismaClient();
  try {
    const notebooks = await findTargetNotebooks(prisma, options);
    console.log(`${SCRIPT_NAME} ${SCRIPT_VERSION} ${options.write ? '(write)' : '(dry-run)'}`);
    console.log(`Target notebooks: ${notebooks.length}`);

    const totals = {
      scenes: 0,
      changed: 0,
      skipped: 0,
      components: 0,
      markers: 0,
      remapped: 0,
      fallbackActions: 0,
    };

    for (const notebook of notebooks) {
      let notebookChanged = 0;
      let notebookMarkers = 0;
      let notebookRemapped = 0;
      let notebookFallbackActions = 0;
      const skipReasons = {};

      for (const scene of notebook.scenes || []) {
        totals.scenes += 1;
        const result = adaptScene(scene, notebook, options);
        if (!result.changed) {
          totals.skipped += 1;
          skipReasons[result.reason || 'skipped'] =
            (skipReasons[result.reason || 'skipped'] || 0) + 1;
          continue;
        }

        notebookChanged += 1;
        notebookMarkers += result.markerCount || 0;
        notebookRemapped += result.remapped || 0;
        notebookFallbackActions += result.fallbackGenerated ? 1 : 0;
        totals.changed += 1;
        totals.components += result.componentCount || 0;
        totals.markers += result.markerCount || 0;
        totals.remapped += result.remapped || 0;
        totals.fallbackActions += result.fallbackGenerated ? 1 : 0;

        if (options.write) {
          await prisma.scene.update({
            where: { id: scene.id },
            data: {
              content: result.content,
              actions: result.actions,
            },
          });
        }
      }

      console.log(
        `- ${notebook.id} "${notebook.name}": changed=${notebookChanged}, markers=${notebookMarkers}, remappedActions=${notebookRemapped}, fallbackActionScenes=${notebookFallbackActions}, skipped=${JSON.stringify(skipReasons)}`,
      );
    }

    console.log(`TOTAL ${JSON.stringify(totals)}`);
    if (!options.write) console.log('Dry-run only. Re-run with --write to update the database.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
