'use client';

import { Fragment, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  BlockKicker,
  BlockTitle,
  EMPTY_POINTER_STEPS,
  InlineText,
  KeyValueChips,
  TraceStepNavigator,
  usePlayableStepIndex,
} from './computer-science-blocks.shared';
import type {
  CsBlockProps,
  NotebookContentDocument,
  PointerDiagramBlock,
  PointerDiagramLink,
  PointerDiagramNode,
  PointerDiagramPointer,
} from './computer-science-blocks.shared';

function buildPointerLinks(
  nodes: readonly PointerDiagramNode[],
  links: readonly PointerDiagramLink[],
  isDoublyLinkedList = false,
  nullLabel = 'None',
): PointerDiagramLink[] {
  if (links.length) return [...links];
  if (isDoublyLinkedList) {
    return nodes.flatMap((node) => {
      const generatedLinks: PointerDiagramLink[] = [];
      const nextValue = node.fields.find((field) => field.name === 'next')?.value;
      const prevValue = node.fields.find((field) => field.name === 'prev')?.value;
      if (nextValue && nextValue !== nullLabel) {
        generatedLinks.push({ from: node.id, to: nextValue, label: 'next', active: false });
      }
      if (prevValue && prevValue !== nullLabel) {
        generatedLinks.push({ from: node.id, to: prevValue, label: 'prev', active: false });
      }
      return generatedLinks;
    });
  }

  return nodes.slice(0, -1).map((node, index) => ({
    from: node.id,
    to: nodes[index + 1].id,
    label: undefined,
    active: false,
  }));
}

function normalizedPointerLinkLabel(link: PointerDiagramLink) {
  return (link.label || 'next').toLowerCase();
}

function getPointerLink(
  links: readonly PointerDiagramLink[],
  from: string,
  label: 'next' | 'prev',
) {
  return links.find((link) => link.from === from && normalizedPointerLinkLabel(link) === label);
}

function hasDoublyLinkedListShape(
  nodes: readonly PointerDiagramNode[],
  links: readonly PointerDiagramLink[],
) {
  return (
    nodes.some((node) => node.fields.some((field) => field.name === 'prev')) ||
    links.some((link) => normalizedPointerLinkLabel(link) === 'prev')
  );
}

function chunkPointerRows(nodes: readonly PointerDiagramNode[], rowSize: number) {
  if (rowSize <= 0) return [nodes];
  const rows: PointerDiagramNode[][] = [];
  for (let index = 0; index < nodes.length; index += rowSize) {
    rows.push([...nodes.slice(index, index + rowSize)]);
  }
  return rows;
}

function getPointerStepGroups(
  steps: readonly PointerDiagramBlock['steps'][number][],
  language: NotebookContentDocument['language'],
) {
  return steps.map((step, index) => {
    if (step.title) return step.title;
    return language === 'en-US' ? `Step ${index + 1}` : `第 ${index + 1} 步`;
  });
}

