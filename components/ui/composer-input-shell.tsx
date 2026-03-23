import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * 与创建页「需求输入」一致的玻璃卡片外壳：圆角、描边、阴影、focus-within 高亮。
 * 内层请自行用 border-b / padding 分区（如工具条与 textarea）。
 */
export const composerInputShellClassName = cn(
  'rounded-2xl border border-border/60 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl',
  'shadow-xl shadow-black/[0.03] dark:shadow-black/20',
  'transition-shadow focus-within:shadow-2xl focus-within:shadow-violet-500/[0.06]',
);

export function ComposerInputShell({
  className,
  children,
  ...rest
}: React.ComponentProps<'div'>) {
  return (
    <div className={cn(composerInputShellClassName, className)} {...rest}>
      {children}
    </div>
  );
}

/** 与创建页 textarea 一致的「无边框、透明底」写法，用于嵌入 ComposerInputShell */
export const composerTextareaClassName = cn(
  'w-full resize-none border-0 bg-transparent shadow-none',
  'text-sm leading-relaxed placeholder:text-muted-foreground/40',
  'focus-visible:ring-0 focus-visible:ring-offset-0',
  'outline-none disabled:opacity-50',
);
