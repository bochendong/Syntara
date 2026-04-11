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

const log = createLogger('Classroom Repair Slide General API');

export const maxDuration = 180;

type RepairIntent = {
  hasInstructions: boolean;
  wantsExpansion: boolean;
  wantsStructureChange: boolean;
  wantsMinimalEdits: boolean;
  wantsExamples: boolean;
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
    profile: 'general',
    archetype: 'concept',
    title: args.sceneTitle,
    blocks:
      blocks.length > 0
        ? blocks
        : [
            {
              type: 'paragraph',
              text:
                args.language === 'zh-CN'
                  ? '请保留当前页主题，只修复讲解结构和表达清晰度。'
                  : 'Keep the current topic and only repair the teaching structure and clarity.',
            },
          ],
  };
}

function countSupportBlocks(doc: NotebookContentDocument): number {
  return doc.blocks.filter((block) => {
    if (block.type === 'bullet_list') return block.items.length >= 2;
    if (block.type === 'paragraph') return normalizeCompactText(block.text).length >= 30;
    if (block.type === 'callout') return true;
    if (block.type === 'table') return block.rows.length >= 1;
    if (block.type === 'example') return true;
    if (block.type === 'code_block') return block.code.trim().length >= 20;
    if (block.type === 'code_walkthrough') return true;
    if (block.type === 'equation' || block.type === 'matrix' || block.type === 'derivation_steps') {
      return true;
    }
    return false;
  }).length;
}

