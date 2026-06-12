#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';

const ROOT = process.cwd();
const NOTEBOOK_ID = 'nb-mat102-zh-induction-i-skill-v2-20260601';
const NOTEBOOK_NAME = 'MAT102 Induction I - native marker';
const SOURCE_PDF = 'queue/MAT102/10InductionI-1.pdf';
const COURSE_ID = process.env.MAT102_COURSE_ID || 'cmpd5bird007v8ogmjuuiio03';
const OWNER_ID = process.env.OPENMAIC_OWNER_ID || 'user-dongbochen1218-icloud-com';
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;
const SOURCE_WIDTH = 1600;
const SOURCE_HEIGHT = 900;
const HOTSPOT_PATH = 'M 0 0 L 200 0 L 200 200 L 0 200 Z';
const HELPER =
  '/Users/dongpochen/.codex/skills/openmaic-lecture-image/scripts/render_single_lecture_image_artifacts.cjs';
const ARTIFACT_DIR = path.join(
  ROOT,
  'tmp/notebook-imagegen-queue/MAT102/queue-mat102-10inductioni-1',
);
const PAGE_SPEC_PATH = path.join(ARTIFACT_DIR, 'page-specs-imagegen-20260601.json');
const NATIVE_DIR = path.join(ARTIFACT_DIR, 'generated-images-native-marker-20260601');
const PROMPT_DIR = path.join(ARTIFACT_DIR, 'prompts-native-marker-20260601');
const SOURCE_MARKER_DIR = path.join(NATIVE_DIR, 'source-marker');
const BUILD_DIR = path.join(NATIVE_DIR, 'build');
const PUBLIC_DIR = path.join(ROOT, 'public/generated-notebooks', NOTEBOOK_ID);
const PUBLIC_URL = `/generated-notebooks/${NOTEBOOK_ID}`;

const COLORS = [
  { name: 'red', hex: '#ff0000' },
  { name: 'lime', hex: '#00ff00' },
  { name: 'blue', hex: '#0048ff' },
  { name: 'magenta', hex: '#ff00ff' },
];

