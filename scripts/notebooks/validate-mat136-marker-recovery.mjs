#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const NOTEBOOK_ID = 'nb-mat136-riemann-integral-week1-20260518135718';
const NOTEBOOK_DIR = path.join('public', 'generated-notebooks', NOTEBOOK_ID);
const SEMANTIC_MAP_PATH = path.join(NOTEBOOK_DIR, 'semantic-hit-map.json');
const EXPERIMENT_DIR = path.join(NOTEBOOK_DIR, 'marker-recovery-experiment');
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;

const MARKER_COLORS = [
  {
    name: 'red',
    hex: '#ff0000',
    match: (r, g, b) => r > 180 && g < 80 && b < 80,
  },
  {
    name: 'lime',
    hex: '#00ff00',
    match: (r, g, b) => g > 170 && r < 80 && b < 90,
  },
  {
    name: 'blue',
    hex: '#0048ff',
    match: (r, g, b) => b > 140 && r < 80 && g < 130,
  },
  {
    name: 'cyan',
    hex: '#00ffff',
    match: (r, g, b) => g > 165 && b > 165 && r < 90,
  },
  {
    name: 'magenta',
    hex: '#ff00ff',
    match: (r, g, b) => r > 170 && b > 130 && g < 90,
  },
  {
    name: 'yellow',
    hex: '#ffff00',
    match: (r, g, b) => r > 170 && g > 170 && b < 100,
  },
];

function readSemanticMap() {
  return JSON.parse(fs.readFileSync(SEMANTIC_MAP_PATH, 'utf8'));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function toCanvasRect(rect, info) {
  const [left, top, width, height] = rect;
  return [
    round1((left / info.width) * CANVAS_WIDTH),
    round1((top / info.height) * CANVAS_HEIGHT),
    round1((width / info.width) * CANVAS_WIDTH),
    round1((height / info.height) * CANVAS_HEIGHT),
  ];
}

function rectCenter(rect) {
  return {
    x: rect[0] + rect[2] / 2,
    y: rect[1] + rect[3] / 2,
  };
}

function centerDistance(a, b) {
  const ac = rectCenter(a);
  const bc = rectCenter(b);
  return Math.hypot(ac.x - bc.x, ac.y - bc.y);
}

function rectIntersectionArea(a, b) {
  const left = Math.max(a[0], b[0]);
  const top = Math.max(a[1], b[1]);
  const right = Math.min(a[0] + a[2], b[0] + b[2]);
  const bottom = Math.min(a[1] + a[3], b[1] + b[3]);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function rectArea(rect) {
  return Math.max(0, rect[2]) * Math.max(0, rect[3]);
}

function intersectionOverUnion(a, b) {
  const intersection = rectIntersectionArea(a, b);
  const union = rectArea(a) + rectArea(b) - intersection;
  return union > 0 ? intersection / union : 0;
}

function expandedRectContains(rect, component, scale = 0.45) {
  const padX = Math.max(40, rect.width * scale);
  const padY = Math.max(35, rect.height * scale);
  const cx = component.minX + component.width / 2;
  const cy = component.minY + component.height / 2;
  return (
    cx >= rect.left - padX &&
    cx <= rect.left + rect.width + padX &&
    cy >= rect.top - padY &&
    cy <= rect.top + rect.height + padY
  );
}

function componentCenter(component) {
  return {
    x: component.minX + component.width / 2,
    y: component.minY + component.height / 2,
  };
}

function compactCornerMarker(component) {
  const aspect = component.width / component.height;
  const fillRatio = component.area / Math.max(1, component.width * component.height);
  return (
    component.width >= 7 &&
    component.height >= 7 &&
    component.width <= 64 &&
    component.height <= 64 &&
    aspect >= 0.35 &&
    aspect <= 2.85 &&
    fillRatio >= 0.18
  );
}

function componentsFor(data, info, match) {
  const mask = new Uint8Array(info.width * info.height);
  for (let i = 0, p = 0; i < data.length; i += 3, p += 1) {
    if (match(data[i], data[i + 1], data[i + 2])) {
      mask[p] = 1;
    }
  }

  const seen = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  const components = [];

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const idx = y * info.width + x;
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
        const cur = queue[head];
        head += 1;
        const cx = cur % info.width;
        const cy = Math.floor(cur / info.width);
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
            if (nx < 0 || nx >= info.width || ny < 0 || ny >= info.height) continue;
            const ni = ny * info.width + nx;
            if (!mask[ni] || seen[ni]) continue;
            seen[ni] = 1;
            queue[tail] = ni;
            tail += 1;
          }
        }
      }

      const width = maxX - minX + 1;
      const height = maxY - minY + 1;
      const aspect = width / height;
      if (
        area >= 35 &&
        width >= 6 &&
        height >= 6 &&
        width <= info.width &&
        height <= info.height &&
        aspect >= 0.02 &&
        aspect <= 50
      ) {
        components.push({ minX, minY, maxX, maxY, width, height, area });
      }
    }
  }

  return components;
}

