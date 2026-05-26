import type { NextRequest } from 'next/server';
import { handleImageNotebookQaRequest } from '@/features/ppt-generation/server/image-notebook-quality-route';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  return handleImageNotebookQaRequest(req);
}