const BASE_SEMANTICS = ['entry', 'worked-step', 'principle', 'takeaway'];
const FALLBACK_LABELS = ['入口', '老师步骤', '关键原则', '本页收束'];
const LAYOUT_PLANS = [
  {
    name: 'opening flow map',
    composition:
      'Use an opening-page flow map: a wide hand-drawn domino/proof chain across the middle, with one small entry question near the upper-left, the proof-format note below the chain, and the takeaway as a compact closing note near the lower-right.',
    placements: [
      'small upper-left entry note, near but not touching the title',
      'wide central flow diagram spanning the middle of the page',
      'compact proof-format checklist below the central flow, slightly left of center',
      'small lower-right closing note with generous whitespace around it',
    ],
  },
  {
    name: 'two worked examples with synthesis',
    composition:
      'Use an asymmetric worked-example board: one example on the left, one example on the right, a small teacher-method bridge between them, and a synthesis strip near the bottom.',
    placements: [
      'left half, as the first worked example with only its essential algebra cue',
      'small middle bridge, visually connecting the two examples without becoming a frame',
      'right half, as the second worked example with only its essential divisibility cue',
      'bottom synthesis strip, short and compact, spanning only the central width',
    ],
  },
  {
    name: 'diagram plus vertical construction steps',
    composition:
      'Use a construction-focused layout: a large chessboard sketch carries the page, with base case as a small inset, induction step as a vertical teacher sequence, and takeaway below the sequence.',
    placements: [
      'upper-left objective beside the main board sketch',
      'small upper-right base-case inset',
      'large lower-left-to-center construction sketch showing the four subboards and center L tile',
      'right-side closing note under the step sequence',
    ],
  },
  {
    name: 'notation anatomy and expansion path',
    composition:
      'Use a notation anatomy layout: the Sigma symbol sits large but gray near the left-center, labels point to its parts, the expansion path moves horizontally, and the algorithm sits as a short vertical ladder.',
    placements: [
      'left-center notation anatomy cluster with labels close to the Sigma expression',
      'upper-right short algorithm ladder',
      'middle-to-lower horizontal expansion path',
      'lower-left closing note connected by a muted brown arrow',
    ],
  },
  {
    name: 'proof ladder',
    composition:
      'Use a vertical proof ladder: proposition at the top, base case as a side step, induction step as the main middle derivation, and conclusion at the bottom.',
    placements: [
      'top proposition band, compact and centered',
      'small left side step for the base case',
      'main middle-right proof ladder with the old sum plus new term move',
      'bottom conclusion note, short and visually separated',
    ],
  },
  {
    name: 'comparison strip with example island',
    composition:
      'Use a comparison-and-example layout: ordinary vs strong induction is a top strip, the stamp example sits as a central island, and the usage cue closes the page near the bottom.',
    placements: [
      'top-left definition of strong induction',
      'top-right comparison note with ordinary induction',
      'central stamp example island with three starting values',
      'bottom usage cue, compact and centered',
    ],
  },
  {
    name: 'recursive construction tree',
    composition:
      'Use a recursive construction tree: basis elements start at the left, constructors branch through the center, generated examples appear along the branches, and the membership rule closes on the right.',
    placements: [
      'left-side basis and constructor definition',
      'upper-center rule example',
      'center branching construction trace',
      'right-side membership takeaway',
    ],
  },
  {
    name: 'recurrence dependency map',
    composition:
      'Use an asymmetric recurrence dependency map: a tall recurrence strip anchors the left side, the target formula is a compact upper-right note, the two base cases form a wide lower-middle check row, and the strong-induction reason is a small lower-right note.',
    placements: [
      'tall left-side vertical strip with the recurrence stacked and a graphite dependency sketch from x_{k-2}, x_{k-1} to x_k',
      'compact upper-right formula note, smaller than the recurrence strip',
      'wide lower-middle two-base-case check row under the dependency sketch',
      'small lower-right reason for strong induction, offset from the base-case row',
    ],
  },
  {
    name: 'structure induction rule tree',
    composition:
      'Use a structure-induction rule tree with uneven hierarchy: the construction tree is the visual center, the principle is a smaller side note, the proof target sits narrowly beside the tree, and the checklist closes below.',
    placements: [
      'compact upper-left structure-induction principle, smaller than the tree',
      'large central rule tree for the set construction, with a root and graphite constructor branches',
      'narrow right-side divisibility target and proof cue beside the tree',
      'bottom checklist note spanning the lower center under the tree',
    ],
  },
  {
    name: 'decision map synthesis',
    composition:
      'Use a synthesis decision map: practice types orbit a large unboxed central decision text, and the final takeaway sits as an unboxed closing line at the bottom.',
    placements: [
      'upper-left group of formula and number examples',
      'upper-right group of string and recursive-set examples',
      'large unboxed central decision text for choosing an induction style, with three graphite branches labelled 普通归纳, 强归纳, 结构归纳',
      'bottom unboxed closing line about asking how the object is generated',
    ],
  },
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function loadEnvLocal() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!process.env[key]) process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
}

function pageNo(index) {
  return String(index + 1).padStart(2, '0');
}