function countTeachingAidBlocks(doc: NotebookContentDocument): number {
  return doc.blocks.filter((block) => {
    return (
      block.type === 'bullet_list' ||
      block.type === 'table' ||
      block.type === 'callout' ||
      block.type === 'example' ||
      block.type === 'code_walkthrough' ||
      block.type === 'derivation_steps'
    );
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
      '总结',
      '重点',
      '逻辑',
      'structure',
      'organize',
      'restructure',
      'flow',
      'summary',
      'key takeaway',
    ]),
    wantsMinimalEdits: includesAny([
      '不要大改',
      '不要改太多',
      '保留原文',
      '轻微修改',
      '小修',
      'minimal change',
      'do not rewrite',
      'keep wording',
      'keep most of it',
    ]),
    wantsExamples: includesAny([
      '例子',
      '示例',
      '案例',
      '举例',
      '应用',
      'example',
      'examples',
      'case',
      'case study',
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
  };
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
  const sourceSupportBlocks = countSupportBlocks(args.sourceDocument);
  const repairedSupportBlocks = countSupportBlocks(args.repairedDocument);
  const sourceTeachingAids = countTeachingAidBlocks(args.sourceDocument);
  const repairedTeachingAids = countTeachingAidBlocks(args.repairedDocument);
  const blockDelta = Math.abs(
    args.repairedDocument.blocks.length - args.sourceDocument.blocks.length,
  );

  if (args.intent.wantsMinimalEdits) {
    return repairedSignal < Math.max(40, Math.floor(sourceSignal * 0.72));
  }

  if (
    args.intent.wantsExpansion &&
    repairedSignal < Math.max(sourceSignal + 24, Math.floor(sourceSignal * 1.1)) &&
    repairedSupportBlocks <= sourceSupportBlocks
  ) {
    return true;
  }

  if (
    args.intent.wantsExamples &&
    repairedTeachingAids <= sourceTeachingAids &&
    reuseRatio > 0.9 &&
    repairedSignal <= Math.max(sourceSignal + 18, Math.floor(sourceSignal * 1.08))
  ) {
    return true;
  }

  if (
    args.intent.wantsStructureChange &&
    reuseRatio > 0.91 &&
    repairedTeachingAids <= sourceTeachingAids &&
    blockDelta <= 1
  ) {
    return true;
  }

  if (
    args.intent.hintsNeedAnotherPage &&
    repairedSignal < Math.max(sourceSignal + 30, Math.floor(sourceSignal * 1.12)) &&
    repairedSupportBlocks <= sourceSupportBlocks
  ) {
    return true;
  }

  return (
    reuseRatio > 0.95 &&
    repairedSignal <= Math.max(sourceSignal + 12, Math.floor(sourceSignal * 1.03))
  );
}

function buildFallbackAssistantReply(args: {
  language: SlideRepairLanguage;
  intent: RepairIntent;
  repairInstructions?: string;
  document: NotebookContentDocument;
}): string {
  const teachingAids = countTeachingAidBlocks(args.document);
  if (args.language === 'zh-CN') {
    if (args.intent.wantsMinimalEdits) {
      return '我按你的要求尽量保留了原文，只把这一页的讲解结构和表达清晰度修顺了。';
    }
    if ((args.intent.wantsExpansion || args.intent.wantsExamples) && teachingAids > 0) {
      return '我把这页内容拆得更适合讲授了，也补强了支撑理解的结构块，方便你继续往下细化。';
    }
    if (args.repairInstructions?.trim()) {
      return '我已经按你刚才的要求修了这一页通用讲解内容。你可以继续指定哪一部分还要再调整。';
    }
    return '我已经先按默认规则修了这一页的讲解结构和重点表达。你可以继续告诉我要保留或补强哪一部分。';
  }

  if (args.intent.wantsMinimalEdits) {
    return 'I kept most of the original wording and mainly repaired the teaching structure and clarity of this slide.';
  }
  if ((args.intent.wantsExpansion || args.intent.wantsExamples) && teachingAids > 0) {
    return 'I made this slide easier to teach through by strengthening the supporting structure around the core ideas.';
  }
  if (args.repairInstructions?.trim()) {
    return 'I repaired this general teaching slide based on your instruction. You can keep steering the next refinement.';
  }
  return 'I repaired the teaching structure and clarity of this slide with the default repair rules.';
}

function buildSystemPrompt(language: SlideRepairLanguage, intent: RepairIntent) {
  if (language === 'zh-CN') {
    return `你是一个“课堂单页通用讲解与结构修复器”。

你的任务是修复一页课堂幻灯片里的讲解结构、表达清晰度和教学可读性，让它适合被结构化渲染，并且真正便于学生理解。

要求：
- 教师在侧边栏输入的修复要求具有最高优先级，必须被明确响应，不能忽略。
- 只修复当前这一页，不要扩写成多页。
- 保留原页主题、事实、例子、结论和大致信息量，不要引入不相关的新知识点。
- 不要删掉关键说明、比较、结论、案例、表格信息、提示或总结；如果拿不准，保留原内容。
- 优先在原有内容上做最小修改，而不是重写整页。
- 尽量保持原有 block 顺序与数量；除非某一块明显应该拆成“说明 + 要点”或“说明 + 表格/示例”，否则不要随意合并。
- 如果教师要求“补充说明 / 讲清楚 / 层次更清楚 / 举例”，结果必须体现出可见的内容级改进，而不是只换个说法。
- 如果教师暗示“这一页其实需要补页或拆页”，你仍然要先把当前页最缺的解释或结构补出来，不能忽略要求。
- 优先使用通用结构块：
  - heading / paragraph / bullet_list / table / callout / example
- 如果原页里已经有必要的公式或代码，可以保留 equation / code_block / code_walkthrough，但不要把页面变成数学页或代码页。
- 如果原文把大量信息硬塞在同一个 paragraph 里，请拆开，不要继续堆成大段 prose。
- 不要输出空标题、空小节或占位块，例如“重点：”“示例：”“步骤：”后面没有实质内容。
- 不要输出 markdown，不要输出解释，不要输出代码块围栏，只输出 JSON。

输出 schema：
{
  "sceneTitle": "修复后的页标题",
  "assistantReply": "给教师的简短回复，1 到 2 句话，说明你这次具体怎么改了这一页",
  "document": {
    "version": 1,
    "language": "zh-CN",
    "profile": "general",
    "title": "可选，通常与 sceneTitle 一致",
    "blocks": [
      { "type": "heading", "level": 2, "text": "..." },
      { "type": "paragraph", "text": "..." },
      { "type": "bullet_list", "items": ["..."] },
      { "type": "table", "caption": "可选", "rows": [["..."]] },
      {
        "type": "callout",
        "tone": "info" | "success" | "warning" | "danger" | "tip",
        "title": "可选",
        "text": "..."
      },
      {
        "type": "example",
        "title": "可选",
        "problem": "...",
        "givens": ["..."],
        "goal": "可选",
        "steps": ["..."],
        "answer": "可选",
        "pitfalls": ["..."]
      }
    ]
  }
}

当前教师意图：
- hasInstructions: ${intent.hasInstructions ? 'yes' : 'no'}
- wantsExpansion: ${intent.wantsExpansion ? 'yes' : 'no'}
- wantsStructureChange: ${intent.wantsStructureChange ? 'yes' : 'no'}
- wantsMinimalEdits: ${intent.wantsMinimalEdits ? 'yes' : 'no'}
- wantsExamples: ${intent.wantsExamples ? 'yes' : 'no'}
- hintsNeedAnotherPage: ${intent.hintsNeedAnotherPage ? 'yes' : 'no'}`;
  }

  return `You repair the teaching structure, explanatory clarity, and classroom readability of a single classroom slide.

Requirements:
- The teacher's sidebar instruction has the highest priority and must be visibly addressed.
- Repair this page only. Do not expand it into multiple pages.
- Preserve the original topic, facts, examples, conclusions, and rough information density.
- Do not remove important explanations, comparisons, tables, examples, hints, or takeaways. If unsure, keep them.
- Prefer minimal edits to the existing blocks instead of rewriting the whole page.
- Keep the original block order and roughly the same number of blocks whenever possible.
- All visible teaching text in sceneTitle, assistantReply, and document blocks must be in English.
- If the source document is in Chinese or mixed-language, preserve its meaning and structure but rewrite the final visible content into English.
- Do not leave Chinese text in headings, bullets, tables, callouts, examples, captions, or summaries unless it is an unavoidable proper noun from the source material.
- If the teacher asks for more explanation, clearer hierarchy, or better examples, make a visible content-level improvement rather than superficial rewording.
- If the teacher hints that this slide really needs another page, still strengthen the current page first instead of ignoring the request.
- Prefer general structure blocks such as heading, paragraph, bullet_list, table, callout, and example.
- If the source already contains essential formulas or code, you may keep equation, code_block, or code_walkthrough blocks, but do not turn the slide into a math or code page.
- If too much content is buried in one paragraph, split it into more teachable blocks.
- Do not output empty section headers or placeholder blocks such as "Key Point:" or "Example:" without substantive content after them.
- Output JSON only. No markdown. No commentary. No code fences.

Output schema:
{
  "sceneTitle": "repaired page title",
  "assistantReply": "a short reply to the teacher in 1-2 sentences describing what you changed",
  "document": {
    "version": 1,
    "language": "en-US",
    "profile": "general",
    "title": "optional",
    "blocks": []
  }
}

Current teacher intent:
- hasInstructions: ${intent.hasInstructions ? 'yes' : 'no'}
- wantsExpansion: ${intent.wantsExpansion ? 'yes' : 'no'}
- wantsStructureChange: ${intent.wantsStructureChange ? 'yes' : 'no'}
- wantsMinimalEdits: ${intent.wantsMinimalEdits ? 'yes' : 'no'}
- wantsExamples: ${intent.wantsExamples ? 'yes' : 'no'}
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
      ? 'Important: the source document may currently be in Chinese. Preserve the meaning, but rewrite all final visible teaching content into English.'
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
    'Keep the page focused. Do not add unrelated sections or examples.',
    'Do not shorten important explanation, supporting examples, or takeaways.',
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

  log.info(`Repairing slide general structure${args.retryReason ? ' retry=1' : ''}`);

  return runSlideRepairAttempt({
    req: args.req,
    system,
    prompt,
    usageTag: 'classroom-repair-slide-general',
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
    '/api/classroom/repair-slide-general',
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
                ? 'The previous attempt still contained Chinese text. Rewrite every visible title, heading, bullet, table cell, callout, example, and summary into English while preserving the original meaning.'
                : language === 'zh-CN'
                  ? '上一版几乎没有体现教师输入的修复要求，请显式补足解释、结构变化或示例支撑'
                  : 'The previous attempt did not visibly follow the teacher instruction. Make the requested explanation, structure change, or example support explicit.',
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
          '背景',
          '定义',
          '说明',
          '重点',
          '结论',
          '示例',
          '例子',
          '步骤',
          '分析',
          '总结',
          '概念',
          'problem',
          'idea',
          'steps',
          'summary',
          'example',
          'examples',
          'analysis',
          'takeaway',
        ]);
        const sourceSupportBlocks = countSupportBlocks(sourceDocument);
        const repairedSupportBlocks = countSupportBlocks(document);

        if (
          repairedBlockCount < Math.max(2, Math.ceil(sourceBlockCount * 0.6)) ||
          repairedSignal < Math.max(40, Math.floor(sourceSignal * 0.55)) ||
          placeholderCount > 0 ||
          (sourceSupportBlocks >= 2 &&
            repairedSupportBlocks < Math.max(2, sourceSupportBlocks - 1)) ||
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
                  : '修复结果疑似删掉了关键讲解内容，已保留原页不做修改'
              : languageMismatch
                ? 'The repaired slide still contained Chinese text, so the original slide was kept'
                : instructionIgnored
                  ? repairIntent.hintsNeedAnotherPage
                    ? 'The request looked more like an add-a-page task, so the original slide was kept'
                    : 'The AI did not visibly follow your repair instruction, so the original slide was kept'
                  : 'Repair result looked destructive to the teaching content, so the original slide was kept',
          );
        }

        const repairedSceneTitle =
          parsed.sceneTitle?.trim() || document.title?.trim() || sceneTitle;
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
          profile: 'general',
          sceneTitle: repairedSceneTitle,
        });

        return apiSuccess({
          sceneTitle: repairedSceneTitle,
          assistantReply,
          content: repairedContent,
        });
      } catch (error) {
        log.error('repair-slide-general route error:', error);
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
      operationCode: 'slide_repair_general',
      chargeReason: '修复当前页面讲解',
    },
  );
}
