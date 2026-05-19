import type { NextRequest } from 'next/server';
import {
  CLASSROOM_GENERATION_MAX_DURATION_SECONDS,
  handleCreateClassroomGenerationJobRequest,
} from '@/features/ppt-generation/server';

export const maxDuration = CLASSROOM_GENERATION_MAX_DURATION_SECONDS;

export async function POST(req: NextRequest) {
  return handleCreateClassroomGenerationJobRequest(req);
}
