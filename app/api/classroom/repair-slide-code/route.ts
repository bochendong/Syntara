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
  looksLikeCodeSnippet,
  normalizeCompactText,
  normalizeRepairConversation,
  runSlideRepairAttempt,
  splitMeaningfulLines,
  summarizeElements,
  type RepairRequestBody,
  type SlideRepairLanguage,
} from '../repair-slide-shared';

const log = createLogger('Classroom Repair Slide Code API');

export const maxDuration = 180;

type RepairIntent = {
  hasInstructions: boolean;
  wantsExpansion: boolean;
  wantsStructureChange: boolean;
  wantsMinimalCodeOnly: boolean;
  wantsTrace: boolean;
  wantsOutput: boolean;
  hintsNeedAnotherPage: boolean;
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

    const lines = splitMeaningfulLines(item.text, 'trimEnd');
    if (lines.length === 0) continue;

    const joined = lines.join('\n');
    if (looksLikeCodeSnippet(joined)) {
      blocks.push({
        type: 'code_block',
        language: 'text',
        code: joined,
        caption: item.name || (args.language === 'en-US' ? 'Code snippet' : '代码片段'),
      });
      continue;
    }

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

    blocks.push({ type: 'paragraph', text: joined });
  }

  return {
    version: 1,
    language: args.language,
    profile: 'code',
    title: args.sceneTitle,
    blocks:
      blocks.length > 0
        ? blocks
        : [
            {
              type: 'paragraph',
              text:
                args.language === 'zh-CN'
                  ? '请保留当前页内容，只修复代码讲解结构。'
                  : 'Keep the current page content and only repair the code explanation structure.',
            },
          ],
  };
}

function countReasoningBlocks(doc: NotebookContentDocument): number {
  return doc.blocks.filter((block) => {
    if (block.type === 'code_walkthrough' || block.type === 'example') return true;
    if (block.type === 'code_block') return block.code.trim().length >= 20;
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
      '流程',
      '逐行',
      '步骤',
      'structure',
      'organize',
      'restructure',
      'flow',
      'step by step',
      'step-by-step',
      'line by line',
    ]),
    wantsMinimalCodeOnly: includesAny([
      '只修代码',
      '只修讲解',
      '不要改文案',
      '保留原文',
      '轻微修改',
      '小修',
      'code only',
      'do not rewrite',
      'keep wording',
      'minimal change',
    ]),
    wantsTrace: includesAny([
      'trace',
      '逐行',
      '逐步',
      '变量变化',
      '执行过程',
      '运行过程',
      'line by line',
      'step by step',
      'state change',
      'execution flow',
      'variable state',
    ]),
    wantsOutput: includesAny(['输出', '返回值', 'print', 'stdout', 'return value', 'output']),
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
  };
}

