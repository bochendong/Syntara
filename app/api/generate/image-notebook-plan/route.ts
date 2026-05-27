import type { NextRequest } from 'next/server';
import { handleImageNotebookPlanRequest } from '@/features/ppt-generation/server/image-notebook-plan-route';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  return handleImageNotebookPlanRequest(req);
}
