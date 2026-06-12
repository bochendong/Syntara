import { NextResponse } from 'next/server';
import { AGENT_CAPABILITY_REGISTRY, validateAgentCapabilityRegistry } from '@/features/agent';

export async function GET() {
  const issues = validateAgentCapabilityRegistry();
  return NextResponse.json({
    ...AGENT_CAPABILITY_REGISTRY,
    validation: {
      ok: issues.length === 0,
      issues,
    },
  });
}
