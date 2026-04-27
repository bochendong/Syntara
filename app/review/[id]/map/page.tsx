'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Brain,
  Castle,
  CheckCircle2,
  Coins,
  Flame,
  Gift,
  Lock,
  Play,
  ShoppingBag,
  Sparkles,
  Swords,
  Target,
  Trophy,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { QuizView, type QuestionResult } from '@/components/scene-renderers/quiz-view';
import type { ReviewRoute, ReviewRouteNode } from '@/lib/learning/review-route-types';
import { listReviewRouteHistory } from '@/lib/learning/review-route-history';
import {
  loadReviewRouteProgress,
  markReviewRouteNodeCompleted,
  withdrawReviewRouteReward,
} from '@/lib/learning/review-route-progress';
import { useAuthStore } from '@/lib/store/auth';
import type { QuizQuestion, Scene } from '@/lib/types/stage';
import { loadStageData, type StageStoreData } from '@/lib/utils/stage-storage';
import { cn } from '@/lib/utils';

const MAP_WIDTH = 780;
const MAP_STAGE_WIDTH = 1260;
const MAP_X_OFFSET = (MAP_STAGE_WIDTH - MAP_WIDTH) / 2;
const MAP_NODE_SIZE = 106;
const MAP_BOSS_NODE_SIZE = 124;
const MAP_TOP_PADDING = 108;
const MAP_BOTTOM_PADDING = 120;
const MAP_LAYER_GAP = 148;
const REVIEW_MAP_BACKGROUNDS = [
  '/review-map/background.png',
  '/review-map/background-2.png',
  '/review-map/background-3.png',
  '/review-map/background-4.png',
  '/review-map/background-5.png',
] as const;
const REVIEW_MAP_NODE_ARTWORK: Record<ReviewRouteNode['kind'] | 'start', string> = {
  normal: '/review-map/nodes/normal.png',
  elite: '/review-map/nodes/elite.png',
  boss: '/review-map/nodes/boss.png',
  camp: '/review-map/nodes/camp.png',
  treasure: '/review-map/nodes/treasure.png',
  event: '/review-map/nodes/event.png',
  shop: '/review-map/nodes/shop.png',
  start: '/review-map/nodes/start.png',
};

type MapNodePosition = {
  displayLayerIndex: number;
  sourceLayerIndex: number;
  nodeIndex: number;
  node: ReviewRouteNode;
  x: number;
  y: number;
};

type MapDisplayLayer = {
  id: string;
  title: string;
  summary: string;
  sourceLayerIndex: number;
  nodes: ReviewRouteNode[];
};

type RouteNodeStatus = 'completed' | 'available' | 'locked';

type ReviewChallenge = {
  node: ReviewRouteNode;
  layerTitle: string;
  layerIndex: number;
};

type ChallengeResult = {
  ok: boolean;
  title: string;
  feedback: string;
};

type ReviewQuestionSource = {
  sceneId: string;
  sceneTitle: string;
  question: QuizQuestion;
};

function nodeTheme(kind: ReviewRouteNode['kind']) {
  switch (kind) {
    case 'boss':
      return {
        icon: Castle,
        label: 'Boss',
        className:
          'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-400/25 dark:bg-rose-950/35 dark:text-rose-100',
      };
    case 'elite':
      return {
        icon: Swords,
        label: '精英',
        className:
          'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-900 dark:border-fuchsia-400/25 dark:bg-fuchsia-950/35 dark:text-fuchsia-100',
      };
    case 'camp':
      return {
        icon: Flame,
        label: '营火',
        className:
          'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-400/25 dark:bg-amber-950/35 dark:text-amber-100',
      };
    case 'treasure':
      return {
        icon: Gift,
        label: '宝箱',
        className:
          'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-400/25 dark:bg-emerald-950/35 dark:text-emerald-100',
      };
    case 'event':
      return {
        icon: Sparkles,
        label: '事件',
        className:
          'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-400/25 dark:bg-sky-950/35 dark:text-sky-100',
      };
    case 'shop':
      return {
        icon: ShoppingBag,
        label: '商店',
        className:
          'border-cyan-300 bg-cyan-50 text-cyan-950 dark:border-cyan-400/25 dark:bg-cyan-950/35 dark:text-cyan-100',
      };
    default:
      return {
        icon: Brain,
        label: '普通题',
        className:
          'border-slate-200 bg-white text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100',
      };
  }
}

function nodeMapTheme(kind: ReviewRouteNode['kind']) {
  switch (kind) {
    case 'boss':
      return {
        icon: Castle,
        label: 'Boss',
        nodeClass:
          'border-rose-300 bg-[linear-gradient(145deg,#fff7ed,#ffd6df_58%,#f6a8b7)] text-rose-950 shadow-[0_12px_24px_rgba(244,114,182,0.24)] outline outline-[3px] outline-white/65',
        activeRing: 'ring-rose-300/70',
      };
    case 'elite':
      return {
        icon: Swords,
        label: '精英',
        nodeClass:
          'border-fuchsia-300 bg-[linear-gradient(145deg,#fff7fb,#f8d7ee_58%,#e9a7d8)] text-fuchsia-950 shadow-[0_12px_24px_rgba(217,70,239,0.2)] outline outline-[3px] outline-white/65',
        activeRing: 'ring-fuchsia-300/70',
      };
    case 'camp':
      return {
        icon: Flame,
        label: '营火',
        nodeClass:
          'border-amber-300 bg-[linear-gradient(145deg,#fff8e7,#ffe5a8_60%,#f7be5a)] text-amber-950 shadow-[0_12px_24px_rgba(245,158,11,0.22)] outline outline-[3px] outline-white/65',
        activeRing: 'ring-amber-300/70',
      };
    case 'treasure':
      return {
        icon: Gift,
        label: '宝箱',
        nodeClass:
          'border-emerald-300 bg-[linear-gradient(145deg,#fafff7,#d9f5df_58%,#9adfb2)] text-emerald-950 shadow-[0_12px_24px_rgba(52,211,153,0.22)] outline outline-[3px] outline-white/65',
        activeRing: 'ring-emerald-300/70',
      };
    case 'event':
      return {
        icon: Sparkles,
        label: '事件',
        nodeClass:
          'border-sky-300 bg-[linear-gradient(145deg,#f8fdff,#d8eff8_58%,#91d3ea)] text-sky-950 shadow-[0_12px_24px_rgba(56,189,248,0.22)] outline outline-[3px] outline-white/65',
        activeRing: 'ring-sky-300/70',
      };
    case 'shop':
      return {
        icon: ShoppingBag,
        label: '商店',
        nodeClass:
          'border-cyan-300 bg-[linear-gradient(145deg,#f8ffff,#d5f5f4_58%,#91d8df)] text-cyan-950 shadow-[0_12px_24px_rgba(34,211,238,0.2)] outline outline-[3px] outline-white/65',
        activeRing: 'ring-cyan-300/70',
      };
    default:
      return {
        icon: Brain,
        label: '普通题',
        nodeClass:
          'border-slate-300 bg-[linear-gradient(145deg,#fffdf7,#eef6ff_58%,#cfe1f6)] text-slate-950 shadow-[0_12px_24px_rgba(148,163,184,0.22)] outline outline-[3px] outline-white/65',
        activeRing: 'ring-blue-200/80',
      };
  }
}

function getMapNodeSize(node: ReviewRouteNode): number {
  return node.kind === 'boss' ? MAP_BOSS_NODE_SIZE : MAP_NODE_SIZE;
}

function isSupportMapNode(node: ReviewRouteNode): boolean {
  return ['camp', 'treasure', 'event', 'shop'].includes(node.kind);
}