function pageNo3(index) {
  return String(index + 1).padStart(3, '0');
}

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function safeId(value) {
  return String(value || 'focus')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function pages() {
  return readJson(PAGE_SPEC_PATH).pages;
}

function compactText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function labelFromVisible(visible, index) {
  const text = compactText(visible);
  const label = text.split(/[：:]/)[0]?.trim();
  if (label && label.length <= 8) return label;
  return FALLBACK_LABELS[index] || `组件${index + 1}`;
}

function componentPlans(page, pageIndex) {
  return page.visible.slice(0, 4).map((visible, index) => {
    const label = labelFromVisible(visible, index);
    const semanticId = BASE_SEMANTICS[index] || safeId(label);
    return {
      id: `page-${pageNo3(pageIndex)}-${semanticId}`,
      semanticId,
      label,
      visibleText: visible,
      speech: page.speech[index] || '',
      order: index + 1,
      markerColorName: COLORS[index].name,
      markerColorHex: COLORS[index].hex,
    };
  });
}

function layoutPlanForPage(pageIndex) {
  return LAYOUT_PLANS[pageIndex] || LAYOUT_PLANS[pageIndex % LAYOUT_PLANS.length];
}

function promptForPage(page, pageIndex) {
  const components = componentPlans(page, pageIndex);
  const layout = layoutPlanForPage(pageIndex);
  const componentLines = components
    .map(
      (component) =>
        `${component.order}. “${component.label}”: ${component.visibleText}\n   Marker: pure ${component.markerColorName} ${component.markerColorHex}; draw exactly four isolated solid square markers at this component's invisible bounding-box corners.`,
    )
    .join('\n');
  const markerSummary = components
    .map((component) => `4 ${component.markerColorName} markers for “${component.label}”`)
    .join(', ');

  return `Use case: scientific-educational
Asset type: OpenMAIC SOURCE-MARKER lecture image, 16:9 full-page bitmap. The generated image itself must contain fiducial corner markers; later software will recover the regions and erase the markers.

Primary request:
Generate page ${pageNo(pageIndex)} of a polished Chinese MAT102 notebook about induction. This is the source-marker image, so the colored marker squares must be part of the generated image itself, not added later.

Canvas and visual style:
- 16:9 landscape, white graph-paper notebook background with faint light-gray grid.
- Beautiful classroom hand-drawn lecture note style: black ink handwriting, graphite gray sketches, soft warm-gray shadows, very muted brown accent arrows only.
- Important color rule: ordinary teaching content must use ONLY black, graphite gray, light gray, and muted brown. Do not use teal, cyan, blue, green, red, magenta, or yellow in ordinary content.
- Student-visible prose must be Simplified Chinese. Math notation may remain standard.

Teaching content:
Title near top: “${page.title}”
Create exactly ${components.length} separate compact learning clusters. The page should use a content-driven layout, not a repeated default grid:
${componentLines}
Each cluster can include 2-3 short handwritten lines and a small graphite sketch when helpful. Keep every cluster compact and readable. Do NOT draw visible rectangles, cards, frames, boxes, brackets, or borders around clusters. The cluster boundary is invisible.

Layout plan:
- Archetype: ${layout.name}.
- Composition: ${layout.composition}
${components.map((component, index) => `- Cluster ${component.order} “${component.label}”: ${layout.placements[index] || 'place as a compact supporting note that follows the page visual rhythm'}.`).join('\n')}
- Keep the title separated from the clusters with clear whitespace.
- Do not make this page look like a balanced 2x2 grid unless the archetype explicitly calls for it.
- Use varied scale, whitespace, and flow so this page feels designed for its specific teaching move.

Corner marker protocol, highest priority:
- Draw exactly ${components.length * 4} marker squares total: ${markerSummary}.
- The marker squares must be visible in this generated image. They are not added later.
- Each marker square should be 22-28 px on a 1600x900 image, flat filled color, simple square, no outline, no shadow, no text.
- For every cluster, all four marker positions must be present and visible: top-left, top-right, bottom-left, bottom-right. Do not omit the bottom-left marker.
- The four markers for a cluster must be close to that cluster, about 20-45 px outside the content, not at the far page margins unless the content itself is there.
- Do not align all markers into long vertical rails at the page sides. Each learning cluster must have its own tight four-corner marker rectangle.
- Leave 35 px of blank graph-paper quiet zone around every marker. Markers must not touch handwriting, formulas, sketches, arrows, shadows, or grid-heavy decorations.
- The four markers must not be connected: no colored lines, no colored borders, no colored rectangles, no brackets, no L-corners, no underlines, no arrows.
- Reserved colors may appear ONLY in marker squares: #ff0000, #00ff00, #0048ff, #00ffff, #ff00ff, #ffff00. Ordinary content must not contain any saturated red/green/blue/cyan/magenta/yellow.
- Final count checklist before output: red=4, lime=4, blue=4, magenta=4, cyan=0, yellow=0.

Accuracy requirements:
- Preserve the mathematical facts and teacher-step structure from ${SOURCE_PDF}.
- If this page is a proof, include the relevant proof rhythm: define the proposition, base case, induction hypothesis, induction step, and conclusion.
- Keep text large and readable; avoid dense lecture-handout paragraphs.

Avoid:
No connected markers, no colored frames, no colored boxes, no decorative colored dots, no UI chrome, no watermark, no placeholder text, no English prose labels, no extra pure-color squares.`;
}

function preparePrompts() {
  ensureDir(PROMPT_DIR);
  ensureDir(SOURCE_MARKER_DIR);
  const manifest = { notebookId: NOTEBOOK_ID, sourcePdf: SOURCE_PDF, pages: [] };
  for (const [index, page] of pages().entries()) {
    const prompt = promptForPage(page, index);
    fs.writeFileSync(path.join(PROMPT_DIR, `page-${pageNo3(index)}.prompt.md`), `${prompt}\n`);
    manifest.pages.push({
      order: index,
      title: page.title,
      promptPath: path.join(PROMPT_DIR, `page-${pageNo3(index)}.prompt.md`),
      expectedSourceMarkerImage: path.join(
        SOURCE_MARKER_DIR,
        `page-${pageNo3(index)}-source-marker-imagegen.png`,
      ),
      components: componentPlans(page, index),
    });
  }
  writeJson(path.join(NATIVE_DIR, 'manifest.json'), manifest);
  console.log(`Prepared ${manifest.pages.length} native marker prompts in ${PROMPT_DIR}`);
}

function specForPage(page, pageIndex, outputDir) {
  const sourceMarkerImage = path.join(
    SOURCE_MARKER_DIR,
    `page-${pageNo3(pageIndex)}-source-marker-imagegen.png`,
  );
  return {
    sourceMarkerImage,
    outputDir,
    publicBaseUrl: `${PUBLIC_URL}/pages/page-${pageNo3(pageIndex)}`,
    pageId: `page-${pageNo3(pageIndex)}`,
    title: page.title,
    canvas: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT },
    components: componentPlans(page, pageIndex).map((component) => ({
      id: component.id,
      label: component.label,
      semanticId: component.semanticId,
      order: component.order,
      markerColorHex: component.markerColorHex,
    })),
  };
}

