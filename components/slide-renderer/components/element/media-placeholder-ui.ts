/**
 * Shared Tailwind fragments for image/video placeholder states.
 * Matches classroom / header apple-glass tone and SF blue accents.
 */
export const mediaPlaceholderUi = {
  disabledWrap:
    'w-full h-full flex items-center justify-center rounded-[12px] border border-black/[0.06] dark:border-white/[0.08] bg-slate-50/90 dark:bg-white/[0.04] backdrop-blur-sm',
  caption:
    'flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-[#86868b] dark:text-[#a1a1a6]',
  skeletonWrap:
    'w-full h-full flex items-center justify-center rounded-[12px] border border-[#007AFF]/14 dark:border-[#0A84FF]/20 bg-gradient-to-br from-sky-50/95 via-blue-50/75 to-indigo-50/55 dark:from-[#0a1c33]/55 dark:via-[#0d2240]/42 dark:to-[#061020]/38',
  pulseRing: 'absolute inset-0 rounded-full border-2 border-[#007AFF]/32 dark:border-[#0A84FF]/38',
  skeletonIcon: 'absolute inset-0 m-auto w-5 h-5 text-[#007AFF]/78 dark:text-[#0A84FF]/72',
  errorWrap:
    'w-full h-full flex flex-col items-center justify-center gap-1.5 rounded-[12px] border border-red-500/12 dark:border-red-400/18 bg-red-50/85 dark:bg-red-950/22',
  warningCaption:
    'flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-[#c2410c] dark:text-[#fdba74]',
  retryBtn:
    'flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium rounded-[10px] border border-red-300/55 dark:border-red-500/35 text-red-700 dark:text-red-300 bg-white/90 dark:bg-white/[0.06] hover:bg-red-50/90 dark:hover:bg-red-950/35 transition-colors',
  imageIdleWrap:
    'w-full h-full flex items-center justify-center rounded-[12px] border border-black/[0.05] dark:border-white/[0.08] bg-slate-100/65 dark:bg-white/[0.03]',
  imageIdleIcon: 'w-10 h-10 text-[#86868b] dark:text-[#636366]',
  videoIdleWrap:
    'w-full h-full flex items-center justify-center rounded-[12px] border border-black/[0.05] dark:border-white/[0.08] bg-black/[0.035] dark:bg-white/[0.03]',
  videoIdleIcon: 'w-12 h-12 text-[#86868b] dark:text-[#636366]',
} as const;
