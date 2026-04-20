'use client';

import { useRef, useState, useEffect, useMemo } from 'react';
import { KEYS } from '@/configs/hotkey';
import { useCanvasStore } from '@/lib/store/canvas';
import { useSceneSelector } from '@/lib/contexts/scene-context';
import { useKeyboardStore } from '@/lib/store/keyboard';
import { useViewportSize } from './hooks/useViewportSize';
import { useSelectElement } from './hooks/useSelectElement';
import { useDragElement } from './hooks/useDragElement';
import { useRotateElement } from './hooks/useRotateElement';
import { useMouseSelection } from './hooks/useMouseSelection';
import { useScaleElement } from './hooks/useScaleElement';
import { useDragLineElement } from './hooks/useDragLineElement';
import { useMoveShapeKeypoint } from './hooks/useMoveShapeKeypoint';
import { useInsertFromCreateSelection } from './hooks/useInsertFromCreateSelection';
import { useDrop } from './hooks/useDrop';
import { AlignmentLine } from './AlignmentLine';
import { MouseSelection } from './MouseSelection';
import { ViewportBackground } from './ViewportBackground';
import { EditableElement } from './EditableElement';
import { Operate } from './Operate';
import { MultiSelectOperate } from './Operate/MultiSelectOperate';
import { ElementCreateSelection } from './ElementCreateSelection';
import { ShapeCreateCanvas } from './ShapeCreateCanvas';
import { Ruler } from './Ruler';
import { GridLines } from './GridLines';
import type { PPTElement } from '@/lib/types/slides';
import type { AlignmentLineProps } from '@/lib/types/edit';
import type { ContextmenuItem } from './EditableElement';
import type { SlideContent } from '@/lib/types/stage';
import { useCanvasOperations } from '@/lib/hooks/use-canvas-operations';
import { getElementListRange } from '@/lib/utils/element';
import { stripLegacyVerticalFlowMarkers } from '@/lib/utils/legacy-flow-markers';
import { FlowTimelineOverlay } from '../../components/FlowTimelineOverlay';
import {
  CanvasViewportMetricsProvider,
} from './canvas-viewport-metrics-context';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuShortcut,
  ContextMenuItem,
} from '@/components/ui/context-menu';

const CONTENT_BOTTOM_PADDING = 24;
const TITLE_BASELINE_LEFT = 64;
const FULL_ROW_BASELINE_WIDTH = 872;
const FULL_ROW_SNAP_MIN_WIDTH = 800;
const LEGACY_FULL_ROW_MIN_LEFT = 80;
const LEGACY_FULL_ROW_MAX_LEFT = 100;