function bboxFromComponents(components) {
  if (!components.length) return null;
  const left = Math.min(...components.map((component) => component.minX));
  const top = Math.min(...components.map((component) => component.minY));
  const right = Math.max(...components.map((component) => component.maxX));
  const bottom = Math.max(...components.map((component) => component.maxY));
  return [left, top, right - left + 1, bottom - top + 1].map(round1);
}

function markerPixelsBBox(data, info, match, bounds = null) {
  const minBoundX = bounds ? Math.max(0, Math.floor(bounds.left)) : 0;
  const maxBoundX = bounds ? Math.min(info.width - 1, Math.ceil(bounds.left + bounds.width)) : info.width - 1;
  const minBoundY = bounds ? Math.max(0, Math.floor(bounds.top)) : 0;
  const maxBoundY = bounds ? Math.min(info.height - 1, Math.ceil(bounds.top + bounds.height)) : info.height - 1;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  let area = 0;
  for (let i = 0, p = 0; i < data.length; i += 3, p += 1) {
    if (!match(data[i], data[i + 1], data[i + 2])) continue;
    const x = p % info.width;
    const y = Math.floor(p / info.width);
    if (x < minBoundX || x > maxBoundX || y < minBoundY || y > maxBoundY) continue;
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
    area += 1;
  }
  if (!area) return null;
  return {
    area,
    rect: [left, top, right - left + 1, bottom - top + 1].map(round1),
  };
}

function expectedCorners(rect) {
  return [
    { name: 'top-left', x: rect.left, y: rect.top },
    { name: 'top-right', x: rect.left + rect.width, y: rect.top },
    { name: 'bottom-left', x: rect.left, y: rect.top + rect.height },
    { name: 'bottom-right', x: rect.left + rect.width, y: rect.top + rect.height },
  ];
}

function selectedCornerMarkers(allComponents, expected) {
  const compactComponents = allComponents.filter(
    (component) => compactCornerMarker(component) && expandedRectContains(expected, component, 1),
  );
  const maxCornerDistance = Math.max(46, Math.min(expected.width, expected.height) * 0.32);
  const used = new Set();
  const cornerHits = [];

  for (const corner of expectedCorners(expected)) {
    let best = null;
    for (const component of compactComponents) {
      if (used.has(component)) continue;
      const center = componentCenter(component);
      const distance = Math.hypot(center.x - corner.x, center.y - corner.y);
      if (distance > maxCornerDistance) continue;
      if (!best || distance < best.distance) {
        best = { component, distance };
      }
    }
    if (best) {
      used.add(best.component);
      cornerHits.push({
        corner: corner.name,
        distance: round1(best.distance),
        component: best.component,
      });
    }
  }

  return {
    cornerHits,
    components: cornerHits.map((hit) => hit.component),
  };
}

function cornerHitsFromFourComponents(components) {
  const bbox = bboxFromComponents(components);
  if (!bbox) return [];
  const centerX = bbox[0] + bbox[2] / 2;
  const centerY = bbox[1] + bbox[3] / 2;
  const cornerFor = (component) => {
    const center = componentCenter(component);
    const vertical = center.y < centerY ? 'top' : 'bottom';
    const horizontal = center.x < centerX ? 'left' : 'right';
    return `${vertical}-${horizontal}`;
  };
  return components.map((component) => ({
    corner: cornerFor(component),
    distance: 0,
    component,
  }));
}

