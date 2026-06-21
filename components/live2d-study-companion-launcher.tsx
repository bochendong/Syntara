'use client';

import type { CSSProperties, MouseEvent, PointerEvent } from 'react';
import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSettingsStore } from '@/lib/store/settings';
import { DEFAULT_LIVE2D_PRESENTER_MODEL_ID } from '@/lib/live2d/presenter-models';
import { LIVE2D_PRESENTER_AVATAR_BY_ID } from '@/components/stage/stage-presenter-config';

const Live2DStudyCompanion = dynamic(
  () => import('@/components/live2d-study-companion').then((mod) => mod.Live2DStudyCompanion),
  { ssr: false, loading: () => null },
);

const COLLAPSED_STORAGE_KEY = 'syntara-live2d-study-companion-collapsed';
const AVATAR_POSITION_STORAGE_KEY = 'syntara-live2d-study-companion-avatar-position-v1';
const EXPAND_QUERY_PARAM = 'live2dCompanion';
const COLLAPSED_AVATAR_SIZE_PX = 56;
const COLLAPSED_AVATAR_EDGE_PADDING_PX = 12;
const AVATAR_DRAG_THRESHOLD_PX = 4;

type AvatarPosition = {
  x: number;
  y: number;
};

type AvatarDragState = {
  input: 'pointer' | 'mouse';
  pointerId?: number;
  originX: number;
  originY: number;
  startX: number;
  startY: number;
  moved: boolean;
};

export function Live2DStudyCompanionLauncher() {
  const visible = useSettingsStore((state) => state.live2dPresenterVisible);
  const modelId = useSettingsStore((state) => state.live2dPresenterModelId);
  const setLive2DPresenterVisible = useSettingsStore((state) => state.setLive2DPresenterVisible);
  const [collapsed, setCollapsed] = useState(readCollapsedCompanionState);
  const [expandedByAvatar, setExpandedByAvatar] = useState(hasCompanionExpandRequest);
  const [avatarPosition, setAvatarPosition] = useState(readAvatarPosition);
  const latestAvatarPositionRef = useRef<AvatarPosition | null>(avatarPosition);
  const avatarDragStateRef = useRef<AvatarDragState | null>(null);
  const suppressAvatarClickRef = useRef(false);

  const collapseCompanion = () => {
    setCollapsed(true);
    setExpandedByAvatar(false);
    writeCollapsedCompanionState(true);
    clearCompanionExpandRequest();
  };

  const expandCompanion = (event?: MouseEvent<HTMLAnchorElement>) => {
    if (suppressAvatarClickRef.current) {
      event?.preventDefault();
      suppressAvatarClickRef.current = false;
      return;
    }
    event?.preventDefault();
    setCollapsed(false);
    setExpandedByAvatar(true);
    writeCollapsedCompanionState(false);
    setLive2DPresenterVisible(true);
  };

  const startAvatarDrag = (
    rect: DOMRect,
    originX: number,
    originY: number,
    mode: Pick<AvatarDragState, 'input' | 'pointerId'>,
  ) => {
    const startPosition = avatarPosition ?? { x: rect.x, y: rect.y };
    latestAvatarPositionRef.current = startPosition;
    avatarDragStateRef.current = {
      ...mode,
      originX,
      originY,
      startX: startPosition.x,
      startY: startPosition.y,
      moved: false,
    };
    suppressAvatarClickRef.current = false;
  };

  const updateAvatarDrag = (clientX: number, clientY: number) => {
    const dragState = avatarDragStateRef.current;
    if (!dragState) return;

    const deltaX = clientX - dragState.originX;
    const deltaY = clientY - dragState.originY;
    if (!dragState.moved && Math.hypot(deltaX, deltaY) < AVATAR_DRAG_THRESHOLD_PX) return;

    dragState.moved = true;
    const nextPosition = clampAvatarPosition({
      x: dragState.startX + deltaX,
      y: dragState.startY + deltaY,
    });
    latestAvatarPositionRef.current = nextPosition;
    setAvatarPosition(nextPosition);
    writeAvatarPosition(nextPosition);
  };

  const finishActiveAvatarDrag = () => {
    const dragState = avatarDragStateRef.current;
    avatarDragStateRef.current = null;
    if (!dragState?.moved) return;
    suppressAvatarClickRef.current = true;
    window.setTimeout(() => {
      suppressAvatarClickRef.current = false;
    }, 0);
    writeAvatarPosition(latestAvatarPositionRef.current);
  };

  const handleAvatarPointerDown = (event: PointerEvent<HTMLAnchorElement>) => {
    if (event.button !== 0) return;
    startAvatarDrag(event.currentTarget.getBoundingClientRect(), event.clientX, event.clientY, {
      input: 'pointer',
      pointerId: event.pointerId,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleAvatarPointerMove = (event: PointerEvent<HTMLAnchorElement>) => {
    const dragState = avatarDragStateRef.current;
    if (!dragState || dragState.input !== 'pointer' || dragState.pointerId !== event.pointerId) {
      return;
    }

    updateAvatarDrag(event.clientX, event.clientY);
  };

  const finishAvatarDrag = (event: PointerEvent<HTMLAnchorElement>) => {
    const dragState = avatarDragStateRef.current;
    if (!dragState || dragState.input !== 'pointer' || dragState.pointerId !== event.pointerId) {
      return;
    }

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released.
    }
    finishActiveAvatarDrag();
  };

  const handleAvatarMouseDown = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0) return;
    if (!avatarDragStateRef.current || avatarDragStateRef.current.input === 'mouse') {
      startAvatarDrag(event.currentTarget.getBoundingClientRect(), event.clientX, event.clientY, {
        input: 'mouse',
      });
    }

    const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
      if (!avatarDragStateRef.current) return;
      moveEvent.preventDefault();
      updateAvatarDrag(moveEvent.clientX, moveEvent.clientY);
    };
    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      finishActiveAvatarDrag();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp, { once: true });
  };

  if (collapsed || (!visible && !expandedByAvatar)) {
    const avatarSrc =
      LIVE2D_PRESENTER_AVATAR_BY_ID[modelId] ??
      LIVE2D_PRESENTER_AVATAR_BY_ID[DEFAULT_LIVE2D_PRESENTER_MODEL_ID];
    const avatarStyle: CSSProperties | undefined = avatarPosition
      ? {
          left: avatarPosition.x,
          top: avatarPosition.y,
        }
      : undefined;

    return (
      <a
        href={getCompanionExpandHref()}
        onClick={expandCompanion}
        onPointerDown={handleAvatarPointerDown}
        onPointerMove={handleAvatarPointerMove}
        onPointerUp={finishAvatarDrag}
        onPointerCancel={finishAvatarDrag}
        onMouseDown={handleAvatarMouseDown}
        onDragStart={(event) => event.preventDefault()}
        aria-label="展开伴学角色"
        title="展开伴学角色"
        draggable={false}
        style={avatarStyle}
        className={`pointer-events-auto fixed z-[1450] grid size-14 touch-none select-none place-items-center overflow-hidden rounded-full border border-white/80 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.22)] ring-1 ring-slate-900/5 transition hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(15,23,42,0.26)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 dark:border-white/12 dark:bg-slate-950 dark:ring-white/10 ${
          avatarPosition
            ? 'cursor-grab active:cursor-grabbing'
            : 'bottom-20 right-5 cursor-grab active:cursor-grabbing'
        }`}
      >
        <img src={avatarSrc} alt="" className="size-full object-cover" draggable={false} />
      </a>
    );
  }

  return <Live2DStudyCompanion onCollapse={collapseCompanion} />;
}

