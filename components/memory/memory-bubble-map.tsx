'use client';

import { Fragment, useMemo, useState } from 'react';
import { code } from '@streamdown/code';
import { createMathPlugin } from '@streamdown/math';
import {
  Background,
  BackgroundVariant,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { BadgeCheck, Clock3, FileText, Lock, Share2, Target, X } from 'lucide-react';
import { Streamdown } from 'streamdown';
import {
  NotificationBarStageBackground,
  type NotificationBarStageId,
} from '@/components/notifications/notification-bar-stage-background';
import { cn } from '@/lib/utils';

export type MemoryBubbleKind = 'fact' | 'public' | 'private' | 'weak' | 'recent' | 'source';

export const memoryBubbleBackgroundOptions = [
  { id: 'soft-aurora', label: '柔极光' },
  { id: 'particles', label: '粒子' },
  { id: 'threads', label: '线幕' },
  { id: 'light-rays', label: '光束' },
  { id: 'color-bends', label: '色带' },
  { id: 'plasma-wave', label: '等离子' },
] as const satisfies ReadonlyArray<{ id: NotificationBarStageId; label: string }>;

export type MemoryBubbleBackgroundId = (typeof memoryBubbleBackgroundOptions)[number]['id'];

export type MemoryBubbleMapSource = {
  order?: number;
  title: string;
  why?: string;
};

export type MemoryBubbleMapRecord = {
  id: string;
  kind: MemoryBubbleKind;
  title: string;
  text: string;
  sourceLabel?: string;
  sourceReferences?: MemoryBubbleMapSource[];
  updatedAt?: number;
  weight?: number;
  accessCount?: number;
  metricLabel?: string;
  aggregateCount?: number;
};

type BubbleNodeData = MemoryBubbleMapRecord & {
  diameter: number;
  onSelect?: (id: string) => void;
};

type BubbleNode = Node<BubbleNodeData, 'memoryBubble'>;
type HandleSide = 'left' | 'right' | 'top' | 'bottom';
type NodeGeometry = {
  x: number;
  y: number;
  diameter: number;
  kind: MemoryBubbleKind;
  anchorX: number;
  anchorY: number;
};

type MemoryBubbleMapProps = {
  records: MemoryBubbleMapRecord[];
  backgroundId?: MemoryBubbleBackgroundId;
  className?: string;
};

const toneStyles: Record<
  MemoryBubbleKind,
  {
    label: string;
    icon: typeof Share2;
    bg: string;
    border: string;
    text: string;
    chip: string;
    line: string;
    halo: string;
  }
> = {
  fact: {
    label: '事实',
    icon: BadgeCheck,
    bg: 'bg-cyan-50/94 dark:bg-cyan-400/12',
    border: 'border-cyan-200/95 dark:border-cyan-300/24',
    text: 'text-cyan-950 dark:text-cyan-50',
    chip: 'bg-cyan-100/90 text-cyan-800 dark:bg-cyan-300/14 dark:text-cyan-100',
    line: '#06b6d4',
    halo: 'shadow-[0_0_0_8px_rgba(6,182,212,0.12),0_18px_45px_rgba(8,145,178,0.14)]',
  },
  public: {
    label: '公共',
    icon: Share2,
    bg: 'bg-emerald-50/92 dark:bg-emerald-400/12',
    border: 'border-emerald-200/90 dark:border-emerald-300/24',
    text: 'text-emerald-950 dark:text-emerald-50',
    chip: 'bg-emerald-100/85 text-emerald-700 dark:bg-emerald-300/14 dark:text-emerald-100',
    line: '#34d399',
    halo: 'shadow-[0_0_0_8px_rgba(52,211,153,0.12),0_18px_45px_rgba(15,118,110,0.14)]',
  },
  private: {
    label: '私有',
    icon: Lock,
    bg: 'bg-violet-50/92 dark:bg-violet-400/12',
    border: 'border-violet-200/90 dark:border-violet-300/24',
    text: 'text-violet-950 dark:text-violet-50',
    chip: 'bg-violet-100/85 text-violet-700 dark:bg-violet-300/14 dark:text-violet-100',
    line: '#a78bfa',
    halo: 'shadow-[0_0_0_8px_rgba(167,139,250,0.13),0_18px_45px_rgba(109,40,217,0.14)]',
  },
  weak: {
    label: '弱点',
    icon: Target,
    bg: 'bg-amber-50/94 dark:bg-amber-400/12',
    border: 'border-amber-200/95 dark:border-amber-300/24',
    text: 'text-amber-950 dark:text-amber-50',
    chip: 'bg-amber-100/90 text-amber-800 dark:bg-amber-300/14 dark:text-amber-100',
    line: '#f59e0b',
    halo: 'shadow-[0_0_0_8px_rgba(245,158,11,0.12),0_18px_45px_rgba(180,83,9,0.14)]',
  },
  recent: {
    label: '最近',
    icon: Clock3,
    bg: 'bg-sky-50/94 dark:bg-sky-400/12',
    border: 'border-sky-200/95 dark:border-sky-300/24',
    text: 'text-sky-950 dark:text-sky-50',
    chip: 'bg-sky-100/90 text-sky-700 dark:bg-sky-300/14 dark:text-sky-100',
    line: '#38bdf8',
    halo: 'shadow-[0_0_0_8px_rgba(56,189,248,0.13),0_18px_45px_rgba(2,132,199,0.14)]',
  },
  source: {
    label: '来源',
    icon: FileText,
    bg: 'bg-slate-50/94 dark:bg-slate-300/10',
    border: 'border-slate-200/95 dark:border-slate-300/20',
    text: 'text-slate-900 dark:text-slate-50',
    chip: 'bg-slate-100/90 text-slate-600 dark:bg-white/10 dark:text-slate-200',
    line: '#94a3b8',
    halo: 'shadow-[0_0_0_8px_rgba(148,163,184,0.12),0_18px_45px_rgba(51,65,85,0.10)]',
  },
};

const nodeTypes = {
  memoryBubble: MemoryBubbleNode,
};

const defaultEdgeOptions = {
  type: 'default',
  focusable: false,
  selectable: false,
} as const;

const fitViewOptions = {
  duration: 0,
  padding: 0.1,
} as const;

const clusterCenters: Record<MemoryBubbleKind, { x: number; y: number }> = {
  recent: { x: 600, y: 105 },
  fact: { x: 330, y: 250 },
  public: { x: 330, y: 455 },
  source: { x: 600, y: 335 },
  private: { x: 870, y: 455 },
  weak: { x: 870, y: 250 },
};

const clusterLayouts: Record<
  MemoryBubbleKind,
  { radius: number; ringGap: number; xScale: number; yScale: number; angleOffset: number }
> = {
  recent: { radius: 118, ringGap: 118, xScale: 1.05, yScale: 0.72, angleOffset: -0.15 },
  fact: { radius: 136, ringGap: 116, xScale: 0.95, yScale: 0.82, angleOffset: 2.8 },
  public: { radius: 150, ringGap: 126, xScale: 1, yScale: 0.78, angleOffset: 2.2 },
  source: { radius: 136, ringGap: 118, xScale: 1.08, yScale: 0.78, angleOffset: 1.65 },
  private: { radius: 146, ringGap: 122, xScale: 1, yScale: 0.78, angleOffset: 0.9 },
  weak: { radius: 145, ringGap: 118, xScale: 0.98, yScale: 0.84, angleOffset: -0.65 },
};

const markdownMath = createMathPlugin({ singleDollarTextMath: true });

const graphRecordCaps: Record<MemoryBubbleKind, number> = {
  recent: 1,
  fact: 4,
  public: 6,
  source: 4,
  private: 5,
  weak: 4,
};

const graphKindOrder: MemoryBubbleKind[] = [
  'recent',
  'fact',
  'public',
  'source',
  'private',
  'weak',
];
const handlePositions: Array<{ side: HandleSide; position: Position }> = [
  { side: 'left', position: Position.Left },
  { side: 'right', position: Position.Right },
  { side: 'top', position: Position.Top },
  { side: 'bottom', position: Position.Bottom },
];

const oppositeHandleSide: Record<HandleSide, HandleSide> = {
  left: 'right',
  right: 'left',
  top: 'bottom',
  bottom: 'top',
};

function MemoryBubbleNode({ data, selected }: NodeProps<BubbleNode>) {
  const tone = toneStyles[data.kind];
  const Icon = tone.icon;
  const accessCount = Math.max(1, Math.round(data.accessCount || 1));
  const aggregateCount = Math.max(0, Math.round(data.aggregateCount || 0));
  const metricLabel =
    data.metricLabel || (aggregateCount > 0 ? `还有 ${aggregateCount} 条` : `访问 ${accessCount}`);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(event) => {
        event.stopPropagation();
        data.onSelect?.(data.id);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        data.onSelect?.(data.id);
      }}
      className={cn(
        'group relative flex cursor-pointer items-center justify-center rounded-full border text-center transition-all duration-200',
        'backdrop-blur-md',
        tone.bg,
        tone.border,
        tone.text,
        selected ? tone.halo : 'shadow-[0_12px_30px_rgba(15,23,42,0.08)]',
      )}
      style={{ width: data.diameter, height: data.diameter }}
    >
      {handlePositions.map(({ side, position }) => (
        <Fragment key={side}>
          <Handle className="opacity-0" id={`target-${side}`} position={position} type="target" />
          <Handle className="opacity-0" id={`source-${side}`} position={position} type="source" />
        </Fragment>
      ))}
      <div
        className={cn(
          'pointer-events-none absolute inset-1 rounded-full border border-white/55',
          selected ? 'opacity-100' : 'opacity-40',
        )}
      />
      <div className="relative z-10 flex max-w-[82%] flex-col items-center gap-1.5">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
            tone.chip,
          )}
        >
          <Icon className="size-3" strokeWidth={1.9} />
          {tone.label}
        </span>
        <span className="line-clamp-2 text-[12px] font-semibold leading-4 tracking-normal">
          {data.title}
        </span>
        <span className="rounded-full bg-white/64 px-2 py-0.5 text-[10px] font-bold text-slate-500 shadow-sm dark:bg-white/10 dark:text-slate-300">
          {metricLabel}
        </span>
      </div>
    </div>
  );
}

