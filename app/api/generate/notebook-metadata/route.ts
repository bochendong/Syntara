import type { NextRequest } from 'next/server';
import { handleNotebookMetadataGenerationRequest } from '@/features/ppt-generation/server';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  return handleNotebookMetadataGenerationRequest(req);
}
