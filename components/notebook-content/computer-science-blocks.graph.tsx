'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  BlockKicker,
  BlockTitle,
  EMPTY_GRAPH_STEPS,
  InlineText,
  TraceStepNavigator,
  usePlayableStepIndex,
} from './computer-science-blocks.shared';
import type {
  CsBlockProps,
  GraphLayoutNode,
  GraphTraceBlock,
  GraphTraceEdge,
  GraphTraceNode,
  GraphTraceStep,
  NotebookContentDocument,
} from './computer-science-blocks.shared';

const GRAPH_CANVAS_WIDTH = 760;
const GRAPH_CANVAS_HEIGHT = 330;
const GRAPH_NODE_RADIUS = 24;
const GRAPH_CANVAS_PADDING = 54;

function graphEdgeKey(edge: GraphTraceEdge, index: number) {
  return edge.id || `${edge.from}->${edge.to}#${index}`;
}

function graphPairKey(from: string, to: string) {
  return `${from}->${to}`;
}

function graphPairKeyLoose(from: string, to: string) {
  return `${from}-${to}`;
}

function buildGraphLayout(nodes: readonly GraphTraceNode[]): GraphLayoutNode[] {
  const allExplicit = nodes.every(
    (node) => typeof node.x === 'number' && typeof node.y === 'number',
  );

  if (allExplicit) {
    const xs = nodes.map((node) => node.x ?? 0);
    const ys = nodes.map((node) => node.y ?? 0);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);

    return nodes.map((node) => ({
      ...node,
      x:
        GRAPH_CANVAS_PADDING +
        (((node.x ?? 0) - minX) / spanX) * (GRAPH_CANVAS_WIDTH - GRAPH_CANVAS_PADDING * 2),
      y:
        GRAPH_CANVAS_PADDING +
        (((node.y ?? 0) - minY) / spanY) * (GRAPH_CANVAS_HEIGHT - GRAPH_CANVAS_PADDING * 2),
    }));
  }

  const centerX = GRAPH_CANVAS_WIDTH / 2;
  const centerY = GRAPH_CANVAS_HEIGHT / 2;
  const radiusX = GRAPH_CANVAS_WIDTH / 2 - GRAPH_CANVAS_PADDING;
  const radiusY = GRAPH_CANVAS_HEIGHT / 2 - GRAPH_CANVAS_PADDING;
  return nodes.map((node, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(nodes.length, 1);
    return {
      ...node,
      x: centerX + Math.cos(angle) * radiusX,
      y: centerY + Math.sin(angle) * radiusY,
    };
  });
}

function edgeTouchesCurrentEdge(
  edge: GraphTraceEdge,
  currentEdge: readonly [string, string] | undefined,
  directed: boolean,
) {
  if (!currentEdge) return false;
  const [from, to] = currentEdge;
  if (edge.from === from && edge.to === to) return true;
  return !directed && edge.from === to && edge.to === from;
}

function graphStepGroups(
  steps: readonly GraphTraceStep[],
  language: NotebookContentDocument['language'],
) {
  return steps.map((step, index) => {
    if (step.title) return step.title;
    return language === 'en-US' ? `Step ${index + 1}` : `第 ${index + 1} 步`;
  });
}

function graphAlgorithmLabel(
  algorithm: GraphTraceBlock['algorithm'],
  language: NotebookContentDocument['language'],
) {
  if (language === 'en-US') {
    if (algorithm === 'dfs_stack') return 'DFS with stack';
    if (algorithm === 'dfs_recursive') return 'Recursive DFS';
    return 'BFS';
  }
  if (algorithm === 'dfs_stack') return 'DFS：stack';
  if (algorithm === 'dfs_recursive') return '递归 DFS';
  return 'BFS：queue';
}

function graphFrontierKind(
  algorithm: GraphTraceBlock['algorithm'],
): 'queue' | 'stack' | 'call_stack' {
  if (algorithm === 'dfs_recursive') return 'call_stack';
  if (algorithm === 'dfs_stack') return 'stack';
  return 'queue';
}

function graphFrontierLabel(
  algorithm: GraphTraceBlock['algorithm'],
  language: NotebookContentDocument['language'],
) {
  const kind = graphFrontierKind(algorithm);
  if (language === 'en-US') {
    if (kind === 'queue') return 'Queue';
    if (kind === 'call_stack') return 'Call stack';
    return 'Stack';
  }
  if (kind === 'queue') return 'Queue 队列';
  if (kind === 'call_stack') return 'Call Stack 调用栈';
  return 'Stack 栈';
}