function hashNumber(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function getBubblePosition(
  kind: MemoryBubbleKind,
  index: number,
  count: number,
  id: string,
): { x: number; y: number } {
  const center = clusterCenters[kind];
  if (count <= 1) return center;

  const layout = clusterLayouts[kind];
  const hash = hashNumber(`${kind}:${id}:${index}`);
  const ringIndex = Math.floor((index - 1) / 6);
  const slotIndex = (index - 1) % 6;
  const remainingInRing = count - 1 - ringIndex * 6;
  const slots = Math.max(1, Math.min(6, remainingInRing));
  const angle = layout.angleOffset + slotIndex * ((Math.PI * 2) / slots) + ringIndex * 0.32;
  const radius = layout.radius + ringIndex * layout.ringGap;
  const jitterX = ((hash % 1000) / 1000 - 0.5) * 10;
  const jitterY = (((hash >> 10) % 1000) / 1000 - 0.5) * 10;

  return {
    x: center.x + Math.cos(angle) * radius * layout.xScale + jitterX,
    y: center.y + Math.sin(angle) * radius * layout.yScale + jitterY,
  };
}

function getAccessCount(record: MemoryBubbleMapRecord): number {
  const value = Number(record.accessCount);
  if (Number.isFinite(value) && value > 0) return Math.round(value);
  const fallback = Math.round((record.weight || 1) * 10) + (hashNumber(record.id) % 7);
  return Math.max(1, fallback);
}

function getBubbleDiameter(
  record: MemoryBubbleMapRecord,
  minAccess: number,
  maxAccess: number,
): number {
  if (record.aggregateCount) {
    return record.kind === 'recent' ? 104 : 88;
  }

  const accessCount = getAccessCount(record);
  const normalized =
    maxAccess === minAccess ? 0.5 : (accessCount - minAccess) / Math.max(1, maxAccess - minAccess);
  const base =
    record.kind === 'recent'
      ? 112
      : record.kind === 'weak'
        ? 86
        : record.kind === 'private'
          ? 86
          : 90;
  const range =
    record.kind === 'recent'
      ? 18
      : record.kind === 'weak'
        ? 22
        : record.kind === 'private'
          ? 24
          : 26;
  return Math.round(base + normalized * range);
}

function getKindNoun(kind: MemoryBubbleKind): string {
  if (kind === 'fact') return '结构事实';
  if (kind === 'private') return '私有记忆';
  if (kind === 'weak') return '待复习弱点';
  if (kind === 'recent') return '最近互动';
  if (kind === 'source') return '知识来源';
  return '共有记忆';
}

function getKindDisplayLabel(kind: MemoryBubbleKind): string {
  if (kind === 'fact') return '结构事实';
  if (kind === 'source') return '知识来源';
  if (kind === 'recent') return '短期上下文';
  return getKindNoun(kind);
}

function createOverflowRecord(
  kind: MemoryBubbleKind,
  hiddenRecords: MemoryBubbleMapRecord[],
): MemoryBubbleMapRecord | null {
  if (hiddenRecords.length === 0) return null;

  const noun = getKindNoun(kind);
  const previewTitles = hiddenRecords
    .slice(0, 5)
    .map((record) => record.title.trim())
    .filter(Boolean);
  const maxAccess = Math.max(...hiddenRecords.map(getAccessCount));

  return {
    id: `overflow:${kind}:${hiddenRecords.length}:${hashNumber(
      hiddenRecords.map((record) => record.id).join('|'),
    )}`,
    kind,
    title: `${noun}汇总`,
    text: [
      `图谱已收起 ${hiddenRecords.length} 条${noun}，当前只展示权重最高、最有代表性的节点。`,
      previewTitles.length > 0
        ? `\n\n部分条目：\n${previewTitles.map((title) => `- ${title}`).join('\n')}`
        : '',
    ]
      .filter(Boolean)
      .join(''),
    sourceLabel: '图谱汇总',
    accessCount: maxAccess,
    metricLabel: `收起 ${hiddenRecords.length} 条`,
    aggregateCount: hiddenRecords.length,
  };
}

function selectGraphRecords(records: MemoryBubbleMapRecord[]): MemoryBubbleMapRecord[] {
  const selected: MemoryBubbleMapRecord[] = [];

  for (const kind of graphKindOrder) {
    const bucket = records
      .filter((record) => record.kind === kind)
      .sort((a, b) => getAccessCount(b) - getAccessCount(a));
    const visible = bucket.slice(0, graphRecordCaps[kind]);
    const overflow = createOverflowRecord(kind, bucket.slice(graphRecordCaps[kind]));
    selected.push(...visible);
    if (overflow) selected.push(overflow);
  }

  return selected;
}

function getEdgeHandles(source?: NodeGeometry, target?: NodeGeometry) {
  if (!source || !target) return {};
  const sourceCenter = {
    x: source.x + source.diameter / 2,
    y: source.y + source.diameter / 2,
  };
  const targetCenter = {
    x: target.x + target.diameter / 2,
    y: target.y + target.diameter / 2,
  };
  const deltaX = targetCenter.x - sourceCenter.x;
  const deltaY = targetCenter.y - sourceCenter.y;
  const sourceSide: HandleSide =
    Math.abs(deltaX) >= Math.abs(deltaY)
      ? deltaX >= 0
        ? 'right'
        : 'left'
      : deltaY >= 0
        ? 'bottom'
        : 'top';
  const targetSide = oppositeHandleSide[sourceSide];

  return {
    sourceHandle: `source-${sourceSide}`,
    targetHandle: `target-${targetSide}`,
  };
}

function relaxNodeGeometry(nodeGeometryById: Map<string, NodeGeometry>) {
  const geometries = Array.from(nodeGeometryById.values());
  const graphBounds = { minX: 70, maxX: 1110, minY: 30, maxY: 650 };

  const clampGeometry = (geometry: NodeGeometry) => {
    geometry.x = Math.min(
      graphBounds.maxX - geometry.diameter,
      Math.max(graphBounds.minX, geometry.x),
    );
    geometry.y = Math.min(
      graphBounds.maxY - geometry.diameter,
      Math.max(graphBounds.minY, geometry.y),
    );
  };

  const separateOverlaps = (strength: number) => {
    for (let index = 0; index < geometries.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < geometries.length; nextIndex += 1) {
        const first = geometries[index];
        const second = geometries[nextIndex];
        const firstCenterX = first.x + first.diameter / 2;
        const firstCenterY = first.y + first.diameter / 2;
        const secondCenterX = second.x + second.diameter / 2;
        const secondCenterY = second.y + second.diameter / 2;
        const deltaX = secondCenterX - firstCenterX;
        const deltaY = secondCenterY - firstCenterY;
        const distance = Math.max(1, Math.hypot(deltaX, deltaY));
        const sameKind = first.kind === second.kind;
        const gap = sameKind ? 14 : 26;
        const minDistance = first.diameter / 2 + second.diameter / 2 + gap;

        if (distance >= minDistance) continue;

        const push = ((minDistance - distance) / 2) * strength * (sameKind ? 0.86 : 1.08);
        const unitX = deltaX / distance;
        const unitY = deltaY / distance;
        first.x -= unitX * push;
        first.y -= unitY * push;
        second.x += unitX * push;
        second.y += unitY * push;
      }
    }
  };

  for (let pass = 0; pass < 28; pass += 1) {
    separateOverlaps(1);

    for (const geometry of geometries) {
      const center = clusterCenters[geometry.kind];
      geometry.x += (center.x - geometry.anchorX) * 0.005;
      geometry.y += (center.y - geometry.anchorY) * 0.005;
      geometry.x += (geometry.anchorX - geometry.x) * 0.018;
      geometry.y += (geometry.anchorY - geometry.y) * 0.018;
      clampGeometry(geometry);
    }
  }

  for (let pass = 0; pass < 24; pass += 1) {
    separateOverlaps(1.2);
    for (const geometry of geometries) {
      clampGeometry(geometry);
    }
  }
}

