import type { NextRequest } from 'next/server';
import { handleImageNotebookPlanStreamRequest } from '@/features/ppt-generation/server/image-notebook-plan-route';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  return handleImageNotebookPlanStreamRequest(req);
}
