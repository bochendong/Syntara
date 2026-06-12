import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { NextResponse } from 'next/server';
import { createOpenMaicMcpServer } from '@/features/agent/server/mcp-server';

export const runtime = 'nodejs';

const allowHeaders = {
  Allow: 'POST, OPTIONS',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, MCP-Protocol-Version, MCP-Session-Id, Authorization',
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: allowHeaders,
  });
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST for MCP Streamable HTTP requests.' },
    { status: 405, headers: allowHeaders },
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Method not allowed. This stateless MCP endpoint does not manage sessions.' },
    { status: 405, headers: allowHeaders },
  );
}

export async function POST(request: Request) {
  const server = createOpenMaicMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } catch (error) {
    console.error('OpenMAIC MCP request failed', error);
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      },
      { status: 500 },
    );
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}