function buildGraph(records: MemoryBubbleMapRecord[]): {
  graphRecords: MemoryBubbleMapRecord[];
  nodes: BubbleNode[];
  edges: Edge[];
} {
  const primaryRecords = selectGraphRecords(records);
  if (primaryRecords.length === 0) {
    return { graphRecords: [], nodes: [], edges: [] };
  }

  const graphRecords = primaryRecords;
  const accessCounts = graphRecords.map(getAccessCount);
  const minAccess = Math.min(...accessCounts);
  const maxAccess = Math.max(...accessCounts);
  const buckets = new Map<MemoryBubbleKind, MemoryBubbleMapRecord[]>();
  for (const record of graphRecords) {
    const bucket = buckets.get(record.kind) || [];
    bucket.push(record);
    buckets.set(record.kind, bucket);
  }

  const nodes: BubbleNode[] = [];
  const edges: Edge[] = [];
  const hubByKind = new Map<MemoryBubbleKind, string>();
  const nodeGeometryById = new Map<string, NodeGeometry>();
  const clusterEdgePairs: Array<{ kind: MemoryBubbleKind; source: string; target: string }> = [];

  for (const kind of graphKindOrder) {
    const bucket = buckets.get(kind) || [];
    bucket.forEach((record, index) => {
      const isHub = index === 0;
      if (isHub) hubByKind.set(kind, record.id);
      const { x, y } = getBubblePosition(kind, index, bucket.length, record.id);
      const accessCount = getAccessCount(record);
      const diameter = getBubbleDiameter({ ...record, accessCount }, minAccess, maxAccess);
      nodeGeometryById.set(record.id, { x, y, diameter, kind, anchorX: x, anchorY: y });

      nodes.push({
        id: record.id,
        type: 'memoryBubble',
        position: { x, y },
        data: { ...record, accessCount, diameter },
        style: { width: diameter, height: diameter },
        draggable: false,
      });

      const hubId = hubByKind.get(kind);
      if (hubId && hubId !== record.id) {
        clusterEdgePairs.push({ kind, source: hubId, target: record.id });
      }
    });
  }

  relaxNodeGeometry(nodeGeometryById);

  for (const node of nodes) {
    const geometry = nodeGeometryById.get(node.id);
    if (!geometry) continue;
    node.position = { x: geometry.x, y: geometry.y };
  }

  for (const pair of clusterEdgePairs) {
    edges.push({
      id: `cluster:${pair.source}:${pair.target}`,
      source: pair.source,
      target: pair.target,
      ...getEdgeHandles(nodeGeometryById.get(pair.source), nodeGeometryById.get(pair.target)),
      style: {
        stroke: toneStyles[pair.kind].line,
        strokeOpacity: 0.16,
        strokeWidth: 1,
      },
      interactionWidth: 8,
    });
  }

  const recentHubId = hubByKind.get('recent');
  if (recentHubId) {
    for (const kind of ['fact', 'public', 'source', 'private', 'weak'] as const) {
      const hubId = hubByKind.get(kind);
      if (!hubId || hubId === recentHubId) continue;
      edges.push({
        id: `memory-axis:${recentHubId}:${hubId}`,
        source: recentHubId,
        target: hubId,
        ...getEdgeHandles(nodeGeometryById.get(recentHubId), nodeGeometryById.get(hubId)),
        style: {
          stroke: toneStyles[kind].line,
          strokeOpacity: 0.24,
          strokeWidth: 1.35,
        },
        interactionWidth: 10,
      });
    }
  }

  return { graphRecords, nodes, edges };
}