function buildDisplayLayers(route: ReviewRoute): MapDisplayLayer[] {
  const displayLayers: MapDisplayLayer[] = [];
  const delayedFirstSupportNodes: ReviewRouteNode[] = [];
  const bossNodes: { node: ReviewRouteNode; sourceLayerIndex: number }[] = [];

  route.layers.forEach((layer, sourceLayerIndex) => {
    const nodes = layer.nodes.filter(Boolean);
    const normalNodes: ReviewRouteNode[] = [];
    const firstLayerSupportNodes: ReviewRouteNode[] = [];

    nodes.forEach((node) => {
      if (node.kind === 'boss') {
        bossNodes.push({ node, sourceLayerIndex });
        return;
      }
      if (sourceLayerIndex === 0 && isSupportMapNode(node)) {
        firstLayerSupportNodes.push(node);
        return;
      }
      normalNodes.push(node);
    });

    if (normalNodes.length > 0) {
      displayLayers.push({
        id: `${layer.id}-playable-${sourceLayerIndex}`,
        title: layer.title,
        summary: layer.summary,
        sourceLayerIndex,
        nodes: normalNodes,
      });
    }

    delayedFirstSupportNodes.push(...firstLayerSupportNodes);
  });

  if (delayedFirstSupportNodes.length > 0) {
    const insertIndex = Math.min(1, displayLayers.length);
    displayLayers.splice(insertIndex, 0, {
      id: 'delayed-first-support',
      title: '第一段补给',
      summary: '先完成开局题目，再领取这些补给。',
      sourceLayerIndex: 0,
      nodes: delayedFirstSupportNodes,
    });
  }

  if (bossNodes.length > 0) {
    const finalBossNode = bossNodes[bossNodes.length - 1];
    displayLayers.push({
      id: 'final-boss',
      title: '最终 Boss',
      summary: '所有路线最后都会汇聚到这里，做完才算这轮复习收束。',
      sourceLayerIndex: finalBossNode.sourceLayerIndex,
      nodes: [finalBossNode.node],
    });
  }

  return displayLayers.length > 0
    ? displayLayers
    : route.layers.map((layer, sourceLayerIndex) => ({
        id: layer.id,
        title: layer.title,
        summary: layer.summary,
        sourceLayerIndex,
        nodes: layer.nodes,
      }));
}

const GENERIC_TITLE_REPLACEMENTS: Record<string, string> = {
  连续性检测: '连续性裂缝',
  导数法则检测: '导数链式反应',
  可导性判断: '可导性分岔口',
  综合挑战Boss: '综合终局战',
  综合挑战: '综合终局战',
  奖励宝箱: '星光宝箱',
  商店: '提示小卖部',
  心跳事件: '心跳赌局',
};

function getDisplayNodeTitle(node: ReviewRouteNode): string {
  const title = node.title.trim();
  const compactTitle = title.replace(/\s+/g, '');
  const replacement = GENERIC_TITLE_REPLACEMENTS[compactTitle] ?? GENERIC_TITLE_REPLACEMENTS[title];
  if (replacement) return replacement;
  if (node.kind === 'boss')
    return title.replace(/综合挑战\s*Boss|综合检测|Boss检测/g, '综合终局战');
  if (/(检测|小测|练习)$/.test(title)) {
    const base = title.replace(/(检测|小测|练习)$/, '').trim();
    return base ? `${base}清理战` : '知识点清理战';
  }
  return title;
}

function distributeNodeX(nodes: ReviewRouteNode[], index: number, layerIndex: number): number {
  const count = nodes.length;
  const center = MAP_WIDTH / 2;
  const bossIndex = nodes.findIndex((node) => node.kind === 'boss');
  if (bossIndex >= 0) {
    if (index === bossIndex) return center;
    const nonBossIndexes = nodes
      .map((node, nodeIndex) => (node.kind === 'boss' ? -1 : nodeIndex))
      .filter((nodeIndex) => nodeIndex >= 0);
    const order = Math.max(0, nonBossIndexes.indexOf(index));
    const offsets =
      nonBossIndexes.length <= 1
        ? [190]
        : nonBossIndexes.length === 2
          ? [-190, 190]
          : [-260, -130, 130, 260];
    return center + (offsets[order] ?? 260);
  }
  if (count <= 1) return center + (layerIndex % 2 === 0 ? -18 : 18);
  const spread = Math.min(430, 116 + (count - 1) * 132);
  const offset = count <= 2 ? (layerIndex % 2 === 0 ? -24 : 24) : 0;
  return center - spread / 2 + (spread * index) / (count - 1) + offset;
}

function buildMapNodePositions(displayLayers: MapDisplayLayer[]): {
  height: number;
  positions: MapNodePosition[];
} {
  const height =
    MAP_TOP_PADDING +
    MAP_BOTTOM_PADDING +
    MAP_BOSS_NODE_SIZE +
    (displayLayers.length - 1) * MAP_LAYER_GAP;
  return {
    height,
    positions: displayLayers.flatMap((layer, displayLayerIndex) =>
      layer.nodes.map((node, nodeIndex) => ({
        displayLayerIndex,
        sourceLayerIndex: layer.sourceLayerIndex,
        nodeIndex,
        node,
        x: MAP_X_OFFSET + distributeNodeX(layer.nodes, nodeIndex, displayLayerIndex),
        y:
          height -
          MAP_BOTTOM_PADDING -
          getMapNodeSize(node) / 2 -
          displayLayerIndex * MAP_LAYER_GAP,
      })),
    ),
  };
}

function getConnectorTargetIndexes(
  currentIndex: number,
  currentCount: number,
  nextCount: number,
): number[] {
  if (nextCount <= 0) return [];
  if (currentCount <= 1) {
    return nextCount <= 3
      ? Array.from({ length: nextCount }, (_, index) => index)
      : [1, 2].filter((index) => index < nextCount);
  }
  const center = (currentIndex * (nextCount - 1)) / Math.max(1, currentCount - 1);
  const candidates = [Math.floor(center), Math.ceil(center)];
  if (nextCount > currentCount) {
    candidates.push(currentIndex % 2 === 0 ? Math.ceil(center) + 1 : Math.floor(center) - 1);
  }
  if (nextCount < currentCount) candidates.push(Math.round(center));
  return Array.from(new Set(candidates))
    .filter((index) => index >= 0 && index < nextCount)
    .slice(0, 2);
}

function getNodeStatus(args: {
  displayLayers: MapDisplayLayer[];
  position: MapNodePosition;
  completedNodeIds: Set<string>;
}): RouteNodeStatus {
  if (args.completedNodeIds.has(args.position.node.id)) return 'completed';
  if (args.position.displayLayerIndex === 0) return 'available';

  const previousNodes = args.displayLayers[args.position.displayLayerIndex - 1]?.nodes ?? [];
  for (let previousIndex = 0; previousIndex < previousNodes.length; previousIndex += 1) {
    const previous = previousNodes[previousIndex];
    if (!args.completedNodeIds.has(previous.id)) continue;
    const targets = getConnectorTargetIndexes(
      previousIndex,
      previousNodes.length,
      args.displayLayers[args.position.displayLayerIndex]?.nodes.length ?? 0,
    );
    if (targets.includes(args.position.nodeIndex)) return 'available';
  }
  return 'locked';
}

function isQuestionNode(node: ReviewRouteNode): boolean {
  if (typeof node.requiresQuestion === 'boolean') return node.requiresQuestion;
  return ['normal', 'elite', 'boss'].includes(node.kind);
}

function rewardKindLabel(kind: ReviewRouteNode['rewardKind'] | undefined): string {
  switch (kind) {
    case 'run_card':
      return '局内卡';
    case 'reward_coin':
      return '奖励币';
    case 'card_back_shard':
      return '卡背碎片';
    case 'relic_shard':
      return '遗物碎片';
    case 'forgiveness':
      return '答错豁免';
    case 'card_upgrade':
      return '卡牌升级';
    case 'hint_card':
      return '提示卡';
    case 'mentor_cosmetic_shard':
      return '导师装饰碎片';
    case 'multiplier':
      return '倍率调整';
    default:
      return '局内补给';
  }
}

function getRewardPoints(node: ReviewRouteNode): number {
  if (typeof node.rewardPoints === 'number' && Number.isFinite(node.rewardPoints)) {
    return Math.max(0, Math.round(node.rewardPoints));
  }
  const questionCount = getQuestionCount(node);
  const baseByKind: Record<ReviewRouteNode['kind'], number> = {
    normal: 10,
    elite: 24,
    boss: 60,
    camp: 8,
    treasure: 18,
    event: 14,
    shop: 0,
  };
  const difficultyBonus = node.difficulty === 'hard' ? 10 : node.difficulty === 'medium' ? 4 : 0;
  const questionBonus = isQuestionNode(node) ? Math.max(0, questionCount - 2) * 2 : 0;
  const rewardKindBonus = ['reward_coin', 'relic_shard', 'card_back_shard'].includes(
    node.rewardKind,
  )
    ? 6
    : ['run_card', 'forgiveness', 'card_upgrade'].includes(node.rewardKind)
      ? 4
      : 0;
  return Math.max(
    0,
    Math.min(120, baseByKind[node.kind] + difficultyBonus + questionBonus + rewardKindBonus),
  );
}

function getRewardPointsLine(node: ReviewRouteNode): string {
  const points = getRewardPoints(node);
  return points > 0 ? `通关 +${points} 奖励积分` : '通关不额外发放奖励积分';
}

function getRewardSummary(node: ReviewRouteNode): string {
  const preview = node.rewardPreview?.trim();
  if (!preview) return getRewardPointsLine(node);
  if (/\d{1,3}\s*(?:奖励积分|积分|奖励币)/.test(preview)) return preview;
  return `${getRewardPointsLine(node)} · ${preview}`;
}

