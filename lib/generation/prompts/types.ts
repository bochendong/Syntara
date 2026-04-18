/**
 * Simplified prompt system type definitions
 */

/**
 * Prompt template identifier
 */
export type PromptId =
  | 'requirements-to-outlines'
  | 'web-search-query-rewrite'
  | 'slide-content'
  | 'slide-semantic-content'
  | 'quiz-content'
  | 'slide-actions'
  | 'quiz-actions'
  | 'interactive-scientific-model'
  | 'interactive-html'
  | 'interactive-actions'
  | 'pbl-actions';

export type PromptLanguage = 'zh-CN' | 'en-US';

/**
 * Snippet identifier
 */
export type SnippetId = 'json-output-rules' | 'element-types' | 'action-types';

/**
 * Loaded prompt template
 */
export interface LoadedPrompt {
  id: PromptId;
  language: PromptLanguage | 'generic';
  systemPrompt: string;
  userPromptTemplate: string;
}
