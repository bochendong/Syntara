import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import {
  parseNotebookContentDocument,
  renderNotebookContentDocumentToSlide,
  type NotebookContentDocument,
} from '@/lib/notebook-content';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { runWithRequestContext } from '@/lib/server/request-context';
import type { SlideContent } from '@/lib/types/stage';
import type {
  PPTElement,
  PPTShapeElement,
  PPTTextElement,
  PPTLatexElement,
} from '@/lib/types/slides';

const log = createLogger('Classroom Repair Slide Math API');

export const maxDuration = 180;

type RepairRequestBody = {
  sceneTitle?: string;
  language?: 'zh-CN' | 'en-US';
  content?: SlideContent;
  repairInstructions?: string;
};

type RepairResponsePayload = {
  sceneTitle?: string;
  document?: unknown;
};

type SlideRepairTextSummaryItem = {
  id: string;
  type: 'text';
  name: string;
  text: string;
  textType?: string;
};

type SlideRepairShapeTextSummaryItem = {
  id: string;
  type: 'shape_text';
  name: string;
  text: string;
};

type SlideRepairLatexSummaryItem = {
  id: string;
  type: 'latex';
  name: string;
  latex: string;
};

type SlideRepairSummaryItem =
  | SlideRepairTextSummaryItem
  | SlideRepairShapeTextSummaryItem
  | SlideRepairLatexSummaryItem;

function splitMeaningfulLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function decodeHtmlEntities(text: string): string {
  return text
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"');
}

function htmlToPlainText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\u00a0/g, ' ')
      .replace(/\n{3,}/g, '\n\n'),
  ).trim();
}

function summarizeTextElement(element: PPTTextElement): SlideRepairTextSummaryItem {
  return {
    id: element.id,
    type: 'text',
    name: element.name || '',
    textType: element.textType || '',
    text: htmlToPlainText(element.content).slice(0, 2000),
  };
}

function summarizeShapeText(element: PPTShapeElement): SlideRepairShapeTextSummaryItem {
  const text = element.text?.content ? htmlToPlainText(element.text.content) : '';
  return {
    id: element.id,
    type: 'shape_text',
    name: element.name || '',
    text: text.slice(0, 2000),
  };
}

function summarizeLatexElement(element: PPTLatexElement): SlideRepairLatexSummaryItem {
  return {
    id: element.id,
    type: 'latex',
    name: element.name || '',
    latex: element.latex,
  };
}

function summarizeElements(elements: PPTElement[]): SlideRepairSummaryItem[] {
  return elements
    .slice()
    .sort((a, b) => a.top - b.top || a.left - b.left)
    .flatMap<SlideRepairSummaryItem>((element) => {
      if (element.type === 'text') return [summarizeTextElement(element)];
      if (element.type === 'latex') return [summarizeLatexElement(element)];
      if (element.type === 'shape' && element.text?.content?.trim())
        return [summarizeShapeText(element)];
      return [];
    })
    .filter((item) => {
      if (item.type === 'latex') return Boolean(item.latex.trim());
      return Boolean(item.text.trim());
    });
}

function buildFallbackDocumentFromSlideContent(args: {
  sceneTitle: string;
  language: 'zh-CN' | 'en-US';
  content: SlideContent;
}): NotebookContentDocument {
  const blocks: NotebookContentDocument['blocks'] = [];
  const items = summarizeElements(args.content.canvas.elements);

  for (const item of items) {
    if (item.type === 'latex') {
      blocks.push({ type: 'equation', latex: item.latex, display: true });
      continue;
    }

    const lines = splitMeaningfulLines(item.text);
    if (lines.length === 0) continue;

    const bulletItems = lines
      .filter((line) => /^[-•·▪◦]/.test(line))
      .map((line) => line.replace(/^[-•·▪◦]\s*/, '').trim())
      .filter(Boolean);

    if (item.type === 'text' && (item.textType === 'title' || item.textType === 'subtitle')) {
      blocks.push({
        type: 'heading',
        level: item.textType === 'title' ? 1 : 2,
        text: lines.join(' '),
      });
      continue;
    }

    if (
      item.type === 'text' &&
      (item.textType === 'itemTitle' || item.textType === 'header') &&
      lines.length <= 2
    ) {
      blocks.push({
        type: 'heading',
        level: 3,
        text: lines.join(' '),
      });
      continue;
    }

    if (bulletItems.length >= Math.max(2, lines.length - 1)) {
      blocks.push({ type: 'bullet_list', items: bulletItems });
      continue;
    }

    blocks.push({ type: 'paragraph', text: lines.join('\n') });
  }

  return {
    version: 1,
    language: args.language,
    title: args.sceneTitle,
    blocks:
      blocks.length > 0
        ? blocks
        : [
            {
              type: 'paragraph',
              text:
                args.language === 'zh-CN'
                  ? '请保留当前页内容，仅修复数学符号。'
                  : 'Keep the current page content and only repair mathematical notation.',
            },
          ],
  };
}

