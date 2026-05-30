import sharp from 'sharp';
import {
  IMAGE_NOTEBOOK_CANVAS_HEIGHT,
  IMAGE_NOTEBOOK_CANVAS_WIDTH,
  IMAGE_NOTEBOOK_MARKER_COLOR_POOL,
  type ImageNotebookFocusRegion,
  type ImageNotebookFocusRole,
  type ImageNotebookPagePromptPlan,
  type ImageNotebookPromptComponentPlan,
  type ImageNotebookPromptRecoveryResult,
} from '@/lib/generation/image-notebook-quality';
import type { ImageGenerationResult } from '@/lib/media/types';

type MarkerCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

type MarkerComponent = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  area: number;
};

type CornerHit = {
  corner: MarkerCorner;
  component: MarkerComponent;
};

type MarkerColorMatcher = {
  name: string;
  hex: string;
  match: (r: number, g: number, b: number) => boolean;
};

type RawImage = {
  data: Buffer;
  width: number;
  height: number;
};

const MARKER_MATCHERS: MarkerColorMatcher[] = [
  { name: 'red', hex: '#ff0000', match: (r, g, b) => r > 180 && g < 85 && b < 85 },
  { name: 'lime', hex: '#00ff00', match: (r, g, b) => g > 170 && r < 90 && b < 95 },
  { name: 'blue', hex: '#0048ff', match: (r, g, b) => b > 145 && r < 90 && g < 140 },
  { name: 'cyan', hex: '#00ffff', match: (r, g, b) => g > 165 && b > 165 && r < 95 },
  { name: 'magenta', hex: '#ff00ff', match: (r, g, b) => r > 170 && b > 130 && g < 95 },
  { name: 'yellow', hex: '#ffff00', match: (r, g, b) => r > 170 && g > 170 && b < 110 },
];

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function componentCenter(component: MarkerComponent): { x: number; y: number } {
  return {
    x: component.minX + component.width / 2,
    y: component.minY + component.height / 2,
  };
}

function isCompactCornerMarker(component: MarkerComponent): boolean {
  const aspect = component.width / Math.max(1, component.height);
  const fillRatio = component.area / Math.max(1, component.width * component.height);
  return (
    component.width >= 5 &&
    component.height >= 5 &&
    component.width <= 80 &&
    component.height <= 80 &&
    aspect >= 0.35 &&
    aspect <= 2.85 &&
    fillRatio >= 0.16
  );
}

