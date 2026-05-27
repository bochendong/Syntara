import type { PreviewStats } from './types';

export function emptyStats(): PreviewStats {
  return {
    scrollWidth: 0,
    scrollHeight: 0,
    slideCount: 0,
    hasSlideContent: false,
    outOfBoundsCount: 0,
    outOfBoundsSamples: [],
    headingCount: 0,
    tableCount: 0,
    tableRowCount: 0,
    mathCount: 0,
    mspaceCount: 0,
    preCount: 0,
    codeCount: 0,
    listItemCount: 0,
    cardishCount: 0,
    stepishCount: 0,
    textNodeCount: 0,
    visibleCharCount: 0,
    maxTextLength: 0,
    imageCount: 0,
    largeImageCount: 0,
    contentCoverageRatio: 0,
    sparseLargeContainerCount: 0,
    sparseLargeContainerSamples: [],
    smallTextRatioUnder20: 0,
    smallTextRatioUnder22: 0,
    smallTextRatioUnder24: 0,
    visibleText: '',
    scriptLikeCount: 0,
    preOverflowCount: 0,
  };
}

export function normalizeAnchorText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

export function getMissingAnchors(text: string, anchors: string[]): string[] {
  const normalizedText = normalizeAnchorText(text);
  return anchors.filter((anchor) => !normalizedText.includes(normalizeAnchorText(anchor)));
}

export function getFoundAnchors(text: string, anchors: string[] | undefined): string[] {
  if (!anchors || anchors.length === 0) return [];
  const normalizedText = normalizeAnchorText(text);
  return anchors.filter((anchor) => normalizedText.includes(normalizeAnchorText(anchor)));
}

export function hasMeaningfulBoxClass(element: Element): boolean {
  const classNames =
    typeof element.className === 'string' ? element.className : element.getAttribute('class') || '';
  const ignoredParts =
    /\b(title|label|value|text|note|body|head|sub|icon|list|grid|wrap|content|row|col|accent|main|compare|desc|index|tag)\b/;
  const boxParts =
    /\b(card|tile|panel|metric|takeaway|summary|callout|stat|module|feature|entry|block|box)\b/;

  return classNames
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .some((token) => boxParts.test(token.replace(/[-_]/g, ' ')) && !ignoredParts.test(token));
}

export function hasStepContainerClass(element: Element): boolean {
  const classNames =
    typeof element.className === 'string' ? element.className : element.getAttribute('class') || '';
  const tokens = classNames.toLowerCase().split(/\s+/).filter(Boolean);
  const stepContainerPattern =
    /^(?:step|phase|stage|trace|state|flow-step|flow-node|flow-item|process-step|process-node|process-item)$/;
  const compoundStepContainerPattern =
    /^(?:step|phase|stage|trace|state|flow|process)[-_](?:card|item|node|block|row)$/;

  return tokens.some(
    (token) =>
      stepContainerPattern.test(token) ||
      compoundStepContainerPattern.test(token) ||
      /\b(?:step|phase|stage|trace|state)[-_](?:card|item|node|block|row)\b/.test(token),
  );
}

export function analyzeHtml(html: string) {
  return {
    htmlLength: html.length,
    textNodeCount: html
      .replace(/<style\b[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '\n')
      .split('\n')
      .map((part) => part.trim())
      .filter(Boolean).length,
    elementCount: html.match(/<[a-z][\w:-]*(?:\s|>)/gi)?.length || 0,
    mathElementCount: html.match(/<math(?:\s|>)/gi)?.length || 0,
  };
}
