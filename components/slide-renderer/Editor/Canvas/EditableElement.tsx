import { useMemo } from 'react';
import { ElementTypes, type PPTElement } from '@/lib/types/slides';
import { ImageElement } from '../../components/element/ImageElement';
import { LineElement } from '../../components/element/LineElement';
import { ChartElement } from '../../components/element/ChartElement';
import { TableElement } from '../../components/element/TableElement';
import { VideoElement } from '../../components/element/VideoElement';
import { BaseTextElement } from '../../components/element/TextElement/BaseTextElement';
import { BaseShapeElement } from '../../components/element/ShapeElement/BaseShapeElement';
import { BaseLatexElement } from '../../components/element/LatexElement/BaseLatexElement';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { ElementOrderCommands, ElementAlignCommands } from '@/lib/types/edit';
import { useCanvasOperations } from '@/lib/hooks/use-canvas-operations';

export interface ContextmenuItem {
  text?: string;
  subText?: string;
  divider?: boolean;
  disable?: boolean;
  hide?: boolean;
  children?: ContextmenuItem[];
  handler?: () => void;
}

interface EditableElementProps {
  readonly elementInfo: PPTElement;
  readonly elementIndex: number;
  readonly isMultiSelect: boolean;
  readonly selectElement: (
    e: React.MouseEvent | React.TouchEvent,
    element: PPTElement,
    canMove?: boolean,
  ) => void;
  readonly openLinkDialog: () => void;
}

export function EditableElement({
  elementInfo,
  elementIndex,
  isMultiSelect,
  selectElement,
  openLinkDialog,
}: EditableElementProps) {
  const { component: CurrentElementComponent, readonlyPreview = false } = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- element components have varying prop signatures
    const elementTypeMap: Record<string, { component: any; readonlyPreview?: boolean }> = {
      [ElementTypes.IMAGE]: { component: ImageElement },
      [ElementTypes.TEXT]: { component: BaseTextElement, readonlyPreview: true },
      [ElementTypes.SHAPE]: { component: BaseShapeElement, readonlyPreview: true },
      [ElementTypes.LINE]: { component: LineElement },
      [ElementTypes.CHART]: { component: ChartElement },
      [ElementTypes.LATEX]: { component: BaseLatexElement, readonlyPreview: true },
      [ElementTypes.TABLE]: { component: TableElement },
      [ElementTypes.VIDEO]: { component: VideoElement },
      // TODO: Add other element types
      // [ElementTypes.AUDIO]: AudioElement,
    };
    return elementTypeMap[elementInfo.type] || { component: null, readonlyPreview: false };
  }, [elementInfo.type]);

  const {
    copyElement,
    pasteElement,
    cutElement,
    deleteElement,
    lockElement,
    unlockElement,
    selectAllElements,
    alignElementToCanvas,
    orderElement,
    combineElements,
    uncombineElements,
  } = useCanvasOperations();

  const contextmenus = (): ContextmenuItem[] => {
    if (elementInfo.lock) {
      return [
        {
          text: '解锁',
          handler: () => unlockElement(elementInfo),
        },
      ];
    }

    return [
      {
        text: '剪切',
        subText: 'Ctrl + X',
        handler: cutElement,
      },
      {
        text: '复制',
        subText: 'Ctrl + C',
        handler: copyElement,
      },
      {
        text: '粘贴',
        subText: 'Ctrl + V',
        handler: pasteElement,
      },
      { divider: true },
      {
        text: '水平居中',
        handler: () => alignElementToCanvas(ElementAlignCommands.HORIZONTAL),
        children: [
          {
            text: '水平垂直居中',
            handler: () => alignElementToCanvas(ElementAlignCommands.CENTER),
          },
          {
            text: '水平居中',
            handler: () => alignElementToCanvas(ElementAlignCommands.HORIZONTAL),
          },
          {
            text: '左对齐',
            handler: () => alignElementToCanvas(ElementAlignCommands.LEFT),
          },
          {
            text: '右对齐',
            handler: () => alignElementToCanvas(ElementAlignCommands.RIGHT),
          },
        ],
      },
      {
        text: '垂直居中',
        handler: () => alignElementToCanvas(ElementAlignCommands.VERTICAL),
        children: [
          {
            text: '水平垂直居中',
            handler: () => alignElementToCanvas(ElementAlignCommands.CENTER),
          },
          {
            text: '垂直居中',
            handler: () => alignElementToCanvas(ElementAlignCommands.VERTICAL),
          },
          {
            text: '顶部对齐',
            handler: () => alignElementToCanvas(ElementAlignCommands.TOP),
          },
          {
            text: '底部对齐',
            handler: () => alignElementToCanvas(ElementAlignCommands.BOTTOM),
          },
        ],
      },
      { divider: true },
      {
        text: '置于顶层',
        disable: isMultiSelect && !elementInfo.groupId,
        handler: () => orderElement(elementInfo, ElementOrderCommands.TOP),
        children: [
          {
            text: '置于顶层',
            handler: () => orderElement(elementInfo, ElementOrderCommands.TOP),
          },
          {
            text: '上移一层',
            handler: () => orderElement(elementInfo, ElementOrderCommands.UP),
          },
        ],
      },
      {
        text: '置于底层',
        disable: isMultiSelect && !elementInfo.groupId,
        handler: () => orderElement(elementInfo, ElementOrderCommands.BOTTOM),
        children: [
          {
            text: '置于底层',
            handler: () => orderElement(elementInfo, ElementOrderCommands.BOTTOM),
          },
          {
            text: '下移一层',
            handler: () => orderElement(elementInfo, ElementOrderCommands.DOWN),
          },
        ],
      },
      { divider: true },
      {
        text: '设置链接',
        handler: openLinkDialog,
        disable: true,
      },
      {
        text: elementInfo.groupId ? '取消组合' : '组合',
        subText: 'Ctrl + G',
        handler: elementInfo.groupId ? uncombineElements : combineElements,
        hide: !isMultiSelect,
      },
      {
        text: '全选',
        subText: 'Ctrl + A',
        handler: selectAllElements,
      },
      {
        text: '锁定',
        subText: 'Ctrl + L',
        handler: lockElement,
      },
      {
        text: '删除',
        subText: 'Delete',
        handler: deleteElement,
      },
    ];
  };

  const handleReadonlyPreviewSelect = (e: React.MouseEvent | React.TouchEvent) => {
    if (!readonlyPreview || elementInfo.lock) return;
    e.stopPropagation();
    selectElement(e, elementInfo);
  };

  if (!CurrentElementComponent) {
    return (
      <div
        id={`editable-element-${elementInfo.id}`}
        className="editable-element absolute"
        style={{
          zIndex: elementIndex,
          left: elementInfo.left + 'px',
          top: elementInfo.top + 'px',
          width: elementInfo.width + 'px',
        }}
      >
        <div className="p-2 bg-gray-100 border border-gray-300 text-xs text-gray-500">
          {elementInfo.type} element (not implemented)
        </div>
      </div>
    );
  }

  return (
    <div
      id={`editable-element-${elementInfo.id}`}
      className="editable-element absolute"
      style={{
        zIndex: elementIndex,
      }}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            onMouseDownCapture={readonlyPreview ? handleReadonlyPreviewSelect : undefined}
            onTouchStartCapture={readonlyPreview ? handleReadonlyPreviewSelect : undefined}
          >
            <CurrentElementComponent
              elementInfo={elementInfo}
              selectElement={readonlyPreview ? undefined : selectElement}
            />
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
    </div>
  );
}
