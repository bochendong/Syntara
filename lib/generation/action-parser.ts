/**
 * Action Parser - converts structured JSON Array output to Action[]
 *
 * Bridges the stateless-generate parser (used for online streaming) with the
 * offline generation pipeline, producing typed Action objects that preserve
 * the original interleaving order from the LLM output.
 *
 * For complete (non-streaming) responses, uses JSON.parse with partial-json
 * fallback for robustness.
 */

import type { Action, ActionType } from '@/lib/types/action';
import { SLIDE_ONLY_ACTIONS } from '@/lib/types/action';
import { nanoid } from 'nanoid';
import { parse as parsePartialJson, Allow } from 'partial-json';
import { jsonrepair } from 'jsonrepair';
import { createLogger } from '@/lib/logger';
const log = createLogger('ActionParser');

export interface LectureSegment {
  id?: string;
  title?: string;
  text: string;
  focusTargetId?: string;
}

/**
 * Strip markdown code fences (```json ... ``` or ``` ... ```) from a response string.
 */
function stripCodeFences(text: string): string {
  // Remove opening ```json or ``` and closing ```
  return text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '');
}

function parseJsonArrayResponse(response: string): unknown[] | null {
  const cleaned = stripCodeFences(response.trim());
  const startIdx = cleaned.indexOf('[');
  const endIdx = cleaned.lastIndexOf(']');

  if (startIdx === -1) {
    log.warn('No JSON array found in response');
    return null;
  }

  const jsonStr = endIdx > startIdx ? cleaned.slice(startIdx, endIdx + 1) : cleaned.slice(startIdx);

  try {
    return JSON.parse(jsonStr) as unknown[];
  } catch {
    try {
      const repaired = JSON.parse(jsonrepair(jsonStr)) as unknown[];
      log.info('Recovered malformed JSON via jsonrepair');
      return repaired;
    } catch {
      try {
        return parsePartialJson(
          jsonStr,
          Allow.ARR | Allow.OBJ | Allow.STR | Allow.NUM | Allow.BOOL | Allow.NULL,
        ) as unknown[];
      } catch (e) {
        log.warn('Failed to parse JSON array:', (e as Error).message);
        return null;
      }
    }
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizedFocusTargetId(value: unknown): string | undefined {
  const text = stringValue(value);
  if (!text) return undefined;
  if (/^(none|null|undefined|no-focus|no_focus)$/i.test(text)) return undefined;
  return text;
}

/**
 * Parse a complete LLM response in JSON Array format into an ordered Action[] array.
 *
 * Expected format (new):
 * [{"type":"action","name":"spotlight","params":{"elementId":"..."}},
 *  {"type":"text","content":"speech content"},...]
 *
 * Also supports legacy format:
 * [{"type":"action","tool_name":"spotlight","parameters":{"elementId":"..."}},...]
 *
 * Text items become `speech` actions; action items are converted to their
 * respective action types (spotlight, discussion, etc.).
 * The original interleaving order is preserved.
 */
export function parseActionsFromStructuredOutput(
  response: string,
  sceneType?: string,
  allowedActions?: string[],
): Action[] {
  const items = parseJsonArrayResponse(response);
  if (!items) return [];

  if (!Array.isArray(items)) {
    log.warn('Parsed result is not an array');
    return [];
  }

  // Step 4: Convert items to Action[]
  const actions: Action[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object' || !('type' in item)) continue;
    const typedItem = item as Record<string, unknown>;

    if (typedItem.type === 'text') {
      const text = ((typedItem.content as string) || '').trim();
      if (text) {
        actions.push({
          id: `action_${nanoid(8)}`,
          type: 'speech',
          text,
        });
      }
    } else if (typedItem.type === 'action') {
      try {
        // Support both new format (name/params) and legacy format (tool_name/parameters)
        const actionName = typedItem.name || typedItem.tool_name;
        const actionParams = (typedItem.params || typedItem.parameters || {}) as Record<
          string,
          unknown
        >;
        actions.push({
          id: (typedItem.action_id || typedItem.tool_id || `action_${nanoid(8)}`) as string,
          type: actionName as Action['type'],
          ...actionParams,
        } as Action);
      } catch (_e) {
        log.warn('Invalid action item, skipping:', JSON.stringify(typedItem).slice(0, 100));
      }
    }
  }

  // Step 5: Post-processing — discussion must be the last action, and at most one
  const discussionIdx = actions.findIndex((a) => a.type === 'discussion');
  if (discussionIdx !== -1 && discussionIdx < actions.length - 1) {
    actions.splice(discussionIdx + 1);
  }

  // Step 6: Filter out slide-only actions for non-slide scenes (defense in depth)
  if (sceneType && sceneType !== 'slide') {
    const before = actions.length;
    const filtered = actions.filter((a) => !SLIDE_ONLY_ACTIONS.includes(a.type as ActionType));
    if (filtered.length < before) {
      log.info(`Stripped ${before - filtered.length} slide-only action(s) from ${sceneType} scene`);
    }
    return filtered;
  }

  // Step 7: Filter by allowedActions whitelist (defense in depth for role-based isolation)
  // Catches hallucinated actions not in the agent's permitted set, e.g. a student agent
  // mimicking spotlight/laser after seeing teacher actions in chat history.
  if (allowedActions && allowedActions.length > 0) {
    const before = actions.length;
    const filtered = actions.filter((a) => a.type === 'speech' || allowedActions.includes(a.type));
    if (filtered.length < before) {
      log.info(
        `Stripped ${before - filtered.length} disallowed action(s) by allowedActions whitelist`,
      );
    }
    return filtered;
  }

  return actions;
}

/**
 * Parse the preferred slide narration format: one object per speech segment,
 * with an optional focusTargetId. A legacy spotlight action immediately before
 * a text object is also folded into the following segment for compatibility.
 */
export function parseLectureSegmentsFromStructuredOutput(response: string): LectureSegment[] {
  const items = parseJsonArrayResponse(response);
  if (!items || !Array.isArray(items)) return [];

  const segments: LectureSegment[] = [];
  let pendingFocusTargetId: string | undefined;

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const typedItem = item as Record<string, unknown>;

    if (typedItem.type === 'action') {
      const actionName = stringValue(typedItem.name || typedItem.tool_name);
      const actionParams = (typedItem.params || typedItem.parameters || {}) as Record<
        string,
        unknown
      >;
      if (actionName === 'spotlight' || actionName === 'laser') {
        pendingFocusTargetId = normalizedFocusTargetId(actionParams.elementId);
      } else {
        return [];
      }
      continue;
    }

    const text = stringValue(typedItem.content) || stringValue(typedItem.text);
    if (!text) continue;

    const explicitFocusTargetId =
      normalizedFocusTargetId(typedItem.focusTargetId) ||
      normalizedFocusTargetId(typedItem.focus_target_id) ||
      normalizedFocusTargetId(typedItem.focusTarget) ||
      normalizedFocusTargetId(typedItem.targetId) ||
      normalizedFocusTargetId(typedItem.elementId);

    segments.push({
      id: stringValue(typedItem.id),
      title: stringValue(typedItem.title) || stringValue(typedItem.label),
      text,
      focusTargetId: explicitFocusTargetId || pendingFocusTargetId,
    });
    pendingFocusTargetId = undefined;
  }

  return segments;
}