function graphActionLabel(
  action: GraphTraceStep['action'],
  algorithm: GraphTraceBlock['algorithm'],
  language: NotebookContentDocument['language'],
) {
  if (language === 'en-US') {
    if (action === 'enqueue') return 'enqueue';
    if (action === 'dequeue') return 'dequeue';
    if (action === 'push') return 'push';
    if (action === 'pop') return 'pop';
    if (action === 'visit') return 'visit';
    if (action === 'check_edge') return 'check edge';
    if (action === 'skip') return 'skip';
    if (action === 'done') return 'done';
    return graphAlgorithmLabel(algorithm, language);
  }
  if (action === 'enqueue') return '入队';
  if (action === 'dequeue') return '出队';
  if (action === 'push') return '压栈';
  if (action === 'pop') return '弹栈';
  if (action === 'visit') return '访问';
  if (action === 'check_edge') return '检查边';
  if (action === 'skip') return '跳过';
  if (action === 'done') return '完成';
  return graphAlgorithmLabel(algorithm, language);
}

function buildAdjacencyRows(block: GraphTraceBlock) {
  const rows = new Map(block.nodes.map((node) => [node.id, [] as string[]]));
  block.edges.forEach((edge) => {
    rows.get(edge.from)?.push(edge.to);
    if (!(edge.directed ?? block.directed)) {
      rows.get(edge.to)?.push(edge.from);
    }
  });
  return block.nodes.map((node) => ({
    id: node.id,
    label: node.label,
    neighbors: rows.get(node.id) || [],
  }));
}

