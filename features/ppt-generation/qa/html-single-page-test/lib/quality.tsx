import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

import { getFoundAnchors, getMissingAnchors, normalizeAnchorText } from './dom-analysis';
import { formatPercent } from './format';
import {
  getPresetCanvasHeight,
  getPresetCanvasMode,
  shouldUseGeneratedIllustration,
} from './presets';
import type {
  DensityProfile,
  HtmlSinglePagePreset,
  PreviewStats,
  QualityCheck,
  QualityStatus,
  StoredQuality,
  StoredRun,
} from './types';

export function getRangeStatus(value: number, min: number, max: number): QualityStatus {
  if (value >= min && value <= max) return 'pass';
  const looseMin = min * 0.75;
  const looseMax = max * 1.25;
  return value >= looseMin && value <= looseMax ? 'warn' : 'fail';
}

export function describeRange(value: number, min: number, max: number, unit = ''): string {
  return `当前 ${Math.round(value)}${unit}，目标 ${Math.round(min)}-${Math.round(max)}${unit}`;
}

export function getSmallTextRatio(
  stats: PreviewStats,
  thresholdPx: DensityProfile['smallTextThresholdPx'],
) {
  if (thresholdPx === 20) return stats.smallTextRatioUnder20;
  if (thresholdPx === 22) return stats.smallTextRatioUnder22;
  return stats.smallTextRatioUnder24;
}

export function statusIcon(status: QualityStatus) {
  if (status === 'pass') return <CheckCircle2 className="size-4 text-emerald-600" />;
  if (status === 'warn') return <AlertTriangle className="size-4 text-amber-600" />;
  return <XCircle className="size-4 text-red-600" />;
}

export function summarizeChecks(checks: QualityCheck[]) {
  const failed = checks.filter((check) => check.status === 'fail').length;
  const warned = checks.filter((check) => check.status === 'warn').length;
  return { total: checks.length, failed, warned, passed: checks.length - failed - warned };
}

