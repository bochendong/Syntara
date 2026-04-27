export type CreditsBalances = {
  cash: number;
  compute: number;
  purchase: number;
};

export const CREDITS_BALANCES_CHANGED_EVENT = 'openmaic:credits-balances-changed';

type CreditsBalancesChangedDetail = {
  balances?: CreditsBalances;
};

export function notifyCreditsBalancesChanged(balances?: CreditsBalances) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<CreditsBalancesChangedDetail>(CREDITS_BALANCES_CHANGED_EVENT, {
      detail: balances ? { balances } : {},
    }),
  );
}

export function subscribeCreditsBalancesChanged(
  listener: (balances?: CreditsBalances) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const handler = (event: Event) => {
    listener((event as CustomEvent<CreditsBalancesChangedDetail>).detail?.balances);
  };

  window.addEventListener(CREDITS_BALANCES_CHANGED_EVENT, handler);
  return () => window.removeEventListener(CREDITS_BALANCES_CHANGED_EVENT, handler);
}