function normalizeTitleBaseline(elements: PPTElement[]): PPTElement[] {
  const baselineAdjusted = elements.map((element) => {
    const isTextElement = element.type === 'text';
    const isLatexElement = element.type === 'latex';
    if (!isTextElement && !isLatexElement) return element;
    if (element.width < FULL_ROW_SNAP_MIN_WIDTH) return element;
    if (element.left < LEGACY_FULL_ROW_MIN_LEFT || element.left > LEGACY_FULL_ROW_MAX_LEFT) {
      return element;
    }
    if (
      isTextElement &&
      element.textType !== 'title' &&
      element.textType !== 'notes'
    ) {
      return element;
    }
    return {
      ...element,
      left: TITLE_BASELINE_LEFT,
      width: FULL_ROW_BASELINE_WIDTH,
    };
  });
  const groups = new Map<string, Array<{ id: string; left: number; top: number; width: number }>>();
  baselineAdjusted.forEach((element) => {
    if (!element.groupId?.startsWith('layout_cards_')) return;
    if (typeof element.left !== 'number' || typeof element.top !== 'number') return;
    if (typeof element.width !== 'number') return;
    const list = groups.get(element.groupId) || [];
    list.push({ id: element.id, left: element.left, top: element.top, width: element.width });
    groups.set(element.groupId, list);
  });
  if (groups.size === 0) return baselineAdjusted;
  const byId = new Map(baselineAdjusted.map((element) => [element.id, element] as const));
  for (const cards of groups.values()) {
    if (cards.length !== 2) continue;
    const [a, b] = cards;
    const horizontalSplit = Math.abs(a.left - b.left) > Math.min(a.width, b.width) * 0.45;
    if (!horizontalSplit) continue;
    const first = byId.get(a.id);
    const second = byId.get(b.id);
    const firstHeight = first && typeof (first as { height?: unknown }).height === 'number' ? (first as { height: number }).height : 0;
    const secondHeight = second && typeof (second as { height?: unknown }).height === 'number' ? (second as { height: number }).height : 0;
    const oldBottom = Math.max(a.top + firstHeight, b.top + secondHeight);
    const alignedTop = Math.min(a.top, b.top);
    const ae = first;
    const be = second;
    if (ae && typeof ae.top === 'number') ae.top = alignedTop;
    if (be && typeof be.top === 'number') be.top = alignedTop;
    const newBottom = Math.max(
      ae && typeof ae.top === 'number' && typeof (ae as { height?: unknown }).height === 'number'
        ? ae.top + (ae as { height: number }).height
        : oldBottom,
      be && typeof be.top === 'number' && typeof (be as { height?: unknown }).height === 'number'
        ? be.top + (be as { height: number }).height
        : oldBottom,
    );
    const collapseDelta = Math.max(0, Math.round(oldBottom - newBottom));
    if (collapseDelta <= 0) continue;
    baselineAdjusted.forEach((element) => {
      if (element.groupId === (ae?.groupId || be?.groupId)) return;
      if (element.type === 'line') {
        const minY = Math.min(element.start[1], element.end[1]);
        if (minY >= oldBottom - 1) {
          element.start = [element.start[0], element.start[1] - collapseDelta];
          element.end = [element.end[0], element.end[1] - collapseDelta];
        }
        return;
      }
      if (typeof (element as { top?: unknown }).top !== 'number') return;
      if ((element as { top: number }).top >= oldBottom - 1) {
        (element as { top: number }).top -= collapseDelta;
      }
    });
  }
  return baselineAdjusted;
}

export interface CanvasProps {
  editable?: boolean;
}

/**
 * Canvas component
 *
 * Architecture:
 * - Slide data (elements, background) → Scene Context (from stageStore)
 * - Local element list → useRef + useState (for drag/scale/rotate operations)
 * - Canvas UI state (selection, toolbar) → Canvas Store
 * - Keyboard state → Keyboard Store
 *
 * Usage:
 * <SceneProvider>
 *   <Canvas />
 * </SceneProvider>
 */