function runRecovery(pageFilter = null) {
  if (!pageFilter) fs.rmSync(BUILD_DIR, { recursive: true, force: true });
  ensureDir(BUILD_DIR);
  const reports = [];
  for (const [index, page] of pages().entries()) {
    if (pageFilter && !pageFilter.has(index + 1)) continue;
    const outputDir = path.join(BUILD_DIR, 'pages', `page-${pageNo3(index)}`);
    const spec = specForPage(page, index, outputDir);
    if (!fs.existsSync(spec.sourceMarkerImage)) {
      throw new Error(`Missing imagegen source-marker image: ${spec.sourceMarkerImage}`);
    }
    const specPath = path.join(BUILD_DIR, 'specs', `page-${pageNo3(index)}.json`);
    writeJson(specPath, spec);
    execFileSync('node', [HELPER, '--spec', specPath], { cwd: ROOT, stdio: 'inherit' });
    const validation = readJson(path.join(outputDir, 'validation-report.json'));
    reports.push({
      page: index + 1,
      title: page.title,
      status: validation.status,
      recoveredRegionCount: validation.recoveredRegions.filter((region) => region.status === 'pass')
        .length,
      totalRegionCount: validation.recoveredRegions.length,
      sourceCounts: validation.sourceCounts,
      cleanCounts: validation.cleanCounts,
    });
  }
  if (!pageFilter) {
    writeJson(path.join(BUILD_DIR, 'recovery-summary.json'), {
      notebookId: NOTEBOOK_ID,
      pageCount: reports.length,
      allPass: reports.every((report) => report.status === 'pass'),
      reports,
    });
  }
  const failed = reports.filter((report) => report.status !== 'pass');
  if (failed.length) {
    throw new Error(`Recovery failed for pages: ${failed.map((report) => report.page).join(', ')}`);
  }
}

function canvasRect([x, y, width, height]) {
  return {
    left: (x / SOURCE_WIDTH) * CANVAS_WIDTH,
    top: (y / SOURCE_HEIGHT) * CANVAS_HEIGHT,
    width: (width / SOURCE_WIDTH) * CANVAS_WIDTH,
    height: (height / SOURCE_HEIGHT) * CANVAS_HEIGHT,
  };
}

function imageElement(index) {
  const page = pageNo(index);
  return {
    id: `${NOTEBOOK_ID}-image-${page}`,
    type: 'image',
    name: 'full_page_bitmap',
    left: 0,
    top: 0,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    rotate: 0,
    fixedRatio: false,
    src: `${PUBLIC_URL}/slide-${page}.png`,
    imageType: 'background',
    lock: true,
    radius: 0,
  };
}

function hotspotElement(region) {
  const rect = canvasRect(region.bbox);
  return {
    id: region.id,
    name: `semantic-hit-map: ${region.label}`,
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
    outline: { color: '#ffffff', width: 0, style: 'solid' },
    opacity: 0,
  };
}

function actionsForPage(page, regions) {
  return regions.flatMap((region, index) => [
    {
      id: `${region.id}-spotlight`,
      type: 'spotlight',
      elementId: region.id,
      title: region.label,
      description: `聚焦区域：${region.label}`,
      dimOpacity: 0.76,
    },
    {
      id: `${region.id}-speech`,
      type: 'speech',
      title: `讲解：${region.label}`,
      text: page.speech[index] || '',
    },
  ]);
}

function pageMetadata(index) {
  return readJson(path.join(PUBLIC_DIR, 'pages', `page-${pageNo3(index)}`, 'metadata.json'));
}

function semanticHitMapForPage(page, index, regions) {
  return {
    version: 1,
    title: page.title,
    sourceSize: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT },
    canvasSize: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    maskPreviewContactSheet: `${PUBLIC_URL}/mask-preview-contact-sheet.png`,
    regions: regions.map((region) => ({
      ...region,
      canvasRect: canvasRect(region.bbox),
    })),
  };
}