function parseMultiplierBonus(text: string | undefined): number | null {
  if (!text) return null;
  const match = text.match(/倍率\s*\+\s*(0?\.\d+|[1-9]\d*(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
}

function getNodeMultiplierBonus(node: ReviewRouteNode): number {
  const parsed = parseMultiplierBonus(node.rewardPreview);
  if (typeof parsed === 'number') return parsed;
  if (node.rewardKind === 'multiplier') return 0.2;
  if (node.kind === 'boss') return 0.25;
  if (node.kind === 'elite') return 0.12;
  if (node.kind === 'normal') return 0.05;
  if (['camp', 'treasure', 'event'].includes(node.kind)) return 0.04;
  return 0;
}

function formatMultiplier(multiplier: number): string {
  return `x${multiplier.toFixed(2)}`;
}

function defaultEventOptions(node: ReviewRouteNode) {
  if ((node.eventOptions ?? []).length > 0) return node.eventOptions ?? [];
  return [
    {
      label: '现在做一题高难题',
      effect: '下一题答对时获得双倍奖励',
      tradeoff: '答错会失去当前倍率',
      rewardPreview: '双倍奖励',
    },
    {
      label: '跳过一题',
      effect: '立刻保住节奏继续前进',
      tradeoff: '失去当前倍率',
      rewardPreview: '稳定推进',
    },
  ];
}

function supportNodeActions(node: ReviewRouteNode): string[] {
  switch (node.kind) {
    case 'camp':
      return ['整理 1 道错题', '恢复 1 次答错豁免', '升级 1 张局内卡'];
    case 'treasure':
      return ['获得 1 张局内卡', '获得少量奖励币', '获得卡背/遗物碎片'];
    case 'shop':
      return ['用奖励币换提示卡', '用奖励币换豁免卡', '兑换导师装饰碎片'];
    default:
      return [];
  }
}

function getQuestionCount(node: ReviewRouteNode): number {
  if (!isQuestionNode(node)) return 0;
  if (typeof node.questionCount === 'number' && node.questionCount > 0) return node.questionCount;
  if (node.kind === 'boss') return 5;
  if (node.kind === 'elite') return 4;
  return 3;
}

function getPersonalReason(node: ReviewRouteNode): string {
  if (node.personalReason?.trim()) return node.personalReason;
  const points = node.knowledgePoints.join('、') || '这个知识点';
  if (node.kind === 'boss') return `最后用综合题把「${points}」串起来，确认你不是只会单点题。`;
  if (node.kind === 'elite') return `这里会稍微加压，看看「${points}」换个问法还稳不稳。`;
  if (isQuestionNode(node)) return `我把「${points}」放到这一关，是想确认这个小点已经补稳了。`;
  return node.checkGoal;
}

function getPassCriteria(node: ReviewRouteNode): string {
  if (node.passCriteria?.trim()) return node.passCriteria;
  const count = getQuestionCount(node);
  if (count > 0) return `${count} 题中至少答对 ${Math.max(1, count - 1)} 题才算过关`;
  return '完成领取或选择后通过';
}

function getRequiredCorrectCount(node: ReviewRouteNode, questionCount: number): number {
  if (questionCount <= 0) return 0;
  if (node.kind === 'boss') return questionCount;
  return Math.max(1, questionCount - 1);
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

function flattenStageQuizQuestions(data: StageStoreData | null): ReviewQuestionSource[] {
  if (!data) return [];
  const rows: ReviewQuestionSource[] = [];
  data.scenes
    .slice()
    .sort((a, b) => a.order - b.order)
    .forEach((scene: Scene) => {
      if (scene.type !== 'quiz' || scene.content.type !== 'quiz') return;
      scene.content.questions.forEach((question) => {
        rows.push({
          sceneId: scene.id,
          sceneTitle: scene.title || '历史测验',
          question,
        });
      });
    });
  return rows;
}

function scoreQuestionForNode(source: ReviewQuestionSource, node: ReviewRouteNode): number {
  const haystack = normalizeSearchText(
    [
      source.sceneTitle,
      source.question.question,
      source.question.analysis,
      source.question.explanation,
      source.question.commentPrompt,
      source.question.options?.map((option) => option.label).join(' '),
    ]
      .filter(Boolean)
      .join(' '),
  );
  let score = 0;
  for (const point of node.knowledgePoints) {
    const normalizedPoint = normalizeSearchText(point);
    if (!normalizedPoint) continue;
    if (haystack.includes(normalizedPoint)) score += 12;
    const pieces = normalizedPoint.split(/[、，,;；/\\|·.。:：()[\]{}<>《》]+/).filter(Boolean);
    for (const piece of pieces) {
      if (piece.length >= 2 && haystack.includes(piece)) score += 3;
    }
  }
  const title = normalizeSearchText(getDisplayNodeTitle(node));
  if (title && haystack.includes(title)) score += 5;
  return score;
}

function makeFallbackOption(label: string, value: string): { label: string; value: string } {
  return { label, value };
}

function buildSyntheticReviewQuestions(node: ReviewRouteNode): QuizQuestion[] {
  const count = getQuestionCount(node);
  const points = node.knowledgePoints.length > 0 ? node.knowledgePoints : ['本关知识点'];
  return Array.from({ length: Math.max(1, count) }, (_, index) => {
    const point = points[index % points.length] ?? points[0];
    const suffix = `${node.id}-fallback-${index + 1}`;
    const values = ['A', 'B', 'C', 'D'];
    const correctValue = values[index % values.length] ?? 'A';
    const correctLabel =
      index % 3 === 2 ? `对「${point}」的关键条件、适用范围或推理链条还没有说清。` : node.checkGoal;
    const distractors = [
      '只看题目关键词，不需要写出推理过程。',
      '遇到不会的步骤直接跳过，不影响判断。',
      '只背结论，不检查适用条件。',
    ];
    let distractorIndex = 0;
    return {
      id: suffix,
      type: 'single',
      question:
        index % 3 === 1
          ? `做「${getDisplayNodeTitle(node)}」这一关时，最应该先确认哪件事？`
          : index % 3 === 2
            ? `如果这关做错，最可能说明哪块还没稳住？`
            : `这关围绕「${point}」检测你是否达成目标。下面哪一项最符合本关要求？`,
      options: values.map((value) =>
        makeFallbackOption(
          value === correctValue ? correctLabel : (distractors[distractorIndex++] ?? '偏离题意'),
          value,
        ),
      ),
      answer: correctValue,
      analysis: `这一关要确认的是：${node.checkGoal}。这道题是路线图为防止做题空间空白生成的兜底题，后续可以用题库真题替换。`,
      points: 1,
    };
  });
}

function buildReviewQuestionsForNode(
  node: ReviewRouteNode,
  sources: ReviewQuestionSource[],
): QuizQuestion[] {
  const count = Math.max(1, getQuestionCount(node));
  const ranked = sources
    .map((source, index) => ({ source, index, score: scoreQuestionForNode(source, node) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = ranked
    .filter((entry) => entry.score > 0)
    .slice(0, count)
    .map((entry) => ({
      ...entry.source.question,
      id: `review-${node.id}-${entry.source.sceneId}-${entry.source.question.id}`,
    }));

  if (selected.length >= count) return selected;

  const used = new Set(selected.map((question) => question.id));
  const fillers = ranked
    .filter((entry) => entry.score <= 0)
    .slice(0, count - selected.length)
    .map((entry) => ({
      ...entry.source.question,
      id: `review-${node.id}-${entry.source.sceneId}-${entry.source.question.id}`,
    }))
    .filter((question) => {
      if (used.has(question.id)) return false;
      used.add(question.id);
      return true;
    });
  const combined = [...selected, ...fillers];
  if (combined.length >= count) return combined.slice(0, count);

  return [...combined, ...buildSyntheticReviewQuestions(node)].slice(0, count);
}

function getSourceSignalLabels(node: ReviewRouteNode): string[] {
  const labels: Record<string, string> = {
    wrong_problem: '错题线索',
    weak_point: '薄弱点',
    untried_concept: '未尝试',
    thin_bank: '题量偏薄',
    mastered_review: '掌握巩固',
    boss_mix: '综合 Boss',
    reward: '奖励节点',
    recovery: '恢复节奏',
    choice: '选择事件',
  };
  const signals = node.sourceSignals ?? [];
  if (signals.length === 0) {
    if (node.kind === 'boss') return ['综合 Boss'];
    if (isQuestionNode(node)) return ['复习检测'];
    return ['局内补给'];
  }
  return signals.map((signal) => labels[signal] ?? signal).slice(0, 4);
}

function getMapStatusLabel(status: RouteNodeStatus, node: ReviewRouteNode): string {
  if (status === 'completed') return '已完成';
  if (status === 'locked') return '待解锁';
  return isQuestionNode(node) ? '可挑战' : '可进入';
}

function connectorStyle(status: RouteNodeStatus): {
  stroke: string;
  strokeWidth: number;
  opacity: number;
  strokeDasharray?: string;
} {
  if (status === 'completed') {
    return { stroke: '#10b981', strokeWidth: 5, opacity: 0.85 };
  }
  if (status === 'available') {
    return { stroke: '#d8a94b', strokeWidth: 5, opacity: 0.88, strokeDasharray: '8 12' };
  }
  return { stroke: '#cbd5e1', strokeWidth: 3, opacity: 0.62, strokeDasharray: '6 12' };
}

export default function ReviewRouteMapPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const notebookId = typeof params?.id === 'string' ? params.id : '';
  const requestedRouteId = searchParams.get('routeId') || '';
  const userId = useAuthStore((s) => (s.userId?.trim() ? s.userId : 'user-anonymous'));
  const history = useMemo(() => listReviewRouteHistory(userId, notebookId), [notebookId, userId]);
  const activeHistory = history.find((item) => item.id === requestedRouteId) ?? history[0] ?? null;
  const route = activeHistory?.route ?? null;
  const routeId = activeHistory?.id ?? '';
  const [completedNodeIds, setCompletedNodeIds] = useState<string[]>(() =>
    routeId ? loadReviewRouteProgress({ userId, notebookId, routeId }).completedNodeIds : [],
  );
  const [withdrawnReward, setWithdrawnReward] = useState<{
    rewardPoints: number;
    baseRewardPoints: number;
    multiplier: number;
    withdrawnAt?: number;
  }>(() => {
    if (!routeId) return { rewardPoints: 0, baseRewardPoints: 0, multiplier: 1 };
    const progress = loadReviewRouteProgress({ userId, notebookId, routeId });
    return {
      rewardPoints: progress.withdrawnRewardPoints ?? 0,
      baseRewardPoints: progress.withdrawnBaseRewardPoints ?? 0,
      multiplier: progress.withdrawnMultiplier ?? 1,
      withdrawnAt: progress.withdrawnAt,
    };
  });
  const [selectedChallenge, setSelectedChallenge] = useState<ReviewChallenge | null>(null);
  const [activeChallenge, setActiveChallenge] = useState<ReviewChallenge | null>(null);
  const [challengeResult, setChallengeResult] = useState<ChallengeResult | null>(null);
  const [selectedEventOptionIndex, setSelectedEventOptionIndex] = useState(0);
  const [mapBackground, setMapBackground] = useState<string>(REVIEW_MAP_BACKGROUNDS[0]);
  const [stageData, setStageData] = useState<StageStoreData | null>(null);
  const completedNodeSet = useMemo(() => new Set(completedNodeIds), [completedNodeIds]);
  const displayRouteLayers = useMemo(() => (route ? buildDisplayLayers(route) : []), [route]);
  const quizQuestionSources = useMemo(() => flattenStageQuizQuestions(stageData), [stageData]);
  const activeChallengeQuestions = useMemo(() => {
    if (!activeChallenge || !isQuestionNode(activeChallenge.node)) return [];
    return buildReviewQuestionsForNode(activeChallenge.node, quizQuestionSources);
  }, [activeChallenge, quizQuestionSources]);
  const totalRouteNodeCount = useMemo(
    () => displayRouteLayers.reduce((sum, layer) => sum + layer.nodes.length, 0),
    [displayRouteLayers],
  );
  const completedRouteNodeCount = displayRouteLayers.reduce(
    (sum, layer) => sum + layer.nodes.filter((node) => completedNodeSet.has(node.id)).length,
    0,
  );
  const totalRewardPoints = displayRouteLayers.reduce(
    (sum, layer) => sum + layer.nodes.reduce((nodeSum, node) => nodeSum + getRewardPoints(node), 0),
    0,
  );
  const completedRewardPoints = displayRouteLayers.reduce(
    (sum, layer) =>
      sum +
      layer.nodes.reduce(
        (nodeSum, node) => nodeSum + (completedNodeSet.has(node.id) ? getRewardPoints(node) : 0),
        0,
      ),
    0,
  );
  const completedMultiplierBonus = displayRouteLayers.reduce(
    (sum, layer) =>
      sum +
      layer.nodes.reduce(
        (nodeSum, node) =>
          nodeSum + (completedNodeSet.has(node.id) ? getNodeMultiplierBonus(node) : 0),
        0,
      ),
    0,
  );
  const currentMultiplier = Number(Math.min(3, 1 + completedMultiplierBonus).toFixed(2));
  const withdrawableRewardPoints = Math.round(completedRewardPoints * currentMultiplier);
  const bossCompleted = displayRouteLayers.some((layer) =>
    layer.nodes.some((node) => node.kind === 'boss' && completedNodeSet.has(node.id)),
  );
  const rewardWithdrawn = Boolean(withdrawnReward.withdrawnAt);

  useEffect(() => {
    const nextBackground =
      REVIEW_MAP_BACKGROUNDS[Math.floor(Math.random() * REVIEW_MAP_BACKGROUNDS.length)] ??
      REVIEW_MAP_BACKGROUNDS[0];
    setMapBackground(nextBackground);
  }, [routeId]);

  useEffect(() => {
    let cancelled = false;
    setStageData(null);
    if (!notebookId) return undefined;
    void loadStageData(notebookId)
      .then((nextStageData) => {
        if (!cancelled) setStageData(nextStageData);
      })
      .catch(() => {
        if (!cancelled) setStageData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [notebookId]);

  const handleReviewQuizFinished = (results?: QuestionResult[]) => {
    if (
      !activeChallenge ||
      !isQuestionNode(activeChallenge.node) ||
      !results ||
      results.length === 0
    ) {
      setChallengeResult(null);
      return;
    }
    const correctCount = results.filter((result) => result.status === 'correct').length;
    const totalCount = activeChallengeQuestions.length || results.length;
    const requiredCorrect = getRequiredCorrectCount(activeChallenge.node, totalCount);
    const ok = correctCount >= requiredCorrect;
    setChallengeResult({
      ok,
      title: ok ? '结果 OK' : '还没过关',
      feedback: ok
        ? `答对 ${correctCount}/${totalCount}，已经达到本关标准。看完解析后结算，${getRewardPointsLine(activeChallenge.node)}，我会帮你解锁下一段路线。`
        : `这次答对 ${correctCount}/${totalCount}，本关需要至少答对 ${requiredCorrect} 题。先把解析看一下，再重试一轮就好。`,
    });
  };

  const handleCompleteChallenge = () => {
    if (!activeChallenge || !challengeResult?.ok || !routeId) return;
    const progress = markReviewRouteNodeCompleted({
      userId,
      notebookId,
      routeId,
      nodeId: activeChallenge.node.id,
    });
    setCompletedNodeIds(progress.completedNodeIds);
    setActiveChallenge(null);
    setSelectedChallenge(null);
    setChallengeResult(null);
    toast.success(`本关完成，${getRewardPointsLine(activeChallenge.node)}`);
  };

  const handleCompleteSupportNode = () => {
    if (!activeChallenge || !routeId) return;
    const progress = markReviewRouteNodeCompleted({
      userId,
      notebookId,
      routeId,
      nodeId: activeChallenge.node.id,
    });
    setCompletedNodeIds(progress.completedNodeIds);
    setActiveChallenge(null);
    setSelectedChallenge(null);
    setChallengeResult(null);
    setSelectedEventOptionIndex(0);
    toast.success(`补给节点完成，${getRewardPointsLine(activeChallenge.node)}`);
  };

  const handleWithdrawReward = () => {
    if (!routeId || !bossCompleted || rewardWithdrawn) return;
    const progress = withdrawReviewRouteReward({
      userId,
      notebookId,
      routeId,
      baseRewardPoints: completedRewardPoints,
      multiplier: currentMultiplier,
      rewardPoints: withdrawableRewardPoints,
    });
    setWithdrawnReward({
      rewardPoints: progress.withdrawnRewardPoints ?? withdrawableRewardPoints,
      baseRewardPoints: progress.withdrawnBaseRewardPoints ?? completedRewardPoints,
      multiplier: progress.withdrawnMultiplier ?? currentMultiplier,
      withdrawnAt: progress.withdrawnAt,
    });
    toast.success(`提现成功：+${withdrawableRewardPoints} 奖励积分`);
  };

  if (!route || !routeId) {
    return (
      <main className="flex min-h-full flex-col items-center justify-center gap-4 bg-slate-950 px-4 text-white">
        <p>还没有可以打开的复习地图。</p>
        <Link
          href={`/review/${notebookId}`}
          className="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-950"
        >
          返回复习首页
        </Link>
      </main>
    );
  }

  if (activeChallenge) {
    const theme = nodeTheme(activeChallenge.node.kind);
    const Icon = theme.icon;
    const questionNode = isQuestionNode(activeChallenge.node);
    const eventOptions = defaultEventOptions(activeChallenge.node);
    const supportActions = supportNodeActions(activeChallenge.node);
    const selectedEventOption = eventOptions[selectedEventOptionIndex] ?? eventOptions[0];

    if (questionNode) {
      const battleHeader = (
        <header className="shrink-0 rounded-[1.5rem] border border-white/80 bg-white/86 p-3 shadow-[0_14px_36px_rgba(148,163,184,0.18)] backdrop-blur dark:border-white/10 dark:bg-slate-950/82 dark:shadow-black/25 md:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <button
                type="button"
                onClick={() => {
                  setActiveChallenge(null);
                  setChallengeResult(null);
                  setSelectedEventOptionIndex(0);
                }}
                className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white/85 px-3 py-2 text-xs font-bold text-slate-600 shadow-sm transition-colors hover:border-rose-200 hover:text-slate-950 dark:border-white/10 dark:bg-white/8 dark:text-slate-300 dark:hover:text-white"
              >
                <ArrowLeft className="size-4" />
                地图
              </button>
              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-700 shadow-inner dark:bg-rose-400/10 dark:text-rose-100">
                <Icon className="size-6" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-950 px-2 py-1 text-[11px] font-black text-white dark:bg-white dark:text-slate-950">
                    第 {activeChallenge.layerIndex + 1} 层 · {theme.label}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                    {activeChallenge.node.difficulty}
                  </span>
                  <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700 dark:bg-amber-400/10 dark:text-amber-100">
                    {getRewardSummary(activeChallenge.node)}
                  </span>
                </div>
                <h1 className="mt-2 truncate text-xl font-black md:text-2xl">
                  {getDisplayNodeTitle(activeChallenge.node)}
                </h1>
                <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400 md:text-sm">
                  {getPersonalReason(activeChallenge.node)} ·{' '}
                  {getPassCriteria(activeChallenge.node)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-xs font-black text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/7 dark:text-slate-300">
                共 {activeChallengeQuestions.length} 题 · 需答对{' '}
                {getRequiredCorrectCount(activeChallenge.node, activeChallengeQuestions.length)} 题
              </div>
              <div className="rounded-2xl border border-sky-100 bg-sky-50/85 px-3 py-2 text-xs font-black text-sky-700 shadow-sm dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100">
                题库 {quizQuestionSources.length} 题可用
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-xs font-black text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/7 dark:text-slate-300">
                进度 {completedRouteNodeCount}/{totalRouteNodeCount}
              </div>
            </div>
          </div>

          {challengeResult ? (
            <div
              className={cn(
                'mt-3 flex flex-col gap-3 rounded-2xl border px-3 py-2 text-sm leading-6 md:flex-row md:items-center md:justify-between',
                challengeResult.ok
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-950/30 dark:text-emerald-100'
                  : 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-400/20 dark:bg-rose-950/30 dark:text-rose-100',
              )}
            >
              <div>
                <div className="flex items-center gap-2 font-black">
                  {challengeResult.ok ? <CheckCircle2 className="size-4" /> : null}
                  {challengeResult.title}
                </div>
                <p className="text-xs font-semibold opacity-80 md:text-sm">
                  {challengeResult.feedback}
                </p>
              </div>
              {challengeResult.ok ? (
                <button
                  type="button"
                  onClick={handleCompleteChallenge}
                  className="shrink-0 rounded-full bg-slate-950 px-5 py-2 text-sm font-black text-white shadow-lg dark:bg-white dark:text-slate-950"
                >
                  结算 +{getRewardPoints(activeChallenge.node)} 奖励积分
                </button>
              ) : null}
            </div>
          ) : null}
        </header>
      );

      return (
        <main className="h-full min-h-full overflow-hidden bg-[radial-gradient(circle_at_18%_0%,rgba(251,207,232,0.38),transparent_34%),linear-gradient(180deg,#fff7fb,#eef6ff)] text-slate-950 dark:bg-[radial-gradient(circle_at_18%_0%,rgba(190,24,93,0.22),transparent_34%),linear-gradient(180deg,#020617,#0f172a)] dark:text-white">
          <QuizView
            key={`${routeId}:${activeChallenge.node.id}:${activeChallengeQuestions.map((question) => question.id).join('|')}`}
            questions={activeChallengeQuestions}
            sceneId={`review:${routeId}:${activeChallenge.node.id}`}
            onAttemptFinished={handleReviewQuizFinished}
            battleHeader={battleHeader}
          />
        </main>
      );
    }

    return (
      <main className="min-h-full bg-[radial-gradient(circle_at_18%_0%,rgba(251,207,232,0.36),transparent_34%),linear-gradient(180deg,#f8fafc,#eef2f7)] px-4 py-6 text-slate-950 dark:bg-[radial-gradient(circle_at_18%_0%,rgba(190,24,93,0.22),transparent_34%),linear-gradient(180deg,#020617,#0f172a)] dark:text-white md:px-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <button
            type="button"
            onClick={() => {
              setActiveChallenge(null);
              setChallengeResult(null);
              setSelectedEventOptionIndex(0);
            }}
            className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-sm font-semibold text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/8 dark:text-slate-300"
          >
            <ArrowLeft className="size-4" />
            回到地图
          </button>
          <section className={cn('rounded-[2rem] border p-6 shadow-xl md:p-8', theme.className)}>
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/70 shadow-inner dark:bg-black/20">
                  <Icon className="size-7" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-black/5 px-2 py-1 text-xs font-black dark:bg-white/10">
                      第 {activeChallenge.layerIndex + 1} 层 · {theme.label}
                    </span>
                    <span className="rounded-full bg-black/5 px-2 py-1 text-xs font-bold dark:bg-white/10">
                      {activeChallenge.node.difficulty}
                    </span>
                  </div>
                  <h1 className="mt-3 text-3xl font-black md:text-5xl">
                    {getDisplayNodeTitle(activeChallenge.node)}
                  </h1>
                  <p className="mt-3 max-w-3xl text-sm leading-6 opacity-75">
                    {activeChallenge.layerTitle}
                  </p>
                </div>
              </div>
              <div className="rounded-2xl bg-white/60 px-4 py-3 text-sm font-bold shadow-sm dark:bg-black/15">
                {completedRouteNodeCount}/{totalRouteNodeCount} 已完成
              </div>
            </div>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl bg-white/60 p-4 shadow-sm dark:bg-black/15">
                <p className="text-xs font-black opacity-55">为什么给你这关</p>
                <p className="mt-2 text-sm leading-6">{getPersonalReason(activeChallenge.node)}</p>
              </div>
              <div className="rounded-2xl bg-white/60 p-4 shadow-sm dark:bg-black/15">
                <p className="text-xs font-black opacity-55">通过标准</p>
                <p className="mt-2 text-sm leading-6">{getPassCriteria(activeChallenge.node)}</p>
              </div>
              <div className="rounded-2xl bg-white/60 p-4 shadow-sm dark:bg-black/15">
                <p className="text-xs font-black opacity-55">题量 / 通关奖励</p>
                <p className="mt-2 text-sm leading-6">
                  {isQuestionNode(activeChallenge.node)
                    ? `${getQuestionCount(activeChallenge.node)} 题`
                    : rewardKindLabel(activeChallenge.node.rewardKind)}
                  {' · '}
                  {getRewardSummary(activeChallenge.node)}
                </p>
              </div>
            </div>
            {questionNode ? (
              <div className="mt-6 rounded-3xl bg-white/70 p-5 shadow-sm dark:bg-slate-950/45">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-black">本关做题空间</p>
                    <p className="mt-1 max-w-2xl text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
                      共 {activeChallengeQuestions.length} 题，至少答对{' '}
                      {getRequiredCorrectCount(
                        activeChallenge.node,
                        activeChallengeQuestions.length,
                      )}{' '}
                      题过关。
                      {quizQuestionSources.length > 0
                        ? '我会优先从这个笔记本题库里挑题；不够的地方会临时补题，保证你能开始。'
                        : '现在题库还没有可匹配的 quiz 题，我先用路线节点生成临时题，保证这关能打。'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/75 px-3 py-2 text-xs font-black text-slate-600 shadow-sm dark:bg-black/15 dark:text-slate-300">
                    {quizQuestionSources.length} 道题库题可用
                  </div>
                </div>
                <div className="mt-4 h-[min(720px,calc(100dvh-16rem))] min-h-[520px] overflow-hidden rounded-3xl border border-slate-200 bg-white/95 shadow-inner dark:border-white/10 dark:bg-slate-950/75">
                  <QuizView
                    key={`${routeId}:${activeChallenge.node.id}:${activeChallengeQuestions.map((question) => question.id).join('|')}`}
                    questions={activeChallengeQuestions}
                    sceneId={`review:${routeId}:${activeChallenge.node.id}`}
                    onAttemptFinished={handleReviewQuizFinished}
                  />
                </div>
                {challengeResult ? (
                  <div
                    className={cn(
                      'mt-4 rounded-2xl border p-4 text-sm leading-6',
                      challengeResult.ok
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-950/30 dark:text-emerald-100'
                        : 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-400/20 dark:bg-rose-950/30 dark:text-rose-100',
                    )}
                  >
                    <div className="flex items-center gap-2 font-black">
                      {challengeResult.ok ? <CheckCircle2 className="size-4" /> : null}
                      {challengeResult.title}
                    </div>
                    <p className="mt-1">{challengeResult.feedback}</p>
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap justify-end gap-3">
                  {challengeResult?.ok ? (
                    <button
                      type="button"
                      onClick={handleCompleteChallenge}
                      className="rounded-full bg-slate-950 px-5 py-2 text-sm font-black text-white shadow-lg dark:bg-white dark:text-slate-950"
                    >
                      结算 +{getRewardPoints(activeChallenge.node)} 奖励积分
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-3xl bg-white/70 p-5 shadow-sm dark:bg-slate-950/45">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-black">本节点效果</p>
                    <p className="mt-2 max-w-2xl text-sm leading-6 opacity-75">
                      {activeChallenge.node.checkGoal}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 rounded-2xl bg-white/75 px-3 py-2 text-xs font-black shadow-sm dark:bg-black/15">
                    <Coins className="size-4" />
                    {rewardKindLabel(activeChallenge.node.rewardKind)}
                  </div>
                </div>
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold leading-6 text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-950/30 dark:text-emerald-100">
                  {getRewardSummary(activeChallenge.node)}
                </div>
                {activeChallenge.node.kind === 'event' ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {eventOptions.slice(0, 2).map((option, optionIndex) => (
                      <button
                        key={`${activeChallenge.node.id}-event-${optionIndex}`}
                        type="button"
                        onClick={() => setSelectedEventOptionIndex(optionIndex)}
                        className={cn(
                          'rounded-2xl border p-4 text-left transition-colors',
                          selectedEventOptionIndex === optionIndex
                            ? 'border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-400/30 dark:bg-sky-950/35 dark:text-sky-50'
                            : 'border-slate-200 bg-white/75 text-slate-700 hover:border-sky-200 dark:border-white/10 dark:bg-slate-950/45 dark:text-slate-200',
                        )}
                      >
                        <p className="text-sm font-black">{option.label}</p>
                        <p className="mt-2 text-xs font-semibold leading-5 opacity-75">
                          {option.effect}
                        </p>
                        {option.tradeoff ? (
                          <p className="mt-2 text-xs font-bold text-rose-600 dark:text-rose-200">
                            代价：{option.tradeoff}
                          </p>
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : supportActions.length > 0 ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {supportActions.map((action) => (
                      <div
                        key={action}
                        className="rounded-2xl border border-slate-200 bg-white/75 p-4 text-sm font-bold leading-6 text-slate-700 dark:border-white/10 dark:bg-slate-950/45 dark:text-slate-200"
                      >
                        {action}
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-900 dark:border-rose-400/20 dark:bg-rose-950/30 dark:text-rose-100">
                  {activeChallenge.node.kind === 'event' && selectedEventOption
                    ? `选「${selectedEventOption.label}」吧，我会把这个选择记进本局节奏里。`
                    : '领取后会回到地图，后面的题目还是要乖乖打完，我会盯着你的。'}
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={handleCompleteSupportNode}
                    className="rounded-full bg-slate-950 px-5 py-2 text-sm font-black text-white shadow-lg dark:bg-white dark:text-slate-950"
                  >
                    领取 +{getRewardPoints(activeChallenge.node)} 奖励积分
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    );
  }

  const displayLayers = displayRouteLayers;
  const { height, positions } = buildMapNodePositions(displayLayers);
  const byLayer = new Map<number, MapNodePosition[]>();
  for (const position of positions) {
    const list = byLayer.get(position.displayLayerIndex) ?? [];
    list.push(position);
    byLayer.set(position.displayLayerIndex, list);
  }
  const startY = height - 38;
  const selectedNode = selectedChallenge?.node ?? null;
  const selectedNodeTheme = selectedNode ? nodeMapTheme(selectedNode.kind) : null;
  const selectedNodeArtwork = selectedNode
    ? REVIEW_MAP_NODE_ARTWORK[selectedNode.kind]
    : REVIEW_MAP_NODE_ARTWORK.normal;
  const selectedPosition = selectedNode
    ? (positions.find((position) => position.node.id === selectedNode.id) ?? null)
    : null;
  const selectedStatus = selectedPosition
    ? getNodeStatus({
        displayLayers,
        position: selectedPosition,
        completedNodeIds: completedNodeSet,
      })
    : null;
  const selectedLocked = selectedStatus === 'locked';

  return (
    <main className="relative h-full min-h-full overflow-hidden bg-[#fbf7f3] text-slate-950 dark:bg-slate-950 dark:text-white">
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center transition-opacity duration-500"
        style={{ backgroundImage: `url("${mapBackground}")` }}
      />

      <div className="absolute left-5 top-5 z-50 max-w-md overflow-visible rounded-[1.7rem_2rem_1.55rem_1.9rem] border border-amber-200/80 bg-[#fffaf0]/90 p-4 shadow-[0_14px_34px_rgba(166,124,82,0.18)] backdrop-blur-[2px] dark:border-amber-200/20 dark:bg-slate-950/78 dark:shadow-black/30 md:left-8 md:top-7">
        <span className="pointer-events-none absolute -top-3 left-10 h-7 w-28 -rotate-3 rounded-sm border border-amber-200/50 bg-[#ffe5ad]/60 shadow-sm" />
        <span className="pointer-events-none absolute right-8 top-3 h-3 w-16 rotate-6 rounded-full bg-rose-200/30 blur-[1px]" />
        <Link
          href={`/review/${notebookId}`}
          className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-[#fffdf7]/85 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/8 dark:text-slate-300"
        >
          <ArrowLeft className="size-4" />
          返回复习
        </Link>
        <h1 className="text-2xl font-black md:text-3xl">{route.title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
          {route.teacherLine}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-[1.1rem_1.35rem_1.2rem_1rem] border border-amber-300/70 bg-[#fff4cd]/72 p-3 text-amber-950 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.58)] dark:border-amber-400/20 dark:bg-amber-950/30 dark:text-amber-100">
            <p className="text-[11px] font-black opacity-70">奖励积分</p>
            <p className="mt-1 text-lg font-black">
              +{completedRewardPoints} / {totalRewardPoints}
            </p>
          </div>
          <div className="rounded-[1.25rem_1rem_1.15rem_1.35rem] border border-sky-200/80 bg-[#eaf7ff]/72 p-3 text-sky-950 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.58)] dark:border-sky-400/20 dark:bg-sky-950/30 dark:text-sky-100">
            <p className="text-[11px] font-black opacity-70">当前倍率</p>
            <p className="mt-1 text-lg font-black">{formatMultiplier(currentMultiplier)}</p>
          </div>
        </div>
        <div className="mt-2 rounded-[1rem_1.25rem_1.1rem_1.2rem] border border-amber-200/70 bg-[#fffdf8]/72 p-3 text-xs font-bold leading-5 text-slate-600 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.5)] dark:border-white/10 dark:bg-white/7 dark:text-slate-300">
          可提现 = 已获得 {completedRewardPoints} × 倍率 {formatMultiplier(currentMultiplier)} =
          <span className="ml-1 font-black text-slate-950 dark:text-white">
            {withdrawableRewardPoints} 积分
          </span>
        </div>
        <button
          type="button"
          disabled={!bossCompleted || rewardWithdrawn}
          onClick={handleWithdrawReward}
          className={cn(
            'mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[1.1rem_1.35rem_1.15rem_1.25rem] border px-4 py-2.5 text-sm font-black shadow-[0_8px_16px_rgba(148,163,184,0.2)] transition-transform',
            bossCompleted && !rewardWithdrawn
              ? 'border-slate-950/80 bg-slate-950 text-white hover:-translate-y-0.5 dark:border-white dark:bg-white dark:text-slate-950'
              : 'cursor-not-allowed border-slate-300/80 bg-[#e9eef6]/85 text-slate-500 dark:border-white/10 dark:bg-white/10 dark:text-slate-500',
          )}
        >
          {rewardWithdrawn ? (
            <>已提现 +{withdrawnReward.rewardPoints} 积分</>
          ) : bossCompleted ? (
            <>提现 +{withdrawableRewardPoints} 积分</>
          ) : (
            <>
              <Lock className="size-4" />
              打完 Boss 后才能提现
            </>
          )}
        </button>
      </div>

      <div className="absolute right-5 top-5 z-50 w-64 overflow-visible rounded-[1.5rem_1.85rem_1.4rem_1.7rem] border border-sky-100/90 bg-[#fffaf0]/88 p-4 shadow-[0_14px_32px_rgba(92,119,151,0.16)] backdrop-blur-[2px] dark:border-white/10 dark:bg-slate-950/74 dark:shadow-black/30 md:right-8 md:top-7">
        <span className="pointer-events-none absolute -top-3 right-10 h-7 w-24 rotate-3 rounded-sm border border-sky-100/70 bg-[#dff5ff]/62 shadow-sm" />
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black text-slate-500 dark:text-slate-400">路线进度</p>
            <p className="mt-1 text-2xl font-black">
              {completedRouteNodeCount}/{totalRouteNodeCount}
            </p>
          </div>
          <div className="flex size-12 items-center justify-center rounded-[1rem_1.25rem_1rem_1.2rem] border border-rose-100 bg-rose-50/85 text-rose-500 shadow-inner dark:bg-rose-400/10 dark:text-rose-200">
            <Trophy className="size-6" />
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full border border-slate-200/70 bg-[#e9edf5] dark:border-white/10 dark:bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-rose-400 to-amber-300"
            style={{
              width: `${Math.round((completedRouteNodeCount / Math.max(1, totalRouteNodeCount)) * 100)}%`,
            }}
          />
        </div>
        <p className="mt-3 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
          每条分支都会把核心知识点复习完，最后汇合到 Boss。
        </p>
      </div>

      <div className="absolute bottom-5 left-5 z-50 max-w-md overflow-visible rounded-[1.45rem_1.8rem_1.55rem_1.6rem] border border-rose-100/90 bg-[#fffaf0]/86 p-4 shadow-[0_14px_30px_rgba(166,124,82,0.16)] backdrop-blur-[2px] dark:border-white/10 dark:bg-slate-950/74 dark:shadow-black/30 md:bottom-7 md:left-8">
        <span className="pointer-events-none absolute -top-2 left-8 h-5 w-20 -rotate-2 rounded-sm border border-rose-100/60 bg-rose-100/54 shadow-sm" />
        <p className="mb-2 text-xs font-black text-slate-500 dark:text-slate-400">本轮覆盖知识点</p>
        <div className="flex max-h-28 flex-wrap gap-2 overflow-hidden">
          {route.knowledgePoints.map((point) => (
            <span
              key={point}
              className="rounded-[0.8rem_1rem_0.85rem_0.95rem] border border-rose-200/90 bg-rose-50/78 px-3 py-1 text-xs font-semibold text-rose-700 shadow-sm dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-100"
            >
              {point}
            </span>
          ))}
        </div>
      </div>

      <div className="absolute inset-0 overflow-auto px-4 py-6">
        <div
          className="relative mx-auto min-w-[1260px]"
          style={{ width: MAP_STAGE_WIDTH, height }}
          aria-label="复习路线图"
          onClick={() => setSelectedChallenge(null)}
        >
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox={`0 0 ${MAP_STAGE_WIDTH} ${height}`}
            role="presentation"
          >
            {(byLayer.get(0) ?? []).map((target) => {
              const targetStatus = getNodeStatus({
                displayLayers,
                position: target,
                completedNodeIds: completedNodeSet,
              });
              const style = connectorStyle(targetStatus);
              const startX = MAP_X_OFFSET + MAP_WIDTH / 2;
              const endY = target.y + getMapNodeSize(target.node) / 2;
              const midY = (startY + endY) / 2;
              return (
                <path
                  key={`start-${target.node.id}`}
                  d={`M ${startX} ${startY} C ${startX} ${midY}, ${target.x} ${midY}, ${target.x} ${endY}`}
                  fill="none"
                  stroke={style.stroke}
                  strokeDasharray={style.strokeDasharray}
                  strokeLinecap="round"
                  strokeWidth={style.strokeWidth}
                  opacity={style.opacity}
                />
              );
            })}
            {displayLayers.slice(0, -1).flatMap((_layer, layerIndex) => {
              const currentPositions = byLayer.get(layerIndex) ?? [];
              const nextPositions = byLayer.get(layerIndex + 1) ?? [];
              return currentPositions.flatMap((from) =>
                getConnectorTargetIndexes(
                  from.nodeIndex,
                  currentPositions.length,
                  nextPositions.length,
                ).map((targetIndex) => {
                  const to = nextPositions[targetIndex];
                  const fromStatus = getNodeStatus({
                    displayLayers,
                    position: from,
                    completedNodeIds: completedNodeSet,
                  });
                  const toStatus = getNodeStatus({
                    displayLayers,
                    position: to,
                    completedNodeIds: completedNodeSet,
                  });
                  const style = connectorStyle(fromStatus === 'completed' ? toStatus : 'locked');
                  const startPathY = from.y - getMapNodeSize(from.node) / 2;
                  const endPathY = to.y + getMapNodeSize(to.node) / 2;
                  const midY = (startPathY + endPathY) / 2;
                  return (
                    <path
                      key={`${from.node.id}-${to.node.id}`}
                      d={`M ${from.x} ${startPathY} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${endPathY}`}
                      fill="none"
                      stroke={style.stroke}
                      strokeDasharray={style.strokeDasharray}
                      strokeLinecap="round"
                      strokeWidth={style.strokeWidth}
                      opacity={style.opacity}
                    />
                  );
                }),
              );
            })}
          </svg>
          <div
            className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center text-center"
            style={{ top: startY - 40 }}
          >
            <span className="pointer-events-none absolute top-1 h-16 w-16 rounded-full bg-amber-200/30 blur-xl" />
            <Image
              src={REVIEW_MAP_NODE_ARTWORK.start}
              alt=""
              width={72}
              height={72}
              className="relative z-10 size-14 rounded-full border-2 border-[#fff7df]/80 object-cover shadow-[0_10px_20px_rgba(92,64,36,0.2)] mix-blend-multiply"
              draggable={false}
            />
            <span className="-mt-1.5 rounded-[0.75rem_0.95rem_0.78rem_0.9rem] border border-amber-200/85 bg-[#fff4d7]/92 px-3 py-1 text-[10px] font-black leading-4 text-slate-800 shadow-[0_6px_12px_rgba(166,124,82,0.15)] dark:border-white/10 dark:bg-slate-950/85 dark:text-slate-100">
              起点
            </span>
          </div>
          {positions.map((position) => {
            const theme = nodeMapTheme(position.node.kind);
            const status = getNodeStatus({
              displayLayers,
              position,
              completedNodeIds: completedNodeSet,
            });
            const locked = status === 'locked';
            const nodeSize = getMapNodeSize(position.node);
            const selected = selectedChallenge?.node.id === position.node.id;
            const nodeArtwork = REVIEW_MAP_NODE_ARTWORK[position.node.kind];
            const badgeSize = position.node.kind === 'boss' ? 94 : 78;
            return (
              <button
                key={position.node.id}
                type="button"
                aria-disabled={locked}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedChallenge({
                    node: position.node,
                    layerTitle: displayLayers[position.displayLayerIndex]?.title ?? '复习关卡',
                    layerIndex: position.displayLayerIndex,
                  });
                  setChallengeResult(null);
                  setSelectedEventOptionIndex(0);
                }}
                className={cn(
                  'absolute flex cursor-pointer flex-col items-center justify-start border-0 bg-transparent text-center text-slate-800 transition-transform hover:z-20 hover:-translate-y-1 focus:outline-none dark:text-slate-100',
                  selected && 'z-30 scale-105',
                  locked && 'grayscale-[0.18]',
                )}
                style={{
                  width: nodeSize + 22,
                  height: nodeSize + 18,
                  left: position.x - (nodeSize + 22) / 2,
                  top: position.y - nodeSize / 2,
                }}
                title={getDisplayNodeTitle(position.node)}
              >
                <span
                  className={cn(
                    'pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full blur-xl transition-opacity',
                    status === 'available'
                      ? 'h-20 w-20 bg-amber-300/32 opacity-100 motion-safe:animate-pulse'
                      : status === 'completed'
                        ? 'h-20 w-20 bg-emerald-300/35 opacity-80'
                        : 'h-16 w-16 bg-slate-300/22 opacity-60',
                  )}
                />
                <div
                  className={cn(
                    'absolute right-1 top-0 z-30 flex size-8 items-center justify-center rounded-full border-2 shadow-[0_6px_12px_rgba(92,64,36,0.18)]',
                    status === 'available'
                      ? 'border-amber-100 bg-[#f6d27a] text-amber-950 motion-safe:animate-pulse'
                      : status === 'completed'
                        ? 'border-amber-100 bg-emerald-500 text-white'
                        : 'border-amber-200 bg-[#fff4d7] text-slate-700',
                  )}
                >
                  {status === 'completed' ? (
                    <CheckCircle2 className="size-4" />
                  ) : locked ? (
                    <Lock className="size-4" />
                  ) : (
                    <Play className="size-4" />
                  )}
                </div>
                <Image
                  src={nodeArtwork}
                  alt=""
                  width={128}
                  height={128}
                  className={cn(
                    'relative z-10 rounded-full border-2 border-[#fff7df]/80 object-cover shadow-[0_12px_24px_rgba(92,64,36,0.24)] mix-blend-multiply',
                    status === 'available' && 'ring-4 ring-amber-300/55',
                    status === 'completed' && 'ring-4 ring-emerald-300/45',
                    selected && 'ring-4 ring-amber-300/80',
                    locked && 'opacity-80',
                  )}
                  style={{ width: badgeSize, height: badgeSize }}
                  draggable={false}
                />
                <span className="-mt-1.5 max-w-[108px] rounded-[0.75rem_0.95rem_0.78rem_0.9rem] border border-amber-200/85 bg-[#fff4d7]/92 px-2.5 py-1 text-[10px] font-black leading-4 text-slate-800 shadow-[0_6px_12px_rgba(166,124,82,0.15)] dark:border-white/10 dark:bg-slate-950/85 dark:text-slate-100">
                  <span className="block truncate">{getDisplayNodeTitle(position.node)}</span>
                  <span
                    className={cn(
                      'block text-[9px] font-bold leading-3',
                      status === 'available'
                        ? 'text-amber-700'
                        : status === 'completed'
                          ? 'text-emerald-600'
                          : 'text-slate-500 dark:text-slate-400',
                    )}
                  >
                    {getMapStatusLabel(status, position.node)}
                  </span>
                </span>
              </button>
            );
          })}
          {selectedNode && selectedPosition && selectedNodeTheme ? (
            <div
              className="fixed bottom-5 right-5 z-[100] max-h-[min(520px,calc(100vh-2.5rem))] w-[min(380px,calc(100vw-2.5rem))] overflow-y-auto rounded-[1.4rem_1.75rem_1.35rem_1.6rem] border border-amber-200/80 bg-[#fffaf0]/94 p-4 pr-3 text-slate-950 shadow-[0_18px_40px_rgba(166,124,82,0.22)] backdrop-blur-[2px] dark:border-white/10 dark:bg-slate-950/95 dark:text-white dark:shadow-black/30 md:bottom-7 md:right-8"
              onClick={(event) => event.stopPropagation()}
            >
              <span className="pointer-events-none absolute right-12 top-2 h-5 w-20 rotate-3 rounded-sm border border-amber-200/40 bg-[#ffe5ad]/52 shadow-sm" />
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-[1rem_1.25rem_1rem_1.15rem] border-2 shadow-lg',
                    selectedNodeTheme.nodeClass,
                  )}
                >
                  <Image
                    src={selectedNodeArtwork}
                    alt=""
                    width={96}
                    height={96}
                    className="size-full object-cover"
                    draggable={false}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-1.5">
                    {getSourceSignalLabels(selectedNode).map((label) => (
                      <span
                        key={label}
                        className="rounded-[0.7rem_0.85rem_0.75rem_0.8rem] border border-slate-200/50 bg-slate-950 px-2 py-0.5 text-[10px] font-black text-white shadow-sm dark:bg-white dark:text-slate-950"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                  <h2 className="mt-2 text-lg font-black leading-6">
                    {getDisplayNodeTitle(selectedNode)}
                  </h2>
                  <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                    第 {(selectedChallenge?.layerIndex ?? 0) + 1} 层 · {selectedNodeTheme.label}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="关闭关卡详情"
                  onClick={() => setSelectedChallenge(null)}
                  className="flex size-7 shrink-0 items-center justify-center rounded-[0.75rem_0.9rem_0.8rem_0.85rem] border border-amber-200/70 bg-[#fffdf7] text-slate-500 shadow-sm transition-colors hover:bg-amber-50 hover:text-slate-900 dark:border-white/10 dark:bg-white/10 dark:text-slate-300 dark:hover:bg-white/15 dark:hover:text-white"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="mt-4 space-y-3 text-sm leading-6">
                {selectedLocked ? (
                  <div className="rounded-[1rem_1.2rem_1.1rem_1.15rem] border border-amber-300/70 bg-[#fff4cd]/78 p-3 text-xs font-bold leading-5 text-amber-900 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.5)] dark:border-amber-400/20 dark:bg-amber-950/30 dark:text-amber-100">
                    这关还没解锁。先通过前一层任意可走节点，我就把这条路打开给你。
                  </div>
                ) : null}
                <div className="rounded-[1rem_1.25rem_1.05rem_1.2rem] border border-rose-200/70 bg-rose-50/72 p-3 text-rose-950 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.5)] dark:border-rose-400/20 dark:bg-rose-950/30 dark:text-rose-50">
                  <p className="text-xs font-black opacity-60">为什么给你这关</p>
                  <p className="mt-1 text-xs font-semibold leading-5">
                    {getPersonalReason(selectedNode)}
                  </p>
                </div>
                <div className="rounded-[1.1rem_1rem_1.2rem_1.05rem] border border-amber-200/60 bg-[#fffdf7]/72 p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)] dark:border-white/10 dark:bg-white/7">
                  <p className="flex items-center gap-2 text-xs font-black text-slate-500 dark:text-slate-400">
                    <Target className="size-3.5" />
                    通过标准
                  </p>
                  <p className="mt-1 text-xs font-bold leading-5">
                    {getPassCriteria(selectedNode)}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-[1rem_1.2rem_1.05rem_1.15rem] border border-slate-200/70 bg-[#fffdf7]/72 p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)] dark:border-white/10 dark:bg-white/7">
                    <p className="text-xs font-black text-slate-500 dark:text-slate-400">
                      {isQuestionNode(selectedNode) ? '题量' : '节点效果'}
                    </p>
                    <p className="mt-1 text-xs font-bold">
                      {isQuestionNode(selectedNode)
                        ? `${getQuestionCount(selectedNode)} 题`
                        : rewardKindLabel(selectedNode.rewardKind)}
                    </p>
                  </div>
                  <div className="rounded-[1.2rem_1rem_1.15rem_1.05rem] border border-slate-200/70 bg-[#fffdf7]/72 p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)] dark:border-white/10 dark:bg-white/7">
                    <p className="text-xs font-black text-slate-500 dark:text-slate-400">
                      通关奖励
                    </p>
                    <p className="mt-1 text-xs font-bold leading-5">
                      {getRewardSummary(selectedNode)}
                    </p>
                  </div>
                </div>
                <div className="rounded-[1rem_1.15rem_1.05rem_1.25rem] border border-slate-200/70 bg-[#fffdf7]/72 p-3 text-xs leading-5 text-slate-600 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)] dark:border-white/10 dark:bg-white/7 dark:text-slate-300">
                  {selectedNode.questionStyle}
                </div>
              </div>
              <button
                type="button"
                disabled={selectedLocked}
                onClick={() => {
                  if (selectedLocked) return;
                  setActiveChallenge(selectedChallenge);
                  setChallengeResult(null);
                  setSelectedEventOptionIndex(0);
                }}
                className={cn(
                  'mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[1.1rem_1.35rem_1.15rem_1.25rem] border px-5 py-3 text-sm font-black shadow-[0_10px_18px_rgba(148,163,184,0.22)] transition-transform',
                  selectedLocked
                    ? 'cursor-not-allowed border-slate-300/80 bg-[#e9eef6]/85 text-slate-500 dark:border-white/10 dark:bg-white/10 dark:text-slate-500'
                    : 'border-slate-950/80 bg-slate-950 text-white hover:-translate-y-0.5 dark:border-white dark:bg-white dark:text-slate-950',
                )}
              >
                {selectedLocked ? (
                  <Lock className="size-4" />
                ) : isQuestionNode(selectedNode) ? (
                  <Swords className="size-4" />
                ) : (
                  <Trophy className="size-4" />
                )}
                {selectedLocked
                  ? '先完成前置关卡'
                  : isQuestionNode(selectedNode)
                    ? '进入做题'
                    : '进入节点'}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
