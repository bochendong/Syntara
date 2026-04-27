'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CalendarCheck2, Lock, Mic2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useGamificationSummary } from '@/lib/hooks/use-gamification-summary';
import { TalkingAvatarOverlay } from '@/components/canvas/talking-avatar-overlay';
import { useSettingsStore } from '@/lib/store/settings';
import { LIVE2D_PRESENTER_MODELS } from '@/lib/live2d/presenter-models';
import { LIVE2D_PRESENTER_PERSONAS } from '@/lib/live2d/presenter-personas';
import { Live2DCompanionStageBackdrop } from '@/components/gamification/live2d-companion-stage-backdrop';
import { Live2DCompanionShowcaseTabs } from '@/components/gamification/live2d-companion-showcase-tabs';
import {
  CHARACTER_STAGE_SKINS,
  CHARACTER_VOICE_PACKS,
  COMPANION_STAGE_SKIN_STORAGE_KEY,
  LIVE2D_CHARACTER_TRAITS,
  buildCharacterMotionPacks,
  playCharacterVoicePack,
  readStringRecordFromStorage,
  resolveBonusTier,
  resolveLive2DPoster,
  toLive2DModelId,
  writeStringRecordToStorage,
  type CharacterMotionPack,
  type CharacterShowcaseItem,
  type CharacterStageSkin,
  type CharacterVoicePack,
  type ShowcasePanelId,
} from '@/components/gamification/live2d-companion-data';