function promptPlanForPage(page, index, regions) {
  const layout = layoutPlanForPage(index);
  return {
    schemaVersion: 4,
    canvas: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT, aspectRatio: '16:9' },
    sourcePdf: SOURCE_PDF,
    workflow: 'imagegen source-marker -> marker recovery -> clean student image',
    layoutPlan: {
      name: layout.name,
      composition: layout.composition,
      placements: layout.placements,
    },
    componentPlans: componentPlans(page, index).map((component) => {
      const recovered = regions.find((region) => region.id === component.id);
      return {
        id: component.id,
        label: component.label,
        order: component.order,
        markerColorName: component.markerColorName,
        markerColorHex: component.markerColorHex,
        participatesInMask: true,
        recoveredBbox: recovered?.bbox || null,
        maskPreviewUrl: recovered?.maskPreviewUrl || null,
      };
    }),
    markerProtocol: {
      type: 'native-imagegen-corner-square-markers-clean-is-recovered',
      markerCountPerComponent: 4,
      markerSizePx: '22-28',
      note: 'Source image already contains markers. Clean image is recovered by removing marker components.',
      ordinaryContentSafePalette: ['black', 'graphite gray', 'light gray', 'muted brown'],
      ordinaryContentForbiddenColors: [
        '#ff0000',
        '#00ff00',
        '#0048ff',
        '#00ffff',
        '#ff00ff',
        '#ffff00',
      ],
    },
    compiledImagePromptPath: path.join(PROMPT_DIR, `page-${pageNo3(index)}.prompt.md`),
    recoveryResult: {
      status: 'passed',
      recoveredAt: Date.now(),
      originalMarkerImageUrl: `${PUBLIC_URL}/source/page-${pageNo3(index)}-source.png`,
      cleanImageUrl: `${PUBLIC_URL}/recovered/page-${pageNo3(index)}-clean.png`,
      components: regions.map((region) => ({
        componentId: region.id,
        label: region.label,
        markerColorHex: region.markerColorHex,
        markerCount: 4,
        bbox: region.bbox,
        maskPreviewUrl: region.maskPreviewUrl,
      })),
    },
  };
}

function sceneForPage(page, index) {
  const metadata = pageMetadata(index);
  const regions = metadata.regions;
  return {
    id: `${NOTEBOOK_ID}-p${pageNo(index)}`,
    notebookId: NOTEBOOK_ID,
    title: page.title,
    type: 'slide',
    order: index,
    content: {
      type: 'slide',
      canvas: {
        id: `${NOTEBOOK_ID}-canvas-${pageNo(index)}`,
        viewportSize: CANVAS_WIDTH,
        viewportRatio: 16 / 9,
        background: { type: 'solid', color: '#ffffff', respectProfileStyle: false },
        theme: {
          backgroundColor: '#ffffff',
          themeColors: ['#111827', '#78716c', '#334155', '#f8fafc'],
          fontColor: '#111827',
          fontName: 'Microsoft YaHei',
        },
        remark: page.title,
        elements: [imageElement(index), ...regions.map((region) => hotspotElement(region))],
      },
      webRenderMode: 'slide',
      semanticHitMap: semanticHitMapForPage(page, index, regions),
      imageNotebookPromptPlan: promptPlanForPage(page, index, regions),
    },
    actions: actionsForPage(page, regions),
    whiteboard: [],
  };
}

function scenesForNotebook() {
  return pages().map((page, index) => sceneForPage(page, index));
}

async function renderContactSheet(files, outputPath, labels) {
  const cols = Math.min(5, Math.max(1, files.length));
  const thumbW = 320;
  const thumbH = 180;
  const labelH = 30;
  const gap = 10;
  const rows = Math.ceil(files.length / cols);
  const composites = [];
  for (const [index, file] of files.entries()) {
    const x = (index % cols) * (thumbW + gap);
    const y = Math.floor(index / cols) * (thumbH + labelH + gap);
    composites.push({
      input: await sharp(file).resize(thumbW, thumbH, { fit: 'fill' }).png().toBuffer(),
      left: x,
      top: y,
    });
    composites.push({
      input: Buffer.from(
        `<svg width="${thumbW}" height="${labelH}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#111827"/><text x="10" y="21" font-family="Arial" font-size="15" font-weight="700" fill="white">${esc(labels[index])}</text></svg>`,
      ),
      left: x,
      top: y + thumbH,
    });
  }
  await sharp({
    create: {
      width: cols * thumbW + (cols - 1) * gap,
      height: rows * (thumbH + labelH) + (rows - 1) * gap,
      channels: 4,
      background: '#f8fafc',
    },
  })
    .composite(composites)
    .png()
    .toFile(outputPath);
}

