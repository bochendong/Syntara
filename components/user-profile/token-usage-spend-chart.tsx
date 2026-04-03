'use client';

import { useMemo } from 'react';
import { formatUsdLabel } from '@/lib/utils/credits';

type SpendChartData = {
  periodLabel: string;
  startDate: string;
  endDate: string;
  dates: Array<{
    date: string;
    label: string;
  }>;
  series: Array<{
    modelString: string;
    estimatedCostUsd: number;
    estimatedCostCredits: number;
    cumulativeEstimatedCostUsd: number[];
    cumulativeEstimatedCostCredits: number[];
  }>;
  totalEstimatedCostUsd: number;
  totalEstimatedCostCredits: number;
};

const CHART_COLORS = [
  '#4D9B7D',
  '#8EA8D2',
  '#5E7EB6',
  '#B58BB2',
  '#A8C28A',
  '#E0BC77',
  '#D58E79',
  '#C17373',
  '#A7A7A7',
];

const SVG_WIDTH = 960;
const SVG_HEIGHT = 360;
const PADDING = {
  top: 18,
  right: 18,
  bottom: 42,
  left: 70,
};

function formatCompactUsd(value: number) {
  return formatUsdLabel(value).replace('US$', '$');
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '');
  const full = normalized.length === 3 ? normalized.split('').map((c) => `${c}${c}`).join('') : normalized;
  const value = parseInt(full, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildLinePath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return '';
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

function buildAreaPath(
  topPoints: Array<{ x: number; y: number }>,
  bottomPoints: Array<{ x: number; y: number }>,
) {
  if (topPoints.length === 0) return '';
  const topPath = buildLinePath(topPoints);
  const bottomPath = [...bottomPoints]
    .reverse()
    .map((point) => `L ${point.x} ${point.y}`)
    .join(' ');
  return `${topPath} ${bottomPath} Z`;
}

export function TokenUsageSpendChart({ data }: { data: SpendChartData | null | undefined }) {
  const chart = useMemo(() => {
    if (!data || data.series.length === 0 || data.dates.length === 0) {
      return null;
    }

    const chartWidth = SVG_WIDTH - PADDING.left - PADDING.right;
    const chartHeight = SVG_HEIGHT - PADDING.top - PADDING.bottom;
    const xCount = data.dates.length;

    const getX = (index: number) =>
      xCount <= 1 ? PADDING.left + chartWidth / 2 : PADDING.left + (index * chartWidth) / (xCount - 1);

    const stackedSeries = data.series.map((series, seriesIndex) => {
      const previousStack = series.cumulativeEstimatedCostUsd.map((_, pointIndex) =>
        data.series
          .slice(0, seriesIndex)
          .reduce((sum, previousSeries) => sum + previousSeries.cumulativeEstimatedCostUsd[pointIndex], 0),
      );
      const currentStack = series.cumulativeEstimatedCostUsd.map(
        (value, pointIndex) => previousStack[pointIndex] + value,
      );
      return { ...series, previousStack, currentStack };
    });

    const maxY = Math.max(
      1,
      ...stackedSeries.flatMap((series) => series.currentStack),
    );
    const getY = (value: number) =>
      PADDING.top + chartHeight - (Math.max(0, value) / maxY) * chartHeight;

    const renderedSeries = stackedSeries.map((series, index) => {
      const topPoints = series.currentStack.map((value, pointIndex) => ({
        x: getX(pointIndex),
        y: getY(value),
      }));
      const bottomPoints = series.previousStack.map((value, pointIndex) => ({
        x: getX(pointIndex),
        y: getY(value),
      }));
      return {
        ...series,
        color: CHART_COLORS[index % CHART_COLORS.length],
        areaPath: buildAreaPath(topPoints, bottomPoints),
        linePath: buildLinePath(topPoints),
        lastPoint: topPoints[topPoints.length - 1],
      };
    });

    const gridLines = Array.from({ length: 4 }, (_, index) => {
      const step = 3 - index;
      const value = (maxY / 3) * step;
      return {
        value,
        y: getY(value),
      };
    });

    const xLabelIndexes = data.dates
      .map((_, index) => index)
      .filter((index) => {
        if (index === 0 || index === data.dates.length - 1) return true;
        return index % Math.max(1, Math.floor(data.dates.length / 6)) === 0;
      });

    const totalLine = stackedSeries.length > 0 ? stackedSeries[stackedSeries.length - 1] : null;
    const todayX = totalLine ? getX(data.dates.length - 1) : null;
    const todayY = totalLine ? getY(totalLine.currentStack[totalLine.currentStack.length - 1] ?? 0) : null;

    return {
      renderedSeries,
      gridLines,
      xLabelIndexes,
      maxY,
      getX,
      getY,
      todayX,
      todayY,
    };
  }, [data]);

  if (!data || !chart) {
    return (
      <div className="rounded-xl border border-dashed border-muted-foreground/25 bg-background/50 px-4 py-12 text-center text-xs text-muted-foreground">
        近 30 天暂无可绘制的累计 spend 数据。
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-background/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Your Usage</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {data.periodLabel}按模型累计 spend，便于看出每种模型的真实花费走势
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="rounded-full border bg-background px-2.5 py-1 text-muted-foreground">
            By Model
          </span>
          <span className="rounded-full border bg-background px-2.5 py-1 text-muted-foreground">
            Spend
          </span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border bg-white/70 px-3 py-2 dark:bg-slate-950/30">
          <div className="text-[11px] text-muted-foreground">周期</div>
          <div className="mt-1 text-sm font-medium text-foreground">{data.periodLabel}</div>
        </div>
        <div className="rounded-xl border bg-white/70 px-3 py-2 dark:bg-slate-950/30">
          <div className="text-[11px] text-muted-foreground">累计花费</div>
          <div className="mt-1 text-sm font-medium text-foreground">
            {formatUsdLabel(data.totalEstimatedCostUsd)}
          </div>
        </div>
        <div className="rounded-xl border bg-white/70 px-3 py-2 dark:bg-slate-950/30">
          <div className="text-[11px] text-muted-foreground">开始</div>
          <div className="mt-1 text-sm font-medium text-foreground">{data.startDate}</div>
        </div>
        <div className="rounded-xl border bg-white/70 px-3 py-2 dark:bg-slate-950/30">
          <div className="text-[11px] text-muted-foreground">结束</div>
          <div className="mt-1 text-sm font-medium text-foreground">{data.endDate}</div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border bg-white/80 p-3 dark:bg-slate-950/25">
        <div className="flex flex-wrap gap-x-5 gap-y-2 pb-3 text-[11px] text-muted-foreground">
          {chart.renderedSeries.map((series) => (
            <div key={series.modelString} className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-3.5 rounded-sm"
                style={{ backgroundColor: series.color }}
              />
              <span>{series.modelString}</span>
            </div>
          ))}
        </div>

        <svg viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} className="h-[360px] w-full">
          <rect
            x={PADDING.left}
            y={PADDING.top}
            width={SVG_WIDTH - PADDING.left - PADDING.right}
            height={SVG_HEIGHT - PADDING.top - PADDING.bottom}
            fill="transparent"
          />

          {chart.gridLines.map((line) => (
            <g key={line.value}>
              <line
                x1={PADDING.left}
                x2={SVG_WIDTH - PADDING.right}
                y1={line.y}
                y2={line.y}
                stroke="rgba(148, 163, 184, 0.22)"
                strokeWidth="1"
              />
              <text
                x={PADDING.left - 12}
                y={line.y + 4}
                textAnchor="end"
                fontSize="12"
                fill="#6b7280"
              >
                {formatCompactUsd(line.value)}
              </text>
            </g>
          ))}

          <text
            x="18"
            y={SVG_HEIGHT / 2}
            transform={`rotate(-90 18 ${SVG_HEIGHT / 2})`}
            fontSize="12"
            fill="#6b7280"
          >
            Cumulative Spend
          </text>

          {chart.renderedSeries.map((series) => (
            <g key={series.modelString}>
              <path d={series.areaPath} fill={hexToRgba(series.color, 0.28)} />
              <path
                d={series.linePath}
                fill="none"
                stroke={series.color}
                strokeWidth="3"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </g>
          ))}

          {chart.todayX != null ? (
            <g>
              <line
                x1={chart.todayX}
                x2={chart.todayX}
                y1={PADDING.top}
                y2={SVG_HEIGHT - PADDING.bottom}
                stroke="#6b7280"
                strokeDasharray="6 6"
                strokeWidth="1.5"
              />
              <rect
                x={chart.todayX - 22}
                y={Math.max(PADDING.top, (chart.todayY ?? PADDING.top) - 34)}
                width="44"
                height="22"
                rx="8"
                fill="#e5e7eb"
              />
              <text
                x={chart.todayX}
                y={Math.max(PADDING.top + 15, (chart.todayY ?? PADDING.top) - 19)}
                textAnchor="middle"
                fontSize="12"
                fill="#374151"
              >
                Today
              </text>
            </g>
          ) : null}

          {chart.xLabelIndexes.map((index) => (
            <text
              key={data.dates[index]?.date || index}
              x={chart.getX(index)}
              y={SVG_HEIGHT - 12}
              textAnchor="middle"
              fontSize="12"
              fill="#6b7280"
            >
              {data.dates[index]?.label}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}
