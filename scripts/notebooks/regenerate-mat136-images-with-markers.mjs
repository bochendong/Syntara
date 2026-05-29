#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;
const DEFAULT_SOURCE_WIDTH = 1600;
const DEFAULT_SOURCE_HEIGHT = 900;
const PUBLIC_ROOT = path.join('public', 'generated-notebooks');
const PUBLIC_URL_ROOT = '/generated-notebooks';
const STAGING_ROOT = path.join('tmp', 'mat136-imagegen-regeneration-20260528');
const HOTSPOT_PATH = 'M 0 0 L 200 0 L 200 200 L 0 200 Z';

const NOTEBOOKS = [
  'nb-mat136-riemann-integral-week1-20260518135718',
  'nb-mat136-definite-integral-week1-20260518150500',
  'nb-mat136-substitution-week2-20260518183518',
  'nb-mat136-inverse-substitution-week2-v2-20260519174000',
  'nb-mat136-integration-by-parts-week2-v2-20260519151624',
  'nb-mat136-area-volume-imagegen-20260521',
];

const OLD_NOTEBOOK_DIRS = [
  'nb-mat136-riemann-sums-week1-20260518162551',
  'nb-mat136-inverse-substitution-week2-20260519011900',
  'nb-mat136-integration-by-parts-week2-20260519142600',
];

