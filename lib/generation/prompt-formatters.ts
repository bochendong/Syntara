/**
 * Prompt and context building utilities for the generation pipeline.
 */

import type { PdfImage, SceneOutline } from '@/lib/types/generation';
import { formatContentProfileForPrompt, formatSceneArchetypeForPrompt } from './content-profile';
import type {
  AgentInfo,
  SceneGenerationContext,
  CoursePersonalizationContext,
} from './pipeline-types';

/** Build a course context string for injection into action prompts */
export function buildCourseContext(ctx?: SceneGenerationContext): string {
  if (!ctx) return '';

  const lines: string[] = [];

  // Course outline with position marker
  lines.push('Course Outline:');
  ctx.allTitles.forEach((t, i) => {
    const marker = i === ctx.pageIndex - 1 ? ' ← current' : '';
    lines.push(`  ${i + 1}. ${t}${marker}`);
  });

  // Position information
  lines.push('');
  lines.push(
    'IMPORTANT: All pages belong to the SAME class session. Do NOT greet again after the first page. When referencing content from earlier pages, say "we just covered" or "as mentioned on page N" — NEVER say "last class" or "previous session" because there is no previous session.',
  );
  lines.push('');
  if (ctx.pageIndex === 1) {
    lines.push('Position: This is the FIRST page. Open with a greeting and course introduction.');
  } else if (ctx.pageIndex === ctx.totalPages) {
    lines.push('Position: This is the LAST page. Conclude the course with a summary and closing.');
    lines.push(
      'Transition: Continue naturally from the previous page. Do NOT greet or re-introduce.',
    );
  } else {
    lines.push(`Position: Page ${ctx.pageIndex} of ${ctx.totalPages} (middle of the course).`);
    lines.push(
      'Transition: Continue naturally from the previous page. Do NOT greet or re-introduce.',
    );
  }

  // Previous page speech for transition reference
  if (ctx.previousSpeeches.length > 0) {
    lines.push('');
    lines.push('Previous page speech (for transition reference):');
    const lastSpeech = ctx.previousSpeeches[ctx.previousSpeeches.length - 1];
    lines.push(`  "...${lastSpeech.slice(-150)}"`);
  }

  return lines.join('\n');
}

/** Format agent list for injection into action prompts */
export function formatAgentsForPrompt(agents?: AgentInfo[]): string {
  if (!agents || agents.length === 0) return '';

  const lines = ['Classroom Agents:'];
  for (const a of agents) {
    const personaPart = a.persona ? ` — ${a.persona}` : '';
    lines.push(`- id: "${a.id}", name: "${a.name}", role: ${a.role}${personaPart}`);
  }
  return lines.join('\n');
}

/** Extract the teacher agent's persona for injection into outline/content prompts */
export function formatTeacherPersonaForPrompt(
  agents?: AgentInfo[],
  language: 'zh-CN' | 'en-US' = 'zh-CN',
): string {
  if (!agents || agents.length === 0) return '';

  const teacher = agents.find((a) => a.role === 'teacher');
  if (!teacher?.persona) return '';

  const languageGuard =
    language === 'zh-CN'
      ? '即使教师 persona 使用其他语言，最终生成内容也必须严格使用当前场景语言。'
      : 'Even if the teacher persona is written in another language, the final generated content must still use the declared scene language only.';

  return `Teacher Persona:\nName: ${teacher.name}\n${teacher.persona}\n\nAdapt the content style and tone to match this teacher's personality. IMPORTANT: The teacher's name and identity must NOT appear on the slides — no "Teacher ${teacher.name}'s tips", no "Teacher's message", etc. Slides should read as neutral, professional visual aids. ${languageGuard}`;
}

/** Format course-level personalization hints for content/action generation prompts */
export function formatCoursePersonalizationForPrompt(
  ctx?: CoursePersonalizationContext,
  language: 'zh-CN' | 'en-US' = 'zh-CN',
): string {
  if (!ctx) return '';
  const tags = (ctx.tags || []).filter(Boolean).join(', ');
  if (language === 'zh-CN') {
    return [
      '课程个性化上下文：',
      `- 课程名: ${ctx.name || ''}`,
      `- 课程描述: ${ctx.description || ''}`,
      `- 课程标签: ${tags || ''}`,
      `- 用途: ${ctx.purpose || ''}`,
      `- 学校: ${ctx.university || ''}`,
      `- 课程代码: ${ctx.courseCode || ''}`,
      `- 课程语言: ${ctx.language || ''}`,
      '- 请以此调整术语、示例场景、难度和表达风格；不得偏离当前场景主题。',
    ].join('\n');
  }
  return [
    'Course personalization context:',
    `- courseName: ${ctx.name || ''}`,
    `- courseDescription: ${ctx.description || ''}`,
    `- courseTags: ${tags || ''}`,
    `- purpose: ${ctx.purpose || ''}`,
    `- university: ${ctx.university || ''}`,
    `- courseCode: ${ctx.courseCode || ''}`,
    `- courseLanguage: ${ctx.language || ''}`,
    '- Use this to tune terminology, examples, difficulty, and tone while staying on-scene.',
  ].join('\n');
}

