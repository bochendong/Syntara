import type { NextRequest } from 'next/server';
import { handleCreateClassroomGenerationJobRequest } from '@/features/ppt-generation/server';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  return handleCreateClassroomGenerationJobRequest(req);
}
