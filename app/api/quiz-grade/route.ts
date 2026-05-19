import { NextRequest } from 'next/server';

import { gradeQuizAnswer, type GradeQuizAnswerInput } from '@/features/practice/server';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';

const log = createLogger('Quiz Grade');

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as GradeQuizAnswerInput;

    if (!body.question || !body.userAnswer) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'question and userAnswer are required');
    }

    const gradeResult = await gradeQuizAnswer(body, req);
    return apiSuccess({ ...gradeResult });
  } catch (error) {
    log.error('Error:', error);
    return apiError('INTERNAL_ERROR', 500, 'Failed to grade answer');
  }
}
