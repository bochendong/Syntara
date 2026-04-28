import type { SlideLayoutValidationResult } from '@/lib/slide-text-layout';

export function appendRewriteReason(base?: string, extra?: string): string | undefined {
  const trimmedExtra = extra?.trim();
  if (!trimmedExtra) return base;

  const trimmedBase = base?.trim();
  return trimmedBase ? `${trimmedBase}\n\n${trimmedExtra}` : trimmedExtra;
}

function formatLayoutIssueForRetry(
  issue: SlideLayoutValidationResult['issues'][number],
  language: 'zh-CN' | 'en-US',
): string {
  if (language === 'zh-CN') {
    switch (issue.code) {
      case 'viewport_overflow':
        return '元素超出画布边界';
      case 'text_box_overflow':
        return '文本框高度不足，正文放不下';
      case 'shape_text_overflow':
        return 'shape.text 内容超过背景容器高度';
      case 'contained_element_overflow':
        return '背景容器内的文字或公式超出容器边界';
      case 'detached_container_content':
        return '不要输出空背景框，再把正文或公式放在框外或框下';
      case 'invalid_text_metrics':
        return '文字样式存在非法度量，例如过小的 line-height，导致整行文字被压扁';
      case 'element_overlap':
        return '多个组件发生重叠，页面结构过于拥挤';
      case 'layout_compile_failed':
        return `模板 slot 编译失败：${issue.message}`;
      case 'line_coordinate_sanity':
        return '线条坐标异常，必须改用模板内置连线或更简单的结构';
      case 'title_body_collision':
        return '标题区与正文/卡片发生碰撞，需要减少标题长度、换模板或拆页';
      default:
        return issue.message;
    }
  }

  switch (issue.code) {
    case 'viewport_overflow':
      return 'elements exceed the slide viewport';
    case 'text_box_overflow':
      return 'a text box is too short for its content';
    case 'shape_text_overflow':
      return 'shape.text content is taller than its container';
    case 'contained_element_overflow':
      return 'text or latex exceeds its containing background shape';
    case 'detached_container_content':
      return 'do not place an empty background shape above content that belongs inside it';
    case 'invalid_text_metrics':
      return 'text metrics are invalid, such as a line-height that crushes the glyphs';
    case 'element_overlap':
      return 'multiple slide components overlap each other';
    case 'layout_compile_failed':
      return `template slot compilation failed: ${issue.message}`;
    case 'line_coordinate_sanity':
      return 'line coordinates are invalid; use template-owned connectors or a simpler structure';
    case 'title_body_collision':
      return 'the title collides with body content; shorten the title, change template, or split the slide';
    default:
      return issue.message;
  }
}

export function buildLayoutRetryReason(
  validation: SlideLayoutValidationResult,
  language: 'zh-CN' | 'en-US',
): string {
  const issueSummary = validation.issues
    .slice(0, 4)
    .map((issue) => formatLayoutIssueForRetry(issue, language))
    .join(language === 'zh-CN' ? '；' : '; ');

  if (language === 'zh-CN') {
    return [
      '上一版因为版式几何校验失败，需要整页重写。',
      `- 失败原因：${issueSummary || '文字与容器的几何关系不正确。'}`,
      '- 必须保证所有文字框、公式框和 shape.text 在最终版式里完整落在各自容器内。',
      '- 卡片、说明框、提示框里的正文，优先直接写到 shape.text；如果使用独立 TextElement 或 LatexElement，它必须几何上完整位于背景 shape 内。',
      '- 不要输出空背景框，再把正文、项目符号或公式漂在框外、框下或相邻位置。',
      '- 不允许通过缩小字号来解决布局问题；如果内容过多，请改布局、增大容器、拆成多块，或减少单页信息密度。',
      '- 对于总览、分类、判定步骤、证明方法等内容，优先改成表格、要点列表、callout 或上下堆叠卡片，不要拼很多漂浮的小标签和小框。',
    ].join('\n');
  }

  return [
    'The previous version failed geometric layout validation and must be fully rewritten.',
    `- Failure summary: ${issueSummary || 'The text-to-container geometry was invalid.'}`,
    '- Every text box, latex box, and shape.text block must be fully contained by its final container.',
    '- For card, callout, or container copy, prefer shape.text. If you use a separate TextElement or LatexElement, it must be geometrically inside the background shape.',
    '- Do not output an empty background shape and place the real copy, bullets, or formulas below or outside that shape.',
    '- Do not solve layout by shrinking font sizes. If content is too dense, change the layout, enlarge the container, split the card, or reduce per-slide density.',
    '- For overviews, classifications, proof strategies, or decision flows, prefer tables, bullet lists, callouts, or vertically stacked cards instead of many floating mini-boxes.',
  ].join('\n');
}

export function buildSemanticStructureRetryReason(language: 'zh-CN' | 'en-US'): string {
  if (language === 'zh-CN') {
    return [
      '请优先输出稳定的语义结构，而不是隐含复杂图形布局。',
      '- “总览 / 分类 / 判定 / 证明方法”优先用 table、bullet_list、callout、definition、theorem。',
      '- 如果一个 block 需要很多并列标签、节点或箭头，请改成表格、编号列表或拆成两块上下堆叠内容。',
      '- 不要尝试用许多漂浮的小文本块去模拟流程图、关系图或概念图。',
    ].join('\n');
  }

  return [
    'Prefer stable semantic structures instead of implying a complex diagram layout.',
    '- For overview, classification, proof strategy, or decision content, prefer table, bullet_list, callout, definition, or theorem blocks.',
    '- If a block would require many peer labels, nodes, or arrows, convert it into a table, numbered list, or two vertically stacked blocks.',
    '- Do not simulate flowcharts, relation maps, or concept maps with many floating mini text blocks.',
  ].join('\n');
}

export function buildSemanticBudgetRetryReason(
  language: 'zh-CN' | 'en-US',
  reasons: string[],
): string {
  const reasonText = reasons.join(language === 'zh-CN' ? '；' : '; ');
  if (language === 'zh-CN') {
    return [
      '当前语义内容超过单页信息预算，需要降低单页密度。',
      `- 预算信号：${reasonText || '当前页面内容过多。'}`,
      '- 只保留这一页最核心的 1-2 个结构，不要同时塞入很多平级分类、标签、说明和结论。',
      '- 优先输出表格、编号列表、要点卡片或 callout，不要把多个分类结果拆成很多零碎小块。',
      '- 本轮必须优先压缩同页表达（缩句、减冗余、减少平级块），不要主动拆成多页。',
    ].join('\n');
  }

  return [
    'The semantic content exceeds the per-slide information budget and must be simplified.',
    `- Budget signals: ${reasonText || 'This slide is too dense.'}`,
    '- Keep only the most important 1-2 structures for this slide instead of combining many peer classifications, labels, notes, and conclusions.',
    '- Prefer a table, numbered list, bullet card, or callout instead of many tiny fragments.',
    '- In this retry, prioritize compact single-page rewriting (shorter phrasing, fewer peer blocks) instead of proactively splitting into multiple pages.',
  ].join('\n');
}