export function Live2DCompanionHub() {
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const { summary, equipCharacter, selectPreferredCharacter } = useGamificationSummary(true);
  const live2dPresenterModelId = useSettingsStore((s) => s.live2dPresenterModelId);
  const notificationCompanionId = useSettingsStore((s) => s.notificationCompanionId);
  const checkInCompanionId = useSettingsStore((s) => s.checkInCompanionId);
  const setLive2DPresenterModelId = useSettingsStore((s) => s.setLive2DPresenterModelId);
  const setNotificationCompanionId = useSettingsStore((s) => s.setNotificationCompanionId);
  const setCheckInCompanionId = useSettingsStore((s) => s.setCheckInCompanionId);
  const [selectedShowcaseCharacterId, setSelectedShowcaseCharacterId] = useState<string | null>(
    null,
  );
  const [showcasePanel, setShowcasePanel] = useState<ShowcasePanelId>('mentor-info');
  const [showcaseMotionTrigger, setShowcaseMotionTrigger] = useState<{
    token: number;
    motionGroup: 'Idle' | 'TapBody';
    motionIndex?: number;
  } | null>(null);
  const [selectedStageSkinByCharacter, setSelectedStageSkinByCharacter] = useState<
    Record<string, string>
  >(() => readStringRecordFromStorage(COMPANION_STAGE_SKIN_STORAGE_KEY));

  const handleEquip = async (characterId: string) => {
    try {
      await equipCharacter(characterId);
      const modelId = toLive2DModelId(characterId);
      if (modelId) {
        setLive2DPresenterModelId(modelId);
      }
      toast.success('已切换当前课堂讲师');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '切换角色失败');
    }
  };

  const live2dCharacters =
    summary?.characters.filter(
      (character) => character.assetType === 'LIVE2D' && toLive2DModelId(character.id) != null,
    ) ?? [];
  const sortedLive2dCharacters = [...live2dCharacters].sort((a, b) => {
    if (a.isUnlocked === b.isUnlocked) return 0;
    return a.isUnlocked ? -1 : 1;
  });
  const unlockedLive2dIds = new Set(
    live2dCharacters.filter((character) => character.isUnlocked).map((character) => character.id),
  );
  const showcaseCharacters = useMemo<CharacterShowcaseItem[]>(() => {
    if (sortedLive2dCharacters.length > 0) {
      return sortedLive2dCharacters.map((character) => {
        const modelId = toLive2DModelId(character.id);
        return {
          id: character.id,
          name: character.name,
          isUnlocked: character.isUnlocked,
          isEquipped: character.isEquipped,
          affinityLevel: character.affinityLevel,
          affinityExp: character.affinityExp,
          previewSrc: character.previewSrc,
          description: modelId
            ? (character.description ?? LIVE2D_PRESENTER_PERSONAS[modelId].description)
            : character.description,
          worldview: modelId
            ? (character.worldview ?? LIVE2D_PRESENTER_PERSONAS[modelId].worldview)
            : null,
          story: modelId ? (character.story ?? LIVE2D_PRESENTER_PERSONAS[modelId].story) : null,
          gathering: modelId
            ? (character.gathering ?? LIVE2D_PRESENTER_PERSONAS[modelId].gathering)
            : null,
          linkLine: modelId
            ? (character.linkLine ?? LIVE2D_PRESENTER_PERSONAS[modelId].linkLine)
            : null,
          teachingStyle: modelId
            ? (character.teachingStyle ?? LIVE2D_PRESENTER_PERSONAS[modelId].teachingStyle)
            : null,
          bondLine: modelId
            ? (character.bondLine ?? LIVE2D_PRESENTER_PERSONAS[modelId].bondLine)
            : null,
          personalityTags: modelId
            ? character.personalityTags?.length
              ? character.personalityTags
              : [...LIVE2D_PRESENTER_PERSONAS[modelId].personalityTags]
            : [],
          nextUnlockHint: character.nextUnlockHint,
          modelId,
          posterSrc: modelId
            ? resolveLive2DPoster(modelId, character.previewSrc)
            : (character.previewSrc ?? ''),
          source: 'summary',
        };
      });
    }

    return Object.values(LIVE2D_PRESENTER_MODELS).map((model) => ({
      id: model.id,
      name: model.badgeLabel,
      isUnlocked: true,
      isEquipped: live2dPresenterModelId === model.id,
      affinityLevel: model.id === checkInCompanionId ? 1 : 0,
      affinityExp: 0,
      previewSrc: model.previewSrc,
      description: LIVE2D_PRESENTER_PERSONAS[model.id].description,
      worldview: LIVE2D_PRESENTER_PERSONAS[model.id].worldview,
      story: LIVE2D_PRESENTER_PERSONAS[model.id].story,
      gathering: LIVE2D_PRESENTER_PERSONAS[model.id].gathering,
      linkLine: LIVE2D_PRESENTER_PERSONAS[model.id].linkLine,
      teachingStyle: LIVE2D_PRESENTER_PERSONAS[model.id].teachingStyle,
      bondLine: LIVE2D_PRESENTER_PERSONAS[model.id].bondLine,
      personalityTags: [...LIVE2D_PRESENTER_PERSONAS[model.id].personalityTags],
      nextUnlockHint: null,
      modelId: model.id,
      posterSrc: resolveLive2DPoster(model.id, model.previewSrc),
      source: 'local',
    }));
  }, [checkInCompanionId, live2dPresenterModelId, sortedLive2dCharacters]);
  const unlockedShowcaseCharacters = useMemo(
    () => showcaseCharacters.filter((character) => character.isUnlocked),
    [showcaseCharacters],
  );

  useEffect(() => {
    if (!summary?.databaseEnabled) return;
    const preferredId = toLive2DModelId(summary.profile.preferredCharacterId);
    if (!preferredId) return;
    if (checkInCompanionId !== preferredId) {
      setCheckInCompanionId(preferredId);
    }
  }, [summary, checkInCompanionId, setCheckInCompanionId]);

  useEffect(() => {
    if (!summary?.databaseEnabled) return;
    const equippedId = toLive2DModelId(summary.profile.equippedCharacterId);
    if (!equippedId) return;
    if (live2dPresenterModelId !== equippedId) {
      setLive2DPresenterModelId(equippedId);
    }
  }, [summary, live2dPresenterModelId, setLive2DPresenterModelId]);

  useEffect(() => {
    let nextSelectedId: string | null;

    if (unlockedShowcaseCharacters.length === 0) {
      nextSelectedId = null;
    } else {
      if (
        selectedShowcaseCharacterId &&
        unlockedShowcaseCharacters.some((character) => character.id === selectedShowcaseCharacterId)
      ) {
        return;
      }

      nextSelectedId =
        unlockedShowcaseCharacters.find((character) => character.modelId === live2dPresenterModelId)
          ?.id ??
        unlockedShowcaseCharacters[0]?.id ??
        null;
    }

    const timeoutId = window.setTimeout(() => {
      setSelectedShowcaseCharacterId(nextSelectedId);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [live2dPresenterModelId, selectedShowcaseCharacterId, unlockedShowcaseCharacters]);

  const handleSelectNotificationCompanion = (characterId: string) => {
    const modelId = toLive2DModelId(characterId);
    if (!modelId) return;
    if (!unlockedLive2dIds.has(characterId)) {
      toast.error('请先解锁该角色，再设为通知讲师');
      return;
    }
    setNotificationCompanionId(modelId);
    toast.success(`已设置 ${modelId} 为通知讲师`);
  };

  const handleSelectLectureCompanion = async (characterId: string) => {
    const modelId = toLive2DModelId(characterId);
    if (!modelId) return;

    if (summary?.databaseEnabled) {
      if (!unlockedLive2dIds.has(characterId)) {
        toast.error('请先解锁该角色，再设为课堂讲师');
        return;
      }
      await handleEquip(characterId);
      return;
    }

    setLive2DPresenterModelId(modelId);
    toast.success(`已将 ${modelId} 设为课堂讲师`);
  };

  const handleSelectCheckInCompanion = async (characterId: string) => {
    const modelId = toLive2DModelId(characterId);
    if (!modelId) return;
    if (summary?.databaseEnabled && !unlockedLive2dIds.has(characterId)) {
      toast.error('请先解锁该角色，再设为签到培养角色');
      return;
    }
    if (!summary?.databaseEnabled) {
      setCheckInCompanionId(modelId);
      toast.success(`已在本地预览中将 ${modelId} 设为签到角色`);
      return;
    }
    try {
      await selectPreferredCharacter(characterId);
      setCheckInCompanionId(modelId);
      toast.success(`签到将优先培养 ${modelId} 的亲密度`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '设置签到培养角色失败');
    }
  };

  const showcaseCharacter =
    unlockedShowcaseCharacters.find((character) => character.id === selectedShowcaseCharacterId) ??
    unlockedShowcaseCharacters[0] ??
    null;
  const showcaseModelId = showcaseCharacter?.modelId ?? null;
  const showcaseIsLecture = Boolean(showcaseModelId && showcaseModelId === live2dPresenterModelId);
  const showcaseIsNotification = Boolean(
    showcaseModelId && showcaseModelId === notificationCompanionId,
  );
  const showcaseIsCheckIn = Boolean(showcaseModelId && showcaseModelId === checkInCompanionId);
  const showcaseLevel = showcaseCharacter?.affinityLevel ?? 0;
  const showcaseExp = showcaseCharacter?.affinityExp ?? 0;
  const showcaseExpProgress = (() => {
    const normalized = Number.isFinite(showcaseExp) ? showcaseExp : 0;
    const currentTierExp = ((normalized % 100) + 100) % 100;
    return currentTierExp / 100;
  })();
  const showcaseVoicePacks = showcaseModelId ? CHARACTER_VOICE_PACKS[showcaseModelId] : [];
  const showcaseMotionPacks = showcaseModelId ? buildCharacterMotionPacks(showcaseModelId) : [];
  const showcaseStageSkins = showcaseModelId ? CHARACTER_STAGE_SKINS[showcaseModelId] : [];
  const showcaseUnlockTotal =
    showcaseVoicePacks.length + showcaseMotionPacks.length + showcaseStageSkins.length;
  const showcaseUnlockedCount =
    showcaseVoicePacks.filter((pack) => showcaseLevel >= pack.requiredLevel).length +
    showcaseMotionPacks.filter((pack) => showcaseLevel >= pack.requiredLevel).length +
    showcaseStageSkins.filter((skin) => showcaseLevel >= skin.requiredLevel).length;
  const showcaseTrait = showcaseModelId ? LIVE2D_CHARACTER_TRAITS[showcaseModelId] : null;
  const showcasePersona = showcaseModelId ? LIVE2D_PRESENTER_PERSONAS[showcaseModelId] : null;
  const showcasePersonaTitle = showcasePersona?.title ?? '成长型学习导师';
  const showcaseWorldview =
    showcaseCharacter?.worldview ?? showcasePersona?.worldview ?? '这个世界观还在编写中。';
  const showcaseStory =
    showcaseCharacter?.story ?? showcasePersona?.story ?? '这位导师的故事还在编写中。';
  const showcaseStoryParagraphs = showcaseStory
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const showcaseGathering =
    showcaseCharacter?.gathering ?? showcasePersona?.gathering ?? '这段集结故事还在编写中。';
  const showcaseLinkLine =
    showcaseCharacter?.linkLine ?? showcasePersona?.linkLine ?? '这位导师的联动关系还在编写中。';
  const showcaseTeachingStyle =
    showcaseCharacter?.teachingStyle ?? showcasePersona?.teachingStyle ?? null;
  const showcaseBondLine = showcaseCharacter?.bondLine ?? showcasePersona?.bondLine ?? null;
  const showcasePersonalityTags =
    showcaseCharacter?.personalityTags && showcaseCharacter.personalityTags.length > 0
      ? showcaseCharacter.personalityTags
      : (showcasePersona?.personalityTags ?? []);
  const showcaseNotificationBonusTier = showcaseTrait
    ? resolveBonusTier(showcaseTrait.notificationBonuses, showcaseLevel)
    : null;
  const showcaseSignInBonusTier = showcaseTrait
    ? resolveBonusTier(showcaseTrait.signInBonuses, showcaseLevel)
    : null;
  const selectedStageSkin =
    showcaseStageSkins.find(
      (skin) => skin.id === selectedStageSkinByCharacter[showcaseModelId ?? ''],
    ) ??
    showcaseStageSkins[0] ??
    null;
  const handlePreviewVoicePack = (pack: CharacterVoicePack) => {
    if (showcaseLevel < pack.requiredLevel) {
      toast.info(`亲密度 Lv${pack.requiredLevel} 解锁后可试听`);
      return;
    }
    const motionGroup = pack.motionGroup;
    if (motionGroup) {
      setShowcaseMotionTrigger((current) => ({
        token: (current?.token ?? 0) + 1,
        motionGroup,
        motionIndex: pack.motionIndex,
      }));
    }
    playCharacterVoicePack(pack, voicePreviewAudioRef);
    toast.success(`正在试听：${pack.label}`);
  };

  const handlePreviewMotionPack = (pack: CharacterMotionPack) => {
    if (showcaseLevel < pack.requiredLevel) {
      toast.info(`亲密度 Lv${pack.requiredLevel} 解锁后可使用动作`);
      return;
    }
    setShowcaseMotionTrigger((current) => ({
      token: (current?.token ?? 0) + 1,
      motionGroup: pack.motionGroup,
      motionIndex: pack.motionIndex,
    }));
    toast.success(`已触发动作：${pack.label}`);
  };

  const handleSelectStageSkin = (skin: CharacterStageSkin) => {
    if (!showcaseModelId) return;
    if (showcaseLevel < skin.requiredLevel) {
      toast.info(`亲密度 Lv${skin.requiredLevel} 解锁后可使用该舞台背景`);
      return;
    }
    const next = { ...selectedStageSkinByCharacter, [showcaseModelId]: skin.id };
    setSelectedStageSkinByCharacter(next);
    writeStringRecordToStorage(COMPANION_STAGE_SKIN_STORAGE_KEY, next);
    toast.success(`已切换舞台背景：${skin.label}`);
  };

  return (
    <div className="h-full space-y-6">
      {showcaseCharacter ? (
        <Card className="h-full overflow-hidden border-white/45 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.2),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(56,189,248,0.16),transparent_30%),linear-gradient(180deg,rgba(7,12,28,0.92),rgba(12,22,46,0.94))] p-0 text-white shadow-[0_30px_80px_rgba(15,23,42,0.32)] dark:border-white/10">
          <div className="grid h-full gap-0">
            <div className="relative h-full overflow-hidden border-b border-white/10">
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-x-0 top-0 h-48 bg-[radial-gradient(circle_at_top,rgba(196,181,253,0.28),transparent_68%)]" />
                <div className="absolute bottom-[-140px] left-1/2 h-[380px] w-[380px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(125,211,252,0.22),transparent_70%)] blur-2xl" />
                <div className="absolute inset-x-10 bottom-6 h-px bg-gradient-to-r from-transparent via-white/45 to-transparent" />
              </div>

              <div className="relative h-full p-0">
                <div
                  className={cn(
                    'relative h-full min-h-[660px] overflow-hidden rounded-[30px] border border-white/10 px-4 pb-8 pt-24 md:min-h-[620px] md:pb-10 md:pt-20',
                    selectedStageSkin?.stageClass ??
                      'bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))]',
                  )}
                >
                  <Live2DCompanionStageBackdrop
                    modelId={showcaseModelId}
                    skinId={selectedStageSkin?.id}
                  />

                  <div
                    className={cn(
                      'absolute inset-x-12 bottom-5 z-0 h-20 rounded-full blur-2xl',
                      selectedStageSkin?.glowClass ??
                        'bg-[radial-gradient(circle,rgba(191,219,254,0.3),transparent_68%)]',
                    )}
                  />
                  <div className="absolute inset-x-0 bottom-8 z-0 flex justify-center">
                    <div className="h-28 w-[78%] rounded-full border border-white/10 bg-[radial-gradient(circle,rgba(255,255,255,0.16),transparent_66%)] blur-xl" />
                  </div>

                  <div className="absolute left-1/2 top-4 z-40 w-[min(calc(100%-2rem),620px)] -translate-x-1/2">
                    <div className="flex items-center justify-center gap-2 overflow-x-auto rounded-full border border-white/14 bg-slate-950/28 px-3 py-2 shadow-[0_18px_48px_rgba(15,23,42,0.28)] backdrop-blur-xl">
                      {unlockedShowcaseCharacters.map((character) => {
                        const selected = showcaseCharacter.id === character.id;
                        return (
                          <button
                            key={`showcase-character-stage-${character.id}`}
                            type="button"
                            onClick={() => setSelectedShowcaseCharacterId(character.id)}
                            title={character.name}
                            className={cn(
                              'relative flex size-12 shrink-0 items-center justify-center rounded-full border p-0.5 transition-all md:size-14',
                              selected
                                ? 'border-sky-200 bg-sky-300/18 shadow-[0_0_24px_rgba(125,211,252,0.48)]'
                                : 'border-white/12 bg-white/8 hover:bg-white/14',
                            )}
                          >
                            <img
                              src={character.posterSrc}
                              alt={character.name}
                              className="size-full rounded-full object-cover object-top"
                              draggable={false}
                            />
                            {selected ? (
                              <span className="absolute -bottom-1 left-1/2 h-1 w-6 -translate-x-1/2 rounded-full bg-sky-200 shadow-[0_0_14px_rgba(125,211,252,0.8)]" />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <Live2DCompanionShowcaseTabs
                    activePanel={showcasePanel}
                    onChange={setShowcasePanel}
                  />

                  <div className="absolute bottom-6 left-4 z-30 md:bottom-8 md:left-6">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-full border border-sky-200/40 bg-sky-300/18 px-2.5 py-1 text-xs text-sky-100 transition-colors hover:bg-sky-300/28 disabled:cursor-not-allowed disabled:opacity-45"
                        disabled={!showcaseModelId}
                        onClick={() => void handleSelectLectureCompanion(showcaseCharacter.id)}
                      >
                        <Mic2 className="size-3.5" />
                        {showcaseIsLecture ? '当前讲解' : '设为讲解'}
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-full border border-emerald-200/40 bg-emerald-300/16 px-2.5 py-1 text-xs text-emerald-100 transition-colors hover:bg-emerald-300/24 disabled:cursor-not-allowed disabled:opacity-45"
                        disabled={
                          !showcaseModelId ||
                          (!showcaseCharacter.isUnlocked && Boolean(summary?.databaseEnabled))
                        }
                        onClick={() => handleSelectNotificationCompanion(showcaseCharacter.id)}
                      >
                        <Bell className="size-3.5" />
                        {showcaseIsNotification ? '当前通知' : '设为通知'}
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-full border border-fuchsia-200/40 bg-fuchsia-300/16 px-2.5 py-1 text-xs text-fuchsia-100 transition-colors hover:bg-fuchsia-300/24 disabled:cursor-not-allowed disabled:opacity-45"
                        disabled={
                          !showcaseModelId ||
                          (!showcaseCharacter.isUnlocked && Boolean(summary?.databaseEnabled))
                        }
                        onClick={() => void handleSelectCheckInCompanion(showcaseCharacter.id)}
                      >
                        <CalendarCheck2 className="size-3.5" />
                        {showcaseIsCheckIn ? '当前签到' : '设为签到'}
                      </button>
                    </div>
                  </div>

                  <div className="absolute inset-0 z-10 flex items-center justify-center px-4 pb-4 pt-20">
                    {showcaseModelId ? (
                      <TalkingAvatarOverlay
                        layout="card"
                        speaking={false}
                        cadence="idle"
                        modelIdOverride={showcaseModelId}
                        manualMotionTrigger={showcaseMotionTrigger}
                        cardFraming="stage"
                        showBadge={false}
                        showStatusDot={false}
                        className="h-[500px] w-full max-w-[430px] md:h-[560px] md:max-w-[470px]"
                      />
                    ) : null}
                  </div>

                  <div className="absolute inset-x-4 bottom-4 z-30 md:bottom-6 md:left-auto md:right-5 md:top-24 md:w-[275px] lg:w-[305px]">
                    <div className="flex max-h-[520px] flex-col overflow-hidden rounded-[28px] border border-white/14 bg-slate-950/34 p-4 shadow-[0_24px_72px_rgba(15,23,42,0.32)] backdrop-blur-xl md:max-h-full md:p-5">
                      <div className="shrink-0 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="truncate text-2xl font-semibold tracking-tight md:text-[32px]">
                            {showcaseCharacter.name}
                          </h2>
                          <p className="mt-1 truncate text-xs text-sky-100/74">
                            {showcasePersonaTitle}
                          </p>
                        </div>
                        <div className="min-w-[96px] rounded-2xl border border-white/12 bg-white/8 px-3 py-2 text-right">
                          <p className="text-sm font-semibold">
                            <span className="text-sky-100">{`Lv ${showcaseLevel}/20`}</span>
                            <span className="mx-1 text-slate-300/60">·</span>
                            <span className="text-violet-200">{`亲密度 ${showcaseExp}`}</span>
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 shrink-0">
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/12">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-sky-300 to-violet-300 transition-all duration-300"
                            style={{ width: `${Math.round(showcaseExpProgress * 100)}%` }}
                          />
                        </div>
                      </div>

                      <p className="mt-3 shrink-0 line-clamp-3 text-sm leading-6 text-slate-200/78">
                        {showcaseCharacter.description ||
                          '为课程配置一位可成长的课堂讲师，并决定她是否兼任通知与签到培养职责。'}
                      </p>

                      <div className="mt-4 flex min-h-0 flex-1 flex-col">
                        <div className="h-px w-full bg-white/12" />

                        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
                          <div className="space-y-2">
                            {showcasePanel === 'mentor-info' ? (
                              <>
                                <div className="rounded-2xl border border-cyan-200/20 bg-cyan-300/10 px-3 py-2.5">
                                  <p className="text-xs text-cyan-100/78">世界观</p>
                                  <p className="mt-1.5 text-xs leading-5 text-slate-200/84">
                                    {showcaseWorldview}
                                  </p>
                                </div>
                                <div className="rounded-2xl border border-white/12 bg-white/8 px-3 py-3">
                                  <p className="text-xs text-sky-100/78">人物小传</p>
                                  <div className="mt-2 space-y-2.5">
                                    {showcaseStoryParagraphs.map((paragraph, index) => (
                                      <p
                                        key={`${showcaseCharacter.id}-story-${index}`}
                                        className="text-sm leading-6 text-white/90"
                                      >
                                        {paragraph}
                                      </p>
                                    ))}
                                  </div>
                                  {showcasePersonalityTags.length > 0 ? (
                                    <div className="mt-3 flex flex-wrap gap-1.5">
                                      {showcasePersonalityTags.map((tag) => (
                                        <span
                                          key={`${showcaseCharacter.id}-persona-${tag}`}
                                          className="rounded-full border border-white/12 bg-white/8 px-2 py-0.5 text-[10px] text-slate-200/82"
                                        >
                                          {tag}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                                <div className="rounded-2xl border border-amber-200/22 bg-amber-300/10 px-3 py-2.5">
                                  <p className="text-xs text-amber-100/78">集结契机</p>
                                  <p className="mt-1.5 text-xs leading-5 text-slate-200/84">
                                    {showcaseGathering}
                                  </p>
                                </div>
                                <div className="rounded-2xl border border-emerald-200/22 bg-emerald-300/10 px-3 py-2.5">
                                  <p className="text-xs text-emerald-100/78">联动关系</p>
                                  <p className="mt-1.5 text-xs leading-5 text-slate-200/84">
                                    {showcaseLinkLine}
                                  </p>
                                </div>
                                {showcaseTeachingStyle || showcaseBondLine ? (
                                  <div className="rounded-2xl border border-violet-200/24 bg-violet-300/10 px-3 py-2.5">
                                    {showcaseTeachingStyle ? (
                                      <>
                                        <p className="text-xs text-violet-100/78">陪伴方式</p>
                                        <p className="mt-1 text-xs leading-5 text-slate-200/82">
                                          {showcaseTeachingStyle}
                                        </p>
                                      </>
                                    ) : null}
                                    {showcaseBondLine ? (
                                      <p className="mt-2 text-xs leading-5 text-violet-100/82">
                                        {showcaseBondLine}
                                      </p>
                                    ) : null}
                                  </div>
                                ) : null}
                              </>
                            ) : null}

                            {showcasePanel === 'benefit' ? (
                              <>
                                <div className="rounded-2xl border border-sky-200/24 bg-sky-300/10 px-3 py-2.5">
                                  <p className="text-xs text-slate-200/82">成长解锁进度</p>
                                  <p className="mt-1 text-sm font-semibold text-white">
                                    {`已解锁 ${showcaseUnlockedCount}/${showcaseUnlockTotal}`}
                                  </p>
                                </div>
                                <div className="rounded-2xl border border-emerald-200/24 bg-emerald-300/10 px-3 py-2.5">
                                  <p className="text-xs text-emerald-100/80">通知收益</p>
                                  <p className="mt-1 text-sm font-semibold text-white">
                                    {showcaseNotificationBonusTier?.current?.label ??
                                      '当前等级暂无额外通知加成'}
                                  </p>
                                  <p className="mt-1 text-[11px] text-emerald-100/75">
                                    {showcaseNotificationBonusTier?.next
                                      ? `下一档 Lv${showcaseNotificationBonusTier.next.requiredLevel}：${showcaseNotificationBonusTier.next.label}`
                                      : '已达到该导师通知收益的最高档位'}
                                  </p>
                                </div>
                                <div className="rounded-2xl border border-fuchsia-200/24 bg-fuchsia-300/10 px-3 py-2.5">
                                  <p className="text-xs text-fuchsia-100/80">签到收益</p>
                                  <p className="mt-1 text-sm font-semibold text-white">
                                    {showcaseSignInBonusTier?.current?.label ??
                                      '当前等级暂无额外签到加成'}
                                  </p>
                                  <p className="mt-1 text-[11px] text-fuchsia-100/75">
                                    {showcaseSignInBonusTier?.next
                                      ? `下一档 Lv${showcaseSignInBonusTier.next.requiredLevel}：${showcaseSignInBonusTier.next.label}`
                                      : '已达到该导师签到收益的最高档位'}
                                  </p>
                                </div>
                                <div className="rounded-2xl border border-amber-200/24 bg-amber-300/10 px-3 py-2.5">
                                  <p className="text-xs text-amber-100/80">满级礼赠</p>
                                  <p className="mt-1 text-sm font-semibold text-white">
                                    {showcaseTrait?.maxAffinityGift ?? '该导师暂无满级礼赠配置'}
                                  </p>
                                  <p className="mt-1 text-[11px] text-amber-100/75">
                                    达到亲密度上限后可领取专属主题奖励
                                  </p>
                                </div>
                              </>
                            ) : null}

                            {showcasePanel === 'voice' ? (
                              showcaseVoicePacks.length > 0 ? (
                                showcaseVoicePacks.map((pack) => {
                                  const unlocked = showcaseLevel >= pack.requiredLevel;
                                  return (
                                    <button
                                      key={pack.id}
                                      type="button"
                                      onClick={() => handlePreviewVoicePack(pack)}
                                      className={cn(
                                        'w-full rounded-2xl border px-3 py-2.5 text-left transition-colors',
                                        unlocked
                                          ? 'border-sky-200/24 bg-sky-300/10 hover:bg-sky-300/16'
                                          : 'border-white/10 bg-white/5 opacity-72 hover:bg-white/8',
                                      )}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-medium text-white">
                                          {pack.label}
                                        </span>
                                        <span
                                          className={cn(
                                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]',
                                            unlocked
                                              ? 'bg-emerald-300/14 text-emerald-100'
                                              : 'bg-white/8 text-slate-300/70',
                                          )}
                                        >
                                          {!unlocked ? <Lock className="size-3" /> : null}
                                          Lv{pack.requiredLevel}
                                        </span>
                                      </div>
                                      <p className="mt-1 text-xs leading-5 text-slate-300/74">
                                        {pack.description}
                                      </p>
                                    </button>
                                  );
                                })
                              ) : (
                                <div className="rounded-2xl border border-white/10 bg-white/7 px-3 py-3 text-left">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-medium text-white">
                                      暂无内置语音文件
                                    </span>
                                    <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-slate-300/75">
                                      待接入
                                    </span>
                                  </div>
                                  <p className="mt-2 text-xs leading-5 text-slate-300/74">
                                    当前项目资源里没有找到这个角色的 wav/mp3/ogg
                                    语音文件，所以这里不会再用浏览器 TTS 伪造语音包。
                                    后续把专属音频放进对应角色的 sounds
                                    目录后，就能按亲密度解锁试听。
                                  </p>
                                </div>
                              )
                            ) : null}

                            {showcasePanel === 'motion'
                              ? showcaseMotionPacks.map((pack) => {
                                  const unlocked = showcaseLevel >= pack.requiredLevel;
                                  return (
                                    <button
                                      key={pack.id}
                                      type="button"
                                      onClick={() => handlePreviewMotionPack(pack)}
                                      className={cn(
                                        'w-full rounded-2xl border px-3 py-2.5 text-left transition-colors',
                                        unlocked
                                          ? 'border-violet-200/24 bg-violet-300/10 hover:bg-violet-300/16'
                                          : 'border-white/10 bg-white/5 opacity-72 hover:bg-white/8',
                                      )}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-medium text-white">
                                          {pack.label}
                                        </span>
                                        <span
                                          className={cn(
                                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]',
                                            unlocked
                                              ? 'bg-emerald-300/14 text-emerald-100'
                                              : 'bg-white/8 text-slate-300/70',
                                          )}
                                        >
                                          {!unlocked ? <Lock className="size-3" /> : null}
                                          Lv{pack.requiredLevel}
                                        </span>
                                      </div>
                                      <p className="mt-1 text-xs leading-5 text-slate-300/74">
                                        {pack.description}
                                      </p>
                                    </button>
                                  );
                                })
                              : null}

                            {showcasePanel === 'skin' ? (
                              <div className="rounded-2xl border border-white/10 bg-white/7 px-3 py-3 text-left">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-medium text-white">默认服装</span>
                                  <span className="rounded-full bg-emerald-300/14 px-2 py-0.5 text-[10px] text-emerald-100">
                                    使用中
                                  </span>
                                </div>
                                <p className="mt-2 text-xs leading-5 text-slate-300/74">
                                  当前 Live2D 包只有一个可加载模型，暂未发现独立换装模型或
                                  costume/skin 资源。
                                </p>
                                <p className="mt-2 text-xs leading-5 text-slate-300/64">
                                  Hiyori、Haru、Rice 包内存在多张
                                  texture，但这些是同一模型的贴图拆分，
                                  不是可单独切换的衣装。后续如果加入换装模型，我会在这里显示待解锁服装。
                                </p>
                              </div>
                            ) : null}

                            {showcasePanel === 'stage-background'
                              ? showcaseStageSkins.map((skin) => {
                                  const unlocked = showcaseLevel >= skin.requiredLevel;
                                  const selected = selectedStageSkin?.id === skin.id;
                                  return (
                                    <button
                                      key={skin.id}
                                      type="button"
                                      onClick={() => handleSelectStageSkin(skin)}
                                      className={cn(
                                        'w-full rounded-2xl border px-3 py-2.5 text-left transition-colors',
                                        selected
                                          ? 'border-amber-200/42 bg-amber-300/14'
                                          : unlocked
                                            ? 'border-amber-200/24 bg-amber-300/8 hover:bg-amber-300/14'
                                            : 'border-white/10 bg-white/5 opacity-72 hover:bg-white/8',
                                      )}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-medium text-white">
                                          {skin.label}
                                        </span>
                                        <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-slate-300/76">
                                          {selected ? '使用中' : `Lv${skin.requiredLevel}`}
                                        </span>
                                      </div>
                                      <p className="mt-1 text-xs leading-5 text-slate-300/74">
                                        {skin.description}
                                      </p>
                                    </button>
                                  );
                                })
                              : null}
                          </div>
                        </div>
                        {!summary?.databaseEnabled ? (
                          <p className="mt-3 text-xs leading-5 text-slate-300/72">
                            本地模式下可预览角色分工；开启数据库同步后会保存通知与签到成长。
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
