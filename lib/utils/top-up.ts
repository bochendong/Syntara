import { CREDITS_PER_USD } from '@/lib/utils/credits';

export type TopUpCurrency = 'USD' | 'CAD' | 'CNY';

export type TopUpPack = {
  id: string;
  title: string;
  highlight?: string;
  credits: number;
  blurb: string;
  checkoutName: string;
  checkoutDescription: string;
  checkoutUnitAmountByCurrency: Partial<Record<TopUpCurrency, number>>;
};

export const TOP_UP_CREDITS_PER_USD = CREDITS_PER_USD;
export const STRIPE_TOP_UP_CHECKOUT_CURRENCY: TopUpCurrency = 'CAD';

/** 2026-03 附近的粗略换算，仅用于展示充值建议页，不用于真实结算。 */
export const APPROX_USD_TO_CAD = 1.36;
export const APPROX_USD_TO_CNY = 6.9;

export const TOP_UP_PACKS: TopUpPack[] = [
  {
    id: 'starter',
    title: '启程包',
    credits: 500,
    blurb: '适合先把流程跑通，等于 5 美元额度。',
    checkoutName: 'Syntara Starter Pack (500 Credits)',
    checkoutDescription:
      'One-time purchase of 500 credits for use in Syntara. Credits can be used for AI chat, course generation, and content editing. This is not a subscription and will not renew automatically.',
    checkoutUnitAmountByCurrency: {
      CAD: 680,
    },
  },
  {
    id: 'standard',
    title: '标准包',
    credits: 1000,
    blurb: '适合稳定日常使用，等于 10 美元额度。',
    checkoutName: 'Syntara Standard Pack (1000 Credits)',
    checkoutDescription:
      'One-time purchase of 1000 credits for use in Syntara. Credits can be used for AI chat, course generation, and content editing. This is not a subscription and will not renew automatically.',
    checkoutUnitAmountByCurrency: {
      CAD: 1360,
    },
  },
  {
    id: 'pro',
    title: '专业包',
    highlight: '常用',
    credits: 2500,
    blurb: '适合持续做课和反复修改，等于 25 美元额度。',
    checkoutName: 'Syntara Pro Pack (2500 Credits)',
    checkoutDescription:
      'One-time purchase of 2500 credits for use in Syntara. Credits can be used for AI chat, course generation, and content editing. This is not a subscription and will not renew automatically.',
    checkoutUnitAmountByCurrency: {
      CAD: 3400,
    },
  },
  {
    id: 'studio',
    title: '工作室包',
    highlight: '团队',
    credits: 5000,
    blurb: '适合多人协作或高频生成，等于 50 美元额度。',
    checkoutName: 'Syntara Studio Pack (5000 Credits)',
    checkoutDescription:
      'One-time purchase of 5000 credits for use in Syntara. Credits can be used for AI chat, course generation, and content editing. This is not a subscription and will not renew automatically.',
    checkoutUnitAmountByCurrency: {
      CAD: 6800,
    },
  },
  {
    id: 'scale',
    title: '扩展包',
    highlight: '高频',
    credits: 10000,
    blurb: '适合长周期高频使用，等于 100 美元额度。',
    checkoutName: 'Syntara Scale Pack (10000 Credits)',
    checkoutDescription:
      'One-time purchase of 10000 credits for use in Syntara. Credits can be used for AI chat, course generation, and content editing. This is not a subscription and will not renew automatically.',
    checkoutUnitAmountByCurrency: {
      CAD: 13600,
    },
  },
];

const CURRENCY_FORMATTERS: Record<TopUpCurrency, Intl.NumberFormat> = {
  USD: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }),
  CAD: new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }),
  CNY: new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }),
};

export function formatTopUpPrice(currency: TopUpCurrency, amount: number): string {
  return CURRENCY_FORMATTERS[currency].format(amount);
}

export function getTopUpPackById(packId: string): TopUpPack | null {
  return TOP_UP_PACKS.find((pack) => pack.id === packId) ?? null;
}

export function getTopUpPackCheckoutAmount(
  pack: TopUpPack,
  currency: TopUpCurrency,
): number | null {
  const unitAmount = pack.checkoutUnitAmountByCurrency[currency];
  return typeof unitAmount === 'number' && unitAmount > 0 ? unitAmount : null;
}

export function getApproxLocalizedPrice(currency: TopUpCurrency, usdAmount: number): number {
  return currency === 'CAD'
    ? usdAmount * APPROX_USD_TO_CAD
    : currency === 'CNY'
      ? usdAmount * APPROX_USD_TO_CNY
      : usdAmount;
}

export function formatApproxLocalizedPrice(currency: TopUpCurrency, usdAmount: number): string {
  const localizedAmount = getApproxLocalizedPrice(currency, usdAmount);
  return formatTopUpPrice(currency, localizedAmount);
}

export function usdPriceFromCredits(credits: number): number {
  return credits / TOP_UP_CREDITS_PER_USD;
}

export function formatTopUpPackPrice(currency: TopUpCurrency, credits: number): string {
  const pack = TOP_UP_PACKS.find((candidate) => candidate.credits === credits);
  const exactUnitAmount = pack ? getTopUpPackCheckoutAmount(pack, currency) : null;
  if (exactUnitAmount != null) {
    return formatTopUpPrice(currency, exactUnitAmount / 100);
  }

  const usdAmount = usdPriceFromCredits(credits);
  const localizedAmount =
    currency === 'USD' ? usdAmount : getApproxLocalizedPrice(currency, usdAmount);
  return formatTopUpPrice(currency, localizedAmount);
}
