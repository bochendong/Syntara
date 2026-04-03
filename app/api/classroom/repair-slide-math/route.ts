import { NextRequest } from 'next/server';
import { parseNotebookContentDocument, type NotebookContentDocument } from '@/lib/notebook-content';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { runWithRequestContext } from '@/lib/server/request-context';
import type { SlideContent } from '@/lib/types/stage';
import type { SlideRepairConversationTurn } from '@/lib/types/slide-repair';
import {
  buildRenderedRepairContent,
  countSuspiciousPlaceholderBlocks,
  computeSegmentReuseRatio,
  estimateDocumentSignal,
  getDocumentComparableSegments,
  repairOutputHasUnexpectedCjk,
  normalizeCompactText,
  normalizeRepairConversation,
  runSlideRepairAttempt,
  splitMeaningfulLines,
  summarizeElements,
  type RepairRequestBody,
  type SlideRepairLanguage,
} from '../repair-slide-shared';

const log = createLogger('Classroom Repair Slide Math API');

export const maxDuration = 180;

type RepairIntent = {
  hasInstructions: boolean;
  wantsExpansion: boolean;
  wantsStructureChange: boolean;
  wantsMinimalMathOnly: boolean;
  hintsNeedAnotherPage: boolean;
  wantsExplicitDerivation: boolean;
};

