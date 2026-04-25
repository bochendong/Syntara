'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Check,
  ChevronDown,
  ImagePlus,
  Pencil,
  ChevronUp,
} from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { Textarea as UITextarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { UserAvatarWithFrame } from '@/components/user-profile/user-avatar-with-frame';
import { useUserProfileStore, AVATAR_OPTIONS } from '@/lib/store/user-profile';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

function isCustomAvatar(src: string) {
  return src.startsWith('data:');
}

/** 创建页与课程总控内嵌输入区共用的问候 / 头像条 */
export function GreetingBar() {
  const { t } = useI18n();
  const avatar = useUserProfileStore((s) => s.avatar);
  const avatarFrameId = useUserProfileStore((s) => s.avatarFrameId);
  const nickname = useUserProfileStore((s) => s.nickname);
  const bio = useUserProfileStore((s) => s.bio);
  const setAvatar = useUserProfileStore((s) => s.setAvatar);
  const setNickname = useUserProfileStore((s) => s.setNickname);
  const setBio = useUserProfileStore((s) => s.setBio);

  const [open, setOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const displayName = nickname || t('profile.defaultNickname');

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setEditingName(false);
        setAvatarPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const startEditName = () => {
    setNameDraft(nickname);
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  const commitName = () => {
    setNickname(nameDraft.trim());
    setEditingName(false);
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_AVATAR_SIZE) {
      toast.error(t('profile.fileTooLarge'));
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error(t('profile.invalidFileType'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d')!;
        const scale = Math.max(128 / img.width, 128 / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (128 - w) / 2, (128 - h) / 2, w, h);
        setAvatar(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div ref={containerRef} className="relative w-auto pl-4 pr-2 pb-1 pt-3.5">
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarUpload}
      />

      {!open && (
        <div
          className="group flex cursor-pointer items-center gap-2.5 rounded-full border border-border/50 px-2.5 py-1.5 text-muted-foreground/70 transition-all duration-200 hover:bg-muted/60 hover:text-foreground active:scale-[0.97]"
          onClick={() => setOpen(true)}
        >
          <div className="relative shrink-0">
            <UserAvatarWithFrame
              src={avatar}
              frameId={avatarFrameId}
              className="size-8"
              imgClassName="ring-[1.5px] ring-border/30 transition-all duration-300 group-hover:ring-violet-400/60 dark:group-hover:ring-violet-400/40"
            />
            <div className="absolute -bottom-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full border border-border/40 bg-white opacity-60 transition-opacity group-hover:opacity-100 dark:bg-slate-800">
              <Pencil className="size-[7px] text-muted-foreground/70" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex select-none items-center gap-1 leading-none">
                  <span>
                    <span className="text-xs text-muted-foreground/60 transition-colors group-hover:text-muted-foreground">
                      {t('home.greeting')}
                    </span>
                    <span className="text-[13px] font-semibold text-foreground/85 transition-colors group-hover:text-foreground">
                      {displayName}
                    </span>
                  </span>
                  <ChevronDown className="size-3 shrink-0 text-muted-foreground/30 transition-colors group-hover:text-muted-foreground/60" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                {t('profile.editTooltip')}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="absolute left-4 top-3.5 z-50 w-64"
          >
            <div className="rounded-2xl bg-white/95 px-2.5 py-2 shadow-[0_1px_8px_-2px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.04] backdrop-blur-sm dark:bg-slate-800/95 dark:shadow-[0_1px_8px_-2px_rgba(0,0,0,0.3)] dark:ring-white/[0.06]">
              <div
                className="flex cursor-pointer items-center gap-2.5 transition-all duration-200"
                onClick={() => {
                  setOpen(false);
                  setEditingName(false);
                  setAvatarPickerOpen(false);
                }}
              >
                <div
                  className="relative shrink-0 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAvatarPickerOpen(!avatarPickerOpen);
                  }}
                >
                  <UserAvatarWithFrame
                    src={avatar}
                    frameId={avatarFrameId}
                    className="size-8"
                    imgClassName="ring-[1.5px] ring-violet-300/70 transition-all duration-300 dark:ring-violet-500/40"
                  />
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -bottom-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full border border-border/60 bg-white dark:bg-slate-800"
                  >
                    <ChevronDown
                      className={cn(
                        'size-2 text-muted-foreground/70 transition-transform duration-200',
                        avatarPickerOpen && 'rotate-180',
                      )}
                    />
                  </motion.div>
                </div>

                <div className="min-w-0 flex-1">
                  {editingName ? (
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        ref={nameInputRef}
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitName();
                          if (e.key === 'Escape') {
                            setEditingName(false);
                          }
                        }}
                        onBlur={commitName}
                        maxLength={20}
                        placeholder={t('profile.defaultNickname')}
                        className="h-6 min-w-0 flex-1 border-b border-border/80 bg-transparent text-[13px] font-semibold text-foreground outline-none placeholder:text-muted-foreground/40"
                      />
                      <button
                        type="button"
                        onClick={commitName}
                        className="flex size-5 shrink-0 items-center justify-center rounded text-violet-500 hover:bg-violet-100 dark:hover:bg-violet-900/30"
                      >
                        <Check className="size-3" />
                      </button>
                    </div>
                  ) : (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditName();
                      }}
                      className="group/name inline-flex cursor-pointer items-center gap-1"
                    >
                      <span className="text-[13px] font-semibold text-foreground/85 transition-colors group-hover/name:text-foreground">
                        {displayName}
                      </span>
                      <Pencil className="size-2.5 text-muted-foreground/30 opacity-0 transition-opacity group-hover/name:opacity-100" />
                    </span>
                  )}
                </div>

                <motion.div
                  initial={{ opacity: 0, y: -2 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex size-6 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                >
                  <ChevronUp className="size-3.5 text-muted-foreground/50" />
                </motion.div>
              </div>

              <div className="pt-2" onClick={(e) => e.stopPropagation()}>
                <AnimatePresence>
                  {avatarPickerOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="flex flex-wrap items-center gap-1.5 p-1 pb-2.5">
                        {AVATAR_OPTIONS.map((url) => (
                          <button
                            key={url}
                            type="button"
                            onClick={() => setAvatar(url)}
                            className={cn(
                              'size-7 cursor-pointer overflow-hidden rounded-full bg-gray-50 transition-all duration-150 hover:scale-110 active:scale-95 dark:bg-gray-800',
                              avatar === url
                                ? 'ring-2 ring-violet-400 ring-offset-0 dark:ring-violet-500'
                                : 'hover:ring-1 hover:ring-muted-foreground/30',
                            )}
                          >
                            <img src={url} alt="" className="size-full" />
                          </button>
                        ))}
                        <label
                          className={cn(
                            'flex size-7 cursor-pointer items-center justify-center rounded-full border border-dashed transition-all duration-150 hover:scale-110 active:scale-95',
                            isCustomAvatar(avatar)
                              ? 'border-violet-300 bg-violet-50 ring-2 ring-violet-400 ring-offset-0 dark:border-violet-600 dark:bg-violet-900/30 dark:ring-violet-500'
                              : 'border-muted-foreground/30 text-muted-foreground/50 hover:border-muted-foreground/50',
                          )}
                          onClick={() => avatarInputRef.current?.click()}
                          title={t('profile.uploadAvatar')}
                        >
                          <ImagePlus className="size-3" />
                        </label>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <UITextarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder={t('profile.bioPlaceholder')}
                  maxLength={200}
                  rows={2}
                  className="min-h-[72px] resize-none border-border/40 bg-transparent !text-[13px] !leading-relaxed placeholder:!text-[11px] placeholder:!leading-relaxed focus-visible:ring-1 focus-visible:ring-border/60"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