function selectedMarkerComponents(allComponents, expected) {
  const compactComponents = allComponents.filter(compactCornerMarker);
  if (compactComponents.length === 4) {
    return {
      components: compactComponents,
      strategy: 'global-four-corner-components',
      cornerHits: cornerHitsFromFourComponents(compactComponents),
    };
  }

  const cornerSelection = selectedCornerMarkers(allComponents, expected);
  return {
    components: cornerSelection.components,
    strategy: cornerSelection.components.length === 4 ? 'corner-only-components' : 'corner-only-incomplete',
    cornerHits: cornerSelection.cornerHits,
  };
}

function canvasRectObject(rect) {
  return {
    left: rect[0],
    top: rect[1],
    width: rect[2],
    height: rect[3],
  };
}

function recoverFriendlyRect(region) {
  const rect = [
    round1(region.canvasRect.left),
    round1(region.canvasRect.top),
    round1(region.canvasRect.width),
    round1(region.canvasRect.height),
  ];

  if ((region.semanticId === 'page-bridge' || region.semanticId === 'problem-strip') && rect[1] <= 90) {
    const top = Math.max(12.5, rect[1] - 6.3);
    const bottom = Math.max(rect[1] + rect[3], 112.5);
    return [18.8, round1(top), 956.2, round1(bottom - top)];
  }

  return rect;
}

function planForSemanticMap(data) {
  return {
    notebookId: data.notebookId,
    source: data.source,
    canvasSize: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    markerPolicy: {
      markersPerRegion: 4,
      style: 'corner-only-detached',
      markerSizePxAt1600: 16,
      markerQuietZonePxAt1600: 40,
      description:
        'Each semantic region gets exactly four isolated filled square markers at the outer top-left, top-right, bottom-left, and bottom-right corners. Colored lines, borders, brackets, frames, or missing corner markers are validation failures.',
      colors: MARKER_COLORS.map(({ name, hex }, index) => ({
        order: index + 1,
        name,
        hex,
      })),
      layoutRules: [
        'Every semantic region must be one axis-aligned rectangular block.',
        'Markers belong to the outer corners of the whole semantic block, not to internal formula boxes, diagrams, or sub-cards.',
        'Marker correctness has higher priority than decorative richness.',
        'Do not place markers on the canvas border; each marker should sit next to the semantic block it identifies.',
        'Leave a clean quiet zone around every marker so it can be removed without touching handwriting, formulas, graph strokes, or arrows.',
        'Keep visible content inside the marker rectangle with padding; do not draw content through the markers.',
        'Separate adjacent semantic regions with explicit whitespace so their marker clusters do not merge.',
        'Leave at least 96 px of empty vertical gutter on a 1600x900 image between the bottom edge of the top title/bridge block and the top edge of the first main-content block; target 120 px when space allows.',
        'Decorative elements are allowed outside semantic content blocks and do not require markers, but they must avoid marker colors and marker-like isolated square shapes.',
        'Decorations must stay out of marker quiet zones and must not carry essential lecture meaning.',
      ],
    },
    slides: data.slides.map((slide) => ({
      order: slide.order,
      title: slide.title,
      image: slide.image,
      regions: slide.hitMap.regions.map((region, regionIndex) => {
        const color = MARKER_COLORS[regionIndex % MARKER_COLORS.length];
        return {
          order: regionIndex + 1,
          semanticId: region.semanticId,
          label: region.label,
          markerColor: color.hex,
          markerName: color.name,
          expectedCanvasRect: recoverFriendlyRect(region),
        };
      }),
    })),
  };
}

function layoutHint(region) {
  const [left, top, width, height] = region.expectedCanvasRect;
  const centerX = left + width / 2;
  const centerY = top + height / 2;
  const horizontal = centerX < 330 ? 'left' : centerX > 670 ? 'right' : 'center';
  const vertical = centerY < 160 ? 'top' : centerY > 410 ? 'bottom' : 'middle';
  return `${vertical}-${horizontal}`;
}