export function buildQualityChecks(
  preset: HtmlSinglePagePreset,
  stats: PreviewStats,
): QualityCheck[] {
  const { kind } = preset;
  const density = preset.densityProfile;
  const canvasMode = getPresetCanvasMode(preset);
  const canvasHeight = getPresetCanvasHeight(preset);
  const sizeStatus: QualityStatus =
    canvasMode === 'long'
      ? stats.scrollWidth > 1601 || stats.scrollHeight > canvasHeight + 120
        ? 'fail'
        : stats.scrollHeight < canvasHeight * 0.72
          ? 'warn'
          : 'pass'
      : stats.scrollWidth <= 1601 && stats.scrollHeight <= 901
        ? 'pass'
        : 'fail';
  const smallTextRatio = getSmallTextRatio(stats, density.smallTextThresholdPx);
  const checks: QualityCheck[] = [
    {
      status: stats.slideCount === 1 && stats.hasSlideContent ? 'pass' : 'fail',
      label: 'HTML PPT 结构',
      detail: `需要 exactly one .slide + .slide-content；当前 slide=${stats.slideCount}，content=${stats.hasSlideContent ? '有' : '缺'}。`,
    },
    {
      status: sizeStatus,
      label: canvasMode === 'long' ? '1600 同宽长页' : '16:9 一屏',
      detail:
        canvasMode === 'long'
          ? `iframe scroll=${stats.scrollWidth || '-'} x ${stats.scrollHeight || '-'}，目标宽 1600，高度约 ${canvasHeight}，允许纵向长页但不允许横向滚动。`
          : `iframe scroll=${stats.scrollWidth || '-'} x ${stats.scrollHeight || '-'}，目标是 1600 x 900 且无滚动。`,
    },
    {
      status: stats.outOfBoundsCount === 0 ? 'pass' : 'fail',
      label: '无越界元素',
      detail:
        stats.outOfBoundsCount === 0
          ? canvasMode === 'long'
            ? `所有可见元素都在 1600 x ${canvasHeight} 长页面画布内。`
            : '所有可见元素都在 1600 x 900 内。'
          : `发现 ${stats.outOfBoundsCount} 个越界元素：${stats.outOfBoundsSamples.join(' / ')}`,
    },
    {
      status: stats.scriptLikeCount === 0 ? 'pass' : 'fail',
      label: '静态可编辑 HTML',
      detail:
        stats.scriptLikeCount === 0
          ? '没有 script/iframe/form/object/embed 等不适合 PPT 导入的节点。'
          : `发现 ${stats.scriptLikeCount} 个不应出现的动态/嵌入节点。`,
    },
    {
      status:
        canvasMode === 'long'
          ? stats.maxTextLength <= 520
            ? 'pass'
            : stats.maxTextLength <= 720
              ? 'warn'
              : 'fail'
          : stats.maxTextLength <= 220
            ? 'pass'
            : stats.maxTextLength <= 320
              ? 'warn'
              : 'fail',
      label: '文本块预算',
      detail:
        canvasMode === 'long'
          ? `最长文本块 ${stats.maxTextLength} 字符；长页面可以更完整，但仍要分 section，不要变成整段讲义。`
          : `最长文本块 ${stats.maxTextLength} 字符；HTML 单页不能变成网页长文。`,
    },
    {
      status: getRangeStatus(stats.visibleCharCount, density.textChars.min, density.textChars.max),
      label: '内容密度：字数',
      detail: `${describeRange(stats.visibleCharCount, density.textChars.min, density.textChars.max, ' 字符')}；${density.guidance}`,
    },
    {
      status: getRangeStatus(stats.textNodeCount, density.textBlocks.min, density.textBlocks.max),
      label: '内容密度：块数',
      detail: `${describeRange(stats.textNodeCount, density.textBlocks.min, density.textBlocks.max, ' 块')}；文本节点过少会空，过多会碎。`,
    },
    {
      status: getRangeStatus(
        stats.contentCoverageRatio,
        density.contentCoverage.min,
        density.contentCoverage.max,
      ),
      label: '内容密度：版面覆盖',
      detail: `主要内容覆盖 ${formatPercent(stats.contentCoverageRatio)}，目标 ${formatPercent(density.contentCoverage.min)}-${formatPercent(density.contentCoverage.max)}；太低像空白页，太高容易挤压。`,
    },
    {
      status:
        smallTextRatio <= density.maxSmallTextRatio
          ? 'pass'
          : smallTextRatio <= density.maxSmallTextRatio + 0.15
            ? 'warn'
            : 'fail',
      label: '内容密度：可读字号',
      detail: `低于 ${density.smallTextThresholdPx}px 的文字占 ${formatPercent(smallTextRatio)}，上限 ${formatPercent(density.maxSmallTextRatio)}；不要靠缩小字号硬塞内容。`,
    },
    {
      status: stats.sparseLargeContainerCount === 0 ? 'pass' : 'fail',
      label: '内容密度：空大容器',
      detail:
        stats.sparseLargeContainerCount === 0
          ? '没有发现用巨大空卡片制造版面覆盖的情况。'
          : `发现 ${stats.sparseLargeContainerCount} 个大容器信息不足：${stats.sparseLargeContainerSamples.join(' / ')}。`,
    },
  ];

  if (shouldUseGeneratedIllustration(preset)) {
    checks.push({
      status: stats.imageCount === 1 && stats.largeImageCount >= 1 ? 'pass' : 'fail',
      label: 'AI 插图区',
      detail:
        stats.imageCount === 1 && stats.largeImageCount >= 1
          ? '已使用 1 张 AI 插图，并放在明确的页面插图区内。'
          : `需要 exactly one 页面内插图；当前 img=${stats.imageCount}，大插图=${stats.largeImageCount}。`,
    });
  }

  const missingAnchors = getMissingAnchors(stats.visibleText, preset.requiredAnchors);
  checks.push({
    status: missingAnchors.length === 0 ? 'pass' : 'fail',
    label: 'Prompt 贴合度',
    detail:
      missingAnchors.length === 0
        ? `已覆盖关键锚点：${preset.requiredAnchors.join(' / ')}。`
        : `缺少关键锚点：${missingAnchors.join(' / ')}。`,
  });

  const foundForbiddenAnchors = getFoundAnchors(stats.visibleText, preset.forbiddenAnchors);
  if (preset.forbiddenAnchors && preset.forbiddenAnchors.length > 0) {
    checks.push({
      status: foundForbiddenAnchors.length === 0 ? 'pass' : 'fail',
      label: '无旧主题污染',
      detail:
        foundForbiddenAnchors.length === 0
          ? '没有发现旧主题或其他页面类型的关键词。'
          : `发现不应出现的关键词：${foundForbiddenAnchors.join(' / ')}。`,
    });
  }

  if (kind !== 'math') {
    checks.push({
      status: stats.mathCount === 0 ? 'pass' : 'fail',
      label: '页面类型不跑偏',
      detail:
        stats.mathCount === 0
          ? '非数学页没有混入 MathML 公式。'
          : `当前是 ${kind} 页，却出现 ${stats.mathCount} 个 MathML；这通常意味着模型混入了无关公式或题目。`,
    });
  }

  if (kind === 'cover') {
    const hasCoverTitle = stats.headingCount >= 1 || stats.visibleText.includes('函数与证明习惯');
    const hasCoverTags =
      stats.visibleText.includes('证明入门') || stats.visibleText.includes('结构化思考');
    checks.push({
      status: hasCoverTitle && hasCoverTags ? 'pass' : 'warn',
      label: '封面页结构',
      detail: `需要大标题 + 副标题/标签 + 主视觉；当前 heading=${stats.headingCount}，标题=${hasCoverTitle ? '有' : '缺'}，标签=${hasCoverTags ? '有' : '缺'}。`,
    });
  }

  if (kind === 'intro') {
    const hasIntroTitle = stats.headingCount >= 1 || stats.visibleText.includes('为什么要学习导数');
    checks.push({
      status: hasIntroTitle && stats.cardishCount + stats.listItemCount >= 3 ? 'pass' : 'warn',
      label: '介绍页结构',
      detail: `需要标题 + 3-4 个入口块；当前 heading=${stats.headingCount}，主标题=${hasIntroTitle ? '有' : '缺'}，block/list=${stats.cardishCount + stats.listItemCount}。`,
    });
  }

  if (kind === 'summary') {
    const summarySignals = stats.cardishCount + stats.listItemCount;
    checks.push({
      status: summarySignals >= 3 && summarySignals <= 8 ? 'pass' : 'fail',
      label: '总结页结构',
      detail: `需要 3-4 条 takeaway，结构块不能膨胀；当前 card/list 信号=${summarySignals}。`,
    });
  }

  if (kind === 'process') {
    const stepSignals = Math.max(stats.stepishCount, stats.listItemCount);
    checks.push({
      status: stepSignals >= 4 && stepSignals <= 6 ? 'pass' : 'fail',
      label: '流程页结构',
      detail: `需要 4-5 个可见步骤容器，最多允许 1 个辅助节点；当前 step 容器=${stats.stepishCount}，list item=${stats.listItemCount}。`,
    });
  }

  if (kind === 'table') {
    checks.push({
      status: stats.tableCount >= 1 ? 'pass' : 'fail',
      label: '表格页结构',
      detail: `需要真实 HTML table；当前 table=${stats.tableCount}。`,
    });
    checks.push({
      status: stats.tableRowCount >= 4 && stats.tableRowCount <= 7 ? 'pass' : 'warn',
      label: '表格行预算',
      detail: `当前 table rows=${stats.tableRowCount}；目标含表头约 4-7 行。`,
    });
  }

  if (kind === 'math') {
    const minMathCount = canvasMode === 'long' ? 5 : 3;
    checks.push({
      status: stats.mathCount >= minMathCount ? 'pass' : 'fail',
      label: 'MathML 公式',
      detail: `数学页需要真实 <math>，当前 math=${stats.mathCount}，目标至少 ${minMathCount}。`,
    });
    checks.push({
      status: stats.mspaceCount === 0 ? 'pass' : 'fail',
      label: '无 mspace 撑版',
      detail:
        stats.mspaceCount === 0
          ? '没有发现 <mspace>。'
          : `发现 ${stats.mspaceCount} 个 <mspace>，容易导致公式空白和溢出。`,
    });
  }

  if (kind === 'code') {
    const minTraceSignals = canvasMode === 'long' ? 5 : 3;
    const minTraceRows = canvasMode === 'long' ? 5 : 4;
    const isMemoryTrace = preset.codeRoute === 'memory-trace';
    checks.push({
      status: stats.preCount > 0 || stats.codeCount > 0 ? 'pass' : 'fail',
      label: '代码块',
      detail: `需要 editable pre/code；当前 pre=${stats.preCount}，code=${stats.codeCount}。`,
    });
    if (isMemoryTrace) {
      const text = normalizeAnchorText(stats.visibleText);
      const hasStack =
        text.includes('调用栈') || text.includes('callstack') || text.includes('stack');
      const hasHeap = text.includes('堆') || text.includes('heap');
      const hasReference =
        text.includes('引用') ||
        text.includes('指向') ||
        text.includes('->') ||
        text.includes('同一个');
      checks.push({
        status: hasStack && hasHeap && hasReference ? 'pass' : 'fail',
        label: 'Memory Trace 结构',
        detail: `需要调用栈、堆对象和引用关系；当前 stack=${hasStack ? '有' : '缺'}，heap=${hasHeap ? '有' : '缺'}，reference=${hasReference ? '有' : '缺'}。`,
      });
    } else {
      checks.push({
        status:
          stats.stepishCount >= minTraceSignals || stats.tableRowCount >= minTraceRows
            ? 'pass'
            : 'fail',
        label: '状态追踪',
        detail:
          canvasMode === 'long'
            ? `长代码页需要完整 trace/state 展开；当前 step=${stats.stepishCount}，table rows=${stats.tableRowCount}。`
            : `代码页需要 3-5 个 trace/state 步骤；当前 step=${stats.stepishCount}，table rows=${stats.tableRowCount}。`,
      });
    }
    checks.push({
      status: stats.preOverflowCount === 0 ? 'pass' : 'warn',
      label: '代码不横向撑破',
      detail:
        stats.preOverflowCount === 0
          ? '代码块没有明显内部横向溢出。'
          : `发现 ${stats.preOverflowCount} 个 pre/code 内部横向溢出。`,
    });
  }

  if (kind === 'example') {
    checks.push({
      status: stats.stepishCount >= 3 || stats.listItemCount >= 3 ? 'pass' : 'fail',
      label: '例题步骤',
      detail: `例题页需要 3-4 步求解链；当前 step=${stats.stepishCount}，list item=${stats.listItemCount}。`,
    });
    checks.push({
      status: stats.cardishCount >= 2 || stats.tableCount >= 1 ? 'pass' : 'warn',
      label: '题面与答案分区',
      detail: `需要题目/已知/步骤/答案分区；当前 card=${stats.cardishCount}，table=${stats.tableCount}。`,
    });
  }

  return checks;
}