const MARKER_COLORS = [
  { name: 'red', hex: '#ff0000', match: (r, g, b) => r > 180 && g < 85 && b < 85 },
  { name: 'lime', hex: '#00ff00', match: (r, g, b) => g > 170 && r < 90 && b < 95 },
  { name: 'blue', hex: '#0048ff', match: (r, g, b) => b > 145 && r < 90 && g < 140 },
  { name: 'cyan', hex: '#00ffff', match: (r, g, b) => g > 165 && b > 165 && r < 95 },
  { name: 'magenta', hex: '#ff00ff', match: (r, g, b) => r > 170 && b > 130 && g < 95 },
  { name: 'yellow', hex: '#ffff00', match: (r, g, b) => r > 170 && g > 170 && b < 110 },
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function writeNormalizedSlideImage(inputPath, outPath) {
  ensureDir(path.dirname(outPath));
  const tmpPath = `${outPath}.tmp-${process.pid}.png`;
  await sharp(inputPath)
    .resize(DEFAULT_SOURCE_WIDTH, DEFAULT_SOURCE_HEIGHT, {
      fit: 'contain',
      background: '#ffffff',
    })
    .png()
    .toFile(tmpPath);
  fs.renameSync(tmpPath, outPath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function slideNo(slide) {
  return String((slide.order ?? 0) + 1).padStart(2, '0');
}

function slideImagePublicPath(notebookId, slide) {
  return `${PUBLIC_URL_ROOT}/${notebookId}/slide-${slideNo(slide)}.png`;
}

function slideImageFsPath(notebookId, slide) {
  return path.join(PUBLIC_ROOT, notebookId, `slide-${slideNo(slide)}.png`);
}

function promptPath(notebookId, slide) {
  return path.join(STAGING_ROOT, 'prompts', notebookId, `slide-${slideNo(slide)}.txt`);
}

function rawPath(notebookId, slide) {
  return path.join(STAGING_ROOT, 'raw-marker', notebookId, `slide-${slideNo(slide)}-marker.png`);
}

function basePath(notebookId, slide) {
  return path.join(STAGING_ROOT, 'base-clean', notebookId, `slide-${slideNo(slide)}.png`);
}

function cleanPath(notebookId, slide) {
  return path.join(STAGING_ROOT, 'clean', notebookId, `slide-${slideNo(slide)}.png`);
}

function reportPath(notebookId, slide) {
  return path.join(STAGING_ROOT, 'reports', notebookId, `slide-${slideNo(slide)}-report.json`);
}

function overlayPath(notebookId, slide) {
  return path.join(STAGING_ROOT, 'overlays', notebookId, `slide-${slideNo(slide)}-overlay.png`);
}

function sourceRectToCanvasRect(rect, sourceSize = { width: DEFAULT_SOURCE_WIDTH, height: DEFAULT_SOURCE_HEIGHT }) {
  const [left, top, width, height] = rect.map(Number);
  return {
    left: round1((left / sourceSize.width) * CANVAS_WIDTH),
    top: round1((top / sourceSize.height) * CANVAS_HEIGHT),
    width: round1((width / sourceSize.width) * CANVAS_WIDTH),
    height: round1((height / sourceSize.height) * CANVAS_HEIGHT),
  };
}

function rectObjectToArray(rect) {
  return [round1(rect.left), round1(rect.top), round1(rect.width), round1(rect.height)];
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

function canvasRectObject(rect) {
  return {
    left: rect[0],
    top: rect[1],
    width: rect[2],
    height: rect[3],
  };
}

function normalizeRegions(slide) {
  if (Array.isArray(slide.hitMap)) {
    return slide.hitMap.map((region, index) => {
      const sourceRect = region.rect ?? region.sourceRect;
      const sourceSize = region.sourceSize ?? { width: DEFAULT_SOURCE_WIDTH, height: DEFAULT_SOURCE_HEIGHT };
      const canvasRect = region.canvasRect ?? sourceRectToCanvasRect(sourceRect, sourceSize);
      return {
        order: index + 1,
        id: region.id,
        semanticId: region.semanticId ?? region.id?.split('-').at(-1) ?? `region-${index + 1}`,
        label: region.label ?? `区域 ${index + 1}`,
        speech: region.speech ?? '',
        sourceRect,
        canvasRect: rectObjectToArray(canvasRect),
      };
    });
  }

  const hitMap = slide.hitMap ?? {};
  return (hitMap.regions ?? []).map((region, index) => ({
    order: index + 1,
    id: region.id,
    semanticId: region.semanticId ?? region.id ?? `region-${index + 1}`,
    label: region.label ?? `区域 ${index + 1}`,
    speech: region.speech ?? '',
    sourceRect: region.sourceRect,
    canvasRect: rectObjectToArray(region.canvasRect),
  }));
}

function loadPlan() {
  const planPath = path.join(STAGING_ROOT, 'plan.json');
  if (!fs.existsSync(planPath)) prepare();
  return readJson(planPath);
}

function loadNotebookMaps() {
  return NOTEBOOKS.map((notebookId) => {
    const filePath = path.join(PUBLIC_ROOT, notebookId, 'semantic-hit-map.json');
    return { notebookId, filePath, data: readJson(filePath) };
  });
}

function layoutHint(region) {
  const [left, top, width, height] = region.canvasRect;
  const centerX = left + width / 2;
  const centerY = top + height / 2;
  const horizontal = centerX < 330 ? 'left' : centerX > 670 ? 'right' : 'center';
  const vertical = centerY < 160 ? 'top' : centerY > 410 ? 'bottom' : 'middle';
  return `${vertical}-${horizontal}`;
}

function compactText(value, max = 120) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function promptForSlide(notebookId, slide) {
  const regions = normalizeRegions(slide);
  const markerCount = regions.length * 4;
  const colorLines = regions
    .map((region, index) => {
      const color = MARKER_COLORS[index];
      const speech = compactText(region.speech || slide.teachingIntent || '', 90);
      const contentHint = speech ? `; teaching hint: ${speech}` : '';
      return `${region.order}. ${region.semanticId} / ${region.label}: marker ${color.hex}; planned area ${layoutHint(
        region,
      )}; draw exactly four isolated ${color.hex} corner squares at this semantic block's outer corners${contentHint}.`;
    })
    .join('\n');

  const markerSection =
    regions.length > 0
      ? `Marker rules:
- Exactly ${markerCount} pure-color calibration squares total: ${regions.length} semantic regions x 4 corners.
- Marker correctness is the highest priority. Decoration is optional; missing or misplaced markers are not acceptable.
- For each planned region below, draw exactly four small filled square markers: top-left, top-right, bottom-left, bottom-right.
- Markers must be isolated corner dots/squares only. Do NOT connect them with colored lines, colored borders, colored brackets, colored frames, colored guide lines, colored underlines, or a colored rectangle.
- Marker squares are solid color, about 16 px on a 1600x900 image, with no text, no outline, no shadow.
- The four markers for one region must use exactly that region's marker color.
- Put the markers at the outer corners of the whole semantic block, not around an inner equation, graph, card, or decorative border.
- Do not place markers on the outer canvas border. Keep every marker visually attached to the semantic block it identifies.
- Leave at least 40 px of clean graph-paper quiet zone around every marker; no handwriting, formulas, graph lines, arrows, or fills may touch a marker.
- Keep each region's visible content inside its marker rectangle with comfortable padding.
- The semantic block rectangle is invisible. Do not draw a visual rectangle around it.
- Pure marker colors may appear only in these tiny calibration squares; never use those pure colors in text, arrows, graphs, card outlines, or decorations.
- Do not use decorative corner dots, square bullets, or small isolated colored squares that could be mistaken for fiducial markers.`
      : `Marker rules:
- This slide has no semantic hotspot regions. Do not draw calibration markers on this slide.
- Do not use pure red, pure lime, pure blue, pure cyan, pure magenta, or pure yellow.`;

  const planSection =
    regions.length > 0
      ? `Page plan and marker color binding:
${colorLines}`
      : 'Page plan: create a clean cover or transition slide with no markers.';

  return `Use case: scientific-educational
Asset type: 16:9 hand-drawn MAT 136 course notebook slide
Primary request: Regenerate this MAT 136 slide as a polished common classroom hand-drawn notebook page. The final page should feel like a real calculus lecture board, not a sterile worksheet.

Notebook id: ${notebookId}
Slide ${slideNo(slide)} title: "${slide.title}"
Teaching intent: ${compactText(slide.teachingIntent ?? '', 160)}

Style rules:
- White graph-paper notebook background with faint light-gray grid.
- Common college-course hand-drawn style: black marker text, deep teal graphs, pale teal fills, readable formulas, and clean spacing.
- Normal content may use only black, dark gray, deep teal, pale teal, and very muted brown for arrows.
- Add restrained notebook-style mathematical decoration so the page feels alive: faint margin scribbles, ghosted integral signs, subtle sigma marks, small axis ticks, soft arrows, graph-paper tape shadows, and light curve echoes.
- Do NOT use pure red, pure lime, pure blue, pure cyan, pure magenta, or pure yellow anywhere except the fiducial marker squares requested below.
- No photorealism, no UI chrome, no watermark, no decorative stock art.

${markerSection}

Layout rules for easier recovery:
- Treat each planned region as one clear axis-aligned rectangular block.
- Keep blocks in the requested planned area; do not move a block to a different side of the page unless absolutely necessary for readability.
- Do not split one semantic region into multiple separated islands. If a region contains a graph plus labels, keep them inside the same marker rectangle.
- Do not overlap marker rectangles. Keep at least 64 px of empty space between adjacent semantic blocks; target 80 px when possible.
- The top title/bridge block must be visually separated from the content below it: keep at least 96 px of empty graph-paper vertical gutter between the bottom edge of the title/bridge marker rectangle and the top edge of the first middle-content marker rectangle on the final image. Prefer 120 px if the page still reads well.
- Main content must start clearly below the title/bridge band. Do not let title markers sit on the same row as the first diagrams/cards.
- Decorative motifs may occupy margins and whitespace between blocks. They are not semantic blocks and should not receive markers.

Decorative layer rules:
- Decorations should occupy roughly 10-18% of the page and create rhythm without competing with the teaching content.
- Decorations must be low-contrast muted gray, pale teal, or muted brown only; never use pure marker colors.
- Decorations may overlap broad background space, but keep them away from every marker quiet zone by at least 40 px.
- Decorations must not contain required lecture labels, formulas, or explanations; all essential teaching content belongs inside marked semantic blocks.

${planSection}

Content guidance:
- Teach the slide title directly, using the planned region labels as the visible conceptual structure.
- Use concise Chinese labels and mathematical notation where useful.
- Make the page readable as a real teacher's notebook slide.
- Preserve the visual hierarchy: title/bridge at top, main diagrams/cards in the middle, summary or hook at the bottom.`;
}

function prepare() {
  ensureDir(STAGING_ROOT);
  const notebooks = loadNotebookMaps();
  const plan = {
    createdAt: new Date().toISOString(),
    stagingRoot: STAGING_ROOT,
    notebooks: notebooks.map(({ notebookId, data }) => ({
      notebookId,
      slides: data.slides.map((slide) => ({
        order: slide.order,
        title: slide.title,
        image: slideImagePublicPath(notebookId, slide),
        promptPath: promptPath(notebookId, slide),
        rawPath: rawPath(notebookId, slide),
        cleanPath: cleanPath(notebookId, slide),
        reportPath: reportPath(notebookId, slide),
        overlayPath: overlayPath(notebookId, slide),
        regions: normalizeRegions(slide),
      })),
    })),
  };

  writeJson(path.join(STAGING_ROOT, 'plan.json'), plan);
  for (const { notebookId, data } of notebooks) {
    for (const slide of data.slides) {
      const out = promptPath(notebookId, slide);
      ensureDir(path.dirname(out));
      fs.writeFileSync(out, promptForSlide(notebookId, slide));
    }
  }
  console.log(`Prepared ${plan.notebooks.reduce((sum, nb) => sum + nb.slides.length, 0)} prompts in ${STAGING_ROOT}`);
}

function allPlanSlides(plan) {
  return plan.notebooks.flatMap((notebook) =>
    notebook.slides.map((slide) => ({ notebookId: notebook.notebookId, slide })),
  );
}

function nextPending() {
  const plan = loadPlan();
  return allPlanSlides(plan).find(({ notebookId, slide }) => {
    if (!fs.existsSync(rawPath(notebookId, slide))) return true;
    const reportFile = reportPath(notebookId, slide);
    if (!fs.existsSync(reportFile)) return true;
    return readJson(reportFile).status !== 'pass';
  });
}

function findLatestGeneratedImage() {
  const root = path.join(process.env.HOME ?? '.', '.codex', 'generated_images');
  const matches = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.png$/i.test(entry.name)) matches.push({ full, mtimeMs: fs.statSync(full).mtimeMs });
    }
  }
  walk(root);
  matches.sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (!matches.length) throw new Error(`No generated PNGs found under ${root}`);
  return matches[0].full;
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
    component.width <= 72 &&
    component.height <= 72 &&
    aspect >= 0.35 &&
    aspect <= 2.85 &&
    fillRatio >= 0.16
  );
}

