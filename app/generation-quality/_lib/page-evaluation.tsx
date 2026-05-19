import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import type { NotebookContentBlock, NotebookContentDocument } from '@/lib/notebook-content';
import type { Scene, SceneGenerationDiagnostics } from '@/lib/types/stage';
import type { PPTElement } from '@/lib/types/slides';

import { isRecord } from './page-state';
import type {
  DeckStyleValue,
  LayoutOptionValue,
  QualityCheck,
  QualityStatus,
  TestListStatus,
} from './page-types';

export function blockTypes(document: NotebookContentDocument | undefined): string[] {
  return (document?.blocks || []).map((block) => block.type);
}

export function rowsForBlock(block: NotebookContentBlock): number {
  if (block.type !== 'table' && block.type !== 'state_table') return 0;
  return Array.isArray(block.rows) ? block.rows.length : 0;
}

export function processStepCount(block: NotebookContentBlock): number {
  if (block.type !== 'process_flow') return 0;
  return Array.isArray(block.steps) ? block.steps.length : 0;
}

export function layoutCardCount(block: NotebookContentBlock): number {
  if (block.type !== 'layout_cards') return 0;
  return Array.isArray(block.items) ? block.items.length : 0;
}

export function collectText(value: unknown, output: string[] = []): string[] {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) output.push(trimmed);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectText(item, output));
    return output;
  }
  if (isRecord(value)) {
    Object.values(value).forEach((item) => collectText(item, output));
  }
  return output;
}

export function maxElementBounds(elements: PPTElement[]) {
  return elements.reduce(
    (acc, element) => {
      const record = element as unknown as Record<string, unknown>;
      const left = typeof record.left === 'number' ? record.left : 0;
      const top = typeof record.top === 'number' ? record.top : 0;
      const width = typeof record.width === 'number' ? record.width : 0;
      const height = typeof record.height === 'number' ? record.height : 0;
      return {
        right: Math.max(acc.right, left + width),
        bottom: Math.max(acc.bottom, top + height),
      };
    },
    { right: 0, bottom: 0 },
  );
}

