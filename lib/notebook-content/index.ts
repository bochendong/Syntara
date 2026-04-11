export type {
  NotebookContentBlock,
  NotebookContentContinuation,
  NotebookContentDocument,
  NotebookContentLanguage,
  NotebookContentProfile,
  NotebookSlideArchetype,
} from './schema';
export {
  notebookContentContinuationSchema,
  notebookContentDocumentSchema,
  notebookContentProfileSchema,
  notebookSlideArchetypeSchema,
  parseNotebookContentDocument,
} from './schema';
export {
  buildNotebookContentDocumentFromInsert,
  buildNotebookContentDocumentFromText,
} from './builders';
export {
  inferNotebookContentProfileFromBlocks,
  inferNotebookContentProfileFromText,
  resolveNotebookContentProfile,
} from './profile';
export { renderNotebookContentToMarkdown } from './render-chat';
export {
  renderNotebookContentDocumentToSlide,
  assessNotebookContentDocumentForSlide,
  paginateNotebookContentDocument,
  validateNotebookContentDocumentArchetype,
  type NotebookSlideContentBudgetAssessment,
  type NotebookDocumentPaginationResult,
  type NotebookDocumentArchetypeValidation,
} from './slide-adapter';
export { chemistryTextToHtml } from './chemistry';