function estimateDocumentSignal(doc: NotebookContentDocument): number {
  return doc.blocks.reduce((sum, block) => {
    switch (block.type) {
      case 'heading':
        return sum + block.text.length;
      case 'paragraph':
        return sum + block.text.length;
      case 'bullet_list':
        return sum + block.items.join('').length;
      case 'equation':
        return sum + block.latex.length;
      case 'derivation_steps':
        return (
          sum +
          (block.title?.length || 0) +
          block.steps.reduce(
            (inner, step) => inner + step.expression.length + (step.explanation?.length || 0),
            0,
          )
        );
      case 'code_block':
        return sum + block.code.length + (block.caption?.length || 0);
      case 'table':
        return sum + (block.caption?.length || 0) + block.rows.flat().join('').length;
      case 'callout':
        return sum + (block.title?.length || 0) + block.text.length;
      case 'example':
        return (
          sum +
          (block.title?.length || 0) +
          block.problem.length +
          block.givens.join('').length +
          (block.goal?.length || 0) +
          block.steps.join('').length +
          (block.answer?.length || 0) +
          block.pitfalls.join('').length
        );
      case 'chem_formula':
        return sum + block.formula.length + (block.caption?.length || 0);
      case 'chem_equation':
        return sum + block.equation.length + (block.caption?.length || 0);
      default:
        return sum;
    }
  }, 0);
}

function normalizeCompactText(text: string): string {
  return text.replace(/\s+/g, '').trim();
}

function isPlaceholderLikeText(text: string): boolean {
  const normalized = normalizeCompactText(text).replace(/[：:]+$/g, '');
  return [
    '已知',
    '证明',
    '思路',
    '题目',
    '解',
    '解答',
    '结论',
    '目标',
    '分析',
    '证明过程',
  ].includes(normalized);
}

function countSuspiciousPlaceholderBlocks(doc: NotebookContentDocument): number {
  let suspicious = 0;
  for (let i = 0; i < doc.blocks.length; i += 1) {
    const block = doc.blocks[i];
    if (block.type !== 'heading' && block.type !== 'paragraph' && block.type !== 'callout') continue;

    const text =
      block.type === 'heading' ? block.text : block.type === 'paragraph' ? block.text : block.text;
    if (!isPlaceholderLikeText(text)) continue;

    const next = doc.blocks[i + 1];
    const nextLooksSubstantive = Boolean(
      next &&
        ((next.type === 'paragraph' && normalizeCompactText(next.text).length >= 12) ||
          (next.type === 'bullet_list' && next.items.join('').trim().length >= 12) ||
          next.type === 'equation' ||
          next.type === 'derivation_steps' ||
          next.type === 'example' ||
          next.type === 'table' ||
          next.type === 'code_block' ||
          next.type === 'chem_formula' ||
          next.type === 'chem_equation' ||
          next.type === 'callout'),
    );

    if (!nextLooksSubstantive) suspicious += 1;
  }
  return suspicious;
}

function countReasoningBlocks(doc: NotebookContentDocument): number {
  return doc.blocks.filter((block) => {
    if (block.type === 'derivation_steps' || block.type === 'example') return true;
    if (block.type === 'equation') return true;
    if (block.type === 'bullet_list') return block.items.length >= 2;
    if (block.type === 'paragraph') return normalizeCompactText(block.text).length >= 30;
    return false;
  }).length;
}

