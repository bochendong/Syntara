import { NextRequest } from 'next/server';

import {
  QuizCodeRunInputError,
  runQuizCodeSubmission,
  type QuizCodeRunInput,
} from '@/features/practice/server';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';

const log = createLogger('QuizCodeRun');

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as QuizCodeRunInput;
    const report = await runQuizCodeSubmission(body);
    return apiSuccess({ report });
  } catch (error) {
    if (error instanceof QuizCodeRunInputError) {
      return apiError(error.code, error.status, error.message);
    }

    log.error('Failed to run quiz code', error);
    return apiError('INTERNAL_ERROR', 500, 'Failed to run quiz code');
  }
}