function countCodeStructureBlocks(doc: NotebookContentDocument): number {
  return doc.blocks.filter(
    (block) => block.type === 'code_block' || block.type === 'code_walkthrough',
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
  const reuseRatio = computeSegmentReuseRatio(sourceSegments, repairedSegments);

  const sourceSignal = estimateDocumentSignal(args.sourceDocument);
  const repairedSignal = estimateDocumentSignal(args.repairedDocument);
  const sourceReasoningBlocks = countReasoningBlocks(args.sourceDocument);
  const repairedReasoningBlocks = countReasoningBlocks(args.repairedDocument);
  const sourceCodeBlocks = countCodeStructureBlocks(args.sourceDocument);
  const repairedCodeBlocks = countCodeStructureBlocks(args.repairedDocument);
  const blockDelta = Math.abs(
    args.repairedDocument.blocks.length - args.sourceDocument.blocks.length,
  );

  if (args.intent.wantsMinimalCodeOnly) {
    return repairedSignal < Math.max(40, Math.floor(sourceSignal * 0.72));
  }

  if (
    args.intent.wantsExpansion &&
    repairedSignal < Math.max(sourceSignal + 24, Math.floor(sourceSignal * 1.12)) &&
    repairedReasoningBlocks <= sourceReasoningBlocks
  ) {
    return true;
  }

  if (args.intent.wantsTrace && repairedCodeBlocks < Math.max(1, sourceCodeBlocks)) {
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
  const codeStructureBlocks = countCodeStructureBlocks(args.document);
  if (args.language === 'zh-CN') {
    if (args.intent.wantsMinimalCodeOnly) {
      return '我已经优先修了代码块和讲解结构，正文尽量保持原意不变。';
    }
    if ((args.intent.wantsTrace || args.intent.wantsExpansion) && codeStructureBlocks > 0) {
      return '我把这页里的代码和讲解拆得更清楚了，更适合继续逐行追问执行过程。';
    }
    if (args.repairInstructions?.trim()) {
      return '我已经按你刚才的要求修了这一页代码讲解。你可以继续指定哪一段还要再展开。';
    }
    return '我已经先按默认规则修了这一页的代码讲解结构。你可以继续告诉我要补哪段 trace 或输出分析。';
  }

  if (args.intent.wantsMinimalCodeOnly) {
    return 'I focused on the code blocks and explanation structure while keeping the original wording as intact as possible.';
  }
  if ((args.intent.wantsTrace || args.intent.wantsExpansion) && codeStructureBlocks > 0) {
    return 'I separated the code and explanation more clearly, so it is easier to keep tracing execution from here.';
  }
  if (args.repairInstructions?.trim()) {
    return 'I repaired this code-explanation slide based on your instruction. You can keep refining it step by step.';
  }
  return 'I repaired the code explanation structure of this slide with the default repair rules.';
}

function buildSystemPrompt(language: SlideRepairLanguage, intent: RepairIntent) {
  if (language === 'zh-CN') {
    return `你是一个“课堂单页代码讲解与结构修复器”。

你的任务是修复一页课堂幻灯片里的代码呈现方式、执行解释和讲解结构，让它适合被结构化渲染，并且真正便于学生跟住代码逻辑。

要求：
- 教师在侧边栏输入的修复要求具有最高优先级，必须被明确响应，不能忽略。
- 只修复当前这一页，不要扩写成多页。
- 保留原页主题、代码意图、结论和大致信息量，不要引入不相关的新知识点。
- 不要删掉关键代码、执行步骤、复杂度结论、边界情况、输出分析或调试思路；如果拿不准，保留原内容。
- 优先在原有内容上做最小修改，而不是重写整页。
- 尽量保持原有 block 顺序与数量；除非某一块明显应该拆成“代码 + 讲解”或“代码 + 输出”，否则不要随意合并。
- 如果原页是“代码 walkthrough / trace / 调试”页，必须把关键执行链写清楚，不能只留下标题和空占位。
- 如果教师要求“补充说明 / 逐行解释 / 讲清楚输出 / 补变量变化”，结果必须体现出可见的内容级改进，而不是只换个说法。
- 如果教师暗示“这一页其实需要补页或拆页”，你仍然要先把当前页最缺的执行解释补出来，不能忽略要求。
- 把真正的代码放进结构化代码块：
  - 独立代码用 {"type":"code_block","language":"...","code":"..."}
  - 代码 + 分步骤解释优先用 {"type":"code_walkthrough", ...}
- 对变量状态、循环轮次、函数调用顺序、输入输出、复杂度或 bug 原因的解释，优先写进 code_walkthrough.steps、paragraph、bullet_list 或 callout。
- 如果原文里把大段代码和解释硬塞在同一个 paragraph 里，请拆开，不要继续把代码埋在普通 prose 中。
- 允许保留少量公式或符号，必要时可以用 equation，但不要让公式喧宾夺主。
- 不要输出 markdown，不要输出解释，不要输出代码块围栏，只输出 JSON。

输出 schema：
{
  "sceneTitle": "修复后的页标题",
  "assistantReply": "给教师的简短回复，1 到 2 句话，说明你这次具体怎么改了这一页",
  "document": {
    "version": 1,
    "language": "zh-CN",
    "profile": "code",
    "title": "可选，通常与 sceneTitle 一致",
    "blocks": [
      { "type": "heading", "level": 2, "text": "..." },
      { "type": "paragraph", "text": "..." },
      { "type": "bullet_list", "items": ["..."] },
      { "type": "code_block", "language": "python", "code": "...", "caption": "可选" },
      {
        "type": "code_walkthrough",
        "title": "可选",
        "language": "python",
        "code": "...",
        "caption": "可选",
        "steps": [{ "title": "可选", "focus": "可选", "explanation": "..." }],
        "output": "可选"
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
- wantsMinimalCodeOnly: ${intent.wantsMinimalCodeOnly ? 'yes' : 'no'}
- wantsTrace: ${intent.wantsTrace ? 'yes' : 'no'}
- wantsOutput: ${intent.wantsOutput ? 'yes' : 'no'}
- hintsNeedAnotherPage: ${intent.hintsNeedAnotherPage ? 'yes' : 'no'}`;
  }

  return `You repair the code explanation, code presentation, and teaching structure of a single classroom slide.

Requirements:
- The teacher's sidebar instruction has the highest priority and must be visibly addressed.
- Repair this page only. Do not expand it into multiple pages.
- Preserve the original topic, code intent, conclusions, and rough information density.
- Do not remove important code, execution steps, output analysis, complexity notes, edge cases, or debugging logic. If unsure, keep it.
- Prefer minimal edits to the existing blocks instead of rewriting the whole page.
- Keep the original block order and roughly the same number of blocks whenever possible.
- All visible teaching text in sceneTitle, assistantReply, and document blocks must be in English.
- If the source document is in Chinese or mixed-language, preserve the code meaning but rewrite the final visible teaching content into English.
- Do not leave Chinese text in headings, bullets, callouts, captions, walkthrough steps, outputs, or summaries unless it is an unavoidable proper noun from the source material.
- If this is a code walkthrough / tracing / debugging slide, keep the execution chain explicit. Do not collapse it into headings plus placeholders.
- If the teacher asks for more explanation, line-by-line tracing, or clearer output reasoning, make a visible content-level improvement rather than superficial rewording.
- If the teacher hints that this slide really needs another page, still strengthen the current page first instead of ignoring the request.
- Put real code into structured code blocks:
  - standalone code should use {"type":"code_block", ...}
  - code plus explanation should prefer {"type":"code_walkthrough", ...}
- Use paragraph / bullet_list / callout for explanation, debugging notes, output reasoning, complexity notes, or edge cases.
- If code and explanation are currently buried in one paragraph, split them apart.
- Output JSON only. No markdown. No commentary. No code fences.

Output schema:
{
  "sceneTitle": "repaired page title",
  "assistantReply": "a short reply to the teacher in 1-2 sentences describing what you changed",
  "document": {
    "version": 1,
    "language": "en-US",
    "profile": "code",
    "title": "optional",
    "blocks": []
  }
}

Current teacher intent:
- hasInstructions: ${intent.hasInstructions ? 'yes' : 'no'}
- wantsExpansion: ${intent.wantsExpansion ? 'yes' : 'no'}
- wantsStructureChange: ${intent.wantsStructureChange ? 'yes' : 'no'}
- wantsMinimalCodeOnly: ${intent.wantsMinimalCodeOnly ? 'yes' : 'no'}
- wantsTrace: ${intent.wantsTrace ? 'yes' : 'no'}
- wantsOutput: ${intent.wantsOutput ? 'yes' : 'no'}
- hintsNeedAnotherPage: ${intent.hintsNeedAnotherPage ? 'yes' : 'no'}`;
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
      ? 'Important: the source document may currently be in Chinese. Preserve the code meaning, but rewrite all final visible teaching text into English.'
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
    'Do not shorten the important code reasoning. Preserve meaningful steps, output analysis, and conclusions.',
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

  log.info(`Repairing slide code structure${args.retryReason ? ' retry=1' : ''}`);

  return runSlideRepairAttempt({
    req: args.req,
    system,
    prompt,
    usageTag: 'classroom-repair-slide-code',
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
    '/api/classroom/repair-slide-code',
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
              ? 'The previous attempt still contained Chinese text. Rewrite every visible title, heading, bullet, walkthrough step, output note, callout, caption, and summary into English while preserving the original code meaning.'
              : language === 'zh-CN'
              ? '上一版几乎没有体现教师输入的修复要求，请显式补足代码讲解或结构变化'
              : 'The previous attempt did not visibly follow the teacher instruction. Make the requested code explanation or structure change explicit.',
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
        '代码',
        '思路',
        '步骤',
        '输出',
        '解释',
        '分析',
        'trace',
        'walkthrough',
      ]);
      const sourceReasoningBlocks = countReasoningBlocks(sourceDocument);
      const repairedReasoningBlocks = countReasoningBlocks(document);
      const sourceCodeBlocks = countCodeStructureBlocks(sourceDocument);
      const repairedCodeBlocks = countCodeStructureBlocks(document);

      if (
        repairedBlockCount < Math.max(2, Math.ceil(sourceBlockCount * 0.6)) ||
        repairedSignal < Math.max(40, Math.floor(sourceSignal * 0.55)) ||
        placeholderCount > 0 ||
        (sourceReasoningBlocks >= 2 &&
          repairedReasoningBlocks < Math.max(2, sourceReasoningBlocks - 1)) ||
        (sourceCodeBlocks >= 1 && repairedCodeBlocks < 1) ||
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
              : '修复结果疑似删掉了关键代码讲解，已保留原页不做修改'
            : languageMismatch
              ? 'The repaired slide still contained Chinese text, so the original slide was kept'
              : instructionIgnored
              ? repairIntent.hintsNeedAnotherPage
                ? 'The request looked more like an add-a-page task, so the original slide was kept'
                : 'The AI did not visibly follow your repair instruction, so the original slide was kept'
              : 'Repair result looked destructive to the code explanation, so the original slide was kept',
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
        profile: 'code',
        sceneTitle: repairedSceneTitle,
      });

      return apiSuccess({
        sceneTitle: repairedSceneTitle,
        assistantReply,
        content: repairedContent,
      });
    } catch (error) {
      log.error('repair-slide-code route error:', error);
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
      operationCode: 'slide_repair_code',
      chargeReason: '修复当前代码页面',
    },
  );
}
