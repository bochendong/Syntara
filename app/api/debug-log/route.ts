import fs from 'node:fs';
import { NextRequest, NextResponse } from 'next/server';

const DEBUG_LOG_PATH = '/opt/cursor/logs/debug.log';

type DebugLogPayload = {
  hypothesisId?: string;
  location?: string;
  message?: string;
  data?: Record<string, unknown>;
  timestamp?: number;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as DebugLogPayload;
    fs.appendFileSync(
      DEBUG_LOG_PATH,
      JSON.stringify({
        hypothesisId: body.hypothesisId || 'unknown',
        location: body.location || 'unknown',
        message: body.message || 'unknown',
        data: body.data || {},
        timestamp: body.timestamp ?? Date.now(),
      }) + '\n',
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to write debug log' },
      { status: 500 },
    );
  }
}