function buildFallbackDocumentFromSlideContent(args: {
  sceneTitle: string;
  language: SlideRepairLanguage;
  content: SlideContent;
}): NotebookContentDocument {
  const blocks: NotebookContentDocument['blocks'] = [];
  const items = summarizeElements(args.content.canvas.elements);

  for (const item of items) {
    if (item.type === 'latex') {
      blocks.push({ type: 'equation', latex: item.latex, display: true });
      continue;
    }

    if (item.type === 'table') {
      blocks.push({
        type: 'table',
        caption: item.name || undefined,
        rows: item.rows,
      });
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
    profile: 'math',
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

function countReasoningBlocks(doc: NotebookContentDocument): number {
  return doc.blocks.filter((block) => {
    if (block.type === 'derivation_steps' || block.type === 'example') return true;
    if (block.type === 'equation') return true;
    if (block.type === 'matrix') return true;
    if (block.type === 'bullet_list') return block.items.length >= 2;
    if (block.type === 'paragraph') return normalizeCompactText(block.text).length >= 30;
    return false;
  }).length;
}

function inferRepairIntent(repairInstructions?: string): RepairIntent {
  const raw = repairInstructions?.trim() || '';
  const normalized = raw.toLowerCase();

  const includesAny = (keywords: string[]) =>
    keywords.some((keyword) => raw.includes(keyword) || normalized.includes(keyword));

  return {
    hasInstructions: raw.length > 0,
    wantsExpansion: includesAny([
      '补充',
      '补全',
      '展开',
      '详细',
      '讲清楚',
      '讲明白',
      '更完整',
      '完整一点',
      '扩写',
      'step by step',
      'step-by-step',
      'expand',
      'more detail',
      'detailed',
      'clarify',
      'explain',
      'complete',
      'fill in',
    ]),
    wantsStructureChange: includesAny([
      '结构',
      '层次',
      '重组',
      '重新组织',
      '整理',
      '分点',
      '拆开',
      '思路',
      '推导',
      '证明过程',
      '步骤',
      'structure',
      'organize',
      'restructure',
      'flow',
      'proof',
      'derivation',
      'steps',
    ]),
    wantsMinimalMathOnly: includesAny([
      '只修公式',
      '只修数学',
      '只修 latex',
      '只修latex',
      '只修符号',
      '不要改文案',
      '保留原文',
      '轻微修改',
      '小修',
      'math only',
      'notation only',
      'latex only',
      'symbol only',
      'do not rewrite',
      'keep wording',
    ]),
    hintsNeedAnotherPage: includesAny([
      '加新的页',
      '加一页',
      '补一页',
      '新的一页',
      '拆成两页',
      '拆成 2 页',
      '拆成2页',
      'another page',
      'new page',
      'add a page',
      'split into two pages',
      'split into 2 pages',
      'multi-page',
    ]),
    wantsExplicitDerivation: includesAny([
      '推导',
      '证明',
      '证明过程',
      '关键步骤',
      '步骤',
      'derive',
      'derivation',
      'proof',
      'reasoning',
      'step by step',
      'step-by-step',
      'steps',
    ]),
  };
}

function countMathStructureBlocks(doc: NotebookContentDocument): number {
  return doc.blocks.filter(
    (block) =>
      block.type === 'equation' || block.type === 'matrix' || block.type === 'derivation_steps',
  ).length;
}

function looksLikeInstructionWasIgnored(args: {
  sourceDocument: NotebookContentDocument;
  repairedDocument: NotebookContentDocument;
  intent: RepairIntent;
}): boolean {
  if (!args.intent.hasInstructions) return false;

  const sourceSegments = getDocumentComparableSegments(args.sourceDocument);
  const repairedSegments = getDocumentComparableSegments(args.repairedDocument);
  const sourceText = sourceSegments.join('\n');
  const repairedText = repairedSegments.join('\n');
  if (sourceText === repairedText) return true;

  const reuseRatio = computeSegmentReuseRatio(sourceSegments, repairedSegments);

  const sourceSignal = estimateDocumentSignal(args.sourceDocument);
  const repairedSignal = estimateDocumentSignal(args.repairedDocument);
  const sourceReasoningBlocks = countReasoningBlocks(args.sourceDocument);
  const repairedReasoningBlocks = countReasoningBlocks(args.repairedDocument);
  const sourceMathStructureBlocks = countMathStructureBlocks(args.sourceDocument);
  const repairedMathStructureBlocks = countMathStructureBlocks(args.repairedDocument);
  const blockDelta = Math.abs(
    args.repairedDocument.blocks.length - args.sourceDocument.blocks.length,
  );

  if (args.intent.wantsMinimalMathOnly) {
    return repairedSignal < Math.max(40, Math.floor(sourceSignal * 0.72));
  }

  if (
    args.intent.wantsExpansion &&
    repairedSignal < Math.max(sourceSignal + 24, Math.floor(sourceSignal * 1.12)) &&
    repairedReasoningBlocks <= sourceReasoningBlocks
  ) {
    return true;
  }

  if (
    args.intent.wantsExplicitDerivation &&
    repairedMathStructureBlocks <= sourceMathStructureBlocks &&
    repairedReasoningBlocks <= sourceReasoningBlocks
  ) {
    return true;
  }

  if (
    args.intent.wantsStructureChange &&
    reuseRatio > 0.9 &&
    repairedReasoningBlocks <= sourceReasoningBlocks &&
    blockDelta <= 1
  ) {
    return true;
  }

  if (
    args.intent.hintsNeedAnotherPage &&
    repairedSignal < Math.max(sourceSignal + 30, Math.floor(sourceSignal * 1.15)) &&
    repairedReasoningBlocks <= sourceReasoningBlocks
  ) {
    return true;
  }

  return (
    reuseRatio > 0.94 &&
    repairedSignal <= Math.max(sourceSignal + 12, Math.floor(sourceSignal * 1.03))
  );
}

function buildFallbackAssistantReply(args: {
  language: SlideRepairLanguage;
  intent: RepairIntent;
  repairInstructions?: string;
  document: NotebookContentDocument;
}): string {
  const mathStructureBlocks = countMathStructureBlocks(args.document);
  if (args.language === 'zh-CN') {
    if (args.intent.wantsMinimalMathOnly) {
      return '我已经按你的要求优先修了公式、符号和上下标，正文尽量保持不变。';
    }
    if (
      (args.intent.wantsExpansion || args.intent.wantsStructureChange) &&
      mathStructureBlocks > 0
    ) {
      return '我把这一页里关键的数学表达尽量拆成了更清楚的公式或推导块，你可以继续告诉我哪一步还要再展开。';
    }
    if (args.intent.wantsExpansion || args.intent.wantsStructureChange) {
      return '我已经先把这一页的层次整理得更清楚了，但如果你想补完整证明，下一步更适合继续追着某一步展开。';
    }
    if (args.repairInstructions?.trim()) {
      return '我已经按你刚才的要求修了这一页。你可以继续补充更细的修改意见。';
    }
    return '我已经先按默认规则修了这一页的数学表达和讲解结构。你可以继续告诉我要保留或补强哪一部分。';
  }

  if (args.intent.wantsMinimalMathOnly) {
    return 'I focused on formulas, notation, and subscripts while keeping the wording as intact as possible.';
  }
  if ((args.intent.wantsExpansion || args.intent.wantsStructureChange) && mathStructureBlocks > 0) {
    return 'I split more of the key math into clearer equation or derivation blocks. You can ask me to expand any specific step next.';
  }
  if (args.intent.wantsExpansion || args.intent.wantsStructureChange) {
    return 'I clarified the slide structure first. If you want a fuller proof, tell me which step to expand next.';
  }
  if (args.repairInstructions?.trim()) {
    return 'I repaired this slide based on your instruction. You can keep refining it with follow-up requests.';
  }
  return 'I repaired the math notation and teaching structure of this slide with the default repair rules.';
}

function buildSystemPrompt(language: SlideRepairLanguage, intent: RepairIntent) {
  if (language === 'zh-CN') {
    return `你是一个“课堂单页数学内容与排版修复器”。

你的任务是修复一页课堂幻灯片里的数学记号、公式表达，以及讲解结构，让它适合被结构化渲染并且真正便于学生理解。

要求：
- 教师在侧边栏输入的修复要求具有最高优先级，必须被明确响应，不能忽略。
- 只修复当前这一页，不要扩写成多页。
- 保留原页主题、结论、层次和大致信息量，不要引入新的知识点。
- 不要删掉题解、步骤、结论、已知条件、易错点、答案或推导过程；如果拿不准，保留原内容。
- 优先在原有内容上做最小修改，而不是重写整页。
- 尽量保持原有 block 顺序与数量；除非某一块明显应该拆成“说明 + 公式”，否则不要合并或删减。
- 如果原页是“例题 / 证明 / 推导”页，必须把关键推导链明确写出来，不能只保留题目、标题和空占位。
- 不要输出空标题、空小节或占位块，例如“已知：”“证明：”“思路：”后面没有实质内容的结构。
- 如果原页里有两个结论，优先按“结论 1 -> 推导 -> 结论 2 -> 推导”或“已知 -> 推导 -> 结论”的方式整理清楚。
- 如果教师要求“补充说明 / 展开推导 / 讲清楚”，结果必须体现出可见的内容级改进，而不是只换个说法。
- 如果教师暗示“这一页其实需要补页或拆页”，你仍然要先把当前页中最缺的推导或解释补出来，不能装作没看到这个要求。
- 重点修复数学对象、映射、集合、等式、核、像、同余类、下标、上标等表达。
- 把真正的数学表达放进结构化公式块：
  - 单个或独立公式用 {"type":"equation","latex":"...","display":true}
  - 独立矩阵优先用 {"type":"matrix","rows":[...],"brackets":"bmatrix",...}
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
  "assistantReply": "给教师的简短回复，1 到 2 句话，说明你这次具体怎么改了这一页",
  "document": {
    "version": 1,
    "language": "zh-CN",
    "profile": "math",
    "title": "可选，通常与 sceneTitle 一致",
    "blocks": [
      { "type": "heading", "level": 2, "text": "..." },
      { "type": "paragraph", "text": "..." },
      { "type": "bullet_list", "items": ["..."] },
      { "type": "equation", "latex": "...", "display": true },
      { "type": "matrix", "rows": [["a", "b"], ["c", "d"]], "brackets": "bmatrix", "label": "可选", "caption": "可选" },
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
}

当前教师意图：
- hasInstructions: ${intent.hasInstructions ? 'yes' : 'no'}
- wantsExpansion: ${intent.wantsExpansion ? 'yes' : 'no'}
- wantsStructureChange: ${intent.wantsStructureChange ? 'yes' : 'no'}
- wantsMinimalMathOnly: ${intent.wantsMinimalMathOnly ? 'yes' : 'no'}
- hintsNeedAnotherPage: ${intent.hintsNeedAnotherPage ? 'yes' : 'no'}
- wantsExplicitDerivation: ${intent.wantsExplicitDerivation ? 'yes' : 'no'}`;
  }

  return `You repair the mathematical notation, content structure, and teaching clarity of a single classroom slide.

Requirements:
- The teacher's sidebar instruction has the highest priority and must be visibly addressed.
- Repair this page only. Do not expand it into multiple pages.
- Preserve the original topic, meaning, and rough information density.
- Do not remove solution steps, givens, conclusions, or answer content. If unsure, keep it.
- Prefer minimal edits to the existing blocks instead of rewriting the page.
- Keep the original block order and roughly the same number of blocks whenever possible.
- All visible teaching text in sceneTitle, assistantReply, and document blocks must be in English.
- If the source document is in Chinese or mixed-language, preserve the math meaning but rewrite the final visible teaching content into English.
- Do not leave Chinese text in headings, bullets, callouts, captions, derivation explanations, or summaries unless it is an unavoidable proper noun from the source material.
- If this is a proof / derivation / worked-example slide, keep the reasoning explicit. Do not collapse it into headings plus placeholders.
- Do not output empty section headers or placeholder blocks such as "Given:", "Proof:", or "Idea:" without substantive content after them.
- If the teacher asks for more explanation or clearer derivation, make a visible content-level improvement rather than superficial rewording.
- If the teacher hints that this slide really needs another page, still strengthen the current page instead of ignoring the request.
- Convert malformed mathematical notation into structured math blocks.
- Use equation blocks for standalone math, matrix blocks for standalone matrices, and derivation_steps for multi-line reasoning.
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
  "assistantReply": "a short reply to the teacher in 1-2 sentences describing what you changed",
  "document": {
    "version": 1,
    "language": "en-US",
    "profile": "math",
    "title": "optional",
    "blocks": []
  }
}

Current teacher intent:
- hasInstructions: ${intent.hasInstructions ? 'yes' : 'no'}
- wantsExpansion: ${intent.wantsExpansion ? 'yes' : 'no'}
- wantsStructureChange: ${intent.wantsStructureChange ? 'yes' : 'no'}
- wantsMinimalMathOnly: ${intent.wantsMinimalMathOnly ? 'yes' : 'no'}
- hintsNeedAnotherPage: ${intent.hintsNeedAnotherPage ? 'yes' : 'no'}
- wantsExplicitDerivation: ${intent.wantsExplicitDerivation ? 'yes' : 'no'}`;
}

function buildUserPrompt(args: {
  sceneTitle: string;
  language: SlideRepairLanguage;
  semanticDocument: NotebookContentDocument | null;
  content: SlideContent;
  repairInstructions?: string;
  repairConversation?: SlideRepairConversationTurn[];
  retryReason?: string;
}): string {
  const elementsSummary = summarizeElements(args.content.canvas.elements);
  const sourceDocument =
    args.semanticDocument ||
    buildFallbackDocumentFromSlideContent({
      sceneTitle: args.sceneTitle,
      language: args.language,
      content: args.content,
    });
  const repairConversation = normalizeRepairConversation(args.repairConversation);

  return [
    `Language: ${args.language}`,
    `Current page title: ${args.sceneTitle}`,
    args.language === 'en-US'
      ? 'Important: the source document may currently be in Chinese. Preserve the math content, but rewrite all final visible teaching text into English.'
      : '重要：如果原页里夹杂其他语言，最终输出仍必须统一为中文。',
    args.repairInstructions?.trim()
      ? `Teacher instruction (highest priority): ${args.repairInstructions.trim()}`
      : 'Teacher instruction (highest priority): none',
    args.retryReason ? `Previous attempt was rejected because: ${args.retryReason}` : null,
    '',
    repairConversation.length > 0 ? 'Recent repair conversation:' : null,
    repairConversation.length > 0 ? JSON.stringify(repairConversation, null, 2) : null,
    repairConversation.length > 0 ? '' : null,
    'Current page source document (edit this conservatively and preserve content):',
    JSON.stringify(sourceDocument, null, 2),
    '',
    'Current slide element summary (ordered top-to-bottom, for reference only):',
    JSON.stringify(elementsSummary, null, 2),
    '',
    'Return a repaired NotebookContentDocument for this same page.',
    'Keep the page focused. Do not add unrelated examples or sections.',
    'Do not shorten the worked solution. Preserve all meaningful steps and conclusions.',
    'If the teacher gave a repair instruction, the final result must visibly satisfy it.',
  ]
    .filter(Boolean)
    .join('\n');
}

async function runRepairAttempt(args: {
  req: NextRequest;
  sceneTitle: string;
  language: SlideRepairLanguage;
  semanticDocument: NotebookContentDocument | null;
  content: SlideContent;
  repairInstructions?: string;
  repairConversation?: SlideRepairConversationTurn[];
  retryReason?: string;
  intent: RepairIntent;
}) {
  const system = buildSystemPrompt(args.language, args.intent);
  const prompt = buildUserPrompt({
    sceneTitle: args.sceneTitle,
    language: args.language,
    semanticDocument: args.semanticDocument,
    content: args.content,
    repairInstructions: args.repairInstructions,
    repairConversation: args.repairConversation,
    retryReason: args.retryReason,
  });

  log.info(`Repairing slide math formatting${args.retryReason ? ' retry=1' : ''}`);

  return runSlideRepairAttempt({
    req: args.req,
    system,
    prompt,
    usageTag: 'classroom-repair-slide-math',
  });
}

export async function POST(req: NextRequest) {
  let body: RepairRequestBody;
  try {
    body = (await req.json()) as RepairRequestBody;
  } catch {
    return apiError('INVALID_REQUEST', 400, 'Invalid request body');
  }

  const sceneTitle = body.sceneTitle?.trim() || 'Slide';

  return runWithRequestContext(
    req,
    '/api/classroom/repair-slide-math',
    async () => {
    try {
      const content = body.content;
      if (!content || content.type !== 'slide') {
        return apiError('MISSING_REQUIRED_FIELD', 400, 'slide content is required');
      }

      const language = body.language === 'en-US' ? 'en-US' : 'zh-CN';
      const semanticDocument = parseNotebookContentDocument(content.semanticDocument);
      const sourceDocument =
        semanticDocument ||
        buildFallbackDocumentFromSlideContent({
          sceneTitle,
          language,
          content,
        });
      const repairIntent = inferRepairIntent(body.repairInstructions);

      let attempt = await runRepairAttempt({
        req,
        sceneTitle,
        language,
        semanticDocument,
        content,
        repairInstructions: body.repairInstructions,
        repairConversation: body.repairConversation,
        intent: repairIntent,
      });

      let parsed = attempt.parsed;
      let document = attempt.document;
      let instructionIgnored = looksLikeInstructionWasIgnored({
        sourceDocument,
        repairedDocument: document,
        intent: repairIntent,
      });
      let languageMismatch = repairOutputHasUnexpectedCjk(
        {
          sceneTitle: parsed.sceneTitle,
          assistantReply: parsed.assistantReply,
          document,
        },
        language,
      );

      if (instructionIgnored || languageMismatch) {
        attempt = await runRepairAttempt({
          req,
          sceneTitle,
          language,
          semanticDocument,
          content,
          repairInstructions: body.repairInstructions,
          repairConversation: body.repairConversation,
          retryReason:
            language === 'en-US' && languageMismatch
              ? 'The previous attempt still contained Chinese text. Rewrite every visible title, heading, bullet, derivation explanation, callout, caption, and summary into English while preserving the mathematical meaning.'
              : language === 'zh-CN'
              ? '上一版几乎没有体现教师输入的修复要求，请显式按要求补足内容或结构变化'
              : 'The previous attempt did not visibly follow the teacher instruction. Make the requested content or structure change explicit.',
          intent: repairIntent,
        });
        parsed = attempt.parsed;
        document = attempt.document;
        instructionIgnored = looksLikeInstructionWasIgnored({
          sourceDocument,
          repairedDocument: document,
          intent: repairIntent,
        });
        languageMismatch = repairOutputHasUnexpectedCjk(
          {
            sceneTitle: parsed.sceneTitle,
            assistantReply: parsed.assistantReply,
            document,
          },
          language,
        );
      }

      const sourceBlockCount = sourceDocument.blocks.length;
      const repairedBlockCount = document.blocks.length;
      const sourceSignal = estimateDocumentSignal(sourceDocument);
      const repairedSignal = estimateDocumentSignal(document);
      const placeholderCount = countSuspiciousPlaceholderBlocks(document, [
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
      ]);
      const sourceReasoningBlocks = countReasoningBlocks(sourceDocument);
      const repairedReasoningBlocks = countReasoningBlocks(document);

      if (
        repairedBlockCount < Math.max(2, Math.ceil(sourceBlockCount * 0.6)) ||
        repairedSignal < Math.max(40, Math.floor(sourceSignal * 0.55)) ||
        placeholderCount > 0 ||
        (sourceReasoningBlocks >= 2 &&
          repairedReasoningBlocks < Math.max(2, sourceReasoningBlocks - 1)) ||
        instructionIgnored ||
        languageMismatch
      ) {
        return apiError(
          'GENERATION_FAILED',
          409,
          language === 'zh-CN'
            ? instructionIgnored
              ? repairIntent.hintsNeedAnotherPage
                ? 'AI 本轮没有真正按你的要求补足内容；这类请求更像需要补页，已保留原页不做修改'
                : 'AI 本轮没有真正按你的要求把这一页修到位，已保留原页不做修改'
              : languageMismatch
                ? 'AI 本轮输出仍混入了英文课堂不该出现的中文，已保留原页不做修改'
              : '修复结果疑似删掉了题解内容，已保留原页不做修改'
            : languageMismatch
              ? 'The repaired slide still contained Chinese text, so the original slide was kept'
              : instructionIgnored
              ? repairIntent.hintsNeedAnotherPage
                ? 'The request looked more like an add-a-page task, so the original slide was kept'
                : 'The AI did not visibly follow your repair instruction, so the original slide was kept'
              : 'Repair result looked destructive, so the original slide was kept',
        );
      }

      const repairedSceneTitle = parsed.sceneTitle?.trim() || document.title?.trim() || sceneTitle;
      const assistantReply =
        parsed.assistantReply?.trim() ||
        buildFallbackAssistantReply({
          language,
          intent: repairIntent,
          repairInstructions: body.repairInstructions,
          document,
        });
      const repairedContent = buildRenderedRepairContent({
        content,
        document,
        profile: 'math',
        sceneTitle: repairedSceneTitle,
      });

      return apiSuccess({
        sceneTitle: repairedSceneTitle,
        assistantReply,
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
    },
    {
      notebookId: body.notebookId?.trim() || undefined,
      notebookName: body.notebookName?.trim() || undefined,
      sceneId: body.sceneId?.trim() || undefined,
      sceneTitle,
      sceneOrder:
        typeof body.sceneOrder === 'number' && Number.isFinite(body.sceneOrder)
          ? Math.max(1, Math.round(body.sceneOrder))
          : undefined,
      sceneType: 'slide',
      operationCode: 'slide_repair_math',
      chargeReason: '修复当前数学页面',
    },
  );
}