async function publishBuild() {
  const summary = readJson(path.join(BUILD_DIR, 'recovery-summary.json'));
  if (!summary.allPass) throw new Error('Cannot publish: recovery summary is not allPass.');
  ensureDir(PUBLIC_DIR);
  for (const name of [
    'pages',
    'source',
    'recovered',
    'raw',
    'mask-previews',
    'contact-sheet.png',
    'mask-preview-contact-sheet.png',
    'semantic-hit-map.json',
    'notebook-outline.json',
    'artifact-summary.json',
    'validation-summary.json',
    'notebook-scenes.json',
    'scene-actions.json',
  ]) {
    fs.rmSync(path.join(PUBLIC_DIR, name), { recursive: true, force: true });
  }
  ensureDir(path.join(PUBLIC_DIR, 'pages'));
  ensureDir(path.join(PUBLIC_DIR, 'source'));
  ensureDir(path.join(PUBLIC_DIR, 'recovered'));
  ensureDir(path.join(PUBLIC_DIR, 'raw'));
  ensureDir(path.join(PUBLIC_DIR, 'mask-previews'));

  const artifacts = [];
  for (const [index, page] of pages().entries()) {
    const page3 = pageNo3(index);
    const page2 = pageNo(index);
    const builtPageDir = path.join(BUILD_DIR, 'pages', `page-${page3}`);
    const publicPageDir = path.join(PUBLIC_DIR, 'pages', `page-${page3}`);
    fs.cpSync(builtPageDir, publicPageDir, { recursive: true });
    fs.copyFileSync(
      path.join(publicPageDir, 'source-marker.png'),
      path.join(PUBLIC_DIR, 'source', `page-${page3}-source.png`),
    );
    fs.copyFileSync(
      path.join(publicPageDir, 'clean.png'),
      path.join(PUBLIC_DIR, 'recovered', `page-${page3}-clean.png`),
    );
    fs.copyFileSync(
      path.join(publicPageDir, 'clean.png'),
      path.join(PUBLIC_DIR, `slide-${page2}.png`),
    );
    fs.copyFileSync(
      path.join(publicPageDir, 'source-marker.png'),
      path.join(PUBLIC_DIR, 'raw', `page-${page3}-source-marker.png`),
    );
    fs.cpSync(
      path.join(publicPageDir, 'mask-previews'),
      path.join(PUBLIC_DIR, 'mask-previews', `page-${page3}`),
      {
        recursive: true,
      },
    );
    const metadata = readJson(path.join(publicPageDir, 'metadata.json'));
    const validation = readJson(path.join(publicPageDir, 'validation-report.json'));
    artifacts.push({
      page: index + 1,
      title: page.title,
      status: validation.status,
      cleanPath: path.join(publicPageDir, 'clean.png'),
      sourcePath: path.join(publicPageDir, 'source-marker.png'),
      contactSheetPath: path.join(publicPageDir, 'mask-preview-contact-sheet.png'),
      metadataPath: path.join(publicPageDir, 'metadata.json'),
      validationPath: path.join(publicPageDir, 'validation-report.json'),
      maskPreviewCount: metadata.regions.filter((region) => region.maskPreviewUrl).length,
    });
  }

  await renderContactSheet(
    pages().map((_, index) => path.join(PUBLIC_DIR, `slide-${pageNo(index)}.png`)),
    path.join(PUBLIC_DIR, 'contact-sheet.png'),
    pages().map((_, index) => `第 ${index + 1} 页`),
  );
  const maskFiles = [];
  const maskLabels = [];
  for (const [index] of pages().entries()) {
    const metadata = pageMetadata(index);
    for (const region of metadata.regions) {
      const file = path.join(PUBLIC_DIR, region.maskPreviewUrl.replace(`${PUBLIC_URL}/`, ''));
      if (!fs.existsSync(file)) continue;
      maskFiles.push(file);
      maskLabels.push(`第 ${index + 1} 页 · ${region.label}`);
    }
  }
  await renderContactSheet(
    maskFiles,
    path.join(PUBLIC_DIR, 'mask-preview-contact-sheet.png'),
    maskLabels,
  );

  const scenes = scenesForNotebook();
  const hitMap = {
    notebookId: NOTEBOOK_ID,
    source: 'openmaic-native-imagegen-corner-marker-recovery',
    sourcePdf: SOURCE_PDF,
    workflow: 'imagegen source-marker -> recovered clean image -> recovered masks',
    maskPreviewContactSheet: `${PUBLIC_URL}/mask-preview-contact-sheet.png`,
    slides: pages().map((page, index) => {
      const metadata = pageMetadata(index);
      return {
        order: index,
        title: page.title,
        image: `${PUBLIC_URL}/slide-${pageNo(index)}.png`,
        sourceImage: `${PUBLIC_URL}/source/page-${pageNo3(index)}-source.png`,
        cleanImage: `${PUBLIC_URL}/recovered/page-${pageNo3(index)}-clean.png`,
        pageArtifacts: `${PUBLIC_URL}/pages/page-${pageNo3(index)}`,
        maskPreviews: metadata.regions.map((region) => ({
          regionId: region.id,
          label: region.label,
          image: region.maskPreviewUrl,
        })),
        hitMap: semanticHitMapForPage(page, index, metadata.regions),
        validation: {
          status: artifacts[index].status,
          maskPreviewCount: artifacts[index].maskPreviewCount,
        },
      };
    }),
  };
  writeJson(path.join(PUBLIC_DIR, 'semantic-hit-map.json'), hitMap);
  writeJson(path.join(PUBLIC_DIR, 'notebook-scenes.json'), scenes);
  writeJson(
    path.join(PUBLIC_DIR, 'scene-actions.json'),
    scenes.map((scene) => ({
      id: scene.id,
      title: scene.title,
      order: scene.order,
      actions: scene.actions,
    })),
  );
  writeJson(path.join(PUBLIC_DIR, 'artifact-summary.json'), artifacts);
  writeJson(path.join(PUBLIC_DIR, 'validation-summary.json'), {
    notebookId: NOTEBOOK_ID,
    pageCount: artifacts.length,
    allPass: artifacts.every((artifact) => artifact.status === 'pass'),
    maskPreviewCount: artifacts.reduce((sum, artifact) => sum + artifact.maskPreviewCount, 0),
    slides: artifacts.map((artifact, index) => ({
      order: index,
      title: artifact.title,
      status: artifact.status,
      maskPreviewCount: artifact.maskPreviewCount,
    })),
  });
  writeJson(path.join(PUBLIC_DIR, 'notebook-outline.json'), {
    id: NOTEBOOK_ID,
    title: NOTEBOOK_NAME,
    pageCount: pages().length,
    sourcePdf: SOURCE_PDF,
    pages: pages().map((page, index) => ({ order: index, title: page.title })),
  });
}