export function evaluateResult(args: {
  scene: Scene | null;
  expectedTemplate: LayoutOptionValue;
  expectedDeckStyle: DeckStyleValue;
  expectedAnchors: string[];
  generatedContentCount: number;
  generationDiagnostics?: SceneGenerationDiagnostics;
}): QualityCheck[] {
  if (!args.scene || args.scene.type !== 'slide' || args.scene.content.type !== 'slide') {
    return [
      {
        status: 'warn',
        label: '等待生成',
        detail: '生成一页后这里会显示结构和渲染质检。',
      },
    ];
  }

  const content = args.scene.content;
  const document = content.semanticDocument;
  const types = new Set(blockTypes(document));
  const blocks = document?.blocks || [];
  const processSteps = Math.max(0, ...blocks.map(processStepCount));
  const tableRows = Math.max(0, ...blocks.map(rowsForBlock));
  const cardCount = Math.max(0, ...blocks.map(layoutCardCount));
  const cardColumns = Math.max(
    0,
    ...blocks.map((block) => (block.type === 'layout_cards' ? block.columns : 0)),
  );
  const hasVisual = Boolean(document?.visualSlot || types.has('visual'));
  const textItems = collectText(document);
  const longestText = textItems.reduce((max, item) => Math.max(max, item.length), 0);
  const serializedDocument = document ? JSON.stringify(document) : '';
  const bounds = maxElementBounds(content.canvas.elements);
  const checks: QualityCheck[] = [];

  checks.push({
    status: args.generatedContentCount === 1 ? 'pass' : 'fail',
    label: '只生成一页',
    detail:
      args.generatedContentCount === 1
        ? '这次请求没有被拆成 continuation pages。'
        : `接口返回了 ${args.generatedContentCount} 页，需要回到生成契约或预算策略里处理。`,
  });

  checks.push({
    status: args.generationDiagnostics?.contentFallbackUsed ? 'warn' : 'pass',
    label: '没有退回本地 fallback',
    detail: args.generationDiagnostics?.contentFallbackUsed
      ? `主生成链路没有通过，使用了 ${args.generationDiagnostics.fallbackKind || 'fallback'}；这类结果只能当错误样本看。`
      : '结果来自正式语义生成链路，没有靠本地 fallback 补页面。',
  });

  const retryCount =
    (args.generationDiagnostics?.semanticRetryCount || 0) +
    (args.generationDiagnostics?.layoutRetryCount || 0);
  const retryReasons = uniqueNonEmpty(args.generationDiagnostics?.failureReasons || []);
  checks.push({
    status: retryCount === 0 ? 'pass' : 'warn',
    label: '重试过程可解释',
    detail:
      retryCount === 0
        ? '模型第一次输出就通过结构、预算和渲染校验。'
        : `生成过程中修复过 ${retryCount} 次：${retryReasons
            .slice(0, 2)
            .map(readableFailureReason)
            .join(' / ')}`,
  });

  const codePageCanScroll = args.expectedTemplate === 'code_split';
  checks.push({
    status: content.webRenderMode === 'slide' || codePageCanScroll ? 'pass' : 'fail',
    label: '固定 16:9 slide 渲染',
    detail:
      content.webRenderMode === 'slide'
        ? '课堂会走固定画布 renderer，而不是长页滚动。'
        : codePageCanScroll
          ? `当前 webRenderMode=${content.webRenderMode || 'undefined'}；代码追踪页允许在保留代码完整性时有限滚动或分页。`
          : `当前 webRenderMode=${content.webRenderMode || 'undefined'}，这类测试页应该是一屏 PPT。`,
  });

  checks.push({
    status: document?.layoutTemplate === args.expectedTemplate ? 'pass' : 'fail',
    label: '版式契约',
    detail:
      document?.layoutTemplate === args.expectedTemplate
        ? `使用了 ${args.expectedTemplate}。`
        : `期望 ${args.expectedTemplate}，实际 ${document?.layoutTemplate || '未声明'}。`,
  });

  checks.push({
    status:
      document?.deckStyle === args.expectedDeckStyle ||
      (!document?.deckStyle && args.expectedDeckStyle === 'classic_business')
        ? 'pass'
        : 'warn',
    label: '视觉母版',
    detail:
      document?.deckStyle === args.expectedDeckStyle
        ? `语义文档声明了 deckStyle=${args.expectedDeckStyle}。`
        : `当前 deckStyle=${document?.deckStyle || '默认 classic_business'}；如果你正在测试特定风格，这里应该对齐。`,
  });

  if (args.expectedTemplate === 'pipeline_table') {
    checks.push({
      status: types.has('process_flow') && types.has('table') ? 'pass' : 'fail',
      label: 'pipeline_table 结构',
      detail: `需要 process_flow + table；当前 blocks=${Array.from(types).join(', ') || 'none'}。`,
    });
    checks.push({
      status:
        processSteps > 0 && processSteps <= 4 && tableRows >= 3 && tableRows <= 6 ? 'pass' : 'warn',
      label: '流程和表格预算',
      detail: `流程 ${processSteps || 0} 步，表格 ${tableRows || 0} 行；普通 PPT 最好是 3-4 步、3-6 行。`,
    });
  }

  if (args.expectedTemplate === 'comparison_matrix') {
    checks.push({
      status: types.has('table') ? 'pass' : 'fail',
      label: 'comparison_matrix 结构',
      detail: `需要以 table 作为主体；当前 blocks=${Array.from(types).join(', ') || 'none'}。`,
    });
    checks.push({
      status: tableRows >= 3 && tableRows <= 6 ? 'pass' : 'warn',
      label: '表格预算',
      detail: `表格 ${tableRows || 0} 行；对照矩阵最好是 3-6 行，保留扫读空间。`,
    });
  }

  if (args.expectedTemplate === 'process_steps') {
    checks.push({
      status: types.has('process_flow') ? 'pass' : 'fail',
      label: 'process_steps 结构',
      detail: `需要 process_flow 作为主体；当前 blocks=${Array.from(types).join(', ') || 'none'}。`,
    });
    checks.push({
      status: processSteps >= 3 && processSteps <= 5 ? 'pass' : 'warn',
      label: '流程步骤预算',
      detail: `流程 ${processSteps || 0} 步；流程图最好是 3-5 步，每步一句可执行动作。`,
    });
  }

  if (
    args.expectedTemplate === 'image_title_overlay' ||
    args.expectedTemplate === 'cinematic_title_frame' ||
    args.expectedTemplate === 'tech_hero_title'
  ) {
    const nonVisualBlocks = blocks.filter((block) => block.type !== 'visual');
    const heavyBlocks = blocks.filter((block) =>
      ['table', 'process_flow', 'layout_cards', 'code_block', 'code_trace'].includes(block.type),
    );
    checks.push({
      status: hasVisual ? 'pass' : 'fail',
      label: 'hero 主视觉',
      detail: `需要整页 visual 作为背景；当前 visual=${hasVisual ? 'yes' : 'no'}。`,
    });
    checks.push({
      status: nonVisualBlocks.length <= 3 && heavyBlocks.length === 0 ? 'pass' : 'fail',
      label: 'hero 内容密度',
      detail: `封面页只应有短副标题/元信息；当前非 visual blocks=${nonVisualBlocks.length}，重结构 blocks=${heavyBlocks.length}。`,
    });
  }

  if (args.expectedTemplate === 'visual_three_steps') {
    const hasThreeStepStructure =
      (types.has('layout_cards') && cardCount === 3) ||
      (types.has('process_flow') && processSteps === 3);
    checks.push({
      status: types.has('visual') && hasThreeStepStructure ? 'pass' : 'fail',
      label: 'visual_three_steps 结构',
      detail: `需要 visual + 正好 3 个 cards/process steps；当前 blocks=${Array.from(types).join(', ') || 'none'}。`,
    });
    checks.push({
      status: hasThreeStepStructure ? 'pass' : 'warn',
      label: '三步结构',
      detail: `当前 layout_cards=${cardCount || 0} 项，process_flow=${processSteps || 0} 步；这个模板最好正好三步。`,
    });
  }

  if (args.expectedTemplate === 'two_by_one_summary') {
    const textishCount = blocks.filter((block) =>
      ['paragraph', 'bullet_list', 'callout', 'definition', 'theorem'].includes(block.type),
    ).length;
    checks.push({
      status:
        textishCount >= 3 || (types.has('layout_cards') && textishCount >= 1) ? 'pass' : 'fail',
      label: 'two_by_one_summary 结构',
      detail: `需要两组要点 + 底部 summary/callout；当前 textish blocks=${textishCount}，blocks=${Array.from(types).join(', ') || 'none'}。`,
    });
  }

  if (args.expectedTemplate === 'three_cards') {
    checks.push({
      status: types.has('layout_cards') && cardCount === 3 ? 'pass' : 'fail',
      label: 'three_cards 结构',
      detail: `需要正好 3 张概念卡；当前 layout_cards=${cardCount || 0}，blocks=${Array.from(types).join(', ') || 'none'}。`,
    });
  }

  if (args.expectedTemplate === 'text_image_split') {
    const textishCount = blocks.filter((block) =>
      ['paragraph', 'bullet_list', 'callout', 'definition', 'theorem'].includes(block.type),
    ).length;
    checks.push({
      status: hasVisual && textishCount >= 1 ? 'pass' : 'fail',
      label: 'text_image_split 结构',
      detail: `需要左侧文本 + 右侧 visual；当前 textish=${textishCount}，visual=${hasVisual ? 'yes' : 'no'}。`,
    });
  }

  if (args.expectedTemplate === 'four_columns') {
    checks.push({
      status: types.has('layout_cards') && cardColumns === 4 && cardCount === 4 ? 'pass' : 'fail',
      label: 'four_columns 结构',
      detail: `需要 columns=4 且正好 4 张卡；当前 columns=${cardColumns || 0}，cards=${cardCount || 0}。`,
    });
  }

  if (args.expectedTemplate === 'grid_2x2') {
    checks.push({
      status: types.has('layout_cards') && cardColumns === 2 && cardCount === 4 ? 'pass' : 'fail',
      label: 'grid_2x2 结构',
      detail: `需要 columns=2 且正好 4 张卡；当前 columns=${cardColumns || 0}，cards=${cardCount || 0}。`,
    });
  }

  if (args.expectedTemplate === 'two_text_image') {
    const textishCount = blocks.filter((block) =>
      ['paragraph', 'bullet_list', 'callout', 'definition', 'theorem'].includes(block.type),
    ).length;
    const twoCards = types.has('layout_cards') && cardCount === 2;
    checks.push({
      status: hasVisual && (textishCount >= 2 || twoCards) ? 'pass' : 'fail',
      label: 'two_text_image 结构',
      detail: `需要两块文本 + 右侧 visual；当前 textish=${textishCount}，cards=${cardCount || 0}，visual=${hasVisual ? 'yes' : 'no'}。`,
    });
  }

  if (args.expectedTemplate === 'code_split') {
    const hasCode =
      types.has('code_block') || types.has('code_walkthrough') || types.has('code_trace');
    const hasTrace =
      types.has('code_walkthrough') ||
      types.has('code_trace') ||
      types.has('state_table') ||
      types.has('memory_diagram') ||
      types.has('call_stack');
    checks.push({
      status: hasCode && hasTrace ? 'pass' : 'fail',
      label: 'code_split 结构',
      detail: `需要代码块 + 执行/状态追踪；当前 blocks=${Array.from(types).join(', ') || 'none'}。`,
    });
  }

  checks.push({
    status: longestText <= 180 ? 'pass' : longestText <= 260 ? 'warn' : 'fail',
    label: '文本密度',
    detail:
      longestText <= 180
        ? '最长文本块足够短，适合课堂扫读。'
        : `最长文本约 ${longestText} 字符；这会开始变成讲稿或网页段落。`,
  });

  checks.push({
    status: /\\(?:text|bullet|example|card|step|table|begin|end)\b/.test(serializedDocument)
      ? 'fail'
      : 'pass',
    label: '无标记泄漏',
    detail: /\\(?:text|bullet|example|card|step|table|begin|end)\b/.test(serializedDocument)
      ? '语义文档里仍然残留 Syntara/LaTeX 命令，renderer 会把它当正文显示。'
      : '没有发现会直接露给学生的结构命令。',
  });

  const matchedAnchorCount = args.expectedAnchors.filter((anchor) =>
    serializedDocument.includes(anchor),
  ).length;
  const requiredAnchorCount = Math.min(2, args.expectedAnchors.length);
  checks.push({
    status: matchedAnchorCount >= requiredAnchorCount ? 'pass' : 'warn',
    label: '使用输入事实',
    detail:
      args.expectedAnchors.length > 0
        ? `命中 ${matchedAnchorCount}/${args.expectedAnchors.length} 个样本锚点：${args.expectedAnchors.join('、')}。`
        : '检查是否保留了 outline 里的具体事实，而不是泛泛讲概念。',
  });

  checks.push({
    status: bounds.right <= 1005 && bounds.bottom <= 570 ? 'pass' : 'fail',
    label: '画布边界',
    detail:
      bounds.right <= 1005 && bounds.bottom <= 570
        ? '生成的元素几何边界没有明显越出 16:9 画布。'
        : `元素边界到 right=${Math.round(bounds.right)}, bottom=${Math.round(bounds.bottom)}，可能有溢出。`,
  });

  checks.push({
    status: content.canvas.elements.length >= 4 ? 'pass' : 'warn',
    label: '可视结构',
    detail: `当前画布元素 ${content.canvas.elements.length} 个；过少通常意味着版式没有被充分渲染出来。`,
  });

  return checks;
}