/** Format user-provided rewrite guidance for slide regeneration prompts */
export function formatSlideRewriteContext(
  rewriteReason?: string,
  language: 'zh-CN' | 'en-US' = 'zh-CN',
): string {
  const reason = rewriteReason?.trim();
  if (!reason) return '';

  if (language === 'zh-CN') {
    return [
      '重写当前页的额外要求：',
      `- 用户说明为什么这一页需要重写：${reason}`,
      '- 这次不是微调旧页，而是基于同一页主题重新生成整页内容与版式。',
      '- 必须保留当前页所属主题与教学目标，但要明显体现用户这条重写原因。',
      '- 如果用户提到“讲清楚一点 / 补推导 / 改结构 / 保留主题但换讲法”，请把它当成硬约束。',
    ].join('\n');
  }

  return [
    'Additional rewrite guidance for this slide:',
    `- The user explained why this slide should be rewritten: ${reason}`,
    '- This is a full rewrite of the current slide, not a light repair of the old layout.',
    '- Keep the same topic and teaching goal, but make the rewrite visibly reflect the user reason.',
    '- Treat requests like clearer reasoning, stronger structure, or a different presentation approach as hard constraints.',
  ].join('\n');
}

export function formatSceneContentProfileContext(
  outline: SceneOutline,
  language: 'zh-CN' | 'en-US' = 'zh-CN',
): string {
  return formatContentProfileForPrompt(outline.contentProfile || 'general', language);
}

export function formatSceneArchetypeContext(
  outline: SceneOutline,
  language: 'zh-CN' | 'en-US' = 'zh-CN',
): string {
  return formatSceneArchetypeForPrompt(outline.archetype || 'concept', language);
}

/** Format worked-example metadata for slide/content/action prompts */
export function formatWorkedExampleForPrompt(
  cfg?: SceneOutline['workedExampleConfig'],
  language: 'zh-CN' | 'en-US' = 'zh-CN',
): string {
  if (!cfg) return '';

  const lines: string[] = [
    language === 'zh-CN' ? '例题讲解上下文：' : 'Worked Example Context:',
    `${language === 'zh-CN' ? '- 题型' : '- kind'}: ${cfg.kind}`,
    `${language === 'zh-CN' ? '- 当前页角色' : '- stageRole'}: ${cfg.role}`,
    language === 'zh-CN'
      ? '- 公式保真：不要改写题目中的函数/常数/集合；分式和倒数函数必须使用完整 LaTeX，每一步函数求值都要保留自变量，例如 $f(2)=\\frac{1}{1+2^2}$。'
      : '- Formula fidelity: do not rewrite the given function/constants/sets; fractions and reciprocal functions must use full LaTeX, and every function evaluation must keep its argument, e.g. $f(2)=\\frac{1}{1+2^2}$.',
  ];

  if (cfg.exampleId) {
    lines.push(`${language === 'zh-CN' ? '- 例题序列 ID' : '- exampleId'}: ${cfg.exampleId}`);
  }
  if (cfg.partNumber && cfg.totalParts) {
    lines.push(
      `${language === 'zh-CN' ? '- 分页' : '- pagination'}: ${cfg.partNumber}/${cfg.totalParts}`,
    );
  }
  if (cfg.problemStatement?.trim()) {
    lines.push(
      `${language === 'zh-CN' ? '- 题目内容' : '- problemStatement'}:\n${cfg.problemStatement.trim()}`,
    );
  }
  if (cfg.givens?.length) {
    lines.push(
      `${language === 'zh-CN' ? '- 已知' : '- givens'}:\n${cfg.givens.map((item) => `  - ${item}`).join('\n')}`,
    );
  }
  if (cfg.asks?.length) {
    lines.push(
      `${language === 'zh-CN' ? '- 所求 / 任务' : '- asks'}:\n${cfg.asks.map((item) => `  - ${item}`).join('\n')}`,
    );
  }
  if (cfg.constraints?.length) {
    lines.push(
      `${language === 'zh-CN' ? '- 约束 / 条件' : '- constraints'}:\n${cfg.constraints.map((item) => `  - ${item}`).join('\n')}`,
    );
  }
  if (cfg.solutionPlan?.length) {
    lines.push(
      `${language === 'zh-CN' ? '- 解题思路' : '- solutionPlan'}:\n${cfg.solutionPlan.map((item) => `  - ${item}`).join('\n')}`,
    );
  }
  if (cfg.walkthroughSteps?.length) {
    lines.push(
      `${language === 'zh-CN' ? '- 分步讲解' : '- walkthroughSteps'}:\n${cfg.walkthroughSteps.map((item) => `  - ${item}`).join('\n')}`,
    );
  }
  if (cfg.commonPitfalls?.length) {
    lines.push(
      `${language === 'zh-CN' ? '- 易错点' : '- commonPitfalls'}:\n${cfg.commonPitfalls.map((item) => `  - ${item}`).join('\n')}`,
    );
  }
  if (cfg.finalAnswer?.trim()) {
    lines.push(
      `${language === 'zh-CN' ? '- 结论 / 答案' : '- finalAnswer'}: ${cfg.finalAnswer.trim()}`,
    );
  }
  if (cfg.codeSnippet?.trim()) {
    lines.push(
      `${language === 'zh-CN' ? '- 代码片段' : '- codeSnippet'}:\n\`\`\`\n${cfg.codeSnippet.trim()}\n\`\`\``,
    );
  }

  return lines.join('\n');
}