function buildSystemPrompt(language: 'zh-CN' | 'en-US') {
  if (language === 'zh-CN') {
    return `你是一个“课堂单页数学内容与排版修复器”。

你的任务是修复一页课堂幻灯片里的数学记号、公式表达，以及讲解结构，让它适合被结构化渲染并且真正便于学生理解。

要求：
- 只修复当前这一页，不要扩写成多页。
- 保留原页主题、结论、层次和大致信息量，不要引入新的知识点。
- 不要删掉题解、步骤、结论、已知条件、易错点、答案或推导过程；如果拿不准，保留原内容。
- 优先在原有内容上做最小修改，而不是重写整页。
- 尽量保持原有 block 顺序与数量；除非某一块明显应该拆成“说明 + 公式”，否则不要合并或删减。
- 如果原页是“例题 / 证明 / 推导”页，必须把关键推导链明确写出来，不能只保留题目、标题和空占位。
- 不要输出空标题、空小节或占位块，例如“已知：”“证明：”“思路：”后面没有实质内容的结构。
- 如果原页里有两个结论，优先按“结论 1 -> 推导 -> 结论 2 -> 推导”或“已知 -> 推导 -> 结论”的方式整理清楚。
- 重点修复数学对象、映射、集合、等式、核、像、同余类、下标、上标等表达。
- 把真正的数学表达放进结构化公式块：
  - 单个或独立公式用 {"type":"equation","latex":"...","display":true}
  - 连续推导用 {"type":"derivation_steps", ...}
- 解释性语句、标题、小结保留为 heading / paragraph / bullet_list。
- 如果原文里只是把数学表达硬塞在句子里，请拆成“说明文字 + 公式块”，不要继续把复杂公式塞进 paragraph。
- 不要输出 markdown，不要输出解释，不要输出代码块，只输出 JSON。

数学修复示例：
- Z12 -> \\mathbb{Z}_{12}
- Z6 -> \\mathbb{Z}_{6}
- ker(φ) -> \\ker(\\varphi)
- im(φ) -> \\operatorname{im}(\\varphi)
- [x]12 -> [x]_{12}
- φ([x]12)=[2x]6 -> \\varphi([x]_{12}) = [2x]_{6}

输出 schema：
{
  "sceneTitle": "修复后的页标题",
  "document": {
    "version": 1,
    "language": "zh-CN",
    "title": "可选，通常与 sceneTitle 一致",
    "blocks": [
      { "type": "heading", "level": 2, "text": "..." },
      { "type": "paragraph", "text": "..." },
      { "type": "bullet_list", "items": ["..."] },
      { "type": "equation", "latex": "...", "display": true },
      {
        "type": "derivation_steps",
        "title": "可选",
        "steps": [{ "expression": "...", "format": "latex", "explanation": "可选" }]
      },
      {
        "type": "callout",
        "tone": "info" | "success" | "warning" | "danger" | "tip",
        "title": "可选",
        "text": "..."
      }
    ]
  }
}`;
  }

  return `You repair the mathematical notation, content structure, and teaching clarity of a single classroom slide.

Requirements:
- Repair this page only. Do not expand it into multiple pages.
- Preserve the original topic, meaning, and rough information density.
- Do not remove solution steps, givens, conclusions, or answer content. If unsure, keep it.
- Prefer minimal edits to the existing blocks instead of rewriting the page.
- Keep the original block order and roughly the same number of blocks whenever possible.
- If this is a proof / derivation / worked-example slide, keep the reasoning explicit. Do not collapse it into headings plus placeholders.
- Do not output empty section headers or placeholder blocks such as "Given:", "Proof:", or "Idea:" without substantive content after them.
- Convert malformed mathematical notation into structured math blocks.
- Use equation blocks for standalone math and derivation_steps for multi-line reasoning.
- Keep prose as heading / paragraph / bullet_list.
- If a sentence contains a heavy formula, split it into prose plus a formula block.
- Output JSON only. No markdown. No commentary. No code fences.

Examples:
- Z12 -> \\mathbb{Z}_{12}
- ker(phi) -> \\ker(\\varphi)
- im(phi) -> \\operatorname{im}(\\varphi)
- [x]12 -> [x]_{12}

Output schema:
{
  "sceneTitle": "repaired page title",
  "document": {
    "version": 1,
    "language": "en-US",
    "title": "optional",
    "blocks": []
  }
}`;
}