export function Canvas(_props: CanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Subscribe to specific parts for performance optimization
  const rawElements = useSceneSelector<SlideContent, PPTElement[]>(
    (content) => content.canvas.elements.filter((element) => element.type !== 'shape'),
  );
  const elements = useMemo(() => stripLegacyVerticalFlowMarkers(rawElements), [rawElements]);

  // Canvas UI state
  const canvasScale = useCanvasStore.use.canvasScale();
  const activeElementIdList = useCanvasStore.use.activeElementIdList();
  const activeGroupElementId = useCanvasStore.use.activeGroupElementId();
  const handleElementId = useCanvasStore.use.handleElementId();
  const hiddenElementIdList = useCanvasStore.use.hiddenElementIdList();
  const creatingElement = useCanvasStore.use.creatingElement();
  const creatingCustomShape = useCanvasStore.use.creatingCustomShape();
  const clipingImageElementId = useCanvasStore.use.clipingImageElementId();
  const disableHotkeys = useCanvasStore.use.disableHotkeys();
  const showRuler = useCanvasStore.use.showRuler();
  const gridLineSize = useCanvasStore.use.gridLineSize();
  const setActiveElementIdList = useCanvasStore.use.setActiveElementIdList();
  const setGridLineSize = useCanvasStore.use.setGridLineSize();
  const setRulerState = useCanvasStore.use.setRulerState();

  // Keyboard state
  const spaceKeyState = useKeyboardStore((state) => state.spaceKeyState);

  const [alignmentLines, setAlignmentLines] = useState<AlignmentLineProps[]>([]);
  const [linkDialogVisible, setLinkDialogVisible] = useState(false);

  // Local element list for drag/scale/rotate operations
  const elementListRef = useRef<PPTElement[]>(elements || []);
  const [elementList, setElementList] = useState<PPTElement[]>(elements || []);

  // Sync store elements to local state
  useEffect(() => {
    const rawElements = elements ? (JSON.parse(JSON.stringify(elements)) as PPTElement[]) : [];
    const newElements = normalizeTitleBaseline(rawElements);
    elementListRef.current = newElements;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Sync store elements to local state
    setElementList(newElements);
  }, [elements]);

  // Viewport size and positioning
  const { viewportStyles, dragViewport } = useViewportSize(canvasRef);

  const contentHeight = useMemo(() => {
    if (!elementList.length) return viewportStyles.height;
    const { maxY } = getElementListRange(elementList);
    return Math.max(viewportStyles.height, maxY + CONTENT_BOTTOM_PADDING);
  }, [elementList, viewportStyles.height]);

  const fitScale = useMemo(
    () => Math.min(1, viewportStyles.height / contentHeight),
    [contentHeight, viewportStyles.height],
  );
  const fittedCanvasScale = canvasScale * fitScale;
  const fittedCanvasWidth = viewportStyles.width * fittedCanvasScale;
  const fittedCanvasHeight = contentHeight * fittedCanvasScale;
  const fittedCanvasLeft =
    viewportStyles.left + (viewportStyles.width * canvasScale - fittedCanvasWidth) / 2;

  const viewportMetrics = useMemo(
    () => ({
      fittedCanvasScale,
      contentHeight,
      viewportWidth: viewportStyles.width,
    }),
    [fittedCanvasScale, contentHeight, viewportStyles.width],
  );

  // Initialize drop handler
  useDrop(canvasRef);

  // Element drag (with alignment snapping)
  const { dragElement } = useDragElement(
    elementListRef,
    setElementList,
    setAlignmentLines,
    fittedCanvasScale,
  );

  // Element selection
  const { selectElement } = useSelectElement(elementListRef, dragElement);

  // Mouse selection
  const { mouseSelection, mouseSelectionVisible, mouseSelectionQuadrant, updateMouseSelection } =
    useMouseSelection(elementListRef, viewportRef, fittedCanvasScale);

  // Element operations
  const { scaleElement, scaleMultiElement } = useScaleElement(
    elementListRef,
    setElementList,
    setAlignmentLines,
    fittedCanvasScale,
  );
  const { rotateElement } = useRotateElement(
    elementListRef,
    setElementList,
    viewportRef,
    fittedCanvasScale,
  );
  const { dragLineElement } = useDragLineElement(elementListRef, setElementList, fittedCanvasScale);
  const { moveShapeKeypoint } = useMoveShapeKeypoint(
    elementListRef,
    setElementList,
    fittedCanvasScale,
  );

  // Create element from selection
  const { insertElementFromCreateSelection } = useInsertFromCreateSelection(
    viewportRef,
    fittedCanvasScale,
  );

  // Click on blank canvas area: clear active elements
  const handleClickBlankArea = (e: React.MouseEvent) => {
    // Check if the click target is a context menu element (menu content in Portal)
    const target = e.target as HTMLElement;
    if (
      target.closest('[data-slot="context-menu-content"]') ||
      target.closest('[data-slot="context-menu-sub-content"]') ||
      target.closest('[data-slot="context-menu-item"]') ||
      target.closest('[data-slot="context-menu-sub-trigger"]')
    ) {
      return; // Skip blank area handling if clicking on context menu
    }

    if (activeElementIdList.length) {
      setActiveElementIdList([]);
    }

    if (!spaceKeyState) {
      updateMouseSelection(e);
    } else {
      dragViewport(e);
    }
  };

  // Double-click blank area to insert text
  const handleDblClick = (_e: React.MouseEvent) => {
    if (activeElementIdList.length || creatingElement || creatingCustomShape) return;
    if (!viewportRef.current) return;

    const _viewportRect = viewportRef.current.getBoundingClientRect();
    // TODO: implement createTextElement (use _viewportRect + e.pageX/Y + canvasScale)
  };

  const openLinkDialog = () => {
    setLinkDialogVisible(true);
  };

  const { pasteElement, selectAllElements, deleteAllElements, deleteElement } = useCanvasOperations();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toUpperCase();
      const isDeleteKey = key === KEYS.DELETE || key === KEYS.BACKSPACE;

      if (!isDeleteKey) return;
      if (disableHotkeys || clipingImageElementId || !activeElementIdList.length) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target;
      if (target instanceof HTMLElement) {
        const tagName = target.tagName;
        if (
          tagName === 'INPUT' ||
          tagName === 'TEXTAREA' ||
          tagName === 'SELECT' ||
          target.isContentEditable ||
          target.closest('[contenteditable="true"]')
        ) {
          return;
        }
      }

      event.preventDefault();
      deleteElement();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeElementIdList.length, clipingImageElementId, deleteElement, disableHotkeys]);

  const contextmenus = (): ContextmenuItem[] => {
    return [
      {
        text: '粘贴',
        subText: 'Ctrl + V',
        handler: pasteElement,
      },
      {
        text: '全选',
        subText: 'Ctrl + A',
        handler: selectAllElements,
      },
      {
        text: '标尺',
        subText: showRuler ? '√' : '',
        handler: () => setRulerState(!showRuler),
      },
      {
        text: '网格线',
        handler: () => setGridLineSize(gridLineSize ? 0 : 50),
        children: [
          {
            text: '无',
            subText: gridLineSize === 0 ? '√' : '',
            handler: () => setGridLineSize(0),
          },
          {
            text: '小',
            subText: gridLineSize === 25 ? '√' : '',
            handler: () => setGridLineSize(25),
          },
          {
            text: '中',
            subText: gridLineSize === 50 ? '√' : '',
            handler: () => setGridLineSize(50),
          },
          {
            text: '大',
            subText: gridLineSize === 100 ? '√' : '',
            handler: () => setGridLineSize(100),
          },
        ],
      },
      {
        text: '重置当前页',
        handler: deleteAllElements,
      },
    ];
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div
          className="canvas relative h-full w-full overflow-hidden bg-gray-100 select-none"
          ref={canvasRef}
          onMouseDown={handleClickBlankArea}
          onDoubleClick={handleDblClick}
        >
          {/* Element creation selection */}
          {creatingElement && (
            <ElementCreateSelection onCreated={insertElementFromCreateSelection} />
          )}

          {/* Custom shape creation canvas */}
          {creatingCustomShape && (
            <ShapeCreateCanvas
              onCreated={(_data) => {
                // TODO: implement insertCustomShape
              }}
            />
          )}

          <CanvasViewportMetricsProvider value={viewportMetrics}>
          {/* Viewport wrapper */}
          <div
            className="viewport-wrapper absolute shadow-[0_0_0_1px_rgba(0,0,0,0.01),0_0_12px_0_rgba(0,0,0,0.1)]"
            style={{
              width: `${fittedCanvasWidth}px`,
              height: `${fittedCanvasHeight}px`,
              left: `${fittedCanvasLeft}px`,
              top: `${viewportStyles.top}px`,
            }}
          >
            {/* Operations layer - alignment lines and selection handles */}
            <div className="operates absolute top-0 left-0 w-full h-full pointer-events-none">
              {/* Alignment lines */}
              {alignmentLines.map((line, index) => (
                <AlignmentLine
                  key={`${line.type}-${line.axis.x}-${line.axis.y}-${index}`}
                  type={line.type}
                  axis={line.axis}
                  length={line.length}
                  canvasScale={fittedCanvasScale}
                />
              ))}

              {/* Multi-select operations */}
              {activeElementIdList.length > 1 && (
                <MultiSelectOperate
                  elementList={elementList}
                  scaleMultiElement={scaleMultiElement}
                />
              )}

              {/* Single element operations */}
              {elementList.map(
                (element: PPTElement) =>
                  !hiddenElementIdList.includes(element.id) && (
                    <Operate
                      key={element.id}
                      elementInfo={element}
                      isSelected={activeElementIdList.includes(element.id)}
                      isActive={handleElementId === element.id}
                      isActiveGroupElement={activeGroupElementId === element.id}
                      isMultiSelect={activeElementIdList.length > 1}
                      rotateElement={rotateElement}
                      scaleElement={scaleElement}
                      dragLineElement={dragLineElement}
                      moveShapeKeypoint={moveShapeKeypoint}
                      openLinkDialog={openLinkDialog}
                    />
                  ),
              )}

              <ViewportBackground />
            </div>

            {/* Viewport - the actual slide canvas */}
            <div
              ref={viewportRef}
              className="viewport absolute top-0 left-0 origin-top-left"
              style={{
                width: `${viewportStyles.width}px`,
                height: `${contentHeight}px`,
                transform: `scale(${fittedCanvasScale})`,
              }}
            >
              {/* Grid lines */}
              {gridLineSize > 0 && <GridLines />}

              {/* Mouse selection rectangle */}
              {mouseSelectionVisible && (
                <MouseSelection
                  top={mouseSelection.top}
                  left={mouseSelection.left}
                  width={mouseSelection.width}
                  height={mouseSelection.height}
                  quadrant={mouseSelectionQuadrant}
                  canvasScale={fittedCanvasScale}
                />
              )}

              {/* Render all elements */}
              {elementList.map((element: PPTElement, index: number) =>
                !hiddenElementIdList.includes(element.id) ? (
                  <EditableElement
                    key={element.id}
                    elementInfo={element}
                    elementIndex={index + 1}
                    isMultiSelect={activeElementIdList.length > 1}
                    selectElement={selectElement}
                    openLinkDialog={openLinkDialog}
                  />
                ) : null,
              )}

              <FlowTimelineOverlay
                elements={elementList}
                viewportWidth={viewportStyles.width}
                contentHeight={contentHeight}
              />
            </div>
          </div>

          {/* Ruler */}
          {showRuler && <Ruler viewportStyles={viewportStyles} elementList={elementList} />}

          </CanvasViewportMetricsProvider>

          {/* Drag mask when space key is pressed */}
          {spaceKeyState && <div className="drag-mask absolute inset-0 cursor-grab" />}

          {/* TODO: Add LinkDialog modal */}
          {linkDialogVisible && <div>LinkDialog placeholder</div>}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {contextmenus().map((item, index) => {
          if (item.divider) {
            return <ContextMenuSeparator key={index} />;
          }

          // If has children, use submenu component
          if (item.children && item.children.length > 0) {
            return (
              <ContextMenuSub key={index}>
                <ContextMenuSubTrigger disabled={item.disable} hidden={item.hide}>
                  {item.text}
                  {item.subText && <ContextMenuShortcut>{item.subText}</ContextMenuShortcut>}
                </ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  {item.children.map((child, childIndex) =>
                    child.divider ? (
                      <ContextMenuSeparator key={childIndex} />
                    ) : (
                      <ContextMenuItem
                        key={childIndex}
                        onClick={(e) => {
                          e.stopPropagation();
                          child.handler?.();
                        }}
                        disabled={child.disable}
                        hidden={child.hide}
                      >
                        {child.text}
                        {child.subText && (
                          <ContextMenuShortcut>{child.subText}</ContextMenuShortcut>
                        )}
                      </ContextMenuItem>
                    ),
                  )}
                </ContextMenuSubContent>
              </ContextMenuSub>
            );
          }

          // Regular menu item
          return (
            <ContextMenuItem
              key={index}
              onClick={(e) => {
                e.stopPropagation();
                item.handler?.();
              }}
              disabled={item.disable}
              hidden={item.hide}
            >
              {item.text}
              {item.subText && <ContextMenuShortcut>{item.subText}</ContextMenuShortcut>}
            </ContextMenuItem>
          );
        })}
      </ContextMenuContent>
    </ContextMenu>
  );
}

export default Canvas;