function GraphCanvas({ block, step }: { block: GraphTraceBlock; step?: GraphTraceStep }) {
  const layoutNodes = useMemo(() => buildGraphLayout(block.nodes), [block.nodes]);
  const nodeMap = useMemo(() => new Map(layoutNodes.map((node) => [node.id, node])), [layoutNodes]);
  const frontier = new Set(step?.frontier || []);
  const visited = new Set(step?.visited || []);
  const activeEdges = new Set(step?.activeEdges || []);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-950/30">
      <svg
        className="h-[285px] w-full overflow-visible"
        viewBox={`0 0 ${GRAPH_CANVAS_WIDTH} ${GRAPH_CANVAS_HEIGHT}`}
        role="img"
        aria-label={block.title || graphAlgorithmLabel(block.algorithm, 'zh-CN')}
      >
        <defs>
          <marker
            id="graph-arrow"
            markerHeight="8"
            markerWidth="8"
            orient="auto"
            refX="7"
            refY="4"
            viewBox="0 0 8 8"
          >
            <path d="M 0 0 L 8 4 L 0 8 z" fill="#64748b" />
          </marker>
          <marker
            id="graph-arrow-active"
            markerHeight="8"
            markerWidth="8"
            orient="auto"
            refX="7"
            refY="4"
            viewBox="0 0 8 8"
          >
            <path d="M 0 0 L 8 4 L 0 8 z" fill="#0891b2" />
          </marker>
        </defs>
        {block.edges.map((edge, index) => {
          const from = nodeMap.get(edge.from);
          const to = nodeMap.get(edge.to);
          if (!from || !to) return null;
          const directed = edge.directed ?? block.directed;
          const edgeId = graphEdgeKey(edge, index);
          const isCurrent = edgeTouchesCurrentEdge(edge, step?.currentEdge, directed);
          const isActive =
            edge.active ||
            isCurrent ||
            activeEdges.has(edgeId) ||
            activeEdges.has(graphPairKey(edge.from, edge.to)) ||
            activeEdges.has(graphPairKeyLoose(edge.from, edge.to));
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const length = Math.max(1, Math.hypot(dx, dy));
          const startX = from.x + (dx / length) * (GRAPH_NODE_RADIUS + 2);
          const startY = from.y + (dy / length) * (GRAPH_NODE_RADIUS + 2);
          const endX = to.x - (dx / length) * (GRAPH_NODE_RADIUS + 7);
          const endY = to.y - (dy / length) * (GRAPH_NODE_RADIUS + 7);
          const labelX = (startX + endX) / 2;
          const labelY = (startY + endY) / 2;

          return (
            <g key={edgeId}>
              <line
                x1={startX}
                x2={endX}
                y1={startY}
                y2={endY}
                stroke={isActive ? '#0891b2' : '#94a3b8'}
                strokeLinecap="round"
                strokeWidth={isActive ? 5 : 3}
                opacity={edge.muted ? 0.35 : 0.9}
                markerEnd={
                  directed ? `url(#${isActive ? 'graph-arrow-active' : 'graph-arrow'})` : undefined
                }
              />
              {edge.label ? (
                <g transform={`translate(${labelX} ${labelY})`}>
                  <rect
                    x="-16"
                    y="-11"
                    width="32"
                    height="22"
                    rx="11"
                    fill={isActive ? '#ecfeff' : '#f8fafc'}
                    stroke={isActive ? '#22d3ee' : '#cbd5e1'}
                  />
                  <text
                    dominantBaseline="middle"
                    fill={isActive ? '#0e7490' : '#64748b'}
                    fontSize="11"
                    fontWeight="700"
                    textAnchor="middle"
                  >
                    {edge.label}
                  </text>
                </g>
              ) : null}
            </g>
          );
        })}
        {layoutNodes.map((node) => {
          const isCurrent = step?.current === node.id;
          const isFrontier = frontier.has(node.id);
          const isVisited = visited.has(node.id);
          const fill = isCurrent
            ? '#fef3c7'
            : isFrontier
              ? '#cffafe'
              : isVisited
                ? '#dcfce7'
                : '#ffffff';
          const stroke = isCurrent
            ? '#f59e0b'
            : isFrontier
              ? '#06b6d4'
              : isVisited
                ? '#22c55e'
                : '#94a3b8';

          return (
            <g key={node.id} opacity={node.muted ? 0.42 : 1}>
              <circle
                cx={node.x}
                cy={node.y}
                fill={fill}
                r={GRAPH_NODE_RADIUS}
                stroke={stroke}
                strokeWidth={isCurrent ? 4 : isFrontier || isVisited ? 3 : 2.5}
              />
              <text
                dominantBaseline="middle"
                fill="#0f172a"
                fontSize="18"
                fontWeight="800"
                textAnchor="middle"
                x={node.x}
                y={node.y}
              >
                {node.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] font-semibold text-muted-foreground">
        <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-800">
          current
        </span>
        <span className="rounded-full border border-cyan-300 bg-cyan-50 px-2 py-0.5 text-cyan-800">
          frontier
        </span>
        <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-emerald-800">
          visited
        </span>
      </div>
    </div>
  );
}

function GraphChipRow({
  title,
  values,
  nodeLabels,
  emptyLabel,
  accent = 'slate',
}: {
  title: string;
  values: readonly string[];
  nodeLabels: Map<string, string>;
  emptyLabel: string;
  accent?: 'slate' | 'cyan' | 'emerald' | 'amber' | 'violet';
}) {
  const accentClasses = {
    slate:
      'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-200',
    cyan: 'border-cyan-200 bg-cyan-50 text-cyan-900 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-100',
    emerald:
      'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100',
    amber:
      'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100',
    violet:
      'border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-100',
  } as const;

  return (
    <div className="rounded-lg border border-border/70 bg-background/80 p-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {title}
      </p>
      <div className="mt-1.5 flex min-h-8 flex-wrap items-center gap-1.5">
        {values.length ? (
          values.map((value, index) => (
            <span
              key={`${title}-${value}-${index}`}
              className={cn(
                'inline-flex items-center rounded-md border px-2 py-1 font-mono text-xs font-semibold',
                accentClasses[accent],
              )}
            >
              {nodeLabels.get(value) || value}
            </span>
          ))
        ) : (
          <span className="text-xs text-muted-foreground">{emptyLabel}</span>
        )}
      </div>
    </div>
  );
}

export function GraphTraceBlock({
  block,
  language,
  renderInlineMathHtml,
  activeStepIndex,
}: CsBlockProps<GraphTraceBlock>) {
  const steps = block.steps ?? EMPTY_GRAPH_STEPS;
  const totalSteps = steps.length;
  const { safeStepIndex, setInternalStepIndex } = usePlayableStepIndex(activeStepIndex, totalSteps);
  const currentStep = totalSteps > 0 ? steps[safeStepIndex] : undefined;
  const canGoBack = safeStepIndex > 0;
  const canGoForward = safeStepIndex < totalSteps - 1;
  const groups = useMemo(() => graphStepGroups(steps, language), [language, steps]);
  const nodeLabels = useMemo(
    () => new Map(block.nodes.map((node) => [node.id, node.label])),
    [block.nodes],
  );
  const adjacencyRows = useMemo(() => buildAdjacencyRows(block), [block]);
  const frontierKind = graphFrontierKind(block.algorithm);
  const currentLabel = currentStep?.current
    ? nodeLabels.get(currentStep.current) || currentStep.current
    : block.startId
      ? nodeLabels.get(block.startId) || block.startId
      : '—';

  return (
    <div className="space-y-2 rounded-lg border border-sky-200/80 bg-sky-50/35 p-2 dark:border-sky-900/60 dark:bg-sky-950/10">
      <div className="flex flex-wrap items-center gap-2">
        <BlockKicker>graph trace</BlockKicker>
        <BlockTitle
          title={block.title}
          fallback={graphAlgorithmLabel(block.algorithm, language)}
          renderInlineMathHtml={renderInlineMathHtml}
        />
        <TraceStepNavigator
          current={safeStepIndex}
          total={totalSteps}
          groups={groups}
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
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.75fr)]">
        <GraphCanvas block={block} step={currentStep} />
        <div className="grid gap-2">
          <div className="rounded-lg border border-sky-200 bg-background/85 p-2 dark:border-sky-900/60 dark:bg-background/60">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-sky-700 dark:text-sky-200">
              {language === 'en-US' ? 'Current action' : '当前动作'}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="rounded-md bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-900 dark:bg-sky-950 dark:text-sky-100">
                {graphActionLabel(currentStep?.action, block.algorithm, language)}
              </span>
              <span className="font-mono text-xs font-semibold text-foreground">
                {currentLabel}
              </span>
            </div>
            {currentStep?.explanation ? (
              <p className="mt-2 text-xs leading-5 text-foreground">
                <InlineText
                  text={currentStep.explanation}
                  renderInlineMathHtml={renderInlineMathHtml}
                />
              </p>
            ) : null}
            {currentStep?.result ? (
              <p className="mt-1 rounded-md border border-sky-100 bg-sky-50 px-2 py-1 text-xs leading-5 text-sky-950 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
                <InlineText text={currentStep.result} renderInlineMathHtml={renderInlineMathHtml} />
              </p>
            ) : null}
          </div>
          <GraphChipRow
            title={graphFrontierLabel(block.algorithm, language)}
            values={currentStep?.frontier || []}
            nodeLabels={nodeLabels}
            emptyLabel={frontierKind === 'queue' ? 'empty queue' : 'empty stack'}
            accent={frontierKind === 'queue' ? 'cyan' : 'violet'}
          />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <GraphChipRow
              title={language === 'en-US' ? 'Visited' : 'Visited 已见过'}
              values={currentStep?.visited || []}
              nodeLabels={nodeLabels}
              emptyLabel="{}"
              accent="emerald"
            />
            <GraphChipRow
              title={language === 'en-US' ? 'Order' : '访问顺序'}
              values={currentStep?.order || []}
              nodeLabels={nodeLabels}
              emptyLabel="—"
              accent="amber"
            />
          </div>
        </div>
      </div>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.75fr)]">
        <div className="rounded-lg border border-border/70 bg-background/80 p-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            adjacency list
          </p>
          <div className="mt-1 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {adjacencyRows.map((row) => (
              <div
                key={row.id}
                className="flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/20 px-2 py-1 text-xs"
              >
                <span className="font-mono font-semibold text-foreground">{row.label}</span>
                <span className="text-muted-foreground">:</span>
                <span className="font-mono text-muted-foreground">
                  {row.neighbors.map((id) => nodeLabels.get(id) || id).join(', ') || '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-border/70 bg-background/80 p-2 text-xs leading-5 text-muted-foreground">
          <p className="font-semibold text-foreground">{language === 'en-US' ? 'Rule' : '规则'}</p>
          <p className="mt-1">
            {frontierKind === 'queue'
              ? language === 'en-US'
                ? 'BFS dequeues from the front, then enqueues unseen neighbors.'
                : 'BFS 从队首取出节点，再把未访问邻居加入队尾。'
              : language === 'en-US'
                ? 'DFS follows the newest pending node first.'
                : 'DFS 优先处理最新加入的待访问节点。'}
          </p>
        </div>
      </div>
      {block.invariant ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs leading-5 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-100">
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
