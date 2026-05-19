import type { NextRequest } from 'next/server';
import { statelessGenerate } from '@/lib/orchestration/stateless-generate';
import type { StatelessChatRequest, StatelessEvent } from '@/lib/types/chat';
import type { ThinkingConfig } from '@/lib/types/provider';
import { apiError } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { resolveModel } from '@/lib/server/resolve-model';
import { runWithRequestContext } from '@/lib/server/request-context';

const log = createLogger('Chat API');
const HEARTBEAT_INTERVAL_MS = 15_000;

export const CHAT_STREAM_MAX_DURATION_SECONDS = 60;

function validateStatelessChatRequest(body: StatelessChatRequest) {
  if (!body.messages || !Array.isArray(body.messages)) {
    return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required field: messages');
  }

  if (!body.storeState) {
    return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required field: storeState');
  }

  if (!body.config || !body.config.agentIds || body.config.agentIds.length === 0) {
    return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required field: config.agentIds');
  }

  return null;
}

export async function handleStatelessChatRequest(req: NextRequest) {
  const encoder = new TextEncoder();

  try {
    const body: StatelessChatRequest = await req.json();
    const validationError = validateStatelessChatRequest(body);
    if (validationError) return validationError;

    const { model: languageModel, modelString } = await resolveModel(
      {
        modelString: body.model,
        apiKey: body.apiKey,
        baseUrl: body.baseUrl,
        providerType: body.providerType,
        requiresApiKey: body.requiresApiKey,
      },
      { allowOpenAIModelOverride: true },
    );

    log.info(`Processing request [model=${modelString}]`);
    log.info(
      `Agents: ${body.config.agentIds.join(', ')}, Messages: ${body.messages.length}, Turn: ${body.directorState?.turnCount ?? 0}`,
    );

    const signal = req.signal;
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    void (async () => {
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
      const startHeartbeat = () => {
        stopHeartbeat();
        heartbeatTimer = setInterval(() => {
          try {
            writer.write(encoder.encode(`:heartbeat\n\n`)).catch(() => stopHeartbeat());
          } catch {
            stopHeartbeat();
          }
        }, HEARTBEAT_INTERVAL_MS);
      };
      const stopHeartbeat = () => {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
      };

      try {
        startHeartbeat();

        const generator = await runWithRequestContext(req, '/api/chat', async () =>
          Promise.resolve(
            statelessGenerate(
              {
                ...body,
                apiKey: '',
                baseUrl: undefined,
                providerType: undefined,
                requiresApiKey: false,
              },
              signal,
              languageModel,
              { enabled: false } satisfies ThinkingConfig,
            ),
          ),
        );

        for await (const event of generator) {
          if (signal.aborted) {
            log.info('Request was aborted');
            break;
          }

          await writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }

        stopHeartbeat();
        await writer.close();
      } catch (error) {
        stopHeartbeat();

        if (signal.aborted) {
          log.info('Request aborted during streaming');
          try {
            await writer.close();
          } catch {
            /* already closed */
          }
          return;
        }

        log.error('Stream error:', error);

        try {
          const errorEvent: StatelessEvent = {
            type: 'error',
            data: {
              message: error instanceof Error ? error.message : String(error),
            },
          };
          await writer.write(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
          await writer.close();
        } catch {
          /* Writer may already be closed. */
        }
      }
    })();

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    log.error('Error:', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : 'Failed to process request',
    );
  }
}