export function buildRegenerationFeedback(
  stats: PreviewStats,
  checks: QualityCheck[],
  preset: HtmlSinglePagePreset,
): string | null {
  if (stats.slideCount <= 0 && stats.scrollWidth <= 0 && stats.scrollHeight <= 0) return null;

  const canvasMode = getPresetCanvasMode(preset);
  const canvasHeight = getPresetCanvasHeight(preset);
  const failedOrWarned = checks.filter((check) => check.status !== 'pass');
  if (failedOrWarned.length === 0) return null;

  const lines = [...failedOrWarned.slice(0, 8).map((check) => `- ${check.label}：${check.detail}`)];

  if (stats.outOfBoundsCount > 0) {
    lines.push(
      '- 重新生成时必须移除所有出界 DOM 元素。不要用负 top/left/right/bottom、负 margin、超大背景块或出界装饰圆形。',
      canvasMode === 'long'
        ? `- 背景装饰请改成 .slide 的 CSS background/radial-gradient，或保证装饰元素完整落在 1600×${canvasHeight} 长页面画布内部。`
        : '- 背景装饰请改成 .slide 的 CSS background/radial-gradient，或保证装饰元素完整落在 1600×900 画布内部。',
    );
  }

  if (
    stats.scrollWidth > 1601 ||
    (canvasMode === 'slide' && stats.scrollHeight > 901) ||
    (canvasMode === 'long' && stats.scrollHeight > canvasHeight + 120)
  ) {
    lines.push(
      canvasMode === 'long'
        ? '- 长页面允许纵向阅读，但不能横向滚动或明显超过目标高度；请减少横向列数、压缩次要说明、拆短代码/公式。'
        : '- 页面不能依赖滚动或裁切；如果内容太多，减少文字、卡片高度、表格行数或公式数量。',
    );
  }

  if (failedOrWarned.some((check) => check.label.startsWith('内容密度'))) {
    lines.push(
      '- 重新生成时请按本页密度目标调整内容量：太空就增加具体卡片/步骤/数值，太挤就删掉次要说明、减少卡片或缩短句子。',
      '- 不要通过缩小字号解决密度问题；优先减少文字、合并区域、改成表格或更紧凑的结构。',
      '- 面积很大的卡片/面板必须有足够内容填充；如果只是标题加两行字，请缩短容器高度，或加入真实图示、列表、时间线、步骤或检查点。',
    );
  }

  return lines.join('\n');
}

