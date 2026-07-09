/**
 * Stateless Multi-Agent Generation
 *
 * Single-pass generation with structured JSON Array output format:
 * [{"type":"action","name":"...","params":{...}},{"type":"text","content":"natural speech"},...]
 *
 * Key design decisions:
 * - Backend is stateless (all state in request/response)
 * - Single generation pass (no generate/tool/loop)
 * - Text is natural teacher speech, NOT meta-commentary
 * - Tool calls are silent actions - students see results only
 * - Action and text objects can freely interleave in the array
 * - Uses partial-json for robust streaming of incomplete JSON
 *
 * Multi-agent orchestration:
 * - When multiple agents are configured, a director agent decides who speaks
 * - Uses LangGraph StateGraph for the orchestration loop
 * - Events are streamed via LangGraph's custom stream mode
 */

import type { LanguageModel } from 'ai';
import type { StatelessChatRequest, StatelessEvent, ParsedAction } from '@/lib/types/chat';
import type { ThinkingConfig } from '@/lib/types/provider';
import type { WhiteboardActionRecord } from './director-prompt';
import { createOrchestrationGraph, buildInitialState } from './director-graph';
import { parse as parsePartialJson, Allow } from 'partial-json';
import { jsonrepair } from 'jsonrepair';
import { createLogger } from '@/lib/logger';

const log = createLogger('StatelessGenerate');

// ==================== Structured Output Parser ====================

/**
 * Parser state for incremental JSON Array parsing.
 *
 * Accumulates raw text from the LLM stream. Once the opening `[` is found,
 * uses `partial-json` to incrementally parse the growing array. Emits new
 * complete items as they appear, and streams partial text content deltas
 * for the last (potentially incomplete) text item.
 */
interface ParserState {
  /** Accumulated raw text from the LLM */
  buffer: string;
  /** Whether we've found the opening `[` */
  jsonStarted: boolean;
  /** Number of fully processed (emitted) items */
  lastParsedItemCount: number;
  /** Length of text content already emitted for the trailing partial text item */
  lastPartialTextLength: number;
  /** Length of text content already emitted per partial item index */
  partialTextLengths: Record<number, number>;
  /** Whether parsing is complete (closing `]` found) */
  isDone: boolean;
}

/**
 * Create initial parser state
 */
export function createParserState(): ParserState {
  return {
    buffer: '',
    jsonStarted: false,
    lastParsedItemCount: 0,
    lastPartialTextLength: 0,
    partialTextLengths: {},
    isDone: false,
  };
}

/**
 * Result from parsing a chunk
 */
export interface ParseResult {
  textChunks: string[];
  actions: ParsedAction[];
  isDone: boolean;
  /** Ordered sequence recording original interleaving of text and action segments */
  ordered: Array<{ type: 'text'; index: number } | { type: 'action'; index: number }>;
}

/**
 * Emit a single parsed item into the result, returning updated segment indices.
 */
