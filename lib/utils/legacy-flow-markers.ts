import type { PPTElement, PPTLineElement, PPTTextElement } from '@/lib/types/slides';

const LEGACY_TIMELINE_LINE_COLOR = '#cbd5e1';
const LEGACY_MARKER_MAX_LEFT = 120;

function normalizeHex(value: string | undefined): string {
  return (value || '').trim().toLowerCase();
}

function isLegacyTimelineLine(element: PPTElement): element is PPTLineElement {
  if (element.type !== 'line') return false;
  const hasNoMarkers = element.points[0] === '' && element.points[1] === '';
  if (!hasNoMarkers) return false;
  if (normalizeHex(element.color) !== LEGACY_TIMELINE_LINE_COLOR) return false;
  if (Math.abs(element.width - 3) > 0.2) return false;
  const dx = Math.abs(element.start[0] - element.end[0]);
  const dy = Math.abs(element.start[1] - element.end[1]);
  return dx <= 2 && dy >= 36;
}

function compactTextContent(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, '')
    .trim();
}

function isLegacyTimelineStepText(element: PPTElement): element is PPTTextElement {
  if (element.type !== 'text') return false;
  if (element.width > 52 || element.height > 72) return false;
  if (element.left > LEGACY_MARKER_MAX_LEFT) return false;
  const text = compactTextContent(element.content || '');
  return /^\d{1,2}$/.test(text);
}

function isTinyLegacyStepBadge(element: PPTElement): element is PPTTextElement {
  if (element.type !== 'text') return false;
  if (element.width > 30 || element.height > 50) return false;
  if (element.left > LEGACY_MARKER_MAX_LEFT) return false;
  if (normalizeHex(element.outline?.color) !== LEGACY_TIMELINE_LINE_COLOR) return false;
  const text = compactTextContent(element.content || '');
  return /^\d{1,2}$/.test(text);
}

export function stripLegacyVerticalFlowMarkers(elements: PPTElement[]): PPTElement[] {
  const lineCandidates = elements.filter(isLegacyTimelineLine);
  const textCandidates = elements.filter(isLegacyTimelineStepText);
  const tinyBadgeCandidates = elements.filter(isTinyLegacyStepBadge);
  if (lineCandidates.length === 0 && textCandidates.length === 0 && tinyBadgeCandidates.length === 0) {
    return elements;
  }

  const lineIdsToRemove = new Set<string>();
  const textIdsToRemove = new Set<string>();

  tinyBadgeCandidates.forEach((badge) => textIdsToRemove.add(badge.id));

  lineCandidates.forEach((line) => {
    const lineX = (line.start[0] + line.end[0]) / 2;
    const minY = Math.min(line.start[1], line.end[1]);
    const maxY = Math.max(line.start[1], line.end[1]);
    const relatedMarkers = textCandidates.filter((marker) => {
      const markerCenterX = marker.left + marker.width / 2;
      const markerCenterY = marker.top + marker.height / 2;
      const nearLineX = Math.abs(markerCenterX - lineX) <= 44;
      const inLineRange = markerCenterY >= minY - 28 && markerCenterY <= maxY + 28;
      return nearLineX && inLineRange;
    });

    if (relatedMarkers.length >= 1) {
      lineIdsToRemove.add(line.id);
      relatedMarkers.forEach((marker) => textIdsToRemove.add(marker.id));
      return;
    }

    // Also drop orphan timeline lines sitting in the legacy left marker gutter.
    if (lineX <= LEGACY_MARKER_MAX_LEFT + 28) {
      lineIdsToRemove.add(line.id);
    }
  });

  if (lineIdsToRemove.size === 0 && textIdsToRemove.size === 0) return elements;
  return elements.filter(
    (element) => !lineIdsToRemove.has(element.id) && !textIdsToRemove.has(element.id),
  );
}
