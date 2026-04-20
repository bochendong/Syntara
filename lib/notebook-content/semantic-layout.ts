/**
 * Semantic layout boundary.
 *
 * Generation should stop at NotebookContentDocument. Everything after that
 * (measurement, pagination, layout normalization policy, and slide rendering)
 * belongs to this module so the generation pipeline does not own geometry.
 */
import {
  normalizeSlideTextLayout,
  validateSlideTextLayout,
  type SlideLayoutValidationResult,
  type SlideViewport,
} from '@/lib/slide-text-layout';
import type { Slide } from '@/lib/types/slides';
import type { NotebookContentDocument } from './schema';
import {
  assessNotebookContentDocumentForSlide,
  paginateNotebookContentDocument,
  renderNotebookContentDocumentToSlide,
  type NotebookDocumentPaginationResult,
  type NotebookSlideContentBudgetAssessment,
} from './slide-adapter';

const DEFAULT_SEMANTIC_LAYOUT_VIEWPORT: SlideViewport = {
  width: 1000,
  height: 562.5,
};

export interface NotebookSemanticRenderedPage {
  document: NotebookContentDocument;
  slide: Slide;
  layoutValidation: SlideLayoutValidationResult;
}

export interface PrepareNotebookSemanticLayoutArgs {
  document: NotebookContentDocument;
  fallbackTitle: string;
  rootOutlineId: string;
  viewport?: SlideViewport;
}

export interface PreparedNotebookSemanticLayout {
  measurement: NotebookSlideContentBudgetAssessment;
  pagination: NotebookDocumentPaginationResult;
  pages: NotebookSemanticRenderedPage[];
}

export function shouldLockNotebookSemanticLayout(
  document: Pick<NotebookContentDocument, 'layout' | 'pattern'>,
): boolean {
  if (document.layout.mode === 'grid') return true;

  return document.pattern === 'multi_column_cards' || document.pattern === 'symmetric_split';
}

export function measureNotebookSemanticLayout(
  document: NotebookContentDocument,
): NotebookSlideContentBudgetAssessment {
  return assessNotebookContentDocumentForSlide(document);
}

export function paginateNotebookSemanticLayout(args: {
  document: NotebookContentDocument;
  rootOutlineId: string;
}): NotebookDocumentPaginationResult {
  return paginateNotebookContentDocument(args);
}

export function renderNotebookSemanticPages(args: {
  pageDocuments: NotebookContentDocument[];
  fallbackTitle: string;
  viewport?: SlideViewport;
}): NotebookSemanticRenderedPage[] {
  const viewport = args.viewport || DEFAULT_SEMANTIC_LAYOUT_VIEWPORT;

  return args.pageDocuments.map((pageDocument) => {
    const renderedSlide = renderNotebookContentDocumentToSlide({
      document: pageDocument,
      fallbackTitle: args.fallbackTitle,
    });
    const normalizedElements = shouldLockNotebookSemanticLayout(pageDocument)
      ? renderedSlide.elements
      : normalizeSlideTextLayout(renderedSlide.elements, viewport);
    const slide: Slide = {
      ...renderedSlide,
      elements: normalizedElements,
    };

    return {
      document: pageDocument,
      slide,
      layoutValidation: validateSlideTextLayout(normalizedElements, viewport),
    };
  });
}

export function prepareNotebookSemanticLayout(
  args: PrepareNotebookSemanticLayoutArgs,
): PreparedNotebookSemanticLayout {
  const measurement = measureNotebookSemanticLayout(args.document);
  const pagination = paginateNotebookSemanticLayout({
    document: args.document,
    rootOutlineId: args.rootOutlineId,
  });
  const pages = renderNotebookSemanticPages({
    pageDocuments: pagination.pages,
    fallbackTitle: args.fallbackTitle,
    viewport: args.viewport,
  });

  return {
    measurement,
    pagination,
    pages,
  };
}