function PointerConnector({
  node,
  nextNode,
  outgoing,
  backLink,
  isLinkedList,
  isDoublyLinkedList,
  nullLabel,
}: {
  node: PointerDiagramNode;
  nextNode?: PointerDiagramNode;
  outgoing?: PointerDiagramLink;
  backLink?: PointerDiagramLink;
  isLinkedList: boolean;
  isDoublyLinkedList: boolean;
  nullLabel: string;
}) {
  if (!isLinkedList) {
    if (!nextNode) return null;
    return (
      <span
        className={cn(
          'font-mono text-xl text-muted-foreground',
          outgoing?.active && 'text-cyan-500',
        )}
        aria-label={outgoing?.label || 'next'}
      >
        →
      </span>
    );
  }

  if (isDoublyLinkedList) {
    if (!nextNode && !outgoing && !backLink) return null;
    const activeNext = outgoing?.active;
    const activePrev = backLink?.active;

    return (
      <div className="flex w-10 shrink-0 items-center justify-center" aria-label="next and prev">
        <span
          className={cn(
            'inline-flex h-8 w-8 items-center justify-center rounded-full border font-mono text-lg font-semibold',
            activeNext && activePrev
              ? 'border-emerald-400 bg-emerald-50 text-emerald-800 shadow-[0_0_0_3px_rgba(16,185,129,0.14)] dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-100'
              : activeNext
                ? 'border-cyan-400 bg-cyan-50 text-cyan-800 shadow-[0_0_0_3px_rgba(34,211,238,0.14)] dark:border-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-100'
                : activePrev
                  ? 'border-violet-400 bg-violet-50 text-violet-800 shadow-[0_0_0_3px_rgba(139,92,246,0.14)] dark:border-violet-700 dark:bg-violet-950/30 dark:text-violet-100'
                  : 'border-emerald-200 bg-background/80 text-emerald-800 dark:border-emerald-900/70 dark:bg-background/50 dark:text-emerald-100',
          )}
        >
          ⇄
        </span>
      </div>
    );
  }

  if (!outgoing) {
    const hasNonNullNextField = node.fields.some(
      (field) => field.name === 'next' && field.value !== nullLabel,
    );
    return (
      <span className="rounded-md border border-dashed border-border/70 bg-background/80 px-2 py-1 font-mono text-[11px] text-muted-foreground">
        {hasNonNullNextField ? '未连接' : nullLabel}
      </span>
    );
  }

  if (nextNode && outgoing.to === nextNode.id) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 font-mono text-xl text-muted-foreground',
          outgoing.active && 'text-cyan-500',
        )}
        aria-label={outgoing.label || 'next'}
      >
        <span className="text-[10px] uppercase tracking-[0.12em]">next</span>→
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex max-w-28 flex-col rounded-md border px-2 py-1 font-mono text-[11px] leading-tight',
        outgoing.active
          ? 'border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-100'
          : 'border-border/70 bg-background/80 text-muted-foreground',
      )}
    >
      <span>next</span>
      <span>→ {outgoing.to}</span>
    </span>
  );
}

