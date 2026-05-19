export { isNotebookSlotLayoutError, NotebookSlotLayoutError } from './slide-adapter.shared';
export type { NotebookSlotLayoutIssue } from './slide-adapter.shared';
export {
  assessNotebookContentDocumentForSlide,
  paginateNotebookContentDocument,
  renderNotebookContentDocumentToSlide,
  validateNotebookContentDocumentArchetype,
} from './slide-adapter.public-api';
export type {
  NotebookDocumentArchetypeValidation,
  NotebookDocumentPaginationResult,
  NotebookSlideContentBudgetAssessment,
} from './slide-adapter.public-api';