function publicMemoryText() {
  return [
    '## 来源范围',
    `- 适用于 MAT102 的 Induction I notebook，来源是 ${SOURCE_PDF} 和本次 native imagegen 四角 recover 图片笔记本。`,
    '- 后续答疑、出题和续写这本 notebook 时，优先按这里的证明格式和老师步骤组织答案。',
    '',
    '## 老师讲了什么',
    '- 普通归纳用 base case 和 induction step 覆盖无限多个编号命题。',
    '- 归纳假设只能临时使用已经声明的旧命题，不能提前使用目标命题。',
    '- 强归纳允许使用前面所有已经证明过的情形，适合新情况会退回多个旧情况的题。',
    '- 递归定义由 basis elements 和 constructors 组成；结构归纳要证明 basis，并证明每一种 constructor 保持性质。',
    '',
    '## 标准证明格式',
    '- 先定义命题 P(n) 和 n 的适用范围。',
    '- Base case 要明确检查起点。',
    '- Induction step 要写：令 k 为任意满足范围的整数，并假设 P(k) 成立；目标是证明 P(k+1)。',
    '- 推导中每次使用归纳假设都要能指出旧命题如何进入新命题。',
    '- 结尾要写：由数学归纳法，P(n) 对范围内所有 n 成立。',
    '- 强归纳证明要写清允许使用的旧情况范围，例如所有小于等于 k 的情形。',
    '',
    '## 老师步骤',
    '- 不等式归纳题先写出 k+1 目标式，再把它改写到可以调用 k 层假设的形状。',
    '- 整除归纳题先把“整除”翻译成整数倍等式，再代入归纳步骤。',
    '- 求和归纳题把前 k+1 项拆成“前 k 项的旧和”加“新的一项”，再用归纳假设替换旧和。',
    '- 构造型归纳要把大对象切回同类小对象。',
    '- 结构归纳必须逐一检查每一种 constructor。',
  ].join('\n');
}

