import type { NextRequest } from 'next/server';
import { handleImageNotebookBriefsRequest } from '@/features/ppt-generation/server/image-notebook-quality-route';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  return handleImageNotebookBriefsRequest(req);
}
