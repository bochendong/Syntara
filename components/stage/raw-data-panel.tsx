import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { SceneType } from '@/lib/types/stage';
import type { RawSlideDataView } from '@/components/stage/raw-view-helpers';

export function RawDataPanel({
  rawDataTabTypes,
  rawDataSubTab,
  onRawDataSubTabChange,
  rawSlideDataView,
  onRawSlideDataViewChange,
  rawDataCaption,
  sceneTypeLabel,
  canReflowCurrentGridScene,
  canReflowCurrentLayoutCardsScene,
  gridReflowPending,
  onReflowCurrentGridScene,
  onReflowCurrentLayoutCardsScene,
  rawTypePayloadJson,
}: {
  rawDataTabTypes: SceneType[];
  rawDataSubTab: SceneType;
  onRawDataSubTabChange: (tab: SceneType) => void;
  rawSlideDataView: RawSlideDataView;
  onRawSlideDataViewChange: (view: RawSlideDataView) => void;
  rawDataCaption: string;
  sceneTypeLabel: (tabType: SceneType) => string;
  canReflowCurrentGridScene: boolean;
  canReflowCurrentLayoutCardsScene: boolean;
  gridReflowPending: boolean;
  onReflowCurrentGridScene: () => void;
  onReflowCurrentLayoutCardsScene: () => void;
  rawTypePayloadJson: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950 text-slate-100">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
        <div
          className="flex flex-wrap gap-0.5 rounded-lg bg-white/5 p-0.5"
          role="tablist"
          aria-label={rawDataCaption}
        >
          {rawDataTabTypes.map((tabType) => (
            <button
              key={tabType}
              type="button"
              role="tab"
              aria-selected={rawDataSubTab === tabType}
              onClick={() => onRawDataSubTabChange(tabType)}
              className={cn(
                'rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
                rawDataSubTab === tabType
                  ? 'bg-white/15 text-white'
                  : 'text-slate-400 hover:text-slate-200',
              )}
            >
              {sceneTypeLabel(tabType)}
            </button>
          ))}
        </div>
        {rawDataSubTab === 'slide' ? (
          <div
            className="flex flex-wrap gap-0.5 rounded-lg bg-white/5 p-0.5"
            role="tablist"
            aria-label="幻灯片原始数据视图"
          >
            <RawSlideDataButton
              active={rawSlideDataView === 'source'}
              onClick={() => onRawSlideDataViewChange('source')}
            >
              生成源
            </RawSlideDataButton>
            <RawSlideDataButton
              active={rawSlideDataView === 'compiled'}
              onClick={() => onRawSlideDataViewChange('compiled')}
            >
              编译结果
            </RawSlideDataButton>
            <RawSlideDataButton
              active={rawSlideDataView === 'render'}
              onClick={() => onRawSlideDataViewChange('render')}
            >
              渲染摘要
            </RawSlideDataButton>
            <RawSlideDataButton
              active={rawSlideDataView === 'outline'}
              onClick={() => onRawSlideDataViewChange('outline')}
            >
              大纲
            </RawSlideDataButton>
            <RawSlideDataButton
              active={rawSlideDataView === 'narration'}
              onClick={() => onRawSlideDataViewChange('narration')}
            >
              讲解数据
            </RawSlideDataButton>
            <RawSlideDataButton
              active={rawSlideDataView === 'ui'}
              onClick={() => onRawSlideDataViewChange('ui')}
            >
              UI计算
            </RawSlideDataButton>
            <button
              type="button"
              onClick={onReflowCurrentGridScene}
              disabled={!canReflowCurrentGridScene || gridReflowPending}
              className={cn(
                'rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
                canReflowCurrentGridScene && !gridReflowPending
                  ? 'bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                  : 'cursor-not-allowed text-slate-500',
              )}
            >
              {gridReflowPending ? '重排中…' : '仅重排 Grid'}
            </button>
            <button
              type="button"
              onClick={onReflowCurrentLayoutCardsScene}
              disabled={!canReflowCurrentLayoutCardsScene || gridReflowPending}
              className={cn(
                'rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
                canReflowCurrentLayoutCardsScene && !gridReflowPending
                  ? 'bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30'
                  : 'cursor-not-allowed text-slate-500',
              )}
            >
              {gridReflowPending ? '重排中…' : '仅重排 Layout Cards'}
            </button>
          </div>
        ) : null}
        <p className="ml-auto min-w-0 text-[10px] text-slate-500">{rawDataCaption}</p>
      </div>
      {rawDataSubTab === 'slide' ? (
        <div className="border-b border-white/10 px-4 py-2 text-[11px] leading-relaxed text-slate-400">
          {RAW_SLIDE_VIEW_DESCRIPTIONS[rawSlideDataView]}
        </div>
      ) : null}
      <pre className="min-h-0 flex-1 overflow-auto p-4 text-[11px] leading-relaxed whitespace-pre-wrap break-words font-mono">
        {rawTypePayloadJson}
      </pre>
    </div>
  );
}

const RAW_SLIDE_VIEW_DESCRIPTIONS: Record<RawSlideDataView, string> = {
  source:
    '生成源：模型输出或从语义文档还原的 Notebook LaTeX，适合检查 \\begin{frame}、\\begin{slide}、\\definition、\\block 等块结构。',
  compiled: '编译结果：Notebook LaTeX 解析后的 contentDocument，适合检查内容语义和版式意图。',
  render: '渲染摘要：语义文档生成画布后的摘要，适合检查元素数量、主题和渲染模式。',
  outline: '大纲：本页来自课程规划阶段的章节目标和生成提示上下文。',
  narration: '讲解数据：本页绑定的 speech、spotlight、laser 等课堂动作。',
  ui: 'UI 计算：最终进入画布的完整 scene/canvas/elements 数据。',
};

function RawSlideDataButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
        active ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-slate-200',
      )}
    >
      {children}
    </button>
  );
}
