/**
 * Action Schemas for Stateless Generation
 *
 * Text descriptions of actions for inclusion in structured output prompts.
 * Actions are parsed from JSON array items in the model's response.
 */

import { SLIDE_ONLY_ACTIONS } from '@/lib/types/action';

// ==================== Effective Actions ====================

export const COURSE_CHAT_LEARNING_ACTIONS = [
  'calendar.propose_add',
  'calendar.propose_update',
  'calendar.propose_delete',
  'calendar.search',
  'learner_progress.request_confirmation',
  'practice.propose_generation',
  'classroom.propose_temporary_explanation',
  'memory.propose_write',
] as const;

/**
 * Filter allowed actions by scene type.
 * Slide-only actions (spotlight, laser) are removed for non-slide scenes.
 */
export function getEffectiveActions(allowedActions: string[], sceneType?: string): string[] {
  if (!sceneType || sceneType === 'slide') return allowedActions;
  return allowedActions.filter(
    (a) => !SLIDE_ONLY_ACTIONS.includes(a as (typeof SLIDE_ONLY_ACTIONS)[number]),
  );
}

// ==================== Text Descriptions ====================

/**
 * Get text descriptions of allowed actions for inclusion in system prompts.
 * Used when the model generates structured output with JSON array format.
 */
export function getActionDescriptions(allowedActions: string[]): string {
  const descriptions: Record<string, string> = {
    spotlight:
      'Focus attention on a single key element by dimming everything else. Use sparingly — max 1-2 per response. Parameters: { elementId: string, dimOpacity?: number }',
    laser:
      'Point at an element with a laser pointer effect. Parameters: { elementId: string, color?: string }',
    wb_open:
      'Open the whiteboard for hand-drawn explanations, formulas, diagrams, or step-by-step derivations. Creates a new whiteboard if none exists. Call this before adding elements. Parameters: {}',
    wb_draw_text:
      'Add text to the whiteboard. Use for writing formulas, steps, or key points. Parameters: { content: string, x: number, y: number, width?: number, height?: number, fontSize?: number, color?: string, elementId?: string }',
    wb_draw_shape:
      'Add a shape to the whiteboard. Use for diagrams and visual explanations. Parameters: { shape: "rectangle"|"circle"|"triangle", x: number, y: number, width: number, height: number, fillColor?: string, elementId?: string }',
    wb_draw_chart:
      'Add a chart to the whiteboard. Use for data visualization (bar charts, line graphs, pie charts, etc.). Parameters: { chartType: "bar"|"column"|"line"|"pie"|"ring"|"area"|"radar"|"scatter", x: number, y: number, width: number, height: number, data: { labels: string[], legends: string[], series: number[][] }, themeColors?: string[], elementId?: string }',
    wb_draw_latex:
      'Add a LaTeX formula to the whiteboard. Use for mathematical equations and scientific notation. Parameters: { latex: string, x: number, y: number, width?: number, height?: number, color?: string, elementId?: string }',
    wb_draw_table:
      'Add a table to the whiteboard. Use for structured data display and comparisons. Parameters: { x: number, y: number, width: number, height: number, data: string[][] (first row is header), outline?: { width: number, style: string, color: string }, theme?: { color: string }, elementId?: string }',
    wb_draw_line:
      'Add a line or arrow to the whiteboard. Use for connecting elements, drawing relationships, flow diagrams, or annotations. Parameters: { startX: number, startY: number, endX: number, endY: number, color?: string (default "#333333"), width?: number (line thickness, default 2), style?: "solid"|"dashed" (default "solid"), points?: [startMarker, endMarker] where marker is ""|"arrow" (default ["",""]), elementId?: string }',
    wb_clear:
      'Clear all elements from the whiteboard. Use when whiteboard is too crowded before adding new elements. Parameters: {}',
    wb_delete:
      'Delete a specific element from the whiteboard by its ID. Use to remove an outdated, incorrect, or overlapping element without clearing the entire board. Parameters: { elementId: string }',
    wb_close:
      'Close the whiteboard and return to the slide view. Always close after you finish drawing. Parameters: {}',
    play_video:
      'Start playback of a video element on the current slide. Synchronous — blocks until the video finishes playing. Use a speech action before this to introduce the video. Parameters: { elementId: string }',
    'calendar.propose_add':
      'Propose adding a study plan, review block, assignment, exam prep item, or practice session to the learner calendar. This never executes by itself; user confirmation is required. Parameters: { label: string, summary?: string, items?: Array<{ title: string, date?: string, start?: string, durationMinutes?: number, courseId?: string, reason?: string }>, requiresConfirmation: true }',
    'calendar.propose_update':
      'Propose modifying existing learner calendar items, such as shifting missed work or resizing a plan. This never executes by itself; user confirmation is required. Parameters: { label: string, summary?: string, target?: string, updates?: Record<string, unknown>, requiresConfirmation: true }',
    'calendar.propose_delete':
      'Propose deleting one or more learner calendar items. This never executes by itself; user confirmation is required. Parameters: { label: string, summary?: string, targets: string[], requiresConfirmation: true }',
    'calendar.search':
      'Ask the UI to show or search existing learner calendar items relevant to the current course or time window. This is read-only. Parameters: { label: string, query?: string, courseId?: string, dateRange?: string }',
    'learner_progress.request_confirmation':
      'Ask the UI to collect or confirm the learner progress that is needed before making a plan. Use when progress, exam date, available time, or mastery state is missing or ambiguous. Parameters: { label: string, fields: string[], summary?: string, courseId?: string }',
    'practice.propose_generation':
      'Propose generating or selecting practice questions. Use when the learner asks for exercises, a targeted review set, or problem-bank selection. Include whether items come from the problem bank or are self-generated. User confirmation is required before creating a larger set. Parameters: { label: string, summary?: string, source: "problem_bank"|"self_generated"|"mixed", count?: number, difficulty?: string, concepts?: string[], requiresConfirmation: true }',
    'classroom.propose_temporary_explanation':
      'Offer a temporary classroom-style explanation when the learner asks for a substantive explanation that could benefit from a guided mini-lesson. This never starts the classroom by itself; user confirmation is required. Parameters: { label: string, topic: string, summary?: string, estimatedMinutes?: number, requiresConfirmation: true }',
    'memory.propose_write':
      'Propose writing or updating learner memory such as weakness, mastery, cause, next teaching move, or corrected memory. This never writes by itself; user confirmation is required when the update is evaluative or durable. Parameters: { label: string, summary: string, memoryType: "weakness"|"mastery"|"progress"|"preference"|"correction"|"next_step", courseId?: string, evidence?: string[], requiresConfirmation: true }',
  };

  if (allowedActions.length === 0) {
    return 'You have no actions available. You can only speak to students.';
  }

  const lines = allowedActions
    .filter((action) => descriptions[action])
    .map((action) => `- ${action}: ${descriptions[action]}`);

  return lines.join('\n');
}
