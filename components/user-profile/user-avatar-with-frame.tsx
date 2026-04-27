'use client';

import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { userAvatarFrameDef } from '@/lib/constants/user-avatar-frames';

type UserAvatarWithFrameProps = {
  src: string;
  frameId: string;
  /** 外层尺寸，如 size-[72px]、size-8 */
  className?: string;
  /** 头像图 class，需含尺寸与 object-cover */
  imgClassName: string;
  alt?: string;
  role?: 'img';
  'aria-label'?: string;
  'aria-hidden'?: boolean;
};

/**
 * 按个人中心所选「头像框」包裹圆角头像；课程侧栏等非用户头像场景勿用。
 */
export function UserAvatarWithFrame({
  src,
  frameId,
  className,
  imgClassName,
  alt = '',
  role,
  'aria-label': ariaLabel,
  'aria-hidden': ariaHidden,
}: UserAvatarWithFrameProps) {
  const def = userAvatarFrameDef(frameId);
  const haloClassName = 'haloClassName' in def ? def.haloClassName : null;
  const overlayClassName = 'overlayClassName' in def ? def.overlayClassName : null;
  const sparkleClassName = 'sparkleClassName' in def ? def.sparkleClassName : null;
  const wrapProps: HTMLAttributes<HTMLDivElement> = {
    ...(role ? { role, 'aria-label': ariaLabel } : {}),
    ...(ariaHidden !== undefined ? { 'aria-hidden': ariaHidden } : {}),
  };

  return (
    <div className={cn('shrink-0', def.outerClassName, className)} {...wrapProps}>
      {haloClassName ? (
        <span className={cn('pointer-events-none', haloClassName)} aria-hidden />
      ) : null}
      <img
        src={src}
        alt={alt}
        className={cn(
          'relative z-10 size-full min-h-0 min-w-0 rounded-full object-cover',
          imgClassName,
        )}
      />
      {overlayClassName ? (
        <span className={cn('pointer-events-none', overlayClassName)} aria-hidden />
      ) : null}
      {sparkleClassName ? (
        <span className={cn('pointer-events-none', sparkleClassName)} aria-hidden />
      ) : null}
    </div>
  );
}