function emitItem(
  item: Record<string, unknown>,
  result: ParseResult,
  textSegmentIndex: number,
  actionSegmentIndex: number,
): { textSegmentIndex: number; actionSegmentIndex: number } {
  if (item.type === 'text') {
    const content = (item.content as string) || '';
    if (content) {
      result.textChunks.push(content);
      // Use per-call array index (not cumulative segment index) so that
      // director-graph can read result.textChunks[entry.index] correctly.
      result.ordered.push({
        type: 'text',
        index: result.textChunks.length - 1,
      });
      return { textSegmentIndex: textSegmentIndex + 1, actionSegmentIndex };
    }
  } else if (item.type === 'action') {
    // Support both new format (name/params) and legacy format (tool_name/parameters)
    const action: ParsedAction = {
      actionId:
        (item.action_id as string) || `action-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      actionName: (item.name || item.tool_name) as string,
      params: (item.params || item.parameters || {}) as Record<string, unknown>,
    };
    result.actions.push(action);
    // Use per-call array index (not cumulative segment index) so that
    // director-graph can read result.actions[entry.index] correctly.
    result.ordered.push({ type: 'action', index: result.actions.length - 1 });
    return { textSegmentIndex, actionSegmentIndex: actionSegmentIndex + 1 };
  }
  return { textSegmentIndex, actionSegmentIndex };
}

function stripJsonFence(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

function escapeLooseContentQuotes(input: string): string {
  const target = '"content"';
  let output = '';
  let index = 0;

  while (index < input.length) {
    if (!input.startsWith(target, index)) {
      output += input[index];
      index += 1;
      continue;
    }

    output += target;
    index += target.length;

    while (index < input.length && /\s/.test(input[index])) output += input[index++];
    if (input[index] !== ':') continue;
    output += input[index++];
    while (index < input.length && /\s/.test(input[index])) output += input[index++];
    if (input[index] !== '"') continue;

    output += input[index++];
    while (index < input.length) {
      const char = input[index];
      if (char === '\\') {
        output += input.slice(index, Math.min(input.length, index + 2));
        index += 2;
        continue;
      }
      if (char === '"') {
        let lookahead = index + 1;
        while (lookahead < input.length && /\s/.test(input[lookahead])) lookahead += 1;
        if (lookahead >= input.length || input[lookahead] === ',' || input[lookahead] === '}') {
          output += char;
          index += 1;
          break;
        }
        output += '\\"';
        index += 1;
        continue;
      }
      output += char;
      index += 1;
    }
  }

  return output;
}

function parseCompleteStructuredItems(input: string): Record<string, unknown>[] | null {
  const stripped = stripJsonFence(input);
  const firstArray = stripped.indexOf('[');
  const firstObject = stripped.indexOf('{');
  const starts = [firstArray, firstObject].filter((index) => index >= 0);
  if (starts.length === 0) return null;

  const jsonText = stripped.slice(Math.min(...starts)).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonrepair(escapeLooseContentQuotes(jsonText)));
  } catch {
    try {
      parsed = JSON.parse(jsonrepair(jsonText));
    } catch {
      return null;
    }
  }

  const items = Array.isArray(parsed) ? parsed : [parsed];
  const structuredItems = items.filter((item): item is Record<string, unknown> =>
    Boolean(item && typeof item === 'object'),
  );
  return structuredItems.length > 0 ? structuredItems : null;
}

function emitCompleteStructuredItems(input: string): ParseResult | null {
  const items = parseCompleteStructuredItems(input);
  if (!items) return null;

  const result: ParseResult = {
    textChunks: [],
    actions: [],
    isDone: true,
    ordered: [],
  };
  let textSegmentIndex = 0;
  let actionSegmentIndex = 0;

  for (const item of items) {
    const indices = emitItem(item, result, textSegmentIndex, actionSegmentIndex);
    textSegmentIndex = indices.textSegmentIndex;
    actionSegmentIndex = indices.actionSegmentIndex;
  }

  return result.textChunks.length > 0 || result.actions.length > 0 ? result : null;
}

function findStructuredArrayStart(buffer: string): number {
  let index = 0;
  while (index < buffer.length && /\s/.test(buffer[index])) index++;

  if (buffer.slice(index, index + 3) === '```') {
    const newlineIndex = buffer.indexOf('\n', index);
    if (newlineIndex === -1) return -1;
    index = newlineIndex + 1;
    while (index < buffer.length && /\s/.test(buffer[index])) index++;
  }

  return buffer[index] === '[' ? index : -1;
}

function isStructuredArrayClosed(buffer: string): boolean {
  let inString = false;
  let escaped = false;
  let depth = 0;
  let started = false;

  for (let index = 0; index < buffer.length; index++) {
    const char = buffer[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (inString) {
      if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '[') {
      depth += 1;
      started = true;
      continue;
    }

    if (char === ']') {
      depth -= 1;
      if (depth < 0) return false;
      if (depth === 0) {
        for (let restIndex = index + 1; restIndex < buffer.length; restIndex++) {
          if (!/\s/.test(buffer[restIndex])) return false;
        }
        return started;
      }
    }
  }

  return false;
}

/**
 * Parse streaming chunks of structured JSON Array output.
 *
 * The LLM is expected to produce a JSON array like:
 * [{"type":"action","name":"spotlight","params":{"elementId":"img_1"}},
 *  {"type":"text","content":"Hello students..."},...]
 *
 * This parser:
 * 1. Accumulates chunks into a buffer
 * 2. Skips any prefix before `[` (e.g. ```json\n, explanatory text)
 * 3. Uses partial-json to incrementally parse the growing array
 * 4. Emits new complete items (action→toolCall, text→textChunk)
 * 5. For the trailing incomplete text item, emits content deltas for streaming
 * 6. Marks done when the buffer contains the closing `]`
 *
 * @param chunk - New chunk of text to parse
 * @param state - Current parser state (mutated in place)
 * @returns Parsed text chunks and tool calls from this chunk
 */
export function parseStructuredChunk(chunk: string, state: ParserState): ParseResult {
  const result: ParseResult = {
    textChunks: [],
    actions: [],
    isDone: false,
    ordered: [],
  };

  if (state.isDone) {
    return result;
  }

  state.buffer += chunk;

  // Step 1: Find the opening `[` if not yet found
  if (!state.jsonStarted) {
    const bracketIndex = findStructuredArrayStart(state.buffer);
    if (bracketIndex === -1) {
      return result;
    }
    // Trim everything before `[` (markdown fences, explanatory text, etc.)
    state.buffer = state.buffer.slice(bracketIndex);
    state.jsonStarted = true;
  }

  // Step 2: Check if the array is complete (closing `]` found)
  const isArrayClosed = isStructuredArrayClosed(state.buffer);

  // Step 3: Try incremental parse — jsonrepair first (fixes unescaped quotes), fallback to partial-json
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial-json returns any[]
  let parsed: any[];
  try {
    const repaired = jsonrepair(escapeLooseContentQuotes(state.buffer));
    parsed = JSON.parse(repaired);
  } catch {
    try {
      parsed = parsePartialJson(
        escapeLooseContentQuotes(state.buffer),
        Allow.ARR | Allow.OBJ | Allow.STR | Allow.NUM | Allow.BOOL | Allow.NULL,
      );
    } catch {
      try {
        const repaired = jsonrepair(state.buffer);
        parsed = JSON.parse(repaired);
      } catch {
        return result;
      }
    }
  }

  if (!Array.isArray(parsed)) {
    return result;
  }

  // Step 4: Determine how many items are fully complete
  // When the array is closed, all items are complete.
  // When still streaming, items [0..N-2] are complete; item [N-1] may be partial.
  const completeUpTo = isArrayClosed ? parsed.length : Math.max(0, parsed.length - 1);

  // Count segment indices for items already emitted
  let textSegmentIndex = 0;
  let actionSegmentIndex = 0;
  for (let i = 0; i < state.lastParsedItemCount && i < parsed.length; i++) {
    const item = parsed[i];
    if (item?.type === 'text') textSegmentIndex++;
    else if (item?.type === 'action') actionSegmentIndex++;
  }

  // Step 5: Emit newly completed items
  for (let i = state.lastParsedItemCount; i < completeUpTo; i++) {
    const item = parsed[i];
    if (!item || typeof item !== 'object') continue;

    // If this item was previously the trailing partial text item, we've already
    // streamed its content incrementally. Only emit the remaining delta, not the full content.
    const priorPartialTextLength = state.partialTextLengths[i] ?? 0;
    if (priorPartialTextLength > 0 && item.type === 'text') {
      const content = item.content || '';
      const remaining = content.slice(priorPartialTextLength);
      if (remaining) {
        result.textChunks.push(remaining);
        // Use per-call array index for consistency with emitItem.
        result.ordered.push({
          type: 'text',
          index: result.textChunks.length - 1,
        });
      }
      textSegmentIndex++;
      state.lastPartialTextLength = 0;
      delete state.partialTextLengths[i];
      continue;
    }

    const indices = emitItem(item, result, textSegmentIndex, actionSegmentIndex);
    textSegmentIndex = indices.textSegmentIndex;
    actionSegmentIndex = indices.actionSegmentIndex;
  }

  state.lastParsedItemCount = completeUpTo;

  // Step 6: Stream partial text delta for the trailing item
  if (!isArrayClosed && parsed.length > completeUpTo) {
    const itemIndex = parsed.length - 1;
    const lastItem = parsed[parsed.length - 1];
    if (lastItem && typeof lastItem === 'object' && lastItem.type === 'text') {
      const content = lastItem.content || '';
      const emittedLength = state.partialTextLengths[itemIndex] ?? 0;
      if (content.length > emittedLength) {
        result.textChunks.push(content.slice(emittedLength));
        state.lastPartialTextLength = content.length;
        state.partialTextLengths[itemIndex] = content.length;
      }
    }
  }

  // Step 7: Mark done if array is closed
  if (isArrayClosed) {
    state.isDone = true;
    result.isDone = true;
    state.lastParsedItemCount = parsed.length;
    state.lastPartialTextLength = 0;
    state.partialTextLengths = {};
  }

  return result;
}

/**
 * Finalize parsing after the stream ends.
 *
 * Handles the case where the model never produced a valid JSON array —
 * e.g. it output plain text instead of the expected `[...]` format.
 * Emits whatever content is in the buffer as a single text item so the
 * frontend can still display something rather than showing nothing.
 */
export function finalizeParser(state: ParserState): ParseResult {
  const result: ParseResult = {
    textChunks: [],
    actions: [],
    isDone: true,
    ordered: [],
  };

  if (state.isDone) {
    return result;
  }

  const content = state.buffer.trim();
  if (!content) {
    return result;
  }

  if (!state.jsonStarted) {
    const completeStructured = emitCompleteStructuredItems(content);
    if (completeStructured) {
      state.isDone = true;
      return completeStructured;
    }

    // Model never output `[` — treat entire buffer as plain text
    result.textChunks.push(content);
    result.ordered.push({ type: 'text', index: 0 });
  } else {
    // JSON started but never closed — try one final parse
    const finalChunk = parseStructuredChunk('', state);
    result.textChunks.push(...finalChunk.textChunks);
    result.actions.push(...finalChunk.actions);
    result.ordered.push(...finalChunk.ordered);

    // If final parse yielded nothing, emit raw text after `[` as fallback
    if (result.textChunks.length === 0 && result.actions.length === 0) {
      const bracketIndex = content.indexOf('[');
      const raw = content.slice(bracketIndex + 1).trim();
      if (raw) {
        result.textChunks.push(raw);
        result.ordered.push({ type: 'text', index: 0 });
      }
    }
  }

  state.isDone = true;
  return result;
}

// ==================== Main Generation Function ====================

/**
 * Stateless generation with streaming via LangGraph orchestration
 *
 * @param request - The chat request with full state
 * @param abortSignal - Signal for cancellation
 * @yields StatelessEvent objects for streaming
 */
export async function* statelessGenerate(
  request: StatelessChatRequest,
  abortSignal: AbortSignal,
  languageModel: LanguageModel,
  thinkingConfig?: ThinkingConfig,
): AsyncGenerator<StatelessEvent> {
  log.info(
    `[StatelessGenerate] Starting orchestration for agents: ${request.config.agentIds.join(', ')}`,
  );
  log.info(
    `[StatelessGenerate] Message count: ${request.messages.length}, turnCount: ${request.directorState?.turnCount ?? 0}`,
  );

  try {
    const graph = createOrchestrationGraph();
    const initialState = buildInitialState(request, languageModel, thinkingConfig);

    const stream = await graph.stream(initialState, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      streamMode: 'custom' as any,
      signal: abortSignal,
    });

    let totalActions = 0;
    let totalAgents = 0;
    // Tracks whether the agent dispatched in this turn produced any text or actions.
    // Each statelessGenerate call handles exactly one agent turn (client loops externally).
    let agentHadContent = false;

    // Track current agent turn to build updated directorState
    let currentAgentId: string | null = null;
    let currentAgentName: string | null = null;
    let contentPreview = '';
    let agentActionCount = 0;
    const agentWbActions: WhiteboardActionRecord[] = [];

    for await (const chunk of stream) {
      const event = chunk as StatelessEvent;

      if (event.type === 'agent_start') {
        totalAgents++;
        currentAgentId = event.data.agentId;
        currentAgentName = event.data.agentName;
        contentPreview = '';
        agentActionCount = 0;
        agentWbActions.length = 0;
      }
      if (event.type === 'text_delta' && contentPreview.length < 100) {
        contentPreview = (contentPreview + event.data.content).slice(0, 100);
        agentHadContent = true;
      }
      if (event.type === 'action') {
        totalActions++;
        agentActionCount++;
        agentHadContent = true;
        if (event.data.actionName.startsWith('wb_')) {
          agentWbActions.push({
            actionName: event.data.actionName as WhiteboardActionRecord['actionName'],
            agentId: event.data.agentId,
            agentName: currentAgentName || event.data.agentId,
            params: event.data.params,
          });
        }
      }

      yield event;
    }

    // Build updated directorState from incoming state + this turn's data
    const incoming = request.directorState;
    const prevResponses = incoming?.agentResponses ?? [];
    const prevLedger = incoming?.whiteboardLedger ?? [];
    const prevTurnCount = incoming?.turnCount ?? 0;

    const directorState =
      totalAgents > 0
        ? {
            turnCount: prevTurnCount + 1,
            agentResponses: [
              ...prevResponses,
              {
                agentId: currentAgentId!,
                agentName: currentAgentName || currentAgentId!,
                contentPreview,
                actionCount: agentActionCount,
                whiteboardActions: [...agentWbActions],
              },
            ],
            whiteboardLedger: [...prevLedger, ...agentWbActions],
          }
        : {
            turnCount: prevTurnCount,
            agentResponses: prevResponses,
            whiteboardLedger: prevLedger,
          };

    yield {
      type: 'done',
      data: { totalActions, totalAgents, agentHadContent, directorState },
    };

    log.info(
      `[StatelessGenerate] Completed. Agents: ${totalAgents}, Actions: ${totalActions}, hadContent: ${agentHadContent}, turnCount: ${directorState.turnCount}`,
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      yield { type: 'error', data: { message: 'Request interrupted' } };
    } else {
      log.error('[StatelessGenerate] Error:', error);
      yield {
        type: 'error',
        data: {
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
}
