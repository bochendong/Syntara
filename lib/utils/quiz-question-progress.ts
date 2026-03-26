import type { QuizCodeReport } from '@/lib/types/stage';

/**
 * Per-user, per-question quiz progress for a course (stage).
 * Keyed by localStorage: stageId + userId.
 */

const STORAGE_PREFIX = 'openmaic-quiz-q-v1';

export type QuizQuestionProgressStatus = 'correct' | 'incorrect';

export interface QuizQuestionProgressResult {
  questionId: string;
  correct: boolean | null;
  status: 'correct' | 'incorrect';
  earned: number;
  aiComment?: string;
  codeReport?: QuizCodeReport;
}

export interface QuizQuestionProgressRecord {
  status: QuizQuestionProgressStatus;
  updatedAt: number;
  userAnswer: string | string[] | null;
  result: QuizQuestionProgressResult;
}

type ProgressFile = Record<string, QuizQuestionProgressRecord>;

function fileKey(stageId: string, userId: string): string {
  return `${STORAGE_PREFIX}:${stageId}:${userId}`;
}

export function compositeQuestionKey(sceneId: string, questionId: string): string {
  return `${sceneId}::${questionId}`;
}

function readFile(stageId: string, userId: string): ProgressFile {
  if (typeof window === 'undefined' || !stageId || !userId) return {};
  try {
    const raw = localStorage.getItem(fileKey(stageId, userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ProgressFile;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeFile(stageId: string, userId: string, data: ProgressFile) {
  if (typeof window === 'undefined' || !stageId || !userId) return;
  try {
    localStorage.setItem(fileKey(stageId, userId), JSON.stringify(data));
  } catch {
    // ignore quota
  }
}

export function getQuestionProgress(
  stageId: string,
  userId: string,
  sceneId: string,
  questionId: string,
): QuizQuestionProgressRecord | null {
  const file = readFile(stageId, userId);
  const rec = file[compositeQuestionKey(sceneId, questionId)];
  if (!rec || typeof rec !== 'object') return null;
  if (rec.status !== 'correct' && rec.status !== 'incorrect') return null;
  return rec;
}

export function setQuestionProgress(
  stageId: string,
  userId: string,
  sceneId: string,
  questionId: string,
  record: QuizQuestionProgressRecord,
): void {
  if (!stageId || !userId) return;
  const file = readFile(stageId, userId);
  file[compositeQuestionKey(sceneId, questionId)] = record;
  writeFile(stageId, userId, file);
}

export function clearQuestionProgress(
  stageId: string,
  userId: string,
  sceneId: string,
  questionId: string,
): void {
  if (!stageId || !userId) return;
  const file = readFile(stageId, userId);
  delete file[compositeQuestionKey(sceneId, questionId)];
  writeFile(stageId, userId, file);
}

export type QuizListItemStatus = 'unanswered' | 'correct' | 'incorrect';

export function getListItemStatus(
  stageId: string,
  userId: string,
  sceneId: string,
  questionId: string,
): QuizListItemStatus {
  const rec = getQuestionProgress(stageId, userId, sceneId, questionId);
  if (!rec) return 'unanswered';
  return rec.status;
}
