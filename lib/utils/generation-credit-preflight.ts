'use client';

import { backendJson } from '@/lib/utils/backend-api';
import { formatComputeCreditsLabel } from '@/lib/utils/credits';
export {
  estimateNotebookGenerationComputeCredits,
  estimateReviewRouteComputeCredits,
  type NotebookGenerationCreditEstimateInput,
  type ReviewRouteCreditEstimateInput,
} from '@/lib/utils/generation-credit-estimates';

type CreditsResponse = {
  balances: {
    compute: number;
  };
};

export type ComputeCreditPreflightResult = {
  requiredCredits: number;
  availableCredits: number;
};

function safeInt(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.max(0, Math.round(value));
}

export async function getComputeCreditBalance(): Promise<number> {
  const response = await backendJson<CreditsResponse>('/api/profile/credits?pageSize=1');
  return safeInt(response.balances.compute);
}

export async function confirmComputeCreditsForGeneration(args: {
  requiredCredits: number;
  actionLabel: string;
}): Promise<ComputeCreditPreflightResult> {
  const requiredCredits = safeInt(args.requiredCredits);
  const availableCredits = await getComputeCreditBalance();
  if (availableCredits < requiredCredits) {
    const missing = requiredCredits - availableCredits;
    const message = `${args.actionLabel}预计需要 ${formatComputeCreditsLabel(requiredCredits)}，你现在还有 ${formatComputeCreditsLabel(
      availableCredits,
    )}，可能不太够，还差大约 ${formatComputeCreditsLabel(missing)}。\n\n建议先补一点算力再生成，会比较稳。你确定还要继续吗？`;
    if (typeof window !== 'undefined' && !window.confirm(message)) {
      throw new Error(
        `${args.actionLabel}已取消。你现在还有 ${formatComputeCreditsLabel(
          availableCredits,
        )}，预计需要 ${formatComputeCreditsLabel(requiredCredits)}。`,
      );
    }
  }
  return { requiredCredits, availableCredits };
}
