/**
 * AI SDK Adapter for LangGraph
 *
 * Provides LangChain-compatible interface for LLM calls.
 * Uses the unified callLLM / streamLLM layer which goes through
 * Vercel AI SDK, supporting all providers (OpenAI, Anthropic, Google, etc.).
 */

import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { ChatResult } from '@langchain/core/outputs';
import type { ImagePart, LanguageModel, ModelMessage, TextPart, UserContent } from 'ai';

import { callLLM, streamLLM } from '@/lib/ai/llm';
import type { ThinkingConfig } from '@/lib/types/provider';
import { createLogger } from '@/lib/logger';

const log = createLogger('AISdkAdapter');

function mediaTypeFromDataUrl(value: string): string | undefined {
  return /^data:([^;,]+)[;,]/.exec(value)?.[1];
}

function contentBlockRecord(block: unknown): Record<string, unknown> | null {
  return block && typeof block === 'object' ? (block as Record<string, unknown>) : null;
}

function langChainContentToText(content: BaseMessage['content']): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return String(content ?? '');
  return content
    .map((block) => {
      const record = contentBlockRecord(block);
      if (!record) return '';
      if (record.type === 'text' && typeof record.text === 'string') return record.text;
      if (record.type === 'image' || record.type === 'image_url') return '[Image attachment]';
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function imageUrlFromBlock(record: Record<string, unknown>): string | null {
  if (typeof record.image === 'string') return record.image;
  const imageUrl = record.image_url;
  if (typeof imageUrl === 'string') return imageUrl;
  if (imageUrl && typeof imageUrl === 'object') {
    const url = (imageUrl as Record<string, unknown>).url;
    return typeof url === 'string' ? url : null;
  }
  return null;
}

function langChainContentToUserContent(content: BaseMessage['content']): UserContent {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return String(content ?? '');

  const parts: Array<TextPart | ImagePart> = [];
  for (const block of content) {
    const record = contentBlockRecord(block);
    if (!record) continue;

    if (record.type === 'text' && typeof record.text === 'string') {
      parts.push({ type: 'text', text: record.text });
      continue;
    }

    if (record.type === 'image' || record.type === 'image_url') {
      const image = imageUrlFromBlock(record);
      if (!image) continue;
      const mediaType =
        (typeof record.mediaType === 'string' && record.mediaType) ||
        (typeof record.mime_type === 'string' && record.mime_type) ||
        mediaTypeFromDataUrl(image);
      parts.push({ type: 'image', image, mediaType });
    }
  }

  return parts.length > 0 ? parts : '';
}

/**
 * Stream chunk types for streaming generation
 */
export type StreamChunk =
  | { type: 'delta'; content: string }
  | {
      type: 'tool_calls';
      toolCalls: {
        id: string;
        index: number;
        type: 'function';
        function: { name: string; arguments: string };
      }[];
    }
  | { type: 'done'; content: string };

/**
 * Adapter to use any AI SDK LanguageModel with LangGraph
 *
 * Accepts a LanguageModel instance (from getModel()) instead of raw
 * API credentials, enabling support for all providers.
 */
export class AISdkLangGraphAdapter extends BaseChatModel {
  private languageModel: LanguageModel;
  private thinking?: ThinkingConfig;

  constructor(languageModel: LanguageModel, thinking?: ThinkingConfig) {
    super({});
    this.languageModel = languageModel;
    this.thinking = thinking;
  }

  _llmType(): string {
    return 'ai-sdk';
  }

  _combineLLMOutput() {
    return {};
  }

  /**
   * Convert LangChain messages to AI SDK message format
   */
  private convertMessages(messages: BaseMessage[]): ModelMessage[] {
    return messages.map((msg) => {
      if (msg instanceof HumanMessage) {
        return { role: 'user' as const, content: langChainContentToUserContent(msg.content) };
      } else if (msg instanceof AIMessage) {
        return { role: 'assistant' as const, content: langChainContentToText(msg.content) };
      } else if (msg instanceof SystemMessage) {
        return { role: 'system' as const, content: langChainContentToText(msg.content) };
      } else {
        return { role: 'user' as const, content: langChainContentToUserContent(msg.content) };
      }
    });
  }

  async _generate(
    messages: BaseMessage[],
    _options?: this['ParsedCallOptions'],
    _runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    const aiMessages = this.convertMessages(messages);

    try {
      const result = await callLLM(
        {
          model: this.languageModel,
          messages: aiMessages,
        },
        'chat-adapter',
        undefined,
        this.thinking,
      );

      const content = result.text || '';

      log.info('[AI SDK Adapter] Response:', {
        textLength: content.length,
      });

      // Create AI message
      const aiMessage = new AIMessage({ content });

      return {
        generations: [
          {
            text: content,
            message: aiMessage,
          },
        ],
        llmOutput: {},
      };
    } catch (error) {
      log.error('[AI SDK Adapter Error]', error);
      throw error;
    }
  }

  /**
   * Stream generate with text deltas
   *
   * Yields chunks of text as they arrive, then yields done with full content.
   * Uses streamLLM which goes through Vercel AI SDK's streamText.
   */
  async *streamGenerate(
    messages: BaseMessage[],
    options?: { tools?: Record<string, unknown>; signal?: AbortSignal },
  ): AsyncGenerator<StreamChunk> {
    const aiMessages = this.convertMessages(messages);

    const result = await streamLLM(
      {
        model: this.languageModel,
        messages: aiMessages,
        abortSignal: options?.signal,
      },
      'chat-adapter-stream',
      this.thinking,
    );

    let fullContent = '';

    for await (const part of result.fullStream) {
      if (part.type === 'text-delta' && part.text) {
        fullContent += part.text;
        yield { type: 'delta', content: part.text };
      }
    }

    if (!fullContent.trim()) {
      const finalContent = await result.content;
      const finalText = finalContent
        .filter((part): part is Extract<(typeof finalContent)[number], { type: 'text' }> =>
          Boolean(part && part.type === 'text'),
        )
        .map((part) => part.text)
        .join('');
      if (finalText?.trim()) {
        fullContent = finalText;
      }
    }

    // Yield done with full content
    yield { type: 'done', content: fullContent };
  }
}