async function seedDatabase() {
  loadEnvLocal();
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set.');
  const prisma = new PrismaClient();
  const scenes = scenesForNotebook();
  try {
    const course = await prisma.course.findUnique({ where: { id: COURSE_ID } });
    if (!course) throw new Error(`Course not found: ${COURSE_ID}`);
    const ownerId = course.ownerId || OWNER_ID;
    await prisma.$transaction(async (tx) => {
      await tx.notebook.upsert({
        where: { id: NOTEBOOK_ID },
        update: {
          ownerId,
          courseId: course.id,
          name: NOTEBOOK_NAME,
          description:
            'MAT102 中文 imagegen notebook：source-marker 原生四角生成，recover 后得到 clean slides 和 masks。',
          tags: [
            'MAT102',
            'zh-CN',
            'native-imagegen-marker',
            'marker-recovery',
            '10InductionI-1.pdf',
          ],
          avatarUrl: '/avatars/notebook-agents/avatar8.avif',
          language: 'zh-CN',
          style: 'native-imagegen-marker-recovered',
        },
        create: {
          id: NOTEBOOK_ID,
          ownerId,
          courseId: course.id,
          name: NOTEBOOK_NAME,
          description:
            'MAT102 中文 imagegen notebook：source-marker 原生四角生成，recover 后得到 clean slides 和 masks。',
          tags: [
            'MAT102',
            'zh-CN',
            'native-imagegen-marker',
            'marker-recovery',
            '10InductionI-1.pdf',
          ],
          avatarUrl: '/avatars/notebook-agents/avatar8.avif',
          language: 'zh-CN',
          style: 'native-imagegen-marker-recovered',
        },
      });
      await tx.scene.deleteMany({ where: { notebookId: NOTEBOOK_ID } });
      await tx.scene.createMany({
        data: scenes.map((scene) => ({
          id: scene.id,
          notebookId: NOTEBOOK_ID,
          title: scene.title,
          type: scene.type,
          order: scene.order,
          content: scene.content,
          actions: scene.actions,
          whiteboard: scene.whiteboard,
        })),
      });
      await tx.studyMemory.upsert({
        where: { id: 'memory_mat102_induction_i_public_20260601' },
        update: {
          ownerId,
          courseId: course.id,
          notebookId: NOTEBOOK_ID,
          targetType: 'notebook',
          scope: 'public',
          kind: 'manual',
          status: 'active',
          source: 'notebook_generation',
          title: 'MAT102 归纳法证明格式与老师步骤',
          text: publicMemoryText(),
          reason: '根据 queue 原始 PDF 和 native imagegen 四角 recover 笔记本写入。',
          sourceReferences: [
            { label: 'queue PDF', source: SOURCE_PDF },
            { label: 'generated notebook', source: PUBLIC_URL },
          ],
        },
        create: {
          id: 'memory_mat102_induction_i_public_20260601',
          ownerId,
          courseId: course.id,
          notebookId: NOTEBOOK_ID,
          targetType: 'notebook',
          scope: 'public',
          kind: 'manual',
          status: 'active',
          source: 'notebook_generation',
          title: 'MAT102 归纳法证明格式与老师步骤',
          text: publicMemoryText(),
          reason: '根据 queue 原始 PDF 和 native imagegen 四角 recover 笔记本写入。',
          sourceReferences: [
            { label: 'queue PDF', source: SOURCE_PDF },
            { label: 'generated notebook', source: PUBLIC_URL },
          ],
        },
      });
    });
    console.log(`Seeded ${NOTEBOOK_ID}: ${scenes.length} scenes`);
  } finally {
    await prisma.$disconnect();
  }
}

function parseArgs() {
  const rawArgs = process.argv.slice(2);
  const args = new Set(rawArgs);
  const pageIndex = rawArgs.indexOf('--page');
  const pageFilter =
    pageIndex >= 0 && rawArgs[pageIndex + 1]
      ? new Set(
          rawArgs[pageIndex + 1]
            .split(',')
            .map((value) => Number(value.trim()))
            .filter((value) => Number.isInteger(value) && value > 0),
        )
      : null;
  return {
    prepare: args.has('--prepare') || process.argv.length === 2,
    process: args.has('--process') || args.has('--all'),
    publish: args.has('--publish') || args.has('--all'),
    seedDb: args.has('--seed-db') || args.has('--all'),
    pageFilter,
  };
}

async function main() {
  const args = parseArgs();
  if (args.prepare) preparePrompts();
  if (args.process) runRecovery(args.pageFilter);
  if (args.publish) await publishBuild();
  if (args.seedDb) await seedDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