export function buildStoredQuality(
  summary: ReturnType<typeof summarizeChecks>,
  stats: PreviewStats,
): StoredQuality {
  return {
    ...summary,
    outOfBoundsCount: stats.outOfBoundsCount,
    mathCount: stats.mathCount,
    scrollWidth: stats.scrollWidth,
    scrollHeight: stats.scrollHeight,
    checkedAt: Date.now(),
  };
}

export function hasQualityProblem(quality: StoredQuality | undefined): boolean {
  return Boolean(quality && (quality.failed > 0 || quality.warned > 0));
}

export function hasPendingImageAsset(run: StoredRun | null | undefined): boolean {
  return run?.imageAsset?.sourceType === 'pending';
}

export function getRetryCount(run: StoredRun): number {
  return Math.max(0, (run.generationAttempts || 1) - 1);
}

export function isSameStoredQuality(
  left: StoredQuality | undefined,
  right: StoredQuality,
): boolean {
  return Boolean(
    left &&
    left.failed === right.failed &&
    left.warned === right.warned &&
    left.passed === right.passed &&
    left.total === right.total &&
    left.outOfBoundsCount === right.outOfBoundsCount &&
    left.mathCount === right.mathCount &&
    left.scrollWidth === right.scrollWidth &&
    left.scrollHeight === right.scrollHeight,
  );
}