function formatTime(value?: number): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function MemoryDetailPanel({
  onClose,
  record,
}: {
  onClose: () => void;
  record: MemoryBubbleMapRecord;
}) {
  const tone = toneStyles[record.kind];
  const Icon = tone.icon;
  const time = formatTime(record.updatedAt);
  const accessCount = Math.max(1, Math.round(record.accessCount || 1));
  const metricLabel =
    record.metricLabel ||
    (record.aggregateCount
      ? `还有 ${Math.max(1, Math.round(record.aggregateCount))} 条`
      : `访问 ${accessCount}`);

  return (
    <aside className="absolute bottom-3 left-3 right-3 top-auto z-20 max-h-[72%] overflow-hidden rounded-[18px] border border-slate-200/85 bg-white/90 p-4 shadow-[0_22px_60px_rgba(15,23,42,0.16)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/76 md:bottom-auto md:left-auto md:right-4 md:top-4 md:max-h-[calc(100%-2rem)] md:w-80">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-2xl border',
            tone.bg,
            tone.border,
            tone.text,
          )}
        >
          <Icon className="size-5" strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', tone.chip)}>
              {getKindDisplayLabel(record.kind)}
            </span>
            <span className="max-w-full truncate rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
              {metricLabel}
            </span>
          </div>
          <h3 className="mt-2 text-base font-semibold leading-6 text-slate-950 dark:text-white">
            {record.title}
          </h3>
          {time ? (
            <p className="mt-1 text-[11px] font-medium text-slate-400 dark:text-slate-500">
              更新于 {time}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="关闭详情"
          onClick={onClose}
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-slate-200/80 bg-white/80 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-950 dark:border-white/10 dark:bg-white/10 dark:text-slate-300 dark:hover:bg-white/16 dark:hover:text-white"
        >
          <X className="size-4" strokeWidth={1.8} />
        </button>
      </div>

      <div className="mt-4 max-h-48 overflow-y-auto pr-1 text-sm leading-6 text-slate-600 dark:text-slate-300 md:max-h-[16rem]">
        <Streamdown
          mode="static"
          plugins={{ code, math: markdownMath }}
          className={cn(
            '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
            '[&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:leading-tight [&_h1]:text-slate-950 dark:[&_h1]:text-white',
            '[&_h2]:mb-1.5 [&_h2]:mt-3.5 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:leading-tight [&_h2]:text-slate-900 dark:[&_h2]:text-slate-100',
            '[&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-[13px] [&_h3]:font-semibold [&_h3]:text-slate-900 dark:[&_h3]:text-slate-100',
            '[&_p]:my-2 [&_p]:leading-6',
            '[&_ul]:my-2 [&_ul]:grid [&_ul]:gap-1 [&_ul]:pl-4 [&_ol]:my-2 [&_ol]:grid [&_ol]:gap-1 [&_ol]:pl-4 [&_li]:pl-0.5 [&_li]:leading-6',
            '[&_blockquote]:my-2 [&_blockquote]:rounded-xl [&_blockquote]:border-l-2 [&_blockquote]:border-emerald-300 [&_blockquote]:bg-emerald-50/60 [&_blockquote]:px-3 [&_blockquote]:py-2 [&_blockquote]:text-emerald-900 dark:[&_blockquote]:bg-emerald-500/10 dark:[&_blockquote]:text-emerald-100',
            '[&_code]:rounded-md [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em] dark:[&_code]:bg-white/10',
            '[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-slate-950 [&_pre]:p-3 [&_pre]:text-xs [&_pre]:leading-5 [&_pre]:text-slate-100',
          )}
        >
          {record.text || '暂无正文。'}
        </Streamdown>
      </div>
    </aside>
  );
}

