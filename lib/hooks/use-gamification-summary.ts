'use client';

import { useCallback, useEffect, useState } from 'react';
import { backendJson } from '@/lib/utils/backend-api';
import { notifyCreditsBalancesChanged } from '@/lib/utils/credits-balance-events';
import type {
  GamificationClaimKind,
  GamificationGachaBannerId,
  GamificationGachaDrawResponse,
  GamificationEventResponse,
  GamificationSummaryResponse,
} from '@/lib/types/gamification';

type EventPayload =
  | {
      type: 'lesson_milestone_completed';
      courseId: string;
      courseName?: string;
      progressPercent: number;
      checkpointCount: number;
    }
  | {
      type: 'quiz_completed';
      sceneId: string;
      sceneTitle?: string;
      referenceKey: string;
      questionCount: number;
      correctCount: number;
      accuracyPercent: number;
    }
  | {
      type: 'review_completed';
      sceneId: string;
      sceneTitle?: string;
      referenceKey: string;
      hadPreviousIncorrect: boolean;
    };

export function useGamificationSummary(autoLoad = true) {
  const [summary, setSummary] = useState<GamificationSummaryResponse | null>(null);
  const [loading, setLoading] = useState(autoLoad);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await backendJson<GamificationSummaryResponse>('/api/gamification/summary');
      setSummary(data);
      notifyCreditsBalancesChanged(data.balances);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载成长数据失败';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!autoLoad) return;
    void refresh().catch(() => undefined);
  }, [autoLoad, refresh]);

  const claim = useCallback(
    async (kind: GamificationClaimKind) => {
      const result = await backendJson<GamificationEventResponse>('/api/gamification/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
      });
      await refresh().catch(() => undefined);
      return result;
    },
    [refresh],
  );

  const unlockCharacter = useCallback(async (characterId: string) => {
    const data = await backendJson<GamificationSummaryResponse>(
      '/api/gamification/unlock-character',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId }),
      },
    );
    setSummary(data);
    notifyCreditsBalancesChanged(data.balances);
    return data;
  }, []);

  const equipCharacter = useCallback(async (characterId: string) => {
    const data = await backendJson<GamificationSummaryResponse>(
      '/api/gamification/equip-character',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId }),
      },
    );
    setSummary(data);
    notifyCreditsBalancesChanged(data.balances);
    return data;
  }, []);

  const selectPreferredCharacter = useCallback(async (characterId: string) => {
    const data = await backendJson<GamificationSummaryResponse>(
      '/api/gamification/select-preferred-character',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId }),
      },
    );
    setSummary(data);
    notifyCreditsBalancesChanged(data.balances);
    return data;
  }, []);

  const drawGacha = useCallback(async (bannerId: GamificationGachaBannerId, drawCount: 1 | 10) => {
    const data = await backendJson<GamificationGachaDrawResponse>('/api/gamification/gacha/draw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bannerId, drawCount }),
    });
    setSummary(data.summary);
    notifyCreditsBalancesChanged(data.summary.balances);
    return data;
  }, []);

  const unlockCosmetic = useCallback(async (cosmeticKey: string) => {
    const data = await backendJson<GamificationSummaryResponse>(
      '/api/gamification/unlock-cosmetic',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cosmeticKey }),
      },
    );
    setSummary(data);
    notifyCreditsBalancesChanged(data.balances);
    return data;
  }, []);

  const sendEvent = useCallback(
    async (payload: EventPayload) => {
      const result = await backendJson<GamificationEventResponse>('/api/gamification/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await refresh().catch(() => undefined);
      return result;
    },
    [refresh],
  );

  return {
    summary,
    loading,
    error,
    refresh,
    claim,
    unlockCharacter,
    equipCharacter,
    selectPreferredCharacter,
    drawGacha,
    unlockCosmetic,
    sendEvent,
  };
}

export type UseGamificationSummaryResult = ReturnType<typeof useGamificationSummary>;
