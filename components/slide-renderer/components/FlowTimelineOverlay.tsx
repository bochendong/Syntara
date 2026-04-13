'use client';

import { useMemo, useState } from 'react';
import type { PPTElement } from '@/lib/types/slides';

type FlowStepCard = PPTElement & {
  type: 'text';
  content: string;
  left: number;
  top: number;
  width: number;
  height: number;
  groupId?: string;
};

type TimelineGroup = {
  id: string;
  railX: number;
  railTop: number;
  railBottom: number;
  nodes: Array<{
    id: string;
    y: number;
  }>;
};

function compactHtmlText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isVerticalFlowStepCard(element: PPTElement): element is FlowStepCard {
  if (element.type !== 'text') return false;
  if (
    typeof element.left !== 'number' ||
    typeof element.top !== 'number' ||
    typeof element.width !== 'number' ||
    typeof element.height !== 'number'
  ) {
    return false;
  }
  if (!element.groupId || !element.groupId.startsWith('process_flow_')) return false;
  if (element.width < 180 || element.height < 56) return false;
  const text = compactHtmlText(element.content || '');
  return /步骤\s*\d+/i.test(text);
}

function buildTimelineGroups(elements: PPTElement[]): TimelineGroup[] {
  const grouped = new Map<string, FlowStepCard[]>();
  elements.forEach((element) => {
    if (!isVerticalFlowStepCard(element)) return;
    const key = element.groupId || '__default__';
    const list = grouped.get(key) || [];
    list.push(element);
    grouped.set(key, list);
  });

  const timelines: TimelineGroup[] = [];
  for (const [groupId, cards] of grouped.entries()) {
    if (cards.length < 2) continue;
    const sorted = cards.slice().sort((a, b) => a.top - b.top);
    const minLeft = Math.min(...sorted.map((card) => card.left));
    const railX = Math.max(24, minLeft - 26);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    timelines.push({
      id: groupId,
      railX,
      railTop: first.top + first.height / 2,
      railBottom: last.top + last.height / 2,
      nodes: sorted.map((card) => ({
        id: card.id,
        y: card.top + card.height / 2,
      })),
    });
  }
  return timelines;
}

export function FlowTimelineOverlay({
  elements,
  viewportWidth,
  contentHeight,
}: {
  elements: PPTElement[];
  viewportWidth: number;
  contentHeight: number;
}) {
  const groups = useMemo(() => buildTimelineGroups(elements), [elements]);
  const [hoveredNodeByGroup, setHoveredNodeByGroup] = useState<Record<string, number>>({});

  if (groups.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute top-0 left-0"
      style={{ width: `${viewportWidth}px`, height: `${contentHeight}px` }}
    >
      {groups.map((group) => {
        const activeIndex = hoveredNodeByGroup[group.id] ?? 0;
        return (
          <div key={group.id}>
            <div
              className="absolute rounded-full"
              style={{
                left: `${group.railX}px`,
                top: `${group.railTop}px`,
                width: '2px',
                height: `${Math.max(0, group.railBottom - group.railTop)}px`,
                background:
                  'linear-gradient(180deg, rgba(59,130,246,0.18) 0%, rgba(59,130,246,0.55) 48%, rgba(99,102,241,0.2) 100%)',
              }}
            />
            {group.nodes.map((node, index) => {
              const completed = index < activeIndex;
              const active = index === activeIndex;
              return (
                <div
                  key={node.id}
                  className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${group.railX + 1}px`, top: `${node.y}px` }}
                  onMouseEnter={() =>
                    setHoveredNodeByGroup((prev) => ({
                      ...prev,
                      [group.id]: index,
                    }))
                  }
                >
                  <div
                    className={`h-3.5 w-3.5 rounded-full border transition-all duration-300 ${
                      active
                        ? 'scale-110 border-sky-300 bg-sky-500 shadow-[0_0_0_6px_rgba(56,189,248,0.18)]'
                        : completed
                          ? 'border-indigo-300 bg-indigo-500 shadow-[0_0_0_4px_rgba(99,102,241,0.12)]'
                          : 'border-slate-300 bg-white/90'
                    }`}
                  />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
