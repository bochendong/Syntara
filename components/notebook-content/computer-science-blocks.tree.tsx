'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  BlockKicker,
  BlockTitle,
  EMPTY_TREE_STEPS,
  InlineText,
  TREE_CANVAS_PADDING_X,
  TREE_CANVAS_PADDING_Y,
  TREE_LEVEL_GAP,
  TREE_NODE_HEIGHT,
  TREE_SIBLING_GAP,
  TraceStepNavigator,
  usePlayableStepIndex,
} from './computer-science-blocks.shared';
import type {
  CsBlockProps,
  NotebookContentDocument,
  TreeDiagramBlock,
  TreeDiagramNode,
  TreeLayoutEdge,
  TreeLayoutNode,
} from './computer-science-blocks.shared';

function getTreeStepGroups(
  steps: readonly TreeDiagramBlock['steps'][number][],
  language: NotebookContentDocument['language'],
) {
  return steps.map((step, index) => {
    if (step.title) return step.title;
    return language === 'en-US' ? `Step ${index + 1}` : `第 ${index + 1} 步`;
  });
}

function getDirectionLabel(
  direction: TreeDiagramBlock['steps'][number]['direction'],
  language: NotebookContentDocument['language'],
) {
  if (language === 'en-US') {
    if (direction === 'left') return 'go left';
    if (direction === 'right') return 'go right';
    if (direction === 'visit') return 'visit';
    if (direction === 'backtrack') return 'backtrack';
    if (direction === 'aggregate') return 'aggregate';
    if (direction === 'found') return 'found';
    if (direction === 'missing') return 'missing';
    if (direction === 'done') return 'done';
    return 'step';
  }
  if (direction === 'left') return '去左子树';
  if (direction === 'right') return '去右子树';
  if (direction === 'visit') return '访问节点';
  if (direction === 'backtrack') return '回到父节点';
  if (direction === 'aggregate') return '汇总结果';
  if (direction === 'found') return '命中';
  if (direction === 'missing') return '未找到';
  if (direction === 'done') return '完成';
  return '步骤';
}

function getTreeNodeChildren(node: TreeDiagramNode): string[] {
  const children = node.children || [];
  if (children.length) return children;
  return [node.left, node.right].filter((child): child is string => Boolean(child));
}

function getTreeNodeChildSlots(
  node: TreeDiagramNode,
  isBst: boolean,
  language: NotebookContentDocument['language'],
): Array<{ id: string; label: string }> {
  const children = node.children || [];
  if (children.length) {
    return children.map((id, index) => ({
      id,
      label: children.length === 1 ? (language === 'en-US' ? 'child' : '子') : `#${index + 1}`,
    }));
  }
  return [
    node.left
      ? { id: node.left, label: isBst ? 'L' : language === 'en-US' ? 'child 1' : '子节点 1' }
      : null,
    node.right
      ? { id: node.right, label: isBst ? 'R' : language === 'en-US' ? 'child 2' : '子节点 2' }
      : null,
  ].filter((child): child is { id: string; label: string } => Boolean(child));
}

function getTreeNodeWidth(label: string) {
  return Math.max(72, Math.min(128, label.length * 9 + 34));
}

function treeNodeToneClass({
  isBst,
  isCurrent,
  isPath,
  isActive,
  muted,
}: {
  isBst: boolean;
  isCurrent: boolean;
  isPath: boolean;
  isActive: boolean;
  muted?: boolean;
}) {
  if (isCurrent) {
    return 'border-amber-500 bg-amber-100 text-amber-950 shadow-[0_0_0_4px_rgba(245,158,11,0.16)] dark:bg-amber-950/40 dark:text-amber-50';
  }
  if (isPath || isActive) {
    return isBst
      ? 'border-amber-300 bg-amber-50 text-amber-950 shadow-[0_0_0_3px_rgba(245,158,11,0.10)] dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-50'
      : 'border-cyan-300 bg-cyan-50 text-cyan-950 shadow-[0_0_0_3px_rgba(6,182,212,0.10)] dark:border-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-50';
  }
  if (muted) return 'border-border/50 bg-muted/30 text-muted-foreground';
  return 'border-slate-300 bg-white text-slate-950 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50';
}

function treeEdgeColor(active: boolean, isBst: boolean) {
  if (active) return isBst ? '#d97706' : '#0891b2';
  return '#94a3b8';
}

