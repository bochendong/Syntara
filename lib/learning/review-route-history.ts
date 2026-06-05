'use client';

import type { ReviewRoute } from '@/lib/learning/review-route-types';

const REVIEW_ROUTE_HISTORY_PREFIX = 'synatra-review-route-history-v1';
const MAX_REVIEW_ROUTE_HISTORY = 20;
const MIN_REVIEW_ROUTE_HISTORY = 3;
const MAX_REVIEW_ROUTE_HISTORY_BYTES = 512 * 1024;

export type ReviewRouteHistorySource = 'wrong' | 'comprehensive' | 'ai';

export interface ReviewRouteHistoryItem {
  id: string;
  notebookId: string;
  notebookName: string;
  route: ReviewRoute;
  createdAt: number;
  source: ReviewRouteHistorySource;
  stats: {
    layerCount: number;
    nodeCount: number;
    knowledgePointCount: number;
    weakPointCount: number;
  };
}

function historyKey(userId: string, notebookId: string): string {
  return `${REVIEW_ROUTE_HISTORY_PREFIX}:${notebookId}:${userId}`;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function normalizeHistoryItem(input: ReviewRouteHistoryItem): ReviewRouteHistoryItem {
  return {
    ...input,
    source: input.source ?? 'ai',
    stats: {
      layerCount: input.stats?.layerCount ?? input.route.layers.length,
      nodeCount:
        input.stats?.nodeCount ??
        input.route.layers.reduce((sum, layer) => sum + layer.nodes.length, 0),
      knowledgePointCount: input.stats?.knowledgePointCount ?? input.route.knowledgePoints.length,
      weakPointCount: input.stats?.weakPointCount ?? 0,
    },
  };
}

export function listReviewRouteHistory(
  userId: string,
  notebookId: string,
): ReviewRouteHistoryItem[] {
  if (typeof window === 'undefined' || !userId || !notebookId) return [];
  try {
    const raw = localStorage.getItem(historyKey(userId, notebookId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ReviewRouteHistoryItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeHistoryItem).slice(0, MAX_REVIEW_ROUTE_HISTORY);
  } catch {
    return [];
  }
}

function saveReviewRouteHistory(
  userId: string,
  notebookId: string,
  items: ReviewRouteHistoryItem[],
): void {
  if (typeof window === 'undefined' || !userId || !notebookId) return;
  let nextItems = items.slice(0, MAX_REVIEW_ROUTE_HISTORY);
  try {
    while (nextItems.length > MIN_REVIEW_ROUTE_HISTORY) {
      const serialized = JSON.stringify(nextItems);
      if (byteLength(serialized) <= MAX_REVIEW_ROUTE_HISTORY_BYTES) {
        localStorage.setItem(historyKey(userId, notebookId), serialized);
        return;
      }
      nextItems = nextItems.slice(0, Math.max(MIN_REVIEW_ROUTE_HISTORY, nextItems.length - 1));
    }
    localStorage.setItem(historyKey(userId, notebookId), JSON.stringify(nextItems));
  } catch {
    // Review history should never block route generation.
  }
}

export function addReviewRouteHistoryItem(args: {
  userId: string;
  notebookId: string;
  notebookName: string;
  route: ReviewRoute;
  weakPointCount: number;
  source?: ReviewRouteHistorySource;
}): ReviewRouteHistoryItem {
  const item: ReviewRouteHistoryItem = {
    id: `${args.notebookId}:${Date.now()}`,
    notebookId: args.notebookId,
    notebookName: args.notebookName,
    route: args.route,
    createdAt: Date.now(),
    source: args.source ?? 'ai',
    stats: {
      layerCount: args.route.layers.length,
      nodeCount: args.route.layers.reduce((sum, layer) => sum + layer.nodes.length, 0),
      knowledgePointCount: args.route.knowledgePoints.length,
      weakPointCount: args.weakPointCount,
    },
  };
  const next = [
    item,
    ...listReviewRouteHistory(args.userId, args.notebookId).filter((entry) => entry.id !== item.id),
  ];
  saveReviewRouteHistory(args.userId, args.notebookId, next);
  return item;
}

export function deleteReviewRouteHistoryItem(args: {
  userId: string;
  notebookId: string;
  routeId: string;
}): ReviewRouteHistoryItem[] {
  const next = listReviewRouteHistory(args.userId, args.notebookId).filter(
    (entry) => entry.id !== args.routeId,
  );
  saveReviewRouteHistory(args.userId, args.notebookId, next);
  return next;
}