const memoryBubbleBackgroundBaseClasses: Record<MemoryBubbleBackgroundId, string> = {
  'soft-aurora': 'bg-black',
  particles: 'bg-black',
  threads: 'bg-black',
  'light-rays': 'bg-black',
  'color-bends': 'bg-black',
  'plasma-wave': 'bg-black',
};

const memoryBubbleBackgroundStageClasses: Record<MemoryBubbleBackgroundId, string> = {
  'soft-aurora': 'min-h-full opacity-[0.78]',
  particles: 'min-h-full opacity-[0.62] mix-blend-screen',
  threads: 'min-h-full opacity-[0.44] mix-blend-screen',
  'light-rays': 'min-h-full opacity-[0.5] mix-blend-screen',
  'color-bends': 'min-h-full opacity-[0.5] mix-blend-screen',
  'plasma-wave': 'min-h-full opacity-[0.5] mix-blend-screen',
};

function MemoryBubbleReactBitsBackground({ id }: { id: MemoryBubbleBackgroundId }) {
  if (id === 'soft-aurora') {
    return (
      <>
        <NotificationBarStageBackground id="soft-aurora" className="min-h-full opacity-[0.78]" />
        <NotificationBarStageBackground
          id="threads"
          className="z-[1] min-h-full opacity-[0.22] mix-blend-screen"
        />
      </>
    );
  }

  return (
    <NotificationBarStageBackground id={id} className={memoryBubbleBackgroundStageClasses[id]} />
  );
}

