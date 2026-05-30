#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const SCRIPT_NAME = 'retrofit-mat136-corner-markers.mjs';
const SCRIPT_VERSION = '2026-05-29.v1';
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;
const PROMPT_CANVAS_WIDTH = 1600;
const PROMPT_CANVAS_HEIGHT = 900;
const MARKER_SIZE_CANVAS = 10;
const MARKER_COLORS = [
  { name: 'red', hex: '#ff0000' },
  { name: 'lime', hex: '#00ff00' },
  { name: 'blue', hex: '#0048ff' },
  { name: 'cyan', hex: '#00ffff' },
  { name: 'magenta', hex: '#ff00ff' },
  { name: 'yellow', hex: '#ffff00' },
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
    `Usage: node scripts/maintenance/${SCRIPT_NAME} [--write] [--force] [--notebook-id <id-or-url>] [--course-id <id>]`,
    '',
    'Retrofitts existing MAT136 image notebooks with stored corner-marker metadata.',
    'It does not regenerate images. It uses existing invisible focus geometry, writes',
    'imageNotebookPromptPlan.recoveryResult, and remaps old detailed focus actions to',
    'the stored marker-tracked regions when semantic-hit-map regions are available.',
    '',
    'Defaults to dry-run over notebooks whose courseCode contains 136 or whose id starts nb-mat136.',
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

function isGeneratedFocusRegion(element) {
  return (
    isGeometryElement(element) &&
    /lecture-focus-generated/i.test(`${element.id || ''} ${element.name || ''}`)
  );
}

function compact(text, max = 140) {
  const value = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return value.length <= max ? value : `${value.slice(0, max - 1)}...`;
}

function labelForRegion(element) {
  const name = String(element.name || '');
  return compact(
    name.replace(/^semantic-hit-map:\s*/i, '').replace(/^lecture-focus-generated:\s*/i, '') ||
      element.id,
  );
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
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

function isHeaderLikeRegion(element) {
  const label = labelForRegion(element);
  const haystack = `${element.id || ''} ${element.name || ''} ${label}`;
  return /cover-title|page-bridge|标题|封面标题|本页承接|开场|入口|title|header|bridge/i.test(
    haystack,
  );
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
  const semantic = elements.filter(isSemanticMarkerRegion);
  const source = semantic.length ? semantic : elements.filter(isGeneratedFocusRegion);
  const contentRegions = source.filter((element) => !isHeaderLikeRegion(element));
  const usable = contentRegions.length ? contentRegions : source;
  return usable
    .slice()
    .sort(
      (a, b) =>
        Number(a.top || 0) - Number(b.top || 0) || Number(a.left || 0) - Number(b.left || 0),
    )
    .slice(0, MARKER_COLORS.length);
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
    label: 'Legacy MAT136 retrofit',
    baselineRules: [
      'This prompt plan was retrofitted from saved MAT136 focus geometry; no image generation was run.',
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
      role: roleForRegion(element, label),
      order: index + 1,
      layoutSlot: layoutSlotForRect(rect),
      markerColorName: color.name,
      markerColorHex: color.hex,
      visibleText: [label],
      formulas: [],
      diagramPrompt: '',
      participatesInMask: true,
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

  const recoveryResult = {
    status: 'passed',
    recoveredAt: Date.now(),
    retrofittedMarkerOverlay: {
      source: 'focus-geometry',
      canvasWidth: CANVAS_WIDTH,
      canvasHeight: CANVAS_HEIGHT,
      markers: overlayMarkers,
    },
    findings: [
      'Retrofitted corner markers from existing MAT136 focus geometry; no image regeneration was run.',
    ],
    components,
  };

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
      'Legacy MAT136 marker retrofit: no image generation prompt was used. Corner markers were deterministically overlaid from saved focus geometry.',
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
    recoveryResult,
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
  return undefined;
}

function remapActionsToMarkerRegions(actions, elements, markerRegions, options) {
  if (!Array.isArray(actions) || options.noRemapActions) {
    return { actions, remapped: 0, dropped: 0 };
  }
  const markerIds = new Set(markerRegions.map((region) => String(region.id)));
  const elementsById = new Map(
    elements.filter(isGeometryElement).map((element) => [String(element.id), element]),
  );
  let remapped = 0;
  let dropped = 0;
  const nextActions = actions.flatMap((action) => {
    if (!isRecord(action) || (action.type !== 'spotlight' && action.type !== 'laser')) {
      return [action];
    }
    const id = actionTargetId(action);
    if (!id || markerIds.has(id)) return [action];
    const target = elementsById.get(id);
    if (!target) {
      dropped += 1;
      return [];
    }
    const mapped = bestMarkerRegionForElement(target, markerRegions);
    if (!mapped) {
      dropped += 1;
      return [];
    }
    if (String(mapped.id) === id) return [action];
    remapped += 1;
    return [{ ...action, elementId: String(mapped.id) }];
  });
  return { actions: nextActions, remapped, dropped };
}

function hasStoredMarkers(content) {
  const recovery = content?.imageNotebookPromptPlan?.recoveryResult;
  return Boolean(
    recovery?.originalMarkerImageUrl || recovery?.retrofittedMarkerOverlay?.markers?.length,
  );
}

function adaptScene(scene, options) {
  const content = scene.content;
  if (!isRecord(content) || content.type !== 'slide')
    return { changed: false, reason: 'not-slide' };
  const elements = sceneElements(scene);
  if (!elements.some(isFullPageImageElement))
    return { changed: false, reason: 'no-full-page-image' };
  if (!options.force && hasStoredMarkers(content))
    return { changed: false, reason: 'already-has-marker-overlay' };

  const markerRegions = chooseMarkerRegions(elements);
  if (!markerRegions.length) return { changed: false, reason: 'no-focus-geometry' };

  const promptPlan = buildPromptPlan(scene, markerRegions, content.imageNotebookPromptPlan);
  const { actions, remapped, dropped } = remapActionsToMarkerRegions(
    scene.actions,
    elements,
    markerRegions,
    options,
  );
  return {
    changed: true,
    content: { ...content, imageNotebookPromptPlan: promptPlan },
    actions,
    markerCount: markerRegions.length * 4,
    componentCount: markerRegions.length,
    remapped,
    dropped: dropped || 0,
    usedSemanticRegions: markerRegions.some(isSemanticMarkerRegion),
  };
}

async function findTargetNotebooks(prisma, notebookIds, courseIds) {
  const or = [];
  if (notebookIds.length) or.push({ id: { in: notebookIds } });
  if (courseIds.length) or.push({ courseId: { in: courseIds } });
  if (!notebookIds.length && !courseIds.length) {
    or.push(
      { id: { startsWith: 'nb-mat136' } },
      { tags: { has: 'MAT136' } },
      { tags: { has: 'mat136' } },
      { course: { courseCode: { contains: '136', mode: 'insensitive' } } },
    );
  }
  return prisma.notebook.findMany({
    where: { OR: or },
    orderBy: [{ courseId: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      courseId: true,
      scenes: {
        orderBy: { order: 'asc' },
        select: { id: true, order: true, title: true, content: true, actions: true },
      },
    },
  });
}

async function main() {
  loadEnvLocal();
  const wantsHelp = hasFlag('--help');
  const notebookIds = parseNotebookIds();
  const courseIds = parseCourseIds();
  const options = {
    write: hasFlag('--write'),
    force: hasFlag('--force'),
    noRemapActions: hasFlag('--no-remap-actions'),
  };
  if (wantsHelp) {
    console.log(usage());
    return;
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing. Set it in .env.local or the current shell.');
  }

  const prisma = new PrismaClient();
  try {
    const notebooks = await findTargetNotebooks(prisma, notebookIds, courseIds);
    console.log(`${SCRIPT_NAME} ${SCRIPT_VERSION} ${options.write ? '(write)' : '(dry-run)'}`);
    console.log(`Target notebooks: ${notebooks.length}`);

    const totals = {
      scenes: 0,
      changed: 0,
      skipped: 0,
      components: 0,
      markers: 0,
      remapped: 0,
      dropped: 0,
    };

    for (const notebook of notebooks) {
      let notebookChanged = 0;
      let notebookRemapped = 0;
      let notebookDropped = 0;
      let notebookMarkers = 0;
      const skipReasons = {};

      for (const scene of notebook.scenes || []) {
        totals.scenes += 1;
        const result = adaptScene(scene, options);
        if (!result.changed) {
          totals.skipped += 1;
          skipReasons[result.reason || 'skipped'] =
            (skipReasons[result.reason || 'skipped'] || 0) + 1;
          continue;
        }

        notebookChanged += 1;
        notebookRemapped += result.remapped || 0;
        notebookDropped += result.dropped || 0;
        notebookMarkers += result.markerCount || 0;
        totals.changed += 1;
        totals.components += result.componentCount || 0;
        totals.markers += result.markerCount || 0;
        totals.remapped += result.remapped || 0;
        totals.dropped += result.dropped || 0;

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
        `- ${notebook.id} "${notebook.name}": changed=${notebookChanged}, markers=${notebookMarkers}, remappedActions=${notebookRemapped}, droppedFocus=${notebookDropped}, skipped=${JSON.stringify(skipReasons)}`,
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
