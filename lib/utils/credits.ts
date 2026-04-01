export const DEFAULT_USER_CREDITS = 500;
export const TOKENS_PER_CREDIT = 5000;

function toSafeInt(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function creditsFromPriceCents(priceCents: number | null | undefined): number {
  const cents = toSafeInt(priceCents);
  if (cents <= 0) return 0;
  return Math.max(1, Math.ceil(cents / 100));
}

export function priceCentsFromCredits(credits: number | null | undefined): number {
  const safeCredits = toSafeInt(credits);
  if (safeCredits <= 0) return 0;
  return safeCredits * 100;
}

export function creditsFromTokenUsage(totalTokens: number | null | undefined): number {
  const tokens = toSafeInt(totalTokens);
  if (tokens <= 0) return 0;
  return Math.max(1, Math.ceil(tokens / TOKENS_PER_CREDIT));
}

export function formatCreditsLabel(credits: number): string {
  return `${toSafeInt(credits)} credits`;
}
