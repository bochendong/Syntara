import { nanoid } from 'nanoid';
import type {
  GeneratedSlideContent,
  GeneratedSlideContinuationPage,
  GeneratedSlidePageContent,
  SceneOutline,
} from '@/lib/types/generation';
import { normalizeSceneOutlineContentProfile } from './content-profile';

function stripContinuationPages(content: GeneratedSlideContent): GeneratedSlidePageContent {
  return {
    elements: content.elements,
    background: content.background,
    theme: content.theme,
    remark: content.remark,
    contentDocument: content.contentDocument,
  };
}

export function buildContinuationSceneOutline(
  baseOutline: SceneOutline,
  partNumber: number,
  totalParts: number,
): SceneOutline {
  const rootOutlineId = baseOutline.continuation?.rootOutlineId || baseOutline.id;
  return normalizeSceneOutlineContentProfile({
    ...baseOutline,
    id: nanoid(),
    continuation: {
      rootOutlineId,
      partNumber,
      totalParts,
    },
    order: baseOutline.order + partNumber - 1,
  });
}

export function flattenGeneratedSlideContentPages(args: {
  content: GeneratedSlideContent;
  effectiveOutline: SceneOutline;
}): {
  contents: GeneratedSlidePageContent[];
  effectiveOutlines: SceneOutline[];
} {
  const basePage = stripContinuationPages(args.content);
  const continuationPages = args.content.continuationPages || [];
  if (continuationPages.length === 0) {
    return {
      contents: [basePage],
      effectiveOutlines: [args.effectiveOutline],
    };
  }

  return {
    contents: [basePage, ...continuationPages.map((page) => page.content)],
    effectiveOutlines: [args.effectiveOutline, ...continuationPages.map((page) => page.outline)],
  };
}

export function renumberSceneOutlines(outlines: SceneOutline[]): SceneOutline[] {
  return outlines.map((outline, index) => ({
    ...outline,
    order: index + 1,
  }));
}

export function spliceGeneratedOutlines(
  outlines: SceneOutline[],
  targetOutlineId: string,
  replacementOutlines: SceneOutline[],
): {
  outlines: SceneOutline[];
  effectiveOutlines: SceneOutline[];
} {
  const targetIndex = outlines.findIndex((outline) => outline.id === targetOutlineId);
  if (targetIndex < 0) {
    const normalizedReplacement = renumberSceneOutlines(replacementOutlines);
    return {
      outlines: normalizedReplacement,
      effectiveOutlines: normalizedReplacement,
    };
  }

  const merged = renumberSceneOutlines([
    ...outlines.slice(0, targetIndex),
    ...replacementOutlines,
    ...outlines.slice(targetIndex + 1),
  ]);
  const effectiveOutlines = merged.slice(targetIndex, targetIndex + replacementOutlines.length);
  return {
    outlines: merged,
    effectiveOutlines,
  };
}

export function mapContinuationPagesToOutlines(
  pages: GeneratedSlideContinuationPage[],
  effectiveOutlines: SceneOutline[],
): GeneratedSlideContinuationPage[] {
  return pages.map((page, index) => ({
    ...page,
    outline: effectiveOutlines[index] || page.outline,
  }));
}
