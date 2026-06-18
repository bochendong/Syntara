import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Presentation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScenePreviewDialog } from '@/components/slide-renderer/components/scene-preview-dialog';
import { useSettingsStore } from '@/lib/store/settings';
import { verbalizeNarrationText } from '@/lib/audio/spoken-text';
import { runQueuedAiTask } from '@/lib/store/ai-task-queue';
import type { Scene } from '@/lib/types/stage';
import { base64ToObjectUrl, getSceneNarration } from './chat-notebook-routing';
import { backendFetch } from '@/lib/utils/backend-api';

export function InlineLessonDeck({
  scenes,
  onSave,
  saving,
  savedLabel,
}: {
  scenes: Scene[];
  onSave: () => void;
  saving: boolean;
  savedLabel?: string;
}) {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [narrationError, setNarrationError] = useState<string | null>(null);
  const [narrationMode, setNarrationMode] = useState<'script' | 'fallback'>('script');
  /** API TTS：从请求到开始播放前的等待态（浏览器原生 TTS 无此阶段） */
  const [ttsGenerating, setTtsGenerating] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const playbackRequestRef = useRef(0);
  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled);
  const ttsMuted = useSettingsStore((s) => s.ttsMuted);
  const ttsVolume = useSettingsStore((s) => s.ttsVolume);
  const ttsSpeed = useSettingsStore((s) => s.ttsSpeed);
  const ttsProviderId = useSettingsStore((s) => s.ttsProviderId);
  const ttsVoice = useSettingsStore((s) => s.ttsVoice);
  const ttsProvidersConfig = useSettingsStore((s) => s.ttsProvidersConfig);
  const slideScenes = useMemo(
    () => scenes.filter((s) => s.type === 'slide' && s.content.type === 'slide'),
    [scenes],
  );
  const total = slideScenes.length;
  const current = slideScenes[Math.max(0, Math.min(idx, total - 1))];

  useEffect(() => {
    setIdx(0);
  }, [total]);

  useEffect(() => {
    if (!playing) setTtsGenerating(false);
  }, [playing]);

  useEffect(() => {
    if (!playing) return;
    const requestId = ++playbackRequestRef.current;
    const stopAudio = () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
    const advanceOrStop = () => {
      setIdx((i) => {
        if (i >= total - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    };
    const isStale = () => playbackRequestRef.current !== requestId;

    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setNarrationError('当前浏览器不支持语音播放');
      setPlaying(false);
      return;
    }
    if (!ttsEnabled || ttsMuted || ttsVolume <= 0) {
      setNarrationError('语音播放已关闭，请先在设置中开启 TTS');
      setPlaying(false);
      return;
    }
    const scene = slideScenes[Math.max(0, Math.min(idx, total - 1))];
    if (!scene || scene.content.type !== 'slide') {
      setPlaying(false);
      return;
    }
    const narration = getSceneNarration(scene);
    const text = verbalizeNarrationText(narration.text.slice(0, 1800));
    if (!text.trim()) {
      setPlaying(false);
      return;
    }
    setNarrationMode(narration.mode);
    setNarrationError(null);
    setTtsGenerating(false);
    window.speechSynthesis.cancel();
    stopAudio();

    if (ttsProviderId === 'browser-native-tts') {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      utterance.rate = Math.max(0.6, Math.min(2, ttsSpeed || 1));
      utterance.volume = Math.max(0, Math.min(1, ttsVolume));
      if (ttsVoice && ttsVoice !== 'default') {
        const voices = window.speechSynthesis.getVoices();
        const selected = voices.find((v) => v.voiceURI === ttsVoice || v.name === ttsVoice);
        if (selected) utterance.voice = selected;
      }
      utterance.onend = () => {
        if (isStale()) return;
        advanceOrStop();
      };
      utterance.onerror = () => {
        if (isStale()) return;
        setNarrationError('语音播放失败，请重试');
        setPlaying(false);
      };
      window.speechSynthesis.speak(utterance);
    } else {
      setTtsGenerating(true);
      const providerConfig = ttsProvidersConfig[ttsProviderId];
      void (async () => {
        try {
          const response = await runQueuedAiTask(
            {
              kind: 'speech-generation',
              title: '临时PPT语音生成',
              description: scene.title
                ? `正在生成「${compactTaskText(scene.title)}」讲解语音`
                : '正在生成临时PPT讲解语音',
            },
            ({ signal }) =>
              backendFetch('/api/generate/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  text,
                  audioId: `inline_lesson_${Date.now()}_${idx}`,
                  ttsProviderId,
                  ttsVoice,
                  ttsSpeed,
                  ttsApiKey: providerConfig?.apiKey || undefined,
                  ttsBaseUrl: providerConfig?.baseUrl || undefined,
                  persist: false,
                }),
                signal,
              }),
          );
          const data = (await response.json().catch(() => ({}))) as {
            base64?: string;
            format?: string;
            error?: string;
          };
          if (!response.ok || !data.base64) {
            throw new Error(data.error || '语音生成失败');
          }
          if (isStale()) {
            setTtsGenerating(false);
            return;
          }
          setTtsGenerating(false);
          const url = base64ToObjectUrl(data.base64, data.format || 'mp3');
          audioUrlRef.current = url;
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.volume = Math.max(0, Math.min(1, ttsVolume));
          audio.onended = () => {
            if (isStale()) return;
            stopAudio();
            advanceOrStop();
          };
          audio.onerror = () => {
            if (isStale()) return;
            stopAudio();
            setNarrationError('语音播放失败，请重试');
            setPlaying(false);
          };
          await audio.play();
        } catch (error) {
          setTtsGenerating(false);
          if (isStale()) return;
          setNarrationError(error instanceof Error ? error.message : '语音生成失败，请重试');
          setPlaying(false);
        }
      })();
    }
    return () => {
      window.speechSynthesis.cancel();
      stopAudio();
      setTtsGenerating(false);
    };
  }, [
    playing,
    idx,
    slideScenes,
    total,
    ttsEnabled,
    ttsMuted,
    ttsVolume,
    ttsSpeed,
    ttsProviderId,
    ttsVoice,
    ttsProvidersConfig,
  ]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      playbackRequestRef.current += 1;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, []);

  if (!current || current.content.type !== 'slide') return null;

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-2">
        <ScenePreviewDialog
          scene={current}
          description="临时讲解PPT预览。播放时优先使用讲解脚本，支持上下页与保存到笔记本。"
          topBar={
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium text-muted-foreground">
                  临时讲解PPT · {idx + 1}/{total}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => setIdx((i) => Math.max(0, i - 1))}
                    disabled={idx <= 0}
                  >
                    上一页
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
                    disabled={idx >= total - 1}
                  >
                    下一页
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => {
                      playbackRequestRef.current += 1;
                      if (audioRef.current) {
                        audioRef.current.pause();
                        audioRef.current = null;
                      }
                      if (audioUrlRef.current) {
                        URL.revokeObjectURL(audioUrlRef.current);
                        audioUrlRef.current = null;
                      }
                      if (playing && typeof window !== 'undefined' && window.speechSynthesis) {
                        window.speechSynthesis.cancel();
                      }
                      setPlaying((v) => !v);
                    }}
                    disabled={!ttsEnabled || ttsMuted || ttsVolume <= 0}
                  >
                    {playing ? '暂停' : '播放'}
                  </Button>
                </div>
              </div>
              {ttsGenerating ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-1.5 rounded-md border border-violet-200/80 bg-violet-50/80 px-2 py-1 text-[11px] text-violet-800 dark:border-violet-800/60 dark:bg-violet-950/40 dark:text-violet-200"
                >
                  <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
                  <span>正在生成语音，请稍候…</span>
                </div>
              ) : null}
            </div>
          }
          bottomBar={
            <div>
              <p className="truncate text-[11px] text-muted-foreground">{current.title}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {narrationMode === 'script'
                  ? '按讲解脚本播放'
                  : '当前页缺少讲解脚本，已回退为页面摘要朗读'}
              </p>
              {narrationError ? (
                <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                  {narrationError}
                </p>
              ) : null}
            </div>
          }
          trigger={
            <button
              type="button"
              aria-label="打开临时讲解PPT"
              className="flex w-full max-w-[min(100%,280px)] items-center gap-2.5 rounded-[10px] border border-slate-200/90 bg-white p-2 pr-2.5 text-left text-slate-900 shadow-sm transition-[transform,box-shadow] hover:shadow-md active:scale-[0.99] dark:border-slate-600/60 dark:bg-slate-900/50 dark:text-slate-100"
            >
              <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-[#f5e6e8] text-[#e64340] dark:bg-[#3d2528] dark:text-[#ff6b6b]">
                <Presentation className="size-6" strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1 py-0.5">
                <p className="line-clamp-2 text-[13px] font-medium leading-snug text-slate-900 dark:text-slate-100">
                  临时讲解PPT
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  点击展开预览（{total} 页）
                </p>
              </div>
            </button>
          }
        />
        <Button
          type="button"
          size="sm"
          className="h-8 shrink-0 px-3 text-[11px]"
          onClick={onSave}
          disabled={saving || !!savedLabel}
        >
          {savedLabel ? '已保存到笔记本' : saving ? '保存中…' : '保存到笔记本'}
        </Button>
      </div>
      {savedLabel ? (
        <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">{savedLabel}</p>
      ) : null}
    </div>
  );
}

function compactTaskText(input: string) {
  const text = input.replace(/\s+/g, ' ').trim();
  if (!text) return '当前页';
  return text.length > 36 ? `${text.slice(0, 33)}...` : text;
}