/**
 * Format a single PdfImage description for prompt inclusion.
 * Includes dimension/aspect-ratio info when available.
 */
export function formatImageDescription(img: PdfImage, language: string): string {
  let dimInfo = '';
  if (img.width && img.height) {
    const ratio = (img.width / img.height).toFixed(2);
    dimInfo =
      language === 'zh-CN'
        ? ` | 尺寸: ${img.width}×${img.height} (宽高比${ratio})`
        : ` | size: ${img.width}×${img.height} (aspect ratio ${ratio})`;
  }
  const desc = img.description ? ` | ${img.description}` : '';
  return language === 'zh-CN'
    ? `- **${img.id}**: 来自PDF第${img.pageNumber}页${dimInfo}${desc}`
    : `- **${img.id}**: from PDF page ${img.pageNumber}${dimInfo}${desc}`;
}

/**
 * Format a short image placeholder for vision mode.
 * Only ID + page + dimensions + aspect ratio (no description), since the model can see the actual image.
 */
export function formatImagePlaceholder(img: PdfImage, language: string): string {
  let dimInfo = '';
  if (img.width && img.height) {
    const ratio = (img.width / img.height).toFixed(2);
    dimInfo =
      language === 'zh-CN'
        ? ` | 尺寸: ${img.width}×${img.height} (宽高比${ratio})`
        : ` | size: ${img.width}×${img.height} (aspect ratio ${ratio})`;
  }
  return language === 'zh-CN'
    ? `- **${img.id}**: PDF第${img.pageNumber}页的图片${dimInfo} [参见附图]`
    : `- **${img.id}**: image from PDF page ${img.pageNumber}${dimInfo} [see attached]`;
}

/**
 * Build a multimodal user content array for the AI SDK.
 * Interleaves text and images so the model can associate img_id with actual image.
 * Each image label includes dimensions when available so the model knows the size
 * before seeing the image (important for layout decisions).
 */
export function buildVisionUserContent(
  userPrompt: string,
  images: Array<{ id: string; src: string; width?: number; height?: number }>,
  language: 'zh-CN' | 'en-US' = 'zh-CN',
): Array<{ type: 'text'; text: string } | { type: 'image'; image: string; mimeType?: string }> {
  const parts: Array<
    { type: 'text'; text: string } | { type: 'image'; image: string; mimeType?: string }
  > = [{ type: 'text', text: userPrompt }];
  if (images.length > 0) {
    parts.push({
      type: 'text',
      text: language === 'zh-CN' ? '\n\n--- 附图 ---' : '\n\n--- Attached Images ---',
    });
    for (const img of images) {
      let dimInfo = '';
      if (img.width && img.height) {
        const ratio = (img.width / img.height).toFixed(2);
        dimInfo =
          language === 'zh-CN'
            ? ` (${img.width}×${img.height}, 宽高比${ratio})`
            : ` (${img.width}×${img.height}, aspect ratio ${ratio})`;
      }
      parts.push({ type: 'text', text: `\n**${img.id}**${dimInfo}:` });
      // Strip data URI prefix — AI SDK only accepts http(s) URLs or raw base64
      const dataUriMatch = img.src.match(/^data:([^;]+);base64,(.+)$/);
      if (dataUriMatch) {
        parts.push({
          type: 'image',
          image: dataUriMatch[2],
          mimeType: dataUriMatch[1],
        });
      } else {
        parts.push({ type: 'image', image: img.src });
      }
    }
  }
  return parts;
}