function componentsFor(data, info, match) {
  const mask = new Uint8Array(info.width * info.height);
  for (let i = 0, p = 0; i < data.length; i += 3, p += 1) {
    if (match(data[i], data[i + 1], data[i + 2])) mask[p] = 1;
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
      if (area >= 35 && width >= 6 && height >= 6 && aspect >= 0.02 && aspect <= 50) {
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

function expandedRectContains(rect, component, scale = 0.65) {
  const padX = Math.max(90, rect.width * scale);
  const padY = Math.max(70, rect.height * scale);
  const center = componentCenter(component);
  return (
    center.x >= rect.left - padX &&
    center.x <= rect.left + rect.width + padX &&
    center.y >= rect.top - padY &&
    center.y <= rect.top + rect.height + padY
  );
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
  const maxCornerDistance = Math.max(54, Math.min(expected.width, expected.height) * 0.38);
  const used = new Set();
  const cornerHits = [];

  for (const corner of expectedCorners(expected)) {
    let best = null;
    for (const component of compactComponents) {
      if (used.has(component)) continue;
      const center = componentCenter(component);
      const distance = Math.hypot(center.x - corner.x, center.y - corner.y);
      if (distance > maxCornerDistance) continue;
      if (!best || distance < best.distance) best = { component, distance };
    }
    if (best) {
      used.add(best.component);
      cornerHits.push({ corner: corner.name, distance: round1(best.distance), component: best.component });
    }
  }

  return { cornerHits, components: cornerHits.map((hit) => hit.component) };
}

function cornerHitsFromFourComponents(components) {
  const bbox = bboxFromComponents(components);
  if (!bbox) return [];
  const centerX = bbox[0] + bbox[2] / 2;
  const centerY = bbox[1] + bbox[3] / 2;
  return components.map((component) => {
    const center = componentCenter(component);
    const vertical = center.y < centerY ? 'top' : 'bottom';
    const horizontal = center.x < centerX ? 'left' : 'right';
    return { corner: `${vertical}-${horizontal}`, distance: 0, component };
  });
}

function bestFourCornerComponents(compactComponents, expected) {
  if (compactComponents.length < 4) return null;
  let best = null;
  for (let a = 0; a < compactComponents.length - 3; a += 1) {
    for (let b = a + 1; b < compactComponents.length - 2; b += 1) {
      for (let c = b + 1; c < compactComponents.length - 1; c += 1) {
        for (let d = c + 1; d < compactComponents.length; d += 1) {
          const components = [compactComponents[a], compactComponents[b], compactComponents[c], compactComponents[d]];
          const hits = cornerHitsFromFourComponents(components);
          if (new Set(hits.map((hit) => hit.corner)).size !== 4) continue;
          const bbox = bboxFromComponents(components);
          const area = bbox[2] * bbox[3];
          const bboxCenter = { x: bbox[0] + bbox[2] / 2, y: bbox[1] + bbox[3] / 2 };
          const expectedCenter = {
            x: expected.left + expected.width / 2,
            y: expected.top + expected.height / 2,
          };
          const centerDistance = Math.hypot(bboxCenter.x - expectedCenter.x, bboxCenter.y - expectedCenter.y);
          const score = area + centerDistance * 900;
          if (!best || score < best.score) best = { components, hits, score };
        }
      }
    }
  }
  return best;
}

function selectedMarkerComponents(allComponents, expected) {
  const compactComponents = allComponents.filter(compactCornerMarker);
  if (compactComponents.length >= 4) {
    const best = bestFourCornerComponents(compactComponents, expected);
    if (best) {
      return {
        components: best.components,
        cleanComponents: compactComponents,
        strategy: compactComponents.length === 4 ? 'global-four-corner-components' : 'best-four-of-extra-components',
        cornerHits: best.hits,
      };
    }
    return {
      components: compactComponents,
      cleanComponents: compactComponents,
      strategy: 'global-four-corner-components',
      cornerHits: cornerHitsFromFourComponents(compactComponents),
    };
  }
  const cornerSelection = selectedCornerMarkers(allComponents, expected);
  return {
    components: cornerSelection.components,
    cleanComponents: compactComponents,
    strategy: cornerSelection.components.length === 4 ? 'near-plan-corner-components' : 'corner-incomplete',
    cornerHits: cornerSelection.cornerHits,
  };
}

function markerOverlaySvg(report, info) {
  const rects = report.regions
    .filter((region) => region.recoveredSourceRect)
    .map((region) => {
      const [x, y, width, height] = region.recoveredSourceRect;
      const label = `${region.order}. ${region.semanticId}`;
      const labelY = Math.max(24, y - 12);
      return `<g>
  <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="none" stroke="${region.markerColor}" stroke-width="5"/>
  <rect x="${x}" y="${labelY - 24}" width="${Math.max(180, label.length * 11)}" height="26" fill="white" fill-opacity="0.86"/>
  <text x="${x + 7}" y="${labelY - 6}" font-family="Arial" font-size="18" fill="${region.markerColor}">${label}</text>
</g>`;
    })
    .join('\n');
  return `<svg width="${info.width}" height="${info.height}" viewBox="0 0 ${info.width} ${info.height}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
}

function isAnyMarkerPixel(r, g, b) {
  return MARKER_COLORS.some((color) => color.match(r, g, b));
}

function median(values, fallback = 248) {
  if (!values.length) return fallback;
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

async function writeCleanImage(imagePath, report, outPath) {
  const { data, info } = await sharp(imagePath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);

  function fillRect(x0, y0, width, height) {
    const pad = 6;
    const x1 = Math.max(0, Math.floor(x0 - pad));
    const y1 = Math.max(0, Math.floor(y0 - pad));
    const x2 = Math.min(info.width - 1, Math.ceil(x0 + width + pad));
    const y2 = Math.min(info.height - 1, Math.ceil(y0 + height + pad));
    const samplePad = 22;
    const rs = [];
    const gs = [];
    const bs = [];
    for (let y = Math.max(0, y1 - samplePad); y <= Math.min(info.height - 1, y2 + samplePad); y += 1) {
      for (let x = Math.max(0, x1 - samplePad); x <= Math.min(info.width - 1, x2 + samplePad); x += 1) {
        if (x >= x1 && x <= x2 && y >= y1 && y <= y2) continue;
        const i = (y * info.width + x) * 3;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
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
        const i = (y * info.width + x) * 3;
        out[i] = r;
        out[i + 1] = g;
        out[i + 2] = b;
      }
    }
  }

  for (const region of report.regions) {
    const components = region.cleanMarkerComponents ?? region.markerComponents ?? [];
    for (const [x, y, width, height] of components) fillRect(x, y, width, height);
  }

  ensureDir(path.dirname(outPath));
  await sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toFile(outPath);
}

async function recoverSlide(notebookId, slide) {
  const imagePath = rawPath(notebookId, slide);
  if (!fs.existsSync(imagePath)) throw new Error(`Missing raw marker image: ${imagePath}`);
  const regions = slide.regions ?? normalizeRegions(slide);
  const { data, info } = await sharp(imagePath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const componentCache = new Map();

  const recoveredRegions = regions.map((region, index) => {
    const color = MARKER_COLORS[index];
    const expected = {
      left: (region.canvasRect[0] / CANVAS_WIDTH) * info.width,
      top: (region.canvasRect[1] / CANVAS_HEIGHT) * info.height,
      width: (region.canvasRect[2] / CANVAS_WIDTH) * info.width,
      height: (region.canvasRect[3] / CANVAS_HEIGHT) * info.height,
    };
    if (!componentCache.has(color.name)) {
      componentCache.set(color.name, componentsFor(data, info, color.match));
    }
    const allComponents = componentCache.get(color.name);
    const selected = selectedMarkerComponents(allComponents, expected);
    const recoveredSourceRect = bboxFromComponents(selected.components);
    const recoveredCanvasRect = recoveredSourceRect ? toCanvasRect(recoveredSourceRect, info) : null;
    const status = selected.cornerHits.length === 4 && recoveredSourceRect ? 'pass' : 'fail';
    return {
      ...region,
      markerColor: color.hex,
      markerName: color.name,
      status,
      recoveryStrategy: selected.strategy,
      allMarkerComponentCount: allComponents.length,
      markerComponentCount: selected.components.length,
      recoveredCornerCount: selected.cornerHits.length,
      recoveredSourceRect,
      recoveredCanvasRect,
      markerComponents: selected.components.map((component) => [
        component.minX,
        component.minY,
        component.width,
        component.height,
        component.area,
      ]),
      cleanMarkerComponents: selected.cleanComponents.map((component) => [
        component.minX,
        component.minY,
        component.width,
        component.height,
        component.area,
      ]),
      recoveredCorners: selected.cornerHits.map((hit) => ({
        corner: hit.corner,
        distance: hit.distance,
        sourceRect: [hit.component.minX, hit.component.minY, hit.component.width, hit.component.height],
      })),
    };
  });

  const report = {
    notebookId,
    order: slide.order,
    title: slide.title,
    imagePath,
    cleanPath: cleanPath(notebookId, slide),
    finalPath: slideImageFsPath(notebookId, slide),
    sourceSize: { width: info.width, height: info.height },
    status: recoveredRegions.every((region) => region.status === 'pass') ? 'pass' : 'fail',
    regions: recoveredRegions,
  };

  if (!regions.length) {
    report.status = 'pass';
    ensureDir(path.dirname(cleanPath(notebookId, slide)));
    fs.copyFileSync(imagePath, cleanPath(notebookId, slide));
  } else {
    await writeCleanImage(imagePath, report, cleanPath(notebookId, slide));
  }

  ensureDir(path.dirname(reportPath(notebookId, slide)));
  writeJson(reportPath(notebookId, slide), report);
  ensureDir(path.dirname(overlayPath(notebookId, slide)));
  await sharp(imagePath)
    .composite([{ input: Buffer.from(markerOverlaySvg(report, info)), top: 0, left: 0 }])
    .png()
    .toFile(overlayPath(notebookId, slide));
  return report;
}

function plannedMarkerSvg(slide, info) {
  const markerSize = Math.max(10, Math.round(Math.min(info.width, info.height) * 0.014));
  const rects = (slide.regions ?? []).flatMap((region, index) => {
    const color = MARKER_COLORS[index];
    const [left, top, width, height] = region.canvasRect;
    const x = (left / CANVAS_WIDTH) * info.width;
    const y = (top / CANVAS_HEIGHT) * info.height;
    const w = (width / CANVAS_WIDTH) * info.width;
    const h = (height / CANVAS_HEIGHT) * info.height;
    const points = [
      [x, y],
      [x + w - markerSize, y],
      [x, y + h - markerSize],
      [x + w - markerSize, y + h - markerSize],
    ];
    return points.map(
      ([px, py]) =>
        `<rect x="${round1(px)}" y="${round1(py)}" width="${markerSize}" height="${markerSize}" fill="${color.hex}"/>`,
    );
  });
  return `<svg width="${info.width}" height="${info.height}" viewBox="0 0 ${info.width} ${info.height}" xmlns="http://www.w3.org/2000/svg">${rects.join('\n')}</svg>`;
}

async function writePlannedMarkerImage(notebookId, slide) {
  const base = basePath(notebookId, slide);
  const raw = rawPath(notebookId, slide);
  if (!fs.existsSync(base)) throw new Error(`Missing base image: ${base}`);
  const meta = await sharp(base).metadata();
  const info = { width: meta.width, height: meta.height };
  ensureDir(path.dirname(raw));
  await sharp(base)
    .composite([{ input: Buffer.from(plannedMarkerSvg(slide, info)), top: 0, left: 0 }])
    .png()
    .toFile(raw);
}

async function recoverAll() {
  const plan = loadPlan();
  const reports = [];
  for (const { notebookId, slide } of allPlanSlides(plan)) {
    if (!fs.existsSync(rawPath(notebookId, slide))) {
      reports.push({ notebookId, order: slide.order, title: slide.title, status: 'missing' });
      continue;
    }
    reports.push(await recoverSlide(notebookId, slide));
  }
  const summary = summarizeReports(reports);
  writeJson(path.join(STAGING_ROOT, 'recovery-summary.json'), { ...summary, reports });
  console.log(JSON.stringify(summary, null, 2));
}

function summarizeReports(reports) {
  const total = reports.length;
  const pass = reports.filter((report) => report.status === 'pass').length;
  const missing = reports.filter((report) => report.status === 'missing').length;
  const fail = total - pass - missing;
  const regionTotal = reports.reduce((sum, report) => sum + (report.regions?.length ?? 0), 0);
  const regionPass = reports.reduce(
    (sum, report) => sum + (report.regions?.filter((region) => region.status === 'pass').length ?? 0),
    0,
  );
  return { total, pass, fail, missing, regionTotal, regionPass };
}

async function registerLatest() {
  const pending = nextPending();
  if (!pending) {
    console.log('No pending slides.');
    return;
  }
  const latest = findLatestGeneratedImage();
  const out = rawPath(pending.notebookId, pending.slide);
  ensureDir(path.dirname(out));
  fs.copyFileSync(latest, out);
  const report = await recoverSlide(pending.notebookId, pending.slide);
  console.log(
    JSON.stringify(
      {
        copiedFrom: latest,
        rawPath: out,
        cleanPath: cleanPath(pending.notebookId, pending.slide),
        reportPath: reportPath(pending.notebookId, pending.slide),
        status: report.status,
        regions: report.regions.length,
        passedRegions: report.regions.filter((region) => region.status === 'pass').length,
        next: nextPending()
          ? {
              notebookId: nextPending().notebookId,
              slide: nextPending().slide.order + 1,
              promptPath: promptPath(nextPending().notebookId, nextPending().slide),
            }
          : null,
      },
      null,
      2,
    ),
  );
}

async function registerLatestClean() {
  const pending = nextPending();
  if (!pending) {
    console.log('No pending slides.');
    return;
  }
  const latest = findLatestGeneratedImage();
  const base = basePath(pending.notebookId, pending.slide);
  await writeNormalizedSlideImage(latest, base);
  await writePlannedMarkerImage(pending.notebookId, pending.slide);
  const report = await recoverSlide(pending.notebookId, pending.slide);
  console.log(
    JSON.stringify(
      {
        copiedFrom: latest,
        basePath: base,
        rawPath: rawPath(pending.notebookId, pending.slide),
        cleanPath: cleanPath(pending.notebookId, pending.slide),
        reportPath: reportPath(pending.notebookId, pending.slide),
        status: report.status,
        regions: report.regions.length,
        passedRegions: report.regions.filter((region) => region.status === 'pass').length,
        next: nextPending()
          ? {
              notebookId: nextPending().notebookId,
              slide: nextPending().slide.order + 1,
              promptPath: promptPath(nextPending().notebookId, nextPending().slide),
            }
          : null,
      },
      null,
      2,
    ),
  );
}

async function normalizeExisting() {
  const plan = loadPlan();
  const reports = [];
  for (const { notebookId, slide } of allPlanSlides(plan)) {
    const base = basePath(notebookId, slide);
    const seed = fs.existsSync(base) ? base : cleanPath(notebookId, slide);
    if (!fs.existsSync(seed)) throw new Error(`Missing base or clean image for ${notebookId} slide ${slide.order + 1}`);
    await writeNormalizedSlideImage(seed, base);
    await writePlannedMarkerImage(notebookId, slide);
    reports.push(await recoverSlide(notebookId, slide));
  }
  const summary = summarizeReports(reports);
  writeJson(path.join(STAGING_ROOT, 'recovery-summary.json'), { ...summary, reports });
  console.log(JSON.stringify(summary, null, 2));
}

function assertAllPassed(plan) {
  const missing = [];
  const failed = [];
  for (const { notebookId, slide } of allPlanSlides(plan)) {
    const file = reportPath(notebookId, slide);
    if (!fs.existsSync(file)) {
      missing.push(`${notebookId} slide ${slide.order + 1}`);
      continue;
    }
    const report = readJson(file);
    if (report.status !== 'pass') failed.push(`${notebookId} slide ${slide.order + 1}: ${report.status}`);
  }
  if (missing.length || failed.length) {
    throw new Error(`Cannot continue. Missing reports: ${missing.join(', ') || 'none'}; failed: ${failed.join(', ') || 'none'}`);
  }
}

function applyRecoveredHitMap(slide, report) {
  slide.image = slideImagePublicPath(report.notebookId, slide);
  if (Array.isArray(slide.hitMap)) {
    for (const [index, region] of slide.hitMap.entries()) {
      const recovered = report.regions[index];
      if (!recovered) continue;
      region.rect = recovered.recoveredSourceRect;
      region.sourceRect = recovered.recoveredSourceRect;
      region.canvasRect = canvasRectObject(recovered.recoveredCanvasRect);
      region.sourceSize = report.sourceSize;
    }
    return;
  }

  if (!slide.hitMap) slide.hitMap = {};
  slide.hitMap.version = slide.hitMap.version ?? 1;
  slide.hitMap.sourceSize = report.sourceSize;
  slide.hitMap.canvasSize = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
  for (const [index, region] of (slide.hitMap.regions ?? []).entries()) {
    const recovered = report.regions[index];
    if (!recovered) continue;
    region.sourceRect = recovered.recoveredSourceRect;
    region.canvasRect = canvasRectObject(recovered.recoveredCanvasRect);
  }
}

function applyFinal() {
  const plan = loadPlan();
  assertAllPassed(plan);
  const maps = new Map(loadNotebookMaps().map((entry) => [entry.notebookId, entry]));

  for (const { notebookId, slide } of allPlanSlides(plan)) {
    const clean = cleanPath(notebookId, slide);
    const final = slideImageFsPath(notebookId, slide);
    if (!fs.existsSync(clean)) throw new Error(`Missing clean image: ${clean}`);
    ensureDir(path.dirname(final));
    fs.copyFileSync(clean, final);

    const mapEntry = maps.get(notebookId);
    const mapSlide = mapEntry.data.slides.find((item) => item.order === slide.order);
    const report = readJson(reportPath(notebookId, slide));
    applyRecoveredHitMap(mapSlide, report);
  }

  for (const entry of maps.values()) writeJson(entry.filePath, entry.data);
  console.log('Applied clean slide images and recovered semantic hit maps.');
}

function makeHotspotElement(region) {
  const canvas = canvasRectObject(region.recoveredCanvasRect);
  return {
    id: region.id,
    name: `semantic-hit-map: ${region.label}`,
    type: 'shape',
    left: canvas.left,
    top: canvas.top,
    width: canvas.width,
    height: canvas.height,
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

function findSceneForSlide(scenes, notebookId, slide) {
  const expectedId = `${notebookId}-p${slideNo(slide)}`;
  return (
    scenes.find((scene) => scene.id === expectedId) ??
    scenes.find((scene) => scene.order === slide.order + 1) ??
    scenes.find((scene) => scene.order === slide.order)
  );
}

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

async function syncDb() {
  const plan = loadPlan();
  assertAllPassed(plan);
  loadEnvLocal();
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set.');
  const prisma = new PrismaClient();
  try {
    for (const notebook of plan.notebooks) {
      const scenes = await prisma.scene.findMany({
        where: { notebookId: notebook.notebookId },
        orderBy: { order: 'asc' },
      });
      for (const slide of notebook.slides) {
        const scene = findSceneForSlide(scenes, notebook.notebookId, slide);
        if (!scene) throw new Error(`Scene not found for ${notebook.notebookId} slide ${slide.order + 1}`);
        const report = readJson(reportPath(notebook.notebookId, slide));
        const content = structuredClone(scene.content);
        const canvas = content?.canvas;
        if (!canvas?.elements) throw new Error(`Scene canvas elements missing for ${scene.id}`);

        for (const element of canvas.elements) {
          if (element.type === 'image' && (element.imageType === 'pageFigure' || element.src?.includes('/slide-'))) {
            element.src = slideImagePublicPath(notebook.notebookId, slide);
          }
        }

        const regionIds = new Set(report.regions.map((region) => region.id));
        canvas.elements = canvas.elements.filter(
          (element) => !(String(element.name ?? '').startsWith('semantic-hit-map:') && !regionIds.has(element.id)),
        );
        for (const region of report.regions) {
          const nextElement = makeHotspotElement(region);
          const index = canvas.elements.findIndex((element) => element.id === region.id);
          if (index >= 0) canvas.elements[index] = { ...canvas.elements[index], ...nextElement };
          else canvas.elements.push(nextElement);
        }
        content.semanticHitMap = {
          version: 1,
          sourceSize: report.sourceSize,
          canvasSize: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
          regions: report.regions.map((region) => ({
            id: region.id,
            semanticId: region.semanticId,
            label: region.label,
            sourceRect: region.recoveredSourceRect,
            canvasRect: canvasRectObject(region.recoveredCanvasRect),
          })),
        };

        await prisma.scene.update({ where: { id: scene.id }, data: { content } });
      }
      await prisma.notebook.update({ where: { id: notebook.notebookId }, data: { updatedAt: new Date() } });
    }
    console.log(`Synced ${plan.notebooks.length} MAT136 notebooks to database.`);
  } finally {
    await prisma.$disconnect();
  }
}

async function cleanupOld() {
  fs.rmSync(STAGING_ROOT, { recursive: true, force: true });
  for (const notebookId of NOTEBOOKS) {
    const dir = path.join(PUBLIC_ROOT, notebookId);
    for (const extra of ['contact-sheet.png', 'marker-recovery-experiment', 'page-plan-prototype']) {
      fs.rmSync(path.join(dir, extra), { recursive: true, force: true });
    }
    for (const fileName of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
      if (/handdrawn-marker|marker-test|marker-v2|overlay|student-clean|decorated-regenerated/.test(fileName)) {
        fs.rmSync(path.join(dir, fileName), { recursive: true, force: true });
      }
    }
  }
  for (const oldId of OLD_NOTEBOOK_DIRS) {
    fs.rmSync(path.join(PUBLIC_ROOT, oldId), { recursive: true, force: true });
  }

  loadEnvLocal();
  if (process.env.DATABASE_URL) {
    const prisma = new PrismaClient();
    try {
      await prisma.scene.deleteMany({ where: { notebookId: { in: OLD_NOTEBOOK_DIRS } } });
      await prisma.notebook.deleteMany({ where: { id: { in: OLD_NOTEBOOK_DIRS } } });
    } finally {
      await prisma.$disconnect();
    }
  }
  console.log('Removed staging files, old MAT136 duplicate notebook dirs, and local experiment artifacts.');
}

function showNext() {
  const pending = nextPending();
  if (!pending) {
    console.log('No pending slides.');
    return;
  }
  console.log(JSON.stringify({ notebookId: pending.notebookId, slide: pending.slide.order + 1, promptPath: promptPath(pending.notebookId, pending.slide) }, null, 2));
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--prepare')) return prepare();
  if (args.has('--next')) return showNext();
  if (args.has('--register-latest')) return registerLatest();
  if (args.has('--register-latest-clean')) return registerLatestClean();
  if (args.has('--normalize-existing')) return normalizeExisting();
  if (args.has('--recover')) return recoverAll();
  if (args.has('--apply-final')) return applyFinal();
  if (args.has('--sync-db')) return syncDb();
  if (args.has('--cleanup-old')) return cleanupOld();
  console.log(
    'Usage: node scripts/notebooks/regenerate-mat136-images-with-markers.mjs --prepare|--next|--register-latest|--register-latest-clean|--normalize-existing|--recover|--apply-final|--sync-db|--cleanup-old',
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
