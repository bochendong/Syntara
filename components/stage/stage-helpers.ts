import { inferSceneContentProfile } from '@/lib/generation/content-profile';
import { resolveNotebookContentProfile, type NotebookContentProfile } from '@/lib/notebook-content';
import { getExampleDisplaySteps } from '@/lib/notebook-content/example-block';
import type { SceneOutline } from '@/lib/types/generation';
import type { Scene, SceneType, SlideContent } from '@/lib/types/stage';

export const RAW_DATA_BASE_TYPES: SceneType[] = ['slide', 'quiz', 'interactive'];

export function createRepairMessageId(role: 'user' | 'assistant') {
  return `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getDefaultRepairRequest(
  language: 'zh-CN' | 'en-US' | undefined,
  profile: NotebookContentProfile,
) {
  if (profile === 'code') {
    return language === 'en-US'
      ? 'Repair this slide with the default code-slide repair flow.'
      : '按默认代码页修复链路优化当前页。';
  }
  if (profile === 'math') {
    return language === 'en-US'
      ? 'Repair this slide with the default math-slide repair flow.'
      : '按默认数学页修复链路优化当前页。';
  }
  return language === 'en-US'
    ? 'Repair this slide with the default general-slide repair flow.'
    : '按默认通用页修复链路优化当前页。';
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectFallbackKeyPointsFromSlide(content: SlideContent): string[] {
  const semanticBlocks = content.semanticDocument?.blocks ?? [];
  const semanticPoints = semanticBlocks
    .flatMap((block) => {
      switch (block.type) {
        case 'heading':
          return [block.text];
        case 'paragraph':
          return [block.text];
        case 'bullet_list':
          return block.items;
        case 'equation':
          return [block.latex];
        case 'matrix':
          return [block.label || '', block.caption || '', ...block.rows.flat()];
        case 'derivation_steps':
          return block.steps.map((step) => step.expression);
        case 'code_block':
          return [block.caption || '', block.code];
        case 'code_walkthrough':
          return [
            block.title || '',
            block.caption || '',
            ...block.steps.map((step) => step.title || step.focus || step.explanation),
          ];
        case 'code_trace':
          return [
            block.title || '',
            ...block.steps.map((step) => step.explanation),
            block.output || '',
          ];
        case 'state_table':
          return [block.title || '', ...block.columns, ...block.rows.flat(), block.caption || ''];
        case 'call_stack':
          return [
            block.title || '',
            ...block.frames.flatMap((frame) => [
              frame.name,
              ...frame.args.flatMap((item) => [item.name, item.value]),
              ...frame.locals.flatMap((item) => [item.name, item.value]),
              frame.returnValue || '',
              frame.note || '',
            ]),
          ];
        case 'memory_diagram':
          return [
            block.title || '',
            ...block.stack.flatMap((item) => [item.name, item.value, item.ref || '']),
            ...block.heap.flatMap((item) => [item.id, item.label]),
          ];
        case 'pointer_diagram':
          return [
            block.title || '',
            block.operation || '',
            block.kind || '',
            ...block.nodes.map((node) => node.label),
            ...block.pointers.map((pointer) => `${pointer.name} -> ${pointer.to || 'None'}`),
          ];
        case 'tree_diagram':
          return [
            block.title || '',
            block.kind || '',
            block.target || '',
            block.decision || '',
            ...block.nodes.map((node) => node.label),
            block.invariant || '',
          ];
        case 'graph_trace':
          return [
            block.title || '',
            block.algorithm,
            ...block.nodes.map((node) => node.label),
            ...block.edges.map((edge) => `${edge.from} -> ${edge.to}`),
            ...block.steps.flatMap((step) => [step.title || '', step.explanation || '']),
            block.invariant || '',
          ];
        case 'invariant_panel':
          return [
            block.title || '',
            block.structure || '',
            block.invariant,
            ...block.checks.flatMap((check) => [
              check.label,
              check.text,
              check.status,
              check.reason || '',
            ]),
            block.caption || '',
          ];
        case 'dictionary_diagram':
          return [
            block.title || '',
            block.operation || '',
            block.lookupKey || '',
            block.result || '',
            ...block.entries.flatMap((entry) => [
              entry.key,
              entry.value,
              entry.note || '',
              entry.active ? 'active' : '',
              entry.changed ? 'changed' : '',
            ]),
            block.caption || '',
          ];
        case 'callout':
          return [block.title || '', block.text];
        case 'example':
          return [
            block.problem,
            ...block.givens,
            ...(block.goal ? [block.goal] : []),
            ...getExampleDisplaySteps(block),
          ];
        case 'process_flow':
          const processContext = Array.isArray(block.context) ? block.context : [];
          const processSteps = Array.isArray(block.steps) ? block.steps : [];
          return [
            block.title || '',
            ...processContext.flatMap((item) => [item.label, item.text]),
            ...processSteps.flatMap((step) => [step.title, step.detail, step.note || '']),
            ...(block.summary ? [block.summary] : []),
          ];
        default:
          return [];
      }
    })
    .map((item) => item.trim())
    .filter(Boolean);

  if (semanticPoints.length > 0) return semanticPoints.slice(0, 5);

  const canvasPoints = content.canvas.elements
    .flatMap((element) => {
      if (element.type === 'text') return [stripHtmlToText(element.content)];
      if (element.type === 'latex') return [element.latex];
      if (element.type === 'shape' && element.text?.content) {
        return [stripHtmlToText(element.text.content)];
      }
      if (element.type === 'table') {
        const rows = element.data ?? [];
        return rows.flat().map((cell) => cell.text);
      }
      return [];
    })
    .map((item) => item.trim())
    .filter(Boolean);

  return canvasPoints.slice(0, 5);
}

function buildFallbackRewriteOutline(scene: Scene, language: 'zh-CN' | 'en-US'): SceneOutline {
  const keyPoints =
    scene.type === 'slide' && scene.content.type === 'slide'
      ? collectFallbackKeyPointsFromSlide(scene.content)
      : [scene.title];
  const contentProfile =
    scene.type === 'slide' && scene.content.type === 'slide' && scene.content.semanticDocument
      ? resolveNotebookContentProfile(scene.content.semanticDocument)
      : undefined;

  return {
    id: `rewrite_${scene.id}`,
    type: scene.type === 'slide' ? 'slide' : 'slide',
    contentProfile,
    title: scene.title,
    description:
      language === 'en-US'
        ? `Rewrite this slide while keeping the same topic and teaching goal as "${scene.title}".`
        : `围绕“${scene.title}”这个主题，重写这一页，但保持原有教学目标。`,
    keyPoints: keyPoints.length > 0 ? keyPoints : [scene.title],
    order: scene.order,
    language,
  };
}

function normalizeOutlineTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function resolveRewriteOutline(
  scene: Scene,
  outlines: SceneOutline[],
  language: 'zh-CN' | 'en-US',
): SceneOutline {
  const byOrder = outlines.find((outline) => outline.order === scene.order);
  if (byOrder) return byOrder;

  const sceneTitle = normalizeOutlineTitle(scene.title);
  const byTitle = outlines.find((outline) => normalizeOutlineTitle(outline.title) === sceneTitle);
  if (byTitle) return byTitle;

  return buildFallbackRewriteOutline(scene, language);
}

export function resolveSlideRepairProfile(
  scene: Scene,
  outline?: SceneOutline,
): NotebookContentProfile {
  if (scene.type === 'slide' && scene.content.type === 'slide' && scene.content.semanticDocument) {
    return resolveNotebookContentProfile(scene.content.semanticDocument);
  }
  if (outline?.contentProfile) return outline.contentProfile;
  return outline ? inferSceneContentProfile(outline) : 'general';
}

export function repairRequestLooksMathFocused(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  return /公式|公式显示|数学公式|latex|tex|mathjax|katex|渲染公式|修公式|更正公式|符号|下标|上标|矩阵|推导|证明|同余|映射|核|像|math|formula|formulas|notation|equation|equations|render the formula|fix the formula|latex rendering|derivation|proof|matrix|subscript|superscript|kernel|image/i.test(
    normalized,
  );
}

export function inferRepairTargetLanguage(args: {
  repairInstructions: string;
  fallbackLanguage: 'zh-CN' | 'en-US';
}): 'zh-CN' | 'en-US' {
  const raw = args.repairInstructions.trim();
  if (!raw) return args.fallbackLanguage;

  const normalized = raw.toLowerCase();
  const hasAny = (patterns: RegExp[]) => patterns.some((pattern) => pattern.test(raw));
  const hasAnyNormalized = (patterns: RegExp[]) =>
    patterns.some((pattern) => pattern.test(normalized));

  const rejectChinese =
    hasAny([/不要.{0,6}(中文|汉语|汉字|简体中文)/i, /别.{0,6}(中文|汉语|汉字|简体中文)/i]) ||
    hasAnyNormalized([/\bdo not\b.{0,12}\bchinese\b/i, /\bdon't\b.{0,12}\bchinese\b/i]);
  const rejectEnglish =
    hasAny([/不要.{0,6}(英文|英语)/i, /别.{0,6}(英文|英语)/i]) ||
    hasAnyNormalized([/\bdo not\b.{0,12}\benglish\b/i, /\bdon't\b.{0,12}\benglish\b/i]);

  const wantsChinese =
    !rejectChinese &&
    (hasAny([
      /改成中文/i,
      /改为中文/i,
      /换成中文/i,
      /翻成中文/i,
      /翻译成中文/i,
      /用中文/i,
      /中文表达/i,
      /中文讲解/i,
      /简体中文/i,
      /汉语/i,
      /汉字/i,
    ]) ||
      hasAnyNormalized([
        /\btranslate\b.{0,12}\b(?:into|to)?\s*chinese\b/i,
        /\brewrite\b.{0,12}\bin\s+chinese\b/i,
        /\b(?:change|convert|make)\b.{0,12}\b(?:it\s+)?chinese\b/i,
        /\bin\s+chinese\b/i,
        /\bzh-cn\b/i,
        /\bchinese\b/i,
      ]));

  if (wantsChinese) return 'zh-CN';

  const wantsEnglish =
    !rejectEnglish &&
    (hasAny([
      /改成英文/i,
      /改为英文/i,
      /换成英文/i,
      /翻成英文/i,
      /翻译成英文/i,
      /用英文/i,
      /英文表达/i,
      /英文讲解/i,
      /英语/i,
    ]) ||
      hasAnyNormalized([
        /\btranslate\b.{0,12}\b(?:into|to)?\s*english\b/i,
        /\brewrite\b.{0,12}\bin\s+english\b/i,
        /\b(?:change|convert|make)\b.{0,12}\b(?:it\s+)?english\b/i,
        /\bin\s+english\b/i,
        /\ben-us\b/i,
        /\benglish\b/i,
      ]));

  if (wantsEnglish) return 'en-US';

  return args.fallbackLanguage;
}

export function buildRepairPendingMessage(args: {
  language: 'zh-CN' | 'en-US';
  profile: NotebookContentProfile;
}): string {
  if (args.profile === 'code') {
    return args.language === 'en-US'
      ? "I'm repairing this slide through the code-specific repair flow now."
      : '收到，我现在按代码讲解修复链路重写当前页。';
  }
  if (args.profile === 'math') {
    return args.language === 'en-US'
      ? "I'm repairing this slide through the math-specific repair flow now."
      : '收到，我现在按数学修复链路重写当前页。';
  }
  return args.language === 'en-US'
    ? "I'm repairing this slide through the general slide-repair flow now."
    : '收到，我现在按通用页修复链路重写当前页。';
}

export function buildRepairAssistantReply(args: {
  language: 'zh-CN' | 'en-US';
  profile: NotebookContentProfile;
  rewriteReason: string;
  outlineTitle: string;
}): string {
  const flowLabel =
    args.profile === 'code'
      ? args.language === 'en-US'
        ? 'the code-specific repair flow'
        : '代码页修复链路'
      : args.profile === 'math'
        ? args.language === 'en-US'
          ? 'the math-specific repair flow'
          : '数学页修复链路'
        : args.language === 'en-US'
          ? 'the general slide-repair flow'
          : '通用页修复链路';

  if (args.language === 'en-US') {
    return args.rewriteReason.trim()
      ? `I repaired this slide through ${flowLabel} and used your instruction to steer the new structure and emphasis around "${args.outlineTitle}".`
      : `I repaired this slide through ${flowLabel} and regenerated a clearer version around "${args.outlineTitle}".`;
  }

  return args.rewriteReason.trim()
    ? `我已经按${flowLabel}修了这一页，并把你给的要求真正带进了“${args.outlineTitle}”这一页的新结构和重点里。`
    : `我已经按${flowLabel}修了这一页，重新整理出了一版围绕“${args.outlineTitle}”的更清楚页面。`;
}

export function sceneTypeTabLabel(tr: (key: string) => string, type: SceneType): string {
  const key = `stage.sceneType.${type}`;
  const label = tr(key);
  return label === key ? type : label;
}

export function serializeSceneForRawView(
  scene: Scene,
  options?: { expandSlideCanvas?: boolean },
): unknown {
  if (scene.content.type === 'slide' && !options?.expandSlideCanvas) {
    const canvas = scene.content.canvas;
    const elements = canvas.elements ?? [];
    const elementTypeCounts: Record<string, number> = {};
    for (const el of elements) {
      const k = el.type;
      elementTypeCounts[k] = (elementTypeCounts[k] || 0) + 1;
    }
    return {
      id: scene.id,
      stageId: scene.stageId,
      type: scene.type,
      title: scene.title,
      order: scene.order,
      actions: scene.actions,
      whiteboards: scene.whiteboards,
      multiAgent: scene.multiAgent,
      createdAt: scene.createdAt,
      updatedAt: scene.updatedAt,
      content: {
        type: 'slide' as const,
        canvas: {
          _collapsed: true,
          _note:
            'Canvas omitted for size; summary below. Full slide data remains in classroom storage.',
          id: canvas.id,
          viewportSize: canvas.viewportSize,
          viewportRatio: canvas.viewportRatio,
          elementCount: elements.length,
          elementTypeCounts,
        },
      },
    };
  }
  return scene;
}