function componentsForColor(raw: RawImage, matcher: MarkerColorMatcher): MarkerComponent[] {
  const mask = new Uint8Array(raw.width * raw.height);
  for (let i = 0, p = 0; i < raw.data.length; i += 3, p += 1) {
    if (matcher.match(raw.data[i] || 0, raw.data[i + 1] || 0, raw.data[i + 2] || 0)) {
      mask[p] = 1;
    }
  }

  const seen = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  const components: MarkerComponent[] = [];

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

function cornerScore(corner: MarkerCorner, nx: number, ny: number): number {
  if (corner === 'top-left') return nx + ny;
  if (corner === 'top-right') return 1 - nx + ny;
  if (corner === 'bottom-left') return nx + (1 - ny);
  return 1 - nx + (1 - ny);
}

function selectCornerHitsFromComponents(components: MarkerComponent[]): CornerHit[] {
  if (components.length < 4) return [];
  const centers = components.map(componentCenter);
  const left = Math.min(...centers.map((center) => center.x));
  const top = Math.min(...centers.map((center) => center.y));
  const right = Math.max(...centers.map((center) => center.x));
  const bottom = Math.max(...centers.map((center) => center.y));
  const width = right - left;
  const height = bottom - top;
  if (width < 32 || height < 32) return [];

  const corners: MarkerCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
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

  let bestHits: CornerHit[] = [];
  let bestScore = Number.POSITIVE_INFINITY;
  const used = new Set<MarkerComponent>();
  const current: CornerHit[] = [];

  const search = (cornerIndex: number, score: number) => {
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

function bboxFromComponents(
  components: MarkerComponent[],
): [number, number, number, number] | undefined {
  if (!components.length) return undefined;
  const left = Math.min(...components.map((component) => component.minX));
  const top = Math.min(...components.map((component) => component.minY));
  const right = Math.max(...components.map((component) => component.maxX));
  const bottom = Math.max(...components.map((component) => component.maxY));
  return [left, top, right, bottom].map(round1) as [number, number, number, number];
}

function toCanvasBbox(
  bbox: [number, number, number, number],
  raw: RawImage,
): [number, number, number, number] {
  const scaleX = IMAGE_NOTEBOOK_CANVAS_WIDTH / raw.width;
  const scaleY = IMAGE_NOTEBOOK_CANVAS_HEIGHT / raw.height;
  return [
    round1(bbox[0] * scaleX),
    round1(bbox[1] * scaleY),
    round1(bbox[2] * scaleX),
    round1(bbox[3] * scaleY),
  ];
}

function componentRoleToFocusRole(
  component: ImageNotebookPromptComponentPlan,
): ImageNotebookFocusRole {
  if (component.role === 'header' || component.role === 'opening') return 'opening';
  if (component.role === 'formula') return 'formula';
  if (component.role === 'example') return 'example';
  if (component.role === 'proof') return 'proof';
  if (component.role === 'strategy') return 'strategy';
  if (component.role === 'pitfall') return 'pitfall';
  if (component.role === 'takeaway' || component.role === 'question') return 'takeaway';
  if (component.role === 'visual') return 'visual';
  return 'setup';
}

function focusRegionsFromRecovery(
  promptPlan: ImageNotebookPagePromptPlan,
  recovery: ImageNotebookPromptRecoveryResult,
): ImageNotebookFocusRegion[] {
  const recoveredById = new Map(
    (recovery.components || [])
      .filter((component) => component.bbox && (component.markerPoints?.length || 0) >= 4)
      .map((component) => [component.componentId, component]),
  );
  return promptPlan.componentPlans
    .filter((component) => component.participatesInMask)
    .flatMap((component, index) => {
      const recovered = recoveredById.get(component.id);
      const bbox = recovered?.bbox;
      if (!bbox) return [];
      const left = Math.max(0, Math.min(IMAGE_NOTEBOOK_CANVAS_WIDTH - 1, bbox[0]));
      const top = Math.max(0, Math.min(IMAGE_NOTEBOOK_CANVAS_HEIGHT - 1, bbox[1]));
      const right = Math.max(left + 1, Math.min(IMAGE_NOTEBOOK_CANVAS_WIDTH, bbox[2]));
      const bottom = Math.max(top + 1, Math.min(IMAGE_NOTEBOOK_CANVAS_HEIGHT, bbox[3]));
      return {
        id: component.id,
        label: focusLabelForComponent(component),
        role: componentRoleToFocusRole(component),
        left: round1(left),
        top: round1(top),
        width: round1(right - left),
        height: round1(bottom - top),
        order: component.order || index + 1,
      };
    })
    .sort((a, b) => a.order - b.order);
}

function median(values: number[], fallback = 248): number {
  if (!values.length) return fallback;
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] || fallback;
}

function isAnyMarkerPixel(r: number, g: number, b: number): boolean {
  return MARKER_MATCHERS.some((matcher) => matcher.match(r, g, b));
}

async function sourceToBuffer(imageSrc: string, requestUrl?: string): Promise<Buffer> {
  if (imageSrc.startsWith('data:')) {
    const [, base64] = imageSrc.split(',');
    return Buffer.from(base64 || '', 'base64');
  }
  if (/^[A-Za-z0-9+/=\s]+$/.test(imageSrc) && imageSrc.length > 200) {
    return Buffer.from(imageSrc, 'base64');
  }
  const url =
    imageSrc.startsWith('/') && requestUrl ? new URL(imageSrc, requestUrl).toString() : imageSrc;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Unable to fetch generated notebook image for marker recovery: ${response.status}`,
    );
  }
  return Buffer.from(await response.arrayBuffer());
}

async function decodeRawImage(imageSrc: string, requestUrl?: string): Promise<RawImage> {
  const input = await sourceToBuffer(imageSrc, requestUrl);
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

async function rawImageToDataUrl(raw: RawImage): Promise<string> {
  const imageBuffer = await sharp(raw.data, {
    raw: { width: raw.width, height: raw.height, channels: 3 },
  })
    .png()
    .toBuffer();
  return `data:image/png;base64,${imageBuffer.toString('base64')}`;
}

async function cleanMarkerImage(
  raw: RawImage,
  markerComponents: MarkerComponent[],
): Promise<string> {
  const out = Buffer.from(raw.data);

  const fillRect = (component: MarkerComponent) => {
    const pad = 6;
    const x1 = Math.max(0, Math.floor(component.minX - pad));
    const y1 = Math.max(0, Math.floor(component.minY - pad));
    const x2 = Math.min(raw.width - 1, Math.ceil(component.maxX + pad));
    const y2 = Math.min(raw.height - 1, Math.ceil(component.maxY + pad));
    const samplePad = 22;
    const rs: number[] = [];
    const gs: number[] = [];
    const bs: number[] = [];

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
  };

  markerComponents.forEach(fillRect);
  const cleanBuffer = await sharp(out, {
    raw: { width: raw.width, height: raw.height, channels: 3 },
  })
    .png()
    .toBuffer();
  return cleanBuffer.toString('base64');
}

function matcherForHex(hex: string | undefined): MarkerColorMatcher | undefined {
  const normalized = hex?.toLowerCase();
  return MARKER_MATCHERS.find((matcher) => matcher.hex === normalized);
}

function focusLabelForComponent(component: ImageNotebookPromptComponentPlan): string {
  const visibleText = [...(component.visibleText || []), ...(component.formulas || [])]
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(' / ');
  return visibleText ? `${component.label}: ${visibleText}` : component.label;
}

export async function recoverImageNotebookMarkers(args: {
  imageUrl: string;
  imageResult: ImageGenerationResult;
  promptPlan: ImageNotebookPagePromptPlan;
  requestUrl?: string;
}): Promise<{
  recoveryResult: ImageNotebookPromptRecoveryResult;
  promptPlan: ImageNotebookPagePromptPlan;
  focusRegions: ImageNotebookFocusRegion[];
  studentImageUrl: string;
  studentImageResult: ImageGenerationResult;
}> {
  const raw = await decodeRawImage(args.imageUrl, args.requestUrl);
  const originalMarkerImageUrl = await rawImageToDataUrl(raw);
  const findings: string[] = [];
  const recoveredComponents: NonNullable<ImageNotebookPromptRecoveryResult['components']> = [];
  const cleanComponents: MarkerComponent[] = [];
  const componentPlans = args.promptPlan.componentPlans.filter(
    (component) => component.participatesInMask,
  );

  for (const component of componentPlans) {
    const matcher = matcherForHex(component.markerColorHex);
    if (!matcher) {
      findings.push(
        `${component.label}: missing marker color ${component.markerColorHex || 'unknown'}.`,
      );
      recoveredComponents.push({
        componentId: component.id,
        markerColorHex: component.markerColorHex || '',
        markerCount: 0,
      });
      continue;
    }

    const components = componentsForColor(raw, matcher);
    const compactComponents = components.filter(isCompactCornerMarker);
    cleanComponents.push(...compactComponents);
    const hits = selectCornerHitsFromComponents(compactComponents);
    const sourceBbox =
      hits.length === 4 ? bboxFromComponents(hits.map((hit) => hit.component)) : undefined;
    const canvasBbox = sourceBbox ? toCanvasBbox(sourceBbox, raw) : undefined;

    if (!canvasBbox) {
      findings.push(
        `${component.label}: expected 4 isolated ${component.markerColorName || matcher.name} corner markers, recovered ${compactComponents.length}; skipped this component region.`,
      );
    } else if (compactComponents.length !== 4) {
      findings.push(
        `${component.label}: recovered ${compactComponents.length} ${component.markerColorName || matcher.name} marker-like squares; using 4 best corner candidates.`,
      );
    }

    recoveredComponents.push({
      componentId: component.id,
      markerColorHex: matcher.hex,
      bbox: canvasBbox,
      markerPoints: hits.map((hit) => {
        const center = componentCenter(hit.component);
        return {
          x: round1((center.x / raw.width) * IMAGE_NOTEBOOK_CANVAS_WIDTH),
          y: round1((center.y / raw.height) * IMAGE_NOTEBOOK_CANVAS_HEIGHT),
          corner: hit.corner,
        };
      }),
      markerCount: compactComponents.length,
    });
  }

  const expectedColorHexes = new Set(
    componentPlans.map((component) => component.markerColorHex?.toLowerCase()),
  );
  for (const color of IMAGE_NOTEBOOK_MARKER_COLOR_POOL) {
    if (expectedColorHexes.has(color.hex)) continue;
    const matcher = matcherForHex(color.hex);
    if (!matcher) continue;
    const extra = componentsForColor(raw, matcher).filter(isCompactCornerMarker);
    if (extra.length > 0) {
      findings.push(
        `Unexpected pure ${color.name} marker-like squares recovered: ${extra.length}.`,
      );
      cleanComponents.push(...extra);
    }
  }

  const recoveredRegionCount = recoveredComponents.filter((component) => component.bbox).length;
  const recoveryResult: ImageNotebookPromptRecoveryResult = {
    status: findings.length ? (recoveredRegionCount > 0 ? 'partial' : 'failed') : 'passed',
    recoveredAt: Date.now(),
    originalMarkerImageUrl,
    originalMarkerImageDimensions: {
      width: raw.width,
      height: raw.height,
    },
    findings,
    components: recoveredComponents,
  };
  const promptPlan: ImageNotebookPagePromptPlan = {
    ...args.promptPlan,
    recoveryResult,
  };
  const focusRegions = focusRegionsFromRecovery(promptPlan, recoveryResult);
  const cleanBase64 = await cleanMarkerImage(raw, cleanComponents);
  const studentImageUrl = `data:image/png;base64,${cleanBase64}`;

  return {
    recoveryResult,
    promptPlan,
    focusRegions,
    studentImageUrl,
    studentImageResult: {
      ...args.imageResult,
      base64: cleanBase64,
      url: undefined,
      width: raw.width,
      height: raw.height,
    },
  };
}