function PointerDiagramCanvas({
  nodes,
  pointers,
  links,
  isLinkedList,
  isDoublyLinkedList,
  nullLabel,
  renderInlineMathHtml,
}: {
  nodes: readonly PointerDiagramNode[];
  pointers: readonly PointerDiagramPointer[];
  links: readonly PointerDiagramLink[];
  isLinkedList: boolean;
  isDoublyLinkedList: boolean;
  nullLabel: string;
  renderInlineMathHtml: (text: string) => string;
}) {
  const effectiveLinks = buildPointerLinks(nodes, links, isDoublyLinkedList, nullLabel);
  const nullPointers = pointers.filter((pointer) => !pointer.to);
  const pointerRows = isDoublyLinkedList && nodes.length > 3 ? chunkPointerRows(nodes, 2) : [nodes];

  if (isDoublyLinkedList) {
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const getNodeField = (node: PointerDiagramNode, name: 'prev' | 'next') =>
      node.fields.find((field) => field.name === name)?.value;
    const getNodeTarget = (node: PointerDiagramNode, name: 'prev' | 'next') =>
      getNodeField(node, name) || getPointerLink(effectiveLinks, node.id, name)?.to || nullLabel;
    const startPointer = pointers.find((pointer) =>
      ['head', 'front', 'first'].includes(pointer.name.toLowerCase()),
    );
    const startNode = (startPointer?.to && nodesById.get(startPointer.to)) || nodes[0];
    const chainNodes: PointerDiagramNode[] = [];
    const visitedNodeIds = new Set<string>();
    let cursor: PointerDiagramNode | undefined = startNode;

    while (cursor && !visitedNodeIds.has(cursor.id)) {
      chainNodes.push(cursor);
      visitedNodeIds.add(cursor.id);
      const nextTarget = getNodeTarget(cursor, 'next');
      if (!nextTarget || nextTarget === nullLabel || visitedNodeIds.has(nextTarget)) break;
      cursor = nodesById.get(nextTarget);
    }

    const chainNodeIds = new Set(chainNodes.map((node) => node.id));
    const detachedNodes = nodes.filter((node) => !chainNodeIds.has(node.id));
    const chainRows = chainNodes.length > 4 ? chunkPointerRows(chainNodes, 4) : [chainNodes];
    const formatPointerName = (name: string) => {
      if (name === 'head') return 'front';
      if (name === 'curr') return 'cur';
      if (name === 'tail') return 'end';
      return name;
    };
    const renderPointerChips = (node: PointerDiagramNode) => {
      const incomingPointers = pointers.filter((pointer) => pointer.to === node.id);
      if (!incomingPointers.length) return <div className="min-h-6" />;
      return (
        <div className="flex min-h-6 flex-wrap justify-center gap-1 pt-1">
          {incomingPointers.map((pointer) => (
            <span
              key={pointer.name}
              className={cn(
                'rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none shadow-sm',
                pointer.name === 'new'
                  ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100'
                  : pointer.name === 'curr'
                    ? 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-100'
                    : 'border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950 dark:text-cyan-100',
              )}
            >
              {formatPointerName(pointer.name)}
            </span>
          ))}
        </div>
      );
    };

    const renderDoublyNode = (node: PointerDiagramNode) => {
      const itemField = node.label;
      const prevLabel = getNodeTarget(node, 'prev');
      const nextLabel = getNodeTarget(node, 'next');
      const prevOutgoing = getPointerLink(effectiveLinks, node.id, 'prev');
      const nextOutgoing = getPointerLink(effectiveLinks, node.id, 'next');
      const prevIsNull = prevLabel === nullLabel;
      const nextIsNull = nextLabel === nullLabel;

      return (
        <div key={node.id} className="space-y-0.5 text-center">
          <div
            className={cn(
              'flex h-11 w-[6.75rem] overflow-hidden rounded-sm border-2 bg-background font-mono shadow-sm',
              node.active && 'border-teal-500 bg-teal-50 dark:bg-teal-950/30',
              node.muted &&
                'border-dashed border-amber-300 bg-amber-50/40 opacity-90 dark:border-amber-900/70 dark:bg-amber-950/20',
              !node.active && !node.muted && 'border-slate-500/80 dark:border-slate-400/70',
            )}
          >
            <div
              className={cn(
                'flex w-5 shrink-0 flex-col items-center justify-center border-r-2 border-inherit',
                prevOutgoing?.active && 'bg-violet-100/80 dark:bg-violet-950/40',
              )}
              aria-label={`prev -> ${prevLabel}`}
            >
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  prevIsNull
                    ? 'border border-slate-300 bg-transparent dark:border-slate-600'
                    : 'bg-violet-500',
                  prevOutgoing?.active && 'h-2.5 w-2.5 bg-violet-700 ring-4 ring-violet-200',
                )}
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-1.5">
              <p className="text-lg font-semibold leading-none text-foreground">
                <InlineText text={itemField} renderInlineMathHtml={renderInlineMathHtml} />
              </p>
            </div>
            <div
              className={cn(
                'flex w-5 shrink-0 flex-col items-center justify-center border-l-2 border-inherit',
                nextOutgoing?.active && 'bg-cyan-100/80 dark:bg-cyan-950/40',
              )}
              aria-label={`next -> ${nextLabel}`}
            >
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  nextIsNull
                    ? 'border border-slate-300 bg-transparent dark:border-slate-600'
                    : 'bg-amber-500',
                  nextOutgoing?.active && 'h-2.5 w-2.5 bg-amber-600 ring-4 ring-amber-200',
                )}
              />
            </div>
          </div>
          {renderPointerChips(node)}
        </div>
      );
    };

    const renderDoublyConnector = (fromNode: PointerDiagramNode, toNode?: PointerDiagramNode) => {
      if (!toNode) return null;
      const nextLink = getPointerLink(effectiveLinks, fromNode.id, 'next');
      const prevLink = getPointerLink(effectiveLinks, toNode.id, 'prev');
      const hasNext = nextLink?.to === toNode.id;
      const hasPrev = prevLink?.to === fromNode.id;
      if (!hasNext && !hasPrev) return <div className="w-5 shrink-0" />;

      return (
        <div
          className="flex h-11 w-12 shrink-0 flex-col justify-center gap-1.5 px-0.5 font-mono text-[10px] font-semibold"
          aria-label="next and prev"
        >
          <span
            className={cn(
              'flex items-center gap-1',
              hasNext ? 'text-amber-600 dark:text-amber-200' : 'text-muted-foreground/50',
              nextLink?.active && 'text-amber-700 dark:text-amber-100',
            )}
          >
            <span className="h-0.5 flex-1 rounded-full bg-current" />
            <span className="text-sm leading-none">→</span>
          </span>
          <span
            className={cn(
              'flex items-center gap-1',
              hasPrev ? 'text-violet-700 dark:text-violet-200' : 'text-muted-foreground/50',
              prevLink?.active && 'text-violet-900 dark:text-violet-100',
            )}
          >
            <span className="text-sm leading-none">←</span>
            <span className="h-0.5 flex-1 rounded-full bg-current" />
          </span>
        </div>
      );
    };

    return (
      <>
        <div className="space-y-2 pb-1">
          <div className="space-y-1.5 rounded-lg border border-emerald-200/70 bg-emerald-50/20 p-2 dark:border-emerald-900/50 dark:bg-emerald-950/10">
            {chainRows.map((row, rowIndex) => (
              <div key={row.map((node) => node.id).join('-')} className="space-y-1">
                <div className="flex flex-wrap items-start gap-0">
                  {row.map((node, localIndex) => (
                    <Fragment key={node.id}>
                      {renderDoublyNode(node)}
                      {renderDoublyConnector(node, row[localIndex + 1])}
                    </Fragment>
                  ))}
                </div>
                {rowIndex < chainRows.length - 1 ? (
                  <p className="px-1 text-center font-mono text-[10px] text-muted-foreground">
                    下一行继续到 {chainRows[rowIndex + 1]?.[0]?.label}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
          {detachedNodes.length > 0 ? (
            <div className="rounded-lg border border-dashed border-amber-300/80 bg-amber-50/25 p-2 dark:border-amber-900/60 dark:bg-amber-950/10">
              <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-200">
                尚未接入 head 的 next 主链
              </p>
              <div className="flex flex-wrap items-start gap-2">
                {detachedNodes.map((node) => renderDoublyNode(node))}
              </div>
            </div>
          ) : null}
        </div>
        {nullPointers.length > 0 ? (
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {nullPointers.map((pointer) => (
              <span key={pointer.name} className="rounded-md border border-border/70 px-2 py-1">
                {pointer.name} → {nullLabel}
              </span>
            ))}
          </div>
        ) : null}
      </>
    );
  }

  if (isLinkedList) {
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const getNodeTarget = (node: PointerDiagramNode) =>
      node.fields.find((field) => field.name === 'next')?.value ||
      getPointerLink(effectiveLinks, node.id, 'next')?.to ||
      nullLabel;
    const startPointer = pointers.find((pointer) =>
      ['front', 'head', 'first'].includes(pointer.name.toLowerCase()),
    );
    const startNode = (startPointer?.to && nodesById.get(startPointer.to)) || nodes[0];
    const chainNodes: PointerDiagramNode[] = [];
    const visitedNodeIds = new Set<string>();
    let cursor: PointerDiagramNode | undefined = startNode;

    while (cursor && !visitedNodeIds.has(cursor.id)) {
      chainNodes.push(cursor);
      visitedNodeIds.add(cursor.id);
      const nextTarget = getNodeTarget(cursor);
      if (!nextTarget || nextTarget === nullLabel || visitedNodeIds.has(nextTarget)) break;
      cursor = nodesById.get(nextTarget);
    }

    const chainNodeIds = new Set(chainNodes.map((node) => node.id));
    const detachedNodes = nodes.filter((node) => !chainNodeIds.has(node.id));
    const chainRows = chainNodes.length > 5 ? chunkPointerRows(chainNodes, 5) : [chainNodes];
    const formatPointerName = (name: string) => {
      if (name === 'curr') return 'cur';
      if (name === 'tail') return 'end';
      return name;
    };

    const renderPointerChips = (node: PointerDiagramNode) => {
      const incomingPointers = pointers.filter((pointer) => pointer.to === node.id);
      if (!incomingPointers.length) return <div className="min-h-6" />;
      return (
        <div className="flex min-h-6 flex-wrap justify-center gap-1 pt-1">
          {incomingPointers.map((pointer) => (
            <span
              key={pointer.name}
              className={cn(
                'rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none shadow-sm',
                pointer.name === 'new'
                  ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100'
                  : pointer.name === 'curr'
                    ? 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-100'
                    : 'border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950 dark:text-cyan-100',
              )}
            >
              {formatPointerName(pointer.name)}
            </span>
          ))}
        </div>
      );
    };

    const renderSinglyNode = (node: PointerDiagramNode) => {
      const itemField = node.label;
      const nextLabel = getNodeTarget(node);
      const nextOutgoing = getPointerLink(effectiveLinks, node.id, 'next');
      const nextIsNull = nextLabel === nullLabel;

      return (
        <div key={node.id} className="space-y-0.5 text-center">
          <div
            className={cn(
              'flex h-11 w-[5.75rem] overflow-hidden rounded-sm border-2 bg-background font-mono shadow-sm',
              node.active && 'border-teal-500 bg-teal-50 dark:bg-teal-950/30',
              node.muted &&
                'border-dashed border-amber-300 bg-amber-50/40 opacity-90 dark:border-amber-900/70 dark:bg-amber-950/20',
              !node.active && !node.muted && 'border-slate-500/80 dark:border-slate-400/70',
            )}
          >
            <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-2">
              <p className="text-lg font-semibold leading-none text-foreground">
                <InlineText text={itemField} renderInlineMathHtml={renderInlineMathHtml} />
              </p>
            </div>
            <div
              className={cn(
                'flex w-6 shrink-0 items-center justify-center border-l-2 border-inherit',
                nextOutgoing?.active && 'bg-amber-100/80 dark:bg-amber-950/40',
              )}
              aria-label={`next -> ${nextLabel}`}
            >
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  nextIsNull
                    ? 'border border-slate-300 bg-transparent dark:border-slate-600'
                    : 'bg-amber-500',
                  nextOutgoing?.active && 'h-2.5 w-2.5 bg-amber-600 ring-4 ring-amber-200',
                )}
              />
            </div>
          </div>
          {renderPointerChips(node)}
        </div>
      );
    };

    const renderSinglyConnector = (fromNode: PointerDiagramNode, toNode?: PointerDiagramNode) => {
      if (!toNode) return null;
      const nextTarget = getNodeTarget(fromNode);
      const nextLink = getPointerLink(effectiveLinks, fromNode.id, 'next');
      if (nextTarget !== toNode.id) return <div className="w-5 shrink-0" />;

      return (
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center gap-1 text-amber-600 dark:text-amber-200',
            nextLink?.active && 'text-amber-700 dark:text-amber-100',
          )}
          aria-label={`next -> ${toNode.id}`}
        >
          <span className="h-0.5 flex-1 rounded-full bg-current" />
          <span className="font-mono text-base leading-none">→</span>
        </div>
      );
    };

    const renderDetachedTarget = (node: PointerDiagramNode) => {
      const nextTarget = getNodeTarget(node);
      const targetNode = nextTarget !== nullLabel ? nodesById.get(nextTarget) : undefined;
      if (!targetNode) return null;
      return (
        <div className="flex h-11 items-center gap-1 font-mono text-[11px] font-semibold text-amber-700 dark:text-amber-100">
          <span className="h-0.5 w-7 rounded-full bg-current" />
          <span className="text-base leading-none">→</span>
          <span className="rounded-sm border border-amber-300 bg-background px-2 py-1">
            {targetNode.label}
          </span>
        </div>
      );
    };

    return (
      <>
        <div className="space-y-2 pb-1">
          <div className="space-y-1.5 rounded-lg border border-amber-200/70 bg-amber-50/20 p-2 dark:border-amber-900/50 dark:bg-amber-950/10">
            {chainRows.map((row, rowIndex) => (
              <div key={row.map((node) => node.id).join('-')} className="space-y-1">
                <div className="flex flex-wrap items-start gap-0">
                  {row.map((node, localIndex) => (
                    <Fragment key={node.id}>
                      {renderSinglyNode(node)}
                      {renderSinglyConnector(node, row[localIndex + 1])}
                    </Fragment>
                  ))}
                </div>
                {rowIndex < chainRows.length - 1 ? (
                  <p className="px-1 text-center font-mono text-[10px] text-muted-foreground">
                    下一行继续到 {chainRows[rowIndex + 1]?.[0]?.label}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
          {detachedNodes.length > 0 ? (
            <div className="rounded-lg border border-dashed border-amber-300/80 bg-amber-50/25 p-2 dark:border-amber-900/60 dark:bg-amber-950/10">
              <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-200">
                尚未接入 front 的 next 主链
              </p>
              <div className="flex flex-wrap items-start gap-1.5">
                {detachedNodes.map((node) => (
                  <Fragment key={node.id}>
                    {renderSinglyNode(node)}
                    {renderDetachedTarget(node)}
                  </Fragment>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        {nullPointers.length > 0 ? (
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {nullPointers.map((pointer) => (
              <span key={pointer.name} className="rounded-md border border-border/70 px-2 py-1">
                {pointer.name} → {nullLabel}
              </span>
            ))}
          </div>
        ) : null}
      </>
    );
  }

  const renderNodeSegment = (node: PointerDiagramNode, connectorNextNode?: PointerDiagramNode) => {
    const incomingPointers = pointers.filter((pointer) => pointer.to === node.id);
    const outgoing = getPointerLink(effectiveLinks, node.id, 'next');
    const prevOutgoing = getPointerLink(effectiveLinks, node.id, 'prev');
    const itemField =
      node.fields.find((field) => ['item', 'value', 'data'].includes(field.name))?.value ||
      node.label;
    const fieldNext = node.fields.find((field) => field.name === 'next')?.value;
    const fieldPrev = node.fields.find((field) => field.name === 'prev')?.value;
    const nextLabel = fieldNext || outgoing?.to || nullLabel;
    const prevLabel = fieldPrev || prevOutgoing?.to || nullLabel;
    const nextNode = connectorNextNode;
    const backLink = nextNode ? getPointerLink(effectiveLinks, nextNode.id, 'prev') : undefined;
    const shouldRenderConnector = isDoublyLinkedList
      ? Boolean(nextNode)
      : Boolean(nextNode || outgoing);

    return (
      <div
        key={node.id}
        className={cn('flex items-center', isDoublyLinkedList ? 'gap-2' : 'gap-3')}
      >
        <div className="space-y-1 text-center">
          <div className="min-h-6">
            {incomingPointers.map((pointer) => (
              <span
                key={pointer.name}
                className={cn(
                  'mr-1 rounded-md px-2 py-0.5 font-mono text-xs',
                  pointer.name === 'new'
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-100'
                    : pointer.name === 'curr'
                      ? 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-100'
                      : 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-100',
                )}
              >
                {pointer.name}
              </span>
            ))}
          </div>
          <div
            className={cn(
              'overflow-hidden rounded-lg border text-left',
              isDoublyLinkedList ? 'w-36' : 'min-w-28',
              node.active
                ? 'border-cyan-400 bg-cyan-50 dark:bg-cyan-950/30'
                : node.muted
                  ? 'border-dashed border-border/60 bg-muted/20 opacity-75'
                  : 'border-border/70 bg-background',
            )}
          >
            {isLinkedList ? (
              <div className="font-mono text-xs">
                {isDoublyLinkedList ? (
                  <>
                    <div className="flex items-center justify-between border-b border-border/70 bg-muted/40 px-2 py-1">
                      <span className="text-[10px] font-semibold text-muted-foreground">
                        {node.id}
                      </span>
                      <span className="rounded-md bg-background px-2 py-0.5 text-center text-sm font-semibold text-foreground">
                        <InlineText text={itemField} renderInlineMathHtml={renderInlineMathHtml} />
                      </span>
                    </div>
                    <div className="grid grid-cols-2 bg-background text-[11px]">
                      <span
                        className={cn(
                          'min-w-0 border-r border-border/70 px-2 py-1.5',
                          prevLabel === nullLabel ? 'text-muted-foreground' : 'text-foreground',
                          prevOutgoing?.active &&
                            'bg-violet-50 font-semibold text-violet-800 dark:bg-violet-950/30 dark:text-violet-100',
                        )}
                      >
                        <span className="mr-1 text-[10px] uppercase text-muted-foreground">
                          prev
                        </span>
                        <InlineText text={prevLabel} renderInlineMathHtml={renderInlineMathHtml} />
                      </span>
                      <span
                        className={cn(
                          'min-w-0 px-2 py-1.5',
                          nextLabel === nullLabel ? 'text-muted-foreground' : 'text-foreground',
                          outgoing?.active &&
                            'bg-cyan-50 font-semibold text-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-100',
                        )}
                      >
                        <span className="mr-1 text-[10px] uppercase text-muted-foreground">
                          next
                        </span>
                        <InlineText text={nextLabel} renderInlineMathHtml={renderInlineMathHtml} />
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-[minmax(5rem,1fr)_4.25rem] border-b border-border/70 bg-muted/50 text-[11px] font-semibold text-muted-foreground">
                      <span className="border-r border-border/70 px-2 py-1">item</span>
                      <span className="px-2 py-1 text-center">next</span>
                    </div>
                    <div className="grid grid-cols-[minmax(5rem,1fr)_4.25rem] bg-background">
                      <span className="border-r border-border/70 px-2 py-2 text-foreground">
                        <InlineText text={itemField} renderInlineMathHtml={renderInlineMathHtml} />
                      </span>
                      <span
                        className={cn(
                          'px-2 py-2 text-center',
                          nextLabel === nullLabel ? 'text-muted-foreground' : 'text-foreground',
                          outgoing?.active &&
                            'bg-cyan-50 font-semibold text-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-100',
                        )}
                      >
                        <InlineText text={nextLabel} renderInlineMathHtml={renderInlineMathHtml} />
                      </span>
                    </div>
                    <p className="border-t border-border/70 px-2 py-1 text-[11px] text-muted-foreground">
                      #{node.id}
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="p-3">
                <p className="font-mono text-sm font-semibold text-foreground">
                  <InlineText text={node.label} renderInlineMathHtml={renderInlineMathHtml} />
                </p>
                <div className="mt-2">
                  <KeyValueChips items={node.fields} renderInlineMathHtml={renderInlineMathHtml} />
                </div>
              </div>
            )}
          </div>
        </div>
        {shouldRenderConnector ? (
          <PointerConnector
            node={node}
            nextNode={nextNode}
            outgoing={outgoing}
            backLink={backLink}
            isLinkedList={isLinkedList}
            isDoublyLinkedList={isDoublyLinkedList}
            nullLabel={nullLabel}
          />
        ) : null}
      </div>
    );
  };

  const renderRowBridge = (fromNode: PointerDiagramNode, toNode: PointerDiagramNode) => {
    const outgoing = getPointerLink(effectiveLinks, fromNode.id, 'next');
    const backLink = getPointerLink(effectiveLinks, toNode.id, 'prev');
    const active = outgoing?.active || backLink?.active;
    return (
      <div className="flex justify-center py-0.5">
        <span
          className={cn(
            'rounded-full border px-3 py-1 font-mono text-[11px] font-semibold',
            active
              ? 'border-emerald-400 bg-emerald-50 text-emerald-800 shadow-[0_0_0_3px_rgba(16,185,129,0.12)] dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-100'
              : 'border-emerald-200 bg-background/80 text-emerald-800 dark:border-emerald-900/70 dark:bg-background/50 dark:text-emerald-100',
          )}
        >
          {fromNode.label} ⇄ {toNode.label}
        </span>
      </div>
    );
  };

  return (
    <>
      {isDoublyLinkedList ? (
        <div className="space-y-2 pb-1">
          {pointerRows.map((row, rowIndex) => {
            const nextRow = pointerRows[rowIndex + 1];
            const lastNode = row[row.length - 1];
            const nextRowFirstNode = nextRow?.[0];

            return (
              <div key={row.map((node) => node.id).join('-')} className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  {row.map((node, localIndex) => renderNodeSegment(node, row[localIndex + 1]))}
                </div>
                {lastNode && nextRowFirstNode ? renderRowBridge(lastNode, nextRowFirstNode) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max items-center gap-3">
            {nodes.map((node, index) => renderNodeSegment(node, nodes[index + 1]))}
          </div>
        </div>
      )}
      {nullPointers.length > 0 ? (
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {nullPointers.map((pointer) => (
            <span key={pointer.name} className="rounded-md border border-border/70 px-2 py-1">
              {pointer.name} → {nullLabel}
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
}

export function PointerDiagramBlock({
  block,
  language,
  renderInlineMathHtml,
  activeStepIndex,
}: CsBlockProps<PointerDiagramBlock>) {
  const isLinkedList = block.kind === 'linked_list';
  const blockIsDoublyLinkedList =
    isLinkedList &&
    (block.variant === 'doubly' || hasDoublyLinkedListShape(block.nodes, block.links));
  const nullLabel = block.nullLabel || 'None';
  const pointerSteps = block.steps ?? EMPTY_POINTER_STEPS;
  const totalSteps = pointerSteps.length;
  const { safeStepIndex, setInternalStepIndex } = usePlayableStepIndex(activeStepIndex, totalSteps);
  const currentStep = totalSteps > 0 ? pointerSteps[safeStepIndex] : undefined;
  const stepGroups = useMemo(
    () => getPointerStepGroups(pointerSteps, language),
    [pointerSteps, language],
  );

  if (isLinkedList && currentStep) {
    const stepNodes = currentStep.nodes.length ? currentStep.nodes : block.nodes;
    const stepPointers = currentStep.pointers.length ? currentStep.pointers : block.pointers;
    const stepLinks = currentStep.links.length ? currentStep.links : block.links;
    const stepIsDoublyLinkedList =
      blockIsDoublyLinkedList || hasDoublyLinkedListShape(stepNodes, stepLinks);
    const canGoBack = safeStepIndex > 0;
    const canGoForward = safeStepIndex < totalSteps - 1;

    return (
      <div className="space-y-2 rounded-lg border border-emerald-200/70 bg-emerald-50/35 p-2 dark:border-emerald-900/50 dark:bg-emerald-950/10">
        <div className="flex flex-wrap items-center gap-2">
          <BlockKicker>
            {stepIsDoublyLinkedList ? 'doubly linked list trace' : 'linked list trace'}
          </BlockKicker>
          <BlockTitle
            title={block.title}
            fallback={
              stepIsDoublyLinkedList
                ? language === 'en-US'
                  ? 'Doubly Linked List Trace'
                  : '双向链表逐步追踪'
                : language === 'en-US'
                  ? 'Linked List Trace'
                  : '链表逐步追踪'
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
        {block.operation ? (
          <p className="rounded-lg border border-emerald-200 bg-background/80 px-2 py-1 text-xs leading-5 text-muted-foreground dark:border-emerald-900/60 dark:bg-background/60">
            <InlineText text={block.operation} renderInlineMathHtml={renderInlineMathHtml} />
          </p>
        ) : null}
        <div className="grid gap-1.5 lg:grid-cols-[minmax(0,0.82fr)_minmax(260px,1.18fr)]">
          <div className="rounded-lg border border-emerald-200 bg-background/85 p-2 dark:border-emerald-900/60 dark:bg-background/60">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-700 dark:text-emerald-200">
              {language === 'en-US' ? 'Current Step' : '当前步骤'}
            </p>
            <p className="mt-0.5 text-xs font-semibold leading-5 text-foreground">
              <InlineText
                text={currentStep.title || (language === 'en-US' ? 'Pointer update' : '指针更新')}
                renderInlineMathHtml={renderInlineMathHtml}
              />
            </p>
            {currentStep.operation ? (
              <pre className="mt-1 whitespace-pre-wrap rounded-md border border-slate-800 bg-slate-950 px-2 py-1 font-mono text-xs leading-5 text-slate-100">
                {currentStep.operation}
              </pre>
            ) : null}
          </div>
          <div className="rounded-lg border border-emerald-200 bg-background/85 p-2 text-xs leading-5 text-foreground dark:border-emerald-900/60 dark:bg-background/60">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-700 dark:text-emerald-200">
              {language === 'en-US' ? 'Why it matters' : '为什么这一步重要'}
            </p>
            <p className="mt-0.5">
              <InlineText
                text={currentStep.explanation || block.caption || ''}
                renderInlineMathHtml={renderInlineMathHtml}
              />
            </p>
          </div>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-background/85 p-2 dark:border-emerald-900/60 dark:bg-background/60">
          <PointerDiagramCanvas
            nodes={stepNodes}
            pointers={stepPointers}
            links={stepLinks}
            isLinkedList={isLinkedList}
            isDoublyLinkedList={stepIsDoublyLinkedList}
            nullLabel={nullLabel}
            renderInlineMathHtml={renderInlineMathHtml}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'space-y-3 rounded-lg border p-4',
        isLinkedList
          ? 'border-emerald-200/70 bg-emerald-50/35 dark:border-emerald-900/50 dark:bg-emerald-950/10'
          : 'border-border/70 bg-muted/20',
      )}
    >
      <div className="space-y-1">
        <BlockKicker>{isLinkedList ? 'linked list' : 'pointers'}</BlockKicker>
        <BlockTitle
          title={block.title}
          fallback={
            isLinkedList
              ? language === 'en-US'
                ? 'Linked List'
                : '链表结构'
              : language === 'en-US'
                ? 'Pointer Diagram'
                : '指针图'
          }
          renderInlineMathHtml={renderInlineMathHtml}
        />
        {block.operation ? (
          <p className="text-xs text-muted-foreground">
            <InlineText text={block.operation} renderInlineMathHtml={renderInlineMathHtml} />
          </p>
        ) : null}
      </div>
      <PointerDiagramCanvas
        nodes={block.nodes}
        pointers={block.pointers}
        links={block.links}
        isLinkedList={isLinkedList}
        isDoublyLinkedList={blockIsDoublyLinkedList}
        nullLabel={nullLabel}
        renderInlineMathHtml={renderInlineMathHtml}
      />
      {block.caption ? (
        <p className="text-xs text-muted-foreground">
          <InlineText text={block.caption} renderInlineMathHtml={renderInlineMathHtml} />
        </p>
      ) : null}
    </div>
  );
}
