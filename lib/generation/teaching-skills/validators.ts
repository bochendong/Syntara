import type { NotebookContentDocument } from '@/lib/notebook-content';
import type { TeachingPagePlan } from '@/lib/generation/teaching-plan/types';
import type { SelectedTeachingSkills } from './types';

function collectStrings(value: unknown, depth = 0): string[] {
  if (depth > 6) return [];
  if (typeof value === 'string') return [sanitizeStudentFacingText(value)];
  if (Array.isArray(value)) return value.flatMap((item) => collectStrings(item, depth + 1));
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap((item) => collectStrings(item, depth + 1));
}

function sanitizeStudentFacingText(value: string): string {
  return value
    .replace(/\\(?:text|textbf|textit|emph|alert)\{([^{}]*)\}/g, '$1')
    .replace(
      /\\+(?:bullet|heading|callout|summary|warning|question|text|example|card|step)\b\s*/gi,
      '',
    )
    .replace(
      /(^|[\s\n\r])(?:bullet|heading|callout|summary|warning|question|text|example|card|step|begin|end)\s+(?=[\u4e00-\u9fff`])/gi,
      '$1',
    )
    .replace(/\\+(?:begin|end)\{[^{}]*\}/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactSignature(value: string): string {
  return value
    .replace(/\s+/g, '')
    .replace(/[。.!！?？,，;；:：]/g, '')
    .toLowerCase();
}

function hasMathThinkingMove(text: string): boolean {
  return /证明|推导|检查|验证|条件|定义|已知|目标|推出|反例|存在性|唯一性|prove|derive|check|condition|definition|given|goal/i.test(
    text,
  );
}

export function validateSemanticWithTeachingSkills(args: {
  document: NotebookContentDocument;
  pagePlan?: TeachingPagePlan;
  selection?: SelectedTeachingSkills;
}): string[] {
  const text = collectStrings(args.document).join('\n');
  const reasons: string[] = [];

  if (/\[Table\]|\[Chart\]|\[Formula\]/i.test(text)) {
    reasons.push('teaching skill violation: placeholder label leaked');
  }
  if (/\\texttt\{|\\endrows|\\endslide|<\/?beginrow/i.test(text)) {
    reasons.push('teaching skill violation: raw latex/markup leaked into student-facing text');
  }
  if (/CSC148\s+OOP\s+prompt|csc148-oop/i.test(text)) {
    reasons.push('teaching skill violation: course-specific prompt leaked');
  }
  if (/本页用于|引出面向对象编程的动机|建立本课主线|学习者将|教学目标/i.test(text)) {
    reasons.push('teaching skill violation: lesson-plan voice leaked');
  }

  const blocks = args.document.blocks || [];
  const blockTypes = new Set(blocks.map((block) => block.type));
  const firstTwoTexts = blocks
    .slice(0, 2)
    .map((block) => compactSignature(collectStrings(block).join(' ')))
    .filter((item) => item.length > 24);
  if (firstTwoTexts.length === 2 && firstTwoTexts[0] === firstTwoTexts[1]) {
    reasons.push('teaching skill violation: duplicated opening/problem block');
  }

  const requiredSkillIds = args.pagePlan?.selectedSkillIds || args.selection?.skillIds || [];
  if (requiredSkillIds.includes('topic.oop.object-model')) {
    const sourceTerms = (args.selection?.sourceFacts || [])
      .flatMap((fact) => [
        fact.label,
        ...Array.from(fact.text.matchAll(/\b[A-Z][A-Za-z_][A-Za-z0-9_]{2,}\b/g)).map(
          (match) => match[0],
        ),
      ])
      .filter((term, index, terms) => term.length > 2 && terms.indexOf(term) === index);
    const hasConcreteObject =
      /class|__init__|self|object|对象|实例|属性|方法|类/i.test(text) ||
      sourceTerms.some((term) => text.includes(term));
    if (!hasConcreteObject) {
      reasons.push('teaching skill violation: OOP page lacks a concrete object/model anchor');
    }
  }

  if (requiredSkillIds.includes('pedagogy.problem-solving')) {
    const thinkingMove = args.pagePlan?.studentThinkingMove;
    const isMathPage =
      args.pagePlan?.disciplineStyle === 'math' || requiredSkillIds.includes('discipline.math');
    if (thinkingMove) {
      const signature = compactSignature(thinkingMove).slice(0, 18);
      if (
        signature.length > 8 &&
        !compactSignature(text).includes(signature) &&
        !(isMathPage && hasMathThinkingMove(text))
      ) {
        reasons.push('teaching skill violation: missing transferable student thinking move');
      }
    }
  }

  const role = args.pagePlan?.role;
  const asksForStateTrace =
    role === 'state_trace' ||
    role === 'strategy_trace' ||
    args.pagePlan?.requiredComponentKinds?.some((kind) =>
      ['trace', 'statetable', 'callstack', 'memory', 'graph_trace'].includes(kind),
    );
  if (asksForStateTrace) {
    const hasStateComponent =
      blockTypes.has('code_trace') ||
      blockTypes.has('state_table') ||
      blockTypes.has('call_stack') ||
      blockTypes.has('memory_diagram') ||
      blockTypes.has('graph_trace');
    if (!hasStateComponent) {
      reasons.push(
        'teaching skill violation: state-trace page needs trace/state/memory, not code alone',
      );
    }
  }

  for (const block of blocks) {
    if (block.type !== 'memory_diagram') continue;
    const stepHeapCount = block.steps.reduce((sum, step) => sum + step.heap.length, 0);
    const stepNameCount = block.steps.reduce(
      (sum, step) => sum + step.frames.length + step.stack.length,
      0,
    );
    const hasNames = block.frames.length + block.stack.length + stepNameCount > 0;
    const hasHeap = block.heap.length + stepHeapCount > 0;
    if (hasNames && !hasHeap) {
      reasons.push('teaching skill violation: memory diagram needs heap objects as well as names');
    }
  }

  return reasons;
}