function treeLabelToneClass(active: boolean, isBst: boolean) {
  if (active) {
    return isBst
      ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100'
      : 'border-cyan-300 bg-cyan-50 text-cyan-900 dark:border-cyan-700 dark:bg-cyan-950 dark:text-cyan-100';
  }
  return 'border-slate-300 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200';
}

function buildTreeLayout({
  nodes,
  rootId,
  path,
  isBst,
  language,
}: {
  nodes: readonly TreeDiagramNode[];
  rootId: string | undefined;
  path: Set<string>;
  isBst: boolean;
  language: NotebookContentDocument['language'];
}) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  const layoutNode = (
    nodeId: string | undefined,
    depth: number,
    visited = new Set<string>(),
  ): {
    width: number;
    rootX: number;
    nodes: TreeLayoutNode[];
    edges: TreeLayoutEdge[];
  } => {
    const node = nodeId ? nodeMap.get(nodeId) : undefined;
    if (!node || !nodeId || visited.has(nodeId)) {
      return { width: 80, rootX: 40, nodes: [], edges: [] };
    }

    const nextVisited = new Set(visited);
    nextVisited.add(nodeId);
    const nodeWidth = getTreeNodeWidth(node.label);
    const childSlots = getTreeNodeChildSlots(node, isBst, language);
    const childLayouts = childSlots.map((child) => ({
      slot: child,
      layout: layoutNode(child.id, depth + 1, nextVisited),
    }));
    const childGap = childSlots.length > 2 ? TREE_SIBLING_GAP - 8 : TREE_SIBLING_GAP + 10;
    const childrenWidth = childLayouts.length
      ? childLayouts.reduce((sum, child) => sum + child.layout.width, 0) +
        childGap * Math.max(0, childLayouts.length - 1)
      : 0;
    const width = Math.max(nodeWidth, childrenWidth);
    const rootX = width / 2;
    const y = depth * (TREE_NODE_HEIGHT + TREE_LEVEL_GAP) + TREE_NODE_HEIGHT / 2;
    const positionedNodes: TreeLayoutNode[] = [
      { id: node.id, node, x: rootX, y, width: nodeWidth },
    ];
    const edges: TreeLayoutEdge[] = [];

    let childOffset = (width - childrenWidth) / 2;
    for (const child of childLayouts) {
      const childRootX = childOffset + child.layout.rootX;
      const childRootY = (depth + 1) * (TREE_NODE_HEIGHT + TREE_LEVEL_GAP) + TREE_NODE_HEIGHT / 2;
      const active = path.has(node.id) && path.has(child.slot.id);
      edges.push({
        id: `${node.id}-${child.slot.id}`,
        fromX: rootX,
        fromY: y + TREE_NODE_HEIGHT / 2,
        toX: childRootX,
        toY: childRootY - TREE_NODE_HEIGHT / 2,
        label: child.slot.label,
        active,
      });
      positionedNodes.push(
        ...child.layout.nodes.map((childNode) => ({
          ...childNode,
          x: childNode.x + childOffset,
        })),
      );
      edges.push(
        ...child.layout.edges.map((edge) => ({
          ...edge,
          fromX: edge.fromX + childOffset,
          toX: edge.toX + childOffset,
        })),
      );
      childOffset += child.layout.width + childGap;
    }

    return { width, rootX, nodes: positionedNodes, edges };
  };

  const layout = layoutNode(rootId, 0);
  const positionedNodes = layout.nodes.map((node) => ({
    ...node,
    x: node.x + TREE_CANVAS_PADDING_X,
    y: node.y + TREE_CANVAS_PADDING_Y,
  }));
  const edges = layout.edges.map((edge) => ({
    ...edge,
    fromX: edge.fromX + TREE_CANVAS_PADDING_X,
    toX: edge.toX + TREE_CANVAS_PADDING_X,
    fromY: edge.fromY + TREE_CANVAS_PADDING_Y,
    toY: edge.toY + TREE_CANVAS_PADDING_Y,
  }));
  const maxY = positionedNodes.reduce((max, node) => Math.max(max, node.y), 0);

  return {
    nodes: positionedNodes,
    edges,
    width: Math.max(320, layout.width + TREE_CANVAS_PADDING_X * 2),
    height: Math.max(190, maxY + TREE_NODE_HEIGHT / 2 + TREE_CANVAS_PADDING_Y),
  };
}