export function MemoryBubbleMap({
  records,
  backgroundId = 'soft-aurora',
  className,
}: MemoryBubbleMapProps) {
  const { graphRecords, nodes, edges } = useMemo(() => buildGraph(records), [records]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedRecord = graphRecords.find((record) => record.id === selectedId) || null;
  const displayNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: { ...node.data, onSelect: setSelectedId },
        selected: node.id === selectedId,
      })),
    [nodes, selectedId],
  );
  const graphKey = useMemo(() => nodes.map((node) => node.id).join('|'), [nodes]);

  if (records.length === 0) {
    return (
      <section
        className={cn(
          'rounded-[24px] border border-dashed border-slate-200/90 bg-white/62 p-6 text-center text-sm text-slate-500 dark:border-white/12 dark:bg-white/[0.035] dark:text-slate-400',
          className,
        )}
      >
        暂无可显示的忆泡。生成公共记忆、聊天记忆或复习弱点后，这里会形成泡泡地图。
      </section>
    );
  }

  return (
    <section
      className={cn(
        'overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/84 p-2 shadow-[0_24px_80px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/[0.03]',
        'dark:border-white/10 dark:bg-white/[0.055]',
        className,
      )}
    >
      <div
        className={cn(
          'relative h-[34rem] min-w-0 overflow-hidden rounded-[20px] border border-slate-200/80 dark:border-white/10 dark:bg-slate-950',
          memoryBubbleBackgroundBaseClasses[backgroundId],
        )}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_18%_15%,rgba(59,130,246,0.2),transparent_34%),radial-gradient(circle_at_84%_22%,rgba(168,85,247,0.2),transparent_36%),linear-gradient(135deg,#020617,#030712_55%,#000000)]"
        />
        <MemoryBubbleReactBitsBackground id={backgroundId} />
        <ReactFlow
          key={graphKey}
          nodes={displayNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          className="relative z-10"
          nodesDraggable={false}
          nodesConnectable={false}
          onNodeClick={(_, node) => setSelectedId(node.id)}
          fitView
          fitViewOptions={fitViewOptions}
          minZoom={0.45}
          maxZoom={1.35}
          panOnDrag
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          defaultEdgeOptions={defaultEdgeOptions}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            color="rgba(226,232,240,0.13)"
            gap={28}
            size={1}
            variant={BackgroundVariant.Dots}
          />
        </ReactFlow>
        {selectedRecord ? (
          <MemoryDetailPanel onClose={() => setSelectedId(null)} record={selectedRecord} />
        ) : null}
      </div>
    </section>
  );
}