function buildUserPrompt(args: {
  sceneTitle: string;
  language: 'zh-CN' | 'en-US';
  semanticDocument: NotebookContentDocument | null;
  content: SlideContent;
  repairInstructions?: string;
}): string {
  const elementsSummary = summarizeElements(args.content.canvas.elements);
  const sourceDocument =
    args.semanticDocument ||
    buildFallbackDocumentFromSlideContent({
      sceneTitle: args.sceneTitle,
      language: args.language,
      content: args.content,
    });

  return [
    `Language: ${args.language}`,
    `Current page title: ${args.sceneTitle}`,
    args.repairInstructions?.trim()
      ? `Additional repair instructions from the teacher: ${args.repairInstructions.trim()}`
      : 'Additional repair instructions from the teacher: none',
    '',
    'Current page source document (edit this conservatively and preserve content):',
    JSON.stringify(sourceDocument, null, 2),
    '',
    'Current slide element summary (ordered top-to-bottom, for reference only):',
    JSON.stringify(elementsSummary, null, 2),
    '',
    'Return a repaired NotebookContentDocument for this same page.',
    'Keep the page focused. Do not add unrelated examples or sections.',
    'Do not shorten the worked solution. Preserve all meaningful steps and conclusions.',
  ].join('\n');
}

export async function POST(req: NextRequest) {
  return runWithRequestContext(req, '/api/classroom/repair-slide-math', async () => {
    try {
      const body = (await req.json()) as RepairRequestBody;
      const content = body.content;
      if (!content || content.type !== 'slide') {
        return apiError('MISSING_REQUIRED_FIELD', 400, 'slide content is required');
      }

      const sceneTitle = body.sceneTitle?.trim() || 'Slide';
      const language = body.language === 'en-US' ? 'en-US' : 'zh-CN';
      const semanticDocument = parseNotebookContentDocument(content.semanticDocument);
      const sourceDocument =
        semanticDocument ||
        buildFallbackDocumentFromSlideContent({
          sceneTitle,
          language,
          content,
        });

      const { model, modelInfo, modelString } = await resolveModelFromHeaders(req, {
        allowOpenAIModelOverride: true,
      });

      const system = buildSystemPrompt(language);
      const prompt = buildUserPrompt({
        sceneTitle,
        language,
        semanticDocument,
        content,
        repairInstructions: body.repairInstructions,
      });

      log.info(`Repairing slide math formatting [model=${modelString}]`);
      const result = await callLLM(
        {
          model,
          system,
          prompt,
          maxOutputTokens: modelInfo?.outputWindow,
        },
        'classroom-repair-slide-math',
      );

      const parsed = parseJsonResponse<RepairResponsePayload>(result.text);
      if (!parsed) {
        return apiError('PARSE_FAILED', 500, 'Failed to parse repaired slide response');
      }

      const document = parseNotebookContentDocument(parsed.document);
      if (!document) {
        return apiError(
          'PARSE_FAILED',
          500,
          'Model did not return a valid notebook content document',
        );
      }

      const sourceBlockCount = sourceDocument.blocks.length;
      const repairedBlockCount = document.blocks.length;
      const sourceSignal = estimateDocumentSignal(sourceDocument);
      const repairedSignal = estimateDocumentSignal(document);
      const placeholderCount = countSuspiciousPlaceholderBlocks(document);
      const sourceReasoningBlocks = countReasoningBlocks(sourceDocument);
      const repairedReasoningBlocks = countReasoningBlocks(document);

      if (
        repairedBlockCount < Math.max(2, Math.ceil(sourceBlockCount * 0.6)) ||
        repairedSignal < Math.max(40, Math.floor(sourceSignal * 0.55)) ||
        placeholderCount > 0 ||
        (sourceReasoningBlocks >= 2 && repairedReasoningBlocks < Math.max(2, sourceReasoningBlocks - 1))
      ) {
        return apiError(
          'GENERATION_FAILED',
          409,
          language === 'zh-CN'
            ? '修复结果疑似删掉了题解内容，已保留原页不做修改'
            : 'Repair result looked destructive, so the original slide was kept',
        );
      }

      const repairedSceneTitle = parsed.sceneTitle?.trim() || document.title?.trim() || sceneTitle;
      const renderedSlide = renderNotebookContentDocumentToSlide({
        document: {
          ...document,
          title: document.title || repairedSceneTitle,
        },
        fallbackTitle: repairedSceneTitle,
      });

      const repairedContent: SlideContent = {
        type: 'slide',
        canvas: {
          ...renderedSlide,
          id: content.canvas.id,
          theme: content.canvas.theme,
          background: content.canvas.background,
        },
        semanticDocument: {
          ...document,
          title: document.title || repairedSceneTitle,
        },
      };

      return apiSuccess({
        sceneTitle: repairedSceneTitle,
        content: repairedContent,
      });
    } catch (error) {
      log.error('repair-slide-math route error:', error);
      return apiError(
        'INTERNAL_ERROR',
        500,
        error instanceof Error ? error.message : String(error),
      );
    }
  });
}
