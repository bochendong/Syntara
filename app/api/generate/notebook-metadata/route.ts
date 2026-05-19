import type { NextRequest } from 'next/server';
import {
  handleNotebookMetadataGenerationRequest,
  NOTEBOOK_METADATA_MAX_DURATION_SECONDS,
} from '@/features/ppt-generation/server';

export const maxDuration = NOTEBOOK_METADATA_MAX_DURATION_SECONDS;

export async function POST(req: NextRequest) {
  return handleNotebookMetadataGenerationRequest(req);
}
