'use client';

import {
  isLearnerCourseState,
  isPracticePlan,
  type LearnerCourseState,
  type PracticePlan,
} from '@/lib/learning/course-learner-state';
import { backendJson } from '@/lib/utils/backend-api';

type MemoryFactRecord = {
  id: string;
  valueJson: unknown;
  updatedAt?: string;
};

type MemoryFactsResponse = {
  facts: MemoryFactRecord[];
  storage?: string;
};

const LEARN_STATE_NAMESPACE = 'openmaic.learn.state';
const PRACTICE_PLAN_NAMESPACE = 'openmaic.learn.practice_plan';
const factSaveQueue = new Map<string, Promise<void>>();

function readableError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'unknown error';
  }
}

function stateFactKey(courseId: string): string {
  return `course:${courseId}:state`;
}

function planFactKey(planId: string): string {
  return `plan:${planId}`;
}

async function listUserFacts(namespace: string, key?: string, limit = 80): Promise<unknown[]> {
  const params = new URLSearchParams({
    scopeType: 'user',
    namespace,
    limit: String(limit),
  });
  if (key) params.set('key', key);
  try {
    const data = await backendJson<MemoryFactsResponse>(`/api/memory/facts?${params.toString()}`);
    return data.facts.map((fact) => fact.valueJson);
  } catch (error) {
    console.warn(
      '[learner-course-api] Failed to load persisted learner facts:',
      readableError(error),
    );
    return [];
  }
}

async function saveUserFact(args: {
  namespace: string;
  key: string;
  valueJson: unknown;
  sourceRef?: unknown;
}): Promise<boolean> {
  const queueKey = `${args.namespace}:${args.key}`;
  const previous = factSaveQueue.get(queueKey) ?? Promise.resolve();
  const operation = previous
    .catch(() => undefined)
    .then(async () => {
      await backendJson('/api/memory/facts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scopeType: 'user',
          namespace: args.namespace,
          key: args.key,
          valueJson: args.valueJson,
          confidence: 1,
          source: 'learn-v2',
          sourceRef: args.sourceRef,
        }),
      });
    });
  const trackedOperation: Promise<void> = operation
    .catch(() => undefined)
    .then(() => undefined)
    .finally(() => {
      if (factSaveQueue.get(queueKey) === trackedOperation) {
        factSaveQueue.delete(queueKey);
      }
    });
  factSaveQueue.set(queueKey, trackedOperation);
  try {
    await operation;
    return true;
  } catch (error) {
    console.warn('[learner-course-api] Failed to persist learner fact:', readableError(error));
    return false;
  }
}

export async function loadRemoteLearnerCourseState(
  courseId: string,
): Promise<LearnerCourseState | null> {
  const values = await listUserFacts(LEARN_STATE_NAMESPACE, stateFactKey(courseId), 1);
  const state = values.find((value) => isLearnerCourseState(value, courseId));
  return state && isLearnerCourseState(state, courseId) ? state : null;
}

export function saveRemoteLearnerCourseState(state: LearnerCourseState): Promise<boolean> {
  return saveUserFact({
    namespace: LEARN_STATE_NAMESPACE,
    key: stateFactKey(state.courseId),
    valueJson: state,
    sourceRef: { courseId: state.courseId, updatedAt: state.updatedAt },
  });
}

export async function loadRemotePracticePlan(planId: string): Promise<PracticePlan | null> {
  const values = await listUserFacts(PRACTICE_PLAN_NAMESPACE, planFactKey(planId), 1);
  const plan = values.find((value) => isPracticePlan(value, planId));
  return plan && isPracticePlan(plan, planId) ? plan : null;
}

export async function listRemotePracticePlans(courseId?: string): Promise<PracticePlan[]> {
  const values = await listUserFacts(PRACTICE_PLAN_NAMESPACE, undefined, 80);
  return values
    .filter((value): value is PracticePlan => isPracticePlan(value))
    .filter((plan) => !courseId || plan.courseId === courseId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveRemotePracticePlan(plan: PracticePlan): Promise<boolean> {
  return saveUserFact({
    namespace: PRACTICE_PLAN_NAMESPACE,
    key: planFactKey(plan.id),
    valueJson: plan,
    sourceRef: { courseId: plan.courseId, planId: plan.id, status: plan.status },
  });
}
