import { BookOpen } from 'lucide-react';
import { createNotebookHref } from '@/lib/constants/course-chat';
import { USER_AVATAR } from '@/lib/types/roundtable';
import { cn } from '@/lib/utils';

function isImageAvatarUrl(src: string | undefined | null): boolean {
  if (!src) return false;
  return (
    src.startsWith('/') ||
    src.startsWith('http://') ||
    src.startsWith('https://') ||
    src.startsWith('data:')
  );
}

/** 当前用户头像（侧气泡右侧） */
export function ChatUserAvatar({
  src,
  displayName,
  className,
}: {
  src?: string | null;
  displayName: string;
  className?: string;
}) {
  const resolved = src?.trim() || USER_AVATAR;
  if (isImageAvatarUrl(resolved)) {
    return (
      <img
        src={resolved}
        alt=""
        className={cn(
          'size-9 shrink-0 rounded-full object-cover ring-1 ring-black/5 dark:ring-white/10',
          className,
        )}
      />
    );
  }
  return (
    <div
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground ring-1 ring-black/5 dark:ring-white/10',
        className,
      )}
      aria-hidden
    >
      {displayName.trim().slice(0, 1) || '我'}
    </div>
  );
}

/** 笔记本「助手」侧头像（左侧，方角与侧栏笔记本一致） */
export function NotebookPeerAvatar({
  avatarUrl,
  notebookName,
}: {
  avatarUrl?: string | null;
  notebookName: string;
}) {
  if (avatarUrl && isImageAvatarUrl(avatarUrl)) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className="size-9 shrink-0 rounded-xl object-cover ring-1 ring-black/5 dark:ring-white/10"
      />
    );
  }
  return (
    <div
      className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-50 dark:border-white/10 dark:bg-white/5"
      title={notebookName}
    >
      <BookOpen className="size-4 text-slate-400" strokeWidth={1.75} />
    </div>
  );
}

/** Agent 回复侧头像 */
export function AgentPeerAvatar({
  avatarSrc,
  agentName,
}: {
  avatarSrc?: string | null;
  agentName: string;
}) {
  const src = avatarSrc?.trim() || '';
  if (isImageAvatarUrl(src)) {
    return (
      <img
        src={src}
        alt=""
        className="size-9 shrink-0 rounded-full object-cover ring-1 ring-black/5 dark:ring-white/10"
      />
    );
  }
  return (
    <div
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-sm font-medium text-violet-800 ring-1 ring-black/5 dark:text-violet-200 dark:ring-white/10"
      title={agentName}
      aria-hidden
    >
      {src && !isImageAvatarUrl(src) ? src.slice(0, 1) : agentName.slice(0, 1) || 'A'}
    </div>
  );
}

export function actionHref(actionId: string): string | null {
  if (actionId.startsWith('open-notebook:')) {
    return `/classroom/${encodeURIComponent(actionId.replace('open-notebook:', ''))}`;
  }
  if (actionId.startsWith('open-agent:')) {
    return `/chat?agent=${encodeURIComponent(actionId.replace('open-agent:', ''))}`;
  }
  if (actionId.startsWith('create-notebook:')) {
    return createNotebookHref(actionId.replace('create-notebook:', ''));
  }
  return null;
}