function promptForSlide(slide) {
  const totalMarkerCount = slide.regions.length * 4;
  const targetLines = slide.regions
    .map(
      (region) =>
        `${region.order}. ${region.semanticId} / ${region.label}: marker ${region.markerColor}; planned area ${layoutHint(
          region,
        )}; draw exactly four isolated ${region.markerColor} corner squares at this semantic block's outer corners.`,
    )
    .join('\n');

  return `Use case: scientific-educational
Asset type: 16:9 hand-drawn MAT 136 course notebook slide with recoverable corner fiducials
Primary request: Regenerate slide ${slide.order + 1} of the MAT 136 Riemann integration lesson in a polished common classroom hand-drawn style. The slide should look normal to students except for exactly ${totalMarkerCount} tiny isolated colored calibration squares used by software.

Slide title: "${slide.title}"

Style rules:
- White graph-paper notebook background with faint light-gray grid.
- Common college-course hand-drawn style: black marker text, deep teal graphs, pale teal fills, readable formulas.
- Normal content may use only black, dark gray, deep teal, pale teal, and very muted brown for arrows.
- Add restrained notebook-style mathematical decoration so the page feels alive: faint margin scribbles, ghosted integral signs, subtle sigma marks, small axis ticks, soft arrows, graph-paper tape shadows, and light curve echoes.
- Do NOT use pure red, pure lime, pure blue, pure cyan, pure magenta, or pure yellow anywhere except the fiducial marker squares.
- No photorealism, no UI chrome, no watermark, no decorative stock art.

Marker rules:
- Exactly ${totalMarkerCount} pure-color calibration squares total: ${slide.regions.length} semantic regions × 4 corners.
- Marker correctness is the highest priority. Decoration is optional; missing or misplaced markers are not acceptable.
- For each planned region below, draw exactly four small filled square markers: top-left, top-right, bottom-left, bottom-right.
- Markers must be isolated corner dots/squares only. Do NOT connect them with colored lines, colored borders, colored brackets, colored frames, colored guide lines, colored underlines, or a colored rectangle.
- Marker squares are solid color, about 16 px on a 1600x900 image, with no text, no outline, no shadow.
- The four markers for one region must use exactly that region's marker color.
- Put the markers at the outer corners of the whole semantic block, not around an inner equation, graph, card, or decorative border.
- Do not place markers on the outer canvas border. Keep every marker visually attached to the semantic block it identifies.
- For the top title/bridge region, place two red markers near the top corners of the title band and two red markers near the bottom corners of the same title band. Do not put all four red markers along the top edge of the page.
- For the bottom question region, draw exactly four yellow markers around the bottom question block only. Do not add extra yellow markers in page corners.
- Leave at least 40 px of clean graph-paper quiet zone around every marker; no handwriting, formulas, graph lines, arrows, or fills may touch a marker.
- Keep each region's visible content inside its marker rectangle with comfortable padding.
- The semantic block rectangle is invisible. Do not draw a visual rectangle around it.
- Pure marker colors may appear only in these tiny calibration squares; never use those pure colors in text, arrows, graphs, card outlines, or decorations.
- Do not use decorative corner dots, square bullets, or small isolated colored squares that could be mistaken for fiducial markers.

Layout rules for easier recovery:
- Treat each planned region as one clear axis-aligned rectangular block.
- Keep blocks in the requested planned area; do not move a block to a different side of the page unless absolutely necessary for readability.
- Do not split one semantic region into multiple separated islands. If a region contains a graph plus labels, keep them inside the same marker rectangle.
- Do not overlap marker rectangles. Keep at least 64 px of empty space between adjacent semantic blocks; target 80 px when possible.
- The top title/bridge block must be visually separated from the content below it: keep at least 96 px of empty graph-paper vertical gutter between the bottom edge of the title/bridge marker rectangle and the top edge of the first middle-content marker rectangle on the final 1600x900 image. Prefer 120 px if the page still reads well.
- Main content must start clearly below the title/bridge band. Do not let the title markers sit on the same row as the first diagrams/cards.
- If two blocks are close, make the whitespace gap visible; marker clusters must remain visually separable.
- Keep page-level title/bridge content at the top, main diagrams/cards in the middle, and summary/hook content at the bottom.
- Decorative motifs may occupy margins and whitespace between blocks. They are not semantic blocks and should not receive markers.

Decorative layer rules:
- Decorations should occupy roughly 10-18% of the page and create rhythm without competing with the teaching content.
- Decorations must be low-contrast muted gray, pale teal, or muted brown only; never use pure marker colors.
- Decorations may overlap broad background space, but keep them away from every marker quiet zone by at least 40 px.
- Decorations must not contain required lecture labels, formulas, or explanations; all essential teaching content belongs inside marked semantic blocks.
- Prefer hand-drawn mathematical atmosphere: faint curves, small axes, dashed partition hints, soft arrows, bracket gestures, and margin notes without semantic importance.

Page plan and marker color binding:
${targetLines}

Content guidance:
- The slide should teach the title topic directly, using the planned region labels as the content of each block.
- Use concise Chinese labels and mathematical notation where useful.
- Make the page readable as a real teacher's notebook slide.
- Preserve the planned visual hierarchy: top bridge/title when present, main diagrams/cards in the middle, summary or hook at the bottom.`;
}

