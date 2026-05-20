'use client';

import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { TalkingAvatarOverlay } from '@/components/canvas/talking-avatar-overlay';
import { LIVE2D_PRESENTER_MODELS } from '@/lib/live2d/presenter-models';
import { LIVE2D_PRESENTER_PERSONAS } from '@/lib/live2d/presenter-personas';
import { useSettingsStore } from '@/lib/store/settings';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'syntara-live2d-study-companion-position-v1';
const EDGE_PADDING = 12;
const DESKTOP_SIZE = { width: 190, height: 270 };
const MOBILE_SIZE = { width: 148, height: 220 };

type CompanionPosition = {
  x: number;
  y: number;
};

type CompanionSize = typeof DESKTOP_SIZE;

type DragState = {
  pointerId: number;
  originX: number;
  originY: number;
  startX: number;
  startY: number;
};

export function Live2DStudyCompanion() {
  const modelId = useSettingsStore((state) => state.live2dPresenterModelId);
  const model = LIVE2D_PRESENTER_MODELS[modelId];
  const persona = LIVE2D_PRESENTER_PERSONAS[modelId];
  const [size, setSize] = useState<CompanionSize>(DESKTOP_SIZE);
  const [position, setPosition] = useState<CompanionPosition | null>(null);
  const latestPositionRef = useRef<CompanionPosition | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [messageIndex, setMessageIndex] = useState(0);

  const messages = useMemo(
    () => [
      persona.bondLine,
      persona.teachingStyle,
      `先收住一个小目标：把当前页面最卡的一点讲清楚，${model.badgeLabel} 在旁边陪你。`,
      '如果今天状态一般，就先做一道最小练习；能重新开始，本身就是进度。',
    ],
    [model.badgeLabel, persona.bondLine, persona.teachingStyle],
  );
  const activeMessage = messages[messageIndex % messages.length];

  const moveTo = useCallback(
    (nextPosition: CompanionPosition, nextSize: CompanionSize = size) => {
      const clamped = clampPosition(nextPosition, nextSize);
      latestPositionRef.current = clamped;
      setPosition(clamped);
    },
    [size],
  );

  useLayoutEffect(() => {
    const syncPosition = () => {
      const nextSize = resolveCompanionSize();
      setSize(nextSize);
      moveTo(
        latestPositionRef.current ?? readStoredPosition() ?? getDefaultPosition(nextSize),
        nextSize,
      );
    };

    syncPosition();
    window.addEventListener('resize', syncPosition);
    return () => window.removeEventListener('resize', syncPosition);
  }, [moveTo]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isCompanionAction(event.target)) return;

    const startPosition = position ?? getDefaultPosition(size);
    latestPositionRef.current = startPosition;
    dragStateRef.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      startX: startPosition.x,
      startY: startPosition.y,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    moveTo({
      x: dragState.startX + event.clientX - dragState.originX,
      y: dragState.startY + event.clientY - dragState.originY,
    });
  };

  const finishDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    dragStateRef.current = null;
    setDragging(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
    persistPosition(latestPositionRef.current);
  };

  const handleMessageButtonClick = () => {
    setMessageOpen((open) => {
      if (open) {
        setMessageIndex((current) => (current + 1) % messages.length);
      }
      return true;
    });
  };

  const style: CSSProperties = position
    ? {
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
      }
    : {
        right: 20,
        bottom: 18,
        width: size.width,
        height: size.height,
      };

  return (
    <div
      className={cn(
        'pointer-events-auto fixed z-[1450] select-none bg-transparent touch-none',
        dragging ? 'cursor-grabbing' : 'cursor-grab',
      )}
      style={style}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDragging}
      onPointerCancel={finishDragging}
    >
      <TalkingAvatarOverlay
        layout="card"
        cardFraming="stage"
        speaking={messageOpen}
        cadence={messageOpen ? 'fallback' : 'idle'}
        speechText={messageOpen ? activeMessage : null}
        modelIdOverride={modelId}
        showBadge={false}
        className="h-full min-h-0"
      />

      <div
        data-study-companion-action
        className="absolute right-1.5 top-1.5 z-20 flex items-center gap-1"
      >
        <button
          type="button"
          aria-label="打开伴学消息"
          title="伴学消息"
          className="inline-flex size-8 items-center justify-center rounded-full border border-white/[0.65] bg-black/35 text-white shadow-[0_8px_22px_rgba(15,23,42,0.24)] backdrop-blur-md transition hover:bg-black/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          onClick={handleMessageButtonClick}
        >
          <MessageCircle className="size-4" strokeWidth={2.2} />
        </button>
      </div>

      {messageOpen ? (
        <div
          data-study-companion-action
          className="absolute right-0 top-10 z-20 w-[min(230px,calc(100vw-2rem))] rounded-2xl border border-white/70 bg-white/[0.92] p-3 text-slate-900 shadow-[0_18px_48px_rgba(15,23,42,0.22)] backdrop-blur-xl dark:border-white/15 dark:bg-slate-950/[0.88] dark:text-slate-50"
        >
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 text-[12px] leading-relaxed">{activeMessage}</p>
            <button
              type="button"
              aria-label="关闭伴学消息"
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-950/[0.08] hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
              onClick={() => setMessageOpen(false)}
            >
              <X className="size-3.5" strokeWidth={2.2} />
            </button>
          </div>
          <button
            type="button"
            className="mt-2 inline-flex items-center rounded-full bg-slate-950/[0.08] px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-950/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15"
            onClick={() => setMessageIndex((current) => (current + 1) % messages.length)}
          >
            换一句
          </button>
        </div>
      ) : null}
    </div>
  );
}

function resolveCompanionSize(): CompanionSize {
  if (typeof window === 'undefined') return DESKTOP_SIZE;
  return window.innerWidth < 640 ? MOBILE_SIZE : DESKTOP_SIZE;
}

function getDefaultPosition(size: CompanionSize): CompanionPosition {
  if (typeof window === 'undefined') return { x: 0, y: 0 };
  return clampPosition(
    {
      x: window.innerWidth - size.width - 20,
      y: window.innerHeight - size.height - 18,
    },
    size,
  );
}

function clampPosition(position: CompanionPosition, size: CompanionSize): CompanionPosition {
  if (typeof window === 'undefined') return position;
  const maxX = Math.max(EDGE_PADDING, window.innerWidth - size.width - EDGE_PADDING);
  const maxY = Math.max(EDGE_PADDING, window.innerHeight - size.height - EDGE_PADDING);

  return {
    x: Math.min(Math.max(position.x, EDGE_PADDING), maxX),
    y: Math.min(Math.max(position.y, EDGE_PADDING), maxY),
  };
}

function readStoredPosition(): CompanionPosition | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CompanionPosition>;
    const { x, y } = parsed;
    if (typeof x !== 'number' || typeof y !== 'number') return null;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  } catch {
    return null;
  }
}

function persistPosition(position: CompanionPosition | null) {
  if (typeof window === 'undefined' || !position) return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
  } catch {
    // Position persistence is a convenience only.
  }
}

function isCompanionAction(target: EventTarget): boolean {
  return target instanceof Element && target.closest('[data-study-companion-action]') != null;
}
