'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Pencil, Check, ImagePlus, ChevronDown, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import { toast } from 'sonner';
import { useUserProfileStore, AVATAR_OPTIONS } from '@/lib/store/user-profile';
import { useAuthStore } from '@/lib/store/auth';
import { backendJson } from '@/lib/utils/backend-api';

/** Check whether avatar is a custom upload (data-URL) */
function isCustomAvatar(avatar: string) {
  return avatar.startsWith('data:');
}

/** Max uploaded image size before we reject */
const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5 MB

const FILE_INPUT_ID = 'user-avatar-upload';

type ProfileUsageResponse = {
  success: true;
  databaseEnabled: boolean;
  summary: {
    totalCalls: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
  };
  modelBreakdown: Array<{
    modelString: string;
    requestCount: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }>;
  dailyTrend: Array<{
    date: string;
    requestCount: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    topModel: string | null;
  }>;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat('zh-CN').format(value);
}

function formatTrendDate(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

export function UserProfileCard() {
  const { t } = useI18n();
  const avatar = useUserProfileStore((s) => s.avatar);
  const nickname = useUserProfileStore((s) => s.nickname);
  const bio = useUserProfileStore((s) => s.bio);
  const setAvatar = useUserProfileStore((s) => s.setAvatar);
  const setNickname = useUserProfileStore((s) => s.setNickname);
  const setBio = useUserProfileStore((s) => s.setBio);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<'profile' | 'usage'>('profile');
  const [usage, setUsage] = useState<ProfileUsageResponse | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHydrated(true); // eslint-disable-line react-hooks/set-state-in-effect -- Store hydration on mount
  }, []);

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  const displayName = nickname || t('profile.defaultNickname');

  const startEditName = () => {
    setNameDraft(nickname);
    setEditingName(true);
  };

  const commitName = () => {
    setNickname(nameDraft.trim());
    setEditingName(false);
  };

  const loadUsage = useCallback(async () => {
    setUsageLoading(true);
    setUsageError(null);
    try {
      const response = await backendJson<ProfileUsageResponse>('/api/profile/llm-usage');
      setUsage(response);
    } catch (error) {
      setUsageError(error instanceof Error ? error.message : String(error));
    } finally {
      setUsageLoading(false);
    }
  }, []);

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
      const img = new Image();
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

  useEffect(() => {
    if (!hydrated || tab !== 'usage' || usage || usageLoading) return;
    void loadUsage();
  }, [hydrated, tab, usage, usageLoading, loadUsage]);

  if (!hydrated) {
    return (
      <Card className="p-5 !gap-0 shadow-xl border-muted/40 backdrop-blur-xl bg-white/80 dark:bg-slate-900/80">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-full bg-muted animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-16 rounded bg-muted animate-pulse" />
            <div className="h-4 w-24 rounded bg-muted animate-pulse" />
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5 !gap-0 shadow-xl border-muted/40 backdrop-blur-xl bg-white/80 dark:bg-slate-900/80">
      <input
        id={FILE_INPUT_ID}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleAvatarUpload}
      />

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as 'profile' | 'usage')}
        className="gap-3"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="profile">个人中心</TabsTrigger>
          <TabsTrigger value="usage">Token 用量</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-0 space-y-0">
          <div className="flex items-center gap-3.5">
            <button
              onClick={() => setAvatarPickerOpen(!avatarPickerOpen)}
              className="shrink-0 group/avatar relative cursor-pointer"
            >
              <div className="size-11 rounded-full bg-gray-50 dark:bg-gray-800 overflow-hidden ring-2 ring-violet-300/50 dark:ring-violet-600/40 group-hover/avatar:ring-violet-400 dark:group-hover/avatar:ring-violet-500 transition-all">
                <img src={avatar} alt="" className="size-full object-cover" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full bg-white dark:bg-slate-800 border border-muted/60 flex items-center justify-center">
                <ChevronDown
                  className={cn(
                    'size-2.5 text-muted-foreground transition-transform duration-200',
                    avatarPickerOpen && 'rotate-180',
                  )}
                />
              </div>
            </button>

            <div className="flex-1 min-w-0">
              {editingName ? (
                <div className="flex items-center gap-1.5">
                  <input
                    ref={nameInputRef}
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitName();
                      if (e.key === 'Escape') setEditingName(false);
                    }}
                    onBlur={commitName}
                    maxLength={20}
                    placeholder={t('profile.defaultNickname')}
                    className="flex-1 min-w-0 h-7 bg-transparent border-b-2 border-violet-400 dark:border-violet-500 text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground/40"
                  />
                  <button
                    onClick={commitName}
                    className="shrink-0 size-6 rounded-md flex items-center justify-center text-violet-500 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors"
                  >
                    <Check className="size-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={startEditName}
                  className="group/name flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="text-sm font-semibold text-foreground truncate">
                    {displayName}
                  </span>
                  <Pencil className="size-3 text-muted-foreground/40 opacity-0 group-hover/name:opacity-100 transition-opacity" />
                </button>
              )}
              <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                {t('profile.avatarHint')}
              </p>
            </div>
          </div>

          <AnimatePresence>
            {avatarPickerOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="pt-3 pb-1 px-1 flex items-center gap-1.5 flex-wrap">
                  {AVATAR_OPTIONS.map((url) => (
                    <button
                      key={url}
                      onClick={() => setAvatar(url)}
                      className={cn(
                        'size-8 rounded-full overflow-hidden bg-gray-50 dark:bg-gray-800 cursor-pointer transition-all duration-150',
                        'hover:scale-110 active:scale-95',
                        avatar === url
                          ? 'ring-2 ring-violet-400 dark:ring-violet-500 ring-offset-1 ring-offset-white dark:ring-offset-slate-900'
                          : 'hover:ring-1 hover:ring-muted-foreground/30',
                      )}
                    >
                      <img src={url} alt="" className="size-full" />
                    </button>
                  ))}

                  <label
                    htmlFor={FILE_INPUT_ID}
                    className={cn(
                      'size-8 rounded-full flex items-center justify-center cursor-pointer transition-all duration-150 border border-dashed',
                      'hover:scale-110 active:scale-95',
                      isCustomAvatar(avatar)
                        ? 'ring-2 ring-violet-400 dark:ring-violet-500 ring-offset-1 ring-offset-white dark:ring-offset-slate-900 border-violet-300 dark:border-violet-600 bg-violet-50 dark:bg-violet-900/30'
                        : 'border-muted-foreground/30 text-muted-foreground/50 hover:border-muted-foreground/50',
                    )}
                    title={t('profile.uploadAvatar')}
                  >
                    <ImagePlus className="size-3.5" />
                  </label>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <Textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder={t('profile.bioPlaceholder')}
            maxLength={200}
            rows={3}
            className="mt-3 resize-none bg-background/50 min-h-[80px]"
          />
        </TabsContent>

        <TabsContent value="usage" className="mt-0 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">模型用量</p>
              <p className="text-xs text-muted-foreground">
                按当前账号统计你的模型调用与 token 变化
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void loadUsage()}
              disabled={usageLoading}
              className="h-8 gap-1.5 text-xs"
            >
              {usageLoading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              刷新
            </Button>
          </div>

          {!isLoggedIn ? (
            <div className="rounded-xl border border-dashed border-muted-foreground/25 bg-background/50 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
              登录后可以查看你自己的 token 用量趋势；本地体验模式下如已填写账号，也会按当前用户 ID
              统计。
            </div>
          ) : null}

          {usageError ? (
            <div className="rounded-xl border border-amber-200/60 bg-amber-50/80 px-3 py-3 text-xs leading-relaxed text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
              {usageError}
            </div>
          ) : null}

          {usage && !usage.databaseEnabled ? (
            <div className="rounded-xl border border-dashed border-muted-foreground/25 bg-background/50 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
              当前环境未配置数据库，LLM 用量不会持久记录，所以这里暂时没有趋势数据。
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border bg-background/60 p-3">
              <div className="text-[11px] text-muted-foreground">总调用次数</div>
              <div className="mt-1 text-lg font-semibold">
                {formatNumber(usage?.summary.totalCalls ?? 0)}
              </div>
            </div>
            <div className="rounded-xl border bg-background/60 p-3">
              <div className="text-[11px] text-muted-foreground">总 Tokens</div>
              <div className="mt-1 text-lg font-semibold">
                {formatNumber(usage?.summary.totalTokens ?? 0)}
              </div>
            </div>
            <div className="rounded-xl border bg-background/60 p-3">
              <div className="text-[11px] text-muted-foreground">输入 Tokens</div>
              <div className="mt-1 text-lg font-semibold">
                {formatNumber(usage?.summary.totalInputTokens ?? 0)}
              </div>
            </div>
            <div className="rounded-xl border bg-background/60 p-3">
              <div className="text-[11px] text-muted-foreground">输出 Tokens</div>
              <div className="mt-1 text-lg font-semibold">
                {formatNumber(usage?.summary.totalOutputTokens ?? 0)}
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-background/60 p-3">
            <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
              <Sparkles className="size-3.5" />
              常用模型
            </div>
            <p className="mt-1 text-sm font-medium text-foreground">
              {usage?.modelBreakdown[0]?.modelString || '暂无记录'}
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <div>
              <p className="text-sm font-semibold text-foreground">模型分布</p>
              <p className="text-xs text-muted-foreground">按模型汇总你所有调用的 token 和次数</p>
            </div>
            <div className="overflow-x-auto rounded-xl border">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">模型</th>
                    <th className="px-3 py-2 font-medium">次数</th>
                    <th className="px-3 py-2 font-medium">总 Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {(usage?.modelBreakdown ?? []).slice(0, 8).map((row) => (
                    <tr key={row.modelString} className="border-t">
                      <td className="px-3 py-2 font-mono">{row.modelString}</td>
                      <td className="px-3 py-2">{formatNumber(row.requestCount)}</td>
                      <td className="px-3 py-2 font-medium">{formatNumber(row.totalTokens)}</td>
                    </tr>
                  ))}
                  {(usage?.modelBreakdown?.length ?? 0) === 0 ? (
                    <tr>
                      <td className="px-3 py-5 text-center text-muted-foreground" colSpan={3}>
                        暂无模型用量记录
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2">
            <div>
              <p className="text-sm font-semibold text-foreground">最近 14 天趋势</p>
              <p className="text-xs text-muted-foreground">
                用表格看每天的调用量、tokens 和主力模型
              </p>
            </div>
            <div className="overflow-x-auto rounded-xl border">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">日期</th>
                    <th className="px-3 py-2 font-medium">次数</th>
                    <th className="px-3 py-2 font-medium">总 Tokens</th>
                    <th className="px-3 py-2 font-medium">主力模型</th>
                  </tr>
                </thead>
                <tbody>
                  {(usage?.dailyTrend ?? []).map((row) => (
                    <tr key={row.date} className="border-t">
                      <td className="px-3 py-2 whitespace-nowrap">{formatTrendDate(row.date)}</td>
                      <td className="px-3 py-2">{formatNumber(row.requestCount)}</td>
                      <td className="px-3 py-2 font-medium">{formatNumber(row.totalTokens)}</td>
                      <td className="px-3 py-2 font-mono text-[11px]">{row.topModel || '—'}</td>
                    </tr>
                  ))}
                  {(usage?.dailyTrend?.length ?? 0) === 0 ? (
                    <tr>
                      <td className="px-3 py-5 text-center text-muted-foreground" colSpan={4}>
                        暂无趋势数据
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