function writePlanAndPrompts() {
  const semanticMap = readSemanticMap();
  const plan = planForSemanticMap(semanticMap);
  const promptDir = path.join(EXPERIMENT_DIR, 'prompts');
  ensureDir(promptDir);
  fs.writeFileSync(path.join(EXPERIMENT_DIR, 'marker-plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
  for (const slide of plan.slides) {
    const fileName = `slide-${String(slide.order + 1).padStart(2, '0')}.txt`;
    fs.writeFileSync(path.join(promptDir, fileName), promptForSlide(slide));
  }
  console.log(`Wrote plan and ${plan.slides.length} prompts to ${EXPERIMENT_DIR}`);
}

function overlaySvg(report, info) {
  const rects = report.regions
    .filter((region) => region.recoveredSourceRect)
    .map((region) => {
      const [x, y, width, height] = region.recoveredSourceRect;
      const suffix = region.layoutStatus === 'layout-shift' ? ' shift' : region.status === 'fail' ? ' fail' : '';
      const label = `${region.order}. ${region.semanticId}${suffix}`;
      const labelY = Math.max(24, y - 12);
      return `<g>
  <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="none" stroke="${region.markerColor}" stroke-width="5"/>
  <rect x="${x}" y="${labelY - 24}" width="${Math.max(180, label.length * 11)}" height="26" fill="white" fill-opacity="0.86"/>
  <text x="${x + 7}" y="${labelY - 6}" font-family="Arial" font-size="18" fill="${region.markerColor}">${label}</text>
</g>`;
    })
    .join('\n');
  return `<svg width="${info.width}" height="${info.height}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
}

function markerImagePublicPath(slideOrder) {
  const slideNo = String(slideOrder + 1).padStart(2, '0');
  return `/generated-notebooks/${NOTEBOOK_ID}/marker-recovery-experiment/slide-${slideNo}-marker.png`;
}

function buildRecoveredHitMap(report) {
  return {
    notebookId: report.notebookId,
    source: 'marker-recovery-experiment',
    generatedAt: new Date().toISOString(),
    slides: report.slides
      .filter((slide) => slide.status !== 'missing-image')
      .map((slide) => ({
        order: slide.order,
        title: slide.title,
        image: markerImagePublicPath(slide.order),
        hitMap: {
          recoveryPolicy: {
            markerStyle: 'four-corner-only-color',
            acceptedStatuses: ['pass'],
          },
          regions: slide.regions
            .filter((region) => region.status === 'pass' && region.recoveredSourceRect && region.canvasRect)
            .map((region) => ({
              id: `${NOTEBOOK_ID}-s${String(slide.order + 1).padStart(2, '0')}-${region.semanticId}`,
              semanticId: region.semanticId,
              label: region.label,
              markerColor: region.markerColor,
              markerName: region.markerName,
              sourceRect: region.recoveredSourceRect,
              canvasRect: region.canvasRect,
              recovery: {
                strategy: region.recoveryStrategy,
                recoveredCornerCount: region.recoveredCornerCount,
                layoutStatus: region.layoutStatus,
                centerDistance: region.centerDistance,
                expectedRecoveredIou: region.expectedRecoveredIou,
              },
            })),
        },
      })),
  };
}

async function recoverOneSlide(planSlide, options = {}) {
  const slideNo = String(planSlide.order + 1).padStart(2, '0');
  const outputPrefix = options.outputPrefix ?? `slide-${slideNo}`;
  const imagePath = options.imagePath ?? path.join(EXPERIMENT_DIR, `slide-${slideNo}-marker.png`);
  if (!fs.existsSync(imagePath)) {
    return {
      order: planSlide.order,
      title: planSlide.title,
      imagePath,
      status: 'missing-image',
      regions: planSlide.regions.map((region) => ({
        ...region,
        status: 'missing-image',
      })),
    };
  }

  const { data, info } = await sharp(imagePath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const componentCache = new Map();
  const regions = planSlide.regions.map((region, regionIndex) => {
    const color = MARKER_COLORS[regionIndex % MARKER_COLORS.length];
    const expected = {
      left: (region.expectedCanvasRect[0] / CANVAS_WIDTH) * info.width,
      top: (region.expectedCanvasRect[1] / CANVAS_HEIGHT) * info.height,
      width: (region.expectedCanvasRect[2] / CANVAS_WIDTH) * info.width,
      height: (region.expectedCanvasRect[3] / CANVAS_HEIGHT) * info.height,
    };
    if (!componentCache.has(color.name)) {
      componentCache.set(color.name, componentsFor(data, info, color.match));
    }
    const allComponents = componentCache.get(color.name);
    const selected = selectedMarkerComponents(allComponents, expected);
    const searchBounds = {
      left: expected.left - Math.max(120, expected.width * 0.95),
      top: expected.top - Math.max(90, expected.height * 0.95),
      width: expected.width + Math.max(240, expected.width * 1.9),
      height: expected.height + Math.max(180, expected.height * 1.9),
    };
    const localPixelBBox = markerPixelsBBox(data, info, color.match, searchBounds);
    const allPixelBBox = markerPixelsBBox(data, info, color.match);
    const recoveredSourceRect = bboxFromComponents(selected.components);
    const recoveredCanvasRect = recoveredSourceRect ? toCanvasRect(recoveredSourceRect, info) : null;
    const distance = recoveredCanvasRect ? round1(centerDistance(region.expectedCanvasRect, recoveredCanvasRect)) : null;
    const iou = recoveredCanvasRect ? round1(intersectionOverUnion(region.expectedCanvasRect, recoveredCanvasRect)) : null;
    const recoveredArea = recoveredCanvasRect ? rectArea(recoveredCanvasRect) : 0;
    const markerPixelCount = allPixelBBox?.area ?? 0;
    const lowPixelHugeBox = recoveredCanvasRect && markerPixelCount < 100 && recoveredArea > CANVAS_WIDTH * CANVAS_HEIGHT * 0.18;
    const markerMissing = selected.cornerHits.length !== 4 || (!selected.components.length && markerPixelCount < 80);
    const recoveryStatus = !recoveredCanvasRect || markerMissing || lowPixelHugeBox ? 'marker-missing' : 'recovered';
    const layoutStatus =
      !recoveredCanvasRect
        ? 'unavailable'
        : distance !== null && (distance <= 190 || (iou !== null && iou >= 0.12))
          ? 'near-plan'
          : 'layout-shift';
    const status = recoveryStatus === 'recovered' ? 'pass' : 'fail';
    return {
      ...region,
      markerComponentCount: selected.components.length,
      allMarkerComponentCount: allComponents.length,
      markerPixelCount,
      localMarkerPixelCount: localPixelBBox?.area ?? 0,
      recoveredSourceRect,
      recoveredCanvasRect,
      centerDistance: distance,
      expectedRecoveredIou: iou,
      recoveryStatus,
      layoutStatus,
      recoveryStrategy: selected.strategy,
      recoveredCornerCount: selected.cornerHits.length,
      recoveredCorners: selected.cornerHits.map((hit) => ({
        corner: hit.corner,
        distance: hit.distance,
        sourceRect: [
          hit.component.minX,
          hit.component.minY,
          hit.component.width,
          hit.component.height,
        ],
      })),
      status,
      canvasRect: recoveredCanvasRect ? canvasRectObject(recoveredCanvasRect) : null,
      markerComponents: selected.components.map((component) => [
        component.minX,
        component.minY,
        component.width,
        component.height,
        component.area,
      ]),
    };
  });

  const report = {
    order: planSlide.order,
    title: planSlide.title,
    imagePath,
    sourceSize: { width: info.width, height: info.height },
    status: regions.every((region) => region.status === 'pass') ? 'pass' : regions.some((region) => region.status === 'fail') ? 'fail' : 'warn',
    regions,
  };

  const overlayPath = path.join(EXPERIMENT_DIR, `${outputPrefix}-overlay.png`);
  await sharp(imagePath)
    .composite([{ input: Buffer.from(overlaySvg(report, info)), top: 0, left: 0 }])
    .png()
    .toFile(overlayPath);
  report.overlayPath = overlayPath;
  return report;
}

async function recoverAll() {
  const planPath = path.join(EXPERIMENT_DIR, 'marker-plan.json');
  if (!fs.existsSync(planPath)) writePlanAndPrompts();
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  ensureDir(EXPERIMENT_DIR);
  const slides = [];
  for (const slide of plan.slides) {
    slides.push(await recoverOneSlide(slide));
  }
  const totals = slides.reduce(
    (memo, slide) => {
      for (const region of slide.regions) {
        memo.regionTotal += 1;
        if (region.status === 'missing-image') {
          memo.missingImageRegions += 1;
          continue;
        }
        memo[region.status] += 1;
        if (region.recoveryStatus === 'recovered') memo.recovered += 1;
        if (region.recoveryStatus === 'marker-missing') memo.markerMissing += 1;
        if (region.layoutStatus === 'layout-shift') memo.layoutShift += 1;
      }
      if (slide.status === 'missing-image') memo.missingSlides += 1;
      return memo;
    },
    {
      regionTotal: 0,
      pass: 0,
      warn: 0,
      fail: 0,
      recovered: 0,
      markerMissing: 0,
      layoutShift: 0,
      missingImageRegions: 0,
      missingSlides: 0,
    },
  );
  const report = {
    notebookId: plan.notebookId,
    experimentDir: EXPERIMENT_DIR,
    totals,
    slides,
  };
  fs.writeFileSync(path.join(EXPERIMENT_DIR, 'recovery-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(
    path.join(EXPERIMENT_DIR, 'marker-recovered-hit-map.generated.json'),
    `${JSON.stringify(buildRecoveredHitMap(report), null, 2)}\n`,
  );
  console.log(JSON.stringify(totals, null, 2));
}

async function recoverSingleImage() {
  const slideArgIndex = process.argv.indexOf('--slide');
  const imageArgIndex = process.argv.indexOf('--image');
  const outputArgIndex = process.argv.indexOf('--output-prefix');
  if (slideArgIndex === -1 || imageArgIndex === -1) {
    console.log(
      'Usage: node scripts/notebooks/validate-mat136-marker-recovery.mjs --recover-image --slide <1-based-slide> --image <path> [--output-prefix <name>]',
    );
    return;
  }
  const slideNumber = Number(process.argv[slideArgIndex + 1]);
  const imagePath = process.argv[imageArgIndex + 1];
  const outputPrefix = outputArgIndex === -1 ? `slide-${String(slideNumber).padStart(2, '0')}-custom` : process.argv[outputArgIndex + 1];
  const planPath = path.join(EXPERIMENT_DIR, 'marker-plan.json');
  if (!fs.existsSync(planPath)) writePlanAndPrompts();
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const slide = plan.slides.find((item) => item.order === slideNumber - 1);
  if (!slide) throw new Error(`Cannot find slide ${slideNumber} in ${planPath}`);
  const report = await recoverOneSlide(slide, { imagePath, outputPrefix });
  const reportPath = path.join(EXPERIMENT_DIR, `${outputPrefix}-recovery-report.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  const totals = report.regions.reduce(
    (memo, region) => {
      memo[region.status] += 1;
      if (region.recoveryStatus === 'recovered') memo.recovered += 1;
      if (region.recoveryStatus === 'marker-missing') memo.markerMissing += 1;
      if (region.layoutStatus === 'layout-shift') memo.layoutShift += 1;
      if (region.recoveryStrategy === 'corner-only-components') memo.cornerOnly += 1;
      return memo;
    },
    { pass: 0, fail: 0, recovered: 0, markerMissing: 0, layoutShift: 0, cornerOnly: 0 },
  );
  console.log(
    JSON.stringify(
      {
        reportPath,
        overlayPath: report.overlayPath,
        status: report.status,
        totals,
      },
      null,
      2,
    ),
  );
}

if (process.argv.includes('--prepare')) {
  writePlanAndPrompts();
} else if (process.argv.includes('--recover')) {
  await recoverAll();
} else if (process.argv.includes('--recover-image')) {
  await recoverSingleImage();
} else {
  console.log('Usage: node scripts/notebooks/validate-mat136-marker-recovery.mjs --prepare|--recover|--recover-image');
}