export function statusIcon(status: QualityStatus) {
  if (status === 'pass') return <CheckCircle2 className="size-4 text-emerald-600" />;
  if (status === 'warn') return <AlertTriangle className="size-4 text-amber-600" />;
  return <XCircle className="size-4 text-red-600" />;
}

export function statusBadgeVariant(status: QualityStatus): 'default' | 'secondary' | 'destructive' {
  if (status === 'fail') return 'destructive';
  if (status === 'warn') return 'secondary';
  return 'default';
}

export function testStatusLabel(status: TestListStatus): string {
  if (status === 'pass') return '通过';
  if (status === 'warn') return '警告';
  if (status === 'fail') return '失败';
  if (status === 'error') return '错误';
  return '待测';
}

export function testStatusBadgeVariant(
  status: TestListStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'pass') return 'default';
  if (status === 'warn') return 'secondary';
  if (status === 'fail' || status === 'error') return 'destructive';
  return 'outline';
}

export function readableFailureReason(reason: string): string {
  if (/markup command leaked/i.test(reason)) {
    return '结构命令泄漏到学生可见文本里。通常是模型把 `\\bullet`、`\\text`、`\\example` 这类命令写进了 card/step/table cell 的正文。';
  }
  if (/two_by_one_summary/i.test(reason)) {
    return 'two_by_one_summary 缺少模板要求的三块结构：左栏要点、右栏要点、底部 summary/callout。';
  }
  if (/image_title_overlay|cinematic_title_frame|tech_hero_title/i.test(reason)) {
    return 'image-first hero 页需要一张 visual 和极短副标题/元信息，不能输出表格、流程、卡片或长讲稿。';
  }
  if (/three_cards/i.test(reason)) {
    return 'three_cards 没有产出正好 3 张 cards，或卡片正文太长。';
  }
  if (/text_image_split/i.test(reason)) {
    return 'text_image_split 缺少左侧短文本或右侧 visual。';
  }
  if (/four_columns/i.test(reason)) {
    return 'four_columns 需要 columns=4 且正好 4 张短卡片。';
  }
  if (/grid_2x2/i.test(reason)) {
    return 'grid_2x2 需要 columns=2 且正好 4 张卡片。';
  }
  if (/two_text_image/i.test(reason)) {
    return 'two_text_image 缺少两块短文本或右侧 visual。';
  }
  if (/code_split/i.test(reason) || /state trace page requires/i.test(reason)) {
    return '代码追踪页没有同时产出代码和状态追踪结构，可能退化成了普通段落或 bullet list。';
  }
  if (/pipeline_table/i.test(reason)) {
    return 'pipeline_table 缺少 process/table，或流程步数、表格行数不符合模板输入契约。';
  }
  if (/comparison_matrix/i.test(reason)) {
    return 'comparison_matrix 缺少 table，或表格行数/维度没有按对照矩阵组织。';
  }
  if (/process_steps/i.test(reason)) {
    return 'process_steps 缺少 process_flow，或流程步骤数量不适合一屏 PPT。';
  }
  if (/missing concrete anchor/i.test(reason)) {
    return '生成结果没有使用 PagePlan 的具体入口。模型可能泛泛讲概念，没有把样本、代码或数据放进页面。';
  }
  if (/requires height|overflow|layout/i.test(reason)) {
    return '渲染几何检查失败。语义结构可能对了，但某个文本框、流程卡或表格内容超过了 renderer 预算。';
  }
  if (/budget exceeded/i.test(reason)) {
    return '内容预算超了。模型把一页写成讲稿或长网页，需要压缩或拆成更明确的结构。';
  }
  if (/semantic pipeline returned null/i.test(reason)) {
    return '语义生成多次重试后仍没有通过校验，所以后端拒绝返回半成品。';
  }
  return reason;
}

export function uniqueNonEmpty(items: readonly (string | undefined)[]): string[] {
  return Array.from(new Set(items.map((item) => item?.trim()).filter(Boolean) as string[]));
}
