'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export type SettingsButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost';
export type SettingsButtonSize = 'sm' | 'default' | 'icon' | 'iconSm';

export type SettingsButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: SettingsButtonVariant;
  size?: SettingsButtonSize;
};

/**
 * Settings-only buttons using the same apple gradient / glass styles as my-courses, login, etc.
 */
export const SettingsButton = forwardRef<HTMLButtonElement, SettingsButtonProps>(
  function SettingsButton(
    {
      className,
      variant = 'primary',
      size = 'default',
      type = 'button',
      disabled,
      ...props
    },
    ref,
  ) {
    const base =
      'apple-btn inline-flex items-center justify-center gap-1.5 font-medium outline-none transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0';

    const sizeCls = {
      sm: 'h-8 rounded-xl px-2.5 text-sm',
      default: 'h-9 rounded-xl px-3 text-sm',
      icon: 'size-9 rounded-xl [&_svg]:size-4',
      iconSm: 'h-8 min-w-8 rounded-xl px-2 [&_svg]:size-3.5',
    }[size];

    const variantCls = {
      primary: 'apple-btn-primary border-0 font-semibold text-white shadow-none',
      secondary: 'apple-btn-secondary',
      destructive:
        'rounded-xl border border-destructive/35 bg-destructive/10 font-medium text-destructive hover:bg-destructive/18 dark:border-destructive/40 dark:bg-destructive/18 dark:hover:bg-destructive/26',
      ghost:
        'rounded-xl border border-transparent bg-transparent text-foreground hover:bg-muted/70 dark:hover:bg-white/10',
    }[variant];

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled}
        className={cn(base, sizeCls, variantCls, className)}
        {...props}
      />
    );
  },
);