function TreeCanvas({
  nodes,
  rootId,
  path,
  currentId,
  isBst,
  honorNodeActive = true,
  language,
  renderInlineMathHtml,
}: {
  nodes: readonly TreeDiagramNode[];
  rootId: string | undefined;
  path: Set<string>;
  currentId?: string;
  isBst: boolean;
  honorNodeActive?: boolean;
  language: NotebookContentDocument['language'];
  renderInlineMathHtml: (text: string) => string;
}) {
  const layout = useMemo(
    () => buildTreeLayout({ nodes, rootId, path, isBst, language }),
    [isBst, language, nodes, path, rootId],
  );
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const updateWidth = () => {
      setViewportWidth(element.clientWidth);
    };

    updateWidth();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const availableWidth = Math.max(0, viewportWidth - 4);
  const scale = availableWidth > 0 ? Math.min(1, availableWidth / layout.width) : 1;
  const scaledWidth = layout.width * scale;
  const scaledHeight = layout.height * scale;

  return (
    <div ref={viewportRef} className="w-full overflow-hidden">
      <div
        className="relative mx-auto"
        style={{ width: scaledWidth || layout.width, height: scaledHeight || layout.height }}
      >
        <div
          className="absolute left-0 top-0"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          <svg
            className="absolute inset-0 overflow-visible"
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            aria-hidden="true"
          >
            {layout.edges.map((edge) => {
              const midY = (edge.fromY + edge.toY) / 2;
              return (
                <path
                  key={edge.id}
                  d={`M ${edge.fromX} ${edge.fromY} C ${edge.fromX} ${midY}, ${edge.toX} ${midY}, ${edge.toX} ${edge.toY}`}
                  fill="none"
                  stroke={treeEdgeColor(edge.active, isBst)}
                  strokeLinecap="round"
                  strokeWidth={edge.active ? 4 : 2.5}
                  opacity={edge.active ? 1 : 0.88}
                />
              );
            })}
          </svg>
          {layout.edges.map((edge) => {
            const labelX = (edge.fromX + edge.toX) / 2;
            const labelY = (edge.fromY + edge.toY) / 2;
            return (
              <span
                key={`${edge.id}-label`}
                className={cn(
                  'absolute z-10 flex h-6 min-w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border px-1.5 font-mono text-[10px] font-semibold shadow-sm',
                  treeLabelToneClass(edge.active, isBst),
                )}
                style={{ left: labelX, top: labelY }}
              >
                {edge.label}
              </span>
            );
          })}
          {layout.nodes.map((layoutNode) => {
            const isCurrent = currentId === layoutNode.id;
            const isPath = path.has(layoutNode.id);
            return (
              <div
                key={layoutNode.id}
                className="absolute z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                style={{ left: layoutNode.x, top: layoutNode.y, width: layoutNode.width }}
              >
                <div
                  className={cn(
                    'flex h-10 w-full items-center justify-center rounded-lg border-2 px-3 text-center font-mono text-sm font-semibold transition-colors',
                    treeNodeToneClass({
                      isBst,
                      isCurrent,
                      isPath,
                      isActive: honorNodeActive && Boolean(layoutNode.node.active),
                      muted: layoutNode.node.muted,
                    }),
                  )}
                >
                  <InlineText
                    text={layoutNode.node.label}
                    renderInlineMathHtml={renderInlineMathHtml}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function TreeDiagramBlock({
  block,
  language,
  renderInlineMathHtml,
  activeStepIndex,
}: CsBlockProps<TreeDiagramBlock>) {
  const isBst = block.kind === 'bst';
  const childIds = new Set(block.nodes.flatMap(getTreeNodeChildren));
  const rootId =
    block.rootId || block.nodes.find((node) => !childIds.has(node.id))?.id || block.nodes[0]?.id;
  const treeSteps = block.steps ?? EMPTY_TREE_STEPS;
  const totalSteps = treeSteps.length;
  const { safeStepIndex, setInternalStepIndex } = usePlayableStepIndex(activeStepIndex, totalSteps);
  const currentStep = totalSteps > 0 ? treeSteps[safeStepIndex] : undefined;
  const activePath = new Set(currentStep?.path.length ? currentStep.path : block.path);
  const currentId = currentStep?.current || (totalSteps ? undefined : undefined);
  const stepGroups = useMemo(() => getTreeStepGroups(treeSteps, language), [treeSteps, language]);
  const nodeLabelById = useMemo(
    () => new Map(block.nodes.map((node) => [node.id, node.label])),
    [block.nodes],
  );
  const formatTreePath = (path: readonly string[]) =>
    path.map((nodeId) => nodeLabelById.get(nodeId) || nodeId).join(' → ');

  if (currentStep) {
    const canGoBack = safeStepIndex > 0;
    const canGoForward = safeStepIndex < totalSteps - 1;
    const accentClasses = isBst
      ? {
          shell: 'border-amber-200/80 bg-amber-50/35 dark:border-amber-900/60 dark:bg-amber-950/10',
          panel: 'border-amber-200 bg-background/85 dark:border-amber-900/60 dark:bg-background/60',
          label: 'text-amber-700 dark:text-amber-200',
        }
      : {
          shell: 'border-cyan-200/80 bg-cyan-50/35 dark:border-cyan-900/60 dark:bg-cyan-950/10',
          panel: 'border-cyan-200 bg-background/85 dark:border-cyan-900/60 dark:bg-background/60',
          label: 'text-cyan-700 dark:text-cyan-200',
        };

    return (
      <div className={cn('space-y-2 rounded-lg border p-2', accentClasses.shell)}>
        <div className="flex flex-wrap items-center gap-2">
          <BlockKicker>{isBst ? 'bst trace' : 'tree trace'}</BlockKicker>
          <BlockTitle
            title={block.title}
            fallback={
              isBst
                ? language === 'en-US'
                  ? 'BST Search Trace'
                  : 'BST 搜索追踪'
                : language === 'en-US'
                  ? 'Tree Traversal Trace'
                  : '树遍历追踪'
            }
            renderInlineMathHtml={renderInlineMathHtml}
          />
          <TraceStepNavigator
            current={safeStepIndex}
            total={totalSteps}
            groups={stepGroups}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            language={language}
            compact
            onPrevious={() => setInternalStepIndex((index) => Math.max(0, index - 1))}
            onNext={() =>
              setInternalStepIndex((index) => Math.min(Math.max(totalSteps - 1, 0), index + 1))
            }
            onReset={() => setInternalStepIndex(0)}
          />
        </div>
        <div className="grid gap-1.5 lg:grid-cols-[minmax(0,0.75fr)_minmax(260px,1.25fr)]">
          <div className={cn('rounded-lg border p-2', accentClasses.panel)}>
            <p
              className={cn(
                'text-[10px] font-semibold uppercase tracking-[0.1em]',
                accentClasses.label,
              )}
            >
              {isBst
                ? language === 'en-US'
                  ? 'Current comparison'
                  : '当前比较'
                : language === 'en-US'
                  ? 'Current action'
                  : '当前动作'}
            </p>
            <p className="mt-0.5 text-xs font-semibold leading-5 text-foreground">
              <InlineText
                text={currentStep.title || getDirectionLabel(currentStep.direction, language)}
                renderInlineMathHtml={renderInlineMathHtml}
              />
            </p>
            {currentStep.comparison ? (
              <pre className="mt-1 whitespace-pre-wrap rounded-md border border-slate-800 bg-slate-950 px-2 py-1 font-mono text-xs leading-5 text-slate-100">
                {currentStep.comparison}
              </pre>
            ) : null}
          </div>
          <div
            className={cn(
              'rounded-lg border p-2 text-xs leading-5 text-foreground',
              accentClasses.panel,
            )}
          >
            <div className="grid gap-1.5 sm:grid-cols-3">
              <div>
                <p
                  className={cn(
                    'text-[10px] font-semibold uppercase tracking-[0.1em]',
                    accentClasses.label,
                  )}
                >
                  {isBst
                    ? language === 'en-US'
                      ? 'Target'
                      : '目标'
                    : language === 'en-US'
                      ? 'Current'
                      : '当前节点'}
                </p>
                <p className="mt-0.5 font-mono font-semibold">
                  {isBst
                    ? block.target || '—'
                    : nodeLabelById.get(currentStep.current || '') || '—'}
                </p>
              </div>
              <div>
                <p
                  className={cn(
                    'text-[10px] font-semibold uppercase tracking-[0.1em]',
                    accentClasses.label,
                  )}
                >
                  {language === 'en-US' ? 'Path' : '路径'}
                </p>
                <p className="mt-0.5 font-mono font-semibold">
                  {formatTreePath(currentStep.path.length ? currentStep.path : block.path) || '—'}
                </p>
              </div>
              <div>
                <p
                  className={cn(
                    'text-[10px] font-semibold uppercase tracking-[0.1em]',
                    accentClasses.label,
                  )}
                >
                  {isBst
                    ? language === 'en-US'
                      ? 'Next'
                      : '下一步'
                    : language === 'en-US'
                      ? 'State'
                      : '状态'}
                </p>
                <p className="mt-0.5 font-semibold">
                  {getDirectionLabel(currentStep.direction, language)}
                </p>
              </div>
            </div>
            {currentStep.result ? (
              <p className="mt-1">
                <InlineText text={currentStep.result} renderInlineMathHtml={renderInlineMathHtml} />
              </p>
            ) : null}
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-border/60 bg-background/80 p-2.5">
          <TreeCanvas
            nodes={block.nodes}
            rootId={rootId}
            path={activePath}
            currentId={currentId}
            isBst={isBst}
            honorNodeActive={false}
            language={language}
            renderInlineMathHtml={renderInlineMathHtml}
          />
        </div>
        {block.invariant ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs leading-5 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-100">
            <InlineText text={block.invariant} renderInlineMathHtml={renderInlineMathHtml} />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'space-y-3 rounded-lg border p-4',
        isBst
          ? 'border-amber-200/80 bg-amber-50/35 dark:border-amber-900/60 dark:bg-amber-950/10'
          : 'border-border/70 bg-muted/20',
      )}
    >
      <div className="space-y-1">
        <BlockKicker>{isBst ? 'bst' : 'tree'}</BlockKicker>
        <BlockTitle
          title={block.title}
          fallback={
            isBst
              ? language === 'en-US'
                ? 'Binary Search Tree'
                : '二叉搜索树'
              : language === 'en-US'
                ? 'Tree Diagram'
                : '树结构图'
          }
          renderInlineMathHtml={renderInlineMathHtml}
        />
      </div>
      {isBst && (block.target || block.decision || block.path.length > 0) ? (
        <div className="grid gap-2 rounded-lg border border-amber-200/70 bg-background/80 p-3 text-xs text-muted-foreground md:grid-cols-3 dark:border-amber-900/50">
          <div>
            <span className="font-semibold text-foreground">
              {language === 'en-US' ? 'Target' : '目标'}
            </span>
            <p className="mt-1 font-mono">
              <InlineText
                text={block.target || (language === 'en-US' ? 'not set' : '未设置')}
                renderInlineMathHtml={renderInlineMathHtml}
              />
            </p>
          </div>
          <div>
            <span className="font-semibold text-foreground">
              {language === 'en-US' ? 'Search path' : '搜索路径'}
            </span>
            <p className="mt-1 font-mono">{block.path.length ? formatTreePath(block.path) : '—'}</p>
          </div>
          <div>
            <span className="font-semibold text-foreground">
              {language === 'en-US' ? 'Decision' : '下一步判断'}
            </span>
            <p className="mt-1">
              <InlineText
                text={
                  block.decision ||
                  (language === 'en-US'
                    ? 'Compare then choose left/right.'
                    : '比较后选择左/右子树。')
                }
                renderInlineMathHtml={renderInlineMathHtml}
              />
            </p>
          </div>
        </div>
      ) : null}
      <div className="overflow-hidden rounded-lg border border-border/60 bg-background/80 p-4">
        <TreeCanvas
          nodes={block.nodes}
          rootId={rootId}
          path={activePath}
          isBst={isBst}
          honorNodeActive
          language={language}
          renderInlineMathHtml={renderInlineMathHtml}
        />
      </div>
      {block.invariant ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-100">
          <InlineText text={block.invariant} renderInlineMathHtml={renderInlineMathHtml} />
        </div>
      ) : null}
      {block.caption ? (
        <p className="text-xs text-muted-foreground">
          <InlineText text={block.caption} renderInlineMathHtml={renderInlineMathHtml} />
        </p>
      ) : null}
    </div>
  );
}