function readCollapsedCompanionState() {
  if (typeof window === 'undefined') return false;
  if (hasCompanionExpandRequest()) return false;
  try {
    return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function hasCompanionExpandRequest() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get(EXPAND_QUERY_PARAM) === 'expanded';
}

function getCompanionExpandHref() {
  if (typeof window === 'undefined') return '#live2d-expanded';
  const url = new URL(window.location.href);
  url.searchParams.set(EXPAND_QUERY_PARAM, 'expanded');
  return `${url.pathname}${url.search}${url.hash}`;
}

function clearCompanionExpandRequest() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(EXPAND_QUERY_PARAM)) return;
  url.searchParams.delete(EXPAND_QUERY_PARAM);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

function writeCollapsedCompanionState(collapsed: boolean) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    // Collapsed state persistence is a convenience only.
  }
}

function readAvatarPosition(): AvatarPosition | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(AVATAR_POSITION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AvatarPosition>;
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return null;
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null;
    return clampAvatarPosition({ x: parsed.x, y: parsed.y });
  } catch {
    return null;
  }
}

function writeAvatarPosition(position: AvatarPosition | null) {
  if (typeof window === 'undefined' || !position) return;
  try {
    window.localStorage.setItem(AVATAR_POSITION_STORAGE_KEY, JSON.stringify(position));
  } catch {
    // Avatar position persistence is a convenience only.
  }
}

function clampAvatarPosition(position: AvatarPosition): AvatarPosition {
  if (typeof window === 'undefined') return position;
  const maxX = Math.max(
    COLLAPSED_AVATAR_EDGE_PADDING_PX,
    window.innerWidth - COLLAPSED_AVATAR_SIZE_PX - COLLAPSED_AVATAR_EDGE_PADDING_PX,
  );
  const maxY = Math.max(
    COLLAPSED_AVATAR_EDGE_PADDING_PX,
    window.innerHeight - COLLAPSED_AVATAR_SIZE_PX - COLLAPSED_AVATAR_EDGE_PADDING_PX,
  );

  return {
    x: Math.min(Math.max(position.x, COLLAPSED_AVATAR_EDGE_PADDING_PX), maxX),
    y: Math.min(Math.max(position.y, COLLAPSED_AVATAR_EDGE_PADDING_PX), maxY),
  };
}
