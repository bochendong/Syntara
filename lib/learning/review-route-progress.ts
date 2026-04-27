'use client';

const REVIEW_ROUTE_PROGRESS_PREFIX = 'synatra-review-route-progress-v1';

export interface ReviewRouteProgress {
  userId: string;
  notebookId: string;
  routeId: string;
  completedNodeIds: string[];
  withdrawnRewardPoints?: number;
  withdrawnBaseRewardPoints?: number;
  withdrawnMultiplier?: number;
  withdrawnAt?: number;
  updatedAt: number;
}

function progressKey(userId: string, notebookId: string, routeId: string): string {
  return `${REVIEW_ROUTE_PROGRESS_PREFIX}:${notebookId}:${routeId}:${userId}`;
}

export function loadReviewRouteProgress(args: {
  userId: string;
  notebookId: string;
  routeId: string;
}): ReviewRouteProgress {
  const empty: ReviewRouteProgress = {
    userId: args.userId,
    notebookId: args.notebookId,
    routeId: args.routeId,
    completedNodeIds: [],
    updatedAt: Date.now(),
  };
  if (typeof window === 'undefined' || !args.userId || !args.notebookId || !args.routeId) {
    return empty;
  }
  try {
    const raw = localStorage.getItem(progressKey(args.userId, args.notebookId, args.routeId));
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as ReviewRouteProgress;
    return {
      ...empty,
      completedNodeIds: Array.isArray(parsed.completedNodeIds)
        ? Array.from(new Set(parsed.completedNodeIds.filter(Boolean)))
        : [],
      withdrawnRewardPoints:
        typeof parsed.withdrawnRewardPoints === 'number'
          ? Math.max(0, Math.round(parsed.withdrawnRewardPoints))
          : undefined,
      withdrawnBaseRewardPoints:
        typeof parsed.withdrawnBaseRewardPoints === 'number'
          ? Math.max(0, Math.round(parsed.withdrawnBaseRewardPoints))
          : undefined,
      withdrawnMultiplier:
        typeof parsed.withdrawnMultiplier === 'number'
          ? Math.max(1, Number(parsed.withdrawnMultiplier.toFixed(2)))
          : undefined,
      withdrawnAt: typeof parsed.withdrawnAt === 'number' ? parsed.withdrawnAt : undefined,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : empty.updatedAt,
    };
  } catch {
    return empty;
  }
}

export function saveReviewRouteProgress(progress: ReviewRouteProgress): void {
  if (
    typeof window === 'undefined' ||
    !progress.userId ||
    !progress.notebookId ||
    !progress.routeId
  ) {
    return;
  }
  try {
    localStorage.setItem(
      progressKey(progress.userId, progress.notebookId, progress.routeId),
      JSON.stringify({
        ...progress,
        completedNodeIds: Array.from(new Set(progress.completedNodeIds.filter(Boolean))),
        updatedAt: Date.now(),
      }),
    );
  } catch {
    // Progress should never block the review flow.
  }
}

export function markReviewRouteNodeCompleted(args: {
  userId: string;
  notebookId: string;
  routeId: string;
  nodeId: string;
}): ReviewRouteProgress {
  const current = loadReviewRouteProgress(args);
  const next: ReviewRouteProgress = {
    ...current,
    completedNodeIds: Array.from(new Set([...current.completedNodeIds, args.nodeId])),
    updatedAt: Date.now(),
  };
  saveReviewRouteProgress(next);
  return next;
}

export function withdrawReviewRouteReward(args: {
  userId: string;
  notebookId: string;
  routeId: string;
  baseRewardPoints: number;
  multiplier: number;
  rewardPoints: number;
}): ReviewRouteProgress {
  const current = loadReviewRouteProgress(args);
  const next: ReviewRouteProgress = {
    ...current,
    withdrawnBaseRewardPoints: Math.max(0, Math.round(args.baseRewardPoints)),
    withdrawnMultiplier: Math.max(1, Number(args.multiplier.toFixed(2))),
    withdrawnRewardPoints: Math.max(0, Math.round(args.rewardPoints)),
    withdrawnAt: Date.now(),
    updatedAt: Date.now(),
  };
  saveReviewRouteProgress(next);
  return next;
}

export function deleteReviewRouteProgress(args: {
  userId: string;
  notebookId: string;
  routeId: string;
}): void {
  if (typeof window === 'undefined' || !args.userId || !args.notebookId || !args.routeId) return;
  try {
    localStorage.removeItem(progressKey(args.userId, args.notebookId, args.routeId));
  } catch {
    // Deleting a review history item should not be blocked by progress cleanup.
  }
}
